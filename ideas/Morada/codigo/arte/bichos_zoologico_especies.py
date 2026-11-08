"""As espécies do zoológico: proporções por osso, peças novas, cores e animações (poses-chave) de cada bicho."""
import copy
import math

import numpy as np

import bichos as B
from bichos_zoologico_base import AX, Bicho, _hex, fatores, mat_quat, monta, rot_eixo

# animações em que o bicho fica no lugar (os pés não podem deslizar)
PARADOS = {"parado", "comer", "beber", "rugir", "chamar", "abrir_boca", "banho", "em_pe"}


def _c(h, k=1.0):
    return np.clip(_hex(h) * k, 0, 1)


def especie(id_):
    b = dict(ESPECIES[id_])
    if "base_de" in b:
        base = dict(ESPECIES[b.pop("base_de")])
        base.update(b)
        b = base
    return b


# ================================================================ forma
def centraliza(bi):
    """Centro do corpo (x, y) na origem (onde fica a raiz) e o ponto mais baixo em z = 0."""
    V = bi.V
    t = np.array([-(V[:, 0].max() + V[:, 0].min()) / 2, -(V[:, 1].max() + V[:, 1].min()) / 2, -V[:, 2].min()])
    ir = bi.idx[bi.esq["raiz"]]
    for i in range(len(bi.nomes)):
        if i != ir:
            bi.H2[i] = bi.H2[i] + t
    bi.V = bi.V + t


def fofo(bi, quanto):
    """Infla a malha pela normal, por osso (o pelo fofo do bichos.py)."""
    N = B.normais_vertice(bi.V, bi.F)
    amt = np.zeros(len(bi.V))
    for nome, a in quanto.items():
        amt += bi.W[:, bi.idx[nome]] * a
    bi.V = bi.V + N * amt[:, None]


def abre_boca(bi, prof=0.55, alt_frente=0.3, alt_tras=0.42, cor_boca="#c8404c", cor_lingua="#e8707a",
              dentes=None, cor_dente="#fbfbf4", larg=0.68, inicio=0.14):
    """Corta a cabeça na linha da boca: as faces de baixo, à frente da dobra, vão para a mandíbula (com vértices
    próprios), a mandíbula passa a girar na dobra, e entra a boca por dentro (céu da boca, língua, laterais, fundo).
    prof: a dobra, do focinho para trás (fração do comprimento da cabeça); alt_*: a altura da linha (fração da altura
    da cabeça) na frente e na dobra. dentes: lista de (posição 0..1 do focinho à dobra, lado ±1, cima/baixo, tamanho)."""
    ih, ij = bi.idx[bi.esq["cabeca"]], bi.idx[bi.esq["mandibula"]]
    nb = len(bi.base.V)
    cab = np.zeros(len(bi.V), bool)
    cab[:nb] = (bi.W[:nb, ih] + bi.W[:nb, ij]) > 0.5
    P = bi.V[cab]
    yf, yb = P[:, 1].min(), P[:, 1].max()
    zb, zt = P[:, 2].min(), P[:, 2].max()
    yh = yf + prof * (yb - yf)

    def linha(y):
        t = np.clip((y - yf) / (yh - yf), 0, 1)
        return zb + (zt - zb) * (alt_frente + (alt_tras - alt_frente) * t)

    nf = len(bi.base.F)
    baixo = np.zeros(len(bi.F), bool)
    for i in range(nf):
        f = bi.F[i]
        if not cab[f].all():
            continue
        c = bi.V[f].mean(0)
        if c[1] < yh and c[2] < linha(c[1]):
            baixo[i] = True
    cima_v = {v for i in range(nf) if not baixo[i] for v in bi.F[i]}
    novo = {}
    for i in np.nonzero(baixo)[0]:
        f = bi.F[i]
        for k, v in enumerate(f):
            if v in cima_v:
                if v not in novo:
                    novo[v] = len(bi.V)
                    bi.V = np.vstack([bi.V, bi.V[v]])
                    bi.W = np.vstack([bi.W, bi.W[v]])
                f[k] = novo[v]
    jv = sorted({v for i in np.nonzero(baixo)[0] for v in bi.F[i]})
    for v in jv:
        t = np.clip((bi.V[v, 1] - yf) / (yh - yf), 0, 1)
        w = 1.0 if t < 0.8 else 1.0 - (t - 0.8) / 0.2 * 0.5
        bi.W[v] = 0
        bi.W[v, ij] = w
        bi.W[v, ih] = 1 - w
    cab = np.append(cab, np.ones(len(bi.V) - len(cab), bool))
    # a mandíbula gira na dobra
    zh = linha(yh)
    dobra = np.array([0, yh, zh])
    queixo = np.array([0, yf, zb])
    y = queixo - dobra
    y /= np.linalg.norm(y)
    x = np.array([1.0, 0, 0])
    bi.H2[ij] = dobra
    bi.R2[ij] = np.stack([x, y, np.cross(x, y)], 1)
    bi.L2[ij] = np.linalg.norm(queixo - dobra)
    # a boca por dentro
    est = []
    for k in range(5):
        t = inicio + (0.96 - inicio) * k / 4
        ys = yf + t * (yh - yf)
        zl = linha(ys)
        perto = cab & (np.abs(bi.V[:, 1] - ys) < 0.12 * (yb - yf)) & (np.abs(bi.V[:, 2] - zl) < 0.15 * (zt - zb))
        w = np.abs(bi.V[perto, 0]).max() * larg if perto.any() else 0.3 * (zt - zb)
        est.append((ys, zl, w))
    eps = 0.03 * (zt - zb)
    pts, pes_ = [], []
    for ys, zl, w in est:
        for sx in (-1, 1):
            pts.append((sx * w, ys + 0.02 * (yb - yf), zl + eps * 0.3))
            pes_.append(bi.esq["cabeca"])
        for sx in (-1, 1):
            pts.append((sx * w * 0.92, ys + 0.02 * (yb - yf), zl - eps))
            pes_.append(bi.esq["mandibula"] if ys < yh - 0.15 * (yh - yf) else {bi.esq["mandibula"]: 0.6, bi.esq["cabeca"]: 0.4})
    fs, cs = [], []
    for k in range(4):
        a, b = 4 * k, 4 * (k + 1)
        fs += [[a, a + 1, b + 1, b], [a + 2, b + 2, b + 3, a + 3], [a, b, b + 2, a + 2], [a + 1, a + 3, b + 3, b + 1]]
        cs += [cor_boca, cor_lingua, cor_boca, cor_boca]
    fs.append([16, 18, 19, 17])
    cs.append(_hex(cor_boca) * 0.6)
    bi.junta(pts, fs, [c if not isinstance(c, str) else c for c in cs], pes_)
    for t, sx, lado, tam in (dentes or []):
        ys = yf + t * (yh - yf)
        zl = linha(ys)
        w = np.interp(ys, [e[0] for e in est], [e[2] for e in est]) * 0.85
        h = tam * (zt - zb)
        base_ = np.array([sx * w, ys + 0.01 * (yb - yf), zl + (eps * 0.3 if lado > 0 else -eps)])
        ponta = base_ + np.array([0, 0, -h if lado > 0 else h])
        r = h * 0.28
        pp = [base_ + np.array([r, 0, 0]), base_ + np.array([-r * 0.5, r * 0.8, 0]), base_ + np.array([-r * 0.5, -r * 0.8, 0]), ponta]
        bi.junta(pp, [[0, 1, 3], [1, 2, 3], [2, 0, 3], [0, 2, 1]], cor_dente,
                 bi.esq["cabeca"] if lado > 0 else bi.esq["mandibula"])
    bi.boca = dict(yf=yf, yh=yh, zb=zb, zt=zt)


# ---------------------------------------------------------------- peças
def ancora(bi, p, k=4):
    """Pesos de um ponto preso à pele: a média dos pesos dos k vértices do bicho mais perto."""
    nb = len(bi.base.V)
    d = np.linalg.norm(bi.V[:nb] - np.asarray(p), axis=1)
    viz = np.argsort(d)[:k]
    w = bi.W[viz].mean(0)
    return {bi.nomes[i]: float(w[i]) for i in np.nonzero(w > 0.02)[0]}


def caixa_osso(bi, ossos, lim=0.5):
    ids = [bi.idx[o] for o in ossos]
    nb = len(bi.base.V)
    m = bi.W[:nb, ids].sum(1) > lim
    P = bi.V[:nb][m]
    return P.min(0), P.max(0), P


def superficie(bi, ossos, y, z, lado):
    """O ponto da pele (dos ossos dados) mais para o lado (lado=±1 em x) perto de (y, z)."""
    mn, mx, P = caixa_osso(bi, ossos)
    tam = (mx - mn).max()
    d = np.hypot(P[:, 1] - y, P[:, 2] - z)
    perto = P[d < 0.12 * tam]
    if not len(perto):
        perto = P[np.argsort(d)[:5]]
    x = (perto[:, 0] * lado).max() * lado
    return np.array([x, y, z])


def olhos(bi, fy, fz, r, cor="#18161a", brilho=True, fx=0.86):
    """Olhos (esferas) na pele da cabeça: fy, fz são frações da caixa da cabeça (y do focinho para trás, z de baixo)."""
    cab = [bi.esq["cabeca"]] + ([bi.esq["mandibula"]] if bi.esq["mandibula"] else [])
    mn, mx, _ = caixa_osso(bi, cab)
    y = mn[1] + fy * (mx[1] - mn[1])
    z = mn[2] + fz * (mx[2] - mn[2])
    tam = (mx - mn).max()
    for lado in (1, -1):
        p = superficie(bi, cab, y, z, lado)
        p[0] *= fx
        pts, fs = B.esfera(p, (r * tam,) * 3, sub=1)
        bi.junta(pts, fs, cor, bi.esq["cabeca"])
        if brilho:
            pts, fs = B.esfera(p + np.array([lado * 0.75, -0.45, 0.4]) * r * tam, (r * tam * 0.32,) * 3, sub=1)
            bi.junta(pts, fs, "#f4f4f4", bi.esq["cabeca"])


def curva_tubo(bi, pontos, r0, r1, cor, pesos, seg=6, n=7, pontuda=True):
    """Tubo afinando por uma curva (pontos de controle, interpolados), com ponta fechada."""
    P = np.array(pontos, float)
    ts = np.linspace(0, 1, len(P))
    tt = np.linspace(0, 1, n)
    curva = np.stack([np.interp(tt, ts, P[:, k]) for k in range(3)], 1)
    raios = [r0 + (r1 - r0) * t for t in tt]
    if pontuda:
        raios[-1] = max(r1 * 0.15, 1e-4)
    pts, fs = B.tubo(curva, raios, seg=seg)
    bi.junta(pts, fs, cor, pesos if not callable(pesos) else [pesos(t) for t in np.repeat(tt, seg)])
    return curva


def tufo(bi, osso_ponta, comp, raio, cor):
    """Tufo na ponta da cauda (cone de pelos) preso ao último osso."""
    i = bi.idx[osso_ponta]
    a = bi.H2[i] + bi.R2[i][:, 1] * bi.L2[i] * 0.6
    d = bi.R2[i][:, 1]
    curva_tubo(bi, [a, a + d * comp * 0.5, a + d * comp], raio * 0.6, raio, cor, osso_ponta, seg=6, n=4)


def crina(bi, ossos, altura, cor, cor2=None, n=14, frente=0.0):
    """Crina em pé no alto do pescoço: uma lâmina sobre a linha do dorso do pescoço (os vértices do meio mais
    altos, em fatias ao longo do pescoço), presa à pele (pesos da pele mais perto)."""
    nb = len(bi.base.V)
    ids = [bi.idx[o] for o in ossos]
    m = bi.W[:nb, ids].sum(1) > 0.5
    P = bi.V[:nb][m]
    a = bi.H2[ids[0]]
    ult = ids[-1]
    z = bi.H2[ult] + bi.R2[ult][:, 1] * bi.L2[ult] * (1 + frente)
    eixo = (z - a) / np.linalg.norm(z - a)
    up = np.array([0, 0, 1.0]) - eixo * eixo[2]
    up /= np.linalg.norm(up)
    larg = np.abs(P[:, 0]).max()
    meio = P[np.abs(P[:, 0]) < 0.3 * larg]
    t = (meio - a) @ eixo
    L = np.linalg.norm(z - a)
    pts, pes_ = [], []
    for k in range(n):
        t0, t1 = L * k / n, L * (k + 1) / n
        sel = meio[(t >= t0) & (t < t1)]
        if not len(sel):
            continue
        topo = sel[np.argmax(sel @ up)]
        topo = np.array([0.0, topo[1], topo[2]])
        h = altura * (0.6 + 0.4 * math.sin(math.pi * min(1, (k + 0.5) / n * 1.2)))
        pts += [topo - up * altura * 0.2, topo + up * h]
        w = ancora(bi, topo)
        pes_ += [w, w]
    fs = [[2 * k, 2 * k + 2, 2 * k + 3, 2 * k + 1] for k in range(len(pts) // 2 - 1)]
    cores = [cor if (cor2 is None or k % 2 == 0) else cor2 for k in range(len(fs))]
    bi.junta(pts, fs, cores, pes_)


def orelha(bi, pos, u, v, larg, comp, cor, cor_dentro, forma="caida", osso=None, esp=0.02):
    if pos[0] < 0:  # do lado direito a frente da folha fica para dentro (espelho): troca as cores
        cor, cor_dentro = cor_dentro, cor
    pts, fs, fr = B.folha(pos, u, v, larg, comp, esp, forma)
    bi.junta(pts, fs, [cor_dentro if q else cor for q in fr], osso or ancora(bi, pos))


# ---------------------------------------------------------------- padrões de pelo
def listras_zebra(bi, sp):
    """Listras pretas perpendiculares a cada osso (verticais no corpo, horizontais nas pernas), barriga branca."""
    base = bi.base
    preto, branco = sp["cores"]["listra"], sp["cores"]["branco"]
    hs = altura_quadril(bi)
    lam = 0.16 * hs / 1.3
    g = base.g
    for i in range(len(base.F)):
        if base.Fcls[i] in ("escuro", "casco", "orelha_dentro", "orelha_dentro2"):
            continue
        f = bi.F[i]
        c = bi.V[f].mean(0)
        o = base.Fosso[i]
        n = base.Fn[i]
        if o in g["tronco"] or o in g["cauda"] or o in g["pelves"] or o in g["ombros"]:
            u = c[1] * 1.0 + 0.35 * (c[2] - hs) * (1 if c[1] > 0 else -1)
            if n[2] < -0.55 and o in g["tronco"]:
                bi.Fcol[i] = _c(branco)
                continue
            fat = 1.0 if c[1] < 0 else 1.25
        elif o in g["pescoco"] or o == bi.esq["cabeca"] or o in g["orelhas"]:
            j = bi.idx[o]
            u = (c - bi.H2[j]) @ bi.R2[j][:, 1] + j * 0.37 * lam
            fat = 0.8
            if o == bi.esq["cabeca"]:
                u = (c - bi.H2[j]) @ bi.R2[j][:, 1] * 1.4
                fat = 0.55
        else:
            u = c[2]
            fat = 0.55 if c[2] < 0.35 * hs else 0.75
        bi.Fcol[i] = _c(preto) if math.sin(2 * math.pi * u / (lam * fat)) > 0.1 else _c(branco)
    # focinho preto
    m = mascara_face_focinho(bi, 0.72)
    for i in np.nonzero(m)[0]:
        bi.Fcol[i] = _c(sp["cores"].get("focinho_z", "#2a2628"))


def mascara_face_focinho(bi, pct):
    base = bi.base
    ih = bi.idx[bi.esq["cabeca"]]
    d = bi.R2[ih][:, 1].copy()
    d[0] = 0
    d /= np.linalg.norm(d)
    cab = np.array([o == bi.esq["cabeca"] for o in base.Fosso])
    pr = np.array([(bi.V[f].mean(0) - bi.H2[ih]) @ d for f in bi.F[:len(base.F)]])
    lim = np.percentile(pr[cab], pct * 100) if cab.any() else 1e9
    return cab & (pr > lim)


def manchas_girafa(bi, sp):
    """Manchas poligonais (Voronoi nos centros das faces) separadas por linhas claras; pernas de baixo sem manchas."""
    base = bi.base
    g = base.g
    rng = np.random.default_rng(7)
    nf = len(base.F)
    C = np.array([bi.V[f].mean(0) for f in bi.F[:nf]])
    hs = altura_quadril(bi)
    raio = np.full(nf, 0.36 * hs / 3.0)
    sem = np.zeros(nf, bool)
    for i in range(nf):
        o = base.Fosso[i]
        if o in g["pescoco"]:
            raio[i] *= 0.75
        elif o == bi.esq["cabeca"] or o in g["orelhas"]:
            raio[i] *= 0.35
        elif o in g["canelas"] + g["antebracos"] + g["pes"] + g["maos"] + g["patas"]:
            sem[i] = True
        elif o in g["coxas"] + g["bracos"]:
            raio[i] *= 0.7
        if base.Fcls[i] in ("escuro", "casco", "orelha_dentro", "orelha_dentro2"):
            sem[i] = True
    ordem = rng.permutation(nf)
    sem_idx = []
    for i in ordem:
        if sem[i]:
            continue
        if not sem_idx or np.min(np.linalg.norm(C[sem_idx] - C[i], axis=1)) > raio[i]:
            sem_idx.append(i)
    Sd = C[sem_idx]
    tons = [sp["cores"]["mancha"], sp["cores"].get("mancha2", sp["cores"]["mancha"])]
    for i in range(nf):
        if sem[i] or base.Fcls[i] in ("escuro", "casco", "orelha_dentro", "orelha_dentro2"):
            continue
        d = np.linalg.norm(Sd - C[i], axis=1)
        a, b = np.argsort(d)[:2]
        borda = (d[b] - d[a]) < 0.34 * raio[i]
        if base.Fn[i][2] < -0.6 and base.Fosso[i] in g["tronco"]:
            borda = True
        bi.Fcol[i] = _c(sp["cores"]["linha"]) if borda else _c(tons[a % 2])


def pinta(bi, sp):
    base = bi.base
    cores = sp["cores"]
    for i in range(len(base.F)):
        cl = base.Fcls[i]
        bi.Fcol[i] = _c(cores.get(cl) or cores.get("pelo"))
    if sp.get("padrao"):
        sp["padrao"](bi, sp)
    for zona, cor in sp.get("zonas", []):
        m = zona(bi)
        for i in np.nonzero(m)[0]:
            bi.Fcol[i] = _c(cor) if isinstance(cor, str) else cor(bi, i)


def faz(base, id_, sp):
    if sp.get("tirar") or sp.get("subdividir"):
        base = copy.copy(base)
        if sp.get("tirar"):
            base.sem_faces(np.isin(base.Fcls, sp["tirar"]))
        if sp.get("subdividir"):
            base.subdivide(tri=True)
    S = fatores(base, sp)
    H2, R2, L2 = monta(base, S, sp.get("giros"), sp.get("direcoes"))
    V2 = B.deforma(base, S, H2, R2)
    bi = Bicho(base, sp, S, H2, R2, L2, V2)
    if sp.get("neutro_descanso"):
        bi.neutro_q[:] = [1, 0, 0, 0]
        bi.neutro_t[:] = 0
    for nome in sp.get("recolhe", []):  # peças do pacote que somem para dentro (orelhas trocadas...)
        i = bi.idx[nome]
        w = bi.W[:, i]
        m = w > 0
        bi.V[m] = bi.V[m] - (w[m, None] * 0.92) * (bi.V[m] - bi.H2[i])
    centraliza(bi)
    if sp.get("fofo"):
        fofo(bi, sp["fofo"])
    if sp.get("forma"):
        sp["forma"](bi)
    pinta(bi, sp)
    if sp.get("boca"):
        abre_boca(bi, **sp["boca"])
    if sp.get("pecas"):
        sp["pecas"](bi)
    zmin = bi.V[:, 2].min()
    if zmin < 0:
        ir = bi.idx[bi.esq["raiz"]]
        for i in range(len(bi.nomes)):
            if i != ir:
                bi.H2[i, 2] -= zmin
        bi.V[:, 2] -= zmin
    return bi


def pes(bi):
    return bi.base.g["dedos"] + bi.base.g["dedos_frente"]


# ================================================================ animações
def pacote(chave, aid, rotulo, laco=True, tempo=1.0, extra=None):
    return ("pacote", chave, aid, rotulo, laco, tempo, extra)


def onda(n, amp, fase=0.0, eixo="z"):
    """Um giro por osso, em onda ao longo da cadeia (cauda que ondula)."""
    return [[(eixo, amp * math.sin(fase + k * 0.9))] for k in range(n)]


def virar(peso=1.0, passo_tras=None, passo_frente=None, n=8):
    """Volta inteira no lugar (como o Turn do Doberman), com as patas em diagonal levantando a cada passo."""
    dur = 3.2 * peso
    pt = passo_tras or [("x", -18), ("x", 30), ("x", -10)]
    pf = passo_frente or [("x", -20), ("x", 30), ("x", -10)]
    ch = []
    for k in range(n + 1):
        t = dur * k / n
        sp = {"giro": 360.0 * k / n}
        if k % 2 == 1:  # passo: um par em diagonal no ar
            par = ("L", "R") if (k // 2) % 2 == 0 else ("R", "L")
            sp[f"tras.{par[0]}"] = pt
            sp[f"frente.{par[1]}"] = pf
        ch.append((t, sp, {}))
    return dict(id="virar", rotulo="Virar", laco=True, chaves=ch, linear=["Root"], sem_ciclo=True)


def altura_quadril(bi):
    return bi.H2[bi.idx[bi.esq["quadril"]], 2]


def felino(bi, sp, rugido="Rugir"):
    """Animações compostas do esqueleto do tigre (tigre, leão, urso, hipopótamo)."""
    p = sp.get("peso", 1.0)
    hs = altura_quadril(bi)
    cab = "focinho"
    dob = sp.get("agacha", 0.22)
    pf = {"pes_fixos": True}

    def cabeca_no_chao(z, ate=80):
        return dict(pf, alvo=dict(papel="pescoco", eixo="x", de=-10, ate=ate, ossos=cab, z=z))

    agach = {"raiz": (0, 0, -dob * hs), "tronco": [("x", 8)], "quadril": [("x", 0)], "cauda": [("x", 30)]}
    comer = []
    for k, (cb, mj, gz, z) in enumerate([(14, 0, 0, 0.02), (8, 16, 4, 0.06), (18, 2, -6, 0.02), (8, 18, -2, 0.06),
                                         (14, 0, 0, 0.02)]):
        s = dict(agach)
        s.update({"cabeca": [("x", cb), ("z", gz)], "mandibula": [("x", mj)], "cauda*": onda(7, 5, k)})
        s["cauda"] = [("x", 30)]
        comer.append((k * 0.5 * p, s, cabeca_no_chao(z * hs)))
    beber = []
    for k in range(7):
        s = dict(agach)
        s["raiz"] = (0, 0, -(dob + 0.06) * hs)
        s.update({"cabeca": [("x", 22 + (5 if k % 2 else 0))], "mandibula": [("x", 9 if k % 2 else 2)],
                  "cauda*": onda(7, 4, k * 0.7)})
        s["cauda"] = [("x", 34)]
        beber.append((k * 0.35 * p, s, cabeca_no_chao(0.0 if k % 2 == 0 else 0.03 * hs)))
    deit = {"tras_abs": [-62, 92, -88, -90], "frente_abs": [28, -86, -90, -90]}
    deitar = []
    for k, (t, resp) in enumerate([(0, 0), (1.2, 1), (2.4, 0), (3.6, 1), (4.8, 0)]):
        s = dict(deit)
        s.update({"tronco": [("x", -1.5 * resp)], "pescoco": [("x", -10), ("z", 12 if k == 2 else 0)],
                  "cabeca": [("x", 8)], "cauda*": onda(7, 6 * (1 if k % 2 else -1), k)})
        deitar.append((t * p, s, {}))
    dormir = []
    for k, (t, resp) in enumerate([(0, 0), (1.6, 1), (3.2, 0)]):
        s = {"quadril": [("y", 84)], "tras": [("x", -25), ("x", 25), ("x", -10)],
             "frente": [("x", -20), ("x", 20), ("x", -5)], "tronco": [("x", -2 * resp), ("z", -8)],
             "cabeca": [("x", 10)], "cauda*": [[("z", -10)]] * 7}
        dormir.append((t * p, s, dict(alvo=dict(papel="pescoco", eixo="z", de=0, ate=-60, ossos=cab, z=0.04 * hs))))
    rug = [
        (0.0, {}, {}),
        (0.5 * p, {"pescoco": [("x", -12)], "cabeca": [("x", -6)], "mandibula": [("x", 6)], "tronco": [("x", 3)]}, pf),
        (0.9 * p, {"pescoco": [("x", 10)], "cabeca": [("x", -16)], "mandibula": [("x", 38)], "tronco": [("x", 5)],
                   "raiz": (0, 0, -0.06 * hs)}, pf),
        (1.7 * p, {"pescoco": [("x", 12), ("z", 6)], "cabeca": [("x", -18)], "mandibula": [("x", 40)], "tronco": [("x", 5)],
                   "raiz": (0, 0, -0.06 * hs)}, pf),
        (2.3 * p, {"pescoco": [("x", 2)], "cabeca": [("x", -4)], "mandibula": [("x", 4)]}, pf),
        (2.8 * p, {}, {}),
    ]
    return [
        dict(id="comer", rotulo="Comer", laco=True, chaves=comer),
        dict(id="beber", rotulo="Beber", laco=True, chaves=beber),
        dict(id="deitar", rotulo="Deitar", laco=True, chaves=deitar, vistas=["lado", "frente"]),
        dict(id="dormir", rotulo="Dormir", laco=True, chaves=dormir, vistas=["lado", "tq"]),
        dict(id=sp.get("id_rugido", "rugir"), rotulo=rugido, laco=False, chaves=rug),
        virar(p),
    ]


def ungulado(bi, sp, chamado="Chamar"):
    """Animações compostas do esqueleto do cervo (cervo, zebra, girafa, bisão, elefante)."""
    p = sp.get("peso", 1.0)
    hs = altura_quadril(bi)
    cab = "focinho"
    pf = {"pes_fixos": True}
    desce = sp.get("desce", 0.04)
    pesc_max = sp.get("pescoco_max", 110)

    def no_chao(z, extra=None):
        o = dict(pf, alvo=dict(papel="pescoco", eixo="x", de=-10, ate=pesc_max, ossos=cab, z=z))
        o.update(extra or {})
        return o

    base_beber = sp.get("beber_pose", {"raiz": (0, 0, -desce * hs), "tronco": [("x", 4)]})
    comer = []
    for k, (cb, gz, z, ore) in enumerate([(10, 0, 0.03, 0), (16, 6, 0.0, 10), (8, -4, 0.04, 0), (16, -6, 0.0, -8),
                                          (10, 0, 0.03, 0)]):
        s = dict(base_beber)
        s.update({"cabeca": [("x", cb), ("z", gz)], "orelhas": [("y", ore)], "cauda": [("z", 8 * math.sin(k * 1.7))]})
        comer.append((k * 0.6 * p, s, no_chao(z * hs)))
    if sp.get("comer_fn"):
        comer = sp["comer_fn"](bi, sp)
    beber = []
    bo = sp.get("beber_opts")
    for k in range(7):
        s = dict(base_beber)
        s.update({"cabeca": [("x", 20 + (4 if k % 2 else 0))], "orelhas": [("x", -6 if k % 2 else 0)]})
        o = no_chao(0.0 if k % 2 == 0 else 0.025 * hs)
        if bo is not None:
            o = {kk: vv for kk, vv in o.items() if kk != "pes_fixos"}
            o.update(bo)
        beber.append((k * 0.4 * p, s, o))
    if sp.get("beber_fn"):
        beber = sp["beber_fn"](bi, sp)
    deit = sp.get("deitar_pose", {"tras_abs": [-82, 98, -84, -90], "frente_abs": [38, -78, 100, 90]})
    deitar = []
    for k, (t, resp) in enumerate([(0, 0), (1.4, 1), (2.8, 0), (4.2, 1), (5.6, 0)]):
        s = dict(deit)
        s.update({"tronco": [("x", -1.5 * resp)], "pescoco": [("x", -8), ("z", 14 if k == 2 else 0)],
                  "cabeca": [("x", 6)], "orelhas": [("y", 10 * resp)]})
        deitar.append((t * p, s, {}))
    dormir = []
    for k, (t, resp) in enumerate([(0, 0), (1.8, 1), (3.6, 0)]):
        s = dict(deit)
        s.update({"tronco": [("x", -2 * resp)], "cabeca": [("x", 18)], "orelhas": [("x", 20)]})
        de_, ate_, eixo_ = sp.get("dormir_alvo", (-20, pesc_max, "x"))
        dormir.append((t * p, s, dict(alvo=dict(papel="pescoco", eixo=eixo_, de=de_, ate=ate_, ossos=cab,
                                                z=(0.02 + 0.01 * resp) * hs))))
    cham = (sp["chamar_fn"](bi, sp) if sp.get("chamar_fn") else None) or [
        (0.0, {}, {}),
        (0.5 * p, {"pescoco": [("x", -18)], "cabeca": [("x", -14)], "orelhas": [("x", 10)]}, pf),
        (1.0 * p, {"pescoco": [("x", -30)], "cabeca": [("x", -30)], "orelhas": [("x", 18)], "tronco": [("x", -3)]}, pf),
        (1.8 * p, {"pescoco": [("x", -30)], "cabeca": [("x", -34)], "orelhas": [("x", 18)], "tronco": [("x", -3)]}, pf),
        (2.4 * p, {"pescoco": [("x", -8)], "cabeca": [("x", -6)]}, pf),
        (3.0 * p, {}, {}),
    ]
    return [
        dict(id="comer", rotulo="Comer", laco=True, chaves=comer),
        dict(id="beber", rotulo="Beber", laco=True, chaves=beber),
        dict(id="deitar", rotulo="Deitar", laco=True, chaves=deitar, vistas=["lado", "frente"]),
        dict(id="dormir", rotulo="Dormir", laco=True, chaves=dormir, vistas=["lado"]),
        dict(id="chamar", rotulo=chamado, laco=False, chaves=cham),
        virar(p, [("x", -14), ("x", 26), ("x", -8)], [("x", -10), ("x", 30), ("x", -16)]),
    ]


# ---------------------------------------------------------------- girafa
def girafa_comer(bi, sp):
    """A girafa come no alto: pescoço e cabeça para cima, puxando folhas."""
    p = sp.get("peso", 1.0)
    pf = {"pes_fixos": True}
    ch = []
    for k, (px, cx, gz, ore) in enumerate([(-14, -24, 0, 0), (-18, -34, 6, 10), (-12, -20, -4, 0), (-18, -36, -8, -8),
                                           (-14, -24, 0, 0)]):
        ch.append((k * 0.7 * p, {"pescoco": [("x", px), ("z", gz)], "cabeca": [("x", cx)], "orelhas": [("y", ore)],
                                 "cauda": [("z", 10 * math.sin(k * 1.9))]}, pf))
    return ch


def girafa_beber(bi, sp):
    """A girafa abre as pernas da frente para os lados e abaixa o pescoço até a água."""
    p = sp.get("peso", 1.0)
    hs = altura_quadril(bi)
    ch = []
    for k in range(7):
        s = {"frente": [("y", -27), None, ("y", 27)], "tras": [("x", -10), ("x", 16), ("x", -6)],
             "tronco": [("x", 20)], "pescoco": [("x", 12)], "cabeca": [("x", 40 + (5 if k % 2 else 0))],
             "orelhas": [("x", -6 if k % 2 else 0)]}
        ch.append((k * 0.45 * p, s, dict(ref="patas", alvo=dict(papel="spine.006", eixo="x", de=-10, ate=150, ossos="focinho",
                                                                z=(0.0 if k % 2 == 0 else 0.02) * hs))))
    return ch


# ---------------------------------------------------------------- elefante
def elefante_comer(bi, sp):
    """Pega o capim com a tromba e leva à boca."""
    p = sp.get("peso", 1.0)
    pf = {"pes_fixos": True}
    pega = {"pescoco": [("x", 10)], "cabeca": [("x", 6)], "tromba*": [[("x", -6)], [("x", -8)], [("x", -10)], [("x", -24)], [("x", -30)]]}
    boca = {"pescoco": [("x", -2)], "cabeca": [("x", -6)], "tromba*": [[("x", 22)], [("x", 38)], [("x", 44)], [("x", 46)], [("x", 30)]]}
    return [(0.0, pega, dict(pf, alvo=dict(papel="pescoco", eixo="x", de=-10, ate=40, ossos=[bi.papeis["tromba"][-1]], z=0.02))),
            (0.8 * p, pega, dict(pf, alvo=dict(papel="pescoco", eixo="x", de=-10, ate=40, ossos=[bi.papeis["tromba"][-1]], z=0.03))),
            (1.6 * p, boca, pf), (2.4 * p, dict(boca, cabeca=[("x", -10)]), pf),
            (3.2 * p, pega, dict(pf, alvo=dict(papel="pescoco", eixo="x", de=-10, ate=40, ossos=[bi.papeis["tromba"][-1]], z=0.02)))]


def elefante_beber(bi, sp):
    """Suga a água com a tromba e despeja na boca."""
    p = sp.get("peso", 1.0)
    pf = {"pes_fixos": True}
    agua = {"pescoco": [("x", 12)], "cabeca": [("x", 8)], "tromba*": [[("x", -4)], [("x", -6)], [("x", -8)], [("x", -16)], [("x", -20)]]}
    boca = {"pescoco": [("x", -8)], "cabeca": [("x", -12)], "tromba*": [[("x", 20)], [("x", 36)], [("x", 46)], [("x", 50)], [("x", 36)]]}
    alvo = dict(pf, alvo=dict(papel="pescoco", eixo="x", de=-10, ate=40, ossos=[bi.papeis["tromba"][-1]], z=0.0))
    return [(0.0, agua, alvo), (1.2 * p, dict(agua, cabeca=[("x", 10)]), alvo), (2.2 * p, boca, pf),
            (2.8 * p, dict(boca, cabeca=[("x", -18)]), pf), (3.8 * p, agua, alvo)]


def elefante_chamar(bi, sp):
    """Barrir: cabeça para cima, tromba erguida, orelhas abertas."""
    p = sp.get("peso", 1.0)
    pf = {"pes_fixos": True}
    alto = {"pescoco": [("x", -10)], "cabeca": [("x", -14)], "orelhas": [("z", 25)],
            "tromba*": [[("x", -20)], [("x", -34)], [("x", -40)], [("x", -40)], [("x", -30)]], "tronco": [("x", -3)]}
    return [(0.0, {}, {}), (0.7 * p, dict(alto, tromba_=None), pf),
            (1.0 * p, alto, pf), (1.9 * p, dict(alto, cabeca=[("x", -18)]), pf), (2.6 * p, {"tromba": [("x", -10)]}, pf),
            (3.2 * p, {}, {})]


def elefante_banho(bi, sp):
    """Joga água nas costas com a tromba (por cima da cabeça)."""
    p = sp.get("peso", 1.0)
    pf = {"pes_fixos": True}
    cad = bi.papeis["tromba"]
    agua = {"pescoco": [("x", 10)], "tromba*": [[("x", -4)], [("x", -6)], [("x", -8)], [("x", -16)], [("x", -20)]]}
    cima = {"pescoco": [("x", -12)], "cabeca": [("x", -14)],
            "tromba*": [[("x", -40)], [("x", -46)], [("x", -50)], [("x", -40)], [("x", -30)]]}
    joga = {"pescoco": [("x", -14)], "cabeca": [("x", -16)], "orelhas": [("z", 15)],
            "tromba*": [[("x", -44)], [("x", -54)], [("x", -58)], [("x", -54)], [("x", -50)]]}
    alvo = dict(pf, alvo=dict(papel="pescoco", eixo="x", de=-10, ate=40, ossos=[cad[-1]], z=0.0))
    return [dict(id="banho", rotulo="Tomar banho (tromba)", laco=True, vistas=["lado", "tq"],
                 chaves=[(0.0, agua, alvo), (1.0 * p, dict(agua, cabeca=[("x", 8)]), alvo), (2.0 * p, cima, pf),
                         (2.4 * p, joga, pf), (2.8 * p, cima, pf), (3.6 * p, agua, alvo)])]


# ---------------------------------------------------------------- crocodilo
def _perna_croco(swing, lift, lado):
    sg = 1 if lado == "L" else -1
    return [[("z", -swing * sg), ("y", -lift * sg)], [("y", lift * 0.6 * sg)]]


def crocodilo(bi, sp):
    hs = altura_quadril(bi)
    ref = {"ref": "patas"}

    def ciclo(per, amp, lev, ond, n=8, tronco_amp=1.0):
        ch = []
        for k in range(n + 1):
            t = k / n
            s = {}
            for papel, lado, fase in (("frente", "L", 0.0), ("tras", "R", 0.0), ("frente", "R", 0.5), ("tras", "L", 0.5)):
                ph = 2 * math.pi * (t + fase)
                s[f"{papel}.{lado}"] = _perna_croco(amp * math.cos(ph), lev * max(0.0, math.sin(ph)), lado)
            s["tronco"] = [("z", ond * tronco_amp * math.sin(2 * math.pi * t))]
            s["pescoco"] = [("z", -ond * 0.8 * math.sin(2 * math.pi * t))]
            s["cauda*"] = [[("z", ond * 1.1 * math.sin(2 * math.pi * t - 0.7 * (j + 1)))] for j in range(7)]
            ch.append((per * t, s, ref))
        return ch

    parado = []
    for k, (b, ab) in enumerate([(0, 0), (1, 0), (0, 4), (1, 0), (0, 0)]):
        parado.append((k * 1.2, {"tronco": [("x", -0.8 * b)], "mandibula": [("x", ab)],
                                 "cauda*": [[("z", 2.5 * math.sin(k * 1.3 + j * 0.6))] for j in range(7)],
                                 "cabeca": [("x", -1.5 * b)]}, {}))
    nadar = []
    for k in range(9):
        t = k / 8
        s = {"tras": [[("z", 70), ("y", 20)], [("y", -20)]], "frente": [[("z", 60), ("y", 20)], [("y", -20)]],
             "tronco": [("z", 4 * math.sin(2 * math.pi * t))], "pescoco": [("z", -3 * math.sin(2 * math.pi * t))],
             "cauda*": [[("z", 16 * math.sin(2 * math.pi * t - 0.8 * (j + 1)))] for j in range(7)]}
        nadar.append((1.4 * t, s, {}))
    boca = [(0.0, {}, {}), (0.6, {"cabeca": [("x", -6)], "mandibula": [("x", 30)]}, {}),
            (2.6, {"cabeca": [("x", -7)], "mandibula": [("x", 32)]}, {}), (3.2, {"mandibula": [("x", 2)]}, {})]
    pf_c = {"pes_fixos": True}
    morde = [(0.0, {"mandibula": [("x", 3)]}, pf_c),
             (0.4, {"pescoco": [("z", 14)], "cabeca": [("x", -10), ("z", 6)], "mandibula": [("x", 34)], "tronco": [("z", 6)]}, pf_c),
             (0.55, {"pescoco": [("z", 20)], "cabeca": [("x", -2), ("z", 8)], "mandibula": [("x", 0)], "tronco": [("z", 8)]}, pf_c),
             (1.1, {"pescoco": [("z", 10)], "cabeca": [("x", -12), ("y", 14)], "mandibula": [("x", 12)], "tronco": [("z", 4)]}, pf_c),
             (1.5, {"pescoco": [("z", 10)], "cabeca": [("x", -6), ("y", -10)], "mandibula": [("x", 2)], "tronco": [("z", 4)]}, pf_c),
             (2.0, {"mandibula": [("x", 3)]}, pf_c)]
    deit = {"tras": [[("z", 40), ("y", -15)], [("y", 25)], [("x", 10)]], "frente": [[("z", 30), ("y", -10)], [("y", 25)]]}
    deitar = [(k * 1.6, dict(deit, tronco=[("x", -0.8 * (k % 2))], cabeca=[("x", -4)],
                             cauda_=None, **{"cauda*": [[("z", 3 * math.sin(k + j))] for j in range(7)]}), {}) for k in range(4)]
    dormir = [(k * 2.0, dict(deit, tronco=[("x", -0.6 * (k % 2))], cabeca=[("x", 3)], mandibula=[("x", 10)],
                             **{"cauda*": [[("z", 6)]] * 7}), {}) for k in range(3)]
    for lst in (deitar, dormir):
        for _, s, _ in lst:
            s.pop("cauda_", None)
    # virar: volta inteira rastejando
    vir = []
    n = 12
    for k in range(n + 1):
        t = k / n
        s = {"giro": 360.0 * t}
        for papel, lado, fase in (("frente", "L", 0.0), ("tras", "R", 0.0), ("frente", "R", 0.5), ("tras", "L", 0.5)):
            ph = 2 * math.pi * (t * 3 + fase)
            s[f"{papel}.{lado}"] = _perna_croco(14 * math.cos(ph), 18 * max(0.0, math.sin(ph)), lado)
        s["tronco"] = [("z", 10)]
        s["cauda*"] = [[("z", 8 + 4 * math.sin(2 * math.pi * t * 3 - j))] for j in range(7)]
        vir.append((4.0 * t, s, ref))
    return [
        dict(id="parado", rotulo="Parado", laco=True, chaves=parado),
        dict(id="andar", rotulo="Rastejar", laco=True, chaves=ciclo(1.6, 34, 24, 13), vistas=["cima", "tq"]),
        dict(id="correr", rotulo="Correr", laco=True, chaves=ciclo(0.7, 40, 32, 16), vistas=["cima"]),
        dict(id="nadar", rotulo="Nadar", laco=True, chaves=nadar, vistas=["cima", "lado"]),
        dict(id="abrir_boca", rotulo="Abrir a boca", laco=False, chaves=boca, vistas=["lado", "tq"]),
        dict(id="comer", rotulo="Morder", laco=False, chaves=morde, vistas=["cima", "tq"]),
        dict(id="deitar", rotulo="Deitar (tomar sol)", laco=True, chaves=deitar),
        dict(id="dormir", rotulo="Dormir", laco=True, chaves=dormir),
        dict(id="virar", rotulo="Virar", laco=True, chaves=vir, linear=["Root"], sem_ciclo=True, vistas=["cima"]),
    ]


# ---------------------------------------------------------------- canguru
def canguru(bi, sp):
    hs = altura_quadril(bi)
    pft = {"pes_fixos": ("tras",), "ref": "patas"}
    cauda_ch = bi.esq["cauda"]

    def salto(per, alt, incl, n_saltos=1, giro=0.0, avanco=0.0):
        """Um ciclo de salto: agacha, empurra, voa (pernas para trás, cauda erguida), aterrissa."""
        ch = []
        for j in range(n_saltos):
            t0 = per * j
            g0 = giro * j
            fases = [
                (0.0, {"quadril": [("x", incl * 0.6)], "tras": [("x", -16), ("x", 22), None, None],
                       "cauda": [("x", 10)], "frente": [("x", -10)]}, dict(pft), 0),
                (0.18, {"quadril": [("x", incl)], "tras": [("x", 26), ("x", -24), ("x", 34), ("x", 26)],
                        "cauda": [("x", 26)], "frente": [("x", -16)]}, {}, alt * 0.5),
                (0.45, {"quadril": [("x", incl)], "tras": [("x", 30), ("x", -18), ("x", 30), ("x", 22)],
                        "cauda": [("x", 30)], "frente": [("x", -20)]}, {}, alt),
                (0.75, {"quadril": [("x", incl * 0.8)], "tras": [("x", -18), ("x", 4), ("x", -6), ("x", -4)],
                        "cauda": [("x", 24)], "frente": [("x", -12)]}, {}, alt * 0.35),
            ]
            for f, s, o, h in fases:
                s = dict(s)
                if giro:
                    s["giro"] = g0 + giro * f
                if h:
                    o = dict(o, chao=h)
                ch.append((t0 + per * f, s, o))
        s_fim = dict(ch[0][1])
        if giro:
            s_fim["giro"] = giro * n_saltos
        ch.append((per * n_saltos, s_fim, ch[0][2]))
        return ch

    parado = []
    for k, (gz, b) in enumerate([(0, 0), (10, 1), (0, 0), (-12, 1), (0, 0)]):
        parado.append((k * 1.1, {"pescoco": [("z", gz)], "cabeca": [("x", -2 * b)], "tronco": [("x", -1.2 * b)],
                                 "frente": [("x", -4 * b)]}, {}))
    comer = []
    for k, (cx, mj) in enumerate([(10, 0), (16, 10), (8, 0), (16, 12), (10, 0)]):
        comer.append((k * 0.55, {"quadril": [("x", 52)], "cauda*": [[("x", -40)], [("x", -10)]], "tronco": [("x", 12)],
                                 "frente": [("x", -18), ("x", -10)], "cabeca": [("x", cx)], "mandibula": [("x", mj)]},
                      dict(pft, alvo=dict(papel="pescoco", eixo="x", de=-30, ate=90, ossos="focinho", z=0.02 * hs))))
    beber = []
    for k in range(7):
        beber.append((k * 0.35, {"quadril": [("x", 56)], "cauda*": [[("x", -44)], [("x", -10)]], "tronco": [("x", 12)],
                                 "frente": [("x", -20), ("x", -10)], "cabeca": [("x", 18 + (5 if k % 2 else 0))],
                                 "mandibula": [("x", 8 if k % 2 else 1)]},
                      dict(pft, alvo=dict(papel="pescoco", eixo="x", de=-30, ate=100, ossos="focinho",
                                          z=(0.0 if k % 2 == 0 else 0.02) * hs))))
    deit = {"quadril": [("y", 80), ("x", 30)], "tras": [("x", -30), ("x", 30), ("x", -20)], "frente": [("x", -30)],
            "cauda": [("x", -20)], "pescoco": [("z", 20), ("x", -25)], "cabeca": [("x", 10)]}
    deitar = [(k * 1.5, dict(deit, tronco=[("x", -1.5 * (k % 2))]), {}) for k in range(5)]
    dormir = []
    for k in range(3):
        s = dict(deit, tronco=[("x", -1.5 * (k % 2))], cabeca=[("x", 20)])
        s.pop("pescoco")
        dormir.append((k * 1.8, s, dict(alvo=dict(papel="pescoco", eixo="z", de=0, ate=-70, ossos="focinho", z=0.04 * hs))))
    return [
        dict(id="parado", rotulo="Parado (apoiado na cauda)", laco=True, chaves=parado),
        dict(id="andar", rotulo="Andar pulando", laco=True, chaves=salto(0.7, 0.12 * hs, 28)),
        dict(id="correr", rotulo="Saltar", laco=True, chaves=salto(0.55, 0.45 * hs, 52)),
        dict(id="pular", rotulo="Pular parado", laco=True, chaves=salto(0.8, 0.35 * hs, 6)),
        dict(id="comer", rotulo="Comer", laco=True, chaves=comer),
        dict(id="beber", rotulo="Beber", laco=True, chaves=beber),
        dict(id="deitar", rotulo="Deitar", laco=True, chaves=deitar, vistas=["lado", "tq"]),
        dict(id="dormir", rotulo="Dormir", laco=True, chaves=dormir, vistas=["tq"]),
        dict(id="virar", rotulo="Virar (pulando)", laco=True, chaves=salto(0.75, 0.15 * hs, 18, 4, 90.0),
             linear=["Root"], sem_ciclo=True, vistas=["cima", "lado"]),
    ]


def animacoes(bi, sp, id_):
    fam = sp["familia"]
    t = sp.get("tempo_pacote", 1.0)
    extra = sp.get("extra_pacote")
    if callable(extra):
        extra = extra(bi)
    if fam == "felino":
        lst = [pacote("idle", "parado", "Parado", True, t), pacote("idle_rare", "espreguicar", sp.get("rotulo_raro", "Olhar em volta"), False, t),
               pacote("walk", "andar", "Andar", True, t),
               pacote(sp.get("correr_de", "run"), "correr", "Correr", True, t * sp.get("tempo_correr", 1.0))]
        return lst + felino(bi, sp, sp.get("rugido", "Rugir")) + (sp.get("extras_anim") or (lambda b, s: []))(bi, sp)
    if fam == "ungulado":
        lst = [pacote("idle", "parado", "Parado", True, t, extra),
               pacote("walk", "andar", "Andar", True, t * sp.get("tempo_andar", 1.0), extra),
               pacote(sp.get("correr_de", "run"), "correr", sp.get("rotulo_correr", "Correr"), True, t * sp.get("tempo_correr", 1.0), extra)]
        return lst + ungulado(bi, sp, sp.get("chamado", "Chamar")) + (sp.get("extras_anim") or (lambda b, s: []))(bi, sp)
    if fam == "crocodilo":
        return crocodilo(bi, sp)
    if fam == "canguru":
        return canguru(bi, sp)
    raise KeyError(fam)


# ================================================================ espécies
def zona_ossos(*grupos_):
    def f(bi):
        nomes = set()
        for gname in grupos_:
            nomes |= set(bi.base.g.get(gname, [gname]))
        return np.array([o in nomes for o in bi.base.Fosso])
    return f


def zona_classe(*cls):
    return lambda bi: np.isin(bi.base.Fcls, cls)


def zona_focinho(pct=0.7):
    return lambda bi: mascara_face_focinho(bi, pct)


def _ponta(bi, osso, k=1.0):
    i = bi.idx[osso]
    return bi.H2[i] + bi.R2[i][:, 1] * bi.L2[i] * k


# ---------------------------------------------------------------- leão
def forma_leao(bi):
    """A juba: o pescoço e a parte de trás da cabeça inflam (pelo fofo), mais na nuca e no peito."""
    ih = bi.idx[bi.esq["cabeca"]]
    mn, mx, _ = caixa_osso(bi, [bi.esq["cabeca"]])
    N = B.normais_vertice(bi.V, bi.F)
    nb = len(bi.base.V)
    amt = np.zeros(len(bi.V))
    for o, a in (("spine.010", 0.17), ("spine.011", 0.19), ("spine.009", 0.07)):
        amt += bi.W[:, bi.idx[o]] * a
    yc = mn[1] + 0.42 * (mx[1] - mn[1])
    t = np.clip((bi.V[:, 1] - yc) / (0.4 * (mx[1] - mn[1])), 0, 1)
    amt += bi.W[:, ih] * 0.16 * t
    amt[nb:] = 0
    bi.V = bi.V + N * amt[:, None] * altura_quadril(bi) / 1.05
    bi.juba_y = yc


def zona_juba(bi):
    base = bi.base
    mn, mx, _ = caixa_osso(bi, [bi.esq["cabeca"]])
    yc = mn[1] + 0.47 * (mx[1] - mn[1])
    out = np.zeros(len(base.F), bool)
    for i, f in enumerate(base.F):
        o = base.Fosso[i]
        c = bi.V[bi.F[i]].mean(0)
        if o in ("spine.010", "spine.011"):
            out[i] = True
        elif o == "spine.012" and c[1] > yc:
            out[i] = True
        elif o == "spine.009" and c[1] < bi.H2[bi.idx["spine.009"], 1] - 0.05 and base.Fn[i][2] < 0.3:
            out[i] = True
    return out


def pecas_leao(bi):
    tufo(bi, "spine", 0.16, 0.06, "#7a3c1e")
    olhos(bi, 0.36, 0.66, 0.032, "#2a1a10", fx=0.76)


# ---------------------------------------------------------------- urso
def pecas_urso(bi):
    olhos(bi, 0.36, 0.68, 0.03, fx=0.76)
    mn, mx, _ = caixa_osso(bi, [bi.esq["cabeca"]])
    for lado in (1, -1):  # orelhas redondas
        y = mn[1] + 0.72 * (mx[1] - mn[1])
        p = superficie(bi, [bi.esq["cabeca"]], y, mx[2] - 0.12 * (mx[2] - mn[2]), lado)
        p[0] *= 0.8
        p[2] = mx[2] - 0.06 * (mx[2] - mn[2])
        pts, fs = B.esfera(p, (0.07, 0.035, 0.07), sub=1)
        bi.junta(pts, fs, bi.Fcol[0] * 0 + _c(bi.b["cores"]["pelo"]), bi.esq["cabeca"])


def em_pe(bi, sp):
    """Urso em pé nas patas de trás, farejando."""
    p = sp.get("peso", 1.0)
    pf = {"pes_fixos": ("tras",), "ref": "patas"}
    ch = []
    for k, (gz, gx) in enumerate([(0, 0), (14, -6), (0, 4), (-14, -6), (0, 0)]):
        ch.append((k * 0.9 * p, {"quadril": [("x", -64)], "tronco": [("x", -8)], "pescoco": [("x", 48 + gx), ("z", gz)],
                                 "cabeca": [("x", 18)], "frente": [("x", 50), ("x", -40), ("x", -20)],
                                 "cauda": [("x", 30)]}, pf))
    return [dict(id="em_pe", rotulo="Em pé", laco=True, chaves=ch, vistas=["lado", "tq"])]


# ---------------------------------------------------------------- hipopótamo
def pecas_hipo(bi):
    olhos(bi, 0.62, 0.9, 0.05, fx=0.8)
    mn, mx, _ = caixa_osso(bi, [bi.esq["cabeca"]])
    for lado in (1, -1):
        p = superficie(bi, [bi.esq["cabeca"]], mn[1] + 0.85 * (mx[1] - mn[1]), mx[2], lado)
        p[0] *= 0.62
        p[2] = mx[2] - 0.02
        orelha(bi, p, (1, 0.2, 0), (lado * 0.3, 0.3, 1), 0.07, 0.08, _c("#8a8298"), _c("#d89aa0"), "caida",
               bi.esq["cabeca"], 0.015)
    # narinas: dois calombos em cima do focinho
    for lado in (1, -1):
        p = np.array([lado * 0.09, mn[1] + 0.05 * (mx[1] - mn[1]), mx[2] - 0.32 * (mx[2] - mn[2])])
        p = superficie(bi, [bi.esq["cabeca"]], p[1], p[2], lado) * np.array([0.45, 1, 1])
        p[2] = caixa_osso(bi, [bi.esq["cabeca"]])[2][np.argsort(np.abs(caixa_osso(bi, [bi.esq["cabeca"]])[2][:, 1] - p[1]))[:30], 2].max()
        pts, fs = B.esfera(p, (0.045, 0.05, 0.03), sub=1)
        bi.junta(pts, fs, "#4a4258", bi.esq["cabeca"])


# ---------------------------------------------------------------- crocodilo
def pecas_croco(bi):
    olhos(bi, 0.72, 0.98, 0.07, "#d8b020", fx=0.62)
    # escamas: fileiras de pirâmides no dorso e na cauda
    nb = len(bi.base.V)
    cad = ["spine.010", "spine.009", "spine.008", "spine.007"] + bi.esq["cauda"]
    for o in cad:
        i = bi.idx[o]
        for k in range(2):
            c = bi.H2[i] + bi.R2[i][:, 1] * bi.L2[i] * (0.25 + 0.5 * k)
            m = (np.linalg.norm(bi.V[:nb] - c, axis=1) < max(bi.L2[i], 0.15)) & (bi.W[:nb, i] > 0.3)
            if not m.any():
                continue
            P = bi.V[:nb][m]
            topo = P[np.argmax(P[:, 2])]
            larg = (np.abs(P[:, 0])).max()
            fil = (-0.45, 0.45) if o not in bi.esq["cauda"][3:] else (0.0,)
            tam = 0.045 if o not in bi.esq["cauda"][4:] else 0.035
            for fx in fil:
                x = fx * larg
                zt = P[np.argsort(np.abs(P[:, 0] - x) + np.abs(P[:, 1] - c[1]))[:4], 2].max()
                b0 = np.array([x, c[1], zt - 0.01])
                pts = [b0 + [tam, 0, 0], b0 + [0, tam * 1.2, 0], b0 + [-tam, 0, 0], b0 + [0, -tam * 1.2, 0],
                       b0 + [0, 0, tam * 1.1]]
                bi.junta(pts, [[0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4]], "#3a5a30", ancora(bi, b0))


# ---------------------------------------------------------------- canguru
def pecas_canguru(bi):
    olhos(bi, 0.42, 0.66, 0.05)
    mn, mx, _ = caixa_osso(bi, [bi.esq["cabeca"]])
    for lado in (1, -1):
        p = superficie(bi, [bi.esq["cabeca"]], mn[1] + 0.75 * (mx[1] - mn[1]), mx[2] - 0.1 * (mx[2] - mn[2]), lado)
        p[0] *= 0.7
        orelha(bi, p, (1, 0.25, 0), (lado * 0.35, 0.2, 1), 0.09, 0.17, _c("#c86a3a"), _c("#f0b0a0"), "pontuda",
               bi.esq["cabeca"], 0.018)


# ---------------------------------------------------------------- girafa, zebra, bisão, elefante, cervo
def pecas_girafa(bi):
    mn, mx, _ = caixa_osso(bi, ["scull"])
    for lado in (1, -1):  # ossicones
        y = mn[1] + 0.72 * (mx[1] - mn[1])
        top = superficie(bi, ["scull"], y, mx[2], lado)
        top[0] = lado * 0.06
        _, _, P = caixa_osso(bi, ["scull"])
        top[2] = P[np.argsort(np.hypot(P[:, 1] - y, P[:, 0] - top[0]))[:6], 2].max() - 0.02
        a, b = top, top + np.array([lado * 0.03, 0.02, 0.2])
        curva_tubo(bi, [a, b], 0.03, 0.028, "#c87a3a", "scull", seg=6, n=3, pontuda=False)
        pts, fs = B.esfera(b, (0.04, 0.04, 0.035), sub=1)
        bi.junta(pts, fs, "#3a2a22", "scull")
    crina(bi, ["spine.006", "spine.007", "spine.008"], 0.11, "#8a4a26", n=16)
    tufo(bi, "spine", 0.3, 0.06, "#3a2a22")


def pecas_zebra(bi):
    crina(bi, ["spine.006", "spine.007", "spine.008"], 0.12, "#24242a", "#f2f0ea", n=18, frente=0.2)
    tufo(bi, "spine", 0.26, 0.05, "#24242a")


def pecas_bisao(bi):
    mn, mx, P = caixa_osso(bi, ["scull"])
    for lado in (1, -1):  # chifres curtos e curvos
        y = mn[1] + 0.62 * (mx[1] - mn[1])
        a = superficie(bi, ["scull"], y, mx[2] - 0.15 * (mx[2] - mn[2]), lado)
        a[0] *= 0.85
        curva_tubo(bi, [a, a + np.array([lado * 0.14, -0.02, 0.02]), a + np.array([lado * 0.2, -0.05, 0.14]),
                        a + np.array([lado * 0.18, -0.07, 0.22])], 0.05, 0.012, "#2a2624", "scull", seg=6, n=6)
    # barba
    ponta = P[np.argmin(P[:, 1])]
    queixo = np.array([0, ponta[1] + 0.28 * (mx[1] - mn[1]), mn[2] + 0.05])
    curva_tubo(bi, [queixo, queixo + np.array([0, 0.03, -0.18])], 0.08, 0.03, "#2e2018", ancora(bi, queixo), seg=6, n=3)
    tufo(bi, "spine", 0.18, 0.05, "#2e2018")


def pecas_elefante(bi):
    ih = bi.idx["scull"]
    foc = np.zeros(len(bi.V), bool)
    mn, mx, P = caixa_osso(bi, ["scull"])
    frente = P[P[:, 1] < mn[1] + 0.18 * (mx[1] - mn[1])]
    s0 = np.array([0, frente[:, 1].mean() + 0.06, frente[:, 2].mean()])
    r0 = (frente[:, 2].max() - frente[:, 2].min()) * 0.42
    alt = s0[2] - 0.38
    pontos = [s0, s0 + np.array([0, -0.18, -0.22]) * alt, s0 + np.array([0, -0.22, -0.5]) * alt,
              s0 + np.array([0, -0.2, -0.78]) * alt, s0 + np.array([0, -0.12, -0.98]) * alt,
              s0 + np.array([0, -0.2, -1.04]) * alt]
    bi.cadeia("tromba", "scull", pontos)
    cad = bi.papeis["tromba"]
    seg = np.linalg.norm(np.diff(pontos, axis=0), axis=1)
    acum = np.concatenate([[0], np.cumsum(seg)]) / seg.sum()

    def peso(t):
        j = min(np.searchsorted(acum, t, side="right") - 1, len(cad) - 1)
        f = (t - acum[j]) / (acum[j + 1] - acum[j])
        w = {cad[j]: 1.0}
        if f > 0.7 and j + 1 < len(cad):
            w = {cad[j]: 1 - (f - 0.7) / 0.6, cad[j + 1]: (f - 0.7) / 0.6}
        elif f < 0.3:
            w = {cad[j]: 0.5 + f / 0.6, (cad[j - 1] if j > 0 else "scull"): 0.5 - f / 0.6}
        return w

    n = 16
    P2 = np.array(pontos)
    tt = np.linspace(0, 1, n)
    curva = np.stack([np.interp(tt, acum, P2[:, k]) for k in range(3)], 1)
    raios = [r0 * (1 - 0.62 * t) for t in tt]
    pts, fs = B.tubo(curva, raios, seg=8)
    cor = _c(bi.b["cores"]["pelo"])
    bi.junta(pts, fs, [cor if k < len(fs) - 2 else _c("#7a7276") for k in range(len(fs))], [peso(t) for t in np.repeat(tt, 8)])
    # presas
    for lado in (1, -1):
        a = s0 + np.array([lado * r0 * 0.9, 0.12, -r0 * 0.9])
        curva_tubo(bi, [a, a + np.array([lado * 0.05, -0.35, -0.3]), a + np.array([lado * 0.1, -0.75, -0.3]),
                        a + np.array([lado * 0.12, -0.95, -0.05])], 0.075, 0.02, "#f4ecd8", "scull", seg=6, n=7)
    # orelhas grandes, presas aos ossos das orelhas (abanam com eles)
    for lado, nome in ((1, "ear.L"), (-1, "ear.R")):
        h = bi.H2[bi.idx[nome]]
        pos = np.array([lado * (abs(h[0]) + 0.05), h[1] - 0.22, h[2] + 0.02])
        orelha(bi, pos, (lado * 0.25, 1, 0.1), (lado * 0.35, 0.25, -1), 1.05, 1.25, _c("#8e8688"), _c("#c49a9e"),
               "caida", nome, 0.05)
    olhos(bi, 0.3, 0.6, 0.03)
    tufo(bi, "spine", 0.22, 0.05, "#3a3436")


def extra_tromba(bi):
    """A tromba balança nas animações do pacote (parado, andar, correr)."""
    cad = bi.papeis["tromba"]

    def fn(nome, t, dur):
        k = cad.index(nome)
        per = dur / max(1, round(dur / 2.4))
        g = 7 * math.sin(2 * math.pi * t / per - k * 0.6)
        gz = 4 * math.sin(2 * math.pi * t / per * 0.5 - k * 0.4)
        i = bi.idx[nome]
        R = rot_eixo(bi.R2[i].T @ AX["x"], g) @ rot_eixo(bi.R2[i].T @ AX["z"], gz)
        return mat_quat(R), (0, 0, 0)
    return dict(ossos=cad, fn=fn)


ESPECIES = {
    "girafa": dict(nome="Girafa", especie="girafa", base="Deer_001", escala=1.75, familia="ungulado", peso=1.4,
                   tirar=["chifre"], subdividir=True, tempo_pacote=1.35,
                   esqueleto={"tronco": (0.95, 0.8, 0.95), "pescoco": (0.75, 2.85, 0.8), "cabeca": (0.85, 1.2, 0.85),
                              "orelhas": (0.8, 0.8, 0.8), "pernas": (0.62, 1.55, 0.62), "pelves": (0.8, 1.45, 0.8),
                              "ombros": (0.8, 1.6, 0.8), "dedos": (0.75, 0.9, 0.8), "dedos_frente": (0.75, 0.9, 0.8),
                              "cauda": (0.5, 1.8, 0.5)},
                   giros={"spine.006": [("x", -12)], "scull": [("x", 8)]},
                   cores={"pelo": "#f2dcb0", "perna": "#f2dcb0", "escuro": "#2a2020", "barriga": "#f6ead0",
                          "casco": "#4a3428", "pelo_escuro": "#f2dcb0", "focinho": "#e8cfa0", "cinza": "#4a3a30",
                          "cauda_baixo": "#f2dcb0", "orelha_dentro": "#f0c0a8", "pescoco": "#f2dcb0",
                          "orelha_dentro2": "#f0c0a8", "mancha": "#c8682e", "mancha2": "#b85a28", "linha": "#f6e4bc"},
                   padrao=manchas_girafa, pecas=pecas_girafa, pescoco_max=140, desce=0.0, chamado="Chamar"),
    "bisao": dict(nome="Bisão", especie="bisão", base="Deer_001", escala=1.62, familia="ungulado", peso=1.2,
                  tirar=["chifre"], tempo_pacote=1.15,
                  esqueleto={"spine.003": (1.35, 1.1, 1.05), "spine.004": (1.5, 1.15, 1.3), "spine.005": (1.65, 1.0, 1.7),
                             "pescoco": (1.75, 0.55, 1.55), "cabeca": (1.55, 0.95, 1.35), "orelhas": (0.6, 0.6, 0.6),
                             "pernas": (1.45, 0.82, 1.45), "pelves": (1.3, 0.9, 1.3), "ombros": (1.5, 0.95, 1.5),
                             "dedos": (1.45, 0.9, 1.4), "dedos_frente": (1.45, 0.9, 1.4), "cauda": (0.6, 1.4, 0.6)},
                  giros={"spine.006": [("x", 34)], "scull": [("x", 4)]},
                  fofo={"spine.005": 0.07, "spine.006": 0.08, "spine.007": 0.08, "spine.008": 0.07, "scull": 0.035,
                        "front_shoulder.L": 0.05, "front_shoulder.R": 0.05, "front_thigh.L": 0.04, "front_thigh.R": 0.04},
                  cores={"pelo": "#8a5634", "perna": "#5a3624", "escuro": "#161212", "barriga": "#6a4028", "casco": "#2a2422",
                         "pelo_escuro": "#3e2a20", "focinho": "#2a201c", "cinza": "#221a18", "cauda_baixo": "#6a4028",
                         "orelha_dentro": "#4a3226", "pescoco": "#3e2a20", "orelha_dentro2": "#4a3226"},
                  zonas=[(zona_ossos("pescoco", "cabeca", "spine.005", "ombros", "bracos"), "#45291c"),
                         (zona_ossos("antebracos", "maos", "canelas", "pes"), "#3e2a20"),
                         (zona_classe("escuro"), "#141010"), (zona_focinho(0.78), "#221a16")],
                  pecas=pecas_bisao, pescoco_max=70, desce=0.03, chamado="Mugir"),
    "elefante": dict(nome="Elefante", especie="elefante", base="Deer_001", escala=2.55, familia="ungulado", peso=1.8,
                     tirar=["chifre"], tempo_pacote=1.45, tempo_correr=1.0, correr_de="walk", tempo_andar=1.0,
                     esqueleto={"spine.003": (1.55, 1.05, 1.3), "spine.004": (1.65, 1.0, 1.35), "spine.005": (1.6, 0.95, 1.4),
                                "pescoco": (1.6, 0.35, 1.5), "cabeca": (1.75, 0.85, 1.75), "pernas": (2.1, 1.0, 2.1),
                                "pelves": (1.7, 0.95, 1.7), "ombros": (1.9, 1.0, 1.9), "dedos": (2.6, 0.75, 2.4),
                                "dedos_frente": (2.6, 0.75, 2.4), "cauda": (0.5, 1.3, 0.5)},
                     giros={"spine.006": [("x", 6)]},
                     recolhe=["ear.L", "ear.R"],
                     cores={"pelo": "#9c9496", "perna": "#948c8e", "escuro": "#1c1a1c", "barriga": "#8c8486",
                            "casco": "#b4aca6", "pelo_escuro": "#9c9496", "focinho": "#9c9496", "cinza": "#9c9496",
                            "cauda_baixo": "#9c9496", "orelha_dentro": "#9c9496", "pescoco": "#9c9496",
                            "orelha_dentro2": "#9c9496"},
                     pecas=pecas_elefante, pescoco_max=40, desce=0.0, chamado="Barrir"),
    "hipopotamo": dict(nome="Hipopótamo", especie="hipopótamo", base="Tiger_001", escala=1.5, familia="felino", peso=1.4,
                       tempo_pacote=1.4, correr_de="walk", tempo_correr=0.62,
                       esqueleto={"spine.007": (1.75, 1.0, 1.3), "spine.008": (1.9, 1.05, 1.45), "spine.009": (1.8, 1.0, 1.4),
                                  "pescoco": (1.75, 0.55, 1.45), "cabeca": (1.55, 1.1, 1.45), "pernas": (1.7, 0.52, 1.7),
                                  "ombros": (1.5, 0.75, 1.5), "dedos": (1.7, 0.75, 1.5), "dedos_frente": (1.7, 0.75, 1.5),
                                  "cauda": (1.6, 0.16, 1.6)},
                       cores={"pelo": "#8e8a9e", "listra": "#8e8a9e", "claro": "#d9aeb2", "nariz": "#6a5f78",
                              "boca": "#c84a5a", "dente": "#fbfbf4"},
                       boca=dict(prof=0.62, alt_frente=0.32, alt_tras=0.4, cor_boca="#d0505e", cor_lingua="#ee8a96",
                                 dentes=[(0.16, 1, -1, 0.22), (0.16, -1, -1, 0.22), (0.24, 1, 1, 0.1), (0.24, -1, 1, 0.1),
                                         (0.15, 0.45, -1, 0.1), (0.15, -0.45, -1, 0.1)]),
                       pecas=pecas_hipo, agacha=0.12, rugido="Abrir a boca", id_rugido="abrir_boca",
                       zonas=[(zona_focinho(0.55), "#c9a0a8")]),
    "elefante_": None,
    "urso": dict(nome="Urso-pardo", especie="urso", base="Tiger_001", escala=1.0, familia="felino", peso=1.15,
                 tempo_pacote=1.15,
                 esqueleto={"tronco": (1.45, 0.85, 1.25), "pescoco": (1.55, 0.75, 1.4), "cabeca": (1.25, 0.82, 1.18),
                            "pernas": (1.5, 0.95, 1.5), "ombros": (1.4, 1.0, 1.4), "dedos": (1.45, 1.05, 1.3),
                            "dedos_frente": (1.45, 1.05, 1.3), "cauda": (1.0, 0.1, 1.0)},
                 fofo={"spine.009": 0.05, "spine.010": 0.05, "spine.011": 0.04},
                 cores={"pelo": "#8a5232", "listra": "#8a5232", "claro": "#7a4a2c", "nariz": "#2a1e1a",
                        "boca": "#b8303a", "dente": "#fbfbf6"},
                 zonas=[(zona_focinho(0.72), "#b07a52")],
                 boca=dict(prof=0.5, alt_frente=0.2, alt_tras=0.36,
                           dentes=[(0.2, 1, 1, 0.08), (0.2, -1, 1, 0.08), (0.22, 1, -1, 0.07), (0.22, -1, -1, 0.07)]),
                 pecas=pecas_urso, extras_anim=em_pe),
    "canguru": dict(nome="Canguru", especie="canguru", base="Tiger_001", escala=0.62, familia="canguru",
                    neutro_descanso=True,
                    esqueleto={"spine.007": (1.25, 1.1, 1.2), "spine.008": (1.05, 1.0, 1.1), "spine.009": (0.85, 0.95, 0.9),
                               "pescoco": (0.75, 1.0, 0.75), "cabeca": (0.85, 1.25, 0.9),
                               "coxas": (1.7, 0.75, 1.7), "canelas": (1.25, 1.35, 1.2), "pes": (1.0, 1.5, 0.9),
                               "dedos": (1.05, 1.4, 0.8), "ombros": (0.6, 0.45, 0.6), "bracos": (0.55, 0.85, 0.55),
                               "antebracos": (0.5, 0.95, 0.5), "maos": (0.55, 0.8, 0.55), "dedos_frente": (0.6, 0.9, 0.6),
                               "spine.006": (3.4, 1.4, 3.4), "spine.005": (3.0, 1.3, 3.0), "spine.004": (2.6, 1.3, 2.6),
                               "spine.003": (2.3, 1.3, 2.3), "spine.002": (2.0, 1.3, 2.0), "spine.001": (1.8, 1.3, 1.8),
                               "spine": (1.5, 1.3, 1.5)},
                    direcoes={"spine.007": (0, -0.45, 0.89), "spine.008": (0, -0.22, 0.97), "spine.009": (0, -0.12, 0.99),
                              "spine.010": (0, -0.55, 0.83), "spine.011": (0, -0.85, 0.5), "spine.012": (0, -0.92, -0.38),
                              "thigh.L": (0, -0.75, -0.66), "thigh.R": (0, -0.75, -0.66),
                              "shin.L": (0, 0.8, -0.6), "shin.R": (0, 0.8, -0.6),
                              "foot.L": (0, -0.97, -0.24), "foot.R": (0, -0.97, -0.24),
                              "toe.L": (0, -1, -0.02), "toe.R": (0, -1, -0.02),
                              "shoulder.L": (0.1, -0.3, -0.95), "shoulder.R": (-0.1, -0.3, -0.95),
                              "front_thigh.L": (0.05, -0.6, -0.8), "front_thigh.R": (-0.05, -0.6, -0.8),
                              "front_shin.L": (0, -0.75, -0.66), "front_shin.R": (0, -0.75, -0.66),
                              "front_foot.L": (0, -0.4, -0.92), "front_foot.R": (0, -0.4, -0.92),
                              "spine.006": (0, 0.45, -0.89), "spine.005": (0, 0.7, -0.71), "spine.004": (0, 0.9, -0.43),
                              "spine.003": (0, 0.98, -0.18), "spine.002": (0, 1, -0.03), "spine.001": (0, 1, 0.02),
                              "spine": (0, 1, 0.05)},
                    cores={"pelo": "#d8783e", "listra": "#d8783e", "claro": "#f2dcc0", "nariz": "#2a1e1a",
                           "boca": "#b8303a", "dente": "#fbfbf6"},
                    zonas=[(lambda bi: zona_ossos("cauda")(bi) & ~zona_classe("listra")(bi), "#d8783e"),
                           (zona_ossos("dedos", "dedos_frente", "maos"), "#6a3a24")],
                    pecas=pecas_canguru),
    "crocodilo": dict(nome="Crocodilo", especie="crocodilo", base="Tiger_001", escala=0.8, familia="crocodilo",
                      neutro_descanso=True,
                      esqueleto={"spine.007": (1.35, 1.45, 0.6), "spine.008": (1.45, 1.5, 0.58), "spine.009": (1.35, 1.4, 0.58),
                                 "pescoco": (1.2, 0.9, 0.55), "spine.012": (0.85, 1.75, 0.5), "jaw": (0.85, 1.75, 0.5),
                                 "coxas": (1.6, 0.42, 1.6), "canelas": (1.6, 0.5, 1.6), "pes": (1.5, 0.6, 1.2),
                                 "dedos": (1.7, 1.2, 1.2), "ombros": (1.3, 0.38, 1.0), "bracos": (1.6, 0.48, 1.6),
                                 "antebracos": (1.6, 0.55, 1.6), "maos": (1.5, 0.6, 1.2), "dedos_frente": (1.7, 1.2, 1.2),
                                 "spine.006": (5.4, 1.3, 3.2), "spine.005": (5.0, 1.35, 2.9), "spine.004": (4.2, 1.35, 2.6),
                                 "spine.003": (3.9, 1.4, 2.5), "spine.002": (3.5, 1.4, 2.3), "spine.001": (3.0, 1.4, 2.0),
                                 "spine": (2.4, 1.4, 1.7)},
                      direcoes={"spine.007": (0, -1, 0.0), "spine.008": (0, -1, 0.0), "spine.009": (0, -1, 0.0),
                                "spine.010": (0, -1, 0.02), "spine.011": (0, -1, 0.0), "spine.012": (0, -1, -0.06),
                                "spine.006": (0, 1, -0.12), "spine.005": (0, 1, -0.06), "spine.004": (0, 1, -0.03),
                                "spine.003": (0, 1, 0), "spine.002": (0, 1, 0), "spine.001": (0, 1, 0), "spine": (0, 1, 0),
                                "thigh.L": (0.8, 0.15, -0.58), "thigh.R": (-0.8, 0.15, -0.58),
                                "shin.L": (0.3, 0.2, -0.93), "shin.R": (-0.3, 0.2, -0.93),
                                "foot.L": (0.2, -0.3, -0.93), "foot.R": (-0.2, -0.3, -0.93),
                                "toe.L": (0.3, -0.95, 0), "toe.R": (-0.3, -0.95, 0),
                                "shoulder.L": (0.35, 0, -0.94), "shoulder.R": (-0.35, 0, -0.94),
                                "front_thigh.L": (0.82, 0.1, -0.56), "front_thigh.R": (-0.82, 0.1, -0.56),
                                "front_shin.L": (0.3, -0.1, -0.95), "front_shin.R": (-0.3, -0.1, -0.95),
                                "front_foot.L": (0.2, -0.3, -0.93), "front_foot.R": (-0.2, -0.3, -0.93),
                                "front_toe.L": (0.35, -0.94, 0), "front_toe.R": (-0.35, -0.94, 0)},
                      cores={"pelo": "#5f8a48", "listra": "#46703a", "claro": "#e2dca0", "nariz": "#2e3a28",
                             "boca": "#e09098", "dente": "#fbfbf4"},
                      zonas=[(lambda bi: zona_ossos("spine.002", "spine.001", "spine")(bi) & zona_classe("claro")(bi), "#46703a")],
                      boca=dict(prof=0.78, alt_frente=0.4, alt_tras=0.42, cor_boca="#e8a0a0", cor_lingua="#f0b8b0", larg=0.85,
                                dentes=[(t, sx, lado, 0.3 if lado > 0 else 0.26) for t in (0.16, 0.27, 0.38, 0.49, 0.6, 0.71, 0.82)
                                        for sx in (1, -1) for lado in (1, -1)]),
                      pecas=pecas_croco),
    "tigre": dict(nome="Tigre", especie="tigre", base="Tiger_001", escala=0.95, familia="felino",
                  cores={"pelo": "#f2782e", "listra": "#26262a", "claro": "#f6f2ea", "nariz": "#e07a80",
                         "boca": "#b8303a", "dente": "#fbfbf6"},
                  boca=dict(prof=0.5, alt_frente=0.2, alt_tras=0.36,
                            dentes=[(0.2, 1, 1, 0.09), (0.2, -1, 1, 0.09), (0.22, 1, -1, 0.07), (0.22, -1, -1, 0.07)])),
    "leao": dict(nome="Leão", especie="leão", base="Tiger_001", escala=0.98, familia="felino",
                 esqueleto={"cabeca": (1.08, 0.95, 1.05), "cauda": (0.85, 1.0, 0.85)},
                 cores={"pelo": "#e0a54e", "listra": "#e0a54e", "claro": "#f2dcb4", "nariz": "#9a5a4a",
                        "boca": "#b8303a", "dente": "#fbfbf6"},
                 forma=forma_leao, zonas=[(zona_juba, "#a0521e")],
                 boca=dict(prof=0.5, alt_frente=0.2, alt_tras=0.36,
                           dentes=[(0.2, 1, 1, 0.09), (0.2, -1, 1, 0.09), (0.22, 1, -1, 0.07), (0.22, -1, -1, 0.07)]),
                 pecas=pecas_leao),
    "zebra": dict(nome="Zebra", especie="zebra", base="Deer_001", escala=1.15, familia="ungulado",
                  tirar=["chifre"], subdividir=True, chamado="Relinchar",
                  esqueleto={"tronco": (1.3, 1.18, 1.2), "pescoco": (1.5, 1.15, 1.4), "cabeca": (1.05, 1.45, 1.05),
                             "orelhas": (1.0, 1.15, 1.0), "pernas": (1.1, 1.18, 1.1), "pelves": (1.1, 1.1, 1.1),
                             "ombros": (1.1, 1.1, 1.1), "dedos": (1.2, 0.95, 1.1),
                             "dedos_frente": (1.2, 0.95, 1.1), "cauda": (0.5, 2.2, 0.5)},
                  giros={"spine.006": [("x", -4)]},
                  cores={"pelo": "#f4f2ec", "perna": "#f4f2ec", "escuro": "#1c1a1c", "barriga": "#f4f2ec",
                         "casco": "#3a3638", "pelo_escuro": "#f4f2ec", "focinho": "#2a2628", "cinza": "#2a2628",
                         "cauda_baixo": "#f4f2ec", "orelha_dentro": "#f4f2ec", "pescoco": "#f4f2ec",
                         "orelha_dentro2": "#f4f2ec", "listra": "#24242a", "branco": "#f4f2ec"},
                  padrao=listras_zebra, pecas=pecas_zebra),
    "cervo": dict(nome="Cervo", especie="cervo", base="Deer_001", escala=1.0, familia="ungulado", chamado="Bramir",
                  cores={"chifre": "#8a6a4a", "pelo": "#a8663e", "perna": "#b8784c", "escuro": "#241c1a",
                         "barriga": "#f0e2c8", "casco": "#3a302c", "pelo_escuro": "#6a4630", "focinho": "#e8d4b8",
                         "cinza": "#3a3030", "cauda_baixo": "#f6efe2", "orelha_dentro": "#e8c0a8", "pescoco": "#9a5c38",
                         "orelha_dentro2": "#e8c0a8"}),
    "urso_polar": dict(base_de="urso", nome="Urso-polar", especie="urso", escala=1.08,
                       cores={"pelo": "#f2eee4", "listra": "#f2eee4", "claro": "#e8e2d4", "nariz": "#1c1a1c",
                              "boca": "#b8303a", "dente": "#fbfbf6"},
                       zonas=[]),
}
del ESPECIES["elefante_"]


# ligações que dependem das funções acima
ESPECIES["girafa"].update(comer_fn=girafa_comer, beber_fn=girafa_beber)
ESPECIES["elefante"].update(comer_fn=elefante_comer, beber_fn=elefante_beber, chamar_fn=elefante_chamar,
                            extras_anim=lambda bi, sp: elefante_banho(bi, sp), extra_pacote=extra_tromba,
                            deitar_pose={"quadril": [("y", 84)], "tras": [("x", -20), ("x", 10)], "frente": [("x", -15), ("x", 10)],
                                         "tromba*": [[("x", -10)], [("x", -20)], [("x", -20)], [("x", -10)], [("x", 0)]]},
                            dormir_alvo=(0, -60, "z"))
