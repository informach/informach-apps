"""Base própria da categoria props_lazer (por cima de moveis_base e cidade_base, sem alterá-las).

- ItemL: Item com filhos animados (extras glTF no nó: anima girar/balancar/piscar/deslizar...) e assentos (slots de
  0,5 × 0,5 × 0,9 m), inclusive assentos presos a um filho animado (balanço, gangorra, gira-gira, carrinho de moeda).
- Malha: bmesh em que cada face guarda a sua cor (nome da paleta) ou material ("m:agua", "m:luz"...).
- blob: formas orgânicas (estátuas, bichos, cavalo) feitas com metaballs, convertidas em malha e reduzidas.
- Peças pequenas leves: haste, bola, lâmpadas, placa com estampa, varredura de perfil, arbusto, flores.
"""
import math
import random

import bpy
import bmesh
from mathutils import Matrix, Vector, Quaternion
from mathutils.geometry import tessellate_polygon

import moveis_base as mb
import cidade_base as cb  # noqa: F401

V = Vector


# =====================================================================================================================
# Item com animações e assentos
# =====================================================================================================================
class ItemL(mb.Item):
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

    def assento(self, nome, x, y, z, pai=None, tam=(0.5, 0.5, 0.9)):
        if pai:
            self.slots_anim.append((f"slot_{nome}", (x, y, z), tam, pai))
        else:
            self.slot(nome, (x, y, z), tam)

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


# =====================================================================================================================
# Primitivas leves
# =====================================================================================================================
def cx(l, p, a, x=0.0, y=0.0, z=0.0, cor="branco", bisel=0.02, seg=1, mat="atlas"):
    """Caixa com bisel de 1 segmento (leve)."""
    return mb.caixa(l, p, a, x=x, y=y, z=z, cor=cor, bisel=bisel, seg=seg, mat=mat)


def cil(r, a, x=0.0, y=0.0, z=0.0, cor="branco", seg=12, r2=None, bisel=0.0, eixo="z", mat="atlas", tampas=True):
    return mb.cilindro(r, a, x=x, y=y, z=z, cor=cor, seg=seg, r2=r2, bisel=bisel, eixo=eixo, mat=mat, tampas=tampas)


def haste(p0, p1, r, cor="grafite", lados=8, mat="atlas", r2=None):
    """Cilindro reto (ou cone com r2) entre dois pontos 3D."""
    a, b = V(p0), V(p1)
    d = b - a
    L = d.length
    ob = mb.cilindro(r, L, z=0, cor=cor, seg=lados, bisel=0.0, mat=mat, r2=r2)
    q = V((0, 0, 1)).rotation_difference(d.normalized())
    ob.data.transform(Matrix.Translation(a) @ q.to_matrix().to_4x4())
    return ob


def bola(r, x=0.0, y=0.0, z=0.0, cor=None, mat="atlas", sub=1, esc=(1, 1, 1)):
    """Bolinha leve (icosfera, sub=1: 80 triângulos), sombreada lisa."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    bm.transform(Matrix.Translation((x, y, z)) @ Matrix.Diagonal((*esc, 1)))
    return mb._obj("bola", bm, cor, mat, liso=True, angulo=89)


def esf(r, x=0.0, y=0.0, z=0.0, cor="branco", seg=12, esc=(1, 1, 1), mat="atlas"):
    return mb.esfera(r, x=x, y=y, z=z, cor=cor, seg=seg, esc=esc, mat=mat)


def lampadas(pts3, r=0.06, mat="luz", sub=0):
    return [bola(r, p[0], p[1], p[2], cor=None, mat=mat, sub=sub) for p in pts3]


def gira_z(ob, graus, cx_=0.0, cy_=0.0):
    ob.data.transform(Matrix.Translation((cx_, cy_, 0)) @ Matrix.Rotation(math.radians(graus), 4, "Z") @
                      Matrix.Translation((-cx_, -cy_, 0)))
    return ob


def mover(ob, x=0.0, y=0.0, z=0.0, rot=0.0):
    if rot:
        gira_z(ob, rot)
    ob.data.transform(Matrix.Translation((x, y, z)))
    return ob


def girar(ob, eixo, graus, centro=(0, 0, 0)):
    c = V(centro)
    ob.data.transform(Matrix.Translation(c) @ Matrix.Rotation(math.radians(graus), 4, eixo) @ Matrix.Translation(-c))
    return ob


def arco_pts(cx_, cy_, r, a0, a1, n=None):
    n = n or max(4, int(abs(a1 - a0) / 6))
    return [(cx_ + r * math.cos(math.radians(a0 + (a1 - a0) * k / n)),
             cy_ + r * math.sin(math.radians(a0 + (a1 - a0) * k / n))) for k in range(n + 1)]


def area2(pts):
    return sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(pts, pts[1:] + pts[:1])) / 2


def ccw(pts):
    return list(pts) if area2(list(pts)) > 0 else list(pts)[::-1]


def reamostra(pts, passo=0.25, fechado=False):
    pts = [V((p[0], p[1], p[2] if len(p) > 2 else 0.0)) for p in pts]
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
    return [tuple(p) for p in out]


def uniformes(pts, n, fechado=False):
    """n pontos igualmente espaçados (pelo comprimento) ao longo da polilinha 3D."""
    P = [V(p if len(p) == 3 else (p[0], p[1], 0)) for p in pts] + ([V(pts[0])] if fechado else [])
    L = [0.0]
    for a, b in zip(P, P[1:]):
        L.append(L[-1] + (b - a).length)
    tot = L[-1]
    out = []
    m = n if fechado else n - 1
    for k in range(n):
        s = tot * k / max(1, m)
        i = 1
        while i < len(L) - 1 and L[i] < s:
            i += 1
        f = (s - L[i - 1]) / max(1e-9, L[i] - L[i - 1])
        out.append(tuple(P[i - 1].lerp(P[i], f)))
    return out


# =====================================================================================================================
# Malha com cor por face
# =====================================================================================================================
def _cod(cor):
    if cor.startswith("m:"):
        return -1 - mb.MAT_NOMES.index(cor[2:])
    return mb.NOMES.index(cor)


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

    def obj(self, nome="malha", liso=False, angulo=35, normais=False):
        mb.materiais()
        bm = self.bm
        bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
        if normais:
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
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


def prisma(aneis, z0, z1, topo, lado=None, fundo=False, nome="prisma"):
    """Prisma de z0 a z1 com contorno externo e furos (aneis[0] externo)."""
    lado = lado or topo
    m = Malha()
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
        if fundo:
            m.f((vb[a], vb[c], vb[b]), lado)
    k = 0
    for anel in todos:
        n = len(anel)
        for i in range(n):
            a, b = k + i, k + (i + 1) % n
            m.f((vb[a], vb[b], vt[b], vt[a]), lado)
        k += n
    return m.obj(nome, liso=True, angulo=40)


def decal(pts, z, cor, nome="decal"):
    """Polígono plano em z (côncavo também), normal para cima."""
    m = Malha()
    vs = [m.v((p[0], p[1], z)) for p in pts]
    for a, b, c in tessellate_polygon([[V((p[0], p[1], 0)) for p in pts]]):
        A, B, C = V(pts[a]), V(pts[b]), V(pts[c])
        if (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]) < 0:
            b, c = c, b
        m.f((vs[a], vs[b], vs[c]), cor)
    return m.obj(nome)


def varre(cam, perfil, cores, fechado=False, nome="varrido", liso=True, angulo=40, tampas=True, normal_z=True):
    """Varre um perfil 2D (deslocamento lateral, dz) ao longo de um caminho 3D. Com normal_z, o perfil fica em pé
    (dz sempre vertical); sem, o perfil gira com o caminho (dz no plano normal, para arcos verticais)."""
    pts = [V((p[0], p[1], p[2] if len(p) > 2 else 0.0)) for p in cam]
    n = len(pts)
    m = Malha()
    aneis = []
    for i in range(n):
        if fechado:
            t = pts[(i + 1) % n] - pts[i - 1]
        else:
            t = pts[min(n - 1, i + 1)] - pts[max(0, i - 1)]
        if normal_z:
            t.z = 0
            t.normalize()
            r = V((t.y, -t.x, 0))
            up = V((0, 0, 1))
        else:
            t.normalize()
            ref = V((0, 1, 0)) if abs(t.y) < 0.9 else V((1, 0, 0))
            r = t.cross(ref).normalized()
            up = r.cross(t).normalized()
        aneis.append([m.v(pts[i] + r * o + up * dz) for o, dz in perfil])
    k = len(perfil)
    cs = cores if isinstance(cores, (list, tuple)) else [cores] * k
    for i in range(n if fechado else n - 1):
        A, B = aneis[i], aneis[(i + 1) % n]
        for j in range(k):
            j2 = (j + 1) % k
            m.f((A[j], B[j], B[j2], A[j2]), cs[j % len(cs)])
    if tampas and not fechado:
        m.f(aneis[0][::-1], cs[0])
        m.f(aneis[-1], cs[0])
    return m.obj(nome, liso=liso, angulo=angulo, normais=True)


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
    if f.normal.dot(n) < 0:
        f.normal_flip()
    uvl = bm.loops.layers.uv.new("UVMap")
    for lo in f.loops:
        p = lo.vert.co - c
        lo[uvl].uv = (0.5 + p.dot(u) / w, 0.5 + p.dot(up) / h)
    mb.materiais()
    f.material_index = mat_idx
    me = bpy.data.meshes.new(nome)
    bm.to_mesh(me)
    bm.free()
    for nm in mb.MAT_NOMES:
        me.materials.append(bpy.data.materials[nm])
    ob = bpy.data.objects.new(nome, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def placa_curva(mat_idx, R, a0, a1, z0, z1, n=16, nome="letreiro_curvo"):
    """Faixa cilíndrica (raio R, ângulos a0→a1 em graus, olhando para fora) com a estampa esticada de a0 a a1.
    Quem olha de fora vê o começo (u = 0) à esquerda: na frente −Y, passe a0 < a1 (ex.: 240 → 300)."""
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    col = []
    for k in range(n + 1):
        t = k / n
        a = math.radians(a0 + (a1 - a0) * t)
        col.append((bm.verts.new((R * math.cos(a), R * math.sin(a), z0)),
                    bm.verts.new((R * math.cos(a), R * math.sin(a), z1)), t))
    for (b0, t0, u0), (b1, t1, u1) in zip(col, col[1:]):
        f = bm.faces.new((b0, b1, t1, t0))
        f.normal_update()
        cen = (b0.co + b1.co) / 2
        if f.normal.dot(V((cen.x, cen.y, 0))) < 0:
            f.normal_flip()
        for lo in f.loops:
            v = lo.vert
            u = u0 if v in (b0, t0) else u1
            lo[uvl].uv = (u, 0.0 if v in (b0, b1) else 1.0)
        f.material_index = mat_idx
    mb.materiais()
    me = bpy.data.meshes.new(nome)
    bm.to_mesh(me)
    bm.free()
    for nm in mb.MAT_NOMES:
        me.materials.append(bpy.data.materials[nm])
    me.shade_smooth()
    ob = bpy.data.objects.new(nome, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


# =====================================================================================================================
# Formas orgânicas (metaballs)
# =====================================================================================================================
K_META = 0.575  # raio visível de uma bola isolada = 0,575 × raio do elemento (rigidez 2, limiar 0,6)


class Blob:
    """Escultura de metaballs. Medidas em raio VISÍVEL (r), já corrigidas. Junta tudo numa malha lisa e reduz para
    'tris' triângulos no fim."""

    def __init__(self):
        self.els = []

    def bola(self, c, r, rigidez=2.0):
        self.els.append(("BALL", V(c), r, (0, 0, 0), None, rigidez))
        return self

    def elipse(self, c, r, esc=(1, 1, 1), rot=None, rigidez=2.0):
        """Elipsoide: raio base r e meias medidas relativas esc (x, y, z) no espaço local; rot = Quaternion."""
        self.els.append(("ELLIPSOID", V(c), r, esc, rot, rigidez))
        return self

    def osso(self, a, b, r, rigidez=2.0):
        """Cápsula de a até b (centros das pontas), raio visível r."""
        a, b = V(a), V(b)
        d = b - a
        if d.length < 1e-4:
            return self.bola(a, r, rigidez)
        q = V((1, 0, 0)).rotation_difference(d.normalized())
        self.els.append(("CAPSULE", (a + b) / 2, r, (d.length / 2, 0, 0), q, rigidez))
        return self

    def cadeia(self, pts, rs, rigidez=2.0):
        """Ossos encadeados por pontos, com raio variando (rs: um por ponto). Cada trecho vira várias cápsulas curtas
        para o raio ir afinando aos poucos."""
        for (a, ra), (b, rb) in zip(zip(pts, rs), zip(pts[1:], rs[1:])):
            a, b = V(a), V(b)
            n = max(1, int((b - a).length / (min(ra, rb) * 1.2)))
            for k in range(n):
                t0, t1 = k / n, (k + 1) / n
                self.osso(a.lerp(b, t0), a.lerp(b, t1), ra + (rb - ra) * (t0 + t1) / 2, rigidez)
        return self

    def malha(self, cor="branco", res=None, tris=2400, nome="blob", mat="atlas", angulo=70):
        mbd = bpy.data.metaballs.new(nome)
        rmin = min(e[2] for e in self.els)
        res = res or max(0.012, rmin / 2.4)
        mbd.resolution = res
        mbd.render_resolution = res
        mbd.threshold = 0.6
        for tipo, c, r, esc, rot, rig in self.els:
            e = mbd.elements.new()
            e.type = tipo
            e.co = c
            e.radius = r / K_META
            e.stiffness = rig
            if tipo == "CAPSULE":
                e.size_x = esc[0]
            elif tipo == "ELLIPSOID":
                e.size_x, e.size_y, e.size_z = esc
            if rot is not None:
                e.rotation = rot
        ob = bpy.data.objects.new(nome + "_mb", mbd)
        bpy.context.scene.collection.objects.link(ob)
        dg = bpy.context.evaluated_depsgraph_get()
        me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
        bpy.data.objects.remove(ob)
        bpy.data.metaballs.remove(mbd)
        tmp = bpy.data.objects.new(nome + "_tmp", me)
        bpy.context.scene.collection.objects.link(tmp)
        n = sum(len(p.vertices) - 2 for p in me.polygons)
        if n > tris:
            md = tmp.modifiers.new("dec", "DECIMATE")
            md.ratio = tris / n
            md.use_collapse_triangulate = True
            dg = bpy.context.evaluated_depsgraph_get()
            me2 = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
        else:
            me2 = me.copy()
        bpy.data.objects.remove(tmp)
        bpy.data.meshes.remove(me)
        bm = bmesh.new()
        bm.from_mesh(me2)
        bpy.data.meshes.remove(me2)
        return mb._obj(nome, bm, cor, mat, liso=True, angulo=angulo)


def quat_x_para(d):
    return V((1, 0, 0)).rotation_difference(V(d).normalized())


# =====================================================================================================================
# Vegetação e enfeites pequenos
# =====================================================================================================================
def arbusto(x, y, r=0.5, cor="folha", z=0.0, alt=None, seg=10):
    a = alt or 1.6 * r
    return mb.superelipsoide(2 * r, 2 * r, a, x=x, y=y, z=z - 0.04, cor=cor, e=0.85, e_v=0.8, nu=seg, nv=seg // 2,
                             nome="arbusto")


def flores(x, y, cores=("amarelo", "branco"), z=0.0, n=4, alt=0.2):
    objs = []
    pos = ((0, 0), (0.18, 0.1), (-0.12, 0.16), (0.05, -0.17), (-0.18, -0.08), (0.15, -0.12))[:n]
    for j, (dx, dy) in enumerate(pos):
        objs.append(cil(0.016, alt, x=x + dx, y=y + dy, z=z - 0.02, cor="folha_escura", seg=3, tampas=False))
        objs.append(cil(0.085, 0.045, x=x + dx, y=y + dy, z=z + alt - 0.01, cor=cores[j % len(cores)], seg=6))
        objs.append(cil(0.035, 0.02, x=x + dx, y=y + dy, z=z + alt + 0.03, cor="amarelo_escuro", seg=4))
    return mb.junta(objs, "flores")


def arvore(x, y, z=0.0, esc=1.0, cores=("folha", "folha_escura", "folha_clara"), tronco="madeira", seed=0):
    """Árvore fofa: tronco afinando e copa de bolas sobrepostas."""
    rnd = random.Random(seed)
    ps = [cil(0.17 * esc, 2.0 * esc, x=x, y=y, z=z, cor=tronco, seg=8, r2=0.11 * esc)]
    bolas = [(0, 0, 2.9, 1.25), (0.7, 0.25, 2.55, 0.85), (-0.6, -0.3, 2.6, 0.85), (0.15, -0.55, 3.45, 0.75),
             (-0.2, 0.5, 3.4, 0.8)]
    for k, (dx, dy, dz, r) in enumerate(bolas):
        j = 1 + rnd.uniform(-0.08, 0.08)
        ps.append(mb.superelipsoide(2 * r * esc * j, 2 * r * esc * j, 1.75 * r * esc * j, x=x + dx * esc,
                                    y=y + dy * esc, z=z + (dz - r * 0.85) * esc, cor=cores[k % len(cores)],
                                    e=0.92, e_v=0.85, nu=10, nv=6))
    return mb.junta(ps, "arvore")


def estrela_pts(r, r_in=0.45, pontas=5, rot=90):
    pts = []
    for k in range(pontas * 2):
        rr = r if k % 2 == 0 else r * r_in
        a = math.radians(rot + 180 * k / pontas)
        pts.append((rr * math.cos(a), rr * math.sin(a)))
    return ccw(pts)


def coracao_pts(r, n=28):
    pts = []
    for k in range(n):
        t = 2 * math.pi * k / n
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((x * r / 17, y * r / 17))
    return ccw(pts)


def toldo(x0, x1, y0, y1, z0, z1, n, cor1, cor2, bicos=True, nome="toldo"):
    """Toldo listrado inclinado (alto em y1, baixo em y0) com franja de bicos na frente."""
    m = Malha()
    w = (x1 - x0) / n
    for k in range(n):
        a, b = x0 + k * w, x0 + (k + 1) * w
        cor = cor1 if k % 2 == 0 else cor2
        vs = [m.v((a, y0, z0)), m.v((b, y0, z0)), m.v((b, y1, z1)), m.v((a, y1, z1))]
        m.f(vs, cor)
        vs2 = [m.v((a, y0, z0 - 0.004)), m.v((b, y0, z0 - 0.004)), m.v((b, y1, z1 - 0.004)), m.v((a, y1, z1 - 0.004))]
        m.f(vs2[::-1], cor)
        if bicos:
            t = [m.v((a, y0, z0)), m.v((b, y0, z0)), m.v(((a + b) / 2, y0 - 0.005, z0 - w * 0.55))]
            m.f(t, cor)
            t2 = [m.v((a, y0 + 0.004, z0)), m.v((b, y0 + 0.004, z0)), m.v(((a + b) / 2, y0 + 0.001, z0 - w * 0.55))]
            m.f(t2[::-1], cor)
    ob = m.obj(nome)
    return mb.junta([ob, mb.tubo([(x0, y0, z0), (x1, y0, z0)], 0.025, cor="branco", seg=6)], nome)


def roda(x, y, z, r, larg, cor="borracha", cubo="metal_claro", eixo="x", raios=0):
    """Roda de carrinho: pneu (cilindro deitado) e cubo."""
    ps = [cil(r, larg, x=x, y=y, z=z, cor=cor, seg=16, bisel=larg * 0.3, eixo=eixo),
          cil(r * 0.55, larg + 0.02, x=x, y=y, z=z, cor=cubo, seg=12, bisel=0.01, eixo=eixo)]
    return mb.junta(ps, "roda")


def pedestal(forma="redondo", l=1.6, h=1.2, cor="cinza_claro", cor2="cinza", placa="ouro_escuro"):
    """Pedestal de estátua com rodapé, corpo, cornija e placa de bronze na frente. Topo em z = h."""
    ps = []
    if forma == "redondo":
        r = l / 2
        ps.append(mb.torno([(0, 0), (r + 0.18, 0), (r + 0.18, 0.18), (r + 0.06, 0.24), (r, 0.3), (r, h - 0.22),
                            (r + 0.08, h - 0.16), (r + 0.12, h - 0.08), (r + 0.1, h), (0, h)], cor=cor, seg=24,
                           angulo=35))
        ps.append(mb.torno([(r + 0.005, 0.42), (r + 0.03, 0.44), (r + 0.03, 0.52), (r + 0.005, 0.54)], cor=cor2,
                           seg=24))
        pl = cx(l * 0.42, 0.04, h * 0.28, y=-r - 0.005, z=h * 0.45, cor=placa, bisel=0.012)
        ps.append(pl)
    elif forma == "oval":
        r = l / 2
        ps.append(mb.torno([(0, 0), (r + 0.16, 0), (r + 0.16, 0.16), (r + 0.04, 0.24), (r, h - 0.16),
                            (r + 0.1, h - 0.1), (r + 0.08, h), (0, h)], cor=cor, seg=24, angulo=35, esc=(1.0, 0.62)))
        ps.append(cx(l * 0.36, 0.04, h * 0.3, y=-r * 0.62 - 0.03, z=h * 0.4, cor=placa, bisel=0.012))
    else:  # retangular (l × l*0.62)
        p = l * 0.62
        ps.append(cx(l + 0.4, p + 0.4, 0.22, z=0, cor=cor2, bisel=0.04))
        ps.append(cx(l + 0.2, p + 0.2, 0.16, z=0.2, cor=cor, bisel=0.04))
        ps.append(cx(l, p, h - 0.55, z=0.34, cor=cor, bisel=0.05))
        ps.append(cx(l + 0.16, p + 0.16, 0.12, z=h - 0.24, cor=cor2, bisel=0.03))
        ps.append(cx(l + 0.24, p + 0.24, 0.12, z=h - 0.12, cor=cor, bisel=0.03))
        ps.append(cx(l * 0.5, 0.04, (h - 0.55) * 0.5, y=-p / 2 - 0.015, z=0.34 + (h - 0.55) * 0.25, cor=placa,
                     bisel=0.012))
    return mb.junta(ps, "pedestal")


def jato(x, y, z, h, r=0.06, espuma=0.1):
    """Jato d'água vertical: coluna de água, coroa de espuma clara no alto e gotas caindo em volta (lê como borrifo
    de longe)."""
    e = espuma
    ps = [cil(r, h, x=x, y=y, z=z, r2=r * 0.6, cor=None, mat="agua", seg=8)]
    for k, (dx, dy, dz, rr, cor) in enumerate(((0, 0, 0.1, 1.15, "branco"), (0.7, 0.2, -0.1, 0.8, "azul_bebe"),
                                                (-0.55, 0.55, -0.15, 0.75, "branco"), (-0.2, -0.7, -0.2, 0.7,
                                                                                        "azul_bebe"),
                                                (0.3, -0.3, 0.35, 0.6, "branco_gelo"))):
        ps.append(bola(e * rr, x + dx * e, y + dy * e, z + h + dz * e * 2, cor=cor, sub=1 if k == 0 else 0))
    for k in range(6):  # gotas descendo em arco
        a = 2 * math.pi * k / 6 + 0.3
        for j, (rr, dz, tam) in enumerate(((1.7, -0.9, 0.38), (2.5, -2.6, 0.3))):
            ps.append(bola(e * tam, x + e * rr * math.cos(a + 0.2 * j), y + e * rr * math.sin(a + 0.2 * j),
                           z + h + dz * e, cor="azul_bebe" if (k + j) % 2 else "branco", sub=0))
    return ps
