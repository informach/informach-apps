"""Base própria da categoria props_esporte (por cima de moveis_base e cidade_base, sem alterá-las).

- ItemE: Item com filhos animados (extras glTF: anima, velocidade/periodo/angulo/eixo/quadros) e assentos (slots de
  0,5 × 0,5 × 0,9 m), inclusive assento preso a um filho animado.
- Desenho de quadra: decalques planos (polígonos côncavos também), tiras de linha pintada (retas e arcos), redes
  feitas de tiras finas (planos de espessura zero; o glTF é de dupla face) e quadrados com UV próprio (telas).
- Peças de academia e de skate: tubos, postes com anel e pé, perfis de rampa extrudados com a casca e o lábio.
"""
import math

import bpy
import bmesh
from mathutils import Matrix, Vector

import moveis_base as mb
import cidade_base as cb

V = Vector
H, Q, ZF = cb.H, cb.Q, cb.Z_FUNDO
Z_PISO, Z_QUADRA, Z_AREA, Z_LINHA = 0.0, 0.003, 0.006, 0.009
_CAMADA = [0]


def zera_camadas():
    _CAMADA[0] = 0


def _sobe(passo=0.00004):
    """Desnível crescente (dentro de cada peça) entre pinturas: duas linhas ou manchas que se cruzam nunca ficam no
    mesmo plano (face coplanar dá serrilhado no motor e mancha preta no Cycles), e a ordem de desenho vira a ordem das
    camadas. A conta zera a cada peça (zera_camadas)."""
    _CAMADA[0] += 1
    return passo * _CAMADA[0]


# =====================================================================================================================
# Item com animações e assentos
# =====================================================================================================================
class ItemE(mb.Item):
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
# Malhas planas (sem recalcular normais: a face fica do lado em que foi desenhada)
# =====================================================================================================================
def obj_plano(nome, bm, cor="branco", mat="atlas"):
    mb.materiais()
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-6)
    mi = mb._mat_idx(mat)
    uvl = bm.loops.layers.uv.get("UVMap") or bm.loops.layers.uv.new("UVMap")
    if not mb.MAT_NOMES[mi].startswith("estampa_"):
        u = mb.uv_cor(cor) if cor else (0.5, 0.5)
        for f in bm.faces:
            for lo in f.loops:
                lo[uvl].uv = u
    for f in bm.faces:
        f.material_index = mi
    me = bpy.data.meshes.new(nome)
    bm.to_mesh(me)
    bm.free()
    for n in mb.MAT_NOMES:
        me.materials.append(bpy.data.materials[n])
    ob = bpy.data.objects.new(nome, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def decal(pts, z, cor="branco", nome="decal", mat="atlas", sobe=True):
    """Polígono plano (côncavo também) em z, normal para cima. sobe=False: exatamente em z (quem chama já escalonou)."""
    pts = mb._ccw([(p[0], p[1]) for p in pts])
    if sobe:
        z = z + _sobe()
    bm = bmesh.new()
    vs = [bm.verts.new((p[0], p[1], z)) for p in pts]
    f = bm.faces.new(vs)
    bmesh.ops.triangulate(bm, faces=[f], quad_method="BEAUTY", ngon_method="EAR_CLIP")
    for g in bm.faces:
        g.normal_update()
        if g.normal.z < 0:
            g.normal_flip()
    return obj_plano(nome, bm, cor, mat)


def ret(x0, y0, x1, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


def arco(cx, cy, r, a0, a1, n=24):
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * k / n)),
             cy + r * math.sin(math.radians(a0 + (a1 - a0) * k / n))) for k in range(n + 1)]


def tira(pts, larg, z, cor="branco", fechado=False, nome="linha"):
    """Linha pintada de largura larg ao longo de uma polilinha 2D (cantos em meia-esquadria), normal para cima."""
    P = [V((p[0], p[1])) for p in pts]
    z = z + _sobe()
    if fechado and (P[0] - P[-1]).length < 1e-6:
        P = P[:-1]
    n = len(P)
    bm = bmesh.new()
    esq, dir_ = [], []
    for i in range(n):
        if fechado:
            a, b = P[i - 1], P[(i + 1) % n]
            t0 = (P[i] - a).normalized()
            t1 = (b - P[i]).normalized()
        else:
            t0 = (P[i] - P[i - 1]).normalized() if i > 0 else (P[1] - P[0]).normalized()
            t1 = (P[i + 1] - P[i]).normalized() if i < n - 1 else t0
        t = (t0 + t1)
        t = t.normalized() if t.length > 1e-6 else t0
        nn = V((-t.y, t.x))
        k = 1.0 / max(0.3, nn.dot(V((-t0.y, t0.x))))
        esq.append(bm.verts.new((P[i].x + nn.x * larg / 2 * k, P[i].y + nn.y * larg / 2 * k, z)))
        dir_.append(bm.verts.new((P[i].x - nn.x * larg / 2 * k, P[i].y - nn.y * larg / 2 * k, z)))
    m = n if fechado else n - 1
    for i in range(m):
        j = (i + 1) % n
        bm.faces.new((dir_[i], dir_[j], esq[j], esq[i]))
    for g in bm.faces:
        g.normal_update()
        if g.normal.z < 0:
            g.normal_flip()
    return obj_plano(nome, bm, cor)


def contorno_ret(x0, y0, x1, y1, larg, z, cor="branco"):
    """Retângulo de linha com a linha do lado de dentro da medida (como nas quadras)."""
    h = larg / 2
    return tira(ret(x0 + h, y0 + h, x1 - h, y1 - h), larg, z, cor, fechado=True, nome="contorno")


def seg(x0, y0, x1, y1, larg, z, cor="branco"):
    return tira([(x0, y0), (x1, y1)], larg, z, cor)


def quad_uv(nome, c, u, v, w, h, mat, uv=((0, 0), (1, 0), (1, 1), (0, 1))):
    """Retângulo com UV próprio: centro c, eixos u (largura) e v (altura); normal = u × v."""
    bm = bmesh.new()
    c, u, v = V(c), V(u).normalized(), V(v).normalized()
    vs = [bm.verts.new(c + u * (sx * w / 2) + v * (sy * h / 2)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    f = bm.faces.new(vs)
    uvl = bm.loops.layers.uv.new("UVMap")
    for lo, q in zip(f.loops, uv):
        lo[uvl].uv = q
    return obj_plano(nome, bm, None, mat=mat)


# =====================================================================================================================
# Redes (tiras finas num retalho bilinear)
# =====================================================================================================================
def rede(p00, p10, p01, p11, nu, nv, larg=0.022, cor="branco", nome="rede", bordas=True):
    """Rede num retalho p00-p10 (u) / p00-p01 (v): nu linhas ao longo de v e nv linhas ao longo de u, cada uma uma tira
    plana de largura larg no plano do retalho (dupla face no glTF)."""
    P00, P10, P01, P11 = V(p00), V(p10), V(p01), V(p11)

    def pt(u, v):
        return P00 * (1 - u) * (1 - v) + P10 * u * (1 - v) + P01 * (1 - u) * v + P11 * u * v

    nrm = (P10 - P00).cross(P01 - P00)
    if nrm.length < 1e-9:
        nrm = (P11 - P01).cross(P01 - P00)
    nrm.normalize()
    bm = bmesh.new()

    def linha(a, b, desloca):
        d = (b - a)
        if d.length < 1e-6:
            return
        w = nrm.cross(d.normalized()) * (larg / 2)
        o = nrm * desloca
        vs = [bm.verts.new(a - w + o), bm.verts.new(b - w + o), bm.verts.new(b + w + o), bm.verts.new(a + w + o)]
        bm.faces.new(vs)

    r0 = 0 if bordas else 1
    for i in range(r0, nu + 1 - r0):
        u = i / nu
        linha(pt(u, 0), pt(u, 1), 0.0)
    for j in range(r0, nv + 1 - r0):
        v = j / nv
        linha(pt(0, v), pt(1, v), 0.0015)
    return obj_plano(nome, bm, cor)


# =====================================================================================================================
# Peças pequenas
# =====================================================================================================================
def poste(x, y, a, r=0.05, cor="azul_medio", anel="amarelo", pe_cor="concreto", z=0.0, seg=12, topo=True):
    """Poste de academia: tubo, anel colorido embaixo, sapata de concreto e tampa boleada."""
    ps = [mb.cilindro(r, a, x=x, y=y, z=z, cor=cor, seg=seg, bisel=r * 0.3),
          mb.cilindro(r * 1.45, 0.09, x=x, y=y, z=z + 0.05, cor=anel, seg=seg, bisel=0.015),
          mb.cilindro(r * 2.6, 0.05, x=x, y=y, z=z, cor=pe_cor, seg=seg, bisel=0.015)]
    if topo:
        ps.append(mb.esfera(r * 1.25, x=x, y=y, z=z + a, cor=anel, seg=12))
    return ps


def barra(p0, p1, r=0.025, cor="cromo", seg=10):
    return mb.tubo([p0, p1], r, cor=cor, seg=seg)


def anel_tubo(cx, cy, z, R, r, cor="laranja", seg=24, seg_t=6, nome="anel"):
    """Toro deitado (aro de basquete)."""
    perfil = [(R + r * math.cos(math.radians(a)), z + r * math.sin(math.radians(a))) for a in range(-90, 271,
                                                                                                    360 // seg_t)]
    return mb.torno(perfil, x=cx, y=cy, cor=cor, seg=seg, nome=nome)


def gira_z(objs, ang, loc=(0, 0, 0)):
    out = []
    for o in (objs if isinstance(objs, (list, tuple)) else [objs]):
        if o is None:
            continue
        mb.transforma(o, rot=("Z", ang))
        mb.transforma(o, loc=loc)
        out.append(o)
    return out


def assento_balde(x, y, z, cor="azul", ang=0.0, larg=0.44):
    """Cadeira de arquibancada (assento e encosto boleados, sem pé: vai presa no degrau). Frente para −Y."""
    s = mb.caixa(larg, 0.4, 0.07, y=-0.02, z=0.0, cor=cor, bisel=0.03, seg=1)
    b = mb.caixa(larg, 0.06, 0.36, y=0.17, z=0.03, cor=cor, bisel=0.025, seg=1)
    mb.transforma(b, loc=(0, 0.17, 0.03), rot=("X", -10))
    mb.transforma(b, loc=(0, -0.17, -0.03))
    ps = [s, b]
    gira_z(ps, ang, (x, y, z))
    return mb.junta(ps, "assento")


# =====================================================================================================================
# Rampas de skate
# =====================================================================================================================
def perfil_transicao(R, ang_max=80, n=16, x0=0.0):
    """Curva de transição (quarto de círculo até ang_max) que começa em (x0, 0) e sobe para +x."""
    pts = []
    for k in range(n + 1):
        a = math.radians(ang_max * k / n)
        pts.append((x0 + R * math.sin(a), R * (1 - math.cos(a))))
    return pts


def casca(sup, esp):
    """Contorno fechado de uma casca de espessura esp sob a superfície sup (lista de (s, z) da esquerda p/ direita)."""
    S = [V(p) for p in sup]
    baixo = []
    for i, p in enumerate(S):
        a = S[max(0, i - 1)]
        b = S[min(len(S) - 1, i + 1)]
        t = (b - a).normalized()
        nrm = V((-t.y, t.x))  # para cima (esquerda de quem anda para +s)
        baixo.append(p - nrm * esp)
    return [tuple(p) for p in S] + [tuple(p) for p in baixo[::-1]]


def rampa_yz(sup, esp, larg, cor="pessego", borda="laranja", baixo_cor="laranja_escuro", nome="rampa", bisel=0.015):
    """Casca de rampa: perfil sup em (y, z), extrudado em X com largura larg (centrado em x = 0). As faces de lado
    ficam na cor borda e a face de baixo em baixo_cor."""
    pts = casca(sup, esp)
    ob = mb.extrudado(mb._ccw(pts), larg, x=-larg / 2, cor=cor, bisel=bisel, seg=2, plano="yz", nome=nome)
    mb.pinta_onde(ob, borda, lambda c, n: abs(n.x) > 0.8)
    mb.pinta_onde(ob, baixo_cor, lambda c, n: abs(n.x) <= 0.8 and n.z < -0.3)
    return ob


def rampa_xz(sup, esp, larg, cor="pessego", borda="laranja", baixo_cor="laranja_escuro", nome="rampa", bisel=0.015):
    """Como rampa_yz, mas o perfil em (x, z) e extrudado em Y (centrado em y = 0)."""
    ob = rampa_yz(sup, esp, larg, cor, borda, baixo_cor, nome, bisel)
    # (y, z) → (x, z): gira 90° em Z (x' = −y, y' = x); espelha para manter o sentido do perfil
    mb.transforma(ob, rot=("Z", -90))
    return ob


def haste(pts, r, cor="branco", lados=4, nome="haste"):
    """Tubo bem leve (prisma de poucos lados, sem tampas) por uma polilinha 3D: cordas de rede, cabos, correntes."""
    bm = bmesh.new()
    P = [V(p) for p in pts]
    for a, b in zip(P, P[1:]):
        d = b - a
        if d.length < 1e-6:
            continue
        t = d.normalized()
        u = t.cross(V((0, 0, 1)) if abs(t.z) < 0.9 else V((1, 0, 0))).normalized()
        w = t.cross(u)
        aneis = []
        for c in (a, b):
            aneis.append([bm.verts.new(c + (u * math.cos(2 * math.pi * k / lados) +
                                            w * math.sin(2 * math.pi * k / lados)) * r) for k in range(lados)])
        for k in range(lados):
            k2 = (k + 1) % lados
            bm.faces.new((aneis[0][k], aneis[0][k2], aneis[1][k2], aneis[1][k]))
    return mb._obj(nome, bm, cor, angulo=80)
