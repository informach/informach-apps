"""Cenas das telas do Morada, só com peças dos pacotes grátis e os nossos moradores vestidos.

Uso: python cena_morada.py <corpos_cena.blend> <saida_dir> [interior|exterior|retratos ...]
"""
import glob
import json
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

BLEND, OUT = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])
QUAIS = sys.argv[3:] or ["interior", "exterior", "retratos"]
os.makedirs(OUT, exist_ok=True)
SCR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
I = os.path.join(SCR, "ideias")
PASTAS = {
    "cute": "Cute_Furniture/Cute_Furniture_Free_fbx/Cute_Furniture_Free_fbx/Separate_Assets_fbx",
    "natal": "Christmas_Pack/Christmas_Pack_Free_fbx/Separate_assets_fbx",
    "xadrez": "Chess_Pack/Chess_Pack_Free_fbx/Chess_Pack_Free_fbx/Props",
    "cassino": "Casino/Casino_Free_fbx/Casino_Free_fbx/Casino_Free_Assets_fbx",
    "pelucia": "Claw_Machine/Claw_Machine_Free_fbx/Claw_Machine_Free_fbx",
    "cidade": "Cartoon_City/Cartoon_City_Free_fbx/Separate_assets_fbx",
    "apoc": "Apocalypse/Apocalypse_Free_fbx/Apocalypse_Free_fbx/Characters",
}
RAIZ_PACOTE = {k: os.path.join(I, v.split("/")[0]) for k, v in PASTAS.items()}
FATOR = json.load(open(os.path.join(os.path.dirname(BLEND), "corpos.json")))["fator"]
ROSTO = {"clara": 1.0, "media": 1.0, "morena": 0.6, "escura": 0.28}

bpy.ops.wm.open_mainfile(filepath=BLEND)
scn = bpy.context.scene
for o in list(bpy.data.objects):
    if o.type in ("LIGHT", "CAMERA"):
        bpy.data.objects.remove(o, do_unlink=True)
TEX_CACHE = {}


def achar_textura(pacote, nome):
    chave = (pacote, nome.lower())
    if chave not in TEX_CACHE:
        achados = [f for f in glob.glob(os.path.join(RAIZ_PACOTE[pacote], "**", "*"), recursive=True)
                   if os.path.basename(f).lower() == nome.lower()]
        TEX_CACHE[chave] = achados[0] if achados else None
    return TEX_CACHE[chave]


def paleta_padrao(pacote):
    for n in ("Textures_4.png", "Textures1.png", "Color2.png", "Color.png", "Texture_1.png"):
        c = achar_textura(pacote, n)
        if c:
            return c


def ligar_texturas(objs, pacote):
    pal = paleta_padrao(pacote)
    for o in objs:
        if o.type != "MESH":
            continue
        for m in o.data.materials:
            if not m or not m.node_tree:
                continue
            b = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
            for n in m.node_tree.nodes:
                if n.type == "TEX_IMAGE" and n.image:
                    c = achar_textura(pacote, os.path.basename(n.image.filepath.replace("\\", "/")) or n.image.name)
                    if c:
                        n.image.filepath = c
                        n.image.reload()
            if b is not None:
                b.inputs["Roughness"].default_value = 0.7
                if not b.inputs["Base Color"].links and pal and m.name.split(".")[0] in ("Color", "Frame", "Material", "Texture_1", "Colorset_01"):
                    t = m.node_tree.nodes.new("ShaderNodeTexImage")
                    t.image = bpy.data.images.load(pal, check_existing=True)
                    m.node_tree.links.new(t.outputs["Color"], b.inputs["Base Color"])


def importar(pacote, nome):
    antes = set(bpy.data.objects)
    acoes = set(bpy.data.actions)
    bpy.ops.import_scene.fbx(filepath=os.path.join(I, PASTAS[pacote], nome + ".fbx"))
    novos = [o for o in bpy.data.objects if o not in antes]
    ligar_texturas(novos, pacote)
    return novos, [a for a in bpy.data.actions if a not in acoes]


def movel(pacote, nome, x, y, z=0.0, rot=0.0, esc=1.0, grupo=None):
    novos, _ = importar(pacote, nome)
    pivo = bpy.data.objects.new(f"{nome}_lugar", None)
    scn.collection.objects.link(pivo)
    for o in novos:
        if o.parent is None:
            o.parent = pivo
    pivo.location = (x, y, z)
    pivo.rotation_euler = (0, 0, math.radians(rot))
    pivo.scale = (esc,) * 3
    pivo["_cena"] = grupo or "interior"
    for o in novos:
        o["_cena"] = grupo or "interior"
    return pivo, novos


def caixa(nome, centro, tam, cor, rough=0.85, emissao=0.0, grupo="interior"):
    bpy.ops.mesh.primitive_cube_add(location=centro)
    o = bpy.context.active_object
    o.name = nome
    o.scale = (tam[0] / 2, tam[1] / 2, tam[2] / 2)
    m = bpy.data.materials.new(nome)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = cor + (1,)
    b.inputs["Roughness"].default_value = rough
    if emissao:
        b.inputs["Emission Color"].default_value = cor + (1,)
        b.inputs["Emission Strength"].default_value = emissao
    o.data.materials.append(m)
    bpy.ops.object.modifier_add(type="BEVEL")
    o.modifiers[-1].width = 0.015
    o.modifiers[-1].segments = 2
    o["_cena"] = grupo
    return o


# ------------------------------------------------------------------ moradores: tom de pele, roupa e expressão
ATORES = {n: bpy.data.objects[n] for n in ("adulto", "adulta", "adolescente_m", "crianca_f", "pequeno_m")}


def vestir(nome, tom, expr="neutro", hue=None, sat=1.0):
    arm = ATORES[nome]
    pecas = [o for o in bpy.data.objects if o.type == "MESH" and o.parent is arm]
    for o in pecas:
        if o.name == f"{nome}_corpo":
            m = o.data.materials[0].copy()
            m.node_tree.nodes["tom"].inputs[1].default_value = FATOR[tom]
            o.data.materials[0] = m
        if "_rosto_" in o.name:
            o.hide_render = not o.name.endswith("_" + expr)
            m = o.data.materials[0].copy()
            m.node_tree.nodes["tom"].inputs[1].default_value = (ROSTO[tom],) * 3
            o.data.materials[0] = m
        if o.name == f"{nome}_roupa_cima" and hue is not None:
            for k, m0 in enumerate(o.data.materials):
                m = m0.copy()
                nt = m.node_tree
                b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
                if b.inputs["Base Color"].links:
                    src = b.inputs["Base Color"].links[0].from_socket
                    hs = nt.nodes.new("ShaderNodeHueSaturation")
                    hs.inputs["Hue"].default_value = hue
                    hs.inputs["Saturation"].default_value = sat
                    nt.links.new(src, hs.inputs["Color"])
                    nt.links.new(hs.outputs["Color"], b.inputs["Base Color"])
                o.data.materials[k] = m


def posar(nome, acao, quadro, x, y, rot, z=0.0):
    arm = ATORES[nome]
    a = bpy.data.actions[f"{nome}_{acao}"]
    arm.animation_data.action = a
    if a.slots:
        arm.animation_data.action_slot = a.slots[0]
    arm["_quadro"] = quadro
    lugar = arm.parent
    lugar.location = (x, y, lugar.location.z + z if z else lugar.location.z)
    lugar.rotation_euler = (0, 0, math.radians(rot))


def fixar_poses():
    """Cada morador congelado no seu quadro (o relógio da cena é um só)."""
    for nome, arm in ATORES.items():
        if not arm.animation_data or not arm.animation_data.action:
            continue
        scn.frame_set(int(arm.get("_quadro", 1)))
        for pb in arm.pose.bones:
            pb.keyframe_insert("rotation_quaternion", frame=1)
            pb.keyframe_insert("location", frame=1)
    scn.frame_set(1)


def esconder_ator(nome, esconder=True):
    arm = ATORES[nome]
    for o in bpy.data.objects:
        if o.parent is arm and o.type == "MESH":
            if esconder:
                o.hide_render = True
            elif "_rosto_" not in o.name:
                o.hide_render = False


def altura_assento(objs, x, y):
    """Topo do assento (raio de cima para baixo nas malhas do móvel)."""
    bpy.context.view_layer.update()
    melhor = None
    dg = bpy.context.evaluated_depsgraph_get()
    for o in objs:
        if o.type != "MESH":
            continue
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        P = [ev.matrix_world @ v.co for v in me.vertices]
        bvh = BVHTree.FromPolygons([tuple(p) for p in P], [tuple(p.vertices) for p in me.polygons])
        ev.to_mesh_clear()
        h = bvh.ray_cast(Vector((x, y, 3)), Vector((0, 0, -1)), 5)
        if h[0] is not None and (melhor is None or h[0].z > melhor):
            melhor = h[0].z
    return melhor


# ------------------------------------------------------------------ luz e câmera
def luz_e_mundo(tipo):
    w = bpy.data.worlds.new("w")
    scn.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    for o in [o for o in bpy.data.objects if o.type == "LIGHT"]:
        bpy.data.objects.remove(o, do_unlink=True)
    if tipo == "dia":
        bg.inputs[0].default_value = (0.78, 0.86, 1.0, 1)
        bg.inputs[1].default_value = 0.9
        bpy.ops.object.light_add(type="SUN")
        s = bpy.context.active_object
        s.data.energy = 3.4
        s.data.angle = math.radians(8)
        s.data.color = (1.0, 0.95, 0.88)
        s.rotation_euler = (math.radians(50), math.radians(-10), math.radians(-35))
    else:  # entardecer
        bg.inputs[0].default_value = (0.42, 0.36, 0.6, 1)
        bg.inputs[1].default_value = 0.38
        bpy.ops.object.light_add(type="SUN")
        s = bpy.context.active_object
        s.data.energy = 1.9
        s.data.angle = math.radians(6)
        s.data.color = (1.0, 0.62, 0.38)
        s.rotation_euler = (math.radians(74), math.radians(0), math.radians(-60))
    scn.render.engine = "CYCLES"
    scn.cycles.samples = 20 if os.environ.get("PREVIA") else 48
    scn.render.resolution_percentage = 50 if os.environ.get("PREVIA") else 100
    scn.cycles.use_denoising = True
    scn.cycles.device = "CPU"
    scn.view_settings.view_transform = "AgX"
    scn.view_settings.exposure = 0.0
    try:
        scn.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        pass


def camera_iso(alvo, az, el, escala, rx, ry, dist=30):
    cam = bpy.data.objects.get("cam")
    if cam is None:
        cd = bpy.data.cameras.new("cam")
        cam = bpy.data.objects.new("cam", cd)
        scn.collection.objects.link(cam)
    scn.camera = cam
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = escala
    cam.data.clip_end = 200
    a, e = math.radians(az), math.radians(el)
    cam.location = Vector(alvo) + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * dist
    cam.rotation_euler = (Vector(alvo) - cam.location).to_track_quat("-Z", "Y").to_euler()
    scn.render.resolution_x, scn.render.resolution_y = rx, ry


def mostrar_grupo(grupo):
    for o in bpy.data.objects:
        g = o.get("_cena")
        if g is not None and o.type == "MESH":
            o.hide_render = g != grupo


def render(nome):
    scn.render.filepath = os.path.join(OUT, nome + ".png")
    bpy.ops.render.render(write_still=True)
    print("render", nome)


# ------------------------------------------------------------------ interior: sala e cozinha (corte nas paredes da frente)
L, P, H = 8.4, 6.2, 2.75


def montar_interior():
    caixa("piso", (L / 2, P / 2, -0.05), (L, P, 0.1), (0.72, 0.5, 0.34), 0.6)
    caixa("parede_fundo", (L / 2, P + 0.08, H / 2), (L + 0.16, 0.16, H), (0.96, 0.9, 0.82))
    caixa("parede_dir", (L + 0.08, P / 2, H / 2), (0.16, P, H), (0.86, 0.92, 0.88))
    caixa("faixa_cozinha", (6.5, P - 0.005, 1.2), (3.6, 0.02, 0.6), (0.98, 0.98, 0.96), 0.3)
    caixa("rodape_f", (L / 2, P - 0.012, 0.06), (L, 0.025, 0.12), (1, 1, 1))
    caixa("rodape_d", (L - 0.012, P / 2, 0.06), (0.025, P, 0.12), (1, 1, 1))
    # janela na parede da direita (vidro claro e moldura)
    caixa("janela_vidro", (L - 0.005, 3.0, 1.55), (0.03, 1.4, 1.0), (0.45, 0.68, 0.95), 0.05, emissao=0.35)
    for dz in (-0.52, 0.52):
        caixa(f"janela_m{dz}", (L - 0.02, 3.0, 1.55 + dz), (0.05, 1.5, 0.08), (1, 1, 1))
    for dy in (-0.72, 0.0, 0.72):
        caixa(f"janela_v{dy}", (L - 0.02, 3.0 + dy, 1.55), (0.05, 0.08, 1.1), (1, 1, 1))
    # sala
    movel("natal", "Carpet_001", 2.2, 3.4, esc=1.25)
    sofa, sofa_objs = movel("cute", "Couch_08", 2.2, P - 0.48)
    movel("cute", "Coffee_Table_03", 2.2, 3.55)
    movel("cute", "Book_08", 2.05, 3.55, z=0.43)
    movel("cute", "Armchair_18", 0.65, 3.4, rot=90)
    movel("cute", "Plants_19", 0.55, P - 0.55)
    movel("cute", "Light_05", 3.75, P - 0.35)
    movel("cute", "Picture_17", 2.2, P, z=1.75)
    movel("cute", "Picture_08", 1.1, P, z=1.7)
    movel("pelucia", "Bear_01", 2.9, 2.75, rot=-30, esc=0.55)
    movel("pelucia", "Rabbit_01", 1.25, 2.55, rot=40, esc=0.5)
    movel("cute", "Toy_02", 1.85, 2.45, rot=20)
    movel("cute", "Toy_03", 2.6, 2.3)
    # cozinha
    movel("cute", "Fridge_01", 4.85, P - 0.38)
    movel("cute", "Kitchen_D_01", 5.75, P - 0.04)
    movel("natal", "Kitchen_stove_001", 6.62, P - 0.36)
    movel("cute", "Kitchen_D_01", 7.47, P - 0.04)
    movel("cute", "Kitchen_D_09", 5.75, P, z=1.55)
    movel("cute", "Kitchen_D_10", 7.47, P, z=1.55)
    movel("cute", "Microwave_01", 7.65, P - 0.33, z=0.85)
    movel("cute", "Mixer_08", 5.45, P - 0.28, z=0.85)
    movel("cute", "Cutting_board_02", 5.95, P - 0.33, z=0.85, rot=90)
    movel("cute", "Plants_05", 7.2, P - 0.3, z=0.85)
    movel("natal", "Kitchen_sink_001", L - 0.38, P - 1.45, rot=90)
    movel("cute", "Kitchen_Table_09", 6.1, 2.9)
    for (x, y, r) in ((5.55, 2.35, 0), (6.65, 2.35, 0), (5.55, 3.45, 180), (6.65, 3.45, 180)):
        movel("cute", "Chair_17", x, y, rot=r)
    movel("cassino", "Fruits_01", 6.1, 2.9, z=0.75, esc=0.7)
    # cachorro
    novos, acoes = importar("apoc", "Doberman")
    dog = next(o for o in novos if o.type == "ARMATURE")
    for o in novos:
        if o.type == "MESH" and o.name.split(".")[0] not in ("Doberman", "Doberman_Bandana"):
            bpy.data.objects.remove(o, do_unlink=True)
        elif o.type == "MESH":
            o["_cena"] = "interior"
    a = next(a for a in acoes if "AskToPlay" in a.name)
    dog.animation_data_create()
    dog.animation_data.action = a
    if a.slots:
        dog.animation_data.action_slot = a.slots[0]
    lug = bpy.data.objects.new("dog_lugar", None)
    scn.collection.objects.link(lug)
    dog.parent = lug
    lug.location = (3.45, 2.35, 0)
    lug.rotation_euler = (0, 0, math.radians(150))
    lug.scale = (0.8,) * 3
    dog["_quadro"] = 60
    return sofa_objs, dog


def interior(so_cozinha=False):
    sofa_objs, dog = montar_interior()
    vestir("adulta", "media", "feliz", hue=0.42, sat=0.9)          # Lia: colete puxado para o verde-água
    vestir("adulto", "morena", "feliz")                           # Marcos: xadrez vermelho
    vestir("crianca_f", "morena", "feliz", hue=0.78, sat=0.8)      # Nina: colete lilás
    vestir("pequeno_m", "clara", "feliz", hue=0.62, sat=0.9)       # Theo: xadrez azul
    esconder_ator("adolescente_m")
    seat = altura_assento(sofa_objs, 2.6, P - 0.62) or 0.45
    lugar_z = ATORES["adulto"].parent.location.z
    posar("adulto", "sentado", 45, 2.62, P - 0.56, 0)
    ATORES["adulto"].parent.location.z = lugar_z + (seat - 0.481)
    posar("adulta", "conversando", 120, 5.0, 3.9, -50)
    posar("crianca_f", "aplaudindo", 70, 2.35, 2.9, -15)
    posar("pequeno_m", "parado", 30, 1.6, 2.8, -55)
    fixar_poses()
    scn.frame_set(int(dog["_quadro"]))
    for pb in dog.pose.bones:
        pb.keyframe_insert("rotation_quaternion" if pb.rotation_mode == "QUATERNION" else "rotation_euler", frame=1)
        pb.keyframe_insert("location", frame=1)
    scn.frame_set(1)
    mostrar_grupo("interior")
    luz_e_mundo("dia")
    bpy.ops.object.light_add(type="AREA", location=(L / 2, P / 2, H - 0.05))
    a = bpy.context.active_object
    a.data.energy = 520
    a.data.size = 6
    a.data.color = (1.0, 0.93, 0.82)
    alvo = (L / 2 - 0.1, P / 2 + 0.25, 0.85)
    if not so_cozinha:
        camera_iso(alvo, -38, 36, 11.3, 1920, 1200)
        render("interior")
        camera_iso((L / 2, P / 2, 0.4), -38, 58, 10.2, 1920, 1200)  # construção: mais de cima
        render("construir")
    # perto: Marcos e Lia frente a frente perto da mesa (tela de aceite)
    ATORES["adulto"].parent.location.z = lugar_z
    posar("adulto", "conversando", 200, 4.12, 3.28, 72)
    posar("adulta", "conversando", 60, 5.3, 3.8, -72)
    scn.frame_set(1)
    for nome, q in (("adulto", 200), ("adulta", 60)):
        arm = ATORES[nome]
        scn.frame_set(q)
        for pb in arm.pose.bones:
            pb.keyframe_insert("rotation_quaternion", frame=1)
            pb.keyframe_insert("location", frame=1)
    scn.frame_set(1)
    camera_iso((4.75, 3.5, 1.15), -20, 14, 3.4, 1920, 1200)
    render("cozinha_perto")


def retratos():
    luz_e_mundo("dia")
    for o in bpy.data.objects:
        if o.get("_cena") is not None and o.type == "MESH":
            o.hide_render = True
    bpy.ops.object.light_add(type="AREA", location=(0, -2, 2))
    key = bpy.context.active_object
    key.data.energy = 140
    key.data.size = 1.5
    scn.render.film_transparent = True
    VISUAL = {"adulta": ("media", 0.42, 0.9), "adulto": ("morena", None, 1.0), "crianca_f": ("morena", 0.78, 0.8),
              "pequeno_m": ("clara", 0.62, 0.9), "adolescente_m": ("escura", None, 1.0)}
    for nome, (tom, hue, sat) in VISUAL.items():
        for n2 in ATORES:
            esconder_ator(n2, n2 != nome)
        vestir(nome, tom, "feliz", hue=hue, sat=sat)
        arm = ATORES[nome]
        arm.animation_data.action = None
        for pb in arm.pose.bones:
            pb.matrix_basis.identity()
        arm.parent.rotation_euler = (0, 0, 0)
        bpy.context.view_layer.update()
        pescoco = (arm.matrix_world @ arm.pose.bones["Neck"].head).z
        dg = bpy.context.evaluated_depsgraph_get()
        pts = []
        for o in bpy.data.objects:
            if o.parent is arm and o.type == "MESH" and not o.hide_render:
                ev = o.evaluated_get(dg)
                me = ev.to_mesh()
                pts += [ev.matrix_world @ v.co for v in me.vertices]
                ev.to_mesh_clear()
        cab = [v for v in pts if v.z > pescoco]
        lo = Vector([min(v[i] for v in cab) for i in range(3)])
        hi = Vector([max(v[i] for v in cab) for i in range(3)])
        alto = hi.z - lo.z
        alvo = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z + alto * 0.42))
        camera_iso(alvo, 12, 6, alto * 1.75, 512, 512, dist=8)
        key.location = alvo + Vector((0.8, -2.2, 0.8))
        key.rotation_euler = (alvo - key.location).to_track_quat("-Z", "Y").to_euler()
        render("retrato_" + nome)
    scn.render.film_transparent = False


def telhado(nome, cx, cy, z0, lx, ly, h, cor, grupo):
    """Prisma de duas águas com a cumeeira ao longo de x."""
    import bmesh
    me = bpy.data.meshes.new(nome)
    bm = bmesh.new()
    x0, x1, y0, y1 = cx - lx / 2, cx + lx / 2, cy - ly / 2, cy + ly / 2
    v = [bm.verts.new(c) for c in ((x0, y0, z0), (x1, y0, z0), (x1, cy, z0 + h), (x0, cy, z0 + h),
                                   (x0, y1, z0), (x1, y1, z0))]
    for f in ((0, 1, 2, 3), (3, 2, 5, 4), (0, 3, 4), (1, 5, 2), (0, 4, 5, 1)):
        bm.faces.new([v[i] for i in f])
    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(nome, me)
    bpy.context.scene.collection.objects.link(o)
    mod = o.modifiers.new("chanfro", "BEVEL")
    mod.width = 0.04
    mt = bpy.data.materials.new(nome)
    mt.use_nodes = True
    b = mt.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*cor, 1)
    b.inputs["Roughness"].default_value = 0.8
    me.materials.append(mt)
    o["_cena"] = grupo
    return o


# ------------------------------------------------------------------ exterior: a casa na rua (Cartoon City)
def exterior(luz):
    mostrar_grupo("exterior")
    if not bpy.data.objects.get("ext_grama"):
        g = "exterior"
        caixa("ext_grama", (0, 0, -0.06), (60, 60, 0.1), (0.42, 0.66, 0.3), 0.9, grupo=g)
        caixa("ext_rua", (0, -10.0, 0.0), (60, 5.2, 0.06), (0.22, 0.23, 0.26), 0.7, grupo=g)
        for k in range(-14, 15):
            caixa(f"ext_faixa{k}", (k * 2.2, -10.0, 0.035), (1.1, 0.14, 0.01), (0.95, 0.92, 0.8), grupo=g)
        caixa("ext_guia", (0, -7.3, 0.06), (60, 0.25, 0.14), (0.62, 0.62, 0.64), grupo=g)
        movel("cidade", "Set_B_Tiles_09", -15, 3, grupo=g)
        # casa: corpo, telhado de duas águas, janelas acesas e porta
        caixa("ext_casa", (0, 3.5, 1.6), (9.0, 7.0, 3.2), (0.96, 0.9, 0.8), grupo=g)
        caixa("ext_casa_base", (0, 3.5, 0.12), (9.3, 7.3, 0.24), (0.72, 0.66, 0.6), grupo=g)
        telhado("ext_telhado", 0, 3.5, 3.2, 9.8, 7.8, 1.9, (0.75, 0.3, 0.22), g)
        brilho = 6.0 if luz == "entardecer" else 0.0
        for x in (-2.8, 2.8):
            caixa(f"ext_jan{x}", (x, -0.02, 1.7), (1.5, 0.06, 1.1), (1.0, 0.82, 0.5), 0.2, emissao=brilho, grupo=g)
            caixa(f"ext_jan_m{x}", (x, -0.05, 1.7), (1.62, 0.04, 0.08), (1, 1, 1), grupo=g)
        caixa("ext_porta", (0, -0.03, 1.05), (1.1, 0.08, 2.1), (0.45, 0.28, 0.18), grupo=g)
        caixa("ext_caminho", (0, -2.5, 0.0), (1.4, 5.0, 0.04), (0.82, 0.8, 0.76), grupo=g)
        caixa("ext_calcada", (0, -6.0, 0.03), (60, 2.2, 0.1), (0.8, 0.8, 0.8), grupo=g)
        movel("cidade", "Bush_06", -3.2, -0.9, grupo=g, esc=0.7)
        movel("cidade", "Bush_07", 3.2, -0.9, grupo=g, esc=0.7)
        movel("cidade", "Bush_10", -6.5, 1.0, grupo=g)
        movel("cidade", "Car_19", 4.6, -9.6, rot=90, grupo=g)
        movel("cidade", "Trash_Can_06", -1.6, -5.5, grupo=g, esc=0.6)
        movel("cidade", "Spotlight_02", 6.5, -6.2, grupo=g, esc=0.7)
        movel("cidade", "Bus_Stop_02", -8.0, -6.0, grupo=g, esc=0.8)
        movel("cidade", "Palm_03", 8.5, 1.0, grupo=g, esc=0.28)
        movel("cidade", "Fountain_03", -11, -1, grupo=g, esc=0.5)
        caixa("ext_casa2", (-14, 4.5, 1.4), (7.0, 6.0, 2.8), (0.84, 0.9, 0.98), grupo=g)
        telhado("ext_telhado2", -14, 4.5, 2.8, 7.6, 6.6, 1.5, (0.32, 0.42, 0.55), g)
        caixa("ext_casa3", (14, 4.5, 1.5), (7.0, 6.0, 3.0), (0.99, 0.9, 0.7), grupo=g)
        telhado("ext_telhado3", 14, 4.5, 3.0, 7.6, 6.6, 1.6, (0.55, 0.38, 0.28), g)
    for nome in ATORES:
        esconder_ator(nome, nome not in ("adulta", "adulto"))
    vestir("adulta", "media", "feliz", hue=0.42, sat=0.9)
    vestir("adulto", "morena", "feliz")
    posar("adulta", "andando", 10, -0.5, -3.4, 10)
    posar("adulto", "andando", 30, 0.55, -3.0, 10)
    fixar_poses()
    luz_e_mundo(luz)
    scn.view_settings.exposure = -0.45 if luz == "dia" else 0.0
    camera_iso((0, -3.0, 1.2), -28, 26, 23, 1920, 1200, dist=60)
    render("exterior_" + luz)


# ------------------------------------------------------------------ catálogo: miniaturas de móveis para a tela de construir
CATALOGO = [("cute", "Couch_08"), ("cute", "Armchair_18"), ("cute", "Chair_17"), ("cute", "Coffee_Table_03"),
            ("cute", "Plants_19"), ("cute", "Light_05"), ("cute", "Kitchen_Table_09"), ("cute", "Fridge_01")]


def catalogo():
    luz_e_mundo("dia")
    scn.render.film_transparent = True
    for o in bpy.data.objects:
        if o.type == "MESH":
            o.hide_render = True
    bpy.ops.object.light_add(type="AREA", location=(2, -3, 4))
    key = bpy.context.active_object
    key.data.energy = 260
    key.data.size = 3
    for pacote, nome in CATALOGO:
        pivo, novos = movel(pacote, nome, 0, 0, grupo="catalogo")
        bpy.context.view_layer.update()
        malhas = [o for o in novos if o.type == "MESH"]
        for o in malhas:
            o.hide_render = False
        pts = [o.matrix_world @ Vector(c) for o in malhas for c in o.bound_box]
        lo = Vector([min(v[i] for v in pts) for i in range(3)])
        hi = Vector([max(v[i] for v in pts) for i in range(3)])
        centro = (lo + hi) / 2
        tam = max((hi - lo).length, 0.3)
        camera_iso(centro, -35, 28, tam * 1.05, 384, 384, dist=10)
        key.location = centro + Vector((1.5, -3, 3))
        key.rotation_euler = (centro - key.location).to_track_quat("-Z", "Y").to_euler()
        render("cat_" + nome)
        for o in malhas:
            o.hide_render = True
    scn.render.film_transparent = False


if "interior" in QUAIS:
    interior()
elif "cozinha" in QUAIS:
    interior(so_cozinha=True)
if "exterior" in QUAIS:
    exterior("entardecer")
    exterior("dia")
if "retratos" in QUAIS:
    retratos()
if "catalogo" in QUAIS:
    catalogo()
print("ok")
