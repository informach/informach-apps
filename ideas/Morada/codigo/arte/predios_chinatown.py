"""Biblioteca de cidade do Morada: prédios de estilo Chinatown (categoria predios_chinatown).

Uso (ver GUIA_PREDIOS.md e GUIA_CIDADE.md):
  MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/predios_chinatown.py -- SP/cidade_out [ids...]
Sem ids gera a categoria inteira; com ids, só essas peças (as outras ficam no catálogo como estavam).

Convenções dos prédios: lote de 15 × 15 m (projeção de até 13 × 13 m; 2 × 1 quadras até 28 × 13 m), origem no centro
da projeção, base em z = 0 (nível da calçada), frente para −Y. Andar de 3,2 m (cb.ANDAR), térreo comercial de 4,2 m.
Janelas com os materiais janela / janela_fria / janela_apagada (≈ 40 % apagadas); lanternas e faixas luminosas com o
material luz; letreiros com estampa própria (predios_chinatown_estampas.py, desenhadas com PIL em python3 -I).

O que é próprio daqui:
- telhado(): o telhado curvo chinês. É uma varredura de anéis do beiral até o topo: o contorno do beiral (polígono
  qualquer: retângulo, hexágono, octógono) vai se fechando até o contorno do topo (cumeeira, ponta ou o andar de cima),
  a altura sobe em curva côncava (z = h · s^γ) e as pontas do beiral sobem e se abrem para fora (o "beiral virado").
  Fecha com testeira (borda grossa) e forro por baixo. As telhas são listras alternadas de duas cores ao longo da água,
  e as arestas (espigões) ganham um rolo com a ponta enrolada para cima.
- janelas leves (moldura + vidro, com treliça opcional), lanternas, letreiros, colunas, guarda-corpos.
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
AQUI = os.path.dirname(os.path.abspath(__file__))
ANDAR = cb.ANDAR
TERREO = 4.2
ESTILO = "chinatown"
CAT = "predios_chinatown"
_EST_DIR = None  # pasta das estampas (definida no main)


# =====================================================================================================================
# Primitivas pequenas
# =====================================================================================================================
def bx(l, p, a, x=0.0, y=0.0, z=0.0, cor="branco", b=0.05, seg=2, mat="atlas", nome="caixa"):
    """Caixa boleada (seg 2: leve, mas sem quina viva)."""
    return mb.caixa(l, p, a, x=x, y=y, z=z, cor=cor, bisel=b, seg=seg, mat=mat, nome=nome)


def bx0(l, p, a, x=0.0, y=0.0, z=0.0, cor="branco", mat="atlas", nome="caixa"):
    """Caixa sem bisel (12 triângulos), para detalhes miúdos que se repetem muito."""
    return mb.caixa(l, p, a, x=x, y=y, z=z, cor=cor, bisel=0, seg=1, mat=mat, nome=nome, liso=False)


def rect(a, b, cx=0.0, cy=0.0):
    """Cantos (anti-horário) de um retângulo de meia-largura a e meia-profundidade b."""
    return [(cx - a, cy - b), (cx + a, cy - b), (cx + a, cy + b), (cx - a, cy + b)]


def poli_reg(n, r, rot=None, cx=0.0, cy=0.0):
    rot = math.pi / n - math.pi / 2 if rot is None else rot  # um lado de frente para −Y
    return [(cx + r * math.cos(rot + 2 * math.pi * k / n), cy + r * math.sin(rot + 2 * math.pi * k / n))
            for k in range(n)]


def obj_tags(nome, bm, cores, liso=True, angulo=40):
    """bmesh com uma camada int 'cor' nas faces → objeto, pintando cada face pela cor (ou material) do seu tag.
    cores: {tag: "cor"} ou {tag: ("mat", "luz")}."""
    ob = mb._obj(nome, bm, "branco", liso=liso, angulo=angulo)
    me = ob.data
    at = me.attributes.get("cor")
    if at is None:
        return ob
    por = {}
    for p in me.polygons:
        por.setdefault(at.data[p.index].value, []).append(p.index)
    for t, fs in por.items():
        cc = cores.get(t, cores.get(0))
        if isinstance(cc, tuple):
            mb.pinta(ob, None, fs, mat=cc[1])
        else:
            mb.pinta(ob, cc, fs)
    me.attributes.remove(me.attributes["cor"])
    return ob


class Malha:
    """Malha montada à mão (caixas sem bisel e quadriláteros), cada face com a sua cor ou material. Não recalcula
    normais: o enrolamento das faces já sai para fora. Serve para os detalhes que se repetem muito (janelas,
    guarda-corpos, faixas de vidro), que assim ficam leves."""

    def __init__(self):
        self.bm = bmesh.new()
        self.lay = self.bm.faces.layers.int.new("cor")
        self.cores = {}
        self.M = None  # transformação aplicada a tudo o que se acrescenta (fachadas inclinadas de polígonos)

    def _t(self, cor, mat):
        chave = ("mat", mat) if mat not in (None, "atlas") else cor
        if chave not in self.cores:
            self.cores[chave] = len(self.cores)
        return self.cores[chave]

    def quad(self, pts, cor="branco", mat=None):
        if self.M is not None:
            pts = [tuple(self.M @ V(p)) for p in pts]
        f = self.bm.faces.new([self.bm.verts.new(p) for p in pts])
        f[self.lay] = self._t(cor, mat)
        return f

    def caixa(self, x0, x1, y0, y1, z0, z1, cor="branco", mat=None, M=None):
        c = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1),
             (x0, y1, z1)]
        if M is not None:
            c = [tuple(M @ V(p)) for p in c]
        if self.M is not None:
            c = [tuple(self.M @ V(p)) for p in c]
        vs = [self.bm.verts.new(p) for p in c]
        t = self._t(cor, mat)
        for idx in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
            f = self.bm.faces.new([vs[i] for i in idx])
            f[self.lay] = t

    def caixa_c(self, l, p, a, x=0.0, y=0.0, z=0.0, cor="branco", mat=None):
        self.caixa(x - l / 2, x + l / 2, y - p / 2, y + p / 2, z, z + a, cor, mat)

    def barra(self, a, b, larg, alt, z, cor="branco", mat=None):
        """Caixa ao longo do segmento 2D a → b (qualquer direção), base em z."""
        a, b = V((a[0], a[1])), V((b[0], b[1]))
        d = b - a
        L = d.length
        ang = math.atan2(d.y, d.x)
        m = (a + b) / 2
        M = Matrix.Translation((m.x, m.y, 0)) @ Matrix.Rotation(ang, 4, "Z")
        self.caixa(-L / 2, L / 2, -larg / 2, larg / 2, z, z + alt, cor, mat, M=M)

    def objeto(self, nome="malha"):
        """Vira objeto com o UV de cada face na célula da sua cor (sem recalcular normais)."""
        mb.materiais()
        bm = self.bm
        uvl = bm.loops.layers.uv.new("UVMap")
        inv = {t: k for k, t in self.cores.items()}
        for f in bm.faces:
            k = inv[f[self.lay]]
            if isinstance(k, tuple):
                f.material_index = mb.MAT_NOMES.index(k[1])
                u = (0.5, 0.5)
            else:
                f.material_index = 0
                u = mb.uv_cor(k)
            for lo in f.loops:
                lo[uvl].uv = u
        bm.faces.layers.int.remove(self.lay)
        me = bpy.data.meshes.new(nome)
        bm.to_mesh(me)
        bm.free()
        for n in mb.MAT_NOMES:
            me.materials.append(bpy.data.materials[n])
        ob = bpy.data.objects.new(nome, me)
        bpy.context.scene.collection.objects.link(ob)
        return ob


def ret_fachada(m, eixo, plano, sinal, u0, u1, z0, z1, cor=None, mat=None):
    """Quadrilátero na fachada (normal para sinal·eixo)."""
    if eixo == "y":
        pts = [(u0, plano, z0), (u1, plano, z0), (u1, plano, z1), (u0, plano, z1)]
        if sinal > 0:
            pts = pts[::-1]
    else:
        pts = [(plano, u0, z0), (plano, u1, z0), (plano, u1, z1), (plano, u0, z1)]
        if sinal < 0:
            pts = pts[::-1]
    return m.quad(pts, cor, mat)


def caixa_fachada(m, eixo, plano, sinal, uc, lu, d0, d1, z0, z1, cor=None, mat=None):
    """Caixa saliente da fachada: largura lu centrada em uc, de d0 a d1 para fora do plano."""
    a, b = sorted((plano + sinal * d0, plano + sinal * d1))
    if eixo == "y":
        m.caixa(uc - lu / 2, uc + lu / 2, a, b, z0, z1, cor, mat)
    else:
        m.caixa(a, b, uc - lu / 2, uc + lu / 2, z0, z1, cor, mat)


# =====================================================================================================================
# Telhado curvo chinês
# =====================================================================================================================
def telhado(P0, P1, h, z=0.0, cor="vermelho", cor2=None, borda=None, forro="vermelho_escuro", esp=0.24,
            ergue=None, abre=None, passo=None, aneis=6, gama=1.6, s_parede=0.35, aresta=None, r_aresta=0.1,
            pontas=True, tampa=True, nome="telhado"):
    """Telhado de beiral curvo com as pontas viradas para cima (varredura de anéis).
    P0: cantos do beiral (anti-horário), P1: cantos do topo (mesmo número; um retângulo fino = cumeeira, um quadrado
    minúsculo = ponta, o contorno do andar de cima = telhado de pagode). h: altura do beiral ao topo; z: altura do
    beiral. ergue: quanto a ponta sobe; abre: quanto a ponta se abre para fora. s_parede: fração (0 no beiral, 1 no
    topo) onde o forro encontra a parede. aresta: cor do rolo nos espigões (None = sem)."""
    n = len(P0)
    P0 = [V((p[0], p[1])) for p in P0]
    P1 = [V((p[0], p[1])) for p in P1]
    cor2 = cor2 or cor
    borda = borda or cor2
    lados = [(P0[(i + 1) % n] - P0[i]).length for i in range(n)]
    R = min(lados) * 0.45
    if passo is None:
        passo = min(1.3, max(0.45, sum(lados) / 26))
    ergue = min(0.14 * min(lados), 1.1) if ergue is None else ergue
    abre = ergue * 0.55 if abre is None else abre
    bis = []
    for i in range(n):
        d0 = (P0[i] - P0[i - 1]).normalized()
        d1 = (P0[(i + 1) % n] - P0[i]).normalized()
        n0, n1 = V((d0.y, -d0.x)), V((d1.y, -d1.x))
        bis.append((n0 + n1).normalized())
    amostras = []
    for i in range(n):
        m = max(2, int(round(lados[i] / passo)))
        for k in range(m):
            f = k / m
            d = min(f, 1 - f) * lados[i]
            c = max(0.0, 1 - d / R) ** 2
            amostras.append((i, f, c, bis[i] if f <= 0.5 else bis[(i + 1) % n]))
    N = len(amostras)

    def ponto(a, s, dz=0.0):
        i, f, c, dirf = a
        p = P0[i].lerp(P0[(i + 1) % n], f).lerp(P1[i].lerp(P1[(i + 1) % n], f), s)
        w = (1 - s) ** 2
        p = p + dirf * (abre * c * w)
        return (p.x, p.y, z + h * s ** gama + ergue * c * w + dz)

    ss = [(j / aneis) ** 0.85 for j in range(aneis + 1)]
    bm = bmesh.new()
    tag = bm.faces.layers.int.new("cor")
    anel = [[bm.verts.new(ponto(a, s)) for a in amostras] for s in ss]
    fasc = [bm.verts.new(ponto(a, 0.0, -esp)) for a in amostras]
    s_forro = [0.0, s_parede * 0.5, s_parede]
    forro_an = [fasc] + [[bm.verts.new(ponto(a, s, -esp)) for a in amostras] for s in s_forro[1:]]
    soff = forro_an[-1]

    def quad(A, B, k, t):
        f = bm.faces.new((A[k], A[(k + 1) % N], B[(k + 1) % N], B[k]))
        f[tag] = t

    for j in range(aneis):
        for k in range(N):
            quad(anel[j], anel[j + 1], k, k % 2)
    for k in range(N):
        quad(fasc, anel[0], k, 2)
        for j in range(len(forro_an) - 1):
            quad(forro_an[j + 1], forro_an[j], k, 3)
    tampas = []
    if tampa:
        f = bm.faces.new(anel[-1])
        f[tag] = 0
        tampas.append(f)
    f = bm.faces.new(soff[::-1])
    f[tag] = 3
    tampas.append(f)
    bmesh.ops.triangulate(bm, faces=tampas, quad_method="BEAUTY", ngon_method="BEAUTY")
    ob = obj_tags(nome, bm, {0: cor, 1: cor2, 2: borda, 3: forro}, angulo=50)
    objs = [ob]
    if aresta:
        k0 = 0
        for i in range(n):
            a = amostras[k0]
            sr = ss[::-1][::2] if len(ss) > 5 else ss[::-1]
            if sr[-1] != 0.0:
                sr = sr + [0.0]
            pts = [ponto(a, s, r_aresta * 0.6) for s in sr]
            if pontas:
                tip = V(pts[-1])
                dirf = V((a[3].x, a[3].y, 0))
                pts.append(tuple(tip + dirf * (0.18 + ergue * 0.25) + V((0, 0, 0.12 + ergue * 0.2))))
                pts.append(tuple(tip + dirf * (0.26 + ergue * 0.3) + V((0, 0, 0.32 + ergue * 0.35))))
            objs.append(rolo(pts, r_aresta, cor=aresta, nome="espigao"))
            k0 += max(2, int(round(lados[i] / passo)))
    return mb.junta(objs, nome)


def rolo(pts, r, cor="ouro", lados=6, nome="rolo"):
    """Rolo leve (tubo de poucos lados, com tampas) por uma linha de pontos 3D: espigões e cumeeiras."""
    pts = [V(p) for p in pts]
    bm = bmesh.new()
    aneis = []
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        ref = V((0, 0, 1)) if abs(t.z) < 0.9 else V((1, 0, 0))
        u = t.cross(ref).normalized()
        w = t.cross(u).normalized()
        aneis.append([bm.verts.new(p + (u * math.cos(2 * math.pi * k / lados) + w * math.sin(2 * math.pi * k / lados)) * r)
                      for k in range(lados)])
    for A, B in zip(aneis, aneis[1:]):
        for k in range(lados):
            bm.faces.new((A[k], A[(k + 1) % lados], B[(k + 1) % lados], B[k]))
    bm.faces.new(aneis[0][::-1])
    bm.faces.new(aneis[-1])
    return mb._obj(nome, bm, cor, liso=True, angulo=70)


def s_parede_ret(A, B, a1, b1, Aw, Bw):
    """Fração do telhado retangular (beiral A × B → topo a1 × b1) em que o anel fica dentro da parede Aw × Bw."""
    sx = (A - Aw) / max(A - a1, 1e-3)
    sy = (B - Bw) / max(B - b1, 1e-3)
    return min(0.97, max(sx, sy) + 0.05)


def telhado_cumeeira(Aw, Bw, z, beiral=1.1, h=None, cor="vermelho", cor2=None, aresta="ouro", cumeeira="ouro",
                     chifres=True, forro="vermelho_escuro", esp=0.26, ergue=None, nome="telhado"):
    """Telhado de quatro águas com cumeeira ao longo de X sobre paredes 2Aw × 2Bw (topo das paredes em z). A cumeeira
    tem as pontas enroladas (chifres)."""
    A, B = Aw + beiral, Bw + beiral
    h = h or B * 0.55
    rb = 0.18
    a1 = max(A - B * 0.95, 0.4)
    s_w = s_parede_ret(A, B, a1, rb, Aw, Bw)
    t = telhado(rect(A, B), rect(a1, rb), h, z=z - 0.05, cor=cor, cor2=cor2, aresta=aresta, forro=forro, esp=esp,
                s_parede=s_w, ergue=ergue, nome=nome)
    objs = [t]
    zt = z - 0.05 + h
    rr = 0.2
    objs.append(rolo([(-a1 - 0.05, 0, zt + 0.02), (a1 + 0.05, 0, zt + 0.02)], rr, cor=cumeeira, lados=8,
                     nome="cumeeira"))
    objs.append(bx(2 * a1 + 0.2, 0.36, 0.22, z=zt - 0.1, cor=cumeeira, b=0.08))
    if chifres:
        for sx in (-1, 1):
            pts = [(sx * (a1 - 0.1), 0, zt + 0.02), (sx * (a1 + 0.35), 0, zt + 0.1), (sx * (a1 + 0.55), 0, zt + 0.55),
                   (sx * (a1 + 0.4), 0, zt + 0.95), (sx * (a1 + 0.12), 0, zt + 1.0)]
            objs.append(rolo(mb._arredonda_cantos(pts, 0.22, 3), 0.17, cor=cumeeira, nome="chifre"))
    return mb.junta(objs, nome)


def telhado_pagode(Aw, Bw, z, Au=None, Bu=None, beiral=0.9, h=None, cor="vermelho", cor2=None, aresta=None,
                   forro="vermelho_escuro", esp=0.22, ergue=None, nome="telhado"):
    """Telhado de andar de pagode: beiral em volta das paredes 2Aw × 2Bw (topo em z) subindo até o contorno do andar
    de cima (2Au × 2Bu), com tampa plana onde o andar de cima se apoia. Devolve (objeto, z do topo)."""
    Au = Aw * 0.82 if Au is None else Au
    Bu = Bw * 0.82 if Bu is None else Bu
    A, B = Aw + beiral, Bw + beiral
    h = h or max(0.7, (A - Au) * 0.6)
    s_w = s_parede_ret(A, B, Au, Bu, Aw, Bw)
    t = telhado(rect(A, B), rect(Au, Bu), h, z=z - 0.05, cor=cor, cor2=cor2, aresta=aresta, forro=forro, esp=esp,
                s_parede=s_w, ergue=ergue, nome=nome, aneis=4)
    return t, z - 0.05 + h


def telhado_ponta(P_paredes, z, beiral=0.9, h=None, cor="vermelho", cor2=None, aresta=None, forro="vermelho_escuro",
                  esp=0.22, ergue=None, pinaculo="ouro", nome="telhado"):
    """Telhado em ponta (pirâmide curva) sobre um polígono de paredes (cantos anti-horário, centro na origem do
    polígono), com pináculo dourado."""
    cx = sum(p[0] for p in P_paredes) / len(P_paredes)
    cy = sum(p[1] for p in P_paredes) / len(P_paredes)
    P0 = []
    for p in P_paredes:
        d = V((p[0] - cx, p[1] - cy))
        L = d.length
        P0.append((cx + d.x * (L + beiral * 1.3) / L, cy + d.y * (L + beiral * 1.3) / L))
    r0 = max(V((p[0] - cx, p[1] - cy)).length for p in P0)
    h = h or r0 * 0.75
    P1 = [(cx + (p[0] - cx) * 0.03, cy + (p[1] - cy) * 0.03) for p in P0]
    rw = min(V((p[0] - cx, p[1] - cy)).length for p in P_paredes)
    s_w = min(0.95, (r0 - rw * 0.92) / r0 + 0.04)
    t = telhado(P0, P1, h, z=z - 0.05, cor=cor, cor2=cor2, aresta=aresta, forro=forro, esp=esp, s_parede=s_w,
                ergue=ergue, nome=nome)
    objs = [t]
    if pinaculo:
        objs.append(pinaculo_(cx, cy, z - 0.05 + h - 0.1, tam=max(0.7, r0 * 0.22), cor=pinaculo))
    return mb.junta(objs, nome)


def pinaculo_(x, y, z, tam=1.0, cor="ouro"):
    s = tam
    perfil = [(0, 0), (0.28 * s, 0), (0.3 * s, 0.1 * s), (0.18 * s, 0.22 * s), (0.26 * s, 0.4 * s), (0.27 * s, 0.52 * s),
              (0.12 * s, 0.66 * s), (0.08 * s, 0.75 * s), (0.17 * s, 0.86 * s), (0.17 * s, 0.94 * s), (0.06 * s, 1.04 * s),
              (0.05 * s, 1.5 * s), (0.0, 1.62 * s)]
    return mb.torno(perfil, x=x, y=y, z=z, cor=cor, seg=12, nome="pinaculo")


# =====================================================================================================================
# Janelas, portas, letreiros, lanternas
# =====================================================================================================================
def janelas(face, u0, u1, z0, z1, colunas, linhas, larg=0.6, alt=0.55, moldura="branco", semente=1, apagadas=0.4,
            frias=0.22, sal=0.06, trelica=None, peitoril=None, pular=(), m=None, nome="janelas"):
    """Grade de janelas leves numa fachada plana. face = ("y", y_plano, sinal) ou ("x", x_plano, sinal) (sinal −1 =
    olha para −Y / −X). Cada célula: moldura (caixa) + vidro (uma face com janela / janela_fria / janela_apagada,
    sorteado; ≈ 40 % apagadas). trelica = cor da cruz de caixilho (janela chinesa); peitoril = cor do peitoril.
    pular: células (coluna, linha) sem janela. m: Malha onde acrescentar (senão devolve um objeto)."""
    rnd = random.Random(semente)
    eixo, plano, sinal = face
    proprio = m is None
    m = m or Malha()
    cw = (u1 - u0) / colunas
    ch = (z1 - z0) / linhas
    w, h = cw * larg, ch * alt
    e = 0.08
    for i in range(colunas):
        for j in range(linhas):
            r = rnd.random()
            if (i, j) in pular:
                continue
            uc = u0 + cw * (i + 0.5)
            zb = z0 + ch * (j + 0.5) - h / 2
            mat = "janela_apagada" if r < apagadas else ("janela_fria" if r < apagadas + frias else "janela")
            caixa_fachada(m, eixo, plano, sinal, uc, w + 2 * e, -0.02, sal, zb - e, zb + h + e, cor=moldura)
            ret_fachada(m, eixo, plano + sinal * (sal + 0.004), sinal, uc - w / 2, uc + w / 2, zb, zb + h, mat=mat)
            if trelica:
                dd = plano + sinal * (sal + 0.012)
                ret_fachada(m, eixo, dd, sinal, uc - 0.035, uc + 0.035, zb, zb + h, cor=trelica)
                ret_fachada(m, eixo, dd + sinal * 0.002, sinal, uc - w / 2, uc + w / 2, zb + h * 0.55 - 0.035,
                            zb + h * 0.55 + 0.035, cor=trelica)
            if peitoril:
                caixa_fachada(m, eixo, plano, sinal, uc, w + 2 * e + 0.12, 0.0, sal + 0.1, zb - e - 0.09, zb - e,
                              cor=peitoril)
    return m.objeto(nome) if proprio else m


def janelas_bloco(l, p, z0, z1, andares, cx_, cy_, x=0.0, y=0.0, semente=1, frente=True, margem=0.3, **k):
    """Janelas nas quatro fachadas de um bloco l × p centrado em (x, y) (os planos das fachadas são as faces do
    bloco; 'margem' afasta as janelas dos cantos). cx_/cy_: colunas nas fachadas X e Y."""
    m = Malha()
    g = margem
    if frente:
        janelas(("y", y - p / 2, -1), x - l / 2 + g, x + l / 2 - g, z0, z1, cx_, andares, semente=semente, m=m, **k)
    janelas(("y", y + p / 2, 1), x - l / 2 + g, x + l / 2 - g, z0, z1, cx_, andares, semente=semente + 1, m=m, **k)
    janelas(("x", x - l / 2, -1), y - p / 2 + g, y + p / 2 - g, z0, z1, cy_, andares, semente=semente + 2, m=m, **k)
    janelas(("x", x + l / 2, 1), y - p / 2 + g, y + p / 2 - g, z0, z1, cy_, andares, semente=semente + 3, m=m, **k)
    return m.objeto("janelas")


def janelas_poligono(P, z0, z1, linhas=1, larg_cel=1.6, margem=0.3, semente=1, m=None, pular_lados=(), **k):
    """Janelas nas fachadas de um prisma de base poligonal P (cantos anti-horário): em cada lado, uma grade com
    colunas de ~larg_cel, montada no referencial do lado (−Y local = para fora)."""
    proprio = m is None
    m = m or Malha()
    n = len(P)
    for i in range(n):
        if i in pular_lados:
            continue
        a, b = V(P[i]), V(P[(i + 1) % n])
        d = b - a
        L = d.length
        mid = (a + b) / 2
        m.M = Matrix.Translation((mid.x, mid.y, 0)) @ Matrix.Rotation(math.atan2(d.y, d.x), 4, "Z")
        nc = max(1, int(round((L - 2 * margem) / larg_cel)))
        janelas(("y", 0.0, -1), -L / 2 + margem, L / 2 - margem, z0, z1, nc, linhas, semente=semente + 5 * i, m=m, **k)
    m.M = None
    return m.objeto("janelas") if proprio else m


def faixas_vidro(l, p, z0, andares, alt_andar, x=0.0, y=0.0, colunas=(4, 4), moldura="azul_escuro", semente=1,
                 apagadas=0.4, frias=0.25, alt_vidro=0.62, montante=0.14, faces=("-y", "+y", "-x", "+x"), m=None):
    """Fachada-cortina leve para prédio alto: por andar e por fachada, uma faixa de moldura e os vidros entre
    montantes (cada vidro uma face com material sorteado)."""
    rnd = random.Random(semente)
    proprio = m is None
    m = m or Malha()
    for j in range(andares):
        zb = z0 + j * alt_andar + alt_andar * (1 - alt_vidro) / 2
        hv = alt_andar * alt_vidro
        for fc in faces:
            eixo, sinal = fc[1], (-1 if fc[0] == "-" else 1)
            plano = (y + sinal * p / 2) if eixo == "y" else (x + sinal * l / 2)
            L, nc, cen = (l, colunas[0], x) if eixo == "y" else (p, colunas[1], y)
            u0, u1 = cen - L / 2 + 0.35, cen + L / 2 - 0.35
            caixa_fachada(m, eixo, plano, sinal, cen, u1 - u0 + 0.16, -0.02, 0.05, zb - 0.08, zb + hv + 0.08,
                          cor=moldura)
            cw = (u1 - u0) / nc
            for i in range(nc):
                r = rnd.random()
                mat = "janela_apagada" if r < apagadas else ("janela_fria" if r < apagadas + frias else "janela")
                uc = u0 + cw * (i + 0.5)
                ret_fachada(m, eixo, plano + sinal * 0.054, sinal, uc - (cw - montante) / 2, uc + (cw - montante) / 2,
                            zb, zb + hv, mat=mat)
    return m.objeto("faixas_vidro") if proprio else m


def porta(x, y_face, larg=1.6, alt=2.4, z=0.0, moldura="ouro", folha="vermelho_escuro", vidro=True, face=-1,
          eixo="y", nome="porta"):
    """Porta de entrada na fachada (moldura gorda + folhas de vidro ou madeira)."""
    objs = []
    if eixo == "y":
        objs.append(bx(larg + 0.36, 0.16, alt + 0.2, x=x, y=y_face + face * 0.06, z=z, cor=moldura, b=0.05, seg=1))
        if vidro:
            objs.append(bx0(larg, 0.04, alt, x=x, y=y_face + face * 0.15, z=z, cor=None, mat="vidro"))
            objs.append(bx0(0.08, 0.06, alt, x=x, y=y_face + face * 0.16, z=z, cor=moldura))
        else:
            objs.append(bx(larg / 2 - 0.03, 0.08, alt, x=x - larg / 4, y=y_face + face * 0.16, z=z, cor=folha, b=0.02,
                           seg=1))
            objs.append(bx(larg / 2 - 0.03, 0.08, alt, x=x + larg / 4, y=y_face + face * 0.16, z=z, cor=folha, b=0.02,
                           seg=1))
            for sx in (-1, 1):
                objs.append(mb.cilindro(0.07, 0.08, x=x + sx * 0.12, y=y_face + face * 0.22, z=z + alt * 0.48,
                                        cor="ouro", eixo="y", seg=8, bisel=0))
    else:
        objs.append(bx(0.16, larg + 0.36, alt + 0.2, x=y_face + face * 0.06, y=x, z=z, cor=moldura, b=0.05))
        objs.append(bx0(0.04, larg, alt, x=y_face + face * 0.15, y=x, z=z, cor=None, mat="vidro"))
    return mb.junta(objs, nome)


def porta_lua(x, y_face, r=1.3, z=0.0, moldura="ouro", fundo="vermelho_escuro", face=-1, nome="porta_lua"):
    """Porta redonda (porta-lua) dos jardins chineses: anel dourado em volta de folhas de madeira."""
    anel = mb.torno([(r, -0.12), (r + 0.25, -0.12), (r + 0.25, 0.12), (r, 0.12)], cor=moldura, seg=24, nome="anel")
    mb.transforma(anel, rot=("X", 90))
    mb.transforma(anel, loc=(x, y_face + face * 0.08, z + r))
    disco = mb.cilindro(r + 0.02, 0.06, x=x, y=y_face + face * 0.05, z=z + r, cor=fundo, eixo="y", seg=24)
    bar = bx0(0.06, 0.08, 2 * r * 0.95, x=x, y=y_face + face * 0.09, z=z + r * 0.05, cor=moldura)
    return mb.junta([anel, disco, bar], nome)


_EST_CACHE = {}


def estampa(nome):
    if nome not in _EST_CACHE:
        _EST_CACHE[nome] = mb.material_estampa("ct_" + nome, os.path.join(_EST_DIR, nome + ".png"))
    return _EST_CACHE[nome]


def _tamanho_png(nome):
    import struct
    with open(os.path.join(_EST_DIR, nome + ".png"), "rb") as f:
        f.read(16)
        w, h = struct.unpack(">II", f.read(8))
    return w, h


def letreiro(nome, x, y, z, alt=None, larg=None, face=-1, eixo="y", moldura="ouro", luz=True, nome_obj="letreiro"):
    """Placa com estampa (texto) presa numa fachada: x, y = ponto no plano da fachada (y_face), z = base da placa.
    A proporção vem do PNG. luz=True põe um filete luminoso (material luz) em volta, para brilhar à noite."""
    w, h = _tamanho_png(nome)
    asp = w / h
    if larg is None:
        larg = alt * asp
    else:
        alt = larg / asp
    mi = estampa(nome)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    d = 0.14
    if eixo == "y":
        ys = y + face * (d + 0.006)
        vs = [bm.verts.new(p) for p in ((x - larg / 2, ys, z), (x + larg / 2, ys, z), (x + larg / 2, ys, z + alt),
                                        (x - larg / 2, ys, z + alt))]
    else:
        xs = x + face * (d + 0.006)
        vs = [bm.verts.new(p) for p in ((xs, y + larg / 2 * (-face), z), (xs, y - larg / 2 * (-face), z),
                                        (xs, y - larg / 2 * (-face), z + alt), (xs, y + larg / 2 * (-face), z + alt))]
    f = bm.faces.new(vs if face < 0 or eixo == "x" else vs[::-1])
    for lo, (u, v) in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1)) if face < 0 or eixo == "x" else
                          ((1, 0), (0, 0), (0, 1), (1, 1))):
        lo[uv].uv = (u, v)
    # garante a normal para fora
    f.normal_update()
    quer = V((0, face, 0)) if eixo == "y" else V((face, 0, 0))
    if f.normal.dot(quer) < 0:
        f.normal_flip()
    cara = mb._obj("placa", bm, None, mat=mi, liso=False)
    objs = [cara]
    if eixo == "y":
        objs.append(bx(larg + 0.16, d, alt + 0.16, x=x, y=y + face * d / 2, z=z - 0.08, cor=moldura, b=0.04))
    else:
        objs.append(bx(d, larg + 0.16, alt + 0.16, x=x + face * d / 2, y=y, z=z - 0.08, cor=moldura, b=0.04))
    if luz:
        e = 0.06
        if eixo == "y":
            yy = y + face * (d + 0.01)
            objs += [bx0(larg + 0.2, 0.04, e, x=x, y=yy, z=z - 0.1, cor=None, mat="luz"),
                     bx0(larg + 0.2, 0.04, e, x=x, y=yy, z=z + alt + 0.04, cor=None, mat="luz"),
                     bx0(e, 0.04, alt + 0.2, x=x - larg / 2 - 0.07, y=yy, z=z - 0.1, cor=None, mat="luz"),
                     bx0(e, 0.04, alt + 0.2, x=x + larg / 2 + 0.07, y=yy, z=z - 0.1, cor=None, mat="luz")]
        else:
            xx = x + face * (d + 0.01)
            objs += [bx0(0.04, larg + 0.2, e, x=xx, y=y, z=z - 0.1, cor=None, mat="luz"),
                     bx0(0.04, larg + 0.2, e, x=xx, y=y, z=z + alt + 0.04, cor=None, mat="luz"),
                     bx0(0.04, e, alt + 0.2, x=xx, y=y - larg / 2 - 0.07, z=z - 0.1, cor=None, mat="luz"),
                     bx0(0.04, e, alt + 0.2, x=xx, y=y + larg / 2 + 0.07, z=z - 0.1, cor=None, mat="luz")]
    return mb.junta(objs, nome_obj)


def letreiro_bandeira(nome, x, y, z, alt, lado=1, face=-1, moldura="ouro"):
    """Tabuleta vertical em bandeira (perpendicular à fachada, saindo dela), com estampa nos dois lados."""
    w, h = _tamanho_png(nome)
    larg = alt * w / h
    mi = estampa(nome)
    objs = []
    yc = y + face * (larg / 2 + 0.35)
    for s in (-1, 1):
        bm = bmesh.new()
        uv = bm.loops.layers.uv.new("UVMap")
        xs = x + s * 0.09
        cs = [(xs, yc - larg / 2, z), (xs, yc + larg / 2, z), (xs, yc + larg / 2, z + alt), (xs, yc - larg / 2, z + alt)]
        uvs = [(0, 0), (1, 0), (1, 1), (0, 1)]
        if s < 0:  # quem olha de −X vê y crescendo para a esquerda
            uvs = [(1, 0), (0, 0), (0, 1), (1, 1)]
        vs = [bm.verts.new(p) for p in cs]
        f = bm.faces.new(vs)
        for lo, u in zip(f.loops, uvs):
            lo[uv].uv = u
        f.normal_update()
        if f.normal.x * s < 0:
            f.normal_flip()
        objs.append(mb._obj("bandeira", bm, None, mat=mi, liso=False))
    objs.append(bx(0.16, larg + 0.16, alt + 0.16, x=x, y=yc, z=z - 0.08, cor=moldura, b=0.04))
    objs.append(bx0(0.12, 0.4, 0.12, x=x, y=y + face * 0.2, z=z + alt * 0.85, cor="ferro"))
    objs.append(bx0(0.12, 0.4, 0.12, x=x, y=y + face * 0.2, z=z + alt * 0.1, cor="ferro"))
    for zz in (z - 0.12, z + alt + 0.08):
        objs.append(bx0(0.2, larg + 0.2, 0.05, x=x, y=yc, z=zz, cor=None, mat="luz"))
    return mb.junta(objs, "bandeira")


def lanterna(x, y, z_topo, r=0.32, fio=0.25, cor="vermelho", nome="lanterna"):
    """Lanterna chinesa pendurada (o topo do fio em z_topo): corpo vermelho com a faixa do meio luminosa (material
    luz, acesa à noite), tampas douradas e borla."""
    zc = z_topo - fio - r * 0.95
    corpo = mb.torno([(0, -r * 0.85), (r * 0.62, -r * 0.72), (r * 0.98, -r * 0.33), (r * 0.98, r * 0.33),
                      (r * 0.62, r * 0.72), (0, r * 0.85)], x=x, y=y, z=zc, cor=cor, seg=8, angulo=60)
    faixa = mb.cilindro(r * 1.0, r * 0.7, x=x, y=y, z=zc - r * 0.35, cor=None, mat="luz", seg=8, bisel=0,
                        tampas=False)
    objs = [bx0(0.03, 0.03, fio + r * 0.3, x=x, y=y, z=zc + r * 0.7, cor="ferro"), corpo, faixa,
            mb.cilindro(r * 0.5, r * 0.16, x=x, y=y, z=zc + r * 0.74, cor="ouro", seg=8, bisel=0),
            mb.cilindro(r * 0.12, r * 0.6, x=x, y=y, z=zc - r * 1.4, cor="ouro", seg=6, bisel=0, r2=r * 0.04)]
    return mb.junta(objs, nome)


def coluna(x, y, z, alt, r=0.22, cor="vermelho", base="concreto", nome="coluna"):
    """Coluna redonda com base de pedra e capitel dourado (leve: 10 lados)."""
    return mb.junta([mb.cilindro(r, alt, x=x, y=y, z=z, cor=cor, seg=10, bisel=0),
                     mb.cilindro(r * 1.35, 0.2, x=x, y=y, z=z, cor=base, seg=10, bisel=0.03),
                     mb.cilindro(r * 1.25, 0.16, x=x, y=y, z=z + alt - 0.16, cor="ouro", seg=10, bisel=0)], nome)


def guarda_corpo(P, z, alt=0.9, cor="vermelho", corrimao="ouro", fechado=True, balaustres=1.2, m=None,
                 nome="guarda_corpo"):
    """Guarda-corpo ao longo de um contorno (cantos): corrimão gordo + pilaretes + travessa baixa."""
    proprio = m is None
    m = m or Malha()
    pts = list(P) + ([P[0]] if fechado else [])
    for a, b in zip(pts, pts[1:]):
        a, b = V((a[0], a[1])), V((b[0], b[1]))
        L = (b - a).length
        d = (b - a) / L
        m.barra(a - d * 0.06, b + d * 0.06, 0.14, 0.12, z + alt - 0.12, cor=corrimao)
        m.barra(a, b, 0.09, 0.1, z + 0.1, cor=cor)
        nb = max(1, int(round(L / balaustres)))
        for k in range(nb):
            q = a + d * (L * k / nb)
            m.caixa(q.x - 0.045, q.x + 0.045, q.y - 0.045, q.y + 0.045, z, z + alt - 0.1, cor)
    return m.objeto(nome) if proprio else m


def ar_condicionado(x, y_face, z, face=-1, eixo="y"):
    """Caixinha de ar-condicionado na fachada (o detalhe fofo das referências)."""
    if eixo == "y":
        return mb.junta([bx(0.7, 0.35, 0.45, x=x, y=y_face + face * 0.17, z=z, cor="branco", b=0.04, seg=1),
                         mb.cilindro(0.15, 0.04, x=x + 0.12, y=y_face + face * 0.35, z=z + 0.22, cor="cinza", eixo="y",
                                     seg=8, bisel=0)], "ar")
    return mb.junta([bx(0.35, 0.7, 0.45, x=y_face + face * 0.17, y=x, z=z, cor="branco", b=0.04, seg=1),
                     mb.cilindro(0.15, 0.04, x=y_face + face * 0.35, y=x + 0.12, z=z + 0.22, cor="cinza", eixo="x",
                                 seg=8, bisel=0)], "ar")


def base_pedra(l, p, alt=0.3, cor="concreto", degraus_frente=0, larg_degrau=3.0, nome="base"):
    """Embasamento de pedra (pódio) com degraus na frente (−Y)."""
    objs = [bx(l, p, alt, cor=cor, b=0.06)]
    for k in range(degraus_frente):
        hh = alt * (degraus_frente - k) / (degraus_frente + 1)
        objs.append(bx(larg_degrau, 0.35, hh, y=-p / 2 - 0.35 * (k + 0.5) + 0.02, cor=cor, b=0.04))
    return mb.junta(objs, nome)


def caixa_dagua(x, y, z, cor="concreto_escuro"):
    return mb.junta([mb.cilindro(0.9, 1.6, x=x, y=y, z=z + 0.8, cor=cor, seg=14, bisel=0.06),
                     mb.cilindro(0.95, 0.12, x=x, y=y, z=z + 2.38, cor="cinza_medio", seg=14, bisel=0.04),
                     *[bx0(0.1, 0.1, 0.82, x=x + dx, y=y + dy, z=z, cor="ferro") for dx in (-0.6, 0.6) for dy in (-0.6, 0.6)]],
                    "caixa_dagua")


def cornija(l, p, z, alt=0.3, sal=0.15, cor="branco", x=0.0, y=0.0):
    return bx(l + 2 * sal, p + 2 * sal, alt, x=x, y=y, z=z, cor=cor, b=0.06)


# =====================================================================================================================
# Exportação
# =====================================================================================================================
def _conta_tris(it):
    por = {}
    for o in it.partes:
        if o.type == "MESH":
            n = sum(len(p.vertices) - 2 for p in o.data.polygons)
            k = o.name.split(".")[0]
            por[k] = por.get(k, 0) + n
    print("  tris por parte:", sorted(por.items(), key=lambda q: -q[1])[:12], flush=True)


def exporta(cat, it, rotulo, grupo, lote=(1, 1), andares=1, tags=(), colisao=None):
    if os.environ.get("CT_TRIS"):
        _conta_tris(it)
    if colisao:
        it.colisao(colisao)
    return cat.exporta(it, rotulo, grupo=grupo, tags=["predio", ESTILO] + list(tags),
                       extra={"lote": list(lote), "andares": andares, "estilo": ESTILO})


PECAS = {}


def peca(id_):
    def deco(f):
        PECAS[id_] = f
        return f
    return deco


# =====================================================================================================================
# Conjuntos (partes que os desenhos repetem)
# =====================================================================================================================
def saia(Aw, Bw, z, beiral=0.8, h=0.7, cor="vermelho", cor2=None, aresta=None, forro="vermelho_escuro", borda=None,
         ergue=None, esp=0.2, x=0.0, y=0.0, nome="beiral"):
    """Beiral curvo em volta de um bloco (2Aw × 2Bw, centrado em x, y) na altura z: a 'saia' de telhas entre andares
    dos prédios de Chinatown. O topo entra na parede (o andar de cima continua por cima)."""
    A, B = Aw + beiral, Bw + beiral
    return telhado(rect(A, B, x, y), rect(Aw - 0.3, Bw - 0.3, x, y), h, z=z - 0.05, cor=cor, cor2=cor2, aresta=aresta,
                   forro=forro, borda=borda, s_parede=0.95, aneis=3, esp=esp, ergue=ergue, nome=nome)


def terraco(l, p, z, alt=0.8, piso="terracota_clara", parapeito="creme", friso="ouro", x=0.0, y=0.0, esp=0.3,
            nome="terraco"):
    """Terraço no alto de um bloco l × p: laje de piso (z) e parapeito de espessura esp com friso no topo."""
    m = Malha()
    x0, x1, y0, y1 = x - l / 2, x + l / 2, y - p / 2, y + p / 2
    m.caixa(x0 + esp, x1 - esp, y0 + esp, y1 - esp, z, z + 0.12, piso)
    for (a0, a1, b0, b1) in ((x0, x1, y0, y0 + esp), (x0, x1, y1 - esp, y1), (x0, x0 + esp, y0 + esp, y1 - esp),
                             (x1 - esp, x1, y0 + esp, y1 - esp)):
        m.caixa(a0, a1, b0, b1, z, z + alt, parapeito)
    g = 0.05
    for (a0, a1, b0, b1) in ((x0 - g, x1 + g, y0 - g, y0 + esp + g), (x0 - g, x1 + g, y1 - esp - g, y1 + g),
                             (x0 - g, x0 + esp + g, y0 + esp + g, y1 - esp - g),
                             (x1 - esp - g, x1 + g, y0 + esp + g, y1 - esp - g)):
        m.caixa(a0, a1, b0, b1, z + alt, z + alt + 0.12, friso)
    return m.objeto(nome)


def frente_loja(x, y_face, larg, alt, z=0.0, moldura="vermelho_escuro", semente=1, porta_i=None, nome="vitrine_loja"):
    """Fachada de loja no térreo: moldura gorda, rodapé e painéis de vitrine (acesos à noite: janela / janela_fria),
    com uma porta de vidro (painel porta_i)."""
    rnd = random.Random(semente)
    m = Malha()
    n = max(2, int(round(larg / 1.3)))
    porta_i = n // 2 if porta_i is None else porta_i
    m.caixa(x - larg / 2 - 0.18, x + larg / 2 + 0.18, y_face - 0.1, y_face + 0.05, z, z + alt + 0.18, moldura)
    m.caixa(x - larg / 2, x + larg / 2, y_face - 0.16, y_face - 0.08, z, z + 0.45, moldura)
    cw = larg / n
    for i in range(n):
        u0, u1 = x - larg / 2 + cw * i + 0.06, x - larg / 2 + cw * (i + 1) - 0.06
        if i == porta_i:
            ret_fachada(m, "y", y_face - 0.105, -1, u0, u1, z + 0.02, z + alt - 0.05, mat="vidro")
            m.caixa(u0 - 0.03, u1 + 0.03, y_face - 0.14, y_face - 0.09, z + alt - 0.12, z + alt, moldura)
            m.caixa((u0 + u1) / 2 - 0.03, (u0 + u1) / 2 + 0.03, y_face - 0.16, y_face - 0.1, z, z + alt, "ouro")
        else:
            mat = "janela" if rnd.random() < 0.65 else "janela_fria"
            ret_fachada(m, "y", y_face - 0.105, -1, u0, u1, z + 0.47, z + alt - 0.05, mat=mat)
        if i:
            uu = x - larg / 2 + cw * i
            m.caixa(uu - 0.06, uu + 0.06, y_face - 0.17, y_face - 0.09, z, z + alt, moldura)
    return m.objeto(nome)


def toldo(x, y_face, larg, z, prof=1.1, queda=0.55, cores=("vermelho", "branco"), n=None, nome="toldo"):
    """Toldo listrado sobre a vitrine (z = altura onde prende na fachada)."""
    n = n or max(4, int(round(larg / 0.55)))
    w = larg / n
    perfil = mb._ccw([(y_face, z), (y_face - prof, z - queda), (y_face - prof, z - queda - 0.28),
                      (y_face - prof + 0.07, z - queda - 0.28), (y_face - prof + 0.07, z - queda - 0.05),
                      (y_face, z - 0.08)])
    objs = []
    for k in range(n):
        o = mb.extrudado(perfil, w + 0.002, x=x - larg / 2 + w * k, cor=cores[k % 2], bisel=0.015, seg=1, plano="yz")
        objs.append(o)
    return mb.junta(objs, nome)


def bambu(x, y, z, alt=2.6, n=4, semente=1):
    """Touceira de bambu num vaso (canas verdes com um nó e tufos de folhas)."""
    rnd = random.Random(semente)
    objs = []
    for k in range(n):
        a = 2 * math.pi * k / n + rnd.random()
        r = 0.22 + rnd.random() * 0.2
        px, py = x + r * math.cos(a), y + r * math.sin(a)
        h = alt * (0.75 + rnd.random() * 0.4)
        objs.append(mb.cilindro(0.06, h, x=px, y=py, z=z, cor="verde", seg=6, bisel=0, tampas=False))
        objs.append(mb.cilindro(0.075, 0.06, x=px, y=py, z=z + h * 0.5, cor="verde_escuro", seg=6, bisel=0))
        objs.append(mb.esfera(0.45, x=px + 0.15 * math.cos(a), y=py + 0.15 * math.sin(a), z=z + h, esc=(1, 1, 0.6),
                              seg=7, cor="folha" if k % 2 else "folha_clara"))
    objs.append(mb.cilindro(0.6, 0.4, x=x, y=y, z=z, cor="terracota", seg=10, bisel=0.04))
    return mb.junta(objs, "bambu")


def bloco_andares(it, l, p, z0, andares, alt_andar=ANDAR, parede="vermelho", moldura="branco", x=0.0, y=0.0,
                  colunas=None, semente=1, cornijas="branco", frente=True, trelica=None, peitoril=None, ares=0,
                  larg=0.58, alt=0.56, margem=0.4):
    """Bloco de apartamentos: caixa boleada + janelas nas 4 fachadas + friso em cada andar + aparelhos de ar."""
    it.add(bx(l, p, andares * alt_andar + 0.05, x=x, y=y, z=z0, cor=parede, b=0.1))
    cx_, cy_ = colunas or (max(2, int(round(l / 2.1))), max(2, int(round(p / 2.1))))
    it.add(janelas_bloco(l, p, z0, z0 + andares * alt_andar, andares, cx_, cy_, x=x, y=y, semente=semente,
                         frente=frente, moldura=moldura, trelica=trelica, peitoril=peitoril, larg=larg, alt=alt,
                         margem=margem))
    if cornijas:
        m = Malha()
        for k in range(1, andares):
            zz = z0 + k * alt_andar - 0.08
            m.caixa(x - l / 2 - 0.06, x + l / 2 + 0.06, y - p / 2 - 0.06, y + p / 2 + 0.06, zz, zz + 0.12, cornijas)
        if andares > 1:
            it.add(m.objeto("frisos"))
    rnd = random.Random(semente * 3 + 1)
    for k in range(ares):
        j = rnd.randrange(andares)
        i = rnd.randrange(cx_)
        cw = (l - 2 * margem) / cx_
        xx = x - l / 2 + margem + cw * (i + 0.5) + cw * 0.38
        if xx + 0.4 < x + l / 2:
            it.add(ar_condicionado(xx, y - p / 2, z0 + j * alt_andar + 0.15))


# =====================================================================================================================
# Desenhos
# =====================================================================================================================
def torre_pagode(n, Aw, z0=0.0, enc=0.86, alt_andar=2.9, parede="vermelho", telha="turquesa", telha2="turquesa_escuro",
                 aresta=None, col="vermelho_escuro", moldura="ouro", trelica="vermelho_escuro", forro="vermelho_escuro",
                 semente=1, janelas_lado=None, beiral=0.85, varanda=True, pinaculo="ouro", lanternas=0, r_lant=0.32,
                 alt_primeiro=None, Bw=None, ultimo="ponta", h_ponta=None):
    """Pagode de n andares (quadrado de meia-largura Aw na base, encolhendo 'enc' a cada andar). Cada andar: paredes
    com janelas de treliça, colunas nos cantos e beiral curvo; varanda com guarda-corpo em cima de cada beiral; no topo,
    telhado em ponta com pináculo. Devolve (objetos, z do topo, meia-largura do último andar)."""
    objs = []
    z = z0
    Bw = Aw if Bw is None else Bw
    a, b = Aw, Bw
    for k in range(n):
        h = alt_primeiro if (k == 0 and alt_primeiro) else alt_andar
        objs.append(bx(2 * a, 2 * b, h + 0.1, z=z, cor=parede, b=0.06))
        nj = janelas_lado or max(1, int(round(2 * a / 1.7)))
        njy = max(1, int(round(2 * b / 1.7))) if janelas_lado is None else janelas_lado
        zj0 = z + (0.15 if k else h - alt_andar + 0.15)
        objs.append(janelas_bloco(2 * a, 2 * b, zj0, z + h - 0.25, 1, nj, njy, semente=semente + 7 * k,
                                  larg=0.62, alt=0.66, moldura=moldura, trelica=trelica, sal=0.05))
        for sx in (-1, 1):
            for sy in (-1, 1):
                objs.append(mb.cilindro(0.17, h + 0.05, x=sx * (a - 0.05), y=sy * (b - 0.05), z=z, cor=col, seg=8,
                                        bisel=0))
        zt = z + h
        a2, b2 = a * enc, b * enc
        if k < n - 1 or ultimo == "plano":
            ledge = 0.38 if varanda else 0.0
            t, ztop = telhado_pagode(a, b, zt, Au=a2 + ledge, Bu=b2 + ledge, beiral=beiral, cor=telha, cor2=telha2,
                                     aresta=aresta, forro=forro, h=max(0.75, (a + beiral - a2 - ledge) * 0.62))
            objs.append(t)
            if varanda and k < n - 1:
                objs.append(guarda_corpo(rect(a2 + ledge - 0.08, b2 + ledge - 0.08), ztop, alt=0.7, cor=col,
                                         corrimao=moldura, balaustres=1.2))
            if lanternas and k < lanternas:
                A, B = a + beiral, b + beiral
                for sx in (-1, 1):
                    for sy in (-1, 1):
                        objs.append(lanterna(sx * (A - 0.2), sy * (B - 0.2), zt + 0.05, r=r_lant, fio=0.1))
            z = ztop - 0.05
        else:
            hp = h_ponta or max(1.6, a * 1.15)
            objs.append(telhado_ponta(rect(a, b), zt, beiral=beiral * 0.8, cor=telha, cor2=telha2, aresta=aresta,
                                      forro=forro, pinaculo=pinaculo, h=hp))
            z = zt + hp
        a, b = a2, b2
    return objs, z, a


# ------------------------------------------------------------------------------------------- pequenos pagodes
def _pagode_pequeno(cat, id_, rotulo, parede, telha, telha2, col, semente, moldura="ouro", base="concreto"):
    mb.limpa()
    it = mb.Item(id_)
    zb = 0.35
    it.add(base_pedra(8.2, 8.0, zb, cor=base, degraus_frente=2, larg_degrau=2.6))
    objs, ztop, _ = torre_pagode(4, 2.9, z0=zb, enc=0.84, alt_andar=2.7, alt_primeiro=3.4, parede=parede, telha=telha,
                                 telha2=telha2, col=col, trelica=col, moldura=moldura, semente=semente, beiral=0.95,
                                 aresta=moldura)
    it.add(objs)
    it.add(porta(0, -2.9, larg=1.4, alt=2.3, z=zb, vidro=False, folha=col, moldura=moldura))
    it.add(lanterna(-1.25, -3.55, zb + 3.4 + 0.02, fio=0.12, r=0.3), lanterna(1.25, -3.55, zb + 3.4 + 0.02, fio=0.12,
                                                                             r=0.3))
    exporta(cat, it, rotulo, "pagode_pequeno", andares=4, tags=["pagode", "pequeno"],
            colisao=[((0, 0, 0), (8.2, 8.0, zb)), ((0, 0, zb), (5.8, 5.8, ztop - zb))])


@peca("pagode_pequeno_roxo")
def _p1(cat):
    _pagode_pequeno(cat, "pagode_pequeno_roxo", "Pagode pequeno (roxo)", "lilas", "roxo", "roxo_escuro", "roxo_escuro", 3)


@peca("pagode_pequeno_laranja")
def _p2(cat):
    _pagode_pequeno(cat, "pagode_pequeno_laranja", "Pagode pequeno (laranja)", "azul_medio", "laranja",
                    "laranja_escuro", "azul_escuro", 5, moldura="amarelo")


def torre_pagode_poli(nl, n, r, z0=0.0, enc=0.84, alturas=None, alt_andar=2.7, parede="vermelho", telha="azul",
                      telha2="azul_medio", col="vermelho_escuro", moldura="ouro", faixa=None, semente=1, beiral=1.0,
                      lanternas=1, r_lant=0.28, h_ponta=None, varanda=True, colunas=True, varandas_ate=99):
    """Pagode de base poligonal (hexágono, octógono): n andares de nl lados, raio r na base encolhendo 'enc'. O lado
    da frente (−Y) do térreo fica sem janela (a porta vai ali). Devolve (objetos, z do topo)."""
    objs = []
    z = z0
    alturas = alturas or [alt_andar] * n
    frente = nl - 1
    for k, h in enumerate(alturas):
        P = poli_reg(nl, r)
        objs.append(mb.extrudado(P, h + 0.1, z=z, cor=parede, bisel=0.06, seg=1))
        if faixa:
            objs.append(mb.extrudado(poli_reg(nl, r + 0.04), 0.35, z=z + 0.05, cor=faixa, bisel=0.03, seg=1))
        lado = 2 * r * math.sin(math.pi / nl)
        objs.append(janelas_poligono(P, z + (h - alt_andar if k == 0 else 0) + 0.45, z + h - 0.25, 1,
                                     larg_cel=max(1.2, lado / max(1, round((lado - 0.6) / 1.5))), margem=0.3,
                                     semente=semente + k, larg=0.7, alt=0.7, moldura=moldura, trelica=col, sal=0.05,
                                     pular_lados=(frente,) if k == 0 else ()))
        if colunas:
            for (px, py) in P:
                objs.append(mb.cilindro(0.16, h + 0.05, x=px, y=py, z=z, cor=col, seg=8, bisel=0))
        zt = z + h
        r2 = r * enc
        if k < n - 1:
            R0 = r + beiral * 1.15
            vk = varanda and k < varandas_ate
            R1 = r2 + (0.35 if vk else 0.0)
            hh = max(0.8, (R0 - R1) * 0.55)
            s_w = min(0.95, (R0 - r * 0.95) / (R0 - R1) + 0.05)
            objs.append(telhado(poli_reg(nl, R0), poli_reg(nl, R1), hh, z=zt - 0.05, cor=telha, cor2=telha2,
                                aresta=moldura, s_parede=s_w, aneis=4, esp=0.22))
            if vk:
                objs.append(guarda_corpo(poli_reg(nl, R1 - 0.08), zt - 0.05 + hh, alt=0.7, cor=col, corrimao=moldura,
                                         balaustres=1.4))
            if k < lanternas:
                for (px, py) in poli_reg(nl, R0):
                    d = V((px, py)).normalized()
                    objs.append(lanterna(px - d.x * 0.3, py - d.y * 0.3, zt + 0.15, r=r_lant, fio=0.08))
            z = zt - 0.05 + hh - 0.05
        else:
            hp = h_ponta or max(2.0, r * 0.9)
            objs.append(telhado_ponta(P, zt, beiral=beiral * 0.9, cor=telha, cor2=telha2, aresta=moldura, h=hp,
                                      pinaculo=moldura if moldura in ("ouro", "ouro_escuro", "latao") else "ouro"))
            z = zt + hp + max(0.7, r * 0.3) * 1.5
        r = r2
    return objs, z


def _pagode_hex(cat, id_, rotulo, parede, telha, telha2, col, moldura, semente, faixa="magenta"):
    """Pavilhão-pagode hexagonal de 3 andares (telhados de seis pontas)."""
    mb.limpa()
    it = mb.Item(id_)
    zb = 0.35
    it.add(mb.extrudado(poli_reg(6, 4.6), zb, cor="concreto", bisel=0.06, seg=2))
    it.add(bx(2.4, 0.7, zb * 0.55, y=-4.1, cor="concreto", b=0.04))
    objs, ztop = torre_pagode_poli(6, 3, 3.1, z0=zb, enc=0.82, alturas=(3.6, 2.8, 2.6), alt_andar=2.6, parede=parede,
                                   telha=telha, telha2=telha2, col=col, moldura=moldura, faixa=faixa, semente=semente,
                                   beiral=1.0, h_ponta=2.6)
    it.add(objs)
    it.add(porta(0, -3.1 * math.cos(math.pi / 6), larg=1.4, alt=2.4, z=zb, vidro=False, folha=col, moldura=moldura))
    exporta(cat, it, rotulo, "pagode_hexagonal", andares=3, tags=["pagode", "pequeno", "hexagonal"],
            colisao=[((0, 0, 0), (8.0, 8.0, zb)), ((0, 0, zb), (5.6, 5.6, ztop - zb))])


@peca("pagode_hexagonal_azul")
def _p3(cat):
    _pagode_hex(cat, "pagode_hexagonal_azul", "Pagode hexagonal (azul)", "rosa", "azul", "azul_medio", "azul_escuro",
                "ouro", 21, faixa="turquesa")


@peca("pagode_hexagonal_verde")
def _p4(cat):
    _pagode_hex(cat, "pagode_hexagonal_verde", "Pagode hexagonal (verde)", "madeira_mel", "verde_medio", "verde_escuro",
                "madeira_escura", "ouro", 27, faixa="vermelho")


# ------------------------------------------------------------------------------------------- pagodes altos
def _pagode_alto(cat, id_, rotulo, n, Aw, enc, parede, telha, telha2, col, semente, alt_andar=3.0):
    mb.limpa()
    it = mb.Item(id_)
    zb = 0.45
    lb = 2 * (Aw + 1.4)
    it.add(base_pedra(lb, lb - 0.4, zb, degraus_frente=2, larg_degrau=3.4))
    objs, ztop, _ = torre_pagode(n, Aw, z0=zb, enc=enc, alt_andar=alt_andar, alt_primeiro=TERREO, parede=parede,
                                 telha=telha, telha2=telha2, aresta="ouro", col=col, semente=semente, beiral=1.0,
                                 lanternas=1, r_lant=0.4, h_ponta=max(2.2, Aw * enc ** (n - 1) * 1.5))
    it.add(objs)
    it.add(porta(0, -Aw, larg=1.8, alt=2.8, z=zb, vidro=False))
    it.add(letreiro("templo", 0, -Aw, zb + 3.2, alt=0.55))
    exporta(cat, it, rotulo, "pagode_alto", andares=n, tags=["pagode", "torre"],
            colisao=[((0, 0, 0), (lb, lb - 0.4, zb)), ((0, 0, zb), (2 * Aw, 2 * Aw, ztop - zb))])


@peca("pagode_alto_5_vermelho")
def _p5(cat):
    _pagode_alto(cat, "pagode_alto_5_vermelho", "Pagode alto de 5 andares (vermelho)", 5, 4.0, 0.86, "creme",
                 "vermelho", "vermelho_escuro", "vermelho_escuro", 31)


@peca("pagode_alto_7_jade")
def _p6(cat):
    _pagode_alto(cat, "pagode_alto_7_jade", "Pagode alto de 7 andares (jade)", 7, 4.3, 0.88, "vermelho", "turquesa",
                 "turquesa_escuro", "vermelho_escuro", 11)


@peca("pagode_octogonal_9_jade")
def _p7(cat):
    """Pagode alto octogonal de 9 andares, verde-jade com paredes vermelhas (a torre-agulha das referências)."""
    mb.limpa()
    it = mb.Item("pagode_octogonal_9_jade")
    zb = 0.5
    it.add(mb.extrudado(poli_reg(8, 6.2), zb, cor="concreto", bisel=0.06, seg=2))
    it.add(bx(3.4, 0.8, zb * 0.6, y=-5.95, cor="concreto", b=0.04))
    objs, ztop = torre_pagode_poli(8, 9, 4.4, z0=zb, enc=0.9, alturas=[TERREO] + [2.9] * 8, alt_andar=2.9,
                                   parede="vermelho", telha="verde_agua", telha2="verde_medio", col="vermelho_escuro",
                                   moldura="ouro", faixa="ouro", semente=41, beiral=1.0, lanternas=1, r_lant=0.36,
                                   h_ponta=3.4, colunas=False, varandas_ate=4)
    it.add(objs)
    yf = -4.4 * math.cos(math.pi / 8)
    it.add(porta(0, yf, larg=1.8, alt=2.8, z=zb, vidro=False))
    it.add(letreiro("templo", 0, yf, zb + 3.2, alt=0.5))
    exporta(cat, it, "Pagode octogonal de 9 andares (jade)", "pagode_octogonal", andares=9, tags=["pagode", "torre"],
            colisao=[((0, 0, 0), (12.0, 12.0, zb)), ((0, 0, zb), (8.4, 8.4, ztop - zb))])


# ------------------------------------------------------------------------------------------- prédio de vidro com coroa
def _vidro_coroa(cat, id_, rotulo, telha, telha2, aresta, corpo="azul", semente=51):
    """Prédio de vidro azul com um pavilhão vermelho no alto, coroado por um grande telhado de cumeeira."""
    mb.limpa()
    it = mb.Item(id_)
    L = 11.0
    it.add(bx(12.0, 12.0, TERREO + 0.1, cor="branco", b=0.14))
    it.add(frente_loja(0, -6.0, 7.6, 3.2, z=0.12, moldura="azul_escuro", semente=semente))
    it.add(janelas_bloco(12.0, 12.0, 0.9, 3.6, 1, 4, 4, semente=semente, frente=False, moldura="azul_escuro",
                         larg=0.7, alt=0.8))
    it.add(bx(9.0, 0.8, 0.28, y=-6.3, z=3.65, cor="branco", b=0.1))
    it.add(lanterna(-3.6, -6.35, 3.65, r=0.32, fio=0.15), lanterna(3.6, -6.35, 3.65, r=0.32, fio=0.15))
    n = 7
    zt = TERREO + n * ANDAR
    it.add(bx(L, L, n * ANDAR + 0.1, z=TERREO, cor=corpo, b=0.16))
    it.add(faixas_vidro(L, L, TERREO, n, ANDAR, colunas=(5, 5), moldura="azul_escuro", semente=semente))
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.add(bx(0.7, 0.7, n * ANDAR, x=sx * L / 2, y=sy * L / 2, z=TERREO, cor="branco", b=0.12))
    it.add(cornija(L, L, zt, alt=0.5, sal=0.3, cor="branco"))
    zp = zt + 0.5
    it.add(bx(8.0, 8.0, 3.5, z=zp, cor="vermelho", b=0.08))
    it.add(janelas_bloco(8.0, 8.0, zp + 0.5, zp + 3.0, 1, 4, 4, semente=semente + 9, moldura="ouro",
                         trelica="vermelho_escuro", larg=0.62, alt=0.8))
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.add(mb.cilindro(0.22, 3.5, x=sx * 3.95, y=sy * 3.95, z=zp, cor="vermelho_escuro", seg=8, bisel=0))
    it.add(guarda_corpo(rect(5.25, 5.25), zp, alt=0.9, cor="branco", corrimao="ouro", balaustres=1.5))
    it.add(telhado_cumeeira(4.0, 4.0, zp + 3.5, beiral=1.25, h=2.8, cor=telha, cor2=telha2, aresta=aresta,
                            cumeeira=aresta, forro="vermelho_escuro"))
    it.add(letreiro_bandeira("hotel_v", 4.2, -L / 2, TERREO + 1.2, 3.9))
    ztop = zp + 3.5 + 2.8 + 1.0
    exporta(cat, it, rotulo, "predio_vidro_coroa", andares=n + 2, tags=["predio", "vidro", "hotel"],
            colisao=[((0, 0, 0), (12, 12, TERREO)), ((0, 0, TERREO), (L + 0.6, L + 0.6, zt + 0.5 - TERREO)),
                     ((0, 0, zp), (11, 11, ztop - zp))])


@peca("predio_vidro_coroa_cinza")
def _d1a(cat):
    _vidro_coroa(cat, "predio_vidro_coroa_cinza", "Prédio de vidro com coroa de pagode (telha cinza-azul)",
                 "cinza_azulado", "azul_acinzentado", "ouro")


@peca("predio_vidro_coroa_jade")
def _d1b(cat):
    _vidro_coroa(cat, "predio_vidro_coroa_jade", "Prédio de vidro com coroa de pagode (telha jade)",
                 "turquesa", "turquesa_escuro", "ouro", corpo="azul_medio", semente=57)


# ------------------------------------------------------------------------------------------- edifício de vários beirais
def _beirais(cat, id_, rotulo, parede, terreo_cor, telha, telha2, placa, semente):
    """Edifício de 7 andares com beirais curvos entre os blocos e telhado duplo de cumeeira no alto."""
    mb.limpa()
    it = mb.Item(id_)
    Aw, Bw = 4.6, 4.0
    it.add(bx(2 * Aw, 2 * Bw, TERREO + 0.1, cor=terreo_cor, b=0.1))
    it.add(frente_loja(0, -Bw, 7.0, 3.1, z=0.1, moldura="vermelho_escuro", semente=semente))
    it.add(janelas_bloco(2 * Aw, 2 * Bw, 0.9, 3.6, 1, 4, 3, semente=semente, frente=False, moldura="branco",
                         larg=0.6, alt=0.75))
    it.add(letreiro(placa, 0, -Bw, 3.35, alt=0.62))
    it.add(saia(Aw, Bw, TERREO, beiral=0.7, h=0.6, cor=telha, cor2=telha2, aresta="ouro", borda=("mat", "luz")))
    for sx in (-1, 1):
        it.add(lanterna(sx * 3.4, -Bw - 0.55, TERREO - 0.05, r=0.36, fio=0.1))
    z = TERREO
    bloco_andares(it, 2 * Aw, 2 * Bw, z, 3, parede=parede, moldura="branco", semente=semente + 1, ares=3,
                  peitoril="branco", cornijas="branco")
    z += 3 * ANDAR
    it.add(saia(Aw, Bw, z, beiral=0.85, h=0.8, cor=telha, cor2=telha2, aresta="ouro"))
    bloco_andares(it, 2 * Aw, 2 * Bw, z, 2, parede=parede, moldura="branco", semente=semente + 2, ares=2,
                  peitoril="branco", cornijas="branco")
    z += 2 * ANDAR
    t, z2 = telhado_pagode(Aw, Bw, z, Au=Aw - 1.3, Bu=Bw - 1.3, beiral=0.85, h=1.25, cor=telha, cor2=telha2,
                           aresta="ouro")
    it.add(t)
    a2, b2 = Aw - 1.6, Bw - 1.6
    it.add(bx(2 * a2, 2 * b2, 2.4, z=z2 - 0.05, cor=parede, b=0.08))
    it.add(janelas_bloco(2 * a2, 2 * b2, z2 + 0.3, z2 + 2.1, 1, 3, 2, semente=semente + 3, moldura="ouro",
                         trelica="vermelho_escuro", larg=0.6, alt=0.8))
    it.add(telhado_cumeeira(a2, b2, z2 + 2.35, beiral=1.1, h=1.9, cor=telha, cor2=telha2, aresta="ouro"))
    ztop = z2 + 2.35 + 1.9 + 1.0
    exporta(cat, it, rotulo, "edificio_beirais", andares=7, tags=["predio", "beirais"],
            colisao=[((0, 0, 0), (2 * Aw + 1.6, 2 * Bw + 1.6, z)), ((0, 0, z), (2 * Aw, 2 * Bw, ztop - z))])


@peca("edificio_beirais_vermelho")
def _d2a(cat):
    _beirais(cat, "edificio_beirais_vermelho", "Edifício de vários beirais (vermelho)", "terracota_clara",
             "cinza_claro", "vermelho", "vermelho_escuro", "hotel", 61)


@peca("edificio_beirais_jade")
def _d2b(cat):
    _beirais(cat, "edificio_beirais_jade", "Edifício de vários beirais (jade)", "creme", "bege_escuro", "turquesa",
             "turquesa_escuro", "restaurante", 67)


# ------------------------------------------------------------------------------------------- torre de onda
def _perfil_torre(W, H, rt, rb=0.5, n=10):
    """Contorno (x, z) da torre: retângulo W × H com os cantos de cima bem redondos (raio rt), anti-horário."""
    pts = []
    for cx, cz, r, a0 in ((W / 2 - rb, rb, rb, -90), (W / 2 - rt, H - rt, rt, 0), (-W / 2 + rt, H - rt, rt, 90),
                          (-W / 2 + rb, rb, rb, 180)):
        for k in range(n + 1):
            a = math.radians(a0 + 90 * k / n)
            pts.append((cx + r * math.cos(a), cz + r * math.sin(a)))
    return pts


def _torre_onda(cat, id_, rotulo, corpo, borda, fenda, semente):
    """Torre curva branca e azul com o recorte ondulado (silhueta de pagode) no meio da fachada."""
    mb.limpa()
    it = mb.Item(id_)
    W, H, rt = 11.4, 42.0, 3.8
    D = 7.0
    perfil = _perfil_torre(W, H, rt)
    y_f = -D / 2  # face da frente das placas
    esp_placa = 1.0
    it.add(mb.extrudado(mb._ccw(perfil), D - esp_placa, y=y_f + esp_placa, cor=corpo, bisel=0.15, seg=2, plano="xz"))
    # páginas de trás (camadas brancas e claras, como as folhas de um livro)
    for k in range(3):
        g = 0.26 * (k + 1)
        pk = _perfil_torre(W + 2 * g, H + g, rt + g)
        it.add(mb.extrudado(mb._ccw(pk), 0.36, y=D / 2 - 0.1 + 0.42 * k, cor="branco" if k % 2 == 0 else borda,
                            bisel=0.1, seg=2, plano="xz"))
    # recorte ondulado: meia-largura da fenda por altura (cada "andar" da silhueta abre como um beiral)
    zs0, zs1, P = 0.0, H - 6.0, 4.6

    def onda(z):
        t = (z % P) / P
        return 0.95 + 1.25 * t ** 2.4

    def hw(z):
        if z > zs1 - 3.0:
            return max(0.0, onda(zs1 - 3.0) * (zs1 - z) / 3.0)
        return onda(z)

    nz = int((zs1 - 3.0) / 0.32)
    borda_pts = [(hw(zs0 + (zs1 - 3.0) * k / nz), zs0 + (zs1 - 3.0) * k / nz) for k in range(nz)]
    borda_pts += [(hw(zs1 - 3.0 + 3.0 * k / 6), zs1 - 3.0 + 3.0 * k / 6) for k in range(7)]
    arc_tr = [(W / 2 - rt + rt * math.cos(math.radians(a)), H - rt + rt * math.sin(math.radians(a)))
              for a in range(90, -1, -9)]
    rb = 0.5
    arc_br = [(W / 2 - rb + rb * math.cos(math.radians(a)), rb + rb * math.sin(math.radians(a)))
              for a in range(0, -91, -18)]
    dir_ = borda_pts + [(0.0, H)] + arc_tr + arc_br
    esq = [(-x, z) for (x, z) in dir_]
    for pts, nm in ((dir_, "placa_dir"), (esq, "placa_esq")):
        it.add(mb.extrudado(mb._ccw(pts), esp_placa, y=y_f, cor=borda, bisel=0.1, seg=1, plano="xz", nome=nm))
    # fundo da fenda: dourado, com faixas de vidro por andar
    it.add(bx(4.8, 0.1, zs1, y=y_f + esp_placa - 0.03, cor=fenda, b=0.03))
    m = Malha()
    rnd = random.Random(semente)
    for j in range(1, int((zs1 - 3.5) / ANDAR)):
        z0 = j * ANDAR + 0.6
        w = min(hw(z0), hw(z0 + 1.9)) - 0.25
        if w < 0.4:
            continue
        r = rnd.random()
        mat = "janela_apagada" if r < 0.4 else ("janela_fria" if r < 0.65 else "janela")
        ret_fachada(m, "y", y_f + esp_placa - 0.09, -1, -w, w, z0, z0 + 1.9, mat=mat)
    # janelas em faixas: placas da frente, laterais e fundo (até onde a fachada é reta)
    zr = H - rt - 0.5
    nand = int((zr - TERREO) / ANDAR)
    for j in range(nand):
        zb = TERREO + j * ANDAR + 0.55
        hv = 1.9
        wmax = max(hw(zb), hw(zb + hv), hw(zb + hv * 0.5)) + 0.35
        for sx in (-1, 1):
            u0, u1 = wmax, W / 2 - 0.5
            nc = max(1, int((u1 - u0) / 1.2))
            cw = (u1 - u0) / nc
            for i in range(nc):
                r = rnd.random()
                mat = "janela_apagada" if r < 0.4 else ("janela_fria" if r < 0.62 else "janela")
                a0, a1 = u0 + cw * i + 0.06, u0 + cw * (i + 1) - 0.06
                if sx < 0:
                    a0, a1 = -a1, -a0
                ret_fachada(m, "y", y_f - 0.012, -1, a0, a1, zb, zb + hv, mat=mat)
    it.add(m.objeto("vidros_fenda"))
    yy = y_f + esp_placa
    it.add(faixas_vidro(W, D - esp_placa, TERREO, nand, ANDAR, y=yy + (D - esp_placa) / 2, colunas=(8, 5),
                        moldura="azul_escuro", semente=semente + 3, faces=("+x", "-x")))
    it.add(janelas(("y", D / 2 - 0.1 + 0.42 * 2 + 0.36, 1), -W / 2 + 0.6, W / 2 - 0.6, TERREO, zr, 6, nand,
                   larg=0.8, alt=0.6, moldura="azul_escuro", semente=semente + 5))
    # entrada no pé da fenda e antena no alto
    it.add(porta(0, y_f + esp_placa - 0.05, larg=1.6, alt=2.8, z=0.0, moldura=fenda))
    it.add(bx(4.6, 1.6, 0.25, y=y_f - 0.6, z=3.4, cor="branco", b=0.08))
    it.add(mb.cilindro(0.12, 4.0, x=0, y=1.0, z=H - 0.2, cor="cinza_claro", seg=8, bisel=0.02))
    it.add(mb.esfera(0.25, x=0, y=1.0, z=H + 3.9, cor="vermelho", seg=8))
    exporta(cat, it, rotulo, "torre_onda", andares=nand + 1, tags=["predio", "torre", "arranha_ceu"],
            colisao=[((0, 0, 0), (W, D, H - rt)), ((0, 0.6, H - rt), (W - 2 * rt + 2.4, D + 1.2, rt))])


@peca("torre_onda_azul")
def _d3a(cat):
    _torre_onda(cat, "torre_onda_azul", "Torre curva com recorte ondulado (azul)", "azul", "azul_claro", "ouro", 71)


@peca("torre_onda_turquesa")
def _d3b(cat):
    _torre_onda(cat, "torre_onda_turquesa", "Torre curva com recorte ondulado (turquesa)", "turquesa_escuro",
                "turquesa_claro", "vermelho", 77)


# ------------------------------------------------------------------------------------------- prédio colorido de beirais
def _colorido(cat, id_, rotulo, base, parede, telha, telha2, moldura, bandeira, semente):
    """Prédio colorido de 5 andares: base de outra cor, beirais curvos a cada dois andares e telhado em ponta sobre
    um pavilhãozinho no alto."""
    mb.limpa()
    it = mb.Item(id_)
    A = 4.4
    it.add(bx(2 * A, 2 * A, TERREO + 0.1, cor=base, b=0.1))
    it.add(frente_loja(0, -A, 5.6, 3.1, z=0.1, moldura=moldura, semente=semente))
    it.add(janelas_bloco(2 * A, 2 * A, 0.9, 3.6, 1, 3, 3, semente=semente, frente=False, moldura=moldura, larg=0.6,
                         alt=0.75))
    it.add(toldo(0, -A - 0.12, 5.8, 3.55, prof=1.0, cores=(telha, "branco")))
    z = TERREO
    for k in range(2):
        it.add(saia(A, A, z, beiral=0.85, h=0.65, cor=telha, cor2=telha2, aresta="ouro",
                    borda=("mat", "luz") if k == 0 else None))
        bloco_andares(it, 2 * A, 2 * A, z, 2, parede=parede, moldura=moldura, semente=semente + k + 1, ares=2,
                      peitoril=moldura, cornijas=moldura, colunas=(3, 3))
        z += 2 * ANDAR
    t, z2 = telhado_pagode(A, A, z, Au=2.9, Bu=2.9, beiral=0.95, h=1.3, cor=telha, cor2=telha2, aresta="ouro")
    it.add(t)
    it.add(bx(5.2, 5.2, 2.4, z=z2 - 0.05, cor=parede, b=0.08))
    it.add(janelas_bloco(5.2, 5.2, z2 + 0.3, z2 + 2.1, 1, 2, 2, semente=semente + 5, moldura="ouro",
                         trelica=moldura, larg=0.6, alt=0.8))
    it.add(telhado_ponta(rect(2.6, 2.6), z2 + 2.35, beiral=0.9, h=2.6, cor=telha, cor2=telha2, aresta="ouro"))
    it.add(letreiro_bandeira(bandeira, A - 0.6, -A, TERREO + 0.6, 3.6))
    ztop = z2 + 2.35 + 2.6 + 1.2
    exporta(cat, it, rotulo, "predio_colorido_beirais", andares=6, tags=["predio", "beirais", "loja"],
            colisao=[((0, 0, 0), (2 * A, 2 * A, z)), ((0, 0, z), (2 * A + 1.6, 2 * A + 1.6, 1.3)),
                     ((0, 0, z2), (6.2, 6.2, ztop - z2))])


@peca("predio_colorido_beirais_laranja")
def _d5a(cat):
    _colorido(cat, "predio_colorido_beirais_laranja", "Prédio colorido de beirais (laranja)", "roxo", "vermelho",
              "laranja", "laranja_escuro", "amarelo", "flores_v", 81)


@peca("predio_colorido_beirais_jade")
def _d5b(cat):
    _colorido(cat, "predio_colorido_beirais_jade", "Prédio colorido de beirais (jade)", "azul_medio", "amarelo_escuro",
              "turquesa", "turquesa_escuro", "vermelho_escuro", "ervas_v", 87)


# ------------------------------------------------------------------------------------------- torre com pagode em cima
@peca("torre_pagode_sobre_predio")
def _d6(cat):
    """Torre de 11 andares (amarela embaixo, vermelha em cima, com varandas verdes) coroada por um pagode azul de três
    andares e quatro quiosques de canto."""
    mb.limpa()
    it = mb.Item("torre_pagode_sobre_predio")
    A = 5.2
    sem = 91
    it.add(bx(2 * A, 2 * A, TERREO + 0.1, cor="amarelo_escuro", b=0.12))
    it.add(frente_loja(0, -A, 7.0, 3.1, z=0.1, moldura="vermelho_escuro", semente=sem))
    it.add(janelas_bloco(2 * A, 2 * A, 0.9, 3.6, 1, 4, 4, semente=sem, frente=False, moldura="branco", larg=0.6,
                         alt=0.75))
    it.add(bx(8.0, 1.2, 0.28, y=-A - 0.5, z=3.55, cor="verde", b=0.1))
    z = TERREO
    bloco_andares(it, 2 * A, 2 * A, z, 3, parede="amarelo_escuro", moldura="branco", semente=sem + 1, ares=3,
                  cornijas="vermelho")
    z += 3 * ANDAR
    bloco_andares(it, 2 * A, 2 * A, z, 7, parede="vermelho", moldura="branco", semente=sem + 2, ares=5,
                  cornijas="ouro")
    m = Malha()
    for k in range(10):  # varandas verdes na frente e no fundo
        zz = TERREO + k * ANDAR - 0.1
        for sy in (-1, 1):
            m.caixa(-A + 0.5, A - 0.5, sy * A - 0.45 if sy < 0 else A - 0.02, -A + 0.02 if sy < 0 else A + 0.45,
                    zz, zz + 0.22, "verde")
            m.caixa(-A + 0.5, A - 0.5, sy * A - 0.45 if sy < 0 else A + 0.37, sy * A - 0.37 if sy < 0 else A + 0.45,
                    zz + 0.22, zz + 0.95, "verde_claro")
    it.add(m.objeto("varandas"))
    z += 7 * ANDAR
    it.add(cornija(2 * A, 2 * A, z, alt=0.5, sal=0.3, cor="ouro"))
    it.add(guarda_corpo(rect(A + 0.15, A + 0.15), z + 0.5, alt=1.0, cor="vermelho_escuro", corrimao="ouro",
                        balaustres=1.6))
    for sx in (-1, 0, 1):
        it.add(lanterna(sx * 3.4, -A - 0.25, z + 0.02, r=0.42, fio=0.2))
    zt = z + 0.5
    for sx in (-1, 1):  # quiosques de canto
        for sy in (-1, 1):
            cx_, cy_ = sx * (A - 1.1), sy * (A - 1.1)
            it.add(bx(1.7, 1.7, 2.0, x=cx_, y=cy_, z=zt, cor="vermelho", b=0.06))
            it.add(telhado_ponta(rect(0.85, 0.85, cx_, cy_), zt + 2.0, beiral=0.5, h=1.3, cor="azul", cor2="azul_medio",
                                 aresta="ouro", pinaculo="ouro"))
    objs, ztop, _ = torre_pagode(3, 2.7, z0=zt, enc=0.84, alt_andar=2.6, alt_primeiro=3.0, parede="vermelho",
                                 telha="azul", telha2="azul_medio", aresta="ouro", col="vermelho_escuro", semente=sem + 5,
                                 beiral=0.9, varanda=False, h_ponta=3.0)
    it.add(objs)
    it.add(letreiro_bandeira("loja_v", -A + 0.7, -A, TERREO + 0.8, 4.2))
    exporta(cat, it, "Torre com pagode azul no alto", "torre_pagode_sobre_predio", andares=11,
            tags=["predio", "torre", "pagode", "arranha_ceu"],
            colisao=[((0, 0, 0), (2 * A + 0.9, 2 * A + 0.9, zt)), ((0, 0, zt), (7.2, 7.2, ztop - zt))])


# ------------------------------------------------------------------------------------------- torre de vidro + pagode jade
@peca("torre_vidro_pagode_jade")
def _d7(cat):
    """Pódio de vidro azul de quatro andares com um grande telhado cinza-azul e um pagode jade de cinco andares em
    cima."""
    mb.limpa()
    it = mb.Item("torre_vidro_pagode_jade")
    A = 5.5
    sem = 101
    it.add(bx(2 * A, 2 * A, TERREO + 0.1, cor="branco", b=0.12))
    it.add(frente_loja(0, -A, 8.0, 3.1, z=0.1, moldura="azul_escuro", semente=sem))
    it.add(janelas_bloco(2 * A, 2 * A, 0.9, 3.6, 1, 4, 4, semente=sem, frente=False, moldura="azul_escuro", larg=0.7,
                         alt=0.8))
    n = 3
    it.add(bx(2 * A - 0.4, 2 * A - 0.4, n * ANDAR + 0.1, z=TERREO, cor="azul", b=0.14))
    it.add(faixas_vidro(2 * A - 0.4, 2 * A - 0.4, TERREO, n, ANDAR, colunas=(6, 6), moldura="branco", semente=sem + 1))
    z = TERREO + n * ANDAR
    it.add(cornija(2 * A, 2 * A, z, alt=0.4, sal=0.1, cor="branco"))
    t, z2 = telhado_pagode(A, A, z + 0.4, Au=3.55, Bu=3.55, beiral=0.25, h=2.0, ergue=0.7, cor="cinza_azulado",
                           cor2="azul_acinzentado", aresta="ouro", forro="branco")
    it.add(t)
    for sx in (-1, 1):  # enfeites dourados em ⌐ nas pontas do telhado grande
        pts = [(sx * 2.2, -A + 0.9, z + 1.7), (sx * 2.2, -A + 0.9, z + 2.9), (sx * 3.4, -A + 0.9, z + 2.9),
               (sx * 3.4, -A + 0.9, z + 2.5)]
        it.add(rolo(mb._arredonda_cantos(pts, 0.25, 3), 0.16, cor="ouro", nome="enfeite"))
    objs, ztop, _ = torre_pagode(5, 3.2, z0=z2 - 0.05, enc=0.85, alt_andar=2.6, parede="vermelho", telha="turquesa",
                                 telha2="turquesa_escuro", aresta="ouro", col="vermelho_escuro", semente=sem + 3,
                                 beiral=0.85, h_ponta=3.0)
    it.add(objs)
    it.add(letreiro("restaurante", 0, -A, 3.35, alt=0.6))
    exporta(cat, it, "Pódio de vidro com pagode jade", "torre_vidro_pagode", andares=n + 6,
            tags=["predio", "vidro", "pagode", "torre"],
            colisao=[((0, 0, 0), (2 * A, 2 * A, z + 0.4)), ((0, 0, z + 0.4), (2 * A + 0.9, 2 * A + 0.9, 2.0)),
                     ((0, 0, z2), (6.6, 6.6, ztop - z2))])


# ------------------------------------------------------------------------------------------- prédio estreito com pagode
def _estreito(cat, id_, rotulo, cor_a, cor_b, telha, telha2, faixa, semente):
    """Prédio estreito de 6 andares, em faixas de duas cores por andar, com ar-condicionado na fachada e dois
    telhados de pagode no alto."""
    mb.limpa()
    it = mb.Item(id_)
    A = 3.6
    it.add(bx(2 * A, 2 * A, TERREO + 0.1, cor="concreto", b=0.1))
    it.add(frente_loja(0, -A, 4.6, 3.1, z=0.1, moldura=faixa, semente=semente))
    it.add(janelas_bloco(2 * A, 2 * A, 0.9, 3.6, 1, 2, 2, semente=semente, frente=False, moldura="branco", larg=0.6,
                         alt=0.75))
    z = TERREO
    for k in range(5):
        bloco_andares(it, 2 * A, 2 * A, z, 1, parede=cor_a if k % 2 == 0 else cor_b, moldura="branco",
                      semente=semente + k, ares=1, cornijas=None, colunas=(2, 2), peitoril="branco")
        it.add(bx(2 * A + 0.16, 2 * A + 0.16, 0.18, z=z + ANDAR - 0.09, cor="branco", b=0.05, seg=1))
        z += ANDAR
    it.add(bx(0.8, 0.3, 5 * ANDAR, x=A - 0.75, y=-A - 0.12, z=TERREO, cor=faixa, b=0.08))  # pilastra colorida
    t, z2 = telhado_pagode(A, A, z, Au=2.5, Bu=2.5, beiral=1.0, h=1.4, cor=telha, cor2=telha2, aresta="ouro")
    it.add(t)
    it.add(bx(4.4, 4.4, 2.6, z=z2 - 0.05, cor="vermelho", b=0.08))
    it.add(janelas_bloco(4.4, 4.4, z2 + 0.35, z2 + 2.3, 1, 2, 2, semente=semente + 9, moldura="ouro",
                         trelica="vermelho_escuro", larg=0.62, alt=0.8))
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.add(mb.cilindro(0.15, 2.6, x=sx * 2.2, y=sy * 2.2, z=z2 - 0.05, cor="vermelho_escuro", seg=8, bisel=0))
    it.add(telhado_ponta(rect(2.2, 2.2), z2 + 2.55, beiral=0.95, h=2.4, cor=telha, cor2=telha2, aresta="ouro"))
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.add(lanterna(sx * (A + 0.75), sy * (A + 0.75), z + 0.05, r=0.3, fio=0.1))
    ztop = z2 + 2.55 + 2.4 + 1.1
    exporta(cat, it, rotulo, "predio_estreito_pagode", andares=6, tags=["predio", "estreito", "pagode"],
            colisao=[((0, 0, 0), (2 * A, 2 * A, z)), ((0, 0, z), (2 * A + 2, 2 * A + 2, 1.4)),
                     ((0, 0, z2), (5.6, 5.6, ztop - z2))])


@peca("predio_estreito_pagode_verde")
def _d8a(cat):
    _estreito(cat, "predio_estreito_pagode_verde", "Prédio estreito com pagode (verde)", "verde", "verde_claro",
              "turquesa", "turquesa_escuro", "vermelho", 111)


@peca("predio_estreito_pagode_azul")
def _d8b(cat):
    _estreito(cat, "predio_estreito_pagode_azul", "Prédio estreito com pagode (azul)", "azul_celeste", "azul_claro",
              "azul_medio", "azul_escuro", "laranja", 117)


# ------------------------------------------------------------------------------------------- templo comprido
def _templo(cat, id_, rotulo, telha, telha2, cumeeira, semente):
    """Templo comprido (2 × 1 quadras): pódio de pedra com escadaria, varanda de colunas vermelhas na frente e um
    grande telhado curvo de cumeeira."""
    mb.limpa()
    it = mb.Item(id_)
    zb = 0.6
    Aw, Bw = 10.0, 3.3
    it.add(bx(25.0, 11.6, zb, cor="concreto", b=0.08))
    for k in range(3):
        hh = zb * (3 - k) / 4
        it.add(bx(6.0, 0.36, hh, y=-5.8 - 0.36 * (k + 0.5) + 0.02, cor="concreto", b=0.04))
    h = 4.6
    it.add(bx(2 * Aw, 2 * Bw, h + 0.1, z=zb, cor="vermelho", b=0.08))
    it.add(bx(2 * Aw + 0.1, 2 * Bw + 0.1, 0.5, z=zb, cor="vermelho_escuro", b=0.05))
    m = Malha()
    janelas(("y", -Bw, -1), -Aw + 0.6, Aw - 0.6, zb + 1.1, zb + h - 0.6, 7, 1, larg=0.62, alt=0.85, moldura="ouro",
            trelica="vermelho_escuro", semente=semente, pular=((3, 0),), m=m)
    janelas(("y", Bw, 1), -Aw + 0.6, Aw - 0.6, zb + 1.1, zb + h - 0.6, 7, 1, larg=0.62, alt=0.85, moldura="ouro",
            trelica="vermelho_escuro", semente=semente + 1, m=m)
    for sx in (-1, 1):
        janelas(("x", sx * Aw, sx), -Bw + 0.5, Bw - 0.5, zb + 1.1, zb + h - 0.6, 2, 1, larg=0.62, alt=0.85,
                moldura="ouro", trelica="vermelho_escuro", semente=semente + 2 + sx, m=m)
    it.add(m.objeto("janelas"))
    it.add(porta(0, -Bw, larg=2.4, alt=3.2, z=zb, vidro=False))
    for sx in (-1, 1):
        it.add(porta(sx * 8.6, -Bw, larg=1.3, alt=2.6, z=zb, vidro=False))
    yc = -Bw - 1.45
    for k in range(8):  # colunata
        it.add(coluna(-8.75 + 2.5 * k, yc, zb, h, r=0.24, cor="vermelho"))
    it.add(bx(2 * Aw + 0.6, 0.4, 0.55, y=yc, z=zb + h - 0.5, cor="vermelho_escuro", b=0.06))
    it.add(bx(2 * Aw + 0.6, 0.44, 0.16, y=yc, z=zb + h - 0.26, cor="ouro", b=0.04))
    for k in (-3, -1, 1, 3):
        it.add(lanterna(k * 2.5 + (1.25 if k < 0 else -1.25), yc, zb + h - 0.5, r=0.38, fio=0.15))
    it.add(letreiro("templo", 0, -Bw, zb + 3.45, alt=0.7))
    # incensário de bronze na frente da escada
    for sx in (-1, 1):
        it.add(mb.torno([(0, 0), (0.5, 0), (0.55, 0.1), (0.35, 0.3), (0.62, 0.55), (0.7, 0.95), (0.62, 1.05),
                         (0.0, 1.0)], x=sx * 4.6, y=-5.0, z=zb, cor="ouro_escuro", seg=14))
    it.add(telhado_cumeeira(Aw, Bw, zb + h, beiral=1.85, h=3.6, cor=telha, cor2=telha2, aresta=cumeeira,
                            cumeeira=cumeeira, esp=0.3))
    ztop = zb + h + 3.6 + 1.0
    exporta(cat, it, rotulo, "templo_comprido", lote=(2, 1), andares=1, tags=["templo", "baixo"],
            colisao=[((0, 0, 0), (25.0, 11.6, zb)), ((0, 0, zb), (2 * Aw, 2 * Bw, h)),
                     ((0, 0, zb + h), (2 * Aw + 4, 2 * Bw + 4, ztop - zb - h))])


@peca("templo_comprido_cinza")
def _d9a(cat):
    _templo(cat, "templo_comprido_cinza", "Templo comprido (telha cinza)", "cinza_azulado", "azul_acinzentado",
            "cinza_medio", 121)


@peca("templo_comprido_verde")
def _d9b(cat):
    _templo(cat, "templo_comprido_verde", "Templo comprido (telha verde)", "verde_medio", "verde_escuro", "ouro", 127)


# ------------------------------------------------------------------------------------------- restaurantes
@peca("restaurante_sushi")
def _d10(cat):
    """Restaurante de sushi de dois andares com beirais jade e um prato gigante de sushi no terraço."""
    mb.limpa()
    it = mb.Item("restaurante_sushi")
    Aw, Bw = 4.6, 3.8
    sem = 131
    it.add(bx(2 * Aw, 2 * Bw, TERREO + 0.1, cor="madeira_escura", b=0.1))
    it.add(frente_loja(0, -Bw, 6.6, 3.0, z=0.1, moldura="vermelho", semente=sem))
    it.add(janelas_bloco(2 * Aw, 2 * Bw, 0.9, 3.5, 1, 4, 3, semente=sem, frente=False, moldura="vermelho", larg=0.6,
                         alt=0.75, trelica="vermelho"))
    it.add(letreiro("sushi", 0, -Bw, 3.3, alt=0.7))
    it.add(saia(Aw, Bw, TERREO, beiral=0.9, h=0.7, cor="turquesa", cor2="turquesa_escuro", aresta="ouro",
                borda=("mat", "luz")))
    z = TERREO
    it.add(bx(2 * Aw, 2 * Bw, 3.2, z=z, cor="creme", b=0.08))
    it.add(janelas_bloco(2 * Aw, 2 * Bw, z + 0.4, z + 2.8, 1, 4, 3, semente=sem + 1, moldura="vermelho_escuro",
                         trelica="vermelho_escuro", larg=0.62, alt=0.85))
    z += 3.2
    it.add(saia(Aw, Bw, z, beiral=0.85, h=0.6, cor="turquesa", cor2="turquesa_escuro", aresta="ouro"))
    # o terraço fica acima do topo do beiral (que entra na parede até z + 0,55)
    it.add(bx(2 * Aw - 0.6, 2 * Bw - 0.6, 0.8, z=z - 0.2, cor="creme", b=0.05))
    it.add(terraco(2 * Aw - 0.6, 2 * Bw - 0.6, z + 0.6, alt=0.8, piso="terracota_clara", parapeito="vermelho_escuro"))
    zr = z + 0.72
    for k in range(4):
        it.add(lanterna(-3.6 + 2.4 * k, -Bw - 0.75, TERREO + 0.1, r=0.34, fio=0.1))
    # prato gigante de sushi
    it.add(bx(6.4, 3.4, 0.3, z=zr + 0.25, cor="grafite_escuro", b=0.14))
    it.add(bx(5.4, 2.4, 0.26, z=zr, cor="grafite", b=0.08))
    for k, (x, y) in enumerate(((-2.0, -0.4), (-0.6, 0.6), (0.8, -0.5))):
        it.add(mb.cilindro(0.75, 0.9, x=x, y=y, z=zr + 0.55, cor="grafite_escuro", seg=16, bisel=0.06))
        it.add(mb.cilindro(0.64, 0.92, x=x, y=y, z=zr + 0.56, cor="branco", seg=16, bisel=0.05))
        it.add(mb.cilindro(0.28, 0.94, x=x, y=y, z=zr + 0.57, cor="salmao" if k % 2 == 0 else "verde_claro", seg=10,
                           bisel=0.03))
    for x in (2.0, 2.0):
        pass
    it.add(mb.superelipsoide(1.3, 0.75, 0.5, x=2.15, y=0.55, z=zr + 0.55, cor="branco", e=0.6, nu=14, nv=8))
    it.add(mb.superelipsoide(1.45, 0.9, 0.28, x=2.15, y=0.55, z=zr + 0.95, cor="salmao", e=0.45, nu=14, nv=8))
    for dx in (-0.35, 0.0, 0.35):
        it.add(bx0(0.08, 0.92, 0.04, x=2.15 + dx, y=0.55, z=zr + 1.2, cor="branco"))
    for dy in (-0.15, 0.15):
        pau = mb.cilindro(0.06, 4.6, x=0, y=0, z=0, cor="madeira_clara", seg=6, bisel=0, eixo="x", r2=0.04)
        mb.transforma(pau, rot=("Z", 12))
        mb.transforma(pau, loc=(0.6, 1.25 + dy, zr + 1.0))
        it.add(pau)
    it.add(letreiro_bandeira("sushi_v", Aw - 0.6, -Bw, TERREO + 0.4, 2.4))
    ztop = zr + 1.6
    exporta(cat, it, "Restaurante de sushi", "restaurante_sushi", andares=2, tags=["restaurante", "baixo", "loja"],
            colisao=[((0, 0, 0), (2 * Aw, 2 * Bw, zr)), ((0, 0, zr), (6.4, 3.4, ztop - zr))])


@peca("restaurante_macarrao")
def _d11(cat):
    """Casa de macarrão de um andar alto com uma tigela gigante no telhado."""
    mb.limpa()
    it = mb.Item("restaurante_macarrao")
    A = 4.6
    sem = 141
    h = 4.6
    it.add(bx(2 * A, 2 * A, h + 0.1, cor="vermelho", b=0.1))
    it.add(frente_loja(0, -A, 6.4, 3.0, z=0.1, moldura="verde_floresta", semente=sem))
    it.add(janelas_bloco(2 * A, 2 * A, 0.9, 3.6, 1, 3, 3, semente=sem, frente=False, moldura="verde_floresta",
                         larg=0.62, alt=0.75, trelica="ouro"))
    it.add(letreiro("macarrao", 0, -A, 3.4, larg=5.2))
    it.add(saia(A, A, h, beiral=0.9, h=0.7, cor="turquesa", cor2="turquesa_escuro", aresta="ouro",
                borda=("mat", "luz")))
    it.add(terraco(2 * A - 0.6, 2 * A - 0.6, h + 0.7, alt=0.8, piso="terracota_clara", parapeito="creme"))
    it.add(bx(2 * A - 0.6, 2 * A - 0.6, 0.75, z=h, cor="creme", b=0.05))
    zr = h + 0.82
    for k in range(3):
        it.add(lanterna(-3.0 + 3.0 * k, -A - 0.75, h + 0.05, r=0.36, fio=0.1))
    # tigela gigante
    it.add(mb.torno([(0, 0), (1.1, 0), (1.15, 0.18), (1.0, 0.25), (1.6, 0.6), (2.3, 1.35), (2.55, 1.9), (2.6, 2.05),
                     (2.45, 2.05), (2.3, 1.75), (0, 1.75)], z=zr, cor="branco", seg=24, angulo=50))
    it.add(mb.torno([(2.27, 1.35), (2.43, 1.55), (2.53, 1.82), (2.39, 1.82), (2.15, 1.35)], z=zr, cor="vermelho",
                    seg=24, angulo=60))
    it.add(mb.cilindro(2.36, 0.08, z=zr + 1.78, cor="laranja_claro", seg=24, bisel=0))
    rnd = random.Random(sem)
    for k in range(6):  # macarrão
        a = rnd.random() * math.pi
        pts = []
        for t in range(9):
            u = -1.7 + 3.4 * t / 8
            pts.append((u * math.cos(a) - 0.25 * math.sin(t * 1.3) * math.sin(a),
                        u * math.sin(a) + 0.25 * math.sin(t * 1.3) * math.cos(a), zr + 1.9 + 0.05 * math.sin(t * 2.1)))
        it.add(rolo(pts, 0.06, cor="amarelo", lados=5, nome="macarrao"))
    for (x, y) in ((-0.8, 0.6), (0.9, -0.5)):  # ovos
        it.add(mb.esfera(0.42, x=x, y=y, z=zr + 1.88, esc=(1, 0.75, 0.45), seg=12, cor="branco"))
        it.add(mb.esfera(0.2, x=x, y=y, z=zr + 2.0, esc=(1, 1, 0.5), seg=10, cor="amarelo_escuro"))
    for k in range(5):
        it.add(mb.cilindro(0.11, 0.06, x=-0.4 + 0.3 * k, y=-1.1 + 0.15 * k, z=zr + 1.9, cor="verde_claro", seg=8,
                           bisel=0))
    for dy in (-0.15, 0.15):
        pau = mb.cilindro(0.07, 5.0, x=0, y=0, z=0, cor="madeira_clara", seg=6, bisel=0, eixo="x", r2=0.05)
        mb.transforma(pau, rot=[("Z", -30), ("Y", -28)])
        mb.transforma(pau, loc=(0.9, 0.6 + dy, zr + 2.9))
        it.add(pau)
    ztop = zr + 4.3
    exporta(cat, it, "Casa de macarrão", "restaurante_macarrao", andares=1, tags=["restaurante", "baixo", "loja"],
            colisao=[((0, 0, 0), (2 * A, 2 * A, zr)), ((0, 0, zr), (5.2, 5.2, 2.1))])


@peca("casa_de_cha")
def _d12(cat):
    """Casa de chá de dois andares: porta-lua, beirais jade com lanternas e uma xícara gigante no alto."""
    mb.limpa()
    it = mb.Item("casa_de_cha")
    A = 3.9
    zb = 0.3
    sem = 151
    it.add(base_pedra(2 * A + 1.4, 2 * A + 1.0, zb, degraus_frente=1, larg_degrau=2.8))
    h = 3.7
    it.add(bx(2 * A, 2 * A, h + 0.1, z=zb, cor="creme", b=0.08))
    it.add(porta_lua(0, -A, r=1.2, z=zb))
    m = Malha()
    janelas(("y", -A, -1), -A + 0.3, A - 0.3, zb + 0.9, zb + 3.0, 3, 1, larg=0.55, alt=0.8, moldura="verde_floresta",
            trelica="ouro", semente=sem, pular=((1, 0),), m=m)
    for fc in (("y", A, 1), ("x", -A, -1), ("x", A, 1)):
        janelas(fc, -A + 0.4, A - 0.4, zb + 0.9, zb + 3.0, 3, 1, larg=0.55, alt=0.8, moldura="verde_floresta",
                trelica="ouro", semente=sem + len(fc[0]) + int(fc[1]), m=m)
    it.add(m.objeto("janelas"))
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.add(coluna(sx * (A - 0.05), sy * (A - 0.05), zb, h, r=0.22, cor="vermelho"))
    it.add(letreiro("cha", 0, -A, zb + 2.75, alt=0.62))
    z = zb + h
    it.add(saia(A, A, z, beiral=1.1, h=0.85, cor="turquesa", cor2="turquesa_escuro", aresta="ouro"))
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.add(lanterna(sx * (A + 0.85), sy * (A + 0.85), z + 0.1, r=0.34, fio=0.1))
    a2 = 3.0
    it.add(bx(2 * a2, 2 * a2, 2.8, z=z, cor="creme", b=0.08))
    it.add(janelas_bloco(2 * a2, 2 * a2, z + 0.5, z + 2.5, 1, 3, 3, semente=sem + 7, moldura="vermelho_escuro",
                         trelica="vermelho_escuro", larg=0.6, alt=0.8))
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.add(mb.cilindro(0.16, 2.8, x=sx * (a2 - 0.05), y=sy * (a2 - 0.05), z=z, cor="vermelho", seg=8, bisel=0))
    t, z2 = telhado_pagode(a2, a2, z + 2.8, Au=2.0, Bu=2.0, beiral=1.0, h=1.2, cor="turquesa", cor2="turquesa_escuro",
                           aresta="ouro")
    it.add(t)
    zc = z2 - 0.05
    it.add(mb.torno([(0, 0), (1.9, 0), (2.0, 0.08), (1.85, 0.18), (0, 0.15)], z=zc, cor="branco", seg=16))
    it.add(mb.torno([(0, 0.1), (0.75, 0.1), (0.8, 0.22), (1.15, 0.6), (1.4, 1.25), (1.45, 1.45), (1.33, 1.45),
                     (1.25, 1.25), (0, 1.2)], z=zc, cor="branco", seg=16, angulo=50))
    it.add(mb.torno([(1.24, 0.75), (1.36, 0.95), (1.42, 1.18), (1.3, 1.18), (1.12, 0.75)], z=zc, cor="turquesa",
                    seg=16, angulo=60))
    it.add(mb.cilindro(1.28, 0.06, z=zc + 1.2, cor="terracota_clara", seg=16, bisel=0))
    asa = mb.torno([(0.42 + 0.11 * math.cos(math.radians(a)), 0.11 * math.sin(math.radians(a))) for a in
                    range(-90, 271, 45)], cor="branco", seg=14)
    mb.transforma(asa, rot=("X", 90))
    mb.transforma(asa, loc=(1.55, 0, zc + 0.8))
    it.add(asa)
    it.add(letreiro_bandeira("cha_v", A - 0.3, -A, zb + 0.8, 2.2))
    ztop = zc + 1.5
    exporta(cat, it, "Casa de chá", "casa_de_cha", andares=2, tags=["restaurante", "baixo", "cha"],
            colisao=[((0, 0, 0), (2 * A + 1.4, 2 * A + 1.0, zb)), ((0, 0, zb), (2 * A, 2 * A, z - zb)),
                     ((0, 0, z), (2 * a2, 2 * a2, ztop - z))])


# ------------------------------------------------------------------------------------------- lojas
def _loja2(cat, id_, rotulo, parede, telha, telha2, toldo_cores, placa, bandeira, semente):
    """Loja de dois andares: vitrine com toldo listrado no térreo, janelas com peitoril em cima e telhado curvo de
    cumeeira."""
    mb.limpa()
    it = mb.Item(id_)
    Aw, Bw = 4.6, 3.7
    it.add(bx(2 * Aw, 2 * Bw, TERREO + ANDAR + 0.1, cor=parede, b=0.1))
    it.add(frente_loja(0, -Bw, 6.6, 2.9, z=0.1, moldura="branco", semente=semente))
    it.add(toldo(0, -Bw - 0.12, 7.0, 3.4, prof=1.1, cores=toldo_cores))
    it.add(letreiro(placa, 0, -Bw, 3.5, alt=0.55))
    it.add(janelas_bloco(2 * Aw, 2 * Bw, 0.9, 3.6, 1, 3, 3, semente=semente, frente=False, moldura="branco", larg=0.6,
                         alt=0.75))
    it.add(bx(2 * Aw + 0.14, 2 * Bw + 0.14, 0.16, z=TERREO - 0.1, cor="branco", b=0.05, seg=1))
    it.add(janelas_bloco(2 * Aw, 2 * Bw, TERREO, TERREO + ANDAR, 1, 3, 3, semente=semente + 1, moldura="branco",
                         peitoril="branco", trelica="branco", larg=0.55, alt=0.62))
    it.add(ar_condicionado(-2.4, -Bw, TERREO + 0.3))
    it.add(telhado_cumeeira(Aw, Bw, TERREO + ANDAR, beiral=0.9, h=2.3, cor=telha, cor2=telha2, aresta="ouro"))
    it.add(letreiro_bandeira(bandeira, Aw - 0.5, -Bw, TERREO + 0.3, 2.6))
    ztop = TERREO + ANDAR + 2.3 + 1.0
    exporta(cat, it, rotulo, "loja_2_andares", andares=2, tags=["loja", "baixo"],
            colisao=[((0, 0, 0), (2 * Aw, 2 * Bw, TERREO + ANDAR)),
                     ((0, 0, TERREO + ANDAR), (2 * Aw + 1.6, 2 * Bw + 1.6, ztop - TERREO - ANDAR))])


@peca("loja_2_andares_vermelha")
def _d13a(cat):
    _loja2(cat, "loja_2_andares_vermelha", "Loja de 2 andares (vermelha)", "vermelho", "turquesa", "turquesa_escuro",
           ("vermelho_escuro", "branco"), "loja", "loja_v", 161)


@peca("loja_2_andares_rosa")
def _d13b(cat):
    _loja2(cat, "loja_2_andares_rosa", "Doceria de 2 andares (rosa)", "rosa", "roxo", "roxo_escuro",
           ("rosa_escuro", "branco"), "doces", "flores_v", 167)


def _loja3(cat, id_, rotulo, base, parede, telha, telha2, moldura, placa, semente):
    """Loja de três andares com varanda no primeiro andar, beiral curvo e telhado de cumeeira."""
    mb.limpa()
    it = mb.Item(id_)
    A = 4.2
    it.add(bx(2 * A, 2 * A, TERREO + 0.1, cor=base, b=0.1))
    it.add(frente_loja(0, -A, 6.0, 3.0, z=0.1, moldura=moldura, semente=semente))
    it.add(letreiro(placa, 0, -A, 3.35, alt=0.6))
    it.add(janelas_bloco(2 * A, 2 * A, 0.9, 3.6, 1, 3, 3, semente=semente, frente=False, moldura=moldura, larg=0.6,
                         alt=0.75))
    it.add(saia(A, A, TERREO, beiral=0.75, h=0.55, cor=telha, cor2=telha2, aresta="ouro", borda=("mat", "luz")))
    bloco_andares(it, 2 * A, 2 * A, TERREO, 2, parede=parede, moldura=moldura, semente=semente + 1, ares=2,
                  cornijas=moldura, colunas=(3, 3), trelica=moldura)
    # varanda no primeiro andar (frente)
    zv = TERREO + ANDAR
    it.add(bx(2 * A - 1.0, 1.2, 0.2, y=-A - 0.55, z=zv - 0.1, cor=moldura, b=0.06))
    it.add(guarda_corpo([(-A + 0.6, -A), (-A + 0.6, -A - 1.05), (A - 0.6, -A - 1.05), (A - 0.6, -A)], zv + 0.1,
                        alt=0.9, cor=moldura, corrimao="ouro", fechado=False, balaustres=0.8))
    z = TERREO + 2 * ANDAR
    it.add(telhado_cumeeira(A, A, z, beiral=1.05, h=2.5, cor=telha, cor2=telha2, aresta="ouro"))
    for sx in (-1, 1):
        it.add(lanterna(sx * 2.6, -A - 1.0, zv - 0.15, r=0.32, fio=0.1))
    ztop = z + 2.5 + 1.0
    exporta(cat, it, rotulo, "loja_3_andares", andares=3, tags=["loja", "baixo"],
            colisao=[((0, 0, 0), (2 * A, 2 * A + 0.4, z)), ((0, 0, z), (2 * A + 1.8, 2 * A + 1.8, ztop - z))])


@peca("loja_3_andares_verde")
def _d14a(cat):
    _loja3(cat, "loja_3_andares_verde", "Mercado de 3 andares (verde)", "verde_floresta", "verde_claro", "vermelho",
           "vermelho_escuro", "branco", "mercado", 171)


@peca("loja_3_andares_laranja")
def _d14b(cat):
    _loja3(cat, "loja_3_andares_laranja", "Pastelaria de 3 andares (laranja)", "azul_medio", "laranja", "azul",
           "azul_medio", "branco", "pastel", 177)


# ------------------------------------------------------------------------------------------- portal
@peca("portal_decorado")
def _d15(cat):
    """Portal decorado de Chinatown: colunas vermelhas, três telhados de cumeeira com chifres dourados, letreiro de
    boas-vindas e duas guaritas com janelas nos lados."""
    mb.limpa()
    it = mb.Item("portal_decorado")
    sem = 181
    for sx in (-1, 1):  # guaritas
        cx_ = sx * 4.3
        it.add(bx(2.6, 2.6, 0.3, x=cx_, cor="concreto", b=0.05))
        it.add(bx(2.2, 2.2, 3.0, x=cx_, z=0.3, cor="vermelho", b=0.06))
        it.add(janelas_bloco(2.2, 2.2, 0.3 + 1.0, 0.3 + 2.6, 1, 1, 1, x=cx_, semente=sem + sx, moldura="ouro",
                             trelica="vermelho_escuro", larg=0.6, alt=0.75, margem=0.2))
        it.add(telhado_ponta(rect(1.1, 1.1, cx_, 0), 3.3, beiral=0.55, h=1.4, cor="verde_medio", cor2="verde_escuro",
                             aresta="ouro"))
    for sx in (-1, 1):
        x = sx * 2.7
        it.add(mb.cilindro(0.55, 0.6, x=x, z=0, cor="concreto", seg=12, bisel=0.06))
        it.add(mb.cilindro(0.34, 7.0, x=x, z=0.5, cor="vermelho", seg=12, bisel=0.03))
        it.add(mb.cilindro(0.42, 0.25, x=x, z=0.5, cor="ouro", seg=12, bisel=0.03))
        for dy in (-1, 1):  # escoras
            it.add(bx(0.2, 0.9, 1.6, x=x, y=dy * 0.55, z=0.5, cor="vermelho_escuro", b=0.05))
    it.add(bx(7.6, 0.6, 0.6, z=5.0, cor="vermelho_escuro", b=0.08))
    it.add(bx(7.8, 0.66, 0.2, z=5.6, cor="ouro", b=0.05))
    it.add(bx(7.6, 0.7, 0.75, z=6.6, cor="vermelho", b=0.08))
    it.add(bx(4.6, 0.3, 0.8, z=5.75, cor="vermelho_escuro", b=0.06))
    it.add(letreiro("bem_vindo", 0, -0.15, 5.78, alt=0.62))
    it.add(letreiro("bem_vindo", 0, 0.15, 5.78, alt=0.62, face=1))
    it.add(telhado_cumeeira(3.4, 0.35, 7.35, beiral=1.0, h=1.4, cor="verde_medio", cor2="verde_escuro", aresta="ouro",
                            cumeeira="ouro"))
    for k in (-1, 1):
        it.add(lanterna(k * 1.6, 0, 5.0, r=0.42, fio=0.2))
    ztop = 7.35 + 1.4 + 1.0
    exporta(cat, it, "Portal decorado de Chinatown", "portal_decorado", andares=1, tags=["portal", "baixo"],
            colisao=[((-4.3, 0, 0), (2.6, 2.6, 4.7)), ((4.3, 0, 0), (2.6, 2.6, 4.7)),
                     ((-2.7, 0, 0), (1.1, 2.0, 5.0)), ((2.7, 0, 0), (1.1, 2.0, 5.0)),
                     ((0, 0, 5.0), (8.0, 3.0, ztop - 5.0))])


@peca("restaurante_jardim")
def _d16(cat):
    """Restaurante térreo com varanda de colunas vermelhas, beiral jade iluminado e jardim de bambus no terraço."""
    mb.limpa()
    it = mb.Item("restaurante_jardim")
    Aw, Bw = 4.9, 4.1
    zb = 0.3
    sem = 191
    it.add(base_pedra(2 * Aw + 1.2, 2 * Bw + 2.2, zb, degraus_frente=1, larg_degrau=3.2))
    h = 4.6
    it.add(bx(2 * Aw, 2 * Bw, h + 0.1, z=zb, y=0.4, cor="creme", b=0.08))
    yf = -Bw + 0.4
    it.add(frente_loja(0, yf, 7.8, 3.2, z=zb + 0.05, moldura="vermelho_escuro", semente=sem))
    it.add(janelas_bloco(2 * Aw, 2 * Bw, zb + 0.9, zb + 3.6, 1, 4, 3, y=0.4, semente=sem, frente=False,
                         moldura="vermelho_escuro", trelica="ouro", larg=0.62, alt=0.8))
    yc = yf - 1.1
    for k in range(4):
        it.add(coluna(-4.2 + 2.8 * k, yc, zb, h - 0.4, r=0.22, cor="vermelho"))
    it.add(bx(2 * Aw + 0.2, 0.4, 0.5, y=yc, z=zb + h - 0.5, cor="vermelho_escuro", b=0.06))
    it.add(letreiro("restaurante", 0, yc - 0.2, zb + h - 0.5 + 0.02, alt=0.48))
    for k in range(3):
        it.add(lanterna(-3.0 + 3.0 * k, yc, zb + h - 0.5, r=0.34, fio=0.12))
    z = zb + h
    it.add(saia(Aw, Bw + 0.6, z, beiral=0.65, h=0.75, y=-0.2, cor="turquesa", cor2="turquesa_escuro", aresta="ouro",
                borda=("mat", "luz")))
    it.add(bx(2 * Aw - 0.4, 2 * Bw - 0.2, 0.75, y=0.4, z=z, cor="turquesa_escuro", b=0.05))
    it.add(terraco(2 * Aw - 0.4, 2 * Bw - 0.2, z + 0.7, alt=0.7, y=0.4, piso="grama_escura", parapeito="turquesa_escuro"))
    zr = z + 0.82
    for k, (x, y) in enumerate(((-3.3, -1.6), (-1.2, 1.6), (1.4, -1.3), (3.4, 1.4), (0.2, 0.3))):
        it.add(bambu(x, y + 0.4, zr, alt=2.4 + 0.3 * (k % 2), n=4, semente=sem + k))
    # emblema redondo no beiral da frente
    it.add(mb.cilindro(0.9, 0.16, x=0, y=-Bw + 0.45, z=zr + 0.75, cor="ouro", eixo="y", seg=20, bisel=0.04))
    it.add(mb.cilindro(0.74, 0.18, x=0, y=-Bw + 0.43, z=zr + 0.75, cor="vermelho", eixo="y", seg=20, bisel=0.03))
    ztop = zr + 3.0
    exporta(cat, it, "Restaurante com jardim de bambu", "restaurante_jardim", andares=1,
            tags=["restaurante", "baixo", "jardim"],
            colisao=[((0, 0, 0), (2 * Aw + 1.2, 2 * Bw + 2.2, zb)), ((0, 0.4, zb), (2 * Aw, 2 * Bw, h + 0.7)),
                     ((0, yc, zb), (2 * Aw, 0.6, h))])


# =====================================================================================================================
def main():
    global _EST_DIR
    args = sys.argv[sys.argv.index("--") + 1:]
    saida = args[0]
    ids = [a for a in args[1:] if not a.startswith("-")]
    _EST_DIR = os.path.join(saida, CAT, "estampas")
    subprocess.run(["python3", "-I", os.path.join(AQUI, "predios_chinatown_estampas.py"), _EST_DIR], check=True,
                   stdout=subprocess.DEVNULL)
    cat = mb.Catalogo(CAT, saida, rotulo="Prédios de Chinatown")
    for id_, f in PECAS.items():
        if ids and id_ not in ids:
            continue
        f(cat)
    # o catálogo fica só com as peças deste gerador (sobras de versões antigas saem, com o GLB e a miniatura)
    velhos = [x for x in cat.dados["itens"] if x["id"] not in PECAS]
    for x in velhos:
        for arq in (x["arquivo"], x["miniatura"]):
            q = os.path.join(cat.pasta, arq)
            if os.path.exists(q):
                os.remove(q)
    cat.dados["itens"] = sorted([x for x in cat.dados["itens"] if x["id"] in PECAS],
                                key=lambda x: list(PECAS).index(x["id"]))
    cat.salva()


if __name__ == "__main__":
    main()
