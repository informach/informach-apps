import sys, os, json
sys.path.insert(0, 'morada-art')
import bpy
import mh_base as mh
bpy.ops.wm.open_mainfile(filepath='morada-art/build/clipes.blend')
CH46 = bpy.data.objects['Esqueleto']; CH46.data.pose_position='REST'
DATA='ext/makehuman/makehuman/data'; RIGS='ext/mpfb2/src/mpfb/data/rigs/standard'
vs, vts, faces = mh.ler_obj(os.path.join(DATA,'3dobjs','base.obj'))
print('base y range', min(v[1] for v in vs), max(v[1] for v in vs))
rig = json.load(open(os.path.join(RIGS,'rig.mixamo.json')))['bones']
for n in ('mixamorig:Hips','mixamorig:Head','mixamorig:LeftUpLeg','mixamorig:LeftFoot'):
    hv = rig[n]['head']
    pts = [mh.mh_para_blender(vs[i]) for i in hv['vertex_indices']]
    print(n, hv['strategy'], hv['vertex_indices'][:4], 'default', hv['default_position'], 'calc', [round(c,3) for c in (sum(pts, mh.Vector())/len(pts))])
arm = mh.esqueleto_mpfb('t', os.path.join(RIGS,'rig.mixamo.json'), vs, CH46)
bpy.context.view_layer.update()
for n in ('Hips','Head','LeftUpLeg','LeftFoot'):
    b = arm.data.bones['mixamorig:'+n]; print(n, [round(c,3) for c in arm.matrix_world @ b.head_local])
