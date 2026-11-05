"""Etapa 3: poses de foto, animações feitas por script, render de conferência e glTF das animações.

Uso: python render.py <build/familia.blend> <dist/> [amostras]
"""
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

SRC, DIST = sys.argv[1], sys.argv[2]
AMOSTRAS = int(sys.argv[3]) if len(sys.argv) > 3 else 48
P = "mixamorig:"
bpy.ops.wm.open_mainfile(filepath=SRC)
scn = bpy.context.scene
A = bpy.data.objects


def usar(arm, acao, quadro=1):
    """Põe a action numa faixa do NLA deslocada para que o quadro 1 da cena mostre o quadro pedido."""
    act = bpy.data.actions[acao]
    ad = arm.animation_data or arm.animation_data_create()
    ad.action = None
    for t in list(ad.nla_tracks):
        ad.nla_tracks.remove(t)
    st = ad.nla_tracks.new().strips.new(acao, int(2 - quadro), act)
    if hasattr(st, "action_slot") and st.action_slot is None and act.slots:
        st.action_slot = act.slots[0]


# ------------------------------------------------ animações novas feitas por script
def mirar(arm, osso, direcao):
    """Gira o osso (em espaço do esqueleto) para apontar na direção dada. X=esquerda, Y=cima, Z=frente."""
    pb = arm.pose.bones[P + osso]
    M = pb.matrix.copy()
    atual = (M.to_3x3() @ Vector((0, 1, 0))).normalized()
    q = atual.rotation_difference(Vector(direcao).normalized())
    t = M.translation
    pb.matrix = Matrix.Translation(t) @ q.to_matrix().to_4x4() @ Matrix.Translation(-t) @ M
    bpy.context.view_layer.update()


def pose_por_script(nome, alvos, quadros=(1, 31), respiro=0.012):
    """Cria uma action a partir da pose de repouso + direções dos ossos, com respiração leve."""
    arm = A["Esqueleto"]
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
    for f in (quadros[0], (quadros[0] + quadros[1]) // 2, quadros[1]):
        k = math.sin(math.pi * (f - quadros[0]) / (quadros[1] - quadros[0]))
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
    return act


pose_por_script("segurar_bebe", [
    ("LeftArm", (0.32, -0.8, 0.5)), ("LeftForeArm", (-0.78, 0.12, 0.62)),
    ("RightArm", (-0.32, -0.8, 0.5)), ("RightForeArm", (0.8, 0.22, 0.56)),
])
pose_por_script("bebe_no_colo", [
    ("LeftUpLeg", (0.25, -0.05, 1)), ("RightUpLeg", (-0.25, -0.05, 1)),
    ("LeftLeg", (0.15, -0.85, 0.5)), ("RightLeg", (-0.15, -0.85, 0.5)),
    ("LeftArm", (0.55, -0.15, 0.82)), ("LeftForeArm", (0.25, 0.55, 0.8)),
    ("RightArm", (-0.55, -0.15, 0.82)), ("RightForeArm", (-0.25, 0.55, 0.8)),
])
pose_por_script("bracos_abertos", [
    ("LeftArm", (0.8, -0.3, 0.5)), ("LeftForeArm", (0.6, 0.35, 0.7)),
    ("RightArm", (-0.8, -0.3, 0.5)), ("RightForeArm", (-0.6, 0.35, 0.7)),
])
pose_por_script("bracos_relaxados", [
    ("LeftArm", (0.2, -0.97, 0.06)), ("LeftForeArm", (0.1, -0.95, 0.22)),
    ("RightArm", (-0.2, -0.97, 0.06)), ("RightForeArm", (-0.1, -0.95, 0.22)),
])
pose_por_script("maos_no_bolso", [
    ("LeftArm", (0.26, -0.95, -0.08)), ("LeftForeArm", (-0.12, -0.9, 0.38)),
    ("RightArm", (-0.26, -0.95, -0.08)), ("RightForeArm", (0.12, -0.9, 0.38)),
])
pose_por_script("mao_na_cintura", [
    ("LeftArm", (0.65, -0.62, -0.38)), ("LeftForeArm", (-0.5, -0.6, 0.32)),
    ("RightArm", (-0.2, -0.97, 0.06)), ("RightForeArm", (-0.1, -0.95, 0.22)),
])
pose_por_script("mao_no_ombro", [
    ("LeftArm", (0.2, -0.97, 0.06)), ("LeftForeArm", (0.1, -0.95, 0.22)),
    ("RightArm", (-0.25, -0.75, 0.6)), ("RightForeArm", (0.15, -0.3, 0.95)),
])
pose_por_script("maos_na_cintura", [
    ("LeftArm", (0.65, -0.62, -0.38)), ("LeftForeArm", (-0.5, -0.6, 0.32)),
    ("RightArm", (-0.65, -0.62, -0.38)), ("RightForeArm", (0.5, -0.6, 0.32)),
])

# ------------------------------------------------ cena da foto de família
FOTO = {  # id: (x, y, rotação em graus, action, quadro)
    "avo": (-2.05, 0.55, 10, "maos_no_bolso", 1), "avo_lurdes": (-1.28, 0.62, 6, "mao_no_ombro", 1),
    "pai": (-0.45, 0.6, 0, "segurar_bebe", 1), "mae": (0.45, 0.6, 0, "segurar_bebe", 1),
    "adolescente": (1.3, 0.55, -6, "maos_no_bolso", 1), "jovem": (2.08, 0.55, -10, "mao_na_cintura", 1),
    "menina": (-1.3, -0.45, 6, "maos_na_cintura", 1), "menino_pequeno": (-0.42, -0.6, 0, "bracos_abertos", 1),
    "menina_pequena": (0.4, -0.6, 0, "bracos_abertos", 1), "menino": (1.25, -0.45, -6, "maos_no_bolso", 1),
    "bebe_menino": (0, 0, 0, "bebe_no_colo", 1), "bebe_menina": (0, 0, 0, "bebe_no_colo", 1),
}
for oid, (x, y, rz, acao, q) in FOTO.items():
    arm = A[oid]
    arm.location = (x, y, 0)
    arm.rotation_euler = (math.radians(90), 0, math.radians(rz))
    usar(arm, acao, q)
scn.frame_set(1)
for oid, (_, _, _, acao, q) in FOTO.items():
    pass
bpy.context.view_layer.update()


def no_colo(bebe, adulto):
    """Coloca o bebê sentado sobre os antebraços do adulto."""
    a = A[adulto]
    mw = a.matrix_world
    l = mw @ a.pose.bones[P + "LeftForeArm"].head
    r = mw @ a.pose.bones[P + "RightForeArm"].head
    lw = mw @ a.pose.bones[P + "LeftHand"].head
    alvo = (l + r + lw) / 3 + Vector((0, -0.06, 0.04))
    b = A[bebe]
    bpy.context.view_layer.update()
    hips = b.matrix_world @ b.pose.bones[P + "Hips"].head
    b.location += alvo - hips


no_colo("bebe_menino", "pai")
no_colo("bebe_menina", "mae")
bpy.context.view_layer.update()

# luz, câmera, chão
scn.render.engine = "CYCLES"
scn.cycles.device = "CPU"
scn.cycles.samples = AMOSTRAS
scn.cycles.use_denoising = True
scn.render.resolution_x, scn.render.resolution_y = 1600, 1060
scn.view_settings.view_transform = "Standard"
world = bpy.data.worlds.new("mundo")
scn.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.92, 0.84, 0.8, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 0.7
bpy.ops.mesh.primitive_plane_add(size=600, location=(0, 0, 0))
chao = bpy.context.active_object
mc = bpy.data.materials.new("chao")
mc.diffuse_color = (0.95, 0.88, 0.85, 1)
if hasattr(mc, "use_nodes"):
    mc.use_nodes = True
mc.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.92, 0.84, 0.8, 1)
chao.data.materials.append(mc)
bpy.ops.object.light_add(type="SUN", rotation=(math.radians(48), math.radians(-12), math.radians(-28)))
sol = bpy.context.active_object
sol.data.energy = 1.6
sol.data.angle = math.radians(25)
for loc, en, tam in (((-4, -5, 4), 260, 5), ((5, -4, 3), 140, 5), ((0, 4, 4), 160, 4)):
    bpy.ops.object.light_add(type="AREA", location=loc)
    lz = bpy.context.active_object
    lz.data.energy, lz.data.size = en, tam
    lz.rotation_euler = (Vector((0, 0, 1)) - lz.location).to_track_quat("-Z", "Y").to_euler()
bpy.ops.object.camera_add(location=(0, -11.5, 1.5))
cam = bpy.context.active_object
cam.data.lens = 88
d = Vector((0, 0.15, 0.92)) - cam.location
cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
scn.camera = cam
scn.render.filepath = os.path.join(DIST, "familia.png")
bpy.ops.render.render(write_still=True)
print("render:", scn.render.filepath)

# segunda foto: cada personagem numa animação diferente
ACAO = {
    "avo": (-2.5, 0.5, "walking", 10), "avo_lurdes": (-1.5, 0.5, "praying", 120), "pai": (-0.5, 0.5, "running", 8),
    "mae": (0.5, 0.5, "rumba_dancing", 30), "adolescente": (1.5, 0.5, "hip_hop_dancing", 60),
    "jovem": (2.5, 0.5, "talking_on_a_cell_phone", 300), "menina": (-2.5, -0.6, "jump", 30),
    "menino_pequeno": (-1.5, -0.6, "clapping", 10), "menina_pequena": (-0.5, -0.6, "blow_a_kiss", 60),
    "menino": (0.5, -0.6, "mma_kick", 25), "bebe_menino": (1.5, -0.6, "idle", 60),
    "bebe_menina": (2.5, -0.6, "laying_sleeping", 20),
}
for oid, (x, y, acao, q) in ACAO.items():
    arm = A[oid]
    arm.location = (x, y, 0)
    arm.rotation_euler = (math.radians(90), 0, math.radians(18))
    usar(arm, acao, q)
scn.frame_set(1)
bpy.context.view_layer.update()
cam.location = (0, -13.5, 1.7)
cam.data.lens = 66
cam.rotation_euler = (Vector((0, 0.0, 0.75)) - cam.location).to_track_quat("-Z", "Y").to_euler()
scn.render.filepath = os.path.join(DIST, "familia_em_acao.png")
bpy.ops.render.render(write_still=True)
print("render:", scn.render.filepath)

# terceira foto: rostos de perto (pai, mãe e os dois bebês no colo, de frente)
for oid, (x, y, rz, acao, q) in FOTO.items():
    arm = A[oid]
    arm.location = (x, y, 0)
    arm.rotation_euler = (math.radians(90), 0, math.radians(rz))
    usar(arm, acao, q)
scn.frame_set(1)
bpy.context.view_layer.update()
no_colo("bebe_menino", "pai")
no_colo("bebe_menina", "mae")
bpy.context.view_layer.update()
cam.data.lens = 85
cam.location = (0, -5.2, 1.55)
cam.rotation_euler = (Vector((0, 0.6, 1.42)) - cam.location).to_track_quat("-Z", "Y").to_euler()
scn.render.resolution_x, scn.render.resolution_y = 1600, 900
scn.render.filepath = os.path.join(DIST, "rostos.png")
bpy.ops.render.render(write_still=True)
print("render:", scn.render.filepath)

# glTF só com o esqueleto e todas as animações
for o in list(bpy.data.objects):
    o.select_set(False)
base = A["Esqueleto"]
base.animation_data.action = None if base.animation_data else None
base.location = (0, 0, 0)
base.select_set(True)
bpy.context.view_layer.objects.active = base
caminho = os.path.join(DIST, "animacoes.glb")
bpy.ops.export_scene.gltf(filepath=caminho, export_format="GLB", use_selection=True, export_animations=True,
                          export_animation_mode="ACTIONS", export_optimize_animation_size=True,
                          export_force_sampling=True, export_frame_step=1)
print("animações:", caminho, round(os.path.getsize(caminho) / 1024 / 1024, 2), "MB")
bpy.ops.wm.save_as_mainfile(filepath=SRC.replace(".blend", "_foto.blend"), compress=True)
