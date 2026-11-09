"""Teste de quarteirão dos prédios ecológicos: uma quadra de 3 × 3 lotes cercada de rua (peças das categorias ruas
e pisos), com os prédios nos lotes. Renderiza de dia e de noite para conferir a escala e o encaixe.
  blender-venv/bin/python -I morada-art/predios_ecologicos_quarteirao.py -- SP/cidade_out <saida_sem_ext>
Gera <saida>_dia.png e <saida>_noite.png."""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Vector  # noqa: E402

import moveis_base as mb  # noqa: E402

V = Vector
a = sys.argv[sys.argv.index("--") + 1:]
SAIDA, ARQ = a[0], a[1]
Q = 15.0


def importa(cat, id_, x, y, rot=0.0):
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(SAIDA, cat, "glb", id_ + ".glb"))
    novos = [o for o in bpy.data.objects if o not in antes]
    raiz = [o for o in novos if o.parent is None][0]
    raiz.location = (x, y, 0)
    raiz.rotation_mode = "XYZ"
    raiz.rotation_euler = (0, 0, math.radians(rot))
    return novos


def centro(i, j):
    return (i - 2) * Q, (j - 2) * Q


bpy.ops.wm.read_factory_settings(use_empty=True)
# anel de ruas (5 × 5 quadras, o miolo 3 × 3 são os lotes)
for i in range(5):
    for j in range(5):
        x, y = centro(i, j)
        borda_x, borda_y = i in (0, 4), j in (0, 4)
        if borda_x and borda_y:
            rot = {(0, 0): 90, (4, 0): 180, (4, 4): 270, (0, 4): 0}[(i, j)]
            importa("ruas", "rua_curva", x, y, rot)
        elif borda_x:
            importa("ruas", "rua_reta", x, y, 0)
        elif borda_y:
            importa("ruas", "rua_reta" if i != 2 else "rua_reta_faixa_pedestres", x, y, 90)
        else:
            importa("pisos", "piso_calcada_lisa", x, y, 0)

P = "predios_ecologicos"
lotes = [  # (id, (i, j) do centro do prédio, rotação)
    ("torre_degraus_inclinada", (1, 1.5), 0),
    ("academia_curva", (2.5, 1), 0),
    ("predinho_jardim_vertical", (2, 2), 0),
    ("torre_lajes_arredondadas", (3, 2), 90),
    ("casa_telhado_verde", (1, 3), 180),
    ("cafe_ecologico", (2, 3), 180),
    ("predio_trelica_verde", (3, 3), 180),
]
for id_, (i, j), rot in lotes:
    x, y = centro(i, j)
    importa(P, id_, x, y, rot)
bpy.context.view_layer.update()

scn = bpy.context.scene
scn.render.engine = "CYCLES"
scn.cycles.samples = int(os.environ.get("AMOSTRAS", 48))
scn.cycles.use_denoising = True
scn.render.threads_mode = "FIXED"
scn.render.threads = int(os.environ.get("MOVEIS_THREADS", "2"))
scn.render.resolution_x, scn.render.resolution_y = 1800, 1100
scn.view_settings.view_transform = "Standard"
w = bpy.data.worlds.new("w")
scn.world = w
w.use_nodes = True
fundo = w.node_tree.nodes["Background"]
chao = bpy.data.meshes.new("chao")
bm = bmesh.new()
bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=400)
bm.to_mesh(chao)
bm.free()
mc, bc = mb._principled("chao_quarteirao")
chao.materials.append(mc)
ob = bpy.data.objects.new("chao", chao)
scn.collection.objects.link(ob)
ob.location = (0, 0, -0.42)
ld = bpy.data.lights.new("sol", "SUN")
ld.angle = math.radians(6)
sol = bpy.data.objects.new("sol", ld)
scn.collection.objects.link(sol)
sol.rotation_euler = (math.radians(44), 0, math.radians(-35))
cd = bpy.data.cameras.new("c")
cd.type = "ORTHO"
cam = bpy.data.objects.new("c", cd)
scn.collection.objects.link(cam)
scn.camera = cam
alvo = V((0, 6, 17))
d = V((0.62, -1.0, 0.85)).normalized()
cam.location = alvo + d * 200
cam.rotation_euler = (alvo - cam.location).to_track_quat("-Z", "Y").to_euler()
cd.ortho_scale = 118
cd.clip_end = 600

for modo in ("dia", "noite"):
    noite = modo == "noite"
    fundo.inputs[0].default_value = (*mb._lin("#1B2A4A" if noite else "#9DB4D9"), 1)
    fundo.inputs[1].default_value = 0.35 if noite else 0.7
    bc.inputs["Base Color"].default_value = (*mb._lin("#1E3320" if noite else "#56A63B"), 1)
    ld.energy = 0.5 if noite else 3.2
    ld.color = (0.6, 0.7, 1.0) if noite else (1.0, 0.97, 0.92)
    mb.emissao_janelas(mb.JANELA_FORCA * 1.4 if noite else 0.0)
    scn.render.filepath = f"{ARQ}_{modo}.png"
    bpy.ops.render.render(write_still=True)
    print("quarteirao", modo, flush=True)
