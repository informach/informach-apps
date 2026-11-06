"""Corpo vestido com uma animação da biblioteca, em alguns quadros (revisão de roupa em movimento).
Uso: python render_roupas_anim.py -- <corpos.blend> <biblioteca.blend> <corpo> <ids da roupa> <acoes> <saida> [gravidez]"""
import bpy, sys, math, os
from mathutils import Vector
a = sys.argv[sys.argv.index("--") + 1:]
BLEND, BIB, C, ROUPA, ACOES, OUT = a[:6]
GRAV = a[6] if len(a) > 6 else None
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=BLEND)
with bpy.data.libraries.load(BIB, link=False) as (src, dst):
    dst.actions = [n for n in src.actions if n in ACOES.split(",")]
scn = bpy.context.scene
for o in [o for o in bpy.data.objects if o.type in ("LIGHT", "CAMERA")]: bpy.data.objects.remove(o, do_unlink=True)
scn.render.engine = "CYCLES"; scn.cycles.samples = 12; scn.cycles.use_denoising = True; scn.cycles.device = "CPU"
scn.render.resolution_x, scn.render.resolution_y = 320, 420
w = bpy.data.worlds.new("w"); scn.world = w; w.use_nodes = True; w.node_tree.nodes["Background"].inputs[0].default_value = (0.86, 0.87, 0.9, 1)
bpy.ops.object.light_add(type="SUN"); L = bpy.context.active_object; L.data.energy = 3.5
cd = bpy.data.cameras.new("c"); cam = bpy.data.objects.new("c", cd); scn.collection.objects.link(cam); scn.camera = cam; cd.type = "ORTHO"
arm = bpy.data.objects[C]; arm.parent.location.x = 0
quer = {C + "_" + i for i in ROUPA.split(",")} | {C + "_corpo", C + "_rosto_neutro", C + "_cabelo"}
for o in bpy.data.objects:
    if o.type == "MESH":
        o.hide_render = o.name not in quer
        if GRAV and o.parent is arm and o.data.shape_keys:
            for kb in o.data.shape_keys.key_blocks[1:]: kb.value = 1.0 if kb.name == "gravidez_" + GRAV else 0.0
if not arm.animation_data: arm.animation_data_create()
for act in dst.actions:
    arm.animation_data.action = act
    if act.slots: arm.animation_data.action_slot = act.slots[0]
    f0, f1 = act.frame_range
    for k, u in enumerate((0.2, 0.45, 0.7)):
        scn.frame_set(int(f0 + u * (f1 - f0)))
        h = arm.matrix_world @ arm.pose.bones["Hips"].head
        k_ = arm.matrix_world.to_scale()[2] * (bpy.data.objects[C + "_corpo"].dimensions.z / 1.73)
        alvo = Vector((h.x, h.y, max(h.z, 0.45 * k_))); cd.ortho_scale = 2.1 * k_
        for v, az in (("f", 20), ("l", 80)):
            d = Vector((math.sin(math.radians(az)), -math.cos(math.radians(az)), 0.15)).normalized()
            cam.location = alvo + d * 6; cam.rotation_euler = (alvo - cam.location).to_track_quat("-Z", "Y").to_euler()
            L.rotation_euler = cam.rotation_euler
            scn.render.filepath = os.path.join(OUT, f"{C}_{act.name}_{k}{v}.png"); bpy.ops.render.render(write_still=True)
