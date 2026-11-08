"""Miniaturas (<id>.webp, 200 px, parado, de três quartos, fundo transparente; o mesmo padrão de
codigo/ferramentas/miniaturas_bichos.py) e a folha com todos lado a lado, parados.

Uso: python -I bichos_urbano_mini.py -- <urbano.blend> <saida_dir> [folha.jpg]
"""
import math
import os
import sys

import bpy
from mathutils import Vector

a = sys.argv[sys.argv.index("--") + 1:]
blend, saida = a[0], a[1]
folha = a[2] if len(a) > 2 else None
os.makedirs(saida, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=blend)
scn = bpy.context.scene
scn.render.threads_mode = "FIXED"
scn.render.threads = 1
arms = [o for o in bpy.data.objects if o.type == "ARMATURE" and o.name.startswith("bicho_")]
pos = {o.name: o.location.copy() for o in arms}
for o in arms:
    o.location = (0, 0, 0)
    ad = o.animation_data
    t = ad.nla_tracks.get("parado")
    ad.action = t.strips[0].action
    if ad.action.slots:
        ad.action_slot = ad.action.slots[0]
    for tt in ad.nla_tracks:
        tt.mute = True
for o in bpy.data.objects:
    if o.type == "ARMATURE" and not o.name.startswith("bicho_"):
        for c in o.children:
            c.hide_render = True
    if o.type == "MESH" and (o.parent is None or not o.parent.name.startswith("bicho_")):
        o.hide_render = True
scn.frame_set(12)
scn.render.engine = "CYCLES"
scn.cycles.samples = 20
scn.cycles.use_denoising = True
scn.cycles.device = "CPU"
scn.render.resolution_x = scn.render.resolution_y = 200
scn.render.film_transparent = True
scn.view_settings.view_transform = "Standard"
scn.render.image_settings.file_format = "WEBP"
scn.render.image_settings.quality = 88
scn.render.image_settings.color_mode = "RGBA"
w = bpy.data.worlds.new("w")
scn.world = w
w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.75, 0.78, 0.9, 1)
w.node_tree.nodes["Background"].inputs[1].default_value = 0.8
bpy.ops.object.light_add(type="SUN")
sol = bpy.context.active_object
sol.data.energy = 3.2
sol.rotation_euler = (math.radians(40), math.radians(10), math.radians(-35))
cd = bpy.data.cameras.new("c")
cam = bpy.data.objects.new("c", cd)
scn.collection.objects.link(cam)
scn.camera = cam
cd.type = "ORTHO"
dg = bpy.context.evaluated_depsgraph_get()
for o in arms:
    for x in arms:
        for c in x.children:
            c.hide_render = x is not o
    ev = o.children[0].evaluated_get(dg)
    pts = [ev.matrix_world @ v.co for v in ev.data.vertices]
    mn = Vector([min(p[i] for p in pts) for i in range(3)])
    mx = Vector([max(p[i] for p in pts) for i in range(3)])
    c = (mn + mx) / 2
    d = Vector((-0.75, -1.0, 0.55)).normalized()
    cam.location = c + d * 5
    cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler()
    cd.ortho_scale = max(mx - mn) * 1.18
    scn.render.filepath = os.path.join(saida, o.name[6:] + ".webp")
    bpy.ops.render.render(write_still=True)
print("miniaturas", len(arms))

if folha:  # todos lado a lado, em escala real, parados
    for x in arms:
        for c in x.children:
            c.hide_render = False
    ordem = sorted(arms, key=lambda o: (pos[o.name].y, pos[o.name].x))
    xo = 0.0
    for o in ordem:
        ev = o.children[0].evaluated_get(dg)
        pts = [ev.matrix_world @ v.co for v in ev.data.vertices]
        larg = max(p[0] for p in pts) - min(p[0] for p in pts)
        comp = max(p[1] for p in pts) - min(p[1] for p in pts)
        tam = max(larg, comp * 0.6)
        o.location = (xo + tam / 2, 0, 0)
        o.rotation_euler = (math.radians(90), 0, math.radians(-30))
        xo += tam + 0.12
    bpy.context.view_layer.update()
    scn.render.film_transparent = False
    scn.render.image_settings.file_format = "JPEG"
    scn.render.image_settings.color_mode = "RGB"
    scn.render.resolution_x, scn.render.resolution_y = 2000, 640
    scn.cycles.samples = 24
    bpy.ops.mesh.primitive_plane_add(size=60)
    chao = bpy.context.active_object
    m = bpy.data.materials.new("chao")
    m.use_nodes = True
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.5, 0.56, 0.5, 1)
    chao.data.materials.append(m)
    cd.type = "ORTHO"
    cd.ortho_scale = xo * 1.02
    alvo = Vector((xo / 2, 0, 0.32))
    cam.location = alvo + Vector((0, -6, 1.6))
    cam.rotation_euler = (alvo - cam.location).to_track_quat("-Z", "Y").to_euler()
    scn.render.filepath = folha
    bpy.ops.render.render(write_still=True)
    print("folha", folha)
