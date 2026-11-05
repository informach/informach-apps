import bpy, sys
a = sys.argv[sys.argv.index("--") + 1:]
BLEND, CORPO = a[:2]; NOMES = a[2].split(",")
bpy.ops.wm.open_mainfile(filepath=BLEND)
scn = bpy.context.scene; arm = bpy.data.objects[CORPO]; mw = arm.matrix_world
for n in NOMES:
    act = bpy.data.actions[n]; arm.animation_data.action = act
    if act.slots: arm.animation_data.action_slot = act.slots[0]
    f0, f1 = [int(x) for x in act.frame_range]
    print(n, f0, f1)
    for f in sorted({f0, (f0 + f1) // 4, (f0 + f1) // 2, 3 * (f0 + f1) // 4, f1}):
        scn.frame_set(f)
        g = lambda b, t=False: tuple(round(v, 2) for v in (mw @ (arm.pose.bones[b].tail if t else arm.pose.bones[b].head)))
        print(" ", f, "hips", g("Hips"), "head", g("Head"), "L", g("LeftHand", 1), "R", g("RightHand", 1), "pé", g("LeftFoot"), g("RightFoot"))
