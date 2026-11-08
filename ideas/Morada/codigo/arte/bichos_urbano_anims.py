"""Animações compostas dos bichos urbanos: poses-chave em trilhas suaves, giros em eixos do mundo e IK para os pés
(ficam plantados, sem deslizar) e para o pescoço (o bico encosta no chão). Tudo em numpy; depois vira ação do Blender.

Convenções (o bicho olha para −Y, z para cima, esquerda em +X):
- E(rx, ry, rz): rx > 0 inclina para a frente/baixo, ry > 0 rola para a esquerda, rz > 0 vira para a esquerda;
- no lado direito (.R) os giros são espelhados: (rx, −ry, −rz);
- nadar: z = 0 é a linha d'água; voar e planar: o corpo fica a uma altura h acima da origem (as pontas das asas não
  tocam o chão), e decolar/pousar ligam o chão a essa altura.
"""
import math

import numpy as np

import bichos_urbano_rig as U
from bichos_urbano_rig import E, slerp

X, Y, Z = np.eye(3)


# ---------------------------------------------------------------- trilhas
def suave(u):
    u = min(max(u, 0.0), 1.0)
    return u * u * (3 - 2 * u)


def tr(t, chaves, T=None):
    """Valor de uma trilha em t: chaves [(t, v)] com passagem suave; com T, dá a volta (laço)."""
    if T is not None:
        t = t % T
        chaves = list(chaves)
        if chaves[-1][0] < T:
            chaves = chaves + [(T, chaves[0][1])]
    if t <= chaves[0][0]:
        return chaves[0][1]
    for (t0, v0), (t1, v1) in zip(chaves, chaves[1:]):
        if t <= t1:
            u = suave((t - t0) / max(t1 - t0, 1e-9))
            return np.asarray(v0) * (1 - u) + np.asarray(v1) * u if not np.isscalar(v0) else v0 * (1 - u) + v1 * u
    return chaves[-1][1]


def ER(rx, ry, rz, lado):
    return E(rx, ry, rz) if lado == "L" else E(rx, -ry, -rz)


# ---------------------------------------------------------------- avaliação (FK + IK)
def _orto(M):
    u, _, vt = np.linalg.svd(M)
    return u @ vt


class Avaliador:
    """Pose → matrizes do mundo e bases locais, com cadeias de IK (ângulos em eixos do mundo, por osso)."""

    def __init__(self, rig, cadeias):
        self.rig = rig
        self.cad = cadeias
        n = len(rig.nomes)
        self.n = n
        self.caminho = {}
        for cn, c in cadeias.items():
            ie = rig.i(c["efetor"][0])
            cam = [ie]
            while rig.nomes[cam[-1]] != c["ossos"][0]:
                cam.append(rig.pai[cam[-1]])
            self.caminho[cn] = list(reversed(cam))
        self.chute = {}

    def _um(self, i, pose, P, Dl, Bl, absol, ikr):
        rig = self.rig
        nome = rig.nomes[i]
        p = rig.pai[i]
        if p < 0:
            Pp, Dp, Mrel = np.eye(4), np.eye(3), rig.M0[i]
        else:
            Pp, Dp, Mrel = P[p], Dl[p], rig.M0i[p] @ rig.M0[i]
        if nome in absol:
            a = absol[nome]
            D = a(Dp, lambda nm: Dl[rig.idx[nm]]) if callable(a) else a
        else:
            r = pose.rot.get(nome)
            D = Dp @ r if r is not None else Dp
            for ax, th in ikr.get(i, ()):
                D = D @ U.eixo_ang(ax, th)
        Dl[i] = D
        Bm = np.eye(4)
        Bm[:3, :3] = rig.R[i].T @ Dp.T @ D @ rig.R[i]
        sc = pose.esc.get(nome)
        if sc is None and nome in rig.extras and rig.extras[nome].get("escondido"):
            sc = 0.001
        if sc is not None:
            Bm[:3, :3] = Bm[:3, :3] @ np.diag(np.broadcast_to(np.asarray(sc, float), (3,)))
        if nome in pose.loc:
            Bm[:3, 3] = rig.R[i].T @ (Dp.T @ np.asarray(pose.loc[nome], float))
        Bl[i] = Bm
        P[i] = Pp @ Mrel @ Bm

    def avalia(self, pose):
        rig = self.rig
        n = self.n
        P = np.zeros((n, 4, 4))
        Dl = np.zeros((n, 3, 3))
        Bl = np.zeros((n, 4, 4))
        absol = {k: v[1] for k, v in pose.rot.items() if isinstance(v, tuple)}
        ativas = [cn for cn in pose.ik if cn in self.cad]
        for cn in ativas:
            for oc in self.cad[cn].get("comp", []):
                absol[oc] = pose.ori.get(oc, np.eye(3))
        ikr = {}
        self.resid = {}
        for i in rig.ordem:
            self._um(i, pose, P, Dl, Bl, absol, ikr)
        for cn in ativas:
            c = self.cad[cn]
            alvo = pose.ik[cn]
            osso_e, pw = c["efetor"]
            ie = rig.i(osso_e)
            pw4 = np.r_[pw, 1.0]
            T = np.asarray(alvo, float) if c.get("absoluto") or pose.ik_abs.get(cn) else pw + np.asarray(alvo, float)
            eixos = [(rig.i(o), np.asarray(ax, float), k) for o, ax, k in c["eixos"]]
            kk = np.array([k for _, _, k in eixos])
            th = self.chute.get(cn, np.zeros(len(eixos))).copy()
            cam = self.caminho[cn]

            def efetor(th_):
                ik2 = dict(ikr)
                for (ib, ax, _), a in zip(eixos, th_):
                    ik2[ib] = list(ik2.get(ib, ())) + [(ax, a)]
                for i in cam:
                    self._um(i, pose, P, Dl, Bl, absol, ik2)
                return (P[ie] @ rig.M0i[ie] @ pw4)[:3]

            lam = c.get("lam", 0.08)
            for it in range(60):
                e = efetor(th)
                err = T - e
                if np.linalg.norm(err) < 1e-5:
                    break
                J = np.zeros((3, len(th)))
                for k in range(len(th)):
                    t2 = th.copy()
                    t2[k] += 1e-4
                    J[:, k] = (efetor(t2) - e) / 1e-4
                JJ = J.T @ J
                A = JJ + lam * (np.trace(JJ) / len(th) + 1e-12) * np.diag(kk)
                passo = np.linalg.solve(A, J.T @ err)
                nm = np.abs(passo).max()
                if nm > 0.3:
                    passo *= 0.3 / nm
                th = th + passo
            self.chute[cn] = th.copy()
            self.resid[cn] = float(np.linalg.norm(T - efetor(th)))
            w = pose.ikw.get(cn, 1.0)
            for (ib, ax, _), a in zip(eixos, th * w):
                ikr[ib] = list(ikr.get(ib, ())) + [(ax, a)]
            for i in rig.ordem:
                self._um(i, pose, P, Dl, Bl, absol, ikr)
        return P, Bl


class Pose(U.Pose):
    def __init__(self):
        super().__init__()
        self.ikw = {}
        self.ik_abs = {}


# ---------------------------------------------------------------- aves
AVE = dict(quadril="spine.002", corpo="spine.003", peito="spine.004", pesc1="spine.005", pesc2="spine.006",
           pesc3="spine.007", cabeca="scull", cauda1="spine.001", cauda2="spine", ombro="shoulder", asa1="Wing",
           asa2="Wing.001", asa3="Wing.002", coxa="thigh", canela="shin", pe="foot", dedo="toe")


def cadeias_ave(rig, ctx):
    cad = {}
    for l in "LR":
        cad["pe." + l] = dict(ossos=[f"thigh.{l}", f"shin.{l}", f"foot.{l}"], efetor=(f"toe.{l}", rig.H[rig.i(f"toe.{l}")]),
                              eixos=[(f"thigh.{l}", X, 1.0), (f"shin.{l}", X, 1.0), (f"foot.{l}", X, 1.6)],
                              comp=[f"toe.{l}"])
    cad["bico"] = dict(ossos=["spine.003", "spine.005", "spine.006", "spine.007"], efetor=("scull", ctx["bico_ponta"]),
                       eixos=[("spine.003", X, 5.0), ("spine.005", X, 1.0), ("spine.006", X, 1.0), ("spine.007", X, 1.2)],
                       absoluto=True)
    cad["bico_lado"] = dict(ossos=["spine.005", "spine.006", "spine.007"], efetor=("scull", ctx["bico_ponta"]),
                            eixos=[(o, ax, 1.0) for o in ("spine.005", "spine.006", "spine.007") for ax in (X, Z)],
                            absoluto=True)
    return cad


def prepara_asas(rig):
    """Giro (no referencial do corpo) que leva cada osso da asa da posição dobrada para a aberta: a direção do osso vai
    para o lado (um pouco para a frente no braço, para trás na mão) e o lado de fora da asa fica para cima."""
    rig.asa_aberta = {}
    alvo = {"Wing": (1, -0.25, 0.06), "Wing.001": (1, 0.06, 0.0), "Wing.002": (1, 0.3, -0.02)}
    for lado, sx in (("L", 1), ("R", -1)):
        for b, sd in alvo.items():
            i = rig.i(f"{b}.{lado}")
            bd = rig.R[i][:, 1]
            n = np.array([sx, 0, 0.0]) - bd * sx * bd[0]
            n /= np.linalg.norm(n)
            Fr = np.c_[bd, n, np.cross(bd, n)]
            s_ = np.array([sx * sd[0], sd[1], sd[2]])
            s_ /= np.linalg.norm(s_)
            up = Z - s_ * s_[2]
            up /= np.linalg.norm(up)
            Fs = np.c_[s_, up, np.cross(s_, up)]
            rig.asa_aberta[f"{b}.{lado}"] = Fs @ Fr.T
        # penas: abertas, apontam para trás (as primárias em leque), com o lado de fora para cima
        for k in range(1, 7):
            nome = f"pena{k}.{lado}"
            if nome not in rig.idx:
                continue
            Fr = rig.R[rig.i(nome)]
            fan = math.radians([0, 0, 0, -6, -16, -28][k - 1]) * sx
            yt = np.array([-math.sin(fan), math.cos(fan), 0.0])
            nt = Z.copy()
            Ft = np.c_[nt, yt, np.cross(nt, yt)]
            rig.asa_aberta[nome] = Ft @ Fr.T


def ctx_ave(rig, cfg):
    ctx = {}
    b = rig.base
    bico = [k for k in range(rig.n_pele) if False]
    # ponta do bico: o vértice da pele mais à frente entre os da cabeça
    cab = rig.Wt[:, rig.i("scull")] > 0.5  # pele e peças (o bico de pato conta)
    V = rig.Vr
    k = np.argmin(np.where(cab, V[:, 1], 9))
    ctx["bico_ponta"] = V[k].copy()
    ctx["hq"] = rig.H[rig.i("spine.002"), 2]
    ctx["esc"] = cfg["escala"]
    ctx["vel"] = cfg.get("vel", 1.0)
    # meia envergadura (ombro até a ponta da pena mais longa, aberta)
    env = sum(rig.L[rig.i(f"{n}.L")] for n in ("Wing", "Wing.001", "Wing.002"))
    larg_p = max([e["L"] * 0 + e.get("kw", 1) * 0 for e in rig.extras.values()] + [0])
    ctx["envergadura"] = env + 0.04 * cfg["escala"] + abs(rig.H[rig.i("shoulder.L"), 0])
    ctx["h_voo"] = cfg.get("h_voo", round(ctx["envergadura"] * 1.15 + 0.02, 3))
    # pés (efetores) e corpo (sem pernas) para o chão
    pernas = [rig.i(f"{o}.{l}") for o in ("thigh", "shin", "foot", "toe", "toe") for l in "LR"]
    pernas += [rig.i(n) for n in ("toe.L_end", "toe.R_end")]
    dom = rig.Wt.argmax(1)
    ctx["so_corpo"] = ~np.isin(dom, pernas)
    ctx["asas_ossos"] = [n for n in rig.nomes if n.startswith(("Wing", "pena", "shoulder"))]
    return ctx


def _corpo_abs(nome):
    return lambda Dp, dlt: dlt(nome)


def asas_ave(p, rig, abre, bate, varre=0.0, dobra=0.0, lag=0.35, corpo="spine.004", leque=1.0, abre_penas=None):
    """Asas: abre (0 dobrada, 1 aberta), bate (graus, + para cima), varre (graus, + para trás), dobra (fecha a mão)."""
    ab_p = abre if abre_penas is None else abre_penas
    for lado, sx in (("L", 1), ("R", -1)):
        flaps = {}
        for k, b in enumerate(("Wing", "Wing.001", "Wing.002")):
            nome = f"{b}.{lado}"
            fl = bate * (1 + lag * k)
            flaps[b] = fl
            ab = abre * (1 - dobra * k / 2.0)
            W = rig.asa_aberta[nome]
            A = slerp(np.eye(3), W, ab)
            Fl = ER(0, -fl, varre * (1 + 0.3 * k) * -1, lado)
            p.rot[nome] = ("abs", (lambda Fl, A: (lambda Dp, dlt: dlt(corpo) @ Fl @ A))(Fl, A))
        for k in range(1, 7):
            nome = f"pena{k}.{lado}"
            if nome not in rig.idx:
                continue
            pai = rig.nomes[rig.pai[rig.i(nome)]].split(".")
            pb = pai[0] if pai[0] != "Wing" else "Wing"
            pb = ".".join(pai[:-1])
            fl = flaps.get(pb, bate)
            ab = ab_p * (1 - dobra * (2 if pb == "Wing.002" else (1 if pb == "Wing.001" else 0)) / 2.0)
            A = slerp(np.eye(3), rig.asa_aberta[nome], ab)
            Fl = ER(0, -fl, -varre * 1.3, lado)
            p.rot[nome] = ("abs", (lambda Fl, A: (lambda Dp, dlt: dlt(corpo) @ Fl @ A))(Fl, A))
            kw = rig.extras[nome]["kw"]
            p.esc[nome] = (1.0, 1.0, 1.0 + (kw - 1.0) * ab)


def pernas_dobradas(p, s, lado_s=1.0):
    for l in "LR":
        p.rot[f"thigh.{l}"] = E(30 * s)
        p.rot[f"shin.{l}"] = E(65 * s)
        p.rot[f"foot.{l}"] = E(35 * s)
        p.rot[f"toe.{l}"] = E(80 * s)


def pes_plantados(p, w=1.0, offs=None):
    for l in "LR":
        p.ik["pe." + l] = (offs or {}).get(l, np.zeros(3))
        p.ikw["pe." + l] = w


def a_voo_base(p, rig, ctx, t, T, nb):
    """Pose de voo no ar (usada por voar, decolar e pousar)."""
    h = ctx["h_voo"]
    fase = 2 * math.pi * nb * t / T
    bate = 12 + 55 * math.sin(fase)
    dobra = 0.35 * max(0.0, math.cos(fase)) if True else 0
    asas_ave(p, rig, 1.0, bate, dobra=0.25 * (1 + math.cos(fase)) / 2)
    p.loc["spine.002"] = np.array([0, 0, h - 0.012 * ctx["esc"] / 0.6 * math.sin(fase + 0.6)])
    p.rot["spine.002"] = E(6 + 2 * math.sin(fase))
    p.rot["spine.005"] = E(12)
    p.rot["spine.006"] = E(-8)
    p.rot["scull"] = E(-6)
    p.rot["spine.001"] = E(-6 + 3 * math.sin(fase))
    pernas_dobradas(p, 1.0)


def anim_ave(nome, rig, ctx, cfg):
    """Devolve (segundos, laço, função t → Pose) de cada animação de ave."""
    v = ctx["vel"]
    esc = ctx["esc"]
    hq = ctx["hq"]
    bp = ctx["bico_ponta"]
    m = esc / 0.6  # metro relativo ao pombo

    if nome == "bicar":
        T = 2.0 / v

        def f(t):
            p = Pose()
            s = tr(t, [(0, 0), (0.22 * T, 1), (0.29 * T, 0.7), (0.36 * T, 1), (0.5 * T, 0), (0.62 * T, 0), (0.72 * T, 1),
                       (0.8 * T, 0.0), (T, 0)])
            olha = tr(t, [(0, 0), (0.52 * T, 0), (0.56 * T, 25), (0.62 * T, 25), (0.66 * T, 0), (0.85 * T, 0),
                          (0.9 * T, -20), (0.96 * T, -20), (T, 0)])
            chao = np.array([0, bp[1] - 0.018 * m, 0.004 * m])
            p.ik["bico"] = bp + (chao - bp) * s
            p.rot["scull"] = ("abs", E(62 * s, 0, olha * (1 - s)))
            p.rot["spine.001"] = E(-18 * s)
            pes_plantados(p)
            return p
        return T, True, f

    if nome == "ciscar":
        T = 2.6 / v

        def f(t):
            p = Pose()
            offs = {}
            for l, t0 in (("L", 0.0), ("R", 0.5 * T)):
                u = (t - t0) % T
                a = 0.12 * T
                o = np.zeros(3)
                for k in range(2):  # duas raspadas
                    u0 = k * a
                    if u0 <= u < u0 + a:
                        w = (u - u0) / a
                        o = np.array([0, tr(w, [(0, 0), (0.35, -0.012 * m), (0.8, 0.045 * m), (1, 0)]),
                                      tr(w, [(0, 0), (0.35, 0.022 * m), (0.55, 0.004 * m), (0.8, 0.002 * m), (1, 0)])])
                offs[l] = o
            pes_plantados(p, offs=offs)
            lado = tr(t, [(0, 1), (0.2 * T, 1), (0.3 * T, 0), (0.5 * T, -1), (0.7 * T, -1), (0.8 * T, 0)], T)
            p.loc["spine.002"] = np.array([-0.008 * m * lado, 0, -0.006 * m])
            p.rot["spine.003"] = E(10)
            olha = tr(t, [(0, 0), (0.25 * T, 0), (0.32 * T, 1), (0.45 * T, 1), (0.5 * T, 0), (0.75 * T, 0),
                          (0.82 * T, 1), (0.95 * T, 1)], T)
            p.rot["spine.005"] = E(20 * olha)
            p.rot["spine.006"] = E(10 * olha)
            p.rot["scull"] = E(30 * olha, 0, 0)
            p.rot["spine.001"] = E(-8)
            return p
        return T, True, f

    if nome == "arrumar":
        T = 3.2 / v

        def f(t):
            p = Pose()
            s = tr(t, [(0, 0), (0.15 * T, 1), (0.55 * T, 1), (0.68 * T, 0), (T, 0)])
            bic = 6 * math.sin(2 * math.pi * 7 * t) * s * (1 if t < 0.55 * T else 0)
            p.rot["spine.005"] = E(-5 * s, 0, 45 * s)
            p.rot["spine.006"] = E(15 * s, 0, 55 * s)
            p.rot["spine.007"] = E(25 * s + bic, 0, 45 * s)
            p.rot["scull"] = E(35 * s + bic, -20 * s, 20 * s)
            # sacode as penas no fim
            sac = tr(t, [(0, 0), (0.7 * T, 0), (0.74 * T, 1), (0.86 * T, 1), (0.9 * T, 0), (T, 0)])
            ro = 9 * math.sin(2 * math.pi * 9 * t) * sac
            p.rot["spine.003"] = E(0, ro, 0)
            p.esc["spine.004"] = 1 + 0.06 * sac
            asas_ave(p, rig, 0.12 * s + 0.1 * sac, 15 * s + 25 * sac, abre_penas=0.0)
            p.rot["spine.001"] = E(-10 * sac, 0, 8 * math.sin(2 * math.pi * 9 * t) * sac)
            pes_plantados(p)
            return p
        return T, True, f

    if nome in ("chocar", "sentar"):
        d = ctx["d_sentar"]
        T = 4.0 if nome == "chocar" else 1.2 / v

        def f(t):
            p = Pose()
            if nome == "chocar":
                s = 1.0
                resp = math.sin(2 * math.pi * 2 * t / T)
                olha = tr(t, [(0, 0), (0.3 * T, 0), (0.38 * T, 30), (0.55 * T, 30), (0.63 * T, -25), (0.8 * T, -25),
                              (0.88 * T, 0)], T)
            else:
                s = tr(t, [(0, 0), (0.15 * T, 0.1), (0.85 * T, 1), (T, 1)])
                resp, olha = 0.0, 0.0
            p.loc["spine.002"] = np.array([0, 0.004 * m * s, -d * s + 0.0015 * m * resp])
            p.rot["spine.002"] = E(-4 * s)
            p.rot["spine.005"] = E(-14 * s, 0, olha * 0.4)
            p.rot["spine.006"] = E(-6 * s, 0, olha * 0.3)
            p.rot["scull"] = E(8 * s, 0, olha * 0.3)
            p.esc["spine.003"] = 1 + (0.05 + 0.012 * resp) * s
            pes_plantados(p)
            return p
        return T, (nome == "chocar"), f

    if nome == "voar":
        nb = cfg.get("batidas", 3)
        T = cfg.get("t_voo", 1.0)

        def f(t):
            p = Pose()
            a_voo_base(p, rig, ctx, t, T, nb)
            return p
        return T, True, f

    if nome == "planar":
        T = 3.0
        h = ctx["h_voo"]

        def f(t):
            p = Pose()
            w = 2 * math.pi * t / T
            asas_ave(p, rig, 1.0, cfg.get("diedro", 4) + 3 * math.sin(2 * w), varre=-3, leque=0.8)
            p.loc["spine.002"] = np.array([0, 0, h + 0.008 * m * math.sin(w)])
            p.rot["spine.002"] = E(4, 7 * math.sin(w), 4 * math.sin(w))
            p.rot["spine.005"] = E(12)
            p.rot["spine.006"] = E(-8)
            p.rot["scull"] = E(-6, -5 * math.sin(w), 6 * math.sin(w))
            p.rot["spine.001"] = E(-8, 0, -5 * math.sin(w))
            pernas_dobradas(p, 1.0)
            return p
        return T, True, f

    if nome == "decolar":
        nbv = cfg.get("batidas", 3)
        Tv = cfg.get("t_voo", 1.0)
        T = 1.3 / v * (1.0 if v < 1.4 else 1.0)
        t0 = 0.3 * T  # sai do chão
        nb = max(2, round((T - t0) / (Tv / nbv)))
        h = ctx["h_voo"]

        def f(t):
            p = Pose()
            agacha = tr(t, [(0, 0), (0.22 * T, 1), (t0, 0.2), (0.45 * T, 0)])
            sobe = suave((t - t0) / (T - t0)) ** 0.85 if t > t0 else 0.0
            p.loc["spine.002"] = np.array([0, 0, -0.28 * hq * agacha + sobe * h])
            # asas: abrem no agachamento, depois batem forte até a fase do voar
            ab = tr(t, [(0, 0), (0.2 * T, 0.9), (t0, 1.0)])
            if t <= t0:
                bate = tr(t, [(0, 0), (0.2 * T, 60), (t0, 12 + 0.0)])
            else:
                fase = 2 * math.pi * nb * (t - t0) / (T - t0)
                amp = 70 - 15 * (t - t0) / (T - t0)
                bate = 12 + amp * math.sin(fase)
            asas_ave(p, rig, ab, bate, dobra=0.0)
            p.rot["spine.002"] = E(18 * agacha * 0 + tr(t, [(0, 0), (0.22 * T, 14), (t0, -8), (T, 6)]))
            p.rot["spine.005"] = E(tr(t, [(0, 0), (t0, 0), (T, 12)]))
            p.rot["spine.006"] = E(tr(t, [(0, 0), (t0, 0), (T, -8)]))
            p.rot["scull"] = E(tr(t, [(0, 0), (0.22 * T, 10), (T, -6)]))
            p.rot["spine.001"] = E(tr(t, [(0, 0), (0.22 * T, -15), (T, -6)]))
            # pés: plantados até sair do chão; depois a perna estica e encolhe
            no_chao = t <= t0 + 0.04 * T
            w = 1.0 if no_chao else max(0.0, 1 - (t - t0 - 0.04 * T) / (0.15 * T))
            if w > 0:
                pes_plantados(p, w=w, offs={l: np.array([0, 0, max(0.0, sobe * h - 0.0)]) for l in "LR"})
            pernas_dobradas(p, suave((t - t0) / (0.6 * (T - t0))) if t > t0 else 0.0)
            return p
        return T, False, f

    if nome == "pousar":
        nbv = cfg.get("batidas", 3)
        Tv = cfg.get("t_voo", 1.0)
        T = 1.5 / v
        tc = 0.62 * T  # toca o chão
        h = ctx["h_voo"]

        def f(t):
            p = Pose()
            if t <= tc:
                u = t / tc
                z = h * (1 - suave(u) ** 1.0) if u < 1 else 0.0
                z = h * (1 - (1 - (1 - u) ** 2))  # desacelera perto do chão
            else:
                z = 0.0
            amort = tr(t, [(0, 0), (tc, 0), (tc + 0.1 * T, 1), (0.92 * T, 0)])
            p.loc["spine.002"] = np.array([0, 0, z - 0.22 * hq * amort])
            # asas: freiam (batidas para a frente) e fecham depois de tocar
            nbf = 2
            fase = 2 * math.pi * nbf * min(t, tc) / tc
            amp = tr(t, [(0, 55), (tc, 35), (T, 0)])
            bate = 12 + amp * math.sin(fase) if t <= tc else tr(t, [(tc, 12 + amp * math.sin(fase)), (0.85 * T, 0)])
            ab = tr(t, [(0, 1), (tc + 0.05 * T, 1), (0.9 * T, 0)])
            varre = tr(t, [(0, 0), (0.35 * T, -25), (tc, -15), (0.9 * T, 0)])
            asas_ave(p, rig, ab, bate, varre=varre, dobra=0.0)
            p.rot["spine.002"] = E(tr(t, [(0, 6), (0.4 * T, -4), (tc, 0), (T, 0)]))
            p.rot["spine.003"] = E(tr(t, [(0, 0), (0.45 * T, -22), (tc, -12), (tc + 0.12 * T, 8), (T, 0)]))
            p.rot["spine.005"] = E(tr(t, [(0, 12), (0.5 * T, 8), (T, 0)]))
            p.rot["spine.006"] = E(tr(t, [(0, -8), (T, 0)]))
            p.rot["scull"] = E(tr(t, [(0, -6), (0.5 * T, 10), (tc + 0.1 * T, 14), (T, 0)]))
            p.rot["spine.001"] = E(tr(t, [(0, -6), (0.5 * T, -25), (tc + 0.15 * T, -10), (T, 0)]))
            # pernas: saem do encolhido e esticam para tocar; depois do toque, IK com os pés plantados
            pernas_dobradas(p, 1 - suave(t / (0.45 * T)))
            if t >= tc:
                pes_plantados(p)
            return p
        return T, False, f

    if nome == "nadar":
        T = 1.6 / v
        dz = ctx["agua"]

        def f(t):
            p = Pose()
            w = 2 * math.pi * t / T
            p.loc["spine.002"] = np.array([0, 0, -dz + 0.002 * m * math.sin(2 * w)])
            p.rot["spine.002"] = E(-3, 2 * math.sin(w), 0)
            p.rot["spine.005"] = E(4 * math.sin(2 * w))
            p.rot["scull"] = E(-4 * math.sin(2 * w), 0, 10 * math.sin(w * 0.5) * 0)
            p.rot["spine.001"] = E(-6, 0, 7 * math.sin(w))
            for l, ph in (("L", 0), ("R", math.pi)):
                a = math.sin(w + ph)
                p.rot[f"thigh.{l}"] = E(35 + 25 * a)
                p.rot[f"shin.{l}"] = E(25 + 20 * a)
                p.rot[f"toe.{l}"] = E(-20 * a + 10)
            return p
        return T, True, f

    if nome == "mergulhar":
        T = 2.8 / v
        dz = ctx["agua"]

        def f(t):
            p = Pose()
            s = tr(t, [(0, 0), (0.25 * T, 1), (0.72 * T, 1), (0.95 * T, 0), (T, 0)])
            w = 2 * math.pi * t / (0.4 * T / v)
            p.loc["spine.002"] = np.array([0, -0.02 * m * s, -dz + 0.03 * m * s])
            p.rot["spine.002"] = E(-3 + 95 * s)
            p.rot["spine.005"] = E(20 * s)
            p.rot["spine.006"] = E(10 * s)
            p.rot["scull"] = E(10 * s + 6 * math.sin(3 * w) * s)
            p.rot["spine.001"] = E(-6 - 25 * s, 0, 15 * math.sin(w) * s)
            for l, ph in (("L", 0), ("R", math.pi)):
                a = math.sin(w + ph) * s
                p.rot[f"thigh.{l}"] = E(35 + 30 * a + 20 * s)
                p.rot[f"shin.{l}"] = E(25 + 25 * a)
                p.rot[f"toe.{l}"] = E(-25 * a + 10)
            return p
        return T, False, f

    raise KeyError(nome)


# ---------------------------------------------------------------- geração
def calibra_ave(rig, ctx, cadeias, cfg):
    """Mede o que depende do corpo: quanto o quadril desce para sentar (a barriga encosta no chão) e a linha d'água."""
    av = Avaliador(rig, cadeias)
    so = ctx["so_corpo"]

    def menor_z(d):
        p = Pose()
        p.loc["spine.002"] = np.array([0, 0.004 * ctx["esc"] / 0.6, -d])
        p.rot["spine.002"] = E(-4)
        p.rot["spine.005"] = E(-14)
        p.esc["spine.003"] = 1.05
        pes_plantados(p)
        av.chute = {}
        P, _ = av.avalia(p)
        return rig.pele(P, so)[:, 2].min()
    a, b = 0.0, ctx["hq"]
    for _ in range(22):
        c = (a + b) / 2
        if menor_z(c) > 0.003 * ctx["esc"] / 0.6:
            a = c
        else:
            b = c
    ctx["d_sentar"] = a
    zc = rig.Vr[so][:, 2]
    fundo = zc.min()
    altura = zc.max() - fundo
    ctx["agua"] = fundo + cfg.get("calado", 0.32) * (rig.H[rig.i("spine.004"), 2] - fundo) * 1.6


def gera(rig, cadeias, nome, seg, laco, f, quadril=None, chao=True):
    """Quadros (a cada PASSO, a partir do 1) → lista de bases locais; e números para conferir. Com `chao`, se alguma
    parte do corpo passar do chão num quadro, o quadril sobe o que falta (os pés plantados continuam no lugar)."""
    av = Avaliador(rig, cadeias)
    nq = int(round(seg * U.FPS / U.PASSO))
    seg = nq * U.PASSO / U.FPS
    quadros, minz, desliza = [], [], 0.0
    for k in range(nq + 1):
        t = k * U.PASSO / U.FPS
        if laco and k == nq:
            t = 0.0
        p = f(min(t, seg))
        P, Bl = av.avalia(p)
        V = rig.pele(P)
        if chao and quadril:
            for _ in range(6):
                z = V[:, 2].min()
                if z > -0.0015:
                    break
                p.loc[quadril] = np.asarray(p.loc.get(quadril, np.zeros(3)), float) + np.array([0, 0, -z + 0.001])
                P, Bl = av.avalia(p)
                V = rig.pele(P)
        quadros.append(Bl)
        minz.append(V[:, 2].min())
        for cn, r in av.resid.items():  # pé plantado: quanto o IK ficou longe do alvo
            if cn.startswith("pe") and p.ikw.get(cn, 1.0) >= 1.0:
                desliza = max(desliza, r)
    return quadros, seg, dict(minz=round(float(min(minz)), 4), desliza=round(desliza, 4))


def queda(rig, cadeias, so, fazer, alvo=0.003, hmax=1.0):
    """Quanto o corpo desce (d) até o ponto mais baixo de `so` encostar no chão (z = alvo), por bissecção."""
    av = Avaliador(rig, cadeias)

    def menor(d):
        av.chute = {}
        P, _ = av.avalia(fazer(d))
        return rig.pele(P, so)[:, 2].min()
    a, b = 0.0, hmax
    for _ in range(24):
        c = (a + b) / 2
        if menor(c) > alvo:
            a = c
        else:
            b = c
    return a


# ---------------------------------------------------------------- roedores e tartaruga (Kitty)
def cadeias_quad(rig, ctx):
    cad = {}
    for l in "LR":
        cad["pe.tras." + l] = dict(ossos=[f"shoulder.{l}", f"thigh.{l}", f"shin.{l}", f"foot.{l}"],
                                   efetor=(f"toe.{l}", rig.H[rig.i(f"toe.{l}")]),
                                   eixos=[(f"shoulder.{l}", X, 2.0), (f"thigh.{l}", X, 1.0), (f"shin.{l}", X, 1.0),
                                          (f"foot.{l}", X, 1.5)], comp=[f"toe.{l}"])
        cad["pe.frente." + l] = dict(ossos=[f"front_shoulder.{l}", f"front_thigh.{l}", f"front_shin.{l}"],
                                     efetor=(f"front_foot.{l}", rig.H[rig.i(f"front_foot.{l}")]),
                                     eixos=[(f"front_shoulder.{l}", X, 2.0), (f"front_thigh.{l}", X, 1.0),
                                            (f"front_shin.{l}", X, 1.0)], comp=[f"front_foot.{l}"])
    cad["focinho"] = dict(ossos=["spine.007", "spine.008", "scull"], efetor=("scull", ctx["nariz"]),
                          eixos=[("spine.007", X, 4.0), ("spine.008", X, 1.0), ("spine.008", Z, 1.0), ("scull", X, 1.0),
                                 ("scull", Z, 1.5)], absoluto=True)
    return cad


def ctx_quad(rig, cfg):
    ctx = {"esc": cfg["escala"], "vel": cfg.get("vel", 1.0), "hq": rig.H[rig.i("spine.005"), 2]}
    cab = rig.Wt[:rig.n_pele, rig.i("scull")] + rig.Wt[:rig.n_pele, rig.i("jaw")] > 0.5
    V = rig.Vr[:rig.n_pele]
    ctx["nariz"] = V[np.argmin(np.where(cab, V[:, 1], 9))].copy()
    pernas = [rig.i(f"{o}.{l}") for o in ("thigh", "shin", "foot", "toe", "front_thigh", "front_shin", "front_foot")
              for l in "LR"]
    dom = rig.Wt.argmax(1)
    ctx["so_corpo"] = ~np.isin(dom, pernas + [rig.i(n) for n in rig.extras])
    ctx["cauda"] = ["spine.004", "spine.003", "spine.002", "spine.001", "spine"]
    return ctx


def pes4(p, w=1.0, offs=None, quais=("tras.L", "tras.R", "frente.L", "frente.R")):
    for q in quais:
        p.ik["pe." + q] = (offs or {}).get(q, np.zeros(3))
        p.ikw["pe." + q] = w


def _sentado(p, ang, d, m, frente=None):
    p.rot["spine.005"] = E(-ang)
    p.loc["spine.005"] = np.array([0, 0.0, -d])
    p.rot["spine.004"] = E(ang * 0.9)


def perna_cocando(p, s, coca=0.0):
    """Perna de trás esquerda levantada para o lado, até atrás da orelha."""
    p.rot["shoulder.L"] = ER(-100 * s + coca, -50 * s, 0, "L")
    p.rot["thigh.L"] = E(-45 * s + coca * 0.5)
    p.rot["shin.L"] = E(35 * s)
    p.rot["foot.L"] = E(-10 * s)


def calibra_quad(rig, ctx, cad, cfg):
    so = ctx["so_corpo"]
    hq = ctx["hq"]

    def f_comer(ang, front_ik=False):
        def g(d):
            p = Pose()
            _sentado(p, ang, d, 1)
            pes4(p, quais=("tras.L", "tras.R") + (("frente.L", "frente.R") if front_ik else ()))
            return p
        return g
    ctx["d_comer"] = queda(rig, cad, so, f_comer(cfg.get("ang_comer", 55)), hmax=hq)
    ctx["d_empe"] = queda(rig, cad, so, f_comer(cfg.get("ang_empe", 72)), hmax=hq)
    tudo = np.ones(len(rig.Vr), bool)
    av = Avaliador(rig, cad)
    # sentado para se coçar: o maior giro (até ang_cocar) em que as patas da frente ainda alcançam o chão
    for ang in range(int(cfg.get("ang_cocar", 28)), -1, -2):
        def f_cocar(d, ang=ang):
            p = Pose()
            _sentado(p, ang, d, 1)
            pes4(p, quais=("tras.R", "frente.L", "frente.R"))
            perna_cocando(p, 1.0, 14)
            return p
        d = queda(rig, cad, tudo, f_cocar, hmax=hq)
        av.chute = {}
        av.avalia(f_cocar(d))
        if max(av.resid.values()) < 0.0015:
            break
    ctx["d_cocar"], ctx["ang_cocar"] = d, ang

    def f_deitar(d):
        p = Pose()
        p.loc["spine.005"] = np.array([0, 0, -d])
        pes4(p, offs={"frente.L": np.array([0, -0.25 * hq, 0]), "frente.R": np.array([0, -0.25 * hq, 0])})
        return p
    ctx["d_deitar"] = queda(rig, cad, so, f_deitar, hmax=hq)


def anim_quad(nome, rig, ctx, cfg):
    v = ctx["vel"]
    esc = ctx["esc"]
    hq = ctx["hq"]
    nz = ctx["nariz"]
    m = hq / 0.2  # metro relativo (altura do quadril de 20 cm)
    orelha = cfg.get("orelha_mexe", 1.0)

    def orelhas(p, t, a=8.0, f=0.7):
        for l, ph in (("L", 0), ("R", 1.3)):
            p.rot[f"ear.{l}"] = ER(a * orelha * math.sin(2 * math.pi * f * t + ph), 0, 0, l)

    if nome == "farejar":
        T = 2.4 / v

        def f(t):
            p = Pose()
            s = tr(t, [(0, 0.15), (0.25 * T, 1), (0.5 * T, 0.85), (0.75 * T, 1), (T, 0.15)])
            lado = 0.035 * m * math.sin(2 * math.pi * t / T)
            chao = np.array([lado, nz[1] - 0.015 * m, 0.014 * m])
            p.ik["focinho"] = nz + (chao - nz) * s + np.array([lado * (1 - s), 0, 0])
            p.rot["jaw"] = E(3 * math.sin(2 * math.pi * 7 * t))
            p.rot["spine.006"] = E(6 * s)
            pes4(p)
            orelhas(p, t, 10, 1.4)
            for k, c in enumerate(ctx["cauda"]):
                p.rot[c] = E(0, 0, 6 * math.sin(2 * math.pi * t / T - 0.6 * k))
            return p
        return T, True, f

    if nome in ("comer", "em_pe"):
        em_pe = nome == "em_pe"
        ang = cfg.get("ang_empe" if em_pe else "ang_comer", 72 if em_pe else 55)
        d = ctx["d_empe" if em_pe else "d_comer"]
        T = (3.6 if em_pe else 3.0) / v

        def f(t):
            p = Pose()
            resp = math.sin(2 * math.pi * 2 * t / T)
            _sentado(p, ang, d, m)
            pes4(p, quais=("tras.L", "tras.R"))
            if em_pe:
                yaw = tr(t, [(0, 0), (0.2 * T, 0), (0.3 * T, 35), (0.5 * T, 35), (0.6 * T, -30), (0.8 * T, -30),
                             (0.9 * T, 0)], T)
                p.rot["spine.008"] = E(ang * 0.45)
                p.rot["scull"] = ("abs", E(-4, 0, yaw))
                for l in "LR":
                    p.rot[f"front_shoulder.{l}"] = ER(-10, 12, 0, l)
                    p.rot[f"front_thigh.{l}"] = ER(-35, 10, 0, l)
                    p.rot[f"front_shin.{l}"] = ER(70, 0, 0, l)
                    p.rot[f"front_foot.{l}"] = ER(30, 0, 0, l)
                orelhas(p, t, 12, 0.5)
                p.esc["spine.006"] = 1 + 0.015 * resp
            else:
                rói = math.sin(2 * math.pi * 5 * t)
                p.rot["spine.008"] = E(ang * 0.2)
                p.rot["scull"] = E(ang * 0.35 + 4 * rói)
                p.rot["jaw"] = E(6 + 6 * rói)
                for l in "LR":
                    p.rot[f"front_shoulder.{l}"] = ER(-20, 10, 0, l)
                    p.rot[f"front_thigh.{l}"] = ER(-70 + 3 * rói, 22, 0, l)
                    p.rot[f"front_shin.{l}"] = ER(-30, 6, 0, l)
                    p.rot[f"front_foot.{l}"] = ER(-20, 0, 0, l)
                p.esc["comida"] = 1.0
                orelhas(p, t, 6, 1.0)
            for k, c in enumerate(ctx["cauda"][1:]):
                p.rot[c] = E(0, 0, 4 * math.sin(2 * math.pi * t / T - 0.6 * k))
            return p
        return T, True, f

    if nome == "pular":
        T = cfg.get("t_pulo", 0.9) / v
        H = cfg.get("pulo", 0.55) * hq

        def f(t):
            u = (t % T) / T
            p = Pose()
            agacha = tr(u, [(0, 0), (0.2, 1), (0.32, 0), (0.82, 0), (0.9, 0.7), (1.0, 0)])
            ar = math.sin(math.pi * (u - 0.3) / 0.52) if 0.3 < u < 0.82 else 0.0
            p.loc["spine.005"] = np.array([0, 0, -0.22 * hq * agacha + H * ar])
            p.rot["spine.005"] = E(tr(u, [(0, 0), (0.2, 6), (0.32, -14), (0.6, 0), (0.8, 10), (0.9, 4), (1, 0)]))
            p.rot["scull"] = E(tr(u, [(0, 0), (0.32, 10), (0.8, -8), (1, 0)]))
            w = tr(u, [(0, 1), (0.3, 1), (0.38, 0), (0.76, 0), (0.84, 1), (1, 1)])
            pes4(p, w=w)
            estica = ar
            for l in "LR":
                p.rot[f"shoulder.{l}"] = E(35 * estica)
                p.rot[f"thigh.{l}"] = E(20 * estica)
                p.rot[f"shin.{l}"] = E(25 * estica)
                p.rot[f"front_shoulder.{l}"] = E(-30 * estica)
                p.rot[f"front_thigh.{l}"] = E(-15 * estica)
            for k, c in enumerate(ctx["cauda"]):
                p.rot[c] = E(-15 * ar)
            orelhas(p, t, 5, 1.0)
            for l in "LR":
                p.rot[f"ear.{l}"] = p.rot[f"ear.{l}"] @ E(25 * ar)
            return p
        return T, True, f

    if nome == "cocar":
        ang = ctx["ang_cocar"]
        d = ctx["d_cocar"]
        T = 2.4 / v

        def f(t):
            p = Pose()
            s = tr(t, [(0, 0), (0.2 * T, 1), (0.8 * T, 1), (T, 0)])
            _sentado(p, ang, d, m)
            pes4(p, quais=("tras.R", "frente.L", "frente.R"))
            coca = 14 * math.sin(2 * math.pi * 8 * t) * suave((t - 0.2 * T) / (0.1 * T)) * (1 if t < 0.8 * T else 0)
            perna_cocando(p, s, coca)
            p.rot["spine.008"] = E(10 * s, 15 * s, 15 * s)
            p.rot["scull"] = E(10 * s, 20 * s, 10 * s)
            return p
        return T, True, f

    if nome == "dormir":
        d = ctx["d_deitar"]
        T = 4.0

        def f(t):
            p = Pose()
            resp = math.sin(2 * math.pi * 2 * t / T)
            p.loc["spine.005"] = np.array([0, 0, -d])
            pes4(p, offs={"frente.L": np.array([0, -0.25 * hq, 0]), "frente.R": np.array([0, -0.25 * hq, 0])})
            p.rot["spine.008"] = E(28, 0, 12)
            p.rot["scull"] = E(18, -6, 10)
            p.esc["spine.006"] = 1 + 0.02 * resp
            for k, c in enumerate(ctx["cauda"]):
                p.rot[c] = E(4, 0, 22 if cfg.get("cauda_enrola", True) else 0)
            p.rot["ear.L"] = ER(-55, -10, 0, "L")
            p.rot["ear.R"] = ER(-55, -10, 0, "R")
            return p
        return T, True, f

    # ---------------- tartaruga
    if nome in ("esconder", "escondida", "sair"):
        T = {"esconder": 1.2, "escondida": 3.0, "sair": 1.4}[nome]
        d = ctx["d_casco"]
        Ln = rig.L[rig.i("spine.008")] + rig.L[rig.i("scull")]

        def f(t):
            p = Pose()
            if nome == "esconder":
                s = suave(t / T)
            elif nome == "sair":
                s = 1 - suave(t / T)
            else:
                s = 1.0
            resp = math.sin(2 * math.pi * t / T) if nome == "escondida" else 0.0
            p.loc["spine.005"] = np.array([0, 0, -d * s])
            p.loc["spine.008"] = np.array([0, 0.95 * Ln * s, -0.15 * Ln * s])
            p.esc["spine.008"] = 1 - 0.35 * s
            for l, sx in (("L", 1), ("R", -1)):
                for b in ("front_shoulder", "shoulder"):
                    p.esc[f"{b}.{l}"] = 1 - 0.55 * s
                    p.loc[f"{b}.{l}"] = np.array([-sx * 0.25, 0, 0.6]) * hq * s * 0.6
            p.esc["spine.004"] = 1 - 0.7 * s
            p.esc["spine.006"] = 1 + 0.01 * resp
            return p
        return T, nome == "escondida", f

    if nome == "pastar":
        T = 2.6

        def f(t):
            p = Pose()
            s = tr(t, [(0, 0), (0.3 * T, 1), (0.8 * T, 1), (T, 0)])
            mord = tr(t, [(0, 0), (0.4 * T, 0), (0.46 * T, 1), (0.52 * T, 0), (0.62 * T, 0), (0.68 * T, 1),
                          (0.74 * T, 0), (T, 0)])
            chao = np.array([0, nz[1] - 0.03 * m, 0.02 * m])
            p.ik["focinho"] = nz + (chao - nz) * s + np.array([0, -0.01 * m * mord, -0.008 * m * mord])
            p.rot["jaw"] = E(-14 * mord + 0)
            pes4(p)
            return p
        return T, True, f

    if nome == "olhar":
        T = 4.0

        def f(t):
            p = Pose()
            s = tr(t, [(0, 0), (0.15 * T, 1), (0.85 * T, 1), (T, 0)])
            yaw = tr(t, [(0, 0), (0.2 * T, 0), (0.35 * T, 40), (0.5 * T, 40), (0.65 * T, -40), (0.8 * T, -40),
                         (0.9 * T, 0)], T)
            p.rot["spine.008"] = E(-28 * s, 0, yaw * 0.6)
            p.rot["scull"] = E(10 * s, 0, yaw * 0.4)
            pes4(p)
            return p
        return T, True, f

    if nome == "nadar":
        T = 2.0
        dz = ctx["agua"]

        def f(t):
            p = Pose()
            w = 2 * math.pi * t / T
            p.loc["spine.005"] = np.array([0, 0, -dz + 0.004 * m * math.sin(2 * w)])
            p.rot["spine.008"] = E(-20)
            p.rot["scull"] = E(10, 0, 6 * math.sin(w))
            for l, ph in (("L", 0), ("R", math.pi)):
                a = math.sin(w + ph)
                p.rot[f"front_shoulder.{l}"] = ER(-30 * a, -25, 0, l)
                p.rot[f"front_thigh.{l}"] = ER(-20 * a, 0, 0, l)
                p.rot[f"shoulder.{l}"] = ER(30 * a + 20, -15, 0, l)
            return p
        return T, True, f

    raise KeyError(nome)


def calibra_tartaruga(rig, ctx, cad, cfg):
    so = ctx["so_corpo"] | (rig.Wt.argmax(1) == rig.i("spine.006"))
    casco = np.zeros(len(rig.Vr), bool)
    casco[rig.n_pele:] = rig.Wt[rig.n_pele:, rig.i("spine.006")] > 0.5
    zc = rig.Vr[casco, 2]
    ctx["d_casco"] = zc.min() - 0.002
    ctx["agua"] = zc.min() + 0.7 * (zc.max() - zc.min())


# ---------------------------------------------------------------- pinguim
def cadeias_ping(rig, ctx):
    cad = {}
    for l in "LR":
        cad["pe." + l] = dict(ossos=[f"thigh.{l}", f"shin.{l}"], efetor=(f"foot.{l}", rig.H[rig.i(f"foot.{l}")]),
                              eixos=[(f"thigh.{l}", X, 1.0), (f"shin.{l}", X, 1.0)], comp=[f"foot.{l}"])
    return cad


def ctx_ping(rig, cfg):
    ctx = {"esc": cfg["escala"], "vel": cfg.get("vel", 1.0), "hq": rig.H[rig.i("spine.002"), 2],
           "alt": rig.Vr[:, 2].max()}
    dom = rig.Wt.argmax(1)
    ctx["so_corpo"] = ~np.isin(dom, [rig.i(f"{o}.{l}") for o in ("thigh", "shin", "foot") for l in "LR"])
    return ctx


def _deitado(p, ang=82):
    p.rot["spine.002"] = E(ang)
    p.rot["spine.005"] = E(-45)
    p.rot["scull"] = E(-ang + 40)


def calibra_ping(rig, ctx, cad, cfg):
    av = Avaliador(rig, cad)
    so = ctx["so_corpo"]
    p = Pose()
    _deitado(p)
    P, _ = av.avalia(p)
    V = rig.pele(P, so)
    ctx["deitado_z"] = -V[:, 2].min() + 0.002
    ctx["deitado_y"] = -V[:, 1].mean()
    zmin, zmax = V[:, 2].min(), V[:, 2].max()
    ctx["agua_z"] = -(zmin + 0.62 * (zmax - zmin))


def anim_ping(nome, rig, ctx, cfg):
    v = ctx["vel"]
    hq = ctx["hq"]
    alt = ctx["alt"]

    def nadadeiras(p, ab, flap, frente=0.0):
        for l in "LR":
            p.rot[f"fin.{l}"] = ER(frente, ab, flap, l)

    if nome in ("nadar", "mergulhar"):
        T = 1.4 if nome == "nadar" else 2.2

        def f(t):
            p = Pose()
            w = 2 * math.pi * t / (1.4 / 1.0)
            if nome == "nadar":
                s, desce = 0.0, 0.0
            else:
                s = tr(t, [(0, 0), (0.35 * T, 0.5), (T, 1)])
                desce = tr(t, [(0, 0), (0.25 * T, -0.02 * alt), (T, 0.9 * alt)])
            _deitado(p, 82 + 45 * s)
            p.loc["spine.002"] = np.array([0, ctx["deitado_y"], ctx["agua_z"] - desce + 0.01 * alt * math.sin(2 * w)])
            nadadeiras(p, 70, 40 * math.sin(w) * (1 + 0.4 * s))
            for l, ph in (("L", 0), ("R", math.pi)):
                p.rot[f"thigh.{l}"] = E(-45 + 10 * math.sin(w + ph))
                p.rot[f"foot.{l}"] = E(-30)
            p.rot["spine.001"] = E(-20)
            return p
        return T, nome == "nadar", f

    if nome in ("escorregar", "deitar"):
        T = 1.2 if nome == "escorregar" else 4.0

        def f(t):
            p = Pose()
            w = 2 * math.pi * t / T
            _deitado(p)
            p.loc["spine.002"] = np.array([0, ctx["deitado_y"], ctx["deitado_z"]])
            if nome == "escorregar":
                for l, ph in (("L", 0), ("R", math.pi)):
                    a = math.sin(w + ph)
                    p.rot[f"fin.{l}"] = ER(35 * a + 20, 25, 0, l)
                    p.rot[f"thigh.{l}"] = E(-40 + 20 * a)
                    p.rot[f"foot.{l}"] = E(-40)
                p.rot["scull"] = E(-82 + 40 - 8, 0, 6 * math.sin(w))
            else:
                resp = math.sin(w)
                p.rot["spine.005"] = E(-8)
                p.rot["scull"] = E(-82 + 50)
                p.esc["spine.003"] = 1 + 0.015 * resp
                for l in "LR":
                    p.rot[f"fin.{l}"] = ER(10, 12, 0, l)
                    p.rot[f"thigh.{l}"] = E(-40)
                    p.rot[f"foot.{l}"] = E(-40)
            return p
        return T, True, f

    if nome == "bater_asas":
        T = 1.2

        def f(t):
            p = Pose()
            w = 2 * math.pi * 3 * t / T
            s = tr(t, [(0, 0), (0.15 * T, 1), (0.85 * T, 1), (T, 0)])
            nadadeiras(p, (35 + 30 * math.sin(w)) * s, 0)
            p.rot["spine.004"] = E(-6 * s)
            p.rot["scull"] = E(-10 * s + 3 * math.sin(w))
            p.loc["spine.002"] = np.array([0, 0, 0.006 * alt * math.sin(w) * s])
            pes4_ping(p)
            return p
        return T, True, f

    if nome == "arrumar":
        T = 3.0

        def f(t):
            p = Pose()
            s = tr(t, [(0, 0), (0.18 * T, 1), (0.75 * T, 1), (0.9 * T, 0)])
            bic = 5 * math.sin(2 * math.pi * 6 * t) * s
            p.rot["spine.004"] = E(8 * s, 0, 15 * s)
            p.rot["spine.005"] = E(30 * s, 0, 40 * s)
            p.rot["scull"] = E(35 * s + bic, -15 * s, 25 * s)
            p.rot["fin.L"] = ER(0, 30 * s, 0, "L")
            pes4_ping(p)
            return p
        return T, True, f

    if nome == "chamar":
        T = 3.0

        def f(t):
            p = Pose()
            s = tr(t, [(0, 0), (0.25 * T, 1), (0.75 * T, 1), (T, 0)])
            vib = 3 * math.sin(2 * math.pi * 7 * t) * s
            p.rot["spine.003"] = E(-6 * s)
            p.rot["spine.004"] = E(-10 * s)
            p.rot["spine.005"] = E(-35 * s)
            p.rot["scull"] = E(-45 * s + vib)
            for l in "LR":
                p.rot[f"fin.{l}"] = ER(30 * s, 28 * s + vib, 0, l)
            pes4_ping(p)
            return p
        return T, True, f

    if nome == "pular":
        T = 0.8

        def f(t):
            u = t / T
            p = Pose()
            agacha = tr(u, [(0, 0), (0.2, 1), (0.32, 0), (0.75, 0), (0.85, 0.8), (1, 0)])
            ar = math.sin(math.pi * (u - 0.3) / 0.45) if 0.3 < u < 0.75 else 0.0
            p.loc["spine.002"] = np.array([0, 0, -0.18 * hq * agacha + 0.25 * hq * ar])
            w = tr(u, [(0, 1), (0.3, 1), (0.36, 0), (0.7, 0), (0.76, 1), (1, 1)])
            pes4_ping(p, w)
            nadadeiras(p, 20 + 25 * ar, 0)
            p.rot["scull"] = E(8 * agacha - 6 * ar)
            return p
        return T, True, f

    raise KeyError(nome)


def pes4_ping(p, w=1.0):
    for l in "LR":
        p.ik["pe." + l] = np.zeros(3)
        p.ikw["pe." + l] = w
