import bpy, math
bpy.ops.wm.open_mainfile(filepath='morada-art/build/mh_pai.blend')
a = bpy.data.objects['pai_esqueleto']; c = bpy.data.objects['Esqueleto']
print('escala', tuple(a.scale), tuple(c.scale), 'rot', tuple(round(x,3) for x in a.rotation_euler), tuple(round(x,3) for x in c.rotation_euler))
res=[]
for b in c.data.bones:
    if b.name not in a.data.bones: res.append((None,b.name)); continue
    mb = a.data.bones[b.name]
    q1 = (a.matrix_world.to_3x3().normalized() @ mb.matrix_local.to_3x3()).to_quaternion()
    q2 = (c.matrix_world.to_3x3().normalized() @ b.matrix_local.to_3x3()).to_quaternion()
    res.append((round(math.degrees(q1.rotation_difference(q2).angle),1), b.name.replace('mixamorig:','')))
print(sorted([r for r in res if r[0] is not None], reverse=True)[:12]); print('faltando', [r[1] for r in res if r[0] is None])
