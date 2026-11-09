"""Teste de cena da categoria parque_areas: um parque de 3 × 3 quarteirões de 2 × 2 quadras (90 × 90 m, 6 × 6 quadras)
montado com as placas de caminho, o lago, o zoológico, o palco, as tendas, os quiosques, o playground, a pista de
skate, o chafariz, o obelisco, o coreto e o arco, mais o castelo rosa e a casa na árvore de predios_magicos, a grama
de pisos, as ruas em volta (categoria ruas) e arbustos, palmeiras e lixeiras do pacote Cartoon City.

Uso: MOVEIS_THREADS=1 CIDADE_PACOTE_FBX=... CIDADE_PACOTE_TEX=... blender-venv/bin/python -I \
       morada-art/parque_areas_cena.py -- SP/cidade_out [dia|noite] [--perto]
Grava SP/cidade_out/parque_areas/teste_cena_dia.png e teste_cena_noite.png (e teste_cena_perto_*.png com --perto).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Vector  # noqa: E402

import moveis_base as mb  # noqa: E402
import cidade_base as cb  # noqa: E402

V = Vector
Q = 15.0
N = 8  # 6 × 6 quadras de parque + o anel de ruas


def centro(i, j, nx=1, ny=1):
    return (-N * Q / 2 + Q * i + nx * Q / 2, -N * Q / 2 + Q * j + ny * Q / 2)


# ------------------------------------------------------------------------------------------------ montagem
PECAS = []
# anel de ruas (com faixas de pedestres em frente às entradas do parque)
for i in range(1, N - 1):
    for j, lado in ((0, "S"), (N - 1, "N")):
        PECAS.append(("ruas", "rua_reta_faixa_pedestres" if i == 4 else "rua_reta", i, j, 90, (1, 1)))
for j in range(1, N - 1):
    for i in (0, N - 1):
        PECAS.append(("ruas", "rua_reta_faixa_pedestres" if j == 4 else "rua_reta", i, j, 0, (1, 1)))
PECAS += [("ruas", "rua_curva", 0, 0, 90, (1, 1)), ("ruas", "rua_curva", N - 1, 0, 180, (1, 1)),
          ("ruas", "rua_curva", N - 1, N - 1, -90, (1, 1)), ("ruas", "rua_curva", 0, N - 1, 0, (1, 1))]

PA = "parque_areas"
# parque (a, b) = célula (a + 1, b + 1)
PARQUE = [
    # áreas grandes
    ("lago_caminho", 1, 1, 0, (2, 2)),
    ("zoologico", 4, 4, 0, (2, 2)),
    # caminho principal norte-sul (coluna 3) e leste-oeste (linha 3) com a praça no meio
    ("caminho_parque_t", 3, 0, -90, (1, 1)),
    ("caminho_parque_t", 3, 1, -90, (1, 1)),
    ("caminho_parque_t", 3, 2, 90, (1, 1)),
    ("praca_redonda", 3, 3, 0, (1, 1)),
    ("caminho_parque_reta", 3, 4, 0, (1, 1)),
    ("caminho_parque_t", 3, 5, 90, (1, 1)),
    ("caminho_parque_reta", 0, 3, 90, (1, 1)),
    ("caminho_parque_t", 1, 3, 180, (1, 1)),
    ("caminho_parque_t", 2, 3, 0, (1, 1)),
    ("caminho_parque_t", 4, 3, 180, (1, 1)),
    ("caminho_parque_reta", 5, 3, 90, (1, 1)),
    ("caminho_parque_curva", 1, 4, -90, (1, 1)),
    ("caminho_parque_fim", 1, 0, 180, (1, 1)),
    ("caminho_parque_fim", 0, 2, 90, (1, 1)),
    # quadras de área
    ("palco_festival", 0, 4, 90, (1, 1)),
    ("playground", 4, 2, -90, (1, 1)),
    ("pista_skate", 2, 0, 90, (1, 1)),
]
GRAMA = [(0, 0), (0, 1), (4, 0), (5, 0), (4, 1), (5, 1), (5, 2), (2, 4), (2, 5), (1, 5), (0, 5)]
for nome, a, b, g, n in PARQUE:
    PECAS.append((PA, nome, a + 1, b + 1, g, n))
for a, b in GRAMA:
    PECAS.append(("pisos", "piso_grama", a + 1, b + 1, 0, (1, 1)))
OUTROS = [  # (categoria, id, a, b, giro, n, dx, dy) — dx, dy em metros a partir do centro da(s) quadra(s)
    ("predios_magicos", "castelo_rosa", 4, 0, 180, (2, 2), 0, 0),
    ("predios_magicos", "casa_arvore", 5, 2, -90, (1, 1), 0, 0),
    (PA, "chafariz_praca", 3, 3, 0, (1, 1), 0, 0),
    (PA, "obelisco", 0, 2, 0, (1, 1), -0.6, 0),
    (PA, "tenda_circo_grande", 2, 4, 180, (1, 1), 0, 0.2),
    (PA, "tenda_circo_media", 1, 5, 200, (1, 1), 0, 0),
    (PA, "tenda_circo_pequena", 0, 5, 160, (1, 1), 1.0, -0.6),
    (PA, "quiosque_sorvete", 1, 0, 125.5, (1, 1), -4.2, -3.6),
    (PA, "quiosque_pipoca", 1, 0, -125.5, (1, 1), 4.2, -3.6),
    (PA, "quiosque_algodao_doce", 1, 0, -64.4, (1, 1), 5.0, 1.8),
    (PA, "bilheteria_ingressos", 2, 5, 0, (1, 1), -3.6, -0.6),
    (PA, "quiosque_sorvete", 2, 5, 0, (1, 1), 3.2, -2.2),
    (PA, "coreto", 0, 0, 30, (1, 1), 0, 0.4),
    (PA, "arco_trelica", 3, 4, 0, (1, 1), 0, -3.5),
    (PA, "fountain_03_pacote", 0, 1, 0, (1, 1), 0, 0),
]
# bancos e postes ao longo dos caminhos (dx, dy no mundo, giro)
MOBILIA = []
for a, b, dx, dy, g in ((3, 0, 2.2, 0, -90), (3, 2, -2.2, 0, 90), (3, 4, 2.2, 3.2, -90), (0, 3, 0, 2.2, 0),
                        (5, 3, 0, -2.2, 180), (2, 3, -3.5, 2.2, 0), (1, 3, 3.5, -2.2, 180), (3, 3, -6.0, -2.3, 180)):
    MOBILIA.append((PA, "banco_praca", a, b, g, (1, 1), dx, dy))
for a, b, dx, dy in ((3, 0, 2.3, 2.3), (3, 1, 2.3, -2.3), (3, 2, -2.3, 2.3), (3, 4, -2.3, -2.3), (3, 5, -2.3, 2.3),
                     (0, 3, -2.3, -2.3), (1, 3, -2.3, 2.3), (2, 3, 2.3, 2.3), (4, 3, -2.3, -2.3), (5, 3, 2.3, 2.3),
                     (1, 4, 2.4, -2.4), (3, 3, 6.4, 4.0), (3, 3, -6.4, -4.0), (3, 3, -4.0, 6.4), (3, 3, 4.0, -6.4),
                     (1, 0, 0.0, -4.9)):
    MOBILIA.append((PA, "poste_praca_4_lanternas", a, b, 0, (1, 1), dx, dy))
# peças do pacote espalhadas na grama (nome FBX, a, b, dx, dy, giro)
PACOTE = [("Bush_06", 0, 0, -5.8, -5.8, 0), ("Bush_07", 0, 0, 5.6, -6.0, 40), ("Bush_06", 0, 1, -5.5, 5.5, 10),
          ("Bush_10", 0, 1, 4.5, -5.6, 0), ("Trash_Can_06", 3, 1, 2.3, 2.6, 0), ("Trash_Can_08", 1, 3, 2.4, 2.4, 0),
          ("Bush_10", 2, 5, -5.8, -5.8, 90), ("Bush_07", 1, 5, -6.0, 6.0, 0), ("Trash_Can_06", 4, 3, 2.6, 2.4, 0)]


def importa(caminho, i, j, giro, n, dx=0.0, dy=0.0):
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=caminho)
    novos = [o for o in bpy.data.objects if o not in antes]
    raiz = [o for o in novos if o.parent is None][0]
    cx, cy = centro(i, j, *n)
    raiz.location = (cx + dx, cy + dy, 0)
    raiz.rotation_mode = "XYZ"
    raiz.rotation_euler = (raiz.rotation_euler.x, raiz.rotation_euler.y, math.radians(giro))
    for o in novos:
        if o.get("colisao"):
            o.hide_render = True
    return novos


def monta(saida):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for cat, id_, i, j, giro, n in PECAS:
        importa(os.path.join(saida, cat, "glb", id_ + ".glb"), i, j, giro, n)
    for cat, id_, a, b, giro, n, dx, dy in OUTROS + MOBILIA:
        importa(os.path.join(saida, cat, "glb", id_ + ".glb"), a + 1, b + 1, giro, n, dx, dy)
    if cb.CC_DIR:
        for nome, a, b, dx, dy, giro in PACOTE:
            pc = cb.importa_cidade(nome)
            cx, cy = centro(a + 1, b + 1)
            for o in pc.values():
                o.rotation_euler = (0, 0, math.radians(giro))
                o.location = (cx + dx, cy + dy, 0)


def render(arquivo, noite=False, res=(1800, 1300), amostras=48, perto=False):
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
    w.node_tree.nodes["Background"].inputs[1].default_value = 0.4 if noite else 0.6
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
    ld.energy = 0.5 if noite else 3.0
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
    if perto == "encaixe":
        d = V((0.3, -1.0, 2.2)).normalized()
        alvo = V((0, -6.0, 0.0))
        cd.ortho_scale = 76
    elif perto:
        d = V((0.5, -1.0, 0.62)).normalized()
        alvo = V((-14.0, -4.0, 3.0))
        cd.ortho_scale = 62
    else:
        d = V((0.42, -1.0, 1.05)).normalized()
        alvo = V((0, 4.0, 4.0))
        cd.ortho_scale = 132
    cam.location = alvo + d * 300
    cam.rotation_euler = (alvo - cam.location).to_track_quat("-Z", "Y").to_euler()
    cd.clip_end = 800
    scn.render.image_settings.file_format = "PNG"
    scn.render.filepath = arquivo
    bpy.ops.render.render(write_still=True)
    print("render", arquivo, flush=True)


ENCAIXE = [  # (categoria, id, i, j, giro): 4 × 4 placas + uma fileira de rua embaixo
    ("ruas", "rua_reta", 0, -1, 90), ("ruas", "rua_reta", 1, -1, 90), ("ruas", "rua_reta_faixa_pedestres", 2, -1, 90),
    ("ruas", "rua_reta", 3, -1, 90),
    (PA, "caminho_parque_canto", 0, 0, 90), (PA, "caminho_parque_reta", 1, 0, 90), (PA, "caminho_parque_t", 2, 0, 0),
    (PA, "caminho_parque_curva", 3, 0, 180),
    ("pisos", "piso_grama_caminho", 0, 1, 0), ("pisos", "piso_grama", 1, 1, 0), ("pisos", "piso_grama", 2, 1, 0),
    (PA, "caminho_parque_duplo", 3, 1, 0),
    (PA, "caminho_parque_cruz", 0, 2, 0), (PA, "caminho_parque_reta", 1, 2, 90), (PA, "caminho_parque_rotatoria", 2, 2, 0),
    (PA, "caminho_parque_t", 3, 2, -90),
    (PA, "caminho_parque_fim", 0, 3, 0), (PA, "praca_redonda", 1, 3, 0), (PA, "caminho_parque_fim", 2, 3, 0),
    (PA, "caminho_parque_fim", 3, 3, 0),
]


def encaixe(saida):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for cat, id_, i, j, giro in ENCAIXE:
        antes = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=os.path.join(saida, cat, "glb", id_ + ".glb"))
        novos = [o for o in bpy.data.objects if o not in antes]
        raiz = [o for o in novos if o.parent is None][0]
        raiz.location = (Q * (i - 1.5), Q * (j - 1.5), 0)
        raiz.rotation_mode = "XYZ"
        raiz.rotation_euler = (raiz.rotation_euler.x, raiz.rotation_euler.y, math.radians(giro))
        for o in novos:
            if o.get("colisao"):
                o.hide_render = True


if __name__ == "__main__":
    args0 = sys.argv[sys.argv.index("--") + 1:]
    if "--encaixe" in args0:
        encaixe(args0[0])
        render(os.path.join(args0[0], PA, "encaixe.png"), res=(1800, 1500), perto="encaixe")
        sys.exit(0)
    args = sys.argv[sys.argv.index("--") + 1:]
    saida = args[0]
    modos = [a for a in args[1:] if a in ("dia", "noite")] or ["dia", "noite"]
    perto = "--perto" in args
    for md in modos:
        monta(saida)
        nome = f"teste_cena_perto_{md}.png" if perto else f"teste_cena_{md}.png"
        render(os.path.join(saida, PA, nome), noite=md == "noite", perto=perto)
