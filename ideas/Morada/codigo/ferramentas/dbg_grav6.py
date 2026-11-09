import bpy, sys
import numpy as np
bpy.ops.wm.open_mainfile(filepath=sys.argv[sys.argv.index("--") + 1])
o = bpy.data.objects["adulta_corpo"]; kbs = o.data.shape_keys.key_blocks; mw = o.matrix_world
B = np.array([mw @ d.co for d in kbs["Basis"].data])
for n in ("gravidez_2", "gravidez_3"):
    G = np.array([mw @ d.co for d in kbs[n].data]); d = np.linalg.norm(G - B, axis=1)
    i = np.argsort(-d)[:5]
    print(n, [(round(float(d[j]),3), tuple(np.round(B[j] - B.mean(0), 2))) for j in i])
