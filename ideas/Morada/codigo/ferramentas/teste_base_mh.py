"""Renderiza a malha base CC0 do MakeHuman: crua e estilizada (cabeça e olhos maiores).
Uso: python teste_base_mh.py <pasta makehuman/data> <saida_dir>
"""
import math
import os
import sys

import bpy
import bmesh  # noqa: E402
from mathutils import Vector  # noqa: E402

DATA, OUT = sys.argv[1], sys.argv[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.obj_import(filepath=os.path.join(DATA, "3dobjs", "base.obj"), use_split_groups=True)
objs = {o.name: o for o in bpy.context.scene.objects if o.type == "MESH"}
print(sorted(objs)[:60])
# mantém corpo, olhos e cílios; descarta auxiliares de roupa e marcadores
manter = [n for n in objs if n.startswith("body") or "eye" in n or "teeth" in n or "tongue" in n]
for n, o in objs.items():
    if n not in manter or n.startswith("joint"):
        bpy.data.objects.remove(o, do_unlink=True)
corpo = next(o for n, o in objs.items() if n.startswith("body") and o.name in bpy.data.objects)
pts = [corpo.matrix_world @ v.co for v in corpo.data.vertices]
zmax = max(p.z for p in pts)
zmin = min(p.z for p in pts)
alt = zmax - zmin
print("altura", round(alt, 3), "verts corpo", len(corpo.data.vertices),
      "tris", sum(len(p.vertices) - 2 for p in corpo.data.polygons))

# material de pele e olho
def mat(nome, cor, rough=0.55, sss=0.0):
    m = bpy.data.materials.new(nome)
    if hasattr(m, "use_nodes"):
        m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = cor
    b.inputs["Roughness"].default_value = rough
    return m


pele = mat("pele", (0.75, 0.48, 0.34, 1))
for o in bpy.context.scene.objects:
    if o.type == "MESH":
        o.data.materials.clear()
        o.data.materials.append(pele if o.name.startswith("body") else mat("aux", (0.15, 0.08, 0.05, 1), 0.3))
        for p in o.data.polygons:
            p.use_smooth = True
        sub = o.modifiers.new("sub", "SUBSURF")
        sub.levels = sub.render_levels = 1

# cópia estilizada: cabeça 1,3× e olhos 1,25×, com transição suave no pescoço
est = {}
for o in [x for x in bpy.context.scene.objects if x.type == "MESH"]:
    c = o.copy()
    c.data = o.data.copy()
    bpy.context.scene.collection.objects.link(c)
    est[o.name] = c
cab_z0 = zmax - alt * 0.135  # base do crânio
centro = Vector((0, 0, zmax - alt * 0.065))
for c in est.values():
    for v in c.data.vertices:
        p = c.matrix_world @ v.co
        t = min(1.0, max(0.0, (p.z - (cab_z0 - alt * 0.03)) / (alt * 0.05)))
        k = 1 + 0.32 * t
        q = centro + (p - centro) * k
        q.z += (k - 1) * alt * 0.03
        v.co = c.matrix_world.inverted() @ q
    c.location.x += alt * 0.35

for o in bpy.context.scene.objects:
    if o.type == "MESH" and o.name in objs and o.name in bpy.data.objects:
        o.location.x -= alt * 0.0

scn = bpy.context.scene
cam_d = bpy.data.cameras.new("c")
cam_d.lens = 85
cam = bpy.data.objects.new("c", cam_d)
scn.collection.objects.link(cam)
scn.camera = cam
alvo = Vector((alt * 0.175, 0, zmax - alt * 0.075))
cam.location = alvo + Vector((-alt * 0.25, -alt * 1.15, alt * 0.02))
cam.rotation_euler = (alvo - cam.location).to_track_quat("-Z", "Y").to_euler()
for loc, en in (((-1, -1.5, 1.2), 250), ((1.5, -1, 0.5), 90), ((0, 1.5, 1), 120)):
    ld = bpy.data.lights.new("l", "AREA")
    ld.energy = en * alt * alt / 4
    ld.size = alt * 0.6
    lo = bpy.data.objects.new("l", ld)
    lo.location = alvo + Vector(loc) * alt * 0.6
    lo.rotation_euler = (alvo - lo.location).to_track_quat("-Z", "Y").to_euler()
    scn.collection.objects.link(lo)
w = bpy.data.worlds.new("w")
scn.world = w
w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.86, 0.83, 0.82, 1)
w.node_tree.nodes["Background"].inputs[1].default_value = 0.5
scn.render.engine = "CYCLES"
scn.cycles.samples = 48
scn.cycles.use_denoising = True
scn.view_settings.view_transform = "Standard"
scn.render.resolution_x, scn.render.resolution_y = 1400, 800
scn.render.filepath = os.path.join(OUT, "base_mh_cabeca.png")
bpy.ops.render.render(write_still=True)
cam.location = Vector((alt * 0.175, -alt * 3.2, zmin + alt * 0.5))
cam.rotation_euler = (Vector((alt * 0.175, 0, zmin + alt * 0.5)) - cam.location).to_track_quat("-Z", "Y").to_euler()
scn.render.filepath = os.path.join(OUT, "base_mh_corpo.png")
bpy.ops.render.render(write_still=True)
print("ok")
