"""Teste de quarteirão dos arranha-céus: 7 × 7 quadras (ruas em x, y = 0, 3, 6; quatro quarteirões de 2 × 2 quadras)
com as ruas e calçadas das categorias ruas e pisos e 6 torres nos lotes. Renderiza de dia e de noite.

  blender-venv/bin/python -I morada-art/predios_arranha_ceus_quarteirao.py -- SP/morada-art SP/cidade_out <saida_base>
  (grava <saida_base>_dia.png e <saida_base>_noite.png)
"""
import math
import os
import sys

sys.path.insert(0, sys.argv[sys.argv.index("--") + 1])
import bpy  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import moveis_base as mb  # noqa: E402

V = Vector
a = sys.argv[sys.argv.index("--") + 2:]
OUT, BASE = a[0], a[1]
Q = 15.0


def importa(pasta, id_, x, y, rot=0.0):
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(OUT, pasta, "glb", id_ + ".glb"))
    novos = [o for o in bpy.data.objects if o not in antes]
    M = Matrix.Translation((x, y, 0)) @ Matrix.Rotation(math.radians(rot), 4, "Z")
    for o in novos:
        if o.parent is None:
            o.matrix_world = M @ o.matrix_world
    return novos


def pos(i, j):
    return (i - 3) * Q, (j - 3) * Q


bpy.ops.wm.read_factory_settings(use_empty=True)
R = (0, 3, 6)
for i in range(7):
    for j in range(7):
        x, y = pos(i, j)
        if i in R and j in R:
            if (i, j) == (3, 3):
                importa("ruas", "rua_cruzamento_x_faixas", x, y)
            elif i in (0, 6) and j in (0, 6):
                rot = {(0, 0): 90, (6, 0): 180, (6, 6): -90, (0, 6): 0}[(i, j)]
                importa("ruas", "rua_curva", x, y, rot)
            else:
                rot = 0 if j == 6 else 180 if j == 0 else 90 if i == 0 else -90
                importa("ruas", "rua_cruzamento_t", x, y, rot)
        elif i in R:
            importa("ruas", "rua_reta_faixa_pedestres" if j in (2, 4) else "rua_reta", x, y)
        elif j in R:
            importa("ruas", "rua_reta", x, y, 90)
        else:
            praca = (i, j) in ((4, 4), (5, 4), (4, 5), (5, 5))
            importa("pisos", "piso_praca" if (i, j) == (4, 4) else ("piso_grama" if praca else "piso_calcada_lisa"),
                    x, y)

# torres (frente para a rua mais próxima)
TORRES = [
    ("arranha_ceu_lanca_costelas", (1.5, 1.5), 0),
    ("arranha_ceu_torcida_heliponto", (4, 1), 0),
    ("arranha_ceu_cilindro_topo_vidro", (5, 1), 0),
    ("arranha_ceu_gema_branca", (4, 2), 180),
    ("arranha_ceu_arcos_brancos", (1.5, 5), 180),
    ("arranha_ceu_s_branca_azul", (1, 4), 0),
]
for id_, (i, j), rot in TORRES:
    x, y = pos(i, j)
    importa("arranha_ceus", id_, x, y, rot)

scn = bpy.context.scene
scn.render.engine = "CYCLES"
scn.cycles.samples = int(os.environ.get("AMOSTRAS", 40))
scn.cycles.use_denoising = True
scn.render.threads_mode = "FIXED"
scn.render.threads = int(os.environ.get("MOVEIS_THREADS", "2"))
scn.render.resolution_x, scn.render.resolution_y = 1800, 1100
scn.view_settings.view_transform = "Standard"
w = bpy.data.worlds.new("w")
scn.world = w
w.use_nodes = True
bg = w.node_tree.nodes["Background"]
# chão em volta (grama) para a borda da cidade não flutuar
chao = bpy.data.meshes.new("chao")
chao.from_pydata([(-400, -400, -0.42), (400, -400, -0.42), (400, 400, -0.42), (-400, 400, -0.42)], [], [(0, 1, 2, 3)])
m, b = mb._principled("chao_q")
b.inputs["Base Color"].default_value = (*mb._lin("#56A63B"), 1)
chao.materials.append(m)
ob = bpy.data.objects.new("chao", chao)
scn.collection.objects.link(ob)
ld = bpy.data.lights.new("sol", "SUN")
ld.angle = math.radians(5)
sol = bpy.data.objects.new("sol", ld)
scn.collection.objects.link(sol)
sol.rotation_euler = (math.radians(45), 0, math.radians(-40))
cd = bpy.data.cameras.new("c")
cd.lens = 34
cd.clip_end = 3000
cam = bpy.data.objects.new("c", cd)
scn.collection.objects.link(cam)
scn.camera = cam
alvo = V((-2, 2, 50))
cam.location = alvo + V((168, -228, 170))
cam.rotation_euler = (alvo - cam.location).to_track_quat("-Z", "Y").to_euler()

for modo in ("dia", "noite"):
    noite = modo == "noite"
    bg.inputs[0].default_value = (*mb._lin("#16223C" if noite else "#A9C4E8"), 1)
    bg.inputs[1].default_value = 0.35 if noite else 0.8
    ld.energy = 0.5 if noite else 3.2
    ld.color = (0.6, 0.7, 1.0) if noite else (1.0, 0.97, 0.92)
    b.inputs["Base Color"].default_value = (*mb._lin("#2E5A2A" if noite else "#56A63B"), 1)
    mb.emissao_janelas(mb.JANELA_FORCA * 1.4 if noite else 0.0)
    scn.render.filepath = f"{BASE}_{modo}.png"
    bpy.ops.render.render(write_still=True)
    print("quarteirao", scn.render.filepath, flush=True)
