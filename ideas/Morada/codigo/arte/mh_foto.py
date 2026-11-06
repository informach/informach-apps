"""Junta os personagens gerados, aplica poses (Mixamo + feitas por script) e renderiza:
foto da família, retratos de rosto e a família em ação.

Uso: python mh_foto.py <build/clipes.blend> <build/> <dist/> [amostras] [ids separados por vírgula]
"""
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector
from PIL import Image, ImageDraw, ImageFont

LIB, BUILD, DIST = sys.argv[1:4]
AMOSTRAS = int(sys.argv[4]) if len(sys.argv) > 4 else 48
IDS = sys.argv[5].split(",") if len(sys.argv) > 5 else None
P = "mixamorig:"
bpy.ops.wm.open_mainfile(filepath=LIB)
scn = bpy.context.scene
CH46 = bpy.data.objects["Esqueleto"]
CH46.hide_render = True


# ------------------------------------------------------------------ poses feitas por script (no esqueleto base)
def mirar(arm, osso, direcao):
    pb = arm.pose.bones[P + osso]
    M = pb.matrix.copy()
    atual = (M.to_3x3() @ Vector((0, 1, 0))).normalized()
    q = atual.rotation_difference(Vector(direcao).normalized())
    t = M.translation
    pb.matrix = Matrix.Translation(t) @ q.to_matrix().to_4x4() @ Matrix.Translation(-t) @ M
    bpy.context.view_layer.update()


def pose_por_script(nome, alvos, respiro=0.012):
    arm = CH46
    arm.data.pose_position = "POSE"
    ad = arm.animation_data or arm.animation_data_create()
    act = bpy.data.actions.new(nome)
    act.use_fake_user = True
    ad.action = act
    for pb in arm.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)
        pb.rotation_mode = "QUATERNION"
    bpy.context.view_layer.update()
    for osso, d in alvos:
        mirar(arm, osso, d)
    for f in (1, 16, 31):
        k = math.sin(math.pi * (f - 1) / 30)
        sp = arm.pose.bones[P + "Spine1"]
        base = sp.rotation_quaternion.copy()
        sp.rotation_quaternion = base @ Matrix.Rotation(-respiro * k, 4, "X").to_quaternion()
        for pb in arm.pose.bones:
            pb.keyframe_insert("rotation_quaternion", frame=f)
            if pb.name == P + "Hips":
                pb.keyframe_insert("location", frame=f)
        sp.rotation_quaternion = base
    act.use_cyclic = True
    ad.action = None


REL = [("LeftArm", (0.2, -0.97, 0.06)), ("LeftForeArm", (0.1, -0.95, 0.22)),
       ("RightArm", (-0.2, -0.97, 0.06)), ("RightForeArm", (-0.1, -0.95, 0.22))]
pose_por_script("bracos_relaxados", REL)
pose_por_script("segurar_bebe", [("LeftArm", (0.32, -0.8, 0.5)), ("LeftForeArm", (-0.78, 0.12, 0.62)),
                                 ("RightArm", (-0.32, -0.8, 0.5)), ("RightForeArm", (0.8, 0.22, 0.56))])
pose_por_script("bebe_no_colo", [("LeftUpLeg", (0.25, -0.05, 1)), ("RightUpLeg", (-0.25, -0.05, 1)),
                                 ("LeftLeg", (0.15, -0.85, 0.5)), ("RightLeg", (-0.15, -0.85, 0.5)),
                                 ("LeftArm", (0.55, -0.15, 0.82)), ("LeftForeArm", (0.25, 0.55, 0.8)),
                                 ("RightArm", (-0.55, -0.15, 0.82)), ("RightForeArm", (-0.25, 0.55, 0.8))])
pose_por_script("bracos_abertos", [("LeftArm", (0.8, -0.3, 0.5)), ("LeftForeArm", (0.6, 0.35, 0.7)),
                                   ("RightArm", (-0.8, -0.3, 0.5)), ("RightForeArm", (-0.6, 0.35, 0.7))])
pose_por_script("maos_no_bolso", [("LeftArm", (0.26, -0.95, -0.08)), ("LeftForeArm", (-0.12, -0.9, 0.38)),
                                  ("RightArm", (-0.26, -0.95, -0.08)), ("RightForeArm", (0.12, -0.9, 0.38))])
pose_por_script("mao_na_cintura", [("LeftArm", (0.65, -0.62, -0.38)), ("LeftForeArm", (-0.5, -0.6, 0.32)),
                                   ("RightArm", (-0.2, -0.97, 0.06)), ("RightForeArm", (-0.1, -0.95, 0.22))])
pose_por_script("maos_na_cintura", [("LeftArm", (0.65, -0.62, -0.38)), ("LeftForeArm", (-0.5, -0.6, 0.32)),
                                    ("RightArm", (-0.65, -0.62, -0.38)), ("RightForeArm", (0.5, -0.6, 0.32))])
pose_por_script("mao_no_ombro", [("LeftArm", (0.2, -0.97, 0.06)), ("LeftForeArm", (0.1, -0.95, 0.22)),
                                 ("RightArm", (-0.25, -0.75, 0.6)), ("RightForeArm", (0.15, -0.3, 0.95))])


def usar(arm, acao, quadro=1):
    act = bpy.data.actions[acao]
    ad = arm.animation_data or arm.animation_data_create()
    ad.action = None
    for t in list(ad.nla_tracks):
        ad.nla_tracks.remove(t)
    st = ad.nla_tracks.new().strips.new(acao, int(2 - quadro), act)
    if hasattr(st, "action_slot") and st.action_slot is None and act.slots:
        st.action_slot = act.slots[0]


# ------------------------------------------------------------------ carregar personagens
ORDEM = ["avo", "avo_lurdes", "pai", "mae", "adolescente", "jovem", "menina", "menino_pequeno", "menina_pequena",
         "menino", "bebe_menino", "bebe_menina"]
ids = [i for i in ORDEM if (IDS is None or i in IDS) and os.path.exists(os.path.join(BUILD, f"mh_{i}.blend"))]
ARM = {}
for pid in ids:
    with bpy.data.libraries.load(os.path.join(BUILD, f"mh_{pid}.blend"), link=False) as (src, dst):
        dst.collections = [pid]
    col = dst.collections[0]
    scn.collection.children.link(col)
    ARM[pid] = next(o for o in col.objects if o.type == "ARMATURE")
print("carregados:", ids)

# ------------------------------------------------------------------ luz, chão, câmera
scn.render.engine = "CYCLES"
scn.cycles.device = "CPU"
scn.cycles.samples = AMOSTRAS
scn.cycles.use_denoising = True
scn.cycles.transparent_max_bounces = 64
scn.view_settings.view_transform = "Standard"
world = bpy.data.worlds.new("mundo")
scn.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.93, 0.87, 0.84, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 0.45
bpy.ops.mesh.primitive_plane_add(size=600)
chao = bpy.context.active_object
mc = bpy.data.materials.new("chao")
if hasattr(mc, "use_nodes"):
    mc.use_nodes = True
mc.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.9, 0.82, 0.78, 1)
mc.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.9
chao.data.materials.append(mc)
for loc, en, tam in (((-4, -5, 4.5), 520, 6), ((5, -4, 3), 220, 6), ((0, 5, 4), 380, 5)):
    bpy.ops.object.light_add(type="AREA", location=loc)
    lz = bpy.context.active_object
    lz.data.energy, lz.data.size = en, tam
    lz.rotation_euler = (Vector((0, 0, 1)) - lz.location).to_track_quat("-Z", "Y").to_euler()
cam_d = bpy.data.cameras.new("cam")
cam = bpy.data.objects.new("cam", cam_d)
scn.collection.objects.link(cam)
scn.camera = cam


def mirar_cam(alvo, desloc, lente):
    cam.location = alvo + desloc
    cam.rotation_euler = (alvo - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam_d.lens = lente


def posicionar(tabela):
    for pid, (x, y, rz, acao, q) in tabela.items():
        if pid not in ARM:
            continue
        a = ARM[pid]
        a.location = (x, y, 0)
        a.rotation_euler = (math.radians(90), 0, math.radians(rz))
        usar(a, acao, q)
    scn.frame_set(1)
    bpy.context.view_layer.update()


def no_colo(bebe, adulto):
    if bebe not in ARM or adulto not in ARM:
        return
    a = ARM[adulto]
    mw = a.matrix_world
    l = mw @ a.pose.bones[P + "LeftForeArm"].head
    r = mw @ a.pose.bones[P + "RightForeArm"].head
    lw = mw @ a.pose.bones[P + "LeftHand"].head
    alvo = (l + r + lw) / 3 + Vector((0, -0.07, 0.03))
    b = ARM[bebe]
    bpy.context.view_layer.update()
    hips = b.matrix_world @ b.pose.bones[P + "Hips"].head
    b.location += alvo - hips
    bpy.context.view_layer.update()


def render(caminho, rx, ry):
    scn.render.resolution_x, scn.render.resolution_y = rx, ry
    scn.render.filepath = caminho
    bpy.ops.render.render(write_still=True)
    print("render:", caminho, flush=True)


# ------------------------------------------------------------------ 1. foto da família (composição da referência)
FOTO = {
    "avo": (-2.05, 0.55, 10, "maos_no_bolso", 1), "avo_lurdes": (-1.28, 0.62, 6, "mao_no_ombro", 1),
    "pai": (-0.45, 0.6, 0, "segurar_bebe", 1), "mae": (0.45, 0.6, 0, "segurar_bebe", 1),
    "adolescente": (1.3, 0.55, -6, "maos_no_bolso", 1), "jovem": (2.08, 0.55, -10, "mao_na_cintura", 1),
    "menina": (-1.3, -0.45, 6, "maos_na_cintura", 1), "menino_pequeno": (-0.42, -0.6, 0, "bracos_abertos", 1),
    "menina_pequena": (0.4, -0.6, 0, "bracos_abertos", 1), "menino": (1.25, -0.45, -6, "maos_no_bolso", 1),
    "bebe_menino": (0, 0, 0, "bebe_no_colo", 1), "bebe_menina": (0, 0, 0, "bebe_no_colo", 1),
}
if len(ids) == 1:
    FOTO = {ids[0]: (0, 0, 0, "bracos_relaxados", 1)}
posicionar(FOTO)
no_colo("bebe_menino", "pai")
no_colo("bebe_menina", "mae")
if len(ids) > 1:
    mirar_cam(Vector((0, 0.15, 0.92)), Vector((0, -11.5, 0.6)), 88)
    render(os.path.join(DIST, "familia_mh.png"), 1600, 1060)

# ------------------------------------------------------------------ 2. retratos
retratos = []
for pid in ids:
    a = ARM[pid]
    hc = a.matrix_world @ a.pose.bones[P + "Head"].head
    alt = a.get("altura", 1.7)
    k = max(0.55, min(1.0, alt / 1.75))
    mirar_cam(hc + Vector((0, 0, 0.1 * k)), Vector((0.25 * k, -1.05 * k, 0.03)), 85)
    for o in scn.objects:
        if o.type == "MESH" and o.name != chao.name:
            o.hide_render = not any(c.name == pid for c in o.users_collection)
    caminho = os.path.join(DIST, f"retrato_{pid}.png")
    render(caminho, 700, 700)
    retratos.append((pid, a.get("nome", pid), caminho))
for o in scn.objects:
    if o.type == "MESH":
        o.hide_render = False
CH46.hide_render = True
if retratos:
    cols = 4 if len(retratos) > 4 else len(retratos)
    linhas = (len(retratos) + cols - 1) // cols
    folha = Image.new("RGB", (cols * 400, linhas * 430), (245, 240, 236))
    dr = ImageDraw.Draw(folha)
    try:
        FONTE = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 18)
    except OSError:
        FONTE = ImageFont.load_default()
    for i, (pid, nome, cam_) in enumerate(retratos):
        im = Image.open(cam_).convert("RGB").resize((400, 400))
        x, y = (i % cols) * 400, (i // cols) * 430
        folha.paste(im, (x, y))
        dr.text((x + 12, y + 403), nome, fill=(40, 30, 30), font=FONTE)
    folha.save(os.path.join(DIST, "retratos_mh.png"))

# ------------------------------------------------------------------ 3. em ação
if len(ids) > 1:
    ACAO = {
        "avo": (-2.5, 0.5, "walking", 10), "avo_lurdes": (-1.5, 0.5, "praying", 120), "pai": (-0.5, 0.5, "running", 8),
        "mae": (0.5, 0.5, "rumba_dancing", 30), "adolescente": (1.5, 0.5, "hip_hop_dancing", 60),
        "jovem": (2.5, 0.5, "talking_on_a_cell_phone", 300), "menina": (-2.5, -0.6, "jump", 30),
        "menino_pequeno": (-1.5, -0.6, "clapping", 10), "menina_pequena": (-0.5, -0.6, "blow_a_kiss", 60),
        "menino": (0.5, -0.6, "mma_kick", 25), "bebe_menino": (1.5, -0.6, "idle", 60),
        "bebe_menina": (2.5, -0.6, "laying_sleeping", 20),
    }
    posicionar({k: (x, y, 18, acao, q) for k, (x, y, acao, q) in ACAO.items()})
    mirar_cam(Vector((0, 0.0, 0.75)), Vector((0, -13.5, 0.95)), 66)
    render(os.path.join(DIST, "familia_mh_acao.png"), 1600, 1060)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(BUILD, "familia_mh.blend"), compress=True)
print("ok")
