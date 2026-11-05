"""Teste headless sem add-on de terceiros:
esqueleto com nomes do Mixamo -> controle IK criado por script -> animação nova -> bake visual -> glTF.
Uso: python teste_ik_script.py <saida.glb>
"""
import math
import os
import sys

import bpy
from mathutils import Vector

OUT = sys.argv[1]
print("Blender", bpy.app.version_string, "background:", bpy.app.background)
bpy.ops.wm.read_factory_settings(use_empty=True)

# 1. Esqueleto no padrão de nomes do Mixamo (T-pose, metros, Z para cima)
P = "mixamorig:"
B = {
    "Hips": ((0, 0, 1.0), (0, 0, 1.1), None),
    "Spine": ((0, 0, 1.1), (0, 0, 1.22), "Hips"),
    "Spine1": ((0, 0, 1.22), (0, 0, 1.34), "Spine"),
    "Spine2": ((0, 0, 1.34), (0, 0, 1.46), "Spine1"),
    "Neck": ((0, 0, 1.46), (0, 0, 1.56), "Spine2"),
    "Head": ((0, 0, 1.56), (0, 0, 1.76), "Neck"),
}
for s, sx in (("Left", 1), ("Right", -1)):
    B.update({
        f"{s}Shoulder": ((sx * 0.05, 0, 1.42), (sx * 0.17, 0, 1.42), "Spine2"),
        f"{s}Arm": ((sx * 0.17, 0, 1.42), (sx * 0.45, 0, 1.40), f"{s}Shoulder"),
        f"{s}ForeArm": ((sx * 0.45, 0, 1.40), (sx * 0.70, 0.02, 1.42), f"{s}Arm"),
        f"{s}Hand": ((sx * 0.70, 0.02, 1.42), (sx * 0.78, 0.02, 1.42), f"{s}ForeArm"),
        f"{s}UpLeg": ((sx * 0.1, 0, 0.95), (sx * 0.1, -0.01, 0.52), "Hips"),
        f"{s}Leg": ((sx * 0.1, -0.01, 0.52), (sx * 0.1, 0.0, 0.1), f"{s}UpLeg"),
        f"{s}Foot": ((sx * 0.1, 0, 0.1), (sx * 0.1, -0.12, 0.03), f"{s}Leg"),
    })

arm_data = bpy.data.armatures.new("Armature")
arm = bpy.data.objects.new("Armature", arm_data)
bpy.context.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
arm.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
for n, (h, t, _) in B.items():
    eb = arm_data.edit_bones.new(P + n)
    eb.head, eb.tail = Vector(h), Vector(t)
for n, (_, _, p) in B.items():
    if p:
        arm_data.edit_bones[P + n].parent = arm_data.edit_bones[P + p]
# 2. Controles criados por script: alvo IK da mão direita e polo do cotovelo (não deformam)
ik = arm_data.edit_bones.new("CTRL_mao_D")
ik.head, ik.tail = Vector((-0.70, 0.02, 1.42)), Vector((-0.70, 0.12, 1.42))
ik.use_deform = False
pole = arm_data.edit_bones.new("CTRL_cotovelo_D")
pole.head, pole.tail = Vector((-0.45, 0.4, 1.40)), Vector((-0.45, 0.5, 1.40))
pole.use_deform = False
for n in B:
    arm_data.edit_bones[P + n].use_deform = True
bpy.ops.object.mode_set(mode="OBJECT")
print("ossos:", len(arm_data.bones))

con = arm.pose.bones[P + "RightForeArm"].constraints.new("IK")
con.target, con.subtarget = arm, "CTRL_mao_D"
con.pole_target, con.pole_subtarget = arm, "CTRL_cotovelo_D"
con.pole_angle = math.radians(-90)
con.chain_count = 2

# 3. Animação nova só movendo o controle: acenar
scn = bpy.context.scene
scn.frame_start, scn.frame_end = 1, 24
act = bpy.data.actions.new("acenar_controle")
arm.animation_data_create()
arm.animation_data.action = act
ctrl = arm.pose.bones["CTRL_mao_D"]
for f, dz, dx in ((1, 0, 0), (8, 0.40, 0.25), (12, 0.42, 0.15), (16, 0.40, 0.25), (20, 0.42, 0.15), (24, 0, 0)):
    ctrl.location = Vector((dx, 0, dz))  # espaço local do osso
    ctrl.keyframe_insert("location", frame=f)

# 4. Bake visual: grava a pose resultante nos ossos que deformam e remove o IK
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="POSE")
for pb in arm.pose.bones:  # no Blender 5 a seleção fica no PoseBone
    pb.select = pb.name.startswith(P)
bpy.ops.nla.bake(frame_start=1, frame_end=24, only_selected=True, visual_keying=True,
                 clear_constraints=True, use_current_action=False, bake_types={"POSE"})
bpy.ops.object.mode_set(mode="OBJECT")
baked = arm.animation_data.action
baked.name = "acenar"

mao = arm.pose.bones[P + "RightHand"]
alturas = []
for f in (1, 8, 12, 24):
    scn.frame_set(f)
    alturas.append(round((arm.matrix_world @ mao.head).z, 2))
print("altura da mão direita nos quadros 1, 8, 12, 24 (m):", alturas)

# 5. Remove os controles e exporta só o esqueleto de deformação com a animação
bpy.ops.object.mode_set(mode="EDIT")
for n in ("CTRL_mao_D", "CTRL_cotovelo_D"):
    arm_data.edit_bones.remove(arm_data.edit_bones[n])
bpy.ops.object.mode_set(mode="OBJECT")
bpy.data.actions.remove(act)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_animations=True,
                          export_animation_mode="ACTIONS")
print("exportado:", os.path.basename(OUT), os.path.getsize(OUT), "bytes;",
      "ações:", [a.name for a in bpy.data.actions])
