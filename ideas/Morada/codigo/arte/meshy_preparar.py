"""Prepara um personagem gerado no Meshy para o jogo.

Uso: python meshy_preparar.py <build/clipes.blend> <modelo.fbx> <textura.png> <id> <saida_dir>

1. Importa o FBX (esqueleto Mixamo do Meshy) e liga a textura.
2. Iguala a orientação de repouso dos ossos à do esqueleto das nossas animações (Ch46): as 35 animações
   passam a valer direto, sem retarget, no Blender e no Three.js.
3. Copia as animações para o personagem com o deslocamento do quadril na escala dele (altura do quadril).
4. Salva <saida>/<id>.blend e exporta <saida>/<id>.glb (malha + esqueleto + animações).
"""
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mh_base as mh  # noqa: E402

LIB, FBX, TEX, PID, OUT = sys.argv[1:6]
P = "mixamorig:"
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.open_mainfile(filepath=LIB)
CH46 = bpy.data.objects["Esqueleto"]
CH46.data.pose_position = "REST"
CLIPES = [a for a in bpy.data.actions]
antes = set(bpy.data.objects)
bpy.ops.import_scene.fbx(filepath=FBX, automatic_bone_orientation=False)
novos = [o for o in bpy.data.objects if o not in antes]
arm = next(o for o in novos if o.type == "ARMATURE")
malhas = [o for o in novos if o.type == "MESH"]
for a in list(bpy.data.actions):  # animações que vieram do Meshy (andar/correr) saem: usamos as nossas
    if a not in CLIPES:
        bpy.data.actions.remove(a)
if arm.animation_data:
    arm.animation_data.action = None
arm.name = f"{PID}_esqueleto"
arm.data.pose_position = "POSE"
for m in malhas:
    m.name = f"{PID}_corpo"

# textura: o FBX do Meshy aponta para um nome que não vem no zip
img = bpy.data.images.load(TEX)
img.name = f"{PID}_base"
for m in malhas:
    for mat in m.data.materials:
        mat.name = f"{PID}_pele_roupa"
        nt = mat.node_tree
        b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
        t = next((n for n in nt.nodes if n.type == "TEX_IMAGE"), None) or nt.nodes.new("ShaderNodeTexImage")
        t.image = img
        nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
        b.inputs["Roughness"].default_value = 0.72
        if "Specular IOR Level" in b.inputs:
            b.inputs["Specular IOR Level"].default_value = 0.3

# repouso igual ao Ch46
for m in malhas:
    if not any(md.type == "ARMATURE" for md in m.modifiers):
        m.modifiers.new("Esqueleto", "ARMATURE").object = arm
mh.ajustar_pose_t(arm, malhas, CH46)
bpy.context.view_layer.update()


def quadril(o):
    return (o.matrix_world @ o.data.bones[P + "Hips"].head_local).z


RAZAO = quadril(arm) / quadril(CH46)
print(PID, "quadril", round(quadril(arm), 3), "razão", round(RAZAO, 3))

# animações do personagem: cópias com o quadril escalado
acoes = []
for a in CLIPES:
    c = a.copy()
    c.name = f"{PID}|{a.name}"
    for lay in c.layers:
        for st in lay.strips:
            for cb in st.channelbags:
                for fc in cb.fcurves:
                    if fc.data_path == f'pose.bones["{P}Hips"].location':
                        for k in fc.keyframe_points:
                            k.co.y *= RAZAO
                            k.handle_left.y *= RAZAO
                            k.handle_right.y *= RAZAO
    c.use_fake_user = True
    acoes.append(c)
for a in CLIPES:
    bpy.data.actions.remove(a)
bpy.data.objects.remove(CH46, do_unlink=True)
for o in list(bpy.data.objects):
    if o not in novos:
        bpy.data.objects.remove(o, do_unlink=True)

# todas as animações em faixas NLA mudas: o exportador glTF leva cada uma como um clipe
ad = arm.animation_data or arm.animation_data_create()
ad.action = None
for a in acoes:
    tr = ad.nla_tracks.new()
    tr.name = a.name.split("|", 1)[1]
    st = tr.strips.new(tr.name, int(a.frame_range[0]), a)
    if hasattr(st, "action_slot") and st.action_slot is None and a.slots:
        st.action_slot = a.slots[0]
    tr.mute = True

me = malhas[0].data
me.calc_loop_triangles()
print(PID, "triângulos", len(me.loop_triangles), "ossos", len(arm.data.bones), "animações", len(acoes))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, f"{PID}.blend"))
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, f"{PID}.glb"), export_format="GLB", export_animations=True,
                          export_animation_mode="NLA_TRACKS", export_image_format="WEBP", export_apply=False)
print("ok", PID)
