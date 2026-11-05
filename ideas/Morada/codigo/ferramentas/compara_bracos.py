import bpy, sys, math
fs = sys.argv[sys.argv.index("--") + 1:]
res = []
for f in fs:
    bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.fbx(filepath=f)
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    a = arm.animation_data.action; f0, f1 = a.frame_range
    ang = []
    for fr in range(int(f0), int(f1) + 1, 4):
        bpy.context.scene.frame_set(fr)
        sh = arm.matrix_world @ arm.pose.bones["LeftArm"].head; el = arm.matrix_world @ arm.pose.bones["LeftForeArm"].head
        v = (el - sh).normalized(); ang.append(math.degrees(math.acos(max(-1, min(1, -v.z)))))  # 0 = braço para baixo
    res.append((f.split("/")[-1], round(sum(ang) / len(ang), 1)))
print(res)
