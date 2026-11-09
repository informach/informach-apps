"""Cidade do Morada: prédios de estilo futurista (categoria predios_futuristas).

Uso:
  MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/predios_futuristas.py -- SP/cidade_out [ids...]
Antes, uma vez: python3 -I morada-art/predios_futuristas_estampas.py SP/cidade_out/predios_futuristas/estampas

Convenções (GUIA_PREDIOS): origem no centro da projeção, base em z = 0, frente para −Y, lote de 15 m (projeção até
13 × 13 m por quadra), andar de 3,2 m e térreo de 4,2 m. Janelas com janela / janela_fria / janela_apagada (cada
vidro é uma face própria), neon ciano nas faixas e quinas, luz quente em marquises e portas.
Telas e letreiros são estampas próprias (PNG desenhado com PIL) com emissão ligada à própria textura: acendem de dia
e de noite, como uma tela de verdade.
"""
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
AND = cb.ANDAR
TER = 4.2
CAT = "predios_futuristas"
EST_DIR = ""
JANELAS = ("janela", "janela_fria", "janela_apagada")


# ======================================================================================================================
# Malhas próprias (sem recalcular normais: as faces já nascem com a orientação certa)
# ======================================================================================================================
def obj(nome, bm, cor="branco", mat="atlas", liso=False, angulo=40, dobra=True):
    mb.materiais()
    if dobra:
        bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
    mi = mb._mat_idx(mat)
    uvl = bm.loops.layers.uv.get("UVMap") or bm.loops.layers.uv.new("UVMap")
    if not mb.MAT_NOMES[mi].startswith("estampa_"):
        u = mb.uv_cor(cor) if cor else (0.5, 0.5)
        for f in bm.faces:
            for lo in f.loops:
                lo[uvl].uv = u
    for f in bm.faces:
        f.material_index = mi
    me = bpy.data.meshes.new(nome)
    bm.to_mesh(me)
    bm.free()
    for n in mb.MAT_NOMES:
        me.materials.append(bpy.data.materials[n])
    if liso:
        me.shade_smooth()
        me.set_sharp_from_angle(angle=math.radians(angulo))
    ob = bpy.data.objects.new(nome, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def face(bm, vs, normal=None):
    """Face com a orientação pedida (normal desejada aproximada); sem normal, a ordem dada."""
    if normal is not None:
        a, b, c = vs[0].co, vs[1].co, vs[2].co
        n = (b - a).cross(c - a)
        if n.length < 1e-12 and len(vs) > 3:
            n = (c - a).cross(vs[3].co - a)
        if n.dot(V(normal)) < 0:
            vs = vs[::-1]
    try:
        return bm.faces.new(vs)
    except ValueError:
        return None


def ret(l, p, r, x=0.0, y=0.0, seg=4):
    return [(px + x, py + y) for px, py in mb.ret_arredondado(l, p, r, seg)]


def elipse(rx, ry, n=40, x=0.0, y=0.0, a0=0.0):
    return [(x + rx * math.cos(a0 + 2 * math.pi * k / n), y + ry * math.sin(a0 + 2 * math.pi * k / n)) for k in range(n)]


def normais(pts, fechado=True):
    n = len(pts)
    out = []
    for i in range(n):
        a = V(pts[i - 1] if (fechado or i > 0) else pts[i])
        b = V(pts[i])
        c = V(pts[(i + 1) % n] if (fechado or i < n - 1) else pts[i])
        t1 = (b - a)
        t2 = (c - b)
        t1 = t1.normalized() if t1.length > 1e-9 else t2.normalized()
        t2 = t2.normalized() if t2.length > 1e-9 else t1
        n1, n2 = V((t1.y, -t1.x)), V((t2.y, -t2.x))
        m = n1 + n2
        m = m.normalized() if m.length > 1e-6 else n1
        k = 1.0 / max(0.35, m.dot(n1))
        out.append(m * k)
    return out


def desloca(pts, d):
    return [(p[0] + n.x * d, p[1] + n.y * d) for p, n in zip(pts, normais(pts))]


def escala_pts(pts, s, cx=0.0, cy=0.0):
    sx, sy = (s, s) if not isinstance(s, (tuple, list)) else s
    return [(cx + (p[0] - cx) * sx, cy + (p[1] - cy) * sy) for p in pts]


def loft(aneis, cor="branco", mat="atlas", base=True, topo=True, nome="loft", liso=True, angulo=40):
    """Superfície pelos anéis 3D (fechados, mesma contagem, anti-horários vistos de cima), de baixo para cima."""
    bm = bmesh.new()
    R = [[bm.verts.new(p) for p in a] for a in aneis]
    N = len(aneis[0])
    for A, B in zip(R, R[1:]):
        for i in range(N):
            j = (i + 1) % N
            bm.faces.new((A[i], A[j], B[j], B[i]))
    caps = []
    if base:
        caps.append(bm.faces.new(R[0][::-1]))
    if topo:
        caps.append(bm.faces.new(R[-1]))
    if caps:
        bmesh.ops.triangulate(bm, faces=caps, quad_method="BEAUTY", ngon_method="BEAUTY")
    return obj(nome, bm, cor, mat, liso=liso, angulo=angulo)


def varre(pts, perfil, z=0.0, cor="branco", mat="atlas", nome="varre", liso=True, angulo=50):
    """Perfil [(d, dz)] varrido em volta do contorno fechado (d > 0 para fora). Liste o perfil de dentro-embaixo,
    para fora, subindo e voltando para dentro em cima: as normais saem certas."""
    ns = normais(pts)
    bm = bmesh.new()
    R = [[bm.verts.new((p[0] + n.x * d, p[1] + n.y * d, z + dz)) for p, n in zip(pts, ns)] for d, dz in perfil]
    N = len(pts)
    for A, B in zip(R, R[1:]):
        for i in range(N):
            j = (i + 1) % N
            bm.faces.new((A[i], A[j], B[j], B[i]))
    return obj(nome, bm, cor, mat, liso=liso, angulo=angulo)


def _arco_perfil(cx, cz, r, a0, a1, n=2):
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * k / n)),
             cz + r * math.sin(math.radians(a0 + (a1 - a0) * k / n))) for k in range(n + 1)]


def perfil_laje(sai, esp, r=None, dentro=0.12, n=1):
    r = min(esp / 2 - 1e-3, sai * 0.8, 0.18) if r is None else r
    return [(-dentro, 0.0)] + _arco_perfil(sai - r, r, r, 270, 360, n) + _arco_perfil(sai - r, esp - r, r, 0, 90, n) + \
        [(-dentro, esp)]


def laje_borda(pts, z, sai=0.35, esp=0.32, cor="branco", nome="laje"):
    """Laje boleada saindo da parede (faixa de andar), de z a z + esp."""
    return varre(pts, perfil_laje(sai, esp), z, cor, nome=nome)


def neon_anel(pts, z, sai=0.0, alt=0.12, prof=0.10, mat="neon", cor=None, nome="neon"):
    """Fita de neon em volta do contorno, com a face de fora em sai + prof."""
    p = [(sai - 0.05, 0.0), (sai + prof, 0.0), (sai + prof, alt), (sai - 0.05, alt)]
    return varre(pts, p, z - alt / 2, cor, mat=mat, nome=nome, liso=False)


def bloco(pts, z0, a, cor="branco", bisel=0.08, seg=2, nome="bloco"):
    return mb.extrudado(mb._ccw(list(pts)), a, z=z0, cor=cor, bisel=bisel, seg=seg, nome=nome)


def telhado(pts, z, borda="branco", piso="cinza", larg=0.5, alt=0.55, sai=0.14, nome="telhado"):
    """Platibanda boleada em volta do contorno da parede + piso de laje cinza."""
    r = 0.12
    perf = [(-larg, -0.02)] + _arco_perfil(-larg + r, alt - r, r, 180, 90) + _arco_perfil(sai - r, alt - r, r, 90, 0) + \
        [(sai, -0.25), (-0.06, -0.25)]
    ob1 = varre(pts, perf, z, borda, nome=nome + "_borda", angulo=60)
    ob2 = bloco(desloca(pts, -larg + 0.04), z - 0.06, 0.13, cor=piso, bisel=0.0, nome=nome + "_piso")
    return [ob1, ob2]


class Contorno:
    """Linha 2D (fechada ou aberta) parametrizada pelo comprimento."""

    def __init__(self, pts, fechado=True):
        self.p = [V((q[0], q[1])) for q in pts]
        self.fechado = fechado
        P = self.p + [self.p[0]] if fechado else list(self.p)
        self.P = P
        self.S = [0.0]
        for a, b in zip(P, P[1:]):
            self.S.append(self.S[-1] + (b - a).length)
        self.L = self.S[-1]
        self.vn = normais(pts, fechado)

    def ponto(self, s):
        if self.fechado:
            s %= self.L
        s = max(0.0, min(self.L, s))
        lo, hi = 0, len(self.S) - 1
        while hi - lo > 1:
            m = (lo + hi) // 2
            if self.S[m] <= s:
                lo = m
            else:
                hi = m
        a, b = self.P[lo], self.P[lo + 1]
        seg = self.S[lo + 1] - self.S[lo]
        t = (s - self.S[lo]) / seg if seg > 1e-9 else 0
        tg = (b - a).normalized() if seg > 1e-9 else V((1, 0))
        return a + (b - a) * t, V((tg.y, -tg.x))

    def fracoes(self, f0, f1, min_div=1):
        """Frações de amostra entre f0 e f1: as pontas, os vértices no meio e divisões uniformes."""
        fs = {f0, f1}
        for k in range(1, min_div):
            fs.add(f0 + (f1 - f0) * k / min_div)
        for i, s in enumerate(self.S[:-1]):
            f = s / self.L
            for ff in (f, f + 1, f - 1):
                if f0 + 1e-6 < ff < f1 - 1e-6:
                    fs.add(ff)
        return sorted(fs)

    def amostra(self, f):
        """(ponto, normal) na fração f; nos vértices usa a normal média."""
        s = f * self.L
        p, n = self.ponto(s)
        sm = s % self.L if self.fechado else s
        for i, si in enumerate(self.S[:-1]):
            if abs(si - sm) < 1e-6:
                return self.p[i], self.vn[i].normalized()
        return p, n


def _faixa(bm, Ca, Cb, fs, za, zb, off, normal_saida=True):
    """Tira de quads entre a linha Ca (em za) e Cb (em zb) nas frações fs, deslocada 'off' para fora."""
    va, vb = [], []
    for f in fs:
        pa, na = Ca.amostra(f)
        pb, nb = Cb.amostra(f)
        va.append(bm.verts.new((pa.x + na.x * off, pa.y + na.y * off, za)))
        vb.append(bm.verts.new((pb.x + nb.x * off, pb.y + nb.y * off, zb)))
    for k in range(len(fs) - 1):
        q = (va[k], va[k + 1], vb[k + 1], vb[k])
        bm.faces.new(q if normal_saida else q[::-1])
    return va, vb


def _caixa_faixa(bm, Ca, Cb, fs, za, zb, off0, off1):
    """Caixa fina que segue o contorno (frente em off1, fundo em off0): frente, topo, base e pontas."""
    fa, fb = _faixa(bm, Ca, Cb, fs, za, zb, off1)
    ta, tb = [], []
    for f in fs:
        pa, na = Ca.amostra(f)
        pb, nb = Cb.amostra(f)
        ta.append(bm.verts.new((pa.x + na.x * off0, pa.y + na.y * off0, za)))
        tb.append(bm.verts.new((pb.x + nb.x * off0, pb.y + nb.y * off0, zb)))
    n = len(fs)
    for k in range(n - 1):
        bm.faces.new((ta[k + 1], ta[k], fa[k], fa[k + 1]))  # base (normal para baixo)
        bm.faces.new((fb[k], tb[k], tb[k + 1], fb[k + 1]))  # topo
    bm.faces.new((ta[0], fa[0], fb[0], tb[0]))  # ponta inicial
    bm.faces.new((fa[-1], ta[-1], tb[-1], fb[-1]))  # ponta final


def sorteia(rnd, apagadas=0.4, frias=0.34):
    r = rnd.random()
    return "janela_apagada" if r < apagadas else ("janela_fria" if r < apagadas + frias else "janela")


def janelas_fn(fn, z0, andares, alt=AND, baia=2.4, fl=0.66, fa=0.56, sai=0.035, moldura="branco", esp_mold=0.09,
               prof_mold=0.07, semente=1, apagadas=0.4, frias=0.34, pular=None, fechado=True, faixa_f=None,
               alturas=None, peitoril=0.5, nome="janelas"):
    """Janelas em volta de um contorno que pode mudar com a altura: fn(z) → pontos (mesma contagem em todo z).
    Cada vidro é uma face com janela / janela_fria / janela_apagada (sorteio por 'semente'). Com moldura, cada
    janela ganha um caixilho gordo (cor 'moldura') saindo da parede; sem moldura, os vidros ficam lado a lado, e a
    parede aparece entre eles (bom para faixas de vidro de prédio alto).
    faixa_f = (f0, f1): só um trecho do contorno (frações). pular(ponto, andar) → True pula a janela.
    alturas: [(za, zb)] por andar (sobrescreve z0/andares/alt)."""
    rnd = random.Random(semente)
    bms = {k: bmesh.new() for k in JANELAS}
    bmm = bmesh.new()
    if alturas is None:
        alturas = []
        for j in range(andares):
            zz = z0 + j * alt
            za = zz + alt * (1 - fa) * peitoril
            alturas.append((za, za + alt * fa))
    for j, (za, zb) in enumerate(alturas):
        Ca, Cb = Contorno(fn(za), fechado), Contorno(fn(zb), fechado)
        f0, f1 = faixa_f or (0.0, 1.0)
        Lm = (Ca.L + Cb.L) / 2 * (f1 - f0)
        nb = max(1, round(Lm / baia))
        bw = (f1 - f0) / nb
        for b in range(nb):
            fm = f0 + (b + 0.5) * bw
            if pular and pular(Ca.amostra(fm)[0], j):
                continue
            g0, g1 = fm - bw * fl / 2, fm + bw * fl / 2
            mat = sorteia(rnd, apagadas, frias)
            fs = Ca.fracoes(g0, g1, 2)
            _faixa(bms[mat], Ca, Cb, fs, za, zb, sai + (prof_mold if moldura else 0) - 0.02 + 0.002)
            if moldura:
                e = esp_mold / max(Lm / (f1 - f0), 1e-6)
                fs2 = Ca.fracoes(g0 - e, g1 + e, 2)
                _caixa_faixa(bmm, Ca, Cb, fs2, za - esp_mold, zb + esp_mold, -0.04, prof_mold)
    objs = []
    for k, bm in bms.items():
        if len(bm.faces):
            objs.append(obj(nome + "_" + k, bm, None, mat=k, dobra=False))
        else:
            bm.free()
    if moldura and len(bmm.faces):
        objs.append(obj(nome + "_mold", bmm, moldura, dobra=False))
    else:
        bmm.free()
    return mb.junta(objs, nome) if objs else None


def janelas_pts(pts, z0, andares, **k):
    return janelas_fn(lambda z: pts, z0, andares, **k)


# ---------------------------------------------------------------------------------------------------- estampas
_EST = {}


def est(nome, emissivo=True, forca=1.0):
    """Material de estampa (PNG desta categoria). Emissivo: a textura acende sozinha (tela, letreiro)."""
    if nome in _EST:
        return _EST[nome]
    idx = mb.material_estampa("fut_" + nome, os.path.join(EST_DIR, nome + ".png"))
    m = bpy.data.materials["estampa_fut_" + nome]
    if emissivo and not m.get("emissivo"):
        nt = m.node_tree
        b = nt.nodes["Principled BSDF"]
        tx = [n for n in nt.nodes if n.type == "TEX_IMAGE"][0]
        for lk in list(b.inputs["Base Color"].links):
            nt.links.remove(lk)
        b.inputs["Base Color"].default_value = (0.012, 0.014, 0.03, 1)
        nt.links.new(tx.outputs["Color"], b.inputs["Emission Color"])
        b.inputs["Emission Strength"].default_value = forca
        b.inputs["Roughness"].default_value = 0.3
        m["emissivo"] = 1
    _EST[nome] = idx
    return idx


def quad_uv(nome, c, u, v, w, h, mat, uv=((0, 0), (1, 0), (1, 1), (0, 1))):
    """Retângulo com UV inteiro (para estampa): centro c, eixos u (largura) e v (altura); normal = u × v."""
    bm = bmesh.new()
    c, u, v = V(c), V(u).normalized(), V(v).normalized()
    vs = [bm.verts.new(c + u * (sx * w / 2) + v * (sy * h / 2)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    f = bm.faces.new(vs)
    uvl = bm.loops.layers.uv.new("UVMap")
    for lo, q in zip(f.loops, uv):
        lo[uvl].uv = q
    return obj(nome, bm, None, mat=mat)


def faixa_estampa(fn, f0, f1, za, zb, mat, sai=0.08, n=16, nome="faixa_estampa", fechado=True):
    """Tira curva com estampa seguindo o contorno fn(z), das frações f0 a f1 (u da textura ao longo da tira)."""
    Ca, Cb = Contorno(fn(za), fechado), Contorno(fn(zb), fechado)
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    fs = [f0 + (f1 - f0) * k / n for k in range(n + 1)]
    va, vb = [], []
    for f in fs:
        pa, na = Ca.amostra(f)
        pb, nb = Cb.amostra(f)
        va.append(bm.verts.new((pa.x + na.x * sai, pa.y + na.y * sai, za)))
        vb.append(bm.verts.new((pb.x + nb.x * sai, pb.y + nb.y * sai, zb)))
    for k in range(n):
        fc = bm.faces.new((va[k], va[k + 1], vb[k + 1], vb[k]))
        for lo, q in zip(fc.loops, ((k / n, 0), ((k + 1) / n, 0), ((k + 1) / n, 1), (k / n, 1))):
            lo[uvl].uv = q
    return obj(nome, bm, None, mat=mat, dobra=False)


# ---------------------------------------------------------------------------------------------------- peças de fachada
def gira(objs, ang=0.0, x=0.0, y=0.0, z=0.0):
    """Peças montadas na frente padrão (plano y = 0, saindo para −Y) → giradas 'ang' graus em Z e levadas a (x, y)."""
    out = []
    for o in (objs if isinstance(objs, (list, tuple)) else [objs]):
        if o is None:
            continue
        mb.transforma(o, loc=(x, y, z), rot=("Z", ang))
        out.append(o)
    return out


def placa(nome_est, larg, alt, z, ang=0.0, x=0.0, y=0.0, caixa="grafite_escuro", esp=0.2, neon=False, postes=0.0):
    """Letreiro: caixa escura com a estampa acesa na frente. postes > 0: em pé sobre dois postes dessa altura."""
    objs = [mb.caixa(larg + 0.24, esp, alt + 0.24, y=-esp / 2, z=z - 0.12, cor=caixa, bisel=0.06)]
    objs.append(quad_uv("placa_" + nome_est, (0, -esp - 0.004, z + alt / 2), (1, 0, 0), (0, 0, 1), larg, alt,
                        est(nome_est)))
    if neon:
        for dz in (-0.17, alt + 0.11):
            objs.append(mb.caixa(larg + 0.34, 0.08, 0.06, y=-esp / 2, z=z + dz, cor=None, mat="neon", bisel=0.02))
    if postes > 0:
        for sx in (-1, 1):
            objs.append(mb.caixa(0.18, 0.18, postes + 0.1, x=sx * larg * 0.35, y=-esp / 2, z=z - postes - 0.1,
                                 cor="metal_escuro", bisel=0.04))
    return gira(objs, ang, x, y)


def tela(nome_est, larg, alt, z, ang=0.0, x=0.0, y=0.0, moldura="branco", esp=0.22, neon=True, borda=0.16):
    """Tela grande na fachada: moldura boleada, a imagem acesa e (opcional) contorno de neon."""
    objs = [mb.caixa(larg + 2 * borda, esp, alt + 2 * borda, y=-esp / 2, z=z - borda, cor=moldura, bisel=0.08)]
    objs.append(quad_uv("tela_" + nome_est, (0, -esp - 0.004, z + alt / 2), (1, 0, 0), (0, 0, 1), larg, alt,
                        est(nome_est)))
    if neon:
        e = 0.07
        L, A = larg + 2 * borda + 0.1, alt + 2 * borda + 0.1
        for dz in (z - borda - 0.05 - e / 2, z + alt + borda + 0.05 - e / 2):
            objs.append(mb.caixa(L + e, 0.07, e, y=-esp + 0.02, z=dz, cor=None, mat="neon", bisel=0.02))
        for sx in (-1, 1):
            objs.append(mb.caixa(e, 0.07, A, x=sx * L / 2, y=-esp + 0.02, z=z - borda - 0.05, cor=None, mat="neon",
                                 bisel=0.02))
    return gira(objs, ang, x, y)


def porta(larg=2.2, alt=2.7, ang=0.0, x=0.0, y=0.0, moldura="branco", vidro="janela", marquise="branco",
          marq_prof=1.4, luz=True, folhas=2):
    """Porta de entrada de vidro com moldura gorda, puxadores e marquise com luz embaixo (plano da parede em y)."""
    e = 0.2
    objs = [mb.caixa(larg + 2 * e, 0.34, alt + e, y=-0.06, z=0.0, cor=moldura, bisel=0.07)]
    objs.append(mb.caixa(larg, 0.03, alt, y=-0.24, z=0.0, cor=None, mat=vidro, bisel=0.0, liso=False))
    if folhas == 2:
        objs.append(mb.caixa(0.1, 0.06, alt, y=-0.26, z=0.0, cor=moldura, bisel=0.02))
        for sx in (-1, 1):
            objs.append(mb.caixa(0.05, 0.08, 0.9, x=sx * 0.2, y=-0.3, z=0.9, cor="cromo", bisel=0.02))
    else:
        objs.append(mb.caixa(0.05, 0.08, 0.9, x=larg * 0.36, y=-0.3, z=0.9, cor="cromo", bisel=0.02))
    objs.append(mb.caixa(larg + 2 * e + 0.2, 0.5, 0.12, y=-0.2, z=-0.04, cor="cinza_claro", bisel=0.04))  # soleira
    if marquise:
        objs.append(mb.caixa(larg + 1.6, marq_prof, 0.22, y=-marq_prof / 2 + 0.05, z=alt + e + 0.15, cor=marquise,
                             bisel=0.09))
        if luz:
            objs.append(mb.caixa(larg + 1.1, 0.12, 0.04, y=-marq_prof + 0.25, z=alt + e + 0.13, cor=None, mat="luz",
                                 bisel=0.01))
            objs.append(mb.caixa(larg + 1.62, 0.08, 0.06, y=-marq_prof + 0.04, z=alt + e + 0.23, cor=None, mat="neon",
                                 bisel=0.02))
    return gira(objs, ang, x, y)


def vitrine_loja(larg, alt, ang=0.0, x=0.0, y=0.0, moldura="branco", vidro="janela_fria", divisoes=3, z=0.25):
    """Vitrine de loja (térreo): caixilho gordo com vidros que acendem à noite."""
    objs = [mb.caixa(larg + 0.3, 0.3, alt + 0.3, y=-0.05, z=z - 0.15, cor=moldura, bisel=0.07)]
    w = larg / divisoes
    for k in range(divisoes):
        objs.append(mb.caixa(w - 0.12, 0.03, alt, x=-larg / 2 + w * (k + 0.5), y=-0.215, z=z, cor=None, mat=vidro,
                             bisel=0.0, liso=False))
    objs.append(mb.caixa(larg + 0.5, 0.42, 0.1, y=-0.12, z=z - 0.2, cor="cinza_claro", bisel=0.04))
    return gira(objs, ang, x, y)


def toldo(larg, ang=0.0, x=0.0, y=0.0, z=3.2, cor="magenta", cor2="branco", prof=1.1, listras=6):
    """Toldo curvo listrado sobre vitrine."""
    objs = []
    w = larg / listras
    for k in range(listras):
        ob = mb.caixa(w + 0.002, prof, 0.08, x=-larg / 2 + w * (k + 0.5), y=-prof / 2, z=0, cor=cor if k % 2 == 0
                      else cor2, bisel=0.02)
        mb.transforma(ob, rot=("X", -18))
        mb.transforma(ob, loc=(0, 0, z))
        objs.append(ob)
    objs.append(mb.cilindro(0.07, larg + 0.1, x=0, y=-prof * 0.95, z=z - prof * 0.31 + 0.02, cor=cor, eixo="x", seg=10))
    return gira(objs, ang, x, y)


def neon_vertical(x, y, z0, z1, r=0.075):
    return mb.cilindro(r, z1 - z0, x=x, y=y, z=z0, cor=None, mat="neon", seg=10, bisel=0.0)


def neon_quinas(l, p, r, z0, z1, x=0.0, y=0.0, sai=0.06):
    """Neon vertical no meio do arco de cada canto de um bloco arredondado l × p (raio r)."""
    out = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            cx, cy = x + sx * (l / 2 - r), y + sy * (p / 2 - r)
            k = (r + sai) / math.sqrt(2)
            out.append(neon_vertical(cx + sx * k, cy + sy * k, z0, z1))
    return out


def antena(x, y, z, h=3.0, ponta="neon"):
    return [mb.cilindro(0.06, h, x=x, y=y, z=z, cor="metal_claro", seg=8, bisel=0.01),
            mb.cilindro(0.18, 0.12, x=x, y=y, z=z, cor="metal_escuro", seg=10, bisel=0.03),
            mb.esfera(0.16, x=x, y=y, z=z + h, cor=None, mat=ponta, seg=10)]


def maquina(x, y, z, l=1.8, p=1.4, a=1.1, cor="cinza_claro"):
    return [mb.caixa(l, p, a, x=x, y=y, z=z, cor=cor, bisel=0.1),
            mb.caixa(l * 0.7, p * 0.7, 0.04, x=x, y=y, z=z + a, cor="grafite", bisel=0.01),
            mb.cilindro(min(l, p) * 0.28, 0.08, x=x, y=y, z=z + a, cor="cinza", seg=14, bisel=0.02)]


def plantinha(x, y, z, h=0.9, cor="verde_claro"):
    """Poste-jardim futurista (as bolinhas verdes dos terraços da referência)."""
    return [mb.cilindro(0.08, h, x=x, y=y, z=z, cor="branco", seg=8, bisel=0.02),
            mb.esfera(0.32, x=x, y=y, z=z + h + 0.2, cor=cor, esc=(1, 1, 1.25), seg=12)]


def arredonda(pts, r, n=4):
    """Polígono fechado com os cantos arredondados (Bézier quadrática em cada canto)."""
    out = []
    N = len(pts)
    for i in range(N):
        a, b, c = V(pts[i - 1]), V(pts[i]), V(pts[(i + 1) % N])
        d1, d2 = a - b, c - b
        rr = min(r, d1.length * 0.45, d2.length * 0.45)
        p1, p2 = b + d1.normalized() * rr, b + d2.normalized() * rr
        for k in range(n + 1):
            t = k / n
            q = (1 - t) ** 2 * p1 + 2 * (1 - t) * t * b + t ** 2 * p2
            out.append((q.x, q.y))
    return out


def chanfrado(l, p, c, r=0.8, x=0.0, y=0.0):
    pts = [(l / 2 - c, -p / 2), (l / 2, -p / 2 + c), (l / 2, p / 2 - c), (l / 2 - c, p / 2), (-l / 2 + c, p / 2),
           (-l / 2, p / 2 - c), (-l / 2, -p / 2 + c), (-l / 2 + c, -p / 2)]
    return [(q[0] + x, q[1] + y) for q in arredonda(pts, r, 3)]


def fio(pts, r=0.07, mat="neon", cor=None, lados=6, fechado=False, nome="fio"):
    """Fio (neon, cabo, corrimão) por uma linha 3D, com 'lados' faces em volta."""
    pts = [V(p) for p in pts]
    n = len(pts)
    bm = bmesh.new()
    aneis = []
    for i, p in enumerate(pts):
        if fechado:
            t = pts[(i + 1) % n] - pts[i - 1]
        else:
            t = pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]
        t.normalize()
        ref = V((0, 0, 1)) if abs(t.z) < 0.9 else V((1, 0, 0))
        nn = t.cross(ref).normalized()
        bb = t.cross(nn)
        aneis.append([bm.verts.new(p + (nn * math.cos(2 * math.pi * k / lados) + bb * math.sin(2 * math.pi * k / lados))
                                   * r) for k in range(lados)])
    pares = list(zip(aneis, aneis[1:])) + ([(aneis[-1], aneis[0])] if fechado else [])
    for A, B in pares:
        for k in range(lados):
            j = (k + 1) % lados
            bm.faces.new((A[k], A[j], B[j], B[k]))
    if not fechado:
        bm.faces.new(aneis[0][::-1])
        bm.faces.new(aneis[-1])
    return obj(nome, bm, cor, mat, liso=True, angulo=70, dobra=False)


def escotilha(r, ang=0.0, x=0.0, y=0.0, z=0.0, moldura="branco", vidro="janela", esp=0.12):
    """Janela redonda (escotilha): aro boleado e vidro, no plano da parede em y, virada para −Y."""
    perfil = [(r + esp * math.cos(math.radians(a)), esp * math.sin(math.radians(a))) for a in range(-90, 271, 60)]
    aro = mb.torno(perfil, cor=moldura, seg=16, nome="aro")
    mb.transforma(aro, rot=("X", 90))
    mb.transforma(aro, loc=(0, -0.06, z))
    vid = mb.cilindro(r, 0.05, x=0, y=-0.04, z=z, cor=None, mat=vidro, eixo="y", seg=18, bisel=0.0)
    return gira([aro, vid], ang, x, y)


def curva_contorno(fn, z, f0, f1, sai=0.05, n=24, fechado=True):
    C = Contorno(fn(z), fechado)
    out = []
    for k in range(n + 1):
        p, nn = C.amostra(f0 + (f1 - f0) * k / n)
        out.append((p.x + nn.x * sai, p.y + nn.y * sai, z))
    return out


def exporta(cat, it, rotulo, grupo, lote, andares, tags=()):
    return cat.exporta(it, rotulo, grupo=grupo, tags=["predio", "futurista"] + list(tags),
                       extra={"lote": list(lote), "andares": andares, "estilo": "futurista"})


# ======================================================================================================================
# Prédios
# ======================================================================================================================
PRODUTOS = []


def predio(id_, rotulo, grupo, lote, andares, tags=()):
    def dec(f):
        PRODUTOS.append((id_, rotulo, grupo, lote, andares, tags, f))
        return f
    return dec


# ---------------------------------------------------------------------------------------------- boate (torre + anel)
def _amendoim(A, B, n=44, y=0.0):
    pts = []
    for k in range(n):
        t = 2 * math.pi * k / n
        c, s = math.cos(t), math.sin(t)
        pts.append((A * c, y + B * s * (0.8 + 0.75 * c * c)))
    return pts


def boate_torre_anel(it, cor_torre="azul", cor_base="azul_medio", cor_vidro_fundo="azul_escuro"):
    yc = 1.2
    def secao(z, extra=0.0):
        s = 1.0 - 0.17 * max(0.0, min(1.0, (z - 4.0) / 30.0))
        return desloca(_amendoim(5.3 * s, 4.0 * s, y=yc), extra)
    # pódio branco em forma de morro arredondado
    P0 = ret(12.6, 10.8, 4.4, y=0.2, seg=6)
    aneis = [[(x, y, z) for x, y in desloca(P0, d)] for d, z in ((0, 0.0), (0, 2.6), (-0.3, 3.6), (-0.9, 4.3),
                                                                    (-1.8, 4.65))]
    it.add(loft(aneis, "branco", nome="podio", angulo=55))
    it.add(varre(P0, [(-0.1, 0.0), (0.07, 0.0), (0.07, 1.0), (-0.1, 1.0)], 0.0, cor_base, liso=False, nome="faixa_base"))
    it.add(neon_anel(P0, 1.05, sai=0.0, alt=0.1))
    # torre azul: núcleo, faixas de vidro e frisos claros
    zt0, n_and = 4.4, 9
    zs = [zt0 + k * AND for k in range(n_and + 1)]
    it.add(loft([[(x, y, z) for x, y in secao(z, -0.05)] for z in [3.6] + zs], cor_vidro_fundo, nome="torre",
                angulo=60))
    it.add(janelas_fn(lambda z: secao(z, -0.05), zt0, n_and, baia=1.9, fl=0.86, fa=0.78, moldura=None, sai=0.02,
                      semente=11, apagadas=0.42))
    for k, z in enumerate(zs[1:-1]):
        it.add(varre(secao(z), perfil_laje(0.12, 0.2, r=0.06), z - 0.1, cor_torre, nome="friso"))
    ztop = zs[-1]
    r = 0.16
    perf = [(-0.7, -0.02)] + _arco_perfil(-0.7 + r, 1.3 - r, r, 180, 90) + _arco_perfil(0.42 - r, 1.3 - r, r, 90, 0) + \
        [(0.42, -0.6), (-0.06, -0.6)]
    it.add(varre(secao(ztop), perf, ztop, "branco", nome="coroa", angulo=60))
    it.add(bloco(desloca(secao(ztop), -0.6), ztop - 0.05, 0.12, cor="cinza", bisel=0))
    it.add(neon_anel(secao(ztop), ztop + 0.05, sai=0.4, alt=0.1))
    it.add(maquina(-1.6, yc + 0.6, ztop, 2.2, 1.6, 1.2), maquina(1.8, yc - 0.4, ztop, 1.6, 1.4, 0.9))
    it.add(antena(2.4, yc + 1.4, ztop, 3.5))
    # letreiro curvo BEM-VINDO no alto da torre
    it.add(faixa_estampa(lambda z: secao(z, 0.0), 0.75 - 0.2, 0.75 + 0.2, zs[-2] + 0.75, zs[-2] + 2.15,
                         est("let_bemvindo"), sai=0.09, n=24))
    # anel de entrada: tambor branco que sai da torre, lábio boleado, disco escuro com barras de neon
    zc, R = 6.9, 3.65
    y_fr = -5.75
    tamb = mb.cilindro(R + 0.25, 4.6, x=0, y=y_fr + 2.3, z=zc, cor="branco", eixo="y", seg=40, bisel=0.15)
    it.add(tamb)
    perfil_t = [(R + 0.42 * math.cos(math.radians(a)), 0.42 * math.sin(math.radians(a))) for a in range(-90, 271, 30)]
    lab = mb.torno(perfil_t, cor="branco", seg=40, nome="labio")
    mb.transforma(lab, rot=("X", 90))
    mb.transforma(lab, loc=(0, y_fr - 0.05, zc))
    it.add(lab)
    disco = mb.cilindro(R - 0.1, 0.1, x=0, y=y_fr - 0.02, z=zc, cor="azul_noite", eixo="y", seg=40, bisel=0.0)
    it.add(disco)
    for k, dz in enumerate((-1.5, -0.6, 0.3, 1.2, 2.1)):
        w = 2 * math.sqrt(max(0.1, (R - 0.55) ** 2 - dz * dz))
        it.add(mb.caixa(w, 0.08, 0.14, y=y_fr - 0.1, z=zc + dz - 0.07, cor=None, mat="neon" if k % 2 == 0 else "luz",
                        bisel=0.03))
    anel_n = mb.torno([(R - 0.25 + 0.07 * math.cos(math.radians(a)), 0.07 * math.sin(math.radians(a)))
                       for a in range(0, 361, 60)], cor=None, mat="neon", seg=40, nome="anel_neon")
    mb.transforma(anel_n, rot=("X", 90))
    mb.transforma(anel_n, loc=(0, y_fr - 0.12, zc))
    it.add(anel_n)
    # porta embaixo do anel (o tambor faz a marquise) e janelinhas do pódio
    it.add(porta(2.6, 2.5, y=-5.2 + 0.0, moldura=cor_base, marquise=None))
    for sx in (-1, 1):
        it.add(gira([mb.caixa(1.3, 0.25, 1.1, z=1.3, y=-0.06, cor="branco", bisel=0.06),
                     mb.caixa(1.05, 0.03, 0.85, z=1.42, y=-0.2, cor=None, mat="janela_fria", bisel=0, liso=False)],
                    0, sx * 3.6, -5.2))
    it.add(placa("let_boate", 3.6, 0.9, zc + R + 0.75, y=y_fr + 0.9, postes=0.5, neon=True))
    it.colisao([((0, 0.2, 0), (12.6, 10.8, 4.7)), ((0, yc, 4.0), (10.8, 8.4, ztop - 4.0 + 1.3)),
                ((0, y_fr + 2.3, zc - R - 0.4), (2 * R + 1.0, 4.7, 2 * R + 0.8))])


@predio("boate_torre_anel_azul", "Boate futurista com torre e anel de entrada (azul)", "boate_torre_anel", (1, 1), 10,
        ["boate", "lazer", "neon", "grande"])
def _p_boate_azul(it):
    boate_torre_anel(it)


@predio("boate_torre_anel_lilas", "Boate futurista com torre e anel de entrada (lilás)", "boate_torre_anel", (1, 1),
        10, ["boate", "lazer", "neon", "grande"])
def _p_boate_lilas(it):
    boate_torre_anel(it, cor_torre="lilas", cor_base="roxo", cor_vidro_fundo="roxo_escuro")


# ---------------------------------------------------------------------------------------------- escalonado com neon nas quinas
def escalonado(it, cores, borda="branco", semente=20):
    camadas = [(12.0, 10.6, 2.0, 2, 0.0), (10.2, 9.0, 1.8, 3, 0.35), (8.4, 7.4, 1.6, 3, 0.7), (6.4, 5.6, 1.4, 2, 1.0)]
    z = 0.0
    andares = 0
    for k, (l, p, r, n, dy) in enumerate(camadas):
        cor = cores[k % len(cores)]
        pts = ret(l, p, r, y=dy, seg=4)
        h = (TER + (n - 1) * AND) if k == 0 else n * AND
        it.add(bloco(pts, z, h + 0.02, cor=cor, bisel=0.06))
        if k == 0:
            # térreo: vitrines nas laterais e na frente, porta no meio; janelas no 1º andar
            it.add(vitrine_loja(3.2, 2.7, x=-3.6, y=dy - p / 2, moldura=borda))
            it.add(vitrine_loja(3.2, 2.7, x=3.6, y=dy - p / 2, moldura=borda))
            it.add(porta(2.2, 2.7, y=dy - p / 2, moldura=borda, marquise=borda))
            for sx in (-1, 1):
                it.add(vitrine_loja(4.2, 2.6, ang=90 * sx, x=sx * l / 2, y=dy, moldura=borda, divisoes=3))
            it.add(janelas_pts(pts, TER, n - 1, baia=2.3, moldura=borda, semente=semente + k))
            it.add(laje_borda(pts, TER - 0.36, 0.28, 0.34, cor=borda))
        else:
            it.add(janelas_pts(pts, z, n, baia=2.2, moldura=borda, semente=semente + k))
        it.add(neon_quinas(l, p, r, z + (TER if k == 0 else 0.25), z + h - 0.15, y=dy))
        z += h
        andares += n
        it.add(telhado(pts, z, borda=borda, piso="cinza_claro" if k < 3 else "cinza"))
        it.add(neon_anel(pts, z + 0.3, sai=0.14, alt=0.1))
    l, p, r, n, dy = camadas[-1]
    it.add(maquina(-1.2, dy + 0.6, z, 2.0, 1.5, 1.1), antena(1.6, dy + 1.0, z, 4.0))
    # terraços com plantinhas
    for k in range(3):
        l1, p1, _, _, dy1 = camadas[k]
        l2, p2, _, _, dy2 = camadas[k + 1]
        zz = sum((TER + (c[3] - 1) * AND) if i == 0 else c[3] * AND for i, c in enumerate(camadas[:k + 1]))
        for sx in (-1, 1):
            it.add(plantinha(sx * (l1 + l2) / 4, dy1 - p1 / 2 + 0.55 + (dy2 - dy1) * 0.5, zz + 0.05))
    it.colisao([((0, 0, 0), (12.0, 10.6, TER + AND)), ((0, 0.35, TER + AND), (10.2, 9.0, 3 * AND)),
                ((0, 0.7, TER + 4 * AND), (8.4, 7.4, 3 * AND)), ((0, 1.0, TER + 7 * AND), (6.4, 5.6, 2 * AND + 1.2))])
    return andares


@predio("predio_escalonado_neon_azul", "Prédio escalonado com neon nas quinas (azul)", "predio_escalonado_neon", (1, 1),
        10, ["escalonado", "neon", "grande"])
def _p_esc_azul(it):
    escalonado(it, ["azul", "azul_claro", "azul", "azul_claro"])


@predio("predio_escalonado_neon_lilas", "Prédio escalonado com neon nas quinas (lilás)", "predio_escalonado_neon",
        (1, 1), 10, ["escalonado", "neon", "grande"])
def _p_esc_lilas(it):
    escalonado(it, ["roxo", "lilas", "roxo", "lilas"], semente=40)


# ---------------------------------------------------------------------------------------------- caixa com sacadas
def caixa_sacadas(it, cor_corpo, cor_laje, cor_laje2, semente=60):
    l, p, r = 8.6, 7.4, 1.0
    n = 3
    z = 0.0
    for k in range(n):
        dx = (0.35, -0.35, 0.2)[k]
        pts = ret(l - 0.4 * k, p - 0.3 * k, r, x=dx, seg=3)
        h = AND + (0.6 if k == 0 else 0)
        it.add(bloco(pts, z, h + 0.02, cor=cor_corpo, bisel=0.05))
        if k == 0:
            it.add(porta(1.6, 2.5, x=dx - 1.8, y=-(p) / 2, moldura="branco", marquise=None, folhas=1))
            it.add(vitrine_loja(3.2, 2.2, x=dx + 1.6, y=-p / 2, moldura="branco", vidro="janela"))
            it.add(janelas_pts(pts, z, 1, baia=2.2, moldura="branco", semente=semente + k,
                               pular=lambda q, j: q.y < -p / 2 + 0.2, alt=h))
        else:
            it.add(janelas_pts(pts, z, 1, baia=2.0, moldura="branco", semente=semente + k, alt=h))
        z += h
        # laje-sacada gorda e colorida, mais funda na frente
        lj = ret(l - 0.4 * k + 0.9, p - 0.3 * k + 1.2, r + 0.4, x=dx, y=-0.3, seg=4)
        cor = cor_laje if k % 2 == 0 else cor_laje2
        it.add(bloco(lj, z - 0.05, 0.42, cor=cor, bisel=0.14, seg=3))
        it.add(neon_anel(lj, z - 0.02, sai=0.0, alt=0.08, prof=0.05))
    # caixa d'água arredondada e grade no telhado
    lj = ret(l - 0.8 + 0.9, p - 0.6 + 1.2, r + 0.4, x=0.2, y=-0.3, seg=4)
    it.add(telhado(desloca(lj, -0.05), z + 0.37, borda="branco", piso="cinza", larg=0.35, alt=0.4, sai=0.05))
    it.add(maquina(-1.6, 1.2, z + 0.37, 1.6, 1.2, 0.9))
    it.add(mb.cilindro(0.75, 1.3, x=1.8, y=1.2, z=z + 0.37, cor="branco", seg=20, bisel=0.12))
    it.colisao([((0, 0, 0), (l + 0.9, p + 1.2, z + 1.3))])
    return n


@predio("predio_caixa_sacadas_laranja", "Prédio caixa com sacadas e neon (laranja)", "predio_caixa_sacadas", (1, 1), 3,
        ["pequeno", "neon"])
def _p_cs_laranja(it):
    caixa_sacadas(it, "creme", "laranja", "amarelo")


@predio("predio_caixa_sacadas_azul", "Prédio caixa com sacadas e neon (azul)", "predio_caixa_sacadas", (1, 1), 3,
        ["pequeno", "neon"])
def _p_cs_azul(it):
    caixa_sacadas(it, "branco_gelo", "azul_celeste", "lilas", semente=70)


# ---------------------------------------------------------------------------------------------- prédio em U ondulado
def u_ondulado(it, faixas, fundo="azul_medio", semente=80, curva=-0.010):
    P = 8.6
    N = 10
    def zk(k):
        return 0.0 if k == 0 else TER + (k - 1) * AND

    def hk(k):
        return TER if k == 0 else AND

    def x_out(k):
        return 11.0 + 0.13 * k

    def x_in(k):
        return 0.0 if k < 3 else 2.4 + 0.62 * (k - 3) + 0.035 * (k - 3) ** 2

    def blocos(k):
        xo, xi = x_out(k), x_in(k)
        if xi <= 0:
            return [ret(2 * xo, P, 2.4, seg=3)]
        w, c = xo - xi, (xo + xi) / 2
        return [ret(w, P, min(2.4, w / 2 - 0.05), x=sx * c, seg=3) for sx in (-1, 1)]

    for k in range(N):
        z, h = zk(k), hk(k)
        cor_f = faixas[min(k, len(faixas) - 1)]
        for b, pts in enumerate(blocos(k)):
            it.add(bloco(pts, z, h + 0.02, cor=fundo, bisel=0.0))
            if k == 0:
                it.add(janelas_pts(pts, z, 1, alt=h, baia=2.2, fl=0.82, fa=0.6, moldura=None, semente=semente + b,
                                   pular=lambda q, j: abs(q.x) < 2.4 and q.y < 0))
            else:
                it.add(janelas_pts(pts, z, 1, alt=h, baia=2.0, fl=0.84, fa=0.62, moldura=None,
                                   semente=semente + k * 7 + b))
            it.add(varre(pts, [(-0.1, 0), (0.17, 0), (0.17, 0.28), (-0.1, 0.28)], z + h - 0.52, cor_f, liso=False))
            if k < N - 1:
                it.add(laje_borda(pts, z + h - 0.22, sai=0.42, esp=0.3, cor="branco"))
                if k % 2 == 1 or k < 3:
                    it.add(neon_anel(pts, z + h - 0.07, sai=0.42, alt=0.07, prof=0.04))
    ztop = zk(N - 1) + hk(N - 1)
    for b, pts in enumerate(blocos(N - 1)):
        it.add(telhado(pts, ztop, borda="branco", piso="cinza", larg=0.5, alt=0.6, sai=0.3))
        it.add(neon_anel(pts, ztop + 0.3, sai=0.3, alt=0.08))
        sx = -1 if b == 0 else 1
        it.add(maquina(sx * 10.2, 0.8, ztop, 1.6, 1.4, 1.0), antena(sx * 9.0, -1.6, ztop, 3.0))
    # terraço do meio (sobre o 3º andar) com piscina e plantinhas
    zt = zk(3)
    it.add(bloco(ret(2 * x_in(3) + 1.0, P - 0.5, 1.6), zt - 0.04, 0.1, cor="cinza_claro", bisel=0.0))
    it.add(mb.extrudado(mb._ccw(ret(3.0, 3.4, 0.7, y=0.6)), 0.06, z=zt + 0.03, cor=None, mat="agua", bisel=0.0))
    it.add(varre(ret(3.0, 3.4, 0.7, y=0.6), perfil_laje(0.25, 0.22, r=0.08, dentro=0.0), zt, "branco"))
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.add(plantinha(sx * 1.9, 0.6 + sy * 2.6, zt + 0.05, 0.7))
    # ponte-tubo de vidro entre as asas (em pedaços, para curvar junto com o prédio)
    zb = zk(7) + 1.6
    xb = x_in(7) + 0.4
    n = 8
    rnd = random.Random(semente + 99)
    for k in range(n):
        x0 = -xb + 2 * xb * k / n
        x1 = -xb + 2 * xb * (k + 1) / n
        xm, L = (x0 + x1) / 2, x1 - x0
        it.add(mb.cilindro(1.42, L + 0.01, x=xm, y=0, z=zb, cor=fundo, eixo="x", seg=16, bisel=0.0))
        it.add(mb.cilindro(1.5, L * 0.78, x=xm, y=0, z=zb, cor=None, mat=sorteia(rnd, 0.35), eixo="x", seg=16,
                           bisel=0.0, tampas=False))
        it.add(mb.cilindro(1.62, 0.26, x=x0 if k else x0 + 0.13, y=0, z=zb, cor="branco", eixo="x", seg=16, bisel=0.05))
        if k % 2 == 0:
            it.add(mb.cilindro(1.65, 0.07, x=xm, y=0, z=zb, cor=None, mat="neon", eixo="x", seg=16, bisel=0.0))
    it.add(mb.cilindro(1.62, 0.26, x=xb - 0.13, y=0, z=zb, cor="branco", eixo="x", seg=16, bisel=0.05))
    # entrada: porta com marquise e letreiro de café ao lado
    it.add(porta(2.8, 2.8, y=-P / 2, moldura="branco", marquise="branco", marq_prof=1.8))
    it.add(placa("let_cafe", 2.6, 0.65, 3.6, y=-P / 2 - 1.85, postes=0.0, caixa="grafite_escuro"))
    # curva em planta: as asas vêm para a frente
    for o in it.partes:
        for v in o.data.vertices:
            v.co.y += curva * v.co.x ** 2
    it.colisao([((0, -0.2, 0), (24.4, 9.6, zk(3))), ((-9.7, -0.9, zk(3)), (5.6, 10.6, ztop - zk(3) + 0.6)),
                ((9.7, -0.9, zk(3)), (5.6, 10.6, ztop - zk(3) + 0.6)), ((0, -0.2, zb - 1.6), (2 * xb, 3.2, 3.2))])


@predio("predio_u_ondulado_azul", "Prédio em U ondulado com faixas de neon (azul)", "predio_u_ondulado", (2, 1), 10,
        ["grande", "neon", "hotel"])
def _p_u_azul(it):
    u_ondulado(it, ["magenta", "magenta", "violeta", "roxo", "azul_medio", "azul", "azul_celeste", "azul_celeste",
                    "turquesa", "turquesa_claro"])


@predio("predio_u_ondulado_lilas", "Prédio em U ondulado com faixas de neon (lilás)", "predio_u_ondulado", (2, 1), 10,
        ["grande", "neon", "hotel"])
def _p_u_lilas(it):
    u_ondulado(it, ["rosa", "rosa_escuro", "magenta", "magenta", "violeta", "violeta", "roxo", "lilas", "lilas",
                    "lilas_claro"], fundo="roxo", semente=90)


# ---------------------------------------------------------------------------------------------- cápsula em ovo
def ovo(it, cx, cy, R, H, ry=0.9, cor_det="azul_celeste", semente=1, gomos=None, entrada=True, N=48):
    zc = H * 0.3
    nexp = 2.5
    K = 14
    perfil = [(1.0, 0.0), (1.0, zc / 3), (1.0, 2 * zc / 3)]
    for k in range(K + 1):
        a = math.pi / 2 * k / K
        perfil.append((math.cos(a) ** (2 / nexp) if k < K else 0.0, zc + (H - zc) * math.sin(a) ** (2 / nexp)))
    nrm = []
    for j, (r, z) in enumerate(perfil):
        if j < 3:
            nrm.append((1.0, 0.0))
            continue
        r0, z0 = perfil[max(3, j - 1)]
        r1, z1 = perfil[min(len(perfil) - 1, j + 1)]
        t = V((r1 - r0, (z1 - z0) / R))
        n_ = V((t.y, -t.x)).normalized()
        nrm.append((n_.x, n_.y))
    M = len(perfil)

    def P(i, j, ins=0.0):
        r, z = perfil[j]
        nr, nz = nrm[j]
        th = 2 * math.pi * i / N
        rr = max(0.0, r * R - ins * nr)
        return V((cx + rr * math.cos(th), cy + rr * ry * math.sin(th), z - ins * nz))

    gomos = gomos or [(36, 5, 2, 14), (0, 4, 1, 13), (24, 4, 1, 13), (12, 4, 1, 12)]

    def gomo(i, j):
        for g, (ic, hw, j0, j1) in enumerate(gomos):
            d = (i - ic + N // 2) % N - N // 2
            if -hw <= d < hw and j0 <= j < j1:
                return g
        return -1

    bm_c = bmesh.new()
    O = [[bm_c.verts.new(P(i, j)) for i in range(N)] for j in range(M - 1)]
    polo = bm_c.verts.new(P(0, M - 1))
    INS, INS_V = 0.34, 0.31
    Ib = {}

    def vin(i, j):
        if (i % N, j) not in Ib:
            Ib[(i % N, j)] = bm_c.verts.new(P(i, j, INS))
        return Ib[(i % N, j)]

    bm_f = bmesh.new()
    bms = {k: bmesh.new() for k in JANELAS}
    rnd = random.Random(semente)
    mats = {}
    for j in range(M - 1):
        for i in range(N):
            i2 = (i + 1) % N
            g = gomo(i, j)
            if g < 0:
                if j < M - 2:
                    bm_c.faces.new((O[j][i], O[j][i2], O[j + 1][i2], O[j + 1][i]))
                else:
                    bm_c.faces.new((O[j][i], O[j][i2], polo))
                continue
            # fundo do gomo (escuro) e vidro por cima, um pouco menor (a parede aparece entre os vidros)
            a, b, c, d = P(i, j, INS), P(i + 1, j, INS), P(i + 1, j + 1, INS), P(i, j + 1, INS)
            bm_f.faces.new([bm_f.verts.new(q) for q in (a, b, c, d)])
            ic, hw = gomos[g][0], gomos[g][1]
            col = ((i - ic + N // 2) % N - N // 2 + hw) // 2
            key = (g, j, col)
            if key not in mats:
                mats[key] = sorteia(rnd, 0.4, 0.3)
            qs = [P(i, j, INS_V), P(i + 1, j, INS_V), P(i + 1, j + 1, INS_V), P(i, j + 1, INS_V)]
            cen = sum(qs, V()) / 4
            qs = [cen + (q - cen) * 0.86 for q in qs]
            bms[mats[key]].faces.new([bms[mats[key]].verts.new(q) for q in qs])
            # ombreiras (a espessura da casca) onde o gomo encosta na casca
            cc = (P(i, j) + P(i + 1, j + 1)) / 2
            for (di, dj), (e0, e1) in (((-1, 0), ((i, j), (i, j + 1))), ((1, 0), ((i + 1, j), (i + 1, j + 1))),
                                       ((0, -1), ((i, j), (i + 1, j))), ((0, 1), ((i, j + 1), (i + 1, j + 1)))):
                ni, nj = (i + di) % N, j + dj
                if 0 <= nj < M - 1 and gomo(ni, nj) >= 0:
                    continue
                o0 = O[e0[1]][e0[0] % N] if e0[1] < M - 1 else polo
                o1 = O[e1[1]][e1[0] % N] if e1[1] < M - 1 else polo
                vs = [o0, o1, vin(*e1), vin(*e0)]
                mid = (o0.co + o1.co) / 2
                face(bm_c, vs, normal=cc - mid)
    it.add(obj("ovo_casca", bm_c, "branco", liso=True, angulo=50))
    it.add(obj("ovo_fundo", bm_f, "azul_escuro", dobra=False))
    for k, bm in bms.items():
        if len(bm.faces):
            it.add(obj("ovo_" + k, bm, None, mat=k, dobra=False))
        else:
            bm.free()
    # neon no contorno de cada gomo
    for ic, hw, j0, j1 in gomos:
        loop = [P(ic + d, j0, -0.05) for d in range(-hw, hw + 1)] + \
               [P(ic + hw, j, -0.05) for j in range(j0 + 1, j1 + 1)] + \
               [P(ic + d, j1, -0.05) for d in range(hw - 1, -hw - 1, -1)] + \
               [P(ic - hw, j, -0.05) for j in range(j1 - 1, j0, -1)]
        it.add(fio(loop, r=0.07, fechado=True, lados=5))
    base = elipse(R, R * ry, n=N, x=cx, y=cy)
    it.add(varre(base, perfil_laje(0.3, 0.42, r=0.12), 0.0, cor_det, nome="saia"))
    it.add(neon_anel(base, 0.5, sai=0.0, alt=0.08, prof=0.06))
    if entrada:
        yf = cy - R * ry
        it.add(mb.caixa(4.0, 1.6, 3.6, x=cx, y=yf + 0.3, z=0.0, cor=cor_det, bisel=0.3))
        it.add(porta(2.2, 2.6, x=cx, y=yf - 0.5, moldura="branco", marquise="branco", marq_prof=1.2))
    return zc


def _col_ovo(cx, cy, R, H, ry):
    return [((cx, cy, 0), (2 * R, 2 * R * ry, H * 0.45)), ((cx, cy, H * 0.45), (1.6 * R, 1.6 * R * ry, H * 0.35)),
            ((cx, cy, H * 0.8), (R, R * ry, H * 0.2))]


@predio("capsula_ovo_azul", "Cápsula futurista em forma de ovo (azul)", "capsula_ovo", (1, 1), 6,
        ["grande", "cupula", "neon"])
def _p_ovo_azul(it):
    ovo(it, 0, 0.0, 5.8, 21.0, ry=0.92, cor_det="azul_celeste", semente=3)
    it.add(antena(0, 0, 20.9, 1.6))
    it.colisao(_col_ovo(0, 0, 5.8, 21.0, 0.92))


@predio("capsula_ovo_lilas", "Cápsula futurista em forma de ovo (lilás)", "capsula_ovo", (1, 1), 6,
        ["grande", "cupula", "neon"])
def _p_ovo_lilas(it):
    ovo(it, 0, 0.0, 5.8, 21.0, ry=0.92, cor_det="lilas", semente=8)
    it.add(antena(0, 0, 20.9, 1.6))
    it.colisao(_col_ovo(0, 0, 5.8, 21.0, 0.92))


@predio("capsula_ovo_dupla", "Cápsulas em ovo duplas com passarela de vidro", "capsula_ovo_dupla", (2, 1), 5,
        ["grande", "cupula", "neon"])
def _p_ovo_duplo(it):
    it.add(bloco(ret(26.0, 11.6, 3.0), -0.02, 0.32, cor="branco_gelo", bisel=0.1))
    it.add(neon_anel(ret(26.0, 11.6, 3.0), 0.24, sai=0.0, alt=0.06, prof=0.04))
    ovo(it, -6.6, 0.3, 5.2, 18.0, ry=0.92, cor_det="azul_celeste", semente=12,
        gomos=[(36, 5, 2, 14), (24, 4, 1, 13), (12, 4, 1, 12)])
    ovo(it, 7.6, 0.3, 4.1, 13.5, ry=0.92, cor_det="lilas", semente=17, gomos=[(36, 4, 2, 13), (0, 4, 1, 12)], N=40)
    # passarela de vidro
    zb, x0, x1 = 6.0, -2.0, 4.0
    rnd = random.Random(5)
    n = 4
    for k in range(n):
        a, b = x0 + (x1 - x0) * k / n, x0 + (x1 - x0) * (k + 1) / n
        it.add(mb.cilindro(1.15, b - a + 0.01, x=(a + b) / 2, y=0.3, z=zb, cor="azul_escuro", eixo="x", seg=18,
                           bisel=0.0))
        it.add(mb.cilindro(1.22, (b - a) * 0.8, x=(a + b) / 2, y=0.3, z=zb, cor=None, mat=sorteia(rnd, 0.3), eixo="x",
                           seg=18, bisel=0.0, tampas=False))
        it.add(mb.cilindro(1.34, 0.22, x=a, y=0.3, z=zb, cor="branco", eixo="x", seg=18, bisel=0.05))
    it.add(mb.cilindro(1.34, 0.22, x=x1, y=0.3, z=zb, cor="branco", eixo="x", seg=18, bisel=0.05))
    it.add(fio([(x0, 0.3 - 1.3, zb - 0.9), (x1, 0.3 - 1.3, zb - 0.9)], r=0.06, lados=5))
    for x in (-1.0, 1.0, 3.0):
        it.add(plantinha(x, -3.6, 0.3, 0.8))
    it.add(antena(-6.6, 0.3, 17.9, 1.5), antena(7.6, 0.3, 13.4, 1.2))
    it.colisao(_col_ovo(-6.6, 0.3, 5.2, 18.0, 0.92) + _col_ovo(7.6, 0.3, 4.1, 13.5, 0.92) +
               [((1.0, 0.3, zb - 1.3), (6.0, 2.6, 2.6))])


# ---------------------------------------------------------------------------------------------- torre sobre pódio chanfrado
@predio("torre_podio_chanfrado", "Torre futurista sobre pódio chanfrado com jardins", "torre_podio_chanfrado", (2, 1), 10,
        ["grande", "neon", "comercial"])
def _p_torre_podio(it):
    Pd = chanfrado(25.4, 10.4, 2.8, r=0.9)
    hp = TER + 2 * AND
    it.add(bloco(Pd, 0, hp + 0.02, cor="branco", bisel=0.06))
    for x in (-9.0, -4.6, 4.6, 9.0):
        it.add(vitrine_loja(3.4, 2.8, x=x, y=-5.2, moldura="turquesa", divisoes=3))
    it.add(porta(2.6, 2.8, y=-5.2, moldura="turquesa", marquise="branco", marq_prof=1.5))
    it.add(placa("let_loja", 2.4, 0.6, 4.75, y=-5.25, caixa="grafite_escuro"))
    it.add(janelas_pts(Pd, 0.0, 1, alt=TER, baia=2.6, fl=0.6, fa=0.5, moldura="turquesa", semente=301,
                       pular=lambda q, j: q.y < -4.6))
    it.add(janelas_pts(Pd, TER, 2, baia=2.0, fl=0.84, fa=0.6, moldura=None, semente=302))
    it.add(laje_borda(Pd, TER - 0.24, sai=0.32, esp=0.34, cor="turquesa"))
    it.add(varre(Pd, [(-0.1, 0), (0.08, 0), (0.08, 0.32), (-0.1, 0.32)], TER + AND - 0.2, "azul_medio", liso=False))
    it.add(neon_anel(Pd, TER + 0.15, sai=0.32, alt=0.07))
    it.add(telhado(Pd, hp, borda="turquesa", piso="cinza_claro", sai=0.2))
    it.add(neon_anel(Pd, hp + 0.32, sai=0.2, alt=0.08))
    for x in (1.0, 2.6, 4.2, 5.8, 7.4, 9.0, 10.6):
        it.add(plantinha(x, -3.7, hp + 0.05, 0.6 + 0.3 * ((x * 7) % 3) / 2))
    it.add(maquina(2.0, 3.6, hp, 2.0, 1.6, 1.1), maquina(9.4, 3.4, hp, 1.6, 1.4, 0.9))
    # pavilhão de vidro sobre o pódio (direita)
    pv = ret(6.4, 5.0, 1.8, x=6.6, y=0.8)
    it.add(bloco(pv, hp, AND + 0.02, cor="azul_escuro", bisel=0.0))
    it.add(janelas_pts(pv, hp, 1, baia=1.6, fl=0.9, fa=0.78, peitoril=0.4, moldura=None, semente=303))
    it.add(telhado(pv, hp + AND, borda="branco", piso="cinza", larg=0.4, alt=0.45, sai=0.18))
    it.add(neon_anel(pv, hp + AND + 0.25, sai=0.18, alt=0.07))
    # torre (esquerda)
    xt, yt = -6.6, 0.5
    T = ret(8.4, 7.4, 1.8, x=xt, y=yt, seg=3)
    Tm = ret(9.4, 8.2, 2.0, x=xt, y=yt - 0.2, seg=3)
    nt = 7
    z = hp
    for k in range(nt):
        pts = Tm if k in (3, 4) else T
        cor = "lilas" if k in (3, 4) else "azul"
        it.add(bloco(pts, z - 0.02, AND + 0.04, cor=cor, bisel=0.0))
        if k in (3, 4):
            it.add(janelas_pts(pts, z, 1, baia=2.0, fl=0.7, moldura="branco", semente=310 + k,
                               pular=lambda q, j: q.y < yt - 3.5 and abs(q.x - xt) < 3.0))
        else:
            it.add(janelas_pts(pts, z, 1, baia=1.9, fl=0.86, fa=0.64, moldura=None, semente=310 + k))
        if k not in (3,):
            it.add(laje_borda(pts if k != 2 else T, z + AND - 0.18, sai=0.3, esp=0.28, cor="branco"))
        if k % 2 == 0:
            it.add(neon_anel(pts, z + AND - 0.04, sai=0.3, alt=0.06, prof=0.04))
        z += AND
    it.add(tela("tela_ondas", 4.6, 3.2, hp + 3 * AND + 1.4, x=xt, y=yt - 0.2 - 4.1, moldura="branco"))
    it.add(telhado(T, z, borda="turquesa", piso="cinza", sai=0.2))
    it.add(neon_anel(T, z + 0.32, sai=0.2, alt=0.08))
    cp = ret(4.6, 4.0, 1.2, x=xt + 0.6, y=yt + 0.8)
    it.add(bloco(cp, z, 2.6, cor="branco", bisel=0.08))
    it.add(janelas_pts(cp, z, 1, alt=2.6, baia=1.6, fl=0.7, moldura=None, semente=330))
    it.add(telhado(cp, z + 2.6, borda="turquesa", piso="cinza", larg=0.35, alt=0.4, sai=0.12))
    it.add(antena(xt + 1.4, yt + 1.4, z + 2.6, 4.0), maquina(xt - 2.4, yt - 1.6, z, 1.6, 1.3, 0.9))
    it.colisao([((0, 0, 0), (25.4, 10.4, hp + 0.6)), ((xt, yt, hp), (9.4, 8.2, nt * AND + 3.2)),
                ((6.6, 0.6, hp), (6.4, 5.4, AND + 0.5))])


# ---------------------------------------------------------------------------------------------- torre cilíndrica (hotel)
@predio("torre_cilindro_hotel", "Torre cilíndrica de hotel com anéis de neon", "torre_cilindro_hotel", (1, 1), 10,
        ["grande", "hotel", "neon"])
def _p_torre_cil(it):
    cx, cy, R = -0.4, 0.6, 5.0
    c = elipse(R, R, 40, x=cx, y=cy)
    n = 10
    ztop = TER + (n - 1) * AND
    it.add(bloco(c, 0, ztop + 0.02, cor="azul_escuro", bisel=0.0))
    at = ret(3.4, 3.2, 0.6, x=cx + 4.0, y=cy - 3.0)
    def fora_atrio(q, j):
        return (q.x - (cx + 4.0)) ** 2 / 3.0 ** 2 + (q.y - (cy - 3.0)) ** 2 / 2.9 ** 2 < 1.0
    it.add(vitrine_loja(3.2, 2.8, ang=-35, x=cx - R * math.sin(math.radians(35)) * 1.0,
                        y=cy - R * math.cos(math.radians(35)) + 0.12, divisoes=3, moldura="branco"))
    it.add(janelas_pts(c, 0.0, 1, alt=TER, baia=2.6, fl=0.6, fa=0.55, moldura="branco", semente=401,
                       pular=lambda q, j: q.y < cy - 2.6 or fora_atrio(q, j)))
    it.add(janelas_pts(c, TER, n - 1, baia=1.9, fl=0.86, fa=0.62, moldura=None, semente=402, pular=fora_atrio))
    for k in range(n - 1):
        z = TER + k * AND
        it.add(laje_borda(c, z - 0.2, sai=0.34, esp=0.3, cor="branco"))
        if k % 3 == 0:
            it.add(neon_anel(c, z - 0.05, sai=0.34, alt=0.07, prof=0.04))
    # átrio de vidro (elevador panorâmico)
    it.add(bloco(at, 0, ztop + 1.2, cor="branco", bisel=0.08))
    it.add(janelas_pts(at, TER, n - 1, baia=1.4, fl=0.86, fa=0.86, peitoril=0.5, moldura=None, semente=403,
                       apagadas=0.25))
    it.add(neon_quinas(3.4, 3.2, 0.6, TER, ztop + 1.0, x=cx + 4.0, y=cy - 3.0))
    it.add(porta(2.4, 2.8, ang=0, x=cx + 4.0, y=cy - 3.0 - 1.6, moldura="azul_celeste", marquise="azul_celeste",
                 marq_prof=1.4))
    # coroa com letreiro curvo
    it.add(telhado(c, ztop, borda="branco", piso="cinza", sai=0.34))
    it.add(neon_anel(c, ztop + 0.3, sai=0.34, alt=0.08))
    c2 = elipse(3.4, 3.4, 32, x=cx, y=cy)
    it.add(bloco(c2, ztop, 3.4, cor="branco", bisel=0.1))
    it.add(faixa_estampa(lambda z: c2, 0.75 - 0.16, 0.75 + 0.16, ztop + 1.0, ztop + 2.3, est("let_hotel"), sai=0.04,
                         n=14))
    it.add(neon_anel(c2, ztop + 0.6, sai=0.0, alt=0.08), neon_anel(c2, ztop + 2.75, sai=0.0, alt=0.08))
    it.add(telhado(c2, ztop + 3.4, borda="azul_celeste", piso="cinza", larg=0.4, alt=0.4, sai=0.1))
    it.add(antena(cx, cy, ztop + 3.4, 4.5), maquina(cx + 2.8, cy + 2.6, ztop, 1.4, 1.2, 0.9))
    it.add(telhado(at, ztop + 1.2, borda="azul_celeste", piso="cinza", larg=0.3, alt=0.35, sai=0.1))
    it.colisao([((cx, cy, 0), (10.6, 10.6, ztop + 0.6)), ((cx + 4.0, cy - 3.0, 0), (3.4, 3.2, ztop + 1.6)),
                ((cx, cy, ztop), (6.8, 6.8, 3.8))])


# ---------------------------------------------------------------------------------------------- discoteca com globo
def discoteca(it, cor_base="roxo_escuro", cor_faixa="magenta", semente=150):
    R, yc = 5.6, 0.0
    base = elipse(R, R, n=48, y=yc)
    hb = 4.8
    it.add(bloco(base, 0, hb + 0.02, cor=cor_base, bisel=0.0))
    it.add(janelas_pts(base, 0.0, 1, alt=hb, baia=2.0, fl=0.5, fa=0.28, peitoril=0.78, moldura=cor_faixa,
                       semente=semente, pular=lambda q, j: q.y < yc - R + 1.6))
    it.add(varre(base, [(-0.1, 0), (0.08, 0), (0.08, 0.55), (-0.1, 0.55)], 0.0, cor_faixa, liso=False))
    it.add(neon_anel(base, 0.62, sai=0.0, alt=0.08))
    it.add(laje_borda(base, hb - 0.3, sai=0.3, esp=0.34, cor="branco"))
    it.add(neon_anel(base, hb - 0.1, sai=0.3, alt=0.07, prof=0.05))
    it.add(telhado(base, hb, borda="branco", piso="grafite", larg=0.45, alt=0.5, sai=0.3))
    it.add(porta(2.4, 2.6, y=yc - R + 0.14, moldura="branco", marquise=cor_faixa, marq_prof=1.25))
    it.add(placa("let_danca", 3.4, 0.85, 3.25, y=yc - R + 0.05 - 1.25, caixa="grafite_escuro", neon=True))
    # pedestal, berço e o globo espelhado
    zp = hb + 0.05
    it.add(mb.cilindro(2.0, 0.8, y=yc + 0.3, z=zp, cor="grafite", seg=28, bisel=0.1))
    it.add(mb.cilindro(2.05, 0.08, y=yc + 0.3, z=zp + 0.6, cor=None, mat="neon", seg=28, bisel=0.0))
    Rg = 3.5
    zg = zp + 0.8 + Rg - 0.5
    berco = mb.torno([(Rg * 0.78 + 0.22 * math.cos(math.radians(a)), 0.22 * math.sin(math.radians(a)))
                      for a in range(-90, 271, 60)], cor="branco", seg=32, nome="berco")
    mb.transforma(berco, loc=(0, yc + 0.3, zg - Rg * 0.62))
    it.add(berco)
    it.add(mb.esfera(Rg - 0.06, y=yc + 0.3, z=zg, cor="grafite", seg=24))
    rnd = random.Random(semente + 1)
    nu, nv = 24, 12
    grupos = {}
    for jv in range(nv):
        for iu in range(nu):
            pts = []
            for du, dv in ((0, 0), (1, 0), (1, 1), (0, 1)):
                th = 2 * math.pi * (iu + du) / nu
                ph = -math.pi / 2 + math.pi * (jv + dv) / nv
                pts.append(V((math.cos(ph) * math.cos(th), math.cos(ph) * math.sin(th), math.sin(ph))))
            cen = sum(pts, V()) / 4
            pts = [(cen + (q - cen) * 0.84).normalized() * (Rg + 0.02) + V((0, yc + 0.3, zg)) for q in pts]
            r = rnd.random()
            chave = ("espelho", None) if r < 0.5 else (("atlas", "lilas_claro") if r < 0.68 else
                                                       (("neon", None) if r < 0.82 else
                                                        (("luz", None) if r < 0.9 else ("atlas", "azul_claro"))))
            grupos.setdefault(chave, []).append(pts)
    for (mat, cor), lista in grupos.items():
        bm = bmesh.new()
        for pts in lista:
            vs = [bm.verts.new(q) for q in pts]
            if (vs[1].co - vs[0].co).length < 1e-4:
                vs = [vs[0], vs[2], vs[3]]
            elif (vs[2].co - vs[3].co).length < 1e-4:
                vs = vs[:3]
            face(bm, vs, normal=sum((v.co for v in vs), V()) / len(vs) - V((0, yc + 0.3, zg)))
        it.add(obj("globo_" + mat, bm, cor, mat=mat, dobra=False))
    # holofotes no terraço apontando para o globo
    for k in range(4):
        a = math.radians(45 + 90 * k)
        x, y = 4.0 * math.cos(a), yc + 4.0 * math.sin(a)
        h = mb.cilindro(0.32, 0.7, cor="grafite_escuro", seg=12, bisel=0.05)
        lz = mb.cilindro(0.26, 0.04, z=0.7, cor=None, mat="luz", seg=12, bisel=0.0)
        for o in (h, lz):
            mb.transforma(o, rot=[("Z", math.degrees(a) + 90), ("X", 35)])
            mb.transforma(o, loc=(x, y, hb + 0.1))
        it.add(h, lz, mb.cilindro(0.2, 0.3, x=x, y=y, z=hb, cor="metal_escuro", seg=10, bisel=0.03))
    it.colisao([((0, yc, 0), (2 * R, 2 * R, hb + 0.6)), ((0, yc + 0.3, zg - Rg), (2 * Rg, 2 * Rg, 2 * Rg))])


@predio("discoteca_globo_roxa", "Discoteca com globo espelhado (roxa)", "discoteca_globo", (1, 1), 1,
        ["lazer", "boate", "neon"])
def _p_disco_roxa(it):
    discoteca(it)


@predio("discoteca_globo_magenta", "Discoteca com globo espelhado (magenta)", "discoteca_globo", (1, 1), 1,
        ["lazer", "boate", "neon"])
def _p_disco_mag(it):
    discoteca(it, cor_base="magenta", cor_faixa="lilas", semente=170)


# ---------------------------------------------------------------------------------------------- clube de realidade virtual
@predio("clube_vr", "Clube de realidade virtual com óculos gigantes", "clube_vr", (1, 1), 2, ["lazer", "neon"])
def _p_clube_vr(it):
    l, p, r, yc = 11.6, 9.4, 1.4, 0.5
    pts = ret(l, p, r, y=yc)
    h = TER + AND
    it.add(bloco(pts, 0, h + 0.02, cor="azul_noite", bisel=0.0))
    yf = yc - p / 2
    it.add(porta(2.4, 2.8, y=yf, moldura="lilas", marquise="lilas", marq_prof=1.4))
    for sx in (-1, 1):
        it.add(tela("tela_pixel", 2.4, 2.0, 0.9, x=sx * 3.4, y=yf, moldura="lilas"))
    it.add(janelas_pts(pts, 0.0, 1, alt=TER, baia=2.4, fl=0.6, fa=0.5, moldura="lilas", semente=501,
                       pular=lambda q, j: q.y < yf + 0.5))
    it.add(janelas_pts(pts, TER, 1, baia=2.0, fl=0.8, fa=0.5, moldura=None, semente=502,
                       pular=lambda q, j: q.y < yf + 0.5 and abs(q.x) < 3.8))
    it.add(placa("let_clube_vr", 6.4, 1.5, TER + 0.75, y=yf, caixa="grafite_escuro", neon=True))
    it.add(laje_borda(pts, TER - 0.25, sai=0.3, esp=0.3, cor="lilas"))
    it.add(neon_anel(pts, TER - 0.1, sai=0.3, alt=0.06, prof=0.04), neon_anel(pts, 0.35, sai=0.0, alt=0.08))
    it.add(telhado(pts, h, borda="lilas", piso="grafite", sai=0.2))
    it.add(neon_anel(pts, h + 0.3, sai=0.2, alt=0.08))
    # os óculos de realidade virtual em cima
    zo = h + 1.0
    yv = -0.4
    for sx in (-1, 1):
        it.add(mb.caixa(1.2, 1.6, 1.1, x=sx * 2.6, y=yv + 0.2, z=h - 0.05, cor="grafite", bisel=0.15))
    it.add(mb.superelipsoide(8.8, 3.2, 3.8, y=yv, z=zo, cor="lilas", e=0.32, e_v=0.4, nu=32, nv=12))
    yfr = yv - 1.6
    it.add(mb.superelipsoide(8.0, 0.7, 3.1, y=yfr + 0.1, z=zo + 0.35, cor="azul_noite", e=0.25, e_v=0.3, nu=24, nv=8))
    for sx in (-1, 1):
        it.add(mb.superelipsoide(3.3, 0.4, 2.5, x=sx * 1.95, y=yfr - 0.25, z=zo + 0.65, cor="branco", e=0.3, nu=24,
                                 nv=8))
        it.add(quad_uv("lente", (sx * 1.95, yfr - 0.47, zo + 0.65 + 1.25), (1, 0, 0), (0, 0, 1), 2.7, 1.95,
                       est("tela_ondas" if sx < 0 else "tela_ondas2")))
    aro = [(x, yfr - 0.3, z) for x, z in [(px, pz + zo + 1.9) for px, pz in mb.ret_arredondado(8.3, 3.3, 1.1, 5)]]
    it.add(fio(aro, r=0.08, fechado=True, lados=5))
    alca = ret(9.2, 6.2, 2.6, y=yv + 1.2, seg=5)
    it.add(varre(alca, [(-0.15, 0), (0.12, 0), (0.12, 0.8), (-0.15, 0.8)], zo + 1.4, "magenta", nome="alca"))
    it.add(neon_anel(alca, zo + 1.8, sai=0.12, alt=0.08, prof=0.04))
    arco = [(4.0 * math.cos(math.radians(a)), yv + 0.4, zo + 3.3 + 1.6 * math.sin(math.radians(a))) for a in
            range(0, 181, 15)]
    it.add(fio(arco, r=0.32, mat="atlas", cor="magenta", lados=8))
    for sx in (-1, 1):
        orelha = mb.cilindro(0.95, 0.5, cor="rosa", seg=20, bisel=0.15, eixo="x")
        mb.transforma(orelha, loc=(sx * 3.9, yv + 0.4, zo + 3.4))
        it.add(orelha, mb.cilindro(0.75, 0.06, x=sx * 4.17, y=yv + 0.4, z=zo + 3.4, cor=None, mat="neon", eixo="x",
                                   seg=20, bisel=0.0))
    it.colisao([((0, yc, 0), (l, p, h + 0.6)), ((0, yv, h), (8.8, 3.4, 5.4))])


# ---------------------------------------------------------------------------------------------- fliperama com controle gigante
def controle(cor="azul_celeste", cor2="azul"):
    o = [mb.superelipsoide(4.6, 1.3, 2.3, z=0.9, cor=cor, e=0.5, e_v=0.6, nu=28, nv=12)]
    for sx in (-1, 1):
        g = mb.superelipsoide(1.8, 1.25, 2.6, cor=cor2, e=0.7, e_v=0.7, nu=20, nv=10)
        mb.transforma(g, rot=("Y", sx * 22))
        mb.transforma(g, loc=(sx * 1.85, 0, 0.15))
        o.append(g)
    yf = -0.66
    o.append(mb.caixa(1.0, 0.2, 0.32, x=-1.25, y=yf, z=2.0, cor="grafite_escuro", bisel=0.06))
    o.append(mb.caixa(0.32, 0.2, 1.0, x=-1.25, y=yf, z=1.66, cor="grafite_escuro", bisel=0.06))
    for (dx, dz), c in zip(((0, 0.38), (0.38, 0), (0, -0.38), (-0.38, 0)), ("amarelo", "vermelho", "verde", "rosa")):
        o.append(mb.cilindro(0.17, 0.22, x=1.25 + dx, y=yf + 0.02, z=2.16 + dz, cor=c, eixo="y", seg=14, bisel=0.05))
    for sx in (-1, 1):
        o.append(mb.cilindro(0.34, 0.3, x=sx * 0.55, y=yf + 0.05, z=1.45, cor="grafite", eixo="y", seg=16, bisel=0.08))
        o.append(mb.cilindro(0.24, 0.12, x=sx * 0.55, y=yf - 0.12, z=1.45, cor="grafite_escuro", eixo="y", seg=16,
                             bisel=0.05))
    o.append(mb.caixa(0.7, 0.12, 0.12, y=yf, z=2.55, cor=None, mat="neon", bisel=0.04))
    return o


@predio("fliperama_controle", "Fliperama com controle e joystick gigantes", "fliperama_controle", (1, 1), 1,
        ["lazer", "neon"])
def _p_fliperama(it):
    R, yc = 5.3, 0.7
    base = elipse(R, R, n=48, y=yc)
    h = 5.6
    it.add(bloco(base, 0, h + 0.02, cor="roxo", bisel=0.0))

    def na_frente(q, j):
        return q.y < yc - R * 0.55
    it.add(janelas_pts(base, 0.0, 1, alt=TER, baia=2.2, fl=0.6, fa=0.5, moldura="branco", semente=601,
                       pular=na_frente))
    for k in range(10):
        it.add(faixa_estampa(lambda z: base, k / 10, (k + 1) / 10, h - 1.55, h - 0.65, est("xadrez", emissivo=False),
                             sai=0.05, n=4, nome="xadrez"))
    it.add(neon_anel(base, h - 1.72, sai=0.0, alt=0.08), neon_anel(base, h - 0.48, sai=0.0, alt=0.08))
    it.add(varre(base, [(-0.1, 0), (0.08, 0), (0.08, 0.5), (-0.1, 0.5)], 0.0, "magenta", liso=False))
    it.add(telhado(base, h, borda="branco", piso="grafite", sai=0.25))
    it.add(neon_anel(base, h + 0.3, sai=0.25, alt=0.08))
    th = math.radians(-118)
    it.add(porta(2.2, 2.7, ang=math.degrees(th) + 90, x=R * math.cos(th) * 0.985, y=yc + R * math.sin(th) * 0.985,
                 moldura="branco", marquise="amarelo", marq_prof=1.3))
    # controle gigante encostado na frente (à direita)
    ctl = mb.junta(controle(), "controle")
    mb.transforma(ctl, rot=("X", -14))
    th2 = math.radians(-62)
    mb.transforma(ctl, loc=(0, 0, 0), rot=("Z", math.degrees(th2) + 90))
    mb.transforma(ctl, loc=((R + 0.6) * math.cos(th2), yc + (R + 0.6) * math.sin(th2), 0.05))
    it.add(ctl)
    # joystick em cima
    jx, jy = 1.4, yc + 1.4
    it.add(mb.caixa(2.8, 2.8, 0.9, x=jx, y=jy, z=h - 0.02, cor="grafite_escuro", bisel=0.25))
    it.add(mb.cilindro(1.0, 0.25, x=jx, y=jy, z=h + 0.86, cor="grafite", seg=20, bisel=0.08))
    it.add(mb.cilindro(0.28, 3.2, x=jx, y=jy, z=h + 1.0, cor="cromo", seg=14, bisel=0.05))
    it.add(mb.esfera(1.15, x=jx, y=jy, z=h + 4.6, cor="vermelho", seg=24))
    it.add(mb.cilindro(1.06, 0.08, x=jx, y=jy, z=h + 0.95, cor=None, mat="neon", seg=20, bisel=0.0))
    it.add(placa("let_fliperama", 4.6, 1.15, h + 1.0, x=-1.4, y=yc - R + 1.3, postes=0.9, neon=True))
    it.colisao([((0, yc, 0), (2 * R, 2 * R, h + 0.6)), ((jx, jy, h), (2.8, 2.8, 5.8)),
                ((3.4, -4.2, 0), (5.0, 3.0, 3.3))])


# ---------------------------------------------------------------------------------------------- cyber-loja com telas
def cyber_loja(it, corpo, det, telas, semente=700):
    l, p, r, yc = 12.0, 9.2, 0.9, 0.3
    pts = ret(l, p, r, y=yc)
    yf = yc - p / 2
    h = TER + AND
    it.add(bloco(pts, 0, h + 0.02, cor=corpo, bisel=0.06))
    it.add(vitrine_loja(7.2, 2.9, x=-1.7, y=yf, moldura="branco", divisoes=4))
    it.add(porta(2.0, 2.8, x=4.1, y=yf, moldura="branco", marquise=None, folhas=1))
    it.add(mb.caixa(l + 0.3, 1.7, 0.32, y=yf - 0.75, z=3.55, cor=det, bisel=0.13))
    it.add(mb.caixa(l + 0.32, 0.08, 0.08, y=yf - 1.62, z=3.67, cor=None, mat="neon", bisel=0.03))
    it.add(mb.caixa(l - 0.8, 0.12, 0.04, y=yf - 1.2, z=3.53, cor=None, mat="luz", bisel=0.01))
    it.add(tela(telas[0], 7.2, 2.3, TER + 0.45, x=-1.5, y=yf, moldura="branco"))
    it.add(janelas_pts(pts, 0.0, 1, alt=TER, baia=2.4, fl=0.6, fa=0.5, moldura="branco", semente=semente,
                       pular=lambda q, j: q.y < yf + 0.5 or (q.x > l / 2 - 0.5 and abs(q.y - yc) < 2.2)))
    it.add(janelas_pts(pts, TER, 1, baia=2.2, fl=0.7, moldura="branco", semente=semente + 1,
                       pular=lambda q, j: (q.y < yf + 0.5 and q.x < 3.0) or (q.x > l / 2 - 0.5 and abs(q.y - yc) < 2.2)))
    it.add(tela(telas[1], 3.2, 2.4, 1.0, ang=90, x=l / 2, y=yc, moldura="branco"))
    it.add(tela(telas[2], 3.0, 2.3, TER + 0.45, ang=90, x=l / 2, y=yc, moldura="branco"))
    it.add(neon_quinas(l, p, r, 0.3, h - 0.1, y=yc))
    it.add(telhado(pts, h, borda=det, piso="cinza", sai=0.2))
    it.add(neon_anel(pts, h + 0.32, sai=0.2, alt=0.08))
    it.add(placa("let_cyber", 5.2, 1.3, h + 1.2, x=-1.0, y=yf + 1.2, postes=1.1, neon=True))
    it.add(maquina(3.4, yc + 2.4, h, 1.8, 1.4, 1.0), maquina(0.6, yc + 2.6, h, 1.4, 1.2, 0.8),
           antena(-4.4, yc + 2.8, h, 3.2))
    # claraboia de vidro e antena parabólica
    it.add(mb.caixa(3.0, 2.0, 0.5, x=-3.4, y=yc + 1.0, z=h, cor="branco", bisel=0.12))
    it.add(mb.caixa(2.6, 1.6, 0.06, x=-3.4, y=yc + 1.0, z=h + 0.48, cor=None, mat="janela_fria", bisel=0.0))
    prato = mb.torno([(0, 0), (0.55, 0.05), (0.75, 0.25), (0.7, 0.28), (0.5, 0.12), (0, 0.08)], cor="branco", seg=16)
    mb.transforma(prato, rot=("X", 55))
    mb.transforma(prato, loc=(4.4, yc - 1.2, h + 0.9))
    it.add(prato, mb.cilindro(0.08, 0.9, x=4.4, y=yc - 1.2, z=h, cor="metal_claro", seg=8, bisel=0.0))
    it.colisao([((0, yc, 0), (l, p, h + 0.6)), ((0, yf - 0.85, 3.5), (l, 1.7, 0.4))])


@predio("cyber_loja_telas_azul", "Cyber-loja com telas (azul)", "cyber_loja_telas", (1, 1), 2,
        ["lazer", "loja", "telas", "neon"])
def _p_cyber_azul(it):
    cyber_loja(it, "azul_celeste", "azul", ("tela_ondas", "tela_barras", "tela_planeta"))


@predio("cyber_loja_telas_lilas", "Cyber-loja com telas (lilás)", "cyber_loja_telas", (1, 1), 2,
        ["lazer", "loja", "telas", "neon"])
def _p_cyber_lilas(it):
    cyber_loja(it, "lilas", "roxo", ("tela_ondas2", "tela_pixel", "tela_barras"), semente=720)


# ---------------------------------------------------------------------------------------------- torre das telas
@predio("cyber_torre_telas", "Torre de telas gigantes sobre base ondulada", "cyber_torre_telas", (1, 1), 7,
        ["telas", "neon", "comercial"])
def _p_cyber_torre(it):
    bp = ret(12.2, 11.0, 1.4)
    hb = TER + AND
    yf = -5.5
    it.add(bloco(bp, 0, hb + 0.02, cor="branco", bisel=0.06))
    for k in range(12):
        it.add(faixa_estampa(lambda z: bp, k / 12, (k + 1) / 12, 4.35, 5.35, est("ondas_fachada", emissivo=False),
                             sai=0.03, n=3, nome="ondas"))
    it.add(vitrine_loja(3.6, 2.8, x=-3.5, y=yf, moldura="azul"))
    it.add(vitrine_loja(3.6, 2.8, x=3.5, y=yf, moldura="azul"))
    it.add(porta(2.2, 2.8, y=yf, moldura="azul", marquise="azul", marq_prof=1.3))
    it.add(janelas_pts(bp, 0.0, 1, alt=TER, baia=2.6, fl=0.6, fa=0.5, moldura="azul", semente=801,
                       pular=lambda q, j: q.y < yf + 0.5))
    it.add(janelas_fn(lambda z: bp, 0, 0, alturas=[(5.65, 7.0)], baia=2.0, fl=0.72, moldura="azul", semente=802))
    it.add(telhado(bp, hb, borda="azul", piso="cinza_claro", sai=0.18))
    it.add(neon_anel(bp, hb + 0.3, sai=0.18, alt=0.08), neon_anel(bp, 0.3, sai=0.0, alt=0.08))
    for x in (-4.6, 4.6):
        it.add(plantinha(x, -4.3, hb + 0.05, 0.7))
    yt = 0.7
    T = ret(8.4, 7.4, 1.6, y=yt)
    nt = 5
    zt = hb
    ht = nt * AND
    it.add(bloco(T, zt - 0.05, ht + 0.07, cor="azul_claro", bisel=0.0))
    xs = 1.5
    it.add(janelas_pts(T, zt, nt, baia=1.9, fl=0.66, moldura="branco", semente=803,
                       pular=lambda q, j: (q.y < yt - 3.4 and q.x > xs - 2.3) or (q.x > 3.9 and j >= 2)))
    for k in range(1, nt):
        if k % 2 == 0:
            it.add(laje_borda(T, zt + k * AND - 0.16, sai=0.28, esp=0.28, cor="branco"))
    fy = yt - 3.7
    it.add(tela("tela_planeta", 3.4, 3.4, zt + 0.8, x=xs, y=fy, moldura="amarelo", neon=False))
    it.add(tela("tela_pixel", 3.4, 3.4, zt + 0.8 + 3.72, x=xs, y=fy, moldura="amarelo", neon=False))
    it.add(fio([(xs - 2.0, fy - 0.28, zt + 0.5), (xs + 2.0, fy - 0.28, zt + 0.5), (xs + 2.0, fy - 0.28, zt + 8.65),
                (xs - 2.0, fy - 0.28, zt + 8.65)], r=0.07, fechado=True, lados=5))
    it.add(tela("tela_barras", 3.0, 3.0, zt + 2 * AND + 0.6, ang=90, x=4.2, y=yt, moldura="amarelo"))
    zc = zt + ht
    cr = ret(9.0, 8.0, 1.8, y=yt)
    it.add(bloco(cr, zc, 1.3, cor="branco", bisel=0.12))
    it.add(varre(cr, [(-0.05, 0), (0.06, 0), (0.06, 0.12), (-0.05, 0.12)], zc + 0.55, None, mat="luz", liso=False))
    it.add(telhado(desloca(cr, -0.05), zc + 1.3, borda="branco", piso="cinza", larg=0.45, alt=0.45, sai=0.08))
    it.add(neon_anel(cr, zc + 0.05, sai=0.0, alt=0.08))
    it.add(antena(-1.6, yt + 1.2, zc + 1.3, 3.6), maquina(1.6, yt + 1.6, zc + 1.3, 1.8, 1.4, 1.0))
    it.colisao([((0, 0, 0), (12.2, 11.0, hb + 0.6)), ((0, yt, hb), (9.0, 8.0, ht + 2.0))])


# ---------------------------------------------------------------------------------------------- caixa listrada
def caixa_listras(it, cores, toldo_cor, semente=900):
    l, p, r = 8.4, 7.6, 0.8
    pts = ret(l, p, r)
    alts = [3.8, AND, AND, AND]
    z = 0.0
    yf = -p / 2
    for k, h in enumerate(alts):
        it.add(bloco(pts, z, h + 0.02, cor=cores[k], bisel=0.04))
        if k == 0:
            it.add(vitrine_loja(4.0, 2.4, x=-1.6, y=yf, moldura="branco", vidro="janela"))
            it.add(porta(1.6, 2.6, x=2.6, y=yf, moldura="branco", marquise=None, folhas=1))
            it.add(toldo(4.4, x=-1.6, y=yf, z=3.2, cor=toldo_cor, cor2="branco", prof=1.0))
            it.add(janelas_pts(pts, 0.0, 1, alt=h, baia=2.2, fl=0.6, fa=0.5, moldura="branco", semente=semente,
                               pular=lambda q, j: q.y < yf + 0.4))
        else:
            it.add(janelas_pts(pts, z, 1, alt=h, baia=2.1, fl=0.62, moldura="branco", semente=semente + k))
        z += h
        if k < len(alts) - 1:
            it.add(laje_borda(pts, z - 0.18, sai=0.3, esp=0.34, cor="branco"))
            if k % 2 == 1:
                it.add(neon_anel(pts, z - 0.0, sai=0.3, alt=0.07, prof=0.04))
    it.add(telhado(pts, z, borda="branco", piso="cinza", sai=0.25))
    it.add(neon_anel(pts, z + 0.3, sai=0.25, alt=0.08))
    it.add(maquina(-1.8, 1.4, z, 1.6, 1.2, 0.9), antena(2.2, 1.6, z, 2.6))
    it.colisao([((0, 0, 0), (l + 0.6, p + 0.6, z + 0.6))])


@predio("predio_caixa_listras_cores", "Prédio caixa listrado colorido com neon", "predio_caixa_listras", (1, 1), 4,
        ["pequeno", "neon", "loja"])
def _p_listras_cores(it):
    caixa_listras(it, ["verde_agua", "amarelo", "vermelho_claro", "azul_celeste"], "verde")


@predio("predio_caixa_listras_lilas", "Prédio caixa listrado lilás com neon", "predio_caixa_listras", (1, 1), 4,
        ["pequeno", "neon", "loja"])
def _p_listras_lilas(it):
    caixa_listras(it, ["turquesa", "lilas", "rosa", "azul_claro"], "magenta", semente=930)


# ---------------------------------------------------------------------------------------------- caixa com tela e escotilhas
def caixa_tela(it, corpo, det, ests, semente=1000):
    l, p, r = 8.2, 7.6, 0.9
    pts = ret(l, p, r)
    yf = -p / 2
    alts = [3.8, AND, AND, AND]
    z = 0.0
    it.add(bloco(pts, 0, sum(alts) + 0.02, cor=corpo, bisel=0.05))
    xt = 1.85
    for k, h in enumerate(alts):
        if k == 0:
            it.add(porta(1.6, 2.6, x=-2.4, y=yf, moldura="branco", marquise=det, folhas=1, marq_prof=1.1))
            it.add(vitrine_loja(3.6, 2.3, x=1.7, y=yf, moldura="branco", vidro="janela"))
            it.add(janelas_pts(pts, 0, 1, alt=h, baia=2.2, fl=0.6, fa=0.5, moldura="branco", semente=semente,
                               pular=lambda q, j: q.y < yf + 0.4))
        else:
            it.add(janelas_pts(pts, z, 1, alt=h, baia=2.1, fl=0.62, moldura="branco", semente=semente + k,
                               pular=lambda q, j: q.y < yf + 0.4))
            it.add(escotilha(0.62, x=-2.3, y=yf, z=z + h * 0.52, moldura="branco", vidro=JANELAS[(k + semente) % 3]))
            it.add(escotilha(0.42, x=-0.6, y=yf, z=z + h * 0.52, moldura="branco",
                             vidro=JANELAS[(k + semente + 1) % 3]))
        z += h
        if k < len(alts) - 1:
            it.add(laje_borda(pts, z - 0.16, sai=0.26, esp=0.3, cor="branco"))
    hz = z
    zt = alts[0] + 0.45
    it.add(tela(ests[0], 2.7, 2.7, zt, x=xt, y=yf, moldura=det, neon=False))
    it.add(tela(ests[1], 2.7, 2.7, zt + 3.0, x=xt, y=yf, moldura=det, neon=False))
    it.add(fio([(xt - 1.75, yf - 0.28, zt - 0.3), (xt + 1.75, yf - 0.28, zt - 0.3), (xt + 1.75, yf - 0.28, zt + 6.0),
                (xt - 1.75, yf - 0.28, zt + 6.0)], r=0.07, fechado=True, lados=5))
    it.add(neon_vertical(-l / 2 - 0.02, yf + 0.3, 0.4, hz - 0.2), neon_vertical(l / 2 + 0.02, yf + 0.3, 0.4, hz - 0.2))
    it.add(telhado(pts, hz, borda=det, piso="cinza", sai=0.22))
    it.add(neon_anel(pts, hz + 0.3, sai=0.22, alt=0.08))
    it.add(maquina(1.8, 1.6, hz, 1.6, 1.2, 0.9), mb.cilindro(0.6, 1.2, x=-2.0, y=1.4, z=hz, cor="branco", seg=18,
                                                             bisel=0.1))
    it.colisao([((0, 0, 0), (l + 0.5, p + 0.5, hz + 0.6))])


@predio("predio_caixa_tela_rosa", "Prédio com tela vertical e escotilhas (rosa)", "predio_caixa_tela", (1, 1), 4,
        ["pequeno", "telas", "neon"])
def _p_tela_rosa(it):
    caixa_tela(it, "rosa_claro", "magenta", ("tela_ondas", "tela_barras"))


@predio("predio_caixa_tela_azul", "Prédio com tela vertical e escotilhas (azul)", "predio_caixa_tela", (1, 1), 4,
        ["pequeno", "telas", "neon"])
def _p_tela_azul(it):
    caixa_tela(it, "porcelana_azul", "azul", ("tela_planeta", "tela_pixel"), semente=1010)


# ---------------------------------------------------------------------------------------------- vidro com marquise flutuante
def vidro_marquise(it, cor, semente=1100):
    l, p, r, yc = 10.4, 9.2, 1.3, 0.2
    pts = ret(l, p, r, y=yc)
    yf = yc - p / 2
    n = 4
    h = TER + (n - 1) * AND
    it.add(bloco(pts, 0, h + 0.02, cor="azul_escuro", bisel=0.0))
    it.add(vitrine_loja(3.2, 2.9, x=-3.0, y=yf, moldura="branco"))
    it.add(vitrine_loja(3.2, 2.9, x=3.0, y=yf, moldura="branco"))
    it.add(porta(2.2, 2.9, y=yf, moldura="branco", marquise=None))
    it.add(janelas_pts(pts, 0, 1, alt=TER, baia=2.4, fl=0.82, fa=0.66, moldura=None, semente=semente,
                       pular=lambda q, j: q.y < yf + 0.4))
    it.add(janelas_pts(pts, TER, n - 1, baia=1.5, fl=0.93, fa=0.84, peitoril=0.55, moldura=None, semente=semente + 1))
    for k in range(n - 1):
        z = TER + k * AND
        it.add(laje_borda(pts, z - 0.16, sai=0.24, esp=0.26, cor="branco"))
    # marquise flutuante da entrada
    mq = ret(6.4, 2.6, 1.0, y=yf - 1.1)
    it.add(bloco(mq, 3.75, 0.34, cor=cor, bisel=0.12))
    it.add(neon_anel(mq, 3.92, sai=0.0, alt=0.08, prof=0.04))
    it.add(mb.caixa(5.0, 0.14, 0.04, y=yf - 2.0, z=3.73, cor=None, mat="luz", bisel=0.01))
    for sx in (-1, 1):
        it.add(mb.cilindro(0.08, 3.75, x=sx * 2.8, y=yf - 2.0, z=0, cor="cromo", seg=10, bisel=0.02))
    # telhado e a grande marquise flutuante em cima
    it.add(telhado(pts, h, borda="branco", piso="cinza", larg=0.45, alt=0.45, sai=0.24))
    zm = h + 1.9
    big = ret(12.6, 11.6, 3.1, y=yc, seg=6)
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.add(mb.cilindro(0.16, zm - h + 0.05, x=sx * 3.8, y=yc + sy * 3.2, z=h, cor="cromo", seg=12, bisel=0.03))
    # anel (halo) flutuante: o miolo é vazado e deixa ver o jardim do telhado
    a, r_ = 0.62, 0.18
    w = 2.4
    perf = [(-w, a - r_), (-w, r_), (-w + r_, 0.0), (-r_, 0.0), (0.0, r_), (0.0, a - r_), (-r_, a), (-w + r_, a),
            (-w, a - r_)]
    it.add(varre(big, perf, zm, cor, nome="halo", angulo=50))
    it.add(neon_anel(big, zm + 0.31, sai=0.0, alt=0.1, prof=0.05))
    it.add(neon_anel(desloca(big, -w), zm + 0.31, sai=-0.07, alt=0.08, prof=0.04))
    it.add(varre(desloca(big, -0.9), [(-0.1, 0.0), (0.1, 0.0)], zm - 0.005, None, mat="luz", liso=False))
    for x in (-2.0, 0.0, 2.0):
        it.add(plantinha(x, yc - 0.2, h + 0.05, 0.6 + abs(x) * 0.1))
    it.add(bloco(ret(5.2, 1.4, 0.6, y=yc - 0.2), h + 0.02, 0.35, cor="madeira_clara", bisel=0.05))
    it.add(maquina(-2.6, yc + 2.0, h, 1.6, 1.3, 0.9), maquina(2.4, yc + 2.2, h, 1.4, 1.2, 0.8))
    it.colisao([((0, yc, 0), (l + 0.5, p + 0.5, h + 0.5)), ((0, yc, zm), (12.6, 11.6, 0.62)),
                ((0, yf - 1.1, 3.75), (6.4, 2.6, 0.34))])


@predio("predio_vidro_marquise_azul", "Prédio de vidro com marquise flutuante (azul)", "predio_vidro_marquise", (1, 1),
        4, ["medio", "vidro", "neon"])
def _p_vidro_azul(it):
    vidro_marquise(it, "azul_celeste")


@predio("predio_vidro_marquise_lilas", "Prédio de vidro com marquise flutuante (lilás)", "predio_vidro_marquise",
        (1, 1), 4, ["medio", "vidro", "neon"])
def _p_vidro_lilas(it):
    vidro_marquise(it, "lilas", semente=1120)


# ---------------------------------------------------------------------------------------------- casas modulares
def casa_modular(it, c1, c2, semente=1200):
    it.add(bloco(ret(12.0, 10.0, 1.2), -0.02, 0.1, cor="grama", bisel=0.03))
    it.add(bloco(ret(1.8, 3.2, 0.3, x=-1.6, y=-3.6), 0.0, 0.1, cor="calcada", bisel=0.02))
    A = ret(8.4, 6.6, 0.6, x=-0.9, y=0.5)
    ha = 3.4
    it.add(bloco(A, 0.0, ha, cor=c1, bisel=0.06))
    yfa = 0.5 - 3.3
    it.add(porta(1.5, 2.4, x=-1.6, y=yfa, moldura="grafite", marquise=None, folhas=1))
    it.add(vitrine_loja(3.0, 2.0, x=1.4, y=yfa, moldura="grafite", vidro="janela", divisoes=2, z=0.5))
    it.add(janelas_pts(A, 0.0, 1, alt=ha, baia=2.4, fl=0.6, fa=0.5, moldura="grafite", semente=semente,
                       pular=lambda q, j: q.y < yfa + 0.3))
    B = ret(7.0, 5.8, 0.6, x=1.6, y=-0.2)
    hb = 3.1
    it.add(bloco(B, ha - 0.02, hb, cor=c2, bisel=0.06))
    it.add(janelas_pts(B, ha, 1, alt=hb, baia=1.8, fl=0.82, fa=0.55, moldura=None, semente=semente + 1))
    it.add(neon_anel(B, ha + 0.06, sai=0.0, alt=0.07, prof=0.05), neon_anel(B, ha + hb - 0.08, sai=0.0, alt=0.07,
                                                                         prof=0.05))
    it.add(mb.caixa(1.4, 4.6, 0.04, x=4.4, y=-0.2, z=ha - 0.03, cor=None, mat="luz", bisel=0.0))
    it.add(telhado(B, ha + hb, borda="branco", piso="cinza", larg=0.3, alt=0.32, sai=0.08))
    # terraço sobre o módulo de baixo (lado esquerdo) com guarda-corpo de vidro
    it.add(bloco(ret(2.4, 6.0, 0.4, x=-3.85, y=0.5), ha - 0.04, 0.1, cor="madeira_clara", bisel=0.02))
    for y0, y1 in ((-2.6, 3.5),):
        it.add(mb.caixa(0.06, y1 - y0, 1.0, x=-5.0, y=(y0 + y1) / 2 + 0.05, z=ha, cor=None, mat="vidro", bisel=0.0))
        it.add(mb.caixa(0.1, y1 - y0 + 0.1, 0.08, x=-5.0, y=(y0 + y1) / 2 + 0.05, z=ha + 1.0, cor="branco", bisel=0.03))
    it.add(mb.caixa(2.3, 0.06, 1.0, x=-3.85, y=-2.62, z=ha, cor=None, mat="vidro", bisel=0.0))
    it.add(mb.caixa(2.4, 0.1, 0.08, x=-3.85, y=-2.62, z=ha + 1.0, cor="branco", bisel=0.03))
    it.add(plantinha(-4.2, 2.6, ha + 0.05, 0.5))
    # painéis solares e plantinhas no jardim
    for k in range(3):
        pn = mb.caixa(1.1, 1.6, 0.06, cor="azul_marinho", bisel=0.02)
        mb.transforma(pn, rot=("X", 20))
        mb.transforma(pn, loc=(0.4 + k * 1.3, 0.2, ha + hb + 0.3))
        it.add(pn)
    for x, y in ((-5.2, -4.0), (4.8, -4.0), (5.2, 3.8)):
        it.add(plantinha(x, y, 0.05, 0.6))
    it.colisao([((-0.9, 0.5, 0), (8.4, 6.6, ha)), ((1.6, -0.2, ha), (7.0, 5.8, hb + 0.4))])


@predio("casa_modular_cubos_branca", "Casa modular de cubos com neon (branca e azul)", "casa_modular_cubos", (1, 1), 2,
        ["casa", "pequeno", "neon"])
def _p_casa_branca(it):
    casa_modular(it, "branco", "azul_celeste")


@predio("casa_modular_cubos_lilas", "Casa modular de cubos com neon (lilás)", "casa_modular_cubos", (1, 1), 2,
        ["casa", "pequeno", "neon"])
def _p_casa_lilas(it):
    casa_modular(it, "branco_gelo", "lilas", semente=1220)


def _equador(l, p, e, x, y, z, n=40, sai=0.04):
    pts = []
    for k in range(n):
        t = 2 * math.pi * k / n
        c, s = math.cos(t), math.sin(t)
        pts.append((x + math.copysign(abs(c) ** e, c) * (l / 2 + sai), y + math.copysign(abs(s) ** e, s) * (p / 2 + sai),
                    z))
    return pts


@predio("casa_modular_capsulas", "Casa modular de cápsulas", "casa_modular_capsulas", (1, 1), 2,
        ["casa", "pequeno", "neon"])
def _p_casa_capsulas(it):
    it.add(bloco(ret(12.0, 10.0, 1.2), -0.02, 0.1, cor="grama", bisel=0.03))
    it.add(bloco(ret(10.2, 6.6, 1.2, x=-0.2, y=0.4), 0.0, 0.35, cor="cinza_claro", bisel=0.08))
    # cápsula A (térreo, deitada em X)
    ax, ay, az = -1.0, 0.6, 0.3
    it.add(mb.superelipsoide(7.6, 4.6, 3.6, x=ax, y=ay, z=az, cor="branco", e=0.4, e_v=0.45, nu=28, nv=12))
    it.add(fio(_equador(7.6, 4.6, 0.4, ax, ay, az + 1.8, sai=0.03), r=0.07, fechado=True, lados=5))
    yfa = ay - 2.3
    it.add(porta(1.4, 2.3, x=1.1, y=yfa + 0.08, moldura="lilas", marquise=None, folhas=1))
    for x, rr in ((-3.3, 0.6), (-1.5, 0.6)):
        it.add(escotilha(rr, x=x, y=yfa + 0.06, z=az + 1.9, moldura="lilas", vidro=JANELAS[int(x) % 3]))
    it.add(escotilha(0.55, ang=-90, x=ax - 3.8 + 0.06, y=ay, z=az + 1.9, moldura="lilas", vidro="janela"))
    # cápsula B (em cima, deitada em Y)
    bx, by, bz = 1.4, 0.9, 3.4
    it.add(mb.superelipsoide(4.6, 6.0, 3.1, x=bx, y=by, z=bz, cor="lilas_claro", e=0.4, e_v=0.45, nu=28, nv=12))
    it.add(fio(_equador(4.6, 6.0, 0.4, bx, by, bz + 1.55, sai=0.03), r=0.07, fechado=True, lados=5))
    it.add(escotilha(0.85, x=bx, y=by - 3.0 + 0.06, z=bz + 1.6, moldura="branco", vidro="janela_fria"))
    it.add(escotilha(0.5, ang=90, x=bx + 2.3 - 0.06, y=by - 1.0, z=bz + 1.6, moldura="branco", vidro="janela"))
    it.add(escotilha(0.5, ang=90, x=bx + 2.3 - 0.06, y=by + 1.2, z=bz + 1.6, moldura="branco", vidro="janela_apagada"))
    it.add(antena(bx + 0.6, by + 1.2, bz + 3.0, 1.6))
    # cápsula C (redonda, ao lado)
    cx_, cy_ = 4.1, -1.6
    it.add(mb.superelipsoide(3.2, 3.2, 3.0, x=cx_, y=cy_, z=0.3, cor="azul_bebe", e=0.8, e_v=0.7, nu=24, nv=12))
    it.add(fio(_equador(3.2, 3.2, 0.8, cx_, cy_, 1.8, sai=0.03), r=0.06, fechado=True, lados=5))
    it.add(escotilha(0.55, x=cx_, y=cy_ - 1.6 + 0.12, z=1.9, moldura="azul_celeste", vidro="janela_fria"))
    it.add(mb.cilindro(1.0, 0.25, x=cx_, y=cy_, z=3.2, cor="azul_celeste", seg=18, bisel=0.08))
    # escada de mão até a cápsula de cima
    for sx in (-0.35, 0.35):
        it.add(mb.cilindro(0.05, 3.6, x=-2.9 + sx, y=yfa - 0.2 + 1.0, z=0.35, cor="metal_claro", seg=8, bisel=0.0))
    for k in range(6):
        it.add(mb.cilindro(0.04, 0.7, x=-2.9, y=yfa + 0.8, z=0.7 + k * 0.55, cor="metal_claro", eixo="x", seg=8,
                           bisel=0.0))
    for x, y in ((-5.4, -4.0), (5.4, 3.8), (-5.2, 3.6)):
        it.add(plantinha(x, y, 0.05, 0.6))
    it.colisao([((ax, ay, 0), (7.6, 4.6, 3.9)), ((bx, by, 3.4), (4.6, 6.0, 3.1)), ((cx_, cy_, 0), (3.2, 3.2, 3.5))])


# ---------------------------------------------------------------------------------------------- prédio colmeia (painel de favos)
@predio("predio_colmeia", "Prédio com painel de LED em favos", "predio_colmeia", (1, 1), 6, ["medio", "telas", "neon"])
def _p_colmeia(it):
    l, p, r, xc, yc = 9.2, 8.6, 1.0, 1.4, 0.4
    pts = ret(l, p, r, x=xc, y=yc)
    yf = yc - p / 2
    n = 6
    h = TER + (n - 1) * AND
    it.add(bloco(pts, 0, h + 0.02, cor="azul", bisel=0.05))
    xp = xc + 2.0
    it.add(porta(2.0, 2.8, x=xc - 2.4, y=yf, moldura="branco", marquise="branco", marq_prof=1.2))
    it.add(vitrine_loja(3.6, 2.8, x=xp - 0.2, y=yf, moldura="branco"))
    it.add(janelas_pts(pts, 0, 1, alt=TER, baia=2.4, fl=0.6, fa=0.5, moldura="branco", semente=1301,
                       pular=lambda q, j: q.y < yf + 0.4))
    it.add(janelas_pts(pts, TER, n - 1, baia=2.1, fl=0.64, moldura="branco", semente=1302,
                       pular=lambda q, j: (q.y < yf + 0.4 and q.x > xc - 0.2) or (q.x > xc + l / 2 - 0.4 and
                                                                                   q.y < yc + 0.6 and j < 4)))
    for k in range(3):
        it.add(tela("tela_colmeia", 3.6, 3.6, TER + 0.5 + k * 3.8, x=xp, y=yf, moldura="branco", neon=False, borda=0.1))
    for k in range(2):
        it.add(tela("tela_colmeia", 3.4, 3.4, TER + 0.6 + k * 3.7, ang=90, x=xc + l / 2, y=yc - 1.6,
                    moldura="branco", neon=False, borda=0.1))
    it.add(fio([(xp - 2.0, yf - 0.24, TER + 0.3), (xp + 2.0, yf - 0.24, TER + 0.3), (xp + 2.0, yf - 0.24, TER + 11.7),
                (xp - 2.0, yf - 0.24, TER + 11.7)], r=0.07, fechado=True, lados=5))
    it.add(neon_quinas(l, p, r, 0.4, h - 0.2, x=xc, y=yc))
    it.add(laje_borda(pts, TER - 0.2, sai=0.28, esp=0.3, cor="branco"))
    it.add(telhado(pts, h, borda="branco", piso="cinza", sai=0.22))
    it.add(neon_anel(pts, h + 0.3, sai=0.22, alt=0.08))
    it.add(maquina(xc - 2.0, yc + 1.8, h, 2.0, 1.5, 1.1), antena(xc + 2.6, yc + 2.4, h, 4.0))
    # anexo baixo à esquerda com terraço
    an = ret(3.2, 6.6, 0.8, x=-4.9, y=0.8)
    ha = TER + AND
    it.add(bloco(an, 0, ha + 0.02, cor="branco", bisel=0.06))
    it.add(janelas_pts(an, 0, 2, alt=ha / 2, baia=2.0, fl=0.62, moldura="azul", semente=1303))
    it.add(neon_anel(an, ha / 2, sai=0.0, alt=0.07), neon_anel(an, ha - 0.4, sai=0.0, alt=0.07))
    it.add(telhado(an, ha, borda="azul", piso="cinza_claro", larg=0.35, alt=0.45, sai=0.12))
    it.add(plantinha(-4.9, -0.8, ha + 0.05, 0.6), plantinha(-4.9, 2.2, ha + 0.05, 0.8))
    it.colisao([((xc, yc, 0), (l + 0.5, p + 0.5, h + 0.6)), ((-4.9, 0.8, 0), (3.2, 6.6, ha + 0.5))])


# ---------------------------------------------------------------------------------------------- balanço magenta
@predio("predio_balanco_magenta", "Prédio com balanço magenta e terraço-jardim", "predio_balanco_magenta", (1, 1), 4,
        ["medio", "neon"])
def _p_balanco(it):
    yc = 0.3
    Bp = ret(10.6, 9.4, 1.2, y=yc)
    yf = yc - 4.7
    hb = TER + AND
    it.add(bloco(Bp, 0, hb + 0.02, cor="branco", bisel=0.06))
    it.add(vitrine_loja(3.4, 2.8, x=-3.0, y=yf, moldura="azul"))
    it.add(porta(2.2, 2.8, x=1.2, y=yf, moldura="azul", marquise="azul", marq_prof=1.2))
    it.add(janelas_pts(Bp, 0, 1, alt=TER, baia=2.4, fl=0.6, fa=0.5, moldura="azul", semente=1401,
                       pular=lambda q, j: q.y < yf + 0.4))
    it.add(janelas_pts(Bp, TER, 1, baia=2.0, fl=0.66, moldura="azul", semente=1402))
    it.add(laje_borda(Bp, TER - 0.2, sai=0.28, esp=0.3, cor="azul"))
    it.add(neon_anel(Bp, TER - 0.05, sai=0.28, alt=0.06, prof=0.04))
    it.add(telhado(Bp, hb, borda="branco", piso="cinza_claro", larg=0.45, alt=0.55, sai=0.18))
    for x, y in ((-4.2, -3.6), (-2.4, -3.6), (4.2, -3.6), (-4.2, 3.6), (4.2, 3.6)):
        it.add(plantinha(x, yc + y, hb + 0.05, 0.7))
    Mp = ret(8.0, 6.8, 1.0, y=yc + 0.6)
    it.add(bloco(Mp, hb - 0.03, AND + 0.06, cor="azul_escuro", bisel=0.0))
    it.add(janelas_pts(Mp, hb, 1, baia=1.5, fl=0.92, fa=0.8, peitoril=0.55, moldura=None, semente=1403))
    zs = hb + AND
    S = ret(10.8, 8.8, 1.6, x=0.6, y=yc - 0.1)
    it.add(bloco(S, zs, 0.8, cor="magenta", bisel=0.22, seg=3))
    it.add(neon_anel(S, zs + 0.05, sai=0.0, alt=0.08, prof=0.04), neon_anel(S, zs + 0.75, sai=0.0, alt=0.06, prof=0.03))
    it.add(mb.extrudado(mb._ccw(desloca(S, -1.0)), 0.03, z=zs - 0.02, cor=None, mat="luz", bisel=0.0))
    Tp = ret(7.0, 6.0, 1.1, x=1.0, y=yc + 0.6)
    zt = zs + 0.8
    it.add(bloco(Tp, zt - 0.02, AND + 0.04, cor="branco", bisel=0.06))
    it.add(janelas_pts(Tp, zt, 1, baia=1.9, fl=0.66, moldura="magenta", semente=1404))
    it.add(neon_quinas(7.0, 6.0, 1.1, zt + 0.2, zt + AND - 0.1, x=1.0, y=yc + 0.6))
    it.add(telhado(Tp, zt + AND, borda="turquesa", piso="cinza", sai=0.2))
    it.add(neon_anel(Tp, zt + AND + 0.3, sai=0.2, alt=0.08))
    it.add(maquina(-0.4, yc + 1.4, zt + AND, 1.6, 1.3, 0.9), antena(2.8, yc + 1.8, zt + AND, 3.0))
    it.colisao([((0, yc, 0), (10.6, 9.4, hb + 0.6)), ((0, yc + 0.6, hb), (8.0, 6.8, AND)),
                ((0.6, yc - 0.1, zs), (10.8, 8.8, 0.8)), ((1.0, yc + 0.6, zt), (7.0, 6.0, AND + 0.6))])


# ======================================================================================================================
def centraliza(it, lote):
    """Origem no centro da projeção (as peças podem ter sido desenhadas fora de centro) e aviso se passar do lote."""
    lo, hi = mb.bbox(it.partes)
    dx, dy = (lo.x + hi.x) / 2, (lo.y + hi.y) / 2
    if abs(dx) > 1e-3 or abs(dy) > 1e-3:
        for o in it.partes:
            o.data.transform(Matrix.Translation((-dx, -dy, 0)))
        if it.colisores:
            it.colisores = [((c[0] - dx, c[1] - dy, c[2]), t) for c, t in it.colisores]
    lx, ly = hi.x - lo.x, hi.y - lo.y
    mx, my = lote[0] * cb.Q - 2.0, lote[1] * cb.Q - 2.0
    if lx > mx + 1e-3 or ly > my + 1e-3 or lo.z < -0.05:
        print(f"AVISO {it.id}: projeção {lx:.2f} × {ly:.2f} (máx {mx} × {my}), z mín {lo.z:.2f}", flush=True)


def main():
    global EST_DIR
    argv = sys.argv[sys.argv.index("--") + 1:]
    saida, filtro = argv[0], argv[1:]
    EST_DIR = os.path.join(saida, CAT, "estampas")
    cat = mb.Catalogo(CAT, saida, rotulo="Prédios futuristas")
    for id_, rotulo, grupo, lote, andares, tags, f in PRODUTOS:
        if filtro and id_ not in filtro and grupo not in filtro:
            continue
        mb.limpa()
        it = mb.Item(id_)
        f(it)
        centraliza(it, lote)
        exporta(cat, it, rotulo, grupo, lote, andares, tags)
    cat.salva()


if __name__ == "__main__":
    main()
