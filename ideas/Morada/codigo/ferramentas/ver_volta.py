import bpy, os, sys, math
import numpy as np
from mathutils import Vector
F = os.path.abspath(sys.argv[sys.argv.index("--") + 1]); OUT = os.path.abspath(sys.argv[sys.argv.index("--") + 2])
bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.fbx(filepath=F)
scn = bpy.context.scene
cubo = bpy.data.objects.get("Cube")
if cubo:
    P = np.array([cubo.matrix_world @ v.co for v in cubo.data.vertices]); print("Cube min", P.min(0).round(3), "max", P.max(0).round(3), "pai", cubo.parent.name if cubo.parent else None,
          "anim", bool(cubo.animation_data and cubo.animation_data.action))
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
a = bpy.data.actions[0]
nomes = sorted({fc.data_path.split('"')[1] for lay in a.layers for st in lay.strips for cb in st.channelbags for fc in cb.fcurves if '"' in fc.data_path})
print("ossos animados", len(nomes), [n for n in nomes if "Hand" in n][:6])
img = next((i for i in bpy.data.images), None)
scn.render.engine = "CYCLES"; scn.cycles.samples = 12; scn.cycles.device = "CPU"; scn.view_settings.view_transform = "Standard"
w = bpy.data.worlds.new("w"); scn.world = w; w.use_nodes = True; w.node_tree.nodes["Background"].inputs[1].default_value = 2.5
cd = bpy.data.cameras.new("c"); cam = bpy.data.objects.new("c", cd); scn.collection.objects.link(cam); scn.camera = cam
cd.type = "ORTHO"; cd.ortho_scale = 2.8; scn.render.resolution_x = scn.render.resolution_y = 260
f0, f1 = (int(x) for x in a.frame_range)
for i, f in enumerate(np.linspace(f0, f1, 6).astype(int)):
    scn.frame_set(int(f)); c = Vector((0, 0, 1.1))
    cam.location = c + Vector((3, -3.5, 1.2)); cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler()
    scn.render.filepath = f"{OUT}_{i}.png"; bpy.ops.render.render(write_still=True)
print("ok")
