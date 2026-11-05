import bpy, sys
a = sys.argv[sys.argv.index("--") + 1:]
bpy.ops.wm.open_mainfile(filepath=a[0])
arm = bpy.data.objects["adulto"]; mw = arm.matrix_world
f = lambda v: tuple(round(x, 2) for x in v)
for n in a[1].split(","):
    act = bpy.data.actions[n]; arm.animation_data.action = act
    if act.slots: arm.animation_data.action_slot = act.slots[0]
    bpy.context.scene.frame_set(10)
    print(n, "quadril", f(mw @ arm.pose.bones["Hips"].head), "mãoE", f(mw @ arm.pose.bones["LeftHand"].head), "mãoD", f(mw @ arm.pose.bones["RightHand"].head))
