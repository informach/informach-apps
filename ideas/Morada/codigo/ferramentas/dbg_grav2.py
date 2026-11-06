import bpy, sys
import numpy as np
bpy.ops.wm.open_mainfile(filepath=sys.argv[sys.argv.index("--") + 1])
o = bpy.data.objects["adulta_corpo"]; kbs = o.data.shape_keys.key_blocks
print([ (kb.name, kb.relative_key.name, kb.value, kb.mute) for kb in kbs])
B = np.array([kb.co[:] for kb in kbs["Basis"].data])
for n in ("gravidez_1","gravidez_2","gravidez_3"):
    K = np.array([kb.co[:] for kb in kbs[n].data]); d = K - B
    print(n, "max |d|", np.abs(d).max(0).round(3))
