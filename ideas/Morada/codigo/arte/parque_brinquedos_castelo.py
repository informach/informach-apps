"""Peças do castelo do parque (casinha-portão, torres, muretas, cone de telhado) e a estátua gigante da menina de
vestido azul (desenho próprio). Pedra cinza, arremates laranja e amarelo, telhados turquesa.
"""
import math
import random

import bmesh
from mathutils import Matrix, Vector

import moveis_base as mb
import parque_brinquedos_base as pb

V = Vector
Z = V((0, 0, 1))
PEDRA, PEDRA2, PEDRA3 = "cinza", "cinza_claro", "cinza_medio"
ARREMATE, BASE, TELHA, TELHA2 = "amarelo_escuro", "laranja", "turquesa", "turquesa_claro"


def pedras_parede(x0, x1, z0, z1, y, sinal, n, semente, eixo="y"):
    """Pedrinhas salientes espalhadas numa parede plana (fachada y = const olhando para sinal·Y, ou x = const), sem
    encostar umas nas outras."""
    rnd = random.Random(semente)
    out, feitas = [], []
    tent = 0
    while len(out) < n and tent < 200:
        tent += 1
        u = rnd.uniform(x0 + 0.35, x1 - 0.35)
        z = rnd.uniform(z0 + 0.3, z1 - 0.3)
        if any(abs(u - a) < 0.75 and abs(z - b) < 0.45 for a, b in feitas):
            continue
        feitas.append((u, z))
        l, a = rnd.uniform(0.35, 0.55), rnd.uniform(0.2, 0.28)
        d = rnd.uniform(0.06, 0.09)
        cor = rnd.choice([PEDRA2, PEDRA3])
        if eixo == "y":
            out.append(mb.caixa(l, d, a, x=u, y=y + sinal * (d / 2 - 0.01), z=z, cor=cor, bisel=0.025, seg=1,
                                nome="pedra"))
        else:
            out.append(mb.caixa(d, l, a, x=y + sinal * (d / 2 - 0.01), y=u, z=z, cor=cor, bisel=0.025, seg=1,
                                nome="pedra"))
    return out


def pedras_cilindro(r, z0, z1, n, semente, cx=0.0, cy=0.0):
    rnd = random.Random(semente)
    out = []
    for _ in range(n):
        a = rnd.uniform(0, 2 * math.pi)
        z = rnd.uniform(z0 + 0.3, z1 - 0.3)
        p = mb.caixa(rnd.uniform(0.35, 0.55), 0.1, rnd.uniform(0.2, 0.28), cor=rnd.choice([PEDRA2, PEDRA3]), bisel=0.03,
                     seg=1, nome="pedra")
        mb.transforma(p, loc=(0, -r + 0.02, z))
        mb.transforma(p, rot=("Z", math.degrees(a)))
        mb.transforma(p, loc=(cx, cy, 0))
        out.append(p)
    return out


def janela_arco(x, y, z, larg, alt, frente=(0, -1, 0), mat="janela", moldura=ARREMATE):
    """Janelinha em arco (vidro que acende à noite) com moldura, na parede com normal 'frente'."""
    pts = [(-larg / 2, 0), (larg / 2, 0)] + [(larg / 2 * math.cos(math.pi * k / 8), alt - larg / 2 + larg / 2 *
                                               math.sin(math.pi * k / 8)) for k in range(9)]
    pts = [p for i, p in enumerate(pts) if i != 2]
    vid = mb.extrudado(mb._ccw(pts), 0.04, plano="xz", cor=None, mat=mat, bisel=0.0, nome="janela")
    fr = [(-larg / 2 - 0.1, -0.08), (larg / 2 + 0.1, -0.08)] + [((larg / 2 + 0.1) * math.cos(math.pi * k / 8),
                                                                  alt - larg / 2 + (larg / 2 + 0.1) * math.sin(math.pi * k / 8))
                                                                 for k in range(9)]
    fr = [p for i, p in enumerate(fr) if i != 2]
    mol = mb.extrudado(mb._ccw(fr), 0.06, plano="xz", cor=moldura, bisel=0.015, seg=1, nome="moldura")
    mb.transforma(vid, loc=(0, -0.1, 0))
    mb.transforma(mol, loc=(0, -0.04, 0))
    ang = math.degrees(math.atan2(frente[0], -frente[1]))
    objs = [mol, vid]
    for o in objs:
        mb.transforma(o, rot=("Z", ang))
        mb.transforma(o, loc=(x, y, z))
    return objs


def ameias(r, z, n=8, alt=0.55, esp=0.32, cor=PEDRA, cor_topo=ARREMATE, cx=0.0, cy=0.0):
    """Coroa de ameias numa torre redonda: anel de base + merlões."""
    out = [pb.anel_extrudado(mb.circulo(r + 0.12, 32), mb.circulo(r - esp, 32), z, z + 0.32, cor_topo, bisel=0.04,
                             seg_bisel=1, nome="coroa")]
    for k in range(n):
        a0 = 2 * math.pi * k / n
        a1 = a0 + 2 * math.pi / n * 0.55
        fo = [((r + 0.1) * math.cos(a0 + (a1 - a0) * j / 3), (r + 0.1) * math.sin(a0 + (a1 - a0) * j / 3)) for j in range(4)]
        de = [((r - esp) * math.cos(a1 - (a1 - a0) * j / 3), (r - esp) * math.sin(a1 - (a1 - a0) * j / 3)) for j in range(4)]
        m = mb.extrudado(mb._ccw(fo + de), alt, z=z + 0.3, cor=cor, bisel=0.04, seg=1, nome="merlao")
        out.append(m)
    for o in out:
        mb.transforma(o, loc=(cx, cy, 0))
    return out


def torre(r, alt, base_cor=BASE, n_ameias=8, janelas=((0.5, 0),), semente=1, n_pedras=10):
    o = [mb.cilindro(r + 0.22, 0.75, cor=base_cor, seg=24, bisel=0.08, nome="base"),
         mb.cilindro(r, alt - 0.3, z=0.3, cor=PEDRA, seg=24, bisel=0.02, nome="fuste"),
         mb.cilindro(r + 0.12, 0.2, z=alt - 0.25, r2=r + 0.18, cor=PEDRA3, seg=24, bisel=0.02, nome="cornija")]
    o += ameias(r + 0.06, alt - 0.06, n_ameias)
    o.append(mb.cilindro(r - 0.25, 0.1, z=alt - 0.02, cor=PEDRA3, seg=20, bisel=0.0, nome="piso_topo"))
    o += pedras_cilindro(r, 0.8, alt - 0.4, n_pedras, semente)
    for f, ang in janelas:
        z = 0.75 + (alt - 1.6) * f
        a = math.radians(ang) - math.pi / 2
        o += janela_arco(r * math.cos(a), r * math.sin(a), z, 0.45, 0.8, frente=(math.cos(a), math.sin(a), 0),
                         mat="janela" if f > 0.6 else "janela_fria")
    return o


def torre_alta(it):
    it.add(torre(1.5, 8.6, janelas=((0.85, 0), (0.85, 120), (0.55, 240), (0.3, 0)), semente=3, n_pedras=14))
    it.colisao([((0, 0, 0), (3.4, 3.4, 9.2))])


def torre_baixa(it):
    it.add(torre(1.15, 3.8, base_cor=PEDRA3, n_ameias=7, janelas=((0.5, 0),), semente=5, n_pedras=6))
    it.colisao([((0, 0, 0), (2.6, 2.6, 4.4))])


def telhado_quatro_aguas(L, W, z0, h, beiral=0.35):
    """Telhado de quatro águas sobre L × W (centrado), cumeeira ao longo de X."""
    Lb, Wb = L / 2 + beiral, W / 2 + beiral
    r = max(0.05, (L - W) / 2)
    B = [V((-Lb, -Wb, z0)), V((Lb, -Wb, z0)), V((Lb, Wb, z0)), V((-Lb, Wb, z0))]
    C = [V((-r, 0, z0 + h)), V((r, 0, z0 + h))]
    bm = bmesh.new()
    b = [bm.verts.new(p) for p in B]
    c = [bm.verts.new(p) for p in C]
    bm.faces.new((b[0], b[1], c[1], c[0]))
    bm.faces.new((b[1], b[2], c[1]))
    bm.faces.new((b[2], b[3], c[0], c[1]))
    bm.faces.new((b[3], b[0], c[0]))
    bm.faces.new((b[3], b[2], b[1], b[0]))
    ob = pb.obj("telhado", bm, TELHA, liso=False)
    faixas = []
    for k in range(1, 4):
        f = k / 4
        zz = z0 + h * f
        lx, wy = Lb - (Lb - r) * f, Wb * (1 - f)
        P = [V((x, y, zz)) for x, y in ((-lx, -wy), (lx, -wy), (lx, wy), (-lx, wy))]
        faixas.append(pb.varre(P, [Z] * 4, [(-0.06, -0.05), (0.08, -0.05), (0.08, 0.04), (-0.06, 0.04)], TELHA2, True,
                               nome="telha", liso=False))
    bordas = [pb.barra(a_, b_, 0.09, BASE, 6, nome="espigao")
              for a_, b_ in ((B[0], C[0]), (B[1], C[1]), (B[2], C[1]), (B[3], C[0]), (C[0], C[1]))]
    bordas.append(pb.tubo(B, 0.1, BASE, 6, fechado=True, nome="beiral"))
    return [ob] + faixas + bordas


def portao(it):
    L, W, H = 5.2, 4.0, 3.8
    pv, ph = 1.7, 2.6  # vão da passagem
    o = [mb.caixa(L + 0.3, W + 0.3, 0.35, cor=BASE, bisel=0.06, seg=1, nome="soco")]
    # paredes: laterais cheias e frente/fundo com o vão em arco
    o.append(mb.caixa(0.5, W, H, x=-L / 2 + 0.25, cor=PEDRA, bisel=0.03, seg=1))
    o.append(mb.caixa(0.5, W, H, x=L / 2 - 0.25, cor=PEDRA, bisel=0.03, seg=1))
    for sy in (-1, 1):
        y = sy * (W / 2 - 0.25)
        lado = (L - 1.0 - pv) / 2
        for sx in (-1, 1):
            o.append(mb.caixa(lado, 0.5, H, x=sx * (pv / 2 + lado / 2), y=y, cor=PEDRA, bisel=0.03, seg=1))
        cont = [(-pv / 2, ph - pv / 2), (-pv / 2, H), (pv / 2, H), (pv / 2, ph - pv / 2)]
        cont += [(pv / 2 * math.cos(math.pi * k / 10), ph - pv / 2 + pv / 2 * math.sin(math.pi * k / 10))
                 for k in range(1, 10)]
        topo = mb.extrudado(mb._ccw(cont), 0.5, plano="xz", cor=PEDRA, bisel=0.02, seg=1, nome="lintel")
        mb.transforma(topo, loc=(0, y - 0.25, 0))
        o.append(topo)
        # moldura laranja do arco
        arco = [(-pv / 2 - 0.0, 0.35), (-pv / 2, ph - pv / 2)] + [(pv / 2 * math.cos(math.pi * (1 - k / 10)),
                                                                     ph - pv / 2 + pv / 2 * math.sin(math.pi * (1 - k / 10)))
                                                                    for k in range(1, 10)] + [(pv / 2, ph - pv / 2),
                                                                                              (pv / 2, 0.35)]
        P = [V((x, sy * (W / 2 + 0.02), z)) for x, z in arco]
        o.append(pb.tubo(P, 0.12, ARREMATE, 6, nome="arco"))
    o.append(mb.caixa(pv + 0.1, W - 0.9, 0.04, z=0.33, cor=PEDRA3, bisel=0.0, liso=False, nome="piso"))
    o.append(mb.caixa(L - 0.9, W - 0.9, 0.1, z=ph + 0.05, cor=PEDRA3, bisel=0.0, liso=False, nome="teto_vao"))
    # cantoneiras e cinta laranja
    for sx in (-1, 1):
        for sy in (-1, 1):
            o.append(mb.caixa(0.3, 0.3, H + 0.1, x=sx * (L / 2 - 0.05), y=sy * (W / 2 - 0.05), cor=ARREMATE, bisel=0.05,
                              seg=1, nome="cantoneira"))
    o.append(pb.anel_extrudado(mb.ret_arredondado(L + 0.24, W + 0.24, 0.12, 2), mb.ret_arredondado(L - 0.2, W - 0.2, 0.1, 2),
                               H - 0.05, H + 0.22, ARREMATE, bisel=0.04, seg_bisel=1, nome="cinta"))
    o.append(mb.caixa(L - 0.1, W - 0.1, 0.1, z=H + 0.05, cor=PEDRA3, bisel=0.0, liso=False))
    # janelinhas
    for sx in (-1, 1):
        o += janela_arco(sx * 1.75, -W / 2, 1.7, 0.36, 0.7, mat="janela" if sx < 0 else "janela_apagada")
        o += janela_arco(sx * 1.75, W / 2, 1.7, 0.36, 0.7, frente=(0, 1, 0), mat="janela_fria")
    for k, (yy, mat) in enumerate(((-0.8, "janela"), (0.0, "janela_apagada"), (0.8, "janela_fria"))):
        o += janela_arco(L / 2, yy, 2.3, 0.3, 0.6, frente=(1, 0, 0), mat=mat)
        o += janela_arco(-L / 2, yy, 2.3, 0.3, 0.6, frente=(-1, 0, 0), mat=("janela_fria", "janela", "janela_apagada")[k])
    o += pedras_parede(-L / 2 + 0.3, -pv / 2 - 0.2, 0.4, H - 0.3, -W / 2, -1, 4, 1)
    o += pedras_parede(pv / 2 + 0.2, L / 2 - 0.3, 0.4, H - 0.3, -W / 2, -1, 4, 2)
    o += pedras_parede(-W / 2 + 0.3, W / 2 - 0.3, 0.4, H - 0.3, L / 2, 1, 5, 3, eixo="x")
    o += pedras_parede(-W / 2 + 0.3, W / 2 - 0.3, 0.4, H - 0.3, -L / 2, -1, 5, 4, eixo="x")
    # telhado de quatro águas turquesa, com frontão na frente
    o += telhado_quatro_aguas(L, W, H + 0.2, 2.2)
    fr = mb.extrudado(mb._ccw([(-1.2, 0), (1.2, 0), (0, 1.5)]), 1.6, plano="xz", cor=PEDRA2, bisel=0.03, seg=1,
                      nome="frontao")
    mb.transforma(fr, loc=(0, -W / 2 - 0.55, H + 0.2))
    o.append(fr)
    tf = []
    for sx in (-1, 1):
        bm = bmesh.new()
        q = [bm.verts.new((0, -W / 2 - 0.75, H + 1.92)), bm.verts.new((sx * 1.5, -W / 2 - 0.75, H + 0.05)),
             bm.verts.new((sx * 1.5, -W / 2 + 1.3, H + 0.05)), bm.verts.new((0, -W / 2 + 1.3, H + 1.92))]
        f = bm.faces.new(q)
        ob = pb.obj("agua_frontao", bm, TELHA2, liso=False)
        if ob.data.polygons[0].normal.z < 0:
            ob.data.flip_normals()
        tf.append(ob)
        tf.append(pb.barra((0, -W / 2 - 0.78, H + 1.95), (sx * 1.55, -W / 2 - 0.78, H + 0.02), 0.08, BASE, 6))
    o += tf
    o += janela_arco(0, -W / 2 - 0.55, H + 0.35, 0.34, 0.7, mat="janela")
    o.append(mb.esfera(0.16, z=H + 2.5, cor="ouro", seg=10))
    o.append(mb.cilindro(0.04, 0.5, z=H + 2.4, cor="ouro", seg=6, bisel=0.0))
    it.add(o)
    it.colisao([((-L / 2 + 0.5, 0, 0), (1.3, W + 0.3, H + 0.2)), ((L / 2 - 0.5, 0, 0), (1.3, W + 0.3, H + 0.2)),
                ((0, 0, ph), (L, W, H + 2.4 - ph))])


def mureta_pecas(pts_centro, alt=1.8, esp=0.7, semente=1):
    """Mureta ao longo de uma linha 2D: corpo de pedra, rodapé e chapéu amarelo saliente, pedrinhas dos dois lados."""
    P = [V((x, y, 0)) for x, y in pts_centro]
    T = pb.tangentes(P, False)
    U = [Z] * len(P)
    corpo = pb.varre(P, U, [(-esp / 2, 0), (esp / 2, 0), (esp / 2, alt), (-esp / 2, alt)], PEDRA, False, tampas=True,
                     nome="mureta", liso=False, T=T)
    rod = pb.varre(P, U, [(-esp / 2 - 0.08, -0.02), (esp / 2 + 0.08, -0.02), (esp / 2 + 0.08, 0.35),
                          (-esp / 2 - 0.08, 0.35)], PEDRA3, False, tampas=True, nome="rodape", liso=False, T=T)
    cap = []
    perfil = [(-esp / 2 - 0.14, alt - 0.05), (esp / 2 + 0.14, alt - 0.05), (esp / 2 + 0.17, alt + 0.06),
              (esp / 2 + 0.14, alt + 0.17), (esp / 2 + 0.05, alt + 0.25), (0, alt + 0.28), (-esp / 2 - 0.05, alt + 0.25),
              (-esp / 2 - 0.14, alt + 0.17), (-esp / 2 - 0.17, alt + 0.06)]
    cap.append(pb.varre(P, U, perfil, ARREMATE, False, tampas=True, nome="chapeu", liso=False, T=T))
    # juntas das fiadas (horizontais) e das pedras (verticais, desencontradas) nas duas faces
    juntas = []
    L = pb.comprimentos(P, False)
    for sg in (-1, 1):
        Pl = [p + V((t.y, -t.x, 0)) * (sg * (esp / 2 + 0.004)) for p, t in zip(P, T)]
        for zj in (0.85, 1.32):
            juntas.append(pb.varre([q + V((0, 0, zj)) for q in Pl], U, [(-0.006, -0.02), (0.006, -0.02), (0.006, 0.02),
                                                                        (-0.006, 0.02)], PEDRA3, False, nome="junta",
                                   liso=False, T=T))
        for fi, (za, zb_) in enumerate(((0.35, 0.85), (0.85, 1.32), (1.32, alt - 0.05))):
            s_ = 0.45 * (fi % 2) + 0.5
            while s_ < L[-1] - 0.3:
                j = 0
                while j < len(L) - 2 and L[j + 1] < s_:
                    j += 1
                f = (s_ - L[j]) / (L[j + 1] - L[j])
                q = Pl[j].lerp(Pl[j + 1], f)
                t = T[j]
                lado = V((t.y, -t.x, 0)) * sg
                juntas.append(pb.caixa_eixos(q + V((0, 0, (za + zb_) / 2)), t, lado, Z, (0.04, 0.012, zb_ - za - 0.02),
                                             PEDRA3, nome="junta"))
                s_ += 0.9
    rnd = random.Random(semente)
    L = pb.comprimentos(P, False)
    pedras = []
    for _ in range(9):
        s = rnd.uniform(0.4, L[-1] - 0.4)
        j = 0
        while j < len(L) - 2 and L[j + 1] < s:
            j += 1
        f = (s - L[j]) / (L[j + 1] - L[j])
        p = P[j].lerp(P[j + 1], f)
        t = T[j]
        lado = V((t.y, -t.x, 0))
        sg = rnd.choice((-1, 1))
        z = rnd.uniform(0.55, alt - 0.35)
        pd = pb.caixa_eixos(p + lado * (sg * (esp / 2 + 0.03)) + V((0, 0, z)), t, lado, Z,
                            (rnd.uniform(0.35, 0.6), 0.1, rnd.uniform(0.2, 0.28)), rnd.choice([PEDRA2, PEDRA3]),
                            nome="pedra")
        pedras.append(pd)
    return [corpo, rod] + cap + pedras + juntas


def mureta(it):
    it.add(mureta_pecas([(-3.0, 0), (3.0, 0)], semente=2))
    it.colisao([((0, 0, 0), (6.0, 0.9, 2.06))])


def mureta_curva(it):
    R, ang = 6.0, 60
    pts = [(R * math.sin(math.radians(-ang / 2 + ang * k / 12)), R - R * math.cos(math.radians(-ang / 2 + ang * k / 12)))
           for k in range(13)]
    yc = sum(p[1] for p in pts) / len(pts)
    pts = [(x, y - yc) for x, y in pts]
    it.add(mureta_pecas(pts, semente=4))
    it.colisao([((0, 0, 0), (6.2, 1.8, 2.06))])


def cone_telhado(it):
    o = []
    camadas = [(0.0, 1.95, 1.45, 1.1), (1.0, 1.5, 1.0, 1.0), (1.9, 1.05, 0.5, 1.0), (2.75, 0.62, 0.05, 1.1)]
    for k, (z0, r0, r1, h) in enumerate(camadas):
        o.append(mb.cilindro(r0, h, z=z0, r2=r1, cor=TELHA if k % 2 == 0 else TELHA2, seg=24, bisel=0.05,
                             nome="camada"))
        o.append(mb.torno([(r0 + 0.02, z0 - 0.02), (r0 + 0.1, z0 + 0.04), (r0 + 0.02, z0 + 0.12)], cor=BASE, seg=24))
    o.append(mb.cilindro(0.05, 0.9, z=3.7, cor="ouro", seg=6, bisel=0.0))
    o.append(mb.esfera(0.2, z=3.85, cor="ouro", seg=12))
    band = mb.extrudado(mb._ccw([(0, 0), (0.6, 0.1), (0, 0.36)]), 0.03, plano="xz", cor="rosa", bisel=0.005, seg=1)
    mb.transforma(band, loc=(0.04, 0, 4.18))
    o.append(band)
    it.add(o)
    it.colisao([((0, 0, 0), (3.9, 3.9, 2.8))])


# ======================================================================================================================
# Estátua gigante da menina de vestido azul
# ======================================================================================================================
def revolucao_babado(perfil, ondas=12, amp=0.05, seg=48, cor="azul", z_onda=None, nome="babado"):
    """Sólido de revolução com a barra ondulada (babado): raio × (1 + amp·sen(ondas·θ)) abaixo de z_onda."""
    bm = bmesh.new()
    aneis = []
    for r, z in perfil:
        anel = []
        for i in range(seg):
            t = 2 * math.pi * i / seg
            k = amp * math.sin(ondas * t) if (z_onda is None or z <= z_onda) else 0.0
            anel.append(bm.verts.new((r * (1 + k) * math.cos(t), r * (1 + k) * math.sin(t), z)))
        aneis.append(anel)
    for A, B in zip(aneis, aneis[1:]):
        for i in range(seg):
            j = (i + 1) % seg
            bm.faces.new((A[i], A[j], B[j], B[i]))
    bm.faces.new(aneis[0][::-1])
    bm.faces.new(aneis[-1])
    return pb.obj(nome, bm, cor, liso=True, angulo=60)


def esfera_cortada(r, c, esc, corte, cor, seg=24, nome="cabelo"):
    """Esfera sem as faces em que corte(centro_local, normal) é verdadeiro (franja/cabelo com o rosto aberto)."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=seg // 2, radius=r)
    bm.transform(Matrix.Diagonal((*esc, 1)))
    apaga = [f for f in bm.faces if corte(f.calc_center_median(), f.normal)]
    bmesh.ops.delete(bm, geom=apaga, context="FACES")
    # espessura: casca dupla para não ver o avesso
    ret = bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=-0.08)
    bm.transform(Matrix.Translation(c))
    return pb.obj(nome, bm, cor, liso=True, angulo=70)


def estatua_menina(it):
    pele, cabelo, vest, vest2, vest3 = "pessego", "madeira_media", "azul", "azul_celeste", "azul_bebe"
    o = []
    # pedestal redondo
    o.append(mb.cilindro(2.55, 0.45, cor="concreto", seg=36, bisel=0.06, nome="pedestal"))
    o.append(mb.cilindro(2.3, 0.35, z=0.45, cor="branco", seg=36, bisel=0.05))
    o.append(mb.cilindro(2.36, 0.08, z=0.62, cor="ouro", seg=36, bisel=0.02))
    rnd = random.Random(9)
    for k in range(14):
        a = 2 * math.pi * k / 14
        o.append(pb.bola(2.42 * math.cos(a), 2.42 * math.sin(a), 0.5, 0.2, rnd.choice(["rosa", "amarelo", "lilas",
                                                                                         "branco"]), sub=1,
                         esc=(1, 1, 0.8)))
        o.append(pb.bola(2.5 * math.cos(a + 0.22), 2.5 * math.sin(a + 0.22), 0.42, 0.22, "folha", sub=0))
    z0 = 0.8
    # sapatinhos e pernas
    for sx in (-1, 1):
        o.append(mb.superelipsoide(0.55, 0.85, 0.42, x=sx * 0.42, y=-0.25, z=z0, cor="rosa", e=0.6, e_v=0.6, nu=12,
                                   nv=6, nome="sapato"))
        o.append(mb.cilindro(0.2, 0.6, x=sx * 0.4, y=-0.05, z=z0 + 0.3, cor=pele, seg=10, bisel=0.0))
    # saia em três babados
    saia = [((2.05, 0.0), (2.0, 0.25), (1.85, 0.75), (1.6, 1.15)),
            ((1.75, 0.95), (1.68, 1.2), (1.45, 1.75), (1.25, 2.05)),
            ((1.38, 1.85), (1.3, 2.1), (1.05, 2.6), (0.82, 2.95))]
    zs = z0 + 0.75
    for k, (perfil, cor) in enumerate(zip(saia, (vest3, vest2, vest))):
        pr = [(r, zs + z) for r, z in perfil]
        o.append(revolucao_babado(pr, ondas=14 - 2 * k, amp=0.045, seg=42, cor=cor, z_onda=zs + perfil[1][1],
                                  nome="saia"))
        o.append(revolucao_babado([(perfil[0][0] * 1.005, zs + perfil[0][1] + 0.0), (perfil[0][0] * 1.012, zs + perfil[0][1] + 0.08)],
                                  ondas=14 - 2 * k, amp=0.045, seg=42, cor="branco", z_onda=99, nome="renda"))
    # corpete, faixa rosa com laço nas costas, gola e mangas bufantes
    zc = zs + 2.85
    o.append(mb.torno([(0.86, zc - 0.1), (0.9, zc + 0.25), (0.82, zc + 0.8), (0.66, zc + 1.2), (0.3, zc + 1.32),
                       (0, zc + 1.33)], cor=vest, seg=24, nome="corpete"))
    o.append(mb.torno([(0.92, zc + 0.08), (0.95, zc + 0.16), (0.95, zc + 0.36), (0.9, zc + 0.42)], cor="rosa", seg=24,
                      nome="faixa"))
    for sx in (-1, 1):
        laco = mb.superelipsoide(0.75, 0.3, 0.55, cor="rosa", e=0.7, e_v=0.7, nu=12, nv=6)
        mb.transforma(laco, rot=("Y", sx * 25))
        mb.transforma(laco, loc=(sx * 0.42, 0.98, zc + 0.05))
        o.append(laco)
        fita = mb.superelipsoide(0.22, 0.12, 0.8, cor="rosa", e=0.6, nu=8, nv=4)
        mb.transforma(fita, rot=("Y", sx * 15))
        mb.transforma(fita, loc=(sx * 0.22, 1.0, zc - 0.75))
        o.append(fita)
    o.append(pb.bola(0, 1.0, zc + 0.3, 0.2, "rosa_escuro", sub=1))
    o.append(mb.torno([(0.35, zc + 1.12), (0.9, zc + 1.18), (0.95, zc + 1.24), (0.4, zc + 1.36)], cor="branco",
                      seg=24, nome="gola"))
    for sx in (-1, 1):
        o.append(mb.superelipsoide(0.95, 0.9, 0.85, x=sx * 0.9, y=0.05, z=zc + 0.62, cor=vest2, e=0.85, e_v=0.85,
                                   nu=14, nv=7, nome="manga"))
        # braços abertos, mãozinhas para a frente
        o.append(pb.tubo([(sx * 1.2, 0.02, zc + 0.62), (sx * 1.55, -0.15, zc + 0.05), (sx * 1.62, -0.55, zc - 0.32)],
                         0.21, pele, 10, escalas=[1.0, 0.95, 0.9], suave=3, nome="braco"))
        o.append(pb.bola(sx * 1.62, -0.66, zc - 0.4, 0.27, pele, sub=2, esc=(0.9, 1.0, 1.1), nome="mao"))
    # pescoço e cabeça grande
    zh = zc + 2.55
    o.append(mb.cilindro(0.3, 0.5, z=zc + 1.25, cor=pele, seg=12, bisel=0.0))
    R = 1.32
    o.append(mb.esfera(R, z=zh, cor=pele, esc=(1.06, 1.0, 0.97), seg=32, nome="cabeca"))
    # rosto
    for sx in (-1, 1):
        ex, ez = sx * 0.48, zh - 0.08
        ey = -math.sqrt(max(0.0, R * R - (ex / 1.06) ** 2 - ((ez - zh) / 0.97) ** 2)) * 1.0
        olho = mb.esfera(0.27, cor="chocolate", esc=(0.85, 0.4, 1.12), seg=16)
        mb.transforma(olho, rot=("Z", sx * 18))
        mb.transforma(olho, loc=(ex, ey + 0.06, ez))
        o.append(olho)
        o.append(pb.bola(ex - sx * 0.07, ey - 0.03, ez + 0.1, 0.085, "branco", sub=1))
        o.append(pb.bola(ex + sx * 0.06, ey - 0.02, ez - 0.1, 0.045, "branco", sub=0))
        for j in range(2):
            c0 = V((ex + sx * (0.2 + 0.03 * j), ey + 0.1, ez + 0.2 - 0.1 * j))
            o.append(pb.barra(c0, c0 + V((sx * 0.14, 0.02, 0.08 - 0.04 * j)), 0.025, "chocolate", 5, nome="cilio"))
        bx = sx * 0.78
        by = -math.sqrt(max(0.0, R * R - (bx / 1.06) ** 2 - (0.42 / 0.97) ** 2)) + 0.05
        bo = mb.esfera(0.25, cor="rosa_bebe", esc=(1.0, 0.35, 0.65), seg=12)
        mb.transforma(bo, rot=("Z", sx * 35))
        mb.transforma(bo, loc=(bx, by, zh - 0.42))
        o.append(bo)
    o.append(pb.bola(0, -R + 0.02, zh - 0.32, 0.08, "pessego", sub=1, esc=(1.2, 1, 0.8)))
    o.append(pb.tubo([(-0.2, -R + 0.13, zh - 0.58), (0, -R + 0.07, zh - 0.67), (0.2, -R + 0.13, zh - 0.58)], 0.035,
                     "vinho", 6, nome="sorriso"))
    # cabelo: calota com o rosto aberto, franja e duas chiquinhas com laços cor-de-rosa
    def corte(c, n):
        return c.y < -0.25 and c.z < 0.62 * R

    o.append(esfera_cortada(R + 0.07, V((0, 0.05, zh + 0.03)), (1.07, 1.02, 1.0), corte, cabelo, seg=28))
    for k in range(5):
        f = -1 + 2 * k / 4
        m = mb.superelipsoide(0.62, 0.42, 0.6, cor=cabelo, e=0.8, e_v=0.8, nu=10, nv=6, nome="franja")
        mb.transforma(m, rot=[("Z", f * 28), ("X", 28)])
        mb.transforma(m, loc=(f * 0.62, -R * 0.84 + abs(f) * 0.22, zh + 0.72 - abs(f) * 0.18))
        o.append(m)
    for sx in (-1, 1):  # mechas dos lados do rosto (cobrem a borda da calota)
        for k, (dy, dz, h_) in enumerate(((-0.55, 0.05, 1.5), (-0.15, 0.1, 1.6))):
            m = mb.superelipsoide(0.42, 0.55, h_, cor=cabelo, e=0.8, e_v=0.75, nu=10, nv=6, nome="mecha")
            mb.transforma(m, loc=(0, 0, -h_ / 2))
            mb.transforma(m, rot=[("Y", sx * 8), ("Z", sx * (20 - 10 * k))])
            mb.transforma(m, loc=(sx * (1.2 + 0.05 * k), dy, zh + dz + 0.25))
            o.append(m)
    for sx in (-1, 1):
        ch = pb.tubo([(sx * 1.25, 0.25, zh + 0.25), (sx * 1.75, 0.35, zh - 0.25), (sx * 1.82, 0.3, zh - 1.05),
                      (sx * 1.6, 0.2, zh - 1.55)], 0.42, cabelo, 12, escalas=[0.8, 1.0, 0.85, 0.35], suave=3,
                     nome="chiquinha")
        o.append(ch)
        for j in (-1, 1):
            lc = mb.superelipsoide(0.55, 0.22, 0.4, cor="rosa", e=0.7, e_v=0.7, nu=10, nv=5)
            mb.transforma(lc, rot=[("Y", j * 30), ("Z", sx * 20)])
            mb.transforma(lc, loc=(sx * 1.32 + j * 0.25, 0.1, zh + 0.38))
            o.append(lc)
        o.append(pb.bola(sx * 1.32, 0.08, zh + 0.38, 0.13, "rosa_escuro", sub=1))
    # tiara com estrelinha
    o.append(pb.tubo([(R * 1.05 * math.cos(math.radians(a)), 0.15 + 0.1 * math.sin(math.radians(a)) * 0,
                       zh + R * 0.98 * math.sin(math.radians(a))) for a in range(20, 161, 20)], 0.07, "amarelo", 6,
                     nome="tiara"))
    est = mb.extrudado(mb._ccw([(0.32 * math.sin(math.pi * k / 5) * (1 if k % 2 == 0 else 0.45),
                                 0.32 * math.cos(math.pi * k / 5) * (1 if k % 2 == 0 else 0.45)) for k in range(10)]),
                       0.1, plano="xz", cor="amarelo", bisel=0.02, seg=1, nome="estrela")
    mb.transforma(est, loc=(0, 0.1, zh + R + 0.2))
    o.append(est)
    it.add(o)
    it.colisao([((0, 0, 0), (5.1, 5.1, 0.8)), ((0, 0, 0.8), (3.6, 3.6, 3.0)), ((0, 0, 3.8), (2.4, 2.0, 5.0))])
