"""Teste de cena da categoria props_esporte: um complexo esportivo de 3 × 3 quadras com o anel de ruas em volta
(5 × 5 quadras, 75 × 75 m).

  fileira norte:  campo de futebol (2 × 1) com traves, placar e torres; quadra de basquete com duas tabelas
  fileira meio:   arquibancadas, bancos de reservas e bicicletário | praça de academia e mesas | vôlei de areia
  fileira sul:    quadra de tênis de saibro (2 × 1) | pista de skate (half-pipe e obstáculos)

Usa as peças de props_esporte com as ruas (ruas), os pisos (pisos), árvores (vegetacao) e bancos, postes e lixeiras
(mobiliario_urbano). À noite, além das lentes acesas, a cena põe um holofote (luz do Blender, só no teste) em cada
torre, apontado para a quadra, para ver o efeito dos refletores.

Uso: MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/props_esporte_cena.py -- SP/cidade_out [dia|noite] [--perto]
Grava SP/cidade_out/props_esporte/teste_cena_dia.png e teste_cena_noite.png (e teste_cena_perto_*.png com --perto).
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
N = 5
PE = "props_esporte"


def centro(i, j, nx=1, ny=1):
    return (-N * Q / 2 + Q * i + nx * Q / 2, -N * Q / 2 + Q * j + ny * Q / 2)


PECAS = []  # (categoria, id, x, y, giro_graus)
# anel de ruas
for i in range(1, N - 1):
    for j in (0, N - 1):
        PECAS.append(("ruas", "rua_reta_faixa_pedestres" if i == 2 else "rua_reta", *centro(i, j), 90))
for j in range(1, N - 1):
    for i in (0, N - 1):
        PECAS.append(("ruas", "rua_reta_faixa_pedestres" if j == 2 else "rua_reta", *centro(i, j), 0))
PECAS += [("ruas", "rua_curva", *centro(0, 0), 90), ("ruas", "rua_curva", *centro(N - 1, 0), 180),
          ("ruas", "rua_curva", *centro(N - 1, N - 1), -90), ("ruas", "rua_curva", *centro(0, N - 1), 0)]

# quadras
CAMPO = centro(1, 3, 2, 1)
TENIS = centro(1, 1, 2, 1)
BASQ = centro(3, 3)
VOLEI = centro(3, 2)
ARQ = centro(1, 2)
PRACA = centro(2, 2)
SKATE = centro(3, 1)
PECAS += [(PE, "campo_futebol", *CAMPO, 0), (PE, "quadra_tenis_saibro", *TENIS, 0), (PE, "quadra_basquete", *BASQ, 0),
          (PE, "quadra_volei_areia", *VOLEI, 0),
          ("pisos", "piso_calcada_lisa", *ARQ, 0), ("pisos", "piso_praca", *PRACA, 0),
          ("pisos", "piso_calcada_lisa", *SKATE, 0)]


def em(base, dx, dy):
    return (base[0] + dx, base[1] + dy)


def mira(de, para):
    """Giro (graus) que vira a frente (−Y) de 'de' para 'para'."""
    dx, dy = para[0] - de[0], para[1] - de[1]
    return math.degrees(math.atan2(dx, -dy))


# campo: traves, placar e torres
PECAS += [(PE, "trave_gol", CAMPO[0] - 13.5 - 0.6, CAMPO[1], 90), (PE, "trave_gol", CAMPO[0] + 13.5 + 0.6, CAMPO[1], -90),
          (PE, "placar_eletronico", CAMPO[0], 24.4, 0)]
TORRES = [(-24.2, 24.2, CAMPO), (9.2, 24.2, CAMPO), (-24.2, 8.2, CAMPO), (8.6, 6.6, CAMPO),
          (-24.2, -24.2, TENIS), (9.2, -24.2, TENIS)]
for x, y, alvo in TORRES:
    PECAS.append((PE, "torre_refletores", x, y, mira((x, y), alvo)))
# basquete: duas tabelas viradas para o meio
PECAS += [(PE, "tabela_basquete", BASQ[0] + 5.94, BASQ[1], -90), (PE, "tabela_basquete", BASQ[0] - 5.94, BASQ[1], 90)]
# arquibancadas, bancos de reservas, bicicletário e bebedouro
for k in (-1, 0, 1):
    PECAS.append((PE, "arquibancada_reta", ARQ[0] - 2.5 + 3.3 * k, ARQ[1] + 5.8, 180))
PECAS += [(PE, "banco_reservas_coberto", CAMPO[0] - 2.4, ARQ[1] + 6.65, 180),
          (PE, "banco_reservas_coberto", CAMPO[0] + 2.4, ARQ[1] + 6.65, 180),
          (PE, "arquibancada_curva", *em(ARQ, -3.0, -4.6), 0),
          (PE, "bicicletario_clube", *em(ARQ, -4.4, 0.6), 180),
          (PE, "bebedouro_esportivo", *em(ARQ, 4.5, 1.2), 0),
          (PE, "bebedouro_esportivo", *em(PRACA, 6.0, -1.4), -90)]
# praça de academia e mesas
PECAS += [(PE, "academia_barras", *em(PRACA, 3.0, 6.0), 0), (PE, "academia_paralelas", *em(PRACA, 3.0, 3.6), 0),
          (PE, "academia_flexao", *em(PRACA, 3.0, 1.0), 0), (PE, "academia_bicicleta", *em(PRACA, -5.6, 2.6), 0),
          (PE, "academia_caminhada", *em(PRACA, -4.0, 2.6), 0), (PE, "academia_abdominal", *em(PRACA, -1.9, 2.6), 0),
          (PE, "mesa_pingue_pongue", *em(PRACA, -3.6, -1.6), 0), (PE, "mesa_xadrez_praca", *em(PRACA, 1.2, -2.2), 0),
          (PE, "mesa_xadrez_praca", *em(PRACA, 3.9, -4.6), 0),
          ("vegetacao", "arvore_redonda_media", *em(PRACA, -5.8, -5.6), 0),
          ("vegetacao", "arvore_redonda_media", *em(PRACA, 6.3, -6.2), 0),
          ("vegetacao", "arbusto_redondo", *em(PRACA, -1.0, -6.4), 0),
          ("mobiliario_urbano", "banco_praca_madeira", *em(PRACA, -2.8, -6.6), 180),
          ("mobiliario_urbano", "banco_praca_madeira", *em(PRACA, 0.8, -6.6), 180),
          ("mobiliario_urbano", "poste_praca_4_lanternas", *em(PRACA, 6.4, 1.6), 0),
          ("mobiliario_urbano", "poste_praca_4_lanternas", *em(PRACA, -6.6, -2.8), 0),
          ("mobiliario_urbano", "lixeira_reciclagem", *em(PRACA, 5.6, -3.0), -90)]
# pista de skate
PECAS += [(PE, "skate_half_pipe", *em(SKATE, 0.0, 3.9), 0), (PE, "skate_funbox", *em(SKATE, -4.2, -3.9), 0),
          (PE, "skate_quarter_pipe", *em(SKATE, 5.4, -4.2), -90), (PE, "skate_rampa_salto", *em(SKATE, 0.6, -6.2), 0),
          (PE, "skate_corrimao", *em(SKATE, 1.2, -0.5), 0), (PE, "skate_banco", *em(SKATE, 0.8, -3.0), 90),
          (PE, "skate_caixote", *em(SKATE, 2.8, -2.0), 0),
          ("mobiliario_urbano", "poste_praca_4_lanternas", *em(SKATE, -6.6, -0.6), 0),
          ("vegetacao", "arvore_redonda_media", *em(SKATE, -6.4, -6.6), 0)]
# árvores no canto do campo de vôlei e do tênis (calçadas)
PECAS += [("vegetacao", "arvore_redonda_grande", 24.6, 3.5, 0), ("vegetacao", "arvore_redonda_grande", 24.6, -12.0, 0),
          ("vegetacao", "arvore_conica", -24.6, -8.0, 0), ("vegetacao", "arvore_conica", -24.6, 0.0, 0)]


def importa(caminho, x, y, giro):
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=caminho)
    novos = [o for o in bpy.data.objects if o not in antes]
    raiz = [o for o in novos if o.parent is None][0]
    raiz.location = (x, y, 0)
    raiz.rotation_mode = "XYZ"
    raiz.rotation_euler = (raiz.rotation_euler.x, raiz.rotation_euler.y, math.radians(giro))
    for o in novos:
        if o.get("colisao"):
            o.hide_render = True
    return novos


def monta(saida):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for cat, id_, x, y, giro in PECAS:
        importa(os.path.join(saida, cat, "glb", id_ + ".glb"), x, y, giro)


def holofotes():
    """Luz de verdade (só no teste) saindo do painel de cada torre, apontada para a quadra."""
    for x, y, alvo in TORRES:
        g = math.radians(mira((x, y), alvo))
        frente = V((math.sin(g), -math.cos(g), 0))
        p = V((x, y, 17.0)) + frente * 0.8
        ld = bpy.data.lights.new("holofote", "SPOT")
        ld.energy = 16000
        ld.spot_size = math.radians(75)
        ld.spot_blend = 0.6
        ld.color = (1.0, 0.95, 0.85)
        ld.shadow_soft_size = 1.5
        ob = bpy.data.objects.new("holofote", ld)
        bpy.context.scene.collection.objects.link(ob)
        ob.location = p
        alvo3 = V((alvo[0], alvo[1], 0.0))
        ob.rotation_euler = (alvo3 - p).to_track_quat("-Z", "Y").to_euler()


def render(arquivo, noite=False, res=(1800, 1300), amostras=40, perto=False):
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
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=600)
    bm.to_mesh(chao)
    bm.free()
    m = bpy.data.materials.new("chao_vitrine")
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*mb._lin("#141E36" if noite else "#2A3D63"), 1)
    b.inputs["Roughness"].default_value = 0.9
    chao.materials.append(m)
    ob = bpy.data.objects.new("chao", chao)
    scn.collection.objects.link(ob)
    ob.location = (0, 0, -2.0)
    ld = bpy.data.lights.new("sol", "SUN")
    ld.energy = 0.35 if noite else 3.0
    if noite:
        ld.color = (0.6, 0.7, 1.0)
        holofotes()
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
        d = V((0.5, -1.0, 0.62)).normalized()
        alvo = V((8.0, -2.0, 2.0))
        cd.ortho_scale = 46
    else:
        d = V((0.42, -1.0, 1.05)).normalized()
        alvo = V((0, 2.0, 3.0))
        cd.ortho_scale = 108
    cam.location = alvo + d * 300
    cam.rotation_euler = (alvo - cam.location).to_track_quat("-Z", "Y").to_euler()
    cd.clip_end = 800
    scn.render.image_settings.file_format = "PNG"
    scn.render.filepath = arquivo
    bpy.ops.render.render(write_still=True)
    print("render", arquivo, flush=True)


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:]
    saida = args[0]
    modos = [a for a in args[1:] if a in ("dia", "noite")] or ["dia", "noite"]
    perto = "--perto" in args
    for md in modos:
        monta(saida)
        nome = f"teste_cena_perto_{md}.png" if perto else f"teste_cena_{md}.png"
        render(os.path.join(saida, PE, nome), noite=md == "noite", perto=perto)
