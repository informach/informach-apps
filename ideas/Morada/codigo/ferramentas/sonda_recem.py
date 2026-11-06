import bpy, sys
import numpy as np
bpy.ops.wm.open_mainfile(filepath=sys.argv[sys.argv.index("--") + 1])
for o in bpy.data.objects:
    if o.type == "MESH" and ("manta" in o.name or "cabelo" in o.name or o.name.endswith("_corpo")):
        P = np.array([o.matrix_world @ v.co for v in o.data.vertices]) if len(o.data.vertices) else np.zeros((1, 3))
        print(o.name, len(o.data.vertices), len(o.data.polygons), P.min(0).round(3), P.max(0).round(3), o.hide_render, [m.type for m in o.modifiers])
