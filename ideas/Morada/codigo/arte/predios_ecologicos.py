"""Biblioteca de cidade do Morada: prédios de estilo ECOLÓGICO (branco, verde, madeira e vidro, com plantas fofas).

Uso (ver GUIA_PREDIOS.md e GUIA_CIDADE.md):
  MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/predios_ecologicos.py -- SP/cidade_out [ids...]
Grava em SP/cidade_out/predios_ecologicos/ (glb/, miniaturas/, catalogo.json). Sem ids, gera todos.

Convenções: lote de 15 × 15 m (projeção até 13 × 13; grandes até 28 × 13), origem no centro da projeção, base em
z = 0 (nível da calçada), frente para −Y. Andar de 3,2 m (cb.ANDAR), térreo de 4,2 m. Janelas com os materiais
janela / janela_fria / janela_apagada (≈ 40 % apagadas), uma face por vidro. As estampas dos letreiros são desenhadas
por predios_ecologicos_estampas.py (PIL, python3 -I) e ficam em morada-art/_eco/estampas.
"""
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
A = cb.ANDAR
T0 = 4.2
CAT = "predios_ecologicos"
ESTILO = "ecologico"
AQUI = os.path.dirname(os.path.abspath(__file__))
EST_DIR = os.path.join(AQUI, "_eco", "estampas")
APAG, FRIAS = 0.4, 0.25


def caixa(*a, seg=1, **k):
    """mb.caixa com boleado de 1 segmento por padrão (prédio é grande: o boleado de 3 segmentos só pesa)."""
    return mb.caixa(*a, seg=seg, **k)


def niveis(n, terreo=T0, andar=A):
    """Cotas dos pisos: L[0] = 0, L[1] = térreo, ..., L[n] = topo do último andar."""
    return [0.0] + [terreo + andar * j for j in range(n)]


# =====================================================================================================================
# Malhas cruas e contornos
# =====================================================================================================================
def malha(nome, verts, faces, cor="branco", mat="atlas", liso=False, angulo=40, uvs=None):
    """Malha com a ordem dos vértices dada (a normal segue a regra da mão direita; nada é recalculado)."""
    mb.materiais()
    me = bpy.data.meshes.new(nome)
    me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    me.update()
    uvl = me.uv_layers.new(name="UVMap")
    if uvs is not None:
        for p in me.polygons:
            for k, li in enumerate(p.loop_indices):
                uvl.data[li].uv = uvs[p.index][k]
    else:
        u = mb.uv_cor(cor) if cor else (0.5, 0.5)
        for d in uvl.data:
            d.uv = u
    for n in mb.MAT_NOMES:
        me.materials.append(bpy.data.materials[n])
    mi = mb._mat_idx(mat)
    for p in me.polygons:
        p.material_index = mi
    if liso:
        me.shade_smooth()
        me.set_sharp_from_angle(angle=math.radians(angulo))
    ob = bpy.data.objects.new(nome, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def ccw(pts):
    return mb._ccw([tuple(p) for p in pts])


def chaikin(pts, it=3, fechado=True):
    pts = [V((p[0], p[1])) for p in pts]
    for _ in range(it):
        out = [] if fechado else [pts[0]]
        pares = list(zip(pts, pts[1:] + pts[:1])) if fechado else list(zip(pts, pts[1:]))
        for a, b in pares:
            out += [a * 0.75 + b * 0.25, a * 0.25 + b * 0.75]
        if not fechado:
            out.append(pts[-1])
        pts = out
    return [(p.x, p.y) for p in pts]


def reamostra(pts, n, fechado=True):
    """n pontos igualmente espaçados ao longo do contorno."""
    P = [V((p[0], p[1])) for p in pts]
    if fechado:
        P = P + [P[0]]
    s = [0.0]
    for a, b in zip(P, P[1:]):
        s.append(s[-1] + (b - a).length)
    L = s[-1]
    out = []
    j = 0
    m = n if fechado else n - 1
    for k in range(n):
        alvo = L * k / m
        while j < len(s) - 2 and s[j + 1] < alvo:
            j += 1
        t = (alvo - s[j]) / max(1e-9, s[j + 1] - s[j])
        q = P[j].lerp(P[j + 1], min(1.0, max(0.0, t)))
        out.append((q.x, q.y))
    return out


def desloca(pts, d):
    """Desloca um contorno fechado anti-horário: d > 0 para fora, d < 0 para dentro."""
    P = []
    for p in ccw(pts):
        q = V((p[0], p[1]))
        if not P or (q - P[-1]).length > 0.03:
            P.append(q)
    if len(P) > 2 and (P[0] - P[-1]).length <= 0.03:
        P.pop()
    n = len(P)
    out = []
    for i in range(n):
        a, b, c = P[i - 1], P[i], P[(i + 1) % n]
        t1, t2 = (b - a).normalized(), (c - b).normalized()
        n1, n2 = V((t1.y, -t1.x)), V((t2.y, -t2.x))
        bis = (n1 + n2)
        bis = n1 if bis.length < 1e-6 else bis.normalized()
        k = d / max(0.35, bis.dot(n1))
        q = b + bis * k
        out.append((q.x, q.y))
    return out


def superelipse(l, p, e=0.4, n=48, cx=0.0, cy=0.0, onda=None):
    """Contorno de super-elipse l × p (e = 1 elipse, 0,2 quase retângulo). onda(theta) multiplica o raio."""
    out = []
    for k in range(n):
        th = 2 * math.pi * k / n
        c, s = math.cos(th), math.sin(th)
        x = math.copysign(abs(c) ** e, c) * l / 2
        y = math.copysign(abs(s) ** e, s) * p / 2
        f = onda(th) if onda else 1.0
        out.append((cx + x * f, cy + y * f))
    return out


def circ(r, n=32, cx=0.0, cy=0.0):
    return [(cx + r * math.cos(2 * math.pi * k / n), cy + r * math.sin(2 * math.pi * k / n)) for k in range(n)]


def ret(l, p, r=0.0, cx=0.0, cy=0.0, seg=4):
    if r <= 0:
        return [(cx - l / 2, cy - p / 2), (cx + l / 2, cy - p / 2), (cx + l / 2, cy + p / 2), (cx - l / 2, cy + p / 2)]
    return [(cx + x, cy + y) for x, y in mb.ret_arredondado(l, p, r, seg)]


def solido(pts, z0, alt, cor="branco", bisel=0.0, seg=2, mat="atlas", nome="solido"):
    return mb.extrudado(ccw(pts), alt, z=z0, cor=cor, bisel=bisel, seg=seg, mat=mat, nome=nome)


def anel(ext, inn, z0, z1, cor="branco", topo=None, fundo=False, liso=True, nome="anel", mat="atlas"):
    """Faixa fechada entre dois contornos (mesmo número de pontos, anti-horários): lados de fora e de dentro, topo e
    (opcional) fundo. topo(i) devolve um acréscimo de altura no vértice i (sebes de topo ondulado)."""
    ext, inn = ccw(ext), ccw(inn)
    n = len(ext)
    vs = []
    for (x, y) in ext:
        vs.append((x, y, z0))
    for i, (x, y) in enumerate(ext):
        vs.append((x, y, z1 + (topo(i) if topo else 0)))
    for i, (x, y) in enumerate(inn):
        vs.append((x, y, z1 + (topo(i) if topo else 0)))
    for (x, y) in inn:
        vs.append((x, y, z0))
    fs = []
    for i in range(n):
        j = (i + 1) % n
        fs.append((i, j, n + j, n + i))                     # fora
        fs.append((n + i, n + j, 2 * n + j, 2 * n + i))     # topo
        fs.append((3 * n + j, 3 * n + i, 2 * n + i, 2 * n + j))  # dentro
        if fundo:
            fs.append((j, i, 3 * n + i, 3 * n + j))
    return malha(nome, vs, fs, cor, mat, liso=liso, angulo=50)


def sebe(pts, z0, larg=0.6, alt=0.55, cor="folha_clara", per=1.6, amp=0.16, nome="sebe"):
    """Sebe fofa ao longo de um contorno fechado: faixa verde de topo ondulado (bolinhas), dentro do contorno."""
    ext = ccw(pts)
    L = sum((V(b) - V(a)).length for a, b in zip(ext, ext[1:] + ext[:1]))
    n = max(12, int(L / per) * 3)
    ext = reamostra(ext, n)
    inn = desloca(ext, -larg)
    return anel(ext, inn, z0, z0 + alt, cor, topo=lambda i: amp * abs(math.sin(math.pi * i / 3)), nome=nome)


def faixa_linha(pts, larg, z0, alt, cor="branco", bisel=0.0, nome="faixa"):
    """Faixa reta/curva (aberta) de largura larg centrada numa linha 2D, de z0 a z0+alt (meio-fio de floreira etc.)."""
    P = [V((p[0], p[1])) for p in pts]
    esq, dir_ = [], []
    for i, p in enumerate(P):
        a, b = P[max(0, i - 1)], P[min(len(P) - 1, i + 1)]
        t = (b - a).normalized()
        n = V((-t.y, t.x)) * (larg / 2)
        esq.append(p + n)
        dir_.append(p - n)
    cont = [(q.x, q.y) for q in dir_] + [(q.x, q.y) for q in esq[::-1]]
    return solido(cont, z0, alt, cor, bisel=bisel, nome=nome)


# =====================================================================================================================
# Vidros (dia e noite)
# =====================================================================================================================
def _sorteia(rnd, apag=APAG, frias=FRIAS):
    r = rnd.random()
    return "janela_apagada" if r < apag else ("janela_fria" if r < apag + frias else "janela")


def vidros_linha(pts, z0, andares, alt_andar=A, larg=1.6, frac=0.8, peit=0.5, alt_v=2.1, d=0.03, sem=1,
                 apag=APAG, frias=FRIAS, fechado=False, margem=0.0, pula=None, mats=None, nome="vidros"):
    """Vidros (uma face por janela, que pode dobrar seguindo a curva) ao longo de uma linha 2D. A face olha para a
    DIREITA de quem anda pela linha (num contorno anti-horário, para fora). Cada vidro sorteia janela / janela_fria /
    janela_apagada. pula(k, i) pula o vidro i do andar k. mats força uma lista de materiais possíveis."""
    P = [V((p[0], p[1])) for p in pts]
    if fechado:
        P = P + [P[0]]
    s = [0.0]
    for a, b in zip(P, P[1:]):
        s.append(s[-1] + (b - a).length)
    L = s[-1]
    nseg = [V(((b - a).normalized().y, -(b - a).normalized().x)) for a, b in zip(P, P[1:])]
    vn = []
    for j in range(len(P)):
        if 0 < j < len(P) - 1:
            q = nseg[j - 1] + nseg[j]
        elif fechado:
            q = nseg[-1] + nseg[0]
        else:
            q = nseg[min(j, len(nseg) - 1)]
        vn.append(q.normalized() if q.length > 1e-6 else nseg[min(j, len(nseg) - 1)])

    def interp(x):
        for j in range(len(P) - 1):
            if s[j + 1] >= x - 1e-9:
                t = (x - s[j]) / max(1e-9, s[j + 1] - s[j])
                return P[j].lerp(P[j + 1], max(0.0, min(1.0, t))), j
        return P[-1], len(P) - 2

    u0, u1 = margem, L - margem
    m = max(1, round((u1 - u0) / larg))
    cw = (u1 - u0) / m
    w = cw * frac
    rnd = random.Random(sem)
    baldes = {}
    for k in range(andares):
        alt_k = alt_andar[k] if isinstance(alt_andar, (list, tuple)) else alt_andar
        base_k = z0[k] if isinstance(z0, (list, tuple)) else z0 + k * alt_k
        za = base_k + peit
        zb = za + (alt_v[k] if isinstance(alt_v, (list, tuple)) else alt_v)
        for i in range(m):
            mat = rnd.choice(mats) if mats else _sorteia(rnd, apag, frias)
            if pula and pula(k, i):
                continue
            sa = u0 + cw * i + (cw - w) / 2
            sb = sa + w
            pa, ja = interp(sa)
            pb, jb = interp(sb)
            seq = [(pa, nseg[ja])] + [(P[j], vn[j]) for j in range(ja + 1, jb + 1)] + [(pb, nseg[jb])]
            vs, fs = baldes.setdefault(mat, ([], []))
            b0 = len(vs)
            for p, n in seq:
                q = p + n * d
                vs.append((q.x, q.y, za))
                vs.append((q.x, q.y, zb))
            for t in range(len(seq) - 1):
                a0, a1, c0, c1 = b0 + 2 * t, b0 + 2 * t + 1, b0 + 2 * t + 2, b0 + 2 * t + 3
                fs.append((a0, c0, c1, a1))
    objs = [malha(nome, vs, fs, cor=None, mat=mt) for mt, (vs, fs) in baldes.items() if fs]
    return mb.junta(objs, nome) if objs else None


def vidros_ret(l, p, z0, andares, alt_andar=A, cx=0.0, cy=0.0, lados="fdel", larg=1.6, sem=1, **k):
    """Vidros nas fachadas de um bloco retangular l × p (centrado em cx, cy): f = frente (−Y), d = direita (+X),
    t = trás (+Y), e = esquerda (−X)."""
    x0, x1, y0, y1 = cx - l / 2, cx + l / 2, cy - p / 2, cy + p / 2
    linhas = {"f": [(x0, y0), (x1, y0)], "d": [(x1, y0), (x1, y1)], "t": [(x1, y1), (x0, y1)],
              "e": [(x0, y1), (x0, y0)]}
    objs = [vidros_linha(linhas[c], z0, andares, alt_andar, larg=larg, sem=sem + 7 * i, **k) for i, c in
            enumerate(lados)]
    return mb.junta([o for o in objs if o], "vidros")


def janela_caixa(x, y, z, w, h, prof=0.32, cor="branco", peitoril="madeira_clara", mat="janela", face=-1, e=0.16):
    """Janela 'saltada' (moldura gorda que sai da parede) numa fachada y = const (face −1 olha para −Y)."""
    yc = y + face * prof / 2
    ps = [caixa(w + 2 * e, prof, h + 2 * e, x=x, y=yc, z=z - e, cor=cor, bisel=0.06),
          caixa(w + 2 * e + 0.1, prof + 0.08, 0.1, x=x, y=yc + face * 0.04, z=z - e - 0.04, cor=peitoril, bisel=0,
                liso=False),
          caixa(w, 0.02, h, x=x, y=y + face * (prof + 0.008), z=z, cor=None, mat=mat, bisel=0, liso=False)]
    return mb.junta(ps, "janela_caixa")


def janela_redonda(x, y, z, r=0.55, face=-1, cor="branco", mat="janela", eixo="y"):
    """Janela redonda (escotilha) com aro gordo, centro em (x, z) na fachada y (eixo 'y') ou x (eixo 'x')."""
    if eixo == "y":
        aro = mb.cilindro(r + 0.14, 0.16, x=x, y=y + face * 0.06, z=z, cor=cor, seg=16, eixo="y", bisel=0.03)
        vid = mb.cilindro(r, 0.04, x=x, y=y + face * 0.15, z=z, cor=None, mat=mat, seg=16, eixo="y", bisel=0)
    else:
        aro = mb.cilindro(r + 0.14, 0.16, x=x + face * 0.06, y=y, z=z, cor=cor, seg=16, eixo="x", bisel=0.03)
        vid = mb.cilindro(r, 0.04, x=x + face * 0.15, y=y, z=z, cor=None, mat=mat, seg=16, eixo="x", bisel=0)
    return mb.junta([aro, vid], "escotilha")


def porta_vidro(x, y, z=0.0, l=1.8, a=2.5, face=-1, cor="branco", eixo="y", mat="janela"):
    """Porta de entrada de vidro com moldura gorda e puxador (acende quente à noite)."""
    e = 0.14
    if eixo == "y":
        ps = [caixa(l + 2 * e, 0.22, a + e, x=x, y=y + face * 0.05, z=z, cor=cor, bisel=0.05),
              caixa(l, 0.04, a, x=x, y=y + face * 0.17, z=z, cor=None, mat=mat, bisel=0, liso=False),
              caixa(0.05, 0.04, a, x=x, y=y + face * 0.19, z=z, cor=cor, bisel=0.01),
              caixa(0.05, 0.08, 0.6, x=x - 0.15, y=y + face * 0.23, z=z + 0.9, cor="metal_claro", bisel=0.02),
              caixa(0.05, 0.08, 0.6, x=x + 0.15, y=y + face * 0.23, z=z + 0.9, cor="metal_claro", bisel=0.02)]
    else:
        ps = [caixa(0.22, l + 2 * e, a + e, x=x + face * 0.05, y=y, z=z, cor=cor, bisel=0.05),
              caixa(0.04, l, a, x=x + face * 0.17, y=y, z=z, cor=None, mat=mat, bisel=0, liso=False),
              caixa(0.04, 0.05, a, x=x + face * 0.19, y=y, z=z, cor=cor, bisel=0.01),
              caixa(0.08, 0.05, 0.6, x=x + face * 0.23, y=y - 0.15, z=z + 0.9, cor="metal_claro", bisel=0.02),
              caixa(0.08, 0.05, 0.6, x=x + face * 0.23, y=y + 0.15, z=z + 0.9, cor="metal_claro", bisel=0.02)]
    return mb.junta(ps, "porta")


# =====================================================================================================================
# Plantas, telhado e letreiros
# =====================================================================================================================
def bola(r, x, y, z, cor="verde_lima", esc=(1, 1, 1), sub=2, nome="bola"):
    """Bola fofa (copa, arbusto), centro em (x, y, z)."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    bm.transform(Matrix.Translation((x, y, z)) @ Matrix.Diagonal((*esc, 1)))
    return mb._obj(nome, bm, cor, angulo=89)


def arvore(x, y, z, h=3.0, r=1.0, cor="verde_lima", tronco="madeira_media", sub=3):
    """Arvorezinha 'pirulito': tronco fino e copa redonda."""
    t = mb.cilindro(max(0.07, r * 0.13), h - r * 1.3, x=x, y=y, z=z, cor=tronco, seg=6, bisel=0)
    c = bola(r, x, y, z + h - r, cor, esc=(1, 1, 1.1), sub=sub)
    return [t, c]


def pinheiro(x, y, z, h=1.6, r=0.45, cor="folha_escura"):
    """Arbusto cônico (tuia) de floreira."""
    return [mb.cilindro(r, h, x=x, y=y, z=z, r2=0.02, cor=cor, seg=7, bisel=0),
            mb.cilindro(r * 0.25, 0.25, x=x, y=y, z=z - 0.05, cor="madeira_media", seg=6, bisel=0)]


def moita(x, y, z, r=0.5, cor="folha_clara", sem=0):
    """Moita de três bolinhas."""
    rnd = random.Random(sem)
    out = [bola(r, x, y, z + r * 0.92, cor, esc=(1, 1, 0.9))]
    for k in range(2):
        a = rnd.uniform(0, 2 * math.pi)
        rr = r * rnd.uniform(0.55, 0.75)
        out.append(bola(rr, x + math.cos(a) * r * 0.8, y + math.sin(a) * r * 0.8, z + rr * 0.92, cor,
                        esc=(1, 1, 0.9)))
    return out


def jardim(pts, z, sem=1, arvores=3, moitas=4, h_arv=(2.4, 3.6), cores=("verde_lima", "folha_clara", "verde_claro"),
           borda=True, alt_terra=0.18, sebe_cor="folha", evita=()):
    """Jardim de telhado num contorno: gramado, sebe na borda e árvores/moitas sorteadas dentro."""
    rnd = random.Random(sem)
    out = [solido(pts, z, alt_terra, "grama", bisel=0.04)]
    if borda:
        out.append(sebe(pts, z + alt_terra - 0.02, larg=0.45, alt=0.4, cor=sebe_cor, amp=0.12))
    dentro = desloca(pts, -1.2)
    xs = [p[0] for p in dentro]
    ys = [p[1] for p in dentro]
    pontos = []

    def dentro_de(x, y, poly):
        c = False
        for (x1, y1), (x2, y2) in zip(poly, poly[1:] + poly[:1]):
            if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1 + 1e-12) + x1:
                c = not c
        return c

    tent = 0
    while len(pontos) < arvores + moitas and tent < 400:
        tent += 1
        x, y = rnd.uniform(min(xs), max(xs)), rnd.uniform(min(ys), max(ys))
        if not dentro_de(x, y, dentro):
            continue
        if any((x - a) ** 2 + (y - b) ** 2 < 1.6 ** 2 for a, b in pontos):
            continue
        if any((x - a) ** 2 + (y - b) ** 2 < r ** 2 for a, b, r in evita):
            continue
        pontos.append((x, y))
    zt = z + alt_terra
    for i, (x, y) in enumerate(pontos):
        if i < arvores:
            h = rnd.uniform(*h_arv)
            out += arvore(x, y, zt, h=h, r=h * 0.33, cor=rnd.choice(cores))
        else:
            out += moita(x, y, zt, r=rnd.uniform(0.35, 0.55), cor=rnd.choice(cores), sem=sem * 31 + i)
    return out


def floreira(x0, y0, x1, y1, z, alt=0.5, larg=0.6, cor="branco", planta="folha_clara", sem=0, bolinhas=True):
    """Floreira reta (caixa branca com terra e plantas) entre dois pontos."""
    a, b = V((x0, y0)), V((x1, y1))
    L = (b - a).length
    ang = math.degrees(math.atan2(b.y - a.y, b.x - a.x))
    c = (a + b) / 2
    caixa_ = caixa(L, larg, alt, cor=cor, bisel=0.06)
    terra = caixa(L - 0.12, larg - 0.12, 0.05, z=alt - 0.03, cor="terra", bisel=0)
    planta_ = caixa(L - 0.16, larg - 0.18, 0.3, z=alt - 0.05, cor=planta, bisel=0.12, seg=2)
    objs = [caixa_, terra, planta_]
    if bolinhas:
        rnd = random.Random(sem)
        n = max(1, int(L / 1.1))
        for k in range(n):
            xx = -L / 2 + L * (k + 0.5) / n + rnd.uniform(-0.15, 0.15)
            objs.append(bola(rnd.uniform(0.2, 0.3), xx, 0, alt + 0.25, rnd.choice(("verde_lima", planta, "verde_claro")),
                             ))
    ob = mb.junta(objs, "floreira")
    mb.transforma(ob, loc=(c.x, c.y, z), rot=("Z", ang))
    return ob


def paineis_solares(x, y, z, l, p, nx, ny, incl=10.0, rot=0.0, cor="cinza_azulado", moldura="branco"):
    """Painel solar: estrutura branca com placas azul-ardósia, inclinado incl graus (sobe para +Y)."""
    ps = [caixa(l, p, 0.1, z=0, cor=moldura, bisel=0.03, seg=1)]
    gw, gp = l / nx, p / ny
    for i in range(nx):
        for j in range(ny):
            ps.append(caixa(gw - 0.07, gp - 0.07, 0.05, x=-l / 2 + gw * (i + 0.5), y=-p / 2 + gp * (j + 0.5), z=0.07,
                               cor=cor, bisel=0, liso=False))
    pl = mb.junta(ps, "painel")
    mb.transforma(pl, rot=("X", incl))
    h = math.sin(math.radians(incl)) * p / 2
    pes = [caixa(0.12, 0.12, max(0.05, h + 0.25 + sy * h), x=sx * (l / 2 - 0.3), y=sy * (p / 2 - 0.3) *
                    math.cos(math.radians(incl)), z=-0.25 - h, cor="metal", bisel=0.02)
           for sx in (-1, 1) for sy in (-1, 1)]
    pl = mb.junta([pl] + pes, "painel_solar")
    mb.transforma(pl, loc=(x, y, z + 0.25 + h), rot=("Z", rot))
    return pl


def caixa_dagua(x, y, z, r=0.9, h=1.4, cor="branco"):
    return mb.junta([mb.cilindro(r, h, x=x, y=y, z=z + 0.3, cor=cor, seg=16, bisel=0.12),
                     mb.cilindro(r * 0.6, 0.3, x=x, y=y, z=z, cor="cinza", seg=12, bisel=0.02),
                     mb.cilindro(r * 0.7, 0.18, x=x, y=y, z=z + h + 0.3, r2=r * 0.3, cor=cor, seg=16, bisel=0.03)],
                    "caixa_dagua")


def placa(nome, l, a, x, y, z, face=-1, moldura="branco", prof=0.18, rot=0.0):
    """Letreiro com estampa (PNG de predios_ecologicos_estampas.py) numa placa com moldura gorda, olhando para −Y
    (face −1) e girado rot graus em Z em volta de (x, y)."""
    png = os.path.join(EST_DIR, f"placa_{nome}.png")
    mi = mb.material_estampa("eco_" + nome, png)
    fundo = caixa(l + 0.24, prof, a + 0.24, x=0, y=prof / 2, z=-0.12, cor=moldura, bisel=0.08, seg=2)
    yq = -0.006
    q = malha("placa_" + nome, [(-l / 2, yq, 0), (l / 2, yq, 0), (l / 2, yq, a), (-l / 2, yq, a)], [(0, 1, 2, 3)],
              mat=mi, uvs=[[(0, 0), (1, 0), (1, 1), (0, 1)]])
    luz_ = caixa(l * 0.7, 0.1, 0.06, x=0, y=-0.25, z=a + 0.18, cor=None, mat="luz", bisel=0, liso=False)
    braco = [caixa(0.05, 0.3, 0.05, x=sx * l * 0.3, y=-0.12, z=a + 0.2, cor="metal_escuro", bisel=0, liso=False)
             for sx in (-1, 1)]
    ob = mb.junta([fundo, q, luz_] + braco, "placa")
    mb.transforma(ob, loc=(x, y, z), rot=("Z", rot + (0 if face < 0 else 180)))
    return ob


def neon_linha(pts, z, r=0.07, fechado=False):
    """Fio de neon ciano (material neon) ao longo de uma linha 2D na altura z."""
    p3 = [(p[0], p[1], z) for p in pts]
    if fechado:
        p3.append(p3[0])
    return mb.tubo(p3, r, cor=None, mat="neon", raio_curva=0.05, seg=6, nome="neon")


def barra(p0, p1, larg, esp, nome="barra", cor="branco"):
    """Barra reta (caixa orientada) de p0 a p1 (3D), larg na direção perpendicular dentro do plano vertical,
    esp para fora (−Y quando a barra está num plano y = const)."""
    a, b = V(p0), V(p1)
    t = (b - a)
    L = t.length
    ob = caixa(L, esp, larg, x=0, y=0, z=-larg / 2, cor=cor, bisel=0, liso=False, nome=nome)
    ang = math.degrees(math.atan2(t.z, math.hypot(t.x, t.y)))
    az = math.degrees(math.atan2(t.y, t.x))
    mb.transforma(ob, loc=tuple((a + b) / 2), rot=[("Z", az), ("Y", -ang)])
    return ob


def espelha_y(ob):
    c = mb.copia(ob)
    c.data.transform(Matrix.Diagonal((1, -1, 1, 1)))
    c.data.flip_normals()
    return c


# =====================================================================================================================
# Prédios grandes
# =====================================================================================================================
def torre_degraus_inclinada(it, verde="verde_lima"):
    """Torre em degraus inclinada (rampa de esqui): andares escalonados com terraços cheios de plantas entre duas
    paredes brancas curvas, voltada para a rua; janelas saltadas na lateral. Lote 1 × 2."""
    N = 15
    L = niveis(N)
    X0, X1, YC, YW = -13.0, 12.6, 4.9, 0.75
    xa, xb = -6.0, 11.0

    def xe(j):
        if j <= 2:
            return X1
        t = (j - 2) / (N - 1 - 2)
        return xa + (xb - xa) * (1 - t) ** 1.6

    E = [xe(j) for j in range(N)]
    for j in range(N - 2, 2, -1):  # terraço de pelo menos 0,9 m (cabe a floreira com as moitas)
        E[j] = max(E[j], E[j + 1] + 0.9)
    # paredes laterais curvas
    perfil = [(E[j] + 0.25, L[j + 1] + 0.7) for j in range(2, N)]
    perfil = chaikin([(13.0, L[3] + 0.7)] + perfil + [(X0 + 2.5, L[N] + 0.8)], it=2, fechado=False)
    cont = [(X0, 0.0), (13.0, 0.0)] + perfil + [(X0 + 0.9, L[N] + 0.75), (X0, L[N])]
    for ys in (-1, 1):
        y0 = -YC - YW if ys < 0 else YC
        it.add(mb.extrudado(ccw(cont), YW, y=y0, cor="branco", bisel=0.28, seg=2, plano="xz", nome="parede"))
    for j in range(N):
        z0, z1 = L[j], L[j + 1]
        it.add(caixa(E[j] - X0 - 0.4, 2 * YC, z1 - z0, x=(E[j] + X0 + 0.4) / 2, z=z0, cor="branco_gelo", bisel=0,
                        liso=False))
        it.add(caixa(E[j] - X0 + 0.0, 2 * YC + 0.1, 0.42, x=(E[j] + X0 + 0.4) / 2 + 0.2, z=z1 - 0.3,
                        cor="branco", bisel=0.16, seg=2))
        it.add(vidros_linha([(E[j], -YC + 0.3), (E[j], YC - 0.3)], z0 + 0.12, 1, z1 - z0,
                            larg=3.0 if j == 0 else 2.4, frac=0.86, peit=0.25 if j else 0.1,
                            alt_v=z1 - z0 - (0.75 if j else 0.9), sem=40 + j,
                            pula=(lambda k, i: i == 1) if j == 0 else None))
        it.add(vidros_linha([(X0 + 0.4, YC - 0.3), (X0 + 0.4, -YC + 0.3)], z0 + 0.12, 1, z1 - z0, larg=2.0,
                            frac=0.8, peit=0.35, alt_v=z1 - z0 - 1.0, sem=90 + j))
        if j >= 2 and j < N - 1:  # terraço sobre o andar j (entre E[j+1] e E[j])
            zt = z1 + 0.12
            if j == 2:
                it.add(solido(circ(2.4, 28, 9.0, 0.0), zt, 0.75, "branco", bisel=0.25))
                it.add(solido(circ(2.15, 28, 9.0, 0.0), zt + 0.5, 0.3, "grama", bisel=0.05))
                it.add(arvore(9.0, 0.0, zt + 0.8, h=3.6, r=1.2, cor=verde))
                it.add(arvore(8.2, -1.3, zt + 0.8, h=2.6, r=0.8, cor="folha_clara"))
                it.add(moita(10.0, 1.0, zt + 0.8, 0.55, "verde_claro", sem=3))
                it.add(floreira(E[3] + 0.6, -4.6, E[3] + 0.6, 4.6, zt, alt=0.45, larg=0.7, sem=9))
                it.add(floreira(12.2, -4.6, 12.2, 4.6, zt, alt=0.5, larg=0.6, sem=8))
            else:
                xf = E[j] - 0.45
                it.add(floreira(xf, -YC + 0.2, xf, YC - 0.2, zt, alt=0.5, larg=0.62, cor="branco", planta="folha",
                                sem=j, bolinhas=False))
                rnd = random.Random(j)
                for k in range(3):
                    yy = -3.0 + k * 3.0 + rnd.uniform(-0.3, 0.3)
                    rr = rnd.uniform(0.58, 0.78)
                    it.add(bola(rr, xf + rnd.uniform(-0.1, 0.1), yy, zt + 0.5 + rr * 0.6,
                                rnd.choice((verde, "folha_clara", "verde_claro")), esc=(0.9, 1.25, 0.9)))
    # telhado do topo: placas solares
    it.add(paineis_solares(X0 + 3.6, 0, L[N] + 0.15, 5.0, 8.0, 3, 5, incl=0))
    # lateral da frente (e de trás): janelas saltadas sorteadas
    for j in range(1, N):  # lateral −Y: vidros lisos
        fim = min(E[j], E[j - 1]) - 1.0 if j > 2 else 12.0
        it.add(vidros_linha([(X0 + 1.0, -(YC + YW)), (fim, -(YC + YW))], L[j], 1, L[j + 1] - L[j], larg=2.4,
                            frac=0.7, peit=0.7, alt_v=1.8, sem=200 + j))
    for ys, sem in ((1, 5),):  # lateral +Y (vira a direita do prédio): janelas saltadas
        rnd = random.Random(sem)
        ygl = ys * (YC + YW)
        for j in range(1, N):
            x = X0 + 1.2 + rnd.uniform(0, 1.5)
            fim = min(E[j], E[j - 1]) - 1.6 if j > 2 else 11.6
            while x < fim:
                w = rnd.choice((1.6, 2.1, 2.6, 3.2))
                if x + w > fim:
                    break
                h = rnd.choice((1.5, 1.8, 2.0))
                z = L[j] + (L[j + 1] - L[j] - h) / 2 + 0.1
                it.add(janela_caixa(x + w / 2, ygl, z, w, h, face=ys, mat=_sorteia(rnd)))
                x += w + rnd.uniform(1.4, 3.0)
    # térreo: entrada na ponta baixa da rampa (vira a frente) e porta lateral
    it.add(porta_vidro(X1, 0, 0, l=2.4, a=3.0, face=1, eixo="x"))
    it.add(caixa(0.9, 4.4, 0.3, x=X1 + 0.35, y=0, z=3.4, cor="branco", bisel=0.12))
    it.add(porta_vidro(-6.0, YC + YW, 0, l=2.0, a=2.8, face=1))
    it.add(floreira(X1 + 0.2, -4.4, X1 + 0.2, -1.8, 0, alt=0.5, larg=0.5, sem=11))
    it.add(floreira(X1 + 0.2, 1.8, X1 + 0.2, 4.4, 0, alt=0.5, larg=0.5, sem=12))
    caixas = [((0, 0, 0), (26.0, 12.0, L[3] + 1.0)),
              ((-13 + (E[6] + 13) / 2, 0, L[3]), (E[6] + 13, 12.0, L[7] - L[3])),
              ((-13 + (E[10] + 13) / 2, 0, L[7]), (E[10] + 13, 12.0, L[11] - L[7])),
              ((-13 + (E[N - 1] + 13) / 2, 0, L[11]), (E[N - 1] + 13, 12.0, L[N] + 1.0 - L[11]))]
    # gira −90° em Z: a rampa de terraços olha para a rua (−Y); o lote fica 1 × 2
    for o in it.partes:
        mb.transforma(o, rot=("Z", -90))
    it.colisao([((c[1], -c[0], c[2]), (t[1], t[0], t[2])) for c, t in caixas])


def torre_lajes_arredondadas(it, base="terracota", labio="amarelo_claro", planta="folha_clara", topo="azul"):
    """Torre de lajes arredondadas empilhadas, cada andar com floreira contínua; base colorida. Lote 1 × 1."""
    N = 12
    L = niveis(N)
    nucleo = superelipse(7.4, 6.8, e=0.5, n=40)
    it.add(solido(nucleo, T0 - 0.2, L[N] - T0 + 0.2, "branco_gelo"))
    it.add(vidros_linha(nucleo, L[1:N], N - 1, [A] * (N - 1), larg=1.55, frac=0.84, peit=0.32, alt_v=2.35,
                        fechado=True, sem=11, d=0.03))
    # base (térreo)
    bpts = ret(10.4, 9.6, 1.6)
    it.add(solido(bpts, 0, T0, base, bisel=0.2))
    it.add(vidros_ret(10.4, 9.6, 0.0, 1, T0, lados="dte", larg=2.0, peit=1.0, alt_v=2.3, margem=1.0, sem=3))
    it.add(vidros_linha([(-5.2 + 1.0, -4.8), (-1.6, -4.8)], 0.0, 1, T0, larg=1.6, peit=0.6, alt_v=2.8,
                        mats=["janela", "janela_fria"], sem=4))
    it.add(vidros_linha([(1.6, -4.8), (5.2 - 1.0, -4.8)], 0.0, 1, T0, larg=1.6, peit=0.6, alt_v=2.8,
                        mats=["janela", "janela_fria"], sem=5))
    it.add(porta_vidro(0, -4.8, 0, l=2.0, a=2.9))
    for k in range(N):
        z = L[k + 1] if k < N - 1 else L[N]
        fi, ps = 1.3 * k, 0.9 * k + 0.6
        sx, sy = 0.32 * math.sin(0.8 * k), 0.25 * math.cos(0.6 * k)

        def onda(th, fi=fi, ps=ps):
            return 1 + 0.04 * math.sin(3 * th + fi) + 0.025 * math.sin(2 * th + ps)

        laje = superelipse(11.2, 10.6, e=0.55, n=32, cx=sx, cy=sy, onda=onda)
        it.add(solido(laje, z - 0.22, 0.45, "branco", bisel=0.18, seg=1))
        if k == N - 1:
            break
        it.add(anel(desloca(laje, -0.16), desloca(laje, -0.42), z + 0.2, z + 0.3, labio))
        it.add(sebe(desloca(laje, -0.42), z + 0.22, larg=0.55, alt=0.5, cor=planta, per=2.4))
        rnd = random.Random(k)
        for q in range(2):
            i = rnd.randrange(len(laje))
            p = V(desloca(laje, -0.75)[i])
            it.add(pinheiro(p.x, p.y, z + 0.25, h=rnd.uniform(1.2, 1.8), r=0.38))
    # topo
    zt = L[N] + 0.23
    it.add(solido(ret(6.6, 5.8, 1.2), zt, 1.2, topo, bisel=0.3))
    it.add(paineis_solares(0, 0, zt + 1.2, 5.2, 4.4, 3, 3, incl=0))
    it.add(sebe(desloca(superelipse(11.2, 10.6, e=0.55, n=40), -0.4), zt - 0.02, larg=0.6, alt=0.5, cor=planta))
    it.add(pinheiro(-4.0, 3.2, zt, h=1.8, r=0.45), pinheiro(3.9, -3.4, zt, h=1.5, r=0.4))
    it.colisao([((0, 0, 0), (11.6, 11.0, L[N] + 1.6))])


def predio_trelica_verde(it, painel="grama", trelica="branco", detalhe="madeira_mel"):
    """Prédio alto retangular com painéis verdes e treliça branca em losangos na fachada. Lote 1 × 1."""
    N = 15
    L = niveis(N)
    LX, PY = 11.4, 10.0
    H = L[N]
    it.add(caixa(LX, PY, H, cor="branco", bisel=0.55, seg=3))
    yf = -PY / 2
    # painéis verdes com treliça (frente) e um na esquerda
    for (x0, x1) in ((-4.75, -1.55), (1.55, 4.75)):
        z0, z1 = T0 + 0.4, H - 1.4
        it.add(caixa(x1 - x0, 0.12, z1 - z0, x=(x0 + x1) / 2, y=yf - 0.04, z=z0, cor=painel, bisel=0.03))
        w = x1 - x0
        n = max(1, round((z1 - z0) / (w * 1.15)))
        hh = (z1 - z0) / n
        yb = yf - 0.15
        for k in range(n):
            za, zb = z0 + k * hh, z0 + (k + 1) * hh
            it.add(barra((x0 + 0.05, yb, za), (x1 - 0.05, yb, zb), 0.17, 0.08, cor=trelica))
            it.add(barra((x1 - 0.05, yb, za), (x0 + 0.05, yb, zb), 0.17, 0.08, cor=trelica))
            it.add(caixa(w, 0.1, 0.14, x=(x0 + x1) / 2, y=yb, z=zb - 0.07, cor=trelica, bisel=0, liso=False))
        for xx in (x0, x1):
            it.add(caixa(0.2, 0.12, z1 - z0, x=xx, y=yb, z=z0, cor=trelica, bisel=0.03, seg=1))
        it.add(caixa(w + 0.2, 0.12, 0.2, x=(x0 + x1) / 2, y=yb, z=z0 - 0.1, cor=trelica, bisel=0.03, seg=1))
    # faixa central de vidro
    it.add(caixa(2.9, 0.1, H - T0 - 1.0, x=0, y=yf + 0.02, z=T0, cor="branco_gelo", bisel=0))
    it.add(vidros_linha([(-1.35, yf - 0.03), (1.35, yf - 0.03)], T0, N - 1, A, larg=2.7, frac=0.9, peit=0.3,
                        alt_v=2.5, sem=21))
    it.add(caixa(2.9, 0.4, 0.5, x=0, y=yf - 0.1, z=H - 1.6, cor=detalhe, bisel=0.1))
    # direita: varandas em faixas
    for j in range(1, N):
        it.add(caixa(1.0, PY - 1.4, 0.24, x=LX / 2 + 0.3, y=0, z=L[j] - 0.12, cor="branco", bisel=0.1, seg=1))
        it.add(caixa(0.06, PY - 1.6, 0.7, x=LX / 2 + 0.72, y=0, z=L[j] + 0.12, cor=None, mat="vidro", bisel=0))
    it.add(vidros_linha([(LX / 2, -PY / 2 + 0.9), (LX / 2, PY / 2 - 0.9)], T0, N - 1, A, larg=1.4, frac=0.86,
                        peit=0.35, alt_v=2.35, sem=22))
    # esquerda e fundos
    it.add(vidros_linha([(-LX / 2, PY / 2 - 0.9), (-LX / 2, -PY / 2 + 0.9)], T0, N - 1, A, larg=1.6, frac=0.7,
                        peit=0.7, alt_v=1.8, sem=23))
    it.add(vidros_linha([(LX / 2 - 0.9, PY / 2), (-LX / 2 + 0.9, PY / 2)], T0, N - 1, A, larg=1.7, frac=0.72,
                        peit=0.7, alt_v=1.8, sem=24))
    # térreo
    it.add(vidros_linha([(-5.0, yf), (-1.4, yf)], 0.0, 1, T0, larg=1.8, frac=0.9, peit=0.5, alt_v=3.0,
                        mats=["janela", "janela_fria"], sem=25))
    it.add(vidros_linha([(1.4, yf), (5.0, yf)], 0.0, 1, T0, larg=1.8, frac=0.9, peit=0.5, alt_v=3.0,
                        mats=["janela", "janela_fria"], sem=26))
    it.add(porta_vidro(0, yf, 0, l=2.0, a=3.0))
    it.add(caixa(4.0, 1.4, 0.32, x=0, y=yf - 0.6, z=3.5, cor="branco", bisel=0.14))
    it.add(floreira(-5.0, yf - 0.55, -1.6, yf - 0.55, 0, alt=0.5, larg=0.7, sem=2))
    it.add(floreira(1.6, yf - 0.55, 5.0, yf - 0.55, 0, alt=0.5, larg=0.7, sem=3))
    # telhado
    it.add(caixa(LX - 1.1, PY - 1.1, 0.12, z=H, cor="cinza_claro", bisel=0.05))
    it.add(paineis_solares(-1.2, -0.6, H + 0.1, 7.6, 3.6, 5, 2, incl=12))
    for x, y, h in ((-4.2, 3.4, 3.0), (0.6, 3.6, 3.6), (3.8, 3.2, 2.8)):
        it.add(solido(circ(0.9, 16, x, y), H, 0.6, "branco", bisel=0.15))
        it.add(arvore(x, y, H + 0.55, h=h, r=0.85, cor="verde_lima"))
    it.add(caixa_dagua(4.2, -2.6, H + 0.1))
    it.colisao([((0, 0, 0), (LX + 0.9, PY, H + 0.4))])


def escritorio_jardim_telhado(it, moldura="branco", madeira="madeira_mel", verde="verde_lima"):
    """Bloco de escritórios com moldura branca gorda, faixas de vidro e jardim no telhado sob uma cobertura solar.
    Lote 1 × 1."""
    N = 6
    L = niveis(N)
    LX, PY = 12.8, 10.4
    H = L[N]
    nx, ny = LX - 2.2, PY - 1.8
    it.add(caixa(nx, ny, H, cor="branco_gelo", bisel=0, liso=False))
    for sx in (-1, 1):
        it.add(caixa(1.1, PY, H + 0.8, x=sx * (LX / 2 - 0.55), cor=moldura, bisel=0.5, seg=3))
    it.add(caixa(LX, PY, 1.0, z=H - 0.2, cor=moldura, bisel=0.5, seg=3))
    it.add(caixa(LX - 0.2, PY - 0.2, 0.35, z=0, cor="concreto", bisel=0.12))
    for j in range(1, N):
        it.add(caixa(nx + 0.1, ny + 0.9, 0.28, z=L[j] - 0.14, cor="branco", bisel=0.12, seg=2))
    for ys, sem in ((-1, 30), (1, 31)):
        y = ys * ny / 2
        pts = [(-nx / 2, y), (nx / 2, y)] if ys < 0 else [(nx / 2, y), (-nx / 2, y)]
        it.add(vidros_linha(pts, L[1:N], N - 1, [A] * (N - 1), larg=1.05, frac=0.88, peit=0.25, alt_v=2.55, sem=sem))
    # térreo
    yf = -ny / 2
    it.add(vidros_linha([(-nx / 2, yf), (-1.4, yf)], 0.35, 1, T0, larg=1.8, frac=0.92, peit=0.2, alt_v=3.0,
                        mats=["janela", "janela_fria"], sem=32))
    it.add(vidros_linha([(1.4, yf), (nx / 2, yf)], 0.35, 1, T0, larg=1.8, frac=0.92, peit=0.2, alt_v=3.0,
                        mats=["janela", "janela_fria"], sem=33))
    it.add(porta_vidro(0, yf, 0.35, l=2.2, a=2.9))
    it.add(vidros_linha([(nx / 2, ny / 2), (-nx / 2, ny / 2)], 0.35, 1, T0, larg=2.2, frac=0.85, peit=0.4,
                        alt_v=2.6, sem=34))
    # telhado: deque, jardim e cobertura solar
    zt = H + 0.8
    it.add(caixa(LX - 1.4, PY - 1.4, 0.12, z=zt, cor=madeira, bisel=0.04))
    it.add(jardim(ret(LX - 2.0, 3.6, 0.8, cy=-PY / 2 + 2.6), zt + 0.1, sem=4, arvores=3, moitas=3, h_arv=(2.4, 3.2),
                  cores=(verde, "folha_clara", "verde_claro")))
    it.add(floreira(-LX / 2 + 1.1, 0.5, -LX / 2 + 1.1, PY / 2 - 1.0, zt + 0.1, larg=0.6, sem=5))
    zc = zt + 3.2
    for sx in (-1, 1):
        for y in (0.6, PY / 2 - 0.9):
            it.add(mb.cilindro(0.12, zc - zt, x=sx * (LX / 2 - 1.4), y=y, z=zt + 0.1, cor="branco", seg=10, bisel=0.02))
    it.add(caixa(LX - 1.6, 4.6, 0.22, y=PY / 2 - 2.6, z=zc, cor=madeira, bisel=0.08))
    it.add(caixa(LX - 1.2, 5.0, 0.26, y=PY / 2 - 2.6, z=zc + 0.2, cor="branco", bisel=0.12))
    it.add(paineis_solares(0, PY / 2 - 2.6, zc + 0.36, LX - 2.0, 4.2, 6, 2, incl=0))
    it.colisao([((0, 0, 0), (LX, PY, H + 0.9)), ((0, PY / 2 - 2.6, zt), (LX - 1.2, 5.0, zc + 0.6 - zt))])


def y_frente(cont, x):
    """Menor y do contorno perto da abscissa x (para pôr porta/letreiro na fachada curva da frente)."""
    P = ccw(cont)
    melhor = None
    for (x1, y1), (x2, y2) in zip(P, P[1:] + P[:1]):
        if (x1 - x) * (x2 - x) <= 0 and abs(x2 - x1) > 1e-9:
            y = y1 + (y2 - y1) * (x - x1) / (x2 - x1)
            melhor = y if melhor is None else min(melhor, y)
    return melhor


def tangente_frente(cont, x):
    """Ângulo (graus) da fachada da frente na abscissa x (para girar placa/porta junto com a curva)."""
    ya, yb = y_frente(cont, x - 0.5), y_frente(cont, x + 0.5)
    return math.degrees(math.atan2(yb - ya, 1.0))


def corta_x(pts, x, lado):
    """Recorta um contorno pelo semiplano x <= x (lado −1) ou x >= x (lado +1)."""
    out = []
    P = ccw(pts)
    dentro = (lambda p: p[0] <= x) if lado < 0 else (lambda p: p[0] >= x)
    cortes = []
    for a, b in zip(P, P[1:] + P[:1]):
        da, db = dentro(a), dentro(b)
        if da:
            out.append(a)
        if da != db:
            t = (x - a[0]) / (b[0] - a[0])
            out.append((x, a[1] + (b[1] - a[1]) * t))
            cortes.append(out[-1])
    # tira os vértices colados nos pontos de corte (dariam arestas minúsculas, que estragam o deslocamento)
    return [p for p in out if p in cortes or all(math.dist(p, c) > 0.45 for c in cortes)]


def predio_curvo_sinuoso_a(it, verde="verde_lima"):
    """Prédio curvo de andares sinuosos (planta em S) com torre redonda e árvores no topo. Lote 2 × 1."""
    L = niveis(7)
    ctrl = [(-13, -2.4), (-9.5, -6.2), (-3.5, -6.3), (1.5, -4.3), (6.5, -6.4), (12.4, -5.6), (13.0, 0.0),
            (12.2, 5.8), (6.0, 6.3), (1.0, 4.6), (-4.0, 6.3), (-10.5, 6.1), (-13.0, 3.0)]
    fora = reamostra(chaikin(ctrl, 3), 72)
    nuc = desloca(fora, -1.1)
    tx, ty, tr = 7.4, 0.6, 4.2
    it.add(solido(nuc, 0, L[3], "branco_gelo"))
    it.add(vidros_linha(nuc, [0.0, L[1], L[2]], 3, [T0, A, A], larg=1.9, frac=0.86, peit=0.35,
                        alt_v=[T0 - 1.1, A - 0.85, A - 0.85], fechado=True, sem=51))
    for k in range(3):
        laje = desloca(fora, -0.5 + 0.25 * k)
        it.add(solido(laje, L[k + 1] - 0.3, 0.55, "branco", bisel=0.22))
        if k < 2:
            it.add(sebe(desloca(laje, -0.15), L[k + 1] + 0.22, larg=0.45, alt=0.42, cor="folha_clara", per=2.4))
    # jardim do telhado da base
    it.add(jardim(desloca(fora, -0.15), L[3] + 0.25, sem=7, arvores=6, moitas=6, h_arv=(2.6, 3.8),
                  cores=(verde, "folha_clara", "verde_claro"), evita=[(tx, ty, tr + 1.0)]))
    # torre redonda
    tor = circ(tr - 0.7, 36, tx, ty)
    it.add(solido(tor, L[3], L[7] - L[3], "branco_gelo"))
    it.add(vidros_linha(tor, L[3:7], 4, [A] * 4, larg=1.7, frac=0.86, peit=0.4, alt_v=2.3, fechado=True, sem=52))
    for k in range(3, 7):
        ond = (lambda th, k=k: 1 + 0.035 * math.sin(3 * th + k))
        laje = superelipse(2 * tr, 2 * tr, e=1.0, n=36, cx=tx, cy=ty, onda=ond)
        it.add(solido(laje, L[k + 1] - 0.3, 0.5, "branco", bisel=0.2))
    zt = L[7] + 0.2
    borda = circ(tr + 0.05, 36, tx, ty)
    it.add(anel(borda, circ(tr - 0.45, 36, tx, ty), zt - 0.1, zt + 0.75, "branco", nome="borda"))
    it.add(solido(circ(tr - 0.4, 36, tx, ty), zt, 0.45, "grama"))
    it.add(arvore(tx - 1.2, ty + 0.8, zt + 0.45, h=3.6, r=1.15, cor=verde))
    it.add(arvore(tx + 1.4, ty - 0.6, zt + 0.45, h=3.0, r=0.95, cor="folha_clara"))
    it.add(moita(tx + 0.2, ty + 2.2, zt + 0.45, 0.55, "verde_claro", sem=2))
    it.add(moita(tx - 1.6, ty - 1.9, zt + 0.45, 0.5, verde, sem=3))
    # entrada
    xp = -3.0
    yp = y_frente(nuc, xp)
    it.add(porta_vidro(xp, yp, 0, l=2.4, a=3.0))
    it.add(caixa(4.6, 1.1, 0.3, x=xp, y=yp - 0.45, z=3.4, cor="branco", bisel=0.12))
    it.add(floreira(xp - 4.6, yp - 0.3, xp - 2.4, yp - 0.45, 0, sem=4))
    it.colisao([((0, 0, 0), (26.0, 12.6, L[3] + 0.4)), ((tx, ty, L[3]), (2 * tr, 2 * tr, L[7] - L[3] + 0.9))])


def predio_curvo_sinuoso_b(it, verde="verde_lima"):
    """Prédio curvo de andares sinuosos: cada laje ondula com a fase deslocada, como ondas; jardim no topo.
    Lote 2 × 1."""
    N = 6
    L = niveis(N)
    nuc = superelipse(21.6, 6.6, e=0.4, n=48)
    it.add(solido(nuc, 0, L[N], "branco_gelo"))
    it.add(vidros_linha(nuc, L[0:N], N, [T0] + [A] * (N - 1), larg=1.8, frac=0.86, peit=0.35,
                        alt_v=[T0 - 1.1] + [A - 0.8] * (N - 1), fechado=True, sem=61))
    for k in range(N):
        fi = 0.65 * k

        def onda_xy(pts, fi=fi):
            return [(x, y * (1 + 0.12 * math.sin(2 * math.pi * x / 12.5 + fi + (0.0 if y < 0 else 1.7))))
                    for x, y in pts]

        laje = onda_xy(superelipse(25.4, 10.0, e=0.35, n=64))
        z = L[k + 1]
        it.add(solido(laje, z - 0.3, 0.52, "branco", bisel=0.2))
        if k < N - 1:
            it.add(sebe(desloca(laje, -0.18), z + 0.2, larg=0.5, alt=0.45, cor="folha_clara" if k % 2 else verde,
                        per=2.4))
            rnd = random.Random(k)
            for q in range(2):
                x = rnd.uniform(-10, 10)
                y = y_frente(laje, x) + 0.7
                it.add(pinheiro(x, y, z + 0.2, h=rnd.uniform(1.3, 1.9), r=0.4))
        else:
            it.add(jardim(desloca(laje, -0.2), z + 0.22, sem=12, arvores=7, moitas=5, h_arv=(2.6, 3.8),
                          cores=(verde, "folha_clara", "verde_claro"), evita=[(5.5, 1.0, 3.0)]))
            it.add(paineis_solares(5.5, 1.0, z + 0.25, 4.4, 3.0, 3, 2, incl=14))
    yp = y_frente(nuc, 0)
    it.add(porta_vidro(0, yp, 0, l=2.4, a=3.0))
    it.add(floreira(-5.5, -5.3, -2.2, -5.3, 0, sem=5), floreira(2.2, -5.3, 5.5, -5.3, 0, sem=6))
    it.colisao([((0, 0, 0), (25.6, 11.0, L[N] + 0.4))])


def vidros_ate(pts, z0, ztop, larg=2.0, frac=0.9, d=0.03, sem=1, fechado=True, nome="vidros"):
    """Vidros de altura variável (do z0 até ztop(x, y) em cada ponto), para paredes sob cobertura ondulada."""
    P = [V((p[0], p[1])) for p in pts]
    if fechado:
        P = P + [P[0]]
    s = [0.0]
    for a, b in zip(P, P[1:]):
        s.append(s[-1] + (b - a).length)
    Ltot = s[-1]
    nseg = [V(((b - a).normalized().y, -(b - a).normalized().x)) for a, b in zip(P, P[1:])]
    m = max(1, round(Ltot / larg))
    cw = Ltot / m
    w = cw * frac
    rnd = random.Random(sem)
    baldes = {}

    def interp(x):
        for j in range(len(P) - 1):
            if s[j + 1] >= x - 1e-9:
                t = (x - s[j]) / max(1e-9, s[j + 1] - s[j])
                return P[j].lerp(P[j + 1], max(0.0, min(1.0, t))), j
        return P[-1], len(P) - 2

    for i in range(m):
        sa = cw * i + (cw - w) / 2
        sb = sa + w
        pa, ja = interp(sa)
        pb, jb = interp(sb)
        seq = [(pa, nseg[ja])] + [(P[j], (nseg[j - 1] + nseg[min(j, len(nseg) - 1)]).normalized())
                                  for j in range(ja + 1, jb + 1)] + [(pb, nseg[jb])]
        mat = _sorteia(rnd)
        vs, fs = baldes.setdefault(mat, ([], []))
        b0 = len(vs)
        for p, n in seq:
            q = p + n * d
            vs.append((q.x, q.y, z0))
            vs.append((q.x, q.y, ztop(q.x, q.y)))
        for t in range(len(seq) - 1):
            fs.append((b0 + 2 * t, b0 + 2 * t + 2, b0 + 2 * t + 3, b0 + 2 * t + 1))
    objs = [malha(nome, vs, fs, cor=None, mat=mt) for mt, (vs, fs) in baldes.items() if fs]
    return mb.junta(objs, nome)


def pavilhao_ondulado(it, painel="azul_bebe"):
    """Pavilhão de cobertura ondulada de vidro branco sobre paredes de vidro com montantes brancos. Lote 2 × 1."""
    LX, PY = 26.0, 12.4

    def zr(x, y=0.0):
        return 8.6 + 1.5 * math.sin(2 * math.pi * x / 17.0 + 0.5) + 0.5 * (1 - (2 * y / PY) ** 2)

    # cobertura: casca com face de cima, de baixo e borda
    nx, ny, esp = 44, 10, 0.55
    vs, fs = [], []
    for j in range(ny + 1):
        for i in range(nx + 1):
            x = -LX / 2 + LX * i / nx
            y = -PY / 2 + PY * j / ny
            vs.append((x, y, zr(x, y)))
    off = len(vs)
    for j in range(ny + 1):
        for i in range(nx + 1):
            x, y, z = vs[j * (nx + 1) + i]
            vs.append((x, y, z - esp))
    idx = lambda i, j, b=0: b + j * (nx + 1) + i  # noqa: E731
    for j in range(ny):
        for i in range(nx):
            fs.append((idx(i, j), idx(i + 1, j), idx(i + 1, j + 1), idx(i, j + 1)))
            fs.append((idx(i, j, off), idx(i, j + 1, off), idx(i + 1, j + 1, off), idx(i + 1, j, off)))
    for i in range(nx):  # bordas da frente e de trás
        fs.append((idx(i, 0, off), idx(i + 1, 0, off), idx(i + 1, 0), idx(i, 0)))
        fs.append((idx(i + 1, ny, off), idx(i, ny, off), idx(i, ny), idx(i + 1, ny)))
    for j in range(ny):  # bordas dos lados
        fs.append((idx(nx, j, off), idx(nx, j + 1, off), idx(nx, j + 1), idx(nx, j)))
        fs.append((idx(0, j + 1, off), idx(0, j, off), idx(0, j), idx(0, j + 1)))
    it.add(malha("cobertura", vs, fs, "branco", liso=True, angulo=60))
    # placas de vidro branco da cobertura
    pv, pf = [], []
    for j in range(1, ny - 1, 2):
        for i in range(1, nx - 1, 2):
            x0, x1 = -LX / 2 + LX * i / nx + 0.08, -LX / 2 + LX * (i + 2) / nx - 0.08
            y0, y1 = -PY / 2 + PY * j / ny + 0.08, -PY / 2 + PY * (j + 2) / ny - 0.08
            b0 = len(pv)
            for (x, y) in ((x0, y0), (x1, y0), (x1, y1), (x0, y1)):
                pv.append((x, y, zr(x, y) + 0.03))
            pf.append((b0, b0 + 1, b0 + 2, b0 + 3))
    it.add(malha("placas", pv, pf, painel, liso=True, angulo=60))
    # paredes: anel branco (montantes) e vidros em duas fiadas desencontradas
    fp = reamostra(ret(25.0, 10.2, 2.6, seg=6), 56)
    zteto = lambda x, y: zr(x, y) - esp - 0.05  # noqa: E731
    pts_in = desloca(fp, -0.3)
    it.add(anel(fp, pts_in, 0.0, 0.0, "branco", topo=lambda i: zteto(*fp[i]) + 0.04, nome="parede"))
    zmeio = 3.6
    it.add(vidros_ate(fp, 0.45, lambda x, y: zmeio - 0.1, larg=2.3, frac=0.9, sem=71))
    it.add(vidros_ate(fp, zmeio + 0.1, lambda x, y: zteto(x, y) - 0.25, larg=3.1, frac=0.92, sem=72))
    it.add(anel(desloca(fp, 0.12), fp, zmeio - 0.12, zmeio + 0.12, "branco", nome="travessa"))
    it.add(anel(desloca(fp, 0.25), desloca(fp, -0.1), 0.0, 0.45, "branco", nome="base"))
    # pilares de apoio (montantes gordos) e entrada
    for x in (-9.0, -3.0, 3.0, 9.0):
        for ys in (-1, 1):
            it.add(caixa(0.32, 0.32, zteto(x, ys * 5.1) + 0.1, x=x, y=ys * 5.17, cor="branco", bisel=0.08))
    it.add(porta_vidro(0, -5.1, 0.0, l=3.0, a=3.0))
    it.add(floreira(-7.5, -6.2, -3.0, -6.2, 0, larg=0.6, sem=8), floreira(3.0, -6.2, 7.5, -6.2, 0, larg=0.6, sem=9))
    it.add(moita(-11.5, -5.6, 0, 0.6, "verde_lima", sem=1), moita(11.5, -5.6, 0, 0.6, "folha_clara", sem=2))
    it.colisao([((0, 0, 0), (25.4, 10.6, 7.2)), ((0, 0, 7.2), (LX, PY, 3.6))])


def predio_terracos_escadaria(it, madeira="madeira_clara", verde="verde_lima"):
    """Prédio em terraços com tetos verdes, como uma escadaria; rampa verde na lateral. Lote 1 × 1."""
    N = 5
    L = niveis(N)
    XL, XR = -6.0, 4.9
    YB = 6.2
    yf = [-6.2 + 2.0 * j for j in range(N)]
    for j in range(N):
        z0, z1 = L[j], L[j + 1]
        y0 = yf[j]
        it.add(caixa(XR - XL - 0.4, YB - y0 - 0.9, z1 - z0, x=(XL + XR) / 2, y=(y0 + 0.9 + YB) / 2, z=z0,
                     cor="branco_gelo", bisel=0, liso=False))
        it.add(vidros_linha([(XL + 0.2, y0 + 0.9), (XR - 0.2, y0 + 0.9)], z0, 1, z1 - z0, larg=1.6, frac=0.9,
                            peit=0.2, alt_v=z1 - z0 - 0.75, sem=80 + j,
                            mats=["janela", "janela_fria", "janela_apagada"] if j else ["janela", "janela_fria"]))
        it.add(caixa(XR - XL, YB - y0, 0.42, x=(XL + XR) / 2, y=(y0 + YB) / 2, z=z1 - 0.3, cor="branco",
                     bisel=0.16, seg=2))
        it.add(caixa(XR - XL - 0.5, 0.95, 0.06, x=(XL + XR) / 2, y=y0 + 0.5, z=z1 - 0.36, cor=madeira, bisel=0,
                     liso=False))
        for xs in (XL + 0.2, XR - 0.2):
            it.add(caixa(0.4, YB - y0, z1 - z0, x=xs, y=(y0 + YB) / 2, z=z0, cor="branco", bisel=0.1))
        if j > 0:
            zt = z1 + 0.12 if j < N - 1 else z1 + 0.12
        # terraço sobre o andar j: gramado e floreira na borda
        if j < N - 1:
            zt = z1 + 0.12
            ya, yb = yf[j] + 0.25, yf[j + 1] + 0.7
            it.add(caixa(XR - XL - 0.8, yb - ya, 0.12, x=(XL + XR) / 2, y=(ya + yb) / 2, z=zt, cor="grama", bisel=0.03))
            it.add(floreira(XL + 0.5, ya + 0.35, XR - 0.5, ya + 0.35, zt, alt=0.45, larg=0.55, planta="folha",
                            sem=j))
            rnd = random.Random(j + 3)
            for k in range(2):
                x = rnd.uniform(XL + 1.2, XR - 1.5)
                it.add(moita(x, (ya + yb) / 2 + 0.3, zt + 0.12, rnd.uniform(0.4, 0.55),
                             rnd.choice((verde, "folha_clara")), sem=j * 5 + k))
    # topo: jardim
    zt = L[N] + 0.12
    it.add(jardim(ret(XR - XL - 0.6, YB - yf[N - 1] - 0.6, 0.6, cx=(XL + XR) / 2, cy=(yf[N - 1] + YB) / 2), zt,
                  sem=21, arvores=3, moitas=2, h_arv=(2.4, 3.2)))
    # rampa verde na lateral direita
    zt_top = L[N] + 0.3
    perf = [(-6.4, 0.0), (YB, 0.0), (YB, zt_top), (3.2, zt_top)] + \
        chaikin([(3.2, zt_top), (-1.0, zt_top * 0.62), (-6.4, 0.5)], it=2, fechado=False)[1:]
    it.add(mb.extrudado(ccw(perf), 1.5, x=XR, cor="branco", bisel=0.18, seg=2, plano="yz", nome="rampa"))
    topo_r = chaikin([(3.2, zt_top), (-1.0, zt_top * 0.62), (-6.4, 0.5)], it=2, fechado=False)
    faixa = [(YB - 0.2, zt_top + 0.12), (YB - 0.2, zt_top - 0.2)] + [(y, z - 0.2) for y, z in topo_r] + \
        [(y, z + 0.12) for y, z in topo_r[::-1]]
    it.add(mb.extrudado(ccw(faixa), 1.1, x=XR + 0.2, cor="grama", bisel=0.05, seg=1, plano="yz", nome="rampa_grama"))
    for k, (y, z) in enumerate(topo_r[1:-1:2]):
        it.add(bola(0.42, XR + 0.75, y, z + 0.35, ("verde_lima", "folha_clara", "verde_claro")[k % 3]))
    it.add(porta_vidro(-1.0, yf[0] + 0.9, 0, l=2.0, a=2.8))
    it.colisao([((-0.55, (yf[0] + YB) / 2, 0), (XR - XL, YB - yf[0], L[2])),
                ((-0.55, (yf[2] + YB) / 2, L[2]), (XR - XL, YB - yf[2], L[4] - L[2])),
                ((-0.55, (yf[4] + YB) / 2, L[4]), (XR - XL, YB - yf[4], L[5] - L[4] + 0.5)),
                ((XR + 0.75, 0, 0), (1.5, 12.6, L[N] * 0.6))])


def torre_redonda_heliponto(it, verde="verde_lima", base="madeira_media"):
    """Torre redonda de lajes onduladas, varandas com jardim e heliponto verde no topo. Lote 1 × 1."""
    N = 9
    L = niveis(N)
    R = 4.0
    nuc = circ(R, 36)
    it.add(solido(circ(R + 0.9, 36), 0, T0, base, bisel=0.2))
    it.add(vidros_linha(circ(R + 0.9, 36), 0.0, 1, T0, larg=2.2, frac=0.82, peit=0.7, alt_v=2.6, fechado=True,
                        mats=["janela", "janela_fria"], sem=90))
    it.add(solido(nuc, T0, L[N] - T0, "branco_gelo"))
    it.add(vidros_linha(nuc, L[1:N], N - 1, [A] * (N - 1), larg=1.6, frac=0.86, peit=0.35, alt_v=2.3, fechado=True,
                        sem=91))
    for k in range(1, N + 1):
        z = L[k] if k < N else L[N]
        ond = (lambda th, k=k: 1 + 0.07 * math.sin(4 * th + 0.9 * k))
        laje = superelipse(2 * R + 2.6, 2 * R + 2.6, e=1.0, n=40, onda=ond)
        it.add(solido(laje, z - 0.25, 0.48, "branco", bisel=0.18))
        if k == N:
            break
        if k % 2 == 1:
            it.add(sebe(desloca(laje, -0.15), z + 0.2, larg=0.6, alt=0.5, cor="folha_clara" if k % 4 == 1 else verde,
                        per=2.2))
            rnd = random.Random(k)
            for q in range(3):
                a = rnd.uniform(0, 2 * math.pi)
                it.add(bola(rnd.uniform(0.4, 0.55), (R + 0.6) * math.cos(a), (R + 0.6) * math.sin(a), z + 0.75,
                            rnd.choice((verde, "verde_claro"))))
        else:
            it.add(anel(desloca(laje, -0.1), desloca(laje, -0.18), z + 0.2, z + 1.15, None, mat="vidro",
                        nome="guarda_corpo"))
            it.add(anel(desloca(laje, -0.06), desloca(laje, -0.22), z + 1.15, z + 1.23, "branco", nome="corrimao"))
    # heliponto verde
    zt = L[N] + 0.23
    it.add(mb.cilindro(R + 1.9, 0.4, z=zt, cor="branco", seg=40, bisel=0.12))
    it.add(mb.cilindro(R + 1.6, 0.06, z=zt + 0.38, cor="grama_escura", seg=40, bisel=0))
    lado = 2 * (R + 1.5) * 0.7
    mi = mb.material_estampa("eco_heliponto", os.path.join(EST_DIR, "placa_heliponto.png"))
    zh = zt + 0.445
    it.add(malha("heliponto", [(-lado / 2, -lado / 2, zh), (lado / 2, -lado / 2, zh), (lado / 2, lado / 2, zh),
                               (-lado / 2, lado / 2, zh)], [(0, 1, 2, 3)], mat=mi,
                 uvs=[[(0, 0), (1, 0), (1, 1), (0, 1)]]))
    for k in range(8):
        a = 2 * math.pi * k / 8 + math.pi / 8
        it.add(mb.cilindro(0.12, 0.14, x=(R + 1.65) * math.cos(a), y=(R + 1.65) * math.sin(a), z=zt + 0.4,
                           cor=None, mat="luz", seg=8, bisel=0.02))
    it.add(porta_vidro(0, -(R + 0.9), 0, l=2.0, a=2.8))
    it.add(caixa(3.6, 1.6, 0.3, y=-(R + 0.9) - 0.6, z=3.3, cor="branco", bisel=0.12))
    it.colisao([((0, 0, 0), (2 * R + 2.8, 2 * R + 2.8, L[N] + 0.7))])


def predio_turbina_eolica(it, faixa="verde", verde="verde_lima"):
    """Prédio com turbina eólica no teto, faixas verdes e brancas, escotilhas e jardim. Lote 1 × 1."""
    N = 5
    L = niveis(N)
    LX, PY = 10.0, 9.4
    for j in range(N):
        z0, z1 = L[j], L[j + 1]
        cor = faixa if j % 2 == 0 else "branco"
        it.add(caixa(LX, PY, z1 - z0 - 0.3, z=z0, cor=cor, bisel=0.35, seg=2))
        it.add(caixa(LX + 0.5, PY + 0.5, 0.4, z=z1 - 0.32, cor="branco", bisel=0.18, seg=2))
        if j == 0:
            it.add(vidros_linha([(-LX / 2 + 0.5, -PY / 2), (-1.4, -PY / 2)], 0, 1, T0, larg=1.6, frac=0.9, peit=0.6,
                                alt_v=2.7, mats=["janela", "janela_fria"], sem=100))
            it.add(vidros_linha([(1.4, -PY / 2), (LX / 2 - 0.5, -PY / 2)], 0, 1, T0, larg=1.6, frac=0.9, peit=0.6,
                                alt_v=2.7, mats=["janela", "janela_fria"], sem=101))
            it.add(porta_vidro(0, -PY / 2, 0, l=1.8, a=2.8))
            it.add(vidros_ret(LX, PY, 0, 1, T0, lados="dte", larg=2.2, frac=0.7, peit=1.0, alt_v=2.0, margem=0.8,
                              sem=102))
            continue
        rnd = random.Random(j)
        zc = z0 + (z1 - z0 - 0.3) / 2
        if j % 2 == 1:
            for i in range(4):
                it.add(janela_redonda(-3.3 + 2.2 * i, -PY / 2, zc, r=0.6, mat=_sorteia(rnd)))
            for i in range(3):
                it.add(janela_redonda(LX / 2, -2.8 + 2.8 * i, zc, r=0.6, face=1, eixo="x", mat=_sorteia(rnd)))
        else:
            it.add(cb.janelas(("y", -PY / 2, -1), -LX / 2 + 0.6, LX / 2 - 0.6, z0, z1 - 0.3, 4, 1, larg=0.7, alt=0.62,
                              semente=j, apagadas=APAG, frias=FRIAS))
            it.add(cb.janelas(("x", LX / 2, 1), -PY / 2 + 0.6, PY / 2 - 0.6, z0, z1 - 0.3, 3, 1, larg=0.7,
                              alt=0.62, semente=j + 9, apagadas=APAG, frias=FRIAS))
        it.add(cb.janelas(("y", PY / 2, 1), -LX / 2 + 0.6, LX / 2 - 0.6, z0, z1 - 0.3, 4, 1, larg=0.6, alt=0.55,
                          semente=j + 20, apagadas=APAG, frias=FRIAS, peitoril=False))
        it.add(cb.janelas(("x", -LX / 2, -1), -PY / 2 + 0.6, PY / 2 - 0.6, z0, z1 - 0.3, 3, 1, larg=0.6,
                          alt=0.55, semente=j + 30, apagadas=APAG, frias=FRIAS, peitoril=False))
    zt = L[N] + 0.08
    it.add(jardim(ret(LX - 0.4, PY - 0.4, 0.6), zt, sem=31, arvores=2, moitas=4, h_arv=(2.2, 2.8),
                  evita=[(0.8, 1.2, 1.6)]))
    # turbina
    tx, ty = 0.8, 1.2
    zb = zt + 0.18
    it.add(mb.cilindro(0.75, 0.4, x=tx, y=ty, z=zb, cor="branco", seg=16, bisel=0.1))
    it.add(mb.cilindro(0.3, 9.0, x=tx, y=ty, z=zb + 0.3, r2=0.17, cor="branco", seg=14, bisel=0.02))
    zh = zb + 9.4
    it.add(mb.superelipsoide(0.7, 1.9, 0.75, x=tx, y=ty + 0.15, z=zh - 0.37, cor="branco", e=0.6, nu=16, nv=8))
    it.add(bola(0.33, tx, ty - 0.85, zh, "branco", esc=(1, 1.3, 1)))
    for k in range(3):
        pa = mb.superelipsoide(0.55, 0.14, 4.6, cor="branco", e=0.5, nu=12, nv=8)
        mb.transforma(pa, loc=(0.12, 0, 0.25))
        mb.transforma(pa, rot=("Y", 120 * k + 10))
        mb.transforma(pa, loc=(tx, ty - 0.95, zh))
        it.add(pa)
    it.colisao([((0, 0, 0), (LX + 0.5, PY + 0.5, L[N] + 0.4)), ((tx, ty, L[N]), (1.0, 1.0, 9.8))])


def predio_cascata(it, parede="verde_claro", detalhe="turquesa"):
    """Prédio em três patamares com uma cascata d'água descendo pela fachada até uma piscina redonda. Lote 1 × 1."""
    L = niveis(4)
    yc = 1.2
    tiers = [(11.0, 8.6, 0.0, L[2]), (8.8, 6.6, L[2], L[3]), (6.0, 4.4, L[3], L[4])]
    for i, (lx, py, z0, z1) in enumerate(tiers):
        cy = yc + (8.6 - py) / 2
        it.add(caixa(lx, py, z1 - z0, y=cy, z=z0, cor=parede, bisel=0.3, seg=2))
        it.add(caixa(lx + 0.5, py + 0.5, 0.45, y=cy, z=z1 - 0.2, cor="branco", bisel=0.2, seg=2))
        it.add(caixa(lx + 0.6, py + 0.6, 0.12, y=cy, z=z1 + 0.18, cor=detalhe, bisel=0.05))
        yf = cy - py / 2
        nand = 2 if i == 0 else 1
        alts = [T0, A] if i == 0 else [z1 - z0]
        bases = [0.0, T0] if i == 0 else [z0]
        for k in range(nand):
            for (xa, xb) in ((-lx / 2 + 0.5, -1.4), (1.4, lx / 2 - 0.5)):
                cols = max(1, round((xb - xa) / 1.9))
                it.add(cb.janelas(("y", yf, -1), xa, xb, bases[k] + 0.3, bases[k] + alts[k] - 0.5, cols, 1,
                                  larg=0.72, alt=0.68, semente=110 + 3 * i + k, apagadas=APAG, frias=FRIAS))
            it.add(cb.janelas(("x", lx / 2, 1), cy - py / 2 + 0.6, cy + py / 2 - 0.6, bases[k] + 0.3,
                              bases[k] + alts[k] - 0.5, max(1, round(py / 2.2)), 1, larg=0.7, alt=0.66,
                              semente=120 + 3 * i + k, apagadas=APAG, frias=FRIAS))
            it.add(cb.janelas(("x", -lx / 2, -1), cy - py / 2 + 0.6, cy + py / 2 - 0.6, bases[k] + 0.3,
                              bases[k] + alts[k] - 0.5, max(1, round(py / 2.2)), 1, larg=0.7, alt=0.66,
                              semente=130 + 3 * i + k, apagadas=APAG, frias=FRIAS, peitoril=False))
            it.add(cb.janelas(("y", cy + py / 2, 1), -lx / 2 + 0.6, lx / 2 - 0.6, bases[k] + 0.3,
                              bases[k] + alts[k] - 0.5, max(1, round(lx / 2.2)), 1, larg=0.7, alt=0.66,
                              semente=140 + 3 * i + k, apagadas=APAG, frias=FRIAS, peitoril=False))
        # cascata: canal branco com lâmina d'água descendo a frente deste patamar
        zc0 = z0 if i else 0.55
        it.add(caixa(2.4, 0.5, z1 - zc0 + 0.3, y=yf - 0.2, z=zc0, cor="branco", bisel=0.12))
        it.add(caixa(1.8, 0.06, z1 - zc0 + 0.28, y=yf - 0.48, z=zc0, cor=None, mat="agua", bisel=0, liso=False))
        it.add(caixa(1.8, 0.04, z1 - zc0 + 0.26, y=yf - 0.42, z=zc0, cor="agua", bisel=0, liso=False))
        # terraço do patamar com plantas (os de cima)
        if i < 2:
            ztt = z1 + 0.3
            nxt = tiers[i + 1]
            ncy = yc + (8.6 - nxt[1]) / 2
            yfn = ncy - nxt[1] / 2
            it.add(caixa(lx - 0.6, yfn - yf - 0.2, 0.1, y=(yf + yfn) / 2, z=ztt, cor="grama", bisel=0.03))
            for xs in (-1, 1):
                x = xs * (lx / 2 - 1.6)
                it.add(moita(x, (yf + yfn) / 2, ztt + 0.1, 0.55, "verde_lima" if xs < 0 else "folha_clara",
                             sem=i * 4 + xs))
                it.add(bola(0.45, xs * 2.2, yf + 0.7, ztt + 0.45, "verde_claro"))
            # bacia na borda (de onde a água cai)
            it.add(caixa(2.8, 1.4, 0.55, y=yf + 0.45, z=ztt - 0.1, cor="branco", bisel=0.15))
            it.add(caixa(2.3, 1.0, 0.04, y=yf + 0.45, z=ztt + 0.38, cor=None, mat="agua", bisel=0, liso=False))
    # topo: chafariz
    zt = L[4] + 0.3
    it.add(caixa(5.6, 4.0, 0.1, y=yc + 2.1, z=zt, cor="grama", bisel=0.03))
    it.add(mb.cilindro(1.1, 0.5, x=0, y=yc + 2.1, z=zt + 0.1, cor="branco", seg=20, bisel=0.1))
    it.add(mb.cilindro(0.92, 0.05, x=0, y=yc + 2.1, z=zt + 0.5, cor=None, mat="agua", seg=20, bisel=0))
    it.add(mb.cilindro(0.18, 1.1, x=0, y=yc + 2.1, z=zt + 0.5, cor="branco", seg=10, bisel=0.04))
    it.add(bola(0.34, 0, yc + 2.1, zt + 1.75, None, esc=(1, 1, 0.75), nome="jato"))
    it.partes[-1].data.materials  # noqa: B018
    mb.pinta(it.partes[-1], None, mat="agua")
    it.add(moita(-2.0, yc + 3.4, zt + 0.1, 0.5, "verde_lima", sem=8), moita(2.1, yc + 3.3, zt + 0.1, 0.45,
                                                                            "folha_clara", sem=9))
    # piscina redonda na base da cascata
    yp = yc - 4.3 - 0.1
    meia = [(0.0, yp + 0.5)] + [(3.0 * math.cos(math.radians(a)), yp + 0.5 + 2.4 * math.sin(math.radians(a)))
                                for a in range(180, 361, 12)]
    meia = meia[1:]
    fora = reamostra(meia, 32)
    it.add(anel(fora, desloca(fora, -0.35), 0.0, 0.55, "branco", fundo=True, nome="borda_piscina"))
    it.add(solido(desloca(fora, -0.3), 0.0, 0.08, "turquesa_claro"))
    it.add(solido(desloca(fora, -0.32), 0.08, 0.36, None, mat="agua"))
    it.add(porta_vidro(-3.6, yc - 4.3, 0, l=1.8, a=2.7))
    it.colisao([((0, yc, 0), (11.5, 9.1, L[2] + 0.4)), ((0, yc + 1.0, L[2]), (9.3, 7.1, L[4] - L[2] + 0.4)),
                ((0, yp - 0.6, 0), (6.0, 2.6, 0.55))])


def academia_curva(it, verde="verde_lima"):
    """Academia de planta curva: bloco de dois andares com jardim no teto e salão alto com claraboias sextavadas,
    placas solares, letreiro ACADEMIA e neon. Lote 2 × 1."""
    ctrl = [(-12.8, -2.8), (-7.0, -6.3), (6.5, -6.3), (12.8, -2.6), (12.8, 4.6), (11.4, 6.2), (-11.4, 6.2),
            (-12.8, 4.6)]
    fora = reamostra(chaikin(ctrl, 3), 72)
    nuc = desloca(fora, -0.7)
    xc = -1.5
    esq_f, dir_f = corta_x(fora, xc, -1), corta_x(fora, xc + 0.01, 1)
    esq_n, dir_n = corta_x(nuc, xc, -1), corta_x(nuc, xc - 0.4, 1)
    H1, H2 = 8.8, 5.6
    it.add(solido(esq_n, 0, H1, "branco_gelo"))
    it.add(solido(dir_n, 0, H2, "branco_gelo"))
    # bloco esquerdo: dois andares
    for z0, h in ((0.0, 4.4), (4.4, H1 - 4.4)):
        cont = [p for p in reamostra(esq_n, 48)]
        it.add(vidros_linha(cont, z0, 1, h, larg=1.8, frac=0.88, peit=0.5, alt_v=h - 1.2, fechado=True,
                            sem=int(150 + z0), pula=lambda k, i, c=cont: False))
    for z in (0.0, 4.4, H1):
        e = desloca(esq_f, 0.05 if z else 0.15)
        it.add(solido(corta_x(e, xc, -1), z - (0.35 if z else 0.0), 0.7 if z else 0.4, "branco", bisel=0.25))
    it.add(jardim(desloca(esq_f, -0.3), H1 + 0.35, sem=17, arvores=4, moitas=4, h_arv=(2.4, 3.4),
                  cores=(verde, "folha_clara", "verde_claro")))
    # salão alto (direita)
    cont = reamostra(dir_n, 48)
    it.add(vidros_linha(cont, 0.0, 1, H2, larg=2.4, frac=0.9, peit=0.45, alt_v=H2 - 1.5, fechado=True, sem=160))
    it.add(solido(desloca(dir_f, 0.15), 0.0, 0.4, "branco", bisel=0.15))
    it.add(solido(dir_f, H2 - 0.6, 1.1, "branco", bisel=0.3))
    zt = H2 + 0.5
    for k, (x, y) in enumerate(((2.2, -1.6), (4.6, 0.6), (7.0, -1.4), (9.3, 0.8), (3.6, 3.2))):
        hexa = mb.poligono(6, 0.85)
        it.add(solido(hexa if True else None, zt, 0.5, "branco", bisel=0.08) if False else
               mb.extrudado(ccw([(x + a, y + b) for a, b in hexa]), 0.5, z=zt, cor="branco", bisel=0.08, seg=1))
        it.add(mb.extrudado(ccw([(x + a * 0.78, y + b * 0.78) for a, b in hexa]), 0.06, z=zt + 0.48, cor=None,
                            mat=("janela", "janela_fria")[k % 2], bisel=0))
    it.add(paineis_solares(8.0, 3.6, zt, 6.0, 2.2, 4, 2, incl=12))
    # letreiro e neon na fachada curva do salão
    xs = 7.2
    ys = y_frente(dir_f, xs)
    ang = tangente_frente(dir_f, xs)
    it.add(placa("academia", 6.2, 1.08, xs, ys - 0.06, H2 - 0.5, rot=ang))
    frente = [p for p in reamostra(dir_f, 72) if p[1] < -2.0 and p[0] > xc + 0.5]
    frente.sort(key=lambda p: p[0])
    it.add(neon_linha([(x, y - 0.06) for x, y in desloca_linha(frente, 0.0)], H2 + 0.52, r=0.06))
    # entrada
    xp = -5.0
    yp = y_frente(nuc, xp)
    it.add(porta_vidro(xp, yp, 0, l=2.6, a=3.0))
    it.add(caixa(4.6, 1.0, 0.3, x=xp, y=yp - 0.4, z=3.5, cor="branco", bisel=0.12))
    it.add(floreira(-11.0, -4.6, -8.2, -5.9, 0, sem=3))
    it.colisao([((-7.1, 0, 0), (11.4, 12.6, H1 + 0.4)), ((5.6, 0, 0), (14.4, 12.6, H2 + 0.6))])


def desloca_linha(pts, d):
    return [tuple(p) for p in pts]


def predio_tetos_lima(it, base="terracota", teto="verde_lima"):
    """Prédio de tetos verde-limão empilhados: andares de contorno ondulado e deslocado, cada terraço com piso
    verde-limão e borda branca gorda; base colorida. Lote 1 × 1."""
    N = 6
    L = niveis(N)
    nuc = superelipse(7.8, 7.0, e=0.5, n=36)
    it.add(solido(ret(10.6, 9.8, 1.4), 0, T0, base, bisel=0.2))
    it.add(vidros_ret(10.6, 9.8, 0, 1, T0, lados="dte", larg=2.0, peit=1.0, alt_v=2.3, margem=1.0, sem=170))
    it.add(vidros_linha([(-4.3, -4.9), (-1.5, -4.9)], 0, 1, T0, larg=1.4, peit=0.5, alt_v=2.9,
                        mats=["janela", "janela_fria"], sem=171))
    it.add(vidros_linha([(1.5, -4.9), (4.3, -4.9)], 0, 1, T0, larg=1.4, peit=0.5, alt_v=2.9,
                        mats=["janela", "janela_fria"], sem=172))
    it.add(porta_vidro(0, -4.9, 0, l=1.9, a=2.9))
    it.add(solido(nuc, T0, L[N] - T0, "branco_gelo"))
    it.add(vidros_linha(nuc, L[1:N], N - 1, [A] * (N - 1), larg=1.6, frac=0.86, peit=0.55, alt_v=2.0,
                        fechado=True, sem=173))
    desloc = [(0.0, 0.0), (0.7, -0.5), (-0.6, -0.3), (0.5, 0.6), (-0.7, 0.4), (0.2, -0.6)]
    for k in range(1, N + 1):
        z = L[k]
        sx, sy = desloc[k - 1]
        ond = (lambda th, k=k: 1 + 0.06 * math.sin(2 * th + 1.7 * k) + 0.03 * math.sin(3 * th + k))
        laje = superelipse(11.0, 10.2, e=0.5, n=36, cx=sx * 0.8, cy=sy * 0.8, onda=ond)
        it.add(solido(laje, z - 0.32, 0.4, "branco", bisel=0.12))
        it.add(anel(laje, desloca(laje, -0.4), z + 0.05, z + 0.55, "branco", nome="borda"))
        it.add(solido(desloca(laje, -0.35), z + 0.05, 0.22, teto, bisel=0.05))
        if k < N:
            rnd = random.Random(k)
            for q in range(2):
                i = rnd.randrange(len(laje))
                p = V(desloca(laje, -1.0)[i])
                it.add(moita(p.x, p.y, z + 0.27, rnd.uniform(0.35, 0.5), rnd.choice(("folha", "verde_claro")),
                             sem=k * 3 + q))
    zt = L[N] + 0.27
    it.add(caixa(2.4, 2.0, 1.6, x=-1.8, y=1.6, z=zt, cor="branco", bisel=0.2))
    it.add(porta_vidro(-1.8, 0.6, zt, l=1.0, a=1.3))
    it.add(arvore(2.0, -1.0, zt, h=3.0, r=1.0, cor="folha_clara"))
    it.colisao([((0, 0, 0), (11.8, 11.0, L[N] + 0.6))])


# =====================================================================================================================
# Prédios pequenos e casas
# =====================================================================================================================
def telhado_duas_aguas(lx, py, z, alt, beiral=0.5, esp=0.3, cor="cinza_medio", parede="branco", empena=True):
    """Telhado de duas águas com a cumeeira no eixo X: empenas (triângulos) na cor da parede e duas águas de
    espessura esp. Devolve (objetos, ângulo da água em graus)."""
    ang = math.atan2(alt, py / 2)
    out = []
    if empena:
        out.append(mb.extrudado(ccw([(-py / 2, z), (py / 2, z), (0, z + alt)]), lx, x=-lx / 2, cor=parede, bisel=0.05,
                                seg=1, plano="yz", nome="empena"))
    ey, ez = py / 2 + beiral, z - beiral * math.tan(ang)
    dz = esp / math.cos(ang)
    for s_ in (-1, 1):
        pts = [(s_ * ey, ez), (0, z + alt), (0, z + alt + dz), (s_ * ey, ez + dz)]
        out.append(mb.extrudado(ccw(pts), lx + 2 * beiral * 0.6, x=-(lx + 2 * beiral * 0.6) / 2, cor=cor, bisel=0.06,
                                seg=1, plano="yz", nome="agua_telhado"))
    return out, math.degrees(ang)


def casa_telhado_verde(it, parede="branco", terreo="cinza_claro", madeira="madeira_mel", verde="verde_lima"):
    """Casa de dois andares com teto-jardim, escotilhas no andar de cima e deque de madeira. Lote 1 × 1."""
    LX, PY = 9.0, 7.4
    z1, z2 = 3.3, 6.5
    yf = -PY / 2
    it.add(caixa(LX, PY, z1, cor=terreo, bisel=0.25, seg=2))
    it.add(caixa(LX + 0.6, PY + 0.9, 0.35, y=-0.25, z=z1 - 0.15, cor="branco", bisel=0.15))
    yf2 = -0.25 - (PY + 0.5) / 2
    it.add(caixa(LX + 0.2, PY + 0.5, z2 - z1 - 0.2, y=-0.25, z=z1 + 0.2, cor=parede, bisel=0.3, seg=2))
    it.add(caixa(LX + 0.8, PY + 1.1, 0.4, y=-0.25, z=z2, cor="branco", bisel=0.18, seg=2))
    it.add(jardim(ret(LX - 0.1, PY + 0.2, 0.5, cy=-0.25), z2 + 0.3, sem=41, arvores=2, moitas=3, h_arv=(1.9, 2.5),
                  cores=(verde, "folha_clara", "verde_claro")))
    it.add(vidros_linha([(-LX / 2 + 0.5, yf), (1.2, yf)], 0.15, 1, z1, larg=1.4, frac=0.92, peit=0.05, alt_v=2.45,
                        mats=["janela", "janela_fria", "janela_apagada"], sem=42))
    it.add(caixa(LX / 2 + 1.0, 0.12, 0.14, x=(-LX / 2 + 1.2) / 2 + 0.1, y=yf - 0.06, z=2.62, cor="branco", bisel=0.03))
    it.add(porta_vidro(2.9, yf, 0.15, l=1.1, a=2.3, cor=madeira, mat="janela"))
    rnd = random.Random(43)
    for i in range(3):
        it.add(janela_redonda(-2.8 + 2.8 * i, yf2, z1 + 1.55, r=0.62, mat=_sorteia(rnd)))
    for sx in (-1, 1):
        for i in range(2):
            it.add(janela_redonda(sx * (LX / 2 + 0.1), -1.9 + 3.4 * i, z1 + 1.55, r=0.55, face=sx, eixo="x",
                                  mat=_sorteia(rnd)))
        it.add(cb.janelas(("x", sx * LX / 2, sx), -PY / 2 + 1.0, PY / 2 - 1.0, 0.3, z1 - 0.3, 2, 1, larg=0.6, alt=0.62,
                          semente=44 + sx, apagadas=APAG, frias=FRIAS))
    it.add(cb.janelas(("y", PY / 2, 1), -LX / 2 + 0.8, LX / 2 - 0.8, 0.3, z1 - 0.3, 3, 1, larg=0.6, alt=0.6,
                      semente=46, apagadas=APAG, frias=FRIAS))
    it.add(cb.janelas(("y", -0.25 + (PY + 0.5) / 2, 1), -LX / 2 + 0.8, LX / 2 - 0.8, z1 + 0.3, z2 - 0.2, 3, 1,
                      larg=0.6, alt=0.6, semente=47, apagadas=APAG, frias=FRIAS))
    # deque e floreiras
    it.add(caixa(LX + 1.0, 1.6, 0.15, y=yf - 0.8, z=0, cor=madeira, bisel=0.04))
    for k in range(9):
        it.add(caixa(0.05, 1.58, 0.01, x=-LX / 2 - 0.3 + 1.2 * k, y=yf - 0.8, z=0.15, cor="madeira", bisel=0,
                     liso=False))
    it.add(floreira(-LX / 2 - 0.1, yf - 1.35, -0.8, yf - 1.35, 0.15, alt=0.45, larg=0.5, sem=48))
    it.add(moita(LX / 2 - 0.2, yf - 1.0, 0.15, 0.45, "folha_clara", sem=49))
    it.colisao([((0, 0, 0), (LX, PY, z1)), ((0, -0.25, z1), (LX + 0.8, PY + 1.1, z2 - z1 + 0.7))])


def predinho_varandas(it, cor1="verde", cor2="amarelo_claro", telhado="cinza_medio", grade="branco"):
    """Predinho de quatro andares com faixas coloridas, varandas com floreiras e telhado inclinado com placas
    solares. Lote 1 × 1."""
    N = 4
    L = niveis(N, terreo=3.6)
    LX, PY = 8.0, 7.6
    H = L[N]
    yf = -PY / 2
    for j in range(N):
        z0, z1 = L[j], L[j + 1]
        it.add(caixa(LX, PY, z1 - z0 - 0.15, z=z0, cor=cor1 if j % 2 == 0 else cor2, bisel=0.22, seg=2))
        it.add(caixa(LX + 0.3, PY + 0.3, 0.3, z=z1 - 0.2, cor="branco", bisel=0.12))
        if j == 0:
            it.add(vidros_linha([(-LX / 2 + 0.5, yf), (0.8, yf)], 0.2, 1, z1, larg=1.5, frac=0.9, peit=0.05,
                                alt_v=2.6, mats=["janela", "janela_fria"], sem=50))
            it.add(porta_vidro(2.4, yf, 0, l=1.3, a=2.6))
            it.add(caixa(LX - 0.6, 1.0, 0.18, y=yf - 0.5, z=3.0, cor=grade, bisel=0.06))
        else:
            it.add(vidros_linha([(-LX / 2 + 0.6, yf), (LX / 2 - 0.6, yf)], z0, 1, z1 - z0, larg=2.2, frac=0.62,
                                peit=0.15, alt_v=2.3, sem=50 + j))
            yb = yf - 0.65
            it.add(caixa(LX - 0.9, 1.3, 0.2, y=yb, z=z0 - 0.05, cor="branco", bisel=0.08))
            it.add(caixa(LX - 1.1, 0.04, 0.8, y=yb - 0.6, z=z0 + 0.15, cor=None, mat="vidro", bisel=0, liso=False))
            it.add(caixa(LX - 0.9, 0.12, 0.1, y=yb - 0.6, z=z0 + 0.95, cor=grade, bisel=0.03))
            for sx in (-1, 1):
                it.add(caixa(0.1, 1.2, 0.95, x=sx * (LX / 2 - 0.5), y=yb, z=z0 + 0.1, cor=grade, bisel=0.03))
            it.add(floreira(-LX / 2 + 0.9, yb - 0.38, -0.7, yb - 0.38, z0 + 0.15, alt=0.35, larg=0.35,
                            planta="folha", sem=j * 3))
            it.add(bola(0.32, LX / 2 - 1.1, yb - 0.1, z0 + 0.45, "folha_clara"))
        rnd = random.Random(j + 7)
        for sx in (-1, 1):
            it.add(cb.janelas(("x", sx * LX / 2, sx), -PY / 2 + 0.8, PY / 2 - 0.8, z0 + 0.1, z1 - 0.3, 2, 1, larg=0.6,
                              alt=0.6, semente=rnd.randrange(999), apagadas=APAG, frias=FRIAS))
        it.add(cb.janelas(("y", PY / 2, 1), -LX / 2 + 0.6, LX / 2 - 0.6, z0 + 0.1, z1 - 0.3, 3, 1, larg=0.55,
                          alt=0.6, semente=rnd.randrange(999), apagadas=APAG, frias=FRIAS, peitoril=False))
    # telhado inclinado (sobe para trás) com placas solares
    b = 0.6
    zf, zb_ = H + 0.1, H + 1.9
    cunha = [(-PY / 2, H - 0.05), (PY / 2, H - 0.05), (PY / 2, zb_), (-PY / 2, zf)]
    it.add(mb.extrudado(ccw(cunha), LX - 0.1, x=-(LX - 0.1) / 2, cor=cor2, bisel=0.05, seg=1, plano="yz"))
    ang = math.atan2(zb_ - zf, PY)
    t = 0.32 / math.cos(ang)
    y0, y1 = -PY / 2 - b, PY / 2 + b
    z0_, z1_ = zf - b * math.tan(ang), zb_ + b * math.tan(ang)
    it.add(mb.extrudado(ccw([(y0, z0_), (y1, z1_), (y1, z1_ + t), (y0, z0_ + t)]), LX + 0.8, x=-(LX + 0.8) / 2,
                        cor=telhado, bisel=0.08, seg=1, plano="yz"))
    it.add(paineis_solares(0, 0, (z0_ + z1_) / 2 + t - 0.22, LX - 0.8, PY - 0.8, 4, 3, incl=math.degrees(ang)))
    it.colisao([((0, 0, 0), (LX + 0.3, PY + 0.3, H)), ((0, yf - 0.65, 3.0), (LX, 1.3, H - 3.0)),
                ((0, 0, H), (LX + 0.8, PY + 1.2, 2.3))])


def predinho_madeira_floreiras(it, madeira="madeira_clara", ripa="madeira_mel", flores=("rosa", "vermelho_claro",
                               "amarelo", "lilas")):
    """Predinho de madeira (ripas) com janelas saltadas, floreiras floridas e terraço com pérgola. Lote 1 × 1."""
    N = 3
    L = niveis(N, terreo=3.6)
    LX, PY = 8.6, 8.0
    H = L[N]
    yf = -PY / 2
    it.add(caixa(LX, PY, H, cor=madeira, bisel=0.3, seg=2))
    it.add(caixa(LX + 0.2, PY + 0.2, 0.5, z=0, cor="concreto", bisel=0.1))
    for j in range(1, N):
        it.add(caixa(LX + 0.24, PY + 0.24, 0.22, z=L[j] - 0.11, cor="branco", bisel=0.08))
    for k in range(15):  # ripas da frente e da direita
        x = -LX / 2 + 0.55 + k * (LX - 1.1) / 14
        it.add(caixa(0.12, 0.08, H - 0.9, x=x, y=yf - 0.04, z=0.6, cor=ripa, bisel=0, liso=False))
        y = -PY / 2 + 0.55 + k * (PY - 1.1) / 14
        it.add(caixa(0.08, 0.12, H - 0.9, x=LX / 2 + 0.04, y=y, z=0.6, cor=ripa, bisel=0, liso=False))
    rnd = random.Random(60)
    for j in range(1, N):
        zc = L[j] + 0.75
        for x in (-2.2, 2.2):
            it.add(janela_caixa(x, yf - 0.08, zc, 1.5, 1.55, prof=0.3, mat=_sorteia(rnd)))
            it.add(caixa(1.9, 0.45, 0.35, x=x, y=yf - 0.36, z=zc - 0.55, cor="branco", bisel=0.08))
            for q in range(4):
                it.add(bola(0.17, x - 0.6 + 0.4 * q, yf - 0.4, zc - 0.12, flores[(q + j) % len(flores)]))
            it.add(caixa(1.7, 0.3, 0.12, x=x, y=yf - 0.36, z=zc - 0.25, cor="folha", bisel=0.05))
        for y in (-1.8, 1.8):
            jc = janela_caixa(0, 0, zc, 1.4, 1.5, prof=0.3, mat=_sorteia(rnd))
            mb.transforma(jc, rot=("Z", 90))
            mb.transforma(jc, loc=(LX / 2 + 0.08, y, 0))
            it.add(jc)
        it.add(cb.janelas(("y", PY / 2, 1), -LX / 2 + 0.8, LX / 2 - 0.8, L[j] + 0.2, L[j + 1] - 0.3, 3, 1, larg=0.6,
                          alt=0.6, semente=61 + j, apagadas=APAG, frias=FRIAS))
        it.add(cb.janelas(("x", -LX / 2, -1), -PY / 2 + 0.8, PY / 2 - 0.8, L[j] + 0.2, L[j + 1] - 0.3, 2, 1,
                          larg=0.6, alt=0.6, semente=63 + j, apagadas=APAG, frias=FRIAS))
    # térreo
    it.add(vidros_linha([(-LX / 2 + 0.6, yf - 0.1), (0.6, yf - 0.1)], 0.5, 1, 3.0, larg=1.6, frac=0.9, peit=0.05,
                        alt_v=2.4, mats=["janela", "janela_fria"], sem=64))
    it.add(porta_vidro(2.3, yf - 0.1, 0.5, l=1.2, a=2.4, cor="branco"))
    it.add(caixa(LX - 0.4, 1.1, 0.2, y=yf - 0.6, z=3.2, cor="branco", bisel=0.08))
    # terraço com pérgola
    zt = H
    it.add(anel(ret(LX + 0.1, PY + 0.1, 0.35, seg=3), ret(LX - 0.5, PY - 0.5, 0.1, seg=3), zt - 0.05, zt + 0.7,
                "branco", nome="parapeito"))
    it.add(caixa(LX - 0.6, PY - 0.6, 0.1, z=zt, cor=ripa, bisel=0.02))
    it.add(caixa(LX - 0.8, 3.0, 0.12, y=1.9, z=zt + 0.1, cor="grama", bisel=0.03))
    for x in (-3.4, -0.2, 3.0):
        it.add(moita(x, 2.2, zt + 0.2, 0.5, rnd.choice(("verde_lima", "folha_clara", "verde_claro")), sem=int(x * 10)))
    for sx in (-1, 1):
        for y in (-3.1, -0.4):
            it.add(caixa(0.18, 0.18, 2.4, x=sx * 3.4, y=y, z=zt + 0.1, cor="madeira_media", bisel=0.03))
    for y in (-3.1, -0.4):
        it.add(caixa(7.4, 0.18, 0.2, y=y, z=zt + 2.5, cor="madeira_media", bisel=0.03))
    for k in range(7):
        it.add(caixa(0.12, 3.4, 0.16, x=-3.3 + 1.1 * k, y=-1.75, z=zt + 2.7, cor="madeira_media", bisel=0.02))
    it.add(caixa(2.0, 0.6, 0.45, x=0, y=-2.2, z=zt + 0.1, cor="madeira", bisel=0.06))
    it.colisao([((0, 0, 0), (LX + 0.3, PY + 0.4, H + 0.7))])


def casa_paineis_solares(it, parede="branco", telhado="cinza_medio", madeira="madeira_mel"):
    """Casa térrea de duas águas com a água da frente coberta de placas solares, varanda de madeira, horta e
    barril de chuva. Lote 1 × 1."""
    LX, PY = 9.0, 7.0
    zw = 3.3
    yf = -PY / 2
    it.add(caixa(LX, PY, zw, cor=parede, bisel=0.2, seg=2))
    it.add(caixa(LX + 0.2, PY + 0.2, 0.4, z=0, cor="concreto", bisel=0.08))
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.add(caixa(0.3, 0.3, zw, x=sx * (LX / 2 - 0.05), y=sy * (PY / 2 - 0.05), cor=madeira, bisel=0.06))
    objs, ang = telhado_duas_aguas(LX, PY, zw, 2.3, beiral=0.6, cor=telhado, parede=parede)
    it.add(objs)
    a = math.radians(ang)
    yc = -PY / 4 - 0.1
    zc = zw + 2.3 * (1 - abs(yc) / (PY / 2)) + 0.32 / math.cos(a)
    it.add(paineis_solares(0, yc, zc - 0.25 - 0.04, LX - 1.2, PY / 2 - 0.4, 5, 2, incl=ang))
    # varanda
    it.add(caixa(LX - 1.6, 1.8, 0.2, y=yf - 0.9, z=0, cor=madeira, bisel=0.05))
    for x in (-3.4, 3.4):
        it.add(caixa(0.2, 0.2, 2.6, x=x, y=yf - 1.6, z=0.2, cor="branco", bisel=0.05))
    it.add(caixa(LX - 1.2, 2.0, 0.22, y=yf - 0.95, z=2.75, cor="branco", bisel=0.08))
    it.add(caixa(LX - 1.4, 1.8, 0.06, y=yf - 0.95, z=2.97, cor=telhado, bisel=0.02))
    it.add(porta_vidro(1.2, yf, 0.2, l=1.1, a=2.3, cor=madeira, mat="janela"))
    it.add(cb.janelas(("y", yf, -1), -LX / 2 + 0.7, -0.2, 0.6, zw - 0.3, 2, 1, larg=0.62, alt=0.72, semente=70,
                      apagadas=APAG, frias=FRIAS))
    it.add(cb.janelas(("y", yf, -1), 2.4, LX / 2 - 0.5, 0.6, zw - 0.3, 1, 1, larg=0.6, alt=0.72, semente=71,
                      apagadas=APAG, frias=FRIAS))
    it.add(cb.janelas(("y", PY / 2, 1), -LX / 2 + 0.7, LX / 2 - 0.7, 0.6, zw - 0.3, 3, 1, larg=0.55, alt=0.7,
                      semente=72, apagadas=APAG, frias=FRIAS))
    for sx in (-1, 1):
        it.add(cb.janelas(("x", sx * LX / 2, sx), -PY / 2 + 0.8, PY / 2 - 0.8, 0.6, zw - 0.3, 2, 1, larg=0.55,
                          alt=0.7, semente=73 + sx, apagadas=APAG, frias=FRIAS))
        it.add(janela_redonda(sx * LX / 2, 0, zw + 0.9, r=0.4, face=sx, eixo="x", mat="janela_apagada"))
    # barril de chuva, horta e cerquinha
    it.add(mb.cilindro(0.45, 1.0, x=LX / 2 + 0.6, y=-1.5, z=0, cor="madeira", seg=14, bisel=0.05))
    it.add(mb.cilindro(0.47, 0.08, x=LX / 2 + 0.6, y=-1.5, z=0.25, cor="ferro", seg=14, bisel=0.01))
    it.add(mb.cilindro(0.47, 0.08, x=LX / 2 + 0.6, y=-1.5, z=0.75, cor="ferro", seg=14, bisel=0.01))
    for k, y in enumerate((-0.2, 1.2, 2.6)):
        it.add(caixa(1.0, 1.1, 0.35, x=-LX / 2 - 0.85, y=y, z=0, cor="madeira_clara", bisel=0.05))
        it.add(caixa(0.86, 0.96, 0.05, x=-LX / 2 - 0.85, y=y, z=0.32, cor="terra", bisel=0))
        for q in range(3):
            it.add(bola(0.15, -LX / 2 - 0.85, y - 0.3 + 0.3 * q, 0.47, ("folha_clara", "verde_lima", "vermelho")[
                (q + k) % 3] if k == 1 else ("folha_clara", "verde")[q % 2]))
    for k in range(13):
        x = -LX / 2 - 0.2 + k * 0.75
        if -1.0 < x < 3.0:
            continue
        it.add(caixa(0.1, 0.08, 0.8, x=x, y=yf - 2.3, z=0, cor="branco", bisel=0.02))
    for xa, xb in ((-LX / 2 - 0.2, -1.3), (3.2, LX / 2 + 0.3)):
        it.add(caixa(xb - xa, 0.06, 0.08, x=(xa + xb) / 2, y=yf - 2.33, z=0.55, cor="branco", bisel=0.01))
    it.add(moita(-2.6, yf - 1.6, 0.2, 0.35, "folha_clara", sem=74), moita(LX / 2 - 0.3, yf - 1.6, 0, 0.45, "verde",
                                                                         sem=75))
    it.colisao([((0, 0, 0), (LX, PY, zw)), ((0, 0, zw), (LX + 0.8, PY + 1.2, 2.6)), ((0, yf - 0.95, 0), (LX - 1.2,
                                                                                                           2.0, 3.0))])


def xicara(x, y, z, esc=1.0):
    """Xícara gigante de café (para o telhado do café)."""
    s = esc
    corpo = mb.torno([(0, 0), (0.9 * s, 0), (1.05 * s, 0.12 * s), (1.35 * s, 1.5 * s), (1.42 * s, 1.75 * s),
                      (1.3 * s, 1.78 * s), (0, 1.78 * s)], x=x, y=y, z=z + 0.2 * s, cor="branco", seg=28)
    cafe = mb.cilindro(1.28 * s, 0.05, x=x, y=y, z=z + 1.68 * s, cor="marrom", seg=28, bisel=0)
    faixa_ = mb.cilindro(1.27 * s, 0.25 * s, x=x, y=y, z=z + 0.9 * s, r2=1.33 * s, cor="verde", seg=28, bisel=0)
    pires = mb.torno([(0, 0), (1.9 * s, 0.05 * s), (2.1 * s, 0.25 * s), (1.95 * s, 0.28 * s), (0, 0.2 * s)],
                     x=x, y=y, z=z, cor="branco", seg=28)
    asa = mb.tubo([(x + 1.25 * s, y, z + 1.4 * s), (x + 1.9 * s, y, z + 1.35 * s), (x + 1.85 * s, y, z + 0.7 * s),
                   (x + 1.2 * s, y, z + 0.6 * s)], 0.12 * s, cor="branco", raio_curva=0.3 * s, seg=10)
    vapor = [bola(0.28 * s, x - 0.3 * s + 0.25 * s * k, y, z + (2.3 + 0.45 * k) * s, "branco", esc=(1, 1, 0.8))
             for k in range(3)]
    return [corpo, cafe, faixa_, pires, asa] + vapor


def toldo_listrado(x0, x1, y, z, prof=1.4, queda=0.5, cores=("verde", "branco"), n=None):
    """Toldo listrado inclinado, preso na fachada y (sai para −Y), da altura z descendo queda."""
    n = n or max(4, int((x1 - x0) / 0.6))
    w = (x1 - x0) / n
    ang = math.degrees(math.atan2(queda, prof))
    L = math.hypot(prof, queda)
    out = []
    for k in range(n):
        tira = caixa(w + 0.002, L, 0.08, x=0, y=-L / 2, z=-0.04, cor=cores[k % 2], bisel=0, liso=False)
        mb.transforma(tira, rot=("X", ang))
        mb.transforma(tira, loc=(x0 + w * (k + 0.5), y, z))
        out.append(tira)
        aba = caixa(w + 0.002, 0.06, 0.32, x=x0 + w * (k + 0.5), y=y - prof - 0.02, z=z - queda - 0.3,
                    cor=cores[k % 2], bisel=0, liso=False)
        out.append(aba)
    return out


def cafe_ecologico(it, parede="creme_claro", madeira="madeira_mel", toldo=("verde", "branco")):
    """Café de esquina com xícara gigante no telhado, toldo listrado, letreiro CAFÉ e mesinhas na calçada.
    Lote 1 × 1."""
    LX, PY = 9.4, 8.0
    H = 4.4
    yf = -PY / 2
    it.add(caixa(LX, PY, H, cor=parede, bisel=0.25, seg=2))
    it.add(caixa(LX + 0.2, PY + 0.2, 0.55, z=0, cor=madeira, bisel=0.1))
    it.add(caixa(LX + 0.4, PY + 0.4, 0.45, z=H - 0.1, cor="branco", bisel=0.18))
    it.add(anel(ret(LX + 0.3, PY + 0.3, 0.3, seg=3), ret(LX - 0.3, PY - 0.3, 0.1, seg=3), H + 0.3, H + 0.85,
                "branco", nome="parapeito"))
    # vitrines e porta
    it.add(vidros_linha([(-LX / 2 + 0.5, yf), (-0.9, yf)], 0.55, 1, 3.0, larg=1.3, frac=0.9, peit=0.05, alt_v=2.3,
                        mats=["janela"], sem=80))
    it.add(vidros_linha([(1.6, yf), (LX / 2 - 0.5, yf)], 0.55, 1, 3.0, larg=1.3, frac=0.9, peit=0.05, alt_v=2.3,
                        mats=["janela"], sem=81))
    for xa, xb in ((-LX / 2 + 0.4, -0.8), (1.5, LX / 2 - 0.4)):
        it.add(caixa(xb - xa, 0.2, 0.16, x=(xa + xb) / 2, y=yf - 0.06, z=0.5, cor=madeira, bisel=0.04))
        it.add(caixa(xb - xa, 0.2, 0.16, x=(xa + xb) / 2, y=yf - 0.06, z=2.92, cor=madeira, bisel=0.04))
    it.add(porta_vidro(0.35, yf, 0.55, l=1.3, a=2.4, cor=madeira))
    it.add(toldo_listrado(-LX / 2 + 0.2, LX / 2 - 0.2, yf - 0.05, 3.35, prof=1.3, queda=0.55, cores=toldo))
    it.add(placa("cafe", 3.0, 1.0, 0, yf - 0.02, H - 0.95 + 0.25, moldura=madeira))
    it.add(vidros_linha([(LX / 2, yf + 0.8), (LX / 2, PY / 2 - 0.8)], 0.55, 1, 3.0, larg=1.6, frac=0.86, peit=0.3,
                        alt_v=2.0, mats=["janela", "janela_fria"], sem=82))
    it.add(cb.janelas(("y", PY / 2, 1), -LX / 2 + 0.8, LX / 2 - 0.8, 0.8, H - 0.4, 3, 1, larg=0.55, alt=0.62,
                      semente=83, apagadas=APAG, frias=FRIAS))
    it.add(cb.janelas(("x", -LX / 2, -1), -PY / 2 + 0.8, PY / 2 - 0.8, 0.8, H - 0.4, 2, 1, larg=0.6, alt=0.62,
                      semente=84, apagadas=APAG, frias=FRIAS))
    # telhado: xícara e plantas
    zt = H + 0.35
    it.add(caixa(LX - 0.4, PY - 0.4, 0.06, z=zt - 0.04, cor="cinza_claro", bisel=0))
    it.add(xicara(-0.6, 0.6, zt, esc=1.25))
    it.add(floreira(-LX / 2 + 0.7, PY / 2 - 0.7, LX / 2 - 0.7, PY / 2 - 0.7, zt, alt=0.45, larg=0.55, sem=85))
    it.add(paineis_solares(3.0, -1.6, zt, 2.4, 2.0, 2, 2, incl=15))
    # mesinhas com guarda-sol e vasos
    for x in (-3.2, 3.4):
        y = yf - 1.8
        it.add(mb.cilindro(0.45, 0.05, x=x, y=y, z=0.72, cor="branco", seg=16, bisel=0.01))
        it.add(mb.cilindro(0.05, 0.72, x=x, y=y, z=0, cor="metal", seg=8, bisel=0))
        it.add(bola(0.12, x, y, 0.86, "rosa_claro"))
        for sx in (-1, 1):
            it.add(mb.cilindro(0.2, 0.05, x=x + sx * 0.75, y=y, z=0.45, cor=madeira, seg=12, bisel=0.01))
            it.add(mb.cilindro(0.03, 0.45, x=x + sx * 0.75, y=y, z=0, cor="metal", seg=6, bisel=0))
    for x in (-0.9, 1.6):
        it.add(mb.cilindro(0.28, 0.5, x=x, y=yf - 0.45, z=0, r2=0.34, cor="terracota", seg=12, bisel=0.03))
        it.add(bola(0.4, x, yf - 0.45, 0.85, "folha_clara"))
    it.colisao([((0, 0, 0), (LX + 0.4, PY + 0.4, H + 0.85)), ((-0.6, 0.6, H + 0.35), (3.6, 3.6, 3.4))])


def predio_amarelo_varandas(it, parede="creme", varanda="verde", telhado="cinza_medio", terreo="verde_medio"):
    """Prédio médio creme com caixas de varanda verdes saltadas (floreiras) e laje de cobertura com árvore.
    Lote 1 × 1."""
    N = 5
    L = niveis(N)
    LX, PY = 10.4, 9.0
    H = L[N]
    yf = -PY / 2
    it.add(caixa(LX, PY, T0, cor=terreo, bisel=0.25, seg=2))
    it.add(caixa(LX, PY, H - T0, z=T0, cor=parede, bisel=0.3, seg=2))
    for j in range(1, N):
        it.add(caixa(LX + 0.2, PY + 0.2, 0.18, z=L[j] - 0.09, cor="branco", bisel=0.06))
    it.add(vidros_linha([(-LX / 2 + 0.6, yf), (-1.2, yf)], 0, 1, T0, larg=1.7, frac=0.9, peit=0.4, alt_v=2.9,
                        mats=["janela", "janela_fria"], sem=90))
    it.add(vidros_linha([(1.6, yf), (LX / 2 - 0.6, yf)], 0, 1, T0, larg=1.7, frac=0.9, peit=0.4, alt_v=2.9,
                        mats=["janela", "janela_fria"], sem=91))
    it.add(porta_vidro(0.2, yf, 0, l=1.8, a=2.8))
    it.add(caixa(LX - 0.4, 1.3, 0.25, y=yf - 0.62, z=3.5, cor="branco", bisel=0.1))
    rnd = random.Random(92)
    for j in range(1, N):
        z0 = L[j]
        it.add(cb.janelas(("y", yf, -1), -LX / 2 + 0.4, LX / 2 - 0.4, z0, z0 + A, 4, 1, larg=0.62, alt=0.66,
                          semente=93 + j, apagadas=APAG, frias=FRIAS))
        xs = (-2.6, 2.6) if j % 2 else (0.0,)
        for x in xs:
            it.add(caixa(2.4, 1.2, 1.0, x=x, y=yf - 0.55, z=z0 - 0.1, cor=varanda, bisel=0.18, seg=2))
            it.add(caixa(2.2, 0.95, 0.08, x=x, y=yf - 0.6, z=z0 + 0.85, cor="terra", bisel=0))
            for q in range(3):
                it.add(bola(rnd.uniform(0.25, 0.34), x - 0.7 + 0.7 * q, yf - 0.62, z0 + 1.08,
                            rnd.choice(("verde_lima", "folha_clara", "folha"))))
        for sx in (-1, 1):
            it.add(cb.janelas(("x", sx * LX / 2, sx), -PY / 2 + 0.6, PY / 2 - 0.6, z0, z0 + A, 3, 1, larg=0.6,
                              alt=0.64, semente=rnd.randrange(999), apagadas=APAG, frias=FRIAS))
        it.add(cb.janelas(("y", PY / 2, 1), -LX / 2 + 0.6, LX / 2 - 0.6, z0, z0 + A, 4, 1, larg=0.55, alt=0.6,
                          semente=rnd.randrange(999), apagadas=APAG, frias=FRIAS, peitoril=False))
    it.add(caixa(1.4, 1.0, 1.0, x=LX / 2 + 0.45, y=-1.2, z=L[2] - 0.1, cor=varanda, bisel=0.18, seg=2))
    it.add(moita(LX / 2 + 0.45, -1.2, L[2] + 0.9, 0.35, "verde_lima", sem=96))
    # cobertura
    zt = H
    it.add(caixa(LX - 0.6, PY - 0.6, 1.0, z=zt, cor=parede, bisel=0.2))
    it.add(caixa(LX + 1.2, PY + 1.2, 0.42, z=zt + 1.0, cor=telhado, bisel=0.2, seg=2))
    it.add(caixa(LX + 0.6, PY + 0.6, 0.3, z=zt + 0.25, cor="branco", bisel=0.12))
    it.add(vidros_ret(LX - 0.6, PY - 0.6, zt + 0.15, 1, 1.0, lados="fdte", larg=1.4, frac=0.7, peit=0.1, alt_v=0.65,
                      sem=97))
    zr = zt + 1.42
    it.add(jardim(ret(LX - 0.4, PY - 0.4, 0.5), zr, sem=98, arvores=2, moitas=3, h_arv=(2.4, 3.2), borda=True))
    it.colisao([((0, 0, 0), (LX + 0.2, PY + 0.2, H)), ((0, 0, H), (LX + 1.2, PY + 1.2, 1.5)),
                ((0, yf - 0.55, T0), (LX, 1.2, H - T0))])


def canteiro(x, y, z, l, p, plantas=("folha_clara", "verde_lima"), frutas=None, sem=0, cor="branco"):
    """Canteiro elevado de horta: caixa com terra e fileiras de pés de verdura (e frutinhas)."""
    rnd = random.Random(sem)
    out = [caixa(l, p, 0.45, x=x, y=y, z=z, cor=cor, bisel=0.06),
           caixa(l - 0.14, p - 0.14, 0.05, x=x, y=y, z=z + 0.42, cor="terra", bisel=0)]
    nx = max(1, int(l / 0.55))
    ny = max(1, int(p / 0.55))
    for i in range(nx):
        for j in range(ny):
            px = x - l / 2 + l * (i + 0.5) / nx
            py = y - p / 2 + p * (j + 0.5) / ny
            out.append(bola(rnd.uniform(0.15, 0.21), px, py, z + 0.55, plantas[(i + j) % len(plantas)],
                            esc=(1, 1, 0.8)))
            if frutas and rnd.random() < 0.35:
                out.append(bola(0.07, px + 0.12, py - 0.1, z + 0.62, rnd.choice(frutas)))
    return out


def estufa(x, y, z, l, p, h=2.4, quadro="branco", plantas=True, sem=0):
    """Estufa de vidro com cobertura em arco (abóbada ao longo de X), quadros brancos e plantas dentro."""
    out = [caixa(l, p, 0.2, x=x, y=y, z=z, cor="concreto", bisel=0.04)]
    hw = h * 0.55
    r = p / 2
    n = 10
    arco = [(y - r * math.cos(math.pi * k / n), z + hw + r * 0.7 * math.sin(math.pi * k / n)) for k in range(n + 1)]
    perfil = [(y - r, z + 0.2)] + arco + [(y + r, z + 0.2)]
    out.append(mb.extrudado(ccw(perfil), l - 0.12, x=x - (l - 0.12) / 2, cor=None, mat="vidro", bisel=0, plano="yz",
                            nome="vidro_estufa"))
    nq = max(2, int(l / 1.0))
    for k in range(nq + 1):  # arcos brancos (barras retas de ponto a ponto, leves)
        xx = x - l / 2 + 0.03 + (l - 0.06) * k / nq
        for (ya, za), (yb, zb) in zip(perfil, perfil[1:]):
            out.append(barra((xx, ya, za), (xx, yb, zb), 0.1, 0.1, cor=quadro))
    for yy, zz in perfil[1:-1:3] + [(y - r, z + hw), (y + r, z + hw)]:
        out.append(caixa(l, 0.08, 0.08, x=x, y=yy, z=zz - 0.04, cor=quadro, bisel=0, liso=False))
    if plantas:
        rnd = random.Random(sem)
        out.append(caixa(l - 0.8, 0.7, 0.75, x=x, y=y, z=z + 0.2, cor="madeira_clara", bisel=0.04))
        for k in range(max(2, int(l / 0.8))):
            px = x - l / 2 + 0.7 + (l - 1.4) * k / max(1, int(l / 0.8) - 1)
            out.append(bola(rnd.uniform(0.22, 0.3), px, y, z + 1.15, rnd.choice(("verde_lima", "folha_clara",
                                                                                 "verde"))))
    return out


def casa_madeira_horta(it, madeira="madeira_clara", quadro="branco"):
    """Casa térrea de madeira com horta no telhado (canteiros elevados), estufinha e caixa d'água. Lote 1 × 1."""
    LX, PY = 9.4, 7.6
    H = 3.5
    yf = -PY / 2
    it.add(caixa(LX, PY, H, cor=madeira, bisel=0.2, seg=2))
    it.add(caixa(LX + 0.2, PY + 0.2, 0.45, z=0, cor="concreto", bisel=0.08))
    for k in range(18):  # tábuas horizontais (frente)
        it.add(caixa(LX - 0.4, 0.03, 0.03, y=yf - 0.015, z=0.6 + k * 0.16, cor="madeira", bisel=0, liso=False))
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.add(caixa(0.28, 0.28, H, x=sx * (LX / 2 - 0.04), y=sy * (PY / 2 - 0.04), cor=quadro, bisel=0.06))
    it.add(caixa(LX + 0.5, PY + 0.5, 0.35, z=H, cor=quadro, bisel=0.14))
    it.add(anel(ret(LX + 0.3, PY + 0.3, 0.3, seg=3), ret(LX - 0.2, PY - 0.2, 0.1, seg=3), H + 0.3, H + 0.9, quadro,
                nome="parapeito"))
    it.add(porta_vidro(-1.4, yf, 0.45, l=1.1, a=2.3, cor=quadro, mat="janela"))
    it.add(cb.janelas(("y", yf, -1), 0.0, LX / 2 - 0.4, 0.8, H - 0.3, 2, 1, larg=0.7, alt=0.75, semente=200,
                      apagadas=APAG, frias=FRIAS))
    it.add(cb.janelas(("y", yf, -1), -LX / 2 + 0.4, -2.4, 0.8, H - 0.3, 1, 1, larg=0.6, alt=0.75, semente=201,
                      apagadas=APAG, frias=FRIAS))
    it.add(cb.janelas(("y", PY / 2, 1), -LX / 2 + 0.6, LX / 2 - 0.6, 0.8, H - 0.3, 3, 1, larg=0.55, alt=0.7,
                      semente=202, apagadas=APAG, frias=FRIAS))
    for sx in (-1, 1):
        it.add(cb.janelas(("x", sx * LX / 2, sx), -PY / 2 + 0.7, PY / 2 - 0.7, 0.8, H - 0.3, 2, 1, larg=0.6,
                          alt=0.7, semente=203 + sx, apagadas=APAG, frias=FRIAS))
    it.add(caixa(2.4, 1.2, 0.18, x=-1.4, y=yf - 0.55, z=2.95, cor=quadro, bisel=0.06))
    # horta no telhado
    zt = H + 0.35
    it.add(caixa(LX - 0.3, PY - 0.3, 0.06, z=zt - 0.04, cor="madeira_mel", bisel=0))
    it.add(canteiro(-2.9, -1.6, zt, 2.6, 1.0, sem=1, frutas=("vermelho", "laranja")))
    it.add(canteiro(-2.9, 0.3, zt, 2.6, 1.0, plantas=("verde", "folha_clara"), sem=2))
    it.add(canteiro(0.4, -1.6, zt, 2.2, 1.0, plantas=("verde_lima", "folha"), sem=3, frutas=("vermelho",)))
    it.add(estufa(1.6, 1.8, zt, 3.6, 2.2, h=2.3, sem=4))
    it.add(caixa_dagua(-3.6, 2.4, zt, r=0.7, h=1.1))
    it.add(moita(LX / 2 - 0.9, -2.6, zt, 0.4, "verde_lima", sem=5))
    # entrada: vasos
    for x in (-2.5, -0.3):
        it.add(mb.cilindro(0.25, 0.45, x=x, y=yf - 0.5, z=0, r2=0.3, cor="terracota", seg=12, bisel=0.03))
        it.add(bola(0.36, x, yf - 0.5, 0.8, "folha_clara"))
    it.colisao([((0, 0, 0), (LX + 0.5, PY + 0.5, H + 0.9)), ((1.6, 1.8, zt), (3.6, 2.2, 2.4))])


def quitanda_horta(it, parede="branco", madeira="madeira_mel", toldo=("verde", "branco")):
    """Quitanda de produtos da horta: frente aberta com caixotes de frutas e verduras, toldo listrado, letreiro
    HORTA e placas solares no telhado. Lote 1 × 1."""
    LX, PY = 10.0, 7.8
    H = 4.4
    yf = -PY / 2
    it.add(caixa(LX, PY, H, cor=parede, bisel=0.25, seg=2))
    it.add(caixa(LX + 0.2, PY + 0.2, 0.55, z=0, cor=madeira, bisel=0.08))
    it.add(caixa(LX + 0.4, PY + 0.4, 0.42, z=H - 0.1, cor=toldo[0], bisel=0.18))
    # vão da loja (interior quente) e balcão
    it.add(caixa(LX - 1.2, 0.08, 2.7, y=yf - 0.02, z=0.55, cor="madeira_clara", bisel=0.02))
    it.add(vidros_linha([(-LX / 2 + 0.9, yf - 0.07), (LX / 2 - 0.9, yf - 0.07)], 0.55, 1, 3.0, larg=2.1, frac=0.94,
                        peit=0.6, alt_v=2.0, mats=["janela"], sem=210))
    it.add(toldo_listrado(-LX / 2 + 0.1, LX / 2 - 0.1, yf - 0.05, 3.5, prof=1.6, queda=0.6, cores=toldo))
    it.add(placa("horta", 3.4, 1.0, 0, yf - 0.02, H - 0.62, moldura="branco"))
    # caixotes em degraus com frutas
    rnd = random.Random(211)
    frutas = ("laranja", "vermelho", "amarelo", "verde_lima", "folha_clara", "roxo", "vermelho_claro")
    for k, x in enumerate((-3.4, -1.2, 1.2, 3.4)):
        for d, (dy, dz) in enumerate(((-1.25, 0.0), (-0.75, 0.42))):
            cx_, cy_ = x, yf + dy
            it.add(caixa(1.8, 0.62, 0.4, x=cx_, y=cy_, z=dz, cor="madeira_clara", bisel=0.04))
            cor = frutas[(k * 2 + d) % len(frutas)]
            for q in range(4):
                it.add(bola(0.15, cx_ - 0.6 + 0.4 * q, cy_ + rnd.uniform(-0.1, 0.1), dz + 0.45, cor,
                            esc=(1, 1, 0.9)))
    it.add(cb.janelas(("x", LX / 2, 1), -PY / 2 + 0.8, PY / 2 - 0.8, 0.8, H - 0.4, 2, 1, larg=0.6, alt=0.62,
                      semente=212, apagadas=APAG, frias=FRIAS))
    it.add(cb.janelas(("x", -LX / 2, -1), -PY / 2 + 0.8, PY / 2 - 0.8, 0.8, H - 0.4, 2, 1, larg=0.6, alt=0.62,
                      semente=213, apagadas=APAG, frias=FRIAS))
    it.add(cb.janelas(("y", PY / 2, 1), -LX / 2 + 0.8, LX / 2 - 0.8, 0.8, H - 0.4, 3, 1, larg=0.55, alt=0.6,
                      semente=214, apagadas=APAG, frias=FRIAS))
    zt = H + 0.32
    it.add(anel(ret(LX + 0.3, PY + 0.3, 0.3, seg=3), ret(LX - 0.3, PY - 0.3, 0.1, seg=3), zt - 0.02, zt + 0.5,
                "branco", nome="parapeito"))
    it.add(paineis_solares(-1.4, 0.4, zt, 6.0, 4.0, 4, 3, incl=14))
    it.add(floreira(LX / 2 - 0.8, -PY / 2 + 0.9, LX / 2 - 0.8, PY / 2 - 0.9, zt, larg=0.6, alt=0.45, sem=215))
    it.colisao([((0, 0, 0), (LX + 0.4, PY + 0.4, H + 0.8)), ((0, yf - 1.0, 0), (LX - 0.4, 1.4, 0.85))])


def casa_estufa(it, parede="branco", telhado="madeira_media", quadro="branco"):
    """Casa com estufa de vidro em abóbada encostada, horta na frente e telhado de duas águas. Lote 1 × 1."""
    LX, PY = 6.4, 7.2
    zw = 5.6
    xc = -2.6
    yf = -PY / 2
    it.add(caixa(LX, PY, zw, x=xc, cor=parede, bisel=0.22, seg=2))
    it.add(caixa(LX + 0.2, PY + 0.2, 0.4, x=xc, z=0, cor="concreto", bisel=0.08))
    it.add(caixa(LX + 0.24, PY + 0.24, 0.2, x=xc, z=2.9, cor=telhado, bisel=0.06))
    objs, ang = telhado_duas_aguas(LX, PY, zw, 2.2, beiral=0.55, cor=telhado, parede=parede)
    for o in objs:
        mb.transforma(o, loc=(xc, 0, 0))
    it.add(objs)
    it.add(porta_vidro(xc + 1.4, yf, 0.4, l=1.1, a=2.3, cor=telhado, mat="janela"))
    it.add(caixa(1.8, 1.0, 0.16, x=xc + 1.4, y=yf - 0.45, z=2.85, cor=telhado, bisel=0.05))
    it.add(cb.janelas(("y", yf, -1), xc - LX / 2 + 0.4, xc + 0.4, 0.8, 2.8, 1, 1, larg=0.62, alt=0.75, semente=220,
                      apagadas=APAG, frias=FRIAS))
    it.add(cb.janelas(("y", yf, -1), xc - LX / 2 + 0.4, xc + LX / 2 - 0.4, 3.2, zw - 0.2, 2, 1, larg=0.5, alt=0.7,
                      semente=221, apagadas=APAG, frias=FRIAS))
    it.add(janela_redonda(xc, yf, zw + 0.85, r=0.45, mat="janela"))
    it.add(janela_redonda(xc, PY / 2, zw + 0.85, r=0.45, face=1, mat="janela_apagada"))
    it.add(cb.janelas(("y", PY / 2, 1), xc - LX / 2 + 0.4, xc + LX / 2 - 0.4, 0.8, zw - 0.2, 2, 2, larg=0.5, alt=0.62,
                      semente=222, apagadas=APAG, frias=FRIAS))
    it.add(cb.janelas(("x", xc - LX / 2, -1), -PY / 2 + 0.6, PY / 2 - 0.6, 0.8, zw - 0.2, 2, 2, larg=0.55, alt=0.62,
                      semente=223, apagadas=APAG, frias=FRIAS))
    # estufa
    it.add(estufa(xc + LX / 2 + 2.25, 0.5, 0.0, 4.5, 5.2, h=3.4, quadro=quadro, sem=224))
    it.add(caixa(0.3, 5.0, 3.0, x=xc + LX / 2 + 0.05, y=0.5, z=0.2, cor=parede, bisel=0.05))
    # horta na frente
    it.add(canteiro(xc - 1.2, yf - 1.3, 0, 2.4, 0.9, sem=225, frutas=("vermelho", "laranja"), cor=telhado))
    it.add(canteiro(3.0, yf - 1.3, 0, 2.6, 0.9, plantas=("verde", "folha_clara"), sem=226, cor=telhado))
    it.add(arvore(-5.3, -4.9, 0, h=3.0, r=0.9, cor="verde_lima"))
    it.colisao([((xc, 0, 0), (LX, PY, zw + 2.4)), ((xc + LX / 2 + 2.25, 0.5, 0), (4.5, 5.2, 3.4))])


def predinho_redondo_varandas(it, madeira="madeira_mel", verde="verde_lima"):
    """Predinho redondo de três andares com varandas de madeira em volta, plantas pendentes e jardim no topo.
    Lote 1 × 1."""
    N = 4
    L = niveis(N, terreo=3.6)
    R = 3.4
    nuc = circ(R, 32)
    it.add(solido(nuc, 0, L[N], "branco"))
    it.add(vidros_linha(circ(R, 32), 0.0, 1, 3.6, larg=1.6, frac=0.84, peit=0.4, alt_v=2.6, fechado=True,
                        mats=["janela", "janela_fria"], sem=230))
    it.add(vidros_linha(circ(R, 32), L[1:N], N - 1, [A] * (N - 1), larg=1.5, frac=0.6, peit=0.4, alt_v=2.2,
                        fechado=True, sem=231))
    for k in range(1, N + 1):
        z = L[k]
        deck = circ(R + 1.2, 32)
        it.add(solido(deck, z - 0.25, 0.3, madeira if k < N else "branco", bisel=0.1))
        if k < N:
            it.add(anel(circ(R + 1.15, 32), circ(R + 1.05, 32), z + 0.05, z + 1.0, "madeira_clara", nome="guarda"))
            it.add(anel(circ(R + 1.2, 32), circ(R + 1.0, 32), z + 1.0, z + 1.1, madeira, nome="corrimao"))
            rnd = random.Random(k)
            for q in range(5):
                a = 2 * math.pi * q / 5 + k
                rr = R + 1.25
                it.add(bola(0.36, rr * math.cos(a), rr * math.sin(a), z - 0.35, rnd.choice((verde, "folha_clara",
                                                                                          "verde_claro")),
                            esc=(1, 1, 1.3)))
    it.add(porta_vidro(0, -R, 0, l=1.6, a=2.6))
    zt = L[N] + 0.05
    it.add(anel(circ(R + 1.2, 32), circ(R + 0.95, 32), zt, zt + 0.55, "branco", nome="parapeito"))
    it.add(jardim(circ(R + 0.95, 32), zt, sem=232, arvores=1, moitas=3, h_arv=(2.6, 3.0), borda=False))
    it.colisao([((0, 0, 0), (2 * R + 2.4, 2 * R + 2.4, L[N] + 0.6))])


def parede_verde(x0, x1, y, z0, z1, face=-1, sem=0, eixo="y", passo=0.62):
    """Jardim vertical: grade de almofadas verdes (tons variados) presas na fachada."""
    rnd = random.Random(sem)
    cores = ("folha", "folha_clara", "verde_lima", "verde", "verde_claro")
    out = [caixa(x1 - x0, 0.12, z1 - z0, x=(x0 + x1) / 2, y=y + face * 0.06, z=z0, cor="folha_escura", bisel=0.03)
           if eixo == "y" else caixa(0.12, x1 - x0, z1 - z0, x=y + face * 0.06, y=(x0 + x1) / 2, z=z0,
                                     cor="folha_escura", bisel=0.03)]
    nx = max(1, round((x1 - x0) / passo))
    nz = max(1, round((z1 - z0) / passo))
    w, h = (x1 - x0) / nx, (z1 - z0) / nz
    for i in range(nx):
        for j in range(nz):
            u = x0 + w * (i + 0.5) + rnd.uniform(-0.05, 0.05)
            zz = z0 + h * j + rnd.uniform(-0.04, 0.04)
            d = rnd.uniform(0.18, 0.3)
            if eixo == "y":
                out.append(caixa(w * 1.08, d, h * 1.08, x=u, y=y + face * (0.12 + d / 2), z=zz, cor=rnd.choice(cores),
                                 bisel=min(w, h) * 0.4))
            else:
                out.append(caixa(d, w * 1.08, h * 1.08, x=y + face * (0.12 + d / 2), y=u, z=zz, cor=rnd.choice(cores),
                                 bisel=min(w, h) * 0.4))
    return mb.junta(out, "parede_verde")


def predinho_jardim_vertical(it, parede="branco", verde="verde_lima"):
    """Predinho de quatro andares com jardins verticais na frente e na lateral e jardim no telhado. Lote 1 × 1."""
    N = 4
    L = niveis(N, terreo=3.6)
    LX, PY = 8.4, 8.0
    H = L[N]
    yf = -PY / 2
    it.add(caixa(LX, PY, H, cor=parede, bisel=0.3, seg=2))
    for j in range(1, N):
        it.add(caixa(LX + 0.2, PY + 0.2, 0.2, z=L[j] - 0.1, cor="branco_gelo", bisel=0.06))
    it.add(parede_verde(-LX / 2 + 0.35, -1.4, yf, 3.8, H - 0.5, sem=1, passo=0.85))
    it.add(parede_verde(-PY / 2 + 0.4, PY / 2 - 0.4, LX / 2, 3.8, H - 0.5, face=1, eixo="x", sem=2, passo=1.0))
    rnd = random.Random(240)
    for j in range(1, N):
        z0 = L[j]
        for x in (0.4, 2.6):
            it.add(janela_caixa(x, yf, z0 + 0.6, 1.5, 1.8, prof=0.3, mat=_sorteia(rnd)))
        it.add(cb.janelas(("x", -LX / 2, -1), -PY / 2 + 0.6, PY / 2 - 0.6, z0, z0 + A, 3, 1, larg=0.6, alt=0.62,
                          semente=241 + j, apagadas=APAG, frias=FRIAS))
        it.add(cb.janelas(("y", PY / 2, 1), -LX / 2 + 0.6, LX / 2 - 0.6, z0, z0 + A, 3, 1, larg=0.6, alt=0.62,
                          semente=245 + j, apagadas=APAG, frias=FRIAS, peitoril=False))
    it.add(vidros_linha([(-LX / 2 + 0.5, yf), (0.6, yf)], 0.0, 1, 3.6, larg=1.6, frac=0.9, peit=0.3, alt_v=2.6,
                        mats=["janela", "janela_fria"], sem=249))
    it.add(porta_vidro(2.4, yf, 0, l=1.3, a=2.6))
    it.add(caixa(LX - 0.4, 1.2, 0.2, y=yf - 0.55, z=3.0, cor="branco", bisel=0.08))
    it.add(floreira(-LX / 2 + 0.4, yf - 0.9, 1.0, yf - 0.9, 0, alt=0.5, larg=0.55, sem=250))
    zt = H
    it.add(anel(ret(LX + 0.1, PY + 0.1, 0.35, seg=3), ret(LX - 0.5, PY - 0.5, 0.1, seg=3), zt - 0.05, zt + 0.6,
                "branco", nome="parapeito"))
    it.add(jardim(ret(LX - 0.5, PY - 0.5, 0.2), zt, sem=251, arvores=2, moitas=3, h_arv=(2.4, 3.2), borda=False,
                  cores=(verde, "folha_clara", "verde_claro")))
    it.colisao([((0, 0, 0), (LX + 0.6, PY + 0.6, H + 0.6))])


# =====================================================================================================================
# Registro e execução
# =====================================================================================================================
PECAS = [
    # id, rótulo, grupo, função, kwargs, lote, andares, tags
    ("torre_degraus_inclinada", "Torre em degraus inclinada", "torre_degraus", torre_degraus_inclinada, {},
     [1, 2], 15, ["torre", "terracos", "plantas"]),
    ("torre_lajes_arredondadas", "Torre de lajes arredondadas", "torre_lajes", torre_lajes_arredondadas, {},
     [1, 1], 12, ["torre", "floreiras"]),
    ("predio_trelica_verde", "Prédio alto com treliça verde", "trelica_verde", predio_trelica_verde, {},
     [1, 1], 15, ["torre", "fachada_verde"]),
    ("escritorio_jardim_telhado", "Escritórios com jardim no telhado", "escritorio_jardim",
     escritorio_jardim_telhado, {}, [1, 1], 6, ["escritorio", "jardim", "solar"]),
    ("predio_curvo_sinuoso_s", "Prédio curvo sinuoso com torre redonda", "curvo_sinuoso_s", predio_curvo_sinuoso_a, {},
     [2, 1], 7, ["curvo", "jardim"]),
    ("predio_curvo_ondas", "Prédio curvo de lajes em ondas", "curvo_ondas", predio_curvo_sinuoso_b, {},
     [2, 1], 6, ["curvo", "jardim", "floreiras"]),
    ("pavilhao_cobertura_ondulada", "Pavilhão de cobertura ondulada", "pavilhao_ondulado", pavilhao_ondulado, {},
     [2, 1], 2, ["pavilhao", "vidro"]),
    ("predio_terracos_escadaria", "Prédio em terraços com tetos verdes", "terracos_escadaria",
     predio_terracos_escadaria, {}, [1, 1], 5, ["terracos", "teto_verde"]),
    ("torre_redonda_heliponto", "Torre redonda com heliponto verde", "torre_redonda", torre_redonda_heliponto, {},
     [1, 1], 9, ["torre", "heliponto", "jardim"]),
    ("predio_turbina_eolica", "Prédio com turbina eólica", "turbina_eolica", predio_turbina_eolica, {},
     [1, 1], 5, ["energia", "turbina", "jardim"]),
    ("predio_cascata", "Prédio com cascata na fachada", "cascata", predio_cascata, {}, [1, 1], 4,
     ["agua", "cascata", "piscina"]),
    ("academia_curva", "Academia curva", "academia", academia_curva, {}, [2, 1], 2,
     ["academia", "letreiro", "neon", "solar"]),
    ("predio_tetos_lima", "Prédio de tetos verde-limão", "tetos_lima", predio_tetos_lima, {}, [1, 1], 6,
     ["terracos", "teto_verde"]),
    # pequenos
    ("casa_telhado_verde", "Casa com teto-jardim e escotilhas", "casa_teto_jardim", casa_telhado_verde, {},
     [1, 1], 2, ["casa", "teto_verde", "pequeno"]),
    ("predinho_varandas_solar", "Predinho com varandas e telhado solar", "predinho_varandas", predinho_varandas, {},
     [1, 1], 4, ["pequeno", "varandas", "solar"]),
    ("predinho_madeira_floreiras", "Predinho de madeira com floreiras", "predinho_madeira",
     predinho_madeira_floreiras, {}, [1, 1], 3, ["pequeno", "madeira", "floreiras", "pergola"]),
    ("casa_paineis_solares", "Casa com painéis solares", "casa_solar", casa_paineis_solares, {}, [1, 1], 1,
     ["casa", "solar", "horta", "pequeno"]),
    ("cafe_ecologico", "Café com xícara no telhado", "cafe", cafe_ecologico, {}, [1, 1], 1,
     ["loja", "cafe", "letreiro", "pequeno"]),
    ("predio_creme_varandas_verdes", "Prédio creme com varandas verdes", "varandas_verdes", predio_amarelo_varandas,
     {}, [1, 1], 5, ["varandas", "floreiras"]),
    ("casa_madeira_horta", "Casa de madeira com horta no telhado", "casa_horta", casa_madeira_horta, {}, [1, 1], 1,
     ["casa", "horta", "estufa", "pequeno"]),
    ("quitanda_horta", "Quitanda da horta", "quitanda", quitanda_horta, {}, [1, 1], 1,
     ["loja", "horta", "letreiro", "solar", "pequeno"]),
    ("casa_estufa", "Casa com estufa", "casa_estufa", casa_estufa, {}, [1, 1], 2, ["casa", "estufa", "horta",
                                                                                   "pequeno"]),
    ("predinho_redondo_varandas", "Predinho redondo com varandas de madeira", "predinho_redondo",
     predinho_redondo_varandas, {}, [1, 1], 4, ["pequeno", "redondo", "varandas"]),
    ("predinho_jardim_vertical", "Predinho com jardim vertical", "jardim_vertical", predinho_jardim_vertical, {},
     [1, 1], 4, ["pequeno", "fachada_verde"]),
    # variações de cor (mesmo grupo do desenho)
    ("torre_lajes_arredondadas_turquesa", "Torre de lajes arredondadas (turquesa)", "torre_lajes",
     torre_lajes_arredondadas, {"base": "turquesa", "labio": "menta", "planta": "verde_claro", "topo": "verde_medio"},
     [1, 1], 12, ["torre", "floreiras"]),
    ("casa_telhado_verde_madeira", "Casa com teto-jardim e escotilhas (madeira)", "casa_teto_jardim",
     casa_telhado_verde, {"parede": "madeira_clara", "terreo": "branco", "madeira": "madeira_media"}, [1, 1], 2,
     ["casa", "teto_verde", "pequeno"]),
    ("predinho_varandas_solar_menta", "Predinho com varandas e telhado solar (menta)", "predinho_varandas",
     predinho_varandas, {"cor1": "verde_agua", "cor2": "branco", "telhado": "madeira_media", "grade": "branco"},
     [1, 1], 4, ["pequeno", "varandas", "solar"]),
    ("predio_menta_varandas_madeira", "Prédio menta com varandas de madeira", "varandas_verdes",
     predio_amarelo_varandas, {"parede": "menta", "varanda": "madeira_mel", "telhado": "branco",
                               "terreo": "madeira_media"}, [1, 1], 5, ["varandas", "floreiras"]),
]


def gera(saida, sel):
    if not os.path.exists(os.path.join(EST_DIR, "placa_academia.png")):
        subprocess.run(["python3", "-I", os.path.join(AQUI, "predios_ecologicos_estampas.py"), EST_DIR], check=True)
    cat = mb.Catalogo(CAT, saida, rotulo="Prédios ecológicos")
    for id_, rot, grupo, f, kw, lote, andares, tags in PECAS:
        if sel and id_ not in sel:
            continue
        mb.limpa()
        it = mb.Item(id_)
        f(it, **kw)
        lo, hi = mb.bbox([o for o in it.partes if o.type == "MESH"])
        mx, my = lote[0] * cb.Q / 2 - 1.0, lote[1] * cb.Q / 2 - 1.0
        if lo.x < -mx - 1e-3 or hi.x > mx + 1e-3 or lo.y < -my - 1e-3 or hi.y > my + 1e-3 or lo.z < -1e-3:
            print("aviso: fora do lote", id_, [round(v, 2) for v in (lo.x, hi.x, lo.y, hi.y, lo.z)], flush=True)
        if os.environ.get("ECO_DEBUG"):
            cont = {}
            for o in it.partes:
                n = o.name.split(".")[0]
                cont[n] = cont.get(n, 0) + sum(len(p.vertices) - 2 for p in o.data.polygons)
            print("tris por parte", id_, sorted(cont.items(), key=lambda x: -x[1])[:12], flush=True)
        cat.exporta(it, rot, grupo=grupo, tags=["predio", ESTILO] + tags,
                    extra={"lote": lote, "andares": andares, "estilo": ESTILO})
    ids = [p[0] for p in PECAS]
    cat.dados["itens"] = sorted([x for x in cat.dados["itens"] if x["id"] in ids], key=lambda x: ids.index(x["id"])) + \
        [x for x in cat.dados["itens"] if x["id"].endswith("_pacote")]  # as peças de pacote (id terminado em _pacote) vêm de outro gerador e ficam
    cat.salva()


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:]
    gera(args[0], args[1:])
