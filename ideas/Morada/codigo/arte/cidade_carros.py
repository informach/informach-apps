"""Cidade do Morada: carros, motos, bicicleta, carrinho de bebê e skate — categoria "carros".

Uso:
  MOVEIS_THREADS=1 CIDADE_PACOTE_FBX=SP/ideias/Cartoon_City/Cartoon_City_Free_fbx/Separate_assets_fbx \
  CIDADE_PACOTE_TEX=SP/ideias/Cartoon_City/textures/textures/Textures1.png \
  blender-venv/bin/python -I morada-art/cidade_carros.py -- SP/cidade_out [ids|grupos...]

Convenções (GUIA_CIDADE, GUIA_TRANSPORTE): metros, Z para cima, frente para −Y, origem no centro com as rodas tocando
z = 0. Rodas: filhos com a origem no eixo e extras {"anima": "girar", "eixo": "x", "velocidade": 240, "roda": 1,
"raio": r} (lista também em extra["animacoes"]). Sirene: {"anima": "piscar", "periodo": 0.8}. Portas, tampas e capotas
são Item.porta (porta lateral de correr: Item.correr). Assentos: Item.slot "assento_motorista", "assento_1"... com
0,5 × 0,5 × 0,9 m. Faróis "luz", lanternas "luz_vermelha", vidros "janela_apagada".
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import moveis_base as mb  # noqa: E402
import carros_base as vb  # noqa: E402

V = Vector
CAT = "carros"
SAIDA = ""
PASTA = ""
PECAS = []
ASSENTO = (0.5, 0.5, 0.9)


def peca(id_, rotulo, grupo, tags=(), veiculo="carro", mini=None, pacote=False):
    def dec(fn):
        PECAS.append(dict(id=id_, rotulo=rotulo, grupo=grupo, tags=list(tags), veiculo=veiculo, fn=fn, mini=mini,
                          pacote=pacote))
        return fn
    return dec


# ======================================================================================================================
# Estampas (textos em português, desenhados aqui)
# ======================================================================================================================
def est_taxi():
    def d(dr, img, fonte):
        dr.rectangle((0, 0, 512, 160), fill=(255, 214, 64, 255))
        dr.rounded_rectangle((10, 10, 502, 150), radius=28, outline=(30, 33, 39, 255), width=10)
        vb.texto_centro(dr, (512, 160), "TÁXI", fonte(104), (30, 33, 39, 255), dy=4)
    return vb.estampa(PASTA, "taxi", d, tam=(512, 160), emissao=0.8)


def est_xadrez():
    def d(dr, img, fonte):
        for i in range(16):
            for j in range(2):
                cor = (30, 33, 39, 255) if (i + j) % 2 == 0 else (250, 250, 246, 255)
                dr.rectangle((i * 32, j * 32, i * 32 + 32, j * 32 + 32), fill=cor)
    return vb.estampa(PASTA, "xadrez", d, tam=(512, 64))


def est_policia():
    def d(dr, img, fonte):
        dr.rectangle((0, 0, 512, 128), fill=(247, 247, 244, 255))
        vb.texto_centro(dr, (512, 128), "POLÍCIA", fonte(92), (30, 33, 39, 255), dy=2)
    return vb.estampa(PASTA, "policia", d, tam=(512, 128))


def est_numero(n, fundo=(247, 247, 244, 255), tinta=(30, 33, 39, 255), nome=None):
    def d(dr, img, fonte):
        dr.rectangle((0, 0, 256, 256), fill=fundo)
        dr.ellipse((8, 8, 248, 248), outline=tinta, width=14)
        vb.texto_centro(dr, (256, 256), str(n), fonte(150), tinta, dy=4)
    return vb.estampa(PASTA, nome or f"numero_{n}", d, tam=(256, 256))


def est_emblema_monte():
    def d(dr, img, fonte):
        dr.rectangle((0, 0, 256, 256), fill=(249, 139, 55, 255))
        dr.polygon([(40, 190), (110, 80), (150, 140), (175, 110), (220, 190)], fill=(229, 72, 77, 255))
        dr.polygon([(95, 105), (110, 80), (125, 104)], fill=(255, 232, 156, 255))
    return vb.estampa(PASTA, "emblema_monte", d, tam=(256, 256))


def decal_lado(ctx, s, y, z, w, h, mat_idx, sai=0.006):
    """Adesivo plano na lateral (s = +1 direita, −1 esquerda), centrado em (y, z)."""
    hit, n = ctx["sup"].raio((s * 4, y, z), (-s, 0, 0))
    if hit is None:
        return []
    q = vb.quad_estampa(mat_idx, w, h, nome="adesivo")
    return [vb.cola(q, hit, n, sai=sai)]


def no_topo(ctx, x, y, z0=4.0):
    return ctx["sup"].raio((x, y, z0), (0, 0, -1))


# ======================================================================================================================
# Especificações-base
# ======================================================================================================================
BANCOS_4 = [(-0.38, -0.02, 0.5, "assento_motorista"), (0.38, -0.02, 0.5, "assento_1"), (0.0, 0.78, 1.3, None)]
SLOTS_TRAS = [("assento_2", -0.36, 0.78), ("assento_3", 0.36, 0.78)]


def sedan(cor="azul", L=4.3, W=1.9, **op):
    h = L / 2
    c = dict(
        cor=cor, yF=-h, yR=h, W=W, r=0.37, larg_roda=0.3, eixos=[-h + 0.8, h - 0.8],
        topo=[(-h, 0.62), (-h + 0.15, 0.76), (-h + 0.55, 0.85), (-0.6, 0.89), (-0.45, 0.9), (1.05, 0.92), (h - 0.6, 0.92),
              (h - 0.12, 0.86), (h, 0.72)],
        base=[(-h, 0.42), (-h + 0.3, 0.3), (-h + 0.8, 0.28), (h - 0.8, 0.28), (h - 0.25, 0.32), (h, 0.46)],
        rF=0.55, rR=0.42, pF=2.4, pR=2.8, et=0.3, eb=0.22, cint=0.55,
        cab=dict(yf0=-0.62, yf1=0.02, yr0=1.25, yr1=0.78, wc0=0.82, wc1=0.68, zb=0.9, zr=1.45, rc=0.13, rr=0.1),
        pilar_b=0.27, larg_pilar=0.09,
        portas=[dict(y0=-0.54, y1=0.27), dict(y0=0.27, y1=0.84)],
        z_porta=0.36,
        tampa=dict(tipo="porta_malas", y0=1.3, z=0.7, w=0.7),
        luzes=[dict(lado="frente", x=0.6, z=0.68, l=0.34, h=0.15, raio=0.06),
               dict(lado="tras", x=0.66, z=0.76, l=0.3, h=0.13, raio=0.05)],
        grade=dict(z=0.55, l=0.7, h=0.14, cor="grafite_escuro", raio=0.06),
        para_choques=[dict(lado="frente", z=0.42, r=0.07, cor="grafite"), dict(lado="tras", z=0.46, r=0.07,
                                                                                    cor="grafite")],
        placas=(("frente", 0.42, "branco"), ("tras", 0.6, "branco")),
        bancos=list(BANCOS_4), slots_extra=list(SLOTS_TRAS),
        cor_banco="grafite", interior="cinza_medio",
    )
    c.update(op)
    return c


# ---------------------------------------------------------------------------------------------------- sedãs
@peca("sedan_azul", "Sedã (azul)", "sedan", tags=["carro", "sedan", "passeio"])
def p_sedan_azul(it):
    vb.carro(it, sedan("azul_medio"), PASTA)


@peca("sedan_vermelho", "Sedã (vermelho)", "sedan", tags=["carro", "sedan", "passeio"])
def p_sedan_vermelho(it):
    vb.carro(it, sedan("vermelho", cor_banco="creme", interior="bege_escuro"), PASTA)


def placa_taxi(it, ctx):
    cab = ctx["cab"]
    zr = cab.k["zr"] + 0.02
    yc = (cab.k["yf1"] + cab.k["yr1"]) / 2
    base = mb.caixa(0.62, 0.22, 0.2, y=yc, z=zr - 0.02, cor="amarelo", bisel=0.05, seg=2)
    m = est_taxi()
    ps = [base]
    for s in (-1, 1):
        q = vb.quad_estampa(m, 0.5, 0.15, nome="taxi")
        mb.transforma(q, rot=("X", 90 * s))
        if s < 0:
            mb.transforma(q, rot=("Z", 180))
        mb.transforma(q, loc=(0, yc + s * 0.113, zr + 0.08))
        ps.append(q)
    it.add(mb.junta(ps, "placa_taxi"))


@peca("taxi", "Táxi", "taxi", tags=["carro", "taxi", "servico"])
def p_taxi(it):
    xd = est_xadrez()

    def faixa(s, y0, y1, ctx):
        return decal_lado(ctx, s, (y0 + y1) / 2, 0.66, (y1 - y0) - 0.1, 0.1, xd)
    c = sedan("amarelo", cor_banco="grafite", extras=[placa_taxi])
    c["portas"] = [dict(y0=-0.54, y1=0.27, extra=faixa), dict(y0=0.27, y1=0.84, extra=faixa)]
    vb.carro(it, c, PASTA)


def barra_sirene(it, ctx):
    cab = ctx["cab"]
    zr = cab.k["zr"] + 0.01
    yc = (cab.k["yf1"] + cab.k["yr1"]) / 2 - 0.05
    it.add(mb.caixa(1.0, 0.26, 0.07, y=yc, z=zr - 0.02, cor="grafite_escuro", bisel=0.03, seg=2))
    luzes = []
    for s, mat in ((-1, "luz_azul"), (1, "luz_vermelha")):
        luzes.append(mb.superelipsoide(0.42, 0.22, 0.13, x=s * 0.24, y=yc, z=zr + 0.04, cor=None, mat=mat, e=0.35,
                                       nu=12, nv=6))
    it.anima(luzes, {"anima": "piscar", "periodo": 0.8}, "sirene")


@peca("viatura_policia", "Viatura de polícia", "viatura_policia", tags=["carro", "policia", "servico", "sirene"])
def p_policia(it):
    m = est_policia()

    def pinta(bm, bmc, cas, cab):
        for f in bm.faces:
            q = vb.centro(f)
            if f.material_index == 0 and -0.54 < q.y < 0.84 and q.z > 0.36 and abs(q.x) > 0.7 and q.z < 0.93:
                vb.bm_pinta(bm, [f], cor="branco")

    def texto(s, y0, y1, ctx):
        return decal_lado(ctx, s, 0.15, 0.62, 0.95, 0.24, m) if y0 < 0 else []

    def empurra(it, ctx):
        cas = ctx["cas"]
        ps = []
        for x in (-0.36, 0.36):
            ps.append(mb.caixa(0.07, 0.22, 0.34, x=x, y=cas.yF - 0.04, z=0.3, cor="preto", bisel=0.025, seg=1))
        ps.append(mb.caixa(0.9, 0.07, 0.07, y=cas.yF - 0.14, z=0.52, cor="preto", bisel=0.025, seg=1))
        ps.append(mb.caixa(0.9, 0.07, 0.07, y=cas.yF - 0.14, z=0.36, cor="preto", bisel=0.025, seg=1))
        it.add(mb.junta(ps, "empurra"))
    c = sedan("preto", pinta=pinta, extras=[barra_sirene, empurra], roda="raios", cor_aro="grafite",
              cor_cubo="preto", cor_espelho="preto")
    c["portas"] = [dict(y0=-0.54, y1=0.27, extra=texto), dict(y0=0.27, y1=0.84)]
    c["para_choques"] = [dict(lado="frente", z=0.42, r=0.07, cor="preto"), dict(lado="tras", z=0.46, r=0.07,
                                                                                 cor="preto")]
    vb.carro(it, c, PASTA)


# ---------------------------------------------------------------------------------------------------- sedã de luxo
def enfeite_capo(it, ctx):
    hit, _ = no_topo(ctx, 0, ctx["cas"].yF + 0.25)
    if hit is not None:
        it.add(mb.cilindro(0.025, 0.05, x=0, y=hit.y, z=hit.z - 0.01, cor="cromo", seg=8, bisel=0.008))
        it.add(mb.esfera(0.03, x=0, y=hit.y, z=hit.z + 0.06, cor="cromo", seg=10))


def sedan_luxo(cor, teto=None, banco="creme"):
    h = 2.35
    return dict(
        cor=cor, yF=-h, yR=h, W=1.96, r=0.38, larg_roda=0.3, eixos=[-1.55, 1.5],
        topo=[(-h, 0.72), (-h + 0.1, 0.88), (-h + 0.5, 0.95), (-0.8, 0.98), (1.3, 0.99), (h - 0.35, 0.99),
              (h - 0.08, 0.95), (h, 0.82)],
        base=[(-h, 0.42), (-h + 0.25, 0.3), (h - 0.25, 0.3), (h, 0.44)],
        rF=0.36, rR=0.32, pF=4.5, pR=4.0, et=0.2, eb=0.18, cint=0.55,
        cab=dict(yf0=-0.78, yf1=-0.22, yr0=1.32, yr1=0.98, wc0=0.86, wc1=0.76, zb=0.99, zr=1.62, rc=0.08, rr=0.08),
        pilar_b=0.3, larg_pilar=0.1, cor_teto=teto,
        portas=[dict(y0=-0.7, y1=0.3), dict(y0=0.3, y1=0.98)],
        z_porta=0.38, macaneta_dz=0.13,
        tampa=dict(tipo="porta_malas", y0=1.38, z=0.78, w=0.72),
        luzes=[dict(lado="frente", x=0.68, z=0.78, l=0.3, h=0.18, raio=0.05, aro="cromo"),
               dict(lado="tras", x=0.74, z=0.84, l=0.22, h=0.18, raio=0.04)],
        grade=dict(z=0.66, l=0.52, h=0.3, cor="grafite_escuro", moldura="cromo", raio=0.04, barras=7, vertical=True),
        para_choques=[dict(lado="frente", z=0.44, r=0.08, cor="cromo"), dict(lado="tras", z=0.48, r=0.08,
                                                                                  cor="cromo")],
        placas=(("frente", 0.44, "branco"), ("tras", 0.66, "branco")),
        bancos=[(-0.4, 0.0, 0.52, "assento_motorista"), (0.4, 0.0, 0.52, "assento_1"), (0.0, 0.92, 1.34, None)],
        slots_extra=[("assento_2", -0.38, 0.92), ("assento_3", 0.38, 0.92)],
        cor_banco=banco, interior="bege_escuro", roda="calota", cor_aro="cromo", cor_cubo="cromo",
        extras=[enfeite_capo],
    )


@peca("sedan_luxo_preto", "Sedã de luxo (preto)", "sedan_luxo", tags=["carro", "luxo", "passeio"])
def p_luxo_preto(it):
    vb.carro(it, sedan_luxo("preto"), PASTA)


@peca("sedan_luxo_branco", "Sedã de luxo (branco com teto bege)", "sedan_luxo", tags=["carro", "luxo", "passeio"])
def p_luxo_branco(it):
    vb.carro(it, sedan_luxo("branco", teto="bege_escuro", banco="couro"), PASTA)


# ---------------------------------------------------------------------------------------------------- compacto
def compacto(cor, banco="grafite"):
    h = 1.85
    return dict(
        cor=cor, yF=-h, yR=h, W=1.82, r=0.36, larg_roda=0.29, eixos=[-1.15, 1.12],
        topo=[(-h, 0.6), (-h + 0.15, 0.75), (-h + 0.55, 0.84), (-0.9, 0.88), (h - 0.3, 0.93), (h - 0.06, 0.9),
              (h, 0.78)],
        base=[(-h, 0.42), (-h + 0.3, 0.3), (h - 0.3, 0.3), (h, 0.44)],
        rF=0.55, rR=0.3, pF=2.3, pR=3.2, et=0.33, eb=0.22, cint=0.55,
        cab=dict(yf0=-0.92, yf1=-0.25, yr0=1.72, yr1=1.56, wc0=0.78, wc1=0.64, zb=0.92, zr=1.52, rc=0.15, rr=0.12),
        pilar_b=0.48, larg_pilar=0.09,
        portas=[dict(y0=-0.84, y1=0.48)], z_porta=0.36,
        tampa=dict(tipo="tampa", y0=1.6, z=0.6, w=0.62, angulo=80),
        luzes=[dict(lado="frente", x=0.56, z=0.7, l=0.3, h=0.2, raio=0.09),
               dict(lado="tras", x=0.7, z=0.86, l=0.13, h=0.26, raio=0.05)],
        grade=dict(z=0.56, l=0.5, h=0.12, cor="grafite_escuro", raio=0.05),
        para_choques=[dict(lado="frente", z=0.42, r=0.08, cor=cor), dict(lado="tras", z=0.46, r=0.08, cor="grafite")],
        placas=(("frente", 0.42, "branco"), ("tras", 0.62, "branco")),
        bancos=[(-0.36, -0.15, 0.48, "assento_motorista"), (0.36, -0.15, 0.48, "assento_1"), (0.0, 0.82, 1.2, None)],
        slots_extra=[("assento_2", -0.33, 0.82), ("assento_3", 0.33, 0.82)],
        cor_banco=banco, interior="cinza_medio",
    )


@peca("compacto_amarelo", "Compacto (amarelo)", "compacto", tags=["carro", "compacto", "passeio"])
def p_comp_am(it):
    vb.carro(it, compacto("amarelo_escuro"), PASTA)


@peca("compacto_cinza", "Compacto (cinza)", "compacto", tags=["carro", "compacto", "passeio"])
def p_comp_ci(it):
    vb.carro(it, compacto("cinza_azulado", banco="vermelho_escuro"), PASTA)


# ---------------------------------------------------------------------------------------------------- SUV
def bagageiro_trilhos(it, ctx):
    cab = ctx["cab"]
    zr = cab.k["zr"]
    for s in (-1, 1):
        x = s * (cab.k["wc1"] - 0.12)
        y0, y1 = cab.k["yf1"] + 0.2, cab.k["yr1"] - 0.15
        it.add(mb.tubo([(x, y0, zr - 0.01), (x, y0 + 0.05, zr + 0.06), (x, y1 - 0.05, zr + 0.06), (x, y1, zr - 0.01)],
                       0.022, cor="metal_escuro", seg=8))


@peca("suv_roxo", "SUV (roxo)", "suv", tags=["carro", "suv", "passeio"])
def p_suv(it):
    h = 2.2
    c = dict(
        cor="roxo", yF=-h, yR=h, W=2.0, r=0.42, larg_roda=0.33, eixos=[-1.42, 1.45],
        topo=[(-h, 0.78), (-h + 0.12, 0.95), (-h + 0.5, 1.03), (-0.9, 1.07), (h - 0.2, 1.09), (h - 0.05, 1.05),
              (h, 0.92)],
        base=[(-h, 0.52), (-h + 0.3, 0.4), (h - 0.3, 0.4), (h, 0.52)],
        rF=0.42, rR=0.28, pF=3.4, pR=4.5, et=0.24, eb=0.2, cint=0.55,
        cab=dict(yf0=-0.88, yf1=-0.32, yr0=2.06, yr1=1.96, wc0=0.9, wc1=0.8, zb=1.08, zr=1.86, rc=0.1, rr=0.1),
        pilar_b=0.36, pilares=[1.36], larg_pilar=0.1,
        portas=[dict(y0=-0.8, y1=0.36), dict(y0=0.36, y1=0.96)], z_porta=0.48,
        tampa=dict(tipo="tampa", y0=1.94, z=0.72, w=0.72, angulo=82),
        luzes=[dict(lado="frente", x=0.66, z=0.86, l=0.34, h=0.15, raio=0.05),
               dict(lado="tras", x=0.8, z=0.98, l=0.13, h=0.3, raio=0.04)],
        grade=dict(z=0.78, l=0.8, h=0.26, cor="preto", raio=0.06, barras=3, cor_barras="grafite"),
        para_choques=[dict(lado="frente", z=0.5, r=0.1, cor="preto"), dict(lado="tras", z=0.55, r=0.1, cor="preto")],
        placas=(("frente", 0.52, "branco"), ("tras", 0.75, "branco")),
        bancos=[(-0.4, -0.15, 0.52, "assento_motorista"), (0.4, -0.15, 0.52, "assento_1"), (0.0, 0.85, 1.4, None)],
        slots_extra=[("assento_2", -0.4, 0.85), ("assento_3", 0.4, 0.85)],
        cor_banco="grafite", interior="cinza_medio", roda="raios", cor_aro="metal_claro", cor_cubo="grafite",
        extras=[bagageiro_trilhos], z_piso=0.56,
    )
    vb.carro(it, c, PASTA)


# ---------------------------------------------------------------------------------------------------- jipe
def bagageiro_grade(it, ctx):
    cab = ctx["cab"]
    zr = cab.k["zr"] + 0.05
    y0, y1 = cab.k["yf1"] + 0.05, cab.k["yr1"] - 0.08
    w = cab.k["wc1"] - 0.06
    ps = []
    for s in (-1, 1):
        ps.append(mb.tubo([(s * w, y0, zr + 0.1), (s * w, y1, zr + 0.1)], 0.025, cor="grafite", seg=8))
        for y in (y0 + 0.1, (y0 + y1) / 2, y1 - 0.1):
            ps.append(mb.caixa(0.05, 0.05, 0.1, x=s * (w - 0.02), y=y, z=zr - 0.06, cor="grafite", bisel=0.015, seg=1))
    for k in range(9):
        y = y0 + (y1 - y0) * k / 8
        ps.append(mb.tubo([(-w, y, zr + 0.1), (w, y, zr + 0.1)], 0.016, cor="metal_escuro", seg=6))
    ps.append(mb.tubo([(-w, y0, zr + 0.1), (w, y0, zr + 0.1)], 0.025, cor="grafite", seg=8))
    ps.append(mb.tubo([(-w, y1, zr + 0.1), (w, y1, zr + 0.1)], 0.025, cor="grafite", seg=8))
    it.add(mb.junta(ps, "bagageiro"))


def snorkel_guincho(it, ctx):
    cab, cas = ctx["cab"], ctx["cas"]
    x = cab.k["wc0"] + 0.06
    yb = cab.k["yf0"] - 0.05
    it.add(mb.tubo([(x, yb - 0.2, 0.9), (x + 0.04, yb, 1.0), (x, yb + 0.12, 1.75), (x - 0.02, yb + 0.05, 1.86)],
                   0.045, cor="preto", seg=10))
    hit, n = ctx["sup"].raio((0, cas.yF - 2, 0.55), (0, 1, 0))
    if hit is not None:
        g = mb.cilindro(0.09, 0.42, eixo="x", x=0, y=hit.y - 0.07, z=hit.z, cor="grafite", seg=12, bisel=0.01)
        cabo = mb.cilindro(0.075, 0.2, eixo="x", x=0, y=hit.y - 0.07, z=hit.z, cor="laranja", seg=12, bisel=0.01)
        it.add(g, cabo)
    hit, n = ctx["sup"].raio((0, cas.yF - 2, 0.86), (0, 1, 0))
    if hit is not None:
        q = vb.quad_estampa(est_emblema_monte(), 0.22, 0.22, nome="emblema")
        it.add(vb.cola(q, hit, n, sai=0.03))
        it.add(vb.cola(vb.lente(0.26, 0.26, 0.03, cor="laranja", forma="redonda"), hit, n, sai=0.012))


def estepe(ctx):
    cas = ctx["cas"]
    rd = vb.roda(0.34, 0.24, estilo="raios", cor_aro="metal_claro", cor_cubo="grafite")
    mb.transforma(rd, rot=("Z", 90))
    mb.transforma(rd, loc=(0, cas.yR + 0.14, 1.12))
    return [rd, mb.caixa(0.12, 0.2, 0.12, y=cas.yR + 0.02, z=1.06, cor="grafite", bisel=0.02, seg=1)]


@peca("jipe_verde", "Jipe com bagageiro (verde)", "jipe", tags=["carro", "jipe", "aventura"])
def p_jipe(it):
    h = 2.0
    c = dict(
        cor="verde_lima", yF=-h, yR=h, W=1.96, r=0.44, larg_roda=0.36, eixos=[-1.3, 1.3], recuo_roda=-0.04,
        topo=[(-h, 0.86), (-h + 0.08, 1.0), (-0.7, 1.04), (h - 0.08, 1.06), (h, 0.94)],
        base=[(-h, 0.56), (-h + 0.2, 0.46), (h - 0.2, 0.46), (h, 0.56)],
        rF=0.28, rR=0.24, pF=5, pR=5, et=0.18, eb=0.18, cint=0.55, folga_arco=0.07,
        cab=dict(yf0=-0.62, yf1=-0.42, yr0=1.86, yr1=1.82, wc0=0.9, wc1=0.86, zb=1.05, zr=1.82, rc=0.07, rr=0.07),
        pilar_b=0.34, pilares=[1.2], larg_pilar=0.11, moldura="grafite",
        portas=[dict(y0=-0.54, y1=0.34), dict(y0=0.34, y1=0.84)], z_porta=0.58,
        tampa=dict(tipo="tampa", y0=1.79, z=0.72, w=0.7, angulo=78, extra=[estepe]),
        luzes=[dict(lado="frente", x=0.6, z=0.84, l=0.24, h=0.24, forma="redonda", aro="grafite"),
               dict(lado="tras", x=0.82, z=0.92, l=0.12, h=0.24, raio=0.03)],
        grade=dict(z=0.84, l=0.62, h=0.3, cor="grafite_escuro", raio=0.04, barras=6, vertical=True,
                   cor_barras="verde_lima"),
        para_choques=[dict(lado="frente", z=0.52, r=0.1, cor="grafite", amax=60),
                      dict(lado="tras", z=0.56, r=0.1, cor="grafite", amax=60)],
        placas=(("frente", 0.52, "branco"), ("tras", 0.74, "branco")),
        bancos=[(-0.4, -0.08, 0.52, "assento_motorista"), (0.4, -0.08, 0.52, "assento_1"), (0.0, 0.85, 1.36, None)],
        slots_extra=[("assento_2", -0.38, 0.85), ("assento_3", 0.38, 0.85)],
        cor_banco="marrom", interior="grafite", roda="raios", cor_aro="metal_claro", cor_cubo="grafite",
        extras=[bagageiro_grade, snorkel_guincho], z_piso=0.6, cor_arco="preto",
    )
    vb.carro(it, c, PASTA)


# ---------------------------------------------------------------------------------------------------- esportivos
def esportivo(cor, **op):
    h = 2.2
    c = dict(
        cor=cor, yF=-h, yR=h, W=2.0, r=0.36, larg_roda=0.32, eixos=[-1.4, 1.38],
        topo=[(-h, 0.44), (-h + 0.2, 0.58), (-1.4, 0.7), (-0.75, 0.76), (-0.5, 0.8), (1.4, 0.84), (h - 0.12, 0.82),
              (h, 0.66)],
        base=[(-h, 0.3), (-h + 0.35, 0.22), (h - 0.35, 0.22), (h, 0.32)],
        larg=[(-h, 0.94), (-1.4, 1.0), (-0.4, 0.95), (0.5, 0.95), (1.4, 1.0), (h, 0.96)],
        rF=0.7, rR=0.38, pF=2.0, pR=3.0, et=0.32, eb=0.2, cint=0.5,
        cab=dict(yf0=-0.55, yf1=0.25, yr0=1.45, yr1=0.82, wc0=0.78, wc1=0.6, zb=0.8, zr=1.22, rc=0.16, rr=0.12),
        portas=[dict(y0=-0.47, y1=0.78)], z_porta=0.3,
        tampa=dict(tipo="porta_malas", y0=1.5, z=0.66, w=0.66),
        luzes=[dict(lado="frente", x=0.62, z=0.56, l=0.4, h=0.1, raio=0.04, giro=12),
               dict(lado="tras", x=0.66, z=0.74, l=0.36, h=0.07, raio=0.03)],
        grade=dict(z=0.37, l=1.0, h=0.12, cor="preto", raio=0.05),
        para_choques=[dict(lado="tras", z=0.34, r=0.06, cor="preto")],
        placas=(("tras", 0.52, "branco"),),
        bancos=[(-0.36, 0.25, 0.5, "assento_motorista"), (0.36, 0.25, 0.5, "assento_1")],
        cor_banco="preto", interior="grafite", roda="esporte", cor_aro="grafite", cor_cubo="preto",
        z_piso=0.32, banco_dz=0.02,
    )
    c.update(op)
    return c


def entradas_ar(it, ctx, ys=(0.85,), z=0.56, cor="preto"):
    for s in (-1, 1):
        for y in ys:
            hit, n = ctx["sup"].raio((s * 3, y, z), (-s, 0, 0))
            if hit is not None:
                it.add(vb.cola(vb.lente(0.38, 0.13, 0.03, cor=cor, raio=0.05), hit, n, sai=0.006, giro=-8 * s))


def aero(y, z, larg=1.7, cor="preto"):
    def fn(it, ctx):
        it.add(vb.aerofolio(ctx["sup"], y, z, larg, cor=cor))
    return fn


@peca("esportivo_aerofolio_laranja", "Esportivo com aerofólio (laranja)", "esportivo_aerofolio",
      tags=["carro", "esportivo"])
def p_esp_laranja(it):
    c = esportivo("laranja_escuro", extras=[aero(1.98, 1.06), lambda it, ctx: entradas_ar(it, ctx)])
    vb.carro(it, c, PASTA)


@peca("esportivo_conversivel_vermelho", "Esportivo conversível com aerofólio (vermelho)", "esportivo_conversivel",
      tags=["carro", "esportivo", "conversivel"])
def p_esp_conv(it):
    def acab(it, ctx):
        it.add(vb.para_brisa(-0.55, 0.78, -0.36, 1.1, 0.74, 0.64, moldura="preto"))
        for s in (-1, 1):  # corcovas atrás dos bancos (santantônio carenado)
            it.add(mb.superelipsoide(0.42, 0.7, 0.3, x=s * 0.36, y=0.98, z=0.66, cor="vermelho", e=0.45, nu=12, nv=6))
            it.add(vb.espelho(s * 0.86, -0.42, 0.86, s, "vermelho"))
        entradas_ar(it, ctx)
    c = esportivo("vermelho", cab=None, zb=0.8, extras=[aero(1.98, 1.04), acab], espelhos=False,
                  banheira=dict(y0=-0.5, y1=0.75, w=0.74, z=0.32, r=0.16), cor_banco="preto")
    c["portas"] = [dict(y0=-0.47, y1=0.62)]
    c["bancos"] = [(-0.36, 0.28, 0.5, "assento_motorista"), (0.36, 0.28, 0.5, "assento_1")]
    vb.carro(it, c, PASTA)


# ---------------------------------------------------------------------------------------------------- cupês
def cupe(cor, cab_cor=None, capo=None):
    h = 2.15

    def acab(it, ctx):
        for x in (-0.3, 0.3):
            hit, n = no_topo(ctx, x, -1.15)
            if hit is not None:
                it.add(vb.cola(vb.lente(0.16, 0.42, 0.03, cor="preto", raio=0.06), hit, n, sai=0.008))
        entradas_ar(it, ctx, ys=(0.95,), z=0.52)
    c = dict(
        cor=cor, yF=-h, yR=h, W=1.96, r=0.36, larg_roda=0.31, eixos=[-1.35, 1.35],
        topo=[(-h, 0.48), (-h + 0.2, 0.62), (-1.35, 0.72), (-0.7, 0.78), (-0.5, 0.82), (1.3, 0.86), (h - 0.1, 0.84),
              (h, 0.68)],
        base=[(-h, 0.32), (-h + 0.35, 0.24), (h - 0.35, 0.24), (h, 0.34)],
        larg=[(-h, 0.95), (-1.35, 1.0), (0, 0.96), (1.35, 1.0), (h, 0.97)],
        rF=0.62, rR=0.42, pF=2.2, pR=2.8, et=0.36, eb=0.22, cint=0.5,
        cab=dict(yf0=-0.5, yf1=0.2, yr0=1.68, yr1=0.72, wc0=0.8, wc1=0.62, zb=0.82, zr=1.27, rc=0.18, rr=0.14),
        cor_cabine=cab_cor or cor,
        portas=[dict(y0=-0.42, y1=0.82)], z_porta=0.32,
        luzes=[dict(lado="frente", x=0.6, z=0.6, l=0.32, h=0.14, raio=0.06, giro=8),
               dict(lado="tras", x=0.62, z=0.74, l=0.3, h=0.1, raio=0.04)],
        grade=dict(z=0.42, l=0.9, h=0.13, cor="preto", raio=0.06),
        para_choques=[dict(lado="tras", z=0.36, r=0.06, cor="preto")],
        placas=(("tras", 0.54, "branco"),),
        bancos=[(-0.37, 0.22, 0.5, "assento_motorista"), (0.37, 0.22, 0.5, "assento_1")],
        cor_banco="preto", interior="grafite", roda="esporte", cor_aro="grafite", cor_cubo="preto",
        z_piso=0.34, banco_dz=0.02, extras=[acab],
    )
    if capo:
        def pinta(bm, bmc, cas, cab):
            vb.bm_pinta(bm, [f for f in bm.faces if f.material_index == 0 and vb.centro(f).y < -0.5 and
                             f.normal.z > 0.45 and abs(vb.centro(f).x) < 0.62], cor=capo)
        c["pinta"] = pinta
        c["planos"] = [((0.62, 0, 0), (1, 0, 0)), ((-0.62, 0, 0), (1, 0, 0))]
    return c


@peca("cupe_verde_agua", "Cupê (verde-água)", "cupe", tags=["carro", "cupe", "esportivo"])
def p_cupe_agua(it):
    vb.carro(it, cupe("turquesa_escuro"), PASTA)


@peca("cupe_verde_limao", "Cupê (verde-limão com teto preto)", "cupe", tags=["carro", "cupe", "esportivo"])
def p_cupe_limao(it):
    vb.carro(it, cupe("limao", cab_cor="preto", capo="preto"), PASTA)


# ---------------------------------------------------------------------------------------------------- clássicos de corrida
def classico(cor, faixas=None, numero=None, redondo=False):
    h = 2.08

    def acab(it, ctx):
        for s in (-1, 1):  # escapamento lateral
            it.add(mb.tubo([(s * 0.99, -0.55, 0.3), (s * 1.0, 0.75, 0.3)], 0.045, cor="cromo", seg=10))
        hit, n = no_topo(ctx, 0, -1.0)
        if hit is not None and not redondo:
            it.add(mb.superelipsoide(0.36, 0.5, 0.12, x=0, y=hit.y, z=hit.z - 0.05, cor=cor, e=0.4, nu=12, nv=6))
            it.add(vb.cola(vb.lente(0.24, 0.08, 0.03, cor="preto", raio=0.03), V((0, hit.y - 0.25, hit.z + 0.03)),
                           V((0, -1, 0.3)), sai=0.0))

    if numero is not None:
        mn = est_numero(numero)

        def roundel(s, y0, y1, ctx):
            return decal_lado(ctx, s, (y0 + y1) / 2 + 0.05, 0.55, 0.36, 0.36, mn)
        portas = [dict(y0=-0.4, y1=0.66, extra=roundel)]
    else:
        portas = [dict(y0=-0.4, y1=0.66)]
    return dict(
        cor=cor, yF=-h, yR=h, W=2.02, r=0.36, larg_roda=0.32, eixos=[-1.3, 1.3],
        topo=[(-h, 0.5), (-h + 0.25, 0.66), (-1.3, 0.76), (-0.6, 0.78), (-0.45, 0.8), (1.0, 0.82), (h - 0.2, 0.8),
              (h, 0.6)],
        base=[(-h, 0.34), (-h + 0.35, 0.24), (h - 0.35, 0.24), (h, 0.34)],
        larg=[(-h, 0.95), (-1.3, 1.0), (-0.65, 0.86), (0.65, 0.86), (1.3, 1.0), (h, 0.95)],
        rF=0.75, rR=0.6, pF=2.0, pR=2.2, et=0.48 if redondo else 0.4, eb=0.24, cint=0.45,
        cab=dict(yf0=-0.48, yf1=0.12, yr0=1.15, yr1=0.62, wc0=0.7, wc1=0.52, zb=0.8, zr=1.28, rc=0.22, rr=0.16),
        portas=portas, z_porta=0.32,
        luzes=[dict(lado="frente", x=0.66, z=0.66, l=0.24, h=0.24, forma="redonda", aro="cromo"),
               dict(lado="tras", x=0.66, z=0.66, l=0.15, h=0.15, forma="redonda", aro="cromo")],
        grade=dict(z=0.48, l=0.62 if redondo else 0.7, h=0.3 if redondo else 0.16, cor="preto",
                   forma="redonda" if redondo else "ret", raio=0.07, moldura="cromo" if not redondo else None),
        para_choques=[dict(lado="frente", z=0.36, r=0.045, cor="cromo", amax=45),
                      dict(lado="tras", z=0.4, r=0.045, cor="cromo", amax=45)],
        placas=(("tras", 0.5, "branco"),),
        bancos=[(-0.34, 0.2, 0.48, "assento_motorista"), (0.34, 0.2, 0.48, "assento_1")],
        cor_banco="couro", interior="grafite", roda="raios", cor_aro="cromo", cor_cubo="metal",
        z_piso=0.34, banco_dz=0.02, extras=[acab], faixas=faixas or (), faixa_zmin=0.42,
    )


@peca("carro_corrida_magenta", "Carro de corrida clássico (magenta)", "carro_corrida",
      tags=["carro", "corrida", "classico"])
def p_corrida(it):
    vb.carro(it, classico("magenta", numero=7), PASTA)


@peca("carro_antigo_listrado_azul", "Carro antigo listrado (azul)", "carro_antigo_listrado",
      tags=["carro", "classico", "antigo"])
def p_antigo_azul(it):
    vb.carro(it, classico("azul", faixas=[(0.1, 0.24, "branco")], redondo=True), PASTA)


# ---------------------------------------------------------------------------------------------------- carrinho redondo
def redondo(cor, faixas=None):
    h = 1.8

    def acab(it, ctx):
        cas = ctx["cas"]
        for s in (-1, 1):  # faróis em cima dos para-lamas
            hit, n = ctx["sup"].raio((s * 0.6, cas.yF - 2, 0.74), (0, 1, 0))
            if hit is not None:
                cone = mb.cilindro(0.12, 0.12, r2=0.1, cor="cromo", seg=14, bisel=0.01)
                mb.transforma(cone, rot=("X", 90))
                mb.transforma(cone, loc=(hit.x, hit.y + 0.06, hit.z))
                vid = mb.cilindro(0.1, 0.03, cor=None, mat="luz", seg=14, bisel=0.008)
                mb.transforma(vid, rot=("X", 90))
                mb.transforma(vid, loc=(hit.x, hit.y - 0.05, hit.z))
                it.add(cone, vid)
        for s in (-1, 1):  # estribo
            it.add(mb.caixa(0.12, 1.1, 0.05, x=s * 0.86, y=0.0, z=0.3, cor="grafite", bisel=0.02, seg=2))
        for k in range(4):  # grelha do motor atrás
            hit, n = ctx["sup"].raio((0, cas.yR + 2, 0.82 - k * 0.07), (0, -1, 0))
            if hit is not None:
                it.add(vb.cola(vb.lente(0.42, 0.03, 0.02, cor="grafite", raio=0.012), hit, n, sai=0.006))
    return dict(
        cor=cor, yF=-h, yR=h, W=1.78, r=0.35, larg_roda=0.27, eixos=[-1.15, 1.12],
        topo=[(-h, 0.5), (-h + 0.35, 0.74), (-1.15, 0.82), (-0.8, 0.87), (0.95, 0.9), (h - 0.4, 0.86), (h, 0.56)],
        base=[(-h, 0.38), (-h + 0.4, 0.28), (h - 0.4, 0.28), (h, 0.4)],
        larg=[(-h, 0.92), (-1.15, 1.0), (-0.55, 0.88), (0.5, 0.88), (1.12, 1.0), (h, 0.92)],
        rF=0.85, rR=0.85, pF=2.0, pR=2.0, et=0.55, eb=0.3, cint=0.42, g0=0.6,
        cab=dict(yf0=-0.75, yf1=-0.15, yr0=1.05, yr1=0.4, wc0=0.7, wc1=0.52, zb=0.88, zr=1.55, rc=0.3, rr=0.22,
                 bombe=0.04),
        pilar_b=0.48, larg_pilar=0.08,
        portas=[dict(y0=-0.62, y1=0.48)], z_porta=0.34,
        luzes=[dict(lado="tras", x=0.62, z=0.66, l=0.12, h=0.16, forma="redonda", aro="cromo")],
        grade=None,
        para_choques=[dict(lado="frente", z=0.38, r=0.05, cor="cromo", amax=55),
                      dict(lado="tras", z=0.4, r=0.05, cor="cromo", amax=55)],
        placas=(("tras", 0.52, "branco"),),
        bancos=[(-0.34, -0.05, 0.46, "assento_motorista"), (0.34, -0.05, 0.46, "assento_1"), (0.0, 0.72, 1.1, None)],
        slots_extra=[("assento_2", -0.3, 0.72), ("assento_3", 0.3, 0.72)],
        cor_banco="creme", interior="bege_escuro", roda="branca", cor_aro="cromo", cor_cubo="cromo",
        extras=[acab], faixas=faixas or (), faixa_zmin=0.4, z_piso=0.4,
    )


@peca("carrinho_redondo_laranja", "Carrinho redondo retrô (laranja)", "carrinho_redondo",
      tags=["carro", "retro", "classico"])
def p_red_lar(it):
    vb.carro(it, redondo("laranja"), PASTA)


@peca("carrinho_redondo_cinza_listrado", "Carrinho redondo retrô (cinza listrado)", "carrinho_redondo",
      tags=["carro", "retro", "classico"])
def p_red_cin(it):
    vb.carro(it, redondo("cinza_medio", faixas=[(0.08, 0.15, "branco"), (0.22, 0.29, "branco")]), PASTA)


# ---------------------------------------------------------------------------------------------------- minivan 6 rodas
@peca("minivan_roxa_6_rodas", "Minivan de 6 rodas (roxa)", "minivan_6_rodas", tags=["carro", "minivan", "familia"])
def p_minivan(it):
    h = 2.7
    c = dict(
        cor="roxo_escuro", yF=-h, yR=h, W=2.02, r=0.38, larg_roda=0.3, eixos=[-1.85, 1.3, 2.05],
        topo=[(-h, 0.72), (-h + 0.15, 0.88), (-h + 0.6, 0.98), (-1.6, 1.02), (h - 0.1, 1.04), (h, 0.88)],
        base=[(-h, 0.46), (-h + 0.3, 0.36), (h - 0.3, 0.36), (h, 0.48)],
        rF=0.55, rR=0.3, pF=2.6, pR=3.6, et=0.3, eb=0.2, cint=0.55,
        cab=dict(yf0=-1.72, yf1=-1.05, yr0=2.58, yr1=2.5, wc0=0.9, wc1=0.8, zb=1.04, zr=1.98, rc=0.16, rr=0.16),
        pilar_b=-0.62, pilares=[0.92, 1.95], larg_pilar=0.1,
        portas=[dict(y0=-1.64, y1=-0.62), dict(y0=-0.62, y1=0.84, lados=(1,), correr=True, curso=0.8)],
        z_porta=0.44,
        tampa=dict(tipo="tampa", y0=2.46, z=0.72, w=0.72, angulo=82),
        luzes=[dict(lado="frente", x=0.64, z=0.8, l=0.34, h=0.16, raio=0.06),
               dict(lado="tras", x=0.82, z=1.0, l=0.13, h=0.34, raio=0.04)],
        grade=dict(z=0.62, l=0.8, h=0.14, cor="grafite_escuro", raio=0.06),
        para_choques=[dict(lado="frente", z=0.46, r=0.09, cor="grafite"), dict(lado="tras", z=0.5, r=0.09,
                                                                                    cor="grafite")],
        placas=(("frente", 0.46, "branco"), ("tras", 0.72, "branco")),
        bancos=[(-0.4, -1.05, 0.5, "assento_motorista"), (0.4, -1.05, 0.5, "assento_1"), (0.0, 0.05, 1.4, None),
                (0.0, 1.2, 1.4, None)],
        slots_extra=[("assento_2", -0.4, 0.05), ("assento_3", 0.4, 0.05), ("assento_4", -0.4, 1.2),
                     ("assento_5", 0.4, 1.2)],
        cor_banco="lilas", interior="cinza_medio", roda="calota", cor_aro="metal_claro", z_piso=0.5,
        extras=[bagageiro_trilhos],
    )
    vb.carro(it, c, PASTA)


# ---------------------------------------------------------------------------------------------------- picapes
def picape(cor, motor=False):
    h = 2.3
    yb0 = 0.48

    def painel(ctx):
        cas = ctx["cas"]
        w = 0.84
        y = cas.yR - 0.13
        p = mb.caixa(2 * w - 0.01, 0.07, 0.36, y=y, z=0.64, cor=cor, bisel=0.025, seg=2)
        lz = [mb.caixa(0.12, 0.03, 0.2, x=s * (w - 0.1), y=y + 0.045, z=0.72, cor=None, mat="luz_vermelha",
                       bisel=0.01, seg=1) for s in (-1, 1)]
        return [p] + lz

    def acab(it, ctx):
        cas = ctx["cas"]
        for s in (-1, 1):  # faróis redondos nos para-lamas
            hit, n = ctx["sup"].raio((s * 0.7, cas.yF - 2, 0.82), (0, 1, 0))
            if hit is not None:
                it.add(vb.cola(vb.lente(0.28, 0.28, 0.06, cor="cromo", forma="redonda"), hit, n, sai=0.01))
                it.add(vb.cola(vb.lente(0.22, 0.22, 0.05, cor=None, mat="luz", forma="redonda", bisel=0.01), hit, n,
                               sai=0.035))
        if motor:
            zt = cas.topo(-1.32) - 0.02  # (o raio cairia no buraco do capô)
            it.add(mb.caixa(0.62, 0.62, 0.5, y=-1.32, z=zt - 0.38, cor="grafite", bisel=0.05, seg=2))
            for s in (-1, 1):
                it.add(mb.caixa(0.16, 0.56, 0.12, x=s * 0.2, y=-1.32, z=zt + 0.08, cor="cromo", bisel=0.04, seg=2))
                for k in range(3):
                    it.add(mb.tubo([(s * 0.32, -1.5 + k * 0.17, zt - 0.05), (s * 0.5, -1.45 + k * 0.17, zt - 0.08),
                                    (s * 0.62, -1.2 + k * 0.1, zt - 0.22)], 0.025, cor="cromo", seg=8))
            it.add(mb.cilindro(0.2, 0.12, x=0, y=-1.32, z=zt + 0.16, cor="cromo", seg=16, bisel=0.02))
            it.add(mb.cilindro(0.1, 0.08, x=0, y=-1.32, z=zt + 0.28, cor="metal_escuro", seg=12, bisel=0.01))
            for s in (-1, 1):
                it.add(mb.cilindro(0.06, 0.16, x=s * 0.15, y=-1.6, z=zt - 0.08, cor="cromo", seg=10, bisel=0.01))
    cortes = [lambda cas: mb.extrudado(mb.ret_arredondado(1.68, 3.0, 0.08, seg=3), 2.0, y=yb0 + 1.5, z=0.66,
                                       cor=cor, bisel=0)]
    if motor:
        cortes.append(lambda cas: mb.extrudado(mb.ret_arredondado(0.76, 0.8, 0.12, seg=3), 2.0, y=-1.32, z=0.62,
                                               cor="grafite_escuro", bisel=0))
    return dict(
        cor=cor, yF=-h, yR=h, W=1.96, r=0.4, larg_roda=0.32, eixos=[-1.45, 1.42],
        topo=[(-h, 0.74), (-h + 0.15, 0.9), (-h + 0.6, 0.98), (-0.6, 1.02), (h - 0.06, 1.02), (h, 0.98)],
        base=[(-h, 0.5), (-h + 0.3, 0.4), (h - 0.2, 0.4), (h, 0.48)],
        larg=[(-h, 0.95), (-1.45, 1.0), (-0.8, 0.9), (1.0, 0.9), (1.42, 0.98), (h, 0.98)],
        rF=0.55, rR=0.18, pF=2.2, pR=5.0, et=0.36, eb=0.22, cint=0.5,
        cab=dict(yf0=-0.6, yf1=-0.28, yr0=0.4, yr1=0.34, wc0=0.82, wc1=0.74, zb=1.02, zr=1.74, rc=0.14, rr=0.14,
                 bombe=0.03),
        portas=[dict(y0=-0.52, y1=0.32)], z_porta=0.46,
        banheira=dict(y0=-0.53, y1=0.33, w=0.75, r=0.08, z=0.54),
        tampa=dict(tipo="cacamba", painel=painel, y_dob=h - 0.13, z_dob=0.62),
        luzes=[], cortes=cortes,
        grade=dict(z=0.66, l=0.78, h=0.3, cor="grafite_escuro", moldura="cromo", raio=0.08, barras=4,
                   cor_barras="cromo"),
        para_choques=[dict(lado="frente", z=0.46, r=0.08, cor="cromo", amax=60)],
        placas=(("frente", 0.46, "branco"),),
        bancos=[(0.0, 0.08, 1.3, None)],
        slots_extra=[("assento_motorista", -0.38, 0.08), ("assento_1", 0.38, 0.08)],
        cor_banco="couro" if not motor else "preto", interior="grafite", roda="calota", cor_aro="cromo",
        cor_cubo="cromo", extras=[acab],
    )


def slot_cacamba(it):
    it.slot("cacamba", (0, 1.4, 0.68), (1.5, 1.6, 0.6))


@peca("picape_vermelha", "Picape clássica (vermelha)", "picape", tags=["carro", "picape", "classico"])
def p_picape(it):
    vb.carro(it, picape("vermelho"), PASTA)
    slot_cacamba(it)


@peca("picape_verde_motor", "Picape com motor à mostra (verde)", "picape_motor",
      tags=["carro", "picape", "envenenado"])
def p_picape_motor(it):
    vb.carro(it, picape("verde_claro", motor=True), PASTA)
    slot_cacamba(it)


# ---------------------------------------------------------------------------------------------------- futuristas
def futuro_luzes(frente_z, tras_z, l_tras=1.5):
    def fn(it, ctx):
        cas = ctx["cas"]
        hit, n = ctx["sup"].raio((0, cas.yF - 2, frente_z), (0, 1, 0))
        if hit is not None:
            it.add(vb.cola(vb.lente(1.2, 0.035, 0.03, cor=None, mat="neon", raio=0.015), hit, n, sai=0.01))
        hit, n = ctx["sup"].raio((0, cas.yR + 2, tras_z), (0, -1, 0))
        if hit is not None:
            it.add(vb.cola(vb.lente(l_tras, 0.05, 0.03, cor=None, mat="luz_vermelha", raio=0.02), hit, n, sai=0.01))
    return fn


@peca("futurista_sedan_branco", "Carro futurista sedã (branco)", "futurista_sedan", tags=["carro", "futurista"])
def p_fut1(it):
    h = 2.25
    c = dict(
        cor="branco", yF=-h, yR=h, W=1.96, r=0.37, larg_roda=0.3, eixos=[-1.42, 1.42],
        topo=[(-h, 0.5), (-h + 0.25, 0.66), (-1.2, 0.78), (-0.6, 0.84), (1.5, 0.88), (h - 0.25, 0.86), (h, 0.62)],
        base=[(-h, 0.34), (-h + 0.4, 0.26), (h - 0.4, 0.26), (h, 0.36)],
        rF=0.8, rR=0.55, pF=2.0, pR=2.4, et=0.5, eb=0.25, cint=0.45, g0=0.6,
        cab=dict(yf0=-0.72, yf1=0.05, yr0=1.85, yr1=0.95, wc0=0.82, wc1=0.6, zb=0.86, zr=1.42, rc=0.26, rr=0.2),
        cor_cabine="preto", moldura="grafite_escuro", pilar_b=0.4,
        portas=[dict(y0=-0.6, y1=0.4), dict(y0=0.4, y1=0.92)], z_porta=0.34, macanetas=False,
        tampa=dict(tipo="porta_malas", y0=1.9, z=0.66, w=0.6),
        luzes=[dict(lado="frente", x=0.66, z=0.66, l=0.3, h=0.07, raio=0.03, giro=6)],
        grade=None, para_choques=[], placas=(("tras", 0.5, "branco"),),
        bancos=list(BANCOS_4), slots_extra=list(SLOTS_TRAS),
        cor_banco="branco_gelo", interior="cinza_claro", roda="neon", cor_aro="branco", cor_cubo="branco",
        mat_aro="neon", z_piso=0.4, extras=[futuro_luzes(0.58, 0.72)],
    )
    vb.carro(it, c, PASTA)


@peca("futurista_bolha_branco", "Carro futurista bolha (branco)", "futurista_bolha", tags=["carro", "futurista"])
def p_fut2(it):
    h = 1.95
    c = dict(
        cor="branco", yF=-h, yR=h, W=1.9, r=0.34, larg_roda=0.28, eixos=[-1.2, 1.2],
        topo=[(-h, 0.42), (-h + 0.5, 0.7), (-0.6, 0.8), (0.6, 0.82), (h - 0.45, 0.72), (h, 0.42)],
        base=[(-h, 0.32), (-h + 0.5, 0.24), (h - 0.5, 0.24), (h, 0.32)],
        rF=1.05, rR=1.0, pF=2.0, pR=2.0, et=0.6, eb=0.32, cint=0.42, g0=0.55,
        cab=dict(yf0=-0.85, yf1=-0.1, yr0=1.15, yr1=0.55, wc0=0.72, wc1=0.46, zb=0.8, zr=1.4, rc=0.34, rr=0.26,
                 bombe=0.04),
        cor_cabine="preto", moldura="grafite_escuro", portas=[], capota=dict(y=-0.8, z=0.82, angulo=58),
        luzes=[dict(lado="frente", x=0.5, z=0.6, l=0.26, h=0.06, raio=0.03, giro=-10),
               dict(lado="tras", x=0.52, z=0.62, l=0.26, h=0.06, raio=0.03, giro=10)],
        grade=None, para_choques=[], placas=(), espelhos=False,
        banheira=dict(y0=-0.78, y1=1.08, w=0.66, r=0.25, z=0.38),
        bancos=[(-0.32, 0.25, 0.48, "assento_motorista"), (0.32, 0.25, 0.48, "assento_1")],
        cor_banco="turquesa", interior="cinza_claro", roda="neon", cor_aro="branco", cor_cubo="branco",
        mat_aro="neon", extras=[futuro_luzes(0.5, 0.5, 0.9)],
    )
    vb.carro(it, c, PASTA)


@peca("futurista_hiper_branco", "Carro futurista hiperesportivo (branco)", "futurista_hiper",
      tags=["carro", "futurista", "esportivo"])
def p_fut3(it):
    h = 2.3

    def acab(it, ctx):
        entradas_ar(it, ctx, ys=(0.75,), z=0.46, cor="preto")
        cas = ctx["cas"]
        hit, n = ctx["sup"].raio((0, cas.yR + 2, 0.36), (0, -1, 0))
        if hit is not None:
            for x in (-0.3, 0, 0.3):
                it.add(mb.caixa(0.03, 0.2, 0.14, x=x, y=hit.y - 0.05, z=0.22, cor="preto", bisel=0.01, seg=1))
    c = dict(
        cor="branco", yF=-h, yR=h, W=2.06, r=0.36, larg_roda=0.32, eixos=[-1.45, 1.42],
        topo=[(-h, 0.36), (-h + 0.3, 0.5), (-1.2, 0.6), (-0.5, 0.68), (0.8, 0.76), (h - 0.3, 0.74), (h, 0.6)],
        base=[(-h, 0.26), (-h + 0.4, 0.2), (h - 0.3, 0.2), (h, 0.28)],
        larg=[(-h, 0.95), (-1.45, 0.98), (-0.3, 0.9), (0.7, 0.94), (1.42, 1.0), (h, 0.98)],
        rF=0.9, rR=0.45, pF=1.9, pR=2.6, et=0.42, eb=0.22, cint=0.45, g0=0.6,
        cab=dict(yf0=-0.62, yf1=0.12, yr0=1.55, yr1=0.78, wc0=0.66, wc1=0.44, zb=0.72, zr=1.14, rc=0.3, rr=0.14),
        cor_cabine="preto", moldura="grafite_escuro", portas=[], capota=dict(y=-0.58, z=0.74, angulo=55),
        luzes=[dict(lado="frente", x=0.62, z=0.46, l=0.34, h=0.06, raio=0.03, giro=-16),
               dict(lado="tras", x=0.6, z=0.6, l=0.4, h=0.05, raio=0.02)],
        grade=dict(z=0.3, l=0.6, h=0.1, cor="preto", raio=0.04), para_choques=[], placas=(), espelhos=False,
        banheira=dict(y0=-0.55, y1=1.45, w=0.6, r=0.25, z=0.32),
        bancos=[(-0.3, 0.45, 0.46, "assento_motorista"), (0.3, 0.45, 0.46, "assento_1")],
        cor_banco="magenta", interior="grafite", roda="neon", cor_aro="branco", cor_cubo="branco",
        mat_aro="neon_rosa", extras=[acab],
    )
    vb.carro(it, c, PASTA)


# ---------------------------------------------------------------------------------------------------- bugue
@peca("bugue_laranja", "Bugue (laranja)", "bugue", tags=["carro", "bugue", "praia", "aberto"])
def p_bugue(it):
    h = 1.75
    eixos = [-1.18, 1.18]

    def acab(it, ctx):
        cas = ctx["cas"]
        it.add(vb.para_brisa(-0.62, 0.86, -0.42, 1.2, 0.68, 0.64, moldura="grafite", r_moldura=0.035))
        ps = [mb.tubo([(-0.7, 0.5, 0.72), (-0.66, 0.55, 1.62), (0.66, 0.55, 1.62), (0.7, 0.5, 0.72)], 0.04,
                      cor="metal_claro", seg=10)]
        for s in (-1, 1):
            ps.append(mb.tubo([(s * 0.66, 0.55, 1.62), (s * 0.64, -0.38, 1.25)], 0.035, cor="metal_claro", seg=10))
            ps.append(mb.tubo([(s * 0.66, 0.55, 1.5), (s * 0.66, 1.25, 0.88)], 0.035, cor="metal_claro", seg=10))
        it.add(mb.junta(ps, "santantonio"))
        for s in (-1, 1):  # faróis redondos em cima do capô
            hit, _ = no_topo(ctx, s * 0.42, cas.yF + 0.3)
            if hit is not None:
                it.add(mb.cilindro(0.11, 0.14, eixo="y", x=s * 0.42, y=hit.y + 0.02, z=hit.z + 0.1, cor="cromo",
                                   seg=14, bisel=0.02))
                vid = mb.cilindro(0.085, 0.03, cor=None, mat="luz", seg=14, bisel=0.008)
                mb.transforma(vid, rot=("X", 90))
                mb.transforma(vid, loc=(s * 0.42, hit.y - 0.06, hit.z + 0.1))
                it.add(vid, mb.caixa(0.05, 0.05, 0.1, x=s * 0.42, y=hit.y + 0.02, z=hit.z - 0.02, cor="grafite",
                                     bisel=0.01, seg=1))
        it.add(mb.caixa(0.6, 0.4, 0.3, y=cas.yR + 0.05, z=0.5, cor="metal", bisel=0.04, seg=2))  # motor atrás
        it.add(mb.tubo([(0.2, cas.yR + 0.1, 0.55), (0.32, cas.yR + 0.32, 0.5), (0.32, cas.yR + 0.42, 0.62)], 0.04,
                       cor="cromo", seg=10))
        for s in (-1, 1):
            it.add(mb.caixa(0.04, 0.06, 0.06, x=s * 0.62, y=cas.yR - 0.04, z=0.66, cor=None, mat="luz_vermelha",
                            bisel=0.01, seg=1))
        for ya in eixos:  # abas dos para-lamas sobre as rodas
            for s in (-1, 1):
                pts = [(s * 0.95, ya + 0.62 * math.cos(math.radians(a)), 0.43 + 0.52 * math.sin(math.radians(a)))
                       for a in range(15, 170, 22)]
                it.add(mb.tubo(pts, 0.05, cor="laranja", seg=8, raio_curva=0))
    c = dict(
        cor="laranja", yF=-h, yR=h, W=1.6, r=0.43, larg_roda=0.36, eixos=eixos, x_roda=0.95,
        topo=[(-h, 0.62), (-h + 0.12, 0.8), (-0.8, 0.86), (h - 0.3, 0.86), (h, 0.7)],
        base=[(-h, 0.48), (-h + 0.25, 0.38), (h - 0.25, 0.38), (h, 0.48)],
        rF=0.4, rR=0.35, pF=2.6, pR=2.8, et=0.38, eb=0.24, cint=0.45, arcos=False,
        cab=None, zb=0.86, espelhos=False, banheira=dict(y0=-0.58, y1=1.3, w=0.66, z=0.44, r=0.18),
        portas=[], luzes=[], grade=None,
        para_choques=[dict(lado="frente", z=0.48, r=0.06, cor="grafite", amax=55)],
        placas=(("tras", 0.62, "branco"),),
        bancos=[(-0.34, 0.2, 0.5, "assento_motorista"), (0.34, 0.2, 0.5, "assento_1")],
        cor_banco="turquesa", interior="grafite", roda="raios", cor_aro="metal_claro", cor_cubo="grafite",
        extras=[acab], banco_dz=0.04,
        colisao=[((0, 0, 0), (2.3, 3.6, 0.9)), ((0, 0.1, 0.9), (1.5, 1.4, 0.75))],
    )
    vb.carro(it, c, PASTA)


# ======================================================================================================================
# Veículos abertos feitos à mão
# ======================================================================================================================
def rodas_par(it, r, larg, y, x, nome, **op):
    for s in (-1, 1):
        vb.poe_roda(it, r, larg, s * x, y, f"roda_{nome}_{'dir' if s > 0 else 'esq'}", **op)


@peca("kart_antena", "Kart com antena", "kart", tags=["kart", "corrida", "aberto"], veiculo="kart")
def p_kart(it):
    ps = [mb.caixa(0.82, 1.7, 0.06, y=0.0, z=0.12, cor="grafite", bisel=0.02, seg=2)]
    ps.append(mb.superelipsoide(0.58, 1.25, 0.42, x=0, y=-0.42, z=0.14, cor="vermelho", e=0.55, e_v=0.6, nu=20, nv=10))
    ps.append(mb.superelipsoide(0.42, 0.7, 0.26, x=0, y=-0.32, z=0.42, cor="azul", e=0.6, e_v=0.7, nu=16, nv=8))
    ps.append(mb.superelipsoide(0.2, 0.36, 0.1, x=0, y=-0.95, z=0.3, cor="amarelo", e=0.5, nu=12, nv=6))
    for s in (-1, 1):
        ps.append(mb.superelipsoide(0.2, 0.7, 0.24, x=s * 0.34, y=0.3, z=0.14, cor="vermelho", e=0.45, nu=12, nv=6))
        ps.append(mb.tubo([(s * 0.15, -0.6, 0.2), (s * 0.55, -0.6, 0.18)], 0.025, cor="metal", seg=8))
        ps.append(mb.tubo([(s * 0.15, 0.62, 0.22), (s * 0.58, 0.62, 0.22)], 0.03, cor="metal", seg=8))
    ps.append(vb.banco(0, 0.28, 0.16, larg=0.42, cor="preto", prof=0.38, enc=0.42, incl=18, cabeca=False))
    ps.append(mb.caixa(0.34, 0.3, 0.26, y=0.68, z=0.16, cor="metal", bisel=0.04, seg=2))
    ps.append(mb.cilindro(0.06, 0.2, eixo="y", x=0.12, y=0.86, z=0.3, cor="cromo", seg=10, bisel=0.01))
    ps.append(mb.superelipsoide(1.0, 0.32, 0.06, x=0, y=0.82, z=0.8, cor="amarelo", e=0.25, e_v=0.6, nu=16, nv=6))
    for s in (-1, 1):
        ps.append(mb.caixa(0.04, 0.4, 0.22, x=s * 0.5, y=0.82, z=0.68, cor="vermelho", bisel=0.015, seg=2))
        ps.append(mb.caixa(0.05, 0.08, 0.5, x=s * 0.2, y=0.8, z=0.32, cor="vermelho", bisel=0.015, seg=1))
    ps.append(mb.cilindro(0.008, 1.1, x=0.4, y=0.9, z=0.82, cor="metal_claro", seg=6, bisel=0))  # antena
    ps.append(mb.esfera(0.03, x=0.4, y=0.9, z=1.93, cor="vermelho", seg=10))
    ps.append(vb.volante(0, -0.08, 0.52, r=0.13, incl=-50))
    it.add(mb.junta(ps, "kart"))
    for x in (-0.12, 0.12):
        it.add(vb.cola(vb.lente(0.08, 0.05, 0.02, cor=None, mat="luz", forma="redonda", bisel=0.005),
                       V((x, -1.03, 0.27)), V((0, -1, 0.3)), sai=0.0))
    for s in (-1, 1):
        it.add(mb.caixa(0.02, 0.06, 0.08, x=s * 0.52, y=1.03, z=0.74, cor=None, mat="luz_vermelha", bisel=0.005, seg=1))
    rodas_par(it, 0.17, 0.14, -0.62, 0.62, "dianteira", estilo="raios", cor_aro="metal_claro", cor_cubo="grafite")
    rodas_par(it, 0.21, 0.2, 0.62, 0.66, "traseira", estilo="raios", cor_aro="metal_claro", cor_cubo="grafite")
    it.slot("assento_motorista", (0, 0.22, 0.3), ASSENTO)
    it.colisao([((0, 0, 0), (1.5, 2.1, 0.62)), ((0, 0.82, 0.62), (1.05, 0.42, 0.26))])


def scooter(it, cor):
    ps = [mb.caixa(0.34, 0.62, 0.1, y=-0.05, z=0.22, cor=cor, bisel=0.04, seg=2)]
    ps.append(mb.superelipsoide(0.4, 0.78, 0.44, x=0, y=0.36, z=0.26, cor=cor, e=0.5, e_v=0.55, nu=16, nv=8))
    ps.append(mb.superelipsoide(0.32, 0.64, 0.12, x=0, y=0.32, z=0.68, cor="marrom", e=0.3, e_v=0.55, estufa=0.3,
                                nu=14, nv=6))
    escudo = mb.superelipsoide(0.4, 0.16, 0.66, z=-0.33, cor=cor, e=0.45, e_v=0.6, nu=14, nv=7)
    mb.transforma(escudo, rot=("X", -14))
    mb.transforma(escudo, loc=(0, -0.42, 0.56))
    ps.append(escudo)
    ps.append(mb.tubo([(0, -0.5, 0.42), (0, -0.56, 0.98)], 0.035, cor="grafite", seg=8))
    ps.append(mb.superelipsoide(0.26, 0.2, 0.15, x=0, y=-0.57, z=0.96, cor=cor, e=0.45, nu=12, nv=6))
    ps.append(mb.tubo([(-0.32, -0.55, 1.06), (0.32, -0.55, 1.06)], 0.018, cor="grafite", seg=8))
    for s in (-1, 1):
        ps.append(mb.cilindro(0.024, 0.11, eixo="x", x=s * 0.34, y=-0.55, z=1.06, cor="preto", seg=8, bisel=0.008))
        ps.append(mb.tubo([(s * 0.12, -0.56, 1.06), (s * 0.2, -0.58, 1.2)], 0.008, cor="grafite", seg=6))
        ps.append(mb.esfera(0.04, x=s * 0.2, y=-0.58, z=1.23, cor=cor, esc=(1.2, 0.5, 0.8), seg=10))
    ps.append(mb.superelipsoide(0.16, 0.42, 0.1, x=0, y=-0.66, z=0.38, cor=cor, e=0.5, nu=12, nv=6))  # para-lama
    ps.append(mb.tubo([(0, -0.62, 0.42), (0, -0.66, 0.2)], 0.022, cor="metal", seg=8))
    it.add(mb.junta(ps, "scooter"))
    it.add(vb.cola(vb.lente(0.12, 0.09, 0.03, cor=None, mat="luz", forma="redonda", bisel=0.006),
                   V((0, -0.67, 0.97)), V((0, -1, 0.1)), sai=0.0))
    it.add(vb.cola(vb.lente(0.12, 0.05, 0.02, cor=None, mat="luz_vermelha", raio=0.02), V((0, 0.75, 0.52)),
                   V((0, 1, 0.3)), sai=0.0))
    vb.poe_roda(it, 0.2, 0.11, 0, -0.66, "roda_dianteira", estilo="calota", cor_aro="metal_claro")
    vb.poe_roda(it, 0.2, 0.12, 0, 0.6, "roda_traseira", estilo="calota", cor_aro="metal_claro")
    it.slot("assento_motorista", (0, 0.2, 0.8), ASSENTO)
    it.slot("assento_1", (0, 0.5, 0.8), ASSENTO)
    it.colisao([((0, 0, 0), (0.7, 1.8, 1.2))])


@peca("scooter_turquesa", "Scooter (turquesa)", "scooter", tags=["moto", "scooter"], veiculo="moto")
def p_scooter(it):
    scooter(it, "turquesa")


@peca("scooter_rosa", "Scooter (rosa)", "scooter", tags=["moto", "scooter"], veiculo="moto")
def p_scooter_rosa(it):
    scooter(it, "rosa")


@peca("moto_vermelha", "Moto clássica (vermelha)", "moto", tags=["moto"], veiculo="moto")
def p_moto(it):
    ps = []
    yf, yt, r = -0.74, 0.7, 0.33
    q = (0, yf + 0.25, 0.98)  # caixa de direção
    ps.append(mb.tubo([q, (0, -0.22, 0.48), (0, 0.18, 0.4), (0, yt, r)], 0.03, cor="grafite", seg=8))
    ps.append(mb.tubo([(0, yf + 0.27, 0.92), (0, 0.4, 0.8), (0, yt, r + 0.02)], 0.028, cor="grafite", seg=8))
    tanque = mb.superelipsoide(0.32, 0.56, 0.26, z=-0.13, cor="vermelho", e=0.45, e_v=0.6, nu=12, nv=6)
    mb.transforma(tanque, rot=("X", 6))
    mb.transforma(tanque, loc=(0, -0.2, 0.88))
    ps.append(tanque)
    ps.append(mb.superelipsoide(0.28, 0.56, 0.11, x=0, y=0.28, z=0.79, cor="couro_preto", e=0.3, e_v=0.55,
                                estufa=0.3, nu=14, nv=6))
    ps.append(mb.superelipsoide(0.24, 0.3, 0.2, x=0, y=0.5, z=0.66, cor="vermelho", e=0.45, nu=12, nv=6))
    ps.append(mb.caixa(0.26, 0.4, 0.3, y=-0.06, z=0.26, cor="metal", bisel=0.05, seg=2))
    for s in (-1, 1):
        ps.append(mb.cilindro(0.075, 0.18, x=s * 0.12, y=-0.2, z=0.5, cor="cromo", seg=10, bisel=0.02))
    ps.append(mb.tubo([(0.1, -0.18, 0.3), (0.16, 0.0, 0.22), (0.17, 0.6, 0.28), (0.17, 0.9, 0.34)], 0.04,
                      cor="cromo", seg=10))
    for s in (-1, 1):
        ps.append(mb.tubo([(s * 0.1, yf + 0.25, 1.02), (s * 0.1, yf, r)], 0.026, cor="cromo", seg=8))
    ps.append(mb.tubo([(-0.36, yf + 0.33, 1.12), (-0.3, yf + 0.27, 1.06), (0.3, yf + 0.27, 1.06),
                       (0.36, yf + 0.33, 1.12)], 0.018, cor="cromo", seg=8))
    for s in (-1, 1):
        ps.append(mb.cilindro(0.026, 0.11, eixo="x", x=s * 0.38, y=yf + 0.34, z=1.13, cor="preto", seg=8, bisel=0.008))
    ps.append(mb.esfera(0.11, x=0, y=yf + 0.16, z=0.98, cor="cromo", esc=(1, 0.9, 1), seg=10))
    for y0, a0, a1 in ((yf, 20, 160), (yt, 30, 175)):
        pts = [(0, y0 + (r + 0.06) * math.cos(math.radians(a)), r + (r + 0.06) * math.sin(math.radians(a)))
               for a in range(a0, a1 + 1, 18)]
        ps.append(mb.tubo(pts, 0.065, cor="vermelho", seg=8, raio_curva=0))
    it.add(mb.junta(ps, "moto"))
    it.add(vb.cola(vb.lente(0.15, 0.15, 0.03, cor=None, mat="luz", forma="redonda", bisel=0.008),
                   V((0, yf + 0.06, 0.98)), V((0, -1, 0)), sai=0.0))
    it.add(vb.cola(vb.lente(0.1, 0.06, 0.02, cor=None, mat="luz_vermelha", raio=0.02), V((0, 0.83, 0.68)),
                   V((0, 1, 0.2)), sai=0.0))
    vb.poe_roda(it, r, 0.13, 0, yf, "roda_dianteira", estilo="moto", cor_aro="cromo")
    vb.poe_roda(it, r, 0.15, 0, yt, "roda_traseira", estilo="moto", cor_aro="cromo")
    it.slot("assento_motorista", (0, 0.18, 0.86), ASSENTO)
    it.slot("assento_1", (0, 0.48, 0.86), ASSENTO)
    it.colisao([((0, 0, 0), (0.8, 2.15, 1.15))])


def bicicleta(it, cor):
    r = 0.34
    yf, yt = -0.56, 0.52
    mov = V((0, 0.0, 0.3))
    sel = V((0, 0.16, 0.86))
    cab = V((0, -0.4, 0.92))
    ps = []
    c = dict(cor=cor, seg=8)
    ps.append(mb.tubo([mov, sel], 0.026, **c))
    ps.append(mb.tubo([mov, cab + V((0, 0.02, -0.12))], 0.03, **c))
    ps.append(mb.tubo([sel + V((0, 0.0, -0.06)), cab + V((0, 0.0, -0.02))], 0.024, **c))
    for s in (-1, 1):
        ps.append(mb.tubo([mov + V((s * 0.04, 0, 0)), (s * 0.06, yt, r)], 0.016, **c))
        ps.append(mb.tubo([sel + V((s * 0.03, 0, -0.06)), (s * 0.06, yt, r)], 0.015, **c))
        ps.append(mb.tubo([cab + V((s * 0.04, 0, -0.08)), (s * 0.05, yf, r)], 0.016, cor="metal_claro", seg=8))
    ps.append(mb.tubo([sel, sel + V((0, 0.02, 0.1))], 0.016, cor="metal_claro", seg=8))
    ps.append(mb.superelipsoide(0.16, 0.26, 0.07, x=0, y=sel.y + 0.04, z=sel.z + 0.09, cor="marrom", e=0.45, nu=12,
                                nv=6))
    ps.append(mb.tubo([cab, cab + V((0, 0, 0.12))], 0.018, cor="metal_claro", seg=8))
    ps.append(mb.tubo([(-0.3, cab.y + 0.12, cab.z + 0.16), (-0.24, cab.y + 0.02, cab.z + 0.13),
                       (0.24, cab.y + 0.02, cab.z + 0.13), (0.3, cab.y + 0.12, cab.z + 0.16)], 0.014,
                      cor="metal_claro", seg=8))
    for s in (-1, 1):
        ps.append(mb.cilindro(0.02, 0.1, eixo="x", x=s * 0.31, y=cab.y + 0.13, z=cab.z + 0.17, cor="preto", seg=8,
                              bisel=0.006))
    ps.append(mb.cilindro(0.09, 0.012, eixo="x", x=0.06, y=0, z=0.3, cor="metal", seg=16, bisel=0.003))
    for s, dz in ((1, 1), (-1, -1)):
        ps.append(mb.tubo([(s * 0.08, 0, 0.3), (s * 0.1, 0.036 * dz, 0.3 - 0.15 * dz)], 0.012, cor="grafite", seg=6))
        ps.append(mb.caixa(0.09, 0.05, 0.02, x=s * 0.15, y=0.036 * dz, z=0.3 - 0.15 * dz - 0.01, cor="preto",
                           bisel=0.006, seg=1))
    yc, zc = -0.68, 0.84  # cestinha
    ps.append(mb.caixa(0.34, 0.26, 0.012, y=yc, z=zc, cor="cinza", bisel=0.004, seg=1))
    for s in (-1, 1):
        ps.append(mb.caixa(0.012, 0.26, 0.18, x=s * 0.165, y=yc, z=zc, cor="cinza", bisel=0.004, seg=1))
        ps.append(mb.caixa(0.34, 0.012, 0.18, x=0, y=yc + s * 0.125, z=zc, cor="cinza", bisel=0.004, seg=1))
    ps.append(mb.tubo([(0, yc + 0.13, zc + 0.05), (0, cab.y - 0.02, cab.z + 0.04)], 0.012, cor="grafite", seg=6))
    it.add(mb.junta(ps, "bicicleta"))
    it.add(vb.cola(vb.lente(0.06, 0.06, 0.03, cor=None, mat="luz", forma="redonda", bisel=0.006),
                   V((0, cab.y - 0.06, cab.z + 0.02)), V((0, -1, 0)), sai=0.0))
    it.add(vb.cola(vb.lente(0.05, 0.04, 0.015, cor=None, mat="luz_vermelha", raio=0.012),
                   V((0, sel.y + 0.06, sel.z - 0.02)), V((0, 1, 0)), sai=0.0))
    vb.poe_roda(it, r, 0.05, 0, yf, "roda_dianteira", estilo="bici", cor_aro="metal_claro")
    vb.poe_roda(it, r, 0.05, 0, yt, "roda_traseira", estilo="bici", cor_aro="metal_claro")
    it.slot("assento_motorista", (0, sel.y + 0.04, sel.z + 0.12), ASSENTO)
    it.colisao([((0, -0.06, 0), (0.62, 1.78, 1.1))])


@peca("bicicleta_amarela", "Bicicleta com cestinha (amarela)", "bicicleta", tags=["bicicleta"], veiculo="bicicleta")
def p_bici(it):
    bicicleta(it, "amarelo_escuro")


@peca("bicicleta_azul", "Bicicleta com cestinha (azul)", "bicicleta", tags=["bicicleta"], veiculo="bicicleta")
def p_bici_azul(it):
    bicicleta(it, "azul_celeste")


@peca("carrinho_bebe_rosa", "Carrinho de bebê (rosa)", "carrinho_bebe", tags=["bebe", "calcada"],
      veiculo="carrinho_bebe")
def p_bebe(it):
    ps = []
    cor_q = "turquesa_escuro"
    for s in (-1, 1):
        x = s * 0.25
        ps.append(mb.tubo([(x, -0.28, 0.09), (x, -0.12, 0.36), (x, 0.18, 0.36), (x, 0.26, 0.13)], 0.016, cor=cor_q,
                          seg=8))
        ps.append(mb.tubo([(x, 0.18, 0.36), (x, 0.42, 0.98)], 0.016, cor=cor_q, seg=8))
    ps.append(mb.tubo([(-0.25, 0.42, 0.98), (0.25, 0.42, 0.98)], 0.022, cor="preto", seg=8))
    ps.append(mb.tubo([(-0.25, -0.28, 0.09), (0.25, -0.28, 0.09)], 0.012, cor=cor_q, seg=6))
    ps.append(mb.tubo([(-0.25, 0.26, 0.13), (0.25, 0.26, 0.13)], 0.012, cor=cor_q, seg=6))
    ps.append(mb.superelipsoide(0.44, 0.66, 0.3, x=0, y=0.0, z=0.4, cor="rosa", e=0.4, e_v=0.6, nu=18, nv=8))
    ps.append(mb.superelipsoide(0.4, 0.6, 0.06, x=0, y=0.0, z=0.66, cor="branco", e=0.4, nu=16, nv=4))
    capota = mb.superelipsoide(0.47, 0.42, 0.44, x=0, y=0.12, z=0.5, cor="rosa_escuro", e=0.6, e_v=0.6, nu=18, nv=8)
    bm = bmesh.new()
    bm.from_mesh(capota.data)
    for co, no in (((0, 0.08, 0), (0, -1, 0)), ((0, 0, 0.66), (0, 0, -1))):
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=no, clear_outer=True)
    bm.to_mesh(capota.data)
    bm.free()
    ps.append(capota)
    for k in range(3):
        ps.append(mb.tubo([(-0.235, 0.1 + k * 0.08, 0.66), (0, 0.1 + k * 0.1, 0.94 - k * 0.04),
                           (0.235, 0.1 + k * 0.08, 0.66)], 0.01, cor="branco", seg=6, raio_curva=0.15))
    ps.append(mb.caixa(0.36, 0.3, 0.1, y=0.05, z=0.14, cor="cinza", bisel=0.02, seg=2))
    it.add(mb.junta(ps, "carrinho"))
    rodas_par(it, 0.08, 0.05, -0.28, 0.27, "dianteira", estilo="calota", cor_aro="branco", cor_cubo="grafite", seg=12)
    rodas_par(it, 0.12, 0.06, 0.26, 0.28, "traseira", estilo="calota", cor_aro="branco", cor_cubo="grafite", seg=12)
    it.slot("assento_1", (0, 0.0, 0.5), (0.34, 0.55, 0.4))
    it.colisao([((0, 0.05, 0), (0.66, 0.95, 1.02))])
    return {"lugares_tamanho": "bebe"}


@peca("skate_laranja", "Skate (rodinhas laranja)", "skate", tags=["skate", "calcada"], veiculo="skate")
def p_skate(it):
    deck = mb.extrudado(mb.ret_arredondado(0.22, 0.82, 0.1, seg=6), 0.016, z=0.085, cor="grafite_escuro",
                        bisel=0.004, seg=1)
    for v in deck.data.vertices:
        d = abs(v.co.y) - 0.29
        if d > 0:
            v.co.z += d * d * 2.2 + d * 0.15
    mb.pinta_onde(deck, "laranja", lambda c, n: n.z < -0.5)
    ps = [deck]
    for y in (-0.27, 0.27):
        ps.append(mb.caixa(0.16, 0.05, 0.03, y=y, z=0.058, cor="metal", bisel=0.008, seg=1))
        ps.append(mb.cilindro(0.008, 0.22, eixo="x", x=0, y=y, z=0.035, cor="metal_claro", seg=6, bisel=0))
    it.add(mb.junta(ps, "skate"))
    for y, nome in ((-0.27, "dianteira"), (0.27, "traseira")):
        rodas_par(it, 0.032, 0.032, y, 0.1, nome, estilo="calota", cor_pneu="laranja", cor_aro="amarelo",
                  cor_cubo="metal", seg=12)
    it.slot("assento_1", (0, 0, 0.1), ASSENTO)
    it.colisao([((0, 0, 0), (0.24, 0.84, 0.13))])
    return {"postura": "em_pe"}


# ======================================================================================================================
# Pacote gratuito (Cartoon City): Car_06, Car_13, Car_16, Car_19, Futuristic_Car_1, Van
# ======================================================================================================================
CC_DIR = os.environ.get("CIDADE_PACOTE_FBX", "")
CC_TEX = os.environ.get("CIDADE_PACOTE_TEX", "")
ESCALA_PACOTE = 0.9
AQUI = os.path.dirname(os.path.abspath(__file__))
APOC_FBX = os.environ.get("APOC_PACOTE_FBX", os.path.join(
    AQUI, "..", "ideias", "Apocalypse", "Apocalypse_Free_fbx", "Apocalypse_Free_fbx", "Props", "Apocalypse_Car.fbx"))
APOC_TEX = os.environ.get("APOC_PACOTE_TEX", os.path.join(AQUI, "..", "ideias", "Apocalypse", "textures", "textures",
                                                          "Color2.png"))


def importa_carro_pacote(fbx, tex, escala=ESCALA_PACOTE, fora=(), recolore=None):
    """Importa um carro de pacote: cores do atlas → paleta; vidro → janela_apagada; faróis → luz; lanternas →
    luz_vermelha; "Emissive" → luz (nas rodas, neon); painel com textura própria → grafite. Escala uniforme
    (o Cartoon City é gordinho: até 2,5 m de largura). fora: nomes de partes que não entram."""
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=fbx)
    novos = [o for o in bpy.data.objects if o not in antes]
    img = bpy.data.images.load(tex, check_existing=True)
    W, H = img.size
    px = img.pixels[:]
    mb.materiais()
    cache = {}
    out = {}
    for o in novos:
        if o.type != "MESH" or any(f in o.name for f in fora):
            continue
        me = o.data.copy()
        me.transform(Matrix.Diagonal((escala,) * 3 + (1,)) @ o.matrix_world)
        mats = [m.name.lower().split(".")[0] if m else "" for m in me.materials]
        bm = bmesh.new()
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
        lay = bm.loops.layers.uv.active
        novo_uv = bm.loops.layers.uv.new("UVMap_cor")
        roda = "wheel" in o.name.lower()
        ys_ = [v.co.y for v in bm.verts]
        y_frente = min(ys_) + 0.2 * (max(ys_) - min(ys_))
        bm.normal_update()
        for f in bm.faces:
            nm = mats[f.material_index] if f.material_index < len(mats) else ""
            if nm == "color_glossy" and not roda and f.calc_center_median().y < y_frente and f.normal.y < -0.3:
                f.material_index = mb.MAT_NOMES.index("luz")  # as lentes dos faróis do Cartoon City são "Glossy"
                continue
            if "glass" in nm:
                f.material_index = mb.MAT_NOMES.index("janela_apagada")
                continue
            if "headlight" in nm:
                f.material_index = mb.MAT_NOMES.index("luz")
                continue
            if "taillight" in nm:
                f.material_index = mb.MAT_NOMES.index("luz_vermelha")
                continue
            if "emissive" in nm:
                f.material_index = mb.MAT_NOMES.index("neon" if roda else "luz")
                continue
            if "dashboard" in nm:
                cor = "grafite"
            else:
                us = [lo[lay].uv for lo in f.loops]
                u = sum(q[0] for q in us) / len(us)
                v = sum(q[1] for q in us) / len(us)
                k = (min(H - 1, max(0, int(v % 1 * H))) * W + min(W - 1, max(0, int(u % 1 * W)))) * 4
                rgb = tuple(round(c, 3) for c in px[k:k + 3])
                if rgb not in cache:
                    cache[rgb] = mb.cor_mais_proxima(rgb)
                cor = cache[rgb]
                if recolore:
                    cor = recolore(o.name, f, rgb, cor)
                    if cor in mb.MAT_NOMES:
                        f.material_index = mb.MAT_NOMES.index(cor)
                        continue
            uu = mb.uv_cor(cor)
            for lo in f.loops:
                lo[novo_uv].uv = uu
            f.material_index = 0
        for f in bm.faces:
            if f.material_index != 0:
                for lo in f.loops:
                    lo[novo_uv].uv = (0.5, 0.5)
        while any(l_.name != "UVMap_cor" for l_ in bm.loops.layers.uv):  # tira os UV originais, um a um pelo nome
            nm_ = next(l_.name for l_ in bm.loops.layers.uv if l_.name != "UVMap_cor")
            bm.loops.layers.uv.remove(bm.loops.layers.uv[nm_])
        me2 = bpy.data.meshes.new(o.name)
        bm.to_mesh(me2)
        bm.free()
        me2.uv_layers[0].name = "UVMap"
        for n in mb.MAT_NOMES:
            me2.materials.append(bpy.data.materials[n])
        me2.shade_smooth()
        me2.set_sharp_from_angle(angle=math.radians(40))
        ob = bpy.data.objects.new(o.name, me2)
        bpy.context.scene.collection.objects.link(ob)
        out[o.name] = ob
    for o in novos:
        bpy.data.objects.remove(o)
    return out


def carro_pacote(it, fbx, tex, lugares=4, escala=ESCALA_PACOTE, portas=False, fora=(), recolore=None,
                 motorista=-1):
    pc = importa_carro_pacote(fbx, tex, escala, fora, recolore)
    def e_roda(n):
        return "wheel" in n.lower() and "steering" not in n.lower()
    corpo = [o for n, o in pc.items() if not e_roda(n) and "door" not in n.lower()]
    it.add(*corpo)
    lo, hi = mb.bbox(corpo)
    yc = (lo.y + hi.y) / 2
    for n, o in sorted((n, o) for n, o in pc.items() if e_roda(n)):
        a, b = mb.bbox(o)
        c = (a + b) / 2
        r = (b.z - a.z) / 2
        pos = "dianteira" if c.y < yc else "traseira"
        lado = "dir" if c.x > 0 else "esq"
        it.anima(o, {"anima": "girar", "eixo": "x", "velocidade": vb.VEL_RODA, "roda": 1, "raio": round(r, 3)},
                 f"roda_{pos}_{lado}", pivo=(c.x, c.y, c.z))
    for n, o in sorted((n, o) for n, o in pc.items() if "door" in n.lower()):
        a, b = mb.bbox(o)
        s = 1 if (a.x + b.x) > 0 else -1
        it.porta([o], (b.x - 0.03 if s > 0 else a.x + 0.03, a.y + 0.03, a.z), eixo="z", angulo=-70 if s > 0 else 70,
                 nome=f"porta_dianteira_{'dir' if s > 0 else 'esq'}")
    L, W, zt = hi.y - lo.y, hi.x - lo.x, hi.z
    zs = 0.3 * zt
    xs = W * 0.19
    it.slot("assento_motorista", (motorista * xs, yc - L * 0.06, zs), ASSENTO)
    it.slot("assento_1", (-motorista * xs, yc - L * 0.06, zs), ASSENTO)
    if lugares >= 4:
        it.slot("assento_2", (-xs, yc + L * 0.16, zs), ASSENTO)
        it.slot("assento_3", (xs, yc + L * 0.16, zs), ASSENTO)
    if lugares >= 6:
        it.slot("assento_4", (-xs, yc + L * 0.34, zs), ASSENTO)
        it.slot("assento_5", (xs, yc + L * 0.34, zs), ASSENTO)
    zc = zt * 0.55
    it.colisao([((0, yc, 0), (W, L, zc)), ((0, yc + L * 0.05, zc), (W * 0.82, L * 0.6, zt - zc))])


for _nome, _rot, _lug in (("Car_06", "Carrinho do pacote", 4), ("Car_13", "Esportivo do pacote", 2),
                          ("Car_16", "Sedã do pacote", 4), ("Car_19", "Carro antigo do pacote", 2),
                          ("Futuristic_Car_1", "Carro futurista do pacote", 2), ("Van", "Van do pacote", 6)):
    def _fn(it, _nome=_nome, _lug=_lug):
        carro_pacote(it, os.path.join(CC_DIR, _nome + ".fbx"), CC_TEX, _lug)
    peca(_nome.lower() + "_pacote", _rot, _nome.lower() + "_pacote", tags=["carro", "pacote"], pacote=True)(_fn)


@peca("apocalypse_car_pacote", "Carro velho abandonado (picape blindada do pacote)", "apocalypse_car_pacote",
      tags=["carro", "pacote", "velho", "abandonado"], pacote=True)
def p_apoc(it):
    # o motorista do pacote fica em +X (lado esquerdo de quem olha para −Y, como nos nossos)
    # O atlas "Color" do pacote não veio no grátis; o Color2.png que veio casa com o UV e dá a lataria cinza-azulada
    # gasta, a blindagem e as estacas enferrujadas (sem as manchas da máscara de sangue, que ficam de fora).
    carro_pacote(it, APOC_FBX, APOC_TEX, 2, escala=0.85, portas=True, fora=("Needle",), motorista=1)


# ======================================================================================================================
# Exportação
# ======================================================================================================================
def roda_peca(cat, p):
    mb.limpa()
    it = vb.ItemV(p["id"])
    extra = p["fn"](it) or {}
    if os.environ.get("CARROS_DEBUG"):
        tot = {}
        for o in bpy.context.scene.objects:
            if o.type == "MESH":
                k = o.name.split(".")[0]
                tot[k] = tot.get(k, 0) + sum(len(q.vertices) - 2 for q in o.data.polygons)
        print("tris por parte:", sorted(tot.items(), key=lambda a: -a[1])[:25], flush=True)
    lugares = sum(1 for n, *_ in it.slots if n.startswith("slot_assento"))
    ex = {"animacoes": it.lista_animacoes(), "veiculo": p["veiculo"], "lugares": lugares}
    ex.update(extra)
    tags = ["veiculo"] + [t for t in p["tags"] if t != "veiculo"]
    op = {}
    if p.get("mini"):
        op["miniatura_dir"] = p["mini"]
    cat.exporta(it, p["rotulo"], grupo=p["grupo"], tags=tags, pacote=p.get("pacote", False), extra=ex, **op)


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:]
    SAIDA = args[0]
    PASTA = os.path.join(SAIDA, CAT)
    filtro = set(args[1:])
    cat = mb.Catalogo(CAT, SAIDA, rotulo="Carros e veículos")
    feitos = []
    for p in PECAS:
        if filtro and p["id"] not in filtro and p["grupo"] not in filtro:
            continue
        try:
            roda_peca(cat, p)
            feitos.append(p["id"])
        except Exception as e:  # noqa: BLE001  (segue com as outras e mostra o erro)
            import traceback
            traceback.print_exc()
            print("ERRO", p["id"], e, flush=True)
    ordem = [p["id"] for p in PECAS]
    cat.dados["itens"] = sorted([i for i in cat.dados["itens"] if i["id"] in ordem], key=lambda i: ordem.index(i["id"]))
    cat.salva()
    print("feitos", len(feitos), feitos, flush=True)
