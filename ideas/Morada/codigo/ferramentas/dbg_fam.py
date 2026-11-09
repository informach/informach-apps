import bpy
from mathutils import Vector
bpy.ops.wm.open_mainfile(filepath='morada-art/build/mh_avo.blend')
a = bpy.data.objects['avo']; c = bpy.data.objects['avo_corpo']
print('arm loc', tuple(a.location), 'parent corpo', c.parent, [ (m.type, m.object.name if m.object else None) for m in c.modifiers])
somas=[sum(g.weight for g in v.groups if c.vertex_groups[g.group].name.startswith('mixamorig')) for v in c.data.vertices]
print('verts', len(somas), 'soma<0.5:', sum(1 for s in somas if s<0.5), 'min', min(somas))
a.location = (2,0,0); bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get(); ev = c.evaluated_get(dg); me = ev.to_mesh()
xs=[(c.matrix_world @ v.co).x for v in me.vertices]; print('x médio após mover 2m', sum(xs)/len(xs), min(xs), max(xs))
