import bpy, bmesh, collections
bpy.ops.wm.open_mainfile(filepath='morada-art/build/mh_avo.blend')
o = [x for x in bpy.data.objects if x.name.startswith('avo_blusa')][0]
print(o.name, [m.type for m in o.modifiers])
bm = bmesh.new(); bm.from_mesh(o.data)
bd = [e for e in bm.edges if e.is_boundary]
print('arestas de borda', len(bd))
# agrupa bordas por região aproximada
pts = [ (o.matrix_world @ ((e.verts[0].co+e.verts[1].co)/2)) for e in bd]
buckets = collections.Counter((round(p.x,1), round(p.z,1)) for p in pts)
print(sorted(buckets.items(), key=lambda kv:-kv[1])[:25])
# também a justa original: quantas bordas?
