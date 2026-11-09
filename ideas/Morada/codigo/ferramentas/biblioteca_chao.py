"""Nada atravessa o chão: mãos, pés e joelhos que entram no piso sobem até a superfície.

O Mixamo apoia as mãos e os joelhos no chão com a malha do personagem dele; na nossa malha (cabeça, mãos e pés
maiores) dedos, joelhos e pontas dos pés afundam até 15 cm. Para cada quadro mede o ponto mais baixo de cada
membro e:
  - mão no chão: sobe o pulso com IK de braço e antebraço (a mão mantém a orientação);
  - pé no chão: sobe o tornozelo com IK de coxa e perna;
  - joelho ou coxa no chão: sobe o quadril e devolve os dois tornozelos ao lugar com IK (os pés continuam plantados).
O deslocamento é suavizado no tempo; duas passadas para pegar o que sobra.

Uso: python biblioteca_chao.py -- <corrigido_todos/corpo.blend> <corpo>   (grava no mesmo .blend e no .json)
"""
import bpy, json, sys
import numpy as np
from mathutils import Matrix, Vector

a = sys.argv[sys.argv.index("--") + 1:]
BLEND, CORPO = a[:2]
SO = set(a[2].split(",")) if len(a) > 2 and a[2] else set()
FORA = ("resident.stairs.", "resident.swim", "resident.lie.", "resident.sleep.", "resident.gravida.lie_side",
        "resident.parto.contracao_deitada")  # degrau, água e cama
FOLGA = 0.004  # o ponto mais baixo fica 4 mm acima do chão
bpy.ops.wm.open_mainfile(filepath=BLEND)
scn = bpy.context.scene
arm = bpy.data.objects[CORPO]
corpo = bpy.data.objects[CORPO + "_corpo"]
for o in bpy.data.objects:
    if o.type == "MESH" and o.parent is arm and o is not corpo:
        for m in o.modifiers:
            m.show_viewport = False
mw = arm.matrix_world
nomes = {g.index: g.name for g in corpo.vertex_groups}
dom = [nomes.get(max(v.groups, key=lambda g: g.weight).group, "") if v.groups else "" for v in corpo.data.vertices]


def grupo(f):
    return np.array([f(n) for n in dom])


MEMBROS = {
    "mao_L": grupo(lambda n: n.startswith("LeftHand")), "mao_R": grupo(lambda n: n.startswith("RightHand")),
    "pe_L": grupo(lambda n: n in ("LeftFoot", "LeftToeBase") or n.startswith("LeftToe")),
    "pe_R": grupo(lambda n: n in ("RightFoot", "RightToeBase") or n.startswith("RightToe")),
    "joelho": grupo(lambda n: n in ("LeftLeg", "RightLeg", "LeftUpLeg", "RightUpLeg", "Hips")),
}
CADEIA = {"mao_L": ("LeftArm", "LeftForeArm", "LeftHand"), "mao_R": ("RightArm", "RightForeArm", "RightHand"),
          "pe_L": ("LeftUpLeg", "LeftLeg", "LeftFoot"), "pe_R": ("RightUpLeg", "RightLeg", "RightFoot")}
OSSOS_CHAVE = sorted({b for c in CADEIA.values() for b in c} | {"Hips"})


def malha_z():
    ev = corpo.evaluated_get(bpy.context.evaluated_depsgraph_get())
    me = ev.to_mesh()
    P = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get("co", P)
    ev.to_mesh_clear()
    M = np.array(corpo.matrix_world)
    return (P.reshape(-1, 3) @ M[:3, :3].T + M[:3, 3])[:, 2]


def afundado(z):
    return {k: max(0.0, FOLGA - float(z[m].min())) for k, m in MEMBROS.items()}


def gira_osso(pb, q_mundo):
    R = mw.to_quaternion()
    q = R.inverted() @ q_mundo @ R
    h = pb.head.copy()
    pb.matrix = Matrix.Translation(h) @ q.to_matrix().to_4x4() @ Matrix.Translation(-h) @ pb.matrix


def ik(cadeia, alvo):
    """Leva a ponta da cadeia (cabeça do 3º osso) ao alvo no mundo; o 3º osso mantém a orientação no mundo."""
    p1, p2, p3 = (arm.pose.bones[n] for n in cadeia)
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
    p3.matrix = Matrix.Translation(p3.head) @ (mw.to_quaternion().inverted() @ rot3).to_matrix().to_4x4()
    bpy.context.view_layer.update()


def sobe_quadril(dz):
    """Sobe o quadril dz (mundo) e devolve os tornozelos ao lugar."""
    pes = {k: mw @ arm.pose.bones[CADEIA[k][2]].head for k in ("pe_L", "pe_R")}
    ph = arm.pose.bones["Hips"]
    ph.matrix = Matrix.Translation(mw.inverted().to_3x3() @ Vector((0, 0, dz))) @ ph.matrix
    bpy.context.view_layer.update()
    for k, p in pes.items():
        ik(CADEIA[k], p)


def suaviza(x, sigma=2.0):
    xs = np.arange(-6, 7)
    ker = np.exp(-0.5 * (xs / sigma) ** 2)
    ker /= ker.sum()
    y = np.convolve(np.pad(x, 6, mode="edge"), ker, mode="valid")
    return np.maximum(y, x * 0.85)  # a suavização não pode deixar o quadro mais fundo voltar para dentro do chão


J = BLEND[:-6] + ".json"
dados = json.load(open(J))
rel = dados.setdefault("correcoes", {})
acoes = [x for x in bpy.data.actions if x.name.startswith("resident.") and not x.name.startswith(FORA)
         and (not SO or x.name in SO)]
total = 0
for act in sorted(acoes, key=lambda x: x.name):
    arm.animation_data.action = act
    if act.slots:
        arm.animation_data.action_slot = act.slots[0]
    f0, f1 = (int(x) for x in act.frame_range)
    quadros = list(range(f0, f1 + 1))
    pior = 0.0
    for f in quadros[::3]:
        scn.frame_set(f)
        pior = max(pior, max(afundado(malha_z()).values()))
    if pior < 0.012:
        continue
    chaveado = False
    mexidos = set()
    for passada in range(2):
        D = {k: np.zeros(len(quadros)) for k in MEMBROS}
        for i, f in enumerate(quadros):
            scn.frame_set(f)
            for k, v in afundado(malha_z()).items():
                D[k][i] = v
        if max(d.max() for d in D.values()) < 0.006:
            break
        if not chaveado:  # grava os ossos em todos os quadros antes de mexer
            for f in quadros:
                scn.frame_set(f)
                for nb in OSSOS_CHAVE:
                    arm.pose.bones[nb].keyframe_insert("rotation_quaternion", frame=f, group=nb)
                arm.pose.bones["Hips"].keyframe_insert("location", frame=f, group="Hips")
            chaveado = True
        D = {k: suaviza(d) for k, d in D.items()}
        for i, f in enumerate(quadros):
            scn.frame_set(f)
            mexeu = False
            if D["joelho"][i] > 1e-4:
                sobe_quadril(D["joelho"][i])
                mexeu = True
            for k in ("mao_L", "mao_R", "pe_L", "pe_R"):
                if D[k][i] > 1e-4:
                    pb = arm.pose.bones[CADEIA[k][2]]
                    ik(CADEIA[k], mw @ pb.head + Vector((0, 0, D[k][i])))
                    mexeu = True
            if mexeu:
                mexidos.add(f)
                for nb in OSSOS_CHAVE:
                    arm.pose.bones[nb].keyframe_insert("rotation_quaternion", frame=f, group=nb)
                arm.pose.bones["Hips"].keyframe_insert("location", frame=f, group="Hips")
    if mexidos:
        rel.setdefault(act.name, {})["chao"] = {"quadros": len(mexidos), "afundava_cm": round(pior * 100, 1)}
        total += 1
        print("chao", CORPO, act.name, len(mexidos), f"{pior * 100:.1f} cm", flush=True)
arm.animation_data.action = None
for pb in arm.pose.bones:
    pb.matrix_basis.identity()
for o in bpy.data.objects:
    if o.type == "MESH" and o.parent is arm and o is not corpo:
        for m in o.modifiers:
            m.show_viewport = True
bpy.ops.wm.save_as_mainfile(filepath=BLEND, compress=True)
json.dump(dados, open(J, "w"), ensure_ascii=False, indent=1)
print("fim", CORPO, total)
