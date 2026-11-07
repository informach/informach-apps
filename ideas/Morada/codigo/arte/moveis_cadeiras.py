"""Categoria "cadeiras" do Morada: cadeiras, poltronas e banquetas (referência: moveis/refs/ref_06.webp).

Uso: blender-venv/bin/python -I morada-art/moveis_cadeiras.py -- <saida> [id1,id2,prefixo*,...]
Sem a lista, gera a categoria inteira. Com a lista, refaz só os ids (ou prefixos terminados em *) pedidos.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402,F401
from mathutils import Matrix, Vector  # noqa: E402

import moveis_base as mb  # noqa: E402

V = Vector
ARGS = sys.argv[sys.argv.index("--") + 1:]
SAIDA = ARGS[0]
FILTRO = ARGS[1].split(",") if len(ARGS) > 1 and ARGS[1] else None


# =====================================================================================================================
# Ferramentas próprias
# =====================================================================================================================
def SE(l, p, a, x=0.0, y=0.0, z=0.0, cor="azul", e=0.2, ev=0.3, estufa=0.0, nu=28, nv=14):
    """Bloco macio (estofado)."""
    return mb.superelipsoide(l, p, a, x, y, z, cor, e=e, e_v=ev, nu=nu, nv=nv, estufa=estufa)


def assento(l, p, a, x=0.0, y=0.0, z=0.0, cor="azul", e=0.2, estufa=0.25):
    """Almofada de assento, deitada, cheia no meio."""
    return SE(l, p, a, x, y, z, cor, e=e, ev=0.5, estufa=estufa)


def encosto(l, a, esp, x=0.0, y=0.0, z=0.0, cor="azul", incl=10.0, e=0.22, estufa=0.35, ev=0.55):
    """Almofada de encosto em pé: largura l, altura a, espessura esp. (x, y, z) é o meio da borda de baixo; incl em
    graus para trás (o topo vai para +Y)."""
    ob = SE(l, a, esp, 0, 0, -esp / 2, cor, e=e, ev=ev, estufa=estufa)
    M = Matrix.Translation((x, y, z)) @ Matrix.Rotation(math.radians(-incl), 4, "X") @ \
        Matrix.Translation((0, 0, a / 2)) @ Matrix.Rotation(math.radians(90), 4, "X")
    ob.data.transform(M)
    return ob


def gira(obs, eixo, graus, pivo=(0, 0, 0)):
    """Gira a malha de um objeto (ou de uma lista) em volta de um pivô."""
    P = V(pivo)
    M = Matrix.Translation(P) @ Matrix.Rotation(math.radians(graus), 4, eixo) @ Matrix.Translation(-P)
    for o in (obs if isinstance(obs, (list, tuple)) else [obs]):
        o.data.transform(M)
    return obs


def move(obs, d):
    for o in (obs if isinstance(obs, (list, tuple)) else [obs]):
        o.data.transform(Matrix.Translation(d))
    return obs


def curva_x(ob, k):
    """Curva a peça em planta: y += k·x² (k < 0 traz as pontas para a frente, como um encosto que abraça)."""
    def f(c):
        c.y += k * c.x * c.x
        return c
    return deforma(ob, f)


def deforma(ob, f):
    for v in ob.data.vertices:
        v.co = f(V(v.co))
    ob.data.update()
    return ob


def rampa_topo(ob, z0, k_frente, k_tras):
    """Abaixa o topo de uma peça para a frente: acima de z0, a altura é multiplicada por um fator que vai de k_frente
    (na frente, −Y) a k_tras (atrás). Para os encostos que descem até virar braço."""
    lo, hi = mb.bbox(ob)

    def f(c):
        if c.z > z0:
            t = (c.y - lo.y) / max(1e-6, hi.y - lo.y)
            t = t * t * (3 - 2 * t)
            c.z = z0 + (c.z - z0) * (k_frente + (k_tras - k_frente) * t)
        return c

    return deforma(ob, f)


def arqueia_topo(ob, z0, k_borda):
    """Topo em arco: acima de z0 a altura cai para k_borda nas laterais (x nas pontas)."""
    lo, hi = mb.bbox(ob)
    meio, meia = (lo.x + hi.x) / 2, (hi.x - lo.x) / 2

    def f(c):
        if c.z > z0:
            u = ((c.x - meio) / meia) ** 2
            c.z = z0 + (c.z - z0) * (1 - (1 - k_borda) * u)
        return c

    return deforma(ob, f)


def _sem_repetidos(pts):
    out = []
    for p in pts:
        if not out or (abs(out[-1][0] - p[0]) > 1e-5 or abs(out[-1][1] - p[1]) > 1e-5):
            out.append(p)
    if len(out) > 1 and abs(out[0][0] - out[-1][0]) < 1e-5 and abs(out[0][1] - out[-1][1]) < 1e-5:
        out.pop()
    return out


def contorno_u(L, yf, yb, R, t, n=12):
    """Contorno em U visto de cima (encosto que abraça o assento): largura L, aberto na frente (yf), fundo em yb,
    cantos de trás com raio R e parede de espessura t."""
    R = min(R, L / 2)
    Ri = max(0.01, R - t)
    pts = [(L / 2, yf)]
    pts += [(L / 2 - R + R * math.cos(math.radians(90 * k / n)), yb - R + R * math.sin(math.radians(90 * k / n)))
            for k in range(n + 1)]
    pts += [(-L / 2 + R + R * math.cos(math.radians(90 + 90 * k / n)),
             yb - R + R * math.sin(math.radians(90 + 90 * k / n))) for k in range(n + 1)]
    pts += [(-L / 2, yf), (-L / 2 + t, yf)]
    pts += [(-L / 2 + R + Ri * math.cos(math.radians(180 - 90 * k / n)),
             yb - R + Ri * math.sin(math.radians(180 - 90 * k / n))) for k in range(n + 1)]
    pts += [(L / 2 - R + Ri * math.cos(math.radians(90 - 90 * k / n)),
             yb - R + Ri * math.sin(math.radians(90 - 90 * k / n))) for k in range(n + 1)]
    pts += [(L / 2 - t, yf)]
    return mb._ccw(_sem_repetidos(pts))


def parede_u(L, yf, yb, R, t, h, z, cor, bisel=0.05, seg=4):
    return mb.extrudado(contorno_u(L, yf, yb, R, t), h, z=z, cor=cor, bisel=bisel, seg=seg)


def arco_faixa(r_in, r_out, a0, a1, h, x=0.0, y=0.0, z=0.0, cor="madeira", bisel=0.01, n=16):
    """Faixa curva (setor de anel) vista de cima, ângulos em graus (90 = atrás, +Y)."""
    ang = [math.radians(a0 + (a1 - a0) * k / n) for k in range(n + 1)]
    pts = [(r_out * math.cos(a), r_out * math.sin(a)) for a in ang] + \
          [(r_in * math.cos(a), r_in * math.sin(a)) for a in reversed(ang)]
    return mb.extrudado(mb._ccw(pts), h, x=x, y=y, z=z, cor=cor, bisel=bisel, seg=2)


def balanco(x, L, R, esp, alt, y=0.0, cor="madeira", n=20):
    """Arco de cadeira de balanço no plano YZ: comprimento L, raio R (toca o chão no meio), espessura esp (em X) e
    altura da tábua alt."""
    bot = []
    for k in range(n + 1):
        yy = -L / 2 + L * k / n
        bot.append((y + yy, R - math.sqrt(R * R - yy * yy)))
    top = [(py, pz + alt) for py, pz in reversed(bot)]
    return mb.extrudado(mb._ccw(bot + top), esp, x=x - esp / 2, plano="yz", cor=cor, bisel=min(0.012, esp * 0.3),
                        seg=2)


def balanco_z(L, R, yy):
    return R - math.sqrt(R * R - yy * yy)


def anel(pts2d, z=0.0):
    """Contorno 2D → pontos 3D na altura z (para tubo fechado)."""
    return [(px, py, z) for px, py in pts2d]


def barra(p0, p1, r, cor, seg=12):
    """Tubo reto entre dois pontos."""
    return mb.tubo([p0, p1], r, cor=cor, seg=seg)


def esfera(r, x, y, z, cor, seg=14):
    return mb.esfera(r, x=x, y=y, z=z, cor=cor, seg=seg)


def base_estrela(r=0.30, cor="preto", cor_roda="cinza", z_topo=0.40, cor_col="cromo", cor_pistao=None,
                 cor_mec="preto"):
    """Base giratória de cadeira de escritório: cinco pés em estrela com rodízios duplos, cubo, pistão e mecanismo.
    z_topo é a altura de baixo do assento."""
    ps = []
    perfil = mb._ccw([(0.0, 0.085), (r - 0.012, 0.068), (r - 0.012, 0.097), (0.0, 0.135)])
    for k in range(5):
        ang = 270 + 72 * k
        perna = mb.extrudado(perfil, 0.048, x=-0.024, plano="yz", cor=cor, bisel=0.013, seg=2)
        yc = r - 0.036
        haste = mb.cilindro(0.008, 0.024, y=yc, z=0.05, cor=cor_mec, seg=10, bisel=0.002)
        garfo = mb.caixa(0.038, 0.046, 0.02, y=yc + 0.008, z=0.043, cor=cor_mec, bisel=0.008, seg=2)
        rodas = [mb.cilindro(0.026, 0.014, x=sx * 0.0135, y=yc + 0.014, z=0.026, cor=cor_roda, eixo="x", seg=12,
                             bisel=0.004) for sx in (-1, 1)]
        g = mb.junta([perna, haste, garfo] + rodas, "perna")
        gira(g, "Z", ang - 90)
        ps.append(g)
    ps.append(mb.cilindro(0.055, 0.07, z=0.075, r2=0.045, cor=cor, seg=20, bisel=0.008))
    ps.append(mb.cilindro(0.031, 0.14, z=0.14, cor=cor_pistao or cor_mec, seg=18, bisel=0.006))
    ps.append(mb.cilindro(0.019, z_topo - 0.30, z=0.27, cor=cor_col, seg=16, bisel=0.003))
    ps.append(mb.caixa(0.20, 0.22, 0.045, z=z_topo - 0.045, cor=cor_mec, bisel=0.012))
    ps.append(barra((0.07, -0.03, z_topo - 0.025), (0.19, -0.07, z_topo - 0.035), 0.006, cor_mec))
    ps.append(esfera(0.013, 0.19, -0.07, z_topo - 0.035, cor_mec, seg=10))
    return ps


def pes_radiais(n, r_topo, a, cor, r=0.025, abre=10.0, tipo="palito", ang0=90.0, z=0.0, fab=None):
    """n pés distribuídos em círculo, inclinados para fora (abre, em graus); o topo fica no raio r_topo."""
    out = []
    for k in range(n):
        ang = ang0 + 360.0 * k / n
        o = fab() if fab else mb.pe(tipo, a, cor=cor, r=r)
        gira(o, "X", abre)
        gira(o, "Z", ang - 90)
        rb = r_topo + a * math.sin(math.radians(abre))
        move(o, (rb * math.cos(math.radians(ang)), rb * math.sin(math.radians(ang)), z))
        out.append(o)
    return out


def col_auto(it, h_assento, prof_encosto=0.2, y_encosto=None):
    """Colisão em até duas caixas: o assento (a pegada inteira até a altura do assento) e o encosto (uma fatia atrás,
    até o topo)."""
    lo, hi = mb.bbox(it.partes + [o for o, _ in it.interativos])
    L, P = hi.x - lo.x, hi.y - lo.y
    cx, cy = (lo.x + hi.x) / 2, (lo.y + hi.y) / 2
    cx_ = round(cx, 4)
    caixas = [((cx_, round(cy, 4), 0.0), (round(L, 4), round(P, 4), round(h_assento, 4)))]
    if prof_encosto and hi.z > h_assento + 0.05:
        yb = hi.y - prof_encosto / 2 if y_encosto is None else y_encosto
        caixas.append(((cx_, round(yb, 4), round(h_assento, 4)),
                       (round(L, 4), round(prof_encosto, 4), round(hi.z - h_assento, 4))))
    it.colisao(caixas)


# =====================================================================================================================
# Poltronas estofadas
# =====================================================================================================================
def poltrona_base_madeira(it, cor="verde", cor2="verde_claro", mad="madeira_media", pe_cor="madeira_escura"):
    L, P = 0.80, 0.80
    it.add(mb.quatro_pes("conico", L - 0.06, P - 0.08, 0.075, pe_cor, r=0.022, recuo=0.05, abre=6))
    it.add(mb.caixa(L - 0.02, P - 0.04, 0.05, z=0.07, cor=mad, bisel=0.014))
    it.add(SE(L - 0.03, P - 0.03, 0.19, z=0.11, cor=cor, e=0.12, ev=0.3))
    for s in (-1, 1):
        it.add(SE(0.17, P, 0.48, x=s * (L / 2 - 0.085), z=0.11, cor=cor, e=0.22, ev=0.35))
    it.add(SE(L - 0.04, 0.18, 0.54, y=P / 2 - 0.09, z=0.11, cor=cor, e=0.18, ev=0.35))
    it.add(assento(0.48, 0.54, 0.145, y=-0.12, z=0.285, cor=cor2))
    it.add(encosto(0.47, 0.46, 0.16, y=0.12, z=0.36, cor=cor2, incl=12))
    col_auto(it, 0.43, 0.2)


def poltrona_concha(it, cor="rosa", cor2="rosa_bebe", pe_cor="madeira_media"):
    it.add(mb.quatro_pes("palito", 0.56, 0.48, 0.24, pe_cor, r=0.021, recuo=0.03, abre=12))
    it.add(SE(0.62, 0.52, 0.06, z=0.2, cor=pe_cor, e=0.3, ev=0.4))
    it.add(SE(0.80, 0.72, 0.24, z=0.20, cor=cor, e=0.55, ev=0.45))
    for s in (-1, 1):
        a = SE(0.20, 0.56, 0.36, x=s * 0.31, y=0.03, z=0.32, cor=cor, e=0.45, ev=0.5)
        gira(a, "Y", s * 18, (s * 0.31, 0, 0.34))
        it.add(a)
    b = SE(0.64, 0.22, 0.44, y=0.27, z=0.32, cor=cor, e=0.45, ev=0.5)
    gira(b, "X", -14, (0, 0.27, 0.34))
    it.add(b)
    it.add(assento(0.50, 0.50, 0.10, y=-0.05, z=0.36, cor=cor2, e=0.4))
    it.add(encosto(0.46, 0.30, 0.12, y=0.13, z=0.42, cor=cor2, incl=18, e=0.35))
    col_auto(it, 0.45, 0.22)


def poltrona_barril(it, cor="azul", cor2="azul_medio", pe_cor="madeira_clara"):
    L, P = 0.78, 0.74
    it.add(mb.quatro_pes("palito", L - 0.12, P - 0.12, 0.13, pe_cor, r=0.021, recuo=0.03, abre=8))
    it.add(SE(L - 0.01, P - 0.02, 0.22, z=0.11, cor=cor, e=0.16, ev=0.3))
    w = parede_u(L, -P / 2 + 0.03, P / 2, 0.37, 0.14, 0.42, 0.22, cor, bisel=0.06, seg=4)
    rampa_topo(w, 0.30, 0.72, 1.0)
    it.add(w)
    it.add(assento(0.52, 0.58, 0.15, y=-0.07, z=0.30, cor=cor2, e=0.3))
    col_auto(it, 0.45, 0.2)


def poltrona_alca(it, cor="amarelo", cor_tubo="laranja"):
    for s in (-1, 1):
        x = s * 0.30
        # começa e termina no meio da tábua de baixo: todas as quinas ficam redondas e as pontas se encontram
        pts = [(x, 0.0, 0.028), (x, -0.30, 0.028), (x, -0.30, 0.58), (x, 0.20, 0.58), (x, 0.31, 0.028),
               (x, 0.0, 0.028)]
        it.add(mb.tubo(pts, 0.028, cor=cor_tubo, raio_curva=0.09, seg=16, tampas=False))
    for yy in (-0.20, 0.17):
        it.add(barra((-0.30, yy, 0.30), (0.30, yy, 0.30), 0.02, cor_tubo))
    it.add(SE(0.57, 0.58, 0.14, y=-0.03, z=0.32, cor=cor, e=0.2, ev=0.45))
    it.add(encosto(0.57, 0.56, 0.13, y=0.24, z=0.38, cor=cor, incl=14, e=0.2, estufa=0.25))
    col_auto(it, 0.46, 0.2)


def poltrona_larga(it, cor="roxo", cor2="lilas", pe_cor="roxo_escuro"):
    L, P = 1.00, 0.86
    it.add(mb.quatro_pes("bola", L - 0.12, P - 0.12, 0.05, pe_cor, r=0.03, recuo=0.03))
    it.add(SE(L - 0.30, P - 0.02, 0.28, z=0.04, cor=cor, e=0.12, ev=0.3))
    for s in (-1, 1):
        it.add(SE(0.22, P, 0.56, x=s * (L / 2 - 0.11), z=0.035, cor=cor, e=0.25, ev=0.32))
    it.add(SE(L - 0.12, 0.24, 0.72, y=P / 2 - 0.12, z=0.035, cor=cor, e=0.2, ev=0.3))
    it.add(SE(L - 0.36, 0.26, 0.20, y=P / 2 - 0.13, z=0.62, cor=cor, e=0.3, ev=0.6))
    it.add(assento(0.60, 0.58, 0.16, y=-0.12, z=0.29, cor=cor2))
    it.add(encosto(0.58, 0.40, 0.16, y=0.12, z=0.42, cor=cor2, incl=10))
    col_auto(it, 0.45, 0.24)


def poltrona_palito_madeira(it, cor="cinza", mad="madeira_mel"):
    L = 0.66
    xs = L / 2 - 0.04
    for s in (-1, 1):
        x = s * xs
        it.add(mb.caixa(0.045, 0.045, 0.60, x=x, y=-0.29, cor=mad, bisel=0.012))
        it.add(mb.caixa(0.045, 0.045, 0.31, x=x, y=0.27, cor=mad, bisel=0.012))
        post = mb.caixa(0.045, 0.045, 0.56, x=x, y=0.27, z=0.29, cor=mad, bisel=0.012)
        gira(post, "X", -14, (x, 0.27, 0.29))
        it.add(post)
        it.add(mb.caixa(0.065, 0.74, 0.035, x=x, y=0.0, z=0.595, cor=mad, bisel=0.014))
        it.add(mb.caixa(0.04, 0.58, 0.06, x=x, z=0.25, cor=mad, bisel=0.01))
    for yy in (-0.29, 0.27):
        it.add(mb.caixa(2 * xs - 0.03, 0.035, 0.06, y=yy, z=0.25, cor=mad, bisel=0.01))
    it.add(mb.caixa(2 * xs, 0.03, 0.05, y=0.27 + 0.49 * math.tan(math.radians(14)), z=0.76, cor=mad, bisel=0.01))
    it.add(assento(0.58, 0.62, 0.14, y=-0.01, z=0.305, cor=cor))
    it.add(encosto(0.58, 0.48, 0.12, y=0.215, z=0.40, cor=cor, incl=14))
    col_auto(it, 0.45, 0.2)


def poltrona_ferradura(it, cor="verde", cor2="turquesa_escuro", pe_cor="madeira_escura"):
    it.add(mb.quatro_pes("palito", 0.52, 0.48, 0.20, pe_cor, r=0.022, recuo=0.03, abre=16))
    it.add(SE(0.82, 0.76, 0.28, z=0.17, cor=cor, e=0.35, ev=0.4))
    pts = []
    n = 26
    for k in range(n + 1):
        t = math.radians(-22 + 224 * k / n)
        s = (math.sin(t) + 0.38) / 1.38
        pts.append((0.33 * math.cos(t), 0.02 + 0.29 * math.sin(t), 0.50 + 0.17 * max(0.0, s)))
    it.add(mb.tubo(pts, 0.09, cor=cor2, raio_curva=0.05, seg=20))
    for p in (pts[0], pts[-1]):
        it.add(mb.esfera(0.09, x=p[0], y=p[1], z=p[2], cor=cor2, seg=20))
    col_auto(it, 0.45, 0.22)


def _perfil_d(P, A, R, zf):
    """Perfil (y, z) do braço de poltrona com a frente redonda: fundo em y=P/2, frente em −P/2, quina de cima da
    frente com raio R começando em zf."""
    pts = [(P / 2, 0.0), (-P / 2, 0.0), (-P / 2, zf)]
    for k in range(1, 13):
        a = math.radians(180 - 90 * k / 12)
        pts.append((-P / 2 + R + R * math.cos(a), zf + R * math.sin(a)))
    pts.append((P / 2, zf + R))
    return mb._ccw(pts)


def poltrona_clube(it, cor="terracota_escura", cor2="terracota", pe_cor="chocolate"):
    L, P = 0.88, 0.82
    it.add(mb.quatro_pes("bola", L - 0.12, P - 0.12, 0.04, pe_cor, r=0.03, recuo=0.03))
    it.add(SE(L - 0.34, P - 0.04, 0.27, z=0.035, cor=cor, e=0.12, ev=0.3))
    for s in (-1, 1):
        x0 = L / 2 - 0.19 if s > 0 else -L / 2
        it.add(mb.extrudado(_perfil_d(P, 0.62, 0.25, 0.34), 0.19, x=x0, z=0.03, plano="yz", cor=cor, bisel=0.05,
                            seg=4))
    b = SE(L - 0.02, 0.22, 0.84, y=P / 2 - 0.11, z=0.03, cor=cor, e=0.2, ev=0.35)
    it.add(b)
    it.add(assento(0.54, 0.58, 0.16, y=-0.11, z=0.29, cor=cor2))
    it.add(encosto(0.52, 0.44, 0.15, y=0.13, z=0.42, cor=cor2, incl=10))
    col_auto(it, 0.45, 0.22)


def poltrona_casulo(it, cor="laranja", cor2="laranja_claro"):
    L, P = 0.80, 0.80
    it.add(mb.quatro_pes("bola", L - 0.2, P - 0.2, 0.04, cor, r=0.03, recuo=0.03))
    it.add(SE(L - 0.02, P - 0.02, 0.26, z=0.03, cor=cor, e=0.28, ev=0.35))
    w = parede_u(L, -P / 2 + 0.05, P / 2, 0.39, 0.18, 0.58, 0.12, cor, bisel=0.085, seg=5)
    rampa_topo(w, 0.25, 0.7, 1.0)
    it.add(w)
    it.add(assento(0.46, 0.58, 0.17, y=-0.08, z=0.28, cor=cor2, e=0.3))
    it.add(encosto(0.42, 0.32, 0.12, y=0.14, z=0.42, cor=cor2, incl=10, e=0.3))
    col_auto(it, 0.45, 0.22)


def poltrona_sem_bracos(it, cor="verde_lima", mad="madeira_clara"):
    for s in (-1, 1):
        x = s * 0.29
        for yy in (-0.29, 0.29):
            it.add(mb.caixa(0.05, 0.05, 0.22, x=x, y=yy, cor=mad, bisel=0.014))
        it.add(mb.caixa(0.055, 0.66, 0.05, x=x, z=0.18, cor=mad, bisel=0.014))
    it.add(mb.caixa(0.56, 0.04, 0.04, y=0.29, z=0.185, cor=mad, bisel=0.01))
    it.add(SE(0.70, 0.74, 0.25, z=0.205, cor=cor, e=0.2, ev=0.35))
    w = parede_u(0.70, -0.02, 0.37, 0.30, 0.14, 0.38, 0.38, cor, bisel=0.06, seg=4)
    rampa_topo(w, 0.45, 0.8, 1.0)
    it.add(w)
    col_auto(it, 0.45, 0.2)


def poltrona_caixa(it, cor="violeta", cor2="roxo", pe_cor="vermelho"):
    L, P = 0.86, 0.78
    it.add(mb.quatro_pes("reto", L, P, 0.15, pe_cor, r=0.024, recuo=0.07))
    it.add(SE(L, P, 0.17, z=0.14, cor=cor, e=0.1, ev=0.25))
    for s in (-1, 1):
        it.add(SE(0.15, P, 0.50, x=s * (L / 2 - 0.075), z=0.14, cor=cor, e=0.12, ev=0.25))
    it.add(SE(L, 0.16, 0.50, y=P / 2 - 0.08, z=0.14, cor=cor, e=0.12, ev=0.25))
    it.add(assento(L - 0.28, P - 0.17, 0.16, y=-0.08, z=0.295, cor=cor2, e=0.15, estufa=0.2))
    it.add(encosto(L - 0.31, 0.34, 0.14, y=P / 2 - 0.24, z=0.42, cor=cor2, incl=8, e=0.15))
    col_auto(it, 0.45, 0.2)


def poltrona_orelha(it, cor="turquesa", cor2="vermelho", pe_cor="vermelho"):
    L, P = 0.90, 0.80
    it.add(mb.quatro_pes("bloco", L, P, 0.08, pe_cor, r=0.04, recuo=0.07))
    it.add(SE(L, P, 0.25, z=0.07, cor=cor, e=0.1, ev=0.25))
    for s in (-1, 1):
        it.add(SE(0.17, P, 0.48, x=s * (L / 2 - 0.085), z=0.07, cor=cor, e=0.12, ev=0.25))
        it.add(SE(0.17, 0.30, 0.53, x=s * (L / 2 - 0.085), y=P / 2 - 0.22, z=0.45, cor=cor, e=0.25, ev=0.35))
    it.add(SE(L, 0.18, 0.83, y=P / 2 - 0.09, z=0.07, cor=cor, e=0.12, ev=0.25))
    it.add(assento(L - 0.32, P - 0.21, 0.14, y=-0.08, z=0.305, cor=cor2, e=0.12, estufa=0.15))
    col_auto(it, 0.44, 0.2)


def poltrona_bracos_acolchoados(it, cor="cinza_claro", mad="madeira_mel"):
    xs = 0.29
    for s in (-1, 1):
        x = s * xs
        f = mb.caixa(0.042, 0.046, 0.61, x=x, y=-0.33, cor=mad, bisel=0.012)
        gira(f, "X", -12, (x, -0.33, 0))
        b = mb.caixa(0.042, 0.046, 0.33, x=x, y=0.30, cor=mad, bisel=0.012)
        gira(b, "X", 12, (x, 0.30, 0))
        post = mb.caixa(0.042, 0.042, 0.52, x=x, y=0.235, z=0.30, cor=mad, bisel=0.012)
        gira(post, "X", -14, (x, 0.235, 0.30))
        it.add(f, b, post)
        it.add(mb.caixa(0.05, 0.60, 0.03, x=x, y=0.0, z=0.575, cor=mad, bisel=0.012))
        it.add(SE(0.095, 0.46, 0.075, x=x, y=-0.04, z=0.595, cor=cor, e=0.3, ev=0.5))
        it.add(mb.caixa(0.04, 0.58, 0.05, x=x, y=-0.01, z=0.27, cor=mad, bisel=0.01))
    for yy in (-0.27, 0.235):
        it.add(mb.caixa(2 * xs - 0.03, 0.035, 0.05, y=yy, z=0.27, cor=mad, bisel=0.01))
    it.add(SE(0.60, 0.60, 0.14, y=-0.02, z=0.31, cor=cor, e=0.15, ev=0.45))
    it.add(encosto(0.58, 0.50, 0.12, y=0.20, z=0.40, cor=cor, incl=14, e=0.18))
    col_auto(it, 0.45, 0.2)


def cadeira_balanco_estofada(it, cor="verde", mad="madeira_media"):
    Lr, Rr = 0.92, 1.6
    for s in (-1, 1):
        x = s * 0.28
        it.add(balanco(x, Lr, Rr, 0.04, 0.05, cor=mad))
        for yy in (-0.22, 0.22):
            z0 = balanco_z(Lr, Rr, yy) + 0.04
            it.add(mb.cilindro(0.021, 0.33 - z0, x=x, y=yy, z=z0, cor=mad, seg=14))
        it.add(mb.cilindro(0.02, 0.28, x=x, y=-0.22, z=0.33, cor=mad, seg=14))
        post = mb.cilindro(0.021, 0.64, x=x, y=0.22, z=0.30, cor=mad, seg=14)
        gira(post, "X", -16, (x, 0.22, 0.30))
        it.add(post)
        yb = 0.22 + 0.32 * math.tan(math.radians(16))
        it.add(mb.tubo([(x, -0.27, 0.60), (x, -0.22, 0.615), (x, yb, 0.62)], 0.024, cor=mad, raio_curva=0.05))
        it.add(esfera(0.026, x, -0.27, 0.60, mad))
    it.add(mb.caixa(0.60, 0.50, 0.05, z=0.30, cor=mad, bisel=0.012))
    it.add(assento(0.56, 0.58, 0.13, y=-0.02, z=0.335, cor=cor, e=0.18))
    it.add(encosto(0.54, 0.56, 0.13, y=0.20, z=0.42, cor=cor, incl=16, e=0.18))
    col_auto(it, 0.46, 0.22)


def cadeira_torneada(it, cor="verde_medio", mad="madeira"):
    L, P = 0.62, 0.58
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.add(mb.pe("torneado", 0.30, x=sx * 0.26, y=sy * 0.24, cor=mad, r=0.03))
    it.add(mb.caixa(L, P, 0.05, z=0.29, cor=mad, bisel=0.016))
    it.add(assento(L - 0.05, P - 0.06, 0.12, y=-0.01, z=0.335, cor=cor, e=0.2))
    w = parede_u(L - 0.02, -0.10, P / 2, 0.29, 0.065, 0.32, 0.40, cor, bisel=0.026, seg=3)
    it.add(w)
    # corrimão de madeira por cima do U, e os montantes da frente torneados
    pts = []
    Rm = 0.29 - 0.0325
    xm = (L - 0.02) / 2 - 0.0325
    pts.append((xm, -0.10, 0.735))
    for k in range(13):
        a = math.radians(90 * k / 12)
        pts.append((xm - Rm + Rm * math.cos(a), P / 2 - 0.29 + Rm * math.sin(a), 0.735))
    for k in range(13):
        a = math.radians(90 + 90 * k / 12)
        pts.append((-xm + Rm + Rm * math.cos(a), P / 2 - 0.29 + Rm * math.sin(a), 0.735))
    pts.append((-xm, -0.10, 0.735))
    it.add(mb.tubo(_sem_repetidos_3d(pts), 0.026, cor=mad, raio_curva=0.03, seg=14))
    for s in (-1, 1):
        it.add(mb.pe("torneado", 0.34, x=s * xm, y=-0.10, z=0.40, cor=mad, r=0.026))
        it.add(esfera(0.03, s * xm, -0.10, 0.75, mad))
    col_auto(it, 0.45, 0.2)


def _sem_repetidos_3d(pts):
    out = []
    for p in pts:
        if not out or (V(p) - V(out[-1])).length > 1e-5:
            out.append(p)
    return out


def poltrona_grande(it, cor="laranja_claro", cor2="pessego", pe_cor="terracota_clara"):
    L, P = 0.94, 0.90
    it.add(mb.quatro_pes("bola", L - 0.14, P - 0.14, 0.05, pe_cor, r=0.035, recuo=0.035))
    it.add(SE(L - 0.30, P - 0.02, 0.28, z=0.04, cor=cor, e=0.18, ev=0.3))
    for s in (-1, 1):
        it.add(SE(0.22, P - 0.03, 0.56, x=s * (L / 2 - 0.11), y=-0.01, z=0.035, cor=cor, e=0.4, ev=0.42))
    it.add(SE(L - 0.14, 0.27, 0.88, y=P / 2 - 0.135, z=0.035, cor=cor, e=0.32, ev=0.45))
    it.add(assento(0.56, 0.60, 0.18, y=-0.13, z=0.28, cor=cor2, e=0.25))
    it.add(encosto(0.52, 0.48, 0.16, y=0.12, z=0.42, cor=cor2, incl=10, e=0.25))
    col_auto(it, 0.46, 0.25)


def poltrona_capitone(it, cor="couro", cor2="laranja", pe_cor="laranja"):
    L, P = 0.94, 0.86
    it.add(mb.quatro_pes("bola", L - 0.08, P - 0.1, 0.06, pe_cor, r=0.035, recuo=0.045))
    it.add(SE(L - 0.34, P - 0.04, 0.27, z=0.05, cor=cor, e=0.12, ev=0.3))
    for s in (-1, 1):
        x = s * (L / 2 - 0.095)
        it.add(SE(0.19, P, 0.53, x=x, z=0.05, cor=cor, e=0.2, ev=0.3))
        it.add(SE(0.075, 0.04, 0.36, x=x, y=-P / 2 + 0.012, z=0.1, cor=cor2, e=0.3, ev=0.3))
    for i in (-1, 0, 1):
        c = SE(0.32, 0.24, 0.86 - 0.05 * abs(i), x=i * 0.29, y=P / 2 - 0.12, z=0.05, cor=cor, e=0.4, ev=0.45)
        gira(c, "X", -6, (i * 0.29, P / 2 - 0.12, 0.3))
        it.add(c)
    it.add(assento(0.58, 0.58, 0.16, y=-0.13, z=0.29, cor=cor, e=0.15))
    col_auto(it, 0.45, 0.24)


# =====================================================================================================================
# Balanço, escritório e gamer
# =====================================================================================================================
def cadeira_balanco_madeira(it, mad="madeira_mel", cor="marrom"):
    Lr, Rr = 0.96, 1.5
    pv = (0, 0.20, 0.40)
    traseiro = []
    for s in (-1, 1):
        x = s * 0.25
        it.add(balanco(x, Lr, Rr, 0.036, 0.05, cor=mad))
        it.add(mb.pe("torneado", 0.60, x=x, y=-0.20, z=balanco_z(Lr, Rr, -0.20) + 0.035, cor=mad, r=0.026))
        it.add(esfera(0.026, x, -0.20, balanco_z(Lr, Rr, -0.20) + 0.645, mad))
        traseiro.append(mb.cilindro(0.022, 0.98, x=x, y=0.20, z=0.03, cor=mad, seg=14))
        traseiro.append(esfera(0.03, x, 0.20, 1.02, mad))
        it.add(mb.caixa(0.025, 0.40, 0.025, x=x, z=0.20, cor=mad, bisel=0.008))
        yb = 0.20 + 0.22 * math.tan(math.radians(10))
        it.add(mb.caixa(0.055, yb + 0.25, 0.026, x=s * 0.265, y=(yb - 0.25) / 2, z=0.615, cor=mad, bisel=0.01))
    traseiro.append(mb.caixa(0.50, 0.04, 0.08, y=0.20, z=0.90, cor=mad, bisel=0.014))
    traseiro.append(mb.caixa(0.50, 0.035, 0.04, y=0.20, z=0.64, cor=mad, bisel=0.01))
    traseiro.append(mb.caixa(0.44, 0.04, 0.22, y=0.18, z=0.665, cor=cor, bisel=0.02))
    for k in range(4):
        traseiro.append(mb.cilindro(0.011, 0.22, x=-0.135 + 0.09 * k, y=0.20, z=0.43, cor=mad, seg=10))
    gira(traseiro, "X", -10, pv)
    it.add(traseiro)
    it.add(mb.caixa(0.53, 0.46, 0.035, y=0.0, z=0.385, cor=mad, bisel=0.012))
    it.add(assento(0.46, 0.40, 0.055, y=-0.01, z=0.415, cor=cor, e=0.25, estufa=0.2))
    col_auto(it, 0.46, 0.22)


def cadeira_escritorio_executiva(it, cor="azul", cor2="vermelho", cor_roda="cinza_claro"):
    it.add(base_estrela(0.32, cor=cor2, cor_roda=cor_roda, z_topo=0.36, cor_mec="grafite"))
    it.add(SE(0.56, 0.54, 0.07, z=0.355, cor=cor2, e=0.18, ev=0.4))
    it.add(assento(0.48, 0.48, 0.08, y=-0.01, z=0.39, cor=cor, e=0.2, estufa=0.15))
    tras = [SE(0.54, 0.10, 0.84, y=0.27, z=0.42, cor=cor2, e=0.18, ev=0.3)]
    for k in range(6):
        tras.append(SE(0.46, 0.08, 0.135, y=0.215, z=0.46 + k * 0.128, cor=cor, e=0.25, ev=0.6, nu=20, nv=8))
    gira(tras, "X", -10, (0, 0.27, 0.42))
    it.add(tras)
    it.add(mb.caixa(0.08, 0.14, 0.05, y=0.22, z=0.36, cor="grafite", bisel=0.012))
    col_auto(it, 0.47, 0.2)


def cadeira_gamer(it, cor="laranja", cor2="terracota", cor3="amarelo", base="preto"):
    it.add(base_estrela(0.33, cor=base, cor_roda="cinza", z_topo=0.36, cor_mec="grafite"))
    it.add(SE(0.38, 0.50, 0.09, z=0.36, cor=cor2, e=0.2, ev=0.45))
    for s in (-1, 1):
        it.add(SE(0.11, 0.52, 0.13, x=s * 0.23, z=0.36, cor=cor, e=0.3, ev=0.45, nu=20, nv=10))
    tras = [SE(0.56, 0.12, 0.72, y=0.27, z=0.42, cor=cor, e=0.15, ev=0.25),
            SE(0.38, 0.12, 0.30, y=0.27, z=1.04, cor=cor, e=0.25, ev=0.35),
            SE(0.26, 0.06, 0.76, y=0.205, z=0.46, cor=cor2, e=0.2, ev=0.3),
            SE(0.24, 0.10, 0.11, y=0.17, z=1.15, cor=cor3, e=0.4, ev=0.6, nu=20, nv=10),
            SE(0.28, 0.11, 0.15, y=0.165, z=0.56, cor=cor3, e=0.4, ev=0.6, nu=20, nv=10)]
    for s in (-1, 1):
        tras.append(SE(0.08, 0.12, 0.62, x=s * 0.26, y=0.24, z=0.46, cor=cor, e=0.4, ev=0.4, nu=20, nv=10))
    gira(tras, "X", -12, (0, 0.27, 0.42))
    it.add(tras)
    for s in (-1, 1):
        x = s * 0.30
        it.add(mb.caixa(0.035, 0.07, 0.24, x=x, y=0.02, z=0.33, cor=base, bisel=0.012))
        it.add(mb.caixa(0.08, 0.04, 0.04, x=s * 0.27, y=0.02, z=0.36, cor=base, bisel=0.012))
        it.add(SE(0.085, 0.28, 0.05, x=x, y=0.0, z=0.565, cor="marrom", e=0.3, ev=0.5, nu=20, nv=10))
    it.add(mb.caixa(0.08, 0.14, 0.05, y=0.22, z=0.36, cor=base, bisel=0.012))
    col_auto(it, 0.47, 0.2)


def cadeira_presidente(it, cor="couro_preto", base="chocolate"):
    it.add(base_estrela(0.34, cor=base, cor_roda="cinza", z_topo=0.33, cor_mec="ferro"))
    it.add(SE(0.62, 0.58, 0.15, z=0.32, cor=cor, e=0.15, ev=0.4))
    for s in (-1, 1):
        it.add(SE(0.13, 0.52, 0.32, x=s * 0.31, y=0.0, z=0.32, cor=cor, e=0.22, ev=0.35))
    tras = [SE(0.64, 0.16, 0.76, y=0.27, z=0.40, cor=cor, e=0.15, ev=0.3)]
    for s in (-1, 1):
        tras.append(SE(0.27, 0.10, 0.68, x=s * 0.14, y=0.20, z=0.45, cor=cor, e=0.28, ev=0.35))
    gira(tras, "X", -8, (0, 0.27, 0.40))
    it.add(tras)
    col_auto(it, 0.47, 0.22)


def cadeira_escritorio_simples(it, cor="turquesa", base="cinza_claro", cor_roda="cinza", metal="cromo"):
    it.add(base_estrela(0.30, cor=base, cor_roda=cor_roda, z_topo=0.37, cor_mec="grafite"))
    it.add(SE(0.48, 0.46, 0.09, z=0.37, cor=cor, e=0.22, ev=0.45))
    it.add(mb.caixa(0.05, 0.16, 0.02, y=0.17, z=0.355, cor=metal, bisel=0.008))
    haste = mb.caixa(0.05, 0.02, 0.36, y=0.245, z=0.355, cor=metal, bisel=0.008)
    gira(haste, "X", -6, (0, 0.245, 0.355))
    it.add(haste)
    it.add(encosto(0.42, 0.30, 0.075, y=0.24, z=0.58, cor=cor, incl=6, e=0.25, estufa=0.2))
    col_auto(it, 0.46, 0.15)


# =====================================================================================================================
# Banquetas, cadeiras de cozinha e de jantar
# =====================================================================================================================
def banqueta_bar_giratoria(it, cor="vermelho", metal="cromo", base="cinza_claro"):
    it.add(mb.torno([(0, 0), (0.2, 0), (0.205, 0.008), (0.19, 0.024), (0.07, 0.038), (0.04, 0.05), (0, 0.05)],
                    cor=base, seg=40))
    it.add(mb.cilindro(0.028, 0.66, z=0.04, cor=metal, seg=20))
    it.add(mb.tubo(anel(mb.circulo(0.17, 36), 0.30), 0.012, cor=metal, fechado=True))
    for a in (0, 90):
        b = barra((-0.17, 0, 0.30), (0.17, 0, 0.30), 0.01, metal)
        gira(b, "Z", a)
        it.add(b)
    it.add(mb.cilindro(0.09, 0.02, z=0.685, cor=metal, seg=24))
    it.add(mb.torno([(0, 0.695), (0.17, 0.695), (0.19, 0.71), (0.197, 0.735), (0.185, 0.758), (0.14, 0.768),
                     (0, 0.771)], cor=cor, seg=36))
    col_auto(it, 0.77, 0)


def banqueta_bar_encosto(it, cor="rosa_escuro", tubo_cor="magenta"):
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.add(barra((sx * 0.19, sy * 0.19, 0), (sx * 0.16, sy * 0.16, 0.69), 0.019, tubo_cor))
    for sy, h in ((-1, 0.27), (1, 0.27)):
        it.add(barra((-0.183, sy * 0.183, h), (0.183, sy * 0.183, h), 0.016, tubo_cor))
    for sx in (-1, 1):
        it.add(barra((sx * 0.185, -0.185, 0.21), (sx * 0.185, 0.185, 0.21), 0.016, tubo_cor))
    it.add(SE(0.40, 0.40, 0.085, z=0.665, cor=cor, e=0.25, ev=0.45))
    it.add(mb.tubo([(0, 0.15, 0.70), (0, 0.19, 0.78), (0, 0.205, 1.06)], 0.02, cor=tubo_cor, raio_curva=0.06))
    pad = SE(0.38, 0.07, 0.15, y=0.21, z=0.90, cor=cor, e=0.3, ev=0.45)
    curva_x(pad, -1.2)
    gira(pad, "X", -8, (0, 0.21, 0.975))
    it.add(pad)
    it.add(esfera(0.035, 0, 0.205, 1.08, tubo_cor))
    col_auto(it, 0.75, 0.1)


def banqueta_bar_quadrada(it, cor="verde_medio", metal="grafite"):
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.add(mb.caixa(0.036, 0.036, 0.66, x=sx * 0.165, y=sy * 0.165, cor=metal, bisel=0.01))
    for sy, h in ((-1, 0.26), (1, 0.26)):
        it.add(mb.caixa(0.30, 0.03, 0.03, y=sy * 0.165, z=h, cor=metal, bisel=0.009))
    for sx in (-1, 1):
        it.add(mb.caixa(0.03, 0.30, 0.03, x=sx * 0.165, z=0.16, cor=metal, bisel=0.009))
    it.add(mb.caixa(0.37, 0.37, 0.035, z=0.63, cor=metal, bisel=0.01))
    it.add(SE(0.40, 0.40, 0.10, z=0.655, cor=cor, e=0.15, ev=0.45, estufa=0.1))
    col_auto(it, 0.755, 0)


def banqueta_industrial(it, cor="madeira_media", metal="grafite"):
    it.add(mb.cilindro(0.18, 0.045, z=0.64, cor=cor, seg=36, bisel=0.014))
    it.add(mb.cilindro(0.065, 0.03, z=0.612, cor=metal, seg=20))
    it.add(mb.cilindro(0.02, 0.12, z=0.50, cor="metal", seg=14))
    for k in range(4):
        it.add(mb.cilindro(0.026, 0.008, z=0.515 + 0.025 * k, cor="metal", seg=14, bisel=0.002))
    it.add(mb.cilindro(0.05, 0.03, z=0.48, cor=metal, seg=18))
    for k in range(4):
        a = math.radians(45 + 90 * k)
        c, s = math.cos(a), math.sin(a)
        pts = [(c * 0.04, s * 0.04, 0.495), (c * 0.13, s * 0.13, 0.47), (c * 0.215, s * 0.215, 0.0)]
        it.add(mb.tubo(pts, 0.015, cor=metal, raio_curva=0.12))
    it.add(mb.tubo(anel(mb.circulo(0.18, 36), 0.19), 0.011, cor=metal, fechado=True))
    col_auto(it, 0.685, 0)


def cadeira_alta_bebe(it, mad="madeira_clara", cor="menta", bandeja="branco"):
    # pés abertos (em A) até o assento a 0,55 m
    pes = {}
    for sx in (-1, 1):
        for sy in (-1, 1):
            p0 = (sx * 0.27, sy * 0.29, 0.007)
            p1 = (sx * 0.19, sy * 0.17, 0.53)
            pes[(sx, sy)] = (p0, p1)
            it.add(barra(p0, p1, 0.021, mad, seg=14))
            it.add(mb.cilindro(0.024, 0.012, x=p0[0], y=p0[1], cor="borracha", seg=12, bisel=0.003))

    def em(sx, sy, z):
        p0, p1 = pes[(sx, sy)]
        t = z / 0.53
        return (p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t, z)

    for sx in (-1, 1):
        it.add(barra(em(sx, -1, 0.16), em(sx, 1, 0.16), 0.013, mad))
    it.add(barra(em(-1, 1, 0.22), em(1, 1, 0.22), 0.013, mad))
    # apoio dos pés
    a, b = em(-1, -1, 0.25), em(1, -1, 0.25)
    it.add(mb.caixa(b[0] - a[0] + 0.03, 0.08, 0.022, y=a[1] + 0.02, z=0.24, cor=mad, bisel=0.008))
    # assento, encosto e braços
    it.add(mb.caixa(0.42, 0.40, 0.035, z=0.525, cor=mad, bisel=0.012))
    costas = [mb.extrudado([(px, pz + 0.21) for px, pz in mb.ret_arredondado(0.40, 0.44, 0.12)], 0.03, y=0.17,
                           z=0.535, plano="xz", cor=mad, bisel=0.01),
              encosto(0.32, 0.30, 0.04, y=0.165, z=0.60, cor=cor, incl=0, e=0.25, estufa=0.2)]
    gira(costas, "X", -8, (0, 0.18, 0.55))
    it.add(costas)
    it.add(assento(0.34, 0.32, 0.045, y=-0.01, z=0.553, cor=cor, e=0.25, estufa=0.2))
    for s in (-1, 1):
        x = s * 0.195
        it.add(mb.caixa(0.035, 0.38, 0.03, x=x, y=0.0, z=0.76, cor=mad, bisel=0.012))
        it.add(barra((x, -0.15, 0.555), (x, -0.15, 0.765), 0.016, mad))
        it.add(barra((x, 0.05, 0.555), (x, 0.05, 0.765), 0.012, mad))
        it.add(mb.caixa(0.012, 0.30, 0.012, x=x, y=-0.05, z=0.66, cor=mad, bisel=0.004))
    # bandeja de encaixar: tampo boleado, aba em volta e as presilhas nos braços
    it.add(mb.extrudado(mb.ret_arredondado(0.58, 0.30, 0.09), 0.02, y=-0.29, z=0.79, cor=bandeja, bisel=0.007))
    it.add(mb.tubo([(px, py - 0.29, 0.81) for px, py in mb.ret_arredondado(0.555, 0.275, 0.08, seg=5)], 0.012,
                   cor=bandeja, fechado=True))
    for s in (-1, 1):
        it.add(mb.caixa(0.06, 0.08, 0.03, x=s * 0.195, y=-0.16, z=0.775, cor=bandeja, bisel=0.01))
    it.add(mb.cilindro(0.06, 0.006, x=0.13, y=-0.30, z=0.809, cor="azul_claro", seg=18, bisel=0.002))
    col_auto(it, 0.82, 0.12)


def _cadeira_cozinha_pes(it, mad, frente="torneado"):
    for s in (-1, 1):
        x = s * 0.18
        if frente == "torneado":
            it.add(mb.pe("torneado", 0.42, x=x, y=-0.165, cor=mad, r=0.027))
        else:
            it.add(mb.caixa(0.036, 0.036, 0.42, x=x, y=-0.165, cor=mad, bisel=0.01))


def cadeira_cozinha_madeira(it, mad="madeira_mel", assento_cor="madeira_clara"):
    _cadeira_cozinha_pes(it, mad, "torneado")
    yt = lambda z: 0.165 + (z - 0.43) * (0.075 / 0.52)  # noqa: E731
    for s in (-1, 1):
        x = s * 0.18
        it.add(mb.tubo([(x, 0.20, 0.0), (x, 0.165, 0.43), (x, yt(0.95), 0.95)], 0.021, cor=mad, raio_curva=0.05))
        it.add(esfera(0.024, x, yt(0.95), 0.95, mad))
        it.add(barra((x, -0.165, 0.15), (x, 0.185, 0.15), 0.012, mad))
    it.add(barra((-0.18, -0.165, 0.21), (0.18, -0.165, 0.21), 0.012, mad))
    it.add(mb.extrudado(mb.ret_arredondado(0.44, 0.42, 0.07), 0.04, y=0.0, z=0.41, cor=assento_cor, bisel=0.013))
    for xi in (-0.09, 0.0, 0.09):
        it.add(barra((xi, 0.165, 0.44), (xi, yt(0.86), 0.86), 0.011, mad))
    topo = arco_faixa(0.98, 1.02, 79, 101, 0.09, y=yt(0.89) - 1.0, z=0.845, cor=mad, bisel=0.012)
    gira(topo, "X", -8, (0, yt(0.89), 0.89))
    it.add(topo)
    col_auto(it, 0.45, 0.12)


def cadeira_cozinha_ripas(it, cor="menta", assento_cor="madeira_clara"):
    _cadeira_cozinha_pes(it, cor, "reto")
    pv = (0, 0.175, 0.43)
    tras = []
    for s in (-1, 1):
        x = s * 0.18
        it.add(mb.caixa(0.036, 0.036, 0.44, x=x, y=0.175, cor=cor, bisel=0.01))
        tras.append(mb.caixa(0.036, 0.036, 0.52, x=x, y=0.175, z=0.42, cor=cor, bisel=0.01))
        it.add(mb.caixa(0.026, 0.33, 0.026, x=x, y=0.005, z=0.14, cor=cor, bisel=0.008))
        it.add(mb.caixa(0.022, 0.32, 0.06, x=x, y=0.005, z=0.35, cor=cor, bisel=0.008))
    it.add(mb.caixa(0.33, 0.022, 0.06, y=-0.165, z=0.35, cor=cor, bisel=0.008))
    it.add(mb.caixa(0.33, 0.026, 0.026, y=-0.165, z=0.18, cor=cor, bisel=0.008))
    for k, h in enumerate((0.60, 0.72, 0.84)):
        tras.append(mb.caixa(0.34, 0.024, 0.065 if k < 2 else 0.085, y=0.175, z=h, cor=cor, bisel=0.01))
    gira(tras, "X", -8, pv)
    it.add(tras)
    it.add(mb.caixa(0.44, 0.42, 0.04, z=0.41, cor=assento_cor, bisel=0.014))
    col_auto(it, 0.45, 0.12)


def cadeira_jantar_estofada(it, cor="cinza_claro", mad="madeira_clara"):
    it.add(mb.quatro_pes("palito", 0.44, 0.42, 0.39, mad, r=0.022, recuo=0.03, abre=5))
    for s in (-1, 1):
        it.add(barra((s * 0.177, -0.168, 0.15), (s * 0.177, 0.168, 0.15), 0.011, mad))
    it.add(mb.caixa(0.42, 0.40, 0.025, z=0.37, cor=mad, bisel=0.008))
    it.add(SE(0.48, 0.46, 0.09, z=0.375, cor=cor, e=0.2, ev=0.45))
    w = parede_u(0.48, 0.05, 0.25, 0.17, 0.05, 0.44, 0.44, cor, bisel=0.022, seg=3)
    arqueia_topo(w, 0.55, 0.85)
    gira(w, "X", -6, (0, 0.2, 0.44))
    it.add(w)
    col_auto(it, 0.465, 0.12)


def cadeira_jantar_alta(it, cor="amarelo_escuro", pe_cor="vermelho"):
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.add(mb.cilindro(0.022, 0.21, x=sx * 0.18, y=sy * 0.18, cor=pe_cor, seg=14, bisel=0.006))
    it.add(SE(0.46, 0.48, 0.26, z=0.20, cor=cor, e=0.12, ev=0.25))
    b = SE(0.44, 0.10, 0.62, y=0.19, z=0.42, cor=cor, e=0.12, ev=0.25)
    gira(b, "X", -5, (0, 0.19, 0.42))
    it.add(b)
    col_auto(it, 0.46, 0.12)


def cadeira_cafe_tubo(it, cor="azul_celeste", tubo_cor="verde_lima"):
    for s in (-1, 1):
        x = s * 0.235
        pts = [(x, -0.22, 0.0), (x, -0.235, 0.62), (x, 0.19, 0.64), (x, 0.22, 0.0)]
        it.add(mb.tubo(pts, 0.015, cor=tubo_cor, raio_curva=0.06))
    for yy in (-0.19, 0.17):
        it.add(barra((-0.235, yy, 0.37), (0.235, yy, 0.37), 0.012, tubo_cor))
    it.add(SE(0.46, 0.46, 0.085, y=-0.01, z=0.375, cor=cor, e=0.2, ev=0.45))
    it.add(encosto(0.455, 0.34, 0.07, y=0.20, z=0.47, cor=cor, incl=3, e=0.2, estufa=0.2))
    col_auto(it, 0.46, 0.1)


def cadeira_bistro(it, cor="laranja_claro"):
    it.add(mb.quatro_pes("conico", 0.30, 0.30, 0.41, cor, r=0.026, recuo=0.0, abre=6))
    it.add(mb.cilindro(0.21, 0.05, z=0.40, cor=cor, seg=36, bisel=0.02))
    for s in (-1, 1):
        it.add(mb.cilindro(0.018, 0.24, x=s * 0.10, y=0.16, z=0.44, cor=cor, seg=12))
    it.add(arco_faixa(0.165, 0.215, 18, 162, 0.085, z=0.64, cor=cor, bisel=0.02, n=24))
    col_auto(it, 0.45, 0.1)


def banqueta_estofada(it, cor="verde_medio", mad="laranja"):
    it.add(mb.quatro_pes("bloco", 0.50, 0.38, 0.36, mad, r=0.021, recuo=0.035, abre=8))
    it.add(mb.caixa(0.47, 0.35, 0.06, z=0.32, cor=mad, bisel=0.014))
    it.add(SE(0.50, 0.38, 0.10, z=0.35, cor=cor, e=0.2, ev=0.45, estufa=0.2))
    col_auto(it, 0.45, 0)


def banqueta_cozinha_encosto(it, mad="madeira", assento_cor="madeira_mel"):
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.add(barra((sx * 0.19, sy * 0.19, 0), (sx * 0.16, sy * 0.16, 0.63), 0.02, mad, seg=14))
    it.add(barra((-0.183, -0.183, 0.25), (0.183, -0.183, 0.25), 0.014, mad))
    it.add(barra((-0.185, 0.185, 0.22), (0.185, 0.185, 0.22), 0.012, mad))
    for sx in (-1, 1):
        it.add(barra((sx * 0.186, -0.186, 0.18), (sx * 0.186, 0.186, 0.18), 0.012, mad))
    it.add(mb.extrudado(mb.ret_arredondado(0.40, 0.38, 0.06), 0.04, z=0.62, cor=assento_cor, bisel=0.013))
    yt = lambda z: 0.16 + (z - 0.64) * (0.06 / 0.32)  # noqa: E731
    for sx in (-1, 1):
        it.add(barra((sx * 0.16, 0.16, 0.64), (sx * 0.16, yt(0.96), 0.96), 0.019, mad))
        it.add(esfera(0.021, sx * 0.16, yt(0.96), 0.96, mad))
    for h, alt in ((0.78, 0.05), (0.88, 0.07)):
        r = mb.caixa(0.33, 0.022, alt, y=yt(h + alt / 2), z=h, cor=assento_cor, bisel=0.009)
        gira(r, "X", -10.6, (0, yt(h + alt / 2), h + alt / 2))
        it.add(r)
    col_auto(it, 0.66, 0.1)


# =====================================================================================================================
# Jardim, dobráveis, infantis e banquinhos
# =====================================================================================================================
def cadeira_jardim_plastico(it, cor="plastico_branco"):
    it.add(mb.quatro_pes("conico", 0.50, 0.48, 0.42, cor, r=0.03, recuo=0.035, abre=7))
    it.add(mb.extrudado(mb.ret_arredondado(0.48, 0.45, 0.09), 0.03, y=-0.01, z=0.41, cor=cor, bisel=0.012))
    it.add(mb.cilindro(0.016, 0.44, x=0, y=-0.235, z=0.405, cor=cor, eixo="x", seg=12, bisel=0.004))
    tras = []
    Rr = 0.5
    for k, h in enumerate((0.50, 0.585, 0.67, 0.755)):
        tras.append(arco_faixa(Rr - 0.025, Rr, 64, 116, 0.05, y=-0.27, z=h, cor=cor, bisel=0.01))
    tras.append(arco_faixa(Rr - 0.03, Rr, 62, 118, 0.08, y=-0.27, z=0.835, cor=cor, bisel=0.02))
    xe = Rr * math.cos(math.radians(63))
    ye = -0.27 + (Rr - 0.014) * math.sin(math.radians(63))
    for s in (-1, 1):
        tras.append(mb.caixa(0.045, 0.03, 0.48, x=s * xe, y=ye, z=0.43, cor=cor, bisel=0.012))
    gira(tras, "X", -12, (0, ye, 0.43))
    it.add(tras)
    yb = ye + 0.21 * math.tan(math.radians(12))
    for s in (-1, 1):
        x = s * 0.235
        it.add(mb.caixa(0.055, yb + 0.21, 0.025, x=x, y=(yb - 0.21) / 2, z=0.625, cor=cor, bisel=0.01))
        it.add(barra((s * 0.215, -0.17, 0.43), (x, -0.185, 0.63), 0.016, cor))
    col_auto(it, 0.44, 0.12)


def cadeira_dobravel(it, cor="amarelo", metal="cromo", fechada=False):
    r = 0.012
    if not fechada:
        yb = lambda z: 0.26 - 0.19 * z  # noqa: E731  (quadro de trás)
        yf = lambda z: -0.22 + 0.955 * z  # noqa: E731  (pés da frente)
        it.add(mb.tubo([(-0.20, yb(0.003), 0.003), (-0.20, yb(0.84), 0.84), (0.20, yb(0.84), 0.84),
                        (0.20, yb(0.003), 0.003)], r,
                       cor=metal, raio_curva=0.05))
        for s in (-1, 1):
            it.add(barra((s * 0.181, yf(0.009), 0.009), (s * 0.181, yf(0.445), 0.445), r, metal))
            zc = 0.42
            it.add(mb.cilindro(0.009, 0.05, x=s * 0.19, y=yb(zc), z=zc, cor="metal_escuro", eixo="x", seg=10,
                               bisel=0.002))
            for p in ((s * 0.20, yb(0), 0.0), (s * 0.181, yf(0), 0.0)):
                it.add(mb.cilindro(0.016, 0.02, x=p[0], y=p[1], cor="borracha", seg=12, bisel=0.004))
        it.add(barra((-0.181, yf(0.09), 0.09), (0.181, yf(0.09), 0.09), r * 0.9, metal))
        it.add(barra((-0.20, yb(0.12), 0.12), (0.20, yb(0.12), 0.12), r * 0.9, metal))
        it.add(mb.caixa(0.37, 0.37, 0.012, y=-0.02, z=0.415, cor=metal, bisel=0.005))
        it.add(SE(0.39, 0.38, 0.05, y=-0.02, z=0.42, cor=cor, e=0.25, ev=0.45))
        it.add(encosto(0.46, 0.26, 0.055, y=yb(0.62), z=0.615, cor=cor, incl=10.8, e=0.3, estufa=0.15))
        col_auto(it, 0.47, 0.12)
    else:
        it.add(mb.tubo([(-0.20, 0.03, 0.0), (-0.20, 0.0, 0.84), (0.20, 0.0, 0.84), (0.20, 0.03, 0.0)], r,
                       cor=metal, raio_curva=0.05))
        for s in (-1, 1):
            it.add(barra((s * 0.181, -0.03, 0.0), (s * 0.181, -0.012, 0.62), r, metal))
            it.add(mb.cilindro(0.009, 0.05, x=s * 0.19, y=-0.006, z=0.56, cor="metal_escuro", eixo="x", seg=10,
                               bisel=0.002))
            for p in ((s * 0.20, 0.03), (s * 0.181, -0.03)):
                it.add(mb.cilindro(0.016, 0.02, x=p[0], y=p[1], cor="borracha", seg=12, bisel=0.004))
        it.add(barra((-0.181, -0.027, 0.09), (0.181, -0.027, 0.09), r * 0.9, metal))
        it.add(barra((-0.20, 0.026, 0.12), (0.20, 0.026, 0.12), r * 0.9, metal))
        it.add(mb.caixa(0.37, 0.012, 0.37, y=-0.03, z=0.20, cor=metal, bisel=0.005))
        it.add(SE(0.39, 0.05, 0.38, y=-0.06, z=0.195, cor=cor, e=0.25, ev=0.3))
        it.add(encosto(0.46, 0.26, 0.055, y=0.0, z=0.615, cor=cor, incl=0, e=0.3, estufa=0.15))
        col_auto(it, 0.88, 0)


def cadeira_dobravel_madeira(it, cor="terracota_clara", fechada=False):
    w = 0.03
    if not fechada:
        ang = math.degrees(math.atan2(0.32, 0.86))
        lado = []
        for s in (-1, 1):
            lado.append(mb.caixa(w, 0.04, 0.92, x=s * 0.215, y=0.02, cor=cor, bisel=0.01))
        for k in range(7):
            lado.append(mb.caixa(0.43, 0.018, 0.058, y=0.0 - 0.012, z=0.42 + 0.068 * k, cor=cor, bisel=0.008))
        lado.append(mb.caixa(0.40, 0.03, 0.04, y=0.02, z=0.07, cor=cor, bisel=0.01))
        gira(lado, "X", -ang, (0, 0.02, 0))
        it.add(lado)
        ypv = 0.02 + 0.40 * math.tan(math.radians(ang))
        for s in (-1, 1):
            x = s * 0.185
            it.add(mb.caixa(w, 0.42 - 0.24 + ypv + 0.03, 0.045, x=x, y=(ypv - 0.24) / 2, z=0.375, cor=cor,
                            bisel=0.01))
            f = mb.caixa(w, 0.04, 0.40, x=x, y=-0.24, cor=cor, bisel=0.01)
            gira(f, "X", 5, (x, -0.24, 0.40))
            it.add(f)
            it.add(mb.cilindro(0.012, 0.075, x=s * 0.20, y=ypv, z=0.40, cor="madeira_escura", eixo="x", seg=10,
                               bisel=0.002))
        for k in range(5):
            it.add(mb.caixa(0.36, 0.062, 0.02, y=-0.20 + 0.074 * k, z=0.418, cor=cor, bisel=0.007))
        it.add(mb.caixa(0.34, 0.025, 0.035, y=-0.235, z=0.10, cor=cor, bisel=0.008))
        col_auto(it, 0.44, 0.14)
    else:
        for s in (-1, 1):
            it.add(mb.caixa(w, 0.04, 0.90, x=s * 0.215, y=0.02, cor=cor, bisel=0.01))
            it.add(mb.caixa(w, 0.04, 0.84, x=s * 0.185, y=-0.025, cor=cor, bisel=0.01))
            it.add(mb.cilindro(0.012, 0.075, x=s * 0.20, y=0.0, z=0.42, cor="madeira_escura", eixo="x", seg=10,
                               bisel=0.002))
        for k in range(7):
            it.add(mb.caixa(0.43, 0.018, 0.058, y=-0.008, z=0.44 + 0.065 * k, cor=cor, bisel=0.008))
        for k in range(5):
            it.add(mb.caixa(0.36, 0.02, 0.062, y=-0.054, z=0.08 + 0.068 * k, cor=cor, bisel=0.007))
        it.add(mb.caixa(0.40, 0.03, 0.04, y=0.04, z=0.07, cor=cor, bisel=0.01))
        col_auto(it, 0.9, 0)


def banqueta_carretel(it, cor="vermelho"):
    it.add(mb.torno([(0, 0), (0.165, 0), (0.172, 0.008), (0.17, 0.03), (0.15, 0.07), (0.075, 0.19), (0.065, 0.225),
                     (0.075, 0.26), (0.15, 0.38), (0.17, 0.42), (0.172, 0.442), (0.165, 0.45), (0.1, 0.455),
                     (0, 0.456)], cor=cor, seg=40))
    col_auto(it, 0.456, 0)


def banquinho_tres_pes(it, cor="laranja_claro"):
    it.add(mb.cilindro(0.155, 0.045, z=0.26, cor=cor, seg=32, bisel=0.018))
    it.add(pes_radiais(3, 0.085, 0.27, cor, r=0.026, abre=13, ang0=90))
    col_auto(it, 0.305, 0)


def banquinho_cubo(it, cor="azul"):
    it.add(SE(0.34, 0.34, 0.10, z=0.26, cor=cor, e=0.12, ev=0.3))
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.add(SE(0.105, 0.105, 0.30, x=sx * 0.115, y=sy * 0.115, z=0.0, cor=cor, e=0.25, ev=0.15))
    col_auto(it, 0.36, 0)


def banquinho_cogumelo(it, cor="amarelo"):
    it.add(SE(0.27, 0.27, 0.085, z=0.14, cor=cor, e=0.9, ev=0.45, nu=32, nv=12))
    it.add(pes_radiais(4, 0.07, 0.17, cor, abre=12, ang0=45,
                       fab=lambda: SE(0.07, 0.07, 0.17, cor=cor, e=0.9, ev=0.6, nu=16, nv=10)))
    col_auto(it, 0.225, 0)


def banquinho_degrau_plastico(it, cor="rosa", cor2="rosa_escuro"):
    it.add(SE(0.40, 0.31, 0.08, z=0.15, cor=cor, e=0.18, ev=0.35))
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.add(SE(0.13, 0.11, 0.20, x=sx * 0.14, y=sy * 0.10, z=0.0, cor=cor, e=0.35, ev=0.2))
    it.add(SE(0.30, 0.20, 0.06, z=0.12, cor=cor, e=0.4, ev=0.3))
    it.add(mb.cilindro(0.028, 0.004, z=0.2285, cor=cor2, seg=20, bisel=0.001))
    col_auto(it, 0.23, 0)


def banqueta_degrau(it, cor="roxo"):
    it.add(mb.quatro_pes("bloco", 0.40, 0.40, 0.41, cor, r=0.022, recuo=0.04, abre=7))
    it.add(mb.caixa(0.42, 0.42, 0.05, z=0.40, cor=cor, bisel=0.016))
    em = lambda z: 0.16 - (z + 0.02) * math.tan(math.radians(7))  # noqa: E731  (meio do pé na altura z)
    for sx in (-1, 1):
        it.add(mb.caixa(0.03, 2 * em(0.19) + 0.02, 0.04, x=sx * em(0.19), z=0.17, cor=cor, bisel=0.01))
    for sy in (-1, 1):
        it.add(mb.caixa(2 * em(0.26) + 0.02, 0.03, 0.04, y=sy * em(0.26), z=0.24, cor=cor, bisel=0.01))
    it.add(mb.caixa(2 * em(0.37), 2 * em(0.37), 0.035, z=0.355, cor=cor, bisel=0.012))
    col_auto(it, 0.45, 0)


def cadeirinha_infantil(it, cor="verde"):
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.add(mb.pe("reto", 0.27, x=sx * 0.12, y=sy * 0.11, cor=cor, r=0.03))
    it.add(SE(0.33, 0.31, 0.055, z=0.25, cor=cor, e=0.2, ev=0.4))
    for s in (-1, 1):
        p = mb.cilindro(0.022, 0.24, x=s * 0.065, y=0.12, z=0.28, cor=cor, seg=14, bisel=0.005)
        gira(p, "X", -5, (0, 0.12, 0.28))
        it.add(p)
    t = SE(0.28, 0.05, 0.11, y=0.12, z=0.47, cor=cor, e=0.35, ev=0.45)
    gira(t, "X", -5, (0, 0.12, 0.28))
    it.add(t)
    col_auto(it, 0.305, 0.08)


def poltrona_infantil_balanco(it, cor="azul_celeste", cor2="laranja"):
    Lr, Rr = 0.62, 0.8
    for s in (-1, 1):
        x = s * 0.21
        it.add(balanco(x, Lr, Rr, 0.045, 0.04, cor=cor2))
        pts = []
        for k in range(17):
            t = math.radians(180 * k / 16)
            pts.append((x, -0.24 * math.cos(t), 0.05 + 0.33 * math.sin(t)))
        it.add(mb.tubo(pts, 0.022, cor=cor2, raio_curva=0.03))
    it.add(mb.caixa(0.44, 0.34, 0.03, z=0.06, cor=cor2, bisel=0.01))
    it.add(SE(0.38, 0.38, 0.13, z=0.085, cor=cor, e=0.3, ev=0.45))
    b = SE(0.38, 0.13, 0.36, y=0.15, z=0.14, cor=cor, e=0.45, ev=0.5)
    gira(b, "X", -8, (0, 0.15, 0.14))
    it.add(b)
    col_auto(it, 0.215, 0.14)


def cadeira_ajoelhar(it, cor="cinza_claro", tubo_cor="azul"):
    for s in (-1, 1):
        x = s * 0.20
        it.add(barra((x, -0.30, 0.025), (x, 0.30, 0.025), 0.025, tubo_cor, seg=14))
        for yy in (-0.30, 0.30):
            it.add(mb.esfera(0.025, x=x, y=yy, z=0.025, cor=tubo_cor, seg=14))
    it.add(barra((-0.20, 0.02, 0.03), (0.20, 0.02, 0.03), 0.022, tubo_cor))
    it.add(mb.tubo([(0, 0.02, 0.03), (0, 0.06, 0.26), (0, 0.12, 0.50)], 0.026, cor=tubo_cor, raio_curva=0.1))
    it.add(mb.tubo([(0, 0.05, 0.22), (0, -0.10, 0.27), (0, -0.21, 0.30)], 0.022, cor=tubo_cor, raio_curva=0.06))
    it.add(mb.cilindro(0.036, 0.07, x=0, y=0.05, z=0.22, cor=tubo_cor, eixo="x", seg=16))
    s_ = [mb.caixa(0.18, 0.16, 0.025, y=0.12, z=0.505, cor=tubo_cor, bisel=0.008),
          SE(0.44, 0.34, 0.08, y=0.12, z=0.525, cor=cor, e=0.25, ev=0.45)]
    gira(s_, "X", 18, (0, 0.12, 0.52))
    it.add(s_)
    k_ = [mb.caixa(0.16, 0.12, 0.025, y=-0.22, z=0.295, cor=tubo_cor, bisel=0.008),
          SE(0.44, 0.20, 0.075, y=-0.22, z=0.315, cor=cor, e=0.25, ev=0.45)]
    gira(k_, "X", -22, (0, -0.22, 0.31))
    it.add(k_)
    col_auto(it, 0.62, 0)


# =====================================================================================================================
# Pacote gratuito
# =====================================================================================================================
def do_pacote(nome, h_assento, prof_encosto):
    def f(it):
        pc = mb.importa_pacote(nome)
        objs = list(pc.values())
        lo, hi = mb.bbox(objs)
        c = (lo + hi) / 2
        for o in objs:
            o.data.transform(Matrix.Translation((-c.x, -c.y, -lo.z)))
        it.add(objs)
        col_auto(it, h_assento, prof_encosto)
    return f


# =====================================================================================================================
# Lista de peças: (id, função, kwargs, rótulo, grupo, tags, pacote)
# =====================================================================================================================
P = []


def peca(id_, fn, rotulo, grupo, tags=(), pacote=False, **kw):
    P.append((id_, fn, kw, rotulo, grupo, list(tags), pacote))


T_POL = ["poltrona", "estofado", "sala"]
peca("poltrona_quadrada_azul_pacote", do_pacote("Armchair_02", 0.42, 0.2), "Poltrona quadrada (azul)",
     "poltrona_quadrada_pacote", T_POL, pacote=True)
peca("poltrona_alta_vermelha_pacote", do_pacote("Armchair_18", 0.45, 0.2), "Poltrona alta (vermelha e laranja)",
     "poltrona_alta_pacote", T_POL, pacote=True)
peca("poltrona_base_madeira_verde", poltrona_base_madeira, "Poltrona com base de madeira (verde)",
     "poltrona_base_madeira", T_POL)
peca("poltrona_base_madeira_mostarda", poltrona_base_madeira, "Poltrona com base de madeira (mostarda)",
     "poltrona_base_madeira", T_POL, cor="mostarda", cor2="amarelo", mad="madeira_clara", pe_cor="madeira_media")
peca("poltrona_concha_rosa", poltrona_concha, "Poltrona concha (rosa)", "poltrona_concha", T_POL + ["pés palito"])
peca("poltrona_barril_azul", poltrona_barril, "Poltrona barril (azul)", "poltrona_barril", T_POL + ["pés palito"])
peca("poltrona_barril_verde_agua", poltrona_barril, "Poltrona barril (verde-água)", "poltrona_barril",
     T_POL + ["pés palito"], cor="verde_agua", cor2="turquesa", pe_cor="madeira_media")
peca("poltrona_alca_amarela", poltrona_alca, "Poltrona com braços em alça (amarela)", "poltrona_alca", T_POL)
peca("poltrona_larga_roxa", poltrona_larga, "Poltrona larga (roxa)", "poltrona_larga", T_POL)
peca("poltrona_palito_madeira_cinza", poltrona_palito_madeira, "Poltrona de madeira com almofadas (cinza)",
     "poltrona_palito_madeira", T_POL + ["madeira"])
peca("poltrona_ferradura_verde", poltrona_ferradura, "Poltrona ferradura (verde e turquesa)", "poltrona_ferradura",
     T_POL + ["pés palito"])
peca("poltrona_clube_terracota", poltrona_clube, "Poltrona clube (terracota)", "poltrona_clube", T_POL + ["couro"])
peca("poltrona_casulo_laranja", poltrona_casulo, "Poltrona casulo (laranja)", "poltrona_casulo", T_POL)
peca("poltrona_casulo_rosa", poltrona_casulo, "Poltrona casulo (rosa)", "poltrona_casulo", T_POL, cor="rosa",
     cor2="rosa_bebe")
peca("poltrona_sem_bracos_lima", poltrona_sem_bracos, "Poltrona sem braços (verde-lima)", "poltrona_sem_bracos",
     T_POL + ["madeira"])
peca("poltrona_caixa_violeta", poltrona_caixa, "Poltrona caixa (violeta)", "poltrona_caixa", T_POL)
peca("poltrona_orelha_turquesa", poltrona_orelha, "Poltrona de orelhas (turquesa e vermelha)", "poltrona_orelha",
     T_POL)
peca("poltrona_bracos_acolchoados_cinza", poltrona_bracos_acolchoados, "Poltrona com braços acolchoados (cinza)",
     "poltrona_bracos_acolchoados", T_POL + ["madeira"])
peca("poltrona_grande_pessego", poltrona_grande, "Poltrona grande (pêssego)", "poltrona_grande", T_POL)
peca("poltrona_capitone_couro", poltrona_capitone, "Poltrona capitonê (couro)", "poltrona_capitone",
     T_POL + ["couro"])
peca("cadeira_torneada_verde", cadeira_torneada, "Cadeira estofada com pés torneados (verde)", "cadeira_torneada",
     ["cadeira", "estofado", "madeira", "pés torneados"])
peca("cadeira_balanco_estofada_verde", cadeira_balanco_estofada, "Cadeira de balanço estofada (verde)",
     "cadeira_balanco_estofada", ["cadeira", "balanço", "estofado", "madeira"])
peca("cadeira_balanco_madeira", cadeira_balanco_madeira, "Cadeira de balanço de madeira", "cadeira_balanco_madeira",
     ["cadeira", "balanço", "madeira", "varanda"])
T_ESC = ["cadeira", "escritório", "rodízios", "giratória"]
peca("cadeira_escritorio_rosa_pacote", do_pacote("Chair_PC_04", 0.5, 0.15), "Cadeira de escritório (rosa)",
     "cadeira_escritorio_pacote", T_ESC, pacote=True)
peca("cadeira_escritorio_executiva_azul", cadeira_escritorio_executiva, "Cadeira de escritório executiva (azul)",
     "cadeira_escritorio_executiva", T_ESC)
peca("cadeira_gamer_laranja", cadeira_gamer, "Cadeira gamer (laranja)", "cadeira_gamer", T_ESC + ["gamer"])
peca("cadeira_presidente_preta", cadeira_presidente, "Cadeira presidente (couro preto)", "cadeira_presidente",
     T_ESC + ["couro"])
peca("cadeira_escritorio_simples_turquesa", cadeira_escritorio_simples, "Cadeira de escritório simples (turquesa)",
     "cadeira_escritorio_simples", T_ESC)
peca("cadeira_escritorio_simples_lima", cadeira_escritorio_simples, "Cadeira de escritório simples (verde-lima)",
     "cadeira_escritorio_simples", T_ESC, cor="verde_lima", base="grafite", cor_roda="cinza_claro", metal="metal")
T_BAN = ["banqueta", "cozinha"]
peca("banqueta_madeira_aro_pacote", do_pacote("Chair_17", 0.6, 0), "Banqueta de madeira com aro",
     "banqueta_madeira_aro_pacote", T_BAN + ["madeira"], pacote=True)
peca("banqueta_bar_giratoria_vermelha", banqueta_bar_giratoria, "Banqueta de bar giratória (vermelha)",
     "banqueta_bar_giratoria", T_BAN + ["bar", "giratória"])
peca("banqueta_bar_encosto_rosa", banqueta_bar_encosto, "Banqueta de bar com encosto (rosa)", "banqueta_bar_encosto",
     T_BAN + ["bar", "encosto"])
peca("banqueta_bar_quadrada_verde", banqueta_bar_quadrada, "Banqueta de bar quadrada (verde)",
     "banqueta_bar_quadrada", T_BAN + ["bar", "metal"])
peca("banqueta_industrial_madeira", banqueta_industrial, "Banqueta industrial de rosca", "banqueta_industrial",
     T_BAN + ["metal", "madeira"])
peca("banqueta_cozinha_encosto_madeira", banqueta_cozinha_encosto, "Banqueta de cozinha com encosto",
     "banqueta_cozinha_encosto", T_BAN + ["madeira", "encosto"])
peca("cadeira_alta_bebe", cadeira_alta_bebe, "Cadeira alta de bebê com bandeja", "cadeira_alta_bebe",
     ["cadeira", "bebê", "infantil", "cozinha", "bandeja"])
peca("cadeira_cozinha_madeira", cadeira_cozinha_madeira, "Cadeira de cozinha de madeira (palitos)",
     "cadeira_cozinha_madeira", ["cadeira", "cozinha", "madeira", "pés torneados"])
peca("cadeira_cozinha_ripas_menta", cadeira_cozinha_ripas, "Cadeira de cozinha de ripas (menta)",
     "cadeira_cozinha_ripas", ["cadeira", "cozinha", "madeira"])
peca("cadeira_jantar_estofada_cinza", cadeira_jantar_estofada, "Cadeira de jantar estofada (cinza)",
     "cadeira_jantar_estofada", ["cadeira", "jantar", "estofado"])
peca("cadeira_jantar_alta_amarela", cadeira_jantar_alta, "Cadeira de jantar de encosto alto (amarela)",
     "cadeira_jantar_alta", ["cadeira", "jantar", "estofado"])
peca("cadeira_cafe_tubo_azul", cadeira_cafe_tubo, "Cadeira de tubo com braços (azul e verde)", "cadeira_cafe_tubo",
     ["cadeira", "jantar", "metal"])
peca("cadeira_bistro_laranja", cadeira_bistro, "Cadeira bistrô de assento redondo (laranja)", "cadeira_bistro",
     ["cadeira", "cozinha", "madeira"])
peca("banqueta_estofada_verde", banqueta_estofada, "Banqueta estofada (verde)", "banqueta_estofada",
     ["banqueta", "estofado", "quarto"])
T_JAR = ["cadeira", "jardim", "plástico", "varanda"]
peca("cadeira_jardim_plastico_branca", cadeira_jardim_plastico, "Cadeira de plástico de jardim (branca)",
     "cadeira_jardim_plastico", T_JAR)
peca("cadeira_jardim_plastico_verde", cadeira_jardim_plastico, "Cadeira de plástico de jardim (verde)",
     "cadeira_jardim_plastico", T_JAR, cor="verde")
T_DOB = ["cadeira", "dobrável"]
peca("cadeira_dobravel_amarela", cadeira_dobravel, "Cadeira dobrável (amarela)", "cadeira_dobravel", T_DOB)
peca("cadeira_dobravel_azul", cadeira_dobravel, "Cadeira dobrável (azul)", "cadeira_dobravel", T_DOB, cor="azul")
peca("cadeira_dobravel_fechada_amarela", cadeira_dobravel, "Cadeira dobrável fechada (amarela)",
     "cadeira_dobravel_fechada", T_DOB + ["fechada"], fechada=True)
peca("cadeira_dobravel_madeira", cadeira_dobravel_madeira, "Cadeira dobrável de ripas", "cadeira_dobravel_madeira",
     T_DOB + ["madeira", "jardim"])
peca("cadeira_dobravel_madeira_fechada", cadeira_dobravel_madeira, "Cadeira dobrável de ripas (fechada)",
     "cadeira_dobravel_madeira_fechada", T_DOB + ["madeira", "jardim", "fechada"], fechada=True)
peca("banqueta_carretel_vermelha", banqueta_carretel, "Banqueta carretel (vermelha)", "banqueta_carretel",
     ["banqueta", "plástico"])
T_INF = ["infantil", "banquinho"]
peca("banquinho_tres_pes_laranja", banquinho_tres_pes, "Banquinho de três pés", "banquinho_tres_pes",
     ["banquinho", "madeira"])
peca("banquinho_cubo_azul", banquinho_cubo, "Banquinho infantil quadrado (azul)", "banquinho_cubo", T_INF)
peca("banquinho_cogumelo_amarelo", banquinho_cogumelo, "Banquinho cogumelo (amarelo)", "banquinho_cogumelo", T_INF)
peca("banquinho_degrau_rosa", banquinho_degrau_plastico, "Banquinho degrau de plástico (rosa)", "banquinho_degrau",
     T_INF + ["banheiro"])
peca("banqueta_degrau_roxa", banqueta_degrau, "Banqueta degrau (roxa)", "banqueta_degrau", ["banqueta", "cozinha"])
peca("cadeirinha_infantil_verde", cadeirinha_infantil, "Cadeirinha infantil (verde)", "cadeirinha_infantil",
     ["cadeira", "infantil"])
peca("poltrona_infantil_balanco_azul", poltrona_infantil_balanco, "Poltroninha infantil de balanço (azul)",
     "poltrona_infantil_balanco", ["poltrona", "infantil", "balanço"])
peca("cadeira_ajoelhar_azul", cadeira_ajoelhar, "Cadeira ergonômica de ajoelhar", "cadeira_ajoelhar",
     ["cadeira", "escritório", "ergonômica"])


def centraliza(it):
    """Põe a origem no meio da peça (em X e Y), levando junto as caixas de colisão."""
    lo, hi = mb.bbox(it.partes)
    d = V((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, 0))
    if d.length < 1e-4:
        return
    move(it.partes, d)
    if it.colisores:
        it.colisores = [((round(c[0] + d.x, 4), round(c[1] + d.y, 4), c[2]), t) for c, t in it.colisores]


def quer(id_):
    if not FILTRO:
        return True
    return any(id_ == f or (f.endswith("*") and id_.startswith(f[:-1])) for f in FILTRO)


def main():
    cat = mb.Catalogo("cadeiras", SAIDA, "Cadeiras, poltronas e banquetas")
    ids = [p[0] for p in P]
    assert len(ids) == len(set(ids)), "ids repetidos"
    # tira do catálogo o que não existe mais na lista
    cat.dados["itens"] = [x for x in cat.dados["itens"] if x["id"] in ids]
    for id_, fn, kw, rotulo, grupo, tags, pacote in P:
        if not quer(id_):
            continue
        mb.limpa()
        it = mb.Item(id_)
        fn(it, **kw)
        centraliza(it)
        cat.exporta(it, rotulo, grupo=grupo, tags=tags, pacote=pacote)
    ordem = {k: i for i, k in enumerate(ids)}
    cat.dados["itens"].sort(key=lambda x: ordem.get(x["id"], 999))
    cat.salva()
    print("total", len(cat.dados["itens"]), "pecas", len(P))


main()
