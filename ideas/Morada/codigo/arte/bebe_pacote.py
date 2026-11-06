"""Bebê de colo (~1 ano) e criança pequena (2-3 anos) adaptados de um corpo do pacote Creative Characters,
só com peças do próprio pacote. As proporções mudam no esqueleto (cada osso com sua escala: comprimento e
grossura), a pose vira o novo repouso e malhas e roupas acompanham porque estão presas aos mesmos ossos.

Uso: python bebe_pacote.py <saida_dir>
"""
import math
import os
import sys

import bpy
import bmesh  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Vector  # noqa: E402

OUT = os.path.abspath(sys.argv[1])
os.makedirs(OUT, exist_ok=True)
SCR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FBX = os.path.join(SCR, "pacote", "fbx", "Creative_Character_free.fbx")
PALETA = os.path.join(SCR, "pacote", "fbx", "Separate_assets_fbx", "Textures_4.png")

# proporções: s = tamanho geral; cabeça; (comprimento, grossura) de tronco, braços, pernas
TIPOS = {
    "adulto": None,
    "crianca_pequena": dict(s=0.5, cabeca=0.86, tronco=(0.95, 1.22), bracos=(0.88, 1.22), pernas=(0.82, 1.28),
                            maos=(0.9, 1.15), olhos=1.15,
                            pecas=["Body_010", "Male_emotion_happy_002", "Hairstyle_male_012", "T_Shirt_009",
                                   "Shorts_003", "Shoe_Slippers_002"]),
    "bebe": dict(s=0.4, cabeca=0.8, tronco=(0.92, 1.34), bracos=(0.8, 1.32), pernas=(0.72, 1.42),
                 maos=(0.85, 1.2), olhos=1.25,
                 pecas=["Body_010", "Male_emotion_usual_001", "T_Shirt_009", "Pants_010", "Socks_008", "Pacifier_001", "Hat_010"]),
}
ADULTO = ["Body_010", "Male_emotion_happy_002", "Hairstyle_male_012", "T_Shirt_009", "Pants_014", "Shoe_Slippers_002"]

bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene
img = bpy.data.images.load(PALETA)


def importar():
    antes = set(bpy.data.objects)
    acoes_antes = set(bpy.data.actions)
    bpy.ops.import_scene.fbx(filepath=FBX)
    novos = [o for o in bpy.data.objects if o not in antes]
    return novos, [a for a in bpy.data.actions if a not in acoes_antes]


def paleta(objs):
    for o in objs:
        if o.type != "MESH":
            continue
        for m in o.data.materials:
            if not m or not m.node_tree:
                continue
            b = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
            if b and not b.inputs["Base Color"].links:
                t = m.node_tree.nodes.new("ShaderNodeTexImage")
                t.image = img
                m.node_tree.links.new(t.outputs["Color"], b.inputs["Base Color"])
            if b:
                b.inputs["Roughness"].default_value = 0.75


def grupo_osso(nome):
    n = nome.replace("Left", "").replace("Right", "")
    if n in ("Head",):
        return "cabeca"
    if n in ("Root", "Hips", "Spine", "Spine1", "Neck"):
        return "tronco"
    if n in ("Shoulder", "Arm", "ForeArm"):
        return "bracos"
    if n.startswith("Hand"):
        return "maos"
    if n in ("UpLeg", "Leg", "Foot", "ToeBase"):
        return "pernas"
    return "tronco"


def cara_de_bebe(malhas, arm, intensidade):
    """Antes de mudar o esqueleto: encurta queixo e mandíbula (sobe a parte de baixo da cabeça) e alarga as
    bochechas, em tudo o que está preso à cabeça (pele, rosto, chupeta). Fica mais redonda, menos adulta."""
    rosto = next(o for o in malhas if "emotion" in o.name)
    zr = [(rosto.matrix_world @ v.co).z for v in rosto.data.vertices]
    z_ref = min(zr) + 0.015  # um pouco acima da boca
    cab = arm.matrix_world @ arm.data.bones["Head"].head_local
    for o in malhas:
        g = o.vertex_groups.get("Head")
        if g is None:
            continue
        mw, mi = o.matrix_world, o.matrix_world.inverted()
        for v in o.data.vertices:
            w = next((x.weight for x in v.groups if x.group == g.index), 0.0)
            if w < 0.05:
                continue
            p = mw @ v.co
            if p.z < z_ref and p.z > cab.z - 0.06:
                k = 1 - (1 - 0.62) * intensidade * w
                p.z = z_ref + (p.z - z_ref) * k
            if p.z < z_ref + 0.05:
                p.x = cab.x + (p.x - cab.x) * (1 + 0.07 * intensidade * w)
            v.co = mi @ p


def olhos_maiores(rosto, fator):
    """Ilhas do rosto: olhos (as do meio) ficam maiores, sobrancelhas um pouco menores (cara de bebê)."""
    bm = bmesh.new()
    bm.from_mesh(rosto.data)
    bm.verts.ensure_lookup_table()
    vis, ilhas = set(), []
    for v in bm.verts:
        if v in vis:
            continue
        pilha, ilha = [v], []
        while pilha:
            x = pilha.pop()
            if x in vis:
                continue
            vis.add(x)
            ilha.append(x)
            pilha += [e.other_vert(x) for e in x.link_edges]
        ilhas.append(ilha)
    zs = sorted(((sum((rosto.matrix_world @ v.co).z for v in il) / len(il)), k) for k, il in enumerate(ilhas))
    if len(ilhas) >= 5:
        boca = zs[0][1]
        meio = [k for _, k in zs[1:3]]
        cima = [k for _, k in zs[3:]]
        baixar = Vector((0, 0, -0.012 * (fator - 1) / 0.25))
        inv3 = rosto.matrix_world.inverted().to_3x3()
        for k, f in [(k, fator) for k in meio] + [(k, 0.75) for k in cima] + [(boca, 0.8)]:
            c = sum((v.co for v in ilhas[k]), Vector()) / len(ilhas[k])
            desce = inv3 @ (baixar * (0.5 if k == boca else 1.0))
            for v in ilhas[k]:
                v.co = c + (v.co - c) * f + desce
    bm.to_mesh(rosto.data)
    bm.free()


def montar(nome, cfg, x):
    objs, acoes = importar()
    arm = next(o for o in objs if o.type == "ARMATURE")
    arm.name = nome
    pecas = cfg["pecas"] if cfg else ADULTO
    malhas = []
    for o in objs:
        if o.type != "MESH":
            continue
        base = o.name.split(".")[0]
        if base not in pecas:
            bpy.data.objects.remove(o, do_unlink=True)
        else:
            o.name = f"{nome}_{base}"
            malhas.append(o)
    paleta(malhas)
    if cfg:
        rosto = next((o for o in malhas if "emotion" in o.name), None)
        cara_de_bebe(malhas, arm, (cfg["olhos"] - 1) / 0.25)
        if rosto:
            olhos_maiores(rosto, cfg["olhos"])
        # cada osso com a própria escala (sem herdar a do pai): comprimento no eixo Y do osso, grossura em X e Z
        for b in arm.data.bones:
            b.inherit_scale = "NONE"
        s = cfg["s"]
        for pb in arm.pose.bones:
            g = grupo_osso(pb.name)
            if g == "cabeca":  # cabeça um pouco mais larga que alta (redonda)
                c_ = cfg["cabeca"]
                pb.scale = (c_ * 1.07, c_ * 0.93, c_ * 1.07)
            elif pb.name == "Neck":  # pescoço curto e grosso
                comp, gross = cfg["tronco"]
                pb.scale = (s * gross * 1.1, s * 0.4, s * gross * 1.1)
            else:
                comp, gross = cfg[g]
                pb.scale = (s * gross, s * comp, s * gross)
        bpy.context.view_layer.update()
        # a pose vira o novo repouso; as malhas (corpo e roupas) assam a deformação
        for o in malhas:
            for x_ in bpy.context.selected_objects:
                x_.select_set(False)
            bpy.context.view_layer.objects.active = o
            o.select_set(True)
            mod = next(m for m in o.modifiers if m.type == "ARMATURE")
            bpy.ops.object.modifier_apply(modifier=mod.name)
        for x_ in bpy.context.selected_objects:
            x_.select_set(False)
        bpy.context.view_layer.objects.active = arm
        arm.select_set(True)
        bpy.ops.object.mode_set(mode="POSE")
        bpy.ops.pose.select_all(action="SELECT")
        bpy.ops.pose.armature_apply(selected=False)
        bpy.ops.object.mode_set(mode="OBJECT")
        for b in arm.data.bones:
            b.inherit_scale = "FULL"
        for o in malhas:
            m = o.modifiers.new("Esqueleto", "ARMATURE")
            m.object = arm
        # pés no chão
        bpy.context.view_layer.update()
        zmin = min((o.matrix_world @ v.co).z for o in malhas for v in o.data.vertices if "Body" in o.name)
        arm["_zmin"] = zmin
        # deslocamento do quadril das animações na escala nova
        for a in acoes:
            for lay in a.layers:
                for st in lay.strips:
                    for cb in st.channelbags:
                        for fc in cb.fcurves:
                            if fc.data_path.endswith('["Hips"].location') or fc.data_path.endswith('["Root"].location'):
                                for k in fc.keyframe_points:
                                    k.co.y *= s
                                    k.handle_left.y *= s
                                    k.handle_right.y *= s
    lugar = bpy.data.objects.new(nome + "_lugar", None)  # a animação do FBX trava a posição do próprio esqueleto
    scn.collection.objects.link(lugar)
    arm.parent = lugar
    lugar.location.x = x
    lugar.location.z = -arm.get("_zmin", 0.0)
    bpy.context.view_layer.update()
    tri = 0
    for o in malhas:
        o.data.calc_loop_triangles()
        tri += len(o.data.loop_triangles)
    altura = max((o.matrix_world @ v.co).z for o in malhas for v in o.data.vertices)
    print(nome, "altura", round(altura, 2), "triângulos", tri)
    return arm, acoes


atores = {}
for k, (nome, cfg) in enumerate(TIPOS.items()):
    atores[nome] = montar(nome, cfg, x=[-0.75, 0.25, 0.95][k])


def usar(arm, acoes, trecho, quadro):
    a = next(a for a in acoes if trecho in a.name)
    arm.animation_data_create()
    arm.animation_data.action = a
    if hasattr(arm.animation_data, "action_slot") and a.slots:
        arm.animation_data.action_slot = a.slots[0]
    scn.frame_set(quadro)


bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "bebes.blend"))

# ------------------------------------------------------------------ renders
scn.render.engine = "CYCLES"
scn.cycles.samples = 48
scn.cycles.device = "CPU"
scn.view_settings.view_transform = "AgX"
w = bpy.data.worlds.new("w")
scn.world = w
w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.8, 0.84, 0.9, 1)
w.node_tree.nodes["Background"].inputs[1].default_value = 0.7
for loc, en in (((2, -3, 3), 420), ((-3, -2, 2), 170), ((0, 3, 3), 220)):
    bpy.ops.object.light_add(type="AREA", location=loc)
    l_ = bpy.context.active_object
    l_.data.energy = en
    l_.data.size = 3
    l_.rotation_euler = (Vector((0, 0, 0.6)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
bpy.ops.mesh.primitive_plane_add(size=30)
cd = bpy.data.cameras.new("c")
cam = bpy.data.objects.new("c", cd)
scn.collection.objects.link(cam)
scn.camera = cam


def foto(nome, alvo, ang, dist, lente, rx, ry):
    a = math.radians(ang)
    cd.lens = lente
    cam.location = alvo + Vector((math.sin(a) * dist, -math.cos(a) * dist, 0.08))
    cam.rotation_euler = (alvo - cam.location).to_track_quat("-Z", "Y").to_euler()
    scn.render.resolution_x, scn.render.resolution_y = rx, ry
    scn.render.filepath = os.path.join(OUT, nome + ".png")
    bpy.ops.render.render(write_still=True)


for nome, (arm, acoes) in atores.items():
    usar(arm, acoes, "Idle_Breathing", 60)
foto("lado_a_lado", Vector((0.05, 0, 0.75)), 0, 5.0, 50, 1400, 1000)
foto("lado_a_lado_34", Vector((0.05, 0, 0.75)), 30, 5.0, 50, 1400, 1000)
# rostos de perto
for nome in ("crianca_pequena", "bebe"):
    arm, _ = atores[nome]
    cab = arm.matrix_world @ arm.pose.bones["Head"].head
    foto("rosto_" + nome, cab + Vector((0, 0, 0.09)), 15, 0.75, 70, 700, 700)
# bebê andando (animação do próprio pacote) e criança correndo
usar(*atores["bebe"], "Walk_Forward", 12)
usar(*atores["crianca_pequena"], "Run_Forward", 8)
usar(*atores["adulto"], "Walk_Forward", 12)
foto("andando", Vector((0.05, 0, 0.75)), 25, 5.0, 50, 1400, 1000)
print("ok")
