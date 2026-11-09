import bpy, sys
import numpy as np
bpy.ops.wm.open_mainfile(filepath=sys.argv[sys.argv.index("--") + 1])
o = bpy.data.objects["adulta_corpo"]; kbs = o.data.shape_keys.key_blocks
for kb in kbs: print(kb.name, kb.relative_key.name, kb.vertex_group, kb.slider_min, kb.slider_max, kb.interpolation, kb.mute, len(kb.data))
print("mods", [(m.type, m.show_viewport) for m in o.modifiers])
B = np.array([d.co[:] for d in kbs["Basis"].data]); G3 = np.array([d.co[:] for d in kbs["gravidez_3"].data])
print("diff3", np.abs(G3-B).max())
print("anim", o.data.shape_keys.animation_data)
