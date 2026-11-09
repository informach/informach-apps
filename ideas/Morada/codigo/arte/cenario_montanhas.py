"""Montanhas: blocos de montanha cinza-claro em facetas, com encostas e platôs verdes salpicados de árvores (4
tamanhos e uma crista comprida, que se juntam numa cordilheira), morro verde e montanha com túnel de rua.

As bordas descem até z ≈ −0,3 (afundam um pouco no chão), então os blocos encostados viram uma cordilheira com vales.
"""
import math
import random

import bmesh
from mathutils import Vector

import moveis_base as mb
import cidade_base as cb
import cidade_agua_estruturas as ae
import cenario_base as cnb
from cenario_base import H, Q

V = Vector
DIR_MONTANHA = (0.55, -1.0, 0.6)


def _altura(picos, x, y):
    h = 0.0
    for px, py, hp, rp, ex in picos:
        d = math.hypot((x - px), (y - py)) / rp
        if d < 1:
            h = max(h, hp * (1 - d) ** ex)
    return h


def _borda(x, y, lx, ly, frac=0.2):
    dx = (lx / 2 - abs(x)) / (frac * lx)
    dy = (ly / 2 - abs(y)) / (frac * ly)
    return cnb.suave(min(dx, dy))


def malha_montanha(lx, ly, hmax, seed, passo=2.6, verde_ate=0.5, plano=None, cores_rocha=("branco_gelo", "cinza_claro"),
                   z_borda=-0.3, z_base=-0.6, nome="montanha"):
    """Campo de alturas facetado: picos sorteados (cones com expoente), ruído nos vértices e queda nas bordas.
    plano(x, y, z) → z pode mudar a altura (corredor do túnel). Devolve (objeto, faces verdes [(centro, área)])."""
    rnd = random.Random(seed)
    n_p = max(3, int(lx * ly / 500))
    picos = [(rnd.uniform(-0.08, 0.08) * lx, rnd.uniform(-0.05, 0.1) * ly, hmax, 0.6 * min(lx, ly), 0.95)]
    for k in range(n_p):
        px = rnd.uniform(-0.3, 0.3) * lx
        py = rnd.uniform(-0.3, 0.3) * ly
        picos.append((px, py, hmax * rnd.uniform(0.4, 0.75), min(lx, ly) * rnd.uniform(0.32, 0.5),
                      rnd.uniform(0.8, 1.05)))
    nx, ny = max(6, round(lx / passo)), max(6, round(ly / passo))
    m = ae.Malha()
    grade = []
    for j in range(ny + 1):
        linha = []
        for i in range(nx + 1):
            x = -lx / 2 + lx * i / nx
            y = -ly / 2 + ly * j / ny
            borda = 0 < i < nx and 0 < j < ny
            if borda:
                x += rnd.uniform(-0.3, 0.3) * passo
                y += rnd.uniform(-0.3, 0.3) * passo
            hh = _altura(picos, x, y) * (1 + rnd.uniform(-0.1, 0.1)) + rnd.uniform(-0.4, 0.4)
            f = _borda(x, y, lx, ly)
            z = z_borda + (hh - z_borda) * f if borda else z_borda
            if plano:
                z = plano(x, y, z)
            linha.append(m.v((x, y, z)))
        grade.append(linha)
    verdes = []
    for j in range(ny):
        for i in range(nx):
            a, b, c, d = grade[j][i], grade[j][i + 1], grade[j + 1][i + 1], grade[j + 1][i]
            tris = ((a, b, c), (a, c, d)) if (i + j) % 2 == 0 else ((a, b, d), (b, c, d))
            for t in tris:
                e1, e2 = t[1].co - t[0].co, t[2].co - t[0].co
                nrm = e1.cross(e2)
                area = nrm.length / 2
                nrm.normalize()
                cc = (t[0].co + t[1].co + t[2].co) / 3
                rel = cc.z / max(1.0, hmax)
                if cc.z < 0.6 or (nrm.z > 0.78 and rel < verde_ate) or (nrm.z > 0.9):
                    cor = "grama" if rnd.random() > 0.25 else "grama_escura"
                    if cc.z > 0.3:
                        verdes.append((cc, area))
                elif nrm.z > 0.66 and rel < verde_ate * 0.7:
                    cor = "verde_claro"
                    verdes.append((cc, area * 0.4))
                else:
                    cor = cores_rocha[0] if rnd.random() > 0.35 else cores_rocha[1]
                m.f(t, cor)
    # saias e fundo
    bordas = [[grade[0][i] for i in range(nx + 1)], [grade[j][nx] for j in range(ny + 1)],
              [grade[ny][i] for i in range(nx, -1, -1)], [grade[j][0] for j in range(ny, -1, -1)]]
    for bd in bordas:
        for p, q in zip(bd, bd[1:]):
            m.f((p, m.v((p.co.x, p.co.y, z_base)), m.v((q.co.x, q.co.y, z_base)), q), "grama_escura")
    m.poligono([(-lx / 2, -ly / 2, z_base), (lx / 2, -ly / 2, z_base), (lx / 2, ly / 2, z_base),
                (-lx / 2, ly / 2, z_base)], "grama_escura", normal=(0, 0, -1))
    ob = m.obj(nome)
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(ob.data)
    bm.free()
    return ob, verdes, picos


def arvores_em(verdes, densidade, seed, z_max=None, evita=None, esc=(0.8, 1.5), max_n=120, lim=None):
    rnd = random.Random(seed)
    objs = []
    for cc, area in verdes:
        if lim and (abs(cc.x) > lim[0] or abs(cc.y) > lim[1]):
            continue
        if z_max is not None and cc.z > z_max:
            continue
        if evita and evita(cc.x, cc.y):
            continue
        if rnd.random() < area * densidade:
            e = rnd.uniform(*esc)
            if rnd.random() < 0.2:
                objs.append(cnb.pinheiro_baixo(cc.x, cc.y, cc.z - 0.2, esc=e))
            else:
                objs.append(cnb.arvore_baixa(cc.x, cc.y, cc.z - 0.15, esc=e, rnd=rnd))
        if len(objs) >= max_n:
            break
    return objs


def colisao_montanha(lx, ly, hmax, seed, plano=None):
    ob, _, _ = malha_montanha(lx, ly, hmax, seed, passo=max(lx, ly) / 8, plano=plano, nome="colisao_montanha")
    return ob


def p_montanha(id_, rotulo, lx, ly, hmax, seed, dens=0.035):
    it = mb.Item(id_)
    ob, verdes, picos = malha_montanha(lx, ly, hmax, seed, passo=max(2.4, min(lx, ly) / 16))
    it.add(ob)
    it.add(arvores_em(verdes, dens, seed + 1, max_n=int(lx * ly / 40), lim=(lx / 2 - 2.2, ly / 2 - 2.2)))
    rnd = random.Random(seed + 5)
    for k in range(int(lx * ly / 300)):  # pedras soltas no pé
        a = rnd.uniform(0, 2 * math.pi)
        x, y = 0.43 * lx * math.cos(a), 0.43 * ly * math.sin(a)
        it.add(cnb.pedra_facetada(x, y, -0.4, rnd.uniform(1, 2.4), rnd.uniform(0.8, 1.8), rnd.uniform(0.7, 1.4),
                                  cor=rnd.choice(["branco_gelo", "cinza_claro"]), rot=rnd.uniform(0, 180), seed=k))
    it.colisao_malha(colisao_montanha(lx, ly, hmax, seed), "colisao_montanha")
    col = [((0, 0, -0.6), (lx * 0.5, ly * 0.5, hmax * 0.5))]
    q = (round(lx / Q), round(ly / Q))
    return it, dict(rotulo=rotulo, grupo="montanha", tags=["montanha", "relevo", "cordilheira", f"{q[0]}x{q[1]}"],
                    colisao=col, dir_mini=DIR_MONTANHA, colisao_plana=False, extra={"quadras": list(q),
                                                                                    "altura": hmax})


def p_morro():
    it = mb.Item("morro_verde")
    L, hm = 30.0, 10.0

    def fz(x, y):
        d = math.hypot(x / (L * 0.46), y / (L * 0.42))
        b = _borda(x, y, L, L, 0.12)
        return -0.3 + (hm * (math.cos(min(1.0, d) * math.pi) * 0.5 + 0.5) ** 1.2 + 0.3) * b

    def cor(x, y, z, n):
        return "grama" if n.z > 0.6 else "grama_escura"

    ob = cnb.campo(fz, cor, -L / 2, -L / 2, L / 2, L / 2, passo=1.5, z_base=-0.6, lado="grama_escura", nome="morro")
    me = ob.data
    me.shade_smooth()
    me.set_sharp_from_angle(angle=math.radians(50))
    it.add(ob)
    rnd = random.Random(8)
    for k in range(26):
        a = rnd.uniform(0, 2 * math.pi)
        r = rnd.uniform(1.5, 12.5)
        x, y = r * math.cos(a), r * 0.9 * math.sin(a)
        it.add(cnb.arvore_baixa(x, y, fz(x, y) - 0.15, esc=rnd.uniform(0.9, 1.5), rnd=rnd))
    for k in range(5):
        a = rnd.uniform(0, 2 * math.pi)
        x, y = 9 * math.cos(a), 9 * math.sin(a)
        it.add(cnb.pedra_facetada(x, y, fz(x, y) - 0.3, 1.2, 1.0, 0.8, cor="cinza_claro", seed=k))
    malha = cnb.campo(fz, lambda *a: "grama", -L / 2, -L / 2, L / 2, L / 2, passo=5.0, z_base=-0.6, nome="colisao_morro")
    it.colisao_malha(malha, "colisao_morro")
    return it, dict(rotulo="Morro verde", grupo="morro", tags=["morro", "relevo", "grama", "2x2"],
                    colisao=[((0, 0, -0.6), (14, 14, hm * 0.6))], dir_mini=DIR_MONTANHA, colisao_plana=False,
                    extra={"quadras": [2, 2], "altura": hm})


# ---------------------------------------------------------------------------------------------------- túnel
Y_BOCA, Y_FIM = -6.0, 4.0     # boca do túnel e fundo escuro (a peça vai de y = −15 a +15)
LX_T, LY_T = 45.0, 30.0


def p_montanha_tunel():
    """Montanha 3 × 2 com a boca de túnel no meio da frente: a rua (perfil cb.RUA) entra pela borda y = −15 da quadra
    do meio, como uma rua_reta, e some no túnel."""
    it = mb.Item("montanha_tunel")
    m_, a_ = cb.RUA["mf"], cb.RUA["asf"]
    TW, TP, TT = ae.TUN_W, ae.TUN_P, ae.TUN_T
    y0 = -LY_T / 2
    # rua e calçadas até o fundo do túnel
    it.add(cb.laje(cb.quadrado(-m_, y0, m_, Y_FIM), cb.Z_ASF, "asfalto", nome="asfalto"))
    it.add(cb.laje(cb.quadrado(-H, y0, -m_, Y_BOCA), 0.0, "calcada"), cb.laje(cb.quadrado(m_, y0, H, Y_BOCA), 0.0, "calcada"))
    it.add(cb.laje(cb.quadrado(-TW, Y_BOCA - 0.01, -m_, Y_FIM), 0.0, "calcada"),
           cb.laje(cb.quadrado(m_, Y_BOCA - 0.01, TW, Y_FIM), 0.0, "calcada"))
    it.add(cb.meio_fio([(-m_, Y_FIM), (-m_, y0)]), cb.meio_fio([(m_, y0), (m_, Y_FIM)]))
    it.add(cb.marcacoes_reta(cb.RUA, y0, Y_FIM - 0.3))
    # revestimento e fundo escuro
    perfil = ae.arco_tunel()
    perfil = [(TW, 0.0), (TW, 1.0), (TW, TP)] + perfil[2:-2] + [(-TW, TP), (-TW, 1.0), (-TW, 0.0)]
    cores = ["concreto_escuro", "branco_gelo"] + ["concreto"] * (len(perfil) - 5) + ["branco_gelo", "concreto_escuro"]
    it.add(ae.varre([(0.0, Y_BOCA), (0.0, Y_FIM)], 0.0, perfil, cores, tang=(0, 1), nome="revestimento"))
    m2 = ae.Malha()
    m2.poligono([(x, Y_FIM - 0.03, z) for x, z in ae.arco_tunel()], "preto", normal=(0, -1, 0), plano=lambda p: (p[0], p[2]))
    it.add(m2.obj("fundo_escuro"))
    for y in (Y_BOCA + 1.2, Y_BOCA + 4.0, Y_BOCA + 6.8):
        it.add(mb.caixa(1.0, 0.35, 0.08, y=y, z=TT - 0.1, cor=None, mat="luz", bisel=0.02, seg=1))
    # emboque: fachada de concreto com a boca, moldura, cornija e luzes
    FZ = 8.6
    fach = [(-9.5, cb.Z_FUNDO), (9.5, cb.Z_FUNDO), (9.5, FZ - 1.0), (8.5, FZ), (-8.5, FZ), (-9.5, FZ - 1.0)]
    it.add(ae.prisma_xz([fach, ae.arco_tunel()], Y_BOCA - 0.6, Y_BOCA + 1.5, "concreto", nome="emboque"))
    anel_ext = ae.arco_tunel(folga=0.55)
    it.add(ae.prisma_xz([[(x, max(z, 0.0)) for x, z in anel_ext], ae.arco_tunel()], Y_BOCA - 0.8, Y_BOCA - 0.58,
                        "concreto_escuro", nome="moldura"))
    it.add(mb.caixa(19.4, 0.6, 0.35, y=Y_BOCA - 0.62, z=FZ - 0.1, cor="concreto_escuro", bisel=0.06, seg=2))
    for x in (-2.4, -1.2, 0.0, 1.2, 2.4):
        it.add(mb.caixa(0.5, 0.3, 0.26, x=x, y=Y_BOCA - 0.72, z=6.62, cor="grafite", bisel=0.04, seg=1),
               mb.caixa(0.4, 0.04, 0.16, x=x, y=Y_BOCA - 0.88, z=6.67, cor=None, mat="luz", bisel=0.01, seg=1))
    for sx in (-1, 1):
        it.add(mb.caixa(0.35, 0.25, 0.5, x=sx * 6.6, y=Y_BOCA - 0.72, z=3.6, cor="grafite", bisel=0.04, seg=1),
               mb.caixa(0.27, 0.04, 0.4, x=sx * 6.6, y=Y_BOCA - 0.86, z=3.65, cor=None, mat="luz", bisel=0.01, seg=1))
    # montanha com o corredor da rua aberto e a fachada embutida
    def plano(x, y, z):
        if abs(x) < H + 0.01 and y < Y_BOCA + 0.2:
            return -0.6  # corredor (a rua fica por cima)
        dx = max(0.0, abs(x) - H)
        if y < Y_BOCA + 0.2:
            return min(z, -0.3 + 1.6 * dx ** 1.1) if dx < 8 else z
        w = cnb.suave((13.0 - abs(x)) / 5.0) * cnb.suave((Y_FIM + 9 - y) / 6.0)
        return max(z, (FZ + 1.0 + 0.7 * (y - Y_BOCA)) * w)  # por cima da fachada e do túnel, sem degrau
    ob, verdes, _ = malha_montanha(LX_T, LY_T, 30.0, 41, passo=2.4, plano=plano)
    it.add(ob)
    it.add(arvores_em(verdes, 0.04, 42, evita=lambda x, y: abs(x) < 9 and y < Y_BOCA + 1, max_n=40,
                      lim=(LX_T / 2 - 2.2, LY_T / 2 - 2.2)))
    for sx in (-1, 1):  # muros de contenção baixos ao lado da calçada, na frente da boca
        it.add(mb.caixa(0.4, Y_BOCA - y0 - 0.6, 0.6, x=sx * (H + 0.2), y=(y0 + Y_BOCA) / 2 - 0.3, z=-0.4,
                        cor="concreto", bisel=0.05, seg=2))
    it.add(ae.poste(-6.4, y0 + 4.0, ang=0, braco=1.2), ae.poste(6.4, y0 + 10.0, ang=180, braco=1.2))
    it.colisao_malha(colisao_montanha(LX_T, LY_T, 30.0, 41, plano=plano), "colisao_montanha")
    col = [((0, (y0 + Y_FIM) / 2, cb.Z_FUNDO), (2 * TW, Y_FIM - y0, -cb.Z_FUNDO)),
           ((-(H + 11.25), 0, -0.6), (Q, LY_T * 0.6, 12.0)), (((H + 11.25), 0, -0.6), (Q, LY_T * 0.6, 12.0)),
           ((0, (Y_BOCA + Y_FIM) / 2, TT), (2 * TW, Y_FIM - Y_BOCA, FZ - TT)),
           ((-(TW + 2.0), (Y_BOCA + Y_FIM) / 2, 0), (4.0, Y_FIM - Y_BOCA, FZ)),
           (((TW + 2.0), (Y_BOCA + Y_FIM) / 2, 0), (4.0, Y_FIM - Y_BOCA, FZ)),
           ((0, (Y_FIM + LY_T / 2) / 2, -0.6), (2 * TW + 8, LY_T / 2 - Y_FIM, 14.0))]
    return it, dict(rotulo="Montanha com túnel de rua (3 × 2)", grupo="montanha", tags=["montanha", "tunel", "rua", "3x2"],
                    colisao=col, dir_mini=(0.4, -1.0, 0.55), colisao_plana=False,
                    extra={"quadras": [3, 2], "rua": {"perfil": "rua", "borda": "y-", "x": 0.0}})


PECAS = [
    ("montanha_pequena", lambda: p_montanha("montanha_pequena", "Montanha pequena (2 × 2)", 30, 30, 15, 3, dens=0.06)),
    ("montanha_media", lambda: p_montanha("montanha_media", "Montanha média (3 × 3)", 45, 45, 26, 7, dens=0.05)),
    ("montanha_grande", lambda: p_montanha("montanha_grande", "Montanha grande (4 × 4)", 60, 60, 38, 11, dens=0.045)),
    ("montanha_enorme", lambda: p_montanha("montanha_enorme", "Montanha enorme (6 × 6)", 90, 90, 58, 19, dens=0.04)),
    ("montanha_crista", lambda: p_montanha("montanha_crista", "Crista de montanha (4 × 2)", 60, 30, 26, 23,
                                           dens=0.05)),
    ("morro_verde", p_morro),
    ("montanha_tunel", p_montanha_tunel),
]
