import bpy, math
bpy.ops.wm.open_mainfile(filepath='morada-art/build/mh_pai.blend')
a = bpy.data.objects['pai_esqueleto']; c = bpy.data.objects['Esqueleto']
c.data.pose_position='POSE'
for acao, q in (('idle', 60), ('walking', 10), ('clapping', 10)):
    for arm in (a, c):
        ad = arm.animation_data or arm.animation_data_create()
        act = bpy.data.actions[acao]; ad.action = act
        if act.slots and ad.action_slot is None: ad.action_slot = act.slots[0]
    bpy.context.scene.frame_set(q); bpy.context.view_layer.update()
    out=[]
    for n in ('LeftArm','LeftForeArm','RightArm','RightForeArm','LeftUpLeg','Spine2'):
        d=[]
        for arm in (a,c):
            pb = arm.pose.bones['mixamorig:'+n]
            d.append(((arm.matrix_world @ pb.tail) - (arm.matrix_world @ pb.head)).normalized())
        out.append((n, round(math.degrees(d[0].angle(d[1])),1), tuple(round(x,2) for x in d[1])))
    print(acao, q, out)
