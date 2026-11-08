"""Teste de quarteirão dos prédios tropicais: um quarteirão de 5 × 4 quadras (calçada lisa) cercado por um anel de
ruas (rua_reta e rua_curva da categoria ruas), com os prédios nos lotes. Renderiza de dia e de noite.

Uso: MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/predios_tropicais_quarteirao.py -- SP/cidade_out [dia|noite]
Grava SP/cidade_out/predios_tropicais/quarteirao.png e quarteirao_noite.png.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import moveis_base as mb  # noqa: E402

V = Vector
Q = 15.0
NX, NY = 7, 6  # quadras (com o anel de ruas)

# lotes: (id, coluna, linha, quadras_x, quadras_y); coluna 0..4 e linha 0..3 dentro do anel, linha 0 = frente (−Y)
LOTES = [
    ("bar_praia_lilas", 0, 0, 1, 1), ("quiosque_sucos", 1, 0, 1, 1), ("boate_danca", 2, 0, 1, 1),
    ("bar_barril", 3, 0, 1, 1), ("sorveteria", 4, 0, 1, 1),
    ("deco_faixa_amarelo", 0, 1, 1, 1), ("deco_frisos_pessego", 1, 1, 1, 1), ("cinema_deco", 2, 1, 1, 1),
    ("deco_degraus_rosa", 3, 1, 1, 1), ("deco_cristal_turquesa", 4, 1, 1, 1),
    ("predio_s_rosa", 0, 2, 2, 2), ("hotel_maresia", 2, 2, 2, 1), ("torre_vela_laranja", 4, 2, 1, 1),
    ("hotel_ondulado", 2, 3, 2, 1), ("torre_branca_turquesa", 4, 3, 1, 1),
]


def centro(i, j):
    return ((i - (NX - 1) / 2) * Q, (j - (NY - 1) / 2) * Q)


def importa(arq, x, y, rot=0.0):
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=arq)
    novos = [o for o in bpy.data.objects if o not in antes]
    raiz = [o for o in novos if o.parent is None][0]
    raiz.location = (x, y, 0)
    raiz.rotation_mode = "XYZ"
    raiz.rotation_euler = (0, 0, math.radians(rot))
    return novos


def monta(saida):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    ruas = os.path.join(saida, "ruas", "glb")
    pisos = os.path.join(saida, "pisos", "glb")
    pred = os.path.join(saida, "predios_tropicais", "glb")
    tudo = []
    for i in range(NX):
        for j in range(NY):
            x, y = centro(i, j)
            borda_x, borda_y = i in (0, NX - 1), j in (0, NY - 1)
            if borda_x and borda_y:  # cantos: curva (entra pelo sul, sai pelo leste)
                rot = {(0, 0): 90, (NX - 1, 0): 180, (NX - 1, NY - 1): 270, (0, NY - 1): 0}[(i, j)]
                tudo += importa(os.path.join(ruas, "rua_curva.glb"), x, y, rot)
            elif borda_y:
                tudo += importa(os.path.join(ruas, "rua_reta.glb"), x, y, 90)
            elif borda_x:
                tudo += importa(os.path.join(ruas, "rua_reta.glb"), x, y, 0)
            else:
                tudo += importa(os.path.join(pisos, "piso_calcada_lisa.glb"), x, y, 0)
    for id_, c, r, qx, qy in LOTES:
        x0, y0 = centro(c + 1, r + 1)
        x = x0 + (qx - 1) * Q / 2
        y = y0 + (qy - 1) * Q / 2
        tudo += importa(os.path.join(pred, id_ + ".glb"), x, y, 0)
    bpy.context.view_layer.update()
    return tudo


def render(objs, arquivo, noite):
    scn = bpy.context.scene
    scn.render.engine = "CYCLES"
    scn.cycles.samples = int(os.environ.get("AMOSTRAS", 40))
    scn.cycles.use_denoising = True
    scn.render.threads_mode = "FIXED"
    scn.render.threads = int(os.environ.get("MOVEIS_THREADS", "1"))
    scn.render.resolution_x, scn.render.resolution_y = 1920, 1200
    scn.view_settings.view_transform = "Standard"
    w = bpy.data.worlds.get("w") or bpy.data.worlds.new("w")
    scn.world = w
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (*mb._lin("#1B2A4A" if noite else "#9DB4D9"), 1)
    w.node_tree.nodes["Background"].inputs[1].default_value = 0.35 if noite else 0.65
    mb.emissao_janelas(mb.JANELA_FORCA * 1.4 if noite else 0.0)
    sol = bpy.data.objects.get("sol")
    if not sol:
        ld = bpy.data.lights.new("sol", "SUN")
        ld.angle = math.radians(6)
        sol = bpy.data.objects.new("sol", ld)
        scn.collection.objects.link(sol)
        sol.rotation_euler = (math.radians(45), 0, math.radians(-35))
    sol.data.energy = 0.45 if noite else 3.0
    sol.data.color = (0.6, 0.7, 1.0) if noite else (1.0, 0.98, 0.94)
    cam = bpy.data.objects.get("cam")
    if not cam:
        cd = bpy.data.cameras.new("cam")
        cd.type = "ORTHO"
        cam = bpy.data.objects.new("cam", cd)
        scn.collection.objects.link(cam)
    scn.camera = cam
    pts = [o.matrix_world @ V(c) for o in objs if o.type == "MESH" for c in o.bound_box]
    lo = V([min(p[i] for p in pts) for i in range(3)])
    hi = V([max(p[i] for p in pts) for i in range(3)])
    c = (lo + hi) / 2
    d = V((0.5, -1.0, 0.85)).normalized()
    cam.location = c + d * 250
    cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler()
    R = cam.rotation_euler.to_matrix().inverted()
    proj = [R @ (p - c) for p in pts]
    ex = max(q.x for q in proj) - min(q.x for q in proj)
    ey = max(q.y for q in proj) - min(q.y for q in proj)
    cam.data.ortho_scale = max(ex, ey * 1920 / 1200) * 1.03
    cam.location += cam.matrix_world.to_3x3() @ V(((max(q.x for q in proj) + min(q.x for q in proj)) / 2,
                                                   (max(q.y for q in proj) + min(q.y for q in proj)) / 2, 0))
    cam.data.clip_start = 1.0
    cam.data.clip_end = 600
    scn.render.image_settings.file_format = "PNG"
    scn.render.filepath = arquivo
    bpy.ops.render.render(write_still=True)
    print("quarteirao", arquivo, flush=True)


if __name__ == "__main__":
    a = sys.argv[sys.argv.index("--") + 1:]
    saida = a[0]
    modos = [m for m in ("dia", "noite") if m in a[1:]] or ["dia", "noite"]
    objs = monta(saida)
    for m in modos:
        nome = "quarteirao" + ("_noite" if m == "noite" else "") + ".png"
        render(objs, os.path.join(saida, "predios_tropicais", nome), m == "noite")
