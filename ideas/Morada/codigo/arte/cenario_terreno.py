"""Terreno de ilha: areia, transições grama↔areia, costa de areia com espuma, costa de rocha, mar e platô.

Formas (todas as peças de borda usam o mesmo campo s(x, y): s < 0 é terra, s > 0 é mar/areia; o perfil é o mesmo
em toda borda, então as peças encaixam entre si):
  reta      s = y                            (terra em −Y, mar em +Y)
  ext       s = |P − (−7,5, −7,5)| − 7,5     (canto externo: a terra é o quarto de disco no canto −X −Y)
  int       s = 7,5 − |P − (7,5, 7,5)|       (canto interno: o mar é o quarto de disco no canto +X +Y)
  faixa     s = 2|x| − 7,5                   (faixa de terra estreita correndo em Y, mar dos dois lados ±X)
  ponta     s = 2|P − (0, −7,5)| − 7,5       (fim arredondado da faixa: a faixa chega pelo −Y)
"""
import math
import random

import bmesh

import moveis_base as mb
import cidade_base as cb
import cidade_agua_estruturas as ae
import cidade_ruas as cr
import cenario_base as cnb
from cenario_base import H, Q, Z_AGUA, Z_FUNDO_MAR, Z_BASE_MAR, Z_PLATO

hyp = math.hypot


# ---------------------------------------------------------------------------------------------------- formas
class Forma:
    def __init__(self, nome):
        self.nome = nome

    def s(self, x, y):
        n = self.nome
        if n == "reta":
            return y
        if n == "ext":
            return hyp(x + H, y + H) - H
        if n == "int":
            return H - hyp(x - H, y - H)
        if n == "faixa":
            return 2 * abs(x) - H
        if n == "ponta":
            return 2 * hyp(x, y + H) - H
        if n == "base":
            return min(y, 2 * abs(x) - H)
        raise ValueError(n)

    def curvas(self, c, n=40):
        """Curvas de nível s = c: lista de funções u ∈ [0, 1] → (x, y) (de uma borda da peça à outra)."""
        nm = self.nome
        if nm == "reta":
            return [lambda u, c=c: (-H + Q * u, c)]
        if nm == "ext":
            r = c + H
            return [lambda u, r=r: (-H + r * math.cos(math.pi / 2 * u), -H + r * math.sin(math.pi / 2 * u))]
        if nm == "int":
            r = H - c
            return [lambda u, r=r: (H + r * math.cos(math.pi * (1 + u / 2)), H + r * math.sin(math.pi * (1 + u / 2)))]
        if nm == "faixa":
            xc = (c + H) / 2
            return [lambda u, xc=xc: (xc, -H + Q * u), lambda u, xc=xc: (-xc, H - Q * u)]
        if nm == "ponta":
            r = (c + H) / 2
            return [lambda u, r=r: (r * math.cos(math.pi * u), -H + r * math.sin(math.pi * u))]
        if nm == "base":
            xc = (c + H) / 2
            r = 2.2 * min(1.0, max(0.0, (c + H) / 3.0))  # cotovelo vivo no começo (as duas metades se encontram)
            esq = _cotovelo([(-H, c), (-xc, c), (-xc, H)], r)
            dir_ = _cotovelo([(xc, H), (xc, c), (H, c)], r)
            return [esq, dir_]
        raise ValueError(nm)

    def regiao_mar(self, c, n=40):
        """Polígonos (2D) da região s ≥ c dentro da peça."""
        nm = self.nome
        cur = [f for f in self.curvas(c)]
        pts = [cur[0](k / n) for k in range(n + 1)] if nm not in ("faixa",) else None
        if nm == "reta":
            return [cb.quadrado(-H, c, H, H)]
        if nm == "ext":
            return [pts + [(-H, H), (H, H), (H, -H)]]
        if nm == "int":
            return [pts + [(H, H)]]
        if nm == "faixa":
            xc = (c + H) / 2
            return [cb.quadrado(xc, -H, H, H), cb.quadrado(-H, -H, -xc, H)]
        if nm == "ponta":
            r = (c + H) / 2
            return [[(-H, -H)] + pts[::-1] + [(H, -H), (H, H), (-H, H)]]
        if nm == "base":
            e, d = self.curvas(c)
            return [[e(k / n) for k in range(n + 1)] + [(-H, H)], [d(k / n) for k in range(n + 1)] + [(H, H)]]
        raise ValueError(nm)


def _cotovelo(pts, raio=2.2):
    """Linha de 3 pontos com o cotovelo arredondado, parametrizada pelo comprimento (u ∈ [0, 1])."""
    a, b, c = (mb.V((p[0], p[1], 0)) for p in pts)
    la, lb = (b - a).length, (c - b).length
    r = min(raio, 0.45 * la, 0.45 * lb)
    poli = [a]
    if r > 1e-3:
        p1 = b + (a - b).normalized() * r
        p2 = b + (c - b).normalized() * r
        for k in range(9):
            t = k / 8
            poli.append((1 - t) ** 2 * p1 + 2 * (1 - t) * t * b + t ** 2 * p2)
    else:
        poli.append(b)
    poli.append(c)
    ls = [0.0]
    for p, q in zip(poli, poli[1:]):
        ls.append(ls[-1] + (q - p).length)
    L = ls[-1]

    def f(u):
        if L < 1e-6:
            return (a.x, a.y)
        su = u * L
        for i in range(len(poli) - 1):
            if su <= ls[i + 1] + 1e-9:
                t = (su - ls[i]) / max(1e-9, ls[i + 1] - ls[i])
                p = poli[i].lerp(poli[i + 1], t)
                return (p.x, p.y)
        return (c.x, c.y)
    return f


def faixa_curva(forma, c1, c2, z0, z1, cor, onda=0.3, k=2, fase=0.0, n=48, nome="espuma"):
    """Faixa entre as curvas de nível c1 e c2 (com onda nas duas bordas, zero nas pontas para casar com a vizinha),
    como laje fina de z0 a z1."""
    objs = []
    for f in forma.curvas(0.0):
        pass
    for idx in range(len(forma.curvas(c1))):
        dentro, fora = [], []
        for j in range(n + 1):
            u = j / n
            w = onda * math.sin(2 * math.pi * k * u + fase) * math.sin(math.pi * u) ** 0.3
            w2 = 0.6 * onda * math.sin(2 * math.pi * (k + 1) * u + 1.3) * math.sin(math.pi * u) ** 0.3
            dentro.append(forma.curvas(c1 + w2)[idx](u))
            fora.append(forma.curvas(c2 + w)[idx](u))
        pts = dentro + fora[::-1]
        objs.append(ae.prisma([pts], z0, z1, cor, nome=nome))
    return mb.junta(objs, nome)


NIVEIS = [-7.5, -5.5, -4.0, -3.0, -2.5, -2.0, -1.5, -1.0, -0.5, 0.0, 0.5, 1.0, 1.6, 2.4, 3.2, 4.0, 4.8, 5.6, 6.4, 7.5]


def _dedup(pts, tol=1e-4):
    out = []
    for p in pts:
        if not out or (abs(p[0] - out[-1][0]) > tol or abs(p[1] - out[-1][1]) > tol):
            out.append(p)
    if len(out) > 2 and abs(out[0][0] - out[-1][0]) < tol and abs(out[0][1] - out[-1][1]) < tol:
        out.pop()
    return out


def campo_curvo(forma, fz, fcor, niveis=NIVEIS, n=28, z_base=-1.9, lado="terra_seca", nome="terreno"):
    """Terreno com a malha seguindo as curvas de nível da forma (as faixas de cor ficam lisas nas curvas). As
    sobras do quadrado fora de s ∈ [−7,5, 7,5] viram lajes planas na cota da ponta do perfil."""
    m = ae.Malha()
    ncur = len(forma.curvas(0.0))
    for idx in range(ncur):
        grade = []
        for c in niveis:
            f = forma.curvas(c)[idx]
            grade.append([m.v((*f(j / n), fz(c))) for j in range(n + 1)])
        for i in range(len(niveis) - 1):
            cm = (niveis[i] + niveis[i + 1]) / 2
            cor = fcor(cm)
            for j in range(n):
                a, b, cc, d = grade[i][j], grade[i][j + 1], grade[i + 1][j + 1], grade[i + 1][j]
                if (a.co - b.co).length < 1e-5:
                    m.f((a, cc, d), cor)
                elif (d.co - cc.co).length < 1e-5:
                    m.f((a, b, cc), cor)
                else:
                    m.f((a, b, cc, d), cor)
        # saias nas quatro bordas da grade
        linhas = [grade[0], grade[-1], [r[0] for r in grade], [r[-1] for r in grade]]
        for ln in linhas:
            for p, q in zip(ln, ln[1:]):
                if (p.co - q.co).length < 1e-5:
                    continue
                m.f((p, q, m.v((q.co.x, q.co.y, z_base)), m.v((p.co.x, p.co.y, z_base))), lado)
    ob = m.obj(nome)
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    for f in bm.faces:  # tudo com a normal para cima (as saias tanto faz)
        if f.normal.z < -0.5:
            f.normal_flip()
    bm.to_mesh(ob.data)
    bm.free()
    objs = [ob]
    nm = forma.nome
    if nm == "ext":
        pol = _dedup(forma.regiao_mar(niveis[-1])[0])
        objs.append(ae.prisma([pol], z_base, fz(niveis[-1]), fcor(niveis[-1] - 0.01), lado=lado, nome="fundo"))
    elif nm == "ponta":
        pol = _dedup(forma.regiao_mar(niveis[-1])[0])
        objs.append(ae.prisma([pol], z_base, fz(niveis[-1]), fcor(niveis[-1] - 0.01), lado=lado, nome="fundo"))
    elif nm == "int":
        f = forma.curvas(niveis[0])[0]
        arc = [f(j / 40) for j in range(41)]
        pol = _dedup(arc[::-1] + [(-H, -H)])
        objs.append(ae.prisma([pol], z_base, fz(niveis[0]), fcor(niveis[0] + 0.01), lado=lado, nome="terra"))
    return mb.junta(objs, nome)


# ---------------------------------------------------------------------------------------------------- perfil da praia
def z_praia(s):
    s = max(-H, min(H, s))
    if s <= -2.5:
        return 0.0
    if s <= 1.0:
        u = (s + 2.5) / 3.5
        return -1.0 * (0.55 * u + 0.45 * u * u)
    u = (s - 1.0) / 6.5
    return -1.0 - 0.7 * u ** 0.8


def cor_praia(s):
    if s < -0.6:
        return "laranja_claro"
    if s < 1.0:
        return "pessego"
    if s < 2.6:
        return "turquesa_claro"
    if s < 4.4:
        return "turquesa"
    if s < 6.0:
        return "agua_rio"
    return "agua_funda"


def detalhes_areia(it, ok, seed=3, n=8):
    """Conchas, estrelas-do-mar e pedrinhas na areia seca (ok(x, y) diz se o ponto é areia seca em z = 0)."""
    rnd = random.Random(seed)
    k = 0
    tent = 0
    while k < n and tent < 200:
        tent += 1
        x, y = rnd.uniform(-6.8, 6.8), rnd.uniform(-6.8, 6.8)
        if not ok(x, y):
            continue
        t = k % 4
        if t == 0:  # estrela-do-mar
            pts = []
            for j in range(10):
                r = 0.28 if j % 2 == 0 else 0.11
                a = math.pi / 2 + j * math.pi / 5 + rnd.uniform(0, 1)
                pts.append((x + r * math.cos(a), y + r * math.sin(a)))
            it.add(ae.prisma([pts], -0.01, 0.04, rnd.choice(["laranja", "vermelho_claro", "salmao"]), nome="estrela"))
        elif t == 1:  # concha
            c = mb.superelipsoide(0.22, 0.18, 0.08, x=x, y=y, z=-0.01, cor=rnd.choice(["rosa_claro", "creme_claro"]),
                                  e=0.7, e_v=0.6, nu=10, nv=4)
            it.add(c)
        else:  # pedrinhas
            for j in range(3):
                it.add(cnb.pedra_facetada(x + rnd.uniform(-0.4, 0.4), y + rnd.uniform(-0.4, 0.4), -0.05,
                                          rnd.uniform(0.12, 0.3), rnd.uniform(0.1, 0.25), rnd.uniform(0.08, 0.16),
                                          cor=rnd.choice(["cinza_claro", "bege", "cinza"]), seed=k * 7 + j))
        k += 1


def ondulacoes(it, ok, seed=5):
    """Marcas de vento na areia: risquinhos curvos pessego, 3 mm acima."""
    rnd = random.Random(seed)
    for k in range(14):
        x, y = rnd.uniform(-6.5, 6.5), rnd.uniform(-6.5, 6.5)
        L = rnd.uniform(1.2, 2.4)
        pts = [(x + L * (j / 8 - 0.5), y + 0.12 * math.sin(j / 8 * math.pi * 2)) for j in range(9)]
        if all(ok(p[0], p[1]) for p in pts):
            it.add(cb.faixa(pts, larg=0.09, cor="pessego", z=0.0, nome="ondulacao"))


# ---------------------------------------------------------------------------------------------------- peças
def p_areia():
    it = mb.Item("areia")
    it.add(cb.laje(cb.quadrado(-H, -H, H, H), 0.0, "laranja_claro", nome="areia"))
    ondulacoes(it, lambda x, y: abs(x) < 7.2 and abs(y) < 7.2)
    detalhes_areia(it, lambda x, y: True, seed=11, n=9)
    return it, dict(rotulo="Areia", grupo="areia", tags=["modular", "piso", "areia", "praia"])


def p_grama_areia(nome_forma):
    """Transição grama↔areia (as duas em z = 0): grama do lado da terra (s < 0), areia do lado do mar."""
    fo = Forma(nome_forma)
    it = mb.Item(f"grama_areia_{ {'reta': 'reta', 'ext': 'canto_ext', 'int': 'canto_int'}[nome_forma] }")
    n = 48
    k = 2
    borda = [fo.curvas(0.35 * math.sin(2 * math.pi * k * (j / n)) * math.sin(math.pi * j / n) ** 0.3)[0](j / n)
             for j in range(n + 1)]
    if nome_forma == "reta":
        grama = [(-H, -H), (H, -H)] + borda[::-1]
        areia = borda + [(H, H), (-H, H)]
        areia = [(-H, borda[0][1])] + areia if False else areia
    elif nome_forma == "ext":
        grama = [(-H, -H)] + borda
        areia = borda[::-1] + [(H, -H), (H, H), (-H, H)]
        areia = [borda[-1]] + [(-H, H), (H, H), (H, -H)] + [borda[0]] + borda[1:-1]
    else:  # int: areia no quarto de disco do canto +X +Y
        areia = borda + [(H, H)]
        grama = borda[::-1] + [(H, -H), (-H, -H), (-H, H)]
        grama = [borda[-1], (H, -H), (-H, -H), (-H, H), borda[0]] + borda[1:-1]
    it.add(ae.prisma([grama], cb.Z_FUNDO, 0.0, "grama", nome="grama"))
    it.add(ae.prisma([areia], cb.Z_FUNDO, 0.0, "laranja_claro", nome="areia"))

    def na_grama(x, y):
        return fo.s(x, y) < -0.5

    def na_areia(x, y):
        return fo.s(x, y) > 0.6

    # faixas de corte da grama (período de 5 m em x, como o piso_grama), recortadas pela borda
    for kk in range(3):
        x0 = -H + 5 * kk + 2.5
        xs = [x0 + 2.5 * j / 10 for j in range(11)]
        topo = []
        for x in xs:
            yy = [y / 20 for y in range(-150, 151)]
            ys = [y for y in yy if fo.s(x, y) < -0.06 - 0.35]
            topo.append(max(ys) if ys else None)
        seg = [(x, t) for x, t in zip(xs, topo) if t is not None and t > -H + 0.05]
        if len(seg) >= 2:
            pts = [(seg[0][0], -H)] + [(x, -H + 0.0) for x, _ in []] + [(seg[-1][0], -H)] + [(x, t) for x, t in seg[::-1]]
            it.add(cr.poli(pts, z=0.0, cor="verde_claro", alt=0.002))
    rnd = random.Random(len(nome_forma))
    for j in range(10):
        x, y = rnd.uniform(-6.8, 6.8), rnd.uniform(-6.8, 6.8)
        if na_grama(x, y):
            it.add(cr.tufo(x, y))
    for j in range(10):  # touceiras de capim de praia na beira da grama
        u = (j + 0.5) / 10
        x, y = fo.curvas(0.55)[0](u)
        if abs(x) < 7.0 and abs(y) < 7.0:
            it.add(cr.tufo(x, y, cor="verde_oliva", alt=0.45, n=6))
    ondulacoes(it, lambda x, y: na_areia(x, y) and abs(x) < 7.2 and abs(y) < 7.2, seed=len(nome_forma) + 2)
    detalhes_areia(it, lambda x, y: na_areia(x, y), seed=len(nome_forma) * 3, n=4)
    rot = {"reta": "Grama e areia (reta)", "ext": "Grama e areia (canto externo)", "int": "Grama e areia (canto interno)"}
    return it, dict(rotulo=rot[nome_forma], grupo="grama_areia", tags=["modular", "piso", "areia", "grama", "praia"])


def p_costa_areia(nome_forma):
    fo = Forma(nome_forma)
    ids = {"reta": "reta", "ext": "canto_ext", "int": "canto_int", "faixa": "faixa", "ponta": "ponta",
           "base": "faixa_base"}
    it = mb.Item(f"costa_areia_{ids[nome_forma]}")
    it.add(campo_curvo(fo, z_praia, cor_praia, z_base=Z_BASE_MAR, nome="praia"))
    for pol in fo.regiao_mar(-0.2):
        it.add(cnb.agua_plano(_dedup(pol)))
    # água rasa: faixas turquesa logo acima da lâmina (o mar fundo fica com a cor da água)
    it.add(faixa_curva(fo, 0.6, 3.1, Z_AGUA + 0.004, Z_AGUA + 0.012, "turquesa_claro", onda=0.35, k=2, fase=0.6,
                       nome="agua_rasa"))
    it.add(faixa_curva(fo, 2.9, 5.0, Z_AGUA + 0.002, Z_AGUA + 0.008, "turquesa", onda=0.45, k=3, fase=2.0,
                       nome="agua_media"))
    # espuma: faixa larga na beira e uma linha de onda mais para fora
    it.add(faixa_curva(fo, 0.45, 1.55, Z_AGUA + 0.01, Z_AGUA + 0.03, "branco", onda=0.32, k=2, nome="espuma"))
    it.add(faixa_curva(fo, 2.25, 2.6, Z_AGUA + 0.01, Z_AGUA + 0.022, "branco_gelo", onda=0.25, k=3, fase=1.0,
                       nome="espuma_onda"))
    detalhes_areia(it, lambda x, y: fo.s(x, y) < -3.0 and abs(x) < 7 and abs(y) < 7, seed=len(nome_forma) * 5, n=4)
    ondulacoes(it, lambda x, y: fo.s(x, y) < -3.2 and abs(x) < 7.2 and abs(y) < 7.2, seed=len(nome_forma))
    rot = {"reta": "Costa de areia (reta)", "ext": "Costa de areia (canto externo)", "int": "Costa de areia (canto interno)",
           "faixa": "Costa de areia (faixa estreita)", "ponta": "Costa de areia (ponta)",
           "base": "Costa de areia (começo da faixa estreita)"}
    col = [((0, 0, Z_BASE_MAR), (Q, Q, Z_FUNDO_MAR - Z_BASE_MAR))]
    if nome_forma == "reta":
        col.append(((0, -H / 2 - 0.5, Z_FUNDO_MAR), (Q, H - 1.0, -Z_FUNDO_MAR)))
    elif nome_forma == "int":
        col.append(((0, -H / 2, Z_FUNDO_MAR), (Q, H, -Z_FUNDO_MAR)))
        col.append(((-H / 2, H / 2, Z_FUNDO_MAR), (H, H, -Z_FUNDO_MAR)))
    elif nome_forma == "ext":
        col.append(((-H / 2 - 1, -H / 2 - 1, Z_FUNDO_MAR), (H - 2, H - 2, -Z_FUNDO_MAR)))
    elif nome_forma == "faixa":
        col.append(((0, 0, Z_FUNDO_MAR), (4.0, Q, -Z_FUNDO_MAR)))
    elif nome_forma == "base":
        col.append(((0, -H / 2 - 0.5, Z_FUNDO_MAR), (Q, H - 1.0, -Z_FUNDO_MAR)))
        col.append(((0, H / 2, Z_FUNDO_MAR), (4.0, H, -Z_FUNDO_MAR)))
    else:
        col.append(((0, -H + 2.0, Z_FUNDO_MAR), (4.0, 4.0, -Z_FUNDO_MAR)))
    for pol in fo.regiao_mar(-2.5):
        pass
    malha = cnb.campo(lambda x, y: z_praia(fo.s(x, y)), lambda x, y, z, n: "areia", -H, -H, H, H, passo=1.5,
                      z_base=Z_BASE_MAR, nome="colisao_praia")
    it.colisao_malha(malha, "colisao_praia")
    return it, dict(rotulo=rot[nome_forma], grupo="costa_areia", tags=["modular", "agua", "praia", "areia", "costa"],
                    colisao=col)


def z_rocha(s):
    s = max(-H, min(H, s))
    if s <= -1.2:
        return 0.0
    if s <= 0.4:
        u = (s + 1.2) / 1.6
        return -0.3 * u - 1.4 * u ** 2
    return Z_FUNDO_MAR


def p_costa_rocha(nome_forma):
    fo = Forma(nome_forma)
    ids = {"reta": "reta", "ext": "canto_ext", "int": "canto_int"}
    it = mb.Item(f"costa_rocha_{ids[nome_forma]}")

    def cor(x, y, z, n):
        s = fo.s(x, y)
        if s < -1.25:
            return "grama"
        if s < 0.45:
            return "cinza_medio"
        return "agua_funda"

    def cor_s(s):
        return "grama" if s < -1.2 else ("cinza_medio" if s < 0.4 else "agua_funda")

    it.add(campo_curvo(fo, z_rocha, cor_s, niveis=[-7.5, -4.0, -2.0, -1.2, -0.8, -0.4, 0.0, 0.4, 2.0, 5.0, 7.5],
                       z_base=Z_BASE_MAR, lado="cinza_medio", nome="rochedo"))
    for pol in fo.regiao_mar(-0.8):
        it.add(cnb.agua_plano(_dedup(pol)))
    # pedras grandes ao longo da costa
    rnd = random.Random(17 + len(nome_forma))
    n = 11
    for j in range(n):
        u = (j + 0.5) / n
        c = rnd.uniform(-0.6, 0.9)
        x, y = fo.curvas(c)[0](u)
        L = rnd.uniform(1.4, 2.8)
        if abs(x) > H - 0.65 * L or abs(y) > H - 0.65 * L:
            continue
        a = rnd.uniform(1.0, 2.2)
        it.add(cnb.pedra_facetada(x, y, Z_FUNDO_MAR - 0.1, L, L * rnd.uniform(0.7, 1.0), a + 0.7,
                                  cor=rnd.choice(["cinza", "cinza_claro", "cinza_medio"]), rot=rnd.uniform(0, 180),
                                  seed=j + 3))
    # espuma em volta
    it.add(faixa_curva(fo, 0.6, 1.5, Z_AGUA + 0.004, Z_AGUA + 0.02, "branco", onda=0.4, k=3, nome="espuma"))
    for j in range(8):
        x, y = rnd.uniform(-6.8, 6.8), rnd.uniform(-6.8, 6.8)
        if fo.s(x, y) < -2.0:
            it.add(cr.tufo(x, y))
    rot = {"reta": "Costa de rocha (reta)", "ext": "Costa de rocha (canto externo)", "int": "Costa de rocha (canto interno)"}
    malha = cnb.campo(lambda x, y: z_rocha(fo.s(x, y)), lambda *a: "cinza", -H, -H, H, H, passo=1.5,
                      z_base=Z_BASE_MAR, nome="colisao_rocha")
    it.colisao_malha(malha, "colisao_rocha")
    return it, dict(rotulo=rot[nome_forma], grupo="costa_rocha", tags=["modular", "agua", "costa", "rocha"],
                    colisao=[((0, 0, Z_BASE_MAR), (Q, Q, Z_FUNDO_MAR - Z_BASE_MAR))])


def p_mar(nq=1):
    L = Q * nq
    it = mb.Item("mar" if nq == 1 else f"mar_grande")
    it.add(cb.laje(cb.quadrado(-L / 2, -L / 2, L / 2, L / 2), Z_FUNDO_MAR, "agua_funda", z_fundo=Z_BASE_MAR))
    it.add(cnb.agua_plano(cb.quadrado(-L / 2, -L / 2, L / 2, L / 2)))
    rot = "Mar aberto" if nq == 1 else f"Mar aberto grande ({nq} × {nq})"
    tags = ["modular", "agua", "mar"] + ([] if nq == 1 else ["grande", f"{nq}x{nq}"])
    extra = None if nq == 1 else {"quadras": [nq, nq]}
    return it, dict(rotulo=rot, grupo="mar", tags=tags, colisao=[((0, 0, Z_BASE_MAR), (L, L, Z_FUNDO_MAR - Z_BASE_MAR))],
                    extra=extra)


# ---------------------------------------------------------------------------------------------------- platô
E_MURO = 0.6   # espessura do muro de arrimo (a face fica no limite da parte baixa)


def grama_topo(it, pol, z, listras=True, nome="grama"):
    it.add(ae.prisma([pol], cb.Z_FUNDO, z, "grama", lado="concreto", nome=nome))


def face_muro(it, p0, p1, z0, z1, normal_sinal, eixo="y", nome="muro"):
    """Desenho de pedras na face do muro (retângulos alternados 1 mm para fora), entre p0 e p1 ao longo do eixo."""
    objs = []
    fiada = 0.75
    nf = int(round((z1 - z0) / fiada))
    for j in range(nf):
        zb = z0 + j * (z1 - z0) / nf
        zt = zb + (z1 - z0) / nf
        off = 0.0 if j % 2 == 0 else 0.75
        u = p0 - off
        k = 0
        while u < p1:
            a, b = max(u + 0.04, p0 + 0.02), min(u + 1.5 - 0.04, p1 - 0.02)
            if b - a > 0.2:
                cor = ["cinza_claro", "concreto", "cinza", "concreto"][(k + j) % 4]
                if eixo == "y":
                    pts = [(a, normal_sinal, zb + 0.04), (b, normal_sinal, zb + 0.04), (b, normal_sinal, zt - 0.04),
                           (a, normal_sinal, zt - 0.04)]
                    objs.append((pts, cor))
                else:
                    pts = [(normal_sinal, a, zb + 0.04), (normal_sinal, b, zb + 0.04), (normal_sinal, b, zt - 0.04),
                           (normal_sinal, a, zt - 0.04)]
                    objs.append((pts, cor))
            u += 1.5
            k += 1
    m = ae.Malha()
    for pts, cor in objs:
        m.f([m.v(p) for p in pts], cor)
    ob = m.obj(nome)
    return ob


def muro_x(it, x0, x1, y_face, lado_baixo=-1, z_topo=Z_PLATO):
    """Muro de arrimo ao longo de x, com a face em y_face voltada para o lado baixo (lado_baixo = −1: −Y)."""
    yb = y_face
    yt = y_face - lado_baixo * E_MURO
    it.add(mb.caixa(x1 - x0, E_MURO, z_topo + 0.35 - cb.Z_FUNDO, x=(x0 + x1) / 2, y=(yb + yt) / 2, z=cb.Z_FUNDO,
                    cor="cinza_claro", bisel=0.0, liso=False))
    it.add(mb.caixa(x1 - x0, E_MURO + 0.16, 0.22, x=(x0 + x1) / 2, y=(yb + yt) / 2 + lado_baixo * 0.04,
                    z=z_topo + 0.3, cor="concreto_escuro", bisel=0.04, seg=2))
    m = face_muro(it, x0, x1, 0.0, z_topo + 0.25, yb + lado_baixo * 0.002)
    if lado_baixo > 0:
        mb.transforma(m, esc=(1, 1, 1))
    it.add(m)
    for x in [x0 + 1.2 + 3.0 * k for k in range(int((x1 - x0) / 3.0))]:  # drenos
        it.add(mb.cilindro(0.08, 0.06, x=x, y=yb + lado_baixo * 0.02, z=0.55, cor="grafite_escuro", eixo="y", seg=8,
                           bisel=0))
    return it


def muro_y(it, y0, y1, x_face, lado_baixo=-1, z_topo=Z_PLATO):
    xb = x_face
    xt = x_face - lado_baixo * E_MURO
    it.add(mb.caixa(E_MURO, y1 - y0, z_topo + 0.35 - cb.Z_FUNDO, x=(xb + xt) / 2, y=(y0 + y1) / 2, z=cb.Z_FUNDO,
                    cor="cinza_claro", bisel=0.0, liso=False))
    it.add(mb.caixa(E_MURO + 0.16, y1 - y0, 0.22, x=(xb + xt) / 2 + lado_baixo * 0.04, y=(y0 + y1) / 2,
                    z=z_topo + 0.3, cor="concreto_escuro", bisel=0.04, seg=2))
    it.add(face_muro(it, y0, y1, 0.0, z_topo + 0.25, xb + lado_baixo * 0.002, eixo="x"))
    for y in [y0 + 1.2 + 3.0 * k for k in range(int((y1 - y0) / 3.0))]:
        it.add(mb.cilindro(0.08, 0.06, x=xb + lado_baixo * 0.02, y=y, z=0.55, cor="grafite_escuro", eixo="x", seg=8,
                           bisel=0))
    return it


def hera(x, y, z_topo, n=3, seed=1):
    """Cascata de hera descendo do alto do muro."""
    rnd = random.Random(seed)
    objs = []
    for k in range(n):
        h = rnd.uniform(1.0, 2.4)
        objs.append(mb.superelipsoide(rnd.uniform(0.6, 1.1), 0.35, h, x=x + rnd.uniform(-0.5, 0.5), y=y,
                                      z=z_topo - h + 0.4, cor=rnd.choice(["folha", "folha_escura", "verde_medio"]),
                                      e=0.8, e_v=0.7, nu=10, nv=5))
    return mb.junta(objs, "hera")


def listras_topo(it, pol_ok, z):
    for kk in range(3):
        x0 = -H + 5 * kk + 2.5
        it.add(cr.poli(cb.quadrado(x0, pol_ok[0], x0 + 2.5, pol_ok[1]), z=z, cor="verde_claro", alt=0.002))


def p_plato_topo():
    it = mb.Item("plato_topo")
    it.add(ae.prisma([cb.quadrado(-H, -H, H, H)], cb.Z_FUNDO, Z_PLATO, "grama", lado="cinza_claro", nome="plato"))
    listras_topo(it, (-H, H), Z_PLATO)
    rnd = random.Random(4)
    for k in range(8):
        it.add(cr.tufo(rnd.uniform(-6.8, 6.8), rnd.uniform(-6.8, 6.8), z=Z_PLATO - 0.02))
    return it, dict(rotulo="Platô (topo)", grupo="plato", tags=["modular", "plato", "grama", "elevado"],
                    colisao=[((0, 0, cb.Z_FUNDO), (Q, Q, Z_PLATO - cb.Z_FUNDO))], extra={"z_topo": Z_PLATO})


def guarda_topo(pts):
    return ae.guarda_corpo([(p[0], p[1], Z_PLATO + 0.52) for p in pts], alt=0.9, passo=1.5, travessas=(0.45,),
                           cor="branco", fim=False)


def p_plato_borda():
    it = mb.Item("plato_borda")
    grama_topo(it, cb.quadrado(-H, -H, H, -E_MURO), 0.0, nome="grama_baixa")
    it.add(ae.prisma([cb.quadrado(-H, 0.0, H, H)], cb.Z_FUNDO, Z_PLATO, "grama", lado="cinza_claro", nome="plato"))
    muro_x(it, -H, H, -E_MURO, -1)
    listras_topo(it, (-H, -E_MURO - 0.05), 0.0)
    listras_topo(it, (0.0, H), Z_PLATO)
    it.add(guarda_topo([(-H + 0.1, -E_MURO / 2), (H - 0.1, -E_MURO / 2)]))
    it.add(hera(-3.5, -E_MURO - 0.12, Z_PLATO, seed=2), hera(4.2, -E_MURO - 0.12, Z_PLATO, n=2, seed=5))
    for x in (-6.0, 1.0, 6.2):
        it.add(ae.moita(x, 1.4, Z_PLATO, esc=0.8))
    col = [((0, (-H - E_MURO) / 2, cb.Z_FUNDO), (Q, H - E_MURO, -cb.Z_FUNDO)),
           ((0, H / 2 - E_MURO / 2, cb.Z_FUNDO), (Q, H + E_MURO, Z_PLATO - cb.Z_FUNDO)),
           ((0, -E_MURO / 2, Z_PLATO), (Q, E_MURO, 1.45))]
    return it, dict(rotulo="Platô com muro de arrimo (borda)", grupo="plato", tags=["modular", "plato", "muro", "elevado"],
                    colisao=col, dir_mini=DIR_PLATO, extra={"z_topo": Z_PLATO})


DIR_PLATO = (0.55, -1.0, 0.8)


def p_plato_canto(tipo):
    """ext: o alto é o quadrante +X +Y; int: o baixo é o quadrante −X −Y."""
    it = mb.Item(f"plato_canto_{tipo}")
    e = E_MURO
    if tipo == "ext":
        alto = [cb.quadrado(0.0, 0.0, H, H)]
        baixo = [[(-H, -H), (H, -H), (H, -e), (-e, -e), (-e, H), (-H, H)]]
        muro_x(it, -e, H, -e, -1)
        muro_y(it, 0.0, H, -e, -1)
        it.add(guarda_topo([(H - 0.1, -e / 2), (-e / 2, -e / 2), (-e / 2, H - 0.1)]))
        listras_topo(it, (-H, -e - 0.05), 0.0)
        for kk in range(3):
            x0 = -H + 5 * kk + 2.5
            if x0 >= 0:
                it.add(cr.poli(cb.quadrado(x0, 0.0, x0 + 2.5, H), z=Z_PLATO, cor="verde_claro", alt=0.002))
            if x0 + 2.5 <= -e:
                it.add(cr.poli(cb.quadrado(x0, -e, x0 + 2.5, H), z=0.0, cor="verde_claro", alt=0.002))
        it.add(hera(3.5, -e - 0.12, Z_PLATO, seed=7))
        col = [((0, 0, cb.Z_FUNDO), (Q, Q, -cb.Z_FUNDO)), ((H / 2 - e / 2, H / 2 - e / 2, 0), (H + e, H + e, Z_PLATO + 1.45))]
    else:
        alto = [[(-H, 0.0), (0.0, 0.0), (0.0, -H), (H, -H), (H, H), (-H, H)]]
        baixo = [cb.quadrado(-H, -H, -e, -e)]
        muro_x(it, -H, -e, -e, -1)
        muro_y(it, -H, -e, -e, -1)
        # canto do muro (pilar)
        it.add(mb.caixa(e, e, Z_PLATO + 0.35 - cb.Z_FUNDO, x=-e / 2, y=-e / 2, z=cb.Z_FUNDO, cor="cinza_claro", bisel=0,
                        liso=False))
        it.add(guarda_topo([(-H + 0.1, -e / 2), (-e / 2, -e / 2), (-e / 2, -H + 0.1)]))
        for kk in range(3):
            x0 = -H + 5 * kk + 2.5
            if x0 >= 0:
                it.add(cr.poli(cb.quadrado(x0, -H, x0 + 2.5, H), z=Z_PLATO, cor="verde_claro", alt=0.002))
            else:
                it.add(cr.poli(cb.quadrado(x0, 0.0, min(x0 + 2.5, 0.0) if x0 + 2.5 > 0 else x0 + 2.5, H), z=Z_PLATO,
                               cor="verde_claro", alt=0.002))
                if x0 + 2.5 <= -e:
                    it.add(cr.poli(cb.quadrado(x0, -H, x0 + 2.5, -e - 0.05), z=0.0, cor="verde_claro", alt=0.002))
        it.add(hera(-4.0, -e - 0.12, Z_PLATO, seed=9))
        col = [((-H / 2 - e / 2, -H / 2 - e / 2, cb.Z_FUNDO), (H - e, H - e, -cb.Z_FUNDO)),
               ((0, H / 2, cb.Z_FUNDO), (Q, H, Z_PLATO - cb.Z_FUNDO)),
               ((H / 2, -H / 2, cb.Z_FUNDO), (H, H, Z_PLATO - cb.Z_FUNDO))]
    for pol in alto:
        it.add(ae.prisma([pol], cb.Z_FUNDO, Z_PLATO, "grama", lado="cinza_claro", nome="plato"))
    for pol in baixo:
        it.add(ae.prisma([pol], cb.Z_FUNDO, 0.0, "grama", lado="concreto", nome="grama_baixa"))
    rot = "Platô (canto externo)" if tipo == "ext" else "Platô (canto interno)"
    return it, dict(rotulo=rot, grupo="plato", tags=["modular", "plato", "muro", "elevado"], colisao=col,
                    dir_mini=DIR_PLATO, extra={"z_topo": Z_PLATO})


def z_rampa(y):
    u = (y + H) / Q
    return Z_PLATO * u


def p_plato_rampa():
    """Rua (perfil cb.RUA) que sobe do chão (y = −7,5, z = 0) ao platô (y = +7,5, z = 3,75), com muros dos lados."""
    it = mb.Item("plato_rampa_rua")
    tmp = mb.Item("tmp")
    cb.rua_reta(tmp, cb.RUA)
    ob = mb.junta(tmp.partes, "rampa")
    # deforma: cada vértice sobe z_rampa(y) (subdivide antes em y para a laje acompanhar a rampa)
    import bmesh as _bm
    bm = _bm.new()
    bm.from_mesh(ob.data)
    for yc in [-H + 1.5 * k for k in range(1, 10)]:
        _bm.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, yc, 0), plane_no=(0, 1, 0))
    for v in bm.verts:
        v.co.z += z_rampa(v.co.y)
    bm.to_mesh(ob.data)
    bm.free()
    it.add(ob)
    # aterro debaixo da rampa
    perfil = [(-H, cb.Z_FUNDO), (H, cb.Z_FUNDO), (H, Z_PLATO + cb.Z_FUNDO)]
    aterro = mb.extrudado([(y, z) for y, z in perfil], Q - 0.02, x=-H + 0.01, cor="terra_seca", bisel=0, plano="yz",
                          liso=False)
    mb.transforma(aterro, loc=(0, 0, -0.001))
    it.add(aterro)
    # muros laterais: acompanham a rampa (+1,0 de parapeito) e seguram o platô do vizinho no trecho alto
    for sx in (-1, 1):
        x_in = sx * (H - 0.35)
        perfil = []
        for k in range(21):
            y = -H + Q * k / 20
            perfil.append((y, topo_muro_rampa(y)))
        pts = [(-H, cb.Z_FUNDO)] + perfil + [(H, cb.Z_FUNDO)]
        pts = mb._ccw(pts)
        muro = mb.extrudado(pts, 0.35, x=min(x_in, sx * H), cor="cinza_claro", bisel=0.0, plano="yz", liso=False)
        it.add(muro)
        cap = [(y, z) for y, z in perfil]
        cap = [(max(-H + 0.2, min(H - 0.2, y)), z) for y, z in cap]
        it.add(mb.tubo([(sx * (H - 0.2), y, z + 0.06) for y, z in cap], 0.17, cor="concreto_escuro", seg=4,
                       raio_curva=0.3))
        it.add(face_rampa(sx))
    for sx in (-1, 1):  # postes nos dois lados
        it.add(ae.poste(sx * 6.4, -2.0, z0=z_rampa(-2.0), ang=180 if sx > 0 else 0, braco=1.2))
    malha = rampa_colisao()
    it.colisao_malha(malha, "colisao_rampa")
    col = [((sx * (H - 0.175), 0, cb.Z_FUNDO), (0.35, Q, Z_PLATO + 0.4 - cb.Z_FUNDO)) for sx in (-1, 1)]
    return it, dict(rotulo="Rampa de rua para o platô", grupo="plato", tags=["modular", "plato", "rua", "rampa", "elevado"],
                    colisao=col, dir_mini=DIR_PLATO, extra={"z_baixo": 0.0, "z_alto": Z_PLATO, "perfil": "rua"})


def topo_muro_rampa(y):
    return max(z_rampa(y) + 1.0, Z_PLATO + 0.35 if y > -0.3 else 0.0)


def face_rampa(sx):
    """Desenho de pedras na face interna do muro da rampa (só os blocos inteiros entre a rampa e o topo)."""
    m = ae.Malha()
    x = sx * (H - 0.352)
    for j in range(7):
        zb = j * 0.75
        for k in range(11):
            y0 = -H + k * 1.5 - (0.75 if j % 2 else 0) + 0.04
            y1 = y0 + 1.42
            y0, y1 = max(y0, -H + 0.05), min(y1, H - 0.05)
            if y1 - y0 < 0.3:
                continue
            if zb + 0.04 < max(z_rampa(y0), z_rampa(y1)) + 0.05:
                continue
            if zb + 0.71 > min(topo_muro_rampa(y0), topo_muro_rampa(y1)) - 0.08:
                continue
            cor = ["cinza_claro", "concreto", "cinza", "concreto"][(j + k) % 4]
            pts = [(x, y0, zb + 0.04), (x, y1, zb + 0.04), (x, y1, zb + 0.71), (x, y0, zb + 0.71)]
            m.f([m.v(p) for p in pts], cor)
    return m.obj("face_muro")


def rampa_colisao():
    m = ae.Malha()
    w = H - 0.35
    a, b, c, d = m.v((-w, -H, 0.0)), m.v((w, -H, 0.0)), m.v((w, H, Z_PLATO)), m.v((-w, H, Z_PLATO))
    a2, b2, c2, d2 = (m.v((p.co.x, p.co.y, cb.Z_FUNDO)) for p in (a, b, c, d))
    m.f((a, b, c, d), "concreto")
    m.f((a2, d2, c2, b2), "concreto")
    m.f((a, a2, b2, b), "concreto")
    m.f((b, b2, c2, c), "concreto")
    m.f((c, c2, d2, d), "concreto")
    m.f((d, d2, a2, a), "concreto")
    return m.obj("colisao_rampa")


PECAS = [
    ("areia", p_areia),
    ("grama_areia_reta", lambda: p_grama_areia("reta")),
    ("grama_areia_canto_ext", lambda: p_grama_areia("ext")),
    ("grama_areia_canto_int", lambda: p_grama_areia("int")),
    ("costa_areia_reta", lambda: p_costa_areia("reta")),
    ("costa_areia_canto_ext", lambda: p_costa_areia("ext")),
    ("costa_areia_canto_int", lambda: p_costa_areia("int")),
    ("costa_areia_faixa", lambda: p_costa_areia("faixa")),
    ("costa_areia_ponta", lambda: p_costa_areia("ponta")),
    ("costa_areia_faixa_base", lambda: p_costa_areia("base")),
    ("costa_rocha_reta", lambda: p_costa_rocha("reta")),
    ("costa_rocha_canto_ext", lambda: p_costa_rocha("ext")),
    ("costa_rocha_canto_int", lambda: p_costa_rocha("int")),
    ("mar", lambda: p_mar(1)),
    ("mar_grande", lambda: p_mar(4)),
    ("plato_topo", p_plato_topo),
    ("plato_borda", p_plato_borda),
    ("plato_canto_ext", lambda: p_plato_canto("ext")),
    ("plato_canto_int", lambda: p_plato_canto("int")),
    ("plato_rampa_rua", p_plato_rampa),
]
