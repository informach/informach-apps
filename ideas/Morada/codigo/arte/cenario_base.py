"""Base própria da categoria "cenario" (terreno de ilha, costa, mar, montanhas, marcos e prédios-marco).

Usa moveis_base, cidade_base e reaproveita funções de cidade_agua_estruturas (Malha, poste, banco, árvore, pedra,
guarda-corpo, prisma) e de cidade_ruas (calc, poli, tufo), sem alterá-los.

Cotas (combinadas com pisos, ruas e agua):
- calçada, grama e areia seca em z = 0 (laje até −0,40);
- mar: lâmina d'água em z = −1,0, fundo agua_funda em −1,7 e base em −1,9 (os mesmos de agua/agua_aberta e orla);
- platô: topo em z = +3,75 (Z_PLATO); rampa de rua de 15 m (25 %, a mesma inclinação das rampas de viaduto).
"""
import math
import os
import random

import bpy
import bmesh
from mathutils import Matrix, Vector

import moveis_base as mb
import cidade_base as cb
import cidade_agua_estruturas as ae
import cidade_ruas as cr

V = Vector
Q, H = cb.Q, cb.H
Z_AGUA, Z_FUNDO_MAR, Z_BASE_MAR = ae.Z_AGUA_CANAL, ae.Z_FUNDO_CANAL, ae.Z_BASE_CANAL  # −1,0 / −1,7 / −1,9
Z_PLATO = 3.75
DIR_ALTO = (0.55, -1.0, 0.55)
DIR_MEIO = (0.55, -1.0, 0.85)
PASTA_EST = ""
_EST = {}


# ---------------------------------------------------------------------------------------------------- item animado
class ItemC(mb.Item):
    """Item com filhos animados (extras glTF) — a lista vai também no catálogo em extra["animacoes"]."""

    def __init__(self, id_):
        super().__init__(id_)
        self.anims = []

    def anima(self, objs, pivo, dados, nome):
        ob = mb.junta(objs if isinstance(objs, (list, tuple)) else [objs], nome)
        d = V(pivo)
        ob.data.transform(Matrix.Translation(-d))
        ob.location = d
        self.anims.append((ob, dict(dados)))
        return ob

    def monta(self):
        corpo = super().monta()
        for ob, d in self.anims:
            ob.parent = corpo
            for k, v in d.items():
                ob[k] = v
        bpy.context.view_layer.update()
        return corpo

    def lista_anim(self):
        return [dict(nome=ob.name, pivo=mb._gl(ob.location), **d) for ob, d in self.anims]


def gl_pts(pts):
    """Pontos do Blender → eixos do glTF (para o percurso)."""
    return [[round(p[0], 3), round(p[2], 3), round(-p[1], 3)] for p in pts]


# ---------------------------------------------------------------------------------------------------- estampas
def est(nome, emissao=0.0):
    chave = (nome, emissao)
    if chave not in _EST:
        _EST[chave] = mb.material_estampa(f"cenario_{nome}" + ("_luz" if emissao else ""),
                                          os.path.join(PASTA_EST, nome + ".png"), emissao=emissao)
    return _EST[chave]


def quad_uv(cantos, mat, uv=((0, 0), (1, 0), (1, 1), (0, 1)), nome="placa"):
    """Quadrilátero com UV próprio (estampa). cantos = 4 pontos 3D (anti-horário vistos da frente)."""
    bm = bmesh.new()
    vs = [bm.verts.new(c) for c in cantos]
    f = bm.faces.new(vs)
    uvl = bm.loops.layers.uv.new("UVMap")
    for lo, u in zip(f.loops, uv):
        lo[uvl].uv = u
    return mb._obj(nome, bm, None, mat=mat, liso=False)


def placa(nome_est, l, a, x=0.0, y=0.0, z=0.0, ang=0.0, emissao=1.6, moldura="grafite_escuro", esp=0.14,
          nome="letreiro"):
    """Letreiro: caixa com moldura e a estampa na frente. Centro da base em (x, y, z), a frente olha para −Y girada de
    ang graus em volta de Z."""
    mi = est(nome_est, emissao)
    caixa_ = mb.caixa(l + 0.16, esp, a + 0.16, y=esp / 2, z=-0.08, cor=moldura, bisel=0.04, seg=2)
    face = quad_uv([(-l / 2, -0.004, 0), (l / 2, -0.004, 0), (l / 2, -0.004, a), (-l / 2, -0.004, a)], mi)
    ob = mb.junta([caixa_, face], nome)
    ae.gira(ob, ang)
    mb.transforma(ob, loc=(x, y, z))
    return ob


def faixa_estampa(nome_est, r, a, z, a0=0, a1=360, n=48, emissao=1.6, rep=1.0, nome="faixa_tela"):
    """Faixa cilíndrica (telão em volta de uma torre redonda) com a estampa repetida rep vezes."""
    mi = est(nome_est, emissao)
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    pts = []
    for k in range(n + 1):
        t = math.radians(a0 + (a1 - a0) * k / n)
        pts.append((r * math.cos(t), r * math.sin(t)))
    for k in range(n):
        (xa, ya), (xb, yb) = pts[k], pts[k + 1]
        f = bm.faces.new([bm.verts.new((xa, ya, z)), bm.verts.new((xb, yb, z)), bm.verts.new((xb, yb, z + a)),
                          bm.verts.new((xa, ya, z + a))])
        u0, u1 = rep * k / n, rep * (k + 1) / n
        for lo, u in zip(f.loops, ((u0, 0), (u1, 0), (u1, 1), (u0, 1))):
            lo[uvl].uv = u
    bmesh.ops.reverse_faces(bm, faces=bm.faces[:])  # normal para fora
    return mb._obj(nome, bm, None, mat=mi, liso=False)


# ---------------------------------------------------------------------------------------------------- vegetação leve
def arvore_baixa(x, y, z=0.0, esc=1.0, cor=None, rnd=None, nome="arvore"):
    """Árvore redonda leve (copa de 40 a 60 faces), como as das encostas da referência."""
    rnd = rnd or random.Random(int(x * 13 + y * 7))
    cor = cor or rnd.choice(["folha", "folha_clara", "verde_lima", "folha", "verde_claro"])
    tronco = mb.cilindro(0.16 * esc, 1.3 * esc, x=x, y=y, z=z - 0.3, cor="madeira", seg=6, bisel=0, r2=0.12 * esc)
    copa = mb.esfera(1.0 * esc, x=x, y=y, z=z + 2.0 * esc, cor=cor, esc=(1, 1, 1.2), seg=8)
    return mb.junta([tronco, copa], nome)


def pinheiro_baixo(x, y, z=0.0, esc=1.0, nome="pinheiro"):
    t = mb.cilindro(0.14 * esc, 1.0 * esc, x=x, y=y, z=z - 0.3, cor="madeira_escura", seg=6, bisel=0)
    c = mb.cilindro(1.1 * esc, 3.2 * esc, x=x, y=y, z=z + 0.6 * esc, r2=0.05, cor="folha_escura", seg=7, bisel=0)
    return mb.junta([t, c], nome)


def pedra_facetada(x, y, z, l, p, a, cor="cinza", rot=0.0, seed=1, nome="rocha"):
    """Pedra grande de faces chapadas (ico com vértices sorteados)."""
    rnd = random.Random(seed)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.5)
    for v in bm.verts:
        k = 1 + rnd.uniform(-0.18, 0.18)
        v.co = V((v.co.x * l * k, v.co.y * p * k, (v.co.z + 0.5) * a * k))
    ob = mb._obj(nome, bm, cor, liso=False)
    ae.gira(ob, rot)
    mb.transforma(ob, loc=(x, y, z))
    return ob


# ---------------------------------------------------------------------------------------------------- campo de alturas
def campo(fz, fcor, x0, y0, x1, y1, passo=0.5, z_base=-0.4, lado="terra_seca", nome="terreno", liso=False):
    """Superfície z = fz(x, y) numa grade (cores por face: fcor(cx, cy, cz, normal)), com as laterais descendo até z_base
    e o fundo fechado. As laterais ficam na borda da peça (encostam nas vizinhas, com a mesma altura na borda)."""
    nx = max(1, round((x1 - x0) / passo))
    ny = max(1, round((y1 - y0) / passo))
    m = ae.Malha()
    xs = [x0 + (x1 - x0) * i / nx for i in range(nx + 1)]
    ys = [y0 + (y1 - y0) * j / ny for j in range(ny + 1)]
    g = [[m.v((x, y, fz(x, y))) for x in xs] for y in ys]
    for j in range(ny):
        for i in range(nx):
            a, b, c, d = g[j][i], g[j][i + 1], g[j + 1][i + 1], g[j + 1][i]
            # diagonal que segue a encosta (menos dente na faceta)
            if abs(a.co.z - c.co.z) <= abs(b.co.z - d.co.z):
                tris = ((a, b, c), (a, c, d))
            else:
                tris = ((a, b, d), (b, c, d))
            for t in tris:
                n = (t[1].co - t[0].co).cross(t[2].co - t[0].co).normalized()
                cc = (t[0].co + t[1].co + t[2].co) / 3
                m.f(t, fcor(cc.x, cc.y, cc.z, n))
    # laterais
    bordas = [[g[0][i] for i in range(nx + 1)], [g[j][nx] for j in range(ny + 1)],
              [g[ny][i] for i in range(nx, -1, -1)], [g[j][0] for j in range(ny, -1, -1)]]
    for bd in bordas:
        for p, q in zip(bd, bd[1:]):
            pb, qb = m.v((p.co.x, p.co.y, z_base)), m.v((q.co.x, q.co.y, z_base))
            m.f((p, pb, qb, q), lado)
    m.poligono([(x0, y0, z_base), (x1, y0, z_base), (x1, y1, z_base), (x0, y1, z_base)], lado, normal=(0, 0, -1))
    ob = m.obj(nome, liso=liso)
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(ob.data)
    bm.free()
    return ob


def agua_plano(pts2, z=None, nome="agua"):
    z = Z_AGUA if z is None else z
    m = ae.Malha()
    m.poligono([(p[0], p[1], z) for p in pts2], "m:agua")
    return m.obj(nome)


def quadrado(x0, y0, x1, y1):
    return cb.quadrado(x0, y0, x1, y1)


def suave(u):
    u = min(1.0, max(0.0, u))
    return u * u * (3 - 2 * u)
