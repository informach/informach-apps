"""Contato das mãos com o próprio corpo, quadro a quadro, medido na malha de cada tipo de corpo.

Corpos mais largos ou mais finos que o original da animação fazem a mão entrar no joelho, na barriga ou na coxa, ou
ficar flutuando onde deveria estar apoiada. Para cada quadro:
  - mão dentro do corpo: sai até a superfície;
  - nas animações de descanso (deitar, dormir, sentar), mão a poucos centímetros do corpo por um tempo: encosta;
o deslocamento é suavizado no tempo e aplicado com IK de dois ossos (braço e antebraço), mantendo a direção do
cotovelo e o ângulo do pulso.
"""
import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

LADOS = ("Left", "Right")


def _peso(o, nomes):
    idx = {o.vertex_groups[n].index for n in nomes if n in o.vertex_groups}
    return np.array([sum(g.weight for g in v.groups if g.group in idx) for v in o.data.vertices])


def _suave(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


def _gira_osso(arm, pb, q_mundo):
    R = arm.matrix_world.to_quaternion()
    q = R.inverted() @ q_mundo @ R
    h = pb.head.copy()
    pb.matrix = Matrix.Translation(h) @ q.to_matrix().to_4x4() @ Matrix.Translation(-h) @ pb.matrix


def _ik(arm, lado, delta):
    """Move o pulso por delta (mundo) girando braço e antebraço; a mão acompanha o antebraço (não torce no pulso)."""
    mw = arm.matrix_world
    pa, pf, ph = (arm.pose.bones[lado + n] for n in ("Arm", "ForeArm", "Hand"))
    S, E, W = mw @ pa.head, mw @ pf.head, mw @ ph.head
    rot_mao = (mw @ ph.matrix).to_quaternion()
    T = W + delta
    a, b = (E - S).length, (W - E).length
    L = min(max((T - S).length, abs(a - b) + 1e-4), a + b - 1e-4)
    d = (T - S).normalized()
    polo = (E - S) - d * (E - S).dot(d)
    if polo.length < 1e-6:
        return
    polo.normalize()
    cos_a = (a * a + L * L - b * b) / (2 * a * L)
    sin_a = max(0.0, 1 - cos_a * cos_a) ** 0.5
    E2 = S + d * (a * cos_a) + polo * (a * sin_a)
    _gira_osso(arm, pa, (E - S).rotation_difference(E2 - S))
    bpy.context.view_layer.update()
    E1, W1 = mw @ pf.head, mw @ ph.head
    _gira_osso(arm, pf, (W1 - E1).rotation_difference(S + d * L - E1))
    bpy.context.view_layer.update()


def corrigir(arm, corpo, acoes, k, descanso=(), apoio=None, min_seguidos=12, juntas=()):
    """apoio: {id da animação: "cama" | "chao"} — superfície onde a mão também pode se apoiar.
    juntas: animações em que as duas mãos seguram o mesmo objeto (livro, tablet, caixa): as duas andam juntas, para
    fora do corpo, o quanto a que mais entrou precisa (empurrar cada uma pela palma afastaria as mãos do objeto)."""
    apoio = apoio or {}
    """Devolve {acao: quadros corrigidos}. k = altura do corpo / 1,75."""
    scn = bpy.context.scene
    kk = max(k, 0.5)
    m_pen, m_cont, m_enc = 0.011 * kk, 0.016 * kk, 0.07 * kk  # entrou / encostada / perto o bastante para encostar
    polys = np.array([p.vertices[:] for p in corpo.data.polygons if len(p.vertices) == 3] or [[0, 0, 0]])
    tris = []
    for p in corpo.data.polygons:
        v = p.vertices
        for i in range(1, len(v) - 1):
            tris.append((v[0], v[i], v[i + 1]))
    tris = np.array(tris)
    mascara = {}
    # a malha dos dois braços não conta como "corpo" (a outra mão encostando, como no aplauso, não é penetração)
    ossos = [b.name for b in arm.data.bones if any(t in b.name for t in ("Shoulder", "Arm", "Hand"))]
    w = _peso(corpo, ossos)
    for lado in LADOS:
        mascara[lado] = tris[(w[tris] < 0.3).all(1)]
    # só o corpo deforma enquanto mede (mais rápido)
    tronco = _peso(corpo, ["Hips", "Spine", "Spine1"]) > 0.45  # o colchão fica embaixo do tronco
    outros = [m for o in bpy.data.objects if o.type == "MESH" and o.parent is arm and o is not corpo for m in o.modifiers]
    for m in outros:
        m.show_viewport = False
    dg = bpy.context.evaluated_depsgraph_get
    # normal da palma, no espaço do osso da mão: perpendicular ao osso, do lado oposto às costas da mão.
    # No repouso (braços para baixo) a palma olha para a coxa, isto é, para dentro do corpo (x em direção a 0).
    arm.animation_data.action = None
    for pb in arm.pose.bones:
        pb.matrix_basis.identity()
    bpy.context.view_layer.update()
    palma_local = {}
    for lado in LADOS:
        b = arm.data.bones[lado + "Hand"]
        M = (arm.matrix_world @ b.matrix_local).to_3x3()
        eixo = M.col[1].normalized()
        dentro = Vector((-1 if (arm.matrix_world @ b.head_local).x > 0 else 1, 0, 0))
        n = (dentro - eixo * dentro.dot(eixo)).normalized()
        palma_local[lado] = M.inverted() @ n
    res = {}
    for a in acoes:
        arm.animation_data.action = a
        if a.slots:
            arm.animation_data.action_slot = a.slots[0]
        f0, f1 = (int(x) for x in a.frame_range)
        n = f1 - f0 + 1
        D = {lado: np.zeros((n, 3)) for lado in LADOS}
        tipo = {lado: np.zeros(n, int) for lado in LADOS}  # 1 entrou, 2 perto (candidato a encostar)
        nome_id = a.name.split("_", 1)[1] if "_" in a.name else a.name
        encosta = any(a.name.endswith("_" + d) for d in descanso)
        sup = next((v for k_, v in apoio.items() if a.name.endswith("_" + k_)), None)
        unidas = a.name in juntas
        for i, f in enumerate(range(f0, f1 + 1)):
            scn.frame_set(f)
            ev = corpo.evaluated_get(dg())
            me = ev.to_mesh()
            P = np.array([ev.matrix_world @ v.co for v in me.vertices])
            ev.to_mesh_clear()
            z_apoio = None if sup is None else (0.0 if sup == "chao" else float(P[tronco, 2].min()))
            mw = arm.matrix_world
            for lado in LADOS:
                bvh = BVHTree.FromPolygons([tuple(p) for p in P], [tuple(t) for t in mascara[lado]])
                ph = arm.pose.bones[lado + "Hand"]
                pts = [(mw @ ph.head + mw @ ph.tail) / 2, mw @ ph.tail, mw @ arm.pose.bones[lado + "HandMiddle2"].tail]
                sds, fora = [], Vector()
                for q in pts:
                    loc, nrm, _, dist = bvh.find_nearest(q)
                    if loc is not None:
                        sds.append(dist if (q - loc).dot(nrm) >= 0 else -dist)
                        if sds[-1] < m_cont:
                            fora += nrm * (m_cont - sds[-1])
                    if z_apoio is not None:  # colchão ou chão: plano horizontal
                        sds.append(q.z - z_apoio)
                if not sds:
                    continue
                palma = ((mw @ ph.matrix).to_3x3() @ palma_local[lado]).normalized()
                # Tudo contínuo (sem liga/desliga): empurra o quanto a mão entrou; nas animações de descanso, puxa o
                # quanto ela está afastada, com peso que some aos poucos com a distância.
                empurra = max(max(0.0, m_cont - s) for s in sds)
                puxa = 0.0
                if encosta:
                    s = min(sds)
                    if s > m_cont:
                        w = 1.0 - _suave((s - 0.5 * m_enc) / (0.5 * m_enc))  # 1 até a metade, 0 em m_enc
                        puxa = (s - m_cont) * w
                if unidas:  # para fora da pele (normal), não pela palma
                    D[lado][i] = np.array(fora.normalized()) * empurra if fora.length > 1e-9 else 0.0
                else:
                    D[lado][i] = np.array(palma) * (puxa - empurra)
            if unidas:  # as duas mãos com o mesmo deslocamento: o da que mais entrou
                maior = max(LADOS, key=lambda l_: float(np.linalg.norm(D[l_][i])))
                for lado in LADOS:
                    D[lado][i] = D[maior][i]
        total = 0
        sigma = 3.0  # quadros
        xs = np.arange(-9, 10)
        ker = np.exp(-0.5 * (xs / sigma) ** 2)
        ker /= ker.sum()
        for lado in LADOS:
            pad = np.pad(D[lado], ((9, 9), (0, 0)), mode="edge")
            D[lado] = np.stack([np.convolve(pad[:, c], ker, mode="valid") for c in range(3)], 1)
        if max(np.abs(D[lado]).max() for lado in LADOS) < 0.002 * kk:
            continue
        # grava o braço em todos os quadros antes de mexer: uma correção não vaza para os quadros vizinhos
        ossos = [lado + nb for lado in LADOS for nb in ("Arm", "ForeArm", "Hand")]
        for f in range(f0, f1 + 1):
            scn.frame_set(f)
            for nb in ossos:
                arm.pose.bones[nb].keyframe_insert("rotation_quaternion", frame=f)
        for i, f in enumerate(range(f0, f1 + 1)):
            scn.frame_set(f)
            mexeu = False
            for lado in LADOS:
                d = D[lado][i]
                if np.linalg.norm(d) < 1e-5:
                    continue
                _ik(arm, lado, Vector(d))
                for nb in ("Arm", "ForeArm", "Hand"):
                    arm.pose.bones[lado + nb].keyframe_insert("rotation_quaternion", frame=f)
                mexeu = True
            total += mexeu
        if total:
            res[nome_id] = total
    for m in outros:
        m.show_viewport = True
    return res
