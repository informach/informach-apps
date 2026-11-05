"""Corpos crus dos pacotes grátis lado a lado (só corpo, rosto e cabelo), de frente, na pose de repouso.
Uso: python corpos_crus.py <saida.png>"""
import bpy, os, sys, math
from mathutils import Vector
SCR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
I = os.path.join(SCR, "ideias")
C = [  # (fbx, paleta, filtro de peças)
 ("Chess_Pack/Chess_Pack_Free_fbx/Chess_Pack_Free_fbx/Characters/Chess_Player_01.fbx", "Chess_Pack/textures/textures/Textures1.png", ("ChessPlayer_01", "Face", "Hair")),
 ("Casino/Casino_Free_fbx/Casino_Free_fbx/Casino_Free_Characters_fbx/1_Cashier.fbx", "Casino/textures/textures/Textures_4.png", ("Body", "Face", "Hairstyle")),
 ("Casino/Casino_Free_fbx/Casino_Free_fbx/Casino_Free_Characters_fbx/75.fbx", "Casino/textures/textures/Textures_4.png", ("Body", "Face", "Hairstyle")),
 ("Creative_Characters/Creative_Characters_Free_fbx/Creative_Character_free.fbx", "Creative_Characters/textures/textures/Textures_4.png", ("Body_010", "usual", "male_012")),
 ("Christmas_Pack/Christmas_Pack_Free_fbx/Separate_assets_fbx/Santa.fbx", "Christmas_Pack/Textures/Textures/Textures_4.png", ("Body", "Face", "Hair")),
 ("Apocalypse/Apocalypse_Free_fbx/Apocalypse_Free_fbx/Characters/Adult_Survivor.fbx", "Apocalypse/textures/textures/Color2.png", ("Body", "Face", "Hairstyle")),
]
bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene
for k, (f, pal, filtro) in enumerate(C):
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=os.path.join(I, f))
    novos = [o for o in bpy.data.objects if o not in antes]
    img = bpy.data.images.load(os.path.join(I, pal), check_existing=True)
    arm = next(o for o in novos if o.type == "ARMATURE")
    arm.animation_data_clear()
    for pb in arm.pose.bones: pb.matrix_basis.identity()
    for o in novos:
        if o.type == "MESH":
            if not any(t in o.name for t in filtro):
                bpy.data.objects.remove(o, do_unlink=True); continue
            for m in o.data.materials:
                b = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
                if b and not b.inputs["Base Color"].links:
                    t = m.node_tree.nodes.new("ShaderNodeTexImage"); t.image = img
                    m.node_tree.links.new(t.outputs["Color"], b.inputs["Base Color"])
                if b: b.inputs["Roughness"].default_value = 0.7
    l = bpy.data.objects.new(f"l{k}", None); scn.collection.objects.link(l); arm.parent = l; l.location.x = k * 1.0
scn.render.engine = "CYCLES"; scn.cycles.samples = 32; scn.cycles.device = "CPU"; scn.view_settings.view_transform = "AgX"
w = bpy.data.worlds.new("w"); scn.world = w; w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.25, 0.33, 0.55, 1); w.node_tree.nodes["Background"].inputs[1].default_value = 1.0
for loc, en in (((2, -4, 3), 500), ((-3, -3, 2), 250), ((0, 3, 3), 250)):
    bpy.ops.object.light_add(type="AREA", location=(loc[0] + 2.5, loc[1], loc[2])); L = bpy.context.active_object; L.data.energy = en; L.data.size = 4
    L.rotation_euler = (Vector((2.5, 0, 0.9)) - L.location).to_track_quat("-Z", "Y").to_euler()
cd = bpy.data.cameras.new("c"); cam = bpy.data.objects.new("c", cd); scn.collection.objects.link(cam); scn.camera = cam
cd.type = "ORTHO"; cd.ortho_scale = 6.4; cam.location = (2.5, -10, 0.95); cam.rotation_euler = (math.radians(90), 0, 0)
scn.render.resolution_x, scn.render.resolution_y = 1800, 640; scn.render.filepath = os.path.abspath(sys.argv[1])
bpy.ops.render.render(write_still=True)
