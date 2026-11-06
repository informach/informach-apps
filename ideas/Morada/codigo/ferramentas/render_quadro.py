"""Um quadro grande de uma ação, de lado e em três quartos."""
import bpy, sys, math, os
from mathutils import Vector
a = sys.argv[sys.argv.index("--") + 1:]
BLEND, CORPO, ACAO, QUADRO, OUT = a[0], a[1], a[2], int(a[3]), a[4]
bpy.ops.wm.open_mainfile(filepath=BLEND)
scn = bpy.context.scene; arm = bpy.data.objects[CORPO]
act = bpy.data.actions[ACAO]; arm.animation_data.action = act
if act.slots: arm.animation_data.action_slot = act.slots[0]
scn.frame_set(QUADRO)
for o in [o for o in bpy.data.objects if o.type in ("LIGHT", "CAMERA")]: bpy.data.objects.remove(o, do_unlink=True)
for o in bpy.data.objects:
    if o.type == "MESH": o.hide_render = not (o.parent is arm) or ("_rosto_" in o.name and not o.name.endswith("_neutro"))
scn.render.engine = "CYCLES"; scn.cycles.samples = 16; scn.cycles.use_denoising = True; scn.cycles.device = "CPU"
scn.render.resolution_x, scn.render.resolution_y = 420, 560
w = bpy.data.worlds.new("w"); scn.world = w; w.use_nodes = True; w.node_tree.nodes["Background"].inputs[0].default_value = (0.86, 0.87, 0.9, 1)
bpy.ops.object.light_add(type="AREA", location=(1.5, -3, 3)); L = bpy.context.active_object; L.data.energy = 300; L.data.size = 3
L.rotation_euler = (Vector((0, 0, 1)) - L.location).to_track_quat("-Z", "Y").to_euler()
cd = bpy.data.cameras.new("c"); cam = bpy.data.objects.new("c", cd); scn.collection.objects.link(cam); scn.camera = cam; cd.type = "ORTHO"; cd.ortho_scale = 1.1
alvo = Vector((0, 0, 1.05))
for nome, az in (("lado", 90), ("tq", 35)):
    d = Vector((math.sin(math.radians(az)), -math.cos(math.radians(az)), 0.1)).normalized()
    cam.location = alvo + d * 6; cam.rotation_euler = (alvo - cam.location).to_track_quat("-Z", "Y").to_euler()
    scn.render.filepath = os.path.join(OUT, f"{ACAO}_{QUADRO}_{nome}.png"); bpy.ops.render.render(write_still=True)
