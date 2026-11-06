import bpy, os, sys, math
import numpy as np
from mathutils import Vector
F = os.path.abspath(sys.argv[sys.argv.index("--") + 1]); OUT = os.path.abspath(sys.argv[sys.argv.index("--") + 2])
bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.fbx(filepath=F)
scn = bpy.context.scene
img = bpy.data.images.load(os.path.abspath("ideias/Casino/textures/textures/Textures_4.png"))
for m in bpy.data.materials:
    if not m.node_tree: continue
    for n in m.node_tree.nodes:
        if n.type == "TEX_IMAGE": n.image = img; n.interpolation = "Closest"
    b = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    t = next((n for n in m.node_tree.nodes if n.type == "TEX_IMAGE"), None)
    if b and t and not b.inputs[0].links: m.node_tree.links.new(t.outputs[0], b.inputs[0])
    if b: b.inputs["Roughness"].default_value = 0.75
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
a = bpy.data.actions[0]
scn.render.engine = "CYCLES"; scn.cycles.samples = 16; scn.cycles.device = "CPU"; scn.view_settings.view_transform = "Standard"; scn.view_settings.exposure = -0.3
w = bpy.data.worlds.new("w"); scn.world = w; w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.3, 0.38, 0.6, 1); w.node_tree.nodes["Background"].inputs[1].default_value = 1.2
bpy.ops.object.light_add(type="SUN"); s = bpy.context.active_object; s.data.energy = 3; s.rotation_euler = (math.radians(45), 0, math.radians(30))
cd = bpy.data.cameras.new("c"); cam = bpy.data.objects.new("c", cd); scn.collection.objects.link(cam); scn.camera = cam
cd.type = "ORTHO"; cd.ortho_scale = 2.6; scn.render.resolution_x, scn.render.resolution_y = 240, 300
f0, f1 = (int(x) for x in a.frame_range)
for vista, az in (("lado", 90), ("frente", 25)):
    for i, f in enumerate(np.linspace(f0, f1, 6).astype(int)):
        scn.frame_set(int(f)); c = Vector((0, 0, 1.15)); r = math.radians(az)
        cam.location = c + Vector((math.sin(r) * 5, -math.cos(r) * 5, 0.6)); cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler()
        scn.render.filepath = f"{OUT}_{vista}_{i}.png"; bpy.ops.render.render(write_still=True)
print("ok")
