import bpy, sys
import numpy as np
bpy.ops.wm.open_mainfile(filepath=sys.argv[sys.argv.index("--") + 1])
o = bpy.data.objects["adulta_corpo"]; kbs = o.data.shape_keys.key_blocks
def frente():
    bpy.context.view_layer.update()
    ev = o.evaluated_get(bpy.context.evaluated_depsgraph_get()); me = ev.to_mesh()
    P = np.array([ev.matrix_world @ v.co for v in me.vertices]); ev.to_mesh_clear()
    sel = (np.abs(P[:,0] - P[:,0].mean()) < 0.04) & (P[:,2] > 0.9) & (P[:,2] < 1.2)
    return P[sel,1].min().round(3)
for combo in ([0,0,1],[0,1,1],[1,0,0],[0,0,0.5],[0,0,1]):
    for kb, v in zip(kbs[1:], combo): kb.value = v
    print(combo, frente())
o.data.update_tag(); print("após update_tag", frente())
o.active_shape_key_index = 3; o.show_only_shape_key = True; print("só a 3", frente())
