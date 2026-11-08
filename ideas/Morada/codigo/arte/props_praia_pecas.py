"""Props pequenas de praia (categoria props_praia): guarda-sóis, espreguiçadeiras, cadeira dobrável, toalhas,
pranchas, bodyboard, boias, castelinho, piscina inflável, chuveirinho, rede de vôlei, cesta, caixa térmica, deque,
bandeiras de aviso, lixeira, placas e biruta. Frente para −Y, chão (areia) em z = 0."""
import math
import random

import bpy
import bmesh
from mathutils import Matrix

import moveis_base as mb
import props_praia_base as bb
from props_praia_base import V, Malha, bloco, haste, bola, estampa, mover, roda, gira_z, toro, setores

CHAO = 0.0


def monte_areia(r=0.2, a=0.06, x=0.0, y=0.0):
    return bb.se(2 * r, 2 * r, a, x=x, y=y, z=0.0, cor="areia", e=0.9, e_v=0.8, nu=12, nv=5,
                             nome="monte")


# =====================================================================================================================
# Guarda-sóis
# =====================================================================================================================
def guarda_sol(it, cores, n=8, R=1.05, alt=0.4, franja=0.0, cores_franja=None, inclina=8.0, gira=False,
               haste_cor="branco", haste2="metal_claro", h_copa=1.95):
    """Guarda-sol de praia fincado na areia. gira: a copa gira devagar ao vento (filho animado, eixo vertical)."""
    monte = monte_areia(0.2, 0.07)
    ps = []
    ps.append(mb.cilindro(0.022, 1.1, z=0.0, cor=haste_cor, seg=10, bisel=0.004))
    ps.append(mb.cilindro(0.032, 0.09, z=1.02, cor="cinza_medio", seg=10, bisel=0.01))  # luva de ajuste
    ps.append(mb.cilindro(0.016, h_copa + alt - 1.05, z=1.05, cor=haste2, seg=8, bisel=0.003))
    copa = bb.copa_gomos(R, alt, n, cores, z0=h_copa, franja=franja, cores_franja=cores_franja)
    copa_extra = [mb.cilindro(0.04, 0.12, z=h_copa + alt - 0.16, cor="branco", seg=10, bisel=0.01)]
    if gira:
        it.add(ps, monte)
        it.anima([copa] + copa_extra, {"anima": "girar", "eixo": "y", "velocidade": 14}, "copa_gira",
                 pivo=(0, 0, h_copa))
        return
    tudo = mb.junta(ps + [copa] + copa_extra, "guarda_sol")
    roda(tudo, "X", -inclina)  # a copa pende para a frente (−Y)
    it.add(tudo, monte)


def p_gs_azul(it):
    guarda_sol(it, ["azul", "branco"], n=8, franja=0.13, cores_franja=["branco", "azul"])
    return dict(col=[((0, 0, 0), (0.12, 0.12, 2.3))])


def p_gs_roxo(it):
    guarda_sol(it, ["roxo", "branco"], n=8, R=1.0, alt=0.36, inclina=-6)
    return dict(col=[((0, 0, 0), (0.12, 0.12, 2.3))])


def p_gs_laranja(it):
    guarda_sol(it, ["laranja", "branco", "amarelo", "branco"], n=12, R=1.1, alt=0.42, franja=0.11,
               cores_franja=["laranja", "amarelo"], haste_cor="madeira_clara", haste2="madeira_clara", inclina=10)
    return dict(col=[((0, 0, 0), (0.12, 0.12, 2.3))])


def p_gs_arco_iris(it):
    guarda_sol(it, ["vermelho", "laranja", "amarelo", "verde_claro", "azul_celeste", "roxo", "rosa", "turquesa"], n=8,
               R=1.08, alt=0.42, franja=0.1, cores_franja=["branco"], gira=True)
    return dict(col=[((0, 0, 0), (0.12, 0.12, 2.3))])


def p_gs_estrela(it):
    """Guarda-sol branco em estrela: 6 velas triangulares de lona esticadas entre a ponta do mastro e 6 pontas,
    com as bordas curvas para dentro (como as tendas tensionadas)."""
    pontas, R, z_tip, z_top = 6, 1.55, 2.0, 2.75
    sub, nr = 6, 6
    P = []
    for i in range(pontas * sub + 1):
        u = (i % sub) / sub
        th = 2 * math.pi * i / (pontas * sub)
        w = math.sin(math.pi * u)
        re = R * (1 - 0.38 * w ** 0.9)
        ze = z_tip + 0.22 * w ** 0.8
        linha = []
        for j in range(nr + 1):
            s = j / nr
            rr = 0.05 + (re - 0.05) * s
            zz = ze + (z_top - ze) * (1 - s) ** 1.35
            linha.append((rr * math.cos(th), rr * math.sin(th), zz))
        P.append(linha)
    lona = bb.folha_dupla(P, lambda i, j: "branco", lambda i, j: "branco_gelo", esp=0.016, nome="lona")
    ps = [lona, monte_areia(0.22, 0.07)]
    ps.append(mb.cilindro(0.035, z_top + 0.07, z=0.0, cor="madeira", seg=10, bisel=0.006))
    ps.append(bola(0.06, 0, 0, z_top + 0.1, cor="madeira_clara"))
    for k in range(pontas):  # costuras nas pontas, varetas e ponteiras
        th = 2 * math.pi * k / pontas
        pts = [P[k * sub][j] for j in range(nr + 1)]
        ps.append(mb.tubo([(p[0], p[1], p[2] + 0.012) for p in pts], 0.011, cor="cinza_claro", seg=4,
                          raio_curva=0.1))
        tip = V(P[k * sub][nr])
        ps.append(haste((0, 0, z_top - 0.55), (tip.x * 0.92, tip.y * 0.92, tip.z - 0.03), 0.012, "metal_claro", 5))
        ps.append(bola(0.03, tip.x, tip.y, tip.z, cor="madeira_clara", sub=1))
    it.add(mb.junta(ps, "guarda_sol_estrela"))
    return dict(col=[((0, 0, 0), (0.14, 0.14, 2.8))])


# =====================================================================================================================
# Espreguiçadeiras e cadeira
# =====================================================================================================================
def p_espreguicadeira_madeira(it):
    """Espreguiçadeira de madeira de ripas, encosto inclinado e rodinhas na cabeceira."""
    L, W = 1.95, 0.7
    ps = []
    cor, cor2 = "madeira_mel", "madeira"
    zt = 0.36
    for sx in (-1, 1):  # longarinas
        ps.append(bloco(0.05, L, 0.11, x=sx * (W / 2 - 0.025), y=0, z=zt - 0.13, cor=cor2, bisel=0.012))
        for yy in (-L / 2 + 0.12, L / 2 - 0.28):
            ps.append(bloco(0.07, 0.07, zt - 0.13, x=sx * (W / 2 - 0.035), y=yy, z=0, cor=cor2, bisel=0.012))
        ps.append(mb.cilindro(0.085, 0.045, x=sx * (W / 2 + 0.02), y=L / 2 - 0.1, z=0.085, eixo="x", cor="grafite",
                              seg=14, bisel=0.01))
    ps.append(bloco(W - 0.1, 0.05, 0.06, y=-L / 2 + 0.12, z=0.12, cor=cor2, bisel=0.01))
    y_dob = 0.2
    n = 11
    for k in range(n):  # ripas do assento
        y = -L / 2 + 0.06 + k * (y_dob + L / 2 - 0.08) / n
        ps.append(bloco(W - 0.04, 0.085, 0.025, y=y + 0.04, z=zt - 0.02, cor=cor, bisel=0.008))
    # encosto: ripas num quadro inclinado 42° (dobradiça em y_dob)
    enc = []
    Le = 0.78
    for sx in (-1, 1):
        enc.append(bloco(0.04, Le, 0.05, x=sx * (W / 2 - 0.08), y=Le / 2, z=-0.05, cor=cor2, bisel=0.01))
    for k in range(7):
        enc.append(bloco(W - 0.2, 0.085, 0.025, y=0.06 + k * 0.11, z=0.0, cor=cor, bisel=0.008))
    e = mb.junta(enc, "encosto")
    roda(e, "X", 42)
    mover(e, 0, y_dob, zt - 0.005)
    ps.append(e)
    ps.append(haste((-(W / 2 - 0.1), y_dob + 0.45, zt - 0.05), (-(W / 2 - 0.1), y_dob + 0.62, zt - 0.1), 0.015, cor2))
    ps.append(haste(((W / 2 - 0.1), y_dob + 0.45, zt - 0.05), ((W / 2 - 0.1), y_dob + 0.62, zt - 0.1), 0.015, cor2))
    # almofadinha de cabeça presa no encosto
    alm = mb.almofada(0.42, 0.16, 0.07, cor="turquesa_claro")
    roda(alm, "X", 42)
    mover(alm, 0, y_dob + 0.5, zt + 0.47)
    ps.append(alm)
    it.add(mb.junta(ps, "espreguicadeira"))
    it.assento("assento_1", 0.0, -0.25, zt + 0.01)
    return dict(col=[((0, 0, 0), (W, L, zt + 0.05)), ((0, y_dob + 0.3, zt), (W, 0.6, 0.5))])


def p_espreguicadeira_lona(it):
    """Espreguiçadeira de tubo de alumínio com lona listrada verde e branca."""
    W = 0.62
    cam = [(0, -0.95, 0.24), (0, -0.6, 0.27), (0, -0.2, 0.28), (0, 0.15, 0.28), (0, 0.4, 0.38), (0, 0.62, 0.7),
           (0, 0.74, 0.95)]
    pts = [tuple(p) for p in mb._arredonda_cantos(cam, 0.12, n=4)]
    ps = []
    for sx in (-1, 1):
        ps.append(mb.tubo([(sx * W / 2, p[1], p[2] - 0.02) for p in pts], 0.018, cor="metal_claro", seg=8))
        ps.append(mb.tubo([(sx * W / 2, -0.88, 0.22), (sx * W / 2, -0.8, 0.0)], 0.016, cor="metal_claro", seg=6))
        ps.append(mb.tubo([(sx * W / 2, 0.12, 0.27), (sx * W / 2, 0.2, 0.0)], 0.016, cor="metal_claro", seg=6))
        ps.append(mb.tubo([(sx * W / 2, 0.66, 0.75), (sx * W / 2, 0.9, 0.0)], 0.016, cor="metal_claro", seg=6))
        for yy in (-0.8, 0.2, 0.9):
            ps.append(mb.cilindro(0.03, 0.03, x=sx * W / 2, y=yy, z=0, cor="cinza_medio", seg=8, bisel=0.008))
    for yy, zz in ((-0.95, 0.22), (0.74, 0.93)):
        ps.append(mb.cilindro(0.016, W, x=0, y=yy, z=zz, eixo="x", cor="metal_claro", seg=8, bisel=0))
    ps.append(mb.cilindro(0.014, W, x=0, y=-0.8, z=0.04, eixo="x", cor="metal_claro", seg=6, bisel=0))
    ps.append(mb.cilindro(0.014, W, x=0, y=0.9, z=0.04, eixo="x", cor="metal_claro", seg=6, bisel=0))
    lona = bb.lona_listrada([(0, p[1], p[2]) for p in pts], W - 0.03, ["verde", "branco"], 7, esp=0.012,
                            eixo_listra="v", nv=14)
    ps.append(lona)
    ps.append(mb.almofada(0.42, 0.2, 0.09, x=0, y=0.6, z=0.66, cor="branco", rot=("X", 55)))
    it.add(mb.junta(ps, "espreguicadeira"))
    it.assento("assento_1", 0.0, -0.3, 0.3)
    return dict(col=[((0, -0.05, 0), (W + 0.04, 1.9, 0.32)), ((0, 0.62, 0.3), (W + 0.04, 0.35, 0.65))])


def p_espreguicadeira_reclinavel(it):
    """Espreguiçadeira reclinável de plástico branco com colchonete turquesa listrado e rodinhas."""
    W = 0.68
    ps = []
    zt = 0.32
    # quadro de plástico (assento + encosto) com ripas e pés
    ps.append(bb.cx(W, 1.2, 0.06, y=-0.32, z=zt - 0.06, cor="plastico_branco", bisel=0.025))
    for sx in (-1, 1):
        ps.append(bb.cx(0.08, 0.1, zt - 0.06, x=sx * (W / 2 - 0.06), y=-0.86, z=0, cor="plastico_branco",
                           bisel=0.025))
        ps.append(bb.cx(0.08, 0.1, zt - 0.06, x=sx * (W / 2 - 0.06), y=0.16, z=0, cor="plastico_branco",
                           bisel=0.025))
        ps.append(mb.cilindro(0.075, 0.04, x=sx * (W / 2 + 0.0), y=0.28, z=0.075, eixo="x", cor="cinza", seg=14,
                              bisel=0.01))
        ps.append(bb.cx(0.05, 0.42, 0.04, x=sx * (W / 2 + 0.01), y=-0.1, z=zt + 0.12, cor="plastico_branco",
                           bisel=0.015))  # braço
        ps.append(bb.cx(0.04, 0.04, 0.12, x=sx * (W / 2 + 0.01), y=-0.25, z=zt, cor="plastico_branco",
                           bisel=0.012))
    ps.append(bb.cx(W - 0.12, 0.05, 0.06, y=0.2, z=0.1, cor="plastico_branco", bisel=0.015))
    enc = [bb.cx(W, 0.78, 0.05, y=0.39, z=-0.05, cor="plastico_branco", bisel=0.022)]
    for k in range(5):
        enc.append(bb.cx(W - 0.14, 0.03, 0.012, y=0.12 + k * 0.13, z=-0.006, cor="cinza_claro", bisel=0.004))
    enc.append(mb.almofada(W - 0.08, 0.72, 0.07, y=0.38, z=-0.002, cor="turquesa"))
    e = mb.junta(enc, "encosto")
    roda(e, "X", 38)
    mover(e, 0, 0.27, zt)
    ps.append(e)
    col = mb.almofada(W - 0.08, 1.12, 0.08, y=-0.31, z=zt, cor="turquesa")
    mb.pinta_onde(col, "branco", lambda c, n: abs(n.z) < 0.35)  # vivo branco em volta do colchonete
    ps.append(col)
    it.add(mb.junta(ps, "espreguicadeira"))
    it.assento("assento_1", 0.0, -0.3, zt + 0.08)
    return dict(col=[((0, -0.3, 0), (W + 0.04, 1.3, zt + 0.08)), ((0, 0.6, zt), (W, 0.65, 0.5))])


def p_cadeira_dobravel(it):
    """Cadeira de praia dobrável baixa: quadro de alumínio em X, lona listrada e braços de madeira."""
    W = 0.56
    ps = []
    for sx in (-1, 1):
        x = sx * W / 2
        ps.append(haste((x, -0.32, 0.0), (x, 0.18, 0.42), 0.014, "metal_claro", 8))
        ps.append(haste((x, 0.12, 0.0), (x, -0.22, 0.26), 0.014, "metal_claro", 8))
        ps.append(haste((x, -0.26, 0.24), (x, 0.06, 0.18), 0.012, "metal_claro", 8))
        ps.append(haste((x, 0.06, 0.18), (x, 0.3, 0.78), 0.014, "metal_claro", 8))
        ps.append(bb.cx(0.06, 0.4, 0.025, x=x, y=-0.08, z=0.42, cor="madeira_mel", bisel=0.01))
        ps.append(haste((x, -0.24, 0.27), (x, -0.24, 0.42), 0.012, "metal_claro", 6))
        for yy in (-0.32, 0.12):
            ps.append(mb.cilindro(0.025, 0.02, x=x, y=yy, z=0, cor="cinza_medio", seg=8, bisel=0.006))
    ps.append(mb.cilindro(0.014, W, x=0, y=-0.26, z=0.24, eixo="x", cor="metal_claro", seg=8, bisel=0))
    ps.append(mb.cilindro(0.014, W, x=0, y=0.3, z=0.78, eixo="x", cor="metal_claro", seg=8, bisel=0))
    cam = [(0, -0.26, 0.245), (0, -0.12, 0.2), (0, 0.04, 0.2), (0, 0.12, 0.3), (0, 0.22, 0.56), (0, 0.3, 0.775)]
    pts = [tuple(p) for p in mb._arredonda_cantos(cam, 0.1, n=4)]
    ps.append(bb.lona_listrada(pts, W - 0.03, ["azul", "branco", "amarelo", "branco"], 8, esp=0.01, eixo_listra="v",
                               nv=16))
    it.add(mb.junta(ps, "cadeira"))
    it.assento("assento_1", 0.0, -0.05, 0.2)
    return dict(col=[((0, -0.05, 0), (W + 0.05, 0.7, 0.45)), ((0, 0.24, 0.45), (W, 0.14, 0.35))])


# =====================================================================================================================
# Toalhas
# =====================================================================================================================
def toalha(mat, L=1.75, W=0.9, x=0.0, y=0.0, rot=0.0, seed=1, nome="toalha"):
    """Toalha estendida na areia (ao longo de Y), com dobras leves e a estampa no UV inteiro."""
    rnd = random.Random(seed)
    nu, nv = 14, 7
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    fases = [rnd.uniform(0, 6.28) for _ in range(3)]
    vs = []
    for i in range(nu + 1):
        u = i / nu
        linha = []
        for j in range(nv + 1):
            v = j / nv
            xx = (v - 0.5) * W
            yy = (u - 0.5) * L
            z = 0.006 + 0.008 * (0.5 + 0.5 * math.sin(6 * u + fases[0]) * math.sin(4 * v + fases[1]))
            if i in (0, nu) or j in (0, nv):
                z = 0.004
            linha.append(bm.verts.new((xx, yy, z)))
        vs.append(linha)
    for i in range(nu):
        for j in range(nv):
            f = bm.faces.new((vs[i][j], vs[i][j + 1], vs[i + 1][j + 1], vs[i + 1][j]))
            for lo, (a, b) in zip(f.loops, ((i, j), (i, j + 1), (i + 1, j + 1), (i + 1, j))):
                lo[uvl].uv = (a / nu, b / nv)  # u (largura da imagem) ao longo do comprimento
            f.material_index = mat
    for f in bm.faces:
        f.normal_update()
        if f.normal.z < 0:
            f.normal_flip()
    me = bpy.data.meshes.new(nome)
    bm.to_mesh(me)
    bm.free()
    for nm in mb.MAT_NOMES:
        me.materials.append(bpy.data.materials[nm])
    me.shade_smooth()
    ob = bpy.data.objects.new(nome, me)
    bpy.context.scene.collection.objects.link(ob)
    mover(ob, x, y, 0, rot)
    return ob


def oculos(x, y, rot=0.0, cor="preto"):
    ps = [mb.cilindro(0.028, 0.008, x=sx * 0.035, y=0, z=0.012, cor="grafite_escuro", seg=12, bisel=0.002)
          for sx in (-1, 1)]
    ps.append(bloco(0.03, 0.008, 0.006, x=0, y=0, z=0.02, cor=cor))
    for sx in (-1, 1):
        ps.append(bloco(0.006, 0.11, 0.006, x=sx * 0.062, y=0.055, z=0.016, cor=cor))
    ob = mb.junta(ps, "oculos")
    mover(ob, x, y, 0, rot)
    return ob


def chinelo(x, y, rot=0.0, cor="amarelo", tira="azul"):
    pts = [(0.045 * math.cos(t) * (1 + 0.15 * math.sin(t)), 0.12 * math.sin(t)) for t in
           [2 * math.pi * k / 16 for k in range(16)]]
    sola = mb.extrudado(bb.ccw(pts), 0.022, cor=cor, bisel=0.008, seg=1)
    t1 = mb.tubo([(-0.04, -0.02, 0.022), (0.0, 0.06, 0.04), (0.04, -0.02, 0.022)], 0.008, cor=tira, seg=4)
    ob = mb.junta([sola, t1], "chinelo")
    mover(ob, x, y, 0, rot)
    return ob


def frasco(x, y, cor="laranja", tampa="branco", deitado=True):
    ps = [bb.cx(0.07, 0.04, 0.16, cor=cor, bisel=0.016), mb.cilindro(0.018, 0.03, z=0.16, cor=tampa, seg=8)]
    ob = mb.junta(ps, "frasco")
    if deitado:
        roda(ob, "X", 90)
        mover(ob, 0, 0, 0.02)
    mover(ob, x, y, 0)
    return ob


def livro(x, y, rot=0.0, cor="vermelho"):
    ps = [bloco(0.15, 0.21, 0.03, cor="papel", bisel=0.003), bloco(0.16, 0.22, 0.006, z=0.03, cor=cor, bisel=0.002),
          bloco(0.16, 0.22, 0.006, z=-0.002, cor=cor, bisel=0.002), bloco(0.008, 0.22, 0.036, x=-0.078, cor=cor)]
    ob = mb.junta(ps, "livro")
    mover(ob, x, y, 0.01, rot)
    return ob


def chapeu_palha(x, y, r=0.22):
    ob = mb.torno([(0, 0.13), (0.1, 0.13), (0.11, 0.06), (0.12, 0.02), (r, 0.0), (r, 0.012), (0.13, 0.03),
                   (0.12, 0.07), (0.11, 0.14), (0, 0.145)], cor="amarelo_claro", seg=20)
    fita = mb.cilindro(0.118, 0.03, z=0.025, cor="vermelho", seg=20, bisel=0.002)
    ob = mb.junta([ob, fita], "chapeu")
    mover(ob, x, y, 0.004)
    return ob


def p_toalha_listras(it):
    it.add(toalha(estampa("toalha_listras"), seed=1))
    it.add(oculos(0.12, 0.55, rot=20), chinelo(0.62, -0.7, rot=-10), chinelo(0.72, -0.62, rot=-25, cor="amarelo"))
    it.slot("toalha", (0, 0, 0.01), (0.85, 1.7, 0.4))
    return dict(col=[], plano=True)


def p_toalha_melancia(it):
    it.add(toalha(estampa("toalha_melancia"), seed=2))
    it.add(livro(-0.15, 0.4, rot=15, cor="azul"), frasco(0.22, 0.62, cor="laranja"))
    it.slot("toalha", (0, 0, 0.01), (0.85, 1.7, 0.4))
    return dict(col=[], plano=True)


def p_toalha_ondas(it):
    it.add(toalha(estampa("toalha_ondas"), seed=3))
    it.add(chapeu_palha(0.0, 0.62), frasco(-0.3, -0.5, cor="azul_celeste", tampa="amarelo"))
    it.slot("toalha", (0, 0, 0.01), (0.85, 1.7, 0.4))
    return dict(col=[], plano=True)


# =====================================================================================================================
# Pranchas e bodyboard
# =====================================================================================================================
PRANCHAS = {  # nome: (L, W, T, cor, cor2, fundo, faixa, longboard)
    "amarela": (2.0, 0.52, 0.065, "amarelo", "branco", "amarelo", (0.6, 0.66, "vermelho"), False),
    "turquesa": (1.85, 0.5, 0.06, "turquesa_claro", "branco", "turquesa", (0.22, 0.27, "amarelo"), False),
    "rosa": (2.75, 0.58, 0.075, "rosa_bebe", "madeira_clara", "rosa", (0.7, 0.75, "branco"), True),
    "laranja": (1.9, 0.5, 0.06, "laranja", "branco", "laranja_claro", (0.45, 0.5, "azul_escuro"), False),
    "azul": (2.1, 0.53, 0.065, "azul_celeste", "branco", "azul", (0.62, 0.7, "branco"), False),
    "verde": (2.6, 0.57, 0.072, "verde_lima", "madeira_clara", "verde", (0.15, 0.2, "branco"), True),
}


def prancha_de(nome, leve=False, **k):
    L, W, T, c, c2, f, fx, lb = PRANCHAS[nome]
    if leve:
        k.setdefault("nt", 16)
        k.setdefault("ns", 6)
    return bb.prancha(L, W, T, cor=c, cor2=c2, cor_fundo=f, faixa=fx, longboard=lb, **k)


def p_suporte_pranchas(it):
    """Suporte de madeira com quatro pranchas em pé (rabeta encaixada na base, encostadas na barra de cima)."""
    ps = []
    Wd = 2.4
    for sx in (-1, 1):  # cavaletes em A
        x = sx * Wd / 2
        ps.append(haste((x, -0.45, 0.04), (x, 0.05, 1.55), 0.045, "madeira", 6))
        ps.append(haste((x, 0.55, 0.04), (x, 0.05, 1.55), 0.045, "madeira", 6))
        ps.append(bloco(0.1, 1.2, 0.06, x=x, y=0.05, z=0.0, cor="madeira_escura", bisel=0.015))
    ps.append(bloco(Wd + 0.1, 0.2, 0.16, y=-0.18, z=0.08, cor="madeira_media", bisel=0.02))  # base com encaixes
    ps.append(mb.cilindro(0.045, Wd + 0.16, x=0, y=0.05, z=1.5, eixo="x", cor="madeira", seg=10, bisel=0.01))
    ps.append(mb.cilindro(0.05, Wd - 0.1, x=0, y=0.05, z=1.505, eixo="x", cor="azul_marinho", seg=10, bisel=0.01))
    for k, nome in enumerate(["amarela", "rosa", "turquesa", "laranja"]):
        x = -0.85 + k * 0.57
        p = prancha_de(nome, leve=True)
        L = PRANCHAS[nome][0]
        # em pé: bico para cima, deque para a frente (−Y), encostada para trás
        mover(p, 0, L / 2, 0)  # rabeta na origem
        roda(p, "X", 90)
        roda(p, "X", -16)
        mover(p, x, -0.2, 0.09)
        ps.append(p)
    it.add(mb.junta(ps, "suporte"))
    return dict(col=[((0, 0.05, 0), (Wd + 0.2, 1.1, 1.6)), ((0, -0.15, 1.6), (Wd, 0.85, 1.15))])


def p_prancha_deitada(nome):
    def f(it):
        p = prancha_de(nome, rocker=0.05)
        roda(p, "Y", 180)  # quilhas para cima, como se guarda na areia
        lo, hi = mb.bbox(p)
        mover(p, 0, 0, -lo.z)
        gira_z(p, 12)
        it.add(p)
        return dict(col=[((0, 0, 0), (0.6, PRANCHAS[nome][0], 0.14))])
    return f


def p_bodyboard(it):
    """Bodyboard azul com fundo amarelo, bico arredondado e a cordinha (leash) enrolada."""
    L, W = 1.05, 0.55
    b = bb.se(W, L, 0.06, cor="azul", e=0.35, e_v=0.45, nu=28, nv=8, nome="bodyboard")
    mb.pinta_onde(b, "amarelo", lambda c, n: n.z < -0.2)
    mb.pinta_onde(b, "branco", lambda c, n: n.z > 0.2 and abs(c.y - 0.28) < 0.04)
    mb.pinta_onde(b, "azul_marinho", lambda c, n: n.z > 0.2 and c.y < -0.4)
    ps = [b]
    espiral = []
    for k in range(26):
        a = 2 * math.pi * k / 9
        r = 0.09 + 0.002 * k
        espiral.append((0.38 + r * math.cos(a), 0.62 + r * math.sin(a), 0.012))
    ps.append(mb.tubo([(0.0, 0.5, 0.055), (0.15, 0.6, 0.03), (0.3, 0.64, 0.012)] + espiral, 0.008, cor="preto",
                      seg=4, raio_curva=0))
    ps.append(bb.se(0.07, 0.14, 0.03, x=0.38 + 0.17, y=0.62, z=0.0, cor="preto", e=0.5))
    ob = mb.junta(ps, "bodyboard")
    gira_z(ob, -15)
    it.add(ob)
    return dict(col=[((0, 0, 0), (0.7, 1.1, 0.07))])


# =====================================================================================================================
# Boias, castelinho, piscina
# =====================================================================================================================
def p_boia_pato(it):
    R, r = 0.36, 0.16
    ps = [toro(R, r, cor="amarelo", seg=28, seg_r=12, esc_z=0.9)]
    zc = r * 0.9
    # pescoço e cabeça na frente (−Y)
    ps.append(bb.se(0.2, 0.2, 0.34, x=0, y=-R - 0.02, z=zc, cor="amarelo", e=0.9, e_v=0.8, nome="pescoco"))
    ps.append(bola(0.17, 0, -R - 0.06, zc + 0.42, cor="amarelo", sub=2))
    bico = bb.se(0.16, 0.16, 0.06, x=0, y=-R - 0.24, z=zc + 0.36, cor="laranja", e=0.7, e_v=0.8)
    ps.append(bico)
    for sx in (-1, 1):
        ps.append(bola(0.035, sx * 0.075, -R - 0.2, zc + 0.48, cor="preto", sub=1))
        ps.append(bola(0.012, sx * 0.08, -R - 0.226, zc + 0.495, cor="branco", sub=1))
        ps.append(bb.se(0.04, 0.1, 0.012, x=sx * 0.12, y=-R - 0.12, z=zc + 0.56, cor="amarelo_escuro",
                                    e=0.6))
    # rabinho e asinhas
    rab = mb.cilindro(0.09, 0.2, x=0, y=R + 0.02, z=zc + 0.02, r2=0.0, cor="amarelo", seg=10, bisel=0)
    roda(rab, "X", -55, (0, R + 0.02, zc + 0.02))
    ps.append(rab)
    for sx in (-1, 1):
        asa = bb.se(0.07, 0.28, 0.14, x=sx * (R + r * 0.9), y=0.02, z=zc - 0.02, cor="amarelo_escuro",
                                e=0.6, e_v=0.7)
        ps.append(asa)
    it.add(mb.junta(ps, "boia_pato"))
    return dict(col=[((0, -0.05, 0), (2 * (R + r) + 0.1, 2 * (R + r) + 0.2, 0.75))])


def p_boia_rosquinha(it):
    R, r = 0.36, 0.16
    massa = toro(R, r, cor="caramelo", seg=28, seg_r=12, esc_z=0.9)
    zc = r * 0.9

    def cobertura(c, n):
        a = math.atan2(c.y, c.x)
        return c.z > zc - 0.02 + 0.03 * math.sin(5 * a) and n.z > -0.3

    mb.pinta_onde(massa, "rosa", cobertura)
    ps = [massa]
    rnd = random.Random(5)
    cores = ["branco", "amarelo", "azul_celeste", "verde_lima", "roxo", "laranja"]
    for k in range(34):
        a = rnd.uniform(0, 2 * math.pi)
        rr = R + rnd.uniform(-r * 0.7, r * 0.7)
        d = rr - R
        z = zc + math.sqrt(max(0, (r * 0.9) ** 2 - (d * 0.9) ** 2)) + 0.004
        s = bloco(0.05, 0.014, 0.012, cor=cores[k % len(cores)], bisel=0.005)
        gira_z(s, rnd.uniform(0, 180))
        mover(s, rr * math.cos(a), rr * math.sin(a), z - 0.006)
        ps.append(s)
    it.add(mb.junta(ps, "boia_rosquinha"))
    return dict(col=[((0, 0, 0), (2 * (R + r), 2 * (R + r), 0.3))])


def balde(x, y, cor="vermelho", r=0.11, a=0.16, alca="amarelo", areia=True):
    ps = [mb.torno([(0, 0), (r * 0.78, 0), (r, a), (r * 1.06, a), (r * 1.06, a + 0.012), (r * 0.94, a + 0.012),
                    (r * 0.74, 0.012), (0, 0.012)], cor=cor, seg=18)]
    if areia:
        ps.append(mb.torno([(0, a - 0.01), (r * 0.96, a - 0.02), (r * 0.5, a + 0.03), (0, a + 0.045)], cor="areia",
                           seg=14))
    ps.append(mb.tubo(mb.arco_pts(0, a, r * 1.04, 0, 180, 10), 0.006 * max(1.0, r / 0.11), cor=alca, seg=4, raio_curva=0))
    ob = mb.junta(ps, "balde")
    mover(ob, x, y, 0)
    return ob


def pazinha(x, y, rot=0.0, cor="amarelo"):
    cabo = bloco(0.025, 0.24, 0.018, y=0.12, z=0.0, cor=cor, bisel=0.006)
    pega = bloco(0.08, 0.025, 0.02, y=0.245, z=0.0, cor=cor, bisel=0.008)
    pa = bb.se(0.1, 0.12, 0.02, x=0, y=-0.05, z=0, cor=cor, e=0.5)
    ob = mb.junta([cabo, pega, pa], "pa")
    mover(ob, x, y, 0, rot)
    return ob


def torre_areia(x, y, r, a, z=0.0, ameias=8, cor="areia", cor2="bege", aneis=2, seg=16, telhado=False):
    """Torre de areia de balde: andares levemente cônicos (as marcas do balde) e ameias no alto."""
    perfil = [(0, z)]
    for k in range(aneis):
        z0 = z + a * k / aneis
        z1 = z + a * (k + 1) / aneis
        rb, rt = r * (1.06 - 0.07 * k), r * (1.0 - 0.07 * k)
        perfil += [(rb, z0 + (0.0 if k == 0 else 0.002 * a)), (rt, z1 - 0.03 * a), (rt * 1.02, z1 - 0.012 * a)]
    rt = perfil[-1][0]
    perfil += [(rt * 0.98, z + a), (rt * 0.6, z + a), (rt * 0.6, z + a * 0.95), (0, z + a * 0.95)]
    ps = [mb.torno(perfil, x=x, y=y, cor=cor, seg=seg, angulo=30)]
    mb.pinta_onde(ps[0], cor2, lambda c, n: n.z > 0.5 and c.z > z + a * 0.5)
    for k in range(ameias):
        t = 2 * math.pi * (k + 0.5) / ameias
        w = 2 * math.pi * r * 0.9 / ameias * 0.55
        m = bloco(w, r * 0.38, a * 0.13, cor=cor, bisel=min(w, a * 0.13) * 0.2 if r > 0.5 else 0.0)
        gira_z(m, math.degrees(t) + 90)
        mover(m, x + r * 0.78 * math.cos(t), y + r * 0.78 * math.sin(t), z + a - 0.002)
        ps.append(m)
    if telhado:
        ps.append(mb.cilindro(r * 0.62, a * 0.55, x=x, y=y, z=z + a - a * 0.06, r2=0.0, cor=cor2, seg=seg, bisel=0))
    return mb.junta(ps, "torre")


def p_castelo_areia(it):
    """Castelinho de areia com fosso, quatro torres, torre do meio com bandeirinha, baldinho e pá."""
    ps = [mb.torno([(0, -0.01), (0.62, -0.01), (0.58, 0.03), (0.46, 0.06), (0, 0.065)], cor="bege_escuro", seg=28)]
    ps.append(mb.torno([(0, 0.05), (0.42, 0.05), (0.4, 0.1), (0, 0.105)], cor="areia", seg=24))
    for sx, sy in ((1, 1), (-1, 1), (-1, -1), (1, -1)):
        ps.append(torre_areia(sx * 0.24, sy * 0.24, 0.085, 0.24, z=0.09, ameias=6, seg=12))
    for (x0, y0), (x1, y1) in (((-0.24, -0.24), (0.24, -0.24)), ((0.24, -0.24), (0.24, 0.24)),
                               ((0.24, 0.24), (-0.24, 0.24)), ((-0.24, 0.24), (-0.24, -0.24))):
        L = math.hypot(x1 - x0, y1 - y0)
        w = bloco(L, 0.06, 0.14, cor="areia", bisel=0.015)
        gira_z(w, math.degrees(math.atan2(y1 - y0, x1 - x0)))
        mover(w, (x0 + x1) / 2, (y0 + y1) / 2, 0.09)
        ps.append(w)
        for k in range(3):
            t = (k + 1) / 4
            m = bloco(0.05, 0.06, 0.035, cor="areia", bisel=0.01)
            gira_z(m, math.degrees(math.atan2(y1 - y0, x1 - x0)))
            mover(m, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 0.225)
            ps.append(m)
    ps.append(torre_areia(0, 0.04, 0.12, 0.36, z=0.09, ameias=8, seg=14))
    ps.append(bloco(0.08, 0.02, 0.1, y=-0.255, z=0.09, cor="bege_escuro", bisel=0.02))  # portão
    ps.append(mb.cilindro(0.004, 0.2, x=0, y=0.04, z=0.44, cor="madeira_clara", seg=4, bisel=0))
    ps.append(bb.bandeira_ondulada(0.09, 0.06, 0, 0.04, 0.635, "vermelho", n=4, amp=0.01))
    ps.append(bb.se(0.035, 0.03, 0.012, x=0.12, y=-0.27, z=0.15, cor="rosa_claro", e=0.5))
    ps.append(bb.se(0.03, 0.025, 0.012, x=-0.25, y=-0.12, z=0.2, cor="branco", e=0.5))
    it.add(mb.junta(ps, "castelo"))
    it.add(balde(0.72, -0.2), pazinha(0.62, 0.35, rot=-30))
    return dict(col=[((0.25, 0.05, 0), (1.5, 1.3, 0.5))])


def bola_praia(r, x, y, z, cores=("vermelho", "branco", "azul_celeste", "branco", "amarelo", "branco")):
    b = bb.esf(r, cor="branco", seg=24)
    setores(b, list(cores), len(cores))
    mover(b, x, y, z + r)
    return b


def p_piscina_inflavel(it):
    """Piscina inflável redonda (três boias empilhadas), com água e uma bola de praia boiando (balança)."""
    R, r = 0.95, 0.12
    ps = [mb.cilindro(R + 0.02, 0.03, z=0.0, cor="azul_claro", seg=40, bisel=0.01)]
    for k, cor in enumerate(("azul_celeste", "branco", "rosa")):
        ps.append(toro(R, r, z=0.02 + k * 0.215, cor=cor, seg=40, seg_r=10))
    ps.append(mb.cilindro(R - 0.02, 0.5, z=0.02, cor="azul_bebe", seg=40, bisel=0, tampas=False))
    m = Malha()
    m.poligono([(p[0], p[1], 0.47) for p in mb.circulo(R + 0.02, 40)], "m:agua")
    ps.append(m.obj("agua", recalc=False))
    # válvula
    ps.append(mb.cilindro(0.025, 0.03, x=0, y=-(R + r) - 0.01, z=0.55, eixo="y", cor="branco", seg=8))
    it.add(ps)
    it.anima([bola_praia(0.15, 0.3, 0.2, 0.36)], {"anima": "balancar", "eixo": "x", "angulo": 6, "periodo": 3.2},
             "bola", pivo=(0.3, 0.2, 0.47))
    it.slot("agua", (0, 0, 0.05), (1.4, 1.4, 0.6))
    return dict(col=[((0, 0, 0), (2 * (R + r), 2 * (R + r), 0.66))])


# =====================================================================================================================
# Chuveirinho, rede, cesta, caixa térmica
# =====================================================================================================================
def p_chuveirinho(it):
    """Chuveirinho de praia: estrado de madeira, coluna de inox com ducha, botão e torneira de pé."""
    ps = []
    for k in range(9):
        ps.append(bloco(1.2, 0.1, 0.05, y=-0.55 + k * 0.1375, z=0.03, cor="madeira_mel" if k % 2 else "madeira_clara",
                        bisel=0.012))
    for x in (-0.5, 0.0, 0.5):
        ps.append(bloco(0.08, 1.2, 0.04, x=x, z=0.0, cor="madeira_escura", bisel=0.01))
    ps.append(mb.cilindro(0.17, 0.12, x=0, y=0.45, z=0.0, cor="concreto", seg=16, bisel=0.02))
    ps.append(mb.cilindro(0.045, 2.25, x=0, y=0.45, z=0.1, cor="cromo", seg=12, bisel=0.008))
    ps.append(mb.tubo([(0, 0.45, 2.3), (0, 0.42, 2.42), (0, 0.2, 2.45), (0, 0.05, 2.38)], 0.03, cor="cromo", seg=8,
                      raio_curva=0.12))
    ducha = mb.cilindro(0.11, 0.05, x=0, y=0.03, z=2.3, r2=0.06, cor="cromo", seg=16, bisel=0.008)
    ps.append(ducha)
    ps.append(mb.cilindro(0.1, 0.004, x=0, y=0.03, z=2.296, cor="grafite", seg=16, bisel=0))
    ps.append(bb.cx(0.12, 0.08, 0.16, x=0, y=0.39, z=1.1, cor="azul", bisel=0.02))
    ps.append(mb.cilindro(0.03, 0.03, x=0, y=0.345, z=1.18, eixo="y", cor="vermelho", seg=10))
    ps.append(bb.cx(0.1, 0.18, 0.04, x=0.12, y=0.33, z=0.2, cor="cromo", bisel=0.01))
    m = Malha()
    m.poligono([(0.3 * math.cos(t) * (1 + 0.1 * math.sin(3 * t)), 0.05 + 0.24 * math.sin(t), 0.081) for t in
                [2 * math.pi * k / 20 for k in range(20)]], "m:agua")
    ps.append(m.obj("poca", recalc=False))
    for k in range(6):  # gotas
        a = 2 * math.pi * k / 6
        ps.append(bb.esf(0.018, x=0.06 * math.cos(a), y=0.03 + 0.06 * math.sin(a), z=2.15 - 0.25 * (k % 3), cor=None,
                            mat="agua", seg=8, esc=(1, 1, 1.8)))
    it.add(mb.junta(ps, "chuveiro"))
    it.slot("ducha", (0, 0.0, 0.08), (0.8, 0.8, 1.9))
    return dict(col=[((0, 0, 0), (1.2, 1.2, 0.08)), ((0, 0.45, 0), (0.34, 0.34, 2.5))])


def p_rede_volei(it):
    """Rede de vôlei de praia avulsa: postes, rede de 8,5 m a 2,43 m, antenas listradas, estais e a bola."""
    xp, larg = 4.65, 8.5
    ps = []
    for sx in (-1, 1):
        x = sx * xp
        ps.append(mb.cilindro(0.06, 2.55, x=x, z=0.0, cor="branco", seg=12, bisel=0.01))
        ps.append(mb.cilindro(0.08, 0.06, x=x, z=2.58, cor="azul", seg=12, bisel=0.015))
        ps.append(monte_areia(0.22, 0.07, x=x))
        ps.append(mb.cilindro(0.09, 0.5, x=x, z=0.0, cor="azul", seg=12, bisel=0.02))  # protetor acolchoado
        ps.append(mb.cilindro(0.09, 0.5, x=x, z=0.55, cor="amarelo", seg=12, bisel=0.02))
        ps.append(bb.cordinha((x, 0, 2.55), (sx * 6.2, 0, 0.05), queda=0.08, r=0.008, cor="creme"))
        ps.append(mb.cilindro(0.025, 0.15, x=sx * 6.2, z=0.0, cor="madeira", seg=6, bisel=0))
        # antena listrada (vermelha e branca)
        xa = sx * 4.25
        for k in range(9):
            ps.append(mb.cilindro(0.01, 0.2, x=xa, y=-0.01, z=1.43 + k * 0.2, cor="vermelho" if k % 2 else "branco",
                                  seg=6, bisel=0))
    zb, zt = 1.43, 2.43
    ps.append(bloco(larg, 0.012, 0.07, z=zt - 0.07, cor="branco"))
    ps.append(bloco(larg, 0.012, 0.05, z=zb, cor="branco"))
    for sx in (-1, 1):
        ps.append(bloco(0.05, 0.014, zt - zb, x=sx * larg / 2, z=zb, cor="branco"))
        ps.append(haste((sx * larg / 2, 0, zt - 0.03), (sx * xp, 0, zt - 0.03), 0.008, "grafite", 4))
        ps.append(haste((sx * larg / 2, 0, zb + 0.03), (sx * xp, 0, zb + 0.03), 0.008, "grafite", 4))
    n = 34
    for k in range(1, n):
        ps.append(bloco(0.012, 0.01, zt - zb - 0.1, x=-larg / 2 + larg * k / n, z=zb + 0.04, cor="grafite_escuro"))
    for k in range(1, 5):
        ps.append(bloco(larg - 0.04, 0.01, 0.012, z=zb + (zt - zb) * k / 5, cor="grafite_escuro"))
    it.add(mb.junta(ps, "rede"))
    it.add(bola_praia(0.105, 1.2, -1.1, 0.0, ("amarelo", "azul", "branco")))
    return dict(col=[((-xp, 0, 0), (0.2, 0.2, 2.65)), ((xp, 0, 0), (0.2, 0.2, 2.65)), ((0, 0, zb), (larg, 0.06, 1.0))])


def vime(ob, z0, passo=0.035, c1="caramelo", c2="madeira_mel"):
    mb.pinta_onde(ob, c2, lambda c, n: int((c.z - z0) / passo) % 2 == 1 and abs(n.z) < 0.7)
    return ob


def p_cesta_piquenique(it):
    """Cesta de piquenique de vime: duas tampas que abrem para os lados da alça, toalha xadrez aparecendo."""
    L, P, A = 0.52, 0.34, 0.25
    corpo = mb.carcaca(L, P, A, esp=0.018, cor="caramelo", topo=False, fundo=False, nome="cesto")
    frente = bloco(L - 0.02, 0.018, A, y=-P / 2 + 0.009, z=0, cor="caramelo", bisel=0.006)
    tras = bloco(L - 0.02, 0.018, A, y=P / 2 - 0.009, z=0, cor="caramelo", bisel=0.006)
    for o in (corpo, frente, tras):
        vime(o, 0.0)
    it.add(corpo, frente, tras)
    it.add(bloco(L + 0.02, P + 0.02, 0.025, z=0, cor="madeira_media", bisel=0.008))
    # toalha xadrez dentro (aparece na fresta)
    m = Malha()
    nq = 8
    for i in range(nq):
        for j in range(nq // 2):
            x0 = -L / 2 + 0.03 + (L - 0.06) * i / nq
            x1 = x0 + (L - 0.06) / nq
            y0 = -P / 2 + 0.03 + (P - 0.06) * j / (nq // 2)
            y1 = y0 + (P - 0.06) / (nq // 2)
            z = A - 0.04 + 0.01 * math.sin(i + j)
            m.poligono([(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)], "vermelho" if (i + j) % 2 else "branco")
    it.add(m.obj("xadrez", recalc=False))
    for lado, sy in (("frente", -1), ("tras", 1)):
        tampa = bb.cx(L + 0.01, P / 2 - 0.008, 0.03, x=0, y=sy * (P / 4 + 0.002), z=A, cor="caramelo", bisel=0.008)
        vime(tampa, A, passo=0.012)
        tr = bloco(0.04, 0.03, 0.04, x=0.12, y=sy * (P / 2 - 0.004), z=A - 0.025, cor="madeira_escura", bisel=0.005)
        it.porta([tampa, tr], (0, sy * 0.004, A + 0.015), eixo="x", angulo=(-100 if sy < 0 else 100),
                 nome=f"tampa_{lado}")
    alca = mb.tubo(mb.arco_pts(0, A + 0.02, L / 2 - 0.03, 0, 180, 14), 0.012, cor="madeira_mel", seg=6, raio_curva=0)
    it.add(alca)
    it.add(bloco(0.03, 0.03, 0.06, x=L / 2 - 0.03, z=A - 0.02, cor="madeira_escura"),
           bloco(0.03, 0.03, 0.06, x=-L / 2 + 0.03, z=A - 0.02, cor="madeira_escura"))
    it.slot("cesta", (0, 0, 0.02), (L - 0.04, P - 0.04, A - 0.06))
    return dict(col=[((0, 0, 0), (L, P, A + 0.27))])


def p_caixa_termica(it):
    """Caixa térmica azul com tampa branca (abre), alças laterais e trinco."""
    L, P, A = 0.6, 0.4, 0.34
    ps = [mb.carcaca(L, P, A, esp=0.04, cor="azul", topo=False, nome="corpo"),
          bb.cx(L - 0.078, 0.04, A - 0.04, y=-P / 2 + 0.02, z=0.04, cor="azul", bisel=0.006)]
    ps.append(bb.cx(L + 0.004, P + 0.004, 0.05, z=0.0, cor="azul_medio", bisel=0.02))
    ps.append(bb.cx(L - 0.08, P - 0.08, 0.004, z=0.042, cor="branco", bisel=0.0))
    for sx in (-1, 1):
        ps.append(bb.cx(0.03, 0.18, 0.05, x=sx * (L / 2 + 0.012), z=A - 0.12, cor="cinza_claro", bisel=0.012))
    ps.append(mb.cilindro(0.015, 0.02, x=L / 2 - 0.08, y=-P / 2 - 0.005, z=0.05, eixo="y", cor="branco", seg=8))
    it.add(mb.junta(ps, "caixa"))
    tampa = [bb.cx(L + 0.02, P + 0.02, 0.065, y=0, z=A, cor="branco", bisel=0.025),
             bb.cx(L - 0.12, P - 0.12, 0.015, z=A + 0.064, cor="cinza_claro", bisel=0.006),
             bb.cx(0.08, 0.03, 0.06, x=0, y=-P / 2 - 0.02, z=A - 0.03, cor="cinza_claro", bisel=0.01)]
    it.porta(tampa, (0, P / 2 + 0.01, A + 0.03), eixo="x", lado="cima", abre_graus=100, nome="tampa")
    it.slot("caixa", (0, 0, 0.045), (L - 0.1, P - 0.1, A - 0.06))
    return dict(col=[((0, 0, 0), (L + 0.04, P + 0.02, A + 0.07))])


# =====================================================================================================================
# Deque, bandeiras, lixeira, placas, biruta
# =====================================================================================================================
def p_deque(it):
    """Passarela de madeira modular de 15 m (2 m de largura), tábuas sobre vigas, balizas solares a cada 2,5 m
    alternando os lados (a sequência continua na peça vizinha)."""
    L, W = 15.0, 2.0
    ps = []
    nt = 100
    passo = L / nt
    for k in range(nt):
        y = -L / 2 + passo * (k + 0.5)
        cor = ("madeira_mel", "madeira_clara", "madeira_mel", "caramelo")[k % 4]
        ps.append(bloco(W, passo - 0.012, 0.05, y=y, z=0.115, cor=cor, bisel=0.008))
    for sx in (-1, 0, 1):
        ps.append(bloco(0.12, L - 0.002, 0.12, x=sx * (W / 2 - 0.15), z=0.0, cor="madeira_escura", bisel=0.0))
    for sx in (-1, 1):
        ps.append(bloco(0.06, L - 0.002, 0.11, x=sx * (W / 2 + 0.03), z=0.04, cor="madeira_media", bisel=0.01))
    luzes = []
    for k in range(6):
        y = -6.25 + 2.5 * k
        sx = 1 if k % 2 else -1
        x = sx * (W / 2 + 0.22)
        ps.append(mb.cilindro(0.06, 0.44, x=x, y=y, z=0.0, cor="grafite", seg=10, bisel=0.01))
        luzes.append(mb.cilindro(0.055, 0.08, x=x, y=y, z=0.44, cor=None, mat="luz", seg=10, bisel=0.005))
        ps.append(mb.cilindro(0.075, 0.03, x=x, y=y, z=0.52, cor="grafite", seg=10, bisel=0.008))
        ps.append(mb.cilindro(0.05, 0.008, x=x, y=y, z=0.55, cor="azul_escuro", seg=10, bisel=0))  # placa solar
    it.add(mb.junta(ps + luzes, "deque"))
    return dict(col=[((0, 0, 0), (W + 0.65, L, 0.17))], mini="topo")


def p_bandeira_aviso(cor, aviso):
    def f(it):
        ps = [monte_areia(0.24, 0.08)]
        alt = 3.6
        mastro = mb.cilindro(0.04, alt, z=0.0, cor="branco", seg=12, bisel=0.008)
        mb.pinta_onde(mastro, "vermelho", lambda c, n: int((c.z + 0.1) / 0.4) % 2 == 1 and c.z < 1.3)
        ps.append(mastro)
        ps.append(bola(0.07, 0, 0, alt + 0.04, cor="amarelo" if cor != "amarelo" else "vermelho", sub=2))
        ps.append(caixa_aviso := bb.caixa_estampa(estampa("aviso_" + aviso), 0.62, 0.03, 0.31, 0, -0.06, 1.45,
                                                  cor="branco", normal=(0, -1, 0)))
        ps.append(bloco(0.08, 0.04, 0.12, y=-0.03, z=1.55, cor="metal"))
        it.add(mb.junta(ps, "mastro"))
        band = bb.bandeira_ondulada(1.0, 0.68, 0, 0, alt - 0.05, cor, n=10, amp=0.08)
        argolas = [mb.cilindro(0.055, 0.03, z=alt - 0.12, cor="cinza", seg=10, bisel=0.005),
                   mb.cilindro(0.055, 0.03, z=alt - 0.74, cor="cinza", seg=10, bisel=0.005)]
        it.anima([band] + argolas, {"anima": "balancar", "eixo": "y", "angulo": 14, "periodo": 2.4}, "bandeira",
                 pivo=(0, 0, alt - 0.4))
        return dict(col=[((0, 0, 0), (0.14, 0.14, alt)), ((0, -0.06, 1.45), (0.62, 0.06, 0.31))])
    return f


def p_lixeira_praia(it):
    """Lixeira de praia: tambor azul com tampa basculante, etiqueta LIXO, sobre um estrado de madeira."""
    ps = []
    for k in range(5):
        ps.append(bloco(0.8, 0.14, 0.04, y=-0.32 + k * 0.16, z=0.0, cor="madeira_mel" if k % 2 else "madeira_clara",
                        bisel=0.01))
    r, a = 0.29, 0.9
    tambor = mb.torno([(0, 0.04), (r * 0.95, 0.04), (r, 0.08), (r, a - 0.03), (r * 0.96, a), (0, a)], z=0.0,
                      cor="azul", seg=24)
    ps.append(tambor)
    for zz in (0.3, 0.62):
        ps.append(mb.cilindro(r + 0.012, 0.035, z=zz, cor="azul_medio", seg=24, bisel=0.008))
    ps.append(mb.cilindro(r + 0.02, 0.06, z=a, cor="azul_marinho", seg=24, bisel=0.02))
    ps.append(bb.cx(0.3, 0.14, 0.05, y=-0.08, z=a + 0.05, cor="grafite", bisel=0.015))
    # etiqueta curvinha (três faixas) na frente
    ps.append(bb.rotulo_curvo(estampa("lixo"), r + 0.004, 1.2, 0.26, 0.5))
    it.add(mb.junta(ps, "lixeira"))
    return dict(col=[((0, 0, 0), (0.8, 0.8, 1.0))])


def p_placa_praia(it):
    """Placa grande de praia (PRAIA, ícones de boia, ducha, coco e lixo) em dois postes, com cobertura de palha."""
    ps = []
    for sx in (-1, 1):
        ps.append(mb.cilindro(0.07, 2.65, x=sx * 0.9, z=0.0, cor="madeira", seg=10, bisel=0.01))
        ps.append(monte_areia(0.2, 0.06, x=sx * 0.9))
    ps.append(bb.caixa_estampa(estampa("placa_praia"), 1.6, 0.06, 1.0, 0, -0.08, 1.15, cor="madeira_escura"))
    ps.append(bloco(1.75, 0.08, 0.06, y=-0.08, z=1.1, cor="madeira_escura", bisel=0.015))
    ps.append(bloco(2.05, 0.16, 0.1, y=-0.06, z=2.2, cor="madeira_escura", bisel=0.02))  # travessa de cima
    for sx in (-1, 1):
        ps.append(bola(0.09, sx * 0.9, 0, 2.68, cor="madeira_clara"))
        ps.append(bb.cx(0.2, 0.2, 0.06, x=sx * 0.9, z=2.56, cor="madeira_escura", bisel=0.015))
    # estrela-do-mar e concha de enfeite na travessa
    import props_praia_pisos as pz
    est = pz.estrela(0, 0, 0.16, cor="laranja")
    roda(est, "X", 90)
    mover(est, 0.0, -0.15, 2.25)
    ps.append(est)
    it.add(mb.junta(ps, "placa"))
    return dict(col=[((0, -0.06, 0), (1.95, 0.3, 2.75))])


def p_placa_direcao(it):
    """Placa de direção de praia: poste com três tábuas (MAR, QUIOSQUE, DUCHA) com pontas de seta."""
    ps = [mb.cilindro(0.065, 2.5, z=0.0, cor="madeira_escura", seg=10, bisel=0.01), monte_areia(0.18, 0.06),
          bola(0.075, 0, 0, 2.52, cor="madeira")]
    for k, (ang, ytab) in enumerate(((-12, 0), (18, 1), (-25, 2))):
        z = 1.95 - k * 0.42
        w, h = 1.05, 0.34
        uv = ((0, 1 - (k + 1) / 3), (1, 1 - (k + 1) / 3), (1, 1 - k / 3), (0, 1 - k / 3))
        sx = 1 if k != 1 else -1
        cont = [(-0.05 * sx, -h / 2), (w * sx, -h / 2), (w * sx + 0.18 * sx, 0), (w * sx, h / 2), (-0.05 * sx, h / 2)]
        tab = mb.extrudado(bb.ccw(cont), 0.05, y=-0.025, cor="madeira_clara", bisel=0.015, seg=1, plano="xz")
        mover(tab, 0, 0, z)
        face = bb.placa_estampa(estampa("setas"), w - 0.1, h - 0.06, sx * w / 2, -0.03, z, normal=(0, -1, 0), uv=uv)
        if sx < 0:  # a tábua que aponta para a esquerda mostra o texto do mesmo jeito
            pass
        t = mb.junta([tab, face], "tabua")
        gira_z(t, ang)
        ps.append(t)
    it.add(mb.junta(ps, "placa"))
    return dict(col=[((0, 0, 0), (0.2, 0.2, 2.6))])


def p_biruta(it):
    """Mastro com biruta listrada laranja e branca que balança ao vento."""
    alt = 6.0
    ps = [bb.cx(0.6, 0.6, 0.2, z=0.0, cor="concreto", bisel=0.04)]
    mastro = mb.cilindro(0.06, alt, r2=0.045, z=0.2, cor="branco", seg=12, bisel=0.008)
    mb.pinta_onde(mastro, "vermelho", lambda c, n: int((c.z - 0.2) / 0.6) % 2 == 1)
    ps.append(mastro)
    ps.append(bola(0.07, 0, 0, alt + 0.22, cor="vermelho", sub=2))
    ps.append(mb.cilindro(0.07, 0.08, z=alt + 0.05, cor="cinza_medio", seg=12, bisel=0.01))
    it.add(mb.junta(ps, "mastro"))
    # biruta: cone aberto (tecido com espessura) de 1,6 m, 5 faixas, com o aro na boca
    L, r0, r1, n, nr = 1.6, 0.26, 0.11, 18, 10
    P = []
    for i in range(n + 1):
        a = 2 * math.pi * i / n
        P.append([(0.18 + L * j / nr, (r0 + (r1 - r0) * j / nr) * math.cos(a),
                   (r0 + (r1 - r0) * j / nr) * math.sin(a) - 0.18 * (j / nr) ** 2) for j in range(nr + 1)])
    cone = bb.folha_dupla(P, lambda i, j: "laranja" if (j * 5 // nr) % 2 == 0 else "branco", esp=0.012, nome="biruta",
                          fechado_u=True)
    aro = bb.toro(r0, 0.015, z=-0.015, cor="cinza", seg=18, seg_r=6)
    roda(aro, "Y", 90)
    mover(aro, 0.18, 0, 0)
    haste_b = haste((0, 0, 0), (0.18, 0, 0), 0.015, "cinza", 6)
    bir = mb.junta([cone, aro, haste_b], "biruta")
    mover(bir, 0, 0, alt - 0.1)
    it.anima([bir], {"anima": "balancar", "eixo": "y", "angulo": 28, "periodo": 7.0}, "biruta", pivo=(0, 0, alt - 0.1))
    return dict(col=[((0, 0, 0), (0.6, 0.6, alt + 0.3))])


def p_varal_luzes(it):
    """Varal de luzes coloridas da festa na praia: dois postes de madeira fincados na areia e o cordão com lâmpadas
    de várias cores (acendem à noite; piscam devagar em grupos alternados)."""
    L, h = 8.0, 3.2
    ps = []
    for sx in (-1, 1):
        ps.append(mb.cilindro(0.07, h, x=sx * L / 2, z=0.0, cor="madeira", seg=10, bisel=0.01))
        ps.append(monte_areia(0.2, 0.06, x=sx * L / 2))
        ps.append(bb.cordinha((sx * L / 2, 0, h - 0.05), (sx * (L / 2 + 1.0), 0, 0.03), queda=0.04, r=0.008,
                              cor="creme"))
        ps.append(bola(0.08, sx * L / 2, 0, h, cor="madeira_clara"))
    n = 24
    pts = []
    for k in range(n + 1):
        t = k / n
        pts.append((-L / 2 + L * t, 0, h - 0.15 - 0.55 * 4 * t * (1 - t)))
    ps.append(mb.tubo(pts, 0.009, cor="grafite", seg=4, raio_curva=0))
    it.add(mb.junta(ps, "varal"))
    mats = ["luz", "neon_rosa", "neon", "luz_vermelha", "neon_roxo", "luz_azul"]
    for g in range(2):
        luzes = []
        for k in range(1, n):
            if k % 2 != g:
                continue
            x, y, z = pts[k]
            luzes.append(mb.cilindro(0.012, 0.05, x=x, y=y, z=z - 0.06, cor="grafite", seg=6, bisel=0))
            luzes.append(bola(0.06, x, y, z - 0.12, cor=None, mat=mats[(k // 2 + g * 3) % len(mats)], sub=2,
                              esc=(1, 1, 1.25)))
        it.anima(luzes, {"anima": "piscar", "periodo": 2.4, "suave": True} if g == 0 else
                 {"anima": "piscar", "periodo": 3.1, "suave": True}, f"lampadas_{g + 1}", pivo=(0, 0, h - 0.6))
    return dict(col=[((-L / 2, 0, 0), (0.16, 0.16, h)), ((L / 2, 0, 0), (0.16, 0.16, h))])


def p_poste_boia(it):
    """Poste de salva-vidas com boia pendurada, apito e placa de emergência (cruz vermelha)."""
    ps = [monte_areia(0.22, 0.07)]
    ps.append(bb.cx(0.12, 0.12, 2.0, z=0.0, cor="vermelho", bisel=0.02))
    ps.append(bb.cx(0.22, 0.22, 0.08, z=2.0, cor="branco", bisel=0.02))
    ps.append(bb.cx(0.5, 0.05, 0.36, y=-0.085, z=1.55, cor="branco", bisel=0.015))
    ps.append(bb.cx(0.08, 0.012, 0.26, y=-0.115, z=1.6, cor="vermelho", bisel=0.003))
    ps.append(bb.cx(0.26, 0.012, 0.08, y=-0.115, z=1.69, cor="vermelho", bisel=0.003))
    ps.append(haste((0, -0.06, 1.38), (0, -0.16, 1.38), 0.018, "grafite", 6))
    b = bb.boia_salva_vidas(0.3, 0.065)
    mover(b, 0, -0.2, 1.0)
    ps.append(b)
    ps.append(bb.cordinha((0, -0.16, 1.38), (0, -0.2, 1.3), queda=0.0, r=0.008, cor="creme", n=2))
    ps.append(mb.tubo([(0.28, -0.2, 1.0), (0.32, -0.26, 0.6), (0.18, -0.3, 0.25), (0.1, -0.12, 0.02)], 0.01,
                      cor="creme", seg=4))
    it.add(mb.junta(ps, "poste_boia"))
    return dict(col=[((0, -0.1, 0), (0.7, 0.42, 2.1))])
