import bpy, sys
import numpy as np
bpy.ops.wm.open_mainfile(filepath=sys.argv[sys.argv.index("--") + 1])
arm = bpy.data.objects["adulta"]; o = bpy.data.objects["adulta_corpo"]
print("forma 3 =", o.data.shape_keys.key_blocks["gravidez_3"].value)
for n in ("resident.gravida.belly_hold", "resident.gravida.back_hold"):
    act = bpy.data.actions[n]; arm.animation_data.action = act
    if act.slots: arm.animation_data.action_slot = act.slots[0]
    bpy.context.scene.frame_set(20)
    ev = o.evaluated_get(bpy.context.evaluated_depsgraph_get()); me = ev.to_mesh()
    P = np.array([ev.matrix_world @ v.co for v in me.vertices]); ev.to_mesh_clear()
    mw = arm.matrix_world; h = mw @ arm.pose.bones["Hips"].head
    sel = (np.abs(P[:,0]-h.x) < 0.05) & (P[:,2] > h.z) & (P[:,2] < h.z + 0.3)
    f = lambda b: tuple(round(x, 2) for x in (mw @ arm.pose.bones[b].head))
    print(n, "frente da barriga y", round(float(P[sel,1].min()), 3), "quadril", tuple(round(x,2) for x in h), "mãos", f("LeftHand"), f("RightHand"))
