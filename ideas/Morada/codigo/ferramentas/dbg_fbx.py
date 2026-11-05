import bpy, sys
a = sys.argv[sys.argv.index("--") + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=a[0])
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
bpy.context.scene.frame_set(1); mw = arm.matrix_world
f = lambda v: tuple(round(x, 2) for x in v)
for n in ("LeftArm", "RightArm", "LeftHand", "RightHand"):
    print(n, f(mw @ arm.pose.bones[n].head))
