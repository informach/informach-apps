"""Cidade do Morada: barcos (veleiros, iates, barcos de passeio, lanchas, pesca, balsa, caiaque, pedalinho, bote e o
navio de cruzeiro) — categoria "barcos".

Uso:
  MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/cidade_barcos.py -- SP/cidade_out [ids|grupos...]

Convenções (GUIA_CIDADE, GUIA_PREDIOS, GUIA_TRANSPORTE):
- metros, Z para cima, proa para −Y (a frente, como prédios e móveis). Origem no centro do barco, em z = 0 = linha
  d'água: o casco desce abaixo (calado de no máximo 0,68 m, porque a água da cidade tem 0,70 m de fundo, de −1,0 a
  −1,7). O catálogo leva extra {"linha_dagua": 0, "comprimento": L, "calado": d, "animacoes": [...]}.
- Bombordo (esquerda de quem olha para a proa) é +X: luz de navegação vermelha (luz_vermelha) em +X e "verde"
  (neon, a luz verde não existe na paleta de materiais) em −X; luz branca (luz) no mastro e na popa.
- Animados: o objeto filho leva extras glTF e a mesma lista vai no catálogo em extra["animacoes"] com nome e pivô:
    hélice  {"anima": "girar", "eixo": "z", "velocidade": 720, "helice": 1}   (eixo do glTF: Z = popa↔proa)
    roda    {"anima": "girar", "eixo": "x", "velocidade": 120, "roda": 1, "raio": r}   (roda de pás do pedalinho)
    vela    {"anima": "balancar", "angulo": 4, "periodo": 3.5, "eixo": "y"}  (vela grande + retranca, em volta do
            mastro)
- Interativos: portas de cabine (Item.porta), escotilhas (porta com eixo x) e rampas da balsa (porta, lado baixo).
- Assentos: Item.slot "assento_*" de 0,5 × 0,5 × 0,9 m no cockpit e no deque.
"""
import math
import os
import random
import sys
import zlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import moveis_base as mb  # noqa: E402

V = Vector
CAT = "barcos"
ASSENTO = (0.5, 0.5, 0.9)
HELICE = {"anima": "girar", "eixo": "z", "velocidade": 720, "helice": 1}
VIDROS = ("janela", "janela_fria", "janela_apagada")


# ======================================================================================================================
# Base própria (sem mexer na moveis_base)
# ======================================================================================================================
class ItemB(mb.Item):
    """Item com filhos animados (extras glTF no nó filho, como os interativos da biblioteca de móveis)."""

    def __init__(self, id_):
        super().__init__(id_)
        self.animados = []
        self.rng = random.Random(zlib.crc32(id_.encode()))
        self.n_assento = 0

    def anima(self, objs, dados, nome, pivo=None):
        ob = mb.junta(objs if isinstance(objs, (list, tuple)) else [objs], nome)
        if pivo is None:
            lo, hi = mb.bbox(ob)
            pivo = (lo + hi) / 2
        d = V(pivo)
        ob.data.transform(Matrix.Translation(-d))
        ob.location = d
        self.animados.append((ob, dict(dados)))
        return ob

    def assento(self, x, y, z, nome=None):
        if nome is None:
            self.n_assento += 1
            nome = f"assento_{self.n_assento}"
        self.slot(nome, (x, y, z), ASSENTO)

    def vidro(self):
        r = self.rng.random()
        return "janela_apagada" if r < 0.38 else ("janela_fria" if r < 0.62 else "janela")

    def monta(self):
        corpo = super().monta()
        for ob, d in self.animados:
            ob.parent = corpo
            for k, v in d.items():
                ob[k] = v
        bpy.context.view_layer.update()
        return corpo

    def lista_animacoes(self):
        return [dict(nome=ob.name, **d, pivo=mb._gl(ob.location)) for ob, d in self.animados]


class Malha:
    """Malha montada à mão: cada face com a sua cor da paleta (ou material)."""

    def __init__(self):
        self.v = []
        self.f = []

    def p(self, co):
        self.v.append(V(co))
        return len(self.v) - 1

    def face(self, ids, cor="branco", mat="atlas"):
        self.f.append((list(ids), cor, mat))

    def obj(self, nome, angulo=40, liso=True, esp=0.0):
        mb.materiais()
        bm = bmesh.new()
        vs = [bm.verts.new(c) for c in self.v]
        uvl = bm.loops.layers.uv.new("UVMap")
        for ids, cor, mat in self.f:
            q = []
            for i in ids:
                if vs[i] not in q:
                    q.append(vs[i])
            if len(q) < 3:
                continue
            try:
                f = bm.faces.new(q)
            except ValueError:
                continue
            f.material_index = mb._mat_idx(mat)
            u = mb.uv_cor(cor) if cor else (0.5, 0.5)
            for lo in f.loops:
                lo[uvl].uv = u
        bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
        bmesh.ops.dissolve_degenerate(bm, dist=1e-6, edges=bm.edges[:])
        if esp:
            bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=esp)
        ng = [f for f in bm.faces if len(f.verts) > 4]
        if ng:
            bmesh.ops.triangulate(bm, faces=ng, quad_method="BEAUTY", ngon_method="BEAUTY")
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
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


def _ccw(pts):
    s = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(pts, pts[1:] + pts[:1]))
    return list(pts) if s > 0 else list(pts)[::-1]


def simplifica(pts, passo=0.35, ang=14.0):
    """Tira pontos de uma linha densa: mantém um ponto quando anda 'passo' ou quando a direção muda 'ang' graus."""
    pts = [V(p) for p in pts]
    if len(pts) < 3:
        return pts
    out = [pts[0]]
    dir0 = None
    for i in range(1, len(pts) - 1):
        d = pts[i] - out[-1]
        if d.length < 1e-6:
            continue
        dn = (pts[i + 1] - pts[i])
        if dir0 is None:
            dir0 = d.normalized()
        virou = dn.length > 1e-6 and math.degrees(dir0.angle(dn.normalized(), 0.0)) > ang
        if d.length >= passo or virou:
            out.append(pts[i])
            dir0 = None
    out.append(pts[-1])
    return out


def caixa(*a, **k):
    """caixa boleada com menos segmentos no bisel (malha leve)."""
    k.setdefault("seg", 2)
    return mb.caixa(*a, **k)


def sup(*a, **k):
    """superelipsoide com malha leve (a da base tem 1.000 triângulos)."""
    k.setdefault("nu", 18)
    k.setdefault("nv", 8)
    return mb.superelipsoide(*a, **k)


def tubo(pts, r, cor="cinza_claro", seg=8, **k):
    """Tubo fino; linhas já densas (mais de 4 pontos) não ganham o arredondamento de cantos da base."""
    if len(pts) > 4:
        k.setdefault("raio_curva", 0.0)
    return mb.tubo([tuple(p) for p in pts], r, cor=cor, seg=seg, **k)


def haste(a, b, r, cor="cinza_claro", seg=8):
    """Cilindro fino de a até b (pontos 3D)."""
    a, b = V(a), V(b)
    d = b - a
    ob = mb.cilindro(r, d.length, cor=cor, seg=seg, bisel=0)
    q = V((0, 0, 1)).rotation_difference(d.normalized())
    ob.data.transform(Matrix.Translation(a) @ q.to_matrix().to_4x4())
    return ob


def varre(m, caminho, perfil, cor="branco", mat="atlas", fechado=True):
    """Varre um perfil 2D fechado (a = lateral à esquerda do caminho, b = para cima) ao longo de um caminho 3D."""
    n = len(caminho)
    aneis = []
    for i, p in enumerate(caminho):
        if fechado:
            ant, prox = caminho[i - 1], caminho[(i + 1) % n]
        else:
            ant, prox = caminho[max(i - 1, 0)], caminho[min(i + 1, n - 1)]
        t1, t2 = V((p.x - ant.x, p.y - ant.y, 0)), V((prox.x - p.x, prox.y - p.y, 0))
        if t1.length < 1e-7:
            t1 = t2
        if t2.length < 1e-7:
            t2 = t1
        t1.normalize()
        t2.normalize()
        t = t1 + t2
        t = t.normalized() if t.length > 1e-6 else t1
        k = 1.0 / max(0.55, t1.dot(t))
        lat = V((-t.y, t.x, 0))
        aneis.append([m.p(p + lat * (a * k) + V((0, 0, b))) for a, b in perfil])
    np_ = len(perfil)
    for i in range(n if fechado else n - 1):
        A, B = aneis[i], aneis[(i + 1) % n]
        for j in range(np_):
            jj = (j + 1) % np_
            m.face([A[j], A[jj], B[jj], B[j]], cor, mat)
    if not fechado:
        m.face(aneis[0], cor, mat)
        m.face(aneis[-1][::-1], cor, mat)
    return aneis


def perfil_ret(l, a, r=None, n=3, b0=0.0):
    """Retângulo arredondado l × a (lateral × altura), de b0 até b0 + a, centrado na lateral."""
    if n == 0:
        return [(l / 2, b0 + a), (-l / 2, b0 + a), (-l / 2, b0), (l / 2, b0)]
    r = min(r if r is not None else min(l, a) * 0.35, l / 2 - 1e-4, a / 2 - 1e-4)
    pts = []
    for cx, cy, a0 in ((l / 2 - r, a - r, 0), (-l / 2 + r, a - r, 90), (-l / 2 + r, r, 180), (l / 2 - r, r, 270)):
        for k in range(n + 1):
            t = math.radians(a0 + 90 * k / n)
            pts.append((cx + r * math.cos(t), b0 + cy + r * math.sin(t)))
    return pts


def ret_div(l, p, r, seg=4, nx=1, ny=1, bico=0.0, popa=0.0):
    """Contorno de um retângulo arredondado l × p (anti-horário, começando no lado +X) com os lados retos divididos
    em nx (lados em X) e ny (lados em Y) pedaços. bico afina a frente (−Y), popa afina o fundo (+Y).
    Devolve (pontos, etiquetas): etiqueta i = (lado, índice, total) do trecho i → i+1. lados: 'c' canto,
    'tras' (+Y), 'esq' (−X), 'frente' (−Y), 'dir' (+X); cantos 'c0' (+X+Y), 'c1' (−X+Y), 'c2' (−X−Y), 'c3' (+X−Y)."""
    r = max(1e-3, min(r, l / 2 - 1e-3, p / 2 - 1e-3))
    cantos = [(l / 2 - r, p / 2 - r, 0), (-l / 2 + r, p / 2 - r, 90), (-l / 2 + r, -p / 2 + r, 180),
              (l / 2 - r, -p / 2 + r, 270)]
    arcos = [[V((cx + r * math.cos(math.radians(a0 + 90 * i / seg)), cy + r * math.sin(math.radians(a0 + 90 * i / seg))))
              for i in range(seg + 1)] for cx, cy, a0 in cantos]
    lados = [("tras", nx), ("esq", ny), ("frente", nx), ("dir", ny)]
    pts, tags = [], []
    # o lado +X (dir) vem antes do canto 0: começa no fim do canto 3
    for k in range(4):
        for i, q in enumerate(arcos[k]):
            pts.append(q)
            tags.append((f"c{k}", i, seg) if i < seg else (lados[k][0], 0, lados[k][1]))
        a, b = arcos[k][-1], arcos[(k + 1) % 4][0]
        nome, nn = lados[k]
        for i in range(1, nn):
            pts.append(a.lerp(b, i / nn))
            tags.append((nome, i, nn))
    out = []
    for q in pts:
        x, y = q.x, q.y
        if bico and y < 0:
            x *= 1 - bico * (-y / (p / 2)) ** 2
        if popa and y > 0:
            x *= 1 - popa * (y / (p / 2)) ** 2
        out.append((x, y))
    return out, tags


def casinha(camadas, seg=4, nx=1, ny=1, cor_fn=None, cor="branco", topo=None, nome="cabine", base=True, angulo=48):
    """Volume de camadas (cabines, cúpulas, chaminés): camadas = [(z, l, p, dy, r[, bico[, popa]]), ...] de baixo
    para cima. cor_fn(a, i, etiqueta, centro) -> (cor, mat) pinta cada face da faixa a (entre as camadas a e a+1)."""
    m = Malha()
    aneis, tags = [], None
    for c in camadas:
        z, l, p, dy, r = c[:5]
        bico = c[5] if len(c) > 5 else 0.0
        popa = c[6] if len(c) > 6 else 0.0
        pts, tags = ret_div(l, p, r, seg, nx, ny, bico, popa)
        aneis.append([m.p((x, y + dy, z)) for x, y in pts])
    n = len(aneis[0])
    for a in range(len(aneis) - 1):
        for i in range(n):
            j = (i + 1) % n
            ids = [aneis[a][i], aneis[a][j], aneis[a + 1][j], aneis[a + 1][i]]
            c = sum((m.v[k] for k in ids), V()) / 4
            cr, mt = cor_fn(a, i, tags[i], c) if cor_fn else (cor, "atlas")
            m.face(ids, cr, mt)
    if base:
        m.face(aneis[0][::-1], cor)
    m.face(aneis[-1], topo or cor)
    return m.obj(nome, angulo=angulo)


# ======================================================================================================================
# Casco
# ======================================================================================================================
class Casco:
    """Casco liso e boleado, lofteado por seções. u = 0 na popa (+Y), u = 1 na proa (−Y). z = 0 é a linha d'água.
    cores: fundo (abaixo da água), faixa (logo acima da água, até 'faixa' m), casco, faixa2 (as últimas 'faixa2' m
    antes do deque) e deque."""

    def __init__(self, L, B, fb0, fb1, calado, popa=0.72, um=0.42, bico=1.9, redondo=1.0, forma=2.6, fundo_proa=0.45,
                 camber=0.04, faixa=0.0, faixa2=0.0, n=24, ponta=0.03, raio_popa=0.25, cores=None, fundo_popa=0.75):
        self.L, self.B, self.fb0, self.fb1, self.calado = L, B, fb0, fb1, calado
        self.popa, self.um, self.bico, self.redondo, self.forma = popa, um, bico, redondo, forma
        self.fundo_proa, self.camber, self.faixa, self.faixa2 = fundo_proa, camber, faixa, faixa2
        self.n, self.ponta, self.raio_popa, self.fundo_popa = n, ponta, raio_popa, fundo_popa
        self.cores = dict(fundo="vermelho_escuro", faixa="branco", casco="branco", faixa2="laranja", deque="laranja",
                          popa=None)
        self.cores.update(cores or {})

    # forma
    def y(self, u):
        return self.L / 2 - u * self.L

    def u_de(self, y):
        return (self.L / 2 - y) / self.L

    def w(self, u):
        B2 = self.B / 2
        if u <= self.um:
            t = 1 - max(0.0, u) / self.um
            return B2 * (self.popa + (1 - self.popa) * (1 - t * t))
        t = min(1.0, (u - self.um) / (1 - self.um))
        return max(B2 * max(0.0, 1 - t ** self.bico) ** self.redondo, self.ponta)

    def zt(self, u):
        return self.fb0 + (self.fb1 - self.fb0) * max(0.0, u) ** 1.8

    def zb(self, u):
        d = -self.calado
        if u > 0.6:
            t = (u - 0.6) / 0.4
            d += (self.calado + self.fundo_proa * self.zt(1.0)) * t ** 2.2
        if u < 0.08:
            d *= self.fundo_popa + (1 - self.fundo_popa) * max(0.0, u) / 0.08
        return d

    def deque(self, u, x=0.0):
        """Altura do deque em (u, x)."""
        w = self.w(u)
        return self.zt(u) + self.camber * max(0.0, 1 - (x / w) ** 2)

    def lado(self, u, z):
        """Ponto do costado (x > 0) na seção u, na altura z, e a normal horizontal para fora."""
        w, zt, zb = self.w(u), self.zt(u), self.zb(u)
        e = 2 / self.forma
        r = min(1.0, max(0.0, 1 - (z - zb) / (zt - zb)))
        phi = math.acos(r ** (1 / e))
        x = w * math.sin(phi) ** e
        du = 0.004
        dw = (self.w(min(1, u + du)) - self.w(max(0, u - du))) / (2 * du)
        nrm = V((1.0, dw / self.L, 0.0)).normalized()  # dy/du = −L
        return x, nrm

    def secoes(self):
        return [0.5 - 0.5 * math.cos(math.pi * k / self.n) for k in range(self.n + 1)]

    def perfil(self, u, w=None):
        w = self.w(u) if w is None else w
        zt, zb = self.zt(u), self.zb(u)
        Hh = zt - zb
        e = 2 / self.forma

        def pt(phi):
            sn, cs = max(0.0, math.sin(phi)), max(0.0, math.cos(phi))
            return (w * sn ** e, zb + Hh * (1 - cs ** e))

        def phi_z(z):
            r = min(1.0, max(0.0, 1 - (z - zb) / Hh))
            return math.acos(r ** (1 / e))

        c = self.cores
        phw = max(phi_z(0.0), 0.05)
        phf = max(phi_z(self.faixa), phw + 0.03) if self.faixa else phw
        ph2 = min(phi_z(zt - self.faixa2), math.pi / 2 - 0.03) if self.faixa2 else math.pi / 2
        ph2 = max(ph2, phf + 0.05)
        pts = [(0.0, zb, None)]
        for k in range(1, 4):
            pts.append((*pt(phw * k / 3), c["fundo"]))
        if self.faixa:
            pts.append((*pt(phf), c["faixa"]))
        for k in range(1, 5):
            pts.append((*pt(phf + (ph2 - phf) * k / 4), c["casco"]))
        if self.faixa2:
            pts.append((*pt(ph2 + (math.pi / 2 - ph2) * 0.5), c["faixa2"]))
            pts.append((*pt(math.pi / 2), c["faixa2"]))
        pts.append((w * 0.6, zt + self.camber * 0.64, c["deque"]))
        pts.append((0.0, zt + self.camber, c["deque"]))
        return pts

    def objeto(self, nome="casco"):
        m = Malha()
        aneis = []  # (direita [índices], esquerda [índices], cores)
        y0 = self.y(0.0)
        rp = self.raio_popa
        estacoes = []
        if rp > 0:
            for k in (3, 2, 1):
                a = math.radians(90 * k / 3)
                estacoes.append((0.0, y0 + rp * math.sin(a) * 0.7, self.w(0.0) - rp * (1 - math.cos(a))))
        for u in self.secoes():
            estacoes.append((u, self.y(u), None))
        for u, y, w in estacoes:
            pts = self.perfil(u, w)
            dir_ = [m.p((x, y, z)) for x, z, _ in pts]
            esq = [dir_[0]] + [m.p((-x, y, z)) for x, z, _ in pts[1:-1]] + [dir_[-1]]
            aneis.append((dir_, esq, [c for _, _, c in pts]))
        for (d0, e0, cs), (d1, e1, _) in zip(aneis, aneis[1:]):
            for j in range(len(d0) - 1):
                m.face([d0[j], d0[j + 1], d1[j + 1], d1[j]], cs[j + 1])
                m.face([e0[j], e1[j], e1[j + 1], e0[j + 1]], cs[j + 1])
        # tampas (popa e proa) em faixas horizontais: as cores seguem as do costado
        cor_popa = self.cores["popa"]
        for (d, e, cs) in (aneis[0], aneis[-1]):
            k_borda = len(d) - 3  # o último ponto do costado (canto do deque)
            for j in range(k_borda):
                m.face([d[j], d[j + 1], e[j + 1], e[j]], cor_popa or cs[j + 1])
            m.face([d[k_borda], d[k_borda + 1], d[k_borda + 2], e[k_borda + 1], e[k_borda]], cor_popa or cs[k_borda])
        return m.obj(nome, angulo=42)

    # contornos do deque
    def contorno(self, inset=0.0, u0=0.0, u1=1.0, z_extra=0.0, passo=None, fechado=True):
        """Linha do deque recuada 'inset' da borda: lado +X da popa à proa, a ponta, lado −X de volta (e, fechado,
        a travessa da popa). Pontos 3D na altura do canto do deque + z_extra."""
        us = [u for u in self.secoes() if u0 <= u <= u1]
        if us[0] > u0:
            us = [u0] + us
        if us[-1] < u1:
            us.append(u1)
        dir_ = []
        for u in us:
            x = self.w(u) - inset
            if x < 0.04:
                break
            dir_.append(V((x, self.y(u), self.zt(u) + z_extra)))
        ultimo = us[len(dir_) - 1] if dir_ else u1
        if u1 >= 0.999:  # ponta
            ub = 1.0
            while ub > ultimo and self.w(ub) - inset < 0.04:
                ub -= 0.002
            yb = self.y(ub) - min(inset * 0.6, 0.3)
            ponta = [V((0.0, yb, self.zt(ub) + z_extra))]
        else:
            ponta = []
        esq = [V((-p.x, p.y, p.z)) for p in reversed(dir_)]
        pts = dir_ + ponta + esq
        if fechado:
            ym = self.y(u0) + (self.raio_popa * 0.6 if u0 == 0 else 0) - inset * 0.6
            meio = V((0.0, ym, self.zt(u0) + z_extra))
            pts = [meio] + pts + [meio]
        return pts


def col_casco(c, u_meio=0.62, z_topo=None):
    """Duas caixas de colisão no casco: da popa até u_meio com a boca inteira e daí até a proa, mais estreita."""
    zt = z_topo if z_topo is not None else c.zt(0.5) + 0.1
    y_popa = c.y(0.0) + c.raio_popa * 0.7
    y_m, y_proa = c.y(u_meio), c.y(1.0)
    z0 = -c.calado
    z1 = c.zb(0.85)
    return [((0, (y_popa + y_m) / 2, z0), (c.B, y_popa - y_m, zt - z0)),
            ((0, (y_m + y_proa) / 2, z1), (2 * c.w((2 * u_meio + 1) / 3), y_m - y_proa, c.zt(1.0) + 0.1 - z1))]


def casco(it, **kw):
    c = Casco(**kw)
    it.add(c.objeto())
    return c


def borda(c, larg=0.10, alt=0.10, cor="laranja", inset=0.01, u0=0.0, passo=None):
    """Borda (alheta) boleada em volta do deque, sobre o canto do costado."""
    pts = c.contorno(inset=larg / 2 - inset, u0=u0, fechado=(u0 == 0))
    pts = simplifica(mb._arredonda_cantos(pts, 0.35, 5), passo=passo or max(0.3, c.L / 24))
    m = Malha()
    varre(m, pts, perfil_ret(larg, alt + 0.03, r=min(larg, alt) * 0.45, n=1, b0=-0.03), cor, fechado=False)
    return m.obj("borda", angulo=50)


def guarda_corpo(c, alt=0.55, passo=0.78, cor="cinza_claro", inset=0.07, u0=0.06, u1=1.0, z0=None, r=0.018,
                 meio=True, nome="guarda_corpo"):
    """Guarda-corpo fino: corrimão em volta do deque (da popa u0, contornando a proa, até u0 do outro lado), com
    montantes a cada 'passo' e uma travessa no meio."""
    zb = z0 if z0 is not None else 0.08
    pts = c.contorno(inset=inset, u0=u0, u1=u1, z_extra=zb, fechado=False)
    pts = simplifica(mb._arredonda_cantos(pts, 0.35, 5), passo=max(0.4, c.L / 22))
    objs = [tubo([p + V((0, 0, alt)) for p in pts], r, cor=cor, raio_curva=0.0)]
    if meio:
        objs.append(tubo([p + V((0, 0, alt * 0.5)) for p in pts], r * 0.75, cor=cor, raio_curva=0.0))
    s = [0.0]
    for a, b in zip(pts, pts[1:]):
        s.append(s[-1] + (b - a).length)
    L = s[-1]
    n = max(2, int(L / passo))
    for k in range(n + 1):
        si = L * k / n
        i = max(0, min(len(pts) - 2, next((i for i in range(len(s) - 1) if s[i + 1] >= si), len(s) - 2)))
        t = (si - s[i]) / max(1e-6, s[i + 1] - s[i])
        p = pts[i].lerp(pts[i + 1], t)
        objs.append(mb.cilindro(r * 0.9, alt, x=p.x, y=p.y, z=p.z - 0.03, cor=cor, seg=6, bisel=0))
    return mb.junta(objs, nome)


def luzes_navegacao(c, u=0.86, z_extra=0.18, popa=True, r=0.06):
    """Vermelha a bombordo (+X), 'verde' (neon) a boreste (−X), branca na popa."""
    y = c.y(u)
    x = c.w(u) - 0.05
    z = c.zt(u) + z_extra
    objs = [mb.esfera(r, x=x, y=y, z=z, cor=None, mat="luz_vermelha", seg=8, esc=(1, 1.4, 1)),
            mb.esfera(r, x=-x, y=y, z=z, cor=None, mat="neon", seg=8, esc=(1, 1.4, 1))]
    for sx in (1, -1):
        objs.append(caixa(0.05, r * 4, r * 2.6, x=sx * (x - r * 0.9), y=y, z=z - r * 1.3, cor="grafite", bisel=0.01))
    if popa:
        objs.append(mb.esfera(r, x=0, y=c.y(0) + c.raio_popa * 0.55, z=c.zt(0) + z_extra, cor=None, mat="luz", seg=10))
    return objs


def portinholas(it, c, us, z, r=0.13, cor="cromo", aro=0.035):
    """Escotilhas redondas nos dois costados (vidro com aro): acendem à noite."""
    objs = []
    for u in us:
        x, nrm = c.lado(u, z)
        y = c.y(u)
        mat = it.vidro()
        for sx in (1, -1):
            n = V((sx * nrm.x, nrm.y, 0))
            q = V((0, 0, 1)).rotation_difference(n)
            M = Matrix.Translation((sx * x, y, z)) @ q.to_matrix().to_4x4()
            vid = mb.cilindro(r, 0.05, cor=None, mat=mat, seg=10 if aro else 8, bisel=0.0, z=-0.025)
            novos = [vid]
            if aro:
                novos.append(mb.cilindro(r + aro, 0.05, cor=cor, seg=10, bisel=0.0, z=-0.03))
            for o in novos:
                o.data.transform(M)
            objs += novos
    return objs


def boia(x, y, z, normal=(1, 0, 0), r=0.26, esp=0.075, cor="laranja"):
    """Boia salva-vidas (anel laranja com quatro faixas brancas), de pé, olhando para 'normal'."""
    perfil = [(r + esp * math.cos(math.radians(a)), esp * math.sin(math.radians(a))) for a in range(-90, 271, 45)]
    b = mb.torno(perfil, cor=cor, seg=12)
    mb.pinta_onde(b, "branco", lambda c, n: (math.atan2(c.y, c.x) % (math.pi / 2)) < math.pi / 5)
    q = V((0, 0, 1)).rotation_difference(V(normal).normalized())
    b.data.transform(Matrix.Translation((x, y, z)) @ q.to_matrix().to_4x4())
    return b


def helice(it, pos, r=0.18, pas=3, cor="latao", nome="helice", eixo_cubo=True):
    """Hélice de popa (eixo Y do Blender = Z do glTF), objeto filho girando."""
    objs = [mb.cilindro(r * 0.22, r * 0.55, eixo="y", cor=cor, seg=10, bisel=0.0)]
    objs.append(mb.esfera(r * 0.22, y=-r * 0.27, cor=cor, seg=8, esc=(1, 0.8, 1)))
    for k in range(pas):
        pa = mb.superelipsoide(r * 0.55, 0.025, r * 0.82, cor=cor, e=0.55, e_v=0.7, nu=10, nv=4)
        mb.transforma(pa, rot=("Z", 28))
        mb.transforma(pa, loc=(0, 0, r * 0.14))
        mb.transforma(pa, rot=("Y", k * 360 / pas))
        objs.append(pa)
    for o in objs:
        mb.transforma(o, loc=pos)
    return it.anima(objs, HELICE, nome, pivo=pos)


def leme(y, z_topo, z_baixo, corda=0.4, esp=0.06, cor="grafite"):
    a = z_topo - z_baixo
    return mb.superelipsoide(esp, corda, a, y=y, z=z_baixo, cor=cor, e=0.45, e_v=0.35, nu=12, nv=6)


def quilha(c, u0, u1, z_baixo, esp=0.14, cor="grafite"):
    """Bolina (quilha de veleiro): lâmina arredondada sob o casco."""
    y0, y1 = c.y(u1), c.y(u0)
    zt = min(c.zb(u0), c.zb(u1)) + 0.12
    ob = mb.superelipsoide(esp, y1 - y0, zt - z_baixo, y=(y0 + y1) / 2, z=z_baixo, cor=cor, e=0.5, e_v=0.45, nu=14,
                           nv=6)
    # inclina o bordo de ataque para trás
    for v in ob.data.vertices:
        t = (v.co.z - z_baixo) / max(1e-6, zt - z_baixo)
        v.co.y += (1 - t) * (y1 - y0) * 0.25
    return ob


def almofada(l, p, a, x, y, z, cor, rot=None, nu=14, nv=6):
    """Almofada fofa leve (a da base tem 1.000 triângulos)."""
    ob = mb.superelipsoide(l, p, a, cor=cor, e=0.22, e_v=0.55, estufa=0.3, nu=nu, nv=nv, nome="almofada")
    M = Matrix.Translation((x, y, z))
    if rot:
        M = M @ Matrix.Translation((0, 0, a / 2)) @ Matrix.Rotation(math.radians(rot[1]), 4, rot[0]) @ \
            Matrix.Translation((0, 0, -a / 2))
    ob.data.transform(M)
    return ob


def vela(cabeca, amura, punho, curva=0.07, nu=8, nv=10, cor="branco", esp=0.025, lado=1.0, bainha=None):
    """Vela de tecido levemente curvado: triângulo cabeça (alto), amura (embaixo, no estai/mastro) e punho (embaixo,
    atrás). A barriga sai para 'lado' (±1 em relação à normal do triângulo)."""
    A, Bv, C = V(amura), V(punho), V(cabeca)
    nrm = (Bv - A).cross(C - A).normalized() * lado
    m = Malha()
    linhas = []
    for j in range(nv + 1):
        t = j / nv
        linha = []
        nn = 1 if j == nv else nu
        for i in range(nn + 1 if j < nv else 1):
            s = i / nn if j < nv else 0.0
            p = A.lerp(Bv, s).lerp(C, t)
            corda = (Bv - A).length * (1 - t)
            p = p + nrm * (curva * corda * 4 * s * (1 - s) * (1 - 0.3 * t))
            # bainha do punho (borda de trás) levemente arredondada
            linha.append(m.p(p))
        linhas.append(linha)
    for j in range(nv):
        a_, b_ = linhas[j], linhas[j + 1]
        if len(b_) == 1:
            for i in range(len(a_) - 1):
                m.face([a_[i], a_[i + 1], b_[0]], cor)
        else:
            for i in range(len(a_) - 1):
                m.face([a_[i], a_[i + 1], b_[i + 1], b_[i]], cor)
    ob = m.obj("vela", angulo=70, esp=esp)
    objs = [ob]
    if bainha:  # tralha de reforço na borda de trás (valuma)
        objs.append(tubo([Bv + nrm * 0.0, C], esp * 0.8, cor=bainha, seg=8))
    return mb.junta(objs, "vela")


def mastro(x, y, z0, alt, r0=0.07, r1=0.045, cor="cinza_claro"):
    return mb.cilindro(r0, alt, x=x, y=y, z=z0, r2=r1, cor=cor, seg=12, bisel=0.01)


def lampada(x, y, z, mat="luz", r=0.07):
    return mb.esfera(r, x=x, y=y, z=z, cor=None, mat=mat, seg=8)


def cabeco(x, y, z, cor="grafite", r=0.06):
    return mb.torno([(0, 0), (r * 1.4, 0), (r, r * 1.2), (r, r * 2.2), (r * 1.5, r * 2.6), (r * 1.4, r * 3.0), (0, r * 3.0)],
                    x=x, y=y, z=z, cor=cor, seg=8)


def guarda_sol(x, y, z, r=0.9, cores=("vermelho", "branco"), alt=2.0):
    """Guarda-sol de gomos coloridos (deque do navio)."""
    objs = [mb.cilindro(0.03, alt, x=x, y=y, z=z, cor="branco", seg=6, bisel=0)]
    top = mb.torno([(0, 0.28), (r * 0.35, 0.24), (r, 0.02), (r * 0.98, 0.0), (0, 0.12)], cor=cores[0], seg=16 if r < 0.0 else 12)
    mb.pinta_onde(top, cores[1], lambda c, n: int((math.atan2(c.y, c.x) + math.pi) / (2 * math.pi) * 8) % 2 == 0)
    mb.transforma(top, loc=(x, y, z + alt - 0.25))
    objs.append(top)
    return objs


def espreguicadeira(x, y, z, ang=0.0, cor="branco", almof="azul_celeste"):
    """Espreguiçadeira (1,8 m) de encosto inclinado, olhando para −Y antes do giro."""
    objs = [caixa(0.6, 1.15, 0.4, y=0.25, z=0.0, cor=almof, bisel=0.03, seg=1)]
    enc = caixa(0.6, 0.7, 0.1, y=0.0, z=0.0, cor=almof, bisel=0.03, seg=1)
    for o in (enc,):
        mb.transforma(o, rot=("X", -40))
        mb.transforma(o, loc=(0, -0.55, 0.36))
    objs += [enc]
    for o in objs:
        mb.transforma(o, rot=("Z", ang))
        mb.transforma(o, loc=(x, y, z))
    return objs


# ======================================================================================================================
# Veleiros
# ======================================================================================================================
def p_veleiro(it, vela_cor="branco", vela_bainha="cinza_claro", modelo=1):
    """Veleiro de 9 m, casco branco e deque laranja (vela branca ou vermelha)."""
    c = casco(it, L=9.0, B=3.0, fb0=0.92, fb1=1.22, calado=0.42, popa=0.74, um=0.4, bico=1.8, forma=2.7,
              faixa=0.10, faixa2=0.16, cores=dict(fundo="laranja_escuro", faixa="branco", casco="branco",
                                                   faixa2="laranja", deque="laranja"))
    it.add(borda(c, 0.11, 0.09, cor="branco"))
    it.add(guarda_corpo(c, alt=0.55, u0=0.05, inset=0.07, cor="cinza_claro"))
    um = 0.6
    ym = c.y(um)
    zd = c.deque(um)
    # cabine baixa (casa) entre u 0,38 e 0,72
    ya, yb = c.y(0.70), c.y(0.38)
    lc, pc = 1.75, yb - ya
    zc0 = c.deque(0.55) - 0.06
    rng = it.rng

    def cor_cab(a, i, tag, cen):
        lado, k, n = tag
        if a == 1 and lado in ("dir", "esq") and n >= 5 and k in (1, 3):
            return "branco", it.vidro()
        if a >= 2:
            return ("salmao" if modelo == 1 else "branco"), "atlas"
        return "branco", "atlas"

    cab = casinha([(zc0, lc, pc, (ya + yb) / 2, 0.5, 0.45), (zc0 + 0.22, lc, pc, (ya + yb) / 2, 0.5, 0.45),
                   (zc0 + 0.44, lc, pc, (ya + yb) / 2, 0.5, 0.45),
                   (zc0 + 0.55, lc - 0.12, pc - 0.14, (ya + yb) / 2, 0.44, 0.45),
                   (zc0 + 0.6, lc - 0.36, pc - 0.4, (ya + yb) / 2, 0.34, 0.45)],
                  seg=4, nx=2, ny=5, cor_fn=cor_cab, topo="salmao" if modelo == 1 else "branco", nome="cabine")
    it.add(cab)
    ztop = zc0 + 0.6
    if modelo == 1:  # para-brisa escuro em gota na frente da casa
        g = sup(1.0, 1.25, 0.3, y=ya + 0.85, z=ztop - 0.22, cor=None, mat="janela_apagada", e=0.5)
        it.add(g)
    else:  # escotilha quadrada e cockpit quadrado
        it.add(caixa(0.62, 0.62, 0.08, y=ya + 0.75, z=ztop - 0.02, cor="branco", bisel=0.03))
        it.add(caixa(0.44, 0.44, 0.03, y=ya + 0.75, z=ztop + 0.05, cor=None, mat="janela_apagada", bisel=0.01))
    # porta (gaiúta) na face de trás da casa, abre para trás
    ypt = yb + 0.005
    porta = [caixa(0.62, 0.05, 0.42, y=ypt + 0.02, z=zc0 + 0.08, cor="laranja_claro", bisel=0.02)]
    porta.append(caixa(0.36, 0.02, 0.18, y=ypt + 0.05, z=zc0 + 0.27, cor=None, mat=it.vidro(), bisel=0.005))
    it.porta(porta, (0.31, ypt, zc0 + 0.08), eixo="z", angulo=-100, nome="porta_cabine")
    # cockpit: piso rebaixado com bancos e braçola
    y0, y1 = c.y(0.34), c.y(0.07)
    zc = c.deque(0.2)
    lck = 1.9
    piso = caixa(lck, y1 - y0, 0.04, y=(y0 + y1) / 2, z=zc, cor="laranja_escuro", bisel=0.02)
    it.add(piso)
    for sx in (1, -1):
        it.add(caixa(0.12, y1 - y0, 0.3, x=sx * (lck / 2 + 0.06), y=(y0 + y1) / 2, z=zc, cor="branco", bisel=0.04))
        it.add(almofada(0.42, y1 - y0 - 0.2, 0.12, sx * (lck / 2 - 0.2), (y0 + y1) / 2, zc + 0.26,
                        "branco" if modelo == 1 else "creme"))
        it.add(caixa(0.44, y1 - y0 - 0.15, 0.24, x=sx * (lck / 2 - 0.2), y=(y0 + y1) / 2, z=zc + 0.02,
                        cor="laranja_claro", bisel=0.03))
    # roda de leme
    yr = y1 - 0.45
    it.add(mb.cilindro(0.06, 0.55, y=yr, z=zc, cor="grafite", seg=10))
    roda = mb.torno([(0.36 + 0.025 * math.cos(math.radians(a)), 0.025 * math.sin(math.radians(a)))
                     for a in range(-90, 271, 45)], cor="grafite", seg=20)
    mb.transforma(roda, rot=("X", 90))
    raios = [haste((0, 0, 0), (0.36 * math.cos(k * math.pi / 3), 0, 0.36 * math.sin(k * math.pi / 3)), 0.015,
                   cor="grafite", seg=6) for k in range(6)]
    for o in [roda] + raios:
        mb.transforma(o, loc=(0, yr - 0.05, zc + 0.8))
    it.add(roda, raios)
    for k, sx in enumerate((1, -1)):
        it.assento(sx * (lck / 2 - 0.2), (y0 + y1) / 2 - 0.4, zc + 0.36)
        it.assento(sx * (lck / 2 - 0.2), (y0 + y1) / 2 + 0.4, zc + 0.36)
    # mastro, retranca, velas e cabos
    zm0 = ztop - 0.02 if modelo == 1 else ztop - 0.02
    alt_m = 12.2
    zmt = zm0 + alt_m
    it.add(mastro(0, ym, zm0, alt_m))
    zr = zm0 + 1.15
    yr0, yr1 = ym + 0.1, c.y(0.12)
    ret = mb.cilindro(0.055, yr1 - yr0, x=0, y=(yr0 + yr1) / 2, z=zr, eixo="y", cor="cinza_claro", seg=10)
    vg = vela((0, ym + 0.1, zmt - 0.35), (0, ym + 0.1, zr + 0.08), (0, yr1 - 0.1, zr + 0.08), curva=0.06,
              cor=vela_cor, lado=1.0, bainha=vela_bainha)
    it.anima([ret, vg], {"anima": "balancar", "angulo": 4, "periodo": 3.5, "eixo": "y"}, "vela_grande",
             pivo=(0, ym, zr))
    yp = c.y(0.995)
    zp = c.zt(1.0) + 0.1
    it.add(vela((0, ym - 0.08, zmt - 1.3), (0, yp + 0.25, zp + 0.25), (0.55, ym + 0.9, zm0 + 0.3), curva=0.07,
                cor=vela_cor, lado=-1.0, bainha=vela_bainha))
    cabos = [tubo([(0, ym, zmt - 0.1), (0, yp + 0.05, zp)], 0.012, cor="grafite"),
             tubo([(0, ym, zmt - 0.1), (0, c.y(0.0) + 0.1, c.zt(0) + 0.12)], 0.012, cor="grafite")]
    for sx in (1, -1):
        xs = c.w(um - 0.03) - 0.12
        cabos.append(tubo([(sx * xs, ym + 0.25, zd + 0.05), (sx * 0.75, ym, zm0 + alt_m * 0.5),
                           (0, ym, zmt - 0.9)], 0.011, cor="grafite", raio_curva=0.02))
    it.add(cabos)
    it.add(caixa(1.5, 0.06, 0.05, y=ym, z=zm0 + alt_m * 0.5, cor="cinza_claro", bisel=0.02))
    it.add(lampada(0, ym, zmt + 0.06))
    it.add(luzes_navegacao(c, u=0.88, z_extra=0.15))
    # quilha, leme e hélice
    it.add(quilha(c, 0.42, 0.62, -0.66))
    it.add(leme(c.y(0.05), c.zb(0.05) + 0.15, -0.6, corda=0.42))
    helice(it, (0, c.y(0.13), -0.44), r=0.17)
    # cabeços de amarração na proa e na popa
    for u in (0.93, 0.03):
        for sx in (1, -1):
            it.add(cabeco(sx * (c.w(u) - 0.25), c.y(u), c.deque(u, c.w(u) - 0.25) - 0.01, r=0.045))
    it.colisao(col_casco(c) + [((0, (ya + yb) / 2, 0.9), (lc, pc, 0.75))])
    return c


def p_veleiro_branco(it):
    return p_veleiro(it, "branco", "cinza_claro", modelo=1)


def p_veleiro_vermelho(it):
    return p_veleiro(it, "vermelho", "vermelho_escuro", modelo=2)


def p_veleiro_madeira(it, casco_cor="verde_escuro", fundo="vermelho_escuro", vela_cor="madeira_rosada", ketch=False):
    """Veleiro de madeira, aberto, com bancos e velas de lona marrom."""
    L = 8.4 if not ketch else 9.0
    c = casco(it, L=L, B=2.75, fb0=0.85, fb1=1.15, calado=0.4, popa=0.62, um=0.42, bico=1.7, forma=2.4,
              faixa=0.0, faixa2=0.12, camber=0.02,
              cores=dict(fundo=fundo, casco=casco_cor, faixa2="madeira_escura" if not ketch else "laranja",
                         deque="laranja"))
    it.add(borda(c, 0.12, 0.2, cor="madeira_escura" if not ketch else "madeira_media"))
    # tábuas do convés (frisos) e bancos
    tab = []
    for k in range(-3, 4):
        x = k * 0.3
        us = [u for u in c.secoes() if c.w(u) - 0.15 > abs(x) + 0.08]
        y0, y1 = c.y(us[-1]), c.y(us[0])
        tab.append(caixa(0.012, y1 - y0 - 0.2, 0.006, x=x, y=(y0 + y1) / 2, z=c.deque(0.4, x) + 0.003,
                            cor="laranja_escuro", bisel=0, liso=False))
    it.add(tab)
    bancos = []
    for u in ((0.2, 0.42, 0.78) if not ketch else (0.15, 0.36, 0.78)):
        w = c.w(u) - 0.1
        zz = c.deque(u)
        bancos.append(caixa(2 * w, 0.32, 0.06, y=c.y(u), z=zz + 0.36, cor="madeira_mel", bisel=0.015))
        for sx in (1, -1):
            bancos.append(caixa(0.06, 0.26, 0.36, x=sx * (w - 0.25), y=c.y(u), z=zz, cor="madeira", bisel=0.01))
        it.assento(0.45, c.y(u), zz + 0.42)
        it.assento(-0.45, c.y(u), zz + 0.42)
    it.add(bancos)
    # paneiro de proa (pequeno convés fechado) com escotilha
    up = 0.86
    yv0, yv1 = c.y(0.97), c.y(0.72)
    pr = casinha([(c.deque(0.84) - 0.05, 1.7, yv1 - yv0, (yv0 + yv1) / 2, 0.4, 0.95),
                  (c.deque(0.84) + 0.2, 1.62, yv1 - yv0 - 0.06, (yv0 + yv1) / 2, 0.38, 0.95)],
                 seg=3, cor="laranja_claro" if not ketch else "branco_gelo", nome="paneiro")
    it.add(pr)
    zesc = c.deque(0.84) + 0.2
    it.porta([caixa(0.5, 0.5, 0.05, y=c.y(0.8), z=zesc, cor="madeira", bisel=0.02),
              caixa(0.3, 0.02, 0.03, y=c.y(0.8) - 0.18, z=zesc + 0.05, cor="latao", bisel=0.008)],
             (0, c.y(0.8) + 0.25, zesc), eixo="x", angulo=-100, nome="escotilha")
    # mastro de madeira e velas
    um = 0.66
    ym = c.y(um)
    zm0 = c.deque(um)
    alt_m = 9.6 if not ketch else 10.4
    zmt = zm0 + alt_m
    it.add(mastro(0, ym, zm0, alt_m, 0.08, 0.05, cor="madeira_media"))
    zr = zm0 + 1.1
    yr1 = c.y(0.16 if not ketch else 0.3)
    ret = mb.cilindro(0.05, yr1 - ym, x=0, y=(ym + yr1) / 2, z=zr, eixo="y", cor="madeira_media", seg=10)
    vg = vela((0, ym + 0.1, zmt - 0.3), (0, ym + 0.1, zr + 0.07), (0, yr1 - 0.08, zr + 0.07), curva=0.07,
              cor=vela_cor, lado=1.0, bainha="madeira_escura")
    it.anima([ret, vg], {"anima": "balancar", "angulo": 4, "periodo": 3.8, "eixo": "y"}, "vela_grande",
             pivo=(0, ym, zr))
    yp = c.y(0.995)
    zp = c.zt(1.0) + 0.1
    # gurupés
    it.add(mb.cilindro(0.04, 0.9, x=0, y=yp - 0.2, z=zp + 0.05, eixo="y", cor="madeira_media", seg=8))
    it.add(vela((0, ym - 0.08, zmt - 1.2), (0, yp - 0.5, zp + 0.15), (0.5, ym + 0.7, zm0 + 0.6), curva=0.07,
                cor=vela_cor, lado=-1.0, bainha="madeira_escura"))
    cabos = [tubo([(0, ym, zmt - 0.1), (0, yp - 0.6, zp + 0.08)], 0.013, cor="bege_escuro"),
             tubo([(0, ym, zmt - 0.1), (0, c.y(0.0) + 0.1, c.zt(0) + 0.2)], 0.013, cor="bege_escuro")]
    for sx in (1, -1):
        cabos.append(tubo([(sx * (c.w(um) - 0.1), ym + 0.3, c.zt(um) + 0.2), (0, ym, zmt - 0.7)], 0.012,
                          cor="bege_escuro"))
    it.add(cabos)
    if ketch:  # mezena (mastro pequeno à popa)
        um2 = 0.1
        y2 = c.y(um2)
        z20 = c.deque(um2)
        it.add(mastro(0, y2, z20, 5.2, 0.06, 0.04, cor="madeira_media"))
        it.add(vela((0, y2 + 0.07, z20 + 5.0), (0, y2 + 0.07, z20 + 1.0), (0, y2 + 1.5, z20 + 1.0), curva=0.06,
                    cor=vela_cor, lado=1.0, bainha="madeira_escura"))
        it.add(mb.cilindro(0.04, 1.6, x=0, y=y2 + 0.8, z=z20 + 0.93, eixo="y", cor="madeira_media", seg=8))
        it.add(tubo([(0, y2, z20 + 5.1), (0, ym, zm0 + alt_m * 0.6)], 0.011, cor="bege_escuro"))
    it.add(lampada(0, ym, zmt + 0.06))
    it.add(luzes_navegacao(c, u=0.86, z_extra=0.25))
    it.add(quilha(c, 0.38, 0.6, -0.62, cor=fundo))
    it.add(leme(c.y(0.0) + 0.12, c.zt(0) + 0.1, -0.55, corda=0.38, cor="madeira_media"))
    it.add(mb.cilindro(0.03, 0.9, x=0, y=c.y(0.0) - 0.25, z=c.zt(0) + 0.25, eixo="y", cor="madeira_escura", seg=8))
    helice(it, (0, c.y(0.12), -0.42), r=0.15, cor="cobre")
    for u in (0.92, 0.03):
        for sx in (1, -1):
            it.add(cabeco(sx * (c.w(u) - 0.25), c.y(u), c.deque(u, c.w(u) - 0.25) - 0.01, cor="latao", r=0.04))
    it.colisao(col_casco(c, z_topo=c.zt(0.5) + 0.2))
    return c


def p_veleiro_madeira_verde(it):
    return p_veleiro_madeira(it, "verde_escuro", "vermelho_escuro", "madeira_rosada")


def p_veleiro_madeira_laranja(it):
    return p_veleiro_madeira(it, "laranja", "terracota_escura", "madeira_cinza", ketch=True)


# ======================================================================================================================
# Iates
# ======================================================================================================================
def p_iate_cupula(it):
    """Iate de 10 m com cabine em cúpula azul brilhante."""
    c = casco(it, L=10.0, B=3.4, fb0=1.0, fb1=1.45, calado=0.45, popa=0.82, um=0.38, bico=1.7, forma=3.2,
              faixa=0.12, faixa2=0.14, cores=dict(fundo="vermelho", faixa="vermelho_escuro", casco="branco",
                                                   faixa2="cinza_claro", deque="laranja"))
    it.add(borda(c, 0.11, 0.08, cor="cinza_claro"))
    it.add(guarda_corpo(c, alt=0.5, u0=0.55, inset=0.08, cor="cinza", meio=False))
    ya, yb = c.y(0.78), c.y(0.28)
    yc = (ya + yb) / 2
    z0 = c.deque(0.5) - 0.05

    def para_brisa(tag):
        lado, k, n = tag
        return lado == "frente" or (lado == "c2" and k >= n // 2) or (lado == "c3" and k < n - n // 2)

    def cor_c(a, i, tag, cen):
        lado, k, n = tag
        if a in (2, 3) and para_brisa(tag):
            return "azul_claro", "janela_fria"
        if a == 2 and lado in ("dir", "esq") and k % 2 == 1:
            return "azul_claro", it.vidro()
        if a <= 1:
            return "azul_celeste", "atlas"
        return "azul_claro", "atlas"

    cab = casinha([(z0, 2.7, yb - ya, yc, 1.0, 0.75), (z0 + 0.25, 2.72, yb - ya, yc, 1.0, 0.75),
                   (z0 + 0.6, 2.62, yb - ya - 0.3, yc + 0.1, 0.95, 0.72),
                   (z0 + 1.1, 2.35, yb - ya - 1.0, yc + 0.45, 0.85, 0.65),
                   (z0 + 1.42, 1.9, yb - ya - 1.9, yc + 0.75, 0.7, 0.5),
                   (z0 + 1.55, 1.3, yb - ya - 2.8, yc + 0.9, 0.5, 0.4)],
                  seg=5, nx=2, ny=7, cor_fn=cor_c, topo="azul_claro", nome="cupula")
    it.add(cab)
    # chapéu azul-escuro (arco do radar) sobre a cúpula
    zt_ = z0 + 1.5
    it.add(casinha([(zt_, 1.5, 1.6, yc + 0.95, 0.6, 0.3), (zt_ + 0.35, 1.6, 1.8, yc + 1.05, 0.65, 0.3),
                    (zt_ + 0.5, 1.4, 1.55, yc + 1.1, 0.55, 0.3)], seg=4, cor="azul_medio", nome="chapeu"))
    it.add(lampada(0, yc + 1.1, zt_ + 0.6))
    it.add(caixa(1.75, 0.18, 0.12, y=yc + 1.0, z=zt_ + 0.12, cor="azul_escuro", bisel=0.04))
    # popa: cockpit aberto com sofá em U e plataforma de banho
    y0, y1 = yb + 0.05, c.y(0.02)
    zc = c.deque(0.15)
    it.add(caixa(2.4, y1 - y0, 0.04, y=(y0 + y1) / 2, z=zc, cor="madeira_mel", bisel=0.02))
    sofa = [caixa(2.3, 0.5, 0.36, y=y1 - 0.35, z=zc, cor="branco", bisel=0.05),
            almofada(2.1, 0.46, 0.12, 0, y1 - 0.38, zc + 0.34, "azul_celeste"),
            almofada(2.1, 0.16, 0.36, 0, y1 - 0.14, zc + 0.4, "azul_celeste")]
    it.add(sofa)
    for sx in (-0.7, 0.0, 0.7):
        it.assento(sx, y1 - 0.38, zc + 0.46)
    it.add(caixa(2.6, 0.6, 0.08, y=c.y(0.0) + 0.42, z=0.25, cor="madeira_mel", bisel=0.03))
    for sx in (1, -1):
        it.add(caixa(0.06, 0.5, 0.35, x=sx * 1.2, y=c.y(0.0) + 0.3, z=0.0, cor="grafite", bisel=0.02))
    # porta de correr da cabine (vidro) na face de trás
    it.correr([caixa(1.0, 0.05, 1.05, x=0.3, y=yb - 0.15, z=z0 + 0.12, cor="azul_claro", bisel=0.03),
               caixa(0.8, 0.02, 0.85, x=0.3, y=yb - 0.12, z=z0 + 0.22, cor=None, mat=it.vidro(), bisel=0.01)],
              direcao=(-1, 0, 0), curso=0.9, nome="porta_cabine")
    # escotilhas no costado da proa
    it.add(portinholas(it, c, (0.8, 0.86), 0.62, r=0.12))
    # proa: cabeços, âncora
    for u in (0.92, 0.05):
        for sx in (1, -1):
            it.add(cabeco(sx * (c.w(u) - 0.28), c.y(u), c.deque(u, c.w(u) - 0.28) - 0.01, r=0.045))
    it.add(caixa(0.5, 0.5, 0.15, y=c.y(0.92), z=c.deque(0.92) - 0.02, cor="cinza", bisel=0.05))
    it.add(luzes_navegacao(c, u=0.7, z_extra=0.18))
    it.add(leme(c.y(0.05), c.zb(0.05) + 0.12, -0.6, corda=0.4))
    helice(it, (0.55, c.y(0.12), -0.47), r=0.18, nome="helice_bombordo")
    helice(it, (-0.55, c.y(0.12), -0.47), r=0.18, nome="helice_boreste")
    it.colisao(col_casco(c) + [((0, yc, 1.0), (2.7, yb - ya, zt_ + 0.5 - 1.0))])
    return c


def p_iate_flybridge(it):
    """Iate de 11 m com dois andares: salão de janelas azuis e flybridge branco com arco."""
    c = casco(it, L=11.0, B=3.5, fb0=1.05, fb1=1.5, calado=0.48, popa=0.84, um=0.38, bico=1.6, forma=3.4,
              faixa=0.1, faixa2=0.0, cores=dict(fundo="azul_medio", faixa="azul_medio", casco="branco",
                                                 deque="laranja"))
    it.add(borda(c, 0.12, 0.08, cor="branco"))
    it.add(guarda_corpo(c, alt=0.5, u0=0.6, inset=0.08, cor="cinza", meio=False))
    ya, yb = c.y(0.8), c.y(0.25)
    yc = (ya + yb) / 2
    z0 = c.deque(0.5) - 0.05
    pc = yb - ya

    def cor_baixo(a, i, tag, cen):
        lado, k, n = tag
        if a == 1:
            if lado == "frente" or lado in ("c2", "c3"):
                return "azul_claro", "janela_fria"
            if lado in ("dir", "esq") and k % 2 == 1:
                return "azul_claro", it.vidro()
            return "azul_claro", "atlas"
        return ("azul_celeste" if a == 0 else "azul_claro"), "atlas"

    it.add(casinha([(z0, 2.9, pc, yc, 1.1, 0.8), (z0 + 0.35, 2.92, pc, yc, 1.1, 0.8),
                    (z0 + 0.95, 2.7, pc - 0.5, yc + 0.2, 1.0, 0.75), (z0 + 1.1, 2.6, pc - 0.8, yc + 0.3, 0.9, 0.7)],
                   seg=5, nx=2, ny=7, cor_fn=cor_baixo, topo="azul_claro", nome="salao"))
    # faixa cinza e andar de cima branco
    z1 = z0 + 1.08
    it.add(casinha([(z1, 2.66, pc - 0.7, yc + 0.28, 0.9, 0.7), (z1 + 0.16, 2.7, pc - 0.6, yc + 0.28, 0.9, 0.7)],
                   seg=5, cor="grafite", nome="faixa_cinza"))
    z2 = z1 + 0.16

    def cor_cima(a, i, tag, cen):
        lado, k, n = tag
        if a == 1 and (lado == "frente" or (lado == "c2" and k >= n // 2) or (lado == "c3" and k < n - n // 2)):
            return "branco", "janela_apagada"
        return "branco", "atlas"

    it.add(casinha([(z2, 2.7, pc - 0.6, yc + 0.28, 0.9, 0.7), (z2 + 0.25, 2.66, pc - 0.8, yc + 0.38, 0.9, 0.7),
                    (z2 + 0.55, 2.5, pc - 1.6, yc + 0.7, 0.8, 0.6), (z2 + 0.62, 2.35, pc - 1.9, yc + 0.8, 0.7, 0.6)],
                   seg=5, cor_fn=cor_cima, topo="branco", nome="flybridge"))
    # arco (hardtop) por cima do flybridge
    z3 = z2 + 0.6
    ya3 = ya + 1.6
    arco_pts = [(1.05, ya3 + 1.25, z3), (1.0, ya3 + 1.05, z3 + 0.6), (0.75, ya3 + 0.95, z3 + 0.85),
                (-0.75, ya3 + 0.95, z3 + 0.85), (-1.0, ya3 + 1.05, z3 + 0.6), (-1.05, ya3 + 1.25, z3)]
    m = Malha()
    varre(m, [V(p) for p in mb._arredonda_cantos(arco_pts, 0.3, 4)], perfil_ret(0.5, 0.12, r=0.05, n=1, b0=-0.06),
          "branco", fechado=False)
    it.add(m.obj("arco", angulo=50))
    it.add(caixa(0.5, 0.25, 0.08, y=ya3 + 0.95, z=z3 + 0.88, cor="grafite", bisel=0.03))
    it.add(lampada(0, ya3 + 0.95, z3 + 1.02))
    # bancos do flybridge e para-brisa
    zf = z2 + 0.62
    for sx in (-0.55, 0.55):
        it.add(caixa(0.5, 0.5, 0.35, x=sx, y=yc + 0.6, z=zf, cor="branco", bisel=0.05))
        it.add(almofada(0.48, 0.48, 0.1, sx, yc + 0.6, zf + 0.33, "azul_celeste"))
        it.add(almofada(0.48, 0.12, 0.35, sx, yc + 0.84, zf + 0.38, "azul_celeste"))
        it.assento(sx, yc + 0.6, zf + 0.43)
    it.add(caixa(1.6, 0.5, 0.55, y=yc - 0.5, z=zf, cor="branco", bisel=0.08))
    it.add(caixa(1.4, 0.06, 0.25, y=yc - 0.72, z=zf + 0.5, cor=None, mat="vidro", bisel=0.02))
    # escada da popa para o flybridge
    for k in range(5):
        it.add(caixa(0.5, 0.18, 0.04, x=0.85, y=yb + 0.15 + k * 0.0, z=z0 + 0.3 * (k + 1), cor="cinza_claro",
                     bisel=0.01, seg=1))
    it.add(tubo([(1.12, yb + 0.25, z0 + 0.2), (1.12, yb + 0.05, z2 + 0.6)], 0.02, cor="cinza"))
    # cockpit da popa
    y0, y1 = yb + 0.05, c.y(0.02)
    zc = c.deque(0.15)
    it.add(caixa(2.5, y1 - y0, 0.04, y=(y0 + y1) / 2, z=zc, cor="madeira_mel", bisel=0.02))
    it.add(caixa(2.4, 0.5, 0.36, y=y1 - 0.35, z=zc, cor="branco", bisel=0.05))
    it.add(almofada(2.2, 0.46, 0.12, 0, y1 - 0.38, zc + 0.34, "cinza_claro"))
    it.assento(-0.6, y1 - 0.38, zc + 0.46)
    it.assento(0.6, y1 - 0.38, zc + 0.46)
    it.add(caixa(2.7, 0.65, 0.08, y=c.y(0.0) + 0.45, z=0.25, cor="madeira_mel", bisel=0.03))
    it.porta([caixa(0.8, 0.05, 1.0, x=-0.3, y=yb - 0.02, z=z0 + 0.1, cor="azul_claro", bisel=0.03),
              caixa(0.6, 0.02, 0.6, x=-0.3, y=yb + 0.01, z=z0 + 0.35, cor=None, mat=it.vidro(), bisel=0.01)],
             (-0.7, yb, z0 + 0.1), eixo="z", angulo=100, nome="porta_salao")
    it.add(portinholas(it, c, (0.78, 0.85, 0.92), 0.7, r=0.11))
    for u in (0.93, 0.05):
        for sx in (1, -1):
            it.add(cabeco(sx * (c.w(u) - 0.28), c.y(u), c.deque(u, c.w(u) - 0.28) - 0.01, r=0.045))
    it.add(luzes_navegacao(c, u=0.72, z_extra=0.16))
    it.add(leme(c.y(0.05), c.zb(0.05) + 0.12, -0.62, corda=0.42))
    helice(it, (0.55, c.y(0.12), -0.48), r=0.18, nome="helice_bombordo")
    helice(it, (-0.55, c.y(0.12), -0.48), r=0.18, nome="helice_boreste")
    it.colisao(col_casco(c) + [((0, yc + 0.2, 1.0), (2.9, pc - 0.4, 2.4))])
    return c


# ======================================================================================================================
# Barcos de passeio com toldo
# ======================================================================================================================
def p_passeio(it, casco_cor="branco", faixa_cor="laranja", fundo="verde_agua", cab_cor="branco", cab2="laranja",
              aro="verde_agua", toldo="laranja", deque="laranja"):
    """Barco de passeio de 10 m: casa com janelas, toldo no alto (flybridge) e boias salva-vidas no costado."""
    c = casco(it, L=10.0, B=3.6, fb0=1.1, fb1=1.6, calado=0.5, popa=0.8, um=0.4, bico=1.5, forma=3.0,
              faixa=0.14, faixa2=0.18, cores=dict(fundo=fundo, faixa=fundo, casco=casco_cor, faixa2=faixa_cor,
                                                   deque=deque))
    it.add(borda(c, 0.13, 0.1, cor=casco_cor))
    it.add(guarda_corpo(c, alt=0.6, u0=0.52, inset=0.09, cor="cinza", meio=True))
    ya, yb = c.y(0.74), c.y(0.24)
    yc = (ya + yb) / 2
    z0 = c.deque(0.5) - 0.05
    pc = yb - ya

    def cor_casa(a, i, tag, cen):
        lado, k, n = tag
        if a == 1:
            if lado == "frente" or (lado in ("c2", "c3") and cen.y < yc - 1.2):
                return cab_cor, "janela_fria"
            if lado in ("dir", "esq") and k in (1, 3):
                return cab_cor, it.vidro()
            return cab_cor, "atlas"
        if a == 0:
            return cab2, "atlas"
        return cab_cor, "atlas"

    it.add(casinha([(z0, 2.9, pc, yc, 0.7, 0.5), (z0 + 0.5, 2.9, pc, yc, 0.7, 0.5),
                    (z0 + 1.15, 2.84, pc - 0.25, yc + 0.1, 0.66, 0.5), (z0 + 1.32, 2.76, pc - 0.35, yc + 0.12, 0.6, 0.5)],
                   seg=4, nx=2, ny=5, cor_fn=cor_casa, topo=cab_cor, nome="casa"))
    # aro do flybridge (borda grossa) e piso de cima
    z1 = z0 + 1.32
    m = Malha()
    cont, _ = ret_div(3.0, pc + 0.1, 0.7, seg=4, nx=1, ny=1, bico=0.5)
    cam = [V((x, y + yc + 0.07, z1)) for x, y in cont]
    varre(m, cam, perfil_ret(0.18, 0.3, r=0.08, n=1, b0=-0.02), aro, fechado=True)
    it.add(m.obj("aro_flybridge", angulo=50))
    it.add(caixa(2.6, pc - 0.4, 0.04, y=yc + 0.1, z=z1, cor=deque, bisel=0.02))
    # console e banco no flybridge
    it.add(caixa(1.3, 0.5, 0.65, y=yc - pc / 2 + 0.8, z=z1, cor=cab_cor, bisel=0.08))
    it.add(caixa(1.1, 0.06, 0.25, y=yc - pc / 2 + 0.6, z=z1 + 0.6, cor=None, mat="vidro", bisel=0.02))
    it.add(caixa(1.6, 0.5, 0.38, y=yc + 0.5, z=z1, cor=cab_cor, bisel=0.06))
    it.add(almofada(1.5, 0.46, 0.1, 0, yc + 0.5, z1 + 0.36, aro))
    it.assento(-0.4, yc + 0.5, z1 + 0.46)
    it.assento(0.4, yc + 0.5, z1 + 0.46)
    # toldo sobre quatro colunas (curvado, com aba)
    zt_ = z1 + 2.0
    for sx in (1, -1):
        for yy in (yc - pc / 2 + 1.1, yc + pc / 2 - 0.4):
            it.add(mb.cilindro(0.05, zt_ - z1, x=sx * 1.1, y=yy, z=z1, cor="cinza_claro", seg=10, bisel=0))
    tl = Malha()
    nl, nc = 10, 8
    lt, pt_ = 2.9, pc + 0.4
    grade = []
    for j in range(nc + 1):
        linha = []
        for i in range(nl + 1):
            x = -lt / 2 + lt * i / nl
            y = yc - pt_ / 2 + 0.3 + pt_ * j / nc
            z = zt_ + 0.18 * (1 - (2 * x / lt) ** 2) + 0.12 * (1 - (2 * (j / nc) - 1) ** 2)
            linha.append(tl.p((x, y, z)))
        grade.append(linha)
    for j in range(nc):
        for i in range(nl):
            tl.face([grade[j][i], grade[j][i + 1], grade[j + 1][i + 1], grade[j + 1][i]], toldo)
    it.add(tl.obj("toldo", angulo=60, esp=0.06))
    # aba do toldo
    ab = Malha()
    cont2, _ = ret_div(lt + 0.04, pt_ + 0.04, 0.35, seg=2, nx=3, ny=4)
    cam2 = []
    for x, y in cont2:
        yy = y + yc + 0.3
        z = zt_ + 0.18 * (1 - (2 * x / lt) ** 2) + 0.12 * (1 - (2 * ((yy - (yc - pt_ / 2 + 0.3)) / pt_) - 1) ** 2)
        cam2.append(V((x, yy, z - 0.02)))
    varre(ab, cam2, perfil_ret(0.08, 0.16, r=0.035, n=1, b0=-0.08), aro, fechado=True)
    it.add(ab.obj("aba_toldo", angulo=50))
    # boias salva-vidas penduradas no costado, perto da popa
    for sx in (1, -1):
        for u in (0.09, 0.17, 0.25):
            zb_ = c.zt(u) - 0.2
            x, nrm = c.lado(u, zb_)
            it.add(boia(sx * (x + 0.07), c.y(u), zb_, normal=(sx * nrm.x, nrm.y, 0), r=0.2, esp=0.06))
    # porta da casa (atrás) e escada
    it.porta([caixa(0.75, 0.05, 1.05, x=0.4, y=yb + 0.02, z=z0 + 0.1, cor=cab2, bisel=0.03),
              caixa(0.5, 0.02, 0.45, x=0.4, y=yb + 0.05, z=z0 + 0.55, cor=None, mat=it.vidro(), bisel=0.01)],
             (0.775, yb, z0 + 0.1), eixo="z", angulo=-100, nome="porta_casa")
    for k in range(4):
        it.add(caixa(0.45, 0.16, 0.04, x=-0.8, y=yb + 0.18, z=z0 + 0.33 * (k + 1), cor="cinza_claro", bisel=0.01,
                     seg=1))
    it.add(tubo([(-1.05, yb + 0.28, z0), (-1.05, yb + 0.12, z1 + 0.3)], 0.02, cor="cinza"))
    # popa: bancos
    y0, y1 = yb + 0.1, c.y(0.03)
    zc = c.deque(0.13)
    for sx in (1, -1):
        it.add(caixa(0.5, y1 - y0, 0.4, x=sx * 1.25, y=(y0 + y1) / 2, z=zc, cor=cab_cor, bisel=0.05))
        it.add(almofada(0.46, y1 - y0 - 0.06, 0.1, sx * 1.25, (y0 + y1) / 2, zc + 0.38, aro))
        it.assento(sx * 1.25, (y0 + y1) / 2, zc + 0.48)
    it.add(portinholas(it, c, (0.6, 0.68, 0.76), 0.68, r=0.13, aro=0.03))
    for u in (0.92, 0.05):
        for sx in (1, -1):
            it.add(cabeco(sx * (c.w(u) - 0.3), c.y(u), c.deque(u, c.w(u) - 0.3) - 0.01, r=0.045))
    it.add(luzes_navegacao(c, u=0.7, z_extra=0.2))
    it.add(lampada(0, yc, zt_ + 0.45))
    it.add(mb.cilindro(0.02, 0.15, x=0, y=yc, z=zt_ + 0.28, cor="cinza", seg=6, bisel=0))
    it.add(leme(c.y(0.05), c.zb(0.05) + 0.12, -0.62, corda=0.42))
    helice(it, (0, c.y(0.12), -0.48), r=0.19)
    it.colisao(col_casco(c) + [((0, yc, 1.2), (2.9, pc, 1.5))])
    return c


def p_passeio_laranja(it):
    p_passeio(it, "branco", "laranja", "verde_agua", "branco", "laranja", "turquesa", "laranja", "laranja")


def p_passeio_azul(it):
    p_passeio(it, "azul_medio", "laranja", "branco", "laranja", "turquesa", "branco", "laranja_claro", "laranja")


# ======================================================================================================================
# Lanchas e bote
# ======================================================================================================================
def motor_popa(it, c, cor="grafite", cor2="branco", nome="helice"):
    """Motor de popa preso no espelho, com a hélice embaixo d'água."""
    y = c.y(0.0) + c.raio_popa * 0.6 + 0.12
    zt = c.zt(0.0)
    objs = [sup(0.42, 0.55, 0.55, y=y + 0.1, z=zt + 0.05, cor=cor, e=0.45, e_v=0.5),
            sup(0.44, 0.57, 0.12, y=y + 0.1, z=zt + 0.32, cor=cor2, e=0.45, e_v=0.5),
            caixa(0.16, 0.24, zt + 0.3, y=y + 0.05, z=-0.25, cor=cor, bisel=0.05),
            caixa(0.06, 0.3, 0.22, y=y + 0.1, z=-0.42, cor=cor, bisel=0.02),
            sup(0.18, 0.4, 0.14, y=y + 0.02, z=-0.36, cor=cor, e=0.6, e_v=0.6)]
    it.add(objs)
    helice(it, (0, y - 0.24, -0.29), r=0.12, cor="metal", nome=nome)


def p_lancha(it, casco_cor="branco", faixa_cor="magenta", fundo="roxo", deque="laranja", banco="magenta",
             topo_cor="verde_lima", motor="verde", arco=False):
    """Lancha pequena (5,6 m) aberta, com console e para-brisa, motor de popa e cobertura (T-top ou arco)."""
    c = casco(it, L=5.6, B=2.15, fb0=0.62, fb1=0.85, calado=0.28, popa=0.86, um=0.4, bico=1.5, forma=3.2,
              faixa=0.08, faixa2=0.12, raio_popa=0.18,
              cores=dict(fundo=fundo, faixa=fundo, casco=casco_cor, faixa2=faixa_cor, deque=deque))
    it.add(borda(c, 0.12, 0.12, cor=casco_cor))
    it.add(guarda_corpo(c, alt=0.32, u0=0.62, inset=0.1, cor="cinza", meio=False, r=0.016))
    # console central com para-brisa
    yk = c.y(0.55)
    zk = c.deque(0.55)
    it.add(caixa(0.95, 0.75, 0.75, y=yk, z=zk, cor=casco_cor, bisel=0.1))
    it.add(caixa(0.6, 0.04, 0.3, y=yk + 0.36, z=zk + 0.35, cor="grafite", bisel=0.02))
    # porta do console (guarda-volumes), na frente, dobradiça à esquerda
    it.porta([caixa(0.5, 0.04, 0.42, x=0.0, y=yk - 0.39, z=zk + 0.12, cor=banco, bisel=0.02),
              caixa(0.12, 0.03, 0.03, x=-0.15, y=yk - 0.42, z=zk + 0.45, cor="cinza_claro", bisel=0.01, seg=1)],
             (0.25, yk - 0.39, zk + 0.12), eixo="z", lado="esq", nome="porta_console")
    pb = Malha()
    arc = [V((0.62 * math.cos(math.radians(a)), yk - 0.1 - 0.28 * math.sin(math.radians(a)), 0.0))
           for a in range(10, 171, 16)]
    bases = [pb.p((p.x, p.y, zk + 0.72)) for p in arc]
    topos = [pb.p((p.x * 0.92, p.y + 0.18, zk + 1.12)) for p in arc]
    for i in range(len(arc) - 1):
        pb.face([bases[i], bases[i + 1], topos[i + 1], topos[i]], None, "vidro")
    it.add(pb.obj("para_brisa", esp=0.02))
    it.add(tubo([(p.x * 0.92, p.y + 0.18, zk + 1.13) for p in arc], 0.018, cor="cinza_claro"))
    it.add(mb.torno([(0.17 + 0.02 * math.cos(math.radians(a)), 0.02 * math.sin(math.radians(a)))
                     for a in range(-90, 271, 45)], x=0, y=yk + 0.32, z=zk + 0.9, cor="grafite", seg=16))
    # bancos: dois de piloto e sofá de popa
    for sx in (-0.32, 0.32):
        it.add(mb.cilindro(0.06, 0.35, x=sx, y=yk + 0.75, z=zk, cor="cinza_claro", seg=8))
        it.add(almofada(0.45, 0.45, 0.14, sx, yk + 0.75, zk + 0.35, banco))
        it.add(almofada(0.45, 0.12, 0.4, sx, yk + 0.95, zk + 0.42, banco))
        it.assento(sx, yk + 0.75, zk + 0.49)
    y1 = c.y(0.05)
    zc = c.deque(0.1)
    it.add(caixa(1.8, 0.45, 0.32, y=y1 - 0.25, z=zc, cor=casco_cor, bisel=0.05))
    it.add(almofada(1.7, 0.42, 0.12, 0, y1 - 0.27, zc + 0.3, banco))
    it.add(almofada(1.7, 0.12, 0.32, 0, y1 - 0.08, zc + 0.36, banco))
    it.assento(-0.45, y1 - 0.27, zc + 0.42)
    it.assento(0.45, y1 - 0.27, zc + 0.42)
    # proa: solário
    yp0, yp1 = c.y(0.88), c.y(0.68)
    it.add(almofada(1.1, yp1 - yp0, 0.12, 0, (yp0 + yp1) / 2, c.deque(0.78), banco))
    # cobertura
    zc_top = zk + 1.85
    if not arco:  # T-top em quatro colunas
        for sx in (1, -1):
            for yy in (yk + 0.15, yk + 1.05):
                it.add(mb.cilindro(0.035, zc_top - zk, x=sx * 0.55, y=yy, z=zk, cor=topo_cor, seg=8))
        it.add(casinha([(zc_top, 1.5, 1.6, yk + 0.6, 0.35), (zc_top + 0.08, 1.56, 1.68, yk + 0.6, 0.38),
                        (zc_top + 0.14, 1.44, 1.56, yk + 0.6, 0.32)], seg=4, cor=topo_cor, topo="branco",
                       nome="t_top"))
    else:  # arco curvado (santo-antônio) de proa a popa
        pts = [(0.0, yk - 0.05, zk + 0.75), (0.0, yk + 0.1, zk + 1.6), (0.0, yk + 0.9, zk + 1.85),
               (0.0, c.y(0.12), zc + 1.0), (0.0, c.y(0.08), zc + 0.2)]
        for sx in (1, -1):
            ps = [V((sx * 0.68, y, z)) for _, y, z in pts]
            ps = mb._arredonda_cantos(ps, 0.4, 4)
            m = Malha()
            varre(m, ps, perfil_ret(0.12, 0.2, r=0.05, n=1, b0=-0.1), topo_cor, fechado=False)
            it.add(m.obj("arco", angulo=50))
        # ponte que une os dois lados por cima
        it.add(casinha([(zk + 1.75, 1.5, 0.75, yk + 0.55, 0.3), (zk + 1.9, 1.5, 0.8, yk + 0.55, 0.3),
                        (zk + 1.95, 1.4, 0.7, yk + 0.55, 0.28)], seg=3, cor=topo_cor, topo="amarelo", nome="ponte"))
    motor_popa(it, c, cor=motor, cor2="branco")
    it.add(luzes_navegacao(c, u=0.8, z_extra=0.16, r=0.045))
    it.add(lampada(0, yk + 0.6, zc_top + 0.22, r=0.05))
    for sx in (1, -1):
        it.add(cabeco(sx * (c.w(0.9) - 0.2), c.y(0.9), c.deque(0.9, c.w(0.9) - 0.2), r=0.035))
    it.colisao(col_casco(c, z_topo=c.zt(0.5) + 0.15) + [((0, yk, zk), (0.95, 0.75, 1.12))])
    return c


def p_lancha_verde(it):
    p_lancha(it, "branco", "magenta", "roxo", "laranja", "magenta", "verde_lima", "verde")


def p_lancha_vermelha(it):
    p_lancha(it, "vermelho", "laranja", "vermelho_escuro", "laranja_claro", "vermelho", "laranja", "vermelho",
             arco=True)


def p_bote(it):
    """Bote inflável (3,4 m): flutuadores em U, fundo rígido, motor de popa."""
    L, B = 3.4, 1.7
    r = 0.24
    m = Malha()
    # caminho dos flutuadores: U com a ponta arredondada na proa
    pts = []
    for k in range(9):
        pts.append(V((B / 2 - r, L / 2 - 0.1 - (L - 1.0) * k / 8, 0.0)))
    yb = -L / 2 + (B / 2 - r)
    for k in range(1, 12):
        t = math.radians(180 * k / 12)
        pts.append(V(((B / 2 - r) * math.cos(t), yb - (B / 2 - r) * math.sin(t) * 0.9, 0.0)))
    for k in range(9):
        pts.append(V((-(B / 2 - r), -L / 2 + 0.5 + (L - 1.0) * k / 8, 0.0)))
    for p in pts:  # proa levantada
        if p.y < -L / 2 + 0.9:
            p.z = 0.12 * ((-L / 2 + 0.9 - p.y) / 0.9) ** 2
    secao = [(r * math.cos(math.radians(a)), r * math.sin(math.radians(a)) + 0.18) for a in range(0, 360, 30)]
    varre(m, pts, secao, "laranja", fechado=False)
    flut = m.obj("flutuadores", angulo=60)
    mb.pinta_onde(flut, "grafite", lambda c, n: c.z < 0.0)
    it.add(flut)
    # fundo rígido e espelho de popa
    fundo = mb.extrudado(_ccw([(p.x * 0.85, p.y * 0.97) for p in pts]), 0.14, z=-0.12, cor="cinza", bisel=0.03)
    it.add(fundo)
    it.add(caixa(B - 2 * r + 0.1, 0.08, 0.5, y=L / 2 - 0.1, z=-0.1, cor="grafite", bisel=0.02))
    it.add(caixa(B - 2 * r, 0.3, 0.05, y=0.3, z=0.25, cor="madeira_mel", bisel=0.015))
    it.assento(0, 0.3, 0.3)
    it.assento(0, 1.05, 0.05)
    # alça de corda nos flutuadores
    for sx in (1, -1):
        cord = [V((sx * (B / 2 - 0.05), -0.9 + 0.3 * k, 0.32 + 0.04 * (k % 2))) for k in range(7)]
        it.add(tubo(cord, 0.012, cor="branco", seg=6))
    # motor de popa
    class _C:
        raio_popa = 0.0

        def y(self, u):
            return L / 2 - 0.06

        def zt(self, u):
            return 0.35
    motor_popa(it, _C(), cor="grafite", cor2="laranja")
    it.add(lampada(-0.15, L / 2 - 0.1, 0.55, mat="luz", r=0.04))
    for sx, mat in ((1, "luz_vermelha"), (-1, "neon")):
        it.add(caixa(0.06, 0.1, 0.06, x=sx * (B / 2 - r), y=-0.7, z=0.18 + r - 0.01, cor="grafite", bisel=0.01))
        it.add(mb.esfera(0.04, x=sx * (B / 2 - r), y=-0.7, z=0.18 + r + 0.07, cor=None, mat=mat, seg=8))
    it.colisao([((0, 0, -0.14), (B, L, 0.6))])


# ======================================================================================================================
# Barco de pesca
# ======================================================================================================================
def p_pesca(it):
    """Barco de pesca de 9,5 m: casaria de comando, mastro com pau de carga e rede, caixas de peixe e boias."""
    c = casco(it, L=9.5, B=3.3, fb0=1.0, fb1=1.55, calado=0.5, popa=0.7, um=0.45, bico=1.6, forma=2.6,
              faixa=0.12, faixa2=0.2, cores=dict(fundo="vermelho_escuro", faixa="branco", casco="turquesa",
                                                  faixa2="amarelo", deque="madeira_mel"))
    it.add(borda(c, 0.14, 0.22, cor="branco"))
    # casaria (cabine de comando) à frente do meio
    ya, yb = c.y(0.74), c.y(0.5)
    yc = (ya + yb) / 2
    z0 = c.deque(0.62) - 0.04
    pc = yb - ya

    def cor_cas(a, i, tag, cen):
        lado, k, n = tag
        if a == 1 and (lado == "frente" or (lado in ("dir", "esq") and k == 1) or (lado == "tras" and k == 0)):
            return "branco", it.vidro()
        return "branco", "atlas"

    it.add(casinha([(z0, 2.0, pc, yc, 0.3, 0.2), (z0 + 1.0, 2.0, pc, yc, 0.3, 0.2), (z0 + 1.6, 1.96, pc - 0.06, yc, 0.28,
                                                                                    0.2),
                    (z0 + 1.8, 1.9, pc - 0.12, yc, 0.25, 0.2)],
                   seg=3, nx=3, ny=3, cor_fn=cor_cas, topo="branco", nome="casaria"))
    it.add(casinha([(z0 + 1.8, 2.3, pc + 0.4, yc, 0.3, 0.2), (z0 + 1.95, 2.3, pc + 0.4, yc, 0.3, 0.2),
                    (z0 + 2.0, 2.2, pc + 0.3, yc, 0.26, 0.2)], seg=3, cor="vermelho", nome="teto"))
    it.porta([caixa(0.7, 0.05, 1.5, x=0.3, y=yb + 0.02, z=z0 + 0.05, cor="vermelho", bisel=0.03),
              caixa(0.45, 0.02, 0.4, x=0.3, y=yb + 0.05, z=z0 + 0.95, cor=None, mat=it.vidro(), bisel=0.01)],
             (0.65, yb, z0 + 0.05), eixo="z", angulo=-100, nome="porta_casaria")
    it.slot("assento_piloto", (0.0, yc + 0.1, z0 + 0.45), ASSENTO)
    it.add(caixa(0.5, 0.5, 0.45, y=yc + 0.1, z=z0, cor="madeira_media", bisel=0.04))
    # luz e buzina em cima
    zt_ = z0 + 2.0
    it.add(lampada(0.6, yc, zt_ + 0.1), mb.cilindro(0.1, 0.12, x=-0.5, y=yc, z=zt_, cor="cinza_claro", seg=10))
    it.add(caixa(0.06, 0.5, 0.06, x=0, y=yc, z=zt_ + 0.35, cor="grafite", bisel=0.01))
    it.add(mb.cilindro(0.02, 0.35, x=0, y=yc, z=zt_, cor="grafite", seg=6, bisel=0))
    # mastro com pau de carga e rede
    um = 0.42
    ym = c.y(um)
    zm = c.deque(um)
    it.add(mastro(0, ym, zm, 5.5, 0.08, 0.06, cor="branco"))
    it.add(lampada(0, ym, zm + 5.55))
    it.add(haste((0, ym, zm + 1.2), (0, c.y(0.08), zm + 2.8), 0.05, cor="amarelo"))
    it.add(tubo([(0, ym, zm + 5.2), (0, c.y(0.08), zm + 2.8)], 0.012, cor="grafite"))
    it.add(tubo([(0, ym, zm + 5.2), (0, c.y(0.9), c.zt(0.9) + 0.25)], 0.012, cor="grafite"))
    it.add(tubo([(0, c.y(0.08), zm + 2.75), (0, c.y(0.12), zm + 1.0)], 0.01, cor="grafite"))
    # rede pendurada (rolo verde) e enrolada no deque
    it.add(sup(0.6, 0.45, 0.7, y=c.y(0.12), z=zm + 0.35, cor="verde", e=0.8, e_v=0.7))
    it.add(mb.cilindro(0.35, 1.6, x=0, y=c.y(0.24), z=c.deque(0.24) + 0.36, eixo="x", cor="verde_medio", seg=14))
    for sx in (1, -1):
        it.add(caixa(0.08, 0.3, 0.42, x=sx * 0.85, y=c.y(0.24), z=c.deque(0.24), cor="cinza_medio", bisel=0.02))
    # caixas de peixe e boias da rede
    for k, (x, y, cor) in enumerate(((0.9, c.y(0.33), "azul"), (0.9, c.y(0.33) - 0.5, "azul"), (-0.9, c.y(0.36), "vermelho"),
                                     (0.9, c.y(0.33) - 0.25, "azul"))):
        z = c.deque(0.33) + (0.3 if k == 3 else 0.0)
        it.add(caixa(0.55, 0.42, 0.28, x=x, y=y, z=z, cor=cor, bisel=0.03))
        if k != 0:
            continue
    for k in range(3):
        it.add(mb.esfera(0.13, x=-0.9 + 0.22 * k, y=c.y(0.3) - 0.3 - 0.1 * k, z=c.deque(0.3) + 0.13, cor="laranja", seg=12))
    for sx in (1, -1):
        for u in (0.3, 0.4):
            x, nrm = c.lado(u, c.zt(u) - 0.25)
            it.add(sup(0.16, 0.5, 0.3, x=sx * (x + 0.1), y=c.y(u), z=c.zt(u) - 0.45, cor="branco_gelo",
                                     e=0.6))
    # assentos no deque de popa (sobre as caixas de gelo)
    it.add(caixa(1.6, 0.6, 0.42, y=c.y(0.07) - 0.3, z=c.deque(0.07), cor="branco", bisel=0.05))
    it.assento(-0.45, c.y(0.07) - 0.3, c.deque(0.07) + 0.42)
    it.assento(0.45, c.y(0.07) - 0.3, c.deque(0.07) + 0.42)
    it.add(boia(1.05, ya - 0.02, z0 + 1.0, normal=(0, -1, 0), r=0.22, esp=0.06))
    it.add(luzes_navegacao(c, u=0.86, z_extra=0.32))
    it.add(portinholas(it, c, (0.8, 0.88), 0.75, r=0.11, cor="branco"))
    it.add(leme(c.y(0.04), c.zb(0.04) + 0.15, -0.62, corda=0.45, cor="vermelho_escuro"))
    helice(it, (0, c.y(0.12), -0.48), r=0.18, cor="cobre")
    for u in (0.92, 0.04):
        for sx in (1, -1):
            it.add(cabeco(sx * (c.w(u) - 0.3), c.y(u), c.deque(u, c.w(u) - 0.3) - 0.01, r=0.05))
    cc = col_casco(c, z_topo=c.zt(0.5) + 0.25)
    cc[0] = (cc[0][0], (c.B + 0.36, cc[0][1][1], cc[0][1][2]))  # defensas penduradas no costado
    it.colisao(cc + [((0, yc, 1.2), (2.3, pc + 0.4, 2.4))])


# ======================================================================================================================
# Balsa de passageiros
# ======================================================================================================================
def p_balsa(it):
    """Barca de passageiros (22 m): salão envidraçado, deque de cima com bancos e toldo, cabine de comando e rampas
    nas duas pontas (interativas)."""
    L, B = 22.0, 7.4
    c = casco(it, L=L, B=B, fb0=1.35, fb1=1.55, calado=0.6, popa=0.86, um=0.5, bico=1.7, redondo=0.55, forma=4.0,
              faixa=0.25, faixa2=0.35, fundo_proa=0.2, raio_popa=1.2, camber=0.03, n=18,
              cores=dict(fundo="vermelho_escuro", faixa="vermelho_escuro", casco="branco", faixa2="azul_medio",
                         deque="cinza_claro"))
    it.add(borda(c, 0.14, 0.12, cor="azul_medio", passo=1.4))
    # salão (andar de baixo) com janelas em toda a volta
    ya, yb = c.y(0.83), c.y(0.12)
    yc = (ya + yb) / 2
    pc = yb - ya
    z0 = c.deque(0.5) - 0.03
    lc = 6.2

    def cor_salao(a, i, tag, cen):
        lado, k, n = tag
        if a == 1 and lado in ("dir", "esq", "frente", "tras") and k % 2 == 1:
            return "branco", it.vidro()
        if a == 1 and lado.startswith("c"):
            return "branco", "atlas"
        if a == 0:
            return "azul_medio", "atlas"
        return "branco", "atlas"

    it.add(casinha([(z0, lc, pc, yc, 1.6, 0.25, 0.25), (z0 + 0.7, lc, pc, yc, 1.6, 0.25, 0.25),
                    (z0 + 1.9, lc, pc, yc, 1.6, 0.25, 0.25), (z0 + 2.3, lc + 0.1, pc + 0.1, yc, 1.62, 0.25, 0.25),
                    (z0 + 2.4, lc + 0.2, pc + 0.2, yc, 1.66, 0.25, 0.25)],
                   seg=5, nx=5, ny=17, cor_fn=cor_salao, topo="laranja_claro", nome="salao"))
    z1 = z0 + 2.4
    # guarda-corpo do deque de cima
    cont, _ = ret_div(lc - 0.1, pc - 0.1, 1.55, seg=2, nx=2, ny=6, bico=0.25, popa=0.25)
    cam = [V((x, y + yc, z1)) for x, y in cont]
    gc = [tubo(cam + [cam[0]], 0.025, cor="branco")]
    for k, p in enumerate(cam):
        if k % 2 == 0:
            gc.append(mb.cilindro(0.022, 1.0, x=p.x, y=p.y, z=z1, cor="branco", seg=6, bisel=0))
    for q in cam:
        q.z += 1.0
    gc.append(tubo(cam + [cam[0]], 0.025, cor="branco"))
    it.add(gc)
    # bancos do deque de cima (fileiras) e toldo
    for k in range(5):
        yy = yc - 4.0 + k * 2.0
        for sx in (1, -1):
            # banco em L (assento + encosto) numa extrusão só
            perfil = [(-0.25, 0.0), (0.3, 0.0), (0.3, 0.87), (0.2, 0.87), (0.2, 0.42), (-0.25, 0.42)]
            it.add(mb.extrudado(_ccw(perfil), 2.0, x=sx * 1.5 - 1.0, y=yy, z=z1, cor="azul", bisel=0.0,
                                plano="yz", liso=False))
    for k, (sx, yy) in enumerate(((1.0, yc - 4.0), (2.0, yc - 4.0), (-1.0, yc - 2.0), (-2.0, yc - 2.0),
                                  (1.5, yc + 0.0), (-1.5, yc + 2.0))):
        it.assento(sx, yy, z1 + 0.42)
    zt_ = z1 + 2.5
    for sx in (1, -1):
        for yy in (yc - 5.0, yc - 1.0, yc + 3.0):
            it.add(mb.cilindro(0.07, zt_ - z1, x=sx * 2.7, y=yy, z=z1, cor="branco", seg=8, bisel=0))
    tl = Malha()
    nl, nc = 10, 1
    lt, pt_ = 6.0, 11.0
    grade = []
    for j in range(nc + 1):
        linha = []
        for i in range(nl + 1):
            x = -lt / 2 + lt * i / nl
            y = yc - 1.0 - pt_ / 2 + pt_ * j / nc
            linha.append(tl.p((x, y, zt_ + 0.35 * (1 - (2 * x / lt) ** 2))))
        grade.append(linha)
    for j in range(nc):
        for i in range(nl):
            tl.face([grade[j][i], grade[j][i + 1], grade[j + 1][i + 1], grade[j + 1][i]],
                    "amarelo" if (i // 2) % 2 == 0 else "branco")  # a curva é só em x: 1 faixa em y basta
    it.add(tl.obj("toldo", angulo=60, esp=0.08))
    # cabine de comando no alto (à frente do toldo)
    yk = yc + 4.6
    zk = z1
    ycmd = ya + 1.2

    def cor_cmd(a, i, tag, cen):
        lado, k, n = tag
        if a == 1 and lado in ("frente", "c2", "c3", "dir", "esq"):
            return "branco", "janela_fria" if lado in ("frente", "dir", "esq") else "janela"
        return "branco", "atlas"

    it.add(casinha([(zk, 2.6, 1.8, ycmd, 0.5), (zk + 1.2, 2.6, 1.8, ycmd, 0.5), (zk + 2.0, 2.5, 1.7, ycmd, 0.45),
                    (zk + 2.1, 2.3, 1.5, ycmd, 0.4)], seg=4, nx=3, ny=2, cor_fn=cor_cmd, topo="azul_medio",
                   nome="comando"))
    it.add(mb.cilindro(0.04, 1.2, x=0, y=ycmd, z=zk + 2.1, cor="grafite", seg=8, bisel=0))
    it.add(lampada(0, ycmd, zk + 3.35, r=0.09))
    it.add(mb.esfera(0.09, x=1.3, y=ycmd, z=zk + 1.9, cor=None, mat="luz_vermelha", seg=8),
           mb.esfera(0.09, x=-1.3, y=ycmd, z=zk + 1.9, cor=None, mat="neon", seg=8))
    it.porta([caixa(0.7, 0.05, 1.8, x=0.6, y=ycmd + 0.92, z=zk + 0.05, cor="azul_medio", bisel=0.03)],
             (0.95, ycmd + 0.9, zk + 0.05), eixo="z", angulo=-100, nome="porta_comando")
    # portas do salão (de correr) nas duas pontas
    for k, (yy, sg) in enumerate(((ya + 0.02, -1), (yb - 0.02, 1))):
        it.correr([caixa(1.2, 0.06, 1.95, x=0.0, y=yy, z=z0 + 0.05, cor="azul_medio", bisel=0.03),
                   caixa(0.9, 0.02, 1.0, x=0.0, y=yy + sg * 0.03, z=z0 + 0.8, cor=None, mat=it.vidro(), bisel=0.01)],
                  direcao=(1, 0, 0), curso=1.1, nome=f"porta_salao_{k + 1}")
    # rampas de embarque nas duas pontas (abaixam para fora)
    for k, (u, sg) in enumerate(((0.95, -1), (0.035, 1))):
        yy = c.y(u)
        zr = c.deque(u)
        lr = min(2.6, 2 * (c.w(u) - 0.45))
        ramp = [caixa(lr, 0.12, 1.15, y=yy + sg * 0.06, z=zr, cor="azul_medio", bisel=0.03)]
        for j in range(4):
            ramp.append(caixa(lr - 0.2, 0.03, 0.05, y=yy - sg * 0.01, z=zr + 0.18 + 0.26 * j, cor="amarelo",
                              bisel=0.01, seg=1))
        it.porta(ramp, (0, yy, zr), eixo="x", angulo=sg * -85, nome=f"rampa_{k + 1}")
    # boias e luzes
    for sx in (1, -1):
        for yy in (yc,):
            it.add(boia(sx * (lc / 2 + 0.06), yy, z0 + 1.2, normal=(sx, 0, 0), r=0.24, esp=0.07))
    it.add(luzes_navegacao(c, u=0.5, z_extra=0.3, popa=False, r=0.08))
    for u in (0.97, 0.03):
        it.add(lampada(0, c.y(u) + (0.5 if u < 0.5 else -0.4), c.zt(u) + 1.85))
        it.add(mb.cilindro(0.04, 1.8, x=0, y=c.y(u) + (0.5 if u < 0.5 else -0.4), z=c.zt(u), cor="branco", seg=8,
                           bisel=0))
    for u in (0.9, 0.1):
        for sx in (1, -1):
            it.add(cabeco(sx * (c.w(u) - 0.35), c.y(u), c.deque(u, c.w(u) - 0.35), r=0.07))
    it.add(portinholas(it, c, [0.28 + 0.15 * k for k in range(4)], 0.75, r=0.16, cor="branco", aro=0.0))
    helice(it, (0, c.y(0.06), -0.42), r=0.22, nome="helice_popa")
    helice(it, (0, c.y(0.94), -0.42), r=0.22, nome="helice_proa")
    it.colisao([((0, 0, -0.6), (B, L * 0.8, 2.1)), ((0, 0, -0.3), (B * 0.6, L, 1.9)),
                ((0, yc, z0), (lc, pc, 2.4)), ((0, ycmd, zk), (2.6, 1.8, 2.1))])


# ======================================================================================================================
# Caiaque e pedalinho
# ======================================================================================================================
def p_caiaque_ajuste(it):
    """Caiaque com as duas pontas finas (a popa do Casco padrão é larga)."""
    L, B = 3.6, 0.72

    class CasCaiaque(Casco):
        def w(self, u):
            t = abs(2 * u - 1)
            return max(B / 2 * max(0.0, 1 - t ** 1.7) ** 0.85, 0.02)

        def zt(self, u):
            return 0.2 + 0.08 * abs(2 * u - 1) ** 2

        def zb(self, u):
            t = abs(2 * u - 1)
            return -0.12 + 0.2 * max(0.0, t - 0.6) ** 2 / 0.16

    c = CasCaiaque(L=L, B=B, fb0=0.2, fb1=0.28, calado=0.12, forma=2.2, camber=0.09, raio_popa=0.0, n=30,
                   cores=dict(fundo="laranja_escuro", casco="laranja", deque="laranja"))
    it.add(c.objeto())
    zd = c.deque(0.5)
    it.add(mb.extrudado(_ccw([(0.27 * math.cos(math.radians(a)), 0.44 * math.sin(math.radians(a)))
                              for a in range(0, 360, 15)]), 0.07, y=0.12, z=zd - 0.03, cor="grafite", bisel=0.025))
    it.add(mb.extrudado(_ccw([(0.22 * math.cos(math.radians(a)), 0.38 * math.sin(math.radians(a)))
                              for a in range(0, 360, 15)]), 0.04, y=0.12, z=zd + 0.0, cor="preto", bisel=0.01))
    it.add(caixa(0.34, 0.38, 0.05, y=0.24, z=zd + 0.02, cor="amarelo", bisel=0.02))
    it.add(almofada(0.34, 0.1, 0.22, 0, 0.48, zd + 0.04, "amarelo", rot=("X", 15)))
    it.assento(0, 0.2, zd + 0.06)
    for y0 in (-1.05, 0.85):
        for k in range(2):
            yy = y0 + 0.2 * k
            u = c.u_de(yy)
            w = c.w(u) - 0.02
            it.add(tubo([(-w, yy, c.zt(u) + 0.01), (0, yy + 0.06, c.deque(u) + 0.012), (w, yy, c.zt(u) + 0.01)],
                        0.008, cor="preto", seg=6, raio_curva=0.05))
    yr = 0.75
    zr = c.deque(c.u_de(yr)) + 0.04
    remo = [mb.cilindro(0.016, 2.2, x=0, y=yr, z=zr, eixo="x", cor="grafite", seg=8)]
    for sx in (1, -1):
        pa = sup(0.42, 0.16, 0.025, x=sx * 1.18, y=yr, z=zr - 0.012, cor="amarelo", e=0.5)
        remo.append(pa)
    it.add(remo)
    # alças nas pontas
    for sg in (1, -1):
        yy = sg * (L / 2 - 0.12)
        it.add(tubo([(0.0, yy, c.zt(c.u_de(yy)) - 0.02), (0.0, yy + sg * 0.12, c.zt(c.u_de(yy)) + 0.03),
                     (0.0, yy + sg * 0.16, c.zt(c.u_de(yy)) - 0.05)], 0.012, cor="preto", seg=6))
    it.add(mb.esfera(0.025, x=0, y=1.35, z=c.deque(c.u_de(1.35)) + 0.02, cor=None, mat="luz", seg=8))
    ye = 0.95
    ze = c.deque(c.u_de(ye))
    it.porta([mb.cilindro(0.15, 0.035, x=0, y=ye, z=ze - 0.01, cor="preto", seg=16, bisel=0.01),
              caixa(0.12, 0.03, 0.02, x=0, y=ye, z=ze + 0.02, cor="grafite", bisel=0.008, seg=1)],
             (0, ye + 0.15, ze), eixo="x", angulo=-100, nome="escotilha")
    it.colisao([((0, 0, -0.12), (B, L, 0.42))])


def p_pedalinho(it):
    """Pedalinho de cisne (2,6 m) com dois lugares e roda de pás atrás (gira)."""
    L, B = 2.6, 1.5
    zf = 0.1
    # casco (banheira) e corpo do cisne
    corpo = mb.superelipsoide(B, L, 0.8, y=0.0, z=-0.22, cor="branco", e=0.55, e_v=0.6, nu=36, nv=16)
    it.add(corpo)
    # assento escavado: cuba laranja por cima (piso) e banco
    it.add(sup(B * 0.74, 1.15, 0.12, y=0.1, z=0.5, cor="azul_bebe", e=0.4, e_v=0.6))
    it.add(caixa(B * 0.66, 0.38, 0.18, y=0.42, z=0.54, cor="azul", bisel=0.05))
    it.add(almofada(B * 0.66, 0.12, 0.42, 0, 0.62, 0.62, "azul"))
    for sx in (-0.33, 0.33):
        it.assento(sx, 0.4, 0.72)
    # asas (laterais em pétala)
    for sx in (1, -1):
        asa = sup(0.18, 1.5, 0.55, x=sx * (B / 2 - 0.04), y=0.25, z=0.28, cor="branco", e=0.7, e_v=0.6)
        for v in asa.data.vertices:
            t = (v.co.y - (0.25 - 0.75)) / 1.5
            v.co.z += 0.32 * t ** 2
        it.add(asa)
    # pescoço e cabeça
    pesc = [V((0, -0.75, 0.45)), V((0, -1.05, 0.9)), V((0, -1.0, 1.45)), V((0, -0.82, 1.75)), V((0, -0.95, 1.92))]
    it.add(tubo(pesc, 0.14, cor="branco", seg=16, raio_curva=0.3))
    it.add(mb.esfera(0.2, x=0, y=-1.0, z=1.95, cor="branco", seg=16, esc=(0.9, 1.2, 0.9)))
    bico = mb.cilindro(0.075, 0.28, x=0, y=-1.22, z=1.92, eixo="y", r2=0.02, cor="laranja", seg=12)
    it.add(bico)
    for sx in (1, -1):
        it.add(mb.esfera(0.035, x=sx * 0.12, y=-1.1, z=2.01, cor="preto", seg=8))
    it.add(mb.esfera(0.06, x=0, y=-1.13, z=1.98, cor="preto", seg=8, esc=(1.1, 0.7, 0.9)))
    # pedais e volante
    it.add(mb.cilindro(0.04, 0.9, x=0, y=-0.3, z=0.68, eixo="x", cor="cinza", seg=8))
    for sx in (-0.33, 0.33):
        it.add(caixa(0.14, 0.22, 0.04, x=sx, y=-0.38, z=0.62, cor="cinza_medio", bisel=0.01))
    # roda de pás atrás (meio afundada) num suporte
    ry = 1.38
    rr = 0.42
    for sx in (1, -1):
        it.add(caixa(0.06, 0.35, 0.7, x=sx * 0.32, y=ry - 0.08, z=0.0, cor="branco", bisel=0.02))
    roda = [mb.cilindro(0.06, 0.6, eixo="x", cor="laranja", seg=12)]
    for k in range(8):
        pa = caixa(0.5, 0.04, rr - 0.06, z=0.06, cor="laranja", bisel=0.015)
        mb.transforma(pa, rot=("X", k * 45))
        roda.append(pa)
    for sx in (1, -1):
        roda.append(mb.cilindro(rr * 0.75, 0.03, x=sx * 0.27, eixo="x", cor="amarelo", seg=16))
    for o in roda:
        mb.transforma(o, loc=(0, ry, 0.05))
    it.anima(roda, {"anima": "girar", "eixo": "x", "velocidade": 120, "roda": 1, "raio": rr}, "roda_pas",
             pivo=(0, ry, 0.05))
    it.add(mb.esfera(0.035, x=0, y=1.2, z=0.62, cor=None, mat="luz", seg=8))
    it.colisao([((0, 0.06, -0.37), (B, 2.84, 1.15)), ((0, -1.05, 0.6), (0.45, 0.65, 1.55))])


# ======================================================================================================================
# Navio de cruzeiro
# ======================================================================================================================
def bloco_casco(c, ua, ub, ins, zs, rf=3.0, rb=1.5, n=20, recuo=None, cor_fn=None, topo="laranja", nome="bloco"):
    """Bloco de paredes retas que segue o contorno do casco recuado 'ins' (superestrutura de navio), de u = ua a ub,
    com a frente e o fundo arredondados (raios rf e rb). zs: alturas das camadas; recuo(z) puxa a frente para trás
    (frente inclinada). cor_fn(a, i, parte, k, n, centro) -> (cor, mat); parte em 'dir' (+X), 'frente', 'esq', 'tras'."""
    m = Malha()
    aneis = []
    for z in zs:
        ub_ = ub - (recuo(z) if recuo else 0.0) / c.L
        us = [ua + (ub_ - ua) * k / n for k in range(n + 1)]
        dir_ = [(c.w(u) - ins, c.y(u)) for u in us]
        xf, yf = dir_[-1]
        xb, yb = dir_[0]
        fr = [(xf * math.cos(math.radians(g)), yf - rf * math.sin(math.radians(g))) for g in range(15, 166, 15)]
        tr = [(-xb * math.cos(math.radians(g)), yb + rb * math.sin(math.radians(g))) for g in range(15, 166, 15)]
        pts = dir_ + fr + [(-x, y) for x, y in reversed(dir_)] + tr
        aneis.append([m.p((x, y, z)) for x, y in pts])
    tot = len(aneis[0])

    def parte(i):
        if i < n:
            return "dir", i
        if i < n + 12:
            return "frente", i - n
        if i < 2 * n + 12:
            return "esq", i - n - 12
        return "tras", i - 2 * n - 12

    for a in range(len(zs) - 1):
        for i in range(tot):
            j = (i + 1) % tot
            ids = [aneis[a][i], aneis[a][j], aneis[a + 1][j], aneis[a + 1][i]]
            cen = sum((m.v[q] for q in ids), V()) / 4
            p, k = parte(i)
            cr, mt = cor_fn(a, i, p, k, n if p in ("dir", "esq") else 12, cen) if cor_fn else ("branco", "atlas")
            m.face(ids, cr, mt)
    m.face(aneis[0][::-1], "branco")
    m.face(aneis[-1], topo)
    return m.obj(nome, angulo=35)


def p_cruzeiro(it):
    """Navio de cruzeiro (76 m): casco branco com faixa vinho, cabines em fileiras que acendem à noite, deque da
    piscina com espreguiçadeiras e guarda-sóis, terraços de popa, ponte de comando com listras e chaminé."""
    L, B = 76.0, 15.0
    c = casco(it, L=L, B=B, fb0=4.6, fb1=5.4, calado=0.68, popa=0.86, um=0.4, bico=1.8, redondo=0.85, forma=7.0,
              faixa=1.1, faixa2=0.0, fundo_proa=0.25, raio_popa=2.5, camber=0.08, n=26,
              cores=dict(fundo="terracota_escura", faixa="terracota_escura", casco="branco", deque="laranja"))
    zh = 4.6  # deque do passeio
    it.add(borda(c, 0.35, 1.1, cor="branco"))
    # escotilhas do casco (uma fileira) — acendem
    it.add(portinholas(it, c, [0.14 + 0.085 * k for k in range(9)], 2.6, r=0.34, cor="branco", aro=0.0))
    # ---- superestrutura de cabines (paredes retas, janelas em fileiras)
    u0, u1 = 0.14, 0.82
    ins = 1.2
    nrow = 5
    z0s, z1s = zh, 13.6
    linhas_z = [z0s, z0s + 1.5]
    for r in range(nrow):
        zb_ = z0s + 1.5 + 0.25 + r * 1.55
        linhas_z += [zb_, zb_ + 1.05]
    linhas_z += [z1s - 0.5, z1s]
    ncol = 22

    def cor_cab(a, i, parte, k, n, cen):
        if a >= 2 and (a - 2) % 2 == 0 and a < len(linhas_z) - 3 and parte in ("dir", "esq", "frente"):
            if parte == "frente":
                return ("azul_noite", it.vidro()) if k % 2 == 1 and 1 < k < 10 else ("azul_noite", "atlas")
            if k % 2 == 1 and 1 < k < n - 2:
                return "azul_noite", it.vidro()
            return "azul_noite", "atlas"
        return "branco", "atlas"

    it.add(bloco_casco(c, u0, u1, ins, linhas_z, rf=3.0, rb=1.4, n=2 * ncol, cor_fn=cor_cab, topo="laranja",
                       nome="cabines"))
    us = [u0 + (u1 - u0) * k / (2 * ncol) for k in range(2 * ncol + 1)]
    # faixas azuis (sacadas) entre as fileiras, nos dois lados
    faixas = []
    for r in range(1, nrow):
        zf = z0s + 1.5 + 0.25 + r * 1.55 - 0.25
        for sx in (1, -1):
            pts = simplifica([V((sx * (c.w(u) - ins + 0.08), c.y(u), zf)) for u in us[2:-2]], passo=6.0, ang=3.0)
            mm = Malha()
            varre(mm, pts, perfil_ret(0.18, 0.12, r=0.05, n=0), "azul", fechado=False)
            faixas.append(mm.obj("sacada", angulo=50))
    it.add(faixas)
    # moldura branca grossa no alto do painel de cabines (o "contorno" da referência)
    for sx in (1, -1):
        pts = simplifica([V((sx * (c.w(u) - ins + 0.1), c.y(u), z1s - 0.25)) for u in us[1:-1]], passo=5.0, ang=3.0)
        mm = Malha()
        varre(mm, pts, perfil_ret(0.35, 0.5, r=0.15, n=1), "branco", fechado=False)
        it.add(mm.obj("moldura", angulo=50))
    # ---- deque da piscina (topo, z1s): piscinas, espreguiçadeiras, guarda-sóis, escorregador
    zp = z1s
    piscinas = ((c.y(0.33), 6.5, 5.0), (c.y(0.49), 4.6, 3.6))
    for yy, l, p in piscinas:
        it.add(casinha([(zp, l + 0.6, p + 0.6, yy, 1.2), (zp + 0.35, l + 0.6, p + 0.6, yy, 1.2)], seg=4,
                       cor="turquesa_claro", nome="borda_piscina"))
        it.add(mb.extrudado(_ccw(mb.ret_arredondado(l, p, 0.9, 4)), 0.02, y=yy, z=zp + 0.34, cor=None, mat="agua",
                            bisel=0.0))
    cores_gs = [("vermelho", "branco"), ("azul", "branco"), ("verde_claro", "branco"), ("magenta", "branco"),
                ("amarelo", "laranja")]
    k = 0
    for u in (0.27, 0.31, 0.45, 0.53, 0.57):
        for sx in (1, -1):
            x = sx * (c.w(u) - ins - 1.4)
            it.add(espreguicadeira(x, c.y(u), zp, ang=90 * sx, almof=["azul_celeste", "amarelo", "rosa"][k % 3]))
            if k % 3 == 0:
                it.add(guarda_sol(x - sx * 0.3, c.y(u) - 1.1, zp, r=1.0, cores=cores_gs[k % 5], alt=2.2))
            if k < 8:
                it.assento(x, c.y(u) + 0.25, zp + 0.42)
            k += 1
    # escorregador amarelo serpenteando entre as piscinas
    esc = [V((2.6, c.y(0.43), zp + 3.0)), V((1.0, c.y(0.425), zp + 2.6)), V((-1.6, c.y(0.415), zp + 2.1)),
           V((-2.0, c.y(0.395), zp + 1.6)), V((0.5, c.y(0.385), zp + 1.1)), V((1.4, c.y(0.375), zp + 0.6))]
    it.add(tubo(esc, 0.38, cor="amarelo", seg=10, raio_curva=1.0))
    it.add(mb.cilindro(0.5, 3.0, x=2.9, y=c.y(0.43), z=zp, cor="laranja", seg=14, bisel=0))
    # ---- bloco da ponte de comando: continua a superestrutura para cima, com a frente inclinada e listras
    ua = 0.6
    zb0 = z1s - 0.3
    zz = [zb0, z1s + 0.8, z1s + 1.25, z1s + 1.95, z1s + 2.4, z1s + 3.1, z1s + 3.5, z1s + 4.3, z1s + 5.3, z1s + 5.75]
    zb1 = zz[-1]

    def recuo(z):
        return max(0.0, z - z1s) * 0.6

    listras = {1: "azul_noite", 3: "rosa_escuro", 5: "magenta"}

    def cor_ponte(a, i, parte, k, n, cen):
        frente = parte == "frente" or (parte == "dir" and k >= n - 3) or (parte == "esq" and k <= 2)
        if a in listras and frente:
            return listras[a], "atlas"
        if a == 7 and parte != "tras":
            return "branco", "janela_fria"
        if a in (3, 5) and parte == "tras" and 2 <= k <= 9 and k % 2 == 0:
            return "branco", it.vidro()
        return "branco", "atlas"

    it.add(bloco_casco(c, ua, u1, ins, zz, rf=3.0, rb=0.6, n=8, recuo=recuo, cor_fn=cor_ponte, topo="branco",
                       nome="ponte"))
    ycb = c.y((ua + u1) / 2)
    lb = 2 * (c.w(0.7) - ins)
    # asas da ponte com as luzes de navegação
    yw = c.y(0.66)
    it.add(caixa(lb + 3.0, 1.6, 0.4, y=yw, z=z1s + 3.6, cor="branco", bisel=0.15))
    it.add(mb.esfera(0.22, x=(lb + 3.0) / 2, y=yw, z=z1s + 4.2, cor=None, mat="luz_vermelha", seg=10))
    it.add(mb.esfera(0.22, x=-(lb + 3.0) / 2, y=yw, z=z1s + 4.2, cor=None, mat="neon", seg=10))
    # heliponto em cima
    yh = c.y(0.665)
    it.add(mb.cilindro(2.9, 0.12, x=0, y=yh, z=zb1, cor="grafite", seg=24, bisel=0))
    it.add(mb.torno([(2.35, 0.0), (2.6, 0.0), (2.6, 0.03), (2.35, 0.03)], x=0, y=yh, z=zb1 + 0.12, cor="amarelo",
                    seg=28))
    for dx in (-0.6, 0.6):
        it.add(caixa(0.32, 2.0, 0.03, x=dx, y=yh, z=zb1 + 0.12, cor="branco", bisel=0.0))
    it.add(caixa(1.2, 0.32, 0.03, x=0, y=yh, z=zb1 + 0.12, cor="branco", bisel=0.0))
    # mastro com luzes (atrás do heliponto)
    ym2 = c.y(0.62)
    it.add(mb.cilindro(0.18, 4.5, x=0, y=ym2, z=zb1 - 0.1, r2=0.1, cor="branco", seg=10, bisel=0))
    it.add(caixa(2.0, 0.2, 0.2, y=ym2, z=zb1 + 2.8, cor="branco", bisel=0.06))
    it.add(lampada(0, ym2, zb1 + 4.55, r=0.2))
    # ---- chaminé (inclinada para trás, faixa azul no alto)
    uc = 0.2
    ych = c.y(uc)
    cam_ch = []
    for k, z in enumerate((zp, zp + 2.0, zp + 4.0, zp + 5.6, zp + 6.0)):
        d = (z - zp) * 0.35
        cam_ch.append((z, 2.6 - 0.1 * k, 5.2 - 0.25 * k, ych + d, 1.3 - 0.05 * k))

    def cor_ch(a, i, tag, cen):
        return ("azul_escuro" if a == 2 else ("grafite" if a == 3 else "branco")), "atlas"

    it.add(casinha(cam_ch, seg=5, cor_fn=cor_ch, topo="grafite_escuro", nome="chamine"))
    it.add(mb.cilindro(0.3, 0.8, x=0.5, y=ych + 2.4, z=zp + 5.6, cor="grafite", seg=10, bisel=0))
    it.add(mb.cilindro(0.3, 0.8, x=-0.5, y=ych + 2.4, z=zp + 5.6, cor="grafite", seg=10, bisel=0))
    # ---- terraços de popa (dois andares em degrau, laranja)
    yt0 = c.y(u0) + 1.0
    yt1 = c.y(0.0) + c.raio_popa * 0.5
    wt = c.w(0.05) - 0.6
    zt2 = z0s + 4.6
    terr = casinha([(zt2 - 0.45, 2 * wt, yt1 - yt0 - 3.0, (yt0 + yt1) / 2 - 1.6, 3.5, 0.0, 0.3),
                    (zt2, 2 * wt, yt1 - yt0 - 3.0, (yt0 + yt1) / 2 - 1.6, 3.5, 0.0, 0.3)], seg=6, cor="branco",
                   topo="laranja", nome="terraco")
    it.add(terr)
    for zz_, yy0, yy1, ww in ((zh + 0.05, yt0, yt1 - 0.6, c.w(0.05) - 0.5), (zt2, yt0, yt1 - 3.3, wt - 0.2)):
        cont, _ = ret_div(2 * ww, yy1 - yy0, 2.5, seg=5, nx=3, ny=3, popa=0.3)
        cam = [V((x, y + (yy0 + yy1) / 2, zz_)) for x, y in cont if y > -(yy1 - yy0) / 2 + 0.5]
        it.add(tubo([p + V((0, 0, 1.0)) for p in cam], 0.05, cor="branco"))
        for p in cam[::3]:
            it.add(mb.cilindro(0.05, 1.0, x=p.x, y=p.y, z=zz_, cor="branco", seg=6, bisel=0))
    for x, yy in ((-3.0, yt1 - 2.0), (3.0, yt1 - 2.4), (0.0, yt1 - 1.6)):
        it.add(guarda_sol(x, yy, zh + 0.05, r=1.0, cores=cores_gs[int(x) % 5], alt=2.2))
    for x, yy in ((-3.0, yt0 + 1.0), (3.0, yt0 + 1.4)):
        it.add(guarda_sol(x, yy, zt2, r=0.9, cores=cores_gs[(int(x) + 2) % 5], alt=2.0))
    # ---- botes salva-vidas no passeio (laranja) e guarda-corpo do passeio
    for u in (0.28, 0.38, 0.48, 0.58):
        for sx in (1, -1):
            x = sx * (c.w(u) - ins + 0.55)
            it.add(sup(1.0, 3.0, 1.0, x=x, y=c.y(u), z=zh - 0.05, cor="laranja", e=0.5, e_v=0.55, nu=12, nv=6))
            it.add(caixa(0.9, 2.6, 0.12, x=x, y=c.y(u), z=zh + 0.9, cor="branco", bisel=0.05, seg=1))
    it.add(guarda_corpo(c, alt=1.0, u0=0.0, u1=1.0, inset=0.25, cor="branco", z0=1.1, passo=4.5, r=0.05, meio=False))
    # proa: âncoras, cabeços e mastro de proa
    for sx in (1, -1):
        x, nrm = c.lado(0.92, 3.2)
        it.add(sup(0.2, 1.0, 1.0, x=sx * (x + 0.02), y=c.y(0.92), z=2.8, cor="grafite", e=0.5, nu=10, nv=5))
    for u in (0.9, 0.08):
        for sx in (1, -1):
            it.add(cabeco(sx * (c.w(u) - 0.8), c.y(u), c.deque(u, c.w(u) - 0.8), r=0.18))
    yproa = c.y(0.985)
    it.add(mb.cilindro(0.08, 3.0, x=0, y=yproa + 0.6, z=c.zt(1.0), cor="branco", seg=8))
    it.add(lampada(0, yproa + 0.6, c.zt(1.0) + 3.05, r=0.18))
    it.add(lampada(0, c.y(0.0) + 1.8, zh + 1.6, r=0.18))
    # porta de embarque no costado (bombordo) e hélices
    uk = 0.46
    xk, nrm = c.lado(uk, 1.6)
    it.porta([caixa(0.12, 2.2, 1.9, x=xk + 0.02, y=c.y(uk), z=0.8, cor="branco_gelo", bisel=0.05)],
             (xk, c.y(uk) + 1.1, 0.8), eixo="z", angulo=-95, nome="porta_embarque")
    helice(it, (2.2, c.y(0.05), -0.36), r=0.3, nome="helice_bombordo")
    helice(it, (-2.2, c.y(0.05), -0.36), r=0.3, nome="helice_boreste")
    it.add(leme(c.y(0.015), c.zb(0.02) + 0.2, -0.66, corda=1.4, esp=0.25))
    it.colisao([((0, c.y(0.4), -0.68), (B, L * 0.8, zh + 0.68 + 1.1)), ((0, c.y(0.88), -0.4), (B * 0.5, L * 0.24, 6.5)),
                ((0, (c.y(u0) + c.y(u1)) / 2, zh), (B - 2 * ins, c.y(u0) - c.y(u1) + 3.5, z1s - zh)),
                ((0, c.y(0.71), z1s), (lb, c.y(0.6) - c.y(0.82) + 3.0, zb1 - z1s))])


# ======================================================================================================================
P = [
    ("veleiro_branco", "Veleiro de casco branco (vela branca)", "veleiro_classico", ["veleiro", "vela"],
     p_veleiro_branco),
    ("veleiro_vela_vermelha", "Veleiro de casco branco (vela vermelha)", "veleiro_classico", ["veleiro", "vela"],
     p_veleiro_vermelho),
    ("iate_cupula_azul", "Iate de cabine em cúpula azul", "iate_cupula", ["iate", "cabine"], p_iate_cupula),
    ("iate_flybridge", "Iate de dois andares azul e branco", "iate_flybridge", ["iate", "cabine"], p_iate_flybridge),
    ("veleiro_madeira_verde", "Veleiro de madeira verde (velas marrons)", "veleiro_madeira", ["veleiro", "vela",
                                                                                              "madeira"],
     p_veleiro_madeira_verde),
    ("veleiro_madeira_laranja", "Veleiro de madeira laranja de dois mastros", "veleiro_madeira_ketch",
     ["veleiro", "vela", "madeira"], p_veleiro_madeira_laranja),
    ("barco_passeio_laranja", "Barco de passeio com toldo (laranja)", "barco_passeio", ["passeio", "toldo", "boia"],
     p_passeio_laranja),
    ("barco_passeio_azul", "Barco de passeio com toldo (azul)", "barco_passeio", ["passeio", "toldo", "boia"],
     p_passeio_azul),
    ("lancha_verde_limao", "Lancha pequena verde-limão", "lancha", ["lancha", "motor"], p_lancha_verde),
    ("lancha_vermelha", "Lancha pequena vermelha e laranja", "lancha", ["lancha", "motor"], p_lancha_vermelha),
    ("barco_pesca", "Barco de pesca", "barco_pesca", ["pesca", "trabalho"], p_pesca),
    ("balsa_passageiros", "Barca de passageiros", "balsa", ["balsa", "passageiros", "grande"], p_balsa),
    ("caiaque", "Caiaque laranja com remo", "caiaque", ["caiaque", "remo", "pequeno"], p_caiaque_ajuste),
    ("pedalinho_cisne", "Pedalinho de cisne", "pedalinho", ["pedalinho", "pequeno", "lago"], p_pedalinho),
    ("bote_inflavel", "Bote inflável com motor de popa", "bote", ["bote", "motor", "pequeno"], p_bote),
    ("navio_cruzeiro", "Navio de cruzeiro", "navio_cruzeiro", ["navio", "cruzeiro", "grande"], p_cruzeiro),
]


def exporta(cat, it, rotulo, grupo, tags):
    bpy.context.view_layer.update()
    if os.environ.get("BARCOS_TRIS"):
        conta = {}
        for o in it.partes + [o for o, _ in it.animados] + [o for o, _ in it.interativos]:
            if o.type == "MESH":
                n = o.name.split(".")[0]
                conta[n] = conta.get(n, 0) + sum(len(p.vertices) - 2 for p in o.data.polygons)
        print("tris por parte:", sorted(conta.items(), key=lambda a: -a[1])[:14], flush=True)
    if os.environ.get("BARCOS_TRIS"):
        for o in it.partes + [o for o, _ in it.animados] + [o for o, _ in it.interativos]:
            if o.type == "MESH":
                zmin = min((o.matrix_world @ v.co).z for v in o.data.vertices)
                if zmin < -0.69:
                    print("abaixo do limite:", o.name, round(zmin, 3), flush=True)
    anims = it.lista_animacoes()
    lo, hi = mb.bbox([o for o in it.partes if o.type == "MESH"] + [o for o, _ in it.animados] +
                     [o for o, _ in it.interativos])
    extra = {"linha_dagua": 0, "comprimento": round(hi.y - lo.y, 2), "calado": round(-lo.z, 3)}
    if anims:
        extra["animacoes"] = anims
    e = cat.exporta(it, rotulo, grupo=grupo, tags=["barco", "agua"] + tags, extra=extra)
    return e


def main():
    argv = sys.argv[sys.argv.index("--") + 1:]
    saida, filtro = argv[0], argv[1:]
    cat = mb.Catalogo(CAT, saida, rotulo="Barcos")
    ids = [p[0] for p in P]
    assert len(ids) == len(set(ids)), "ids repetidos"
    for id_, rotulo, grupo, tags, f in P:
        if filtro and id_ not in filtro and grupo not in filtro:
            continue
        mb.limpa()
        it = ItemB(id_)
        f(it)
        exporta(cat, it, rotulo, grupo, tags)
    validos = set(ids)
    cat.dados["itens"] = [x for x in cat.dados["itens"] if x["id"] in validos]
    cat.dados["itens"].sort(key=lambda x: ids.index(x["id"]))
    cat.salva()
    print("pecas", len(cat.dados["itens"]), flush=True)


if __name__ == "__main__":
    main()
