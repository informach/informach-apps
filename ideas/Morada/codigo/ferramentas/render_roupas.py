"""Corpos vestidos com conjuntos do catálogo (frente e três quartos), para revisão.
Uso: python render_roupas.py -- <blend> <saida> <corpos> <conjunto1;conjunto2;...> [gravidez]   (conjunto: ids separados por vírgula)"""
import bpy, sys, math, os
from mathutils import Vector
a = sys.argv[sys.argv.index("--") + 1:]
BLEND, OUT, CORPOS, CONJ = a[0], a[1], a[2].split(","), [c.split(",") for c in a[3].split(";")]
GRAV = a[4] if len(a) > 4 else None
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=BLEND)
scn = bpy.context.scene
for o in [o for o in bpy.data.objects if o.type in ("LIGHT", "CAMERA")]: bpy.data.objects.remove(o, do_unlink=True)
scn.render.engine = "CYCLES"; scn.cycles.samples = 12; scn.cycles.use_denoising = True; scn.cycles.device = "CPU"
scn.render.resolution_x, scn.render.resolution_y = 300, 420
w = bpy.data.worlds.new("w"); scn.world = w; w.use_nodes = True; w.node_tree.nodes["Background"].inputs[0].default_value = (0.86, 0.87, 0.9, 1)
bpy.ops.object.light_add(type="SUN"); L = bpy.context.active_object; L.data.energy = 3.5
cd = bpy.data.cameras.new("c"); cam = bpy.data.objects.new("c", cd); scn.collection.objects.link(cam); scn.camera = cam; cd.type = "ORTHO"
for c in CORPOS:
    arm = bpy.data.objects[c]
    if arm.animation_data: arm.animation_data.action = None
    for pb in arm.pose.bones: pb.matrix_basis.identity()
    filhos = [o for o in bpy.data.objects if o.type == "MESH" and o.parent is arm]
    corpo = bpy.data.objects[c + "_corpo"]
    if GRAV and corpo.data.shape_keys:
        for o in filhos:
            if o.data.shape_keys:
                for kb in o.data.shape_keys.key_blocks[1:]: kb.value = 1.0 if kb.name == "gravidez_" + GRAV else 0.0
    bpy.context.view_layer.update()
    P = [corpo.matrix_world @ v.co for v in corpo.data.vertices]
    zt = max(p.z for p in P); xm = sum(p.x for p in P) / len(P)
    alvo = Vector((xm, 0, zt * 0.52)); cd.ortho_scale = zt * 1.12
    for k, ids in enumerate(CONJ):
        quer = {c + "_" + i for i in ids} | {c + "_corpo", c + "_rosto_neutro", c + "_cabelo"}
        if any(i.startswith("roupa_bone") or i.startswith("roupa_chapeu") or i.startswith("roupa_gorro") for i in ids):
            quer.discard(c + "_cabelo")
        for o in bpy.data.objects:
            if o.type == "MESH": o.hide_render = o.name not in quer
        for v, az in (("f", 0), ("l", 50)):
            d = Vector((math.sin(math.radians(az)), -math.cos(math.radians(az)), 0.12)).normalized()
            cam.location = alvo + d * 6; cam.rotation_euler = (alvo - cam.location).to_track_quat("-Z", "Y").to_euler()
            L.rotation_euler = cam.rotation_euler
            scn.render.filepath = os.path.join(OUT, f"{c}_{k}_{v}{'_g' + GRAV if GRAV else ''}.png"); bpy.ops.render.render(write_still=True)
