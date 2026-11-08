"""Arranha-céus do centro da cidade do Morada (categoria arranha_ceus).

Uso:
  cd SP && MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/predios_arranha_ceus.py -- SP/cidade_out [ids...]

Cada torre é feita de "fachadas" (função fachada): anéis horizontais, um por laje e um por andar, ligados em faixas.
Cada andar é uma faixa de vidro contínua cortada em painéis (uma face por aresta do contorno), com o material
sorteado em trechos (janela / janela_fria / janela_apagada), e cada laje é uma faixa saliente na cor da paleta.
O contorno de cada altura vem de uma função contorno(z) -> (pontos, tipos), o que permite torcer, curvar, inchar e
afunilar a torre. tipos[i] = None (vidro) ou o nome de uma cor (moldura, quina, montante) para a aresta i.
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
ANDAR = cb.ANDAR
TERREO = 4.2
CATEGORIA = "arranha_ceus"


# =====================================================================================================================
# Contornos 2D (sempre anti-horários, começando na frente, −Y)
# =====================================================================================================================
def _sg(v):
    return 1.0 if v >= 0 else -1.0


def reamostra(pts, n, inicio=None):
    """Reamostra um contorno fechado em n pontos igualmente espaçados (pelo comprimento). Começa no ponto mais
    próximo da direção 'inicio' (ângulo em graus; padrão −90 = frente)."""
    m = len(pts)
    seg = [math.dist(pts[i], pts[(i + 1) % m]) for i in range(m)]
    tot = sum(seg)
    a0 = math.radians(-90 if inicio is None else inicio)
    k0 = min(range(m), key=lambda i: -(pts[i][0] * math.cos(a0) + pts[i][1] * math.sin(a0)) /
             (math.hypot(*pts[i]) + 1e-9))
    pts = pts[k0:] + pts[:k0]
    seg = seg[k0:] + seg[:k0]
    out = []
    passo = tot / n
    i, acc = 0, 0.0
    for k in range(n):
        alvo = k * passo
        while acc + seg[i] < alvo - 1e-9:
            acc += seg[i]
            i += 1
        t = (alvo - acc) / seg[i] if seg[i] > 0 else 0
        a, b = pts[i], pts[(i + 1) % m]
        out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return out


def superel(a, b, n=2.0, N=40, denso=8):
    """Superelipse |x/a|^n + |y/b|^n = 1 com N pontos igualmente espaçados."""
    M = N * denso
    pts = []
    for i in range(M):
        t = 2 * math.pi * i / M
        c, s = math.cos(t), math.sin(t)
        pts.append((a * _sg(c) * abs(c) ** (2 / n), b * _sg(s) * abs(s) ** (2 / n)))
    return reamostra(pts, N)


def circulo(r, N=40, rx=None, ry=None):
    rx, ry = rx or r, ry or r
    return [(rx * math.cos(-math.pi / 2 + 2 * math.pi * k / N), ry * math.sin(-math.pi / 2 + 2 * math.pi * k / N))
            for k in range(N)]


def lente(a, b, N=40):
    """Lente pontuda nas pontas ±X (vesica): x = a cos t, y = b sin t |sin t|^0.35."""
    M = N * 8
    pts = []
    for i in range(M):
        t = 2 * math.pi * i / M
        s = math.sin(t)
        pts.append((a * math.cos(t), b * s * abs(s) ** 0.35))
    return reamostra(pts, N)


def ret_arr(l, p, r, div_l=4, div_p=4, seg_canto=3, montante=0.0, cor_canto=None, cor_montante="branco"):
    """Retângulo arredondado com os lados divididos em painéis (montantes estreitos entre eles, opcionais).
    Devolve (pontos, tipos): os cantos levam cor_canto (None = vidro) e os montantes cor_montante."""
    r = min(r, l / 2 - 0.05, p / 2 - 0.05)
    pts, tipos = [], []

    def lado(x0, y0, x1, y1, div):
        L = math.dist((x0, y0), (x1, y1))
        dx, dy = (x1 - x0) / L, (y1 - y0) / L
        w = L / div
        for k in range(div):
            u0 = k * w + (montante / 2 if k else 0)
            pts.append((x0 + dx * u0, y0 + dy * u0))
            tipos.append(None)
            if k < div - 1 and montante > 0:
                u1 = (k + 1) * w - montante / 2
                pts.append((x0 + dx * u1, y0 + dy * u1))
                tipos.append(cor_montante)

    def canto(cx, cy, a0):
        for k in range(seg_canto):
            t = math.radians(a0 + 90 * k / seg_canto)
            pts.append((cx + r * math.cos(t), cy + r * math.sin(t)))
            tipos.append(cor_canto)

    hl, hp = l / 2, p / 2
    # começa no meio da frente? começa no canto inferior esquerdo da frente, anti-horário
    lado(-hl + r, -hp, hl - r, -hp, div_l)
    canto(hl - r, -hp + r, 270)
    lado(hl, -hp + r, hl, hp - r, div_p)
    canto(hl - r, hp - r, 0)
    lado(hl - r, hp, -hl + r, hp, div_l)
    canto(-hl + r, hp - r, 90)
    lado(-hl, hp - r, -hl, -hp + r, div_p)
    canto(-hl + r, -hp + r, 180)
    return pts, tipos


def gira(pts, graus, cx=0.0, cy=0.0):
    a = math.radians(graus)
    c, s = math.cos(a), math.sin(a)
    return [(cx + x * c - y * s, cy + x * s + y * c) for x, y in pts]


def move(pts, dx=0.0, dy=0.0, sx=1.0, sy=1.0):
    return [(x * sx + dx, y * sy + dy) for x, y in pts]


def offset(pts, d, lim=2.2):
    """Contorno deslocado d para fora (d < 0 para dentro), com a quina limitada."""
    n = len(pts)
    out = []
    for i in range(n):
        p0, p1, p2 = pts[i - 1], pts[i], pts[(i + 1) % n]
        e1 = (p1[0] - p0[0], p1[1] - p0[1])
        e2 = (p2[0] - p1[0], p2[1] - p1[1])
        l1, l2 = math.hypot(*e1) or 1e-9, math.hypot(*e2) or 1e-9
        n1 = (e1[1] / l1, -e1[0] / l1)
        n2 = (e2[1] / l2, -e2[0] / l2)
        m = (n1[0] + n2[0], n1[1] + n2[1])
        lm = math.hypot(*m)
        if lm < 1e-6:
            m = n1
            lm = 1.0
        m = (m[0] / lm, m[1] / lm)
        c = m[0] * n1[0] + m[1] * n1[1]
        f = min(lim, 1 / max(c, 1e-3))
        out.append((p1[0] + m[0] * d * f, p1[1] + m[1] * d * f))
    return out


def angulo_medio(pts, i):
    a, b = pts[i], pts[(i + 1) % len(pts)]
    return math.degrees(math.atan2((a[1] + b[1]) / 2, (a[0] + b[0]) / 2))


def dist_ang(a, b):
    return abs((a - b + 180) % 360 - 180)


def frente_y(pts, x=0.0):
    """Menor y onde a linha vertical x corta o contorno (a fachada da frente)."""
    ys = []
    n = len(pts)
    for i in range(n):
        a, b = pts[i], pts[(i + 1) % n]
        if (a[0] - x) * (b[0] - x) <= 0 and a[0] != b[0]:
            t = (x - a[0]) / (b[0] - a[0])
            ys.append(a[1] + (b[1] - a[1]) * t)
    return min(ys) if ys else min(p[1] for p in pts)


def suave(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


# =====================================================================================================================
# Malha com material e cor por face
# =====================================================================================================================
def malha(nome, verts, faces, matcor, angulo=40, liso=True):
    """verts [(x,y,z)], faces [índices] (já no sentido anti-horário visto de fora), matcor [(material, cor|None)]."""
    mb.materiais()
    bm = bmesh.new()
    vs = [bm.verts.new(v) for v in verts]
    bm.verts.ensure_lookup_table()
    uvl = bm.loops.layers.uv.new("UVMap")
    ngons = []
    for f, (m, c) in zip(faces, matcor):
        try:
            bf = bm.faces.new([vs[i] for i in f])
        except ValueError:
            continue
        bf.material_index = mb.MAT_NOMES.index(m)
        u = mb.uv_cor(c) if c else (0.5, 0.5)
        for lo in bf.loops:
            lo[uvl].uv = u
        if len(f) > 4:
            ngons.append(bf)
    if ngons:
        bmesh.ops.triangulate(bm, faces=ngons, quad_method="BEAUTY", ngon_method="BEAUTY")
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


def loft(aneis, cor="branco", mat="atlas", tampas=(True, True), fechado=True, nome="loft", angulo=50):
    """Superfície por uma sequência de anéis 3D (mesma contagem de pontos), com tampas nas pontas."""
    bm = bmesh.new()
    vv = [[bm.verts.new(p) for p in an] for an in aneis]
    n = len(aneis[0])
    for a, b in zip(vv, vv[1:]):
        for i in range(n if fechado else n - 1):
            j = (i + 1) % n
            q = [a[i], a[j], b[j], b[i]]
            if len(set(q)) == 4:
                try:
                    bm.faces.new(q)
                except ValueError:
                    pass
    if fechado:
        if tampas[0]:
            bm.faces.new(vv[0][::-1])
        if tampas[1]:
            bm.faces.new(vv[-1])
        ng = [f for f in bm.faces if len(f.verts) > 4]
        if ng:
            bmesh.ops.triangulate(bm, faces=ng, quad_method="BEAUTY", ngon_method="BEAUTY")
    return mb._obj(nome, bm, cor, mat, liso=True, angulo=angulo)


def fita(caminho, larg, esp, cor="branco", mat="atlas", nome="fita", normal_ref=(0, 1, 0)):
    """Fita retangular arredondada (larg na direção normal_ref, esp na direção perpendicular ao caminho) ao longo de
    um caminho 3D: arcos brancos, costelas, montantes curvos."""
    ref = V(normal_ref).normalized()
    aneis = []
    P = [V(p) for p in caminho]
    sec = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
    sec = [(0.5 * larg * a, 0.5 * esp * b) for a, b in
           [(-1, -0.6), (-0.8, -1), (0.8, -1), (1, -0.6), (1, 0.6), (0.8, 1), (-0.8, 1), (-1, 0.6)]]
    for i, p in enumerate(P):
        t = (P[min(i + 1, len(P) - 1)] - P[max(i - 1, 0)]).normalized()
        w = (ref - t * ref.dot(t)).normalized()
        u = t.cross(w).normalized()
        aneis.append([p + w * a + u * b for a, b in sec])
    return loft(aneis, cor=cor, mat=mat, nome=nome)


# =====================================================================================================================
# Fachada de vidro em faixas
# =====================================================================================================================
MATS_VIDRO = ("janela", "janela_fria", "janela_apagada")


def _sorteio(rnd, comps, tipos, apagadas, frias, run_m):
    """Materiais das arestas de um andar: trechos de 'run_m' metros com o mesmo material (faixas e quadradinhos)."""
    def um():
        r = rnd.random()
        return "janela_apagada" if r < apagadas else ("janela_fria" if r < apagadas + frias else "janela")
    n = len(comps)
    out = [None] * n
    if rnd.random() < 0.10:  # andar inteiro com a mesma luz (faixa contínua)
        m = um()
        return [m if tipos[i] is None else None for i in range(n)]
    alvo, acc, m = 0.0, 1e9, None
    for i in range(n):
        if tipos[i] is not None:
            acc = 1e9
            continue
        if acc >= alvo:
            m = um()
            alvo = rnd.choice(run_m)
            acc = 0.0
        out[i] = m
        acc += comps[i]
    return out


def fachada(contorno, niveis, laje=(0.35, 0.15, "branco"), apl=1, laje_base=False, parapeito=(1.0, 0.18, "branco"),
            tampa="concreto", fundo=False, laje_contorno=None, semente=1, apagadas=0.40, frias=0.27,
            run_m=(2.0, 3.0, 4.0, 6.0, 9.0), nome="fachada", angulo=40, cor_vidro_tipo=None):
    """Casca de uma torre.
    contorno(z) -> (pts, tipos) com o mesmo número de pontos em toda altura.
    niveis: alturas dos andares [z0, z1, ..., zn]. Uma laje sai entre os andares (a cada 'apl' andares); laje pode
    ser uma tupla (h, sai, cor) ou uma função laje(k, z) -> tupla ou None.
    laje_contorno(z, pts, k) -> contorno da laje (em vez do deslocamento 'sai').
    parapeito (h, sai, cor) fecha o topo com mureta e laje de cobertura na cor 'tampa'."""
    rnd = random.Random(semente)
    Vs, Fs, MC = [], [], []

    def anel(pts, z):
        i0 = len(Vs)
        Vs.extend((p[0], p[1], z) for p in pts)
        return i0

    def faixa_cor(a, b, n, cor):
        for i in range(n):
            j = (i + 1) % n
            Fs.append((a + i, a + j, b + j, b + i))
            MC.append(("atlas", cor[i] if isinstance(cor, list) else cor))

    def faixa_vidro(a, b, pts, tipos):
        n = len(pts)
        comps = [math.dist(pts[i], pts[(i + 1) % n]) for i in range(n)]
        mats = _sorteio(rnd, comps, tipos, apagadas, frias, run_m)
        for i in range(n):
            j = (i + 1) % n
            Fs.append((a + i, a + j, b + j, b + i))
            MC.append(("atlas", tipos[i]) if tipos[i] is not None else (mats[i], None))

    def laje_k(k, z):
        if callable(laje):
            return laje(k, z)
        if laje is None or k % apl:
            return None
        return laje

    pts0, _ = contorno(niveis[0])
    N = len(pts0)
    prev = anel(pts0, niveis[0])
    if fundo:
        Fs.append(tuple(range(prev + N - 1, prev - 1, -1)))
        MC.append(("atlas", tampa))
    for k in range(len(niveis) - 1):
        zb, zt = niveis[k], niveis[k + 1]
        lj = laje_k(k, zb) if (k > 0 or laje_base) else None
        zg = zb
        if lj:
            h, sai, cor = lj[:3]
            borda = lj[3] if len(lj) > 3 else cor
            pa, _ = contorno(zb)
            _, tl = contorno(zb + h / 2)
            cf = [cor if tl[i] is None else tl[i] for i in range(N)]
            cb_ = [borda if tl[i] is None else tl[i] for i in range(N)]
            pd, _ = contorno(zb + h)
            if laje_contorno:
                pb, pc = laje_contorno(zb, pa, k), laje_contorno(zb + h, pd, k)
            else:
                pb, pc = offset(pa, sai), offset(pd, sai)
            b = anel(pb, zb)
            c = anel(pc, zb + h)
            d = anel(pd, zb + h)
            faixa_cor(prev, b, N, cb_)
            faixa_cor(b, c, N, cf)
            faixa_cor(c, d, N, cb_)
            prev, zg = d, zb + h
        pt, _ = contorno(zt)
        _, tip = contorno((zg + zt) / 2)
        e = anel(pt, zt)
        faixa_vidro(prev, e, pt, tip)
        prev = e
    zt = niveis[-1]
    pt, _ = contorno(zt)
    if parapeito:
        h, sai, cor = parapeito
        b = anel(offset(pt, sai), zt)
        c = anel(offset(pt, sai), zt + h)
        din = offset(pt, -0.28)
        d = anel(din, zt + h)
        e = anel(din, zt + h - 0.45)
        faixa_cor(prev, b, N, cor)
        faixa_cor(b, c, N, cor)
        faixa_cor(c, d, N, cor)
        faixa_cor(d, e, N, cor)
        prev = e
    Fs.append(tuple(range(prev, prev + N)))
    MC.append(("atlas", tampa))
    return malha(nome, Vs, Fs, MC, angulo=angulo)


def niveis_torre(z0, n, terreo=True, hf=ANDAR):
    zs = [z0]
    if terreo:
        zs.append(z0 + TERREO)
        n -= 1
    for _ in range(n):
        zs.append(zs[-1] + hf)
    return zs


# =====================================================================================================================
# Peças de telhado e de térreo
# =====================================================================================================================
def entrada(it, contorno, z=0.0, larg=3.4, alt=3.0, cor="branco", x=0.0, marquise=True, prof=1.6):
    """Porta de entrada (vidro com moldura, lobby aceso à noite) e marquise com luz embaixo, na fachada da frente."""
    pts, _ = contorno(z + 1.2)
    y = frente_y(pts, x)
    yf = y - 0.3  # frente da moldura
    it.add(mb.caixa(larg + 0.6, prof, alt + 0.4, x=x, y=yf + prof / 2, z=z, cor=cor, bisel=0.1))
    it.add(mb.caixa(larg, 0.06, alt, x=x, y=yf - 0.02, z=z, cor=None, mat="janela", bisel=0.02))
    it.add(mb.caixa(0.1, 0.1, alt, x=x, y=yf - 0.04, z=z, cor=cor, bisel=0.03))
    if marquise:
        it.add(mb.caixa(larg + 2.4, 1.6, 0.32, x=x, y=yf + 0.1, z=z + alt + 0.4, cor=cor, bisel=0.14))
        it.add(mb.caixa(larg + 1.8, 0.12, 0.05, x=x, y=yf - 0.55, z=z + alt + 0.36, cor=None, mat="luz", bisel=0.02))


def antena(x, y, z, h, r=0.18, cor="metal_claro", luz=True):
    objs = [mb.cilindro(r * 2.2, 0.6, x=x, y=y, z=z, cor="cinza_medio", seg=10, bisel=0.05),
            mb.cilindro(r, h * 0.55, x=x, y=y, z=z + 0.5, cor=cor, seg=8, bisel=0.02),
            mb.cilindro(r * 0.55, h * 0.45, x=x, y=y, z=z + 0.5 + h * 0.55, cor=cor, seg=8, bisel=0.01)]
    if luz:
        objs.append(mb.esfera(r * 1.4, x=x, y=y, z=z + h + 0.5, cor=None, mat="luz", seg=10))
    return mb.junta(objs, "antena")


def heliponto(x, y, z, r=4.2, base="branco", h=0.5):
    """Plataforma octogonal com o H amarelo, o círculo de pouso e as luzes da borda."""
    objs = [mb.cilindro(r, h, x=x, y=y, z=z, cor=base, seg=8, bisel=0.12),
            mb.cilindro(r * 0.55, 0.9, x=x, y=y, z=z - 0.9, cor="cinza_claro", seg=8, bisel=0.05)]
    zt = z + h
    anel_ = mb.torno([(r * 0.78, zt - 0.02), (r * 0.86, zt - 0.02), (r * 0.86, zt + 0.03), (r * 0.78, zt + 0.03),
                      (r * 0.78, zt - 0.02)], x=x, y=y, cor="amarelo", seg=32)
    objs.append(anel_)
    s = r * 0.42
    objs += [mb.caixa(s * 0.22, s * 1.25, 0.05, x=x - s * 0.36, y=y, z=zt - 0.01, cor="amarelo", bisel=0.01),
             mb.caixa(s * 0.22, s * 1.25, 0.05, x=x + s * 0.36, y=y, z=zt - 0.01, cor="amarelo", bisel=0.01),
             mb.caixa(s * 0.6, s * 0.2, 0.05, x=x, y=y, z=zt - 0.01, cor="amarelo", bisel=0.01)]
    for k in range(8):
        a = math.pi / 8 + k * math.pi / 4
        rr = r * 0.92 * math.cos(math.pi / 8)
        objs.append(mb.esfera(0.16, x=x + rr * math.cos(a), y=y + rr * math.sin(a), z=zt + 0.08, cor=None, mat="luz",
                              seg=8))
    return mb.junta(objs, "heliponto")


def anel_tubo(r, z, rt, cor="branco", mat="atlas", x=0.0, y=0.0, n=36, esc=(1, 1), nome="anel", m=6):
    """Anel (toro) leve: perfil de m lados girado em n passos."""
    perfil = [(r + rt * math.cos(2 * math.pi * k / m), z + rt * math.sin(2 * math.pi * k / m)) for k in range(m)]
    perfil.append(perfil[0])
    return mb.torno(perfil, x=x, y=y, cor=cor if mat == "atlas" else "neon_ciano", seg=n, mat=mat, nome=nome,
                    esc=esc, angulo=70)


def tubo_leve(pontos, r, cor="branco", mat="atlas", m=6, fechado=False, nome="tubo"):
    """Tubo de m lados por uma linha 3D (anéis perpendiculares por transporte paralelo), com tampas se aberto."""
    P = [V(p) for p in pontos]
    n = len(P)
    tang = []
    for i in range(n):
        if fechado:
            t = P[(i + 1) % n] - P[i - 1]
        else:
            t = P[min(i + 1, n - 1)] - P[max(i - 1, 0)]
        tang.append(t.normalized())
    ref = V((0, 0, 1)) if abs(tang[0].z) < 0.9 else V((1, 0, 0))
    u = (ref - tang[0] * ref.dot(tang[0])).normalized()
    bm = bmesh.new()
    aneis = []
    for i in range(n):
        if i:
            u = (u - tang[i] * u.dot(tang[i])).normalized()
        w = tang[i].cross(u)
        aneis.append([bm.verts.new(P[i] + (u * math.cos(2 * math.pi * k / m) + w * math.sin(2 * math.pi * k / m)) * r)
                      for k in range(m)])
    pares = list(zip(aneis, aneis[1:])) + ([(aneis[-1], aneis[0])] if fechado else [])
    for a, b in pares:
        for k in range(m):
            q = [a[k], a[(k + 1) % m], b[(k + 1) % m], b[k]]
            try:
                bm.faces.new(q)
            except ValueError:
                pass
    if not fechado:
        bm.faces.new(aneis[0][::-1])
        bm.faces.new(aneis[-1])
    return mb._obj(nome, bm, cor if mat == "atlas" else "neon_ciano", mat, liso=True, angulo=70)


def tubo_contorno(pts2d, z, rt, cor=None, mat="neon", nome="neon"):
    return tubo_leve([(p[0], p[1], z) for p in pts2d], rt, cor=cor or "neon_ciano", mat=mat, fechado=True, nome=nome)


def casa_maquinas(x, y, z, l, p, a, cor="cinza_claro"):
    return [mb.caixa(l, p, a, x=x, y=y, z=z, cor=cor, bisel=0.15),
            mb.caixa(l * 0.5, p * 0.4, 0.2, x=x, y=y, z=z + a, cor="cinza_medio", bisel=0.05)]


def podio_redondo(it, r, h, cor="branco", n=40, z=0.0, semente=7, vidro=True, esc=(1, 1)):
    """Pódio cilíndrico com faixa de vitrines (vidro aceso à noite) e laje de borda."""
    def ct(zz):
        pts = [(r * esc[0] * math.cos(-math.pi / 2 + 2 * math.pi * k / n),
                r * esc[1] * math.sin(-math.pi / 2 + 2 * math.pi * k / n)) for k in range(n)]
        tip = [None if (vidro and k % 3) else cor for k in range(n)]
        return pts, tip
    it.add(fachada(ct, [z, z + h], laje=None, parapeito=(0.45, 0.25, cor), tampa=cor, semente=semente,
                   apagadas=0.15, frias=0.3, run_m=(30.0,), nome="podio"))


# =====================================================================================================================
# Colisão automática: caixas por faixas de altura
# =====================================================================================================================
def colisao_auto(it, faixas=3):
    pts = []
    for o in it.partes:
        if o.type == "MESH":
            pts += [o.matrix_world @ v.co for v in o.data.vertices]
    zmax = max(p.z for p in pts)
    caixas = []
    z0 = 4.5  # base (pódio, anel, marquise) numa caixa baixa; o corpo em faixas acima
    lim = [0.0] + [z0 + (zmax - z0) * k / faixas for k in range(faixas + 1)]
    for a, b in zip(lim, lim[1:]):
        sel = [p for p in pts if a - 0.01 <= p.z <= b + 0.01]
        if not sel:
            continue
        x0, x1 = min(p.x for p in sel), max(p.x for p in sel)
        y0, y1 = min(p.y for p in sel), max(p.y for p in sel)
        caixas.append((((x0 + x1) / 2, (y0 + y1) / 2, a), (x1 - x0, y1 - y0, b - a)))
    it.colisao(caixas)


# =====================================================================================================================
# As torres
# =====================================================================================================================
def t_gema(it):
    """Torre branca arredondada em forma de gema: vidro na frente e nas costas, moldura branca nos lados."""
    zs = niveis_torre(0.0, 21)
    Ht = zs[-1]

    def forma(z):
        t = z / Ht
        a = 5.4 * (1 + 0.10 * math.sin(2 * math.pi * t * 1.3 + 0.5))
        if t > 0.70:
            a *= math.sqrt(max(0.0, 1 - ((t - 0.70) / 0.34) ** 2))
        b = 3.9 * (0.55 + 0.45 * a / 5.4)
        dx = 0.6 * math.sin(math.pi * t * 1.4)
        pts = move(superel(a, b, 2.5, 48), dx)
        tip = []
        for i in range(48):
            p, q = pts[i], pts[(i + 1) % 48]
            xm = (p[0] + q[0]) / 2 - dx
            tip.append("branco" if abs(xm) > 0.74 * a else None)
        return pts, tip
    it.add(fachada(forma, zs, laje=(0.6, 0.1, "azul_celeste", "branco"), parapeito=(0.8, 0.3, "branco"), tampa="branco",
                   semente=11, nome="gema"))
    pts, _ = forma(Ht)
    lo_x, hi_x = min(p[0] for p in pts), max(p[0] for p in pts)
    lo_y, hi_y = min(p[1] for p in pts), max(p[1] for p in pts)
    it.add(mb.superelipsoide(hi_x - lo_x + 0.4, hi_y - lo_y + 0.4, 2.2, x=(lo_x + hi_x) / 2, y=(lo_y + hi_y) / 2,
                             z=Ht + 0.2, cor="branco", e=0.6, e_v=0.6, nu=24, nv=10))
    # base: soco branco em volta
    it.add(mb.extrudado(offset(forma(0)[0], 0.35), 0.5, cor="branco", bisel=0.12))
    entrada(it, forma, z=0.5, larg=3.6)
    return dict(andares=21, lote=[1, 1], estilo="futurista", rotulo="Torre gema branca", tags=["curva", "branca"])


def t_s(it):
    """Torre branca e azul em S: corpo branco de base alargada e uma faixa de vidro curvo que serpenteia."""
    zs = niveis_torre(0.0, 26)
    Ht = zs[-1]
    N = 44

    def forma(z):
        t = z / Ht
        s = 1 + 0.50 * math.exp(-z / 9.0)
        s *= max(0.22, (1 - t ** 2.6)) ** 0.5
        dx = 1.0 * math.sin(math.pi * t * 0.9)
        pts = move(circulo(1, N, rx=4.1 * s, ry=3.6 * s), dx)
        thc = -90 + 65 * math.sin(1.7 * math.pi * t - 0.4)
        tip = []
        for i in range(N):
            ang = math.degrees(math.atan2(pts[i][1] + pts[(i + 1) % N][1], pts[i][0] + pts[(i + 1) % N][0] - 2 * dx))
            vidro = dist_ang(ang, thc) < 52 or dist_ang(ang, thc + 180) < 34
            tip.append(None if vidro else "branco")
        return pts, tip
    it.add(fachada(forma, zs, laje=(0.55, 0.08, "azul", "azul_bebe"), parapeito=(0.6, 0.25, "branco"), tampa="branco",
                   semente=21, nome="torre_s"))
    pts, _ = forma(Ht)
    cx = sum(p[0] for p in pts) / N
    it.add(mb.superelipsoide(2.0 * 2, 1.7 * 2, 2.6, x=cx, z=Ht + 0.3, cor="branco", e=0.7, e_v=0.7, nu=24, nv=10))
    it.add(antena(cx, 0, Ht + 2.6, 7.0))
    # saia azul-clara na base
    it.add(mb.torno([(0.0, 0.0), (6.4, 0.0), (6.45, 0.3), (6.0, 1.2), (4.6, 2.8), (0.0, 2.8)], cor="azul_bebe",
                    seg=40, esc=(1, 0.9)))
    it.add(anel_tubo(6.25, 0.42, 0.18, cor="branco", esc=(1, 0.9)))
    it.add(anel_tubo(4.75, 2.85, 0.1, mat="neon", esc=(1, 0.9)))
    it.add(tubo_contorno(offset(pts, 0.3), Ht + 0.62, 0.08))
    entrada(it, forma, z=0.0, larg=3.4, alt=3.2)
    return dict(andares=26, lote=[1, 1], estilo="futurista", rotulo="Torre S branca e azul", tags=["curva", "branca"])


def t_torcida(it):
    """Torre quadrada torcida, com quadros brancos a cada 4 andares, montantes e heliponto."""
    zs = niveis_torre(0.0, 32)
    Ht = zs[-1]

    def forma(z):
        t = z / Ht
        pts, tip = ret_arr(8.8, 8.8, 1.3, 4, 4, seg_canto=3, montante=0.32, cor_canto="branco")
        pts = gira(pts, 48 * suave(t))
        pts = move(pts, 0.8 * math.sin(math.pi * t) - 0.4)
        return pts, tip
    it.add(fachada(forma, zs, laje=lambda k, z: (0.8, 0.28, "branco") if k % 4 == 0 else (0.5, 0.05, "azul", "azul_claro"),
                   parapeito=(1.2, 0.3, "branco"), tampa="cinza_claro", semente=31, nome="torcida"))
    cx = -0.4
    it.add(heliponto(cx, 0, Ht + 1.4, r=3.6))
    it.add(tubo_contorno(offset(forma(Ht)[0], 0.34), Ht + 0.95, 0.08))
    it.add(casa_maquinas(cx + 3.1, 0, Ht + 0.7, 1.2, 2.4, 1.4))
    entrada(it, forma, z=0.0)
    return dict(andares=32, lote=[1, 1], estilo="futurista", rotulo="Torre torcida com heliponto",
                tags=["torcida", "heliponto"])


def t_cilindro_vidro(it):
    """Cilindro de vidro de cintura fina e topo redondo de vidro inclinado, sobre pódio redondo."""
    zs = niveis_torre(5.2, 27, terreo=False)
    Ht = zs[-1]

    def r_(z):
        t = (z - 5.2) / (Ht - 5.2)
        return 4.4 - 0.75 * math.sin(math.pi * t) + 0.8 * suave((t - 0.78) / 0.22)

    def forma(z):
        return circulo(r_(z), 40), [None] * 40
    it.add(fachada(forma, zs, laje=(0.6, 0.12, "azul", "azul_claro"), parapeito=(0.6, 0.35, "branco"), tampa="branco",
                   semente=41, nome="cilindro"))
    # cabeça de vidro: esfera achatada em faixas, inclinada para trás
    # cabeça de vidro: disco oval abaulado em faixas, de pé e inclinado para trás (o "espelho" do topo)
    R = 5.85
    nz = [-R * 0.97 + 2 * R * 0.97 * k / 10 for k in range(11)]

    def cabeca(z):
        r = R * math.sqrt(max(0.02, 1 - (z / R) ** 2))
        return circulo(1, 32, rx=r, ry=r * 0.34), [None] * 32
    cab = fachada(cabeca, nz, laje=(0.16, 0.06, "branco"), parapeito=None, tampa="azul_bebe", fundo=True,
                  semente=42, apagadas=0.2, frias=0.55, nome="cabeca")
    mb.transforma(cab, loc=(0, 0.9, Ht + R * 0.8), rot=("X", -24), esc=(1, 1, 0.82))
    it.add(cab)
    aro = anel_tubo(R * 0.995, 0, 0.36, cor="branco", n=40)
    mb.transforma(aro, loc=(0, 0.9, Ht + R * 0.8), rot=[("X", -24), ("X", 90)], esc=(1, 0.82, 1))
    it.add(aro)
    it.add(mb.cilindro(r_(Ht) * 0.9, 2.6, y=0.3, z=Ht + 0.4, cor="branco", seg=24, bisel=0.3, r2=r_(Ht) * 0.55))
    podio_redondo(it, 6.0, 3.0, cor="cinza_claro", semente=43)
    it.add(mb.cilindro(5.4, 2.2, z=3.4, cor="branco", seg=40, bisel=0.2))
    it.add(anel_tubo(6.05, 3.25, 0.2, cor="azul_claro"))
    entrada(it, lambda z: (circulo(6.0, 40), None), z=0.0, larg=3.2, alt=2.4, marquise=False, prof=1.0)
    return dict(andares=29, lote=[1, 1], estilo="futurista", rotulo="Cilindro de vidro com topo redondo",
                tags=["cilindro", "vidro"])


def t_afunilada(it):
    """Cilindro afunilado em degradê (turquesa embaixo, azul em cima) com coroa branca e antenas."""
    zs = niveis_torre(0.0, 33)
    Ht = zs[-1]

    def r_(z):
        t = z / Ht
        return 5.2 - 1.0 * math.sin(math.pi * t * 0.95) + 0.4 * math.exp(-z / 5)

    def forma(z):
        return circulo(r_(z), 40), [None] * 40

    def laje(k, z):
        t = z / Ht
        cor = "turquesa" if t < 0.3 else ("azul_celeste" if t < 0.62 else "azul")
        return (0.6, 0.12, cor, "turquesa_claro" if t < 0.3 else "azul_claro")
    it.add(fachada(forma, zs, laje=laje, parapeito=None, tampa="grafite", semente=51, nome="afunilada"))
    rt = r_(Ht)
    it.add(mb.torno([(rt - 0.4, Ht - 0.2), (rt + 0.45, Ht - 0.2), (rt + 0.7, Ht + 0.6), (rt + 0.7, Ht + 2.6),
                     (rt + 0.4, Ht + 3.1), (rt - 0.5, Ht + 3.1), (rt - 0.5, Ht - 0.2)], cor="branco", seg=40))
    it.add(mb.cilindro(rt - 0.4, 1.6, z=Ht, cor="grafite", seg=32, bisel=0.05))
    it.add(antena(-1.2, 0.8, Ht + 1.6, 11.0, r=0.22))
    it.add(antena(1.6, -0.6, Ht + 1.6, 7.5, r=0.18))
    it.add(casa_maquinas(0.6, 1.8, Ht + 1.6, 2.4, 1.6, 1.2))
    it.add(anel_tubo(rt + 0.72, Ht + 1.6, 0.08, mat="neon"))
    # base
    it.add(mb.torno([(0, 0), (6.3, 0), (6.4, 0.25), (6.1, 0.6), (0, 0.6)], cor="branco", seg=40))
    it.add(anel_tubo(5.95, 1.3, 0.16, cor="branco"))
    entrada(it, forma, z=0.6, larg=3.2)
    return dict(andares=33, lote=[1, 1], estilo="futurista", rotulo="Torre afunilada com coroa e antenas",
                tags=["cilindro", "antena"])


def t_cintura(it):
    """Torre facetada (10 lados) de cintura fina, coroa em camadas e agulha."""
    zs = niveis_torre(0.0, 38)
    Ht = zs[-1]
    N = 30

    def r_(z):
        t = z / Ht
        return 5.6 - 1.5 * math.sin(math.pi * min(1, t * 1.1)) ** 1.2 + 0.4 * t

    def forma(z):
        base = mb.poligono(10, 1.0, rot=-math.pi / 2 + math.pi / 10)
        pts = []
        for i in range(10):
            a, b = base[i], base[(i + 1) % 10]
            for k in range(3):
                u = k / 3
                pts.append((a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u))
        pts = gira(pts, 8 * math.sin(math.pi * z / Ht))
        r = r_(z)
        return [(x * r, y * r) for x, y in pts], [None] * N
    it.add(fachada(forma, zs, laje=(0.6, 0.08, "azul_medio", "azul_claro"), parapeito=(0.9, 0.3, "branco"), tampa="cinza_claro",
                   semente=61, nome="cintura", angulo=20))
    rt = r_(Ht)
    z = Ht + 0.9
    objs = [mb.cilindro(rt * 0.7, 2.0, z=z - 0.45, cor="cinza_claro", seg=10, bisel=0.1),
            mb.cilindro(0.55, 16, z=z, cor="metal_claro", seg=12, bisel=0.05)]
    for k, (rr, dz) in enumerate(((3.4, 2.6), (2.7, 5.4), (2.0, 8.0), (1.3, 10.4))):
        objs.append(mb.cilindro(rr, 0.42, z=z + dz, cor="branco" if k % 2 == 0 else "metal_claro", seg=20,
                                bisel=0.12))
        for j in range(8):
            a = 2 * math.pi * j / 8
            objs.append(mb.cilindro(0.09, 2.6 if k < 3 else 2.4, x=rr * 0.86 * math.cos(a), y=rr * 0.86 * math.sin(a),
                                    z=z + dz - (2.6 if k else 2.6 - 0.0), cor="metal", seg=6, bisel=0.0))
    objs.append(mb.cilindro(0.32, 14, z=z + 16, cor="metal_claro", seg=10, bisel=0.02, r2=0.05))
    objs.append(mb.esfera(0.34, z=z + 30.2, cor=None, mat="luz", seg=10))
    it.add(objs)
    for rr, dz in ((3.42, 2.8), (2.02, 8.2)):
        it.add(anel_tubo(rr, z + dz, 0.07, mat="neon"))
    it.add(anel_tubo(rt + 0.3, Ht + 0.5, 0.1, mat="neon"))
    entrada(it, forma, z=0.0, larg=3.2)
    return dict(andares=38, lote=[1, 1], estilo="futurista", rotulo="Torre de cintura fina com coroa e agulha",
                tags=["facetada", "agulha"])


def t_escalonada(it):
    """Torre alta escalonada e curva: 7 blocos de 6 andares que recuam, se deslocam numa curva e têm recortes nos
    cantos; quadro branco grosso em cada degrau e heliponto redondo no alto."""
    nseg, por = 7, 6
    z = 0.0
    k_and = 0
    topo = None
    for s in range(nseg):
        n = por + (1 if s == 0 else 0)
        zs = niveis_torre(z, n, terreo=(s == 0))
        H1 = zs[-1]
        l = 10.4 - 0.6 * s
        p = 9.6 - 0.45 * s
        dx = 3.1 * math.sin(math.pi * (s + 0.5) / nseg) - 1.55
        dy = 0.3 * s - 0.6

        def forma(zz, l=l, p=p, dx=dx, dy=dy, s=s, z0=z, H1=H1):
            pts, tip = ret_arr(l, p, 1.8, 5, 4, seg_canto=3, montante=0.0, cor_canto=None)
            # recorte: o canto de trás-direita (ou trás-esquerda, alternando) entra 1,6 m
            sx = 1 if s % 2 == 0 else -1
            sy = -1 if s % 3 else 1
            out = []
            for (x, y) in pts:
                if x * sx > l / 2 - 2.6 and y * sy > p / 2 - 2.6:
                    x -= sx * 1.4
                    y -= sy * 1.1
                out.append((x, y))
            # a fachada se inclina dentro do bloco (curva)
            u = (zz - z0) / (H1 - z0)
            return move(out, dx + 0.5 * (u - 0.5) * math.cos(math.pi * (s + 0.5) / nseg), dy), tip
        it.add(fachada(forma, zs, laje=(0.55, 0.07, "azul", "azul_claro"),
                       parapeito=(1.0, 0.35, "branco"), tampa="cinza_claro", semente=71 + s, nome=f"bloco_{s}"))
        if s == 0:
            entrada(it, forma, z=0.0)
        k_and += n
        z = H1 + 0.55
        topo = (forma, H1)
    forma, H1 = topo
    pts, _ = forma(H1)
    cx = sum(q[0] for q in pts) / len(pts)
    cy = sum(q[1] for q in pts) / len(pts)
    it.add(mb.cilindro(3.0, 3.2, x=cx, y=cy, z=H1 + 0.5, cor="cinza_claro", seg=24, bisel=0.15))
    aro = anel_tubo(4.6, 0, 0.45, cor="branco")
    mb.transforma(aro, loc=(cx, cy, H1 + 5.0), rot=("X", 14))
    it.add(aro)
    it.add(heliponto(cx, cy, H1 + 3.7, r=4.4))
    return dict(andares=k_and, lote=[1, 1], estilo="futurista", rotulo="Torre escalonada e curva com recortes",
                tags=["escalonada", "heliponto"])


def t_lanca(it):
    """Torre-lança de vidro turquesa com duas costelas laranja que viram pontas, sobre o anel laranja da base."""
    zs = niveis_torre(2.0, 36)
    Ht = zs[-1]
    Ha = Ht + 6

    def ab(z):
        t = (z - 2.0) / (Ha - 2.0)
        f = max(0.10, (1 - t ** 1.5)) ** 0.8 * (0.86 + 0.14 * math.sin(math.pi * min(1.0, t * 1.6)))
        return 7.4 * f, 3.8 * (0.42 + 0.58 * f)

    def forma(z):
        a, b = ab(z)
        return lente(a, b, 36), [None] * 36
    it.add(fachada(forma, zs, laje=(0.6, 0.1, "turquesa_escuro", "turquesa_claro"), parapeito=(0.5, 0.2, "turquesa_claro"),
                   tampa="turquesa_claro", semente=81, nome="lanca"))
    # costelas
    for sx in (-1, 1):
        cam = []
        for k in range(26):
            zz = 2.0 + (Ht - 2.0) * k / 25
            a, _ = ab(zz)
            cam.append((sx * (a + 0.55), 0, zz))
        a, _ = ab(Ht)
        cam += [(sx * (a + 0.35), 0, Ht + 6), (sx * (a - 0.2), 0, Ht + 14), (sx * (a - 0.7), 0, Ht + 20)]
        it.add(fita(cam, 1.3, 0.9, cor="laranja", normal_ref=(0, 1, 0), nome="costela"))
    # anel da base e plataforma
    it.add(mb.torno([(0, 0), (13.4, 0), (13.6, 0.3), (13.2, 0.9), (0, 0.9)], cor="turquesa_escuro", seg=48))
    it.add(mb.torno([(0, 0.9), (11.6, 0.9), (11.7, 1.3), (0, 1.5)], cor="turquesa", seg=48))
    it.add(anel_tubo(10.6, 2.4, 1.5, cor="laranja"))
    it.add(anel_tubo(12.2, 1.0, 0.12, mat="neon"))
    for k in range(6):
        a = math.radians(30 + 60 * k)
        x0, y0 = 10.6 * math.cos(a), 10.6 * math.sin(a)
        pa, pb = ab(6.0)
        x1, y1 = pa * 0.9 * math.cos(a), pb * 0.9 * math.sin(a)
        it.add(tubo_leve(mb._arredonda_cantos([(x0, y0, 3.2), ((x0 + x1) / 2, (y0 + y1) / 2, 4.6), (x1, y1, 8.0)],
                                              2.0), 0.45, cor="laranja", m=8))
    entrada(it, forma, z=2.0, larg=3.6)
    it.add(mb.caixa(5.2, 8.5, 0.6, y=-8.5, z=0.0, cor="turquesa", bisel=0.2))
    return dict(andares=36, lote=[2, 2], estilo="futurista", rotulo="Torre-lança de costelas laranja",
                tags=["lanca", "anel"])


def t_topo_alargado(it):
    """Torre de topo alargado: o corpo afina para cima e abre num copo azul, separado por uma faixa branca."""
    zs = niveis_torre(5.6, 30, terreo=False)
    Ht = zs[-1]
    zb = 5.6 + (Ht - 5.6) * 0.76

    def s_(z):
        t = (z - 5.6) / (Ht - 5.6)
        if t < 0.76:
            return 0.92 - 0.06 * math.sin(math.pi * t / 0.76)
        u = (t - 0.76) / 0.24
        return 0.92 + 0.30 * (1 - (1 - u) ** 2)

    def forma(z):
        s = s_(z)
        return superel(4.9 * s, 4.3 * s, 3.0, 44), [None] * 44

    def laje(k, z):
        if abs(z - zs[min(range(len(zs)), key=lambda i: abs(zs[i] - zb))]) < 0.01:
            return (1.2, 0.45, "branco")
        return (0.6, 0.1, "azul_acinzentado", "azul_bebe") if z > zb else (0.55, 0.1, "azul", "azul_claro")
    it.add(fachada(forma, zs, laje=laje, parapeito=(0.8, 0.25, "azul_acinzentado"), tampa="cinza_claro",
                   semente=91, nome="topo_alargado"))
    zfx = zs[min(range(len(zs)), key=lambda i: abs(zs[i] - zb))]
    it.add(tubo_contorno(offset(forma(zfx + 0.6)[0], 0.5), zfx + 0.6, 0.09))
    podio_redondo(it, 6.0, 3.0, cor="branco", semente=92)
    it.add(fachada(lambda z: (circulo(5.5, 40), [None if k % 4 else "branco" for k in range(40)]), [3.4, 5.6],
                   laje=None, parapeito=None, tampa="branco", semente=93, apagadas=0.2, nome="podio2"))
    it.add(mb.cilindro(5.7, 0.4, z=5.4, cor="branco", seg=40, bisel=0.15))
    it.add(casa_maquinas(0, 1.0, Ht + 0.4, 3.0, 2.2, 1.6))
    it.add(antena(2.2, -1.4, Ht + 0.4, 5.0))
    entrada(it, lambda z: (circulo(6.0, 40), None), z=0.0, larg=3.2, alt=2.5, marquise=False, prof=1.0)
    return dict(andares=31, lote=[1, 1], estilo="futurista", rotulo="Torre de topo alargado com faixa branca",
                tags=["copo", "faixa_branca"])


def t_prisma(it):
    """Prisma de vidro inclinado: a planta encolhe e corre para trás e para a direita conforme sobe."""
    zs = niveis_torre(0.0, 37)
    Ht = zs[-1]

    def forma(z):
        t = z / Ht
        l = 11.4 - 4.2 * t
        p = 11.0 - 3.6 * t
        pts, tip = ret_arr(l, p, 0.7, 6, 6, seg_canto=2, cor_canto="azul")
        return move(pts, -0.6 + 2.2 * t, 0.1 + 1.6 * t), tip
    it.add(fachada(forma, zs, laje=lambda k, z: (0.55, 0.06, "azul_medio", "azul_claro") if k % 6 else (0.8, 0.16, "azul", "branco"),
                   parapeito=(1.4, 0.18, "azul"), tampa="cinza_claro", semente=101, nome="prisma", angulo=30))
    cx, cy = -0.6 + 2.2, 0.1 + 1.6
    # coroa em cunha: telhado de vidro inclinado que sobe para trás (acende à noite)
    l, p = 11.4 - 4.2, 11.0 - 3.6
    z0, z1 = Ht + 1.4, Ht + 9.0
    x0, x1, y0, y1 = cx - l / 2 + 0.3, cx + l / 2 - 0.3, cy - p / 2 + 0.3, cy + p / 2 - 0.3
    vs = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y1, z1), (x1, y1, z1)]
    fs = [(0, 1, 5, 4), (1, 2, 5), (3, 0, 4), (2, 3, 4, 5)]
    it.add(malha("cunha", vs, fs, [("janela_fria", None), ("atlas", "azul"), ("atlas", "azul"), ("atlas", "azul")],
                 liso=False))
    for k in range(1, 4):  # caixilhos do telhado
        u = k / 4
        it.add(mb.caixa(l - 0.5, 0.25, 0.25, x=cx, y=y0 + (y1 - y0) * u, z=z0 + (z1 - z0) * u - 0.1, cor="branco",
                        bisel=0.06))
    it.add(antena(x0 + 0.8, y1 - 0.6, z1, 9.0))
    it.add(antena(x1 - 0.8, y1 - 0.6, z1, 6.0))
    entrada(it, forma, z=0.0, larg=3.6)
    return dict(andares=37, lote=[1, 1], estilo="regular", rotulo="Prisma de vidro inclinado", tags=["prisma"])


def t_ovo(it):
    """Torre em forma de ovo alongado com lajes salientes (anéis) e uma espinha branca que sobe além do topo."""
    zs = niveis_torre(0.0, 32)
    Ht = zs[-1]

    def r_(z):
        t = z / Ht
        return 5.85 * math.sin(math.pi * (0.10 + 0.84 * t)) ** 0.55 * (1 + 0.12 * (0.5 - t))

    def forma(z):
        return circulo(r_(z), 40), [None] * 40
    it.add(fachada(forma, zs, laje=(0.5, 0.45, "azul_medio", "azul"), parapeito=(0.6, 0.4, "azul_medio"), tampa="cinza_claro",
                   semente=111, nome="ovo"))
    # espinha branca na diagonal de trás
    ang = math.radians(-28)
    u = V((math.cos(ang), math.sin(ang), 0))
    w = V((-math.sin(ang), math.cos(ang), 0))
    aneis = []
    nz = 30
    for k in range(nz + 1):
        zz = Ht * 1.08 * k / nz
        rr = r_(min(zz, Ht)) if zz <= Ht else r_(Ht) - (zz - Ht) * 0.25
        lg = 1.25 if zz <= Ht else 1.25 * max(0.35, 1 - (zz - Ht) / (Ht * 0.08) * 0.7)
        c = u * (rr + 0.2)
        sec = [(-1, -0.4), (-0.6, 1), (0.6, 1), (1, -0.4)]
        aneis.append([V((c.x, c.y, zz)) + w * (a * lg) + u * (b * 1.0 - 0.8) for a, b in sec])
    it.add(loft(aneis, cor="branco", nome="espinha", angulo=60))
    it.add(antena(-0.6, -0.4, Ht + 0.6, 6.0))
    it.add(anel_tubo(r_(Ht) + 0.42, Ht + 0.35, 0.09, mat="neon"))
    it.add(mb.torno([(0, 0), (5.6, 0), (5.7, 0.3), (5.4, 0.5), (0, 0.5)], cor="branco", seg=40))
    entrada(it, forma, z=0.5, larg=3.0)
    return dict(andares=32, lote=[1, 1], estilo="futurista", rotulo="Torre ovo com espinha branca",
                tags=["ovo", "aneis"])


def t_blocos(it):
    """Torre de blocos desencontrados: quatro cubos de vidro em grade, cada um girado e deslocado."""
    blocos = [(0.0, 0.0, 0.0), (0.7, -0.5, 5.0), (-0.6, 0.5, -4.0), (0.4, 0.4, 6.0)]
    z = 0.0
    k_and = 0
    for s, (dx, dy, rot) in enumerate(blocos):
        n = 7 + (1 if s == 0 else 0)
        zs = niveis_torre(z, n, terreo=(s == 0))
        lado = 10.4 - 0.4 * s

        def forma(zz, dx=dx, dy=dy, rot=rot, lado=lado):
            pts, tip = ret_arr(lado, lado, 0.6, 6, 6, seg_canto=2, montante=0.25, cor_canto="azul_medio",
                               cor_montante="azul_claro")
            return move(gira(pts, rot), dx, dy), tip
        it.add(fachada(forma, zs, laje=(0.5, 0.06, "azul", "azul_claro"), parapeito=(0.7, 0.18, "azul_medio"),
                       tampa="cinza_claro", semente=121 + s, run_m=(1.5, 2.0, 2.0, 3.0), nome=f"bloco_{s}"))
        if s == 0:
            entrada(it, forma, z=0.0)
        k_and += n
        z = zs[-1] + 0.7
        if s < 3:
            nx, ny, nr = blocos[s + 1]
            junta_ = move(gira(ret_arr(lado - 2.4, lado - 2.4, 0.4, 1, 1, 2)[0], (rot + nr) / 2), (dx + nx) / 2,
                          (dy + ny) / 2)
            it.add(mb.extrudado(junta_, 0.9, z=z - 0.4, cor="grafite", bisel=0.05))
            it.add(tubo_contorno(offset(junta_, 0.02), z - 0.15, 0.07))
    it.add(casa_maquinas(0.4, 0.4, z, 3.6, 3.0, 1.8))
    return dict(andares=k_and, lote=[1, 1], estilo="regular", rotulo="Torre de blocos desencontrados",
                tags=["blocos", "grade"])


def t_arcos(it):
    """Par de torres de arcos brancos: corpos de vidro em ogiva emoldurados por arcos brancos com neon."""
    def corpo(cx, H, a0, b0, sem):
        zs = niveis_torre(3.6, int((H - 3.6) / ANDAR), terreo=False)
        Ht = zs[-1]

        def s_(z):
            t = max(0.0, (z - 3.6) / (H - 3.6))
            return max(0.2, 1 - t ** 2.4) ** 0.55

        def forma(z):
            s = s_(z)
            pts = move(circulo(1, 30, rx=a0 * s, ry=b0 * (0.55 + 0.45 * s)), cx)
            tip = []
            for i in range(30):
                xm = (pts[i][0] + pts[(i + 1) % 30][0]) / 2 - cx
                tip.append("branco" if abs(xm) > 0.78 * a0 * s else None)
            return pts, tip
        it.add(fachada(forma, zs, laje=(0.55, 0.08, "roxo", "lilas"), parapeito=(0.6, 0.2, "branco"), tampa="branco",
                       semente=sem, nome="arco_corpo"))
        pts, _ = forma(Ht)
        it.add(mb.superelipsoide(max(p[0] for p in pts) - min(p[0] for p in pts) + 0.5,
                                 max(p[1] for p in pts) - min(p[1] for p in pts) + 0.5, 1.6, x=cx, z=Ht + 0.3,
                                 cor="branco", e=0.6, e_v=0.6, nu=24, nv=10))
        # arco branco: fita pela silhueta (plano XZ), passando por cima
        cam = []
        n = 18
        for k in range(n + 1):
            zz = 3.0 + (Ht - 3.0) * k / n
            cam.append((cx - (a0 * s_(zz) + 0.9), 0, zz))
        xt = a0 * s_(Ht) + 0.9
        for k in range(1, 8):  # topo em arco
            ang = math.pi - math.pi * k / 8
            cam.append((cx + xt * math.cos(ang), 0, Ht + 3.4 * math.sin(ang)))
        for k in range(n, -1, -1):
            zz = 3.0 + (Ht - 3.0) * k / n
            cam.append((cx + (a0 * s_(zz) + 0.9), 0, zz))
        cam2 = [V(p) for p in cam]
        it.add(fita([tuple(p) for p in cam2], b0 * 1.15, 1.2, cor="branco", nome="arco"))
        # neon na borda da frente do arco
        neon = [(p[0], -b0 * 0.58 - 0.02, p[2]) for p in cam2]
        it.add(tubo_leve(neon, 0.1, mat="neon", nome="neon_arco"))
        return Ht
    corpo(-6.6, 80.0, 5.2, 4.2, 131)
    corpo(6.8, 62.0, 4.6, 3.8, 132)
    # pódio comum
    it.add(mb.extrudado(mb.ret_arredondado(27.6, 11.6, 3.0), 3.6, cor="branco", bisel=0.25))
    ptsf = [(x, -5.85) for x in (-11, -8, -5, -2, 2, 5, 8, 11)]
    for x, y in ptsf:
        it.add(mb.caixa(2.4, 0.08, 2.4, x=x, y=y - 0.02, z=0.6, cor=None, mat="janela", bisel=0.02))
    it.add(mb.caixa(24.0, 0.1, 0.12, y=-5.9, z=3.2, cor=None, mat="neon", bisel=0.03))
    return dict(andares=24, lote=[2, 1], estilo="futurista", rotulo="Par de torres de arcos brancos",
                tags=["arcos", "par", "neon"])


def _raio_elipse(theta, a, b, cx, cy, phi):
    """Distância da origem até a elipse (centro c, semi-eixos a, b, girada phi) na direção theta."""
    c, s = math.cos(phi), math.sin(phi)
    dx, dy = math.cos(theta), math.sin(theta)
    # coordenadas locais da elipse
    ux, uy = dx * c + dy * s, -dx * s + dy * c
    ox, oy = -cx * c - cy * s, cx * s - cy * c
    A = (ux / a) ** 2 + (uy / b) ** 2
    B = 2 * (ox * ux / a ** 2 + oy * uy / b ** 2)
    C = (ox / a) ** 2 + (oy / b) ** 2 - 1
    d = B * B - 4 * A * C
    return (-B + math.sqrt(max(0.0, d))) / (2 * A)


def t_espiral(it):
    """Torre espiral: núcleo de vidro redondo e varandas brancas ovais que giram andar a andar."""
    zs = niveis_torre(0.0, 38)
    Ht = zs[-1]
    N = 36

    def forma(z):
        return circulo(3.8, N), [None] * N

    def laje_ct(z, pts, k):
        phi = math.radians(13 * k)
        out = []
        for x, y in pts:
            th = math.atan2(y, x)
            r = _raio_elipse(th, 5.9, 4.45, 0.5 * math.cos(phi), 0.5 * math.sin(phi), phi)
            out.append((r * math.cos(th), r * math.sin(th)))
        return out
    it.add(fachada(forma, zs, laje=(0.42, 0.0, "branco"), laje_contorno=laje_ct, parapeito=(0.6, 0.3, "branco"),
                   tampa="cinza_claro", semente=141, nome="espiral"))
    it.add(mb.cilindro(2.6, 2.0, z=Ht + 0.2, cor="branco", seg=24, bisel=0.3))
    it.add(antena(0, 0, Ht + 2.2, 9.0, r=0.22))
    it.add(mb.torno([(0, 0), (6.3, 0), (6.4, 0.3), (6.1, 0.5), (0, 0.5)], cor="cinza_claro", seg=40))
    entrada(it, forma, z=0.5, larg=3.0)
    return dict(andares=38, lote=[1, 1], estilo="futurista", rotulo="Torre espiral de varandas brancas",
                tags=["espiral", "varandas"])


def t_trevo(it):
    """Torre trevo: planta de três lóbulos que torce ao subir e termina em três tubos de alturas diferentes."""
    zs = niveis_torre(0.0, 31)
    Ht = zs[-1]
    N = 40
    tw = 40.0

    def forma(z):
        t = z / Ht
        rot = math.radians(tw * t)
        pts = []
        for k in range(N):
            th = -math.pi / 2 + 2 * math.pi * k / N
            r = 5.0 * (1 + 0.24 * math.cos(3 * (th - rot) + math.pi / 2))
            pts.append((r * math.cos(th), r * math.sin(th)))
        return pts, [None] * N
    it.add(fachada(forma, zs, laje=(0.55, 0.1, "azul_celeste", "branco"), parapeito=(0.6, 0.2, "branco"), tampa="cinza_claro",
                   semente=151, nome="trevo"))
    rot = math.radians(tw)
    for j, extra in enumerate((7 * ANDAR, 4 * ANDAR, 2 * ANDAR)):
        th = -math.pi / 2 + rot / 1 + 2 * math.pi * j / 3 + math.pi / 3 * 0
        # centro do lóbulo: onde cos(3(th - rot) + pi/2) = 1 -> th = rot - pi/6 + 2pi j/3
        th = rot - math.pi / 6 + 2 * math.pi * j / 3
        cx, cy = 3.6 * math.cos(th), 3.6 * math.sin(th)
        n = int(round(extra / ANDAR))
        zl = niveis_torre(Ht + 0.6, n, terreo=False)
        it.add(fachada(lambda z, cx=cx, cy=cy: (move(circulo(2.6, 20), cx, cy), [None] * 20), zl,
                       laje=(0.26, 0.12, "azul_claro"), parapeito=(0.5, 0.2, "branco"), tampa="branco",
                       semente=152 + j, nome="lobulo"))
        it.add(anel_tubo(2.8, zl[-1] + 0.5, 0.09, mat="neon", x=cx, y=cy, n=24))
        if j == 0:
            it.add(antena(cx, cy, zl[-1] + 0.1, 8.0))
    entrada(it, forma, z=0.0, larg=3.2)
    return dict(andares=38, lote=[1, 1], estilo="futurista", rotulo="Torre trevo de três tubos",
                tags=["trevo", "torcida"])


def t_deco(it):
    """Torre art déco de recuos: quatro estágios com pilastras brancas, anéis de neon em cada recuo e agulha."""
    estagios = [(10.8, 15), (8.8, 9), (6.8, 6), (4.8, 3)]
    z = 0.0
    k_and = 0
    for s, (lado, n) in enumerate(estagios):
        zs = niveis_torre(z, n + (1 if s == 0 else 0), terreo=(s == 0))

        def forma(zz, lado=lado):
            return ret_arr(lado, lado, 1.0, 5 if lado > 8 else 3, 5 if lado > 8 else 3, seg_canto=3, montante=0.7,
                           cor_canto="azul_medio", cor_montante="branco")
        it.add(fachada(forma, zs, laje=(0.4, 0.1, "branco"), apl=3, parapeito=(0.9, 0.3, "branco"),
                       tampa="lilas_claro", semente=161 + s, nome=f"estagio_{s}"))
        pts, _ = forma(zs[-1])
        it.add(tubo_contorno(offset(pts, 0.42), zs[-1] + 0.95, 0.09))
        if s == 0:
            entrada(it, forma, z=0.0, larg=4.0, alt=3.3)
        k_and += n + (1 if s == 0 else 0)
        z = zs[-1] + 0.45
    # lanterna e agulha
    it.add(fachada(lambda zz: (circulo(1.8, 16), [None] * 16), [z, z + 3.2], laje=None, parapeito=(0.4, 0.2, "branco"),
                   tampa="branco", semente=169, apagadas=0.0, frias=0.6, nome="lanterna"))
    it.add(mb.cilindro(1.3, 1.2, z=z + 3.6, cor="branco", seg=16, bisel=0.2))
    it.add(mb.cilindro(0.6, 13.0, z=z + 4.8, cor="metal_claro", seg=10, r2=0.06, bisel=0.02))
    it.add(mb.esfera(0.3, z=z + 17.9, cor=None, mat="luz", seg=10))
    return dict(andares=k_and, lote=[1, 1], estilo="futurista", rotulo="Torre art déco com neon",
                tags=["recuos", "neon", "agulha"])


TORRES = [
    ("arranha_ceu_gema_branca", t_gema),
    ("arranha_ceu_s_branca_azul", t_s),
    ("arranha_ceu_torcida_heliponto", t_torcida),
    ("arranha_ceu_cilindro_topo_vidro", t_cilindro_vidro),
    ("arranha_ceu_afunilada_coroa", t_afunilada),
    ("arranha_ceu_cintura_agulha", t_cintura),
    ("arranha_ceu_escalonada_curva", t_escalonada),
    ("arranha_ceu_lanca_costelas", t_lanca),
    ("arranha_ceu_topo_alargado", t_topo_alargado),
    ("arranha_ceu_prisma_inclinado", t_prisma),
    ("arranha_ceu_ovo_espinha", t_ovo),
    ("arranha_ceu_blocos", t_blocos),
    ("arranha_ceu_arcos_brancos", t_arcos),
    ("arranha_ceu_espiral_varandas", t_espiral),
    ("arranha_ceu_trevo", t_trevo),
    ("arranha_ceu_art_deco_neon", t_deco),
]


def main():
    a = sys.argv[sys.argv.index("--") + 1:]
    saida = a[0]
    ids = set(a[1:])
    cat = mb.Catalogo(CATEGORIA, saida, rotulo="Arranha-céus")
    for id_, f in TORRES:
        if ids and id_ not in ids:
            continue
        mb.limpa()
        it = mb.Item(id_)
        info = f(it)
        if os.environ.get("TRIS"):
            from collections import Counter
            c = Counter()
            for o in it.partes:
                c[o.name.split(".")[0]] += sum(len(p.vertices) - 2 for p in o.data.polygons)
            print("TRIS", id_, c.most_common(8), flush=True)
        colisao_auto(it, 3 if info["lote"] == [1, 1] else 4)
        lo, hi = mb.bbox([o for o in it.partes if o.type == "MESH"])
        lim = [q * 15 / 2 - 1.0 for q in info["lote"]]
        if max(-lo.x, hi.x) > lim[0] + 0.01 or max(-lo.y, hi.y) > lim[1] + 0.01:
            print("LOTE EXCEDIDO", id_, [round(v, 2) for v in (lo.x, hi.x, lo.y, hi.y)], lim, flush=True)
        grupo = id_.replace("arranha_ceu_", "")
        cat.exporta(it, info["rotulo"], grupo=grupo, tags=["arranha_ceu", "predio"] + info["tags"],
                    extra={"lote": info["lote"], "andares": info["andares"], "estilo": info["estilo"]})
    cat.salva()


if __name__ == "__main__":
    main()
