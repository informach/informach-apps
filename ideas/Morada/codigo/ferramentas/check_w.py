import bpy, collections
bpy.ops.wm.open_mainfile(filepath='morada-art/build/mh_pai.blend')
c = bpy.data.objects['pai_corpo']
cnt = collections.Counter(); mx = collections.defaultdict(float)
for v in c.data.vertices:
    for g in v.groups:
        n = c.vertex_groups[g.group].name; cnt[n]+=1; mx[n]=max(mx[n], g.weight)
for n in ('mixamorig:LeftArm','mixamorig:LeftForeArm','mixamorig:LeftHand','mixamorig:LeftShoulder','mixamorig:Spine2','mixamorig:Head','mixamorig:LeftUpLeg'):
    print(n, cnt[n], round(mx[n],3))
# posição média dos vértices com peso no antebraço esquerdo
import mathutils
g = c.vertex_groups['mixamorig:LeftForeArm'].index
pts=[c.matrix_world @ v.co for v in c.data.vertices if any(x.group==g and x.weight>0.5 for x in v.groups)]
print('antebraço esq média', tuple(round(x,3) for x in sum(pts, mathutils.Vector())/max(1,len(pts))), len(pts))
