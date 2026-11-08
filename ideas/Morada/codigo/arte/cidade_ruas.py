"""Biblioteca de cidade do Morada: infraestrutura de ruas (ruas, pisos, estacionamentos).

Uso (ver GUIA_CIDADE.md):
  blender-venv/bin/python -I morada-art/cidade_ruas.py -- SP/cidade_out [ruas|pisos|estacionamentos|<ids>...]
Sem argumentos depois da saída, gera as três categorias. Com nomes de categoria, só elas; com ids, só essas peças.

Convenções: grade de 15 m, origem no centro, calçada em z = 0, asfalto em z = −0,10, meio-fio até +0,10, laje até
−0,40. Perfis cb.RUA / cb.AVENIDA centrados na borda. Mão de direção à DIREITA (Brasil): a linha de retenção fica na
metade da pista de quem chega ao cruzamento.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Vector  # noqa: E402

import moveis_base as mb  # noqa: E402
import cidade_base as cb  # noqa: E402

V = Vector
H, Q = cb.H, cb.Q
ZA, ZF, T = cb.Z_ASF, cb.Z_FUNDO, cb.ALT_TINTA
RUA, AV = cb.RUA, cb.AVENIDA
VAGA_L, VAGA_C, LINHA_VAGA = 2.5, 5.0, 0.12


# =====================================================================================================================
# Utilidades de desenho
# =====================================================================================================================
def ret(x0, y0, x1, y1):
    return cb.quadrado(min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1))


def calc(pts, cor="calcada", z=0.0, nome="calcada"):
    return cb.laje(pts, z, cor, nome=nome)


def asf(pts, cor="asfalto"):
    return cb.laje(pts, ZA, cor, nome="asfalto")


def _normais_para_cima(ob):
    me = ob.data
    if me.polygons and sum(p.normal.z for p in me.polygons) < 0:
        me.flip_normals()
    return ob


def poli(pts, z=ZA, cor="branco", nome="tinta", alt=T):
    """Pintura plana (uma face, 4 mm acima do piso z) com o contorno dado."""
    pts = mb._ccw([tuple(p) for p in pts])
    bm = bmesh.new()
    vs = [bm.verts.new((p[0], p[1], z + alt)) for p in pts]
    f = bm.faces.new(vs)
    if len(vs) > 4:
        bmesh.ops.triangulate(bm, faces=[f], quad_method="BEAUTY", ngon_method="BEAUTY")
    return _normais_para_cima(mb._obj(nome, bm, cor, liso=False))


def linha(p0, p1, larg=LINHA_VAGA, cor="branco", z=ZA):
    a, b = V((p0[0], p0[1])), V((p1[0], p1[1]))
    d = (b - a).normalized()
    n = V((-d.y, d.x)) * (larg / 2)
    return poli([a - n, b - n, b + n, a + n], z=z, cor=cor)


def faixa(pts, **k):
    ob = cb.faixa(pts, **k)
    return _normais_para_cima(ob) if ob else None


def gira(objs, ang, loc=(0, 0, 0)):
    """Gira (graus, em Z) e move a malha de cada objeto."""
    out = []
    for o in objs if isinstance(objs, (list, tuple)) else [objs]:
        if o is not None:
            mb.transforma(o, loc=loc, rot=("Z", ang))
            out.append(o)
    return out


def zebra(cy, comp, largura=2.6, listra=0.5, z=ZA, cx=0.0):
    """Faixa de pedestres local: a rua corre em Y; listras paralelas à rua, centradas em x = cx, atravessando comp."""
    n = max(1, int(round(comp / (2 * listra))))
    objs = []
    for k in range(n):
        x = cx + (k - (n - 1) / 2) * 2 * listra
        objs.append(poli(ret(x - listra / 2, cy - largura / 2, x + listra / 2, cy + largura / 2), z=z))
    return objs


def linha_tracejada_transv(x0, x1, y, traco=0.5, vao=0.3, larg=0.3, z=ZA):
    """Linha de "dê a preferência": retângulos curtos em fila (local, atravessando em X)."""
    objs = []
    x = x0
    while x + traco <= x1 + 1e-6:
        objs.append(poli(ret(x, y - larg / 2, x + traco, y + larg / 2), z=z))
        x += traco + vao
    return objs


def seta(x, y, ang, comp=3.0, z=ZA, cor="branco"):
    """Seta pintada no chão apontando para +Y local, girada 'ang' graus (haste e ponta em peças convexas)."""
    w, hw, hl = 0.15, 0.45, 0.9
    haste = poli([(-w, -comp / 2), (w, -comp / 2), (w, comp / 2 - hl + 0.01), (-w, comp / 2 - hl + 0.01)], z=z, cor=cor)
    ponta = poli([(-hw, comp / 2 - hl), (hw, comp / 2 - hl), (0, comp / 2)], z=z, cor=cor)
    ob = mb.junta([haste, ponta], "seta")
    mb.transforma(ob, loc=(x, y, 0), rot=("Z", ang))
    return ob


def rampa(x0, x1, y0, y1, z_baixo, z_alto, alto="S", cor="asfalto", z_fundo=ZF):
    """Bloco com o topo inclinado (rebaixo de guia / entrada de garagem). 'alto' = lado do topo mais alto."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        x = x0 if v.co.x < 0 else x1
        y = y0 if v.co.y < 0 else y1
        if v.co.z < 0:
            z = z_fundo
        else:
            t = {"S": (y1 - y) / (y1 - y0), "N": (y - y0) / (y1 - y0), "O": (x1 - x) / (x1 - x0),
                 "L": (x - x0) / (x1 - x0)}[alto]
            z = z_baixo + (z_alto - z_baixo) * t
        v.co = V((x, y, z))
    return mb._obj("rampa", bm, cor, liso=False)


def contorno_arredondado(x0, y0, x1, y1, r, seg=6):
    pts = mb.ret_arredondado(x1 - x0, y1 - y0, r, seg)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    return [(p[0] + cx, p[1] + cy) for p in pts]


def arbusto(x, y, r=0.45, cor="folha", z=0.0):
    return mb.superelipsoide(2 * r, 2 * r, 1.5 * r, x=x, y=y, z=z - 0.05, cor=cor, e=0.8, e_v=0.8, nu=12, nv=6,
                             nome="arbusto")


def arvore(x, y, z=0.0, alt=3.2, r=1.3):
    tronco = mb.cilindro(0.13, alt * 0.55, x=x, y=y, z=z, cor="madeira_media", seg=10, r2=0.10)
    copa = [mb.superelipsoide(2 * r, 2 * r, 1.7 * r, x=x, y=y, z=z + alt * 0.42, cor="folha", e=0.85, e_v=0.85,
                              nu=14, nv=8, nome="copa"),
            mb.superelipsoide(1.3 * r, 1.3 * r, 1.1 * r, x=x + 0.35 * r, y=y - 0.25 * r, z=z + alt * 0.42 + 1.1 * r,
                              cor="folha_clara", e=0.85, e_v=0.85, nu=12, nv=6, nome="copa")]
    return [tronco] + copa


# ------------------------------------------------------------------------------------------------ placas
def _letra_p(esp=0.012, h=0.40, cor="branco", fundo="azul"):
    """Letra P (no plano XZ, centrada em x = 0, base em z = 0), saliente para −Y a partir de y = 0: silhueta branca
    e o miolo da barriga na cor do fundo da placa, 2 mm à frente."""
    b = 0.2 * h
    w = 0.66 * h
    x0 = -w / 2
    zb = 0.40 * h
    rb = (h - zb) / 2
    cz = zb + rb
    arco_ = [(x0 + w - rb + rb * math.cos(math.radians(a)), cz + rb * math.sin(math.radians(a)))
             for a in range(-90, 91, 15)]
    fora = [(x0, 0), (x0 + b, 0), (x0 + b, zb)] + arco_ + [(x0, h)]
    ri = rb - b
    arco_i = [(x0 + w - rb + ri * math.cos(math.radians(a)), cz + ri * math.sin(math.radians(a)))
              for a in range(-90, 91, 15)]
    miolo = [(x0 + b, zb + b)] + arco_i + [(x0 + b, h - b)]
    return [mb.extrudado(mb._ccw(fora), esp, y=-esp, cor=cor, bisel=min(0.004, esp / 3), plano="xz", nome="letra"),
            mb.extrudado(mb._ccw(miolo), esp + 0.002, y=-esp - 0.002, cor=fundo, bisel=0.0, plano="xz",
                         nome="miolo")]


def placa_p(x, y, ang=0.0, alt=2.4):
    """Totem de estacionamento: dois pés, painel azul com moldura branca e P branco nos dois lados (frente −Y local)."""
    L = 1.2
    zp = alt - L
    objs = []
    for sx in (-0.38, 0.38):
        objs.append(mb.cilindro(0.05, zp + 0.1, x=sx, cor="metal", seg=12, bisel=0.01))
        objs.append(mb.cilindro(0.08, 0.04, x=sx, cor="metal_escuro", seg=12, bisel=0.01))
    objs.append(mb.caixa(L, 0.12, L, z=zp, cor="branco", bisel=0.06, seg=3))
    objs.append(mb.caixa(L - 0.1, 0.14, L - 0.1, z=zp + 0.05, cor="azul", bisel=0.045, seg=3))
    for lado in (-1, 1):
        for o in _letra_p(esp=0.015, h=0.78):
            if lado > 0:  # verso: a letra gira 180° antes de ir para trás (lê certo de quem está atrás)
                mb.transforma(o, rot=("Z", 180))
            mb.transforma(o, loc=(0, lado * 0.07, zp + L / 2 - 0.39))
            objs.append(o)
    ob = mb.junta(objs, "placa_p")
    mb.transforma(ob, loc=(x, y, 0), rot=("Z", ang))
    return ob


def placa_onibus(x, y, ang=0.0, alt=2.6):
    objs = [mb.cilindro(0.05, alt - 0.1, cor="metal", seg=12, bisel=0.01),
            mb.caixa(0.5, 0.05, 0.7, z=alt - 0.75, cor="azul_medio", bisel=0.04),
            mb.caixa(0.32, 0.062, 0.22, z=alt - 0.48, cor="branco", bisel=0.04)]
    for sx in (-0.09, 0.09):  # rodinhas do ônibus no ícone
        objs.append(mb.cilindro(0.035, 0.07, x=sx, y=0, z=alt - 0.5, eixo="y", cor="branco", seg=10))
    objs.append(mb.caixa(0.36, 0.062, 0.05, z=alt - 0.62, cor="amarelo", bisel=0.015))
    ob = mb.junta(objs, "placa_onibus")
    mb.transforma(ob, loc=(x, y, 0), rot=("Z", ang))
    return ob


def placa_lombada(x, y, ang=0.0, alt=2.2):
    """Placa amarela em losango com borda preta e o desenho da lombada (frente para −Y local)."""
    objs = [mb.cilindro(0.045, alt - 0.2, cor="metal", seg=12, bisel=0.01)]
    borda = mb.caixa(0.5, 0.04, 0.5, z=-0.25, cor="preto", bisel=0.03)
    los = mb.caixa(0.44, 0.05, 0.44, z=-0.22, cor="amarelo", bisel=0.03)
    for o in (borda, los):
        mb.transforma(o, rot=("Y", 45))
    mb.transforma(borda, loc=(0, 0.006, alt - 0.35))
    mb.transforma(los, loc=(0, -0.004, alt - 0.35))
    meia = [(0.13 * math.cos(math.radians(180 * k / 12)), 0.075 * math.sin(math.radians(180 * k / 12)))
            for k in range(13)]
    objs += [borda, los,
             mb.extrudado(mb._ccw(meia), 0.012, x=0, y=-0.041, z=alt - 0.39, cor="preto", bisel=0.0, plano="xz"),
             mb.caixa(0.36, 0.012, 0.035, y=-0.035, z=alt - 0.425, cor="preto", bisel=0.005)]
    ob = mb.junta(objs, "placa_lombada")
    mb.transforma(ob, loc=(x, y, 0), rot=("Z", ang))
    return ob


# =====================================================================================================================
# Marcações de rua (sistema local: a rua corre em Y)
# =====================================================================================================================
def marcas_trecho(perfil, y0, y1, centro="auto", bordo=True, divisoria=True, x_div=None):
    """Faixas de um trecho reto entre y0 e y1 (local). centro: "tracejada", "continua", "dupla", "auto" ou None."""
    a = perfil["asf"]
    objs = []
    if y1 - y0 < 0.05:
        return objs
    if centro == "auto":
        centro = "tracejada" if perfil["faixas"] == 2 else "dupla"
    if centro == "tracejada":
        objs.append(faixa([(0, y0), (0, y1)], tracejada=(2.5, 2.5), fase=y0))
    elif centro == "continua":
        objs.append(faixa([(0, y0), (0, y1)]))
    elif centro == "dupla":
        objs += [faixa([(-0.12, y0), (-0.12, y1)]), faixa([(0.12, y0), (0.12, y1)])]
    if perfil["faixas"] == 4 and divisoria:
        xd = a / 2 - 0.06 if x_div is None else x_div
        objs += [faixa([(-xd, y0), (-xd, y1)], tracejada=(2.5, 2.5), fase=y0),
                 faixa([(xd, y0), (xd, y1)], tracejada=(2.5, 2.5), fase=y0)]
    if bordo:
        objs += [faixa([(-a + 0.3, y0), (-a + 0.3, y1)], larg=0.12), faixa([(a - 0.3, y0), (a - 0.3, y1)], larg=0.12)]
    return [o for o in objs if o]


def retencao(perfil, y, larg=0.4):
    """Linha de retenção na metade direita de quem chega (anda para −Y local, a direita dele é −X)."""
    a = perfil["asf"]
    x1 = -0.12 if perfil["faixas"] == 4 else -0.08
    return poli(ret(-(a - 0.3), y, x1, y + larg))


# =====================================================================================================================
# RUAS
# =====================================================================================================================
def p_rua_reta(it, perfil=RUA):
    cb.rua_reta(it, perfil)


def p_reta_faixa(it, perfil=RUA):
    """Reta com faixa de pedestres no meio, linhas de retenção antes dela e linha central contínua perto da faixa."""
    a, m = perfil["asf"], perfil["mf"]
    it.add(cb.laje(ret(-m, -H, m, H), ZA, "asfalto", nome="asfalto"))
    it.add(calc(ret(-H, -H, -m, H)), calc(ret(m, -H, H, H)))
    it.add(cb.meio_fio([(-m, H), (-m, -H)]), cb.meio_fio([(m, -H), (m, H)]))
    lz = 3.0
    yr = lz / 2 + 1.2
    for sg in (1, -1):
        ys = sorted((sg * (yr + 2.0), sg * H))
        it.add(marcas_trecho(perfil, ys[0], ys[1]))
        yc = sorted((sg * lz / 2 + sg * 0.25, sg * (yr + 2.0)))
        it.add(marcas_trecho(perfil, yc[0], yc[1], centro="continua" if perfil["faixas"] == 2 else "dupla",
                             divisoria=False))
        if perfil["faixas"] == 4:  # divisória de faixas contínua perto da travessia
            xd = a / 2 - 0.06
            it.add(faixa([(-xd, yc[0]), (-xd, yc[1])], larg=0.12), faixa([(xd, yc[0]), (xd, yc[1])], larg=0.12))
    it.add(zebra(0.0, 2 * (a - 0.45), largura=lz))
    it.add(retencao(perfil, yr))
    it.add(gira(retencao(perfil, yr), 180))


def _canto(xs, ys, mx, my, r, n=12):
    """Canto de cruzamento com perfis diferentes em cada eixo (mx = meio-fio da rua N-S, my = da rua L-O).
    Devolve (pontos do arco de (xs(mx+r), ys·my) até (xs·mx, ys(my+r)))."""
    cx, cy = xs * (mx + r), ys * (my + r)
    a1 = 270 if ys > 0 else 90
    a2 = 180 if xs > 0 else 0
    if abs(a2 - a1) > 180:
        a2 += 360
    return cb.arco(cx, cy, r, a1, a2, n)


def cruzamento(it, pv=RUA, ph=None, bracos=(True, True, True, True), r=2.5, faixas=False, pare=True):
    """Cruzamento em X ou T. pv = perfil da rua N-S, ph = da rua L-O. bracos = (norte, leste, sul, oeste).
    faixas=True põe faixa de pedestres nos braços (com a linha de retenção atrás dela)."""
    ph = ph or pv
    mx, my = pv["mf"], ph["mf"]
    N, L, S, O = bracos
    it.add(asf(ret(-mx, -my, mx, my)))
    if N:
        it.add(asf(ret(-mx, my, mx, H)))
    if S:
        it.add(asf(ret(-mx, -H, mx, -my)))
    if L:
        it.add(asf(ret(mx, -my, H, my)))
    if O:
        it.add(asf(ret(-H, -my, -mx, my)))
    for xs, ys, v, h in ((1, 1, N, L), (-1, 1, N, O), (-1, -1, S, O), (1, -1, S, L)):
        if v and h:
            arc = _canto(xs, ys, mx, my, r)
            it.add(asf([(xs * mx, ys * my)] + arc))
            it.add(calc(arc + [(xs * mx, ys * H), (xs * H, ys * H), (xs * H, ys * my)]))
            it.add(cb.meio_fio([(xs * mx, ys * H)] + arc[::-1] + [(xs * H, ys * my)]))
    if not N:
        it.add(calc(ret(-H, my, H, H)), cb.meio_fio([(H, my), (-H, my)]))
    if not S:
        it.add(calc(ret(-H, -H, H, -my)), cb.meio_fio([(-H, -my), (H, -my)]))
    if not L:
        it.add(calc(ret(mx, -H, H, H)), cb.meio_fio([(mx, -H), (mx, H)]))
    if not O:
        it.add(calc(ret(-H, -H, -mx, H)), cb.meio_fio([(-mx, H), (-mx, -H)]))
    # braços: marcações no sistema local (o braço sai para +Y) e giro
    for ok, ang, perfil, ini in ((N, 0, pv, my), (O, 90, ph, mx), (S, 180, pv, my), (L, -90, ph, mx)):
        if not ok:
            continue
        objs = []
        y0 = ini + r * 0.6
        if faixas:
            lz = 2.4
            yz = ini + 0.4 + lz / 2
            fim = yz + lz / 2
            objs += zebra(yz, 2 * (perfil["asf"] - 0.45), largura=lz)
            if pare and fim + 0.25 + 0.4 <= H - 0.05:
                objs.append(retencao(perfil, fim + 0.25))
            objs += marcas_trecho(perfil, fim + 0.15, H, centro="continua" if perfil["faixas"] == 2 else "dupla",
                                  divisoria=False)
        else:
            objs += marcas_trecho(perfil, y0, H)
            if pare:
                objs.append(retencao(perfil, y0))
        it.add(gira(objs, ang))


def p_lombada(it):
    """Rua reta com lombada pintada (faixas amarelas e pretas) e placas de aviso nas duas mãos."""
    a, m = RUA["asf"], RUA["mf"]
    it.add(cb.laje(ret(-m, -H, m, H), ZA, "asfalto", nome="asfalto"))
    it.add(calc(ret(-H, -H, -m, H)), calc(ret(m, -H, H, H)))
    it.add(cb.meio_fio([(-m, H), (-m, -H)]), cb.meio_fio([(m, -H), (m, H)]))
    comp, alt = 3.6, 0.10
    for sg in (1, -1):
        ys = sorted((sg * (comp / 2 + 0.6), sg * H))
        it.add(marcas_trecho(RUA, ys[0], ys[1]))
    # perfil da lombada (y, z), fechado embaixo
    n = 18
    perf = [(comp / 2 - comp * k / n, ZA + alt * math.sin(math.pi * k / n) ** 1.6) for k in range(n + 1)]
    perf = perf + [(-comp / 2, ZA - 0.03), (comp / 2, ZA - 0.03)]
    larg = 2 * (m - 0.10)
    nf = 12
    w = larg / nf
    for k in range(nf):
        cor = "amarelo" if k % 2 == 0 else "preto"
        x0 = -larg / 2 + k * w
        it.add(mb.extrudado(mb._ccw(perf), w, x=x0, y=0, z=0, cor=cor, bisel=0.0, plano="yz", nome="lombada",
                            liso=True))
    # setas de aviso pintadas antes da lombada (triângulos brancos na mão de quem chega)
    for sg in (1, -1):
        objs = []
        for k in range(3):
            yb = comp / 2 + 1.0 + k * 0.9
            xc = -a / 2
            objs.append(poli([(xc - 0.9, yb + 0.55), (xc + 0.9, yb + 0.55), (xc, yb)]))
        it.add(gira(objs, 0 if sg > 0 else 180))
    it.add(placa_lombada(-(m + 0.55), comp / 2 + 3.4, ang=180), placa_lombada(m + 0.55, -(comp / 2 + 3.4), ang=0))


def p_ponto_onibus(it):
    """Rua reta com baia de ônibus no lado leste: a calçada recua 2,6 m e cabe um ônibus de 12 m."""
    a, m = RUA["asf"], RUA["mf"]
    D = 2.6
    xb = m + D
    guia = mb._arredonda_cantos([(m, -H), (m, -7.25), (xb, -5.75), (xb, 5.75), (m, 7.25), (m, H)], 0.8, n=8)
    guia = [(p.x, p.y) for p in guia]
    it.add(cb.laje(ret(-m, -H, m, H), ZA, "asfalto", nome="asfalto"))
    it.add(asf([(m, -H)] + guia[1:-1] + [(m, H)]))
    it.add(calc(ret(-H, -H, -m, H)))
    it.add(calc(guia + [(H, H), (H, -H)]))
    it.add(cb.meio_fio([(-m, H), (-m, -H)]), cb.meio_fio(guia))
    it.add(faixa([(0, -H), (0, H)], tracejada=(2.5, 2.5), fase=-H))
    it.add(faixa([(-a + 0.3, -H), (-a + 0.3, H)], larg=0.12))
    # bordo leste: acompanha a pista até a baia e é tracejado na frente dela
    it.add(faixa([(a - 0.3, -H), (a - 0.3, -6.3)], larg=0.12), faixa([(a - 0.3, 6.3), (a - 0.3, H)], larg=0.12))
    it.add(faixa([(a - 0.3, -6.3), (a - 0.3, 6.3)], larg=0.12, tracejada=(1.0, 1.0), fase=-6.3))
    # moldura amarela da vaga do ônibus e a palavra-símbolo: zigue-zague amarelo
    yb0, yb1 = -5.3, 5.3
    xi = xb - 0.35
    it.add(faixa([(a + 0.05, yb0), (xi, yb0), (xi, yb1), (a + 0.05, yb1)], larg=0.15, cor="amarelo"))
    zz = []
    n = 8
    for k in range(n + 1):
        y = yb0 + 0.6 + (yb1 - yb0 - 1.2) * k / n
        zz.append((xi - 0.55 if k % 2 else xi - 1.75, y))
    it.add(faixa(zz, larg=0.13, cor="amarelo"))
    # ponto: placa, banco e piso de alerta junto à guia
    it.add(placa_onibus(xb + 0.55, 3.8, ang=0))
    banco = [mb.caixa(1.6, 0.42, 0.06, x=0, y=0, z=0.42, cor="madeira_mel", bisel=0.015),
             mb.caixa(1.6, 0.06, 0.38, x=0, y=0.2, z=0.5, cor="madeira_mel", bisel=0.015)]
    for sx in (-0.65, 0.65):
        banco.append(mb.caixa(0.06, 0.4, 0.42, x=sx, y=0.0, z=0.0, cor="ferro", bisel=0.01))
        banco.append(mb.caixa(0.06, 0.06, 0.5, x=sx, y=0.2, z=0.42, cor="ferro", bisel=0.01))
    b = mb.junta(banco, "banco")
    mb.transforma(b, rot=("Z", -90))
    mb.transforma(b, loc=(xb + 0.62, -0.6, 0))
    it.add(b)
    it.add(poli(ret(xb + 0.12, -2.4, xb + 0.42, 3.2), z=0.0, cor="amarelo", alt=0.003))


def p_transicao(it):
    """Transição de rua (borda sul, y = −7,5) para avenida (borda norte, y = +7,5): o meio-fio abre em S suave."""
    n = 30

    def xc(y):
        t = (y + H) / Q
        s = t * t * (3 - 2 * t)
        return RUA["mf"] + (AV["mf"] - RUA["mf"]) * s

    ys = [-H + Q * k / n for k in range(n + 1)]
    dir_ = [(xc(y), y) for y in ys]
    esq = [(-xc(y), y) for y in ys]
    it.add(asf(dir_ + esq[::-1]))
    it.add(calc(dir_ + [(H, H), (H, -H)]), calc(esq + [(-H, H), (-H, -H)]))
    it.add(cb.meio_fio(dir_), cb.meio_fio(esq[::-1]))
    # bordos acompanhando o meio-fio
    it.add(faixa([(x - 0.4, y) for x, y in dir_], larg=0.12), faixa([(-x + 0.4, y) for x, y in dir_], larg=0.12))
    # centro: tracejada (rua) → dupla contínua (avenida)
    it.add(faixa([(0, -H), (0, -2.5)], tracejada=(2.5, 2.5), fase=-H))
    it.add(faixa([(0, -2.5), (0, -0.5)]))
    yd = [-0.5 + (H + 0.5) * k / 12 for k in range(13)]
    for sg in (-1, 1):
        it.add(faixa([(sg * 0.12 * min(1, (y + 0.5) / 1.5), y) for y in yd]))
    # divisória das faixas da avenida: nasce quando a pista já tem largura
    xd = AV["asf"] / 2 - 0.06
    it.add(faixa([(xd, 1.25), (xd, H)], tracejada=(2.5, 2.5), fase=1.25),
           faixa([(-xd, 1.25), (-xd, H)], tracejada=(2.5, 2.5), fase=1.25))
    # quem vai para o norte ganha uma faixa (seta reta); quem vai para o sul perde a da direita (seta de convergência)
    it.add(seta(xd + 1.55, 2.6, 0, comp=2.4), seta(-(xd + 1.3), 3.4, 205, comp=2.4))


def p_canteiro(it, inicio=False):
    """Avenida com canteiro central de grama e meio-fio. inicio=True: o canteiro nasce no meio da peça com bico
    arredondado e área zebrada (a borda sul fica com o perfil da avenida comum, dupla contínua)."""
    a, m = AV["asf"], AV["mf"]
    wc = 0.55  # meio-fio do canteiro em x = ±wc
    y_ini = -H if not inicio else -1.5
    it.add(calc(ret(-H, -H, -m, H)), calc(ret(m, -H, H, H)))
    it.add(cb.meio_fio([(-m, H), (-m, -H)]), cb.meio_fio([(m, -H), (m, H)]))
    xdiv = (wc + 0.1 + a) / 2
    if not inicio:
        it.add(asf(ret(wc, -H, m, H)), asf(ret(-m, -H, -wc, H)))
        it.add(calc(ret(-wc, -H, wc, H), cor="grama", z=0.02, nome="canteiro"))
        it.add(cb.meio_fio([(wc, -H), (wc, H)]), cb.meio_fio([(-wc, H), (-wc, -H)]))
        for sg in (-1, 1):
            it.add(faixa([(sg * xdiv, -H), (sg * xdiv, H)], tracejada=(2.5, 2.5), fase=-H))
            it.add(faixa([(sg * (wc + 0.35), -H), (sg * (wc + 0.35), H)], larg=0.12, cor="amarelo"))
        ys_arb = (-5.0, 0.0, 5.0)
    else:
        bico = cb.arco(0, y_ini + wc, wc, 0, -180, 12)  # de (wc, y) por baixo até (−wc, y)
        canteiro = [(wc, H)] + bico + [(-wc, H)]
        it.add(asf([(0, -H), (m, -H), (m, H), (wc, H)] + bico[:len(bico) // 2 + 1]))
        it.add(asf([(0, -H)] + bico[len(bico) // 2:] + [(-wc, H), (-m, H), (-m, -H)]))
        it.add(calc(canteiro, cor="grama", z=0.02, nome="canteiro"))
        it.add(cb.meio_fio([(wc, H)] + bico + [(-wc, H)]))
        # área zebrada: duas linhas abrindo da dupla até o bico, com listras diagonais
        y0 = -H + 0.5
        for sg in (-1, 1):
            it.add(faixa([(sg * 0.12, -H), (sg * 0.12, y0)]))
            it.add(faixa([(sg * 0.12, y0), (sg * (wc + 0.25), y_ini + wc - 0.2), (sg * (wc + 0.35), H)], larg=0.12))
        for k in range(4):
            yb = y0 + 1.0 + k * 1.35
            t = (yb - y0) / (y_ini + wc - 0.2 - y0)
            hw = 0.12 + (wc + 0.25 - 0.12) * min(1, t) - 0.08
            it.add(linha((-hw, yb - 0.35), (hw, yb + 0.35), larg=0.22))
        for sg in (-1, 1):
            pts = []
            for k in range(13):
                y = -H + Q * k / 12
                t = min(1.0, max(0.0, (y + H) / (H + y_ini + 1.0)))
                s = t * t * (3 - 2 * t)
                pts.append((sg * ((a / 2 - 0.06) + (xdiv - (a / 2 - 0.06)) * s), y))
            # tracejado: em pedaços, cada traço segue a curva
            it.add(faixa(pts, tracejada=(2.5, 2.5), fase=-H))
        ys_arb = (2.5, 6.0)
    for sg in (-1, 1):
        it.add(faixa([(sg * (a - 0.3), -H), (sg * (a - 0.3), H)], larg=0.12))
    for y in ys_arb:
        it.add(arbusto(0, y, r=0.38, cor="folha"))
    it.add(arbusto(0, ys_arb[0] + 2.5 if not inicio else 4.25, r=0.26, cor="folha_clara"))


# ------------------------------------------------------------------------------------------------ rotatória
def _filete_reta_circulo(mx, Ro, rf, n=10):
    """Arredondamento entre a guia reta x = mx (lado +x, subindo para +y) e o círculo de raio Ro (centro na origem).
    Devolve os pontos de (mx, y1) até o ponto de tangência no círculo."""
    cxf = mx + rf
    cyf = math.sqrt((Ro + rf) ** 2 - cxf ** 2)
    a0 = 180.0
    a1 = math.degrees(math.atan2(-cyf, -cxf)) % 360
    return [(cxf + rf * math.cos(math.radians(a0 + (a1 - a0) * k / n)),
             cyf + rf * math.sin(math.radians(a0 + (a1 - a0) * k / n))) for k in range(n + 1)]


def _caminho_canto_ne(S, mx, Ro, rf, n_arco=24, angulos=False):
    """Guia do canto NE da rotatória: da guia direita do braço norte (mx, S) até a guia de cima do braço leste
    (S, mx), passando pelos arredondamentos e pelo anel externo."""
    f1 = _filete_reta_circulo(mx, Ro, rf)
    f2 = [(y, x) for x, y in f1][::-1]
    aA = math.degrees(math.atan2(f1[-1][1], f1[-1][0]))
    aB = math.degrees(math.atan2(f2[0][1], f2[0][0]))
    circ = cb.arco(0, 0, Ro, aA, aB, n_arco)
    if angulos:
        return aA, aB
    return [(mx, S)] + f1 + circ[1:-1] + f2 + [(S, mx)]


def rotatoria(it, S=Q, Ri=5.6, Ro=12.9, rf=2.4, perfil=RUA, zebrado=False, enfeite=True):
    m, a = perfil["mf"], perfil["asf"]
    ne = _caminho_canto_ne(S, m, Ro, rf)

    def rot(pts, k):
        c, s = [(1, 0), (0, 1), (-1, 0), (0, -1)][k % 4]
        return [(x * c - y * s, x * s + y * c) for x, y in pts]

    cantos = [rot(ne, k) for k in range(4)]  # NE, NO, SO, SE
    for k, cam in enumerate(cantos):
        it.add(calc(cam + rot([(S, S)], k)))
        it.add(cb.meio_fio(cam))
    # asfalto em duas metades (sem furo): direita x >= 0
    se = cantos[3]  # vai de (S, −mx) até (mx, −S)
    ilha_dir = cb.arco(0, 0, Ri, 90, -90, 32)
    meia = [(0, -S), (m, -S)] + se[::-1][1:-1] + [(S, -m), (S, m)] + ne[::-1][1:-1] + [(m, S), (0, S)] + ilha_dir
    it.add(asf(meia))
    it.add(asf([(-x, y) for x, y in meia]))
    # ilha central
    it.add(calc(mb.circulo(Ri, 48), cor="grama", z=0.03, nome="ilha"))
    it.add(cb.meio_fio(mb.circulo(Ri, 64), fechado=True))
    # faixas do anel
    Rm = (Ri + Ro) / 2
    it.add(faixa(cb.arco(0, 0, Rm, 0, 360, 96), tracejada=(2.0, 2.0)))
    it.add(faixa(cb.arco(0, 0, Ri + 0.4, 0, 360, 96), larg=0.12))
    aA, aB = _caminho_canto_ne(S, m, Ro, rf, angulos=True)
    for k in range(4):  # bordo externo só nos trechos de anel (entre os braços)
        it.add(faixa(cb.arco(0, 0, Ro - 0.4, aA + 90 * k, aB + 90 * k, 24), larg=0.12))
    # braços (local: braço sai para +Y)
    f1 = _filete_reta_circulo(m, Ro, rf)
    y_lig = f1[0][1]
    for k in range(4):
        objs = []
        y_ced = Ro + 0.35
        objs += linha_tracejada_transv(-(a - 0.3), -0.25, y_ced)
        objs.append(faixa([(-a + 0.3, y_lig), (-a + 0.3, S)], larg=0.12))
        objs.append(faixa([(a - 0.3, y_lig), (a - 0.3, S)], larg=0.12))
        if zebrado and S - y_lig > 5:
            yt = S - 1.5
            yb = Ro + 0.9
            objs.append(faixa([(0, S), (0, yt)]))
            objs.append(faixa([(0, yt), (-0.75, yb + 0.5), (-0.75, yb)], larg=0.12))
            objs.append(faixa([(0, yt), (0.75, yb + 0.5), (0.75, yb)], larg=0.12))
            for j in range(4):
                yj = yb + 0.6 + j * (yt - yb - 1.5) / 3
                hw = 0.75 * min(1, (yt - yj) / (yt - yb - 0.5)) - 0.1
                if hw > 0.15:
                    objs.append(linha((-hw, yj - 0.25), (hw, yj + 0.25), larg=0.2))
            objs.append(seta(-a / 2, yb + 2.2, 180, comp=2.4))
        else:
            objs.append(faixa([(0, y_ced + 0.2), (0, S)]))
        it.add(gira(objs, 90 * k))
    if enfeite:
        it.add(arvore(0, 0, z=0.03, alt=4.4 * Ri / 5.6, r=1.7 * Ri / 5.6))
        for k in range(8):
            ang = math.radians(22.5 + 45 * k)
            rr = Ri - 1.0
            it.add(arbusto(rr * math.cos(ang), rr * math.sin(ang), r=0.62 if k % 2 else 0.5,
                           cor="folha" if k % 2 else "rosa", z=0.03))


# =====================================================================================================================
# PISOS
# =====================================================================================================================
def p_calcada_lisa(it):
    it.add(calc(ret(-H, -H, H, H)))
    s = 1.5
    for k in range(1, 10):
        c = -H + k * s
        it.add(poli(ret(c - 0.018, -H, c + 0.018, H), z=0.0, cor="concreto", alt=0.002))
        it.add(poli(ret(-H, c - 0.018, H, c + 0.018), z=0.0, cor="concreto", alt=0.0025))
    for c in (-H + 0.02, H - 0.02):  # meia junta na borda: com a vizinha forma a junta inteira
        it.add(poli(ret(c - 0.018, -H, c + 0.018, H), z=0.0, cor="concreto", alt=0.002))
        it.add(poli(ret(-H, c - 0.018, H, c + 0.018), z=0.0, cor="concreto", alt=0.0025))


def p_ladrilho_rosado(it):
    """Ladrilho rosado em faixas (correm em Y): faixas rosadas de 2,4 m e faixas cinza de 0,6 m com sulcos escuros."""
    it.add(calc(ret(-H, -H, H, H), cor="piso_rosado"))
    per = 3.0
    for k in range(5):
        xc = -H + per * k + 0.3  # faixa cinza centrada junto às bordas da quadra (continua na vizinha)
        x0, x1 = xc - 0.3, xc + 0.3
        it.add(poli(ret(max(x0, -H), -H, min(x1, H), H), z=0.0, cor="concreto", alt=0.003))
        for xs in (x0 + 0.05, x1 - 0.05):
            if -H < xs < H:
                it.add(poli(ret(xs - 0.02, -H, xs + 0.02, H), z=0.0, cor="concreto_escuro", alt=0.004))
    # juntas dos ladrilhos nas faixas rosadas (a cada 0,6 m)
    for j in range(1, 25):
        y = -H + 0.6 * j
        for k in range(5):
            x0, x1 = -H + per * k + 0.6, -H + per * (k + 1)
            it.add(poli(ret(x0, y - 0.012, x1, y + 0.012), z=0.0, cor="madeira_rosada", alt=0.002))
    for k in range(5):
        xm = -H + per * k + 0.6 + 1.2
        it.add(poli(ret(xm - 0.012, -H, xm + 0.012, H), z=0.0, cor="madeira_rosada", alt=0.002))


def p_praca(it):
    """Piso de praça: calçada com rosácea central (anéis rosado e bege), raios e bordas de ladrilho."""
    it.add(calc(ret(-H, -H, H, H), cor="calcada"))
    z = 0.0
    it.add(poli(mb.circulo(5.6, 64), z=z, cor="concreto", alt=0.002))
    it.add(poli(mb.circulo(5.3, 64), z=z, cor="piso_rosado", alt=0.003))
    it.add(poli(mb.circulo(3.9, 64), z=z, cor="creme", alt=0.004))
    it.add(poli(mb.circulo(1.5, 48), z=z, cor="terracota_clara", alt=0.005))
    it.add(poli(mb.circulo(1.1, 48), z=z, cor="creme", alt=0.006))
    for k in range(8):
        ang = math.radians(45 * k)
        c, s = math.cos(ang), math.sin(ang)
        w = 0.32 if k % 2 == 0 else 0.2
        p = [(1.5, -w), (3.9, -w * 1.8), (3.9, w * 1.8), (1.5, w)]
        it.add(poli([(x * c - y * s, x * s + y * c) for x, y in p], z=z, cor="piso_rosado", alt=0.005))
    # caminhos em cruz até as bordas (continuam nas praças vizinhas) e moldura
    for ang in (0, 90, 180, 270):
        objs = [poli(ret(-1.2, 5.6, 1.2, H), z=z, cor="piso_rosado", alt=0.003),
                poli(ret(-1.35, 5.6, -1.2, H), z=z, cor="concreto", alt=0.003),
                poli(ret(1.2, 5.6, 1.35, H), z=z, cor="concreto", alt=0.003)]
        for j in range(1, 6):
            y = 5.6 + j * (H - 5.6) / 6
            objs.append(poli(ret(-1.2, y - 0.015, 1.2, y + 0.015), z=z, cor="madeira_rosada", alt=0.004))
        it.add(gira(objs, ang))
    # canteiros nos quatro cantos (grama com borda)
    for xs, ys in ((1, 1), (-1, 1), (-1, -1), (1, -1)):
        c = (xs * 5.75, ys * 5.75)
        it.add(cb.laje(contorno_arredondado(c[0] - 1.45, c[1] - 1.45, c[0] + 1.45, c[1] + 1.45, 0.6), 0.06, "concreto",
                       z_fundo=-0.05, nome="borda"))
        it.add(cb.laje(contorno_arredondado(c[0] - 1.28, c[1] - 1.28, c[0] + 1.28, c[1] + 1.28, 0.5), 0.08, "grama",
                       z_fundo=-0.04, nome="canteiro"))
        it.add(arbusto(c[0] + xs * 0.35, c[1] + ys * 0.35, r=0.55, cor="folha", z=0.08),
               arbusto(c[0] - xs * 0.55, c[1] + ys * 0.45, r=0.32, cor="rosa", z=0.08),
               arbusto(c[0] + xs * 0.45, c[1] - ys * 0.55, r=0.3, cor="amarelo", z=0.08))


def tufo(x, y, cor="grama_escura", alt=0.32, n=5, r=0.07, z=-0.02):
    objs = []
    for j in range(n):
        ang = j * 2 * math.pi / n + 0.4
        dx, dy = 0.08 * math.cos(ang), 0.08 * math.sin(ang)
        o = mb.cilindro(r, alt * (0.75 + 0.25 * (j % 2)), x=0, y=0, z=0, r2=0.006, cor=cor, seg=5, bisel=0.0)
        mb.transforma(o, loc=(x + dx, y + dy, z), rot=[("Z", math.degrees(ang)), ("Y", 14)])
        objs.append(o)
    return objs


def flores(x, y, cores=("amarelo", "branco"), z=0.0):
    objs = []
    for j, (dx, dy) in enumerate(((0, 0), (0.18, 0.1), (-0.12, 0.16), (0.05, -0.17))):
        objs.append(mb.cilindro(0.015, 0.2, x=x + dx, y=y + dy, z=z - 0.02, cor="folha_escura", seg=4, bisel=0.0))
        objs.append(mb.esfera(0.075, x=x + dx, y=y + dy, z=z + 0.2, cor=cores[j % len(cores)], seg=8,
                              esc=(1, 1, 0.7)))
    return objs


def p_grama(it):
    it.add(calc(ret(-H, -H, H, H), cor="grama"))
    for k in range(3):  # faixas de corte, período de 5 m (continuam na vizinha)
        x0 = -H + 5 * k + 2.5
        it.add(poli(ret(x0, -H, x0 + 2.5, H), z=0.0, cor="verde_claro", alt=0.002))
    for x, y in ((-5.2, 3.1), (2.4, -4.6), (5.8, 5.2), (-2.0, -1.5), (-6.1, -5.8), (3.7, 1.2), (0.6, 6.3), (-3.9, 6.6),
                 (6.4, -1.9), (-0.8, -6.2)):
        it.add(tufo(x, y))
    for x, y, c in ((-3.6, 4.6, ("amarelo", "branco")), (4.6, -2.8, ("branco", "lilas")),
                    (-1.2, -4.0, ("lilas", "amarelo")), (1.9, 3.3, ("branco", "rosa_bebe"))):
        it.add(flores(x, y, c))


def p_terra(it):
    """Terreno de terra batida com manchas, pedrinhas e tufos de capim."""
    it.add(calc(ret(-H, -H, H, H), cor="terra_seca"))
    manchas = [(-4.0, 3.5, 2.6, 1.7, "areia"), (3.8, -3.2, 3.0, 2.0, "bege_escuro"), (4.6, 4.8, 1.6, 1.1, "areia"),
               (-4.8, -4.4, 1.9, 1.4, "bege_escuro"), (0.3, 0.6, 1.3, 0.9, "areia")]
    for x, y, rx, ry, cor in manchas:
        pts = [(x + rx * math.cos(t) * (1 + 0.12 * math.sin(3 * t)), y + ry * math.sin(t) * (1 + 0.1 * math.cos(2 * t)))
               for t in [2 * math.pi * k / 20 for k in range(20)]]
        it.add(poli(pts, z=0.0, cor=cor, alt=0.003))
    import random
    rnd = random.Random(7)
    for k in range(22):
        x, y = rnd.uniform(-6.8, 6.8), rnd.uniform(-6.8, 6.8)
        r = rnd.uniform(0.1, 0.28)
        it.add(mb.superelipsoide(2 * r, 1.6 * r, r, x=x, y=y, z=-0.02, cor=rnd.choice(["cinza", "cinza_claro",
                                                                                  "concreto_escuro"]),
                                 e=0.7, e_v=0.7, nu=8, nv=4, nome="pedra"))
    for k in range(9):
        x, y = rnd.uniform(-6.5, 6.5), rnd.uniform(-6.5, 6.5)
        it.add(tufo(x, y, cor="verde_oliva" if k % 2 else "grama_escura", alt=0.3))


def p_grama_caminho(it):
    """Grama com caminho de ladrilho rosado (corre em Y, continua nas vizinhas) e guias baixas."""
    wc = 1.3
    it.add(calc(ret(-H, -H, -wc - 0.2, H), cor="grama"), calc(ret(wc + 0.2, -H, H, H), cor="grama"))
    it.add(calc(ret(-wc, -H, wc, H), cor="piso_rosado"))
    for sg in (-1, 1):
        x0 = sg * (wc + 0.1)
        it.add(cb.laje(ret(x0 - 0.1, -H, x0 + 0.1, H), 0.035, "concreto", nome="guia_baixa"))
    for j in range(1, 25):
        y = -H + 0.6 * j
        it.add(poli(ret(-wc, y - 0.015, wc, y + 0.015), z=0.0, cor="madeira_rosada", alt=0.002))
    it.add(poli(ret(-0.015, -H, 0.015, H), z=0.0, cor="madeira_rosada", alt=0.0025))
    for k in range(3):  # faixas de corte na grama
        x0 = -H + 5 * k + 2.5
        for a, b in ((x0, x0 + 2.5),):
            for lo, hi in ((-H, -wc - 0.2), (wc + 0.2, H)):
                aa, bb = max(a, lo), min(b, hi)
                if bb - aa > 0.05:
                    it.add(poli(ret(aa, -H, bb, H), z=0.0, cor="verde_claro", alt=0.002))
    for x, y, r, cor in ((-4.6, 3.5, 0.75, "folha"), (5.2, -4.2, 0.7, "folha"), (4.0, 5.0, 0.45, "folha_clara"),
                         (-5.6, -5.1, 0.5, "folha_clara")):
        it.add(arbusto(x, y, r=r, cor=cor))
    for x, y, c in ((-3.2, -2.0, ("amarelo", "branco")), (3.4, 0.8, ("rosa", "branco")), (5.9, 6.2, ("lilas",))):
        it.add(flores(x, y, c))
    for x, y in ((-6.3, 0.8), (2.6, -6.4), (6.2, -1.2)):
        it.add(tufo(x, y))


# =====================================================================================================================
# ESTACIONAMENTOS
# =====================================================================================================================
def lote(it, X, Y, borda=0.75, raio=1.2, entradas=(), cor_borda="calcada"):
    """Lote de estacionamento X × Y (metades), asfalto rebaixado com meio-fio em volta e calçada na borda.
    entradas: [(lado, centro, largura)] com lado em "N", "S", "L", "O": a guia some e uma rampa leva do asfalto (−0,10)
    à borda da quadra (0), sem degrau para a calçada vizinha."""
    xi, yi = X - borda, Y - borda
    it.add(asf(contorno_arredondado(-xi, -yi, xi, yi, raio, 8)))
    # borda de calçada em 4 tiras + cantos arredondados por dentro, cortada nas entradas
    gaps = {"N": [], "S": [], "L": [], "O": []}
    for lado, c, w in entradas:
        gaps[lado].append((c - w / 2, c + w / 2))

    def tiras(a0, a1, cortes):
        out, cur = [], a0
        for g0, g1 in sorted(cortes):
            if g0 > cur:
                out.append((cur, g0))
            cur = max(cur, g1)
        if cur < a1:
            out.append((cur, a1))
        return out

    for x0, x1 in tiras(-X, X, gaps["S"]):
        it.add(calc(ret(x0, -Y, x1, -yi), cor=cor_borda))
    for x0, x1 in tiras(-X, X, gaps["N"]):
        it.add(calc(ret(x0, yi, x1, Y), cor=cor_borda))
    for y0, y1 in tiras(-yi, yi, gaps["O"]):
        it.add(calc(ret(-X, y0, -xi, y1), cor=cor_borda))
    for y0, y1 in tiras(-yi, yi, gaps["L"]):
        it.add(calc(ret(xi, y0, X, y1), cor=cor_borda))
    for xs, ys in ((1, 1), (-1, 1), (-1, -1), (1, -1)):
        a0 = 0 if xs > 0 else 180
        a1 = (90 if ys > 0 else -90) if xs > 0 else (90 if ys > 0 else 270)
        arc = cb.arco(xs * (xi - raio), ys * (yi - raio), raio, a0, a1, 8)
        it.add(calc([(xs * xi, ys * yi)] + arc, cor=cor_borda))
    for lado, c, w in entradas:
        g0, g1 = c - w / 2, c + w / 2
        if lado == "S":
            it.add(rampa(g0, g1, -Y, -yi, ZA, 0.0, alto="S"))
        elif lado == "N":
            it.add(rampa(g0, g1, yi, Y, ZA, 0.0, alto="N"))
        elif lado == "O":
            it.add(rampa(-X, -xi, g0, g1, ZA, 0.0, alto="O"))
        else:
            it.add(rampa(xi, X, g0, g1, ZA, 0.0, alto="L"))
    # meio-fio: percorre o contorno arredondado, interrompido nas entradas
    cont = contorno_arredondado(-xi, -yi, xi, yi, raio, 8)
    pts = mb._ccw(cont)
    dens = cb._reamostra(pts + [pts[0]], passo=0.5)

    def no_vao(p):
        for lado, c, w in entradas:
            g0, g1 = c - w / 2 - 0.12, c + w / 2 + 0.12
            if lado in "NS" and abs(p.y - (yi if lado == "N" else -yi)) < 0.05 and g0 < p.x < g1:
                return True
            if lado in "LO" and abs(p.x - (xi if lado == "L" else -xi)) < 0.05 and g0 < p.y < g1:
                return True
        return False

    trechos, cur = [], []
    for p in dens:
        if no_vao(p):
            if len(cur) > 1:
                trechos.append(cur)
            cur = []
        else:
            cur.append((p.x, p.y))
    if len(cur) > 1:
        trechos.append(cur)
    if not entradas:
        it.add(cb.meio_fio(_limpa_pts([(p.x, p.y) for p in dens[:-1]]), fechado=True))
    else:
        if len(trechos) > 1 and trechos[0][0] == (dens[0].x, dens[0].y) and \
                trechos[-1][-1] == (dens[-1].x, dens[-1].y):
            trechos[0] = trechos[-1] + trechos[0][1:]
            trechos.pop()
        for tr in trechos:
            it.add(cb.meio_fio(_limpa_pts(tr)))


def _limpa_pts(pts):
    """Tira pontos repetidos e os do meio de trechos retos (o meio-fio reto só precisa das pontas)."""
    out = [pts[0]]
    for p in pts[1:]:
        if (V(p) - V(out[-1])).length > 1e-4:
            out.append(p)
    if len(out) < 3:
        return out
    simp = [out[0]]
    for a, b, c in zip(out, out[1:], out[2:]):
        d1, d2 = V(b) - V(a), V(c) - V(b)
        if d1.length > 1e-6 and d2.length > 1e-6 and d1.angle(d2) < math.radians(0.5):
            continue
        simp.append(b)
    simp.append(out[-1])
    return simp


def vagas_retas(x0, x1, y_ini, n, sentido=1, z=ZA, fundo=True):
    """n vagas lado a lado ao longo de Y a partir de y_ini (sentido ±1); a vaga vai de x0 (fundo) a x1 (frente)."""
    objs = []
    for k in range(n + 1):
        y = y_ini + sentido * k * VAGA_L
        objs.append(linha((x0, y), (x1, y), z=z))
    if fundo:
        ys = sorted((y_ini, y_ini + sentido * n * VAGA_L))
        objs.append(linha((x0, ys[0] - LINHA_VAGA / 2), (x0, ys[1] + LINHA_VAGA / 2), z=z))
    return objs


def vagas_angulo(x_frente, x_fundo, y_ini, n, ang=60, sentido=1, z=ZA, fundo=True):
    """n vagas inclinadas: as linhas vão da frente (x_frente) ao fundo (x_fundo), avançando em Y no 'sentido'.
    A largura da vaga (2,5 m) é medida perpendicular às linhas."""
    s = VAGA_L / math.sin(math.radians(ang))
    dy = abs(x_fundo - x_frente) / math.tan(math.radians(ang))
    objs = []
    for k in range(n + 1):
        y = y_ini + sentido * k * s
        objs.append(linha((x_frente, y), (x_fundo, y + sentido * dy), z=z))
    if fundo:
        ya, yb = y_ini + sentido * dy, y_ini + sentido * (dy + n * s)
        objs.append(linha((x_fundo, min(ya, yb) - 0.06), (x_fundo, max(ya, yb) + 0.06), z=z))
    return objs


def em_x(objs):
    """Troca X ↔ Y das pinturas (para desenhar fileiras ao longo de X com as funções em Y)."""
    for o in objs:
        me = o.data
        for v in me.vertices:
            v.co.x, v.co.y = v.co.y, v.co.x
        me.flip_normals()
        _normais_para_cima(o)
    return objs


def p_estac_grande(it):
    """2 × 1 quadras (30 × 15): fileiras retas nas laterais e fileira dupla em espinha de peixe no meio, corredores
    de mão única para o norte, entradas ao sul e saídas ao norte, placa P e meio-fio em volta."""
    X, Y = Q, H
    b = 0.75
    xi, yi = X - b, Y - b
    xa = [-xi + 0.1, -xi + 0.1 + VAGA_C]          # fileira oeste (fundo no meio-fio)
    hb = VAGA_C * math.sin(math.radians(60))       # 4,33
    xb = [-hb, hb]
    xc = [xi - 0.1 - VAGA_C, xi - 0.1]
    corr = [((xa[1] + xb[0]) / 2, xb[0] - xa[1]), ((xb[1] + xc[0]) / 2, xc[0] - xb[1])]
    entradas = [("S", c, w - 0.4) for c, w in corr] + [("N", c, w - 0.4) for c, w in corr]
    lote(it, X, Y, borda=b, entradas=entradas)
    n = 5
    y0 = -n * VAGA_L / 2
    it.add(vagas_retas(xa[0], xa[1], y0, n))
    it.add(vagas_retas(xc[1], xc[0], y0, n))
    # espinha de peixe: fileira dupla, linhas da espinha (x = 0) para os corredores, em "V" apontando para o norte
    s = VAGA_L / math.sin(math.radians(60))
    dy = hb / math.tan(math.radians(60))
    nl = 4
    tot = (nl - 1) * s + dy
    ytop0 = -tot / 2 + dy
    for k in range(nl):
        yk = ytop0 + k * s
        it.add(linha((0, yk), (-hb, yk - dy)), linha((0, yk), (hb, yk - dy)))
    it.add(linha((0, ytop0 - 0.06), (0, ytop0 + (nl - 1) * s + 0.06)))
    for c, w in corr:
        it.add(seta(c, -2.8, 0, comp=2.6), seta(c, 3.2, 0, comp=2.6))
        it.add(linha((c - w / 2 + 0.2, -yi + 0.6), (c + w / 2 - 0.2, -yi + 0.6), larg=0.3))  # linha de entrada
    it.add(placa_p(X - 1.2, -Y + 0.4, ang=0))
    it.add(placa_p(-X + 1.2, Y - 0.4, ang=180))
    # ilhas de grama nas cabeceiras da espinha
    for sg in (-1, 1):
        yc = sg * (yi - 0.6)
        it.add(cb.laje(contorno_arredondado(-1.4, yc - 0.45, 1.4, yc + 0.45, 0.4), 0.0, "calcada", nome="ilha"))
        it.add(cb.meio_fio(contorno_arredondado(-1.4, yc - 0.45, 1.4, yc + 0.45, 0.4, 6), fechado=True))
        it.add(cb.laje(contorno_arredondado(-1.2, yc - 0.3, 1.2, yc + 0.3, 0.28), 0.03, "grama", z_fundo=-0.05,
                       nome="grama"))
        it.add(arbusto(-0.6, yc, r=0.32), arbusto(0.45, yc, r=0.28, cor="folha_clara"))


def p_estac_quadra(it):
    """1 quadra: duas fileiras de 5 vagas retas viradas para o corredor central (mão única leste)."""
    X = Y = H
    b = 0.6
    yi = Y - b
    corr_w = 2 * yi - 2 * VAGA_C - 0.2
    lote(it, X, Y, borda=b, entradas=[("O", 0, corr_w - 0.4), ("L", 0, corr_w - 0.4)])
    n = 5
    x0 = -n * VAGA_L / 2
    it.add(em_x(vagas_retas(-yi + 0.1, -yi + 0.1 + VAGA_C, x0, n)))
    it.add(em_x(vagas_retas(yi - 0.1, yi - 0.1 - VAGA_C, x0, n)))
    it.add(seta(-3.0, 0, -90, comp=2.6), seta(3.0, 0, -90, comp=2.6))
    it.add(placa_p(-X + 1.3, -Y + 0.32, ang=0))


def p_estac_inclinado(it):
    """2 × 1 quadras com vagas inclinadas a 60° nas duas fileiras, corredor central de mão única (leste)."""
    X, Y = Q, H
    b = 0.6
    xi, yi = X - b, Y - b
    dep = VAGA_C * math.sin(math.radians(60))
    corr_w = 2 * yi - 2 * dep - 0.2
    lote(it, X, Y, borda=b, entradas=[("O", 0, corr_w - 0.3), ("L", 0, corr_w - 0.3)])
    s = VAGA_L / math.sin(math.radians(60))
    dx = dep / math.tan(math.radians(60))
    nl = int((2 * xi - 2.0 - dx) / s) + 1
    tot = (nl - 1) * s + dx
    xs0 = -tot / 2
    ya = corr_w / 2
    # fileira sul: da frente (y = −ya) ao fundo (y = −ya − dep), avançando em +x
    it.add(em_x(vagas_angulo(-ya, -ya - dep, xs0, nl - 1, ang=60, sentido=1)))
    it.add(em_x(vagas_angulo(ya, ya + dep, xs0, nl - 1, ang=60, sentido=1)))
    for x in (-8.5, 0.0, 8.5):
        it.add(seta(x, 0, -90, comp=2.6))
    it.add(placa_p(-X + 1.3, Y - 0.32, ang=180), placa_p(X - 1.3, -Y + 0.32, ang=0))


def p_vagas_rua(it):
    """1 × 2 quadras (15 × 30): rua reta com uma faixa de vagas paralelas recuada na calçada leste e placa P."""
    a, m = RUA["asf"], RUA["mf"]
    Y = Q
    xb = m + VAGA_L + 0.1
    n = 5
    yv = n * VAGA_C / 2
    guia = mb._arredonda_cantos([(m, -Y), (m, -Y + 0.4), (xb, -yv - 0.4), (xb, yv + 0.4), (m, Y - 0.4), (m, Y)],
                                0.7, n=8)
    guia = [(p.x, p.y) for p in guia]
    it.add(cb.laje(ret(-m, -Y, m, Y), ZA, "asfalto", nome="asfalto"))
    it.add(asf([(m, -Y)] + guia[1:-1] + [(m, Y)]))
    it.add(calc(ret(-H, -Y, -m, Y)))
    it.add(calc(guia + [(H, Y), (H, -Y)]))
    it.add(cb.meio_fio([(-m, Y), (-m, -Y)]), cb.meio_fio(guia))
    it.add(faixa([(0, -Y), (0, Y)], tracejada=(2.5, 2.5), fase=-Y))
    it.add(faixa([(-a + 0.3, -Y), (-a + 0.3, Y)], larg=0.12))
    it.add(faixa([(a - 0.3, -Y), (a - 0.3, -yv - 0.6)], larg=0.12), faixa([(a - 0.3, yv + 0.6), (a - 0.3, Y)], larg=0.12))
    # vagas paralelas: linha da frente (junto à pista) e divisórias em "T"
    xf = a - 0.05
    it.add(linha((xf, -yv), (xf, yv)))
    for k in range(n + 1):
        y = -yv + k * VAGA_C
        it.add(linha((xf, y), (xb - 0.12, y)))
    it.add(placa_p(xb + 0.45, -yv - 0.4, ang=90), placa_p(xb + 0.45, yv + 0.4, ang=90))
    for y in (-9.0, 0.0, 9.0):
        x = -(m + 1.9)
        it.add(arvore(x, y, alt=3.0, r=1.1))
        it.add(cb.laje(contorno_arredondado(x - 0.6, y - 0.6, x + 0.6, y + 0.6, 0.25), 0.015, "terra",
                       z_fundo=-0.05, nome="canteiro"))


# ------------------------------------------------------------------------------------------------ edifício-garagem
GAR_N = 4          # andares de vagas (térreo + 3 lajes, a última é o terraço)
GAR_PD = 3.0       # de piso a piso (pé-direito livre 2,7 m)
GAR_E = 0.3        # espessura da laje
GX = 14.0          # meia largura do prédio (28 × 28 m num lote de 30 × 30)
GI = GX - 0.3      # face de dentro do guarda-corpo
RX0, RX1 = -13.5, -10.3  # faixa da rampa (entre ela e o guarda-corpo fica uma faixa de laje para os pilares)
RY = 8.7           # a rampa vai de y = −RY (embaixo) a y = +RY (em cima)


def _laje_andar(z, cor="concreto"):
    """Laje de um andar (topo em z) com o furo da rampa: duas peças sem furo."""
    a = cb.laje(ret(RX1, -GX, GX, GX), z, cor, z_fundo=z - GAR_E, nome="laje")
    b = cb.laje([(-GX, -GX), (RX1, -GX), (RX1, -RY), (RX0, -RY), (RX0, RY), (RX1, RY), (RX1, GX), (-GX, GX)], z, cor,
                z_fundo=z - GAR_E, nome="laje")
    return [a, b]


def _piso_vagas(z, terraco=False):
    """Piso pintado de um andar: asfalto claro, vagas, setas."""
    objs = [poli(ret(RX1, -GI, GI, GI), z=z, cor="asfalto_claro", alt=0.003),
            poli(ret(RX0, RY, RX1, GI), z=z, cor="asfalto_claro", alt=0.003),
            poli(ret(RX0, -GI, RX1, -RY), z=z, cor="asfalto_claro", alt=0.003)]
    zz = z + 0.003
    n = 6
    y0 = -n * VAGA_L / 2
    xd0, xd1 = -5.3, 4.7    # fileira dupla (as vagas se encostam pelo fundo em x = −0,3)
    for k in range(n + 1):
        y = y0 + k * VAGA_L
        objs.append(linha((xd0, y), (xd1, y), z=zz))
        objs.append(linha((8.7, y), (GI - 0.1, y), z=zz))
    objs.append(linha((-0.3, y0 - 0.06), (-0.3, -y0 + 0.06), z=zz))
    objs.append(linha((GI - 0.1, y0 - 0.06), (GI - 0.1, -y0 + 0.06), z=zz))
    # setas de circulação: chega pela rampa no norte → corredor norte para leste → corredores leste e oeste para
    # o sul → corredor sul para oeste → rampa de subida (começa no sul)
    objs += [seta(-7.8, 3.0, 180, comp=2.4, z=zz), seta(-7.8, -4.0, 180, comp=2.4, z=zz),
             seta(6.7, 3.0, 180, comp=2.4, z=zz), seta(6.7, -4.0, 180, comp=2.4, z=zz),
             seta(-4.0, -11.2, 90, comp=2.4, z=zz),
             seta(4.0, 11.2, -90, comp=2.4, z=zz)]
    return objs


def _rampa_garagem(k):
    """Rampa do andar k ao k+1 na faixa oeste: laje inclinada com mureta do lado de dentro."""
    z0, z1 = k * GAR_PD, (k + 1) * GAR_PD
    bm = bmesh.new()
    # bloco inclinado: topo (z) e fundo (z − e)
    top = [V((RX0, -RY, z0)), V((RX1, -RY, z0)), V((RX1, RY, z1)), V((RX0, RY, z1))]
    bot = [p - V((0, 0, GAR_E)) for p in top]
    vt = [bm.verts.new(p) for p in top]
    vb = [bm.verts.new(p) for p in bot]
    bm.faces.new(vt)
    bm.faces.new(vb[::-1])
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((vb[i], vb[j], vt[j], vt[i]))
    laje = mb._obj("rampa", bm, "concreto", liso=False)
    piso = poli([(RX0 + 0.05, -RY), (RX1 - 0.25, -RY), (RX1 - 0.25, RY), (RX0 + 0.05, RY)], z=0, cor="asfalto_claro")
    for v in piso.data.vertices:
        t = (v.co.y + RY) / (2 * RY)
        v.co.z = z0 + (z1 - z0) * t + 0.004
    faixas = []
    for j in range(1, 8):  # faixas antiderrapantes
        y = -RY + j * 2 * RY / 8
        f = linha((RX0 + 0.3, y), (RX1 - 0.5, y), larg=0.14, z=0)
        for v in f.data.vertices:
            t = (v.co.y + RY) / (2 * RY)
            v.co.z = z0 + (z1 - z0) * t + 0.007
        faixas.append(f)
    # mureta do lado leste da rampa (0,9 m) e guia
    bm = bmesh.new()
    pts = [(RX1 - 0.2, -RY, z0), (RX1, -RY, z0), (RX1, RY, z1), (RX1 - 0.2, RY, z1)]
    vt = [bm.verts.new((x, y, z + 0.9)) for x, y, z in pts]
    vb = [bm.verts.new((x, y, z - 0.01)) for x, y, z in pts]
    bm.faces.new(vt)
    bm.faces.new(vb[::-1])
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((vb[i], vb[j], vt[j], vt[i]))
    mureta = mb._obj("mureta", bm, "concreto", liso=False)
    return [laje, piso, mureta] + faixas


def p_garagem(it):
    """Edifício-garagem de 4 andares (térreo + 3 lajes; a última é o terraço) num lote de 2 × 2 quadras."""
    S = Q
    # lote: calçada em volta e o térreo (asfalto claro) com a entrada ao sul
    ent0, ent1 = -10.3, -1.3
    it.add(calc(ret(-S, -S, ent0, -GX)), calc(ret(ent1, -S, S, -GX)), calc(ret(-S, GX, S, S)),
           calc(ret(-S, -GX, -GX, GX)), calc(ret(GX, -GX, S, GX)))
    it.add(cb.laje(ret(-GX, -GX, GX, GX), 0.0, "asfalto_claro", nome="terreo"))
    it.add(cb.laje(ret(ent0, -S, ent1, -GX), 0.0, "asfalto_claro", nome="entrada"))
    it.add(faixa([(ent0, -S + 0.2), (ent1, -S + 0.2)], larg=0.12, cor="amarelo", z=0.0))
    for sx in (ent0, ent1):  # guias boleadas nos lados da entrada
        it.add(cb.meio_fio([(sx, -S), (sx, -GX)]))
    # andares
    for k in range(GAR_N):
        z = k * GAR_PD
        if k > 0:
            it.add(_laje_andar(z))
        piso = _piso_vagas(z, terraco=(k == GAR_N - 1))
        if k == 0:  # no térreo o piso já é a laje de asfalto claro
            for o in piso[:3]:
                bpy.data.objects.remove(o)
            piso = piso[3:]
        it.add(piso)
        if k < GAR_N - 1:
            it.add(_rampa_garagem(k))
        # guarda-corpo do perímetro (1,1 m); no térreo é mureta baixa com a entrada aberta
        hgc = 1.1 if k > 0 else 0.6
        c = dict(cor="concreto", bisel=0.03, seg=2)
        if k > 0:
            it.add(mb.caixa(2 * GX, 0.3, hgc, y=-GX + 0.15, z=z, **c))
        else:
            it.add(mb.caixa(ent0 + GX, 0.3, hgc, x=(-GX + ent0) / 2, y=-GX + 0.15, z=z, **c),
                   mb.caixa(GX - ent1, 0.3, hgc, x=(ent1 + GX) / 2, y=-GX + 0.15, z=z, **c))
        it.add(mb.caixa(2 * GX, 0.3, hgc, y=GX - 0.15, z=z, **c))
        it.add(mb.caixa(0.3, 2 * GX - 0.6, hgc, x=-GX + 0.15, z=z, **c),
               mb.caixa(0.3, 2 * GX - 0.6, hgc, x=GX - 0.15, z=z, **c))
        # faixa escura de proteção no guarda-corpo (dá o ritmo horizontal da fachada)
        if k > 0:
            for (l, p, x, y) in ((2 * GX + 0.02, 0.32, 0, -GX + 0.15), (2 * GX + 0.02, 0.32, 0, GX - 0.15),
                                 (0.32, 2 * GX - 0.62, -GX + 0.15, 0), (0.32, 2 * GX - 0.62, GX - 0.15, 0)):
                it.add(mb.caixa(l, p, 0.12, x=x, y=y, z=z + hgc - 0.32, cor="concreto_escuro", bisel=0.01, seg=1))
        # guarda-corpo na beira do furo da rampa (andares 1..3)
        if k > 0:
            it.add(mb.caixa(0.2, 2 * RY, 1.1, x=RX1 + 0.12, y=0, z=z, **c))
    # pilares (perímetro sobe até o topo do guarda-corpo do terraço; os de dentro param na laje do terraço)
    zt = (GAR_N - 1) * GAR_PD
    pil = []
    for x in (-GX + 0.25, -5.3, -0.3, 8.7, GX - 0.25):
        for y in (-GX + 0.25, -RY, 0.0, RY, GX - 0.25):
            borda = abs(abs(x) - (GX - 0.25)) < 0.01 or abs(abs(y) - (GX - 0.25)) < 0.01
            if x in (-5.3, 8.7) and not borda:
                continue
            if x == -0.3 and borda:
                continue
            pil.append((x, y, borda))
    for x, y, borda in pil:
        it.add(mb.caixa(0.5, 0.5, zt + 1.1 if borda else zt - 0.01, x=x, y=y, z=0, cor="concreto", bisel=0.04,
                        seg=2))
    # topo: estrutura da rampa (mureta curva fechando o fim do furo) e torre de escada
    cxr, rc = (RX0 + RX1) / 2, (RX1 - RX0) / 2 + 0.25
    anel = [(cxr + rc * math.cos(math.radians(180 + 180 * k / 24)), -RY + rc * math.sin(math.radians(180 + 180 * k / 24)))
            for k in range(25)]
    anel += [(cxr + (rc - 0.25) * math.cos(math.radians(360 - 180 * k / 24)),
              -RY + (rc - 0.25) * math.sin(math.radians(360 - 180 * k / 24))) for k in range(25)]
    it.add(mb.extrudado(mb._ccw(anel), 1.4, z=zt, cor="concreto", bisel=0.03, nome="mureta_curva"))
    it.add(mb.caixa(0.6, 0.6, 1.5, x=cxr, y=-RY - rc + 0.15, z=zt, cor="concreto_escuro", bisel=0.05))
    # torre de escada (vai do térreo ao terraço e passa 3 m acima)
    tx, ty, tl = GI - 1.45, -GI + 1.45, 2.9
    it.add(mb.caixa(tl, tl, zt + 3.0, x=tx, y=ty, z=0, cor="concreto_escuro", bisel=0.06))
    it.add(mb.caixa(tl + 0.3, tl + 0.3, 0.25, x=tx, y=ty, z=zt + 3.0, cor="concreto", bisel=0.06))
    for k in range(GAR_N):  # portas da escada em cada andar (voltadas para o oeste)
        it.add(mb.caixa(0.06, 1.0, 2.1, x=tx - tl / 2 - 0.02, y=ty, z=k * GAR_PD, cor="amarelo", bisel=0.01))
        it.add(mb.caixa(0.08, 0.5, 0.35, x=tx - tl / 2 - 0.03, y=ty, z=k * GAR_PD + 2.3, cor="verde", bisel=0.01))
    # letreiro "P" no alto da torre (lado sul)
    for o in _letra_p(esp=0.08, h=1.4):
        mb.transforma(o, loc=(tx, ty - tl / 2 - 0.02, zt + 0.9))
        it.add(o)
    it.add(mb.caixa(1.9, 0.06, 2.0, x=tx, y=ty - tl / 2 + 0.01, z=zt + 0.6, cor="azul", bisel=0.08))
    # cancelas da entrada (interativas: levantam girando em Y)
    for xc, xp, sent in ((ent0 + 0.6, ent0 + 0.35, 1), (ent1 - 0.6, ent1 - 0.35, -1)):
        it.add(mb.caixa(0.45, 0.45, 1.05, x=xp, y=-GX - 0.5, z=0, cor="amarelo", bisel=0.05))
        it.add(mb.caixa(0.5, 0.5, 0.08, x=xp, y=-GX - 0.5, z=1.05, cor="grafite", bisel=0.03))
        comp = (ent1 - ent0) / 2 - 0.6
        braco = []
        nseg = 6
        for j in range(nseg):
            cor = "vermelho" if j % 2 == 0 else "branco"
            x0 = xp + sent * (0.25 + j * comp / nseg)
            braco.append(mb.caixa(comp / nseg, 0.08, 0.08, x=x0 + sent * comp / nseg / 2, y=-GX - 0.5, z=0.92,
                                  cor=cor, bisel=0.02))
        it.porta(braco, dobradica=(xp, -GX - 0.5, 0.96), eixo="y", angulo=-82 * sent,
                 nome=f"cancela_{'entrada' if sent > 0 else 'saida'}")
    # colisão por andar: lote, lajes (sem o furo da rampa), chegada da rampa e torre
    cols = [((0, 0, ZF), (2 * S, 2 * S, -ZF))]
    for k in range(1, GAR_N):
        z = k * GAR_PD
        cols.append((((RX1 + GX) / 2, 0, z - GAR_E), (GX - RX1, 2 * GX, GAR_E)))
        cols.append((((-GX + RX1) / 2, (RY + GX) / 2, z - GAR_E), (RX1 + GX, GX - RY, GAR_E)))
    cols.append(((tx, ty, 0.0), (tl, tl, zt + 3.25)))
    cols.append(((0, -GX + 0.15, zt), (2 * GX, 0.3, 1.1)))
    cols.append(((0, GX - 0.15, zt), (2 * GX, 0.3, 1.1)))
    it.colisao(cols)


# =====================================================================================================================
# Pacote Cartoon City
# =====================================================================================================================
CINZAS = {"cinza_claro", "cinza", "cinza_medio", "concreto", "concreto_escuro", "branco_gelo", "metal_claro",
          "metal", "cromo", "porcelana", "cinzas", "tecido_cinza", "calcada", "branco", "plastico_branco",
          "madeira_cinza", "metal_escuro", "cinza_azulado"}


def _cor_da_face(me, p):
    nm = mb.MAT_NOMES[p.material_index]
    if nm == "atlas":
        u = me.uv_layers["UVMap"].data[p.loop_indices[0]].uv
        i = int(u[0] * 16) + 16 * int((1 - u[1]) * 16)
        return mb.NOMES[i] if 0 <= i < len(mb.NOMES) else "calcada"
    if nm == "estampa_ruas_pacote":
        return "asfalto"
    if nm == "estampa_ladrilho_pacote":
        return "concreto"
    return "calcada"


TEX_RUAS = None  # definida no gera(): <saida>/ruas/estampas/ruas_pacote_asfalto.png


def textura_ruas():
    """Caminho da cópia ajustada do Roads.png; gera com PIL (python3 -I) se ainda não existir."""
    if not os.path.exists(TEX_RUAS):
        import subprocess
        os.makedirs(os.path.dirname(TEX_RUAS), exist_ok=True)
        script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cidade_ruas_textura.py")
        subprocess.run(["python3", "-I", script, os.path.join(cb.CC_TEXTURAS, "Roads.png"), TEX_RUAS], check=True)
    return TEX_RUAS


def importa_pacote_cidade(nome):
    """cb.importa_cidade com três correções (a terceira, a textura ajustada, está no corpo):
    1) os materiais do FBX anterior ("Roads", "Tile_1"...) ficam na cena depois do mb.limpa(); o importador do FBX
       então cria "Roads.001" e o importa_cidade não reconhece o nome, tratando a pista como cor do atlas (a UV da
       textura de ruas cai na célula amarela da paleta: era o laranja no meio do road_009). Apagamos esses materiais
       órfãos antes de importar;
    2) os cinzas do atlas do pacote (calçada e guia) viram a nossa "calcada", e a peça ganha a saia até z = −0,40
       (o pacote vai só até −0,10), com a cor de cima em cada trecho da borda."""
    for m in list(bpy.data.materials):
        if m.name not in mb.MAT_NOMES and not m.name.startswith("estampa_") and m.users == 0:
            bpy.data.materials.remove(m)
    # 3) a textura de faixas é a nossa cópia com o asfalto no tom da cor "asfalto" (cidade_ruas_textura.py): criada
    #    aqui antes, o material_estampa do importa_cidade reaproveita o material e não carrega o Roads.png original
    mb.material_estampa("ruas_pacote", textura_ruas())
    pc = cb.importa_cidade(nome)
    objs = list(pc.values())
    for img in bpy.data.images:  # as texturas do pacote têm 2048²: 1024² bastam e o GLB fica 4 × menor
        if img.size[0] > 1024 and img.name != "paleta_moveis":
            img.scale(1024, 1024)
            img.pack()
    for o in objs:
        me = o.data
        uv = me.uv_layers["UVMap"].data
        u_calc = mb.uv_cor("calcada")
        for p in me.polygons:
            if mb.MAT_NOMES[p.material_index] == "atlas" and _cor_da_face(me, p) in CINZAS:
                for li in p.loop_indices:
                    uv[li].uv = u_calc
    zmin = min((o.matrix_world @ v.co).z for o in objs for v in o.data.vertices)
    paredes = {}
    for o in objs:
        me = o.data
        for p in me.polygons:
            if p.normal.z < 0.9 or p.center.z > 0.05:
                continue
            cor = _cor_da_face(me, p)
            ztop = min(zmin, p.center.z)
            vs = [o.matrix_world @ me.vertices[i].co for i in p.vertices]
            for a, b in zip(vs, vs[1:] + vs[:1]):
                for eixo, val in ((0, H), (0, -H), (1, H), (1, -H)):
                    if abs(a[eixo] - val) < 1e-3 and abs(b[eixo] - val) < 1e-3 and (a - b).length > 1e-3:
                        paredes.setdefault(cor, []).append((a.copy(), b.copy(), ztop))
    saia = []
    for cor, lst in paredes.items():
        bm = bmesh.new()
        for a, b, zt in lst:
            q = [bm.verts.new((a.x, a.y, zt)), bm.verts.new((b.x, b.y, zt)), bm.verts.new((b.x, b.y, ZF)),
                 bm.verts.new((a.x, a.y, ZF))]
            f = bm.faces.new(q)
            mid = (a + b) / 2
            if f.normal.dot(V((mid.x, mid.y, 0))) < 0:
                f.normal_flip()
        ob = mb._obj("saia", bm, cor, liso=False)
        _normal_para_fora(ob)  # _obj recalcula normais e faces soltas podem virar
        saia.append(ob)
    bm = bmesh.new()
    vs = [bm.verts.new((x, y, ZF)) for x, y in ((-H, -H), (-H, H), (H, H), (H, -H))]
    bm.faces.new(vs)
    fundo = mb._obj("fundo", bm, "asfalto", liso=False)
    if sum(p.normal.z for p in fundo.data.polygons) > 0:
        fundo.data.flip_normals()
    return objs + saia + [fundo]


def _normal_para_fora(ob):
    me = ob.data
    flip = []
    for p in me.polygons:
        c = p.center
        if p.normal.dot(V((c.x, c.y, 0))) < 0:
            flip.append(p.index)
    if flip:
        bm = bmesh.new()
        bm.from_mesh(me)
        bm.faces.ensure_lookup_table()
        for i in flip:
            bm.faces[i].normal_flip()
        bm.to_mesh(me)
        bm.free()


# =====================================================================================================================
# Registro das peças
# =====================================================================================================================
T_RUA = ["modular", "rua"]
T_AV = ["modular", "avenida"]


def col_plana(lx, ly):
    return [((0, 0, ZF), (lx, ly, -ZF))]


PECAS = [
    # --- ruas de 2 faixas
    ("ruas", "rua_reta", "Rua reta", "rua_reta", T_RUA, lambda it: p_rua_reta(it), {}),
    ("ruas", "rua_reta_faixa_pedestres", "Rua com faixa de pedestres", "rua_reta_faixa", T_RUA + ["faixa_pedestres"],
     lambda it: p_reta_faixa(it, RUA), {}),
    ("ruas", "rua_cruzamento_x", "Cruzamento em X", "rua_cruzamento_x", T_RUA + ["cruzamento"],
     lambda it: cruzamento(it, RUA), {}),
    ("ruas", "rua_cruzamento_x_faixas", "Cruzamento em X com faixas", "rua_cruzamento_x_faixas",
     T_RUA + ["cruzamento", "faixa_pedestres"], lambda it: cruzamento(it, RUA, faixas=True), {}),
    ("ruas", "rua_cruzamento_t", "Cruzamento em T", "rua_cruzamento_t", T_RUA + ["cruzamento"],
     lambda it: cruzamento(it, RUA, bracos=(False, True, True, True)), {}),
    ("ruas", "rua_cruzamento_t_faixas", "Cruzamento em T com faixas", "rua_cruzamento_t_faixas",
     T_RUA + ["cruzamento", "faixa_pedestres"],
     lambda it: cruzamento(it, RUA, bracos=(False, True, True, True), faixas=True), {}),
    ("ruas", "rua_curva", "Rua em curva", "rua_curva", T_RUA + ["curva"], lambda it: cb.rua_curva(it, RUA), {}),
    ("ruas", "rua_fim", "Fim de rua (balão)", "rua_fim", T_RUA + ["balao"], lambda it: cb.rua_fim(it, RUA), {}),
    ("ruas", "rua_lombada", "Rua com lombada", "rua_lombada", T_RUA + ["lombada"], p_lombada, {}),
    ("ruas", "rua_ponto_onibus", "Rua com baia de ônibus", "rua_ponto_onibus", T_RUA + ["onibus", "baia"],
     p_ponto_onibus, {}),
    ("ruas", "rua_transicao_avenida", "Transição de rua para avenida", "rua_transicao_avenida",
     ["modular", "rua", "avenida", "transicao"], p_transicao, {}),
    # --- avenidas
    ("ruas", "avenida_reta", "Avenida reta", "avenida_reta", T_AV, lambda it: p_rua_reta(it, AV), {}),
    ("ruas", "avenida_reta_faixa_pedestres", "Avenida com faixa de pedestres", "avenida_reta_faixa",
     T_AV + ["faixa_pedestres"], lambda it: p_reta_faixa(it, AV), {}),
    ("ruas", "avenida_cruzamento_x", "Cruzamento de avenidas em X", "avenida_cruzamento_x", T_AV + ["cruzamento"],
     lambda it: cruzamento(it, AV, r=1.0), {}),
    ("ruas", "avenida_cruzamento_t", "Cruzamento de avenidas em T", "avenida_cruzamento_t", T_AV + ["cruzamento"],
     lambda it: cruzamento(it, AV, bracos=(False, True, True, True), r=1.0), {}),
    ("ruas", "avenida_curva", "Avenida em curva", "avenida_curva", T_AV + ["curva"],
     lambda it: cb.rua_curva(it, AV), {}),
    ("ruas", "avenida_canteiro", "Avenida com canteiro central", "avenida_canteiro", T_AV + ["canteiro"],
     lambda it: p_canteiro(it), {}),
    ("ruas", "avenida_canteiro_inicio", "Início do canteiro central", "avenida_canteiro", T_AV + ["canteiro"],
     lambda it: p_canteiro(it, inicio=True), {}),
    ("ruas", "avenida_cruzamento_rua", "Cruzamento de avenida com rua", "avenida_cruzamento_rua",
     ["modular", "avenida", "rua", "cruzamento"],
     lambda it: cruzamento(it, AV, RUA, r=1.0, faixas=False), {}),
    # --- rotatórias
    ("ruas", "rotatoria", "Rotatória (2 × 2)", "rotatoria", ["rua", "rotatoria", "2x2"],
     lambda it: rotatoria(it), {"col": col_plana(2 * Q, 2 * Q)}),
    ("ruas", "rotatoria_grande", "Rotatória grande (3 × 3)", "rotatoria_grande", ["modular", "rua", "rotatoria", "3x3"],
     lambda it: rotatoria(it, S=1.5 * Q, Ri=7.6, Ro=14.9, rf=3.0, zebrado=True), {"col": col_plana(3 * Q, 3 * Q)}),
    # --- pisos
    ("pisos", "piso_calcada_lisa", "Calçada lisa", "piso_calcada_lisa", ["modular", "piso", "calcada"],
     p_calcada_lisa, {}),
    ("pisos", "piso_ladrilho_rosado", "Calçada de ladrilho rosado", "piso_ladrilho_rosado",
     ["modular", "piso", "calcada"], p_ladrilho_rosado, {}),
    ("pisos", "piso_praca", "Piso de praça", "piso_praca", ["modular", "piso", "praca"], p_praca, {}),
    ("pisos", "piso_grama", "Grama", "piso_grama", ["modular", "piso", "grama"], p_grama, {}),
    ("pisos", "piso_terra", "Terreno de terra", "piso_terra", ["modular", "piso", "terra"], p_terra, {}),
    ("pisos", "piso_grama_caminho", "Grama com caminho", "piso_grama_caminho", ["modular", "piso", "grama"],
     p_grama_caminho, {}),
    # --- estacionamentos
    ("estacionamentos", "estacionamento_grande", "Estacionamento grande (2 × 1)", "estacionamento_grande",
     ["estacionamento", "2x1"], p_estac_grande, {"col": col_plana(2 * Q, Q)}),
    ("estacionamentos", "estacionamento_quadra", "Estacionamento de 1 quadra", "estacionamento_quadra",
     ["modular", "estacionamento"], p_estac_quadra, {}),
    ("estacionamentos", "estacionamento_vagas_rua", "Vagas na beira da rua", "estacionamento_vagas_rua",
     ["rua", "estacionamento", "1x2"], p_vagas_rua, {"col": col_plana(Q, 2 * Q)}),
    ("estacionamentos", "estacionamento_inclinado", "Estacionamento de vagas inclinadas", "estacionamento_inclinado",
     ["estacionamento", "2x1"], p_estac_inclinado, {"col": col_plana(2 * Q, Q)}),
    ("estacionamentos", "edificio_garagem", "Edifício-garagem", "edificio_garagem",
     ["estacionamento", "garagem", "2x2", "interativo"], p_garagem, {"alto": True}),
]

PACOTE_RUAS = [("road_001", "Avenida reta (pacote)"), ("road_003", "Cruzamento de avenidas em T (pacote)"),
               ("road_009", "Rua reta (pacote)"), ("road_013", "Rua em curva aberta (pacote)"),
               ("road_019", "Rua com avenida em T (pacote)"), ("road_020", "Avenida com linha de retenção (pacote)"), ("road_022", "Rua com linha de retenção (pacote)")]
PACOTE_PISOS = [("Set_B_Tiles_01", "Piso com caminho em curva (pacote)"), ("Set_B_Tiles_04", "Piso com caminho (pacote)"),
                ("Set_B_Tiles_05", "Piso com caminho reto (pacote)"), ("Set_B_Tiles_06", "Piso com curva (pacote)"),
                ("Set_B_Tiles_09", "Piso de ladrilho (pacote)")]
for _n, _r in PACOTE_RUAS:
    PECAS.append(("ruas", _n.lower() + "_pacote", _r, _n.lower(), ["modular", "rua", "pacote"], ("pacote", _n),
                  {"pacote": True}))
for _n, _r in PACOTE_PISOS:
    PECAS.append(("pisos", _n.lower() + "_pacote", _r, _n.lower(), ["modular", "piso", "pacote"], ("pacote", _n),
                  {"pacote": True}))


def gera(saida, sel):
    global TEX_RUAS
    TEX_RUAS = os.path.join(saida, "ruas", "estampas", "ruas_pacote_asfalto.png")
    cats = {"ruas", "pisos", "estacionamentos"}
    pedidas_cat = [s for s in sel if s in cats]
    pedidas_id = [s for s in sel if s not in cats]
    catalogos = {}
    for cat, id_, rot, grupo, tags, f, op in PECAS:
        if sel and cat not in pedidas_cat and id_ not in pedidas_id:
            continue
        if cat not in catalogos:
            catalogos[cat] = mb.Catalogo(cat, saida)
        mb.limpa()
        it = mb.Item(id_)
        if isinstance(f, tuple):
            it.add(*importa_pacote_cidade(f[1]))
        else:
            f(it)
        if "col" in op:
            it.colisao(op["col"])
        cb.exporta(catalogos[cat], it, rot, grupo, tags=tags, pacote=op.get("pacote", False),
                   dir_mini=(0.55, -1.0, 0.75) if op.get("alto") else cb.DIR_TOPO,
                   colisao_plana=not op.get("alto"))
    for c in catalogos.values():
        c.salva()


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:]
    gera(args[0], args[1:])
