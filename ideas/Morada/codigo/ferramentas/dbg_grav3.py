import bpy, sys
import numpy as np
bpy.ops.wm.open_mainfile(filepath=sys.argv[sys.argv.index("--") + 1])
o = bpy.data.objects["adulta_corpo"]; kbs = o.data.shape_keys.key_blocks
print("slider_max", [kb.slider_max for kb in kbs], "use_relative", o.data.shape_keys.use_relative, "lock", o.show_only_shape_key)
for est in range(4):
    for kb in kbs[1:]: kb.value = 1.0 if kb.name == f"gravidez_{est}" else 0.0
    bpy.context.view_layer.update()
    ev = o.evaluated_get(bpy.context.evaluated_depsgraph_get()); me = ev.to_mesh()
    P = np.array([ev.matrix_world @ v.co for v in me.vertices]); ev.to_mesh_clear()
    sel = (np.abs(P[:,0] - P[:,0].mean()) < 0.04) & (P[:,2] > 0.9) & (P[:,2] < 1.2)
    print(est, [ (kb.name, kb.value) for kb in kbs[1:]], "frente mín y", P[sel,1].min().round(3))
