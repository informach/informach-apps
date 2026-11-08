"""Base própria da categoria parque_areas (por cima de moveis_base e cidade_base, sem alterá-las).

- ItemP: Item com filhos animados (extras glTF no nó: anima, velocidade/periodo/angulo/eixo/pontos...) e assentos
  (slots de 0,5 × 0,5 × 0,9 m), inclusive assentos presos a um filho animado (balanço, pedalinho, gira-gira).
- Malha: bmesh em que cada face guarda a sua cor (nome da paleta) ou material ("m:agua", "m:luz", ...).
- Terreno: chão gerado por campos de distância numa grade (caminhos, guias, lagos, recintos, bowl). Cada triângulo
  da grade é cortado nas curvas de nível dos campos (corte exato, porque o campo é linear no triângulo), então as
  bordas dos caminhos e das guias saem lisas e as quadras vizinhas casam sem fresta. As faces planas da mesma cor são
  fundidas no fim (malha leve) e a saia desce até z = −0,40.
- Peças pequenas: árvores, arbustos, pedras, bancos, postes de 4 lanternas, lixeiras, cercas, flores e tufos.
"""
import math
import random

import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector
from mathutils.geometry import tessellate_polygon

import moveis_base as mb
import cidade_base as cb

V = Vector
H, Q, ZF = cb.H, cb.Q, cb.Z_FUNDO
W_CAM = 1.3      # meia largura do caminho (o mesmo do piso_grama_caminho: 2,6 m de ladrilho)
G_GUIA = 0.2     # largura da guia baixa de cada lado
Z_GUIA = 0.035   # altura da guia
E_GUIA = 0.012   # largura da rampinha da guia (parede quase vertical, sem vértice duplicado)


# =====================================================================================================================
# Item com animações e assentos
# =====================================================================================================================
class ItemP(mb.Item):
    def __init__(self, id_):
        super().__init__(id_)
        self.animados = []
        self.slots_anim = []

    def anima(self, objs, dados, nome, pivo=None):
        objs = [o for o in (objs if isinstance(objs, (list, tuple)) else [objs]) if o is not None]
        ob = mb.junta(objs, nome)
        if pivo is None:
            lo, hi = mb.bbox(ob)
            pivo = (lo + hi) / 2
        d = V(pivo)
        ob.data.transform(Matrix.Translation(-d))
        ob.location = d
        self.animados.append((ob, dict(dados)))
        return ob

    def assento(self, nome, x, y, z, pai=None):
        if pai:
            self.slots_anim.append((f"slot_{nome}", (x, y, z), (0.5, 0.5, 0.9), pai))
        else:
            self.slot(nome, (x, y, z), (0.5, 0.5, 0.9))

    def monta(self):
        corpo = super().monta()
        for ob, d in self.animados:
            ob.parent = corpo
            for k, v in d.items():
                ob[k] = v
        for nome, c, t, pai in self.slots_anim:
            po = next(o for o, _ in self.animados if o.name == pai)
            e = bpy.data.objects.new(nome, None)
            e.empty_display_type = "CUBE"
            e.empty_display_size = 0.5
            bpy.context.scene.collection.objects.link(e)
            e.parent = po
            e.location = V(c) - po.location
            e["slot"] = 1
            e["tamanho"] = [round(t[0], 4), round(t[2], 4), round(t[1], 4)]
        self.slots = self.slots + self.slots_anim
        self.slots_anim = []
        bpy.context.view_layer.update()
        return corpo

    def lista_animacoes(self):
        return [dict(nome=ob.name, **d, pivo=mb._gl(ob.location)) for ob, d in self.animados]


def gl_pts(pts):
    """Pontos do Blender (x, y, z) → glTF (x, z, −y), arredondados."""
    return [mb._gl(p) for p in pts]


# =====================================================================================================================
# Malha com cor por face
# =====================================================================================================================
def _cod(cor):
    if cor.startswith("m:"):
        return -1 - mb.MAT_NOMES.index(cor[2:])
    return mb.NOMES.index(cor)


def area2(pts):
    return sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(pts, pts[1:] + pts[:1])) / 2


def ccw(pts):
    return list(pts) if area2(list(pts)) > 0 else list(pts)[::-1]


class Malha:
    def __init__(self):
        self.bm = bmesh.new()
        self.lay = self.bm.faces.layers.int.new("cor")

    def v(self, p):
        return self.bm.verts.new(p)

    def f(self, vs, cor):
        try:
            fc = self.bm.faces.new(vs)
        except ValueError:
            return None
        fc[self.lay] = _cod(cor)
        return fc

    def poligono(self, pts3, cor, normal=(0, 0, 1)):
        p2 = [V((p[0], p[1], 0)) for p in pts3]
        vs = [self.v(p) for p in pts3]
        nn = V(normal)
        for a, b, c in tessellate_polygon([p2]):
            A, B, C = V(pts3[a]), V(pts3[b]), V(pts3[c])
            if (B - A).cross(C - A).dot(nn) < 0:
                b, c = c, b
            self.f((vs[a], vs[b], vs[c]), cor)

    def obj(self, nome="malha", liso=False, angulo=35, funde=False):
        mb.materiais()
        bm = self.bm
        bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
        uvl = bm.loops.layers.uv.new("UVMap")
        for fc in bm.faces:
            c = fc[self.lay]
            if c >= 0:
                u, mi = mb.uv_cor(mb.NOMES[c]), 0
            else:
                u, mi = (0.5, 0.5), -1 - c
            fc.material_index = mi
            for lo in fc.loops:
                lo[uvl].uv = u
        if funde:
            bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(0.2), use_dissolve_boundaries=False,
                                     verts=bm.verts[:], edges=bm.edges[:], delimit={"UV", "MATERIAL"})
        me = bpy.data.meshes.new(nome)
        bm.to_mesh(me)
        bm.free()
        if "cor" in me.attributes:
            me.attributes.remove(me.attributes["cor"])
        for n in mb.MAT_NOMES:
            me.materials.append(bpy.data.materials[n])
        if liso:
            me.shade_smooth()
            me.set_sharp_from_angle(angle=math.radians(angulo))
        ob = bpy.data.objects.new(nome, me)
        bpy.context.scene.collection.objects.link(ob)
        return ob


def prisma(aneis, z0, z1, topo, lado=None, nome="prisma", m=None):
    """Prisma de z0 a z1 com contorno externo e furos (aneis[0] externo)."""
    lado = lado or topo
    proprio = m is None
    m = m or Malha()
    ext = ccw(aneis[0])
    furos = [ccw(h)[::-1] for h in aneis[1:]]
    todos = [ext] + furos
    flat = [p for a in todos for p in a]
    tris = tessellate_polygon([[V((p[0], p[1], 0)) for p in a] for a in todos])
    vt = [m.v((p[0], p[1], z1)) for p in flat]
    vb = [m.v((p[0], p[1], z0)) for p in flat]
    for a, b, c in tris:
        if area2([flat[a], flat[b], flat[c]]) < 0:
            b, c = c, b
        m.f((vt[a], vt[b], vt[c]), topo)
    k = 0
    for anel in todos:
        n = len(anel)
        for i in range(n):
            a, b = k + i, k + (i + 1) % n
            m.f((vb[a], vb[b], vt[b], vt[a]), lado)
        k += n
    return m.obj(nome) if proprio else m


def decal(pts, z, cor, nome="decal"):
    """Polígono plano (côncavo também) em z, normal para cima."""
    m = Malha()
    m.poligono([(p[0], p[1], z) for p in pts], cor)
    return m.obj(nome)


def faixa_2d(pts, larg, z, cor, fechado=False, nome="faixa"):
    """Tira plana de largura larg ao longo de uma linha 2D (normal para cima)."""
    pts = [V((p[0], p[1])) for p in pts]
    if fechado:
        pts = pts + [pts[0]]
    m = Malha()
    n = len(pts)
    esq, dir_ = [], []
    for i in range(n):
        if fechado and (i == 0 or i == n - 1):
            t = (pts[1] - pts[-2])
        else:
            t = pts[min(n - 1, i + 1)] - pts[max(0, i - 1)]
        t = t.normalized()
        nn = V((-t.y, t.x))
        esq.append(m.v((pts[i].x + nn.x * larg / 2, pts[i].y + nn.y * larg / 2, z)))
        dir_.append(m.v((pts[i].x - nn.x * larg / 2, pts[i].y - nn.y * larg / 2, z)))
    for k in range(n - 1):
        m.f((dir_[k], dir_[k + 1], esq[k + 1], esq[k]), cor)
    return m.obj(nome)


def varre_perfil(cam, perfil, cores, fechado=False, nome="varrido", liso=True, angulo=40, tampas=True):
    """Varre um perfil 2D (off lateral, z) ao longo de um caminho 3D/2D (z do caminho somado). perfil fechado
    (lista anti-horária vista de frente). cores: uma por aresta do perfil ou uma só."""
    pts = [V((p[0], p[1], p[2] if len(p) > 2 else 0.0)) for p in cam]
    n = len(pts)
    m = Malha()
    aneis = []
    for i in range(n):
        if fechado:
            t = pts[(i + 1) % n] - pts[i - 1]
        else:
            t = pts[min(n - 1, i + 1)] - pts[max(0, i - 1)]
        t.z = 0
        t.normalize()
        r = V((t.y, -t.x, 0))
        aneis.append([m.v(pts[i] + r * o + V((0, 0, dz))) for o, dz in perfil])
    k = len(perfil)
    cs = cores if isinstance(cores, (list, tuple)) else [cores] * k
    for i in range(n if fechado else n - 1):
        A, B = aneis[i], aneis[(i + 1) % n]
        for j in range(k):
            j2 = (j + 1) % k
            m.f((A[j], B[j], B[j2], A[j2]), cs[j % len(cs)])
    if tampas and not fechado:
        for anel, inv in ((aneis[0], False), (aneis[-1], True)):
            vs = anel[::-1] if not inv else anel
            m.f(vs, cs[0])
    ob = m.obj(nome, liso=liso, angulo=angulo)
    _normais_para_fora(ob)
    return ob


def _normais_para_fora(ob):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(ob.data)
    bm.free()


# =====================================================================================================================
# Campos de distância (numpy, vetorizados sobre os pontos)
# =====================================================================================================================
def d_polilinha(X, Y, pts):
    P = np.asarray(pts, dtype=float)
    best = np.full(np.shape(X), np.inf)
    for (ax, ay), (bx, by) in zip(P[:-1], P[1:]):
        dx, dy = bx - ax, by - ay
        L2 = dx * dx + dy * dy
        if L2 < 1e-12:
            d = np.hypot(X - ax, Y - ay)
        else:
            t = np.clip(((X - ax) * dx + (Y - ay) * dy) / L2, 0.0, 1.0)
            d = np.hypot(X - ax - t * dx, Y - ay - t * dy)
        best = np.minimum(best, d)
    return best


def dentro_poligono(X, Y, pts):
    P = np.asarray(pts, dtype=float)
    dentro = np.zeros(np.shape(X), dtype=bool)
    n = len(P)
    for i in range(n):
        ax, ay = P[i]
        bx, by = P[(i + 1) % n]
        cond = (ay > Y) != (by > Y)
        with np.errstate(divide="ignore", invalid="ignore"):
            xint = ax + (Y - ay) * (bx - ax) / (by - ay)
        dentro ^= cond & (X < xint)
    return dentro


def sd_poligono(X, Y, pts):
    """Distância com sinal a um polígono fechado (negativa dentro)."""
    d = d_polilinha(X, Y, list(pts) + [pts[0]])
    return np.where(dentro_poligono(X, Y, pts), -d, d)


def sd_caixa(X, Y, cx, cy, hx, hy, r=0.0, ang=0.0):
    """Retângulo arredondado (meias medidas hx, hy, raio r), girado ang graus, centro (cx, cy)."""
    c, s = math.cos(math.radians(ang)), math.sin(math.radians(ang))
    px, py = (X - cx) * c + (Y - cy) * s, -(X - cx) * s + (Y - cy) * c
    qx, qy = np.abs(px) - (hx - r), np.abs(py) - (hy - r)
    return np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - r


def sd_circulo(X, Y, cx, cy, R):
    return np.hypot(X - cx, Y - cy) - R


def smin(a, b, k):
    if k <= 0:
        return np.minimum(a, b)
    h = np.maximum(k - np.abs(a - b), 0.0) / k
    return np.minimum(a, b) - h * h * k / 4


def contorno_caixa(cx, cy, hx, hy, r, ang=0.0, seg=6):
    c, s = math.cos(math.radians(ang)), math.sin(math.radians(ang))
    return [(cx + x * c - y * s, cy + x * s + y * c) for x, y in mb.ret_arredondado(2 * hx, 2 * hy, r, seg)]


def reamostra(pts, passo=0.25, fechado=False):
    pts = [V((p[0], p[1])) for p in pts]
    if fechado:
        pts = pts + [pts[0]]
    out = [pts[0]]
    for a, b in zip(pts, pts[1:]):
        L = (b - a).length
        n = max(1, int(math.ceil(L / passo)))
        for k in range(1, n + 1):
            out.append(a + (b - a) * (k / n))
    if fechado:
        out = out[:-1]
    return [(p.x, p.y) for p in out]


def comprimento(pts, fechado=False):
    p = [V(q) for q in pts] + ([V(pts[0])] if fechado else [])
    return sum((b - a).length for a, b in zip(p, p[1:]))


def ponto_em(pts, s, fechado=False):
    """Ponto e tangente a s metros ao longo da polilinha."""
    p = [V((q[0], q[1])) for q in pts] + ([V((pts[0][0], pts[0][1]))] if fechado else [])
    L = sum((b - a).length for a, b in zip(p, p[1:]))
    if fechado:
        s = s % L
    acc = 0.0
    for a, b in zip(p, p[1:]):
        seg = (b - a).length
        if acc + seg >= s - 1e-9 and seg > 1e-9:
            t = (s - acc) / seg
            return a + (b - a) * t, (b - a).normalized()
        acc += seg
    return p[-1], (p[-1] - p[-2]).normalized()


def arco(cx, cy, r, a0, a1, n=None):
    n = n or max(4, int(abs(a1 - a0) / 4))
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * k / n)),
             cy + r * math.sin(math.radians(a0 + (a1 - a0) * k / n))) for k in range(n + 1)]


# =====================================================================================================================
# Terreno por campos
# =====================================================================================================================
class Terreno:
    """Chão gerado numa grade (x0..x1, y0..y1, passo) cortada nas curvas de nível dos campos registrados.
    campo(nome, f, niveis): f(X, Y) → array numpy. gera(cor, z): cor(c, x, y) → cor da peça (c = dict dos campos no
    centro da peça; None apaga a peça) e z(c, x, y) → altura do vértice (deve ser linear em cada faixa dos campos)."""

    def __init__(self, x0, y0, x1, y1, passo=0.5):
        self.x0, self.y0, self.x1, self.y1 = x0, y0, x1, y1
        self.nx = int(round((x1 - x0) / passo))
        self.ny = int(round((y1 - y0) / passo))
        self.campos = []

    def campo(self, nome, f, niveis):
        self.campos.append((nome, f, sorted(niveis)))

    def valor(self, X, Y):
        return {n: f(np.asarray(X, float), np.asarray(Y, float)) for n, f, _ in self.campos}

    def gera(self, cor_fn, z_fn, nome="chao", saia=True, z_fundo=ZF, cor_saia=None):
        xs = np.linspace(self.x0, self.x1, self.nx + 1)
        ys = np.linspace(self.y0, self.y1, self.ny + 1)
        XX, YY = np.meshgrid(xs, ys)
        nomes = [n for n, _, _ in self.campos]
        F = [f(XX, YY) for _, f, _ in self.campos]
        niveis = [nv for _, _, nv in self.campos]
        nk = len(F)

        def vert(i, j):
            return (xs[i], ys[j], tuple(float(F[k][j, i]) for k in range(nk)))

        def corta(poly, k, L):
            ab, ac = [], []
            n = len(poly)
            for q in range(n):
                a, b = poly[q], poly[(q + 1) % n]
                fa, fb = a[2][k] - L, b[2][k] - L
                (ab if fa < 0 else ac).append(a)
                if (fa < 0) != (fb < 0):
                    t = fa / (fa - fb)
                    p = (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t,
                         tuple(a[2][m] + (b[2][m] - a[2][m]) * t for m in range(nk)))
                    ab.append(p)
                    ac.append(p)
            return limpa(ab), limpa(ac)

        def limpa(poly):
            out = []
            for p in poly:
                if not out or abs(p[0] - out[-1][0]) + abs(p[1] - out[-1][1]) > 1e-7:
                    out.append(p)
            if len(out) > 1 and abs(out[0][0] - out[-1][0]) + abs(out[0][1] - out[-1][1]) < 1e-7:
                out.pop()
            if len(out) < 3:
                return None
            if abs(area2([(p[0], p[1]) for p in out])) < 1e-9:
                return None
            return out

        pecas = []
        for j in range(self.ny):
            for i in range(self.nx):
                a, b, c, d = vert(i, j), vert(i + 1, j), vert(i + 1, j + 1), vert(i, j + 1)
                tris = [(a, b, c), (a, c, d)] if (i + j) % 2 == 0 else [(a, b, d), (b, c, d)]
                for tri in tris:
                    lista = [list(tri)]
                    for k in range(nk):
                        fmin = min(p[2][k] for p in tri)
                        fmax = max(p[2][k] for p in tri)
                        for L in niveis[k]:
                            if fmin < L < fmax or (fmin < L and fmax == L) or (fmin == L and fmax > L):
                                nova = []
                                for poly in lista:
                                    ab, ac = corta(poly, k, L)
                                    nova += [p for p in (ab, ac) if p]
                                lista = nova
                    pecas += lista
        m = Malha()
        vmap = {}

        def mv(p):
            key = (round(p[0], 5), round(p[1], 5))
            vv = vmap.get(key)
            if vv is None:
                c = dict(zip(nomes, p[2]))
                vv = m.v((p[0], p[1], z_fn(c, p[0], p[1])))
                vmap[key] = vv
            return vv

        for poly in pecas:
            n = len(poly)
            cen = dict(zip(nomes, [sum(p[2][k] for p in poly) / n for k in range(nk)]))
            cx = sum(p[0] for p in poly) / n
            cy = sum(p[1] for p in poly) / n
            cor = cor_fn(cen, cx, cy)
            if cor is None:
                continue
            vs = []
            for p in poly:
                vv = mv(p)
                if not vs or vs[-1] is not vv:
                    vs.append(vv)
            if len(vs) >= 3 and vs[0] is not vs[-1]:
                m.f(vs, cor)
        bm = m.bm
        bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-6)
        if saia:
            bm.edges.ensure_lookup_table()
            borda = [e for e in bm.edges if len(e.link_faces) == 1]
            novos = {}

            def baixo(vv):
                if vv not in novos:
                    novos[vv] = bm.verts.new((vv.co.x, vv.co.y, z_fundo))
                return novos[vv]

            for e in borda:
                fc = e.link_faces[0]
                lo = next(lp for lp in fc.loops if lp.edge is e)
                a, b = lo.vert, lo.link_loop_next.vert
                # só a borda externa da peça (a grade não tem furos, mas a cor None pode criar): externa = na moldura
                na = abs(a.co.x - self.x0) < 1e-4 or abs(a.co.x - self.x1) < 1e-4 or abs(a.co.y - self.y0) < 1e-4 \
                    or abs(a.co.y - self.y1) < 1e-4
                nb = abs(b.co.x - self.x0) < 1e-4 or abs(b.co.x - self.x1) < 1e-4 or abs(b.co.y - self.y0) < 1e-4 \
                    or abs(b.co.y - self.y1) < 1e-4
                if not (na and nb):
                    continue
                cod = fc[m.lay]
                nf = bm.faces.new((a, baixo(a), baixo(b), b))
                nf[m.lay] = _cod(cor_saia) if cor_saia else cod
            # fundo só quando o chão não desce abaixo da laje (lago e bowl: o fundo taparia a bacia vista de cima)
            if min(v.co.z for v in bm.verts) >= z_fundo - 1e-6:
                fundo = [bm.verts.new((x, y, z_fundo)) for x, y in ((self.x0, self.y0), (self.x0, self.y1),
                                                                    (self.x1, self.y1), (self.x1, self.y0))]
                nf = bm.faces.new(fundo)
                nf[m.lay] = _cod("terra_escura")
        return m.obj(nome, funde=True)


def z_guia(f, w=W_CAM, g=G_GUIA, zg=Z_GUIA, e=E_GUIA):
    """Altura da guia baixa em função da distância f ao eixo do caminho (0 fora da faixa da guia)."""
    if f <= w or f >= w + g:
        return 0.0
    if f < w + e:
        return zg * (f - w) / e
    if f > w + g - e:
        return zg * (w + g - f) / e
    return zg


NIVEIS_GUIA = [W_CAM, W_CAM + E_GUIA, W_CAM + G_GUIA - E_GUIA, W_CAM + G_GUIA]


def cor_grama(x, y):
    """Grama lisa (como na referência do parque). As faixas de corte do piso_grama giram junto com a placa e, numa
    rede de caminhos com placas giradas, viravam um labirinto de listras; a grama lisa casa em qualquer giro."""
    return "grama"


def terreno_caminho(it, rede, x0=-H, y0=-H, x1=H, y1=H, passo=0.5, extra_cor=None, extra_z=None, campos=(),
                    nome="chao"):
    """Chão de grama com a rede de caminhos (ladrilho rosado, guias baixas)."""
    t = Terreno(x0, y0, x1, y1, passo)
    t.campo("cam", rede.f, NIVEIS_GUIA)
    for c in campos:
        t.campo(*c)

    def cor(c, x, y):
        if extra_cor:
            r = extra_cor(c, x, y)
            if r:
                return r
        f = c["cam"]
        if f < W_CAM:
            return "piso_rosado"
        if f < W_CAM + G_GUIA:
            return "concreto"
        return cor_grama(x, y)

    def z(c, x, y):
        zz = z_guia(c["cam"])
        if extra_z:
            zz += extra_z(c, x, y)
        return zz

    it.add(t.gera(cor, z, nome=nome))
    return t



# =====================================================================================================================
# Caminhos: primitivas (traços e discos), campo total e juntas dos ladrilhos
# =====================================================================================================================
class Rede:
    """Rede de caminhos: traços (polilinhas, com as pontas na borda estendidas para fora) e discos (pracinhas).
    f(X, Y) = distância ao eixo do caminho mais próximo (união suave nos encontros)."""

    def __init__(self, k=0.9, limite=None):
        self.prims = []
        self.k = k
        self.limite = limite  # (x0, y0, x1, y1) da peça: pontas que tocam a borda são estendidas 1 m para fora

    def traco(self, pts, fechado=False, juntas=True, passo=0.6, ajusta=False):
        pts = [tuple(p) for p in pts]
        ext = list(pts)
        if self.limite and not fechado:
            x0, y0, x1, y1 = self.limite
            for idx, viz in ((0, 1), (-1, -2)):
                p, q = V(pts[idx]), V(pts[viz])
                if min(abs(p.x - x0), abs(p.x - x1), abs(p.y - y0), abs(p.y - y1)) < 1e-6:
                    d = (p - q).normalized()
                    novo = tuple(p + d * 1.2)
                    if idx == 0:
                        ext.insert(0, novo)
                    else:
                        ext.append(novo)
        dens = reamostra(ext, 0.5, fechado)
        if fechado:
            dens = dens + [dens[0]]
        self.prims.append({"tipo": "traco", "pts": pts, "dens": dens, "fechado": fechado, "juntas": juntas,
                           "passo": passo, "ajusta": ajusta})

    def disco(self, cx, cy, R):
        self.prims.append({"tipo": "disco", "c": (cx, cy), "R": R, "juntas": False})

    def f_prim(self, p, X, Y):
        if p["tipo"] == "traco":
            return d_polilinha(X, Y, p["dens"])
        return np.hypot(X - p["c"][0], Y - p["c"][1]) - p["R"] + W_CAM

    def f(self, X, Y):
        out = None
        for p in self.prims:
            v = self.f_prim(p, X, Y)
            out = v if out is None else smin(out, v, self.k)
        return out

    def juntas(self, z=0.0, larg=0.03, cor="madeira_rosada", w=W_CAM, centro=True, f_extra=None):
        """Juntas do ladrilho: linhas transversais a cada 0,6 m (contadas da borda da peça, como no piso de caminho)
        e a linha do meio, só onde o traço é o caminho mais próximo e dentro do ladrilho."""
        objs = []
        prims = self.prims

        def valido(P):
            X, Y = P[:, 0], P[:, 1]
            ft = self.f(X, Y)
            ok = ft < w - 0.04
            if f_extra is not None:
                ok &= f_extra(X, Y)
            return ok

        for i, p in enumerate(prims):
            if p["tipo"] == "campo" and p.get("grade"):
                outros = [q for j, q in enumerate(prims) if j != i]
                g = p["grade"]
                x0, y0, x1, y1 = self.limite
                for eixo in (0, 1):
                    c = (x0 if eixo == 0 else y0) + g
                    while c < (x1 if eixo == 0 else y1) - 1e-6:
                        ts = np.arange(y0 if eixo == 0 else x0, (y1 if eixo == 0 else x1) + 1e-6, 0.1)
                        P = np.array([[c, t] if eixo == 0 else [t, c] for t in ts])
                        fi = self.f_prim(p, P[:, 0], P[:, 1])
                        ok = valido(P)
                        for q in outros:
                            ok &= fi <= self.f_prim(q, P[:, 0], P[:, 1]) + 1e-6
                        for a_, b_ in _trechos(ok):
                            if b_ - a_ >= 2:
                                objs.append(faixa_2d([P[a_], P[b_]], larg, z + 0.002, cor, nome="junta"))
                        c += g
                continue
            if p["tipo"] != "traco" or not p["juntas"]:
                continue
            outros = [q for j, q in enumerate(prims) if j != i]

            def meu(P, p=p, outros=outros):
                X, Y = P[:, 0], P[:, 1]
                fi = self.f_prim(p, X, Y)
                ok = np.ones(len(X), bool)
                for q in outros:
                    ok &= fi <= self.f_prim(q, X, Y) + 1e-6
                return ok

            pts = p["pts"]
            L = comprimento(pts, p["fechado"])
            passo = p["passo"]
            if p["ajusta"] or p["fechado"]:
                n = max(1, int(round(L / passo)))
                passo = L / n
            n = int(math.floor(L / passo + 1e-6))
            ks = range(0, n) if p["fechado"] else range(1, n + (0 if abs(n * passo - L) < 1e-6 else 1))
            for k in ks:
                s = k * passo
                if not p["fechado"] and s >= L - 1e-6:
                    continue
                c, t = ponto_em(pts, s, p["fechado"])
                nn = V((-t.y, t.x))
                ts = np.linspace(-w, w, 66)
                P = np.array([[c.x + nn.x * u, c.y + nn.y * u] for u in ts])
                ok = valido(P) & meu(P)
                for a, b in _trechos(ok):
                    if b - a < 1:
                        continue
                    pa, pb = P[a], P[b]
                    objs.append(faixa_2d([pa, pb], larg, z + 0.002, cor, nome="junta"))
            if centro:
                dens = reamostra(pts, 0.35, p["fechado"])
                if p["fechado"]:
                    dens = dens + [dens[0]]
                P = np.array(dens)
                ok = valido(P) & meu(P)
                for a, b in _trechos(ok):
                    if b - a < 2:
                        continue
                    objs.append(faixa_2d([tuple(q) for q in P[a:b + 1]], larg, z + 0.0025, cor, nome="junta_meio"))
        return objs


def _trechos(ok):
    out, ini = [], None
    for i, v in enumerate(ok):
        if v and ini is None:
            ini = i
        elif not v and ini is not None:
            out.append((ini, i - 1))
            ini = None
    if ini is not None:
        out.append((ini, len(ok) - 1))
    return out


# =====================================================================================================================
# Peças pequenas
# =====================================================================================================================
def gira_z(ob, graus):
    ob.data.transform(Matrix.Rotation(math.radians(graus), 4, "Z"))
    return ob


def mover(ob, x=0.0, y=0.0, z=0.0, rot=0.0):
    if rot:
        gira_z(ob, rot)
    ob.data.transform(Matrix.Translation((x, y, z)))
    return ob


def tufo(x, y, cor="grama_escura", alt=0.3, n=5, r=0.07, z=-0.01):
    objs = []
    for j in range(n):
        ang = j * 2 * math.pi / n + 0.4
        dx, dy = 0.08 * math.cos(ang), 0.08 * math.sin(ang)
        o = mb.cilindro(r, alt * (0.75 + 0.25 * (j % 2)), x=0, y=0, z=0, r2=0.006, cor=cor, seg=5, bisel=0.0)
        mb.transforma(o, loc=(x + dx, y + dy, z), rot=[("Z", math.degrees(ang)), ("Y", 14)])
        objs.append(o)
    return mb.junta(objs, "tufo")


def flores(x, y, cores=("amarelo", "branco"), z=0.0, n=4, alt=0.2):
    objs = []
    pos = ((0, 0), (0.18, 0.1), (-0.12, 0.16), (0.05, -0.17), (-0.18, -0.08), (0.15, -0.12))[:n]
    for j, (dx, dy) in enumerate(pos):
        objs.append(mb.cilindro(0.016, alt, x=x + dx, y=y + dy, z=z - 0.02, cor="folha_escura", seg=3, bisel=0.0,
                                tampas=False))
        objs.append(mb.cilindro(0.085, 0.045, x=x + dx, y=y + dy, z=z + alt - 0.01, cor=cores[j % len(cores)], seg=6,
                                bisel=0.0))
        objs.append(mb.cilindro(0.035, 0.02, x=x + dx, y=y + dy, z=z + alt + 0.03, cor="amarelo_escuro", seg=4,
                                bisel=0.0))
    return mb.junta(objs, "flores")


def arbusto(x, y, r=0.5, cor="folha", z=0.0, alt=None, seg=12):
    a = alt or 1.6 * r
    return mb.superelipsoide(2 * r, 2 * r, a, x=x, y=y, z=z - 0.04, cor=cor, e=0.85, e_v=0.8, nu=seg, nv=seg // 2,
                             nome="arbusto")


def moita(x, y, z=0.0, esc=1.0, cores=("folha", "folha_escura", "folha_clara")):
    ps = []
    for k, (dx, dy, r) in enumerate(((0, 0, 0.55), (0.42, 0.15, 0.4), (-0.35, 0.22, 0.42))):
        ps.append(mb.superelipsoide(2 * r * esc, 2 * r * esc, 1.6 * r * esc, x=x + dx * esc, y=y + dy * esc,
                                    z=z - 0.05, cor=cores[k % len(cores)], e=0.85, e_v=0.8, nu=10, nv=5))
    return mb.junta(ps, "moita")


def arvore(x, y, z=0.0, esc=1.0, cores=("folha", "folha_escura", "folha_clara"), tronco="madeira", seed=0):
    """Árvore fofa: tronco afinando e copa de bolas sobrepostas."""
    rnd = random.Random(seed)
    ps = [mb.cilindro(0.17 * esc, 2.0 * esc, x=x, y=y, z=z, cor=tronco, seg=8, r2=0.11 * esc, bisel=0.0)]
    bolas = [(0, 0, 2.9, 1.25), (0.7, 0.25, 2.55, 0.85), (-0.6, -0.3, 2.6, 0.85), (0.15, -0.55, 3.45, 0.75),
             (-0.2, 0.5, 3.4, 0.8)]
    for k, (dx, dy, dz, r) in enumerate(bolas):
        j = 1 + rnd.uniform(-0.08, 0.08)
        ps.append(mb.superelipsoide(2 * r * esc * j, 2 * r * esc * j, 1.75 * r * esc * j, x=x + dx * esc,
                                    y=y + dy * esc, z=z + (dz - r * 0.85) * esc, cor=cores[k % len(cores)],
                                    e=0.92, e_v=0.85, nu=10, nv=6))
    return mb.junta(ps, "arvore")


def arvore_alta(x, y, z=0.0, esc=1.0, cor="folha", cor2="folha_escura"):
    """Árvore de copa oval alta (como as da referência do parque)."""
    ps = [mb.cilindro(0.14 * esc, 1.4 * esc, x=x, y=y, z=z, cor="madeira", seg=8, r2=0.1 * esc, bisel=0.0),
          mb.superelipsoide(1.7 * esc, 1.7 * esc, 2.9 * esc, x=x, y=y, z=z + 1.2 * esc, cor=cor, e=1.0, e_v=0.9,
                            nu=12, nv=8),
          mb.superelipsoide(1.0 * esc, 1.0 * esc, 1.3 * esc, x=x + 0.5 * esc, y=y - 0.35 * esc, z=z + 1.4 * esc,
                            cor=cor2, e=1.0, e_v=0.9, nu=8, nv=5)]
    return mb.junta(ps, "arvore_alta")


def acacia(x, y, z=0.0, esc=1.0, cor="laranja_claro", cor2="amarelo_escuro"):
    """Árvore de savana: tronco que se abre em galhos e copa larga e achatada em três tufos."""
    e = esc
    ps = [mb.cilindro(0.14 * e, 1.3 * e, x=x, y=y, z=z, r2=0.1 * e, cor="madeira_media", seg=7, bisel=0.0)]
    tufos = [(0.0, 0.0, 2.55, 1.35, cor), (0.95, 0.35, 2.3, 0.9, cor2), (-0.85, -0.4, 2.35, 0.95, cor2)]
    for dx, dy, dz, r, c in tufos:
        ps.append(haste((x, y, z + 1.2 * e), (x + dx * 0.8 * e, y + dy * 0.8 * e, z + (dz - 0.15) * e), 0.07 * e,
                        "madeira_media", 5))
        ps.append(mb.superelipsoide(2 * r * e, 1.8 * r * e, 0.55 * e, x=x + dx * e, y=y + dy * e, z=z + (dz - 0.2) * e,
                                    cor=c, e=0.85, e_v=0.55, nu=12, nv=5))
    return mb.junta(ps, "acacia")


def pinheiro(x, y, z=0.0, esc=1.0, cor="verde_escuro", cor2="verde_floresta"):
    ps = [mb.cilindro(0.15 * esc, 1.0 * esc, x=x, y=y, z=z, cor="madeira_media", seg=8, bisel=0.0)]
    for k, (zz, r, h) in enumerate(((0.8, 1.3, 1.9), (1.9, 1.0, 1.7), (2.9, 0.7, 1.5))):
        ps.append(mb.cilindro(r * esc, h * esc, x=x, y=y, z=z + zz * esc, r2=0.04 * esc, cor=cor if k % 2 == 0 else cor2,
                              seg=12, bisel=0.02))
    return mb.junta(ps, "pinheiro")


def pedra(x, y, z=0.0, l=1.0, p=0.8, a=0.6, cor="cinza", seed=0, rot=0.0):
    """Pedra facetada (icosfera achatada e tremida), sombreada chapada como na referência."""
    rnd = random.Random(seed)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.5)
    for v in bm.verts:
        j = 1 + rnd.uniform(-0.16, 0.16)
        v.co = V((v.co.x * l * j, v.co.y * p * j, max(v.co.z, -0.25) * a * 1.4 * j))
    bm.transform(Matrix.Translation((0, 0, 0.25 * a * 1.4)))
    ob = mb._obj("pedra", bm, cor, liso=False)
    gira_z(ob, rot)
    ob.data.transform(Matrix.Translation((x, y, z - 0.05)))
    return ob


def rocha_colunas(x, y, z=0.0, esc=1.0, cor="terracota", cor2="terracota_escura", seed=1, n=7):
    """Formação de rocha em colunas (como a dos recintos da referência): prismas irregulares de alturas variadas."""
    rnd = random.Random(seed)
    ps = []
    for k in range(n):
        ang = 2 * math.pi * k / n + rnd.uniform(-0.3, 0.3)
        rr = 0 if k == 0 else rnd.uniform(0.7, 1.5)
        cx, cy = x + rr * math.cos(ang) * esc, y + rr * math.sin(ang) * esc
        R = rnd.uniform(0.55, 0.85) * esc
        nl = rnd.choice((5, 6, 7))
        pts = [(R * (1 + rnd.uniform(-0.15, 0.1)) * math.cos(2 * math.pi * q / nl + ang),
                R * (1 + rnd.uniform(-0.15, 0.1)) * math.sin(2 * math.pi * q / nl + ang)) for q in range(nl)]
        h = (rnd.uniform(1.2, 2.6) if k else 3.0) * esc * (1.0 if rr < 1.1 else 0.7)
        ps.append(mb.extrudado(ccw(pts), h, x=cx, y=cy, z=z - 0.05, cor=cor if k % 3 else cor2, bisel=0.08 * esc,
                               seg=1, liso=False))
    return mb.junta(ps, "rocha")


def reamostra_uniforme(pts, passo, fechado=False):
    """Pontos igualmente espaçados (pelo comprimento) ao longo da polilinha."""
    L = comprimento(pts, fechado)
    n = max(1, int(round(L / passo)))
    if fechado:
        return [tuple(ponto_em(pts, L * k / n, True)[0]) for k in range(n)]
    return [tuple(ponto_em(pts, L * k / n, False)[0]) for k in range(n + 1)]


def bloco(l, p, a, x=0.0, y=0.0, z=0.0, cor="branco", bisel=0.0, mat="atlas"):
    """Caixa leve (bisel de 1 segmento, ou nenhum)."""
    return mb.caixa(l, p, a, x=x, y=y, z=z, cor=cor, bisel=bisel, seg=1, mat=mat)


def haste(p0, p1, r, cor="grafite", lados=6, mat="atlas"):
    """Cilindro reto entre dois pontos 3D (leve, sem curva)."""
    a, b = V(p0), V(p1)
    d = b - a
    L = d.length
    ob = mb.cilindro(r, L, z=0, cor=cor, seg=lados, bisel=0.0, mat=mat)
    q = V((0, 0, 1)).rotation_difference(d.normalized())
    ob.data.transform(Matrix.Translation(a) @ q.to_matrix().to_4x4())
    return ob


def banco(it, x, y, ang=0.0, z=0.0, cor="madeira_mel", ferro="grafite", nome="banco", assentos=True, larg=1.8):
    """Banco de praça (ripas de madeira e laterais de ferro). Frente para −Y antes de girar. Marca um assento por
    lugar no item (slots de 0,5 × 0,5 × 0,9)."""
    ps = []
    for k in range(4):
        ps.append(bloco(larg, 0.1, 0.045, y=-0.17 + k * 0.115, z=0.42, cor=cor, bisel=0.012))
    for k in range(3):
        r = bloco(larg, 0.035, 0.1, y=0.0, z=0.0, cor=cor, bisel=0.01)
        mb.transforma(r, rot=("X", -10))
        mb.transforma(r, loc=(0, 0.22 + k * 0.022, 0.55 + k * 0.13))
        ps.append(r)
    for sx in (-(larg / 2 - 0.12), larg / 2 - 0.12):
        ps.append(haste((sx, -0.24, 0.0), (sx, -0.2, 0.44), 0.03, ferro, 5))
        ps.append(haste((sx, 0.26, 0.0), (sx, 0.18, 0.44), 0.03, ferro, 5))
        ps.append(haste((sx, 0.17, 0.42), (sx, 0.27, 0.92), 0.028, ferro, 5))
        ps.append(bloco(0.05, 0.5, 0.05, x=sx, y=0.0, z=0.38, cor=ferro))
        ps.append(haste((sx, -0.23, 0.44), (sx, -0.2, 0.64), 0.022, ferro, 5))
        ps.append(bloco(0.06, 0.32, 0.04, x=sx, y=-0.06, z=0.63, cor=ferro, bisel=0.01))
    ob = mb.junta(ps, nome)
    mover(ob, x, y, z, ang)
    if assentos and it is not None:
        c, s = math.cos(math.radians(ang)), math.sin(math.radians(ang))
        n = 3 if larg >= 1.6 else 2
        for k in range(n):
            lx = (k - (n - 1) / 2) * (larg / n)
            px, py = x + lx * c - (-0.02) * s, y + lx * s + (-0.02) * c
            it.assento(f"assento_{len([q for q in it.slots if 'assento' in q[0]]) + 1}", round(px, 3), round(py, 3),
                       round(z + 0.465, 3))
    return ob


def poste_praca(x, y, z=0.0, alt=4.4, cor="grafite", lanternas=4, ang=0.0):
    """Poste de praça com 4 lanternas (corpo escuro, vidro aceso com 'luz')."""
    ps = [mb.torno([(0, 0), (0.24, 0), (0.24, 0.12), (0.17, 0.2), (0.12, 0.55), (0.08, 0.65), (0, 0.65)],
                   x=x, y=y, z=z, cor=cor, seg=8, angulo=50),
          mb.cilindro(0.065, alt - 0.6, x=x, y=y, z=z + 0.6, cor=cor, seg=8, r2=0.05, bisel=0.0),
          mb.cilindro(0.11, 0.16, x=x, y=y, z=z + alt - 0.5, cor=cor, seg=8, r2=0.06, bisel=0.0),
          mb.cilindro(0.04, 0.3, x=x, y=y, z=z + alt - 0.34, cor=cor, seg=6, r2=0.0, bisel=0.0)]
    luzes = []
    topo = z + alt
    braco = 0.55
    for k in range(lanternas):
        a = math.radians(45 + 90 * k + ang)
        dx, dy = math.cos(a), math.sin(a)
        lx, ly = x + braco * dx, y + braco * dy
        ps.append(haste((x, y, topo - 0.45), (x + 0.3 * dx, y + 0.3 * dy, topo - 0.42), 0.028, cor, 4))
        ps.append(haste((x + 0.3 * dx, y + 0.3 * dy, topo - 0.42), (lx, ly, topo - 0.3), 0.028, cor, 4))
        ps.append(mb.cilindro(0.1, 0.06, x=lx, y=ly, z=topo - 0.3, cor=cor, seg=6, bisel=0.0))
        luzes.append(mb.cilindro(0.09, 0.3, x=lx, y=ly, z=topo - 0.24, r2=0.115, cor=None, mat="luz", seg=6,
                                 bisel=0.0))
        ps.append(mb.cilindro(0.15, 0.13, x=lx, y=ly, z=topo + 0.06, r2=0.03, cor=cor, seg=6, bisel=0.0))
    return mb.junta(ps + luzes, "poste_praca")


def lixeiras(x, y, z=0.0, ang=0.0):
    """Lixeiras de reciclagem: 4 cores (papel, plástico, vidro, metal)."""
    ps = []
    for k, c in enumerate(("azul", "vermelho", "verde", "amarelo")):
        lx = (k - 1.5) * 0.46
        ps.append(bloco(0.42, 0.42, 0.78, x=lx, z=0.0, cor=c, bisel=0.04))
        ps.append(bloco(0.45, 0.45, 0.08, x=lx, z=0.78, cor=c, bisel=0.03))
        ps.append(bloco(0.26, 0.02, 0.06, x=lx, y=-0.225, z=0.66, cor="grafite_escuro"))
        ps.append(bloco(0.16, 0.012, 0.16, x=lx, y=-0.214, z=0.36, cor="branco"))
    ob = mb.junta(ps, "lixeiras")
    mover(ob, x, y, z, ang)
    return ob


def lixeira(x, y, z=0.0, cor="verde_escuro"):
    ps = [mb.cilindro(0.24, 0.8, x=x, y=y, z=z, r2=0.27, cor=cor, seg=10, bisel=0.0),
          mb.cilindro(0.29, 0.06, x=x, y=y, z=z + 0.8, cor="grafite", seg=10, bisel=0.0),
          mb.cilindro(0.18, 0.04, x=x, y=y, z=z + 0.86, cor="grafite", seg=8, bisel=0.0)]
    return mb.junta(ps, "lixeira")


def cerca(pontos, alt=0.9, passo=1.3, cor="madeira", cor2=None, fechado=False, z=0.0, r_post=0.05, trilhos=(0.4, 0.8),
          tipo="madeira"):
    """Cerca baixa ao longo de uma linha 2D (postes igualmente espaçados e travessas)."""
    cor2 = cor2 or cor
    pts = reamostra_uniforme(pontos, passo, fechado)
    zs = z if callable(z) else (lambda px, py: z)
    m = Malha()
    for p in pts:
        z0 = zs(p[0], p[1])
        if tipo == "madeira":
            r = r_post
            b = [m.v((p[0] + sx * r, p[1] + sy * r, z0 - 0.02)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
            t = [m.v((p[0] + sx * r, p[1] + sy * r, z0 + alt)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
            pt = m.v((p[0], p[1], z0 + alt + r * 1.2))
            for k in range(4):
                m.f((b[k], b[(k + 1) % 4], t[(k + 1) % 4], t[k]), cor)
                m.f((t[k], t[(k + 1) % 4], pt), cor)
        else:
            pass
    ps = [m.obj("postes")]
    if tipo != "madeira":
        ps = [mb.cilindro(r_post, alt, x=p[0], y=p[1], z=zs(p[0], p[1]) - 0.02, cor=cor, seg=6, bisel=0.0)
              for p in pts]
    seq = pts + ([pts[0]] if fechado else [])
    for h in trilhos:
        cam = [(p[0], p[1], zs(p[0], p[1]) + alt * h) for p in seq]
        ps.append(varre_perfil(cam, [(-0.022, -0.04), (0.022, -0.04), (0.022, 0.04), (-0.022, 0.04)], cor2,
                               nome="travessa", liso=False, tampas=not fechado))
    return mb.junta(ps, "cerca")


def bandeirinhas(p0, p1, n=10, cores=("vermelho", "amarelo", "azul", "verde", "rosa"), queda=0.5, tam=0.32):
    """Varal de bandeirinhas entre dois pontos 3D (com a curva da corda)."""
    a, b = V(p0), V(p1)
    pts = []
    for k in range(n + 1):
        t = k / n
        p = a + (b - a) * t
        p.z -= queda * 4 * t * (1 - t)
        pts.append(p)
    ps = [mb.tubo([tuple(p) for p in pts], 0.012, cor="grafite", raio_curva=0.05, seg=4)]
    d = (b - a)
    d.z = 0
    d.normalize()
    for k in range(n):
        t = (k + 0.5) / n
        p = a + (b - a) * t
        p.z -= queda * 4 * t * (1 - t)
        tri = [(p.x - d.x * tam / 2, p.y - d.y * tam / 2, p.z), (p.x + d.x * tam / 2, p.y + d.y * tam / 2, p.z),
               (p.x, p.y, p.z - tam * 1.1)]
        m = Malha()
        vs = [m.v(q) for q in tri]
        m.f(vs, cores[k % len(cores)])
        m.f(vs[::-1], cores[k % len(cores)])
        ps.append(m.obj("bandeirinha"))
    return mb.junta(ps, "bandeirinhas")


def bola(r, x=0.0, y=0.0, z=0.0, cor=None, mat="atlas", sub=0, esc=(1, 1, 1)):
    """Bolinha leve (icosaedro, 20 triângulos; sub=1: 80), sombreada lisa."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    bm.transform(Matrix.Translation((x, y, z)) @ Matrix.Diagonal((*esc, 1)))
    return mb._obj("bola", bm, cor, mat, liso=True, angulo=89)


def lampadas(pts3, r=0.06, mat="luz", seg=8):
    """Lâmpadas redondinhas em pontos 3D (leves)."""
    return [bola(r, p[0], p[1], p[2], cor=None, mat=mat) for p in pts3]


def placa_estampa(mat_idx, w, h, x, y, z, normal=(0, -1, 0), nome="letreiro", uv=((0, 0), (1, 0), (1, 1), (0, 1))):
    """Retângulo vertical com UV próprio (letreiro), centrado em (x, y, z), olhando para 'normal' (horizontal)."""
    n = V(normal).normalized()
    up = V((0, 0, 1))
    u = (-n).cross(up).normalized()  # direita de quem olha a placa de frente
    c = V((x, y, z))
    bm = bmesh.new()
    vs = [bm.verts.new(c + u * (sx * w / 2) + up * (sy * h / 2)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    f = bm.faces.new(vs)
    f.normal_update()
    uvl = bm.loops.layers.uv.new("UVMap")
    for lo, q in zip(f.loops, uv):
        lo[uvl].uv = q
    if f.normal.dot(n) < 0:
        f.normal_flip()
    mb.materiais()
    for fc in bm.faces:
        fc.material_index = mat_idx
    me = bpy.data.meshes.new(nome)
    bm.to_mesh(me)
    bm.free()
    for nm in mb.MAT_NOMES:
        me.materials.append(bpy.data.materials[nm])
    ob = bpy.data.objects.new(nome, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def estrela_pts(r, r_in=0.45, pontas=5, rot=90):
    pts = []
    for k in range(pontas * 2):
        rr = r if k % 2 == 0 else r * r_in
        a = math.radians(rot + 180 * k / pontas)
        pts.append((rr * math.cos(a), rr * math.sin(a)))
    return ccw(pts)


def anel_lampadas(cx, cy, z, R, n, r=0.06, a0=0.0):
    return [(cx + R * math.cos(a0 + 2 * math.pi * k / n), cy + R * math.sin(a0 + 2 * math.pi * k / n), z)
            for k in range(n)]
