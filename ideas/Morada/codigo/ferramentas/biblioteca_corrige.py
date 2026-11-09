"""Correções por corpo nas ações convertidas do Mixamo.

1. Telefone (todos os corpos): a mão levantada não encosta na cabeça (gira o braço no ombro).
2. Mão dentro do corpo (plus_m, plus_f, musculoso): a mão sai pela normal da superfície até ficar do lado de fora,
   com IK de braço e antebraço; o deslocamento é suavizado no tempo.
3. Engatinhar (pequeno_m, bebe_m): a cabeça grande não encosta no chão (tronco e pescoço sobem o necessário).
4. Mede a altura do assento e do colchão que cada animação de sentar/deitar espera (para a cena e para o jogo).

Uso: python biblioteca_corrige.py -- <bruto/corpo.blend> <corpo> <saida.blend> <saida_medidas.json>
"""
import bpy, json, math, os, sys
import numpy as np
from mathutils import Matrix, Vector, Quaternion
from mathutils.bvhtree import BVHTree

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "morada-art"))
import contato  # noqa: E402  (_ik)

a = sys.argv[sys.argv.index("--") + 1:]
BLEND, CORPO, SAIDA, MEDIDAS = a[:4]
bpy.ops.wm.open_mainfile(filepath=BLEND)
scn = bpy.context.scene
arm = bpy.data.objects[CORPO]
corpo = bpy.data.objects[CORPO + "_corpo"]
outros = [m for o in bpy.data.objects if o.type == "MESH" and o.parent is arm and o is not corpo for m in o.modifiers]
for m in outros:
    m.show_viewport = False
acoes = sorted([x for x in bpy.data.actions if x.name.startswith("resident.")], key=lambda x: x.name)


def usar(act):
    arm.animation_data.action = act
    if act.slots:
        arm.animation_data.action_slot = act.slots[0]


def peso(nomes):
    idx = {corpo.vertex_groups[n].index for n in nomes if n in corpo.vertex_groups}
    return np.array([sum(g.weight for g in v.groups if g.group in idx) for v in corpo.data.vertices])


def malha():
    ev = corpo.evaluated_get(bpy.context.evaluated_depsgraph_get())
    me = ev.to_mesh()
    P = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get("co", P)
    ev.to_mesh_clear()
    P = P.reshape(-1, 3)
    M = np.array(corpo.matrix_world)
    return P @ M[:3, :3].T + M[:3, 3]


def gira_mundo(pb, q_mundo, pivo_mundo):
    R = arm.matrix_world.to_quaternion()
    q = R.inverted() @ q_mundo @ R
    h = arm.matrix_world.inverted() @ pivo_mundo
    pb.matrix = Matrix.Translation(h) @ q.to_matrix().to_4x4() @ Matrix.Translation(-h) @ pb.matrix


def chaves_todas(act, ossos):
    f0, f1 = (int(x) for x in act.frame_range)
    for f in range(f0, f1 + 1):
        scn.frame_set(f)
        for nb in ossos:
            arm.pose.bones[nb].keyframe_insert("rotation_quaternion", frame=f, group=nb)


def suaviza(X, sigma=2.5):
    xs = np.arange(-8, 9)
    ker = np.exp(-0.5 * (xs / sigma) ** 2)
    ker /= ker.sum()
    pad = np.pad(X, ((8, 8),) + ((0, 0),) * (X.ndim - 1), mode="edge")
    if X.ndim == 1:
        return np.convolve(pad, ker, mode="valid")
    return np.stack([np.convolve(pad[:, c], ker, mode="valid") for c in range(X.shape[1])], 1)


arm.animation_data.action = None
for pb in arm.pose.bones:
    pb.matrix_basis.identity()
bpy.context.view_layer.update()
P0 = malha()
altura = float(P0[:, 2].max() - P0[:, 2].min())
k = altura / 1.75
rel = {}

# ---------------------------------------------------------------- 1. telefone
w_cab = peso(["Head"])
cab = P0[w_cab > 0.6]
c0 = cab.mean(0)
raio = float(np.percentile(np.linalg.norm(cab - c0, axis=1), 80))
hb = arm.data.bones["Head"]
c_local = (arm.matrix_world @ hb.matrix_local).inverted() @ Vector(c0)
folga = 0.035 * max(k, 0.55)
for act in [x for x in acoes if x.name.startswith("resident.phone.")]:
    usar(act)
    chaves_todas(act, ["LeftArm", "RightArm"])
    f0, f1 = (int(x) for x in act.frame_range)
    n = 0
    for f in range(f0, f1 + 1):
        scn.frame_set(f)
        for lado in ("Left", "Right"):
            C = arm.matrix_world @ arm.pose.bones["Head"].matrix @ c_local
            pts = [arm.matrix_world @ q for q in (arm.pose.bones[lado + "Hand"].head, arm.pose.bones[lado + "Hand"].tail,
                                                   arm.pose.bones[lado + "HandMiddle2"].tail, arm.pose.bones[lado + "HandIndex2"].tail)]
            pior = max(pts, key=lambda q: (raio + folga) - (q - C).length)
            fundo = (raio + folga) - (pior - C).length
            if fundo <= 0:
                continue
            pb = arm.pose.bones[lado + "Arm"]
            S = arm.matrix_world @ pb.head
            alvo = C + (pior - C).normalized() * (raio + folga)
            gira_mundo(pb, (pior - S).normalized().rotation_difference((alvo - S).normalized()), S)
            bpy.context.view_layer.update()
            pb.keyframe_insert("rotation_quaternion", frame=f, group=pb.name)
            n += 1
    rel[act.name] = {"telefone": n}

# ---------------------------------------------------------------- 2. mão dentro do corpo
if CORPO in ("plus_m", "plus_f", "musculoso"):
    tris = []
    for p in corpo.data.polygons:
        v = p.vertices
        for i in range(1, len(v) - 1):
            tris.append((v[0], v[i], v[i + 1]))
    tris = np.array(tris)
    mascara = {}
    for lado in ("Left", "Right"):
        ossos = [b.name for b in arm.data.bones if b.name.startswith(lado) and any(t in b.name for t in ("Shoulder", "Arm", "Hand"))]
        w = peso(ossos)
        mascara[lado] = [tuple(t) for t in tris[(w[tris] < 0.3).all(1)]]
    margem = 0.008 * max(k, 0.6)
    for act in acoes:
        usar(act)
        f0, f1 = (int(x) for x in act.frame_range)
        n = f1 - f0 + 1
        D = {lado: np.zeros((n, 3)) for lado in ("Left", "Right")}
        for i, f in enumerate(range(f0, f1 + 1)):
            scn.frame_set(f)
            P = malha()
            mw = arm.matrix_world
            for lado in ("Left", "Right"):
                bvh = BVHTree.FromPolygons([tuple(p) for p in P], mascara[lado])
                ph = arm.pose.bones[lado + "Hand"]
                pts = [mw @ ph.head, (mw @ ph.head + mw @ ph.tail) / 2, mw @ ph.tail,
                       mw @ arm.pose.bones[lado + "HandMiddle2"].tail, mw @ arm.pose.bones[lado + "HandIndex2"].tail]
                melhor = None
                for q in pts:
                    loc, nrm, _, dist = bvh.find_nearest(q)
                    if loc is None:
                        continue
                    s = dist if (q - loc).dot(nrm) >= 0 else -dist
                    if s < margem and (melhor is None or s < melhor[0]):
                        melhor = (s, nrm)
                if melhor:
                    D[lado][i] = np.array(melhor[1]) * (margem - melhor[0])
        if max(np.abs(D[l]).max() for l in D) < 0.004 * k:
            continue
        for lado in D:
            D[lado] = suaviza(D[lado])
        ossos = [lado + nb for lado in ("Left", "Right") for nb in ("Arm", "ForeArm", "Hand")]
        chaves_todas(act, ossos)
        quadros = 0
        for i, f in enumerate(range(f0, f1 + 1)):
            scn.frame_set(f)
            mexeu = False
            for lado in D:
                d = D[lado][i]
                if np.linalg.norm(d) < 1e-4:
                    continue
                contato._ik(arm, lado, Vector(d))
                for nb in ("Arm", "ForeArm", "Hand"):
                    arm.pose.bones[lado + nb].keyframe_insert("rotation_quaternion", frame=f, group=lado + nb)
                mexeu = True
            quadros += mexeu
        if quadros:
            rel.setdefault(act.name, {})["mao_no_corpo"] = quadros

# ---------------------------------------------------------------- 3. engatinhar sem a cabeça no chão
if CORPO in ("pequeno_m", "bebe_m"):
    w_c = peso(["Head", "Neck"]) > 0.5
    folga_chao = 0.02 * max(k, 0.4)
    for act in [x for x in acoes if x.name.startswith("resident.baby.crawl")]:
        usar(act)
        f0, f1 = (int(x) for x in act.frame_range)
        ang = []
        for f in range(f0, f1 + 1):
            scn.frame_set(f)
            P = malha()
            zmin = float(P[w_c, 2].min())
            ang.append(0.0)
            if zmin >= folga_chao:
                continue
            # eixo lateral do quadril e pivô no pescoço: o ângulo é o que levanta o ponto mais baixo da cabeça
            mw = arm.matrix_world
            eixo = (mw.to_3x3() @ arm.pose.bones["Hips"].matrix.to_3x3()).col[0].normalized()
            piv = mw @ arm.pose.bones["Spine1"].head
            low = Vector(P[w_c][np.argmin(P[w_c, 2])])
            r = low - piv
            r_perp = r - eixo * r.dot(eixo)
            best = 0.0
            for s in (1, -1):
                q = Quaternion(eixo, s * 0.1)
                if (q @ r_perp).z > r_perp.z:
                    best = s
            h = folga_chao - zmin
            horiz = max(math.hypot(r_perp.x, r_perp.y), 0.03)
            ang[-1] = best * min(math.atan2(h, horiz) * 1.15, math.radians(70))
        # além de não encostar, o rosto precisa olhar para a frente: no mínimo 45° de pescoço e cabeça para cima
        sinal = 1.0
        if any(abs(x) > 0 for x in ang):
            sinal = math.copysign(1.0, sum(ang))
        else:
            mw = arm.matrix_world
            eixo = (mw.to_3x3() @ arm.pose.bones["Hips"].matrix.to_3x3()).col[0].normalized()
            r = Vector(P[w_c].mean(0)) - (mw @ arm.pose.bones["Spine1"].head)
            sinal = 1.0 if (Quaternion(eixo, 0.1) @ r).z > r.z else -1.0
        ang = [sinal * max(abs(x), math.radians(45)) for x in ang]
        ang = suaviza(np.array(ang), 3.0)
        if np.abs(ang).max() < math.radians(1):
            continue
        chaves_todas(act, ["Spine1", "Neck", "Head"])
        for i, f in enumerate(range(f0, f1 + 1)):
            if abs(ang[i]) < 1e-3:
                continue
            scn.frame_set(f)
            mw = arm.matrix_world
            eixo = (mw.to_3x3() @ arm.pose.bones["Hips"].matrix.to_3x3()).col[0].normalized()
            for nb, parte in (("Spine1", 0.25), ("Neck", 0.4), ("Head", 0.35)):
                pb = arm.pose.bones[nb]
                gira_mundo(pb, Quaternion(eixo, ang[i] * parte), mw @ pb.head)
                bpy.context.view_layer.update()
                pb.keyframe_insert("rotation_quaternion", frame=f, group=nb)
        rel.setdefault(act.name, {})["cabeca_chao_graus"] = round(math.degrees(float(np.abs(ang).max())), 1)

# ---------------------------------------------------------------- 4. assento e colchão esperados
quadril = peso(["Hips"]) > 0.45
tronco = peso(["Hips", "Spine", "Spine1"]) > 0.45
medidas = {}
for act in acoes:
    nome = act.name
    tipo = None
    if (any(t in nome for t in (".sit.", ".desk.", "sit_")) or nome.endswith((".sit", "_sit"))) and "enter" not in nome \
            and "exit" not in nome:
        tipo, quando = "assento", "meio"
    elif nome in ("resident.sit.chair.enter",):
        tipo, quando = "assento", "fim"
    elif nome in ("resident.sit.chair.exit",):
        tipo, quando = "assento", "inicio"
    elif nome in ("resident.lie.idle", "resident.sleep.idle"):
        tipo, quando = "cama", "meio"
    elif nome == "resident.lie.enter":
        tipo, quando = "cama", "fim"
    elif nome == "resident.sleep.exit":  # é o deitar ao contrário: a cama está embaixo no começo
        tipo, quando = "cama", "inicio"
    if not tipo:
        continue
    usar(act)
    f0, f1 = (int(x) for x in act.frame_range)
    scn.frame_set({"meio": (f0 + f1) // 2, "fim": f1, "inicio": f0}[quando])
    P = malha()
    sel = quadril if tipo == "assento" else tronco
    medidas[nome] = {"tipo": tipo, "altura": round(float(P[sel, 2].min()), 3),
                     "x": round(float(P[sel, 0].mean()), 3), "y": round(float(P[sel, 1].mean()), 3)}

for m in outros:
    m.show_viewport = True
arm.animation_data.action = None
for pb in arm.pose.bones:
    pb.matrix_basis.identity()
os.makedirs(os.path.dirname(SAIDA), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=SAIDA, compress=True)
json.dump({"corpo": CORPO, "altura": round(altura, 3), "correcoes": rel, "apoios": medidas},
          open(MEDIDAS, "w"), ensure_ascii=False, indent=1)
print("fim", CORPO, "corrigidas", len(rel), "apoios", len(medidas))
