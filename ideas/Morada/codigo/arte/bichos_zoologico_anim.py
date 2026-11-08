"""Animações dos bichos do zoológico: cópia das animações do pacote (24 qps, deslocamento na escala do bicho) e
animações compostas por poses-chave (giros de ossos em eixos do mundo, sobre a pose neutra do pacote), com o bicho
assentado no chão em cada chave. Também confere (menor altura por quadro, pés parados) e desenha esboços rápidos.
"""
import copy
import math

import bpy
import numpy as np
from PIL import Image, ImageDraw

import bichos as B
from bichos_zoologico_base import AX, FPS, FPS_PACOTE, quat_mat, mat_quat, rot_eixo

ESPELHA = {"x": 1, "y": -1, "z": -1}


# ---------------------------------------------------------------- poses
def _lista(v):
    if v is None:
        return []
    if isinstance(v, tuple) and len(v) == 2 and isinstance(v[0], str):
        return [v]
    return list(v)


def pose_de(bi, spec):
    """spec: papel ou osso → giros [(eixo, graus)]; 'raiz': deslocamento (mundo); 'giro': guinada (graus);
    'tras'/'frente' (os dois lados, o direito espelhado) ou 'tras.L'...: um giro por segmento [coxa, canela, pé, dedo];
    papel com '*': um giro por osso da cadeia; sem '*': o giro se divide por igual entre os ossos da cadeia."""
    rot, loc = bi.neutro()
    esq = bi.esq
    ir = bi.idx[esq["raiz"]]

    def gira(osso, eixo, g):
        i = bi.idx[osso]
        a = AX[eixo] if isinstance(eixo, str) else np.asarray(eixo, float)
        rot[i] = rot_eixo(bi.R2[i].T @ a, g) @ rot[i]

    for alvo, val in spec.items():
        if alvo.endswith("_abs") or alvo.startswith("_"):
            continue
        if alvo == "raiz":
            loc[ir] = loc[ir] + bi.R2[ir].T @ np.asarray(val, float)
            continue
        if alvo == "giro":
            gira(esq["raiz"], "z", val)
            continue
        if alvo == "quadril_loc":
            ih = bi.idx[esq["quadril"]]
            loc[ih] = loc[ih] + bi.R2[ih].T @ np.asarray(val, float)
            continue
        base_alvo, _, lado = alvo.rpartition(".") if alvo.endswith((".L", ".R")) else (alvo, "", "")
        cada = base_alvo.endswith("*")
        base_alvo = base_alvo.rstrip("*")
        if base_alvo in ("tras", "frente"):
            lados = [lado] if lado else ["L", "R"]
            for s in lados:
                esp = 1 if (lado or s == "L") else None
                for k, seg in enumerate(val):
                    if k >= len(esq[base_alvo][s]):
                        break
                    for eixo, g in _lista(seg):
                        gira(esq[base_alvo][s][k], eixo, g if esp else g * ESPELHA[eixo])
            continue
        if base_alvo in ("ombros", "pelves", "orelhas"):
            ossos = esq[base_alvo] if isinstance(esq[base_alvo], dict) else dict(zip("LR", esq[base_alvo]))
            for s, osso in ossos.items():
                if lado and s != lado:
                    continue
                for eixo, g in _lista(val):
                    gira(osso, eixo, g if (lado or s == "L") else g * ESPELHA[eixo])
            continue
        if base_alvo in ("tronco", "pescoco", "cauda") or base_alvo in bi.papeis:
            cad = bi.papeis.get(base_alvo) or esq[base_alvo]
        elif base_alvo == "cabeca":
            cad = [esq["cabeca"]]
        elif base_alvo == "mandibula":
            if not esq["mandibula"]:
                continue
            cad = [esq["mandibula"]]
        elif base_alvo == "quadril":
            cad = [esq["quadril"]]
        else:
            cad = [base_alvo]
        if cada:
            for osso, giros in zip(cad, val):
                for eixo, g in _lista(giros):
                    gira(osso, eixo, g)
        else:
            for eixo, g in _lista(val):
                for osso in cad:
                    gira(osso, eixo, g / len(cad))
    return rot, loc


def _giro_mundo(bi, rot, loc, osso, Rw):
    """Gira o osso por Rw (no mundo, em volta da própria cabeça), na pose atual."""
    Mp, _ = bi.fk(rot, loc)
    i = bi.idx[osso]
    p = bi.pai[i]
    Mr = bi.matriz_descanso()
    P = (Mp[p] @ np.linalg.inv(Mr[p]) @ Mr[i])[:3, :3] if p >= 0 else Mr[i][:3, :3]
    rot[i] = P.T @ Rw @ P @ rot[i]


def _gira_vetor(a, b):
    a = a / np.linalg.norm(a)
    b = b / np.linalg.norm(b)
    c = np.cross(a, b)
    s = np.linalg.norm(c)
    if s < 1e-9:
        return np.eye(3)
    return rot_eixo(c, math.degrees(math.atan2(s, float(a @ b))))


def pernas_abs(bi, rot, loc, papel, lados, angulos):
    """Cada segmento da perna aponta num ângulo do mundo (no plano do bicho): 0 = para baixo, +90 = para trás,
    -90 = para a frente. None mantém o segmento como está."""
    for s in lados:
        cad = bi.esq[papel][s]
        for k, ang in enumerate(angulos):
            if ang is None or k >= len(cad):
                continue
            Mp, _ = bi.fk(rot, loc)
            ir = bi.idx[bi.esq["raiz"]]
            Rr = Mp[ir][:3, :3] @ bi.R2[ir].T  # o giro da raiz (guinada)
            lat = Rr @ AX["x"]
            i = bi.idx[cad[k]]
            d = Mp[i][:3, :3] @ np.array([0, 1.0, 0])
            dl = Rr.T @ d
            atual = math.degrees(math.atan2(dl[1], -dl[2]))
            _giro_mundo(bi, rot, loc, cad[k], rot_eixo(lat, ang - atual))


def ik_pes(bi, rot, loc, ref, pernas):
    """Duas juntas (coxa e canela) giram para a cabeça do pé voltar ao lugar de ref (pose do mundo), com o mesmo lado
    de dobra; o pé volta ao giro que tinha em ref."""
    Mref, _ = bi.fk(*ref)
    for papel, s in pernas:
        cad = bi.esq[papel][s]
        a, b, c = (bi.idx[x] for x in cad[:3])
        T = Mref[c][:3, 3]
        for _ in range(2):
            Mp, _ = bi.fk(rot, loc)
            A, Kn, C = Mp[a][:3, 3], Mp[b][:3, 3], Mp[c][:3, 3]
            l1, l2 = np.linalg.norm(Kn - A), np.linalg.norm(C - Kn)
            d = np.clip(np.linalg.norm(T - A), abs(l1 - l2) + 1e-4, l1 + l2 - 1e-4)
            u = (T - A) / np.linalg.norm(T - A)
            uc = (C - A) / np.linalg.norm(C - A)
            joelho = (Kn - A) - uc * ((Kn - A) @ uc)
            n = np.cross(Kn - A, C - Kn)
            if np.linalg.norm(n) < 1e-9:
                n = Mp[a][:3, :3] @ np.array([1.0, 0, 0])
            n /= np.linalg.norm(n)
            w = np.cross(n, u)
            sg = 1.0 if joelho @ w >= 0 else -1.0
            ca = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)
            sa = math.sqrt(max(0.0, 1 - ca * ca))
            K2 = A + l1 * (u * ca + w * sa * sg)
            _giro_mundo(bi, rot, loc, cad[0], _gira_vetor(Kn - A, K2 - A))
            Mp, _ = bi.fk(rot, loc)
            Kn, C = Mp[b][:3, 3], Mp[c][:3, 3]
            _giro_mundo(bi, rot, loc, cad[1], _gira_vetor(C - Kn, T - Kn))
        Mp, _ = bi.fk(rot, loc)
        _giro_mundo(bi, rot, loc, cad[2], Mref[c][:3, :3] @ Mp[c][:3, :3].T)


def mascara_focinho(bi):
    """A ponta do focinho: os pontos da cabeça mais à frente na direção do osso da cabeça (sem chifres)."""
    if getattr(bi, "_focinho", None) is not None and len(bi._focinho) == len(bi.V):
        return bi._focinho
    ih = bi.idx[bi.esq["cabeca"]]
    ids = [ih] + ([bi.idx[bi.esq["mandibula"]]] if bi.esq["mandibula"] else [])
    m = bi.W[:, ids].sum(1) > 0.5
    nb = len(bi.base.V)
    sem = np.zeros(len(bi.V), bool)
    if "chifre" in set(bi.base.Fcls):
        for i, f in enumerate(bi.base.F):
            if bi.base.Fcls[i] == "chifre":
                sem[f] = True
    m &= ~sem
    d = bi.R2[ih][:, 1].copy()
    d[0] = 0
    d[2] = min(d[2], 0)
    d /= np.linalg.norm(d)
    pr = (bi.V - bi.H2[ih]) @ d
    m &= pr > np.percentile(pr[m], 70)
    bi._focinho = m
    return m


def mascara_ossos(bi, ossos):
    if ossos == "focinho":
        return mascara_focinho(bi)
    ids = [bi.idx[o] for o in ossos if o in bi.idx]
    return bi.W[:, ids].sum(1) > 0.5


def assenta(bi, rot, loc, chao=0.0, ref=None, seguro=True):
    """Sobe ou desce a raiz para o ponto mais baixo (de ref, ou de tudo) ficar na altura chao; nada fica abaixo do chão."""
    if chao is None:
        return rot, loc
    _, K = bi.fk(rot, loc)
    P = bi.pele(K)
    zmin = P[ref, 2].min() if ref is not None else P[:, 2].min()
    sobe = max(chao - zmin, -P[:, 2].min()) if seguro else chao - zmin
    ir = bi.idx[bi.esq["raiz"]]
    loc = loc.copy()
    loc[ir] = loc[ir] + bi.R2[ir].T @ np.array([0, 0, sobe])
    return rot, loc


def resolve_chave(bi, spec, opts):
    """Uma chave: pose, alvo (um papel gira até uma parte encostar numa altura) e assentamento."""
    opts = opts or {}
    ref = None
    if opts.get("ref") == "patas":
        ref = mascara_ossos(bi, bi.base.g["patas"] + bi.base.g["pes"] + bi.base.g["maos"])
    elif opts.get("ref"):
        ref = mascara_ossos(bi, opts["ref"])
    if opts.get("pes_fixos") and ref is None:
        ref = mascara_ossos(bi, bi.base.g["patas"] + bi.base.g["pes"] + bi.base.g["maos"])
    alvo = opts.get("alvo")

    def monta_pose(s2):
        rot, loc = pose_de(bi, s2)
        for chave, val in s2.items():
            if chave.endswith("_abs"):
                papel, _, lado = chave[:-4].partition(".")
                pernas_abs(bi, rot, loc, papel, [lado] if lado else ["L", "R"], val)
        pf = opts.get("pes_fixos")
        if pf:
            pernas = [(p_, s_) for p_ in (("tras", "frente") if pf is True else pf) for s_ in "LR"]
            r0, l0 = bi.neutro()
            if "giro" in s2:
                r0, l0 = pose_de(bi, {"giro": s2["giro"]})
            ik_pes(bi, rot, loc, (r0, l0), pernas)
        return rot, loc

    if alvo:
        m = mascara_ossos(bi, alvo["ossos"])

        def f(g):
            s2 = copy.deepcopy(spec)
            s2[alvo["papel"]] = _lista(s2.get(alvo["papel"])) + [(alvo["eixo"], g)]
            rot, loc = assenta(bi, *monta_pose(s2), chao=opts.get("chao", 0.0), ref=ref, seguro=False)
            _, K = bi.fk(rot, loc)
            return bi.pele(K)[m, 2].min() - alvo["z"], (rot, loc)

        # varre do começo ao fim e pega a primeira vez que a parte chega na altura (a curva não é monotônica:
        # passando do ponto, a cabeça volta para baixo do peito e sobe)
        gs = np.linspace(alvo["de"], alvo["ate"], 13)
        fs = [f(g) for g in gs]
        lo = hi = None
        for k in range(len(gs) - 1):
            if (fs[k][0] > 0) != (fs[k + 1][0] > 0):
                lo, hi, flo = gs[k], gs[k + 1], fs[k][0]
                break
        if lo is None:
            return assenta(bi, *min(fs, key=lambda x: abs(x[0]))[1], chao=opts.get("chao", 0.0), ref=ref)
        r = fs[k][1]
        for _ in range(16):
            mid = (lo + hi) / 2
            fm, r = f(mid)
            if (fm > 0) == (flo > 0):
                lo, flo = mid, fm
            else:
                hi = mid
        return assenta(bi, *r, chao=opts.get("chao", 0.0), ref=ref)
    return assenta(bi, *monta_pose(spec), chao=opts.get("chao", 0.0), ref=ref)


# ---------------------------------------------------------------- ações no Blender
def _pb_chave(arm, bi, rot, loc, quadro, qprev):
    for i, nome in enumerate(bi.nomes):
        pb = arm.pose.bones[nome]
        q = mat_quat(rot[i])
        if qprev.get(nome) is not None and np.dot(q, qprev[nome]) < 0:
            q = -q
        qprev[nome] = q
        pb.rotation_mode = "QUATERNION"
        pb.rotation_quaternion = tuple(q)
        pb.location = tuple(loc[i])
        pb.keyframe_insert("rotation_quaternion", frame=quadro)
        pb.keyframe_insert("location", frame=quadro)


def nova_trilha(arm, a, nome):
    ad = arm.animation_data or arm.animation_data_create()
    ad.action = None
    t = ad.nla_tracks.new()
    t.name = nome
    st = t.strips.new(a.name, int(a.frame_range[0]), a)
    if a.slots:
        st.action_slot = a.slots[0]
    t.mute = True
    return t


def acao_composta(bi, arm, id_bicho, anim):
    """anim: dict(id, chaves=[(segundos, spec, opts)], laco, linear=[ossos com interpolação linear])."""
    ad = arm.animation_data or arm.animation_data_create()
    a = bpy.data.actions.new(id_bicho + "|" + anim["id"])
    ad.action = a
    qprev = {}
    poses = []
    for t, spec, opts in anim["chaves"]:
        rot, loc = resolve_chave(bi, spec, opts)
        poses.append((t, rot, loc))
        _pb_chave(arm, bi, rot, loc, 1 + round(t * FPS), qprev)
    lin = set(anim.get("linear", []))
    for fc in B._fcurves(a):
        osso = fc.data_path.split('"')[1]
        if osso in lin:
            for kp in fc.keyframe_points:
                kp.interpolation = "LINEAR"
        elif anim.get("laco", True) and not anim.get("sem_ciclo"):
            fc.modifiers.new("CYCLES")
        if anim.get("laco", True):
            pass
    ad.action = None
    nova_trilha(arm, a, anim["id"])
    return a, poses


def acao_pacote(bi, arm, a0, id_bicho, id_anim, tempo=1.0, extra=None):
    """Cópia de uma animação do pacote: 30 → 24 qps (mesma duração, vezes 'tempo'), deslocamentos na escala do bicho,
    sem as curvas do próprio objeto. extra(osso, segundos) → (giro, deslocamento) para os ossos novos (tromba...)."""
    a = a0.copy()
    a.name = id_bicho + "|" + id_anim
    for lay in a.layers:
        for st in lay.strips:
            for cb in st.channelbags:
                for fc in [fc for fc in cb.fcurves if '"' not in fc.data_path]:
                    cb.fcurves.remove(fc)
    k_t = FPS / FPS_PACOTE * tempo
    ih = bi.idx[bi.esq["quadril"]]
    kq = bi.H2[ih, 2] / bi.base.H[ih, 2]
    for fc in B._fcurves(a):
        osso = fc.data_path.split('"')[1]
        for kp in fc.keyframe_points:
            for p in (kp.co, kp.handle_left, kp.handle_right):
                p[0] = 1 + (p[0] - 1) * k_t
        if fc.data_path.endswith("location"):
            i = bi.idx[osso]
            k = kq if i == ih else float(np.mean(bi.S[bi.pai[i]])) if bi.pai[i] >= 0 else 1.0
            for kp in fc.keyframe_points:
                for p in (kp.co, kp.handle_left, kp.handle_right):
                    p[1] *= k
    if extra:
        ad = arm.animation_data or arm.animation_data_create()
        ad.action = a
        if a.slots:
            ad.action_slot = a.slots[0]
        f0, f1 = a.frame_range
        qprev = {}
        for f in range(int(f0), int(f1) + 1, 2):
            for nome in extra["ossos"]:
                q, t = extra["fn"](nome, (f - f0) / FPS, (f1 - f0) / FPS)
                pb = arm.pose.bones[nome]
                q = np.asarray(q)
                if qprev.get(nome) is not None and np.dot(q, qprev[nome]) < 0:
                    q = -q
                qprev[nome] = q
                pb.rotation_quaternion = tuple(q)
                pb.location = tuple(t)
                pb.keyframe_insert("rotation_quaternion", frame=f)
                pb.keyframe_insert("location", frame=f)
        ad.action = None
    nova_trilha(arm, a, id_anim)
    return a


def desloca_raiz(bi, arm, a, dz):
    """Põe a animação (do pacote) no chão: a raiz sobe ou desce dz, constante."""
    ir = bi.idx[bi.esq["raiz"]]
    nome = bi.esq["raiz"]
    existe = [fc for fc in B._fcurves(a) if fc.data_path == f'pose.bones["{nome}"].location']
    if existe:
        d = bi.R2[ir].T @ np.array([0, 0, dz])
        for fc in existe:
            for kp in fc.keyframe_points:
                for p in (kp.co, kp.handle_left, kp.handle_right):
                    p[1] += d[fc.array_index]
        return
    ad = arm.animation_data or arm.animation_data_create()
    ad.action = a
    if a.slots:
        ad.action_slot = a.slots[0]
    pb = arm.pose.bones[nome]
    pb.location = tuple(bi.R2[ir].T @ np.array([0, 0, dz]))
    f0, f1 = a.frame_range
    for f in (f0, f1):
        pb.keyframe_insert("location", frame=f)
    ad.action = None


def corrige_chao(bi, arm, a, passo=2, voltas=3):
    """Animação composta: onde, entre as chaves, algo atravessaria o chão, entra uma chave na raiz um pouco mais alta."""
    nome = bi.esq["raiz"]
    ir = bi.idx[nome]
    f0, f1 = (int(x) for x in a.frame_range)
    pior = 0.0
    for _ in range(voltas):
        fixos = []
        for f in range(f0, f1 + 1, passo):
            rot, loc = amostra(bi, a, f)
            _, K = bi.fk(rot, loc)
            z = bi.pele(K)[:, 2].min()
            if z < -0.003:
                fixos.append((f, loc[ir] + bi.R2[ir].T @ np.array([0, 0, -z + 0.002])))
                pior = min(pior, z)
        if not fixos:
            break
        ad = arm.animation_data or arm.animation_data_create()
        ad.action = a
        if a.slots:
            ad.action_slot = a.slots[0]
        pb = arm.pose.bones[nome]
        for f, l in fixos:
            pb.location = tuple(l)
            pb.keyframe_insert("location", frame=f)
        ad.action = None
    return pior


def levanta_raiz(bi, arm, a, base_dz=0.0, passo=2):
    """Animação do pacote com as proporções novas: onde algo atravessaria o chão, a raiz sobe só o necessário
    (quadro a quadro, suavizado); nunca desce."""
    nome = bi.esq["raiz"]
    ir = bi.idx[nome]
    for lay in a.layers:
        for st in lay.strips:
            for cb in st.channelbags:
                for fc in [fc for fc in cb.fcurves if fc.data_path == f'pose.bones["{nome}"].location']:
                    cb.fcurves.remove(fc)
    f0, f1 = (int(x) for x in a.frame_range)
    qs = list(range(f0, f1 + 1, passo))
    if qs[-1] != f1:
        qs.append(f1)
    dz = []
    for f in qs:
        rot, loc = amostra(bi, a, f)
        loc[ir] = loc[ir] + bi.R2[ir].T @ np.array([0, 0, base_dz])
        _, K = bi.fk(rot, loc)
        dz.append(max(0.0, -bi.pele(K)[:, 2].min()))
    dz = np.array(dz)
    # suaviza sem baixar (máximo dos vizinhos, depois média)
    dz = np.maximum.reduce([np.roll(dz, 1), dz, np.roll(dz, -1)])
    dz = (np.roll(dz, 1) + 2 * dz + np.roll(dz, -1)) / 4
    ad = arm.animation_data or arm.animation_data_create()
    ad.action = a
    if a.slots:
        ad.action_slot = a.slots[0]
    pb = arm.pose.bones[nome]
    for f, d in zip(qs, dz):
        pb.location = tuple(bi.R2[ir].T @ np.array([0, 0, base_dz + d]))
        pb.keyframe_insert("location", frame=f)
    ad.action = None
    return float(dz.max())


# ---------------------------------------------------------------- conferência
def amostra(bi, a, quadro):
    """Pose (rot, loc) de uma ação num quadro, pelas curvas (como o Blender: quatérnio normalizado)."""
    q = np.tile([1.0, 0, 0, 0], (len(bi.nomes), 1))
    t = np.zeros((len(bi.nomes), 3))
    for fc in B._fcurves(a):
        if '"' not in fc.data_path:
            continue
        osso = fc.data_path.split('"')[1]
        if osso not in bi.idx:
            continue
        i = bi.idx[osso]
        if fc.data_path.endswith("rotation_quaternion"):
            q[i, fc.array_index] = fc.evaluate(quadro)
        elif fc.data_path.endswith("location"):
            t[i, fc.array_index] = fc.evaluate(quadro)
    return np.array([quat_mat(x) for x in q]), t


def confere(bi, a, passo=2, pes=None):
    """Menor altura da malha por quadro e quanto cada pé desliza enquanto encosta no chão."""
    f0, f1 = (int(x) for x in a.frame_range)
    zs, slip = [], 0.0
    m_pes = [mascara_ossos(bi, [o]) for o in (pes or [])]
    ant = None
    for f in range(f0, f1 + 1, passo):
        rot, loc = amostra(bi, a, f)
        _, K = bi.fk(rot, loc)
        P = bi.pele(K)
        zs.append(P[:, 2].min())
        if m_pes:
            atual = [(P[m].mean(0), P[m, 2].min()) for m in m_pes]
            if ant:
                for (c0, z0), (c1, z1) in zip(ant, atual):
                    if z0 < 0.03 and z1 < 0.03:
                        slip = max(slip, np.linalg.norm((c1 - c0)[:2]))
            ant = atual
    return np.array(zs), slip


# ---------------------------------------------------------------- esboço rápido (PIL, sem o Blender renderizar)
def esboco(bi, poses, arquivo, vista="lado", lado_px=300, rotulos=None):
    """Desenha cada pose (rot, loc) lado a lado, faces chapadas por ordem de profundidade."""
    luz = np.array([-0.4, -0.6, 0.7])
    luz /= np.linalg.norm(luz)
    d = {"lado": (-1, 0, 0.0), "frente": (0, -1, 0.0), "cima": (-0.05, 0, 1), "tq": (-0.75, -1.0, 0.55),
         "tras": (-0.6, 1.0, 0.4)}[vista]
    d = np.array(d, float) / np.linalg.norm(d)
    up = np.array([0, 0, 1.0]) if vista != "cima" else np.array([0, -1.0, 0])
    direita = np.cross(-d, up)
    direita /= np.linalg.norm(direita)
    R = np.stack([direita, np.cross(direita, -d), d])
    Ps = []
    for rot, loc in poses:
        _, K = bi.fk(rot, loc)
        Ps.append(bi.pele(K))
    allp = np.vstack([P @ R.T for P in Ps] + [np.array([[0, 0, 0]]) @ R.T])
    mn, mx = allp[:, :2].min(0), allp[:, :2].max(0)
    tam = (mx - mn).max() * 1.08
    n = len(Ps)
    img = Image.new("RGB", (lado_px * n, lado_px), (40, 44, 70))
    dr = ImageDraw.Draw(img)
    manter = [i for i in range(len(bi.F)) if not bi.tirar[i]]
    for k, P in enumerate(Ps):
        Q = P @ R.T
        ox = k * lado_px
        c = (mn + mx) / 2

        def px(p):
            return (ox + lado_px / 2 + (p[0] - c[0]) / tam * lado_px, lado_px / 2 - (p[1] - c[1]) / tam * lado_px)

        y0 = lado_px / 2 - (0 - c[1]) / tam * lado_px if vista in ("lado", "frente") else None
        if y0 is not None:
            dr.line([(ox, y0), (ox + lado_px, y0)], fill=(90, 100, 140))
        prof = [Q[bi.F[i], 2].mean() for i in manter]
        for j in np.argsort(prof):
            i = manter[j]
            f = bi.F[i]
            p = P[f]
            nrm = np.zeros(3)
            for a in range(len(f)):
                nrm += np.cross(p[a], p[(a + 1) % len(f)])
            nrm /= np.linalg.norm(nrm) + 1e-12
            sh = 0.45 + 0.55 * max(0.0, float(nrm @ luz))
            col = tuple(int(min(1, x * sh) * 255) for x in bi.Fcol[i])
            dr.polygon([px(Q[v]) for v in f], fill=col)
        if rotulos:
            dr.text((ox + 6, 6), str(rotulos[k]), fill=(255, 255, 255))
    img.save(arquivo)
