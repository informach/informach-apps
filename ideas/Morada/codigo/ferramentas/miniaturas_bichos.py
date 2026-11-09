"""Miniatura de cada bicho (parado, de três quartos, fundo transparente): <saida>/<id>.webp (200 px)."""
import bpy, sys, math, os
from mathutils import Vector
a = sys.argv[sys.argv.index("--") + 1:]
blend, saida = a[0], a[1]
os.makedirs(saida, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=blend)
scn = bpy.context.scene
arms = [o for o in bpy.data.objects if o.type == "ARMATURE" and o.name.startswith("bicho_")]
for o in arms:
    o.location = (0, 0, 0)
    ad = o.animation_data; t = ad.nla_tracks.get("parado")
    ad.action = t.strips[0].action
    if ad.action.slots: ad.action_slot = ad.action.slots[0]
    for tt in ad.nla_tracks: tt.mute = True
for o in bpy.data.objects:
    if o.type == "ARMATURE" and not o.name.startswith("bicho_"):
        for c in o.children: c.hide_render = True
scn.frame_set(12)
scn.render.engine = "CYCLES"; scn.cycles.samples = 20; scn.cycles.use_denoising = True; scn.cycles.device = "CPU"
scn.render.resolution_x = scn.render.resolution_y = 200
scn.render.film_transparent = True
scn.view_settings.view_transform = "Standard"
scn.render.image_settings.file_format = "WEBP"; scn.render.image_settings.quality = 88
scn.render.image_settings.color_mode = "RGBA"
w = bpy.data.worlds.new("w"); scn.world = w; w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.75, 0.78, 0.9, 1); w.node_tree.nodes["Background"].inputs[1].default_value = 0.8
bpy.ops.object.light_add(type="SUN"); sol = bpy.context.active_object; sol.data.energy = 3.2
sol.rotation_euler = (math.radians(40), math.radians(10), math.radians(-35))
cd = bpy.data.cameras.new("c"); cam = bpy.data.objects.new("c", cd); scn.collection.objects.link(cam); scn.camera = cam
cd.type = "ORTHO"
dg = bpy.context.evaluated_depsgraph_get()
for o in arms:
    for x in arms:
        for c in x.children: c.hide_render = x is not o
    ev = o.children[0].evaluated_get(dg)
    pts = [ev.matrix_world @ v.co for v in ev.data.vertices]
    mn = Vector([min(p[i] for p in pts) for i in range(3)]); mx = Vector([max(p[i] for p in pts) for i in range(3)])
    c = (mn + mx) / 2
    d = Vector((-0.75, -1.0, 0.55)).normalized()
    cam.location = c + d * 5
    cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler()
    cd.ortho_scale = max(mx - mn) * 1.18
    scn.render.filepath = os.path.join(saida, o.name[6:] + ".webp")
    bpy.ops.render.render(write_still=True)
print("ok", len(arms))
