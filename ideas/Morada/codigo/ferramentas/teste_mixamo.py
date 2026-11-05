import bpy, os, sys, math
from mathutils import Vector
I="ideias"; OUT=os.path.abspath("corpos/mixteste"); os.makedirs(OUT,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True); scn=bpy.context.scene
bpy.ops.import_scene.fbx(filepath=os.path.join(I,"Chess_Pack/Chess_Pack_Free_fbx/Chess_Pack_Free_fbx/Characters/Chess_Player_01.fbx"))
arm=next(o for o in bpy.data.objects if o.type=="ARMATURE")
img=bpy.data.images.load(os.path.abspath(os.path.join(I,"Chess_Pack/textures/textures/Textures1.png")))
for o in bpy.data.objects:
    if o.type=="MESH":
        for m in o.data.materials:
            b=m.node_tree.nodes.get("Principled BSDF")
            if b and not b.inputs[0].links:
                t=m.node_tree.nodes.new("ShaderNodeTexImage"); t.image=img; m.node_tree.links.new(t.outputs[0],b.inputs[0])
with bpy.data.libraries.load(os.path.abspath("corpos/mixamo_pacote.blend"),link=False) as (s,d): d.actions=[a for a in s.actions if a.startswith("mix|")]
acts={a.name.split("|")[1]:a for a in d.actions}
scn.render.engine="BLENDER_EEVEE" if False else "CYCLES"; scn.cycles.samples=8; scn.cycles.device="CPU"
w=bpy.data.worlds.new("w"); scn.world=w; w.use_nodes=True; w.node_tree.nodes["Background"].inputs[1].default_value=1.2
cd=bpy.data.cameras.new("c"); cam=bpy.data.objects.new("c",cd); scn.collection.objects.link(cam); scn.camera=cam
cd.type="ORTHO"; cd.ortho_scale=2.4; scn.render.resolution_x=scn.render.resolution_y=240
cam.location=(2.2,-6,1.2); cam.rotation_euler=(Vector((0,0,0.9))-cam.location).to_track_quat("-Z","Y").to_euler()
for nome in sys.argv[sys.argv.index("--")+1:]:
    a=acts[nome]; arm.animation_data_create(); arm.animation_data.action=a; arm.animation_data.action_slot=a.slots[0]
    f0,f1=(int(x) for x in a.frame_range)
    for i,f in enumerate((f0,(2*f0+f1)//3,(f0+2*f1)//3)):
        scn.frame_set(f); scn.render.filepath=f"{OUT}/{nome}_{i}.png"; bpy.ops.render.render(write_still=True)
print("ok")
