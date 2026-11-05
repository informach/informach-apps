"""Antebraço fora do corpo: onde o antebraço entra na barriga, no quadril ou no peito, o braço abre o necessário.

Para cada quadro e cada lado, acha o ponto da malha do antebraço mais fundo dentro do corpo (teste de dentro por
raios, como em mede_antebraco.py) e o caminho mais curto até a pele. Cotovelo e pulso se afastam nessa direção (mais o
cotovelo se o ponto fundo está perto dele, mais o pulso se está perto da mão), com IK de dois ossos e a mão mantendo a
orientação. O deslocamento é suavizado no tempo; duas passadas.

Uso: python biblioteca_antebraco.py -- <corrigido_todos/corpo.blend> <corpo> [ids]   (grava no mesmo .blend e .json)
"""
import bpy, sys, json
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

a = sys.argv[sys.argv.index("--") + 1:]
BLEND, CORPO = a[:2]
SO = set(a[2].split(",")) if len(a) > 2 and a[2] else set()
FOLGA = 0.004
bpy.ops.wm.open_mainfile(filepath=BLEND)
scn = bpy.context.scene
arm = bpy.data.objects[CORPO]
corpo = bpy.data.objects[CORPO + "_corpo"]
for o in bpy.data.objects:
    if o.type == "MESH" and o.parent is arm and o is not corpo:
        for m in o.modifiers:
            m.show_viewport = False
mw = arm.matrix_world


def peso(nomes):
    idx = {corpo.vertex_groups[n].index for n in nomes if n in corpo.vertex_groups}
    return np.array([sum(g.weight for g in v.groups if g.group in idx) for v in corpo.data.vertices])


tris = []
for p in corpo.data.polygons:
    v = p.vertices
    for i in range(1, len(v) - 1):
        tris.append((v[0], v[i], v[i + 1]))
tris = np.array(tris)
w_bracos = peso([b.name for b in arm.data.bones if any(t in b.name for t in ("Shoulder", "Arm", "Hand"))])
MASC = [tuple(t) for t in tris[(w_bracos[tris] < 0.3).all(1)]]
ANTE = {l: list(np.nonzero(peso([l + "ForeArm"]) > 0.6)[0][::2]) for l in ("Left", "Right")}
DIRS = [Vector((1, 0, 0)), Vector((-1, 0, 0)), Vector((0, 1, 0)), Vector((0, -1, 0))]


def malha():
    ev = corpo.evaluated_get(bpy.context.evaluated_depsgraph_get())
    me = ev.to_mesh()
    P = [ev.matrix_world @ v.co for v in me.vertices]
    ev.to_mesh_clear()
    return P


def dentro(bvh, q):
    n_dentro = 0
    for d in DIRS:
        o_, n_ = q, 0
        while True:
            hit = bvh.ray_cast(o_, d, 2.0)
            if hit[0] is None:
                break
            n_ += 1
            o_ = hit[0] + d * 1e-4
        n_dentro += n_ % 2
    return n_dentro >= 3


def mede(P):
    """{lado: (empurrão no mundo, t ao longo do antebraço: 0 cotovelo, 1 pulso)}"""
    bvh = BVHTree.FromPolygons(P, MASC)
    res = {}
    for lado in ("Left", "Right"):
        pf = arm.pose.bones[lado + "ForeArm"]
        E, W = mw @ pf.head, mw @ pf.tail
        pior = None
        for vi in ANTE[lado]:
            q = P[vi]
            if not dentro(bvh, q):
                continue
            loc, nrm, _, dist = bvh.find_nearest(q)
            if loc is not None and (pior is None or dist > pior[0]):
                pior = (dist, loc - q, q)
        if pior is None:
            continue
        d_, v_, q = pior
        t = max(0.0, min(1.0, (q - E).dot(W - E) / max((W - E).length_squared, 1e-9)))
        res[lado] = (np.array(v_.normalized() * (d_ + FOLGA)), t)
    return res


def gira_osso(pb, q_mundo):
    R = mw.to_quaternion()
    q = R.inverted() @ q_mundo @ R
    h = pb.head.copy()
    pb.matrix = Matrix.Translation(h) @ q.to_matrix().to_4x4() @ Matrix.Translation(-h) @ pb.matrix


def ik(lado, alvo, polo_hint):
    p1, p2, p3 = (arm.pose.bones[lado + n] for n in ("Arm", "ForeArm", "Hand"))
    S, E, W = mw @ p1.head, mw @ p2.head, mw @ p3.head
    rot3 = (mw @ p3.matrix).to_quaternion()
    a_, b_ = (E - S).length, (W - E).length
    L = min(max((alvo - S).length, abs(a_ - b_) + 1e-4), a_ + b_ - 1e-4)
    d = (alvo - S).normalized()
    polo = (polo_hint - S) - d * (polo_hint - S).dot(d)
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


def suaviza(X, sigma=2.5):
    xs = np.arange(-8, 9)
    ker = np.exp(-0.5 * (xs / sigma) ** 2)
    ker /= ker.sum()
    pad = np.pad(X, ((8, 8), (0, 0)), mode="edge")
    Y = np.stack([np.convolve(pad[:, c], ker, mode="valid") for c in range(X.shape[1])], 1)
    # a suavização não pode encolher o empurrão do quadro mais fundo
    nx, ny = np.linalg.norm(X, axis=1), np.linalg.norm(Y, axis=1)
    k = np.where((ny > 1e-9) & (ny < nx * 0.85), nx * 0.85 / np.maximum(ny, 1e-9), 1.0)
    return Y * k[:, None]


J = BLEND[:-6] + ".json"
dados = json.load(open(J))
rel = dados.setdefault("correcoes", {})
OSSOS = [l + n for l in ("Left", "Right") for n in ("Arm", "ForeArm", "Hand")]
total = 0
for act in sorted([x for x in bpy.data.actions if x.name.startswith("resident.") and (not SO or x.name in SO)],
                  key=lambda x: x.name):
    arm.animation_data.action = act
    if act.slots:
        arm.animation_data.action_slot = act.slots[0]
    f0, f1 = (int(x) for x in act.frame_range)
    quadros = list(range(f0, f1 + 1))
    pior = 0.0
    for f in quadros[::3]:
        scn.frame_set(f)
        m = mede(malha())
        pior = max([pior] + [float(np.linalg.norm(v)) - FOLGA for v, _ in m.values()])
    if pior < 0.01:
        continue
    chaveado, mexidos = False, set()
    for passada in range(3):
        D = {l: np.zeros((len(quadros), 3)) for l in ("Left", "Right")}
        T = {l: np.zeros(len(quadros)) for l in ("Left", "Right")}
        for i, f in enumerate(quadros):
            scn.frame_set(f)
            for l, (v, t) in mede(malha()).items():
                D[l][i], T[l][i] = v, t
        if max(np.linalg.norm(D[l], axis=1).max() for l in D) < 0.006:
            break
        if not chaveado:
            for f in quadros:
                scn.frame_set(f)
                for nb in OSSOS:
                    arm.pose.bones[nb].keyframe_insert("rotation_quaternion", frame=f, group=nb)
            chaveado = True
        for l in D:
            D[l] = suaviza(D[l])
            T[l] = np.convolve(np.pad(T[l], 4, mode="edge"), np.ones(9) / 9, mode="valid")
        for i, f in enumerate(quadros):
            scn.frame_set(f)
            mexeu = False
            for l in ("Left", "Right"):
                v = Vector(D[l][i])
                if v.length < 1e-4:
                    continue
                t = float(T[l][i])
                E = mw @ arm.pose.bones[l + "ForeArm"].head
                W = mw @ arm.pose.bones[l + "Hand"].head
                ik(l, W + v * (0.2 + 0.8 * t), E + v * (1.0 - 0.6 * t) * 1.5)
                mexeu = True
            if mexeu:
                mexidos.add(f)
                for nb in OSSOS:
                    arm.pose.bones[nb].keyframe_insert("rotation_quaternion", frame=f, group=nb)
    if mexidos:
        rel.setdefault(act.name, {})["antebraco"] = {"quadros": len(mexidos), "entrava_cm": round(pior * 100, 1)}
        total += 1
        print("antebraco", CORPO, act.name, len(mexidos), f"{pior * 100:.1f} cm", flush=True)
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
