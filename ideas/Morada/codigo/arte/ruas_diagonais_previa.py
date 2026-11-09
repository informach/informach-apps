"""Prévia de uma peça de ruas_diagonais em vários ângulos (uma imagem por ângulo, emendadas depois com PIL).

  blender-venv/bin/python -I morada-art/ruas_diagonais_previa.py -- SP/cidade_out <id> <saida_prefixo> dx,dy,dz [...]
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Vector as V  # noqa: E402

import moveis_base as mb  # noqa: E402

a = sys.argv[sys.argv.index("--") + 1:]
SAIDA, ID, PREF = a[0], a[1], a[2]
DIRS = [tuple(float(t) for t in d.split(",")) for d in a[3:] if d != "noite"]
NOITE = "noite" in a
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(SAIDA, "ruas_diagonais", "glb", ID + ".glb"))
objs = []
for o in bpy.data.objects:
    if o.get("colisao"):
        o.hide_render = True
    elif o.type == "MESH":
        objs.append(o)
scn = bpy.context.scene
scn.render.engine = "CYCLES"
scn.cycles.samples = 12
scn.cycles.use_denoising = True
scn.render.threads_mode = "FIXED"
scn.render.threads = int(os.environ.get("MOVEIS_THREADS", "1"))
scn.render.resolution_x, scn.render.resolution_y = 700, 560
scn.view_settings.view_transform = "Standard"
w = bpy.data.worlds.new("w")
scn.world = w
w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (*mb._lin("#1B2A4A" if NOITE else "#9DB4D9"), 1)
mb.emissao_janelas(mb.JANELA_FORCA * 1.4 if NOITE else 0.0)
ld = bpy.data.lights.new("sol", "SUN")
ld.energy = 0.6 if NOITE else 3.0
sol = bpy.data.objects.new("sol", ld)
scn.collection.objects.link(sol)
sol.rotation_euler = (math.radians(42), 0, math.radians(-38))
pts = [o.matrix_world @ V(c) for o in objs for c in o.bound_box]
lo = V([min(p[i] for p in pts) for i in range(3)])
hi = V([max(p[i] for p in pts) for i in range(3)])
c = (lo + hi) / 2
cd = bpy.data.cameras.new("c")
cd.type = "ORTHO"
cam = bpy.data.objects.new("c", cd)
scn.collection.objects.link(cam)
scn.camera = cam
for k, d in enumerate(DIRS):
    d = V(d).normalized()
    cam.location = c + d * 300
    cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler()
    R = cam.rotation_euler.to_matrix().inverted()
    proj = [R @ (p - c) for p in pts]
    ex = max(q.x for q in proj) - min(q.x for q in proj)
    ey = max(q.y for q in proj) - min(q.y for q in proj)
    cd.ortho_scale = max(ex, ey * 700 / 560) * 1.05
    cd.clip_end = 1000
    scn.render.filepath = f"{PREF}_{k}.png"
    bpy.ops.render.render(write_still=True)
