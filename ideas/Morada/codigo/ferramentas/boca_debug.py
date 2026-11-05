import sys, math, bpy
from mathutils import Vector
bpy.ops.wm.open_mainfile(filepath=sys.argv[1])
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
for t in arm.animation_data.nla_tracks: t.mute = True
cab = bpy.data.objects["pai_cabeca"]
for m in cab.data.materials:
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    for l in list(b.inputs["Base Color"].links): m.node_tree.links.remove(l)
kb = cab.data.shape_keys.key_blocks
scn = bpy.context.scene
scn.render.engine = "CYCLES"; scn.cycles.samples = 16; scn.cycles.device = "CPU"
scn.render.resolution_x, scn.render.resolution_y = 600, 450
w = bpy.data.worlds.new("w"); scn.world = w; w.use_nodes = True
w.node_tree.nodes["Background"].inputs[1].default_value = 1.0
cd = bpy.data.cameras.new("c"); cam = bpy.data.objects.new("c", cd); scn.collection.objects.link(cam); scn.camera = cam
cd.lens = 120
alvo = Vector((0, -0.09, 1.525))
for k, (ang, abre) in enumerate(((0, 0), (35, 0), (0, 0.6), (35, 0.6))):
    kb["boca_abre"].value = abre
    a = math.radians(ang)
    cam.location = alvo + Vector((math.sin(a) * 0.5, -math.cos(a) * 0.5, 0.05))
    cam.rotation_euler = (alvo - cam.location).to_track_quat("-Z", "Y").to_euler()
    scn.render.filepath = f"{sys.argv[2]}_{k}.png"
    bpy.ops.render.render(write_still=True)
