"""Prévia de conferência dos barcos: importa os GLB e renderiza maior (de dia ou de noite), com a lista de
triângulos por nó. Uso:
  MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/barcos_previa.py -- <pasta_barcos> <saida.png> id [id...] [noite]
  [dir=x,y,z] [res=900x700] [agua]
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
a = sys.argv[sys.argv.index("--") + 1:]
pasta, arq = a[0], a[1]
ops = a[2:]
noite = "noite" in ops
agua = "agua" in ops
d = (0.55, -1.0, 0.5)
res = (900, 700)
ids = []
for o in ops:
    if o.startswith("dir="):
        d = tuple(float(x) for x in o[4:].split(","))
    elif o.startswith("res="):
        res = tuple(int(x) for x in o[4:].split("x"))
    elif o.startswith("zmax="):
        pass
    elif o not in ("noite", "agua"):
        ids.append(o)
bpy.ops.wm.read_factory_settings(use_empty=True)
x = 0.0
todos = []
for id_ in ids:
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(pasta, "glb", id_ + ".glb"))
    novos = [o for o in bpy.data.objects if o not in antes]
    raiz = [o for o in novos if o.parent is None][0]
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ V(c) for o in novos if o.type == "MESH" for c in o.bound_box]
    lx = max(p.x for p in pts) - min(p.x for p in pts)
    raiz.location.x = x + lx / 2
    x += lx + 1.0
    for o in novos:
        if o.type == "MESH":
            print(id_, o.name, len(o.data.polygons), flush=True)
    todos += novos
bpy.context.view_layer.update()
scn = bpy.context.scene
scn.render.engine = "CYCLES"
scn.cycles.samples = int(os.environ.get("AMOSTRAS", 10))
scn.cycles.use_denoising = True
scn.render.threads_mode = "FIXED"
scn.render.threads = 1
scn.render.resolution_x, scn.render.resolution_y = res
scn.view_settings.view_transform = "Standard"
w = bpy.data.worlds.new("w")
scn.world = w
w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (*mb._lin("#1B2A4A" if noite else "#9DB4D9"), 1)
w.node_tree.nodes["Background"].inputs[1].default_value = 0.45 if noite else 0.6
mb.emissao_janelas(mb.JANELA_FORCA * 1.4 if noite else 0.0)
pts = [o.matrix_world @ V(c) for o in todos if o.type == "MESH" for c in o.bound_box]
zmax = [float(o[5:]) for o in ops if o.startswith("zmax=")]
if zmax:
    pts = [p for p in pts if p.z <= zmax[0]] or pts
lo = V([min(p[i] for p in pts) for i in range(3)])
hi = V([max(p[i] for p in pts) for i in range(3)])
c = (lo + hi) / 2
me = bpy.data.meshes.new("chao")
bm = bmesh.new()
bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=500)
bm.to_mesh(me)
bm.free()
m, b = mb._principled("chao_p")
b.inputs["Base Color"].default_value = (*mb._lin("#3C99D5" if agua else ("#141E36" if noite else "#2A3D63")), 1)
b.inputs["Roughness"].default_value = 0.3 if agua else 0.9
me.materials.append(m)
ch = bpy.data.objects.new("chao", me)
scn.collection.objects.link(ch)
ch.location = (0, 0, 0.0 if agua else lo.z)
ld = bpy.data.lights.new("sol", "SUN")
ld.energy = 0.6 if noite else 3.0
ld.angle = math.radians(6)
sol = bpy.data.objects.new("sol", ld)
scn.collection.objects.link(sol)
sol.rotation_euler = (math.radians(42), 0, math.radians(-38))
cd = bpy.data.cameras.new("c")
cd.type = "ORTHO"
cam = bpy.data.objects.new("c", cd)
scn.collection.objects.link(cam)
scn.camera = cam
dd = V(d).normalized()
cam.location = c + dd * 300
cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler()
R = cam.rotation_euler.to_matrix().inverted()
proj = [R @ (p - c) for p in pts]
ex = max(q.x for q in proj) - min(q.x for q in proj)
ey = max(q.y for q in proj) - min(q.y for q in proj)
cd.ortho_scale = max(ex, ey * res[0] / res[1]) * 1.06
cam.location += cam.matrix_world.to_3x3() @ V(((max(q.x for q in proj) + min(q.x for q in proj)) / 2,
                                               (max(q.y for q in proj) + min(q.y for q in proj)) / 2, 0))
cd.clip_end = 1000
scn.render.image_settings.file_format = "PNG"
scn.render.filepath = arq
bpy.ops.render.render(write_still=True)
