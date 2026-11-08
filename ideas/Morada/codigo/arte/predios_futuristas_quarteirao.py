"""Teste de quarteirão dos prédios futuristas: ruas e calçadas (categorias ruas e pisos) com os prédios nos lotes.

Uso: MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/predios_futuristas_quarteirao.py -- SP/cidade_out [dia|noite]
Grava SP/cidade_out/predios_futuristas/quarteirao_dia.png e quarteirao_noite.png.

Grade de 7 × 3 quadras: a rua da frente corre em X (fileira 0), uma rua sobe em Y na coluna 3 (T no encontro) e os
lotes ficam nas fileiras 1 e 2, com calçada lisa por baixo dos prédios.
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
argv = sys.argv[sys.argv.index("--") + 1:]
SAIDA = argv[0]
MODOS = argv[1:] or ["dia", "noite"]
RUAS = os.path.join(SAIDA, "ruas", "glb")
PISOS = os.path.join(SAIDA, "pisos", "glb")
PRED = os.path.join(SAIDA, "predios_futuristas", "glb")

# (glb, coluna, fileira, rotação em graus) — prédios de 2 × 1 quadras: coluna = a primeira das duas
TILES = []
for c in range(7):
    if c == 3:
        TILES.append((os.path.join(RUAS, "rua_cruzamento_t.glb"), c, 0, 180))
    else:
        TILES.append((os.path.join(RUAS, "rua_reta.glb"), c, 0, 90))
for f in (1, 2):
    TILES.append((os.path.join(RUAS, "rua_reta.glb"), 3, f, 0))
    for c in (0, 1, 2, 4, 5, 6):
        TILES.append((os.path.join(PISOS, "piso_calcada_lisa.glb"), c, f, 0))
PREDIOS = [
    ("predio_caixa_tela_rosa", 0, 1, 1), ("boate_torre_anel_azul", 1, 1, 1), ("discoteca_globo_roxa", 2, 1, 1),
    ("clube_vr", 4, 1, 1), ("fliperama_controle", 5, 1, 1), ("casa_modular_capsulas", 6, 1, 1),
    ("predio_u_ondulado_azul", 0, 2, 2), ("cyber_torre_telas", 2, 2, 1),
    ("capsula_ovo_azul", 4, 2, 1), ("predio_escalonado_neon_lilas", 5, 2, 1), ("predio_caixa_listras_cores", 6, 2, 1),
]


def importa(glb, x, y, rot):
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=glb)
    novos = [o for o in bpy.data.objects if o not in antes]
    raiz = [o for o in novos if o.parent is None]
    for r in raiz:
        r.rotation_mode = "XYZ"
        r.rotation_euler = (0, 0, math.radians(rot))
        r.location = (x, y, 0)
    return novos


def monta():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for glb, c, f, rot in TILES:
        importa(glb, c * Q, f * Q, rot)
    for id_, c, f, ncol in PREDIOS:
        x = (c + (ncol - 1) / 2) * Q
        importa(os.path.join(PRED, id_ + ".glb"), x, f * Q, 0)
    # chão em volta (gramado escuro) um pouco abaixo da laje das peças
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=200)
    me = bpy.data.meshes.new("chao")
    bm.to_mesh(me)
    bm.free()
    m, b = mb._principled("chao_quarteirao")
    b.inputs["Base Color"].default_value = (*mb._lin("#4E8F3A"), 1)
    me.materials.append(m)
    ob = bpy.data.objects.new("chao", me)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = (3 * Q, Q, -0.42)


def render(modo):
    noite = modo == "noite"
    scn = bpy.context.scene
    scn.render.engine = "CYCLES"
    scn.cycles.samples = int(os.environ.get("AMOSTRAS", 64))
    scn.cycles.use_denoising = True
    scn.render.threads_mode = "FIXED"
    scn.render.threads = int(os.environ.get("MOVEIS_THREADS", "1"))
    scn.render.resolution_x, scn.render.resolution_y = 1920, 1080
    scn.view_settings.view_transform = "Standard"
    w = bpy.data.worlds.new("w")
    scn.world = w
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (*mb._lin("#16223F" if noite else "#A9C6EC"), 1)
    w.node_tree.nodes["Background"].inputs[1].default_value = 0.35 if noite else 0.8
    mb.emissao_janelas(mb.JANELA_FORCA * 1.4 if noite else 0.0)
    for o in [o for o in bpy.data.objects if o.type in ("LIGHT", "CAMERA")]:
        bpy.data.objects.remove(o)
    ld = bpy.data.lights.new("sol", "SUN")
    ld.energy = 0.35 if noite else 3.2
    if noite:
        ld.color = (0.6, 0.7, 1.0)
    ld.angle = math.radians(5)
    sol = bpy.data.objects.new("sol", ld)
    scn.collection.objects.link(sol)
    sol.rotation_euler = (math.radians(48), 0, math.radians(-32))
    cd = bpy.data.cameras.new("c")
    cd.lens = 50
    cam = bpy.data.objects.new("c", cd)
    scn.collection.objects.link(cam)
    scn.camera = cam
    alvo = V((3 * Q, 1.25 * Q, 13.0))
    d = V((0.42, -1.0, 0.74)).normalized()
    cam.location = alvo + d * 205
    cam.rotation_euler = (alvo - cam.location).to_track_quat("-Z", "Y").to_euler()
    cd.clip_end = 1000
    scn.render.image_settings.file_format = "PNG"
    scn.render.filepath = os.path.join(SAIDA, "predios_futuristas", f"quarteirao_{modo}.png")
    bpy.ops.render.render(write_still=True)
    print("quarteirao", scn.render.filepath, flush=True)


monta()
for m in MODOS:
    render(m)
