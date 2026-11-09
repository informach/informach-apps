"""Biblioteca de cidade do Morada: categoria "props_esporte" (quadras, equipamentos, arquibancadas, refletores, pista de
skate modular, academia ao ar livre, mesas de praça, placar, bebedouro, bicicletário e banco de reservas).

Uso (GUIA_CIDADE.md, GUIA_PARQUE.md e GUIA_PROPS.md):
  MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/cidade_props_esporte.py -- SP/cidade_out [ids|grupos...]

Convenções:
- metros, Z para cima, frente para −Y, origem no centro da peça, chão em z = 0 (as quadras ficam no nível da calçada).
- Quadras: 15 × 15 (1 × 1) ou 30 × 15 (2 × 1), com a laje até z = −0,40 e a pintura em decalques finos acima de z = 0
  (quadra a +3 mm, áreas a +6 mm, linhas a +9 mm). extra["quadras"] = [nx, ny]. Colisão: a laje (e, nas quadras que
  já vêm com equipamento alto — gols e tabelas da poliesportiva, cadeira de juiz —, uma caixa para ele).
- Redes de tênis, vôlei, gol e basquete: tiras finas (planos de espessura zero, dupla face no glTF) ou tubos finos.
- Animações: filho com a origem no pivô e extras glTF; a lista vai no catálogo em extra["animacoes"]:
    placar     {"anima": "trocar", "quadros": 4, "periodo": p}   (a tela tem 4 placares lado a lado em U)
    bicicleta  {"anima": "girar", "eixo": "x", "velocidade": g}  (pedivela)
    caminhada  {"anima": "balancar", "eixo": "x", "angulo": ±a, "periodo": p}  (as duas pernas em oposição)
- Assentos: slots assento_N de 0,5 × 0,5 × 0,9 m (arquibancadas, banco de reservas, cadeira de juiz, bancos da mesa
  de xadrez, aparelhos de academia).
- Luz noturna: lâmpadas da torre de refletores com "luz", tela e faixa do placar com estampa emissiva, filete de luz
  no bicicletário e indicador do bebedouro.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import moveis_base as mb  # noqa: E402
import cidade_base as cb  # noqa: E402
import props_esporte_base as eb  # noqa: E402
from props_esporte_base import (ItemE, decal, ret, arco, tira, contorno_ret, seg, rede, poste, barra,  # noqa: E402
                                gira_z, assento_balde, Z_QUADRA, Z_AREA, Z_LINHA)

V = Vector
H, Q, ZF = cb.H, cb.Q, cb.Z_FUNDO
CAT = "props_esporte"
SAIDA = ""
EST = {}
DIR_ALTO = (0.55, -1.0, 0.55)
DIR_MEIO = (0.55, -1.0, 0.85)
LW = 0.08  # largura das linhas pintadas


def estampa(nome, emissao=0.0):
    chave = (nome, emissao)
    if chave not in EST:
        png = os.path.join(SAIDA, CAT, "estampas", nome + ".png")
        EST[chave] = mb.material_estampa(f"esporte_{nome}" + ("_luz" if emissao else ""), png, emissao=emissao)
    return EST[chave]


def laje_quadra(it, nx, ny, cor):
    L, P = nx * Q, ny * Q
    it.add(cb.laje(cb.quadrado(-L / 2, -P / 2, L / 2, P / 2), 0.0, cor, nome="laje"))


def col_laje(nx=1, ny=1):
    return [((0, 0, ZF), (nx * Q, ny * Q, -ZF))]


# =====================================================================================================================
# Equipamentos reaproveitados (tabela, trave, rede de quadra, cadeira de juiz)
# =====================================================================================================================
def rede_basquete(cx, cy, z, r0=0.23, r1=0.15, alt=0.45, n=12, cor="branco", corrente=False):
    """Rede cônica de cordinhas cruzadas presa ao aro (ou de correntes, na tabela de rua)."""
    ps = []
    if corrente:
        for k in range(n):
            a = 2 * math.pi * k / n
            pts = [(cx + r0 * math.cos(a), cy + r0 * math.sin(a), z),
                   (cx + r1 * math.cos(a), cy + r1 * math.sin(a), z - alt)]
            m = V(pts[0]).lerp(V(pts[1]), 0.5) + V((0.012 * math.cos(a + 1.5), 0.012 * math.sin(a + 1.5), 0))
            ps.append(eb.haste([pts[0], m, pts[1]], 0.011, cor=cor))
        return ps
    for k in range(n):
        for s_ in (-0.5, 0.5):
            a0 = 2 * math.pi * k / n
            a1 = 2 * math.pi * (k + s_) / n
            a2 = 2 * math.pi * (k + 2 * s_) / n
            pts = [(cx + r0 * math.cos(a0), cy + r0 * math.sin(a0), z),
                   (cx + (r0 + r1) / 2 * 1.02 * math.cos(a1), cy + (r0 + r1) / 2 * 1.02 * math.sin(a1), z - alt / 2),
                   (cx + r1 * math.cos(a2), cy + r1 * math.sin(a2), z - alt)]
            ps.append(eb.haste(pts, 0.007, cor=cor))
    ps.append(eb.anel_tubo(cx, cy, z - alt, r1, 0.008, cor=cor, seg=n * 2, seg_t=4))
    return ps


def tabela(z_aro=3.05, cor_tabela="branco", cor_linha="laranja", cor_aro="laranja", larg=1.8, alt=1.05,
           corrente=False):
    """Tabela (frente para −Y) com o plano da face em y = 0, aro e rede à frente. Devolve as partes."""
    zb = z_aro - 0.15
    ps = [mb.caixa(larg, 0.05, alt, y=0.025, z=zb, cor=cor_tabela, bisel=0.02),
          mb.caixa(larg + 0.06, 0.04, 0.06, y=0.03, z=zb - 0.03, cor="grafite", bisel=0.015),
          mb.caixa(larg + 0.06, 0.04, 0.06, y=0.03, z=zb + alt - 0.03, cor="grafite", bisel=0.015),
          mb.caixa(0.06, 0.04, alt, x=-larg / 2 - 0.0, y=0.03, z=zb, cor="grafite", bisel=0.015),
          mb.caixa(0.06, 0.04, alt, x=larg / 2 + 0.0, y=0.03, z=zb, cor="grafite", bisel=0.015)]
    # quadradinho de mira e contorno pintados na face
    w, h, e = 0.59, 0.45, 0.05
    zq = z_aro + 0.0
    for (x0, z0, ll, aa) in ((0, zq, w, e), (0, zq + h - e, w, e)):
        ps.append(mb.caixa(ll, 0.008, aa, x=x0, y=-0.003, z=z0, cor=cor_linha, bisel=0.002, seg=1))
    for sx in (-1, 1):
        ps.append(mb.caixa(e, 0.008, h, x=sx * (w - e) / 2, y=-0.003, z=zq, cor=cor_linha, bisel=0.002, seg=1))
    ps.append(contorno_face(larg - 0.12, alt - 0.12, zb + 0.06, cor_linha))
    # aro com suporte
    ra = 0.23
    cy = -0.15 - ra
    ps.append(eb.anel_tubo(0, cy, z_aro, ra, 0.016, cor=cor_aro, seg=24, seg_t=6))
    ps.append(mb.caixa(0.22, 0.17, 0.03, y=-0.085, z=z_aro - 0.03, cor=cor_aro, bisel=0.01))
    ps.append(mb.caixa(0.2, 0.03, 0.18, y=-0.015, z=z_aro - 0.17, cor=cor_aro, bisel=0.01))
    ps += rede_basquete(0, cy, z_aro - 0.01, corrente=corrente, cor="metal_claro" if corrente else "branco")
    return ps


def contorno_face(w, h, z0, cor, e=0.05):
    ps = [mb.caixa(w, 0.008, e, y=-0.003, z=z0, cor=cor, bisel=0.002, seg=1),
          mb.caixa(w, 0.008, e, y=-0.003, z=z0 + h - e, cor=cor, bisel=0.002, seg=1)]
    for sx in (-1, 1):
        ps.append(mb.caixa(e, 0.008, h, x=sx * (w - e) / 2, y=-0.003, z=z0, cor=cor, bisel=0.002, seg=1))
    return mb.junta(ps, "contorno")


def trave(larg=4.0, alt=2.0, fundo=1.2, r=0.055, cor="branco", listras=None, cor_rede="branco"):
    """Gol: linha do gol em y = 0, traves em x = ±larg/2, rede para +Y. listras = cor das faixas (gol de futsal)."""
    w2 = larg / 2
    ps = []
    for sx in (-1, 1):
        ps.append(mb.cilindro(r, alt + r, x=sx * w2, cor=cor, seg=12, bisel=0.01))
        if listras:
            for k in range(1, 8, 2):
                ps.append(mb.cilindro(r * 1.04, alt / 8, x=sx * w2, z=k * alt / 8, cor=listras, seg=12, bisel=0.004))
    ps.append(mb.cilindro(r, larg + 2 * r, z=alt + r * 0.0, cor=cor, seg=12, eixo="x", bisel=0.01))
    mb.transforma(ps[-1], loc=(0, 0, 0))
    if listras:
        n = 10
        for k in range(1, n, 2):
            x0 = -w2 + larg * k / n
            ps.append(mb.cilindro(r * 1.04, larg / n, x=x0 + larg / n / 2, z=alt, cor=listras, seg=12, eixo="x",
                                  bisel=0.004))
    # armação de trás (tubos finos) e base
    rr = r * 0.45
    for sx in (-1, 1):
        ps.append(mb.tubo([(sx * w2, 0, alt), (sx * w2, fundo * 0.35, alt * 0.92), (sx * w2, fundo, 0.03)], rr,
                          cor="cinza_claro", seg=8, raio_curva=0.15))
        ps.append(mb.tubo([(sx * w2, 0.02, 0.03), (sx * w2, fundo, 0.03)], rr, cor="cinza_claro", seg=8))
    ps.append(mb.tubo([(-w2, fundo, 0.03), (w2, fundo, 0.03)], rr, cor="cinza_claro", seg=8))
    # redes: fundo inclinado (do travessão ao chão) e laterais
    nu = int(larg / 0.2)
    p_tr = (fundo * 0.35, alt * 0.92)
    ps.append(rede((-w2, 0.02, alt - 0.02), (w2, 0.02, alt - 0.02), (-w2, p_tr[0], p_tr[1]), (w2, p_tr[0], p_tr[1]),
                   nu, 2, cor=cor_rede))
    ps.append(rede((-w2, p_tr[0], p_tr[1]), (w2, p_tr[0], p_tr[1]), (-w2, fundo, 0.04), (w2, fundo, 0.04), nu,
                   int(alt / 0.2), cor=cor_rede))
    for sx in (-1, 1):
        x = sx * w2
        ps.append(rede((x, 0.0, 0.03), (x, fundo, 0.03), (x, 0.0, alt - 0.03), (x, p_tr[0], p_tr[1]),
                       int(fundo / 0.2), int(alt / 0.2), cor=cor_rede))
    return ps


def rede_quadra(y0, y1, z_poste, z_meio, z_baixo, x=0.0, passo=0.1, cor="grafite", fita="branco", poste_cor="verde_escuro",
                r_poste=0.05, antenas=False):
    """Rede de quadra atravessando em Y (de y0 a y1) em x, com postes, fita branca no alto e a barriga no meio."""
    ps = []
    ym = (y0 + y1) / 2
    for ya, yb, za, zb in ((y0, ym, z_poste, z_meio), (ym, y1, z_meio, z_poste)):
        n = max(2, int(abs(yb - ya) / passo))
        nv = max(2, int((min(za, zb) - z_baixo) / passo))
        ps.append(rede((x, ya, z_baixo), (x, yb, z_baixo), (x, ya, za - 0.03), (x, yb, zb - 0.03), n, nv, larg=0.012,
                       cor=cor))
        ps.append(mb.tubo([(x, ya, za - 0.03), (x, yb, zb - 0.03)], 0.03, cor=fita, seg=6))
    ps.append(eb.haste([(x, y0, z_baixo), (x, y1, z_baixo)], 0.008, cor=cor))
    for y in (y0, y1):
        ps.append(mb.cilindro(r_poste, z_poste + 0.05, x=x, y=y, cor=poste_cor, seg=12, bisel=0.01))
        ps.append(mb.esfera(r_poste * 1.1, x=x, y=y, z=z_poste + 0.05, cor=poste_cor, seg=10))
        ps.append(mb.cilindro(r_poste * 2.2, 0.03, x=x, y=y, cor="concreto_escuro", seg=12, bisel=0.008))
    if antenas:
        for y in antenas:
            for k in range(9):
                ps.append(mb.cilindro(0.012, 0.2, x=x, y=y, z=z_poste - 1.0 + k * 0.2,
                                      cor="vermelho" if k % 2 else "branco", seg=6, bisel=0.0))
    return ps


def cadeira_juiz(cor="branco", assento="verde_escuro"):
    """Cadeira alta de juiz de tênis (frente para +Y, olhando a quadra): pés de tubo, escadinha atrás, plataforma,
    assento com encosto e braços. Origem no chão, no meio."""
    ps = []
    zs = 1.75
    for sx in (-1, 1):
        ps.append(mb.tubo([(sx * 0.36, -0.36, 0), (sx * 0.27, -0.24, zs)], 0.03, cor=cor, seg=8))
        ps.append(mb.tubo([(sx * 0.36, 0.36, 0), (sx * 0.27, 0.24, zs)], 0.03, cor=cor, seg=8))
        ps.append(mb.tubo([(sx * 0.35, -0.34, 0.5), (sx * 0.35, 0.34, 0.5)], 0.02, cor=cor, seg=6))
        ps.append(mb.tubo([(sx * 0.3, -0.28, 1.35), (sx * 0.3, 0.28, 1.35)], 0.02, cor=cor, seg=6))
        ps.append(mb.tubo([(sx * 0.27, 0.0, zs + 0.06), (sx * 0.27, 0.0, zs + 0.38), (sx * 0.27, 0.28, zs + 0.38)],
                          0.018, cor=cor, seg=6, raio_curva=0.05))
    for k in range(1, 6):  # degraus atrás (lado −Y)
        z = k * zs / 6
        w = 0.36 - 0.09 * z / zs
        ps.append(mb.caixa(2 * w, 0.08, 0.03, y=-0.36 + 0.12 * z / zs, z=z, cor="cinza_claro", bisel=0.01, seg=1))
    ps.append(mb.caixa(0.66, 0.6, 0.05, z=zs, cor=cor, bisel=0.015))
    ps.append(mb.caixa(0.5, 0.45, 0.07, y=0.0, z=zs + 0.05, cor=assento, bisel=0.03))
    ps.append(mb.caixa(0.5, 0.06, 0.45, y=-0.22, z=zs + 0.1, cor=assento, bisel=0.025))
    ps.append(mb.caixa(0.6, 0.3, 0.05, y=0.38, z=zs + 0.55, cor=cor, bisel=0.015))  # mesinha do placar
    return ps


def banquinho(x, y, ang=0.0, cor="madeira_mel", larg=1.2):
    ps = [mb.caixa(larg, 0.36, 0.05, z=0.42, cor=cor, bisel=0.015)]
    for sx in (-1, 1):
        ps.append(mb.caixa(0.05, 0.3, 0.42, x=sx * (larg / 2 - 0.12), cor="grafite", bisel=0.01))
    return gira_z(ps, ang, (x, y, 0))


# =====================================================================================================================
# Quadras
# =====================================================================================================================
def bola_basquete(cx, cy, r, z, cor="laranja", costura="grafite_escuro"):
    ps = [decal(eb.arco(cx, cy, r, 0, 360, 32)[:-1], z, cor)]
    w = 0.05
    ps.append(seg(cx - r, cy, cx + r, cy, w, z + 0.001, costura))
    ps.append(seg(cx, cy - r, cx, cy + r, w, z + 0.001, costura))
    for s_ in (-1, 1):
        ps.append(tira(arco(cx + s_ * r * 1.25, cy, r * 0.95, 180 - 38 if s_ > 0 else -38, 180 + 38 if s_ > 0 else 38,
                            12), w, z + 0.001, costura))
    return ps


def p_quadra_basquete(it, piso="verde_escuro", quadra="laranja", garrafao="vermelho", linha="branco",
                      circulo="vermelho", bola="laranja_claro", borda="concreto"):
    laje_quadra(it, 1, 1, piso)
    L2, P2 = 6.5, 4.3
    # faixa de concreto em volta do piso colorido (acabamento da borda)
    it.add(tira(ret(-H + 0.15, -H + 0.15, H - 0.15, H - 0.15), 0.3, Z_QUADRA, borda, fechado=True))
    it.add(decal(ret(-L2 - 0.5, -P2 - 0.5, L2 + 0.5, P2 + 0.5), Z_QUADRA, quadra))
    ps = []
    ps.append(contorno_ret(-L2, -P2, L2, P2, LW, Z_LINHA, linha))
    ps.append(seg(0, -P2, 0, P2, LW, Z_LINHA, linha))
    ps.append(tira(arco(0, 0, 1.2, 0, 360, 40), LW, Z_LINHA, linha, fechado=True))
    it.add(decal(arco(0, 0, 1.2, 0, 360, 40)[:-1], Z_AREA, circulo))
    it.add(bola_basquete(0, 0, 0.55, Z_AREA + 0.001, bola))
    for s_ in (-1, 1):
        xb = s_ * L2
        xl = s_ * (L2 - 3.8)
        x_aro = s_ * (L2 - 1.25)
        it.add(decal(ret(min(xb, xl), -1.6, max(xb, xl), 1.6), Z_AREA, garrafao))
        ps.append(contorno_ret(min(xb, xl), -1.6, max(xb, xl), 1.6, LW, Z_LINHA, linha))
        a0, a1 = (90, 270) if s_ > 0 else (-90, 90)
        ps.append(tira(arco(xl, 0, 1.6, a0, a1, 20), LW, Z_LINHA, linha))  # meia-lua do lance livre
        for k in range(4):  # a outra metade, tracejada (dentro do garrafão, como na referência)
            b0 = a0 + 180 + 180 * (k + 0.25) / 4
            ps.append(tira(arco(xl, 0, 1.6, b0, b0 + 180 * 0.5 / 4, 3), LW, Z_LINHA, linha))
        # linha de três: retas nos cantos e o arco
        dx = math.sqrt(4.0 ** 2 - 3.6 ** 2)
        xc = x_aro - s_ * dx
        for sy in (-1, 1):
            ps.append(seg(xb, sy * 3.6, xc, sy * 3.6, LW, Z_LINHA, linha))
        ang = math.degrees(math.atan2(3.6, -dx))
        if s_ > 0:
            pts = arco(x_aro, 0, 4.0, ang, 360 - ang, 40)
        else:
            pts = arco(x_aro, 0, 4.0, -(180 - ang), 180 - ang, 40)
        ps.append(tira(pts, LW, Z_LINHA, linha))
        # semicírculo sem carga e marcas do garrafão
        a0, a1 = (90, 270) if s_ > 0 else (-90, 90)
        ps.append(tira(arco(x_aro, 0, 0.7, a0, a1, 14), LW * 0.8, Z_LINHA, linha))
        for d in (0.9, 1.6, 2.3):
            for sy in (-1, 1):
                ps.append(seg(xb - s_ * d, sy * 1.6, xb - s_ * d, sy * 1.85, LW, Z_LINHA, linha))
    it.add(mb.junta(ps, "linhas"))
    return {"plana": True, "col": col_laje(), "extra": {"quadras": [1, 1]}}


def p_campo_futebol(it):
    laje_quadra(it, 2, 1, "grama_escura")
    # grama listrada (faixas de corte de 3 m)
    for k in range(10):
        if k % 2 == 0:
            it.add(decal(ret(-15 + 3 * k, -H, -15 + 3 * (k + 1), H), Z_QUADRA, "grama"))
    L2, P2 = 13.5, 6.5
    w = 0.1
    ps = [contorno_ret(-L2, -P2, L2, P2, w, Z_LINHA), seg(0, -P2, 0, P2, w, Z_LINHA),
          tira(arco(0, 0, 2.0, 0, 360, 48), w, Z_LINHA, fechado=True),
          decal(arco(0, 0, 0.13, 0, 360, 12)[:-1], Z_LINHA)]
    for s_ in (-1, 1):
        xb = s_ * L2
        for prof, larg in ((3.8, 4.5), (1.4, 3.0)):
            xi = xb - s_ * prof
            ps.append(tira([(xb, -larg), (xi, -larg), (xi, larg), (xb, larg)], w, Z_LINHA))
        xp = xb - s_ * 2.8
        ps.append(decal(arco(xp, 0, 0.12, 0, 360, 12)[:-1], Z_LINHA))
        a0 = 120 if s_ > 0 else -60
        ps.append(tira(arco(xp, 0, 2.0, a0, a0 + 120, 20), w, Z_LINHA))
        for sy in (-1, 1):  # arcos de escanteio
            a = {(1, 1): 180, (1, -1): 90, (-1, 1): 270, (-1, -1): 0}[(s_, sy)]
            ps.append(tira(arco(xb - s_ * w / 2, sy * (P2 - w / 2), 0.55, a, a + 90, 8), w, Z_LINHA))
            # bandeirinha de escanteio
            it.add(mb.cilindro(0.02, 1.2, x=xb, y=sy * P2, cor="amarelo", seg=6, bisel=0.0))
            fl = mb.extrudado([(0, 0), (0.32, 0.11), (0, 0.22)], 0.01, cor="vermelho", bisel=0.0, plano="xz")
            mb.transforma(fl, loc=(xb, sy * P2 - 0.005, 0.95))
            it.add(fl)
    it.add(mb.junta(ps, "linhas"))
    # meio-fio baixo de concreto na volta do gramado (acabamento da borda da peça)
    it.add(tira(ret(-15 + 0.12, -H + 0.12, 15 - 0.12, H - 0.12), 0.24, Z_AREA, "concreto", fechado=True))
    return {"plana": True, "col": col_laje(2, 1), "extra": {"quadras": [2, 1]}}


def p_quadra_tenis(it, piso="terracota", quadra="terracota_clara", linha="branco", poste="verde_escuro",
                   cadeira="verde_escuro"):
    laje_quadra(it, 2, 1, piso)
    L2, D2, S2 = 23.77 / 2, 10.97 / 2, 8.23 / 2
    it.add(decal(ret(-L2 - 1.2, -D2 - 0.8, L2 + 1.2, D2 + 0.8), Z_QUADRA, quadra))
    ps = [contorno_ret(-L2, -D2, L2, D2, 0.08, Z_LINHA, linha)]
    for sy in (-1, 1):
        ps.append(seg(-L2, sy * (S2 - 0.025), L2, sy * (S2 - 0.025), 0.05, Z_LINHA, linha))
    for sx in (-1, 1):
        ps.append(seg(sx * 6.40, -S2, sx * 6.40, S2, 0.05, Z_LINHA, linha))
        ps.append(seg(sx * L2, 0, sx * (L2 - 0.15), 0, 0.05, Z_LINHA, linha))
    ps.append(seg(-6.40, 0, 6.40, 0, 0.05, Z_LINHA, linha))
    it.add(mb.junta(ps, "linhas"))
    it.add(rede_quadra(-D2 - 0.914, D2 + 0.914, 1.07, 0.914, 0.06, poste_cor=poste))
    it.add(mb.caixa(0.05, 0.01, 0.86, x=0.0, y=0.0, z=0.05, cor=linha, bisel=0.0))  # cinta do meio
    cj = cadeira_juiz(assento=cadeira)
    gira_z(cj, 0, (0, -D2 - 1.55, 0))
    it.add(cj)
    it.assento("assento_1", 0, -D2 - 1.55, 1.87)  # o juiz
    for sx in (-1, 1):
        it.add(banquinho(sx * 2.6, -D2 - 1.5, 0, cor="madeira_mel"))
        it.assento(f"assento_{2 if sx < 0 else 3}", sx * 2.6, -D2 - 1.5, 0.47)
    # grade baixa de fundo (alambrado curto) atrás das linhas de fundo
    for sx in (-1, 1):
        x = sx * 14.4
        it.add(rede((x, -6.6, 0.0), (x, 6.6, 0.0), (x, -6.6, 1.2), (x, 6.6, 1.2), 44, 6, larg=0.018,
                    cor="verde_escuro"))
        it.add(mb.tubo([(x, -6.6, 1.2), (x, 6.6, 1.2)], 0.03, cor="verde_escuro", seg=6))
        for y in (-6.6, -3.3, 0, 3.3, 6.6):
            it.add(mb.cilindro(0.035, 1.25, x=x, y=y, cor="verde_escuro", seg=8, bisel=0.01))
    col = col_laje(2, 1) + [((0, -D2 - 1.55, 0), (0.8, 0.8, 2.3)),
                            ((-14.4, 0, 0), (0.12, 13.3, 1.25)), ((14.4, 0, 0), (0.12, 13.3, 1.25))]
    return {"plana": True, "col": col, "extra": {"quadras": [2, 1]}}


def p_quadra_volei_areia(it):
    laje_quadra(it, 1, 1, "areia")
    # manchas de areia (mais clara e mais escura) e borda de madeira
    import random
    rnd = random.Random(7)
    for k in range(9):
        cx, cy = rnd.uniform(-6, 6), rnd.uniform(-6, 6)
        rx, ry = rnd.uniform(0.8, 1.8), rnd.uniform(0.5, 1.2)
        rot = rnd.uniform(0, math.pi)
        pts = [(cx + rx * math.cos(t) * math.cos(rot) - ry * math.sin(t) * math.sin(rot),
                cy + rx * math.cos(t) * math.sin(rot) + ry * math.sin(t) * math.cos(rot))
               for t in [2 * math.pi * i / 16 for i in range(16)]]
        it.add(decal(pts, 0.0005 + 0.0009 * k, "bege", sobe=False))  # cada mancha numa altura (sem faces coplanares)
    for sx, sy, l, p in ((0, -1, Q, 0.3), (0, 1, Q, 0.3), (-1, 0, 0.3, Q - 0.6), (1, 0, 0.3, Q - 0.6)):
        it.add(mb.caixa(l, p, 0.06, x=sx * (H - 0.15), y=sy * (H - 0.15), z=-0.01, cor="madeira_mel", bisel=0.02))
    L2, P2 = 6.0, 3.0
    it.add(contorno_ret(-L2, -P2, L2, P2, 0.06, Z_LINHA, "azul"))
    for sx in (-1, 1):  # estacas de canto
        for sy in (-1, 1):
            it.add(mb.cilindro(0.03, 0.04, x=sx * L2, y=sy * P2, z=0, cor="azul_escuro", seg=8, bisel=0.005))
    it.add(rede_quadra(-P2 - 1.0, P2 + 1.0, 2.43, 2.43, 1.43, poste_cor="amarelo", r_poste=0.06, cor="grafite_escuro",
                       antenas=(-P2, P2)))
    # cabos de esticar a rede
    for sy in (-1, 1):
        y = sy * (P2 + 1.0)
        for sx in (-1, 1):
            it.add(eb.haste([(0, y, 2.4), (sx * 1.2, y + sy * 1.4, 0.02)], 0.006, cor="branco"))
            it.add(mb.cilindro(0.05, 0.04, x=sx * 1.2, y=y + sy * 1.4, cor="metal_escuro", seg=8, bisel=0.01))
    # bola na areia
    it.add(mb.esfera(0.105, x=2.3, y=-1.6, z=0.1, cor="amarelo", seg=14))
    it.add(mb.junta([mb.cilindro(0.106, 0.03, x=2.3, y=-1.6, z=0.085, cor="azul", seg=14, bisel=0.0)], "faixa_bola"))
    col = col_laje() + [((0, -P2 - 1.0, 0), (0.2, 0.2, 2.5)), ((0, P2 + 1.0, 0), (0.2, 0.2, 2.5))]
    return {"plana": True, "col": col, "extra": {"quadras": [1, 1]}}


def p_quadra_poliesportiva(it):
    laje_quadra(it, 2, 1, "azul_medio")
    L2, P2 = 13.0, 6.5
    it.add(decal(ret(-L2, -P2, L2, P2), Z_QUADRA, "verde_medio"))
    it.add(tira(ret(-15 + 0.15, -H + 0.15, 15 - 0.15, H - 0.15), 0.3, Z_QUADRA, "concreto", fechado=True))
    w = 0.08
    ps = [contorno_ret(-L2, -P2, L2, P2, w, Z_LINHA + 0.002), seg(0, -P2, 0, P2, w, Z_LINHA + 0.002),
          tira(arco(0, 0, 2.0, 0, 360, 48), w, Z_LINHA + 0.002, fechado=True),
          decal(arco(0, 0, 0.12, 0, 360, 12)[:-1], Z_LINHA + 0.002)]
    am, vm = [], []
    for s_ in (-1, 1):
        xb = s_ * L2
        # futsal: área (dois quartos de círculo e reta), marca do pênalti
        r = 3.9
        q1 = arco(xb, 1.0, r, 90, 180, 16) if s_ > 0 else arco(xb, 1.0, r, 0, 90, 16)[::-1]
        q2 = arco(xb, -1.0, r, 180, 270, 16) if s_ > 0 else arco(xb, -1.0, r, 270, 360, 16)[::-1]
        ps.append(tira(q1 + q2, w, Z_LINHA + 0.002))
        ps.append(decal(arco(xb - s_ * 3.9, 0, 0.1, 0, 360, 10)[:-1], Z_LINHA + 0.002))
        # basquete (amarelo): garrafão e linha de três
        x_aro = xb - s_ * 0.5
        xl = xb - s_ * 3.6
        am.append(contorno_ret(min(xb, xl), -1.6, max(xb, xl), 1.6, w, Z_LINHA + 0.001, "amarelo"))
        b0, b1 = (90, 270) if s_ > 0 else (-90, 90)
        am.append(tira(arco(xl, 0, 1.6, b0, b1, 16), w, Z_LINHA + 0.001, "amarelo"))
        dx = math.sqrt(4.4 ** 2 - 4.0 ** 2)
        xc = x_aro - s_ * dx
        for sy in (-1, 1):
            am.append(seg(xb, sy * 4.0, xc, sy * 4.0, w, Z_LINHA + 0.001, "amarelo"))
        ang = math.degrees(math.atan2(4.0, -dx))
        pts = arco(x_aro, 0, 4.4, ang, 360 - ang, 36) if s_ > 0 else arco(x_aro, 0, 4.4, -(180 - ang), 180 - ang, 36)
        am.append(tira(pts, w, Z_LINHA + 0.001, "amarelo"))
        # vôlei (vermelho): quadra de 11,7 × 5,85 com as linhas de ataque
        vm.append(seg(s_ * 1.95, -2.925, s_ * 1.95, 2.925, w, Z_LINHA, "vermelho"))
    vm.append(contorno_ret(-5.85, -2.925, 5.85, 2.925, w, Z_LINHA, "vermelho"))
    it.add(mb.junta(ps, "linhas_futsal"), mb.junta(am, "linhas_basquete"), mb.junta(vm, "linhas_volei"))
    # gols de futsal e tabelas de basquete em pórtico atrás
    for s_ in (-1, 1):
        g = trave(3.0, 2.0, 0.9, r=0.05, cor="branco", listras="vermelho")
        gira_z(g, -90 * s_, (s_ * L2, 0, 0))
        it.add(g)
        xp = s_ * 14.5
        pp = [mb.cilindro(0.09, 3.2, x=0, y=0.0, cor="cinza_medio", seg=12, bisel=0.02),
              mb.cilindro(0.18, 0.08, cor="concreto_escuro", seg=12, bisel=0.02),
              mb.tubo([(0, 0, 3.1), (0, -1.55, 3.1)], 0.07, cor="cinza_medio", seg=8),
              mb.tubo([(0, 0, 2.5), (0, -0.9, 3.1)], 0.045, cor="cinza_medio", seg=8)]
        tb = tabela(cor_linha="vermelho")
        gira_z(tb, 0, (0, -1.6, 0))
        pp += tb
        gira_z(pp, -90 * s_, (xp, 0, 0))
        it.add(pp)
    col = col_laje(2, 1) + [((-13.95, 0, 0), (1.3, 3.2, 3.5)), ((13.95, 0, 0), (1.3, 3.2, 3.5))]
    return {"plana": True, "col": col, "extra": {"quadras": [2, 1]}}


# =====================================================================================================================
# Equipamentos avulsos
# =====================================================================================================================
def p_tabela_basquete(it):
    """Tabela portátil: base com lastro e rodinhas, poste inclinado com proteção, braço e tabela."""
    ps = [mb.superelipsoide(1.1, 1.3, 0.42, y=0.55, cor="grafite", e=0.25, e_v=0.3, nu=20, nv=8),
          mb.caixa(1.12, 0.08, 0.12, y=-0.1, z=0.2, cor="laranja", bisel=0.03),
          mb.caixa(0.9, 0.4, 0.04, y=0.75, z=0.41, cor="grafite_escuro", bisel=0.015)]
    for sx in (-1, 1):
        ps.append(mb.cilindro(0.07, 0.05, x=sx * 0.42, y=1.18, z=0.07, cor="borracha", seg=12, eixo="x", bisel=0.01))
    pt = [(0, 0.35, 0.35), (0, -0.05, 2.85)]
    ps.append(mb.tubo(pt, 0.07, cor="cinza_azulado", seg=10))
    ps.append(mb.tubo([(0, 0.33, 0.45), (0, 0.17, 1.45)], 0.11, cor="azul", seg=12))  # proteção
    ps.append(mb.tubo([(0, 0.85, 0.42), (0, 0.0, 2.3)], 0.035, cor="cinza_azulado", seg=8))  # escora
    ps.append(mb.tubo([(0, -0.05, 2.85), (0, -0.6, 3.0)], 0.06, cor="cinza_azulado", seg=8))
    ps.append(mb.tubo([(0, 0.02, 2.55), (0, -0.6, 2.95)], 0.04, cor="cinza_azulado", seg=8))
    tb = tabela()
    gira_z(tb, 0, (0, -0.64, 0))
    ps += tb
    it.add(ps)
    it.colisao([((0, 0.55, 0), (1.1, 1.3, 0.45)), ((0, 0.15, 0.45), (0.3, 0.5, 2.5)), ((0, -0.7, 2.85), (1.9, 0.6, 1.1))])
    return {"mini": DIR_ALTO}


def p_tabela_basquete_rua(it):
    """Tabela fixa de rua: poste pescoço de ganso sobre sapata de concreto, tabela vermelha e rede de correntes."""
    ps = [mb.cilindro(0.3, 0.12, y=0.6, cor="concreto", seg=16, bisel=0.03)]
    curva = [(0, 0.6, 0.1), (0, 0.6, 2.4), (0, 0.45, 3.0), (0, 0.1, 3.3), (0, -0.25, 3.35)]
    ps.append(mb.tubo(curva, 0.085, cor="azul_escuro", seg=12, raio_curva=0.5))
    ps.append(mb.cilindro(0.12, 0.12, y=0.6, z=0.1, cor="amarelo", seg=14, bisel=0.02))
    ps.append(mb.caixa(0.6, 0.12, 0.5, y=-0.28, z=3.0, cor="azul_escuro", bisel=0.03))
    tb = tabela(cor_tabela="branco", cor_linha="vermelho", cor_aro="vermelho", corrente=True, larg=1.5, alt=0.95)
    gira_z(tb, 0, (0, -0.35, 0))
    ps += tb
    it.add(ps)
    it.colisao([((0, 0.6, 0), (0.6, 0.6, 3.0)), ((0, -0.35, 2.7), (1.6, 0.8, 1.1))])
    return {"mini": DIR_ALTO}


def p_trave_gol(it):
    g = trave(4.0, 2.0, 1.2)
    gira_z(g, 0, (0, -0.6, 0))
    it.add(g)
    it.colisao([((-2.0, 0, 0), (0.14, 1.3, 2.05)), ((2.0, 0, 0), (0.14, 1.3, 2.05)), ((0, -0.6, 1.95), (4.1, 0.14, 0.12)),
                ((0, 0.6, 0), (4.1, 0.1, 0.12))])
    return {"mini": DIR_ALTO}


def p_trave_futsal(it):
    g = trave(3.0, 2.0, 0.9, r=0.05, listras="vermelho")
    gira_z(g, 0, (0, -0.45, 0))
    it.add(g)
    it.colisao([((-1.5, 0, 0), (0.12, 1.0, 2.05)), ((1.5, 0, 0), (0.12, 1.0, 2.05)), ((0, -0.45, 1.95), (3.1, 0.12, 0.12))])
    return {"mini": DIR_ALTO}


def p_torre_refletores(it):
    """Torre de refletores de estádio (18 m): sapata, poste afunilado com escada de marinheiro, plataforma com
    guarda-corpo e o painel de 4 × 3 refletores inclinado para a frente (−Y), com as lentes em "luz"."""
    ps = [mb.caixa(1.4, 1.4, 0.5, cor="concreto_escuro", bisel=0.06),
          mb.caixa(1.0, 1.0, 0.12, z=0.5, cor="concreto", bisel=0.03),
          mb.cilindro(0.36, 15.2, z=0.6, r2=0.2, cor="cinza", seg=14, bisel=0.02),
          mb.cilindro(0.42, 0.25, z=0.6, cor="cinza_medio", seg=14, bisel=0.03)]
    for z in (5.0, 10.0):
        ps.append(mb.cilindro(0.34 - 0.16 * z / 15.2 + 0.03, 0.18, z=z, cor="cinza_medio", seg=14, bisel=0.02))
    # escada de marinheiro atrás (+Y)
    yl = 0.42
    for sx in (-1, 1):
        ps.append(mb.caixa(0.04, 0.04, 14.6, x=sx * 0.2, y=yl, z=0.9, cor="metal_escuro", bisel=0.0))
    for k in range(48):
        ps.append(mb.caixa(0.4, 0.025, 0.025, y=yl, z=1.1 + k * 0.3, cor="metal_escuro", bisel=0.0))
    for z in (0.95, 6.0, 11.0):
        ps.append(mb.caixa(0.05, 0.25, 0.05, y=0.3, z=z, cor="metal_escuro", bisel=0.0))
    # plataforma
    zp = 15.6
    ps.append(mb.caixa(4.6, 1.6, 0.12, y=0.2, z=zp, cor="cinza_medio", bisel=0.03))
    ps.append(mb.cilindro(0.3, 0.3, z=zp - 0.3, cor="cinza", seg=14, bisel=0.02))
    for x in (-2.2, 2.2):
        ps.append(mb.tubo([(x, 0.1, zp - 0.05), (x * 0.1, 0.05, zp - 1.4)], 0.05, cor="cinza", seg=8))
    for x in (-2.25, -0.75, 0.75, 2.25):
        ps.append(mb.cilindro(0.025, 1.0, x=x, y=0.95, z=zp + 0.12, cor="amarelo", seg=6, bisel=0.0))
    for z in (zp + 0.6, zp + 1.1):
        ps.append(mb.tubo([(-2.25, 0.95, z), (2.25, 0.95, z)], 0.03, cor="amarelo", seg=6))
        for sx in (-1, 1):
            ps.append(mb.tubo([(sx * 2.25, 0.95, z), (sx * 2.25, -0.5, z)], 0.03, cor="amarelo", seg=6))
    for x in (-2.25, 2.25):
        ps.append(mb.cilindro(0.025, 1.0, x=x, y=-0.5, z=zp + 0.12, cor="amarelo", seg=6, bisel=0.0))
    # painel de refletores (quadro de tubos) inclinado
    painel = []
    W, Hh = 4.4, 2.6
    for z in (0.0, Hh / 3, 2 * Hh / 3, Hh):
        painel.append(mb.caixa(W, 0.1, 0.1, z=z - 0.05, cor="cinza_claro", bisel=0.02))
    for x in (-W / 2, -W / 6, W / 6, W / 2):
        painel.append(mb.caixa(0.1, 0.1, Hh + 0.1, x=x, z=-0.05, cor="cinza_claro", bisel=0.02))
    for i in range(4):
        for j in range(3):
            x = -W / 2 + W * (i + 0.5) / 4
            z = Hh * (j + 0.5) / 3
            painel.append(mb.cilindro(0.22, 0.36, x=x, y=0.06, z=z, r2=0.3, cor="cinza_claro", seg=12, eixo="y",
                                      bisel=0.02))
            painel.append(mb.cilindro(0.33, 0.06, x=x, y=-0.12, z=z, cor="grafite", seg=12, eixo="y", bisel=0.0))
            painel.append(mb.cilindro(0.27, 0.02, x=x, y=-0.16, z=z, cor=None, mat="luz", seg=12, eixo="y",
                                      bisel=0.0, tampas=True))
            painel.append(mb.caixa(0.14, 0.18, 0.1, x=x, y=0.3, z=z - 0.05, cor="cinza", bisel=0.0))
    for p in painel:
        mb.transforma(p, rot=("X", 22))
        mb.transforma(p, loc=(0, -0.15, zp + 0.6))
    ps += painel
    it.add(ps)
    it.colisao([((0, 0, 0), (1.4, 1.4, 0.62)), ((0, 0, 0.6), (0.7, 0.7, 15.0)), ((0, 0.0, zp), (4.6, 2.0, 3.0))])
    return {"mini": (0.55, -1.0, 0.45)}


def degraus(fileiras, d, r, larg):
    """Perfil (y, z) da arquibancada: frente em −Y, degraus subindo para +Y, costas retas até o chão."""
    y0 = -fileiras * d / 2
    pts = [(y0, 0.0)]
    for k in range(fileiras):
        pts.append((y0 + k * d, (k + 1) * r))
        pts.append((y0 + (k + 1) * d, (k + 1) * r))
    pts.append((y0 + fileiras * d, 0.0))
    return pts, y0


def p_arquibancada_reta(it):
    """Módulo reto de arquibancada (3,3 m, 4 fileiras de 6 cadeiras): encaixa lado a lado."""
    F, d, r, Lx = 4, 0.8, 0.42, 3.3
    pts, y0 = degraus(F, d, r, Lx)
    corpo = mb.extrudado(mb._ccw(pts), Lx, x=-Lx / 2, cor="concreto", bisel=0.02, seg=2, plano="yz", nome="degraus")
    mb.pinta_onde(corpo, "azul_medio", lambda c, n: n.y < -0.8)
    mb.pinta_onde(corpo, "concreto_escuro", lambda c, n: n.y > 0.8)
    it.add(corpo)
    cores = ("azul", "amarelo", "azul", "amarelo")
    n = 0
    for k in range(F):
        yc = y0 + k * d + d * 0.5
        zt = (k + 1) * r
        for i in range(6):
            x = -Lx / 2 + Lx * (i + 0.5) / 6
            it.add(assento_balde(x, yc, zt, cor=cores[k]))
            n += 1
            it.assento(f"assento_{n}", x, yc - 0.02, zt + 0.07)
    # guarda-corpo atrás, no alto
    yt = y0 + F * d - 0.08
    zt = F * r
    for x in (-Lx / 2 + 0.15, 0.0, Lx / 2 - 0.15):
        it.add(mb.cilindro(0.025, 1.0, x=x, y=yt, z=zt, cor="metal_claro", seg=8, bisel=0.0))
    for z in (zt + 0.5, zt + 1.0):
        it.add(mb.tubo([(-Lx / 2, yt, z), (Lx / 2, yt, z)], 0.03, cor="metal_claro", seg=8))
    it.colisao([((0, 0, 0), (Lx, F * d, F * r)), ((0, yt, F * r), (Lx, 0.1, 1.05))])
    return {"mini": DIR_ALTO, "extra": {"modular": True}}


def p_arquibancada_curva(it):
    """Módulo curvo de arquibancada (setor de 30°, raio de 6 a 9,2 m, 4 fileiras), virado para o centro (−Y)."""
    F, d, r, Ri, ang = 4, 0.8, 0.42, 6.0, 30.0
    Ro = Ri + F * d
    C = V((0, -(Ri * math.cos(math.radians(ang / 2)) + Ro) / 2, 0))
    a0, a1 = 90 - ang / 2, 90 + ang / 2
    partes = []
    for k in range(F):
        ra, rb = Ri + k * d, Ri + (k + 1) * d
        poly = arco(C.x, C.y, ra, a0, a1, 16) + arco(C.x, C.y, rb, a1, a0, 16)
        ob = mb.extrudado(mb._ccw(poly), (k + 1) * r, cor="concreto", bisel=0.02, seg=2, nome="degrau")
        partes.append(ob)
    corpo = mb.junta(partes, "degraus")

    def raio(c):
        return math.hypot(c.x - C.x, c.y - C.y)

    def frente(c, n):  # parede de frente de cada degrau (normal para o centro, abaixo do piso do degrau)
        rr = raio(c)
        rad = V((c.x - C.x, c.y - C.y, 0)).normalized()
        return abs(n.z) < 0.3 and n.dot(rad) < -0.8
    mb.pinta_onde(corpo, "laranja", frente)
    mb.pinta_onde(corpo, "concreto_escuro", lambda c, n: abs(n.z) < 0.3 and
                  n.dot(V((c.x - C.x, c.y - C.y, 0)).normalized()) > 0.8 and raio(c) > Ro - 0.05)
    it.add(corpo)
    n = 0
    for k in range(F):
        rc = Ri + k * d + d * 0.5
        zt = (k + 1) * r
        m = int(rc * math.radians(ang) / 0.55)
        for i in range(m):
            a = a0 + ang * (i + 0.5) / m
            x = C.x + rc * math.cos(math.radians(a))
            y = C.y + rc * math.sin(math.radians(a))
            it.add(assento_balde(x, y, zt, cor="vermelho" if k % 2 == 0 else "laranja", ang=a - 90))
            n += 1
            it.assento(f"assento_{n}", x, y, zt + 0.07)
    # guarda-corpo curvo atrás
    zt = F * r
    rg = Ro - 0.08
    it.add(mb.tubo([(C.x + rg * math.cos(math.radians(a)), C.y + rg * math.sin(math.radians(a)), zt + 1.0)
                    for a in [a0 + ang * t / 12 for t in range(13)]], 0.03, cor="metal_claro", seg=8))
    it.add(mb.tubo([(C.x + rg * math.cos(math.radians(a)), C.y + rg * math.sin(math.radians(a)), zt + 0.5)
                    for a in [a0 + ang * t / 12 for t in range(13)]], 0.03, cor="metal_claro", seg=8))
    for t in range(5):
        a = math.radians(a0 + ang * t / 4)
        it.add(mb.cilindro(0.025, 1.0, x=C.x + rg * math.cos(a), y=C.y + rg * math.sin(a), z=zt, cor="metal_claro",
                           seg=8, bisel=0.0))
    lo, hi = mb.bbox(it.partes)
    cx, cy = (lo.x + hi.x) / 2, (lo.y + hi.y) / 2
    for p in it.partes:
        mb.transforma(p, loc=(-cx, -cy, 0))
    it.slots = [(nm, (c[0] - cx, c[1] - cy, c[2]), t, pai) for nm, c, t, pai in it.slots]
    col = [((0, (hi.y + lo.y) / 2 - cy - 0.6, 0), (hi.x - lo.x - 0.6, (hi.y - lo.y) * 0.55, F * r * 0.6)),
           ((0, hi.y - cy - 1.0, 0), (hi.x - lo.x - 0.2, 1.9, F * r)),
           ((0, hi.y - cy - 0.1, F * r), (hi.x - lo.x - 0.2, 0.2, 1.05))]
    it.colisao(col)
    return {"mini": DIR_ALTO, "extra": {"modular": True, "setor_graus": ang}}


# =====================================================================================================================
# Pista de skate modular
# =====================================================================================================================
SK_SUP, SK_BORDA, SK_BAIXO = "pessego", "laranja", "laranja_escuro"
SK_METAL, SK_CHAPA, SK_GUARDA = "metal_claro", "azul_acinzentado", "cinza_claro"


def estrutura_coluna(x, y, z0, z1, r=0.035):
    return mb.cilindro(r, max(0.02, z1 - z0), x=x, y=y, z=z0, cor=SK_METAL, seg=8, bisel=0.0)


def p_half_pipe(it):
    """Half-pipe grande (12 × 6 m, 2,5 m de altura) com plataformas, guarda-corpo, estrutura metálica e escada."""
    R, f, W, esp, dk = 3.0, 3.0, 6.0, 0.1, 1.6
    tr = eb.perfil_transicao(R, 80, 18, x0=f / 2)
    sup = [(-x, z + esp) for x, z in reversed(tr)] + [(x, z + esp) for x, z in tr]
    sup = sorted(set(sup), key=lambda p: p[0])
    rampa = eb.rampa_xz(sup, esp, W, cor=SK_SUP, borda=SK_BORDA, baixo_cor=SK_BAIXO, nome="rampa")
    xt, zt = sup[-1]
    col_m = mb.copia(rampa, nome="colisao_rampa")
    it.colisao_malha(col_m, "colisao_rampa")
    it.add(rampa, col_m)
    for s_ in (-1, 1):
        x_in, x_out = s_ * xt, s_ * (xt + dk)
        xm = (x_in + x_out) / 2
        it.add(mb.caixa(dk, W, 0.14, x=xm, z=zt - 0.14, cor=SK_SUP, bisel=0.02))
        mb.pinta_onde(it.partes[-1], SK_BORDA, lambda c, n: abs(n.z) < 0.5)
        it.add(mb.caixa(0.5, W - 0.1, 0.012, x=x_in + s_ * 0.29, z=zt, cor=SK_CHAPA, bisel=0.004))
        it.add(mb.cilindro(0.045, W, x=x_in + s_ * 0.0, z=zt + 0.0, cor=SK_METAL, seg=10, eixo="y", bisel=0.005))
        # guarda (painel) no fundo da plataforma
        it.add(mb.caixa(0.06, W, 1.0, x=x_out - s_ * 0.03, z=zt, cor=SK_GUARDA, bisel=0.02))
        for y in (-W / 2 + 0.05, W / 2 - 0.05):
            it.add(mb.tubo([(x_in + s_ * 0.25, y, zt), (x_in + s_ * 0.25, y, zt + 1.0), (x_out, y, zt + 1.0)], 0.03,
                           cor=SK_METAL, seg=8, raio_curva=0.1))
        # estrutura: colunas sob a plataforma e sob a curva
        for y in (-W / 2 + 0.1, 0.0, W / 2 - 0.1):
            for x in (x_in + s_ * 0.1, x_out - s_ * 0.1):
                it.add(estrutura_coluna(x, y, 0, zt - 0.14))
        for xs, zs in tr[6::4]:
            x = s_ * xs
            for y in (-W / 2 + 0.1, W / 2 - 0.1):
                it.add(estrutura_coluna(x, y, 0, zs + esp - 0.12))
        for y in (-W / 2 + 0.1, W / 2 - 0.1):  # trilhos no chão e diagonais nas laterais
            it.add(mb.tubo([(s_ * f / 2, y, 0.04), (x_out - s_ * 0.1, y, 0.04)], 0.03, cor=SK_METAL, seg=8))
            it.add(mb.tubo([(x_in + s_ * 0.1, y, 0.1), (x_out - s_ * 0.1, y, zt - 0.2)], 0.025, cor=SK_METAL, seg=8))
            it.add(mb.tubo([(x_in + s_ * 0.1, y, zt - 0.2), (x_out - s_ * 0.1, y, 0.1)], 0.025, cor=SK_METAL, seg=8))
            xa, za = tr[10]
            it.add(mb.tubo([(s_ * xa, y, 0.1), (x_in + s_ * 0.1, y, zt - 0.3)], 0.025, cor=SK_METAL, seg=8))
        for x in (x_in + s_ * 0.1, x_out - s_ * 0.1):
            it.add(mb.tubo([(x, -W / 2 + 0.1, 0.04), (x, W / 2 - 0.1, 0.04)], 0.03, cor=SK_METAL, seg=8))
    # escada lateral na plataforma da direita (lado −Y)
    xe = xt + dk / 2
    ye = -W / 2 - 0.25
    for sx in (-1, 1):
        it.add(mb.tubo([(xe + sx * 0.25, ye, 0), (xe + sx * 0.25, ye, zt + 0.9)], 0.025, cor=SK_METAL, seg=8))
    for k in range(1, int(zt / 0.3) + 1):
        it.add(mb.cilindro(0.018, 0.5, x=xe, y=ye, z=k * 0.3, cor=SK_METAL, seg=6, eixo="x", bisel=0.0))
    it.colisao([((-(xt + dk / 2), 0, 0), (dk, W, zt + 1.0)), ((xt + dk / 2, 0, 0), (dk, W, zt + 1.0))])
    return {"mini": (0.25, -1.0, 0.55), "extra": {"skate": "half_pipe"}}


def p_quarter_pipe(it):
    """Quarter-pipe (4 m de largura, 1,6 m de altura) virado para −Y, com plataforma, lábio e guarda."""
    R, W, esp, dk = 2.0, 4.0, 0.08, 1.2
    tr = eb.perfil_transicao(R, 78, 16, x0=-1.6)
    sup = [(x, z + 0.02) for x, z in tr]
    rampa = eb.rampa_yz(sup, esp, W, cor=SK_SUP, borda=SK_BORDA, baixo_cor=SK_BAIXO)
    # a casca não desce do chão (a ponta de entrada fica com 2 cm)
    for v in rampa.data.vertices:
        v.co.z = max(v.co.z, 0.0)
    col_m = mb.copia(rampa, nome="colisao_rampa")
    it.colisao_malha(col_m, "colisao_rampa")
    it.add(rampa, col_m)
    yt, zt = sup[-1]
    ym = yt + dk / 2
    it.add(mb.caixa(W, dk, 0.12, y=ym, z=zt - 0.12, cor=SK_SUP, bisel=0.02))
    mb.pinta_onde(it.partes[-1], SK_BORDA, lambda c, n: abs(n.z) < 0.5)
    it.add(mb.caixa(W - 0.1, 0.45, 0.012, y=yt + 0.26, z=zt, cor=SK_CHAPA, bisel=0.004))
    it.add(mb.cilindro(0.04, W, y=yt, z=zt, cor=SK_METAL, seg=10, eixo="x", bisel=0.005))
    it.add(mb.caixa(W, 0.06, 0.9, y=yt + dk - 0.03, z=zt, cor=SK_GUARDA, bisel=0.02))
    it.add(mb.caixa(W - 0.1, 0.35, 0.012, y=tr[0][0] - 0.12, z=0.0, cor=SK_CHAPA, bisel=0.004))  # chapa de entrada
    for x in (-W / 2 + 0.1, 0.0, W / 2 - 0.1):
        for y in (yt + 0.1, yt + dk - 0.1):
            it.add(estrutura_coluna(x, y, 0, zt - 0.12))
        for ys, zs in tr[7::4]:
            if x != 0.0:
                it.add(estrutura_coluna(x, ys, 0, zs - 0.08))
    for x in (-W / 2 + 0.1, W / 2 - 0.1):
        it.add(mb.tubo([(x, tr[6][0], 0.04), (x, yt + dk - 0.1, 0.04)], 0.03, cor=SK_METAL, seg=8))
        it.add(mb.tubo([(x, yt + 0.1, 0.1), (x, yt + dk - 0.1, zt - 0.2)], 0.025, cor=SK_METAL, seg=8))
        it.add(mb.tubo([(x, tr[9][0], 0.08), (x, yt + 0.1, zt - 0.25)], 0.025, cor=SK_METAL, seg=8))
    for sx in (-1, 1):
        it.add(mb.tubo([(sx * (W / 2 - 0.05), yt + 0.25, zt), (sx * (W / 2 - 0.05), yt + 0.25, zt + 0.9),
                        (sx * (W / 2 - 0.05), yt + dk, zt + 0.9)], 0.03, cor=SK_METAL, seg=8, raio_curva=0.1))
    it.colisao([((0, ym, 0), (W, dk, zt + 0.9))])
    return {"mini": (0.8, -1.0, 0.55), "extra": {"skate": "quarter_pipe"}}


def hull(pts, cor, bisel=0.03, nome="solido"):
    bm = bmesh.new()
    vs = [bm.verts.new(p) for p in pts]
    bmesh.ops.convex_hull(bm, input=vs)
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(1), verts=bm.verts[:], edges=bm.edges[:])
    eb_ = [e for e in bm.edges if len(e.link_faces) == 2]
    mb._bevel(bm, bisel, 2, eb_)
    return mb._obj(nome, bm, cor, angulo=30)


def p_funbox(it):
    """Funbox (pirâmide truncada) com as quatro rampas, plataforma no alto, lábios de metal e corrimão no meio."""
    B, T, h = 4.6, 1.8, 0.75
    zb = 0.04
    pts = [(sx * B / 2, sy * B / 2, zb) for sx in (-1, 1) for sy in (-1, 1)] + \
          [(sx * T / 2, sy * T / 2, zb + h) for sx in (-1, 1) for sy in (-1, 1)]
    ob = hull(pts, SK_SUP, nome="funbox")
    mb.pinta_onde(ob, "laranja_claro", lambda c, n: n.z > 0.95)
    mb.pinta_onde(ob, SK_BORDA, lambda c, n: n.z < 0.3 and n.z > -0.5 and c.z < zb + 0.1)
    it.add(ob)
    col_m = mb.copia(ob, nome="colisao_funbox")
    it.colisao_malha(col_m, "colisao_funbox")
    it.add(col_m)
    it.add(mb.caixa(B + 0.5, B + 0.5, zb, cor="concreto_escuro", bisel=0.015))
    zt = zb + h
    for sx, sy, l, p in ((0, -1, T, 0.0), (0, 1, T, 0.0), (-1, 0, 0.0, T), (1, 0, 0.0, T)):
        if l:
            it.add(mb.cilindro(0.035, T, x=0, y=sy * T / 2, z=zt, cor=SK_METAL, seg=10, eixo="x", bisel=0.004))
        else:
            it.add(mb.cilindro(0.035, T, x=sx * T / 2, y=0, z=zt, cor=SK_METAL, seg=10, eixo="y", bisel=0.004))
    # corrimão baixo atravessando a plataforma (de rampa a rampa)
    for x in (-0.7, 0.7):
        it.add(mb.caixa(0.06, 0.06, 0.3, x=x, z=zt, cor="laranja", bisel=0.01))
    it.add(mb.cilindro(0.03, 1.6, z=zt + 0.32, cor="cromo", seg=10, eixo="x", bisel=0.004))
    return {"mini": DIR_MEIO, "col": [((0, 0, 0), (T, T, zt))], "extra": {"skate": "funbox"}}


def p_rampa_salto(it):
    """Rampa de salto (kicker) curva, virada para −Y: sólida com laterais laranja, lábio de metal e chapa de entrada."""
    R, W = 2.6, 1.6
    tr = eb.perfil_transicao(R, 42, 14, x0=-1.0)
    sup = [(x, z + 0.02) for x, z in tr]
    yt, zt = sup[-1]
    pts = [(sup[0][0], 0.0)] + sup + [(yt + 0.25, zt), (yt + 0.25, 0.0)]
    ob = mb.extrudado(mb._ccw(pts), W, x=-W / 2, cor=SK_SUP, bisel=0.008, seg=2, plano="yz", nome="kicker")
    mb.pinta_onde(ob, SK_BORDA, lambda c, n: abs(n.x) > 0.8)
    mb.pinta_onde(ob, "laranja_escuro", lambda c, n: n.y > 0.8)
    it.add(ob)
    col_m = mb.copia(ob, nome="colisao_kicker")
    it.colisao_malha(col_m, "colisao_kicker")
    it.add(col_m)
    it.add(mb.cilindro(0.035, W, y=yt, z=zt, cor=SK_METAL, seg=10, eixo="x", bisel=0.004))
    it.add(mb.caixa(W, 0.25, 0.012, y=yt + 0.125, z=zt, cor=SK_CHAPA, bisel=0.003))
    it.add(mb.caixa(W - 0.06, 0.3, 0.01, y=sup[0][0] + 0.15, z=0.0, cor=SK_CHAPA, bisel=0.003))
    for sx in (-1, 1):  # parafusos/faixas de reforço nas laterais
        for t in (0.35, 0.7):
            yy = sup[0][0] + (yt + 0.25 - sup[0][0]) * t
            zz = max(0.05, eb_altura(sup, yy) * 0.5)
            it.add(mb.cilindro(0.03, 0.012, x=sx * (W / 2 + 0.004), y=yy, z=zz, cor=SK_METAL, seg=8, eixo="x",
                               bisel=0.0))
    return {"mini": (0.9, -1.0, 0.5), "extra": {"skate": "kicker"}}


def eb_altura(sup, y):
    for (y0, z0), (y1, z1) in zip(sup, sup[1:]):
        if y0 <= y <= y1:
            return z0 + (z1 - z0) * (y - y0) / max(1e-6, y1 - y0)
    return sup[-1][1]


def p_corrimao_skate(it):
    """Corrimão de skate (3 m, 35 cm de altura) com pés de chapa."""
    ps = []
    for x in (-1.2, 1.2):
        ps.append(mb.caixa(0.06, 0.06, 0.33, x=x, z=0.0, cor="laranja", bisel=0.01))
        ps.append(mb.caixa(0.3, 0.5, 0.012, x=x, cor="grafite", bisel=0.004))
        ps.append(mb.tubo([(x, -0.2, 0.012), (x, 0, 0.25), (x, 0.2, 0.012)], 0.015, cor="laranja", seg=6,
                          raio_curva=0.05))
    ps.append(mb.cilindro(0.032, 3.0, z=0.36, cor="cromo", seg=12, eixo="x", bisel=0.004))
    ps.append(mb.esfera(0.034, x=-1.5, z=0.36, cor="cromo", seg=10))
    ps.append(mb.esfera(0.034, x=1.5, z=0.36, cor="cromo", seg=10))
    it.add(ps)
    it.colisao([((0, 0, 0), (3.1, 0.5, 0.4))])
    return {"mini": (0.55, -1.0, 0.7), "extra": {"skate": "corrimao"}}


def p_banco_skate(it):
    """Banco de skate (ledge) de concreto com cantoneira de metal nas quinas de cima."""
    L, P, A = 2.8, 0.6, 0.45
    it.add(mb.caixa(L, P, A, cor="concreto", bisel=0.03))
    it.add(mb.caixa(L + 0.1, P + 0.1, 0.06, cor="concreto_escuro", bisel=0.02))
    for sy in (-1, 1):
        it.add(mb.caixa(L + 0.004, 0.05, 0.05, y=sy * (P / 2 - 0.023), z=A - 0.048, cor=SK_METAL, bisel=0.006))
    # faixa pintada (grafite de cores) na frente
    it.add(mb.caixa(1.6, 0.006, 0.18, x=-0.3, y=-P / 2 - 0.002, z=0.14, cor="turquesa", bisel=0.002, seg=1))
    it.add(mb.caixa(0.7, 0.006, 0.18, x=0.9, y=-P / 2 - 0.002, z=0.14, cor="amarelo", bisel=0.002, seg=1))
    it.colisao([((0, 0, 0), (L + 0.1, P + 0.1, A))])
    return {"mini": (0.55, -1.0, 0.7), "extra": {"skate": "banco"}}


def p_caixote_skate(it):
    """Caixote de skate (manual pad) de madeira pintada com bordas de metal."""
    L, P, A = 1.8, 1.2, 0.3
    it.add(mb.caixa(L, P, A, cor="azul", bisel=0.02))
    it.add(mb.caixa(L - 0.08, P - 0.08, 0.012, z=A, cor="madeira_clara", bisel=0.004))
    for k in range(1, 6):
        it.add(mb.caixa(0.008, P - 0.1, 0.004, x=-L / 2 + L * k / 6, z=A + 0.011, cor="madeira", bisel=0.0))
    for sy in (-1, 1):
        it.add(mb.caixa(L + 0.004, 0.04, 0.04, y=sy * (P / 2 - 0.018), z=A - 0.038, cor=SK_METAL, bisel=0.005))
    for sx in (-1, 1):
        it.add(mb.caixa(0.04, P + 0.004, 0.04, x=sx * (L / 2 - 0.018), z=A - 0.038, cor=SK_METAL, bisel=0.005))
    it.add(mb.caixa(0.5, 0.006, 0.12, y=-P / 2 - 0.002, z=0.08, cor="amarelo", bisel=0.002, seg=1))
    it.colisao([((0, 0, 0), (L, P, A + 0.02))])
    return {"mini": (0.55, -1.0, 0.7), "extra": {"skate": "caixote"}}


# =====================================================================================================================
# Academia ao ar livre (postes azuis, anéis e tampas laranja, peças vermelhas)
# =====================================================================================================================
AC_POSTE, AC_ANEL, AC_PECA, AC_BARRA = "azul_medio", "laranja", "vermelho", "cromo"


def p_barras(it):
    """Barras fixas em três alturas (1,9 / 2,2 / 2,5 m)."""
    xs = (-1.65, -0.55, 0.55, 1.65)
    hs = (1.9, 2.2, 2.5)
    altos = (1.95, 2.25, 2.55, 2.55)
    for x, a in zip(xs, altos):
        it.add(poste(x, 0, a, r=0.055, cor=AC_POSTE, anel=AC_ANEL))
    for k, h in enumerate(hs):
        it.add(barra((xs[k] + 0.05, 0, h), (xs[k + 1] - 0.05, 0, h), r=0.022, cor=AC_BARRA))
        for x in (xs[k] + 0.03, xs[k + 1] - 0.03):
            it.add(mb.cilindro(0.06, 0.08, x=x, y=0, z=h - 0.04, cor=AC_ANEL, seg=12, bisel=0.01))
    it.colisao([((x, 0, 0), (0.16, 0.16, a)) for x, a in zip(xs, altos)])
    return {"mini": DIR_ALTO}


def p_paralelas(it):
    """Barras paralelas (1,15 m) com pegadas vermelhas."""
    for x in (-1.0, 1.0):
        for y in (-0.27, 0.27):
            it.add(poste(x, y, 1.15, r=0.05, cor=AC_POSTE, anel=AC_ANEL, topo=False))
    for y in (-0.27, 0.27):
        it.add(barra((-1.25, y, 1.18), (1.25, y, 1.18), r=0.03, cor=AC_PECA))
        for x in (-1.0, 1.0):
            it.add(mb.esfera(0.06, x=x, y=y, z=1.18, cor=AC_ANEL, seg=12))
    it.add(barra((-1.0, -0.27, 0.35), (-1.0, 0.27, 0.35), r=0.025, cor=AC_POSTE))
    it.add(barra((1.0, -0.27, 0.35), (1.0, 0.27, 0.35), r=0.025, cor=AC_POSTE))
    it.colisao([((0, 0, 0), (2.6, 0.7, 1.25))])
    return {"mini": DIR_ALTO}


def p_banco_abdominal(it):
    """Banco de abdominal inclinado com rolos para os pés e alça."""
    L = 1.5
    banco = [mb.caixa(L, 0.42, 0.08, cor=AC_PECA, bisel=0.03), mb.caixa(L - 0.1, 0.3, 0.04, z=-0.04, cor="grafite",
                                                                          bisel=0.01)]
    for p in banco:
        mb.transforma(p, rot=("Y", -18))
        mb.transforma(p, loc=(0, 0, 0.62))
    it.add(banco)
    zl = 0.62 - math.sin(math.radians(18)) * L / 2
    zh = 0.62 + math.sin(math.radians(18)) * L / 2
    xl, xh = -math.cos(math.radians(18)) * L / 2, math.cos(math.radians(18)) * L / 2
    it.add(poste(xl + 0.15, 0, zl + 0.0, r=0.05, cor=AC_POSTE, anel=AC_ANEL, topo=False))
    it.add(poste(xh - 0.1, 0, zh - 0.05, r=0.05, cor=AC_POSTE, anel=AC_ANEL, topo=False))
    it.add(barra((xl + 0.15, 0, 0.3), (xh - 0.1, 0, 0.3), r=0.03, cor=AC_POSTE))
    # rolos dos pés na ponta alta
    xr = xh + 0.05
    it.add(barra((xr - 0.15, 0, zh + 0.02), (xr, 0, zh + 0.2), r=0.025, cor=AC_POSTE))
    for zz in (zh + 0.2,):
        it.add(barra((xr, -0.32, zz), (xr, 0.32, zz), r=0.02, cor=AC_BARRA))
        for y in (-0.2, 0.2):
            it.add(mb.cilindro(0.06, 0.2, x=xr, y=y, z=zz, cor=AC_ANEL, seg=12, eixo="y", bisel=0.02))
    it.assento("assento_1", 0, 0, 0.7)
    it.colisao([((0, 0, 0), (1.5, 0.6, 0.85))])
    return {"mini": DIR_ALTO}


def p_bicicleta(it):
    """Bicicleta ergométrica de praça: banco, guidão, volante coberto e pedivela que gira."""
    ps = [mb.tubo([(0, -0.55, 0.045), (0, 0.6, 0.045)], 0.045, cor=AC_POSTE, seg=10),
          mb.tubo([(-0.35, 0.55, 0.045), (0.35, 0.55, 0.045)], 0.045, cor=AC_POSTE, seg=10),
          mb.tubo([(-0.3, -0.5, 0.045), (0.3, -0.5, 0.045)], 0.045, cor=AC_POSTE, seg=10),
          mb.tubo([(0, 0.45, 0.03), (0, 0.32, 0.8)], 0.05, cor=AC_POSTE, seg=10),
          mb.tubo([(0, -0.45, 0.03), (0, -0.38, 1.0)], 0.05, cor=AC_POSTE, seg=10),
          mb.tubo([(0, 0.4, 0.66), (0, -0.4, 0.66)], 0.04, cor=AC_POSTE, seg=10)]
    for x in (-0.3, 0.3):
        for y in (-0.5, 0.55):
            ps.append(mb.cilindro(0.08, 0.04, x=x, y=y, cor="concreto", seg=12, bisel=0.01))
    ps.append(mb.superelipsoide(0.3, 0.34, 0.1, y=0.32, z=0.8, cor=AC_PECA, e=0.5, e_v=0.4, nu=16, nv=8))
    ps.append(mb.tubo([(-0.28, -0.42, 1.08), (-0.25, -0.38, 1.0), (0.25, -0.38, 1.0), (0.28, -0.42, 1.08)], 0.025,
                      cor=AC_BARRA, seg=8, raio_curva=0.05))
    for sx in (-1, 1):
        ps.append(mb.cilindro(0.032, 0.12, x=sx * 0.26, y=-0.41, z=1.03, cor="grafite", seg=8, bisel=0.01))
    ps.append(mb.cilindro(0.22, 0.12, x=0, y=-0.2, z=0.42, cor="amarelo", seg=24, eixo="x", bisel=0.03))
    ps.append(mb.cilindro(0.09, 0.13, x=0, y=-0.2, z=0.42, cor=AC_ANEL, seg=16, eixo="x", bisel=0.02))
    ps.append(mb.tubo([(0, -0.2, 0.42), (0, 0.1, 0.32)], 0.03, cor=AC_POSTE, seg=8))
    it.add(ps)
    # pedivela animado: eixo X no centro do movimento
    cy, cz = 0.1, 0.32
    pv = [mb.cilindro(0.04, 0.26, x=0, y=cy, z=cz, cor="grafite", seg=12, eixo="x", bisel=0.005)]
    for sx, sz in ((-1, 1), (1, -1)):
        braco = mb.caixa(0.03, 0.04, 0.17, x=sx * 0.14, y=cy, z=cz, cor="grafite", bisel=0.01)
        mb.transforma(braco, loc=(0, 0, 0))
        if sz < 0:
            mb.transforma(braco, loc=(0, 0, -0.17))
        pv.append(braco)
        pv.append(mb.caixa(0.12, 0.08, 0.025, x=sx * 0.22, y=cy, z=cz + sz * 0.16, cor="preto", bisel=0.008))
    it.anima(pv, {"anima": "girar", "eixo": "x", "velocidade": 160}, "pedivela", pivo=(0, cy, cz))
    it.assento("assento_1", 0, 0.32, 0.9)
    it.colisao([((0, 0.03, 0), (0.75, 1.25, 1.1))])
    return {"mini": (0.9, -1.0, 0.45)}


def p_simulador_caminhada(it):
    """Simulador de caminhada: pórtico com pegada e duas pernas pendulares em oposição."""
    zp = 1.25
    it.add(poste(0, 0.25, 1.55, r=0.06, cor=AC_POSTE, anel=AC_ANEL))
    it.add(barra((0, 0.25, 1.3), (0, -0.15, 1.3), r=0.04, cor=AC_POSTE))
    it.add(barra((-0.32, 0.0, zp), (0.32, 0.0, zp), r=0.035, cor=AC_POSTE))
    it.add(barra((0, 0.0, zp), (0, 0.25, zp), r=0.035, cor=AC_POSTE))
    it.add(mb.tubo([(-0.3, -0.15, 1.3), (-0.3, -0.35, 1.35), (0.3, -0.35, 1.35), (0.3, -0.15, 1.3)], 0.025,
                   cor=AC_BARRA, seg=8, raio_curva=0.06))
    for sx in (-1, 1):
        it.add(mb.cilindro(0.05, 0.08, x=sx * 0.32, y=0, z=zp - 0.04, cor=AC_ANEL, seg=12, eixo="x", bisel=0.01))
    for k, sx in enumerate((-1, 1)):
        x = sx * 0.2
        perna = [barra((x, 0, zp), (x, 0, 0.2), r=0.028, cor=AC_POSTE),
                 mb.caixa(0.22, 0.36, 0.04, x=x, y=-0.06, z=0.16, cor=AC_PECA, bisel=0.015),
                 mb.cilindro(0.04, 0.1, x=x, y=0, z=zp, cor=AC_ANEL, seg=10, eixo="x", bisel=0.01)]
        it.anima(perna, {"anima": "balancar", "eixo": "x", "angulo": 22 if k == 0 else -22, "periodo": 2.2},
                 f"perna_{'esq' if sx < 0 else 'dir'}", pivo=(x, 0, zp))
    it.assento("assento_1", 0, -0.05, 0.2)
    it.colisao([((0, 0.05, 0), (0.75, 0.7, 1.6))])
    return {"mini": (0.9, -1.0, 0.45)}


def p_barra_flexao(it):
    """Estação de flexão de braço: três barras baixas em alturas diferentes."""
    alt = (0.3, 0.42, 0.55)
    it.add(mb.caixa(2.7, 1.3, 0.03, cor="verde_medio", bisel=0.012))  # piso de borracha
    for k in range(1, 3):
        it.add(mb.caixa(0.012, 1.26, 0.004, x=-1.35 + 0.9 * k, z=0.03, cor="verde_escuro", bisel=0.0))
    for k, h in enumerate(alt):
        x = -1.0 + k * 1.0
        for y in (-0.4, 0.4):
            it.add(poste(x, y, h, r=0.045, cor=AC_POSTE, anel=AC_ANEL, topo=False))
        it.add(barra((x, -0.5, h + 0.02), (x, 0.5, h + 0.02), r=0.028, cor=AC_PECA))
        for y in (-0.4, 0.4):
            it.add(mb.esfera(0.055, x=x, y=y, z=h + 0.02, cor=AC_ANEL, seg=10))
    it.colisao([((0, 0, 0), (2.7, 1.3, 0.6))])
    return {"mini": DIR_MEIO}


# =====================================================================================================================
# Mesas de praça, placar, bebedouro, bicicletário e banco de reservas
# =====================================================================================================================
def p_pingue_pongue(it):
    """Mesa de pingue-pongue de concreto (2,74 × 1,525 m, tampo a 0,76 m) com rede de chapa de aço."""
    L, P, zt = 2.74, 1.525, 0.76
    it.add(mb.caixa(L + 0.08, P + 0.08, 0.07, z=zt - 0.07, cor="concreto", bisel=0.025))
    it.add(decal(ret(-L / 2, -P / 2, L / 2, P / 2), zt + 0.001, "azul_medio"))
    ps = [contorno_ret(-L / 2, -P / 2, L / 2, P / 2, 0.02, zt + 0.003), seg(-L / 2, 0, L / 2, 0, 0.006, zt + 0.003)]
    it.add(mb.junta(ps, "linhas"))
    for x in (-0.85, 0.85):
        it.add(mb.caixa(0.18, 1.0, zt - 0.07, x=x, cor="concreto", bisel=0.03))
        it.add(mb.caixa(0.36, 1.15, 0.06, x=x, cor="concreto_escuro", bisel=0.02))
    # rede de chapa (com furos sugeridos por faixas) e postes
    it.add(mb.caixa(0.02, P + 0.15, 0.15, z=zt, cor="metal_escuro", bisel=0.004))
    it.add(mb.caixa(0.03, P + 0.15, 0.025, z=zt + 0.15, cor="cromo", bisel=0.006))
    for k in range(10):
        it.add(mb.caixa(0.024, 0.06, 0.08, y=-P / 2 + 0.06 + k * (P - 0.12) / 9, z=zt + 0.035, cor="grafite_escuro",
                        bisel=0.0))
    for y in (-P / 2 - 0.07, P / 2 + 0.07):
        it.add(mb.caixa(0.06, 0.05, 0.2, y=y, z=zt - 0.04, cor="cromo", bisel=0.01))
    it.colisao([((0, 0, 0), (L + 0.1, P + 0.2, zt + 0.17))])
    return {"mini": DIR_MEIO}


def p_mesa_xadrez(it):
    """Mesa de xadrez de praça: tampo de concreto com tabuleiro, pé central e quatro banquinhos; algumas peças."""
    zt = 0.74
    it.add(mb.cilindro(0.2, zt - 0.08, z=0.0, cor="concreto", seg=16, bisel=0.02, r2=0.14))
    it.add(mb.cilindro(0.32, 0.06, cor="concreto_escuro", seg=16, bisel=0.02))
    it.add(mb.caixa(0.86, 0.86, 0.08, z=zt - 0.08, cor="concreto", bisel=0.03))
    c = 0.07
    b0 = -4 * c
    it.add(decal(ret(b0 - 0.04, b0 - 0.04, -b0 + 0.04, -b0 + 0.04), zt + 0.001, "madeira_mel"))
    claros, escuros = [], []
    for i in range(8):
        for j in range(8):
            q = ret(b0 + i * c, b0 + j * c, b0 + (i + 1) * c, b0 + (j + 1) * c)
            (claros if (i + j) % 2 else escuros).append(q)
    it.add(mb.junta([decal(q, zt + 0.002, "creme") for q in claros] +
                    [decal(q, zt + 0.002, "grafite") for q in escuros], "tabuleiro"))

    def peca(tipo, i, j, cor):
        x, y = b0 + (i + 0.5) * c, b0 + (j + 0.5) * c
        if tipo == "peao":
            perf = [(0, 0), (0.022, 0), (0.022, 0.008), (0.012, 0.016), (0.008, 0.03), (0.014, 0.04), (0, 0.052)]
        elif tipo == "torre":
            perf = [(0, 0), (0.024, 0), (0.024, 0.008), (0.015, 0.016), (0.014, 0.045), (0.02, 0.05), (0.02, 0.062),
                    (0, 0.062)]
        else:  # rei
            perf = [(0, 0), (0.026, 0), (0.026, 0.01), (0.014, 0.02), (0.011, 0.06), (0.02, 0.07), (0.012, 0.08),
                    (0.004, 0.09), (0, 0.095)]
        return mb.torno(perf, x=x, y=y, z=zt + 0.003, cor=cor, seg=10)
    pecas = [peca("peao", 3, 3, "branco"), peca("peao", 4, 4, "preto"), peca("peao", 2, 1, "branco"),
             peca("peao", 5, 6, "preto"), peca("torre", 0, 0, "branco"), peca("torre", 7, 7, "preto"),
             peca("rei", 4, 0, "branco"), peca("rei", 3, 7, "preto")]
    it.add(mb.junta(pecas, "pecas"))
    for k, (x, y) in enumerate(((0, -0.78), (0, 0.78), (-0.78, 0), (0.78, 0))):
        it.add(mb.cilindro(0.2, 0.42, x=x, y=y, cor="concreto", seg=16, bisel=0.03, r2=0.18))
        it.add(mb.cilindro(0.2, 0.025, x=x, y=y, z=0.42, cor="madeira_mel", seg=16, bisel=0.008))
        it.assento(f"assento_{k + 1}", x, y, 0.445)
    it.slot("tabuleiro", (0, 0, zt + 0.002), (0.56, 0.56, 0.12))
    it.colisao([((0, 0, 0), (0.86, 0.86, zt))] + [((x, y, 0), (0.4, 0.4, 0.45)) for x, y in ((0, -0.78), (0, 0.78))] +
               [((0, 0, 0), (1.96, 0.4, 0.45))])
    return {"mini": DIR_MEIO}


def p_placar(it):
    """Placar eletrônico em dois pés: tela de LED (4 placares que se trocam) e faixa PLACAR, ambas com brilho."""
    W, Hh, z0 = 4.2, 2.2, 3.2
    ps = []
    for sx in (-1, 1):
        ps.append(mb.caixa(0.7, 0.7, 0.3, x=sx * 1.6, cor="concreto_escuro", bisel=0.04))
        ps.append(mb.caixa(0.26, 0.26, z0 + 0.2, x=sx * 1.6, z=0.3, cor="azul_escuro", bisel=0.03))
        ps.append(mb.caixa(0.32, 0.32, 0.1, x=sx * 1.6, z=0.3, cor="amarelo", bisel=0.02))
    ps.append(mb.caixa(W + 0.3, 0.55, Hh + 0.25, z=z0, y=0.0, cor="azul_escuro", bisel=0.06))
    ps.append(mb.caixa(W + 0.5, 0.65, 0.12, z=z0 + Hh + 0.85, cor="azul_escuro", bisel=0.04))
    ps.append(mb.caixa(W + 0.3, 0.5, 0.6, z=z0 + Hh + 0.25, y=0.02, cor="azul_escuro", bisel=0.04))
    ps.append(mb.caixa(W + 0.36, 0.6, 0.08, z=z0 + Hh + 0.2, cor="amarelo", bisel=0.03))
    ps.append(mb.caixa(W + 0.36, 0.6, 0.08, z=z0 - 0.08, cor="amarelo", bisel=0.03))
    fx = eb.quad_uv("faixa", (0, -0.256, z0 + Hh + 0.55), (1, 0, 0), (0, 0, 1), W, 0.56, estampa("placar_faixa", 0.8))
    ps.append(fx)
    # relevo da moldura da tela
    ps.append(mb.caixa(W + 0.04, 0.08, 0.1, y=-0.29, z=z0 + 0.05, cor="grafite_escuro", bisel=0.02))
    ps.append(mb.caixa(W + 0.04, 0.08, 0.1, y=-0.29, z=z0 + Hh - 0.05, cor="grafite_escuro", bisel=0.02))
    for sx in (-1, 1):
        ps.append(mb.caixa(0.1, 0.08, Hh - 0.0, x=sx * (W / 2 - 0.03), y=-0.29, z=z0 + 0.05, cor="grafite_escuro",
                           bisel=0.02))
    # escadinha atrás para manutenção
    for sx in (-1, 1):
        ps.append(mb.caixa(0.04, 0.04, z0, x=0.9 + sx * 0.2, y=0.4, z=0.0, cor="metal_escuro", bisel=0.0))
    for k in range(1, 11):
        ps.append(mb.caixa(0.4, 0.03, 0.03, x=0.9, y=0.4, z=k * 0.3, cor="metal_escuro", bisel=0.0))
    it.add(ps)
    tl = eb.quad_uv("tela", (0, -0.305, z0 + 0.05 + (Hh - 0.1) / 2), (1, 0, 0), (0, 0, 1), W - 0.1, Hh - 0.1,
                    estampa("placar_tela", 1.4), uv=((0, 0), (0.25, 0), (0.25, 1), (0, 1)))
    it.anima(tl, {"anima": "trocar", "quadros": 4, "periodo": 4}, "tela_placar")
    it.colisao([((-1.6, 0, 0), (0.7, 0.7, z0)), ((1.6, 0, 0), (0.7, 0.7, z0)), ((0, 0, z0), (W + 0.5, 0.65, Hh + 1.0))])
    return {"mini": (0.45, -1.0, 0.3)}


def p_bebedouro(it):
    """Bebedouro esportivo de duas alturas, com enchedor de garrafa e luz indicadora."""
    ps = [mb.caixa(0.5, 0.42, 1.05, cor="azul", bisel=0.08),
          mb.caixa(0.56, 0.48, 0.06, cor="concreto_escuro", bisel=0.02),
          mb.superelipsoide(0.5, 0.42, 0.1, z=1.02, cor="cromo", e=0.3, e_v=0.4, nu=20, nv=8),
          mb.cilindro(0.13, 0.02, y=-0.02, z=1.11, cor="metal", seg=16, bisel=0.004),
          mb.tubo([(0.08, -0.05, 1.11), (0.08, -0.05, 1.17), (0.03, -0.05, 1.2)], 0.012, cor="cromo", seg=6,
                  raio_curva=0.02),
          mb.cilindro(0.025, 0.02, x=0.18, y=-0.212, z=0.95, cor="vermelho", seg=10, eixo="y", bisel=0.004)]
    # bebedouro baixo (crianças) num braço à direita
    ps.append(mb.caixa(0.36, 0.34, 0.12, x=0.4, y=0.0, z=0.68, cor="azul", bisel=0.04))
    ps.append(mb.superelipsoide(0.38, 0.36, 0.08, x=0.42, z=0.78, cor="cromo", e=0.3, e_v=0.4, nu=16, nv=6))
    ps.append(mb.cilindro(0.09, 0.015, x=0.42, z=0.855, cor="metal", seg=14, bisel=0.003))
    ps.append(mb.cilindro(0.06, 0.6, x=0.45, z=0.06, cor="azul_escuro", seg=12, bisel=0.01))
    # nicho do enchedor de garrafa (frente)
    ps.append(mb.caixa(0.32, 0.06, 0.4, y=-0.2, z=0.36, cor="grafite_escuro", bisel=0.02))
    ps.append(mb.caixa(0.26, 0.02, 0.32, y=-0.232, z=0.4, cor="cromo", bisel=0.008))
    ps.append(mb.cilindro(0.02, 0.06, y=-0.25, z=0.7, cor="cromo", seg=8, bisel=0.004))
    ps.append(mb.caixa(0.2, 0.08, 0.02, y=-0.25, z=0.38, cor="metal", bisel=0.004))
    ps.append(mb.caixa(0.08, 0.015, 0.03, x=0.0, y=-0.236, z=0.74, cor=None, mat="luz", bisel=0.004))
    ps.append(mb.caixa(0.36, 0.02, 0.08, y=-0.218, z=0.86, cor="branco", bisel=0.008))  # faixa de gota
    ps.append(mb.esfera(0.025, x=-0.08, y=-0.23, z=0.9, cor="azul_celeste", seg=10, esc=(1, 0.5, 1.3)))
    ps.append(mb.cilindro(0.16, 0.012, y=-0.36, z=0.0, cor="metal_escuro", seg=16, bisel=0.0))  # ralo
    it.add(ps)
    it.colisao([((0.0, 0, 0), (0.56, 0.48, 1.12)), ((0.42, 0, 0), (0.4, 0.38, 0.86))])
    return {"mini": DIR_ALTO}


def p_bicicletario_clube(it):
    """Bicicletário de clube coberto: 6 arcos em U invertido, cobertura curva com filete de luz e piso pintado."""
    L = 5.2
    it.add(mb.caixa(L + 0.4, 2.2, 0.03, y=-0.1, cor="concreto", bisel=0.01))
    for k in range(6):
        x = -L / 2 + 0.45 + k * (L - 0.9) / 5
        it.add(mb.tubo([(x, -0.45, 0.03), (x, -0.45, 0.75), (x, 0.45, 0.75), (x, 0.45, 0.03)], 0.03,
                       cor="amarelo", seg=8, raio_curva=0.18))
        it.add(decal(ret(x - 0.02, -1.15, x + 0.02, -0.75), 0.033, "branco"))
    it.add(mb.tubo([(-L / 2 + 0.2, 0, 0.04), (L / 2 - 0.2, 0, 0.04)], 0.035, cor="grafite", seg=8))
    # cobertura: postes atrás e casca curva
    for x in (-L / 2 + 0.25, L / 2 - 0.25):
        it.add(mb.cilindro(0.06, 2.35, x=x, y=0.85, cor="grafite", seg=10, bisel=0.01))
        it.add(mb.tubo([(x, 0.85, 2.3), (x, 0.3, 2.45), (x, -0.6, 2.35), (x, -1.15, 2.1)], 0.045, cor="grafite",
                       seg=8, raio_curva=0.6))
    perfil = [(0.95, 2.28), (0.3, 2.47), (-0.6, 2.38), (-1.2, 2.12)]
    sup = [(p.x, p.y) for p in mb._arredonda_cantos(perfil, 0.6, n=6)]
    teto = eb.rampa_yz(sup, 0.04, L + 0.2, cor="turquesa", borda="turquesa_escuro", baixo_cor="turquesa_claro",
                       nome="teto", bisel=0.01)
    it.add(teto)
    it.add(mb.caixa(L + 0.1, 0.05, 0.03, y=-1.17, z=2.06, cor=None, mat="luz", bisel=0.01))
    # plaquinha com o desenho de bicicleta (anéis e quadro)
    pl = [mb.caixa(0.6, 0.04, 0.42, x=L / 2 - 0.25, y=0.76, z=1.55, cor="azul", bisel=0.03)]
    for sx in (-1, 1):
        pl.append(eb.anel_tubo(0, 0, 0, 0.08, 0.012, cor="branco", seg=16, seg_t=4))
        mb.transforma(pl[-1], rot=("X", 90))
        mb.transforma(pl[-1], loc=(L / 2 - 0.25 + sx * 0.14, 0.735, 1.72))
    pl.append(mb.tubo([(L / 2 - 0.39, 0.735, 1.72), (L / 2 - 0.25, 0.735, 1.82), (L / 2 - 0.11, 0.735, 1.72)],
                      0.01, cor="branco", seg=4))
    it.add(pl)
    it.colisao([((0, 0, 0), (L - 0.4, 1.0, 0.8)), ((-L / 2 + 0.25, 0.85, 0), (0.15, 0.15, 2.4)),
                ((L / 2 - 0.25, 0.85, 0), (0.15, 0.15, 2.4))])
    return {"mini": DIR_ALTO}


def p_banco_reservas(it):
    """Banco de reservas coberto: casca de policarbonato em quarto de elipse sobre arcos de metal, 6 cadeiras."""
    L, P, A = 3.6, 1.3, 2.1
    it.add(mb.caixa(L + 0.2, P + 0.2, 0.06, cor="concreto", bisel=0.02))
    n = 14
    arc_pts = [(-P / 2 + P * math.cos(math.radians(90 * k / n)), 0.06 + A * math.sin(math.radians(90 * k / n)))
               for k in range(n + 1)]
    sup = sorted(arc_pts, key=lambda q: q[0])
    # sup vai de y = −P/2 (frente, alto) a y = +P/2 (atrás, chão)
    casca = eb.rampa_yz(sup, 0.02, L, cor=None, borda="cromo", baixo_cor=None, nome="casca", bisel=0.0)
    mb.pinta(casca, None, mat="vidro")
    it.add(casca)
    for x in (-L / 2, 0.0, L / 2):
        it.add(mb.tubo([(x, y, z + 0.03) for y, z in sup], 0.035, cor="cromo", seg=8))
    it.add(mb.tubo([(-L / 2, sup[0][0], sup[0][1]), (L / 2, sup[0][0], sup[0][1])], 0.035, cor="cromo", seg=8))
    # tampas laterais de vidro (quarto de elipse)
    for x in (-L / 2 - 0.01, L / 2 + 0.01):
        bm = bmesh.new()
        vs = [bm.verts.new((x, y, z)) for y, z in sup] + [bm.verts.new((x, sup[0][0], 0.06))]
        bm.faces.new(vs)
        bmesh.ops.triangulate(bm, faces=bm.faces[:], ngon_method="EAR_CLIP")
        it.add(eb.obj_plano("lateral", bm, None, mat="vidro"))
    # parede baixa de fundo e banco
    it.add(mb.caixa(L, 0.08, 0.9, y=P / 2 - 0.3, z=0.06, cor="azul_escuro", bisel=0.02))
    it.add(mb.caixa(L - 0.1, 0.05, 0.05, y=P / 2 - 0.4, z=0.3, cor="cromo", bisel=0.01))
    for x in (-L / 2 + 0.2, L / 2 - 0.2):
        it.add(mb.caixa(0.05, 0.3, 0.42, x=x, y=0.2, z=0.06, cor="cromo", bisel=0.01))
    it.add(mb.caixa(L - 0.2, 0.06, 0.06, y=0.2, z=0.42, cor="cromo", bisel=0.01))
    for k in range(6):
        x = -L / 2 + 0.3 + k * (L - 0.6) / 5
        it.add(assento_balde(x, 0.12, 0.47, cor="vermelho" if k % 2 == 0 else "branco"))
        it.assento(f"assento_{k + 1}", x, 0.1, 0.54)
    it.colisao([((0, 0, 0), (L + 0.2, P + 0.2, 0.06)), ((0, P / 2 - 0.3, 0), (L, 0.4, 0.96)),
                ((0, 0.2, 0), (L, 0.5, 0.5)), ((0, 0, A - 0.2), (L, P, 0.3))])
    return {"mini": DIR_ALTO}


# =====================================================================================================================
# Registro e exportação
# =====================================================================================================================
def exporta(cat, it, rotulo, grupo, tags, mini=None, col=None, extra=None, pacote=False):
    ex = dict(extra or {})
    if getattr(it, "animados", None):
        ex["animacoes"] = it.lista_animacoes()
    if col is not None:
        it.colisao(col)
    return cat.exporta(it, rotulo, grupo=grupo, tags=tags, miniatura_dir=mini or DIR_ALTO, pacote=pacote,
                       extra=ex or None)


T_Q = ["esporte", "quadra", "modular"]
T_SK = ["esporte", "skate", "rampa", "modular"]
T_AC = ["esporte", "academia", "praca"]
PECAS = [
    # quadras
    ("quadra_basquete", "Quadra de basquete (laranja e vermelha)", "quadra_basquete", T_Q + ["basquete", "1x1"],
     p_quadra_basquete, {}),
    ("quadra_basquete_azul", "Quadra de basquete (azul e amarela)", "quadra_basquete", T_Q + ["basquete", "1x1"],
     lambda it: p_quadra_basquete(it, piso="azul_escuro", quadra="azul", garrafao="amarelo", circulo="amarelo",
                                  bola="laranja"), {}),
    ("campo_futebol", "Campo de futebol society (2 × 1)", "campo_futebol", T_Q + ["futebol", "grama", "2x1"],
     p_campo_futebol, {}),
    ("quadra_tenis_saibro", "Quadra de tênis de saibro com rede e cadeira de juiz (2 × 1)", "quadra_tenis",
     T_Q + ["tenis", "saibro", "rede", "2x1"], p_quadra_tenis, {}),
    ("quadra_tenis_rapida", "Quadra de tênis rápida (azul) com rede e cadeira de juiz (2 × 1)", "quadra_tenis",
     T_Q + ["tenis", "rede", "2x1"], lambda it: p_quadra_tenis(it, piso="verde_medio", quadra="azul",
                                                              poste="azul_marinho", cadeira="azul_marinho"), {}),
    ("quadra_volei_areia", "Quadra de vôlei de areia com rede", "quadra_volei_areia",
     T_Q + ["volei", "areia", "praia", "rede", "1x1"], p_quadra_volei_areia, {}),
    ("quadra_poliesportiva", "Quadra poliesportiva com gols e tabelas (2 × 1)", "quadra_poliesportiva",
     T_Q + ["futsal", "basquete", "volei", "2x1"], p_quadra_poliesportiva, {}),
    # equipamentos
    ("tabela_basquete", "Tabela de basquete portátil com rede", "tabela_basquete", ["esporte", "basquete", "tabela"],
     p_tabela_basquete, {}),
    ("tabela_basquete_rua", "Tabela de basquete de rua (poste curvo, rede de corrente)", "tabela_basquete",
     ["esporte", "basquete", "tabela", "rua"], p_tabela_basquete_rua, {}),
    ("trave_gol", "Trave de gol com rede (society)", "trave_gol", ["esporte", "futebol", "gol", "rede"], p_trave_gol, {}),
    ("trave_gol_futsal", "Trave de gol de futsal listrada com rede", "trave_gol", ["esporte", "futsal", "gol", "rede"],
     p_trave_futsal, {}),
    ("torre_refletores", "Torre de refletores de estádio", "torre_refletores", ["esporte", "estadio", "luz", "poste"],
     p_torre_refletores, {}),
    ("placar_eletronico", "Placar eletrônico (troca o placar)", "placar_eletronico",
     ["esporte", "placar", "led", "animado", "letreiro"], p_placar, {}),
    ("arquibancada_reta", "Arquibancada reta (módulo de 24 lugares)", "arquibancada",
     ["esporte", "arquibancada", "assentos", "modular"], p_arquibancada_reta, {}),
    ("arquibancada_curva", "Arquibancada curva (módulo de 30°)", "arquibancada",
     ["esporte", "arquibancada", "assentos", "modular", "curva"], p_arquibancada_curva, {}),
    ("banco_reservas_coberto", "Banco de reservas coberto", "banco_reservas", ["esporte", "banco", "assentos"],
     p_banco_reservas, {}),
    # skate
    ("skate_half_pipe", "Half-pipe grande", "skate_half_pipe", T_SK + ["half_pipe"], p_half_pipe, {}),
    ("skate_quarter_pipe", "Quarter-pipe", "skate_quarter_pipe", T_SK + ["quarter_pipe"], p_quarter_pipe, {}),
    ("skate_funbox", "Funbox (pirâmide) com corrimão", "skate_funbox", T_SK + ["funbox", "piramide"], p_funbox, {}),
    ("skate_rampa_salto", "Rampa de salto (kicker)", "skate_rampa_salto", T_SK + ["kicker"], p_rampa_salto, {}),
    ("skate_corrimao", "Corrimão de skate", "skate_obstaculo", T_SK + ["corrimao"], p_corrimao_skate, {}),
    ("skate_banco", "Banco de skate (ledge)", "skate_obstaculo", T_SK + ["banco", "ledge"], p_banco_skate, {}),
    ("skate_caixote", "Caixote de skate", "skate_obstaculo", T_SK + ["caixote"], p_caixote_skate, {}),
    # academia
    ("academia_barras", "Barras fixas (academia ao ar livre)", "academia", T_AC + ["barras"], p_barras, {}),
    ("academia_paralelas", "Barras paralelas (academia ao ar livre)", "academia", T_AC + ["paralelas"], p_paralelas, {}),
    ("academia_abdominal", "Banco de abdominal (academia ao ar livre)", "academia", T_AC + ["abdominal"],
     p_banco_abdominal, {}),
    ("academia_bicicleta", "Bicicleta ergométrica (academia ao ar livre)", "academia", T_AC + ["bicicleta", "animado"],
     p_bicicleta, {}),
    ("academia_caminhada", "Simulador de caminhada (academia ao ar livre)", "academia", T_AC + ["caminhada", "animado"],
     p_simulador_caminhada, {}),
    ("academia_flexao", "Estação de flexão (academia ao ar livre)", "academia", T_AC + ["flexao"], p_barra_flexao, {}),
    # praça e clube
    ("mesa_pingue_pongue", "Mesa de pingue-pongue de concreto", "mesa_pingue_pongue", ["esporte", "praca", "mesa"],
     p_pingue_pongue, {}),
    ("mesa_xadrez_praca", "Mesa de xadrez de praça com bancos", "mesa_xadrez", ["esporte", "praca", "mesa", "xadrez",
                                                                                  "assentos"], p_mesa_xadrez, {}),
    ("bebedouro_esportivo", "Bebedouro esportivo com enchedor de garrafa", "bebedouro_esportivo",
     ["esporte", "praca", "agua", "luz"], p_bebedouro, {}),
    ("bicicletario_clube", "Bicicletário de clube coberto", "bicicletario_clube", ["esporte", "clube", "bicicleta",
                                                                                     "luz"], p_bicicletario_clube, {}),
]


def gera(saida, sel):
    global SAIDA
    SAIDA = saida
    import props_esporte_estampas as pe
    pasta_est = os.path.join(saida, CAT, "estampas")
    if not os.path.isdir(pasta_est) or len(os.listdir(pasta_est)) < 2:
        pe.desenha_tudo(pasta_est)
    cat = mb.Catalogo(CAT, saida, rotulo="Props: esporte")
    for id_, rot, grupo, tags, f, op in PECAS:
        if sel and id_ not in sel and grupo not in sel:
            continue
        mb.limpa()
        eb.zera_camadas()
        it = ItemE(id_)
        r = f(it) or {}
        op = dict(op, **r)
        plana = op.get("plana", False)
        vis = [o for o in it.partes if o.type == "MESH" and o not in getattr(it, "malhas_colisao", [])]
        lo, hi = mb.bbox(vis + [o for o, _ in it.interativos] + [o for o, _ in it.animados])
        if not plana and lo.z < -0.002:
            print("aviso: abaixo do chao", id_, round(lo.z, 4), flush=True)
        exporta(cat, it, rot, grupo, tags, mini=op.get("mini", cb.DIR_TOPO if plana else DIR_ALTO), col=op.get("col"),
                extra=op.get("extra"))
    ordem = {p[0]: k for k, p in enumerate(PECAS)}
    cat.dados["itens"] = [e for e in cat.dados["itens"] if e["id"] in ordem]
    cat.dados["itens"].sort(key=lambda e: ordem.get(e["id"], 999))
    cat.salva()


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:]
    gera(args[0], args[1:])
