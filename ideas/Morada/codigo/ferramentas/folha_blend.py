"""Renderiza 4 quadros de cada ação de uma biblioteca (.blend) no próprio corpo."""
import bpy, os, sys, math
from mathutils import Vector
a = sys.argv[sys.argv.index("--") + 1:]
BLEND, CORPO, OUT = a[:3]
SO = set(os.environ.get("SO", "").split(",")) - {""}
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=BLEND)
scn = bpy.context.scene
arm = bpy.data.objects[CORPO]
malhas = [o for o in bpy.data.objects if o.type == "MESH" and o.parent is arm and not o.hide_render and ("_rosto_" not in o.name or o.name.endswith("_neutro"))]
for o in bpy.data.objects:
    if o.type == "MESH" and o not in malhas: o.hide_render = True
scn.render.engine = "CYCLES"; scn.cycles.samples = 8; scn.cycles.use_denoising = True; scn.cycles.device = "CPU"
scn.render.resolution_x, scn.render.resolution_y = 220, 280
w = bpy.data.worlds.new("w"); scn.world = w; w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.85, 0.87, 0.92, 1)
for o in [o for o in bpy.data.objects if o.type in ("LIGHT", "CAMERA")]: bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.object.light_add(type="SUN"); s = bpy.context.active_object; s.data.energy = 3; s.rotation_euler = (math.radians(50), 0, math.radians(-30))
bpy.ops.mesh.primitive_plane_add(size=40)
cd = bpy.data.cameras.new("c"); cam = bpy.data.objects.new("c", cd); scn.collection.objects.link(cam); scn.camera = cam; cd.type = "ORTHO"
def enquadra():
    bpy.context.view_layer.update(); dg = bpy.context.evaluated_depsgraph_get(); pts = []
    for o in malhas:
        ev = o.evaluated_get(dg); me = ev.to_mesh(); pts += [ev.matrix_world @ v.co for i, v in enumerate(me.vertices) if i % 7 == 0]; ev.to_mesh_clear()
    lo = Vector([min(p[i] for p in pts) for i in range(3)]); hi = Vector([max(p[i] for p in pts) for i in range(3)])
    c = (lo + hi) / 2; tam = max((hi - lo).length, 0.6)
    az, el = math.radians(-30), math.radians(12)
    cam.location = c + Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el))) * 10
    cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler(); cd.ortho_scale = tam * 1.15
for act in sorted(bpy.data.actions, key=lambda x: x.name):
    if SO and act.name not in SO: continue
    arm.animation_data.action = act
    if act.slots: arm.animation_data.action_slot = act.slots[0]
    f0, f1 = [int(x) for x in act.frame_range]
    for k, t in enumerate((0.0, 0.33, 0.66, 1.0)):
        scn.frame_set(int(f0 + (f1 - f0) * t)); enquadra()
        scn.render.filepath = os.path.join(OUT, f"{act.name}__{k}.png"); bpy.ops.render.render(write_still=True)
    print("feito", act.name, flush=True)
