"""Prédios de estilo regular (cidade comum) da biblioteca de cidade do Morada.

Uso (de SP):
    python3 -I morada-art/predios_regulares_estampas.py SP/cidade_out          # letreiros (uma vez)
    MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/predios_regulares.py -- SP/cidade_out [ids]

Grava SP/cidade_out/predios_regulares/ (glb/, miniaturas/, catalogo.json).

Convenções: lote de 15 × 15 m (projeção até 13 × 13 m; 2 × 1 até 28 × 13 m), origem no centro da projeção, base em
z = 0, frente para −Y. Andar de 3,2 m, térreo comercial de 4,2 m. Janelas com os materiais janela / janela_fria /
janela_apagada (≈ 40 % apagadas), cada vidro uma face própria. Letreiros com estampa própria (atlas de palavras
genéricas em português), que acende de leve à noite.
"""
import bisect
import json
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import moveis_base as mb  # noqa: E402
import cidade_base as cb  # noqa: E402

V = Vector
ANDAR = cb.ANDAR
TERREO = 4.2
ESTILO = "regular"
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
SAIDA = ARGS[0] if ARGS else os.path.join(os.path.dirname(mb.AQUI), "cidade_out")
FILTRO = set(ARGS[1:])
PASTA_EST = os.path.join(SAIDA, "predios_regulares", "estampas")


# =====================================================================================================================
# Estampa dos letreiros
# =====================================================================================================================
_EST = {}


def estampa():
    if not _EST:
        png = os.path.join(PASTA_EST, "letreiros.png")
        _EST["info"] = json.load(open(os.path.join(PASTA_EST, "letreiros.json")))
        _EST["mat"] = mb.material_estampa("letreiros_regulares", png)
        m = bpy.data.materials["estampa_letreiros_regulares"]
        nt = m.node_tree
        b = nt.nodes["Principled BSDF"]
        tx = next(n for n in nt.nodes if n.type == "TEX_IMAGE")
        if not b.inputs["Emission Color"].is_linked:  # o letreiro acende de leve (a letra clara brilha à noite)
            nt.links.new(tx.outputs["Color"], b.inputs["Emission Color"])
        b.inputs["Emission Strength"].default_value = 0.55
    return _EST


# =====================================================================================================================
# Geometria básica
# =====================================================================================================================
def Mf(p, nrm, z=0.0):
    """Matriz da fachada: origem em p (no plano da parede), −Y local = normal de fora nrm."""
    th = math.atan2(nrm[0], -nrm[1])
    return Matrix.Translation((p[0], p[1], z)) @ Matrix.Rotation(th, 4, "Z")


FRENTE = Matrix.Identity(4)


def fachada(x=0.0, y=0.0, lado="frente"):
    """Matriz de uma fachada reta: frente (−Y), fundos (+Y), esq (−X), dir (+X); (x, y) é um ponto do plano."""
    n = {"frente": (0, -1), "fundos": (0, 1), "esq": (-1, 0), "dir": (1, 0)}[lado]
    return Mf((x, y), n)


def tm(ob, M):
    ob.data.transform(M)
    return ob


def cx(M, l, p, a, x=0.0, y=0.0, z=0.0, cor="branco", bisel=0.03, seg=2, mat="atlas"):
    """Caixa boleada em coordenadas de fachada."""
    return tm(mb.caixa(l, p, a, x=x, y=y, z=z, cor=cor, bisel=bisel, seg=seg, mat=mat), M)


def cil(M, r, a, x=0.0, y=0.0, z=0.0, cor="branco", seg=16, bisel=0.02, r2=None, eixo="z", mat="atlas"):
    return tm(mb.cilindro(r, a, x=x, y=y, z=z, cor=cor, seg=seg, bisel=bisel, r2=r2, eixo=eixo, mat=mat), M)


def rr(l, p, r, seg=5, x=0.0, y=0.0):
    return [(px + x, py + y) for px, py in mb.ret_arredondado(l, p, r, seg)]


def ret(l, p, x=0.0, y=0.0):
    return [(x - l / 2, y - p / 2), (x + l / 2, y - p / 2), (x + l / 2, y + p / 2), (x - l / 2, y + p / 2)]


def ret_cantos(l, p, raios, seg=6, x=0.0, y=0.0):
    """Retângulo com um raio por canto: raios = (sudoeste, sudeste, nordeste, noroeste)."""
    pts = []
    for (cx_, cy_, a0), r in zip(((-1, -1, 180), (1, -1, 270), (1, 1, 0), (-1, 1, 90)), raios):
        if r <= 0.001:
            pts.append((x + cx_ * l / 2, y + cy_ * p / 2))
            continue
        ox, oy = x + cx_ * (l / 2 - r), y + cy_ * (p / 2 - r)
        n = max(2, int(seg * max(1.0, r / 1.5)))
        for k in range(n + 1):
            t = math.radians(a0 + 90 * k / n)
            pts.append((ox + r * math.cos(t), oy + r * math.sin(t)))
    return pts


def ccw(pts):
    return mb._ccw([tuple(p) for p in pts])


def prisma(cont, z, a, cor="branco", bisel=0.05, seg=2, mat="atlas"):
    return mb.extrudado(ccw(cont), a, z=z, cor=cor, bisel=bisel, seg=seg, mat=mat, nome="prisma")


def offset(cont, d):
    """Contorno deslocado d para fora (mesmo número de pontos, na mesma ordem)."""
    pts = [V(p) for p in ccw(cont)]
    n = len(pts)
    out = []
    for i in range(n):
        a, b, c = pts[i - 1], pts[i], pts[(i + 1) % n]
        t1, t2 = (b - a), (c - b)
        if t1.length < 1e-9:
            t1 = t2
        if t2.length < 1e-9:
            t2 = t1
        t1.normalize()
        t2.normalize()
        n1, n2 = V((t1.y, -t1.x)), V((t2.y, -t2.x))
        m = n1 + n2
        if m.length < 1e-6:
            m = n1.copy()
        m.normalize()
        k = d / max(0.35, m.dot(n1))
        out.append((b.x + m.x * k, b.y + m.y * k))
    return out


def anel(ext, int_, z, a, cor="branco", bisel=0.0, mat="atlas", seg=2):
    """Parede em anel entre dois contornos com os mesmos pontos (platibanda, guarda-corpo, faixa)."""
    e, i_ = ccw(ext), ccw(int_)
    assert len(e) == len(i_)
    bm = bmesh.new()
    eb = [bm.verts.new((x, y, z)) for x, y in e]
    et = [bm.verts.new((x, y, z + a)) for x, y in e]
    ib = [bm.verts.new((x, y, z)) for x, y in i_]
    it = [bm.verts.new((x, y, z + a)) for x, y in i_]
    n = len(e)
    for k in range(n):
        j = (k + 1) % n
        bm.faces.new((eb[k], eb[j], et[j], et[k]))
        bm.faces.new((ib[j], ib[k], it[k], it[j]))
        bm.faces.new((et[k], et[j], it[j], it[k]))
        bm.faces.new((eb[j], eb[k], ib[k], ib[j]))
    if bisel > 0:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        ed = [x for x in bm.edges if len(x.link_faces) == 2 and x.link_faces[0].normal.dot(x.link_faces[1].normal) < 0.5]
        mb._bevel(bm, bisel, seg, ed)
    return mb._obj("anel", bm, cor, mat, liso=True, angulo=40)


def platibanda(cont, z, a=0.9, esp=0.3, cor="branco", cor_teto="cinza_claro", sobra=0.12, bisel=0.06):
    """Platibanda (mureta do telhado) gorda e boleada + laje do teto."""
    ext = offset(cont, sobra)
    return [anel(ext, offset(cont, sobra - esp), z, a, cor, bisel=bisel),
            prisma(offset(cont, -0.02), z - 0.02, 0.08, cor_teto, bisel=0)]


def laje_borda(cont, z, a=0.3, sobra=0.2, cor="branco", bisel=0.06, seg=2):
    return prisma(offset(cont, sobra), z, a, cor, bisel=bisel, seg=seg)


def moita(x, y, z, r, cor="folha", esc=(1, 1, 0.85)):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r)
    bm.transform(Matrix.Translation((x, y, z + r * esc[2] * 1.0)) @ Matrix.Diagonal((*esc, 1)))
    return mb._obj("moita", bm, cor, liso=True, angulo=80)


# =====================================================================================================================
# Acumulador de caixas simples (janelas, vidros, faixas): uma malha por cor/material
# =====================================================================================================================
_CUBO = [(-1, -1, 0), (1, -1, 0), (1, 1, 0), (-1, 1, 0), (-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)]
_FACES = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]


class Acc:
    def __init__(self):
        self.bms = {}

    def caixa(self, M, l, p, a, x=0.0, y=0.0, z=0.0, cor=None, mat="atlas"):
        k = (cor, mat)
        bm = self.bms.get(k) or self.bms.setdefault(k, bmesh.new())
        vs = [bm.verts.new(M @ V((x + sx * l / 2, y + sy * p / 2, z + sz * a))) for sx, sy, sz in _CUBO]
        for f in _FACES:
            bm.faces.new([vs[i] for i in f])

    def objs(self):
        out = []
        for (cor, mat), bm in self.bms.items():
            out.append(mb._obj("acc", bm, cor or "branco", mat, liso=False))
        self.bms = {}
        return out


def sorteia(rnd, apagadas=0.4, frias=0.25):
    r = rnd.random()
    return "janela_apagada" if r < apagadas else ("janela_fria" if r < apagadas + frias else "janela")


# =====================================================================================================================
# Contornos: trechos e linhas
# =====================================================================================================================
class Linha:
    def __init__(self, pts, fechada=False):
        self.p = [V(q) for q in pts]
        self.fechada = fechada
        self.cum = [0.0]
        for a, b in zip(self.p, self.p[1:]):
            self.cum.append(self.cum[-1] + (b - a).length)
        self.L = self.cum[-1]

    def em(self, t):
        if self.fechada:
            t %= self.L
        t = max(0.0, min(self.L, t))
        i = min(bisect.bisect_right(self.cum, t) - 1, len(self.p) - 2)
        s = self.cum[i + 1] - self.cum[i]
        f = (t - self.cum[i]) / s if s > 0 else 0.0
        return self.p[i].lerp(self.p[i + 1], f)

    def entre(self, ta, tb):
        return [self.p[i] for i in range(len(self.p)) if ta < self.cum[i] < tb]


def trechos(cont, quebra=10.0):
    """Divide o contorno nos cantos (giro > quebra graus). Devolve [Linha]; curva suave vira uma linha só."""
    pts = [V(p) for p in ccw(cont)]
    n = len(pts)

    def giro(i):
        d1, d2 = pts[i] - pts[i - 1], pts[(i + 1) % n] - pts[i]
        if d1.length < 1e-9 or d2.length < 1e-9:
            return 0.0
        return math.degrees(d1.angle(d2))

    br = [i for i in range(n) if giro(i) > quebra]
    if not br:
        return [Linha(pts + [pts[0]], fechada=True)]
    out = []
    for k, i in enumerate(br):
        j = br[(k + 1) % len(br)]
        seq, m = [], i
        while True:
            seq.append(pts[m])
            if m == j and len(seq) > 1:
                break
            m = (m + 1) % n
        out.append(Linha(seq))
    return out


def _normal(t):
    return V((t.y, -t.x))


def janela(acc, M, w, h, z, moldura="branco", mat="janela", sal=0.06, e=0.09, peitoril=True, capota=None,
           divisao=True, u=0.0):
    acc.caixa(M, w + 2 * e, sal, h + 2 * e, x=u, y=-sal / 2, z=z - e, cor=moldura)
    acc.caixa(M, w, 0.03, h, x=u, y=-sal - 0.01, z=z, mat=mat)
    if divisao and w > 1.0:
        acc.caixa(M, 0.07, 0.03, h, x=u, y=-sal - 0.03, z=z, cor=moldura)
    if peitoril:
        acc.caixa(M, w + 2 * e + 0.12, sal + 0.1, 0.08, x=u, y=-(sal + 0.1) / 2, z=z - e - 0.08, cor=moldura)
    if capota:
        acc.caixa(M, w + 2 * e + 0.1, 0.42, 0.1, x=u, y=-0.21, z=z + h + e + 0.06, cor=capota)


def janelas_contorno(acc, cont, z0, andares, alt_andar=ANDAR, passo=2.2, larg=1.1, alt=1.4, peit=0.9,
                     moldura="branco", sem=1, quebra=10.0, margem=0.45, pular=None, sel=None, apagadas=0.4,
                     frias=0.25, ar=0.0, ar_cor="cinza_claro", **k):
    """Janelas soltas em volta de um contorno (paredes retas e curvas). sel(nrm) escolhe as fachadas; pular(i, s,
    andar, p, nrm) pula uma janela (porta, letreiro). ar = chance de um ar-condicionado embaixo da janela."""
    rnd = random.Random(sem)
    n_jan = 0
    for i, ln in enumerate(trechos(cont, quebra)):
        L = ln.L
        if ln.fechada:
            n = int(L / passo)
            ss = [L / max(1, n) * (q + 0.5) for q in range(n)]
        else:
            n = int((L - 2 * margem + passo - larg) / passo + 1e-6)
            if n <= 0:
                continue
            ini = (L - (n - 1) * passo) / 2
            ss = [ini + passo * q for q in range(n)]
        for s in ss:
            a, b, p = ln.em(s - larg / 2), ln.em(s + larg / 2), ln.em(s)
            if (b - a).length < 1e-6:
                continue
            t = (b - a).normalized()
            nrm = _normal(t)
            p = p + nrm * max(0.0, ((a + b) / 2 - p).dot(nrm))
            if sel and not sel(nrm):
                continue
            M = Mf(p, nrm)
            for j in range(andares):
                if pular and pular(i, s, j, p, nrm):
                    continue
                z = z0 + j * alt_andar + peit
                janela(acc, M, larg, alt, z, moldura, sorteia(rnd, apagadas, frias), **k)
                n_jan += 1
                if ar and rnd.random() < ar:
                    acc.caixa(M, 0.75, 0.45, 0.5, x=0.0, y=-0.25, z=z - 0.75, cor=ar_cor)
                    acc.caixa(M, 0.42, 0.03, 0.36, x=0.12, y=-0.48, z=z - 0.68, cor="cinza_medio")
    return n_jan


def faixa_vidro(acc, cont, z0, z1, painel=1.6, sem=1, quebra=10.0, sal=0.05, folga=0.09, sel=None, pular=None,
                apagadas=0.4, frias=0.25, min_trecho=0.7, mats=None):
    """Faixa de vidro contínua em volta do contorno, cortada em painéis (cada painel uma face com material próprio)."""
    rnd = random.Random(sem)
    for i, ln in enumerate(trechos(cont, quebra)):
        L = ln.L
        if L < min_trecho:
            continue
        n = max(1, int(round(L / painel)))
        for q in range(n):
            ta, tb = L * q / n + folga / 2, L * (q + 1) / n - folga / 2
            a, b = ln.em(ta), ln.em(tb)
            w = (b - a).length
            if w < 0.2:
                continue
            t = (b - a) / w
            nrm = _normal(t)
            if sel and not sel(nrm):
                continue
            if pular and pular(i, (ta + tb) / 2, (a + b) / 2, nrm):
                continue
            off = max([0.0] + [(c - a).dot(nrm) for c in ln.entre(ta, tb)])
            c = (a + b) / 2 + nrm * off
            mat = mats[q % len(mats)] if mats else sorteia(rnd, apagadas, frias)
            acc.caixa(Mf(c, nrm), w, sal, z1 - z0, y=-sal / 2, z=z0, mat=mat)


# =====================================================================================================================
# Térreo: portas, vitrines, toldos, marquises, letreiros
# =====================================================================================================================
def porta(acc, objs, M, u=0.0, larg=1.8, alt=2.5, moldura="branco", marquise=None, degraus=0, z=0.0,
          mat="janela", marq_prof=1.4):
    """Porta de entrada de vidro com moldura gorda, puxadores, degraus e marquise opcional."""
    objs.append(cx(M, larg + 0.36, 0.16, alt + 0.2, x=u, y=-0.07, z=z, cor=moldura, bisel=0.05))
    acc.caixa(M, larg, 0.04, alt, x=u, y=-0.17, z=z, mat=mat)
    acc.caixa(M, 0.08, 0.05, alt, x=u, y=-0.19, z=z, cor=moldura)
    for s in (-1, 1):
        acc.caixa(M, 0.05, 0.08, 0.7, x=u + s * 0.16, y=-0.24, z=z + alt * 0.4, cor="cromo")
    for k in range(degraus):
        acc.caixa(M, larg + 0.8 - k * 0.2, 0.35 * (degraus - k) + 0.1, 0.17, x=u, y=-(0.35 * (degraus - k) + 0.1) / 2,
                  z=z - 0.17 * (degraus - k), cor="concreto")
    if marquise:
        objs.append(cx(M, larg + 1.2, marq_prof, 0.2, x=u, y=-marq_prof / 2, z=z + alt + 0.35, cor=marquise,
                       bisel=0.07))


def vitrine_loja(acc, objs, M, u0, u1, z=0.0, alt=3.0, moldura="branco", porta_u=None, painel=1.5, sem=3,
                 rodape="cinza_medio"):
    """Vitrine de loja: vidros grandes com montantes, rodapé e porta. As lojas ficam acesas à noite."""
    rnd = random.Random(sem)
    L = u1 - u0
    n = max(1, int(round(L / painel)))
    w = L / n
    acc.caixa(M, L + 0.2, 0.14, 0.45, x=(u0 + u1) / 2, y=-0.07, z=z, cor=rodape)
    objs.append(cx(M, L + 0.3, 0.2, 0.22, x=(u0 + u1) / 2, y=-0.1, z=z + alt, cor=moldura, bisel=0.05))
    for k in range(n + 1):
        acc.caixa(M, 0.12, 0.16, alt - 0.45, x=u0 + w * k, y=-0.08, z=z + 0.45, cor=moldura)
    for k in range(n):
        uc = u0 + w * (k + 0.5)
        mat = "janela" if rnd.random() < 0.75 else "janela_fria"
        acc.caixa(M, w - 0.1, 0.04, alt - 0.5, x=uc, y=-0.06, z=z + 0.47, mat=mat)
    if porta_u is not None:
        acc.caixa(M, 1.2, 0.06, 2.3, x=porta_u, y=-0.1, z=z + 0.02, mat="janela")
        acc.caixa(M, 1.4, 0.1, 0.1, x=porta_u, y=-0.12, z=z + 2.32, cor=moldura)
        acc.caixa(M, 0.05, 0.08, 0.6, x=porta_u + 0.4, y=-0.17, z=z + 0.9, cor="cromo")


def toldo(acc, M, u0, u1, z, prof=1.3, queda=0.6, cores=("vermelho", "branco"), listra=0.55, babado=True):
    """Toldo listrado inclinado (com babado na frente) preso na fachada em z."""
    L = u1 - u0
    n = max(2, int(round(L / listra)))
    w = L / n
    comp = math.hypot(prof, queda)
    fi = math.atan2(queda, prof)
    for k in range(n):
        uc = u0 + w * (k + 0.5)
        Mk = M @ Matrix.Translation((uc, 0, z)) @ Matrix.Rotation(fi, 4, "X")
        cor = cores[k % 2]
        acc.caixa(Mk, w + 0.002, comp, 0.07, y=-comp / 2, z=-0.07, cor=cor)
        if babado:
            acc.caixa(M, w + 0.002, 0.05, 0.3, x=uc, y=-prof - 0.02, z=z - queda - 0.3, cor=cor)
    for s in (u0, u1):  # bochechas
        acc.caixa(M, 0.05, prof, 0.25, x=s, y=-prof / 2, z=z - queda * 0.7 - 0.1, cor=cores[0])


def placa(objs, nome, M, u, z, larg, prof=0.12, borda=0.14, cor_borda="grafite_escuro", alt=None, luzes=None,
          acc=None):
    """Letreiro com estampa (frente) e moldura gorda. z = base da área do texto. luzes: acc para lâmpadas."""
    e = estampa()
    info = e["info"][nome]
    alt = alt or larg / info["aspecto"]
    objs.append(cx(M, larg + 2 * borda, prof, alt + 2 * borda, x=u, y=-prof / 2, z=z - borda, cor=cor_borda,
                   bisel=min(0.07, borda * 0.5)))
    u0, v0, u1, v1 = info["rect"]
    ul, vl = info["lado"]
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    yf, yb = -prof - 0.03, -prof + 0.02
    xs, zs = (u - larg / 2, u + larg / 2), (z, z + alt)
    vs = {}
    for ix in (0, 1):
        for iy, yy in enumerate((yf, yb)):
            for iz in (0, 1):
                vs[ix, iy, iz] = bm.verts.new((xs[ix], yy, zs[iz]))
    quads = [((0, 0, 0), (1, 0, 0), (1, 0, 1), (0, 0, 1)), ((1, 1, 0), (0, 1, 0), (0, 1, 1), (1, 1, 1)),
             ((0, 1, 0), (0, 0, 0), (0, 0, 1), (0, 1, 1)), ((1, 0, 0), (1, 1, 0), (1, 1, 1), (1, 0, 1)),
             ((0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1)), ((0, 1, 0), (1, 1, 0), (1, 0, 0), (0, 0, 0))]
    for qi, q in enumerate(quads):
        f = bm.faces.new([vs[c] for c in q])
        for lo, c in zip(f.loops, q):
            if qi == 0:
                lo[uvl].uv = (u0 + c[0] * (u1 - u0), v0 + c[2] * (v1 - v0))
            else:
                lo[uvl].uv = (ul, vl)
    objs.append(tm(mb._obj("placa", bm, None, e["mat"], liso=False), M))
    if luzes is not None:
        n = max(3, int((larg + alt) * 2 / 0.55))
        per = 2 * (larg + alt) + 8 * borda
        for k in range(n):
            s = per * k / n
            w_, h_ = larg + 2 * borda, alt + 2 * borda
            if s < w_:
                px, pz = u - w_ / 2 + s, z - borda
            elif s < w_ + h_:
                px, pz = u + w_ / 2, z - borda + (s - w_)
            elif s < 2 * w_ + h_:
                px, pz = u + w_ / 2 - (s - w_ - h_), z - borda + h_
            else:
                px, pz = u - w_ / 2, z - borda + h_ - (s - 2 * w_ - h_)
            luzes.caixa(M, 0.13, 0.08, 0.13, x=px, y=-prof - 0.04, z=pz - 0.065, mat="luz")
    return alt


def placa_curva(objs, nome, ln, ta, tb, z, alt, d=0.15, prof=0.1, n=12, cor_borda="branco", borda=0.12):
    """Letreiro com estampa que acompanha uma fachada curva (ln: Linha do trecho, de ta a tb)."""
    e = estampa()
    info = e["info"][nome]
    u0, v0, u1, v1 = info["rect"]
    ul, vl = info["lado"]

    def faixa_bm(dd, pr, z0, z1, ta_, tb_, estampa_frente):
        bm = bmesh.new()
        uvl = bm.loops.layers.uv.new("UVMap")
        fr, tr = [], []
        for k in range(n + 1):
            t = ta_ + (tb_ - ta_) * k / n
            a, b = ln.em(t - 0.05), ln.em(t + 0.05)
            nrm = _normal((b - a).normalized())
            p = ln.em(t)
            fr.append([bm.verts.new((*(p + nrm * dd), zz)) for zz in (z0, z1)])
            tr.append([bm.verts.new((*(p + nrm * (dd - pr)), zz)) for zz in (z0, z1)])
        for k in range(n):
            f = bm.faces.new((fr[k][0], fr[k + 1][0], fr[k + 1][1], fr[k][1]))
            for lo, (kk, iz) in zip(f.loops, ((k, 0), (k + 1, 0), (k + 1, 1), (k, 1))):
                lo[uvl].uv = (u0 + (u1 - u0) * kk / n, v0 + (v1 - v0) * iz) if estampa_frente else (ul, vl)
            for q in ((tr[k + 1][0], tr[k][0], tr[k][1], tr[k + 1][1]), (fr[k][1], fr[k + 1][1], tr[k + 1][1], tr[k][1]),
                      (tr[k][0], tr[k + 1][0], fr[k + 1][0], fr[k][0])):
                f = bm.faces.new(q)
                for lo in f.loops:
                    lo[uvl].uv = (ul, vl)
        for kk in (0, n):
            q = (tr[kk][0], fr[kk][0], fr[kk][1], tr[kk][1]) if kk == 0 else (fr[kk][0], tr[kk][0], tr[kk][1], fr[kk][1])
            f = bm.faces.new(q)
            for lo in f.loops:
                lo[uvl].uv = (ul, vl)
        return bm

    objs.append(mb._obj("placa_curva", faixa_bm(d + prof, prof + 0.05, z, z + alt, ta, tb, True), None, e["mat"],
                        liso=False))
    objs.append(mb._obj("placa_curva_borda", faixa_bm(d + 0.02, 0.1, z - borda, z + alt + borda,
                                                      ta - borda, tb + borda, False), cor_borda, "atlas", liso=False))


# =====================================================================================================================
# Telhado
# =====================================================================================================================
def caixa_dagua(objs, x, y, z, cor="branco", r=0.9, a=1.4):
    objs.append(mb.cilindro(r, a, x=x, y=y, z=z + 0.9, cor=cor, seg=16, bisel=0.06))
    objs.append(mb.cilindro(r + 0.06, 0.35, x=x, y=y, z=z + 0.9 + a, cor="cinza_claro", seg=16, r2=0.12, bisel=0.03))
    for sx in (-1, 1):
        for sy in (-1, 1):
            objs.append(mb.caixa(0.12, 0.12, 0.92, x=x + sx * r * 0.6, y=y + sy * r * 0.6, z=z, cor="cinza_medio",
                                 bisel=0.02, seg=1))
    objs.append(mb.caixa(r * 1.5, r * 1.5, 0.1, x=x, y=y, z=z + 0.8, cor="cinza_medio", bisel=0.02, seg=1))


def casa_maquinas(objs, acc, x, y, z, l=2.6, p=2.2, a=2.4, cor="cinza_claro", porta_cor="grafite"):
    objs.append(mb.caixa(l, p, a, x=x, y=y, z=z, cor=cor, bisel=0.08))
    objs.append(mb.caixa(l + 0.3, p + 0.3, 0.18, x=x, y=y, z=z + a, cor="branco", bisel=0.06))
    acc.caixa(FRENTE, 0.9, 0.06, 1.9, x=x, y=y - p / 2 - 0.01, z=z + 0.02, cor=porta_cor)


def antena(objs, x, y, z, h=4.0, luz=True):
    objs.append(mb.cilindro(0.06, h, x=x, y=y, z=z, cor="cinza_claro", seg=8, bisel=0.0))
    objs.append(mb.cilindro(0.18, 0.12, x=x, y=y, z=z, cor="cinza_medio", seg=10, bisel=0.02))
    for k, hh in enumerate((0.45, 0.65)):
        objs.append(mb.caixa(0.9 - k * 0.3, 0.05, 0.05, x=x, y=y, z=z + h * hh, cor="cinza_claro", bisel=0, seg=1))
    if luz:
        objs.append(mb.esfera(0.13, x=x, y=y, z=z + h + 0.08, cor=None, seg=8, mat="luz"))


def ar_telhado(acc, x, y, z, rot=0.0):
    M = Matrix.Translation((x, y, z)) @ Matrix.Rotation(math.radians(rot), 4, "Z")
    acc.caixa(M, 1.3, 0.9, 0.85, cor="cinza_claro")
    acc.caixa(M, 0.7, 0.04, 0.6, x=0.15, y=-0.46, z=0.12, cor="cinza_medio")
    acc.caixa(M, 1.36, 0.96, 0.08, z=0.85, cor="branco")


def placas_solares(acc, x, y, z, n=4, m=2, w=1.0, h=1.6, incl=22.0):
    for i in range(n):
        for j in range(m):
            px, py = x + (i - (n - 1) / 2) * (w + 0.12), y + (j - (m - 1) / 2) * (h + 0.5)
            M = Matrix.Translation((px, py, z + 0.35)) @ Matrix.Rotation(math.radians(incl), 4, "X")
            acc.caixa(M, w, h, 0.06, z=0, cor="azul_escuro")
            acc.caixa(M, w + 0.06, h + 0.06, 0.03, z=-0.03, cor="cinza_claro")
            acc.caixa(Matrix.Translation((px, py, z)), 0.1, 0.1, 0.36, cor="cinza_medio")


def telhado_duas_aguas(objs, l, p, z, h, cor="terracota", beiral=0.45, esp=0.22, x=0.0, y=0.0, eixo="x",
                       cor_cumeeira=None):
    """Telhado de duas águas: duas lajes boleadas e uma cumeeira. eixo = direção da cumeeira."""
    if eixo == "y":
        l, p = p, l
    meia = p / 2 + beiral
    ang = math.atan2(h, p / 2)
    comp = meia / math.cos(ang) + 0.05
    out = []
    for s in (-1, 1):
        lj = mb.caixa(l + 2 * beiral, comp, esp, x=0, y=-comp / 2, z=0, cor=cor, bisel=0.07, seg=2)
        mb.transforma(lj, rot=("X", math.degrees(ang)))
        if s > 0:
            mb.transforma(lj, rot=("Z", 180))
        out.append(lj)
    cume = mb.cilindro(esp * 0.8, l + 2 * beiral + 0.1, x=0, y=0, z=0, cor=cor_cumeeira or cor, seg=8, eixo="x",
                       bisel=0.0)
    out.append(cume)
    M = Matrix.Translation((x, y, z + h + esp * 0.4))
    if eixo == "y":
        M = M @ Matrix.Rotation(math.pi / 2, 4, "Z")
    for o in out:
        o.data.transform(M)
    objs += out
    return ang


def empena(l, p, z, h, cor, x=0.0, y=0.0, eixo="x"):
    """Paredes triangulares sob o telhado de duas águas (fecham as pontas)."""
    if eixo == "x":
        cont = [(-p / 2, 0), (p / 2, 0), (0, h)]
        ob = mb.extrudado(cont, l, x=x - l / 2, y=y, z=z, cor=cor, bisel=0.02, plano="yz")
        ob.data.transform(Matrix.Translation((0, 0, 0)))
        return ob
    cont = [(-l / 2, 0), (l / 2, 0), (0, h)]
    return mb.extrudado(cont, p, x=x, y=y - p / 2, z=z, cor=cor, bisel=0.02, plano="xz")


def telhado_quatro_aguas(l, p, z, h, cor="vermelho", beiral=0.4, esp=0.22, x=0.0, y=0.0):
    """Telhado de quatro águas com beiral grosso (testeira) e arestas boleadas."""
    L, P = l / 2 + beiral, p / 2 + beiral
    r = max(0.0, L - P)
    bm = bmesh.new()
    b = [bm.verts.new((x + sx * L, y + sy * P, z - esp)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    m = [bm.verts.new((x + sx * L, y + sy * P, z)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    t = [bm.verts.new((x - r, y, z + h)), bm.verts.new((x + r, y, z + h))]
    bm.faces.new((b[3], b[2], b[1], b[0]))
    for k in range(4):
        j = (k + 1) % 4
        bm.faces.new((b[k], b[j], m[j], m[k]))
    bm.faces.new((m[0], m[1], t[1], t[0]))
    bm.faces.new((m[2], m[3], t[0], t[1]))
    bm.faces.new((m[1], m[2], t[1]))
    bm.faces.new((m[3], m[0], t[0]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    mb._bevel(bm, 0.07, 2, [e for e in bm.edges if len(e.link_faces) == 2 and
                            e.link_faces[0].normal.dot(e.link_faces[1].normal) < 0.8])
    return mb._obj("telhado4", bm, cor, liso=True, angulo=30)


def tijolinhos(acc, M, u0, u1, z0, z1, n, sem=5, cor="tijolo"):
    """Tijolinhos soltos saindo da parede (charme de tijolo aparente)."""
    rnd = random.Random(sem)
    for _ in range(n):
        u = rnd.uniform(u0 + 0.3, u1 - 0.3)
        z = rnd.uniform(z0 + 0.2, z1 - 0.3)
        for k in range(rnd.choice((1, 2, 2, 3))):
            acc.caixa(M, 0.42, 0.04, 0.16, x=u + (k % 2) * 0.22, y=-0.02, z=z + k * 0.2, cor=cor)


# =====================================================================================================================
# Registro dos prédios
# =====================================================================================================================
REG = []


def registra(id_, rotulo, grupo, lote, andares, tags, f, **var):
    REG.append(dict(id=id_, rotulo=rotulo, grupo=grupo, lote=lote, andares=andares, tags=tags, f=f, var=var))


def frente_y(cont):
    return min(p[1] for p in cont)


# =====================================================================================================================
# ESCRITÓRIOS
# =====================================================================================================================
def b_escritorio_abobada(it, v):
    """Escritório branco de cantos arredondados, com abóbada cinza entre empenas em arco."""
    acc, objs = Acc(), []
    L, P = 11.8, 9.6
    H = TERREO + 4 * ANDAR
    cont = rr(L, P, 0.8, seg=3)
    objs.append(prisma(rr(L + 0.5, P + 0.5, 1.0, 3), 0, 0.45, "concreto", bisel=0.1))
    objs.append(prisma(cont, 0.0, H, v.get("cor", "branco"), bisel=0.06))
    objs.append(laje_borda(cont, TERREO - 0.3, 0.34, 0.2, "branco_gelo", bisel=0.1))
    janelas_contorno(acc, cont, TERREO, 4, passo=2.1, larg=1.15, alt=1.55, peit=0.85, moldura="azul", sem=11,
                     capota="azul_claro")
    yf = -P / 2
    porta(acc, objs, fachada(0, yf), 0, larg=2.4, alt=2.8, moldura="azul", marquise="azul_claro", z=0.45)
    janelas_contorno(acc, cont, 0.45, 1, alt_andar=TERREO, passo=2.7, larg=1.9, alt=2.0, peit=0.65, moldura="azul",
                     sem=12, pular=lambda i, s, j, p, n: n.y < -0.7 and abs(p.x) < 2.6)
    # empenas em arco e abóbada
    ha = 2.5
    R = ((P / 2) ** 2 + ha ** 2) / (2 * ha)
    zc = H + ha - R

    def arco(Rr, y_lim, n=18):
        a = math.asin(min(1.0, y_lim / Rr))
        return [(Rr * math.sin(a - 2 * a * k / n), zc + Rr * math.cos(a - 2 * a * k / n)) for k in range(n + 1)]

    Rg = R + 0.18
    emp = [(-(P / 2 + 0.12), H - 0.5), (P / 2 + 0.12, H - 0.5)] + arco(Rg, P / 2 + 0.12)
    for x0 in (L / 2 - 0.75, -L / 2):
        objs.append(mb.extrudado(ccw(emp), 0.75, x=x0, cor="branco", bisel=0.18, seg=3, plano="yz"))
    casca = arco(R, P / 2) + arco(R - 0.24, P / 2 - 0.05)[::-1]
    objs.append(mb.extrudado(ccw(casca), L - 1.5, x=-L / 2 + 0.75, cor="cinza_claro", bisel=0.03, plano="yz"))
    for xr in (-L / 4 + 0.2, 0.0, L / 4 - 0.2):
        nerv = arco(R + 0.08, P / 2 + 0.04) + arco(R - 0.05, P / 2)[::-1]
        objs.append(mb.extrudado(ccw(nerv), 0.2, x=xr - 0.1, cor="branco", bisel=0.03, plano="yz"))
    for sy in (-1, 1):  # calhas
        objs.append(mb.caixa(L - 1.4, 0.3, 0.25, y=sy * (P / 2 - 0.05), z=H - 0.12, cor="branco", bisel=0.08))
    for x0, sx in ((L / 2, 1), (-L / 2, -1)):  # óculo nas empenas
        Mx = fachada(x0, 0, "dir" if sx > 0 else "esq")
        objs.append(cil(Mx, 0.62, 0.12, y=-0.06, z=H + 1.1, cor="azul", eixo="y", seg=20))
        acc.caixa(Mx, 0.7, 0.04, 0.7, y=-0.14, z=H + 0.75, mat="janela_fria" if sx > 0 else "janela_apagada")
    ar_telhado(acc, 3.5, P / 2 + 0.6, 0.45)
    it.add(acc.objs(), objs)
    return [((0, 0, 0), (L, P, H)), ((0, 0, H), (L, P, ha + 0.2))]


def b_torre_faixas(it, v):
    """Torre de faixas vermelhas sobre um embasamento com terraço."""
    acc, objs = Acc(), []
    P0 = 4.6
    pod = rr(12.0, 12.0, 1.4, 4)
    objs.append(prisma(pod, 0, P0, "azul_marinho", bisel=0.05))
    objs.append(prisma(offset(pod, 0.2), P0 - 0.1, 0.45, "pessego", bisel=0.12))
    faixa_vidro(acc, pod, 0.55, 3.75, painel=1.8, sem=21, pular=lambda i, s, c, n: n.y < -0.7 and abs(c.x) < 2.0)
    objs.append(laje_borda(pod, 0.0, 0.5, 0.06, "grafite", bisel=0.05))
    porta(acc, objs, fachada(0, -6.0), 0, larg=2.6, alt=3.0, moldura="branco", marquise="vermelho", marq_prof=0.8)
    ter = offset(pod, 0.05)
    objs.append(anel(ter, offset(ter, -0.06), P0 + 0.35, 0.95, None, mat="vidro"))
    objs.append(anel(offset(ter, 0.04), offset(ter, -0.1), P0 + 1.3, 0.1, "branco", bisel=0.03))
    for x, y in ((-4.8, -4.8), (4.8, -4.8), (-4.8, 4.8), (4.8, 4.8), (0, -5.0)):
        objs.append(mb.caixa(1.2, 1.2, 0.5, x=x, y=y, z=P0 + 0.35, cor="branco", bisel=0.08))
        objs.append(moita(x, y, P0 + 0.8, 0.55, "folha"))
    n = 13
    zb = P0 + 0.35
    T = rr(9.0, 9.0, 0.5, 2)
    objs.append(prisma(T, zb - 0.1, n * ANDAR + 0.4, "azul_marinho", bisel=0))
    rnd = random.Random(23)
    for k in range(n):
        z = zb + k * ANDAR
        objs.append(prisma(rr(9.8, 9.8, 0.9, 3), z, 0.95, "vermelho", bisel=0.08, seg=1))
        faixa_vidro(acc, T, z + 0.95, z + ANDAR, painel=1.5, sem=200 + k)
        for lado in ("frente", "dir", "esq"):
            if rnd.random() < 0.35:
                u = rnd.choice((-3.0, -1.0, 1.5, 3.2))
                M = fachada(0, -4.9, "frente") if lado == "frente" else fachada(4.9 * (1 if lado == "dir" else -1), 0, lado)
                acc.caixa(M, 0.75, 0.45, 0.55, x=u, y=-0.22, z=z + 0.2, cor="cinza_claro")
                acc.caixa(M, 0.4, 0.03, 0.36, x=u + 0.12, y=-0.46, z=z + 0.28, cor="cinza_medio")
    zt = zb + n * ANDAR
    objs.append(prisma(rr(9.8, 9.8, 0.9, 3), zt, 0.95, "vermelho", bisel=0.08, seg=1))
    objs.append(prisma(rr(10.2, 10.2, 1.0, 3), zt + 0.95, 0.5, "grafite", bisel=0.1))
    objs.append(prisma(rr(9.0, 9.0, 0.7, 3), zt + 1.45, 1.6, "grafite_escuro", bisel=0.08))
    objs.append(prisma(rr(9.4, 9.4, 0.8, 3), zt + 3.05, 0.35, "grafite", bisel=0.1))
    objs.append(prisma(rr(8.4, 8.4, 0.6, 3), zt + 3.1, 0.35, "cinza_claro", bisel=0.0))
    casa_maquinas(objs, acc, -1.5, 1.0, zt + 3.45)
    antena(objs, 2.4, 2.4, zt + 3.45, 5.0)
    ar_telhado(acc, 2.3, -2.0, zt + 3.45)
    it.add(acc.objs(), objs)
    return [((0, 0, 0), (12.2, 12.2, P0 + 1.4)), ((0, 0, P0), (9.8, 9.8, zt + 3.5 - P0))]


# =====================================================================================================================
# RESIDENCIAIS
# =====================================================================================================================
def b_apto_baia(it, v):
    """Prédio de apartamentos com baia de vidro na frente (6 andares)."""
    acc, objs = Acc(), []
    cor, trim, baia_cor = v["cor"], v["trim"], v.get("baia", v["cor"])
    L, P = 9.2, 8.2
    Z0 = 0.6
    Ht = Z0 + 3.4 + 5 * ANDAR
    cont = rr(L, P, 0.35, 2)
    objs.append(prisma(rr(L + 0.3, P + 0.3, 0.5, 2), 0, Z0 + 0.05, "cinza_medio", bisel=0.05))
    objs.append(prisma(cont, Z0, Ht - Z0, cor, bisel=0.05))
    objs.append(laje_borda(cont, Z0 + 3.4 - 0.2, 0.25, 0.12, trim))
    bay = rr(3.8, 1.2, 0.35, 3, y=-P / 2 - 0.25)
    z1 = Z0 + 3.4
    objs.append(prisma(bay, z1 - 0.2, Ht - z1 + 0.2, baia_cor, bisel=0.06))
    for k in range(5):
        z = z1 + k * ANDAR
        objs.append(prisma(offset(bay, 0.1), z - 0.2, 0.24, trim, bisel=0.06, seg=1))
        faixa_vidro(acc, bay, z + 0.55, z + 2.55, painel=1.25, sem=300 + k, quebra=30, min_trecho=0.4)
    janelas_contorno(acc, cont, z1, 5, passo=2.15, larg=1.05, alt=1.45, peit=0.8, moldura=trim, sem=31, ar=0.18,
                     pular=lambda i, s, j, p, n: n.y < -0.7 and abs(p.x) < 2.6)
    # térreo: porta com degraus à direita, janelas
    Mf_ = fachada(0, -P / 2)
    porta(acc, objs, Mf_, 2.6, larg=1.5, alt=2.5, moldura=trim, marquise=trim, degraus=3, z=Z0)
    janelas_contorno(acc, cont, Z0, 1, alt_andar=3.4, passo=2.4, larg=1.3, alt=1.5, peit=1.0, moldura=trim, sem=32,
                     pular=lambda i, s, j, p, n: n.y < -0.7 and p.x > 1.4)
    objs += platibanda(cont, Ht, a=0.75, esp=0.38, cor=v.get("platibanda", "cinza_claro"), cor_teto="cinza")
    objs.append(prisma(offset(bay, 0.12), Ht, 0.75, v.get("platibanda", "cinza_claro"), bisel=0.08))
    caixa_dagua(objs, -2.2, 1.5, Ht)
    ar_telhado(acc, 2.2, 1.8, Ht)
    antena(objs, 3.3, -2.5, Ht, 2.6, luz=False)
    it.add(acc.objs(), objs)
    return [((0, 0, 0), (L, P, Ht + 0.8)), ((0, -P / 2 - 0.3, Z0 + 3.2), (3.8, 1.3, Ht - 3.8))]


# =====================================================================================================================
# COMÉRCIO E LAZER
# =====================================================================================================================
def pino(h=3.4, cor="branco", faixa="vermelho"):
    perf = [(0, 0), (0.16, 0), (0.2, 0.05), (0.24, 0.16), (0.25, 0.27), (0.22, 0.4), (0.15, 0.52), (0.105, 0.6),
            (0.1, 0.66), (0.12, 0.75), (0.135, 0.84), (0.12, 0.93), (0.07, 0.985), (0, 1.0)]
    ob = mb.torno([(r * h, z * h) for r, z in perf], cor=cor, seg=18, angulo=50)
    mb.pinta_onde(ob, faixa, lambda c, n: 0.615 * h < c.z < 0.655 * h or 0.69 * h < c.z < 0.73 * h)
    return ob


def b_boliche(it, v):
    """Boliche com pinos gigantes e bola no teto."""
    acc, objs = Acc(), []
    cont = rr(12.2, 10.0, 3.0, 6)
    H = 6.4
    objs.append(prisma(offset(cont, 0.18), 0, 0.4, "cinza_medio", bisel=0.08))
    objs.append(prisma(cont, 0.3, H - 0.3, v.get("cor", "azul"), bisel=0.05))
    faixa_vidro(acc, cont, 0.9, 3.6, painel=1.6, sem=41, quebra=25, apagadas=0.15,
                pular=lambda i, s, c, n: n.y < -0.7 and abs(c.x) < 1.9)
    objs.append(laje_borda(cont, 3.68, 0.25, 0.1, "branco", bisel=0.06))
    objs.append(anel(offset(cont, 0.4), offset(cont, -0.2), H - 0.1, 0.8, "branco", bisel=0.14))
    objs.append(prisma(cont, H - 0.05, 0.1, "cinza_claro", bisel=0))
    objs.append(anel(offset(cont, 0.22), offset(cont, 0.0), H - 0.38, 0.22, None, mat="luz"))
    M = fachada(0, -5.0)
    porta(acc, objs, M, 0, larg=2.6, alt=2.9, moldura="branco", marquise="rosa", z=0.4, marq_prof=1.1)
    placa(objs, "boliche", M, 0, 4.2, 4.6, luzes=acc, cor_borda="branco")
    zt = H + 0.7
    for x, y in ((2.0, 1.2), (3.1, 1.9), (0.9, 1.9), (4.2, 2.6), (2.0, 2.6), (-0.2, 2.6)):
        p_ = pino(3.2)
        mb.transforma(p_, loc=(x, y, zt - 0.7))
        objs.append(p_)
    caido = pino(3.2)
    mb.transforma(caido, rot=[("Z", 30), ("Y", 82)])
    mb.transforma(caido, loc=(-1.2, -0.6, zt - 0.7 + 0.75))
    objs.append(caido)
    rb = 1.25
    bola = mb.esfera(rb, x=-3.8, y=-1.0, z=zt - 0.7 + rb, cor=v.get("bola", "rosa"), seg=20)
    objs.append(bola)
    for ang, dz in ((-20, 0.35), (5, 0.45), (-8, 0.0)):
        d = V((math.sin(math.radians(ang)), -math.cos(math.radians(ang)), dz)).normalized()
        c = V((-3.8, -1.0, zt - 0.7 + rb)) + d * (rb - 0.08)
        h = mb.cilindro(0.16, 0.2, cor="grafite_escuro", seg=10, bisel=0.02)
        h.data.transform(Matrix.Translation(c) @ d.to_track_quat("Z", "Y").to_matrix().to_4x4() @
                         Matrix.Translation((0, 0, -0.1)))
        objs.append(h)
    ar_telhado(acc, -3.8, 3.2, H)
    it.add(acc.objs(), objs)
    return [((0, 0, 0), (12.8, 10.6, H + 0.7)), ((1.8, 2.0, zt - 0.7), (6, 2.5, 3.2)), ((-3.8, -1.0, zt - 0.7), (2.6, 2.6, 2.6))]


# =====================================================================================================================
# TÉRREOS E PEQUENOS
# =====================================================================================================================
def b_casas_geminadas(it, v):
    """Três casas geminadas de dois andares, com empena virada para a rua."""
    acc, objs = Acc(), []
    w, D = 4.0, 8.4
    Hw = 5.8
    hr = 2.3
    cores = v["cores"]
    telh = v["telhado"]
    for i, xc in enumerate((-w, 0.0, w)):
        cor = cores[i]
        objs.append(prisma(rr(w - 0.03, D, 0.08, 1, x=xc), 0.25, Hw - 0.25, cor, bisel=0.04))
        objs.append(mb.caixa(w + 0.05, D + 0.1, 0.32, x=xc, z=0, cor="concreto", bisel=0.05, seg=1))
        objs.append(empena(w - 0.03, D, Hw, hr, cor, x=xc, eixo="y"))
        telhado_duas_aguas(objs, w, D, Hw - 0.05, hr, cor=telh, beiral=0.32, x=xc, eixo="y", esp=0.2)
        objs.append(mb.caixa(w + 0.02, D + 0.04, 0.2, x=xc, z=2.95, cor="branco", bisel=0.06, seg=1))
        M = fachada(xc, -D / 2)
        porta(acc, objs, M, -0.85, larg=1.0, alt=2.25, moldura="branco", z=0.32, mat="janela")
        objs.append(cx(M, 1.6, 1.0, 0.16, x=-0.85, y=-0.5, z=2.85, cor=telh, bisel=0.05, seg=1))
        acc.caixa(M, 1.5, 0.8, 0.16, x=-0.85, y=-0.4, z=0.16, cor="concreto")
        rnd = random.Random(50 + i)
        janela(acc, M, 1.2, 1.25, 1.2, "branco", sorteia(rnd), u=0.95)
        for u in (-0.95, 0.95):
            janela(acc, M, 0.95, 1.3, 3.75, "branco", sorteia(rnd), u=u, capota=None)
            acc.caixa(M, 1.15, 0.28, 0.25, x=u, y=-0.2, z=3.47, cor="folha")
        objs.append(cil(M, 0.42, 0.12, y=-0.04, z=Hw + 0.95, cor="branco", eixo="y", seg=12))
        acc.caixa(M, 0.5, 0.03, 0.5, y=-0.12, z=Hw + 0.7, mat=sorteia(rnd))
        Mb = fachada(xc, D / 2, "fundos")
        for u in (-1.0, 1.0):
            janela(acc, Mb, 1.0, 1.2, 1.2, "branco", sorteia(rnd), u=u)
            janela(acc, Mb, 1.0, 1.2, 3.8, "branco", sorteia(rnd), u=u)
        objs.append(moita(xc + 0.95, -D / 2 - 0.55, 0.0, 0.45, "folha"))
    for sx in (-1, 1):
        Ml = fachada(sx * 1.5 * w, 0, "dir" if sx > 0 else "esq")
        rnd = random.Random(60 + sx)
        for u in (-2.2, 0.4, 2.6):
            janela(acc, Ml, 0.9, 1.2, 1.25, "branco", sorteia(rnd), u=u)
            janela(acc, Ml, 0.9, 1.2, 3.8, "branco", sorteia(rnd), u=u)
    for xc in (-w, w):
        objs.append(mb.caixa(0.7, 0.7, 2.0, x=xc + 1.0, y=2.2, z=Hw + 0.6, cor="tijolo", bisel=0.05, seg=2))
        objs.append(mb.caixa(0.85, 0.85, 0.15, x=xc + 1.0, y=2.2, z=Hw + 2.55, cor="cinza_claro", bisel=0.04, seg=1))
    it.add(acc.objs(), objs)
    return [((0, 0, 0), (3 * w, D, Hw)), ((0, 0, Hw), (3 * w, D, hr))]


registra("escritorio_branco_abobada", "Escritório branco com abóbada", "escritorio_branco_abobada", [1, 1], 5,
         ["escritorio"], b_escritorio_abobada)
registra("torre_faixas_vermelhas", "Torre de faixas vermelhas", "torre_faixas_vermelhas", [1, 1], 14,
         ["escritorio", "torre"], b_torre_faixas)
registra("apto_baia_vermelho", "Prédio de apartamentos com baia (vermelho)", "apto_baia", [1, 1], 6,
         ["residencial"], b_apto_baia, cor="vermelho", trim="branco", baia="vermelho_escuro")
registra("apto_baia_azul", "Prédio de apartamentos com baia (azul)", "apto_baia", [1, 1], 6,
         ["residencial"], b_apto_baia, cor="azul_claro", trim="branco", baia="azul", platibanda="branco_gelo")
registra("boliche", "Boliche com pino gigante", "boliche", [1, 1], 1, ["lazer", "comercio"], b_boliche)
registra("casas_geminadas_pastel", "Casas geminadas (tons pastel)", "casas_geminadas", [1, 1], 2,
         ["casa", "residencial"], b_casas_geminadas, cores=("creme", "azul_bebe", "pessego"), telhado="terracota")
registra("casas_geminadas_tijolo", "Casas geminadas (tijolo e bege)", "casas_geminadas", [1, 1], 2,
         ["casa", "residencial"], b_casas_geminadas, cores=("tijolo", "bege", "terracota_clara"),
         telhado="grafite")


# =====================================================================================================================
# Contornos especiais
# =====================================================================================================================
def uniao_circulos(c1, r1, c2, r2, n=40):
    """Contorno da união de dois círculos que se cruzam (ordenado pelo ângulo em volta da lente)."""
    c1, c2 = V(c1), V(c2)
    d = (c2 - c1).length
    u = (c2 - c1) / d
    a = (r1 ** 2 - r2 ** 2 + d ** 2) / (2 * d)
    h = math.sqrt(max(0.0, r1 ** 2 - a ** 2))
    meio = c1 + u * a
    per = V((-u.y, u.x))
    pts = [meio + per * h, meio - per * h]
    for c, r, o, ro in ((c1, r1, c2, r2), (c2, r2, c1, r1)):
        m = int(n * r / max(r1, r2))
        for k in range(m):
            t = 2 * math.pi * k / m
            p = c + V((math.cos(t), math.sin(t))) * r
            if (p - o).length > ro + 0.05:
                pts.append(p)
    pts.sort(key=lambda p: math.atan2(p.y - meio.y, p.x - meio.x))
    return [(p.x, p.y) for p in pts]


def contorno_bossas(l, p, bossas, n=8, e=0.45):
    """Retângulo l × p com bossas (sacadas, baias) arredondadas: bossas = {lado: [(pos, largura, prof)]}, lado em
    "frente", "dir", "fundos", "esq"; pos medida a partir do começo do lado (sentido anti-horário)."""
    cantos = [(-l / 2, -p / 2), (l / 2, -p / 2), (l / 2, p / 2), (-l / 2, p / 2)]
    lados = ["frente", "dir", "fundos", "esq"]
    pts = []
    for k, lado in enumerate(lados):
        a, b = V(cantos[k]), V(cantos[(k + 1) % 4])
        L = (b - a).length
        t = (b - a) / L
        nrm = V((t.y, -t.x))
        pts.append((a.x, a.y))
        for pos, w, pr in sorted(bossas.get(lado, [])):
            for q in range(n + 1):
                th = math.pi - math.pi * q / n
                c, s = math.cos(th), math.sin(th)
                du = math.copysign(abs(c) ** e, c) * w / 2
                dv = abs(s) ** e * pr
                pp = a + t * (pos + du) + nrm * dv
                pts.append((pp.x, pp.y))
    return pts


def catmull(pts, n=6):
    out = []
    P = [pts[0]] + pts + [pts[-1]]
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = (V(x) for x in P[i - 1:i + 3])
        for k in range(n):
            t = k / n
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
                              (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(V(pts[-1]))
    return out


# =====================================================================================================================
# ESCRITÓRIOS (2)
# =====================================================================================================================
def b_moldura_oval(it, v):
    """Escritório de vidro azul dentro de uma moldura branca gorda em arco."""
    acc, objs = Acc(), []
    L, P = 11.6, 9.2
    n_and = 9
    H = TERREO + n_and * ANDAR + 1.3
    t, R = 1.2, 3.9

    def arc(cx_, cz, r, a0, a1, n=12):
        return [(cx_ + r * math.cos(math.radians(a0 + (a1 - a0) * k / n)),
                 cz + r * math.sin(math.radians(a0 + (a1 - a0) * k / n))) for k in range(n + 1)]

    Ri = R - t
    ext = [(L / 2, 0)] + arc(L / 2 - R, H - R, R, 0, 90) + arc(-L / 2 + R, H - R, R, 90, 180) + [(-L / 2, 0)]
    inn = [(-L / 2 + t, 0)] + arc(-L / 2 + R, H - R, Ri, 180, 90) + arc(L / 2 - R, H - R, Ri, 90, 0) + [(L / 2 - t, 0)]
    objs.append(mb.extrudado(ccw(ext + inn), P, y=-P / 2, cor="branco", bisel=0.32, seg=3, plano="xz"))
    Pv = P - 1.0
    objs.append(mb.extrudado(ccw(offset(inn, -0.02)), Pv, y=-Pv / 2, cor="azul_escuro", bisel=0.0, plano="xz"))

    def meia(z):
        zc = H - R
        if z <= zc:
            return L / 2 - t
        return (L / 2 - R) + math.sqrt(max(0.0, Ri ** 2 - (z - zc) ** 2))

    rnd = random.Random(71)
    for lado, y0 in (("frente", -Pv / 2), ("fundos", Pv / 2)):
        M = fachada(0, y0, lado)
        for j in range(n_and):
            zf = TERREO + j * ANDAR
            hw = meia(zf + 3.0) - 0.15
            n = max(1, int(round(2 * hw / 1.45)))
            w = 2 * hw / n
            for k in range(n):
                acc.caixa(M, w - 0.09, 0.05, 2.65, x=-hw + w * (k + 0.5), y=-0.025, z=zf + 0.35, mat=sorteia(rnd))
            hw0 = meia(zf) - 0.02
            acc.caixa(M, 2 * hw0, 0.3, 0.22, y=-0.15, z=zf - 0.06, cor="branco_gelo")
        hwt = meia(1.0) - 0.02
        if lado == "frente":
            vitrine_loja(acc, objs, M, -hwt + 0.2, hwt - 0.2, z=0.0, alt=3.7, moldura="branco", porta_u=0.0,
                         painel=1.6)
            objs.append(cx(M, 5.6, 2.3, 0.26, y=-1.15, z=3.85, cor="azul_claro", bisel=0.09))
        else:
            vitrine_loja(acc, objs, M, -hwt + 0.2, hwt - 0.2, z=0.0, alt=3.7, moldura="branco", painel=1.6)
    antena(objs, 1.6, 0.0, H, 4.5)
    antena(objs, -1.2, 0.8, H, 3.0, luz=False)
    it.add(acc.objs(), objs)
    return [((0, 0, 0), (L, P, H))]


def b_torre_curva(it, v):
    """Torre azul curva com aletas brancas e letreiro de empresa."""
    acc, objs = Acc(), []
    cy, Rf, Rb, phi = -20.0, 17.0, 25.0, math.radians(13.2)
    n = 22
    front = [(Rf * math.sin(-phi + 2 * phi * k / n), cy + Rf * math.cos(-phi + 2 * phi * k / n)) for k in range(n + 1)]
    back = [(Rb * math.sin(phi - 2 * phi * k / n), cy + Rb * math.cos(phi - 2 * phi * k / n)) for k in range(n + 1)]
    cont = front + back
    n_and = 13
    H = TERREO + n_and * ANDAR
    objs.append(prisma(cont, 0, H + 0.1, "azul_marinho", bisel=0))
    lados = lambda nn: abs(nn.x) < 0.75  # noqa: E731
    for k in range(n_and):
        z = TERREO + k * ANDAR
        faixa_vidro(acc, cont, z + 0.14, z + ANDAR - 0.14, painel=1.5, sem=400 + k, sel=lados, sal=0.06)
    faixa_vidro(acc, cont, 0.35, 3.8, painel=1.7, sem=399, sel=lados, apagadas=0.1,
                pular=lambda i, s, c, nn: nn.y < -0.7 and abs(c.x) < 1.8)
    for s in (0, -1):
        fp, bp = V(front[s]), V(back[-1 - s])
        d = (bp - fp).normalized()
        pr = V((d.y, -d.x))
        q = [fp - d * 0.6 - pr * 0.6, fp - d * 0.6 + pr * 0.6, bp + d * 0.5 + pr * 0.6, bp + d * 0.5 - pr * 0.6]
        objs.append(prisma([(p.x, p.y) for p in q], 0, H + 2.2, "branco", bisel=0.4, seg=3))
    objs += platibanda(cont, H, a=0.7, esp=0.32, cor="branco", cor_teto="cinza")
    porta(acc, objs, fachada(0, cy + Rf), 0, larg=2.6, alt=3.0, moldura="branco")
    marq = [(r * math.sin(a), cy + r * math.cos(a)) for r, a0, a1 in ((Rf + 0.05, -0.55, 0.55), (Rf - 2.4, 0.55, -0.55))
            for a in [a0 * phi + (a1 - a0) * phi * kk / 12 for kk in range(13)]]
    objs.append(prisma(marq, 3.95, 0.3, "branco", bisel=0.1))
    for sx in (-1, 1):
        objs.append(mb.cilindro(0.14, 3.95, x=sx * 2.6, y=cy + Rf - 2.1, cor="branco", seg=12))
    tr = [ln for ln in trechos(cont) if ln.L > 3]
    for ln in tr:
        larg = min(ln.L - 1.3, 9.0)
        placa_curva(objs, "empresarial", ln, (ln.L - larg) / 2, (ln.L + larg) / 2, H - 3.5, larg / 3.2, d=0.1)
    casa_maquinas(objs, acc, -1.5, 2.8, H, l=3.0, p=2.4)
    ar_telhado(acc, 2.5, 1.5, H)
    ar_telhado(acc, 2.5, 3.2, H)
    antena(objs, 0.5, 3.6, H, 5.0)
    it.add(acc.objs(), objs)
    return [((0, 0.6, 0), (13.0, 9.6, H + 0.7))]


def b_cilindrico(it, v):
    """Prédio de faixas brancas em dois cilindros encostados (8 andares)."""
    acc, objs = Acc(), []
    cont = uniao_circulos((-1.3, 0.6), 4.7, (2.4, -1.0), 3.6, n=40)
    n_and = 8
    H = TERREO + (n_and - 1) * ANDAR
    objs.append(prisma(offset(cont, 0.2), 0, 0.35, "cinza_medio", bisel=0.06))
    objs.append(prisma(cont, 0.3, H - 0.3, v.get("cor", "azul_acinzentado"), bisel=0))
    for k in range(n_and):
        z = 0.0 if k == 0 else TERREO + (k - 1) * ANDAR
        if k:
            objs.append(prisma(offset(cont, 0.32), z - 0.2, 0.34, "branco", bisel=0.1, seg=1))
            faixa_vidro(acc, cont, z + 0.5, z + 2.75, painel=1.5, sem=500 + k, quebra=25)
        else:
            faixa_vidro(acc, cont, 0.6, 3.6, painel=1.6, sem=500, quebra=25, apagadas=0.15,
                        pular=lambda i, s, c, nn: nn.y < -0.8 and abs(c.x - 2.4) < 1.5)
    porta(acc, objs, fachada(2.4, -4.52), 0, larg=2.0, alt=2.9, moldura="branco", z=0.3)
    objs.append(mb.caixa(3.6, 1.6, 0.24, x=2.4, y=-5.2, z=3.65, cor="branco", bisel=0.09))
    objs.append(prisma(offset(cont, 0.38), H - 0.2, 0.45, "branco", bisel=0.12, seg=1))
    objs += platibanda(cont, H + 0.25, a=0.65, esp=0.3, cor="branco", cor_teto="pessego", sobra=0.15)
    cx_, cy_ = -0.6, 0.6
    objs.append(mb.cilindro(1.5, 2.4, x=cx_, y=cy_, z=H + 0.25, cor=v.get("cor", "azul_acinzentado"), seg=24))
    objs.append(mb.cilindro(1.53, 0.35, x=cx_, y=cy_, z=H + 1.9, cor=None, mat="luz", seg=24, bisel=0))
    objs.append(mb.cilindro(1.75, 0.3, x=cx_, y=cy_, z=H + 2.65, cor="branco", seg=24, bisel=0.1))
    acc.caixa(FRENTE, 0.9, 0.05, 1.9, x=cx_, y=cy_ - 1.5, z=H + 0.27, cor="grafite")
    caixa_dagua(objs, -3.4, 1.6, H + 0.25)
    ar_telhado(acc, 2.8, -1.0, H + 0.25)
    it.add(acc.objs(), objs)
    return [((-1.3, 0.6, 0), (9.8, 9.8, H + 1.0)), ((2.4, -1.0, 0), (7.6, 7.6, H + 1.0))]


# =====================================================================================================================
# RESIDENCIAIS E MISTOS (2)
# =====================================================================================================================
def b_tijolo_comprido(it, v):
    """Prédio comprido de tijolo laranja com varandas azuis e lojas no térreo (2 × 1 quadras)."""
    acc, objs = Acc(), []
    L, P = 26.0, 10.0
    n_and = 4
    H = TERREO + n_and * ANDAR
    cont = rr(L, P, 2.2, 5)
    objs.append(prisma(offset(cont, 0.15), 0, 0.3, "cinza_medio", bisel=0.05))
    objs.append(prisma(cont, 0.0, TERREO, "pessego", bisel=0.05))
    objs.append(prisma(cont, TERREO, H - TERREO, v.get("cor", "terracota"), bisel=0.05))
    objs.append(laje_borda(cont, TERREO - 0.18, 0.32, 0.22, "azul", bisel=0.08))
    yf = -P / 2
    Mfr = fachada(0, yf)
    lb = L - 4.6
    for k in range(n_and):
        z = TERREO + k * ANDAR
        objs.append(cx(Mfr, lb, 1.35, 0.24, y=-0.67, z=z - 0.02, cor="azul", bisel=0.08))
        acc.caixa(Mfr, lb - 0.1, 0.05, 0.85, y=-1.28, z=z + 0.22, mat="vidro")
        objs.append(cx(Mfr, lb, 0.12, 0.1, y=-1.3, z=z + 1.07, cor="branco", bisel=0.03))
        for u in (-lb / 2 + 0.6, lb / 2 - 0.6):
            acc.caixa(Mfr, 0.08, 0.08, 0.9, x=u, y=-1.3, z=z + 0.22, cor="branco")
        for u in [(-lb / 2 + 1.5 + 4.4 * q) for q in range(5)]:
            if (q := (k + int(u)) % 3) == 1:
                acc.caixa(Mfr, 0.9, 0.35, 0.35, x=u, y=-1.0, z=z + 0.22, cor="terracota_escura")
                objs.append(moita(u, yf - 1.0, z + 0.45, 0.32, "folha" if q == 1 else "folha_clara"))
    janelas_contorno(acc, cont, TERREO, n_and, passo=2.3, larg=1.05, alt=1.35, peit=0.95, moldura="branco", sem=81,
                     sel=lambda nn: nn.y < -0.7, peitoril=False)
    janelas_contorno(acc, cont, TERREO, n_and, passo=2.7, larg=1.05, alt=1.35, peit=0.95, moldura="branco", sem=82,
                     sel=lambda nn: nn.y >= -0.7, ar=0.1, peitoril=False)
    tijolinhos(acc, Mfr, -L / 2 + 2, L / 2 - 2, TERREO + 0.3, H - 0.3, 14, sem=83, cor="tijolo")
    tijolinhos(acc, fachada(0, P / 2, "fundos"), -L / 2 + 2, L / 2 - 2, TERREO + 0.3, H - 0.3, 10, sem=84, cor="tijolo")
    # térreo: duas lojas com letreiro e a entrada no meio
    for u0, u1, nome in ((-L / 2 + 2.6, -2.0, "lanches"), (2.0, L / 2 - 2.6, "bazar")):
        vitrine_loja(acc, objs, Mfr, u0, u1, z=0.3, alt=2.75, moldura="branco", porta_u=(u0 + u1) / 2, painel=1.7)
        alt_ = 0.62
        larg_ = alt_ * estampa()["info"][nome]["aspecto"]
        placa(objs, nome, Mfr, (u0 + u1) / 2 + 0.0, 3.36, larg_, prof=0.08, borda=0.08, cor_borda="branco")
        objs[-1].data.transform(Matrix.Translation((0, -0.95, 0)))
        objs[-2].data.transform(Matrix.Translation((0, -0.95, 0)))
    objs.append(cx(Mfr, lb, 1.1, 0.18, y=-0.55, z=3.1, cor="azul_claro", bisel=0.06))
    porta(acc, objs, Mfr, 0, larg=1.9, alt=2.6, moldura="azul", z=0.3)
    janelas_contorno(acc, cont, 0.3, 1, alt_andar=3.6, passo=2.6, larg=1.5, alt=1.6, peit=0.9, moldura="branco",
                     sem=85, sel=lambda nn: nn.y >= -0.7)
    objs += platibanda(cont, H, a=0.75, esp=0.38, cor="cinza_claro", cor_teto="cinza")
    placas_solares(acc, -5.0, 1.0, H, n=6, m=2)
    caixa_dagua(objs, 6.0, 1.5, H)
    caixa_dagua(objs, 8.4, 1.5, H)
    casa_maquinas(objs, acc, 2.5, 1.8, H)
    it.add(acc.objs(), objs)
    return [((0, 0, 0), (L, P, H + 0.8)), ((0, -P / 2 - 0.65, TERREO), (lb, 1.4, n_and * ANDAR))]


def b_cinza_varandas(it, v):
    """Prédio comprido cinza com varandas contínuas de vidro que dão a volta na ponta redonda (2 × 1 quadras)."""
    acc, objs = Acc(), []
    L, P = 25.0, 10.4
    n_and = 3
    H = TERREO + n_and * ANDAR
    cont = ret_cantos(L, P, (4.8, 1.2, 1.2, 4.8), seg=3)
    nucleo = offset(cont, -0.75)
    objs.append(prisma(offset(cont, 0.12), 0, 0.3, "cinza_medio", bisel=0.05))
    objs.append(prisma(cont, 0.2, TERREO - 0.2, "grafite", bisel=0.05))
    faixa_vidro(acc, cont, 0.55, 3.55, painel=1.7, sem=91, quebra=12, apagadas=0.2,
                pular=lambda i, s, c, nn: nn.y < -0.7 and abs(c.x - 3.0) < 1.6)
    porta(acc, objs, fachada(3.0, -P / 2), 0, larg=2.2, alt=2.8, moldura="branco", z=0.2)
    objs.append(mb.caixa(4.4, 1.8, 0.22, x=3.0, y=-P / 2 - 0.9, z=3.25, cor="azul", bisel=0.08))
    objs.append(prisma(nucleo, TERREO, n_and * ANDAR, v.get("cor", "cinza_claro"), bisel=0.03))
    janelas_contorno(acc, nucleo, TERREO, n_and, passo=2.4, larg=1.6, alt=2.15, peit=0.25, moldura="branco", sem=92,
                     quebra=12, peitoril=False, margem=0.3)
    rnd = random.Random(93)
    for k in range(n_and + 1):
        z = TERREO + k * ANDAR
        objs.append(prisma(offset(cont, 0.1), z - 0.26, 0.28, "branco", bisel=0.08, seg=1))
        if k < n_and:
            objs.append(anel(offset(cont, 0.0), offset(cont, -0.06), z + 0.02, 0.95, None, mat="vidro"))
            objs.append(anel(offset(cont, 0.03), offset(cont, -0.09), z + 0.97, 0.09, "branco"))
            for x in (-6.0, -1.0, 4.5, 9.0):
                if rnd.random() < 0.7:
                    objs.append(moita(x + rnd.uniform(-1, 1), -P / 2 + 0.45, z, 0.3, rnd.choice(("folha", "folha_clara"))))
    zt = H
    objs.append(anel(offset(cont, 0.05), offset(cont, -0.15), zt + 0.02, 0.7, "branco", bisel=0.06))
    objs.append(prisma(offset(cont, -0.1), zt - 0.02, 0.06, "cinza", bisel=0))
    placas_solares(acc, 2.0, 0.6, zt, n=8, m=2)
    for x, y in ((-7.5, 1.0), (-6.0, -1.5), (-8.0, -2.4)):
        objs.append(mb.caixa(1.3, 1.3, 0.45, x=x, y=y, z=zt, cor="madeira", bisel=0.06))
        objs.append(moita(x, y, zt + 0.4, 0.55, "folha"))
    casa_maquinas(objs, acc, 9.0, 1.6, zt)
    it.add(acc.objs(), objs)
    return [((0, 0, 0), (L, P, H + 0.8))]


def b_hotel(it, v):
    """Hotel de cantos redondos com letreiro vertical HOTEL, placa no telhado e marquise vermelha."""
    acc, objs = Acc(), []
    L, P = 11.6, 9.2
    n_and = 10
    T0 = 4.6
    H = T0 + (n_and - 1) * ANDAR
    cont = rr(L, P, 2.4, 5)
    objs.append(prisma(offset(cont, 0.18), 0, 0.3, "cinza_medio", bisel=0.06))
    objs.append(prisma(cont, 0.2, T0 - 0.2, "azul_marinho", bisel=0.05))
    faixa_vidro(acc, cont, 0.5, 3.9, painel=1.6, sem=101, quebra=20, apagadas=0.1,
                pular=lambda i, s, c, nn: nn.y < -0.8 and abs(c.x) < 1.8)
    objs.append(prisma(cont, T0, H - T0, v.get("cor", "creme"), bisel=0.05))
    for k in (0, 3, 6, 9):
        z = T0 + k * ANDAR
        objs.append(prisma(offset(cont, 0.14), z - 0.14, 0.26, v.get("faixa", "azul_celeste"), bisel=0.07, seg=1))
    janelas_contorno(acc, cont, T0, n_and - 1, passo=2.15, larg=0.98, alt=1.65, peit=0.75, moldura="azul",
                     sem=110, quebra=20, peitoril=False,
                     pular=lambda i, s, j, pp, nn: nn.y < -0.8 and -L / 2 + 1.9 < pp.x < -L / 2 + 3.4)

    Mfr = fachada(0, -P / 2)
    objs.append(prisma(rr(6.4, 2.8, 1.2, 4, y=-P / 2 - 1.2), 4.0, 0.36, "vermelho", bisel=0.12))
    objs.append(prisma(rr(6.0, 2.4, 1.0, 4, y=-P / 2 - 1.2), 3.92, 0.1, None, mat="luz", bisel=0))
    acc.caixa(Mfr, 2.6, 0.2, 3.0, y=-0.1, z=0.3, cor="ouro")
    objs.append(mb.cilindro(1.0, 2.8, y=-P / 2 - 0.55, z=0.3, cor=None, mat="vidro", seg=20, bisel=0))
    objs.append(mb.cilindro(1.08, 0.2, y=-P / 2 - 0.55, z=3.1, cor="ouro", seg=20, bisel=0.04))
    objs.append(mb.cilindro(1.08, 0.12, y=-P / 2 - 0.55, z=0.2, cor="ouro", seg=20, bisel=0.03))
    acc.caixa(FRENTE, 0.05, 1.9, 2.8, y=-P / 2 - 0.55, z=0.3, cor="ouro")  # folhas da porta giratória
    acc.caixa(FRENTE, 1.9, 0.05, 2.8, y=-P / 2 - 0.55, z=0.3, cor="ouro")
    for x in (-4.6, 4.6):
        objs.append(mb.cilindro(0.06, 6.0, x=x, y=-P / 2 - 1.4, z=0, cor="cromo", seg=8, bisel=0))
        objs.append(mb.caixa(1.2, 0.05, 0.75, x=x + 0.62, y=-P / 2 - 1.4, z=5.0, cor="azul" if x < 0 else "vermelho",
                             bisel=0.02))
    xb, yb = -L / 2 + 2.65, -P / 2 - 1.3
    for nn in ((-1, 0), (1, 0)):
        placa(objs, "hotel_v", Mf((xb, yb), nn), 0, 9.5, 1.9, prof=0.14, borda=0.16, cor_borda="vermelho", luzes=acc)
    for z in (10.2, 15.0):
        objs.append(mb.caixa(0.3, 1.2, 0.3, x=xb, y=-P / 2 - 0.5, z=z, cor="grafite", bisel=0.05))
    hp = placa(objs, "hotel", fachada(0, -P / 2 + 1.6), 0, H + 1.2, 6.0, prof=0.16, borda=0.18, cor_borda="vermelho",
               luzes=acc)
    for x in (-2.2, 2.2):
        objs.append(mb.caixa(0.22, 0.22, 1.4 + hp, x=x, y=-P / 2 + 1.8, z=H, cor="grafite", bisel=0.03))
    objs += platibanda(cont, H, a=0.6, esp=0.3, cor="branco", cor_teto="cinza")
    casa_maquinas(objs, acc, 1.5, 2.2, H)
    caixa_dagua(objs, -2.2, 2.4, H)
    it.add(acc.objs(), objs)
    return [((0, 0, 0), (L, P, H + 0.7)), ((0, -P / 2 - 1.2, 0), (6.4, 2.8, 4.4))]


registra("escritorio_moldura_oval", "Escritório de vidro com moldura em arco", "escritorio_moldura_oval", [1, 1], 10,
         ["escritorio"], b_moldura_oval)
registra("torre_curva_empresarial", "Torre azul curva com letreiro", "torre_curva_empresarial", [1, 1], 14,
         ["escritorio", "torre", "letreiro"], b_torre_curva)
registra("predio_cilindrico_faixas", "Prédio cilíndrico de faixas", "predio_cilindrico_faixas", [1, 1], 8,
         ["escritorio"], b_cilindrico)
registra("predio_tijolo_comprido", "Prédio comprido de tijolo com varandas", "predio_tijolo_comprido", [2, 1], 5,
         ["residencial", "misto", "lojas"], b_tijolo_comprido)
registra("predio_cinza_varandas", "Prédio comprido de varandas de vidro", "predio_cinza_varandas", [2, 1], 4,
         ["residencial"], b_cinza_varandas)
registra("hotel", "Hotel com letreiro", "hotel", [1, 1], 10, ["hotel", "letreiro", "neon"], b_hotel)


# =====================================================================================================================
# RESIDENCIAIS (3)
# =====================================================================================================================
def b_lilas_sacadas(it, v):
    """Prédio lilás de baias arredondadas e sacadas (6 andares)."""
    acc, objs = Acc(), []
    l, p = 10.2, 9.0
    bossas = {"frente": [(2.4, 2.6, 0.9), (7.8, 2.6, 0.9)], "fundos": [(2.4, 2.6, 0.8), (7.8, 2.6, 0.8)],
              "dir": [(4.5, 3.0, 0.8)], "esq": [(4.5, 3.0, 0.8)]}
    cont = contorno_bossas(l, p, bossas, n=6, e=0.5)
    Z0, T = 0.5, 3.4
    n_and = 6
    H = Z0 + T + (n_and - 1) * ANDAR
    cor, cor2 = v.get("cor", "lilas"), v.get("cor2", "lilas_claro")
    objs.append(prisma(offset(cont, 0.15), 0, Z0 + 0.05, "roxo_escuro", bisel=0.06))
    objs.append(prisma(cont, Z0, H - Z0, cor, bisel=0.05))
    for k in range(1, n_and):
        z = Z0 + T + (k - 1) * ANDAR
        objs.append(prisma(offset(cont, 0.09), z - 0.1, 0.18, cor2, bisel=0.0))
    janelas_contorno(acc, cont, Z0 + T, n_and - 1, passo=1.9, larg=0.95, alt=1.4, peit=0.8, moldura="branco",
                     sem=121, quebra=35, margem=0.25, peitoril=False, ar=0.1,
                     pular=lambda i, s, j, pp, nn: nn.y < -0.9 and abs(pp.x) < 1.3)
    Mfr = fachada(0, -p / 2)
    for k in range(1, n_and):
        z = Z0 + T + (k - 1) * ANDAR
        objs.append(cx(Mfr, 2.4, 1.0, 0.18, y=-0.5, z=z - 0.05, cor=cor2, bisel=0.06))
        acc.caixa(Mfr, 2.3, 0.07, 0.9, y=-0.97, z=z + 0.13, cor="branco")
        for s_ in (-1, 1):
            acc.caixa(Mfr, 0.07, 0.95, 0.9, x=s_ * 1.13, y=-0.5, z=z + 0.13, cor="branco")
        acc.caixa(Mfr, 0.9, 0.05, 2.2, y=-0.03, z=z + 0.15, mat=sorteia(random.Random(130 + k), 0.4))
        acc.caixa(Mfr, 1.1, 0.04, 2.35, y=-0.01, z=z + 0.1, cor="branco")
    porta(acc, objs, Mfr, 0, larg=1.6, alt=2.5, moldura="branco", marquise=cor2, degraus=3, z=Z0)
    janelas_contorno(acc, cont, Z0, 1, alt_andar=T, passo=2.2, larg=1.0, alt=1.4, peit=1.0, moldura="branco",
                     sem=122, quebra=35, margem=0.25, pular=lambda i, s, j, pp, nn: nn.y < -0.9 and abs(pp.x) < 1.6)
    objs += platibanda(cont, H, a=0.8, esp=0.36, cor=cor2, cor_teto="laranja_claro")
    caixa_dagua(objs, 1.5, 1.0, H)
    ar_telhado(acc, -2.0, 1.5, H)
    it.add(acc.objs(), objs)
    return [((0, 0, 0), (l + 1.8, p + 1.8, H + 0.8))]


def b_cinza_L(it, v):
    """Prédio cinza em L com ala mais baixa e escada externa na entrada."""
    acc, objs = Acc(), []
    Z0, T = 0.5, 3.4
    A = rr(7.3, 8.6, 0.3, 2, x=-2.35)
    B = rr(5.2, 6.8, 0.3, 2, x=3.7, y=0.9)
    nA, nB = 6, 4
    HA, HB = Z0 + T + (nA - 1) * ANDAR, Z0 + T + (nB - 1) * ANDAR
    cor, trim, plat = v.get("cor", "cinza_claro"), v.get("trim", "branco"), v.get("plat", "cinza")
    for c, Hh in ((A, HA), (B, HB)):
        objs.append(prisma(offset(c, 0.15), 0, Z0 + 0.05, "cinza_medio", bisel=0.05))
        objs.append(prisma(c, Z0, Hh - Z0, cor, bisel=0.05))
        objs.append(laje_borda(c, Z0 + T - 0.15, 0.24, 0.1, trim))
        objs += platibanda(c, Hh, a=0.7, esp=0.34, cor=plat, cor_teto="cinza_claro" if plat != "cinza_claro" else "cinza")
    tapa = lambda pp, nn: (nn.x > 0.7 and pp.x < 1.2 and pp.y > -2.6)  # noqa: E731 parede da ala A atrás da B
    janelas_contorno(acc, A, Z0 + T, nA - 1, passo=2.2, larg=1.05, alt=1.4, peit=0.85, moldura=trim, sem=141, ar=0.15,
                     pular=lambda i, s, j, pp, nn: tapa(pp, nn) and j < nB - 1)
    janelas_contorno(acc, A, Z0, 1, alt_andar=T, passo=2.2, larg=1.05, alt=1.4, peit=1.0, moldura=trim, sem=142,
                     pular=lambda i, s, j, pp, nn: tapa(pp, nn) or (nn.y < -0.7 and abs(pp.x + 2.4) < 1.2))
    janelas_contorno(acc, B, Z0 + T, nB - 1, passo=2.2, larg=1.05, alt=1.4, peit=0.85, moldura=trim, sem=143,
                     sel=lambda nn: nn.x > -0.7)
    janelas_contorno(acc, B, Z0, 1, alt_andar=T, passo=2.2, larg=1.05, alt=1.4, peit=1.0, moldura=trim, sem=144,
                     sel=lambda nn: nn.x > -0.7, pular=lambda i, s, j, pp, nn: nn.y < -0.7)
    Ma = fachada(-2.4, -4.3)
    porta(acc, objs, Ma, 0, larg=1.6, alt=2.5, moldura=trim, marquise=trim, degraus=3, z=Z0)
    # entrada da ala B pela escada lateral
    Mb = fachada(3.8, 0.9 - 3.4)
    zp = 1.9
    porta(acc, objs, Mb, 0.6, larg=1.3, alt=2.4, moldura=trim, z=zp)
    objs.append(cx(Mb, 2.4, 1.5, 0.25, x=0.6, y=-0.75, z=zp - 0.25, cor="concreto", bisel=0.05))
    for s_ in range(7):  # degraus da escada lateral
        acc.caixa(Mb, 0.32, 1.2, zp - 0.27 * s_ - 0.05, x=-0.75 - 0.32 * s_, y=-0.75, z=0, cor="concreto")
    objs.append(tm(mb.tubo([(-0.6, -1.45, zp + 0.9), (-2.85, -1.45, 0.9)], 0.04, cor="grafite"), Mb))
    acc.caixa(Mb, 2.4, 0.05, 0.9, x=0.6, y=-1.48, z=zp, cor="grafite")
    caixa_dagua(objs, -3.5, 1.4, HA)
    antena(objs, -0.8, 2.6, HA, 3.0, luz=False)
    ar_telhado(acc, 4.2, 1.6, HB)
    ar_telhado(acc, 2.8, 2.4, HB, rot=90)
    it.add(acc.objs(), objs)
    return [((-2.4, 0, 0), (7.6, 8.6, HA + 0.7)), ((3.8, 0.9, 0), (5.4, 6.8, HB + 0.7))]


def b_marrom_baias(it, v):
    """Prédio de tijolo marrom com duas baias retas e floreiras verdes (5 andares)."""
    acc, objs = Acc(), []
    l, p = 10.0, 8.2
    cont = contorno_bossas(l, p, {"frente": [(2.5, 2.8, 0.85), (7.5, 2.8, 0.85)]}, n=8, e=0.28)
    Z0, T = 0.45, 3.3
    n_and = 5
    H = Z0 + T + (n_and - 1) * ANDAR
    cor, cor2 = v.get("cor", "marrom_claro"), v.get("cor2", "tijolo")
    objs.append(prisma(offset(cont, 0.15), 0, Z0 + 0.05, "cinza_medio", bisel=0.05))
    objs.append(prisma(cont, Z0, H - Z0, cor, bisel=0.05))
    for xb in (-2.5, 2.5):
        objs.append(prisma(rr(2.6, 0.9, 0.3, 3, x=xb, y=-p / 2 - 0.35), Z0 + T - 0.1, H - Z0 - T + 0.1, cor2,
                           bisel=0.05))
    objs.append(laje_borda(cont, Z0 + T - 0.2, 0.26, 0.12, "creme"))
    janelas_contorno(acc, cont, Z0 + T, n_and - 1, passo=2.0, larg=1.0, alt=1.4, peit=0.85, moldura="creme",
                     sem=151, quebra=35, margem=0.2, ar=0.1)
    rnd = random.Random(152)
    for xb in (-2.5, 2.5):
        M = fachada(xb, -p / 2 - 0.85)
        for k in range(n_and - 1):
            z = Z0 + T + k * ANDAR
            acc.caixa(M, 1.6, 0.55, 0.12, y=-0.27, z=z + 0.55, cor="verde_medio")
            acc.caixa(M, 1.6, 0.06, 0.55, y=-0.55, z=z + 0.6, cor="verde_medio")
            for u in (-0.5, 0.0, 0.5):
                if rnd.random() < 0.6:
                    acc.caixa(M, 0.32, 0.3, 0.22, x=u, y=-0.3, z=z + 0.67, cor=rnd.choice(("folha", "folha_clara", "rosa")))
    Mfr = fachada(0, -p / 2)
    porta(acc, objs, Mfr, 0, larg=1.5, alt=2.5, moldura="creme", marquise="verde_medio", degraus=3, z=Z0)
    janelas_contorno(acc, cont, Z0, 1, alt_andar=T, passo=2.2, larg=1.0, alt=1.3, peit=1.0, moldura="creme", sem=153,
                     quebra=35, margem=0.2, pular=lambda i, s, j, pp, nn: nn.y < -0.9 and abs(pp.x) < 1.2)
    tijolinhos(acc, Mfr, -l / 2 + 0.5, l / 2 - 0.5, Z0 + T, H - 0.5, 10, sem=154, cor="marrom")
    objs += platibanda(cont, H, a=0.75, esp=0.36, cor="cinza_claro", cor_teto="cinza")
    caixa_dagua(objs, 2.4, 1.6, H)
    ar_telhado(acc, -2.4, 1.6, H)
    it.add(acc.objs(), objs)
    return [((0, -0.4, 0), (l, p + 0.9, H + 0.8))]


def b_laranja_telhado(it, v):
    """Prédio laranja de esquina com telhado de quatro águas vermelho, mansarda e chaminé (5 andares)."""
    acc, objs = Acc(), []
    L, P = 8.4, 8.4
    Z0, T = 0.5, 3.4
    n_and = 5
    H = Z0 + T + (n_and - 1) * ANDAR
    cor, cor2, telh = v.get("cor", "laranja"), v.get("cor2", "amarelo_escuro"), v.get("telhado", "vermelho")
    cont = rr(L, P, 0.3, 2)
    objs.append(prisma(offset(cont, 0.15), 0, Z0 + 0.05, "cinza_medio", bisel=0.05))
    objs.append(prisma(cont, Z0, H - Z0, cor, bisel=0.05))
    for sx in (-1, 1):
        for sy in (-1, 1):
            objs.append(mb.caixa(0.8, 0.8, H - Z0, x=sx * (L / 2 - 0.3), y=sy * (P / 2 - 0.3), z=Z0, cor=cor2, bisel=0.12))
    objs.append(laje_borda(cont, Z0 + T - 0.15, 0.22, 0.15, "creme"))
    objs.append(laje_borda(cont, H - 0.35, 0.4, 0.3, "creme", bisel=0.1))
    janelas_contorno(acc, cont, Z0 + T, n_and - 1, passo=2.2, larg=1.0, alt=1.45, peit=0.8, moldura="branco", sem=161,
                     margem=0.8, capota=None, ar=0.08)
    rnd = random.Random(162)
    for lado, M in (("frente", fachada(0, -P / 2)), ("dir", fachada(L / 2, 0, "dir"))):
        for k in range(n_and - 1):
            for u in (-2.2, 0.0, 2.2):
                if rnd.random() < 0.45:
                    z = Z0 + T + k * ANDAR + 0.8
                    acc.caixa(M, 1.2, 0.35, 0.22, x=u, y=-0.25, z=z - 0.35, cor="verde_medio")
                    acc.caixa(M, 1.0, 0.25, 0.18, x=u, y=-0.25, z=z - 0.13, cor=rnd.choice(("rosa", "vermelho_claro", "folha")))
    Mfr = fachada(0, -P / 2)
    porta(acc, objs, Mfr, 0, larg=1.5, alt=2.5, moldura="branco", marquise="creme", degraus=3, z=Z0)
    janelas_contorno(acc, cont, Z0, 1, alt_andar=T, passo=2.2, larg=1.0, alt=1.3, peit=1.0, moldura="branco",
                     sem=163, margem=0.8, pular=lambda i, s, j, pp, nn: nn.y < -0.9 and abs(pp.x) < 1.2)
    hr = 3.0
    objs.append(telhado_quatro_aguas(L, P, H + 0.05, hr, cor=telh, beiral=0.45))
    # mansarda na água da frente
    dy = 1.6
    objs.append(mb.caixa(1.7, 2.4, 1.9, y=-P / 2 + dy + 1.2, z=H, cor=cor, bisel=0.06))
    sub = telhado_quatro_aguas(1.7, 2.4, H + 1.9, 0.8, cor=telh, beiral=0.2)
    mb.transforma(sub, loc=(0, -P / 2 + dy + 1.2, 0))
    objs.append(sub)
    janela(acc, fachada(0, -P / 2 + dy), 0.8, 1.0, H + 0.55, "branco", sorteia(rnd), peitoril=False)
    objs.append(mb.caixa(0.8, 0.8, hr + 1.2, x=2.0, y=1.8, z=H, cor="tijolo", bisel=0.06))
    objs.append(mb.caixa(1.0, 1.0, 0.18, x=2.0, y=1.8, z=H + hr + 1.2, cor="cinza_claro", bisel=0.05))
    it.add(acc.objs(), objs)
    return [((0, 0, 0), (L, P, H)), ((0, 0, H), (L, P, hr))]


def b_verde_azul(it, v):
    """Prédio de alas verdes e meio azul com varandas e sorveteria no térreo (4 andares)."""
    acc, objs = Acc(), []
    L, P = 12.0, 8.6
    Z0, T = 0.3, 3.9
    n_and = 4
    H = Z0 + T + (n_and - 1) * ANDAR
    cont = rr(L, P, 0.35, 2)
    cor, meio = v.get("cor", "verde"), v.get("meio", "azul_claro")
    objs.append(prisma(offset(cont, 0.15), 0, Z0 + 0.05, "cinza_medio", bisel=0.05))
    wa = 3.4
    for sx in (-1, 1):
        objs.append(prisma(rr(wa, P, 0.35, 2, x=sx * (L / 2 - wa / 2)), Z0, H - Z0, cor, bisel=0.05))
    lm = L - 2 * wa
    objs.append(prisma(ret(lm + 0.1, P - 1.6), Z0, H - Z0, meio, bisel=0.0))
    objs.append(laje_borda(cont, Z0 + T - 0.18, 0.26, 0.12, "branco"))
    rnd = random.Random(171)
    for lado, y0 in (("frente", -(P - 1.6) / 2), ("fundos", (P - 1.6) / 2)):
        M = fachada(0, y0, lado)
        Mb = fachada(0, -P / 2 if lado == "frente" else P / 2, lado)
        for k in range(n_and - 1):
            z = Z0 + T + k * ANDAR
            for q in range(3):
                u = -lm / 2 + lm / 3 * (q + 0.5)
                acc.caixa(M, lm / 3 - 0.25, 0.05, 2.3, x=u, y=-0.03, z=z + 0.2, mat=sorteia(rnd))
                acc.caixa(M, lm / 3 - 0.05, 0.03, 2.45, x=u, y=-0.01, z=z + 0.12, cor="branco")
            objs.append(cx(Mb, lm, 0.95, 0.2, y=0.35, z=z - 0.05, cor="branco", bisel=0.06))
            acc.caixa(Mb, lm - 0.05, 0.05, 0.85, y=-0.08, z=z + 0.15, mat="vidro")
            acc.caixa(Mb, lm, 0.1, 0.08, y=-0.08, z=z + 1.0, cor="branco")
        if lado == "frente":
            vitrine_loja(acc, objs, M, -lm / 2 + 0.2, lm / 2 - 0.2, z=Z0, alt=3.0, moldura="branco", porta_u=0.0,
                         painel=1.5)
            toldo(acc, Mb, -lm / 2 + 0.1, lm / 2 - 0.1, Z0 + 3.25, prof=1.0, queda=0.45, cores=("rosa", "branco"))
            placa(objs, v.get("loja", "sorvetes"), Mb, 0, Z0 + 3.35, 3.0, prof=0.1, borda=0.1, cor_borda="branco")
    for sx in (-1, 1):
        ca = rr(wa, P, 0.35, 2, x=sx * (L / 2 - wa / 2))
        janelas_contorno(acc, ca, Z0 + T, n_and - 1, passo=1.6, larg=1.0, alt=1.45, peit=0.8, moldura="branco",
                         sem=172 + sx, sel=lambda nn, sx=sx: nn.x * sx > 0.7 or abs(nn.y) > 0.7, margem=0.4, ar=0.1)
        janelas_contorno(acc, ca, Z0, 1, alt_andar=T, passo=1.6, larg=1.0, alt=1.6, peit=1.0, moldura="branco",
                         sem=174 + sx, sel=lambda nn, sx=sx: nn.x * sx > 0.7 or nn.y > 0.7, margem=0.4)
        porta(acc, objs, fachada(sx * (L / 2 - wa / 2), -P / 2), 0, larg=1.3, alt=2.5, moldura="branco",
              marquise="branco", z=Z0) if sx > 0 else \
            janela(acc, fachada(sx * (L / 2 - wa / 2), -P / 2), 1.6, 1.8, Z0 + 1.0, "branco", "janela")
    objs += platibanda(cont, H, a=0.7, esp=0.34, cor="cinza_claro", cor_teto="cinza")
    caixa_dagua(objs, -4.4, 1.5, H)
    ar_telhado(acc, 4.0, 1.4, H)
    it.add(acc.objs(), objs)
    return [((0, 0, 0), (L, P, H + 0.7))]


def b_tijolo_pequeno(it, v):
    """Prédio pequeno de tijolo com porão e escadinha de entrada (4 andares)."""
    acc, objs = Acc(), []
    L, P = 8.0, 7.6
    Zp = 1.2
    n_and = 4
    H = Zp + n_and * ANDAR
    cont = rr(L, P, 0.25, 2)
    cor = v.get("cor", "tijolo")
    objs.append(prisma(offset(cont, 0.08), 0, Zp, "concreto_escuro", bisel=0.05))
    objs.append(prisma(cont, Zp, H - Zp, cor, bisel=0.05))
    objs.append(laje_borda(cont, Zp - 0.1, 0.22, 0.14, "branco"))
    objs.append(laje_borda(cont, H - 0.5, 0.35, 0.22, "branco", bisel=0.09))
    for k in range(1, n_and):
        objs.append(laje_borda(cont, Zp + k * ANDAR - 0.06, 0.1, 0.04, v.get("faixa", "terracota_escura"), bisel=0.02))
    janelas_contorno(acc, cont, Zp, n_and, passo=2.3, larg=1.05, alt=1.5, peit=0.8, moldura="branco", sem=181,
                     margem=0.6, ar=0.12, pular=lambda i, s, j, pp, nn: j == 0 and nn.y < -0.9 and pp.x < -1.0)
    rnd = random.Random(182)
    for i, ln in enumerate(trechos(cont)):
        if ln.L < 2:
            continue
        a, b = ln.p[0], ln.p[-1]
        t = (b - a).normalized()
        nn = _normal(t)
        for q in (0.3, 0.7):
            pp = a.lerp(b, q)
            if nn.y < -0.9 and pp.x < -1.0:
                continue
            acc.caixa(Mf(pp, nn), 0.7, 0.06, 0.45, y=-0.03, z=0.45, mat=sorteia(rnd, 0.6))
    Mfr = fachada(0, -P / 2)
    xd = -2.3
    porta(acc, objs, Mfr, xd, larg=1.2, alt=2.4, moldura="branco", z=Zp)
    objs.append(cx(Mfr, 1.9, 0.9, 0.2, x=xd, y=-0.45, z=Zp + 2.75, cor="branco", bisel=0.06))
    ns = 6
    for k in range(ns):  # escadinha de entrada
        acc.caixa(Mfr, 1.5, 0.32, Zp - k * Zp / ns, x=xd, y=-0.16 - 0.32 * k, z=0, cor="concreto")
    for s_ in (-1, 1):
        objs.append(tm(mb.tubo([(xd + s_ * 0.8, -0.1, Zp + 0.9), (xd + s_ * 0.8, -0.32 * ns, 0.9)], 0.035,
                               cor="grafite"), Mfr))
        objs.append(tm(mb.cilindro(0.04, 0.9, x=xd + s_ * 0.8, y=-0.32 * ns, z=0, cor="grafite", seg=8), Mfr))
    tijolinhos(acc, Mfr, -L / 2 + 0.5, L / 2 - 0.5, Zp + 0.3, H - 0.8, 12, sem=183, cor=v.get("faixa", "terracota_escura"))
    objs += platibanda(cont, H, a=0.55, esp=0.3, cor="branco", cor_teto="cinza", sobra=0.15)
    objs.append(mb.caixa(1.8, 1.4, 1.1, x=1.6, y=1.4, z=H, cor="concreto", bisel=0.06))
    objs.append(mb.caixa(2.0, 1.6, 0.12, x=1.6, y=1.4, z=H + 1.1, cor="cinza_medio", bisel=0.04))
    ar_telhado(acc, -1.8, 1.6, H)
    it.add(acc.objs(), objs)
    return [((0, 0, 0), (L, P, H + 0.55)), ((xd, -P / 2 - 1.0, 0), (1.6, 2.0, Zp))]


def b_bege_8(it, v):
    """Prédio de apartamentos bege de 8 andares com varandas nos cantos."""
    acc, objs = Acc(), []
    L, P = 11.0, 10.0
    n_and = 8
    H = TERREO + (n_and - 1) * ANDAR
    cont = rr(L, P, 0.45, 2)
    cor, cor2, mold = v.get("cor", "bege"), v.get("cor2", "creme"), v.get("moldura", "azul")
    objs.append(prisma(offset(cont, 0.15), 0, 0.35, "cinza_medio", bisel=0.05))
    objs.append(prisma(cont, 0.25, H - 0.25, cor, bisel=0.05))
    for sx in (-1, 1):
        for sy in (-1, 1):
            objs.append(mb.caixa(0.9, 0.9, H - 0.25, x=sx * (L / 2 - 0.35), y=sy * (P / 2 - 0.35), z=0.25, cor=cor2,
                                 bisel=0.14))
    objs.append(laje_borda(cont, TERREO - 0.2, 0.3, 0.16, cor2, bisel=0.08))
    janelas_contorno(acc, cont, TERREO, n_and - 1, passo=2.15, larg=1.05, alt=1.45, peit=0.8, moldura=mold, sem=191,
                     margem=1.0, peitoril=False, ar=0.1)
    Mfr = fachada(0, -P / 2)
    for k in range(n_and - 1):
        z = TERREO + k * ANDAR
        for sx in (-1, 1):
            u = sx * (L / 2 - 1.55)
            objs.append(cx(Mfr, 2.7, 1.3, 0.2, x=u, y=-0.65, z=z - 0.05, cor=cor2, bisel=0.07, seg=1))
            acc.caixa(Mfr, 2.6, 0.05, 0.85, x=u, y=-1.25, z=z + 0.15, mat="vidro")
            acc.caixa(Mfr, 2.7, 0.1, 0.08, x=u, y=-1.27, z=z + 1.0, cor="branco")
            acc.caixa(Mfr, 0.1, 1.3, 0.08, x=u + sx * 1.3, y=-0.65, z=z + 1.0, cor="branco")
            acc.caixa(Mfr, 0.05, 1.25, 0.85, x=u + sx * 1.32, y=-0.65, z=z + 0.15, mat="vidro")
    porta(acc, objs, Mfr, -1.4, larg=2.0, alt=2.7, moldura=mold, marquise=mold, z=0.35)
    acc.caixa(Mfr, 3.0, 0.06, 2.7, x=2.6, y=-0.03, z=0.3, cor="grafite")
    for k in range(6):
        acc.caixa(Mfr, 3.0, 0.03, 0.05, x=2.6, y=-0.075, z=0.55 + 0.42 * k, cor="cinza_medio")
    objs.append(cx(Mfr, 3.4, 0.2, 0.25, x=2.6, y=-0.1, z=3.0, cor=cor2, bisel=0.06))
    janelas_contorno(acc, cont, 0.35, 1, alt_andar=TERREO, passo=2.4, larg=1.4, alt=1.6, peit=1.2, moldura=mold,
                     sem=192, margem=1.0, sel=lambda nn: nn.y > -0.7)
    objs += platibanda(cont, H, a=0.8, esp=0.38, cor=cor2, cor_teto="cinza")
    casa_maquinas(objs, acc, -2.6, 2.0, H)
    caixa_dagua(objs, 1.0, 2.4, H)
    caixa_dagua(objs, 3.2, 2.4, H)
    antena(objs, 3.6, -2.6, H, 3.4)
    it.add(acc.objs(), objs)
    return [((0, 0, 0), (L, P, H + 0.8)), ((0, -P / 2 - 0.65, TERREO), (L, 1.3, H - TERREO))]


registra("apto_lilas_sacadas", "Prédio lilás de sacadas", "apto_lilas_sacadas", [1, 1], 6, ["residencial"],
         b_lilas_sacadas)
registra("apto_cinza_l", "Prédio cinza em L com escada", "apto_cinza_l", [1, 1], 6, ["residencial"], b_cinza_L)
registra("apto_marrom_baias", "Prédio marrom de baias com floreiras", "apto_marrom_baias", [1, 1], 5,
         ["residencial", "tijolo"], b_marrom_baias)
registra("apto_laranja_telhado", "Prédio laranja de telhado vermelho", "apto_laranja_telhado", [1, 1], 5,
         ["residencial"], b_laranja_telhado)
registra("apto_verde_azul_sorveteria", "Prédio verde e azul com sorveteria", "apto_verde_azul", [1, 1], 4,
         ["residencial", "misto", "lojas"], b_verde_azul)
registra("apto_tijolo_pequeno", "Prédio pequeno de tijolo com escadinha", "apto_tijolo_pequeno", [1, 1], 4,
         ["residencial", "tijolo"], b_tijolo_pequeno)
registra("apto_bege_8_andares", "Prédio bege de 8 andares", "apto_bege_8_andares", [1, 1], 8, ["residencial"],
         b_bege_8)


# =====================================================================================================================
# COMÉRCIO E LAZER (2)
# =====================================================================================================================
def violino(h=9.0):
    """Violino gigante em pé (frente para −Y), base em z = 0, centrado em x = 0. Devolve objetos."""
    objs = []
    Hb = h * 0.6
    zb = 0.25
    ys = [0, .04, .12, .25, .38, .47, .55, .63, .72, .84, .94, 1.0]
    hw = [0.0, 0.16, 0.26, 0.30, 0.275, 0.2, 0.185, 0.215, 0.25, 0.24, 0.16, 0.0]
    cur = catmull([(w * Hb, y * Hb) for w, y in zip(hw, ys)], n=4)
    dir_ = [(max(0.02, p.x), p.y + zb) for p in cur[1:-1]]
    cont = [(0, zb)] + dir_ + [(0, zb + Hb)] + [(-x, z) for x, z in dir_[::-1]]
    esp = 0.8
    objs.append(mb.extrudado(ccw(cont), esp, y=-esp / 2, cor="caramelo", bisel=0.24, seg=3, plano="xz"))
    tampo = offset(cont, -0.2)
    objs.append(mb.extrudado(ccw(tampo), 0.06, y=-esp / 2 - 0.035, cor="madeira_mel", bisel=0.02, seg=1, plano="xz"))
    for sx in (-1, 1):
        f = mb.caixa(0.16, 0.05, 1.15, cor="preto", bisel=0.06, seg=2)
        mb.transforma(f, rot=("Y", sx * 8))
        mb.transforma(f, loc=(sx * 0.72, -esp / 2 - 0.06, zb + Hb * 0.36))
        objs.append(f)
    objs.append(mb.caixa(1.1, 0.14, 0.45, y=-esp / 2 - 0.1, z=zb + Hb * 0.41, cor="creme", bisel=0.04))
    tail = [(-0.22, zb + 0.35), (0.22, zb + 0.35), (0.36, zb + 1.6), (-0.36, zb + 1.6)]
    objs.append(mb.extrudado(ccw(tail), 0.1, y=-esp / 2 - 0.12, cor="preto", bisel=0.04, plano="xz"))
    zf0, zf1 = zb + Hb * 0.56, zb + Hb + 2.4
    objs.append(mb.caixa(0.55, 0.14, zf1 - zf0, y=-esp / 2 - 0.08, z=zf0, cor="preto", bisel=0.05))
    objs.append(mb.caixa(0.46, 0.5, zf1 - zb - Hb + 0.4, y=-0.1, z=zb + Hb - 0.4, cor="caramelo", bisel=0.12))
    objs.append(mb.caixa(0.42, 0.55, 0.95, y=0.05, z=zf1 - 0.05, cor="caramelo", bisel=0.1))
    objs.append(mb.cilindro(0.34, 0.46, y=0.08, z=zf1 + 1.1, cor="caramelo", eixo="x", seg=16, bisel=0.08))
    objs.append(mb.cilindro(0.18, 0.5, y=-0.06, z=zf1 + 1.05, cor="madeira_mel", eixo="x", seg=12, bisel=0.05))
    for k, zz in enumerate((0.15, 0.4, 0.65, 0.85)):
        sx = -1 if k % 2 == 0 else 1
        objs.append(mb.cilindro(0.07, 0.42, x=sx * 0.38, y=0.05, z=zf1 + zz, cor="preto", eixo="x", seg=8, bisel=0.02))
        objs.append(mb.esfera(0.12, x=sx * 0.6, y=0.05, z=zf1 + zz, cor="preto", seg=8, esc=(0.6, 1, 1)))
    for xs in (-0.2, -0.07, 0.07, 0.2):
        objs.append(mb.caixa(0.035, 0.035, zf1 - zb - 1.55, x=xs * 0.7, y=-esp / 2 - 0.2,
                             z=zb + 1.55, cor="branco", bisel=0, seg=1))
    objs.append(mb.cilindro(0.08, 0.3, z=0.0, cor="preto", seg=10, bisel=0.02))
    return objs


def b_salao_musica(it, v):
    """Salão de música de frente curva com um violino gigante encostado na fachada."""
    acc, objs = Acc(), []
    rx, ry = 5.9, 4.8
    frente = [(rx * math.cos(math.radians(a)), ry * math.sin(math.radians(a))) for a in range(180, 361, 9)]
    cont = frente + [(rx, 4.0), (rx - 0.8, 4.8), (-rx + 0.8, 4.8), (-rx, 4.0)]
    H = 8.6
    cor, faixa = v.get("cor", "creme"), v.get("faixa", "vinho")
    objs.append(prisma(offset(cont, 0.18), 0, 0.4, "cinza_medio", bisel=0.06))
    objs.append(prisma(cont, 0.3, H - 0.3, cor, bisel=0.05))
    fr = lambda nn: nn.y < 0.3  # noqa: E731
    faixa_vidro(acc, cont, 0.6, 3.85, painel=1.5, sem=201, quebra=25, sel=fr, apagadas=0.1,
                pular=lambda i, s, c, nn: nn.y < -0.9 and abs(c.x) < 1.6)
    porta(acc, objs, fachada(0, -ry), 0, larg=2.4, alt=2.9, moldura="ouro", z=0.4)
    objs.append(laje_borda(cont, 4.05, 0.38, 0.45, faixa, bisel=0.12))
    janelas_contorno(acc, cont, 4.75, 1, alt_andar=3.0, passo=1.9, larg=0.85, alt=1.9, peit=0.25, moldura="ouro",
                     sem=202, quebra=25, sel=fr, pular=lambda i, s, j, pp, nn: nn.y < -0.8 and abs(pp.x) < 2.6,
                     peitoril=False)
    Mfr = fachada(0, -ry)
    placa(objs, "musica", Mfr, 0, 5.4, 3.8, prof=0.12, borda=0.14, cor_borda="ouro", luzes=acc)
    objs.append(anel(offset(cont, 0.35), offset(cont, -0.2), H - 0.1, 0.7, faixa, bisel=0.12))
    objs.append(prisma(cont, H - 0.05, 0.1, "cinza_claro", bisel=0))
    torre = rr(7.4, 4.2, 1.6, 6, y=1.9)
    objs.append(prisma(torre, H, 3.0, cor, bisel=0.08))
    objs.append(laje_borda(torre, H + 3.0, 0.45, 0.2, faixa, bisel=0.12))
    for k in range(5):  # pentagrama e notas musicais decorativas na torre
        objs.append(mb.caixa(7.0, 0.04, 0.06, y=1.9 - 2.1 - 0.02, z=H + 1.0 + 0.3 * k, cor="ouro", bisel=0, seg=1))
    for x, z in ((-2.4, 1.3), (-0.4, 1.9), (1.8, 1.6)):
        objs.append(mb.esfera(0.24, x=x, y=-0.25, z=H + z, cor="preto", seg=10, esc=(1.3, 0.5, 1)))
        objs.append(mb.caixa(0.06, 0.06, 0.9, x=x + 0.28, y=-0.25, z=H + z, cor="preto", bisel=0, seg=1))
    vio = violino(10.2)
    M = Matrix.Translation((4.15, -4.25, 0.3)) @ Matrix.Rotation(math.radians(-28), 4, "Z") @ \
        Matrix.Rotation(math.radians(-9), 4, "X") @ Matrix.Rotation(math.radians(-6), 4, "Y")
    for o in vio:
        o.data.transform(M)
    objs += vio
    ar_telhado(acc, -4.2, 3.4, H)
    it.add(acc.objs(), objs)
    return [((0, 0, 0), (2 * rx, 9.6, H + 0.6)), ((0, 1.9, H), (7.4, 4.2, 3.4)), ((4.2, -4.3, 0.3), (3.4, 1.6, 10.0))]


def b_cinema(it, v):
    """Cinema art déco com marquise de lâmpadas, letreiro CINEMA, placa vertical CINE, cartazes e bilheteria."""
    acc, objs = Acc(), []
    L, P = 12.6, 9.8
    H = 9.6
    cont = rr(L, P, 0.4, 2)
    cor, cor2 = v.get("cor", "vermelho_escuro"), v.get("cor2", "creme")
    objs.append(prisma(offset(cont, 0.15), 0, 0.35, "grafite", bisel=0.05))
    objs.append(prisma(cont, 0.3, H - 0.3, cor, bisel=0.05))
    objs += platibanda(cont, H, a=0.75, esp=0.32, cor=cor2, cor_teto="cinza")
    yf = -P / 2
    Mfr = fachada(0, yf)
    for u in (-5.6, -2.1, 2.1, 5.6):
        objs.append(cx(Mfr, 0.55, 0.3, H - 4.6 + 0.5, x=u, y=-0.15, z=5.4, cor=cor2, bisel=0.1))
    objs.append(cx(Mfr, 2.8, 1.0, H + 2.6, x=0, y=-0.5, z=0.3, cor=cor2, bisel=0.16))
    objs.append(cx(Mfr, 2.2, 0.8, 1.0, x=0, y=-0.45, z=H + 2.9, cor=cor2, bisel=0.14))
    objs.append(cx(Mfr, 1.4, 0.6, 0.8, x=0, y=-0.35, z=H + 3.9, cor=cor2, bisel=0.12))
    objs.append(tm(mb.esfera(0.32, z=H + 5.0, y=-0.35, cor="ouro", seg=12), Mfr))
    placa(objs, "cine_v", fachada(0, yf - 1.0), 0, 6.0, 1.6, prof=0.12, borda=0.16, cor_borda="ouro", luzes=acc)
    # marquise
    zm, pm = 4.0, 2.3
    objs.append(cx(Mfr, L - 1.0, pm, 1.3, x=0, y=-pm / 2, z=zm, cor=cor2, bisel=0.16))
    acc.caixa(Mfr, L - 1.6, pm - 0.5, 0.05, y=-pm / 2, z=zm - 0.03, mat="luz")
    n = 26
    for k in range(n):
        u = -(L - 1.4) / 2 + (L - 1.4) * k / (n - 1)
        acc.caixa(Mfr, 0.14, 0.14, 0.14, x=u, y=-pm - 0.06, z=zm + 0.05, mat="luz")
        acc.caixa(Mfr, 0.14, 0.14, 0.14, x=u, y=-pm - 0.06, z=zm + 1.12, mat="luz")
    placa(objs, "cinema", fachada(0, yf - pm), 0, zm + 0.2, 4.0, prof=0.1, borda=0.08, cor_borda="ouro")
    for sx in (-1, 1):
        placa(objs, "cinema", fachada(sx * (L / 2 - 0.5), yf - pm / 2, "dir" if sx > 0 else "esq"), 0, zm + 0.3, 2.0,
              prof=0.08, borda=0.05, cor_borda="ouro")
    for u in (-2.6, 2.6):
        porta(acc, objs, Mfr, u, larg=1.9, alt=2.8, moldura="ouro", z=0.3)
    for u, nome in ((-5.0, "cartaz_estrela"), (-3.9, None), (3.9, None), (5.0, "cartaz_foguete")):
        if nome:
            placa(objs, nome, Mfr, u, 1.0, 1.25, prof=0.1, borda=0.12, cor_borda="ouro", luzes=acc)
    for sx, nome in ((-1, "cartaz_coracao"), (1, "cartaz_dino")):
        Ml = fachada(sx * L / 2, -2.5, "dir" if sx > 0 else "esq")
        placa(objs, nome, Ml, 0, 1.0, 1.25, prof=0.1, borda=0.12, cor_borda="ouro", luzes=acc)
    # bilheteria
    bil = rr(1.9, 1.2, 0.55, 4, y=yf - 1.45)
    objs.append(prisma(bil, 0.0, 1.0, cor2, bisel=0.08))
    objs.append(prisma(bil, 1.0, 1.3, None, mat="vidro", bisel=0.0))
    objs.append(prisma(offset(bil, 0.12), 2.3, 0.28, cor, bisel=0.1))
    placa(objs, "ingressos", fachada(0, yf - 2.05), 0, 2.62, 1.7, prof=0.06, borda=0.05, cor_borda="ouro")
    acc.caixa(FRENTE, 1.2, 0.04, 0.9, y=yf - 1.4, z=1.15, mat="janela")
    for u in (-3.85, 3.85):
        for zz in (6.0,):
            janela(acc, Mfr, 1.5, 1.8, zz, cor2, sorteia(random.Random(int(u * 10))), peitoril=True)
    janelas_contorno(acc, cont, 5.9, 1, alt_andar=3.0, passo=3.2, larg=1.1, alt=1.4, peit=0.3, moldura=cor2,
                     sem=211, sel=lambda nn: abs(nn.x) > 0.7, margem=2.5)
    for x in (-3.5, 0.5, 3.5):
        ar_telhado(acc, x, 2.5, H)
    objs.append(mb.caixa(3.0, 2.0, 1.8, x=-2.5, y=-1.0, z=H, cor=cor, bisel=0.08))
    it.add(acc.objs(), objs)
    return [((0, 0, 0), (L, P, H + 0.75)), ((0, yf - pm / 2, zm), (L - 1.0, pm, 1.3)), ((0, yf - 0.5, 0), (2.8, 1.0, H + 5.0))]


def b_padaria_esquina(it, v):
    """Loja de esquina de canto redondo com padaria no térreo e toldos (2 andares)."""
    acc, objs = Acc(), []
    L, P = 10.8, 10.8
    rc = 3.4
    cont = ret_cantos(L, P, (rc, 0.3, 0.3, 0.3), seg=6)
    H = TERREO + ANDAR
    cor, terreo = v.get("cor", "bege"), v.get("terreo", "marrom")
    objs.append(prisma(offset(cont, 0.12), 0, 0.3, "cinza_medio", bisel=0.05))
    objs.append(prisma(cont, 0.2, TERREO - 0.2, terreo, bisel=0.05))
    objs.append(prisma(cont, TERREO, H - TERREO, cor, bisel=0.05))
    objs.append(laje_borda(cont, TERREO - 0.3, 0.38, 0.2, "creme", bisel=0.1))
    cc = V((-L / 2 + rc, -P / 2 + rc))
    nn = V((-1, -1)).normalized()
    pc = cc + nn * rc
    loja = lambda nn_: nn_.y < -0.5 or nn_.x < -0.5  # noqa: E731
    faixa_vidro(acc, cont, 0.65, 3.35, painel=1.55, sem=221, quebra=20, sel=loja, apagadas=0.0, frias=0.25,
                pular=lambda i, s, c, n_: (c - pc).length < 1.2)
    objs.append(laje_borda(cont, 3.38, 0.14, 0.04, "creme", bisel=0.03))
    Mc = Mf(pc, nn)
    porta(acc, objs, Mc, 0, larg=1.6, alt=2.7, moldura="creme", z=0.3)
    placa(objs, v.get("loja", "padaria"), Mc, 0, TERREO + 0.35, 3.6, prof=0.12, borda=0.13, cor_borda="creme",
          luzes=acc)
    for k in range(2):
        objs.append(cx(Mc, 0.18, 0.7, 0.18, x=(k - 0.5) * 3.0, y=-0.35, z=TERREO + 0.4, cor="grafite", bisel=0.03))
    tc = v.get("toldo", ("vermelho", "branco"))
    toldo(acc, fachada(0, -P / 2), -L / 2 + rc + 0.2, L / 2 - 0.5, 3.75, prof=1.2, queda=0.55, cores=tc)
    toldo(acc, fachada(-L / 2, 0, "esq"), -P / 2 + rc + 0.2, P / 2 - 0.5, 3.75, prof=1.2, queda=0.55, cores=tc)
    janelas_contorno(acc, cont, TERREO, 1, passo=2.3, larg=1.1, alt=1.45, peit=0.85, moldura="creme", sem=222,
                     quebra=20, margem=0.5, pular=lambda i, s, j, pp, n_: (pp - pc).length < 2.4, ar=0.1)
    rnd = random.Random(223)
    for M in (fachada(0, -P / 2), fachada(-L / 2, 0, "esq")):
        for u in (-1.2, 1.1, 3.4):
            acc.caixa(M, 1.25, 0.35, 0.25, x=u, y=-0.25, z=TERREO + 0.55, cor="verde_medio")
            acc.caixa(M, 1.0, 0.25, 0.2, x=u, y=-0.25, z=TERREO + 0.8, cor=rnd.choice(("rosa", "vermelho_claro", "folha")))
    objs += platibanda(cont, H, a=0.8, esp=0.34, cor="creme", cor_teto="cinza")
    caixa_dagua(objs, 2.6, 2.6, H)
    ar_telhado(acc, -1.0, 3.0, H)
    it.add(acc.objs(), objs)
    return [((0, 0, 0), (L, P, H + 0.8))]


def b_cafe_esquina(it, v):
    """Prédio de esquina com torreão de cúpula, café no térreo e toldos curvos (3 andares)."""
    acc, objs = Acc(), []
    L, P = 10.2, 10.2
    rc = 2.9
    cont = ret_cantos(L, P, (0.3, rc, 0.3, 0.3), seg=6)
    n_and = 3
    H = TERREO + (n_and - 1) * ANDAR
    cor, terreo, cup = v.get("cor", "branco"), v.get("terreo", "azul_medio"), v.get("cupula", "azul")
    objs.append(prisma(offset(cont, 0.12), 0, 0.3, "cinza_medio", bisel=0.05))
    objs.append(prisma(cont, 0.2, TERREO - 0.2, terreo, bisel=0.05))
    objs.append(prisma(cont, TERREO, H - TERREO, cor, bisel=0.05))
    objs.append(laje_borda(cont, TERREO - 0.3, 0.36, 0.2, "azul_claro", bisel=0.1))
    cc = V((L / 2 - rc, -P / 2 + rc))
    cafe = lambda nn: nn.y < -0.5 or nn.x > 0.5  # noqa: E731
    pc = cc + V((1, -1)).normalized() * rc
    faixa_vidro(acc, cont, 0.65, 3.4, painel=1.5, sem=231, quebra=20, sel=cafe, apagadas=0.0,
                pular=lambda i, s, c, nn: (c - pc).length < 1.0)
    porta(acc, objs, Mf(pc, V((1, -1)).normalized()), 0, larg=1.5, alt=2.7, moldura="branco", z=0.3)
    tc = v.get("toldo", ("azul", "branco"))
    toldo(acc, fachada(0, -P / 2), -L / 2 + 0.5, L / 2 - rc - 0.1, 3.7, prof=1.2, queda=0.5, cores=tc)
    toldo(acc, fachada(L / 2, 0, "dir"), -P / 2 + rc + 0.1, P / 2 - 0.5, 3.7, prof=1.2, queda=0.5, cores=tc)
    nseg = 5
    for k in range(nseg):
        a0, a1 = 270 + 90 * k / nseg, 270 + 90 * (k + 1) / nseg
        pa = cc + V((math.cos(math.radians(a0)), math.sin(math.radians(a0)))) * rc
        pb = cc + V((math.cos(math.radians(a1)), math.sin(math.radians(a1)))) * rc
        t = (pb - pa).normalized()
        nn = _normal(t)
        w = (pb - pa).length
        if k == nseg // 2:
            continue
        toldo(acc, Mf((pa + pb) / 2, nn), -w / 2 - 0.03, w / 2 + 0.03, 3.7, prof=1.2, queda=0.5,
              cores=(tc[k % 2], tc[(k + 1) % 2]), listra=w / 2)
    # torreão de esquina
    Ht = H + 2.2
    objs.append(mb.cilindro(rc + 0.02, Ht - TERREO, x=cc.x, y=cc.y, z=TERREO, cor=cor, seg=36, bisel=0.0))
    objs.append(mb.cilindro(rc + 0.25, 0.4, x=cc.x, y=cc.y, z=Ht, cor="azul_claro", seg=36, bisel=0.12))
    cupula = mb.torno([(rc + 0.05, 0), (rc, 0.6), (rc * 0.85, 1.4), (rc * 0.55, 2.1), (rc * 0.2, 2.5), (0.15, 2.6),
                       (0.0, 2.62)], x=cc.x, y=cc.y, z=Ht + 0.4, cor=cup, seg=32, angulo=60)
    objs.append(cupula)
    objs.append(mb.cilindro(0.08, 1.4, x=cc.x, y=cc.y, z=Ht + 2.9, cor="ouro", seg=8, bisel=0))
    objs.append(mb.esfera(0.22, x=cc.x, y=cc.y, z=Ht + 4.35, cor="ouro", seg=10))
    circ = [(cc.x + rc * math.cos(2 * math.pi * k / 36), cc.y + rc * math.sin(2 * math.pi * k / 36)) for k in range(36)]
    fora = lambda nn: nn.y < 0.35 and nn.x > -0.35  # noqa: E731
    janelas_contorno(acc, circ, TERREO, n_and, passo=1.75, larg=0.95, alt=1.45, peit=0.8, moldura="azul_claro",
                     sem=232, sel=fora, peitoril=False)
    ln = Linha([(cc.x + (rc + 0.02) * math.cos(math.radians(a)), cc.y + (rc + 0.02) * math.sin(math.radians(a)))
                for a in range(270, 361, 5)])
    wl = 2.6
    placa_curva(objs, v.get("loja", "cafe"), ln, (ln.L - wl) / 2, (ln.L + wl) / 2, TERREO + 0.3, wl / 3.0, d=0.08,
                cor_borda="azul_claro")
    janelas_contorno(acc, cont, TERREO, n_and - 1, passo=2.2, larg=1.05, alt=1.45, peit=0.85, moldura="azul_claro",
                     sem=233, quebra=20, margem=0.5, pular=lambda i, s, j, pp, nn: (pp - cc).length < rc + 0.6, ar=0.1)
    janelas_contorno(acc, cont, 0.3, 1, alt_andar=3.6, passo=2.6, larg=1.4, alt=1.6, peit=1.0, moldura="azul_claro",
                     sem=234, sel=lambda nn: not cafe(nn))
    porta(acc, objs, fachada(-L / 2, 0, "esq"), 2.0, larg=1.3, alt=2.6, moldura="branco", marquise="azul_claro", z=0.3)
    objs += platibanda(cont, H, a=0.7, esp=0.32, cor="azul_claro", cor_teto="cinza")
    caixa_dagua(objs, -3.0, 2.8, H)
    ar_telhado(acc, -0.5, 3.2, H)
    it.add(acc.objs(), objs)
    return [((0, 0, 0), (L, P, H + 0.7)), ((cc.x, cc.y, H), (2 * rc, 2 * rc, 5.0))]


def b_mercadinho(it, v):
    """Mercadinho de um andar com toldo grande, letreiro MERCADO e caixotes de frutas."""
    acc, objs = Acc(), []
    L, P = 12.5, 10.5
    H = 5.4
    cont = rr(L, P, 0.4, 2)
    objs.append(prisma(offset(cont, 0.15), 0, 0.35, "cinza_medio", bisel=0.05))
    objs.append(prisma(cont, 0.25, H - 0.25, v.get("cor", "branco"), bisel=0.05))
    objs.append(laje_borda(cont, H - 1.1, 0.35, 0.12, v.get("faixa", "verde_medio"), bisel=0.08))
    objs += platibanda(cont, H, a=0.6, esp=0.3, cor=v.get("faixa", "verde_medio"), cor_teto="cinza")
    Mfr = fachada(0, -P / 2)
    vitrine_loja(acc, objs, Mfr, -L / 2 + 0.6, L / 2 - 0.6, z=0.3, alt=3.3, moldura="branco", porta_u=-2.5, painel=1.6)
    acc.caixa(Mfr, 1.2, 0.06, 2.3, x=2.5, y=-0.1, z=0.32, mat="janela")
    toldo(acc, Mfr, -L / 2 + 0.3, L / 2 - 0.3, 3.95, prof=1.6, queda=0.7, cores=v.get("toldo", ("verde_medio", "branco")),
          listra=0.6)
    objs.append(cx(Mfr, 7.6, 0.4, 1.9, y=-0.2, z=H + 0.2, cor=v.get("faixa", "verde_medio"), bisel=0.14))
    placa(objs, "mercado", fachada(0, -P / 2 - 0.4), 0, H + 0.45, 5.8, prof=0.12, borda=0.12, cor_borda="branco",
          luzes=acc)
    for s_ in (-1, 1):
        objs.append(cx(Mfr, 0.25, 0.3, 1.0, x=s_ * 3.0, y=0.15, z=H, cor="cinza_medio", bisel=0.04))
    rnd = random.Random(241)
    frutas = ("vermelho", "laranja", "amarelo", "verde_lima", "roxo", "vermelho_claro")
    for k, u in enumerate((-5.2, -4.0, 4.0, 5.2)):
        objs.append(cx(Mfr, 1.05, 0.75, 0.55, x=u, y=-0.75, z=0.0, cor="madeira_clara", bisel=0.04))
        objs.append(cx(Mfr, 1.05, 0.75, 0.55, x=u, y=-0.6, z=0.55, cor="madeira_clara", bisel=0.04))
        for i in range(3):  # frutas em cima do caixote de cima e na beirada do de baixo
            x = u - 0.33 + 0.33 * i
            acc.caixa(Mfr, 0.28, 0.26, 0.2, x=x, y=-0.28, z=1.1 + rnd.uniform(-0.02, 0.02),
                      cor=frutas[(k * 2 + i) % len(frutas)])
            acc.caixa(Mfr, 0.28, 0.26, 0.2, x=x, y=-0.95, z=0.55, cor=frutas[(k * 2 + i + 1) % len(frutas)])
    janelas_contorno(acc, cont, 1.6, 1, alt_andar=3.0, passo=2.6, larg=1.6, alt=1.0, peit=0.6, moldura="branco",
                     sem=242, sel=lambda nn: abs(nn.x) > 0.7)
    Mb = fachada(0, P / 2, "fundos")
    acc.caixa(Mb, 3.2, 0.06, 3.0, x=-3.0, y=-0.03, z=0.3, cor="grafite")
    for k in range(7):
        acc.caixa(Mb, 3.2, 0.03, 0.05, x=-3.0, y=-0.075, z=0.55 + 0.38 * k, cor="cinza_medio")
    janela(acc, Mb, 1.4, 1.0, 2.0, "branco", sorteia(rnd), u=2.5)
    placas_solares(acc, 0.0, 1.6, H, n=6, m=2)
    ar_telhado(acc, -4.8, -1.0, H)
    ar_telhado(acc, 4.8, -1.0, H)
    it.add(acc.objs(), objs)
    return [((0, 0, 0), (L, P, H + 0.6)), ((0, -P / 2 - 0.8, 0), (L, 1.6, 1.1))]


# =====================================================================================================================
# TÉRREOS E PEQUENOS (2)
# =====================================================================================================================
def b_sobrado(it, v):
    """Sobrado de dois andares com telhado de duas águas, varanda de colunas, janela em bay e chaminé."""
    acc, objs = Acc(), []
    L, P = 9.0, 8.2
    Z0 = 0.4
    H = Z0 + 2 * 2.95
    hr = 2.6
    cor, telh, trim = v.get("cor", "tijolo"), v.get("telhado", "terracota_escura"), v.get("trim", "branco")
    cont = rr(L, P, 0.15, 1)
    objs.append(prisma(offset(cont, 0.12), 0, Z0 + 0.02, "concreto", bisel=0.05))
    objs.append(prisma(cont, Z0, H - Z0, cor, bisel=0.04))
    objs.append(laje_borda(cont, Z0 + 2.95 - 0.08, 0.16, 0.06, trim, bisel=0.03))
    objs.append(empena(L, P, H, hr, cor, eixo="x"))
    telhado_duas_aguas(objs, L, P, H - 0.05, hr, cor=telh, beiral=0.45, eixo="x")
    Mfr = fachada(0, -P / 2)
    rnd = random.Random(251)
    xd = -2.4
    porta(acc, objs, Mfr, xd, larg=1.1, alt=2.3, moldura=trim, z=Z0, mat="janela")
    objs.append(cx(Mfr, 3.6, 1.9, 0.2, x=xd, y=-0.95, z=0.0, cor="concreto", bisel=0.05))
    for s_ in (-1, 1):
        objs.append(cil(Mfr, 0.13, 2.65, x=xd + s_ * 1.55, y=-1.65, z=0.2, cor=trim, seg=12))
    tel = mb.caixa(4.0, 2.3, 0.18, cor=telh, bisel=0.06)
    mb.transforma(tel, rot=("X", 14))
    mb.transforma(tel, loc=(xd, -1.05, 2.95))
    objs.append(tm(tel, Mfr))
    bay = [(0.6, 0.0), (3.6, 0.0), (3.1, -0.85), (1.1, -0.85)]
    bay_w = [(x, -P / 2 + y) for x, y in bay]
    objs.append(prisma(bay_w, Z0, 2.5, cor, bisel=0.04))
    janelas_contorno(acc, bay_w, Z0, 1, alt_andar=2.5, passo=1.0, larg=0.7, alt=1.4, peit=0.6, moldura=trim, sem=252,
                     quebra=20, margem=0.1, sel=lambda nn: nn.y < -0.2, peitoril=False)
    janelas_contorno(acc, bay_w, Z0, 1, alt_andar=2.5, passo=1.8, larg=1.3, alt=1.4, peit=0.6, moldura=trim, sem=253,
                     quebra=20, margem=0.1, sel=lambda nn: nn.y < -0.9, peitoril=False)
    objs.append(prisma(offset(bay_w, 0.15), Z0 + 2.5, 0.22, telh, bisel=0.07))
    for u in (-2.4, 0.0, 2.4):
        janela(acc, Mfr, 1.0, 1.35, Z0 + 2.95 + 0.85, trim, sorteia(rnd), u=u)
        for s_ in (-1, 1):
            acc.caixa(Mfr, 0.42, 0.08, 1.45, x=u + s_ * 0.78, y=-0.04, z=Z0 + 2.95 + 0.8, cor=v.get("veneziana", "verde_medio"))
    # mansarda
    dy = 2.2
    zr = H + hr * (1 - dy / (P / 2)) - 0.05
    objs.append(mb.caixa(1.6, 2.6, 1.6, y=-P / 2 + dy + 1.0, z=zr - 1.2, cor=cor, bisel=0.05))
    telhado_duas_aguas(objs, 1.6, 2.6, zr + 0.35, 0.7, cor=telh, beiral=0.15, x=0, y=-P / 2 + dy + 1.0, eixo="y", esp=0.12)
    objs.append(empena(1.6, 2.6, zr + 0.4, 0.7, cor, x=0, y=-P / 2 + dy + 1.0, eixo="y"))
    janela(acc, fachada(0, -P / 2 + dy - 0.3), 0.7, 0.75, zr - 0.45, trim, sorteia(rnd), peitoril=False)
    for lado, x0 in (("dir", L / 2), ("esq", -L / 2)):
        M = fachada(x0, 0, lado)
        for u in (-2.0, 2.0):
            janela(acc, M, 0.9, 1.25, Z0 + 0.9, trim, sorteia(rnd), u=u)
            janela(acc, M, 0.9, 1.25, Z0 + 2.95 + 0.85, trim, sorteia(rnd), u=u)
        objs.append(cil(M, 0.35, 0.1, y=-0.05, z=H + 1.0, cor=trim, eixo="y", seg=14))
        acc.caixa(M, 0.42, 0.03, 0.42, y=-0.11, z=H + 0.79, mat=sorteia(rnd))
    Mb = fachada(0, P / 2, "fundos")
    for u in (-2.5, 0.0, 2.5):
        janela(acc, Mb, 1.0, 1.25, Z0 + 0.9, trim, sorteia(rnd), u=u)
        janela(acc, Mb, 1.0, 1.25, Z0 + 2.95 + 0.85, trim, sorteia(rnd), u=u)
    objs.append(mb.caixa(0.9, 0.7, H + hr + 0.4, x=L / 2 - 1.2, y=1.6, z=0.0, cor="tijolo" if cor != "tijolo" else
                         "terracota_escura", bisel=0.06))
    objs.append(mb.caixa(1.05, 0.85, 0.15, x=L / 2 - 1.2, y=1.6, z=H + hr + 0.4, cor="cinza_claro", bisel=0.04))
    for x in (2.5, 4.2):
        objs.append(moita(x, -P / 2 - 1.15, 0.0, 0.5, "folha"))
    objs.append(moita(-4.3, -P / 2 - 1.0, 0.0, 0.45, "folha_clara"))
    it.add(acc.objs(), objs)
    return [((0, 0, 0), (L, P, H)), ((0, 0, H), (L, P, hr)), ((xd, -P / 2 - 0.95, 0), (3.6, 1.9, 3.1))]


def b_lojas_2andares(it, v):
    """Prédio de dois andares com duas lojas no térreo, toldos e frontão."""
    acc, objs = Acc(), []
    L, P = 12.4, 9.0
    H = TERREO + ANDAR
    cont = rr(L, P, 0.3, 2)
    cor, terreo, trim = v["cor"], v["terreo"], v.get("trim", "creme")
    objs.append(prisma(offset(cont, 0.12), 0, 0.3, "cinza_medio", bisel=0.05))
    objs.append(prisma(cont, 0.2, TERREO - 0.2, terreo, bisel=0.05))
    objs.append(prisma(cont, TERREO, H - TERREO, cor, bisel=0.05))
    objs.append(laje_borda(cont, TERREO - 0.2, 0.3, 0.16, trim, bisel=0.08))
    Mfr = fachada(0, -P / 2)
    for (u0, u1), nome, tc in zip(((-5.9, -0.8), (0.8, 5.9)), v["lojas"], v["toldos"]):
        um = (u0 + u1) / 2
        vitrine_loja(acc, objs, Mfr, u0, u1, z=0.3, alt=2.7, moldura=trim, porta_u=um, painel=1.3)
        toldo(acc, Mfr, u0 - 0.05, u1 + 0.05, 3.15, prof=1.1, queda=0.5, cores=tc)
        placa(objs, nome, Mfr, um, 3.3, 3.2 if nome != "bazar" and nome != "pizza" else 2.6, prof=0.1, borda=0.08,
              cor_borda=trim)
    porta(acc, objs, Mfr, 0, larg=0.95, alt=2.4, moldura=trim, z=0.3)
    janelas_contorno(acc, cont, TERREO, 1, passo=2.4, larg=1.1, alt=1.5, peit=0.75, moldura=trim, sem=261, margem=0.6,
                     capota=v.get("capota"), ar=0.1)
    janelas_contorno(acc, cont, 0.3, 1, alt_andar=3.6, passo=2.6, larg=1.2, alt=1.5, peit=1.0, moldura=trim, sem=262,
                     sel=lambda nn: nn.y > -0.7, margem=0.6)
    objs += platibanda(cont, H, a=0.75, esp=0.32, cor=trim, cor_teto="cinza")
    fr = [(-2.2, 0), (2.2, 0)] + [(1.6 * math.cos(math.radians(a)), 0.25 + 1.0 * math.sin(math.radians(a)))
                                  for a in range(0, 181, 15)]
    fr = [(-2.2, 0.0), (2.2, 0.0), (2.2, 0.3)] + [(1.9 * math.cos(math.radians(a)), 0.3 + 0.95 * math.sin(math.radians(a)))
                                                for a in range(0, 181, 15)] + [(-2.2, 0.3)]
    objs.append(mb.extrudado(ccw(fr), 0.4, y=-P / 2 - 0.12, z=H + 0.6, cor=trim, bisel=0.1, plano="xz"))
    objs.append(tm(mb.cilindro(0.38, 0.1, y=-0.05, z=H + 1.3, cor=v.get("detalhe", "azul"), eixo="y", seg=16), Mfr))
    objs.append(tm(mb.cilindro(0.38, 0.1, y=-0.05, z=H + 1.3, cor=v.get("detalhe", "azul"), eixo="y", seg=16),
                   Matrix.Translation((0, -P / 2 - 0.08, 0))))
    caixa_dagua(objs, 3.6, 2.0, H, r=0.7, a=1.1)
    ar_telhado(acc, -3.4, 2.0, H)
    it.add(acc.objs(), objs)
    return [((0, 0, 0), (L, P, H + 0.75)), ((0, -P / 2 - 0.55, 2.6), (L, 1.1, 0.9))]


def b_farmacia(it, v):
    """Prédio de três andares com farmácia no térreo, cruz luminosa e sacadas de grade."""
    acc, objs = Acc(), []
    L, P = 10.4, 10.0
    n_and = 3
    H = TERREO + (n_and - 1) * ANDAR
    cont = rr(L, P, 0.35, 2)
    cor, cor2 = v.get("cor", "cinza_claro"), v.get("cor2", "tijolo")
    objs.append(prisma(offset(cont, 0.12), 0, 0.3, "cinza_medio", bisel=0.05))
    objs.append(prisma(cont, 0.2, TERREO - 0.2, "branco", bisel=0.05))
    objs.append(prisma(rr(L - 3.8, P - 0.04, 0.2, 2), TERREO, H - TERREO, cor, bisel=0.03))
    for sx in (-1, 1):
        objs.append(mb.caixa(2.0, P, H - TERREO, x=sx * (L / 2 - 1.0), z=TERREO, cor=cor2, bisel=0.08))
    objs.append(laje_borda(cont, TERREO - 0.25, 0.32, 0.16, "verde_medio", bisel=0.08))
    Mfr = fachada(0, -P / 2)
    vitrine_loja(acc, objs, Mfr, -L / 2 + 0.6, L / 2 - 2.4, z=0.3, alt=3.0, moldura="verde_medio",
                 porta_u=-1.0, painel=1.5)
    porta(acc, objs, Mfr, L / 2 - 1.3, larg=1.1, alt=2.5, moldura="branco", z=0.3)
    placa(objs, "farmacia", fachada(0, -P / 2 - 0.9), -0.6, 3.42, 3.6, prof=0.1, borda=0.08, cor_borda="verde_medio")
    for u in (-2.0, 0.8):
        objs.append(cx(Mfr, 0.08, 0.95, 0.08, x=u, y=-0.47, z=4.0, cor="grafite", bisel=0.02))
    xc, yc = L / 2 + 0.05, -P / 2 + 1.1
    M = fachada(xc, yc, "dir")
    objs.append(cx(M, 0.5, 0.3, 0.5, y=-0.15, z=4.4, cor="grafite", bisel=0.04))
    for nn in ((0, -1), (0, 1)):
        Mc = Mf((xc + 0.65, yc), nn)
        objs.append(cx(Mc, 1.1, 0.12, 0.36, y=-0.06, z=4.8, cor="verde_medio", bisel=0.05))
        objs.append(cx(Mc, 0.36, 0.12, 1.1, y=-0.06, z=4.43, cor="verde_medio", bisel=0.05))
        acc.caixa(Mc, 0.85, 0.04, 0.16, y=-0.13, z=4.9, mat="luz")
        acc.caixa(Mc, 0.16, 0.04, 0.85, y=-0.13, z=4.555, mat="luz")
    rnd = random.Random(271)
    for k in range(n_and - 1):
        z = TERREO + k * ANDAR
        for u in (-1.6, 1.6):
            objs.append(cx(Mfr, 2.2, 0.85, 0.16, x=u, y=-0.42, z=z + 0.05, cor="concreto", bisel=0.05))
            acc.caixa(Mfr, 2.2, 0.05, 0.07, x=u, y=-0.85, z=z + 1.1, cor="grafite")
            for q in range(10):
                acc.caixa(Mfr, 0.04, 0.04, 0.95, x=u - 1.05 + 2.1 * q / 9, y=-0.84, z=z + 0.2, cor="grafite")
            for s_ in (-1, 1):
                acc.caixa(Mfr, 0.05, 0.85, 0.07, x=u + s_ * 1.08, y=-0.42, z=z + 1.1, cor="grafite")
            acc.caixa(Mfr, 0.95, 0.05, 2.2, x=u, y=-0.03, z=z + 0.25, mat=sorteia(rnd))
            acc.caixa(Mfr, 1.15, 0.04, 2.35, x=u, y=-0.01, z=z + 0.18, cor="branco")
    janelas_contorno(acc, cont, TERREO, n_and - 1, passo=2.2, larg=1.0, alt=1.45, peit=0.85, moldura="branco",
                     sem=272, sel=lambda nn: nn.y > -0.7, margem=0.5, ar=0.12)
    for sx in (-1, 1):
        for k in range(n_and - 1):
            janela(acc, Mfr, 0.8, 1.45, TERREO + k * ANDAR + 0.85, "branco", sorteia(rnd), u=sx * (L / 2 - 1.0),
                   peitoril=True)
    objs += platibanda(cont, H, a=0.7, esp=0.32, cor="branco", cor_teto="cinza")
    caixa_dagua(objs, -2.4, 2.4, H)
    ar_telhado(acc, 2.0, 2.4, H)
    it.add(acc.objs(), objs)
    return [((0, 0, 0), (L, P, H + 0.7))]


registra("salao_musica_violino", "Salão de música com violino gigante", "salao_musica", [1, 1], 2,
         ["lazer", "musica"], b_salao_musica)
registra("cinema", "Cinema com marquise", "cinema", [1, 1], 2, ["lazer", "letreiro", "neon"], b_cinema)
registra("loja_esquina_padaria", "Loja de esquina com padaria", "loja_esquina_padaria", [1, 1], 2,
         ["comercio", "lojas", "esquina"], b_padaria_esquina)
registra("loja_esquina_cafe", "Esquina com café e torreão", "loja_esquina_cafe", [1, 1], 3,
         ["comercio", "lojas", "esquina"], b_cafe_esquina)
registra("mercadinho", "Mercadinho com toldo", "mercadinho", [1, 1], 1, ["comercio", "lojas"], b_mercadinho)
registra("sobrado_tijolo", "Sobrado de tijolo", "sobrado", [1, 1], 2, ["casa", "residencial", "tijolo"], b_sobrado)
registra("sobrado_bege", "Sobrado bege", "sobrado", [1, 1], 2, ["casa", "residencial"], b_sobrado,
         cor="bege", telhado="terracota", veneziana="azul")
registra("lojas_2andares_flores", "Lojas de dois andares (flores e livraria)", "lojas_2andares", [1, 1], 2,
         ["comercio", "lojas", "misto"], b_lojas_2andares, cor="creme", terreo="marrom",
         lojas=("flores", "livraria"), toldos=(("rosa", "branco"), ("azul", "branco")), detalhe="azul")
registra("lojas_2andares_pizza", "Lojas de dois andares (pizza e bazar)", "lojas_2andares", [1, 1], 2,
         ["comercio", "lojas", "misto"], b_lojas_2andares, cor="azul_claro", terreo="azul_marinho", trim="branco",
         lojas=("pizza", "bazar"), toldos=(("vermelho", "branco"), ("amarelo", "branco")), detalhe="vermelho")
registra("predio_farmacia", "Prédio de três andares com farmácia", "predio_farmacia", [1, 1], 3,
         ["comercio", "lojas", "misto"], b_farmacia)


# =====================================================================================================================
def centraliza(it, col):
    """Põe a origem no centro da projeção (XY) do prédio inteiro e desloca a colisão junto."""
    lo, hi = mb.bbox(it.partes)
    d = V((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, 0.0))
    if d.length < 0.01:
        return col
    for o in it.partes:
        o.data.transform(Matrix.Translation(d))
    return [((c[0] + d.x, c[1] + d.y, c[2]), t) for c, t in (col or [])] or None


def main():
    mb.materiais()
    estampa()
    cat = mb.Catalogo("predios_regulares", SAIDA, rotulo="Prédios regulares")
    for r in REG:
        if FILTRO and r["id"] not in FILTRO and r["grupo"] not in FILTRO:
            continue
        mb.limpa()
        it = mb.Item(r["id"])
        col = r["f"](it, r["var"])
        if os.environ.get("TRIS_DEBUG"):
            cont_ = {}
            for o in it.partes:
                k = o.name.split(".")[0]
                cont_[k] = cont_.get(k, 0) + sum(len(p.vertices) - 2 for p in o.data.polygons)
            print("tris", r["id"], sorted(cont_.items(), key=lambda kv: -kv[1])[:8], flush=True)
            for o in it.partes:
                lo, hi = mb.bbox(o)
                if max(abs(lo.x), abs(hi.x)) > 6.5 or max(abs(lo.y), abs(hi.y)) > 6.5:
                    print("  fora", o.name, [round(c, 2) for c in lo], [round(c, 2) for c in hi], flush=True)
        col = centraliza(it, col)
        if col:
            it.colisao(col)
        cat.exporta(it, r["rotulo"], grupo=r["grupo"], tags=["predio", "regular"] + list(r["tags"]),
                    extra={"lote": r["lote"], "andares": r["andares"], "estilo": ESTILO})
    # catálogo na ordem do registro (os altos primeiro: na vitrine ficam nas fileiras de trás)
    ordem = {r["id"]: k for k, r in enumerate(REG)}
    cat.dados["itens"].sort(key=lambda e: ordem.get(e["id"], len(ordem)))
    cat.salva()


if __name__ == "__main__":
    main()
