import bpy, sys
import numpy as np
a = sys.argv[sys.argv.index("--") + 1:]
def le(f):
    bpy.ops.wm.open_mainfile(filepath=f); r = {}
    for c in ("adulta", "plus_f", "atletica"):
        o = bpy.data.objects[c + "_corpo"]; kb = o.data.shape_keys.key_blocks
        r[c] = (len(o.data.vertices), o.get("barriga_subdividida"), {n: np.array([d.co[:] for d in kb[n].data]) for n in ("gravidez_1", "gravidez_2", "gravidez_3")})
    return r
A, B = le(a[0]), le(a[1])
for c in A:
    print(c, "verts", A[c][0], B[c][0], "subdiv", A[c][1], B[c][1], "dif máx", max(float(np.abs(A[c][2][n] - B[c][2][n]).max()) for n in A[c][2]))
