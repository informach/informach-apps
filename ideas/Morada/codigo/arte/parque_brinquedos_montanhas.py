"""Montanhas-russas da categoria parque_brinquedos: a do dragão com vulcão (3 × 2 quadras) e a azul com loopings
(2 × 2). Os trilhos são construídos aqui (parque_brinquedos_base.Trilho) e os pontos do percurso dos carrinhos são
amostrados da mesma curva.
"""
import math
import random

from mathutils import Matrix, Vector

import moveis_base as mb
import cidade_base as cb
import parque_brinquedos_base as pb

V = Vector
Z = V((0, 0, 1))


# ======================================================================================================================
# Carrinho de montanha-russa (local: origem no topo do trilho, frente −Y)
# ======================================================================================================================
def carrinho(cor="laranja", faixa="azul", assento="roxo", rodas="cinza_claro", bitola=0.9, frente=False,
             cor_frente=None):
    objs = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            objs.append(mb.caixa(0.24, 0.42, 0.34, x=sx * bitola / 2, y=sy * 0.62, z=-0.22, cor=rodas, bisel=0.0,
                                 nome="roda", liso=False))
            objs.append(mb.cilindro(0.1, 0.1, x=sx * (bitola / 2 + 0.17), y=sy * 0.62, z=-0.02, cor="grafite",
                                    eixo="x", seg=8, bisel=0.0))
    objs.append(mb.caixa(bitola + 0.3, 1.75, 0.12, z=0.08, cor="grafite", bisel=0.03, seg=1, nome="chassi"))
    fora = mb.ret_arredondado(1.55, 2.05, 0.5, 4)
    dentro = [(x * 0.74, y * 0.62 + 0.2) for x, y in mb.ret_arredondado(1.55, 2.05, 0.42, 4)]
    objs.append(pb.anel_extrudado(fora, dentro, 0.38, 0.98, cor, bisel=0.07, nome="tina", seg_bisel=1))
    fx = [(x * 1.012, y * 1.012) for x, y in fora]
    objs.append(pb.anel_extrudado(fx, dentro, 0.2, 0.42, faixa, nome="faixa"))
    objs.append(pb.plano(dentro, 0.4, "grafite_escuro", nome="piso"))
    objs.append(mb.caixa(1.08, 0.5, 0.2, y=0.32, z=0.42, cor=assento, bisel=0.07, seg=1, nome="banco"))
    enc = mb.caixa(1.08, 0.2, 0.62, y=0.62, z=0.5, cor=assento, bisel=0.07, seg=1, nome="encosto")
    mb.transforma(enc, loc=(0, 0.62, 0.5), rot=("X", -12))
    mb.transforma(enc, loc=(0, -0.62, -0.5))
    objs.append(enc)
    objs.append(pb.tubo([(-0.5, -0.12, 0.98), (-0.45, -0.18, 1.1), (0.45, -0.18, 1.1), (0.5, -0.12, 0.98)], 0.04,
                        "amarelo", 6, nome="trava"))
    if frente:  # carro da frente: olhinhos e bochechas
        c = cor_frente or "branco"
        for sx in (-1, 1):
            objs.append(mb.esfera(0.13, x=sx * 0.33, y=-1.02, z=0.78, cor=c, esc=(1, 0.5, 1), seg=10))
            objs.append(mb.esfera(0.075, x=sx * 0.33, y=-1.07, z=0.78, cor="preto", esc=(1, 0.5, 1), seg=8))
            objs.append(mb.esfera(0.1, x=sx * 0.55, y=-0.95, z=0.6, cor="rosa_bebe", esc=(1, 0.4, 0.7), seg=8))
    return objs


ASSENTOS_CARRO = [(-0.3, 0.22, 0.42), (0.3, 0.22, 0.42)]


def trem(it, tr, n=4, comp=2.3, s0=0.0, nome="carrinho", vel=6.0, cores=None, passo=0.6):
    """Coloca n carrinhos no trilho (em s0 − atraso) e grava a animação de percurso de cada um."""
    pontos = tr.pontos_percurso(passo)
    cores = cores or {}
    nos = []
    for i in range(n):
        atraso = round(comp * i, 3)
        M = tr.matriz_carro(s0 - atraso)
        objs = carrinho(frente=(i == 0), **cores)
        nm = f"{nome}_{i + 1}"
        it.anima_local(objs, {"anima": "percurso", "pontos": pontos, "velocidade": vel, "atraso": atraso,
                              "fechado": True}, nm, M)
        for k, c in enumerate(ASSENTOS_CARRO):
            it.slot_local(f"assento_{2 * i + k + 1}", c, (0.5, 0.5, 0.9), nm)
        nos.append(nm)
    return nos


def estacao(x0, x1, y_trilho, lado, z_chao, z_plat, cor_teto="laranja", cor_sob="roxo", letreiro="dragao.png",
            cor_post="branco"):
    """Plataforma de embarque ao lado do trilho (lado = −1: plataforma do lado −Y) com cobertura e letreiro."""
    larg = 1.5
    yc = y_trilho + lado * (0.95 + larg / 2)
    objs = [mb.caixa(x1 - x0, larg, z_plat - z_chao, x=(x0 + x1) / 2, y=yc, z=z_chao, cor="concreto", bisel=0.05,
                     seg=2, nome="plataforma"),
            mb.caixa(x1 - x0 + 0.04, 0.12, 0.06, x=(x0 + x1) / 2, y=yc - lado * (larg / 2 - 0.06), z=z_plat - 0.01,
                     cor="amarelo", bisel=0.01, seg=1, nome="faixa_seg")]
    # escada na ponta oeste
    for k in range(4):
        h = (z_plat - z_chao) * (k + 1) / 5
        objs.append(mb.caixa(0.35, larg, h, x=x0 - 0.35 * (4 - k) + 0.175, y=yc, z=z_chao, cor="concreto_escuro",
                             bisel=0.02, seg=1, nome="degrau"))
    ye = yc + lado * (larg / 2 - 0.08)
    objs.append(pb.grade([(x0, ye, z_plat), (x1, ye, z_plat)], cor=cor_post, nome="grade"))
    luzes = []
    # cobertura
    zt = z_plat + 2.7
    for x in (x0 + 0.4, (x0 + x1) / 2, x1 - 0.4):
        objs.append(mb.cilindro(0.08, zt - z_plat, x=x, y=ye, z=z_plat, cor=cor_post, seg=8, bisel=0.0))
    yr = y_trilho + lado * 0.2
    teto = mb.superelipsoide(x1 - x0 + 1.0, abs(ye - yr) + 2.2, 0.35, x=(x0 + x1) / 2, y=(ye + yr) / 2, z=zt,
                             cor=cor_teto, e=0.25, e_v=0.4, nu=16, nv=8, nome="teto")
    mb.pinta_onde(teto, cor_sob, lambda c, n: n.z < -0.3)
    objs.append(teto)
    yf = min(ye, yr) - 1.12  # o letreiro fica na beirada da frente (−Y) da cobertura
    objs.append(pb.placa_estampa(letreiro, ((x0 + x1) / 2, yf, zt + 0.55), 3.6, 0.9, frente=(0, -1, 0), emissao=1.4,
                                 nome="letreiro"))
    objs.append(mb.caixa(3.8, 0.12, 1.06, x=(x0 + x1) / 2, y=yf + 0.07, z=zt + 0.02, cor=cor_teto, bisel=0.04,
                         nome="placa_fundo"))
    for x in (x0 + 1.5, x1 - 1.5):
        luzes.append(mb.cilindro(0.18, 0.06, x=x, y=(ye + yr) / 2, z=zt - 0.04, cor=None, mat="luz", seg=12,
                                 bisel=0.01))
    return objs, luzes


# ======================================================================================================================
# Dragão bebê (local: origem no assento, frente −Y)
# ======================================================================================================================
def sobre_elipsoide(c, semi, d):
    d = V(d).normalized()
    a, b, cc = semi
    t = 1.0 / math.sqrt((d.x / a) ** 2 + (d.y / b) ** 2 + (d.z / cc) ** 2)
    p = V(c) + d * t
    q = p - V(c)
    n = V((q.x / a ** 2, q.y / b ** 2, q.z / cc ** 2)).normalized()
    return p, n


def orienta(ob, p, n, afunda=0.0):
    q = V(n).to_track_quat("Z", "Y")
    ob.data.transform(Matrix.Translation(V(p) - V(n) * afunda) @ q.to_matrix().to_4x4())
    return ob


def espinho(p, n, h, r, cor="terracota_escura"):
    """Espinho gordinho de ponta redonda (torno)."""
    perfil = [(0, 0), (r, 0), (r * 0.8, h * 0.42), (r * 0.36, h * 0.82), (0, h)]
    o = mb.torno(perfil, cor=cor, seg=8, angulo=50, nome="espinho")
    mb.transforma(o, loc=(0, 0, -h * 0.25))
    return orienta(o, p, n)


def dragao():
    ob = []
    cor, escura, clara = "terracota", "terracota_escura", "terracota_clara"
    # corpo (pera) e barriga com placas
    ob.append(mb.torno([(0, 0.0), (1.9, 0.12), (2.6, 0.8), (2.9, 1.9), (2.78, 3.1), (2.35, 4.2), (1.8, 5.2),
                        (1.35, 5.95), (0.6, 6.3), (0, 6.35)], y=0.5, cor=cor, seg=28, esc=(1, 0.92), nome="corpo"))
    perfil = []
    zc, hz, R = 2.6, 2.7, 2.0
    sulcos = [1.0, 1.8, 2.6, 3.4, 4.2]
    for k in range(21):
        z = zc - hz + 2 * hz * k / 20
        r = R * math.sqrt(max(0.0, 1 - ((z - zc) / hz) ** 2))
        if any(abs(z - s) < 0.14 for s in sulcos):
            r *= 0.95
        perfil.append((r, z))
    perfil[0] = (0, perfil[0][1])
    perfil[-1] = (0, perfil[-1][1])
    barriga = mb.torno(perfil, cor=clara, seg=18, esc=(1, 0.4), nome="barriga")
    mb.transforma(barriga, loc=(0, -1.55, 0.05))
    ob.append(barriga)
    # cabeça
    H0, HS = V((0, -0.5, 8.75)), (3.75, 3.25, 3.4)
    ob.append(mb.esfera(1.0, cor=cor, esc=HS, seg=28, nome="cabeca"))
    mb.transforma(ob[-1], loc=H0)
    # focinho com a boca aberta (o trilho entra por ela)
    foc = mb.superelipsoide(3.1, 2.0, 2.6, x=0, y=-3.1, z=5.8, cor=cor, e=0.75, e_v=0.7, nu=24, nv=12,
                            nome="focinho")
    ob.append(foc)
    boca_c = V((0, -3.98, 6.9))
    labio = mb.torno([(1.0 + 0.17 * math.cos(math.radians(a)), 0.17 * math.sin(math.radians(a)))
                      for a in range(-90, 271, 30)], cor=cor, seg=20, esc=(1.0, 0.84), nome="labio")
    mb.transforma(labio, rot=("X", 90))
    mb.transforma(labio, loc=boca_c)
    ob.append(labio)
    ob.append(mb.esfera(1.0, x=boca_c.x, y=boca_c.y + 0.08, z=boca_c.z, cor="vinho", esc=(1.0, 0.25, 0.84), seg=20,
                        nome="boca"))
    ob.append(mb.superelipsoide(0.95, 1.0, 0.24, x=0, y=-4.12, z=6.18, cor="rosa", e=0.6, e_v=0.6, nu=16, nv=8,
                                  nome="lingua"))
    for sx in (-1, 1):
        dente = mb.cilindro(0.12, 0.26, r2=0.03, cor="branco", seg=8, bisel=0.0)
        mb.transforma(dente, loc=(sx * 0.42, -4.02, 7.55), rot=("X", 180))
        ob.append(dente)
    # olhos, brilhos, bochechas
    for sx in (-1, 1):
        p, n = sobre_elipsoide(H0, HS, (sx * 0.46, -0.78, 0.26))
        ob.append(orienta(mb.esfera(1.0, cor="branco", esc=(1.0, 1.0, 0.45), seg=16), p, n, 0.18))
        p2 = p + n * 0.12 + V((-sx * 0.08, 0, -0.02))
        ob.append(orienta(mb.esfera(0.68, cor="preto", esc=(1.0, 1.08, 0.4), seg=14), p2, n, 0.0))
        ob.append(pb.bola(p2.x - sx * 0.18, p2.y - 0.22, p2.z + 0.24, 0.2, "branco", sub=1))
        ob.append(pb.bola(p2.x + sx * 0.2, p2.y - 0.24, p2.z - 0.18, 0.1, "branco", sub=1))
        p, n = sobre_elipsoide(H0, HS, (sx * 0.72, -0.6, -0.36))
        ob.append(orienta(mb.esfera(0.78, cor="salmao", esc=(1.0, 0.85, 0.22), seg=12), p, n, 0.08))
    # espinhos: coroa na cabeça e fileira nas costas e na cauda
    for k in range(7):
        f = -1 + 2 * k / 6
        d = V((f * 0.92, 0.3 + 0.25 * (1 - abs(f)), 0.88 - 0.3 * abs(f)))
        p, n = sobre_elipsoide(H0, HS, d)
        h = 1.35 - 0.5 * abs(f)
        ob.append(espinho(p, (n + V((0, 0.3, 0.1))).normalized(), h, 0.62 - 0.16 * abs(f), escura))
    for f in (-0.45, 0.45):  # dois atrás, na nuca
        p, n = sobre_elipsoide(H0, HS, (f, 0.9, 0.1))
        ob.append(espinho(p, (n + V((0, 0.1, 0.25))).normalized(), 1.0, 0.5, escura))
    tor = [(0.0, 0.0), (0.12, 1.9), (0.8, 2.6), (1.9, 2.9), (3.1, 2.78), (4.2, 2.35), (5.2, 1.8), (5.95, 1.35)]

    def r_tor(z):
        for (za, ra), (zb, rb) in zip(tor, tor[1:]):
            if za <= z <= zb:
                return ra + (rb - ra) * (z - za) / (zb - za)
        return 1.0

    for z, h in ((5.0, 1.15), (3.9, 1.35), (2.8, 1.3), (1.7, 1.05)):
        ob.append(espinho(V((0, 0.5 + 0.92 * r_tor(z) - 0.1, z)), V((0, 1, 0.45)).normalized(), h, 0.55, escura))
    # pernas (sentado: coxas, pés para a frente com sola e almofadinhas)
    for sx in (-1, 1):
        ob.append(mb.esfera(1.0, x=sx * 2.05, y=-0.9, z=1.15, cor=cor, esc=(1.05, 1.45, 1.0), seg=20, nome="coxa"))
        ob.append(mb.esfera(1.0, x=sx * 2.25, y=-2.75, z=0.62, cor=cor, esc=(0.85, 1.1, 0.68), seg=18, nome="pe"))
        sola = mb.esfera(0.66, cor=escura, esc=(1.0, 1.0, 0.2), seg=12)
        orienta(sola, V((sx * 2.25, -3.78, 0.72)), V((0, -1, 0.28)).normalized())
        ob.append(sola)
        for k, dx in enumerate((-0.42, 0.0, 0.42)):
            orienta_ob = pb.bola(0, 0, 0, 0.17, "marrom", sub=1, esc=(1, 1, 0.5))
            ob.append(orienta(orienta_ob, V((sx * 2.25 + dx, -3.86 - 0.04 * (k == 1), 1.12 - 0.08 * abs(dx))),
                              V((0, -1, 0.3)).normalized()))
        ob.append(orienta(pb.bola(0, 0, 0, 0.3, "marrom", sub=1, esc=(1.2, 1, 0.45)), V((sx * 2.25, -3.92, 0.6)),
                          V((0, -1, 0.28)).normalized()))
        # braços com mãozinhas
        ob.append(pb.tubo([(sx * 2.25, -0.4, 4.7), (sx * 2.3, -1.4, 4.0), (sx * 1.7, -2.3, 3.4)], 0.62, cor, 10,
                          escalas=[1.0, 0.9, 0.82], suave=4, nome="braco"))
        ob.append(pb.bola(sx * 1.6, -2.45, 3.3, 0.62, cor, sub=2, esc=(1, 0.9, 0.85)))
        for k in range(3):
            g = mb.cilindro(0.1, 0.24, r2=0.02, cor="creme", seg=6, bisel=0.0)
            orienta(g, V((sx * 1.6 + (k - 1) * 0.24, -2.95, 3.12)), V((0, -1, -0.3)).normalized())
            ob.append(g)
    # cauda enrolada ao lado direito
    pts = [(1.0, 2.4, 0.7), (3.0, 2.9, 0.45), (4.5, 1.4, 0.38), (4.6, -0.8, 0.4), (3.7, -2.3, 0.6), (2.9, -2.6, 1.2)]
    ob.append(pb.tubo(pts, 1.0, cor, 12, escalas=[1.0, 0.82, 0.62, 0.45, 0.3, 0.14], suave=5, nome="cauda"))
    for p_, d_, h in (((3.1, 3.4, 1.15), (0.1, 0.6, 1), 0.7), ((4.6, 1.9, 0.9), (0.6, 0.2, 1), 0.6),
                      ((4.9, -0.5, 0.75), (0.7, -0.1, 1), 0.5), ((4.0, -2.3, 0.95), (0.4, -0.4, 1), 0.35)):
        ob.append(espinho(V(p_), V(d_).normalized(), h, h * 0.42, escura))
    # asas de morcego nas costas
    for sx in (-1, 1):
        cont = [(0, -0.2), (0.6, 1.1), (1.7, 2.4), (3.1, 3.4), (4.3, 3.7), (4.1, 2.9), (3.8, 2.0), (3.35, 2.25),
                (3.0, 1.35), (2.45, 1.55), (2.0, 0.55), (1.45, 0.75), (0.9, -0.35)]
        asa = mb.extrudado(mb._ccw(cont), 0.18, cor=cor, bisel=0.06, seg=2, plano="xz", nome="asa")
        mb.transforma(asa, loc=(0, -0.09, 0))
        u = V((sx * 0.92, 0.38, 0.0)).normalized()
        v = V((0, 0.3, 1)).normalized()
        v = (v - u * v.dot(u)).normalized()
        w = v.cross(u).normalized()
        base = V((sx * 1.2, 2.3, 4.7))
        M = Matrix(((u.x, w.x, v.x, base.x), (u.y, w.y, v.y, base.y), (u.z, w.z, v.z, base.z), (0, 0, 0, 1)))
        asa.data.transform(M)
        ob.append(asa)
        w_ = v.cross(u).normalized()
        for a_, b_ in ((4.3, 3.7), (3.8, 2.0), (3.0, 1.35), (2.0, 0.55)):
            ob.append(pb.barra(base + v * 0.05 - w_ * 0.1, base + u * a_ + v * b_ - w_ * 0.1, 0.12, escura, 6,
                               nome="osso"))
        pt = base + u * 4.3 + v * 3.7 - w_ * 0.1
        ob.append(pb.bola(pt.x, pt.y, pt.z, 0.2, escura, sub=1))
    # narinas
    for sx in (-1, 1):
        ob.append(mb.esfera(0.12, x=sx * 0.5, y=-3.95, z=8.05, cor="vinho", esc=(1.2, 0.6, 0.8), seg=8))
    return ob


# ======================================================================================================================
# Vulcão
# ======================================================================================================================
class Vulcao:
    def __init__(self, cx, cy, escala=1.0):
        self.c = V((cx, cy))
        s = escala
        self.perfil = [(0.0, 12.85 * s), (2.05 * s, 12.85 * s), (2.15 * s, 13.3 * s), (2.45 * s, 14.05 * s),
                       (2.95 * s, 14.2 * s), (3.6 * s, 12.6 * s), (4.5 * s, 9.9 * s), (5.4 * s, 6.9 * s),
                       (6.3 * s, 4.0 * s), (7.0 * s, 1.8 * s), (7.6 * s, 0.6 * s), (7.95 * s, 0.25 * s)]
        self.rb = 7.95 * s

    def ruido_r(self, th):
        return 1 + 0.06 * math.sin(3 * th + 1.0) + 0.045 * math.sin(7 * th + 0.3) + 0.03 * math.sin(11 * th + 2)

    def ruido_z(self, th, j):
        if j < 4 or j >= len(self.perfil) - 1:
            return 0.0
        return 0.28 * math.sin(5 * th + j * 1.7) * (1 if j < 9 else 0.5)

    def altura(self, x, y):
        d = V((x, y)) - self.c
        th = math.atan2(d.y, d.x)
        r = d.length / self.ruido_r(th)
        P = self.perfil
        if r >= P[-1][0]:
            return 0.0
        for j in range(4, len(P) - 1):
            if P[j][0] <= r <= P[j + 1][0]:
                f = (r - P[j][0]) / (P[j + 1][0] - P[j][0])
                return (P[j][1] + self.ruido_z(th, j)) * (1 - f) + (P[j + 1][1] + self.ruido_z(th, j + 1)) * f
        return P[4][1]

    def malha(self, n=40):
        import bmesh
        bm = bmesh.new()
        aneis = []
        for j, (r, z) in enumerate(self.perfil):
            anel = []
            for i in range(n):
                th = 2 * math.pi * i / n
                rr = r * self.ruido_r(th)
                anel.append(bm.verts.new((self.c.x + rr * math.cos(th), self.c.y + rr * math.sin(th),
                                          z + self.ruido_z(th, j))))
            aneis.append(anel)
        for A, B in zip(aneis, aneis[1:]):
            for i in range(n):
                k = (i + 1) % n
                bm.faces.new((A[i], A[k], B[k], B[i]))
        bm.faces.new(aneis[0][::-1])
        ob = pb.obj("vulcao", bm, "marrom", liso=True, angulo=32)
        lava = pb.estampa("lava", emissao=1.6)
        zl = self.perfil[0][1]

        def pinta(c, nn):
            r = (V((c.x, c.y)) - self.c).length
            return r < self.perfil[1][0] * 1.08 and c.z < zl + 0.05

        mb.pinta_onde(ob, None, pinta, mat=lava)
        pb.planar_uv(ob, 0.11, so=lava)
        mb.pinta_onde(ob, "terracota_escura", lambda c, nn: c.z > zl + 0.05 and
                      (V((c.x, c.y)) - self.c).length < self.perfil[3][0] * 1.0)
        mb.pinta_onde(ob, "marrom_claro", lambda c, nn: c.z > 11.2 and (V((c.x, c.y)) - self.c).length >
                      self.perfil[3][0] * 1.0)
        # o material de lava precisa do UV planar só nas faces de lava: as outras voltam para a célula da cor
        return ob

    def rio_de_lava(self, th0=math.radians(250), larg0=1.0, larg1=2.0, n=26):
        """Lava descendo do cume até a base (fita sobre a superfície, um pouco acima)."""
        import bmesh
        lava = pb.estampa("lava", emissao=1.6)
        P = self.perfil
        r0, r1 = P[4][0] * 0.98, P[-1][0] * 1.05
        pts = []
        for k in range(n + 1):
            f = k / n
            r = r0 + (r1 - r0) * f
            th = th0 + 0.28 * math.sin(f * 5.0) * (0.4 + f)
            rr = r * self.ruido_r(th)
            x, y = self.c.x + rr * math.cos(th), self.c.y + rr * math.sin(th)
            pts.append((x, y, th, larg0 + (larg1 - larg0) * f ** 1.3))
        bm = bmesh.new()
        uvl = bm.loops.layers.uv.new("UVMap")
        linhas = []
        for i, (x, y, th, w) in enumerate(pts):
            a = pts[max(0, i - 1)]
            b = pts[min(n, i + 1)]
            t = V((b[0] - a[0], b[1] - a[1])).normalized()
            lado = V((-t.y, t.x))
            linha = []
            for q in (-1, -0.5, 0, 0.5, 1):
                px, py = x + lado.x * q * w / 2, y + lado.y * q * w / 2
                h = self.altura(px, py)
                z = max(h, 0.4) + 0.07 + 0.06 * (1 - q * q)
                linha.append(bm.verts.new((px, py, z)))
            linhas.append(linha)
        for A, B in zip(linhas, linhas[1:]):
            for k in range(4):
                bm.faces.new((A[k], A[k + 1], B[k + 1], B[k]))
        for f in bm.faces:
            for lo in f.loops:
                lo[uvl].uv = (lo.vert.co.x * 0.11, lo.vert.co.y * 0.11)
        ob = pb.obj("rio_lava", bm, None, mat=lava, liso=True)
        if sum(p.normal.z for p in ob.data.polygons) < 0:
            ob.data.flip_normals()
        return ob


def poca_lava(cx, cy, rx, ry, z=0.4, semente=0, nome="lava"):
    rnd = random.Random(semente)
    fs = [(rnd.uniform(0.05, 0.12), rnd.randint(2, 4), rnd.uniform(0, 6.28)) for _ in range(3)]

    def ruido(t):
        return sum(a * math.sin(k * t + f) for a, k, f in fs)

    cont = pb.superelipse(rx, ry, 2.4, 22, cx, cy, ruido)
    borda = pb.superelipse(rx + 0.45, ry + 0.45, 2.4, 22, cx, cy, ruido)
    lava = pb.estampa("lava", emissao=1.6)
    p = pb.plano(cont, z + 0.03, None, mat=lava, nome=nome)
    pb.planar_uv(p, 0.11)
    b = pb.anel_extrudado(borda, cont, z - 0.02, z + 0.05, "laranja_escuro", nome="borda_lava")
    return [p, b]


# ======================================================================================================================
# Montanha-russa do dragão (3 × 2 quadras: 45 × 30 m)
# ======================================================================================================================
DRAGAO_POS = V((-8.0, 2.6, 2.4))
VULCAO_C = (11.5, 3.5)


def rota_dragao():
    C = V((11.5, 3.5, 0))
    ctrl = [(-2.0, -9.8, 1.0), (1.5, -9.8, 1.1), (5.0, -9.6, 2.6), (8.5, -9.0, 5.6), (12.2, -7.6, 9.3),
            (15.3, -5.0, 12.0), (16.6, -1.5, 13.0)]
    R = 4.9
    for g in range(0, 211, 30):
        a = math.radians(g)
        ctrl.append((C.x + R * math.cos(a), C.y + R * math.sin(a), 13.2 + 0.15 * math.sin(a * 2)))
    ctrl += [(6.3, -1.6, 11.6), (4.4, -5.0, 8.0), (1.0, -6.9, 5.6), (-3.0, -7.4, 5.6), (-6.2, -6.3, 7.3),
             (-8.0, -3.7, 8.7), (-8.0, -1.0, 9.2), (-8.0, 2.0, 9.3), (-8.0, 5.4, 9.4), (-8.7, 8.6, 8.2),
             (-11.2, 10.8, 6.0), (-14.6, 11.2, 4.0), (-17.4, 9.6, 2.4), (-18.0, 7.3, 1.6)]
    ctrl += pb.looping((-18.0, 5.4, 1.5), (0, -1), 3.8, 1.7, n=20)
    ctrl += [(-16.3, 2.5, 1.45), (-16.3, -1.5, 1.35), (-15.4, -5.6, 1.2), (-13.4, -8.6, 1.05), (-10.4, -9.8, 1.0),
             (-6.5, -9.8, 1.0)]
    return ctrl


def montanha_dragao(it):
    W, D = 45.0, 30.0
    hx, hy = W / 2, D / 2
    # chão de grama inteiro (laje até −0,40) e o caminho em anel com entradas no meio das bordas
    it.add(cb.laje(cb.quadrado(-hx, -hy, hx, hy), 0.0, "grama", nome="grama"))
    linha = pb.contorno_ret(0, 0, 20.8, 13.3, 5.5, 8)
    it.add(pb.caminho_anel(linha))
    for (x0, y0, x1, y1) in ((0, -14.6, 0, -hy), (0, 14.6, 0, hy), (-22.1, -7.5, -hx, -7.5), (22.1, -7.5, hx, -7.5),
                             (-22.1, 7.5, -hx, 7.5), (22.1, 7.5, hx, 7.5)):
        it.add(pb.caminho_reto(x0, y0, x1, y1))
    # monte de terra
    rnd = random.Random(3)
    fs = [(rnd.uniform(0.01, 0.025), rnd.randint(3, 7), rnd.uniform(0, 6.28)) for _ in range(3)]

    def ruido(t):
        return sum(a * math.sin(k * t + f) for a, k, f in fs)

    cont = [(pb.superelipse(19.0 - d, 11.7 - d, 5.0, 64, 0, 0, ruido), z) for d, z in ((0.0, 0.02), (0.6, 0.25),
                                                                                         (1.2, 0.36), (1.8, 0.4))]
    it.add(pb.monte(cont, "marrom_claro", cor_lado="marrom", nome="terra"))
    # manchas mais escuras na terra
    for x, y, rx, ry in ((-11.0, 6.5, 3.4, 2.0), (4.5, 1.0, 2.6, 1.6), (-1.5, -2.0, 2.2, 1.4), (15.0, -8.5, 2.0, 1.2)):
        it.add(pb.plano(pb.superelipse(rx, ry, 2.2, 24, x, y), 0.405, "marrom", nome="mancha"))
    # vulcão, rio de lava e poças
    vul = Vulcao(*VULCAO_C)
    it.add(vul.malha(), vul.rio_de_lava())
    for i, (x, y, rx, ry) in enumerate(((-3.6, -4.2, 3.0, 1.9), (-14.6, -1.2, 2.2, 3.4), (1.8, 7.6, 3.2, 2.0),
                                        (8.0, -5.6, 2.6, 1.7), (-3.8, 9.6, 2.4, 1.4))):
        it.add(poca_lava(x, y, rx, ry, semente=i))
    # pedras: pedestal do dragão, afloramentos do vulcão e soltas
    dx, dy = DRAGAO_POS.x, DRAGAO_POS.y
    ped = [((dx, dy - 0.2), (8.4, 6.6, 2.45), "marrom", 1), ((dx + 0.2, dy - 3.0), (5.6, 3.2, 1.75), "marrom_claro", 2),
           ((dx - 3.7, dy + 1.6), (3.2, 3.4, 1.3), "marrom_claro", 3), ((dx + 3.9, dy + 2.2), (3.0, 2.8, 1.5), "marrom", 4),
           ((dx - 3.0, dy - 2.6), (2.4, 2.2, 0.9), "marrom", 5), ((dx + 3.6, dy - 2.2), (2.2, 2.0, 1.0), "marrom", 6)]
    for (x, y), (l, p, a), c, s in ped:
        it.add(pedra(x, y, 0.38, l, p, a, c, s))
    rnd = random.Random(11)
    for k in range(13):
        th = 2 * math.pi * k / 13 + rnd.uniform(-0.15, 0.15)
        if 230 < math.degrees(th) % 360 < 268:
            continue  # o rio de lava passa aqui
        r = vul.rb * rnd.uniform(0.82, 0.98)
        x, y = VULCAO_C[0] + r * math.cos(th), VULCAO_C[1] + r * math.sin(th)
        s = rnd.uniform(1.3, 2.6)
        it.add(pedra(x, y, max(0.38, vul.altura(x, y) - 0.6), s * 1.2, s, s * rnd.uniform(0.8, 1.4),
                     rnd.choice(["marrom", "marrom_claro", "terracota_escura"]), 20 + k, rot=th))
    # afloramentos de pedra em mesa atrás do vulcão (como os da referência)
    for x, y, l, p, a, c in ((17.4, 9.4, 3.4, 2.8, 3.6, "marrom"), (15.0, 10.6, 2.6, 2.2, 2.4, "marrom_claro"),
                             (18.2, 6.2, 2.4, 2.6, 2.6, "marrom_claro"), (12.6, 11.0, 2.2, 1.8, 1.6, "marrom"),
                             (18.0, -3.4, 2.2, 2.0, 1.9, "marrom"), (4.4, 9.6, 2.0, 1.6, 1.4, "marrom_claro")):
        it.add(pedra(x, y, 0.38, l, p, a, c, int(x * 7 + y)))
    for x, y, s in ((-17.0, -9.0, 1.0), (16.5, 10.0, 1.3), (-17.5, 10.8, 0.8), (3.5, -10.6, 0.7), (18.2, -10.0, 0.9)):
        it.add(pedra(x, y, 0.38, s * 1.3, s, s * 0.8, "marrom", int(x * 10)))
    # dragão
    dg = dragao()
    for o in dg:
        o.data.transform(Matrix.Translation(DRAGAO_POS))
    it.add(dg)
    # trilho, pilares, estação e trem
    tr = pb.Trilho(rota_dragao())
    it.add(tr.malha(cor_trilho="magenta", cor_espinha="vinho", cor_dormente="vinho", passo_dormente=1.9,
                    neon="neon_rosa"))

    def terreno(x, y):
        h = vul.altura(x, y)
        dentro = (abs(x) / 19.0) ** 5 + (abs(y) / 11.7) ** 5 < 1
        return max(h, 0.4 if dentro else 0.0)

    n = int(tr.tot / 4.2)
    for k in range(n):
        p, t, u, tg = tr.em(k * tr.tot / n + 1.0)
        base = p - u * 0.42
        zc = terreno(base.x, base.y)
        if tg is not None and p.z > 2.6:
            continue
        if -12.5 < base.x < -3.5 and -5.5 < base.y < 7.5 and p.z > 5:
            continue
        if base.z - zc < 0.3:
            continue
        it.add(pb.pilar((base.x, base.y, base.z), zc))
    est, luz_est = estacao(-9.5, -2.5, -9.8, -1, 0.4, 1.4)
    it.add(est)
    # postes de parque nas curvas do caminho
    luzes = list(luz_est)
    for x, y in ((-17.5, -11.0), (17.5, -11.0), (-17.5, 11.5), (17.5, 11.5)):
        e, l_ = pb.poste_parque(x * 1.17, y * 1.16, alt=4.4, bracos=2, ang=math.radians(45))
        it.add(e)
        luzes += l_
    it.add(luzes)
    trem(it, tr, 4, 2.3, s0=0.0, vel=6.5, cores=dict(cor="laranja", faixa="azul", assento="roxo"))
    it.colisao([((0, 0, cb.Z_FUNDO), (W, D, -cb.Z_FUNDO)), ((0, 0, 0), (37.5, 22.5, 0.4)),
                ((VULCAO_C[0], VULCAO_C[1], 0), (12.0, 12.0, 6.5)), ((VULCAO_C[0], VULCAO_C[1], 6.5), (6.5, 6.5, 7.7)),
                ((DRAGAO_POS.x, DRAGAO_POS.y - 0.4, 0), (8.6, 7.6, 2.4)),
                ((DRAGAO_POS.x, DRAGAO_POS.y - 0.6, 2.4), (6.6, 6.4, 9.6)),
                ((-6.0, -11.1, 0.4), (8.4, 1.5, 1.0))])
    return tr


def pedra(x, y, z, l, p, a, cor, semente, rot=None):
    rot = (semente * 0.7) if rot is None else rot
    return pb.pedra(x, y, z, l, p, a, cor, semente, rot)


# ======================================================================================================================
# Montanha-russa azul com loopings (2 × 2 quadras: 30 × 30 m)
# ======================================================================================================================
def rota_azul():
    ctrl = [(1.0, -11.3, 1.0), (4.0, -11.2, 1.1), (7.6, -10.2, 2.4), (10.4, -7.2, 5.2), (11.4, -2.5, 10.2),
            (11.2, 2.4, 15.6), (10.4, 6.6, 18.6), (8.0, 9.6, 19.0), (4.8, 10.4, 17.2), (1.6, 10.4, 11.0),
            (-1.0, 10.3, 4.6), (-3.0, 10.2, 2.1)]
    ctrl += pb.looping((-5.0, 10.2, 1.9), (-1, 0), 4.6, 2.3, n=22)
    ctrl += [(-8.2, 7.9, 2.0), (-10.6, 6.6, 2.4), (-11.3, 4.4, 2.3)]
    ctrl += pb.looping((-11.3, 2.2, 2.0), (0, -1), 4.0, 2.2, n=20)
    ctrl += [(-9.1, -0.6, 2.2), (-9.1, -3.2, 4.0), (-9.1, -5.8, 5.6), (-9.0, -8.0, 4.0), (-7.4, -10.6, 1.8),
             (-4.6, -11.3, 1.1), (-2.0, -11.3, 1.0)]
    return ctrl


def montanha_azul(it):
    S = 30.0
    h = S / 2
    it.add(cb.laje(cb.quadrado(-h, -h, h, h), 0.0, "grama", nome="grama"))
    # praça de ladrilho rosado com juntas em grade, borda de concreto e entradas no meio das bordas
    pr = pb.contorno_ret(0, 0, 13.6, 13.2, 6.0, 10)
    it.add(pb.plano(pr, 0.003, "piso_rosado", nome="praca"))
    it.add(pb.anel_extrudado(pb.desloca_contorno(pr, 0.22), pr, -0.05, 0.035, "concreto", nome="borda"))
    juntas = []
    for k in range(-21, 22):
        c = k * 0.6
        for eixo in (0, 1):
            lim = _corta_ret(c, 13.6, 13.2, 6.0, eixo)
            if lim:
                a, b = lim
                if eixo == 0:
                    juntas.append(pb.plano([(c - 0.012, a), (c + 0.012, a), (c + 0.012, b), (c - 0.012, b)], 0.005,
                                           "madeira_rosada", nome="junta"))
                elif k % 2 == 0:
                    juntas.append(pb.plano([(a, c - 0.015), (b, c - 0.015), (b, c + 0.015), (a, c + 0.015)], 0.0055,
                                           "madeira_rosada", nome="junta"))
    it.add(mb.junta(juntas, "juntas"))
    # entradas no meio de cada quadra das bordas (casam com o piso_grama_caminho das vizinhas)
    for c in (-7.5, 7.5):
        for (x0, y0, x1, y1) in ((c, -13.3, c, -h), (c, 13.3, c, h), (-13.7, c, -h, c), (13.7, c, h, c)):
            it.add(pb.caminho_reto(x0, y0, x1, y1))
    tr = pb.Trilho(rota_azul(), inclina=1.2)
    it.add(tr.malha(bitola=0.9, cor_trilho="azul", cor_espinha="azul_medio", cor_dormente="azul_medio", r_espinha=0.13,
                    prof_espinha=0.38, passo_dormente=0.9, neon="neon"))
    # pilares em A brancos com capitel azul; nos loopings, um pilar alto no topo
    n = int(tr.tot / 4.6)
    feitos = []
    for k in range(n):
        s = k * tr.tot / n + 0.8
        p, t, u, tg = tr.em(s)
        if tg is not None:
            continue
        base = p - u * 0.4
        if base.z < 0.35:
            continue
        lado = V((-t.y, t.x, 0))
        if lado.length < 0.2:
            continue
        ab = 0.35 + 0.16 * base.z
        it.add(pb.pilar_a(base, lado, 0.0, ab, r=0.11, cor="branco"))
        it.add(pb.caixa_eixos(base + u * 0.02, lado.normalized(), t, u, (0.5, 0.42, 0.3), "azul_medio", nome="capitel"))
        feitos.append(base)
    # topo dos loopings: procura o ponto mais alto de cada trecho com tag
    s_top = []
    ultimo = None
    melhor = None
    for i in range(tr.n):
        if tr.tag[i] is not None:
            if melhor is None or tr.P[i].z > tr.P[melhor].z:
                melhor = i
        elif melhor is not None:
            s_top.append(melhor)
            melhor = None
    for i in s_top:
        p, t, u = tr.P[i], tr.T[i], tr.U[i]
        topo = p + u * -0.0 + V((0, 0, 0.32))
        lado = V((-t.y, t.x, 0)).normalized()
        it.add(pb.pilar_a(topo + V((0, 0, 0.12)), lado, 0.0, 3.6, r=0.13, cor="branco"))
        it.add(mb.caixa(0.6, 0.6, 0.3, x=topo.x, y=topo.y, z=topo.z, cor="azul_medio", bisel=0.05))
    est, luz_est = estacao(-6.0, 0.5, -11.3, 1, 0.0, 1.35, cor_teto="azul_celeste", cor_sob="azul_medio",
                           letreiro="loopings.png")
    it.add(est)
    luzes = list(luz_est)
    # fila de espera com grades e postes de parque
    for x, y in ((-12.6, -12.4), (12.6, -12.4), (-12.6, 12.4), (12.6, 12.4)):
        e, l_ = pb.poste_parque(x, y, alt=4.4, bracos=2, ang=math.radians(45 if x * y > 0 else -45))
        it.add(e)
        luzes += l_
    # canteiro redondo no meio da praça, com árvore e flores, e bancos
    it.add(pb.anel_extrudado(mb.circulo(2.6, 28), mb.circulo(2.35, 28), -0.05, 0.4, "concreto", bisel=0.04,
                             seg_bisel=1, nome="canteiro"))
    it.add(pb.plano(mb.circulo(2.36, 28), 0.36, "grama", nome="canteiro_grama"))
    it.add(pb.arvore(0.3, 0.2, z=0.36, alt=4.2, r=1.4))
    for k in range(8):
        a = 2 * math.pi * k / 8
        it.add(pb.arbusto(1.75 * math.cos(a), 1.75 * math.sin(a), 0.32, ("rosa", "amarelo", "lilas", "branco")[k % 4],
                          z=0.36))
    for x, y, ang in ((4.2, 0.0, 90), (-4.2, 0.0, 90), (0.0, 4.0, 0)):
        bc = [mb.caixa(1.8, 0.45, 0.08, z=0.42, cor="madeira_mel", bisel=0.02, seg=1),
              mb.caixa(1.8, 0.08, 0.4, y=0.22, z=0.55, cor="madeira_mel", bisel=0.02, seg=1)]
        for sx in (-1, 1):
            bc.append(mb.caixa(0.08, 0.45, 0.42, x=sx * 0.75, cor="grafite", bisel=0.01, seg=1))
        for o in bc:
            mb.transforma(o, rot=("Z", ang))
            mb.transforma(o, loc=(x, y, 0.0))
        it.add(bc)
    for x, y in ((-3.0, -6.0), (4.5, -5.0), (5.0, 5.5), (-5.0, 6.5)):
        it.add(pb.arbusto(x, y, 0.6, "folha"), pb.arbusto(x + 0.8, y + 0.4, 0.4, "folha_clara"))
    for x, y in ((-13.8, -13.8), (13.8, -13.8), (-13.8, 13.8), (13.8, 13.8)):
        it.add(pb.arvore(x, y, alt=3.6, r=1.0))
    it.add(luzes)
    trem(it, tr, 4, 2.3, s0=0.0, vel=7.0, cores=dict(cor="amarelo", faixa="azul_marinho", assento="azul_celeste",
                                                     rodas="branco"))
    it.colisao([((0, 0, cb.Z_FUNDO), (S, S, -cb.Z_FUNDO)), ((-2.75, -9.6, 0), (6.6, 1.6, 1.35))])
    return tr


def _corta_ret(c, hx, hy, r, eixo):
    """Trecho de uma linha (x = c se eixo 0, y = c se eixo 1) dentro do retângulo arredondado ±hx × ±hy de raio r."""
    a, b = (hx, hy) if eixo == 0 else (hy, hx)
    if abs(c) >= a - 0.05:
        return None
    if abs(c) <= a - r:
        m = b
    else:
        d = abs(c) - (a - r)
        m = (b - r) + math.sqrt(max(0.0, r * r - d * d))
    m -= 0.03
    return (-m, m)
