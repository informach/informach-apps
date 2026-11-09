"""Marcos da cidade: observatório, estádio, aeroporto/hangar, píer do navio de cruzeiro (acesso, píer e ponta), represa
monumental em módulos (trecho em curva e torre redonda) e farol de costa.
"""
import math
import random

import bmesh
from mathutils import Matrix, Vector

import moveis_base as mb
import cidade_base as cb
import cidade_agua_estruturas as ae
import cidade_ruas as cr
import cenario_base as cnb
from cenario_base import H, Q, Z_AGUA, Z_FUNDO_MAR, Z_BASE_MAR, ItemC

V = Vector
DIR_MARCO = (0.55, -1.0, 0.6)


def anel(r, z, rt=0.08, cor="branco", n=48, mat="atlas", esc=(1, 1), nome="anel"):
    pts = [(r * esc[0] * math.cos(2 * math.pi * k / n), r * esc[1] * math.sin(2 * math.pi * k / n), z) for k in range(n)]
    return mb.tubo(pts, rt, cor=cor if mat == "atlas" else None, mat=mat, seg=6, fechado=True, raio_curva=0.0,
                   nome=nome)


def faixa_esfera(R, a0, a1, larg, off=0.03, cor="grafite_escuro", n=12, nome="faixa_domo", mat="atlas"):
    """Tira sobre a esfera de raio R (centro na origem), ao longo do meridiano x = 0 do ângulo de elevação a0 a a1
    (graus), com largura larg, afastada off da superfície."""
    bm = bmesh.new()
    vs = []
    for k in range(n + 1):
        e = math.radians(a0 + (a1 - a0) * k / n)
        r = R + off
        cy, cz = -r * math.cos(e), r * math.sin(e)
        vs.append((bm.verts.new((-larg / 2, cy, cz)), bm.verts.new((larg / 2, cy, cz))))
    for (a, b), (c, d) in zip(vs, vs[1:]):
        bm.faces.new((a, b, d, c))
    return mb._obj(nome, bm, cor, mat=mat, liso=False)


# ---------------------------------------------------------------------------------------------------- observatório
def domo(it, x, y, R, h_tambor, nome, olho=False, ang=0.0):
    """Tambor redondo com anel azul e porta, domo branco com gomos, fenda e telescópio (o domo gira devagar)."""
    objs = [mb.cilindro(R + 0.6, 0.6, x=x, y=y, z=0.0, cor="concreto", seg=40, bisel=0.08),
            mb.cilindro(R, h_tambor, x=x, y=y, z=0.6, cor="branco", seg=40, bisel=0.05),
            mb.cilindro(R + 0.08, 1.0, x=x, y=y, z=0.6 + 0.4, cor="azul_medio", seg=40, bisel=0.04)]
    # janelinhas em volta do tambor e porta na frente
    for k in range(10):
        a = 2 * math.pi * (k + 0.5) / 10 + math.radians(ang)
        if abs(math.sin(a) + 1) < 0.15:
            continue
        jx, jy = x + (R + 0.02) * math.cos(a), y + (R + 0.02) * math.sin(a)
        j = mb.caixa(0.9, 0.12, 1.2, cor=None, mat="janela", bisel=0.03)
        mb.transforma(j, loc=(jx, jy, 0.6 + h_tambor * 0.55), rot=("Z", math.degrees(a) + 90))
        objs.append(j)
    porta = mb.caixa(1.8, 0.5, 2.6, x=x, y=y - R, z=0.6, cor="azul_escuro", bisel=0.06)
    marq = mb.caixa(3.0, 1.4, 0.22, x=x, y=y - R - 0.5, z=3.4, cor="branco", bisel=0.06)
    lamp = mb.caixa(1.6, 0.06, 0.14, x=x, y=y - R - 1.15, z=3.25, cor=None, mat="luz", bisel=0.02)
    objs += [porta, marq, lamp]
    objs.append(anel(R + 0.1, 0.62, 0.06, mat="luz_azul", n=40))
    it.add(mb.junta(objs, nome + "_tambor"))
    zc = 0.6 + h_tambor
    # domo (filho animado): gomos, fenda com venezianas e o telescópio saindo
    d = []
    perfil = [(R * math.cos(math.radians(a)), R * math.sin(math.radians(a))) for a in range(0, 91, 6)]
    d.append(mb.torno([(R + 0.05, -0.1)] + perfil, cor="branco", seg=40))
    for k in range(12):
        f = faixa_esfera(R, 2, 86, 0.14, off=0.02, cor="branco_gelo", n=10)
        ae.gira(f, k * 30 + 15)
        d.append(f)
    d.append(anel(R * math.cos(math.radians(35)), R * math.sin(math.radians(35)), 0.07, cor="branco_gelo", n=40))
    if not olho:
        d.append(faixa_esfera(R, 8, 92, 1.8, off=0.04, cor="grafite_escuro", n=14, nome="fenda"))
        for sx in (-1, 1):
            tr = faixa_esfera(R, 6, 94, 0.3, off=0.16, cor="cinza_claro", n=14)
            mb.transforma(tr, loc=(sx * 1.05, 0, 0))
            d.append(tr)
        tel = mb.cilindro(0.55, 4.2, cor="cinza_claro", seg=16, bisel=0.04)
        anel_t = mb.cilindro(0.62, 0.4, z=3.4, cor="azul_medio", seg=16, bisel=0.03)
        lente = mb.cilindro(0.45, 0.05, z=4.2, cor=None, mat="luz_azul", seg=16, bisel=0)
        t = mb.junta([tel, anel_t, lente], "telescopio")
        mb.transforma(t, loc=(0, -R * 0.35, R * 0.45), rot=("X", -55))
        d.append(t)
    else:
        # olho: abertura redonda com lente azul que acende à noite
        e = math.radians(40)
        cy, cz = -R * math.cos(e), R * math.sin(e)
        aro = mb.cilindro(1.9, 0.5, cor="grafite", seg=28, bisel=0.08, eixo="y")
        len_ = mb.cilindro(1.5, 0.12, y=-0.28, cor=None, mat="luz_azul", seg=28, bisel=0.02, eixo="y")
        olho_ = mb.junta([aro, len_], "olho")
        mb.transforma(olho_, loc=(0, cy * 0.98, cz * 0.98), rot=("X", -40))
        d.append(olho_)
        cap = mb.esfera(1.4, x=0, y=R * 0.2, z=R * 0.95, cor="branco_gelo", esc=(1, 1, 0.6), seg=16)
        d.append(cap)
    dm = mb.junta(d, nome + "_domo")
    ae.gira(dm, ang)
    mb.transforma(dm, loc=(x, y, zc))
    return it.anima(dm, (x, y, zc), {"anima": "girar", "eixo": "y", "velocidade": 3.0}, nome + "_domo")


def p_observatorio():
    it = ItemC("observatorio")
    LX, LY = 45.0, 30.0
    it.add(cb.laje(cb.quadrado(-LX / 2, -LY / 2, LX / 2, LY / 2), 0.0, "grama", nome="grama"))
    it.add(cb.laje(ae.ccw(mb.ret_arredondado(38.0, 22.0, 3.0)), 0.06, "concreto", nome="patio"))
    it.add(cb.laje(ae.ccw(mb.ret_arredondado(36.0, 20.0, 2.6)), 0.08, "calcada", nome="patio2"))
    # caminho até a borda da frente
    it.add(cb.laje(cb.quadrado(-1.6, -LY / 2, 1.6, -10.0), 0.07, "calcada", nome="caminho"))
    domo(it, -10.5, 0.5, 5.6, 4.6, "domo_1", olho=False, ang=-20)
    domo(it, 10.5, 0.5, 6.4, 5.4, "domo_2", olho=True, ang=25)
    # prédio de apoio entre os domos
    b = []
    b.append(mb.caixa(8.0, 9.0, 6.4, x=0, y=1.0, z=0.08, cor="branco", bisel=0.15))
    b.append(mb.caixa(8.3, 9.3, 0.4, x=0, y=1.0, z=6.4, cor="azul_medio", bisel=0.1))
    b.append(cb.janelas(("y", 1.0 - 4.5, -1), -3.6, 3.6, 3.4, 6.0, 4, 1, moldura="azul_escuro", semente=3))
    b.append(cb.janelas(("y", 1.0 + 4.5, 1), -3.6, 3.6, 0.8, 6.0, 4, 2, moldura="azul_escuro", semente=4))
    b.append(mb.caixa(3.2, 0.3, 2.6, x=0, y=1.0 - 4.55, z=0.08, cor=None, mat="vidro", bisel=0.03))
    b.append(mb.caixa(4.4, 1.8, 0.24, x=0, y=1.0 - 5.2, z=2.9, cor="azul_medio", bisel=0.06))
    for k in range(3):  # painéis solares no teto
        p = mb.caixa(2.0, 1.4, 0.08, x=-2.4 + 2.4 * k, y=2.5, z=7.1, cor="azul_escuro", bisel=0.02)
        mb.transforma(p, rot=("X", 0))
        b.append(p)
        b.append(mb.caixa(0.1, 0.1, 0.4, x=-2.4 + 2.4 * k, y=2.5, z=6.8, cor="metal", bisel=0))
    b.append(mb.cilindro(0.06, 3.0, x=2.8, y=-1.5, z=6.8, cor="metal", seg=6, bisel=0))
    b.append(mb.esfera(0.12, x=2.8, y=-1.5, z=9.85, cor=None, mat="luz_vermelha", seg=8))
    para = mb.torno([(0, 0), (0.9, 0.05), (1.0, 0.25), (0.15, 0.1), (0, 0.1)], cor="branco", seg=16)
    mb.transforma(para, loc=(-2.6, -1.8, 7.0), rot=("X", -30))
    b.append(para)
    it.add(mb.junta(b, "apoio"))
    it.add(cnb.placa("observatorio", 6.4, 1.05, x=0, y=1.0 - 4.65, z=4.5, emissao=1.4))
    # postes, bancos e árvores
    for x, y, a in ((-17.0, -9.0, 0), (17.0, -9.0, 180), (-17.0, 9.5, 0), (17.0, 9.5, 180), (-3.0, -11.5, 0),
                    (3.0, -11.5, 180)):
        it.add(ae.poste(x, y, z0=0.08, ang=a, braco=1.0, alt=4.4, cor="branco"))
    for x in (-6.0, 6.0):
        it.add(ae.banco(x, -8.8, z0=0.08, ang=0))
    rnd = random.Random(3)
    for x, y in ((-20.5, -12.5), (20.5, -12.5), (-20.5, 12.5), (20.5, 12.5), (-6.5, -13.0), (6.5, -13.0),
                 (0, 13.0), (-14, 13.2), (14, 13.2)):
        it.add(cnb.arvore_baixa(x, y, 0.0, esc=rnd.uniform(0.9, 1.2), rnd=rnd))
    col = [((0, 0, cb.Z_FUNDO), (LX, LY, -cb.Z_FUNDO)),
           ((-10.5, 0.5, 0), (12.4, 12.4, 10.8)), ((10.5, 0.5, 0), (14.0, 14.0, 12.4)), ((0, 1.0, 0), (8.0, 9.0, 7.0))]
    return it, dict(rotulo="Observatório (3 × 2)", grupo="observatorio", tags=["marco", "observatorio", "3x2", "animado"],
                    colisao=col, dir_mini=DIR_MARCO, extra={"quadras": [3, 2]})


# ---------------------------------------------------------------------------------------------------- estádio
def p_estadio():
    it = ItemC("estadio")
    L = 30.0
    EX = (1.0, 0.82)
    it.add(cb.laje(cb.quadrado(-H * 2, -H * 2, H * 2, H * 2), 0.0, "calcada", nome="praca"))
    it.add(cr.poli(ae.ccw(mb.circulo(14.6, 64, rx=14.6, ry=14.6 * 0.86)), z=0.0, cor="concreto", alt=0.004))
    # casco: perfil de fora (sobe, curva para dentro na borda) e arquibancada em degraus por dentro
    fora = [(13.2, 0.0), (13.6, 2.0), (13.9, 6.0), (13.9, 9.5), (13.6, 11.4), (13.0, 12.2), (12.4, 12.3)]
    degraus = []
    r, z = 12.4, 12.3
    nd = 10
    for k in range(nd):
        r2 = 12.4 - (12.4 - 8.2) * (k + 1) / nd
        z2 = 12.3 - (12.3 - 1.4) * (k + 1) / nd
        degraus += [(r2 + 0.02, z), (r2, z2)] if k == 0 else [(r2, degraus[-1][1]), (r2, z2)]
    degraus = [(12.2, 12.3)] + degraus
    perfil = fora + degraus + [(8.0, 1.4), (8.0, 0.6), (7.6, 0.2)]
    casco = mb.torno(perfil, cor="branco", seg=64, esc=EX, angulo=30)
    cores_deg = ["azul", "azul_celeste", "branco", "azul_celeste"]

    def cor_face(c, n):
        rr = math.hypot(c.x / EX[0], c.y / EX[1])
        return rr < 12.3 and c.z > 1.3

    me = casco.data
    for p in me.polygons:
        c, n = V(p.center), V(p.normal)
        rr = math.hypot(c.x / EX[0], c.y / EX[1])
        if rr < 12.35 and c.z > 1.3:
            if n.z > 0.7:  # piso dos degraus
                k = int((12.3 - c.z) / ((12.3 - 1.4) / nd))
                mb.pinta(casco, cores_deg[k % 4], [p.index])
            else:
                mb.pinta(casco, "branco_gelo", [p.index])
        elif rr < 8.3:
            mb.pinta(casco, "concreto_escuro", [p.index])
    it.add(casco)
    # campo com estampa
    mi = cnb.est("campo_estadio")
    rx, ry = 7.6, 7.6 * EX[1]
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    n = 40
    cen = bm.verts.new((0, 0, 0.62))
    vs = [bm.verts.new((rx * math.cos(2 * math.pi * k / n), ry * math.sin(2 * math.pi * k / n), 0.62)) for k in range(n)]
    for k in range(n):
        f = bm.faces.new((cen, vs[k], vs[(k + 1) % n]))
        for lo in f.loops:
            co = lo.vert.co
            lo[uvl].uv = (0.5 + co.x / (2 * rx) * 0.94, 0.5 + co.y / (2 * ry) * 0.94)
    it.add(mb._obj("campo", bm, None, mat=mi, liso=False))
    # neons em volta do casco
    for z, mat in ((3.2, "neon_roxo"), (5.0, "neon"), (8.2, "neon_rosa"), (11.6, "neon")):
        rr = 13.62 + (0.25 if 2 < z < 10 else 0.0)
        it.add(anel(rr + 0.12, z, 0.12, mat=mat, n=64, esc=EX))
    # entradas (arcos escuros) e letreiro
    for k in range(8):
        a = 2 * math.pi * (k + 0.5) / 8
        ex, ey = 13.45 * math.cos(a) * EX[0], 13.45 * math.sin(a) * EX[1]
        porta = mb.caixa(2.4, 0.8, 2.8, cor="azul_noite", bisel=0.3)
        mb.transforma(porta, loc=(ex, ey, 0.0), rot=("Z", math.degrees(math.atan2(ey, ex)) + 90))
        it.add(porta)
    it.add(cnb.placa("arena", 6.0, 1.5, x=0, y=-13.9 * EX[1] - 0.25, z=6.2, emissao=2.0, moldura="azul_noite"))
    # cobertura em anel (lona branca) com luzes por baixo
    cob = mb.torno([(13.0, 12.4), (13.4, 13.3), (12.0, 14.0), (10.2, 13.7), (10.0, 13.4), (12.4, 12.9)], cor="branco",
                   seg=64, esc=EX, angulo=40)
    it.add(cob)
    it.add(anel(10.3, 13.45, 0.1, mat="luz", n=64, esc=EX))
    # torres de holofote
    for sx, sy in ((1, 1), (-1, 1), (-1, -1), (1, -1)):
        x, y = sx * 13.6, sy * 11.6
        it.add(mb.cilindro(0.3, 17.0, x=x, y=y, z=0.0, cor="cinza_claro", seg=10, bisel=0.02, r2=0.2))
        caixa_l = mb.caixa(2.4, 0.4, 1.4, cor="grafite", bisel=0.05)
        luz_l = mb.caixa(2.1, 0.06, 1.1, y=-0.22, z=0.15, cor=None, mat="luz", bisel=0.02)
        h = mb.junta([caixa_l, luz_l], "holofote")
        mb.transforma(h, loc=(x, y, 17.0), rot=[("Z", math.degrees(math.atan2(-y, -x)) - 90 + 180), ("X", 25)])
        it.add(h)
    col = [((0, 0, cb.Z_FUNDO), (L, L, -cb.Z_FUNDO)), ((0, 0, 0), (27.8, 27.8 * EX[1] * 0.98, 12.3))]
    return it, dict(rotulo="Estádio (2 × 2)", grupo="estadio", tags=["marco", "estadio", "neon", "2x2"], colisao=col,
                    dir_mini=DIR_MARCO, extra={"quadras": [2, 2]})


# ---------------------------------------------------------------------------------------------------- aeroporto
def p_aeroporto():
    it = ItemC("aeroporto_hangar")
    L = 30.0
    it.add(cb.laje(cb.quadrado(-L / 2, -L / 2, L / 2, L / 2), 0.0, "concreto", nome="patio"))
    for k in range(7):  # juntas das placas do pátio
        x = -L / 2 + 3.75 + 3.75 * k
        it.add(cr.poli(cb.quadrado(x - 0.03, -L / 2, x + 0.03, -1.0), z=0.0, cor="concreto_escuro", alt=0.002))
    for k in range(3):
        y = -L / 2 + 3.75 * (k + 1)
        it.add(cr.poli(cb.quadrado(-L / 2, y - 0.03, L / 2, y + 0.03), z=0.0, cor="concreto_escuro", alt=0.002))
    # faixas amarelas: linha de taxi e círculo de estacionamento da aeronave
    it.add(cb.faixa([(-L / 2, -9.0), (-6.0, -9.0)] + [(-6 + 3 * math.sin(math.radians(a)), -9 + 3 - 3 * math.cos(math.radians(a)))
                                                       for a in range(0, 91, 10)] + [(-3.0, -2.0)], larg=0.3,
                    cor="amarelo", z=0.0))
    it.add(cb.faixa([(5.5 + 4 * math.cos(math.radians(a)), -8.0 + 4 * math.sin(math.radians(a))) for a in range(0, 361, 10)],
                    larg=0.25, cor="amarelo", z=0.0))
    it.add(cb.faixa([(5.5, -12.0), (5.5, -4.0)], larg=0.25, cor="amarelo", z=0.0))
    # hangar: paredes e abóbada
    HX, HY, HZ = 20.0, 14.0, 6.0
    yc = 6.5
    b = [mb.caixa(HX, HY, HZ, x=-2.0, y=yc, z=0.0, cor="laranja_claro", bisel=0.1),
         mb.caixa(HX + 0.1, HY + 0.1, 1.0, x=-2.0, y=yc, z=0.0, cor="azul_medio", bisel=0.05)]
    perfil = [(-HX / 2 - 0.4, 0.0)] + [(-(HX / 2 + 0.4) * math.cos(math.radians(a)), 4.6 * math.sin(math.radians(a)))
                                       for a in range(0, 181, 10)][1:]
    abob = mb.extrudado(ae.ccw([(p[0], p[1]) for p in perfil]), HY + 1.2, x=-2.0, y=yc - (HY + 1.2) / 2, z=HZ,
                        cor="turquesa_claro", bisel=0.1, plano="xz")
    mb.pinta_onde(abob, "turquesa", lambda c, n: abs(n.y) > 0.9)
    b.append(abob)
    for k in range(8):  # nervuras da abóbada
        x = -2.0 - HX / 2 + 1.25 + k * (HX - 2.5) / 7
        b.append(mb.caixa(0.18, HY + 1.3, 0.02, x=x, y=yc, z=HZ, cor="branco", bisel=0))
    for xk in range(-1, 2):
        b.append(mb.tubo([(-2.0 + xk * 0.01 - (HX / 2 + 0.45) * math.cos(math.radians(a)) * 0 + (-(HX / 2 + 0.5) * math.cos(math.radians(a))),
                           yc - HY / 2 - 0.62 + 0.0, HZ + 4.7 * math.sin(math.radians(a))) for a in range(0, 181, 10)],
                         0.12, cor="branco", seg=6) if xk == 0 else None)
    # portão grande da frente (de correr, para a direita), fresta aberta escura atrás
    it.add(mb.caixa(HX - 2.0, 0.2, HZ - 0.4, x=-2.0, y=yc - HY / 2 + 0.05, z=0.05, cor="grafite_escuro", bisel=0.02))
    it.add(mb.junta(b, "hangar"))
    porta = []
    for k in range(2):
        px = -2.0 - (HX - 2.0) / 4 + k * (HX - 2.0) / 2
        porta.append(mb.caixa((HX - 2.0) / 2 - 0.08, 0.25, HZ - 0.5, x=px, y=yc - HY / 2 - 0.2, z=0.05, cor="cinza_claro",
                              bisel=0.04))
        for j in range(4):
            porta.append(mb.caixa((HX - 2.0) / 2 - 0.3, 0.05, 0.08, x=px, y=yc - HY / 2 - 0.34, z=1.0 + j * 1.2,
                                  cor="metal", bisel=0))
        porta.append(cb.janelas(("y", yc - HY / 2 - 0.32, -1), px - 3.5, px + 3.5, HZ - 1.6, HZ - 0.6, 5, 1,
                                moldura="metal", semente=k, peitoril=False))
    it.correr(porta[: len(porta) // 2], direcao=(1, 0, 0), curso=(HX - 2.0) / 2 - 0.4, nome="portao_esq")
    it.add(porta[len(porta) // 2:])
    it.add(cnb.placa("aeroporto", 8.0, 1.6, x=-2.0, y=yc - HY / 2 - 0.4, z=HZ + 0.3, emissao=1.4, moldura="azul_medio"))
    # anexo e torre de controle
    an = [mb.caixa(6.0, 10.0, 4.4, x=11.0, y=8.0, z=0.0, cor="creme", bisel=0.08),
          mb.caixa(6.3, 10.3, 0.3, x=11.0, y=8.0, z=4.4, cor="azul_medio", bisel=0.05),
          cb.janelas(("x", 8.0, -1), 3.5, 12.5, 0.8, 4.0, 4, 2, moldura="branco", semente=7),
          cb.janelas(("y", 3.0, -1), 8.5, 13.5, 0.8, 4.0, 2, 2, moldura="branco", semente=8),
          mb.cilindro(1.6, 12.0, x=11.4, y=10.5, z=4.4, cor="branco", seg=20, bisel=0.04),
          mb.cilindro(2.6, 0.5, x=11.4, y=10.5, z=16.0, cor="azul_medio", seg=20, bisel=0.06, r2=2.9),
          mb.cilindro(2.7, 2.4, x=11.4, y=10.5, z=16.5, cor=None, mat="janela_fria", seg=20, bisel=0.02, r2=3.0),
          mb.cilindro(3.1, 0.4, x=11.4, y=10.5, z=18.9, cor="azul_medio", seg=20, bisel=0.06),
          mb.cilindro(0.06, 2.0, x=11.4, y=10.5, z=19.3, cor="metal", seg=6, bisel=0),
          mb.esfera(0.14, x=11.4, y=10.5, z=21.35, cor=None, mat="luz_vermelha", seg=8)]
    it.add(mb.junta(an, "torre_controle"))
    # biruta e balizas
    it.add(mb.cilindro(0.06, 5.0, x=-13.2, y=-12.5, z=0.0, cor="metal", seg=6, bisel=0))
    bir = mb.cilindro(0.35, 2.0, cor="laranja", seg=10, bisel=0, r2=0.18, eixo="x")
    mb.pinta_onde(bir, "branco", lambda c, n: 0.3 < c.x < 0.7 or -0.4 < c.x < -0.0)
    mb.transforma(bir, loc=(-12.2, -12.5, 4.8))
    it.add(bir)
    for k in range(6):
        it.add(mb.cilindro(0.12, 0.35, x=-14.5 + 2.6 * k, y=-14.6, z=0.0, cor="amarelo", seg=8, bisel=0.02),
               mb.esfera(0.1, x=-14.5 + 2.6 * k, y=-14.6, z=0.42, cor=None, mat="luz_azul", seg=8))
    col = [((0, 0, cb.Z_FUNDO), (L, L, -cb.Z_FUNDO)), ((-2.0, yc, 0), (HX, HY, HZ + 4.6)), ((11.0, 8.0, 0), (6.0, 10.0, 4.7)),
           ((11.4, 10.5, 4.4), (3.4, 3.4, 15.0))]
    it.slot("aeronave", (5.5, -8.0, 0.0), (14.0, 12.0, 6.0))
    return it, dict(rotulo="Aeroporto com hangar e pátio (2 × 2)", grupo="aeroporto",
                    tags=["marco", "aeroporto", "hangar", "2x2", "interativo"], colisao=col, dir_mini=DIR_MARCO,
                    extra={"quadras": [2, 2]})


# ---------------------------------------------------------------------------------------------------- píer do cruzeiro
E_DECK = 0.6


def agua_e_fundo(it, x0, y0, x1, y1):
    it.add(cb.laje(cb.quadrado(x0, y0, x1, y1), Z_FUNDO_MAR, "agua_funda", z_fundo=Z_BASE_MAR, nome="fundo"))
    it.add(cnb.agua_plano(cb.quadrado(x0, y0, x1, y1)))


def deck(it, pol, juntas_x=(), juntas_y=(), cor="concreto"):
    it.add(ae.prisma([pol], -E_DECK, 0.0, cor, lado="concreto_escuro", nome="deck"))
    xs = [p[0] for p in pol]
    ys = [p[1] for p in pol]
    for x in juntas_x:
        it.add(cr.poli(cb.quadrado(x - 0.03, min(ys) + 0.05, x + 0.03, max(ys) - 0.05), z=0.0, cor="concreto_escuro",
                       alt=0.002))
    for y in juntas_y:
        it.add(cr.poli(cb.quadrado(min(xs) + 0.05, y - 0.03, max(xs) - 0.05, y + 0.03), z=0.0, cor="concreto_escuro",
                       alt=0.002))


def estacas(it, pts, r=0.45):
    it.add(mb.junta([mb.cilindro(r, Z_FUNDO_MAR * -1 - E_DECK + 0.1, x=x, y=y, z=Z_FUNDO_MAR - 0.05, cor="concreto_escuro",
                                 seg=10, bisel=0) for x, y in pts], "estacas"))


def cabeco(x, y, z=0.0):
    return mb.torno([(0, 0), (0.32, 0), (0.26, 0.2), (0.24, 0.42), (0.36, 0.5), (0.34, 0.6), (0, 0.62)], x=x, y=y, z=z,
                    cor="ferro", seg=12)


def defensa(x, y, eixo="y", L=1.8):
    return mb.cilindro(0.32, L, x=x, y=y, z=-0.62, cor="borracha", seg=10, bisel=0.05, eixo=eixo)


def poste_duplo(x, y, alt=8.0):
    ps = [mb.cilindro(0.22, 0.4, x=x, y=y, z=0.0, cor="grafite", seg=10, bisel=0.03),
          mb.cilindro(0.11, alt, x=x, y=y, z=0.35, cor="cinza_claro", seg=8, bisel=0, r2=0.08)]
    for sx in (-1, 1):
        ps.append(mb.tubo([(x, y, alt + 0.1), (x + sx * 0.4, y, alt + 0.45), (x + sx * 1.3, y, alt + 0.45)], 0.06,
                          cor="cinza_claro", seg=6, raio_curva=0.3))
        ps.append(mb.caixa(0.8, 0.36, 0.18, x=x + sx * 1.3, y=y, z=alt + 0.3, cor="cinza_claro", bisel=0.05))
        ps.append(mb.caixa(0.66, 0.26, 0.03, x=x + sx * 1.3, y=y, z=alt + 0.28, cor=None, mat="luz", bisel=0.01))
    return mb.junta(ps, "poste_duplo")


def p_pier_acesso():
    """Acesso do píer: calçadão da orla (como agua/orla) do lado da terra e o deck de concreto do píer sobre a água."""
    it = mb.Item("pier_cruzeiro_acesso")
    YO = ae.Y_ORLA - ae.MURETA_W
    ae.calcadao(it, -H, YO)
    agua_e_fundo(it, -H, YO, H, H)
    deck(it, cb.quadrado(-H, YO, H, H), juntas_x=(-3.75, 3.75), juntas_y=(2.0,))
    estacas(it, [(x, y) for x in (-5.6, 0.0, 5.6) for y in (3.0, 6.6)])
    it.add(ae.poste(-6.2, -6.6, ang=90, braco=1.1, cor="branco"), ae.banco(3.0, -5.2, ang=180))
    it.add(ae.moita(6.4, -6.6, 0.0, esc=0.7))
    col = [((0, 0, Z_BASE_MAR), (Q, Q, Z_FUNDO_MAR - Z_BASE_MAR)), ((0, (-H + YO) / 2, Z_BASE_MAR), (Q, YO + H, -Z_BASE_MAR)),
           ((0, (YO + H) / 2, -E_DECK), (Q, H - YO, E_DECK))]
    return it, dict(rotulo="Acesso do píer do cruzeiro", grupo="pier_cruzeiro",
                    tags=["modular", "agua", "orla", "pier", "cruzeiro"], colisao=col)


def p_pier_acesso_areia():
    """Acesso do píer pela praia: o terreno da costa_areia_reta (mesmas bordas) com o deck do píer por cima, de ponta a
    ponta (apoiado na areia seca e em estacas no trecho molhado)."""
    import cenario_terreno as ct
    it0, op = ct.p_costa_areia("reta")
    it = mb.Item("pier_cruzeiro_acesso_areia")
    it.partes = it0.partes
    mb.transforma(it.partes[0], loc=(0, 0, -0.03))  # a areia seca desce 3 cm sob o deck (sem face no mesmo plano)
    it.malhas_colisao = getattr(it0, "malhas_colisao", [])
    deck(it, cb.quadrado(-H, -H, H, H), juntas_x=(-3.75, 3.75), juntas_y=(-3.75, 0.0, 3.75))
    estacas(it, [(x, y) for x in (-5.6, 0.0, 5.6) for y in (0.5, 4.5)])
    for x in (-H + 0.6, H - 0.6):
        it.add(mb.caixa(0.4, Q, 0.28, x=x, y=0, z=0.0, cor="amarelo", bisel=0.06, seg=2))
    it.add(poste_duplo(0.0, -3.0))
    col = op["colisao"] + [((0, 0, -E_DECK), (Q, Q, E_DECK))]
    return it, dict(rotulo="Acesso do píer do cruzeiro pela praia", grupo="pier_cruzeiro",
                    tags=["modular", "agua", "praia", "pier", "cruzeiro"], colisao=col)


def bordas_pier(it, x_lado, y0, y1, sinal):
    """Meio-fio baixo, cabeços e defensas ao longo da borda x = x_lado (sinal = lado da água)."""
    it.add(mb.caixa(0.4, y1 - y0, 0.28, x=x_lado - sinal * 0.2, y=(y0 + y1) / 2, z=0.0, cor="amarelo", bisel=0.06,
                    seg=2))
    k = 0
    y = y0 + 3.75
    while y < y1 - 0.5:
        it.add(cabeco(x_lado - sinal * 1.0, y, 0.0))
        it.add(defensa(x_lado - sinal * 0.33, y + 1.6, eixo="y", L=1.6))
        y += 7.5
        k += 1


def p_pier():
    it = mb.Item("pier_cruzeiro")
    LX, LY = 30.0, 45.0
    agua_e_fundo(it, -LX / 2, -LY / 2, LX / 2, LY / 2)
    deck(it, cb.quadrado(-LX / 2, -LY / 2, LX / 2, LY / 2), juntas_x=(-7.5, 0.0, 7.5),
         juntas_y=[-LY / 2 + 7.5 * k for k in range(1, 6)])
    estacas(it, [(x, y) for x in (-13.5, -4.5, 4.5, 13.5) for y in (-18.75, -11.25, -3.75, 3.75, 11.25, 18.75)])
    bordas_pier(it, LX / 2, -LY / 2, LY / 2, 1)
    bordas_pier(it, -LX / 2, -LY / 2, LY / 2, -1)
    # faixa de pedestres amarela no meio e postes duplos
    it.add(cr.poli(cb.quadrado(-0.15, -LY / 2, 0.15, LY / 2), z=0.0, cor="amarelo", alt=0.003))
    for y in (-15.0, 0.0, 15.0):
        it.add(poste_duplo(-7.0, y), poste_duplo(7.0, y))
    # terminal na ponta da terra: prédio baixo de vidro com teto em onda e letreiro
    t = [mb.caixa(22.0, 8.0, 4.6, x=-1.0, y=-17.5, z=0.0, cor="branco", bisel=0.1)]
    t.append(cb.janelas(("y", -21.5, -1), -11.0, 9.0, 0.6, 4.2, 8, 1, moldura="turquesa_escuro", semente=21))
    t.append(cb.janelas(("y", -13.5, 1), -11.0, 9.0, 0.6, 4.2, 8, 1, moldura="turquesa_escuro", semente=22))
    onda = []
    for k in range(25):
        x = -13.0 + 26.0 * k / 24
        onda.append((x, 5.0 + 0.7 * math.sin(k / 24 * 2 * math.pi * 1.5)))
    teto = mb.extrudado(ae.ccw(onda[::-1] + [(-13.0, 4.0), (13.0, 4.0)]), 10.0, x=0, y=-22.5, z=0.0, cor="turquesa_claro",
                        bisel=0.06, plano="xz")
    mb.transforma(teto, loc=(-1.0, 0, 0))
    t.append(teto)
    for x in (-12.0, 10.0):
        t.append(mb.cilindro(0.25, 4.8, x=x, y=-22.0, z=0.0, cor="branco", seg=10, bisel=0.02))
    it.add(mb.junta(t, "terminal"))
    it.add(cnb.placa("cruzeiros", 11.0, 1.36, x=-1.0, y=-21.75, z=4.9, emissao=1.5, moldura="turquesa_escuro"))
    # passarela de embarque do lado +X: torre com escada e braço coberto até a borda
    tw = []
    tw.append(mb.caixa(3.2, 3.2, 9.0, x=9.5, y=11.0, z=0.0, cor="branco", bisel=0.08))
    tw.append(cb.janelas(("x", 11.1, 1), 9.6, 12.4, 1.0, 8.5, 1, 3, moldura="azul_medio", semente=31))
    tw.append(mb.caixa(4.2, 4.0, 0.3, x=9.5, y=11.0, z=9.0, cor="azul_medio", bisel=0.06))
    braco = mb.caixa(4.0, 2.6, 2.7, x=12.95, y=11.0, z=7.6, cor="branco", bisel=0.12)
    tw.append(braco)
    tw.append(mb.caixa(3.9, 2.64, 0.5, x=12.95, y=11.0, z=7.6, cor="azul_medio", bisel=0.05))
    for k in range(3):
        tw.append(mb.caixa(0.7, 0.06, 0.8, x=11.8 + 1.2 * k, y=9.7, z=8.6, cor=None, mat="janela_fria", bisel=0.02))
    tw.append(mb.caixa(0.2, 0.5, 7.6, x=14.6, y=11.0, z=0.0, cor="cinza_claro", bisel=0.02))
    it.add(mb.junta(tw, "passarela"))
    col = [((0, 0, Z_BASE_MAR), (LX, LY, Z_FUNDO_MAR - Z_BASE_MAR)), ((0, 0, -E_DECK), (LX, LY, E_DECK)),
           ((-1.0, -17.5, 0), (22.0, 8.0, 5.4)), ((9.5, 11.0, 0), (3.2, 3.2, 9.3)), ((12.95, 11.0, 7.6), (4.0, 2.6, 2.7))]
    return it, dict(rotulo="Píer do navio de cruzeiro (2 × 3)", grupo="pier_cruzeiro",
                    tags=["agua", "pier", "cruzeiro", "2x3"], colisao=col, dir_mini=DIR_MARCO,
                    extra={"quadras": [2, 3], "atracacao": {"lado": "x+", "x_casco": 15.0, "z_agua": Z_AGUA}})


def p_pier_ponta():
    it = mb.Item("pier_cruzeiro_ponta")
    LX, LY = 30.0, 15.0
    agua_e_fundo(it, -LX / 2, -LY / 2, LX / 2, LY / 2)
    R = 7.5
    pol = [(-LX / 2, -LY / 2), (LX / 2, -LY / 2), (LX / 2, -LY / 2 + 0.01)] + \
          [(LX / 2 - R + R * math.cos(math.radians(a)), -LY / 2 + 0.01 + R * math.sin(math.radians(a))) for a in range(0, 91, 10)] + \
          [(-LX / 2 + R + R * math.cos(math.radians(a)), -LY / 2 + 0.01 + R * math.sin(math.radians(a))) for a in range(90, 181, 10)]
    pol = cnb_ded(pol)
    deck(it, pol, juntas_x=(-7.5, 0.0, 7.5))
    estacas(it, [(x, y) for x in (-13.5, -4.5, 4.5, 13.5) for y in (-3.75,)] + [(-4.5, 3.0), (4.5, 3.0)])
    it.add(mb.caixa(0.4, 3.75, 0.28, x=LX / 2 - 0.2, y=-LY / 2 + 1.875, z=0.0, cor="amarelo", bisel=0.06, seg=2))
    it.add(mb.caixa(0.4, 3.75, 0.28, x=-LX / 2 + 0.2, y=-LY / 2 + 1.875, z=0.0, cor="amarelo", bisel=0.06, seg=2))
    it.add(cabeco(LX / 2 - 1.0, -LY / 2 + 3.75), cabeco(-LX / 2 + 1.0, -LY / 2 + 3.75))
    # guarda-corpo na curva da ponta
    curva = [(LX / 2 - R + (R - 0.3) * math.cos(math.radians(a)), -LY / 2 + (R - 0.3) * math.sin(math.radians(a)), 0.0)
             for a in range(5, 91, 5)] + [(x, LY / 2 - 0.3 - 0.0 + -0.01 * 0, 0.0) for x in ()] + \
            [(-LX / 2 + R + (R - 0.3) * math.cos(math.radians(a)), -LY / 2 + (R - 0.3) * math.sin(math.radians(a)), 0.0)
             for a in range(90, 176, 5)]
    it.add(ae.guarda_corpo(curva, alt=1.1, cor="branco"))
    # farolete de sinalização na ponta (pisca)
    it.add(mb.cilindro(0.5, 3.2, x=0, y=-LY / 2 + R - 1.4, z=0.0, cor="vermelho", seg=12, bisel=0.05))
    mb_ = mb.cilindro(0.5, 0.5, x=0, y=-LY / 2 + R - 1.4, z=1.2, cor="branco", seg=12, bisel=0.02)
    it.add(mb_)
    it.add(mb.cilindro(0.65, 0.15, x=0, y=-LY / 2 + R - 1.4, z=3.2, cor="grafite", seg=12, bisel=0.02))
    lamp = mb.esfera(0.32, x=0, y=-LY / 2 + R - 1.4, z=3.65, cor=None, mat="luz_vermelha", seg=10)
    it2 = ItemC("pier_cruzeiro_ponta")
    it2.partes = it.partes
    it2.anima(lamp, (0, -LY / 2 + R - 1.4, 3.65), {"anima": "piscar", "periodo": 2.0}, "farolete")
    it2.add(poste_duplo(-7.0, -3.5), poste_duplo(7.0, -3.5))
    col = [((0, 0, Z_BASE_MAR), (LX, LY, Z_FUNDO_MAR - Z_BASE_MAR)), ((0, -LY / 2 + R / 2, -E_DECK), (LX, R, E_DECK)),
           ((0, R / 2, -E_DECK), (LX - 2 * R, R, E_DECK))]
    return it2, dict(rotulo="Ponta do píer do cruzeiro (2 × 1)", grupo="pier_cruzeiro",
                     tags=["agua", "pier", "cruzeiro", "2x1", "animado"], colisao=col, dir_mini=DIR_MARCO,
                     extra={"quadras": [2, 1]})


def cnb_ded(pts, tol=1e-3):
    out = []
    for p in pts:
        if not out or abs(p[0] - out[-1][0]) > tol or abs(p[1] - out[-1][1]) > tol:
            out.append(p)
    if abs(out[0][0] - out[-1][0]) < tol and abs(out[0][1] - out[-1][1]) < tol:
        out.pop()
    return out


# ---------------------------------------------------------------------------------------------------- represa grande
R_REP = 220.0       # raio da crista (o centro da curva fica do lado de baixo, em −Y)
TETA = 16.0         # graus de cada trecho
Z_CRISTA = 40.0
Z_RES = 37.0        # lâmina d'água do reservatório (mar posto em z = 38 fica com a água aqui)
R_MONT = 4.0        # face de montante (vertical) a +4 m da linha da crista
R_JUS = 4.0         # a crista vai até −4 m; a face de jusante desce em curva até o pé a −26 m
R_PE = 26.0


def _polar(r, a):
    """Ponto do trecho: raio r a partir do centro da curva (0, −R_REP), ângulo a (graus, 0 = eixo +Y)."""
    t = math.radians(a)
    return (r * math.sin(t), -R_REP + r * math.cos(t))


def perfil_represa():
    """Corte (deslocamento radial em relação à linha da crista, z): de montante para jusante."""
    pts = [(R_MONT + 2.0, -0.4), (R_MONT + 1.2, 20.0), (R_MONT, Z_CRISTA - 1.2), (R_MONT, Z_CRISTA)]
    pts += [(-R_JUS, Z_CRISTA)]
    for k in range(1, 9):
        u = k / 8
        d = R_JUS + (R_PE - R_JUS) * u ** 1.6
        pts.append((-d, Z_CRISTA * (1 - u)))
    pts.append((-R_PE - 1.0, -0.4))
    return pts


def p_represa_trecho():
    it = mb.Item("represa_grande_trecho")
    a0, a1 = -TETA / 2, TETA / 2
    na = 16
    perfil = perfil_represa()
    m = ae.Malha()
    aneis = []
    for k in range(na + 1):
        a = a0 + (a1 - a0) * k / na
        aneis.append([m.v((*_polar(R_REP + d, a), z)) for d, z in perfil])
    npf = len(perfil)
    for k in range(na):
        for j in range(npf - 1):
            d, z = perfil[j]
            d2, z2 = perfil[j + 1]
            cor = "branco_gelo" if z > 0.5 or z2 > 0.5 else "concreto"
            if abs(z - Z_CRISTA) < 0.01 and abs(z2 - Z_CRISTA) < 0.01:
                cor = "concreto"
            m.f((aneis[k][j], aneis[k + 1][j], aneis[k + 1][j + 1], aneis[k][j + 1]), cor)
    for anel_, sg in ((aneis[0], 1), (aneis[-1], -1)):  # tampas (escondidas quando os trechos se encostam)
        pts3 = [v.co.copy() for v in anel_]
        m.poligono([tuple(p) for p in pts3], "concreto", normal=(0, 0, 0), plano=lambda p: (p[0] * 0 + math.hypot(p[0], p[1] + R_REP), p[2]))
    ob = m.obj("barragem")
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(ob.data)
    bm.free()
    it.add(ob)
    # nervuras (contrafortes) na face de jusante: duas por trecho, a ±TETA/4
    for a in (-TETA / 4, TETA / 4):
        nerv = []
        for d, z in perfil:
            pass
        prof = [(-R_JUS + 0.2, Z_CRISTA - 0.2)]
        for k in range(1, 9):
            u = k / 8
            dd = R_JUS + (R_PE - R_JUS) * u ** 1.6
            prof.append((-dd - 1.6, Z_CRISTA * (1 - u) + 0.3))
        prof.append((-R_PE - 2.4, -0.4))
        prof += [(-R_PE + 2.0, -0.4)]
        sec = [(p[0], p[1]) for p in prof]
        sec2 = ae.ccw([(dd, z) for dd, z in sec])
        cf = mb.extrudado(sec2, 3.2, x=0, y=0, z=0, cor="branco", bisel=0.25, plano="yz")
        # extrudado "yz": contorno (y, z), extrusão em x de 0 a 3,2 → centra e leva ao ângulo a
        mb.transforma(cf, loc=(-1.6, 0, 0))
        M = Matrix.Translation((*_polar(R_REP, a), 0)) @ Matrix.Rotation(-math.radians(a), 4, "Z")
        cf.data.transform(M)
        it.add(cf)
        # luzinha no alto de cada contraforte
        lx, ly = _polar(R_REP - R_JUS - 1.0, a)
        it.add(mb.caixa(0.8, 0.8, 0.2, x=lx, y=ly, z=Z_CRISTA - 1.6, cor=None, mat="luz", bisel=0.05))
    # crista: pista, guarda-corpos e postes
    ca = []
    for k in range(na + 1):
        a = a0 + (a1 - a0) * k / na
        ca.append(a)
    for d, nome in ((R_MONT - 0.2, "parapeito_m"), (-R_JUS + 0.2, "parapeito_j")):
        pts = [(*_polar(R_REP + d, a), Z_CRISTA) for a in ca]
        it.add(mb.tubo([(p[0], p[1], p[2] + 1.0) for p in pts], 0.2, cor="branco", seg=6, raio_curva=0.1))
        seg_ = []
        for a in ca[:-1]:
            am = a + (a1 - a0) / na / 2
            x, y = _polar(R_REP + d, am)
            seg_.append(mb.caixa(0.35, 0.35, 1.0, x=x, y=y, z=Z_CRISTA, cor="branco", bisel=0.05))
        it.add(mb.junta(seg_, nome + "_pilares"))
    pista = [_polar(R_REP + 2.6, a) for a in ca] + [_polar(R_REP - 2.6, a) for a in ca[::-1]]
    it.add(ae.prisma([pista], Z_CRISTA - 0.2, Z_CRISTA + 0.02, "asfalto", nome="pista"))
    it.add(cb.faixa([_polar(R_REP, a) for a in ca], larg=0.15, cor="amarelo", z=Z_CRISTA + 0.02, tracejada=(2.5, 2.5)))
    for a in (0.0,):
        x, y = _polar(R_REP + R_MONT - 0.6, a)
        it.add(ae.poste(x, y, z0=Z_CRISTA, ang=-90, braco=1.4, alt=5.0, cor="branco"))
    # reservatório: lâmina d'água a montante (faixa de 26 m) com fundo
    res = [_polar(R_REP + R_MONT - 0.1, a) for a in ca] + [_polar(R_REP + 30.0, a) for a in ca[::-1]]
    it.add(ae.prisma([res], Z_RES - 0.9, Z_RES - 0.7, "agua_funda", nome="fundo_reservatorio"))
    m2 = ae.Malha()
    m2.poligono([(p[0], p[1], Z_RES) for p in res], "m:agua")
    it.add(m2.obj("agua"))
    # colisão: caixas ao longo da curva (aproximação)
    col = []
    for a in (-TETA * 3 / 8, -TETA / 8, TETA / 8, TETA * 3 / 8):
        for d, l_, z0, h in ((0.0, 8.0, -0.4, Z_CRISTA + 0.4), (-11.0, 14.0, -0.4, 22.0), (-21.0, 10.0, -0.4, 8.0)):
            x, y = _polar(R_REP + d, a)
            corda = 2 * (R_REP + d) * math.sin(math.radians(TETA / 8))
            col.append(((round(x, 3), round(y, 3), z0), (corda, l_, h)))
    return it, dict(rotulo="Represa grande: trecho em curva (16°)", grupo="represa_grande",
                    tags=["agua", "represa", "grande", "modular", "curva"], colisao=col, dir_mini=DIR_MARCO,
                    colisao_plana=False, extra=extra_represa())


def extra_represa():
    """Montagem de referência: 4 trechos e 2 torres, com o centro da represa (meio da crista) na origem."""
    mont = []
    for k, a in enumerate((-24.0, -8.0, 8.0, 24.0)):
        x, y = _polar(R_REP, a)
        mont.append({"i": "represa_grande_trecho", "p": [round(x, 3), round(y + R_REP - R_REP, 3), 0.0], "r": round(-a, 3)})
    for s in (-1, 1):
        a = s * (32.0 + math.degrees(R_TORRE_ENC / R_REP))
        x, y = _polar(R_REP, a)
        mont.append({"i": "represa_grande_torre", "p": [round(x, 3), round(y, 3), 0.0], "r": round(-a, 3)})
    return {"r_crista": R_REP, "angulo": TETA, "z_crista": Z_CRISTA, "z_agua": Z_RES, "montagem": mont,
            "encaixe": f"trecho k: p = (R·sen a, R·cos a − R), r = −a, com R = {R_REP} e a = ±8°, ±24°…; a origem de "
                       "cada trecho fica no meio da crista dele (o centro da curva está em (0, −R)); torre em "
                       f"a = ±(32° + {round(math.degrees(R_TORRE_ENC / R_REP), 3)}°)"}


R_TORRE = 15.0
R_TORRE_ENC = 12.5  # o centro da torre fica a 12,5 m do fim da crista, ao longo da curva


def p_represa_torre():
    """Torre redonda da ponta da represa: base larga, corpo com pilastras, anel de arcos e a bacia d'água no alto.
    A origem fica no centro; a crista chega pelo lado −X (com a montagem de extra_represa, a torre gira junto)."""
    it = mb.Item("represa_grande_torre")
    R = R_TORRE
    it.add(mb.torno([(0, -0.4), (R + 1.5, -0.4), (R + 1.5, 1.0), (R + 0.8, 3.0), (R, 6.0), (R, Z_CRISTA + 2.0),
                     (R + 0.6, Z_CRISTA + 2.6), (R + 0.6, Z_CRISTA + 3.6), (R - 0.6, Z_CRISTA + 3.6),
                     (R - 0.6, Z_CRISTA + 6.0), (R - 0.2, Z_CRISTA + 6.4), (R - 0.2, Z_CRISTA + 7.4),
                     (R - 1.6, Z_CRISTA + 7.4), (R - 1.6, Z_CRISTA + 4.0), (0, Z_CRISTA + 4.0)],
                    cor="branco_gelo", seg=56, angulo=30))
    for k in range(20):  # pilastras
        a = 2 * math.pi * k / 20
        p = mb.caixa(1.2, 0.6, Z_CRISTA - 4.0, cor="branco", bisel=0.1)
        mb.transforma(p, loc=(R * math.cos(a), R * math.sin(a), 5.0), rot=("Z", math.degrees(a) + 90))
        it.add(p)
    for k in range(16):  # arcos escuros no anel de cima (com luz por dentro à noite)
        a = 2 * math.pi * (k + 0.5) / 16
        p = mb.caixa(1.6, 0.4, 1.7, cor=None, mat="janela", bisel=0.2)
        mb.transforma(p, loc=((R - 0.5) * math.cos(a), (R - 0.5) * math.sin(a), Z_CRISTA + 4.3),
                      rot=("Z", math.degrees(a) + 90))
        it.add(p)
    it.add(anel(R + 0.62, Z_CRISTA + 3.1, 0.1, mat="luz", n=56))
    # bacia d'água no alto
    m = ae.Malha()
    m.poligono([(r_ * math.cos(2 * math.pi * k / 48), r_ * math.sin(2 * math.pi * k / 48), Z_CRISTA + 6.6)
                for k in range(48) for r_ in (R - 1.65,)], "m:agua")
    it.add(m.obj("agua_torre"))
    it.add(mb.cilindro(R - 1.65, 0.2, z=Z_CRISTA + 5.5, cor="agua_funda", seg=48, bisel=0))
    # porta no pé, do lado de jusante
    it.add(mb.caixa(3.0, 1.2, 4.2, x=0, y=-R - 0.6, z=0.0, cor="azul_noite", bisel=0.4))
    it.add(mb.caixa(4.0, 1.6, 0.3, x=0, y=-R - 0.9, z=4.4, cor="branco", bisel=0.08))
    it.add(mb.caixa(2.4, 0.06, 0.14, x=0, y=-R - 1.7, z=4.25, cor=None, mat="luz", bisel=0.02))
    col = [((0, 0, -0.4), (2 * R, 2 * R, Z_CRISTA + 7.8)), ((0, 0, -0.4), (2 * R + 3, 2 * R + 3, 1.4))]
    return it, dict(rotulo="Represa grande: torre redonda", grupo="represa_grande",
                    tags=["agua", "represa", "grande", "torre"], colisao=col, dir_mini=DIR_MARCO, colisao_plana=False,
                    extra={"raio": R, "z_topo": Z_CRISTA + 7.4})


# ---------------------------------------------------------------------------------------------------- farol
def p_farol():
    it = ItemC("farol")
    # base de pedra octogonal e casinha do faroleiro
    it.add(mb.extrudado(mb.poligono(8, 5.2, rot=math.pi / 8), 1.0, z=-0.4, cor="cinza_claro", bisel=0.12))
    it.add(mb.extrudado(mb.poligono(8, 4.6, rot=math.pi / 8), 0.3, z=0.6, cor="concreto", bisel=0.06))
    perfil = [(2.2, 0.9), (2.0, 6.0), (1.75, 12.0), (1.55, 17.5)]
    torre = mb.torno([(0, 0.9)] + perfil + [(0, 17.5)], cor="branco", seg=28, angulo=40)
    mb.pinta_onde(torre, "vermelho", lambda c, n: (4.0 < c.z < 7.0) or (10.0 < c.z < 13.0))
    it.add(torre)
    for k in range(3):  # janelinhas em espiral
        a = 2.1 * k
        z = 4.0 + 4.3 * k
        r = 2.05 - 0.08 * k
        j = mb.caixa(0.5, 0.14, 0.8, cor=None, mat="janela", bisel=0.05)
        mb.transforma(j, loc=(r * math.cos(a - math.pi / 2), r * math.sin(a - math.pi / 2), z), rot=("Z", math.degrees(a)))
        it.add(j)
    it.add(mb.cilindro(0.55, 1.6, x=0, y=-2.15, z=0.9, cor="vermelho_escuro", eixo="z", seg=10, bisel=0.06))
    it.add(mb.cilindro(2.6, 0.35, z=17.5, cor="grafite", seg=28, bisel=0.06))
    gc = [(2.45 * math.cos(2 * math.pi * k / 24), 2.45 * math.sin(2 * math.pi * k / 24), 17.85) for k in range(25)]
    it.add(ae.guarda_corpo(gc, alt=0.9, passo=0.7, cor="branco", travessas=(0.45,)))
    it.add(mb.cilindro(1.35, 0.6, z=17.85, cor="vermelho", seg=20, bisel=0.04))
    it.add(mb.cilindro(1.3, 2.0, z=18.45, cor=None, mat="vidro", seg=20, bisel=0.02))
    for k in range(8):
        a = 2 * math.pi * k / 8
        it.add(mb.cilindro(0.05, 2.0, x=1.3 * math.cos(a), y=1.3 * math.sin(a), z=18.45, cor="grafite", seg=6, bisel=0))
    it.add(mb.torno([(1.55, 20.45), (1.4, 20.75), (0.8, 21.6), (0.2, 22.0), (0, 22.1)], cor="vermelho", seg=20))
    it.add(mb.cilindro(1.55, 0.1, z=20.4, cor="grafite", seg=20, bisel=0.02))
    it.add(mb.cilindro(0.05, 0.9, z=22.0, cor="grafite", seg=6, bisel=0), mb.esfera(0.12, z=22.95, cor="grafite", seg=8))
    # lanterna giratória: lâmpada e duas lentes que acendem
    lt = [mb.cilindro(0.35, 1.2, z=18.85, cor="latao", seg=10, bisel=0.02),
          mb.esfera(0.42, z=19.5, cor=None, mat="luz", seg=12)]
    for sx in (-1, 1):
        lt.append(mb.cilindro(0.55, 0.12, x=sx * 0.5, z=19.5, cor=None, mat="luz", seg=14, bisel=0.02, eixo="x"))
    it.anima(lt, (0, 0, 19.0), {"anima": "girar", "eixo": "y", "velocidade": 60.0}, "lanterna")
    # casinha
    c = [mb.caixa(4.4, 3.4, 2.8, x=3.6, y=0.5, z=0.9, cor="branco", bisel=0.08)]
    tel = mb.extrudado([(-2.5, 0), (2.5, 0), (0, 1.6)], 3.8, x=3.6, y=0.5 - 1.9, z=3.7, cor="vermelho", bisel=0.05,
                       plano="xz")
    c.append(tel)
    c.append(mb.caixa(0.9, 0.1, 1.9, x=4.6, y=0.5 - 1.72, z=0.9, cor="azul_marinho", bisel=0.03))
    c.append(mb.caixa(0.8, 0.1, 0.8, x=2.6, y=0.5 - 1.72, z=1.9, cor=None, mat="janela", bisel=0.03))
    it.add(mb.junta(c, "casinha"))
    col = [((0, 0, -0.4), (10.4, 10.4, 1.3)), ((0, 0, 0.9), (4.4, 4.4, 17.0)), ((3.6, 0.5, 0.9), (4.4, 3.4, 4.4))]
    return it, dict(rotulo="Farol de costa", grupo="farol", tags=["marco", "farol", "costa", "animado"], colisao=col,
                    dir_mini=DIR_MARCO, colisao_plana=False, extra={"lote": None} if False else None)


PECAS = [
    ("observatorio", p_observatorio),
    ("estadio", p_estadio),
    ("aeroporto_hangar", p_aeroporto),
    ("pier_cruzeiro_acesso", p_pier_acesso),
    ("pier_cruzeiro_acesso_areia", p_pier_acesso_areia),
    ("pier_cruzeiro", p_pier),
    ("pier_cruzeiro_ponta", p_pier_ponta),
    ("represa_grande_trecho", p_represa_trecho),
    ("represa_grande_torre", p_represa_torre),
    ("farol", p_farol),
]
