import sys, math
import bpy
from mathutils import Vector
bpy.ops.wm.open_mainfile(filepath=sys.argv[1])
ch = bpy.data.objects["Esqueleto"]
ref = {b.name: (ch.matrix_world.to_3x3() @ b.matrix_local.to_3x3()).normalized() for b in ch.data.bones}
bpy.ops.import_scene.fbx(filepath=sys.argv[2])
ms = next(o for o in bpy.data.objects if o.type == "ARMATURE" and o != ch)
for b in ms.data.bones:
    if b.name not in ref: continue
    m = (ms.matrix_world.to_3x3() @ b.matrix_local.to_3x3()).normalized()
    r = ref[b.name]
    ang = lambda a, c: math.degrees(a.angle(c))
    print(f"{b.name:28s} Y {ang(m.col[1], r.col[1]):6.1f}  Z {ang(m.col[2], r.col[2]):6.1f}")
