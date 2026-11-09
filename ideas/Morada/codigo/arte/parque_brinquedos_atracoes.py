"""Atrações da categoria parque_brinquedos: roda-gigante, carrossel, xícaras malucas, barco viking, torre de queda,
carrinhos bate-bate, trenzinho infantil e parque aquático.
"""
import math
import random

import bmesh
from mathutils import Matrix, Vector

import moveis_base as mb
import cidade_base as cb
import parque_brinquedos_base as pb

V = Vector
Z = V((0, 0, 1))


def conta(p, r, mat="luz"):
    """Lâmpada pequena (octaedro, 8 triângulos)."""
    bm = bmesh.new()
    x, y, z = p
    vs = [bm.verts.new((x + r, y, z)), bm.verts.new((x - r, y, z)), bm.verts.new((x, y + r, z)),
          bm.verts.new((x, y - r, z)), bm.verts.new((x, y, z + r)), bm.verts.new((x, y, z - r))]
    for a, b in ((0, 2), (2, 1), (1, 3), (3, 0)):
        bm.faces.new((vs[a], vs[b], vs[4]))
        bm.faces.new((vs[b], vs[a], vs[5]))
    return pb.obj("conta", bm, None, mat=mat, liso=False)


def circulo_pts(r, n, z=0.0, cx=0.0, cy=0.0, fase=0.0):
    return [(cx + r * math.cos(fase + 2 * math.pi * k / n), cy + r * math.sin(fase + 2 * math.pi * k / n), z)
            for k in range(n)]


def gira_z(objs, graus, centro=(0, 0, 0)):
    M = Matrix.Translation(centro) @ Matrix.Rotation(math.radians(graus), 4, "Z") @ Matrix.Translation(-V(centro))
    for o in (objs if isinstance(objs, (list, tuple)) else [objs]):
        o.data.transform(M)
    return objs


def degraus(x, y, larg, n, alt_total, prof=0.32, direcao=(0, -1), cor="concreto_escuro"):
    """Escada de n degraus subindo de (x, y) no chão até alt_total, no sentido oposto a 'direcao' (que aponta para
    quem chega)."""
    d = V((direcao[0], direcao[1], 0)).normalized()
    out = []
    for k in range(n):
        h = alt_total * (k + 1) / n
        c = V((x, y, 0)) + d * (prof * (n - 1 - k) + prof / 2)
        if abs(d.x) > 0.5:
            out.append(mb.caixa(prof, larg, h, x=c.x, y=c.y, z=0, cor=cor, bisel=0.02, seg=1, nome="degrau"))
        else:
            out.append(mb.caixa(larg, prof, h, x=c.x, y=c.y, z=0, cor=cor, bisel=0.02, seg=1, nome="degrau"))
    return out


# ======================================================================================================================
# Roda-gigante
# ======================================================================================================================
def roda_gigante(it):
    zc, R, Ri = 16.6, 12.4, 10.6
    yw = 0.95  # meia largura entre os dois aros
    est = []
    # base branca com sapatas amarelas, escada e plataforma de embarque
    est.append(mb.caixa(27.4, 10.4, 0.36, cor="branco", bisel=0.08, seg=2, nome="base"))
    est.append(mb.caixa(27.7, 10.7, 0.12, z=0.0, cor="concreto", bisel=0.03, seg=1, nome="rodape"))
    # canteiros, bancos e fila nas pontas da base (a roda passa por cima)
    for sx in (-1, 1):
        xc = sx * 10.6
        est.append(pb.anel_extrudado(mb.ret_arredondado(4.6, 3.0, 0.6, 3), mb.ret_arredondado(4.2, 2.6, 0.45, 3), 0.3,
                                     0.75, "rosa", bisel=0.04, seg_bisel=1, nome="canteiro"))
        mb.transforma(est[-1], loc=(xc, 2.4, 0))
        est.append(pb.plano([(x + xc, y + 2.4) for x, y in mb.ret_arredondado(4.25, 2.65, 0.45, 3)], 0.7, "grama",
                            nome="canteiro_grama"))
        for k in range(5):
            est.append(pb.arbusto(xc - 1.6 + k * 0.8, 2.4 + (0.4 if k % 2 else -0.4), 0.42,
                                  ("folha", "rosa", "folha_clara", "amarelo", "folha")[k], z=0.7))
        est.append(pb.grade([(xc - 2.2, -2.6, 0.36), (xc + 2.2, -2.6, 0.36)], alt=0.9, passo=1.1, cor="amarelo",
                            r=0.035))
        est.append(pb.grade([(xc - 2.2, -1.6, 0.36), (xc + 2.2, -1.6, 0.36)], alt=0.9, passo=1.1, cor="amarelo",
                            r=0.035))
        bc = [mb.caixa(1.8, 0.45, 0.08, z=0.42, cor="madeira_mel", bisel=0.02, seg=1),
              mb.caixa(1.8, 0.08, 0.4, y=0.22, z=0.55, cor="madeira_mel", bisel=0.02, seg=1)]
        for bx_ in (-0.75, 0.75):
            bc.append(mb.caixa(0.08, 0.45, 0.42, x=bx_, cor="grafite", bisel=0.01, seg=1))
        for o in bc:
            mb.transforma(o, loc=(xc, 4.6, 0.36))
        est += bc
    est.append(mb.caixa(4.4, 3.4, 1.0, y=0.2, z=0.36, cor="concreto", bisel=0.05, seg=2, nome="embarque"))
    est.append(mb.caixa(4.5, 0.14, 0.06, y=-1.52, z=1.34, cor="amarelo", bisel=0.02, seg=1))
    est += degraus(0, -3.5, 2.2, 4, 0.98, 0.42, (0, -1), "concreto_escuro")
    for k in range(4):  # listras no piso da base
        est.append(mb.caixa(0.22, 3.0, 0.02, x=-3.6 - k * 0.5, y=-3.6, z=0.36, cor="cinza_claro", bisel=0.0, liso=False))
    # pernas em A (rosa) dos dois lados, com sapatas amarelas
    for sy in (-1, 1):
        topo = V((0, sy * (yw + 0.55), zc))
        for sx in (-1, 1):
            pe = V((sx * 5.6, sy * 3.9, 0.36))
            est.append(pb.barra(pe, topo, 0.32, "rosa", 8, nome="perna"))
            est.append(mb.caixa(1.1, 1.1, 0.55, x=pe.x, y=pe.y, z=0.3, cor="amarelo", bisel=0.08, seg=2, nome="sapata"))
        est.append(pb.barra(V((-3.2, sy * 3.0, 6.4)), V((3.2, sy * 3.0, 6.4)), 0.16, "rosa", 8, nome="travessa"))
        est.append(mb.cilindro(0.85, 0.5, x=0, y=sy * (yw + 0.6), z=zc, cor="laranja", eixo="y", seg=20, bisel=0.06,
                               nome="mancal"))
    est.append(mb.cilindro(0.28, 2 * yw + 2.2, x=0, y=0, z=zc, cor="cinza_medio", eixo="y", seg=12, bisel=0.02,
                           nome="eixo"))
    # bilheteria laranja na frente, à direita
    bx, by = 4.6, -3.7
    est.append(mb.caixa(2.6, 1.9, 2.3, x=bx, y=by, z=0.36, cor="laranja", bisel=0.06, seg=2, nome="bilheteria"))
    est.append(mb.caixa(1.8, 0.08, 0.95, x=bx, y=by - 0.95, z=1.3, cor=None, mat="vidro", bisel=0.0, liso=False))
    est.append(mb.caixa(2.0, 0.3, 0.12, x=bx, y=by - 1.05, z=1.25, cor="branco", bisel=0.03, seg=1, nome="balcao"))
    teto = mb.caixa(3.2, 2.5, 0.22, x=bx, y=by - 0.1, z=2.66, cor="cinza_azulado", bisel=0.06, seg=2, nome="teto")
    est.append(teto)
    est.append(pb.placa_estampa("bilheteria.png", (bx, by - 1.36, 3.18), 2.6, 0.62, emissao=1.4, nome="letreiro"))
    est.append(mb.caixa(2.75, 0.1, 0.74, x=bx, y=by - 1.3, z=2.82, cor="laranja_escuro", bisel=0.03))
    it.add(est)
    luz_fixa = [mb.cilindro(0.16, 0.05, x=bx, y=by - 0.9, z=2.6, cor=None, mat="luz", seg=10, bisel=0.0)]
    # roda (gira no eixo Z do glTF = eixo Y do Blender)
    roda = []
    for sy in (-1, 1):
        y = sy * yw
        roda.append(pb.tubo(circulo_pts(R, 48), 0.13, "turquesa_claro", 6, fechado=True, nome="aro"))
        mb.transforma(roda[-1], rot=("X", 90))
        mb.transforma(roda[-1], loc=(0, y, zc))
        roda.append(pb.tubo(circulo_pts(Ri, 40), 0.1, "turquesa_claro", 6, fechado=True, nome="aro"))
        mb.transforma(roda[-1], rot=("X", 90))
        mb.transforma(roda[-1], loc=(0, y, zc))
        for k in range(16):
            a = 2 * math.pi * k / 16
            c = "amarelo" if k % 2 == 0 else "branco"
            p = V((R * math.cos(a), y, zc + R * math.sin(a)))
            roda.append(pb.barra(V((0.6 * math.cos(a), y * 1.1, zc + 0.6 * math.sin(a))), p, 0.09, c, 6, nome="raio"))
            a2 = 2 * math.pi * (k + 0.5) / 16
            pi_ = V((Ri * math.cos(a), y, zc + Ri * math.sin(a)))
            po_ = V((R * math.cos(a2), y, zc + R * math.sin(a2)))
            roda.append(pb.barra(pi_, po_, 0.06, c, 5, nome="trelica"))
            pi2 = V((Ri * math.cos(2 * math.pi * (k + 1) / 16), y, zc + Ri * math.sin(2 * math.pi * (k + 1) / 16)))
            roda.append(pb.barra(po_, pi2, 0.06, c, 5, nome="trelica"))
    for k in range(16):
        a = 2 * math.pi * k / 16
        for rr in (R, Ri):
            p = V((rr * math.cos(a), 0, zc + rr * math.sin(a)))
            roda.append(pb.barra(p - V((0, yw, 0)), p + V((0, yw, 0)), 0.07, "amarelo" if rr == R else "branco", 5,
                                 nome="travessa"))
    roda.append(mb.cilindro(1.05, 2 * yw + 0.4, x=0, y=0, z=zc, cor="laranja", eixo="y", seg=20, bisel=0.12,
                            nome="cubo"))
    for sy in (-1, 1):
        roda.append(mb.cilindro(0.6, 0.2, x=0, y=sy * (yw + 0.25), z=zc, cor="amarelo_escuro", eixo="y", seg=16,
                                bisel=0.05))
    nome_roda = "roda"
    it.anima(roda, {"anima": "girar", "eixo": "z", "velocidade": 6}, nome_roda, pivo=(0, 0, zc))
    # lâmpadas nos raios e nos aros (dois grupos que piscam fora de compasso)
    g1, g2 = [], []
    for sy in (-1, 1):
        y = sy * (yw + 0.12)
        for k in range(16):
            a = 2 * math.pi * k / 16
            for j, rr in enumerate((2.4, 4.4, 6.4, 8.4)):
                (g1 if (k + j) % 2 == 0 else g2).append(conta((rr * math.cos(a), y, zc + rr * math.sin(a)), 0.13))
        for k in range(48):
            a = 2 * math.pi * (k + 0.5) / 48
            (g1 if k % 2 == 0 else g2).append(conta(((R + 0.17) * math.cos(a), y, zc + (R + 0.17) * math.sin(a)),
                                                    0.14))
    it.anima(g1, {"anima": "piscar", "periodo": 0.9}, "lampadas_a", pivo=(0, 0, zc), pai=nome_roda)
    it.anima(g2, {"anima": "piscar", "periodo": 1.4}, "lampadas_b", pivo=(0, 0, zc), pai=nome_roda)
    # cabines penduradas (filhas da roda, giram ao contrário para ficar em pé)
    cores = ["rosa", "azul_celeste", "amarelo", "verde_agua", "lilas", "laranja_claro"]
    for k in range(12):
        a = 2 * math.pi * k / 12 - math.pi / 2
        pv = V((R * math.cos(a), 0, zc + R * math.sin(a)))
        cab = cabine(cores[k % len(cores)])
        for o in cab:
            o.data.transform(Matrix.Translation(pv))
        nm = f"cabine_{k + 1}"
        it.anima(cab, {"anima": "girar", "eixo": "z", "velocidade": -6}, nm, pivo=pv, pai=nome_roda)
        it.slot(f"assento_{k + 1}", (pv.x, pv.y + 0.25, pv.z - 2.0), (0.5, 0.5, 0.9), pai=nm)
    it.add(luz_fixa)
    it.colisao([((0, 0, 0), (27.4, 10.4, 0.36)), ((0, 0.2, 0.36), (4.4, 3.4, 1.0)), ((bx, by, 0.36), (2.6, 1.9, 2.3)),
                ((0, 0, 3.0), (26.0, 2.6, 26.2)),
                ((-5.6, -3.9, 0.3), (1.1, 1.1, 0.55)), ((5.6, -3.9, 0.3), (1.1, 1.1, 0.55)),
                ((-5.6, 3.9, 0.3), (1.1, 1.1, 0.55)), ((5.6, 3.9, 0.3), (1.1, 1.1, 0.55))])


def cabine(cor):
    """Cabine da roda (local: pivô no topo da haste, a cabine pendurada para baixo)."""
    o = []
    o.append(pb.barra((0, -0.2, 0.12), (0, 0.2, 0.12), 0.09, "cinza_medio", 6))
    o.append(pb.barra((0, 0, 0.1), (0, 0, -0.55), 0.06, "cinza_medio", 6, nome="haste"))
    o.append(mb.superelipsoide(1.75, 1.45, 0.42, z=-0.85, cor=cor, e=0.4, e_v=0.6, nu=16, nv=6, nome="teto"))
    o.append(mb.esfera(0.13, z=-0.42, cor="amarelo", seg=8))
    corpo = mb.superelipsoide(1.6, 1.35, 1.0, z=-2.55, cor=cor, e=0.35, e_v=0.45, nu=16, nv=8, nome="corpo")
    o.append(corpo)
    o.append(mb.caixa(1.48, 1.22, 0.62, z=-1.6, cor=None, mat="vidro", bisel=0.12, seg=1, liso=False))
    for sx in (-1, 1):
        for sy in (-1, 1):
            o.append(mb.cilindro(0.045, 0.66, x=sx * 0.7, y=sy * 0.58, z=-1.62, cor="branco", seg=5, bisel=0.0))
    o.append(mb.caixa(1.0, 0.36, 0.1, y=0.3, z=-2.05, cor="branco", bisel=0.03, seg=1, nome="banco"))
    return o


# ======================================================================================================================
# Carrossel de cavalinhos
# ======================================================================================================================
def cavalo(cor="branco", sela="rosa", crina="amarelo"):
    """Cavalinho (local: origem no meio do corpo, na haste; frente −Y)."""
    o = [mb.superelipsoide(0.5, 1.15, 0.52, z=-0.26, cor=cor, e=0.6, e_v=0.7, nu=12, nv=6, nome="corpo"),
         pb.tubo([(0, -0.36, 0.06), (0, -0.56, 0.34), (0, -0.7, 0.5)], 0.15, cor, 8, escalas=[1.0, 0.85, 0.78],
                 nome="pescoco")]
    cab = mb.superelipsoide(0.28, 0.62, 0.28, z=-0.14, cor=cor, e=0.6, e_v=0.7, nu=10, nv=5, nome="cabeca")
    mb.transforma(cab, rot=("X", -38))
    mb.transforma(cab, loc=(0, -0.93, 0.5))
    o.append(cab)
    o.append(mb.superelipsoide(0.24, 0.22, 0.2, x=0, y=-1.12, z=0.29, cor=cor, e=0.7, nu=8, nv=4, nome="focinho"))
    for sx in (-1, 1):
        o.append(mb.cilindro(0.045, 0.17, r2=0.01, x=sx * 0.08, y=-0.74, z=0.66, cor=cor, seg=4, bisel=0.0))
        o.append(pb.bola(sx * 0.125, -0.92, 0.6, 0.04, "preto", sub=0))
        o.append(pb.bola(sx * 0.06, -1.22, 0.31, 0.025, "grafite", sub=0))
    o.append(pb.tubo([(0, -0.3, 0.2), (0, -0.5, 0.46), (0, -0.66, 0.66)], 0.085, crina, 6, escalas=[0.9, 1.1, 0.9],
                     nome="crina"))
    o.append(pb.tubo([(0, 0.55, 0.05), (0, 0.74, -0.06), (0, 0.8, -0.38)], 0.075, crina, 6, escalas=[1, 1.1, 0.6],
                     nome="rabo"))
    for sx in (-1, 1):  # pernas galopando
        o.append(pb.tubo([(sx * 0.15, -0.36, -0.3), (sx * 0.15, -0.62, -0.52), (sx * 0.15, -0.5, -0.78)], 0.065, cor,
                         6, nome="perna"))
        o.append(pb.bola(sx * 0.15, -0.49, -0.83, 0.075, "ouro", sub=0))
        o.append(pb.tubo([(sx * 0.15, 0.36, -0.3), (sx * 0.15, 0.6, -0.6), (sx * 0.15, 0.8, -0.72)], 0.065, cor, 6,
                         nome="perna"))
        o.append(pb.bola(sx * 0.15, 0.83, -0.75, 0.075, "ouro", sub=0))
    o.append(mb.superelipsoide(0.56, 0.5, 0.12, y=0.02, z=-0.02, cor=sela, e=0.35, nu=8, nv=4, nome="sela"))
    o.append(mb.caixa(0.6, 0.12, 0.08, y=-0.14, z=0.02, cor="ouro", bisel=0.0, liso=False))
    return o


def carrossel(it):
    Rb = 6.3
    est = [mb.cilindro(Rb, 0.24, cor="concreto", seg=40, bisel=0.05, nome="base"),
           mb.cilindro(Rb - 0.35, 0.2, z=0.24, cor="rosa", seg=40, bisel=0.04, nome="degrau"),
           mb.cilindro(1.0, 0.5, z=0.44, cor="ouro_escuro", seg=20, bisel=0.04)]
    # tachinhas no rodapé
    for k in range(24):
        a = 2 * math.pi * k / 24
        est.append(pb.bola((Rb - 0.36) * math.cos(a), (Rb - 0.36) * math.sin(a), 0.34, 0.08, "amarelo", sub=0))
    it.add(est)
    z0 = 0.44  # piso que gira
    gir = [mb.cilindro(Rb - 0.55, 0.16, z=z0, cor="madeira_clara", seg=40, bisel=0.04, nome="piso"),
           mb.cilindro(Rb - 0.5, 0.1, z=z0 + 0.02, cor="ouro", seg=40, bisel=0.02, nome="friso")]
    for k in range(8):
        a = 2 * math.pi * (k + 0.5) / 8
        gir.append(pb.plano([(0, 0)] + [((Rb - 0.6) * math.cos(a + d), (Rb - 0.6) * math.sin(a + d))
                                         for d in (-0.2, 0.0, 0.2)], z0 + 0.165, "madeira_mel", nome="raio_piso"))
    zt = 4.3
    # coluna central espelhada
    gir.append(mb.cilindro(1.2, zt - z0, z=z0 + 0.16, cor="rosa_bebe", seg=16, bisel=0.05, nome="coluna"))
    for k in range(8):
        a = 2 * math.pi * k / 8
        pn = mb.caixa(0.62, 0.06, 2.4, z=z0 + 0.8, cor=None, mat="espelho", bisel=0.0, liso=False)
        mb.transforma(pn, loc=(0, -1.2, 0))
        gira_z(pn, math.degrees(a) + 90)
        gir.append(pn)
    for zz in (z0 + 0.6, z0 + 3.3):
        gir.append(mb.cilindro(1.28, 0.14, z=zz, cor="ouro", seg=16, bisel=0.03))
    # cobertura de lona listrada, com babado e coroa
    Rt = Rb + 0.2
    nt = 16
    cone = []
    for k in range(nt):
        a0, a1 = 2 * math.pi * k / nt, 2 * math.pi * (k + 1) / nt
        bm = bmesh.new()
        q = [bm.verts.new((Rt * math.cos(a0), Rt * math.sin(a0), zt + 0.25)),
             bm.verts.new((Rt * math.cos(a1), Rt * math.sin(a1), zt + 0.25)),
             bm.verts.new((0.6 * math.cos(a1), 0.6 * math.sin(a1), zt + 2.45)),
             bm.verts.new((0.6 * math.cos(a0), 0.6 * math.sin(a0), zt + 2.45))]
        mid = bm.verts.new(((Rt * 0.55) * math.cos((a0 + a1) / 2), (Rt * 0.55) * math.sin((a0 + a1) / 2), zt + 1.42))
        bm.faces.new((q[0], q[1], mid))
        bm.faces.new((q[1], q[2], mid))
        bm.faces.new((q[2], q[3], mid))
        bm.faces.new((q[3], q[0], mid))
        cone.append(pb.obj("lona", bm, "rosa" if k % 2 == 0 else "branco", liso=False))
    lona = mb.junta(cone, "lona")
    if sum(p.normal.z for p in lona.data.polygons) < 0:
        lona.data.flip_normals()
    gir.append(lona)
    gir.append(mb.cilindro(Rt, 0.3, z=zt, cor="amarelo", seg=40, bisel=0.05, nome="beiral"))
    gir.append(mb.cilindro(Rt - 0.3, 0.06, z=zt - 0.02, cor="lilas_claro", seg=40, bisel=0.0, nome="forro"))
    for k in range(nt * 2):
        a = 2 * math.pi * (k + 0.5) / (nt * 2)
        fl = mb.extrudado(mb._ccw([(-0.6, 0), (0.6, 0)] + [(0.6 * math.cos(math.pi * j / 8), -0.42 * math.sin(math.pi * j / 8))
                                                            for j in range(1, 8)]), 0.05, plano="xz",
                          cor="rosa" if k % 2 else "amarelo_claro", bisel=0.0, nome="babado", liso=False)
        mb.transforma(fl, loc=(0, -Rt - 0.02, zt + 0.02))
        gira_z(fl, math.degrees(a) + 90)
        gir.append(fl)
    gir.append(mb.cilindro(0.75, 0.5, z=zt + 2.4, cor="amarelo", seg=16, bisel=0.06))
    gir.append(mb.esfera(0.7, z=zt + 2.95, cor="rosa", esc=(1, 1, 0.8), seg=16))
    gir.append(mb.cilindro(0.04, 1.0, z=zt + 3.4, cor="ouro", seg=6, bisel=0.0))
    gir.append(mb.esfera(0.14, z=zt + 3.5, cor="ouro", seg=8))
    band = mb.extrudado(mb._ccw([(0, 0), (0.7, 0.12), (0, 0.42)]), 0.03, plano="xz", cor="azul_celeste", bisel=0.005,
                        seg=1)
    mb.transforma(band, loc=(0.03, 0, zt + 3.95))
    gir.append(band)
    # hastes e cavalos (8 por fora, 4 por dentro)
    vel_g = 20.0
    w = math.radians(vel_g)
    cavs = [("branco", "rosa", "amarelo"), ("creme", "azul_celeste", "laranja"), ("lilas_claro", "roxo", "rosa_bebe"),
            ("rosa_bebe", "turquesa", "amarelo_claro"), ("azul_bebe", "vermelho", "branco"), ("branco", "verde_agua", "lilas"),
            ("creme_claro", "laranja", "marrom_claro"), ("amarelo_claro", "azul", "rosa")]
    n_slot = 0
    for anel, (r, n, fase) in enumerate(((4.55, 8, 0.0), (2.85, 4, math.pi / 4))):
        C = 2 * math.pi * r
        npts = max(24, int(C / 0.5))
        A, kb = 0.2, 3
        pts = []
        for j in range(npts):
            th = 2 * math.pi * j / npts
            z = z0 + 1.55 + A * math.sin(kb * th)
            pts.append([round(r * math.cos(th), 3), round(z, 3), round(-r * math.sin(th), 3)])
        for i in range(n):
            th = fase + 2 * math.pi * i / n
            x, y = r * math.cos(th), r * math.sin(th)
            gir.append(mb.cilindro(0.045, zt - z0 - 0.16, x=x, y=y, z=z0 + 0.16, cor="ouro", seg=6, bisel=0.0))
            for zz in (z0 + 0.3, zt - 0.15):
                gir.append(mb.cilindro(0.08, 0.12, x=x, y=y, z=zz, cor="ouro_escuro", seg=6, bisel=0.02))
            c, s, cr = cavs[(i * 2 + anel * 3) % len(cavs)]
            zc = z0 + 1.55 + A * math.sin(kb * th)
            tang = V((-math.sin(th), math.cos(th), 0))
            M = pb.matriz_frente((x, y, zc), tang)
            atraso = round((C - r * th) % C, 3)
            nm = f"cavalo_{n_slot + 1}"
            it.anima_local(cavalo(c, s, cr), {"anima": "percurso", "pontos": pts, "velocidade": round(w * r, 4),
                                              "atraso": atraso, "fechado": True}, nm, M)
            n_slot += 1
            it.slot_local(f"assento_{n_slot}", (0, 0.02, 0.06), (0.5, 0.5, 0.9), nm)
    nome_g = "plataforma"
    it.anima(gir, {"anima": "girar", "eixo": "y", "velocidade": vel_g}, nome_g, pivo=(0, 0, 0))
    luzes = []
    for k in range(32):
        a = 2 * math.pi * k / 32
        luzes.append(conta(((Rt + 0.05) * math.cos(a), (Rt + 0.05) * math.sin(a), zt + 0.15), 0.1))
    for k in range(16):
        a = 2 * math.pi * (k + 0.5) / 16
        luzes.append(conta(((Rt - 0.55) * math.cos(a), (Rt - 0.55) * math.sin(a), zt - 0.06), 0.09))
    it.anima(luzes, {"anima": "piscar", "periodo": 1.1}, "lampadas", pivo=(0, 0, 0), pai=nome_g)
    it.colisao([((0, 0, 0), (2 * Rb, 2 * Rb, 0.44)), ((0, 0, 0.44), (2.5, 2.5, zt - 0.44)),
                ((0, 0, zt), (2 * Rt, 2 * Rt, 0.5))])


# ======================================================================================================================
# Xícaras malucas
# ======================================================================================================================
def xicara(cor, faixa="branco"):
    """Xícara giratória (local: origem no centro do pires, no piso)."""
    o = [mb.cilindro(1.3, 0.14, cor=faixa, seg=20, bisel=0.04, nome="pires"),
         mb.cilindro(1.38, 0.06, z=0.06, cor=cor, seg=20, bisel=0.0)]
    perfil = [(0, 0.14), (0.75, 0.14), (0.8, 0.22), (0.98, 0.45), (1.1, 0.8), (1.16, 1.18), (1.2, 1.32), (1.12, 1.34),
              (1.06, 1.2), (1.0, 0.85), (0.9, 0.55), (0, 0.5)]
    cx = mb.torno(perfil, cor=cor, seg=20, nome="xicara", angulo=50)
    mb.pinta_onde(cx, faixa, lambda c, n: c.z > 1.24)
    mb.pinta_onde(cx, "grafite_escuro", lambda c, n: c.z < 0.56 and (c.x * c.x + c.y * c.y) < 0.8)
    o.append(cx)
    o.append(mb.torno([(1.02, 0.62), (1.18, 0.66), (1.18, 0.74), (1.02, 0.7)], cor=faixa, seg=20))
    # asa
    o.append(pb.tubo([(0, 1.08, 1.05), (0, 1.55, 1.12), (0, 1.62, 0.78), (0, 1.35, 0.5), (0, 1.0, 0.45)], 0.1, cor, 6,
                     suave=2, nome="asa"))
    # banco em U e volante no meio
    arco_f = [(0.95 * math.cos(math.pi * (0.12 + 0.76 * k / 10)), 0.95 * math.sin(math.pi * (0.12 + 0.76 * k / 10)))
              for k in range(11)]
    arco_d = [(0.55 * math.cos(math.pi * (0.88 - 0.76 * k / 10)), 0.55 * math.sin(math.pi * (0.88 - 0.76 * k / 10)))
              for k in range(11)]
    o.append(mb.extrudado(mb._ccw(arco_f + arco_d), 0.3, z=0.5, cor="branco", bisel=0.04, seg=1, nome="banco"))
    o.append(mb.cilindro(0.07, 0.42, z=0.5, cor="cinza_claro", seg=8, bisel=0.0))
    o.append(mb.cilindro(0.34, 0.08, z=0.9, cor=faixa, seg=16, bisel=0.03, nome="volante"))
    o.append(mb.cilindro(0.12, 0.1, z=0.92, cor=cor, seg=10, bisel=0.02))
    return o


def bule(z0=0.0, cor="rosa", cor2="branco"):
    o = []
    o.append(mb.torno([(0, 0), (1.0, 0), (1.25, 0.25), (1.55, 0.9), (1.6, 1.45), (1.42, 2.0), (1.05, 2.35), (0, 2.38)],
                      z=z0, cor=cor, seg=28, nome="bule"))
    o.append(mb.torno([(0, 0), (1.08, 0), (1.1, 0.1), (0.85, 0.32), (0.3, 0.55), (0.12, 0.62), (0, 0.62)],
                      z=z0 + 2.3, cor=cor2, seg=24, nome="tampa"))
    o.append(mb.esfera(0.24, z=z0 + 3.08, cor=cor, seg=12))
    o.append(pb.tubo([(1.35, 0, z0 + 0.8), (2.0, 0, z0 + 1.1), (2.4, 0, z0 + 1.9), (2.6, 0, z0 + 2.2)], 0.28, cor, 10,
                     escalas=[1.0, 0.75, 0.6, 0.55], suave=3, nome="bico"))
    o.append(pb.tubo([(-1.35, 0, z0 + 1.9), (-2.1, 0, z0 + 1.95), (-2.25, 0, z0 + 1.2), (-1.5, 0, z0 + 0.6)], 0.17, cor2,
                     8, suave=3, nome="alca"))
    o.append(mb.torno([(1.5, 0.95), (1.66, 1.0), (1.66, 1.18), (1.52, 1.22)], z=z0, cor=cor2, seg=28))
    for k in range(8):  # bolinhas
        a = 2 * math.pi * k / 8 + 0.2
        p = V((1.56 * math.cos(a), 1.56 * math.sin(a), z0 + 1.55))
        b = mb.cilindro(0.17, 0.05, cor=cor2, seg=10, bisel=0.0)
        q = V((math.cos(a), math.sin(a), 0.05)).normalized()
        b.data.transform(Matrix.Translation(p) @ q.to_track_quat("Z", "Y").to_matrix().to_4x4())
        o.append(b)
    return o


def xicaras(it):
    Rb, Rp = 7.1, 6.3
    est = [mb.cilindro(Rb, 0.3, cor="lilas_claro", seg=48, bisel=0.06, nome="base"),
           mb.cilindro(Rb + 0.1, 0.1, z=0.0, cor="concreto", seg=48, bisel=0.02),
           mb.cilindro(1.45, 1.2, z=0.3, cor="branco", seg=24, bisel=0.06, nome="pedestal"),
           mb.cilindro(1.55, 0.14, z=1.36, cor="ouro", seg=24, bisel=0.03)]
    est += bule(1.5, "rosa", "branco")
    # cerquinha com portão na frente
    pts = [(Rb - 0.18) * V((math.cos(a), math.sin(a), 0)) + V((0, 0, 0.3))
           for a in [math.radians(-70 + 320 * k / 24) for k in range(25)]]
    est.append(pb.grade(pts, alt=0.9, passo=1.3, cor="branco", r=0.04, nome="cerca"))
    for a in (-70, 250):
        x, y = (Rb - 0.18) * math.cos(math.radians(a)), (Rb - 0.18) * math.sin(math.radians(a))
        est.append(mb.cilindro(0.12, 1.2, x=x, y=y, z=0.3, cor="rosa", seg=10, bisel=0.03))
        est.append(mb.esfera(0.16, x=x, y=y, z=1.58, cor="amarelo", seg=10))
    est.append(pb.placa_estampa("xicaras.png", (0, -Rb + 0.08, 2.55), 2.8, 0.7, emissao=1.4, nome="letreiro"))
    for sx in (-1, 1):
        est.append(mb.cilindro(0.07, 2.6, x=sx * 1.5, y=-Rb + 0.14, z=0.3, cor="rosa", seg=8, bisel=0.0))
    est.append(mb.caixa(3.1, 0.1, 0.86, y=-Rb + 0.15, z=2.12, cor="lilas", bisel=0.04))
    luzes = []
    for k in range(10):
        a = math.radians(-70 + 320 * (k + 0.5) / 10)
        x, y = (Rb - 0.18) * math.cos(a), (Rb - 0.18) * math.sin(a)
        luzes.append(pb.bola(x, y, 1.32, 0.13, None, mat="luz", sub=1))
    it.add(est)
    gir = [mb.cilindro(Rp, 0.14, z=0.3, cor="branco", seg=48, bisel=0.04, nome="prato")]
    for k in range(12):
        a0, a1 = 2 * math.pi * k / 12, 2 * math.pi * (k + 1) / 12
        pts2 = [(1.7 * math.cos(a0), 1.7 * math.sin(a0))] + [((Rp - 0.25) * math.cos(a0 + (a1 - a0) * j / 4),
                                                               (Rp - 0.25) * math.sin(a0 + (a1 - a0) * j / 4))
                                                              for j in range(5)] + [(1.7 * math.cos(a1), 1.7 * math.sin(a1))]
        gir.append(pb.plano(pts2, 0.445, "rosa_claro" if k % 2 else "lilas_claro", nome="gomo"))
    gir.append(mb.torno([(Rp - 0.05, 0.3), (Rp + 0.08, 0.36), (Rp + 0.08, 0.44), (Rp - 0.05, 0.46)], cor="roxo", seg=48))
    gir.append(pb.tubo(circulo_pts(Rp + 0.1, 48, 0.4), 0.035, None, 5, fechado=True, nome="neon"))
    mb.pinta(gir[-1], None, mat="neon_roxo")
    nome_p = "prato"
    it.anima(gir, {"anima": "girar", "eixo": "y", "velocidade": 14}, nome_p, pivo=(0, 0, 0))
    cores = [("rosa", "branco"), ("azul_celeste", "branco"), ("amarelo", "laranja"), ("verde_agua", "branco"),
             ("lilas", "amarelo_claro"), ("laranja_claro", "branco")]
    for k in range(6):
        a = 2 * math.pi * k / 6 + math.pi / 6
        cx, cy = 4.1 * math.cos(a), 4.1 * math.sin(a)
        c, f = cores[k]
        objs = xicara(c, f)
        for o in objs:
            mb.transforma(o, rot=("Z", math.degrees(a) + 90))
            mb.transforma(o, loc=(cx, cy, 0.44))
        nm = f"xicara_{k + 1}"
        it.anima(objs, {"anima": "girar", "eixo": "y", "velocidade": 55 if k % 2 == 0 else -42}, nm,
                 pivo=(cx, cy, 0.44), pai=nome_p)
        for j, sx in enumerate((-0.42, 0.42)):
            ang = math.radians(math.degrees(a) + 90)
            lx, ly = sx, 0.72
            px = cx + lx * math.cos(ang) - ly * math.sin(ang)
            py = cy + lx * math.sin(ang) + ly * math.cos(ang)
            it.slot(f"assento_{2 * k + j + 1}", (px, py, 0.44 + 0.8), (0.5, 0.5, 0.9), pai=nm)
    it.add(luzes)
    it.colisao([((0, 0, 0), (2 * Rb, 2 * Rb, 0.44)), ((0, 0, 0.44), (3.0, 3.0, 4.2))])


# ======================================================================================================================
# Barco viking
# ======================================================================================================================
def casco(L=12.6, B=4.1, prof=2.1, n=24, m=12):
    """Casco em lofting: seções em U ao longo de X, com proa e popa subindo."""
    bm = bmesh.new()
    secs = []
    for i in range(n + 1):
        u = -1 + 2 * i / n
        x = u * L / 2
        w = B / 2 * max(0.06, (1 - abs(u) ** 2.4)) ** 0.6
        topo = 0.0 + 0.55 * abs(u) ** 3
        fundo = -prof * (1 - abs(u) ** 2.2) + topo * 0.6
        sec = []
        for j in range(m + 1):
            a = math.pi * j / m
            y = -w * math.cos(a)
            zz = topo + (fundo - topo) * math.sin(a) ** 0.8
            sec.append(bm.verts.new((x, y, zz)))
        secs.append(sec)
    for A, Bs in zip(secs, secs[1:]):
        for j in range(m):
            bm.faces.new((A[j], A[j + 1], Bs[j + 1], Bs[j]))
    # borda de cima (fecha o casco por dentro com espessura pequena: uma tampa de convés mais baixa)
    ob = pb.obj("casco", bm, "madeira_media", liso=True, angulo=40)
    return ob


def barco_viking(it):
    zp = 11.2
    est = [mb.caixa(14.4, 8.6, 0.36, cor="concreto", bisel=0.08, seg=2, nome="base"),
           mb.caixa(14.6, 8.8, 0.1, z=0.0, cor="concreto_escuro", bisel=0.03, seg=1),
           mb.caixa(5.0, 3.2, 0.06, z=0.36, cor="madeira_mel", bisel=0.02, seg=1, nome="piso_embarque")]
    for k in range(8):
        est.append(mb.caixa(0.04, 3.2, 0.02, x=-2.2 + k * 0.63, z=0.42, cor="madeira", bisel=0.0, liso=False))
    est += degraus(0, -4.3, 2.4, 2, 0.36, 0.4, (0, -1), "concreto_escuro")
    # cavaletes em A na frente e atrás do barco
    for sy in (-1, 1):
        ap = V((0, sy * 2.75, zp))
        for sx in (-1, 1):
            pe = V((sx * 6.2, sy * 3.5, 0.36))
            est.append(pb.barra(pe, ap, 0.26, "amarelo_escuro", 8, nome="perna"))
            est.append(mb.caixa(0.9, 0.9, 0.4, x=pe.x, y=pe.y, z=0.3, cor="vermelho", bisel=0.06, seg=1))
        est.append(pb.barra(V((-3.4, sy * 3.1, 5.4)), V((3.4, sy * 3.1, 5.4)), 0.15, "amarelo_escuro", 8))
        est.append(mb.cilindro(0.7, 0.5, x=0, y=sy * 2.85, z=zp, cor="vermelho", eixo="y", seg=16, bisel=0.06))
    est.append(mb.cilindro(0.25, 6.2, y=0, z=zp, cor="cinza_medio", eixo="y", seg=12, bisel=0.02, nome="eixo"))
    # cerca em volta (com abertura na frente)
    for sx in (-1, 1):
        est.append(pb.grade([(sx * 1.3, -4.0, 0.36), (sx * 6.95, -4.0, 0.36), (sx * 6.95, 4.0, 0.36), (0, 4.0, 0.36)],
                            alt=1.0, passo=1.5, cor="vermelho", r=0.04))
    est.append(pb.placa_estampa("viking.png", (0, -4.18, 1.95), 2.6, 0.65, emissao=1.4, nome="letreiro"))
    for sx in (-1, 1):
        est.append(mb.cilindro(0.07, 2.4, x=sx * 1.3, y=-4.1, z=0.36, cor="amarelo_escuro", seg=8, bisel=0.0))
    est.append(mb.caixa(2.85, 0.1, 0.82, y=-4.1, z=1.55, cor="vermelho", bisel=0.03))
    it.add(est)
    # barco (balança no eixo Z do glTF = Y do Blender, em volta do eixo)
    zb = 3.1  # borda do casco no meio
    b = []
    hull = casco()
    mb.transforma(hull, loc=(0, 0, zb))
    b.append(hull)
    # amurada (borda) e faixa listrada no costado
    for sy in (-1, 1):
        borda, faixa_ = [], []
        for i in range(25):
            u = -0.96 + 1.92 * i / 24
            x = u * 6.3
            w = 4.1 / 2 * max(0.06, (1 - abs(u) ** 2.4)) ** 0.6
            zt = zb + 0.55 * abs(u) ** 3
            borda.append((x, sy * w, zt + 0.02))
            faixa_.append((x, sy * (w * 0.985 + 0.02), zt - 0.95))
        b.append(pb.tubo(borda, 0.11, "amarelo_escuro", 6, nome="amurada"))
        b.append(pb.tubo(faixa_, 0.08, "vermelho", 6, nome="friso"))
    # faixa pintada e escudos
    cores_esc = ["vermelho", "azul", "amarelo", "verde", "vermelho", "azul", "amarelo"]
    for sy in (-1, 1):
        for k in range(7):
            x = -4.5 + k * 1.5
            u = 2 * x / 12.6
            w = 4.1 / 2 * max(0.06, (1 - abs(u) ** 2.4)) ** 0.6
            zt = zb + 0.55 * abs(u) ** 3
            esc = mb.cilindro(0.48, 0.1, cor=cores_esc[k], eixo="y", seg=14, bisel=0.03, nome="escudo")
            mb.transforma(esc, loc=(x, sy * (w + 0.02), zt - 0.42))
            b.append(esc)
            b.append(mb.esfera(0.13, x=x, y=sy * (w + 0.09), z=zt - 0.42, cor="ouro", seg=8))
    # convés e bancos em degraus
    b.append(mb.caixa(10.0, 2.7, 0.12, z=zb - 1.15, cor="madeira_mel", bisel=0.03, seg=1, nome="conves"))
    for k, x in enumerate((-4.4, -2.65, -0.9, 0.9, 2.65, 4.4)):
        h = 0.5 + 0.12 * abs(x)
        b.append(mb.caixa(0.5, 2.5, h, x=x, z=zb - 1.12, cor="madeira_clara", bisel=0.04, seg=1, nome="banco"))
        b.append(mb.caixa(0.12, 2.5, 0.5, x=x + 0.31 * (1 if x > 0 else -1), z=zb - 1.12 + h, cor="madeira",
                          bisel=0.03, seg=1, nome="encosto"))
        b.append(pb.tubo([(x - 0.3, -1.2, zb - 1.12 + h + 0.5), (x - 0.3, 1.2, zb - 1.12 + h + 0.5)], 0.04, "amarelo",
                         6, nome="trava"))
    # proa de dragão (verde, fofa) e popa enrolada
    proa = [pb.tubo([(5.9, 0, zb + 0.2), (6.6, 0, zb + 1.1), (6.7, 0, zb + 2.2), (6.3, 0, zb + 2.9)], 0.42, "verde", 10,
                    escalas=[1.0, 0.85, 0.75, 0.7], suave=3, nome="pescoco")]
    proa.append(mb.superelipsoide(1.15, 0.85, 0.8, x=6.55, y=0, z=zb + 2.75, cor="verde", e=0.7, e_v=0.7, nu=14, nv=7))
    proa.append(mb.superelipsoide(0.6, 0.6, 0.45, x=7.15, y=0, z=zb + 2.85, cor="verde_claro", e=0.7, nu=12, nv=6))
    for sy in (-1, 1):
        proa.append(mb.esfera(0.2, x=6.75, y=sy * 0.36, z=zb + 3.05, cor="branco", seg=10))
        proa.append(mb.esfera(0.11, x=6.86, y=sy * 0.42, z=zb + 3.07, cor="preto", seg=8))
        ch = mb.cilindro(0.11, 0.45, r2=0.02, cor="amarelo", seg=6, bisel=0.0)
        mb.transforma(ch, rot=("Y", -30))
        mb.transforma(ch, loc=(6.3, sy * 0.3, zb + 3.1))
        proa.append(ch)
    for k in range(4):
        e = mb.cilindro(0.16, 0.36, r2=0.03, cor="amarelo", seg=6, bisel=0.0)
        mb.transforma(e, rot=("Y", -50 + k * 10))
        mb.transforma(e, loc=(6.3 - 0.08 * k, 0, zb + 0.9 + k * 0.55 - 0.3 + 0.0 * k))
        proa.append(e)
    b += proa
    b.append(pb.tubo([(-5.9, 0, zb + 0.2), (-6.6, 0, zb + 1.2), (-6.5, 0, zb + 2.3), (-6.0, 0, zb + 2.5),
                      (-5.85, 0, zb + 2.05)], 0.36, "verde", 10, escalas=[1.0, 0.8, 0.6, 0.45, 0.3], suave=3,
                     nome="cauda"))
    # mastro com vela listrada
    b.append(mb.cilindro(0.12, 6.6, z=zb - 1.1, cor="madeira_escura", seg=8, bisel=0.02, nome="mastro"))
    b.append(pb.barra((0, -1.9, zb + 5.0), (0, 1.9, zb + 5.0), 0.08, "madeira_escura", 6))
    for k in range(6):
        yc = -1.5 + k * 0.6
        bojo = 0.35 * math.cos(yc / 1.9 * math.pi / 2)
        for j, (z0_, h_) in enumerate(((zb + 2.6, 1.2), (zb + 3.75, 1.2))):
            st = mb.caixa(0.06, 0.6, h_, x=0.0, y=yc, z=z0_, cor="vermelho" if k % 2 == 0 else "branco", bisel=0.0,
                          liso=False, nome="vela")
            mb.transforma(st, loc=(0.12 + bojo * 0.5, 0, 0))
            b.append(st)
    # braços até o eixo
    for sy in (-1, 1):
        for sx in (-1, 1):
            b.append(pb.barra(V((0, sy * 2.15, zp)), V((sx * 3.4, sy * 1.55, zb + 0.15)), 0.17, "vermelho", 8,
                              nome="braco"))
        b.append(pb.barra(V((-2.3, sy * 1.75, zb + 2.6)), V((2.3, sy * 1.75, zb + 2.6)), 0.1, "vermelho", 6))
        b.append(mb.cilindro(0.42, 0.4, x=0, y=sy * 2.2, z=zp, cor="cinza_claro", eixo="y", seg=14, bisel=0.04))
    nome_b = "barco"
    it.anima(b, {"anima": "balancar", "angulo": 38, "periodo": 6.5, "eixo": "z"}, nome_b, pivo=(0, 0, zp))
    for k, x in enumerate((-4.4, -2.65, -0.9, 0.9, 2.65, 4.4)):
        h = 0.5 + 0.12 * abs(x)
        for j, y in enumerate((-0.6, 0.6)):
            it.slot(f"assento_{2 * k + j + 1}", (x, y, zb - 1.12 + h), (0.5, 0.5, 0.9), pai=nome_b)
    it.colisao([((0, 0, 0), (14.4, 8.6, 0.36)), ((0, 0, 0.36), (13.4, 5.0, 11.5)), ((0, -4.7, 0), (2.4, 0.8, 0.36)),
                ((-6.2, -3.5, 0.3), (0.9, 0.9, 0.4)), ((6.2, -3.5, 0.3), (0.9, 0.9, 0.4)),
                ((-6.2, 3.5, 0.3), (0.9, 0.9, 0.4)), ((6.2, 3.5, 0.3), (0.9, 0.9, 0.4))])


# ======================================================================================================================
# Torre de queda
# ======================================================================================================================
def torre_queda(it):
    H = 38.0
    est = [mb.cilindro(4.2, 0.3, cor="concreto", seg=36, bisel=0.06, nome="base"),
           mb.cilindro(3.9, 0.22, z=0.3, cor="lilas", seg=36, bisel=0.04),
           mb.cilindro(1.6, 1.6, z=0.52, cor="branco", seg=24, bisel=0.08, nome="pe_torre")]
    est.append(mb.cilindro(0.95, H - 2.0, z=2.0, cor="roxo", seg=8, bisel=0.03, nome="torre"))
    for k in range(9):
        est.append(mb.cilindro(1.02, 0.35, z=4.0 + k * 3.8, cor="branco", seg=8, bisel=0.04))
    est.append(mb.cilindro(1.9, 1.2, z=H - 0.4, cor="roxo_escuro", seg=16, bisel=0.12, nome="topo"))
    est.append(mb.cilindro(2.1, 0.28, z=H - 0.5, cor="amarelo", seg=16, bisel=0.06))
    est.append(mb.cilindro(1.2, 1.0, z=H + 0.8, r2=0.4, cor="branco", seg=12, bisel=0.05))
    est.append(mb.cilindro(0.06, 3.0, z=H + 1.8, cor="cinza_claro", seg=6, bisel=0.0, nome="antena"))
    for k in range(4):
        a = -math.pi / 2 + k * math.pi / 2
        est.append(pb.placa_estampa("torre.png", (2.12 * math.cos(a), 2.12 * math.sin(a), H + 0.2), 2.6, 0.65,
                                    frente=(math.cos(a), math.sin(a), 0), emissao=1.6, nome="letreiro"))
    # trilhos guia e neon roxo subindo a torre
    neon = []
    for k in range(3):
        a = 2 * math.pi * k / 3 + math.pi / 6
        x, y = 0.97 * math.cos(a), 0.97 * math.sin(a)
        est.append(mb.caixa(0.22, 0.22, H - 3.0, x=x, y=y, z=2.4, cor="cinza_claro", bisel=0.04, seg=1, nome="guia"))
        nb = mb.caixa(0.08, 0.08, H - 3.6, x=1.06 * math.cos(a + 0.5), y=1.06 * math.sin(a + 0.5), z=2.8, cor=None,
                      mat="neon_roxo", bisel=0.0, liso=False)
        neon.append(nb)
    est += neon
    # grade de fila e cobertura de espera
    est.append(pb.grade([((3.7) * math.cos(math.radians(a)), 3.7 * math.sin(math.radians(a)), 0.52)
                         for a in range(-60, 241, 15)], alt=1.0, passo=1.4, cor="branco", r=0.035))
    it.add(est)
    # elevador (sobe pela torre e despenca: "deslizar" com perfil de queda) levando a gôndola em anel, que gira devagar
    zg = 2.5
    curso = round(H - 4.6 - zg, 2)  # do pé até perto do topo (a luva para abaixo do chapéu)
    elev = [pb.anel_extrudado(mb.circulo(1.25, 24), mb.circulo(1.1, 24), zg + 0.15, zg + 2.8, "amarelo_escuro",
                              nome="luva"),
            pb.anel_extrudado(mb.circulo(1.4, 24), mb.circulo(1.1, 24), zg + 2.6, zg + 2.9, "roxo_escuro", nome="freio")]
    for k in range(3):
        a = 2 * math.pi * k / 3 + math.pi / 6
        elev.append(mb.caixa(0.36, 0.36, 0.5, x=1.18 * math.cos(a), y=1.18 * math.sin(a), z=zg + 2.3, cor="cinza_medio",
                             bisel=0.04, seg=1, nome="patim"))
    nome_e = "elevador"
    it.anima(elev, {"anima": "deslizar", "eixo": "y", "curso": curso, "periodo": 16, "perfil": "queda"}, nome_e,
             pivo=(0, 0, zg))
    g = [pb.anel_extrudado(mb.circulo(2.55, 32), mb.circulo(1.28, 32), zg - 0.2, zg + 0.15, "amarelo", bisel=0.06,
                           nome="anel")]
    for k in range(12):
        a = 2 * math.pi * k / 12
        c, s_ = math.cos(a), math.sin(a)
        assento = [mb.superelipsoide(0.56, 0.5, 0.16, x=0, y=0, z=0, cor="azul", e=0.35, nu=10, nv=4),
                   mb.superelipsoide(0.56, 0.16, 0.95, x=0, y=0.27, z=0.05, cor="azul", e=0.35, nu=10, nv=4),
                   pb.tubo([(-0.24, -0.1, 0.95), (-0.26, -0.3, 0.62), (0.26, -0.3, 0.62), (0.24, -0.1, 0.95)], 0.045,
                           "amarelo", 6)]
        for o in assento:
            mb.transforma(o, rot=("Z", math.degrees(a) + 90))
            mb.transforma(o, loc=(2.0 * c, 2.0 * s_, zg + 0.15))
        g += assento
    nome_g = "gondola"
    it.anima(g, {"anima": "girar", "eixo": "y", "velocidade": 12}, nome_g, pivo=(0, 0, zg), pai=nome_e)
    for k in range(12):
        a = 2 * math.pi * k / 12
        it.slot(f"assento_{k + 1}", (2.0 * math.cos(a) * 1.02, 2.0 * math.sin(a) * 1.02, zg + 0.31), (0.5, 0.5, 0.9),
                pai=nome_g)
    luzes = []
    for k in range(24):
        a = 2 * math.pi * k / 24
        luzes.append(conta((2.17 * math.cos(a), 2.17 * math.sin(a), H - 0.36), 0.12))
        if k % 2 == 0:
            luzes.append(conta((1.95 * math.cos(a), 1.95 * math.sin(a), H + 0.82), 0.1))
    luzes.append(mb.esfera(0.16, z=H + 4.85, cor=None, mat="luz_vermelha", seg=8))
    it.anima(luzes, {"anima": "piscar", "periodo": 0.7}, "lampadas", pivo=(0, 0, H))
    it.colisao([((0, 0, 0), (8.4, 8.4, 0.52)), ((0, 0, 0.52), (3.2, 3.2, 1.6)), ((0, 0, 2.1), (2.0, 2.0, H - 2.1)),
                ((0, 0, H - 0.6), (4.4, 4.4, 4.8))])


# ======================================================================================================================
# Carrinhos bate-bate (pista coberta)
# ======================================================================================================================
def carro_bate(cor):
    """Carrinho bate-bate (local: origem no piso, no meio; frente −Y) com a haste até o teto."""
    o = [pb.anel_extrudado(mb.ret_arredondado(1.6, 2.1, 0.7, 4), mb.ret_arredondado(1.3, 1.8, 0.56, 4), 0.05, 0.38,
                           "borracha", bisel=0.05, seg_bisel=1, nome="para_choque")]
    o.append(mb.superelipsoide(1.36, 1.86, 0.5, z=0.12, cor=cor, e=0.35, e_v=0.5, nu=14, nv=6, nome="corpo"))
    o.append(mb.superelipsoide(1.0, 0.75, 0.62, y=0.42, z=0.3, cor=cor, e=0.4, e_v=0.6, nu=12, nv=6, nome="traseira"))
    o.append(mb.superelipsoide(0.78, 0.5, 0.18, y=0.12, z=0.52, cor="grafite", e=0.3, nu=10, nv=4, nome="banco"))
    o.append(mb.superelipsoide(0.78, 0.16, 0.5, y=0.38, z=0.6, cor="grafite", e=0.3, nu=10, nv=4, nome="encosto"))
    o.append(pb.barra((0, -0.55, 0.55), (0, -0.35, 0.85), 0.03, "cinza_claro", 6))
    vol = mb.torno([(0.17, -0.02), (0.2, 0), (0.2, 0.03), (0.17, 0.05), (0.15, 0.02)], cor="preto", seg=12)
    mb.transforma(vol, rot=("X", 55))
    mb.transforma(vol, loc=(0, -0.35, 0.86))
    o.append(vol)
    o.append(pb.bola(0.0, -0.95, 0.42, 0.11, "amarelo_claro", sub=1, esc=(1.6, 0.6, 1)))
    o.append(mb.cilindro(0.035, 3.2, y=0.72, z=0.62, cor="cinza_claro", seg=6, bisel=0.0, nome="haste"))
    o.append(mb.cilindro(0.08, 0.12, y=0.72, z=3.82, cor="grafite", seg=8, bisel=0.0))
    return o


def bate_bate(it):
    W, D = 13.2, 10.4
    est = [mb.caixa(W + 0.8, D + 0.8, 0.22, cor="concreto", bisel=0.06, seg=2, nome="base"),
           mb.caixa(W - 0.2, D - 0.2, 0.06, z=0.2, cor="metal_escuro", bisel=0.02, seg=1, nome="pista")]
    for k in range(1, 12):  # juntas das placas
        x = -W / 2 + 0.1 + k * (W - 0.2) / 12
        est.append(pb.plano([(x - 0.015, -D / 2 + 0.1), (x + 0.015, -D / 2 + 0.1), (x + 0.015, D / 2 - 0.1),
                             (x - 0.015, D / 2 - 0.1)], 0.262, "grafite", nome="junta"))
    for k in range(1, 9):
        y = -D / 2 + 0.1 + k * (D - 0.2) / 9
        est.append(pb.plano([(-W / 2 + 0.1, y - 0.015), (W / 2 - 0.1, y - 0.015), (W / 2 - 0.1, y + 0.015),
                             (-W / 2 + 0.1, y + 0.015)], 0.263, "grafite", nome="junta"))
    # amortecedor de borracha em volta, com abertura na frente
    fora = mb.ret_arredondado(W - 0.2, D - 0.2, 0.8, 4)
    dentro = mb.ret_arredondado(W - 0.7, D - 0.7, 0.6, 4)
    amort = pb.anel_extrudado(fora, dentro, 0.26, 0.82, "borracha", bisel=0.08, seg_bisel=1, nome="amortecedor")
    est.append(amort)
    fx = [(x * 1.004, y * 1.004) for x, y in fora]
    est.append(pb.anel_extrudado(fx, dentro, 0.48, 0.6, "amarelo", nome="faixa"))
    # colunas e telhado em abóbada listrada
    zc = 4.1
    for x in (-W / 2 + 0.1, 0.0, W / 2 - 0.1):
        for y in (-D / 2 + 0.05, D / 2 - 0.05):
            est.append(mb.cilindro(0.2, zc - 0.22, x=x, y=y, z=0.22, cor="vermelho", seg=10, bisel=0.03, nome="coluna"))
            est.append(mb.cilindro(0.3, 0.3, x=x, y=y, z=0.22, cor="amarelo", seg=10, bisel=0.04))
            est.append(mb.cilindro(0.28, 0.22, x=x, y=y, z=zc - 0.22, cor="amarelo", seg=10, bisel=0.04))
    est.append(mb.caixa(W + 0.6, D + 0.6, 0.3, z=zc, cor="branco", bisel=0.08, seg=2, nome="viga"))
    nfx = 12
    Lx = W + 1.0
    for k in range(nfx):
        bm = bmesh.new()
        x0 = -Lx / 2 + Lx * k / nfx
        x1 = -Lx / 2 + Lx * (k + 1) / nfx
        aneis = []
        for x in (x0, x1):
            anel = []
            for j in range(11):
                a = math.pi * j / 10
                anel.append(bm.verts.new((x, -(D / 2 + 0.5) * math.cos(a), zc + 0.3 + 2.0 * math.sin(a))))
            aneis.append(anel)
        for j in range(10):
            bm.faces.new((aneis[0][j], aneis[0][j + 1], aneis[1][j + 1], aneis[1][j]))
        est.append(pb.obj("lona", bm, "azul_celeste" if k % 2 == 0 else "branco", liso=True, angulo=40))
    for sx in (-1, 1):  # tímpanos (frente e fundo do arco)
        pts = [(-(D / 2 + 0.5) * math.cos(math.pi * j / 10), 2.0 * math.sin(math.pi * j / 10)) for j in range(11)]
        tp = mb.extrudado(mb._ccw([(p[1] * 0 + p[0], p[1]) for p in pts]), 0.12, plano="yz", cor="amarelo",
                          bisel=0.03, seg=1, nome="timpano")
        mb.transforma(tp, loc=(sx * (Lx / 2) - (0.12 if sx > 0 else 0.0), 0, zc + 0.3))
        est.append(tp)
    est.append(pb.placa_estampa("bate_bate.png", (0, -(D / 2 + 0.62), zc + 0.9), 5.6, 1.4, emissao=1.5,
                                nome="letreiro"))
    est.append(mb.caixa(5.9, 0.12, 1.65, y=-(D / 2 + 0.52), z=zc + 0.07, cor="azul", bisel=0.05, nome="placa"))
    # forro elétrico (tela escura) e lâmpadas
    est.append(mb.caixa(W - 0.4, D - 0.4, 0.05, z=zc - 0.08, cor="grafite", bisel=0.0, liso=False, nome="forro"))
    for k in range(1, 9):
        x = -W / 2 + 0.2 + k * (W - 0.4) / 9
        est.append(mb.caixa(0.04, D - 0.45, 0.02, x=x, z=zc - 0.1, cor="metal", bisel=0.0, liso=False))
    luzes = []
    for x in (-4.4, -1.5, 1.5, 4.4):
        for y in (-3.0, 3.0):
            luzes.append(mb.cilindro(0.25, 0.06, x=x, y=y, z=zc - 0.15, cor=None, mat="luz", seg=10, bisel=0.0))
    # neon no beiral
    neon = []
    for y in (-(D / 2 + 0.32), D / 2 + 0.32):
        neon.append(mb.caixa(W + 0.6, 0.06, 0.08, y=y, z=zc + 0.12, cor=None, mat="neon", bisel=0.0, liso=False))
    for x in (-(W / 2 + 0.32), W / 2 + 0.32):
        neon.append(mb.caixa(0.06, D + 0.6, 0.08, x=x, z=zc + 0.12, cor=None, mat="neon_rosa", bisel=0.0, liso=False))
    est += degraus(0, -(D / 2 + 0.4), 2.4, 1, 0.22, 0.35, (0, -1))
    it.add(est, neon, luzes)
    # carrinhos rodando numa pista oval
    a_, b_ = 4.1, 2.5
    npts = 64
    pts = []
    for j in range(npts):
        t = 2 * math.pi * j / npts
        pts.append((a_ * math.cos(t), b_ * math.sin(t) + 0.15 * math.sin(3 * t)))
    P = [V((x, y, 0.26)) for x, y in pts]
    L = pb.comprimentos(P, True)
    tot = L[-1]
    Q, _ = pb.reamostra(P, True, tot / int(tot / 0.5))
    pontos = [[round(q.x, 3), round(q.z, 3), round(-q.y, 3)] for q in Q]
    cores = ["vermelho", "amarelo", "azul_celeste", "verde", "rosa"]
    vel = 2.2
    n = 5
    for i in range(n):
        atraso = round(tot * i / n, 3)
        s = (-atraso) % tot
        j = 0
        while j < len(L) - 2 and L[j + 1] < s:
            j += 1
        f = (s - L[j]) / (L[j + 1] - L[j])
        p = P[j % npts].lerp(P[(j + 1) % npts], f)
        t = (P[(j + 1) % npts] - P[j % npts]).normalized()
        M = pb.matriz_frente(p, t)
        nm = f"carrinho_{i + 1}"
        it.anima_local(carro_bate(cores[i]), {"anima": "percurso", "pontos": pontos, "velocidade": vel,
                                              "atraso": atraso, "fechado": True}, nm, M)
        it.slot_local(f"assento_{i + 1}", (0, 0.12, 0.6), (0.5, 0.5, 0.9), nm)
    it.colisao([((0, 0, 0), (W + 0.8, D + 0.8, 0.22)), ((0, -D / 2 + 0.2, 0.22), (W - 0.2, 0.5, 0.6)),
                ((0, D / 2 - 0.2, 0.22), (W - 0.2, 0.5, 0.6)), ((-W / 2 + 0.2, 0, 0.22), (0.5, D - 0.2, 0.6)),
                ((W / 2 - 0.2, 0, 0.22), (0.5, D - 0.2, 0.6)), ((0, 0, zc), (W + 0.6, D + 0.6, 2.3))])


# ======================================================================================================================
# Trenzinho infantil
# ======================================================================================================================
def locomotiva():
    o = [mb.caixa(0.95, 1.9, 0.18, z=0.2, cor="grafite", bisel=0.04, seg=1, nome="chassi")]
    for sx in (-1, 1):
        for y in (-0.6, 0.0, 0.6):
            o.append(mb.cilindro(0.2 if y else 0.24, 0.1, x=sx * 0.42, y=y, z=0.22, cor="vermelho_escuro", eixo="x",
                                 seg=12, bisel=0.02, nome="roda"))
            o.append(mb.cilindro(0.06, 0.12, x=sx * 0.47, y=y, z=0.22, cor="ouro", eixo="x", seg=8, bisel=0.0))
        o.append(mb.caixa(0.04, 1.3, 0.05, x=sx * 0.5, y=-0.3, z=0.2, cor="ouro", bisel=0.0, liso=False))
    o.append(mb.cilindro(0.38, 1.1, y=-0.35, z=0.72, cor="vermelho", eixo="y", seg=16, bisel=0.05, nome="caldeira"))
    o.append(mb.cilindro(0.4, 0.08, y=-0.62, z=0.72, cor="amarelo", eixo="y", seg=16, bisel=0.02))
    o.append(mb.cilindro(0.4, 0.08, y=-0.12, z=0.72, cor="amarelo", eixo="y", seg=16, bisel=0.02))
    o.append(mb.cilindro(0.33, 0.1, y=-0.92, z=0.72, cor="grafite", eixo="y", seg=16, bisel=0.03))
    # carinha na frente
    for sx in (-1, 1):
        o.append(pb.bola(sx * 0.12, -0.98, 0.8, 0.07, "branco", sub=1, esc=(1, 0.5, 1)))
        o.append(pb.bola(sx * 0.12, -1.0, 0.8, 0.04, "preto", sub=0, esc=(1, 0.5, 1)))
    o.append(pb.tubo([(-0.1, -0.98, 0.62), (0, -1.0, 0.58), (0.1, -0.98, 0.62)], 0.018, "vinho", 5))
    o.append(mb.cilindro(0.11, 0.5, y=-0.65, z=1.02, r2=0.17, cor="preto", seg=12, bisel=0.02, nome="chamine"))
    o.append(mb.cilindro(0.19, 0.08, y=-0.65, z=1.5, cor="ouro", seg=12, bisel=0.02))
    o.append(mb.esfera(0.16, y=-0.25, z=1.1, cor="ouro", esc=(1, 1, 0.8), seg=10))
    # cabine
    o.append(mb.caixa(0.92, 0.75, 0.95, y=0.45, z=0.36, cor="vermelho", bisel=0.05, seg=1, nome="cabine"))
    for sx in (-1, 1):
        o.append(mb.caixa(0.02, 0.4, 0.34, x=sx * 0.465, y=0.45, z=0.86, cor=None, mat="vidro", bisel=0.0, liso=False))
    o.append(mb.caixa(1.1, 0.95, 0.12, y=0.45, z=1.3, cor="azul", bisel=0.05, seg=2, nome="teto"))
    o.append(mb.caixa(0.9, 0.3, 0.08, y=-1.02, z=0.12, cor="amarelo", bisel=0.02, seg=1, nome="limpa_trilho"))
    return o


def vagao(cor):
    o = [mb.caixa(0.95, 1.35, 0.16, z=0.2, cor="grafite", bisel=0.04, seg=1)]
    for sx in (-1, 1):
        for y in (-0.42, 0.42):
            o.append(mb.cilindro(0.17, 0.1, x=sx * 0.42, y=y, z=0.2, cor="grafite_escuro", eixo="x", seg=10, bisel=0.02))
            o.append(mb.cilindro(0.05, 0.12, x=sx * 0.47, y=y, z=0.2, cor="ouro", eixo="x", seg=6, bisel=0.0))
    fora = mb.ret_arredondado(0.95, 1.35, 0.18, 3)
    dentro = mb.ret_arredondado(0.75, 1.15, 0.12, 3)
    o.append(pb.anel_extrudado(fora, dentro, 0.32, 0.78, cor, bisel=0.04, seg_bisel=1, nome="caixa"))
    o.append(pb.plano(dentro, 0.36, "madeira_mel", nome="piso"))
    o.append(mb.caixa(0.72, 0.36, 0.2, y=0.3, z=0.36, cor="madeira_clara", bisel=0.03, seg=1, nome="banco"))
    o.append(mb.caixa(0.72, 0.36, 0.2, y=-0.3, z=0.36, cor="madeira_clara", bisel=0.03, seg=1, nome="banco"))
    o.append(mb.caixa(0.96, 1.36, 0.06, z=0.55, cor="branco", bisel=0.02, seg=1, nome="friso"))
    o.append(mb.cilindro(0.05, 0.25, y=-0.72, z=0.22, cor="cinza_medio", eixo="y", seg=6, bisel=0.0))
    return o


def trenzinho(it):
    S = 15.0
    h = S / 2
    it.add(cb.laje(cb.quadrado(-h, -h, h, h), 0.0, "grama", nome="grama"))
    it.add(pb.caminho_reto(0, -h, 0, -6.05, guia_fim=False))
    # trilho oval com dormentes sobre brita
    a_, b_ = 5.4, 3.7
    n = 72
    pts = [(a_ * math.cos(2 * math.pi * j / n), b_ * math.sin(2 * math.pi * j / n)) for j in range(n)]
    it.add(pb.faixa_plana(pts, 1.3, 0.04, "brita", fechado=True, nome="brita"))
    bit = 0.6
    P = [V((x, y, 0.0)) for x, y in pts]
    T = pb.tangentes(P, True)
    for sg in (-1, 1):
        Pl = [p + V((-t.y, t.x, 0)) * (sg * bit / 2) + V((0, 0, 0.13)) for p, t in zip(P, T)]
        it.add(pb.varre(Pl, [Z] * n, [(-0.03, -0.04), (0.03, -0.04), (0.03, 0.03), (-0.03, 0.03)], "trilho", True,
                        nome="trilho", liso=False))
    L = pb.comprimentos(P, True)
    Q, _ = pb.reamostra(P, True, L[-1] / int(L[-1] / 0.55))
    TQ = pb.tangentes(Q, True)
    for q, t in zip(Q, TQ):
        ld = V((-t.y, t.x, 0))
        it.add(pb.caixa_eixos(q + V((0, 0, 0.07)), ld, t, Z, (0.95, 0.18, 0.07), "dormente", nome="dormente"))
    # túnel de grama no fundo à direita
    ang0, ang1 = math.radians(20), math.radians(80)
    tun = []
    for j in range(13):
        a = ang0 + (ang1 - ang0) * j / 12
        tun.append((a_ * math.cos(a), b_ * math.sin(a)))
    Pt = [V((x, y, 0.0)) for x, y in tun]
    Tt = pb.tangentes(Pt, False)
    perfil = [(-1.45, -0.02), (-1.45, 0.9), (-1.25, 1.55), (-0.7, 1.95), (0.0, 2.05), (0.7, 1.95), (1.25, 1.55),
              (1.45, 0.9), (1.45, -0.02)]
    morro = [(-2.6, -0.02), (-2.3, 1.0), (-1.6, 1.95), (-0.6, 2.45), (0.4, 2.5), (1.4, 2.05), (2.2, 1.2), (2.6, -0.02)]
    it.add(pb.varre(Pt, [Z] * len(Pt), perfil[::-1], "concreto_escuro", False, perfil_fechado=False, nome="tunel_dentro",
                    T=Tt))
    mt = pb.varre(Pt, [Z] * len(Pt), morro, "grama_escura", False, perfil_fechado=False, nome="morro", T=Tt)
    it.add(mt)
    for idx, sgn in ((0, -1), (len(Pt) - 1, 1)):
        p, t = Pt[idx], Tt[idx]
        ld = V((-t.y, t.x, 0))
        # boca de pedra (arco)
        arco = [p + ld * (-1.65) + V((0, 0, 0)), p + ld * (-1.65) + V((0, 0, 1.0))]
        arco += [p + ld * (1.65 * math.cos(math.pi * (1 - k / 8))) + V((0, 0, 1.0 + 1.15 * math.sin(math.pi * k / 8)))
                 for k in range(1, 8)]
        arco += [p + ld * 1.65 + V((0, 0, 1.0)), p + ld * 1.65]
        it.add(pb.tubo(arco, 0.22, "cinza", 6, nome="boca_tunel"))
        # tampa do morro (parede entre o arco e o morro)
        bm = bmesh.new()
        fo = [p + ld * a + V((0, 0, b)) for a, b in morro]
        de = [p + ld * a + V((0, 0, b)) for a, b in perfil]
        vf = [bm.verts.new(v) for v in fo]
        vd = [bm.verts.new(v) for v in de]
        allv = vf + vd[::-1]
        try:
            fc = bm.faces.new(allv)
            bmesh.ops.triangulate(bm, faces=[fc], quad_method="BEAUTY", ngon_method="BEAUTY")
        except ValueError:
            pass
        it.add(pb.obj("tampa_tunel", bm, "grama_escura", liso=False))
    for x, y, c in ((3.6, 4.4, "folha"), (5.4, 2.9, "folha_clara"), (2.6, 4.6, "amarelo")):
        it.add(pb.arbusto(x, y, 0.4, c, z=0.0))
    # estação com cobertura e letreiro, na frente
    ye = -b_ - 1.2
    est = [mb.caixa(4.4, 1.4, 0.32, y=ye, cor="concreto", bisel=0.05, seg=1, nome="plataforma"),
           mb.caixa(4.45, 0.12, 0.04, y=ye + 0.62, z=0.32, cor="amarelo", bisel=0.0, liso=False)]
    for x in (-1.9, 1.9):
        est.append(mb.cilindro(0.07, 2.4, x=x, y=ye - 0.5, z=0.32, cor="branco", seg=8, bisel=0.0))
    tt = mb.superelipsoide(5.0, 2.2, 0.3, y=ye + 0.1, z=2.7, cor="vermelho", e=0.25, e_v=0.4, nu=14, nv=6, nome="teto")
    mb.pinta_onde(tt, "branco", lambda c, n: n.z < -0.3)
    est.append(tt)
    est.append(pb.placa_estampa("trenzinho.png", (0, ye - 0.62, 3.25), 3.0, 0.75, emissao=1.4, nome="letreiro"))
    est.append(mb.caixa(3.2, 0.1, 0.9, y=ye - 0.56, z=2.82, cor="amarelo", bisel=0.03))
    est.append(mb.caixa(2.0, 0.4, 0.16, y=ye - 0.88, cor="concreto_escuro", bisel=0.02, seg=1, nome="degrau"))
    est.append(mb.caixa(1.6, 0.4, 0.42, x=-1.1, y=ye - 0.35, z=0.32, cor="madeira_mel", bisel=0.04, seg=1,
                        nome="banco"))
    it.add(est)
    luzes = [mb.cilindro(0.16, 0.05, x=0, y=ye + 0.1, z=2.66, cor=None, mat="luz", seg=10, bisel=0.0)]
    for x, y in ((-6.6, -6.2), (6.6, -6.2)):
        e, l_ = pb.poste_parque(x, y, alt=4.2, bracos=2, ang=0.0)
        it.add(e)
        luzes += l_
    for x, y in ((-6.3, 5.6), (-2.0, 6.3), (6.4, -2.6), (-6.5, -1.0)):
        it.add(pb.arvore(x, y, alt=3.0, r=0.9))
    for x, y, c in ((-1.0, 0.9, "rosa"), (0.6, -0.6, "amarelo"), (1.6, 0.6, "lilas"), (-2.0, -0.8, "branco")):
        it.add(pb.arbusto(x, y, 0.32, c), pb.arbusto(x + 0.4, y + 0.2, 0.25, "folha_clara"))
    it.add(mb.cilindro(1.1, 0.12, x=0.0, y=0.0, z=0.0, cor="terra", seg=16, bisel=0.03, nome="canteiro"))
    it.add(luzes)
    # trem: locomotiva + 3 vagões andando no oval
    Pp = [V((x, y, 0.13)) for x, y in pts]
    Lp = pb.comprimentos(Pp, True)
    totp = Lp[-1]
    Qp, _ = pb.reamostra(Pp, True, totp / int(totp / 0.5))
    pontos = [[round(q.x, 3), round(q.z, 3), round(-q.y, 3)] for q in Qp]
    TQp = pb.tangentes(Qp, True)
    s0 = totp * 0.75  # parado na estação (lado da frente)
    comp = [0.0, 1.75, 3.2, 4.65]
    cores = ["azul_celeste", "verde_claro", "amarelo"]
    for i in range(4):
        s = (s0 - comp[i]) % totp
        k = int(s / totp * len(Qp)) % len(Qp)
        M = pb.matriz_frente(Qp[k], TQp[k])
        objs = locomotiva() if i == 0 else vagao(cores[i - 1])
        nm = "locomotiva" if i == 0 else f"vagao_{i}"
        it.anima_local(objs, {"anima": "percurso", "pontos": pontos, "velocidade": 1.6,
                              "atraso": round(comp[i] - s0, 3) % round(totp, 3), "fechado": True}, nm, M)
        if i > 0:
            for j, y in enumerate((0.3, -0.3)):
                it.slot_local(f"assento_{2 * (i - 1) + j + 1}", (0, y, 0.56), (0.5, 0.5, 0.9), nm)
    it.colisao([((0, 0, cb.Z_FUNDO), (S, S, -cb.Z_FUNDO)), ((0, ye, 0), (4.4, 1.4, 0.32)),
                ((0, ye + 0.1, 2.55), (5.0, 2.2, 1.95)),
                ((a_ * math.cos(math.radians(50)), b_ * math.sin(math.radians(50)), 0), (3.6, 3.6, 2.5))])


# ======================================================================================================================
# Parque aquático (2 × 2 quadras)
# ======================================================================================================================
def perfil_canal(R=0.62, esp=0.08, n=8, a0=195, a1=345):
    fora = [(R * math.cos(math.radians(a0 + (a1 - a0) * k / n)), R + R * math.sin(math.radians(a0 + (a1 - a0) * k / n)))
            for k in range(n + 1)]
    dentro = [((R - esp) * math.cos(math.radians(a1 - (a1 - a0) * k / n)),
               R + (R - esp) * math.sin(math.radians(a1 - (a1 - a0) * k / n))) for k in range(n + 1)]
    return fora + dentro


def toboagua(ctrl, tipo="canal", cores=("laranja", "vermelho"), listra=3, R=0.62, z_chao=0.25, suportes=2.8,
             passo=0.7, nome="toboagua"):
    """Toboágua pelos pontos de controle: 'canal' (aberto, em U) ou 'tubo' (fechado). Listras de cores a cada
    'listra' anéis. Devolve (objetos, pontos)."""
    P, _ = pb.catmull([V(c) for c in ctrl], False, 8)
    P, _ = pb.reamostra(P, False, passo)
    T, U = pb.quadros_inclinados(P)
    if tipo == "canal":
        perfil = perfil_canal(R)
    else:
        perfil = [(R * math.cos(2 * math.pi * k / 10), R + R * math.sin(2 * math.pi * k / 10)) for k in range(10)]
    cs = list(cores)
    objs = [pb.varre(P, U, perfil, cs[0], False, True, tampas=(tipo == "canal"), nome=nome, T=T,
                     cores_aneis=lambda i: cs[(i // listra) % len(cs)])]
    if tipo == "tubo":
        for k in range(0, len(P), 4):
            pass
    # postes
    L = pb.comprimentos(P, False)
    s = suportes * 0.6
    while s < L[-1] - 1.0:
        j = 0
        while j < len(L) - 2 and L[j + 1] < s:
            j += 1
        p = P[j]
        if p.z - z_chao > 1.0:
            objs.append(mb.cilindro(0.11, p.z - z_chao, x=p.x, y=p.y, z=z_chao, cor="cinza_claro", seg=6, bisel=0.0,
                                    nome="poste"))
            objs.append(mb.cilindro(0.2, 0.12, x=p.x, y=p.y, z=z_chao, cor="cinza_medio", seg=6, bisel=0.0))
        s += suportes
    return objs, P


def anel_cor(P, U, T, idx, R, cor):
    """Argola em volta do tubo (toboágua verde com anéis amarelos)."""
    p, u, t = P[idx], U[idx], T[idx]
    lado = t.cross(u)
    pts = [p + u * R + (lado * math.cos(a) + u * math.sin(a)) * (R + 0.05)
           for a in [2 * math.pi * k / 10 for k in range(10)]]
    return pb.tubo(pts, 0.06, cor, 5, fechado=True, nome="argola")


def trevo(cx, cy, R0, A, rot, n=36):
    return [(cx + (R0 + A * math.cos(3 * (t - rot))) * math.cos(t), cy + (R0 + A * math.cos(3 * (t - rot))) * math.sin(t))
            for t in [2 * math.pi * k / n for k in range(n)]]


def piscina(cx, cy, rx, ry, k2=0.14, k3=0.08, fase=0.0, n=40):
    return [(cx + rx * (1 + k2 * math.cos(2 * t + fase) + k3 * math.sin(3 * t)) * math.cos(t),
             cy + ry * (1 + k2 * math.cos(2 * t + fase) + k3 * math.sin(3 * t)) * math.sin(t))
            for t in [2 * math.pi * k / n for k in range(n)]]


def piscina_livre(cx, cy, rx, ry, n=72):
    """Piscina grande de contorno orgânico com um estreito no meio (onde passa a pontezinha)."""
    pts = []
    for k in range(n):
        t = 2 * math.pi * k / n
        f = (1 - 0.62 * math.exp(-((t - math.pi / 2) / 0.42) ** 2) - 0.58 * math.exp(-((t - 3 * math.pi / 2) / 0.42) ** 2)
             + 0.07 * math.sin(4 * t + 0.6) + 0.05 * math.cos(7 * t + 0.5) + 0.04 * math.sin(11 * t))
        pts.append((cx + rx * f * math.cos(t), cy + ry * f * math.sin(t)))
    for _ in range(6):  # alisa as reentrâncias (a borda e o deque deslocados não se dobram)
        pts = [((pts[i - 1][0] + 2 * pts[i][0] + pts[(i + 1) % n][0]) / 4,
                (pts[i - 1][1] + 2 * pts[i][1] + pts[(i + 1) % n][1]) / 4) for i in range(n)]
    return pts


def passarela(pts, z, larg=2.2, cor="laranja_claro"):
    """Passarela elevada sinuosa (deque com guarda-corpo de vidro e corrimão) por uma linha 2D."""
    P, _ = pb.catmull([V((x, y, z)) for x, y in pts], False, 6)
    P, _ = pb.reamostra(P, False, 0.8)
    T = pb.tangentes(P, False)
    U = [Z] * len(P)
    h = larg / 2
    objs = [pb.varre(P, U, [(-h, -0.38), (h, -0.38), (h, 0.0), (-h, 0.0)], cor, False, tampas=True, nome="passarela",
                     liso=False, T=T)]
    mb.pinta_onde(objs[0], "laranja", lambda c, n: n.z < 0.5)
    for sg in (-1, 1):
        Pl = [p + t.cross(Z) * (sg * (h - 0.05)) for p, t in zip(P, T)]
        v_ = pb.varre(Pl, U, [(-0.02, 0.05), (0.02, 0.05), (0.02, 0.95), (-0.02, 0.95)], None, False, nome="vidro",
                      liso=False, T=T)
        mb.pinta(v_, None, mat="vidro")
        objs.append(v_)
        objs.append(pb.varre([p + V((0, 0, 1.0)) for p in Pl], U, pb.circulo_perfil(0.045, 5), "cinza_claro", False,
                             nome="corrimao", T=T))
    L = pb.comprimentos(P, False)
    s_ = 1.5
    while s_ < L[-1] - 0.5:
        j = 0
        while j < len(L) - 2 and L[j + 1] < s_:
            j += 1
        p, t = P[j], T[j]
        lado = t.cross(Z)
        for sg in (-1, 1):
            q = p + lado * (sg * 0.75)
            objs.append(mb.cilindro(0.14, z - 0.38 - 0.25, x=q.x, y=q.y, z=0.25, cor="cinza", seg=8, bisel=0.0,
                                    tampas=False, nome="pilar"))
        objs.append(pb.barra(p + lado * 0.75 + V((0, 0, -2.2 - 0.38)), p - lado * 0.75 + V((0, 0, -0.45)), 0.07, "cinza",
                             5, nome="mao_francesa"))
        s_ += 3.4
    return objs, P


def parque_aquatico(it):
    S = 30.0
    h = S / 2
    zd = 0.25  # piso do deque
    deque = pb.contorno_ret(0, 0, 13.8, 13.3, 3.0, 8)
    grande = piscina_livre(1.6, -2.4, 10.4, 7.0)
    kids = piscina(-10.2, -9.3, 2.4, 1.8, 0.1, 0.04, 1.0, n=24)
    pools = [grande, kids]
    it.add(pb.laje_furos(cb.quadrado(-h, -h, h, h), [deque], 0.0, cb.Z_FUNDO, "grama", nome="grama"))
    for c in (-7.5, 7.5):  # entradas da frente e do fundo no meio das quadras
        for (y0, y1) in ((-13.3, -h), (13.3, h)):
            it.add(pb.caminho_reto(c, y0, c, y1))
    it.add(pb.laje_furos(deque, pools, zd, cb.Z_FUNDO, "calcada", cor_furo="azul_claro", nome="deque"))
    it.add(pb.anel_extrudado(pb.desloca_contorno(deque, 0.0), pb.desloca_contorno(deque, -0.25), zd, zd + 0.06,
                             "concreto", nome="borda_deque"))
    for i, pc in enumerate(pools):
        it.add(pb.plano(pc, -0.32, "turquesa_claro", nome="fundo"))
        it.add(pb.plano(pc, 0.1, None, mat="agua", nome="agua"))
        it.add(pb.anel_extrudado(pb.desloca_contorno(pc, 0.32), pc, zd - 0.02, zd + 0.06, "branco", bisel=0.03,
                                 seg_bisel=1, nome="borda"))
        larg = 1.35 if i == 0 else 1.1
        it.add(pb.anel_plano(pb.desloca_contorno(pc, larg), pb.desloca_contorno(pc, 0.3), zd + 0.003 + 0.001 * i,
                             "rosa_bebe", nome="deque_rosa"))
        it.add(pb.anel_plano(pb.desloca_contorno(pc, larg + 0.15), pb.desloca_contorno(pc, larg), zd + 0.003 + 0.001 * i,
                             "rosa", nome="filete"))
    # pontezinha amarela no estreito
    yb0, yb1, xb = -5.6, 1.0, 1.6
    pts = [(xb, yb0 + (yb1 - yb0) * k / 10, zd + 0.06 + 0.7 * math.sin(math.pi * k / 10)) for k in range(11)]
    P = [V(p) for p in pts]
    T = pb.tangentes(P, False)
    pon = [pb.varre(P, [Z] * len(P), [(-0.8, -0.12), (0.8, -0.12), (0.8, 0.0), (-0.8, 0.0)], "amarelo", False,
                    tampas=True, nome="ponte", liso=False, T=T)]
    for sg in (-1, 1):
        Pl = [p + V((sg * 0.75, 0, 0)) for p in P]
        pon.append(pb.tubo([p + V((0, 0, 0.85)) for p in Pl], 0.045, "amarelo_escuro", 6, nome="corrimao_ponte"))
        for p in Pl[1:-1:2]:
            pon.append(mb.cilindro(0.04, 0.85, x=p.x, y=p.y, z=p.z, cor="amarelo_escuro", seg=6, bisel=0.0))
    for k in range(1, 10):
        p = P[k]
        pon.append(mb.caixa(1.6, 0.05, 0.02, x=p.x, y=p.y, z=p.z, cor="amarelo_escuro", bisel=0.0, liso=False))
    it.add(pon)
    # ponto de ondas (anéis brancos na água)
    for r_ in (0.6, 1.3, 2.0):
        it.add(pb.anel_plano([(8.0 + (r_ + 0.12) * math.cos(a), -3.4 + (r_ + 0.12) * math.sin(a)) for a in
                              [2 * math.pi * k / 24 for k in range(24)]],
                             [(8.0 + r_ * math.cos(a), -3.4 + r_ * math.sin(a)) for a in [2 * math.pi * k / 24 for k in range(24)]],
                             0.105, "branco", nome="onda"))
    # torre de quatro deques em trevo, largos e baixos, com escada em caracol e guarda-corpo de vidro
    T0 = V((-9.0, 7.6, 0))
    decks = [(2.6, 0.0), (5.0, -math.pi / 3), (7.4, 0.0), (9.8, -math.pi / 3)]
    abertos = {2.6: (), 5.0: (math.radians(240),), 7.4: (math.radians(-60),), 9.8: (0.0,)}
    torre = [mb.cilindro(0.62, 10.6 - zd, x=T0.x, y=T0.y, z=zd, cor="branco", seg=14, bisel=0.0, nome="coluna"),
             mb.cilindro(0.85, 0.3, x=T0.x, y=T0.y, z=10.5, cor="laranja", seg=14, bisel=0.05)]
    pernas = set()
    for zz, rot in decks:
        tv = trevo(T0.x, T0.y, 3.3, 1.0, rot, n=36)
        furo = [(T0.x + 1.7 * math.cos(2 * math.pi * k / 36), T0.y + 1.7 * math.sin(2 * math.pi * k / 36))
                for k in range(36)]
        dk = pb.anel_extrudado(tv, furo, zz - 0.4, zz, "laranja_claro", bisel=0.08, seg_bisel=1, nome="deque_torre")
        mb.pinta_onde(dk, "laranja", lambda c, n: n.z < 0.5)
        torre.append(dk)
        trechos, cur = [], []
        for k in range(37):
            t = 2 * math.pi * k / 36
            dt = min([abs((t - a + math.pi) % (2 * math.pi) - math.pi) for a in abertos[zz]] + [9])
            if dt < math.radians(14):
                if len(cur) > 1:
                    trechos.append(cur)
                cur = []
                continue
            r = 3.3 + 1.0 * math.cos(3 * (t - rot)) - 0.08
            cur.append((T0.x + r * math.cos(t), T0.y + r * math.sin(t)))
        if len(cur) > 1:
            trechos.append(cur)
        for tr_ in trechos:
            P3 = [V((x, y, zz)) for x, y in tr_]
            vid = pb.varre(P3, [Z] * len(P3), [(-0.025, 0.05), (0.025, 0.05), (0.025, 0.95), (-0.025, 0.95)], None,
                           False, nome="vidro", liso=False)
            mb.pinta(vid, None, mat="vidro")
            torre.append(vid)
            torre.append(pb.tubo([p + V((0, 0, 1.0)) for p in P3], 0.045, "cinza_claro", 5, nome="corrimao"))
        for k in range(3):
            pernas.add((round((rot + 2 * math.pi * k / 3) % (2 * math.pi), 3), zz))
    for a in sorted({p[0] for p in pernas}):
        alto = max(z for aa, z in pernas if abs(aa - a) < 1e-3)
        x, y = T0.x + 3.1 * math.cos(a), T0.y + 3.1 * math.sin(a)
        torre.append(mb.cilindro(0.16, alto - 0.4 - zd, x=x, y=y, z=zd, cor="cinza", seg=8, bisel=0.0, tampas=False,
                                 nome="perna"))
    nd = 40
    for k in range(nd):
        a = 2 * math.pi * k / 12.0
        zz = zd + (9.8 - zd) * (k + 1) / nd
        st = mb.caixa(0.95, 0.42, 0.07, x=1.12, z=-0.07, cor="amarelo", bisel=0.0, liso=False, nome="degrau")
        mb.transforma(st, rot=("Z", math.degrees(a)))
        mb.transforma(st, loc=(T0.x, T0.y, zz))
        torre.append(st)
    it.add(torre)
    # passarela elevada e sinuosa, do deque de cima para os fundos e para a direita
    tip = (T0.x + 4.15, T0.y)
    linha = [tip, (-2.2, 9.6), (2.2, 10.9), (6.6, 10.4), (10.2, 8.4), (11.9, 5.2)]
    pas, PP = passarela(linha, 9.8)
    it.add(pas)
    fim = PP[-1]
    it.add(mb.extrudado(mb._ccw(pb.contorno_ret(fim.x + 0.1, fim.y - 0.6, 1.5, 1.4, 0.6, 3)), 0.38, z=9.395,
                        cor="laranja_claro", bisel=0.05, seg=1, nome="plataforma"))
    meio = PP[len(PP) // 2]
    tmeio = (PP[len(PP) // 2 + 1] - PP[len(PP) // 2 - 1]).normalized()
    fr = tmeio.cross(Z)  # para a direita de quem anda: lado de fora (fundos)
    it.add(pb.placa_estampa("toboagua.png", (meio.x - fr.x * 1.2, meio.y - fr.y * 1.2, 9.05), 4.4, 1.1,
                            frente=(-fr.x, -fr.y, 0), emissao=1.4, nome="letreiro"))
    # toboáguas
    # 1) grande, aberto, laranja e vermelho: do fim da passarela, rente ao lado direito num arco largo e baixo
    c1 = [(fim.x + 0.2, fim.y - 1.6, 9.5), (12.2, 1.0, 8.4), (12.4, -3.0, 6.8), (12.0, -7.0, 5.0), (10.5, -10.0, 3.4),
          (7.8, -11.5, 2.0), (4.9, -11.2, 1.0), (3.8, -9.4, 0.5)]
    o1, P1 = toboagua(c1, "canal", ("laranja", "vermelho"), 3, R=0.7, nome="toboagua_grande")
    it.add(o1)
    # 2) tubo verde com argolas amarelas, do meio da passarela para a piscina
    pv = PP[int(len(PP) * 0.72)]
    c4 = [(pv.x - 0.2, pv.y - 1.3, 9.6)] + pb.helice((6.9, 6.0), 1.9, 9.0, 1.4, 100, 2.0, sentido=1, passo=1.0) + \
        [(6.0, 3.3, 0.55)]
    o4, P4 = toboagua(c4, "tubo", ("verde_claro",), 1, R=0.58, nome="toboagua_verde")
    it.add(o4)
    T4, U4 = pb.quadros_inclinados(P4)
    for k in range(3, len(P4) - 2, 5):
        it.add(anel_cor(P4, U4, T4, k, 0.58, "amarelo"))
    # 3) espiral azul aberta, do terceiro deque para a piscina
    st = (T0.x + 3.95 * math.cos(-math.pi / 3), T0.y + 3.95 * math.sin(-math.pi / 3), 7.4)
    c2 = [st] + pb.helice((-3.6, 2.6), 2.2, 6.8, 1.4, 120, 1.5, sentido=1, passo=1.2) + [(-2.4, 0.2, 0.55)]
    o2, P2 = toboagua(c2, "canal", ("azul", "azul_medio"), 4, R=0.62, nome="toboagua_azul")
    it.add(o2)
    # 4) tubo roxo e rosa, do segundo deque para a piscininha infantil
    st3 = (T0.x + 3.95 * math.cos(math.radians(240)), T0.y + 3.95 * math.sin(math.radians(240)), 5.0)
    c3 = [st3] + pb.helice((-11.6, -0.6), 1.7, 4.4, 1.2, 70, 1.3, sentido=-1, passo=1.0) + [(-10.6, -7.6, 0.55)]
    o3, P3 = toboagua(c3, "tubo", ("roxo", "rosa"), 2, R=0.58, nome="toboagua_roxo")
    it.add(o3)
    # cogumelo de água na piscininha
    kp = [mb.cilindro(0.16, 1.2, x=-10.6, y=-9.6, z=-0.3, cor="branco", seg=8, bisel=0.0),
          mb.torno([(0, 0), (1.0, 0), (0.95, 0.18), (0.66, 0.42), (0, 0.52)], x=-10.6, y=-9.6, z=0.9, cor="vermelho",
                   seg=14)]
    for k in range(5):
        a = 2 * math.pi * k / 5
        kp.append(pb.bola(-10.6 + 0.58 * math.cos(a), -9.6 + 0.58 * math.sin(a), 1.25, 0.12, "branco", sub=0,
                          esc=(1, 1, 0.5)))
    it.add(kp)
    # espreguiçadeiras (assentos), guarda-sóis, salva-vidas, arbustos e postes
    n_esp = 0
    for (x, y, ang, cor) in ((-6.4, -12.3, 90, "azul_celeste"), (-4.7, -12.3, 90, "amarelo"), (-3.0, -12.3, 90, "rosa"),
                             (-12.3, -4.0, 0, "verde_agua"), (-12.3, -6.0, 0, "laranja_claro"), (9.4, 6.4, 180, "lilas")):
        objs = [mb.caixa(0.7, 1.9, 0.08, z=0.3, cor="branco", bisel=0.02, seg=1),
                mb.caixa(0.62, 1.2, 0.1, y=0.32, z=0.38, cor=cor, bisel=0.04, seg=1)]
        enc = mb.caixa(0.62, 0.7, 0.1, cor=cor, bisel=0.04, seg=1)
        mb.transforma(enc, rot=("X", 40))
        mb.transforma(enc, loc=(0, -0.62, 0.48))
        objs.append(enc)
        for sx in (-1, 1):
            for sy in (-1, 1):
                objs.append(mb.cilindro(0.03, 0.3, x=sx * 0.3, y=sy * 0.8, z=0.0, cor="branco", seg=5, bisel=0.0))
        for o in objs:
            mb.transforma(o, rot=("Z", ang))
            mb.transforma(o, loc=(x, y, zd))
        it.add(objs)
        n_esp += 1
        it.slot(f"assento_{n_esp}", (x, y, zd + 0.48), (0.5, 0.5, 0.9))
    for (x, y, c1_, c2_) in ((-1.4, -12.4, "vermelho", "branco"), (-12.4, -2.2, "amarelo", "laranja"),
                             (10.6, 7.6, "azul", "branco")):
        gs = [mb.cilindro(0.04, 2.3, x=x, y=y, z=zd, cor="branco", seg=6, bisel=0.0)]
        for k in range(8):
            a0_, a1_ = 2 * math.pi * k / 8, 2 * math.pi * (k + 1) / 8
            bm = bmesh.new()
            q = [bm.verts.new((x, y, zd + 2.65)), bm.verts.new((x + 1.25 * math.cos(a0_), y + 1.25 * math.sin(a0_), zd + 2.15)),
                 bm.verts.new((x + 1.25 * math.cos(a1_), y + 1.25 * math.sin(a1_), zd + 2.15))]
            bm.faces.new(q)
            o_ = pb.obj("guarda_sol", bm, c1_ if k % 2 == 0 else c2_, liso=False)
            if o_.data.polygons[0].normal.z < 0:
                o_.data.flip_normals()
            gs.append(o_)
        it.add(gs)
    sv = [mb.caixa(0.08, 0.08, 1.8, x=x, y=y, z=zd, cor="branco", bisel=0.0, liso=False)
          for x in (-5.6, -5.0) for y in (-9.6, -9.0)]
    sv.append(mb.caixa(0.8, 0.8, 0.1, x=-5.3, y=-9.3, z=zd + 1.8, cor="vermelho", bisel=0.03, seg=1))
    sv.append(mb.caixa(0.8, 0.1, 0.6, x=-5.3, y=-8.95, z=zd + 1.9, cor="vermelho", bisel=0.03, seg=1))
    it.add(sv)
    luzes = []
    for x, y in ((-13.0, -12.5), (13.0, -12.5), (13.0, 12.5), (-13.0, 12.5)):
        e, l_ = pb.poste_parque(x, y, z=zd, alt=4.2, bracos=2, ang=math.radians(45))
        it.add(e)
        luzes += l_
    for x, y in ((-3.4, 12.2), (12.4, -12.0), (-13.2, 2.6)):
        it.add(pb.arbusto(x, y, 0.6, "folha", z=zd), pb.arbusto(x + 0.7, y - 0.3, 0.4, "folha_clara", z=zd))
    for x, y in ((-14.0, -14.0), (14.0, -14.0), (14.0, 14.0), (-14.0, 14.0)):
        it.add(pb.arvore(x, y, alt=3.2, r=0.75))
    it.add(luzes)
    it.colisao([((0, 0, cb.Z_FUNDO), (S, S, -cb.Z_FUNDO)), ((0, 0, 0), (27.6, 26.6, zd)),
                ((T0.x, T0.y, zd), (1.4, 1.4, 10.5)), ((T0.x, T0.y, 2.2), (8.4, 8.4, 0.4)),
                ((T0.x, T0.y, 4.6), (8.4, 8.4, 0.4)), ((T0.x, T0.y, 7.0), (8.4, 8.4, 0.4)),
                ((T0.x, T0.y, 9.4), (8.4, 8.4, 0.4)), ((4.0, 9.0, 9.42), (14.0, 4.0, 0.38))])
