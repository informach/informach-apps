"""Brinquedos de praça avulsos da categoria props_lazer (cada um uma peça, com animação e assentos): balanço duplo,
escorregador ondulado, gangorra, caixa de areia com foguete, trepa-trepa de cubos, gira-gira e casinha de brincar.
Desenhos próprios, diferentes dos do playground de parque_areas. Usado por cidade_props_lazer.py."""
import math

import bpy  # noqa: F401
from mathutils import Vector

import moveis_base as mb
from props_lazer_base import Malha, arbusto, bola, cil, cx, decal, esf, flores, gira_z, girar, haste, mover, varre

V = Vector
EST = None


def tapete(x, y, rx, ry, cor="grafite", z=0.004):
    """Tapete emborrachado oval no chão (debaixo dos balanços e das saídas)."""
    pts = [(x + rx * math.cos(2 * math.pi * k / 20), y + ry * math.sin(2 * math.pi * k / 20)) for k in range(20)]
    return decal(pts, z, cor, nome="tapete")


def cata_vento(cx_, cy_, cz, r=0.22, cores=("vermelho", "amarelo", "azul", "verde")):
    """Cata-vento de 4 pás virado para −Y (gira no eixo z do glTF)."""
    m = Malha()
    for k in range(4):
        a = math.radians(90 * k)
        p0 = (cx_, cy_, cz)
        p1 = (cx_ + r * math.cos(a), cy_, cz + r * math.sin(a))
        p2 = (cx_ + r * 0.7 * math.cos(a + 0.9), cy_ - 0.06, cz + r * 0.7 * math.sin(a + 0.9))
        for tri in ((p0, p1, p2),):
            vs = [m.v(q) for q in tri]
            m.f(vs, cores[k])
            m.f([m.v(q) for q in tri][::-1], cores[k])
    return [m.obj("pas"), esf(0.03, x=cx_, y=cy_ - 0.03, z=cz, cor="branco", seg=8)]


# =====================================================================================================================
# Balanço duplo
# =====================================================================================================================
def p_balanco(it):
    bx, bz, py = 1.55, 2.3, 0.95
    ps = []
    for s in (-1, 1):
        x = s * bx
        for sy in (-1, 1):
            ps.append(haste((x, sy * py, 0.0), (x, 0, bz), 0.055, "vermelho", 10))
            ps.append(cil(0.09, 0.06, x=x, y=sy * py * 0.98, cor="grafite", seg=10))
        ps.append(haste((x, -py * 0.45, bz * 0.55), (x, py * 0.45, bz * 0.55), 0.035, "vermelho", 8))
        ps.append(esf(0.11, x=x, z=bz, cor="amarelo", seg=10))
    ps.append(haste((-bx - 0.1, 0, bz), (bx + 0.1, 0, bz), 0.065, "verde", 12))
    it.add(mb.junta(ps, "estrutura"))
    it.add(tapete(-0.65, 0, 0.6, 1.2), tapete(0.65, 0, 0.6, 1.2))
    # assento comum (esquerda) e cadeirinha de bebê (direita), cada um balança no seu ritmo
    for k, x in enumerate((-0.65, 0.65)):
        zs = 0.45
        pecas = []
        for dx in (-0.21, 0.21):
            pecas.append(haste((x + dx, 0, bz - 0.04), (x + dx, 0, zs + (0.06 if k == 0 else 0.34)), 0.012, "metal",
                               4))
            pecas.append(mb.torno([(0.035, -0.01), (0.05, 0.0), (0.035, 0.01), (0.02, 0.0)], x=x + dx, z=bz - 0.06,
                                  cor="metal_escuro", seg=6))
        if k == 0:
            pecas.append(mb.superelipsoide(0.5, 0.2, 0.06, x=x, z=zs, cor="amarelo", e=0.35, e_v=0.5, nu=12, nv=3))
        else:
            pecas += [mb.superelipsoide(0.42, 0.36, 0.12, x=x, z=zs - 0.04, cor="azul", e=0.45, e_v=0.5, nu=12, nv=4),
                      mb.superelipsoide(0.44, 0.1, 0.42, x=x, y=0.16, z=zs, cor="azul", e=0.4, e_v=0.5, nu=12, nv=4),
                      mb.superelipsoide(0.08, 0.32, 0.32, x=x - 0.2, z=zs, cor="azul_celeste", e=0.4, e_v=0.5, nu=8,
                                        nv=4),
                      mb.superelipsoide(0.08, 0.32, 0.32, x=x + 0.2, z=zs, cor="azul_celeste", e=0.4, e_v=0.5, nu=8,
                                        nv=4),
                      mb.tubo([(x - 0.2, -0.16, zs + 0.3), (x - 0.12, -0.2, zs + 0.34), (x + 0.12, -0.2, zs + 0.34),
                               (x + 0.2, -0.16, zs + 0.3)], 0.025, cor="amarelo", raio_curva=0.05, seg=6),
                      haste((x, -0.19, zs + 0.33), (x, -0.12, zs + 0.04), 0.03, "amarelo", 6)]
        nome = f"balanco_{k + 1}"
        it.anima(pecas, {"anima": "balancar", "angulo": 26 if k == 0 else 16, "periodo": 2.8 if k == 0 else 2.3,
                         "eixo": "x"}, nome, pivo=(x, 0, bz - 0.04))
        it.assento(f"assento_{k + 1}", x, 0, zs + (0.06 if k == 0 else 0.08), pai=nome)
    return {"col": [((-bx, 0, 0), (0.3, 2 * py + 0.1, bz + 0.1)), ((bx, 0, 0), (0.3, 2 * py + 0.1, bz + 0.1)),
                    ((0, 0, bz - 0.1), (2 * bx + 0.3, 0.2, 0.2))], "mini": (0.55, -1.0, 0.45)}


# =====================================================================================================================
# Escorregador ondulado
# =====================================================================================================================
def p_escorregador(it):
    zp, a = 1.5, 0.45
    ps = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            ps.append(cil(0.055, zp + 0.9, x=sx * a, y=sy * a, cor="verde", seg=10))
            ps.append(esf(0.08, x=sx * a, y=sy * a, z=zp + 0.92, cor="amarelo", seg=10))
    ps.append(cx(2 * a + 0.1, 2 * a + 0.1, 0.08, z=zp - 0.08, cor="madeira_mel", bisel=0.02))
    for sx in (-1, 1):  # guarda-corpos laterais em painel com janela redonda
        ps.append(cx(0.04, 2 * a - 0.1, 0.7, x=sx * a, z=zp + 0.08, cor="amarelo", bisel=0.015))
        ps.append(cil(0.17, 0.05, x=sx * (a + 0.0), z=zp + 0.43, cor="azul_claro", seg=14, eixo="x"))
    ps.append(mb.tubo([(-a, a, zp + 0.85), (a, a, zp + 0.85)], 0.035, cor="amarelo", seg=8))
    ps.append(mb.tubo([(-a, -a, zp + 0.85), (-0.3, -a, zp + 0.85)], 0.035, cor="amarelo", seg=8))
    ps.append(mb.tubo([(0.3, -a, zp + 0.85), (a, -a, zp + 0.85)], 0.035, cor="amarelo", seg=8))
    ps.append(haste((-0.3, -a, zp + 0.95), (0.3, -a, zp + 0.95), 0.03, "vermelho", 8))   # barra de impulso
    # telhadinho de lona
    m = Malha()
    top = zp + 1.55
    for k in range(4):
        c = [(-a - 0.1, -a - 0.1), (a + 0.1, -a - 0.1), (a + 0.1, a + 0.1), (-a - 0.1, a + 0.1)]
        p0, p1 = c[k], c[(k + 1) % 4]
        cor = ("vermelho", "branco")[k % 2]
        vs = [m.v((p0[0], p0[1], zp + 0.95)), m.v((p1[0], p1[1], zp + 0.95)), m.v((0, 0, top))]
        m.f(vs, cor)
        m.f([m.v(q.co) for q in vs][::-1], cor)
    ps.append(m.obj("telhado"))
    # escada atrás (+Y)
    for sx in (-0.3, 0.3):
        ps.append(haste((sx, a + 0.85, 0.0), (sx, a + 0.05, zp), 0.04, "azul", 8))
        ps.append(mb.tubo([(sx, a + 0.12, zp), (sx, a + 0.15, zp + 0.6), (sx, a - 0.02, zp + 0.75)], 0.03, cor="azul",
                          raio_curva=0.08, seg=6))
    for k in range(5):
        t = (k + 0.6) / 5.6
        ps.append(cx(0.6, 0.12, 0.04, y=a + 0.85 - 0.8 * t, z=zp * t, cor="madeira_mel", bisel=0.015))
    it.add(mb.junta(ps, "torre"))
    # calha ondulada descendo para −Y
    n = 28
    L = 3.1
    cam = []
    for k in range(n + 1):
        t = k / n
        y = -a - L * t
        z = zp - (zp - 0.32) * (t if t < 0.9 else 0.9 + (t - 0.9) * 1.0) - 0.16 * math.sin(2 * math.pi * t * 2) * (1 - t)
        if t > 0.9:
            z = 0.32 + 0.02 * (1 - t)
        cam.append((0, y, max(0.3, z)))
    perfil = [(-0.33, 0.22), (-0.33, -0.04), (0.33, -0.04), (0.33, 0.22), (0.27, 0.22), (0.27, 0.02), (-0.27, 0.02),
              (-0.27, 0.22)]
    it.add(varre(cam, perfil, "laranja", nome="calha"))
    it.add(varre([(p[0], p[1], p[2] + 0.025) for p in cam], [(-0.26, 0), (0.26, 0), (0.26, -0.004), (-0.26, -0.004)],
                 "amarelo_claro", nome="pista"))
    for s in (-1, 1):
        it.add(haste((s * 0.25, cam[-3][1], 0), (s * 0.25, cam[-3][1], 0.3), 0.04, "verde", 8))
    it.add(tapete(0, cam[-1][1] - 0.5, 0.7, 0.6, cor="azul_escuro"))
    # cata-vento no canto da torre (gira)
    it.add(haste((a, -a, zp + 0.92), (a, -a, zp + 1.25), 0.015, "branco", 4))
    it.anima(cata_vento(a, -a - 0.04, zp + 1.28), {"anima": "girar", "eixo": "z", "velocidade": 160}, "cata_vento",
             pivo=(a, -a - 0.04, zp + 1.28))
    it.assento("topo", 0, 0, zp)
    return {"col": [((0, 0.2, 0), (2 * a + 0.2, 2 * a + 1.4, zp + 1.0)), ((0, -a - L / 2, 0), (0.7, L, 1.2))],
            "mini": (0.75, -1.0, 0.5)}


# =====================================================================================================================
# Gangorra
# =====================================================================================================================
def p_gangorra(it):
    zc = 0.58
    ps = []
    for sy in (-1, 1):  # cavalete em A vermelho
        ps.append(haste((-0.32, sy * 0.24, 0.0), (0, sy * 0.24, zc), 0.045, "vermelho", 8))
        ps.append(haste((0.32, sy * 0.24, 0.0), (0, sy * 0.24, zc), 0.045, "vermelho", 8))
        ps.append(cil(0.08, 0.06, x=0, y=sy * 0.24, z=zc - 0.03, cor="amarelo", seg=10, eixo="y"))
    ps.append(cx(0.8, 0.6, 0.05, cor="concreto", bisel=0.015))
    for s in (-1, 1):  # pneus amortecedores meio enterrados
        ps.append(mb.torno([(0.14, 0.0), (0.22, 0.02), (0.25, 0.1), (0.22, 0.17), (0.14, 0.18), (0.12, 0.1)], x=s * 1.45,
                           cor="borracha", seg=14))
    it.add(mb.junta(ps, "cavalete"))
    tab = [cx(3.3, 0.26, 0.07, z=zc + 0.02, cor="azul", bisel=0.03),
           cil(0.06, 0.6, z=zc, cor="grafite", seg=10, eixo="y")]
    for s in (-1, 1):
        tab.append(mb.superelipsoide(0.44, 0.36, 0.1, x=s * 1.35, z=zc + 0.08, cor="amarelo", e=0.4, nu=12, nv=4))
        tab.append(mb.tubo([(s * 1.05, -0.13, zc + 0.08), (s * 1.0, -0.13, zc + 0.4), (s * 1.0, 0.13, zc + 0.4),
                            (s * 1.05, 0.13, zc + 0.08)], 0.024, cor="verde", seg=6, raio_curva=0.07))
        tab.append(esf(0.05, x=s * 1.0, y=-0.14, z=zc + 0.4, cor="vermelho", seg=8))
        tab.append(esf(0.05, x=s * 1.0, y=0.14, z=zc + 0.4, cor="vermelho", seg=8))
    it.anima(tab, {"anima": "balancar", "angulo": 14, "periodo": 2.4, "eixo": "z"}, "gangorra", pivo=(0, 0, zc))
    for k, s in enumerate((-1, 1)):
        it.assento(f"assento_{k + 1}", s * 1.35, 0, zc + 0.18, pai="gangorra")
    return {"col": [((0, 0, 0), (3.3, 0.6, zc + 0.2))], "mini": (0.55, -1.0, 0.5)}


# =====================================================================================================================
# Caixa de areia com foguete
# =====================================================================================================================
def p_caixa_areia(it):
    R = 1.85
    hexa = [(R * math.cos(math.radians(30 + 60 * k)), R * math.sin(math.radians(30 + 60 * k))) for k in range(6)]
    ps = []
    for k in range(6):  # vigas de madeira com tampa (dá para sentar)
        p0, p1 = V(hexa[k]), V(hexa[(k + 1) % 6])
        m = (p0 + p1) / 2
        d = (p1 - p0)
        b = cx(d.length + 0.12, 0.24, 0.32, cor="madeira_clara", bisel=0.04)
        gira_z(b, math.degrees(math.atan2(d.y, d.x)))
        mover(b, m.x * 0.97, m.y * 0.97)
        ps.append(b)
        c = cx(0.3, 0.3, 0.36, cor="madeira_mel", bisel=0.05)
        mover(c, p0.x * 0.97, p0.y * 0.97)
        ps.append(c)
    ps.append(mb.extrudado([(q[0] * 0.92, q[1] * 0.92) for q in hexa], 0.2, cor="areia", bisel=0.0, seg=1))
    it.add(mb.junta(ps, "caixa"))
    # foguete no meio, de pé sobre as aletas
    xf, yf, zf = 0.25, 0.2, 0.22
    fog = [mb.torno([(0, 0), (0.3, 0.0), (0.36, 0.25), (0.38, 0.7), (0.36, 1.25), (0.3, 1.55), (0.0, 1.55)], x=xf, y=yf,
                    z=zf + 0.12, cor="branco", seg=20),
           mb.torno([(0.3, 0.0), (0.24, 0.32), (0.13, 0.52), (0.0, 0.62)], x=xf, y=yf, z=zf + 1.67, cor="vermelho", seg=20),
           esf(0.05, x=xf, y=yf, z=zf + 2.3, cor="amarelo", seg=8),
           mb.torno([(0.369, 0.0), (0.385, 0.0), (0.385, 0.14), (0.369, 0.14)], x=xf, y=yf, z=zf + 0.55, cor="azul",
                    seg=20),
           mb.torno([(0.0, 0.0), (0.22, 0.0), (0.3, 0.13), (0.0, 0.13)], x=xf, y=yf, z=zf, cor="grafite", seg=14)]
    for k in range(3):
        aleta = mb.extrudado([(0.25, 0.0), (0.68, -0.12), (0.62, 0.3), (0.28, 0.72)], 0.07, y=-0.035, plano="xz",
                             cor="vermelho", bisel=0.025, seg=2)
        gira_z(aleta, 90 + 120 * k)
        mover(aleta, xf, yf, zf - 0.02)
        fog.append(aleta)
    # escotilha
    fog.append(cil(0.15, 0.06, x=xf, y=yf - 0.355, z=zf + 1.1, cor="ouro", seg=16, eixo="y"))
    it.add(mb.junta(fog, "foguete"))
    it.anima([cil(0.11, 0.04, x=xf, y=yf - 0.39, z=zf + 1.1, cor=None, mat="luz_azul", seg=14, eixo="y")],
             {"anima": "piscar", "periodo": 1.6, "suave": True}, "escotilha", pivo=(xf, yf - 0.39, zf + 1.1))
    it.anima([mb.cilindro(0.17, 0.2, x=xf, y=yf, z=zf - 0.01, r2=0.08, cor=None, mat="luz_vermelha", seg=10, bisel=0.0),
              mb.cilindro(0.09, 0.22, x=xf, y=yf, z=zf - 0.01, r2=0.03, cor=None, mat="luz", seg=8, bisel=0.0)],
             {"anima": "piscar", "periodo": 0.5, "suave": True}, "chama", pivo=(xf, yf, zf))
    # castelinho de areia, balde e pá
    it.add(mb.torno([(0, 0), (0.32, 0), (0.25, 0.16), (0.2, 0.2), (0, 0.22)], x=-0.75, y=0.5, z=0.2, cor="areia",
                    seg=12),
           cil(0.1, 0.22, x=-0.75, y=0.5, z=0.4, cor="areia", seg=8),
           cil(0.07, 0.14, x=-0.55, y=0.35, z=0.36, cor="areia", seg=8),
           mb.cilindro(0.11, 0.2, x=-0.6, y=-0.7, z=0.2, r2=0.14, cor="amarelo", seg=12, bisel=0.01),
           mb.tubo([(-0.73, -0.7, 0.4), (-0.6, -0.7, 0.5), (-0.47, -0.7, 0.4)], 0.01, cor="vermelho", seg=4,
                   raio_curva=0.04),
           cx(0.08, 0.42, 0.02, x=0.6, y=-0.8, z=0.21, cor="azul", bisel=0.005),
           cx(0.16, 0.14, 0.02, x=0.6, y=-0.55, z=0.21, cor="azul", bisel=0.005))
    for k in range(6):
        a = math.radians(60 * k)
        it.assento(f"assento_{k + 1}", round(R * 0.86 * math.cos(a), 3), round(R * 0.86 * math.sin(a), 3), 0.32)
    return {"col": [((0, 0, 0), (2 * R * 0.92, 2 * R * 0.87, 0.36)), ((xf, yf, 0), (1.2, 1.2, 2.5))],
            "mini": (0.55, -1.0, 0.55)}


# =====================================================================================================================
# Trepa-trepa de cubos com painel giratório
# =====================================================================================================================
def p_trepa_trepa(it):
    c = 0.9
    nx, ny, nz = 3, 2, 2
    x0, y0 = -nx * c / 2, -ny * c / 2
    ps = []
    for i in range(nx + 1):
        for j in range(ny + 1):
            x, y = x0 + i * c, y0 + j * c
            ps.append(cil(0.04, nz * c + 0.02, x=x, y=y, cor="vermelho", seg=8))
            ps.append(esf(0.06, x=x, y=y, z=nz * c + 0.04, cor="amarelo", seg=8))
            for k in range(1, nz + 1):
                if i < nx:
                    ps.append(haste((x, y, k * c), (x + c, y, k * c), 0.032, "azul", 8))
                if j < ny:
                    ps.append(haste((x, y, k * c), (x, y + c, k * c), 0.032, "verde", 8))
    # assoalho de madeira no alto do cubo da direita e meia-volta de rede
    ps.append(cx(c - 0.06, ny * c - 0.06, 0.06, x=x0 + 2.5 * c, z=nz * c - 0.03, cor="madeira_mel", bisel=0.02))
    it.add(mb.junta(ps, "grade"))
    # painel giratório (3 cubos coloridos num eixo) na frente do cubo do meio, de baixo
    zb, yb = 0.75, y0
    it.add(haste((x0 + c + 0.05, yb, zb), (x0 + 2 * c - 0.05, yb, zb), 0.02, "metal", 6))
    cores = (("vermelho", "amarelo"), ("azul", "verde"), ("laranja", "roxo"))
    for k in range(3):
        xk = x0 + c + 0.2 + k * 0.25
        cub = cx(0.2, 0.2, 0.2, x=xk, y=yb, z=zb - 0.1, cor=cores[k][0], bisel=0.03)
        mb.pinta_onde(cub, cores[k][1], lambda cc, n: abs(n.z) > 0.7)
        it.anima([cub], {"anima": "girar", "eixo": "x", "velocidade": 40 + 25 * k}, f"cubo_{k + 1}",
                 pivo=(xk, yb, zb))
    it.assento("topo_1", x0 + 2.5 * c, -0.25, nz * c + 0.03)
    it.assento("topo_2", x0 + 2.5 * c, 0.25, nz * c + 0.03)
    return {"col": [((0, 0, 0), (nx * c + 0.1, ny * c + 0.1, nz * c + 0.1))], "mini": (0.55, -1.0, 0.55)}


# =====================================================================================================================
# Gira-gira
# =====================================================================================================================
def p_gira_gira(it):
    R = 1.15
    it.add(cil(0.3, 0.08, cor="concreto", seg=14), cil(0.16, 0.2, z=0.06, cor="grafite", seg=12))
    gg = []
    cores = ("vermelho", "amarelo", "azul", "verde", "laranja", "roxo")
    for k in range(6):  # gomos coloridos do disco
        a0, a1 = math.radians(60 * k), math.radians(60 * (k + 1))
        pts = [(0, 0)] + [(R * math.cos(a0 + (a1 - a0) * t / 4), R * math.sin(a0 + (a1 - a0) * t / 4)) for t in
                          range(5)]
        gg.append(mb.extrudado(pts, 0.1, z=0.24, cor=cores[k], bisel=0.025, seg=1))
    gg.append(mb.torno([(R - 0.02, 0.22), (R + 0.04, 0.24), (R + 0.04, 0.34), (R - 0.02, 0.36)], cor="grafite", seg=36))
    # alças em arco do aro até o poste do meio e volante no alto
    gg.append(cil(0.07, 0.65, z=0.34, cor="metal_claro", seg=10))
    gg.append(mb.torno([(0.24, -0.025), (0.28, 0.0), (0.24, 0.025), (0.2, 0.0)], z=0.95, cor="amarelo", seg=18))
    for k in range(6):
        a = math.radians(60 * k + 30)
        c, s = math.cos(a), math.sin(a)
        gg.append(mb.tubo([((R - 0.08) * c, (R - 0.08) * s, 0.34), ((R - 0.12) * c, (R - 0.12) * s, 0.7),
                           (0.3 * c, 0.3 * s, 0.9), (0.08 * c, 0.08 * s, 0.9)], 0.028, cor=cores[(k + 3) % 6], seg=6,
                          raio_curva=0.18))
    it.anima(gg, {"anima": "girar", "eixo": "y", "velocidade": 45}, "gira_gira", pivo=(0, 0, 0))
    for k in range(6):
        a = math.radians(60 * k)
        it.assento(f"assento_{k + 1}", round(0.72 * math.cos(a), 3), round(0.72 * math.sin(a), 3), 0.34,
                   pai="gira_gira")
    return {"col": [((0, 0, 0), (2 * R + 0.1, 2 * R + 0.1, 1.0))], "mini": (0.55, -1.0, 0.6)}


# =====================================================================================================================
# Casinha de brincar
# =====================================================================================================================
def p_casinha(it):
    L, P, hw, e = 1.7, 1.4, 1.35, 0.06
    zb = 0.12
    ps = [cx(L + 0.3, P + 0.3, zb, cor="madeira_mel", bisel=0.03)]
    for k in range(6):
        ps.append(cx(0.02, P + 0.3, 0.004, x=-L / 2 - 0.15 + (L + 0.3) * (k + 1) / 7, z=zb, cor="madeira", bisel=0.0))
    pw = "amarelo_claro"
    # paredes: fundo, laterais (com janela na direita) e frente com vão de porta à esquerda e janela à direita
    ps.append(cx(L, e, hw, y=P / 2 - e / 2, z=zb, cor=pw, bisel=0.015))
    ps.append(cx(e, P - 2 * e, hw, x=-L / 2 + e / 2, z=zb, cor=pw, bisel=0.015))
    jx0, jx1, jz0, jz1 = -0.3, 0.3, zb + 0.55, zb + 1.05
    ps.append(cx(e, P - 2 * e, jz0 - zb, x=L / 2 - e / 2, z=zb, cor=pw, bisel=0.015))
    ps.append(cx(e, P - 2 * e, zb + hw - jz1, x=L / 2 - e / 2, z=jz1, cor=pw, bisel=0.015))
    for yy in ((-P / 2 + e + (jx0 + P / 2 - e) / 2), (P / 2 - e - (P / 2 - e - jx1) / 2)):
        w = (jx0 + P / 2 - e) if yy < 0 else (P / 2 - e - jx1)
        ps.append(cx(e, w, jz1 - jz0, x=L / 2 - e / 2, y=yy, z=jz0, cor=pw, bisel=0.01))
    dx0, dx1, dh = -0.62, -0.05, 1.05
    yf = -P / 2 + e / 2
    ps.append(cx(dx0 + L / 2, e, hw, x=(-L / 2 + dx0) / 2, y=yf, z=zb, cor=pw, bisel=0.015))
    ps.append(cx(dx1 - dx0, e, hw - dh, x=(dx0 + dx1) / 2, y=yf, z=zb + dh, cor=pw, bisel=0.015))
    wx0, wx1 = 0.2, 0.62
    ps.append(cx(wx0 - dx1, e, hw, x=(dx1 + wx0) / 2, y=yf, z=zb, cor=pw, bisel=0.015))
    ps.append(cx(L / 2 - wx1, e, hw, x=(wx1 + L / 2) / 2, y=yf, z=zb, cor=pw, bisel=0.015))
    ps.append(cx(wx1 - wx0, e, 0.5, x=(wx0 + wx1) / 2, y=yf, z=zb, cor=pw, bisel=0.01))
    ps.append(cx(wx1 - wx0, e, zb + hw - 1.08, x=(wx0 + wx1) / 2, y=yf, z=1.08, cor=pw, bisel=0.01))
    # molduras brancas, floreira e cantoneiras
    for x0_, x1_ in ((wx0, wx1),):
        ps.append(cx(x1_ - x0_ + 0.1, 0.03, 0.05, x=(x0_ + x1_) / 2, y=yf - 0.045, z=0.6, cor="branco", bisel=0.01))
        ps.append(cx(x1_ - x0_ + 0.1, 0.03, 0.05, x=(x0_ + x1_) / 2, y=yf - 0.045, z=1.08, cor="branco", bisel=0.01))
        ps.append(cx(x1_ - x0_ + 0.12, 0.2, 0.14, x=(x0_ + x1_) / 2, y=yf - 0.12, z=0.44, cor="madeira", bisel=0.02))
    ps.append(cx(0.05, 0.03, dh + 0.04, x=dx0 - 0.02, y=yf - 0.045, z=zb, cor="branco", bisel=0.01))
    ps.append(cx(0.05, 0.03, dh + 0.04, x=dx1 + 0.02, y=yf - 0.045, z=zb, cor="branco", bisel=0.01))
    ps.append(cx(dx1 - dx0 + 0.1, 0.03, 0.05, x=(dx0 + dx1) / 2, y=yf - 0.045, z=zb + dh, cor="branco", bisel=0.01))
    for sx in (-1, 1):
        for sy in (-1, 1):
            ps.append(cx(0.08, 0.08, hw, x=sx * (L / 2 - 0.02), y=sy * (P / 2 - 0.02), z=zb, cor="branco", bisel=0.02))
    # telhado de duas águas vermelho com beiral, empena e chaminé
    m = Malha()
    zr, top, ov = zb + hw, zb + hw + 0.8, 0.18
    X, Y = L / 2 + ov, P / 2 + ov
    for sy in (-1, 1):
        q = [(-X, sy * Y, zr - 0.06), (X, sy * Y, zr - 0.06), (X, 0, top), (-X, 0, top)]
        vs = [m.v(p) for p in q]
        m.f(vs if sy < 0 else vs[::-1], "vermelho")
        q2 = [(p[0], p[1], p[2] - 0.07) for p in q]
        vs2 = [m.v(p) for p in q2]
        m.f(vs2[::-1] if sy < 0 else vs2, "vermelho_escuro")
        ext = [m.v(q[0]), m.v(q[1]), m.v(q2[1]), m.v(q2[0])]
        m.f(ext if sy > 0 else ext[::-1], "vermelho_escuro")
    for sx in (-1, 1):
        vs = [m.v((sx * L / 2, -P / 2, zr)), m.v((sx * L / 2, P / 2, zr)), m.v((sx * L / 2, 0, top - 0.06))]
        m.f(vs if sx > 0 else vs[::-1], pw)
    ps.append(m.obj("telhado", normais=True))
    ps.append(cx(0.22, 0.22, 0.55, x=0.45, y=0.32, z=zr + 0.25, cor="tijolo", bisel=0.02))
    ps.append(cx(0.28, 0.28, 0.06, x=0.45, y=0.32, z=zr + 0.8, cor="concreto", bisel=0.015))
    # vidros das janelas
    ps.append(cx(wx1 - wx0, 0.01, 0.48, x=(wx0 + wx1) / 2, y=yf, z=0.6, cor=None, mat="vidro", bisel=0.0))
    ps.append(cx(0.01, jx1 - jx0, jz1 - jz0, x=L / 2 - e / 2, z=jz0, cor=None, mat="vidro", bisel=0.0))
    it.add(mb.junta(ps, "casinha"))
    it.add(flores((wx0 + wx1) / 2 - 0.1, yf - 0.12, ("rosa", "branco"), z=0.58, n=3, alt=0.08),
           flores((wx0 + wx1) / 2 + 0.1, yf - 0.12, ("amarelo", "laranja"), z=0.58, n=3, alt=0.08),
           arbusto(-L / 2 - 0.35, -P / 2 + 0.1, r=0.25, cor="folha", alt=0.4),
           arbusto(L / 2 + 0.32, -P / 2 + 0.2, r=0.22, cor="folha_escura", alt=0.35))
    # porta interativa (dobradiça à esquerda) com janelinha redonda e maçaneta
    w = dx1 - dx0 - 0.02
    porta = [cx(w, 0.04, dh - 0.02, x=dx0 + 0.01 + w / 2, y=yf - 0.005, z=zb + 0.01, cor="azul_celeste", bisel=0.012),
             cil(0.09, 0.05, x=dx0 + 0.01 + w / 2, y=yf - 0.01, z=zb + 0.75, cor="branco", seg=14, eixo="y"),
             cil(0.065, 0.055, x=dx0 + 0.01 + w / 2, y=yf - 0.012, z=zb + 0.75, cor=None, mat="vidro", seg=12, eixo="y"),
             esf(0.03, x=dx0 + w - 0.06, y=yf - 0.05, z=zb + 0.5, cor="ouro", seg=8)]
    it.porta(porta, (dx0 + 0.01, yf - 0.03, zb), eixo="z", lado="esq", abre_graus=100)
    # galo cata-vento no telhado (gira devagar com o vento)
    gx = -0.45
    it.add(haste((gx, 0, top - 0.02), (gx, 0, top + 0.4), 0.012, "grafite", 4))
    galo = [mb.extrudado([(-0.16, 0.0), (0.08, 0.0), (0.16, 0.08), (0.12, 0.2), (0.04, 0.16), (-0.04, 0.06),
                          (-0.16, 0.14), (-0.2, 0.04)], 0.015, y=-0.0075, plano="xz", cor="ouro", bisel=0.004, seg=1),
            haste((gx - 0.2, 0, top + 0.32), (gx + 0.2, 0, top + 0.32), 0.008, "grafite", 4),
            haste((gx, -0.2, top + 0.32), (gx, 0.2, top + 0.32), 0.008, "grafite", 4)]
    mover(galo[0], gx, 0, top + 0.4)
    it.anima(galo, {"anima": "girar", "eixo": "y", "velocidade": 12}, "cata_vento", pivo=(gx, 0, top))
    it.slot("dentro", (0.15, 0.1, zb), (1.2, 1.0, 1.1))
    return {"col": [((0, P / 2 - e / 2, 0), (L, e + 0.04, zb + hw)), ((-L / 2 + e / 2, 0, 0), (e + 0.04, P, zb + hw)),
                    ((L / 2 - e / 2, 0, 0), (e + 0.04, P, zb + hw)),
                    (((dx1 + L / 2) / 2, -P / 2 + e / 2, 0), (L / 2 - dx1, e + 0.04, zb + hw))],
            "mini": (0.55, -1.0, 0.5)}
