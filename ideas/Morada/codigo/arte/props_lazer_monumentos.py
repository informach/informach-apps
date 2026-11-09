"""Portais, arcos, estátuas, chafarizes e espelho d'água da categoria props_lazer. Usado por cidade_props_lazer.py."""
import math

import bpy  # noqa: F401
from mathutils import Quaternion, Vector

import moveis_base as mb
from props_lazer_base import (Blob, jato as jato_agua, Malha, arbusto, bola, cil, cx, decal, esf, flores, gira_z, girar, haste,
                              lampadas, mover, pedestal, placa_estampa, prisma, uniformes, varre)

V = Vector
EST = None


def _lamp_grupos(it, pts, nome, periodo=1.0, r=0.07, mat="luz"):
    """Lâmpadas em dois grupos alternados (piscam em contratempo à noite)."""
    a = lampadas(pts[0::2], r=r, mat=mat)
    b = lampadas(pts[1::2], r=r, mat=mat)
    it.anima(a, {"anima": "piscar", "periodo": periodo}, nome + "_a", pivo=(0, 0, 0))
    it.anima(b, {"anima": "piscar", "periodo": periodo, "fase": periodo / 2}, nome + "_b", pivo=(0, 0, 0))


# =====================================================================================================================
# Portal do zoológico
# =====================================================================================================================
def _letra_z(cx_, z0, w, h, y):
    return [(cx_ - w / 2, y, z0 + h), (cx_ + w / 2, y, z0 + h), (cx_ - w / 2, y, z0), (cx_ + w / 2, y, z0)]


def _letra_o(cx_, z0, w, h, y, n=28):
    return [(cx_ + w / 2 * math.cos(2 * math.pi * k / n), y, z0 + h / 2 + h / 2 * math.sin(2 * math.pi * k / n))
            for k in range(n)]


def p_portal_zoo(it):
    px, hp = 3.45, 4.4
    ps = []
    for s in (-1, 1):
        x = s * px
        ps += [cx(1.85, 1.6, 0.42, x=x, cor="laranja_escuro", bisel=0.08),
               mb.superelipsoide(1.55, 1.35, hp - 0.3, x=x, z=0.3, cor="laranja", e=0.25, e_v=0.18, nu=16, nv=6),
               mb.superelipsoide(1.62, 1.42, 0.3, x=x, z=1.35, cor="amarelo", e=0.25, e_v=0.4, nu=16, nv=2),
               mb.superelipsoide(1.62, 1.42, 0.3, x=x, z=2.75, cor="amarelo", e=0.25, e_v=0.4, nu=16, nv=2),
               mb.superelipsoide(1.8, 1.6, 0.36, x=x, z=hp - 0.05, cor="laranja_escuro", e=0.3, e_v=0.45, nu=16, nv=4)]
        # folhas em leque no alto do pilar
        # coroa de folhas de palmeira caindo para fora
        for k in range(7):
            f = mb.superelipsoide(0.5, 0.12, 1.75, z=0, cor=("folha", "folha_clara")[k % 2], e=0.9, e_v=0.7,
                                  nu=8, nv=5)
            girar(f, "X", 0)
            girar(f, "Y", 62 + 8 * (k % 2))
            gira_z(f, 360 * k / 7 + 15)
            mover(f, x, 0, hp + 0.3)
            ps.append(f)
        ps.append(esf(0.32, x=x, z=hp + 0.42, cor="folha_escura", seg=12, esc=(1, 1, 0.8)))
        for j in range(3):
            a = math.radians(120 * j + 30)
            ps.append(esf(0.13, x=x + 0.22 * math.cos(a), y=0.22 * math.sin(a), z=hp + 0.3, cor="marrom", seg=10))
        # pegadas pintadas na frente do pilar
        for k, (dx, dz) in enumerate(((-0.2, 0.75), (0.18, 2.05), (-0.15, 3.45))):
            pe = [cil(0.13, 0.03, x=x + dx, y=-0.685, z=dz, cor="laranja_escuro", seg=10, eixo="y")]
            for j in range(4):
                a = math.radians(50 + 27 * j)
                pe.append(cil(0.05, 0.03, x=x + dx + 0.19 * math.cos(a), y=-0.685, z=dz + 0.16 * math.sin(a),
                              cor="laranja_escuro", seg=6, eixo="y"))
            ps.append(mb.junta(pe, "pegada"))
    it.add(mb.junta(ps, "pilares"))
    # arco entre os pilares
    ax, bz, z0 = 2.45, 1.45, 3.0
    cam = [(ax * math.cos(math.radians(a)), 0.0, z0 + bz * math.sin(math.radians(a))) for a in range(0, 181, 6)]
    perfil = [(-0.3, -0.42), (0.3, -0.42), (0.3, 0.42), (-0.3, 0.42)]
    it.add(varre(cam, perfil, ["chocolate", "marrom", "chocolate", "marrom"], normal_z=False, nome="arco"))
    it.add(varre([(p[0] * 1.0, -0.43, p[2]) for p in cam], [(-0.33, -0.03), (0.33, -0.03), (0.33, 0.03),
                                                             (-0.33, 0.03)], "amarelo_escuro", normal_z=False,
                 nome="friso"))
    # letreiro ZOO: placa de fundo e letras gordas de tubo com lâmpadas
    zl = 4.85
    it.add(mb.superelipsoide(4.6, 0.34, 2.05, y=0.08, z=zl - 0.25, cor="verde_agua", e=0.3, e_v=0.35, nu=24, nv=10))
    it.add(mb.superelipsoide(4.9, 0.3, 2.3, y=0.2, z=zl - 0.38, cor="verde_escuro", e=0.3, e_v=0.35, nu=24, nv=10))
    hl, wl, yl = 1.35, 1.0, -0.2
    letras = [_letra_z(-1.3, zl, wl, hl, yl), _letra_o(0.0, zl, wl, hl, yl), _letra_o(1.3, zl, wl, hl, yl)]
    lt = [mb.tubo(letras[0], 0.17, cor="amarelo", raio_curva=0.06, seg=12),
          mb.tubo(letras[1] + letras[1][:1], 0.17, cor="amarelo", raio_curva=0.0, seg=12),
          mb.tubo(letras[2] + letras[2][:1], 0.17, cor="amarelo", raio_curva=0.0, seg=12)]
    it.add(mb.junta(lt, "letras"))
    bul = []
    for k, L in enumerate(letras):
        pts = uniformes(L, 7 if k == 0 else 10, fechado=k > 0)
        bul += [(p[0], p[1] - 0.17, p[2]) for p in pts]
    it.anima(lampadas(bul, r=0.08), {"anima": "piscar", "periodo": 1.6}, "letreiro_zoo", pivo=(0, 0, zl))
    # lâmpadas na frente do arco e na borda de dentro dos pilares
    arco_l = [(ax * math.cos(math.radians(a)), -0.45, z0 + bz * math.sin(math.radians(a))) for a in range(4, 180, 9)]
    arco_l += [(s * (px - 0.66), -0.62, z) for s in (-1, 1) for z in (0.75, 1.15, 1.95, 2.35, 3.15, 3.55)]
    _lamp_grupos(it, arco_l, "luzes_arco", periodo=0.9, r=0.1)
    return {"col": [((-px, 0, 0), (1.85, 1.6, hp + 0.3)), ((px, 0, 0), (1.85, 1.6, hp + 0.3)),
                    ((0, 0, 3.4), (5.1, 0.9, zl + 1.6 - 3.4))], "mini": (0.55, -1.0, 0.45)}


# =====================================================================================================================
# Portal oriental vermelho
# =====================================================================================================================
def p_portal_oriental(it):
    xc, hc = 2.35, 4.25
    ps = []
    for s in (-1, 1):
        x = s * xc
        ps += [cx(0.95, 0.95, 0.32, x=x, cor="concreto_escuro", bisel=0.06),
               cx(0.75, 0.75, 0.14, x=x, z=0.3, cor="concreto", bisel=0.04),
               cil(0.27, hc, x=x, z=0.4, cor="vermelho", seg=16, r2=0.24),
               cil(0.31, 0.5, x=x, z=0.42, cor="preto", seg=16, bisel=0.02),
               cil(0.29, 0.08, x=x, z=0.92, cor="ouro", seg=16, bisel=0.01),
               cil(0.27, 0.1, x=x, z=hc + 0.2, cor="ouro", seg=16, bisel=0.01)]
    # viga de amarração (nuki) atravessando as colunas
    zn = 3.35
    ps.append(cx(6.1, 0.3, 0.38, z=zn, cor="vermelho", bisel=0.05))
    for s in (-1, 1):
        ps.append(cx(0.08, 0.34, 0.42, x=s * 3.0, z=zn - 0.02, cor="ouro", bisel=0.02))
    # viga de cima reta e chapéu curvo com as pontas viradas para cima
    zs = hc + 0.3
    ps.append(cx(6.6, 0.42, 0.34, z=zs, cor="vermelho", bisel=0.05))
    cam = [(x, 0.0, zs + 0.48 + 0.32 * (abs(x) / 3.75) ** 3.5) for x in [3.75 * (k / 16 - 1) * 1.0
                                                                          for k in range(33)]]
    cam = [(p[0], 0.0, p[2]) for p in cam]
    ps.append(varre(cam, [(-0.28, -0.16), (0.28, -0.16), (0.28, 0.12), (-0.28, 0.12)], "vermelho_escuro",
                    normal_z=False, nome="kasagi"))
    ps.append(varre([(p[0] * 1.03, 0.0, p[2] + 0.2) for p in cam],
                    [(-0.34, -0.08), (0.34, -0.08), (0.24, 0.14), (-0.24, 0.14)], "verde_escuro", normal_z=False,
                    nome="telhado"))
    for s in (-1, 1):
        ps.append(esf(0.1, x=s * 3.9, z=cam[0][2] + 0.24, cor="ouro", seg=10))
    # pilarete central com o emblema
    ps.append(cx(0.42, 0.26, zs - zn - 0.36, z=zn + 0.37, cor="vermelho_escuro", bisel=0.03))
    ps.append(cx(0.86, 0.12, 0.98, z=zn + 0.42, y=-0.06, cor="ouro", bisel=0.03))
    it.add(mb.junta(ps, "portal"))
    if EST:
        it.add(placa_estampa(EST("emblema_flor"), 0.74, 0.86, 0, -0.125, zn + 0.91, nome="emblema"))
    # duas lanternas penduradas na viga de baixo (balançam de leve; acesas à noite)
    for k, s in enumerate((-1, 1)):
        x = s * 1.25
        lz = zn - 0.95
        lan = [haste((x, 0, zn), (x, 0, lz + 0.72), 0.012, "preto", 4),
               cil(0.13, 0.08, x=x, z=lz + 0.62, cor="ouro", seg=10),
               mb.superelipsoide(0.5, 0.5, 0.6, x=x, z=lz + 0.04, cor=None, mat="luz_vermelha", e=0.9, e_v=0.75,
                                 nu=14, nv=8),
               cil(0.13, 0.08, x=x, z=lz, cor="ouro", seg=10),
               haste((x, 0, lz), (x, 0, lz - 0.28), 0.03, "ouro", 6, r2=0.06)]
        it.anima(lan, {"anima": "balancar", "angulo": 6, "periodo": 3.2 + 0.4 * k, "eixo": "x"}, f"lanterna_{k + 1}",
                 pivo=(x, 0, zn))
    return {"col": [((-xc, 0, 0), (0.95, 0.95, hc + 0.5)), ((xc, 0, 0), (0.95, 0.95, hc + 0.5)),
                    ((0, 0, zn), (6.6, 0.6, zs + 1.2 - zn))], "mini": (0.55, -1.0, 0.4)}


# =====================================================================================================================
# Arcos de praça
# =====================================================================================================================
def p_arco_metal(it):
    R1, R2, zc = 3.85, 3.3, 0.45
    ps = []
    for R in (R1, R2):
        cam = [(R * math.cos(math.radians(a)), 0.0, zc + R * math.sin(math.radians(a))) for a in range(0, 181, 5)]
        ps.append(varre(cam, [(-0.08, -0.17), (0.08, -0.17), (0.08, 0.17), (-0.08, 0.17)], "vermelho",
                        normal_z=False, nome="trilho"))
    for a in range(5, 180, 7):
        c, s = math.cos(math.radians(a)), math.sin(math.radians(a))
        for yy in (-0.12, 0.12):
            ps.append(haste((R2 * c, yy, zc + R2 * s), (R1 * c, yy, zc + R1 * s), 0.04, "vermelho_escuro", 6))
    # sapatas de concreto branco (troncos de pirâmide)
    for sx in (-1, 1):
        x = sx * (R1 + R2) / 2
        m = Malha()
        b, t, h = 0.62, 0.38, 0.75
        vb = [m.v((x + i * b, j * 0.55, 0)) for i, j in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        vt = [m.v((x + i * t, j * 0.42, h)) for i, j in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        for k in range(4):
            m.f((vb[k], vb[(k + 1) % 4], vt[(k + 1) % 4], vt[k]), "branco")
        m.f(vt, "branco_gelo")
        ps.append(m.obj("sapata", normais=True))
        ps.append(cx(1.4, 1.2, 0.06, x=x, cor="concreto", bisel=0.02))
        ps.append(cx(0.5, 0.06, 0.08, x=x, y=-0.48, z=0.3, cor="vermelho", bisel=0.01))
    it.add(mb.junta(ps, "arco"))
    pts = [(R1 * math.cos(math.radians(a)) * 1.03, 0, zc + R1 * math.sin(math.radians(a)) * 1.03)
           for a in range(10, 171, 8)]
    it.add(lampadas(pts, r=0.07))
    for a in range(10, 171, 8):
        c, s = math.cos(math.radians(a)), math.sin(math.radians(a))
        it.add(cil(0.04, 0.06, x=R1 * 1.012 * c, z=zc + R1 * 1.012 * s, cor="grafite", seg=6))
    return {"col": [((-(R1 + R2) / 2, 0, 0), (1.3, 1.2, 1.4)), ((( R1 + R2) / 2, 0, 0), (1.3, 1.2, 1.4)),
                    ((0, 0, 1.4), (2 * R1 + 0.2, 0.4, R1 + zc - 1.2))], "mini": (0.55, -1.0, 0.4)}


def p_arco_tijolo(it):
    xp, lp, hp, prof = 2.0, 0.9, 2.75, 0.7
    ps = []
    for s in (-1, 1):
        x = s * xp
        ps += [cx(lp + 0.22, prof + 0.22, 0.32, x=x, cor="concreto", bisel=0.04),
               cx(lp, prof, hp - 0.32, x=x, z=0.32, cor="tijolo", bisel=0.03)]
        # fiadas de destaque nos cantos (cunhais alternados)
        for k in range(6):
            z = 0.42 + k * 0.38
            w = 0.34 if k % 2 == 0 else 0.22
            for sx in (-1, 1):
                ps.append(cx(w, prof + 0.03, 0.16, x=x + sx * (lp / 2 - w / 2 + 0.015), z=z, cor="terracota_clara",
                             bisel=0.02))
        ps.append(cx(lp + 0.16, prof + 0.16, 0.14, x=x, z=hp - 0.14, cor="concreto", bisel=0.03))
    # aduelas do arco (alternadas) e pedra de fecho
    zc, r0, r1 = hp, xp - lp / 2, xp + lp / 2
    n = 13
    for k in range(n):
        a0, a1 = math.pi * k / n + 0.006, math.pi * (k + 1) / n - 0.006
        fecho = k == n // 2
        e = 0.12 if fecho else 0.0
        pts = [(r0 * math.cos(a0) - 0, zc + r0 * math.sin(a0)), (r1 * math.cos(a0), zc + (r1 + e) * math.sin(a0)),
               (r1 * math.cos(a1), zc + (r1 + e) * math.sin(a1)), (r0 * math.cos(a1), zc + r0 * math.sin(a1))]
        if fecho:
            pts = [(r0 * math.cos(a0), zc + r0 * math.sin(a0) - 0.06), ((r1 + e) * math.cos(a0), zc + (r1 + e)),
                   ((r1 + e) * math.cos(a1), zc + (r1 + e)), (r0 * math.cos(a1), zc + r0 * math.sin(a1) - 0.06)]
        d = prof + (0.08 if fecho else 0.0)
        cor = "concreto" if fecho else ("tijolo" if k % 2 == 0 else "terracota_clara")
        ps.append(mb.extrudado(pts if _ccw2(pts) else pts[::-1], d, y=-d / 2, cor=cor, bisel=0.02, seg=1,
                               plano="xz"))
    it.add(mb.junta(ps, "arco"))
    # lanternas de parede na frente dos pilares e floreiras
    for s in (-1, 1):
        x = s * xp
        y = -prof / 2
        lan = [cx(0.12, 0.12, 0.08, x=x, y=y - 0.05, z=2.0, cor="grafite", bisel=0.02),
               haste((x, y - 0.06, 2.04), (x, y - 0.26, 2.04), 0.02, "grafite", 6),
               cil(0.11, 0.04, x=x, y=y - 0.3, z=1.82, cor="grafite", seg=6),
               cil(0.085, 0.3, x=x, y=y - 0.3, z=1.86, r2=0.1, cor=None, mat="luz", seg=6),
               cil(0.15, 0.12, x=x, y=y - 0.3, z=2.16, r2=0.03, cor="grafite", seg=6),
               bola(0.03, x, y - 0.3, 2.3, cor="grafite", sub=0)]
        it.add(mb.junta(lan, "lanterna"))
        fx = s * (xp + 1.05)
        it.add(cx(0.95, 0.55, 0.45, x=fx, cor="tijolo", bisel=0.04), cx(1.0, 0.6, 0.06, x=fx, z=0.45, cor="concreto",
                                                                           bisel=0.02),
               arbusto(fx - 0.2, 0, r=0.3, cor="folha", z=0.45, alt=0.45),
               arbusto(fx + 0.22, 0.02, r=0.26, cor="folha_escura", z=0.45, alt=0.4),
               flores(fx, -0.12, ("rosa", "branco", "amarelo"), z=0.47, n=5, alt=0.12))
    return {"col": [((-xp, 0, 0), (lp + 0.22, prof + 0.22, hp)), ((xp, 0, 0), (lp + 0.22, prof + 0.22, hp)),
                    ((0, 0, hp), (2 * r1, prof, r1 + 0.15)), ((0, 0, 0), (2 * xp + 2.1 + 1.0, 0.6, 0.5))],
            "mini": (0.55, -1.0, 0.4)}


def _ccw2(pts):
    return sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(pts, pts[1:] + pts[:1])) > 0


# =====================================================================================================================
# Estátuas (metaballs) em pedestal
# =====================================================================================================================
def _desloca(ob, x=0.0, y=0.0, z=0.0, esc=1.0):
    from mathutils import Matrix
    ob.data.transform(Matrix.Translation((x, y, z)) @ Matrix.Diagonal((esc, esc, esc, 1)))
    return ob


def p_estatua_leao(it):
    b = Blob()
    # corpo deitado (esfinge), peito, ancas
    b.elipse((0, 0.2, 0.44), 0.42, (0.86, 1.75, 0.85))
    b.bola((0, -0.32, 0.52), 0.37)
    for s in (-1, 1):
        b.bola((s * 0.26, 0.62, 0.36), 0.31)
        b.elipse((s * 0.38, 0.42, 0.15), 0.15, (1.0, 2.3, 0.8))       # pata de trás dobrada
        b.cadeia([(s * 0.25, -0.25, 0.32), (s * 0.25, -0.62, 0.13), (s * 0.25, -0.86, 0.1)], [0.13, 0.1, 0.1])
        b.elipse((s * 0.25, -0.92, 0.09), 0.12, (1.0, 1.35, 0.7))    # pata da frente
    # cabeça, focinho, orelhas e cauda no corpo; a juba é uma escultura à parte, de tom mais escuro
    b.bola((0, -0.74, 1.0), 0.3)
    b.elipse((0, -0.98, 0.9), 0.16, (1.35, 1.0, 0.8))
    b.bola((0, -1.1, 0.96), 0.065)
    for s in (-1, 1):
        b.bola((s * 0.1, -0.97, 1.09), 0.055)                        # sobrancelhas
        b.bola((s * 0.09, -1.06, 0.84), 0.07)                         # bochechas do focinho
    b.cadeia([(0.12, 0.88, 0.3), (0.45, 1.05, 0.13), (0.72, 0.8, 0.08)], [0.06, 0.05, 0.045])
    leao = b.malha("latao", tris=2000, nome="leao")
    j = Blob()
    j.bola((0, -0.46, 1.02), 0.4)
    for k in range(12):
        a = math.radians(30 * k)
        j.bola((0.4 * math.cos(a), -0.6 + 0.04 * math.sin(a), 1.0 + 0.4 * math.sin(a)), 0.16)
    for k in range(5):
        a = math.radians(-60 + 30 * k)
        j.bola((0.3 * math.cos(a + math.pi / 2) * 1.2, -0.3, 0.72 + 0.12 * k), 0.14)
    for s in (-1, 1):
        j.bola((s * 0.24, -0.66, 1.33), 0.085)                         # orelhas saindo da juba
    j.bola((0.78, 0.7, 0.1), 0.11)                                     # tufo da cauda
    juba = j.malha("ouro_escuro", tris=1400, nome="juba")
    _desloca(juba, 0, -0.02, 1.25)
    it.add(juba)
    hp = 1.25
    _desloca(leao, 0, -0.02, hp)
    it.add(leao, pedestal("retangular", l=2.3, h=hp, cor="cinza_claro", cor2="cinza"))
    for s in (-1, 1):
        it.add(cx(0.18, 0.18, 0.1, x=s * 1.15, y=-1.25, cor="grafite", bisel=0.03),
               cx(0.13, 0.04, 0.1, x=s * 1.15, y=-1.32, z=0.04, cor=None, mat="luz", bisel=0.01))
    return {"col": [((0, 0, 0), (2.7, 1.83, hp)), ((0, -0.05, hp), (1.1, 2.2, 1.45))], "mini": (0.6, -1.0, 0.4)}


def p_estatua_cavaleiro(it):
    b = Blob()
    # cavalo (frente −Y), pata da frente esquerda erguida
    b.elipse((0, 0.08, 1.05), 0.36, (0.88, 2.0, 1.0))
    b.bola((0, -0.52, 1.07), 0.36)
    b.bola((0, 0.68, 1.1), 0.37)
    b.cadeia([(0, -0.6, 1.28), (0, -0.82, 1.72)], [0.24, 0.16])
    b.cadeia([(0, -0.48, 1.45), (0, -0.74, 1.94)], [0.07, 0.06])     # crina
    b.osso((0, -0.86, 1.85), (0, -1.18, 1.52), 0.15)
    b.bola((0, -1.22, 1.47), 0.135)
    for s in (-1, 1):
        b.osso((s * 0.07, -0.84, 1.98), (s * 0.09, -0.8, 2.12), 0.04)
    b.cadeia([(0.2, -0.5, 0.85), (0.2, -0.53, 0.45), (0.2, -0.5, 0.09)], [0.13, 0.075, 0.075])
    b.elipse((0.2, -0.52, 0.06), 0.09, (1, 1.2, 0.7))
    b.cadeia([(-0.2, -0.5, 0.85), (-0.2, -0.82, 0.68), (-0.2, -0.76, 0.42)], [0.13, 0.075, 0.07])
    b.bola((-0.2, -0.78, 0.38), 0.085)
    for s in (-1, 1):
        b.cadeia([(s * 0.2, 0.74, 0.9), (s * 0.2, 0.86, 0.5), (s * 0.2, 0.74, 0.09)], [0.15, 0.085, 0.075])
        b.elipse((s * 0.2, 0.74, 0.06), 0.09, (1, 1.2, 0.7))
    b.cadeia([(0, 0.98, 1.18), (0, 1.2, 0.88), (0, 1.16, 0.45)], [0.08, 0.07, 0.05])
    # cavaleiro com capa, braço direito erguido
    b.elipse((0, 0.05, 1.42), 0.22, (1.3, 1.1, 0.5))                # sela
    b.osso((0, 0.03, 1.58), (0, -0.02, 2.05), 0.17)
    b.bola((0, -0.04, 2.33), 0.15)
    b.elipse((0, -0.04, 2.46), 0.12, (1.4, 1.4, 0.45))              # chapéu
    for s in (-1, 1):
        b.osso((s * 0.18, 0.04, 1.52), (s * 0.32, -0.22, 1.36), 0.09)
        b.osso((s * 0.32, -0.22, 1.36), (s * 0.31, -0.12, 0.98), 0.075)
        b.elipse((s * 0.31, -0.18, 0.93), 0.07, (1, 1.6, 0.8))
    b.cadeia([(0.2, 0.0, 1.98), (0.33, -0.22, 2.26), (0.38, -0.32, 2.6)], [0.07, 0.06, 0.055])
    b.bola((0.39, -0.34, 2.68), 0.075)
    b.cadeia([(-0.2, 0.0, 1.98), (-0.2, -0.3, 1.76), (-0.06, -0.52, 1.64)], [0.07, 0.06, 0.055])
    b.elipse((0, 0.22, 1.82), 0.19, (1.5, 0.45, 1.7))                # capa
    cav = b.malha("turquesa_escuro", tris=3000, nome="cavaleiro")
    hp = 1.55
    _desloca(cav, 0, -0.12, hp)
    it.add(cav, pedestal("retangular", l=2.0, h=hp, cor="cinza", cor2="cinza_medio"))
    return {"col": [((0, 0, 0), (2.4, 1.64, hp)), ((0, -0.12, hp), (0.8, 2.4, 2.75))], "mini": (0.75, -1.0, 0.4)}


def p_estatua_atleta(it):
    b = Blob()
    # corredor em plena passada, correndo para −X (de perfil para quem chega pela frente)
    b.osso((0, 0, 1.0), (-0.16, 0, 1.5), 0.15)
    b.bola((-0.13, 0, 1.43), 0.17)
    b.bola((0.0, 0, 1.0), 0.15)
    b.osso((-0.2, 0, 1.64), (-0.24, 0, 1.73), 0.07)                  # pescoço
    b.bola((-0.28, 0, 1.86), 0.13)
    # perna da frente (joelho alto) e de trás (impulso, pé no chão)
    b.cadeia([(0, 0.1, 0.98), (-0.4, 0.1, 0.86), (-0.43, 0.1, 0.45)], [0.1, 0.075, 0.06])
    b.elipse((-0.5, 0.1, 0.41), 0.06, (1.7, 0.9, 0.7))
    b.cadeia([(0.0, -0.1, 0.98), (0.27, -0.1, 0.58), (0.56, -0.1, 0.16)], [0.1, 0.075, 0.06])
    b.elipse((0.6, -0.1, 0.07), 0.06, (1.7, 0.9, 0.7))
    # braços em oposição
    b.cadeia([(-0.12, -0.2, 1.52), (-0.35, -0.23, 1.3), (-0.52, -0.21, 1.5)], [0.065, 0.055, 0.05])
    b.bola((-0.55, -0.2, 1.54), 0.06)
    b.cadeia([(-0.12, 0.2, 1.52), (0.14, 0.23, 1.3), (0.32, 0.21, 1.44)], [0.065, 0.055, 0.05])
    b.bola((0.35, 0.21, 1.46), 0.06)
    b.elipse((0.55, -0.1, 0.03), 0.12, (2.2, 1.6, 0.4))                # pedra do apoio
    atl = b.malha("verde_agua", tris=2600, nome="atleta")
    hp = 1.2
    _desloca(atl, 0, 0, hp, esc=1.18)
    it.add(atl, pedestal("oval", l=1.9, h=hp, cor="cinza_claro", cor2="cinza"))
    it.add(mb.superelipsoide(1.7, 1.05, 0.1, z=hp, cor="verde_escuro", e=0.6, e_v=0.4, nu=20, nv=4))
    return {"col": [((0, 0, 0), (2.2, 1.4, hp)), ((0, 0, hp), (1.6, 0.7, 2.3))], "mini": (0.45, -1.0, 0.35)}


def p_estatua_morada(it):
    """Figura própria do Morada: menina de vestido erguendo uma casinha dourada (o símbolo do jogo)."""
    b = Blob()
    for s in (-1, 1):
        b.osso((s * 0.08, 0.0, 0.06), (s * 0.08, 0.0, 0.5), 0.06)
        b.elipse((s * 0.08, -0.04, 0.05), 0.06, (1.0, 1.5, 0.7))
    b.elipse((0, 0, 0.68), 0.27, (1.05, 0.95, 0.85))
    b.elipse((0, 0, 0.55), 0.22, (1.35, 1.25, 0.55))                # barra do vestido
    b.osso((0, 0, 0.86), (0, 0, 1.22), 0.13)
    b.osso((0, 0, 1.27), (0, 0, 1.33), 0.055)
    b.bola((0, 0, 1.5), 0.17)
    for s in (-1, 1):
        b.bola((s * 0.16, 0.03, 1.6), 0.075)                           # coquinhos
        b.cadeia([(s * 0.14, 0, 1.25), (s * 0.26, -0.02, 1.52), (s * 0.2, -0.02, 1.82)], [0.05, 0.045, 0.042])
        b.bola((s * 0.18, -0.02, 1.86), 0.055)
    fig = b.malha("branco_gelo", tris=2200, nome="menina")
    k = 1.3
    hp = 1.05
    _desloca(fig, 0, 0, hp, esc=k)
    # casinha dourada sobre as mãos
    zc = hp + 1.9 * k
    casa = [cx(0.56, 0.44, 0.34, z=zc, cor="ouro", bisel=0.03)]
    m = Malha()
    w, d, h = 0.36, 0.28, 0.3
    vs = [m.v(p) for p in ((-w, -d, zc + 0.34), (w, -d, zc + 0.34), (0, -d, zc + 0.34 + h), (-w, d, zc + 0.34),
                           (w, d, zc + 0.34), (0, d, zc + 0.34 + h))]
    m.f((vs[0], vs[1], vs[2]), "ouro_escuro")
    m.f((vs[4], vs[3], vs[5]), "ouro_escuro")
    m.f((vs[1], vs[4], vs[5], vs[2]), "vermelho")
    m.f((vs[3], vs[0], vs[2], vs[5]), "vermelho")
    m.f((vs[0], vs[3], vs[4], vs[1]), "ouro_escuro")
    casa.append(m.obj("telhado", normais=True))
    casa += [cx(0.12, 0.02, 0.2, y=-0.225, z=zc, cor="madeira_escura", bisel=0.005),
             cx(0.12, 0.02, 0.1, x=0.17, y=-0.225, z=zc + 0.15, cor=None, mat="luz", bisel=0.005),
             cx(0.12, 0.02, 0.1, x=-0.17, y=-0.225, z=zc + 0.15, cor=None, mat="luz", bisel=0.005),
             cx(0.07, 0.07, 0.16, x=0.17, y=0.05, z=zc + 0.5, cor="ouro_escuro", bisel=0.01)]
    it.add(fig, mb.junta(casa, "casinha"))
    # pedestal redondo com canteiro de flores em volta e refletores
    it.add(pedestal("redondo", l=1.3, h=hp, cor="creme", cor2="bege", placa="ouro"))
    it.add(mb.torno([(1.2, 0), (1.4, 0), (1.42, 0.3), (1.36, 0.34), (1.2, 0.34)], cor="bege", seg=28))
    it.add(cil(1.22, 0.28, cor="terra", seg=28))
    for j in range(8):
        a = 2 * math.pi * j / 8 + 0.2
        it.add(flores(1.0 * math.cos(a), 1.0 * math.sin(a), (("rosa", "branco"), ("amarelo", "laranja"),
                                                           ("lilas", "branco"))[j % 3], z=0.28, n=4, alt=0.14))
    for j in range(3):
        a = math.radians(-90 + 120 * j)
        x, y = 1.1 * math.cos(a), 1.1 * math.sin(a)
        it.add(cx(0.16, 0.16, 0.1, x=x, y=y, z=0.28, cor="grafite", bisel=0.03),
               cx(0.12, 0.12, 0.02, x=x, y=y, z=0.38, cor=None, mat="luz", bisel=0.005))
    return {"col": [((0, 0, 0), (2.8, 2.8, 0.34)), ((0, 0, 0), (1.55, 1.55, hp + 2.4 * k))],
            "mini": (0.55, -1.0, 0.35)}


# =====================================================================================================================
# Chafarizes e espelho d'água
# =====================================================================================================================
def _uniao_circulos(circs, n=112, extra=0.0):
    """Contorno (polar, a partir da origem) da união de círculos [(cx, cy, r)], com os raios acrescidos de 'extra'."""
    pts = []
    for k in range(n):
        t = 2 * math.pi * k / n
        u = (math.cos(t), math.sin(t))
        best = 0.0
        for cx_, cy_, r in circs:
            r = r + extra
            uc = u[0] * cx_ + u[1] * cy_
            disc = uc * uc - (cx_ * cx_ + cy_ * cy_ - r * r)
            if disc >= 0:
                best = max(best, uc + math.sqrt(disc))
        pts.append((best * u[0], best * u[1]))
    return pts


def p_chafariz_lobulos(it):
    circs = [(0, 0, 2.05)] + [(2.35 * math.cos(math.radians(45 + 90 * k)), 2.35 * math.sin(math.radians(45 + 90 * k)),
                               1.05) for k in range(4)]
    dentro = _uniao_circulos(circs)
    fora = _uniao_circulos(circs, extra=0.38)
    za = 0.34
    it.add(prisma([fora, dentro], 0.0, 0.46, "branco", "branco_gelo", nome="borda"))
    it.add(prisma([_uniao_circulos(circs, extra=0.5), fora], 0.0, 0.08, "concreto", "concreto_escuro", nome="degrau"))
    it.add(decal(dentro, 0.03, "azul", nome="fundo"))
    it.add(decal(dentro, za, "branco", nome="agua"))
    it.partes[-1].data.polygons.foreach_set("material_index", [mb.MAT_NOMES.index("agua")] *
                                            len(it.partes[-1].data.polygons))
    # pedestal com duas taças (bordas amarelas) e coroa no alto
    it.add(mb.torno([(0, 0.02), (0.62, 0.02), (0.62, 0.3), (0.42, 0.42), (0.3, 0.8), (0.26, 1.1), (0, 1.1)],
                    cor="branco", seg=20))
    it.add(mb.torno([(0, 1.04), (0.24, 1.04), (1.2, 1.24), (1.32, 1.38), (1.27, 1.46), (1.12, 1.4), (0, 1.4)],
                    cor="branco", seg=24))
    it.add(mb.torno([(1.2, 1.3), (1.34, 1.36), (1.34, 1.46), (1.22, 1.46)], cor="amarelo_escuro", seg=24))
    it.add(cil(1.13, 0.01, z=1.39, cor=None, mat="agua", seg=24))
    it.add(mb.torno([(0, 1.36), (0.18, 1.36), (0.14, 1.95), (0.2, 2.02), (0, 2.02)], cor="branco", seg=14))
    it.add(mb.torno([(0, 1.98), (0.16, 1.98), (0.66, 2.12), (0.74, 2.24), (0.7, 2.3), (0.6, 2.26), (0, 2.26)],
                    cor="branco", seg=20))
    it.add(mb.torno([(0.62, 2.18), (0.76, 2.22), (0.76, 2.3), (0.64, 2.3)], cor="amarelo_escuro", seg=20))
    it.add(cil(0.61, 0.01, z=2.25, cor=None, mat="agua", seg=20))
    it.add(mb.torno([(0, 2.22), (0.1, 2.22), (0.08, 2.4), (0.15, 2.48), (0.12, 2.56), (0.0, 2.62)], cor="amarelo",
                    seg=12))
    # filetes d'água caindo das bordas das taças e jato do alto
    for rb, zb, zf, n in ((1.33, 1.42, za, 14), (0.75, 2.27, 1.39, 9)):
        for k in range(n):
            a = 2 * math.pi * (k + 0.5) / n
            c, s_ = math.cos(a), math.sin(a)
            pts = [(rb * c, rb * s_, zb), ((rb + 0.12) * c, (rb + 0.12) * s_, zb - 0.08),
                   ((rb + 0.2) * c, (rb + 0.2) * s_, zb - 0.3), ((rb + 0.24) * c, (rb + 0.24) * s_, zf)]
            it.add(mb.tubo(pts, 0.035, cor=None, mat="agua", raio_curva=0, seg=4))
    it.add(jato_agua(0, 0, 2.56, 0.75, r=0.05, espuma=0.11))
    # um jato em cada lóbulo: sobe e desce (afunda no fundo quando baixa)
    for k in range(4):
        a = math.radians(45 + 90 * k)
        x, y = 2.45 * math.cos(a), 2.45 * math.sin(a)
        it.add(cil(0.12, 0.06, x=x, y=y, z=0.03, cor="metal", seg=10, bisel=0.01))
        h = 1.25
        jato = jato_agua(x, y, 0.04, h, r=0.08, espuma=0.13)
        it.anima(jato, {"anima": "deslizar", "eixo": [0, -1, 0], "curso": 0.85, "periodo": 2.2 + 0.35 * k},
                 f"jato_{k + 1}", pivo=(x, y, 0.04))
    # luzes no fundo (acendem à noite)
    for k in range(8):
        a = math.radians(22.5 + 45 * k)
        r = 1.75 if k % 2 else 2.95
        lz = cx(0.22, 0.08, 0.05, z=0.03, cor=None, mat="luz", bisel=0.015)
        gira_z(lz, math.degrees(a) + 90)
        mover(lz, r * math.cos(a), r * math.sin(a))
        it.add(lz)
    R = max(math.hypot(*p) for p in fora)
    return {"col": [((0, 0, 0), (2 * R * 0.86, 2 * R * 0.86, 0.46)), ((0, 0, 0), (1.3, 1.3, 2.6))],
            "mini": (0.55, -1.0, 0.65)}


def p_chafariz_jatos(it):
    R = 3.7
    # piso emborrachado com anéis e um sol no meio (2 cm de altura, com rampinha na borda)
    it.add(mb.torno([(0, 0.0), (R + 0.25, 0.0), (R + 0.1, 0.04), (R, 0.045), (0, 0.045)], cor="azul_celeste", seg=48))
    for r0, r1, cor in ((R - 0.35, R - 0.15, "branco"), (2.75, 2.95, "amarelo"), (1.55, 1.75, "branco"),
                        (0.0, 0.85, "amarelo")):
        it.add(mb.torno([(r0, 0.046), (r1, 0.046), (r1, 0.05), (r0, 0.05)] if r0 > 0 else
                        [(0, 0.05), (r1, 0.05), (r1, 0.046)], cor=cor, seg=40))
    raios = []
    for k in range(12):
        a = 2 * math.pi * k / 12
        c, s = math.cos(a), math.sin(a)
        nx, ny = -s, c
        pts = [(c * 0.95 + nx * 0.16, s * 0.95 + ny * 0.16), (c * 1.4, s * 1.4), (c * 0.95 - nx * 0.16,
                                                                                 s * 0.95 - ny * 0.16)]
        raios.append(decal(pts if _ccw2(pts) else pts[::-1], 0.049, "laranja", nome="raio"))
    it.add(mb.junta(raios, "sol"))
    # bocais e jatos em 3 grupos (centro, anel de dentro e anel de fora) que sobem e descem em ritmos diferentes
    grupos = [([(0.0, 0.0)], 1.9), ([(2.25 * math.cos(math.radians(90 + 72 * k)),
                                      2.25 * math.sin(math.radians(90 + 72 * k))) for k in range(5)], 1.3),
              ([(3.2 * math.cos(math.radians(22.5 + 45 * k)), 3.2 * math.sin(math.radians(22.5 + 45 * k)))
                for k in range(8)], 0.9)]
    for g, (pos, h) in enumerate(grupos):
        jatos = []
        for x, y in pos:
            it.add(mb.torno([(0, 0.04), (0.12, 0.04), (0.1, 0.07), (0.05, 0.075), (0, 0.075)], x=x, y=y,
                            cor="metal_claro", seg=10))
            it.add(cil(0.06, 0.01, x=x, y=y, z=0.07, cor=None, mat="luz", seg=8))
            jatos += jato_agua(x, y, 0.07, h, r=0.06 + 0.02 * (g == 0), espuma=0.1 + 0.03 * (g == 0))
        it.anima(jatos, {"anima": "deslizar", "eixo": [0, -1, 0], "curso": h * 0.92, "periodo": (2.6, 1.8, 3.1)[g]},
                 ("jato_centro", "jatos_anel", "jatos_borda")[g], pivo=(0, 0, 0.07))
    # ralo e dois bancos de pedra baixos para os pais
    for k in range(4):
        a = math.radians(45 + 90 * k)
        it.add(cx(0.36, 0.06, 0.012, x=1.15 * math.cos(a), y=1.15 * math.sin(a), z=0.046, cor="grafite", bisel=0.0))
    return {"col": [((0, 0, 0), (2 * R, 2 * R, 0.05))], "mini": (0.55, -1.0, 0.85)}


def p_chafariz_globo(it):
    L, hb = 3.6, 0.5
    # tanque quadrado de cantos redondos com borda larga
    ext = mb.ret_arredondado(L, L, 0.6, seg=6)
    inn = mb.ret_arredondado(L - 0.6, L - 0.6, 0.35, seg=6)
    it.add(prisma([ext, inn], 0.0, hb, "piso_rosado", "terracota_clara", nome="tanque"))
    it.add(prisma([mb.ret_arredondado(L + 0.5, L + 0.5, 0.8, seg=6), ext], 0.0, 0.08, "concreto", "concreto_escuro",
                  nome="degrau"))
    it.add(decal(inn, 0.03, "azul_escuro", nome="fundo"))
    ag = decal(inn, hb - 0.12, "branco", nome="agua")
    ag.data.polygons.foreach_set("material_index", [mb.MAT_NOMES.index("agua")] * len(ag.data.polygons))
    it.add(ag)
    # taça de pedra, película d'água e o globo que gira (meridianos e linha do equador)
    it.add(mb.torno([(0, 0.02), (0.55, 0.02), (0.55, 0.2), (0.32, 0.32), (0.26, 0.62), (0.62, 0.86), (0.66, 0.92),
                     (0.0, 0.92)], cor="cinza_azulado", seg=24))
    it.add(mb.torno([(0.67, 0.92), (0.72, 0.8), (0.6, 0.45), (0.5, hb - 0.12), (0.45, hb - 0.12), (0.55, 0.45),
                     (0.64, 0.82), (0.6, 0.94)], cor=None, mat="agua", seg=24))
    R = 0.78
    zg = 0.92 + R * 0.82
    gl = esf(R, z=zg, cor="cinza_claro", seg=24)
    mb.pinta_onde(gl, "azul_acinzentado", lambda c, n: (math.degrees(math.atan2(c.y, c.x)) % 45) < 22.5)
    mb.pinta_onde(gl, "ouro", lambda c, n: abs(c.z - zg) < 0.06)
    it.anima([gl], {"anima": "girar", "eixo": "y", "velocidade": 24}, "globo", pivo=(0, 0, zg))
    # 4 jatos em arco dos cantos até o globo
    for k in range(4):
        a = math.radians(45 + 90 * k)
        c, s = math.cos(a), math.sin(a)
        r0 = (L / 2 - 0.3) * 1.25
        pts = []
        for j in range(9):
            t = j / 8
            rr = r0 + (R * 0.9 - r0) * t
            pts.append((rr * c, rr * s, hb - 0.05 + 1.3 * 4 * t * (1 - t) * 0.8 + (zg - hb) * t * 0.6))
        it.add(mb.tubo(pts, 0.035, cor=None, mat="agua", raio_curva=0, seg=6))
        it.add(cil(0.08, 0.1, x=r0 * c, y=r0 * s, z=hb - 0.14, cor="metal", seg=8))
        it.add(cx(0.22, 0.06, 0.05, x=r0 * c * 0.82, y=r0 * s * 0.82, z=0.03, cor=None, mat="luz", bisel=0.015))
    return {"col": [((0, 0, 0), (L, L, hb)), ((0, 0, 0), (1.6, 1.6, zg + R))], "mini": (0.55, -1.0, 0.6)}


def p_espelho_dagua(it):
    R = 4.2
    it.add(mb.torno([(R - 0.45, 0.0), (R + 0.05, 0.0), (R + 0.05, 0.36), (R + 0.1, 0.38), (R + 0.1, 0.44),
                     (R + 0.04, 0.47), (R - 0.48, 0.47), (R - 0.52, 0.44), (R - 0.52, 0.38), (R - 0.45, 0.36)],
                    cor="branco_gelo", seg=56))
    it.add(mb.torno([(R + 0.05, 0.0), (R + 0.45, 0.0), (R + 0.45, 0.05), (R + 0.05, 0.05)], cor="concreto", seg=56))
    it.add(cil(R - 0.44, 0.04, cor="azul_marinho", seg=56))
    it.add(cil(R - 0.46, 0.012, z=0.3, cor=None, mat="agua", seg=56))
    # luzes embutidas na parede de dentro e 3 vitórias-régias
    for k in range(10):
        a = 2 * math.pi * (k + 0.5) / 10
        lz = cx(0.22, 0.05, 0.08, z=0.16, cor=None, mat="luz", bisel=0.015)
        gira_z(lz, math.degrees(a) + 90)
        mover(lz, (R - 0.465) * math.cos(a), (R - 0.465) * math.sin(a))
        it.add(lz)
    for k, (x, y, r) in enumerate(((1.3, 0.8, 0.42), (1.75, 0.15, 0.3), (-1.6, -1.2, 0.36))):
        it.add(cil(r, 0.02, x=x, y=y, z=0.305, cor="folha", seg=14))
        if k == 0:
            it.add(esf(0.12, x=x + 0.08, y=y, z=0.35, cor="rosa", seg=10, esc=(1, 1, 0.7)))
    # assentos na borda (a mureta é banco)
    for k in range(8):
        a = 2 * math.pi * k / 8 - math.pi / 2
        it.assento(f"assento_{k + 1}", round((R - 0.22) * math.cos(a), 3), round((R - 0.22) * math.sin(a), 3), 0.47)
    return {"col": [((0, 0, 0), (2 * R + 0.2, 2 * R + 0.2, 0.47))], "mini": (0.55, -1.0, 0.75)}
