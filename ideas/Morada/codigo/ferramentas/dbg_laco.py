import sys
import bpy
import bmesh
from mathutils import Vector
bpy.ops.wm.open_mainfile(filepath=sys.argv[1])
o = bpy.data.objects[sys.argv[2]]
bm = bmesh.new(); bm.from_mesh(o.data)
bd = [e for e in bm.edges if e.is_boundary]
vs = sorted({v for e in bd for v in e.verts if (o.matrix_world @ v.co).x > 0.15 and (o.matrix_world @ v.co).z > 1.2}, key=lambda v: (o.matrix_world @ v.co).y)
for v in vs:
    p = o.matrix_world @ v.co
    print(tuple(round(k, 3) for k in p))
