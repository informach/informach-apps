"""Pisos de praia da categoria props_praia (15 × 15 m, origem no centro, topo da areia em z = 0).

- piso_areia: areia lisa com marolas de vento, conchas, estrelas-do-mar e pedrinhas (nada cruza a borda).
- piso_areia_calcadao: o calçadão em ondas da orla (mesmo desenho e fase da peça "orla" da categoria agua, de
  y = −7,5 a −2,3), uma mureta baixa de sentar (com passagem no meio) e areia até +7,5. Encosta na orla pelo lado X.
- piso_areia_mar: beira-mar. Areia seca na borda −Y (z = 0, casa com piso_areia), desce pela areia molhada até o mar
  (lâmina em z = −1,0, como a agua_aberta) e chega à borda +Y no fundo agua_funda em z = −1,7 (casa com a
  agua_aberta). A linha d'água ondula com período de 7,5 m em X, então as peças vizinhas continuam sem degrau.
  A espuma da rebentação é um filho animado ("deslizar" para a praia e de volta).
Todas as lajes descem até z = −1,9 (o fundo das peças de água), para não abrir fresta ao lado do mar.
"""
import math
import random

import moveis_base as mb
import cidade_base as cb
import props_praia_base as bb
from props_praia_base import Malha, V

H, Q = cb.H, cb.Q
Z_AGUA, Z_FUNDO_MAR, Z_BASE = -1.0, -1.7, -1.9
Y_ORLA, MURETA_W = -2.0, 0.30
AREIA, AREIA_CLARA, AREIA_ESC = "areia", "bege", "bege_escuro"


def faixa_chao(pts, larg, z, cor, nome="decal", pontas=True):
    """Tira plana (decalque) ao longo de uma linha 2D, a z (fina, sem espessura)."""
    m = Malha()
    P = [V((p[0], p[1])) for p in pts]
    esq, dir_ = [], []
    for i, p in enumerate(P):
        a, b = P[max(0, i - 1)], P[min(len(P) - 1, i + 1)]
        t = (b - a).normalized()
        n = V((-t.y, t.x))
        w = larg / 2 * (1.0 if (0 < i < len(P) - 1 or not pontas) else 0.35)
        esq.append(m.v((p.x + n.x * w, p.y + n.y * w, z)))
        dir_.append(m.v((p.x - n.x * w, p.y - n.y * w, z)))
    for k in range(len(P) - 1):
        m.f((dir_[k], dir_[k + 1], esq[k + 1], esq[k]), cor)
    return m.obj(nome, recalc=False)


def mancha(cx, cy, rx, ry, z, cor, seed=0, n=16):
    rnd = random.Random(seed)
    fases = [rnd.uniform(0, 6.28) for _ in range(3)]
    pts = [(cx + rx * math.cos(t) * (1 + 0.12 * math.sin(3 * t + fases[0]) + 0.06 * math.sin(5 * t + fases[1])),
            cy + ry * math.sin(t) * (1 + 0.1 * math.cos(2 * t + fases[2]))) for t in [2 * math.pi * k / n for k in range(n)]]
    return mb.extrudado(bb.ccw(pts), 0.004, z=z - 0.004, cor=cor, bisel=0.0, nome="mancha", liso=False)


def concha(x, y, r=0.09, cor="rosa_claro", rot=0.0, z=0.0):
    """Conchinha em leque (meio cone achatado com gomos)."""
    pts = [(0, 0)] + [(r * math.cos(math.radians(a)), r * math.sin(math.radians(a))) for a in range(20, 161, 20)]
    ob = mb.extrudado(bb.ccw(pts), 0.025, z=z - 0.005, cor=cor, bisel=0.01, seg=1)
    bb.mover(ob, x, y, 0, rot)
    return ob


def estrela(x, y, r=0.14, cor="laranja", rot=0.0, z=0.0):
    pts = []
    for k in range(10):
        rr = r if k % 2 == 0 else r * 0.42
        a = math.radians(rot + 36 * k)
        pts.append((x + rr * math.cos(a), y + rr * math.sin(a)))
    return mb.extrudado(bb.ccw(pts), 0.03, z=z - 0.008, cor=cor, bisel=0.012, seg=1)


def pedrinha(x, y, r, cor="cinza_claro", z=0.0):
    return bb.se(2 * r, 1.6 * r, r, x=x, y=y, z=z - 0.3 * r, cor=cor, e=0.7, e_v=0.7, nu=8, nv=4,
                             nome="pedra")


def marolas(rnd, x0, x1, y0, y1, n, z=0.0015, cor=AREIA_CLARA):
    """Marolinhas de vento: tracinhos ondulados curtos, todos dentro do retângulo."""
    objs = []
    for k in range(n):
        cx, cy = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        L = rnd.uniform(0.9, 2.0)
        pts = [(cx - L / 2 + L * j / 8, cy + 0.06 * math.sin(j * 1.3 + k)) for j in range(9)]
        objs.append(faixa_chao(pts, 0.07, z, cor, "marola"))
    return mb.junta(objs, "marolas")


def enfeites_areia(it, x0, x1, y0, y1, seed=3, n_marolas=16, conchas=7, estrelas=1, pedras=5, manchas=3, graos=70):
    rnd = random.Random(seed)
    m = 0.5
    x0, x1, y0, y1 = x0 + m, x1 - m, y0 + m, y1 - m
    it.add(marolas(rnd, x0, x1, y0, y1, n_marolas))
    for k in range(manchas):
        it.add(mancha(rnd.uniform(x0 + 1, x1 - 1), rnd.uniform(y0 + 0.8, y1 - 0.8), rnd.uniform(0.8, 1.6),
                      rnd.uniform(0.5, 0.9), 0.0012 + 0.0008 * k, AREIA_CLARA if k % 2 else "creme", seed=k + seed))
    cores = ["rosa_claro", "branco", "salmao", "creme", "pessego"]
    for k in range(conchas):
        it.add(concha(rnd.uniform(x0, x1), rnd.uniform(y0, y1), r=rnd.uniform(0.06, 0.1), cor=cores[k % len(cores)],
                      rot=rnd.uniform(0, 360)))
    for k in range(estrelas):
        it.add(estrela(rnd.uniform(x0, x1), rnd.uniform(y0, y1), cor=("laranja", "coral" if False else "salmao")[k % 2],
                       rot=rnd.uniform(0, 72)))
    m = Malha()
    for k in range(graos):
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        r = rnd.uniform(0.025, 0.045)
        m.poligono([(x + r * math.cos(a), y + r * math.sin(a), 0.0035) for a in (0, 2.1, 4.2)],
                   "branco" if k % 3 else "creme_claro")
    if graos:
        it.add(m.obj("graos", recalc=False))
    for k in range(pedras):
        it.add(pedrinha(rnd.uniform(x0, x1), rnd.uniform(y0, y1), rnd.uniform(0.05, 0.12),
                        rnd.choice(["cinza_claro", "cinza", "bege_escuro"])))


# ------------------------------------------------------------------------------------------------ peças
def p_piso_areia(it):
    it.add(cb.laje(cb.quadrado(-H, -H, H, H), 0.0, AREIA, z_fundo=Z_BASE, nome="areia"))
    enfeites_areia(it, -H, H, -H, H, seed=3, n_marolas=22, conchas=9, estrelas=2, pedras=6, manchas=4)
    return dict(plana=True, col=[((0, 0, Z_BASE), (Q, Q, -Z_BASE))])


def calcadao(it, y0, y1):
    """O calçadão da orla (agua/orla): branco com três ondas grafite, período de 3,75 m em X."""
    it.add(cb.laje(cb.quadrado(-H, y0, H, y1), 0.0, "branco", z_fundo=Z_BASE, nome="calcadao"))
    for k in range(3):
        yc = y0 + (y1 - y0) * (k + 0.5) / 3
        xs = [-H + 0.03 + (Q - 0.06) * j / 120 for j in range(121)]
        pts = [(x, yc + 0.42 * math.cos(2 * math.pi * (x + H) / 3.75)) for x in xs]
        it.add(cb.faixa(pts, larg=0.32, cor="grafite", z=0.0, nome="onda"))


def p_piso_areia_calcadao(it):
    e0, e1 = Y_ORLA - MURETA_W, Y_ORLA
    calcadao(it, -H, e0)
    it.add(cb.laje(cb.quadrado(-H, e0, H, H), 0.0, AREIA, z_fundo=Z_BASE, nome="areia"))
    # mureta baixa de sentar, com passagem no meio (cabeceiras arredondadas)
    gap = 1.4
    for xa, xb in ((-H, -gap), (gap, H)):
        it.add(mb.caixa(xb - xa, MURETA_W, 0.45, x=(xa + xb) / 2, y=(e0 + e1) / 2, z=-0.02, cor="concreto",
                        bisel=0.04, seg=2))
        it.add(mb.caixa(xb - xa + 0.0, MURETA_W + 0.06, 0.05, x=(xa + xb) / 2, y=(e0 + e1) / 2, z=0.43,
                        cor="calcada", bisel=0.02, seg=2))
    for sx in (-1, 1):
        it.add(mb.cilindro(MURETA_W / 2 + 0.03, 0.48, x=sx * gap, y=(e0 + e1) / 2, z=-0.02, cor="calcada", seg=16,
                           bisel=0.03))
    # areia que o vento joga no calçadão junto da passagem, e enfeites da areia
    it.add(mancha(0.0, e0 - 0.35, 1.0, 0.28, 0.003, AREIA, seed=9))
    enfeites_areia(it, -H, H, e1 + 0.2, H, seed=5, n_marolas=14, conchas=6, estrelas=1, pedras=4, manchas=3)
    col = [((0, (-H + H) / 2, Z_BASE), (Q, Q, -Z_BASE)),
           ((-(H + gap) / 2, (e0 + e1) / 2, 0.0), (H - gap, MURETA_W, 0.48)),
           (((H + gap) / 2, (e0 + e1) / 2, 0.0), (H - gap, MURETA_W, 0.48))]
    return dict(plana=True, col=col)


# beira-mar ---------------------------------------------------------------------------------------------------------
def off_mar(x):
    """Deslocamento da linha d'água em Y (período de 7,5 m em X: casa nas bordas)."""
    return 0.55 * math.sin(2 * math.pi * x / 7.5) + 0.22 * math.sin(2 * math.pi * x / 3.75 + 1.0)


T0, T1 = -2.5, 5.5


def z_mar(x, y):
    u = min(1.0, max(0.0, (y - off_mar(x) - T0) / (T1 - T0)))
    return Z_FUNDO_MAR * u * u * (3 - 2 * u)


def y_contorno(x, z_alvo):
    a, b = -H, H
    for _ in range(40):
        c = (a + b) / 2
        if z_mar(x, c) > z_alvo:
            a = c
        else:
            b = c
    return (a + b) / 2


def faixa_relevo(z_hi, z_lo, cor, dz=0.012, n=60, nj=4, nome="faixa"):
    """Faixa colada no relevo da beira-mar entre as curvas de nível z_hi e z_lo (bordas lisas)."""
    xs = [-H + Q * i / n for i in range(n + 1)]
    P = []
    for x in xs:
        ya, yb = y_contorno(x, z_hi), y_contorno(x, z_lo)
        P.append([(x, ya + (yb - ya) * j / nj, z_mar(x, ya + (yb - ya) * j / nj) + dz) for j in range(nj + 1)])
    m = Malha()
    m.grade(P, lambda i, j: cor)
    return m.obj(nome, liso=True, angulo=30, recalc=False)


def p_piso_areia_mar(it):
    nx = 45  # passo de 1/3 m: o relevo segue a curva sem furar as faixas coladas
    ys = [-H, -6.75, -6.0, -5.25] + [round(-4.5 + k * 0.3, 4) for k in range(41)]
    xs = [-H + Q * i / nx for i in range(nx + 1)]
    m = Malha()
    P = [[(x, y, z_mar(x, y)) for y in ys] for x in xs]

    def cor(i, j):
        zmin = min(P[i][j][2], P[i + 1][j][2], P[i][j + 1][2], P[i + 1][j + 1][2])
        return "agua_funda" if zmin < Z_FUNDO_MAR + 0.01 else AREIA

    top = m.grade(P, cor)  # i em x, j em y: normal para cima
    # saias: laterais x = ±H, frente y = −H, fundo y = +H e base
    nyv = len(ys)
    for i, sx in ((0, -1), (nx, 1)):
        base = [m.v((xs[i], y, Z_BASE)) for y in ys]
        for j in range(nyv - 1):
            q = (top[i][j], top[i][j + 1], base[j + 1], base[j])
            m.f(q if sx < 0 else q[::-1], AREIA_ESC if P[i][j][2] > -1.0 else "agua_funda")
    for j, sy in ((0, -1), (nyv - 1, 1)):
        base = [m.v((x, ys[j], Z_BASE)) for x in xs]
        for i in range(nx):
            q = (top[i][j], top[i + 1][j], base[i + 1], base[i])
            m.f(q[::-1] if sy < 0 else q, AREIA_ESC if sy < 0 else "agua_funda")
    m.poligono([(-H, -H, Z_BASE), (-H, H, Z_BASE), (H, H, Z_BASE), (H, -H, Z_BASE)], "agua_funda", normal=(0, 0, -1))
    it.add(m.obj("areia_mar", liso=True, angulo=30, recalc=False))
    it.add(faixa_relevo(-0.40, -1.03, AREIA_ESC, nome="areia_molhada"))
    it.add(faixa_relevo(-0.40, -0.47, "bege", dz=0.015, n=60, nj=1, nome="linha_seca"))
    it.add(faixa_relevo(-1.38, Z_FUNDO_MAR + 0.002, "agua_funda", dz=0.01, nome="fundo"))
    # lâmina d'água (a parte por baixo da areia fica escondida)
    y_min = min(y_contorno(x, Z_AGUA) for x in xs) - 0.6
    ma = Malha()
    ma.poligono([(-H, y_min, Z_AGUA), (H, y_min, Z_AGUA), (H, H, Z_AGUA), (-H, H, Z_AGUA)], "m:agua")
    it.add(ma.obj("agua", recalc=False))
    # espuma: na linha d'água e duas marolas mais para fora (tracejadas), animada
    xs2 = [-H + Q * k / 90 for k in range(91)]
    esp = []
    linha = [(x, y_contorno(x, Z_AGUA) + 0.18) for x in xs2]
    esp.append(faixa_chao(linha, 0.38, Z_AGUA + 0.012, "branco", "espuma", pontas=False))
    linha2 = [(x, y_contorno(x, Z_AGUA) + 0.62 + 0.08 * math.sin(2 * math.pi * x / 1.875)) for x in xs2]
    esp.append(faixa_chao(linha2, 0.12, Z_AGUA + 0.011, "branco_gelo", "espuma", pontas=False))
    for desl, larg, per in ((1.9, 0.16, 5.0), (3.6, 0.12, 3.75)):
        for k in range(int(Q / per)):
            xa = -H + k * per + 0.4
            xb = xa + per * 0.62
            pts = [(xa + (xb - xa) * j / 14, y_contorno(xa + (xb - xa) * j / 14, Z_AGUA) + desl +
                    0.12 * math.sin(math.pi * j / 14)) for j in range(15)]
            esp.append(faixa_chao(pts, larg, Z_AGUA + 0.01, "branco", "marola"))
    it.anima(esp, {"anima": "deslizar", "eixo": "z", "curso": 0.45, "periodo": 6.0}, "espuma", pivo=(0, 0, Z_AGUA))
    # areia molhada: algas e conchas; areia seca: enfeites
    rnd = random.Random(11)
    for k in range(6):
        x = rnd.uniform(-6.5, 6.5)
        y = y_contorno(x, -0.75)
        it.add(mancha(x, y, rnd.uniform(0.18, 0.35), 0.1, z_mar(x, y) + 0.01, "verde_oliva", seed=k))
    for k in range(5):
        x = rnd.uniform(-6.5, 6.5)
        y = y_contorno(x, -0.6)
        it.add(concha(x, y, cor=["branco", "rosa_claro", "salmao"][k % 3], rot=rnd.uniform(0, 360), z=z_mar(x, y)))
    enfeites_areia(it, -H, H, -H, -2.8, seed=8, n_marolas=10, conchas=4, estrelas=1, pedras=3, manchas=2)
    col = [((0, (-H - 2.5) / 2, Z_BASE), (Q, H - 2.5, -Z_BASE)),
           ((0, (-2.5 + 2.0) / 2, Z_BASE), (Q, 4.5, Z_BASE * -1 - 0.55)),
           ((0, (2.0 + H) / 2, Z_BASE), (Q, H - 2.0, Z_FUNDO_MAR - Z_BASE))]
    return dict(plana=True, col=col)
