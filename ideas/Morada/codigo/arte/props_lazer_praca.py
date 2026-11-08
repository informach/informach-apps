"""Peças de praça da categoria props_lazer: escadas de concreto (larga e estreita), arquibancada em degraus, banco
circular em volta de árvore, mesa de piquenique coberta e placa de direções. Usado por cidade_props_lazer.py."""
import math

import bpy  # noqa: F401
from mathutils import Vector

import moveis_base as mb
from props_lazer_base import Malha, arbusto, arvore, bola, cil, cx, esf, flores, gira_z, haste, mover, placa_estampa

V = Vector
EST = None


# =====================================================================================================================
# Escadas de praça
# =====================================================================================================================
def escada(it, W, n=8, alt=1.2, piso=0.35, patamar=1.2):
    """Escada de concreto subindo para +Y: n degraus até 'alt', patamar no alto, muretas laterais com corrimão.
    Origem no meio da largura e da profundidade total; o pé da escada fica em y = −prof/2."""
    e = alt / n
    prof = n * piso + patamar
    y0 = -prof / 2
    ps = []
    for k in range(n):
        y = y0 + k * piso
        ps.append(cx(W, prof - k * piso, e * (k + 1) - (e * k if k else 0), y=y + (prof - k * piso) / 2,
                     z=e * k if k else 0, cor="concreto", bisel=0.015))
        ps.append(cx(W - 0.04, 0.05, 0.012, y=y + 0.03, z=e * (k + 1), cor="concreto_escuro", bisel=0.0))
    ps.append(cx(W - 0.02, patamar - 0.02, 0.012, y=prof / 2 - patamar / 2, z=alt, cor="calcada", bisel=0.0))
    # muretas laterais (topo acompanhando os degraus) e corrimãos
    mw = 0.3
    for s in (-1, 1):
        x = s * (W / 2 + mw / 2)
        m = Malha()
        pts = [(y0, 0.0), (prof / 2, 0.0), (prof / 2, alt + 0.15), (y0 + n * piso, alt + 0.15), (y0, 0.25)]
        vf = [m.v((x - mw / 2, py, pz)) for py, pz in pts]
        vb = [m.v((x + mw / 2, py, pz)) for py, pz in pts]
        m.f(vf[::-1] if s > 0 else vf, "concreto_escuro")
        m.f(vb if s > 0 else vb[::-1], "concreto_escuro")
        for k in range(len(pts)):
            a, b = k, (k + 1) % len(pts)
            q = [vf[a], vf[b], vb[b], vb[a]]
            m.f(q if s > 0 else q[::-1], "concreto" if k >= 2 else "concreto_escuro")
        ps.append(m.obj("mureta", normais=True))
        xr = x
        topo = [(xr, y0 + 0.15, 0.25 + 0.9), (xr, y0 + n * piso, alt + 0.15 + 0.9), (xr, prof / 2 - 0.1, alt + 0.15 + 0.9)]
        ps.append(mb.tubo(topo, 0.03, cor="metal", raio_curva=0.3, seg=8))
        for t in (0.0, 0.5, 1.0):
            py = y0 + 0.15 + (n * piso - 0.15) * t
            pz = 0.25 + (alt + 0.15 - 0.25) * (py - y0) / (n * piso)
            ps.append(haste((xr, py, pz), (xr, py, pz + 0.9), 0.022, "metal", 6))
        ps.append(haste((xr, prof / 2 - 0.1, alt + 0.15), (xr, prof / 2 - 0.1, alt + 1.05), 0.022, "metal", 6))
    it.add(mb.junta(ps, "escada"))
    # floreiras no patamar e luzes de degrau (balizadores) nas muretas
    for s in (-1, 1):
        for k in (1, 4, 7):
            if k < n:
                it.add(cx(0.03, 0.14, 0.06, x=s * (W / 2 + 0.012), y=y0 + k * piso + piso / 2, z=e * (k + 1) + 0.08,
                          cor=None, mat="luz", bisel=0.01))
    # colisão: rampa invisível para andar e as duas muretas
    m = Malha()
    q = [(-W / 2, y0, 0.0), (W / 2, y0, 0.0), (W / 2, y0 + n * piso, alt), (-W / 2, y0 + n * piso, alt),
         (-W / 2, prof / 2, alt), (W / 2, prof / 2, alt), (W / 2, prof / 2, 0.0), (-W / 2, prof / 2, 0.0)]
    v = [m.v(p) for p in q]
    for f in ((0, 1, 2, 3), (3, 2, 5, 4), (4, 5, 6, 7), (7, 6, 1, 0), (0, 3, 4, 7), (1, 6, 5, 2)):
        m.f([v[i] for i in f], "concreto")
    rampa = m.obj("colisao_rampa", normais=True)
    it.add(rampa)
    it.colisao_malha(rampa, "colisao_rampa")
    col = [((s * (W / 2 + mw / 2), 0, 0), (mw, prof, alt + 0.15)) for s in (-1, 1)]
    return {"col": col, "mini": (0.6, -1.0, 0.7), "extra": {"desnivel": alt}}


def p_escada_larga(it):
    return escada(it, 6.0)


def p_escada_estreita(it):
    return escada(it, 2.4)


# =====================================================================================================================
# Arquibancada de praça
# =====================================================================================================================
def _setor(r0, r1, a0, a1, z0, z1, cor_topo, cor_lado, n=18):
    """Setor de anel (prisma) entre os raios r0 e r1 e os ângulos a0..a1 (graus), centro na origem."""
    m = Malha()
    ang = [math.radians(a0 + (a1 - a0) * k / n) for k in range(n + 1)]
    for r_, ext in ((r0, False), (r1, True)):
        for a, b in zip(ang, ang[1:]):
            q = [m.v((r_ * math.cos(a), r_ * math.sin(a), z0)), m.v((r_ * math.cos(b), r_ * math.sin(b), z0)),
                 m.v((r_ * math.cos(b), r_ * math.sin(b), z1)), m.v((r_ * math.cos(a), r_ * math.sin(a), z1))]
            m.f(q if ext else q[::-1], cor_lado)
    for a, b in zip(ang, ang[1:]):
        q = [m.v((r0 * math.cos(a), r0 * math.sin(a), z1)), m.v((r0 * math.cos(b), r0 * math.sin(b), z1)),
             m.v((r1 * math.cos(b), r1 * math.sin(b), z1)), m.v((r1 * math.cos(a), r1 * math.sin(a), z1))]
        m.f(q[::-1], cor_topo)
    for a, inv in ((ang[0], True), (ang[-1], False)):
        q = [m.v((r0 * math.cos(a), r0 * math.sin(a), z0)), m.v((r1 * math.cos(a), r1 * math.sin(a), z0)),
             m.v((r1 * math.cos(a), r1 * math.sin(a), z1)), m.v((r0 * math.cos(a), r0 * math.sin(a), z1))]
        m.f(q if inv else q[::-1], cor_lado)
    return m.obj("setor", liso=True, angulo=30, normais=True)


def p_arquibancada(it):
    """Quatro degraus em arco (abertos para −Y), assentos de madeira coloridos na frente de cada degrau."""
    Ri, nt, h, d = 5.0, 4, 0.42, 0.78
    a0, a1 = 60, 120
    cy = -Ri - nt * d / 2 + 0.3      # centro do arco: a arquibancada fica em volta da origem
    ps, col_ps = [], []
    for k in range(nt):
        r0, r1 = Ri + k * d, Ri + (k + 1) * d
        s = _setor(r0, r1 + (0.0 if k == nt - 1 else 0.001), a0, a1, 0.0, h * (k + 1), "concreto", "concreto_escuro")
        mover(s, 0, cy)
        ps.append(s)
        # tábuas do assento (cores alternadas por degrau)
        for b0, b1 in ((a0 + 1, 86.5), (93.5, a1 - 1)):  # tábuas dos dois lados da escadinha do meio
            tab = _setor(r0 + 0.04, r0 + 0.42, b0, b1, h * (k + 1), h * (k + 1) + 0.05,
                         ("laranja", "amarelo", "laranja_claro", "amarelo_escuro")[k], "madeira", n=8)
            mover(tab, 0, cy)
            ps.append(tab)
    # escadinha no meio (degraus intermediários de meia altura)
    for k in range(nt * 2):
        r = Ri + k * d / 2
        st = _setor(r, r + d / 2 + 0.002, 87, 93, 0.0, h / 2 * (k + 1), "concreto", "concreto_escuro", n=2)
        mover(st, 0, cy)
        ps.append(st)
    it.add(mb.junta(ps, "arquibancada"))
    # guarda-corpo atrás
    rt = Ri + nt * d - 0.08
    pts = [(rt * math.cos(math.radians(a)), cy + rt * math.sin(math.radians(a)), h * nt + 1.0)
           for a in range(a0 + 1, a1, 4)]
    it.add(mb.tubo(pts, 0.035, cor="metal", raio_curva=0.0, seg=8))
    for a in range(a0 + 2, a1, 10):
        x, y = rt * math.cos(math.radians(a)), cy + rt * math.sin(math.radians(a))
        it.add(haste((x, y, h * nt), (x, y, h * nt + 1.0), 0.025, "metal", 6))
    # colisão: os degraus (malha simples, sem tábuas)
    cm = []
    for k in range(nt):
        s = _setor(Ri + k * d, Ri + (k + 1) * d, a0, a1, 0.0, h * (k + 1), "concreto", "concreto", n=8)
        mover(s, 0, cy)
        cm.append(s)
    malha = mb.junta(cm, "colisao_degraus")
    it.add(malha)
    it.colisao_malha(malha, "colisao_degraus")
    # assentos: 3 por degrau
    n = 0
    for k in range(nt):
        r = Ri + k * d + 0.24
        for a in ((76, 98, 106) if k % 2 == 0 else (74, 82, 104)):
            aa = math.radians(a)
            n += 1
            it.assento(f"assento_{n}", round(r * math.cos(aa), 3), round(cy + r * math.sin(aa), 3),
                       round(h * (k + 1) + 0.05, 3))
    ymax = cy + (Ri + nt * d)
    return {"col": [((0, ymax - d * nt / 2, 0), (2 * (Ri + nt * d) * math.sin(math.radians(30)) * 0.9, d * nt * 0.7,
                                                  h * nt * 0.5))], "mini": (0.55, -1.0, 0.6)}


# =====================================================================================================================
# Banco circular em volta de árvore
# =====================================================================================================================
def p_banco_arvore(it):
    Rp, n = 0.8, 8
    ps = [mb.torno([(0, 0), (Rp + 0.05, 0), (Rp + 0.05, 0.4), (Rp + 0.1, 0.42), (Rp + 0.1, 0.5), (Rp - 0.12, 0.5),
                    (Rp - 0.12, 0.45), (0, 0.45)], cor="tijolo", seg=24),
          mb.torno([(Rp - 0.1, 0.5), (Rp + 0.08, 0.5), (Rp + 0.08, 0.54), (Rp - 0.1, 0.54)], cor="concreto", seg=24),
          cil(Rp - 0.12, 0.08, z=0.42, cor="terra", seg=20)]
    # banco octogonal: assento de ripas a 0,45 m, encosto do lado de dentro (gente olhando para fora)
    r0, r1 = Rp + 0.35, Rp + 0.82
    for k in range(n):
        a0, a1 = 2 * math.pi * k / n, 2 * math.pi * (k + 1) / n
        am = (a0 + a1) / 2
        for j in range(4):
            r = r0 + (r1 - r0) * (j + 0.5) / 4
            L = 2 * r * math.tan(math.pi / n) - 0.03
            rip = cx(L, 0.1, 0.045, cor="madeira_mel", bisel=0.012)
            gira_z(rip, math.degrees(am) + 90)
            mover(rip, r * math.cos(am), r * math.sin(am), 0.42)
            ps.append(rip)
        # encosto (duas ripas inclinadas) do lado da árvore
        for j, zz in enumerate((0.62, 0.78)):
            r = r0 - 0.02 - 0.04 * j
            L = 2 * r * math.tan(math.pi / n) - 0.03
            rip = cx(L, 0.035, 0.11, cor="madeira", bisel=0.0)
            gira_z(rip, math.degrees(am) + 90)
            mover(rip, r * math.cos(am), r * math.sin(am), zz)
            ps.append(rip)
        # pés (no canto de cada lado)
        for r in (r0 + 0.05, r1 - 0.05):
            x, y = r * math.cos(a0) / math.cos(math.pi / n), r * math.sin(a0) / math.cos(math.pi / n)
            ps.append(cx(0.07, 0.07, 0.42, x=x, y=y, cor="grafite", bisel=0.0))
        x, y = (r0 - 0.05) * math.cos(a0) / math.cos(math.pi / n), (r0 - 0.05) * math.sin(a0) / math.cos(math.pi / n)
        ps.append(cx(0.05, 0.05, 0.48, x=x, y=y, z=0.42, cor="grafite", bisel=0.0))
    it.add(mb.junta(ps, "banco"))
    it.add(arvore(0, 0, z=0.42, esc=1.15, seed=7, cores=("folha", "folha_escura", "verde_lima")))
    for k in range(5):
        a = 2 * math.pi * k / 5 + 0.3
        it.add(flores(0.5 * math.cos(a), 0.5 * math.sin(a), (("rosa", "branco"), ("amarelo", "laranja"))[k % 2],
                      z=0.5, n=3, alt=0.1))
    for k in range(n):
        am = 2 * math.pi * (k + 0.5) / n
        r = (r0 + r1) / 2 + 0.03
        it.assento(f"assento_{k + 1}", round(r * math.cos(am), 3), round(r * math.sin(am), 3), 0.465)
    R = r1 / math.cos(math.pi / n)
    return {"col": [((0, 0, 0), (2 * R * 0.93, 2 * R * 0.93, 0.47)), ((0, 0, 0), (0.5, 0.5, 3.0))],
            "mini": (0.55, -1.0, 0.55)}


# =====================================================================================================================
# Mesa de piquenique coberta
# =====================================================================================================================
def p_mesa_coberta(it):
    L, zt = 2.0, 0.75
    ps = [cx(L, 0.82, 0.06, z=zt - 0.06, cor="madeira_mel", bisel=0.015)]
    for k in range(5):
        ps.append(cx(L - 0.02, 0.005, 0.004, y=-0.33 + k * 0.165, z=zt, cor="madeira", bisel=0.0))
    for s in (-1, 1):
        ps.append(cx(L, 0.32, 0.05, y=s * 0.7, z=0.4, cor="madeira_mel", bisel=0.012))
    for sx in (-0.7, 0.7):  # cavaletes em A que seguram mesa e bancos
        for sy in (-1, 1):
            ps.append(haste((sx, sy * 0.78, 0.0), (sx, sy * 0.1, zt - 0.06), 0.045, "madeira", 6))
        ps.append(cx(0.08, 1.7, 0.08, x=sx, z=0.33, cor="madeira", bisel=0.015))
    # estrutura: um pilar em cada ponta, cumeeira e telhado de duas águas verde
    hp, ov = 2.25, 0.35
    for s in (-1, 1):
        x = s * (L / 2 + 0.25)
        ps += [cx(0.4, 0.4, 0.1, x=x, cor="concreto", bisel=0.02), cx(0.16, 0.16, hp, x=x, cor="madeira", bisel=0.02)]
        for sy in (-1, 1):
            ps.append(haste((x, 0, hp - 0.4), (x, sy * 0.6, hp + 0.02), 0.04, "madeira", 6))
    ps.append(cx(L + 1.0, 0.16, 0.16, z=hp, cor="madeira_escura", bisel=0.02))
    for sy in (-1, 1):
        ps.append(cx(L + 1.0, 0.1, 0.1, y=sy * 0.95, z=hp - 0.3, cor="madeira_escura", bisel=0.015))
    m = Malha()
    X, Y, zb, top = L / 2 + 0.25 + ov, 1.35, hp - 0.42, hp + 0.42
    for sy in (-1, 1):
        q = [(-X, sy * Y, zb), (X, sy * Y, zb), (X, 0, top), (-X, 0, top)]
        vs = [m.v(p) for p in q]
        m.f(vs if sy < 0 else vs[::-1], "verde")
        vs2 = [m.v((p[0], p[1], p[2] - 0.06)) for p in q]
        m.f(vs2[::-1] if sy < 0 else vs2, "madeira_clara")
        borda = [m.v(q[0]), m.v(q[1]), m.v((q[1][0], q[1][1], q[1][2] - 0.06)), m.v((q[0][0], q[0][1], q[0][2] - 0.06))]
        m.f(borda if sy > 0 else borda[::-1], "verde_escuro")
        for sx in (-1, 1):
            tri = [m.v((sx * X, sy * Y, zb)), m.v((sx * X, 0, top)), m.v((sx * X, 0, top - 0.06)),
                   m.v((sx * X, sy * Y, zb - 0.06))]
            m.f(tri if sx * sy > 0 else tri[::-1], "verde_escuro")
    ps.append(m.obj("telhado", normais=True))
    for k in range(5):  # telhas em faixas
        for sy in (-1, 1):
            t = (k + 1) / 6
            ps.append(cx(2 * X, 0.03, 0.02, y=sy * Y * (1 - t), z=zb + (top - zb) * t + 0.005, cor="verde_escuro",
                         bisel=0.0))
    ps.append(cx(2 * X + 0.05, 0.14, 0.06, z=top - 0.02, cor="verde_escuro", bisel=0.02))
    it.add(mb.junta(ps, "mesa"))
    it.add(haste((0, 0, hp), (0, 0, hp - 0.35), 0.008, "grafite", 4), cil(0.12, 0.08, z=hp - 0.42, r2=0.03,
                                                                          cor="grafite", seg=10),
           bola(0.07, 0, 0, hp - 0.47, mat="luz"))
    # toalha xadrez (quadradinhos) e cesta de piquenique
    for i in range(4):
        for j in range(3):
            if (i + j) % 2 == 0:
                it.add(cx(0.15, 0.15, 0.006, x=0.1 + i * 0.15, y=-0.15 + j * 0.15, z=zt, cor="vermelho", bisel=0.0))
            else:
                it.add(cx(0.15, 0.15, 0.005, x=0.1 + i * 0.15, y=-0.15 + j * 0.15, z=zt, cor="branco", bisel=0.0))
    it.add(cx(0.34, 0.24, 0.2, x=-0.5, z=zt, cor="caramelo", bisel=0.03),
           mb.tubo([(-0.64, 0, zt + 0.2), (-0.5, 0, zt + 0.36), (-0.36, 0, zt + 0.2)], 0.015, cor="madeira_media", seg=6,
                   raio_curva=0.06))
    for k in range(3):
        for s in (-1, 1):
            it.assento(f"assento_{len(it.slots) + 1}", -0.65 + 0.65 * k, s * 0.7, 0.45)
    return {"col": [((0, 0, 0), (L, 1.75, zt)), ((-(L / 2 + 0.25), 0, 0), (0.4, 0.4, hp)),
                    (((L / 2 + 0.25), 0, 0), (0.4, 0.4, hp))], "mini": (0.55, -1.0, 0.55)}


# =====================================================================================================================
# Placa de direções do parque
# =====================================================================================================================
def p_placa_direcoes(it):
    h = 2.7
    ps = [cil(0.09, h, cor="madeira", seg=8, r2=0.075), cx(0.32, 0.32, 0.16, cor="concreto", bisel=0.03),
          mb.torno([(0, h - 0.02), (0.12, h - 0.02), (0.12, h + 0.05), (0, h + 0.08)], cor="madeira_escura", seg=8)]
    it.add(mb.junta(ps, "poste"))
    setas = (("seta_zoo", 25, 2.25), ("seta_lago", 160, 1.95), ("seta_parquinho", -40, 1.65), ("seta_saida", 210, 1.35))
    for nome, ang, z in setas:
        L, a, e = 1.05, 0.26, 0.05
        forma = [(0.12, -a / 2), (L - 0.16, -a / 2), (L, 0.0), (L - 0.16, a / 2), (0.12, a / 2)]
        tabua = mb.extrudado(forma, e, y=-e / 2, plano="xz", cor="madeira_clara", bisel=0.012, seg=1)
        objs = [tabua]
        if EST:
            for sg in (-1, 1):
                objs.append(placa_estampa(EST(nome), 0.74, 0.2, 0.12 + 0.39, sg * (e / 2 + 0.002), 0.0,
                                          normal=(0, sg, 0), nome="texto"))
        for o in objs:
            gira_z(o, ang)
            mover(o, 0, 0, z)
            it.add(o)
    # lanterna no alto e passarinho cata-vento
    it.add(cil(0.1, 0.04, z=h + 0.08, cor="grafite", seg=8), cil(0.08, 0.24, z=h + 0.12, r2=0.1, cor=None, mat="luz",
                                                               seg=8),
           cil(0.14, 0.12, z=h + 0.36, r2=0.03, cor="grafite", seg=8))
    it.add(haste((0, 0, h + 0.48), (0, 0, h + 0.75), 0.01, "grafite", 4))
    pas = [mb.extrudado([(-0.18, 0.0), (0.06, 0.0), (0.14, 0.06), (0.1, 0.14), (0.02, 0.1), (-0.06, 0.04),
                         (-0.2, 0.12)], 0.015, y=-0.0075, plano="xz", cor="azul", bisel=0.004, seg=1)]
    mover(pas[0], 0, 0, h + 0.75)
    it.anima(pas, {"anima": "girar", "eixo": "y", "velocidade": 15}, "passarinho", pivo=(0, 0, h + 0.75))
    return {"col": [((0, 0, 0), (0.3, 0.3, h))], "mini": (0.55, -1.0, 0.4)}
