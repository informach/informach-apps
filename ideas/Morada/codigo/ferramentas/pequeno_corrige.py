"""Duas correções no corpo de 2–3 anos (cabeça grande, braços curtos).

- Choro (resident.emote.cry): no Mixamo as mãos esfregam os olhos; aqui paravam no queixo. Quando a mão chega perto do
  rosto, ela sobe até o olho do mesmo lado (IK de braço e antebraço; a mão mantém a orientação).
- Aterrorizado (resident.emote.scared): o tronco dobrava tanto que a cabeça quase encostava nos joelhos. A curvatura de
  coluna, pescoço e cabeça cai pela metade (o quadril fica como está, para os pés não saírem do lugar).

Uso: python pequeno_corrige.py -- <corrigido_todos/pequeno_m.blend> <corpo>   (grava no mesmo .blend e .json)
"""
import bpy, sys, json, math
import numpy as np
from mathutils import Matrix, Quaternion, Vector

a = sys.argv[sys.argv.index("--") + 1:]
BLEND, CORPO = a[:2]
bpy.ops.wm.open_mainfile(filepath=BLEND)
scn = bpy.context.scene
arm = bpy.data.objects[CORPO]
mw = arm.matrix_world
J = BLEND[:-6] + ".json"
dados = json.load(open(J))
rel = dados.setdefault("correcoes", {})


def usar(act):
    arm.animation_data.action = act
    if act.slots:
        arm.animation_data.action_slot = act.slots[0]
    return [int(x) for x in act.frame_range]


def gira_osso(pb, q_mundo):
    R = mw.to_quaternion()
    q = R.inverted() @ q_mundo @ R
    h = pb.head.copy()
    pb.matrix = Matrix.Translation(h) @ q.to_matrix().to_4x4() @ Matrix.Translation(-h) @ pb.matrix


def ik(lado, alvo, cadeia=("Arm", "ForeArm", "Hand")):
    p1, p2, p3 = (arm.pose.bones[lado + n] for n in cadeia)
    S, E, W = mw @ p1.head, mw @ p2.head, mw @ p3.head
    rot3 = (mw @ p3.matrix).to_quaternion()
    a_, b_ = (E - S).length, (W - E).length
    L = min(max((alvo - S).length, abs(a_ - b_) + 1e-4), a_ + b_ - 1e-4)
    d = (alvo - S).normalized()
    polo = (E - S) - d * (E - S).dot(d)
    if polo.length < 1e-6:
        return
    polo.normalize()
    cos_a = (a_ * a_ + L * L - b_ * b_) / (2 * a_ * L)
    sin_a = max(0.0, 1 - cos_a * cos_a) ** 0.5
    E2 = S + d * (a_ * cos_a) + polo * (a_ * sin_a)
    gira_osso(p1, (E - S).rotation_difference(E2 - S))
    bpy.context.view_layer.update()
    E1, W1 = mw @ p2.head, mw @ p3.head
    gira_osso(p2, (W1 - E1).rotation_difference(S + d * L - E1))
    bpy.context.view_layer.update()
    if cadeia[0].endswith("UpLeg"):  # pé plantado; a mão acompanha o antebraço
        p3.matrix = Matrix.Translation(p3.head) @ (mw.to_quaternion().inverted() @ rot3).to_matrix().to_4x4()
        bpy.context.view_layer.update()


# olhos no repouso, no espaço da cabeça (do rosto neutro: as duas ilhas de altura do meio)
arm.animation_data.action = None
for pb in arm.pose.bones:
    pb.matrix_basis.identity()
bpy.context.view_layer.update()
rosto = bpy.data.objects[CORPO + "_rosto_neutro"]
R = np.array([rosto.matrix_world @ v.co for v in rosto.data.vertices])
z_sobr, z_boca = R[:, 2].max(), R[:, 2].min()
z_olho = z_boca + 0.62 * (z_sobr - z_boca)
faixa = R[np.abs(R[:, 2] - z_olho) < 0.15 * (z_sobr - z_boca)]
cab = arm.pose.bones["Head"]
M_cab = (mw @ cab.matrix).inverted()
OLHO = {}
for lado, sx in (("Left", 1), ("Right", -1)):
    lado_pts = faixa[faixa[:, 0] * sx > 0]
    p = Vector((float(np.median(lado_pts[:, 0])), float(lado_pts[:, 1].min()) - 0.012, float(z_olho)))
    OLHO[lado] = M_cab @ p  # no espaço do osso da cabeça
altura = dados["altura"]

# ---------------------------------------------------------------- choro: mãos nos olhos
act = bpy.data.actions.get("resident.emote.cry")
if act:
    f0, f1 = usar(act)
    quadros = list(range(f0, f1 + 1))
    ossos = [l + n for l in ("Left", "Right") for n in ("Arm", "ForeArm", "Hand")]
    D = {l: np.zeros((len(quadros), 3)) for l in OLHO}
    for i, f in enumerate(quadros):
        scn.frame_set(f)
        Mc = mw @ cab.matrix
        for l in OLHO:
            alvo = Mc @ OLHO[l]
            ph = arm.pose.bones[l + "Hand"]
            ponta = mw @ ph.tail  # a base dos dedos vai ao olho
            dist = (ponta - alvo).length
            w = min(1.0, max(0.0, 1 - (dist - 0.04 * altura / 0.86) / (0.12 * altura / 0.86)))
            w = w * w * (3 - 2 * w)
            D[l][i] = np.array(alvo - ponta) * w
    xs = np.arange(-6, 7)
    ker = np.exp(-0.5 * (xs / 2.0) ** 2)
    ker /= ker.sum()
    for l in D:
        pad = np.pad(D[l], ((6, 6), (0, 0)), mode="edge")
        D[l] = np.stack([np.convolve(pad[:, c], ker, mode="valid") for c in range(3)], 1)
    for f in quadros:
        scn.frame_set(f)
        for nb in ossos:
            arm.pose.bones[nb].keyframe_insert("rotation_quaternion", frame=f, group=nb)
    n = 0
    for i, f in enumerate(quadros):
        scn.frame_set(f)
        mexeu = False
        for l in D:
            if np.linalg.norm(D[l][i]) < 1e-4:
                continue
            ik(l, mw @ arm.pose.bones[l + "Hand"].head + Vector(D[l][i]))
            mexeu = True
        if mexeu:
            n += 1
            for nb in ossos:
                arm.pose.bones[nb].keyframe_insert("rotation_quaternion", frame=f, group=nb)
    rel.setdefault(act.name, {})["maos_nos_olhos"] = n
    print("choro", n)

# ---------------------------------------------------------------- aterrorizado: menos curvado
act = bpy.data.actions.get("resident.emote.scared")
if act:
    f0, f1 = usar(act)
    n = 0
    for nb, fator in (("Spine", 0.5), ("Spine1", 0.5), ("Neck", 0.5), ("Head", 0.55)):
        if nb not in arm.pose.bones:
            continue
        fcs = [act.fcurve_ensure_for_datablock(arm, f'pose.bones["{nb}"].rotation_quaternion', index=j) for j in range(4)]
        for k in range(len(fcs[0].keyframe_points)):
            q = Quaternion([fc.keyframe_points[k].co[1] for fc in fcs])
            q2 = Quaternion((1, 0, 0, 0)).slerp(q.normalized(), fator)
            for j, fc in enumerate(fcs):
                kp = fc.keyframe_points[k]
                kp.co = (kp.co[0], q2[j])
        for fc in fcs:
            fc.update()
        n += 1
    # o corpo também se inclina menos (metade do quanto ele gira a partir do primeiro quadro); os pés ficam onde estavam
    ph = arm.pose.bones["Root"]  # é o Root que leva a inclinação do corpo nestes clipes
    pernas = [l + n for l in ("Left", "Right") for n in ("UpLeg", "Leg", "Foot")]
    scn.frame_set(f0)
    q0 = ph.rotation_quaternion.copy()
    poses = {}
    for f in range(f0, f1 + 1):
        scn.frame_set(f)
        poses[f] = {l: (mw @ arm.pose.bones[l + "Foot"].head, (mw @ arm.pose.bones[l + "Foot"].matrix).to_quaternion())
                    for l in ("Left", "Right")}
    for f in range(f0, f1 + 1):
        scn.frame_set(f)
        for nb in pernas:
            arm.pose.bones[nb].keyframe_insert("rotation_quaternion", frame=f, group=nb)
    for f in range(f0, f1 + 1):
        scn.frame_set(f)
        q = ph.rotation_quaternion.copy()
        if q0.dot(q) < 0:
            q = -q
        ph.rotation_quaternion = q0.slerp(q, 0.5)
        bpy.context.view_layer.update()
        for l, (pe, rot_pe) in poses[f].items():
            ik(l, pe, ("UpLeg", "Leg", "Foot"))
            pf = arm.pose.bones[l + "Foot"]
            pf.matrix = Matrix.Translation(pf.head) @ (mw.to_quaternion().inverted() @ rot_pe).to_matrix().to_4x4()
            bpy.context.view_layer.update()
        ph.keyframe_insert("rotation_quaternion", frame=f, group="Root")
        for nb in pernas:
            arm.pose.bones[nb].keyframe_insert("rotation_quaternion", frame=f, group=nb)
    rel.setdefault(act.name, {})["menos_curvado"] = True
    print("aterrorizado", n)

arm.animation_data.action = None
for pb in arm.pose.bones:
    pb.matrix_basis.identity()
bpy.ops.wm.save_as_mainfile(filepath=BLEND, compress=True)
json.dump(dados, open(J, "w"), ensure_ascii=False, indent=1)
print("fim")
