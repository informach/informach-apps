"""Passa animações Mixamo (clipes.blend, já limpos e no lugar) para o esqueleto dos pacotes ITHappy.

Todos os corpos do Morada usam o mesmo esqueleto do pacote (44 ossos, mesma orientação de repouso), então a conversão
é feita uma vez, no adulto masculino de base; cada tipo de corpo depois só ajusta a escala do quadril, a abertura dos
braços e o apoio no chão (corpos.py).

Conversão: rotação no espaço do mundo, osso a osso, com o desvio de repouso entre os dois esqueletos; o Spine2 do Mixamo
(que o pacote não tem) é somado ao Spine1; o quadril anda na escala da altura do quadril.

Uso: python mixamo_pacote.py <clipes.blend> <saida.blend>
"""
import os
import sys

import bpy
from mathutils import Matrix

LIB, OUT = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])
SCR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = os.path.join(SCR, "ideias", "Chess_Pack/Chess_Pack_Free_fbx/Chess_Pack_Free_fbx/Characters/Chess_Player_01.fbx")
# id no Morada: nome do clipe Mixamo
CLIPES = {
    "sentando": "sitting", "sentado": "sitting_idle", "cartas": "cards", "deitando": "lying_down",
    "dormindo_cama": "laying_sleeping", "dormindo_chao": "sleeping_idle", "pulando": "jump", "dancando": "hip_hop_dancing",
    "rumba": "rumba_dancing", "beijo": "blow_a_kiss", "irritado": "angry", "rezando": "praying", "abdominal": "situps",
    "nadando": "swimming", "de_costas": "walking_backwards", "trotando": "jogging",
    # estas precisam de um auxiliar na cena de teste (saco, outra pessoa, escada, barra), que não faz parte da animação
    "chute": "mma_kick", "insulto": "insult", "beijo_par": "kiss", "escada": "climbing_ladder", "pendurado": "hanging_idle",
}

bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene
scn.render.fps = 30
bpy.ops.import_scene.fbx(filepath=BASE)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
for a in list(bpy.data.actions):
    bpy.data.actions.remove(a)
arm.animation_data_clear()
for o in list(bpy.data.objects):
    if o.type == "MESH":
        bpy.data.objects.remove(o, do_unlink=True)
for pb in arm.pose.bones:
    pb.matrix_basis.identity()
    pb.rotation_mode = "QUATERNION"

with bpy.data.libraries.load(LIB, link=False) as (src, dst):
    dst.objects = ["Esqueleto"]
    dst.actions = [a for a in src.actions if a in CLIPES.values()]
ch = dst.objects[0]
scn.collection.objects.link(ch)
bpy.context.view_layer.update()  # sem isso a matrix_world do esqueleto Mixamo ainda é a identidade (falta a escala 0,01)

MAPA = {"Hips": "Hips", "Spine": "Spine", "Spine1": "Spine1", "Neck": "Neck", "Head": "Head"}
for lado in ("Left", "Right"):
    for n in ("Shoulder", "Arm", "ForeArm", "Hand", "UpLeg", "Leg", "Foot", "ToeBase"):
        MAPA[lado + n] = lado + n
P = "mixamorig:"


def rest_mundo(o, nome):
    return (o.matrix_world @ o.data.bones[nome].matrix_local).to_quaternion()


def direcao(o, nome):
    b = o.data.bones[nome]
    return (o.matrix_world @ b.tail_local - o.matrix_world @ b.head_local).normalized()


# Os repousos são poses diferentes: o Mixamo está em T (braços na horizontal) e o pacote em A (braços para baixo).
# Antes de copiar, cada osso do pacote é girado para apontar como o osso do Mixamo no repouso (alinhamento), senão
# o braço que desce no Mixamo desceria a mais no pacote e entraria no corpo.
desvio = {}
for s, d in MAPA.items():
    s_ = "Spine2" if d == "Spine1" else s
    alinha = direcao(arm, d).rotation_difference(direcao(ch, P + s_))
    desvio[d] = rest_mundo(ch, P + s_).inverted() @ alinha @ rest_mundo(arm, d)
ordem = sorted(MAPA.values(), key=lambda n: len(arm.pose.bones[n].parent_recursive))
inv = {v: k for k, v in MAPA.items()}
escala = (arm.matrix_world @ arm.data.bones["Hips"].head_local).z / (ch.matrix_world @ ch.data.bones[P + "Hips"].head_local).z
h0_src = ch.matrix_world @ ch.data.bones[P + "Hips"].head_local
h0_dst = arm.matrix_world @ arm.data.bones["Hips"].head_local


def converter(acao, nome):
    ch.animation_data_create()
    ch.animation_data.action = acao
    if hasattr(ch.animation_data, "action_slot") and acao.slots:
        ch.animation_data.action_slot = acao.slots[0]
    nova = bpy.data.actions.new(f"mix|{nome}")
    arm.animation_data_create()
    arm.animation_data.action = nova
    f0, f1 = (int(x) for x in acao.frame_range)
    for f in range(f0, f1 + 1):
        scn.frame_set(f)
        for d in ordem:
            s = inv[d]
            pb_s = ch.pose.bones[P + s]
            src = ch.pose.bones[P + "Spine2"] if d == "Spine1" else pb_s  # o Spine1 leva a curvatura do Spine2
            alvo = (ch.matrix_world @ src.matrix).to_quaternion() @ desvio[d]
            pb = arm.pose.bones[d]
            M = arm.matrix_world.inverted().to_quaternion() @ alvo
            pos = pb.matrix.translation.copy()
            if d == "Hips":
                hs = ch.matrix_world @ pb_s.matrix.translation
                pos = arm.matrix_world.inverted() @ (h0_dst + (hs - h0_src) * escala)
            pb.matrix = Matrix.Translation(pos) @ M.to_matrix().to_4x4()
            bpy.context.view_layer.update()
            pb.keyframe_insert("rotation_quaternion", frame=f - f0 + 1)
            if d == "Hips":
                pb.keyframe_insert("location", frame=f - f0 + 1)
    arm.animation_data.action = None
    for pb in arm.pose.bones:
        pb.matrix_basis.identity()
    nova.use_fake_user = True
    print("convertido", nome, f1 - f0 + 1, "quadros")
    return nova


por_nome = {a.name: a for a in dst.actions}
for nome, clipe in CLIPES.items():
    converter(por_nome[clipe], nome)
bpy.data.objects.remove(ch, do_unlink=True)
for a in list(dst.actions):
    bpy.data.actions.remove(a)
bpy.ops.wm.save_as_mainfile(filepath=OUT)
print("ok")
