"""Teste de cena dos carros: um cruzamento (3 × 3 quadras: cruzamento no meio, quatro lotes nos cantos) com ruas e
calçadas (GLB de ruas e pisos), prédios regulares nos lotes de trás e os veículos nas faixas (mão brasileira) e nas
calçadas. Renderiza de dia e de noite.

Uso: MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/carros_cena.py -- SP/cidade_out [dia|noite] [perto]
Grava SP/cidade_out/carros/teste_cena_dia.png e teste_cena_noite.png (e teste_cena_perto_*.png com "perto").
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Vector  # noqa: E402

import moveis_base as mb  # noqa: E402

V = Vector
Q = 15.0
SAIDA = ""
F = 1.8  # meio da faixa (a rua tem 2 faixas de 3,65 m)


def importa(cat, id_, x, y, giro=0.0, z=0.0):
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(SAIDA, cat, "glb", id_ + ".glb"))
    novos = [o for o in bpy.data.objects if o not in antes]
    raiz = [o for o in novos if o.parent is None][0]
    raiz.location = (x, y, z)
    raiz.rotation_mode = "XYZ"
    raiz.rotation_euler = (raiz.rotation_euler.x, raiz.rotation_euler.y, math.radians(giro))
    for o in novos:
        if o.get("colisao"):
            o.hide_render = True
    bpy.context.view_layer.update()
    return raiz, novos


def monta():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    importa("ruas", "rua_cruzamento_x_faixas", 0, 0)
    importa("ruas", "rua_reta_faixa_pedestres", 0, -Q)
    importa("ruas", "rua_reta", 0, Q)
    importa("ruas", "rua_reta", -Q, 0, 90)
    importa("ruas", "rua_reta", Q, 0, 90)
    for x in (-Q, Q):
        for y in (-Q, Q):
            importa("pisos", "piso_praca" if (x, y) == (-Q, -Q) else "piso_calcada_lisa", x, y)
    importa("predios_regulares", "loja_esquina_cafe", -Q, Q)
    importa("predios_regulares", "lojas_2andares_flores", Q, Q)
    importa("predios_regulares", "mercadinho", Q, -Q, 180)
    C = "carros"
    # rua norte-sul: quem desce (para −Y) anda em x < 0; quem sobe (giro 180) em x > 0
    importa(C, "taxi", -F, 10.5)
    importa(C, "sedan_luxo_preto", -F, 18.5)
    importa(C, "minivan_roxa_6_rodas", F, 13.0, 180)
    importa(C, "viatura_policia", -F, -10.5)
    importa(C, "picape_verde_motor", F, -11.0, 180)
    importa(C, "van_pacote", F, -18.5, 180)
    importa(C, "compacto_amarelo", -F, -18.5)
    # rua leste-oeste: para +X (giro 90) em y < 0; para −X (giro −90) em y > 0
    importa(C, "esportivo_conversivel_vermelho", 11.0, -F, 90)
    importa(C, "suv_roxo", 12.0, F, -90)
    importa(C, "futurista_bolha_branco", 18.5, -F, 90)
    importa(C, "picape_vermelha", -11.5, F, -90)
    importa(C, "carrinho_redondo_laranja", -12.0, -F, 90)
    importa(C, "car_13_pacote", -18.5, F, -90)
    # no cruzamento, atravessando
    importa(C, "cupe_verde_agua", -F, 1.0)
    # motos e bicicleta junto ao meio-fio; carrinho de bebê e skate na calçada
    importa(C, "moto_vermelha", 3.0, 18.0, 180)
    importa(C, "scooter_turquesa", -3.0, -14.5)
    importa(C, "bicicleta_amarela", 5.4, -10.0, 180)
    importa(C, "carrinho_bebe_rosa", -5.6, -9.5)
    importa(C, "skate_laranja", -5.2, -12.0, 20)
    importa(C, "kart_antena", -Q + 2.0, -Q + 3.5, 60)


def render(arquivo, noite=False, res=(1800, 1300), amostras=36, perto=False):
    scn = bpy.context.scene
    scn.render.engine = "CYCLES"
    scn.cycles.samples = int(os.environ.get("AMOSTRAS", amostras))
    scn.cycles.use_denoising = True
    scn.render.threads_mode = "FIXED"
    scn.render.threads = int(os.environ.get("MOVEIS_THREADS", "1"))
    scn.render.resolution_x, scn.render.resolution_y = res
    scn.view_settings.view_transform = "Standard"
    w = bpy.data.worlds.new("w")
    scn.world = w
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (*mb._lin("#1B2A4A" if noite else "#9DB4D9"), 1)
    w.node_tree.nodes["Background"].inputs[1].default_value = 0.35 if noite else 0.6
    mb.emissao_janelas(mb.JANELA_FORCA * 1.4 if noite else 0.0)
    chao = bpy.data.meshes.new("chao")
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=400)
    bm.to_mesh(chao)
    bm.free()
    m = bpy.data.materials.new("chao_vitrine")
    m.use_nodes = True
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*mb._lin("#141E36" if noite else
                                                                                      "#2A3D63"), 1)
    chao.materials.append(m)
    ob = bpy.data.objects.new("chao", chao)
    scn.collection.objects.link(ob)
    ob.location = (0, 0, -0.42)
    ld = bpy.data.lights.new("sol", "SUN")
    ld.energy = 0.45 if noite else 3.0
    if noite:
        ld.color = (0.6, 0.7, 1.0)
    ld.angle = math.radians(6)
    sol = bpy.data.objects.new("sol", ld)
    scn.collection.objects.link(sol)
    sol.rotation_euler = (math.radians(42), 0, math.radians(-38))
    cd = bpy.data.cameras.new("c")
    cd.type = "ORTHO"
    cam = bpy.data.objects.new("c", cd)
    scn.collection.objects.link(cam)
    scn.camera = cam
    if perto:
        lo, hi = V((-9, -22, 0)), V((9, 4, 3))
        pts = [V((x, y, z)) for x in (lo.x, hi.x) for y in (lo.y, hi.y) for z in (lo.z, hi.z)]
    else:
        pts = [o.matrix_world @ V(c) for o in scn.objects if o.type == "MESH" and o.name != "chao" and
               not o.hide_render for c in o.bound_box]
        pts = [p for p in pts if p.z < 14] + [V((0, 0, 14))]
    lo = V([min(p[i] for p in pts) for i in range(3)])
    hi = V([max(p[i] for p in pts) for i in range(3)])
    c = (lo + hi) / 2
    d = V((0.55, -1.0, 0.8)).normalized()
    cam.location = c + d * 200
    cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler()
    R = cam.rotation_euler.to_matrix().inverted()
    proj = [R @ (p - c) for p in pts]
    ex = max(q.x for q in proj) - min(q.x for q in proj)
    ey = max(q.y for q in proj) - min(q.y for q in proj)
    cd.ortho_scale = max(ex, ey * res[0] / res[1]) * 1.03
    cam.location += cam.matrix_world.to_3x3() @ V(((max(q.x for q in proj) + min(q.x for q in proj)) / 2,
                                                   (max(q.y for q in proj) + min(q.y for q in proj)) / 2, 0))
    cd.clip_end = 600
    scn.render.image_settings.file_format = "PNG"
    scn.render.filepath = arquivo
    bpy.ops.render.render(write_still=True)
    print("render", arquivo, flush=True)


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:]
    SAIDA = args[0]
    modos = [a for a in args[1:] if a in ("dia", "noite")] or ["dia", "noite"]
    perto = "perto" in args
    for modo in modos:
        monta()
        nome = f"teste_cena_perto_{modo}.png" if perto else f"teste_cena_{modo}.png"
        render(os.path.join(SAIDA, "carros", nome), noite=(modo == "noite"), perto=perto)
