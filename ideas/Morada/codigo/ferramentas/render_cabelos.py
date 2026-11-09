"""Cabeça de cada corpo com cada penteado (careca, raspado, original, extras, barba)."""
import bpy, sys, math, os
from mathutils import Vector
a = sys.argv[sys.argv.index("--") + 1:]
BLEND, OUT, CORPOS = a[0], a[1], a[2].split(",")
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=BLEND)
scn = bpy.context.scene
for o in [o for o in bpy.data.objects if o.type in ("LIGHT", "CAMERA")]: bpy.data.objects.remove(o, do_unlink=True)
scn.render.engine = "CYCLES"; scn.cycles.samples = 16; scn.cycles.use_denoising = True; scn.cycles.device = "CPU"
scn.render.resolution_x, scn.render.resolution_y = 260, 260
w = bpy.data.worlds.new("w"); scn.world = w; w.use_nodes = True; w.node_tree.nodes["Background"].inputs[0].default_value = (0.86, 0.87, 0.9, 1)
bpy.ops.object.light_add(type="AREA", location=(1.5, -3, 3)); L = bpy.context.active_object; L.data.energy = 300; L.data.size = 3
cd = bpy.data.cameras.new("c"); cam = bpy.data.objects.new("c", cd); scn.collection.objects.link(cam); scn.camera = cam; cd.type = "ORTHO"
for c in CORPOS:
    arm = bpy.data.objects[c]
    if arm.animation_data: arm.animation_data.action = None
    for pb in arm.pose.bones: pb.matrix_basis.identity()
    bpy.context.view_layer.update()
    mesh = [o for o in bpy.data.objects if o.type == "MESH" and o.parent is arm]
    import re as _re
    facial = lambda o: _re.search(r"_(barba(_\d)?|bigode_\d)$", o.name)
    cabelos = sorted([o for o in mesh if "_cabelo" in o.name or facial(o)], key=lambda o: o.name)
    base = [o for o in mesh if o not in cabelos and ("_rosto_" not in o.name or o.name.endswith("_neutro")) and "_chupeta" not in o.name]
    head = arm.matrix_world @ arm.pose.bones["Head"].head
    alt = max((o.matrix_world @ v.co).z for o in base for v in o.data.vertices)
    alvo = Vector((head.x, head.y, (head.z + alt) / 2)); cd.ortho_scale = (alt - head.z) * 2.2
    estilos = [("careca", None)] + [(o.name.split(c + "_", 1)[1], o) for o in cabelos if not facial(o)]
    estilos += [(o.name.split(c + "_", 1)[1], o) for o in cabelos if facial(o)]
    for nome, ob in estilos:
        for o in bpy.data.objects:
            if o.type == "MESH": o.hide_render = o not in base and o is not ob
        for az, v in ((0, "f"), (60, "l")):
            d = Vector((math.sin(math.radians(az)), -math.cos(math.radians(az)), 0.15)).normalized()
            cam.location = alvo + d * 5; cam.rotation_euler = (alvo - cam.location).to_track_quat("-Z", "Y").to_euler()
            L.location = alvo + Vector((1.5, -3, 2)); L.rotation_euler = (alvo - L.location).to_track_quat("-Z", "Y").to_euler()
            scn.render.filepath = os.path.join(OUT, f"{c}__{nome}__{v}.png"); bpy.ops.render.render(write_still=True)
