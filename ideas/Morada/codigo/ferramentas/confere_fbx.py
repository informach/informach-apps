import bpy, os, sys, math
import numpy as np
from mathutils import Vector
fs = sys.argv[sys.argv.index("--") + 1:]
for f in fs:
    bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.fbx(filepath=os.path.abspath(f))
    arms = [o for o in bpy.data.objects if o.type == "ARMATURE"]; ms = [o for o in bpy.data.objects if o.type == "MESH"]
    P = np.array([o.matrix_world @ v.co for o in ms for v in o.data.vertices])
    nariz = P[np.argmin(P[:, 1])]  # ponto mais à frente (-y)
    imgs = [(i.name, i.size[:], i.packed_file is not None or os.path.exists(bpy.path.abspath(i.filepath))) for i in bpy.data.images]
    tri = sum(len(o.data.polygons) for o in ms)
    print(os.path.basename(f), "malhas", len(ms), "ossos", len(arms[0].data.bones) if arms else 0, "altura", round(float(np.ptp(P[:, 2])), 3),
          "largura", round(float(np.ptp(P[:, 0])), 3), "frente(-y) no z", round(float(nariz[2]), 2), "faces", tri, "texturas", imgs)
