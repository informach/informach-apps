"""Sala de teste estilo jogo de vida: só peças dos pacotes grátis (móveis Cute Furniture, personagens Creative e
Apocalypse, cachorro), cada personagem com as próprias peças e a própria animação. Paredes e piso são provisórios.

Uso: python sala_pacote.py <saida_prefixo>
"""
import math
import os
import sys

import bpy
from mathutils import Vector

OUT = os.path.abspath(sys.argv[1])
SCR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MOV = os.path.join(SCR, "moveis", "fbx", "Cute_Furniture_Free_fbx", "Separate_Assets_fbx")
TEX_MOV = os.path.join(SCR, "t5", "textures", "Textures_4.png")
P1 = os.path.join(SCR, "pacote", "fbx")
P2 = os.path.join(SCR, "pacote2", "fbx", "Apocalypse_Free_fbx", "Characters")
TEX_P1 = os.path.join(P1, "Separate_assets_fbx", "Textures_4.png")
TEX_P2 = os.path.join(SCR, "pacote2", "tex", "textures")

bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene


def ligar_paleta(objs, paleta):
    img = bpy.data.images.load(paleta, check_existing=True)
    for o in objs:
        if o.type != "MESH":
            continue
        for m in o.data.materials:
            if not m or not m.node_tree:
                continue
            b = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
            if b is None:
                continue
            b.inputs["Roughness"].default_value = 0.75
            if not b.inputs["Base Color"].links and m.name.split(".")[0] in ("Color", "Frame"):
                t = m.node_tree.nodes.new("ShaderNodeTexImage")
                t.image = img
                m.node_tree.links.new(t.outputs["Color"], b.inputs["Base Color"])
            for n in m.node_tree.nodes:
                if n.type == "TEX_IMAGE" and n.image and n.image.size[0] == 0:
                    c = os.path.join(os.path.dirname(paleta), os.path.basename(n.image.filepath.replace("\\", "/")))
                    if os.path.exists(c):
                        n.image.filepath = c
                        n.image.reload()


def importar(caminho):
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=caminho)
    return [o for o in bpy.data.objects if o not in antes]


def movel(nome, x, y, z=0.0, rot=0.0):
    objs = importar(os.path.join(MOV, nome + ".fbx"))
    ligar_paleta(objs, TEX_MOV)
    raiz = [o for o in objs if o.parent is None]
    pivo = bpy.data.objects.new(nome + "_lugar", None)
    scn.collection.objects.link(pivo)
    for o in raiz:
        o.parent = pivo
    pivo.location = (x, y, z)
    pivo.rotation_euler = (0, 0, math.radians(rot))
    return pivo


# ------------------------------------------------------------------ cômodo provisório (piso e duas paredes, corte do The Sims)
L, P, H = 7.0, 5.5, 2.7


def caixa(nome, centro, tam, cor):
    bpy.ops.mesh.primitive_cube_add(location=centro)
    o = bpy.context.active_object
    o.name = nome
    o.scale = (tam[0] / 2, tam[1] / 2, tam[2] / 2)
    m = bpy.data.materials.new(nome)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = cor + (1,)
    b.inputs["Roughness"].default_value = 0.85
    o.data.materials.append(m)
    return o


caixa("piso", (L / 2, P / 2, -0.05), (L, P, 0.1), (0.62, 0.45, 0.32))
caixa("parede_fundo", (L / 2, P + 0.075, H / 2), (L + 0.15, 0.15, H), (0.93, 0.86, 0.76))
caixa("parede_dir", (L + 0.075, P / 2, H / 2), (0.15, P, H), (0.86, 0.9, 0.84))
caixa("rodape", (L / 2, P - 0.01, 0.06), (L, 0.03, 0.12), (0.97, 0.97, 0.95))

# ------------------------------------------------------------------ móveis (frente dos móveis = -y)
movel("Couch_08", 2.3, P - 0.5)
movel("Coffee_Table_03", 2.3, 3.75, z=0.35)
movel("Armchair_18", 0.75, 3.7, rot=90)
movel("Plants_19", 0.75, P - 0.6)
movel("Light_05", 3.75, P - 0.35)
movel("Picture_17", 2.3, P, z=1.75)
movel("Picture_21", L, 2.6, z=1.6, rot=90)
movel("Book_08", 2.15, 3.75, z=0.43)
movel("Toy_03", 1.55, 2.6)
movel("Toy_02", 1.85, 2.35)
movel("Fridge_01", 4.25, P - 0.4)
movel("Kitchen_D_01", 5.15, P)
movel("Kitchen_D_01", 6.07, P)
movel("Kitchen_D_06", L - 0.45, P - 1.2, rot=90)
movel("Kitchen_D_09", 5.15, P, z=1.55)
movel("Kitchen_D_10", 6.07, P, z=1.55)
movel("Microwave_01", 6.2, P - 0.35, z=0.85)
movel("Mixer_08", 4.9, P - 0.3, z=0.85)
movel("Cutting_board_02", 5.35, P - 0.35, z=0.85, rot=90)
movel("Kitchen_Table_09", 5.3, 2.5)
for (x, y, r) in ((4.85, 1.95, 0), (5.75, 1.95, 0), (4.85, 3.05, 180), (5.75, 3.05, 180)):
    movel("Chair_17", x, y, rot=r)
movel("Plants_05", 5.3, 2.5, z=0.75)

# ------------------------------------------------------------------ personagens, cada um só com as peças dele
for o in list(bpy.data.objects):
    if o.type == "MESH":
        o["_cenario"] = True


def personagem(caminho, paleta, manter, acao, quadro, x, y, rot):
    objs = importar(caminho)
    arm = next(o for o in objs if o.type == "ARMATURE")
    vivos = []
    for o in objs:
        if o.type == "MESH" and o.name not in manter:
            bpy.data.objects.remove(o, do_unlink=True)
        else:
            vivos.append(o)
    ligar_paleta(vivos, paleta)
    a = next(a for a in bpy.data.actions if acao in a.name and a.name.startswith(arm.name))
    arm.animation_data_create()
    arm.animation_data.action = a
    if hasattr(arm.animation_data, "action_slot") and a.slots:
        arm.animation_data.action_slot = a.slots[0]
    lugar = bpy.data.objects.new(arm.name + "_lugar", None)  # a animação do FBX pode mexer no próprio esqueleto
    scn.collection.objects.link(lugar)
    arm.parent = lugar
    lugar.location = (x, y, 0)
    lugar.rotation_euler.z = math.radians(rot)
    return arm, quadro


atores = []
atores.append(personagem(os.path.join(P1, "Creative_Character_free.fbx"), TEX_P1,
                         {"Body_010", "Male_emotion_happy_002", "Hairstyle_male_012", "T_Shirt_009", "Pants_014",
                          "Shoe_Slippers_002"}, "Idle_Relaxed", 30, 3.15, 2.7, -20))
atores.append(personagem(os.path.join(P2, "Adult_Survivor.fbx"), os.path.join(TEX_P2, "Color2.png"),
                         {"Adult_Female_Body", "Adult_Female_Face_Usual", "Hairstyle_Famale", "Outwear_Adult_Female",
                          "Pants_Adult_Female", "Shoes"}, "TalkGestureActive", 40, 4.45, 4.15, -150))
atores.append(personagem(os.path.join(P2, "Doberman.fbx"), os.path.join(TEX_P2, "Color2.png"),
                         {"Doberman", "Doberman_Bandana"}, "Idle", 60, 1.6, 1.75, 40))
scn.frame_set(1)
for arm, q in atores:  # cada um no seu quadro: congela a pose
    scn.frame_set(q)
    for pb in arm.pose.bones:
        pb.keyframe_insert("rotation_quaternion" if pb.rotation_mode == "QUATERNION" else "rotation_euler", frame=1)
        pb.keyframe_insert("location", frame=1)
scn.frame_set(1)

# ------------------------------------------------------------------ luz e câmera (isométrica, como num jogo de vida)
scn.render.engine = "CYCLES"
scn.cycles.samples = 64
scn.cycles.device = "CPU"
scn.view_settings.view_transform = "AgX"
w = bpy.data.worlds.new("w")
scn.world = w
w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.8, 0.86, 0.95, 1)
w.node_tree.nodes["Background"].inputs[1].default_value = 0.9
bpy.ops.object.light_add(type="SUN", location=(0, 0, 10))
sol = bpy.context.active_object
sol.data.energy = 3.2
sol.data.angle = math.radians(10)
sol.rotation_euler = (math.radians(48), math.radians(-8), math.radians(-30))
bpy.ops.object.light_add(type="AREA", location=(3.5, 2.5, 2.6))
lz = bpy.context.active_object
lz.data.energy = 150
lz.data.size = 4
cd = bpy.data.cameras.new("c")
cam = bpy.data.objects.new("c", cd)
scn.collection.objects.link(cam)
scn.camera = cam
cd.type = "ORTHO"
for k, (az, el, escala, rx, ry) in enumerate(((-38, 38, 8.6, 1600, 1000), (-20, 28, 4.6, 1200, 900))):
    alvo = Vector((L / 2 - 0.2, P / 2 + 0.2, 0.7)) if k == 0 else Vector((3.0, 3.4, 0.9))
    a, e = math.radians(az), math.radians(el)
    cam.location = alvo + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * 20
    cam.rotation_euler = (alvo - cam.location).to_track_quat("-Z", "Y").to_euler()
    cd.ortho_scale = escala
    scn.render.resolution_x, scn.render.resolution_y = rx, ry
    scn.render.filepath = f"{OUT}_{k}.png"
    bpy.ops.render.render(write_still=True)
tri = 0
for o in bpy.data.objects:
    if o.type == "MESH":
        o.data.calc_loop_triangles()
        tri += len(o.data.loop_triangles)
print("triângulos na cena", tri)
