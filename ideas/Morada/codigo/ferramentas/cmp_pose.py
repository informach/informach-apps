import bpy, sys, math
a = sys.argv[sys.argv.index("--") + 1:]
bpy.ops.wm.open_mainfile(filepath=a[0])
arm = bpy.data.objects[a[1]]; mw = arm.matrix_world
print("arm mw", [round(x, 3) for x in mw.to_translation()], [round(math.degrees(x), 1) for x in mw.to_euler()], "pai", arm.parent.name if arm.parent else None,
      [round(x, 3) for x in arm.parent.matrix_world.to_translation()] if arm.parent else None)
for n in a[2].split(","):
    act = bpy.data.actions[n]; arm.animation_data.action = act
    if act.slots: arm.animation_data.action_slot = act.slots[0]
    bpy.context.scene.frame_set(int(sum(act.frame_range) / 2))
    f = lambda b: tuple(round(x, 2) for x in (mw @ arm.pose.bones[b].head))
    print(n, "quadril", f("Hips"), "cabeça", f("Head"), "pé", f("LeftFoot"))
