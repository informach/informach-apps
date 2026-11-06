import sys, bpy
p = sys.argv[sys.argv.index("--")+1]
bpy.ops.wm.read_factory_settings(use_empty=True)
if p.endswith(".fbx"): bpy.ops.import_scene.fbx(filepath=p)
else: bpy.ops.import_scene.gltf(filepath=p)
import mathutils
pts=[o.matrix_world@mathutils.Vector(c) for o in bpy.data.objects if o.type=="MESH" for c in o.bound_box]
for i in range(3): print("eixo",i,min(v[i] for v in pts),max(v[i] for v in pts))
