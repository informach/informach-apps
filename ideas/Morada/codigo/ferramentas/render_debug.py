import bpy, sys
from mathutils import Vector
bpy.ops.wm.open_mainfile(filepath='morada-art/build/mh_pai.blend')
scn = bpy.context.scene; a = bpy.data.objects['pai_esqueleto']
for o in scn.objects:
    if o.type=='MESH' and o.name not in ('pai_corpo','olhos','Plane'): o.hide_render=True
cam = scn.camera; cam.data.lens = 50
scn.cycles.samples = 16; scn.render.resolution_x, scn.render.resolution_y = 1400, 900
alvo = Vector((0,0,1.0)); cam.location = alvo + Vector((0,-5.5,0.3)); cam.rotation_euler = (alvo-cam.location).to_track_quat('-Z','Y').to_euler()
for nome, pos in (('rest','REST'), ('idle','POSE')):
    a.data.pose_position = pos
    scn.frame_set(60)
    scn.render.filepath = f'morada-art/dist/debug_{nome}.png'; bpy.ops.render.render(write_still=True)
