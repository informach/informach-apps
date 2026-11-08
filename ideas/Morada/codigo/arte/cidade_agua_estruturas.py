"""Cidade do Morada: água, represa e estruturas viárias.

Categorias (gravadas em <saida>/<categoria>/):
  agua        represa, canal (reto, curva), rio (reto, curva), lago, cais, orla, comporta, água aberta;
  estruturas  viadutos (rua, avenida, vão livre), rampas (rua, avenida), pilar, trevo, túnel, plataforma elevada,
              entrada de metrô, subestação e caixa de equipamentos.

Uso:
  MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/cidade_agua_estruturas.py -- SP/cidade_out [agua|estruturas|ids...]

Convenções próprias desta parte (além das do guia):
- Água de canal, orla, cais e água aberta em z = −1,0 (fundo agua_funda em −1,7); rio em −0,75; lago em −0,6.
- Perfil do canal (corre em Y): calçada de |x| 4,5 a 7,5 em z = 0, mureta de 0,30 × 0,60 em |x| 4,2 a 4,5,
  canal de 8,4 m (|x| < 4,2). A represa termina nesse perfil, então o canal encaixa na saída dela.
- Perfil do rio: grama de |x| 5,6 a 7,5 em z = 0, margem em degrau de terra até a água, fundo agua_funda.
- Viadutos: o tabuleiro tem o perfil da rua (cb.RUA ou cb.AVENIDA) com a calçada em z = 7,5 (asfalto em 7,40, a
  altura das pontes) e o tabuleiro de 1,3 m (vão livre de 6,2 m). As rampas sobem de z = 0 a 7,5 em 30 m e encaixam no viaduto e na rua da base.
- Trevo de 5 × 5 quadras (75 m): alças de ~80 m com rampa máxima de ~10 % no eixo (ver p_trevo).
- Partes inclinadas (rampas, alças do trevo) colidem por malha (Item.colisao_malha); o resto, por caixas.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402
from mathutils.geometry import tessellate_polygon  # noqa: E402

import moveis_base as mb  # noqa: E402
import cidade_base as cb  # noqa: E402

V = Vector
Q, H = cb.Q, cb.H
ZF = cb.Z_FUNDO
DIR_ALTO = (0.55, -1.0, 0.5)
DIR_MEIO = (0.55, -1.0, 0.85)

# ======================================================================================================================
# Malha com cor por face
# ======================================================================================================================
_ESP = {"m:agua": "agua", "m:vidro": "vidro", "m:luz": "luz", "m:neon": "neon"}


def _cod(cor):
    if cor in _ESP:
        return -1 - mb.MAT_NOMES.index(_ESP[cor])
    return mb.NOMES.index(cor)


class Malha:
    """bmesh em que cada face guarda a sua cor (nome da paleta) ou material ("m:agua", "m:vidro", "m:luz")."""

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

    def poligono(self, pts3, cor, normal=(0, 0, 1), plano=None):
        """Polígono qualquer (côncavo também), triangulado, com a normal virada para 'normal'."""
        if plano is None:
            p2 = [V((p[0], p[1], 0)) for p in pts3]
        else:
            p2 = [V((plano(p)[0], plano(p)[1], 0)) for p in pts3]
        vs = [self.v(p) for p in pts3]
        nn = V(normal)
        for a, b, c in tessellate_polygon([p2]):
            A, B, C = V(pts3[a]), V(pts3[b]), V(pts3[c])
            if (B - A).cross(C - A).dot(nn) < 0:
                b, c = c, b
            self.f((vs[a], vs[b], vs[c]), cor)

    def obj(self, nome="malha", liso=False, angulo=35):
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


# ======================================================================================================================
# Geometria 2D
# ======================================================================================================================
def area2(pts):
    return sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(pts, pts[1:] + pts[:1])) / 2


def ccw(pts):
    return list(pts) if area2(list(pts)) > 0 else list(pts)[::-1]


def bezier(p0, p1, p2, p3, n=16):
    out = []
    for k in range(n + 1):
        t = k / n
        a, b, c, d = (1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t * t, t ** 3
        out.append((a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]))
    return out


def comprimentos(cam):
    s = [0.0]
    for a, b in zip(cam, cam[1:]):
        s.append(s[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
    return s


def reamostra(cam, passo):
    out = [tuple(cam[0])]
    for a, b in zip(cam, cam[1:]):
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        n = max(1, int(math.ceil(L / passo)))
        for k in range(1, n + 1):
            out.append((a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n))
    return out


def tangentes(cam, fechado=False, tang=None):
    n = len(cam)
    out = []
    if tang is not None and len(tang) and isinstance(tang[0], (list, tuple, Vector)):
        return [V((t[0], t[1])).normalized() for t in tang]
    for i in range(n):
        if tang is not None:
            t = V(tang)
        elif fechado:
            t = V(cam[(i + 1) % n]) - V(cam[i - 1])
        else:
            t = V(cam[min(i + 1, n - 1)]) - V(cam[max(i - 1, 0)])
        t = V((t[0], t[1])).normalized()
        out.append(t)
    return out


def desloca(cam, off, fechado=False, tang=None):
    """Linha paralela: off > 0 para a DIREITA de quem anda pelo caminho."""
    ts = tangentes(cam, fechado, tang)
    return [(p[0] + t.y * off, p[1] - t.x * off) for p, t in zip(cam, ts)]


def smooth(u):
    u = min(1.0, max(0.0, u))
    return u * u * (3 - 2 * u)


# ======================================================================================================================
# Sólidos
# ======================================================================================================================
def prisma(aneis, z0, z1, topo, lado=None, fundo=None, m=None, nome="prisma"):
    """Prisma de z0 a z1 com contorno externo e furos (aneis[0] externo, demais furos). Devolve objeto (ou usa m)."""
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
        if fundo:
            m.f((vb[a], vb[c], vb[b]), fundo)
    k = 0
    for anel in todos:
        n = len(anel)
        for i in range(n):
            a, b = k + i, k + (i + 1) % n
            m.f((vb[a], vb[b], vt[b], vt[a]), lado)
        k += n
    return m.obj(nome) if proprio else m


def varre(cam, z, perfil, cores, fundo=None, lado="concreto", base="concreto_escuro", tampas=True, fechado=False,
          tang=None, m=None, nome="varrido", liso=False, angulo=35, anel=False):
    """Varre um perfil por um caminho 2D. perfil: [(off, dz), ...] (off > 0 à direita de quem anda; liste da esquerda
    para a direita pelo lado de cima, para as normais saírem para cima); pode ser função do índice da estação.
    cores: uma cor por segmento do perfil (ou função do índice). z: altura (número ou lista por estação).
    fundo: z absoluto do fundo (número ou lista) para fechar o sólido (laterais 'lado', fundo 'base')."""
    proprio = m is None
    m = m or Malha()
    n = len(cam)
    zs = z if isinstance(z, (list, tuple)) else [z] * n
    ts = tangentes(cam, fechado, tang)
    aneis, perfis2 = [], []
    for i in range(n):
        t = ts[i]
        r = V((t.y, -t.x))
        prf = perfil(i) if callable(perfil) else perfil
        p2 = [(o, zs[i] + dz) for o, dz in prf]
        if fundo is not None:
            zb = fundo[i] if isinstance(fundo, (list, tuple)) else fundo
            p2 += [(prf[-1][0], zb), (prf[0][0], zb)]
        perfis2.append(p2)
        aneis.append([m.v((cam[i][0] + r.x * o, cam[i][1] + r.y * o, zz)) for o, zz in p2])
    k = len(aneis[0])
    fech = fundo is not None or anel
    nseg = k if fech else k - 1
    for i in range(n if fechado else n - 1):
        A, B = aneis[i], aneis[(i + 1) % n]
        cl = cores(i) if callable(cores) else cores
        cl = list(cl) + ([lado, base, lado] if fundo is not None else [])
        for j in range(nseg):
            j2 = (j + 1) % k
            m.f((A[j], A[j2], B[j2], B[j]), cl[j])
    if tampas and fech and not fechado:
        for idx, sinal in ((0, -1), (n - 1, 1)):
            p2 = perfis2[idx]
            vs = aneis[idx]
            tt = V((ts[idx].x, ts[idx].y, 0)) * sinal
            for a, b, c in tessellate_polygon([[V((o, zz, 0)) for o, zz in p2]]):
                A, B, C = vs[a].co, vs[b].co, vs[c].co
                if (B - A).cross(C - A).dot(tt) < 0:
                    b, c = c, b
                m.f((vs[a], vs[b], vs[c]), lado)
    return m.obj(nome, liso=liso, angulo=angulo) if proprio else m


def tira(cam, z, off, larg, cor="branco", dz=0.004, tracejada=None, fase=0.0, passo=0.25, nome="faixa"):
    """Faixa pintada que acompanha um caminho com altura variável (z por estação ou número)."""
    if not isinstance(z, (list, tuple)):
        z = [z] * len(cam)
    s0 = comprimentos(cam)
    # reamostra junto com z
    pts, zs = [cam[0]], [z[0]]
    for i in range(len(cam) - 1):
        a, b = cam[i], cam[i + 1]
        L = s0[i + 1] - s0[i]
        nn = max(1, int(math.ceil(L / passo)))
        for k in range(1, nn + 1):
            u = k / nn
            pts.append((a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u))
            zs.append(z[i] + (z[i + 1] - z[i]) * u)
    s = comprimentos(pts)
    ts = tangentes(pts)
    trechos = []
    if not tracejada:
        trechos = [(0, len(pts) - 1)]
    else:
        tr, vao = tracejada
        per = tr + vao
        dentro = None
        for i, si in enumerate(s):
            on = (si + fase + tr / 2) % per < tr
            if on and dentro is None:
                dentro = i
            elif not on and dentro is not None:
                if i - 1 > dentro:
                    trechos.append((dentro, i - 1))
                dentro = None
        if dentro is not None and len(pts) - 1 > dentro:
            trechos.append((dentro, len(pts) - 1))
    m = Malha()
    for i0, i1 in trechos:
        esq, dir_ = [], []
        for i in range(i0, i1 + 1):
            t = ts[i]
            r = V((t.y, -t.x))
            p = pts[i]
            esq.append(m.v((p[0] + r.x * (off - larg / 2), p[1] + r.y * (off - larg / 2), zs[i] + dz)))
            dir_.append(m.v((p[0] + r.x * (off + larg / 2), p[1] + r.y * (off + larg / 2), zs[i] + dz)))
        for k in range(len(esq) - 1):
            m.f((esq[k], dir_[k], dir_[k + 1], esq[k + 1]), cor)
    return m.obj(nome) if trechos else None


def meio_fio3(cam, z, nome="meio_fio"):
    """Meio-fio da base (mesmo perfil) por um caminho com altura variável z (calçada); asfalto à ESQUERDA."""
    perfil = [(-0.10, -0.12), (-0.10, 0.03), (-0.07, 0.085), (0.0, 0.10), (0.07, 0.085), (0.10, 0.03), (0.10, -0.12)]
    # no cb.meio_fio o asfalto fica à esquerda; aqui off > 0 é a direita → perfil igual (simétrico)
    return varre(cam, z, perfil, ["calcada"] * 6, fundo=None, nome=nome, liso=True, angulo=50)


def sobe(ob, dz):
    if ob is not None:
        mb.transforma(ob, loc=(0, 0, dz))
    return ob


def gira(ob, graus, eixo="Z"):
    if ob is not None:
        mb.transforma(ob, rot=(eixo, graus))
    return ob


def copia_girada(objs, graus):
    out = []
    for o in objs:
        if o is None:
            continue
        c = mb.copia(o)
        gira(c, graus)
        out.append(c)
    return out


def pinta_lados(ob, cor_topo, cor_lado, cor_fundo=None, lim=0.7):
    mb.pinta_onde(ob, cor_lado, lambda c, n: abs(n.z) < lim)
    if cor_fundo:
        mb.pinta_onde(ob, cor_fundo, lambda c, n: n.z <= -lim)
    return ob


# ======================================================================================================================
# Peças pequenas (props das quadras)
# ======================================================================================================================
def poste(x, y, z0=0.0, ang=0.0, alt=5.2, braco=1.5, cor="cinza_azulado", nome="poste"):
    """Poste de luz com braço curvo apontando na direção ang (graus, no plano XY)."""
    dx, dy = math.cos(math.radians(ang)), math.sin(math.radians(ang))
    ps = [mb.cilindro(0.17, 0.32, x=x, y=y, z=z0, cor="grafite", seg=10, bisel=0.03),
          mb.cilindro(0.085, alt, x=x, y=y, z=z0 + 0.3, cor=cor, seg=8, r2=0.065, bisel=0.0)]
    top = z0 + 0.3 + alt
    ps.append(mb.tubo([(x, y, top - 0.25), (x + dx * 0.25, y + dy * 0.25, top + 0.12),
                       (x + dx * braco, y + dy * braco, top + 0.12)], 0.05, cor=cor, raio_curva=0.3, seg=6))
    lx, ly = x + dx * braco, y + dy * braco
    lum = mb.caixa(0.62, 0.3, 0.16, cor=cor, bisel=0.05)
    gira(lum, ang)
    mb.transforma(lum, loc=(lx, ly, top + 0.02))
    luz = mb.caixa(0.5, 0.2, 0.03, cor=None, mat="luz", bisel=0.008)
    gira(luz, ang)
    mb.transforma(luz, loc=(lx, ly, top - 0.0))
    ps += [lum, luz]
    return mb.junta(ps, nome)


def banco(x, y, z0=0.0, ang=0.0, cor="madeira_mel", nome="banco"):
    ps = []
    for k in range(3):
        ps.append(mb.caixa(1.6, 0.12, 0.05, y=-0.15 + k * 0.15, z=0.42, cor=cor, bisel=0.015, seg=1))
    for k in range(2):
        r = mb.caixa(1.6, 0.1, 0.05, y=0.24, z=0.6 + k * 0.14, cor=cor, bisel=0.015, seg=1)
        ps.append(r)
    for sx in (-0.65, 0.65):
        ps.append(mb.caixa(0.06, 0.5, 0.42, x=sx, y=0.0, z=0.0, cor="grafite", bisel=0.01, seg=1))
        ps.append(mb.caixa(0.06, 0.06, 0.45, x=sx, y=0.26, z=0.42, cor="grafite", bisel=0.01, seg=1))
    ob = mb.junta(ps, nome)
    gira(ob, ang)
    mb.transforma(ob, loc=(x, y, z0))
    return ob


def moita(x, y, z0=0.0, esc=1.0, cores=("folha", "folha_escura", "folha_clara"), nome="moita"):
    ps = []
    for k, (dx, dy, r) in enumerate(((0, 0, 0.55), (0.42, 0.15, 0.4), (-0.35, 0.22, 0.42))):
        ps.append(mb.superelipsoide(2 * r * esc, 2 * r * esc, 1.6 * r * esc, x=x + dx * esc, y=y + dy * esc,
                                    z=z0 - 0.05, cor=cores[k % len(cores)], e=0.85, e_v=0.8, nu=10, nv=5))
    return mb.junta(ps, nome)


def arvore(x, y, z0=0.0, esc=1.0, nome="arvore"):
    ps = [mb.cilindro(0.13 * esc, 1.6 * esc, x=x, y=y, z=z0, cor="madeira", seg=8, r2=0.1 * esc, bisel=0.0)]
    for dx, dy, dz, r, c in ((0, 0, 2.0, 0.95, "folha"), (0.45, 0.2, 1.75, 0.65, "folha_escura"),
                             (-0.3, -0.2, 2.5, 0.62, "folha_clara")):
        ps.append(mb.superelipsoide(2 * r * esc, 2 * r * esc, 1.7 * r * esc, x=x + dx * esc, y=y + dy * esc,
                                    z=z0 + (dz - r) * esc, cor=c, e=0.9, e_v=0.85, nu=10, nv=5))
    return mb.junta(ps, nome)


def pedra(x, y, z, l=0.6, p=0.45, a=0.35, cor="cinza", rot=0.0, nome="pedra"):
    ob = mb.superelipsoide(l, p, a, cor=cor, e=0.55, e_v=0.6, nu=8, nv=4)
    gira(ob, rot)
    mb.transforma(ob, loc=(x, y, z))
    return ob


def taboas(x, y, z0, n=5, alt=1.1, seed=0, nome="taboas"):
    ps = []
    for k in range(n):
        a = seed * 1.7 + k * 2.4
        rr = 0.12 + 0.1 * ((k * 37 + seed * 11) % 5) / 5
        px, py = x + math.cos(a) * rr, y + math.sin(a) * rr
        h = alt * (0.75 + 0.25 * ((k * 13 + seed) % 4) / 3)
        ps.append(mb.cilindro(0.018, h, x=px, y=py, z=z0, cor="folha", seg=5, bisel=0, tampas=False))
        ps.append(mb.cilindro(0.045, 0.2, x=px, y=py, z=z0 + h * 0.72, cor="marrom", seg=6, bisel=0.0))
        fo = mb.caixa(0.05, 0.012, h * 0.8, cor="folha_clara", bisel=0.0, seg=1)
        mb.transforma(fo, rot=[("Z", math.degrees(a)), ("X", 14)])
        mb.transforma(fo, loc=(px, py, z0))
        ps.append(fo)
    return mb.junta(ps, nome)


def vitoria_regia(x, y, z, r=0.35, flor=False, nome="vitoria"):
    pts = [(r * math.cos(t), r * math.sin(t)) for t in [math.radians(20 + 340 * k / 11) for k in range(12)]] + [(0, 0)]
    ps = [mb.extrudado(ccw(pts), 0.03, x=x, y=y, z=z, cor="verde_claro", bisel=0.0, seg=1, liso=False)]
    if flor:
        ps.append(mb.esfera(0.09, x=x - r * 0.3, y=y + r * 0.2, z=z + 0.07, cor="rosa_bebe", esc=(1, 1, 0.7), seg=8))
    return mb.junta(ps, nome)


def pato(x, y, z, ang=0.0, cor="amarelo", nome="pato"):
    ps = [mb.superelipsoide(0.34, 0.22, 0.18, x=0, y=0, z=-0.05, cor=cor, e=0.7, e_v=0.7, nu=10, nv=5),
          mb.esfera(0.075, x=0.13, y=0, z=0.17, cor=cor, seg=8),
          mb.superelipsoide(0.08, 0.06, 0.03, x=0.21, y=0, z=0.15, cor="laranja", e=0.6, nu=6, nv=3),
          mb.superelipsoide(0.12, 0.05, 0.06, x=-0.16, y=0, z=0.08, cor=cor, e=0.6, nu=6, nv=3)]
    for sy in (-0.035, 0.035):
        ps.append(mb.caixa(0.012, 0.022, 0.022, x=0.2, y=sy, z=0.18, cor="preto", bisel=0.004, seg=1))
    ob = mb.junta(ps, nome)
    gira(ob, ang)
    mb.transforma(ob, loc=(x, y, z))
    return ob


def placa_aviso(x, y, z0, ang=0.0, nome="placa"):
    ps = [mb.cilindro(0.035, 1.6, x=0, y=0, z=0, cor="metal", seg=6, bisel=0)]
    tri = mb.extrudado(ccw([(-0.28, 0), (0.28, 0), (0, 0.48)]), 0.03, y=-0.05, z=1.35, cor="amarelo", bisel=0.01,
                       seg=1, plano="xz")
    ps.append(tri)
    ps.append(mb.caixa(0.05, 0.01, 0.2, x=0, y=-0.056, z=1.43, cor="preto", bisel=0.0, seg=1))
    ps.append(mb.caixa(0.05, 0.01, 0.05, x=0, y=-0.056, z=1.37, cor="preto", bisel=0.0, seg=1))
    ob = mb.junta(ps, nome)
    gira(ob, ang)
    mb.transforma(ob, loc=(x, y, z0))
    return ob


def guarda_corpo(pts3, alt=1.1, passo=1.5, cor="metal", fase=0.75, travessas=(0.55,), r_post=0.04, r_tubo=0.035,
                 nome="guarda_corpo", fim=True):
    """Guarda-corpo de metal: montantes a cada 'passo' (medido pelo comprimento, começando em 'fase') e corrimão no
    alto + travessas, seguindo uma linha 3D (o pé do guarda-corpo)."""
    pts = [V(p) for p in pts3]
    s = [0.0]
    for a, b in zip(pts, pts[1:]):
        s.append(s[-1] + ((b - a).to_2d()).length)
    L = s[-1]
    ps = []

    def em(si):
        for i in range(len(s) - 1):
            if s[i] <= si <= s[i + 1]:
                u = (si - s[i]) / max(1e-9, s[i + 1] - s[i])
                return pts[i].lerp(pts[i + 1], u)
        return pts[-1]

    marcas = []
    si = fase
    while si < L - 0.05:
        marcas.append(si)
        si += passo
    if fim:
        marcas = sorted(set([0.03] + marcas + [L - 0.03]))
    for si in marcas:
        p = em(si)
        ps.append(mb.cilindro(r_post, alt, x=p.x, y=p.y, z=p.z, cor=cor, seg=6, bisel=0.0))
    ps.append(mb.tubo([(p.x, p.y, p.z + alt) for p in pts], r_tubo, cor=cor, seg=6, raio_curva=0.4))
    for h in travessas:
        ps.append(mb.tubo([(p.x, p.y, p.z + h) for p in pts], r_tubo * 0.7, cor=cor, seg=4, raio_curva=0.4))
    return mb.junta(ps, nome)


# ======================================================================================================================
# Perfis de água
# ======================================================================================================================
Z_AGUA_CANAL, Z_FUNDO_CANAL, Z_BASE_CANAL = -1.0, -1.7, -1.9
CANAL_W, MURETA_W, MURETA_H = 4.2, 0.30, 0.60


def perfil_canal(zm=0.0):
    """Perfil do canal (de off −4,5 a +4,5): mureta, parede, fundo, parede, mureta. Cores devolvidas juntas."""
    w, mw, mh = CANAL_W, MURETA_W, MURETA_H
    e = w + mw
    p = [(-e, zm), (-e, zm + mh - 0.06), (-e + 0.05, zm + mh), (-w - 0.05, zm + mh), (-w, zm + mh - 0.06),
         (-w, -0.82), (-w, -1.12), (-w, Z_FUNDO_CANAL), (w, Z_FUNDO_CANAL), (w, -1.12), (w, -0.82), (w, zm + mh - 0.06),
         (w + 0.05, zm + mh), (e - 0.05, zm + mh), (e, zm + mh - 0.06), (e, zm)]
    c = ["concreto", "concreto", "concreto", "concreto", "concreto_escuro", "verde_oliva", "concreto_escuro",
         "agua_funda", "concreto_escuro", "verde_oliva", "concreto_escuro", "concreto", "concreto", "concreto",
         "concreto"]
    return p, c


Z_AGUA_RIO = -0.75


def pinta_rio_cores():
    """Perfil do rio (de off −5,6 a +5,6) e as cores: grama boleada, terra em degrau, areia rasa, fundo escuro."""
    meia = [(-5.6, 0.0), (-5.3, -0.1), (-4.85, -0.42), (-4.45, -0.47), (-4.0, -0.82), (-3.2, -1.1), (-1.6, -1.32)]
    p = meia + [(0.0, -1.38)] + [(-o, z) for o, z in meia[::-1]]
    cores = []
    for (o1, z1), (o2, z2) in zip(p, p[1:]):
        om = abs((o1 + o2) / 2)
        if om > 5.3:
            cores.append("grama_escura")
        elif om > 4.0:
            cores.append("terra_seca")
        elif om > 3.25:
            cores.append("areia")
        else:
            cores.append("agua_funda")
    return p, cores


# ======================================================================================================================
# Peças: água
# ======================================================================================================================
def caminho_reto(n=2):
    return [(0.0, -H + Q * k / (n - 1)) for k in range(n)]


def caminho_curva(r=H, n=32):
    return cb.arco(H, -H, r, 180, 90, n)


def tang_arco(a0, a1, n, horario=True):
    """Tangentes exatas de cb.arco(…, a0, a1, n) (horário: ângulo decrescendo)."""
    out = []
    for k in range(n + 1):
        a = math.radians(a0 + (a1 - a0) * k / n)
        t = (math.sin(a), -math.cos(a)) if a1 < a0 else (-math.sin(a), math.cos(a))
        out.append(t)
    return out


TC = tang_arco(180, 90, 32)


def calcadas_canal(it, curva, cor="calcada", e=CANAL_W + MURETA_W, z_fundo=Z_BASE_CANAL):
    """Calçadas (ou grama) dos dois lados da seção (de |off| = e até a borda da quadra)."""
    if not curva:
        it.add(cb.laje(cb.quadrado(-H, -H, -e, H), 0.0, cor, z_fundo=z_fundo),
               cb.laje(cb.quadrado(e, -H, H, H), 0.0, cor, z_fundo=z_fundo))
    else:
        n = 32
        dentro = [(H, -H)] + cb.arco(H, -H, H - e, 90, 180, n)
        fora = cb.arco(H, -H, H + e, 180, 90, n) + [(H, H), (-H, H), (-H, -H)]
        it.add(cb.laje(dentro, 0.0, cor, z_fundo=z_fundo), cb.laje(fora, 0.0, cor, z_fundo=z_fundo))


def agua_secao(cam, meia, z, nome="agua", tang=None):
    """Lâmina d'água (só a face de cima, material agua) de largura 2·meia ao longo do caminho."""
    return varre(cam, z, [(-meia, 0.0), (meia, 0.0)], ["m:agua"], nome=nome, tang=tang)


def escada_marinheiro(x, y, z0, z1, lado=1, cor="metal_escuro"):
    """Degraus em U presos na parede do canal (lado = +1: parede em x, degraus saem para −x)."""
    ps = []
    z = z0
    while z <= z1 + 1e-6:
        ps.append(mb.tubo([(x, y - 0.22, z), (x - lado * 0.16, y - 0.22, z), (x - lado * 0.16, y + 0.22, z),
                           (x, y + 0.22, z)], 0.022, cor=cor, seg=6, raio_curva=0.05))
        z += 0.3
    return mb.junta(ps, "escada")


def bueiro(x, y, z, lado=1):
    """Saída de água redonda na parede (lado = +1: parede voltada para −x)."""
    ps = [mb.cilindro(0.32, 0.12, x=x - lado * 0.04, y=y, z=z, cor="concreto_escuro", eixo="x", seg=18, bisel=0.03),
          mb.cilindro(0.22, 0.13, x=x - lado * 0.045, y=y, z=z, cor="grafite", eixo="x", seg=16, bisel=0.0)]
    return mb.junta(ps, "bueiro")


def p_canal_reto():
    it = mb.Item("canal_reto")
    p, c = perfil_canal()
    cam = caminho_reto()
    it.add(varre(cam, 0.0, p, c, fundo=Z_BASE_CANAL, nome="canal"))
    calcadas_canal(it, False)
    it.add(agua_secao(cam, CANAL_W, Z_AGUA_CANAL))
    it.add(escada_marinheiro(-CANAL_W, 3.0, Z_FUNDO_CANAL + 0.35, -0.05, lado=-1))
    it.add(bueiro(CANAL_W, -3.5, -0.75, lado=1))
    it.add(poste(-6.4, 0.0, ang=0, braco=1.2))
    it.add(guarda_corpo([(-4.35, -H + 0.02, MURETA_H), (-4.35, H - 0.02, MURETA_H)], alt=0.5, travessas=(),
                        fase=0.75, nome="gc_e", fim=False))
    it.add(guarda_corpo([(4.35, -H + 0.02, MURETA_H), (4.35, H - 0.02, MURETA_H)], alt=0.5, travessas=(),
                        fase=0.75, nome="gc_d", fim=False))
    col = colisao_canal_reto()
    return it, dict(rotulo="Canal de concreto reto", grupo="canal_concreto", tags=["modular", "agua", "canal"],
                    colisao=col)


def colisao_canal_reto():
    e = CANAL_W + MURETA_W
    return [((-(H + e) / 2, 0, Z_BASE_CANAL), (H - e, Q, -Z_BASE_CANAL)),
            (((H + e) / 2, 0, Z_BASE_CANAL), (H - e, Q, -Z_BASE_CANAL)),
            ((-CANAL_W - MURETA_W / 2, 0, Z_BASE_CANAL), (MURETA_W, Q, MURETA_H - Z_BASE_CANAL + 0.5)),
            ((CANAL_W + MURETA_W / 2, 0, Z_BASE_CANAL), (MURETA_W, Q, MURETA_H - Z_BASE_CANAL + 0.5)),
            ((0, 0, Z_BASE_CANAL), (2 * CANAL_W, Q, Z_FUNDO_CANAL - Z_BASE_CANAL))]


def p_canal_curva():
    it = mb.Item("canal_curva")
    p, c = perfil_canal()
    cam = caminho_curva()
    it.add(varre(cam, 0.0, p, c, fundo=Z_BASE_CANAL, nome="canal", tang=TC))
    calcadas_canal(it, True)
    it.add(agua_secao(cam, CANAL_W, Z_AGUA_CANAL, tang=TC))
    rr = H + CANAL_W + MURETA_W / 2
    arco_g = [(x, y, MURETA_H) for x, y in cb.arco(H, -H, rr, 179.8, 90.2, 18)]
    it.add(guarda_corpo(arco_g, alt=0.5, travessas=(), fase=0.75, nome="gc_f", fim=False))
    ri = H - CANAL_W - MURETA_W / 2
    arco_i = [(x, y, MURETA_H) for x, y in cb.arco(H, -H, ri, 179.0, 91.0, 8)]
    it.add(guarda_corpo(arco_i, alt=0.5, travessas=(), fase=0.6, nome="gc_i", fim=False))
    it.add(poste(-5.2, 5.2, ang=-45, braco=1.2))
    col = [((0, 0, Z_BASE_CANAL), (Q, Q, Z_FUNDO_CANAL - Z_BASE_CANAL)),
           ((H - 1.5, -H + 1.5, Z_BASE_CANAL), (3.0, 3.0, -Z_BASE_CANAL + MURETA_H)),
           ((-H + 1.6, 1.6, Z_BASE_CANAL), (3.2, Q - 3.2, -Z_BASE_CANAL)),
           ((0, H - 1.6, Z_BASE_CANAL), (Q, 3.2, -Z_BASE_CANAL))]
    return it, dict(rotulo="Canal de concreto em curva", grupo="canal_concreto", tags=["modular", "agua", "canal"],
                    colisao=col)


def enfeites_rio(it, cam, ts=None, curva=False):
    """Pedras nas margens, taboas, vitórias-régias e um pato, posicionados ao longo do caminho."""
    s = comprimentos(cam)
    L = s[-1]

    def em(u, off):
        si = u * L
        for i in range(len(s) - 1):
            if s[i] <= si <= s[i + 1]:
                k = (si - s[i]) / max(1e-9, s[i + 1] - s[i])
                p = V(cam[i]).lerp(V(cam[i + 1]), k)
                t = (V(cam[i + 1]) - V(cam[i])).normalized()
                return p.x + t.y * off, p.y - t.x * off
        return cam[-1]

    for u, off, l, cor in ((0.12, -4.6, 0.7, "cinza"), (0.18, -4.35, 0.45, "cinza_claro"), (0.63, 4.55, 0.8, "cinza"),
                           (0.7, 4.7, 0.5, "cinza_medio"), (0.88, -4.65, 0.55, "cinza_claro")):
        x, y = em(u, off)
        it.add(pedra(x, y, -0.62, l, l * 0.75, l * 0.55, cor=cor, rot=u * 300))
    for u, off, sd in ((0.3, -4.25, 1), (0.82, 4.3, 3)):
        x, y = em(u, off)
        it.add(taboas(x, y, -0.7, n=4, seed=sd))
    for u, off, fl in ((0.25, 1.6, True), (0.32, 2.3, False), (0.75, -2.2, False), (0.8, -1.5, True)):
        x, y = em(u, off)
        it.add(vitoria_regia(x, y, Z_AGUA_RIO - 0.005, r=0.32 + 0.05 * (u * 10 % 2), flor=fl))
    x, y = em(0.55, -0.8)
    it.add(pato(x, y, Z_AGUA_RIO, ang=80 if not curva else 30))
    for u, off in ((0.08, 6.4), (0.6, -6.5)):
        x, y = em(u, off)
        if abs(x) < 6.7 and abs(y) < 6.7:
            it.add(moita(x, y, 0.0, esc=0.8))


def p_rio_reto():
    it = mb.Item("rio_reto")
    p, c = pinta_rio_cores()
    cam = reamostra(caminho_reto(), 0.75)
    it.add(varre(cam, 0.0, p, c, fundo=-1.6, nome="rio", liso=True, angulo=28, lado="terra", base="terra_escura"))
    calcadas_canal(it, False, cor="grama", e=5.6, z_fundo=-1.6)
    it.add(agua_secao(cam, 4.05, Z_AGUA_RIO))
    enfeites_rio(it, cam)
    col = [((-6.55, 0, -1.6), (1.9, Q, 1.6)), ((6.55, 0, -1.6), (1.9, Q, 1.6)),
           ((-4.8, 0, -1.6), (1.6, Q, 1.15)), ((4.8, 0, -1.6), (1.6, Q, 1.15)), ((0, 0, -1.6), (8.0, Q, 0.25))]
    return it, dict(rotulo="Rio com margens de grama (reto)", grupo="rio_natural", tags=["modular", "agua", "rio"],
                    colisao=col)


def p_rio_curva():
    it = mb.Item("rio_curva")
    p, c = pinta_rio_cores()
    cam = caminho_curva()
    it.add(varre(cam, 0.0, p, c, fundo=-1.6, nome="rio", liso=True, angulo=28, tang=TC, lado="terra",
                 base="terra_escura"))
    calcadas_canal(it, True, cor="grama", e=5.6, z_fundo=-1.6)
    it.add(agua_secao(cam, 4.05, Z_AGUA_RIO, tang=TC))
    enfeites_rio(it, cam, curva=True)
    it.add(arvore(-5.0, 5.2, 0.0, esc=1.0))
    col = [((0, 0, -1.6), (Q, Q, 0.3)), ((H - 1.0, -H + 1.0, -1.6), (2.0, 2.0, 1.6)),
           ((-H + 1.2, 1.2, -1.6), (2.4, Q - 2.4, 1.6)), ((0, H - 1.2, -1.6), (Q, 2.4, 1.6))]
    return it, dict(rotulo="Rio com margens de grama (curva)", grupo="rio_natural", tags=["modular", "agua", "rio"],
                    colisao=col)


def contorno_lago(n=48):
    pts = []
    for k in range(n):
        t = 2 * math.pi * k / n
        r = 5.0 + 0.55 * math.sin(2 * t + 0.6) + 0.3 * math.cos(3 * t - 0.4) + 0.15 * math.sin(5 * t)
        pts.append((r * math.cos(t) * 1.08, r * math.sin(t) * 0.98 + 0.2))
    return ccw(pts)


def p_lago():
    it = mb.Item("lago")
    cont = contorno_lago()
    Z_L = -0.6
    perfil = [(-2.5, -1.25), (-1.8, -1.12), (-1.25, -0.82), (-0.85, -0.42), (-0.55, -0.36), (-0.28, -0.1), (0.0, 0.0)]
    cores = ["agua_funda", "areia", "areia", "terra_seca", "terra_seca", "grama_escura"]
    it.add(varre(cont, 0.0, perfil, cores, fundo=-1.45, fechado=True, nome="margem", liso=True, angulo=30))
    meio = desloca(cont, -2.5, fechado=True)
    m = Malha()
    m.poligono([(x, y, -1.25) for x, y in meio], "agua_funda")
    it.add(m.obj("fundo_lago"))
    ag = desloca(cont, -1.02, fechado=True)
    m = Malha()
    m.poligono([(x, y, Z_L) for x, y in ag], "m:agua")
    it.add(m.obj("agua"))
    it.add(prisma([cb.quadrado(-H, -H, H, H), cont], ZF, 0.0, "grama", "grama_escura", nome="grama"))
    # enfeites
    for x, y, l, cor in ((-4.9, -2.6, 0.75, "cinza"), (-4.5, -3.3, 0.45, "cinza_claro"), (4.6, 3.0, 0.65, "cinza"),
                         (2.2, -4.5, 0.5, "cinza_medio")):
        it.add(pedra(x, y, -0.45, l, l * 0.8, l * 0.6, cor=cor, rot=x * 40))
    it.add(taboas(-4.6, 2.5, -0.55, n=5, seed=1), taboas(4.9, -1.6, -0.55, n=4, seed=2))
    for x, y, fl in ((1.6, 1.8, True), (2.4, 2.4, False), (-1.8, -1.6, False), (-1.0, -2.3, True)):
        it.add(vitoria_regia(x, y, Z_L - 0.005, r=0.34, flor=fl))
    it.add(pato(-0.6, 0.9, Z_L, ang=30), pato(0.1, 0.4, Z_L, ang=60, cor="branco"))
    it.add(arvore(-6.1, 6.0, 0.0, esc=1.1), arvore(6.2, -6.0, 0.0, esc=0.9), moita(6.3, 5.9, 0.0))
    it.add(banco(0.0, -6.7, 0.0, ang=0))
    col = [((0, 0, -1.45), (Q, Q, 0.2)), ((0, -H + 0.85, -1.45), (Q, 1.7, 1.45)), ((0, H - 0.85, -1.45), (Q, 1.7, 1.45)),
           ((-H + 0.85, 0, -1.45), (1.7, Q, 1.45)), ((H - 0.85, 0, -1.45), (1.7, Q, 1.45))]
    return it, dict(rotulo="Lago na grama", grupo="lago", tags=["modular", "agua", "lago", "grama"], colisao=col)


# ---------------------------------------------------------------------------------------------------- orla, cais, mar
Y_ORLA = -2.0  # face da parede da orla (a água vai de Y_ORLA até +7,5)


def calcadao(it, y0, y1):
    """Calçadão em ondas (preto e branco) entre y0 e y1, em z = 0, com período de 3,75 m em x."""
    it.add(cb.laje(cb.quadrado(-H, y0, H, y1), 0.0, "branco", z_fundo=Z_BASE_CANAL))
    larg = 0.32
    for k in range(3):
        yc = y0 + (y1 - y0) * (k + 0.5) / 3
        xs = [-H + 0.03 + (Q - 0.06) * j / 120 for j in range(121)]  # 3 cm de folga: a ponta da faixa não sai da quadra
        pts = [(x, yc + 0.42 * math.cos(2 * math.pi * (x + H) / 3.75)) for x in xs]
        it.add(cb.faixa(pts, larg=larg, cor="grafite", z=0.0, nome="onda"))


def base_orla(it, cais=False):
    calcadao(it, -H, Y_ORLA - MURETA_W)
    # mureta
    e0, e1 = Y_ORLA - MURETA_W, Y_ORLA
    perfil = [(0.0, 0.0), (0.0, 0.64), (0.05, 0.7), (MURETA_W - 0.05, 0.7), (MURETA_W, 0.64), (MURETA_W, -0.85),
              (MURETA_W, Z_FUNDO_CANAL)]
    cores = ["concreto"] * 5 + ["concreto_escuro"]
    # caminho em x, de +H para −H (a direita aponta para +y = água)
    if not cais:
        it.add(varre([(H, e0), (-H, e0)], 0.0, perfil, cores, fundo=Z_BASE_CANAL, nome="mureta"))
    else:
        for xa, xb in ((H, 1.75), (-1.75, -H)):
            it.add(varre([(xa, e0), (xb, e0)], 0.0, perfil, cores, fundo=Z_BASE_CANAL, nome="mureta"))
        # vão do cais: degrau baixo de concreto até a parede (o cais encosta aqui)
        it.add(varre([(1.75, e0), (-1.75, e0)], 0.0, [(0.0, 0.0), (MURETA_W, 0.0), (MURETA_W, -0.85),
                                                      (MURETA_W, Z_FUNDO_CANAL)],
                     ["concreto", "concreto_escuro", "concreto_escuro"], fundo=Z_BASE_CANAL, nome="vao"))
        # cabeceiras arredondadas da mureta no vão
        for sx in (1.0, -1.0):
            it.add(mb.cilindro(MURETA_W / 2 + 0.02, 0.74, x=sx * 1.75, y=(e0 + e1) / 2, z=0.0, cor="concreto", seg=16,
                               bisel=0.04))
    # fundo da água
    it.add(cb.laje(cb.quadrado(-H, Y_ORLA, H, H), Z_FUNDO_CANAL, "agua_funda", z_fundo=Z_BASE_CANAL))
    # pedras do enrocamento no pé da parede
    for k, x in enumerate((-6.2, -4.6, -2.9, 2.6, 4.3, 6.0)):
        it.add(pedra(x, Y_ORLA + 0.45, Z_FUNDO_CANAL - 0.05, 1.1, 0.8, 0.7 + 0.15 * (k % 2),
                     cor=("cinza_medio" if k % 2 else "cinza"), rot=k * 47))
    m = Malha()
    m.poligono([(-H, Y_ORLA, Z_AGUA_CANAL), (H, Y_ORLA, Z_AGUA_CANAL), (H, H, Z_AGUA_CANAL), (-H, H, Z_AGUA_CANAL)],
               "m:agua")
    it.add(m.obj("agua"))


def col_orla():
    return [((0, (-H + Y_ORLA) / 2, Z_BASE_CANAL), (Q, Y_ORLA + H, -Z_BASE_CANAL)),
            ((0, Y_ORLA - MURETA_W / 2, 0.0), (Q, MURETA_W, 0.7)),
            ((0, (Y_ORLA + H) / 2, Z_BASE_CANAL), (Q, H - Y_ORLA, Z_FUNDO_CANAL - Z_BASE_CANAL))]


def p_orla():
    it = mb.Item("orla")
    base_orla(it)
    gc = guarda_corpo([(-H + 0.1, Y_ORLA - MURETA_W / 2, 0.7), (H - 0.1, Y_ORLA - MURETA_W / 2, 0.7)], alt=0.45,
                      travessas=(), fase=0.75, fim=False)
    it.add(gc)
    it.add(poste(-3.75, -6.8, ang=90, braco=1.1, cor="branco"), banco(3.0, -3.6, ang=180))
    it.add(moita(6.4, -6.6, 0.0, esc=0.7))
    return it, dict(rotulo="Orla com calçadão", grupo="orla", tags=["modular", "agua", "orla", "calcada"],
                    colisao=col_orla())


def barquinho(x, y, z, ang=0.0, cor="vermelho", nome="barco"):
    L, W = 3.0, 1.25
    cont = []
    for k in range(24):
        t = 2 * math.pi * k / 24
        cx, cy = math.cos(t), math.sin(t)
        xx = L / 2 * math.copysign(abs(cx) ** 0.8, cx)
        if cx > 0:
            yy = W / 2 * math.copysign(abs(cy) ** 0.7, cy) * (1 - 0.55 * cx ** 3)
        else:
            yy = W / 2 * math.copysign(abs(cy) ** 0.45, cy)
        cont.append((xx, yy))
    cont = ccw(cont)
    casco = mb.extrudado(cont, 0.5, z=0.0, cor=cor, bisel=0.06, seg=1)
    mb.pinta_onde(casco, "branco", lambda c, n: c.z < 0.16 and abs(n.z) < 0.8)
    dentro = mb.extrudado([(p[0] * 0.86, p[1] * 0.8) for p in cont], 0.1, z=0.42, cor="madeira_clara", bisel=0.03, seg=1)
    bancos = [mb.caixa(0.32, W * 0.78, 0.06, x=xx, z=0.4, cor="madeira", bisel=0.015, seg=1) for xx in (-0.55, 0.45)]
    remos = [mb.cilindro(0.025, 1.9, x=0.0, y=sy * 0.5, z=0.55, cor="madeira_mel", eixo="x", seg=6, bisel=0)
             for sy in (-1, 1)]
    ob = mb.junta([casco, dentro] + bancos + remos, nome)
    gira(ob, ang)
    mb.transforma(ob, loc=(x, y, z))
    return ob


def p_cais():
    it = mb.Item("cais")
    base_orla(it, cais=True)
    for xa, xb in ((H - 0.1, 1.95), (-1.95, -H + 0.1)):
        it.add(guarda_corpo([(xa, Y_ORLA - MURETA_W / 2, 0.74), (xb, Y_ORLA - MURETA_W / 2, 0.74)], alt=0.45,
                            travessas=(), fase=0.6, fim=False))
    # píer de madeira: tábuas sobre vigas e estacas, de y = Y_ORLA − 0,3 até 6,8
    y0, y1, w = Y_ORLA - MURETA_W, 6.8, 3.2
    ps = []
    nt = int((y1 - y0) / 0.42)
    for k in range(nt):
        yy = y0 + (k + 0.5) * (y1 - y0) / nt
        cor = "madeira_mel" if k % 3 else "madeira"
        ps.append(mb.caixa(w, (y1 - y0) / nt - 0.04, 0.07, y=yy, z=-0.07, cor=cor, bisel=0.012, seg=1))
    for sx in (-1, 1):
        ps.append(mb.caixa(0.18, y1 - y0 - 0.1, 0.22, x=sx * (w / 2 - 0.3), y=(y0 + y1) / 2 + 0.05, z=-0.29,
                           cor="madeira_escura", bisel=0.02, seg=1))
        for yy in (0.0, 2.3, 4.6, 6.55):
            ps.append(mb.cilindro(0.15, 1.75, x=sx * (w / 2 - 0.3), y=yy, z=-1.82, cor="madeira_escura", seg=8,
                                  bisel=0.0))
    for yy in (1.2, 3.5, 5.8):
        ps.append(mb.caixa(w - 0.4, 0.16, 0.18, y=yy, z=-0.25, cor="madeira_escura", bisel=0.02, seg=1))
    # cabeços de amarração e uma boia salva-vidas
    for sx, yy in ((-1, 6.4), (1, 6.4), (1, 2.6)):
        ps.append(mb.torno([(0, 0), (0.13, 0), (0.1, 0.12), (0.1, 0.24), (0.16, 0.28), (0.15, 0.34), (0, 0.35)],
                           x=sx * (w / 2 - 0.25), y=yy, z=0.0, cor="ferro", seg=10))
    it.add(mb.junta(ps, "pier"))
    # boia no poste
    it.add(mb.cilindro(0.05, 1.3, x=-w / 2 + 0.22, y=3.2, z=0.0, cor="madeira_escura", seg=8))
    boia = mb.torno([(0.2 + 0.09 * math.cos(math.radians(a)), 0.09 * math.sin(math.radians(a))) for a in range(-90, 271, 30)],
                    cor="laranja", seg=20)
    mb.pinta_onde(boia, "branco", lambda c, n: (math.atan2(c.y, c.x) % (math.pi / 2)) < math.pi / 4)
    gira(boia, 90, "X")
    mb.transforma(boia, loc=(-w / 2 + 0.16, 3.2, 0.95))
    it.add(boia)
    it.add(barquinho(3.9, 4.6, Z_AGUA_CANAL - 0.27, ang=88, cor="vermelho"))
    it.add(mb.tubo([(w / 2 - 0.25, 2.6, 0.3), (2.6, 3.4, -0.2), (3.75, 3.5, -0.62)], 0.018, cor="bege", seg=6))
    it.add(poste(-w / 2 + 0.2, 6.55, z0=0.0, ang=0, braco=0.9, alt=3.0, cor="madeira_escura"))
    col = col_orla()[:1] + [((5.0, Y_ORLA - MURETA_W / 2, 0.0), (5.0, MURETA_W, 0.74)),
                             ((-5.0, Y_ORLA - MURETA_W / 2, 0.0), (5.0, MURETA_W, 0.74)),
                             ((0, (y0 + y1) / 2, -0.32), (w, y1 - y0, 0.32)), col_orla()[2]]
    return it, dict(rotulo="Cais de madeira com barco", grupo="cais", tags=["modular", "agua", "orla", "pier"],
                    colisao=col)


def p_agua_aberta():
    it = mb.Item("agua_aberta")
    it.add(cb.laje(cb.quadrado(-H, -H, H, H), Z_FUNDO_CANAL, "agua_funda", z_fundo=Z_BASE_CANAL))
    m = Malha()
    m.poligono([(-H, -H, Z_AGUA_CANAL), (H, -H, Z_AGUA_CANAL), (H, H, Z_AGUA_CANAL), (-H, H, Z_AGUA_CANAL)], "m:agua")
    it.add(m.obj("agua"))
    # boias de sinalização
    for x, y, cor in ((-3.0, 2.5, "vermelho"), (3.5, -2.0, "verde")):
        b = mb.torno([(0, 0), (0.32, 0), (0.36, 0.25), (0.2, 0.5), (0.08, 1.1), (0.0, 1.15)], x=x, y=y,
                     z=Z_AGUA_CANAL - 0.2, cor=cor, seg=16)
        mb.pinta_onde(b, "branco", lambda c, n: 0.05 < c.z - (Z_AGUA_CANAL - 0.2) < 0.25)
        it.add(b)
        it.add(mb.esfera(0.09, x=x, y=y, z=Z_AGUA_CANAL + 1.0, cor=None, mat="luz", seg=10))
    col = [((0, 0, Z_BASE_CANAL), (Q, Q, Z_FUNDO_CANAL - Z_BASE_CANAL))]
    return it, dict(rotulo="Água aberta", grupo="agua_aberta", tags=["modular", "agua", "orla"], colisao=col)


def p_comporta():
    """Comporta de canal: pórtico de concreto sobre as muretas, comporta de aço que sobe (correr), passarela."""
    it = mb.Item("comporta_canal")
    p, c = perfil_canal()
    cam = caminho_reto()
    it.add(varre(cam, 0.0, p, c, fundo=Z_BASE_CANAL, nome="canal"))
    calcadas_canal(it, False)
    it.add(agua_secao(cam, CANAL_W, Z_AGUA_CANAL))
    w = CANAL_W
    # pilares do pórtico (com ranhura da comporta), apoiados nas muretas e na calçada
    ps = []
    for sx in (-1, 1):
        ps.append(mb.caixa(1.5, 2.2, 4.2, x=sx * (w + 0.55), y=0.0, z=-1.75, cor="concreto", bisel=0.08))
        ps.append(mb.caixa(1.7, 2.4, 0.3, x=sx * (w + 0.55), y=0.0, z=2.45, cor="concreto_escuro", bisel=0.06))
        ps.append(mb.caixa(0.22, 0.34, 4.0, x=sx * (w - 0.08), y=0.0, z=-1.7, cor="grafite", bisel=0.02))
    # viga e passarela no alto
    ps.append(mb.caixa(2 * w + 2.6, 1.6, 0.45, x=0, y=0.0, z=2.75, cor="concreto", bisel=0.06))
    it.add(mb.junta(ps, "portico"))
    for sy in (-0.72, 0.72):
        it.add(guarda_corpo([(-w - 1.2, sy, 3.2), (w + 1.2, sy, 3.2)], alt=1.0, passo=1.2, cor="amarelo", fase=0.4,
                            travessas=(0.5,)))
    # mecanismo: caixa amarela + volante vermelho
    mec = [mb.caixa(1.4, 0.9, 0.7, x=0, y=0.0, z=3.2, cor="amarelo", bisel=0.08, seg=2),
           mb.caixa(1.5, 1.0, 0.08, x=0, y=0.0, z=3.9, cor="grafite", bisel=0.03, seg=1)]
    vol = mb.torno([(0.38 + 0.05 * math.cos(math.radians(a)), 0.05 * math.sin(math.radians(a))) for a in range(-90, 271, 60)],
                   cor="vermelho", seg=16)
    raios = [mb.caixa(0.76, 0.04, 0.04, z=-0.02, cor="vermelho", bisel=0.0, seg=1) for _ in range(2)]
    gira(raios[1], 90)
    vol = mb.junta([vol] + raios + [mb.cilindro(0.06, 0.12, z=-0.06, cor="grafite", seg=10)], "volante")
    gira(vol, 90, "X")
    mb.transforma(vol, loc=(0.0, -0.62, 3.6))
    mec.append(vol)
    mec.append(mb.cilindro(0.06, 0.25, x=0, y=-0.48, z=3.6, cor="grafite", eixo="y", seg=10))
    it.add(mb.junta(mec, "mecanismo"))
    # hastes de içamento
    for sx in (-1.6, 1.6):
        it.add(mb.cilindro(0.07, 3.1, x=sx, y=0.0, z=0.15, cor="metal", seg=10))
    # comporta (interativa: sobe 1,6 m)
    gp = [mb.caixa(2 * w + 0.12, 0.26, 2.2, x=0, y=0.0, z=-1.7, cor="cinza_azulado", bisel=0.03, seg=1)]
    for k in range(4):
        gp.append(mb.caixa(2 * w + 0.0, 0.34, 0.12, x=0, y=0.0, z=-1.45 + 0.55 * k, cor="metal_escuro", bisel=0.02,
                           seg=1))
    for k in range(9):
        gp.append(mb.caixa(0.24, 0.06, 0.32, x=-w + 0.5 + k * (2 * w - 1.0) / 8, y=-0.17, z=0.14,
                           cor=("amarelo" if k % 2 else "preto"), bisel=0.01, seg=1))
    it.correr(gp, direcao=(0, 0, 1), curso=1.6, nome="comporta")
    it.add(placa_aviso(-6.3, -1.8, 0.0, ang=0))
    col = colisao_canal_reto()[:4] + [((0, 0, Z_BASE_CANAL), (2 * w, Q, Z_FUNDO_CANAL - Z_BASE_CANAL)),
                                      ((0, 0, -1.75), (2 * w + 2.6, 2.4, 1.75 + 3.2)),
                                      ((0, 0, -1.7), (2 * w, 0.3, 2.2))]
    return it, dict(rotulo="Comporta de canal", grupo="comporta", tags=["modular", "agua", "canal", "interativo"],
                    colisao=col, dir_mini=DIR_MEIO)


# ---------------------------------------------------------------------------------------------------- represa
Y_RES0, Y_CRISTA, Y_PE, Y_RAMPA0, Y_RAMPA1 = 19.2, 5.5, -12.0, -14.0, 3.0
Z_TOPO_REP, Z_SOLEIRA, Z_AGUA_RES, Z_FUNDO_RES = 6.0, 5.2, 5.35, 3.8


def z_parede(y):
    """Altura do passeio no alto das paredes laterais da represa."""
    return Z_TOPO_REP * smooth((y - Y_RAMPA0) / (Y_RAMPA1 - Y_RAMPA0))


def z_vertedouro(y):
    """Perfil do vertedouro (ogiva): sobe do pé (Y_PE, fundo do canal) até a soleira (Y_CRISTA)."""
    if y <= Y_PE:
        return Z_FUNDO_CANAL
    if y >= Y_CRISTA:
        return Z_SOLEIRA
    u = (y - Y_PE) / (Y_CRISTA - Y_PE)
    # curva em S: topo arredondado na soleira e pé côncavo na bacia
    return Z_FUNDO_CANAL + (Z_SOLEIRA - Z_FUNDO_CANAL) * smooth(u) ** 0.85


def p_represa():
    it = mb.Item("represa")
    L = 22.5
    w, mw, mh = CANAL_W, MURETA_W, MURETA_H
    e = w + mw
    ys = sorted(set([-L + k * 0.75 for k in range(int(2 * L / 0.75) + 1)] + [Y_PE, Y_CRISTA, 7.5, 7.5, Y_RES0, Y_RES0,
                                                                              Y_RAMPA0, Y_RAMPA1, L]))
    # estações duplicadas nos degraus (7,5: soleira → fundo do reservatório; Y_RES0: fundo → parede do fundo)
    est = []
    for y in ys:
        est.append(y)
        if abs(y - 7.5) < 1e-6 or abs(y - Y_RES0) < 1e-6:
            est.append(y)
    est = [y for y in est if -L - 1e-6 <= y <= L + 1e-6]
    est[0], est[-1] = -L, L
    seen = {}
    estacoes = []  # (y, z_fundo_do_canal)
    for y in est:
        seen[y] = seen.get(y, 0) + 1
        if abs(y - 7.5) < 1e-6:
            zf = Z_SOLEIRA if seen[y] == 1 else Z_FUNDO_RES
        elif abs(y - Y_RES0) < 1e-6:
            zf = Z_FUNDO_RES if seen[y] == 1 else Z_TOPO_REP
        elif y > Y_RES0:
            zf = Z_TOPO_REP
        elif y > 7.5:
            zf = Z_FUNDO_RES
        else:
            zf = z_vertedouro(y)
        estacoes.append((y, zf))
    cam = [(0.0, y) for y, _ in estacoes]

    def perfil(i):
        y, zf = estacoes[i]
        zw = z_parede(y)
        zm = zw + mh
        zwet = min(max(zf, -0.85), zm - 0.3) if y < Y_CRISTA else min(Z_AGUA_RES - 0.1, zm - 0.3)
        zwet = max(zwet, zf)
        return [(-H, zw), (-e, zw), (-e, zm - 0.06), (-e + 0.05, zm), (-w - 0.05, zm), (-w, zm - 0.06), (-w, zwet),
                (-w, zf), (w, zf), (w, zwet), (w, zm - 0.06), (w + 0.05, zm), (e - 0.05, zm), (e, zm - 0.06), (e, zw),
                (H, zw)]

    def cores(i):
        y, zf = estacoes[i]
        y2 = estacoes[min(i + 1, len(estacoes) - 1)][0]
        if y >= Y_RES0 - 1e-6 and y2 > Y_RES0 + 1e-6 - 1e-3:
            fundo_c = "concreto_escuro"
        elif y >= 7.5:
            fundo_c = "agua_funda"
        elif y >= Y_PE:
            fundo_c = "concreto"
        else:
            fundo_c = "agua_funda"
        alto = z_parede(y) > 0.05 or z_parede(y2) > 0.05
        piso = "concreto_escuro" if alto else "calcada"
        mu = "cinza_medio" if alto else "concreto"
        return [piso, mu, mu, mu, mu, "concreto_escuro", "concreto_escuro", fundo_c, "concreto_escuro",
                "concreto_escuro", mu, mu, mu, mu, piso]

    corpo = varre(cam, 0.0, perfil, cores, fundo=Z_BASE_CANAL, lado="grafite", base="grafite", tang=(0, 1), nome="represa")
    it.add(corpo)
    # água: reservatório, lâmina no vertedouro e bacia
    m = Malha()
    m.poligono([(-w, Y_CRISTA, Z_AGUA_RES), (w, Y_CRISTA, Z_AGUA_RES), (w, Y_RES0, Z_AGUA_RES), (-w, Y_RES0, Z_AGUA_RES)],
               "m:agua")
    it.add(m.obj("reservatorio"))
    ylam = [Y_CRISTA - k * 0.25 for k in range(200)]
    ylam = [y for y in ylam if z_vertedouro(y) + 0.13 > Z_AGUA_CANAL - 0.06]
    lam = [(0.0, y) for y in ylam]
    zl = [z_vertedouro(y) + 0.14 + (Z_AGUA_RES - Z_SOLEIRA - 0.14) * smooth((y - (Y_CRISTA - 1.5)) / 1.5) for y in ylam]
    it.add(varre(lam, zl, [(w, 0.0), (-w, 0.0)], ["m:agua"], tang=(0, -1), nome="lamina"))
    # espuma: riscos curtos e irregulares na lâmina, crista branca na soleira e bolhas no pé
    rs = []
    for k in range(22):
        xo = -3.7 + ((k * 0.61803) % 1.0) * 7.4
        y0 = Y_CRISTA - 1.2 - ((k * 0.37) % 1.0) * 14.5
        lg = 0.7 + ((k * 0.73) % 1.0) * 1.3
        trecho = [y for y in ylam if y0 - lg <= y <= y0]
        if len(trecho) > 1 and min(trecho) > Y_PE + 0.8:
            rs.append(tira([(xo, y) for y in trecho], [z_vertedouro(y) + 0.145 for y in trecho], 0.0,
                           0.1 + 0.12 * ((k * 0.29) % 1.0), cor=("branco" if k % 3 else "azul_bebe"), dz=0.012))
    rs.append(tira([(-w, Y_CRISTA - 0.15), (w, Y_CRISTA - 0.15)], Z_AGUA_RES + 0.0, 0.0, 0.22, cor="branco", dz=0.01))
    it.add(mb.junta([r for r in rs if r], "espuma"))
    for k in range(9):
        x = -3.4 + k * 0.85
        y = Y_PE + 0.6 + 0.9 * ((k * 7) % 3)
        it.add(mb.superelipsoide(1.0 - 0.15 * (k % 3), 0.8, 0.45, x=x, y=y, z=Z_AGUA_CANAL - 0.22,
                                 cor=("branco" if k % 2 else "azul_bebe"), e=0.9, e_v=0.8, nu=12, nv=6))
    m = Malha()
    m.poligono([(-w, -L, Z_AGUA_CANAL), (w, -L, Z_AGUA_CANAL), (w, Y_PE + 3.0, Z_AGUA_CANAL), (-w, Y_PE + 3.0, Z_AGUA_CANAL)],
               "m:agua")
    it.add(m.obj("bacia"))
    # torres das comportas sobre as paredes, passarela, pilares e comportas
    ps = []
    for sx in (-1, 1):
        ps.append(mb.caixa(2.8, 4.0, 3.2, x=sx * 5.85, y=6.3, z=Z_TOPO_REP, cor="concreto", bisel=0.1))
        ps.append(mb.caixa(3.1, 4.3, 0.35, x=sx * 5.85, y=6.3, z=Z_TOPO_REP + 3.2, cor="vermelho_escuro", bisel=0.1))
        ps.append(mb.caixa(2.3, 3.5, 0.3, x=sx * 5.85, y=6.3, z=Z_TOPO_REP + 3.5, cor="vermelho_escuro", bisel=0.1))
        for yy in (5.4, 7.2):
            ps.append(mb.caixa(0.06, 0.8, 0.9, x=sx * 7.25, y=yy, z=Z_TOPO_REP + 1.6, cor="branco", bisel=0.02, seg=1))
            ps.append(mb.caixa(0.04, 0.66, 0.76, x=sx * 7.28, y=yy, z=Z_TOPO_REP + 1.67, cor=None, mat="vidro",
                               bisel=0.01, seg=1))
        ps.append(mb.caixa(1.0, 0.06, 2.0, x=sx * 5.85, y=4.28, z=Z_TOPO_REP, cor="petroleo", bisel=0.02, seg=1))
    for sx in (-1, 1):
        ps.append(mb.caixa(0.5, 2.6, Z_TOPO_REP + 2.0 - Z_SOLEIRA, x=sx * 1.45, y=6.4, z=Z_SOLEIRA, cor="concreto",
                           bisel=0.12))
    ps.append(mb.caixa(2 * w + 0.4, 1.9, 0.42, x=0, y=6.4, z=Z_TOPO_REP + 2.0, cor="concreto", bisel=0.06))
    it.add(mb.junta(ps, "torres"))
    for sy in (5.55, 7.25):
        it.add(guarda_corpo([(-w - 0.2, sy, Z_TOPO_REP + 2.42), (w + 0.2, sy, Z_TOPO_REP + 2.42)], alt=1.0, passo=1.4,
                            cor="amarelo", fase=0.35))
    # comportas (3 vãos) erguidas: a água passa por baixo; interativas (descem 0,55 m)
    vaos = [(-w, -1.7), (-1.2, 1.2), (1.7, w)]
    for k, (xa, xb) in enumerate(vaos):
        gp = [mb.caixa(xb - xa + 0.08, 0.28, 1.6, x=(xa + xb) / 2, y=6.4, z=Z_AGUA_RES + 0.5, cor="amarelo", bisel=0.03)]
        for j in range(3):
            gp.append(mb.caixa(xb - xa - 0.1, 0.36, 0.1, x=(xa + xb) / 2, y=6.4, z=Z_AGUA_RES + 0.75 + 0.5 * j,
                               cor="amarelo_escuro", bisel=0.02))
        gp.append(mb.cilindro(0.06, Z_TOPO_REP + 2.0 - (Z_AGUA_RES + 2.1), x=(xa + xb) / 2, y=6.4, z=Z_AGUA_RES + 2.1,
                              cor="metal", seg=8))
        it.correr(gp, direcao=(0, 0, -1), curso=0.5, nome=f"comporta_{k + 1}")
        it.add(mb.caixa(0.9, 0.9, 0.55, x=(xa + xb) / 2, y=6.4, z=Z_TOPO_REP + 2.42, cor="grafite", bisel=0.06))
        vol = mb.torno([(0.28 + 0.04 * math.cos(math.radians(a)), 0.04 * math.sin(math.radians(a))) for a in range(-90, 271, 45)],
                       cor="vermelho", seg=16)
        gira(vol, 90, "X")
        mb.transforma(vol, loc=((xa + xb) / 2, 5.92, Z_TOPO_REP + 2.7))
        it.add(vol)
    # guarda-corpos dos passeios (lado de fora e em cima da mureta interna), acompanhando a rampa
    ysg = [y for y in [Y_RAMPA0 + 2.4 + k * 0.9 for k in range(40)] if y <= L - 0.1] + [L - 0.08]
    for sx in (-1, 1):
        it.add(guarda_corpo([(sx * (H - 0.12), y, z_parede(y)) for y in ysg], alt=1.1, passo=1.5, cor="metal",
                            fase=0.5, travessas=(0.55,)))
        it.add(guarda_corpo([(sx * (w + mw / 2), y, z_parede(y) + mh) for y in ysg if y < 4.2], alt=0.5, passo=1.5,
                            cor="metal", fase=0.5, travessas=()))
    it.add(guarda_corpo([(-w, Y_RES0 + 0.15, Z_TOPO_REP), (w, Y_RES0 + 0.15, Z_TOPO_REP)], alt=1.1, passo=1.4,
                        cor="metal", fase=0.7))
    # boias de contenção no reservatório
    bo = [mb.tubo([(-w, 11.0, Z_AGUA_RES + 0.04), (w, 11.0, Z_AGUA_RES + 0.04)], 0.02, cor="bege", seg=6)]
    for k in range(9):
        bo.append(mb.esfera(0.16, x=-w + 0.45 + k * (2 * w - 0.9) / 8, y=11.0, z=Z_AGUA_RES + 0.02,
                            cor=("laranja" if k % 2 == 0 else "branco"), esc=(1, 1, 0.8), seg=12))
    it.add(mb.junta(bo, "boias"))
    # postes nos passeios
    it.add(poste(-6.6, 14.0, z0=Z_TOPO_REP, ang=0, braco=1.6), poste(6.6, -2.0, z0=z_parede(-2.0), ang=180, braco=1.6))
    it.add(placa_aviso(6.4, -17.5, 0.0, ang=180))
    col = [((-(H + e) / 2, 8.25, Z_BASE_CANAL), (H - e, 28.5, Z_TOPO_REP - Z_BASE_CANAL)),
           (((H + e) / 2, 8.25, Z_BASE_CANAL), (H - e, 28.5, Z_TOPO_REP - Z_BASE_CANAL)),
           ((-(H + e) / 2, -14.0, Z_BASE_CANAL), (H - e, 17.0, 2.0 - Z_BASE_CANAL)),
           (((H + e) / 2, -14.0, Z_BASE_CANAL), (H - e, 17.0, 2.0 - Z_BASE_CANAL)),
           ((0, (Y_RES0 + L) / 2, Z_BASE_CANAL), (2 * w, L - Y_RES0, Z_TOPO_REP - Z_BASE_CANAL)),
           ((0, (7.5 + Y_RES0) / 2, Z_BASE_CANAL), (2 * w, Y_RES0 - 7.5, Z_FUNDO_RES - Z_BASE_CANAL)),
           ((0, (Y_PE + 7.5) / 2, Z_BASE_CANAL), (2 * w, 7.5 - Y_PE, 2.0 - Z_BASE_CANAL)),
           ((0, (-L + Y_PE) / 2, Z_BASE_CANAL), (2 * w, Y_PE + L, Z_FUNDO_CANAL - Z_BASE_CANAL)),
           ((0, 6.4, Z_TOPO_REP + 2.0), (2 * w + 0.4, 1.9, 0.42)),
           ((0, 6.3, Z_TOPO_REP), (Q, 4.3, 3.55))]
    return it, dict(rotulo="Represa com vertedouro", grupo="represa", tags=["agua", "represa", "canal", "grande"],
                    colisao=col, dir_mini=(0.9, -1.0, 0.75))


# ======================================================================================================================
# ESTRUTURAS (abaixo)
# ======================================================================================================================
Z_VIA = 7.5      # calçada do tabuleiro (altura combinada com as pontes: asfalto em 7,40)
E_LAJE = 1.3     # tabuleiro sob a pista (vão livre de 6,2 m)
E_BORDA = 1.5    # viga de borda (cornija)
E_LACO = 0.6     # laje das alças do trevo
EXTRA_ELEV = {"z_elevado": Z_VIA}


def anel_tabuleiro(perfil, zrel_fundo=None):
    """Seção do tabuleiro (z relativo à calçada). Sem zrel_fundo: laje com vigas de borda; com: aterro até o fundo."""
    m = perfil["mf"]
    topo = [(-H, 0.0), (-m, 0.0), (-m, -0.10), (m, -0.10), (m, 0.0), (H, 0.0)]
    ct = ["calcada", "calcada", "asfalto", "calcada", "calcada"]
    if zrel_fundo is None:
        resto = [(H, -E_BORDA + 0.08), (H - 0.06, -E_BORDA), (H - 0.5, -E_BORDA), (H - 0.62, -E_LAJE),
                 (-(H - 0.62), -E_LAJE), (-(H - 0.5), -E_BORDA), (-(H - 0.06), -E_BORDA), (-H, -E_BORDA + 0.08)]
        cr = ["concreto", "concreto", "concreto", "concreto_escuro", "concreto_escuro", "concreto_escuro", "concreto",
              "concreto", "concreto"]
    else:
        fb = -min(E_BORDA - 0.08, -zrel_fundo * 0.5)
        resto = [(H, fb), (H, zrel_fundo), (-H, zrel_fundo), (-H, fb)]
        cr = ["concreto", "concreto_escuro", "concreto_escuro", "concreto_escuro", "concreto"]
    return topo + resto, ct + cr


def marcacoes3(perfil, cam, z_asf, fase=0.0):
    a = perfil["asf"]
    out = []
    if perfil["faixas"] == 2:
        out.append(tira(cam, z_asf, 0.0, cb.LARG_FAIXA, tracejada=(2.5, 2.5), fase=fase))
    else:
        out += [tira(cam, z_asf, -0.12, cb.LARG_FAIXA), tira(cam, z_asf, 0.12, cb.LARG_FAIXA)]
        out += [tira(cam, z_asf, o, cb.LARG_FAIXA, tracejada=(2.5, 2.5), fase=fase) for o in (-a / 2 + 0.06, a / 2 - 0.06)]
    out += [tira(cam, z_asf, -a + 0.3, 0.12), tira(cam, z_asf, a - 0.3, 0.12)]
    return [o for o in out if o]


def mureta_via(cam, zs, lado, tang=None):
    """Mureta baixa de concreto (0,35 m) na borda do tabuleiro; lado −1 = esquerda (off −7,5..−7,2)."""
    if lado < 0:
        pf = [(-H, 0.0), (-H, 0.29), (-H + 0.05, 0.35), (-H + 0.25, 0.35), (-H + 0.3, 0.29), (-H + 0.3, 0.0)]
    else:
        pf = [(H - 0.3, 0.0), (H - 0.3, 0.29), (H - 0.25, 0.35), (H - 0.05, 0.35), (H, 0.29), (H, 0.0)]
    zb = [z - 0.03 for z in zs] if isinstance(zs, (list, tuple)) else zs - 0.03
    return varre(cam, zs, pf, ["concreto"] * 5, fundo=zb, lado="concreto", base="concreto", tang=tang, nome="mureta")


def guarda_via(it, cam, zs, inicio=0):
    """Mureta + guarda-corpo de metal (topo a 1,1 m da calçada) nos dois lados do tabuleiro."""
    zs = zs if isinstance(zs, (list, tuple)) else [zs] * len(cam)
    c, z = cam[inicio:], zs[inicio:]
    if len(c) > 6:  # caminho denso (rampa): uma estação a cada ~1,5 m basta para a mureta e o guarda-corpo
        idx = list(range(0, len(c), 3))
        if idx[-1] != len(c) - 1:
            idx.append(len(c) - 1)
        c, z = [c[i] for i in idx], [z[i] for i in idx]
    fase = (0.75 - (c[0][1] + H)) % 1.5
    for lado in (-1, 1):
        it.add(mureta_via(c, z, lado))
        linha = desloca(c, lado * (H - 0.15))
        pts = [V((x, y, zz + 0.35)) for (x, y), zz in zip(linha, z)]
        pts[0] = pts[0] + (pts[1] - pts[0]).normalized() * 0.03
        pts[-1] = pts[-1] + (pts[-2] - pts[-1]).normalized() * 0.03
        it.add(guarda_corpo(pts, alt=0.75, passo=1.5, cor="metal", fase=fase, travessas=(0.38,), fim=False,
                            r_post=0.035, r_tubo=0.04))


def tabuleiro_reto(it, perfil, y0=-H, y1=H, z=Z_VIA):
    cam = [(0.0, y0), (0.0, y1)]
    pf, cs = anel_tabuleiro(perfil)
    it.add(varre(cam, z, pf, cs, anel=True, tang=(0, 1), nome="tabuleiro"))
    m = perfil["mf"]
    for o in (-m, m):
        it.add(sobe(cb.meio_fio([(o, y1), (o, y0)] if o < 0 else [(o, y0), (o, y1)]), z))
    it.add([sobe(o, z) for o in cb.marcacoes_reta(perfil, y0, y1)])
    guarda_via(it, reamostra(cam, 3.0), z)


def pilar_martelo(x=0.0, y=0.0, z_topo=Z_VIA - E_LAJE, larg=12.0, ang=0.0, cor="concreto", nome="pilar"):
    """Pilar de viaduto com travessa em martelo (a travessa corre em X; gire com ang)."""
    zt = z_topo + 0.02
    ps = [mb.extrudado(mb.ret_arredondado(2.7, 1.9, 0.35, seg=4), 0.3, z=-0.12, cor="concreto_escuro", bisel=0.06,
                       seg=2),
          mb.extrudado(mb.ret_arredondado(2.0, 1.2, 0.45, seg=5), zt - 1.0, z=0.1, cor=cor, bisel=0.05, seg=2)]
    cap = [(-larg / 2, zt), (larg / 2, zt), (larg / 2, zt - 0.4), (larg / 2 - 0.4, zt - 0.62), (1.35, zt - 1.25),
           (-1.35, zt - 1.25), (-larg / 2 + 0.4, zt - 0.62), (-larg / 2, zt - 0.4)]
    ps.append(mb.extrudado(ccw(cap), 1.6, y=-0.8, cor=cor, bisel=0.08, seg=2, plano="xz"))
    ob = mb.junta(ps, nome)
    gira(ob, ang)
    mb.transforma(ob, loc=(x, y, 0.0))
    return ob


def pilar_redondo(x=0.0, y=0.0, z_topo=Z_VIA - E_LAJE, r=0.55, nome="pilar_redondo"):
    zt = z_topo + 0.02
    ps = [mb.cilindro(r + 0.35, 0.28, x=x, y=y, z=-0.12, cor="concreto_escuro", seg=20, bisel=0.05),
          mb.cilindro(r, zt - 0.8, x=x, y=y, z=0.1, cor="concreto", seg=20, bisel=0.0),
          mb.torno([(r, 0.0), (r + 0.1, 0.25), (r + 0.75, 0.62), (r + 0.75, 0.72), (0, 0.72)], x=x, y=y, z=zt - 0.72,
                   cor="concreto", seg=20)]
    return mb.junta(ps, nome)


def p_viaduto(perfil, pilar=True):
    nome = "viaduto_" + perfil["nome"] + ("" if pilar else "_vao")
    it = mb.Item(nome)
    tabuleiro_reto(it, perfil)
    if pilar:
        it.add(pilar_martelo(0.0, 0.0))
    it.add(poste(H - 0.65, 0.0, z0=Z_VIA, ang=180, braco=1.8))
    col = [((0, 0, Z_VIA - E_LAJE), (Q, Q, E_LAJE)), ((-H + 0.15, 0, Z_VIA), (0.3, Q, 1.1)),
           ((H - 0.15, 0, Z_VIA), (0.3, Q, 1.1))]
    if pilar:
        col += [((0, 0, 0.0), (2.0, 1.2, Z_VIA - E_LAJE - 1.0)), ((0, 0, Z_VIA - E_LAJE - 1.25), (12.0, 1.6, 1.25))]
    rot = {"rua": "rua", "avenida": "avenida"}[perfil["nome"]]
    rotulo = f"Viaduto de {rot}" + ("" if pilar else " (vão livre, sem pilar)")
    return it, dict(rotulo=rotulo, grupo="viaduto_" + perfil["nome"], tags=["modular", perfil["nome"], "viaduto",
                                                                            "elevada"],
                    colisao=col, dir_mini=DIR_ALTO,
                    extra={**EXTRA_ELEV, "vao_livre": Z_VIA - E_LAJE})


def h_rampa(y, y0=-Q, y1=Q):
    return Z_VIA * smooth((y - y0) / (y1 - y0))


def colisao_rampa(perfil, passo=2.5):
    """Malha de colisão da rampa: o aterro com o topo inclinado (calçadas e o asfalto 0,10 abaixo) até o fundo da
    laje, em estações de 2,5 m, e as duas muretas com guarda-corpo (1,10 m) onde a rampa já saiu do chão."""
    m_ = perfil["mf"]
    ys = [-Q + passo * k for k in range(int(round(2 * Q / passo)) + 1)]
    zs = [h_rampa(y) for y in ys]
    cam = [(0.0, y) for y in ys]
    m = Malha()
    topo = [(-H, 0.0), (-m_, 0.0), (-m_, -0.10), (m_, -0.10), (m_, 0.0), (H, 0.0)]
    varre(cam, zs, topo, ["asfalto"] * 5, fundo=ZF, lado="asfalto", base="asfalto", tang=(0, 1), m=m)
    i0 = next(i for i, z in enumerate(zs) if z >= 0.06)
    for lado in (-1, 1):
        x0, x1 = sorted((lado * (H - 0.3), lado * H))
        varre(cam[i0:], zs[i0:], [(x0, 1.1), (x1, 1.1)], ["asfalto"], fundo=zs[i0:], lado="asfalto", base="asfalto",
              tang=(0, 1), m=m)
    return m.obj("colisao_rampa")


def p_rampa(perfil):
    it = mb.Item("rampa_viaduto_" + perfil["nome"])
    ys = [-Q + 0.5 * k for k in range(61)]
    cam = [(0.0, y) for y in ys]
    zs = [h_rampa(y) for y in ys]

    def pf(i):
        return anel_tabuleiro(perfil, zrel_fundo=ZF - zs[i])[0]

    cs = anel_tabuleiro(perfil, zrel_fundo=-1.0)[1]
    it.add(varre(cam, zs, pf, cs, anel=True, tang=(0, 1), nome="rampa"))
    m = perfil["mf"]
    for o in (-m, m):
        c = [(o, y) for y in ys[::2]]
        it.add(varre(c, zs[::2], [(-0.10, -0.12), (-0.10, 0.03), (-0.07, 0.085), (0.0, 0.10), (0.07, 0.085), (0.10, 0.03),
                             (0.10, -0.12)], ["calcada"] * 6, tang=(0, 1), nome="meio_fio", liso=True, angulo=50))
    it.add(marcacoes3(perfil, cam, [z - 0.10 for z in zs], fase=-Q))
    i0 = next(i for i, z in enumerate(zs) if z >= 0.06)
    guarda_via(it, cam, zs, inicio=i0)
    # juntas de dilatação pintadas nas paredes do aterro (frisos rasos, dentro da quadra)
    for y in (-5.0, 0.0, 5.0, 10.0):
        zt = h_rampa(y) - 0.8
        if zt > 0.4:
            for sx in (-1, 1):
                it.add(mb.caixa(0.02, 0.12, zt - ZF, x=sx * (H - 0.012), y=y, z=ZF, cor="concreto", bisel=0.0, seg=1))
    # colisão: a laje até a calçada (z = 0) em caixa; o aterro inclinado em malha (sem degraus)
    it.colisao_malha(colisao_rampa(perfil), "colisao_rampa")
    col = [((0, 0, ZF), (Q, 2 * Q, -ZF))]
    perfil_alt = [[round(y, 2), round(h_rampa(y), 3)] for y in [-Q + 2.5 * k for k in range(13)]]
    return it, dict(rotulo=f"Rampa de viaduto ({'rua' if perfil['nome'] == 'rua' else 'avenida'})",
                    grupo="rampa_viaduto", tags=["modular", perfil["nome"], "viaduto", "rampa"], colisao=col,
                    dir_mini=(1.0, -0.9, 0.6), extra={**EXTRA_ELEV, "perfil_altura_y": perfil_alt})


def p_pilar():
    it = mb.Item("pilar_viaduto")
    it.add(pilar_martelo(0.0, 0.0))
    col = [((0, 0, -0.12), (2.7, 1.9, 0.3)), ((0, 0, 0.0), (2.0, 1.2, Z_VIA - E_LAJE - 1.0)),
           ((0, 0, Z_VIA - E_LAJE - 1.25), (12.0, 1.6, 1.27))]
    return it, dict(rotulo="Pilar de viaduto (martelo)", grupo="pilar_viaduto", tags=["viaduto", "pilar"], colisao=col,
                    dir_mini=DIR_ALTO, extra={**EXTRA_ELEV, "altura_apoio": Z_VIA - E_LAJE})


def p_pilar_redondo():
    it = mb.Item("pilar_viaduto_redondo")
    it.add(pilar_redondo(0.0, 0.0))
    col = [((0, 0, 0.0), (1.1, 1.1, Z_VIA - E_LAJE)), ((0, 0, Z_VIA - E_LAJE - 0.7), (2.6, 2.6, 0.72))]
    return it, dict(rotulo="Pilar de viaduto (redondo)", grupo="pilar_viaduto", tags=["viaduto", "pilar"], colisao=col,
                    dir_mini=DIR_ALTO, extra={**EXTRA_ELEV, "altura_apoio": Z_VIA - E_LAJE})


# ---------------------------------------------------------------------------------------------------- trevo
# 5 × 5 quadras (75 × 75 m). A avenida do chão (em Y) e a elevada (em X, calçada em z = 7,5) se cruzam no centro da
# peça, na quadra do meio: num 4 × 4 o centro cai na divisa entre quadras e as pontas sairiam da grade de 15 m.
# Dois laços em rotação de 180°: o do quadrante sudeste leva quem segue para leste na elevada até a pista norte do
# chão (o do noroeste, quem segue para oeste até a pista sul). A alça desce 7,5 m em ~80 m de eixo: reta para leste
# junto do tabuleiro, laço de 270° de raio 12 m e reta para o norte até pousar no chão, com rampa constante e
# concordâncias parabólicas nas pontas (inclinação máxima no eixo ~10 %).
TRV = 37.5            # meia largura do trevo (5 × 5 quadras)
LR = 12.0             # raio do eixo do laço
LA, LB = 1.8, 2.05    # meia largura do asfalto da alça e da borda externa da barreira
Y_S1 = -9.8           # eixo do trecho reto que sai do tabuleiro, correndo para leste
X_S1 = 6.5            # onde a alça se separa do tabuleiro (logo depois da avenida do chão)
X_N = 9.4             # eixo do trecho que volta para o norte e vira a faixa do chão
LC = (X_N + LR, Y_S1 - LR)   # centro do laço do quadrante sudeste (21,4; −21,8)
Y_POUSO = -13.5       # a alça chega ao chão (asfalto em −0,10) aqui
L_TRANS = 6.0         # comprimento das concordâncias verticais (no alto e no pé)
X_TAPER = -10.0       # o tabuleiro começa a alargar aqui (faixa de desaceleração até a saída)
Z_ALCA0, Z_ALCA1 = Z_VIA - 0.10, cb.Z_ASF


def faixa_reta(p0, p1, larg=cb.LARG_FAIXA, z=cb.Z_ASF, tracejada=None, fase=0.0, cor="branco"):
    """Faixa pintada reta com um quadrilátero por traço (o cb.faixa reamostra a cada 0,25 m, o que pesa nas linhas
    de 75 m do trevo). Tracejado igual ao do cb.faixa: traço centrado em s = −fase + k·período."""
    a, b = V((p0[0], p0[1])), V((p1[0], p1[1]))
    L = (b - a).length
    d = (b - a) / L
    n = V((-d.y, d.x)) * (larg / 2)
    if tracejada:
        tr, vao = tracejada
        per = tr + vao
        k0 = math.floor((fase - tr) / per)
        trechos = [(max(0.0, -fase + k * per - tr / 2), min(L, -fase + k * per + tr / 2))
                   for k in range(k0, k0 + int(L / per) + 3)]
        trechos = [(u, v) for u, v in trechos if v - u > 0.05]
    else:
        trechos = [(0.0, L)]
    m = Malha()
    for u, v in trechos:
        q = [a + d * u - n, a + d * v - n, a + d * v + n, a + d * u + n]
        m.f([m.v((p.x, p.y, z + cb.ALT_TINTA)) for p in q], cor)
    return m.obj("faixa")


def alca_greide(L):
    """Rampa constante (m/m) do trecho do meio da alça, para descer de Z_ALCA0 a Z_ALCA1 em L metros."""
    return (Z_ALCA0 - Z_ALCA1) / (L - L_TRANS)


def alca_z(s, L):
    """Altura do asfalto da alça a s metros da saída: parábola, rampa constante, parábola."""
    g, D = alca_greide(L), Z_ALCA0 - Z_ALCA1
    if s < L_TRANS:
        d = g * s * s / (2 * L_TRANS)
    elif s > L - L_TRANS:
        d = D - g * (L - s) ** 2 / (2 * L_TRANS)
    else:
        d = g * (s - L_TRANS / 2)
    return Z_ALCA0 - d


def alca_caminho(passo=0.8):
    """Eixo da alça do quadrante sudeste: (caminho, tangentes, z do asfalto, s)."""
    s1 = reamostra([(X_S1, Y_S1), (LC[0], Y_S1)], passo)
    n = max(8, int(math.ceil(LR * 1.5 * math.pi / passo)))
    arc = cb.arco(LC[0], LC[1], LR, 90, -180, n)
    ta = tang_arco(90, -180, n)
    s3 = reamostra([(X_N, LC[1]), (X_N, Y_POUSO)], passo)
    cam = s1 + arc[1:] + s3[1:]
    tang = [(1.0, 0.0)] * len(s1) + ta[1:] + [(0.0, 1.0)] * (len(s3) - 1)
    s = comprimentos(cam)
    za = [alca_z(si, s[-1]) for si in s]
    return cam, tang, za, s


def alca_fundo(z):
    """Fundo da alça: laje de E_LACO quando alta; aterro com muros até −0,30 quando baixa."""
    return z - E_LACO if z > 2.2 else -0.3


def alca_colunas(cam, za, s):
    """Colunas sob o trecho alto, a cada ~8,5 m, fora da faixa do chão que passa por baixo da reta de saída."""
    out = []
    si = 5.0
    while si < s[-1]:
        i = min(range(len(s)), key=lambda k: abs(s[k] - si))
        x, y = cam[i]
        zb = alca_fundo(za[i])
        livre = not (X_N - LB - 1.2 < x < X_N + LB + 1.2 and y > Y_POUSO)
        if zb > 1.2 and za[i] > 2.2 and livre:
            out.append((x, y, zb))
        si += 8.5
    return out


def alca_obj(it):
    cam, tang, za, s = alca_caminho(passo=1.4)
    barreira_e = [(-LB, 0.0), (-LB, 0.62), (-LB + 0.06, 0.78), (-LB + 0.17, 0.8), (-LA, 0.7), (-LA, 0.0)]
    barreira_d = [(-o, z) for o, z in barreira_e[::-1]]
    topo = barreira_e + barreira_d
    ct = ["concreto"] * 5 + ["asfalto"] + ["concreto"] * 5

    def pf(i):
        zb = alca_fundo(za[i])
        return topo + [(LB, zb - za[i]), (-LB, zb - za[i])]

    it.add(varre(cam, za, pf, ct + ["concreto", "concreto_escuro", "concreto"], anel=True, tang=tang, nome="alca"))
    for o in (-LA + 0.3, LA - 0.3):
        it.add(tira(cam, za, o, 0.12, passo=1.0))
    for x, y, zb in alca_colunas(cam, za, s):
        it.add(mb.cilindro(0.5, zb - 0.5, x=x, y=y, z=-0.1, cor="concreto", seg=12, bisel=0.0),
               mb.torno([(0.5, 0.0), (0.62, 0.3), (1.1, 0.55), (0.0, 0.55)], x=x, y=y, z=zb - 0.53, cor="concreto",
                        seg=12),
               mb.cilindro(0.85, 0.2, x=x, y=y, z=-0.1, cor="concreto_escuro", seg=12, bisel=0.03))
    # encontro: onde a laje vira aterro, um bloco de concreto atravessado esconde a mudança do fundo
    i = next(k for k in range(1, len(za)) if za[k] <= 2.2 < za[k - 1])
    (x0, y0), (x1, y1) = cam[i - 1], cam[i]
    ang = math.degrees(math.atan2(y1 - y0, x1 - x0))
    zt = (za[i - 1] + za[i]) / 2 - 0.15
    bloco = mb.caixa(math.hypot(x1 - x0, y1 - y0) + 0.5, 2 * LB + 0.16, zt + 0.3, z=-0.3, cor="concreto", bisel=0.05,
                     seg=1)
    it.add(mb.transforma(bloco, loc=((x0 + x1) / 2, (y0 + y1) / 2, 0.0), rot=("Z", ang)))


def alca_colisao():
    """Malha de colisão da alça: o tabuleiro inclinado com as duas barreiras (seção em U fechada até o fundo da laje
    ou do aterro), em estações de ~2,5 m, mais as colunas como prismas quadrados."""
    cam, tang, za, s = alca_caminho(passo=2.5)
    m = Malha()
    perfil = [(-LB, 0.8), (-LA, 0.8), (-LA, 0.0), (LA, 0.0), (LA, 0.8), (LB, 0.8)]
    varre(cam, za, perfil, ["asfalto"] * 5, fundo=[alca_fundo(z) for z in za], lado="asfalto", base="asfalto",
          tang=tang, m=m)
    cf, _, zf, sf = alca_caminho(passo=1.4)
    for x, y, zb in alca_colunas(cf, zf, sf):
        prisma([cb.quadrado(x - 0.5, y - 0.5, x + 0.5, y + 0.5)], -0.1, zb, "asfalto", m=m)
    return m.obj("colisao_alca")


def p_trevo():
    it = mb.Item("trevo")
    cam, _, _, s = alca_caminho()
    L = s[-1]
    g = alca_greide(L)
    e = X_N + LB                      # meio-fio leste da faixa do chão (continua a barreira da alça)
    P1 = (6.25, Y_POUSO - 6.0)        # a pista do chão começa a alargar aqui (bico até a barreira da alça)
    P2 = (X_N - LB, Y_POUSO)
    curva = bezier((e, -9.0), (e, -3.0), (6.25, 0.0), (6.25, 6.0), 14)
    # ------------------------------------------------------------------ chão (metade leste; a oeste é a rotação)
    G = [(6.25, -TRV), (TRV, -TRV), (TRV, TRV), (6.25, TRV), (6.25, 6.0)] + curva[::-1][1:] + \
        [(e, Y_POUSO), (X_N + LB, Y_POUSO - 6.0), (X_N - LB, Y_POUSO - 6.0), P2, P1]
    ilha = [(LC[0] + 8.6 * math.cos(2 * math.pi * k / 40), LC[1] + 8.6 * math.sin(2 * math.pi * k / 40))
            for k in range(40)]
    can = [(22.5 + x, 22.5 + y) for x, y in mb.ret_arredondado(24.0, 24.0, 3.0, seg=6)]
    M = [P1, P2, (e, Y_POUSO)] + curva
    meia = [prisma([G, ilha, can], ZF, 0.0, "calcada", "calcada", nome="chao"),
            cb.laje(ilha, 0.0, "grama", nome="ilha"),
            cb.laje(M, cb.Z_ASF, "asfalto", nome="faixa_chao")]
    meia.append(cb.meio_fio([(6.25, -TRV), P1, P2]))
    meia.append(cb.meio_fio([(e, Y_POUSO)] + curva + [(6.25, TRV)]))
    # faixa de bordo da pista do chão que sai da alça
    meia.append(cb.faixa([(e - 0.3, Y_POUSO), (e - 0.3, -9.0)] + desloca(curva, -0.3)[1:], larg=0.12))
    # ilha do laço: gramado com árvores e moitas
    for dx, dy, e_ in ((0.0, 0.0, 1.3), (-4.4, 3.6, 0.9), (4.4, -3.4, 1.0)):
        meia.append(arvore(LC[0] + dx, LC[1] + dy, 0.0, esc=e_))
    for dx, dy, e_ in ((1.6, -1.4, 0.7), (-5.2, -2.6, 0.65)):
        meia.append(moita(LC[0] + dx, LC[1] + dy, 0.0, esc=e_))
    # canteiro gramado no quadrante livre (nordeste), com meio-fio, árvores e moitas
    meia.append(cb.laje(can, 0.16, "concreto", z_fundo=-0.05, nome="canteiro_borda"))
    meia.append(cb.laje([(22.5 + x, 22.5 + y) for x, y in mb.ret_arredondado(23.5, 23.5, 2.75, seg=6)], 0.18,
                        "grama", z_fundo=0.1, nome="canteiro"))
    for x, y, e_ in ((16.5, 27.0, 1.2), (28.0, 17.0, 1.0), (22.5, 22.0, 1.35)):
        meia.append(arvore(x, y, 0.18, esc=e_))
    for x, y in ((18.0, 15.0), (30.0, 28.5)):
        meia.append(moita(x, y, 0.18, esc=0.8))
    # faixas do chão (só a borda leste da avenida; o resto é da rotação)
    x = cb.AVENIDA["asf"] - 0.3
    meia += [faixa_reta((x, -TRV), (x, P1[1]), larg=0.12), faixa_reta((x, 6.0), (x, TRV), larg=0.12),
             faixa_reta((x, P1[1]), (x, 6.0), larg=0.12, tracejada=(1.0, 1.0), fase=P1[1])]
    # ------------------------------------------------------------------ tabuleiro alargado (lado sul) e alça
    alarg = [(X_TAPER, -7.5), (1.0, Y_S1 - LB), (X_S1, Y_S1 - LB), (X_S1, -7.5)]
    sul = [(-TRV, -7.5)] + alarg + [(TRV, -7.5)]
    norte = [(-px, -py) for px, py in sul]
    contorno = sul + norte
    laje = prisma([contorno], Z_VIA - 0.10 - E_LAJE, Z_VIA - 0.10, "asfalto", "concreto", "concreto_escuro",
                  nome="tabuleiro")
    meia_t = []
    for xa, xb in ((-TRV, X_TAPER), (X_S1, TRV)):
        meia_t.append(cb.laje(cb.quadrado(xa, -7.5, xb, -6.25), Z_VIA, "calcada", z_fundo=Z_VIA - 0.12))
        meia_t.append(sobe(cb.meio_fio([(xa, -6.25), (xb, -6.25)]), Z_VIA))
        c = [(xa + 0.02, -7.5), (xb - 0.02, -7.5)]
        meia_t.append(varre(c, Z_VIA, [(0.0, 0.0), (0.0, 0.29), (0.05, 0.35), (0.25, 0.35), (0.3, 0.29), (0.3, 0.0)],
                            ["concreto"] * 5, fundo=Z_VIA - 0.03, tang=(1, 0), nome="mureta"))
        meia_t.append(guarda_corpo([(xa + 0.1, -7.35, Z_VIA + 0.35), (xb - 0.1, -7.35, Z_VIA + 0.35)], alt=0.75,
                                   passo=1.5, fase=0.6, travessas=(0.38,), fim=True, r_post=0.035, r_tubo=0.04))
    # barreira no contorno alargado (até onde a alça começa)
    cb_ = reamostra([(X_TAPER, -7.5), (1.0, Y_S1 - LB), (X_S1, Y_S1 - LB)], 1.0)
    bar = [(-0.25, 0.0), (-0.25, 0.62), (-0.19, 0.78), (-0.08, 0.8), (0.0, 0.7), (0.0, 0.0)]
    meia_t.append(varre(cb_, Z_VIA - 0.10, bar, ["concreto"] * 5, fundo=Z_VIA - 0.12, nome="barreira"))
    a = cb.AVENIDA["asf"]
    yb = -(a - 0.3)
    meia_t += [faixa_reta((-TRV, yb), (X_TAPER, yb), larg=0.12, z=Z_VIA - 0.10),
               faixa_reta((X_S1, yb), (TRV, yb), larg=0.12, z=Z_VIA - 0.10),
               faixa_reta((X_TAPER, yb), (X_S1, yb), larg=0.12, z=Z_VIA - 0.10, tracejada=(1.0, 1.0), fase=X_TAPER)]
    for xp in (24.0,):
        meia_t.append(poste(xp, -6.9, z0=Z_VIA, ang=90, braco=1.8))
    tmp = mb.Item("tmp")
    alca_obj(tmp)
    meia += meia_t + tmp.partes
    XP = (15.0, 28.0)  # pilares da elevada (fora da avenida e da faixa do chão que passa por baixo)
    for xp in XP:
        meia.append(pilar_martelo(xp, 0.0, z_topo=Z_VIA - 0.10 - E_LAJE, larg=13.0, ang=90))
    it.add(meia, copia_girada(meia, 180))
    it.add(laje)
    # ------------------------------------------------------------------ avenida do chão e do alto (simétricas)
    it.add(cb.laje(cb.quadrado(-6.25, -TRV, 6.25, TRV), cb.Z_ASF, "asfalto", nome="avenida"))
    for o in (-0.12, 0.12):
        it.add(faixa_reta((o, -TRV), (o, TRV)))
        it.add(faixa_reta((-TRV, o), (TRV, o), z=Z_VIA - 0.10))
    for o in (-a / 2 + 0.06, a / 2 - 0.06):
        it.add(faixa_reta((o, -TRV), (o, TRV), tracejada=(2.5, 2.5), fase=-TRV))
        it.add(faixa_reta((-TRV, o), (TRV, o), tracejada=(2.5, 2.5), fase=-TRV, z=Z_VIA - 0.10))
    # ------------------------------------------------------------------ colisão
    # caixas para o chão, o tabuleiro e os pilares; as alças (inclinadas e curvas) vão em malha de colisão
    col_se = alca_colisao()
    col_no = copia_girada([col_se], 180)[0]
    it.colisao_malha(col_se, "colisao_alca_sudeste")
    it.colisao_malha(col_no, "colisao_alca_noroeste")
    za = Z_VIA - 0.10 - E_LAJE  # fundo do tabuleiro
    col = [((0, 0, ZF), (2 * TRV, 2 * TRV, -ZF)), ((0, 0, za), (2 * TRV, Q, E_LAJE + 0.1))]
    w = -7.5 - (Y_S1 - LB)  # largura do alargamento (4,35)
    for sg in (1, -1):
        col.append(((sg * 1.0, sg * (-7.5 - w / 2), za), (11.0, w, E_LAJE + 0.1)))
        for xp in XP:
            col += [((sg * xp, 0, 0.0), (1.2, 2.0, za - 1.0)), ((sg * xp, 0, za - 1.25), (1.6, 13.0, 1.25))]
    gi = max(abs(b - a_) / max(1e-9, s2 - s1) for (a_, b, s1, s2) in
             zip([alca_z(si, L) for si in s], [alca_z(si, L) for si in s[1:]], s, s[1:]))
    print(f"trevo: alça de {L:.1f} m, rampa máxima no eixo {100 * gi:.1f} % (greide {100 * g:.1f} %), "
          f"na borda interna do laço {100 * g * LR / (LR - LA):.1f} %", flush=True)
    return it, dict(rotulo="Trevo com avenida elevada e alças em laço (5 × 5)", grupo="trevo",
                    tags=["avenida", "viaduto", "trevo", "grande", "5x5"], colisao=col, dir_mini=(0.75, -1.0, 0.95),
                    extra={**EXTRA_ELEV, "quadras": [5, 5],
                           "alca": {"comprimento": round(L, 2), "inclinacao_max": round(g, 4),
                                    "inclinacao_borda_interna": round(g * LR / (LR - LA), 4)}})


# ---------------------------------------------------------------------------------------------------- túnel
TUN_W, TUN_P, TUN_T = 5.0, 3.0, 6.0   # meia largura, altura das paredes retas, topo do arco
Y_PORTAL, Y_FIM_TUNEL = -1.5, 6.0


def arco_tunel(folga=0.0, n=20):
    """Contorno da boca (x, z): paredes retas e arco abatido, da base direita à base esquerda (pelo alto)."""
    w, p, t = TUN_W + folga, TUN_P, TUN_T + folga
    pts = [(w, 0.0), (w, p)]
    for k in range(1, n):
        a = math.pi * k / n
        pts.append((w * math.cos(a), p + (t - p) * math.sin(a)))
    pts += [(-w, p), (-w, 0.0)]
    return pts


def prisma_xz(aneis, y0, y1, cor, nome="prisma_xz"):
    """Prisma com o contorno no plano XZ (com furos), de y0 a y1."""
    ob = prisma(aneis, -y1, -y0, cor, cor, cor, nome=nome)
    mb.transforma(ob, rot=("X", 90))
    return ob


def faixas_z(ob, cortes):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    for z in cortes:
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, z), plane_no=(0, 0, 1))
    bm.to_mesh(ob.data)
    bm.free()
    return ob


def p_tunel():
    it = mb.Item("tunel_rua")
    m, a = cb.RUA["mf"], cb.RUA["asf"]
    # rua de fora e de dentro
    it.add(cb.laje(cb.quadrado(-m, -H, m, Y_FIM_TUNEL), cb.Z_ASF, "asfalto", nome="asfalto"))
    it.add(cb.laje(cb.quadrado(-H, -H, -m, Y_PORTAL), 0.0, "calcada"), cb.laje(cb.quadrado(m, -H, H, Y_PORTAL), 0.0, "calcada"))
    it.add(cb.laje(cb.quadrado(-TUN_W, Y_PORTAL - 0.01, -m, Y_FIM_TUNEL), 0.0, "calcada"),
           cb.laje(cb.quadrado(m, Y_PORTAL - 0.01, TUN_W, Y_FIM_TUNEL), 0.0, "calcada"))
    it.add(cb.meio_fio([(-m, Y_FIM_TUNEL), (-m, -H)]), cb.meio_fio([(m, -H), (m, Y_FIM_TUNEL)]))
    it.add(cb.marcacoes_reta(cb.RUA, -H, Y_FIM_TUNEL - 0.3))
    # revestimento interno (superfície voltada para dentro)
    perfil = arco_tunel()
    # as paredes retas são divididas em faixas: base escura, azulejo e arco
    perfil = [(TUN_W, 0.0), (TUN_W, 1.0), (TUN_W, TUN_P)] + perfil[2:-2] + [(-TUN_W, TUN_P), (-TUN_W, 1.0), (-TUN_W, 0.0)]
    cores = ["concreto_escuro", "branco_gelo"] + ["concreto"] * (len(perfil) - 5) + ["branco_gelo", "concreto_escuro"]
    it.add(varre([(0.0, Y_PORTAL), (0.0, Y_FIM_TUNEL)], 0.0, perfil, cores, tang=(0, 1), nome="revestimento"))
    m2 = Malha()
    m2.poligono([(x, Y_FIM_TUNEL - 0.03, z) for x, z in arco_tunel()], "preto", normal=(0, -1, 0),
                plano=lambda p: (p[0], p[2]))
    it.add(m2.obj("fundo_escuro"))
    # luzes no teto e balizadores nas paredes
    for y in (-0.6, 1.2, 3.0, 4.8):
        it.add(mb.caixa(1.0, 0.35, 0.08, y=y, z=TUN_T - 0.1, cor=None, mat="luz", bisel=0.02, seg=1))
        for sx in (-1, 1):
            it.add(mb.caixa(0.06, 0.25, 0.1, x=sx * (TUN_W - 0.02), y=y + 0.9, z=0.85, cor="amarelo", bisel=0.01, seg=1))
    # barranco: bloco com o furo da boca, faixas de terra e grama em cima
    FZ = 6.9
    externo = [(-H, ZF), (H, ZF), (H, FZ), (-H, FZ)]
    furo = arco_tunel(folga=0.12)
    recorte = [(-H, ZF), (-TUN_W - 0.12, ZF)] + [(x, z) for x, z in furo[::-1] if z > 0.0] + [(TUN_W + 0.12, ZF), (H, ZF),
                                                                                             (H, FZ), (-H, FZ)]
    b1 = prisma_xz([recorte], Y_PORTAL, Y_FIM_TUNEL, "terra_seca", nome="barranco")
    b2 = prisma_xz([externo], Y_FIM_TUNEL, H, "terra_seca", nome="barranco_fundo")
    for b in (b1, b2):
        faixas_z(b, (2.3, 4.6))
        mb.pinta_onde(b, "areia", lambda c, n: abs(n.z) < 0.5 and (2.3 < c.z < 4.6))
        mb.pinta_onde(b, "grama", lambda c, n: n.z > 0.9 and c.z > FZ - 0.01)
    it.add(b1, b2)
    morro = mb.superelipsoide(14.2, 7.6, 4.4, x=0.0, y=(Y_PORTAL + H) / 2 + 0.6, z=FZ - 2.2, cor="grama", e=0.55,
                              e_v=0.65, nu=28, nv=10)
    mb.pinta_onde(morro, "grama_escura", lambda c, n: n.z < 0.45)
    it.add(morro)
    it.add(arvore(-4.2, 3.6, FZ + 1.6, esc=1.1), arvore(3.6, 5.0, FZ + 1.5, esc=0.9), moita(1.0, 2.0, FZ + 2.15, esc=0.8))
    # emboque de concreto (fachada com a boca), moldura, cornija e luzes
    fach = [(-H, ZF), (H, ZF), (H, 7.0), (4.0, 7.0), (3.4, 7.6), (-3.4, 7.6), (-4.0, 7.0), (-H, 7.0)]
    it.add(prisma_xz([fach, arco_tunel()], Y_PORTAL - 0.6, Y_PORTAL + 0.02, "concreto", nome="emboque"))
    anel_ext = arco_tunel(folga=0.55)
    it.add(prisma_xz([[(x, max(z, 0.0)) for x, z in anel_ext] + [], arco_tunel()][:1] and
                     [[(x, max(z, 0.0)) for x, z in anel_ext], [(x, z) for x, z in arco_tunel()]],
                     Y_PORTAL - 0.78, Y_PORTAL - 0.58, "concreto_escuro", nome="moldura"))
    it.add(mb.caixa(Q, 0.5, 0.3, y=Y_PORTAL - 0.62, z=7.0 - 0.05, cor="concreto_escuro", bisel=0.05, seg=2))
    it.add(mb.caixa(6.8, 0.5, 0.25, y=Y_PORTAL - 0.62, z=7.55, cor="concreto_escuro", bisel=0.05, seg=2))
    for x in (-2.4, -1.2, 0.0, 1.2, 2.4):
        it.add(mb.caixa(0.5, 0.3, 0.26, x=x, y=Y_PORTAL - 0.72, z=6.62, cor="grafite", bisel=0.04, seg=1),
               mb.caixa(0.4, 0.04, 0.16, x=x, y=Y_PORTAL - 0.88, z=6.67, cor=None, mat="luz", bisel=0.01, seg=1))
    for sx in (-1, 1):  # luminárias nas laterais da boca
        it.add(mb.caixa(0.35, 0.25, 0.5, x=sx * 6.25, y=Y_PORTAL - 0.72, z=3.6, cor="grafite", bisel=0.04, seg=1),
               mb.caixa(0.27, 0.04, 0.4, x=sx * 6.25, y=Y_PORTAL - 0.86, z=3.65, cor=None, mat="luz", bisel=0.01, seg=1))
    # caixa de telefone de emergência (SOS) ao lado da boca
    sos = [mb.caixa(0.55, 0.3, 0.8, x=-6.3, y=Y_PORTAL - 0.75, z=0.9, cor="laranja", bisel=0.05, seg=2),
           mb.caixa(0.36, 0.03, 0.3, x=-6.3, y=Y_PORTAL - 0.9, z=1.3, cor="branco", bisel=0.01, seg=1),
           mb.caixa(0.2, 0.03, 0.12, x=-6.3, y=Y_PORTAL - 0.9, z=1.05, cor="grafite", bisel=0.01, seg=1)]
    it.add(mb.junta(sos, "sos"))
    it.add(guarda_corpo([(-H + 0.15, Y_PORTAL - 0.35, 7.0), (-3.6, Y_PORTAL - 0.35, 7.0)], alt=1.0, passo=1.2, fase=0.4),
           guarda_corpo([(3.6, Y_PORTAL - 0.35, 7.0), (H - 0.15, Y_PORTAL - 0.35, 7.0)], alt=1.0, passo=1.2, fase=0.4))
    col = [((0, (-H + Y_PORTAL) / 2, ZF), (Q, Y_PORTAL + H, -ZF)),
           ((0, (Y_PORTAL + Y_FIM_TUNEL) / 2, ZF), (2 * TUN_W, Y_FIM_TUNEL - Y_PORTAL, -ZF)),
           ((-(H + TUN_W) / 2, 3.0 - 0.3, ZF), (H - TUN_W, H - Y_PORTAL + 0.6, FZ - ZF)),
           (((H + TUN_W) / 2, 3.0 - 0.3, ZF), (H - TUN_W, H - Y_PORTAL + 0.6, FZ - ZF)),
           ((0, (Y_PORTAL + Y_FIM_TUNEL) / 2 - 0.3, TUN_T), (2 * TUN_W, Y_FIM_TUNEL - Y_PORTAL + 0.6, FZ - TUN_T)),
           ((0, (Y_FIM_TUNEL + H) / 2, ZF), (2 * TUN_W, H - Y_FIM_TUNEL, FZ - ZF)),
           ((0, 3.6, FZ), (14.0, 7.6, 2.2))]
    return it, dict(rotulo="Entrada de túnel de rua", grupo="tunel", tags=["modular", "rua", "tunel"], colisao=col,
                    dir_mini=DIR_MEIO)


# ---------------------------------------------------------------------------------------------------- plataforma
def p_plataforma():
    it = mb.Item("plataforma_elevada")
    ZP = 1.0
    ew = 1.6          # meia largura da escada
    nd = 6
    dp = 0.3
    ye = H - nd * dp  # 5,7: onde a escada chega no alto
    # contorno com os recortes das duas escadas (frente e fundo)
    cont = [(-H + 0.1, -H + 0.1), (-ew, -H + 0.1), (-ew, -ye), (ew, -ye), (ew, -H + 0.1), (H - 0.1, -H + 0.1),
            (H - 0.1, H - 0.1), (ew, H - 0.1), (ew, ye), (-ew, ye), (-ew, H - 0.1), (-H + 0.1, H - 0.1)]
    corpo = prisma([cont], ZF, ZP - 0.16, "concreto", "concreto", "concreto_escuro", nome="corpo")
    faixas_z(corpo, (0.25,))
    mb.pinta_onde(corpo, "turquesa_escuro", lambda c, n: abs(n.z) < 0.5 and c.z < 0.25)
    it.add(corpo)
    topo = [(-H, -H), (-ew - 0.0, -H), (-ew, -ye), (ew, -ye), (ew, -H), (H, -H), (H, H), (ew, H), (ew, ye), (-ew, ye),
            (-ew, H), (-H, H)]
    tampa = prisma([topo], ZP - 0.18, ZP, "calcada", "concreto", "concreto", nome="pingadeira")
    it.add(tampa)
    # piso rosado com juntas
    it.add(cb.laje(cb.quadrado(-6.6, -ye + 0.6, 6.6, ye - 0.6), ZP + 0.012, "piso_rosado", z_fundo=ZP - 0.05,
                   bisel=0.0))
    for k in range(-3, 4):
        it.add(mb.caixa(0.06, 2 * ye - 1.2, 0.006, x=k * 1.9, y=0.0, z=ZP + 0.012, cor="calcada", bisel=0.0, seg=1))
    # escadas
    for sy in (-1, 1):
        for k in range(nd):
            zt = ZP * (k + 1) / nd
            y0 = -H + dp * k
            st = mb.caixa(2 * ew - 0.02, H - ye - dp * k + 0.02, zt - ZF, x=0.0, y=(y0 + (-ye)) / 2 + 0.01, z=ZF,
                          cor="concreto", bisel=0.0, seg=1)
            nos = mb.caixa(2 * ew - 0.06, 0.06, 0.008, x=0.0, y=y0 + 0.05, z=zt, cor="amarelo", bisel=0.0, seg=1)
            if sy > 0:
                for o in (st, nos):
                    mb.transforma(o, esc=(1, -1, 1))
                    o.data.flip_normals()
            it.add(st, nos)
        for sx in (-1, 1):
            corr = [(sx * (ew - 0.08), sy * (H - 0.08), 0.9), (sx * (ew - 0.08), sy * ye, ZP + 0.9),
                    (sx * (ew - 0.08), sy * (ye - 0.6), ZP + 0.9)]
            it.add(mb.tubo(corr, 0.035, cor="metal", seg=6, raio_curva=0.3))
            for p in corr[:2]:
                it.add(mb.cilindro(0.03, p[2] - (0.0 if abs(p[1]) > ye + 0.1 else ZP) - 0.02, x=p[0], y=p[1],
                                   z=0.0 if abs(p[1]) > ye + 0.1 else ZP, cor="metal", seg=6, bisel=0))
    # guarda-corpo de vidro em volta (menos nos vãos das escadas)
    def gc_vidro(p0, p1):
        p0, p1 = V(p0), V(p1)
        L = (p1 - p0).length
        n = max(1, int(round(L / 1.5)))
        d = (p1 - p0) / n
        ang = math.degrees(math.atan2(d.y, d.x))
        ps = []
        for k in range(n + 1):
            q = p0 + d * k
            ps.append(mb.caixa(0.07, 0.07, 1.1, x=q.x, y=q.y, z=ZP, cor="metal", bisel=0.0, seg=1))
        for k in range(n):
            q = p0 + d * (k + 0.5)
            vd = mb.caixa(d.length - 0.1, 0.025, 0.85, cor=None, mat="vidro", bisel=0.0, seg=1)
            gira(vd, ang)
            mb.transforma(vd, loc=(q.x, q.y, ZP + 0.12))
            ps.append(vd)
        ps.append(mb.tubo([(p0.x, p0.y, ZP + 1.1), (p1.x, p1.y, ZP + 1.1)], 0.04, cor="madeira_mel", seg=6))
        return mb.junta(ps, "gc_vidro")
    e = H - 0.12
    for sy in (-1, 1):
        it.add(gc_vidro((-e, sy * e), (-ew - 0.05, sy * e)), gc_vidro((ew + 0.05, sy * e), (e, sy * e)))
    for sx in (-1, 1):
        it.add(gc_vidro((sx * e, -e), (sx * e, e)))
    # mobiliário: bancos, floreiras e poste
    for sx in (-1, 1):
        it.add(banco(sx * 4.2, 0.0, ZP + 0.012, ang=90 * sx))
        fl = [mb.caixa(1.4, 1.4, 0.6, x=sx * 4.6, y=-3.6, z=ZP + 0.012, cor="madeira", bisel=0.05, seg=2),
              mb.caixa(1.2, 1.2, 0.1, x=sx * 4.6, y=-3.6, z=ZP + 0.55, cor="terra", bisel=0.02, seg=1)]
        it.add(mb.junta(fl, "floreira"), moita(sx * 4.6, -3.6, ZP + 0.6, esc=0.65))
        it.add(mb.junta([mb.caixa(1.4, 1.4, 0.6, x=sx * 4.6, y=3.6, z=ZP + 0.012, cor="madeira", bisel=0.05, seg=2),
                         mb.caixa(1.2, 1.2, 0.1, x=sx * 4.6, y=3.6, z=ZP + 0.55, cor="terra", bisel=0.02, seg=1)],
                        "floreira"), arvore(sx * 4.6, 3.6, ZP + 0.6, esc=0.6))
    col = [((0, 0, ZF), (Q, 2 * ye, ZP - ZF)),
           ((-(H + ew) / 2, -(H + ye) / 2, ZF), (H - ew, H - ye, ZP - ZF)),
           (((H + ew) / 2, -(H + ye) / 2, ZF), (H - ew, H - ye, ZP - ZF)),
           ((-(H + ew) / 2, (H + ye) / 2, ZF), (H - ew, H - ye, ZP - ZF)),
           (((H + ew) / 2, (H + ye) / 2, ZF), (H - ew, H - ye, ZP - ZF)),
           ((0, -(H + ye) / 2, ZF), (2 * ew, H - ye, ZP / 2 - ZF)), ((0, (H + ye) / 2, ZF), (2 * ew, H - ye, ZP / 2 - ZF))]
    return it, dict(rotulo="Plataforma elevada de pedestres", grupo="plataforma", tags=["modular", "calcada",
                                                                                          "plataforma", "pedestres"],
                    colisao=col, dir_mini=DIR_MEIO, extra={"altura_piso": ZP})


# ---------------------------------------------------------------------------------------------------- metrô
def letra_m(x, y, z, tam=0.5, cor="branco", eixo="y", esp=0.03):
    """Letra M em barras (no plano XZ, saindo para −Y)."""
    w = tam * 0.16
    ps = [mb.caixa(w, esp, tam, x=-tam * 0.38, cor=cor, bisel=0.0, seg=1),
          mb.caixa(w, esp, tam, x=tam * 0.38, cor=cor, bisel=0.0, seg=1)]
    for sx in (-1, 1):
        d = mb.caixa(w, esp, tam * 0.62, cor=cor, bisel=0.0, seg=1)
        mb.transforma(d, rot=("Y", sx * 32))
        mb.transforma(d, loc=(sx * tam * 0.18, 0.0, tam * 0.42))
        ps.append(d)
    ob = mb.junta(ps, "letra_m")
    if eixo == "x":
        gira(ob, 90)
    mb.transforma(ob, loc=(x, y, z))
    return ob


def p_metro():
    it = mb.Item("entrada_metro")
    hw, y0, y1 = 1.75, -3.8, 4.0      # vão da escada
    nd, rise = 20, 0.18
    zfun = -nd * rise                 # −3,6
    yl = y0 + nd * 0.3                # início do patamar
    praca = cb.quadrado(-3.6, -5.6, 3.6, 5.8)
    it.add(prisma([cb.quadrado(-H, -H, H, H), praca], ZF, 0.0, "calcada", "calcada", nome="calcada"))
    it.add(prisma([praca, cb.quadrado(-hw, y0, hw, y1)], ZF, 0.0, "piso_rosado", "calcada", nome="praca"))
    for k in range(1, 4):
        it.add(mb.caixa(7.2, 0.05, 0.006, y=-5.6 + k * 2.85, z=0.0, cor="calcada", bisel=0.0, seg=1) if k != 2 else None)
    poco = prisma([cb.quadrado(-hw - 0.3, y0 - 0.3, hw + 0.3, y1 + 0.3), cb.quadrado(-hw, y0, hw, y1)], zfun - 0.4, ZF,
                  "concreto", "branco_gelo", nome="poco")
    faixas_z(poco, (zfun + 1.0,))
    mb.pinta_onde(poco, "azul_medio", lambda c, n: abs(n.z) < 0.5 and c.z < zfun + 1.0)
    it.add(poco)
    for k in range(nd):
        zt = -rise * (k + 1)
        ya = y0 + 0.3 * k
        it.add(mb.caixa(2 * hw - 0.01, y1 - ya - 0.005, zt - (zfun - 0.4), x=0, y=(ya + y1) / 2, z=zfun - 0.4,
                        cor="concreto", bisel=0.0, seg=1),
               mb.caixa(2 * hw - 0.05, 0.05, 0.006, x=0, y=ya + 0.04, z=zt, cor="amarelo", bisel=0.0, seg=1))
    # porta escura no fundo, com luz em cima
    it.add(mb.caixa(2.3, 0.04, 2.3, x=0, y=y1 - 0.02, z=zfun, cor="preto", bisel=0.0, seg=1),
           mb.caixa(2.0, 0.06, 0.12, x=0, y=y1 - 0.03, z=zfun + 2.45, cor=None, mat="luz", bisel=0.01, seg=1))
    # corrimão central da escada
    it.add(mb.tubo([(0.0, y0 + 0.2, 0.9), (0.0, yl, zfun + 0.9), (0.0, y1 - 0.4, zfun + 0.9)], 0.035, cor="metal",
                   seg=6, raio_curva=0.4))
    # gradil verde-azulado com pilaretes e globos (lados e fundo do vão)
    cor_g = "turquesa_escuro"
    gr = []
    def gradil(p0, p1, alt=1.0):
        p0, p1 = V(p0), V(p1)
        L = (p1 - p0).length
        d = (p1 - p0).normalized()
        ang = math.degrees(math.atan2(d.y, d.x))
        for h in (0.12, alt - 0.05):
            b = mb.caixa(L, 0.07, 0.07, cor=cor_g, bisel=0.01, seg=1)
            gira(b, ang)
            c = (p0 + p1) / 2
            mb.transforma(b, loc=(c.x, c.y, h))
            gr.append(b)
        n = int(L / 0.3)
        for k in range(1, n):
            q = p0 + d * (L * k / n)
            gr.append(mb.caixa(0.035, 0.035, alt - 0.17, x=q.x, y=q.y, z=0.15, cor=cor_g, bisel=0.0, seg=1))
    gradil((-hw - 0.15, y0), (-hw - 0.15, y1 + 0.15))
    gradil((hw + 0.15, y0), (hw + 0.15, y1 + 0.15))
    gradil((-hw - 0.15, y1 + 0.15), (hw + 0.15, y1 + 0.15))
    for px, py in ((-hw - 0.15, y0), (hw + 0.15, y0), (-hw - 0.15, y1 + 0.15), (hw + 0.15, y1 + 0.15),
                   (-hw - 0.15, (y0 + y1) / 2), (hw + 0.15, (y0 + y1) / 2)):
        gr.append(mb.caixa(0.2, 0.2, 1.15, x=px, y=py, z=0.0, cor=cor_g, bisel=0.03, seg=1))
        gr.append(mb.caixa(0.26, 0.26, 0.08, x=px, y=py, z=1.15, cor=cor_g, bisel=0.02, seg=1))
    it.add(mb.junta(gr, "gradil"))
    for sx in (-1, 1):
        x = sx * (hw + 0.15)
        it.add(mb.cilindro(0.07, 1.4, x=x, y=y0, z=1.2, cor=cor_g, seg=8, bisel=0),
               mb.torno([(0.0, 0.0), (0.12, 0.0), (0.06, 0.12), (0.0, 0.12)], x=x, y=y0, z=2.55, cor=cor_g, seg=10),
               mb.esfera(0.22, x=x, y=y0, z=2.85, cor=None, mat="luz", seg=14))
    # cobertura em arco de vidro com estrutura verde-azulada
    xc = hw + 0.3
    arco_c = [(xc * math.cos(math.pi * k / 10), 2.4 + 0.8 * math.sin(math.pi * k / 10)) for k in range(11)]
    yc0, yc1 = y0 + 0.6, y1 + 0.3
    it.add(varre([(0.0, yc0), (0.0, yc1)], 0.0, arco_c, ["m:vidro"] * 10, tang=(0, 1), nome="vidro_cobertura"))
    est = []
    for yy in (yc0, (yc0 + yc1) / 2, yc1):
        est.append(mb.tubo([(x, yy, z + 0.04) for x, z in arco_c], 0.05, cor=cor_g, seg=6, raio_curva=0.2))
    for x, z in (arco_c[0], arco_c[5], arco_c[10]):
        est.append(mb.tubo([(x, yc0, z + 0.04), (x, yc1, z + 0.04)], 0.045, cor=cor_g, seg=6))
    for sx in (-1, 1):
        for yy in (yc0, yc1):
            est.append(mb.cilindro(0.06, 2.42, x=sx * xc, y=yy, z=0.0, cor=cor_g, seg=8, bisel=0))
    it.add(mb.junta(est, "estrutura"))
    # placa do metrô na frente da cobertura
    it.add(mb.caixa(2.6, 0.1, 0.55, x=0.0, y=yc0 - 0.05, z=2.0, cor="azul_medio", bisel=0.04, seg=2),
           letra_m(-0.9, yc0 - 0.11, 2.07, tam=0.4))
    for k, x in enumerate((-0.35, 0.0, 0.35, 0.7, 1.05)):
        it.add(mb.caixa(0.2, 0.03, 0.06, x=x, y=yc0 - 0.11, z=2.24 - 0.0 * k, cor="branco", bisel=0.0, seg=1))
    # totem
    tt = [mb.cilindro(0.08, 2.6, x=0.0, y=0.0, z=0.0, cor="grafite", seg=8, bisel=0),
          mb.caixa(0.7, 0.7, 0.7, z=2.6, cor="azul_medio", bisel=0.08, seg=2),
          mb.cilindro(0.3, 0.1, z=0.0, cor="grafite", seg=12, bisel=0.02)]
    tot = mb.junta(tt, "totem")
    mb.transforma(tot, loc=(2.9, -4.6, 0.0))
    it.add(tot)
    for ang in (0, 90, 180, 270):
        lm = letra_m(0.0, -0.36, 2.72, tam=0.42)
        gira(lm, ang)
        mb.transforma(lm, loc=(2.9, -4.6, 0.0))
        it.add(lm)
    it.add(banco(-5.4, -2.0, 0.0, ang=-90), banco(5.4, 2.0, 0.0, ang=90), arvore(-5.6, 4.6, 0.0, esc=0.9))
    col = [((-(H + hw) / 2, 0, ZF), (H - hw, Q, -ZF)), (((H + hw) / 2, 0, ZF), (H - hw, Q, -ZF)),
           ((0, (-H + y0) / 2, ZF), (2 * hw, H + y0, -ZF)), ((0, (y1 + H) / 2, ZF), (2 * hw, H - y1, -ZF)),
           ((0, (y0 + yl) / 2 + 1.5, zfun - 0.4), (2 * hw, yl - y0 - 3.0, -zfun / 2 + 0.4)),
           ((0, (yl + y1) / 2, zfun - 0.4), (2 * hw, y1 - yl, 0.4)),
           ((-hw - 0.15, (y0 + y1) / 2, 0.0), (0.2, y1 - y0, 1.1)), ((hw + 0.15, (y0 + y1) / 2, 0.0), (0.2, y1 - y0, 1.1)),
           ((0, y1 + 0.15, 0.0), (2 * hw + 0.3, 0.2, 1.1)), ((2.9, -4.6, 0.0), (0.7, 0.7, 3.3))]
    return it, dict(rotulo="Entrada de metrô", grupo="metro", tags=["modular", "calcada", "metro"], colisao=col,
                    dir_mini=DIR_MEIO)


# ---------------------------------------------------------------------------------------------------- subestação
def isolador(x, y, z, n=4, r=0.16, cor="porcelana"):
    perfil = [(0.0, 0.0), (0.06, 0.0)]
    for k in range(n):
        b = 0.02 + k * 0.12
        perfil += [(0.06, b), (r, b + 0.03), (r, b + 0.06), (0.06, b + 0.09)]
    perfil += [(0.06, 0.06 + n * 0.12), (0.0, 0.06 + n * 0.12)]
    return mb.torno(perfil, x=x, y=y, z=z, cor=cor, seg=8, angulo=60)


def transformador(x, y, ang=0.0):
    ps = [mb.caixa(2.4, 1.7, 2.1, z=0.3, cor="cinza_azulado", bisel=0.06, seg=2),
          mb.caixa(2.8, 2.1, 0.3, z=0.0, cor="concreto_escuro", bisel=0.04, seg=1),
          mb.cilindro(0.38, 1.6, x=0.0, y=0.55, z=2.75, cor="cinza_azulado", eixo="x", seg=14, bisel=0.04)]
    for sx in (-1, 1):
        for k in range(7):
            ps.append(mb.caixa(0.06, 0.1, 1.6, x=-0.9 + k * 0.3, y=sx * 0.9, z=0.5, cor="cinza_medio", bisel=0.0,
                               seg=1))
    for k in range(3):
        ps.append(isolador(-0.7 + k * 0.7, -0.35, 2.4, n=3))
    ps.append(mb.caixa(0.5, 0.02, 0.4, x=0.6, y=-0.86, z=1.5, cor="amarelo", bisel=0.0, seg=1))
    ob = mb.junta(ps, "transformador")
    gira(ob, ang)
    mb.transforma(ob, loc=(x, y, 0.04))
    return ob


def p_subestacao():
    it = mb.Item("subestacao")
    it.add(cb.laje(cb.quadrado(-H, -H, H, H), 0.0, "calcada"))
    X0, Y0 = 6.3, 5.6
    it.add(cb.laje(cb.quadrado(-X0, -Y0, X0, Y0), 0.04, "brita", z_fundo=-0.05))
    # meio-fio de concreto em volta do pátio
    bordas = []
    for (xa, ya), (xb, yb) in (((-X0, -Y0), (X0, -Y0)), ((X0, -Y0), (X0, Y0)), ((X0, Y0), (-X0, Y0)), ((-X0, Y0), (-X0, -Y0))):
        L = math.hypot(xb - xa, yb - ya)
        b = mb.caixa(L + 0.25, 0.25, 0.16, cor="concreto", bisel=0.04, seg=1)
        gira(b, math.degrees(math.atan2(yb - ya, xb - xa)))
        mb.transforma(b, loc=((xa + xb) / 2, (ya + yb) / 2, -0.02))
        bordas.append(b)
    it.add(mb.junta(bordas, "borda"))
    # alambrado (postes, arames e braços inclinados), com portão duplo na frente
    cerca = []
    pg = 1.6  # meia largura do portão
    trechos = [((-X0, -Y0), (-pg, -Y0)), ((pg, -Y0), (X0, -Y0)), ((X0, -Y0), (X0, Y0)), ((X0, Y0), (-X0, Y0)),
               ((-X0, Y0), (-X0, -Y0))]
    for (xa, ya), (xb, yb) in trechos:
        L = math.hypot(xb - xa, yb - ya)
        n = max(1, int(round(L / 2.4)))
        ang = math.degrees(math.atan2(yb - ya, xb - xa))
        for k in range(n + 1):
            x, y = xa + (xb - xa) * k / n, ya + (yb - ya) * k / n
            cerca.append(mb.cilindro(0.045, 2.3, x=x, y=y, z=0.1, cor="metal_escuro", seg=6, bisel=0))
        for h in (0.35, 0.8, 1.25, 1.7, 2.15):
            w = mb.caixa(L, 0.02, 0.02, cor="metal", bisel=0.0, seg=1)
            gira(w, ang)
            mb.transforma(w, loc=((xa + xb) / 2, (ya + yb) / 2, 0.1 + h))
            cerca.append(w)
        for h in (2.45, 2.6):
            w = mb.caixa(L, 0.015, 0.015, cor="metal_escuro", bisel=0.0, seg=1)
            gira(w, ang)
            dxo, dyo = math.sin(math.radians(ang)) * 0.0, -math.cos(math.radians(ang)) * 0.0
            mb.transforma(w, loc=((xa + xb) / 2 + dxo, (ya + yb) / 2 + dyo, h))
            cerca.append(w)
    it.add(mb.junta(cerca, "alambrado"))
    for sx, lado in ((-1, "esq"), (1, "dir")):
        fr = [mb.caixa(pg - 0.06, 0.05, 0.05, x=sx * pg / 2, y=-Y0, z=0.25, cor="metal_escuro", bisel=0.01, seg=1),
              mb.caixa(pg - 0.06, 0.05, 0.05, x=sx * pg / 2, y=-Y0, z=2.25, cor="metal_escuro", bisel=0.01, seg=1),
              mb.caixa(0.05, 0.05, 2.05, x=sx * 0.05, y=-Y0, z=0.25, cor="metal_escuro", bisel=0.01, seg=1),
              mb.caixa(0.05, 0.05, 2.05, x=sx * (pg - 0.05), y=-Y0, z=0.25, cor="metal_escuro", bisel=0.01, seg=1)]
        for k in range(1, 5):
            fr.append(mb.caixa(0.025, 0.02, 1.95, x=sx * pg * k / 5, y=-Y0, z=0.3, cor="metal", bisel=0.0, seg=1))
        if sx > 0:
            fr.append(placa_aviso_plana(0.8, -Y0 - 0.04, 1.3))
        it.porta(fr, dobradica=(sx * pg, -Y0, 0.0), eixo="z", lado=lado, abre_graus=100)
    # equipamentos
    it.add(transformador(-2.8, 1.8), transformador(2.8, 1.8))
    # pórtico de barramento com isoladores e cabos
    por = []
    for sx in (-5.2, 5.2):
        for dy in (-0.35, 0.35):
            por.append(mb.caixa(0.22, 0.22, 6.2, x=sx, y=-1.4 + dy, z=0.04, cor="metal", bisel=0.02, seg=1))
        for k in range(6):
            d = mb.caixa(0.06, 0.06, 1.05, x=0, y=0, z=-0.52, cor="metal", bisel=0.0, seg=1)
            mb.transforma(d, rot=("X", 40 if k % 2 else -40))
            mb.transforma(d, loc=(sx, -1.4, 0.6 + k * 0.95))
            por.append(d)
    por.append(mb.caixa(10.8, 0.3, 0.4, x=0, y=-1.4, z=6.0, cor="metal", bisel=0.03, seg=1))
    for xx in (-2.8, 0.0, 2.8):
        ins = isolador(xx, -1.4, 5.0, n=5, r=0.13)
        por.append(ins)
    it.add(mb.junta(por, "portico"))
    cab = []
    for xx, xt in ((-2.8, -3.5), (0.0, -2.8), (2.8, 2.1)):
        cab.append(mb.tubo([(xx, -1.4, 5.0), ((xx + xt) / 2, 0.0, 3.85), (xt, 1.45, 3.15)], 0.025, cor="ferro", seg=4,
                           raio_curva=1.0))
    it.add(mb.junta([c for c in cab if c], "cabos"))
    # casinha de comando e armários
    cs = [mb.caixa(3.2, 2.4, 2.6, x=-3.6, y=-3.6, z=0.04, cor="creme", bisel=0.06, seg=2),
          mb.caixa(3.5, 2.7, 0.22, x=-3.6, y=-3.6, z=2.64, cor="grafite", bisel=0.05, seg=1),
          mb.caixa(0.9, 0.06, 1.9, x=-3.0, y=-4.82, z=0.04, cor="petroleo", bisel=0.02, seg=1),
          mb.caixa(0.06, 0.06, 0.06, x=-2.65, y=-4.86, z=1.0, cor="ouro", bisel=0.01, seg=1),
          mb.caixa(0.8, 0.06, 0.6, x=-4.5, y=-4.82, z=1.3, cor="branco", bisel=0.02, seg=1),
          mb.caixa(0.68, 0.04, 0.48, x=-4.5, y=-4.85, z=1.36, cor=None, mat="vidro", bisel=0.01, seg=1)]
    it.add(mb.junta(cs, "casinha"))
    for k in range(3):
        it.add(mb.caixa(0.9, 0.6, 1.6, x=1.6 + k * 1.0, y=-3.8, z=0.04, cor="grafite", bisel=0.04, seg=1),
               mb.caixa(0.06, 0.04, 0.25, x=1.95 + k * 1.0, y=-4.12, z=0.9, cor="metal_claro", bisel=0.0, seg=1),
               mb.caixa(0.3, 0.02, 0.06, x=1.6 + k * 1.0, y=-4.11, z=1.4, cor="verde_lima" if k != 1 else "vermelho",
                        bisel=0.0, seg=1))
    it.add(poste(-H + 0.6, -H + 0.6, ang=45, braco=1.2))
    col = [((0, 0, ZF), (Q, Q, -ZF)), ((0, -Y0, 0.0), (2 * X0, 0.1, 2.6)), ((0, Y0, 0.0), (2 * X0, 0.1, 2.6)),
           ((-X0, 0, 0.0), (0.1, 2 * Y0, 2.6)), ((X0, 0, 0.0), (0.1, 2 * Y0, 2.6)),
           ((0, 1.8, 0.0), (8.4, 2.1, 3.2)), ((-3.6, -3.6, 0.0), (3.2, 2.4, 2.9))]
    return it, dict(rotulo="Subestação de energia", grupo="subestacao", tags=["modular", "calcada", "energia"],
                    colisao=col, dir_mini=DIR_MEIO)


def placa_aviso_plana(x, y, z):
    ps = [mb.caixa(0.5, 0.02, 0.4, x=x, y=y, z=z, cor="amarelo", bisel=0.0, seg=1),
          mb.caixa(0.06, 0.025, 0.22, x=x, y=y, z=z + 0.09, cor="preto", bisel=0.0, seg=1)]
    return mb.junta(ps, "aviso")


def p_caixa_equip():
    it = mb.Item("caixa_equipamentos")
    it.add(mb.caixa(2.8, 1.0, 0.15, z=0.0, cor="concreto", bisel=0.04, seg=1))
    # armário grande (porta dupla) e armário pequeno (porta simples), com venezianas
    for (xc, l, a, cor, n) in ((-0.55, 1.4, 1.5, "cinza_azulado", 2), (0.75, 0.9, 1.15, "verde_medio", 1)):
        ca = mb.carcaca(l, 0.6, a, x=xc, y=0.0, z=0.15, esp=0.04, cor=cor, prateleiras=(a * 0.5,), bisel=0.01)
        it.add(ca, mb.caixa(l + 0.08, 0.68, 0.06, x=xc, y=0.0, z=0.15 + a, cor="grafite", bisel=0.02, seg=1))
        for k in range(4):
            it.add(mb.caixa(l * 0.5, 0.02, 0.025, x=xc, y=0.302, z=0.35 + k * 0.08, cor="grafite", bisel=0.0, seg=1))
        wl = l / n
        for k in range(n):
            x0 = xc - l / 2 + wl * k
            fr = mb.frente(wl - 0.01, a - 0.02, esp=0.025, estilo="lisa", cor=cor, bisel=0.006)
            mb.transforma(fr, loc=(x0 + wl / 2, -0.3, 0.16))
            pux = mb.puxador("barra", x=x0 + (wl - 0.1 if k == 0 and n == 2 else 0.1) if n == 2 else x0 + wl - 0.1,
                             y=-0.325, z=0.15 + a * 0.55, cor="metal_claro", tam=0.8)
            av = mb.caixa(0.22, 0.01, 0.16, x=x0 + wl / 2, y=-0.33, z=0.15 + a * 0.78, cor="amarelo", bisel=0.0, seg=1)
            if n == 2:
                lado = "esq" if k == 0 else "dir"
                dob = (x0 if k == 0 else x0 + wl, -0.3, 0.15)
            else:
                lado, dob = "esq", (x0, -0.3, 0.15)
            it.porta([fr, pux, av], dobradica=dob, eixo="z", lado=lado)
            it.slot(f"armario_{xc:.0f}_{k}", (x0 + wl / 2, 0.0, 0.19), (wl - 0.1, 0.5, a * 0.45))
    col = [((0, 0, 0.0), (2.8, 1.0, 1.75))]
    return it, dict(rotulo="Caixas de equipamentos", grupo="caixa_equipamentos", tags=["calcada", "energia",
                                                                                         "interativo"],
                    colisao=col, dir_mini=DIR_ALTO)


# ======================================================================================================================
# Registro e execução
# ======================================================================================================================
ROTULOS = {"agua": "Água e represa", "estruturas": "Viadutos e estruturas"}
PECAS = [
    ("agua", "represa", p_represa),
    ("agua", "canal_reto", p_canal_reto),
    ("agua", "canal_curva", p_canal_curva),
    ("agua", "rio_reto", p_rio_reto),
    ("agua", "rio_curva", p_rio_curva),
    ("agua", "lago", p_lago),
    ("agua", "cais", p_cais),
    ("agua", "orla", p_orla),
    ("agua", "agua_aberta", p_agua_aberta),
    ("agua", "comporta_canal", p_comporta),
    ("estruturas", "viaduto_rua", lambda: p_viaduto(cb.RUA)),
    ("estruturas", "viaduto_rua_vao", lambda: p_viaduto(cb.RUA, pilar=False)),
    ("estruturas", "viaduto_avenida", lambda: p_viaduto(cb.AVENIDA)),
    ("estruturas", "rampa_viaduto_rua", lambda: p_rampa(cb.RUA)),
    ("estruturas", "rampa_viaduto_avenida", lambda: p_rampa(cb.AVENIDA)),
    ("estruturas", "pilar_viaduto", p_pilar),
    ("estruturas", "pilar_viaduto_redondo", p_pilar_redondo),
    ("estruturas", "trevo", p_trevo),
    ("estruturas", "tunel_rua", p_tunel),
    ("estruturas", "plataforma_elevada", p_plataforma),
    ("estruturas", "entrada_metro", p_metro),
    ("estruturas", "subestacao", p_subestacao),
    ("estruturas", "caixa_equipamentos", p_caixa_equip),
]


def main():
    argv = sys.argv[sys.argv.index("--") + 1:]
    saida, filtro = argv[0], argv[1:]
    cats = {}
    for cat, id_, f in PECAS:
        if filtro and cat not in filtro and id_ not in filtro:
            continue
        mb.limpa()
        it, op = f()
        if os.environ.get("CIDADE_DEBUG"):
            for o in it.partes + [ob for ob, _ in it.interativos]:
                lo, hi = mb.bbox(o)
                tr = sum(len(pp.vertices) - 2 for pp in o.data.polygons)
                print("  parte", o.name, tr, [round(v, 2) for v in lo], [round(v, 2) for v in hi])
        if cat not in cats:
            cats[cat] = mb.Catalogo(cat, saida, rotulo=ROTULOS[cat])
        col = op.pop("colisao", None)
        if col:
            it.colisao(col)
        dir_mini = op.pop("dir_mini", cb.DIR_TOPO)
        extra = op.pop("extra", None)
        cb.exporta(cats[cat], it, op["rotulo"], op["grupo"], tags=op.get("tags", ()), dir_mini=dir_mini, extra=extra)
    for c in cats.values():
        c.salva()


if __name__ == "__main__":
    main()
