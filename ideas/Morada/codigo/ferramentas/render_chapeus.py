"""Close da cabeça com chapéus (frente e três quartos). Uso: python render_chapeus.py -- <blend> <saida> <corpos> <ids>"""
import bpy, sys, math, os
from mathutils import Vector
a = sys.argv[sys.argv.index("--") + 1:]
BLEND, OUT, CORPOS, IDS = a[0], a[1], a[2].split(","), a[3].split(",")
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=BLEND); scn = bpy.context.scene
for o in [o for o in bpy.data.objects if o.type in ("LIGHT", "CAMERA")]: bpy.data.objects.remove(o, do_unlink=True)
scn.render.engine = "CYCLES"; scn.cycles.samples = 10; scn.cycles.use_denoising = True; scn.cycles.device = "CPU"
scn.render.resolution_x = scn.render.resolution_y = 240
w = bpy.data.worlds.new("w"); scn.world = w; w.use_nodes = True; w.node_tree.nodes["Background"].inputs[0].default_value = (0.86, 0.87, 0.9, 1)
bpy.ops.object.light_add(type="SUN"); L = bpy.context.active_object; L.data.energy = 3.5
cd = bpy.data.cameras.new("c"); cam = bpy.data.objects.new("c", cd); scn.collection.objects.link(cam); scn.camera = cam; cd.type = "ORTHO"
for c in CORPOS:
    arm = bpy.data.objects[c]
    for pb in arm.pose.bones: pb.matrix_basis.identity()
    bpy.context.view_layer.update()
    h = arm.matrix_world @ arm.pose.bones["Head"].head
    corpo = bpy.data.objects[c + "_corpo"]; top = max((corpo.matrix_world @ v.co).z for v in corpo.data.vertices)
    alvo = Vector((h.x, h.y, (h.z + top) / 2 + 0.03)); cd.ortho_scale = (top - h.z) * 2.6
    for i in IDS:
        quer = {c + "_" + i, c + "_corpo", c + "_rosto_neutro"}
        for o in bpy.data.objects:
            if o.type == "MESH": o.hide_render = o.name not in quer
        for v, az in (("f", 0), ("l", 55)):
            d = Vector((math.sin(math.radians(az)), -math.cos(math.radians(az)), 0.15)).normalized()
            cam.location = alvo + d * 4; cam.rotation_euler = (alvo - cam.location).to_track_quat("-Z", "Y").to_euler(); L.rotation_euler = cam.rotation_euler
            scn.render.filepath = os.path.join(OUT, f"{c}_{i}_{v}.png"); bpy.ops.render.render(write_still=True)
