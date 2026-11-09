"""Comércio de rua e diversão da categoria props_lazer: carrinhos (balões, cachorro-quente, algodão-doce, pipoca),
quiosque de sorvete, brinquedo de moeda, escorregador inflável, cama elástica, palco coberto, tenda estrela, varais
de lâmpadas, poste de lanternas chinesas, mesa de DJ e caixas de som. Usado por cidade_props_lazer.py."""
import math

import bpy  # noqa: F401
from mathutils import Vector

import moveis_base as mb
from props_lazer_base import (Malha, bola, cil, coracao_pts, cx, esf, estrela_pts, gira_z, girar, haste, lampadas,
                              mover, placa_curva, placa_estampa, roda, toldo, uniformes, varre)

V = Vector
EST = None
CORES_LUZ = ("luz", "luz_vermelha", "luz_azul", "neon_rosa", "neon", "neon_roxo", "luz")


def letreiro(it, nome, w, h, x, y, z, normal=(0, -1, 0), moldura="branco", emissao=0.9):
    if not EST:
        return
    n = V(normal)
    it.add(cx(w + 0.08 if abs(n.y) > 0.5 else 0.05, 0.05 if abs(n.y) > 0.5 else w + 0.08, h + 0.08,
              x=x - n.x * 0.03, y=y - n.y * 0.03, z=z - h / 2 - 0.04, cor=moldura, bisel=0.015))
    it.add(placa_estampa(EST(nome, emissao), w, h, x + n.x * 0.002, y + n.y * 0.002, z, normal=normal))


def corpo_carrinho(it, l, p, cor, cor2, z0=0.32, z1=1.0, listras=0, rodas="x+"):
    """Carrinho de rua: caixa sobre duas rodas grandes (no lado +X), pé de apoio e puxador no lado −X. O balcão é o
    tampo em z1. Devolve a altura do tampo."""
    ps = [cx(l, p, z1 - z0, z=z0, cor=cor, bisel=0.04),
          cx(l + 0.06, p + 0.06, 0.05, z=z1, cor="branco", bisel=0.02),
          cx(l + 0.02, p + 0.02, 0.06, z=z0, cor=cor2, bisel=0.02)]
    if listras:
        w = l / (2 * listras)
        for k in range(listras):
            ps.append(cx(w * 0.98, 0.01, z1 - z0 - 0.16, x=-l / 2 + w * (2 * k + 1.5), y=-p / 2 - 0.004, z=z0 + 0.1,
                         cor=cor2, bisel=0.0))
    xr = l / 2 - 0.28
    for s in (-1, 1):
        ps.append(roda(xr, s * (p / 2 + 0.06), 0.3, 0.3, 0.08, cor="borracha", cubo="amarelo", eixo="y"))
    ps.append(haste((xr, -p / 2 - 0.1, 0.3), (xr, p / 2 + 0.1, 0.3), 0.025, "metal_escuro", 8))
    for s in (-1, 1):
        ps.append(haste((-l / 2 + 0.12, s * (p / 2 - 0.08), z0), (-l / 2 + 0.16, s * (p / 2 - 0.05), 0.0), 0.025,
                        "metal_escuro", 6))
        ps.append(cil(0.04, 0.03, x=-l / 2 + 0.16, y=s * (p / 2 - 0.05), cor="borracha", seg=8))
    ps.append(mb.tubo([(-l / 2, -p / 2 + 0.1, z1 - 0.1), (-l / 2 - 0.42, -p / 2 + 0.1, z1 - 0.02),
                       (-l / 2 - 0.42, p / 2 - 0.1, z1 - 0.02), (-l / 2, p / 2 - 0.1, z1 - 0.1)], 0.025,
                      cor="metal_claro", raio_curva=0.08, seg=8))
    it.add(mb.junta(ps, "carrinho"))
    return z1 + 0.05


# =====================================================================================================================
# Vendedor de balões
# =====================================================================================================================
def _balao(x, y, z, cor, esc=1.0):
    return [esf(0.2 * esc, x=x, y=y, z=z, cor=cor, seg=9, esc=(1, 1, 1.18)),
            cil(0.035 * esc, 0.06, x=x, y=y, z=z - 0.26 * esc, r2=0.012, cor=cor, seg=6)]


def p_baloes(it):
    l, p = 1.15, 0.72
    zt = corpo_carrinho(it, l, p, "lilas", "branco", listras=3)
    xp = -0.1
    it.add(cx(l * 0.6, p * 0.62, 0.14, x=xp, z=zt, cor="roxo", bisel=0.03))
    it.add(cil(0.035, 1.25, x=xp, z=zt + 0.14, cor="metal_claro", seg=8))
    zp = zt + 1.39
    it.add(bola(0.06, xp, 0, zp, mat="luz"))
    letreiro(it, "baloes", 0.62, 0.2, xp, -0.05, zt + 0.72)
    it.add(cx(0.66, 0.06, 0.24, x=xp, y=0.0, z=zt + 0.6, cor="branco", bisel=0.015))
    letreiro(it, "baloes", 0.62, 0.2, xp, 0.05, zt + 0.72, normal=(0, 1, 0))
    cores = ("vermelho", "amarelo", "azul_celeste", "verde", "rosa", "laranja", "roxo", "turquesa", "magenta",
             "verde_lima")
    cachos = [
        [(0.0, 0.0, 1.35), (0.34, 0.1, 1.15), (-0.3, 0.16, 1.2), (0.12, -0.32, 1.12), (-0.18, -0.24, 1.45),
         (0.26, 0.3, 1.5)],
        [(0.05, 0.36, 1.05), (-0.4, -0.1, 1.0), (0.42, -0.2, 1.38), (-0.1, 0.1, 1.72)]]
    for g, cacho in enumerate(cachos):
        objs = []
        for k, (dx, dy, dz) in enumerate(cacho):
            bx, by, bz = xp + dx, dy, zp + dz
            objs += _balao(bx, by, bz, cores[(k + 5 * g) % len(cores)], esc=1.0 + 0.08 * ((k + g) % 3))
            objs.append(mb.tubo([(xp, 0, zp), (xp + dx * 0.4, dy * 0.4, zp + dz * 0.45), (bx, by, bz - 0.3)], 0.006,
                                cor="branco", raio_curva=0, seg=4))
        if g == 0:  # estrela dourada e coração vermelho
            for (dx, dy, dz), forma, cor in (((-0.42, 0.34, 1.52), estrela_pts(0.24, 0.5), "ouro"),
                                             ((0.48, 0.26, 1.82), coracao_pts(0.22), "vermelho")):
                f = mb.extrudado(forma, 0.09, plano="xz", cor=cor, bisel=0.03, seg=2)
                mover(f, xp + dx, dy - 0.045, zp + dz)
                objs.append(f)
                objs.append(mb.tubo([(xp, 0, zp), (xp + dx, dy, zp + dz - 0.24)], 0.006, cor="branco", seg=4))
        it.anima(objs, {"anima": "balancar", "angulo": 7 - g, "periodo": 3.0 + 0.8 * g, "eixo": "x" if g == 0 else "z"},
                 f"baloes_{g + 1}", pivo=(xp, 0, zp))
    it.slot("balcao", (0.36, 0, zt), (0.3, 0.55, 0.4))
    return {"col": [((0, 0, 0), (l + 0.5, p + 0.3, zt + 0.15))], "mini": (0.55, -1.0, 0.35)}


# =====================================================================================================================
# Cachorro-quente, algodão-doce e pipoca
# =====================================================================================================================
def cobertura(it, l, p, z0, h, cor1, cor2, n=8):
    """Toldo de 4 águas listrado sobre 4 hastes."""
    ps = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            ps.append(haste((sx * (l / 2 - 0.05), sy * (p / 2 - 0.05), z0 - 0.02),
                            (sx * (l / 2 - 0.05), sy * (p / 2 - 0.05), z0 + h), 0.022, "metal_claro", 8))
    m = Malha()
    zt = z0 + h
    L, P, top = l / 2 + 0.2, p / 2 + 0.22, z0 + h + 0.42
    cantos = [(-L, -P), (L, -P), (L, P), (-L, P)]
    for k in range(4):
        a, b = cantos[k], cantos[(k + 1) % 4]
        for j in range(n):
            t0, t1 = j / n, (j + 1) / n
            p0 = (a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0, zt)
            p1 = (a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1, zt)
            cor = cor1 if j % 2 == 0 else cor2
            v = [m.v(p0), m.v(p1), m.v((0, 0, top))]
            m.f(v, cor)
            v2 = [m.v((p0[0], p0[1], p0[2] - 0.01)), m.v((p1[0], p1[1], p1[2] - 0.01)), m.v((0, 0, top - 0.01))]
            m.f(v2[::-1], cor)
            bico = [m.v(p0), m.v(p1), m.v(((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, zt - 0.13))]
            m.f(bico, cor)
            m.f(bico[::-1], cor)
    ps.append(m.obj("cobertura", normais=False))
    ps.append(esf(0.07, z=top + 0.02, cor=cor2, seg=8))
    it.add(mb.junta(ps, "cobertura"))
    it.add(cil(0.09, 0.05, z=zt - 0.05, cor="metal", seg=10), bola(0.07, 0, 0, zt - 0.1, mat="luz"))
    return top


def p_cachorro_quente(it):
    l, p = 1.6, 0.82
    zt = corpo_carrinho(it, l, p, "metal_claro", "vermelho")
    it.add(cx(l - 0.1, 0.02, 0.5, y=-p / 2 - 0.01, z=0.42, cor="vermelho", bisel=0.01))
    letreiro(it, "cachorro_quente", 0.86, 0.27, 0.12, -p / 2 - 0.03, 0.7)
    # chapa com salsichas, pães e bisnagas
    it.add(cx(0.6, 0.5, 0.06, x=-0.35, z=zt, cor="grafite", bisel=0.01))
    for k in range(5):
        it.add(haste((-0.6, -0.16 + k * 0.08, zt + 0.08), (-0.38, -0.16 + k * 0.08, zt + 0.08), 0.022,
                     "vermelho_escuro", 6))
    it.add(cx(0.5, 0.36, 0.14, x=0.3, z=zt, cor="metal", bisel=0.015))
    for k in range(3):
        it.add(mb.superelipsoide(0.12, 0.3, 0.08, x=0.18 + k * 0.13, z=zt + 0.13, cor="caramelo", e=0.6, e_v=0.6,
                                 nu=8, nv=4))
    for k, cor in enumerate(("vermelho", "amarelo")):
        it.add(cil(0.04, 0.2, x=0.66, y=-0.1 + k * 0.12, z=zt, cor=cor, seg=8, r2=0.035),
               cil(0.012, 0.05, x=0.66, y=-0.1 + k * 0.12, z=zt + 0.2, cor=cor, seg=6, r2=0.004))
    top = cobertura(it, l, p, zt, 1.2, "vermelho", "amarelo")
    # mascote de cachorro-quente no alto do toldo
    zm = top - 0.06
    ps = [mb.superelipsoide(1.0, 0.36, 0.28, z=zm, cor="caramelo", e=0.55, e_v=0.6, nu=14, nv=6),
          mb.tubo([(-0.58, 0, zm + 0.26), (0.58, 0, zm + 0.26)], 0.1, cor="vermelho_escuro", seg=10),
          mb.tubo([(-0.45 + 0.1 * k, (0.05 if k % 2 else -0.05), zm + 0.37) for k in range(10)], 0.025,
                  cor="amarelo", raio_curva=0.03, seg=6)]
    it.add(mb.junta(ps, "mascote"))
    it.slot("balcao", (0.3, -0.15, zt + 0.14), (0.5, 0.3, 0.4))
    return {"col": [((0, 0, 0), (l + 0.5, p + 0.3, zt))], "mini": (0.55, -1.0, 0.35)}


def guarda_sol(it, r, z, cor1, cor2, n=10, haste_z0=None, nome="guarda_sol"):
    m = Malha()
    for k in range(n):
        a0, a1 = 2 * math.pi * k / n, 2 * math.pi * (k + 1) / n
        cor = cor1 if k % 2 == 0 else cor2
        p0 = (r * math.cos(a0), r * math.sin(a0), z)
        p1 = (r * math.cos(a1), r * math.sin(a1), z)
        am = (a0 + a1) / 2
        pm = (r * 1.0 * math.cos(am), r * math.sin(am), z - 0.12)
        top = (0, 0, z + r * 0.42)
        for tri in ((p0, pm, top), (pm, p1, top)):
            vs = [m.v(q) for q in tri]
            m.f(vs, cor)
            vs2 = [m.v((q[0], q[1], q[2] - 0.01)) for q in tri]
            m.f(vs2[::-1], cor)
    ps = [m.obj(nome), esf(0.06, z=z + r * 0.42 + 0.03, cor=cor2, seg=8)]
    if haste_z0 is not None:
        ps.append(cil(0.025, z + r * 0.42 - haste_z0, z=haste_z0, cor="metal_claro", seg=8))
    it.add(mb.junta(ps, nome))


def p_algodao_doce(it):
    l, p = 1.3, 0.75
    zt = corpo_carrinho(it, l, p, "rosa_claro", "rosa", listras=3)
    letreiro(it, "algodao_doce", 0.62, 0.18, -0.05, -p / 2 - 0.03, 0.62, moldura="rosa")
    # máquina: bacia de vidro e cabeça que gira com a nuvem de algodão
    xm = 0.22
    it.add(cil(0.2, 0.2, x=xm, z=zt, cor="branco", seg=14, bisel=0.02))
    it.add(mb.torno([(0.16, zt + 0.2), (0.3, zt + 0.22), (0.38, zt + 0.42), (0.36, zt + 0.43), (0.28, zt + 0.24),
                     (0.15, zt + 0.22)], x=xm, cor=None, mat="vidro", seg=18))
    nuvem = [cil(0.05, 0.12, x=xm, z=zt + 0.2, cor="metal_claro", seg=8),
             mb.superelipsoide(0.42, 0.42, 0.16, x=xm, z=zt + 0.26, cor="rosa_bebe", e=1.0, e_v=0.8, nu=14, nv=6),
             esf(0.06, x=xm + 0.12, z=zt + 0.36, cor="rosa", seg=8)]
    it.anima(nuvem, {"anima": "girar", "eixo": "y", "velocidade": 240}, "maquina_algodao", pivo=(xm, 0, zt))
    # expositor com algodões prontos
    xs = -0.32
    it.add(cil(0.04, 0.6, x=xs, z=zt, cor="branco", seg=8), cil(0.14, 0.04, x=xs, z=zt, cor="rosa", seg=10))
    for k, (dx, dy, dz, cor) in enumerate(((0.16, 0, 0.62, "rosa_bebe"), (-0.16, 0.02, 0.58, "azul_bebe"),
                                           (0, 0.15, 0.72, "lilas_claro"), (0.02, -0.15, 0.68, "rosa"),
                                           (0, 0, 0.86, "azul_claro"))):
        it.add(haste((xs, 0, zt + 0.45), (xs + dx, dy, zt + dz), 0.008, "creme", 4),
               mb.superelipsoide(0.2, 0.2, 0.24, x=xs + dx * 1.2, y=dy * 1.2, z=zt + dz, cor=cor, e=1.0, e_v=0.9,
                                 nu=10, nv=6))
    guarda_sol(it, 0.95, zt + 1.35, "rosa", "branco", n=10, haste_z0=zt)
    it.add(bola(0.06, 0, 0, zt + 1.25, mat="luz"))
    it.slot("balcao", (-0.32, -0.2, zt), (0.3, 0.2, 0.3))
    return {"col": [((0, 0, 0), (l + 0.5, p + 0.3, zt))], "mini": (0.55, -1.0, 0.35)}


def p_pipoca(it):
    l, p = 1.25, 0.75
    zt = corpo_carrinho(it, l, p, "vermelho", "amarelo", listras=0)
    for k in range(4):  # frisos dourados
        it.add(cx(0.04, 0.01, 0.52, x=-0.45 + k * 0.3, y=-p / 2 - 0.005, z=0.4, cor="amarelo", bisel=0.0))
    # vitrine de vidro com a pipoca, a panela que balança e a lâmpada
    bl, bp, bh = 0.9, 0.6, 0.62
    ps = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            ps.append(cx(0.05, 0.05, bh, x=sx * (bl / 2 - 0.025), y=sy * (bp / 2 - 0.025), z=zt, cor="vermelho_escuro",
                         bisel=0.01))
    ps.append(cx(bl + 0.04, bp + 0.04, 0.05, z=zt + bh, cor="vermelho_escuro", bisel=0.015))
    it.add(mb.junta(ps, "vitrine"))
    for sy in (-1, 1):
        it.add(cx(bl - 0.06, 0.012, bh - 0.02, y=sy * (bp / 2 - 0.02), z=zt + 0.01, cor=None, mat="vidro", bisel=0.0))
    for sx in (-1, 1):
        it.add(cx(0.012, bp - 0.06, bh - 0.02, x=sx * (bl / 2 - 0.02), z=zt + 0.01, cor=None, mat="vidro", bisel=0.0))
    pip = []
    import random
    rnd = random.Random(3)
    for k in range(38):
        x = rnd.uniform(-bl / 2 + 0.1, bl / 2 - 0.1)
        y = rnd.uniform(-bp / 2 + 0.1, bp / 2 - 0.1)
        h = 0.18 * (1 - (abs(x) / (bl / 2)) ** 2) * (1 - (abs(y) / (bp / 2)) ** 2)
        pip.append(bola(0.045, x, y, zt + 0.03 + h * rnd.uniform(0.4, 1.0), cor=("amarelo_claro", "creme_claro",
                                                                                  "branco")[k % 3], sub=0))
    it.add(mb.junta(pip, "pipoca"))
    panela = [haste((0.1, 0, zt + bh - 0.02), (0.1, 0, zt + bh - 0.14), 0.012, "metal_escuro", 4),
              cil(0.14, 0.14, x=0.1, z=zt + bh - 0.3, cor="metal", seg=12, bisel=0.01),
              cil(0.15, 0.03, x=0.1, z=zt + bh - 0.17, cor="metal_claro", seg=12)]
    for k in range(5):
        panela.append(bola(0.04, 0.1 + 0.08 * math.cos(k), 0.08 * math.sin(k), zt + bh - 0.14, cor="amarelo_claro",
                           sub=0))
    it.anima(panela, {"anima": "balancar", "angulo": 18, "periodo": 2.4, "eixo": "z"}, "panela",
             pivo=(0.1, 0, zt + bh - 0.02))
    it.add(bola(0.05, -0.3, 0, zt + bh - 0.06, mat="luz"))
    # telhadinho e letreiro
    zr = zt + bh + 0.05
    m = Malha()
    w, d, h = bl / 2 + 0.12, bp / 2 + 0.12, 0.22
    vs = [m.v(q) for q in ((-w, -d, zr), (w, -d, zr), (w, d, zr), (-w, d, zr), (-w * 0.6, 0, zr + h),
                           (w * 0.6, 0, zr + h))]
    m.f((vs[0], vs[1], vs[5], vs[4]), "vermelho")
    m.f((vs[2], vs[3], vs[4], vs[5]), "vermelho")
    m.f((vs[1], vs[2], vs[5]), "amarelo")
    m.f((vs[3], vs[0], vs[4]), "amarelo")
    m.f((vs[3], vs[2], vs[1], vs[0]), "vermelho_escuro")
    it.add(m.obj("telhado", normais=True))
    it.add(cx(0.66, 0.05, 0.26, z=zr + h + 0.0, cor="amarelo", bisel=0.02))
    letreiro(it, "pipoca", 0.6, 0.19, 0, -0.03, zr + h + 0.13, moldura="amarelo")
    it.add(esf(0.06, x=-w * 0.6, z=zr + h, cor="amarelo", seg=8), esf(0.06, x=w * 0.6, z=zr + h, cor="amarelo", seg=8))
    it.slot("balcao", (0, -0.0, zt), (0.7, 0.4, 0.3))
    return {"col": [((0, 0, 0), (l + 0.5, p + 0.3, zt + bh))], "mini": (0.55, -1.0, 0.35)}


# =====================================================================================================================
# Quiosque redondo de sorvete
# =====================================================================================================================
def p_quiosque_sorvete(it):
    R, zb = 1.35, 1.05
    ps = [mb.torno([(0, 0), (R + 0.08, 0), (R + 0.08, 0.14), (R, 0.16), (R, zb), (R + 0.1, zb), (R + 0.12, zb + 0.06),
                    (0, zb + 0.06)], cor="menta", seg=28, angulo=35),
          mb.torno([(R + 0.005, 0.42), (R + 0.03, 0.44), (R + 0.03, 0.62), (R + 0.005, 0.64)], cor="rosa", seg=28)]
    for k in range(14):  # bolinhas de casquinha pintadas na saia
        a = math.radians(205 + 130 * k / 13)
        ps.append(esf(0.06, x=(R + 0.02) * math.cos(a), y=(R + 0.02) * math.sin(a), z=0.82, cor="branco", seg=8,
                      esc=(1, 1, 1)))
    # parede de trás (meia volta) e colunas da janela
    m = Malha()
    n = 16
    for k in range(n):
        a0 = math.radians(-20 + 220 * k / n)
        a1 = math.radians(-20 + 220 * (k + 1) / n)
        for rr, cor, sg in ((R, "menta", 1), (R - 0.08, "branco", -1)):
            v = [m.v((rr * math.cos(a0), rr * math.sin(a0), zb + 0.06)), m.v((rr * math.cos(a1), rr * math.sin(a1),
                                                                              zb + 0.06)),
                 m.v((rr * math.cos(a1), rr * math.sin(a1), 2.3)), m.v((rr * math.cos(a0), rr * math.sin(a0), 2.3))]
            m.f(v if sg > 0 else v[::-1], cor)
    ps.append(m.obj("parede", liso=True, angulo=40))
    for a in (-20, 200, 235, 270, 305):
        ps.append(cil(0.07, 1.25, x=(R - 0.04) * math.cos(math.radians(a)), y=(R - 0.04) * math.sin(math.radians(a)),
                      z=zb + 0.06, cor="rosa", seg=8))
    ps.append(mb.torno([(0, 2.28), (R + 0.06, 2.28), (R + 0.06, 2.62), (0, 2.62)], cor="branco", seg=28))
    ps.append(cil(R - 0.2, 0.03, z=zb + 0.06, cor="madeira_clara", seg=20))
    it.add(mb.junta(ps, "quiosque"))
    if EST:
        it.add(placa_curva(EST("sorvetes", 0.9), R + 0.075, 215, 325, 2.31, 2.59, n=14))
    # telhado de gomos listrado com beiral em bicos e anel de lâmpadas
    m = Malha()
    Rt, zt, hp = R + 0.5, 2.62, 0.5
    n = 16
    for k in range(n):
        a0, a1 = 2 * math.pi * k / n, 2 * math.pi * (k + 1) / n
        cor = "rosa" if k % 2 == 0 else "branco"
        p0 = (Rt * math.cos(a0), Rt * math.sin(a0), zt)
        p1 = (Rt * math.cos(a1), Rt * math.sin(a1), zt)
        top = (0, 0, zt + hp)
        m.f([m.v(p0), m.v(p1), m.v(top)], cor)
        m.f([m.v((p1[0], p1[1], zt - 0.01)), m.v((p0[0], p0[1], zt - 0.01)), m.v((0, 0, zt + hp - 0.01))], cor)
        am = (a0 + a1) / 2
        b = [m.v(p0), m.v(((Rt + 0.02) * math.cos(am), (Rt + 0.02) * math.sin(am), zt - 0.2)), m.v(p1)]
        m.f(b, cor)
        m.f(b[::-1], cor)
    it.add(m.obj("telhado"))
    bul = [((Rt - 0.05) * math.cos(2 * math.pi * (k + 0.5) / 16), (Rt - 0.05) * math.sin(2 * math.pi * (k + 0.5) / 16),
            zt - 0.08) for k in range(16)]
    a = lampadas(bul[0::2], r=0.06)
    b = lampadas(bul[1::2], r=0.06)
    it.anima(a, {"anima": "piscar", "periodo": 1.2}, "lampadas_a", pivo=(0, 0, zt))
    it.anima(b, {"anima": "piscar", "periodo": 1.2, "fase": 0.6}, "lampadas_b", pivo=(0, 0, zt))
    # casquinha gigante de sorvete de máquina (gira devagar)
    zc = zt + hp - 0.1
    casq = [cil(0.12, 0.22, z=zc, cor="branco", seg=10),
            cil(0.06, 1.0, z=zc + 0.2, r2=0.5, cor="caramelo", seg=16),
            mb.torno([(0.5, zc + 1.2), (0.56, zc + 1.22), (0.54, zc + 1.3), (0.0, zc + 1.3)], cor="caramelo", seg=16)]
    for k in range(6):  # grade do biscoito
        ang = math.radians(30 * k)
        for s in (-1, 1):
            pts = [(0.07 * math.cos(ang + s * t * 1.6), 0.07 * math.sin(ang + s * t * 1.6), zc + 0.22 + t)
                   for t in (0.0, 0.33, 0.66, 0.98)]
            pts = [(q[0] * (1 + 6.2 * (q[2] - zc - 0.22)), q[1] * (1 + 6.2 * (q[2] - zc - 0.22)), q[2]) for q in pts]
            casq.append(mb.tubo(pts, 0.012, cor="madeira_mel", raio_curva=0, seg=4))
    for k, (r, h, cor) in enumerate(((0.55, 0.36, "rosa_claro"), (0.44, 0.32, "branco"), (0.32, 0.28, "rosa_claro"),
                                     (0.2, 0.24, "branco"))):
        z = zc + 1.3 + 0.27 * k
        casq.append(mb.superelipsoide(2 * r, 2 * r, h, z=z, cor=cor, e=1.0, e_v=0.8, nu=16, nv=6))
    casq += [mb.cilindro(0.06, 0.24, z=zc + 2.38, r2=0.0, cor="branco", seg=8, bisel=0.0),
             esf(0.1, x=0.12, z=zc + 2.3, cor="vermelho", seg=10)]
    for k in range(9):
        a = math.radians(40 * k)
        casq.append(cx(0.07, 0.02, 0.02, x=0.4 * math.cos(a), y=0.4 * math.sin(a), z=zc + 1.62,
                       cor=("amarelo", "azul_claro", "verde_claro")[k % 3], bisel=0.005))
    it.anima(casq, {"anima": "girar", "eixo": "y", "velocidade": 14}, "casquinha", pivo=(0, 0, zc))
    # potes de sorvete no balcão
    for k, cor in enumerate(("rosa", "chocolate", "amarelo_claro", "menta", "vermelho_claro")):
        a = math.radians(235 + 17.5 * k)
        x, y = 0.95 * math.cos(a), 0.95 * math.sin(a)
        it.add(cil(0.09, 0.07, x=x, y=y, z=zb + 0.07, cor="metal_claro", seg=10),
               mb.superelipsoide(0.16, 0.16, 0.09, x=x, y=y, z=zb + 0.12, cor=cor, e=0.9, e_v=0.8, nu=8, nv=4))
    it.slot("balcao", (0, -1.05, zb + 0.07), (0.9, 0.3, 0.4))
    return {"col": [((0, 0, 0), (2 * R + 0.2, 2 * R + 0.2, zt))], "mini": (0.55, -1.0, 0.4)}


# =====================================================================================================================
# Brinquedo de moeda
# =====================================================================================================================
def p_brinquedo_moeda(it):
    it.add(mb.superelipsoide(1.5, 1.0, 0.2, cor="azul", e=0.35, e_v=0.3, nu=20, nv=4))
    it.add(mb.superelipsoide(1.4, 0.9, 0.04, z=0.18, cor="amarelo", e=0.35, e_v=0.3, nu=20, nv=2))
    # coluna da ficha com painel e lâmpada
    xc = 0.55
    it.add(cx(0.3, 0.26, 0.85, x=xc, y=0.25, z=0.2, cor="amarelo_escuro", bisel=0.05),
           cx(0.34, 0.3, 0.08, x=xc, y=0.25, z=1.05, cor="vermelho", bisel=0.03),
           cx(0.06, 0.02, 0.1, x=xc, y=0.11, z=0.55, cor="preto", bisel=0.005))
    if EST:
        it.add(placa_estampa(EST("painel_moeda", 0.8), 0.26, 0.2, xc, 0.115, 0.82, nome="painel"))
    it.anima([esf(0.08, x=xc, y=0.25, z=1.16, cor=None, mat="luz_vermelha", seg=10)],
             {"anima": "piscar", "periodo": 0.8}, "lampada_ficha", pivo=(xc, 0.25, 1.16))
    # carrinho redondo que balança para frente e para trás
    zc = 0.24
    car = [mb.superelipsoide(1.05, 0.66, 0.42, x=-0.1, z=zc + 0.12, cor="vermelho", e=0.4, e_v=0.45, nu=20, nv=8),
           mb.superelipsoide(1.1, 0.7, 0.14, x=-0.1, z=zc + 0.06, cor="branco", e=0.4, e_v=0.6, nu=20, nv=4),
           mb.superelipsoide(0.4, 0.42, 0.26, x=-0.32, z=zc + 0.42, cor="azul", e=0.4, e_v=0.6, nu=12, nv=6),
           mb.superelipsoide(0.12, 0.42, 0.38, x=-0.48, z=zc + 0.5, cor="azul", e=0.4, e_v=0.6, nu=10, nv=6),
           cx(0.05, 0.5, 0.22, x=0.12, z=zc + 0.5, cor=None, mat="vidro", bisel=0.02),
           haste((0.05, 0, zc + 0.5), (-0.08, 0, zc + 0.66), 0.018, "grafite", 6),
           cil(0.1, 0.03, x=-0.08, z=zc + 0.66, cor="grafite", seg=12),
           esf(0.05, x=0.34, y=-0.2, z=zc + 0.35, cor=None, mat="luz", seg=8),
           esf(0.05, x=0.34, y=0.2, z=zc + 0.35, cor=None, mat="luz", seg=8),
           haste((-0.5, 0.18, zc + 0.5), (-0.62, 0.18, zc + 1.0), 0.01, "grafite", 4),
           esf(0.05, x=-0.62, y=0.18, z=zc + 1.02, cor="amarelo", seg=8)]
    for sx in (-0.42, 0.22):
        for sy in (-1, 1):
            car.append(cil(0.13, 0.08, x=sx, y=sy * 0.33, z=zc + 0.1, cor="grafite", seg=12, eixo="y", bisel=0.02))
            car.append(cil(0.06, 0.09, x=sx, y=sy * 0.33, z=zc + 0.1, cor="amarelo", seg=10, eixo="y"))
    for k in range(3):
        car.append(esf(0.04, x=-0.15 + 0.15 * k, y=-0.33, z=zc + 0.3, cor="amarelo", seg=8))
    for o in car:
        mover(o, -0.12, 0, 0)
    it.anima(car, {"anima": "balancar", "angulo": 5, "periodo": 1.3, "eixo": "z"}, "carrinho", pivo=(-0.2, 0, zc))
    it.assento("assento_1", -0.46, 0, zc + 0.36, pai="carrinho")
    return {"col": [((0, 0, 0), (1.5, 1.0, 0.2)), ((-0.2, 0, 0.2), (1.1, 0.75, 0.7)), ((xc, 0.25, 0.2), (0.34, 0.3, 1.0))],
            "mini": (0.6, -1.0, 0.6)}


# =====================================================================================================================
# Escorregador inflável
# =====================================================================================================================
def p_inflavel(it):
    L, Wd = 6.4, 3.4
    ps = [mb.superelipsoide(Wd, L, 0.45, cor="roxo", e=0.25, e_v=0.6, nu=24, nv=6),
          mb.superelipsoide(Wd - 0.2, L - 0.2, 0.12, z=0.38, cor="laranja", e=0.25, e_v=0.6, nu=24, nv=3)]
    # torre de trás (+Y), degraus fofos e a rampa descendo para a frente
    yt = 1.9
    ps.append(mb.superelipsoide(Wd, 2.3, 3.0, y=yt + 0.2, z=0.4, cor="amarelo", e=0.25, e_v=0.3, nu=20, nv=8))

    def zr(y):  # perfil da rampa
        t = (y - (-L / 2 + 0.7)) / (yt - 0.9 - (-L / 2 + 0.7))
        t = max(0.0, min(1.0, t))
        return 0.55 + 2.85 * (3 * t * t - 2 * t ** 3)

    ys = [-L / 2 + 0.3 + (yt - 0.9 - (-L / 2 + 0.3)) * k / 24 for k in range(25)]
    cam = [(0, y, zr(y)) for y in ys]
    perfil = [(-0.8, 0.0), (0.8, 0.0), (0.8, -0.35), (-0.8, -0.35)]
    rampa = varre([(p[0], p[1], p[2]) for p in cam], perfil, ["branco", "roxo", "roxo", "roxo"], nome="rampa")
    ps.append(rampa)
    # faixa roxa no meio da rampa
    ps.append(varre([(0, p[1], p[2] + 0.012) for p in cam], [(-0.18, 0.0), (0.18, 0.0), (0.18, -0.02), (-0.18, -0.02)],
                    "lilas", nome="faixa"))
    for s in (-1, 1):  # muretas de tubo inflado dos dois lados da rampa
        ps.append(mb.tubo([(s * 1.05, p[1], p[2] + 0.12) for p in cam[::2]], 0.3, cor="laranja", seg=12,
                          raio_curva=0.6))
        for k in range(3):  # listras roxas
            y = -L / 2 + 0.9 + k * 1.0
            ps.append(mb.superelipsoide(0.66, 0.2, 0.66, x=s * 1.05, y=y, z=zr(y) - 0.2, cor="roxo", e=1.0, e_v=1.0,
                                        nu=12, nv=6))
    # arcos em cima da torre
    for k, (y, cor) in enumerate(((yt - 0.55, "laranja"), (yt + 0.6, "amarelo_escuro"))):
        pts = [(1.35 * math.cos(math.radians(a)), y, 3.3 + 1.4 * math.sin(math.radians(a))) for a in range(0, 181, 15)]
        ps.append(mb.tubo(pts, 0.28, cor=cor, seg=12, raio_curva=0.0))
    # degraus fofos atrás
    for k in range(4):
        ps.append(mb.superelipsoide(1.4, 0.5, 0.42, y=L / 2 - 0.25 - 0.0, z=0.4 + 0.0, cor="laranja", e=0.3, e_v=0.5,
                                    nu=12, nv=4) if k == 0 else
                  mb.superelipsoide(1.4, 0.45, 0.4, y=L / 2 - 0.25 - 0.32 * k, z=0.4 + 0.66 * k, cor=("laranja", "roxo")
                                    [k % 2], e=0.3, e_v=0.5, nu=12, nv=4))
    it.add(mb.junta(ps, "inflavel"))
    # soprador e bolas no alto dos arcos (balançam com o vento)
    it.add(cx(0.5, 0.4, 0.4, x=Wd / 2 + 0.45, y=L / 2 - 0.6, cor="grafite", bisel=0.06),
           haste((Wd / 2 + 0.3, L / 2 - 0.6, 0.25), (Wd / 2 - 0.1, L / 2 - 0.6, 0.35), 0.1, "azul", 10))
    for k, (y, cor) in enumerate(((yt - 0.55, "roxo"), (yt + 0.6, "laranja"))):
        it.anima([haste((0, y, 4.9), (0, y, 5.25), 0.05, "amarelo", 8),
                  mb.superelipsoide(0.6, 0.6, 0.6, y=y, z=5.2, cor=cor, e=1.0, e_v=1.0, nu=14, nv=8)],
                 {"anima": "balancar", "angulo": 8, "periodo": 2.0 + 0.5 * k, "eixo": "x" if k else "z"},
                 f"bola_{k + 1}", pivo=(0, y, 4.75))
    it.assento("assento_topo", 0, yt - 1.0, 3.42)
    return {"col": [((0, 0, 0), (Wd, L, 0.45)), ((0, yt + 0.2, 0), (Wd, 2.3, 3.4)),
                    ((0, -0.5, 0), (2.6, 4.2, 1.6))], "mini": (0.6, -1.0, 0.55)}


# =====================================================================================================================
# Cama elástica com rede
# =====================================================================================================================
def p_cama_elastica(it):
    R, zm = 1.8, 0.78
    ps = [mb.torno([(R - 0.06, zm - 0.06), (R + 0.06, zm - 0.06), (R + 0.06, zm + 0.02), (R - 0.06, zm + 0.02)],
                   cor="metal", seg=36)]
    # pés em W (6) e almofada de proteção em gomos azul/amarelo
    for k in range(6):
        a0, a1 = math.radians(60 * k - 14), math.radians(60 * k + 14)
        pts = [((R - 0.02) * math.cos(a0), (R - 0.02) * math.sin(a0), zm - 0.06),
               ((R + 0.05) * math.cos(a0), (R + 0.05) * math.sin(a0), 0.04),
               ((R + 0.05) * math.cos(a1), (R + 0.05) * math.sin(a1), 0.04),
               ((R - 0.02) * math.cos(a1), (R - 0.02) * math.sin(a1), zm - 0.06)]
        ps.append(mb.tubo(pts, 0.035, cor="metal", raio_curva=0.1, seg=6))
    n = 12
    for k in range(n):
        a0, a1 = 360 * k / n + 1, 360 * (k + 1) / n - 1
        cam = [((R - 0.18) * math.cos(math.radians(a)), (R - 0.18) * math.sin(math.radians(a)), zm)
               for a in (a0, (a0 + a1) / 2, a1)]
        ps.append(varre(cam, [(-0.2, 0.0), (0.2, 0.0), (0.2, 0.08), (-0.2, 0.08)],
                        "azul" if k % 2 == 0 else "amarelo", nome="almofada", tampas=True))
    # postes curvos com espuma, aro de cima e a rede (vidro com cordas), aberta na frente
    abre = (255, 285)
    for k in range(6):
        a = math.radians(60 * k + 30)
        c, s = math.cos(a), math.sin(a)
        ps.append(mb.tubo([((R + 0.06) * c, (R + 0.06) * s, zm - 0.04), ((R + 0.12) * c, (R + 0.12) * s, zm + 0.6),
                           ((R + 0.02) * c, (R + 0.02) * s, 2.6)], 0.04, cor="metal_claro", raio_curva=0.4, seg=6))
        ps.append(cil(0.07, 1.4, x=(R + 0.09) * c, y=(R + 0.09) * s, z=zm + 0.3, cor="azul", seg=8))
    aro = [((R + 0.02) * math.cos(math.radians(a)), (R + 0.02) * math.sin(math.radians(a)), 2.6)
           for a in range(abre[1], abre[0] + 361, 15)]
    ps.append(mb.tubo(aro, 0.035, cor="azul", seg=6, raio_curva=0.0))
    m = Malha()
    angs = [a for a in range(abre[1], abre[0] + 361, 10)]
    for a0, a1 in zip(angs, angs[1:]):
        p = [((R + 0.03) * math.cos(math.radians(a)), (R + 0.03) * math.sin(math.radians(a))) for a in (a0, a1)]
        v = [m.v((p[0][0], p[0][1], zm + 0.08)), m.v((p[1][0], p[1][1], zm + 0.08)), m.v((p[1][0], p[1][1], 2.58)),
             m.v((p[0][0], p[0][1], 2.58))]
        m.f(v, "m:vidro")
        m.f([m.v(q.co) for q in v][::-1], "m:vidro")
    it.add(m.obj("rede"))
    for a in range(abre[1], abre[0] + 361, 20):
        c, s = math.cos(math.radians(a)), math.sin(math.radians(a))
        ps.append(haste(((R + 0.03) * c, (R + 0.03) * s, zm + 0.08), ((R + 0.03) * c, (R + 0.03) * s, 2.58), 0.008,
                        "grafite", 4))
    for z in (1.3, 1.95):
        ps.append(mb.tubo([((R + 0.035) * math.cos(math.radians(a)), (R + 0.035) * math.sin(math.radians(a)), z)
                           for a in range(abre[1], abre[0] + 361, 20)], 0.008, cor="grafite", seg=4, raio_curva=0))
    it.add(mb.junta(ps, "estrutura"))
    lona = [cil(R - 0.36, 0.03, z=zm - 0.02, cor="grafite_escuro", seg=32),
            mb.torno([(R - 0.37, zm + 0.008), (R - 0.3, zm + 0.008), (R - 0.3, zm + 0.012), (R - 0.37, zm + 0.012)],
                     cor="azul", seg=32)]
    it.anima(lona, {"anima": "deslizar", "eixo": [0, -1, 0], "curso": 0.09, "periodo": 0.9}, "lona", pivo=(0, 0, zm))
    it.assento("pulo_1", -0.5, 0, zm + 0.01, pai="lona")
    it.assento("pulo_2", 0.5, 0, zm + 0.01, pai="lona")
    return {"col": [((0, 0, 0), (2 * R + 0.3, 2 * R + 0.3, zm + 0.08))], "mini": (0.55, -1.0, 0.55)}


# =====================================================================================================================
# Palco coberto pequeno (tenda azul)
# =====================================================================================================================
def p_palco(it):
    Lx, Ly, hz = 5.4, 3.6, 0.8
    ps = [cx(Lx, Ly, hz - 0.08, cor="azul_escuro", bisel=0.03),
          cx(Lx + 0.1, Ly + 0.1, 0.1, z=hz - 0.1, cor="madeira", bisel=0.02)]
    for k in range(9):
        ps.append(cx(0.02, Ly, 0.004, x=-Lx / 2 + Lx * (k + 1) / 10, z=hz, cor="madeira_media", bisel=0.0))
    # escada lateral na frente direita
    for k in range(3):
        ps.append(cx(1.0, 0.36, hz * (k + 1) / 4, x=Lx / 2 - 0.7, y=-Ly / 2 - 0.36 * (3 - k) + 0.18 - 0.18,
                     cor="madeira_mel", bisel=0.02))
    # postes da tenda e telhado de 4 águas com cumeeira
    zt = hz + 2.7
    for sx in (-1, 1):
        for sy in (-1, 1):
            ps.append(cil(0.07, zt - hz + 0.05, x=sx * (Lx / 2 - 0.12), y=sy * (Ly / 2 - 0.12), z=hz, cor="cinza_claro",
                          seg=10))
    it.add(mb.junta(ps, "palco"))
    m = Malha()
    X, Y, ry, top = Lx / 2 + 0.3, Ly / 2 + 0.3, 1.0, zt + 1.3
    A, B, C, D = (-X, -Y, zt), (X, -Y, zt), (X, Y, zt), (-X, Y, zt)
    E, F = (-X + 1.2, 0, top), (X - 1.2, 0, top)
    for face, cor in (((A, B, F, E), "azul"), ((C, D, E, F), "azul"), ((B, C, F), "azul_medio"),
                      ((D, A, E), "azul_medio")):
        vs = [m.v(q) for q in face]
        m.f(vs, cor)
        m.f([m.v((q[0], q[1], q[2] - 0.02)) for q in face][::-1], "azul_escuro")
    it.add(m.obj("telhado"))
    del ry
    it.add(varre([(x, 0, top + 0.03) for x in (-X + 1.2, X - 1.2)], [(-0.07, 0), (0.07, 0), (0.07, 0.06),
                                                                     (-0.07, 0.06)], "branco", nome="cumeeira"))
    # sanefa de bicos em volta e cortina do fundo
    it.add(toldo(-X, X, -Y, -Y + 0.001, zt, zt, 12, "azul_celeste", "branco", nome="sanefa"))
    it.add(mb.superelipsoide(Lx - 0.2, 0.12, zt - hz - 0.1, y=Ly / 2 - 0.1, z=hz, cor="azul_marinho", e=0.12, e_v=0.12,
                             nu=16, nv=4))
    for k in range(9):  # pregas da cortina
        it.add(cil(0.07, zt - hz - 0.12, x=-Lx / 2 + 0.35 + k * (Lx - 0.7) / 8, y=Ly / 2 - 0.17, z=hz,
                   cor="azul_noite", seg=6))
    if EST:
        it.add(cx(3.2, 0.06, 0.56, y=-Y + 0.05, z=zt - 0.68, cor="amarelo", bisel=0.02))
        it.add(placa_estampa(EST("faixa_palco", 0.8), 3.1, 0.5, 0, -Y + 0.018, zt - 0.4, nome="faixa"))
    # caixas de som e microfone
    for s in (-1, 1):
        it.add(cx(0.55, 0.45, 0.85, x=s * (Lx / 2 - 0.55), y=Ly / 2 - 0.6, z=hz, cor="grafite_escuro", bisel=0.04),
               cil(0.17, 0.02, x=s * (Lx / 2 - 0.55), y=Ly / 2 - 0.83, z=hz + 0.52, cor="grafite", seg=14, eixo="y"),
               cil(0.1, 0.02, x=s * (Lx / 2 - 0.55), y=Ly / 2 - 0.83, z=hz + 0.2, cor="grafite", seg=12, eixo="y"))
    it.add(haste((0, -0.6, hz), (0, -0.6, hz + 1.45), 0.02, "grafite", 6), cil(0.15, 0.03, y=-0.6, z=hz, cor="grafite",
                                                                            seg=10),
           esf(0.05, y=-0.62, z=hz + 1.5, cor="cinza", seg=8))
    # varal de lâmpadas na beirada (piscam alternadas) e dois refletores
    pts = []
    for k in range(17):
        t = k / 16
        pts.append((-X + 2 * X * t, -Y - 0.02, zt - 0.2 - 0.12 * math.sin(math.pi * (t * 4 % 1))))
    it.add(mb.tubo(pts, 0.01, cor="grafite", seg=4, raio_curva=0.1))
    a = lampadas([(p[0], p[1], p[2] - 0.06) for p in pts[0::2]], r=0.06, mat="luz")
    b = lampadas([(p[0], p[1], p[2] - 0.06) for p in pts[1::2]], r=0.06, mat="luz_vermelha")
    it.anima(a, {"anima": "piscar", "periodo": 1.0}, "lampadas_a", pivo=(0, -Y, zt))
    it.anima(b, {"anima": "piscar", "periodo": 1.0, "fase": 0.5}, "lampadas_b", pivo=(0, -Y, zt))
    for s in (-1, 1):
        x = s * (Lx / 2 - 0.12)
        it.add(cx(0.26, 0.3, 0.22, x=x - s * 0.15, y=-Ly / 2 + 0.25, z=zt - 0.45, cor="grafite_escuro", bisel=0.04),
               cil(0.1, 0.02, x=x - s * 0.15, y=-Ly / 2 + 0.09, z=zt - 0.34, cor=None, mat="luz", seg=12, eixo="y"))
    it.slot("palco", (0, 0.2, hz), (3.8, 2.4, 2.4))
    return {"col": [((0, 0, 0), (Lx, Ly, hz)), ((0, Ly / 2 - 0.1, hz), (Lx, 0.2, zt - hz)),
                    ((Lx / 2 - 0.7, -Ly / 2 - 0.55, 0), (1.0, 1.1, hz * 0.5))], "mini": (0.55, -1.0, 0.45)}


# =====================================================================================================================
# Tenda estrela branca (lona tensionada)
# =====================================================================================================================
def p_tenda_estrela(it):
    n, R, hm, hp = 8, 5.2, 5.4, 2.3
    m = Malha()
    nu, nv = 6, n * 6

    def ponto(u, v):
        th = 2 * math.pi * v / nv
        fase = (v % 6) / 6.0
        re = R * (1 - 0.3 * math.sin(math.pi * fase) ** 1.2)
        zb = hp + 0.55 * math.sin(math.pi * fase)
        r = 0.08 + (re - 0.08) * u
        z = hm - (hm - zb) * (u ** 0.72)
        return (r * math.cos(th), r * math.sin(th), z)

    grid = [[m.v(ponto(u / nu, v)) for v in range(nv)] for u in range(nu + 1)]
    grid2 = [[m.v(tuple(c - (0.025 if i == 2 else 0) for i, c in enumerate(ponto(u / nu, v)))) for v in range(nv)]
             for u in range(nu + 1)]
    for u in range(nu):
        for v in range(nv):
            q = [grid[u][v], grid[u + 1][v], grid[u + 1][(v + 1) % nv], grid[u][(v + 1) % nv]]
            m.f(q[::-1], "branco")
            q2 = [grid2[u][v], grid2[u + 1][v], grid2[u + 1][(v + 1) % nv], grid2[u][(v + 1) % nv]]
            m.f(q2, "branco_gelo")
    it.add(m.obj("lona", liso=True, angulo=50))
    ps = [cil(0.09, hm + 0.35, cor="cinza_claro", seg=10), cil(0.25, 0.12, cor="concreto", seg=12),
          esf(0.12, z=hm + 0.4, cor="cinza_claro", seg=8)]
    for k in range(n):
        th = 2 * math.pi * k / n
        c, s = math.cos(th), math.sin(th)
        ps.append(cil(0.05, hp + 0.05, x=R * c, y=R * s, cor="cinza", seg=8))
        ps.append(haste((R * c, R * s, hp), ((R + 1.1) * c, (R + 1.1) * s, 0.02), 0.012, "cinza_medio", 4))
        ps.append(cx(0.12, 0.12, 0.08, x=(R + 1.1) * c, y=(R + 1.1) * s, cor="grafite", bisel=0.02))
        # costuras da lona (do mastro até as pontas)
        pts = [ponto(u / 6, 6 * k) for u in range(7)]
        ps.append(mb.tubo([(p[0], p[1], p[2] + 0.015) for p in pts], 0.018, cor="cinza_claro", seg=4, raio_curva=0))
    it.add(mb.junta(ps, "mastros"))
    it.add(bola(0.18, 0, 0, hm - 0.5, mat="luz", sub=1), cil(0.2, 0.08, z=hm - 0.38, cor="cinza", seg=10))
    for k in range(n):
        q = ponto(0.42, 6 * k + 3)
        it.add(haste((q[0], q[1], q[2] - 0.03), (q[0], q[1], q[2] - 0.25), 0.008, "grafite", 4),
               bola(0.09, q[0], q[1], q[2] - 0.32, mat="luz"))
    return {"col": [((0, 0, 0), (0.3, 0.3, hm))], "mini": (0.55, -1.0, 0.5)}


# =====================================================================================================================
# Varais de lampadinhas e lanternas
# =====================================================================================================================
def _varal(it, x0, x1, z, queda, passo=0.5, nome="lampadas"):
    L = x1 - x0
    n = max(4, int(round(L / passo)))
    cord = [(x0 + L * k / (n * 2), 0, z - queda * 4 * (k / (2 * n)) * (1 - k / (2 * n))) for k in range(2 * n + 1)]
    it.add(mb.tubo(cord, 0.009, cor="grafite", seg=4, raio_curva=0.2))
    pts = []
    for k in range(1, n):
        t = k / n
        pts.append((x0 + L * t, 0, z - queda * 4 * t * (1 - t)))
    grupos = ([], [])
    for k, p in enumerate(pts):
        mat = CORES_LUZ[k % 6]
        g = grupos[k % 2]
        g += [cil(0.03, 0.06, x=p[0], z=p[2] - 0.06, cor="grafite", seg=6),
              bola(0.1, p[0], 0, p[2] - 0.15, mat=mat, sub=1)]
    it.anima(grupos[0], {"anima": "piscar", "periodo": 1.4}, nome + "_a", pivo=(0, 0, z))
    it.anima(grupos[1], {"anima": "piscar", "periodo": 1.4, "fase": 0.7}, nome + "_b", pivo=(0, 0, z))


def p_varal(it):
    L, h = 6.0, 3.4
    ps = []
    for s in (-1, 1):
        x = s * L / 2
        ps += [cil(0.08, h + 0.1, x=x, cor="madeira", seg=8, r2=0.065), cx(0.4, 0.4, 0.12, x=x, cor="concreto",
                                                                            bisel=0.03),
               cil(0.1, 0.06, x=x, z=h + 0.1, cor="madeira_escura", seg=8),
               haste((x, 0, h - 0.1), (x - s * 0.15, 0, h - 0.1), 0.015, "grafite", 4)]
    it.add(mb.junta(ps, "postes"))
    _varal(it, -L / 2 + 0.15, L / 2 - 0.15, h - 0.1, 0.55)
    return {"col": [((-L / 2, 0, 0), (0.4, 0.4, h)), ((L / 2, 0, 0), (0.4, 0.4, h))], "mini": (0.35, -1.0, 0.35)}


def p_varal_modular(L):
    def f(it):
        h = 3.6
        for s in (-1, 1):  # cintas de amarrar no tronco (palmeira, árvore ou poste com até 0,5 m de diâmetro)
            x = s * L / 2
            it.add(mb.torno([(0.27, -0.03), (0.3, -0.03), (0.3, 0.03), (0.27, 0.03)], x=x, z=h, cor="madeira_escura",
                            seg=14))
            it.add(haste((x - s * 0.3, 0, h), (x - s * 0.42, 0, h - 0.03), 0.012, "grafite", 4))
        _varal(it, -L / 2 + 0.42, L / 2 - 0.42, h - 0.03, 0.05 * L + 0.2, passo=0.5)
        it.colisao([])
        return {"col": None, "mini": (0.0, -1.0, 0.12), "extra": {"vao": L, "altura_amarrar": h,
                                                                   "encaixe": "entre_troncos"}}
    return f


def _lanterna(cx_, cy_, ztop, r=0.28, h=0.4, cor_luz="luz_vermelha"):
    ps = [haste((cx_, cy_, ztop), (cx_, cy_, ztop - 0.18), 0.01, "preto", 4),
          cil(r * 0.45, 0.06, x=cx_, y=cy_, z=ztop - 0.24, cor="ouro", seg=10),
          mb.superelipsoide(2 * r, 2 * r, h, x=cx_, y=cy_, z=ztop - 0.2 - h, cor=None, mat=cor_luz, e=0.9, e_v=0.7,
                            nu=14, nv=8),
          cil(r * 0.45, 0.06, x=cx_, y=cy_, z=ztop - 0.24 - h, cor="ouro", seg=10)]
    for k in range(8):  # gomos dourados
        a = math.radians(45 * k)
        pts = [(cx_ + r * 1.0 * math.sin(math.pi * t) * math.cos(a) * 1.02, cy_ + r * math.sin(math.pi * t) *
                math.sin(a) * 1.02, ztop - 0.2 - h * t) for t in (0.08, 0.3, 0.5, 0.7, 0.92)]
        ps.append(mb.tubo(pts, 0.008, cor="ouro_escuro", seg=4, raio_curva=0))
    ps.append(haste((cx_, cy_, ztop - 0.26 - h), (cx_, cy_, ztop - 0.6 - h), 0.03, "vermelho_escuro", 6, r2=0.05))
    return ps


def p_lanternas(it):
    h = 4.3
    ps = [mb.torno([(0, 0), (0.28, 0), (0.28, 0.15), (0.18, 0.25), (0.12, 0.7), (0.15, 0.78), (0, 0.78)],
                   cor="preto", seg=10),
          cil(0.075, h - 0.7, z=0.7, cor="vermelho_escuro", seg=10, r2=0.06),
          cil(0.12, 0.1, z=h - 0.05, cor="ouro", seg=10), mb.torno([(0, h + 0.05), (0.1, h + 0.05), (0.06, h + 0.25),
                                                                    (0, h + 0.42)], cor="ouro", seg=10),
          cil(0.11, 0.08, z=1.2, cor="ouro", seg=10)]
    braco = 0.95
    for s in (-1, 1):  # braços curvos com a ponta enrolada
        pts = [(0, 0, h - 0.4), (s * 0.4, 0, h - 0.3), (s * 0.8, 0, h - 0.1), (s * braco, 0, h - 0.15),
               (s * (braco + 0.1), 0, h - 0.3), (s * (braco - 0.02), 0, h - 0.36)]
        ps.append(mb.tubo(pts, 0.035, cor="preto", raio_curva=0.12, seg=8))
        ps.append(esf(0.05, x=s * braco, z=h - 0.06, cor="ouro", seg=8))
    it.add(mb.junta(ps, "poste"))
    for k, s in enumerate((-1, 1)):
        x = s * (braco - 0.12)
        it.anima(_lanterna(x, 0, h - 0.2), {"anima": "balancar", "angulo": 7, "periodo": 2.8 + 0.5 * k,
                                            "eixo": "z" if k else "x"}, f"lanterna_{k + 1}", pivo=(x, 0, h - 0.2))
    # lanterna menor pendurada no meio, mais abaixo
    it.add(haste((0, -0.1, h - 0.6), (0, -0.35, h - 0.62), 0.025, "preto", 6))
    it.anima(_lanterna(0, -0.36, h - 0.62, r=0.2, h=0.3), {"anima": "balancar", "angulo": 8, "periodo": 2.4,
                                                          "eixo": "x"}, "lanterna_3", pivo=(0, -0.36, h - 0.62))
    return {"col": [((0, 0, 0), (0.56, 0.56, h))], "mini": (0.5, -1.0, 0.35)}


# =====================================================================================================================
# Mesa de DJ e caixas de som
# =====================================================================================================================
def p_mesa_dj(it):
    l, p, h = 1.9, 0.8, 0.95
    ps = [cx(l, p, h - 0.06, cor="grafite_escuro", bisel=0.04),
          cx(l + 0.06, p + 0.06, 0.06, z=h - 0.06, cor="preto", bisel=0.02),
          cx(l - 0.1, 0.03, 0.06, y=-p / 2 - 0.005, z=0.06, cor="grafite", bisel=0.01)]
    it.add(mb.junta(ps, "mesa"))
    # frente com faixas de neon (as de cima piscam no ritmo) e grade de LEDs
    it.add(cx(l - 0.12, 0.03, 0.05, y=-p / 2 - 0.01, z=h - 0.2, cor=None, mat="neon_rosa", bisel=0.01))
    it.add(cx(l - 0.12, 0.03, 0.05, y=-p / 2 - 0.01, z=0.18, cor=None, mat="neon", bisel=0.01))
    leds_a, leds_b = [], []
    for i in range(9):
        for j in range(3):
            o = cx(0.1, 0.02, 0.08, x=-0.72 + i * 0.18, y=-p / 2 - 0.01, z=0.36 + j * 0.13, cor=None,
                   mat=("neon_roxo", "luz_azul", "neon_rosa")[(i + j) % 3], bisel=0.01)
            (leds_a if (i + j) % 2 == 0 else leds_b).append(o)
    it.anima(leds_a, {"anima": "piscar", "periodo": 0.5}, "leds_a", pivo=(0, -p / 2, 0.5))
    it.anima(leds_b, {"anima": "piscar", "periodo": 0.5, "fase": 0.25}, "leds_b", pivo=(0, -p / 2, 0.5))
    # toca-discos (discos girando) e mixer no meio
    for k, s in enumerate((-1, 1)):
        x = s * 0.58
        it.add(cx(0.62, 0.5, 0.08, x=x, z=h, cor="grafite", bisel=0.02),
               cil(0.21, 0.02, x=x - s * 0.02, y=-0.02, z=h + 0.08, cor="metal", seg=20))
        disco = [cil(0.2, 0.012, x=x - s * 0.02, y=-0.02, z=h + 0.1, cor="preto", seg=24),
                 cil(0.07, 0.014, x=x - s * 0.02, y=-0.02, z=h + 0.1, cor=("vermelho", "amarelo")[k], seg=12),
                 cx(0.18, 0.02, 0.003, x=x - s * 0.02 + 0.09, y=-0.02, z=h + 0.112, cor="grafite", bisel=0.0)]
        it.anima(disco, {"anima": "girar", "eixo": "y", "velocidade": -200}, f"disco_{k + 1}",
                 pivo=(x - s * 0.02, -0.02, h + 0.1))
        it.add(haste((x + s * 0.22, 0.17, h + 0.12), (x + s * 0.02, -0.06, h + 0.12), 0.008, "metal_claro", 4),
               cil(0.03, 0.04, x=x + s * 0.22, y=0.17, z=h + 0.08, cor="metal_claro", seg=8),
               cx(0.04, 0.12, 0.02, x=x + s * 0.24, y=-0.16, z=h + 0.08, cor="metal_claro", bisel=0.005))
    it.add(cx(0.42, 0.52, 0.1, z=h, cor="grafite_escuro", bisel=0.02))
    bot_a, bot_b = [], []
    for i in range(3):
        for j in range(4):
            it.add(cil(0.018, 0.03, x=-0.12 + i * 0.12, y=0.14 - j * 0.07, z=h + 0.1, cor="cinza_claro", seg=8))
    for i in range(2):
        it.add(cx(0.03, 0.14, 0.012, x=-0.08 + i * 0.16, y=-0.14, z=h + 0.1, cor="grafite", bisel=0.0),
               cx(0.05, 0.03, 0.03, x=-0.08 + i * 0.16, y=-0.12, z=h + 0.1, cor="branco", bisel=0.005))
    for k in range(6):
        o = cx(0.05, 0.05, 0.02, x=-0.15 + k * 0.06, y=-0.22, z=h + 0.1, cor=None,
               mat=("neon_rosa", "neon", "neon_roxo")[k % 3], bisel=0.005)
        (bot_a if k % 2 else bot_b).append(o)
    it.anima(bot_a, {"anima": "piscar", "periodo": 0.7}, "botoes_a", pivo=(0, -0.22, h + 0.1))
    it.anima(bot_b, {"anima": "piscar", "periodo": 0.7, "fase": 0.35}, "botoes_b", pivo=(0, -0.22, h + 0.1))
    # fones e notebook
    it.add(mb.tubo([(0.75, 0.3, h + 0.04), (0.75, 0.3, h + 0.16), (0.9, 0.3, h + 0.16), (0.9, 0.3, h + 0.04)], 0.012,
                   cor="preto", raio_curva=0.06, seg=6),
           cil(0.05, 0.03, x=0.75, y=0.3, z=h + 0.02, cor="preto", seg=10),
           cil(0.05, 0.03, x=0.9, y=0.3, z=h + 0.02, cor="preto", seg=10))
    it.slot("mesa", (-0.85, 0.25, h), (0.2, 0.25, 0.3))
    return {"col": [((0, 0, 0), (l, p, h + 0.12))], "mini": (0.5, -1.0, 0.6)}


def _caixa_som(it, l, p, h, z, falantes, neon, nome, aneis):
    ps = [cx(l, p, h, z=z, cor="grafite_escuro", bisel=0.04),
          cx(l - 0.06, 0.02, h - 0.06, y=-p / 2 - 0.004, z=z + 0.03, cor="preto", bisel=0.005)]
    for fx, fz, r in falantes:
        ps += [cil(r, 0.04, x=fx, y=-p / 2 - 0.01, z=z + fz, cor="grafite", seg=20, eixo="y"),
               mb.torno([(0, -0.0), (r * 0.82, -0.0), (r * 0.6, 0.06), (r * 0.25, 0.08), (0, 0.06)], cor="cinza_azulado",
                        seg=18),
               cil(r * 0.22, 0.05, x=fx, y=-p / 2 - 0.04, z=z + fz, cor="preto", seg=12, eixo="y")]
        girar(ps[-2], "X", 90)
        mover(ps[-2], fx, -p / 2 - 0.02, z + fz)
        aneis.append(mb.torno([(r * 0.86, -0.012), (r * 0.98, -0.012), (r * 0.98, 0.012), (r * 0.86, 0.012)],
                              cor=None, mat=neon, seg=24))
        girar(aneis[-1], "X", 90)
        mover(aneis[-1], fx, -p / 2 - 0.035, z + fz)
    it.add(mb.junta(ps, nome))


def p_caixas_som(grande):
    def f(it):
        aneis = []
        if grande:
            l, p = 0.85, 0.75
            _caixa_som(it, l, p, 0.95, 0.0, [(0, 0.47, 0.34)], "neon", "subwoofer", aneis)
            _caixa_som(it, l * 0.9, p * 0.85, 1.05, 0.97, [(0, 0.3, 0.22), (0, 0.72, 0.15)], "neon_rosa", "caixa",
                       aneis)
            it.add(cx(0.3, 0.12, 0.03, y=-p / 2 + 0.05, z=1.96, cor="grafite", bisel=0.01))
            topo = 2.02
        else:
            l, p = 0.55, 0.5
            _caixa_som(it, l, p, 0.7, 0.0, [(0, 0.24, 0.17), (0, 0.53, 0.1)], "neon", "caixa_1", aneis)
            _caixa_som(it, l, p, 0.7, 0.72, [(0, 0.24, 0.17), (0, 0.53, 0.1)], "neon_rosa", "caixa_2", aneis)
            topo = 1.42
        for s in (-1, 1):  # alças
            it.add(cx(0.03, 0.2, 0.06, x=s * (l / 2 + 0.01), z=topo * 0.3, cor="preto", bisel=0.01))
        it.anima(aneis, {"anima": "piscar", "periodo": 0.5}, "aneis_neon", pivo=(0, -p / 2, topo / 2))
        return {"col": [((0, 0, 0), (l, p, topo))], "mini": (0.5, -1.0, 0.4)}
    return f
