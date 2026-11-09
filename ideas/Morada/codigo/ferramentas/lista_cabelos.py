import bpy, sys
import numpy as np
for f in sys.argv[sys.argv.index("--") + 1:]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=f)
    ms = [o for o in bpy.data.objects if o.type == "MESH"]
    corpo = next((o for o in ms if "Body" in o.name or o.name.startswith("ChessPlayer_0") and "_" not in o.name[12:]), None)
    print("##", f.split("/")[-1], [o.name for o in ms])
    for o in ms:
        if any(t in o.name.lower() for t in ("hair", "beard", "cap", "hat", "helmet")):
            P = np.array([o.matrix_world @ v.co for v in o.data.vertices])
            print("   ", o.name, len(o.data.vertices), "z", P[:, 2].min().round(2), P[:, 2].max().round(2), "grupos", len(o.vertex_groups))
