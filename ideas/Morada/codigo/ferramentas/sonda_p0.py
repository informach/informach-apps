import bpy, os, sys, glob, json
pasta = sys.argv[sys.argv.index("--") + 1]
ref = sys.argv[sys.argv.index("--") + 2]  # fbx do nosso adulto com esqueleto
bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.fbx(filepath=ref)
NOSSOS = {b.name for o in bpy.data.objects if o.type == "ARMATURE" for b in o.data.bones}
out = []
for f in sorted(glob.glob(os.path.join(pasta, "*.fbx"))):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=f)
    arm = next((o for o in bpy.data.objects if o.type == "ARMATURE"), None)
    ms = [o for o in bpy.data.objects if o.type == "MESH"]
    ossos = {b.name for b in arm.data.bones} if arm else set()
    a = arm.animation_data.action if arm and arm.animation_data else None
    r = {"arq": os.path.basename(f), "malhas": len(ms), "ossos": len(ossos), "iguais": len(ossos & NOSSOS), "fps": bpy.context.scene.render.fps}
    if a:
        f0, f1 = a.frame_range; r["quadros"] = int(f1 - f0 + 1)
        hips = arm.pose.bones.get("Hips")
        xs = []
        for fr in range(int(f0), int(f1) + 1, 2):
            bpy.context.scene.frame_set(fr)
            p = arm.matrix_world @ hips.head
            xs.append((p.x, p.y, p.z))
        import math
        dx = max(x[0] for x in xs) - min(x[0] for x in xs); dy = max(x[1] for x in xs) - min(x[1] for x in xs)
        r["desloc_xy"] = round(math.hypot(dx, dy), 2)
        r["hips_z"] = [round(min(x[2] for x in xs), 2), round(max(x[2] for x in xs), 2)]
    out.append(r)
    print(json.dumps(r, ensure_ascii=False))
