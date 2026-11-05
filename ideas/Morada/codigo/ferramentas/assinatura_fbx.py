import bpy, sys, os, json, math
args = sys.argv[sys.argv.index("--") + 1:]
lista, saida = args[0], args[1]
arqs = json.load(open(lista))
OSSOS = ["Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand",
         "LeftUpLeg", "LeftLeg", "LeftFoot", "LeftToeBase"]
res = {}
for i, f in enumerate(arqs):
    try:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.fbx(filepath=f)
        arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
        s = arm.matrix_world.to_scale()[0]
        b = arm.data.bones
        assin = [round(b[n].length * s, 4) if n in b else 0 for n in OSSOS]
        r = {"assin": assin, "ossos": len(b)}
        a = arm.animation_data.action if arm.animation_data else None
        if a:
            f0, f1 = a.frame_range; r["quadros"] = int(f1 - f0 + 1)
            hp = arm.pose.bones["Hips"]; xs = []
            for fr in range(int(f0), int(f1) + 1, 3):
                bpy.context.scene.frame_set(fr); p = arm.matrix_world @ hp.head; xs.append(tuple(p))
            r["xy"] = round(math.hypot(max(x[0] for x in xs) - min(x[0] for x in xs), max(x[1] for x in xs) - min(x[1] for x in xs)), 3)
            r["z"] = [round(min(x[2] for x in xs), 3), round(max(x[2] for x in xs), 3)]
        res[f] = r
    except Exception as e:
        res[f] = {"erro": str(e)}
    if i % 50 == 0: print("prog", i, flush=True)
json.dump(res, open(saida, "w"))
print("fim", len(res))
