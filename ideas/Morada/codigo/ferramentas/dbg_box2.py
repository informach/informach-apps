import bpy, sys
a = sys.argv[sys.argv.index("--") + 1:]
bpy.ops.wm.open_mainfile(filepath=a[0])
arm = bpy.data.objects["adulto"]; act = bpy.data.actions["resident.carry.box.idle"]
arm.animation_data.action = act
if act.slots: arm.animation_data.action_slot = act.slots[0]
bpy.context.scene.frame_set(1); mw = arm.matrix_world
f = lambda v: tuple(round(x, 2) for x in v)
print("mãos", f(mw @ arm.pose.bones["LeftHand"].head), f(mw @ arm.pose.bones["RightHand"].head))
