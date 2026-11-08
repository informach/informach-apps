"""Prédios-marco e efeitos do cenário: delegacia, quartel de bombeiros, prédio-aquário, hospital, lanchonete 24 horas,
shopping, academia azul, apartamentos de tijolo em U, torre com quadra de basquete no telhado, sala de enigmas, torre do
telão sorridente, placa flutuante de quebra-cabeça, praça do cristal e o efeito de fumaça e fogo de churrasqueira.

Prédios: origem no centro do lote, base em z = 0, frente para −Y; extra {"lote", "andares", "estilo": "regular"} (a
base dá as janelas coloridas e a colisão do térreo).
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
from cenario_base import H, Q, ItemC

V = Vector
DIR_PREDIO = (0.55, -1.0, 0.5)
AND = cb.ANDAR


def bloco(l, p, a, x=0.0, y=0.0, z=0.0, cor="branco", bisel=0.12):
    return mb.caixa(l, p, a, x=x, y=y, z=z, cor=cor, bisel=bisel)


def cornija(l, p, z, x=0.0, y=0.0, cor="branco", a=0.35, saliente=0.25):
    return mb.caixa(l + 2 * saliente, p + 2 * saliente, a, x=x, y=y, z=z, cor=cor, bisel=0.08)


def platibanda(l, p, z, x=0.0, y=0.0, cor="branco", a=0.8, e=0.25):
    objs = [mb.caixa(l, e, a, x=x, y=y - p / 2 + e / 2, z=z, cor=cor, bisel=0.06),
            mb.caixa(l, e, a, x=x, y=y + p / 2 - e / 2, z=z, cor=cor, bisel=0.06),
            mb.caixa(e, p - 2 * e, a, x=x - l / 2 + e / 2, y=y, z=z, cor=cor, bisel=0.06),
            mb.caixa(e, p - 2 * e, a, x=x + l / 2 - e / 2, y=y, z=z, cor=cor, bisel=0.06)]
    return mb.junta(objs, "platibanda")


def porta_vidro(x, y, z=0.0, l=2.4, a=2.6, moldura="grafite"):
    return mb.junta([mb.caixa(l + 0.24, 0.18, a + 0.12, x=x, y=y + 0.02, z=z, cor=moldura, bisel=0.03),
                     mb.caixa(l, 0.06, a, x=x, y=y - 0.06, z=z, cor=None, mat="vidro", bisel=0.01),
                     mb.caixa(0.06, 0.08, a, x=x, y=y - 0.08, z=z, cor=moldura, bisel=0)], "porta_vidro")


def marquise(l, p, x, y, z, cor="branco", luz=True):
    o = [mb.caixa(l, p, 0.25, x=x, y=y, z=z, cor=cor, bisel=0.08)]
    if luz:
        o.append(mb.caixa(l * 0.7, 0.05, 0.08, x=x, y=y - p / 2 + 0.2, z=z - 0.06, cor=None, mat="luz", bisel=0.01))
    return mb.junta(o, "marquise")


def tubo_neon(pts, r=0.09, mat="neon_rosa", nome="neon"):
    return mb.tubo(pts, r, cor=None, mat=mat, seg=6, raio_curva=0.0, nome=nome)


def extra_predio(lote, andares):
    return {"lote": list(lote), "andares": andares, "estilo": "regular"}


# ---------------------------------------------------------------------------------------------------- delegacia
def p_delegacia():
    it = ItemC("delegacia")
    L, P = 12.4, 9.6
    y0 = 1.2
    yf = y0 - P / 2
    zt = 4.0
    ztot = zt + 2 * AND
    it.add(bloco(L, P, ztot, y=y0, cor="azul_medio"))
    it.add(mb.caixa(L + 0.1, P + 0.1, 0.9, y=y0, z=0.0, cor="cinza_claro", bisel=0.05))
    it.add(cornija(L, P, zt - 0.2, y=y0, cor="branco", a=0.3, saliente=0.12))
    it.add(cornija(L, P, ztot, y=y0, cor="branco", a=0.4, saliente=0.22))
    it.add(platibanda(L, P, ztot + 0.4, y=y0, cor="branco", a=0.6))
    it.add(cb.janelas(("y", yf, -1), -L / 2 + 0.6, L / 2 - 0.6, zt + 0.2, ztot - 0.2, 5, 2, moldura="branco", semente=3))
    it.add(cb.janelas(("y", y0 + P / 2, 1), -L / 2 + 0.6, L / 2 - 0.6, 1.0, ztot - 0.2, 5, 3, moldura="branco", semente=4))
    for sx in (-1, 1):
        it.add(cb.janelas(("x", sx * L / 2, sx), y0 - P / 2 + 0.6, y0 + P / 2 - 0.6, 1.0, ztot - 0.2, 3, 3,
                          moldura="branco", semente=5 + sx))
    # térreo da frente: vitrines laterais e a entrada no meio com colunas e frontão
    it.add(cb.janelas(("y", yf, -1), -L / 2 + 0.6, -2.4, 1.0, zt - 0.4, 2, 1, larg=0.8, alt=0.7, moldura="branco",
                      semente=8))
    it.add(cb.janelas(("y", yf, -1), 2.4, L / 2 - 0.6, 1.0, zt - 0.4, 2, 1, larg=0.8, alt=0.7, moldura="branco",
                      semente=9))
    it.add(porta_vidro(0, yf, 0.45, l=2.6, a=2.8))
    for k in range(3):  # degraus
        it.add(mb.caixa(4.6 - 0.4 * k, 0.4, 0.15 * (k + 1), y=yf - 1.2 + 0.4 * k, z=0.0, cor="concreto", bisel=0.03))
    for sx in (-1.9, 1.9):
        it.add(mb.cilindro(0.22, zt - 0.45, x=sx, y=yf - 1.0, z=0.45, cor="branco", seg=12, bisel=0.03))
    it.add(marquise(4.8, 1.8, 0, yf - 0.8, zt - 0.45, cor="branco"))
    it.add(cnb.placa("policia", 5.6, 1.4, x=0, y=yf - 0.12, z=zt + 2 * AND - 1.95, emissao=1.6, moldura="azul_escuro"))
    # brasão: estrela dourada acima da porta
    est = [(0.7 * (1 if k % 2 == 0 else 0.42) * math.cos(math.pi / 2 + k * math.pi / 5),
            0.7 * (1 if k % 2 == 0 else 0.42) * math.sin(math.pi / 2 + k * math.pi / 5)) for k in range(10)]
    e = mb.extrudado(est, 0.12, cor="ouro", bisel=0.03, plano="xz")
    mb.transforma(e, loc=(0, yf - 0.95, zt + 0.15))
    it.add(e)
    # giroflex no teto (pisca), antena e mastro com bandeira
    it.add(mb.caixa(2.2, 0.6, 0.3, x=3.5, y=yf + 1.2, z=ztot + 0.4, cor="grafite", bisel=0.05))
    it.anima([mb.caixa(0.9, 0.5, 0.35, x=3.05, y=yf + 1.2, z=ztot + 0.7, cor=None, mat="luz_azul", bisel=0.08)],
             (3.05, yf + 1.2, ztot + 0.7), {"anima": "piscar", "periodo": 0.8}, "giroflex_azul")
    it.anima([mb.caixa(0.9, 0.5, 0.35, x=3.95, y=yf + 1.2, z=ztot + 0.7, cor=None, mat="luz_vermelha", bisel=0.08)],
             (3.95, yf + 1.2, ztot + 0.7), {"anima": "piscar", "periodo": 0.8, "atraso": 0.4}, "giroflex_vermelho")
    it.add(mb.cilindro(0.05, 4.0, x=-4.5, y=y0 + 2.0, z=ztot + 0.4, cor="metal", seg=6, bisel=0))
    it.add(mb.cilindro(0.07, 9.0, x=-5.4, y=yf - 1.4, z=0.0, cor="metal_claro", seg=8, bisel=0))
    band = mb.caixa(1.8, 0.04, 1.1, x=-4.45, y=yf - 1.4, z=7.6, cor="azul", bisel=0.01)
    it.add(band, mb.caixa(0.8, 0.05, 0.5, x=-4.45, y=yf - 1.42, z=7.9, cor="branco", bisel=0.01))
    for x in (-3.2, 3.2):
        it.add(ae.moita(x * 1.6, yf - 0.9, 0.0, esc=0.6))
    return it, dict(rotulo="Delegacia de bairro", grupo="delegacia", tags=["predio", "regular", "delegacia", "policia"],
                    colisao=[((0, y0, 0), (L, P, ztot + 1.0))], dir_mini=DIR_PREDIO, colisao_plana=False,
                    extra=extra_predio((1, 1), 3))


# ---------------------------------------------------------------------------------------------------- bombeiros
def hidrante(z0, esc=1.0, cor="vermelho"):
    """Hidrante gigante (torno + bocais laterais + tampa)."""
    s = esc
    o = [mb.torno([(0, 0), (1.3 * s, 0), (1.3 * s, 0.35 * s), (0.95 * s, 0.5 * s), (0.9 * s, 3.4 * s), (1.15 * s, 3.55 * s),
                   (1.15 * s, 3.9 * s), (0.85 * s, 4.1 * s), (0.6 * s, 4.9 * s), (0.25 * s, 5.2 * s), (0.3 * s, 5.5 * s),
                   (0, 5.6 * s)], cor=cor, seg=24, angulo=40)]
    for sx in (-1, 1):
        b = mb.cilindro(0.42 * s, 0.7 * s, x=sx * (0.9 * s + 0.35 * s), z=2.4 * s, cor=cor, seg=16, bisel=0.05, eixo="x")
        t = mb.cilindro(0.5 * s, 0.18 * s, x=sx * (0.9 * s + 0.75 * s), z=2.4 * s, cor="ouro", seg=6, bisel=0.03, eixo="x")
        o += [b, t]
    o.append(mb.cilindro(0.55 * s, 0.6 * s, y=-(0.9 * s + 0.3 * s), z=1.6 * s, cor=cor, seg=16, bisel=0.05, eixo="y"))
    o.append(mb.cilindro(0.62 * s, 0.18 * s, y=-(0.9 * s + 0.62 * s), z=1.6 * s, cor="ouro", seg=6, bisel=0.03, eixo="y"))
    o.append(mb.cilindro(0.97 * s, 0.25 * s, z=3.0 * s, cor="amarelo", seg=24, bisel=0.04))
    ob = mb.junta(o, "hidrante")
    mb.transforma(ob, loc=(0, 0, z0))
    return ob


def p_bombeiros():
    it = ItemC("quartel_bombeiros")
    L, P = 27.0, 12.4
    y0 = 0.6
    yf = y0 - P / 2
    zg, za = 5.2, 3.4
    ztot = zg + za
    xs_portas = [-8.0, -2.8, 2.4]
    lp, ap = 4.4, 4.5
    # parede da frente com 3 vãos (garagem oca por dentro)
    furos = [[(x - lp / 2, 0.0), (x + lp / 2, 0.0), (x + lp / 2, ap), (x - lp / 2, ap)] for x in xs_portas]
    frente = [(-L / 2, 0.0), (L / 2, 0.0), (L / 2, zg), (-L / 2, zg)]
    it.add(ae.prisma_xz([frente] + furos, yf, yf + 0.4, "vermelho", nome="frente_garagem"))
    it.add(bloco(L, P - 0.4, zg, y=y0 + 0.2, cor="vermelho", bisel=0.0))  # resto do corpo (atrás da garagem)
    g = mb.caixa(17.6, 7.6, zg - 0.4, x=-2.8, y=yf + 4.2, z=0.02, cor="grafite", bisel=0.0)  # interior escuro
    it.add(g)
    it.add(mb.caixa(17.2, 7.2, 0.04, x=-2.8, y=yf + 4.2, z=0.03, cor="concreto_escuro", bisel=0))
    for x in xs_portas:  # molduras amarelas dos vãos
        it.add(ae.prisma_xz([[(x - lp / 2 - 0.25, 0.0), (x + lp / 2 + 0.25, 0.0), (x + lp / 2 + 0.25, ap + 0.25),
                              (x - lp / 2 - 0.25, ap + 0.25)], furos[xs_portas.index(x)]], yf - 0.1, yf + 0.01,
                             "amarelo", nome="moldura"))
    # andar de cima laranja com faixa amarela entre os andares
    it.add(bloco(L, P, za, y=y0, z=zg, cor="laranja", bisel=0.1))
    it.add(mb.caixa(L + 0.12, P + 0.12, 0.45, y=y0, z=zg - 0.2, cor="amarelo", bisel=0.06))
    it.add(cornija(L, P, ztot, y=y0, cor="vermelho_escuro", a=0.35, saliente=0.15))
    it.add(platibanda(L, P, ztot + 0.35, y=y0, cor="vermelho", a=0.7))
    it.add(cb.janelas(("y", yf, -1), -L / 2 + 0.8, L / 2 - 0.8, zg + 0.3, ztot - 0.2, 8, 1, moldura="branco", semente=11))
    it.add(cb.janelas(("y", y0 + P / 2, 1), -L / 2 + 0.8, L / 2 - 0.8, 1.0, ztot - 0.2, 8, 2, moldura="branco", semente=12))
    it.add(cb.janelas(("x", -L / 2, -1), y0 - P / 2 + 0.8, y0 + P / 2 - 0.8, 1.0, ztot - 0.2, 3, 2, moldura="branco",
                      semente=13))
    # escritório à direita: porta e janela grande
    it.add(porta_vidro(8.6, yf, 0.0, l=1.8, a=2.6))
    it.add(cb.janelas(("y", yf, -1), 10.2, 13.0, 0.9, 3.8, 1, 1, larg=0.85, alt=0.8, moldura="branco", semente=14))
    it.add(marquise(3.2, 1.2, 8.6, yf - 0.6, 3.0, cor="amarelo"))
    # portões basculantes (o primeiro está aberto: pendurado no teto da garagem; o ângulo fecha)
    for k, x in enumerate(xs_portas):
        painel = [mb.caixa(lp - 0.1, 0.12, ap - 0.08, x=x, y=yf + 0.25, z=0.04, cor="cinza_claro", bisel=0.03)]
        for j in range(5):
            painel.append(mb.caixa(lp - 0.3, 0.05, 0.06, x=x, y=yf + 0.17, z=0.6 + j * 0.8, cor="metal", bisel=0))
        painel.append(cb.janelas(("y", yf + 0.18, -1), x - lp / 2 + 0.3, x + lp / 2 - 0.3, 3.1, 3.9, 4, 1, moldura="metal",
                                 semente=20 + k, peitoril=False))
        dob = (x, yf + 0.25, ap - 0.04)
        if k == 0:
            pj = mb.junta(painel, "painel")
            pj.data.transform(Matrix.Translation(V(dob)) @ Matrix.Rotation(math.radians(90), 4, "X") @
                              Matrix.Translation(-V(dob)))
            it.porta([pj], dob, eixo="x", angulo=-90, nome="portao_1")
        else:
            it.porta(painel, dob, eixo="x", lado="cima", abre_graus=90, nome=f"portao_{k + 1}")
        it.add(mb.caixa(lp, 0.6, 0.14, x=x, y=yf - 0.05, z=ap + 0.3, cor=None, mat="luz_vermelha", bisel=0.04))
    # letreiro, sirene, hidrante gigante no telhado e grafite na parede lateral
    it.add(cnb.placa("bombeiros", 7.4, 1.48, x=-2.8, y=yf - 0.12, z=zg + 0.75, emissao=1.6, moldura="vermelho_escuro"))
    it.add(hidrante(ztot + 0.05, esc=1.05))
    mb.transforma(it.partes[-1], loc=(-4.0, y0 + 1.0, 0))
    it.anima([mb.cilindro(0.35, 0.5, x=12.2, y=yf + 0.8, z=ztot + 0.35, cor=None, mat="luz_vermelha", seg=12, bisel=0.06)],
             (12.2, yf + 0.8, ztot + 0.35), {"anima": "piscar", "periodo": 0.7}, "sirene")
    mi = cnb.est("grafite_paz")
    xg = L / 2 + 0.012
    it.add(cnb.quad_uv([(xg, yf + 1.0, 0.6), (xg, y0 + P / 2 - 1.0, 0.6), (xg, y0 + P / 2 - 1.0, 5.7),
                        (xg, yf + 1.0, 5.7)], mi, nome="grafite"))
    for x in (6.2, 13.2):
        it.add(mb.cilindro(0.18, 0.9, x=x, y=yf - 0.6, z=0.0, cor="amarelo", seg=10, bisel=0.05))
    it.slot("garagem_1", (xs_portas[0], yf + 4.2, 0.03), (4.2, 7.0, 4.4))
    it.slot("garagem_2", (xs_portas[1], yf + 4.2, 0.03), (4.2, 7.0, 4.4))
    it.slot("garagem_3", (xs_portas[2], yf + 4.2, 0.03), (4.2, 7.0, 4.4))
    col = [((-2.8, yf + 0.2, 0), (L * 0.68, 0.4, zg)), ((-2.8, y0 + P / 2 - 0.8, 0), (17.6, 1.6, zg)),
           ((8.25, y0, 0), (L / 2 - 4.5 + 0.0, P, zg)), ((-12.3, y0, 0), (2.4, P, zg)), ((0, y0, zg), (L, P, za + 1.0)),
           ((-4.0, y0 + 1.0, ztot), (2.8, 2.8, 5.9))]
    return it, dict(rotulo="Quartel de bombeiros (2 × 1)", grupo="bombeiros",
                    tags=["predio", "regular", "bombeiros", "garagem", "interativo", "2x1"], colisao=col,
                    dir_mini=DIR_PREDIO, colisao_plana=False, extra=extra_predio((2, 1), 2))


# ---------------------------------------------------------------------------------------------------- prédio-aquário
def peixe(cor, cor2, esc=1.0, nome="peixe"):
    """Peixe redondinho de desenho próprio (frente para −Y): corpo, cauda, nadadeiras, olhos e listra."""
    s = esc
    o = [mb.superelipsoide(0.42 * s, 0.9 * s, 0.6 * s, z=-0.3 * s, cor=cor, e=0.9, e_v=0.9, nu=14, nv=8)]
    lst = mb.superelipsoide(0.44 * s, 0.16 * s, 0.62 * s, y=0.05 * s, z=-0.31 * s, cor=cor2, e=0.9, e_v=0.9, nu=12, nv=6)
    o.append(lst)
    cauda = mb.extrudado([(0.0, 0.0), (0.42 * s, 0.28 * s), (0.5 * s, 0.0), (0.42 * s, -0.28 * s)], 0.06 * s,
                         cor=cor2, bisel=0.02, plano="yz")
    mb.transforma(cauda, loc=(-0.03 * s, 0.4 * s, 0))
    o.append(cauda)
    dors = mb.extrudado([(-0.2 * s, 0.0), (0.15 * s, 0.0), (0.05 * s, 0.22 * s)], 0.05 * s, cor=cor2, bisel=0.015,
                        plano="yz")
    mb.transforma(dors, loc=(-0.025 * s, 0.0, 0.26 * s))
    o.append(dors)
    for sx in (-1, 1):
        o.append(mb.esfera(0.09 * s, x=sx * 0.17 * s, y=-0.25 * s, z=0.07 * s, cor="branco", seg=10))
        o.append(mb.esfera(0.05 * s, x=sx * 0.21 * s, y=-0.29 * s, z=0.07 * s, cor="preto", seg=8))
    return mb.junta(o, nome)


def p_aquario():
    it = ItemC("predio_aquario")
    L, P = 12.4, 11.0
    y0 = 1.6
    yf = y0 - P / 2
    zt = 4.4
    nand = 4
    ztot = zt + nand * AND
    it.add(bloco(L, P, ztot, y=y0, cor="azul_medio"))
    it.add(mb.caixa(L + 0.1, P + 0.1, zt, y=y0, z=0.0, cor="amarelo", bisel=0.1))
    it.add(cornija(L, P, ztot, y=y0, cor="amarelo", a=0.4, saliente=0.22))
    it.add(platibanda(L, P, ztot + 0.4, y=y0, cor="amarelo", a=0.7))
    for sx in (-1, 1):
        it.add(cb.janelas(("x", sx * L / 2, sx), y0 - P / 2 + 0.8, y0 + P / 2 - 0.8, zt + 0.2, ztot - 0.2, 3, nand,
                          moldura="amarelo_claro", semente=30 + sx))
    it.add(cb.janelas(("y", y0 + P / 2, 1), -L / 2 + 0.8, L / 2 - 0.8, zt + 0.2, ztot - 0.2, 4, nand,
                      moldura="amarelo_claro", semente=33))
    for sx in (-1, 1):  # colunas de janelas da frente ao lado do aquário
        it.add(cb.janelas(("y", yf, -1), sx * 5.3 - 0.6, sx * 5.3 + 0.6, zt + 0.2, ztot - 0.2, 1, nand,
                          moldura="amarelo_claro", semente=35 + sx))
    # aquário gigante saliente na fachada
    AW, AZ0, AZ1, AD = 8.4, zt + 0.6, ztot - 1.0, 1.8
    ya = yf - AD  # face de vidro
    cont = ae.ccw(mb.ret_arredondado(AW + 0.8, AZ1 - AZ0 + 0.8, 1.2, seg=8))
    furo = ae.ccw(mb.ret_arredondado(AW, AZ1 - AZ0, 0.9, seg=8))
    zc = (AZ0 + AZ1) / 2
    mold = ae.prisma_xz([[(x, z + zc) for x, z in cont], [(x, z + zc) for x, z in furo]], ya - 0.35, yf + 0.01, "branco",
                        nome="moldura_aquario")
    it.add(mold)
    it.add(ae.prisma_xz([[(x * 1.003, z * 1.003 + zc) for x, z in furo], [(x * 0.985, z * 0.985 + zc) for x, z in furo]],
                        ya - 0.38, ya - 0.3, "branco", nome="filete_base"))
    pts_neon = [(x * 1.02, ya - 0.4, z * 1.02 + zc) for x, z in furo]
    it.add(mb.tubo(pts_neon + [pts_neon[0]], 0.07, cor=None, mat="neon", seg=6, raio_curva=0.0, nome="filete_neon"))
    # interior: fundo azul, areia, pedras, bolhas; vidro na frente
    it.add(mb.caixa(AW, 0.1, AZ1 - AZ0, y=yf + 0.0, z=AZ0, cor="agua_rio", bisel=0))
    it.add(ae.prisma([[(x, y) for x, y in [(-AW / 2, ya), (AW / 2, ya), (AW / 2, yf), (-AW / 2, yf)]]], AZ0 - 0.1, AZ0 + 0.35,
                     "areia", nome="areia"))
    for x, h, c in ((-3.2, 0.9, "cinza"), (-2.4, 0.6, "cinza_claro"), (2.9, 1.1, "cinza_medio"), (3.6, 0.5, "cinza")):
        it.add(cnb.pedra_facetada(x, yf - 0.8, AZ0 + 0.2, 0.9, 0.8, h, cor=c, seed=int(x * 10)))
    for x, c in ((-1.0, "rosa"), (1.4, "laranja_claro")):  # corais
        for k in range(3):
            it.add(mb.cilindro(0.1, 0.7 + 0.25 * k, x=x + 0.25 * (k - 1), y=yf - 0.6, z=AZ0 + 0.3, cor=c, seg=6, bisel=0.04))
    for bx in (-2.6, 0.4, 3.3):  # colunas de bolhas
        for k in range(6):
            it.add(mb.esfera(0.08 + 0.025 * k, x=bx + 0.12 * math.sin(k), y=yf - 0.9, z=AZ0 + 1.0 + k * 0.9,
                             cor="branco_gelo", seg=8))
    # algas que balançam (cada uma um filho)
    for k, (x, h) in enumerate(((-3.7, 3.0), (-1.8, 2.2), (0.6, 3.4), (2.4, 2.6), (3.9, 3.2))):
        fol = []
        for j in range(4):
            fol.append(mb.superelipsoide(0.35, 0.12, h / 4 + 0.25, x=0.12 * math.sin(j * 1.7), z=j * h / 4,
                                         cor=["verde", "verde_claro", "verde_medio"][j % 3], e=0.8, e_v=0.7, nu=8, nv=5))
        alga = mb.junta(fol, f"alga_{k + 1}")
        mb.transforma(alga, loc=(x, yf - 0.45 - 0.25 * (k % 2), AZ0 + 0.3))
        it.anima(alga, (x, yf - 0.45 - 0.25 * (k % 2), AZ0 + 0.3),
                 {"anima": "balancar", "angulo": 9, "periodo": 2.6 + 0.4 * k, "eixo": "z"}, f"alga_{k + 1}")
    # peixes nadando (percurso fechado dentro do aquário)
    cores = [("laranja", "branco"), ("amarelo", "azul_celeste"), ("rosa", "branco"), ("azul_celeste", "amarelo")]
    for k, (c1, c2) in enumerate(cores):
        rx, rz = AW / 2 - 1.0 - 0.3 * k, (AZ1 - AZ0) / 2 - 1.3 - 0.4 * (k % 2)
        yy = yf - 0.55 - 0.35 * (k % 3)
        zc2 = zc + 0.3 * (k - 1.5)
        pts = []
        for j in range(32):
            t = 2 * math.pi * j / 32 * (1 if k % 2 == 0 else -1)
            pts.append((rx * math.cos(t), yy, zc2 + rz * math.sin(t) * (0.6 + 0.4 * math.sin(2 * t))))
        f = peixe(c1, c2, esc=0.9 + 0.15 * (k % 2), nome=f"peixe_{k + 1}")
        # o peixe nada de lado: a frente (−Y do peixe) aponta para a direção do percurso; começa no 1º ponto
        mb.transforma(f, rot=("Z", -90 if k % 2 == 0 else 90))
        mb.transforma(f, loc=pts[0])
        it.anima(f, pts[0], {"anima": "percurso", "pontos": cnb.gl_pts(pts), "velocidade": 0.7 + 0.15 * k,
                             "atraso": 0.0, "fechado": True}, f"peixe_{k + 1}")
    it.add(mb.junta([mb.extrudado(furo, 0.05, cor=None, mat="vidro", bisel=0.0, plano="xz")], "vidro"))
    mb.transforma(it.partes[-1], loc=(0, ya - 0.33, zc))
    # entrada e letreiro
    it.add(porta_vidro(0, yf, 0.0, l=3.0, a=3.0))
    it.add(marquise(5.2, 1.6, 0, yf - 0.8, 3.3, cor="azul_medio"))
    it.add(cnb.placa("aquario", 4.8, 1.2, x=0, y=yf - 0.12, z=zt - 0.7 + 0.0 - 0.6 + 0.6 - 0.6 + 0.7 - 0.7 + 3.6 - 3.6 + 3.45,
                     emissao=1.5, moldura="azul_escuro"))
    for sx in (-1, 1):
        it.add(cb.janelas(("y", yf, -1), sx * 4.4 - 1.4, sx * 4.4 + 1.4, 0.8, zt - 0.5, 1, 1, larg=0.85, alt=0.8,
                          moldura="branco", semente=40 + sx))
    # gôndola do limpador de janelas: suporte no teto, cabos e a gôndola que sobe e desce (deslizar)
    xg = 1.6
    yg = ya - 1.1
    for sx in (-1.6, 1.6):
        it.add(mb.caixa(0.25, 3.4, 0.25, x=xg + sx, y=yf - 0.6, z=ztot + 1.0, cor="metal_escuro", bisel=0.03))
        it.add(mb.caixa(0.25, 0.25, 1.0, x=xg + sx, y=yf + 0.9, z=ztot + 0.0, cor="metal_escuro", bisel=0.03))
        it.add(mb.cilindro(0.025, ztot + 1.0 - 2.4, x=xg + sx, y=yg, z=2.4, cor="grafite", seg=5, bisel=0))
    zg0 = 4.6
    gd = [mb.caixa(3.8, 0.9, 0.15, x=xg, y=yg, z=zg0, cor="amarelo", bisel=0.03)]
    for yy in (yg - 0.42, yg + 0.42):
        gd.append(mb.caixa(3.8, 0.06, 0.9, x=xg, y=yy, z=zg0 + 0.15, cor="amarelo_escuro", bisel=0.02))
    for sx in (-1.6, 1.6):
        gd.append(mb.caixa(0.08, 0.9, 1.1, x=xg + sx, y=yg, z=zg0 + 0.15, cor="metal", bisel=0.01))
        gd.append(mb.cilindro(0.08, 0.3, x=xg + sx, y=yg, z=zg0 + 1.25, cor="grafite", seg=8, bisel=0.02))
    gd.append(mb.cilindro(0.2, 0.35, x=xg - 1.0, y=yg, z=zg0 + 0.15, cor="azul", seg=10, bisel=0.03))
    rodo = mb.caixa(0.7, 0.06, 0.08, x=xg + 0.6, y=yg + 0.55, z=zg0 + 1.3, cor="grafite", bisel=0.01)
    gd.append(rodo)
    curso = AZ1 - 1.6 - zg0
    it.anima(gd, (xg, yg, zg0), {"anima": "deslizar", "eixo": "y", "curso": round(curso, 2), "periodo": 22.0,
                                 "perfil": "vaivem"}, "gondola")
    col = [((0, y0, 0), (L, P, ztot + 1.1)), ((0, (yf + ya) / 2 - 0.2, AZ0 - 0.4), (AW + 0.8, AD + 0.4, AZ1 - AZ0 + 0.8))]
    return it, dict(rotulo="Prédio-aquário", grupo="aquario", tags=["predio", "regular", "aquario", "animado"],
                    colisao=col, dir_mini=DIR_PREDIO, colisao_plana=False, extra=extra_predio((1, 1), nand + 1))


# ---------------------------------------------------------------------------------------------------- hospital
def p_hospital():
    it = ItemC("hospital")
    L, P = 20.0, 11.6
    y0 = 1.2
    xb = -4.6
    yf = y0 - P / 2
    zt = 4.4
    nand = 4
    ztot = zt + nand * AND
    it.add(bloco(L, P, ztot, x=xb, y=y0, cor="branco"))
    for k in range(nand + 1):  # faixas azuis entre os andares
        it.add(mb.caixa(L + 0.1, P + 0.1, 0.5, x=xb, y=y0, z=zt - 0.25 + k * AND, cor="azul" if k % 2 == 0 else "azul_celeste",
                        bisel=0.05))
    it.add(cornija(L, P, ztot, x=xb, y=y0, cor="azul_medio", a=0.4, saliente=0.2))
    it.add(platibanda(L, P, ztot + 0.4, x=xb, y=y0, cor="branco", a=0.7))
    it.add(cb.janelas(("y", yf, -1), xb - L / 2 + 0.8, xb + L / 2 - 0.8, zt + 0.3, ztot - 0.1, 7, nand, moldura="branco",
                      semente=51, apagadas=0.25, frias=0.5))
    it.add(cb.janelas(("y", y0 + P / 2, 1), xb - L / 2 + 0.8, xb + L / 2 - 0.8, zt + 0.3, ztot - 0.1, 7, nand, moldura="branco",
                      semente=52, frias=0.5))
    for sx in (-1, 1):
        it.add(cb.janelas(("x", xb + sx * L / 2, sx), y0 - P / 2 + 0.8, y0 + P / 2 - 0.8, zt + 0.3, ztot - 0.1, 4, nand,
                          moldura="branco", semente=53 + sx, frias=0.5))
    # térreo: entrada principal de vidro (esquerda) e entrada de ambulância coberta (direita)
    it.add(mb.caixa(10.0, 0.12, 3.4, x=-7.0, y=yf - 0.02, z=0.3, cor=None, mat="vidro", bisel=0.02))
    it.add(porta_vidro(-7.0, yf - 0.05, 0.3, l=3.0, a=2.8))
    it.add(marquise(10.6, 2.2, -7.0, yf - 1.1, 3.7, cor="azul_medio"))
    xa = 10.0  # entrada de ambulância: cobertura encostada na parede direita, aberta para a rua da frente
    x0c, x1c, y0c, y1c = xb + L / 2, 14.6, -7.2, 4.6
    cob = [mb.caixa(x1c - x0c, y1c - y0c, 0.5, x=(x0c + x1c) / 2, y=(y0c + y1c) / 2, z=4.6, cor="branco", bisel=0.12),
           mb.caixa(x1c - x0c + 0.1, 0.3, 0.6, x=(x0c + x1c) / 2, y=y0c - 0.1, z=4.5, cor="azul_medio", bisel=0.06)]
    for yy in (y0c + 0.6, 1.0 + 0.0, y1c - 0.6):
        cob.append(mb.cilindro(0.25, 4.6, x=x1c - 0.5, y=yy, z=0.0, cor="branco", seg=12, bisel=0.03))
    for k in range(3):
        cob.append(mb.caixa(1.6, 0.6, 0.05, x=(x0c + x1c) / 2, y=y0c + 2.0 + 3.6 * k, z=4.55, cor=None, mat="luz",
                            bisel=0.01))
    it.add(mb.junta(cob, "entrada_ambulancia"))
    it.add(mb.caixa(0.2, 4.0, 3.6, x=x0c + 0.06, y=0.0, z=0.0, cor="vermelho", bisel=0.04))
    it.add(mb.caixa(0.1, 3.6, 3.3, x=x0c + 0.16, y=0.0, z=0.05, cor=None, mat="vidro", bisel=0.01))
    for x in (x0c + 1.2, x1c - 1.2):
        it.add(cr.poli(cb.quadrado(x - 0.08, y0c + 0.2, x + 0.08, y1c - 0.4), z=0.0, cor="amarelo", alt=0.004))
    # letreiro no alto e cruzes luminosas
    it.add(cnb.placa("hospital", 9.0, 1.8, x=xb, y=yf - 0.25, z=ztot + 0.5, emissao=1.6, moldura="azul_medio"))

    def cruz(x, y, z, t, mat="luz_vermelha", eixo="y", esp=0.2):
        if eixo == "y":
            return mb.junta([mb.caixa(t, esp, t / 3, x=x, y=y, z=z - t / 6, cor=None, mat=mat, bisel=0.04),
                             mb.caixa(t / 3, esp, t, x=x, y=y, z=z - t / 2, cor=None, mat=mat, bisel=0.04)], "cruz")
        return mb.junta([mb.caixa(esp, t, t / 3, x=x, y=y, z=z - t / 6, cor=None, mat=mat, bisel=0.04),
                         mb.caixa(esp, t / 3, t, x=x, y=y, z=z - t / 2, cor=None, mat=mat, bisel=0.04)], "cruz")

    it.add(mb.caixa(2.4, 0.3, 2.4, x=(x0c + x1c) / 2, y=y0c - 0.1, z=5.1, cor="branco", bisel=0.15))
    it.add(cruz((x0c + x1c) / 2, y0c - 0.28, 7.3, 1.8))
    it.add(cruz(xb + L / 2 + 0.12, y0, ztot - 2.0, 2.2, eixo="x"))
    # heliponto no teto
    it.add(mb.cilindro(4.0, 0.25, x=xb - 4.5, y=y0 + 0.5, z=ztot, cor="grafite", seg=32, bisel=0.05))
    an_ = anel(3.6, ztot + 0.26, 0.08, cor="amarelo")
    mb.transforma(an_, loc=(xb - 4.5, y0 + 0.5, 0))
    it.add(an_)
    for xx, yy, ll, pp in ((xb - 5.6, y0 + 0.5, 0.4, 2.6), (xb - 3.4, y0 + 0.5, 0.4, 2.6), (xb - 4.5, y0 + 0.5, 1.8, 0.4)):
        it.add(mb.caixa(ll, pp, 0.03, x=xx, y=yy, z=ztot + 0.25, cor="branco", bisel=0))
    # ícone-pino com cruz, flutuando acima do teto e girando devagar
    zp = ztot + 9.0
    pino = [mb.torno([(0, -2.3), (0.35, -1.6), (1.15, -0.4), (1.55, 0.6), (1.5, 1.4), (1.0, 2.1), (0.4, 2.4), (0, 2.45)],
                     cor="branco", seg=28, esc=(1.0, 0.45))]
    pino.append(mb.cilindro(1.62, 0.25, z=0.4, cor="vermelho", seg=28, bisel=0.05))
    mb.transforma(pino[-1], esc=(1.0, 0.5, 1.0))
    for sy in (-1, 1):
        pino.append(cruz(0, sy * 0.72, 1.55, 1.5, esp=0.12))
    pin = mb.junta(pino, "pino")
    mb.transforma(pin, loc=(xb + 4.5, y0, zp))
    it.anima(pin, (xb + 4.5, y0, zp), {"anima": "girar", "eixo": "y", "velocidade": 25.0}, "pino_hospital")
    col = [((xb, y0, 0), (L, P, ztot + 1.1)), (((x0c + x1c) / 2, (y0c + y1c) / 2, 4.6), (x1c - x0c, y1c - y0c, 0.6)),
           ((x1c - 0.5, 0.0, 0), (0.5, y1c - y0c - 0.8, 4.6))]
    return it, dict(rotulo="Hospital (2 × 1)", grupo="hospital", tags=["predio", "regular", "hospital", "animado", "2x1"],
                    colisao=col, dir_mini=DIR_PREDIO, colisao_plana=False, extra=extra_predio((2, 1), nand + 1))


def anel(r, z, rt=0.08, cor="branco", n=48, mat="atlas"):
    pts = [(r * math.cos(2 * math.pi * k / n), r * math.sin(2 * math.pi * k / n), z) for k in range(n)]
    return mb.tubo(pts, rt, cor=cor if mat == "atlas" else None, mat=mat, seg=6, fechado=True, raio_curva=0.0)


# ---------------------------------------------------------------------------------------------------- lanchonete 24h
def digito(d, x0, z0, a=1.6, l=0.9):
    """Polilinhas de um algarismo (2 ou 4) em neon, no plano XZ."""
    if d == "2":
        pts = [(0, a * 0.8), (0.2 * l, a), (0.8 * l, a), (l, a * 0.8), (l, a * 0.62), (0, 0), (l, 0)]
        return [[(x0 + px, 0, z0 + pz) for px, pz in pts]]
    return [[(x0 + 0.75 * l, 0, z0), (x0 + 0.75 * l, 0, z0 + a)], [(x0 + 0.75 * l, 0, z0 + a), (x0, 0, z0 + a * 0.35),
                                                                   (x0 + l, 0, z0 + a * 0.35)]]


def p_lanchonete():
    it = ItemC("lanchonete_24h")
    R = 5.6
    zt = 4.6
    it.add(mb.cilindro(R + 0.4, 0.4, z=0.0, cor="concreto", seg=40, bisel=0.06))
    it.add(mb.cilindro(R, zt, z=0.4, cor="azul_celeste", seg=40, bisel=0.05))
    it.add(mb.cilindro(R + 0.05, 1.0, z=0.4, cor="azul", seg=40, bisel=0.04))
    it.add(mb.cilindro(R + 0.03, 2.2, z=1.6, cor=None, mat="janela", seg=40, bisel=0.02))
    for k in range(16):  # caixilhos
        a = 2 * math.pi * k / 16
        c = mb.caixa(0.12, 0.12, 2.3, cor="branco", bisel=0.02)
        mb.transforma(c, loc=((R + 0.05) * math.cos(a), (R + 0.05) * math.sin(a), 1.55))
        it.add(c)
    it.add(mb.cilindro(R + 0.9, 0.7, z=zt + 0.4, cor="branco", seg=40, bisel=0.15))
    it.add(anel(R + 0.95, zt + 0.75, 0.12, mat="neon_rosa", n=56))
    it.add(anel(R + 0.12, 1.45, 0.08, mat="neon", n=56))
    it.add(mb.cilindro(R - 0.3, 0.3, z=zt + 1.1, cor="azul", seg=40, bisel=0.06))
    # entrada na frente
    it.add(porta_vidro(0, -R - 0.05, 0.4, l=2.0, a=2.5))
    it.add(marquise(3.6, 1.6, 0, -R - 0.6, 3.2, cor="rosa"))
    it.add(cnb.placa("lanchonete", 4.8, 0.96, x=0, y=-R - 0.95, z=zt + 0.25 - 0.0 + 0.0 - 0.9 + 0.9 - 0.25 + 0.25,
                     emissao=2.0, moldura="azul_noite"))
    # copo de milkshake gigante no telhado
    z0 = zt + 1.4
    copo = mb.torno([(0, 0), (1.1, 0), (1.15, 0.2), (1.7, 3.4), (1.8, 3.55), (0, 3.55)], cor="rosa_claro", seg=28)
    mb.pinta_onde(copo, "rosa", lambda c, n: 0.9 < c.z < 1.6 or 2.4 < c.z < 3.0)
    mb.transforma(copo, loc=(0, 0.5, z0))
    it.add(copo)
    creme = [mb.superelipsoide(3.4 - 0.7 * k, 3.4 - 0.7 * k, 1.0, x=0, y=0.5, z=z0 + 3.35 + 0.65 * k, cor="branco", e=0.9,
                               e_v=0.8, nu=20, nv=8) for k in range(3)]
    it.add(*creme)
    it.add(mb.esfera(0.42, x=0.1, y=0.45, z=z0 + 5.6, cor="vermelho", seg=14))
    it.add(mb.tubo([(0.1, 0.45, z0 + 5.9), (0.1, 0.45, z0 + 5.95)], 0.03, cor="verde"))
    canudo = mb.tubo([(0.6, 0.6, z0 + 2.0), (0.9, 0.7, z0 + 6.6), (1.6, 0.8, z0 + 7.3)], 0.16, cor="branco", seg=8)
    mb.pinta_onde(canudo, "vermelho", lambda c, n: int(c.z * 2.5) % 2 == 0)
    it.add(canudo)
    # placa de seta gigante com garfo e "24" em neon que pisca
    xp, yp = -4.8, -6.6
    it.add(mb.cilindro(0.25, 9.0, x=xp, y=yp, z=0.0, cor="cinza_claro", seg=10, bisel=0.03))
    seta = [(-1.6, 0.0), (2.2, 0.0), (2.2, -0.8), (3.8, 0.9), (2.2, 2.6), (2.2, 1.8), (-1.6, 1.8)]
    sb = mb.extrudado(ae.ccw(seta), 0.4, cor="amarelo", bisel=0.1, plano="xz")
    mb.transforma(sb, loc=(xp - 1.0, yp - 0.2, 8.0))
    it.add(sb)
    bord = [(xp - 1.0 + x, yp - 0.42, 8.0 + z) for x, z in seta] + [(xp - 1.0 + seta[0][0], yp - 0.42, 8.0 + seta[0][1])]
    it.add(tubo_neon(bord, 0.07, mat="neon_rosa"))
    garfo = mb.junta([mb.caixa(0.16, 0.12, 1.4, x=0, z=0.0, cor="branco", bisel=0.03)] +
                     [mb.caixa(0.08, 0.12, 0.6, x=dx, z=1.4, cor="branco", bisel=0.02) for dx in (-0.22, 0, 0.22)] +
                     [mb.caixa(0.6, 0.12, 0.14, x=0, z=1.35, cor="branco", bisel=0.03)], "garfo")
    mb.transforma(garfo, loc=(xp - 2.0, yp - 0.45, 8.1))
    it.add(garfo)
    num = []
    for d, xx in (("2", 0.0), ("4", 1.2)):
        for pl in digito(d, xp - 1.3 + xx, 8.1):
            num.append(tubo_neon([(p[0], yp - 0.5, p[2]) for p in pl], 0.09, mat="neon"))
    it.anima(num, (xp, yp - 0.5, 9.0), {"anima": "piscar", "periodo": 1.2}, "numero_24")
    it.add(cnb.placa("aberto_24h", 4.6, 0.69, x=xp - 0.2, y=yp - 0.3, z=6.6, emissao=1.6, moldura="rosa_escuro"))
    col = [((0, 0, 0), (2 * R + 1.8, 2 * R + 1.8, zt + 1.4)), ((0, 0.5, zt + 1.4), (3.6, 3.6, 6.0)),
           ((xp, yp, 0), (0.5, 0.5, 8.0))]
    return it, dict(rotulo="Lanchonete 24 horas", grupo="lanchonete", tags=["predio", "regular", "lanchonete", "neon",
                                                                           "animado"],
                    colisao=col, dir_mini=DIR_PREDIO, colisao_plana=False, extra=extra_predio((1, 1), 1))


# ---------------------------------------------------------------------------------------------------- shopping
def carrinho(esc=1.0):
    """Carrinho de compras gigante (arame de tubos)."""
    s = esc
    cor = "vermelho"
    o = []
    cesto = [(-1.6, -1.0), (1.6, -1.0), (1.3, 1.0), (-1.3, 1.0)]
    for zz in (0.0, 0.6, 1.2, 1.8):
        k = 1 - 0.0 * zz
        o.append(mb.tubo([(x * s, 0, (zz + y + 1.0) * s * 0 + (1.0 + zz) * s) for x, y in [(-1.6 + zz * 0.1, 0), (1.6, 0)]],
                         0.06 * s, cor=cor, seg=6))
    for x in (-1.5, -0.75, 0.0, 0.75, 1.5):
        o.append(mb.tubo([(x * s, 0, 1.0 * s), (x * s * 1.05, 0, 2.8 * s)], 0.06 * s, cor=cor, seg=6))
    o.append(mb.tubo([(-1.7 * s, 0, 2.8 * s), (1.7 * s, 0, 2.8 * s)], 0.09 * s, cor=cor, seg=6))
    o.append(mb.tubo([(1.7 * s, 0, 2.8 * s), (2.3 * s, 0, 3.4 * s), (2.9 * s, 0, 3.4 * s)], 0.09 * s, cor="grafite", seg=6))
    o.append(mb.tubo([(-1.4 * s, 0, 1.0 * s), (-1.4 * s, 0, 0.4 * s)], 0.06 * s, cor=cor, seg=6))
    o.append(mb.tubo([(1.4 * s, 0, 1.0 * s), (1.4 * s, 0, 0.4 * s)], 0.06 * s, cor=cor, seg=6))
    for x in (-1.4, 1.4):
        o.append(mb.cilindro(0.3 * s, 0.2 * s, x=x * s, y=0, z=0.3 * s, cor="grafite", seg=12, bisel=0.03, eixo="y"))
    # produtos no carrinho
    o.append(mb.caixa(0.8 * s, 0.5 * s, 1.0 * s, x=-0.6 * s, z=1.9 * s, cor="laranja", bisel=0.08))
    o.append(mb.esfera(0.45 * s, x=0.6 * s, z=2.5 * s, cor="verde_lima", seg=12))
    return mb.junta(o, "carrinho")


def p_shopping():
    it = ItemC("shopping")
    L, P = 27.0, 12.6
    y0 = 0.9
    yf = y0 - P / 2
    nand = 3
    zt = 4.6
    ztot = zt + 2 * 3.8
    faixas = ["rosa", "amarelo", "turquesa"]
    it.add(bloco(L, P, ztot, y=y0, cor="branco"))
    for k in range(3):
        z0 = zt - 0.6 + k * 3.8 if k else 0.0
        hh = 0.6 if k else 0.6
        if k:
            it.add(mb.caixa(L + 0.14, P + 0.14, 0.7, y=y0, z=zt - 0.35 + (k - 1) * 3.8, cor=faixas[k], bisel=0.08))
    it.add(mb.caixa(L + 0.14, P + 0.14, 0.7, y=y0, z=0.0, cor="laranja", bisel=0.08))
    it.add(cornija(L, P, ztot, y=y0, cor="laranja", a=0.5, saliente=0.25))
    it.add(platibanda(L, P, ztot + 0.5, y=y0, cor="branco", a=0.6))
    # fachada: pano de vidro nos andares de cima, vitrines no térreo
    it.add(cb.janelas(("y", yf, -1), -L / 2 + 0.8, 5.0, zt + 0.4, ztot - 0.2, 7, 2, larg=0.9, alt=0.82, moldura="branco",
                      semente=61, peitoril=False))
    it.add(cb.janelas(("y", yf, -1), -L / 2 + 0.8, L / 2 - 0.8, 0.8, zt - 0.6, 8, 1, larg=0.86, alt=0.8,
                      moldura="grafite", semente=62, peitoril=False))
    it.add(cb.janelas(("y", y0 + P / 2, 1), -L / 2 + 0.8, L / 2 - 0.8, 1.0, ztot - 0.2, 8, 3, moldura="branco", semente=63))
    for sx in (-1, 1):
        it.add(cb.janelas(("x", sx * L / 2, sx), y0 - P / 2 + 0.8, y0 + P / 2 - 0.8, 1.0, ztot - 0.2, 3, 3,
                          moldura="branco", semente=64 + sx))
    it.add(porta_vidro(-2.0, yf - 0.05, 0.7, l=4.0, a=2.9))
    it.add(marquise(7.0, 1.8, -2.0, yf - 0.9, 3.9, cor="rosa"))
    for k, (x, c) in enumerate(((-10.0, "vermelho"), (-6.2, "verde"), (3.4, "azul"), (7.2, "amarelo"), (11.0, "rosa"))):
        tol = mb.caixa(3.0, 1.3, 0.12, x=0, y=-0.65, z=0, cor=c, bisel=0.04)
        mb.transforma(tol, rot=("X", -18))
        mb.transforma(tol, loc=(x, yf, 3.5))
        it.add(tol)
    # painel do letreiro e carrinho gigante na fachada
    it.add(mb.caixa(10.0, 0.5, 2.2, x=8.0, y=yf - 0.2, z=ztot - 3.0, cor="roxo", bisel=0.1))
    it.add(cnb.placa("shopping", 9.0, 1.8, x=8.0, y=yf - 0.5, z=ztot - 2.8, emissao=1.6, moldura="roxo_escuro"))
    car = carrinho(1.0)
    mb.transforma(car, loc=(8.0, yf - 1.0, zt + 0.1))
    it.add(car)
    it.add(mb.caixa(6.4, 1.2, 0.2, x=8.0, y=yf - 0.6, z=zt - 0.05, cor="roxo", bisel=0.05))
    # claraboias no teto
    for x in (-8.0, 0.0):
        cl = [mb.caixa(5.0, 5.0, 0.4, x=x, y=y0, z=ztot, cor="turquesa_escuro", bisel=0.06),
              mb.cilindro(3.3, 1.8, x=x, y=y0, z=ztot + 0.4, r2=0.2, seg=4, cor=None, mat="vidro", bisel=0.0)]
        mb.transforma(cl[1], loc=(0, 0, 0))
        it.add(*cl)
    it.add(mb.caixa(3.0, 2.0, 1.4, x=10.5, y=y0 + 3.0, z=ztot, cor="cinza_claro", bisel=0.08))
    col = [((0, y0, 0), (L, P, ztot + 1.1)), ((-2.0, yf - 0.9, 3.9), (7.0, 1.8, 0.3))]
    return it, dict(rotulo="Shopping colorido (2 × 1)", grupo="shopping", tags=["predio", "regular", "shopping", "2x1"],
                    colisao=col, dir_mini=DIR_PREDIO, colisao_plana=False, extra=extra_predio((2, 1), nand))


# ---------------------------------------------------------------------------------------------------- academia
def p_academia():
    it = ItemC("academia_azul")
    # planta: retângulo com a frente em arco convexo
    W, Dp = 12.6, 9.0
    yb = 4.8
    arcp = [(W / 2 * math.cos(math.radians(a)), -1.2 - 2.4 * math.sin(math.radians(a))) for a in range(0, 181, 10)]
    planta = ae.ccw([(W / 2, yb)] + arcp + [(-W / 2, yb)])
    zt = 4.4
    ztot = zt + 3.6
    it.add(ae.prisma([planta], 0.0, ztot, "azul", nome="corpo"))
    it.add(ae.prisma([[(x * 1.02, y * 1.0 + (0.0)) for x, y in planta]], zt - 0.3, zt + 0.2, "branco", nome="faixa"))
    it.add(ae.prisma([[(x * 1.03, y + (0.06 if y < 0 else 0.0)) for x, y in planta]], ztot, ztot + 0.5, "branco",
                     nome="cornija"))
    # pano de vidro curvo no térreo (mostra os aparelhos) e janelas em cima
    vid = []
    for k in range(18):
        a0, a1 = math.radians(10 * k), math.radians(10 * (k + 1))
        p0 = (W / 2 * math.cos(a0) * 1.005, -1.2 - 2.4 * math.sin(a0) * 1.01 - 0.03)
        p1 = (W / 2 * math.cos(a1) * 1.005, -1.2 - 2.4 * math.sin(a1) * 1.01 - 0.03)
        for z0, z1, mat in ((0.5, zt - 0.5, "vidro"), (zt + 0.6, ztot - 0.5, "janela")):
            q = cnb.quad_uv([(p1[0], p1[1], z0), (p0[0], p0[1], z0), (p0[0], p0[1], z1), (p1[0], p1[1], z1)],
                            mb.MAT_NOMES.index(mat))
            vid.append(q)
    it.add(mb.junta(vid, "vidros"))
    it.add(mb.caixa(W - 1.0, 3.0, 0.1, x=0, y=-0.2, z=0.02, cor="borracha", bisel=0))
    for k, x in enumerate((-3.6, -1.2, 1.2, 3.6)):  # esteiras atrás do vidro
        it.add(mb.caixa(0.9, 1.8, 0.35, x=x, y=-0.4, z=0.1, cor="grafite", bisel=0.06))
        it.add(mb.caixa(0.9, 0.12, 1.3, x=x, y=-1.2, z=0.1, cor="grafite_escuro", bisel=0.03))
        it.add(mb.caixa(0.5, 0.06, 0.3, x=x, y=-1.27, z=1.2, cor=None, mat="luz_azul", bisel=0.02))
    it.add(porta_vidro(0, -3.65, 0.0, l=2.2, a=2.7))
    it.add(cnb.placa("academia", 6.5, 1.3, x=0, y=-3.65 - 0.2, z=ztot + 0.6, emissao=1.6, moldura="azul_escuro"))
    # halter gigante no teto em neon
    h = [mb.cilindro(0.18, 4.6, cor="cromo", seg=10, bisel=0.02, eixo="x")]
    for sx in (-1, 1):
        for k in range(2):
            h.append(mb.cilindro(0.95 - 0.2 * k, 0.32, x=sx * (1.6 + 0.36 * k), cor="grafite", seg=20, bisel=0.06, eixo="x"))
        h.append(anel(0.97, 0.0, 0.07, mat="neon"))
        mb.transforma(h[-1], rot=("Y", 90), loc=(sx * 1.45, 0, 0))
    hal = mb.junta(h, "halter")
    mb.transforma(hal, loc=(0, 2.0, ztot + 1.6))
    it.add(hal)
    for sx in (-1.6, 1.6):
        it.add(mb.caixa(0.3, 0.3, 0.7, x=sx, y=2.0, z=ztot + 0.5, cor="grafite", bisel=0.05))
    it.add(cb.janelas(("y", yb, 1), -W / 2 + 0.8, W / 2 - 0.8, 1.0, ztot - 0.3, 4, 2, moldura="branco", semente=71))
    for sx in (-1, 1):
        it.add(cb.janelas(("x", sx * W / 2, sx), -1.0, yb - 0.6, 1.0, ztot - 0.3, 2, 2, moldura="branco", semente=72 + sx))
    col = [((0, (yb - 3.6) / 2, 0), (W, yb + 3.6, ztot + 0.5)), ((0, 2.0, ztot), (4.6, 2.0, 2.6))]
    return it, dict(rotulo="Academia azul de fachada curva", grupo="academia", tags=["predio", "regular", "academia"],
                    colisao=col, dir_mini=DIR_PREDIO, colisao_plana=False, extra=extra_predio((1, 1), 2))


# ---------------------------------------------------------------------------------------------------- apartamentos em U
def claraboia(x, y, z, l=2.4, p=2.4):
    return mb.junta([mb.caixa(l + 0.3, p + 0.3, 0.35, x=x, y=y, z=z, cor="azul_medio", bisel=0.05),
                     mb.cilindro(l * 0.71, 0.9, x=x, y=y, z=z + 0.35, r2=0.12, seg=4, cor=None, mat="vidro", bisel=0)],
                    "claraboia")


def p_apartamentos_u():
    it = ItemC("apartamentos_tijolo_u")
    L, P = 27.0, 12.6
    y0 = 0.9
    yf = y0 - P / 2
    alaw = 7.4   # largura de cada ala
    fundo = 5.4  # profundidade da barra do fundo
    nand = 5
    zt = 3.8
    ztot = zt + (nand - 1) * AND
    alas = [(-L / 2 + alaw / 2, alaw), (L / 2 - alaw / 2, alaw)]
    for x, w in alas:
        it.add(bloco(w, P, ztot, x=x, y=y0, cor="tijolo"))
        it.add(cornija(w, P, ztot, x=x, y=y0, cor="branco", a=0.4, saliente=0.18))
        it.add(platibanda(w, P, ztot + 0.4, x=x, y=y0, cor="concreto", a=0.6))
        it.add(cb.janelas(("y", yf, -1), x - w / 2 + 0.6, x + w / 2 - 0.6, 1.0, ztot - 0.2, 2, nand, moldura="branco",
                          semente=int(81 + x)))
        sx = 1 if x > 0 else -1
        it.add(cb.janelas(("x", x + sx * w / 2, sx), y0 - P / 2 + 0.6, y0 + P / 2 - 0.6, 1.0, ztot - 0.2, 4, nand,
                          moldura="branco", semente=int(83 + x)))
        it.add(cb.janelas(("x", x - sx * w / 2, -sx), y0 - P / 2 + 0.6, y0 + P / 2 - fundo - 0.3, 1.0, ztot - 0.2, 2, nand,
                          moldura="branco", semente=int(85 + x)))
        it.add(claraboia(x, y0 - 1.5, ztot + 0.05), claraboia(x, y0 + 3.0, ztot + 0.05))
    wb = L - 2 * alaw
    yb = y0 + P / 2 - fundo / 2
    it.add(bloco(wb + 0.2, fundo, ztot, y=yb, cor="tijolo"))
    it.add(cornija(wb, fundo, ztot, y=yb, cor="branco", a=0.4, saliente=0.18))
    it.add(mb.caixa(wb, 0.25, 0.6, y=yb - fundo / 2 + 0.12, z=ztot + 0.4, cor="concreto", bisel=0.05))
    it.add(mb.caixa(wb, 0.25, 0.6, y=yb + fundo / 2 - 0.12, z=ztot + 0.4, cor="concreto", bisel=0.05))
    it.add(cb.janelas(("y", yb - fundo / 2, -1), -wb / 2 + 0.6, wb / 2 - 0.6, zt + 0.2, ztot - 0.2, 4, nand - 1,
                      moldura="branco", semente=87))
    it.add(cb.janelas(("y", y0 + P / 2, 1), -L / 2 + 0.6, L / 2 - 0.6, 1.0, ztot - 0.2, 10, nand, moldura="branco",
                      semente=88))
    it.add(claraboia(-3.0, yb, ztot + 0.05), claraboia(3.0, yb, ztot + 0.05))
    # faixas de concreto entre os andares
    for k in range(1, nand):
        z = zt + (k - 1) * AND - 0.12
        for x, w in alas:
            it.add(mb.caixa(w + 0.06, P + 0.06, 0.18, x=x, y=y0, z=z, cor="concreto", bisel=0.03))
        it.add(mb.caixa(wb, fundo + 0.06, 0.18, y=yb, z=z, cor="concreto", bisel=0.03))
    # pátio do U: entrada, piso, árvores e bancos
    it.add(cb.laje(cb.quadrado(-wb / 2, yf, wb / 2, yb - fundo / 2), 0.05, "piso_rosado", z_fundo=0.0, nome="patio"))
    it.add(porta_vidro(0, yb - fundo / 2 - 0.02, 0.05, l=2.6, a=2.6))
    it.add(marquise(4.0, 1.6, 0, yb - fundo / 2 - 0.8, 3.0, cor="branco"))
    it.add(cnb.placa("apartamentos", 4.0, 0.8, x=0, y=yb - fundo / 2 - 0.15, z=3.35, emissao=1.2, moldura="nogueira"))
    for x in (-3.2, 3.2):
        it.add(cnb.arvore_baixa(x, yf + 2.2, 0.05, esc=0.9))
        it.add(ae.banco(x * 0.45, yf + 3.6, z0=0.05, ang=0))
    col = [((alas[0][0], y0, 0), (alaw, P, ztot + 1.0)), ((alas[1][0], y0, 0), (alaw, P, ztot + 1.0)),
           ((0, yb, 0), (wb, fundo, ztot + 1.0))]
    return it, dict(rotulo="Apartamentos de tijolo em U (2 × 1)", grupo="apartamentos_u",
                    tags=["predio", "regular", "apartamentos", "tijolo", "2x1"], colisao=col, dir_mini=DIR_PREDIO,
                    colisao_plana=False, extra=extra_predio((2, 1), nand))


# ---------------------------------------------------------------------------------------------------- torre basquete
def tabela(ang, r):
    o = [mb.cilindro(0.12, 3.6, cor="grafite", seg=8, bisel=0.02),
         mb.caixa(1.8, 0.08, 1.1, y=0.2, z=3.3, cor="branco", bisel=0.03),
         mb.caixa(0.7, 0.1, 0.5, y=0.17, z=3.4, cor="vermelho", bisel=0.02)]
    aro = anel(0.24, 3.35, 0.025, cor="laranja", n=16)
    mb.transforma(aro, loc=(0, -0.1, 0))
    o.append(aro)
    ob = mb.junta(o, "tabela")
    mb.transforma(ob, rot=("Z", ang), loc=(r * math.cos(math.radians(ang - 90)), r * math.sin(math.radians(ang - 90)), 0))
    return ob


def p_torre_basquete():
    it = ItemC("torre_basquete")
    R = 4.6
    nand = 5
    zt = 4.0
    ztot = zt + (nand - 1) * AND
    it.add(mb.cilindro(R + 0.6, 0.4, z=0.0, cor="concreto", seg=36, bisel=0.06))
    it.add(mb.cilindro(R, ztot, z=0.0, cor="cinza_azulado", seg=36, bisel=0.05))
    it.add(mb.cilindro(R + 0.03, zt - 1.0, z=0.5, cor=None, mat="vidro", seg=36, bisel=0.02))
    for k in range(nand - 1):  # varandas redondas com floreiras verdes
        z = zt + k * AND
        it.add(mb.cilindro(R + 1.6, 0.3, z=z - 0.3, cor="branco", seg=36, bisel=0.1))
        it.add(mb.cilindro(R + 1.45, 0.45, z=z, cor="verde_lima", seg=36, bisel=0.1))
        it.add(mb.cilindro(R + 1.25, 0.12, z=z + 0.4, cor="folha", seg=36, bisel=0.03))
        it.add(anel(R + 1.55, z + 1.05, 0.04, cor="branco", n=36))
        for j in range(6):
            a = 2 * math.pi * (j + 0.5 * (k % 2)) / 6
            it.add(mb.esfera(0.45, x=(R + 1.0) * math.cos(a), y=(R + 1.0) * math.sin(a), z=z + 0.7, cor="folha", seg=10))
        jan = mb.cilindro(R + 0.02, 1.6, z=z + 0.6, cor=None, mat="janela", seg=36, bisel=0.01)
        it.add(jan)
    # quadra redonda no telhado com piso estampado, mureta, alambrado e três tabelas
    zq = ztot
    RQ = 6.6
    it.add(mb.cilindro(RQ, 0.45, z=zq, cor="laranja_escuro", seg=40, bisel=0.12))
    mi = cnb.est("quadra_basquete")
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    n = 40
    cen = bm.verts.new((0, 0, zq + 0.455))
    vs = [bm.verts.new(((RQ - 0.3) * math.cos(2 * math.pi * k / n), (RQ - 0.3) * math.sin(2 * math.pi * k / n),
                        zq + 0.455)) for k in range(n)]
    for k in range(n):
        f = bm.faces.new((cen, vs[k], vs[(k + 1) % n]))
        for lo in f.loops:
            lo[uvl].uv = (0.5 + lo.vert.co.x / (2 * RQ) * 0.98, 0.5 + lo.vert.co.y / (2 * RQ) * 0.98)
    it.add(mb._obj("quadra", bm, None, mat=mi, liso=False))
    mur = mb.torno([(RQ - 0.25, zq + 0.4), (RQ, zq + 0.4), (RQ, zq + 1.4), (RQ - 0.25, zq + 1.4)], cor=None, seg=40)
    mb.pinta(mur, None, mat="vidro")
    it.add(mur)
    it.add(anel(RQ - 0.12, zq + 1.45, 0.06, cor="azul", n=40))
    for k in range(16):
        a = 2 * math.pi * k / 16
        it.add(mb.cilindro(0.05, 3.2, x=(RQ - 0.12) * math.cos(a), y=(RQ - 0.12) * math.sin(a), z=zq + 1.4, cor="grafite",
                           seg=6, bisel=0))
    it.add(anel(RQ - 0.12, zq + 4.6, 0.05, cor="grafite", n=40))
    for ang in (0, 120, 240):
        t = tabela(ang, RQ - 0.9)
        mb.transforma(t, loc=(0, 0, zq + 0.45))
        it.add(t)
    it.add(mb.esfera(0.24, x=1.2, y=-1.0, z=zq + 0.7, cor="laranja", seg=12))
    col = [((0, 0, 0), (2 * R + 3.2, 2 * R + 3.2, ztot)), ((0, 0, ztot), (2 * RQ, 2 * RQ, 1.4))]
    return it, dict(rotulo="Torre com quadra de basquete no telhado", grupo="torre_basquete",
                    tags=["predio", "regular", "ecologico", "basquete"], colisao=col, dir_mini=DIR_PREDIO,
                    colisao_plana=False, extra=extra_predio((1, 1), nand))


# ---------------------------------------------------------------------------------------------------- sala de enigmas
def p_sala_enigmas():
    it = ItemC("sala_enigmas")
    L, P = 12.0, 11.0
    y0 = 1.0
    yf = y0 - P / 2
    zt = 4.4
    ztot = zt + 2 * AND + 0.6
    # base vermelha-escura que alarga para cima (pirâmide invertida) e corpo magenta com faixas de neon
    base = mb.cilindro(5.2, zt, y=y0, z=0.0, r2=7.4, seg=4, cor="vinho", bisel=0.15)
    mb.transforma(base, rot=None)
    base.data.transform(Matrix.Translation((0, y0, 0)) @ Matrix.Rotation(math.radians(45), 4, "Z") @
                        Matrix.Translation((0, -y0, 0)))
    it.add(base)
    it.add(porta_vidro(0, y0 - 3.7, 0.0, l=2.2, a=2.6))
    it.add(bloco(L, P, ztot - zt, y=y0, z=zt, cor="magenta", bisel=0.5))
    for k in range(5):
        z = zt + 0.8 + k * 1.2
        mat = "neon_roxo" if k % 2 == 0 else "neon"
        it.add(mb.caixa(L + 0.12, P + 0.12, 0.18, y=y0, z=z, cor=None, mat=mat, bisel=0.06))
    it.add(mb.caixa(L + 0.2, P + 0.2, 0.5, y=y0, z=ztot, cor="rosa_escuro", bisel=0.15))
    gc = [(-L / 2 + 0.3, yf + 0.3, ztot + 0.5), (L / 2 - 0.3, yf + 0.3, ztot + 0.5), (L / 2 - 0.3, y0 + P / 2 - 0.3, ztot + 0.5),
          (-L / 2 + 0.3, y0 + P / 2 - 0.3, ztot + 0.5), (-L / 2 + 0.3, yf + 0.3, ztot + 0.5)]
    it.add(ae.guarda_corpo(gc, alt=1.1, cor="cinza_claro"))
    it.add(cnb.placa("enigmas", 9.6, 1.6, x=0, y=yf - 0.15, z=zt + 2.6, emissao=2.2, moldura="azul_noite"))
    for sx in (-1, 1):
        it.add(cnb.placa("enigmas", 8.8, 1.47, x=sx * (L / 2 + 0.15), y=y0, z=zt + 2.6, ang=-90 * sx, emissao=2.2,
                         moldura="azul_noite"))
    col = [((0, y0, 0), (10.4, 10.4, zt)), ((0, y0, zt), (L, P, ztot - zt + 1.6))]
    return it, dict(rotulo="Sala de enigmas (neon)", grupo="sala_enigmas", tags=["predio", "regular", "futurista", "neon"],
                    colisao=col, dir_mini=DIR_PREDIO, colisao_plana=False, extra=extra_predio((1, 1), 3))


def p_torre_telao():
    it = ItemC("torre_telao_sorriso")
    L, P = 11.0, 10.0
    y0 = 1.0
    yf = y0 - P / 2
    zb = 8.0
    # pódio branco e azul com recortes, torre azul-clara com o telão do rosto e a faixa de texto correndo
    it.add(bloco(L + 1.6, P + 1.4, zb, y=y0, cor="branco", bisel=0.4))
    it.add(cb.janelas(("y", y0 - (P + 1.4) / 2, -1), -L / 2, L / 2, 0.8, zb - 0.6, 5, 2, larg=0.88, alt=0.78,
                      moldura="azul_medio", semente=91, peitoril=False))
    for k in range(3):
        it.add(mb.caixa(L + 1.7, P + 1.5, 0.3, y=y0, z=1.0 + 2.4 * k, cor="azul_medio", bisel=0.08))
    it.add(mb.caixa(L + 2.4, P + 2.2, 0.6, y=y0, z=zb, cor="cinza_claro", bisel=0.2))
    zt0, zt1 = zb + 0.6, zb + 22.0
    it.add(bloco(8.0, 7.6, zt1 - zt0, y=y0 + 0.4, z=zt0, cor="azul_claro", bisel=0.5))
    it.add(cb.janelas(("y", y0 + 0.4 - 3.8, -1), -3.4, 3.4, zt0 + 0.8, zt0 + 3.4, 4, 1, larg=0.5, alt=0.7,
                      moldura="azul_medio", semente=92))
    for sx in (-1, 1):
        it.add(cb.janelas(("x", sx * 4.0, sx), y0 - 3.0, y0 + 3.8, zt0 + 0.8, zt1 - 1.0, 3, 6, moldura="azul_medio",
                          semente=93 + sx))
    it.add(mb.caixa(8.6, 8.2, 1.2, y=y0 + 0.4, z=zt1, cor="azul_medio", bisel=0.3))
    it.add(mb.caixa(6.0, 5.6, 1.6, y=y0 + 0.4, z=zt1 + 1.2, cor="branco", bisel=0.4))
    it.add(mb.caixa(6.1, 5.7, 0.3, y=y0 + 0.4, z=zt1 + 2.2, cor=None, mat="neon", bisel=0.1))
    # telão com rosto (estampa luminosa)
    zs0 = zt0 + 7.0
    it.add(mb.caixa(6.4, 0.5, 9.0, y=y0 + 0.4 - 3.8 - 0.1, z=zs0 - 0.3, cor="grafite_escuro", bisel=0.2))
    mi = cnb.est("tela_rosto", 1.8)
    yt = y0 + 0.4 - 3.9 - 0.25 - 0.02
    it.add(cnb.quad_uv([(-2.9, yt, zs0), (2.9, yt, zs0), (2.9, yt, zs0 + 8.4), (-2.9, yt, zs0 + 8.4)], mi, nome="tela"))
    # faixa de texto em volta (rola)
    fx = cnb.faixa_estampa("faixa_texto", 1.0, 1.4, zt0 + 4.6, n=48, emissao=1.8, rep=1.0)
    mb.transforma(fx, esc=(4.25, 4.05, 1.0), loc=(0, y0 + 0.4, 0))
    it.anima(fx, (0, y0 + 0.4, zt0 + 5.3), {"anima": "rolar", "velocidade": 0.05}, "faixa_rolante")
    it.add(mb.cilindro(1.0, 0.2, y=y0 + 0.4, z=zt0 + 4.4, cor="azul_medio", seg=48, bisel=0.05))
    mb.transforma(it.partes[-1], esc=(4.4, 4.2, 1.0))
    it.partes[-1].data.transform(Matrix.Translation((0, y0 + 0.4 - (y0 + 0.4) * 4.2, 0)))
    it.add(mb.cilindro(1.0, 0.2, y=y0 + 0.4, z=zt0 + 6.05, cor="azul_medio", seg=48, bisel=0.05))
    mb.transforma(it.partes[-1], esc=(4.4, 4.2, 1.0))
    it.partes[-1].data.transform(Matrix.Translation((0, y0 + 0.4 - (y0 + 0.4) * 4.2, 0)))
    col = [((0, y0, 0), (L + 1.6, P + 1.4, zb + 0.6)), ((0, y0 + 0.4, zt0), (8.6, 8.4, zt1 - zt0 + 2.8))]
    return it, dict(rotulo="Torre do telão sorridente", grupo="torre_telao", tags=["predio", "regular", "futurista",
                                                                                   "telao", "animado"],
                    colisao=col, dir_mini=DIR_PREDIO, colisao_plana=False, extra=extra_predio((1, 1), 8))


def contorno_quebra_cabeca(s=1.0):
    """Peça de quebra-cabeça (encaixe em cima e na direita, recorte embaixo e à esquerda)."""
    pts = []
    n = 10

    def lado(p0, p1, sinal):
        (x0, y0), (x1, y1) = p0, p1
        dx, dy = x1 - x0, y1 - y0
        nx, ny = dy, -dx
        out = []
        for t in [k / 30 for k in range(30)]:
            bump = 0.0
            if 0.35 < t < 0.65:
                u = (t - 0.35) / 0.3
                bump = sinal * 0.28 * math.sin(u * math.pi) ** 0.6
            out.append((x0 + dx * t + nx * bump, y0 + dy * t + ny * bump))
        return out
    c = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
    for (a, b), sg in zip(zip(c, c[1:] + c[:1]), (0.0, -1.0, -1.0, 1.0)):
        pts += lado(a, b, sg)
    return [(x * s, y * s) for x, y in pts]


def p_placa_quebra_cabeca():
    it = ItemC("placa_quebra_cabeca")
    cont = ae.ccw(contorno_quebra_cabeca(1.6))
    pz = 9.0
    peca_ = mb.extrudado(cont, 0.7, cor="azul", bisel=0.12, plano="xz")
    mb.transforma(peca_, loc=(0, -0.35, 0))
    borda = mb.tubo([(x * 1.04, -0.42, z * 1.04) for x, z in cont] + [(cont[0][0] * 1.04, -0.42, cont[0][1] * 1.04)],
                    0.07, cor=None, mat="neon", seg=6, raio_curva=0.0)
    borda2 = mb.copia(borda)
    mb.transforma(borda2, loc=(0, 0.84, 0))
    pc = mb.junta([peca_, borda, borda2], "quebra_cabeca")
    mb.transforma(pc, loc=(0, 0, pz))
    it.anima(pc, (0, 0, pz), {"anima": "girar", "eixo": "y", "velocidade": 20.0}, "peca_flutuante")
    # projetor no chão (a placa flutua por cima)
    it.add(mb.cilindro(0.9, 0.5, z=0.0, cor="grafite", seg=20, bisel=0.08))
    it.add(mb.cilindro(0.6, 0.06, z=0.5, cor=None, mat="luz_azul", seg=20, bisel=0.02))
    it.add(anel(0.92, 0.3, 0.05, mat="neon", n=24))
    return it, dict(rotulo="Placa flutuante de quebra-cabeça", grupo="placa_quebra_cabeca",
                    tags=["futurista", "placa", "neon", "animado"], colisao=[((0, 0, 0), (1.8, 1.8, 0.56))],
                    dir_mini=DIR_PREDIO, colisao_plana=False)


# ---------------------------------------------------------------------------------------------------- praça do cristal
def cristal(x, y, z, r, h, tilt=0.0, az=0.0, cor="roxo", nome="cristal"):
    """Prisma hexagonal com ponta, inclinado (tilt) na direção az; arestas com brilho_roxo (acende à noite)."""
    m = ae.Malha()
    ang = [math.radians(60 * k + 30) for k in range(6)]
    base = [m.v((r * math.cos(a), r * math.sin(a), 0.0)) for a in ang]
    topo = [m.v((r * math.cos(a), r * math.sin(a), h * 0.72)) for a in ang]
    ponta = m.v((0, 0, h))
    cores = [cor, "roxo_escuro", "violeta", cor, "lilas", "roxo_escuro"]
    for k in range(6):
        m.f((base[k], base[(k + 1) % 6], topo[(k + 1) % 6], topo[k]), cores[k])
        m.f((topo[k], topo[(k + 1) % 6], ponta), cores[(k + 2) % 6])
    m.poligono([tuple(v.co) for v in base], "roxo_escuro", normal=(0, 0, -1))
    ob = m.obj(nome)
    # arestas brilhantes: tiras finas nas arestas verticais
    tiras = []
    for k in range(0, 6, 2):
        a = ang[k]
        p0 = V((r * math.cos(a), r * math.sin(a), 0.2))
        p1 = V((r * math.cos(a), r * math.sin(a), h * 0.72))
        tiras.append(mb.tubo([tuple(p0 * 1.01), tuple(p1 * 1.01), (0, 0, h * 0.98)], r * 0.06, cor=None,
                             mat="brilho_roxo", seg=4, raio_curva=0.01))
    ob = mb.junta([ob] + tiras, nome)
    ob.data.transform(Matrix.Translation((x, y, z)) @ Matrix.Rotation(math.radians(az), 4, "Z") @
                      Matrix.Rotation(math.radians(tilt), 4, "X"))
    return ob


def petala(az, comp, larg, alt, z0, cor):
    pts = []
    for k in range(13):
        t = k / 12
        pts.append((larg * math.sin(math.pi * t) ** 0.8 * (1 if k <= 6 else 1), comp * t))
    cont = ae.ccw([(x, y) for x, y in pts] + [(-x, y) for x, y in pts[::-1]][1:-1])
    p = mb.extrudado(cont, 0.35, cor=cor, bisel=0.1, seg=1)
    # curva para cima (pétala em concha)
    for v in p.data.vertices:
        t = v.co.y / comp
        v.co.z += alt * t ** 1.8 + 0.25 * abs(v.co.x) / larg
    p.data.transform(Matrix.Translation((0, 0, z0)) @ Matrix.Rotation(math.radians(az), 4, "Z"))
    return p


def p_praca_cristal():
    it = ItemC("praca_cristal")
    L = 30.0
    # calçada nas bordas (z = 0, como as ruas), canteiro redondo de grama e caminhos de ladrilho
    it.add(cb.laje(cb.quadrado(-L / 2, -L / 2, L / 2, L / 2), 0.0, "calcada", nome="calcada"))
    it.add(cb.laje(ae.ccw(mb.circulo(13.6, 64)), 0.03, "piso_rosado", z_fundo=-0.3, nome="ladrilho"))
    gram = []
    for q in range(4):
        a0 = q * 90 + 12
        a1 = q * 90 + 78
        arc_e = [(12.6 * math.cos(math.radians(a)), 12.6 * math.sin(math.radians(a))) for a in range(int(a0), int(a1) + 1, 3)]
        arc_i = [(6.4 * math.cos(math.radians(a)), 6.4 * math.sin(math.radians(a))) for a in range(int(a1), int(a0) - 1, -3)]
        gram.append(ae.prisma([ae.ccw(arc_e + arc_i)], -0.3, 0.12, "grama", lado="grama_escura", nome="canteiro"))
    it.add(*gram)
    for r in (13.6, 6.4, 12.6):
        it.add(anel(r, 0.06, 0.07, cor="branco", n=64))
    # pedestal com pétalas douradas e o cristal monumental
    it.add(mb.cilindro(5.6, 0.6, z=0.0, cor="concreto", seg=40, bisel=0.12))
    it.add(mb.cilindro(5.0, 0.6, z=0.6, cor="grafite", seg=40, bisel=0.12))
    for k in range(8):
        it.add(petala(k * 45 + 22.5, 5.6, 1.9, 2.4, 1.0, "ouro" if k % 2 else "laranja"))
    for k in range(8):
        it.add(petala(k * 45, 4.4, 1.6, 3.4, 1.1, "ouro_escuro" if k % 2 else "laranja_escuro"))
    cr_ = [(0, 0, 1.2, 1.9, 25.0, 0, 0)]
    rnd = random.Random(5)
    for k in range(7):
        az = k * 51 + rnd.uniform(-10, 10)
        cr_.append((0.9 * math.cos(math.radians(az + 90)), 0.9 * math.sin(math.radians(az + 90)), 1.2,
                    rnd.uniform(1.0, 1.5), rnd.uniform(11, 19), rnd.uniform(14, 30), az))
    for k in range(6):
        az = k * 60 + 25
        cr_.append((2.1 * math.cos(math.radians(az + 90)), 2.1 * math.sin(math.radians(az + 90)), 1.2,
                    rnd.uniform(0.7, 1.0), rnd.uniform(5, 9), rnd.uniform(35, 55), az))
    for k, (x, y, z, r, h, tilt, az) in enumerate(cr_):
        it.add(cristal(x, y, z, r, h, tilt=tilt, az=az, cor=["roxo", "violeta"][k % 2], nome=f"cristal_{k}"))
    it.add(mb.esfera(1.3, x=0, y=-2.2, z=2.0, cor=None, mat="luz_azul", seg=16))
    # postes de praça, bancos e árvores
    for k in range(8):
        a = math.radians(45 * k + 22.5)
        it.add(poste_praca(13.1 * math.cos(a), 13.1 * math.sin(a)))
    for k in range(4):
        a = math.radians(90 * k + 45)
        it.add(ae.banco(7.2 * math.cos(a), 7.2 * math.sin(a), z0=0.03, ang=90 * k + 45 + 90))
    for k in range(12):
        a = math.radians(30 * k + 15)
        r = 9.6 + (1.0 if k % 2 else -0.6)
        if (30 * k + 15) % 90 in (0,):
            continue
        it.add(cnb.arvore_baixa(r * math.cos(a), r * math.sin(a), 0.12, esc=1.0 + 0.15 * (k % 3)))
    for sx, sy in ((1, 1), (-1, 1), (-1, -1), (1, -1)):
        it.add(cnb.arvore_baixa(sx * 14.0, sy * 14.0, 0.0, esc=0.9))
    col = [((0, 0, cb.Z_FUNDO), (L, L, -cb.Z_FUNDO)), ((0, 0, 0), (11.2, 11.2, 1.2)), ((0, 0, 1.2), (4.4, 4.4, 24.0))]
    return it, dict(rotulo="Praça do cristal (2 × 2)", grupo="praca_cristal",
                    tags=["praca", "marco", "cristal", "modular", "2x2"], colisao=col, dir_mini=DIR_PREDIO,
                    extra={"quadras": [2, 2]})


def poste_praca(x, y):
    o = [mb.cilindro(0.16, 0.3, x=x, y=y, z=0.03, cor="grafite", seg=8, bisel=0.03),
         mb.cilindro(0.07, 4.0, x=x, y=y, z=0.3, cor="grafite", seg=6, bisel=0)]
    for k in range(4):
        a = math.radians(90 * k)
        lx, ly = x + 0.45 * math.cos(a), y + 0.45 * math.sin(a)
        o.append(mb.tubo([(x, y, 4.0), (lx, ly, 4.15)], 0.03, cor="grafite", seg=4))
        o.append(mb.esfera(0.18, x=lx, y=ly, z=4.2, cor=None, mat="luz", seg=8))
    o.append(mb.esfera(0.22, x=x, y=y, z=4.5, cor=None, mat="luz", seg=8))
    return mb.junta(o, "poste_praca")


# ---------------------------------------------------------------------------------------------------- fumaça e fogo
def p_fumaca_fogo():
    it = ItemC("efeito_fumaca_fogo")
    # chama (pisca suave) e brasa
    ch = []
    for k, (dx, dy, h, r) in enumerate(((0, 0, 0.75, 0.2), (0.12, 0.06, 0.5, 0.14), (-0.12, -0.04, 0.55, 0.15),
                                       (0.03, -0.12, 0.42, 0.12))):
        ch.append(mb.torno([(0, 0), (r, 0.05), (r * 0.9, h * 0.35), (r * 0.4, h * 0.75), (0, h)], x=dx, y=dy, z=0.0,
                           cor=None, mat="luz", seg=10))
    for k, (dx, dy) in enumerate(((0.05, 0.02), (-0.06, 0.05), (0.0, -0.07))):
        ch.append(mb.torno([(0, 0), (0.1, 0.03), (0.06, 0.2), (0, 0.32)], x=dx, y=dy, z=0.02, cor="fogo", seg=8))
    it.anima(ch, (0, 0, 0), {"anima": "piscar", "periodo": 0.5, "suave": 1}, "chama")
    it.add(mb.cilindro(0.26, 0.04, z=0.0, cor="brasa", seg=14, bisel=0.01))
    # coluna de fumaça escura em bolotas (balança devagar)
    rnd = random.Random(2)
    fum = []
    z = 0.7
    x = 0.0
    for k in range(9):
        r = 0.22 + 0.11 * k
        x += 0.06 * k * 0.5
        for j in range(3):
            a = rnd.uniform(0, 2 * math.pi)
            fum.append(mb.esfera(r * rnd.uniform(0.8, 1.05), x=x + 0.35 * r * math.cos(a), y=0.35 * r * math.sin(a),
                                 z=z + rnd.uniform(-0.1, 0.1) * r, cor=["grafite", "cinza_medio", "cinza"][min(2, k // 3)],
                                 seg=10))
        z += r * 1.05
    it.anima(fum, (0, 0, 0.6), {"anima": "balancar", "angulo": 4, "periodo": 5.0, "eixo": "z"}, "fumaca")
    return it, dict(rotulo="Fumaça e fogo de churrasqueira (efeito)", grupo="efeito_fumaca",
                    tags=["efeito", "fumaca", "fogo", "animado", "apoio"], colisao=[], dir_mini=DIR_PREDIO,
                    colisao_plana=False, extra={"apoio": "por em cima da churrasqueira (mobiliario_urbano/"
                                                         "churrasqueira_tambor_pacote: z = 0,73)"})


PECAS = [
    ("delegacia", p_delegacia),
    ("quartel_bombeiros", p_bombeiros),
    ("predio_aquario", p_aquario),
    ("hospital", p_hospital),
    ("lanchonete_24h", p_lanchonete),
    ("shopping", p_shopping),
    ("academia_azul", p_academia),
    ("apartamentos_tijolo_u", p_apartamentos_u),
    ("torre_basquete", p_torre_basquete),
    ("sala_enigmas", p_sala_enigmas),
    ("torre_telao_sorriso", p_torre_telao),
    ("placa_quebra_cabeca", p_placa_quebra_cabeca),
    ("praca_cristal", p_praca_cristal),
    ("efeito_fumaca_fogo", p_fumaca_fogo),
]
