"""Close das mãos de várias ações em 3 quadros (25%, 50%, 75%), numa grade por ação.
Uso: python render_dedos.py -- <blend> <corpo> <acao1:lado,acao2:lado,...> <saida>   (lado: Left, Right ou ambos)"""
import bpy, sys, math, os
from mathutils import Vector
a = sys.argv[sys.argv.index("--") + 1:]
BLEND, CORPO, LISTA, OUT = a[:4]
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=BLEND)
scn = bpy.context.scene; arm = bpy.data.objects[CORPO]; mw = arm.matrix_world
for o in [o for o in bpy.data.objects if o.type in ("LIGHT", "CAMERA")]: bpy.data.objects.remove(o, do_unlink=True)
for o in bpy.data.objects:
    if o.type == "MESH": o.hide_render = not (o.parent is arm) or ("_rosto_" in o.name and not o.name.endswith("_neutro")) or ("_cabelo_" in o.name) or "_barba" in o.name or "_bigode" in o.name
scn.render.engine = "CYCLES"; scn.cycles.samples = 8; scn.cycles.use_denoising = True; scn.cycles.device = "CPU"
scn.render.resolution_x, scn.render.resolution_y = 300, 300
w = bpy.data.worlds.new("w"); scn.world = w; w.use_nodes = True; w.node_tree.nodes["Background"].inputs[0].default_value = (0.86, 0.87, 0.9, 1)
w.node_tree.nodes["Background"].inputs[1].default_value = 0.6
bpy.ops.object.light_add(type="SUN"); L = bpy.context.active_object; L.data.energy = 3
cd = bpy.data.cameras.new("c"); cam = bpy.data.objects.new("c", cd); scn.collection.objects.link(cam); scn.camera = cam; cd.type = "ORTHO"
for item in LISTA.split(","):
    n, lado = (item.split(":") + ["ambos"])[:2]
    if n not in bpy.data.actions:
        print("sem", n); continue
    act = bpy.data.actions[n]; arm.animation_data.action = act
    if act.slots: arm.animation_data.action_slot = act.slots[0]
    f0, f1 = act.frame_range
    for k, u in enumerate((0.25, 0.5, 0.75)):
        scn.frame_set(int(f0 + u * (f1 - f0)))
        mL, mR = mw @ arm.pose.bones["LeftHand"].head, mw @ arm.pose.bones["RightHand"].head
        alvo = mL if lado == "Left" else mR if lado == "Right" else (mL + mR) / 2
        cd.ortho_scale = 0.3 if lado in ("Left", "Right") else max(0.4, (mL - mR).length + 0.25)
        if lado == "corpo":
            alvo = mw @ arm.pose.bones["Spine1"].head; cd.ortho_scale = 1.3
        q = arm.pose.bones["Hips"].matrix.to_quaternion()
        for vv, az in (("a", 30), ("b", -60)):
            d = Vector((math.sin(math.radians(az)), -math.cos(math.radians(az)), 0.5)).normalized()
            cam.location = alvo + d * 4; cam.rotation_euler = (alvo - cam.location).to_track_quat("-Z", "Y").to_euler()
            L.rotation_euler = cam.rotation_euler
            scn.render.filepath = os.path.join(OUT, f"{n}_{k}{vv}.png"); bpy.ops.render.render(write_still=True)
