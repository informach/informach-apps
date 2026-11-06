"""Rosto e cabelo com acabamento: pintura projetada no UV, cascas com alfa e mechas planas (hair cards).

- Projetor: ponto 3D na superfície → UV, para desenhar traços (fios) na textura da pele.
- Cascas: cópias de regiões da pele (mesmo UV) afastadas pela normal, com textura RGBA de fios:
  a borda some no alfa, então o recorte da malha não aparece.
- Cards: faixas curvas com textura de fios para volume (topete, franja).
"""
import math
import random

import bpy
import bmesh  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Vector, geometry  # noqa: E402
from mathutils.bvhtree import BVHTree  # noqa: E402
from PIL import Image, ImageDraw, ImageFilter  # noqa: E402


class Projetor:
    def __init__(self, ob, n):
        me = ob.data
        me.calc_loop_triangles()
        self.mw = ob.matrix_world.copy()
        self.vs = [self.mw @ v.co for v in me.vertices]
        self.tris = [tuple(lt.vertices) for lt in me.loop_triangles]
        uv = me.uv_layers.active.data
        self.tuv = [tuple(Vector((uv[l].uv[0], uv[l].uv[1], 0))) for lt in me.loop_triangles for l in lt.loops]
        self.tuv = [self.tuv[i * 3:i * 3 + 3] for i in range(len(self.tris))]
        self.tpoly = [lt.polygon_index for lt in me.loop_triangles]
        self.bvh = BVHTree.FromPolygons(self.vs, self.tris)
        self.n = n

    def _uv(self, loc, i):
        a, b, c = (self.vs[k] for k in self.tris[i])
        u0, u1, u2 = (Vector(x) for x in self.tuv[i])
        r = geometry.barycentric_transform(loc, a, b, c, u0, u1, u2)
        return (r.x * self.n, (1 - r.y) * self.n)

    def perto(self, p):
        loc, nor, i, d = self.bvh.find_nearest(p)
        return (loc, nor, i, self._uv(loc, i)) if loc is not None else None

    def raio(self, origem, direcao):
        loc, nor, i, d = self.bvh.ray_cast(origem, direcao)
        return (loc, nor, i, self._uv(loc, i)) if loc is not None else None


def suave(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


# ------------------------------------------------------------------ texturas de fios
def textura_card(n_w=256, n_h=1024, cor=(42, 27, 17), brilho=(92, 64, 44), fios=420, semente=1):
    rnd = random.Random(semente)
    img = Image.new("RGBA", (n_w, n_h), cor + (0,))
    d = ImageDraw.Draw(img)
    for _ in range(fios):
        x = rnd.uniform(0.04, 0.96) * n_w
        comp = rnd.uniform(0.55, 1.0) * n_h
        larg = rnd.choice((1, 1, 2, 2, 3))
        c = brilho if rnd.random() < 0.18 else tuple(int(k * rnd.uniform(0.75, 1.15)) for k in cor)
        pts = []
        for k in range(12):
            t = k / 11
            pts.append((x + math.sin(t * 3 + x) * 3 + (rnd.random() - 0.5) * 2, t * comp))
        a = rnd.randint(150, 255)
        d.line(pts, fill=c + (a,), width=larg)
    arr = np.array(img).astype(np.float32)
    v = np.linspace(0, 1, n_h)[:, None]
    u = np.linspace(0, 1, n_w)[None, :]
    queda = np.clip((1 - v) / 0.35, 0, 1) ** 0.8 * np.clip(np.minimum(u, 1 - u) / 0.12, 0, 1)
    arr[..., 3] *= queda
    return Image.fromarray(arr.astype(np.uint8))


def desenhar_fios(draw, proj, pontos_3d, cor, largura, alfa):
    uvs = []
    for p in pontos_3d:
        r = proj.perto(p)
        if r is None:
            return
        uvs.append(r[3])
    for (a, b) in zip(uvs, uvs[1:]):
        if math.dist(a, b) > proj.n * 0.05:  # atravessou uma costura do UV
            return
    draw.line(uvs, fill=cor + (alfa,), width=largura)


def amostrar_regiao(proj, mascara, n, semente=5, limite=None):
    """Pontos aleatórios na superfície ponderados por área e pela máscara (0..1)."""
    rnd = random.Random(semente)
    cand = []
    for i, (a, b, c) in enumerate(proj.tris):
        pa, pb, pc = proj.vs[a], proj.vs[b], proj.vs[c]
        cen = (pa + pb + pc) / 3
        if limite and not limite(cen):
            continue
        m = mascara(cen)
        if m > 0.01:
            area = ((pb - pa).cross(pc - pa)).length / 2
            cand.append((i, area * m))
    tot = sum(w for _, w in cand)
    acum, s = [], 0
    for i, w in cand:
        s += w
        acum.append(s)
    out = []
    import bisect
    for _ in range(n):
        k = bisect.bisect_left(acum, rnd.random() * tot)
        i = cand[min(k, len(cand) - 1)][0]
        a, b, c = (proj.vs[j] for j in proj.tris[i])
        r1, r2 = rnd.random(), rnd.random()
        if r1 + r2 > 1:
            r1, r2 = 1 - r1, 1 - r2
        out.append(a + (b - a) * r1 + (c - a) * r2)
    return out


def tangente(proj, p, direcao, passo):
    """Anda sobre a superfície na direção dada (projetada no plano tangente)."""
    r = proj.perto(p)
    if r is None:
        return p
    n = r[1].normalized()
    d = direcao - n * direcao.dot(n)
    if d.length < 1e-6:
        return p
    q = proj.perto(p + d.normalized() * passo)
    return q[0] if q else p


def fio(proj, p, campo, comp, passos=5):
    pts = [p]
    q = p
    for _ in range(passos):
        q = tangente(proj, q, campo(q), comp / passos)
        pts.append(q)
    return pts


# ------------------------------------------------------------------ cascas com alfa
def casca_alfa(origem, mascara, nome, material, afastar, limite=None, arm=None, P="mixamorig:"):
    o = origem.copy()
    o.data = origem.data.copy()
    o.name = nome
    bpy.context.scene.collection.objects.link(o)
    o.modifiers.clear()
    bm = bmesh.new()
    bm.from_mesh(o.data)
    fora = [f for f in bm.faces
            if f.material_index != 0 or (limite and not limite(o.matrix_world @ f.calc_center_median()))
            or max(mascara(o.matrix_world @ v.co) for v in f.verts) < 0.02]
    bmesh.ops.delete(bm, geom=fora, context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * afastar
    bm.to_mesh(o.data)
    bm.free()
    o.data.materials.clear()
    o.data.materials.append(material)
    for p in o.data.polygons:
        p.use_smooth = True
    if arm:
        o.modifiers.new("Esqueleto", "ARMATURE").object = arm
    return o


def material_alfa(nome, img, rough=0.45, cor_mult=None):
    m = bpy.data.materials.new(nome)
    if hasattr(m, "use_nodes"):
        m.use_nodes = True
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Roughness"].default_value = rough
    if "Specular IOR Level" in b.inputs:
        b.inputs["Specular IOR Level"].default_value = 0.35
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = img
    nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
    nt.links.new(t.outputs["Alpha"], b.inputs["Alpha"])
    if hasattr(m, "blend_method"):
        m.blend_method = "HASHED"
    if hasattr(m, "surface_render_method"):
        m.surface_render_method = "DITHERED"
    m.use_backface_culling = False
    return m


def card(nome, pontos, normais, larguras, material, arm, P="mixamorig:", osso="Head"):
    """Faixa ao longo dos pontos, larga no plano perpendicular à normal (fica deitada sobre a cabeça)."""
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new()
    fila = []
    n = len(pontos)
    for i, p in enumerate(pontos):
        d = (pontos[min(i + 1, n - 1)] - pontos[max(i - 1, 0)]).normalized()
        lado = d.cross(normais[i]).normalized()
        w = larguras[i]
        fila.append((bm.verts.new(p - lado * w), bm.verts.new(p + lado * w)))
    for i in range(n - 1):
        a0, a1 = fila[i]
        b0, b1 = fila[i + 1]
        f = bm.faces.new((a0, a1, b1, b0))
        for loop, (u, v) in zip(f.loops, ((0, i / (n - 1)), (1, i / (n - 1)), (1, (i + 1) / (n - 1)), (0, (i + 1) / (n - 1)))):
            loop[uvl].uv = (u, 1 - v)
    me = bpy.data.meshes.new(nome)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(nome, me)
    bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(material)
    for p in o.data.polygons:
        p.use_smooth = True
    o.vertex_groups.new(name=P + osso).add(list(range(len(me.vertices))), 1.0, "REPLACE")
    o.modifiers.new("Esqueleto", "ARMATURE").object = arm
    return o


# ------------------------------------------------------------------ olho cartoon realista
def olho_estilizado(caminho_origem, caminho_saida, ampliar=1.32, n=1024):
    img = np.array(Image.open(caminho_origem).convert("RGBA")).astype(np.float32)
    out = img.copy()
    # centros dos dois olhos na textura do MakeHuman (layout fixo, medido na própria imagem)
    centros = []
    for cx0, cy0 in ((0.70, 0.29), (0.29, 0.70)):
        x0, y0 = int(cx0 * n), int(cy0 * n)
        janela = img[y0 - 80:y0 + 80, x0 - 80:x0 + 80, :3].sum(axis=2)
        yy, xx = np.unravel_index(np.argmin(janela), janela.shape)
        centros.append((x0 - 80 + xx, y0 - 80 + yy))
    yy, xx = np.mgrid[0:n, 0:n]
    for cx, cy in centros:
        dx, dy = xx - cx, yy - cy
        r = np.sqrt(dx * dx + dy * dy)
        r_iris = 125.0
        r_fim = 210.0
        # dentro: lê de mais perto do centro (íris maior); transição suave até r_fim
        k = np.where(r < r_iris * ampliar, 1 / ampliar,
                     1 / ampliar + (1 - 1 / ampliar) * np.clip((r - r_iris * ampliar) / (r_fim - r_iris * ampliar), 0, 1))
        sx = np.clip(cx + dx * k, 0, n - 1).astype(int)
        sy = np.clip(cy + dy * k, 0, n - 1).astype(int)
        m = r < r_fim
        out[m] = img[sy[m], sx[m]]
        # aro escuro da íris e brilho
        aro = (r > r_iris * ampliar * 0.93) & (r < r_iris * ampliar * 1.03)
        out[aro, :3] *= 0.55
        for bx, by, br in ((-0.35, -0.38, 0.2), (0.3, 0.3, 0.08)):
            hx, hy = cx + bx * r_iris * ampliar, cy + by * r_iris * ampliar
            hr = br * r_iris * ampliar
            hm = (xx - hx) ** 2 + (yy - hy) ** 2 < hr * hr
            out[hm, :3] = 250
    Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(caminho_saida)
    return caminho_saida
