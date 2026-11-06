import sys
import bpy
import bmesh
from mathutils import Vector
bpy.ops.wm.open_mainfile(filepath=sys.argv[1])
for o in bpy.data.objects:
    if o.type != "MESH" or not any(k in o.name for k in ("blusa", "justa", "vestido")):
        continue
    bm = bmesh.new(); bm.from_mesh(o.data)
    bd = [e for e in bm.edges if e.is_boundary]
    # agrupa em laços
    vis = set(); lacos = []
    adj = {}
    for e in bd:
        for v in e.verts:
            adj.setdefault(v, []).append(e)
    for e in bd:
        if e in vis: continue
        pilha=[e]; grupo=[]
        while pilha:
            x=pilha.pop()
            if x in vis: continue
            vis.add(x); grupo.append(x)
            for v in x.verts:
                pilha += [y for y in adj[v] if y not in vis]
        vs = {v for x in grupo for v in x.verts}
        c = sum((o.matrix_world @ v.co for v in vs), Vector()) / len(vs)
        lacos.append((len(grupo), tuple(round(k,3) for k in c)))
    print(o.name, len(o.data.vertices), sorted(lacos, reverse=True)[:12])
