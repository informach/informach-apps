import bpy, os, sys, glob, math
from mathutils import Vector
a = sys.argv[sys.argv.index("--") + 1:]
corpo_fbx, pasta, out = a[0], a[1], a[2]
os.makedirs(out, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=corpo_fbx)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
malhas = [o for o in bpy.data.objects if o.type == "MESH"]
scn = bpy.context.scene
scn.render.engine = "CYCLES"; scn.cycles.samples = 8; scn.cycles.use_denoising = True; scn.cycles.device = "CPU"
scn.render.resolution_x, scn.render.resolution_y = 220, 280
scn.render.film_transparent = False
w = bpy.data.worlds.new("w"); scn.world = w; w.use_nodes = True; w.node_tree.nodes["Background"].inputs[0].default_value = (0.85, 0.87, 0.92, 1); w.node_tree.nodes["Background"].inputs[1].default_value = 1.0
bpy.ops.object.light_add(type="SUN"); s = bpy.context.active_object; s.data.energy = 3; s.rotation_euler = (math.radians(50), 0, math.radians(-30))
# chão
bpy.ops.mesh.primitive_plane_add(size=40); chao = bpy.context.active_object
m = bpy.data.materials.new("chao"); m.use_nodes = True; m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.6, 0.62, 0.66, 1); chao.data.materials.append(m)
cd = bpy.data.cameras.new("c"); cam = bpy.data.objects.new("c", cd); scn.collection.objects.link(cam); scn.camera = cam; cd.type = "ORTHO"
def enquadra():
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get(); pts = []
    for o in malhas:
        ev = o.evaluated_get(dg); me = ev.to_mesh(); pts += [ev.matrix_world @ v.co for i, v in enumerate(me.vertices) if i % 7 == 0]; ev.to_mesh_clear()
    lo = Vector([min(p[i] for p in pts) for i in range(3)]); hi = Vector([max(p[i] for p in pts) for i in range(3)])
    c = (lo + hi) / 2; tam = max((hi - lo).length, 1.0)
    az, el = math.radians(-30), math.radians(12)
    cam.location = c + Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el))) * 10
    cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler(); cd.ortho_scale = tam * 1.15
SO = os.environ.get("SO")
alvo = [f for f in sorted(glob.glob(os.path.join(pasta, "*.fbx"))) if not SO or os.path.splitext(os.path.basename(f))[0] in SO.split("|")]
for f in alvo:
    nome = os.path.splitext(os.path.basename(f))[0]
    antes = set(bpy.data.objects); acoes = set(bpy.data.actions)
    bpy.ops.import_scene.fbx(filepath=f)
    novos = [x for x in bpy.data.objects if x not in antes]
    src = next(x for x in novos if x.type == "ARMATURE")
    for x in novos:
        if x is not src: bpy.data.objects.remove(x, do_unlink=True)
    src.hide_render = True
    # repouso do Mixamo é em T: copia a orientação de cada osso no mundo (e a posição do quadril)
    for pb in arm.pose.bones:
        for c in list(pb.constraints): pb.constraints.remove(c)
        if pb.name not in src.pose.bones: continue
        c = pb.constraints.new("COPY_ROTATION"); c.target = src; c.subtarget = pb.name
        c.target_space = "WORLD"; c.owner_space = "WORLD"
        if pb.name == "Hips":
            c2 = pb.constraints.new("COPY_LOCATION"); c2.target = src; c2.subtarget = pb.name
            c2.target_space = "WORLD"; c2.owner_space = "WORLD"
    act = src.animation_data.action
    f0, f1 = [int(x) for x in act.frame_range]
    for k, t in enumerate((0.0, 0.33, 0.66, 1.0)):
        scn.frame_set(int(f0 + (f1 - f0) * t)); enquadra()
        scn.render.filepath = os.path.join(out, f"{nome}__{k}.png"); bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(src, do_unlink=True)
    print("feito", nome, flush=True)
