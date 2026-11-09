"""Peças grandes de praia (categoria props_praia): posto de salva-vidas, quiosques (coco de palha, sucos com coco
gigante, estação de surfe, açaí com abacaxi gigante), carrinho de picolé, barraca com mesa e cadeiras, tenda de lona
em estrela e o castelo de areia gigante. Frente para −Y, chão (areia) em z = 0."""
import math
import random

from mathutils import Matrix

import moveis_base as mb
import props_praia_base as bb
import props_praia_pecas as pp
import props_praia_pisos as pz
from props_praia_base import V, Malha, bloco, haste, bola, estampa, mover, roda, gira_z, toro, setores


# =====================================================================================================================
# Posto de salva-vidas
# =====================================================================================================================
def posto(it, corpo="azul_celeste", corpo2="turquesa", teto=("salmao", "branco"), trim="branco", degrau="salmao",
          bandeira=("vermelho", "amarelo")):
    """Posto elevado: estrado a 2,2 m sobre pilotis com mãos-francesas, cabine com janelas e porta (abre), varanda
    com guarda-corpo, escada com corrimão descendo para a frente, boias penduradas, letreiro SALVA-VIDAS (acende à
    noite), holofote no teto e a bandeira no mastro (balança)."""
    Lx, Ly, zd = 3.8, 3.6, 2.2
    ps = []
    # pilotis e travamentos
    for x in (-Lx / 2 + 0.2, 0.0, Lx / 2 - 0.2):
        for y in (-Ly / 2 + 0.2, Ly / 2 - 0.2):
            ps.append(bloco(0.2, 0.2, zd - 0.17, x=x, y=y, z=0.0, cor=corpo2, bisel=0.03))
            ps.append(pp.monte_areia(0.22, 0.06, x=x, y=y))
    for y in (-Ly / 2 + 0.2, Ly / 2 - 0.2):
        for xa, xb in ((-Lx / 2 + 0.2, 0.0), (0.0, Lx / 2 - 0.2)):
            ps.append(haste((xa, y, 0.35), (xb, y, zd - 0.3), 0.045, corpo2, 6))
            ps.append(haste((xb, y, 0.35), (xa, y, zd - 0.3), 0.045, corpo2, 6))
    for x in (-Lx / 2 + 0.2, Lx / 2 - 0.2):
        ps.append(haste((x, -Ly / 2 + 0.2, 0.35), (x, Ly / 2 - 0.2, zd - 0.3), 0.045, corpo2, 6))
    # estrado (vigas + tábuas)
    ps.append(bloco(Lx, Ly, 0.18, z=zd - 0.18, cor=corpo2, bisel=0.03))
    for k in range(14):
        ps.append(bloco(Lx - 0.06, Ly / 14 - 0.02, 0.035, y=-Ly / 2 + (k + 0.5) * Ly / 14, z=zd - 0.01,
                        cor="madeira_clara" if k % 2 else "madeira_mel", bisel=0.008))
    zp = zd + 0.025
    # cabine
    cx0, cx1, cy0, cy1 = -1.2, 1.2, -0.25, Ly / 2 - 0.1
    hc = 2.1
    for (x0, y0, x1, y1) in ((cx0, cy1 - 0.1, cx1, cy1), (cx0, cy0, cx0 + 0.1, cy1), (cx1 - 0.1, cy0, cx1, cy1)):
        ps.append(bloco(x1 - x0, y1 - y0, hc, x=(x0 + x1) / 2, y=(y0 + y1) / 2, z=zp, cor=corpo, bisel=0.02))
    # parede da frente com vão de janela (esquerda) e de porta (direita)
    yf = cy0 + 0.05
    ps.append(bloco(cx1 - cx0, 0.1, 0.9, y=yf, z=zp, cor=corpo, bisel=0.02))  # peitoril até 0,9
    ps.append(bloco(cx1 - cx0, 0.1, 0.32, y=yf, z=zp + hc - 0.32, cor=corpo, bisel=0.02))  # verga
    ps.append(bloco(0.18, 0.1, hc, x=cx0 + 0.09, y=yf, z=zp, cor=corpo, bisel=0.02))
    ps.append(bloco(0.2, 0.1, hc, x=0.18, y=yf, z=zp, cor=corpo, bisel=0.02))
    ps.append(bloco(0.12, 0.1, hc, x=cx1 - 0.06, y=yf, z=zp, cor=corpo, bisel=0.02))
    # vão da porta (x de 0,28 a 1,08) sem peitoril: recorta o peitoril com a soleira
    ps.append(bloco(0.8, 0.12, 0.02, x=0.68, y=yf, z=zp, cor=trim, bisel=0.005))
    # janelas de vidro com moldura (frente esquerda e laterais)
    ps.append(bloco(1.3, 0.04, 0.88, x=-0.55, y=yf, z=zp + 0.9, cor=None, mat="vidro"))
    for xx in (-0.55 - 0.66, -0.55 + 0.66, -0.55):
        ps.append(bloco(0.06, 0.14, 0.88, x=xx, y=yf, z=zp + 0.9, cor=trim, bisel=0.01))
    ps.append(bloco(1.42, 0.16, 0.06, x=-0.55, y=yf - 0.01, z=zp + 0.86, cor=trim, bisel=0.012))
    for sx in (-1, 1):
        x = sx * (cx1 - 0.05)
        ps.append(bloco(0.04, 1.2, 0.8, x=x, y=0.95, z=zp + 0.95, cor=None, mat="vidro"))
        ps.append(bloco(0.14, 1.32, 0.06, x=x, y=0.95, z=zp + 0.9, cor=trim, bisel=0.01))
        ps.append(bloco(0.14, 1.32, 0.06, x=x, y=0.95, z=zp + 1.75, cor=trim, bisel=0.01))
    ps.append(bloco(cx1 - cx0 + 0.04, cy1 - cy0, 0.03, x=0, y=(cy0 + cy1) / 2, z=zp - 0.005, cor="madeira_clara"))
    # telhado listrado com beiral
    tx, ty = 3.0, 2.75
    zt = zp + hc
    ps.append(bloco(tx, ty, 0.12, y=(cy0 + cy1) / 2 - 0.15, z=zt, cor=trim, bisel=0.04))
    n = 9
    for k in range(n):
        ps.append(bloco(tx / n - 0.01, ty - 0.08, 0.05, x=-tx / 2 + (k + 0.5) * tx / n, y=(cy0 + cy1) / 2 - 0.15,
                        z=zt + 0.12, cor=teto[k % 2], bisel=0.015))
    # letreiro SALVA-VIDAS na testeira (acende à noite)
    yt = (cy0 + cy1) / 2 - 0.15 - ty / 2  # frente do telhado
    ps.append(bb.placa_estampa(estampa("salva_vidas", 1.0), 2.3, 0.43, 0, yt - 0.075, zt - 0.06,
                               normal=(0, -1, 0)))
    ps.append(bloco(2.45, 0.08, 0.5, y=yt - 0.03, z=zt - 0.3, cor=trim, bisel=0.015))
    # holofote
    ps.append(mb.cilindro(0.1, 0.16, x=1.2, y=cy0 - 0.1, z=zt + 0.17, cor="grafite", seg=10, bisel=0.01))
    ps.append(mb.cilindro(0.085, 0.02, x=1.2, y=cy0 - 0.16, z=zt + 0.25, eixo="y", cor=None, mat="luz", seg=10))
    # guarda-corpo da varanda (deixa a abertura da escada na frente, à esquerda)
    xe0, xe1 = -1.75, -0.75
    g = 0.08
    ps.append(bb.corrimao([(xe1, -Ly / 2 + g, zp), (Lx / 2 - g, -Ly / 2 + g, zp), (Lx / 2 - g, Ly / 2 - g, zp),
                           (cx1 + 0.05, Ly / 2 - g, zp)], alt=1.0, cor=trim, r=0.035, passo=0.9))
    ps.append(bb.corrimao([(xe0, -Ly / 2 + g, zp), (-Lx / 2 + g, -Ly / 2 + g, zp), (-Lx / 2 + g, Ly / 2 - g, zp),
                           (cx0 - 0.05, Ly / 2 - g, zp)], alt=1.0, cor=trim, r=0.035, passo=0.9))
    # escada para a frente
    run = 2.7
    ns = 11
    y_top = -Ly / 2
    for sx in (xe0, xe1):
        ps.append(haste((sx, y_top - run - 0.05, 0.06), (sx, y_top + 0.02, zd - 0.05), 0.06, corpo2, 4))
    for k in range(ns):
        t = (k + 0.5) / ns
        ps.append(bloco(xe1 - xe0 - 0.08, run / ns + 0.04, 0.05, x=(xe0 + xe1) / 2, y=y_top - run * (1 - t),
                        z=zd * t - 0.06, cor=degrau if k % 2 else "madeira_clara", bisel=0.01))
    for sx in (xe0, xe1):
        ps.append(mb.tubo([(sx, y_top - run, 0.95), (sx, y_top - 0.05, zd + 1.0), (sx, y_top + 0.1, zd + 1.0)],
                          0.035, cor=trim, seg=6))
        for t in (0.0, 0.33, 0.66):
            ps.append(haste((sx, y_top - run * (1 - t), zd * t), (sx, y_top - run * (1 - t), zd * t + 0.97), 0.03,
                            trim, 6))
    # boias penduradas no guarda-corpo (lado +X e frente)
    for y in (-0.9, 0.2, 1.3):
        b = bb.boia_salva_vidas()
        gira_z(b, 90)
        mover(b, Lx / 2 + 0.03, y, zp + 0.62)
        ps.append(b)
    b = bb.boia_salva_vidas()
    mover(b, 1.2, -Ly / 2 - 0.03, zp + 0.62)
    ps.append(b)
    # cadeira do salva-vidas na varanda
    cad = [bloco(0.5, 0.45, 0.05, z=0.62, cor="branco", bisel=0.015), bloco(0.5, 0.05, 0.5, y=0.22, z=0.66,
                                                                             cor="branco", bisel=0.015)]
    for sx in (-1, 1):
        for sy in (-1, 1):
            cad.append(haste((sx * 0.22, sy * 0.19, 0), (sx * 0.22, sy * 0.19, 0.62), 0.018, "metal_claro", 6))
    c = mb.junta(cad, "cadeira")
    mover(c, -1.0, -1.1, zp)
    ps.append(c)
    it.assento("assento_1", -1.0, -1.1, zp + 0.67)
    # mastro e bandeira
    xm, ym = Lx / 2 - 0.12, Ly / 2 - 0.12
    ps.append(mb.cilindro(0.035, 3.7, x=xm, y=ym, z=zp, cor=trim, seg=10, bisel=0.006))
    ps.append(bola(0.06, xm, ym, zp + 3.72, cor="amarelo"))
    it.add(mb.junta(ps, "posto"))
    band = bb.bandeira_ondulada(0.9, 0.6, xm, ym, zp + 3.6, bandeira[0], cor2=bandeira[1], n=10, amp=0.07, listra="h")
    it.anima([band], {"anima": "balancar", "eixo": "y", "angulo": 16, "periodo": 2.6}, "bandeira",
             pivo=(xm, ym, zp + 3.3))
    # porta da cabine (dobradiça à direita, abre para fora)
    porta = [bloco(0.78, 0.05, 1.92, x=0.68, y=yf - 0.05, z=zp + 0.02, cor=trim, bisel=0.015),
             bloco(0.5, 0.02, 0.6, x=0.68, y=yf - 0.085, z=zp + 1.15, cor=None, mat="vidro"),
             mb.cilindro(0.025, 0.05, x=0.38, y=yf - 0.1, z=zp + 1.0, eixo="y", cor="grafite", seg=8)]
    it.porta(porta, (1.07, yf - 0.05, zp), eixo="z", lado="dir", nome="porta")
    it.slot("cabine", (-0.4, 0.95, zp), (1.4, 1.5, 1.9))
    # rampa de colisão da escada
    m = Malha()
    a = [m.v((xe0, y_top - run, 0)), m.v((xe1, y_top - run, 0)), m.v((xe1, y_top, zd)), m.v((xe0, y_top, zd)),
         m.v((xe0, y_top, 0)), m.v((xe1, y_top, 0))]
    for f in ((a[0], a[1], a[2], a[3]), (a[1], a[5], a[2]), (a[0], a[3], a[4]), (a[4], a[3], a[2], a[5]),
              (a[0], a[4], a[5], a[1])):
        m.f(f, "branco")
    rampa = m.obj("rampa_escada")
    it.add(rampa)
    it.colisao_malha(rampa, "colisao_escada")
    col = [((0, 0, zd - 0.2), (Lx, Ly, 0.22)), ((0, (cy0 + cy1) / 2, zp), (cx1 - cx0, cy1 - cy0, hc + 0.2)),
           ((0, -Ly / 2 + 0.05, zp), (Lx, 0.1, 1.0))]
    for x in (-Lx / 2 + 0.2, Lx / 2 - 0.2):
        col.append(((x, 0, 0), (0.24, Ly - 0.2, zd - 0.2)))
    return dict(col=col)


def p_posto_azul(it):
    return posto(it)


def p_posto_amarelo(it):
    return posto(it, corpo="amarelo", corpo2="amarelo_escuro", teto=("vermelho", "branco"), trim="branco",
                 degrau="vermelho_claro", bandeira=("vermelho", "amarelo"))


# =====================================================================================================================
# Quiosque de coco (toldo de palha)
# =====================================================================================================================
def coco(x, y, z, r=0.11, canudo=True, aberto=False, cor_canudo="rosa"):
    ps = [bb.esf(r, x=x, y=y, z=z + r * 0.92, cor="verde", seg=12, esc=(1, 1, 0.92))]
    if aberto or canudo:
        ps.append(mb.cilindro(r * 0.45, 0.01, x=x, y=y, z=z + r * 1.78, cor="creme_claro", seg=10, bisel=0))
    if canudo:
        ps.append(haste((x, y, z + r * 1.6), (x + 0.04, y - 0.02, z + r * 1.6 + 0.18), 0.008, cor_canudo, 5))
    return ps


def banqueta(x, y, z=0.0, cor="madeira_mel", assento="laranja", alt=0.75):
    ps = [mb.cilindro(0.2, 0.07, x=x, y=y, z=z + alt - 0.07, cor=assento, seg=12, bisel=0.015),
          mb.cilindro(0.04, alt - 0.07, x=x, y=y, z=z, cor=cor, seg=8, bisel=0),
          mb.cilindro(0.16, 0.03, x=x, y=y, z=z, cor=cor, seg=12, bisel=0.008),
          toro(0.14, 0.012, x=x, y=y, z=z + 0.28, cor=cor, seg=10, seg_r=4)]
    return ps


def bambu(x, y, z0, z1, r=0.06, cor="madeira_clara", nos=4, cor_no="madeira_mel"):
    ps = [mb.cilindro(r, z1 - z0, x=x, y=y, z=z0, cor=cor, seg=8, bisel=0)]
    for k in range(1, nos):
        ps.append(mb.cilindro(r * 1.12, 0.03, x=x, y=y, z=z0 + (z1 - z0) * k / nos, cor=cor_no, seg=8, bisel=0.005))
    return ps


def p_quiosque_coco(it):
    """Quiosque de coco de praia: quatro postes roliços, telhado de palha em cone, balcão de bambu com pilha de cocos,
    placa COCO GELADO e cardápio, cordão de lâmpadas e três banquetas."""
    ps = []
    W, D = 3.0, 2.4
    zb = 1.05
    for sx in (-1, 1):
        for sy in (-1, 1):
            ps += bambu(sx * (W / 2 - 0.12), sy * (D / 2 - 0.12), 0.0, 2.65, r=0.08, nos=5)
    # balcão em U (frente e laterais) com frente de bambu
    for (l, p, x, y) in ((W - 0.1, 0.5, 0, -D / 2 + 0.3), (0.5, D - 0.6, -W / 2 + 0.3, 0.1),
                         (0.5, D - 0.6, W / 2 - 0.3, 0.1)):
        ps.append(bloco(l, p, zb - 0.06, x=x, y=y, z=0, cor="madeira_media", bisel=0.02))
        ps.append(bloco(l + 0.1, p + 0.1, 0.07, x=x, y=y, z=zb - 0.07, cor="madeira_clara", bisel=0.02))
    for k in range(17):
        x = -W / 2 + 0.12 + k * (W - 0.24) / 16
        ps.append(mb.cilindro(0.055, zb - 0.1, x=x, y=-D / 2 + 0.03, z=0.02, cor="madeira_clara" if k % 2 else "pinus",
                              seg=6, bisel=0))
    # prateleira de trás, liquidificador, copos e cocos
    ps.append(bloco(W - 0.4, 0.35, 0.9, y=D / 2 - 0.3, z=0, cor="madeira_media", bisel=0.02))
    ps.append(bloco(W - 0.3, 0.42, 0.05, y=D / 2 - 0.3, z=0.9, cor="madeira_clara", bisel=0.015))
    ps.append(bb.cx(0.18, 0.18, 0.12, x=0.7, y=D / 2 - 0.3, z=0.95, cor="branco", bisel=0.02))
    ps.append(mb.cilindro(0.08, 0.24, x=0.7, y=D / 2 - 0.3, z=1.07, r2=0.1, cor=None, mat="vidro", seg=10))
    ps.append(mb.cilindro(0.075, 0.12, x=0.7, y=D / 2 - 0.3, z=1.08, r2=0.09, cor="laranja", seg=10))
    for k, cor in enumerate(("laranja", "amarelo", "roxo", "verde_lima")):
        ps.append(mb.cilindro(0.04, 0.13, x=-0.9 + k * 0.14, y=D / 2 - 0.25, z=0.95, r2=0.05, cor=cor, seg=8))
    for (x, y) in ((-0.8, -D / 2 + 0.3), (0.2, -D / 2 + 0.25), (0.9, -D / 2 + 0.35)):
        ps += coco(x, y, zb)
    # pilha de cocos num caixote ao lado
    ps.append(bloco(0.7, 0.55, 0.35, x=W / 2 + 0.55, y=-0.4, z=0, cor="madeira", bisel=0.02))
    rnd = random.Random(2)
    for k in range(9):
        x = W / 2 + 0.55 + (k % 3 - 1) * 0.2 + rnd.uniform(-0.02, 0.02)
        y = -0.4 + ((k // 3) % 3 - 1) * 0.16
        ps.append(bb.esf(0.11, x=x, y=y, z=0.44, cor=("verde", "verde_claro", "verde")[k % 3], seg=10,
                            esc=(1, 1, 0.9)))
    for k in range(3):
        ps.append(bb.esf(0.11, x=W / 2 + 0.45 + k * 0.12, y=-0.4 + (k - 1) * 0.1, z=0.62, cor="verde", seg=10,
                            esc=(1, 1, 0.9)))
    # telhado de palha
    ps.append(bloco(W + 0.05, 0.1, 0.12, y=-D / 2 + 0.12, z=2.6, cor="madeira", bisel=0.02))
    ps.append(bloco(W + 0.05, 0.1, 0.12, y=D / 2 - 0.12, z=2.6, cor="madeira", bisel=0.02))
    ps.append(bb.palha(2.45, 1.5, 2.55, camadas=3, cores=("mostarda", "amarelo_escuro", "caramelo"), lados=22,
                       franja=0.14, esc=(1.0, 0.85)))
    ps.append(mb.cilindro(0.05, 0.4, z=4.0, cor="madeira_escura", seg=8, bisel=0))
    ps.append(bola(0.12, 0, 0, 4.42, cor="verde"))
    # placa COCO GELADO pendurada na frente e cardápio no poste
    ps.append(bb.caixa_estampa(estampa("letreiro_coco", 1.0), 1.8, 0.05, 0.45, 0, -D / 2 - 0.12, 2.12,
                               cor="madeira_escura"))
    for sx in (-0.7, 0.7):
        ps.append(haste((sx, -D / 2 - 0.12, 2.56), (sx, -D / 2 - 0.12, 2.6), 0.01, "bege", 4))
    ps.append(bb.caixa_estampa(estampa("cardapio"), 0.5, 0.04, 0.62, -W / 2 - 0.01, -D / 2 + 0.12, 1.25,
                               cor="madeira", normal=(-1, 0, 0)))
    # cordão de lâmpadas
    luzes = []
    R = 2.3
    pts = []
    for k in range(25):
        a = 2 * math.pi * k / 24
        pts.append((R * math.cos(a), R * 0.85 * math.sin(a), 2.42 - 0.06 * abs(math.sin(6 * a))))
    ps.append(mb.tubo(pts, 0.01, cor="grafite", seg=4, raio_curva=0))
    luzes += bb.lampadas(pts[:-1], r=0.06)
    it.add(mb.junta(ps + luzes, "quiosque"))
    for k, x in enumerate((-0.9, 0.0, 0.9)):
        it.add(banqueta(x, -D / 2 - 0.55))
        it.assento(f"assento_{k + 1}", x, -D / 2 - 0.55, 0.75)
    it.slot("balcao", (0.0, -D / 2 + 0.3, zb), (W - 0.3, 0.45, 0.4))
    return dict(col=[((0, -D / 2 + 0.3, 0), (W, 0.55, zb)), ((-W / 2 + 0.3, 0.1, 0), (0.55, D - 0.6, zb)),
                     ((W / 2 + 0.25, -0.1, 0), (1.15, D - 0.2, zb)), ((0, -D / 2 - 0.55, 0), (2.3, 0.45, 0.75))])


# =====================================================================================================================
# Quiosque de sucos com coco gigante no telhado
# =====================================================================================================================
def zigue_zague(R, z0, h, n, cores, esp=0.02):
    """Faixa em zigue-zague em volta de um cilindro de raio R: triângulos alternados (para cima e para baixo)."""
    m = Malha()
    for k in range(2 * n):
        a0 = 2 * math.pi * k / (2 * n)
        a1 = 2 * math.pi * (k + 1) / (2 * n)
        am = (a0 + a1) / 2
        cima = k % 2 == 0
        base_z, ponta_z = (z0, z0 + h) if cima else (z0 + h, z0)
        r = R + esp
        A = (r * math.cos(a0), r * math.sin(a0), base_z)
        B = (r * math.cos(a1), r * math.sin(a1), base_z)
        C = (r * math.cos(am), r * math.sin(am), ponta_z)
        cor = cores[0] if cima else cores[1]
        va, vb, vc = m.v(A), m.v(B), m.v(C)
        m.f((va, vb, vc) if cima else (vb, va, vc), cor)
    ob = m.obj("zigue", recalc=False)
    for p in ob.data.polygons:  # normais para fora
        c = V(p.center)
        if V(p.normal).dot(V((c.x, c.y, 0))) < 0:
            p.flip()
    return ob


def coco_gigante(x, y, z, r=1.35):
    """Coco gigante cortado no alto: casca marrom com fibras, polpa verde-água, borda branca e canudo laranja."""
    perfil = [(0, 0), (r * 0.45, 0.02), (r * 0.82, r * 0.25), (r, r * 0.75), (r * 0.98, r * 1.1), (r * 0.86, r * 1.42),
              (r * 0.7, r * 1.6), (r * 0.62, r * 1.58), (r * 0.58, r * 1.52), (0, r * 1.52)]
    casca = mb.torno(perfil, cor="marrom", seg=28, angulo=50)
    mb.pinta_onde(casca, "marrom_claro", lambda c, n: int((math.atan2(c.y, c.x) + 3.2) / 0.28) % 3 == 0 and c.z < r * 1.4)
    mb.pinta_onde(casca, "branco", lambda c, n: c.z > r * 1.5)
    polpa = mb.cilindro(r * 0.57, 0.04, z=r * 1.49, cor="turquesa_claro", seg=28, bisel=0.01)
    mb.pinta_onde(polpa, "verde_agua", lambda c, n: math.hypot(c.x, c.y) < r * 0.42)
    canudo = mb.tubo([(0.2, 0.0, r * 1.2), (0.25, 0.0, r * 1.95), (0.4, -0.05, r * 2.25), (0.75, -0.12, r * 2.32)],
                     0.07, cor="laranja", seg=10, raio_curva=0.25)
    mb.pinta_onde(canudo, "branco", lambda c, n: int(c.z / 0.18) % 2 == 0)
    tampa = mb.torno([(0, 0), (r * 0.5, 0.0), (r * 0.48, 0.12), (r * 0.3, 0.2), (0, 0.22)], cor="marrom", seg=20)
    roda(tampa, "Y", 35)
    mover(tampa, -r * 0.95, 0.1, r * 1.35)
    ob = mb.junta([casca, polpa, canudo, tampa], "coco_gigante")
    mover(ob, x, y, z)
    return ob


def p_quiosque_sucos_coco(it):
    """Quiosque redondo de sucos: balcão de madeira com faixa de zigue-zague, postes de bambu, telhado de palha
    laranja, um coco gigante no alto, letreiro luminoso SUCOS, bancos, pranchas encostadas e luzes."""
    ps = []
    R = 2.1
    zb = 1.05
    ps.append(mb.cilindro(R, zb - 0.07, cor="madeira_media", seg=32, bisel=0.02, tampas=True))
    ps.append(zigue_zague(R, 0.42, 0.36, 16, ("amarelo", "turquesa"), esp=0.006))
    ps.append(mb.cilindro(R + 0.012, 0.06, z=0.36, cor="branco", seg=32, bisel=0.01))
    ps.append(mb.cilindro(R + 0.012, 0.06, z=0.8, cor="branco", seg=32, bisel=0.01))
    ps.append(toro(R + 0.06, 0.07, z=zb - 0.1, cor="madeira_clara", seg=32, seg_r=8, esc_z=0.7))
    ps.append(mb.cilindro(R + 0.05, 0.04, z=zb - 0.04, cor="madeira_clara", seg=32, bisel=0.01))
    # miolo (quem atende) e postes
    ps.append(mb.cilindro(R - 0.6, 0.02, z=zb - 0.06, cor="madeira_escura", seg=24, bisel=0))
    for k in range(6):
        a = 2 * math.pi * (k + 0.5) / 6
        ps += bambu((R - 0.18) * math.cos(a), (R - 0.18) * math.sin(a), zb - 0.05, 3.1, r=0.07, nos=3)
    # balcão com copos de suco e frutas
    rnd = random.Random(3)
    for k in range(7):
        a = math.radians(-150 + 20 * k)
        x, y = (R - 0.25) * math.cos(a), (R - 0.25) * math.sin(a)
        cor = ("laranja", "amarelo", "rosa", "verde_lima", "roxo", "vermelho_claro", "laranja_claro")[k]
        ps.append(mb.cilindro(0.05, 0.16, x=x, y=y, z=zb, r2=0.06, cor=None, mat="vidro", seg=10))
        ps.append(mb.cilindro(0.048, 0.12, x=x, y=y, z=zb + 0.005, r2=0.056, cor=cor, seg=10))
        ps.append(haste((x, y, zb + 0.08), (x + 0.03, y, zb + 0.28), 0.007, "branco", 5))
    for k, (cor, r) in enumerate((("laranja", 0.07), ("amarelo", 0.07), ("verde_lima", 0.06), ("laranja", 0.07))):
        a = math.radians(-30 + 14 * k)
        ps.append(bb.esf(r, x=(R - 0.3) * math.cos(a), y=(R - 0.3) * math.sin(a), z=zb + r, cor=cor, seg=10))
    # telhado de palha laranja
    ps.append(bb.palha(R + 0.75, 1.3, 3.0, camadas=3, cores=("laranja", "laranja_claro", "laranja_escuro"), lados=24,
                       franja=0.16))
    ps.append(toro(R - 0.1, 0.07, z=2.98, cor="madeira", seg=24, seg_r=6))
    ps.append(coco_gigante(0, 0, 4.0, r=1.3))
    # letreiro luminoso SUCOS numa moldura na frente do telhado
    ps.append(bb.caixa_estampa(estampa("neon_sucos", 1.8), 2.2, 0.1, 0.7, 0, -R - 0.55, 3.35, cor="azul_marinho"))
    for sx in (-0.85, 0.85):
        ps.append(haste((sx, -R - 0.5, 3.35), (sx * 0.8, -R + 0.1, 3.7), 0.03, "grafite", 6))
    # lâmpadas na borda do telhado
    luzes = bb.lampadas([((R + 0.55) * math.cos(2 * math.pi * k / 20), (R + 0.55) * math.sin(2 * math.pi * k / 20),
                          2.86) for k in range(20)], r=0.075)
    # pranchas encostadas no balcão (lado +X)
    for k, nome in enumerate(("azul", "verde")):
        pr = pp.prancha_de(nome, leve=True)
        L = pp.PRANCHAS[nome][0]
        mover(pr, 0, L / 2, 0)
        roda(pr, "X", 90)
        roda(pr, "X", 14)
        gira_z(pr, 90)
        mover(pr, R + 0.38 + 0.12 * k, 0.6 - 0.75 * k, 0.04)
        ps.append(pr)
    it.add(mb.junta(ps + luzes, "quiosque"))
    for k, a in enumerate((-125, -90, -55, -20)):
        x, y = (R + 0.5) * math.cos(math.radians(a)), (R + 0.5) * math.sin(math.radians(a))
        it.add(banqueta(x, y, assento=("turquesa", "amarelo", "laranja", "rosa")[k]))
        it.assento(f"assento_{k + 1}", round(x, 3), round(y, 3), 0.75)
    it.slot("balcao", (0, -R + 0.25, zb), (1.2, 0.35, 0.4))
    return dict(col=[((0, 0, 0), (2 * R + 0.2, 2 * R + 0.2, zb)), ((0, 0, 3.0), (2 * R, 2 * R, 3.6)),
                     ((R + 0.45, 0.2, 0), (0.5, 1.6, 2.2)), ((-0.4, -R - 0.45, 0), (3.6, 0.9, 0.75))])


# =====================================================================================================================
# Estação de surfe (prancha no telhado)
# =====================================================================================================================
def p_quiosque_surfe(it):
    """Estação de surfe: casinha de tábuas turquesa e branca com balcão, toldo listrado, telhado de uma água com uma
    prancha gigante, letreiro luminoso SURFE, suporte de pranchas na lateral e luminárias."""
    ps = []
    W, D, Hf, Ht = 3.6, 2.6, 2.7, 3.2  # altura da frente e de trás (telhado de uma água caindo para a frente)
    # paredes de tábuas verticais (fundos e laterais) + frente com janelão
    for k in range(18):
        x = -W / 2 + (k + 0.5) * W / 18
        ps.append(bloco(W / 18 - 0.015, 0.1, Ht - 0.05, x=x, y=D / 2 - 0.05, z=0, cor="turquesa" if k % 2 else
                        "turquesa_claro", bisel=0.008))
    for sx in (-1, 1):
        for k in range(13):
            y = -D / 2 + (k + 0.5) * D / 13
            h = Hf + (Ht - Hf) * (y + D / 2) / D
            ps.append(bloco(0.1, D / 13 - 0.015, h - 0.05, x=sx * (W / 2 - 0.05), y=y, z=0,
                            cor="branco" if k % 2 else "branco_gelo", bisel=0.008))
    ps.append(bloco(W, 0.12, 1.0, y=-D / 2 + 0.06, z=0, cor="turquesa_escuro", bisel=0.02))
    for k in range(9):
        ps.append(bloco(0.03, 0.02, 0.9, x=-W / 2 + (k + 0.5) * W / 9, y=-D / 2 - 0.005, z=0.05, cor="petroleo"))
    ps.append(bloco(W + 0.1, 0.5, 0.07, y=-D / 2 - 0.05, z=1.0, cor="madeira_clara", bisel=0.02))  # balcão
    ps.append(bloco(W, 0.12, 0.55, y=-D / 2 + 0.06, z=Hf - 0.55, cor="turquesa_escuro", bisel=0.02))  # testeira
    for sx in (-1, 1):
        ps.append(bloco(0.14, 0.14, Hf, x=sx * (W / 2 - 0.07), y=-D / 2 + 0.07, z=0, cor="branco", bisel=0.02))
    ps.append(bloco(W - 0.2, D - 0.2, 0.03, y=0, z=0.0, cor="madeira_mel"))
    # telhado de uma água com beiral
    tel = bb.cx(W + 0.5, D + 0.6, 0.14, cor="madeira_escura", bisel=0.03)
    ang = math.degrees(math.atan2(Ht - Hf, D))
    roda(tel, "X", ang)
    mover(tel, 0, 0, (Hf + Ht) / 2 - 0.02)
    ps.append(tel)
    tel2 = bb.cx(W + 0.4, D + 0.5, 0.06, cor="branco", bisel=0.02)
    roda(tel2, "X", ang)
    mover(tel2, 0, 0, (Hf + Ht) / 2 + 0.11)
    ps.append(tel2)
    # prancha gigante no telhado (em diagonal, com suportes)
    pr = bb.prancha(4.2, 1.05, 0.16, cor="amarelo", cor2="vermelho", cor_fundo="laranja", faixa=(0.62, 0.7, "branco"),
                    longboard=False, rocker=0.2)
    roda(pr, "X", ang)
    gira_z(pr, 18)
    mover(pr, 0.1, 0.05, (Hf + Ht) / 2 + 0.55)
    ps.append(pr)
    for x, y in ((-0.6, -0.6), (0.7, 0.7)):
        ps.append(haste((x, y, Hf + (Ht - Hf) * (y + D / 2) / D + 0.1), (x, y, Hf + (Ht - Hf) * (y + D / 2) / D + 0.52),
                        0.04, "grafite", 6))
    # toldo listrado sobre o balcão
    cam = [(0, -D / 2 + 0.12, Hf - 0.5), (0, -D / 2 - 0.4, Hf - 0.75), (0, -D / 2 - 0.8, Hf - 0.95)]
    ps.append(bb.lona_listrada(cam, W + 0.1, ["turquesa", "branco"], 10, esp=0.02, eixo_listra="v", nv=20))
    for k in range(10):
        x = -W / 2 - 0.05 + (k + 0.5) * (W + 0.1) / 10
        ps.append(bb.esf(0.17, x=x, y=-D / 2 - 0.8, z=Hf - 0.98, cor="turquesa" if k % 2 == 0 else "branco", seg=8,
                            esc=(1.05, 0.35, 0.5)))
    # letreiro luminoso SURFE na testeira
    ps.append(bb.caixa_estampa(estampa("neon_surfe", 1.8), 2.4, 0.08, 0.75, 0, -D / 2 - 0.05, Hf - 0.42,
                               cor="azul_marinho"))
    # suporte de pranchas na lateral +X
    for y in (-0.6, 0.6):
        ps.append(bloco(0.5, 0.08, 1.4, x=W / 2 + 0.3, y=y, z=0, cor="madeira", bisel=0.015))
    ps.append(bloco(0.5, 1.3, 0.1, x=W / 2 + 0.3, y=0, z=0.05, cor="madeira_escura", bisel=0.015))
    for k, nome in enumerate(("turquesa", "rosa", "laranja")):
        pr = pp.prancha_de(nome, leve=True)
        L = pp.PRANCHAS[nome][0]
        mover(pr, 0, L / 2, 0)
        roda(pr, "X", 90)
        roda(pr, "Y", 12)
        gira_z(pr, 90)
        mover(pr, W / 2 + 0.25, -0.4 + k * 0.4, 0.12)
        ps.append(pr)
    # boia na parede e luminárias
    b = bb.boia_salva_vidas(0.3, 0.065)
    gira_z(b, -90)
    mover(b, -W / 2 - 0.08, 0.2, 1.7)
    ps.append(b)
    luzes = []
    for sx in (-1, 1):
        ps.append(mb.cilindro(0.07, 0.25, x=sx * 1.3, y=-D / 2 - 0.12, z=1.6, cor="grafite", seg=10, bisel=0.01))
        luzes.append(bb.esf(0.06, x=sx * 1.3, y=-D / 2 - 0.18, z=1.68, cor=None, mat="luz", seg=10))
    it.add(mb.junta(ps + luzes, "estacao_surfe"))
    for k, x in enumerate((-0.9, 0.9)):
        it.add(banqueta(x, -D / 2 - 0.6, assento="turquesa"))
        it.assento(f"assento_{k + 1}", x, -D / 2 - 0.6, 0.75)
    it.slot("balcao", (0, -D / 2 - 0.05, 1.07), (W - 0.2, 0.4, 0.4))
    return dict(col=[((0, 0, 0), (W, D, Ht + 0.2)), ((W / 2 + 0.3, 0, 0), (0.55, 1.4, 2.0)),
                     ((0, -D / 2 - 0.6, 0), (2.3, 0.45, 0.75))])


# =====================================================================================================================
# Barraca de açaí com abacaxi gigante
# =====================================================================================================================
def abacaxi_gigante(x, y, z, r=0.85, h=1.9):
    """Abacaxi gigante: casca em losangos amarelos e alaranjados, coroa de folhas verdes."""
    corpo = bb.se(2 * r, 2 * r, h, cor="amarelo", e=0.95, e_v=0.85, nu=24, nv=14, nome="abacaxi")

    def losango(c, n):
        a = math.atan2(c.y, c.x)
        u = a / (2 * math.pi) * 12 + c.z / h * 6
        v = a / (2 * math.pi) * 12 - c.z / h * 6
        return (int(math.floor(u)) + int(math.floor(v))) % 2 == 0

    mb.pinta_onde(corpo, "amarelo_escuro", losango)
    mb.pinta_onde(corpo, "laranja", lambda c, n: losango(c, n) and (int(c.z * 4) % 3 == 0))
    ps = [corpo]
    for k in range(14):
        a = 2 * math.pi * k / 14 + (0.2 if k % 2 else 0)
        alt = 1.0 + 0.35 * (k % 3)
        inc = 25 + 18 * (k % 2)
        folha = mb.extrudado(bb.ccw([(-0.14, 0), (0.14, 0), (0.02, alt), (-0.02, alt)]), 0.05, y=-0.025,
                             cor="verde" if k % 2 else "verde_escuro", bisel=0.015, seg=1, plano="xz")
        roda(folha, "X", -inc)
        gira_z(folha, math.degrees(a) + 90)
        mover(folha, 0, 0, h - 0.12)
        ps.append(folha)
    ob = mb.junta(ps, "abacaxi")
    mover(ob, x, y, z)
    return ob


def p_barraca_acai(it):
    """Barraca de açaí e sucos: balcão lilás com toldo de babado, abacaxi gigante no teto, letreiro luminoso AÇAÍ,
    tigelas de açaí, caixotes de frutas e banquetas."""
    ps = []
    W, D = 3.2, 2.0
    zb = 1.05
    ps.append(bb.cx(W, D, zb - 0.06, cor="lilas", bisel=0.04))
    for k in range(8):
        ps.append(bb.cx(W / 8 - 0.06, 0.02, 0.5, x=-W / 2 + (k + 0.5) * W / 8, y=-D / 2 - 0.005, z=0.25,
                           cor="lilas_claro" if k % 2 else "branco", bisel=0.01))
    ps.append(bb.cx(W + 0.12, D + 0.12, 0.08, z=zb - 0.08, cor="branco", bisel=0.03))
    ps.append(bb.cx(W + 0.04, D + 0.04, 0.08, z=0.0, cor="roxo_escuro", bisel=0.02))
    for sx in (-1, 1):
        for sy in (-1, 1):
            ps.append(mb.cilindro(0.06, 1.65, x=sx * (W / 2 - 0.08), y=sy * (D / 2 - 0.08), z=zb, cor="branco", seg=10,
                                  bisel=0.01))
    # teto e babado
    zt = zb + 1.65
    ps.append(bb.cx(W + 0.4, D + 0.4, 0.22, z=zt, cor="roxo", bisel=0.05))
    ps.append(bb.cx(W + 0.3, D + 0.3, 0.06, z=zt + 0.22, cor="branco", bisel=0.02))
    for lado in range(4):
        n = 12 if lado % 2 == 0 else 8
        comp = W + 0.4 if lado % 2 == 0 else D + 0.4
        for k in range(n):
            t = -comp / 2 + (k + 0.5) * comp / n
            e = bb.esf(comp / n * 0.55, cor="lilas" if k % 2 else "branco", seg=8, esc=(1, 0.3, 0.75))
            if lado % 2 == 1:
                gira_z(e, 90)
            dx, dy = [(t, -(D + 0.4) / 2), ((W + 0.4) / 2, t), (t, (D + 0.4) / 2), (-(W + 0.4) / 2, t)][lado]
            mover(e, dx, dy, zt - 0.02)
            ps.append(e)
    ps.append(abacaxi_gigante(0.2, 0.1, zt + 0.25, r=0.8, h=1.7))
    # letreiro AÇAÍ luminoso em cima do teto, na frente
    ps.append(bb.caixa_estampa(estampa("neon_acai", 1.8), 2.0, 0.08, 0.62, -0.3, -D / 2 - 0.05, zt + 0.25,
                               cor="roxo_escuro"))
    # balcão: tigelas de açaí (roxo com banana e morango), liquidificador, frutas
    for k, x in enumerate((-1.1, -0.6, -0.1)):
        ps.append(mb.torno([(0, 0), (0.08, 0), (0.12, 0.09), (0.11, 0.1), (0, 0.1)], x=x, y=-D / 2 + 0.25, z=zb,
                           cor="branco", seg=14))
        ps.append(bb.esf(0.1, x=x, y=-D / 2 + 0.25, z=zb + 0.07, cor="roxo_escuro", seg=12, esc=(1, 1, 0.45)))
        ps.append(mb.cilindro(0.025, 0.012, x=x + 0.03, y=-D / 2 + 0.22, z=zb + 0.11, cor="creme", seg=8))
        ps.append(bb.esf(0.025, x=x - 0.03, y=-D / 2 + 0.27, z=zb + 0.12, cor="vermelho", seg=8))
    ps.append(bb.cx(0.18, 0.18, 0.12, x=0.7, y=-D / 2 + 0.3, z=zb, cor="branco", bisel=0.02))
    ps.append(mb.cilindro(0.08, 0.26, x=0.7, y=-D / 2 + 0.3, z=zb + 0.12, r2=0.1, cor=None, mat="vidro", seg=10))
    ps.append(mb.cilindro(0.075, 0.15, x=0.7, y=-D / 2 + 0.3, z=zb + 0.13, r2=0.09, cor="roxo", seg=10))
    # caixotes de frutas ao lado (laranjas e abacaxis pequenos)
    for k, (cor, fruta) in enumerate((("madeira", "laranja"), ("madeira_mel", "amarelo"))):
        x = -W / 2 - 0.45
        y = -0.5 + k * 0.7
        ps.append(bloco(0.6, 0.5, 0.32, x=x, y=y, z=0.0, cor=cor, bisel=0.02))
        for j in range(6):
            ps.append(bb.esf(0.08, x=x - 0.18 + (j % 3) * 0.18, y=y - 0.1 + (j // 3) * 0.2, z=0.38, cor=fruta,
                                seg=10))
    luzes = bb.lampadas([(-W / 2 + 0.2 + k * (W - 0.4) / 7, -D / 2 - 0.05, zt - 0.08) for k in range(8)], r=0.05)
    it.add(mb.junta(ps + luzes, "barraca_acai"))
    for k, x in enumerate((-0.8, 0.8)):
        it.add(banqueta(x, -D / 2 - 0.55, assento="roxo"))
        it.assento(f"assento_{k + 1}", x, -D / 2 - 0.55, 0.75)
    it.slot("balcao", (0, -D / 2 + 0.3, zb), (W - 0.3, 0.45, 0.4))
    return dict(col=[((0, 0, 0), (W + 0.1, D + 0.1, zb)), ((0, 0, zt), (W + 0.4, D + 0.4, 2.2)),
                     ((-W / 2 - 0.45, -0.15, 0), (0.6, 1.2, 0.45)), ((0, -D / 2 - 0.55, 0), (2.0, 0.45, 0.75))])


# =====================================================================================================================
# Carrinho de picolé
# =====================================================================================================================
def p_carrinho_picole(it):
    """Carrinho de picolé: caixa térmica branca e azul com tampa (abre), rodas, alça, guarda-sol e letreiro PICOLÉ
    nas laterais."""
    L, P, A = 1.0, 0.62, 0.62
    z0 = 0.3
    ps = []
    ps.append(bb.cx(L, P, A, z=z0, cor="branco", bisel=0.05))
    ps.append(bb.cx(L + 0.01, P + 0.01, 0.1, z=z0, cor="azul", bisel=0.04))
    ps.append(bb.cx(L + 0.01, P + 0.01, 0.06, z=z0 + A - 0.12, cor="azul", bisel=0.03))
    for sy in (-1, 1):
        ps.append(bb.placa_estampa(estampa("picole"), 0.84, 0.28, 0, sy * (P / 2 + 0.006), z0 + 0.3,
                                   normal=(0, sy, 0)))
    for sx in (-1, 1):  # rodas
        ps.append(mb.cilindro(0.24, 0.07, x=sx * (L / 2 - 0.12), y=P / 2 + 0.05, z=0.24, eixo="y", cor="grafite_escuro",
                              seg=20, bisel=0.02))
        ps.append(mb.cilindro(0.1, 0.075, x=sx * (L / 2 - 0.12), y=P / 2 + 0.05, z=0.24, eixo="y", cor="cromo", seg=14,
                              bisel=0.01))
        ps.append(mb.cilindro(0.24, 0.07, x=sx * (L / 2 - 0.12), y=-P / 2 - 0.05, z=0.24, eixo="y",
                              cor="grafite_escuro", seg=20, bisel=0.02))
        ps.append(mb.cilindro(0.1, 0.075, x=sx * (L / 2 - 0.12), y=-P / 2 - 0.05, z=0.24, eixo="y", cor="cromo",
                              seg=14, bisel=0.01))
    ps.append(mb.cilindro(0.02, P + 0.2, x=-L / 2 + 0.12, y=0, z=0.24, eixo="y", cor="metal", seg=8))
    ps.append(mb.cilindro(0.02, P + 0.2, x=L / 2 - 0.12, y=0, z=0.24, eixo="y", cor="metal", seg=8))
    # alça (lado +X)
    ps.append(mb.tubo([(L / 2 - 0.05, -0.22, z0 + 0.35), (L / 2 + 0.35, -0.22, z0 + 0.62),
                       (L / 2 + 0.35, 0.22, z0 + 0.62), (L / 2 - 0.05, 0.22, z0 + 0.35)], 0.022, cor="cromo", seg=8))
    ps.append(mb.cilindro(0.032, 0.36, x=L / 2 + 0.35, y=0, z=z0 + 0.62, eixo="y", cor="preto", seg=10))
    # guarda-sol do carrinho
    ps.append(mb.cilindro(0.022, 1.3, x=-L / 2 + 0.12, y=0, z=z0 + A, cor="cromo", seg=8))
    copa = bb.copa_gomos(0.8, 0.28, 8, ["azul_celeste", "branco"], z0=0.0, franja=0.08,
                         cores_franja=["branco", "azul_celeste"])
    mover(copa, -L / 2 + 0.12, 0, z0 + A + 1.18)
    ps.append(copa)
    it.add(mb.junta(ps, "carrinho"))
    tampa = [bb.cx(L * 0.62, P - 0.08, 0.05, x=0.12, z=z0 + A, cor="branco", bisel=0.02),
             bb.cx(0.16, 0.04, 0.03, x=0.12, y=-(P - 0.08) / 2 + 0.06, z=z0 + A + 0.05, cor="azul", bisel=0.01)]
    it.porta(tampa, (0.12, P / 2 - 0.04, z0 + A + 0.025), eixo="x", lado="cima", abre_graus=95, nome="tampa")
    it.slot("caixa", (0.0, 0.0, z0 + 0.08), (L - 0.12, P - 0.12, A - 0.14))
    return dict(col=[((0, 0, 0), (L + 0.1, P + 0.25, z0 + A)), ((L / 2 + 0.2, 0, z0 + 0.3), (0.35, 0.5, 0.4))])


# =====================================================================================================================
# Barraca de praia com mesa e cadeiras
# =====================================================================================================================
def cadeira_plastico(x, y, ang, cor="amarelo"):
    ps = [bb.cx(0.44, 0.42, 0.04, z=0.42, cor=cor, bisel=0.015)]
    enc = bb.cx(0.44, 0.04, 0.42, y=0.2, z=0.44, cor=cor, bisel=0.015)
    roda(enc, "X", -10, (0, 0.2, 0.44))
    ps.append(enc)
    for k in range(3):
        ps.append(bb.cx(0.32, 0.045, 0.04, y=0.17 + 0.012, z=0.55 + k * 0.1, cor="branco" if False else cor,
                           bisel=0.01))
    for sx in (-1, 1):
        for sy in (-1, 1):
            ps.append(haste((sx * 0.2, sy * 0.18, 0.0), (sx * 0.19, sy * 0.17, 0.43), 0.022, cor, 6, r2=0.018))
    ob = mb.junta(ps, "cadeira")
    gira_z(ob, ang)
    mover(ob, x, y, 0)
    return ob


def p_barraca_mesa(it):
    """Barraca de praia: tenda quadrada de lona azul com babado, mesa amarela de plástico e quatro cadeiras."""
    S, he, hp = 3.0, 2.25, 3.0
    ps = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            ps.append(mb.cilindro(0.03, he, x=sx * S / 2, y=sy * S / 2, z=0.0, cor="metal_claro", seg=10, bisel=0.005))
            ps.append(pp.monte_areia(0.16, 0.05, x=sx * S / 2, y=sy * S / 2))
            ps.append(haste((sx * S / 2, sy * S / 2, he - 0.02), (0, 0, hp - 0.05), 0.018, "metal_claro", 6))
    # lona: pirâmide de 4 panos (listras azul e branco), com espessura
    for k in range(4):
        a0 = math.radians(45 + 90 * k)
        a1 = math.radians(45 + 90 * (k + 1))
        c0 = V((S / 2 * math.sqrt(2) * math.cos(a0), S / 2 * math.sqrt(2) * math.sin(a0), he))
        c1 = V((S / 2 * math.sqrt(2) * math.cos(a1), S / 2 * math.sqrt(2) * math.sin(a1), he))
        topo = V((0, 0, hp))
        P = []
        nu, nv = 8, 5
        for i in range(nu + 1):
            u = i / nu
            base = c0.lerp(c1, u)
            linha = []
            for j in range(nv + 1):
                v = j / nv
                p = base.lerp(topo, v)
                p.z -= 0.08 * math.sin(math.pi * u) * math.sin(math.pi * v)
                linha.append(tuple(p))
            P.append(linha)
        ps.append(bb.folha_dupla(P, lambda i, j: "azul" if i % 2 == 0 else "branco", esp=0.02, nome="pano"))
        # babado
        n = 6
        for q in range(n):
            u = (q + 0.5) / n
            p = c0.lerp(c1, u)
            e = bb.esf((S / n) * 0.55, cor="azul" if q % 2 == 0 else "branco", seg=8, esc=(1, 0.25, 0.6))
            gira_z(e, math.degrees(math.atan2(c1.y - c0.y, c1.x - c0.x)))
            mover(e, p.x * 1.01, p.y * 1.01, he - 0.1)
            ps.append(e)
    ps.append(bola(0.07, 0, 0, hp + 0.02, cor="amarelo"))
    # mesa de plástico
    ps.append(bb.cx(0.78, 0.78, 0.04, z=0.7, cor="amarelo", bisel=0.02))
    ps.append(bb.cx(0.72, 0.72, 0.06, z=0.64, cor="amarelo_escuro", bisel=0.02))
    for sx in (-1, 1):
        for sy in (-1, 1):
            ps.append(haste((sx * 0.32, sy * 0.32, 0), (sx * 0.31, sy * 0.31, 0.66), 0.025, "amarelo", 6, r2=0.02))
    ps += coco(0.12, 0.08, 0.74)
    ps.append(mb.cilindro(0.035, 0.18, x=-0.15, y=-0.1, z=0.74, cor="verde_escuro", seg=8))
    ps.append(mb.cilindro(0.04, 0.1, x=-0.1, y=0.15, z=0.74, r2=0.045, cor=None, mat="vidro", seg=8))
    it.add(mb.junta(ps, "barraca"))
    for k, (x, y, ang) in enumerate(((0, -0.72, 180), (0.72, 0, 90), (0, 0.72, 0), (-0.72, 0, -90))):
        it.add(cadeira_plastico(x, y, ang + 180 if False else ang, cor="amarelo"))
        it.assento(f"assento_{k + 1}", x, y, 0.46)
    it.slot("mesa", (0, 0, 0.74), (0.7, 0.7, 0.4))
    col = [((sx * S / 2, sy * S / 2, 0), (0.1, 0.1, he)) for sx in (-1, 1) for sy in (-1, 1)]
    return dict(col=[((0, 0, 0), (1.9, 1.9, 0.75))] + col[:3])


# =====================================================================================================================
# Tenda de lona em estrela
# =====================================================================================================================
def p_tenda_estrela(it):
    """Tenda branca tensionada em estrela: 8 pontas estaqueadas na areia, bordas em arco entre elas, mastro central
    alto e costuras nas cumeeiras."""
    pontas, R, z_tip, z_top, z_arco = 8, 6.4, 0.25, 6.0, 2.7
    sub, nr = 8, 12
    P = []
    for i in range(pontas * sub + 1):
        u = (i % sub) / sub
        th = 2 * math.pi * i / (pontas * sub) + math.pi / pontas
        w = math.sin(math.pi * u)
        re = R * (1 - 0.34 * w ** 0.85)
        ze = z_tip + (z_arco - z_tip) * w ** 0.75
        linha = []
        for j in range(nr + 1):
            s = j / nr
            rr = 0.25 + (re - 0.25) * s
            zz = ze + (z_top - ze) * (1 - s) ** 1.45
            linha.append((rr * math.cos(th), rr * math.sin(th), zz))
        P.append(linha)
    ps = [bb.folha_dupla(P, lambda i, j: "branco", lambda i, j: "branco_gelo", esp=0.04, nome="lona")]
    ps.append(mb.cilindro(0.28, 0.25, z=z_top - 0.08, r2=0.12, cor="branco", seg=16, bisel=0.02))
    ps.append(mb.cilindro(0.09, z_top + 0.55, z=0.0, cor="metal_claro", seg=12, bisel=0.01))
    ps.append(bola(0.12, 0, 0, z_top + 0.58, cor="metal_claro"))
    ps.append(mb.cilindro(0.35, 0.12, z=0.0, cor="concreto", seg=16, bisel=0.03))
    for k in range(pontas):
        i = k * sub
        pts = [P[i][j] for j in range(nr + 1)]
        ps.append(mb.tubo([(p[0], p[1], p[2] + 0.025) for p in pts], 0.03, cor="cinza_claro", seg=4, raio_curva=0.3))
        tip = V(P[i][nr])
        d = V((tip.x, tip.y, 0)).normalized()
        est = tip + d * 0.9
        ps.append(haste(tuple(tip), (est.x, est.y, 0.02), 0.015, "cinza", 4))
        ps.append(mb.cilindro(0.04, 0.15, x=est.x, y=est.y, z=0.0, cor="metal", seg=6, bisel=0))
        ps.append(toro(0.06, 0.015, x=tip.x, y=tip.y, z=tip.z - 0.06, cor="metal", seg=10, seg_r=4))
    # luzes penduradas por dentro (acendem à noite)
    luzes = bb.lampadas([(2.2 * math.cos(2 * math.pi * k / 8), 2.2 * math.sin(2 * math.pi * k / 8), 3.6)
                         for k in range(8)], r=0.08)
    for k in range(8):
        a = 2 * math.pi * k / 8
        ps.append(haste((2.2 * math.cos(a), 2.2 * math.sin(a), 3.68), (2.2 * math.cos(a), 2.2 * math.sin(a),
                                                                        4.25 - 0.0), 0.006, "grafite", 4))
    it.add(mb.junta(ps + luzes, "tenda"))
    return dict(col=[((0, 0, 0), (0.4, 0.4, z_top + 0.6))])


# =====================================================================================================================
# Castelo de areia gigante (marco da praia)
# =====================================================================================================================
def p_castelo_gigante(it):
    """Castelo de areia gigante (~15 m): montes de areia na base, muralha com ameias e portão em arco, quatro torres
    de canto, torre de menagem em três andares (marcas do balde), conchas incrustadas e a bandeira vermelha no topo
    (balança)."""
    T = pp.torre_areia
    ps = []
    rnd = random.Random(7)
    # base: monte largo e montinhos irregulares
    ps.append(mb.torno([(0, 0.0), (6.9, 0.0), (6.6, 0.35), (5.9, 0.8), (0, 0.9)], cor="areia", seg=40, angulo=40))
    for k in range(14):
        a = 2 * math.pi * k / 14 + rnd.uniform(-0.15, 0.15)
        rr = rnd.uniform(5.6, 6.6)
        r0 = rnd.uniform(0.6, 1.1)
        ps.append(bb.se(2 * r0, 1.6 * r0, r0 * 0.9, x=rr * math.cos(a), y=rr * math.sin(a), z=0.0,
                                    cor="areia" if k % 3 else "bege", e=0.9, e_v=0.8, nu=10, nv=5, nome="montinho"))
    # fosso raso (anel escuro) e plataforma
    ps.append(mb.torno([(5.0, 0.84), (5.5, 0.84), (5.5, 0.9), (5.0, 0.9)], cor="bege_escuro", seg=40))
    ps.append(bb.cx(9.6, 9.6, 0.5, z=0.8, cor="areia", bisel=0.25, seg=3))
    zb = 1.25
    # muralha em quadrado (lado 8 m, 0,9 de espessura, 3,2 m de altura) com ameias e portão em arco na frente
    S, E, Hm = 8.0, 0.9, 3.2
    for k in range(4):
        ang = 90 * k
        if k == 0:  # frente (−Y): muro com o portão (contorno em U, sem furo)
            wg, hg = 1.6, 2.3
            arco = [(wg / 2 * math.cos(math.radians(a)), hg - wg / 2 + wg / 2 * math.sin(math.radians(a)))
                    for a in range(0, 181, 15)]
            cont = [(-S / 2, 0), (-wg / 2, 0)] + arco[::-1] + [(wg / 2, 0), (S / 2, 0), (S / 2, Hm), (-S / 2, Hm)]
            muro = mb.extrudado(bb.ccw(cont), E, y=-S / 2 - E / 2, cor="areia", bisel=0.08, seg=2, plano="xz")
            mover(muro, 0, 0, zb)
            ps.append(muro)
            # fundo escuro do portão e moldura
            ps.append(mb.extrudado(bb.ccw([(-wg / 2, 0), (wg / 2, 0)] + arco), 0.1, y=-S / 2 + E / 2 - 0.05,
                                   cor="marrom_escuro", bisel=0.02, seg=1, plano="xz"))
            mover(ps[-1], 0, 0, zb)
            mold = mb.tubo([(p[0] * 1.12, -S / 2 - E / 2 - 0.02, zb + (p[1] - (hg - wg / 2)) * 1.12 + hg - wg / 2)
                            for p in arco], 0.14, cor="bege", seg=8, raio_curva=0)
            ps.append(mold)
            for sx in (-1, 1):
                ps.append(bb.cx(0.32, 0.25, hg - wg / 2, x=sx * (wg / 2 + 0.18), y=-S / 2 - E / 2 - 0.05, z=zb,
                                   cor="bege", bisel=0.06))
            continue
        muro = bb.cx(S, E, Hm, y=-S / 2, z=zb, cor="areia", bisel=0.12, seg=2)
        gira_z(muro, ang)
        ps.append(muro)
    for k in range(4):  # ameias sobre a muralha
        for j in range(7):
            t = -S / 2 + 0.75 + j * (S - 1.5) / 6
            m = bb.cx(0.62, E + 0.1, 0.6, x=t, y=-S / 2, z=zb + Hm - 0.02, cor="areia", bisel=0.08, seg=1)
            gira_z(m, 90 * k)
            ps.append(m)
        faixa = bb.cx(S + 0.1, E + 0.14, 0.18, y=-S / 2, z=zb + Hm - 0.3, cor="bege", bisel=0.06, seg=2)
        gira_z(faixa, 90 * k)
        ps.append(faixa)
    # torres de canto
    for sx, sy in ((1, 1), (-1, 1), (-1, -1), (1, -1)):
        ps.append(T(sx * S / 2, sy * S / 2, 1.55, 6.0, z=zb, ameias=10, aneis=3, seg=20, cor2="bege"))
        for zz in (2.6, 4.4):  # janelinhas escuras em arco
            a = math.atan2(sy, sx)
            jx, jy = sx * S / 2 + 1.5 * math.cos(a), sy * S / 2 + 1.5 * math.sin(a)
            jan = mb.extrudado(bb.ccw([(-0.2, 0), (0.2, 0)] + [(0.2 * math.cos(math.radians(q)),
                                                                 0.45 + 0.2 * math.sin(math.radians(q)))
                                                                for q in range(0, 181, 30)]), 0.2, y=-0.1,
                               cor="marrom_escuro", bisel=0.02, seg=1, plano="xz")
            gira_z(jan, math.degrees(a) + 90)
            mover(jan, jx, jy, zb + zz)
            ps.append(jan)
    # torre de menagem em três andares
    z = zb
    for k, (r, h) in enumerate(((3.0, 4.6), (2.15, 3.6), (1.4, 3.0))):
        ps.append(T(0, 0.4, r, h, z=z, ameias=12 - 2 * k, aneis=2, seg=22, cor2="bege"))
        for q in range(4 if k < 2 else 3):  # janelas
            a = math.radians(-90 + (q - 1.5) * 32) if k < 2 else math.radians(-90 + (q - 1) * 45)
            jx, jy = (r * 0.97) * math.cos(a), 0.4 + (r * 0.97) * math.sin(a)
            jan = mb.extrudado(bb.ccw([(-0.22, 0), (0.22, 0)] + [(0.22 * math.cos(math.radians(qq)),
                                                                   0.5 + 0.22 * math.sin(math.radians(qq)))
                                                                  for qq in range(0, 181, 30)]), 0.2, y=-0.1,
                               cor="marrom_escuro", bisel=0.02, seg=1, plano="xz")
            gira_z(jan, math.degrees(a) + 90)
            mover(jan, jx, jy, z + h * 0.4)
            ps.append(jan)
        z += h - 0.25
    ps.append(mb.cilindro(0.95, 1.4, x=0, y=0.4, z=z - 0.1, r2=0.0, cor="bege", seg=24, bisel=0))
    ztopo = z + 1.25
    ps.append(mb.cilindro(0.06, 1.9, x=0, y=0.4, z=ztopo - 0.2, cor="madeira_clara", seg=8, bisel=0))
    ps.append(bola(0.1, 0, 0.4, ztopo + 1.72, cor="amarelo"))
    # conchas e estrelas incrustadas na muralha da frente e nas torres
    cores = ["rosa_claro", "branco", "salmao", "laranja", "turquesa_claro"]
    for k in range(16):
        x = rnd.uniform(-S / 2 + 0.6, S / 2 - 0.6)
        if abs(x) < 1.2:
            continue
        z0 = zb + rnd.uniform(0.6, Hm - 0.6)
        c = bb.se(0.32, 0.12, 0.26, x=x, y=-S / 2 - E / 2 - 0.02, z=z0, cor=cores[k % 5], e=0.5, e_v=0.6, nu=8, nv=4)
        ps.append(c)
    for k in range(4):
        a = math.radians(-120 + 20 * k)
        est = pz.estrela(0, 0, 0.35, cor="laranja" if k % 2 else "salmao", rot=k * 20)
        roda(est, "X", 90)
        gira_z(est, math.degrees(a) + 90)
        mover(est, 3.02 * math.cos(a), 0.4 + 3.02 * math.sin(a), zb + 1.6 + 0.4 * (k % 2))
        ps.append(est)
    # baldes e pá gigantes encostados (escala do castelo)
    b = pp.balde(0, 0, cor="vermelho", r=0.75, a=1.1, alca="amarelo", areia=True)
    mover(b, 6.1, -4.6, 0.0)
    ps.append(b)
    pa = pp.pazinha(0, 0, rot=0, cor="azul")
    pa.data.transform(Matrix.Diagonal((6, 6, 6, 1)))
    roda(pa, "X", -60)
    mover(pa, -5.8, -4.9, 0.6)
    ps.append(pa)
    it.add(mb.junta(ps, "castelo_gigante"))
    band = bb.bandeira_ondulada(1.6, 1.0, 0, 0.4, ztopo + 1.6, "vermelho", n=10, amp=0.15)
    it.anima([band], {"anima": "balancar", "eixo": "y", "angulo": 14, "periodo": 3.0}, "bandeira",
             pivo=(0, 0.4, ztopo + 1.1))
    return dict(col=[((0, 0, 0), (13.0, 13.0, 1.25)), ((0, 0, zb), (S + E + 2.0, S + E + 2.0, Hm + 0.5)),
                     ((0, 0.4, zb), (6.0, 6.0, ztopo - zb)), ((6.1, -4.6, 0), (1.6, 1.6, 1.2))],
                extra={"quadras": [1, 1]})
