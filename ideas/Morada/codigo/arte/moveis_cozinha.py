"""Móveis da cozinha do Morada (categoria cozinha_moveis): módulos que se encaixam, organizados por linha (estilo) e por
tipo de módulo. Cada tipo é uma função que recebe o estilo (as cores e o jeito da linha); as variações de cor são o
mesmo estilo com outras cores, no mesmo grupo.

Medidas: larguras 0,40 / 0,60 / 0,80 / 0,90 / 1,20 m, fundo 0,60 m, bancada a 0,90 m; armário de parede com 0,35 m de
fundo (fixacao "parede", instalado a 1,45 m). O tampo ocupa a largura exata do módulo (1 mm de folga de cada lado), então
os módulos encostam um no outro sem sobrepor. Os cantos em L medem 0,90 × 0,90 e fecham com um módulo à esquerda (pelo
fundo) e outro à frente (girado 90°).

Uso:
  blender-venv/bin/python -I morada-art/moveis_cozinha.py -- <saida> [linha=<nome>] [grupo=<nome>] [<id> ...] [lista]
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402,F401
import bmesh  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import moveis_base as mb  # noqa: E402

V = Vector
ARGS = sys.argv[sys.argv.index("--") + 1:]
SAIDA = ARGS[0]
FILTROS = ARGS[1:]
CAT = "cozinha_moveis"
GAP = 0.003  # folga entre frentes
BANCADA = 0.90


# =====================================================================================================================
# Geometria auxiliar
# =====================================================================================================================
def _dentro(p, poly):
    x, y = p[0], p[1]
    d = False
    for (x1, y1), (x2, y2) in zip(poly, poly[1:] + poly[:1]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1 + 1e-12) + x1:
            d = not d
    return d


def placa(ext, furos=(), esp=0.04, x=0.0, y=0.0, z=0.0, plano="xy", cor="branco", bisel=0.01, seg=3, nome="placa",
          mat="atlas"):
    """Placa de contorno qualquer com furos (tampo com cuba, casco de armário com a abertura). plano como extrudado."""
    bm = bmesh.new()
    edges = []
    furos = [list(f) for f in furos]
    for loop in [list(ext)] + furos:
        loop = mb._ccw(loop)
        vs = [bm.verts.new((px, py, 0.0)) for px, py in loop]
        for a_, b_ in zip(vs, vs[1:] + vs[:1]):
            edges.append(bm.edges.new((a_, b_)))
    res = bmesh.ops.triangle_fill(bm, use_beauty=True, use_dissolve=False, edges=edges)
    fs = [f for f in res["geom"] if isinstance(f, bmesh.types.BMFace)]
    lixo = [f for f in fs if any(_dentro(f.calc_center_median(), h) for h in furos)]
    if lixo:
        bmesh.ops.delete(bm, geom=lixo, context="FACES_ONLY")
    r = bmesh.ops.extrude_face_region(bm, geom=bm.faces[:])
    for v in [e for e in r["geom"] if isinstance(e, bmesh.types.BMVert)]:
        v.co.z += esp
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    mb._bevel(bm, min(bisel, esp / 2.1), seg, [e for e in bm.edges if not e.is_wire and len(e.link_faces) == 2 and
                                               e.link_faces[0].normal.dot(e.link_faces[1].normal) < 0.85])
    if plano == "xy":
        M = Matrix.Translation((x, y, z))
    elif plano == "xz":
        M = Matrix.Translation((x, y + esp, z)) @ Matrix.Rotation(math.pi / 2, 4, "X")
    else:
        M = Matrix.Translation((x, y, z)) @ Matrix(((0, 0, 1, 0), (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
    bm.transform(M)
    return mb._obj(nome, bm, cor, mat)


def loft(aneis, cor="branco", fecha_ini=False, fecha_fim=False, secao_fechada=False, nome="loft", angulo=50,
         mat="atlas"):
    """Superfície por anéis 3D (todos com o mesmo número de pontos). secao_fechada liga o último anel ao primeiro."""
    bm = bmesh.new()
    rs = [[bm.verts.new(p) for p in an] for an in aneis]
    if secao_fechada:
        rs.append(rs[0])
    n = len(aneis[0])
    for A, B in zip(rs, rs[1:]):
        for i in range(n):
            j = (i + 1) % n
            try:
                bm.faces.new((A[i], A[j], B[j], B[i]))
            except ValueError:
                pass
    for flag, anel in ((fecha_ini, rs[0]), (fecha_fim, rs[-1])):
        if flag:
            c = sum((v.co for v in anel), V()) / n
            cv = bm.verts.new(c)
            for i in range(n):
                bm.faces.new((anel[i], anel[(i + 1) % n], cv))
    m = mb._obj(nome, bm, cor, mat, angulo=angulo)
    return m


def rr(l, p, r, seg=6, cx=0.0, cy=0.0):
    return [(cx + a, cy + b) for a, b in mb.ret_arredondado(l, p, max(r, 0.002), seg)]


def ret_xz(l, a, r, seg=6, cz=None):
    """Contorno no plano da frente (x, z) de l × a, base em z = 0."""
    return [(px, pz + a / 2) for px, pz in mb.ret_arredondado(l, a, max(r, 0.002), seg)]


def reamostra(pts, n):
    """n pontos igualmente espaçados num contorno fechado."""
    P = [V((p[0], p[1])) for p in pts]
    seg = [(a, b, (b - a).length) for a, b in zip(P, P[1:] + P[:1])]
    tot = sum(s[2] for s in seg)
    out = []
    k = 0
    acc = 0.0
    for i in range(n):
        alvo = tot * i / n
        while acc + seg[k][2] < alvo:
            acc += seg[k][2]
            k += 1
        a, b, L = seg[k]
        t = (alvo - acc) / L if L else 0
        q = a.lerp(b, t)
        out.append((q.x, q.y))
    return out


def capsula(l, p, a, x=0.0, y=0.0, z=0.0, cor="amarelo"):
    return mb.caixa(l, p, a, x=x, y=y, z=z, cor=cor, bisel=min(l, p, a) / 2.05, seg=3)


def gira(objs, ang, centro=(0, 0, 0)):
    c = V(centro)
    M = Matrix.Translation(c) @ Matrix.Rotation(math.radians(ang), 4, "Z") @ Matrix.Translation(-c)
    for o in (objs if isinstance(objs, (list, tuple)) else [objs]):
        o.data.transform(M)
    return objs


def espelha(objs):
    for o in objs:
        o.data.transform(Matrix.Diagonal((-1, 1, 1, 1)))
        o.data.flip_normals()
    return objs


def sub_transforma(it, marca, M):
    """Aplica M (rotação em Z + translação) às partes, interativos e slots criados depois da marca."""
    n_p, n_i, n_s = marca
    R = M.to_3x3()
    R4 = R.to_4x4()
    for o in it.partes[n_p:]:
        o.data.transform(M)
    for ob, d in it.interativos[n_i:]:
        ob.data.transform(R4)
        ob.location = M @ ob.location
        for k in ("eixo", "direcao"):
            if k in d:
                g = d[k]
                b = R @ V((g[0], -g[2], g[1]))
                d[k] = mb._gl(b)
    novos = []
    for nome, c, t, pai in it.slots[n_s:]:
        c2 = M @ V(c)
        t2 = (t[1], t[0], t[2]) if abs(R[0][0]) < 0.5 else tuple(t)
        novos.append((nome, tuple(c2), t2, pai))
    it.slots[n_s:] = novos


def marca(it):
    return (len(it.partes), len(it.interativos), len(it.slots))


# =====================================================================================================================
# Estilos (linhas)
# =====================================================================================================================
class Estilo(dict):
    __getattr__ = dict.get

    def com(self, **k):
        e = Estilo(self)
        e.update(k)
        return e


BASE = Estilo(
    w=0.03, sobre=0.008, recuo=0.004, r_casco=0.012, r_furo=0.008, bisel_casco=0.008, ef=0.022, bal=0.012,
    hp=0.07, te=0.045, tampo_bisel=0.014, pes="bola", r_pe=0.028, frente="lisa", bisel_porta=0.008,
    pux="barrinha", pux_dx=0.045, pux_dz=0.09, pux_tam=1.0, cuba="ret", cuba_cor="porcelana", torneira="pescoco",
    torneira_cor="cromo", forno="grafite", forno_pux="metal_claro", cooktop="grafite_escuro", grade="ferro",
    botao="metal_claro", rodape_recuo=0.03, parede_cap=None, prat="",
)

ESTILOS = {
    "moderna": BASE.com(
        rot="moderna", corpo="amarelo", interno="amarelo", gaveta_int="amarelo_claro", tampo="laranja", porta="azul",
        puxador="amarelo", pe="laranja_escuro", w=0.042, sobre=0.006, frente="lisa", bisel_porta=0.008,
        pux="barrinha", te=0.05, tampo_bisel=0.016, pes="bola", hp=0.075, cuba="ret", cuba_cor="porcelana",
        torneira="pescoco", torneira_cor="grafite_escuro", forno="grafite", cooktop="grafite_escuro",
        parede_cap="tampo", vidro_cor="azul", prat="tampo", prat_suporte="oculto"),
    "grafite": BASE.com(
        rot="grafite", corpo="grafite", interno="grafite_escuro", gaveta_int="cinza_medio", tampo="cinza_azulado",
        porta="turquesa", porta2="vermelho", puxador="amarelo", pe="amarelo_escuro", w=0.026, sobre=0.012,
        frente="moldura", margem=0.034, pux="barra", te=0.04, tampo_bisel=0.01, pes="trap", hp=0.07, bal=0.008,
        cuba="redonda", cuba_cor="porcelana_azul", torneira="pescoco", torneira_cor="amarelo", forno="grafite_escuro",
        cooktop="cinza_azulado", vidro_cor="vermelho", parede_cap="tampo", prat="tampo", r_casco=0.01),
    "classica": BASE.com(
        rot="clássica", corpo="terracota", interno="terracota", gaveta_int="amarelo_claro", tampo="azul_acinzentado",
        porta="amarelo", porta2="amarelo_claro", puxador="laranja", pe="amarelo_escuro", w=0.036, sobre=0.012,
        frente="recorte", pux="bola", pux_tam=0.8, pux_dx=0.04, pux_dz=0.05, te=0.055, tampo_bisel=0.024,
        pes="bloco", hp=0.07, bal=0.016, cuba="redonda", cuba_cor="porcelana", torneira="pescoco",
        torneira_cor="preto", forno="cinza_azulado", forno_pux="amarelo", botao="amarelo", cooktop="cinza_azulado",
        vidro_cor="amarelo", parede_cap="tampo", prat="porta2"),
    "campestre": BASE.com(
        rot="campestre", corpo="terracota_clara", interno="laranja_claro", gaveta_int="laranja_claro",
        tampo="terracota_clara", toalha="vermelho", porta="laranja_claro", porta2="terracota_clara",
        puxador="laranja_escuro", pe="pessego", w=0.05, r_casco=0.055, r_furo=0.02, sobre=-0.004, bisel_casco=0.012,
        frente="moldura", margem=0.03, bisel_porta=0.012, pux="bola", pux_tam=1.3, pux_dx=0.05, pux_dz=0.1,
        te=0.04, tampo_bisel=0.016, pes="bun", hp=0.06, bal=0.02, cuba="louca", cuba_cor="azul_claro",
        torneira="cruzeta", torneira_cor="ouro", forno="terracota", forno_pux="laranja_escuro", botao="laranja_escuro",
        cooktop="terracota", grade="terracota_escura", vidro_cor="laranja_claro", prat="tampo"),
    "colonial": BASE.com(
        rot="colonial", corpo="turquesa_escuro", lateral="amarelo", faixa="amarelo", interno="turquesa_escuro",
        gaveta_int="amarelo_claro", tampo="marrom", rodape="marrom", porta="amarelo", porta2="turquesa_escuro",
        puxador="laranja", w=0.05, sobre=-0.006, frente="colonial", pux="argola", pux_dx=0.05, pux_dz=0.07, te=0.05,
        tampo_bisel=0.014, pes="rodape", hp=0.075, rodape_recuo=-0.006, cuba="louca", cuba_cor="louca",
        torneira="parede", torneira_cor="metal_escuro", forno="grafite", forno_pux="laranja", botao="laranja",
        cooktop="grafite_escuro", vidro_cor="amarelo", trelica=True, parede_cap="colonial", prat="tampo",
        bisel_porta=0.01),
    "verde": BASE.com(
        rot="verde", corpo="verde_medio", interno="verde_medio", gaveta_int="menta", tampo="branco", rodape="laranja",
        porta="verde_medio", puxador="amarelo", w=0.024, sobre=0.016, frente="lisa", bisel_porta=0.02, pux="bola",
        pux_tam=0.85, pux_dx=0.045, pux_dz=0.065, te=0.075, tampo_bisel=0.028, pes="rodape", hp=0.075,
        rodape_recuo=0.008, bal=0.022, cuba="louca", cuba_cor="porcelana_azul", torneira="pescoco_cruzeta",
        torneira_cor="amarelo", forno="branco_gelo", forno_pux="verde_medio", botao="verde_escuro",
        cooktop="branco_gelo", vidro_cor="verde_medio", parede_cap="tampo", prat="rodape", r_casco=0.02),
    "creme": BASE.com(
        rot="creme", corpo="creme", interno="amarelo_claro", gaveta_int="creme_claro", tampo="madeira_clara",
        rodape="madeira_mel", porta="verde_medio", puxador="amarelo", w=0.032, sobre=0.024, r_casco=0.03,
        frente="lisa", bisel_porta=0.018, pux="bola", pux_tam=0.85, pux_dx=0.04, pux_dz=0.06, te=0.045,
        tampo_bisel=0.016, pes="rodape", hp=0.07, rodape_recuo=0.035, cuba="ret", cuba_cor="cromo",
        torneira="pescoco", torneira_cor="cromo", forno="creme_claro", forno_pux="verde_medio", botao="verde_medio",
        cooktop="grafite_escuro", vidro_cor="verde_medio", parede_cap="corpo", prat="tampo"),
}

# variações de cor por linha: (sufixo do id, rótulo da cor, cores trocadas)
CORES_LINHA = {
    "moderna": [("coral", "coral", dict(corpo="creme", interno="creme", gaveta_int="creme_claro", porta="turquesa",
                                        tampo="vermelho_claro", puxador="amarelo", pe="turquesa_escuro",
                                        vidro_cor="turquesa", torneira_cor="cromo")),
                ("menta", "menta", dict(corpo="menta", interno="menta", gaveta_int="branco", porta="rosa",
                                        tampo="branco", puxador="rosa_escuro", pe="rosa_escuro", vidro_cor="rosa",
                                        torneira_cor="cromo"))],
    "grafite": [("noite", "noite", dict(corpo="azul_noite", interno="azul_marinho", tampo="azul_marinho",
                                        porta="creme", porta2="laranja", puxador="amarelo", pe="laranja",
                                        vidro_cor="laranja", torneira_cor="cromo")),
                ("floresta", "floresta", dict(corpo="verde_floresta", interno="verde_escuro", tampo="grafite",
                                              porta="menta", porta2="rosa", puxador="amarelo", pe="amarelo",
                                              vidro_cor="rosa"))],
    "classica": [("vinho", "vinho", dict(corpo="vinho", interno="vinho", tampo="bege", porta="rosa_claro",
                                         porta2="branco", puxador="ouro", pe="rosa_bebe", vidro_cor="rosa_claro",
                                         forno="vinho", forno_pux="ouro", botao="ouro", torneira_cor="ouro")),
                 ("azul", "azul", dict(corpo="azul_acinzentado", interno="azul_acinzentado", tampo="creme_claro",
                                       porta="branco", porta2="azul_bebe", puxador="azul_escuro", pe="branco",
                                       vidro_cor="branco", forno="azul_escuro", forno_pux="cromo", botao="cromo",
                                       torneira_cor="cromo", cuba_cor="louca"))],
    "campestre": [("azul", "azul", dict(corpo="amarelo_claro", interno="creme", gaveta_int="creme", tampo="amarelo_claro",
                                        toalha="azul", porta="creme", porta2="amarelo_claro", puxador="azul_medio",
                                        pe="branco", forno="azul", forno_pux="azul_medio", botao="azul_medio",
                                        cooktop="amarelo_escuro", grade="azul_medio", vidro_cor="creme",
                                        cuba_cor="louca", torneira_cor="cromo")),
                  ("menta", "menta", dict(corpo="menta", interno="menta", gaveta_int="branco", tampo="menta",
                                          toalha="rosa", porta="branco", porta2="menta", puxador="rosa_escuro",
                                          pe="rosa_bebe", forno="verde_agua", forno_pux="rosa_escuro",
                                          botao="rosa_escuro", cooktop="verde_agua", grade="verde_escuro",
                                          vidro_cor="branco", cuba_cor="rosa_claro"))],
    "colonial": [("mata", "mata", dict(tampo="verde_medio", lateral="marrom", faixa="amarelo", rodape="marrom")),
                 ("rosa", "rosa", dict(corpo="azul_medio", lateral="branco", faixa="rosa", interno="azul_medio",
                                       tampo="madeira_escura", rodape="madeira_escura", porta="rosa_claro",
                                       porta2="azul_medio", puxador="ouro", vidro_cor="rosa_claro",
                                       forno_pux="ouro", botao="ouro"))],
    "verde": [("rosa", "rosa", dict(corpo="rosa", interno="rosa", gaveta_int="rosa_claro", porta="rosa",
                                    tampo="creme_claro", rodape="verde_agua", puxador="amarelo", vidro_cor="rosa",
                                    forno_pux="rosa", botao="rosa_escuro", cuba_cor="louca")),
              ("azul", "azul", dict(corpo="azul_celeste", interno="azul_celeste", gaveta_int="azul_bebe",
                                    porta="azul_celeste", tampo="branco", rodape="amarelo", puxador="branco",
                                    vidro_cor="azul_celeste", forno_pux="azul_celeste", botao="azul_medio",
                                    torneira_cor="cromo"))],
    "creme": [("azul", "azul", dict(porta="azul_acinzentado", puxador="latao", vidro_cor="azul_acinzentado",
                                    forno_pux="azul_acinzentado", botao="azul_acinzentado", torneira_cor="latao")),
              ("rosa", "rosa", dict(porta="rosa", puxador="ouro", vidro_cor="rosa", tampo="branco", rodape="rosa_escuro",
                                    forno_pux="rosa", botao="rosa_escuro", torneira_cor="ouro"))],
}


def cor(E, k):
    """Resolve uma chave de cor do estilo (as chaves podem apontar para outra chave, como parede_cap="tampo")."""
    v = E.get(k) or k
    return E.get(v) or v if v in ("tampo", "corpo", "porta", "porta2", "rodape", "interno") else v


# =====================================================================================================================
# Frentes, puxadores, pés
# =====================================================================================================================
def frente_porta(E, l, a, vidro=False):
    if vidro:
        c = cor(E, E.vidro_cor or E.porta)
        m = min(0.05, min(l, a) * 0.16)
        if E.trelica:
            return mb.frente(l, a, esp=E.ef, estilo="trelica", cor=c, cor2=c, margem=m, bisel=E.bisel_porta)
        return mb.frente(l, a, esp=E.ef, estilo="vidro", cor=c, cor2=c, margem=m, bisel=E.bisel_porta)
    f = E.frente
    if f == "lisa":
        return mb.frente(l, a, esp=E.ef, estilo="lisa", cor=E.porta, bisel=E.bisel_porta)
    if f == "moldura":
        m = min(E.margem or 0.035, min(l, a) * 0.22)
        return mb.frente(l, a, esp=E.ef, estilo="moldura", cor=E.porta, cor2=E.porta2, margem=m, bisel=E.bisel_porta)
    if f == "recorte":
        m = min(0.055, min(l, a) * 0.17)
        return mb.frente(l, a, esp=E.ef, estilo="recorte", cor=E.porta, cor2=E.porta2, margem=m, recorte="ondas",
                         bisel=E.bisel_porta)
    if f == "colonial":
        base = mb.frente(l, a, esp=E.ef, estilo="lisa", cor=E.porta, bisel=E.bisel_porta)
        m = min(0.04, min(l, a) * 0.2)
        r = min(0.025, (min(l, a) - 2 * m) * 0.4)
        ext = ret_xz(l - 2 * m, a - 2 * m, r, 5)
        dentro = ret_xz(l - 2 * m - 0.016, a - 2 * m - 0.016, max(0.004, r - 0.008), 5)
        dentro = [(px, pz + 0.008) for px, pz in dentro]
        anel = placa(ext, [dentro], esp=0.006, y=-E.ef - 0.004, z=m, plano="xz", cor=E.porta2, bisel=0.0025, seg=2)
        return mb.junta([base, anel], "frente")
    raise ValueError(f)


def face_y(E):
    """Quanto a face onde vai o puxador fica à frente do plano do corpo."""
    if E.frente == "moldura":
        return E.ef + E.ef * 0.35 - 0.002
    if E.frente == "colonial":
        return E.ef + 0.0
    return E.ef


def puxador(E, x, y, z, vertical=True, tam=None):
    """y = plano da face da frente (o puxador sai para −Y)."""
    t = E.pux
    s = tam or E.pux_tam
    c = E.puxador
    if t in ("barrinha", "barra"):
        L = (0.075 if t == "barrinha" else 0.095) * s
        g = (0.019 if t == "barrinha" else 0.017) * s
        if vertical:
            return capsula(g, g + 0.002, L, x=x, y=y - g / 2 + 0.002, z=z - L / 2, cor=c)
        return capsula(L, g + 0.002, g, x=x, y=y - g / 2 + 0.002, z=z - g / 2, cor=c)
    if t == "bola":
        return mb.puxador("bola", x=x, y=y + 0.002, z=z, cor=c, tam=s)
    if t == "argola":
        r = 0.02 * s
        pts = [(x + r * math.cos(2 * math.pi * k / 16), y - 0.012, z - r + r * math.sin(2 * math.pi * k / 16))
               for k in range(16)]
        anel = mb.tubo(pts, 0.0042 * s, cor=c, raio_curva=0, seg=8, fechado=True, nome="argola")
        base = mb.cilindro(0.011 * s, 0.014, x=x, y=y - 0.005, z=z, cor=c, eixo="y", seg=12, bisel=0.003)
        return mb.junta([anel, base], "puxador")
    raise ValueError(t)


def pe_unico(E, x, y, a):
    t = E.pes
    c = E.pe
    r = E.r_pe
    if t == "bola":
        return mb.superelipsoide(2 * r, 2 * r, a, x=x, y=y, z=0, cor=c, e=0.8, e_v=0.62, nu=14, nv=8, nome="pe")
    if t == "bun":
        return mb.superelipsoide(2.6 * r, 2.6 * r, a, x=x, y=y, z=0, cor=c, e=0.9, e_v=0.55, nu=14, nv=8, nome="pe")
    if t == "trap":
        o = mb.cilindro(r * 0.72 * 1.414, a, x=0, y=0, z=0, cor=c, r2=r * 1.414, seg=4, bisel=0.006, nome="pe")
        mb.transforma(o, rot=("Z", 45))
        mb.transforma(o, loc=(x, y, 0))
        return o
    if t == "bloco":
        return mb.caixa(1.8 * r, 1.8 * r, a, x=x, y=y, z=0, cor=c, bisel=0.008, nome="pe")
    raise ValueError(t)


def pes(E, contorno, pontos):
    """Pés (nos pontos) ou rodapé (contorno do corpo encolhido). Altura E.hp (+2 mm entrando no corpo)."""
    a = E.hp + 0.002
    if E.pes == "rodape":
        k = E.rodape_recuo
        c = encolhe(contorno, k)
        return [placa(c, esp=a, cor=E.rodape, bisel=0.006)]
    return [pe_unico(E, x, y, a) for x, y in pontos]


def encolhe(pts, k):
    """Desloca um contorno (anti-horário, convexo por partes) para dentro por k (aproximação pelas bissetrizes)."""
    pts = mb._ccw(list(pts))
    n = len(pts)
    out = []
    for i in range(n):
        p0, p1, p2 = V(pts[i - 1]), V(pts[i]), V(pts[(i + 1) % n])
        d1 = (p1 - p0).normalized()
        d2 = (p2 - p1).normalized()
        n1 = V((-d1.y, d1.x))
        n2 = V((-d2.y, d2.x))
        b = (n1 + n2)
        if b.length < 1e-6:
            b = n1
        b.normalize()
        cs = max(0.3, b.dot(n1))
        q = p1 + b * (k / cs)
        out.append((q.x, q.y))
    return out


# =====================================================================================================================
# Corpo e células (portas, gavetas, nichos, forno)
# =====================================================================================================================
def arredonda_fechado(pts, raio, n=6):
    m = ((pts[-1][0] + pts[0][0]) / 2, (pts[-1][1] + pts[0][1]) / 2)
    out = mb._arredonda_cantos([m] + list(pts) + [m], raio, n)
    return [(p.x, p.y) for p in out[:-1]]


def casco(E, Lc, Hc, Pc, x=0.0, yb=0.0, zb=0.0, w=None, r=None, cor_=None, topo=True):
    """Corpo oco em tubo (aberto na frente e atrás), cantos boleados, sem emenda. topo=False: em U (aberto em cima,
    para a cuba de embutir passar), com travessas na frente e atrás logo abaixo do tampo."""
    w = E.w if w is None else w
    r = E.r_casco if r is None else r
    if topo:
        ext = ret_xz(Lc, Hc, r, 6)
        fr = [(px, pz + w) for px, pz in ret_xz(Lc - 2 * w, Hc - 2 * w, E.r_furo, 3)]
        ob = placa(ext, [fr], esp=Pc, x=x, y=yb, z=zb, plano="xz", cor=cor_ or E.corpo, bisel=E.bisel_casco)
    else:
        a, b = Lc / 2, Lc / 2 - w
        u = [(-a, 0), (a, 0), (a, Hc), (b, Hc), (b, w), (-b, w), (-b, Hc), (-a, Hc)]
        u = arredonda_fechado(u, max(r, 0.006), 5)
        ob = placa(u, [], esp=Pc, x=x, y=yb, z=zb, plano="xz", cor=cor_ or E.corpo, bisel=E.bisel_casco)
        t = [mb.caixa(2 * b + 0.004, 0.06, w, x=x, y=yb + 0.03 + 0.001, z=zb + Hc - w, cor=cor_ or E.corpo,
                      bisel=0.004),
             mb.caixa(2 * b + 0.004, 0.06, w, x=x, y=yb + Pc - 0.03 - 0.001, z=zb + Hc - w, cor=cor_ or E.corpo,
                      bisel=0.004)]
        ob = mb.junta([ob] + t, "casco")
    if E.lateral:
        mb.pinta_onde(ob, E.lateral, lambda c, n: abs(n.x) > 0.7 and abs(c.x - x) > Lc / 2 - 0.004)
    return ob


def fundo_painel(E, Lc, Hc, yfundo, zb, x=0.0, w=None):
    w = E.w if w is None else w
    return mb.caixa(Lc - 2 * w + 0.006, 0.014, Hc - 2 * w + 0.006, x=x, y=yfundo - 0.008, z=zb + w - 0.003,
                    cor=E.interno or E.corpo, bisel=0.003)


class Cx:
    """Contexto de uma face com células: plano da frente yb, profundidade útil Pc, parede (puxadores embaixo)."""

    def __init__(self, E, it, yb, Pc, parede=False, pia=False, alto=False):
        self.E, self.it, self.yb, self.Pc, self.parede, self.pia, self.alto = E, it, yb, Pc, parede, pia, alto
        self.n = 0


def celulas(cx, x0, x1, z0, z1, cols, td=0.018):
    """cols: [(fração da largura, [(tipo, fração da altura, {opções}), ... de cima para baixo]), ...]."""
    E, it = cx.E, cx.it
    W, H = x1 - x0, z1 - z0
    nc = len(cols)
    lw = W - td * (nc - 1)
    xc = x0
    yi = cx.yb + 0.003
    pi_ = cx.Pc - 0.003
    for k, (fr, rows) in enumerate(cols):
        w = lw * fr
        a0, a1 = xc, xc + w
        if k < nc - 1:
            it.add(mb.caixa(td, pi_, H + 0.004, x=a1 + td / 2, y=yi + pi_ / 2, z=z0 - 0.002, cor=E.interno or E.corpo,
                            bisel=0.003))
        nr = len(rows)
        lh = H - td * (nr - 1)
        zc = z1
        for j, row in enumerate(rows):
            tipo, fz = row[0], row[1]
            op = row[2] if len(row) > 2 else {}
            h = lh * fz
            b1, b0 = zc, zc - h
            if j < nr - 1:
                it.add(mb.caixa(w + 0.004, pi_, td, x=(a0 + a1) / 2, y=yi + pi_ / 2, z=b0 - td,
                                cor=E.interno or E.corpo, bisel=0.003))
            meio = td / 2 - GAP / 2
            e = (E.sobre if k == 0 else meio, E.sobre if k == nc - 1 else meio,
                 E.sobre if j == nr - 1 else meio, E.sobre if j == 0 else meio)
            celula(cx, tipo, a0, a1, b0, b1, e, op, (k, nc))
            zc = b0 - td
        xc = a1 + td


def celula(cx, tipo, x0, x1, z0, z1, e, op, pos):
    E, it, yb, Pc = cx.E, cx.it, cx.yb, cx.Pc
    cx.n += 1
    n = cx.n
    el, er, eb, et = e
    fx0, fx1, fz0, fz1 = x0 - el, x1 + er, z0 - eb, z1 + et
    l, a = fx1 - fx0, fz1 - fz0
    xm = (fx0 + fx1) / 2
    yf = yb - 0.001
    yface = yf - face_y(E)
    ym = yb + Pc / 2
    cw = x1 - x0
    if tipo in ("porta", "portas2", "vidro", "vidro2"):
        nf = 2 if tipo.endswith("2") else 1
        vidro = tipo.startswith("vidro")
        lw = (l - GAP) / 2 if nf == 2 else l
        for i in range(nf):
            if nf == 2:
                lado = "esq" if i == 0 else "dir"
                xc = fx0 + lw / 2 if i == 0 else fx1 - lw / 2
            else:
                lado = op.get("lado") or ("dir" if (pos[1] > 1 and pos[0] == pos[1] - 1) else "esq")
                xc = xm
            fr = frente_porta(E, lw, a, vidro)
            mb.transforma(fr, loc=(xc, yf, fz0))
            sx = 1 if lado == "esq" else -1
            px_x = xc + sx * (lw / 2 - E.pux_dx)
            if cx.parede:
                pz = fz0 + E.pux_dz
            elif cx.alto:
                pz = op.get("pux_z", fz0 + E.pux_dz if fz0 > 1.2 else fz1 - E.pux_dz)
            else:
                pz = fz1 - E.pux_dz
            pz = min(max(pz, fz0 + 0.05), fz1 - 0.05)
            pu = puxador(E, px_x, yface, pz, vertical=True)
            dob = (xc - sx * lw / 2, yf - E.ef / 2, fz0)
            it.porta([fr, pu], dobradica=dob, lado=lado)
        h = z1 - z0
        prat = op.get("prat", 0 if cx.pia or h < 0.32 else (2 if h > 0.95 else 1))
        alturas = [z0 + h * (q + 1) / (prat + 1) for q in range(prat)]
        for zp in alturas:
            it.add(mb.caixa(cw + 0.004, Pc - 0.02, 0.016, x=(x0 + x1) / 2, y=yb + 0.006 + (Pc - 0.02) / 2, z=zp - 0.008,
                            cor=E.interno or E.corpo, bisel=0.003))
        niveis = [z0] + [zp + 0.008 for zp in alturas]
        topos = [zp - 0.008 for zp in alturas] + [z1]
        for q, (zz, zt) in enumerate(zip(niveis, topos)):
            it.slot(f"{n}_{q}", ((x0 + x1) / 2, ym, zz), (cw - 0.01, Pc - 0.03, zt - zz))
    elif tipo == "gaveta":
        fr = frente_porta(E, l, a) if E.frente != "colonial" else frente_porta(E, l, a)
        mb.transforma(fr, loc=(xm, yf, fz0))
        pu = puxador(E, xm, yface, fz0 + a / 2 if a < 0.3 else fz1 - 0.07, vertical=False)
        it.gaveta(cw - 0.016, Pc - 0.04, (z1 - z0) - 0.03, [fr, pu], x=(x0 + x1) / 2, y_frente=yf, z=z0 + 0.008,
                  cor=E.gaveta_int or E.interno, esp=0.012)
    elif tipo == "nicho":
        h = z1 - z0
        prat = op.get("prat", 1 if h > 0.3 else 0)
        alturas = [z0 + h * (q + 1) / (prat + 1) for q in range(prat)]
        cpr = cor(E, E.prat) if E.prat else (E.interno or E.corpo)
        for zp in alturas:
            it.add(mb.caixa(cw + 0.004, Pc - 0.01, 0.02, x=(x0 + x1) / 2, y=yb + 0.004 + (Pc - 0.01) / 2, z=zp - 0.01,
                            cor=cpr, bisel=0.005))
        niveis = [z0] + [zp + 0.01 for zp in alturas]
        topos = [zp - 0.01 for zp in alturas] + [z1]
        for q, (zz, zt) in enumerate(zip(niveis, topos)):
            it.slot(f"nicho_{n}_{q}", ((x0 + x1) / 2, ym, zz), (cw - 0.01, Pc - 0.02, zt - zz))
    elif tipo == "forno":
        forno(cx, x0, x1, z0, z1, fx0, fx1, fz0, fz1, n)
    elif tipo == "painel":
        it.add(mb.caixa(l, E.ef, a, x=xm, y=yf - E.ef / 2, z=fz0, cor=E.forno, bisel=0.006))
        nb = max(2, min(5, int(l / 0.1)))
        for i in range(nb):
            bx = fx0 + l * (i + 0.5) / nb
            it.add(mb.cilindro(0.019, 0.018, x=bx, y=yf - E.ef - 0.008, z=fz0 + a / 2, cor=E.botao, eixo="y", seg=12,
                               bisel=0.004))
            it.add(mb.caixa(0.005, 0.006, 0.016, x=bx, y=yf - E.ef - 0.018, z=fz0 + a / 2 + 0.002, cor=E.forno,
                            bisel=0.002))
    elif tipo == "vazio":
        pass
    else:
        raise ValueError(tipo)


def cavidade(l, p, a, x, y, z, esp=0.012, c="grafite_escuro"):
    """Caixa aberta na frente, leve (forno por dentro)."""
    k = dict(cor=c, bisel=0.002, seg=1)
    ps = [mb.caixa(esp, p, a, x=x - l / 2 + esp / 2, y=y, z=z, **k), mb.caixa(esp, p, a, x=x + l / 2 - esp / 2, y=y, z=z, **k),
          mb.caixa(l - 2 * esp + 0.002, p, esp, x=x, y=y, z=z, **k),
          mb.caixa(l - 2 * esp + 0.002, p, esp, x=x, y=y, z=z + a - esp, **k),
          mb.caixa(l - 2 * esp + 0.002, esp, a - 2 * esp + 0.002, x=x, y=y + p / 2 - esp / 2, z=z + esp - 0.001, **k)]
    return mb.junta(ps, "cavidade")


def forno(cx, x0, x1, z0, z1, fx0, fx1, fz0, fz1, n):
    """Forno: cavidade escura, grade dentro, porta que abre para baixo com vidro e barra."""
    E, it, yb, Pc = cx.E, cx.it, cx.yb, cx.Pc
    l, a = fx1 - fx0, fz1 - fz0
    xm = (fx0 + fx1) / 2
    yf = yb - 0.001
    cw, ch = x1 - x0, z1 - z0
    it.add(cavidade(cw - 0.006, Pc - 0.03, ch - 0.006, (x0 + x1) / 2, yb + 0.004 + (Pc - 0.03) / 2, z0 + 0.003))
    zg = z0 + ch * 0.38
    gx0, gx1 = x0 + 0.02, x1 - 0.02
    gy0, gy1 = yb + 0.03, yb + Pc - 0.05
    pts = [(gx0, gy0, zg), (gx1, gy0, zg), (gx1, gy1, zg), (gx0, gy1, zg)]
    grade = [mb.tubo(pts, 0.004, cor="metal", raio_curva=0.012, seg=6, fechado=True, nome="grade")]
    nb = max(4, int((gx1 - gx0) / 0.05))
    for i in range(1, nb):
        gx = gx0 + (gx1 - gx0) * i / nb
        grade.append(mb.tubo([(gx, gy0, zg), (gx, gy1, zg)], 0.0028, cor="metal", seg=6, nome="vareta"))
    it.add(mb.junta(grade, "grade_forno"))
    for sx in (-1, 1):  # trilhos laterais da grade
        it.add(mb.caixa(0.012, Pc - 0.08, 0.008, x=(x0 + x1) / 2 + sx * (cw / 2 - 0.012), y=(gy0 + gy1) / 2,
                        z=zg - 0.012, cor="metal_escuro", bisel=0.002))
    it.slot(f"forno_{n}", ((x0 + x1) / 2, (gy0 + gy1) / 2, zg + 0.004), (cw - 0.05, gy1 - gy0, ch * 0.55))
    m = min(0.06, a * 0.2)
    fr = mb.frente(l, a, esp=E.ef, estilo="vidro", cor=E.forno, cor2=E.forno, margem=m, bisel=0.008)
    mb.transforma(fr, loc=(xm, yf, fz0))
    zt = fz1 - m * 0.55
    bar = mb.tubo([(fx0 + 0.06, yf - E.ef + 0.004, zt), (fx0 + 0.06, yf - E.ef - 0.03, zt),
                   (fx1 - 0.06, yf - E.ef - 0.03, zt), (fx1 - 0.06, yf - E.ef + 0.004, zt)], 0.008, cor=E.forno_pux,
                  raio_curva=0.014, seg=10, nome="barra")
    it.porta([fr, bar], dobradica=(xm, yf - E.ef / 2, fz0), eixo="x", lado="baixo", abre_graus=88, nome=f"porta_forno")


# =====================================================================================================================
# Tampos, cubas, torneiras, cooktop
# =====================================================================================================================
def tampo(E, contorno, furos=(), z_top=BANCADA, te=None, cor_=None, toalha=True, contorno_fn=None):
    te = E.te if te is None else te
    out = []
    if E.toalha and toalha:
        out.append(placa(contorno, furos, esp=te + 0.001, z=z_top - te - 0.001, cor=E.toalha,
                         bisel=min(0.016, te * 0.45)))
        out.append(saia(contorno, z_top, te, E.toalha))
        return out
    out.append(placa(contorno, furos, esp=te + 0.001, z=z_top - te - 0.001, cor=cor_ or E.tampo,
                     bisel=E.tampo_bisel))
    return out


def saia(contorno, z_top, te, c, queda=0.07, lam=0.11, amp=0.03, lados=None):
    """Toalha franzida: barra caindo em volta do tampo, com a borda de baixo em arcos (festonê)."""
    per = sum((V(b) - V(a)).length for a, b in zip(contorno, contorno[1:] + contorno[:1]))
    n = max(48, int(per / lam) * 8)
    n -= n % 8
    base = reamostra(contorno, n)
    fora = encolhe(base, -0.007)
    dent = encolhe(base, -0.002)
    zt = z_top - 0.008
    zb = z_top - te - queda
    nw = 8  # pontos por arco
    an = [[], [], [], []]
    for i in range(n):
        s = (i % nw) / nw
        zz = zb - amp * math.sin(math.pi * s) + amp * 0.5
        rip = 0.003 * math.cos(2 * math.pi * s)
        q = V(fora[i]) + (V(fora[i]) - V(dent[i])).normalized() * rip
        an[0].append((fora[i][0], fora[i][1], zt))
        an[1].append((q.x, q.y, zz))
        qi = V(dent[i]) + (V(fora[i]) - V(dent[i])).normalized() * rip
        an[2].append((qi.x, qi.y, zz + 0.004))
        an[3].append((dent[i][0], dent[i][1], zt))
    return loft(an, cor=c, secao_fechada=True, nome="saia", angulo=70)


def cuba_aneis(forma, l, p, r, n):
    if forma == "redonda":
        return [(l / 2 * math.cos(2 * math.pi * k / n + math.pi / 4), p / 2 * math.sin(2 * math.pi * k / n + math.pi / 4))
                for k in range(n)]
    return reamostra(rr(l, p, r, 6), n)


def cuba(forma, cx_, cy_, z0, li, pi_, prof=0.17, aba=0.028, cor_="porcelana", r=0.05):
    """Cuba de embutir côncava: aba sobre o tampo, paredes por dentro e fundo com ralo."""
    n = 32
    def anel(dl, z, k=1.0):
        pts = cuba_aneis(forma, li + dl, (pi_ + dl), r + dl / 2, n)
        return [(cx_ + px * k, cy_ + py * k, z) for px, py in pts]
    aneis = [anel(-0.06, z0 - prof - 0.012), anel(0.004, z0 - prof + 0.03), anel(0.006, z0 - 0.004),
             anel(2 * aba, z0 + 0.001), anel(2 * aba, z0 + 0.007), anel(2 * aba - 0.01, z0 + 0.012),
             anel(0.01, z0 + 0.012), anel(0.0, z0 + 0.004), anel(-0.004, z0 - prof + 0.04),
             anel(-0.06, z0 - prof)]
    c = loft(aneis, cor=cor_, fecha_ini=True, fecha_fim=True, nome="cuba", angulo=40)
    ralo = mb.cilindro(0.022, 0.004, x=cx_, y=cy_, z=z0 - prof - 0.001, cor="metal", seg=18, bisel=0.0015)
    ralo2 = mb.cilindro(0.012, 0.004, x=cx_, y=cy_, z=z0 - prof + 0.001, cor="metal_escuro", seg=14, bisel=0.001)
    return [c, ralo, ralo2]


def furo_cuba(forma, cx_, cy_, li, pi_, r=0.05):
    pts = cuba_aneis(forma, li + 0.016, pi_ + 0.016, r + 0.008, 32)
    return [(cx_ + px, cy_ + py) for px, py in pts]


def cruzeta(x, y, z, c, s=1.0):
    ps = [mb.cilindro(0.016 * s, 0.03 * s, x=x, y=y, z=z, cor=c, seg=14, bisel=0.004)]
    for ang in (0, 90):
        b = capsula(0.07 * s, 0.012 * s, 0.012 * s, z=-0.006 * s, cor=c)
        mb.transforma(b, rot=("Z", ang + 45))
        mb.transforma(b, loc=(x, y, z + 0.04 * s))
        ps.append(b)
    ps.append(mb.esfera(0.012 * s, x=x, y=y, z=z + 0.042 * s, cor=c, seg=12))
    return ps


def torneira(tipo, x, y, z, c, alcance=0.17, altura=0.27, rot=0.0):
    """Torneira de tubo com base em (x, y, z), bico apontando para −Y (gira rot graus em volta da base)."""
    ps = []
    if tipo == "parede":  # sai da parede (y é o plano da parede) e desce
        ps.append(mb.cilindro(0.022, 0.03, x=x, y=y - 0.015, z=z, cor=c, eixo="y", seg=16, bisel=0.004))
        ps.append(mb.tubo([(x, y - 0.02, z), (x, y - alcance, z), (x, y - alcance, z - 0.07)], 0.012, cor=c,
                          raio_curva=0.04))
        for sx in (-1, 1):
            hz = cruzeta(0, 0, 0, c, 0.9)
            for h in hz:
                mb.transforma(h, rot=("X", -90))
                mb.transforma(h, loc=(x + sx * 0.09, y, z + 0.03))
            ps += hz
        return ps
    ps.append(mb.cilindro(0.026, 0.035, x=x, y=y, z=z, cor=c, seg=18, bisel=0.006))
    ps.append(mb.tubo([(x, y, z + 0.02), (x, y, z + altura), (x, y - alcance, z + altura),
                       (x, y - alcance, z + altura - 0.075)], 0.013, cor=c, raio_curva=0.06))
    ps.append(mb.cilindro(0.016, 0.012, x=x, y=y - alcance, z=z + altura - 0.087, cor=c, seg=14, bisel=0.003))
    if tipo == "pescoco":
        ps.append(mb.cilindro(0.017, 0.05, x=x + 0.028, y=y, z=z + 0.07, cor=c, eixo="x", seg=14, bisel=0.004))
        ps.append(capsula(0.012, 0.06, 0.012, x=x + 0.05, y=y - 0.02, z=z + 0.064, cor=c))
    else:  # pescoco_cruzeta / cruzeta: duas cruzetas do lado
        for sx in (-1, 1):
            ps += cruzeta(x + sx * 0.095, y, z, c)
    if rot:
        gira(ps, rot, (x, y, z))
    return ps


def cooktop(E, it, cx_, cy_, z, larg=0.5, prof=0.44, n=4, grades=True):
    """Placa do fogão com bocas: queimador, espalhador e grade de ferro por cima."""
    it.add(placa(rr(larg, prof, 0.03), esp=0.014, x=cx_, y=cy_, z=z - 0.008, cor=E.cooktop, bisel=0.005))
    zt = z + 0.006
    if n == 4:
        pos = [(-0.12, -0.1, 0.05), (0.12, -0.1, 0.04), (-0.12, 0.1, 0.04), (0.12, 0.1, 0.055)]
    else:
        pos = [(-0.11, 0.0, 0.06), (0.11, 0.0, 0.06)]
    for dx, dy, r in pos:
        x, y = cx_ + dx * larg / 0.5, cy_ + dy * prof / 0.44
        it.add(mb.cilindro(r, 0.01, x=x, y=y, z=zt - 0.002, cor="preto", seg=16, bisel=0.003))
        it.add(mb.cilindro(r * 0.62, 0.012, x=x, y=y, z=zt + 0.006, cor="grafite_escuro", seg=14, bisel=0.003))
        if grades:
            R = r + 0.028
            gs = []
            for ang in (0, 90):
                b = mb.caixa(2 * R, 0.009, 0.009, z=0, cor=E.grade, bisel=0.0035, seg=1)
                mb.transforma(b, rot=("Z", ang + 45))
                mb.transforma(b, loc=(x, y, zt + 0.024))
                gs.append(b)
            pts = [(x + R * 0.82 * math.cos(2 * math.pi * k / 12), y + R * 0.82 * math.sin(2 * math.pi * k / 12),
                    zt + 0.028) for k in range(12)]
            gs.append(mb.tubo(pts, 0.0045, cor=E.grade, raio_curva=0, seg=6, fechado=True, nome="aro"))
            for k in range(4):
                a_ = math.radians(45 + 90 * k)
                gs.append(mb.cilindro(0.005, 0.03, x=x + R * math.cos(a_), y=y + R * math.sin(a_), z=zt - 0.002,
                                      cor=E.grade, seg=8, bisel=0.002))
            it.add(mb.junta(gs, "grade"))


# =====================================================================================================================
# Tipos de módulo
# =====================================================================================================================
def contorno_ret(L, P, cx_=0.0, cy_=0.0):
    return [(cx_ + L / 2, cy_ + P / 2), (cx_ - L / 2, cy_ + P / 2), (cx_ - L / 2, cy_ - P / 2), (cx_ + L / 2, cy_ - P / 2)]


def pontos_pes(Lc, y0, y1, i=0.045, x=0.0):
    return [(x + sx * (Lc / 2 - i), yy) for sx in (-1, 1) for yy in (y0 + i, y1 - i)]


def base(E, it, L, cols, P=0.60, H=BANCADA, te=None, tampo_=True, furos=(), alto=False, pia=False, topo=True):
    """Módulo de chão: pés/rodapé, corpo oco, células na frente e tampo. Devolve um dicionário com as medidas."""
    te = E.te if te is None else te
    if alto:
        te = 0.035
    yb = -P / 2 + E.bal + E.ef
    yfundo = P / 2
    Pc = yfundo - yb
    Lc = L - 2 * E.recuo
    zb, zt = E.hp, H - te
    w = E.w
    it.add(casco(E, Lc, zt - zb, Pc, yb=yb, zb=zb, topo=topo))
    it.add(fundo_painel(E, Lc, zt - zb, yfundo, zb))
    cx = Cx(E, it, yb, Pc - 0.015, pia=pia, alto=alto)
    celulas(cx, -Lc / 2 + w, Lc / 2 - w, zb + w, zt - w, cols)
    it.add(pes(E, contorno_ret(Lc, Pc, 0, (yb + yfundo) / 2), pontos_pes(Lc, yb, yfundo)))
    if tampo_:
        c = contorno_ret(L - 0.002, P - 0.001, 0, 0.0005)
        if alto:
            it.add(placa(c, esp=te + 0.001, z=H - te - 0.001, cor=cor(E, E.parede_cap or "tampo"),
                         bisel=min(E.tampo_bisel, 0.014)))
        else:
            it.add(tampo(E, c, furos, z_top=H, te=te))
    return dict(yb=yb, Pc=Pc, Lc=Lc, zb=zb, zt=zt)


def parede(E, it, L, cols, H=0.60, P=0.35):
    """Armário de parede: origem no plano da parede, corpo de y = −P a 0, base em z = 0."""
    yb = -P + E.bal * 0.5 + E.ef
    Pc = -yb
    Lc = L - 2 * E.recuo
    w = E.w
    zb, zt = 0.0, H
    cap = E.parede_cap
    if cap == "colonial":  # cornija marrom, faixa amarela, base marrom
        zb = 0.03
        zt = H - 0.12
        it.add(mb.caixa(L - 0.002, P - 0.002, 0.034, y=-P / 2 - 0.001, z=0, cor=E.tampo, bisel=0.01))
        it.add(mb.caixa(Lc - 0.004, P - 0.016, 0.075, y=-P / 2 + 0.004, z=zt - 0.002, cor=E.faixa, bisel=0.01))
        it.add(mb.caixa(L - 0.002, P + 0.004, 0.05, y=-P / 2 - 0.004, z=H - 0.05, cor=E.tampo, bisel=0.014))
    elif cap:
        zt = H - 0.03
        it.add(placa(contorno_ret(L - 0.002, P + 0.006, 0, -P / 2 - 0.003), esp=0.031, z=zt - 0.001,
                     cor=cor(E, cap), bisel=0.012))
    it.add(casco(E, Lc, zt - zb, Pc, yb=yb, zb=zb))
    it.add(fundo_painel(E, Lc, zt - zb, 0.0, zb))
    cx = Cx(E, it, yb, Pc - 0.015, parede=True)
    celulas(cx, -Lc / 2 + w, Lc / 2 - w, zb + w, zt - w, cols)
    return dict(yb=yb, Pc=Pc)


# ---- módulos de chão simples
def t_base_1porta(E, it, L=0.40):
    base(E, it, L, [(1, [("porta", 1)])])


def t_base_gaveta_porta(E, it, L=0.60):
    base(E, it, L, [(1, [("gaveta", 0.24), ("porta", 0.76)])])


def t_base_2portas(E, it, L=0.80, gavetas=False):
    if gavetas:
        base(E, it, L, [(1, [("gaveta", 0.22, {}), ("portas2", 0.78)])])
    else:
        base(E, it, L, [(1, [("portas2", 1)])])


def t_gaveteiro(E, it, L=0.40, n=3):
    base(E, it, L, [(1, [("gaveta", 1 / n)] * n)])


def t_nicho(E, it, L=0.40):
    base(E, it, L, [(1, [("nicho", 1, {"prat": 2})])])


def t_paneleiro(E, it, L=0.60, H=2.10):
    base(E, it, L, [(1, [("portas2", 0.4), ("nicho", 0.2, {"prat": 0}), ("portas2", 0.4)])], H=H, alto=True)


def t_pia(E, it, L=0.80, cols=None, cuba_=None, dx=0.0):
    cols = cols or [(1, [("portas2", 1)])]
    tipo = cuba_ or E.cuba
    if tipo == "louca":
        return pia_louca(E, it, L, cols)
    li, pi_ = (0.42, 0.36) if tipo == "redonda" else (min(0.5, L - 0.3), 0.36)
    cy_ = -0.035
    furo = furo_cuba(tipo, dx, cy_, li, pi_)
    base(E, it, L, cols, furos=[furo], pia=True, topo=False)
    it.add(cuba(tipo, dx, cy_, BANCADA, li, pi_, cor_=E.cuba_cor))
    tc = "pescoco_cruzeta" if E.torneira == "cruzeta" else E.torneira
    it.add(torneira(tc, dx, cy_ + pi_ / 2 + 0.07, BANCADA, E.torneira_cor, alcance=0.15))


def pia_louca(E, it, L, cols, hb=0.17, espelho=None):
    """Pia de louça inteira (cuba funda esculpida num bloco), como as de fazenda e as coloniais."""
    espelho = E.torneira == "parede" if espelho is None else espelho
    base(E, it, L, cols, te=hb, tampo_=False, pia=True)
    P = 0.60
    Lb = L - 0.002
    li, pi_ = Lb - 0.12, 0.38
    cy_ = -0.04
    fr = rr(li, pi_, 0.045, 6, 0, cy_)
    z0 = BANCADA - hb - 0.001
    it.add(placa(contorno_ret(Lb, P - 0.001, 0, 0.0005), [fr], esp=hb + 0.001, z=z0, cor=E.cuba_cor, bisel=0.03))
    it.add(placa(rr(li + 0.006, pi_ + 0.006, 0.047, 6, 0, cy_), esp=0.03, z=z0 + 0.02, cor=E.cuba_cor, bisel=0.008))
    it.add(mb.cilindro(0.022, 0.004, x=0, y=cy_, z=z0 + 0.049, cor="metal", seg=18, bisel=0.0015))
    it.add(mb.cilindro(0.012, 0.004, x=0, y=cy_, z=z0 + 0.052, cor="metal_escuro", seg=14, bisel=0.001))
    if espelho:  # encosto alto de louça com a torneira na parede
        it.add(placa(ret_xz(Lb, 0.24, 0.05, 6), esp=0.06, y=P / 2 - 0.06, z=BANCADA - 0.04, plano="xz",
                     cor=E.cuba_cor, bisel=0.02))
        it.add(torneira("parede", 0, P / 2 - 0.06, BANCADA + 0.12, E.torneira_cor, alcance=0.13))
    else:
        tc = "pescoco_cruzeta" if E.torneira in ("cruzeta", "pescoco_cruzeta") else E.torneira
        it.add(torneira(tc, 0, cy_ + pi_ / 2 + 0.05, BANCADA, E.torneira_cor, alcance=0.15))


def t_fogao(E, it, L=0.60, gaveta=False):
    rows = [("painel", 0.13), ("forno", 0.87)] if not gaveta else [("painel", 0.12), ("forno", 0.66), ("gaveta", 0.22)]
    E2 = E.com(toalha=None)
    base(E2, it, L, [(1, rows)])
    cooktop(E, it, 0, 0.005, BANCADA, larg=min(0.52, L - 0.08), prof=0.46)


def t_parede_1porta(E, it, L=0.40):
    parede(E, it, L, [(1, [("porta", 1)])])


def t_parede_2portas(E, it, L=0.80):
    parede(E, it, L, [(1, [("portas2", 1)])])


def t_parede_vidro(E, it, L=0.80):
    parede(E, it, L, [(1, [("vidro2", 1)])])


def t_parede_aberto(E, it, L=0.60, H=0.60):
    parede(E, it, L, [(1, [("nicho", 1, {"prat": 1})])], H=H)


def t_parede_alto(E, it, L=0.60, H=0.90):
    parede(E, it, L, [(1, [("portas2", 1)])], H=H)


def t_parede_nicho(E, it, L=0.80):
    parede(E, it, L, [(1, [("portas2", 0.65), ("nicho", 0.35, {"prat": 0})])])


def t_prateleira(E, it, L=0.80, P=0.24):
    """Prateleira de parede com mãos-francesas; origem no plano da parede."""
    c = cor(E, E.prat or "tampo")
    if E.prat_suporte == "oculto":  # prateleira solta: tábua grossa com sarrafo escondido atrás
        it.add(placa(rr(L, P, 0.03, 4, 0, -P / 2 - 0.001), esp=0.045, z=0.03, cor=c, bisel=0.016))
        it.add(mb.caixa(L - 0.12, 0.02, 0.032, y=-0.011, z=0.0, cor=c, bisel=0.006))
        it.slot("prateleira", (0, -P / 2, 0.075), (L - 0.02, P - 0.02, 0.35))
        return
    it.add(placa(rr(L, P, 0.012, 3, 0, -P / 2 - 0.001), esp=0.036, z=0.17, cor=c, bisel=0.012))
    perfil = [(0.0, 0.0), (0.0, 0.172), (-0.17, 0.172), (-0.17, 0.152), (-0.03, 0.04), (-0.02, 0.0)]
    for sx in (-1, 1):
        b = mb.extrudado(mb._ccw(perfil), 0.026, x=sx * (L / 2 - 0.09) - 0.013, cor=E.corpo, bisel=0.006, plano="yz")
        it.add(b)
    it.slot("prateleira", (0, -P / 2, 0.206), (L - 0.02, P - 0.02, 0.35))


# ---- canto em L
def t_canto(E, it, S=0.90, D=0.60, cols1=None, cols2=None, pia=False):
    hp, te, w, ef, bal, rec = E.hp, E.te, E.w, E.ef, E.bal, E.recuo
    zb, zt = hp, BANCADA - te
    H = zt - zb
    tf = S / 2 - D
    yb = tf + bal + ef
    m = S / 2 - rec
    ci = E.interno or E.corpo
    corpo = [(m, m), (-m, m), (-m, yb), (yb, yb), (yb, -m), (m, -m)]
    piso = [(m - 0.003, m - 0.003), (-m + 0.003, m - 0.003), (-m + 0.003, yb + 0.002), (yb + 0.002, yb + 0.002),
            (yb + 0.002, -m + 0.003), (m - 0.003, -m + 0.003)]
    it.add(placa(piso, esp=w, z=zb, cor=E.corpo, bisel=0.004))
    cc = (tf + S / 2) / 2 + 0.02
    fpia = [furo_cuba("redonda", cc, cc, 0.4, 0.4)] if pia else []
    it.add(placa(piso, fpia, esp=w, z=zt - w, cor=E.corpo, bisel=0.004))
    lat = dict(cor=E.lateral or E.corpo, bisel=E.bisel_casco)
    it.add(mb.caixa(w, m - yb, H, x=-m + w / 2, y=(yb + m) / 2, z=zb, **lat))
    it.add(mb.caixa(m - yb, w, H, x=(yb + m) / 2, y=-m + w / 2, z=zb, **lat))
    it.add(mb.caixa(2 * m - 0.006, 0.016, H - 0.004, y=m - 0.009, z=zb + 0.002, cor=ci, bisel=0.003))
    it.add(mb.caixa(0.016, 2 * m - 0.006, H - 0.004, x=m - 0.009, z=zb + 0.002, cor=ci, bisel=0.003))
    hs = H - 2 * w + 0.004
    it.add(mb.caixa(2 * w + 0.002, w, hs, x=yb, y=yb + w / 2 + 0.001, z=zb + w - 0.002, cor=E.corpo, bisel=0.004))
    it.add(mb.caixa(w, w + 0.002, hs, x=yb + w / 2 + 0.001, y=yb - w / 2 + 0.002, z=zb + w - 0.002, cor=E.corpo,
                    bisel=0.004))
    Pc = m - 0.016 - yb
    cols1 = cols1 or [(1, [("porta", 1, {"lado": "esq"})])]
    cols2 = cols2 or [(1, [("porta", 1, {"lado": "dir"})])]
    cx = Cx(E, it, yb, Pc, pia=pia)
    celulas(cx, -m + w, yb - w, zb + w, zt - w, cols1)
    mk = marca(it)
    cx2 = Cx(E, it, yb, Pc, pia=pia)
    celulas(cx2, w - yb, m - w, zb + w, zt - w, cols2)
    sub_transforma(it, mk, Matrix.Rotation(math.radians(-90), 4, "Z"))
    i = 0.045
    pts = [(m - i, m - i), (-m + i, m - i), (-m + i, yb + i), (yb + i, yb + i), (yb + i, -m + i), (m - i, -m + i)]
    it.add(pes(E, corpo, pts))
    ext = [(S / 2 - 0.001, S / 2), (-S / 2 + 0.001, S / 2), (-S / 2 + 0.001, tf), (tf, tf), (tf, -S / 2 + 0.001),
           (S / 2 - 0.001, -S / 2 + 0.001)]
    furos = []
    if pia:
        furos = fpia
        it.add(cuba("redonda", cc, cc, BANCADA, 0.4, 0.4, cor_=E.cuba_cor))
        d = 0.27
        tc = "pescoco_cruzeta" if E.torneira in ("cruzeta", "pescoco_cruzeta", "parede") else E.torneira
        it.add(torneira(tc, cc + d * 0.707, cc + d * 0.707, BANCADA, E.torneira_cor, alcance=0.17, rot=45))
    it.add(tampo(E, ext, furos))
    it.colisao([((0, (tf + S / 2) / 2, 0), (S, D, BANCADA)), ((S / 2 - D / 2, -S / 2 + (S - D) / 2, 0),
                                                               (D, S - D, BANCADA))])


# ---- ponta curva aberta
def contorno_ponta(L, P, R, n=10, k=0.0):
    """Ponta com a frente-esquerda em quarto de círculo (raio R), encolhida k."""
    cx_, cy_ = L / 2, -P / 2 + R
    pts = [(L / 2 - k, P / 2 - k), (-L / 2 + k, P / 2 - k)]
    for i in range(n + 1):
        a_ = math.radians(180 + 90 * i / n)
        pts.append((cx_ + (R - k) * math.cos(a_), cy_ + (R - k) * math.sin(a_)))
    return pts


def t_ponta(E, it, L=0.40, P=0.60, lado="esq"):
    hp, te = E.hp, E.te
    zb, zt = hp, BANCADA - te
    H = zt - zb
    R = L
    k0 = E.bal + 0.01
    it0 = marca(it)
    cpr = cor(E, E.prat) if E.prat else (E.interno or E.corpo)
    corpo = contorno_ponta(L, P, R, 10, k0)
    it.add(placa(corpo, esp=0.035, z=zb, cor=E.corpo, bisel=0.012))
    it.add(placa(corpo, esp=0.03, z=zt - 0.03, cor=E.corpo, bisel=0.01))
    it.add(placa(contorno_ponta(L, P, R, 10, k0 + 0.006), esp=0.024, z=zb + H * 0.5 - 0.012, cor=cpr, bisel=0.008))
    lat = E.lateral or E.corpo
    it.add(mb.caixa(E.w, P - k0 - 0.004, H, x=L / 2 - E.recuo - E.w / 2, y=k0 / 2 - 0.002, z=zb, cor=lat,
                    bisel=E.bisel_casco))
    it.add(mb.caixa(L - k0 - E.recuo - 0.004, 0.02, H - 0.004, x=-k0 / 2 + 0.002, y=P / 2 - k0 - 0.008,
                    z=zb + 0.002, cor=E.interno or E.corpo, bisel=0.004))
    # tábua curva de proteção na prateleira do meio (bordinha)
    arco = [(L / 2 + (R - k0 - 0.012) * math.cos(math.radians(180 + 90 * i / 14)),
             -P / 2 + R + (R - k0 - 0.012) * math.sin(math.radians(180 + 90 * i / 14)), zb + H * 0.5 + 0.022)
            for i in range(15)]
    it.add(mb.tubo(arco, 0.008, cor=cpr, raio_curva=0, seg=8, nome="borda"))
    i = 0.05
    pts = [(L / 2 - i, P / 2 - i), (-L / 2 + i, P / 2 - i),
           (L / 2 + (R - i * 1.4) * math.cos(math.radians(225)), -P / 2 + R + (R - i * 1.4) * math.sin(math.radians(225))),
           (L / 2 - i, -P / 2 + k0 + i)]
    it.add(pes(E, corpo, pts))
    it.add(tampo(E, contorno_ponta(L - 0.002, P - 0.001, R, 12, 0.0005)))
    if lado == "dir":
        espelha(it.partes[it0[0]:])
    it.slot("baixo", (0.04 if lado == "esq" else -0.04, 0.05, zb + 0.035), (L - 0.12, P - 0.2, H * 0.5 - 0.05))
    it.slot("meio", (0.04 if lado == "esq" else -0.04, 0.05, zb + H * 0.5 + 0.012), (L - 0.12, P - 0.2, H * 0.5 - 0.05))


# ---- ilha
def t_ilha(E, it, L=1.20, P=0.90, cols=None, cols_tras=None):
    te = E.te
    zb, zt = E.hp, BANCADA - te
    ov = 0.035
    yb = -P / 2 + ov + E.ef
    yt = P / 2 - ov
    Lc = L - 2 * ov
    w = E.w
    it.add(casco(E, Lc, zt - zb, yt - yb, yb=yb, zb=zb))
    ydiv = yb + 0.58
    it.add(mb.caixa(Lc - 2 * w + 0.006, 0.018, zt - zb - 2 * w + 0.006, y=ydiv, z=zb + w - 0.003,
                    cor=E.interno or E.corpo, bisel=0.003))
    cols = cols or [(0.36, [("gaveta", 1 / 3)] * 3), (0.64, [("portas2", 1)])]
    celulas(Cx(E, it, yb, ydiv - 0.009 - yb), -Lc / 2 + w, Lc / 2 - w, zb + w, zt - w, cols)
    mk = marca(it)
    cols_tras = cols_tras or [(0.5, [("nicho", 1, {"prat": 1})]), (0.5, [("nicho", 1, {"prat": 1})])]
    E2 = E.com(sobre=0.0)
    celulas(Cx(E2, it, -yt, yt - ydiv - 0.009), -Lc / 2 + w, Lc / 2 - w, zb + w, zt - w, cols_tras)
    sub_transforma(it, mk, Matrix.Rotation(math.pi, 4, "Z"))
    it.add(pes(E, contorno_ret(Lc, yt - yb, 0, (yb + yt) / 2), pontos_pes(Lc, yb, yt)))
    it.add(tampo(E, contorno_ret(L, P)))


# ---- paneleiro colonial (cristaleira alta com nicho)
def t_paneleiro_colonial(E, it, L=0.80):
    P = 0.55
    base(E, it, L, [(1, [("portas2", 1)])], P=P, H=0.90, te=0.05)
    # mover base para o fundo comum (o paneleiro tem 0,55 de fundo; recentralizado no fim)
    yb2 = P / 2 - 0.32
    pil = 0.07
    zc0, zc1 = 1.42, 1.86
    for sx in (-1, 1):
        it.add(mb.caixa(pil, 0.32, 1.92 - 0.9, x=sx * (L / 2 - pil / 2 - 0.004), y=P / 2 - 0.16, z=0.9 - 0.002,
                        cor=E.faixa or E.porta, bisel=0.012))
    li = L - 2 * pil - 0.008
    it.add(mb.caixa(li + 0.004, 0.016, zc0 - 0.9 + 0.004, y=P / 2 - 0.01, z=0.9 - 0.002, cor=E.corpo, bisel=0.003))
    Ew = E.com(w=0.026, recuo=0.0, parede_cap=None, lateral=None)
    mk = marca(it)
    parede(Ew, it, li, [(1, [("portas2", 1)])], H=zc1 - zc0, P=0.30)
    sub_transforma(it, mk, Matrix.Translation((0, P / 2, zc0)))
    it.add(mb.caixa(L - 0.01, 0.31, 0.075, y=P / 2 - 0.16, z=zc1 - 0.002, cor=E.faixa or E.porta, bisel=0.012))
    it.add(mb.caixa(L + 0.03, 0.36, 0.055, y=P / 2 - 0.17, z=zc1 + 0.07, cor=E.tampo, bisel=0.016))
    it.add(mb.caixa(L - 2 * pil - 0.004, 0.3, 0.025, y=P / 2 - 0.16, z=zc0 - 0.026, cor=E.tampo, bisel=0.008))
    it.slot("nicho", (0, P / 2 - 0.15, 0.9), (li - 0.02, 0.26, zc0 - 0.9 - 0.04))
    it.colisao([((0, 0, 0), (L, P, 0.9)), ((0, P / 2 - 0.17, 0.9), (L, 0.34, zc1 + 0.125 - 0.9))])


# =====================================================================================================================
# Peças especiais
# =====================================================================================================================
def t_canto_parede_chanfrado(E, it, S=0.70, P=0.35, H=0.60):
    """Armário de parede de canto com frente chanfrada (duas portas no chanfro). Encosta na parede do fundo (y=0) e
    na da direita (x=+S/2)."""
    zb, zt = 0.03, H - 0.12
    m = S / 2
    c0 = (-m, -P)
    c1 = (m - P, -S)
    poly = [(m, 0), (-m, 0), c0, c1, (m, -S)]
    it.add(placa(poly, esp=0.034, z=0, cor=E.tampo, bisel=0.01))
    it.add(placa(encolhe(poly, 0.008), esp=0.075, z=zt - 0.002, cor=E.faixa, bisel=0.01))
    it.add(placa(encolhe(poly, -0.004), esp=0.05, z=H - 0.05, cor=E.tampo, bisel=0.014))
    w = E.w
    it.add(placa(encolhe(poly, 0.004), esp=w, z=zb, cor=E.corpo, bisel=0.004))
    it.add(placa(encolhe(poly, 0.004), esp=w, z=zt - w, cor=E.corpo, bisel=0.004))
    Hc = zt - zb
    it.add(mb.caixa(w, P - 0.004, Hc, x=-m + w / 2 + 0.002, y=-P / 2, z=zb, cor=E.lateral or E.corpo, bisel=0.006))
    it.add(mb.caixa(P - 0.004, w, Hc, x=m - P / 2, y=-S + w / 2 + 0.002, z=zb, cor=E.lateral or E.corpo, bisel=0.006))
    it.add(mb.caixa(S - 0.01, 0.014, Hc - 0.004, y=-0.009, z=zb + 0.002, cor=E.interno, bisel=0.003))
    it.add(mb.caixa(0.014, S - 0.01, Hc - 0.004, x=m - 0.009, y=-S / 2, z=zb + 0.002, cor=E.interno, bisel=0.003))
    # chanfro: face local com abertura para −Y, girada 45°
    d = (V(c1) - V(c0)).length
    mid = (V(c0) + V(c1)) / 2
    mk = marca(it)
    Ec = E.com(sobre=0.0)
    cx = Cx(Ec, it, 0.0, 0.3, parede=True)
    for sx in (-1, 1):  # batentes nas pontas do chanfro
        it.add(mb.caixa(0.05, 0.04, Hc, x=sx * (d / 2 - 0.025), y=0.022, z=zb, cor=E.corpo, bisel=0.006))
    celulas(cx, -d / 2 + 0.05, d / 2 - 0.05, zb + w, zt - w, [(1, [("portas2", 1)])])
    M = Matrix.Translation((mid.x, mid.y, 0)) @ Matrix.Rotation(math.radians(-45), 4, "Z")
    sub_transforma(it, mk, M)
    it.slot("prateleira", (0.05, -0.25, zb + w), (0.4, 0.3, Hc - 2 * w))


def t_banco_baixo(E, it, L=0.60, P=0.30, H=0.42):
    """Banco/prateleira baixa (moderna): tampo, prateleira de baixo e pernas."""
    c1, c2 = E.porta2b or "rosa", E.pe2 or "turquesa"
    it.add(mb.caixa(L, P, 0.04, z=H - 0.04, cor=c1, bisel=0.014))
    it.add(mb.caixa(L - 0.06, P - 0.04, 0.03, z=0.1, cor=c1, bisel=0.01))
    for sx in (-1, 1):
        it.add(mb.caixa(0.045, P - 0.04, H - 0.04 + 0.002, x=sx * (L / 2 - 0.045), z=0, cor=c2, bisel=0.012))
    it.slot("assento", (0, 0, H), (L - 0.02, P - 0.02, 0.3))
    it.slot("prateleira", (0, 0, 0.13), (L - 0.16, P - 0.06, H - 0.18))


def t_banqueta(E, it, H=0.48):
    it.add(mb.almofada(0.34, 0.34, 0.07, z=H - 0.07, cor=E.toalha, e=0.9, estufa=0.25))
    it.add(mb.cilindro(0.15, 0.03, z=H - 0.09, cor=E.pe_madeira or "madeira_clara", seg=28, bisel=0.008))
    for k in range(3):
        a_ = math.radians(90 + 120 * k)
        o = mb.cilindro(0.016, H - 0.07, r2=0.02, cor=E.pe_madeira or "madeira_clara", seg=12, bisel=0.004)
        mb.transforma(o, rot=("Y", -12))
        mb.transforma(o, rot=("Z", math.degrees(a_)))
        mb.transforma(o, loc=(0.15 * math.cos(a_), 0.15 * math.sin(a_), 0.0))
        it.add(o)
    pts = [(0.11 * math.cos(2 * math.pi * k / 18), 0.11 * math.sin(2 * math.pi * k / 18), 0.17) for k in range(18)]
    it.add(mb.tubo(pts, 0.009, cor=E.pe_madeira or "madeira_clara", raio_curva=0, seg=8, fechado=True))
    it.slot("assento", (0, 0, H), (0.3, 0.3, 0.3))


def t_maquina_lavar(E, it, L=0.60, P=0.60, H=0.88):
    """Máquina de lavar de módulo (linha verde): porta redonda com vidro, tambor côncavo e gavetinha de sabão."""
    corpo_c, topo, anel = E.maq_corpo or "lilas_claro", E.maq_topo or E.corpo, E.maq_anel or "rosa"
    zb = 0.06
    it.add(mb.caixa(L - 0.06, P - 0.06, zb + 0.004, cor=E.rodape, bisel=0.008))
    yb = -P / 2 + 0.01
    Hc = H - zb - 0.07
    yc_ = (yb + P / 2) / 2
    # corpo: placa com furo redondo da porta, mais laterais
    cz = zb + Hc * 0.45
    rf = 0.17
    ext = ret_xz(L - 0.01, Hc, 0.03, 6)
    furo = [(rf * math.cos(2 * math.pi * k / 32), cz - zb + rf * math.sin(2 * math.pi * k / 32)) for k in range(32)]
    it.add(placa(ext, [furo], esp=P - 0.02, x=0, y=yb, z=zb, plano="xz", cor=corpo_c, bisel=0.02))
    # tambor côncavo
    aneis = []
    for rr_, yy in ((rf + 0.004, yb + 0.01), (rf - 0.004, yb + 0.03), (rf - 0.01, yb + 0.4), (0.06, yb + 0.43)):
        aneis.append([(rr_ * math.cos(2 * math.pi * k / 32), yy, cz + rr_ * math.sin(2 * math.pi * k / 32))
                      for k in range(32)])
    it.add(loft(aneis, cor="metal", fecha_fim=True, nome="tambor", angulo=50))
    it.slot("tambor", (0, yb + 0.22, cz - rf + 0.03), (0.22, 0.34, 0.26))
    # topo com painel de trás
    it.add(placa(contorno_ret(L, P), esp=0.07, z=H - 0.07, cor=topo, bisel=0.022))
    it.add(placa(ret_xz(L - 0.004, 0.12, 0.04, 6), esp=0.07, y=P / 2 - 0.08, z=H - 0.02, plano="xz", cor=topo,
                 bisel=0.02))
    it.add(mb.caixa(0.14, 0.01, 0.04, x=0.12, y=P / 2 - 0.085, z=H + 0.035, cor="amarelo", bisel=0.004))
    it.add(mb.cilindro(0.025, 0.02, x=-0.15, y=P / 2 - 0.09, z=H + 0.05, cor=E.puxador or "amarelo", eixo="y", seg=16,
                       bisel=0.005))
    # porta redonda (abre para o lado, dobradiça à esquerda)
    rp = rf + 0.035
    pts = [(rp * math.cos(2 * math.pi * k / 24), yb - 0.012, cz + rp * math.sin(2 * math.pi * k / 24))
           for k in range(24)]
    aro = mb.tubo(pts, 0.022, cor=anel, raio_curva=0, seg=12, fechado=True, nome="aro")
    vid = mb.cilindro(rf + 0.012, 0.012, x=0, y=yb - 0.012, z=cz, cor=None, mat="vidro", eixo="y", seg=32,
                      bisel=0.003)
    pux = capsula(0.03, 0.025, 0.07, x=rp + 0.01, y=yb - 0.025, z=cz - 0.035, cor=anel)
    it.porta([aro, vid, pux], dobradica=(-rp - 0.02, yb - 0.012, cz), lado="esq", abre_graus=100)
    # gavetinha de sabão
    fr = mb.frente(0.16, 0.06, esp=0.018, estilo="lisa", cor=corpo_c, bisel=0.008)
    mb.transforma(fr, loc=(-0.18, yb - 0.002, H - 0.07 - 0.075))
    p2 = capsula(0.07, 0.012, 0.012, x=-0.18, y=yb - 0.024, z=H - 0.07 - 0.045, cor=anel)
    it.gaveta(0.15, 0.25, 0.05, [fr, p2], x=-0.18, y_frente=yb - 0.002, z=H - 0.07 - 0.073, cor="branco", esp=0.008)
    # fundo e laterais internas já fazem parte da placa; fecho de trás
    it.add(mb.caixa(L - 0.03, 0.012, Hc - 0.02, y=P / 2 - 0.016, z=zb + 0.01, cor=corpo_c, bisel=0.003))
    _ = yc_


def t_fogao_ferro(E, it, L=0.62, P=0.60, H=0.86):
    """Fogão de ferro: corpo boleado, espaldar alto, 4 bocas com grade, botões dourados, pés curtos."""
    c, met = E.ferro_cor or "grafite_escuro", E.ferro_met or "ouro"
    hp = 0.07
    E2 = Estilo(BASE).com(corpo=c, interno="grafite_escuro", forno=c, forno_pux=met, botao=met, cooktop="preto",
                          grade="preto", w=0.05, r_casco=0.05, sobre=0.0, ef=0.024, recuo=0.0, bisel_casco=0.014,
                          porta=c)
    yb = -P / 2 + 0.03
    Pc = P / 2 - yb - 0.04
    zt = H - 0.03
    it.add(casco(E2, L, zt - hp, Pc + 0.04, yb=yb, zb=hp))
    it.add(fundo_painel(E2, L, zt - hp, P / 2, hp))
    cx = Cx(E2, it, yb, Pc)
    celulas(cx, -L / 2 + 0.05, L / 2 - 0.05, hp + 0.05, zt - 0.05, [(1, [("painel", 0.17), ("forno", 0.83)])])
    it.add(placa(rr(L, P - 0.04, 0.05, 6, 0, -0.02), esp=0.035, z=H - 0.035, cor=c, bisel=0.015))
    it.add(placa(ret_xz(L, 0.2, 0.07, 6), esp=0.05, y=P / 2 - 0.05, z=H - 0.02, plano="xz", cor=c, bisel=0.018))
    cooktop(E2, it, 0, -0.03, H, larg=0.5, prof=0.42, grades=True)
    for sx in (-1, 1):
        for yy in (-P / 2 + 0.09, P / 2 - 0.09):
            it.add(mb.cilindro(0.024, hp + 0.004, r2=0.03, x=sx * (L / 2 - 0.07), y=yy, cor=c, seg=14, bisel=0.006))


def t_fogao_retro(E, it, L=0.60, P=0.60, H=0.85, fofo=True):
    """Fogão retrô de brinquedo: corpo muito arredondado (fofo) ou caixote (branco e rosa)."""
    c, c2, c3 = E.r_corpo, E.r_det, E.r_topo or E.r_corpo
    hp = 0.06 if fofo else 0.05
    E2 = Estilo(BASE).com(corpo=c, interno=c, forno=c2, forno_pux=c2, botao=c2, cooktop=c3, grade=E.r_grade or c2,
                          w=0.06 if fofo else 0.035, r_casco=0.09 if fofo else 0.03, sobre=0.0 if fofo else 0.01,
                          ef=0.022, recuo=0.0, bisel_casco=0.02 if fofo else 0.012, porta=c2)
    yb = -P / 2 + 0.03
    Pc = P / 2 - yb
    zt = H - (0.05 if fofo else 0.04)
    it.add(casco(E2, L, zt - hp, Pc, yb=yb, zb=hp))
    it.add(fundo_painel(E2, L, zt - hp, P / 2, hp))
    cx = Cx(E2, it, yb, Pc - 0.015)
    w = E2.w
    celulas(cx, -L / 2 + w, L / 2 - w, hp + w, zt - w, [(1, [("painel", 0.2), ("forno", 0.8)])])
    if fofo:
        it.add(mb.superelipsoide(L, P, 0.12, y=0, z=H - 0.11, cor=c3, e=0.25, e_v=0.45))
        zc = H + 0.008
        for (dx, dy, r) in ((-0.13, -0.09, 0.05), (0.12, -0.1, 0.065), (-0.12, 0.12, 0.065), (0.13, 0.11, 0.045)):
            pts = [(dx + r * math.cos(2 * math.pi * k / 24), dy + r * math.sin(2 * math.pi * k / 24), zc)
                   for k in range(24)]
            it.add(mb.tubo(pts, 0.011, cor=c2, raio_curva=0, seg=8, fechado=True, nome="boca"))
            it.add(mb.cilindro(r * 0.5, 0.012, x=dx, y=dy, z=zc - 0.008, cor=c2, seg=18, bisel=0.004))
        pes_ = [mb.superelipsoide(0.07, 0.07, hp + 0.01, x=sx * (L / 2 - 0.08), y=yy, cor=c2, e=0.9, e_v=0.6,
                                  nu=16, nv=8) for sx in (-1, 1) for yy in (-P / 2 + 0.1, P / 2 - 0.1)]
        it.add(pes_)
    else:
        it.add(placa(contorno_ret(L, P), esp=0.045, z=H - 0.045, cor=c3, bisel=0.016))
        cooktop(E2, it, 0, -0.01, H, larg=0.5, prof=0.42, n=2, grades=True)
        it.add(mb.caixa(L - 0.05, P - 0.05, hp + 0.004, cor=E.r_base or "laranja", bisel=0.008))


# =====================================================================================================================
# Pacote gratuito (linha campestre)
# =====================================================================================================================
TROCA_CAMPESTRE = {
    "azul": {"terracota_clara": "amarelo_claro", "salmao": "branco", "vermelho": "azul", "terracota": "amarelo_escuro",
             "laranja_claro": "creme", "laranja_escuro": "azul_medio"},
    "menta": {"terracota_clara": "menta", "salmao": "rosa_bebe", "vermelho": "rosa", "terracota": "verde_agua",
              "laranja_claro": "branco", "laranja_escuro": "rosa_escuro"},
}


def recolore(objs, troca):
    if not troca:
        return
    for o in objs:
        me = o.data
        uv = me.uv_layers["UVMap"].data
        for p in me.polygons:
            if p.material_index != 0:
                continue
            u = uv[p.loop_indices[0]].uv
            i = int(u[0] * 16) + 16 * int((1 - u[1]) * 16)
            nome = mb.NOMES[i]
            if nome in troca:
                nu = mb.uv_cor(troca[nome])
                for li in p.loop_indices:
                    uv[li].uv = nu


def pacote(nome, it, parede=False, dobradicas=None, troca=None):
    pc = mb.importa_pacote(nome)
    corpo = pc.pop("corpo")
    lo, hi = mb.bbox([corpo] + list(pc.values()))
    lo_c, hi_c = mb.bbox(corpo)
    if parede:
        d = V((-(lo_c.x + hi_c.x) / 2, -hi_c.y, -lo_c.z))
    else:
        d = V((-(lo_c.x + hi_c.x) / 2, -(lo_c.y + hi_c.y) / 2, -lo_c.z))
    for o in [corpo] + list(pc.values()):
        o.data.transform(Matrix.Translation(d))
    recolore([corpo] + list(pc.values()), troca)
    it.add(corpo)
    for nm, ob in sorted(pc.items()):
        a, b = mb.bbox(ob)
        lado = (dobradicas or {}).get(nm)
        if lado is None:
            lado = "esq" if (a.x + b.x) / 2 < 0 else "dir"
        x = a.x if lado == "esq" else b.x
        it.porta([ob], dobradica=(x, (a.y + b.y) / 2, a.z), lado=lado)
    return mb.bbox(corpo)


def t_pacote_d01(E, it, troca=None):
    lo, hi = pacote("Kitchen_D_01", it, troca=troca)
    it.slot("baixo", (0, -0.03, 0.17), (0.66, 0.4, 0.2))
    it.slot("prateleira", (0, -0.03, 0.43), (0.66, 0.4, 0.24))


def t_pacote_d06(E, it, troca=None):
    pacote("Kitchen_D_06", it, troca=troca)
    it.slot("tampo", (0, 0, 0.75), (0.7, 0.7, 0.4))
    it.colisao([((0, 0, 0.55), (0.87, 0.87, 0.2)), ((0, 0, 0), (0.5, 0.5, 0.55))])


def t_pacote_parede(nome, dob, slots):
    def f(E, it, troca=None):
        pacote(nome, it, parede=True, dobradicas=dob, troca=troca)
        for s in slots:
            it.slot(*s)
    return f


# =====================================================================================================================
# Inventário: linhas × tipos (+ cores) e especiais
# =====================================================================================================================
def T(tipo, id_base, rotulo, fn, cores=False, tags=(), fix="chao", alt=None, **kw):
    return dict(tipo=tipo, id_base=id_base, rotulo=rotulo, fn=fn, kw=kw, cores=cores, tags=list(tags), fix=fix,
                alt=alt)


def tipos_comuns(linha):
    """Os tipos que toda linha tem; os parâmetros mudam um pouco por linha (larguras, cuba, gavetas)."""
    L = linha
    pia_kw = {
        "moderna": dict(L=1.20, cols=[(0.3, [("gaveta", 1 / 3)] * 3), (0.7, [("portas2", 1)])], dx=0.14),
        "grafite": dict(L=0.90, cols=[(0.36, [("gaveta", 0.5)] * 2), (0.64, [("portas2", 1)])], dx=0.13),
        "classica": dict(L=0.80),
        "campestre": dict(L=0.80),
        "colonial": dict(L=0.60),
        "verde": dict(L=0.80),
        "creme": dict(L=0.80),
    }[L]
    g_kw = {"verde": dict(L=0.60, n=2), "grafite": dict(L=0.40, n=3), "moderna": dict(L=0.40, n=3),
            "classica": dict(L=0.40, n=2), "campestre": dict(L=0.40, n=2), "colonial": dict(L=0.40, n=2),
            "creme": dict(L=0.40, n=3)}[L]
    g2_kw = {"verde": dict(L=0.40, n=3), "grafite": dict(L=0.60, n=3), "moderna": dict(L=0.60, n=2),
             "classica": dict(L=0.60, n=3), "campestre": dict(L=0.60, n=3), "colonial": dict(L=0.60, n=3),
             "creme": dict(L=0.60, n=2)}[L]
    canto_kw = {
        "moderna": dict(cols2=[(1, [("gaveta", 0.3), ("porta", 0.7, {"lado": "dir"})])]),
        "grafite": dict(cols1=[(1, [("gaveta", 1 / 3)] * 3)]),
        "classica": dict(cols1=[(1, [("gaveta", 0.5)] * 2)]),
        "campestre": dict(),
        "colonial": dict(cols1=[(1, [("gaveta", 0.5)] * 2)]),
        "verde": dict(cols1=[(1, [("gaveta", 1 / 3)] * 3)]),
        "creme": dict(cols2=[(1, [("gaveta", 0.3), ("porta", 0.7, {"lado": "dir"})])]),
    }[L]
    fog_kw = {"moderna": {}, "grafite": {}, "classica": {}, "campestre": dict(gaveta=True), "colonial": {},
              "verde": dict(gaveta=True), "creme": dict(gaveta=True)}[L]
    ilha_kw = {"campestre": dict(cols=[(1, [("portas2", 1)])]),
               "colonial": dict(cols=[(0.5, [("gaveta", 0.3), ("porta", 0.7)]), (0.5, [("gaveta", 0.3),
                                                                                         ("porta", 0.7)])]),
               "verde": dict(cols=[(1, [("portas2", 1)])])}.get(L, {})
    ts = [
        T("base_1porta", "armario_cozinha_base_1porta", "Armário de cozinha de 1 porta", t_base_1porta, True,
          ["base", "porta"]),
        T("base_gaveta_porta", "armario_cozinha_base_gaveta_porta", "Armário de cozinha com gaveta e porta",
          t_base_gaveta_porta, False, ["base", "gaveta", "porta"]),
        T("base_2portas", "armario_cozinha_base_2portas", "Armário de cozinha de 2 portas", t_base_2portas, True,
          ["base", "portas"], gavetas=L in ("grafite", "verde")),
        T("gaveteiro", "gaveteiro_cozinha_%dgavetas" % g_kw["n"], "Gaveteiro de cozinha de %d gavetas" % g_kw["n"],
          t_gaveteiro, True, ["base", "gavetas"], **g_kw),
        T("gaveteiro_largo", "gaveteiro_cozinha_largo_%dgavetas" % g2_kw["n"],
          "Gaveteiro largo de %d gavetas" % g2_kw["n"], t_gaveteiro, False, ["base", "gavetas"], **g2_kw),
        T("pia", "armario_cozinha_pia", "Armário de pia", t_pia, True, ["pia", "cuba", "torneira"], **pia_kw),
        T("fogao", "fogao_modulo", "Fogão de módulo com forno", t_fogao, True, ["fogao", "forno"], **fog_kw),
        T("canto", "armario_cozinha_canto", "Armário de canto em L", t_canto, True, ["canto"], **canto_kw),
        T("ponta", "armario_cozinha_ponta_curva", "Ponta curva aberta", t_ponta, False, ["ponta", "aberto"]),
        T("nicho", "nicho_cozinha", "Nicho aberto de cozinha", t_nicho, False, ["aberto", "prateleiras"]),
        T("parede_1porta", "armario_parede_1porta", "Armário de parede de 1 porta", t_parede_1porta, True,
          ["parede"], fix="parede"),
        T("parede_2portas", "armario_parede_2portas", "Armário de parede de 2 portas", t_parede_2portas, True,
          ["parede"], fix="parede"),
        T("parede_vidro", "armario_parede_vidro", "Armário de parede com portas de vidro", t_parede_vidro, False,
          ["parede", "vidro"], fix="parede"),
        T("paneleiro", "paneleiro", "Paneleiro alto com nicho", t_paneleiro_colonial if L == "colonial" else
          t_paneleiro, False, ["alto", "nicho"]),
        T("prateleira", "prateleira_cozinha", "Prateleira de cozinha", t_prateleira, False, ["parede", "prateleira"],
          fix="parede"),
        T("ilha", "ilha_cozinha", "Ilha de cozinha com nicho", t_ilha, False, ["ilha", "nicho"], **ilha_kw),
    ]
    if L == "campestre":  # o pacote já traz a base de 2 portas e os armários de parede desta linha
        ts = [t for t in ts if t["tipo"] not in ("base_2portas", "parede_1porta", "parede_2portas")]
        ts.append(T("parede_nicho", "armario_parede_nicho", "Armário de parede com nicho", t_parede_nicho, False,
                    ["parede", "nicho"], fix="parede"))
    if L == "colonial":
        for t in ts:
            if t["tipo"] == "parede_vidro":
                t["rotulo"] = "Armário de parede com portas de treliça"
                t["id_base"] = "armario_parede_trelica"
                t["cores"] = True
    if L == "creme":
        ts.append(T("parede_nicho", "armario_parede_nicho", "Armário de parede com nicho", t_parede_nicho, True,
                    ["parede", "nicho"], fix="parede"))
        ts.append(T("parede_aberto", "nicho_parede", "Nicho de parede aberto", t_parede_aberto, False,
                    ["parede", "aberto", "prateleira"], fix="parede"))
        ts.append(T("parede_alto", "armario_parede_alto_2portas", "Armário de parede alto de 2 portas",
                    t_parede_alto, False, ["parede", "portas"], fix="parede"))
    if L in ("grafite", "classica"):
        ts.append(T("canto_pia", "armario_cozinha_canto_pia", "Armário de canto em L com pia", t_canto, True,
                    ["canto", "pia", "cuba", "torneira"], pia=True,
                    cols1=[(1, [("gaveta", 0.5)] * 2)] if L == "classica" else None))
    if L == "classica":
        ts.append(T("pia_ponta", "armario_cozinha_pia_ponta_curva", "Pia com ponta curva", t_pia_ponta, True,
                    ["pia", "ponta", "cuba", "torneira"]))
        ts.append(T("ponta_dir", "armario_cozinha_ponta_curva_direita", "Ponta curva aberta (direita)", t_ponta,
                    False, ["ponta", "aberto"], lado="dir"))
    if L == "colonial":
        ts.append(T("canto_parede", "armario_parede_canto_chanfrado", "Armário de parede de canto chanfrado",
                    t_canto_parede_chanfrado, True, ["parede", "canto", "trelica"], fix="parede"))
    if L == "verde":
        ts.append(T("maquina_lavar", "maquina_lavar_modulo", "Máquina de lavar de módulo", t_maquina_lavar, True,
                    ["lavanderia", "porta"]))
    if L == "moderna":
        ts.append(T("banco_baixo", "banco_prateleira_baixa", "Banco com prateleira baixa", t_banco_baixo, True,
                    ["banco", "prateleira"]))
    return ts


def t_pia_ponta(E, it, L=1.20, P=0.60):
    """Pia com a ponta esquerda em meia-lua (clássica): a cuba fica sobre a ponta arredondada do corpo."""
    te = E.te
    zb, zt = E.hp, BANCADA - te
    R = P / 2
    Lr = L - R  # parte reta, à direita
    xr0 = -L / 2 + R
    yb = -P / 2 + E.bal + E.ef
    Pc = P / 2 - yb
    w = E.w
    Lc = Lr - E.recuo
    xc_ = xr0 + Lc / 2
    it.add(casco(E.com(r_casco=0.004), Lc, zt - zb, Pc, x=xc_, yb=yb, zb=zb, topo=False))
    it.add(fundo_painel(E, Lc, zt - zb, P / 2, zb, x=xc_))
    cols = [(0.4, [("gaveta", 0.5)] * 2), (0.6, [("portas2", 1)])]
    celulas(Cx(E, it, yb, Pc - 0.015, pia=True), xr0 + w, xr0 + Lc - w, zb + w, zt - w, cols)
    # ponta em meia-lua: corpo curvo fechado (parede curva) com a cor do corpo
    n = 16
    kk = E.bal + 0.012
    meia = [(xr0 + 0.01, P / 2 - kk)] + [(xr0 + (R - kk) * math.cos(math.radians(90 + 180 * i / n)),
                                          (R - kk) * math.sin(math.radians(90 + 180 * i / n))) for i in range(n + 1)] + \
           [(xr0 + 0.01, -P / 2 + kk)]
    parede_curva = placa(meia, [], esp=zt - zb, z=zb, cor=E.corpo, bisel=0.012)
    it.add(parede_curva)
    pts = [(xr0 + (R - 0.07) * math.cos(math.radians(a_)), (R - 0.07) * math.sin(math.radians(a_))) for a_ in
           (135, 225)]
    it.add(pes(E, meia, pts + [(xr0 + Lc - 0.045, yb + 0.045), (xr0 + Lc - 0.045, P / 2 - 0.045)]))
    cont = [(L / 2 - 0.001, P / 2), ] + [(xr0 + R * math.cos(math.radians(90 + 180 * i / 18)),
                                          R * math.sin(math.radians(90 + 180 * i / 18)) * (P - 0.001) / P)
                                         for i in range(19)] + [(L / 2 - 0.001, -P / 2 + 0.0005)]
    li, pi_ = 0.4, 0.34
    cxs, cys = xr0 + Lc * 0.7, -0.03
    furo = furo_cuba("redonda", cxs, cys, li, pi_)
    it.add(tampo(E, cont, [furo]))
    it.add(cuba("redonda", cxs, cys, BANCADA, li, pi_, prof=0.15, cor_=E.cuba_cor))
    it.add(torneira("pescoco", cxs, cys + pi_ / 2 + 0.07, BANCADA, E.torneira_cor, alcance=0.14))


ESPECIAIS = [
    # (id_base, tipo, rótulo, fn, estilo_base, [(sufixo_cor, rótulo_cor, dict)], tags, fix)
    ("fogao_ferro", "fogao_ferro", "Fogão de ferro", t_fogao_ferro,
     [("preto", "preto", dict(ferro_cor="grafite_escuro", ferro_met="ouro")),
      ("vermelho", "vermelho", dict(ferro_cor="vermelho_escuro", ferro_met="cromo")),
      ("azul", "azul", dict(ferro_cor="azul_noite", ferro_met="latao"))], ["fogao", "forno", "retro"]),
    ("fogao_retro_fofo", "fogao_retro_fofo", "Fogão retrô arredondado", t_fogao_retro,
     [("lilas", "lilás", dict(r_corpo="lilas_claro", r_det="roxo", r_topo="lilas_claro")),
      ("rosa", "rosa", dict(r_corpo="rosa_claro", r_det="rosa_escuro", r_topo="rosa_claro")),
      ("menta", "menta", dict(r_corpo="menta", r_det="verde_medio", r_topo="menta"))], ["fogao", "forno", "retro"]),
    ("fogao_retro_branco", "fogao_retro_branco", "Fogão retrô de 2 bocas", t_fogao_retro,
     [("rosa", "branco e rosa", dict(r_corpo="branco", r_det="rosa", r_topo="lilas_claro", r_grade="cinza_azulado",
                                     r_base="laranja")),
      ("azul", "branco e azul", dict(r_corpo="branco", r_det="azul_celeste", r_topo="azul_bebe",
                                     r_grade="cinza_azulado", r_base="amarelo"))], ["fogao", "forno", "retro"]),
]


def montar_inventario():
    inv = []
    for linha, E in ESTILOS.items():
        for t in tipos_comuns(linha):
            ids = [(None, None, E)]
            if t["cores"]:
                for suf, rot, d in CORES_LINHA[linha][:1]:
                    ids.append((suf, rot, E.com(**d)))
                if linha in ("moderna", "verde", "creme", "grafite", "classica", "campestre", "colonial") and \
                        t["tipo"] in SEGUNDA_COR:
                    suf, rot, d = CORES_LINHA[linha][1]
                    ids.append((suf, rot, E.com(**d)))
            for suf, rot, Ev in ids:
                id_ = f"{t['id_base']}_{linha}" + (f"_{suf}" if suf else "")
                rotulo = f"{t['rotulo']} ({E.rot}" + (f", {rot})" if rot else ")")
                inv.append(dict(id=id_, linha=linha, grupo=f"{t['tipo']}_{linha}", rotulo=rotulo, fn=t["fn"],
                                kw=t["kw"], E=Ev, tags=["cozinha", linha] + t["tags"], fix=t["fix"]))
    # campestre: pacote gratuito (e as mesmas peças nas cores da linha)
    Ec = ESTILOS["campestre"]
    pac = [
        ("armario_cozinha_base_2portas_campestre", "base_2portas_campestre", "Armário de cozinha de 2 portas com toalha",
         t_pacote_d01, ["base", "portas", "toalha"], "chao", True),
        ("mesa_redonda_toalha_campestre", "mesa_redonda_campestre", "Mesa redonda com toalha", t_pacote_d06,
         ["mesa", "toalha"], "chao", True),
        ("armario_parede_1porta_campestre", "parede_1porta_campestre", "Armário de parede de 1 porta",
         t_pacote_parede("Kitchen_D_08", {"Door": "dir"}, [("prateleira", (0, -0.215, 0.08), (0.4, 0.18, 0.44))]),
         ["parede"], "parede", True),
        ("armario_parede_nicho_porta_campestre", "parede_nicho_porta_campestre", "Armário de parede com nicho e porta",
         t_pacote_parede("Kitchen_D_09", {"Door": "dir"}, [("nicho", (-0.2, -0.18, 0.12), (0.3, 0.24, 0.36)),
                                                          ("prateleira", (0.2, -0.18, 0.12), (0.3, 0.24, 0.36))]),
         ["parede", "nicho"], "parede", False),
        ("armario_parede_2portas_campestre", "parede_2portas_campestre", "Armário de parede de 2 portas",
         t_pacote_parede("Kitchen_D_10", {"Door_01": "esq", "Door_02": "dir"},
                         [("prateleira", (0, -0.18, 0.12), (0.66, 0.24, 0.36))]), ["parede"], "parede", True),
    ]
    for id_, grupo, rot, fn, tags, fix, cores in pac:
        inv.append(dict(id=id_ + "_pacote", linha="campestre", grupo=grupo, rotulo=f"{rot} (campestre)", fn=fn, kw={},
                        E=Ec, tags=["cozinha", "campestre"] + tags, fix=fix, pacote=True))
        if cores:
            suf, rr_, _ = CORES_LINHA["campestre"][0]
            inv.append(dict(id=f"{id_}_{suf}_pacote", linha="campestre", grupo=grupo, rotulo=f"{rot} (campestre, {rr_})",
                            fn=fn, kw=dict(troca=TROCA_CAMPESTRE[suf]), E=Ec, tags=["cozinha", "campestre"] + tags,
                            fix=fix, pacote=True))
    # banqueta campestre
    for suf, rot, d in ((None, None, {}), ("azul", "azul", dict(toalha="azul", pe_madeira="madeira_clara")),
                        ("amarelo", "amarelo", dict(toalha="amarelo", pe_madeira="madeira_mel"))):
        inv.append(dict(id="banqueta_campestre" + (f"_{suf}" if suf else ""), linha="campestre",
                        grupo="banqueta_campestre", rotulo="Banqueta redonda (campestre" + (f", {rot})" if rot else ")"),
                        fn=t_banqueta, kw={}, E=Ec.com(**d), tags=["cozinha", "campestre", "banqueta", "assento"],
                        fix="chao"))
    for id_b, tipo, rot, fn, cores, tags in ESPECIAIS:
        for suf, rr_, d in cores:
            kw = dict(fofo=False) if tipo == "fogao_retro_branco" else {}
            inv.append(dict(id=f"{id_b}_{suf}", linha="especiais", grupo=tipo, rotulo=f"{rot} ({rr_})", fn=fn, kw=kw,
                            E=Estilo(BASE).com(**d), tags=["cozinha"] + tags, fix="chao"))
    return inv


# tipos que também ganham a segunda variação de cor
SEGUNDA_COR = {"base_2portas", "pia", "parede_2portas"}


def banco_cores(E):
    return E


def ajusta_especiais(inv):
    """Banco baixo da moderna: cores próprias (o rosa e turquesa da referência)."""
    for e in inv:
        if e["fn"] is t_banco_baixo:
            if e["id"].endswith("_coral"):
                e["E"] = e["E"].com(porta2b="amarelo", pe2="turquesa_escuro")
            elif e["id"].endswith("_menta"):
                e["E"] = e["E"].com(porta2b="branco", pe2="rosa_escuro")
            else:
                e["E"] = e["E"].com(porta2b="vermelho", pe2="turquesa")
        if e["fn"] is t_maquina_lavar:
            if e["id"].endswith("_rosa"):
                e["E"] = e["E"].com(maq_corpo="branco", maq_topo="rosa", maq_anel="verde_agua")
            elif e["id"].endswith("_azul"):
                e["E"] = e["E"].com(maq_corpo="branco", maq_topo="azul_celeste", maq_anel="amarelo")
    return inv


# =====================================================================================================================
# Execução
# =====================================================================================================================
def seleciona(inv):
    if not FILTROS or FILTROS == ["lista"]:
        return inv
    out = []
    for e in inv:
        for f in FILTROS:
            if f == "lista":
                continue
            if f.startswith("linha=") and e["linha"] == f[6:]:
                out.append(e)
                break
            if f.startswith("grupo=") and e["grupo"].startswith(f[6:]):
                out.append(e)
                break
            if f.startswith("~") and f[1:] in e["id"]:
                out.append(e)
                break
            if f == e["id"]:
                out.append(e)
                break
    return out


def main():
    inv = ajusta_especiais(montar_inventario())
    ids = [e["id"] for e in inv]
    assert len(ids) == len(set(ids)), [i for i in ids if ids.count(i) > 1]
    sel = seleciona(inv)
    if "lista" in FILTROS:
        from collections import Counter
        print("total", len(inv), "grupos", len(set(e["grupo"] for e in inv)))
        print(Counter(e["linha"] for e in inv))
        for e in sel:
            print(e["id"], "|", e["grupo"], "|", e["rotulo"])
        return
    cat = mb.Catalogo(CAT, SAIDA, "Móveis de cozinha")
    for e in sel:
        mb.limpa()
        it = mb.Item(e["id"])
        e["fn"](e["E"], it, **e["kw"])
        if os.environ.get("COZINHA_PERFIL"):
            tri = lambda o: sum(len(p.vertices) - 2 for p in o.data.polygons)
            ps = sorted(((tri(o), o.name) for o in it.partes), reverse=True)
            print("PERFIL", e["id"], sum(t for t, _ in ps), ps[:12])
            print("PERFIL inter", [(o.name, tri(o)) for o, _ in it.interativos])
            continue
        extra = {"linha": e["linha"]}
        alt = None
        if e["fix"] == "parede":
            alt = 1.45 if "prateleira" not in e["id"] else 1.5
            if e["grupo"].startswith("prateleira"):
                alt = 1.5
        g = e["grupo"]
        md = (0.55, -1.0, 0.5)
        if g.startswith("canto_parede"):
            md = (-0.75, -1.0, 0.35)
        elif g.startswith("canto_"):  # cantos em L: as portas olham para o canto de dentro (frente-esquerda)
            md = (-0.85, -1.0, 0.75)
        elif g.startswith("ponta_") and not g.startswith("ponta_dir"):
            md = (-0.75, -1.0, 0.55)
        cat.exporta(it, e["rotulo"], grupo=g, fixacao=e["fix"], altura_instalacao=alt,
                    pacote=e.get("pacote", False), tags=e["tags"], extra=extra, miniatura_dir=md)
    # remove do catálogo ids que não existem mais no inventário
    validos = set(ids)
    cat.dados["itens"] = [x for x in cat.dados["itens"] if x["id"] in validos]
    cat.salva()
    print("ok", len(sel))


main()
