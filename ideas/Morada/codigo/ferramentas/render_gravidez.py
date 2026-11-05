"""Prévia da barriga: cada corpo nos estágios 0–3, de lado e em três quartos (braços para baixo)."""
import bpy, sys, math, os
from mathutils import Vector
a = sys.argv[sys.argv.index("--") + 1:]
BLEND, OUT, CORPOS = a[0], a[1], a[2].split(",")
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=BLEND)
scn = bpy.context.scene
for o in [o for o in bpy.data.objects if o.type in ("LIGHT", "CAMERA")]: bpy.data.objects.remove(o, do_unlink=True)
scn.render.engine = "CYCLES"; scn.cycles.samples = 16; scn.cycles.use_denoising = True; scn.cycles.device = "CPU"
scn.render.resolution_x, scn.render.resolution_y = 300, 520; scn.render.film_transparent = False
w = bpy.data.worlds.new("w"); scn.world = w; w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.86, 0.87, 0.9, 1); w.node_tree.nodes["Background"].inputs[1].default_value = 0.8
bpy.ops.object.light_add(type="AREA", location=(1.5, -3, 3)); L = bpy.context.active_object; L.data.energy = 300; L.data.size = 3
cd = bpy.data.cameras.new("c"); cam = bpy.data.objects.new("c", cd); scn.collection.objects.link(cam); scn.camera = cam; cd.type = "ORTHO"; cd.ortho_scale = 2.0
for c in CORPOS:
    arm = bpy.data.objects[c]; lugar = arm.parent
    if arm.animation_data: arm.animation_data.action = None
    for pb in arm.pose.bones: pb.matrix_basis.identity()
    for lado in ("Left", "Right"):  # braços para baixo para ver a barriga de lado
        pb = arm.pose.bones[lado + "Arm"]; pb.rotation_mode = "XYZ"
    for o in bpy.data.objects:
        if o.type == "MESH":
            o.hide_render = not (o.parent is arm) or ("_rosto_" in o.name and not o.name.endswith("_neutro"))
    x = lugar.location.x; alvo = Vector((x, 0, 0.95))
    corpo = bpy.data.objects[c + "_corpo"]; kbs = corpo.data.shape_keys.key_blocks
    for est in range(4):
        for kb in kbs[1:]: kb.value = 1.0 if kb.name == f"gravidez_{est}" else 0.0
        for vista, az in (("lado", 90), ("tq", 35)):
            d = Vector((math.sin(math.radians(az)), -math.cos(math.radians(az)), 0.05)).normalized()
            cam.location = alvo + d * 6; cam.rotation_euler = (alvo - cam.location).to_track_quat("-Z", "Y").to_euler()
            L.location = alvo + Vector((1.5, -3, 2.5)); L.rotation_euler = (alvo - L.location).to_track_quat("-Z", "Y").to_euler()
            scn.render.filepath = os.path.join(OUT, f"{c}_{est}_{vista}.png"); bpy.ops.render.render(write_still=True)
