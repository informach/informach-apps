"""Áreas grandes da categoria parque_areas: lago com caminho (2 × 2), zoológico (2 × 2), pista de skate, playground
e palco de festival (15 × 15). Usado por cidade_parque_areas.py."""
import math
import random

import bpy  # noqa: F401
import numpy as np
from mathutils import Matrix, Vector

import moveis_base as mb
import cidade_base as cb
import parque_areas_base as pb
from parque_areas_base import (terreno_caminho, Malha, Terreno, Rede, W_CAM, G_GUIA, NIVEIS_GUIA, z_guia, cor_grama, tufo, flores,
                               arbusto, moita, arvore, arvore_alta, acacia, pinheiro, pedra, rocha_colunas, banco,
                               poste_praca, lixeiras, lixeira, cerca, mover, gira_z)

V = Vector


def caixa(*a, **k):
    """mb.caixa com bisel de 1 segmento (leve)."""
    k.setdefault("seg", 1)
    return mb.caixa(*a, **k)

H, Q, ZF = cb.H, cb.Q, cb.Z_FUNDO
EST = None  # função estampa(nome, emissao) do gerador


def val(fn, x, y):
    return float(fn(np.array([float(x)]), np.array([float(y)]))[0])


def grad(fn, x, y, e=0.05):
    gx = (val(fn, x + e, y) - val(fn, x - e, y)) / (2 * e)
    gy = (val(fn, x, y + e) - val(fn, x, y - e)) / (2 * e)
    g = V((gx, gy))
    return g.normalized() if g.length > 1e-9 else V((0, 1))


def contorno_radial(fn, cx, cy, n=128, rmax=25.0):
    """Contorno fn = 0 por raios a partir de (cx, cy) (forma estrelada, fn < 0 dentro)."""
    pts = []
    rs = np.linspace(0.0, rmax, 500)
    for k in range(n):
        a = 2 * math.pi * k / n
        dx, dy = math.cos(a), math.sin(a)
        vs = fn(cx + rs * dx, cy + rs * dy)
        idx = int(np.argmax(vs > 0))
        lo, hi = rs[max(0, idx - 1)], rs[idx]
        for _ in range(30):
            mid = (lo + hi) / 2
            if val(fn, cx + mid * dx, cy + mid * dy) > 0:
                hi = mid
            else:
                lo = mid
        r = (lo + hi) / 2
        pts.append((cx + r * dx, cy + r * dy))
    return pts


def ate_campo(fn, p0, d, alvo, passo=0.05, maximo=40.0):
    """Anda de p0 na direção d até fn ≤ alvo; devolve o ponto."""
    p = V(p0)
    d = V(d).normalized()
    s = 0.0
    while s < maximo:
        q = p + d * s
        if val(fn, q.x, q.y) <= alvo:
            return (q.x, q.y)
        s += passo
    return (p.x, p.y)


def gira_pts(pts, ang, cx=0.0, cy=0.0):
    c, s = math.cos(math.radians(ang)), math.sin(math.radians(ang))
    return [(cx + x * c - y * s, cy + x * s + y * c) for x, y in pts]


# =====================================================================================================================
# Lago com caminho em volta (2 × 2)
# =====================================================================================================================
def taboas(x, y, z0, n=5, alt=1.1, seed=0):
    ps = []
    for k in range(n):
        a = seed * 1.7 + k * 2.4
        rr = 0.12 + 0.1 * ((k * 37 + seed * 11) % 5) / 5
        px, py = x + math.cos(a) * rr, y + math.sin(a) * rr
        h = alt * (0.75 + 0.25 * ((k * 13 + seed) % 4) / 3)
        ps.append(mb.cilindro(0.018, h, x=px, y=py, z=z0, cor="folha", seg=4, bisel=0, tampas=False))
        ps.append(mb.cilindro(0.045, 0.2, x=px, y=py, z=z0 + h * 0.72, cor="marrom", seg=6, bisel=0.0))
        fo = caixa(0.05, 0.012, h * 0.8, cor="folha_clara", bisel=0.0, seg=1)
        mb.transforma(fo, rot=[("Z", math.degrees(a)), ("X", 14)])
        mb.transforma(fo, loc=(px, py, z0))
        ps.append(fo)
    return mb.junta(ps, "taboas")


def vitoria_regia(x, y, z, r=0.35, flor=False):
    pts = [(r * math.cos(t), r * math.sin(t)) for t in [math.radians(20 + 340 * k / 11) for k in range(12)]] + [(0, 0)]
    ps = [mb.extrudado(pb.ccw(pts), 0.025, x=x, y=y, z=z, cor="verde_claro", bisel=0.0, seg=1, liso=False)]
    if flor:
        ps.append(mb.cilindro(0.09, 0.06, x=x - r * 0.3, y=y + r * 0.2, z=z + 0.02, r2=0.05, cor="rosa_bebe", seg=6,
                              bisel=0.0))
    return mb.junta(ps, "vitoria")


def pato(x, y, z, ang=0.0, cor="amarelo"):
    ps = [mb.superelipsoide(0.34, 0.22, 0.18, x=0, y=0, z=-0.05, cor=cor, e=0.7, e_v=0.7, nu=10, nv=5),
          mb.esfera(0.075, x=0.13, y=0, z=0.17, cor=cor, seg=8),
          mb.superelipsoide(0.08, 0.06, 0.03, x=0.21, y=0, z=0.15, cor="laranja", e=0.6, nu=6, nv=3),
          mb.superelipsoide(0.12, 0.05, 0.06, x=-0.16, y=0, z=0.08, cor=cor, e=0.6, nu=6, nv=3)]
    for sy in (-0.035, 0.035):
        ps.append(caixa(0.012, 0.022, 0.022, x=0.2, y=sy, z=0.18, cor="preto", bisel=0.004, seg=1))
    ob = mb.junta(ps, "pato")
    gira_z(ob, ang)
    ob.data.transform(Matrix.Translation((x, y, z)))
    return ob


def pedalinho(cor="branco", cor2="rosa"):
    """Pedalinho de cisne, centrado na origem, na linha d'água em z = 0, frente para −Y."""
    ps = [mb.superelipsoide(1.25, 2.1, 0.62, z=-0.22, cor=cor, e=0.55, e_v=0.6, nu=16, nv=6),
          mb.superelipsoide(1.05, 1.6, 0.16, y=0.15, z=0.32, cor="madeira_clara", e=0.4, e_v=0.5, nu=12, nv=3)]
    # pescoço e cabeça do cisne na frente
    ps.append(mb.tubo([(0, -0.75, 0.25), (0, -1.0, 0.75), (0, -0.95, 1.25), (0, -1.15, 1.45)], 0.11, cor=cor,
                      raio_curva=0.3, seg=10))
    ps.append(mb.superelipsoide(0.24, 0.36, 0.24, y=-1.22, z=1.36, cor=cor, e=0.8, e_v=0.8, nu=10, nv=6))
    ps.append(mb.cilindro(0.06, 0.2, x=0, y=-1.42, z=1.42, r2=0.02, eixo="y", cor="laranja", seg=8, bisel=0.0))
    for sx in (-0.09, 0.09):
        ps.append(mb.esfera(0.025, x=sx, y=-1.3, z=1.44, cor="preto", seg=6))
    # asas (laterais) e rabo
    for sx in (-1, 1):
        a = mb.superelipsoide(0.18, 1.3, 0.5, x=sx * 0.6, y=0.25, z=0.05, cor=cor2, e=0.6, e_v=0.7, nu=10, nv=4)
        mb.transforma(a, rot=("Y", sx * 12))
        ps.append(a)
    ps.append(mb.superelipsoide(0.6, 0.4, 0.5, y=1.05, z=0.25, cor=cor, e=0.7, e_v=0.7, nu=10, nv=5))
    # dois bancos e o volante
    ps.append(caixa(0.95, 0.38, 0.12, y=0.35, z=0.38, cor=cor2, bisel=0.04))
    ps.append(caixa(0.95, 0.1, 0.4, y=0.58, z=0.45, cor=cor2, bisel=0.04))
    ps.append(mb.tubo([(0, -0.25, 0.4), (0, -0.25, 0.75)], 0.025, cor="grafite", seg=6))
    ps.append(mb.cilindro(0.16, 0.03, x=0, y=-0.25, z=0.76, cor="grafite", seg=12, bisel=0.008))
    return ps


def p_lago(it):
    HL = Q
    c1, c2 = (-4.0, 0.7, 5.2), (4.6, -0.5, 4.5)
    fn_forma = lambda X, Y: pb.smin(pb.sd_circulo(X, Y, *c1), pb.sd_circulo(X, Y, *c2), 3.5)  # noqa: E731
    lago = contorno_radial(fn_forma, 0.0, 0.0, n=112)
    d_lago = lambda X, Y: pb.sd_poligono(X, Y, lago)  # noqa: E731
    D_CAM = 3.8
    anel = contorno_radial(lambda X, Y: d_lago(X, Y) - D_CAM, 0.0, 0.0, n=140)
    r = Rede(limite=(-HL, -HL, HL, HL), k=1.2)
    r.traco(anel, fechado=True)
    bracos = [((-7.5, -HL), (0, 1)), ((7.5, HL), (0, -1)), ((-HL, 7.5), (1, 0)), ((HL, -7.5), (-1, 0))]
    for p0, d in bracos:
        p1 = ate_campo(d_lago, p0, d, D_CAM)
        r.traco([p0, p1])
    Z_AG = -0.12
    LV = [-1.6, -0.5, -0.06, 0.0, 0.012, 0.588, 0.6]
    ZV = [-1.0, -0.55, -0.32, 0.08, 0.08, 0.08, 0.0]

    def z_lago(d):
        if d <= LV[0]:
            return ZV[0]
        if d >= LV[-1]:
            return 0.0
        for k in range(len(LV) - 1):
            if LV[k] <= d <= LV[k + 1]:
                t = (d - LV[k]) / (LV[k + 1] - LV[k])
                return ZV[k] + (ZV[k + 1] - ZV[k]) * t
        return 0.0

    def ec(c, x, y):
        d = c["lago"]
        if d < LV[0]:
            return "agua_funda"
        if d < -0.06:
            return "areia"
        if d < 0.6:
            return "creme"
        return None

    def ez(c, x, y):
        return z_lago(c["lago"])

    terreno_caminho(it, r, -HL, -HL, HL, HL, 0.5, extra_cor=ec, extra_z=ez, campos=[("lago", d_lago, LV)])
    it.add(r.juntas())
    # água
    ag = [(p[0], p[1]) for p in contorno_radial(lambda X, Y: d_lago(X, Y) + 0.02, 0.0, 0.0, n=112)]
    it.add(pb.decal(ag, Z_AG, "m:agua", nome="agua"))
    # enfeites do lago
    rnd = random.Random(5)
    for k, (x, y, fl) in enumerate(((-5.6, 2.2, True), (-6.4, 1.1, False), (-2.6, -1.6, False), (5.5, 1.0, True),
                                    (6.3, -0.4, False), (3.3, -2.6, True), (-4.9, -2.3, False))):
        it.add(vitoria_regia(x, y, Z_AG + 0.005, r=0.38 + 0.08 * (k % 2), flor=fl))
    it.add(pato(-2.0, 2.4, Z_AG, ang=30), pato(-1.2, 2.9, Z_AG, ang=60, cor="branco"), pato(2.0, 1.4, Z_AG, ang=200))
    for ang, cl in ((150, 0), (200, 1), (20, 2), (330, 3)):
        a = math.radians(ang)
        px, py = ate_campo(d_lago, (0.0 + 9 * math.cos(a), 0.0 + 9 * math.sin(a)), (-math.cos(a), -math.sin(a)), -0.25)
        it.add(taboas(px, py, -0.5, n=5, seed=cl))
    for ang, l, cor in ((115, 0.9, "cinza"), (128, 0.55, "cinza_claro"), (300, 0.8, "cinza"), (285, 0.5, "cinza_medio"),
                        (60, 0.6, "cinza_claro")):
        a = math.radians(ang)
        px, py = ate_campo(d_lago, (12 * math.cos(a), 12 * math.sin(a)), (-math.cos(a), -math.sin(a)), 0.25)
        it.add(pedra(px, py, 0.05, l, l * 0.8, l * 0.6, cor=cor, seed=ang))
    # jato d'água no lobo oeste (com luz embaixo à noite)
    jx, jy = c1[0] - 0.4, c1[1] + 0.2
    jato = [mb.cilindro(0.35, 0.12, x=jx, y=jy, z=Z_AG - 0.06, cor="metal_escuro", seg=12, bisel=0.02),
            mb.cilindro(0.09, 2.4, x=jx, y=jy, z=Z_AG, r2=0.05, cor=None, mat="agua", seg=10, bisel=0.0),
            mb.torno([(0.05, 2.25), (0.4, 2.35), (0.85, 1.6), (1.2, 0.25), (1.25, 0.0), (1.05, 0.0), (0.75, 1.3),
                      (0.3, 2.1), (0.0, 2.2)], x=jx, y=jy, z=Z_AG, cor=None, mat="agua", seg=20),
            mb.cilindro(1.3, 0.04, x=jx, y=jy, z=Z_AG + 0.005, r2=1.0, cor="branco_gelo", seg=20, bisel=0.0)]
    it.add(jato)
    for k in range(4):
        a = math.radians(45 + 90 * k)
        it.add(caixa(0.16, 0.16, 0.08, x=jx + 0.5 * math.cos(a), y=jy + 0.5 * math.sin(a), z=Z_AG - 0.07, cor=None,
                        mat="luz", bisel=0.02))
    # píer de madeira no sul do lobo leste, com cerca e boia
    px = c2[0] - 0.3
    ye = ate_campo(d_lago, (px, -HL + 2), (0, 1), 0.0)[1]
    y0, y1 = ye - 2.25, ye + 2.6
    deck = []
    for k in range(int((y1 - y0) / 0.32)):
        yy = y0 + 0.16 + k * 0.32
        deck.append(caixa(2.2, 0.29, 0.07, x=px, y=yy, z=0.16, cor="madeira_mel" if k % 2 else "madeira_clara",
                             bisel=0.015, seg=1))
    for sx in (-1.0, 1.0):
        deck.append(caixa(0.12, y1 - y0, 0.14, x=px + sx, y=(y0 + y1) / 2, z=0.04, cor="madeira_media", bisel=0.02))
        for yy in (ye - 0.1, ye + 1.2, y1 - 0.15):
            deck.append(mb.cilindro(0.08, 1.15 + (0 if yy < ye else 0.55), x=px + sx, y=yy,
                                    z=-0.62 if yy >= ye else 0.0, cor="madeira_media", seg=8, bisel=0.02))
        deck.append(caixa(0.08, y1 - ye + 0.1, 0.07, x=px + sx, y=(ye + y1) / 2 - 0.05, z=1.0,
                             cor="madeira_mel", bisel=0.02))
        deck.append(caixa(0.05, y1 - ye + 0.1, 0.05, x=px + sx, y=(ye + y1) / 2 - 0.05, z=0.62,
                             cor="madeira_mel", bisel=0.015))
    deck.append(mb.torno([(0.14, -0.08), (0.24, 0.0), (0.24, 0.06), (0.14, 0.12)], x=px + 1.15, y=y1 - 0.4, z=0.45,
                         cor="vermelho", seg=16))
    it.add(mb.junta(deck, "pier"))
    # pedalinhos de cisne num percurso fechado
    volta = contorno_radial(lambda X, Y: d_lago(X, Y) + 2.0, 0.0, 0.0, n=180)
    L = pb.comprimento(volta, True)
    n = int(L / 0.75)
    pts = [pb.ponto_em(volta, L * k / n, True)[0] for k in range(n)]
    pts3 = [(p.x, p.y, Z_AG) for p in pts]
    pontos = pb.gl_pts(pts3)
    cores = (("branco", "rosa"), ("rosa_claro", "rosa"), ("branco", "azul_claro"))
    for k, (ca, cb_) in enumerate(cores):
        atraso = round(L * k / 3, 3)
        p, t = pb.ponto_em(volta, -atraso, True)
        partes = pedalinho(ca, cb_)
        ang = math.degrees(math.atan2(t.y, t.x)) + 90
        for o in partes:
            gira_z(o, ang)
            o.data.transform(Matrix.Translation((p.x, p.y, Z_AG)))
        nome = f"pedalinho_{k + 1}"
        it.anima(partes, {"anima": "percurso", "pontos": pontos, "velocidade": 0.6, "atraso": atraso,
                          "fechado": True}, nome, pivo=(p.x, p.y, Z_AG))
        c, s = math.cos(math.radians(ang)), math.sin(math.radians(ang))
        for j, lx in enumerate((-0.24, 0.24)):
            ly = 0.35
            it.assento(f"assento_pedalinho_{k + 1}_{j + 1}", p.x + lx * c - ly * s, p.y + lx * s + ly * c,
                       Z_AG + 0.44, pai=nome)
    # bancos de frente para o lago (entre a orla e o caminho), postes e lixeiras do lado de fora
    for ang in (100, 165, 280, 345):
        a = math.radians(ang)
        x, y = ate_campo(d_lago, (14 * math.cos(a), 14 * math.sin(a)), (-math.cos(a), -math.sin(a)), 1.55)
        g = grad(d_lago, x, y)
        rot = math.degrees(math.atan2(-g.y, -g.x)) + 90  # frente do banco (−Y) para o lago
        it.add(banco(it, x, y, ang=rot))
    for ang in (60, 135, 215, 300):
        a = math.radians(ang)
        x, y = ate_campo(d_lago, (14 * math.cos(a), 14 * math.sin(a)), (-math.cos(a), -math.sin(a)), 5.7)
        it.add(poste_praca(x, y))
    for ang in (85, 260):
        a = math.radians(ang)
        x, y = ate_campo(d_lago, (14 * math.cos(a), 14 * math.sin(a)), (-math.cos(a), -math.sin(a)), 5.5)
        it.add(lixeira(x, y))
    # árvores, arbustos e flores longe do caminho
    f_cam = r.f
    cands = [(-12.2, -12.0), (-12.6, 2.8), (-11.8, 11.9), (-3.2, 12.6), (3.5, 12.8), (12.3, 11.7), (12.4, -2.8),
             (11.9, -12.3), (2.6, -12.7), (-2.0, -12.9), (-12.9, -4.0), (12.9, 4.4), (8.8, 12.9), (-8.6, -12.9),
             (6.0, -9.6), (-6.2, 9.4), (9.6, 7.0), (-9.8, -6.8)]
    k = 0
    for x, y in cands:
        if val(f_cam, x, y) < W_CAM + G_GUIA + 1.4 or val(d_lago, x, y) < 1.0:
            continue
        if k % 3 == 0:
            it.add(arvore(x, y, esc=1.15, seed=k))
        elif k % 3 == 1:
            it.add(arvore_alta(x, y, esc=1.25, cor="folha_clara" if k % 2 else "folha"))
        else:
            it.add(moita(x, y, esc=1.3))
        k += 1
    for x, y in ((-10.5, -9.2), (9.8, 9.9), (-9.6, 9.8), (10.4, -9.6), (0.2, 11.3), (-0.4, -11.0)):
        if val(f_cam, x, y) > W_CAM + G_GUIA + 0.8 and val(d_lago, x, y) > 0.9:
            it.add(flores(x, y, ("rosa", "branco"), n=6), flores(x + 0.5, y + 0.3, ("amarelo", "laranja"), n=5))
    for x, y in ((-13.6, 6.0), (13.7, -6.1), (6.4, 13.6), (-6.0, -13.7), (-1.5, 9.0), (1.2, -9.4)):
        if val(f_cam, x, y) > W_CAM + G_GUIA + 0.5 and val(d_lago, x, y) > 0.9:
            it.add(tufo(x, y))
    # colisão: fundo do lago, chão em volta da bacia, píer
    xs = [p[0] for p in lago]
    ys = [p[1] for p in lago]
    xlo, xhi, ylo, yhi = min(xs) - 0.6, max(xs) + 0.6, min(ys) - 0.6, max(ys) + 0.6
    col = [((0, 0, -1.1), (2 * HL, 2 * HL, 0.1)),
           ((0, (-HL + ylo) / 2, ZF), (2 * HL, ylo + HL, -ZF)), ((0, (HL + yhi) / 2, ZF), (2 * HL, HL - yhi, -ZF)),
           (((-HL + xlo) / 2, (ylo + yhi) / 2, ZF), (xlo + HL, yhi - ylo, -ZF)),
           (((HL + xhi) / 2, (ylo + yhi) / 2, ZF), (HL - xhi, yhi - ylo, -ZF)),
           ((px, (y0 + y1) / 2, -0.6), (2.2, y1 - y0, 0.83))]
    return {"col": col, "plana": False, "mini": (0.55, -1.0, 1.1),
            "extra": {"quadras": [2, 2], "z_agua": Z_AG}}


# =====================================================================================================================
# Zoológico (2 × 2)
# =====================================================================================================================
RECINTOS = [
    # nome, tipo, cx, cy, hx, hy, raio, giro, piso
    ("ursos", "grama_pedras", 0.3, -8.5, 3.3, 2.7, 1.4, 4, "grama_escura"),
    ("flamingos", "lago_raso", 8.6, -8.3, 2.8, 2.7, 1.5, -6, "menta"),
    ("hipopotamos", "lago_lama", -8.5, 0.2, 2.8, 2.9, 1.6, 3, "terra"),
    ("leoes", "savana_rocha", 0.0, 0.2, 3.3, 3.0, 1.6, -3, "terracota_clara"),
    ("girafas", "savana", 8.6, 0.0, 2.7, 3.0, 1.4, 5, "areia"),
    ("macacos", "floresta", -8.4, 8.6, 2.9, 2.7, 1.4, -5, "folha"),
    ("elefantes", "areia_bebedouro", 0.2, 8.6, 3.2, 2.6, 1.4, 3, "bege_escuro"),
    ("pinguins", "lago_gelo", 8.5, 8.5, 2.8, 2.7, 1.5, -4, "branco_gelo"),
]
POCAS = {  # (dx, dy, hx, hy, r) relativo ao recinto (antes do giro)
    "flamingos": (0.5, 0.3, 1.8, 1.4, 1.2),
    "hipopotamos": (0.0, 0.6, 2.0, 1.6, 1.3),
    "elefantes": (1.6, -0.9, 0.9, 0.6, 0.55),
    "pinguins": (-0.2, -0.3, 1.9, 1.6, 1.2),
    "leoes": (2.0, -1.8, 0.6, 0.5, 0.45),
}
Z_CURB, Z_REC = 0.32, 0.06


def p_zoologico(it):
    HL = Q
    rec_fns = []
    for nome, tipo, cx, cy, hx, hy, rr, ang, piso in RECINTOS:
        rec_fns.append((lambda X, Y, a=(cx, cy, hx, hy, rr, ang): pb.sd_caixa(X, Y, *a[:4], r=a[4], ang=a[5])))

    def f_rec(X, Y):
        out = None
        for fn in rec_fns:
            v = fn(X, Y)
            out = v if out is None else np.minimum(out, v)
        return out

    pocas = []
    for nome, tipo, cx, cy, hx, hy, rr, ang, piso in RECINTOS:
        if nome in POCAS:
            dx, dy, px, py, pr = POCAS[nome]
            c, s = math.cos(math.radians(ang)), math.sin(math.radians(ang))
            pocas.append((cx + dx * c - dy * s, cy + dx * s + dy * c, px, py, pr, ang, nome))

    def f_poca(X, Y):
        out = np.full(np.shape(X), 9.0)
        for cx, cy, px, py, pr, ang, _ in pocas:
            out = np.minimum(out, pb.sd_caixa(X, Y, cx, cy, px, py, r=pr, ang=ang))
        return out

    PAV = 13.6
    r = Rede(limite=(-HL, -HL, HL, HL), k=1.0)
    r.prims.append({"tipo": "campo", "juntas": False, "grade": 1.25})
    bracos = [((-7.5, -HL), (-7.5, -PAV + 1)), ((7.5, HL), (7.5, PAV - 1)), ((-HL, 7.5), (-PAV + 1, 7.5)),
              ((HL, -7.5), (PAV - 1, -7.5))]
    for a, b in bracos:
        r.traco([a, b])
    f_pav = lambda X, Y: pb.sd_caixa(X, Y, 0, 0, PAV, PAV, r=3.2) + W_CAM  # noqa: E731
    f_orig = r.f_prim

    def f_prim(p, X, Y):
        if p["tipo"] == "campo":
            return f_pav(X, Y)
        return f_orig(p, X, Y)

    r.f_prim = f_prim
    LR = [-0.3, -0.288, -0.012, 0.0]
    LP = [-1.2, -0.4, -0.05, 0.0]

    def z_rec(d):
        if d >= 0 or d <= -0.3:
            return Z_REC if d <= -0.3 else 0.0
        if d > -0.012:
            return Z_CURB * (-d) / 0.012
        if d > -0.288:
            return Z_CURB
        return Z_CURB + (Z_REC - Z_CURB) * (-0.288 - d) / 0.012

    def z_poca(d):
        if d >= 0:
            return 0.0
        if d > -0.05:
            return -0.31 * (-d) / 0.05
        if d > -0.4:
            return -0.31 - 0.2 * (-0.05 - d) / 0.35
        if d > -1.2:
            return -0.51 - 0.2 * (-0.4 - d) / 0.8
        return -0.71

    def qual(x, y):
        best, bi = 9e9, 0
        for i, fn in enumerate(rec_fns):
            v = val(fn, x, y)
            if v < best:
                best, bi = v, i
        return RECINTOS[bi]

    def ec(c, x, y):
        d = c["rec"]
        if d >= 0:
            return None
        if d > -0.3:
            return "lilas"
        if c["poca"] < 0:
            return "agua_funda" if c["poca"] < -1.2 else ("azul_claro" if qual(x, y)[0] == "pinguins" else "areia")
        return qual(x, y)[8]

    def ez(c, x, y):
        zz = z_rec(c["rec"])
        if c["rec"] < -0.3:
            zz += z_poca(c["poca"])
        return zz

    terreno_caminho(it, r, -HL, -HL, HL, HL, 0.5, extra_cor=ec, extra_z=ez,
                    campos=[("rec", f_rec, LR), ("poca", f_poca, LP)])
    it.add(r.juntas(f_extra=lambda X, Y: f_rec(X, Y) > 0.08))
    Z_AG = Z_REC - 0.16
    for cx, cy, px, py, pr, ang, nome in pocas:
        cont = pb.contorno_caixa(cx, cy, px - 0.02, py - 0.02, pr - 0.02, ang, seg=8)
        it.add(pb.decal(cont, Z_AG, "m:agua", nome="agua"))
    # cercas baixas sobre a mureta de cada recinto e enfeites por tipo
    slots, info = [], []
    for k, (nome, tipo, cx, cy, hx, hy, rr, ang, piso) in enumerate(RECINTOS):
        cont = pb.contorno_caixa(cx, cy, hx - 0.15, hy - 0.15, rr - 0.15, ang, seg=6)
        it.add(cerca(cont, alt=0.85, passo=1.45, cor="madeira_media", cor2="madeira_mel", fechado=True, z=Z_CURB - 0.02,
                     r_post=0.055, trilhos=(0.45, 0.9)))
        rnd = random.Random(k * 7 + 1)
        c, s = math.cos(math.radians(ang)), math.sin(math.radians(ang))
        P = lambda dx, dy: (cx + dx * c - dy * s, cy + dx * s + dy * c)  # noqa: E731
        z0 = Z_REC
        if tipo == "savana_rocha":
            it.add(rocha_colunas(*P(-0.6, 0.5), z=z0, esc=1.05, seed=3, n=8))
            it.add(acacia(*P(1.9, 1.4), z=z0, esc=0.95, cor="laranja_claro", cor2="mostarda"))
            it.add(pedra(*P(-2.2, -1.6), z=z0, l=0.9, p=0.7, a=0.5, cor="terracota", seed=4))
            it.add(mb.cilindro(0.22, 1.6, x=P(0.9, -1.7)[0], y=P(0.9, -1.7)[1], z=z0 + 0.2, eixo="x", cor="madeira_media",
                               seg=10, bisel=0.03))
        elif tipo == "grama_pedras":
            for j, (dx, dy, l) in enumerate(((-1.6, 0.6, 1.5), (-0.4, 1.0, 1.0), (1.8, -0.7, 1.2), (0.6, -1.3, 0.7))):
                it.add(pedra(*P(dx, dy), z=z0, l=l, p=l * 0.8, a=l * 0.65, cor="cinza" if j % 2 else "cinza_medio",
                             seed=j + 11))
            # toca de pedra (arco)
            it.add(mb.junta([pedra(*P(1.3, 1.1), z=z0, l=1.3, p=1.0, a=1.0, cor="cinza_medio", seed=21),
                             mb.cilindro(0.42, 0.5, x=P(1.3, 0.55)[0], y=P(1.3, 0.55)[1], z=z0 + 0.42, eixo="y",
                                         cor="grafite_escuro", seg=12, bisel=0.0)], "toca"))
            it.add(pinheiro(*P(-2.3, -1.4), z=z0, esc=0.85), pinheiro(*P(2.4, 1.6), z=z0, esc=0.7))
        elif tipo == "lago_raso":
            it.add(taboas(*P(-1.6, -1.3), z0, n=5, seed=2), taboas(*P(2.0, 1.4), z0, n=4, seed=3))
            it.add(arvore_alta(*P(-2.0, 1.5), z=z0, esc=0.8, cor="folha_clara"))
            for j in range(3):
                it.add(pedra(*P(-1.4 + j * 1.1, -2.0), z=z0, l=0.4, p=0.35, a=0.3, cor="cinza_claro", seed=40 + j))
        elif tipo == "lago_lama":
            it.add(pedra(*P(-1.9, -1.9), z=z0, l=1.1, p=0.9, a=0.6, cor="cinza", seed=30),
                   pedra(*P(2.0, -2.0), z=z0, l=0.8, p=0.7, a=0.5, cor="cinza_medio", seed=31))
            it.add(arvore(*P(-2.0, 2.0), z=z0, esc=0.75, seed=3), taboas(*P(2.1, 2.0), z0, n=4, seed=5))
        elif tipo == "savana":
            it.add(acacia(*P(-1.0, 1.6), z=z0, esc=1.1, cor="amarelo_escuro", cor2="laranja_claro"),
                   acacia(*P(1.2, -1.2), z=z0, esc=0.9, cor="laranja_claro", cor2="mostarda"))
            # comedouro alto para as girafas
            cxp, cyp = P(1.4, 1.7)
            it.add(mb.junta([mb.cilindro(0.08, 3.4, x=cxp, y=cyp, z=z0, cor="madeira_media", seg=8, bisel=0.01),
                             mb.cilindro(0.45, 0.35, x=cxp, y=cyp, z=z0 + 3.3, r2=0.55, cor="madeira_mel", seg=12,
                                         bisel=0.03),
                             mb.cilindro(0.48, 0.18, x=cxp, y=cyp, z=z0 + 3.62, cor="folha", seg=12, bisel=0.05)],
                            "comedouro"))
            it.add(pedra(*P(-1.8, -2.0), z=z0, l=0.7, p=0.6, a=0.45, cor="bege_escuro", seed=50))
        elif tipo == "floresta":
            it.add(arvore(*P(-1.6, 1.0), z=z0, esc=0.95, seed=8), arvore(*P(1.7, -1.1), z=z0, esc=0.8, seed=9,
                                                                         cores=("folha_clara", "folha", "verde_lima")))
            # brinquedo de troncos com corda
            ax, ay = P(0.6, 1.2)
            bx, by = P(-0.9, -1.0)
            it.add(mb.junta([mb.cilindro(0.12, 2.6, x=ax, y=ay, z=z0, cor="madeira_media", seg=8, bisel=0.02),
                             mb.cilindro(0.12, 2.6, x=bx, y=by, z=z0, cor="madeira_media", seg=8, bisel=0.02),
                             mb.tubo([(ax, ay, z0 + 2.45), (bx, by, z0 + 2.45)], 0.1, cor="madeira", seg=8),
                             mb.tubo([(ax, ay, z0 + 2.4), ((ax + bx) / 2, (ay + by) / 2, z0 + 1.7), (bx, by, z0 + 2.4)],
                                     0.03, cor="areia", seg=6, raio_curva=0.8),
                             mb.tubo([((ax + bx) / 2, (ay + by) / 2, z0 + 2.45), ((ax + bx) / 2, (ay + by) / 2,
                                                                                    z0 + 0.9)], 0.03, cor="areia",
                                     seg=6)], "trepa_troncos"))
            it.add(moita(*P(2.0, 1.6), z=z0, esc=0.8))
        elif tipo == "areia_bebedouro":
            it.add(rocha_colunas(*P(-1.8, 0.7), z=z0, esc=0.6, cor="bege_escuro", cor2="areia", seed=6, n=5))
            it.add(arvore(*P(-2.2, -1.5), z=z0, esc=0.8, seed=12, cores=("folha_escura", "folha", "verde_oliva")))
            for j in range(3):
                it.add(mb.cilindro(0.3, 0.5, x=P(0.2 + j * 0.75, 1.6)[0], y=P(0.2 + j * 0.75, 1.6)[1], z=z0,
                                   cor="madeira_media" if j % 2 else "madeira", seg=10, bisel=0.04))
        elif tipo == "lago_gelo":
            for j, (dx, dy, l) in enumerate(((-1.9, 1.7, 1.1), (1.9, 1.8, 0.9), (2.0, -1.8, 0.7), (-0.4, -0.2, 0.9))):
                it.add(pedra(*P(dx, dy), z=z0 - (0.3 if j == 3 else 0), l=l, p=l * 0.85, a=l * 0.7,
                             cor="branco" if j % 2 else "cinza_claro", seed=60 + j))
            it.add(mb.junta([mb.torno([(0, 0), (0.75, 0), (0.7, 0.35), (0.5, 0.62), (0.0, 0.75)],
                                      x=P(-2.0, -1.8)[0], y=P(-2.0, -1.8)[1], z=z0, cor="branco", seg=14)], "iglu"))
        # placa do recinto (painel colorido num poste) do lado de fora, na frente
        fx, fy = P(0, -hy - 0.55)
        it.add(mb.junta([mb.cilindro(0.04, 1.1, x=fx, y=fy, z=0, cor="grafite", seg=6, bisel=0.0),
                         pb.bloco(0.7, 0.05, 0.45, x=fx, y=fy - 0.03, z=0.95, cor=("laranja", "verde", "azul",
                                                                                   "amarelo", "rosa", "turquesa",
                                                                                   "vermelho", "roxo")[k],
                                  bisel=0.015),
                         pb.bloco(0.5, 0.02, 0.25, x=fx, y=fy - 0.06, z=1.05, cor="creme")], "placa"))
        slots.append(nome)
        it.slot(f"recinto_{nome}", (cx, cy, Z_REC), (2 * hx - 0.9, 2 * hy - 0.9, 3.5))
        info.append({"nome": nome, "tipo": tipo, "centro": mb._gl((cx, cy, Z_REC)),
                     "tamanho": [round(2 * hx - 0.9, 2), 3.5, round(2 * hy - 0.9, 2)],
                     "agua": nome in POCAS and nome != "leoes"})
    # portal da entrada (no braço sul) com o letreiro ZOOLÓGICO
    ex, ey = -7.5, -12.4
    port = []
    for sx in (-1, 1):
        port.append(caixa(0.7, 0.7, 3.9, x=ex + sx * 2.15, y=ey, z=0, cor="madeira_media", bisel=0.08))
        port.append(caixa(0.86, 0.86, 0.3, x=ex + sx * 2.15, y=ey, z=0, cor="cinza", bisel=0.06))
        port.append(arbusto(ex + sx * 2.15, ey, r=0.55, cor="folha", z=3.85, alt=0.8))
    port.append(caixa(5.4, 0.5, 0.95, x=ex, y=ey, z=3.1, cor="verde_escuro", bisel=0.12))
    port.append(caixa(5.0, 0.56, 0.12, x=ex, y=ey, z=3.0, cor="amarelo_escuro", bisel=0.04))
    for sx in (-1.6, 0, 1.6):
        port.append(arbusto(ex + sx, ey, r=0.45, cor="folha_clara" if sx else "folha", z=3.95, alt=0.75))
    it.add(mb.junta(port, "portal"))
    if EST:
        m = EST("zoologico", 1.0)
        it.add(pb.placa_estampa(m, 4.4, 0.86, ex, ey - 0.26, 3.58, normal=(0, -1, 0), nome="letreiro_zoo"))
        it.add(pb.placa_estampa(m, 4.4, 0.86, ex, ey + 0.26, 3.58, normal=(0, 1, 0), nome="letreiro_zoo2"))
    for sx in (-1, 1):
        for zz in (2.2,):
            it.add(caixa(0.22, 0.12, 0.3, x=ex + sx * 2.15, y=ey - 0.4, z=zz, cor=None, mat="luz", bisel=0.03))
    # bancos, postes, lixeiras e árvores no passeio e na grama
    for x, y, a in ((-4.3, -4.3, 45), (4.3, 4.3, 225), (-4.3, 4.3, 135), (4.3, -4.3, -45)):
        it.add(poste_praca(x, y))
    for x, y, a in ((-12.0, -4.3, -90), (12.0, 4.3, 90), (-4.2, 12.3, 0), (4.4, -12.2, 180), (-10.4, -12.0, 0)):
        it.add(banco(it, x, y, ang=a))
    it.add(lixeiras(-4.4, -12.1, z=0, ang=0), lixeira(12.2, -4.4), lixeira(-12.2, 4.4))
    for x, y in ((-13.9, -13.9), (13.9, 13.9), (-13.9, 13.8), (13.8, -13.9), (-14.0, 0.0), (0.3, 14.0)):
        it.add(arvore_alta(x, y, esc=0.95, cor="folha" if (x > 0) else "folha_clara"))
    # colisão: as 8 caixas dos recintos (mureta e cerca) e a malha do chão (um plano)
    col = []
    for nome, tipo, cx, cy, hx, hy, rr, ang, piso in RECINTOS:
        col.append(((cx, cy, 0.0), (2 * hx, 2 * hy, Z_CURB + 0.9)))
    m = Malha()
    vs = [m.v((x, y, 0.0)) for x, y in ((-HL, -HL), (HL, -HL), (HL, HL), (-HL, HL))]
    m.f(vs, "grama")
    chao = m.obj("colisao_chao")
    it.colisao_malha(chao, "colisao_chao")
    return {"col": col, "plana": False, "mini": (0.55, -1.0, 1.15),
            "extra": {"quadras": [2, 2], "recintos": info}}


# =====================================================================================================================
# Pista de skate (bowl) — 15 × 15
# =====================================================================================================================
def p_skate(it):
    D, T = 1.8, 1.6
    c1, c2 = (-2.3, 0.7, 3.25), (2.7, -0.4, 2.6)
    forma = lambda X, Y: pb.smin(pb.sd_circulo(X, Y, *c1), pb.sd_circulo(X, Y, *c2), 2.4)  # noqa: E731
    bowl = contorno_radial(forma, 0.0, 0.3, n=120)
    d_bowl = lambda X, Y: pb.sd_poligono(X, Y, bowl)  # noqa: E731
    US = [0.0, 0.015, 0.06, 0.15, 0.3, 0.5, 0.75, 1.05, 1.35, 1.615]

    def z_bowl(d):
        u = -d
        if u <= 0:
            return 0.0
        if u <= 0.015:
            return -(D - T) * u / 0.015
        up = min(u - 0.015, T)
        return -(D - T) - math.sqrt(max(0.0, T * T - (T - up) ** 2))

    niv = sorted(-u for u in US)
    DX, DY = 6.6, 5.7
    deck = lambda X, Y: pb.sd_caixa(X, Y, 0, 0.3, DX, DY, r=1.6)  # noqa: E731
    r = Rede(limite=(-H, -H, H, H), k=1.0)
    r.prims.append({"tipo": "campo", "juntas": False})
    r.traco([(0, -H), (0, -DY + 0.3)])
    f_orig = r.f_prim

    def f_prim(p, X, Y):
        if p["tipo"] == "campo":
            return deck(X, Y) + W_CAM
        return f_orig(p, X, Y)

    r.f_prim = f_prim

    def ec(c, x, y):
        d = c["bowl"]
        if d < 0:
            u = -d
            if u < 0.015:
                return "concreto"
            return "cinza_claro" if u < T else "concreto"
        if c["cam"] < W_CAM and c["deck"] < 0:
            return "concreto"
        return None

    terreno_caminho(it, r, -H, -H, H, H, 0.4, extra_cor=ec, extra_z=lambda c, x, y: z_bowl(c["bowl"]),
                    campos=[("bowl", d_bowl, niv), ("deck", deck, [0.0])])
    # juntas de dilatação no deck (fora do bowl) e ralo no fundo
    jm = []
    for x in (-4.0, 4.0):
        for y0, y1 in ((-DY + 0.5, 6.0),):
            pts = [(x, y) for y in np.linspace(y0, y1, 60)]
            P = np.array(pts)
            ok = (d_bowl(P[:, 0], P[:, 1]) > 0.15) & (deck(P[:, 0], P[:, 1]) < -0.1)
            for a, b in pb._trechos(ok):
                if b - a > 2:
                    jm.append(pb.faixa_2d([tuple(q) for q in P[a:b + 1]], 0.03, 0.003, "concreto_escuro"))
    it.add(jm)
    it.add(pb.decal(pb.arco(c1[0], c1[1], 0.22, 0, 360, 16)[:-1], -D + 0.004, "grafite", nome="ralo"))
    # borda de metal (coping) em volta do bowl
    cop = [(p[0], p[1], 0.0) for p in pb.reamostra_uniforme(bowl, 0.45, True)]
    cop = cop + [cop[0]]
    it.add(mb.tubo(cop, 0.055, cor="metal_claro", raio_curva=0, seg=6))
    # corrimão de manobra (grind rail) e caixote com rampas no deck sul
    rail = [mb.tubo([(-4.4, -4.25, 0.42), (-0.9, -4.25, 0.42)], 0.04, cor="amarelo", seg=8)]
    for x in (-4.1, -1.2):
        rail.append(mb.tubo([(x, -4.25, 0.0), (x, -4.25, 0.42)], 0.035, cor="grafite", seg=6))
        rail.append(caixa(0.3, 0.16, 0.02, x=x, y=-4.25, z=0.0, cor="grafite", bisel=0.005))
    it.add(mb.junta(rail, "corrimao"))
    m = Malha()
    bx0, bx1, by0, by1, h = 1.6, 4.6, -5.1, -3.5, 0.5
    pts = [(bx0 - 1.0, by0, 0), (bx0, by0, h), (bx1, by0, h), (bx1 + 1.0, by0, 0)]
    vs0 = [m.v(p) for p in pts]
    vs1 = [m.v((p[0], by1, p[2])) for p in pts]
    for k in range(3):
        m.f((vs0[k], vs0[k + 1], vs1[k + 1], vs1[k]), "concreto_escuro" if k == 1 else "cinza_claro")
    m.f((vs0[0], vs1[0], vs1[3], vs0[3]), "concreto")
    m.f(vs0[::-1], "concreto_escuro")
    m.f(vs1, "concreto_escuro")
    cx_ = m.obj("caixote")
    pb._normais_para_fora(cx_)
    it.add(cx_)
    it.add(mb.tubo([(bx0, by0, h), (bx0, by1, h)], 0.03, cor="metal_claro", seg=6),
           mb.tubo([(bx1, by0, h), (bx1, by1, h)], 0.03, cor="metal_claro", seg=6))
    # muro de grafite com o letreiro e refletores
    wy = 6.75
    it.add(caixa(5.2, 0.3, 1.7, x=0, y=wy, z=0, cor="concreto", bisel=0.05))
    if EST:
        m_ = EST("skate", 0.9)
        it.add(pb.placa_estampa(m_, 4.6, 1.15, 0, wy - 0.16, 0.95, normal=(0, -1, 0), nome="grafite_skate"))
    for sx in (-1, 1):
        x = sx * 6.6
        y = 6.2
        refl = [mb.cilindro(0.1, 6.0, x=x, y=y, z=0, r2=0.07, cor="grafite", seg=8, bisel=0.0),
                caixa(1.4, 0.1, 0.1, x=x, y=y, z=5.9, cor="grafite", bisel=0.02)]
        for dx in (-0.5, 0.5):
            cab = caixa(0.42, 0.22, 0.32, x=x + dx, y=y - 0.15, z=5.65, cor="grafite_escuro", bisel=0.04)
            vid = caixa(0.34, 0.02, 0.24, x=x + dx, y=y - 0.27, z=5.69, cor=None, mat="luz", bisel=0.01)
            refl += [cab, vid]
        it.add(mb.junta(refl, "refletor"))
    it.add(banco(it, -5.6, -4.6, ang=-90 + 180, cor="madeira_mel"), lixeira(5.8, -5.0, cor="laranja"))
    it.add(arvore(-6.0, -6.1, esc=0.8, seed=2), arvore(6.1, -6.1, esc=0.75, seed=3), moita(-6.5, 6.5, esc=0.8),
           moita(6.6, 6.7, esc=0.7))
    # colisão: malha do bowl (grade grossa) + muro, refletores e caixote
    t2 = Terreno(-H, -H, H, H, 1.0)
    t2.campo("bowl", d_bowl, [-0.015, -0.3, -0.75, -1.2, -1.615])
    me = t2.gera(lambda c, x, y: "concreto", lambda c, x, y: z_bowl(c["bowl"]), nome="colisao_bowl", saia=False)
    it.colisao_malha(me, "colisao_bowl")
    col = [((0, wy, 0), (5.2, 0.3, 1.7)), ((-6.6, 6.2, 0), (0.4, 0.4, 6.0)), ((6.6, 6.2, 0), (0.4, 0.4, 6.0)),
           (((bx0 + bx1) / 2, (by0 + by1) / 2, 0), (bx1 - bx0 + 2.0, by1 - by0, h))]
    return {"col": col, "plana": False, "mini": (0.55, -1.0, 0.95), "extra": {"quadras": [1, 1], "profundidade": D}}


# =====================================================================================================================
# Playground — 15 × 15
# =====================================================================================================================
def p_playground(it):
    PX, PY = 6.1, 5.7
    piso = lambda X, Y: pb.sd_caixa(X, Y, 0, 0.4, PX, PY, r=2.2)  # noqa: E731
    r = Rede(limite=(-H, -H, H, H), k=1.0)
    r.prims.append({"tipo": "campo", "juntas": False})
    r.traco([(0, -H), (0, -PY + 0.4)])
    f_orig = r.f_prim
    r.f_prim = lambda p, X, Y: piso(X, Y) + W_CAM if p["tipo"] == "campo" else f_orig(p, X, Y)
    # manchas coloridas no piso emborrachado
    manchas = [(-3.0, 2.6, 2.6, 2.2, "amarelo_claro"), (3.4, 2.7, 2.2, 2.0, "verde_claro"),
               (3.4, -2.4, 2.0, 1.9, "rosa_bebe")]
    f_man = lambda X, Y: np.minimum.reduce([pb.sd_caixa(X, Y, a, b, c, d, r=1.4) for a, b, c, d, _ in manchas])  # noqa

    def ec(c, x, y):
        if c["cam"] < W_CAM and c["piso"] < 0:
            if c["man"] < 0:
                best = min(manchas, key=lambda m: val(lambda X, Y: pb.sd_caixa(X, Y, *m[:4], r=1.4), x, y))
                return best[4]
            return "azul_claro"
        return None

    terreno_caminho(it, r, -H, -H, H, H, 0.5, extra_cor=ec, campos=[("piso", piso, [0.0]), ("man", f_man, [0.0])])
    it.add(r.juntas())
    # --- balanço (2 assentos que balançam)
    bx, by, bz = -3.0, 2.6, 2.35
    fr = []
    for sx in (-1, 1):
        x = bx + sx * 1.45
        for sy in (-1, 1):
            fr.append(mb.tubo([(x, by + sy * 0.95, 0.0), (x, by, bz)], 0.055, cor="azul", seg=8))
        fr.append(mb.cilindro(0.1, 0.12, x=x, y=by, z=bz - 0.06, cor="amarelo", seg=10, eixo="x", bisel=0.02))
    fr.append(mb.tubo([(bx - 1.55, by, bz), (bx + 1.55, by, bz)], 0.06, cor="amarelo", seg=10))
    it.add(mb.junta(fr, "balanco_estrutura"))
    for k, sx in enumerate((-0.6, 0.6)):
        x = bx + sx
        pecas = [mb.superelipsoide(0.5, 0.22, 0.06, x=x, y=by, z=0.48, cor="vermelho" if k == 0 else "laranja", e=0.4,
                                   e_v=0.5, nu=12, nv=4)]
        for dx in (-0.22, 0.22):
            pecas.append(mb.tubo([(x + dx, by, 0.5), (x + dx, by, bz - 0.04)], 0.012, cor="metal", seg=4))
            pecas.append(mb.cilindro(0.03, 0.06, x=x + dx, y=by, z=bz - 0.07, cor="metal_escuro", seg=6, bisel=0.0))
        nome = f"balanco_{k + 1}"
        dados = {"anima": "balancar", "angulo": 26, "periodo": 2.8, "eixo": "x"}
        if k:
            dados["fase"] = 1.4
        it.anima(pecas, dados, nome, pivo=(x, by, bz))
        it.assento(f"assento_balanco_{k + 1}", x, by, 0.54, pai=nome)
    # --- escorregador com torre e telhadinho
    ex, ey = 3.4, 2.7
    tor = []
    for sx in (-0.6, 0.6):
        for sy in (-0.6, 0.6):
            tor.append(mb.cilindro(0.06, 2.9, x=ex + sx, y=ey + sy, z=0, cor="amarelo", seg=8, bisel=0.01))
    tor.append(caixa(1.35, 1.35, 0.1, x=ex, y=ey, z=1.4, cor="madeira_mel", bisel=0.03))
    for sx, sy, lx, ly in ((0, -0.62, 1.2, 0.05), (-0.62, 0, 0.05, 1.2), (0.62, 0, 0.05, 1.2)):
        tor.append(caixa(lx, ly, 0.06, x=ex + sx, y=ey + sy, z=2.05, cor="vermelho", bisel=0.02))
        tor.append(caixa(lx, ly, 0.06, x=ex + sx, y=ey + sy, z=1.75, cor="vermelho", bisel=0.02))
    tor.append(mb.torno([(0, 0), (1.15, 0), (0.0, 0.85)], x=ex, y=ey, z=2.88, cor="vermelho", seg=4, angulo=30))
    mb.transforma(tor[-1], loc=(-ex, -ey, 0), rot=("Z", 45))
    mb.transforma(tor[-1], loc=(ex, ey, 0))
    tor.append(mb.esfera(0.1, x=ex, y=ey, z=3.78, cor="amarelo", seg=10))
    # escada atrás (+Y)
    for sx in (-0.32, 0.32):
        tor.append(mb.tubo([(ex + sx, ey + 1.35, 0.0), (ex + sx, ey + 0.66, 1.45)], 0.045, cor="azul", seg=8))
    for k in range(5):
        t = (k + 0.5) / 5
        tor.append(caixa(0.62, 0.12, 0.04, x=ex, y=ey + 1.35 - 0.69 * t, z=1.45 * t, cor="madeira_mel",
                            bisel=0.015))
    it.add(mb.junta(tor, "torre"))
    # rampa (calha) descendo para −Y
    perfil = [(-0.32, 0.25), (-0.32, 0.0), (0.32, 0.0), (0.32, 0.25), (0.27, 0.25), (0.27, 0.05), (-0.27, 0.05),
              (-0.27, 0.25)]
    cam = []
    for k in range(21):
        t = k / 20
        y = ey - 0.62 - 2.7 * t
        z = 1.45 - 1.15 * (3 * t * t - 2 * t ** 3) - 0.0
        if t > 0.92:
            z = 0.3
        cam.append((ex, y, z))
    calha = pb.varre_perfil(cam, perfil, "azul_celeste", nome="calha", liso=True, angulo=50)
    it.add(calha)
    # --- gangorra (balança no eixo do glTF z = eixo Y do Blender)
    gx, gy = -3.0, -2.4
    it.add(mb.junta([caixa(0.32, 0.5, 0.5, x=gx, y=gy, z=0, cor="verde", bisel=0.06),
                     mb.cilindro(0.08, 0.6, x=gx, y=gy, z=0.55, eixo="y", cor="grafite", seg=10, bisel=0.01)],
                    "gangorra_base"))
    tab = [caixa(3.3, 0.24, 0.08, x=gx, y=gy, z=0.52, cor="laranja", bisel=0.03)]
    for sx in (-1, 1):
        tab.append(mb.superelipsoide(0.42, 0.34, 0.08, x=gx + sx * 1.35, y=gy, z=0.6, cor="vermelho", e=0.4, nu=10,
                                     nv=4))
        tab.append(mb.tubo([(gx + sx * 1.05, gy - 0.14, 0.58), (gx + sx * 1.05, gy - 0.14, 0.85),
                            (gx + sx * 1.05, gy + 0.14, 0.85), (gx + sx * 1.05, gy + 0.14, 0.58)], 0.022,
                           cor="amarelo", seg=6, raio_curva=0.05))
    it.anima(tab, {"anima": "balancar", "angulo": 14, "periodo": 2.4, "eixo": "z"}, "gangorra", pivo=(gx, gy, 0.55))
    for k, sx in enumerate((-1, 1)):
        it.assento(f"assento_gangorra_{k + 1}", gx + sx * 1.35, gy, 0.68, pai="gangorra")
    # --- gira-gira (gira no eixo y do glTF)
    qx, qy = 3.4, -2.4
    it.add(mb.cilindro(0.18, 0.18, x=qx, y=qy, z=0, cor="grafite", seg=12, bisel=0.03))
    gg = [mb.cilindro(1.05, 0.12, x=qx, y=qy, z=0.22, cor="amarelo", seg=32, bisel=0.03),
          mb.cilindro(0.25, 0.04, x=qx, y=qy, z=0.34, cor="vermelho", seg=16, bisel=0.01)]
    for k in range(4):
        a = math.radians(45 + 90 * k)
        gg.append(mb.tubo([(qx + 0.15 * math.cos(a), qy + 0.15 * math.sin(a), 0.34),
                           (qx + 0.9 * math.cos(a), qy + 0.9 * math.sin(a), 0.75),
                           (qx + 0.95 * math.cos(a), qy + 0.95 * math.sin(a), 0.34)], 0.03,
                          cor=("azul", "vermelho", "verde", "laranja")[k], seg=6, raio_curva=0.2))
        b0 = math.radians(90 * k)
        gg.append(pb.decal([(qx + 0.27 * math.cos(b0 + t), qy + 0.27 * math.sin(b0 + t)) for t in
                            np.linspace(0, math.pi / 2, 6)] + [(qx + 1.0 * math.cos(b0 + t), qy + 1.0 * math.sin(b0 + t))
                                                               for t in np.linspace(math.pi / 2, 0, 6)],
                           0.345, ("vermelho", "azul", "verde", "laranja")[k], nome="fatia"))
    it.anima(gg, {"anima": "girar", "eixo": "y", "velocidade": 45}, "gira_gira", pivo=(qx, qy, 0.0))
    for k in range(4):
        a = math.radians(90 * k)
        it.assento(f"assento_gira_{k + 1}", qx + 0.62 * math.cos(a), qy + 0.62 * math.sin(a), 0.35, pai="gira_gira")
    # --- trepa-trepa em domo e caixa de areia
    tx, ty = 0.2, 4.4
    dom = []
    R = 1.35
    cores = ("vermelho", "amarelo", "azul", "verde", "laranja", "roxo")
    for k in range(8):
        a = math.radians(22.5 * 2 * k)
        dom.append(mb.tubo([(tx + R * math.cos(t) * math.cos(a), ty + R * math.cos(t) * math.sin(a), R * math.sin(t))
                            for t in np.linspace(0, math.pi / 2, 7)], 0.035, cor=cores[k % 6], seg=6,
                           raio_curva=0))
    for j, zz in enumerate((0.45, 0.85, 1.15)):
        rr = math.sqrt(R * R - zz * zz)
        dom.append(mb.tubo([(tx + rr * math.cos(t), ty + rr * math.sin(t), zz) for t in np.linspace(0, 2 * math.pi, 17)],
                           0.03, cor=cores[(j + 3) % 6], seg=6, raio_curva=0))
    dom.append(mb.esfera(0.08, x=tx, y=ty, z=R, cor="vermelho", seg=10))
    it.add(mb.junta(dom, "trepa_trepa"))
    sx_, sy_ = 0.1, -0.6
    cx_ = [caixa(2.6, 0.18, 0.3, x=sx_, y=sy_ - 1.21, z=0, cor="madeira_mel", bisel=0.04),
           caixa(2.6, 0.18, 0.3, x=sx_, y=sy_ + 1.21, z=0, cor="madeira_mel", bisel=0.04),
           caixa(0.18, 2.24, 0.3, x=sx_ - 1.21, y=sy_, z=0, cor="madeira_mel", bisel=0.04),
           caixa(0.18, 2.24, 0.3, x=sx_ + 1.21, y=sy_, z=0, cor="madeira_mel", bisel=0.04),
           caixa(2.3, 2.3, 0.2, x=sx_, y=sy_, z=0.0, cor="areia", bisel=0.02),
           mb.torno([(0, 0), (0.45, 0), (0.3, 0.18), (0.18, 0.26), (0, 0.3)], x=sx_ - 0.4, y=sy_ + 0.3, z=0.2,
                    cor="areia", seg=12),
           mb.cilindro(0.09, 0.22, x=sx_ - 0.4, y=sy_ + 0.3, z=0.45, cor="areia", seg=6, bisel=0.01),
           mb.cilindro(0.12, 0.2, x=sx_ + 0.5, y=sy_ - 0.3, z=0.2, r2=0.15, cor="vermelho", seg=12, bisel=0.01),
           mb.tubo([(sx_ + 0.4, sy_ - 0.3, 0.42), (sx_ + 0.5, sy_ - 0.3, 0.5), (sx_ + 0.6, sy_ - 0.3, 0.42)], 0.01,
                   cor="amarelo", seg=4, raio_curva=0.05),
           caixa(0.09, 0.5, 0.02, x=sx_ + 0.6, y=sy_ + 0.4, z=0.21, cor="azul", bisel=0.005),
           caixa(0.16, 0.14, 0.02, x=sx_ + 0.6, y=sy_ + 0.12, z=0.21, cor="azul", bisel=0.005)]
    it.add(mb.junta(cx_, "caixa_areia"))
    # --- cerquinha colorida em volta (com a abertura do caminho), bancos, árvores
    cont = pb.contorno_caixa(0, 0.4, PX - 0.15, PY - 0.15, 2.05, 0, seg=8)
    pts = pb.reamostra(cont, 0.2, True)
    i0 = next(i for i in range(len(pts)) if (abs(pts[i][0]) < 1.6 and pts[i][1] < 0))
    seq = pts[i0:] + pts[:i0]
    seq = [p for p in seq if not (abs(p[0]) < 1.6 and p[1] < 0)]
    it.add(cerca(seq, alt=0.75, passo=0.9, cor="branco", cor2="amarelo", fechado=False, z=0.0, r_post=0.045,
                 trilhos=(0.35, 0.75)))
    it.add(banco(it, -6.85, -3.4, ang=-90, cor="madeira_mel"), banco(it, 6.85, -3.4, ang=90, cor="madeira_mel"))
    it.add(arvore(-5.9, 6.0, esc=0.9, seed=4), arvore(6.0, 6.0, esc=0.85, seed=6), arvore_alta(-6.5, -6.4, esc=0.9),
           arvore_alta(6.5, -6.5, esc=0.85, cor="folha_clara"), lixeira(1.9, -6.4, cor="azul"))
    col = [((0, 0, ZF), (Q, Q, -ZF)), ((bx, by, 0), (3.2, 2.0, bz + 0.1)), ((ex, ey + 0.2, 0), (1.3, 1.8, 3.8)),
           ((ex, ey - 2.0, 0), (0.7, 2.7, 1.2)), ((gx, gy, 0), (3.3, 0.6, 0.7)), ((qx, qy, 0), (2.1, 2.1, 0.8)),
           ((tx, ty, 0), (2.7, 2.7, R)), ((sx_, sy_, 0), (2.6, 2.6, 0.3))]
    return {"col": col, "plana": False, "mini": (0.55, -1.0, 0.9), "extra": {"quadras": [1, 1]}}


# =====================================================================================================================
# Palco de festival — 15 × 15
# =====================================================================================================================
def trelica(p0, p1, lado=0.42, cor="metal_escuro", r=0.035, passo=0.85):
    """Treliça quadrada (4 tubos e diagonais em zigue-zague) entre p0 e p1."""
    a, b = V(p0), V(p1)
    d = (b - a)
    L = d.length
    d.normalize()
    ref = V((0, 0, 1)) if abs(d.z) < 0.9 else V((1, 0, 0))
    u = d.cross(ref).normalized()
    v = d.cross(u).normalized()
    cantos = [(u * sx + v * sy) * (lado / 2) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    ps = [pb.haste(tuple(a + c), tuple(b + c), r, cor, 5) for c in cantos]
    n = max(1, int(L / passo))
    for k in range(n):
        p = a + d * (L * k / n)
        q = a + d * (L * (k + 1) / n)
        for i in range(4):
            c0, c1 = cantos[i], cantos[(i + 1) % 4]
            if k % 2 == 0:
                ps.append(pb.haste(tuple(p + c0), tuple(q + c1), r * 0.6, cor, 3))
            else:
                ps.append(pb.haste(tuple(p + c1), tuple(q + c0), r * 0.6, cor, 3))
    return mb.junta(ps, "trelica")


def caixa_som(x, y, z, l=0.9, p=0.7, a=1.1, ang=0.0):
    ps = [caixa(l, p, a, cor="preto", bisel=0.04)]
    for zz, rr in ((a * 0.68, l * 0.3), (a * 0.25, l * 0.2)):
        ps.append(mb.cilindro(rr, 0.04, x=0, y=-p / 2 - 0.005, z=zz, eixo="y", cor="grafite", seg=10, bisel=0.0))
        ps.append(mb.cilindro(rr * 0.4, 0.05, x=0, y=-p / 2 - 0.02, z=zz, eixo="y", cor="grafite_escuro", seg=8,
                              bisel=0.0))
    ob = mb.junta(ps, "caixa_som")
    mover(ob, x, y, z, ang)
    return ob


def p_palco(it):
    # chão: plateia de ladrilho com caminho até a borda sul, grama em volta
    plat = lambda X, Y: pb.sd_caixa(X, Y, 0, 0.2, 6.9, 6.6, r=1.8)  # noqa: E731
    r = Rede(limite=(-H, -H, H, H), k=1.0)
    r.prims.append({"tipo": "campo", "juntas": False, "grade": 1.25})
    r.traco([(0, -H), (0, -6.0)])
    f_orig = r.f_prim
    r.f_prim = lambda p, X, Y: plat(X, Y) + W_CAM if p["tipo"] == "campo" else f_orig(p, X, Y)
    terreno_caminho(it, r, -H, -H, H, H, 0.5)
    it.add(r.juntas())
    X0, X1, Y0, Y1, ZP = -5.6, 5.6, 0.9, 6.4, 1.3
    # tablado e escadas
    tab = [caixa(X1 - X0, Y1 - Y0, ZP - 0.08, x=0, y=(Y0 + Y1) / 2, z=0, cor="grafite_escuro", bisel=0.04),
           caixa(X1 - X0 + 0.1, Y1 - Y0 + 0.1, 0.1, x=0, y=(Y0 + Y1) / 2, z=ZP - 0.1, cor="grafite", bisel=0.03)]
    for k in range(1, 6):
        x = X0 + (X1 - X0) * k / 6
        tab.append(caixa(0.02, Y1 - Y0 - 0.1, 0.004, x=x, y=(Y0 + Y1) / 2, z=ZP, cor="preto", bisel=0.0))
    for sx in (-1, 1):
        for k in range(5):
            h = ZP * (k + 1) / 5
            tab.append(caixa(0.5, 1.4, h, x=sx * (X1 + 0.25 + (4 - k) * 0.3), y=Y0 + 1.6, z=0,
                                cor="grafite" if k % 2 else "grafite_escuro", bisel=0.02))
    it.add(mb.junta(tab, "tablado"))
    it.add(caixa(X1 - X0 - 0.2, 0.05, 0.06, x=0, y=Y0 - 0.06, z=ZP - 0.12, cor=None, mat="neon_rosa", bisel=0.02))
    # parede do fundo e telão (3 quadros trocando)
    it.add(caixa(X1 - X0 + 0.6, 0.3, 6.0, x=0, y=Y1 + 0.2, z=ZP - 0.02, cor="grafite_escuro", bisel=0.04))
    it.add(caixa(6.8, 0.12, 3.9, x=0, y=Y1 - 0.01, z=ZP + 1.25, cor="preto", bisel=0.04))
    if EST:
        m = EST("telao", 1.2)
        tl = pb.placa_estampa(m, 6.4, 3.6, 0, Y1 - 0.08, ZP + 3.2, normal=(0, -1, 0), nome="telao",
                              uv=((0, 0), (1 / 3, 0), (1 / 3, 1), (0, 1)))
        it.anima(tl, {"anima": "trocar", "quadros": 3, "periodo": 3.0}, "telao", pivo=(0, Y1 - 0.08, ZP + 3.2))
    # torres de treliça e cobertura em arco com estrelas
    TX, TY0, TY1, ZT = 6.75, 0.45, 6.95, 7.4
    for sx in (-1, 1):
        for ty in (TY0, TY1):
            it.add(trelica((sx * TX, ty, 0), (sx * TX, ty, ZT), lado=0.45))
            it.add(caixa(0.8, 0.8, 0.12, x=sx * TX, y=ty, z=0, cor="metal_escuro", bisel=0.03))
        it.add(trelica((sx * TX, TY0, ZT - 0.25), (sx * TX, TY1, ZT - 0.25), lado=0.4))
    it.add(trelica((-TX, TY0, ZT - 0.25), (TX, TY0, ZT - 0.25), lado=0.4))
    it.add(trelica((-TX, TY1, ZT - 0.25), (TX, TY1, ZT - 0.25), lado=0.4))
    # lona em abóbada (arco de lado a lado, extrudado na profundidade)
    m = Malha()
    nseg = 24
    W2, HA = TX + 0.5, 1.9
    ys = (TY0 - 0.45, TY1 + 0.35)
    zb = ZT - 0.05
    arco_pts = [(-W2 + 2 * W2 * k / nseg, zb + HA * math.sin(math.pi * k / nseg)) for k in range(nseg + 1)]
    top0 = [m.v((x, ys[0], z)) for x, z in arco_pts]
    top1 = [m.v((x, ys[1], z)) for x, z in arco_pts]
    for k in range(nseg):
        m.f((top0[k], top0[k + 1], top1[k + 1], top1[k]), "violeta")
    # espessura da lona: faixa laranja na frente e atrás (borda), por baixo roxo escuro
    bot0 = [m.v((x, ys[0], z - 0.35)) for x, z in arco_pts]
    bot1 = [m.v((x, ys[1], z - 0.35)) for x, z in arco_pts]
    for k in range(nseg):
        m.f((bot0[k + 1], bot0[k], bot1[k], bot1[k + 1]), "roxo_escuro")
        m.f((bot0[k], bot0[k + 1], top0[k + 1], top0[k]), "laranja")
        m.f((top1[k], top1[k + 1], bot1[k + 1], bot1[k]), "laranja")
    for vs in ((bot0[0], bot1[0], top1[0], top0[0]), (top0[-1], top1[-1], bot1[-1], bot0[-1])):
        m.f(vs, "laranja")
    lona = m.obj("lona", liso=True, angulo=30)
    pb._normais_para_fora(lona)
    it.add(lona)
    # estrelas amarelas deitadas sobre a lona (seguindo a curva)
    for k, (xs, esc) in enumerate(((-4.2, 1.0), (0.0, 1.25), (4.2, 1.0), (-2.1, 0.55), (2.1, 0.55))):
        t = (xs + W2) / (2 * W2)
        z = zb + HA * math.sin(math.pi * t)
        dz = HA * math.pi * math.cos(math.pi * t) / (2 * W2)
        ang = math.degrees(math.atan(dz))
        yy = (ys[0] + ys[1]) / 2 - 1.2 + (0 if esc > 0.9 else 2.6)
        st = mb.extrudado(pb.estrela_pts(1.35 * esc), 0.12, z=0, cor="amarelo", bisel=0.04, seg=2)
        mb.transforma(st, rot=("Y", -ang))
        mb.transforma(st, loc=(xs, yy, z - 0.02))
        it.add(st)
    # faixa da frente FESTIVAL e banners SHOW nas torres
    if EST:
        mf = EST("festival", 1.1)
        it.add(caixa(2 * TX + 0.2, 0.2, 1.45, x=0, y=TY0 - 0.42, z=ZT - 1.25, cor="laranja", bisel=0.05))
        it.add(pb.placa_estampa(mf, 2 * TX - 0.2, 1.25, 0, TY0 - 0.53, ZT - 0.52, normal=(0, -1, 0), nome="faixa"))
        ms = EST("show", 1.0)
        for sx in (-1, 1):
            it.add(caixa(1.3, 0.12, 4.9, x=sx * (TX + 0.05), y=TY0 - 0.32, z=1.3, cor="amarelo_escuro", bisel=0.03))
            it.add(pb.placa_estampa(ms, 1.18, 4.7, sx * (TX + 0.05), TY0 - 0.39, 3.75, normal=(0, -1, 0),
                                    nome="banner"))
    # caixas de som: pilhas no chão e line arrays pendurados
    for sx in (-1, 1):
        for k in range(3):
            it.add(caixa_som(sx * (TX - 0.05), -0.35, k * 1.12, l=0.95, p=0.75, a=1.1))
        arr = []
        for k in range(5):
            o = caixa_som(0, 0, -k * 0.45, l=0.9, p=0.6, a=0.42)
            mb.transforma(o, rot=("X", 3 * k))
            arr.append(o)
        ob = mb.junta(arr, "line_array")
        mover(ob, sx * (TX - 0.9), TY0 - 0.1, ZT - 1.4)
        it.add(ob)
        it.add(mb.tubo([(sx * (TX - 0.9), TY0 - 0.1, ZT - 0.45), (sx * (TX - 0.9), TY0 - 0.1, ZT - 0.97)], 0.02,
                       cor="grafite", seg=4))
    # refletores na treliça da frente: dois grupos que piscam alternados (cores do palco)
    grupos = {"a": [], "b": []}
    corpo_ref = []
    for k in range(8):
        x = -5.25 + k * 1.5
        g = "a" if k % 2 == 0 else "b"
        cab = mb.cilindro(0.2, 0.42, x=0, y=0, z=-0.21, cor="preto", seg=12, bisel=0.02)
        lente = mb.cilindro(0.16, 0.03, x=0, y=0, z=-0.23, cor=None, mat=("neon_rosa", "neon_roxo", "luz", "neon")[k % 4],
                            seg=12, bisel=0.0)
        for o in (cab, lente):
            mb.transforma(o, rot=("X", 35))
            mb.transforma(o, loc=(x, TY0 + 0.1, ZT - 0.75))
        corpo_ref.append(cab)
        corpo_ref.append(mb.tubo([(x, TY0, ZT - 0.45), (x, TY0 + 0.1, ZT - 0.62)], 0.02, cor="grafite", seg=4))
        grupos[g].append(lente)
    it.add(mb.junta(corpo_ref, "refletores"))
    it.anima(grupos["a"], {"anima": "piscar", "periodo": 1.2}, "refletores_a")
    it.anima(grupos["b"], {"anima": "piscar", "periodo": 1.2, "fase": 0.6}, "refletores_b")
    # luzes de chão no palco (cabeças móveis que balançam)
    for k, x in enumerate((-4.5, -1.5, 1.5, 4.5)):
        it.add(caixa(0.36, 0.3, 0.12, x=x, y=Y0 + 0.4, z=ZP, cor="preto", bisel=0.03))
        cab = [mb.cilindro(0.13, 0.3, x=x, y=Y0 + 0.4, z=ZP + 0.15, eixo="x", cor="preto", seg=10, bisel=0.02),
               mb.cilindro(0.1, 0.03, x=x, y=Y0 + 0.4 - 0.12, z=ZP + 0.2, eixo="y",
                           cor=None, mat="neon_roxo" if k % 2 else "neon_rosa", seg=10, bisel=0.0)]
        it.anima(cab, {"anima": "balancar", "angulo": 30, "periodo": 3.0 + 0.4 * k, "eixo": "y"}, f"cabeca_movel_{k + 1}",
                 pivo=(x, Y0 + 0.4, ZP + 0.12))
    # instrumentos simples: bateria e microfone
    bx, by = 0.0, 5.0
    bat = [mb.cilindro(0.38, 0.4, x=bx, y=by, z=ZP + 0.05, eixo="y", cor="vermelho", seg=16, bisel=0.02),
           mb.cilindro(0.22, 0.2, x=bx - 0.65, y=by - 0.1, z=ZP + 0.5, cor="vermelho", seg=14, bisel=0.02),
           mb.cilindro(0.22, 0.2, x=bx + 0.65, y=by - 0.1, z=ZP + 0.5, cor="vermelho", seg=14, bisel=0.02),
           mb.cilindro(0.3, 0.015, x=bx + 1.0, y=by + 0.2, z=ZP + 1.0, cor="ouro", seg=14, bisel=0.0),
           mb.tubo([(bx + 1.0, by + 0.2, ZP), (bx + 1.0, by + 0.2, ZP + 1.0)], 0.015, cor="metal", seg=4),
           mb.tubo([(0, 2.0, ZP), (0, 2.0, ZP + 1.5), (0, 1.85, ZP + 1.6)], 0.015, cor="metal", seg=4),
           mb.esfera(0.05, x=0, y=1.82, z=ZP + 1.62, cor="grafite", seg=8)]
    it.add(mb.junta(bat, "bateria"))
    # grade na frente, mesa de som com tenda e postes
    gr = []
    for k in range(6):
        x0 = -5.6 + k * 1.9
        gr.append(pb.haste((x0, -0.6, 0.0), (x0, -0.6, 1.1), 0.03, "metal", 5))
        gr.append(pb.haste((x0 + 1.8, -0.6, 0.0), (x0 + 1.8, -0.6, 1.1), 0.03, "metal", 5))
        gr.append(pb.haste((x0, -0.6, 1.1), (x0 + 1.8, -0.6, 1.1), 0.03, "metal", 5))
        for j in range(1, 6):
            gr.append(pb.haste((x0 + 0.3 * j, -0.6, 0.05), (x0 + 0.3 * j, -0.6, 1.1), 0.012, "metal", 3))
        gr.append(caixa(0.5, 0.6, 0.03, x=x0 + 0.9, y=-0.6, z=0.0, cor="metal_escuro", bisel=0.01))
    it.add(mb.junta(gr, "grade"))
    fx, fy = 0.0, -4.3
    tenda = [caixa(1.6, 0.8, 0.85, x=fx, y=fy, z=0, cor="grafite", bisel=0.03),
             caixa(1.5, 0.7, 0.05, x=fx, y=fy - 0.05, z=0.88, cor="preto", bisel=0.01)]
    for sx in (-1, 1):
        for sy in (-1, 1):
            tenda.append(mb.tubo([(fx + sx * 1.15, fy + sy * 1.15, 0), (fx + sx * 1.15, fy + sy * 1.15, 2.3)], 0.035,
                                 cor="metal", seg=6))
    tenda.append(mb.torno([(0, 0), (1.7, 0), (1.6, 0.18), (0, 0.9)], x=fx, y=fy, z=2.25, cor="branco", seg=4,
                          angulo=30))
    mb.transforma(tenda[-1], loc=(-fx, -fy, 0), rot=("Z", 45))
    mb.transforma(tenda[-1], loc=(fx, fy, 0))
    for k in range(8):
        tenda.append(caixa(0.08, 0.03, 0.05, x=fx - 0.6 + k * 0.17, y=fy - 0.1, z=0.92, cor="amarelo", bisel=0.005))
    it.add(mb.junta(tenda, "mesa_som"))
    for x, y in ((-6.4, -5.7), (6.4, -5.7)):
        it.add(pb.poste_praca(x, y))
    it.add(arvore(-6.1, 6.4, esc=0.65, seed=7), arvore(6.1, 6.4, esc=0.65, seed=8))
    col = [((0, 0, ZF), (Q, Q, -ZF)), ((0, (Y0 + Y1) / 2, 0), (X1 - X0, Y1 - Y0, ZP)),
           ((0, Y1 + 0.2, 0), (X1 - X0 + 0.6, 0.3, ZP + 6.0)), ((-TX, 3.2, 0), (1.0, 7.9, ZT)),
           ((TX, 3.2, 0), (1.0, 7.9, ZT)), ((0, -0.6, 0), (11.6, 0.2, 1.1)), ((fx, fy, 0), (2.4, 2.4, 2.4))]
    return {"col": col, "plana": False, "mini": (0.5, -1.0, 0.45), "extra": {"quadras": [1, 1]}}
