import bpy, os, sys, math
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.abspath("morada-art"))
import expressoes as EX
from mathutils import Vector
I = "ideias"; OUT = os.path.abspath("corpos/expr"); os.makedirs(OUT, exist_ok=True)
PAL = os.path.join(I, "Casino/textures/textures/Textures_4.png"); A = np.array(Image.open(PAL).convert("RGB"))
bpy.ops.wm.read_factory_settings(use_empty=True); scn = bpy.context.scene
img = bpy.data.images.load(os.path.abspath(PAL))
def mat(n):
    m = bpy.data.materials.new(n); m.use_nodes = True; nt = m.node_tree; b = nt.nodes["Principled BSDF"]
    t = nt.nodes.new("ShaderNodeTexImage"); t.image = img; t.interpolation = "Closest"; nt.links.new(t.outputs[0], b.inputs[0]); b.inputs["Roughness"].default_value = 0.72
    return m
M = mat("m")
B = {"m": ("Chess_Pack/Chess_Pack_Free_fbx/Chess_Pack_Free_fbx/Characters/Chess_Player_01.fbx", "ChessPlayer_01", "ChessPlayer_Face_Usual_01", "ChessPlayer_Hair_01"),
     "f": ("Casino/Casino_Free_fbx/Casino_Free_fbx/Casino_Free_Characters_fbx/1_Cashier.fbx", "Adult_Female_Cashier_Body", "Adult_Female_Cashier_Face_Usual", "Adult_Female_Cashier_Hairstyle")}
faces = {}
for g, (f, c, r, h) in B.items():
    antes = set(bpy.data.objects); bpy.ops.import_scene.fbx(filepath=os.path.join(I, f))
    nov = [o for o in bpy.data.objects if o not in antes]; arm = next(o for o in nov if o.type == "ARMATURE"); arm.animation_data_clear()
    for pb in arm.pose.bones: pb.matrix_basis.identity()
    for o in nov:
        if o.type == "MESH" and o.name.split(".")[0] not in (c, r, h): bpy.data.objects.remove(o, do_unlink=True)
    bpy.context.view_layer.update()
    for o in (bpy.data.objects[c], bpy.data.objects[r], bpy.data.objects[h]): o.data.materials.clear(); o.data.materials.append(M)
    ex = EX.gerar(bpy.data.objects[c], bpy.data.objects[r], arm, g == "f", M, A, g)
    l = bpy.data.objects.new(g + "_l", None); scn.collection.objects.link(l); arm.parent = l; l.location.x = 0 if g == "m" else 1.0
    faces[g] = (ex, l)
scn.render.engine = "CYCLES"; scn.cycles.samples = 24; scn.cycles.device = "CPU"; scn.view_settings.view_transform = "Standard"; scn.view_settings.exposure = -0.7
w = bpy.data.worlds.new("w"); scn.world = w; w.use_nodes = True; w.node_tree.nodes["Background"].inputs[0].default_value = (0.25, 0.33, 0.55, 1); w.node_tree.nodes["Background"].inputs[1].default_value = 1.0
bpy.ops.object.light_add(type="AREA", location=(0.6, -2, 2.2)); L = bpy.context.active_object; L.data.energy = 120; L.data.size = 2
L.rotation_euler = (Vector((0.5, 0, 1.6)) - L.location).to_track_quat("-Z", "Y").to_euler()
cd = bpy.data.cameras.new("c"); cam = bpy.data.objects.new("c", cd); scn.collection.objects.link(cam); scn.camera = cam
cd.type = "ORTHO"; cd.ortho_scale = 0.34; scn.render.resolution_x = scn.render.resolution_y = 300
for g, (ex, l) in faces.items():
    for nome in EX.EXPRESSOES:
        for n2, o in ex.items(): o.hide_render = n2 != nome
        x = l.location.x; cam.location = (x + 0.12, -3, 1.6); cam.rotation_euler = (math.radians(90), 0, math.radians(2.3))
        scn.render.filepath = f"{OUT}/{g}_{nome}.png"; bpy.ops.render.render(write_still=True)
print("ok")
