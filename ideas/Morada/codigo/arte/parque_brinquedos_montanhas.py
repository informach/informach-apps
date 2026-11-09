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
    objs.append(mb.caixa(bitola + 0.3, 1.75, 0.12, z=0.08, cor="grafite", bisel=0.03, seg=1, nome="chassi"))
    fora = mb.ret_arredondado(1.55, 2.05, 0.5, 3)
    dentro = [(x * 0.74, y * 0.62 + 0.2) for x, y in mb.ret_arredondado(1.55, 2.05, 0.42, 3)]
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


def trem(it, tr, n=4, comp=2.3, s0=0.0, nome="carrinho", vel=6.0, cores=None, passo=0.5):
    """Coloca n carrinhos no trilho (em s0 − atraso) e grava a animação de percurso de cada um."""
    pontos = tr.pontos_percurso(passo)
    cores = cores or {}
    nos = []
    for i in range(n):
        atraso = round((comp * i - s0) % tr.tot, 3)  # em t = 0 o carrinho i está em s0 − comp·i (na estação)
        M = tr.matriz_carro(s0 - comp * i)
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
    o = mb.torno(perfil, cor=cor, seg=7, angulo=50, nome="espinho")
    mb.transforma(o, loc=(0, 0, -h * 0.25))
    return orienta(o, p, n)


def cabeca_tunel(c, semi, ang_f, ang_t, cor, n=28, passo=9.5):
    """Cabeça elipsoidal com os polos no eixo Y: abre a boca em volta do polo da frente (ang_f graus a partir de −Y) e a
    nuca em volta do polo de trás (ang_t), ligadas por um túnel por dentro (por onde o trilho passa). Devolve (objeto,
    aro da boca, aro da nuca)."""
    import bmesh
    a, b, cc = semi
    nseg = max(1, round((ang_t - ang_f) / passo))
    angs = [ang_f + (ang_t - ang_f) * k / nseg for k in range(nseg + 1)]

    def anel(phi):
        f = math.radians(phi)
        return [V((c.x + a * math.sin(f) * math.cos(t), c.y - b * math.cos(f), c.z + cc * math.sin(f) * math.sin(t)))
                for t in [2 * math.pi * k / n for k in range(n)]]

    bm = bmesh.new()
    aneis = [[bm.verts.new(p) for p in anel(phi)] for phi in angs]
    fr, tr = aneis[0], aneis[-1]
    yf, yt = fr[0].co.y, tr[0].co.y
    rf = (a * math.sin(math.radians(ang_f)), cc * math.sin(math.radians(ang_f)))
    rt = (a * math.sin(math.radians(ang_t)), cc * math.sin(math.radians(ang_t)))
    tun = [fr]
    m = 6
    for k in range(1, m):
        f = k / m
        aperto = 1 - 0.08 * math.sin(math.pi * f)
        rx = (rf[0] * (1 - f) + rt[0] * f) * aperto
        rz = (rf[1] * (1 - f) + rt[1] * f) * aperto
        y = yf + (yt - yf) * f
        tun.append([bm.verts.new((c.x + rx * math.cos(t), y, c.z + rz * math.sin(t)))
                    for t in [2 * math.pi * j / n for j in range(n)]])
    tun.append(tr)
    for A, B in zip(aneis, aneis[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((A[i], A[j], B[j], B[i]))
    marca = []
    for k, (A, B) in enumerate(zip(tun, tun[1:])):
        for i in range(n):
            j = (i + 1) % n
            marca.append((bm.faces.new((A[j], A[i], B[i], B[j])), k))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.faces.index_update()
    idx_boca = [f_.index for f_, k in marca if k == 0]
    idx_fundo = [f_.index for f_, k in marca if k > 0]
    aro_f = [v.co.copy() for v in fr]
    aro_t = [v.co.copy() for v in tr]
    ob = pb.obj("cabeca", bm, cor, liso=True, angulo=50)
    mb.pinta(ob, "vinho", idx_boca)
    mb.pinta(ob, "chocolate", idx_fundo)
    return ob, aro_f, aro_t


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
    # cabeçona com a boca escancarada na frente e um túnel por dentro até a nuca (o trilho atravessa)
    H0, HS = V((0, -0.4, 7.2)), (3.9, 3.4, 3.6)
    cab, aro_f, aro_t = cabeca_tunel(H0, HS, 25, 157, cor, n=26)
    ob.append(cab)
    ob.append(pb.tubo(aro_f, 0.24, cor, 5, fechado=True, nome="labio"))      # lábios em volta da boca
    ob.append(pb.tubo(aro_t, 0.16, escura, 6, fechado=True, nome="borda_nuca"))
    yb, zb, rx, rz = aro_f[0].y, H0.z, HS[0] * math.sin(math.radians(25)), HS[2] * math.sin(math.radians(25))
    for dx, h in ((-0.62, 0.42), (-0.22, 0.36), (0.22, 0.36), (0.62, 0.42)):  # dentinhos de cima, na beira da boca
        zt = zb + rz * math.sqrt(max(0.0, 1 - (dx / rx) ** 2)) + 0.02
        d_ = mb.torno([(0, 0), (0.19, 0.02), (0.15, h * 0.6), (0.06, h * 0.95), (0, h)], cor="branco", seg=8)
        mb.transforma(d_, rot=("X", 180))
        mb.transforma(d_, loc=(dx, yb + 0.12, zt))
        ob.append(d_)
    lng = mb.superelipsoide(1.5, 2.2, 0.32, cor="vermelho", e=0.55, e_v=0.6, nu=14, nv=6, nome="lingua")
    mb.transforma(lng, rot=("X", 8))
    mb.transforma(lng, loc=(0, yb + 0.55, zb - rz + 0.02))
    ob.append(lng)
    # olhos enormes no alto da cara (olhando para cima), brilhos, bochechas e narinas
    for sx in (-1, 1):
        p, n = sobre_elipsoide(H0, HS, (sx * 0.42, -0.66, 0.5))
        ob.append(orienta(mb.esfera(1.15, cor="branco", esc=(1.0, 1.05, 0.42), seg=14), p, n, 0.2))
        p2 = p + n * 0.14 + V((-sx * 0.06, 0, 0.06))
        ob.append(orienta(mb.esfera(0.82, cor="preto", esc=(1.0, 1.1, 0.4), seg=12), p2, n, 0.0))
        ob.append(pb.bola(p2.x - sx * 0.22, p2.y - 0.24, p2.z + 0.3, 0.24, "branco", sub=1))
        ob.append(pb.bola(p2.x + sx * 0.24, p2.y - 0.26, p2.z - 0.22, 0.11, "branco", sub=1))
        p, n = sobre_elipsoide(H0, HS, (sx * 0.72, -0.56, -0.12))
        ob.append(orienta(pb.bola(0, 0, 0, 0.8, "salmao", sub=2, esc=(1.0, 0.85, 0.22)), p, n, 0.08))
        p, n = sobre_elipsoide(H0, HS, (sx * 0.15, -0.88, 0.47))
        ob.append(orienta(pb.bola(0, 0, 0, 0.12, "vinho", sub=1, esc=(1.3, 0.9, 0.5)), p, n, 0.03))
    # espinhos: crista no alto da cabeça, dois de cada lado e fileira nas costas e na cauda
    for dy, dz, h, r in ((-0.35, 1.0, 1.25, 0.6), (0.05, 1.0, 1.45, 0.66), (0.45, 0.9, 1.35, 0.62),
                         (0.8, 0.6, 1.1, 0.55)):
        p, n = sobre_elipsoide(H0, HS, (0, dy, dz))
        ob.append(espinho(p, (n + V((0, 0.35, 0))).normalized(), h, r, escura))
    for sx in (-1, 1):
        for dy, dz in ((-0.05, 0.75), (0.45, 0.6)):
            p, n = sobre_elipsoide(H0, HS, (sx * 0.62, dy, dz))
            ob.append(espinho(p, (n + V((0, 0.3, 0.2))).normalized(), 0.95, 0.46, escura))
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
        ob.append(pb.bola(sx * 2.05, -0.9, 1.15, 1.0, cor, sub=2, esc=(1.05, 1.45, 1.0), nome="coxa"))
        ob.append(pb.bola(sx * 2.25, -2.75, 0.62, 1.0, cor, sub=2, esc=(0.85, 1.1, 0.68), nome="pe"))
        sola = pb.bola(0, 0, 0, 0.66, escura, sub=2, esc=(1.0, 1.0, 0.2))
        orienta(sola, V((sx * 2.25, -3.78, 0.72)), V((0, -1, 0.28)).normalized())
        ob.append(sola)
        for k, dx in enumerate((-0.42, 0.0, 0.42)):
            orienta_ob = pb.bola(0, 0, 0, 0.17, "marrom", sub=0, esc=(1, 1, 0.5))
            ob.append(orienta(orienta_ob, V((sx * 2.25 + dx, -3.86 - 0.04 * (k == 1), 1.12 - 0.08 * abs(dx))),
                              V((0, -1, 0.3)).normalized()))
        ob.append(orienta(pb.bola(0, 0, 0, 0.3, "marrom", sub=1, esc=(1.2, 1, 0.45)), V((sx * 2.25, -3.92, 0.6)),
                          V((0, -1, 0.28)).normalized()))
        # braços com mãozinhas
        ob.append(pb.tubo([(sx * 2.4, -0.5, 4.3), (sx * 2.65, -1.25, 3.4), (sx * 2.35, -1.75, 2.75)], 0.6, cor, 10,
                          escalas=[1.0, 0.9, 0.82], suave=4, nome="braco"))     # patinhas para baixo
        ob.append(pb.bola(sx * 2.3, -1.85, 2.6, 0.6, cor, sub=2, esc=(1, 0.95, 0.9)))
        for k in range(3):
            g = mb.cilindro(0.1, 0.24, r2=0.02, cor="creme", seg=6, bisel=0.0)
            orienta(g, V((sx * 2.3 + (k - 1) * 0.24, -2.35, 2.35)), V((0, -0.7, -0.7)).normalized())
            ob.append(g)
    # cauda enrolada ao lado direito
    pts = [(1.0, 2.4, 0.7), (3.0, 2.9, 0.45), (4.5, 1.4, 0.38), (4.6, -0.8, 0.4), (3.7, -2.3, 0.6), (2.9, -2.6, 1.2)]
    ob.append(pb.tubo(pts, 1.0, cor, 10, escalas=[1.0, 0.82, 0.62, 0.45, 0.3, 0.14], suave=5, nome="cauda"))
    for p_, d_, h in (((3.1, 3.4, 1.15), (0.1, 0.6, 1), 0.7), ((4.6, 1.9, 0.9), (0.6, 0.2, 1), 0.6),
                      ((4.9, -0.5, 0.75), (0.7, -0.1, 1), 0.5), ((4.0, -2.3, 0.95), (0.4, -0.4, 1), 0.35)):
        ob.append(espinho(V(p_), V(d_).normalized(), h, h * 0.42, escura))
    # asas de morcego nas costas
    for sx in (-1, 1):
        cont = [(0, -0.2), (0.6, 1.1), (1.7, 2.4), (3.1, 3.4), (4.3, 3.7), (4.1, 2.9), (3.8, 2.0), (3.35, 2.25),
                (3.0, 1.35), (2.45, 1.55), (2.0, 0.55), (1.45, 0.75), (0.9, -0.35)]
        cont = [(x * 1.3, z * 1.3) for x, z in cont]
        asa = mb.extrudado(mb._ccw(cont), 0.2, cor=cor, bisel=0.06, seg=2, plano="xz", nome="asa")
        mb.transforma(asa, loc=(0, -0.09, 0))
        u = V((sx * 0.92, 0.38, 0.0)).normalized()
        v = V((0, 0.3, 1)).normalized()
        v = (v - u * v.dot(u)).normalized()
        w = v.cross(u).normalized()
        base = V((sx * 1.6, 2.5, 4.5))
        M = Matrix(((u.x, w.x, v.x, base.x), (u.y, w.y, v.y, base.y), (u.z, w.z, v.z, base.z), (0, 0, 0, 1)))
        asa.data.transform(M)
        ob.append(asa)
        w_ = v.cross(u).normalized()
        for a_, b_ in ((4.3, 3.7), (3.8, 2.0), (3.0, 1.35), (2.0, 0.55)):
            ob.append(pb.barra(base + v * 0.05 - w_ * 0.12, base + (u * a_ + v * b_) * 1.3 - w_ * 0.12, 0.13, escura,
                               6, nome="osso"))
        pt = base + (u * 4.3 + v * 3.7) * 1.3 - w_ * 0.12
        ob.append(pb.bola(pt.x, pt.y, pt.z, 0.2, escura, sub=1))
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

    def malha(self, n=34):
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

    cont = pb.superelipse(rx, ry, 2.4, 18, cx, cy, ruido)
    borda = pb.superelipse(rx + 0.45, ry + 0.45, 2.4, 18, cx, cy, ruido)
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


DZ_D = (4.6, 1.0, 0.9, 0.7)    # alturas e subidas das curvas da montanha do dragão (ajuste da torção)
DZ_A = (1.0, 1.6, 0.8)         # subidas das três curvas da azul
Z_EST_AZUL = 1.6               # trilho na estação azul


def rota_dragao():
    """Subidas e descidas só nas retas, curvas planas, um looping em pé e a volta no cume do vulcão."""
    r = pb.Rota(-2.5, -9.8, 1.0, 0)
    r.reta(14.5, 13.0)                      # subida em linha reta pela frente
    r.curva(3.5, 90)                        # curva no alto, plana
    r.reta(9.8)                             # até a volta do vulcão
    r.curva(4.0, 180)                       # meia-volta em torno da cratera
    r.reta(6.7, 5.0)                        # queda
    r.curva(3.0, -90)
    r.reta(9.0, 9.2)                        # sobe até a boca do dragão
    r.curva(3.5, -90)
    r.reta(8.7)                             # entra pela boca e sai pela nuca (reto e plano dentro da cabeça)
    r.reta(1.5, 8.6)
    r.curva(3.0, 90)
    r.reta(4.0, DZ_D[0])                    # queda para o looping
    r.curva(2.5, 90, dz=DZ_D[1])            # curva subindo: desfaz metade da torção do looping
    r.reta(1.0)
    r.looping(3.8, 1.7, n=22)
    r.reta(13.3, DZ_D[2])
    r.curva(3.5, 90, dz=DZ_D[3])            # e a outra metade
    r.reta(3.4, 1.0)                        # chega na estação
    r.reta(6.4)                             # estação (volta ao começo)
    return r.fecha()


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
    for k in range(11):
        th = 2 * math.pi * k / 11 + rnd.uniform(-0.15, 0.15)
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
    it.add(tr.malha(cor_trilho="magenta", cor_espinha="vinho", cor_dormente="vinho", passo_dormente=2.2, lados=5,
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
        if tg is not None and u.z < 0.85:  # no looping, só embaixo (onde o trilho está em pé)
            continue
        if -12.5 < base.x < -3.5 and -5.5 < base.y < 6.8 and p.z > 5:
            continue
        if base.z - zc < 0.3:
            continue
        it.add(pb.pilar((base.x, base.y, base.z), zc, lados=6))
    est, luz_est = estacao(-9.5, -2.5, -9.8, -1, 0.4, 1.4)
    it.add(est)
    # postes de parque nas curvas do caminho
    luzes = list(luz_est)
    for x, y in ((-17.5, -11.0), (17.5, -11.0)):
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
DZ_A2 = (2.6, -3.8, 0.0)       # curvas que desfazem a torção dos loopings da azul (ajustadas pelo fechamento)


def rota_azul():
    """Traçado que serpenteia pela praça: estação na frente, subida na lateral direita, dois loopings grandes nos
    fundos, meia-volta, morros de camelo no meio, looping menor à direita, volta por cima da curva da frente e
    passagem baixa e longa até a estação."""
    zs = Z_EST_AZUL
    r = pb.Rota(-6.0, -10.5, zs, 0)
    r.reta(6.0)                             # estação
    r.reta(8.0, 1.2)                        # passagem baixa da frente
    r.curva(4.0, 90)
    r.reta(11.5, 13.0)                      # subida pela direita
    r.curva(3.0, 90)
    r.reta(5.5, 2.0)                        # queda
    r.reta(4.0)                             # trecho baixo: passa por baixo do looping
    r.looping(4.0, 2.0, n=28)               # looping grande, fundos à direita
    r.reta(8.8)
    r.looping(3.8, 2.0, n=28)               # looping grande, fundos à esquerda
    r.curva(3.5, 180, dz=DZ_A2[0])          # meia-volta à esquerda (subindo um pouco: desfaz a torção)
    r.reta(11.8, 1.8, lombada=3.6)          # morros de camelo
    r.reta(1.0)
    r.looping(2.8, 4.0, n=24)               # looping menor, à direita
    r.reta(1.0)
    r.reta(2.5, 4.6)
    r.curva(3.2, -180, dz=DZ_A2[1])         # volta por cima da curva da frente
    r.reta(13.0, 1.1)                       # passagem baixa e longa
    r.curva(2.45, 180, dz=zs - 1.1)         # chega na estação
    return r.fecha()


def suporte_azul(topo, t, u, lado, tripe=False):
    """Pilar branco da montanha azul: em A (duas pernas abertas para os lados) ou em tripé quando é alto, com a
    braçadeira azul prendendo o trilho no topo."""
    h = topo.z
    objs = [pb.caixa_eixos(topo + u * 0.04, lado, t, u, (0.55, 0.45, 0.32), "azul_medio", nome="bracadeira")]
    ab = 0.45 + 0.2 * h
    if h > 6.0 or tripe:
        ab = 0.6 + 0.22 * h
        fr = V((t.x, t.y, 0))
        fr = fr.normalized() if fr.length > 0.1 else V((-lado.y, lado.x, 0))
        for ang in (90, 210, 330):
            a = math.radians(ang)
            d = lado * math.cos(a) + fr * math.sin(a)
            pe = V((topo.x, topo.y, 0)) + d * ab
            lim = 14.2  # pés dentro do lote
            k = min([1.0] + [(lim - abs(c0)) / max(1e-6, abs(c1 - c0)) for c0, c1 in ((topo.x, pe.x), (topo.y, pe.y))
                             if abs(c1) > lim])
            pe = V((topo.x, topo.y, 0)) + d * (ab * max(0.3, k))
            objs.append(pb.barra(pe + V((0, 0, -0.05)), topo - V((0, 0, 0.1)), 0.15, "branco", 8, nome="perna"))
            objs.append(mb.caixa(0.55, 0.55, 0.28, x=pe.x, y=pe.y, z=-0.06, cor="concreto_escuro", bisel=0.0,
                                 liso=False, nome="sapata"))
        zm = h * 0.45
        f = 1 - zm / h
        anel = [V((topo.x, topo.y, zm)) + (lado * math.cos(math.radians(g)) + fr * math.sin(math.radians(g))) * ab * f
                for g in (90, 210, 330)]
        for a_, b_ in zip(anel, anel[1:] + anel[:1]):
            objs.append(pb.barra(a_, b_, 0.09, "branco", 6, nome="travessa"))
    else:
        objs += pb.pilar_a(topo - V((0, 0, 0.1)), lado, 0.0, ab, r=0.15, cor="branco")
    return objs


def montanha_azul(it):
    S = 30.0
    h = S / 2
    it.add(cb.laje(cb.quadrado(-h, -h, h, h), 0.0, "grama", nome="grama"))
    # praça de ladrilho rosado com juntas em grade, borda de concreto e entradas no meio das bordas
    pr = pb.contorno_ret(0, 0, 13.6, 13.2, 9.0, 12)  # praça quase oval
    it.add(pb.plano(pr, 0.003, "piso_rosado", nome="praca"))
    it.add(pb.anel_extrudado(pb.desloca_contorno(pr, 0.22), pr, -0.05, 0.035, "concreto", nome="borda"))
    juntas = []
    for k in range(-21, 22):
        c = k * 0.6
        for eixo in (0, 1):
            lim = _corta_ret(c, 13.6, 13.2, 9.0, eixo)
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
        lim_y = _corta_ret(c, 13.6, 13.2, 9.0, 0)[1] - 1.6  # começa dentro da praça (cobre a borda curva)
        lim_x = _corta_ret(c, 13.6, 13.2, 9.0, 1)[1] - 1.6
        for (x0, y0, x1, y1) in ((c, -lim_y, c, -h), (c, lim_y, c, h), (-lim_x, c, -h, c), (lim_x, c, h, c)):
            it.add(pb.caminho_reto(x0, y0, x1, y1, z=0.004))
    tr = pb.Trilho(rota_azul(), inclina=1.2)
    it.add(tr.malha(bitola=0.9, cor_trilho="azul", cor_espinha="azul_medio", cor_dormente="azul_medio", r_espinha=0.13,
                    prof_espinha=0.38, passo_dormente=1.0, neon="neon", neon_alt=0.025))
    # pilares brancos em A (baixos) e em tripé (altos), com braçadeira azul prendendo o trilho; nos loopings, um
    # pilar de cada lado do círculo (no meio da altura) e um embaixo
    n = int(tr.tot / 4.2)
    for k in range(n):
        s_ = k * tr.tot / n + 0.8
        p, t, u, tg = tr.em(s_)
        base = p - u * 0.4
        if tg is not None or base.z < 0.45 or abs(t.z) > 0.8:
            continue
        lado = V((-t.y, t.x, 0))
        if lado.length < 0.2:
            continue
        it.add(suporte_azul(base, t, u, lado.normalized()))
    for i in range(1, tr.n - 1):  # lados dos loopings: onde o trilho está em pé (vertical) e subindo/descendo
        if tr.tag[i] is None or tr.tag[i - 1] is None:
            continue
        if abs(tr.T[i].z) > 0.995 and abs(tr.T[i - 1].z) <= 0.995 and abs(tr.U[i].z) < 0.2:
            p, t, u = tr.P[i], tr.T[i], tr.U[i]
            base = p - u * 0.4
            lado = V((-u.y, u.x, 0)).normalized() if V((u.x, u.y)).length > 0.1 else V((1, 0, 0))
            it.add(suporte_azul(base, t, u, lado, tripe=True))
    est, luz_est = estacao(-6.0, 0.0, -10.5, -1, 0.0, Z_EST_AZUL + 0.35, cor_teto="azul_celeste", cor_sob="azul_medio",
                           letreiro="loopings.png")
    it.add(est)
    luzes = list(luz_est)
    for x, y in ((-11.6, -10.6), (11.6, -10.6), (-11.6, 10.6), (11.6, 10.6)):
        e, l_ = pb.poste_parque(x, y, alt=4.4, bracos=2, ang=math.radians(45 if x * y > 0 else -45))
        it.add(e)
        luzes += l_
    for x, y in ((-13.8, -13.8), (13.8, -13.8), (-13.8, 13.8), (13.8, 13.8)):
        it.add(pb.arvore(x, y, alt=3.6, r=1.0))
    it.add(luzes)
    trem(it, tr, 4, 2.3, s0=6.0, vel=7.0, cores=dict(cor="amarelo", faixa="azul_marinho", assento="azul_celeste",
                                                     rodas="branco"))
    # colisão: chão, estação, a subida (pilares em tripé) e os três loopings com os pilares deles
    it.colisao([((0, 0, cb.Z_FUNDO), (S, S, -cb.Z_FUNDO)), ((-3.0, -11.5, 0), (6.4, 1.6, Z_EST_AZUL + 0.35)),
                ((12.0, -0.75, 0), (2.4, 11.5, 13.2)), ((-0.5, 7.0, 0), (8.6, 3.0, 10.2)),
                ((-9.3, 5.0, 0), (8.0, 3.0, 9.8)), ((3.5, -1.0, 0), (6.2, 5.0, 7.6))])
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
