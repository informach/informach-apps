import bpy, sys, math
from mathutils import Matrix, Vector
a = sys.argv[sys.argv.index("--") + 1:]
bpy.ops.wm.open_mainfile(filepath=a[0])
arm = bpy.data.objects[a[1]]; pb = arm.pose.bones["Hips"]; scn = bpy.context.scene
act = bpy.data.actions[a[2]]; arm.animation_data.action = act
if act.slots: arm.animation_data.action_slot = act.slots[0]
scn.frame_set(1)
mw = arm.matrix_world
M = pb.matrix.copy()
print("root basis", arm.pose.bones["Root"].matrix_basis)
print("world hips", mw @ M.translation, "world Y axis of hips", (mw.to_3x3() @ M.to_3x3()).col[1])
L = mw @ arm.pose.bones["LeftShoulder"].head; R_ = mw @ arm.pose.bones["RightShoulder"].head; print("L-R", L - R_)
rot = Matrix.Rotation(math.pi, 4, "Z")
A = mw.inverted() @ rot @ mw
pb.matrix = A @ M
bpy.context.view_layer.update()
L = mw @ arm.pose.bones["LeftShoulder"].head; R_ = mw @ arm.pose.bones["RightShoulder"].head; print("after set L-R", L - R_, "hips", mw @ pb.matrix.translation)
print("basis now", pb.location, pb.rotation_quaternion, "R^-1AM", (pb.bone.matrix_local.inverted() @ A @ M).decompose()[:2])
