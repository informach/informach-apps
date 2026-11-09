"""Corpos dos bichos urbanos: proporções, cores, peças novas e ossos extras, a partir dos três bichos do pacote Animals.

- Aves (base Chicken_001): galinha, pombo (cinza e claro), pato, gaivota e pardal. Asas abertas com penas próprias:
  cada asa ganha 6 ossos de pena (pena1..pena6) presos aos ossos da asa; dobradas, as penas ficam deitadas no lado do
  corpo, apontando para trás; abertas, giram e formam a superfície da asa.
- Pinguim (base Pinguin_001).
- Roedores e afins (base Kitty_001): esquilo, coelho, rato e tartaruga (casco por cima do corpo).
"""
import math

import numpy as np

import bichos_urbano_rig as U
from bichos_urbano_rig import B, E, cor

GRUPOS = {
    "Chicken_001": {
        "tronco": ["spine.002", "spine.003", "spine.004"],
        "pescoco": ["spine.005", "spine.006", "spine.007"],
        "cabeca": ["scull", "scull_end"],
        "cauda": ["spine.001", "spine", "spine_end"],
        "asas": [f"{b}.{s}" for b in ("shoulder", "Wing", "Wing.001", "Wing.002", "Wing.002") for s in "LR"]
        + ["Wing.002.L_end", "Wing.002.R_end"],
        "bracos": ["Wing.L", "Wing.R", "Wing.001.L", "Wing.001.R"],
        "maos": ["Wing.002.L", "Wing.002.R", "Wing.002.L_end", "Wing.002.R_end"],
        "coxas": ["thigh.L", "thigh.R"], "canelas": ["shin.L", "shin.R"], "pes": ["foot.L", "foot.R"],
        "dedos": ["toe.L", "toe.R", "toe.L_end", "toe.R_end"],
    },
    "Pinguin_001": {
        "tronco": ["spine.002", "spine.003", "spine.004"],
        "pescoco": ["spine.005"], "cabeca": ["scull"], "cauda": ["spine.001", "spine"],
        "nadadeiras": [f"{b}.{s}" for b in ("fin", "fin.001", "fin.002") for s in "LR"],
        "pernas": [f"{b}.{s}" for b in ("thigh", "shin") for s in "LR"], "pes": ["foot.L", "foot.R"],
    },
    "Kitty_001": {
        "tronco": ["spine.005", "spine.006", "spine.007"],
        "pescoco": ["spine.008"], "cabeca": ["scull", "jaw"], "orelhas": ["ear.L", "ear.R"],
        "cauda": ["spine.004", "spine.003", "spine.002", "spine.001", "spine"],
        "quadris": ["shoulder.L", "shoulder.R"],
        "pernas_tras": [f"{b}.{s}" for b in ("shoulder", "thigh", "shin", "foot") for s in "LR"],
        "dedos": ["toe.L", "toe.R"],
        "ombros": ["front_shoulder.L", "front_shoulder.R"],
        "pernas_frente": [f"{b}.{s}" for b in ("front_shoulder", "front_thigh", "front_shin") for s in "LR"],
        "maos": ["front_foot.L", "front_foot.R"],
    },
}
for g in GRUPOS.values():
    if "coxas" in g:
        g["pernas"] = g["coxas"] + g["canelas"] + g["pes"]

PES = {"Chicken_001": ["toe.L", "toe.R"], "Pinguin_001": ["foot.L", "foot.R"], "Kitty_001": ["toe.L", "toe.R", "front_foot.L", "front_foot.R"]}
QUADRIL = {"Chicken_001": "spine.002", "Pinguin_001": "spine.002", "Kitty_001": "spine.005"}


def _ossos(base, nomes):
    return np.isin(base.Fdomn, nomes)


# ---------------------------------------------------------------- zonas (máscaras de faces)
def zona(base, Vf, Nf, nome):
    """Máscara de faces por nome. Vf, Nf: centro e normal de cada face na forma final."""
    d = base.Fdomn
    n = base.nome_pac
    if n == "Chicken_001":
        if nome == "cabeca":
            return d == "scull"
        if nome == "pescoco":
            return np.isin(d, ["spine.005", "spine.006", "spine.007"])
        if nome == "pescoco_alto":
            return np.isin(d, ["spine.006", "spine.007"])
        if nome == "anel":  # colar fino no meio do pescoço
            return d == "spine.006"
        if nome == "peito":
            return np.isin(d, ["spine.004", "spine.005", "spine.003"]) & (Nf[:, 1] < -0.3) & (Nf[:, 2] < 0.6)
        if nome == "barriga":
            return np.isin(d, ["spine.002", "spine.003", "spine.004", "spine.001"]) & (Nf[:, 2] < -0.35)
        if nome == "costas":
            return np.isin(d, ["spine.002", "spine.003", "spine.004", "spine.001"]) & (Nf[:, 2] > 0.45)
        if nome == "asa":
            return np.isin(d, [f"{b}.{s}" for b in ("Wing", "Wing.001", "Wing.002") for s in "LR"])
        if nome == "asa_ponta":
            return np.isin(d, ["Wing.002.L", "Wing.002.R"])
        if nome == "barras":  # duas faixas escuras de través na asa dobrada (pombo)
            asa = np.isin(d, [f"{b}.{s}" for b in ("Wing", "Wing.001", "Wing.002") for s in "LR"])
            y = Vf[:, 1]
            ya, yb = y[asa].min(), y[asa].max()
            t = (y - ya) / max(yb - ya, 1e-6)
            return asa & (((t > 0.42) & (t < 0.52)) | ((t > 0.62) & (t < 0.72))) & (np.abs(Nf[:, 0]) > 0.3)
        if nome == "cauda":
            return np.isin(d, ["spine.001", "spine"])
        if nome == "cauda_ponta":
            return d == "spine"
    if n == "Kitty_001":
        if nome == "barriga":
            return np.isin(d, ["spine.005", "spine.006", "spine.007", "spine.008"]) & (Nf[:, 2] < -0.3)
        if nome == "peito":
            return np.isin(d, ["spine.007", "spine.008", "jaw"]) & ((Nf[:, 1] < -0.4) | (Nf[:, 2] < -0.3))
        if nome == "focinho_baixo":
            return (d == "jaw") | ((d == "scull") & (Nf[:, 2] < -0.3))
        if nome == "cauda":
            return np.isin(d, GRUPOS[n]["cauda"])
        if nome == "patas":
            return np.isin(d, ["toe.L", "toe.R", "front_foot.L", "front_foot.R"])
        if nome == "costas":
            return np.isin(d, ["spine.005", "spine.006", "spine.007"]) & (Nf[:, 2] > 0.5)
    if n == "Pinguin_001":
        if nome == "faixa":  # faixa preta no peito (pinguim-de-magalhães)
            return np.zeros(len(d), bool)
    raise KeyError(nome)


# ---------------------------------------------------------------- deformação comum
def corpo_base(base, cfg):
    G = GRUPOS[base.nome_pac]
    S, Q = U.fatores(base, cfg, G)
    esc = cfg.get("escala", 1.0)
    H2, R2, L2 = U.monta(base, S, Q, esc)
    V = B.deforma(base, S, H2, R2)
    pes = np.isin(base.dom, [base.idx[n] for n in PES[base.nome_pac]])
    sobe = -V[pes, 2].min() + cfg.get("chao", 0.0)
    H2, R2, L2 = U.monta(base, S, Q, esc, sobe=sobe)
    V = B.deforma(base, S, H2, R2)
    iq = base.idx[QUADRIL[base.nome_pac]]
    kq = (H2[iq, 2]) / max(base.H[iq, 2], 1e-6)
    return S, Q, H2, R2, L2, V, kq


def fofo(base, V, F, quanto, esc):
    N = B.normais_vertice(V, F)
    amt = np.zeros(len(V))
    for nome, a in quanto.items():
        for osso in [n for n in base.nomes if n == nome or n.startswith(nome + ".")]:
            amt += base.W[:, base.idx[osso]] * a
    return V + N * (amt * esc)[:, None]


def vertices_da_classe(base, cls):
    return sorted({v for i in range(len(base.F)) if base.Fcls[i] in cls for v in base.F[i]})


def cores_faces(base, V, cfg, pad):
    cores = dict(pad)
    cores.update(cfg["cores"])
    Vf = np.array([V[f].mean(0) for f in base.F])
    Nf = np.array([np.cross(V[f[1]] - V[f[0]], V[f[2]] - V[f[0]]) for f in base.F])
    Nf /= np.linalg.norm(Nf, axis=1, keepdims=True) + 1e-12
    Fcol = [cor(cores.get(c, "#ff00ff")) for c in base.Fcls]
    base_cls = cfg.get("zonas_classes", None)
    for nz, cz in cfg.get("zonas", []):
        m = nz(base, Vf, Nf) if callable(nz) else zona(base, Vf, Nf, nz)
        for i in np.nonzero(m)[0]:
            if base_cls is None or base.Fcls[i] in base_cls:
                Fcol[i] = cor(cz)
    # sombra suave de cima para baixo (as faces de baixo um pouco mais escuras), como a sombra pintada dos de hoje
    for i in range(len(Fcol)):
        Fcol[i] = np.clip(Fcol[i] * (0.9 + 0.1 * (Nf[i, 2] + 1) / 2 + 0.02), 0, 1)
    return Fcol, Vf, Nf


# ---------------------------------------------------------------- aves
def ave(base, cfg):
    esc = cfg["escala"]
    S, Q, H2, R2, L2, V, kq = corpo_base(base, cfg)
    I = base.idx
    Fkeep = list(range(len(base.F)))
    # bico: comprimento, largura e altura em volta da base
    bv = vertices_da_classe(base, ["bico"])
    if cfg.get("bico"):
        kb = cfg["bico"]
        p0 = V[bv]
        b0 = np.array([p0[:, 0].mean(), p0[:, 1].max(), np.median(p0[:, 2])])
        rel = V[bv] - b0
        rel[:, 1] *= kb.get("comp", 1.0)
        rel[:, 0] *= kb.get("larg", 1.0)
        rel[:, 2] *= kb.get("alt", 1.0)
        rel[:, 2] += rel[:, 1] * kb.get("curva", 0.0)  # ponta para baixo (gaivota) ou para cima
        V[bv] = b0 + rel
    # crista e barbela: fora (ilhas separadas) ou recolhidas para dentro da cabeça
    if not cfg.get("crista", False):
        ilha = base.ilhas()
        cr = np.array([c == "crista" for c in base.Fcls])
        fora = set()
        for il in set(ilha[cr]):
            m = ilha == il
            if cr[m].all():
                fora |= set(np.nonzero(m)[0])
        Fkeep = [i for i in Fkeep if i not in fora]
        resto = vertices_da_classe(base, ["crista"])
        if resto:
            ic = I["scull"]
            cen = H2[ic] + R2[ic][:, 1] * L2[ic] * 0.3
            so_crista = [v for v in resto if all(base.Fcls[i] == "crista" for i in range(len(base.F)) if v in base.F[i])]
            V[so_crista] = cen + (V[so_crista] - cen) * 0.35
    if cfg.get("fofo"):
        V = fofo(base, V, base.F, cfg["fofo"], esc)
    pad = {"pena": "#8a8f9a", "crista": "#e8443a", "bico": "#3a3436", "pe": "#d8707a", "olho": "#1a1214"}
    cfg2 = dict(cfg)
    if not cfg.get("crista", False):
        cfg2["cores"] = dict(cfg["cores"], crista=cfg["cores"].get("pena"))
    Fcol, Vf, Nf = cores_faces(base, V, cfg2, pad)
    ex = U.Pecas()
    extras = []
    cores = dict(pad, **cfg["cores"])
    # ---- penas das asas: ossos próprios
    pa = cfg.get("penas", {})
    if pa is not None:
        corda = pa.get("corda", 0.11) * esc  # comprimento da pena mais longa
        lugares = [("Wing", 0.35, 0.72), ("Wing", 0.9, 0.78), ("Wing.001", 0.5, 0.85), ("Wing.002", 0.05, 0.92),
                   ("Wing.002", 0.5, 1.0), ("Wing.002", 1.0, 1.05)]
        lugares = pa.get("lugares", lugares)
        cor_p = [cores.get(c, c) for c in pa.get("cores", ["pena"] * 6)]
        Vn_c = np.array([V[f].mean(0) for f in base.F])
        Vn_n = np.array([np.cross(V[f[1]] - V[f[0]], V[f[2]] - V[f[0]]) for f in base.F])
        Vn_n /= np.linalg.norm(Vn_n, axis=1, keepdims=True) + 1e-12
        for lado, sx in (("L", 1), ("R", -1)):
            asa = [I[f"{b}.{lado}"] for b in ("Wing", "Wing.001", "Wing.002")]
            pele_asa = np.isin(base.dom, asa + [I[f"shoulder.{lado}"]])
            # comprimento acumulado da asa aberta (para a largura de cada pena cobrir o vão até a vizinha)
            ac = {}
            tot = 0.0
            for b in ("Wing", "Wing.001", "Wing.002"):
                ac[b] = tot
                tot += L2[I[f"{b}.{lado}"]]
            spans = [ac[b] + L2[I[f"{b}.{lado}"]] * t for b, t, _ in lugares]
            for k, (b, t, kc) in enumerate(lugares):
                ib = I[f"{b}.{lado}"]
                p = H2[ib] + R2[ib][:, 1] * L2[ib] * t
                # deitada no lado do corpo: a base logo acima da pele, a ponta convergindo para trás (sobre a cauda)
                def sup(pp, raio_y=0.012, raio_z=0.02):
                    perto = (np.abs(V[:, 1] - pp[1]) < raio_y * esc / 0.6) & (np.abs(V[:, 2] - pp[2]) < raio_z * esc / 0.6)
                    xs = V[perto, 0] * sx
                    return xs.max() if len(xs) else 0.0
                comp = corda * kc
                # as de dentro (secundárias) ficam escondidas sob a asa dobrada; as primárias deitam por cima, até a cauda
                nesc = pa.get("escondidas", 3)
                folga = (-0.009 if k < nesc else 0.0015 + 0.0012 * (len(lugares) - k)) * esc / 0.6
                p = np.array([sx * (sup(p) + folga), p[1], p[2] + pa.get("sobe", 0.0) * esc])
                tip = np.array([0.0, p[1] + comp * 0.97, p[2] - comp * pa.get("caida", 0.18)])
                tip[0] = sx * max(sup(tip) + folga, 0.006 * esc / 0.6)
                vy = (tip - p) / np.linalg.norm(tip - p)
                # a pena fica tangente à pele (normal média da pele perto do meio dela)
                meio = p * 0.6 + tip * 0.4
                perto = np.linalg.norm(Vn_c - meio, axis=1) < 0.03 * esc / 0.6
                perto &= (Vn_c[:, 0] * sx > 0)
                vx = Vn_n[perto].sum(0) if perto.any() else np.array([sx, 0, 0.0])
                vx = np.array([vx[0], 0.3 * vx[1], vx[2]])
                if k < nesc or vx[0] * sx < 0.3:
                    vx = np.array([sx, 0, 0.25])
                vx = vx - vy * (vx @ vy)
                vx /= np.linalg.norm(vx)
                vz = np.cross(vx, vy)
                Rf = np.c_[vx, vy, vz]
                if np.linalg.det(Rf) < 0:
                    Rf = np.c_[vx, vy, -vz]
                viz = [abs(spans[k] - spans[j]) for j in (k - 1, k + 1) if 0 <= j < len(spans)]
                larg = max(viz) * 1.8 + 0.01 * esc  # aberta
                larg0 = pa.get("larg0", 0.045) * esc * (0.6 if k < nesc else 1.0)  # dobrada: estreita, deitada no corpo
                nome = f"pena{k + 1}.{lado}"
                extras.append(dict(nome=nome, pai=f"{b}.{lado}", H=p, R=Rf, L=comp, kw=larg / larg0))
                pts, fs, fr = B.folha(p, Rf[:, 2], Rf[:, 1], larg0, comp, 0.003 * esc, "caida")
                ex.add(pts, fs, cor(cor_p[k]), nome)
    # ---- bico de pato: espátula achatada por cima do bico
    if cfg.get("bico_pato"):
        bp = cfg["bico_pato"]
        p0 = V[bv]
        b0 = np.array([0.0, p0[:, 1].max(), p0[:, 2].mean()])
        comp, larg, alt = bp["comp"] * esc, bp["larg"] * esc, bp["alt"] * esc
        V[bv] = b0 + (V[bv] - b0) * 0.5  # o bico da galinha some dentro
        curva, raios = [], []
        for k in range(6):
            t = k / 5
            curva.append(b0 + np.array([0, -comp * t + 0.004 * esc, -alt * 0.3 * t]))
            raios.append(1.0)
        pts = []
        fs = []
        perfil = [(1.0, 0.0), (0.7, 0.8), (0.0, 1.0), (-0.7, 0.8), (-1.0, 0.0), (-0.7, -0.6), (0.0, -0.75), (0.7, -0.6)]
        m = len(perfil)
        for k, c in enumerate(curva):
            t = k / 5
            w = larg * (0.75 + 0.35 * math.sin(math.pi * min(t * 1.4, 1)) ) * (1 - 0.25 * t ** 3) / 2
            h = alt * (1 - 0.55 * t) / 2
            for a, bb in perfil:
                pts.append(c + np.array([a * w, 0, bb * h]))
        for k in range(5):
            for j in range(m):
                a, b2 = k * m + j, k * m + (j + 1) % m
                fs.append([a, b2, b2 + m, a + m])
        fs.append(list(reversed(range(m))))
        fs.append([5 * m + j for j in range(m)])
        ex.add(pts, fs, cor(cores["bico"]), "scull")
    # ---- cauda em leque (pombo, gaivota, pardal): placa achatada presa aos ossos da cauda
    if cfg.get("leque"):
        lq = cfg["leque"]
        i1, i2 = I["spine.001"], I["spine"]
        a = H2[i1]
        dirc = R2[i1][:, 1]
        dirc = np.array([0, dirc[1], dirc[2] * lq.get("ergue", 1.0)])
        dirc /= np.linalg.norm(dirc)
        comp, larg = lq["comp"] * esc, lq["larg"] * esc
        lado = np.array([1.0, 0, 0])
        cima = np.cross(dirc, lado)
        if cima[2] < 0:
            cima = -cima
        cont = [(-0.25, 0.0), (-0.5, 0.75), (-0.42, 1.0), (0.0, 1.04), (0.42, 1.0), (0.5, 0.75), (0.25, 0.0)]
        pts = []
        for s_ in (1, -1):
            for u, v in cont:
                pts.append(a + dirc * (v * comp + lq.get("recuo", 0.0) * esc) + lado * u * larg + cima * (s_ * 0.003 * esc + lq.get("sobe", 0.0) * esc))
        m = len(cont)
        fs = [list(range(m)), list(reversed(range(m, 2 * m)))]
        for k in range(m - 1):
            fs.append([k + 1, k, m + k, m + k + 1])
        fs.append([0, m - 1, 2 * m - 1, m])
        cl = [cor(cores.get(lq.get("cor", "pena"), lq.get("cor", "pena")))] * len(fs)
        if lq.get("ponta"):
            pass

        def peso(p):
            t = np.clip(((p - a) @ dirc) / comp, 0, 1)
            return {"spine.001": 1 - t, "spine": t} if t > 0.02 else "spine.001"
        ex.add(pts, fs, cl, peso)
        if lq.get("faixa"):  # faixa escura na ponta do leque
            pts2 = []
            for s_ in (1, -1):
                for u, v in [(-0.5, 0.78), (-0.42, 1.0), (0.0, 1.04), (0.42, 1.0), (0.5, 0.78)]:
                    pts2.append(a + dirc * (v * comp + lq.get("recuo", 0.0) * esc + 0.001) + lado * u * larg * 1.01
                                + cima * (s_ * 0.0045 * esc + lq.get("sobe", 0.0) * esc))
            m2 = 5
            fs2 = [list(range(m2)), list(reversed(range(m2, 2 * m2)))]
            for k in range(m2 - 1):
                fs2.append([k + 1, k, m2 + k, m2 + k + 1])
            fs2.append([0, m2 - 1, 2 * m2 - 1, m2])
            ex.add(pts2, fs2, cor(cores.get(lq["faixa"], lq["faixa"])), peso)
    # ---- olhos (anel claro e pupila) para quem tem olho colorido
    rig = U.Rig(base, H2, R2, L2, V, Fkeep, Fcol, ex, extras)
    return rig, dict(S=S, kq=kq, esc=esc)


# ---------------------------------------------------------------- roedores e tartaruga (base Kitty_001)
def _peso_cadeia(cadeia, pontos_osso):
    """Peso suave ao longo de uma cadeia de ossos: s em unidades de osso (0 = cabeça do 1º, n = ponta do último)."""
    def f(s):
        w = {}
        for k, nm in enumerate(cadeia):
            v = max(0.0, 1 - abs(s - (k + 0.5)))
            if s < 0.5 and k == 0:
                v = 1.0
            if s > len(cadeia) - 0.5 and k == len(cadeia) - 1:
                v = 1.0
            if v > 0:
                w[nm] = v
        tot = sum(w.values())
        return {k: v / tot for k, v in w.items()}
    return f


def _anel(c, eixo, raio_x, raio_z, seg, ref=None):
    eixo = eixo / np.linalg.norm(eixo)
    ref = np.array([1.0, 0, 0]) if ref is None else ref
    u = ref - eixo * (ref @ eixo)
    u /= np.linalg.norm(u)
    w = np.cross(eixo, u)
    return [c + u * raio_x * math.cos(2 * math.pi * k / seg) + w * raio_z * math.sin(2 * math.pi * k / seg) for k in range(seg)]


def tubo_pesado(ex, centros, raios, pesos, cor_, seg=8, achata=1.0):
    """Tubo por anéis (centros, raios), cada anel com o seu peso; tampas nas pontas."""
    pts, fs, pw = [], [], []
    n = len(centros)
    for k in range(n):
        t = centros[min(k + 1, n - 1)] - centros[max(k - 1, 0)]
        anel = _anel(centros[k], t, raios[k], raios[k] * achata, seg)
        pts += anel
        pw += [pesos[k]] * seg
    for k in range(n - 1):
        for j in range(seg):
            a, b = k * seg + j, k * seg + (j + 1) % seg
            fs.append([a, b, b + seg, a + seg])
    fs.append(list(reversed(range(seg))))
    fs.append([(n - 1) * seg + j for j in range(seg)])
    o = len(ex.V)
    ex.V += [np.array(p, float) for p in pts]
    ex.F += [[o + k for k in f] for f in fs]
    ex.Fcor += [np.array(cor_, float)] * len(fs) if not isinstance(cor_, list) else cor_
    ex.pesos += [dict(w) for w in pw]


def quadrupede(base, cfg):
    esc = cfg["escala"]
    S, Q, H2, R2, L2, V, kq = corpo_base(base, cfg)
    I = base.idx
    Fkeep = list(range(len(base.F)))
    iH, iJ = I["scull"], I["jaw"]
    cab = base.W[:, iH] + base.W[:, iJ]
    olho_v = vertices_da_classe(base, ["olho", "pupila"])
    olho_y = V[olho_v, 1].mean()
    nariz_v = vertices_da_classe(base, ["nariz"])
    # focinho: à frente dos olhos a cabeça encolhe ou cresce (e afina para a ponta)
    k = cfg.get("focinho", 1.0)
    kw = cfg.get("focinho_larg", 1.0)
    f = -(V[:, 1] - olho_y)
    m = (f > 0) & (cab > 0.3)
    if m.any():
        fmax = f[m].max()
        zc = V[nariz_v, 2].mean() if nariz_v else V[m, 2].mean()
        tt = np.clip(f / fmax, 0, 1)
        V[m, 1] = olho_y - (olho_y - V[m, 1]) * (1 + (k - 1) * cab[m])
        V[m, 0] *= 1 + (kw - 1) * tt[m]
        V[m, 2] = zc + (V[m, 2] - zc) * (1 + (kw - 1) * 0.6 * tt[m])
    if cfg.get("olho_menor"):  # olho de conta: a íris do gato encolhe em volta do centro de cada olho
        so_olho = [v for v in olho_v if all(base.Fcls[i] in ("olho", "pupila") for i in range(len(base.F)) if v in base.F[i])]
        for sx in (1, -1):
            lado = [v for v in olho_v if V[v, 0] * sx > 0]
            if lado:
                c0 = V[lado].mean(0)
                mv = [v for v in lado if v in so_olho]
                V[mv] = c0 + (V[mv] - c0) * cfg["olho_menor"]
    if cfg.get("cabeca_cresce"):  # cabeça mais redonda (coelho, esquilo): incha em volta do centro
        c0 = H2[iH] + R2[iH][:, 1] * L2[iH] * 0.2
        V += (V - c0) * (cfg["cabeca_cresce"] * cab)[:, None]
    if cfg.get("fofo"):
        V = fofo(base, V, base.F, cfg["fofo"], esc)
    # orelhas e cauda trocadas: as do gato se recolhem para a base
    recolhe = []
    if cfg.get("orelha"):
        recolhe += ["ear.L", "ear.R"]
    if cfg.get("cauda", {}).get("recolhe"):
        recolhe += GRUPOS[base.nome_pac]["cauda"]
    for nome in recolhe:
        i = I[nome]
        w = base.W[:, i]
        mm = w > 0
        alvo = H2[I["spine.004"]] if nome.startswith("spine") else H2[i]
        V[mm] = V[mm] - (w[mm, None] * 0.92) * (V[mm] - alvo)
    pad = {"pelo": "#8a6a50", "branco": "#f2ece2", "olho": "#1a1214", "pupila": "#0c0a0a", "nariz": "#e8909a",
           "boca": "#c86a72", "cinza": "#1a1214", "claro": "#f4f0ea", "orelha": "#f0b0b8"}
    Fcol, Vf, Nf = cores_faces(base, V, cfg, pad)
    cores = dict(pad, **cfg["cores"])
    ex = U.Pecas()
    extras = []
    # ---- orelhas novas
    ore = cfg.get("orelha")
    if ore:
        for lado, sx in (("L", 1), ("R", -1)):
            i = I["ear." + lado]
            h = H2[i] + np.array([sx * ore.get("fora", 0.0), ore.get("tras", 0.0), ore.get("desce", 0.0)]) * esc
            larg, comp = ore["larg"] * esc, ore["comp"] * esc
            v = np.array([sx * ore.get("abre", 0.25), ore.get("inclina", 0.25), 1.0])
            u = np.array([1.0, -0.15, -0.3 * sx])
            u = u - v * (u @ v) / (v @ v)
            pts, fs, fr = B.folha(h, u, v, larg, comp, ore.get("esp", 0.01) * esc, "caida")
            ex.add(pts, fs, [cor(cores["orelha"]) if q else cor(cores.get("orelha_fora", cores["pelo"])) for q in fr],
                   "ear." + lado)
    # ---- caudas
    cau = cfg.get("cauda") or {}
    cadeia = GRUPOS[base.nome_pac]["cauda"]
    if cau.get("tipo") in ("fofa", "fina"):
        ids = [I[n] for n in cadeia]
        pts_c = [H2[i] for i in ids] + [H2[ids[-1]] + R2[ids[-1]][:, 1] * L2[ids[-1]]]
        # reamostra com mais anéis
        nring = cau.get("aneis", 11)
        segs = [np.linalg.norm(pts_c[j + 1] - pts_c[j]) for j in range(len(pts_c) - 1)]
        acum = np.r_[0, np.cumsum(segs)]
        centros, raios, pesos = [], [], []
        pf = _peso_cadeia(cadeia, None)
        for kk in range(nring):
            t = kk / (nring - 1)
            d = t * acum[-1]
            j = min(np.searchsorted(acum, d, side="right") - 1, len(segs) - 1)
            u = (d - acum[j]) / segs[j]
            c = pts_c[j] * (1 - u) + pts_c[j + 1] * u
            c = c + np.array([0, cau.get("recuo", 0.0) * esc * (1 - t), cau.get("sobe", 0.0) * esc])
            centros.append(c)
            r0 = cau["raio"] * esc
            if cau["tipo"] == "fofa":
                r = r0 * (0.35 + 0.75 * math.sin(math.pi * min(t * 1.15 + 0.08, 1)) ** 0.7)
                if t > 0.92:
                    r *= 0.75
            else:
                r = r0 * (1 - 0.75 * t)
            raios.append(r)
            pesos.append(pf(j + u))
        cl = cor(cores.get(cau.get("cor", "pelo"), cau.get("cor", "pelo")))
        tubo_pesado(ex, centros, raios, pesos, cl, seg=cau.get("seg", 8), achata=cau.get("achata", 1.0))
    elif cau.get("tipo") == "pompom":
        i = I["spine.004"]
        r0 = cau["raio"] * esc
        c = H2[i] + np.array([0, 0.3 * r0, 0.35 * r0])
        pts, fs = B.esfera(c, (r0, r0 * 0.9, r0), sub=1)
        ex.add(pts, fs, cor(cores.get(cau.get("cor", "branco"), cau.get("cor", "branco"))), "spine.004")
    # ---- bigode
    if cfg.get("bigode"):
        nz = V[nariz_v].mean(0)
        bg = cfg["bigode"]
        for sx in (1, -1):
            for kk, dz in enumerate((0.004, -0.002, -0.008)):
                o = nz + np.array([sx * 0.008, 0.012, -0.006 + dz]) * esc / 0.6
                fim = o + np.array([sx * bg, 0.012, dz * 1.5 + 0.006 - 0.006 * kk]) * esc / 0.6
                pts, fs = B.tubo([o, fim], [0.0013 * esc / 0.6, 0.0008 * esc / 0.6], seg=3)
                ex.add(pts, fs, cor(cores.get("bigode", "#f2f2f2")), "scull")
    # ---- dentes da frente (coelho, esquilo, rato)
    if cfg.get("dentes"):
        nz = V[nariz_v].mean(0)
        qx = base.W[:, iJ] > 0.5
        kq = np.argmin(np.where(qx, V[:, 1], 9))
        topo = V[kq]
        for sx in (1, -1):
            c = np.array([sx * 0.0032 * esc / 0.6, topo[1] + 0.003 * esc / 0.6, topo[2] + 0.004 * esc / 0.6])
            pts, fs = B.esfera(c, (0.0032 * esc / 0.6, 0.0018 * esc / 0.6, 0.006 * esc / 0.6), sub=1)
            ex.add(pts, fs, cor("#f8f4ea"), "scull")
    # ---- comida (escondida fora do comer): osso próprio na pata da frente esquerda
    com = cfg.get("comida")
    if com:
        iF = I["front_foot.L"]
        pe = H2[iF]
        c = np.array([0.0, pe[1] - 0.012 * esc / 0.6, pe[2] + com.get("raio", 0.012) * esc])
        Rf = np.eye(3)
        extras.append(dict(nome="comida", pai="front_foot.L", H=c, R=Rf, L=0.02 * esc, escondido=True))
        r = com.get("raio", 0.012) * esc
        if com["tipo"] == "noz":
            pts, fs = B.esfera(c, (r, r, r * 1.15), sub=1)
            ex.add(pts, fs, cor("#b07a3a"), "comida")
            pts, fs = B.esfera(c + np.array([0, 0, r * 0.75]), (r * 1.05, r * 1.05, r * 0.5), sub=1)
            ex.add(pts, fs, cor("#6a4a2a"), "comida")
        elif com["tipo"] == "cenoura":
            pts, fs = B.tubo([c + np.array([0, 0, -r * 1.8]), c + np.array([0, 0, r * 1.6])], [0.0, r * 0.75], seg=6)
            ex.add(pts, fs, cor("#f08a2a"), "comida")
            for kk in range(3):
                a0 = 2 * math.pi * kk / 3
                o = c + np.array([0, 0, r * 1.6])
                pts, fs = B.tubo([o, o + np.array([math.cos(a0) * r * 0.6, math.sin(a0) * r * 0.6, r * 1.5])],
                                 [r * 0.22, r * 0.08], seg=4)
                ex.add(pts, fs, cor("#5aa83a"), "comida")
        elif com["tipo"] == "queijo":
            pts = [c + np.array(p) * r for p in [(-1, -0.8, -0.7), (1, -0.8, -0.7), (0, 1.2, -0.7), (-1, -0.8, 0.7),
                                                   (1, -0.8, 0.7), (0, 1.2, 0.7)]]
            fs = [[0, 2, 1], [3, 4, 5], [0, 1, 4, 3], [1, 2, 5, 4], [2, 0, 3, 5]]
            ex.add(pts, fs, cor("#f2c84a"), "comida")
        elif com["tipo"] == "folha":
            pts, fs, fr = B.folha(c + np.array([0, 0, -r]), np.array([1.0, 0, 0]), np.array([0, -0.3, 1.0]), r * 1.6,
                                  r * 2.6, 0.002 * esc, "caida")
            ex.add(pts, fs, cor("#6abf4a"), "comida")
    # ---- casco (tartaruga): cúpula com placas, preso ao meio do corpo
    cas = cfg.get("casco")
    if cas:
        iB = I["spine.006"]
        c0 = (H2[I["spine.005"]] + H2[I["spine.007"]]) / 2 + np.array([0, cas.get("recuo", 0.0), 0]) * esc
        rx, ry, rz = cas["raios"]
        rx, ry, rz = rx * esc, ry * esc, rz * esc
        z0 = cas["base"] * esc
        nseg, nan = 9, 3
        pts = []
        aneis = []
        for a in range(nan + 1):
            phi = (math.pi / 2) * (a / nan) ** 0.9  # 0 = borda, pi/2 = topo
            r_ = math.cos(phi)
            z = z0 + rz * math.sin(phi)
            if a == nan:
                aneis.append([len(pts)])
                pts.append(np.array([c0[0], c0[1], z]))
                continue
            anel = []
            for s_ in range(nseg):
                th = 2 * math.pi * s_ / nseg
                aba = 1.06 if a == 0 else 1.0
                anel.append(len(pts))
                pts.append(np.array([c0[0] + rx * r_ * math.sin(th) * aba, c0[1] - ry * r_ * math.cos(th) * aba, z]))
            aneis.append(anel)
        fs = []
        for a in range(nan):
            A_, Bn = aneis[a], aneis[a + 1]
            for s_ in range(nseg):
                if len(Bn) == 1:
                    fs.append([A_[s_], A_[(s_ + 1) % nseg], Bn[0]])
                else:
                    fs.append([A_[s_], A_[(s_ + 1) % nseg], Bn[(s_ + 1) % nseg], Bn[s_]])
        borda = aneis[0]
        z_pl = z0 - cas.get("espessura", 0.02) * esc
        o2 = len(pts)
        for s_ in range(nseg):
            p = pts[borda[s_]]
            pts.append(np.array([c0[0] + (p[0] - c0[0]) * 0.86, c0[1] + (p[1] - c0[1]) * 0.86, z_pl]))
        for s_ in range(nseg):
            fs.append([borda[(s_ + 1) % nseg], borda[s_], o2 + s_, o2 + (s_ + 1) % nseg])
        fs.append([o2 + s_ for s_ in reversed(range(nseg))])
        cl = [cor(cores["casco"])] * (len(fs) - nseg - 1) + [cor(cores.get("plastrao", cores["casco"]), 0.9)] * (nseg + 1)
        ex.add(pts, fs, cl, "spine.006")
        # placas: um losango claro em cada face de cima, um pouco para fora
        for fc_ in fs[:len(fs) - nseg - 1]:
            P = np.array([pts[q] for q in fc_])
            cc = P.mean(0)
            nn = np.cross(P[1] - P[0], P[2] - P[0])
            nn /= np.linalg.norm(nn) + 1e-12
            if nn[2] < 0:
                nn = -nn
            Pi = cc + (P - cc) * 0.6 + nn * 0.0025 * esc / 0.6
            ex.add(list(Pi), [list(range(len(fc_)))], cor(cores["placa"]), "spine.006")
    rig = U.Rig(base, H2, R2, L2, V, Fkeep, Fcol, ex, extras)
    return rig, dict(esc=esc, kq=kq)


# ---------------------------------------------------------------- pinguim
def pinguim(base, cfg):
    esc = cfg["escala"]
    S, Q, H2, R2, L2, V, kq = corpo_base(base, cfg)
    pad = {"preto": "#2e3038", "branco": "#f4f1ea", "risca": "#e88a7a"}
    Fcol, Vf, Nf = cores_faces(base, V, cfg, pad)
    d = base.Fdomn
    cores = dict(pad, **cfg["cores"])
    alt = V[:, 2].max()
    # pés rosados escuros; faixa preta no peito e faixa branca na cabeça (pinguim-de-magalhães)
    for i in range(len(base.F)):
        if d[i] in ("foot.L", "foot.R"):
            Fcol[i] = cor(cores.get("pe", "#4a3a3e"))
        z = Vf[i, 2] / alt
        if cfg.get("faixa") and base.Fcls[i] == "branco" and cfg["faixa"][0] < z < cfg["faixa"][1]:
            Fcol[i] = cor(cores["preto"])
    rig = U.Rig(base, H2, R2, L2, V, list(range(len(base.F))), Fcol, U.Pecas(), [])
    return rig, dict(esc=esc, kq=kq)
