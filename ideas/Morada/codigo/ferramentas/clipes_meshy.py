"""Folha de contato: o personagem em quadros de várias animações."""
import math
import sys
import bpy
from mathutils import Vector
BLEND, OUT = sys.argv[1:3]
CLIPES = sys.argv[3].split(",")
bpy.ops.wm.open_mainfile(filepath=BLEND)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
scn = bpy.context.scene
scn.render.engine = "CYCLES"; scn.cycles.samples = 24; scn.cycles.device = "CPU"
scn.render.resolution_x, scn.render.resolution_y = 520, 680
scn.view_settings.view_transform = "AgX"
w = bpy.data.worlds.new("w"); scn.world = w; w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.75, 0.73, 0.72, 1)
w.node_tree.nodes["Background"].inputs[1].default_value = 0.5
for loc, en in (((2, -3, 3), 500), ((-3, -2, 2), 200), ((0, 3, 3), 300)):
    bpy.ops.object.light_add(type="AREA", location=loc)
    l = bpy.context.active_object; l.data.energy = en; l.data.size = 3
    l.rotation_euler = (Vector((0, 0, 1)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
bpy.ops.mesh.primitive_plane_add(size=30)
cd = bpy.data.cameras.new("c"); cam = bpy.data.objects.new("c", cd); scn.collection.objects.link(cam); scn.camera = cam
cd.lens = 40
ad = arm.animation_data
for tr in ad.nla_tracks:
    tr.mute = True
for nome in CLIPES:
    tr = next(t for t in ad.nla_tracks if t.name == nome)
    tr.mute = False
    st = tr.strips[0]
    f = int(st.frame_start + (st.frame_end - st.frame_start) * 0.45)
    scn.frame_set(f)
    hips = arm.matrix_world @ (arm.pose.bones.get("mixamorig:Hips") or arm.pose.bones["Hips"]).head
    alvo = Vector((hips.x, hips.y, 0.85))
    a = math.radians(25)
    cam.location = alvo + Vector((math.sin(a) * 4.6, -math.cos(a) * 4.6, 0.3))
    cam.rotation_euler = (alvo - cam.location).to_track_quat("-Z", "Y").to_euler()
    scn.render.filepath = f"{OUT}/clipe_{nome}.png"
    bpy.ops.render.render(write_still=True)
    tr.mute = True
