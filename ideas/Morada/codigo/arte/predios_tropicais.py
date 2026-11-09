"""Prédios tropicais da cidade do Morada (orla, praia, resort), no estilo fofo da referência.

Uso (ver GUIA_PREDIOS.md e GUIA_CIDADE.md):
  cd SP && MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/predios_tropicais.py -- SP/cidade_out [ids...]
Grava em SP/cidade_out/predios_tropicais/ (glb/, miniaturas/, estampas/, catalogo.json).

Convenções: lote de 15 m (projeção até 13 × 13; 2 × 1 até 28 × 13; 2 × 2 até 28 × 28), origem no centro da projeção,
base em z = 0 (calçada), frente para −Y. Andar de 3,2 m (cb.ANDAR), térreo de 4,2 m. Janelas com os materiais janela,
janela_fria e janela_apagada (cada vidro é uma face própria); letreiros em luz/neon (letras em relevo) ou estampa
(placa desenhada com PIL, com a textura ligada também na emissão para acender à noite).
"""
import bisect
import math
import os
import random
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import moveis_base as mb  # noqa: E402
import cidade_base as cb  # noqa: E402

V = Vector
AQUI = os.path.dirname(os.path.abspath(__file__))
AND = cb.ANDAR
TER = 4.2
CAT = "predios_tropicais"
ESTILO = "tropical"
FONTE = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONTE_SERIF = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
EST = {}  # chave da estampa → índice do material


def caixa(*a, seg=2, **k):
    """mb.caixa com bisel de 2 segmentos (o padrão de 3 pesa demais em escala de prédio)."""
    return mb.caixa(*a, seg=seg, **k)


def cilindro(r, a, seg=14, bisel=0.0, **k):
    return mb.cilindro(r, a, seg=seg, bisel=bisel, **k)


# =====================================================================================================================
# Malha livre (faces com cor/material próprios, sem recalcular normais)
# =====================================================================================================================
class Malha:
    def __init__(self):
        mb.materiais()
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("UVMap")
        self.n = 0

    def f(self, pts, cor=None, mat="atlas", uvs=None, normal=None):
        vs = [self.bm.verts.new(tuple(p)) for p in pts]
        fa = self.bm.faces.new(vs)
        fa.material_index = mb._mat_idx(mat)
        u = mb.uv_cor(cor) if cor else (0.5, 0.5)
        for k, lo in enumerate(fa.loops):
            lo[self.uv].uv = uvs[k] if uvs else u
        if normal is not None:
            fa.normal_update()
            if fa.normal.dot(V(normal)) < 0:
                fa.normal_flip()
        self.n += 1
        return fa

    def obj(self, nome="malha", liso=False, angulo=35):
        if not self.n:
            self.bm.free()
            return None
        bm = self.bm
        bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
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


# =====================================================================================================================
# Contornos 2D
# =====================================================================================================================
def ccw(pts):
    return mb._ccw([(float(p[0]), float(p[1])) for p in pts])


def offset(pts, d):
    """Contorno fechado deslocado d para fora (d < 0: para dentro). Devolve anti-horário, alinhado com ccw(pts)."""
    P = [V(p) for p in ccw(pts)]
    n = len(P)
    out = []
    for i in range(n):
        a, b, c = P[i - 1], P[i], P[(i + 1) % n]
        e1, e2 = b - a, c - b
        if e1.length < 1e-9:
            e1 = e2
        if e2.length < 1e-9:
            e2 = e1
        e1 = e1.normalized()
        e2 = e2.normalized()
        n1, n2 = V((e1.y, -e1.x)), V((e2.y, -e2.x))
        m = n1 + n2
        m = n1 if m.length < 1e-6 else m.normalized()
        q = b + m * (d / max(0.4, m.dot(n1)))
        out.append((q.x, q.y))
    return out


def rret(l, p, r, cx=0.0, cy=0.0, seg=6):
    return [(x + cx, y + cy) for x, y in mb.ret_arredondado(l, p, r, seg)]


def oval(rx, ry, n=32, cx=0.0, cy=0.0):
    return [(cx + rx * math.cos(2 * math.pi * k / n), cy + ry * math.sin(2 * math.pi * k / n)) for k in range(n)]


def superelipse(a, b, expo=4.0, n=48, cx=0.0, cy=0.0, deform=None):
    pts = []
    for k in range(n):
        t = 2 * math.pi * k / n
        c, s = math.cos(t), math.sin(t)
        x = a * math.copysign(abs(c) ** (2 / expo), c)
        y = b * math.copysign(abs(s) ** (2 / expo), s)
        if deform:
            x, y = deform(x, y)
        pts.append((x + cx, y + cy))
    return pts


def comprimentos(pts):
    cum = [0.0]
    for a, b in zip(pts, pts[1:]):
        cum.append(cum[-1] + (V(b) - V(a)).length)
    return cum


def sub_linha(pts, s0, s1, n=30):
    """Trecho de uma linha aberta entre as frações s0 e s1 do comprimento, com n+1 pontos."""
    P = [V((p[0], p[1])) for p in pts]
    cum = comprimentos(P)
    L = cum[-1]
    out = []
    for k in range(n + 1):
        s = (s0 + (s1 - s0) * k / n) * L
        i = min(len(P) - 2, max(0, bisect.bisect_right(cum, s) - 1))
        t = (s - cum[i]) / max(1e-9, cum[i + 1] - cum[i])
        q = P[i].lerp(P[i + 1], min(1.0, max(0.0, t)))
        out.append((q.x, q.y))
    return out


def contorno_faixa(centro, larg, n_tampa=8):
    """Contorno de uma faixa de largura 'larg' em volta de uma linha aberta, com pontas arredondadas."""
    C = [V((p[0], p[1])) for p in centro]
    n, hw = len(C), larg / 2
    T = [(C[min(i + 1, n - 1)] - C[max(i - 1, 0)]).normalized() for i in range(n)]
    N = [V((-t.y, t.x)) for t in T]
    esq = [C[i] + N[i] * hw for i in range(n)]
    dir_ = [C[i] - N[i] * hw for i in range(n)]
    a_fim = math.atan2(N[-1].y, N[-1].x)
    a_ini = math.atan2(N[0].y, N[0].x)
    fim = [C[-1] + V((math.cos(a_fim - math.pi * k / n_tampa), math.sin(a_fim - math.pi * k / n_tampa))) * hw
           for k in range(1, n_tampa)]
    ini = [C[0] + V((math.cos(a_ini - math.pi - math.pi * k / n_tampa),
                     math.sin(a_ini - math.pi - math.pi * k / n_tampa))) * hw for k in range(1, n_tampa)]
    pts = esq + fim + dir_[::-1] + ini
    return ccw([(q.x, q.y) for q in pts])


def normal_contorno(P, i):
    """Normal para fora do contorno anti-horário P no segmento i → i+1."""
    a, b = V(P[i]), V(P[(i + 1) % len(P)])
    t = (b - a)
    t = t.normalized() if t.length > 1e-9 else V((1, 0))
    return V((t.y, -t.x))


# =====================================================================================================================
# Sólidos e faixas
# =====================================================================================================================
def bloco(pts, z, a, cor, bisel=0.0, seg=2, liso=True, mat="atlas", nome="bloco"):
    return mb.extrudado(ccw(pts), a, z=z, cor=cor, bisel=bisel, seg=seg, liso=liso, mat=mat, nome=nome)


def fita(pts, z0, z1, cor=None, mat="atlas", m=None, dentro=False):
    """Faixa vertical (uma face por segmento) ao longo de um contorno fechado."""
    proprio = m is None
    m = m or Malha()
    P = ccw(pts)
    n = len(P)
    for i in range(n):
        a, b = P[i], P[(i + 1) % n]
        q = [(a[0], a[1], z0), (b[0], b[1], z0), (b[0], b[1], z1), (a[0], a[1], z1)]
        m.f(q[::-1] if dentro else q, cor, mat)
    return m.obj("fita", liso=True) if proprio else None


def anel(pts, w, z, cor, m, baixo=False):
    """Coroa horizontal entre o contorno e ele recuado w para dentro."""
    E = ccw(pts)
    I = offset(E, -w)
    n = len(E)
    for i in range(n):
        j = (i + 1) % n
        q = [(E[i][0], E[i][1], z), (E[j][0], E[j][1], z), (I[j][0], I[j][1], z), (I[i][0], I[i][1], z)]
        m.f(q[::-1] if baixo else q, cor)


def parapeito(pts, z, alt, esp, cor, m):
    """Mureta: face de fora no contorno, face de dentro recuada esp, e a tampa."""
    E = ccw(pts)
    fita(E, z, z + alt, cor, m=m)
    fita(offset(E, -esp), z, z + alt, cor, m=m, dentro=True)
    anel(E, esp, z + alt, cor, m)


def guarda_vidro(pts, z, alt, corrimao, m):
    """Guarda-corpo de vidro com corrimão chato colorido por cima."""
    E = ccw(pts)
    fita(E, z, z + alt - 0.06, mat="vidro", m=m)
    fita(offset(E, 0.03), z + alt - 0.1, z + alt, corrimao, m=m)


def vidros_contorno(pts, z0, z1, passo=2.3, vao=0.22, semente=1, apagadas=0.45, frias=0.25, saliente=0.03,
                    filtro=None, nome="vidros"):
    """Janelas em volta de um contorno fechado (fachada curva): cada painel é um vidro próprio, com o material
    sorteado entre janela_apagada, janela_fria e janela. filtro(meio, normal) → False pula o painel."""
    P = [V(p) for p in offset(ccw(pts), saliente)]
    n = len(P)
    lens = [(P[(i + 1) % n] - P[i]).length for i in range(n)]
    cum = [0.0]
    for le in lens:
        cum.append(cum[-1] + le)
    L = cum[-1]
    k = max(3, round(L / passo))
    rnd = random.Random(semente)

    def ponto(s):
        s = min(max(s, 0.0), L)
        i = min(n - 1, max(0, bisect.bisect_right(cum, s) - 1))
        t = (s - cum[i]) / max(1e-9, lens[i])
        return P[i].lerp(P[(i + 1) % n], t), i

    m = Malha()
    for j in range(k):
        s0, s1 = j * L / k + vao / 2, (j + 1) * L / k - vao / 2
        pa, ia = ponto(s0)
        pb, ib = ponto(s1)
        pl = [pa] + [P[i % n] for i in range(1, n + 1) if s0 < cum[i] < s1] + [pb]
        r = rnd.random()
        mat = "janela_apagada" if r < apagadas else ("janela_fria" if r < apagadas + frias else "janela")
        meio = ponto((s0 + s1) / 2)
        if filtro and not filtro(meio[0], normal_contorno(P, meio[1])):
            continue
        for a, b in zip(pl, pl[1:]):
            if (b - a).length < 1e-4:
                continue
            m.f([(a.x, a.y, z0), (b.x, b.y, z0), (b.x, b.y, z1), (a.x, a.y, z1)], None, mat)
    return m.obj(nome, liso=True, angulo=30)


def fora_frente(x0, x1, ny=-0.5):
    """Filtro: pula os painéis da fachada da frente (normal.y < ny) com x entre x0 e x1."""
    return lambda p, nrm: not (nrm.y < ny and x0 <= p.x <= x1)


def superficie_grossa(P, nu, nv, esp, cor, nome="placa", mat="atlas"):
    """Placa curva com espessura: P(u, v) → Vector, u e v de 0 a 1."""
    G = [[V(P(i / nu, j / nv)) for i in range(nu + 1)] for j in range(nv + 1)]
    bm = bmesh.new()
    A, B = [], []
    for j in range(nv + 1):
        ra, rb = [], []
        for i in range(nu + 1):
            du = G[j][min(i + 1, nu)] - G[j][max(i - 1, 0)]
            dv = G[min(j + 1, nv)][i] - G[max(j - 1, 0)][i]
            nn = du.cross(dv)
            nn = nn.normalized() if nn.length > 1e-9 else V((0, 0, 1))
            ra.append(bm.verts.new(G[j][i] + nn * esp / 2))
            rb.append(bm.verts.new(G[j][i] - nn * esp / 2))
        A.append(ra)
        B.append(rb)
    for j in range(nv):
        for i in range(nu):
            bm.faces.new((A[j][i], A[j][i + 1], A[j + 1][i + 1], A[j + 1][i]))
            bm.faces.new((B[j][i], B[j + 1][i], B[j + 1][i + 1], B[j][i + 1]))
        bm.faces.new((A[j][0], A[j + 1][0], B[j + 1][0], B[j][0]))
        bm.faces.new((A[j][nu], B[j][nu], B[j + 1][nu], A[j + 1][nu]))
    for i in range(nu):
        bm.faces.new((A[0][i], B[0][i], B[0][i + 1], A[0][i + 1]))
        bm.faces.new((A[nv][i], A[nv][i + 1], B[nv][i + 1], B[nv][i]))
    return mb._obj(nome, bm, cor, mat, liso=True, angulo=55)


def tronco_piramide(l0, p0, l1, p1, z, a, cor, x=0.0, y=0.0, nome="tronco"):
    """Tronco de pirâmide retangular (telhado de quatro águas aparado)."""
    bm = bmesh.new()
    b = [bm.verts.new((x + sx * l0 / 2, y + sy * p0 / 2, z)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    t = [bm.verts.new((x + sx * l1 / 2, y + sy * p1 / 2, z + a)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    bm.faces.new(b[::-1])
    bm.faces.new(t)
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((b[i], b[j], t[j], t[i]))
    mb._bevel(bm, min(0.06, a / 3), 2)
    return mb._obj(nome, bm, cor, liso=True, angulo=40)


# =====================================================================================================================
# Letreiros
# =====================================================================================================================
def letras(texto, alt, x, y, z, mat="luz", cor=None, prof=0.14, larg_max=None, rot=0.0, fonte=FONTE):
    """Letras em relevo (texto do Blender convertido em malha) de pé, viradas para −Y (antes de girar 'rot' rad em
    volta de Z). (x, y, z) = centro da base; y é o meio da espessura."""
    f = bpy.data.fonts.load(fonte, check_existing=True)
    cu = bpy.data.curves.new("txt", "FONT")
    cu.body = texto
    cu.font = f
    cu.size = 1.0
    cu.extrude = prof / 2
    cu.resolution_u = 2
    cu.align_x = "CENTER"
    ob = bpy.data.objects.new("txt", cu)
    bpy.context.scene.collection.objects.link(ob)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    bpy.data.objects.remove(ob)
    bpy.data.curves.remove(cu)
    bm = bmesh.new()
    bm.from_mesh(me)
    bpy.data.meshes.remove(me)
    xs = [v.co.x for v in bm.verts]
    ys = [v.co.y for v in bm.verts]
    w, h = max(xs) - min(xs), max(ys) - min(ys)
    s = alt / h
    if larg_max and w * s > larg_max:
        s = larg_max / w
    M = (Matrix.Translation((x, y, z)) @ Matrix.Rotation(rot, 4, "Z") @ Matrix.Rotation(math.pi / 2, 4, "X") @
         Matrix.Diagonal((s, s, 1.0, 1.0)) @ Matrix.Translation((-(max(xs) + min(xs)) / 2, -min(ys), 0)))
    bm.transform(M)
    return mb._obj("letras", bm, cor, mat, liso=False)


def letras_curva(texto, alt, x0, x1, yf, z, mat="luz", prof=0.16, fonte=FONTE, folga=0.02):
    """Uma letra por vez ao longo da curva y = yf(x) (fachada curva vista de frente), acompanhando a tangente."""
    objs = []
    n = len(texto)
    for i, ch in enumerate(texto):
        if ch == " ":
            continue
        x = x0 + (x1 - x0) * (i + 0.5) / n
        d = (yf(x + 0.01) - yf(x - 0.01)) / 0.02
        rot = math.atan(d)
        nrm = V((math.sin(rot), -math.cos(rot)))  # para fora (−Y girado)
        p = V((x, yf(x))) + nrm * (prof / 2 + folga)
        objs.append(letras(ch, alt, p.x, p.y, z, mat=mat, prof=prof, rot=rot, fonte=fonte))
    return objs


def material_estampa_luz(chave):
    """Material de estampa (PNG do letreiro) com a textura também na emissão, para acender à noite."""
    if chave in EST:
        return EST[chave]
    png = os.path.join(PASTA_EST, chave + ".png")
    idx = mb.material_estampa("tropical_" + chave, png)
    m = bpy.data.materials[mb.MAT_NOMES[idx]]
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    tx = [n for n in nt.nodes if n.type == "TEX_IMAGE"][0]
    if not b.inputs["Emission Color"].is_linked:
        nt.links.new(tx.outputs["Color"], b.inputs["Emission Color"])
    b.inputs["Emission Strength"].default_value = 0.9
    EST[chave] = idx
    return idx


def placa(chave, l, a, x, y, z, face=-1, moldura="branco", esp=0.12, eixo="y"):
    """Placa de letreiro com estampa, presa na fachada (eixo "y": plano y, olhando para face·Y; eixo "x": plano x,
    olhando para face·X). (x, y) = ponto na parede, z = base da arte."""
    mi = material_estampa_luz(chave)
    if eixo == "y":
        fr = caixa(l + 0.18, esp, a + 0.18, x=x, y=y + face * esp / 2, z=z - 0.09, cor=moldura, bisel=0.04)
        yf = y + face * (esp + 0.004)
        xs = (x - l / 2, x + l / 2) if face < 0 else (x + l / 2, x - l / 2)
        pts = [(xs[0], yf, z), (xs[1], yf, z), (xs[1], yf, z + a), (xs[0], yf, z + a)]
    else:
        fr = caixa(esp, l + 0.18, a + 0.18, x=x + face * esp / 2, y=y, z=z - 0.09, cor=moldura, bisel=0.04)
        xf = x + face * (esp + 0.004)
        ys = (y + l / 2, y - l / 2) if face < 0 else (y - l / 2, y + l / 2)
        pts = [(xf, ys[0], z), (xf, ys[1], z), (xf, ys[1], z + a), (xf, ys[0], z + a)]
    m = Malha()
    m.f(pts, mat=mi, uvs=[(0, 0), (1, 0), (1, 1), (0, 1)])
    return [fr, m.obj("placa")]


def letreiro(texto, alt, x, y, z, fundo="grafite_escuro", mat="luz", larg=None, prof_fundo=0.18, face=-1,
             fonte=FONTE, margem=0.28):
    """Letras em relevo (luz/neon) sobre uma placa boleada colorida presa na fachada em y (face −1 = frente)."""
    lt = letras(texto, alt, x, 0, 0, mat=mat, prof=0.14, larg_max=larg, fonte=fonte)
    lo, hi = mb.bbox(lt)
    w = hi.x - lo.x
    lt.data.transform(Matrix.Translation((0, y + face * (prof_fundo + 0.07), z)))
    if face > 0:
        lt.data.transform(Matrix.Translation((-x, -y - face * (prof_fundo + 0.07), 0)))
        lt.data.transform(Matrix.Rotation(math.pi, 4, "Z"))
        lt.data.transform(Matrix.Translation((x, y + face * (prof_fundo + 0.07), 0)))
    out = [lt]
    if fundo:
        out.append(caixa(w + 2 * margem, prof_fundo, alt + 2 * margem, x=x, y=y + face * prof_fundo / 2,
                            z=z - margem, cor=fundo, bisel=0.08))
    return out


# =====================================================================================================================
# Peças pequenas: portas, toldos, palmeiras, equipamentos
# =====================================================================================================================
def porta_vidro(x, y, z=0.0, l=1.8, a=2.5, face=-1, moldura="branco", eixo="y"):
    if eixo == "y":
        return [caixa(l + 0.3, 0.16, a + 0.15, x=x, y=y + face * 0.06, z=z, cor=moldura, bisel=0.04),
                caixa(l, 0.04, a, x=x, y=y + face * 0.15, z=z, cor=None, mat="vidro", bisel=0.0),
                caixa(0.07, 0.05, a, x=x, y=y + face * 0.16, z=z, cor=moldura, bisel=0.0),
                caixa(0.05, 0.08, 0.5, x=x - 0.15, y=y + face * 0.2, z=z + 1.0, cor="cromo", bisel=0.01),
                caixa(0.05, 0.08, 0.5, x=x + 0.15, y=y + face * 0.2, z=z + 1.0, cor="cromo", bisel=0.01)]
    return [caixa(0.16, l + 0.3, a + 0.15, x=x + face * 0.06, y=y, z=z, cor=moldura, bisel=0.04),
            caixa(0.04, l, a, x=x + face * 0.15, y=y, z=z, cor=None, mat="vidro", bisel=0.0),
            caixa(0.05, 0.07, a, x=x + face * 0.16, y=y, z=z, cor=moldura, bisel=0.0)]


def toldo(x, y, z, larg, proj=1.2, queda=0.55, cores=("branco", "vermelho_claro"), face=-1, listra=0.55, saia=0.3):
    """Toldo listrado inclinado, com a saia recortada em ondas, preso na parede y (face −1 = frente)."""
    m = Malha()
    n = max(2, round(larg / listra))
    w = larg / n
    yb, zb = y + face * proj, z - queda
    for i in range(n):
        x0 = x - larg / 2 + i * w
        x1, xm = x0 + w, x0 + w / 2
        c = cores[i % 2]
        m.f([(x0, y, z), (x1, y, z), (x1, yb, zb), (x0, yb, zb)], c, normal=(0, face, 1))
        m.f([(x0, yb, zb), (x1, yb, zb), (x1, yb, zb - saia * 0.65), (xm, yb, zb - saia), (x0, yb, zb - saia * 0.65)],
            c, normal=(0, face, 0))
    for sx in (-1, 1):
        xx = x + sx * larg / 2
        m.f([(xx, y, z), (xx, yb, zb), (xx, yb, zb - saia * 0.65)], cores[0], normal=(sx, 0, 0))
    return [m.obj("toldo"), caixa(larg + 0.1, 0.12, 0.12, x=x, y=y + face * 0.06, z=z - 0.06, cor=cores[1],
                                     bisel=0.03)]


def palmeira(x, y, z=0.0, alt=5.0, inc=(0.5, 0.2), esc=1.0, sem=0, folhas=("folha", "folha_clara"), nf=8):
    """Palmeira fofa: tronco curvo com anéis, copa com folhas largas que sobem e caem, e cocos."""
    rnd = random.Random(sem)
    pts = [V((x + inc[0] * t * t, y + inc[1] * t * t, z + alt * t)) for t in (i / 6 for i in range(7))]
    top = pts[-1]
    objs = [mb.tubo([tuple(p) for p in pts], 0.17 * esc, cor="caramelo", seg=8)]
    for i in (2, 3, 4, 5):
        p = pts[i]
        objs.append(cilindro(0.2 * esc, 0.1, x=p.x, y=p.y, z=p.z - 0.05, cor="madeira_clara", seg=8))
    objs.append(mb.esfera(0.34 * esc, top.x, top.y, top.z, cor="folha_escura", seg=8))
    for c in range(3):
        a = 2 * math.pi * c / 3 + 0.4
        objs.append(mb.esfera(0.16 * esc, top.x + 0.28 * esc * math.cos(a), top.y + 0.28 * esc * math.sin(a),
                              top.z - 0.28 * esc, cor="marrom", seg=6))
    m = Malha()
    for f in range(nf):
        a = 2 * math.pi * f / nf + rnd.uniform(-0.2, 0.2)
        d = V((math.cos(a), math.sin(a), 0))
        s = V((-math.sin(a), math.cos(a), 0))
        L = (2.3 + rnd.uniform(-0.2, 0.35)) * esc
        W = 0.6 * esc
        up = (0.9 + rnd.uniform(-0.25, 0.25)) * esc
        cor = folhas[f % 2]
        prev = None
        for i in range(7):
            t = i / 6
            c = top + d * (L * t) + V((0, 0, up * t - (up + 1.1 * esc) * t * t))
            w = W * max(0.0, math.sin(math.pi * min(1.0, 0.1 + t * 0.9))) ** 0.6
            dip = V((0, 0, 0.25 * w))
            row = (c + s * w - dip, c, c - s * w - dip)
            if prev:
                m.f([prev[0], row[0], row[1], prev[1]], cor, normal=(0, 0, 1))
                m.f([prev[1], row[1], row[2], prev[2]], cor, normal=(0, 0, 1))
            prev = row
    objs.append(m.obj("folhas", liso=True, angulo=70))
    return objs


def moita(x, y, z, r=0.5, cor="folha"):
    return mb.esfera(r, x, y, z + r * 0.6, cor=cor, esc=(1, 1, 0.8), seg=8)


def arvore_redonda(x, y, z, esc=1.0, cor="folha"):
    return [cilindro(0.09 * esc, 0.9 * esc, x=x, y=y, z=z, cor="madeira", seg=8),
            mb.esfera(0.6 * esc, x, y, z + 1.25 * esc, cor=cor, esc=(1, 1, 0.9), seg=10)]


def casa_maquinas(x, y, z, l=2.6, p=2.0, a=1.8, cor="cinza_claro", porta="grafite"):
    return [caixa(l, p, a, x=x, y=y, z=z, cor=cor, bisel=0.1),
            caixa(l + 0.2, p + 0.2, 0.18, x=x, y=y, z=z + a, cor="branco", bisel=0.06),
            caixa(0.8, 0.05, 1.4, x=x, y=y - p / 2 - 0.01, z=z, cor=porta, bisel=0.01)]


def caixa_dagua(x, y, z, r=0.75, a=1.3, cor="branco"):
    return [cilindro(r, a, x=x, y=y, z=z + 0.5, cor=cor, seg=16, bisel=0.06),
            cilindro(r + 0.05, 0.12, x=x, y=y, z=z + 0.5 + a, cor="cinza_claro", seg=16, bisel=0.03),
            caixa(r * 1.4, r * 1.4, 0.5, x=x, y=y, z=z, cor="concreto_escuro", bisel=0.04)]


def antena(x, y, z, a=2.5):
    return [cilindro(0.05, a, x=x, y=y, z=z, cor="metal", seg=6),
            mb.esfera(0.09, x, y, z + a, cor="vermelho", seg=8)]


def telhado_plano(it, C, z, cor_mureta, cor_piso, alt=0.7, esp=0.25, laje=0.3):
    """Laje de cobertura com mureta e piso colorido do terraço. Devolve o z do piso."""
    it.add(bloco(C, z, laje, cor_mureta))
    m = Malha()
    parapeito(C, z + laje, alt, esp, cor_mureta, m)
    it.add(m.obj("mureta", liso=True))
    it.add(bloco(offset(C, -esp - 0.01), z + laje - 0.02, 0.07, cor_piso))
    return z + laje + 0.05


def andar_curvo(it, C, Cn, z, alt, laje, borda, nucleo, sem, esp=0.34, passo=2.2, guarda="vidro", corrimao=None,
                filtro=None, apagadas=0.45, frias=0.25, vao=0.22):
    """Um andar de prédio curvo: laje de varanda (contorno C) com a lateral pintada na cor do friso, núcleo (Cn) em
    fita com faixa de vidro e guarda-corpo. O núcleo entra nas lajes de baixo e de cima, então não há fresta."""
    lj = bloco(C, z, esp, laje, bisel=0.1, seg=1)
    if borda:
        mb.pinta_onde(lj, borda, lambda c, nn: abs(nn.z) < 0.3)
    it.add(lj)
    it.add(fita(Cn, z + esp - 0.05, z + alt + 0.05, nucleo))
    it.add(vidros_contorno(Cn, z + esp + 0.32, z + alt - 0.32, passo=passo, vao=vao, semente=sem, filtro=filtro,
                           apagadas=apagadas, frias=frias))
    if guarda:
        m = Malha()
        if guarda == "vidro":
            guarda_vidro(offset(C, -0.12), z + esp, 1.0, corrimao or borda or laje, m)
        else:
            parapeito(offset(C, -0.04), z + esp, 0.85, 0.14, guarda, m)
        it.add(m.obj("guarda", liso=True))


def centraliza(it):
    """Leva o centro da projeção (XY) para a origem. Devolve o deslocamento aplicado."""
    lo, hi = mb.bbox(it.partes)
    d = V((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, 0))
    for o in it.partes:
        o.data.transform(Matrix.Translation(d))
    return d, lo, hi


# =====================================================================================================================
# Grandes
# =====================================================================================================================
def torre_vela(it, laje="laranja", nucleo="laranja_claro", borda="branco", vela="branco", base="pessego",
               letra="luz", sinal="hotel_laranja", sem=11):
    """Torre alta de costelas (lajes ovais em forma de ovo) com a vela curva branca subindo pela frente e abrindo
    em cima, como uma asa, sobre a cobertura."""
    n = 10
    zb = 0.6
    it.add(bloco(oval(6.3, 5.9, 40, 0, 0.25), 0, zb, base, bisel=0.18, seg=2))
    it.add(bloco(oval(6.0, 5.6, 40, 0, 0.25), zb - 0.02, 0.12, borda))
    lob = oval(3.9, 3.5, 32)
    it.add(bloco(lob, zb - 0.02, TER + 0.05, nucleo))
    it.add(vidros_contorno(lob, zb + 0.4, zb + TER - 0.55, passo=1.9, vao=0.2, semente=sem, apagadas=0.3, frias=0.2,
                           filtro=fora_frente(-1.3, 1.3)))
    it.add(porta_vidro(0, -3.42, zb, l=1.8, a=2.7, moldura=borda))
    z0 = zb + TER

    def raio_t(t):
        f = math.sin(math.pi * (0.1 + 0.8 * t))
        return 4.1 + 1.85 * f, 3.75 + 1.6 * f

    def raio_z(z):
        return raio_t(min(1.0, max(0.0, (z - z0) / (AND * (n - 1)))))

    for k in range(n):
        z = z0 + k * AND
        rx, ry = raio_t(k / (n - 1))
        andar_curvo(it, oval(rx, ry, 32), oval(rx - 1.15, ry - 1.15, 32), z, AND, laje, borda, nucleo, sem + k,
                    passo=2.0)
    zt = z0 + n * AND
    rx, ry = raio_t(1.0)
    zp = telhado_plano(it, oval(rx - 0.25, ry - 0.25, 32), zt, laje, borda, alt=0.6)
    it.add(casa_maquinas(0.6, 0.8, zp, 2.4, 1.8, 1.7))
    it.add(antena(-1.2, 1.0, zp, 2.2))
    # vela: placa curva colada na frente (y = −(ry + 0,55)) que sobe e, no alto, abre e vira para trás como asa
    vt, zs0 = 0.74, 0.2

    def P(u, v):
        uu = 2 * u - 1
        if v <= vt:
            z = zs0 + (zt + 0.3 - zs0) * (v / vt)
            rx_, ry_ = raio_z(z)
            W = 1.7 + 0.9 * (v / vt)
            x = uu * W / 2
            y = -(ry_ + 0.6) * math.sqrt(max(0.0, 1 - (x / (rx_ + 0.6)) ** 2))
            return V((x, y, z))
        s = (v - vt) / (1 - vt)
        rx_, ry_ = raio_z(zt)
        W = 2.6 + 8.6 * math.sin(s * math.pi / 2) ** 1.3
        x = uu * W / 2 + 0.7 * s ** 2
        y0 = -(ry_ + 0.6)
        yc = y0 + (ry_ + 5.2) * (1 - math.cos(s * math.pi / 2))
        zc = zt + 0.3 + 3.6 * math.sin(s * math.pi / 2)
        yf = -(ry_ + 0.6) * math.sqrt(max(0.0, 1 - (uu * W / 2 / (rx_ + 0.6)) ** 2))
        dy = (yf - y0) * (1 - s) ** 2
        zc += 1.1 * s ** 1.5 * uu ** 2 + 0.6 * s * uu
        yc -= 1.4 * s ** 2 * uu ** 2
        return V((x, yc + dy, zc))

    it.add(superficie_grossa(P, 8, 44, 0.36, vela, nome="vela"))
    # letreiro vertical HOTEL na vela, letra por letra
    for i, ch in enumerate("HOTEL"):
        z = zb + TER + 2.2 + (4 - i) * 1.25
        rx_, ry_ = raio_z(z)
        it.add(letras(ch, 0.95, 0, -(ry_ + 0.6) - 0.18 - 0.08, z, mat=letra, prof=0.16, fonte=FONTE_SERIF))
    it.add(placa(sinal, 2.4, 0.6, 0, -3.5, zb + 2.95, moldura=borda))
    return dict(lote=[1, 1], andares=n + 1,
                col=[((0, 0.25, 0), (12.6, 11.8, zb)), ((0, 0, zb), (11.6, 10.6, zt + 1.0 - zb)),
                     ((0, 0.5, zt + 1.0), (12.0, 8.0, 4.6))])


def predio_s(it, laje="rosa_claro", nucleo="rosa_bebe", terreo="salmao", topo="rosa", sem=21,
             bordas=("salmao", "amarelo_claro", "turquesa_claro", "lilas", "menta", "rosa", "pessego", "vermelho_claro")):
    """Prédio em S: andares sinuosos que vão encurtando nas pontas e deixam terraços em cascata com plantas."""
    Rx, Ry = 6.2, 4.9
    linha = []
    for i in range(61):
        th = math.radians(270 * i / 60)
        linha.append((Rx * math.cos(th), Ry + Ry * math.sin(th)))
    for i in range(1, 61):
        th = math.radians(90 - 270 * i / 60)
        linha.append((Rx * math.cos(th), -Ry + Ry * math.sin(th)))
    linha = [(-x, y) for x, y in linha]  # S de verdade: a ponta de cima abre para a direita
    n = 7
    LL, LN = 6.4, 4.2
    a = [0.0] + [0.035 + 0.042 * k for k in range(1, n + 2)]
    rng = [(a[k], 1 - a[k]) for k in range(n + 2)]
    # térreo comercial
    G = contorno_faixa(sub_linha(linha, 0.0, 1.0, 44), LN + 0.4)
    it.add(bloco(G, 0, TER + 0.05, terreo))
    it.add(vidros_contorno(G, 0.45, TER - 0.6, passo=2.4, vao=0.35, semente=sem, apagadas=0.35, frias=0.3))
    pf = sub_linha(linha, 0.5, 0.5, 1)[0]
    it.add(porta_vidro(pf[0], pf[1] - (LN + 0.4) / 2 + 0.02, 0, l=2.0, a=2.7, moldura="branco"))
    for k in range(1, n + 1):
        z = TER + (k - 1) * AND
        s0, s1 = rng[k - 1]
        n0, n1 = rng[k]
        C = contorno_faixa(sub_linha(linha, s0, s1, 34), LL, 7)
        Cn = contorno_faixa(sub_linha(linha, n0, n1, 34), LN, 7)
        andar_curvo(it, C, Cn, z, AND, laje, bordas[k % len(bordas)], nucleo, sem + k, passo=2.4,
                    guarda="vidro", corrimao="branco")
        # plantas nos terraços das pontas (onde o andar de cima já não chega)
        if k > 1:
            for sa in ((s0 + n0) / 2 + 0.004, (s1 + n1) / 2 - 0.004):
                q = sub_linha(linha, sa, sa, 1)[0]
                lado = 1 if (k % 2) else -1
                q2 = sub_linha(linha, sa + 0.003, sa + 0.003, 1)[0]
                t = V((q2[0] - q[0], q2[1] - q[1]))
                t = t.normalized() if t.length > 1e-6 else V((1, 0))
                nrm = V((-t.y, t.x)) * lado
                it.add(moita(q[0] + nrm.x * 1.6, q[1] + nrm.y * 1.6, z + 0.34, 0.45, "folha" if k % 2 else "folha_clara"))
    zt = TER + n * AND
    s0, s1 = rng[n]
    Ct = contorno_faixa(sub_linha(linha, s0, s1, 34), LL - 0.6, 7)
    zp = telhado_plano(it, Ct, zt, "branco", topo, alt=0.55)
    q = sub_linha(linha, 0.5, 0.5, 1)[0]
    it.add(casa_maquinas(q[0], q[1] + 0.4, zp, 2.2, 1.6, 1.6))
    for sa in (0.33, 0.67):
        q = sub_linha(linha, sa, sa, 1)[0]
        it.add(palmeira(q[0], q[1], zp, alt=2.6, inc=(0.3, 0.1), esc=0.7, sem=int(sa * 100)))
    return dict(lote=[2, 2], andares=n + 1,
                col=[((0, 6.5, 0), (18.6, 13.0, zt + 0.9)), ((0, -6.5, 0), (18.6, 13.0, zt + 0.9))])


def torre_branca(it, laje="branco", nucleo="turquesa_claro", borda="turquesa", moldura="branco",
                 lobby="terracota_escura", sem=31):
    """Torre branca e turquesa: moldura branca que abraça a torre, pórtico em arco com o saguão de vidro alaranjado,
    espinha ondulada na frente e coroa com o letreiro."""
    zl = 8.4
    n = 10
    H0 = zl + 0.6
    # saguão de pé-direito duplo com grade de vidro
    it.add(caixa(8.8, 7.6, zl + 0.1, cor=lobby, bisel=0.1))
    it.add(cb.janelas_caixa(8.8, 7.6, 0.25, zl - 0.25, 3, 6, 5, semente=sem, moldura="terracota", larg=0.86,
                            alt=0.86, peitoril=False, apagadas=0.35, frias=0.1))
    it.add(porta_vidro(0, -3.86, 0.0, l=2.2, a=2.8, moldura=moldura))
    # pórtico em arco (frente e fundo) e laterais
    arco_pts = [(4.6 * math.cos(math.radians(a)), 3.0 + 5.2 * math.sin(math.radians(a))) for a in range(0, 181, 9)]
    contorno = [(5.5, 0.0), (5.5, H0), (-5.5, H0), (-5.5, 0.0), (-4.6, 0.0)] + arco_pts[::-1] + [(4.6, 0.0)]
    for y in (-5.0, 4.1):
        it.add(mb.extrudado(ccw(contorno), 0.9, y=y, cor=moldura, bisel=0.14, seg=2, plano="xz"))
    for sx in (-1, 1):
        it.add(caixa(0.9, 8.4, H0, x=sx * 5.05, cor=moldura, bisel=0.12))
    # andares
    for k in range(n):
        z = H0 + k * AND
        andar_curvo(it, rret(11.0, 10.0, 1.4), rret(9.4, 8.4, 0.9), z, AND, laje, borda, nucleo, sem + k, passo=2.0)
    zt = H0 + n * AND
    # moldura que sobe pelas laterais e coroa
    for sx in (-1, 1):
        it.add(caixa(0.7, 8.6, zt + 2.6 - zl, x=sx * 5.85, z=zl, cor=moldura, bisel=0.3))
    zp = telhado_plano(it, rret(10.6, 9.6, 1.2), zt, laje, "cinza_claro", alt=0.6)
    coroa = [(6.2, 0.0), (6.2, 2.6), (-6.2, 2.6), (-6.2, 0.0), (-5.2, 0.0)] + \
            [(5.2 * math.cos(math.radians(a)), 0.4 + 1.5 * math.sin(math.radians(a))) for a in range(180, -1, -15)] + \
            [(5.2, 0.0)]
    coroa = [(x, y + zt) for x, y in coroa]
    for y in (-5.3, 4.3):
        it.add(mb.extrudado(ccw(coroa), 1.0, y=y, cor=moldura, bisel=0.14, seg=2, plano="xz"))
    it.add(letreiro("HOTEL", 0.75, 0, -5.3, zt + 1.5, fundo=None, mat="luz", fonte=FONTE_SERIF))
    it.add(casa_maquinas(0, 1.5, zp, 3.0, 2.2, 1.6))
    it.add(caixa_dagua(-2.8, 1.5, zp))
    # espinha ondulada na frente
    zs0, zs1 = zl - 0.4, zt + 0.2
    ns = 28
    dir_ = [(1.0 + 0.32 * math.sin((zs0 + (zs1 - zs0) * i / ns) * 0.55 + 1.2), zs0 + (zs1 - zs0) * i / ns)
            for i in range(ns + 1)]
    esq = [(-1.0 - 0.32 * math.sin((zs0 + (zs1 - zs0) * i / ns) * 0.55), zs0 + (zs1 - zs0) * i / ns)
           for i in range(ns, -1, -1)]
    it.add(mb.extrudado(ccw(dir_ + esq), 0.5, y=-5.5, cor=moldura, bisel=0.12, seg=2, plano="xz"))
    for i in range(10):  # luzinhas na espinha
        z = zl + 1.2 + i * AND
        it.add(caixa(0.2, 0.14, 0.2, x=0, y=-5.55, z=z, cor=None, mat="luz", bisel=0.05, seg=1))
    return dict(lote=[1, 1], andares=n + 2,
                col=[((0, 0, 0), (11.0, 10.0, H0)), ((0, 0, H0), (12.4, 10.6, zt + 2.6 - H0))])


def hotel_maresia(it, laje="pessego", nucleo="azul_bebe", borda="branco", topo="azul_claro", sem=41):
    """Hotel de duas torres onduladas ligadas por uma ponte com o nome MARESIA em letras luminosas e jardim em cima."""
    n = 9
    for sx in (-1, 1):
        cx = sx * 8.4
        lob = rret(8.6, 9.0, 2.4, cx, 0)
        it.add(bloco(lob, 0, TER + 0.05, "branco"))
        it.add(vidros_contorno(lob, 0.4, TER - 0.5, passo=2.0, vao=0.2, semente=sem + sx, apagadas=0.3, frias=0.2,
                               filtro=lambda p, nr, cx=cx: not (nr.y < -0.5 and abs(p.x - cx) < 1.4)))
        it.add(porta_vidro(cx, -4.5, 0, l=1.8, a=2.6, moldura="azul_claro"))
        for k in range(n):
            z = TER + k * AND
            w = 0.45 * math.sin(k * 1.25 + sx)
            C = rret(10.4 + w, 11.0 - 0.5 * abs(w), 3.2, cx, 0.15 * w, seg=4)
            andar_curvo(it, C, rret(8.2, 8.8, 2.4, cx, 0, seg=4), z, AND, laje, borda, nucleo, sem + k * 3 + sx, passo=2.1,
                        corrimao="branco")
        zt = TER + n * AND
        zp = telhado_plano(it, rret(10.0, 10.6, 3.0, cx, 0), zt, borda, laje, alt=0.6)
        ph = rret(6.6, 7.0, 1.6, cx, 0.5)
        it.add(bloco(ph, zp - 0.02, 2.7, "branco"))
        it.add(vidros_contorno(ph, zp + 0.4, zp + 2.2, passo=1.8, vao=0.3, semente=sem + 7 + sx, apagadas=0.3))
        it.add(bloco(rret(7.6, 8.0, 2.0, cx, 0.5), zp + 2.65, 0.45, topo, bisel=0.12))
        it.add(bloco(rret(4.0, 4.2, 1.0, cx, 0.9), zp + 3.08, 1.5, "branco"))
        it.add(bloco(rret(4.6, 4.8, 1.2, cx, 0.9), zp + 4.55, 0.35, topo, bisel=0.1))
    # pontes: a de cima (2 andares, com o nome) e a de baixo (1 andar)

    def yf_ponte(x, frente=3.4, barriga=0.7):
        return -frente - barriga * math.cos(math.pi * x / 9.2)

    def contorno_ponte(frente, fundo, barriga):
        xs = [-4.6 + 9.2 * i / 20 for i in range(21)]
        return ccw([(x, yf_ponte(x, frente, barriga)) for x in xs] + [(4.6, fundo), (-4.6, fundo)])

    def so_frente_fundo(p, nr):
        return abs(nr.y) > 0.5 and abs(p.x) < 3.2

    for zb, nand, frente, fundo, barriga in ((TER + 5 * AND, 2, 3.2, 3.0, 0.7), (TER + 1 * AND, 1, 2.4, 2.2, 0.4)):
        Cb = contorno_ponte(frente, fundo, barriga)
        Cn = contorno_ponte(frente - 0.9, fundo - 0.9, barriga)
        it.add(bloco(Cb, zb, 0.45, laje, bisel=0.1, seg=1), bloco(offset(Cb, 0.05), zb + 0.12, 0.14, borda))
        it.add(bloco(Cn, zb + 0.43, nand * AND - 0.4, nucleo))
        for j in range(nand):
            it.add(vidros_contorno(Cn, zb + 0.75 + j * AND, zb + (j + 1) * AND - 0.3, passo=2.0, semente=sem + 50 + j,
                                   filtro=so_frente_fundo))
            if j:
                it.add(bloco(Cb, zb + j * AND, 0.3, laje, bisel=0.08, seg=1))
                m = Malha()
                guarda_vidro(offset(Cb, -0.12), zb + j * AND + 0.3, 1.0, "branco", m)
                it.add(m.obj("guarda"))
        zt = zb + nand * AND
        alt_f = 1.3 if nand == 2 else 0.6
        it.add(bloco(Cb, zt, alt_f, "turquesa_escuro" if nand == 2 else laje, bisel=0.12, seg=2))
        if nand == 2:
            it.add(bloco(offset(Cb, 0.06), zt + alt_f - 0.2, 0.2, borda, bisel=0.06, seg=1))
        it.add(bloco(offset(Cb, -0.3), zt + alt_f - 0.02, 0.06, "grama"))
        for x in (-2.4, 0.0, 2.4):
            it.add(arvore_redonda(x, 0.6 * fundo, zt + alt_f, esc=0.8 if nand == 2 else 0.6,
                                  cor="folha" if x else "folha_clara"))
        if nand == 2:
            it.add(letras_curva("MARESIA", 0.85, -3.7, 3.7, lambda x: yf_ponte(x, frente, barriga), zt + 0.22,
                                mat="luz", prof=0.16, fonte=FONTE_SERIF))
    # marquise de entrada entre as torres
    it.add(bloco(rret(7.0, 4.2, 1.2, 0, -3.2), 3.7, 0.35, "branco", bisel=0.1))
    for x in (-2.6, 2.6):
        it.add(cilindro(0.16, 3.72, x=x, y=-4.6, cor="azul_claro", seg=12))
    it.add(placa("hotel_azul", 2.6, 0.62, 0, -5.3, 3.72 - 0.66, moldura="branco"))
    it.add(palmeira(-1.2, -1.5, 0, alt=3.2, esc=0.75, sem=4), palmeira(1.4, -1.0, 0, alt=3.6, inc=(-0.4, 0.2),
                                                                       esc=0.75, sem=5))
    zt = TER + n * AND
    return dict(lote=[2, 1], andares=n + 1,
                col=[((-8.4, 0, 0), (10.9, 11.3, zt + 5.0)), ((8.4, 0, 0), (10.9, 11.3, zt + 5.0)),
                     ((0, -0.2, TER + 5 * AND), (6.0, 7.4, 2 * AND + 1.3))])


def hotel_ondulado(it, laje="branco", nucleo="turquesa_claro", borda="turquesa", topo="pessego", sem=51):
    """Hotel comprido e baixo, de andares ondulados que se deslocam um do outro; a ponta direita é aberta no térreo
    (pilotis), com jardim por baixo."""
    n = 5

    def linha(k):
        dy = 0.38 * (1 if k % 2 else -1) if k > 0 else 0.0
        enc = 0.25 * k
        return [(-9.4 + enc + (18.8 - 2 * enc) * i / 30,
                 1.4 * math.sin((i / 30) * math.pi * 1.5 + 0.35) + dy) for i in range(31)]

    L0 = linha(0)
    G = contorno_faixa(sub_linha(L0, 0.0, 0.6, 20), 5.6)
    it.add(bloco(G, 0, TER + 0.05, nucleo))
    it.add(vidros_contorno(G, 0.4, TER - 0.5, passo=2.2, vao=0.25, semente=sem, apagadas=0.3, frias=0.2))
    q = sub_linha(L0, 0.3, 0.3, 1)[0]
    it.add(porta_vidro(q[0], q[1] - 2.65, 0, l=2.0, a=2.7, moldura="branco"))
    for s in (0.68, 0.8, 0.92):  # pilotis
        q = sub_linha(L0, s, s, 1)[0]
        for lado in (-1, 1):
            it.add(cilindro(0.32, TER + 0.05, x=q[0], y=q[1] + lado * 2.2, cor="branco", seg=14, bisel=0.05))
    for s in (0.74, 0.86):
        q = sub_linha(L0, s, s, 1)[0]
        it.add(bloco(oval(1.4, 0.9, 16, q[0], q[1]), 0, 0.45, "calcada", bisel=0.08))
        it.add(moita(q[0] - 0.4, q[1], 0.4, 0.55), moita(q[0] + 0.5, q[1] + 0.2, 0.4, 0.45, "folha_clara"))
    for k in range(1, n + 1):
        z = TER + (k - 1) * AND
        Lk = linha(k)
        C = contorno_faixa(Lk, 7.4, 7)
        Cn = contorno_faixa(sub_linha(Lk, 0.02, 0.98, 30), 5.4, 7)
        andar_curvo(it, C, Cn, z, AND, laje, borda, nucleo, sem + k, passo=2.2, corrimao="branco")
    zt = TER + n * AND
    Lt = linha(n)
    zp = telhado_plano(it, contorno_faixa(Lt, 7.0, 7), zt, laje, topo, alt=0.6)
    for s, xx in ((0.3, 0), (0.62, 0)):
        q = sub_linha(Lt, s, s, 1)[0]
        it.add(casa_maquinas(q[0], q[1], zp, 2.4, 1.8, 1.5))
    q = sub_linha(Lt, 0.85, 0.85, 1)[0]
    it.add(palmeira(q[0], q[1], zp, alt=2.6, esc=0.7, sem=9))
    q = sub_linha(L0, 0.13, 0.13, 1)[0]
    it.add(letreiro("HOTEL", 0.62, q[0], q[1] - 2.8, TER - 1.25, fundo="turquesa_escuro", mat="luz", fonte=FONTE_SERIF,
                    margem=0.2))
    return dict(lote=[2, 1], andares=n + 1,
                col=[((-6.5, 0, 0), (14.0, 11.0, zt + 1.0)), ((6.5, 0, TER), (14.0, 11.0, zt + 1.0 - TER))])


# =====================================================================================================================
# Médio residencial
# =====================================================================================================================
def predio_varandas(it, laje="branco", nucleo="amarelo_claro", borda="salmao", terreo="salmao",
                    toldo_c=("branco", "salmao"), sem=61):
    """Prédio residencial de varandas onduladas: cada andar tem uma barriga na frente, alternando o lado."""
    n = 6
    G = rret(10.6, 9.4, 1.2)
    it.add(bloco(G, 0, TER + 0.05, terreo))
    for x0, x1 in ((-4.6, -1.3), (1.3, 4.6)):
        it.add(cb.janelas(("y", -4.7, -1), x0, x1, 0.55, 3.2, 1, 1, larg=0.9, alt=0.9, moldura="branco",
                          semente=sem, apagadas=0.3, frias=0.3, peitoril=False))
    it.add(cb.janelas(("x", -5.3, -1), -3.6, 3.6, 1.0, 3.2, 2, 1, larg=0.75, alt=0.8, semente=sem + 1),
           cb.janelas(("x", 5.3, 1), -3.6, 3.6, 1.0, 3.2, 2, 1, larg=0.75, alt=0.8, semente=sem + 2))
    it.add(porta_vidro(0, -4.7, 0, l=1.7, a=2.6))
    it.add(toldo(-2.95, -4.7, 3.75, 3.6, cores=toldo_c), toldo(2.95, -4.7, 3.75, 3.6, cores=toldo_c))
    for k in range(n):
        z = TER + k * AND
        xk = -2.4 if k % 2 == 0 else 2.4

        def deform(x, y, xk=xk):
            if y < 0:
                y -= 1.05 * math.exp(-((x - xk) / 2.4) ** 2) * min(1.0, -y / 3.0)
            return x, y

        C = superelipse(5.5, 4.85, 4.0, 56, deform=deform)
        andar_curvo(it, C, rret(9.4, 8.0, 1.0), z, AND, laje, borda, nucleo, sem + k, passo=1.9, vao=0.35,
                    corrimao=borda)
    zt = TER + n * AND
    zp = telhado_plano(it, superelipse(5.3, 4.65, 4.0, 48), zt, laje, borda, alt=0.6)
    it.add(caixa_dagua(2.4, 1.6, zp), casa_maquinas(-1.6, 1.8, zp, 2.6, 1.8, 1.6))
    it.add(palmeira(-3.3, -2.4, zp, alt=2.4, esc=0.6, sem=sem), palmeira(3.4, -2.6, zp, alt=2.0, esc=0.55, sem=sem + 1))
    for x in (-1.2, 0.6):
        it.add(moita(x, -3.2, zp, 0.4, "folha_clara"))
    return dict(lote=[1, 1], andares=n + 1, col=[((0, -0.3, 0), (11.2, 11.0, zt + 1.0))])


# =====================================================================================================================
# Art déco pequenos
# =====================================================================================================================
def deco_andares(it, l, p, r, niveis, parede, faixa, sem, passo=1.95, vao=0.55, filtro=None, z0=0.0, aba=0.22):
    """Corpo art déco: térreo de 4,2 m + andares de 3,2 m com 'sobrancelhas' boleadas em cada andar e janelas
    corridas que dobram as quinas arredondadas. Devolve o z do topo."""
    z = z0
    C = rret(l, p, r)
    for k in range(niveis):
        h = TER if k == 0 else AND
        it.add(bloco(C, z, h + 0.04, parede))
        if k > 0:
            it.add(vidros_contorno(C, z + 0.75, z + h - 0.6, passo=passo, vao=vao, semente=sem + k, filtro=filtro,
                                   apagadas=0.47))
        it.add(bloco(rret(l + 2 * aba, p + 2 * aba, r + aba), z + h - 0.27, 0.27, faixa, bisel=0.1, seg=2))
        z += h
    return z


def terreo_deco(it, l, p, r, sem, porta_l=1.8, moldura="branco", x_porta=0.0, apagadas=0.3):
    """Vitrines do térreo (vidro aceso à noite) em volta, deixando o vão da porta."""
    C = rret(l, p, r)
    it.add(vidros_contorno(C, 0.6, 3.0, passo=2.3, vao=0.4, semente=sem, apagadas=apagadas, frias=0.3,
                           filtro=fora_frente(x_porta - porta_l / 2 - 0.5, x_porta + porta_l / 2 + 0.5)))
    it.add(porta_vidro(x_porta, -p / 2, 0, l=porta_l, a=2.6, moldura=moldura))


def deco_faixa(it, parede="amarelo_claro", faixa="turquesa", topo="laranja_claro", detalhe="azul_celeste",
               sinal="pousada", sem=71):
    """Art déco de esquinas redondas com uma barbatana em J que sobe pela frente e se enrola sobre a cobertura."""
    l, p, r = 10.4, 9.2, 2.6
    terreo_deco(it, l, p, r, sem)
    zt = deco_andares(it, l, p, r, 4, parede, faixa, sem)
    it.add(placa(sinal, 3.0, 0.75, 0, -p / 2, 2.95, moldura=faixa))
    zp = telhado_plano(it, rret(l + 0.2, p + 0.2, r + 0.1), zt, faixa, topo, alt=0.6)
    it.add(casa_maquinas(1.8, 1.5, zp, 2.4, 1.8, 1.4))
    # pilone art déco: barbatana de topo redondo que passa da cobertura, cortada por "linhas de velocidade"
    xf, wf = -2.9, 1.3
    topo_f = zt + 2.4
    pil = [(xf - wf / 2, 3.4), (xf + wf / 2, 3.4), (xf + wf / 2, topo_f - wf / 2)] + \
          [(xf + wf / 2 * math.cos(math.radians(a)), topo_f - wf / 2 + wf / 2 * math.sin(math.radians(a)))
           for a in range(15, 180, 15)] + [(xf - wf / 2, topo_f - wf / 2)]
    it.add(mb.extrudado(ccw(pil), 0.45, y=-p / 2 - 0.55, cor=detalhe, bisel=0.12, seg=2, plano="xz"))
    for i in range(3):
        it.add(caixa(wf + 0.5, 0.62, 0.16, x=xf, y=-p / 2 - 0.3, z=zt + 0.5 + i * 0.45, cor=faixa, bisel=0.06))
    for i in range(4):
        it.add(caixa(0.24, 0.12, 0.24, x=xf, y=-p / 2 - 0.6, z=5.4 + i * AND, cor=None, mat="luz", bisel=0.05,
                     seg=1))
    it.add(toldo(3.2, -p / 2 + 0.3, 3.4, 2.6, proj=1.0, cores=("branco", faixa)))
    return dict(lote=[1, 1], andares=4, col=[((0, -0.1, 0), (l + 0.5, p + 0.8, zt + 2.4))])


def deco_frisos(it, parede="pessego", friso1="lilas", friso2="rosa_bebe", faixa="laranja_claro", topo="laranja",
                sinal="hotel", sem=81):
    """Art déco com feixe de frisos verticais no meio da frente, subindo em degraus acima da cobertura."""
    l, p, r = 10.6, 9.4, 1.8
    terreo_deco(it, l, p, r, sem)
    zt = deco_andares(it, l, p, r, 4, parede, faixa, sem, filtro=fora_frente(-1.6, 1.6))
    xs = (-1.05, -0.35, 0.35, 1.05)
    extra = (1.0, 2.3, 2.3, 1.0)
    for x, e, c in zip(xs, extra, (friso1, friso2, friso1, friso2)):
        it.add(caixa(0.5, 0.9, zt + e - TER + 0.6, x=x, y=-p / 2 - 0.2, z=TER - 0.6, cor=c, bisel=0.16))
    it.add(placa(sinal, 2.6, 0.65, 0, -p / 2, 2.95, moldura=friso1))
    zp = telhado_plano(it, rret(l + 0.2, p + 0.2, r + 0.1), zt, faixa, topo, alt=0.6)
    it.add(casa_maquinas(-2.4, 1.6, zp, 2.4, 1.8, 1.4), caixa_dagua(2.6, 1.8, zp, r=0.6, a=1.0))
    for x in (-3.6, 3.6):
        it.add(mb.esfera(0.28, x, -p / 2 - 0.3, TER - 0.3, cor=None, mat="luz", seg=8))
    return dict(lote=[1, 1], andares=4, col=[((0, -0.2, 0), (l + 0.5, p + 0.9, zt + 2.3))])


def cinema_deco(it, parede="amarelo_claro", faixa="turquesa", torre="azul_claro", torre2="lilas", coroa="rosa",
                sem=91):
    """Cinema art déco: alas baixas com escotilhas redondas, torre central em degraus com coroa rosa e mastro, e
    marquise com o letreiro."""
    l, p, r = 11.0, 9.0, 1.4
    C = rret(l, p, r)
    zt = deco_andares(it, l, p, r, 3, parede, faixa, sem, filtro=lambda q, nr: nr.y > -0.5)
    it.add(vidros_contorno(C, 0.6, 2.9, passo=2.3, vao=0.4, semente=sem, apagadas=0.3,
                           filtro=lambda q, nr: nr.y > -0.5))
    # escotilhas na frente das alas
    for k in range(1, 3):
        z = TER + (k - 1) * AND + 1.6
        for x in (-4.3, -3.0, 3.0, 4.3):
            it.add(cilindro(0.55, 0.2, x=x, y=-p / 2 - 0.05, z=z, cor=faixa, eixo="y", seg=14, bisel=0))
            mat = random.Random(sem * 7 + k * 11 + int(x * 10)).choice(["janela", "janela_fria", "janela_apagada"])
            it.add(cilindro(0.42, 0.24, x=x, y=-p / 2 - 0.07, z=z, cor=None, mat=mat, eixo="y", seg=14, bisel=0))
    for x in (-3.6, 3.6):
        it.add(cilindro(0.5, 0.2, x=x, y=-p / 2 - 0.05, z=1.9, cor=faixa, eixo="y", seg=14, bisel=0),
               cilindro(0.38, 0.24, x=x, y=-p / 2 - 0.07, z=1.9, cor=None, mat="janela", eixo="y", seg=14, bisel=0))
    # torre central
    T = rret(4.0, 4.4, 0.8, 0, -p / 2 + 1.5)
    it.add(bloco(T, 0, 12.8, torre, bisel=0.1))
    it.add(cb.janelas(("y", -p / 2 - 0.7, -1), -1.2, 1.2, 4.6, 12.0, 1, 3, larg=0.7, alt=0.82, moldura="branco",
                      semente=sem + 5, peitoril=False))
    for x in (-1.75, 1.75):
        it.add(caixa(0.12, 0.1, 7.4, x=x, y=-p / 2 - 0.72, z=4.8, cor=None, mat="neon", bisel=0.03))
    it.add(bloco(rret(3.2, 3.6, 0.6, 0, -p / 2 + 1.5), 12.75, 1.9, torre2, bisel=0.1))
    it.add(bloco(rret(4.4, 4.8, 0.9, 0, -p / 2 + 1.5), 12.6, 0.25, "branco", bisel=0.08))
    it.add(bloco(rret(2.3, 2.6, 0.5, 0, -p / 2 + 1.5), 14.6, 1.5, coroa, bisel=0.15))
    it.add(antena(0, -p / 2 + 1.5, 16.1, 2.6))
    # marquise em cunha com o letreiro
    marq = [(-3.3, 0.0), (3.3, 0.0), (2.6, -2.0), (-2.6, -2.0)]
    it.add(bloco([(x, y - p / 2 - 0.7) for x, y in marq], 3.3, 0.9, "branco", bisel=0.08))
    it.add(placa("cinema", 4.4, 0.62, 0, -p / 2 - 2.7, 3.44, moldura="vermelho"))
    for i in range(13):
        x = -2.55 + 5.1 * i / 12
        it.add(caixa(0.13, 0.13, 0.13, x=x, y=-p / 2 - 2.78, z=3.2, cor=None, mat="luz", bisel=0.04, seg=1))
    for x in (-0.8, 0.8):
        it.add(porta_vidro(x, -p / 2 - 0.7, 0, l=1.3, a=2.6, moldura="vermelho"))
    zp = telhado_plano(it, rret(l + 0.2, p + 0.2, r + 0.1), zt, faixa, "laranja_claro", alt=0.55)
    it.add(caixa_dagua(3.6, 2.0, zp, r=0.6, a=1.0), casa_maquinas(-3.4, 2.0, zp, 2.2, 1.6, 1.4))
    return dict(lote=[1, 1], andares=3, col=[((0, 0, 0), (l + 0.5, p + 0.5, zt + 0.9)),
                                             ((0, -p / 2 + 0.6, 0), (4.4, 6.4, 16.1))])


def deco_degraus(it, parede="rosa", faixa="branco", topo="rosa_bebe", friso="magenta", sinal="hotel_rosa", sem=101):
    """Art déco escalonado (bolo de andares): cada andar recua um pouco, com faixas brancas gordas e frisos
    verticais em degraus na quina da frente."""
    dims = [(11.2, 10.0, 2.4), (10.6, 9.4, 2.2), (9.8, 8.8, 2.0), (8.8, 7.8, 1.7)]
    z = 0.0
    for k, (l, p, r) in enumerate(dims):
        h = TER if k == 0 else AND
        C = rret(l, p, r, 0, 0.3 * k)
        it.add(bloco(C, z, h + 0.04, parede))
        if k == 0:
            it.add(vidros_contorno(C, 0.6, 3.0, passo=2.3, vao=0.4, semente=sem, apagadas=0.3,
                                   filtro=fora_frente(-1.6, 1.6)))
        else:
            it.add(vidros_contorno(C, z + 0.75, z + h - 0.6, passo=1.9, vao=0.5, semente=sem + k,
                                   filtro=fora_frente(1.6, 4.4)))
        it.add(bloco(rret(l + 0.5, p + 0.5, r + 0.25, 0, 0.3 * k), z + h - 0.36, 0.36, faixa, bisel=0.14, seg=2))
        z += h
    zt = z
    l, p, r = dims[0]
    it.add(porta_vidro(0, -p / 2, 0, l=1.8, a=2.6, moldura=faixa))
    it.add(placa(sinal, 2.8, 0.7, 0, -p / 2, 2.9, moldura=faixa))
    for i, (x, e) in enumerate(((2.2, 0.6), (3.0, 1.8), (3.8, 0.9))):
        it.add(caixa(0.55, 0.8, zt + e - TER + 0.5, x=x, y=-dims[1][1] / 2 + 0.3 - 0.25, z=TER - 0.5,
                        cor=friso if i % 2 == 0 else faixa, bisel=0.17))
    lt, pt, rt = dims[-1]
    zp = telhado_plano(it, rret(lt + 0.3, pt + 0.3, rt + 0.15, 0, 0.9), zt, faixa, topo, alt=0.55)
    it.add(casa_maquinas(-1.6, 1.8, zp, 2.2, 1.6, 1.3))
    for k in range(1, 4):  # vasinhos nos recuos
        l2, p2, _ = dims[k - 1]
        it.add(moita(-l2 / 2 + 1.0, -p2 / 2 + 0.3 * (k - 1) + 0.6, TER + (k - 1) * AND if k > 1 else TER, 0.35))
    return dict(lote=[1, 1], andares=4, col=[((0, 0, 0), (11.7, 10.5, zt + 1.8))])


def deco_cristal(it, parede="turquesa_claro", faixa="azul_celeste", topo="pessego", lamina="porcelana_azul",
                 toldo_c=("branco", "azul_celeste"), sinal="cafe", sem=111):
    """Art déco com a lâmina de cristal: um prisma vertical claro no meio da frente com filetes de neon, e café com
    toldo no térreo."""
    l, p, r = 10.4, 9.6, 2.0
    terreo_deco(it, l, p, r, sem, x_porta=-2.6)
    zt = deco_andares(it, l, p, r, 4, parede, faixa, sem, filtro=fora_frente(-1.3, 1.3))
    lam = [(0, -p / 2 - 0.95), (0.75, -p / 2 - 0.1), (0, -p / 2 + 0.6), (-0.75, -p / 2 - 0.1)]
    it.add(bloco(lam, TER - 0.6, zt + 2.6 - TER + 0.6, lamina, bisel=0.06))
    for sx in (-1, 1):
        it.add(caixa(0.08, 0.08, zt + 2.2 - TER, x=sx * 0.36, y=-p / 2 - 0.55, z=TER - 0.2, cor=None, mat="neon",
                        bisel=0.02))
    it.add(bloco([(x * 0.6, y + 0.04) for x, y in lam], zt + 2.58, 0.25, faixa, bisel=0.06))
    it.add(placa(sinal, 2.2, 0.6, 2.4, -p / 2, 2.95, moldura=faixa))
    it.add(toldo(2.4, -p / 2 + 0.3, 2.75, 3.6, proj=1.1, cores=toldo_c))
    zp = telhado_plano(it, rret(l + 0.2, p + 0.2, r + 0.1), zt, faixa, topo, alt=0.6)
    it.add(casa_maquinas(2.2, 2.0, zp, 2.2, 1.6, 1.4), caixa_dagua(-2.6, 2.0, zp, r=0.6, a=1.0))
    return dict(lote=[1, 1], andares=4, col=[((0, -0.2, 0), (l + 0.5, p + 0.9, zt + 2.8))])


# =====================================================================================================================
# Praia e lazer
# =====================================================================================================================
def bar_praia(it, parede="lilas", faixa="turquesa", topo="pessego", toldo_c=("branco", "rosa"), liquido="rosa",
              sem=121):
    """Bar de praia: caixa colorida com letras BAR luminosas, toldo, terraço com guarda-sol e um drinque gigante."""
    l, p = 10.0, 7.6
    C = rret(l, p, 0.7)
    it.add(bloco(C, 0, 0.5, faixa, bisel=0.1))
    it.add(bloco(rret(l - 0.2, p - 0.2, 0.6), 0.48, 4.0, parede))
    it.add(bloco(rret(l + 0.3, p + 0.3, 0.85), 4.45, 0.35, faixa, bisel=0.1))
    it.add(cb.janelas(("y", -p / 2 + 0.1, -1), -4.6, -1.2, 1.0, 3.2, 2, 1, larg=0.84, alt=0.8, moldura=faixa,
                      semente=sem, apagadas=0.35, frias=0.2),
           cb.janelas(("y", -p / 2 + 0.1, -1), 1.2, 4.6, 1.0, 3.2, 2, 1, larg=0.84, alt=0.8, moldura=faixa,
                      semente=sem + 1, apagadas=0.35, frias=0.2))
    it.add(cb.janelas(("x", -l / 2 + 0.1, -1), -3.0, 3.0, 1.0, 3.2, 3, 1, larg=0.75, alt=0.8, moldura=faixa,
                      semente=sem + 2),
           cb.janelas(("x", l / 2 - 0.1, 1), -3.0, 3.0, 1.0, 3.2, 3, 1, larg=0.75, alt=0.8, moldura=faixa,
                      semente=sem + 3))
    it.add(porta_vidro(0, -p / 2 + 0.1, 0.5, l=1.6, a=2.5, moldura=faixa))
    it.add(toldo(-2.9, -p / 2 + 0.1, 3.75, 3.6, cores=toldo_c), toldo(2.9, -p / 2 + 0.1, 3.75, 3.6, cores=toldo_c))
    it.add(letreiro("BAR", 1.1, 0, -p / 2 - 0.05, 4.85, fundo=faixa, mat="luz", margem=0.25))
    zp = telhado_plano(it, rret(l, p, 0.7), 4.8, faixa, topo, alt=0.5, laje=0.1)
    # guarda-sol e mesinha no terraço
    for x, c in ((2.0, "amarelo"), (-0.6, "rosa_bebe")):
        it.add(cilindro(0.04, 2.2, x=x, y=0.6, z=zp, cor="branco", seg=6))
        it.add(mb.torno([(1.3, 0.0), (0.9, 0.25), (0.0, 0.42)], x=x, y=0.6, z=zp + 2.0, cor=c, seg=12))
        it.add(cilindro(0.45, 0.06, x=x, y=0.6, z=zp + 0.7, cor="branco", seg=14))
    # drinque gigante
    gx, gy, gz = -3.2, 1.2, zp
    it.add(cilindro(0.12, 1.4, x=gx, y=gy, z=gz, cor="branco", seg=10))
    it.add(cilindro(0.55, 0.12, x=gx, y=gy, z=gz, cor="branco", seg=16))
    it.add(mb.torno([(0.0, 0.0), (0.2, 0.05), (1.3, 1.25), (1.35, 1.32), (0.0, 1.32)], x=gx, y=gy, z=gz + 1.35,
                    cor="branco_gelo", seg=18))
    it.add(mb.torno([(0.0, 0.0), (0.18, 0.1), (1.18, 1.12), (0.0, 1.12)], x=gx, y=gy, z=gz + 1.48, cor=liquido,
                    seg=18))
    it.add(cilindro(0.55, 0.12, x=gx + 1.0, y=gy - 0.6, z=gz + 2.6, cor="laranja", eixo="x", seg=16))
    it.add(mb.tubo([(gx - 0.2, gy, gz + 2.0), (gx - 0.5, gy - 0.2, gz + 3.4), (gx - 0.1, gy - 0.4, gz + 3.8)], 0.07,
                   cor="vermelho_claro", seg=8))
    it.add(mb.torno([(0.75, 0.0), (0.4, 0.22), (0.0, 0.32)], x=gx + 0.6, y=gy + 0.3, z=gz + 3.3, cor="amarelo", seg=10))
    it.add(cilindro(0.03, 0.8, x=gx + 0.6, y=gy + 0.3, z=gz + 2.6, cor="madeira", seg=6))
    it.add(palmeira(4.3, -1.0, zp, alt=2.2, esc=0.55, sem=sem))
    return dict(lote=[1, 1], andares=1, col=[((0, 0, 0), (l + 0.3, p + 0.6, 5.2))])


def quiosque_sucos(it, parede="laranja_claro", telhado=("laranja", "laranja_claro"), faixa="branco", copo="amarelo",
                   sem=131):
    """Quiosque de sucos redondo, com balcão em volta, telhado de bolo em camadas e um copo gigante em cima."""
    R = 3.0
    it.add(bloco(oval(R + 0.3, R + 0.3, 32), 0, 0.25, "calcada", bisel=0.08))
    it.add(bloco(oval(R, R, 32), 0.24, 1.0, parede))
    it.add(bloco(oval(R + 0.35, R + 0.35, 32), 1.2, 0.12, faixa, bisel=0.05))
    it.add(bloco(oval(R - 0.15, R - 0.15, 32), 1.3, 1.25, "creme_claro"))
    it.add(vidros_contorno(oval(R - 0.15, R - 0.15, 32), 1.38, 2.45, passo=1.5, vao=0.22, semente=sem, apagadas=0.3,
                           frias=0.25))
    it.add(bloco(oval(R, R, 32), 2.52, 0.8, faixa))
    perfil = [(0.0, 3.3), (R + 0.75, 3.3), (R + 0.8, 3.55), (R + 0.2, 3.8), (R - 0.3, 3.85), (R - 0.3, 4.05),
              (R - 0.9, 4.3), (R - 1.4, 4.35), (R - 1.4, 4.55), (R - 1.9, 4.8), (0.0, 4.95)]
    it.add(mb.torno(perfil, cor=telhado[0], seg=32))
    it.add(mb.torno([(R + 0.82, 3.42), (R + 0.9, 3.48), (R + 0.84, 3.58), (R + 0.6, 3.6)], cor=telhado[1], seg=32))
    # copo gigante com canudo e fatia
    it.add(mb.torno([(0.0, 0.0), (0.55, 0.0), (0.75, 1.5), (0.7, 1.55), (0.0, 1.55)], z=4.9, cor=copo, seg=18))
    it.add(mb.torno([(0.0, 1.5), (0.72, 1.5), (0.6, 1.75), (0.0, 1.8)], z=4.9, cor="branco", seg=18))
    it.add(mb.tubo([(0.2, 0.1, 6.0), (0.35, 0.0, 7.1), (0.75, -0.1, 7.4)], 0.07, cor="verde_claro", seg=8))
    it.add(cilindro(0.45, 0.1, x=-0.55, y=-0.3, z=6.4, cor="laranja", eixo="y", seg=16))
    it.add(letreiro("SUCOS", 0.62, 0, -(R + 0.78), 3.0, fundo="turquesa", mat="luz", margem=0.18))
    it.add(porta_vidro(0, R - 0.08, 0.24, l=1.0, a=2.2, face=1, moldura=faixa))
    for a in (200, 270, 340):  # banquinhos
        x, y = (R + 0.9) * math.cos(math.radians(a)), (R + 0.9) * math.sin(math.radians(a))
        it.add(cilindro(0.06, 0.7, x=x, y=y, z=0.25, cor="metal", seg=6),
               cilindro(0.28, 0.12, x=x, y=y, z=0.95, cor="vermelho_claro", seg=12, bisel=0.04))
    return dict(lote=[1, 1], andares=1, col=[((0, 0, 0), (2 * R + 1.6, 2 * R + 1.6, 6.5))])


def bar_barril(it, madeira="madeira", aro="metal_escuro", base="madeira_escura", sem=141):
    """Bar em forma de barril deitado sobre dois berços, com porta de vidro e escotilhas, escadinha e letreiro."""
    Lb = 6.4
    rr = lambda h: 2.05 + 0.35 * math.sin(math.pi * h / Lb)  # noqa: E731
    zc = 0.8 + 2.4
    perfil = [(0.0, 0.0)] + [(rr(Lb * i / 10), Lb * i / 10) for i in range(11)] + [(0.0, Lb)]
    barril = mb.torno(perfil, cor=madeira, seg=28)
    mb.transforma(barril, loc=(0, -Lb / 2, zc), rot=("X", -90))
    it.add(barril)
    for h in (0.45, 1.9, Lb - 1.9, Lb - 0.45):
        r0 = rr(h)
        aro_ = mb.torno([(r0 + 0.01, h - 0.15), (r0 + 0.07, h - 0.1), (r0 + 0.07, h + 0.1), (r0 + 0.01, h + 0.15)],
                        cor=aro, seg=28)
        mb.transforma(aro_, loc=(0, -Lb / 2, zc), rot=("X", -90))
        it.add(aro_)
    for y in (-1.8, 1.8):
        rb = rr(y + Lb / 2) + 0.02
        xs = [1.9 - 3.8 * i / 12 for i in range(13)]
        cont = [(-2.1, 0.0), (2.1, 0.0), (2.1, zc - math.sqrt(max(0, rb ** 2 - 1.9 ** 2)) + 0.25)] + \
               [(x, zc - math.sqrt(max(0, rb ** 2 - x * x)) + 0.06) for x in xs] + \
               [(-2.1, zc - math.sqrt(max(0, rb ** 2 - 1.9 ** 2)) + 0.25)]
        it.add(mb.extrudado(ccw(cont), 0.55, y=y - 0.275, cor=base, bisel=0.06, plano="xz"))
    # frente: porta e janela redonda; escada
    yf = -Lb / 2
    porta = [(-0.62, 1.0), (0.62, 1.0), (0.62, 2.6)] + \
            [(0.62 * math.cos(math.radians(a)), 2.6 + 0.62 * math.sin(math.radians(a))) for a in range(0, 181, 15)] + \
            [(-0.62, 2.6)]
    it.add(mb.extrudado(ccw(offset(porta, 0.14)), 0.14, y=yf - 0.12, cor=base, bisel=0.04, plano="xz"))
    it.add(mb.extrudado(ccw(porta), 0.05, y=yf - 0.16, cor=None, mat="vidro", bisel=0.0, plano="xz"))
    it.add(cilindro(0.5, 0.16, x=0, y=yf - 0.06, z=4.05, cor=base, eixo="y", seg=14, bisel=0),
           cilindro(0.38, 0.2, x=0, y=yf - 0.08, z=4.05, cor=None, mat="janela", eixo="y", seg=14, bisel=0))
    for i in range(3):
        it.add(caixa(1.6, 0.42, 0.34 * (i + 1), y=yf - 1.2 + 0.4 * i, z=0, cor="madeira_mel", bisel=0.04))
    # escotilhas nos dois lados
    for sx in (-1, 1):
        for y, mat in ((-1.0, None), (1.0, None)):
            mt = {(-1, -1.0): "janela_apagada", (-1, 1.0): "janela", (1, -1.0): "janela_fria",
                  (1, 1.0): "janela_apagada"}[(sx, y)]
            x = sx * (rr(y + Lb / 2) - 0.02)
            it.add(cilindro(0.48, 0.22, x=x, y=y, z=zc + 0.2, cor=aro, eixo="x", seg=14, bisel=0),
                   cilindro(0.36, 0.26, x=x + sx * 0.02, y=y, z=zc + 0.2, cor=None, mat=mt, eixo="x", seg=14,
                               bisel=0))
    # letreiro sobre o barril
    ztop = zc + rr(Lb / 2)
    for x in (-1.5, 1.5):
        it.add(cilindro(0.08, 1.0, x=x, y=-0.6, z=ztop - 0.15, cor=aro, seg=8))
    it.add(letreiro("BAR", 0.9, 0, -0.55, ztop + 0.95, fundo="madeira_escura", mat="neon", margem=0.25))
    it.add(cilindro(0.12, 0.6, x=0, y=0.6, z=ztop - 0.1, cor=aro, seg=10))  # chaminezinha
    return dict(lote=[1, 1], andares=1, col=[((0, 0, 0), (5.0, Lb + 1.6, ztop + 2.3))])


def boate_danca(it, base="turquesa", parede="salmao", faixa="vermelho_claro", tambores=("turquesa", "rosa_bebe", "lilas"),
                sem=151):
    """Boate oval com faixa de neon, letreiro DANÇA, três tambores coloridos no telhado e palmeiras fofas."""
    rx, ry = 5.8, 4.4
    it.add(bloco(oval(rx, ry, 40), 0, 1.0, base, bisel=0.1))
    it.add(bloco(oval(rx - 0.25, ry - 0.25, 40), 0.98, 2.7, parede))
    it.add(vidros_contorno(oval(rx - 0.25, ry - 0.25, 40), 1.45, 3.15, passo=1.7, vao=0.45, semente=sem + 4,
                           apagadas=0.4, frias=0.2, filtro=fora_frente(-2.0, 2.0)))
    it.add(bloco(oval(rx + 0.1, ry + 0.1, 40), 3.62, 0.18, None, mat="neon"))
    it.add(bloco(oval(rx + 0.05, ry + 0.05, 40), 3.78, 1.0, faixa, bisel=0.12))
    it.add(bloco(oval(rx - 0.3, ry - 0.3, 40), 4.7, 0.12, "pessego"))
    it.add(letras_curva("DANÇA", 0.72, -2.4, 2.4, lambda x: -(ry + 0.05) * math.sqrt(max(0, 1 - (x / (rx + 0.05)) ** 2)),
                        3.92, mat="luz", prof=0.16))
    yp = -(ry - 0.25) + 0.02
    it.add(porta_vidro(0, yp, 0.98, l=2.2, a=2.4, moldura="amarelo"))
    it.add(bloco(rret(3.4, 1.4, 0.4, 0, -ry - 0.25), 3.45, 0.18, "amarelo", bisel=0.06))
    for i, ((x, y), r, h) in enumerate((((-2.0, 1.2), 1.55, 2.2), ((1.3, 1.5), 1.35, 2.7), ((-0.2, -1.2), 1.2, 1.9))):
        c = tambores[i]
        z = 4.75
        it.add(cilindro(r, h, x=x, y=y, z=z, cor=c, seg=24, bisel=0.12))
        it.add(cilindro(r + 0.12, 0.22, x=x, y=y, z=z + h - 0.24, cor="branco", seg=24, bisel=0.06))
        it.add(cilindro(r + 0.12, 0.22, x=x, y=y, z=z + 0.02, cor="branco", seg=24, bisel=0.06))
        it.add(vidros_contorno(oval(r, r, 24, x, y), z + 0.55, z + h - 0.55, passo=1.1, vao=0.3, semente=sem + i,
                               apagadas=0.5, frias=0.3))
    for (x, y), al, inc, e in (((-3.9, -1.1), 2.6, (-0.25, -0.2), 0.75), ((3.8, -1.3), 2.4, (0.25, -0.2), 0.72),
                               ((3.3, 2.0), 2.0, (0.2, 0.2), 0.65), ((-3.6, 1.8), 2.2, (-0.2, 0.2), 0.68)):
        it.add(palmeira(x, y, 4.75, alt=al, inc=inc, esc=e, sem=int(x * 10 + y)))
    return dict(lote=[1, 1], andares=1, col=[((0, 0, 0), (2 * rx + 0.3, 2 * ry + 0.6, 4.8)),
                                             ((0, 0.4, 4.8), (7.0, 5.6, 2.7))])


def cabana_redonda(it, parede="madeira_media", deck="madeira_mel", telhado="terracota", telhado2="terracota_clara",
                   sem=161):
    """Cabana redonda de dois andares: varanda em volta com guarda-corpo, telhado de cúpula e janelas redondas."""
    R1, R2 = 3.3, 2.9
    it.add(bloco(oval(R1 + 0.25, R1 + 0.25, 28), 0, 0.3, "cinza", bisel=0.08))
    it.add(bloco(oval(R1, R1, 28), 0.28, 3.0, parede))
    it.add(bloco(oval(R1 + 1.1, R1 + 1.1, 32), 3.25, 0.25, deck, bisel=0.06))
    it.add(bloco(oval(R2, R2, 28), 3.48, 2.6, parede))
    perfil = [(0.0, 5.9), (R2 + 1.0, 5.9), (R2 + 1.05, 6.12), (R2 + 0.6, 6.6), (R2 - 0.2, 7.4), (1.2, 8.1),
              (0.5, 8.35), (0.0, 8.42)]
    it.add(mb.torno(perfil, cor=telhado, seg=28))
    it.add(mb.torno([(R2 + 1.06, 6.0), (R2 + 1.14, 6.06), (R2 + 1.08, 6.18), (R2 + 0.8, 6.3)], cor=telhado2, seg=28))
    it.add(cilindro(0.18, 0.5, z=8.3, cor=telhado2, seg=10), mb.esfera(0.2, 0, 0, 8.85, cor="amarelo", seg=10))
    # guarda-corpo da varanda: postes e corrimão
    pts = oval(R1 + 0.95, R1 + 0.95, 24)
    for i, (x, y) in enumerate(pts):
        if i % 2 == 0:
            it.add(cilindro(0.06, 0.95, x=x, y=y, z=3.5, cor=deck, seg=6))
    it.add(mb.tubo([(x, y, 4.45) for x, y in pts], 0.07, cor="madeira_escura", seg=6, fechado=True, raio_curva=0))
    it.add(mb.tubo([(x, y, 3.95) for x, y in pts], 0.045, cor="madeira_escura", seg=6, fechado=True, raio_curva=0))
    for k, (zc, Rr, n) in enumerate(((1.9, R1, 6), (4.8, R2, 5))):
        for i in range(n):
            a = 2 * math.pi * i / n - math.pi / 2 + (0.5 if k == 0 else 0.0)
            if k == 0 and abs(math.degrees(a) + 90) < 20:
                continue
            x, y = Rr * math.cos(a), Rr * math.sin(a)
            mt = ("janela", "janela_apagada", "janela_fria", "janela", "janela_apagada", "janela")[(i + k) % 6]
            ob = cilindro(0.44, 0.2, cor="madeira_escura", eixo="y", seg=16, bisel=0)
            vd = cilindro(0.33, 0.24, cor=None, mat=mt, eixo="y", seg=16, bisel=0)
            for o in (ob, vd):
                mb.transforma(o, loc=(x, y, zc), rot=("Z", math.degrees(a) + 90))
            it.add(ob, vd)
    it.add(porta_vidro(0, -R1 + 0.06, 0.28, l=1.3, a=2.3, moldura="madeira_escura"))
    it.add(letreiro("CAFÉ", 0.5, 0, -(R1 + 0.85), 2.6, fundo="madeira_escura", mat="luz", margem=0.15))
    for i in range(8):  # escada externa de um lado
        it.add(caixa(1.0, 0.36, 0.06 + 0.4 * (i + 1), x=R1 + 0.7, y=-2.6 + 0.36 * i, z=0, cor=deck, bisel=0.03))
    it.add(palmeira(-4.6, 2.0, 0, alt=5.6, inc=(-0.6, 0.3), esc=0.9, sem=sem))
    return dict(lote=[1, 1], andares=2, col=[((0, 0, 0), (2 * R1 + 0.6, 2 * R1 + 0.6, 3.5)),
                                             ((0, 0, 3.25), (2 * R1 + 2.2, 2 * R1 + 2.2, 5.2))])


def loja_surfe(it, parede="turquesa_claro", telhado=("laranja", "laranja_claro"), faixa="branco", sem=171):
    """Loja de surfe com telhado de três camadas, varanda de colunas, pranchas encostadas e placa oval SURFE."""
    l, p = 9.0, 7.0
    it.add(bloco(rret(l + 1.4, p + 1.4, 0.4), 0, 0.3, "madeira_mel", bisel=0.06))
    it.add(bloco(rret(l, p - 1.2, 0.5, 0, 0.6), 0.28, 3.6, parede))
    it.add(cb.janelas(("y", -p / 2 + 1.2, -1), -4.2, -1.0, 0.9, 3.2, 2, 1, larg=0.85, alt=0.85, moldura=faixa,
                      semente=sem, apagadas=0.35, frias=0.3, peitoril=False),
           cb.janelas(("y", -p / 2 + 1.2, -1), 1.0, 4.2, 0.9, 3.2, 2, 1, larg=0.85, alt=0.85, moldura=faixa,
                      semente=sem + 1, apagadas=0.35, frias=0.3, peitoril=False))
    it.add(cb.janelas(("x", -l / 2, -1), -2.0, 3.0, 1.3, 3.0, 2, 1, larg=0.7, alt=0.8, moldura=faixa,
                      semente=sem + 2),
           cb.janelas(("x", l / 2, 1), -2.0, 3.0, 1.3, 3.0, 2, 1, larg=0.7, alt=0.8, moldura=faixa, semente=sem + 3))
    it.add(porta_vidro(0, -p / 2 + 1.2, 0.28, l=1.6, a=2.5, moldura=faixa))
    for x in (-4.3, -1.5, 1.5, 4.3):
        it.add(cilindro(0.16, 3.6, x=x, y=-p / 2 - 0.3, z=0.28, cor=faixa, seg=12, bisel=0.04))
    z = 3.85
    for i, (l0, p0, l1, p1, h) in enumerate(((l + 1.8, p + 1.8, l - 0.2, p - 0.2, 1.0), (l - 0.6, p - 0.6, l - 2.8,
                                                                                         p - 2.6, 0.95),
                                             (l - 3.4, p - 3.2, l - 5.6, p - 5.0, 0.85))):
        it.add(caixa(l0 - 0.5 if i else l0 + 0.1, p0 - 0.5 if i else p0 + 0.1, 0.22, z=z - 0.12, cor=telhado[1],
                        bisel=0.08))
        it.add(tronco_piramide(l0, p0, l1, p1, z + 0.08, h, telhado[i % 2]))
        z += h + 0.12
    # pranchas encostadas na frente
    for x, c, rz in ((-3.0, "rosa", 6), (-2.3, "amarelo", -4), (2.5, "azul_celeste", 5), (3.2, "verde_lima", -6)):
        pr = mb.superelipsoide(0.55, 0.12, 2.3, cor=c, e=0.6, e_v=0.9, nu=16, nv=10)
        mb.transforma(pr, loc=(x, -p / 2 + 1.05, 0.3), rot=[("X", -8), ("Y", rz)])
        it.add(pr)
        it.add(caixa(0.06, 0.13, 2.0, x=x, y=-p / 2 + 1.0, z=0.45, cor="branco", bisel=0.02))
    # placa oval com SURFE
    ov = cilindro(1.0, 0.18, x=0, y=-p / 2 - 1.1, z=4.6, cor="azul_celeste", eixo="y", seg=24, bisel=0.05)
    ov.data.transform(Matrix.Translation((0, -p / 2 - 1.1, 4.6)) @ Matrix.Diagonal((1.7, 1, 0.62, 1)) @
                      Matrix.Translation((0, p / 2 + 1.1, -4.6)))
    it.add(ov)
    it.add(letras("SURFE", 0.5, 0, -p / 2 - 1.28, 4.35, mat="neon", prof=0.12, larg_max=2.6))
    return dict(lote=[1, 1], andares=1, col=[((0, 0, 0), (l + 1.8, p + 1.8, 7.0))])


def sorveteria(it, parede="rosa_claro", telhado="turquesa", faixa="branco", toldo_c=("branco", "rosa"), sem=184):
    """Sorveteria rosa de teto abobadado ondulado turquesa, toldo listrado e uma casquinha gigante no telhado."""
    l, p = 9.4, 7.2
    C = rret(l, p, 1.4)
    it.add(bloco(rret(l + 0.3, p + 0.3, 1.55), 0, 0.4, faixa, bisel=0.08))
    it.add(bloco(C, 0.38, 3.6, parede))
    it.add(bloco(rret(l + 0.25, p + 0.25, 1.5), 3.9, 0.3, faixa, bisel=0.08))
    it.add(vidros_contorno(C, 1.0, 3.2, passo=2.2, vao=0.45, semente=sem, apagadas=0.35, frias=0.3,
                           filtro=fora_frente(-1.4, 1.4)))
    it.add(porta_vidro(0, -p / 2, 0.38, l=1.6, a=2.5, moldura=faixa))
    it.add(toldo(-3.0, -p / 2, 3.7, 3.0, cores=toldo_c), toldo(3.0, -p / 2, 3.7, 3.0, cores=toldo_c))

    def P(u, v):  # abóbada: u ao longo de x, v de frente para trás
        x = (u - 0.5) * (l + 0.5)
        y = (v - 0.5) * (p + 0.6)
        z = 4.15 + 1.35 * math.sin(math.pi * v) + 0.18 * math.sin(4 * math.pi * u) * math.sin(math.pi * v)
        return V((x, y, z))

    it.add(superficie_grossa(P, 24, 12, 0.3, telhado, nome="abobada"))
    # miolo da abóbada (fecha a frente e o fundo): perfil em arco no plano yz, extrudado em x
    pf = p + 0.6
    arco_ = [(y, 4.15 + 1.35 * math.sin(math.pi * (y + pf / 2) / pf) - 0.32) for y in
             (-(p - 0.8) / 2 + (p - 0.8) * i / 16 for i in range(17))]
    it.add(mb.extrudado(ccw([(arco_[-1][0], 4.0), (arco_[0][0], 4.0)] + arco_), l - 0.7, x=-(l - 0.7) / 2,
                        cor=parede, bisel=0.05, plano="yz"))
    it.add(letreiro("SORVETE", 0.62, 0, -p / 2 - 0.06, 4.35, fundo="rosa", mat="luz", margem=0.2, larg=4.6))
    # casquinha gigante
    cx, cy, cz = 0.0, 0.9, 5.3
    it.add(mb.torno([(0.0, 0.0), (0.12, 0.05), (0.75, 1.9), (0.0, 1.9)], x=cx, y=cy, z=cz, cor="caramelo", seg=16))
    it.add(mb.esfera(0.82, cx, cy, cz + 2.25, cor="rosa_bebe", seg=16))
    it.add(mb.esfera(0.7, cx, cy, cz + 3.1, cor="menta", seg=16))
    it.add(mb.esfera(0.2, cx + 0.1, cy - 0.1, cz + 3.85, cor="vermelho", seg=10))
    return dict(lote=[1, 1], andares=1, col=[((0, 0, 0), (l + 0.5, p + 0.8, 5.5))])


# =====================================================================================================================
# Lista
# =====================================================================================================================
PREDIOS = [
    # id, rótulo, grupo, função, kwargs, tags
    ("torre_vela_laranja", "Torre da vela (laranja)", "torre_vela", torre_vela, {},
     ["grande", "hotel", "torre", "neon"]),
    ("torre_vela_rosa", "Torre da vela (rosa)", "torre_vela", torre_vela,
     dict(laje="rosa_bebe", nucleo="rosa", borda="branco", base="rosa_claro", sinal="hotel_rosa", sem=12),
     ["grande", "hotel", "torre", "neon"]),
    ("predio_s_rosa", "Prédio em S de terraços (rosa e coral)", "predio_s", predio_s, {},
     ["grande", "residencial", "2x2", "terraco"]),
    ("torre_branca_turquesa", "Torre branca e turquesa", "torre_branca", torre_branca, {},
     ["grande", "hotel", "torre"]),
    ("hotel_maresia", "Hotel Maresia de duas torres", "hotel_maresia", hotel_maresia, {},
     ["grande", "hotel", "2x1", "neon", "ponte"]),
    ("hotel_ondulado", "Hotel ondulado", "hotel_ondulado", hotel_ondulado, {},
     ["grande", "hotel", "2x1"]),
    ("predio_varandas_amarelo", "Prédio de varandas onduladas (amarelo)", "predio_varandas", predio_varandas, {},
     ["medio", "residencial", "loja"]),
    ("predio_varandas_turquesa", "Prédio de varandas onduladas (turquesa)", "predio_varandas", predio_varandas,
     dict(nucleo="turquesa_claro", borda="amarelo", terreo="turquesa", toldo_c=("branco", "amarelo"), sem=62),
     ["medio", "residencial", "loja"]),
    ("deco_faixa_amarelo", "Pousada art déco da barbatana (amarela)", "deco_faixa", deco_faixa, {},
     ["pequeno", "art_deco", "pousada"]),
    ("deco_faixa_rosa", "Pousada art déco da barbatana (rosa)", "deco_faixa", deco_faixa,
     dict(parede="rosa_claro", faixa="rosa", topo="pessego", detalhe="turquesa", sinal="pousada_rosa", sem=72),
     ["pequeno", "art_deco", "pousada"]),
    ("deco_frisos_pessego", "Hotel art déco de frisos (pêssego)", "deco_frisos", deco_frisos, {},
     ["pequeno", "art_deco", "hotel"]),
    ("deco_frisos_turquesa", "Hotel art déco de frisos (turquesa)", "deco_frisos", deco_frisos,
     dict(parede="turquesa_claro", friso1="branco", friso2="azul_claro", faixa="turquesa", topo="amarelo_claro",
          sinal="hotel_azul", sem=82),
     ["pequeno", "art_deco", "hotel"]),
    ("cinema_deco", "Cinema art déco", "cinema_deco", cinema_deco, {}, ["pequeno", "art_deco", "cinema", "neon"]),
    ("deco_degraus_rosa", "Hotel art déco escalonado (rosa)", "deco_degraus", deco_degraus, {},
     ["pequeno", "art_deco", "hotel"]),
    ("deco_degraus_pessego", "Hotel art déco escalonado (pêssego)", "deco_degraus", deco_degraus,
     dict(parede="pessego", faixa="branco", topo="amarelo_claro", friso="vermelho_claro", sinal="hotel_laranja",
          sem=102),
     ["pequeno", "art_deco", "hotel"]),
    ("deco_cristal_turquesa", "Café art déco da lâmina de cristal", "deco_cristal", deco_cristal, {},
     ["pequeno", "art_deco", "cafe", "neon"]),
    ("bar_praia_lilas", "Bar de praia (lilás)", "bar_praia", bar_praia, {}, ["lazer", "praia", "bar", "neon"]),
    ("bar_praia_turquesa", "Bar de praia (turquesa)", "bar_praia", bar_praia,
     dict(parede="turquesa_claro", faixa="laranja", topo="amarelo_claro", toldo_c=("branco", "laranja"),
          liquido="laranja_claro", sem=122),
     ["lazer", "praia", "bar", "neon"]),
    ("quiosque_sucos", "Quiosque de sucos", "quiosque_sucos", quiosque_sucos, {}, ["lazer", "praia", "quiosque"]),
    ("bar_barril", "Bar do barril", "bar_barril", bar_barril, {}, ["lazer", "praia", "bar", "neon"]),
    ("boate_danca", "Boate DANÇA das palmeiras", "boate_danca", boate_danca, {}, ["lazer", "boate", "neon"]),
    ("cabana_redonda", "Cabana redonda (café)", "cabana_redonda", cabana_redonda, {}, ["lazer", "praia", "cafe"]),
    ("loja_surfe", "Loja de surfe", "loja_surfe", loja_surfe, {}, ["lazer", "praia", "loja", "neon"]),
    ("sorveteria", "Sorveteria", "sorveteria", sorveteria, {}, ["lazer", "praia", "loja"]),
]

PASTA_EST = ""


def gera(saida, sel):
    global PASTA_EST
    cat = mb.Catalogo(CAT, saida, rotulo="Prédios tropicais")
    PASTA_EST = os.path.join(cat.pasta, "estampas")
    subprocess.run(["python3", "-I", os.path.join(AQUI, "predios_tropicais_estampas.py"), PASTA_EST], check=True)
    for id_, rot, grupo, f, kw, tags in PREDIOS:
        if sel and id_ not in sel:
            continue
        mb.limpa()
        it = mb.Item(id_)
        info = f(it, **kw)
        if os.environ.get("TRIS_DEBUG"):
            from collections import Counter
            cnt = Counter()
            for o in it.partes:
                cnt[o.name.split(".")[0]] += sum(len(q.vertices) - 2 for q in o.data.polygons)
            print("tris_debug", id_, cnt.most_common(12), flush=True)
        d, lo, hi = centraliza(it)
        it.colisao([((c[0] + d.x, c[1] + d.y, c[2]), t) for c, t in info["col"]])
        e = cat.exporta(it, rot, grupo=grupo, tags=["predio", ESTILO] + tags, miniatura_dir=(0.55, -1.0, 0.55),
                        extra={"lote": info["lote"], "andares": info["andares"], "estilo": ESTILO})
        print("lote", id_, info["lote"], "proj", e["dims"][:2], flush=True)
    cat.salva()


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:]
    gera(args[0], args[1:])
