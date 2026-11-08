"""Ferramentas dos veículos de chão da cidade do Morada (categoria "carros"), por cima da moveis_base.

Nada aqui altera a moveis_base nem a cidade_base: é o que faltava a elas para fazer carros.

- ItemV: Item com filhos animados (rodas). Cada filho leva os extras glTF {"anima": "girar", "eixo": "x",
  "velocidade": 240, "roda": 1, "raio": r} e a lista vai também no catálogo (extra["animacoes"], com "pivo" em glTF).
  Sirene: {"anima": "piscar", "periodo": 0.8}.
- Carroceria por "loft": seções de superelipse ao longo de Y (perfis de topo, base e largura suaves), boleada, com os
  arcos das rodas, o interior (banheira) e a caçamba recortados por booleana exata.
- Cabine por camadas em Z (retângulo arredondado em planta que afina para cima): os vidros são as faces de frente,
  de lado e de trás numa faixa de altura (colunas = cantos), rebaixados com moldura preta, em "janela_apagada".
- Portas e tampas: recortadas da própria casca (bisect + separação), com espessura, viram Item.porta / Item.correr.
- Faróis ("luz"), lanternas ("luz_vermelha"), grade, para-choques e adesivos colados na superfície por raio (BVH).
"""
import math
import os

import bpy
import bmesh
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

import moveis_base as mb

V = Vector
VEL_RODA = 240


# ======================================================================================================================
# Item com filhos animados
# ======================================================================================================================
class ItemV(mb.Item):
    def __init__(self, id_):
        super().__init__(id_)
        self.animados = []

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


# ======================================================================================================================
# bmesh ↔ objeto
# ======================================================================================================================
def uvl(bm):
    return bm.loops.layers.uv.get("UVMap") or bm.loops.layers.uv.new("UVMap")


def bm_pinta(bm, faces, cor=None, mat=None):
    lay = uvl(bm)
    u = mb.uv_cor(cor) if cor else None
    mi = mb._mat_idx(mat) if mat is not None else None
    for f in faces:
        if mi is not None:
            f.material_index = mi
        if u:
            for lo in f.loops:
                lo[lay].uv = u


def objeto(nome, bm, angulo=40, liso=True):
    """bmesh → objeto, mantendo UV e materiais das faces (ao contrário de mb._obj, que pinta tudo de uma cor)."""
    mb.materiais()
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


def bm_de(ob, apaga=True):
    """objeto → bmesh (posição aplicada), com os índices de material remapeados para a ordem de mb.MAT_NOMES."""
    me = ob.data.copy()
    me.transform(ob.matrix_world)
    nomes = [m.name.split(".")[0] if m else "" for m in me.materials]
    bm = bmesh.new()
    bm.from_mesh(me)
    bpy.data.meshes.remove(me)
    mapa = [mb.MAT_NOMES.index(n) if n in mb.MAT_NOMES else 0 for n in nomes]
    for f in bm.faces:
        f.material_index = mapa[f.material_index] if f.material_index < len(mapa) else 0
    if apaga:
        m = ob.data
        bpy.data.objects.remove(ob)
        if m.users == 0:
            bpy.data.meshes.remove(m)
    return bm


def avaliado(ob):
    """Malha do objeto com os modificadores aplicados → bmesh (e apaga o objeto)."""
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    tmp = bpy.data.objects.new("tmp_av", me)
    tmp.matrix_world = ob.matrix_world.copy()
    bpy.context.scene.collection.objects.link(tmp)
    m = ob.data
    bpy.data.objects.remove(ob)
    if m.users == 0:
        bpy.data.meshes.remove(m)
    return bm_de(tmp)


def booleana(bm, cortadores, nome="corpo"):
    """Diferença exata da casca (bm) com cada cortador (objetos). As faces novas herdam cor e material do cortador."""
    ob = objeto(nome, bm, liso=False)
    for c in cortadores:
        md = ob.modifiers.new("b", "BOOLEAN")
        md.operation = "DIFFERENCE"
        md.solver = "EXACT"
        md.object = c
        try:
            md.material_mode = "TRANSFER"
        except (AttributeError, TypeError):
            pass
    out = avaliado(ob)
    for c in cortadores:
        m = c.data
        bpy.data.objects.remove(c)
        if m.users == 0:
            bpy.data.meshes.remove(m)
    return out


def solidifica(bm, esp=0.03, nome="casca"):
    """Dá espessura (para dentro) a uma casca aberta."""
    ob = objeto(nome, bm, liso=False)
    md = ob.modifiers.new("s", "SOLIDIFY")
    md.thickness = esp
    md.offset = -1.0
    md.use_even_offset = True
    md.use_rim = True
    return avaliado(ob)


def corta(bm, co, no, filtro=None):
    """Corta a malha num plano (acrescenta arestas, não apaga nada). filtro(centro, normal): só as faces que passam
    (o corte não dá a volta no carro inteiro: menos triângulos)."""
    if filtro is None:
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    else:
        bm.normal_update()
        fs = [f for f in bm.faces if filtro(f.calc_center_median(), f.normal)]
        es = {e for f in fs for e in f.edges}
        vs = {v for f in fs for v in f.verts}
        geom = list(vs) + list(es) + fs
        if not fs:
            return
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=no, dist=1e-5)


def separa(bm, pred):
    """Tira de bm as faces em que pred(face) é verdadeiro e devolve um bmesh novo com elas."""
    bm.faces.ensure_lookup_table()
    idx = [f.index for f in bm.faces if pred(f)]
    s = set(idx)
    bm2 = bm.copy()
    bm2.faces.ensure_lookup_table()
    bmesh.ops.delete(bm2, geom=[f for f in bm2.faces if f.index not in s], context="FACES")
    bmesh.ops.delete(bm, geom=[bm.faces[i] for i in idx], context="FACES")
    return bm2


def centro(f):
    return f.calc_center_median()


# ======================================================================================================================
# Curvas suaves
# ======================================================================================================================
def curva(pts):
    """Interpolação cúbica monótona (Fritsch–Carlson) por pontos (x, y) com x crescente."""
    pts = sorted(pts)
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    n = len(pts)
    if n == 1:
        return lambda x: ys[0]
    d = [(ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]) for i in range(n - 1)]
    m = [d[0]]
    for i in range(1, n - 1):
        if d[i - 1] * d[i] <= 0:
            m.append(0.0)
        else:
            m.append(2 / (1 / d[i - 1] + 1 / d[i]))
    m.append(d[-1])

    def f(x):
        if x <= xs[0]:
            return ys[0]
        if x >= xs[-1]:
            return ys[-1]
        i = 0
        while xs[i + 1] < x:
            i += 1
        h = xs[i + 1] - xs[i]
        t = (x - xs[i]) / h
        h00 = 2 * t ** 3 - 3 * t ** 2 + 1
        h10 = t ** 3 - 2 * t ** 2 + t
        h01 = -2 * t ** 3 + 3 * t ** 2
        h11 = t ** 3 - t ** 2
        return h00 * ys[i] + h10 * h * m[i] + h01 * ys[i + 1] + h11 * h * m[i + 1]
    return f


def _const_ou_curva(v):
    if isinstance(v, (int, float)):
        return lambda y: v
    return curva(v)


# ======================================================================================================================
# Carroceria (loft de superelipses ao longo de Y)
# ======================================================================================================================
def secao(y, w, zb, zm, zt, n=28, et=0.35, eb=0.22):
    pts = []
    for k in range(n):
        th = 2 * math.pi * k / n
        c, s = math.cos(th), math.sin(th)
        e = et if s >= 0 else eb
        x = w * math.copysign(abs(c) ** e, c)
        z = zm + ((zt - zm) if s >= 0 else (zm - zb)) * math.copysign(abs(s) ** e, s)
        pts.append((x, y, z))
    return pts


def loft(aneis, tampa_ini=True, tampa_fim=True, bombe_fim=0.0):
    bm = bmesh.new()
    rs = [[bm.verts.new(p) for p in a] for a in aneis]
    n = len(aneis[0])
    for a, b in zip(rs, rs[1:]):
        for k in range(n):
            bm.faces.new((a[k], a[(k + 1) % n], b[(k + 1) % n], b[k]))
    caps = []
    if tampa_ini:
        caps.append(bm.faces.new(rs[0][::-1]))
    if tampa_fim:
        caps.append(bm.faces.new(rs[-1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    for f in caps:
        r = bmesh.ops.poke(bm, faces=[f])
        if bombe_fim and f is caps[-1]:
            for v in r["verts"]:
                v.co.z += bombe_fim
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


class Casca:
    """Forma da carroceria: largura(y), topo(y), base(y) já com o arredondamento das pontas."""

    def __init__(self, c):
        self.c = c
        self.yF, self.yR = c["yF"], c["yR"]
        self.W = c["W"]
        self._topo = curva(c["topo"])
        self._base = curva(c["base"])
        self._larg = _const_ou_curva(c.get("larg", 1.0))
        self.rF, self.rR = c.get("rF", 0.5), c.get("rR", 0.45)
        self.pF, self.pR = c.get("pF", 2.5), c.get("pR", 2.5)

    def arred(self, y):
        if y < self.yF + self.rF:
            s = min(0.999, (self.yF + self.rF - y) / self.rF)
            return (1 - s ** self.pF) ** (1 / self.pF)
        if y > self.yR - self.rR:
            s = min(0.999, (y - (self.yR - self.rR)) / self.rR)
            return (1 - s ** self.pR) ** (1 / self.pR)
        return 1.0

    def w(self, y):
        return self.W / 2 * self._larg(y) * self.arred(y)

    def topo(self, y):
        return self._topo(y)

    def base(self, y):
        return self._base(y)

    def estacoes(self, passo=0.2):
        ys = []
        for s in (0.99, 0.9, 0.7, 0.4):
            ys.append(self.yF + self.rF * (1 - s))
        a, b = self.yF + self.rF, self.yR - self.rR
        n = max(2, int(round((b - a) / passo)))
        ys += [a + (b - a) * k / n for k in range(n + 1)]
        ra = self.c["r"] + self.c.get("folga_arco", 0.05)
        for ya in self.c.get("eixos", ()):  # mais seções nos arcos das rodas (o recorte fica limpo)
            for d in (-1.05, -0.6, 0.0, 0.6, 1.05):
                y = ya + d * ra
                if a < y < b:
                    ys.append(y)
        ys = sorted(ys)
        limpo = [ys[0]]
        for y in ys[1:]:
            if y - limpo[-1] > 0.06:
                limpo.append(y)
        ys = limpo
        for s in (0.4, 0.7, 0.9, 0.99):
            ys.append(self.yR - self.rR * (1 - s))
        return sorted(set(round(y, 5) for y in ys))

    def bm(self):
        c = self.c
        n = c.get("n", 22)
        et, eb = c.get("et", 0.35), c.get("eb", 0.22)
        cint = c.get("cint", 0.45)
        aneis = []
        for y in self.estacoes(c.get("passo", 0.4)):
            f = self.arred(y)
            zt, zb = self.topo(y), self.base(y)
            zm = zb + (zt - zb) * cint
            g = c.get("g0", 0.75) + (1 - c.get("g0", 0.75)) * f
            aneis.append(secao(y, self.w(y), zm - (zm - zb) * g, zm, zm + (zt - zm) * g, n, et, eb))
        return loft(aneis)


# ======================================================================================================================
# Cabine (camadas em Z)
# ======================================================================================================================
class Cabine:
    """k: yf0, yf1 (para-brisa embaixo/em cima), yr0, yr1 (vidro de trás embaixo/em cima), wc0, wc1 (meia largura
    embaixo/em cima), zb (cintura), zr (teto), z0 (fundo, enterrado na carroceria), rc (raio dos cantos em planta),
    rr (raio da borda do teto), gb/gt (moldura de baixo/de cima dos vidros), pilar_b (y ou None), largura do pilar."""

    def __init__(self, k):
        self.k = dict(k)
        k = self.k
        k.setdefault("z0", k["zb"] - 0.12)
        k.setdefault("rc", 0.12)
        k.setdefault("rr", 0.1)
        k.setdefault("gb", 0.05)
        k.setdefault("gt", 0.045)
        k.setdefault("seg", 3)
        self.zlo = k["zb"] + k["gb"]
        self.zhi = k["zr"] - k["rr"] - k["gt"]

    def t(self, z):
        k = self.k
        return min(1.0, max(0.0, (z - k["zb"]) / (k["zr"] - k["zb"])))

    def frente(self, z):
        k = self.k
        return k["yf0"] + (k["yf1"] - k["yf0"]) * self.t(z)

    def tras(self, z):
        k = self.k
        return k["yr0"] + (k["yr1"] - k["yr0"]) * self.t(z)

    def larg(self, z):
        k = self.k
        return k["wc0"] + (k["wc1"] - k["wc0"]) * self.t(z)

    def anel(self, z, enc=0.0, rc=None):
        yf, yr, w = self.frente(z) + enc, self.tras(z) - enc, self.larg(z) - enc
        rc = self.k["rc"] if rc is None else rc
        pts = mb.ret_arredondado(2 * w, yr - yf, rc, seg=self.k["seg"])
        yc = (yf + yr) / 2
        return [(x, yc + y, z) for x, y in pts]

    def bm(self, tampa_base=False):
        k = self.k
        zr, rr = k["zr"], k["rr"]
        zs = [k["z0"], k["zb"], self.zlo, self.zhi, zr - rr]
        aneis = [self.anel(z) for z in zs]
        for i in (1, 2, 3):
            a = math.radians(90 * i / 3)
            d = rr * (1 - math.cos(a))
            aneis.append(self.anel(zr - rr + rr * math.sin(a), enc=d, rc=max(0.03, k["rc"] - d * 0.6)))
        return loft(aneis, tampa_ini=tampa_base, tampa_fim=True, bombe_fim=k.get("bombe", 0.02))

    def vidro(self, f, lados=True, frente=True, tras=True, faixas_fora=()):
        """A face f é vidro? (pela normal, dentro da faixa de altura; colunas = cantos e faixas_fora em y)."""
        c, n = centro(f), f.normal
        if not (self.zlo + 0.004 < c.z < self.zhi - 0.004):
            return False
        if any(a < c.y < b for a, b in faixas_fora):
            return False
        if lados and abs(n.x) > 0.72:
            return True
        if frente and n.y < -0.45 and abs(c.x) < self.larg(c.z) - self.k["rc"] * 0.5:
            return True
        if tras and n.y > 0.45 and abs(c.x) < self.larg(c.z) - self.k["rc"] * 0.5:
            return True
        return False


def envidraca(bm, faces, moldura="preto", esp=0.022, fundo=0.014):
    """Faces de vidro: rebaixa com moldura (cor) e põe o material janela_apagada."""
    if not faces:
        return
    bm_pinta(bm, faces, mat="janela_apagada")
    r = bmesh.ops.inset_region(bm, faces=faces, thickness=esp, depth=-fundo, use_even_offset=True,
                               use_boundary=True)
    bm_pinta(bm, r["faces"], cor=moldura, mat="atlas")


# ======================================================================================================================
# Peças coladas na superfície
# ======================================================================================================================
class Sup:
    """Superfície para lançar raios (BVH de uma cópia do bmesh)."""

    def __init__(self, bm):
        self.bm = bm.copy()
        self.bvh = BVHTree.FromBMesh(self.bm)

    def raio(self, origem, direcao, dist=20.0):
        loc, nor, idx, d = self.bvh.ray_cast(V(origem), V(direcao).normalized(), dist)
        if loc is None:
            return None, None
        nor = V(nor)
        if nor.dot(V(direcao)) > 0:  # bateu por dentro: a normal aponta para fora do raio
            nor = -nor
        return V(loc), nor

    def livra(self):
        self.bm.free()


def base_de(n, cima=V((0, 0, 1))):
    """Matriz 3×3 com Z local = n e X local horizontal (tangente)."""
    n = V(n).normalized()
    t = cima.cross(n)
    if t.length < 1e-4:
        t = V((1, 0, 0))
    t.normalize()
    b = n.cross(t).normalized()
    return Matrix((t, b, n)).transposed()


def lente(l, h, esp=0.04, raio=None, cor=None, mat="atlas", forma="ret", seg=3, nome="lente", bisel=0.0):
    """Placa fina no plano XY local (espessura em Z, centrada), cantos boleados; forma "ret" ou "redonda"."""
    if forma == "redonda":
        pts = mb.circulo(0, seg=14, rx=l / 2, ry=h / 2)
    else:
        pts = mb.ret_arredondado(l, h, raio if raio is not None else min(l, h) * 0.3, seg=2)
    return mb.extrudado(pts, esp, z=-esp / 2, cor=cor, mat=mat, bisel=bisel, seg=1, nome=nome)


def cola(ob, pos, n, sai=0.0, giro=0.0):
    """Leva um objeto feito no plano XY local para a superfície: Z local na normal n, centro em pos + n·sai."""
    M = Matrix.Translation(V(pos) + V(n).normalized() * sai) @ base_de(n).to_4x4() @ \
        Matrix.Rotation(math.radians(giro), 4, "Z")
    ob.data.transform(M)
    return ob


def quad_estampa(mat_idx, w, h, uv=((0, 0), (1, 0), (1, 1), (0, 1)), nome="estampa"):
    """Retângulo w × h no plano XY local, olhando para +Z, com UV próprio (estampa)."""
    bm = bmesh.new()
    vs = [bm.verts.new((sx * w / 2, sy * h / 2, 0)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    f = bm.faces.new(vs)
    lay = uvl(bm)
    for lo, q in zip(f.loops, uv):
        lo[lay].uv = q
    f.material_index = mat_idx
    return objeto(nome, bm, liso=False)


# ======================================================================================================================
# Rodas
# ======================================================================================================================
def roda(r, larg, cor_pneu="borracha", cor_aro="cromo", estilo="calota", seg=14, cor_cubo=None, mat_aro="atlas",
         nome="roda"):
    """Roda com eixo em X e centro na origem: pneu boleado (torno), aro e cubo. estilos: calota, raios, esporte,
    neon (aro aceso), branca (faixa branca no pneu), moto (aro fino com raios)."""
    t = larg / 2
    partes = []
    if estilo == "bici":
        rt = larg / 2
        perfil = [(r - rt + rt * math.cos(math.radians(a)), rt * math.sin(math.radians(a))) for a in range(-90, 271, 60)]
        partes.append(mb.torno(perfil, cor=cor_pneu, seg=seg + 6, angulo=70, nome="pneu"))
        partes.append(mb.torno([(r - 2 * rt, -rt * 0.4), (r - 1.6 * rt, -rt * 0.5), (r - 1.6 * rt, rt * 0.5),
                                (r - 2 * rt, rt * 0.4), (r - 2.3 * rt, 0), (r - 2 * rt, -rt * 0.4)],
                               cor=cor_aro, seg=seg + 6, angulo=70, nome="aro"))
        partes.append(mb.cilindro(r * 0.08, larg * 1.6, z=-larg * 0.8, cor=cor_cubo or "metal_escuro", seg=8, bisel=0))
        nr = 8
        for k in range(nr):
            a = 2 * math.pi * k / nr
            sp = mb.cilindro(0.004, r - 2 * rt, cor="metal_claro", seg=3, bisel=0)
            mb.transforma(sp, rot=[("Z", math.degrees(a)), ("Y", 90)])
            partes.append(sp)
    elif estilo == "moto":
        perfil = [(r * 0.8, -t * 0.9), (r * 0.9, -t), (r, -t * 0.4), (r, t * 0.4), (r * 0.9, t), (r * 0.8, t * 0.9)]
        partes.append(mb.torno(perfil, cor=cor_pneu, seg=seg + 2, angulo=50, nome="pneu"))
        partes.append(mb.torno([(r * 0.8, -t * 0.5), (r * 0.82, t * 0.5), (r * 0.74, t * 0.4), (r * 0.74, -t * 0.4),
                                (r * 0.8, -t * 0.5)], cor=cor_aro, seg=seg + 2, angulo=50, nome="aro"))
        partes.append(mb.cilindro(r * 0.14, larg * 1.3, z=-larg * 0.65, cor=cor_cubo or "metal_escuro", seg=10,
                                  bisel=0.005))
        nr = 10
        for k in range(nr):
            a = 2 * math.pi * k / nr
            sp = mb.cilindro(0.006, r * 0.66, cor=cor_aro, seg=4, bisel=0)
            mb.transforma(sp, rot=[("Z", math.degrees(a)), ("Y", 90)])
            mb.transforma(sp, loc=(math.cos(a) * r * 0.1, math.sin(a) * r * 0.1, (0.3 if k % 2 else -0.3) * t))
            partes.append(sp)
    else:
        perfil = [(r * 0.64, -t * 0.9), (r * 0.9, -t), (r, -t * 0.55), (r, t * 0.55), (r * 0.9, t), (r * 0.64, t * 0.9)]
        pneu = mb.torno(perfil, cor=cor_pneu, seg=seg, angulo=50, nome="pneu")
        if estilo == "branca":
            mb.pinta_onde(pneu, "branco", lambda c, n: abs(c.z) > t * 0.85 and 0.72 * r < math.hypot(c.x, c.y) < 0.86 * r)
        partes.append(pneu)
        ra = r * 0.66
        partes.append(mb.cilindro(ra, larg * 0.8, z=-larg * 0.4, cor=cor_aro, seg=seg, bisel=0, mat=mat_aro,
                                  nome="aro"))
        if estilo in ("calota", "branca"):
            partes.append(mb.cilindro(ra * 0.38, larg * 0.9, z=-larg * 0.45, cor=cor_cubo or "metal_escuro", seg=8,
                                      bisel=0.01))
        elif estilo in ("raios", "esporte"):
            nr = 5
            for lado in (-1, 1):  # raios dos dois lados (a roda é simétrica: serve dos dois lados do carro)
                for k in range(nr):
                    a = 360 * k / nr
                    sp = mb.caixa(ra * 0.2, ra * 0.78, 0.02, cor=cor_cubo or "metal_escuro", bisel=0, liso=False)
                    mb.transforma(sp, loc=(0, ra * 0.45, 0))
                    mb.transforma(sp, rot=("Z", a))
                    mb.transforma(sp, loc=(0, 0, lado * larg * 0.4 - (0.02 if lado < 0 else 0)))
                    partes.append(sp)
            partes.append(mb.cilindro(ra * 0.24, larg * 0.92, z=-larg * 0.46, cor=cor_aro, seg=8, bisel=0))
        elif estilo == "neon":
            for lado in (-1, 1):
                partes.append(mb.cilindro(ra * 0.82, 0.012, z=lado * larg * 0.4 - 0.006 + lado * 0.004, cor=None,
                                          mat=mat_aro if mat_aro != "atlas" else "neon", seg=seg, bisel=0))
            partes.append(mb.cilindro(ra * 0.6, larg * 0.86, z=-larg * 0.43, cor=cor_cubo or "branco", seg=seg,
                                      bisel=0.01))
            partes.append(mb.cilindro(ra * 0.22, larg * 0.92, z=-larg * 0.46, cor="grafite", seg=10, bisel=0.008))
    ob = mb.junta(partes, nome)
    mb.transforma(ob, rot=("Y", 90))
    return ob


def poe_roda(it, r, larg, x, y, nome, **op):
    """Roda animada (filho) com o eixo em (x, y, r)."""
    ob = roda(r, larg, **op)
    mb.transforma(ob, loc=(x, y, r))
    return it.anima(ob, {"anima": "girar", "eixo": "x", "velocidade": VEL_RODA, "roda": 1, "raio": round(r, 3)},
                    nome, pivo=(x, y, r))


# ======================================================================================================================
# Interior
# ======================================================================================================================
def banco(x, y, z, larg=0.48, cor="grafite", prof=0.46, enc=0.55, incl=14, cabeca=True):
    """Banco com a frente para −Y: assento em z (base), encosto inclinado para trás."""
    ps = [mb.superelipsoide(larg, prof, 0.14, x=x, y=y, z=z, cor=cor, e=0.35, nu=8, nv=4, nome="assento")]
    enc_ = mb.superelipsoide(larg * 0.94, 0.13, enc, cor=cor, e=0.35, nu=8, nv=4, nome="encosto")
    mb.transforma(enc_, rot=("X", -incl))
    mb.transforma(enc_, loc=(x, y + prof / 2 - 0.06, z + 0.08))
    ps.append(enc_)
    if cabeca and larg < 0.7:
        cb_ = mb.superelipsoide(larg * 0.55, 0.1, 0.16, cor=cor, e=0.4, nu=8, nv=4, nome="cabeca")
        dz = enc + 0.1
        mb.transforma(cb_, loc=(x, y + prof / 2 - 0.06 + math.sin(math.radians(incl)) * dz, z + 0.08 +
                                math.cos(math.radians(incl)) * dz - 0.02))
        ps.append(cb_)
    return mb.junta(ps, "banco")


def volante(x, y, z, r=0.17, cor="preto", incl=-60):
    perfil = [(r + 0.022 * math.cos(math.radians(a)), 0.022 * math.sin(math.radians(a))) for a in range(-90, 271, 90)]
    aro = mb.torno(perfil, cor=cor, seg=10, angulo=80, nome="volante")
    cubo = mb.cilindro(0.05, 0.04, z=-0.02, cor=cor, seg=8, bisel=0)
    raio_ = mb.caixa(2 * r, 0.03, 0.02, z=-0.01, cor=cor, bisel=0.006, seg=1)
    ob = mb.junta([aro, cubo, raio_], "volante")
    mb.transforma(ob, rot=("X", incl))
    mb.transforma(ob, loc=(x, y, z))
    return ob


# ======================================================================================================================
# Estampas (PNG desenhados com PIL dentro do Blender)
# ======================================================================================================================
FONTE = "/usr/share/fonts/opentype/inter/Inter-Black.otf"
_EST = {}


def estampa(pasta, nome, desenha, tam=(512, 128), emissao=0.0):
    """Gera <pasta>/estampas/<nome>.png com desenha(draw, img, fonte) e devolve o índice do material."""
    chave = (nome, emissao)
    if chave in _EST:
        return _EST[chave]
    from PIL import Image, ImageDraw, ImageFont
    d = os.path.join(pasta, "estampas")
    os.makedirs(d, exist_ok=True)
    png = os.path.join(d, nome + ".png")
    img = Image.new("RGBA", tam, (0, 0, 0, 0))
    dr = ImageDraw.Draw(img)

    def fonte(px):
        return ImageFont.truetype(FONTE, px)
    desenha(dr, img, fonte)
    img.save(png)
    _EST[chave] = mb.material_estampa("carros_" + nome, png, emissao=emissao)
    return _EST[chave]


def texto_centro(dr, tam, txt, fonte, cor, dy=0):
    bb = dr.textbbox((0, 0), txt, font=fonte)
    w, h = bb[2] - bb[0], bb[3] - bb[1]
    dr.text(((tam[0] - w) / 2 - bb[0], (tam[1] - h) / 2 - bb[1] + dy), txt, font=fonte, fill=cor)


# ======================================================================================================================
# Acessórios
# ======================================================================================================================
def para_brisa(yb, zb, yt, zt, wb, wt, moldura="preto", esp=0.03, r_moldura=0.03):
    """Para-brisa solto (conversível, bugue): vidro trapezoidal com moldura em tubo."""
    bm = bmesh.new()
    p = [V((-wb, yb, zb)), V((wb, yb, zb)), V((wt, yt, zt)), V((-wt, yt, zt))]
    f = bm.faces.new([bm.verts.new(q) for q in p])
    bm_pinta(bm, [f], mat="janela_apagada")
    vidro = objeto("vidro", solidifica(bm, esp), liso=False)
    m = (p[0] + p[1]) / 2
    mold = mb.tubo([m, p[1], p[2], p[3], p[0], m + V((0.001, 0, 0))], r_moldura, cor=moldura, raio_curva=0.06, seg=8)
    return [vidro, mold]


def aerofolio(sup, y, z, larg, corda=0.34, esp=0.06, cor="preto", x_sup=0.42, cor_sup=None, incl=-6):
    asa = mb.superelipsoide(larg, corda, esp, z=-esp / 2, cor=cor, e=0.22, e_v=0.6, nu=12, nv=4, nome="asa")
    mb.transforma(asa, rot=("X", incl))
    mb.transforma(asa, loc=(0, y, z))
    ps = [asa]
    for s in (-1, 1):
        ps.append(mb.caixa(0.035, corda * 1.15, esp * 2.6, x=s * larg / 2, y=y, z=z - esp * 1.2, cor=cor, bisel=0.01,
                           seg=1))
        hit, _ = sup.raio((s * x_sup, y, z + 1), (0, 0, -1))
        zb = hit.z - 0.03 if hit else z - 0.3
        ps.append(mb.caixa(0.05, 0.13, z - zb, x=s * x_sup, y=y + 0.02, z=zb, cor=cor_sup or cor, bisel=0.015, seg=1))
    return mb.junta(ps, "aerofolio")


def espelho(x, y, z, s, cor):
    haste = mb.caixa(0.12, 0.05, 0.04, x=x + s * 0.05, y=y, z=z, cor=cor, bisel=0.012, seg=1)
    casco = mb.superelipsoide(0.11, 0.17, 0.12, x=x + s * 0.13, y=y + 0.03, z=z - 0.02, cor=cor, e=0.45, nu=8, nv=4)
    vid = lente(0.13, 0.08, esp=0.012, cor="azul_claro", raio=0.03)
    mb.transforma(vid, rot=("X", -90))
    mb.transforma(vid, loc=(x + s * 0.13, y + 0.12, z + 0.04))
    return mb.junta([haste, casco, vid], "espelho")


# ======================================================================================================================
# O carro
# ======================================================================================================================
def carro(it, c, pasta=""):
    """Monta um carro a partir da especificação c (ver cidade_carros.py) no ItemV it. Devolve um dicionário com o que
    os acabamentos de cada desenho usam (casca, cabine, superfície)."""
    cas = Casca(c)
    cor = c["cor"]
    interior = c.get("interior", "grafite")
    r, lr = c["r"], c.get("larg_roda", 0.3)
    bm = cas.bm()
    bm_pinta(bm, bm.faces, cor=cor, mat="atlas")
    cab = Cabine(c["cab"]) if c.get("cab") else None
    zb = cab.k["zb"] if cab else c.get("zb", 0.85)
    folga = c.get("folga_arco", 0.05)
    cortes = []
    if c.get("arcos", True):
        for ya in c["eixos"]:
            w_ = cas.W / 2 * cas._larg(ya)
            x_in = c.get("arco_dentro", w_ - lr - 0.12)
            for s in (-1, 1):
                cortes.append(mb.cilindro(r + folga, w_ + 0.4 - x_in, x=s * (x_in + w_ + 0.4) / 2, y=ya,
                                          z=r + c.get("arco_dz", 0.0), eixo="x", cor=c.get("cor_arco", "grafite_escuro"),
                                          seg=20, bisel=0))
    ban = c.get("banheira")
    if ban is None and cab:
        k = cab.k
        ban = dict(y0=k["yf0"] + 0.07, y1=k["yr0"] - 0.07, w=k["wc0"] - 0.07, r=max(0.05, k["rc"] - 0.04))
    if ban:
        ban.setdefault("z", c.get("z_piso", cas.base(0.0) + 0.14))
        ban.setdefault("r", 0.08)
        cortes.append(mb.extrudado(mb.ret_arredondado(2 * ban["w"], ban["y1"] - ban["y0"], ban["r"], seg=3), 3.0,
                                   y=(ban["y0"] + ban["y1"]) / 2, z=ban["z"], cor=c.get("cor_banheira", interior),
                                   bisel=0))
    for fn in c.get("cortes", ()):
        cortes.append(fn(cas))
    if cortes:
        bm = booleana(bm, cortes)
    # ---- linhas de corte (portas, tampa, faixas)
    portas = c.get("portas", [])
    zp = c.get("z_porta", cas.base(0.0) + 0.08)
    ys_corte = sorted({y for p in portas for y in (p["y0"], p["y1"])})
    wi_ = (ban["w"] if ban else cas.W / 2 - 0.1) - 0.08
    ylo = min((p["y0"] for p in portas), default=0) - 0.15
    yhi = max((p["y1"] for p in portas), default=0) + 0.15
    for y in ys_corte:
        corta(bm, (0, y, 0), (0, 1, 0), lambda q, n: abs(q.x) > wi_ and q.z > zp - 0.15)
    if portas:
        corta(bm, (0, 0, zp), (0, 0, 1), lambda q, n: abs(q.x) > wi_ and ylo < q.y < yhi)
    tampa = c.get("tampa")
    if tampa and tampa["tipo"] in ("porta_malas", "tampa"):
        fr = (lambda q, n: q.y > tampa["y0"] - 0.25 and q.z > tampa["z"] - 0.2)
        corta(bm, (0, tampa["y0"], 0), (0, 1, 0), fr)
        corta(bm, (0, 0, tampa["z"]), (0, 0, 1), fr)
        for s in (-1, 1):
            corta(bm, (s * tampa["w"], 0, 0), (1, 0, 0), fr)
    for x0, x1, _ in c.get("faixas", ()):
        for xx in (x0, x1):
            for s in (-1, 1):
                corta(bm, (s * xx, 0, 0), (1, 0, 0))
    for co, no in c.get("planos", ()):
        corta(bm, co, no)
    # ---- cabine
    bmc = None
    if cab:
        bmc = cab.bm(tampa_base=False)
        bm_pinta(bmc, bmc.faces, cor=c.get("cor_cabine", cor), mat="atlas")
        pils = list(c.get("pilares", ()))
        if c.get("pilar_b") is not None:
            pils.append(c["pilar_b"])
        fora = []
        lp = c.get("larg_pilar", 0.09)
        for pb in pils:
            fora.append((pb - lp / 2, pb + lp / 2))
            for y in (pb - lp / 2, pb + lp / 2):
                corta(bmc, (0, y, 0), (0, 1, 0))
        for x0, x1, _ in c.get("faixas", ()):
            for xx in (x0, x1):
                for s in (-1, 1):
                    corta(bmc, (s * xx, 0, 0), (1, 0, 0))
        bmc.normal_update()
        vid = [f for f in bmc.faces if cab.vidro(f, tras=c.get("vidro_tras", True), faixas_fora=fora)]
        envidraca(bmc, vid, moldura=c.get("moldura", "preto"))
        for y in ys_corte:  # as portas cortam a cabine depois dos vidros (o vidro de trás não ganha emenda)
            corta(bmc, (0, y, 0), (0, 1, 0), lambda q, n: abs(n.x) > 0.45)
        if c.get("cor_teto"):
            bm_pinta(bmc, [f for f in bmc.faces if f.material_index == 0 and centro(f).z > cab.k["zr"] - cab.k["rr"] * 0.9
                           and f.normal.z > 0.2], cor=c["cor_teto"])
        if c.get("cor_colunas"):
            bm_pinta(bmc, [f for f in bmc.faces if f.material_index == 0 and cab.zlo < centro(f).z < cab.zhi and
                           abs(f.normal.z) < 0.5], cor=c["cor_colunas"])
    # ---- faixas pintadas
    for x0, x1, cf in c.get("faixas", ()):
        zmin = c.get("faixa_zmin", 0.5)

        def na_faixa(f, interno=True):
            q, n = centro(f), f.normal
            if f.material_index != 0 or not (x0 < abs(q.x) < x1) or q.z < zmin:
                return False
            if not (n.z > 0.25 or abs(n.y) > 0.5):
                return False
            if interno and ban and ban["y0"] - 0.01 < q.y < ban["y1"] + 0.01 and q.z < zb + 0.02:
                return False
            return True
        bm_pinta(bm, [f for f in bm.faces if na_faixa(f)], cor=cf)
        if bmc:
            bm_pinta(bmc, [f for f in bmc.faces if na_faixa(f, False)], cor=cf)
    if c.get("pinta"):
        c["pinta"](bm, bmc, cas, cab)
    bm.normal_update()
    sup = Sup(bm)
    ctx = dict(cas=cas, cab=cab, sup=sup, zb=zb, ban=ban, c=c, pasta=pasta)
    # ---- luzes, grade, para-choques, placas
    for lz in c.get("luzes", ()):
        xs = [lz["x"]] if lz["x"] == 0 else [lz["x"], -lz["x"]]
        for x in xs:
            fr = lz["lado"] == "frente"
            o = (x, cas.yF - 1.5, lz["z"]) if fr else (x, cas.yR + 1.5, lz["z"])
            hit, n = sup.raio(o, (0, 1 if fr else -1, 0))
            if hit is None:
                print("aviso: luz sem superficie", it.id, lz, flush=True)
                continue
            mat = lz.get("mat", "luz" if fr else "luz_vermelha")
            esp = lz.get("esp", 0.05)
            giro = lz.get("giro", 0) * (1 if x >= 0 else -1) * (1 if fr else -1)
            if lz.get("aro"):
                aro = lente(lz["l"] + 0.05, lz["h"] + 0.05, esp * 0.8, cor=lz["aro"], forma=lz.get("forma", "ret"),
                            raio=lz.get("raio"))
                it.add(cola(aro, hit, n, sai=esp * 0.15, giro=giro))
            ob = lente(lz["l"], lz["h"], esp, cor=None, mat=mat, forma=lz.get("forma", "ret"), raio=lz.get("raio"))
            it.add(cola(ob, hit, n, sai=esp * 0.32 + (0.012 if lz.get("aro") else 0), giro=giro))
    g = c.get("grade")
    if g:
        hit, n = sup.raio((0, cas.yF - 1.5, g["z"]), (0, 1, 0))
        if hit is not None:
            if g.get("moldura"):
                it.add(cola(lente(g["l"] + 0.07, g["h"] + 0.07, 0.04, cor=g["moldura"], forma=g.get("forma", "ret"),
                                  raio=g.get("raio")), hit, n, sai=0.004))
            it.add(cola(lente(g["l"], g["h"], 0.04, cor=g.get("cor", "grafite_escuro"), forma=g.get("forma", "ret"),
                              raio=g.get("raio")), hit, n, sai=0.016 if g.get("moldura") else 0.008))
            nb = g.get("barras", 0)
            for k in range(nb):
                if g.get("vertical"):
                    bx = lente(0.025, g["h"] * 0.9, 0.03, cor=g.get("cor_barras", "cromo"), raio=0.008)
                    mb.transforma(bx, loc=(-g["l"] / 2 + g["l"] * (k + 0.5) / nb, 0, 0))
                else:
                    bx = lente(g["l"] * 0.92, 0.022, 0.03, cor=g.get("cor_barras", "cromo"), raio=0.008)
                    mb.transforma(bx, loc=(0, -g["h"] / 2 + g["h"] * (k + 0.5) / nb, 0))
                it.add(cola(bx, hit, n, sai=0.03))
    for pc in c.get("para_choques", ()):
        fr = pc["lado"] == "frente"
        y0 = cas.yF + cas.rF * 1.4 if fr else cas.yR - cas.rR * 1.4
        pts = []
        am = pc.get("amax", 72)
        nn = 11
        for k in range(nn):
            a = math.radians(-am + 2 * am * k / (nn - 1))
            d = V((math.sin(a), -math.cos(a) if fr else math.cos(a), 0))
            hit, n = sup.raio((0, y0, pc["z"]), d)
            if hit is not None:
                pts.append(hit + d * pc.get("sai", pc.get("r", 0.07) * 0.55))
        if len(pts) > 3:
            it.add(mb.tubo(pts, pc.get("r", 0.07), cor=pc.get("cor", "grafite"), raio_curva=0, seg=8,
                           nome="para_choque"))
    for lado, z, corp in c.get("placas", (("frente", 0.42, "branco"), ("tras", 0.5, "branco"))):
        fr = lado == "frente"
        hit, n = sup.raio((0, cas.yF - 1.5 if fr else cas.yR + 1.5, z), (0, 1 if fr else -1, 0))
        if hit is not None:
            it.add(cola(lente(0.34, 0.12, 0.02, cor=corp, raio=0.02), hit, n, sai=0.015))
    # ---- espelhos
    if cab and c.get("espelhos", True):
        ze = zb + 0.1
        ye = cab.frente(ze) + cab.k["rc"] + c.get("espelho_dy", 0.04)
        for s in (-1, 1):
            it.add(espelho(s * (cab.larg(ze) - 0.03), ye, ze, s, c.get("cor_espelho", cor)))
    # ---- acabamentos do desenho (ainda com a superfície inteira)
    for fn in c.get("extras", ()):
        fn(it, ctx)
    # ---- portas
    wi = ban["w"] if ban else cas.W / 2 - 0.1
    contagem = {}
    for p in portas:
        for s in p.get("lados", (-1, 1)):
            y0, y1 = p["y0"], p["y1"]
            pc_ = separa(bm, lambda f, s=s, y0=y0, y1=y1: (y0 < centro(f).y < y1 and centro(f).z > zp and
                                                            centro(f).x * s > wi - 0.03))
            objs = []
            if pc_.faces:
                if p.get("solida"):
                    pc_ = solidifica(pc_, 0.035)
                objs.append(objeto("porta_corpo", pc_))
            else:
                pc_.free()
            if bmc is not None:
                cc = separa(bmc, lambda f, s=s, y0=y0, y1=y1: (y0 < centro(f).y < y1 and centro(f).x * s > 0.05 and
                                                                abs(f.normal.x) > 0.5 and centro(f).z < cab.zhi + 0.008))
                if cc.faces:
                    objs.append(objeto("porta_cabine", solidifica(cc, 0.03)))
                else:
                    cc.free()
            # maçaneta
            zm = zb - c.get("macaneta_dz", 0.12)
            ym = y1 - 0.16
            hit, n = sup.raio((s * 3, ym, zm), (-s, 0, 0))
            if hit is not None and c.get("macanetas", True):
                mc = mb.superelipsoide(0.16, 0.05, 0.035, z=-0.0175, cor=c.get("cor_macaneta", "cromo"), e=0.4,
                                       nu=10, nv=6, nome="macaneta")
                objs.append(cola(mc, hit, n, sai=0.012))
            if p.get("extra"):
                objs += p["extra"](s, y0, y1, ctx)
            if not objs:
                continue
            lo, hi = mb.bbox(objs)
            xh = hi.x - 0.03 if s > 0 else lo.x + 0.03
            k_ = contagem.get(s, 0) + 1
            contagem[s] = k_
            lado_n = "dir" if s > 0 else "esq"
            if p.get("correr"):
                it.correr(objs, direcao=(s * 0.12, 1, 0), curso=p.get("curso", 0.75), nome=f"porta_correr_{lado_n}")
            else:
                ordem = ["dianteira", "traseira", "terceira"][k_ - 1]
                it.porta(objs, (xh, y0 + 0.02, zp), eixo="z", angulo=(-70 if s > 0 else 70),
                         nome=f"porta_{ordem}_{lado_n}")
    # ---- tampa traseira / porta-malas / caçamba
    if tampa:
        tp = tampa["tipo"]
        if tp == "porta_malas":
            pc_ = separa(bm, lambda f: centro(f).y > tampa["y0"] and centro(f).z > tampa["z"] and
                         abs(centro(f).x) < tampa["w"])
            objs = [objeto("tampa", solidifica(pc_, 0.035))]
            zh = cas.topo(tampa["y0"])
            it.porta(objs, (0, tampa["y0"], zh), eixo="x", angulo=70, nome="porta_malas")
        elif tp == "tampa":
            pc_ = separa(bm, lambda f: centro(f).y > tampa["y0"] and centro(f).z > tampa["z"] and
                         abs(centro(f).x) < tampa["w"])
            objs = []
            if pc_.faces:
                objs.append(objeto("tampa_corpo", pc_))
            if bmc is not None:
                cc = separa(bmc, lambda f: f.normal.y > 0.5 and centro(f).z > zb - 0.005 and
                            centro(f).z < cab.zhi + 0.008)
                if cc.faces:
                    objs.append(objeto("tampa_cabine", solidifica(cc, 0.03)))
            for fn in tampa.get("extra", ()):
                objs += fn(ctx)
            it.porta(objs, (0, tampa.get("y_dob", cab.tras(cab.zhi) if cab else cas.yR), tampa.get("z_dob", cab.zhi if cab else zb)),
                     eixo="x", angulo=tampa.get("angulo", 80), nome="tampa_traseira")
        elif tp == "cacamba":
            objs = tampa["painel"](ctx)
            it.porta(objs, (0, tampa["y_dob"], tampa["z_dob"]), eixo="x", angulo=-88, nome="tampa_cacamba")
        elif tp == "capota":
            pass
    # ---- capota que abre (cabine inteira)
    if bmc is not None and c.get("capota"):
        cp = c["capota"]
        it.porta([objeto("capota", bmc)], (0, cp["y"], cp["z"]), eixo="x", angulo=cp.get("angulo", 55), nome="capota")
        bmc = None
    if bmc is not None:
        it.add(objeto("cabine", bmc))
    it.add(objeto("carroceria", bm))
    # ---- interior
    if ban:
        zs = ban["z"] + c.get("banco_dz", 0.1)
        for b in c.get("bancos", ()):
            x, y, lb, slot = b[:4]
            enc = c.get("encosto_banco", 0.5) if lb < 0.7 else c.get("encosto_banco_tras", 0.4)  # banco de trás: baixo,
            it.add(banco(x, y, zs, larg=lb, cor=c.get("cor_banco", "grafite"), enc=enc,  # não fura o vidro de trás
                         cabeca=b[4] if len(b) > 4 else True))
            if slot:
                it.slot(slot, (x, y, zs + 0.14), (0.5, 0.5, 0.9))
        for slot, x, y in c.get("slots_extra", ()):
            it.slot(slot, (x, y, zs + 0.14), (0.5, 0.5, 0.9))
        if c.get("painel", True):
            yp = ban["y0"] + 0.05
            it.add(mb.caixa(2 * ban["w"] - 0.02, 0.32, 0.26, y=yp + 0.16, z=zb - 0.3, cor=c.get("cor_painel", "grafite_escuro"),
                            bisel=0.05, seg=2))
            bancos = c.get("bancos", ())
            if bancos and c.get("volante", True):
                x, y = bancos[0][0], bancos[0][1]
                it.add(volante(x, yp + 0.42, zb - 0.02))
    # ---- rodas
    for i, ya in enumerate(c["eixos"]):
        nome_e = ["dianteira", "traseira", "traseira2"][i] if len(c["eixos"]) < 3 else \
            ["dianteira", "meio", "traseira"][i]
        for s in (-1, 1):
            x = s * (c.get("x_roda") or (cas.w(ya) - lr / 2 - c.get("recuo_roda", 0.03)))
            poe_roda(it, r, lr, x, ya, f"roda_{nome_e}_{'dir' if s > 0 else 'esq'}", estilo=c.get("roda", "calota"),
                     cor_aro=c.get("cor_aro", "cromo"), cor_cubo=c.get("cor_cubo"), mat_aro=c.get("mat_aro", "atlas"),
                     cor_pneu=c.get("cor_pneu", "borracha"))
    # ---- colisão
    xw = max(cas.W / 2, (c.get("x_roda") or 0) + lr / 2)
    cx = [((0, (cas.yF + cas.yR) / 2, 0), (2 * xw, cas.yR - cas.yF, zb))]
    if cab:
        k = cab.k
        cx.append(((0, (k["yf0"] + k["yr0"]) / 2, zb), (2 * k["wc0"], k["yr0"] - k["yf0"], k["zr"] - zb)))
    it.colisao(c.get("colisao") or cx)
    sup.livra()
    return ctx
