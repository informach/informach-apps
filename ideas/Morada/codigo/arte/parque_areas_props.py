"""Peças soltas da categoria parque_areas: tendas de circo, quiosques e bilheteria, chafariz, obelisco, arco de treliça,
coreto, banco e poste de praça. Usado por cidade_parque_areas.py."""
import math

import bpy  # noqa: F401
import numpy as np
from mathutils import Matrix, Vector

import moveis_base as mb
import cidade_base as cb
import parque_areas_base as pb
from parque_areas_base import Malha, arbusto, flores, mover, gira_z, banco, poste_praca

V = Vector


def caixa(*a, **k):
    """mb.caixa com bisel de 1 segmento (leve)."""
    k.setdefault("seg", 1)
    return mb.caixa(*a, **k)

EST = None


# =====================================================================================================================
# Tendas de circo
# =====================================================================================================================
def tenda_circo(it, R, hp, ht, n, cor1, cor2, cor_sanefa, cor_mastro="amarelo", placa=False, cordas=True,
                cupula=False, lampadas=True, nome="tenda"):
    """Tenda listrada: parede cilíndrica (listras verticais), teto côncavo até o mastro, sanefa de bicos na beirada,
    entrada com cortinas abertas na frente (−Y), bandeira no topo (balança) e lâmpadas na beirada (piscam)."""
    m = Malha()
    # parede (com o vão da entrada na frente)
    ang_porta = math.radians(16 if R > 3 else 22)
    paredes = []
    for k in range(n):
        a0, a1 = 2 * math.pi * k / n - math.pi / 2, 2 * math.pi * (k + 1) / n - math.pi / 2
        meio = (a0 + a1) / 2 + math.pi / 2
        meio = (meio + math.pi) % (2 * math.pi) - math.pi
        cor = cor1 if k % 2 == 0 else cor2
        porta = abs(meio) < ang_porta + 1e-6
        for j in range(2):
            b0 = a0 + (a1 - a0) * j / 2
            b1 = a0 + (a1 - a0) * (j + 1) / 2
            p0 = (R * math.cos(b0), R * math.sin(b0))
            p1 = (R * math.cos(b1), R * math.sin(b1))
            if porta:
                continue
            vs = [m.v((p0[0], p0[1], 0)), m.v((p1[0], p1[1], 0)), m.v((p1[0], p1[1], hp)), m.v((p0[0], p0[1], hp))]
            m.f(vs, cor)
            # face de dentro
            m.f(vs[::-1], "grafite_escuro")
    # teto côncavo: perfil r(t) de R a r0, z de hp a ht (tensionado)
    r0 = max(0.18, R * 0.06)
    nperf = 7
    perfil = []
    for j in range(nperf + 1):
        t = j / nperf
        rr = R + 0.12 - (R + 0.12 - r0) * t
        zz = hp + (ht - hp) * (t ** 1.55)
        perfil.append((rr, zz))
    aneis = []
    nseg = n * 2
    for j, (rr, zz) in enumerate(perfil):
        aneis.append([m.v((rr * math.cos(2 * math.pi * k / nseg - math.pi / 2),
                           rr * math.sin(2 * math.pi * k / nseg - math.pi / 2), zz)) for k in range(nseg)])
    for j in range(nperf):
        for k in range(nseg):
            k2 = (k + 1) % nseg
            cor = cor1 if (k // 2) % 2 == 0 else cor2
            vs = (aneis[j][k], aneis[j][k2], aneis[j + 1][k2], aneis[j + 1][k])
            m.f(vs, cor)
            m.f(vs[::-1], "grafite_escuro")
    tampa = m.v((0, 0, perfil[-1][1] + 0.02))
    for k in range(nseg):
        m.f((aneis[-1][k], aneis[-1][(k + 1) % nseg], tampa), cor_mastro)
    ob = m.obj(nome, liso=True, angulo=50)
    it.add(ob)
    # chão de dentro (escuro) e o mastro
    it.add(mb.cilindro(R - 0.05, 0.02, z=0.0, cor="madeira_escura", seg=n * 2, bisel=0.0))
    it.add(mb.cilindro(max(0.08, R * 0.025), ht + 0.9, z=0, cor=cor_mastro, seg=10, bisel=0.01))
    it.add(mb.esfera(max(0.14, R * 0.035), z=ht + 0.95, cor=cor_mastro, seg=12))
    # sanefa de bicos (meia-lua) logo abaixo da beirada
    sp = []
    nb = n * 2
    hs = 0.38 if R > 3 else 0.26
    for k in range(nb):
        a0 = 2 * math.pi * k / nb - math.pi / 2
        a1 = 2 * math.pi * (k + 1) / nb - math.pi / 2
        rr = R + 0.16
        pts = []
        for q in range(7):
            t = q / 6
            a = a0 + (a1 - a0) * t
            pts.append((rr * math.cos(a), rr * math.sin(a), hp + 0.02))
        fundo = [(rr * math.cos(a0 + (a1 - a0) * t), rr * math.sin(a0 + (a1 - a0) * t),
                  hp + 0.02 - hs * math.sin(math.pi * t) ** 0.7) for t in np.linspace(1, 0, 7)]
        mm = Malha()
        vs = [mm.v(p) for p in pts + fundo]
        cs = cor_sanefa if k % 2 == 0 else cor1
        mm.f(vs, cs)
        mm.f(vs[::-1], cs)
        sp.append(mm.obj("sanefa"))
    it.add(mb.junta(sp, "sanefa"))
    # entrada: pórtico listrado com cortinas abertas
    pw = R * math.sin(ang_porta) * 2 + 0.3
    yp = -R * math.cos(ang_porta)
    dep = 1.0 if R > 3 else 0.6
    hpt = hp * 0.95
    ent = []
    for sx in (-1, 1):
        ent.append(mb.cilindro(0.06, hpt + 0.4, x=sx * pw / 2, y=yp - dep, z=0, cor=cor_mastro, seg=8, bisel=0.01))
        cort = mb.superelipsoide(0.35, 0.22, hpt - 0.1, x=sx * (pw / 2 - 0.12), y=yp - dep + 0.15, z=0.05, cor=cor2,
                                 e=0.5, e_v=0.15, nu=10, nv=4)
        ent.append(cort)
        ent.append(mb.cilindro(0.05, 0.12, x=sx * (pw / 2 - 0.12), y=yp - dep + 0.05, z=hpt * 0.5, eixo="y",
                               cor=cor_sanefa, seg=8, bisel=0.01))
    mm = Malha()
    zt = hpt + 0.55
    pts = [(-pw / 2 - 0.15, hpt), (0, zt), (pw / 2 + 0.15, hpt)]
    frente = [mm.v((x, yp - dep - 0.05, z)) for x, z in pts]
    tras = [mm.v((x, yp + 0.35, z)) for x, z in pts]
    mm.f((frente[0], frente[1], tras[1], tras[0]), cor1)
    mm.f((frente[1], frente[2], tras[2], tras[1]), cor2)
    mm.f((tras[0], tras[1], frente[1], frente[0]), "grafite_escuro")
    mm.f((tras[1], tras[2], frente[2], frente[1]), "grafite_escuro")
    mm.f(frente[::-1], cor_sanefa)
    mm.f(frente, cor_sanefa)
    ent.append(mm.obj("toldo_entrada"))
    for sx in (-1, 1):
        ent.append(caixa(0.12, dep + 0.4, hpt, x=sx * (pw / 2 + 0.04), y=yp - dep / 2 + 0.15, z=0, cor=cor1,
                            bisel=0.03))
    it.add(mb.junta(ent, "entrada"))
    if placa and EST:
        mp = EST("circo", 1.1)
        it.add(caixa(2.4, 0.1, 0.8, x=0, y=yp - dep - 0.15, z=zt + 0.05, cor="amarelo", bisel=0.05))
        it.add(pb.placa_estampa(mp, 2.2, 0.66, 0, yp - dep - 0.21, zt + 0.45, normal=(0, -1, 0), nome="placa_circo"))
    # bandeira no topo (balança)
    zb = ht + 0.75
    pano = Malha()
    vs = [pano.v(p) for p in ((0.04, 0, zb), (0.04, 0, zb + 0.5), (0.85, 0, zb + 0.32), (0.75, 0, zb + 0.1))]
    pano.f(vs, cor_sanefa)
    pano.f(vs[::-1], cor_sanefa)
    it.anima([pano.obj("bandeira")], {"anima": "balancar", "angulo": 14, "periodo": 2.2, "eixo": "y"}, "bandeira",
             pivo=(0, 0, zb))
    # cúpula extra (tenda grande)
    if cupula:
        it.add(mb.torno([(0, 0), (r0 + 0.9, 0), (r0 + 0.95, 0.12), (r0 + 0.35, 0.75), (0.0, 0.85)],
                        z=ht - 0.75, cor=cor2, seg=n * 2, angulo=40))
    # cordas e estacas
    if cordas:
        rc = min(R + 1.0 + R * 0.12, 7.2)
        cs = []
        for k in range(n // 2):
            a = 2 * math.pi * (k + 0.25) / (n // 2) - math.pi / 2
            if abs(((a + math.pi / 2) + math.pi) % (2 * math.pi) - math.pi) < ang_porta + 0.25:
                continue
            p0 = (R * 0.98 * math.cos(a), R * 0.98 * math.sin(a), hp - 0.1)
            p1 = (rc * math.cos(a), rc * math.sin(a), 0.05)
            cs.append(mb.tubo([p0, p1], 0.012, cor="bege", seg=4))
            cs.append(mb.cilindro(0.04, 0.25, x=p1[0], y=p1[1], z=0, cor="madeira", seg=5, bisel=0.0))
        it.add(mb.junta(cs, "cordas"))
    # lâmpadas na beirada (piscam à noite em dois grupos)
    if lampadas:
        nl = n * 2
        g1, g2 = [], []
        for k in range(nl):
            a = 2 * math.pi * (k + 0.5) / nl - math.pi / 2
            rr = R + 0.2
            p = (rr * math.cos(a), rr * math.sin(a), hp + 0.06)
            (g1 if k % 2 == 0 else g2).append(pb.bola(0.07 if R > 3 else 0.05, p[0], p[1], p[2], mat="luz"))
        it.anima(g1, {"anima": "piscar", "periodo": 1.0}, "lampadas_a", pivo=(0, 0, hp))
        it.anima(g2, {"anima": "piscar", "periodo": 1.0, "fase": 0.5}, "lampadas_b", pivo=(0, 0, hp))
    rc = R + 0.3
    return [((0, 0, 0), (2 * R, 2 * R, hp + (ht - hp) * 0.4)), ((0, yp - dep / 2, 0), (pw + 0.4, dep + 0.4, hpt))], rc


def p_tenda_grande(it):
    col, rc = tenda_circo(it, 6.0, 3.0, 9.6, 24, "vermelho", "branco", "amarelo", placa=True, cupula=True)
    # mastros de bandeirinhas nas laterais
    for sx in (-1, 1):
        it.add(mb.cilindro(0.06, 4.2, x=sx * 6.4, y=-5.6, z=0, cor="amarelo", seg=8, bisel=0.01))
        it.add(pb.bandeirinhas((sx * 6.4, -5.6, 4.1), (sx * 2.2, -6.6, 3.4), n=7, queda=0.35, tam=0.3))
    return {"col": col, "mini": (0.55, -1.0, 0.5)}


def p_tenda_media(it):
    col, rc = tenda_circo(it, 3.7, 2.3, 6.2, 16, "roxo", "amarelo", "vermelho", cor_mastro="vermelho")
    return {"col": col, "mini": (0.55, -1.0, 0.5)}


def p_tenda_pequena(it):
    col, rc = tenda_circo(it, 2.3, 1.9, 4.3, 12, "azul_celeste", "branco", "rosa", cor_mastro="rosa", cordas=True)
    return {"col": col, "mini": (0.55, -1.0, 0.5)}


# =====================================================================================================================
# Quiosques e bilheteria
# =====================================================================================================================
def toldo(x0, x1, y0, y1, z0, z1, n, cor1, cor2, bicos=True, nome="toldo"):
    """Toldo listrado inclinado (alto em y1, baixo em y0) com franja de bicos na frente."""
    ps = []
    w = (x1 - x0) / n
    for k in range(n):
        m = Malha()
        a, b = x0 + k * w, x0 + (k + 1) * w
        vs = [m.v((a, y0, z0)), m.v((b, y0, z0)), m.v((b, y1, z1)), m.v((a, y1, z1))]
        cor = cor1 if k % 2 == 0 else cor2
        m.f(vs, cor)
        m.f(vs[::-1], cor)
        if bicos:
            mm = [m.v((a, y0, z0)), m.v((b, y0, z0)), m.v(((a + b) / 2, y0 - 0.005, z0 - w * 0.55))]
            m.f(mm, cor)
            m.f(mm[::-1], cor)
        ps.append(m.obj("listra"))
    ps.append(mb.tubo([(x0, y0, z0), (x1, y0, z0)], 0.025, cor="branco", seg=6))
    return mb.junta(ps, nome)


def corpo_quiosque(it, l, p, cor, cor2, cor_tampo="branco", balcao=1.05):
    """Corpo de quiosque: caixa com rodapé, balcão saliente na frente, janela aberta e teto."""
    ps = [caixa(l, p, 0.12, z=0, cor=cor2, bisel=0.03),
          caixa(l - 0.06, p - 0.06, balcao - 0.12, z=0.12, cor=cor, bisel=0.04),
          caixa(l + 0.08, 0.42, 0.06, y=-p / 2 + 0.12, z=balcao, cor=cor_tampo, bisel=0.02)]
    # colunas da janela e fundo
    for sx in (-1, 1):
        ps.append(caixa(0.14, p - 0.06, 1.2, x=sx * (l / 2 - 0.1), z=balcao + 0.06, cor=cor, bisel=0.03))
    ps.append(caixa(l - 0.06, 0.1, 1.2, y=p / 2 - 0.08, z=balcao + 0.06, cor=cor, bisel=0.03))
    ps.append(caixa(l - 0.2, p - 0.2, 0.02, z=balcao + 0.06, cor="madeira_clara", bisel=0.0))
    ps.append(caixa(l + 0.05, p + 0.05, 0.14, z=balcao + 1.26, cor=cor2, bisel=0.04))
    # faixa decorativa no corpo
    ps.append(caixa(l - 0.02, p - 0.02, 0.1, z=0.55, cor=cor2, bisel=0.02))
    ob = mb.junta(ps, "corpo")
    it.add(ob)
    it.add(caixa(l - 0.4, 0.04, 0.05, y=p / 2 - 0.15, z=balcao + 1.15, cor=None, mat="luz", bisel=0.01))
    return balcao + 1.4


def letreiro(it, nome_est, w, h, x, y, z, cor_moldura="branco", neon=None):
    if not EST:
        return
    m = EST(nome_est, 1.0)
    it.add(caixa(w + 0.14, 0.1, h + 0.14, x=x, y=y + 0.05, z=z - h / 2 - 0.07, cor=cor_moldura, bisel=0.04))
    it.add(pb.placa_estampa(m, w, h, x, y - 0.006, z, normal=(0, -1, 0), nome="letreiro"))
    if neon:
        cont = pb.reamostra([(x - w / 2 - 0.1, z - h / 2 - 0.1), (x + w / 2 + 0.1, z - h / 2 - 0.1),
                             (x + w / 2 + 0.1, z + h / 2 + 0.1), (x - w / 2 - 0.1, z + h / 2 + 0.1)], 0.2, True)
        it.add(mb.tubo([(q[0], y - 0.02, q[1]) for q in cont] + [(cont[0][0], y - 0.02, cont[0][1])], 0.022, cor=None,
                       mat=neon, seg=6, raio_curva=0.05))


def p_quiosque_sorvete(it):
    l, p = 2.6, 1.7
    zt = corpo_quiosque(it, l, p, "menta", "rosa")
    # vitrine refrigerada com potes de sorvete
    it.add(caixa(1.6, 0.5, 0.06, y=-0.45, z=1.1, cor="branco", bisel=0.02))
    for k, c in enumerate(("rosa", "chocolate", "amarelo_claro", "menta", "branco", "vermelho_claro")):
        x = -0.65 + k * 0.26
        it.add(mb.cilindro(0.1, 0.07, x=x, y=-0.45, z=1.16, cor="metal_claro", seg=10, bisel=0.01))
        it.add(mb.superelipsoide(0.18, 0.18, 0.1, x=x, y=-0.45, z=1.2, cor=c, e=0.9, e_v=0.8, nu=8, nv=4))
    it.add(caixa(1.6, 0.03, 0.3, y=-0.7, z=1.1, cor=None, mat="vidro", bisel=0.005))
    it.add(toldo(-l / 2 - 0.2, l / 2 + 0.2, -p / 2 - 0.95, -p / 2 + 0.05, zt - 0.55, zt - 0.05, 8, "rosa", "branco"))
    letreiro(it, "sorvete", 2.2, 0.55, 0, -p / 2 - 0.02, zt + 0.42, neon="neon_rosa")
    # casquinha gigante no teto
    cz = zt + 0.75
    casq = [mb.cilindro(0.06, 0.95, z=cz, r2=0.42, cor="caramelo", seg=14, bisel=0.01),
            mb.esfera(0.46, z=cz + 1.15, cor="rosa_claro", seg=16),
            mb.esfera(0.36, z=cz + 1.55, cor="chocolate", seg=14, esc=(1, 1, 0.9)),
            mb.esfera(0.1, z=cz + 1.92, cor="vermelho", seg=10)]
    for k in range(10):
        a = math.radians(36 * k)
        casq.append(caixa(0.06, 0.02, 0.02, x=0.3 * math.cos(a), y=0.3 * math.sin(a), z=cz + 1.72,
                             cor=("amarelo", "azul_claro", "verde_claro")[k % 3], bisel=0.005))
    casq.append(mb.cilindro(0.08, zt + 0.8 - zt, z=zt, cor="branco", seg=8, bisel=0.01))
    it.add(mb.junta(casq, "casquinha"))
    return {"col": [((0, 0, 0), (l, p, zt))], "mini": (0.55, -1.0, 0.4)}


def p_quiosque_pipoca(it):
    l, p = 2.4, 1.6
    zt = corpo_quiosque(it, l, p, "branco", "vermelho")
    # listras vermelhas verticais no corpo
    for k in range(7):
        x = -l / 2 + 0.2 + k * (l - 0.4) / 6
        it.add(caixa(0.14, 0.02, 0.45, x=x, y=-p / 2 + 0.02, z=0.6, cor="vermelho", bisel=0.005))
    # pipoqueira de vidro
    pq = [caixa(0.9, 0.6, 0.08, y=-0.25, z=1.1, cor="vermelho", bisel=0.02),
          caixa(0.9, 0.6, 0.12, y=-0.25, z=1.85, cor="vermelho", bisel=0.03),
          mb.cilindro(0.06, 0.12, y=-0.25, z=1.97, cor="amarelo", seg=8, bisel=0.01)]
    for sx in (-0.42, 0.42):
        for sy in (-0.52, 0.02):
            pq.append(caixa(0.04, 0.04, 0.68, x=sx, y=sy, z=1.17, cor="vermelho", bisel=0.008))
    it.add(mb.junta(pq, "pipoqueira"))
    it.add(caixa(0.82, 0.54, 0.66, y=-0.25, z=1.18, cor=None, mat="vidro", bisel=0.005))
    it.add(mb.superelipsoide(0.78, 0.5, 0.32, y=-0.25, z=1.18, cor="amarelo_claro", e=0.6, e_v=0.6, nu=12, nv=5))
    it.add(toldo(-l / 2 - 0.2, l / 2 + 0.2, -p / 2 - 0.9, -p / 2 + 0.05, zt - 0.55, zt - 0.05, 8, "amarelo",
                 "vermelho"))
    letreiro(it, "pipoca", 2.0, 0.5, 0, -p / 2 - 0.02, zt + 0.4, cor_moldura="amarelo")
    # lâmpadas em volta do letreiro (piscam)
    bul = []
    for k in range(9):
        x = -1.1 + k * 0.275
        bul += pb.lampadas([(x, -p / 2 - 0.08, zt + 0.08), (x, -p / 2 - 0.08, zt + 0.72)], r=0.04)
    it.anima(bul, {"anima": "piscar", "periodo": 0.8}, "lampadas", pivo=(0, -p / 2 - 0.08, zt + 0.4))
    # balde de pipoca gigante no teto
    cz = zt + 0.85
    b = [mb.cilindro(0.38, 0.85, z=cz, r2=0.5, cor="branco", seg=16, bisel=0.01)]
    for k in range(8):
        a = math.radians(45 * k)
        fx = caixa(0.16, 0.03, 0.86, z=0, cor="vermelho", bisel=0.0)
        mb.transforma(fx, rot=[("Z", 45 * k + 90), ("X", -7.5)])
        mb.transforma(fx, loc=(0.45 * math.cos(a) * 0.98, 0.45 * math.sin(a) * 0.98, cz))
        b.append(fx)
    for k, (dx, dy, dz) in enumerate(((0, 0, 0.12), (0.25, 0.1, 0.0), (-0.22, 0.18, 0.02), (0.05, -0.27, 0.0),
                                      (-0.18, -0.2, 0.04), (0.2, -0.15, 0.08), (0.1, 0.27, 0.06), (-0.3, 0.0, -0.03))):
        b.append(pb.bola(0.17, dx, dy, cz + 0.9 + dz, cor="amarelo_claro", sub=1))
    b.append(mb.cilindro(0.08, cz - zt, z=zt, cor="vermelho", seg=8, bisel=0.01))
    it.add(mb.junta(b, "balde"))
    return {"col": [((0, 0, 0), (l, p, zt))], "mini": (0.55, -1.0, 0.4)}


def p_quiosque_algodao(it):
    l, p = 2.6, 1.7
    zt = corpo_quiosque(it, l, p, "lilas", "rosa_claro")
    # máquina: tacho com cabeça que gira
    mx, my = -0.55, -0.4
    it.add(mb.cilindro(0.18, 0.12, x=mx, y=my, z=1.1, cor="metal", seg=12, bisel=0.02))
    it.add(mb.torno([(0.0, 0.0), (0.2, 0.0), (0.45, 0.25), (0.48, 0.3), (0.43, 0.3), (0.2, 0.06), (0, 0.06)],
                    x=mx, y=my, z=1.22, cor="metal_claro", seg=20))
    gira = [mb.cilindro(0.12, 0.1, x=mx, y=my, z=1.3, cor="rosa", seg=12, bisel=0.02),
            mb.superelipsoide(0.55, 0.55, 0.18, x=mx, y=my, z=1.36, cor="rosa_bebe", e=0.9, e_v=0.8, nu=14, nv=5)]
    it.anima(gira, {"anima": "girar", "eixo": "y", "velocidade": 240}, "maquina_algodao", pivo=(mx, my, 1.3))
    # algodões doces em palitos num suporte
    sup = [caixa(0.5, 0.2, 0.12, x=0.55, y=-0.45, z=1.1, cor="madeira_mel", bisel=0.02)]
    for k, (dx, dy, c) in enumerate(((-0.15, 0, "rosa_bebe"), (0.0, 0.05, "azul_bebe"), (0.15, 0, "rosa_claro"),
                                     (0.08, -0.06, "lilas_claro"))):
        x, y = 0.55 + dx, -0.45 + dy
        sup.append(mb.cilindro(0.012, 0.5, x=x, y=y, z=1.15, cor="creme", seg=4, bisel=0.0))
        sup.append(mb.superelipsoide(0.24, 0.24, 0.3, x=x, y=y, z=1.58, cor=c, e=0.95, e_v=0.85, nu=10, nv=5))
    it.add(mb.junta(sup, "algodoes"))
    it.add(toldo(-l / 2 - 0.2, l / 2 + 0.2, -p / 2 - 0.95, -p / 2 + 0.05, zt - 0.55, zt - 0.05, 8, "lilas", "branco"))
    letreiro(it, "algodao", 2.4, 0.48, 0, -p / 2 - 0.02, zt + 0.38, cor_moldura="rosa_claro", neon="neon_roxo")
    # algodão-doce gigante no teto
    cz = zt + 0.7
    ad = [mb.cilindro(0.05, 1.0, z=zt, cor="creme", seg=8, bisel=0.01)]
    for dx, dy, dz, rr, c in ((0, 0, 0.55, 0.55, "rosa_bebe"), (0.32, 0.1, 0.35, 0.38, "rosa_claro"),
                              (-0.3, -0.05, 0.38, 0.4, "rosa_claro"), (0.05, 0.25, 0.85, 0.35, "rosa_bebe"),
                              (0, -0.3, 0.8, 0.32, "rosa_claro")):
        ad.append(mb.esfera(rr, x=dx, y=dy, z=cz + dz + 0.2, cor=c, seg=12))
    it.add(mb.junta(ad, "algodao_gigante"))
    return {"col": [((0, 0, 0), (l, p, zt))], "mini": (0.55, -1.0, 0.4)}


def p_bilheteria(it):
    l, p, hc = 2.0, 1.7, 2.5
    ps = [caixa(l + 0.2, p + 0.2, 0.15, z=0, cor="azul_escuro", bisel=0.04),
          caixa(l, p, hc - 0.15, z=0.15, cor="azul", bisel=0.06)]
    # janela da frente com moldura amarela, grade e balcãozinho
    ps.append(caixa(1.3, 0.08, 1.0, y=-p / 2 - 0.02, z=1.05, cor="amarelo", bisel=0.03))
    ps.append(caixa(1.5, 0.3, 0.06, y=-p / 2 - 0.12, z=1.0, cor="amarelo", bisel=0.02))
    for k in range(5):
        x = -0.48 + k * 0.24
        ps.append(mb.cilindro(0.012, 0.86, x=x, y=-p / 2 - 0.07, z=1.12, cor="ouro", seg=4, bisel=0.0))
    ps.append(caixa(0.36, 0.06, 0.12, y=-p / 2 - 0.08, z=1.06, cor="grafite_escuro", bisel=0.01))
    # porta lateral
    ps.append(caixa(0.06, 0.8, 1.9, x=l / 2 + 0.02, y=0.2, z=0.15, cor="azul_escuro", bisel=0.02))
    ps.append(mb.esfera(0.04, x=l / 2 + 0.06, y=-0.1, z=1.05, cor="ouro", seg=8))
    # cúpula listrada com estrela
    nseg = 16
    m = Malha()
    zc = hc
    aneis = []
    for j in range(7):
        t = j / 6
        rr = (1.32 * math.cos(t * math.pi / 2)) if j < 6 else 0.02
        zz = zc + 0.05 + 1.0 * math.sin(t * math.pi / 2)
        aneis.append([m.v((rr * math.cos(2 * math.pi * k / nseg), rr * math.sin(2 * math.pi * k / nseg), zz))
                      for k in range(nseg)])
    for j in range(6):
        for k in range(nseg):
            k2 = (k + 1) % nseg
            m.f((aneis[j][k], aneis[j][k2], aneis[j + 1][k2], aneis[j + 1][k]), "vermelho" if k % 2 else "branco")
    cup = m.obj("cupula", liso=True, angulo=60)
    pb._normais_para_fora(cup)
    ps.append(cup)
    ps.append(mb.cilindro(1.42, 0.12, z=zc - 0.05, cor="amarelo", seg=24, bisel=0.03))
    st = mb.extrudado(pb.estrela_pts(0.3), 0.08, y=-0.04, z=0, cor="amarelo", bisel=0.02, plano="xz")
    mb.transforma(st, loc=(0, 0, zc + 1.35))
    ps.append(st)
    ps.append(mb.cilindro(0.03, 0.3, z=zc + 1.02, cor="amarelo", seg=6, bisel=0.0))
    it.add(mb.junta(ps, "bilheteria"))
    it.add(caixa(1.2, 0.02, 0.9, y=-p / 2 - 0.04, z=1.1, cor=None, mat="vidro", bisel=0.005))
    it.add(caixa(0.9, 0.04, 0.05, y=-p / 2 + 0.2, z=hc - 0.25, cor=None, mat="luz", bisel=0.01))
    letreiro(it, "ingressos", 1.9, 0.48, 0, -p / 2 - 0.08, 2.32, cor_moldura="amarelo")
    bul = pb.lampadas([(-0.72 + k * 0.205, -p / 2 - 0.09, 2.0) for k in range(8)] +
                      [(-0.72, -p / 2 - 0.09, 1.2 + k * 0.2) for k in range(4)] +
                      [(0.72, -p / 2 - 0.09, 1.2 + k * 0.2) for k in range(4)], r=0.04)
    it.anima(bul, {"anima": "piscar", "periodo": 1.0}, "lampadas", pivo=(0, -p / 2 - 0.09, 1.6))
    # fila com balizadores e corda vermelha
    fila = []
    for k, (x, y) in enumerate(((-0.6, -1.5), (-0.6, -2.6), (-0.6, -3.7), (0.6, -1.5), (0.6, -2.6), (0.6, -3.7))):
        fila.append(mb.cilindro(0.16, 0.05, x=x, y=y, z=0, cor="ouro", seg=10, bisel=0.0))
        fila.append(mb.cilindro(0.035, 0.9, x=x, y=y, z=0.05, cor="ouro", seg=6, bisel=0.0))
        fila.append(pb.bola(0.06, x, y, 0.96, cor="ouro"))
    for x in (-0.6, 0.6):
        for y0, y1 in ((-1.5, -2.6), (-2.6, -3.7)):
            fila.append(mb.tubo([(x, y0 + (y1 - y0) * t, 0.9 - 0.2 * math.sin(math.pi * t)) for t in np.linspace(0, 1, 6)],
                                0.025, cor="vermelho", seg=4, raio_curva=0))
    it.add(mb.junta(fila, "fila"))
    return {"col": [((0, 0, 0), (l + 0.2, p + 0.2, hc + 1.2)), ((-0.6, -2.6, 0), (0.2, 2.4, 1.0)),
                    ((0.6, -2.6, 0), (0.2, 2.4, 1.0))], "mini": (0.55, -1.0, 0.4)}


# =====================================================================================================================
# Chafariz grande, chafariz do pacote, obelisco, arco de treliça, coreto, banco, poste
# =====================================================================================================================
def p_chafariz(it):
    R = 3.4
    zag = 0.42
    it.add(mb.torno([(R - 0.45, 0.0), (R, 0.0), (R + 0.1, 0.08), (R + 0.1, 0.42), (R + 0.02, 0.56), (R - 0.16, 0.6),
                     (R - 0.4, 0.56), (R - 0.45, 0.45), (R - 0.45, 0.05)], cor="creme", seg=40))
    it.add(mb.cilindro(R - 0.4, 0.1, z=0.0, cor="azul_claro", seg=40, bisel=0.0))
    # degrau baixo em volta
    it.add(mb.torno([(R + 0.1, 0.0), (R + 0.55, 0.0), (R + 0.55, 0.12), (R + 0.1, 0.12)], cor="bege", seg=40))
    it.add(mb.cilindro(R - 0.42, 0.01, z=zag, cor=None, mat="agua", seg=40, bisel=0.0))
    # pedestal com duas bacias
    it.add(mb.torno([(0, 0.0), (0.75, 0.0), (0.75, 0.25), (0.5, 0.35), (0.38, 0.6), (0.3, 1.3), (0.34, 1.38),
                     (0.0, 1.38)], cor="creme", seg=24))
    it.add(mb.torno([(0.0, 1.32), (0.3, 1.32), (1.5, 1.55), (1.62, 1.72), (1.55, 1.8), (1.4, 1.74), (0.0, 1.74)],
                    cor="creme", seg=28))
    it.add(mb.cilindro(1.42, 0.01, z=1.735, cor=None, mat="agua", seg=28, bisel=0.0))
    it.add(mb.torno([(0, 1.7), (0.22, 1.7), (0.18, 2.4), (0.24, 2.5), (0.0, 2.5)], cor="creme", seg=16))
    it.add(mb.torno([(0.0, 2.45), (0.2, 2.45), (0.82, 2.62), (0.9, 2.74), (0.85, 2.8), (0.72, 2.76), (0.0, 2.76)],
                    cor="creme", seg=28))
    it.add(mb.cilindro(0.73, 0.01, z=2.755, cor=None, mat="agua", seg=24, bisel=0.0))
    it.add(mb.torno([(0, 2.7), (0.12, 2.7), (0.1, 3.0), (0.16, 3.1), (0.06, 3.25), (0.0, 3.3)], cor="ouro", seg=12))
    # cortinas d'água caindo das bacias
    it.add(mb.cilindro(1.6, 1.3, z=zag, r2=1.52, cor=None, mat="agua", seg=28, bisel=0.0, tampas=False))
    it.add(mb.cilindro(0.88, 0.95, z=1.78, r2=0.86, cor=None, mat="agua", seg=28, bisel=0.0, tampas=False))
    # jato do topo e coroa de jatos em arco (a coroa gira devagar)
    it.add(mb.cilindro(0.05, 0.9, z=3.25, r2=0.03, cor=None, mat="agua", seg=8, bisel=0.0))
    it.add(mb.torno([(0.03, 4.1), (0.25, 4.05), (0.5, 3.6), (0.62, 2.95), (0.55, 2.95), (0.4, 3.55), (0.18, 3.95),
                     (0.0, 4.0)], cor=None, mat="agua", seg=16))
    coroa = []
    for k in range(10):
        a = 2 * math.pi * k / 10
        c, s = math.cos(a), math.sin(a)
        pts = [((R - 0.35) * c, (R - 0.35) * s, 0.55)]
        for t in np.linspace(0.1, 1, 8):
            rr = (R - 0.35) - (R - 0.35 - 1.8) * t
            zz = 0.55 + 1.6 * 4 * t * (1 - t) * 0.6 + (zag - 0.55) * t
            pts.append((rr * c, rr * s, zz))
        coroa.append(mb.tubo(pts, 0.035, cor=None, mat="agua", raio_curva=0, seg=6))
        coroa.append(mb.cilindro(0.06, 0.06, x=(R - 0.35) * c, y=(R - 0.35) * s, z=0.5, cor="ouro", seg=8, bisel=0.01))
    it.anima(coroa, {"anima": "girar", "eixo": "y", "velocidade": 12}, "coroa_jatos", pivo=(0, 0, 0))
    # luzes dentro da bacia (acendem à noite)
    for k in range(12):
        a = 2 * math.pi * (k + 0.5) / 12
        lz = caixa(0.26, 0.06, 0.12, z=0.0, cor=None, mat="luz", bisel=0.02)
        mb.transforma(lz, rot=("Z", math.degrees(a) + 90))
        mb.transforma(lz, loc=((R - 0.47) * math.cos(a), (R - 0.47) * math.sin(a), zag + 0.02))
        it.add(lz)
    for k in range(4):
        a = 2 * math.pi * (k + 0.5) / 4
        it.add(caixa(0.14, 0.14, 0.06, x=0.9 * math.cos(a), y=0.9 * math.sin(a), z=1.56, cor=None, mat="luz",
                        bisel=0.02))
    # floreiras em volta (4)
    for k in range(4):
        a = math.radians(45 + 90 * k)
        x, y = (R + 1.1) * math.cos(a), (R + 1.1) * math.sin(a)
        it.add(mb.torno([(0, 0), (0.4, 0), (0.48, 0.45), (0.52, 0.5), (0.0, 0.5)], x=x, y=y, cor="terracota", seg=14))
        it.add(arbusto(x, y, r=0.38, cor="folha", z=0.48, alt=0.5),
               flores(x, y, ("rosa", "amarelo", "branco"), z=0.62, n=5, alt=0.12))
    return {"col": [((0, 0, 0), (2 * R + 0.2, 2 * R + 0.2, 0.6)), ((0, 0, 0), (1.5, 1.5, 3.3))],
            "mini": (0.55, -1.0, 0.6)}


def p_fountain_pacote(it):
    import cidade_base as cb_
    pc = cb_.importa_cidade("Fountain_03")
    objs = list(pc.values())
    # a água do pacote (azuis) vira o material de água; luz embaixo à noite
    for o in objs:
        me = o.data
        uv = me.uv_layers["UVMap"].data
        azuis = {mb.uv_cor(c) for c in ("agua", "azul_claro", "azul_celeste", "turquesa_claro", "agua_rio",
                                         "azul_bebe", "turquesa")}
        for p in me.polygons:
            u = tuple(uv[p.loop_indices[0]].uv)
            if any(abs(u[0] - a[0]) < 1e-4 and abs(u[1] - a[1]) < 1e-4 for a in azuis):
                p.material_index = mb.MAT_NOMES.index("agua")
        it.add(o)
    lo, hi = mb.bbox(objs)
    R = min(hi.x - lo.x, hi.y - lo.y) / 2
    for k in range(6):
        a = 2 * math.pi * (k + 0.5) / 6
        it.add(caixa(0.16, 0.16, 0.06, x=(R * 0.62) * math.cos(a), y=(R * 0.62) * math.sin(a), z=0.25, cor=None,
                        mat="luz", bisel=0.02))
    return {"col": [((0, 0, 0), (hi.x - lo.x, hi.y - lo.y, 0.7)), ((0, 0, 0), (1.2, 1.2, hi.z))],
            "mini": (0.55, -1.0, 0.6), "pacote": True}


def p_obelisco(it):
    ps = []
    for k, (l, h) in enumerate(((3.6, 0.22), (3.0, 0.22), (2.4, 0.22))):
        ps.append(caixa(l, l, h + 0.01, z=k * 0.22, cor="cinza_claro" if k % 2 else "branco_gelo", bisel=0.03))
    z0 = 0.66
    ps.append(caixa(1.75, 1.75, 0.25, z=z0, cor="branco_gelo", bisel=0.04))
    ps.append(caixa(1.5, 1.5, 1.3, z=z0 + 0.25, cor="branco", bisel=0.04))
    ps.append(caixa(1.72, 1.72, 0.2, z=z0 + 1.55, cor="branco_gelo", bisel=0.04))
    # placas de bronze nas 4 faces
    for k in range(4):
        pl = caixa(0.8, 0.04, 0.55, y=-0.77, z=z0 + 0.6, cor="ouro_escuro", bisel=0.015)
        gira_z(pl, 90 * k)
        ps.append(pl)
    # fuste afinando e pirâmide dourada
    zb = z0 + 1.75
    hf = 10.0
    m = Malha()
    b, t = 0.55, 0.36
    base = [m.v((sx * b, sy * b, zb)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    topo = [m.v((sx * t, sy * t, zb + hf)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    for k in range(4):
        m.f((base[k], base[(k + 1) % 4], topo[(k + 1) % 4], topo[k]), "branco")
    ponta = m.v((0, 0, zb + hf + 0.75))
    for k in range(4):
        m.f((topo[k], topo[(k + 1) % 4], ponta), "ouro")
    ob = m.obj("fuste")
    pb._normais_para_fora(ob)
    ps.append(ob)
    it.add(mb.junta(ps, "obelisco"))
    # refletores no chão iluminando o obelisco
    for k in range(4):
        a = math.radians(45 + 90 * k)
        x, y = 1.55 * math.cos(a), 1.55 * math.sin(a)
        it.add(caixa(0.22, 0.22, 0.12, x=x, y=y, z=0.66, cor="grafite", bisel=0.03))
        it.add(caixa(0.16, 0.16, 0.02, x=x, y=y, z=0.78, cor=None, mat="luz", bisel=0.005))
    for k in range(4):
        a = math.radians(90 * k)
        it.add(arbusto(1.45 * math.cos(a) * 1.0, 1.45 * math.sin(a), r=0.25, cor="folha", z=0.66, alt=0.35))
    return {"col": [((0, 0, 0), (3.6, 3.6, 0.66)), ((0, 0, 0.66), (1.75, 1.75, hf + 2.5))],
            "mini": (0.55, -1.0, 0.35)}


def trelica_painel(x0, x1, y, z0, z1, passo=0.26, r=0.016, cor="branco"):
    """Painel de treliça em losango no plano XZ em y (barras finas a ±45°, cortadas no retângulo)."""
    ps = []
    w, h = x1 - x0, z1 - z0
    n = int((w + h) / passo) + 2
    for k in range(-n, n + 1):
        for s in (1, -1):
            # reta x = x0 + k*passo + s*(z - z0)
            pts = []
            for zz in (z0, z1):
                xx = x0 + k * passo + s * (zz - z0)
                pts.append((xx, zz))
            (xa, za), (xb, zb) = pts
            # recorta no retângulo
            def clip(xa, za, xb, zb):
                t0, t1 = 0.0, 1.0
                dx, dz = xb - xa, zb - za
                for p_, q_ in ((-dx, xa - x0), (dx, x1 - xa)):
                    if abs(p_) < 1e-9:
                        if q_ < 0:
                            return None
                        continue
                    t = q_ / p_
                    if p_ < 0:
                        t0 = max(t0, t)
                    else:
                        t1 = min(t1, t)
                if t0 >= t1:
                    return None
                return (xa + dx * t0, za + dz * t0), (xa + dx * t1, za + dz * t1)
            c = clip(xa, za, xb, zb)
            if c and math.hypot(c[1][0] - c[0][0], c[1][1] - c[0][1]) > 0.05:
                ps.append(pb.haste((c[0][0], y, c[0][1]), (c[1][0], y, c[1][1]), r, cor, 3))
    return mb.junta(ps, "trelica") if ps else None


def p_arco_trelica(it):
    W, D, HP = 2.4, 0.7, 2.25
    ps = []
    for sx in (-1, 1):
        x = sx * W / 2
        for sy in (-1, 1):
            ps.append(caixa(0.08, 0.08, HP, x=x, y=sy * D / 2, z=0, cor="branco", bisel=0.015))
            ps.append(caixa(0.16, 0.16, 0.08, x=x, y=sy * D / 2, z=0, cor="branco", bisel=0.02))
            ps.append(mb.esfera(0.05, x=x, y=sy * D / 2, z=HP + 0.04, cor="branco", seg=8))
        for zz in (0.12, HP - 0.06):
            ps.append(caixa(0.06, D, 0.05, x=x, y=0, z=zz, cor="branco", bisel=0.01))
        tp = trelica_painel(-D / 2 + 0.04, D / 2 - 0.04, 0, 0.17, HP - 0.06)
        if tp:
            mb.transforma(tp, rot=("Z", 90))
            mb.transforma(tp, loc=(x, 0, 0))
            ps.append(tp)
    # arco em cima (frente e trás) com ripas ligando
    R = W / 2
    for sy in (-1, 1):
        pts = [(R * math.cos(math.radians(a)), sy * D / 2, HP + R * 0.55 * math.sin(math.radians(a)))
               for a in np.linspace(0, 180, 19)]
        ps.append(mb.tubo(pts, 0.04, cor="branco", seg=6, raio_curva=0))
        pts2 = [(0.82 * R * math.cos(math.radians(a)), sy * D / 2, HP + 0.82 * R * 0.5 * math.sin(math.radians(a)))
                for a in np.linspace(0, 180, 17)]
        ps.append(mb.tubo(pts2, 0.025, cor="branco", seg=6, raio_curva=0))
        # arabescos (voltinhas) entre os arcos
        for a0 in (90,):
            c = (math.cos(math.radians(a0)) * R * 0.91, sy * D / 2, HP + 0.48 * R * math.sin(math.radians(a0)) + 0.02)
            vol = [(c[0] + 0.1 * math.cos(t) * (1 - t / 12), c[1], c[2] + 0.1 * math.sin(t) * (1 - t / 12))
                   for t in np.linspace(0, 2 * math.pi * 1.3, 11)]
            ps.append(mb.tubo(vol, 0.012, cor="branco", seg=4, raio_curva=0))
    for a in np.linspace(8, 172, 11):
        x = R * math.cos(math.radians(a)) * 0.97
        z = HP + R * 0.55 * math.sin(math.radians(a)) * 0.98
        ps.append(caixa(0.05, D + 0.06, 0.04, x=x, y=0, z=z - 0.02, cor="branco", bisel=0.01))
    ps.append(caixa(W + 0.3, D + 0.18, 0.08, x=0, y=0, z=HP - 0.02, cor="branco", bisel=0.02))
    it.add(mb.junta(ps, "arco"))
    # roseira subindo pelo lado esquerdo e por cima
    fol = []
    import random
    rnd = random.Random(4)
    for k in range(12):
        t = k / 11
        if t < 0.55:
            x, z = -W / 2 + rnd.uniform(-0.12, 0.12), 0.3 + t / 0.55 * (HP - 0.2)
        else:
            a = math.radians(180 - (t - 0.55) / 0.45 * 120)
            x, z = R * math.cos(a), HP + R * 0.55 * math.sin(a)
        y = rnd.uniform(-D / 2 - 0.05, D / 2 + 0.05)
        fol.append(mb.superelipsoide(0.32, 0.26, 0.26, x=x, y=y, z=z - 0.12, cor="folha" if k % 2 else "folha_escura",
                                     e=0.9, e_v=0.85, nu=8, nv=4))
        if k % 2 == 0:
            fol.append(mb.cilindro(0.06, 0.06, x=x + 0.05, y=y - 0.12 if y < 0 else y + 0.12, z=z, r2=0.035,
                                   cor="rosa" if k % 4 else "vermelho", seg=6, bisel=0.0))
    it.add(mb.junta(fol, "roseira"))
    it.add(arbusto(-W / 2 - 0.25, -0.5, r=0.3, cor="folha", alt=0.45), arbusto(W / 2 + 0.25, 0.5, r=0.28,
                                                                              cor="folha_escura", alt=0.4))
    return {"col": [((-W / 2, 0, 0), (0.2, D + 0.1, HP + 0.6)), ((W / 2, 0, 0), (0.2, D + 0.1, HP + 0.6))],
            "mini": (0.55, -1.0, 0.25)}


def p_coreto(it):
    n = 8
    R = 3.6
    zp = 0.95
    rot = math.pi / 8

    def pol(r, z=0.0):
        return [(r * math.cos(rot + 2 * math.pi * k / n), r * math.sin(rot + 2 * math.pi * k / n)) for k in range(n)]
    ps = [pb.prisma([pol(R)], 0.0, zp - 0.12, "creme", "creme"),
          pb.prisma([pol(R + 0.12)], zp - 0.12, zp, "madeira_mel", "branco")]
    # rodapé de tijolinho com faixa
    ps.append(pb.prisma([pol(R + 0.03)], 0.0, 0.18, "bege_escuro", "bege_escuro"))
    # escada na frente (−Y)
    for k in range(4):
        h = zp * (k + 1) / 5
        ps.append(caixa(1.9, 0.38, h, y=-R * math.cos(math.pi / 8) - 0.19 - (3 - k) * 0.36, z=0,
                           cor="creme" if k % 2 else "bege", bisel=0.02))
    # colunas, guarda-corpo (menos no vão da escada) e lambrequim
    zc = zp + 2.75
    cols = pol(R - 0.25)
    for k, (x, y) in enumerate(cols):
        ps.append(mb.torno([(0, 0), (0.16, 0), (0.16, 0.1), (0.09, 0.18), (0.075, 2.5), (0.12, 2.6), (0.15, 2.75),
                            (0, 2.75)], x=x, y=y, z=zp, cor="branco", seg=10))
    frente = lambda a, b: (a[1] + b[1]) / 2 < -R * 0.7 and abs((a[0] + b[0]) / 2) < 1.0  # noqa: E731
    for k in range(n):
        a, b = cols[k], cols[(k + 1) % n]
        if frente(a, b):
            continue
        ps.append(mb.tubo([(a[0], a[1], zp + 0.9), (b[0], b[1], zp + 0.9)], 0.045, cor="branco", seg=6))
        ps.append(mb.tubo([(a[0], a[1], zp + 0.12), (b[0], b[1], zp + 0.12)], 0.035, cor="branco", seg=6))
        for j in range(1, 8):
            t = j / 8
            x, y = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
            ps.append(mb.cilindro(0.032, 0.75, x=x, y=y, z=zp + 0.13, r2=0.022, cor="branco", seg=5, bisel=0.0))
    # viga em volta e lambrequim de bicos
    ps.append(pb.prisma([pol(R - 0.05), pol(R - 0.45)], zc - 0.05, zc + 0.22, "branco", "branco"))
    for k in range(n):
        a, b = pol(R - 0.03)[k], pol(R - 0.03)[(k + 1) % n]
        for j in range(6):
            t0, t1 = j / 6, (j + 1) / 6
            p0 = (a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0)
            p1 = (a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1)
            pm = ((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2)
            mm = Malha()
            vs = [mm.v((p0[0], p0[1], zc - 0.04)), mm.v((p1[0], p1[1], zc - 0.04)), mm.v((pm[0], pm[1], zc - 0.3))]
            mm.f(vs, "branco")
            mm.f(vs[::-1], "branco")
            ps.append(mm.obj("bico"))
    # telhado em dois níveis (verde com frisos brancos) e pináculo dourado
    m = Malha()
    perfil = [(R + 0.55, zc + 0.15), (R * 0.55, zc + 1.25), (R * 0.42, zc + 1.3)]
    an = [[m.v((r * math.cos(rot + 2 * math.pi * k / n), r * math.sin(rot + 2 * math.pi * k / n), z)) for k in range(n)]
          for r, z in perfil]
    for j in range(len(perfil) - 1):
        for k in range(n):
            k2 = (k + 1) % n
            m.f((an[j][k], an[j][k2], an[j + 1][k2], an[j + 1][k]), "verde_escuro" if j == 0 else "branco")
    for k in range(n):
        m.f((an[0][(k + 1) % n], an[0][k], an[1][k], an[1][(k + 1) % n]), "madeira_clara")
    tel = m.obj("telhado")
    pb._normais_para_fora(tel)
    ps.append(tel)
    # forro por baixo
    ps.append(pb.prisma([pol(R + 0.5)], zc + 0.13, zc + 0.16, "madeira_clara", "verde_escuro"))
    ps.append(mb.cilindro(R * 0.4, 0.5, z=zc + 1.3, seg=n, cor="branco", bisel=0.02))
    m2 = Malha()
    an2 = [[m2.v((r * math.cos(rot + 2 * math.pi * k / n), r * math.sin(rot + 2 * math.pi * k / n), z))
            for k in range(n)] for r, z in ((R * 0.62, zc + 1.78), (0.12, zc + 2.6))]
    for k in range(n):
        k2 = (k + 1) % n
        m2.f((an2[0][k], an2[0][k2], an2[1][k2], an2[1][k]), "verde_escuro")
    tel2 = m2.obj("cupula")
    pb._normais_para_fora(tel2)
    ps.append(tel2)
    ps.append(pb.prisma([pol(R * 0.62)], zc + 1.76, zc + 1.8, "branco", "branco"))
    ps.append(mb.torno([(0, 0), (0.1, 0), (0.06, 0.2), (0.12, 0.35), (0.04, 0.55), (0.02, 0.9), (0, 0.95)],
                       z=zc + 2.55, cor="ouro", seg=10))
    it.add(mb.junta(ps, "coreto"))
    # lanternas penduradas e cordão de luz na beirada
    luzes = []
    for k, (x, y) in enumerate(pol(R - 0.25)):
        if k % 2:
            continue
        luzes += [mb.tubo([(x * 0.86, y * 0.86, zc - 0.05), (x * 0.86, y * 0.86, zc - 0.45)], 0.01, cor="grafite",
                          seg=4),
                  mb.cilindro(0.1, 0.06, x=x * 0.86, y=y * 0.86, z=zc - 0.5, cor="grafite", seg=8, bisel=0.01)]
        it.add(mb.cilindro(0.08, 0.22, x=x * 0.86, y=y * 0.86, z=zc - 0.72, r2=0.1, cor=None, mat="luz", seg=8,
                           bisel=0.0))
    it.add(mb.junta(luzes, "lanternas"))
    bul = []
    pr = pol(R + 0.52)
    for k in range(n):
        a, b = pr[k], pr[(k + 1) % n]
        for j in range(5):
            t = (j + 0.5) / 5
            bul.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, zc + 0.08))
    it.add(pb.lampadas(bul, r=0.045))
    # bancos de dentro (para a banda) com assentos
    for ang in (90, 180, 0):
        a = math.radians(ang)
        x, y = 2.2 * math.cos(a), 2.2 * math.sin(a)
        it.add(banco(it, x, y, ang=ang + 90, z=zp, larg=1.5))
    # floreiras na base
    for k in range(n):
        x, y = pol(R + 0.35)[k]
        if y < -R * 0.6 and abs(x) < 1.5:
            continue
        it.add(arbusto(x, y, r=0.32, cor="folha" if k % 2 else "folha_escura", alt=0.5))
    col = [((0, 0, 0), (2 * R * 0.93, 2 * R * 0.93, zp))]
    for k in range(3):
        col.append(((0, -R * math.cos(math.pi / 8) - 0.19 - (2 - k) * 0.36 - 0.2, 0),
                    (1.9, 0.38 * (k + 1), zp * (k + 2) / 5)))
    col.append(((0, R * 0.88, zp), (3.2, 0.3, 1.0)))
    col.append(((-R * 0.88, 0, zp), (0.3, 3.2, 1.0)))
    col.append(((R * 0.88, 0, zp), (0.3, 3.2, 1.0)))
    return {"col": col, "mini": (0.55, -1.0, 0.45)}


def p_banco(it):
    it.add(banco(it, 0, 0, ang=0))
    return {"col": [((0, 0.02, 0), (1.8, 0.55, 0.9))], "mini": (0.6, -1.0, 0.45)}


def p_poste(it):
    it.add(poste_praca(0, 0))
    return {"col": [((0, 0, 0), (0.5, 0.5, 4.6))], "mini": (0.55, -1.0, 0.3)}
