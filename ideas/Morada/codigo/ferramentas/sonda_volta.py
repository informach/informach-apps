import bpy, os, sys
import numpy as np
for f in sys.argv[sys.argv.index("--") + 1:]:
    bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.fbx(filepath=os.path.abspath(f))
    sc = bpy.context.scene
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE"); a = bpy.data.actions[0]
    ms = [o.name for o in bpy.data.objects if o.type == "MESH"]
    f0, f1 = (int(x) for x in a.frame_range); P = []
    for fr in range(f0, f1 + 1, max(1, (f1 - f0) // 12)):
        sc.frame_set(fr); P.append(tuple(arm.matrix_world @ arm.pose.bones["Hips"].head))
    P = np.array(P)
    print(os.path.basename(f), "esqueleto", arm.name, len(arm.data.bones), "ossos; malhas", ms, "quadros", f1 - f0 + 1, "fps", sc.render.fps,
          "quadril min", P.min(0).round(2), "max", P.max(0).round(2))
