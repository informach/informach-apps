"""Peças que completam a lista do pacote: mesas infantis e de área externa, tubos de chaminé, grills, saleiro e
pimenteiro, notebook e computador de mesa. Entram nos catálogos das categorias certas (mesas, lareiras,
cozinha_eletros, objetos).
Uso: blender-venv/bin/python -I moveis_complementos.py -- <moveis_out> [ids...]"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402,F401
import moveis_base as mb  # noqa: E402

ARGS = sys.argv[sys.argv.index("--") + 1:]
SAIDA = ARGS[0]
SO = set(ARGS[1:])
CATS = {}


def cat(nome):
    if nome not in CATS:
        CATS[nome] = mb.Catalogo(nome, SAIDA)
    return CATS[nome]


PECAS = []


def peca(cat_, id_):
    def deco(f):
        PECAS.append((cat_, id_, f))
        return f
    return deco


def pernas_redondas(raio, a, r, cor, n=4, abre=6, z=0.0, ang0=45):
    out = []
    for k in range(n):
        g = math.radians(ang0 + 360 * k / n)
        o = mb.pe("palito", a, cor=cor, r=r)
        mb.transforma(o, rot=[("Y", -abre * math.cos(g)), ("X", abre * math.sin(g))])
        o.data.update()
        zmin = min(v.co.z for v in o.data.vertices)
        mb.transforma(o, loc=(raio * math.cos(g), raio * math.sin(g), z - zmin))
        out.append(o)
    return out


# --------------------------------------------------------------------------------------------------------- mesas
def mesa_infantil_redonda(id_, tampo, pe, borda):
    it = mb.Item(id_)
    A = 0.50
    it.add(mb.extrudado(mb.circulo(0.30, 48), 0.032, z=A - 0.032, cor=tampo, bisel=0.012))
    it.add(mb.torno([(0.0, A - 0.06), (0.255, A - 0.06), (0.262, A - 0.05), (0.262, A - 0.034), (0.0, A - 0.034)],
                    cor=borda, seg=40))
    it.add(pernas_redondas(0.2, A - 0.05, 0.03, pe, abre=7))
    for k in range(5):  # bolinhas coloridas no tampo, como brinquedo
        g = math.radians(18 + 72 * k)
        it.add(mb.cilindro(0.035, 0.004, x=0.19 * math.cos(g), y=0.19 * math.sin(g), z=A - 0.001,
                           cor=["vermelho", "azul_celeste", "verde", "laranja", "roxo"][k], seg=20, bisel=0.0015))
    it.slot("tampo", (0, 0, A + 0.003), (0.5, 0.5, 0.4))
    it.colisao([((0, 0, A - 0.06), (0.6, 0.6, 0.06))] +
               [((0.2 * math.cos(math.radians(45 + 90 * k)), 0.2 * math.sin(math.radians(45 + 90 * k)), 0),
                 (0.07, 0.07, A - 0.06)) for k in range(4)])
    return it


@peca("mesas", "mesa_infantil_redonda_amarela")
def _():
    it = mesa_infantil_redonda("mesa_infantil_redonda_amarela", "amarelo", "azul_celeste", "azul")
    return it, dict(rotulo="Mesa infantil redonda (amarela)", grupo="mesa_infantil_redonda",
                    tags=["infantil", "redonda"])


@peca("mesas", "mesa_infantil_redonda_verde")
def _():
    it = mesa_infantil_redonda("mesa_infantil_redonda_verde", "verde_claro", "laranja", "laranja_escuro")
    return it, dict(rotulo="Mesa infantil redonda (verde)", grupo="mesa_infantil_redonda", tags=["infantil", "redonda"])


@peca("mesas", "mesa_infantil_gaveta_rosa")
def _():
    it = mb.Item("mesa_infantil_gaveta_rosa")
    L, P, A = 0.80, 0.55, 0.52
    tb, saia, perna, fr = "rosa", "branco", "branco", "amarelo"
    it.add(mb.caixa(L, P, 0.035, z=A - 0.035, cor=tb, bisel=0.016))
    za, ha = A - 0.035 - 0.09, 0.09
    it.add(mb.caixa(L - 0.1, 0.02, ha, y=P / 2 - 0.06, z=za, cor=saia, bisel=0.005))
    for sx in (-1, 1):
        it.add(mb.caixa(0.02, P - 0.12, ha, x=sx * (L / 2 - 0.06), z=za, cor=saia, bisel=0.005))
    lg = 0.40
    for sx in (-1, 1):  # saia da frente dos dois lados da gaveta
        w = (L - 0.12 - lg) / 2
        it.add(mb.caixa(w, 0.02, ha, x=sx * (lg / 2 + w / 2), y=-P / 2 + 0.06, z=za, cor=saia, bisel=0.005))
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.add(mb.caixa(0.05, 0.05, za + 0.005, x=sx * (L / 2 - 0.065), y=sy * (P / 2 - 0.065), cor=perna,
                            bisel=0.016))
            it.add(mb.esfera(0.028, x=sx * (L / 2 - 0.065), y=sy * (P / 2 - 0.065), z=0.012, cor=tb,
                             esc=(1, 1, 0.5), seg=16))
    f = mb.frente(lg - 0.006, ha - 0.008, esp=0.02, estilo="lisa", cor=fr, bisel=0.008)
    mb.transforma(f, loc=(0, -P / 2 + 0.05, za + 0.004))
    pux = mb.puxador("bola", x=0, y=-P / 2 + 0.03, z=za + ha / 2, cor="rosa_escuro")
    it.gaveta(lg - 0.03, P - 0.2, ha - 0.02, [f, pux], y_frente=-P / 2 + 0.07, z=za + 0.006, cor="creme")
    it.slot("tampo", (0, 0, A + 0.003), (L - 0.06, P - 0.06, 0.4))
    it.colisao([((0, 0, za), (L, P, A - za))] + [((sx * (L / 2 - 0.065), sy * (P / 2 - 0.065), 0), (0.06, 0.06, za))
                                                 for sx in (-1, 1) for sy in (-1, 1)])
    return it, dict(rotulo="Mesa infantil com gaveta (rosa)", grupo="mesa_infantil_gaveta", tags=["infantil", "gaveta"])


@peca("mesas", "mesa_jardim_redonda_branca")
def _():
    it = mb.Item("mesa_jardim_redonda_branca")
    A, R = 0.72, 0.45
    cor = "plastico_branco"
    it.add(mb.torno([(0.026, A - 0.022), (0.026, A), (R - 0.02, A), (R - 0.004, A - 0.006), (R, A - 0.02),
                     (R - 0.006, A - 0.052), (R - 0.02, A - 0.056), (R - 0.03, A - 0.035), (0.05, A - 0.028),
                     (0.026, A - 0.022)], cor=cor, seg=48))
    # ripas em relevo no tampo (desenho de mesa plástica)
    for k in range(6):
        g = math.radians(30 * k)
        tira = mb.caixa(0.74, 0.012, 0.004, cor=cor, bisel=0.0015)
        mb.transforma(tira, rot=("Z", math.degrees(g)), loc=(0, 0, A - 0.001))
        it.add(tira)
    for k in range(4):
        g = 45 + 90 * k
        perna = mb.caixa(0.06, 0.035, A - 0.04, cor=cor, bisel=0.014)
        mb.transforma(perna, rot=[("Y", 5)])
        mb.transforma(perna, rot=[("Z", g)], loc=(0, 0, 0))
        perna.data.update()
        zmin = min(v.co.z for v in perna.data.vertices)
        rr = 0.31
        mb.transforma(perna, loc=(rr * math.cos(math.radians(g)), rr * math.sin(math.radians(g)), -zmin))
        it.add(perna)
    anel = [(0.33 * math.cos(math.radians(k * 10)), 0.33 * math.sin(math.radians(k * 10)), 0.2) for k in range(37)]
    it.add(mb.tubo(anel, 0.012, cor=cor, raio_curva=0, seg=10, nome="anel"))
    it.slot("tampo", (0, 0, A + 0.002), (0.6, 0.6, 0.4))
    it.colisao([((0, 0, A - 0.06), (2 * R, 2 * R, 0.06)), ((0, 0, 0), (0.8, 0.8, A - 0.06))])
    return it, dict(rotulo="Mesa de jardim redonda (branca)", grupo="mesa_jardim_redonda",
                    tags=["externa", "jardim", "plastico"])


@peca("mesas", "mesa_piquenique_madeira")
def _():
    it = mb.Item("mesa_piquenique_madeira")
    L, A = 1.6, 0.74
    m1, m2 = "madeira_clara", "madeira"
    for k in range(5):  # tábuas do tampo
        it.add(mb.caixa(L, 0.135, 0.035, y=-0.28 + k * 0.14, z=A - 0.035, cor=m1 if k % 2 else m2, bisel=0.01))
    for sy in (-1, 1):  # bancos
        for k in range(2):
            it.add(mb.caixa(L, 0.13, 0.032, y=sy * (0.6 + (k - 0.5) * 0.135), z=0.43, cor=m2 if k else m1, bisel=0.01))
    for sx in (-1, 1):
        x = sx * (L / 2 - 0.22)
        it.add(mb.caixa(0.06, 0.66, 0.05, x=x, z=A - 0.085, cor=m2, bisel=0.01))
        it.add(mb.caixa(0.06, 1.46, 0.06, x=x, z=0.37, cor=m2, bisel=0.012))
        for sy in (-1, 1):
            alt = A - 0.07  # do chão até debaixo do tampo
            comp = alt / math.cos(math.radians(27))
            perna = mb.caixa(0.06, 0.09, comp, z=-comp / 2, cor=m2, bisel=0.014)
            mb.transforma(perna, rot=("X", sy * 27))
            mb.transforma(perna, loc=(x, sy * alt / 2 * math.tan(math.radians(27)), alt / 2))
            perna.data.update()
            zmin = min(v.co.z for v in perna.data.vertices)
            mb.transforma(perna, loc=(0, 0, -zmin))
            it.add(perna)
    it.slot("tampo", (0, 0, A + 0.002), (L - 0.1, 0.62, 0.4))
    it.colisao([((0, 0, A - 0.09), (L, 0.7, 0.09)), ((0, 0.6, 0.38), (L, 0.28, 0.084)), ((0, -0.6, 0.38), (L, 0.28, 0.084))] +
               [((sx * (L / 2 - 0.22), 0, 0), (0.08, 1.0, 0.38)) for sx in (-1, 1)])
    return it, dict(rotulo="Mesa de piquenique com bancos", grupo="mesa_piquenique",
                    tags=["externa", "jardim", "bancos", "madeira"])


# ------------------------------------------------------------------------------------------------ tubos de chaminé
R_TUBO = 0.065


def colar(z, x=0.0, y=0.0, cor="ferro", eixo="z"):
    return mb.cilindro(R_TUBO + 0.008, 0.035, x=x, y=y, z=z, cor=cor, seg=28, bisel=0.006, eixo=eixo)


@peca("lareiras", "tubo_chamine_reto")
def _():
    it = mb.Item("tubo_chamine_reto")
    it.add(mb.cilindro(R_TUBO, 1.0, cor="grafite", seg=28, bisel=0.004))
    it.add(colar(0.0), colar(1.0 - 0.035), colar(0.48))
    return it, dict(rotulo="Tubo de chaminé reto (1 m)", grupo="tubo_chamine", tags=["tubo", "chaminé", "modular"])


@peca("lareiras", "tubo_chamine_cotovelo")
def _():
    it = mb.Item("tubo_chamine_cotovelo")
    pts = [(0, 0, 0.0), (0, 0, 0.32), (0, 0.32, 0.32)]
    it.add(mb.tubo(pts, R_TUBO, cor="grafite", raio_curva=0.16, seg=24, nome="cotovelo"))
    it.add(colar(0.0))
    it.add(mb.cilindro(R_TUBO + 0.008, 0.035, x=0, y=0.32 - 0.035 / 2, z=0.32, cor="ferro", seg=28, bisel=0.006,
                       eixo="y"))
    it.colisao([((0, 0.08, 0), (0.16, 0.32, 0.4))])
    return it, dict(rotulo="Cotovelo de chaminé (90°)", grupo="tubo_chamine", tags=["tubo", "chaminé", "modular"])


@peca("lareiras", "tubo_chamine_chapeu")
def _():
    it = mb.Item("tubo_chamine_chapeu")
    it.add(mb.cilindro(R_TUBO, 0.3, cor="grafite", seg=28, bisel=0.004), colar(0.0))
    for k in range(3):
        g = math.radians(90 + 120 * k)
        it.add(mb.cilindro(0.008, 0.1, x=0.055 * math.cos(g), y=0.055 * math.sin(g), z=0.29, cor="ferro", seg=8,
                           bisel=0.002))
    it.add(mb.torno([(0, 0.44), (0.17, 0.37), (0.175, 0.36), (0.16, 0.355), (0, 0.42)], cor="ferro", seg=32))
    it.add(mb.esfera(0.018, z=0.445, cor="ferro", seg=12))
    return it, dict(rotulo="Chapéu de chaminé", grupo="tubo_chamine", tags=["tubo", "chaminé", "modular"])


# --------------------------------------------------------------------------------------------------------- grills
def grill_bancada(id_, cor, cor2):
    it = mb.Item(id_)
    L, P = 0.44, 0.30
    it.add(mb.superelipsoide(L, P, 0.085, z=0.018, cor=cor, e=0.25, e_v=0.4, nu=32, nv=10))
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.add(mb.cilindro(0.014, 0.02, x=sx * (L / 2 - 0.05), y=sy * (P / 2 - 0.05), cor="borracha", seg=12,
                               bisel=0.004))
        it.add(mb.superelipsoide(0.05, 0.08, 0.035, x=sx * (L / 2 + 0.012), z=0.05, cor="preto", e=0.5))
    it.add(mb.caixa(L - 0.08, P - 0.07, 0.012, z=0.1, cor="ferro", bisel=0.004))
    for k in range(7):  # frisos da chapa
        it.add(mb.caixa(L - 0.1, 0.008, 0.008, y=-(P - 0.11) / 2 + k * (P - 0.11) / 6, z=0.11, cor="grafite",
                        bisel=0.003, seg=1))
    it.add(mb.cilindro(0.016, 0.012, x=L / 2 - 0.06, y=-P / 2 + 0.005, z=0.05, cor="cromo", eixo="y", seg=16))
    it.add(mb.cilindro(0.006, 0.006, x=-L / 2 + 0.07, y=-P / 2 + 0.002, z=0.07, cor="vermelho", eixo="y", seg=10))
    tampa = mb.superelipsoide(L - 0.01, P - 0.01, 0.12, cor=cor, e=0.3, e_v=0.5, nu=32, nv=12)
    tampa.data.update()
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(tampa.data)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, 0.06),
                           plane_no=(0, 0, 1), clear_inner=True)
    bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary])
    bm.to_mesh(tampa.data)
    bm.free()
    mb.transforma(tampa, loc=(0, 0, 0.1 - 0.06 + 0.012))
    alca = mb.tubo([(-0.08, -P / 2 + 0.03, 0.15), (-0.08, -P / 2 - 0.01, 0.15), (0.08, -P / 2 - 0.01, 0.15),
                    (0.08, -P / 2 + 0.03, 0.15)], 0.009, cor=cor2, raio_curva=0.02)
    it.porta([tampa, alca], dobradica=(0, P / 2 - 0.02, 0.112), eixo="x", lado="cima", abre_graus=80, nome="tampa")
    it.slot("chapa", (0, 0, 0.12), (L - 0.12, P - 0.1, 0.05))
    return it


@peca("cozinha_eletros", "grill_bancada_vermelho")
def _():
    return grill_bancada("grill_bancada_vermelho", "vermelho", "preto"), dict(
        rotulo="Grill elétrico de bancada (vermelho)", grupo="grill_bancada", fixacao="apoio",
        tags=["grill", "eletro", "tampa"])


@peca("cozinha_eletros", "grill_bancada_grafite")
def _():
    return grill_bancada("grill_bancada_grafite", "grafite", "laranja"), dict(
        rotulo="Grill elétrico de bancada (grafite)", grupo="grill_bancada", fixacao="apoio",
        tags=["grill", "eletro", "tampa"])


@peca("cozinha_eletros", "churrasqueira_bola_preta")
def _():
    it = mb.Item("churrasqueira_bola_preta")
    R, zr = 0.29, 0.66
    it.add(mb.torno([(0, zr - R * 0.95), (R * 0.45, zr - R * 0.88), (R * 0.78, zr - R * 0.6), (R * 0.95, zr - R * 0.28),
                     (R, zr), (R * 0.96, zr + 0.004), (R * 0.9, zr - 0.01), (0, zr - 0.02)], cor="preto", seg=40))
    it.add(mb.extrudado(mb.circulo(R * 0.86, 36), 0.006, z=zr - 0.03, cor="cromo", bisel=0.002))
    for k in range(-6, 7):  # grelha
        w = math.sqrt(max(0.0, (R * 0.86) ** 2 - (k * 0.035) ** 2)) * 2
        if w > 0.05:
            it.add(mb.caixa(w - 0.02, 0.005, 0.008, y=k * 0.035, z=zr - 0.024, cor="metal", bisel=0.002, seg=1))
    it.add(mb.esfera(0.03, z=zr - R * 0.93, cor="cromo", esc=(1, 1, 0.4), seg=16))
    for k in range(3):
        g = math.radians(90 + 120 * k)
        p0 = (R * 0.55 * math.cos(g), R * 0.55 * math.sin(g), zr - R * 0.75)
        p1 = (0.36 * math.cos(g), 0.36 * math.sin(g), 0.04)
        it.add(mb.tubo([p0, p1], 0.014, cor="metal", nome="perna"))
        if k:
            it.add(mb.cilindro(0.045, 0.03, x=p1[0], y=p1[1], z=0.045, cor="borracha", eixo="x", seg=20,
                               bisel=0.006))
        else:
            it.add(mb.esfera(0.02, x=p1[0], y=p1[1], z=0.02, cor="borracha", seg=12))
    pts = [(0.2 * math.cos(math.radians(a)), 0.2 * math.sin(math.radians(a)), 0.2) for a in range(0, 361, 15)]
    it.add(mb.tubo(pts, 0.008, cor="metal", raio_curva=0, seg=8, nome="anel"))
    tampa = mb.torno([(0, zr + R * 0.82), (R * 0.4, zr + R * 0.76), (R * 0.75, zr + R * 0.5), (R * 0.95, zr + R * 0.18),
                      (R * 1.01, zr + 0.004), (R * 0.97, zr + 0.002), (0, zr + 0.01)], cor="preto", seg=40)
    alca = mb.tubo([(-0.07, 0, zr + R * 0.8), (-0.07, 0, zr + R * 0.8 + 0.04), (0.07, 0, zr + R * 0.8 + 0.04),
                    (0.07, 0, zr + R * 0.8)], 0.012, cor="madeira", raio_curva=0.02)
    respiro = mb.cilindro(0.04, 0.012, z=zr + R * 0.62, y=-0.12, cor="cromo", seg=18, bisel=0.004)
    it.porta([tampa, alca, respiro], dobradica=(0, R + 0.005, zr + 0.004), eixo="x", lado="cima", abre_graus=95,
             nome="tampa")
    it.slot("grelha", (0, 0, zr - 0.016), (R * 1.1, R * 1.1, 0.15))
    it.colisao([((0, 0, zr - R), (2 * R, 2 * R, R + 0.25)), ((0, 0, 0), (0.7, 0.7, zr - R))])
    return it, dict(rotulo="Churrasqueira de bola com tampa", grupo="churrasqueira_bola",
                    tags=["grill", "churrasqueira", "externa", "tampa"])


# ------------------------------------------------------------------------------------------- saleiro e pimenteiro
def galheta(x, y, conteudo, cor_tampa, h=0.085):
    ps = [mb.torno([(0, 0), (0.024, 0), (0.027, 0.006), (0.024, 0.03), (0.021, h - 0.02), (0.019, h - 0.012),
                    (0, h - 0.012)], x=x, y=y, cor=None, mat="vidro", seg=24)]
    ps.append(mb.torno([(0, 0.004), (0.022, 0.004), (0.021, 0.035), (0.0, 0.035)], x=x, y=y, cor=conteudo, seg=20))
    ps.append(mb.torno([(0, h - 0.016), (0.0205, h - 0.016), (0.0205, h - 0.006), (0.017, h), (0, h + 0.003)], x=x,
                       y=y, cor=cor_tampa, seg=24))
    for k in range(5):
        g = math.radians(72 * k)
        ps.append(mb.cilindro(0.0022, 0.002, x=x + 0.008 * math.cos(g), y=y + 0.008 * math.sin(g), z=h + 0.0015,
                              cor="preto", seg=8, bisel=0))
    return ps


@peca("cozinha_eletros", "saleiro")
def _():
    it = mb.Item("saleiro")
    it.add(galheta(0, 0, "branco", "cromo"))
    return it, dict(rotulo="Saleiro", grupo="saleiro_pimenteiro", fixacao="apoio", tags=["saleiro", "tempero"])


@peca("cozinha_eletros", "pimenteiro")
def _():
    it = mb.Item("pimenteiro")
    it.add(galheta(0, 0, "carvao", "preto"))
    return it, dict(rotulo="Pimenteiro", grupo="saleiro_pimenteiro", fixacao="apoio", tags=["pimenteiro", "tempero"])


@peca("cozinha_eletros", "saleiro_pimenteiro_bandeja")
def _():
    it = mb.Item("saleiro_pimenteiro_bandeja")
    it.add(mb.extrudado(mb.ret_arredondado(0.15, 0.08, 0.03), 0.012, cor="madeira_clara", bisel=0.004))
    it.add(mb.tubo([(-0.06, 0.03, 0.012), (-0.06, 0.03, 0.09), (0.06, 0.03, 0.09), (0.06, 0.03, 0.012)], 0.005,
                   cor="madeira", raio_curva=0.015))
    for o in galheta(-0.035, 0, "branco", "cromo") + galheta(0.035, 0, "carvao", "preto"):
        mb.transforma(o, loc=(0, 0, 0.012))
        it.add(o)
    return it, dict(rotulo="Saleiro e pimenteiro na bandeja", grupo="saleiro_pimenteiro", fixacao="apoio",
                    tags=["saleiro", "pimenteiro", "tempero"])


# ------------------------------------------------------------------------------------------ notebook e computador
@peca("objetos", "notebook_azul")
def _():
    it = mb.Item("notebook_azul")
    L, P, e = 0.34, 0.24, 0.018
    it.add(mb.caixa(L, P, e, cor="cinza_claro", bisel=0.006))
    it.add(mb.caixa(L - 0.04, 0.115, 0.002, y=0.035, z=e - 0.001, cor="grafite", bisel=0.001, seg=1))
    for lin in range(4):  # teclas
        for col in range(12):
            it.add(mb.caixa(0.019, 0.019, 0.003, x=-0.12 + col * 0.0218, y=0.075 - lin * 0.025, z=e, cor="cinza_claro",
                            bisel=0.002, seg=1))
    it.add(mb.caixa(0.1, 0.06, 0.0015, y=-0.075, z=e - 0.0005, cor="cinza", bisel=0.002, seg=1))
    tampa = mb.caixa(L, P, 0.01, y=0, z=e + 0.004, cor="azul_celeste", bisel=0.005)
    tela = mb.caixa(L - 0.03, P - 0.035, 0.002, y=0.002, z=e + 0.0035, cor="tela_azul", bisel=0.001, seg=1)
    moldura = mb.caixa(L - 0.008, P - 0.008, 0.002, z=e + 0.003, cor="preto", bisel=0.001, seg=1)
    it.porta([tampa, tela, moldura], dobradica=(0, P / 2 - 0.004, e + 0.004), eixo="x", lado="cima", abre_graus=108,
             nome="tampa")
    return it, dict(rotulo="Notebook (azul)", grupo="notebook", fixacao="apoio", tags=["computador", "notebook", "tampa"])


@peca("objetos", "computador_mesa")
def _():
    it = mb.Item("computador_mesa")
    # monitor
    it.add(mb.extrudado(mb.ret_arredondado(0.18, 0.13, 0.03), 0.012, y=0.06, cor="grafite", bisel=0.004))
    it.add(mb.caixa(0.04, 0.025, 0.16, y=0.08, z=0.01, cor="grafite", bisel=0.008))
    it.add(mb.caixa(0.52, 0.03, 0.32, y=0.055, z=0.12, cor="grafite", bisel=0.012))
    it.add(mb.caixa(0.49, 0.004, 0.29, y=0.038, z=0.135, cor="tela_azul", bisel=0.002, seg=1))
    it.add(mb.caixa(0.2, 0.0045, 0.08, x=-0.12, y=0.0375, z=0.29, cor="azul", bisel=0.002, seg=1))
    it.add(mb.caixa(0.14, 0.0045, 0.12, x=0.13, y=0.0375, z=0.16, cor="azul_celeste", bisel=0.002, seg=1))
    # teclado e mouse
    it.add(mb.caixa(0.42, 0.13, 0.016, y=-0.13, cor="cinza_claro", bisel=0.006))
    for lin in range(4):
        for col in range(16):
            it.add(mb.caixa(0.021, 0.021, 0.006, x=-0.183 + col * 0.0244, y=-0.092 - lin * 0.0255, z=0.014,
                            cor="branco", bisel=0.0025, seg=1))
    it.add(mb.superelipsoide(0.06, 0.1, 0.035, x=0.29, y=-0.12, cor="branco", e=0.6, e_v=0.6, nu=20, nv=10))
    it.add(mb.caixa(0.004, 0.035, 0.002, x=0.29, y=-0.145, z=0.034, cor="cinza", bisel=0.001, seg=1))
    # gabinete
    it.add(mb.caixa(0.18, 0.38, 0.4, x=-0.45, y=0.0, cor="grafite", bisel=0.012))
    it.add(mb.caixa(0.15, 0.004, 0.36, x=-0.45, y=-0.19, z=0.02, cor="ferro", bisel=0.002, seg=1))
    it.add(mb.cilindro(0.012, 0.006, x=-0.45, y=-0.193, z=0.34, cor="azul_celeste", eixo="y", seg=16, bisel=0.002))
    it.add(mb.caixa(0.1, 0.004, 0.018, x=-0.45, y=-0.193, z=0.29, cor="preto", bisel=0.001, seg=1))
    return it, dict(rotulo="Computador de mesa", grupo="computador", fixacao="apoio",
                    tags=["computador", "monitor", "teclado"])


# ------------------------------------------------------------------------------------- notas adesivas e prateleiras
def nota(x, z, cor, rot=0.0, tam=0.075):
    n = mb.caixa(tam, 0.0016, tam, x=0, y=-0.0008, z=-tam / 2, cor=cor, bisel=0.0006, seg=1)
    # canto de baixo levemente descolado (a nota "levanta" um pouco)
    for v in n.data.vertices:
        if v.co.z < -tam * 0.8:
            v.co.y -= (-tam * 0.8 - v.co.z) * 0.25
    mb.transforma(n, rot=("Y", rot), loc=(x, 0, z))
    return n


@peca("objetos", "nota_adesiva_amarela")
def _():
    it = mb.Item("nota_adesiva_amarela")
    it.add(nota(0, 0.075, "papel_amarelado", 4))
    return it, dict(rotulo="Nota adesiva (amarela)", grupo="notas_adesivas", fixacao="parede",
                    altura_instalacao=1.4, tags=["papel", "bilhete"], miniatura_dir=(0.3, -1, 0.15))


@peca("objetos", "notas_adesivas_grupo")
def _():
    it = mb.Item("notas_adesivas_grupo")
    it.add(nota(-0.05, 0.16, "papel_amarelado", -6), nota(0.045, 0.14, "papel", 8), nota(0.0, 0.075, "pessego", -3))
    return it, dict(rotulo="Notas adesivas (grupo)", grupo="notas_adesivas", fixacao="parede", altura_instalacao=1.4,
                    tags=["papel", "bilhete"], miniatura_dir=(0.3, -1, 0.15))


def prateleira_suportes(id_, tampo, suporte, L=0.6, P=0.22):
    it = mb.Item(id_)
    esp = 0.04
    it.add(mb.caixa(L, P, esp, y=-P / 2, z=0.2, cor=tampo, bisel=0.012))
    for sx in (-1, 1):  # mãos-francesas em perfil curvo
        cont = [(0.0, 0.0), (0.0, 0.2), (-0.18, 0.2)] + [(-0.18 + 0.18 * math.sin(math.radians(a)),
                                                           0.2 - 0.2 * (1 - math.cos(math.radians(a)))) for a in
                                                          range(10, 90, 10)]
        sup = mb.extrudado(mb._ccw([(y_, z_) for y_, z_ in cont]), 0.035, cor=suporte, bisel=0.008, plano="yz")
        mb.transforma(sup, loc=(sx * (L / 2 - 0.1) - 0.0175, 0, 0))
        it.add(sup)
    it.slot("tampo", (0, -P / 2, 0.2 + esp), (L - 0.04, P - 0.02, 0.4))
    return it


@peca("estantes", "prateleira_maos_francesas_verde")
def _():
    return prateleira_suportes("prateleira_maos_francesas_verde", "verde", "terracota"), dict(
        rotulo="Prateleira de parede com mãos-francesas (verde)", grupo="prateleira_maos_francesas",
        fixacao="parede", altura_instalacao=1.6, tags=["prateleira", "parede"])


@peca("estantes", "prateleira_maos_francesas_turquesa")
def _():
    return prateleira_suportes("prateleira_maos_francesas_turquesa", "turquesa_claro", "azul"), dict(
        rotulo="Prateleira de parede com mãos-francesas (turquesa)", grupo="prateleira_maos_francesas",
        fixacao="parede", altura_instalacao=1.4, tags=["prateleira", "parede"])


for c, id_, f in PECAS:
    if SO and id_ not in SO:
        continue
    mb.limpa()
    it, op = f()
    rot = op.pop("rotulo")
    cat(c).exporta(it, rot, **op)
for c in CATS.values():
    c.salva()
print("fim", len(PECAS))
