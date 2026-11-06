"""Close das mãos de uma ação num quadro (câmera mirando entre as duas mãos)."""
import bpy, sys, math, os
from mathutils import Vector
a = sys.argv[sys.argv.index("--") + 1:]
BLEND, CORPO, OUT = a[0], a[1], a[3]
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=BLEND)
scn = bpy.context.scene; arm = bpy.data.objects[CORPO]; mw = arm.matrix_world
for o in [o for o in bpy.data.objects if o.type in ("LIGHT", "CAMERA")]: bpy.data.objects.remove(o, do_unlink=True)
for o in bpy.data.objects:
    if o.type == "MESH": o.hide_render = not (o.parent is arm) or ("_rosto_" in o.name and not o.name.endswith("_neutro"))
scn.render.engine = "CYCLES"; scn.cycles.samples = 16; scn.cycles.use_denoising = True; scn.cycles.device = "CPU"
scn.render.resolution_x, scn.render.resolution_y = 400, 400
w = bpy.data.worlds.new("w"); scn.world = w; w.use_nodes = True; w.node_tree.nodes["Background"].inputs[0].default_value = (0.86, 0.87, 0.9, 1)
bpy.ops.object.light_add(type="AREA", location=(1.5, -3, 3)); L = bpy.context.active_object; L.data.energy = 300; L.data.size = 3
cd = bpy.data.cameras.new("c"); cam = bpy.data.objects.new("c", cd); scn.collection.objects.link(cam); scn.camera = cam; cd.type = "ORTHO"; cd.ortho_scale = 0.6
for n in a[2].split(","):
    act = bpy.data.actions[n]; arm.animation_data.action = act
    if act.slots: arm.animation_data.action_slot = act.slots[0]
    scn.frame_set(int(sum(act.frame_range) / 2))
    alvo = (mw @ arm.pose.bones["LeftHand"].head + mw @ arm.pose.bones["RightHand"].head) / 2
    d = Vector((math.sin(math.radians(30)), -math.cos(math.radians(30)), 0.4)).normalized()
    cam.location = alvo + d * 4; cam.rotation_euler = (alvo - cam.location).to_track_quat("-Z", "Y").to_euler()
    L.rotation_euler = (alvo - L.location).to_track_quat("-Z", "Y").to_euler()
    scn.render.filepath = os.path.join(OUT, n + ".png"); bpy.ops.render.render(write_still=True)
