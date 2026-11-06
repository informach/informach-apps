import bpy
from mathutils import Vector
bpy.ops.wm.open_mainfile(filepath='morada-art/build/mh_pai.blend')
scn = bpy.context.scene; a = bpy.data.objects['pai_esqueleto']; c = bpy.data.objects['pai_corpo']
print('mods', [(m.type, m.name, getattr(m,'object',None) and m.object.name) for m in c.modifiers], 'parent', c.parent)
g = c.vertex_groups['mixamorig:LeftForeArm'].index
ids = [v.index for v in c.data.vertices if any(gg.group==g and gg.weight>0.5 for gg in v.groups)]
print('verts mao esq', len(ids))
for pos, q in (('REST',1), ('POSE',60)):
    a.data.pose_position = pos; scn.frame_set(q); bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get(); ev = c.evaluated_get(dg); me = ev.to_mesh()
    m = sum((c.matrix_world @ me.vertices[i].co for i in ids), Vector())/len(ids)
    hb = a.matrix_world @ a.pose.bones['mixamorig:LeftForeArm'].head
    print(pos, 'malha mão', tuple(round(x,3) for x in m), 'osso mão', tuple(round(x,3) for x in hb))
    ev.to_mesh_clear()
pb = a.pose.bones['mixamorig:LeftArm']
print('rot modes', pb.rotation_mode, 'loc', tuple(round(x,3) for x in pb.location), 'scale', tuple(round(x,3) for x in pb.scale))
act = a.animation_data.action
paths = set()
for l in act.layers:
    for s in l.strips:
        for cb in s.channelbags:
            for fc in cb.fcurves: paths.add(fc.data_path.split('.')[-1])
print('canais', paths)
