"""Renders com fundo transparente dos modelos 3D da Ilha, para as animações de conceito da Ilha do Farol.

    <blender-venv>/python ilha-render-modelos.py <pasta dos glb> <pasta de saída>

O bpy 5.2.3 desta máquina está em ~/projects/artes-3d-sp/blender-venv. Os GLB saem da biblioteca de modelos dos
cursos: cada packages/studio/src/core/course-models/m-<sha>.generated.ts do Sistema Zero tem o arquivo em base64
(o sha está em docs/design/ilha-do-farol-blender/modelos.json).

Cada modelo entra sozinho, com a luz da capa do Passo a passo (docs/design/ilha-do-farol-blender/capa.py)
e uma câmera de frente, um pouco do alto, como no jogo. O aventureiro sai em quatro quadros do clipe
"andando" (andando-1 a andando-4) e no "parado"; o farol listrado sai apagado (sem clipe); as pedras, sozinhas.

Para a Aula 2 (a chave): a chave dourada na mesma câmera e na mesma escala do aventureiro (chave.png, 600 x 600,
mesma medida por pixel do aventureiro-parado, para as duas figuras irem juntas sem reescalar), e a vista de cima
do aventureiro e da chave (aventureiro-de-cima.png e chave-de-cima.png, 600 x 600, câmera reta de cima, a mesma
medida por pixel nas duas): a experiência da Parte 3, em que de cima a chave parece estar sobre o personagem.
"""
import math
import os
import struct
import sys

import bpy
from mathutils import Vector

GLB, SAIDA = sys.argv[-2], sys.argv[-1]
os.makedirs(SAIDA, exist_ok=True)


def limpar():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def importar(nome):
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(GLB, f"{nome}.glb"))
    return [o for o in bpy.data.objects if o not in antes]


def clipe(objs, nome):
    """Só o clipe pedido tocando (None: nenhum, a pose de repouso). Devolve o intervalo de quadros."""
    faixa = None
    for o in objs:
        ad = o.animation_data
        if not ad:
            continue
        for t in ad.nla_tracks:
            t.mute = t.name != nome
            if t.name == nome and t.strips:
                s = t.strips[0]
                faixa = (int(s.frame_start), int(s.frame_end))
        ad.action = None
    return faixa


def caixa(objs):
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for o in objs if o.type == "MESH" for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def luz_e_camera(lo, hi, w, h, escala=None, de_cima=False):
    """Luz da capa e câmera ortográfica. escala fixa a medida da câmera (a mesma medida por pixel de outro render);
    de_cima põe a câmera reta de cima. Devolve a escala usada."""
    sc = bpy.context.scene
    mundo = bpy.data.worlds.new("ceu")
    mundo.use_nodes = True
    fundo = mundo.node_tree.nodes["Background"]
    fundo.inputs["Color"].default_value = (1, 1, 1, 1)
    fundo.inputs["Strength"].default_value = 0.75
    sc.world = mundo
    sol = bpy.data.lights.new("sol", "SUN")
    sol.energy = 3.6
    sol.angle = math.radians(8)
    lampada = bpy.data.objects.new("sol", sol)
    lampada.rotation_euler = (math.radians(48), math.radians(-12), math.radians(-35))
    sc.collection.objects.link(lampada)
    # Ortográfica, de frente e 22° do alto: o tamanho na tela não depende da distância.
    cam = bpy.data.cameras.new("camera")
    cam.type = "ORTHO"
    centro = (lo + hi) / 2
    altura = hi.z - lo.z
    largura = max(hi.x - lo.x, hi.y - lo.y)
    cam.ortho_scale = escala or max(altura * 1.35 * w / h, largura * 1.35) * max(1, h / w)
    camera = bpy.data.objects.new("camera", cam)
    sc.collection.objects.link(camera)
    ang = math.radians(89.9 if de_cima else 22)
    dist = 40
    camera.location = centro + Vector((0, -math.cos(ang) * dist, math.sin(ang) * dist))
    camera.rotation_euler = (centro - camera.location).to_track_quat("-Z", "Y").to_euler()
    sc.camera = camera
    sc.render.resolution_x, sc.render.resolution_y = w, h
    sc.render.resolution_percentage = 100
    sc.render.engine = "BLENDER_EEVEE"
    sc.render.film_transparent = True
    sc.view_settings.view_transform = "Standard"
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    return cam.ortho_scale


def png_limpo(caminho):
    """Só os pedaços que o EdiSVG aceita num PNG embutido (o do Blender traz tEXt, eXIf, pHYs, oFFs e cHRM)."""
    aceitos = {b"IHDR", b"PLTE", b"IDAT", b"IEND", b"tRNS", b"sRGB", b"gAMA"}
    dados = open(caminho, "rb").read()
    partes, i = [dados[:8]], 8
    while i < len(dados):
        n, tipo = struct.unpack(">I4s", dados[i:i + 8])
        if tipo in aceitos:
            partes.append(dados[i:i + 12 + n])
        i += 12 + n
    open(caminho, "wb").write(b"".join(partes))


def render(arq, quadro=1):
    sc = bpy.context.scene
    sc.frame_set(quadro)
    sc.render.filepath = os.path.join(SAIDA, f"{arq}.png")
    bpy.ops.render.render(write_still=True)
    png_limpo(sc.render.filepath)
    print("render", arq, "quadro", quadro)


# Aventureiro: parado e quatro quadros do passo.
limpar()
objs = importar("aventureiro")
faixa = clipe(objs, "andando")
lo, hi = caixa(objs)
ESCALA_AVENTUREIRO = luz_e_camera(lo, hi, 600, 800)
if faixa:
    a, b = faixa
    for k in range(4):
        render(f"aventureiro-andando-{k + 1}", a + round((b - a) * k / 4))
clipe(objs, "parado")
render("aventureiro-parado", 1)

# Farol listrado, apagado (pose de repouso, sem clipe).
limpar()
objs = importar("farol-listrado")
clipe(objs, None)
lo, hi = caixa(objs)
luz_e_camera(lo, hi, 520, 1000)
render("farol-listrado", 1)

# As pedras da ilha (a que esconde a chave no jogo), sem a chave.
limpar()
objs = importar("pedras")
clipe(objs, None)
lo, hi = caixa(objs)
luz_e_camera(lo, hi, 800, 600)
render("pedras", 1)

# Aula 2: a chave dourada na escala do aventureiro (a câmera de 600 x 800 tem a medida de ESCALA_AVENTUREIRO na
# altura; num quadro de 600 x 600, a mesma medida por pixel é 0,75 dela).
limpar()
objs = importar("chave-dourada")
lo, hi = caixa(objs)
luz_e_camera(lo, hi, 600, 600, escala=ESCALA_AVENTUREIRO * 0.75)
render("chave", 1)

# Aula 2: de cima, o aventureiro parado e a chave, na mesma medida por pixel (2,2 unidades em 600 px).
limpar()
objs = importar("aventureiro")
clipe(objs, "parado")
lo, hi = caixa(objs)
luz_e_camera(lo, hi, 600, 600, escala=2.2, de_cima=True)
render("aventureiro-de-cima", 1)
limpar()
objs = importar("chave-dourada")
lo, hi = caixa(objs)
luz_e_camera(lo, hi, 600, 600, escala=2.2, de_cima=True)
render("chave-de-cima", 1)
