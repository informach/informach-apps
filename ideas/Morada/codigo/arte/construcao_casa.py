"""Biblioteca de construção, segunda parte: o que falta para montar casas inteiras no modo construir. Telhados,
segundo andar e escadas, fundação e acesso, varanda, cercas e portões, piscina, garagem aberta, caminho e o lote.
Feitas aqui, no estilo do resto (cartum, cantos boleados, cores da paleta), e casando com a grade de 0,5 m, as paredes
de 3 m × 15 cm, o chão de 4 × 4 m e as portas e janelas que já existem (construcao.py, portas_janelas.py).

Regras de encaixe (as mesmas que vão no construcao.json, em "regras"):
  - Altura de piso: térreo em z = h (h = altura da fundação, 0 sem fundação); andar n em z = h + 3,2·n (parede de 3 m
    mais a laje de 0,2 m). O topo das paredes de um andar fica em z = h + 3,2·n + 3.
  - Telhado: toda peça de telhado tem a origem no topo das paredes em que se apoia (z = h + 3,2·n + 3), na linha da
    grade (o meio da parede). O vão S é a distância entre as linhas das paredes do beirado (4, 6 ou 8 m); a inclinação
    é i25, i50 ou i75 (sobe 0,25, 0,5 ou 0,75 m por metro). A face de baixo da laje do telhado passa pela quina de
    dentro do topo da parede, então não sobra fresta por dentro.
  - Beiral: 0,5 m para fora da linha da grade (a borda do beiral também cai na grade). Cantos de beiral são células de
    0,5 × 0,5 m.
  - Materiais que trocam de textura: "telha" (texturas de telhado, 2 × 2 m, repete a cada 0,5 m na horizontal),
    "piso" (texturas de piso, 2 × 2 m), "face_a"/"face_b" (texturas de parede, 3 × 3 m: oitões e paredes de
    complemento continuam a textura da parede de baixo, espelhada para cima), "pastilha" (revestimento da piscina,
    texturas de piso) e "cumeeira" (uma cor: a média da telha escolhida, mais escura). "borda" é o branco do acabamento.
    O GLB leva só a cor média; a página e o motor põem a textura pelo nome do material.

Uso: blender-venv/bin/python -I construcao_casa.py -- <pasta da construcao> [grupos ou ids separados por vírgula]
"""
import json
import math
import os
import sys

import bpy
import bmesh
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import moveis_base as mb  # noqa: E402

V = Vector
ALT = 3.0  # parede
ESP = 0.15
MEIA = ESP / 2
LAJE = 0.20  # laje entre andares
ANDAR = ALT + LAJE  # 3,2 m de piso a piso
BEIRAL = 0.5
FASCIA = 0.03
E_TELHA = 0.09  # espessura da laje do telhado (perpendicular à água)
LABIO = 0.012  # quanto a testeira passa acima da telha
VAOS = (4, 6, 8)
INCL = {"i25": 0.25, "i50": 0.50, "i75": 0.75}
R_CUM = 0.07  # raio da cumeeira (tubo) e dos espigões
SOBE_CUM = 0.02  # centro do tubo acima da quina da telha

MAT_TEX = {  # material → (cor média no GLB, textura padrão nas miniaturas e renders, pasta da textura)
    "face_a": ("#5B95E5", "degrade_azul"), "face_b": ("#5B95E5", "degrade_azul"),
    "piso": ("#F0A866", "madeira_pinus"), "telha": ("#D9673A", "telha_ceramica"),
    "pastilha": ("#6EC1F2", "piscina"),
}
CUMEEIRA_COR = "#A84A2A"
PASTA = ""  # pasta da construção (a do construcao.json)


# =====================================================================================================================
# Materiais e malhas
# =====================================================================================================================
def _lin(hexa):
    h = hexa.lstrip("#")
    return tuple((int(h[i:i + 2], 16) / 255) ** 2.2 for i in (0, 2, 4))


def prepara_materiais():
    mb.materiais()
    for nome, (hexa, tex) in MAT_TEX.items():
        m, b = mb._principled(nome)
        b.inputs["Base Color"].default_value = (*_lin(hexa), 1)
        b.inputs["Roughness"].default_value = 0.7 if nome != "pastilha" else 0.35
        if nome not in mb.MAT_NOMES:
            mb.MAT_NOMES.append(nome)
    m, b = mb._principled("borda")  # o mesmo branco das paredes (construcao.py)
    b.inputs["Base Color"].default_value = (0.93, 0.93, 0.92, 1)
    b.inputs["Roughness"].default_value = 0.6
    if "borda" not in mb.MAT_NOMES:
        mb.MAT_NOMES.append("borda")
    m, b = mb._principled("cumeeira")
    b.inputs["Base Color"].default_value = (*_lin(CUMEEIRA_COR), 1)
    b.inputs["Roughness"].default_value = 0.55
    if "cumeeira" not in mb.MAT_NOMES:
        mb.MAT_NOMES.append("cumeeira")


def texturas_ligadas(ligar):
    """Liga a textura padrão nos materiais que trocam de textura (miniatura, render) ou volta à cor média (GLB)."""
    for nome, (hexa, tex) in MAT_TEX.items():
        m = bpy.data.materials[nome]
        nt = m.node_tree
        b = nt.nodes["Principled BSDF"]
        tx = nt.nodes.get("tex_padrao")
        if ligar:
            if tx is None:
                tx = nt.nodes.new("ShaderNodeTexImage")
                tx.name = "tex_padrao"
                tx.image = bpy.data.images.load(os.path.join(PASTA, "texturas", tex + ".png"), check_existing=True)
                tx.interpolation = "Cubic"
            nt.links.new(tx.outputs["Color"], b.inputs["Base Color"])
        elif tx is not None:
            for ln in list(b.inputs["Base Color"].links):
                nt.links.remove(ln)
            nt.nodes.remove(tx)


def _normal(pts):
    n = V((0, 0, 0))
    for a, b in zip(pts, pts[1:] + pts[:1]):
        n.x += (a.y - b.y) * (a.z + b.z)
        n.y += (a.z - b.z) * (a.x + b.x)
        n.z += (a.x - b.x) * (a.y + b.y)
    return n


def area2(pol):
    return sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(pol, pol[1:] + pol[:1])) / 2


def ccw(pol):
    return list(pol) if area2(pol) > 0 else list(reversed(pol))


class Malha:
    """Malha montada face a face, com material e UV por face (texturas em metros ou célula da paleta)."""

    def __init__(self):
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("UVMap")

    def f(self, pts, mat="borda", uv=None, cor="branco", fora=None):
        pts = [V(p) for p in pts]
        if uv is None:
            uvs = [mb.uv_cor(cor)] * len(pts)
        elif callable(uv):
            uvs = [uv(p) for p in pts]
        else:
            uvs = list(uv)
        if fora is not None and _normal(pts).dot(V(fora)) < 0:
            pts, uvs = pts[::-1], uvs[::-1]
        vs = [self.bm.verts.new(p) for p in pts]
        try:
            fa = self.bm.faces.new(vs)
        except ValueError:
            return None
        fa.material_index = mb.MAT_NOMES.index(mat)
        for lo, u in zip(fa.loops, uvs):
            lo[self.uv].uv = u
        return fa

    def caixa(self, x0, x1, y0, y1, z0, z1, mat="borda", cor="branco", uv=None):
        P = lambda x, y, z: (x, y, z)  # noqa: E731
        c = V(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
        for q in ([P(x0, y0, z0), P(x1, y0, z0), P(x1, y1, z0), P(x0, y1, z0)],
                  [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)],
                  [P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1)],
                  [P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)],
                  [P(x0, y0, z0), P(x0, y1, z0), P(x0, y1, z1), P(x0, y0, z1)],
                  [P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)]):
            cq = sum((V(p) for p in q), V()) / 4
            self.f(q, mat, uv, cor, fora=cq - c)

    def prisma(self, pol, a0, a1, eixo="x", mat="borda", cor="branco", uv=None):
        """Prisma de um contorno 2D (u, z) num plano vertical, estendido de a0 a a1 no eixo ("x": o contorno é (y, z);
        "y": o contorno é (x, z))."""
        pol = ccw(pol)

        def P(u, z, a):
            return (a, u, z) if eixo == "x" else (u, a, z)
        ax = V((1, 0, 0)) if eixo == "x" else V((0, 1, 0))
        self.f([P(u, z, a1) for u, z in pol], mat, uv, cor, fora=ax)
        self.f([P(u, z, a0) for u, z in pol], mat, uv, cor, fora=-ax)
        for (ua, za), (ub, zb) in zip(pol, pol[1:] + pol[:1]):
            q = [P(ua, za, a0), P(ub, zb, a0), P(ub, zb, a1), P(ua, za, a1)]
            self.f(q, mat, uv, cor, fora=V(P(zb - za, -(ub - ua), 0)))

    def objeto(self, nome, suave=False):
        bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts[:], dist=1e-5)
        me = bpy.data.meshes.new(nome)
        self.bm.to_mesh(me)
        self.bm.free()
        for n in mb.MAT_NOMES:
            me.materials.append(bpy.data.materials[n])
        if suave:
            me.shade_smooth()
            me.set_sharp_from_angle(angle=math.radians(35))
        ob = bpy.data.objects.new(nome, me)
        bpy.context.scene.collection.objects.link(ob)
        return ob


def pinta_mat(ob, mat):
    """Troca o material de todas as faces de um objeto (UV fica)."""
    i = mb.MAT_NOMES.index(mat)
    for p in ob.data.polygons:
        p.material_index = i
    return ob


# =====================================================================================================================
# Telhados
# =====================================================================================================================
def _k(p):
    return math.sqrt(1 + p * p)


def zt(d, p):
    """Topo da telha a d metros da linha do beiral (para dentro), em relação ao topo da parede."""
    return (d - MEIA) * p + E_TELHA * _k(p)


def zu(d, p):
    """Face de baixo da laje do telhado (passa pela quina de dentro do topo da parede)."""
    return (d - MEIA) * p


def laje_telhado(M, faces, p, tv=None):
    """Laje do telhado a partir das águas em planta. faces: [(contorno [(x, y)], d(x, y), u(x, y))]. O topo leva
    "telha" (UV: u ao longo do beiral, v ao longo da água, em metros / 2); a face de baixo e as bordas soltas, "borda".
    As arestas entre águas (cumeeira, espigão, rincão) ficam fechadas: as duas águas dão a mesma altura nelas."""
    k = _k(p)
    tv = E_TELHA * k if tv is None else tv
    arestas = {}
    chave = lambda a, b: tuple(sorted(((round(a[0], 4), round(a[1], 4)), (round(b[0], 4), round(b[1], 4)))))  # noqa
    for pol, d, u in faces:
        pol = ccw(pol)
        for a, b in zip(pol, pol[1:] + pol[:1]):
            arestas.setdefault(chave(a, b), []).append((a, b, d))
    for pol, d, u in faces:
        pol = ccw(pol)
        topo = [(x, y, zt(d(x, y), p)) for x, y in pol]
        M.f(topo, "telha", uv=[(u(x, y) / 2, d(x, y) * k / 2) for x, y in pol], fora=(0, 0, 1))
        M.f([(x, y, z - tv) for x, y, z in topo], "borda", fora=(0, 0, -1))
    for lst in arestas.values():
        if len(lst) != 1:
            continue
        a, b, d = lst[0]
        za, zb = zt(d(*a), p), zt(d(*b), p)
        q = [(a[0], a[1], za - tv), (b[0], b[1], zb - tv), (b[0], b[1], zb), (a[0], a[1], za)]
        fora = (b[1] - a[1], -(b[0] - a[0]), 0)  # contorno anti-horário: para fora fica à direita
        M.f(q, "borda", fora=fora)


def tubo_cumeeira(pts, r=R_CUM, aneis=None):
    """Tubo boleado (cumeeira, espigão) pelos pontos, no material "cumeeira"; aneis: posições (0..1) com uma capa."""
    obs = [pinta_mat(mb.tubo(pts, r, cor="terracota", seg=14, raio_curva=0.001, nome="cumeeira"), "cumeeira")]
    if aneis:
        a, b = V(pts[0]), V(pts[-1])
        for t in aneis:
            c = a + (b - a) * t
            d = (b - a).normalized()
            obs.append(pinta_mat(mb.tubo([tuple(c - d * 0.035), tuple(c + d * 0.035)], r + 0.012, cor="terracota",
                                         seg=14, nome="capa"), "cumeeira"))
    return obs


def bola(c, r=0.085):
    return pinta_mat(mb.esfera(r, *c, cor="terracota", seg=16), "cumeeira")


def espigao(p0, p1, p, d_fn, ate_ponta=False):
    """Espigão (ou cumeeira) seguindo a quina entre duas águas, de p0 a p1 em planta."""
    pts = []
    for k in range(9):
        t = k / 8
        x, y = p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t
        pts.append((x, y, zt(d_fn(x, y), p) + SOBE_CUM))
    return tubo_cumeeira([pts[0], pts[-1]])


def _recorta(pol, x0, y0, x1, y1):
    """Recorta um polígono (lista de Vector 2D/3D, z ignorado) no retângulo (Sutherland-Hodgman)."""
    def corta(pts, dentro, cruza):
        out = []
        for i, a in enumerate(pts):
            b = pts[(i + 1) % len(pts)]
            if dentro(a):
                out.append(a)
                if not dentro(b):
                    out.append(cruza(a, b))
            elif dentro(b):
                out.append(cruza(a, b))
        return out
    for eixo, lim, sinal in ((0, x0, 1), (0, x1, -1), (1, y0, 1), (1, y1, -1)):
        def dentro(q, eixo=eixo, lim=lim, sinal=sinal):
            return (q[eixo] - lim) * sinal >= -1e-9

        def cruza(a, b, eixo=eixo, lim=lim):
            t = (lim - a[eixo]) / (b[eixo] - a[eixo])
            return a + (b - a) * t
        pol = corta(pol, dentro, cruza)
        if not pol:
            break
    return pol


def calha_rincao(M, p0, p1, p, faces_d, larg=0.10, limites=None, afina_ini=True):
    """Rufo de rincão: um tubo fino de metal deitado na linha do rincão (metade dele afunda na telha). Por ser uma
    linha, continua sem quebra na peça vizinha (o canto interno do beiral). Devolve o objeto (vai para a peça)."""
    d = faces_d[0]
    z = lambda x, y: zt(d(x, y), p) + 0.004  # noqa: E731
    M._rincoes = getattr(M, "_rincoes", []) + [mb.tubo([(p0[0], p0[1], z(*p0)), (p1[0], p1[1], z(*p1))], 0.03,
                                                       cor="metal_claro", seg=10, raio_curva=0.001, nome="rincao")]


def testeira(M, x0, x1, y_borda, p, lado=-1):
    """Testeira (tábua do beiral) ao longo de x, na borda y_borda (lado −1: a borda fica em y = −0,5, para fora)."""
    d_in = -(BEIRAL - FASCIA)
    y0, y1 = (y_borda, y_borda + FASCIA) if lado < 0 else (y_borda - FASCIA, y_borda)
    M.caixa(x0, x1, y0, y1, zu(-BEIRAL, p) - 0.07, zt(d_in, p) + LABIO)


def corpo_duas_aguas(S, p, L):
    M = Malha()
    laje_telhado(M, [([(0, 0), (L, 0), (L, S / 2), (0, S / 2)], lambda x, y: y, lambda x, y: x),
                     ([(0, S / 2), (L, S / 2), (L, S), (0, S)], lambda x, y: S - y, lambda x, y: -x)], p)
    return [M.objeto("corpo")]


def corpo_meia_agua(S, p, L):
    M = Malha()
    laje_telhado(M, [([(0, 0), (L, 0), (L, S), (0, S)], lambda x, y: y, lambda x, y: x)], p)
    return [M.objeto("corpo")]


def ponta_quatro_aguas(S, p):
    M = Malha()
    h = S / 2
    laje_telhado(M, [([(0, 0), (h, h), (0, S)], lambda x, y: x, lambda x, y: -y),
                     ([(0, 0), (h, 0), (h, h)], lambda x, y: y, lambda x, y: x),
                     ([(0, S), (h, h), (h, S)], lambda x, y: S - y, lambda x, y: -x)], p)
    obs = [M.objeto("corpo")]
    obs += espigao((0, 0), (h, h), p, lambda x, y: x)
    obs += espigao((0, S), (h, h), p, lambda x, y: x)
    obs.append(bola((h, h, zt(h, p) + SOBE_CUM)))
    return obs


def canto_L(S, p):
    M = Malha()
    h = S / 2
    laje_telhado(M, [([(0, 0), (S, 0), (S, h), (h, h)], lambda x, y: y, lambda x, y: x),
                     ([(0, 0), (h, h), (h, S), (0, S)], lambda x, y: x, lambda x, y: -y),
                     ([(h, h), (S, h), (S, S)], lambda x, y: S - y, lambda x, y: -x),
                     ([(h, h), (S, S), (h, S)], lambda x, y: S - x, lambda x, y: y)], p)
    calha_rincao(M, (h, h), (S, S), p, (lambda x, y: S - x, lambda x, y: S - y), limites=(0, 0, S, S))
    obs = M._rincoes + [M.objeto("corpo")]
    zc = zt(h, p) + SOBE_CUM
    obs += espigao((0, 0), (h, h), p, lambda x, y: x)
    obs += tubo_cumeeira([(h, h, zc), (S, h, zc)], aneis=[(k + 0.5) / h for k in range(int(h))])
    obs += tubo_cumeeira([(h, h, zc), (h, S, zc)], aneis=[(k + 0.5) / h for k in range(int(h))])
    obs.append(bola((h, h, zc)))
    return obs


def encontro_T(S, p):
    M = Malha()
    h = S / 2
    laje_telhado(M, [([(0, 0), (S, 0), (S, h), (0, h)], lambda x, y: y, lambda x, y: x),
                     ([(0, h), (h, h), (0, S)], lambda x, y: S - y, lambda x, y: -x),
                     ([(h, h), (S, h), (S, S)], lambda x, y: S - y, lambda x, y: -x),
                     ([(0, S), (h, h), (h, S)], lambda x, y: x, lambda x, y: -y),
                     ([(h, h), (S, S), (h, S)], lambda x, y: S - x, lambda x, y: y)], p)
    calha_rincao(M, (h, h), (0, S), p, (lambda x, y: S - y, lambda x, y: x), limites=(0, 0, S, S))
    calha_rincao(M, (h, h), (S, S), p, (lambda x, y: S - x, lambda x, y: S - y), limites=(0, 0, S, S))
    obs = M._rincoes + [M.objeto("corpo")]
    zc = zt(h, p) + SOBE_CUM
    obs += tubo_cumeeira([(0, h, zc), (S, h, zc)], aneis=[(k + 0.5) / S for k in range(int(S))])
    obs += tubo_cumeeira([(h, h, zc), (h, S, zc)], aneis=[(k + 0.5) / h for k in range(int(h))])
    obs.append(bola((h, h, zc)))
    return obs


def beiral(p, L):
    M = Malha()
    di = -(BEIRAL - FASCIA)
    laje_telhado(M, [([(0, di), (L, di), (L, 0), (0, 0)], lambda x, y: y, lambda x, y: x)], p)
    testeira(M, 0, L, -BEIRAL, p)
    return [M.objeto("beiral")]


def beiral_canto_externo(p):
    M = Malha()
    di = -(BEIRAL - FASCIA)
    laje_telhado(M, [([(di, di), (0, di), (0, 0)], lambda x, y: y, lambda x, y: x),
                     ([(di, di), (0, 0), (di, 0)], lambda x, y: x, lambda x, y: -y)], p)
    testeira(M, -BEIRAL + FASCIA, 0, -BEIRAL, p)
    M.prisma([(-BEIRAL, zu(-BEIRAL, p) - 0.07), (0, zu(-BEIRAL, p) - 0.07), (0, zt(di, p) + LABIO),
              (-BEIRAL, zt(di, p) + LABIO)], -BEIRAL, -BEIRAL + FASCIA, eixo="x")
    obs = [M.objeto("beiral")]
    obs += espigao((0, 0), (di + 0.02, di + 0.02), p, lambda x, y: x)
    obs.append(bola((di + 0.02, di + 0.02, zt(di + 0.02, p) + SOBE_CUM), 0.08))
    return obs


def beiral_canto_interno(p):
    M = Malha()
    b = -BEIRAL
    laje_telhado(M, [([(b, b), (0, 0), (b, 0)], lambda x, y: y, lambda x, y: x),
                     ([(b, b), (0, b), (0, 0)], lambda x, y: x, lambda x, y: -y)], p)
    di = -(BEIRAL - FASCIA)
    M.caixa(b - 0.001, b + FASCIA, b - 0.001, b + FASCIA, zu(b, p) - 0.07, zt(di, p) + LABIO)
    calha_rincao(M, (0, 0), (b + 0.03, b + 0.03), p, (lambda x, y: x, lambda x, y: y))
    return M._rincoes + [M.objeto("beiral")]


def beiral_alto(p, L):
    """Beiral do lado alto da meia-água (a testeira fica na ponta de fora, que é a mais alta)."""
    M = Malha()
    di = BEIRAL - FASCIA
    laje_telhado(M, [([(0, 0), (L, 0), (L, di), (0, di)], lambda x, y: y, lambda x, y: x)], p)
    M.caixa(0, L, di, BEIRAL, zu(di, p) - 0.07, zt(di, p) + LABIO)
    return [M.objeto("beiral")]


def empena_duas_aguas(S, p):
    """Ponta da empena (o beiral do oitão): cobre x de −0,5 a 0, com a testeira inclinada e a ponta da cumeeira."""
    M = Malha()
    di = BEIRAL - FASCIA
    h = S / 2
    laje_telhado(M, [([(-di, -di), (0, -di), (0, h), (-di, h)], lambda x, y: y, lambda x, y: x),
                     ([(-di, h), (0, h), (0, S + di), (-di, S + di)], lambda x, y: S - y, lambda x, y: -x)], p)
    d = lambda y: min(y, S - y)  # noqa: E731
    tv = E_TELHA * _k(p)
    pol = [(-BEIRAL, zt(d(-BEIRAL), p) + LABIO), (h, zt(h, p) + LABIO), (S + BEIRAL, zt(d(S + BEIRAL), p) + LABIO),
           (S + BEIRAL, zt(d(S + BEIRAL), p) - tv - 0.07), (h, zt(h, p) - tv - 0.07),
           (-BEIRAL, zt(d(-BEIRAL), p) - tv - 0.07)]
    M.prisma(pol, -BEIRAL, -BEIRAL + FASCIA, eixo="x")
    testeira(M, -di, 0, -BEIRAL, p)
    M.caixa(-di, 0, S + di, S + BEIRAL, zu(-BEIRAL, p) - 0.07, zt(-di, p) + LABIO)
    obs = [M.objeto("empena")]
    zc = zt(h, p) + SOBE_CUM
    obs += tubo_cumeeira([(-BEIRAL + 0.01, h, zc), (0, h, zc)])
    obs.append(bola((-BEIRAL + 0.01, h, zc), 0.08))
    return obs


def empena_meia_agua(S, p, lado):
    """Ponta da meia-água (lado "esq": x de −0,5 a 0; "dir": x de 0 a 0,5)."""
    M = Malha()
    di = BEIRAL - FASCIA
    s = -1 if lado == "esq" else 1
    xa, xb = sorted((0, s * di))
    laje_telhado(M, [([(xa, -di), (xb, -di), (xb, S + di), (xa, S + di)], lambda x, y: y, lambda x, y: x)], p)
    tv = E_TELHA * _k(p)
    pol = [(-BEIRAL, zt(-BEIRAL, p) + LABIO), (S + BEIRAL, zt(S + BEIRAL, p) + LABIO),
           (S + BEIRAL, zt(S + BEIRAL, p) - tv - 0.07), (-BEIRAL, zt(-BEIRAL, p) - tv - 0.07)]
    a0, a1 = sorted((s * BEIRAL, s * di))
    M.prisma(pol, a0, a1, eixo="x")
    testeira(M, xa, xb, -BEIRAL, p)
    M.caixa(xa, xb, S + di, S + BEIRAL, zu(S + di, p) - 0.07, zt(S + di, p) + LABIO)
    return [M.objeto("empena")]


# ---------------------------------------------------------------------------------------------------- paredes
def parede_contorno(contorno, nome="parede", espelha_v=True, pontas_face=True):
    """Parede de 15 cm com qualquer contorno no plano (x, z): face_a em +y (dentro), face_b em −y (fora), "borda" no
    alto e nos recortes. As pontas verticais em x = 0 e x = máx levam a cor das faces (como as paredes da biblioteca).
    espelha_v: o UV sobe espelhado (v = 1 − z/3): a textura continua sem salto a partir do topo da parede de baixo."""
    import mathutils.geometry as G
    cont = ccw(contorno)
    M = Malha()
    xs = [x for x, _ in cont]
    xmin, xmax = min(xs), max(xs)
    vfn = (lambda z: 1 - z / 3) if espelha_v else (lambda z: z / 3)
    tris = G.tessellate_polygon([[V((x, z, 0)) for x, z in cont]])
    for t in tris:
        pa = [cont[i] for i in t]
        M.f([(x, MEIA, z) for x, z in pa], "face_a", uv=[(-x / 3, vfn(z)) for x, z in pa], fora=(0, 1, 0))
        M.f([(x, -MEIA, z) for x, z in pa], "face_b", uv=[(x / 3, vfn(z)) for x, z in pa], fora=(0, -1, 0))
    for (xa, za), (xb, zb) in zip(cont, cont[1:] + cont[:1]):
        if abs(za) < 1e-6 and abs(zb) < 1e-6:
            continue
        fora = (zb - za, 0, -(xb - xa))
        if pontas_face and abs(xa - xb) < 1e-6 and (abs(xa - xmin) < 1e-6 or abs(xa - xmax) < 1e-6):
            for s_, mat in ((1, "face_a"), (-1, "face_b")):
                q = [(xa, 0, za), (xb, 0, zb), (xb, s_ * MEIA, zb), (xa, s_ * MEIA, za)]
                u = (-xa if mat == "face_a" else xa) / 3
                M.f(q, mat, uv=[(u, vfn(q_[2])) for q_ in q], fora=fora)
            continue
        q = [(xa, MEIA, za), (xb, MEIA, zb), (xb, -MEIA, zb), (xa, -MEIA, za)]
        M.f(q, "borda", fora=fora)
    return M.objeto(nome)


def oitao(S, p):
    x0 = max(0.0, MEIA - 0.02 / p)
    topo = lambda x: zu(min(x, S - x), p) + 0.02  # noqa: E731
    if x0 > 0:
        cont = [(x0, 0), (S - x0, 0), (S / 2, topo(S / 2))]
    else:
        cont = [(0, 0), (S, 0), (S, topo(S)), (S / 2, topo(S / 2)), (0, topo(0))]
    return [parede_contorno(cont, "oitao")]


def oitao_meia_agua(S, p, sentido):
    x0 = max(0.0, MEIA - 0.02 / p)
    topo = lambda d: zu(d, p) + 0.02  # noqa: E731
    if x0 > 0:
        cont = [(x0, 0), (S, 0), (S, topo(S))]
    else:
        cont = [(0, 0), (S, 0), (S, topo(S)), (0, topo(0))]
    if sentido == "desce":
        cont = [(S - x, z) for x, z in cont]
    return [parede_contorno(cont, "oitao")]


def parede_complemento(L, h):
    return [parede_contorno([(0, 0), (L, 0), (L, h), (0, h)], "complemento")]


# ---------------------------------------------------------------------------------------------------- mansarda
M_RUN, M_SOBE, M_INC = 0.5, 1.5, 0.25  # parte de baixo da mansarda: 0,5 m para dentro, sobe 1,5 m; em cima, 25 %


def _mansarda_topo(S):
    z0 = zt(0, M_INC)
    zr = z0 + M_SOBE + (S / 2 - M_RUN) * M_INC
    return [(0, z0), (M_RUN, z0 + M_SOBE), (S / 2, zr), (S - M_RUN, z0 + M_SOBE), (S, z0)]


def _offset_baixo(pts, e):
    """Linha deslocada e para baixo (perpendicular a cada trecho), com os cantos na interseção dos trechos."""
    linhas = []
    for (ya, za), (yb, zb) in zip(pts, pts[1:]):
        t = V((yb - ya, zb - za)).normalized()
        n = V((t.y, -t.x))  # para baixo/fora
        if n.y > 0:
            n = -n
        linhas.append((V((ya, za)) + n * e, t))
    out = [linhas[0][0]]
    for (pa, ta), (pb, tb) in zip(linhas, linhas[1:]):
        den = ta.x * tb.y - ta.y * tb.x
        s = ((pb - pa).x * tb.y - (pb - pa).y * tb.x) / den
        out.append(pa + ta * s)
    pl, tl = linhas[-1]
    ult = V(pts[-1])
    out.append(pl + tl * (ult - pl).dot(tl))
    return [(q.x, q.y) for q in out]


def _mansarda_secao(S, beirais=False):
    topo = _mansarda_topo(S)
    if beirais:
        di = BEIRAL - FASCIA
        topo = [(-di, zt(-di, M_INC))] + topo + [(S + di, zt(-di, M_INC))]
    base = _offset_baixo(topo, E_TELHA)
    return topo, base


def corpo_mansarda(S, L, x0=0.0):
    topo, base = _mansarda_secao(S)
    M = Malha()
    _extruda_secao(M, topo, base, x0, x0 + L, S)
    for y0, y1 in ((0.0, 0.12), (S - 0.12, S)):  # frechal: fecha os 1,4 cm entre o topo da parede e a laje inclinada
        M.caixa(x0, x0 + L, y0, y1, -0.02, 0.04)
    return [M.objeto("corpo")]


def _extruda_secao(M, topo, base, x0, x1, S):
    """Laje de seção qualquer (linha de cima e linha de baixo em (y, z), da frente para o fundo) estendida em x. Topo em
    "telha" com v = distância ao longo da água a partir da linha do beiral (y = 0 na frente, y = S no fundo)."""
    s_acum = [0.0]
    for (ya, za), (yb, zb) in zip(topo, topo[1:]):
        s_acum.append(s_acum[-1] + math.hypot(yb - ya, zb - za))
    i0 = min(range(len(topo)), key=lambda i: abs(topo[i][0]))
    iS = min(range(len(topo)), key=lambda i: abs(topo[i][0] - S))
    for i in range(len(topo) - 1):
        (ya, za), (yb, zb) = topo[i], topo[i + 1]
        if (ya + yb) / 2 < S / 2:
            va, vb = s_acum[i] - s_acum[i0], s_acum[i + 1] - s_acum[i0]
            ua, ub = x0 / 2, x1 / 2
        else:
            va, vb = s_acum[iS] - s_acum[i], s_acum[iS] - s_acum[i + 1]
            ua, ub = -x0 / 2, -x1 / 2
        M.f([(x0, ya, za), (x1, ya, za), (x1, yb, zb), (x0, yb, zb)], "telha",
            uv=[(ua, va / 2), (ub, va / 2), (ub, vb / 2), (ua, vb / 2)], fora=(0, 0, 1))
    for (ya, za), (yb, zb) in zip(base, base[1:]):
        M.f([(x0, ya, za), (x1, ya, za), (x1, yb, zb), (x0, yb, zb)], "borda", fora=(0, 0, -1))
    for (ya, za), (yb, zb), s_ in ((topo[0], base[0], -1), (topo[-1], base[-1], 1)):
        M.f([(x0, ya, za), (x1, ya, za), (x1, yb, zb), (x0, yb, zb)], "borda", fora=(0, s_, 0))
    sec = topo + base[::-1]
    M.f([(x0, y, z) for y, z in sec], "borda", fora=(-1, 0, 0))
    M.f([(x1, y, z) for y, z in sec], "borda", fora=(1, 0, 0))


def empena_mansarda(S):
    di = BEIRAL - FASCIA
    topo, base = _mansarda_secao(S, beirais=True)
    M = Malha()
    _extruda_secao(M, topo, base, -di, 0, S)
    ext = [(-BEIRAL, topo[0][1] - (BEIRAL - di) * M_INC)] + topo + [(S + BEIRAL, topo[-1][1] - (BEIRAL - di) * M_INC)]
    pol = [(y, z + LABIO) for y, z in ext] + [(y, z - 0.07) for y, z in
                                              ([(-BEIRAL, base[0][1] - (BEIRAL - di) * M_INC)] + base +
                                               [(S + BEIRAL, base[-1][1] - (BEIRAL - di) * M_INC)])][::-1]
    M.prisma(pol, -BEIRAL, -BEIRAL + FASCIA, eixo="x")
    testeira(M, -di, 0, -BEIRAL, M_INC)
    M.caixa(-di, 0, S + di, S + BEIRAL, zu(-BEIRAL, M_INC) - 0.07, zt(-di, M_INC) + LABIO)
    obs = [M.objeto("empena")]
    zc = topo[len(topo) // 2][1] + SOBE_CUM
    obs += tubo_cumeeira([(-BEIRAL + 0.01, S / 2, zc), (0, S / 2, zc)])
    obs.append(bola((-BEIRAL + 0.01, S / 2, zc), 0.08))
    return obs


def oitao_mansarda(S):
    topo, base = _mansarda_secao(S)
    pts = [(y, z + 0.02) for y, z in base]
    cont = [(0.0, 0.0), (S, 0.0), (S, pts[-1][1])] + pts[::-1] + [(0.0, pts[0][1])]
    return [parede_contorno(cont, "oitao")]


def cumeeira_peca(L):
    return tubo_cumeeira([(0, 0, SOBE_CUM), (L, 0, SOBE_CUM)], aneis=[(k + 0.5) / (L * 2) for k in range(int(L * 2))])


def rufo_parede(p, L):
    """Rufo do encontro de uma água com a parede: a parede fica em y > 0; a telha chega na face dela com o topo em
    z = 0 (a origem)."""
    M = Malha()
    a = 0.20
    # aba deitada sobre a telha
    for x0, x1 in ((0, L),):
        M.f([(x0, -a, -a * p + 0.004), (x1, -a, -a * p + 0.004), (x1, 0, 0.004), (x0, 0, 0.004)], "atlas",
            cor="metal_claro", fora=(0, 0, 1))
        M.f([(x0, -a, -a * p - 0.006), (x1, -a, -a * p - 0.006), (x1, 0, -0.006), (x0, 0, -0.006)], "atlas",
            cor="metal_claro", fora=(0, 0, -1))
        M.f([(x0, -a, -a * p - 0.006), (x1, -a, -a * p - 0.006), (x1, -a, -a * p + 0.004), (x0, -a, -a * p + 0.004)],
            "atlas", cor="metal_claro", fora=(0, -1, 0))
    M.caixa(0, L, -0.012, 0.0, -0.006, 0.20, "atlas", cor="metal_claro")  # aba de pé, encostada na parede
    M.caixa(0, L, -0.035, 0.0, 0.18, 0.205, "atlas", cor="metal_claro")  # pingadeira em cima
    return [M.objeto("rufo")]


def rufo_platibanda(L, canto=False):
    """Capa (rufo) do alto da platibanda: 20 cm de largura (passa 2,5 cm de cada face da mureta), 5 cm de altura, com
    pingadeira. Origem no alto da mureta, na linha da grade."""
    M = Malha()
    if canto:
        M.caixa(-0.1, 0.1, -0.1, 0.1, 0.0, 0.05, "atlas", cor="metal_claro")
        M.caixa(-0.105, 0.105, -0.105, 0.105, -0.025, 0.01, "atlas", cor="metal_claro")
    else:
        M.caixa(0, L, -0.1, 0.1, 0.0, 0.05, "atlas", cor="metal_claro")
        M.caixa(0, L, -0.105, 0.105, -0.025, 0.01, "atlas", cor="metal_claro")
    return [M.objeto("rufo")]


# =====================================================================================================================
# Andar: lajes, chão, cinta, escadas e guarda-corpo
# =====================================================================================================================
def placa(pol, esp, mat_topo="piso", nome="laje", mat_baixo="borda"):
    """Placa com o contorno pol (anti-horário, pode ser côncavo), topo em z = 0 e espessura esp para baixo. O topo em
    "piso" (UV em metros / 2, como o chão)."""
    pol = ccw(pol)
    M = Malha()
    M.f([(x, y, 0) for x, y in pol], mat_topo, uv=[(x / 2, y / 2) for x, y in pol], fora=(0, 0, 1))
    M.f([(x, y, -esp) for x, y in pol], mat_baixo, fora=(0, 0, -1))
    for a, b in zip(pol, pol[1:] + pol[:1]):
        M.f([(a[0], a[1], -esp), (b[0], b[1], -esp), (b[0], b[1], 0), (a[0], a[1], 0)], "borda",
            fora=(b[1] - a[1], -(b[0] - a[0]), 0))
    return M.objeto(nome)


def ret(x0, y0, x1, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


LAJE_ABERTURAS = {  # contorno da laje 4 × 4 com a abertura da escada; "escada": onde fica a origem da escada
    "reta": ([(1, 0), (4, 0), (4, 4), (0, 4), (0, 3), (1, 3)], "escada_reta", (0, -1)),
    "l_dir": ([(0, 0), (4, 0), (4, 4), (0, 4), (0, 3), (3, 3), (3, 2), (1, 2), (1, 1), (0, 1)], "escada_l_dir", (0, 0)),
    "l_esq": ([(0, 0), (4, 0), (4, 4), (0, 4), (0, 3), (4 - 0, 3)], None, None),
    "u": ([(0, 0), (4, 0), (4, 4), (2, 4), (2, 1), (0, 1)], "escada_u_dir", (0, 1)),
    "caracol": ([(2, 0), (4, 0), (4, 4), (0, 4), (0, 2), (2, 2)], "escada_caracol", (0, 0)),
}
# L esquerda: o espelho da direita (x → 4 − x), com a escada começando em x = 1
LAJE_ABERTURAS["l_esq"] = ([(4 - x, y) for x, y in LAJE_ABERTURAS["l_dir"][0]], "escada_l_esq", (1, 0))


def cinta(L, canto=False):
    """Cinta (friso) entre os andares: a metade de fora da linha da parede, 9 cm para fora (1,5 cm além da face) e de
    z = −0,25 a 0 (a origem é o piso do andar de cima). Fecha a borda da laje por fora."""
    M = Malha()
    if canto:
        M.caixa(-0.09, 0, -0.09, 0, -0.25, 0)
    else:
        M.caixa(0, L, -0.09, 0, -0.25, 0)
    return [M.objeto("cinta")]


def _solido_lance(n, r, g, w, z0=0.0, folga=0.035):
    """Degraus maciços de um lance subindo em +y (x de 0 a w), o degrau j com o topo em z0 + j·r − folga (a tábua do
    piso completa); embaixo é cheio até o chão."""
    pol = [(0, 0)]
    for j in range(1, n + 1):
        pol += [((j - 1) * g, z0 + j * r - folga), (j * g, z0 + j * r - folga)]
    pol.append((n * g, 0))
    M = Malha()
    M.prisma(pol, 0, w, eixo="x", mat="atlas", cor="branco")
    return M.objeto("degraus")


def _tabuas(n, r, g, w, z0=0.0, nariz=0.025, ini=1):
    obs = []
    for j in range(ini, n + 1):
        obs.append(mb.caixa(w + 0.01, g + nariz, 0.035, x=w / 2, y=(j - 0.5) * g - nariz / 2, z=z0 + j * r - 0.035,
                            cor="madeira_mel", bisel=0.006, seg=1))
    return obs


def _move(obs, M4):
    for o in obs:
        o.data.transform(M4)
    return obs


def _corrimao(pts_base, alt=0.9, postes_cada=2, r_tubo=0.028):
    """Corrimão: tubo de madeira a alt acima dos pontos (bordas dos degraus) e balaústres brancos."""
    obs = [mb.tubo([(x, y, z + alt) for x, y, z in pts_base], r_tubo, cor="madeira", seg=10, raio_curva=0.12)]
    for k, (x, y, z) in enumerate(pts_base):
        if k % postes_cada == 0 or k == len(pts_base) - 1:
            obs.append(mb.cilindro(0.018, alt, x=x, y=y, z=z, cor="branco", seg=8, bisel=0.004))
    return obs


def _malha_rampa(quads, nome="colisao_malha"):
    M = Malha()
    for q in quads:
        M.f(q, "atlas", cor="cinza", fora=(0, 0, 1))
    return M.objeto(nome)


def escada(tipo):
    """Escadas maciças com piso de madeira, corrimão no lado livre e malha de colisão (rampa sobre os bocéis).
    reta: 16 espelhos de 0,20 m e pisos de 0,25 m, 1 × 4 m (sobe em +y; o último degrau já é o piso de cima);
    l_dir / l_esq: 17 espelhos de 3,2/17 m, 3 × 3 m (8 degraus, patamar 1 × 1, 8 degraus); u_dir / u_esq: 2 × 3 m;
    caracol: 2 × 2 m, 15 degraus em leque e o patamar de chegada no quadrante de cima à direita."""
    g, w = 0.25, 1.0
    obs, col, caixas = [], [], []
    if tipo == "reta":
        n, r = 16, ANDAR / 16
        obs += [_solido_lance(n, r, g, w)] + _tabuas(n, r, g, w)
        obs += _corrimao([(w - 0.06, (j - 0.5) * g, j * r) for j in range(1, n + 1)])
        col.append([(0, 0, 0), (w, 0, 0), (w, n * g, n * r), (0, n * g, n * r)])
        caixas = [((w / 2, k + 0.5, 0), (w, 1.0, max(0.05, (k * 4) * r - 0.05))) for k in range(4)]
        caixas.append(((w - 0.06, 2.0, 0), (0.08, 4.0, ANDAR + 0.95)))  # corrimão
        return obs, col, caixas, (1.0, 4.0)
    if tipo in ("l_dir", "l_esq", "u_dir", "u_esq"):
        n1, n2, r = 8, 8, ANDAR / 17
        z_pat = (n1 + 1) * r
        obs += [_solido_lance(n1, r, g, w)] + _tabuas(n1, r, g, w)
        l2 = [_solido_lance(n2, r, g, w, z0=z_pat)] + _tabuas(n2, r, g, w, z0=z_pat)
        if tipo.startswith("l"):
            # patamar 1 × 1 em y 2..3; o segundo lance sobe em +x de x = 1 a 3, em y 2..3
            pat = [mb.caixa(1.0, 1.0, z_pat - 0.035, x=0.5, y=2.5, z=0, cor="branco", bisel=0.004, seg=1),
                   mb.caixa(1.01, 1.01, 0.035, x=0.5, y=2.5, z=z_pat - 0.035, cor="madeira_mel", bisel=0.006, seg=1)]
            M4 = Matrix.Translation((1.0, 3.0, 0)) @ Matrix.Rotation(-math.pi / 2, 4, "Z")
            _move(l2, M4)
            obs += pat + l2
            trilho = [(w - 0.06, (j - 0.5) * g, j * r) for j in range(1, n1 + 1)] + [(w - 0.06, 2 - 0.06, z_pat)]
            trilho += [(1 + (j - 0.5) * g, 2.06, z_pat + j * r) for j in range(1, n2 + 1)]
            obs += _corrimao(trilho)
            col += [[(0, 0, 0), (1, 0, 0), (1, 2, n1 * r), (0, 2, n1 * r)],
                    [(0, 2, z_pat), (1, 2, z_pat), (1, 3, z_pat), (0, 3, z_pat)],
                    [(1, 2, z_pat), (3, 2, ANDAR), (3, 3, ANDAR), (1, 3, z_pat)]]
            caixas = [((0.5, 1.0, 0), (1, 2, n1 * r * 0.45)), ((0.5, 2.5, 0), (1, 1, z_pat - 0.05)),
                      ((2.0, 2.5, 0), (2, 1, z_pat)),
                      ((w - 0.06, 1.0, 0), (0.08, 2.0, z_pat + 0.95)), ((2.0, 2.06, 0), (2.0, 0.08, ANDAR + 0.95))]
            ext = (3.0, 3.0)
        else:
            pat = [mb.caixa(2.0, 1.0, z_pat - 0.035, x=1.0, y=2.5, z=0, cor="branco", bisel=0.004, seg=1),
                   mb.caixa(2.01, 1.01, 0.035, x=1.0, y=2.5, z=z_pat - 0.035, cor="madeira_mel", bisel=0.006, seg=1)]
            M4 = Matrix.Translation((2.0, 2.0, 0)) @ Matrix.Rotation(math.pi, 4, "Z")
            _move(l2, M4)
            obs += pat + l2
            trilho = [(w - 0.06, (j - 0.5) * g, j * r) for j in range(1, n1 + 1)] + [(w - 0.06, 2.06, z_pat),
                                                                                    (w + 0.06, 2.06, z_pat)]
            trilho += [(w + 0.06, 2 - (j - 0.5) * g, z_pat + j * r) for j in range(1, n2 + 1)]
            obs += _corrimao(trilho)
            col += [[(0, 0, 0), (1, 0, 0), (1, 2, n1 * r), (0, 2, n1 * r)],
                    [(0, 2, z_pat), (2, 2, z_pat), (2, 3, z_pat), (0, 3, z_pat)],
                    [(1, 2, z_pat), (2, 2, z_pat), (2, 0, ANDAR), (1, 0, ANDAR)]]
            caixas = [((0.5, 1.0, 0), (1, 2, n1 * r * 0.45)), ((1.0, 2.5, 0), (2, 1, z_pat - 0.05)),
                      ((1.5, 1.0, 0), (1, 2, z_pat)), ((1.0, 1.0, 0), (0.2, 2.0, ANDAR + 0.95))]
            ext = (2.0, 3.0)
        if tipo.endswith("esq"):  # espelho em x dentro da mesma caixa
            Mx = Matrix.Translation((ext[0], 0, 0)) @ Matrix.Diagonal((-1, 1, 1, 1))
            for o in obs:
                o.data.transform(Mx)
                o.data.flip_normals()
            col = [[(ext[0] - x, y, z) for x, y, z in q][::-1] for q in col]
            caixas = [((ext[0] - c[0], c[1], c[2]), t) for c, t in caixas]
        return obs, col, caixas, ext
    if tipo == "caracol":
        n, r = 16, ANDAR / 16
        cx, cy, ri, re = 1.0, 1.0, 0.07, 0.96
        a0, a1 = math.radians(90), math.radians(360)
        da = (a1 - a0) / (n - 1)
        obs.append(mb.cilindro(0.075, ANDAR + 0.95, x=cx, y=cy, z=0, cor="branco", seg=16, bisel=0.01))
        trilho = []
        for j in range(1, n):
            aa, ab = a0 + (j - 1) * da, a0 + j * da
            pts = [(cx + ri * math.cos(aa), cy + ri * math.sin(aa))]
            for k in range(5):
                t = aa + (ab - aa) * k / 4
                pts.append((cx + re * math.cos(t), cy + re * math.sin(t)))
            pts.append((cx + ri * math.cos(ab), cy + ri * math.sin(ab)))
            ob = mb.extrudado(ccw(pts), 0.05, z=j * r - 0.05, cor="madeira_mel", bisel=0.006, seg=1, nome="degrau")
            obs.append(ob)
            am = (aa + ab) / 2
            trilho.append((cx + (re - 0.05) * math.cos(am), cy + (re - 0.05) * math.sin(am), j * r))
            col.append([(cx + ri * math.cos(aa), cy + ri * math.sin(aa), (j - 1) * r),
                        (cx + re * math.cos(aa), cy + re * math.sin(aa), (j - 1) * r),
                        (cx + re * math.cos(ab), cy + re * math.sin(ab), j * r),
                        (cx + ri * math.cos(ab), cy + ri * math.sin(ab), j * r)])
        # patamar de chegada: o quadrante x 1..2, y 1..2, no nível do andar de cima
        obs.append(mb.caixa(1.0, 1.0, 0.05, x=1.5, y=1.5, z=ANDAR - 0.05, cor="madeira_mel", bisel=0.006, seg=1))
        obs.append(mb.caixa(0.96, 0.96, 0.10, x=1.5, y=1.5, z=ANDAR - 0.15, cor="branco", bisel=0.006, seg=1))
        trilho += [(1.0 + 0.04, 1.0 + 0.10, ANDAR), (1.0 + 0.04, 1.96, ANDAR)]
        obs += _corrimao(trilho, postes_cada=1)
        col.append([(1, 1, ANDAR), (2, 1, ANDAR), (2, 2, ANDAR), (1, 2, ANDAR)])
        caixas = [((1.0, 1.0, 0), (0.2, 0.2, ANDAR + 0.95)), ((1.5, 1.5, ANDAR - 0.15), (1.0, 1.0, 0.15))]
        for k, (qx, qy) in enumerate(((0.5, 1.5), (0.5, 0.5), (1.5, 0.5))):  # embaixo dos degraus de cada quadrante
            caixas.append(((qx, qy, 0), (1.0, 1.0, max(0.02, (1 + 5 * k) * r - 0.06))))
        return obs, col, caixas, (2.0, 2.0)
    raise ValueError(tipo)


def guarda_corpo(estilo, L, fim=False):
    """Guarda-corpo de 1 m: o módulo traz o poste do começo (x = 0) e vai até x = L; "fim" é o poste da ponta solta.
    Fica do lado +y da linha (em cima do piso), centrado em y = 0,06."""
    obs = []
    yc = 0.06
    if estilo == "vidro":
        poste = lambda x, lado=0.05: [mb.caixa(lado, lado, 1.0, x=x, y=yc, cor="metal_claro", bisel=0.008)]  # noqa
    elif estilo == "metal":
        poste = lambda x, lado=0.05: [mb.caixa(lado, lado, 1.0, x=x, y=yc, cor="grafite", bisel=0.008)]  # noqa
    else:
        poste = lambda x, lado=0.08: [mb.caixa(lado, lado, 1.02, x=x, y=yc, cor="branco", bisel=0.012),  # noqa
                                      mb.caixa(lado + 0.03, lado + 0.03, 0.04, x=x, y=yc, z=1.0, cor="branco",
                                               bisel=0.01)]
    if fim:
        lado = {"vidro": 0.06, "metal": 0.06, "madeira": 0.10}[estilo]
        obs += poste(0.0, lado)
        obs.append(mb.esfera(lado * 0.6, x=0, y=yc, z=1.0 + (0.06 if estilo == "madeira" else 0.02),
                             cor="branco" if estilo == "madeira" else "metal_claro", seg=12))
        return obs
    obs += poste(0.0)
    if estilo == "vidro":
        obs.append(mb.tubo([(0, yc, 1.0), (L, yc, 1.0)], 0.024, cor="metal_claro", seg=10))
        obs.append(mb.caixa(L - 0.06, 0.012, 0.86, x=L / 2, y=yc, z=0.08, mat="vidro", bisel=0.003, seg=1))
        for x in (0.05, L - 0.05):
            for z in (0.15, 0.85):
                obs.append(mb.cilindro(0.012, 0.03, x=x, y=yc, z=z, cor="metal_claro", eixo="y", seg=8))
    elif estilo == "metal":
        obs.append(mb.tubo([(0, yc, 1.0), (L, yc, 1.0)], 0.022, cor="grafite", seg=10))
        obs.append(mb.caixa(L, 0.03, 0.03, x=L / 2, y=yc, z=0.07, cor="grafite", bisel=0.006))
        n = max(1, int(round(L / 0.11)))
        for k in range(1, n):
            obs.append(mb.cilindro(0.01, 0.9, x=k * L / n, y=yc, z=0.08, cor="grafite", seg=6, bisel=0.0))
    else:
        obs.append(mb.caixa(L, 0.07, 0.05, x=L / 2, y=yc, z=0.95, cor="madeira", bisel=0.012, seg=2))
        obs.append(mb.caixa(L, 0.05, 0.04, x=L / 2, y=yc, z=0.08, cor="branco", bisel=0.008, seg=1))
        n = max(1, int(round(L / 0.13)))
        for k in range(1, n):
            obs.append(mb.caixa(0.05, 0.022, 0.83, x=k * L / n, y=yc, z=0.12, cor="branco", bisel=0.006, seg=1))
    return obs


# =====================================================================================================================
# Fundação e acesso
# =====================================================================================================================
SOCO_FORA = 0.105  # o soco passa 3 cm da face de fora da parede
FUNDACOES = (0.30, 0.45, 0.60)


def soco(h, L, canto=False):
    """Fundação (embasamento): faixa na linha da parede, do chão (z = 0) até o piso (z = h). Por dentro fica rente à
    face de dentro da parede; por fora passa 3 cm (y de −0,105 a 0,075). Origem no chão, na linha da grade."""
    if canto:
        return [mb.caixa(SOCO_FORA, SOCO_FORA, h, x=-SOCO_FORA / 2, y=-SOCO_FORA / 2, cor="concreto", bisel=0.004, seg=1),
                mb.caixa(SOCO_FORA + 0.01, SOCO_FORA + 0.01, 0.062, x=-SOCO_FORA / 2, y=-SOCO_FORA / 2, z=0,
                         cor="concreto_escuro", bisel=0.004, seg=1)]
    return [mb.caixa(L, SOCO_FORA, h, x=L / 2, y=-SOCO_FORA / 2, cor="concreto", bisel=0.004, seg=1),
            mb.caixa(L, MEIA, h - 0.004, x=L / 2, y=MEIA / 2, cor="concreto", bisel=0.0, seg=1),
            mb.caixa(L, 0.012, 0.06, x=L / 2, y=-SOCO_FORA - 0.004, z=0, cor="concreto_escuro", bisel=0.003, seg=1)]


def degraus_entrada(h, larg=1.5):
    """Degraus de entrada até o piso (z = h): espelhos de 0,15 m, pisos de 0,30 m e um patamar de 0,45 m na porta.
    Origem no chão, no meio da largura, na linha da grade da parede; descem para −y a partir da face do soco."""
    n = int(round(h / 0.15))
    r = h / n
    caixas, quads = [], []
    pol = [(-SOCO_FORA, 0.0), (-SOCO_FORA, h)]
    for k in range(n, 0, -1):
        D = 0.45 + (n - k) * 0.30
        pol += [(-SOCO_FORA - D, k * r), (-SOCO_FORA - D, (k - 1) * r)]
        caixas.append(((0, -SOCO_FORA - D / 2, 0), (larg, D, k * r)))
    obs = [mb.extrudado(ccw(pol), larg, x=-larg / 2, cor="areia", bisel=0.012, seg=2, plano="yz", liso=False)]
    D = 0.45 + (n - 1) * 0.30
    quads.append([(-larg / 2, -SOCO_FORA - D, 0), (larg / 2, -SOCO_FORA - D, 0),
                  (larg / 2, -SOCO_FORA - 0.45, h), (-larg / 2, -SOCO_FORA - 0.45, h)])
    quads.append([(-larg / 2, -SOCO_FORA - 0.45, h), (larg / 2, -SOCO_FORA - 0.45, h), (larg / 2, -SOCO_FORA, h),
                  (-larg / 2, -SOCO_FORA, h)])
    return obs, caixas, quads


def corrimao_rampa(x, y0, y1, z0, z1):
    obs = []
    for zz in (0.9, 0.7):
        pts = [(x, y0 - 0.3, z0 + zz), (x, y0, z0 + zz), (x, y1, z1 + zz), (x, y1 + 0.3, z1 + zz)]
        obs.append(mb.tubo(pts, 0.022, cor="metal_claro", seg=10, raio_curva=0.1))
    n = max(2, int(round((y1 - y0) / 1.0)) + 1)
    for k in range(n):
        y = y0 + (y1 - y0) * k / (n - 1)
        z = z0 + (z1 - z0) * k / (n - 1)
        obs.append(mb.cilindro(0.025, 0.9, x=x, y=y, z=z, cor="metal_claro", seg=10, bisel=0.004))
    return obs


def rampa(h):
    """Rampa acessível de 7,5 % (1:13,3): sobe h em h/0,075 m, 1,5 m de largura (1,3 livre e guias de 0,1), corrimão
    duplo (0,90 e 0,70) dos dois lados, passando 0,30 m das pontas. Origem no pé da rampa, no meio; sobe em +y."""
    L = round(h / 0.075, 3)
    M = Malha()
    M.prisma([(0, 0), (L, h), (L, 0)], -0.75, 0.75, eixo="x", mat="atlas", cor="concreto")
    obs = [M.objeto("rampa")]
    for s in (-1, 1):  # guias laterais
        Mg = Malha()
        Mg.prisma([(0, 0), (0, 0.1), (L, h + 0.1), (L, h)], s * 0.75 - (0.1 if s > 0 else 0),
                  s * 0.75 + (0 if s > 0 else 0.1), eixo="x", mat="atlas", cor="concreto_escuro")
        obs.append(Mg.objeto("guia"))
        obs += corrimao_rampa(s * 0.70, 0.0, L, 0.1, h + 0.1)
    for k in range(1, int(L / 0.5)):  # frisos antiderrapantes
        y = k * 0.5
        obs.append(mb.caixa(1.25, 0.03, 0.006, x=0, y=y, z=h * y / L - 0.002, cor="concreto_escuro", bisel=0.0))
    quads = [[(-0.65, 0, 0), (0.65, 0, 0), (0.65, L, h), (-0.65, L, h)]]
    caixas = [((0, L * (k + 0.5) / 4, 0), (1.5, L / 4, h * k / 4 + 0.001)) for k in range(4)]
    caixas += [((s * 0.70, L / 2, 0), (0.12, L, h + 1.0)) for s in (-1, 1)]  # guias e corrimãos
    return obs, caixas, quads, L


def patamar(h):
    """Patamar de 1,5 × 1,5 m na altura do piso, encostado no soco diante da porta (a rampa chega pelo lado +x).
    Origem no chão, no meio da largura, na linha da grade; o patamar vai de y = −0,105 a −1,605."""
    y0 = -SOCO_FORA
    obs = [mb.caixa(1.5, 1.5, h, x=0, y=y0 - 0.75, cor="concreto", bisel=0.01, seg=2)]
    obs += corrimao_rampa(-0.70, y0 - 1.45, y0 - 0.05, h, h)
    for x in (-0.70, 0.70):
        pass
    pts = [(0.70, y0 - 1.45, h + 0.9), (-0.70, y0 - 1.45, h + 0.9)]
    obs.append(mb.tubo(pts, 0.022, cor="metal_claro", seg=10))
    obs.append(mb.cilindro(0.025, 0.9, x=0.70, y=y0 - 1.45, z=h, cor="metal_claro", seg=10, bisel=0.004))
    return obs


def deck(h, lx, ly):
    """Piso de deck (varanda): tábuas de 14 cm ao longo de x com fresta de 1,2 cm, aro e saia até o chão. O topo fica
    2 cm abaixo do piso da casa (a origem, z = 0, é o piso da casa: a peça vai em z = h). Ocupa x 0..lx, y −ly..0 (a
    frente da casa fica em y = 0; encostado na fundação, a parte de y −0,105 a 0 fica escondida no soco)."""
    obs = []
    topo = -0.02
    n = int(round(ly / 0.152))
    passo = ly / n
    for k in range(n):
        y = -ly + (k + 0.5) * passo
        obs.append(mb.caixa(lx, passo - 0.012, 0.03, x=lx / 2, y=y, z=topo - 0.03,
                            cor="madeira_mel" if k % 3 else "madeira_clara", bisel=0.004, seg=1))
    obs.append(mb.caixa(lx - 0.02, ly - 0.02, 0.012, x=lx / 2, y=-ly / 2, z=topo - 0.045, cor="madeira_escura",
                        bisel=0.0, seg=1))
    zs0 = -h
    for (x0, x1, y0, y1) in ((0, lx, -ly, -ly + 0.03), (0, 0.03, -ly + 0.03, 0), (lx - 0.03, lx, -ly + 0.03, 0)):
        obs.append(mb.caixa(x1 - x0, y1 - y0, topo - 0.03 - zs0, x=(x0 + x1) / 2, y=(y0 + y1) / 2, z=zs0,
                            cor="madeira", bisel=0.004, seg=1))
    for x in [k * 0.5 + 0.25 for k in range(int(lx / 0.5))]:  # ripas da saia (relevo)
        obs.append(mb.caixa(0.05, 0.012, topo - 0.06 - zs0 - 0.05, x=x, y=-ly - 0.004, z=zs0 + 0.03,
                            cor="madeira_media", bisel=0.0, seg=1))
    return obs


def coluna(estilo, alt=2.8):
    """Coluna de varanda: a base começa no topo do deck (z = −0,02) e o capitel termina em z = alt (embaixo da viga)."""
    if estilo == "classica":
        perfil = [(0.0, -0.02), (0.15, -0.02), (0.15, 0.06), (0.12, 0.09), (0.11, 0.16), (0.095, 0.2),
                  (0.08, alt - 0.26), (0.095, alt - 0.2), (0.11, alt - 0.12), (0.11, alt - 0.08), (0.0, alt - 0.08)]
        obs = [mb.torno(perfil, cor="branco", seg=24)]
        obs.append(mb.caixa(0.26, 0.26, 0.08, z=alt - 0.08, cor="branco", bisel=0.012))
        obs.append(mb.caixa(0.30, 0.30, 0.08, z=-0.02, cor="branco", bisel=0.012))
        return obs
    obs = [mb.caixa(0.15, 0.15, alt - 0.1, z=0.08, cor="madeira", bisel=0.02, seg=2)]
    obs.append(mb.caixa(0.22, 0.22, 0.10, z=-0.02, cor="pedra" if "pedra" in mb.CORES else "cinza", bisel=0.015))
    obs.append(mb.caixa(0.20, 0.20, 0.06, z=alt - 0.06, cor="madeira_escura", bisel=0.012))
    return obs


def viga(L):
    M = Malha()
    M.caixa(0, L, -MEIA, MEIA, ALT - 0.2, ALT)
    return [M.objeto("viga")]


def sacada(W, D, estilo):
    """Sacada do andar de cima: laje em balanço de W × D presa na cinta (y de −0,09 − D a −0,09), topo 2 cm abaixo do
    piso do andar (a origem), guarda-corpo nos três lados livres (6 cm para dentro da borda) e duas mãos-francesas."""
    y1 = -0.09
    y0 = y1 - D
    o = placa(ret(0, y0, W, y1), 0.15, nome="laje")
    o.data.transform(Matrix.Translation((0, 0, -0.02)))
    obs = [o]
    e = 0.06
    T = lambda x, y, g: Matrix.Translation((x, y, -0.02)) @ Matrix.Rotation(math.radians(g), 4, "Z")  # noqa: E731
    obs += _move(guarda_corpo(estilo, W - 2 * e), T(e, y0, 0))
    obs += _move(guarda_corpo(estilo, D - e), T(0, y1, -90))
    obs += _move(guarda_corpo(estilo, D - e), T(W, y0 + e, 90))
    obs += _move(guarda_corpo(estilo, 0, fim=True), T(W, y1, 90))
    for x in (0.3, W - 0.3):
        m = mb.extrudado(ccw([(0, 0), (0.0, -0.40), (-min(0.5, D * 0.5), 0)]), 0.07, cor="branco", bisel=0.01,
                         plano="yz")
        mb.transforma(m, loc=(x - 0.035, y1, -0.17))
        obs.append(m)
    return obs


def alpendre(W):
    """Alpendre de entrada: meia-água de 25 % presa na parede (topo da telha em z = 2,6 na face da parede), 1,8 m
    para fora, duas colunas em y = −1,5 e o rufo no encontro com a parede. Origem no piso, na linha da grade."""
    p = 0.25
    k = _k(p)
    tv = E_TELHA * k
    y_par = -MEIA
    zt_a = lambda y: 2.6 + (y - y_par) * p  # noqa: E731  (y < 0: desce para fora)
    y_ext = -1.8
    M = Malha()
    pol = [(0, y_ext + FASCIA), (W, y_ext + FASCIA), (W, y_par), (0, y_par)]
    topo = [(x, y, zt_a(y)) for x, y in pol]
    M.f(topo, "telha", uv=[(x / 2, (y - y_ext) * k / 2) for x, y in pol], fora=(0, 0, 1))
    M.f([(x, y, z - tv) for x, y, z in topo], "borda", fora=(0, 0, -1))
    for a, b in zip(ccw(pol), ccw(pol)[1:] + ccw(pol)[:1]):
        za, zb = zt_a(a[1]), zt_a(b[1])
        M.f([(a[0], a[1], za - tv), (b[0], b[1], zb - tv), (b[0], b[1], zb), (a[0], a[1], za)], "borda",
            fora=(b[1] - a[1], -(b[0] - a[0]), 0))
    M.caixa(0, W, y_ext, y_ext + FASCIA, zt_a(y_ext) - tv - 0.08, zt_a(y_ext + FASCIA) + LABIO)
    for x0 in (0.0, W - FASCIA):  # testeiras das pontas
        M.prisma([(y_ext, zt_a(y_ext) - tv - 0.08), (y_par, zt_a(y_par) - tv - 0.08), (y_par, zt_a(y_par) + LABIO),
                  (y_ext, zt_a(y_ext) + LABIO)], x0, x0 + FASCIA, eixo="x")
    obs = [M.objeto("telhado")]
    z_viga = zt_a(-1.5) - tv - 0.16
    obs.append(mb.caixa(W - 0.1, 0.12, 0.16, x=W / 2, y=-1.5, z=z_viga, cor="branco", bisel=0.01))
    for x in (0.22, W - 0.22):
        obs += _move(coluna("classica", alt=z_viga), Matrix.Translation((x, -1.5, 0)))
    ru = rufo_parede(p, W)
    _move(ru, Matrix.Translation((0, y_par, zt_a(y_par))))
    obs += ru
    return obs, z_viga


# ---------------------------------------------------------------------------------------------------- luzes
def arandela():
    """Arandela de varanda (parede): espelho, braço e lanterna com vidro aceso (luz). Corpo de y = −0,22 a 0."""
    obs = [mb.caixa(0.12, 0.03, 0.2, x=0, y=-0.015, z=0.0, cor="grafite", bisel=0.008)]
    obs.append(mb.cilindro(0.015, 0.12, x=0, y=-0.09, z=0.12, cor="grafite", eixo="y", seg=8))
    obs.append(mb.caixa(0.13, 0.13, 0.03, x=0, y=-0.14, z=0.02, cor="grafite", bisel=0.008))
    obs.append(mb.caixa(0.10, 0.10, 0.16, x=0, y=-0.14, z=0.05, mat="luz", bisel=0.01))
    obs.append(mb.torno([(0.0, 0.21), (0.09, 0.21), (0.05, 0.27), (0.012, 0.29), (0.0, 0.29)], x=0, y=-0.14, cor="grafite",
                        seg=4, angulo=60))
    return obs


def plafon():
    """Plafom de varanda (teto): origem no ponto de fixação, a peça fica para baixo de z = 0."""
    obs = [mb.cilindro(0.13, 0.03, z=-0.03, cor="branco", seg=24)]
    obs.append(mb.esfera(0.11, x=0, y=0, z=-0.075, esc=(1, 1, 0.6), mat="luz", seg=20))
    return obs


def balizador():
    """Balizador de jardim: poste baixo com a cúpula acesa (luz)."""
    obs = [mb.cilindro(0.05, 0.42, cor="grafite", seg=12, bisel=0.006)]
    obs.append(mb.cilindro(0.065, 0.12, z=0.42, mat="luz", seg=16, bisel=0.006))
    obs.append(mb.cilindro(0.08, 0.035, z=0.54, cor="grafite", seg=16, bisel=0.01))
    obs.append(mb.cilindro(0.09, 0.03, z=0.0, cor="grafite", seg=16, bisel=0.008))
    return obs


# =====================================================================================================================
# Cercas e portões
# =====================================================================================================================
CERCAS = {  # altura, poste (lado), poste do canto (lado, altura), cor
    "madeira": dict(rot="Cerca de madeira", alt=1.0, poste=0.09, canto=(0.13, 1.12), cor="branco"),
    "ripada": dict(rot="Cerca ripada", alt=1.2, poste=0.10, canto=(0.14, 1.30), cor="madeira"),
    "metal": dict(rot="Gradil de metal", alt=1.2, poste=0.06, canto=(0.10, 1.28), cor="grafite"),
    "mureta_grade": dict(rot="Mureta com grade", alt=1.5, poste=0.30, canto=(0.36, 1.62), cor="creme"),
    "muro": dict(rot="Muro baixo", alt=1.0, poste=0.30, canto=(0.36, 1.16), cor="creme"),
}


def _poste_cerca(tipo, x, lado, alt, ponta=True):
    c = CERCAS[tipo]
    obs = []
    if tipo in ("madeira", "ripada"):
        obs.append(mb.caixa(lado, lado, alt, x=x, cor=c["cor"], bisel=0.012, seg=2))
        if ponta:
            obs.append(mb.torno([(0.0, 0.0), (lado * 0.62, 0.0), (lado * 0.62, 0.025), (0.0, 0.09)], x=x, z=alt,
                                cor=c["cor"], seg=4, angulo=60))
            obs[-1].rotation_euler.z = math.radians(45)
            bpy.context.view_layer.update()
            obs[-1].data.transform(obs[-1].matrix_basis)
            obs[-1].matrix_basis = Matrix.Identity(4)
    elif tipo == "metal":
        obs.append(mb.caixa(lado, lado, alt, x=x, cor=c["cor"], bisel=0.008))
        if ponta:
            obs.append(mb.esfera(lado * 0.75, x=x, y=0, z=alt + lado * 0.5, cor="ouro", seg=12))
    else:  # pilar de alvenaria com capa
        obs.append(mb.caixa(lado, lado, alt, x=x, cor=c["cor"], bisel=0.012, seg=2))
        obs.append(mb.caixa(lado + 0.05, lado + 0.05, 0.06, x=x, z=alt, cor="branco", bisel=0.012, seg=2))
    return obs


def cerca(tipo, L, peca="modulo"):
    """Cerca em módulos: o módulo traz o poste do começo (x = 0) e vai até x = L; "fim" é o poste da ponta solta e
    "canto" é o poste maior que vai no vértice (cobre o poste do módulo que começa ali). Centrada na linha (y = 0)."""
    c = CERCAS[tipo]
    if peca == "fim":
        return _poste_cerca(tipo, 0.0, c["poste"], c["alt"] + (0.05 if tipo in ("mureta_grade", "muro") else 0))
    if peca == "canto":
        lado, alt = c["canto"]
        obs = _poste_cerca(tipo, 0.0, lado, alt)
        if tipo in ("madeira", "ripada"):
            obs.append(mb.esfera(lado * 0.45, x=0, y=0, z=alt + 0.1, cor=c["cor"], seg=12))
        return obs
    obs = _poste_cerca(tipo, 0.0, c["poste"], c["alt"] + (0.05 if tipo in ("mureta_grade", "muro") else 0))
    lp = c["poste"] / 2
    if tipo == "madeira":
        for z in (0.22, 0.68):
            obs.append(mb.caixa(L - lp, 0.03, 0.08, x=lp + (L - lp) / 2, y=0.03, z=z, cor="branco", bisel=0.008))
        n = int(round((L - lp) / 0.14))
        for k in range(n):
            x = lp + (k + 0.5) * (L - lp) / n
            pts = [(-0.045, 0.0), (0.045, 0.0), (0.045, 0.88), (0.0, 0.96), (-0.045, 0.88)]
            o = mb.extrudado(pts, 0.024, x=x, y=-0.0, z=0.02, cor="branco", bisel=0.008, seg=1, plano="xz")
            obs.append(o)
    elif tipo == "ripada":
        n = 8
        for k in range(n):
            z = 0.08 + k * (c["alt"] - 0.1) / n
            obs.append(mb.caixa(L - lp + 0.004, 0.03, 0.11, x=lp + (L - lp) / 2, y=0, z=z,
                                cor="madeira" if k % 2 else "madeira_media", bisel=0.008, seg=1))
    elif tipo == "metal":
        for z in (0.08, c["alt"] - 0.1):
            obs.append(mb.caixa(L - lp, 0.03, 0.04, x=lp + (L - lp) / 2, z=z, cor="grafite", bisel=0.006))
        n = int(round((L - lp) / 0.12))
        for k in range(n):
            x = lp + (k + 0.5) * (L - lp) / n
            obs.append(mb.cilindro(0.011, c["alt"] - 0.06, x=x, z=0.04, cor="grafite", seg=6, bisel=0.0))
            obs.append(mb.esfera(0.022, x=x, y=0, z=c["alt"] - 0.02, cor="grafite", seg=8))
    elif tipo == "mureta_grade":
        obs.append(mb.caixa(L - lp, 0.18, 0.5, x=lp + (L - lp) / 2, cor="creme", bisel=0.01, seg=2))
        obs.append(mb.caixa(L - lp, 0.22, 0.05, x=lp + (L - lp) / 2, z=0.5, cor="branco", bisel=0.01, seg=2))
        obs.append(mb.caixa(L - lp, 0.03, 0.04, x=lp + (L - lp) / 2, z=1.42, cor="grafite", bisel=0.006))
        n = int(round((L - lp) / 0.12))
        for k in range(n):
            x = lp + (k + 0.5) * (L - lp) / n
            obs.append(mb.cilindro(0.011, 0.92, x=x, z=0.55, cor="grafite", seg=6, bisel=0.0))
    elif tipo == "muro":
        obs.append(mb.caixa(L - lp, 0.15, c["alt"] - 0.05, x=lp + (L - lp) / 2, cor="creme", bisel=0.01, seg=2))
        obs.append(mb.caixa(L - lp, 0.2, 0.06, x=lp + (L - lp) / 2, z=c["alt"] - 0.05, cor="branco", bisel=0.012,
                            seg=2))
        obs.append(mb.caixa(L - lp + 0.002, 0.17, 0.12, x=lp + (L - lp) / 2, z=0, cor="terracota_clara", bisel=0.008, seg=1))
    return obs


def portao_pedestre(tipo):
    """Portão de pedestre de 1 m (vão de 0,9 m entre o poste do começo e o do próximo módulo). A folha abre para +y
    (para dentro do lote), girando na dobradiça junto do poste do começo."""
    c = CERCAS[tipo]
    lp = c["poste"] / 2
    obs = _poste_cerca(tipo, 0.0, c["poste"], c["alt"] + (0.05 if tipo in ("mureta_grade", "muro") else 0))
    x0, x1 = lp + 0.015, 1.0 - 0.05 - 0.015
    lw = x1 - x0
    h = {"madeira": 0.95, "ripada": 1.15, "metal": 1.15, "mureta_grade": 1.40}[tipo]
    folha = []
    if tipo in ("madeira", "ripada"):
        cor = "branco" if tipo == "madeira" else "madeira"
        n = int(round(lw / 0.12))
        for k in range(n):
            x = x0 + (k + 0.5) * lw / n
            if tipo == "madeira":
                pts = [(-0.045, 0.0), (0.045, 0.0), (0.045, h - 0.08), (0.0, h), (-0.045, h - 0.08)]
                folha.append(mb.extrudado(pts, 0.024, x=x, y=-0.012, z=0.05, cor=cor, bisel=0.008, seg=1, plano="xz"))
            else:
                folha.append(mb.caixa(lw / n - 0.02, 0.03, h, x=x, y=0, z=0.05, cor=cor, bisel=0.008, seg=1))
        for z in (0.2, h - 0.25):
            folha.append(mb.caixa(lw, 0.03, 0.08, x=x0 + lw / 2, y=0.03, z=z, cor=cor, bisel=0.008))
        d = mb.extrudado([(x0 + 0.03, 0.25), (x0 + 0.13, 0.25), (x1 - 0.03, h - 0.25), (x1 - 0.13, h - 0.25)][::1],
                         0.025, y=0.02, cor=cor, bisel=0.006, plano="xz")
        folha.append(d)
    else:
        for z in (0.06, h - 0.02):
            folha.append(mb.caixa(lw, 0.035, 0.04, x=x0 + lw / 2, z=z, cor="grafite", bisel=0.006))
        for x in (x0 + 0.02, x1 - 0.02):
            folha.append(mb.caixa(0.04, 0.035, h - 0.02, x=x, z=0.06, cor="grafite", bisel=0.006))
        n = int(round(lw / 0.11))
        for k in range(1, n):
            folha.append(mb.cilindro(0.01, h - 0.06, x=x0 + k * lw / n, z=0.08, cor="grafite", seg=6, bisel=0.0))
    folha.append(mb.esfera(0.025, x=x1 - 0.06, y=-0.04, z=h * 0.55, cor="ouro", seg=10))  # trinco
    folha.append(mb.esfera(0.025, x=x1 - 0.06, y=0.06, z=h * 0.55, cor="ouro", seg=10))
    return obs, folha, (x0, 0.0, 0.0), h


def portao_garagem(tipo):
    """Portões de garagem de 3 m: basculante (2,1 m de altura, com pilares e verga; a folha gira na verga e sobe para
    fora) e de correr (1,5 m, gradil; corre 2,9 m para −x por dentro do lote, sobre o trilho)."""
    obs, folha = [], []
    if tipo == "basculante":
        for x in (0.0, 3.0):
            obs.append(mb.caixa(0.22, 0.22, 2.32, x=x, cor="creme", bisel=0.012, seg=2))
            obs.append(mb.caixa(0.27, 0.27, 0.06, x=x, z=2.32, cor="branco", bisel=0.012, seg=2))
        obs.append(mb.caixa(2.78, 0.22, 0.2, x=1.5, z=2.12, cor="creme", bisel=0.012, seg=2))
        x0, x1, h = 0.13, 2.87, 2.1
        folha.append(mb.caixa(x1 - x0, 0.04, h - 0.02, x=1.5, y=0, z=0.02, cor="cinza_claro", bisel=0.01))
        for k in range(1, 10):
            folha.append(mb.caixa(x1 - x0 - 0.06, 0.012, 0.025, x=1.5, y=-0.024, z=k * h / 10, cor="cinza",
                                  bisel=0.004))
        folha.append(mb.caixa(0.3, 0.03, 0.04, x=1.5, y=-0.03, z=0.9, cor="grafite", bisel=0.008))
        return obs, folha, ("porta", (1.5, 0.0, h), "x")
    # de correr
    obs.append(mb.caixa(0.22, 0.22, 1.6, x=0.0, cor="creme", bisel=0.012, seg=2))
    obs.append(mb.caixa(0.27, 0.27, 0.06, x=0.0, z=1.6, cor="branco", bisel=0.012, seg=2))
    obs.append(mb.caixa(0.12, 0.12, 1.6, x=3.0 - 0.06, y=0.1, cor="grafite", bisel=0.008))
    obs.append(mb.caixa(5.9, 0.06, 0.02, x=3.0 - 2.95, y=0.1, z=0, cor="metal_escuro", bisel=0.004))
    x0, x1, h = 0.13, 3.0 - 0.06, 1.5
    for z in (0.08, h - 0.04):
        folha.append(mb.caixa(x1 - x0, 0.04, 0.05, x=(x0 + x1) / 2, y=0.1, z=z, cor="grafite", bisel=0.006))
    for x in (x0 + 0.025, x1 - 0.025):
        folha.append(mb.caixa(0.05, 0.04, h - 0.06, x=x, y=0.1, z=0.06, cor="grafite", bisel=0.006))
    n = int(round((x1 - x0) / 0.12))
    for k in range(1, n):
        folha.append(mb.cilindro(0.011, h - 0.12, x=x0 + k * (x1 - x0) / n, y=0.1, z=0.1, cor="grafite", seg=6,
                                 bisel=0.0))
    for x in (x0 + 0.25, x1 - 0.25):
        folha.append(mb.cilindro(0.035, 0.03, x=x, y=0.1, z=0.035, cor="metal", eixo="y", seg=12))
    return obs, folha, ("correr", (-1, 0, 0), 2.85)


def importa_cerca_doce():
    """Cerca de doce do pacote de Natal (uso interno): escalada para um módulo de 2 m."""
    import glob
    base = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "ideias", "Christmas_Pack")
    fbx = sorted(glob.glob(os.path.join(base, "**", "Separate_assets_fbx"), recursive=True))[0]
    tex = sorted(glob.glob(os.path.join(base, "**", "Textures_4.png"), recursive=True))[0]
    partes = mb.importa_pacote("Fence_001", fbx_dir=fbx, textura=tex)
    obs = list(partes.values())
    lo, hi = mb.bbox(obs)
    s = 2.0 / (hi.x - lo.x)
    for o in obs:
        o.data.transform(Matrix.Diagonal((s, s, s, 1)) @ Matrix.Translation((-lo.x, -(lo.y + hi.y) / 2, -lo.z)))
    return obs


# =====================================================================================================================
# Piscina, garagem aberta, caminho de pedras
# =====================================================================================================================
P_FUNDO, P_AGUA, P_BORDA, P_PRAINHA = -1.40, -0.10, 0.03, -0.35


def _pastilha_quad(M, pts, fora):
    """Face com o revestimento da piscina (UV em metros / 2 no plano mais largo da face)."""
    n = V(fora)
    if abs(n.z) > 0.7:
        uv = [(x / 2, y / 2) for x, y, z in pts]
    elif abs(n.x) > abs(n.y):
        uv = [(y / 2, z / 2) for x, y, z in pts]
    else:
        uv = [(x / 2, z / 2) for x, y, z in pts]
    M.f(pts, "pastilha", uv=uv, fora=fora)


def piscina_celula(tipo):
    """Célula de 1 × 1 m da piscina (x 0..1, y 0..1, origem no canto, no nível do gramado): fundo a −1,40, água a −0,10
    (material "agua"), revestimento "pastilha". Parede e borda de pedra nos lados −y ("borda") ou −x e −y ("canto"),
    do lado de fora da célula: a parede tem 15 cm e a borda vai até 0,35 m para fora, 3 cm acima do gramado."""
    M = Malha()
    obs = []
    # fundo
    _pastilha_quad(M, [(0, 0, P_FUNDO), (1, 0, P_FUNDO), (1, 1, P_FUNDO), (0, 1, P_FUNDO)], (0, 0, 1))
    M.f([(0, 0, P_FUNDO - 0.15), (1, 0, P_FUNDO - 0.15), (1, 1, P_FUNDO - 0.15), (0, 1, P_FUNDO - 0.15)], "atlas",
        cor="concreto", fora=(0, 0, -1))
    lados = {"borda": ["S"], "borda_luz": ["S"], "degraus": ["S"], "canto": ["S", "O"], "miolo": []}.get(tipo, [])
    for lado in lados:
        if lado == "S":  # parede em y = 0, para fora (−y)
            _pastilha_quad(M, [(0, 0, P_FUNDO), (1, 0, P_FUNDO), (1, 0, -0.02), (0, 0, -0.02)], (0, 1, 0))
            M.caixa(0, 1, -0.15, 0, P_FUNDO - 0.15, -0.02, "atlas", cor="concreto")
            M.caixa(0, 1, 0.0, 0.003, -0.26, -0.02, "atlas", cor="azul")  # faixa de azulejo na linha d'água
        else:  # parede em x = 0, para fora (−x)
            _pastilha_quad(M, [(0, 0, P_FUNDO), (0, 1, P_FUNDO), (0, 1, -0.02), (0, 0, -0.02)], (1, 0, 0))
            M.caixa(-0.15, 0, 0, 1, P_FUNDO - 0.15, -0.02, "atlas", cor="concreto")
            M.caixa(0.0, 0.003, 0, 1, -0.26, -0.02, "atlas", cor="azul")
    if tipo == "canto":
        M.caixa(-0.15, 0, -0.15, 0, P_FUNDO - 0.15, -0.02, "atlas", cor="concreto")
    obs.append(M.objeto("piscina"))
    # água
    Ma = Malha()
    Ma.f([(0, 0, P_AGUA), (1, 0, P_AGUA), (1, 1, P_AGUA), (0, 1, P_AGUA)], "agua", fora=(0, 0, 1))
    obs.append(Ma.objeto("agua"))
    # borda de pedra (com bocel arredondado sobre a água)
    for lado in lados:  # borda de pedra: no canto, a de −x começa depois do bocel da de −y (sem sobrepor)
        if lado == "S":
            obs.append(mb.caixa(1.0, 0.36, 0.05, x=0.5, y=-0.13, z=-0.02, cor="creme_claro", bisel=0.008, seg=1))
            obs.append(mb.cilindro(0.025, 1.0, x=0.5, y=0.03, z=0.005, cor="creme_claro", eixo="x", seg=10, bisel=0.0))
        else:
            y0 = 0.05 if tipo == "canto" else 0.0
            obs.append(mb.caixa(0.36, 1.0 - y0, 0.05, x=-0.13, y=(1.0 + y0) / 2, z=-0.02, cor="creme_claro", bisel=0.008,
                                seg=1))
            obs.append(mb.cilindro(0.025, 1.0, x=0.03, y=0.5, z=0.005, cor="creme_claro", eixo="y", seg=10, bisel=0.0))
    if tipo == "canto":
        arco = [(-0.11 + 0.2 * math.cos(math.radians(180 + 90 * k / 8)), -0.11 + 0.2 * math.sin(math.radians(180 + 90 * k / 8)))
                for k in range(9)]
        obs.append(mb.extrudado(ccw([(0.0, 0.05), (-0.31, 0.05)] + arco + [(0.0, -0.31)]), 0.05, z=-0.02, cor="creme_claro",
                                bisel=0.008, seg=1))
    if tipo == "borda_luz":
        obs.append(mb.cilindro(0.09, 0.03, x=0.5, y=0.0, z=-0.6, eixo="y", mat="luz", seg=20, bisel=0.006))
    if tipo == "degraus":
        for k, (zt_, d) in enumerate(((-0.35, 0.30), (-0.70, 0.60), (-1.05, 0.90))):
            Mk = Malha()
            y0, y1 = d - 0.30, d
            for q, f in (([(0, y0, zt_), (1, y0, zt_), (1, y1, zt_), (0, y1, zt_)], (0, 0, 1)),
                         ([(0, y1, P_FUNDO), (1, y1, P_FUNDO), (1, y1, zt_), (0, y1, zt_)], (0, 1, 0))):
                _pastilha_quad(Mk, q, f)
            obs.append(Mk.objeto("degrau"))
        Mk = Malha()
        for q, f in (([(0, 0, P_FUNDO), (0, 0.9, P_FUNDO), (0, 0.9, -0.35), (0, 0, -0.35)], (-1, 0, 0)),
                     ([(1, 0, P_FUNDO), (1, 0.9, P_FUNDO), (1, 0.9, -0.35), (1, 0, -0.35)], (1, 0, 0))):
            pass
        obs.append(Mk.objeto("vazio"))
    return obs


def prainha(rampa=False):
    """Prainha: bloco que sobe o fundo da célula até −0,35 (25 cm de água). A rampa desce de −0,35 (y = 0) até o fundo
    (y = 1). Vai na mesma célula de uma borda ou de um miolo."""
    M = Malha()
    if not rampa:
        _pastilha_quad(M, [(0, 0, P_PRAINHA), (1, 0, P_PRAINHA), (1, 1, P_PRAINHA), (0, 1, P_PRAINHA)], (0, 0, 1))
        for q, f in (([(0, 1, P_FUNDO), (1, 1, P_FUNDO), (1, 1, P_PRAINHA), (0, 1, P_PRAINHA)], (0, 1, 0)),
                     ([(0, 0, P_FUNDO), (0, 1, P_FUNDO), (0, 1, P_PRAINHA), (0, 0, P_PRAINHA)], (-1, 0, 0)),
                     ([(1, 0, P_FUNDO), (1, 1, P_FUNDO), (1, 1, P_PRAINHA), (1, 0, P_PRAINHA)], (1, 0, 0)),
                     ([(0, 0, P_FUNDO), (1, 0, P_FUNDO), (1, 0, P_PRAINHA), (0, 0, P_PRAINHA)], (0, -1, 0))):
            _pastilha_quad(M, q, f)
        return [M.objeto("prainha")]
    _pastilha_quad(M, [(0, 0, P_PRAINHA), (1, 0, P_PRAINHA), (1, 1, P_FUNDO + 0.002), (0, 1, P_FUNDO + 0.002)], (0, 0, 1))
    for xs, f in ((0, (-1, 0, 0)), (1, (1, 0, 0))):
        _pastilha_quad(M, [(xs, 0, P_FUNDO), (xs, 1, P_FUNDO + 0.002), (xs, 0, P_PRAINHA)], f)
    _pastilha_quad(M, [(0, 0, P_FUNDO), (1, 0, P_FUNDO), (1, 0, P_PRAINHA), (0, 0, P_PRAINHA)], (0, -1, 0))
    return [M.objeto("prainha")]


def escadinha():
    """Escadinha de inox: dois corrimãos curvos presos na borda e três degraus dentro da água. Origem na linha da
    parede da piscina (y = 0), no meio; a borda fica em −y e a água em +y."""
    obs = []
    for x in (-0.25, 0.25):
        pts = [(x, -0.22, P_BORDA), (x, -0.22, 0.55), (x, 0.0, 0.85), (x, 0.16, 0.55), (x, 0.16, -1.05)]
        obs.append(mb.tubo(pts, 0.022, cor="cromo", seg=10, raio_curva=0.16))
        obs.append(mb.cilindro(0.05, 0.012, x=x, y=-0.22, z=P_BORDA, cor="cromo", seg=14, bisel=0.003))
    for z in (-0.3, -0.6, -0.9):
        obs.append(mb.caixa(0.5, 0.08, 0.025, x=0, y=0.13, z=z, cor="cromo", bisel=0.006))
    return obs


def trampolim():
    """Trampolim: base na borda (fora da água) e a prancha avançando 1,2 m sobre a água. Origem na linha da parede da
    piscina (y = 0), no meio."""
    obs = [mb.caixa(0.5, 0.6, 0.3, x=0, y=-0.65, z=P_BORDA, cor="branco", bisel=0.03, seg=2)]
    prancha = mb.superelipsoide(0.5, 1.9, 0.06, x=0, y=0.1, z=P_BORDA + 0.30, cor="azul", e=0.2, e_v=0.4, nu=24, nv=6)
    obs.append(prancha)
    obs.append(mb.caixa(0.46, 1.3, 0.004, x=0, y=0.35, z=P_BORDA + 0.36, cor="azul_claro", bisel=0.0))
    for s in (-1, 1):
        obs.append(mb.tubo([(s * 0.22, -0.9, P_BORDA), (s * 0.22, -0.9, 0.95), (s * 0.22, -0.55, 0.95),
                            (s * 0.22, -0.4, P_BORDA + 0.32)], 0.02, cor="cromo", seg=10, raio_curva=0.12))
    return obs


def telheiro(W, D=6.0):
    """Garagem aberta (telheiro): piso de concreto 3 cm acima do gramado, postes de metal, vigas e cobertura de telha
    metálica com 5 % de caimento para trás, e plafons acesos (luz). Origem no canto (x 0..W, y 0..D, frente em y = 0)."""
    obs = [mb.caixa(W, D, 0.03, x=W / 2, y=D / 2, cor="concreto", bisel=0.008, seg=1)]
    xs = [0.12, W - 0.12] if W <= 3.5 else [0.12, W / 2, W - 0.12]
    ys = [0.12, D / 2, D - 0.12]
    alt_f, alt_t = 2.45, 2.45 - 0.05 * D
    zf = lambda y: alt_f + (alt_t - alt_f) * y / D  # noqa: E731
    for x in xs:
        for y in ys:
            obs.append(mb.caixa(0.10, 0.10, zf(y) - 0.03, x=x, y=y, z=0.03, cor="grafite", bisel=0.008))
            obs.append(mb.caixa(0.18, 0.18, 0.02, x=x, y=y, z=0.03, cor="grafite", bisel=0.005))
    for x in xs:  # vigas ao longo de y (acompanham o caimento)
        Mv = Malha()
        Mv.prisma([(0, zf(0)), (D, zf(D)), (D, zf(D) + 0.14), (0, zf(0) + 0.14)], x - 0.05, x + 0.05, eixo="x",
                  mat="atlas", cor="grafite")
        obs.append(Mv.objeto("viga"))
    M = Malha()
    p = 0.05
    k = _k(p)
    pol = [(-0.3, -0.3), (W + 0.3, -0.3), (W + 0.3, D + 0.3), (-0.3, D + 0.3)]
    z0 = lambda y: zf(y) + 0.14 + 0.05  # noqa: E731
    M.f([(x, y, z0(y)) for x, y in pol], "telha", uv=[(x / 2, (D + 0.3 - y) * k / 2) for x, y in pol], fora=(0, 0, 1))
    M.f([(x, y, z0(y) - 0.05) for x, y in pol], "borda", fora=(0, 0, -1))
    for a, b in zip(pol, pol[1:] + pol[:1]):
        M.f([(a[0], a[1], z0(a[1]) - 0.05), (b[0], b[1], z0(b[1]) - 0.05), (b[0], b[1], z0(b[1]) + 0.04),
             (a[0], a[1], z0(a[1]) + 0.04)], "borda", fora=(b[1] - a[1], -(b[0] - a[0]), 0))
    obs.append(M.objeto("cobertura"))
    for x in [W / 4, 3 * W / 4] if W > 3.5 else [W / 2]:
        for y in (D * 0.3, D * 0.7):
            pl = plafon()
            _move(pl, Matrix.Translation((x, y, z0(y) - 0.05)))
            obs += pl
    return obs, [((x, y, 0.03), (0.1, 0.1, zf(y))) for x in xs for y in ys] + [((W / 2, D / 2, 0), (W, D, 0.03)),
                                                                               ((W / 2, D / 2, alt_t), (W + 0.6, D + 0.6, alt_f + 0.24 - alt_t))]


def caminho_pedras(L):
    """Caminho de pedras chatas (pisantes) sobre o gramado: uma pedra a cada 0,5 m, ao longo de +y, centrado em x = 0."""
    import random
    rnd = random.Random(int(L * 10) + 3)
    obs = []
    n = max(1, int(round(L / 0.5)))
    for k in range(n):
        y = (k + 0.5) * L / n
        x = rnd.uniform(-0.08, 0.08)
        lx, ly = rnd.uniform(0.40, 0.48), rnd.uniform(0.30, 0.36)
        o = mb.superelipsoide(lx, ly, 0.05, x=0, y=0, z=-0.02, cor=rnd.choice(["cinza_claro", "cinza", "areia"]),
                              e=0.45, e_v=0.35, nu=14, nv=4)
        mb.transforma(o, loc=(x, y, 0), rot=("Z", rnd.uniform(-18, 18)))
        obs.append(o)
    return obs


# =====================================================================================================================
# Lote e caixa de correio
# =====================================================================================================================
def caixa_correio():
    """Caixa de correio no poste, com a portinhola (abre para baixo, para a calçada, −y) e um slot dentro. Origem no
    chão, no meio."""
    obs = [mb.caixa(0.08, 0.08, 1.0, cor="madeira", bisel=0.01),
           mb.caixa(0.22, 0.12, 0.04, x=0, y=0, z=0.98, cor="madeira_escura", bisel=0.008)]
    corpo = mb.superelipsoide(0.24, 0.42, 0.24, x=0, y=0.02, z=1.02, cor="vermelho", e=0.35, e_v=0.6, nu=24, nv=12)
    obs.append(corpo)
    bandeira = [mb.caixa(0.02, 0.06, 0.16, x=0.13, y=0.08, z=1.12, cor="amarelo", bisel=0.006),
                mb.caixa(0.02, 0.12, 0.05, x=0.13, y=0.11, z=1.25, cor="amarelo", bisel=0.006)]
    obs += bandeira
    porta = [mb.superelipsoide(0.22, 0.03, 0.2, x=0, y=-0.19, z=1.03, cor="vermelho_escuro", e=0.4, e_v=0.6, nu=16, nv=8),
             mb.esfera(0.018, x=0, y=-0.215, z=1.17, cor="ouro", seg=10)]
    return obs, porta


def lote(nq):
    """Terreno de nq quadras (15 × 15 m cada, ao longo de x): calçada de 2 m na frente (−y, z = 0, com as juntas a cada
    1,5 m como a calçada lisa da cidade), guia baixa, gramado (objeto à parte "gramado", recortável para a piscina),
    entrada de garagem de concreto e caixa de correio. Origem no meio do lote, frente em −y."""
    import random
    rnd = random.Random(nq)
    X = 7.5 * nq
    H = 7.5
    yc = -H + 2.0
    obs = []
    xg0, xg1 = (X - 4.5, X - 1.5)  # entrada de garagem (3 m) junto da divisa da direita
    cal = mb.extrudado(ccw(ret(-X, -H, X, yc)), 0.40, z=-0.40, cor="calcada", bisel=0.0, nome="calcada", liso=False)
    obs.append(cal)
    juntas = []
    for k in range(1, int(2 * X / 1.5)):
        x = -X + k * 1.5
        juntas.append(mb.caixa(0.036, 2.0, 0.002, x=x, y=-H + 1.0, z=0.0, cor="concreto", bisel=0.0, seg=1))
    for y in (-H + 1.5,):
        juntas.append(mb.caixa(2 * X, 0.036, 0.0025, x=0, y=y, z=0.0, cor="concreto", bisel=0.0, seg=1))
    juntas.append(mb.caixa(2 * X, 0.018, 0.0025, x=0, y=-H + 0.009, z=0.0, cor="concreto", bisel=0.0, seg=1))
    obs += juntas
    ent = mb.extrudado(ccw(ret(xg0, yc, xg1, 1.0)), 0.40, z=-0.40, cor="concreto", bisel=0.0, nome="entrada", liso=False)
    obs.append(ent)
    for y in [yc + 1.5 * k for k in range(1, 5)]:
        obs.append(mb.caixa(xg1 - xg0, 0.03, 0.002, x=(xg0 + xg1) / 2, y=y, z=0.0, cor="concreto_escuro", bisel=0.0))
    for x0, x1 in ((-X, xg0), (xg1, X)):  # guia baixa entre a calçada e o gramado
        obs.append(mb.caixa(x1 - x0, 0.10, 0.035, x=(x0 + x1) / 2, y=yc + 0.05, z=0.0, cor="concreto", bisel=0.008, seg=1))
    # gramado: a laje do jardim inteira (até −0,40), com as faixas de corte; é um objeto à parte para o motor recortar
    pol = [(-X, yc), (xg0, yc), (xg0, 1.0), (xg1, 1.0), (xg1, yc), (X, yc), (X, H), (-X, H)]
    gram = [mb.extrudado(ccw(pol), 0.40, z=-0.40, cor="grama", bisel=0.0, nome="gramado", liso=False)]
    for k in range(int(2 * X / 5)):
        x0 = -X + 5 * k + 2.5
        for (a, b) in ((x0, x0 + 2.5),):
            for (ya, yb) in ((yc + 0.1, H),):
                partes = [(a, b)]
                for aa, bb in partes:
                    # recorta o trecho da entrada
                    cortes = [(aa, min(bb, xg0)), (max(aa, xg1), bb)] if aa < xg1 and bb > xg0 else [(aa, bb)]
                    for c0, c1 in cortes:
                        if c1 - c0 > 0.05:
                            gram.append(mb.caixa(c1 - c0, yb - ya, 0.002, x=(c0 + c1) / 2, y=(ya + yb) / 2, z=0.0,
                                                 cor="verde_claro", bisel=0.0, seg=1))
                    if aa < xg1 and bb > xg0:
                        gram.append(mb.caixa(min(bb, xg1) - max(aa, xg0), H - 1.0, 0.002, x=(max(aa, xg0) + min(bb, xg1)) / 2,
                                             y=(1.0 + H) / 2, z=0.0, cor="verde_claro", bisel=0.0, seg=1))
    for k in range(int(6 * nq)):
        x, y = rnd.uniform(-X + 0.5, X - 0.5), rnd.uniform(yc + 0.6, H - 0.5)
        if xg0 - 0.4 < x < xg1 + 0.4 and y < 1.4:
            continue
        for j in range(4):
            ang = j * 1.57 + 0.3
            o = mb.cilindro(0.05, 0.22, x=0, y=0, z=0, r2=0.005, cor="grama_escura", seg=4, bisel=0.0)
            mb.transforma(o, loc=(x + 0.06 * math.cos(ang), y + 0.06 * math.sin(ang), -0.01),
                          rot=[("Z", math.degrees(ang)), ("Y", 14)])
            gram.append(o)
    gramado = mb.junta(gram, "gramado")
    cx = xg0 - 0.6
    cc, porta = caixa_correio()
    _move(cc + porta, Matrix.Translation((cx, yc + 0.45, 0)))
    obs += cc
    return obs, gramado, porta, (cx, yc + 0.45), (xg0, xg1)


# =====================================================================================================================
# Exportação: GLB, miniatura e catálogo (o mesmo formato de interativos, slots e colisão dos móveis)
# =====================================================================================================================
def _gl(v):
    return [round(v[0], 5), round(v[2], 5), round(-v[1], 5)]


def exporta(spec, saida):
    it = mb.Item(spec["id"])
    r = spec["fn"]()
    it.add(r["obs"])
    for k, folha in enumerate(r.get("portas", [])):
        objs, dob, eixo, ang = folha
        it.porta(objs, dob, eixo=eixo, angulo=ang, nome=f"porta_{k + 1}")
    for k, folha in enumerate(r.get("correr", [])):
        objs, dire, curso = folha
        it.correr(objs, direcao=dire, curso=curso, nome=f"correr_{k + 1}")
    for nome, c, t in r.get("slots", []):
        it.slot(nome, c, t)
    if r.get("col") is not None:
        it.colisao(r["col"])
    if r.get("malha"):
        it.colisao_malha(_malha_rampa(r["malha"]))
    corpo = it.monta()
    for o in r.get("filhos", []):  # partes que ficam separadas no GLB (o gramado do lote, que o motor recorta)
        o.parent = corpo
        o["recortavel"] = 1
    vis = [o for o in mb._hierarquia(corpo) if o.type == "MESH" and not o.get("colisao")]
    lo, hi = mb.bbox(vis)
    dims = [round(hi.x - lo.x, 3), round(hi.y - lo.y, 3), round(hi.z - lo.z, 3)]
    if it.colisores is not None and len(it.colisores) == 0:
        col = []
    elif it.colisores:
        col = [{"centro": _gl((c[0], c[1], c[2] + t[2] / 2)), "tamanho": [round(t[0], 3), round(t[2], 3), round(t[1], 3)]}
               for c, t in it.colisores]
    else:
        cl, ch = mb.bbox(corpo)
        cc = (cl + ch) / 2
        col = [{"centro": _gl(cc), "tamanho": [round(ch.x - cl.x, 3), round(ch.z - cl.z, 3), round(ch.y - cl.y, 3)]}]
    inter = []
    for ob, d in it.interativos:
        q = dict(d)
        q["nome"] = ob.name
        q["pivo"] = _gl(ob.location)
        inter.append(q)
    slots = [{"nome": n, "centro": _gl(c), "tamanho": [round(t[0], 3), round(t[2], 3), round(t[1], 3)], "em": pai}
             for n, c, t, pai in it.slots]
    tris = sum(len(p.vertices) - 2 for o in vis for p in o.data.polygons)
    usados = sorted({mb.MAT_NOMES[p.material_index] for o in vis for p in o.data.polygons})
    texturas_ligadas(False)
    glb = os.path.join(saida, "pecas", spec["id"] + ".glb")
    mb.exporta_glb(corpo, glb)
    troca = spec.get("tex") or {}
    for mat, tex in troca.items():
        MAT_TEX[mat] = (MAT_TEX[mat][0], tex)
    texturas_ligadas(True)
    mb.miniatura(corpo, os.path.join(saida, "miniaturas", spec["id"] + ".webp"), direcao=spec.get("mini", (0.55, -1.0, 0.5)))
    texturas_ligadas(False)
    for mat in troca:
        MAT_TEX[mat] = (MAT_TEX[mat][0], spec["_tex_antes"][mat])
    e = {"id": spec["id"], "rotulo": spec["rotulo"], "grupo": spec["grupo"], "tipo": spec.get("tipo", spec["grupo"]),
         "arquivo": f"pecas/{spec['id']}.glb", "miniatura": f"miniaturas/{spec['id']}.webp", "dims": dims,
         "fixacao": spec.get("fixacao", "chao"), "interativos": inter, "slots": slots, "colisao": col, "tris": tris,
         "materiais": [m for m in usados], "pacote": bool(spec.get("pacote")), "tags": spec.get("tags", [])}
    if getattr(it, "malhas_colisao", None):
        e["colisao_malha"] = [o.name for o in it.malhas_colisao]
    texp = {m: MAT_TEX[m][1] for m in usados if m in MAT_TEX}
    texp.update(troca)
    if texp:
        e["texturas_padrao"] = texp
    e.update(spec.get("info", {}))
    e.update(r.get("info", {}))
    print("peca", spec["id"], dims, "tris", tris, flush=True)
    return e


# =====================================================================================================================
# Registro das peças
# =====================================================================================================================
REG = []


def peca(id_, secao, rotulo, grupo, fn, **k):
    k.setdefault("_tex_antes", {m: v[1] for m, v in MAT_TEX.items()})
    if secao == "telhados" and not id_.startswith("parede_"):
        k.setdefault("mini", (0.55, -1.0, 0.95))
    REG.append(dict(id=id_, secao=secao, rotulo=rotulo, grupo=grupo, fn=fn, **k))


def cm(x):
    return ("%g" % x).replace(".", "_") + "m"


def rot_m(x):
    return ("%g" % x).replace(".", ",") + " m"


INC_ROT = {"i25": "25 %", "i50": "50 %", "i75": "75 %"}


def registra_telhados():
    for S in VAOS:
        for inc, p in INCL.items():
            sufixo = f"v{S}_{inc}"
            info = {"vao": S, "inclinacao": inc, "p": p, "cumeeira_z": round(zt(S / 2, p), 4)}
            for L in (1.0, 0.5):
                peca(f"telhado_duas_aguas_{sufixo}_{cm(L)}", "telhados", f"Duas águas {rot_m(L)} (vão {S} m, {INC_ROT[inc]})",
                     "duas_aguas", lambda S=S, p=p, L=L: dict(obs=corpo_duas_aguas(S, p, L)), tipo="corpo",
                     info=dict(info, comp=L, cobre=[[0, L], [0, S]]))
            peca(f"telhado_empena_{sufixo}", "telhados", f"Empena (ponta do duas-águas, vão {S} m, {INC_ROT[inc]})",
                 "empena", lambda S=S, p=p: dict(obs=empena_duas_aguas(S, p)), tipo="empena",
                 info=dict(info, cobre=[[-BEIRAL, 0], [-BEIRAL, S + BEIRAL]]))
            peca(f"telhado_oitao_{sufixo}", "telhados", f"Oitão (vão {S} m, {INC_ROT[inc]})", "oitao",
                 lambda S=S, p=p: dict(obs=oitao(S, p)), tipo="oitao", info=dict(info, comp=S))
            peca(f"telhado_quatro_aguas_ponta_{sufixo}", "telhados", f"Ponta de quatro águas (vão {S} m, {INC_ROT[inc]})",
                 "quatro_aguas", lambda S=S, p=p: dict(obs=ponta_quatro_aguas(S, p)), tipo="ponta_quatro_aguas",
                 info=dict(info, cobre=[[0, S / 2], [0, S]]))
            peca(f"telhado_canto_l_{sufixo}", "telhados", f"Canto em L (vão {S} m, {INC_ROT[inc]})", "canto_l",
                 lambda S=S, p=p: dict(obs=canto_L(S, p)), tipo="canto_l", info=dict(info, cobre=[[0, S], [0, S]]))
            peca(f"telhado_encontro_t_{sufixo}", "telhados", f"Encontro em T (vão {S} m, {INC_ROT[inc]})", "encontro_t",
                 lambda S=S, p=p: dict(obs=encontro_T(S, p)), tipo="encontro_t", info=dict(info, cobre=[[0, S], [0, S]]))
    for inc, p in INCL.items():
        for L in (1.0, 0.5):
            peca(f"telhado_beiral_{inc}_{cm(L)}", "telhados", f"Beiral {rot_m(L)} ({INC_ROT[inc]})", "beiral",
                 lambda p=p, L=L: dict(obs=beiral(p, L)), tipo="beiral",
                 info={"inclinacao": inc, "p": p, "comp": L, "cobre": [[0, L], [-BEIRAL, 0]]})
        peca(f"telhado_beiral_canto_externo_{inc}", "telhados", f"Beiral, canto externo ({INC_ROT[inc]})", "beiral_canto",
             lambda p=p: dict(obs=beiral_canto_externo(p)), tipo="beiral_canto_externo",
             info={"inclinacao": inc, "p": p, "cobre": [[-BEIRAL, 0], [-BEIRAL, 0]]})
        peca(f"telhado_beiral_canto_interno_{inc}", "telhados", f"Beiral, canto interno ({INC_ROT[inc]})", "beiral_canto",
             lambda p=p: dict(obs=beiral_canto_interno(p)), tipo="beiral_canto_interno",
             info={"inclinacao": inc, "p": p, "cobre": [[-BEIRAL, 0], [-BEIRAL, 0]]})
    for L in (1.0, 0.5):
        peca(f"telhado_cumeeira_{cm(L)}", "telhados", f"Cumeeira {rot_m(L)}", "cumeeira",
             lambda L=L: dict(obs=cumeeira_peca(L)), tipo="cumeeira", info={"comp": L, "raio": R_CUM})
    for S in (2, 4, 6):
        for inc in ("i25", "i50"):
            p = INCL[inc]
            sufixo = f"v{S}_{inc}"
            info = {"vao": S, "inclinacao": inc, "p": p, "parede_alta": round(S * p, 3)}
            for L in (1.0, 0.5):
                peca(f"telhado_meia_agua_{sufixo}_{cm(L)}", "telhados", f"Meia-água {rot_m(L)} (vão {S} m, {INC_ROT[inc]})",
                     "meia_agua", lambda S=S, p=p, L=L: dict(obs=corpo_meia_agua(S, p, L)), tipo="corpo_meia_agua",
                     info=dict(info, comp=L, cobre=[[0, L], [0, S]]))
            for lado in ("esq", "dir"):
                peca(f"telhado_meia_agua_empena_{lado}_{sufixo}", "telhados",
                     f"Empena da meia-água, {'esquerda' if lado == 'esq' else 'direita'} (vão {S} m, {INC_ROT[inc]})",
                     "meia_agua_empena", lambda S=S, p=p, lado=lado: dict(obs=empena_meia_agua(S, p, lado)),
                     tipo="empena_meia_agua",
                     info=dict(info, lado=lado, cobre=[[-BEIRAL, 0] if lado == "esq" else [0, BEIRAL], [-BEIRAL, S + BEIRAL]]))
            for sent in ("sobe", "desce"):
                peca(f"telhado_meia_agua_oitao_{sent}_{sufixo}", "telhados",
                     f"Oitão da meia-água, {sent} (vão {S} m, {INC_ROT[inc]})", "meia_agua_oitao",
                     lambda S=S, p=p, sent=sent: dict(obs=oitao_meia_agua(S, p, sent)), tipo="oitao_meia_agua",
                     info=dict(info, sentido=sent, comp=S))
    for inc in ("i25", "i50"):
        p = INCL[inc]
        for L in (1.0, 0.5):
            peca(f"telhado_beiral_alto_{inc}_{cm(L)}", "telhados", f"Beiral alto da meia-água {rot_m(L)} ({INC_ROT[inc]})",
                 "beiral_alto", lambda p=p, L=L: dict(obs=beiral_alto(p, L)), tipo="beiral_alto",
                 info={"inclinacao": inc, "p": p, "comp": L, "cobre": [[0, L], [0, BEIRAL]]})
            peca(f"telhado_rufo_{inc}_{cm(L)}", "telhados", f"Rufo de encontro com a parede {rot_m(L)} ({INC_ROT[inc]})",
                 "rufo", lambda p=p, L=L: dict(obs=rufo_parede(p, L), col=[]), tipo="rufo",
                 info={"inclinacao": inc, "p": p, "comp": L})
    for h in (0.5, 1.5, 2.0):
        for L in (2.0, 1.0):
            peca(f"parede_complemento_{cm(h)}_{cm(L)}", "telhados", f"Parede de complemento {rot_m(L)} × {rot_m(h)}",
                 "complemento", lambda h=h, L=L: dict(obs=parede_complemento(L, h)), tipo="parede_complemento",
                 info={"comp": L, "alt": h}, tex={"face_a": "degrade_azul", "face_b": "degrade_azul"})
    for S in VAOS:
        topo, _ = _mansarda_secao(S)
        info = {"vao": S, "inclinacao": "mansarda", "cumeeira_z": round(topo[2][1], 4)}
        for L in (1.0, 0.5):
            peca(f"telhado_mansarda_v{S}_{cm(L)}", "telhados", f"Mansarda {rot_m(L)} (vão {S} m)", "mansarda",
                 lambda S=S, L=L: dict(obs=corpo_mansarda(S, L)), tipo="corpo_mansarda",
                 info=dict(info, comp=L, cobre=[[0, L], [0, S]]))
        peca(f"telhado_mansarda_empena_v{S}", "telhados", f"Empena da mansarda (vão {S} m)", "mansarda_empena",
             lambda S=S: dict(obs=empena_mansarda(S)), tipo="empena_mansarda",
             info=dict(info, cobre=[[-BEIRAL, 0], [-BEIRAL, S + BEIRAL]]))
        peca(f"telhado_mansarda_oitao_v{S}", "telhados", f"Oitão da mansarda (vão {S} m)", "mansarda_oitao",
             lambda S=S: dict(obs=oitao_mansarda(S)), tipo="oitao_mansarda", info=dict(info, comp=S))
    for L in (2.0, 1.0, 0.5):
        peca(f"telhado_platibanda_rufo_{cm(L)}", "telhados", f"Rufo de platibanda {rot_m(L)}", "platibanda",
             lambda L=L: dict(obs=rufo_platibanda(L)), tipo="rufo_platibanda", info={"comp": L})
    peca("telhado_platibanda_rufo_canto", "telhados", "Rufo de platibanda, canto", "platibanda",
         lambda: dict(obs=rufo_platibanda(0, canto=True)), tipo="rufo_platibanda_canto")


def registra_andares():
    for nome, rot, pol in (("laje_4m", "Laje 4 × 4 m", ret(0, 0, 4, 4)), ("laje_4x2m", "Laje 4 × 2 m", ret(0, 0, 4, 2)),
                           ("laje_2x2m", "Laje 2 × 2 m", ret(0, 0, 2, 2))):
        tam = [max(x for x, _ in pol), max(y for _, y in pol)]
        peca(nome, "andares", rot, "laje", lambda pol=pol: dict(obs=[placa(pol, LAJE)]), tipo="laje",
             info={"tam": tam}, mini=(0.6, -1.0, 1.1))
    for k, (pol, esc, off) in LAJE_ABERTURAS.items():
        rot = {"reta": "reta", "l_dir": "em L (direita)", "l_esq": "em L (esquerda)", "u": "em U", "caracol": "caracol"}[k]
        peca(f"laje_abertura_{k}", "andares", f"Laje 4 × 4 m com abertura de escada {rot}", "laje_abertura",
             lambda pol=pol: dict(obs=[placa(pol, LAJE)]), tipo="laje_abertura",
             info={"tam": [4, 4], "escada": esc, "escada_em": list(off)}, mini=(0.6, -1.0, 1.1))
    for nome, rot, tam in (("chao_4x2m", "Chão 4 × 2 m", (4, 2)), ("chao_2x2m", "Chão 2 × 2 m", (2, 2))):
        peca(nome, "chaos", rot, "chao", lambda tam=tam: dict(obs=[placa(ret(0, 0, *tam), 0.04, nome="chao")]),
             tipo="chao", info={"tam": list(tam)}, mini=(0.6, -1.0, 1.1))
    for L in (4.0, 2.0, 1.0, 0.5):
        peca(f"cinta_{cm(L)}", "andares", f"Cinta (friso entre andares) {rot_m(L)}", "cinta",
             lambda L=L: dict(obs=cinta(L)), tipo="cinta", info={"comp": L})
    peca("cinta_canto", "andares", "Cinta, canto externo", "cinta", lambda: dict(obs=cinta(0, canto=True)), tipo="cinta_canto")
    rotulos = {"reta": "Escada reta", "l_dir": "Escada em L (vira à direita)", "l_esq": "Escada em L (vira à esquerda)",
               "u_dir": "Escada em U (vira à direita)", "u_esq": "Escada em U (vira à esquerda)", "caracol": "Escada caracol"}
    for t, rot in rotulos.items():
        def fn(t=t):
            obs, quads, caixas, ext = escada(t)
            return dict(obs=obs, malha=quads, col=caixas, info={"ocupa": list(ext)})
        peca(f"escada_{t}", "andares", rot, "escada", fn, tipo="escada",
             info={"altura": ANDAR, "espelhos": 16 if t in ("reta", "caracol") else 17}, mini=(0.7, -1.0, 0.6))
    for est, rot in (("vidro", "de vidro"), ("metal", "de metal"), ("madeira", "de madeira")):
        for L in (2.0, 1.0, 0.5):
            peca(f"guarda_corpo_{est}_{cm(L)}", "andares", f"Guarda-corpo {rot} {rot_m(L)}", f"guarda_corpo_{est}",
                 lambda est=est, L=L: dict(obs=guarda_corpo(est, L)), tipo="guarda_corpo", info={"comp": L, "alt": 1.0})
        peca(f"guarda_corpo_{est}_fim", "andares", f"Guarda-corpo {rot}, poste da ponta", f"guarda_corpo_{est}",
             lambda est=est: dict(obs=guarda_corpo(est, 0, fim=True)), tipo="guarda_corpo_fim")


def registra_acesso():
    for h in FUNDACOES:
        hs = f"h{int(round(h * 100))}"
        for L in (4.0, 2.0, 1.0, 0.5):
            peca(f"soco_{hs}_{cm(L)}", "acesso", f"Fundação {rot_m(L)} (h {rot_m(h)})", "soco",
                 lambda h=h, L=L: dict(obs=soco(h, L)), tipo="soco", info={"h": h, "comp": L})
        peca(f"soco_{hs}_canto", "acesso", f"Fundação, canto (h {rot_m(h)})", "soco",
             lambda h=h: dict(obs=soco(h, 0, canto=True)), tipo="soco_canto", info={"h": h})

        def fdeg(h=h):
            obs, caixas, quads = degraus_entrada(h)
            return dict(obs=obs, col=caixas, malha=quads)
        peca(f"degraus_entrada_{hs}", "acesso", f"Degraus de entrada (h {rot_m(h)})", "degraus", fdeg, tipo="degraus",
             info={"h": h, "larg": 1.5})

        def framp(h=h):
            obs, caixas, quads, L = rampa(h)
            return dict(obs=obs, col=caixas, malha=quads, info={"comp": L})
        peca(f"rampa_{hs}", "acesso", f"Rampa acessível (h {rot_m(h)}, 7,5 %)", "rampa", framp, tipo="rampa",
             info={"h": h, "larg": 1.5})
        peca(f"patamar_{hs}", "acesso", f"Patamar de entrada 1,5 × 1,5 m (h {rot_m(h)})", "patamar",
             lambda h=h: dict(obs=patamar(h)), tipo="patamar", info={"h": h})
        for lx, ly in ((2.0, 2.0), (2.0, 1.0)):
            peca(f"deck_{cm(lx)[:-1]}x{cm(ly)}_{hs}", "acesso", f"Piso de deck {rot_m(lx)[:-2]} × {rot_m(ly)} (h {rot_m(h)})",
                 "deck", lambda h=h, lx=lx, ly=ly: dict(obs=deck(h, lx, ly), col=[((lx / 2, -ly / 2, -h), (lx, ly, h - 0.02))],
                                                         slots=[("piso", (lx / 2, -ly / 2, -0.02), (lx - 0.2, ly - 0.2, 2.0))]),
                 tipo="deck", info={"h": h, "tam": [lx, ly]})
    for est, rot in (("classica", "Coluna clássica"), ("madeira", "Coluna de madeira")):
        peca(f"coluna_{est}", "acesso", rot, "coluna", lambda est=est: dict(obs=coluna(est)), tipo="coluna",
             info={"alt": 2.8})
    for L in (4.0, 2.0, 1.0, 0.5):
        peca(f"viga_{cm(L)}", "acesso", f"Viga de varanda {rot_m(L)}", "viga", lambda L=L: dict(obs=viga(L)), tipo="viga",
             info={"comp": L})
    for W, D, est in ((2.0, 1.0, "metal"), (3.0, 1.0, "vidro"), (4.0, 1.5, "madeira")):
        peca(f"sacada_{cm(W)[:-1]}x{cm(D)}_{est}", "acesso", f"Sacada {rot_m(W)[:-2]} × {rot_m(D)} ({est})", "sacada",
             lambda W=W, D=D, est=est: dict(obs=sacada(W, D, est), slots=[("piso", (W / 2, -0.09 - D / 2, -0.02),
                                                                             (W - 0.3, D - 0.2, 2.0))]),
             tipo="sacada", info={"tam": [W, D]}, tex={"piso": "mosaico_cinza"})
    for W in (2.0, 3.0):
        def falp(W=W):
            obs, zv = alpendre(W)
            return dict(obs=obs, info={"viga_z": round(zv, 3)})
        peca(f"alpendre_{cm(W)}", "acesso", f"Alpendre de entrada {rot_m(W)}", "alpendre", falp, tipo="alpendre",
             info={"larg": W, "telha_z_parede": 2.6})
    peca("arandela_varanda", "acesso", "Arandela de varanda", "luz", lambda: dict(obs=arandela(), col=[]),
         tipo="luz", fixacao="parede", info={"altura_instalacao": 1.9})
    peca("plafon_varanda", "acesso", "Plafom de varanda", "luz", lambda: dict(obs=plafon(), col=[((0, 0, -0.14), (0.26, 0.26, 0.14))]), tipo="luz",
         fixacao="teto")
    peca("balizador_jardim", "acesso", "Balizador de jardim", "luz", lambda: dict(obs=balizador()), tipo="luz")


def registra_cercas():
    for tipo, c in CERCAS.items():
        for L in (2.0, 1.0):
            peca(f"cerca_{tipo}_{cm(L)}", "cercas", f"{c['rot']} {rot_m(L)}", f"cerca_{tipo}",
                 lambda tipo=tipo, L=L: dict(obs=cerca(tipo, L)), tipo="modulo", info={"comp": L, "alt": c["alt"]})
        peca(f"cerca_{tipo}_canto", "cercas", f"{c['rot']}, canto", f"cerca_{tipo}",
             lambda tipo=tipo: dict(obs=cerca(tipo, 0, "canto")), tipo="canto")
        peca(f"cerca_{tipo}_fim", "cercas", f"{c['rot']}, fim", f"cerca_{tipo}",
             lambda tipo=tipo: dict(obs=cerca(tipo, 0, "fim")), tipo="fim")
    for tipo in ("madeira", "ripada", "metal", "mureta_grade"):
        def fpp(tipo=tipo):
            obs, folha, dob, h = portao_pedestre(tipo)
            return dict(obs=obs, portas=[(folha, dob, "z", 100)])
        peca(f"portao_pedestre_{tipo}", "cercas", f"Portão de pedestre ({CERCAS[tipo]['rot'].lower()})", "portao_pedestre",
             fpp, tipo="portao", info={"comp": 1.0, "vao": 0.9})

    def fbasc():
        obs, folha, (_, dob, eixo) = portao_garagem("basculante")
        return dict(obs=obs, portas=[(folha, dob, eixo, -88)])

    def fcorr():
        obs, folha, (_, dire, curso) = portao_garagem("correr")
        return dict(obs=obs, correr=[(folha, dire, curso)])
    peca("portao_garagem_basculante", "cercas", "Portão de garagem basculante 3 m", "portao_garagem", fbasc,
         tipo="portao", info={"comp": 3.0, "vao": 2.78})
    peca("portao_garagem_correr", "cercas", "Portão de garagem de correr 3 m", "portao_garagem", fcorr, tipo="portao",
         info={"comp": 3.0, "vao": 2.8})
    peca("cerca_doce_2m_pacote", "cercas", "Cerca de doce 2 m (Natal)", "cerca_doce", lambda: dict(obs=importa_cerca_doce()),
         tipo="modulo", pacote=True, info={"comp": 2.0})


def registra_quintal():
    rot = {"miolo": "meio", "borda": "borda", "borda_luz": "borda com luz", "canto": "canto", "degraus": "degraus"}
    for t, r in rot.items():
        def fp(t=t):
            col = [((0.5, 0.5, P_FUNDO - 0.15), (1.0, 1.0, 0.15))]
            if t != "miolo":
                col.append(((0.5, -0.17, P_FUNDO - 0.15), (1.0, 0.36, 0.15 - P_FUNDO + P_BORDA)))
            if t == "canto":
                col.append(((-0.17, 0.5, P_FUNDO - 0.15), (0.36, 1.0, 0.15 - P_FUNDO + P_BORDA)))
            return dict(obs=piscina_celula(t), col=col)
        peca(f"piscina_{t}", "quintal", f"Piscina, {r} (1 × 1 m)", "piscina", fp, tipo="piscina_celula",
             info={"agua_z": P_AGUA, "fundo_z": P_FUNDO, "borda_z": P_BORDA}, mini=(0.6, -1.0, 0.9))
    peca("piscina_prainha", "quintal", "Piscina, prainha (1 × 1 m)", "piscina", lambda: dict(obs=prainha(),
         col=[((0.5, 0.5, P_FUNDO), (1, 1, P_PRAINHA - P_FUNDO))]), tipo="piscina_prainha", info={"topo_z": P_PRAINHA},
         mini=(0.6, -1.0, 0.9))
    peca("piscina_prainha_rampa", "quintal", "Piscina, rampa da prainha (1 × 1 m)", "piscina",
         lambda: dict(obs=prainha(True), col=[((0.5, 0.5, P_FUNDO), (1, 1, 0.3))],
                      malha=[[(0, 0, P_PRAINHA), (1, 0, P_PRAINHA), (1, 1, P_FUNDO), (0, 1, P_FUNDO)]]),
         tipo="piscina_prainha", mini=(0.6, -1.0, 0.9))
    peca("piscina_escadinha", "quintal", "Escadinha de piscina", "piscina", lambda: dict(obs=escadinha()), tipo="piscina_prop")
    peca("piscina_trampolim", "quintal", "Trampolim", "piscina", lambda: dict(obs=trampolim()), tipo="piscina_prop")
    for W in (3.0, 6.0):
        def ft(W=W):
            obs, caixas = telheiro(W)
            vagas = [("vaga", (W / 2, 3.0, 0.03), (2.6, 5.4, 2.2))] if W < 4 else \
                [("vaga_1", (1.5, 3.0, 0.03), (2.6, 5.4, 2.2)), ("vaga_2", (4.5, 3.0, 0.03), (2.6, 5.4, 2.2))]
            return dict(obs=obs, col=caixas, slots=vagas)
        peca(f"telheiro_{int(W)}x6m", "quintal", f"Garagem aberta {int(W)} × 6 m", "telheiro", ft, tipo="telheiro",
             info={"tam": [W, 6.0]}, tex={"telha": "telha_metalica_cinza"})
    for L, nome in ((2.0, "caminho_pedras_2m"), (1.0, "caminho_pedras_1m"), (0.5, "pisante")):
        peca(nome, "quintal", "Pisante de pedra" if L == 0.5 else f"Caminho de pedras {rot_m(L)}", "caminho",
             lambda L=L: dict(obs=caminho_pedras(L), col=[((0, L / 2, 0), (0.5, L, 0.03))]), tipo="caminho", info={"comp": L})


def registra_lotes():
    for nq in (1, 2):
        def fl(nq=nq):
            obs, gramado, porta, (cx, cy), (xg0, xg1) = lote(nq)
            X = 7.5 * nq
            return dict(obs=obs, filhos=[gramado], portas=[(porta, (cx, cy - 0.2, 1.03), "x", 95)],
                        slots=[("correio", (cx, cy + 0.02, 1.06), (0.18, 0.34, 0.14))],
                        col=[((0, 0, -0.4), (2 * X, 15, 0.4)), ((cx, cy, 0), (0.3, 0.5, 1.3))],
                        info={"entrada_garagem": [[xg0, xg1], [-5.5, 1.0]], "caixa_correio": [cx, cy]})
        X = 7.5 * nq
        peca(f"lote_{15 * nq}x15", "lotes", f"Lote {15 * nq} × 15 m ({nq} quadra{'s' if nq > 1 else ''})", "lote", fl,
             tipo="lote", mini=(0.6, -1.0, 1.1),
             info={"quadras": nq, "tam": [15 * nq, 15], "calcada": [[-X, X], [-7.5, -5.5]],
                   "area_construivel": [[-X + 1.5, X - 1.5], [-3.5, 6.0]],
                   "linha_cerca": {"frente_y": -5.5, "lados_x": [-X + 0.5, X - 0.5], "fundo_y": 6.5},
                   "recortavel": "gramado"})

    def fcc():
        obs, porta = caixa_correio()
        return dict(obs=obs, portas=[(porta, (0, -0.2, 1.03), "x", 95)], slots=[("correio", (0, 0.02, 1.06), (0.18, 0.34, 0.14))])
    peca("caixa_correio", "lotes", "Caixa de correio", "caixa_correio", fcc, tipo="caixa_correio")


SECOES = ("telhados", "andares", "acesso", "cercas", "quintal", "lotes")
REGRAS = {
    "grade": 0.5, "parede": {"alt": ALT, "esp": ESP}, "laje": LAJE, "andar": ANDAR,
    "piso_andar": "z = h + 3,2·n (h = altura da fundação, n = andar a partir de 0)",
    "telhado": {"origem": "topo das paredes em que se apoia (z = h + 3,2·n + 3), na linha da grade",
                "vaos": list(VAOS), "inclinacoes": INCL, "beiral": BEIRAL, "espessura": E_TELHA,
                "topo_da_telha": "z(d) = (d − 0,075)·p + 0,09·√(1 + p²), d = distância para dentro da linha do beiral",
                "cumeeira": "o tubo vai em (x, S/2, cumeeira_z); serve para todas as inclinações"},
    "fundacoes": list(FUNDACOES),
    "piscina": {"fundo": P_FUNDO, "agua": P_AGUA, "borda": P_BORDA, "prainha": P_PRAINHA, "celula": 1.0},
    "lote": {"calcada_z": 0.0, "quadra": 15.0},
}


def main():
    global PASTA
    a = sys.argv[sys.argv.index("--") + 1:]
    PASTA = a[0]
    sel = set(a[1].split(",")) if len(a) > 1 and a[1] else None
    os.makedirs(os.path.join(PASTA, "pecas"), exist_ok=True)
    os.makedirs(os.path.join(PASTA, "miniaturas"), exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    prepara_materiais()
    registra_telhados()
    registra_andares()
    registra_acesso()
    registra_cercas()
    registra_quintal()
    registra_lotes()
    fcat = os.path.join(PASTA, "construcao.json")
    cat = json.load(open(fcat))
    for s in SECOES:
        cat.setdefault(s, [])
    cat["casa"] = REGRAS
    feitos = 0
    for spec in REG:
        if sel and not (spec["id"] in sel or spec["secao"] in sel or spec["grupo"] in sel or
                        any(spec["id"].startswith(x.rstrip("*")) for x in sel if x.endswith("*"))):
            continue
        mb.limpa()
        e = exporta(spec, PASTA)
        lst = cat.setdefault(spec["secao"], [])
        if spec["secao"] == "chaos":
            e = {"id": e["id"], "rotulo": e["rotulo"], "tam": e["tam"], "arquivo": e["arquivo"],
                 "materiais": ["piso", "borda"], "dims": e["dims"], "colisao": e["colisao"], "tris": e["tris"]}
        cat[spec["secao"]] = [x for x in lst if x["id"] != e["id"]] + [e]
        feitos += 1
        if feitos % 10 == 0:
            json.dump(cat, open(fcat, "w"), ensure_ascii=False, indent=1)
    # ordem do registro (a página mostra nessa ordem)
    ordem = {s["id"]: i for i, s in enumerate(REG)}
    for s in SECOES:
        cat[s].sort(key=lambda x: ordem.get(x["id"], 1e9))
    json.dump(cat, open(fcat, "w"), ensure_ascii=False, indent=1)
    # visão para a auditoria dos móveis (mesmo formato: <pasta>/_audita/<seção>/catalogo.json)
    for s in SECOES:
        d = os.path.join(PASTA, "_audita", s)
        os.makedirs(d, exist_ok=True)
        itens = [dict(x, categoria=s, arquivo="../../" + x["arquivo"], miniatura="../../" + x["miniatura"])
                 for x in cat[s]]
        json.dump({"categoria": s, "itens": itens}, open(os.path.join(d, "catalogo.json"), "w"), ensure_ascii=False)
    print("fim", feitos, "peças", flush=True)


if __name__ == "__main__":
    main()
