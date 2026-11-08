"""Biblioteca de cidade do Morada: prédios de estilo MÁGICO (candy colors, telhados exagerados, janelas redondas e em
arco). Marcos (cristais, castelo de areia, castelo rosa, casa na árvore) e casas fofas de conto de fadas.

Uso (ver GUIA_PREDIOS.md e GUIA_CIDADE.md):
  python3 -I morada-art/predios_magicos_estampas.py SP/cidade_out          (placas pintadas, uma vez)
  MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/predios_magicos.py -- SP/cidade_out [ids...]
Grava SP/cidade_out/predios_magicos/ (glb/, miniaturas/, catalogo.json).

Convenções: origem no centro da projeção, base em z = 0 (calçada), frente para −Y. Lote de 15 × 15 m (projeção até
13 × 13 m); o castelo rosa ocupa 2 × 2 quadras. Andar de 3,2 m (cb.ANDAR). Toda janela tem o vidro numa face própria
com janela / janela_fria / janela_apagada (≈ 40 % apagadas), para acender à noite.
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import moveis_base as mb  # noqa: E402
import cidade_base as cb  # noqa: E402

V = Vector
AND = cb.ANDAR  # 3,2 m
RAD = math.radians
ESTILO = "magico"
SAIDA = None


# =====================================================================================================================
# Utilidades
# =====================================================================================================================
def _lista(objs):
    out = []
    if objs is None:
        return out
    if isinstance(objs, (list, tuple)):
        for o in objs:
            out += _lista(o)
    else:
        out.append(objs)
    return out


def poe(objs, x=0.0, y=0.0, z=0.0, ang=0.0, incl=0.0, esc=None):
    """Move peças feitas no 'quadro da parede' (plano y = 0, frente para −Y, base em z = 0) para o lugar: gira ang graus
    em Z (0 = frente −Y, 90 = lado +X, 180 = fundos +Y, −90 = lado −X), inclina incl graus em X antes (negativo olha
    para cima) e translada."""
    M = Matrix.Translation((x, y, z)) @ Matrix.Rotation(RAD(ang), 4, "Z") @ Matrix.Rotation(RAD(incl), 4, "X")
    if esc:
        M = M @ Matrix.Diagonal((*esc, 1))
    for o in _lista(objs):
        o.data.transform(M)
    return objs


def poe_normal(objs, p, n):
    """Coloca peças de parede num ponto p de uma superfície curva, olhando para a normal n."""
    n = V(n).normalized()
    ang = math.degrees(math.atan2(n.x, -n.y))
    incl = -math.degrees(math.asin(max(-1.0, min(1.0, n.z))))
    return poe(objs, p[0], p[1], p[2], ang, incl)


def cil(r, a, x=0.0, y=0.0, z=0.0, cor="branco", seg=20, bisel=0.006, eixo="z", r2=None, mat="atlas", nome="cilindro",
        tampas=True):
    """Como mb.cilindro, mas com o boleado das bordas num segmento só (malha bem mais leve nas torres)."""
    bm = bmesh.new()
    r2 = r if r2 is None else r2
    bmesh.ops.create_cone(bm, cap_ends=tampas, cap_tris=False, segments=seg, radius1=r, radius2=r2, depth=a)
    if bisel > 0 and tampas and min(r, r2) > 0:
        borda = [e for e in bm.edges if len(e.link_faces) == 2 and
                 abs(e.link_faces[0].normal.dot(e.link_faces[1].normal)) < 0.5]
        mb._bevel(bm, min(bisel, a / 2.1, min(r, r2) * 0.9), 1, borda)
    if eixo == "z":
        M = Matrix.Translation((x, y, z + a / 2))
    elif eixo == "x":
        M = Matrix.Translation((x, y, z)) @ Matrix.Rotation(math.pi / 2, 4, "Y")
    else:
        M = Matrix.Translation((x, y, z)) @ Matrix.Rotation(math.pi / 2, 4, "X")
    bm.transform(M)
    return mb._obj(nome, bm, cor, mat)


class Sorteio:
    """Materiais das janelas: ciclos de 10 com 4 apagadas, 4 quentes e 2 frias, embaralhados (o desenho da noite fica
    variado e nenhuma casa fica toda acesa ou toda apagada)."""

    def __init__(self, semente):
        self.rnd = random.Random(semente)
        self.fila = []

    def __call__(self):
        if not self.fila:
            self.fila = ["janela_apagada"] * 4 + ["janela"] * 4 + ["janela_fria"] * 2
            self.rnd.shuffle(self.fila)
        return self.fila.pop()


SORT = Sorteio(1)
RND = random.Random(1)


def _flip_para(ob, alvo):
    """Garante a normal (média) de uma malha plana apontando para 'alvo'."""
    me = ob.data
    s = V((0, 0, 0))
    for p in me.polygons:
        s += p.normal * p.area
    if s.dot(V(alvo)) < 0:
        me.flip_normals()
    return ob


def plano_xz(pts, y, cor=None, mat="atlas", nome="plano"):
    """Face plana (contorno no plano da parede x, z) em y, com a normal para −Y."""
    bm = bmesh.new()
    vs = [bm.verts.new((u, y, v)) for u, v in pts]
    f = bm.faces.new(vs)
    if len(vs) > 4:
        bmesh.ops.triangulate(bm, faces=[f], quad_method="BEAUTY", ngon_method="BEAUTY")
    return _flip_para(mb._obj(nome, bm, cor, mat=mat, liso=False), (0, -1, 0))


def placa_estampa(png, w, h, y=-0.02, nome="placa"):
    """Quadro com textura própria (estampa) no plano da parede, centrado em x, base em z = 0, face para −Y."""
    mi = mb.material_estampa(os.path.splitext(os.path.basename(png))[0], png)
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    vs = [bm.verts.new(c) for c in ((-w / 2, y, 0), (w / 2, y, 0), (w / 2, y, h), (-w / 2, y, h))]
    f = bm.faces.new(vs)
    for lo, uv in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        lo[uvl].uv = uv
    return _flip_para(mb._obj(nome, bm, None, mat=mi, liso=False), (0, -1, 0))


# ---------------------------------------------------------------------------------------------------- contornos 2D
def ct_ret(w, h, r=0.0, seg=2):
    """Retângulo w × h com a base em v = 0 (centrado em u), anti-horário."""
    if r <= 0.001:
        return [(-w / 2, 0.0), (w / 2, 0.0), (w / 2, h), (-w / 2, h)]
    return [(u, v + h / 2) for u, v in mb.ret_arredondado(w, h, r, seg)]


def ct_arco(w, h, n=10):
    """Janela em arco: retângulo com meia-lua em cima (altura total h, base em v = 0)."""
    rr = w / 2
    hc = max(h - rr, 0.02)
    return [(-w / 2, 0.0), (w / 2, 0.0)] + [(rr * math.cos(math.pi * k / n), hc + rr * math.sin(math.pi * k / n))
                                             for k in range(n + 1)]


def ct_circ(r, n=20):
    """Círculo de raio r com a base em v = 0."""
    return [(r * math.cos(2 * math.pi * k / n - math.pi / 2), r + r * math.sin(2 * math.pi * k / n - math.pi / 2))
            for k in range(n)]


def _contornos(forma, w, h, f, n=None):
    if forma == "ret":
        return ct_ret(w, h), [(u, v - f) for u, v in ct_ret(w + 2 * f, h + 2 * f)]
    if forma == "arredondada":
        r = min(w, h) * 0.22
        return ct_ret(w, h, r, 2), [(u, v - f) for u, v in ct_ret(w + 2 * f, h + 2 * f, r + f, 2)]
    if forma == "arco":
        k = n or 6
        return ct_arco(w, h, k), [(u, v - f) for u, v in ct_arco(w + 2 * f, h + 2 * f, k)]
    if forma == "redonda":
        k = n or (14 if w >= 0.9 else 12)
        return ct_circ(w / 2, k), [(u, v - f) for u, v in ct_circ(w / 2 + f, k)]
    raise ValueError(forma)


def anel(ext, inn, prof, cor, fundo=0.05, nome="moldura"):
    """Moldura: anel entre o contorno de fora e o de dentro (mesmo número de pontos), saindo 'prof' da parede (−Y) e
    entrando 'fundo' nela."""
    bm = bmesh.new()
    n = len(ext)
    ef = [bm.verts.new((u, -prof, v)) for u, v in ext]
    eb = [bm.verts.new((u, fundo, v)) for u, v in ext]
    if_ = [bm.verts.new((u, -prof, v)) for u, v in inn]
    ib = [bm.verts.new((u, fundo, v)) for u, v in inn]
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((ef[i], ef[j], if_[j], if_[i]))
        bm.faces.new((eb[j], ef[j], ef[i], eb[i]))
        bm.faces.new((if_[i], if_[j], ib[j], ib[i]))
        bm.faces.new((ib[i], ib[j], eb[j], eb[i]))
    return mb._obj(nome, bm, cor, liso=True, angulo=40)


# ---------------------------------------------------------------------------------------------------- janelas e portas
def janela(forma="ret", w=0.9, h=1.3, cor="branco", f=0.12, prof=0.12, cruz=True, peitoril=True, persiana=None,
           floreira=False, mat=None, n=None):
    """Janela no quadro da parede (base do vão em z = 0, centrada em x = 0, parede em y = 0, frente −Y).
    forma: ret, arredondada, arco, redonda (w = diâmetro). O vidro é uma face própria com janela/janela_fria/
    janela_apagada (sorteado). persiana = cor das venezianas; floreira = jardineira com flores embaixo."""
    if forma == "redonda":
        h = w
    inn, ext = _contornos(forma, w, h, f, n)
    objs = [anel(ext, inn, prof, cor), plano_xz(inn, -prof * 0.3, mat=mat or SORT(), nome="vidro_janela")]
    yb = -prof * 0.42
    if cruz:
        b = max(0.045, w * 0.06)
        if forma == "redonda":
            objs.append(mb.caixa(b, 0.04, h, y=yb, z=0, cor=cor, bisel=0, liso=False))
            objs.append(mb.caixa(w, 0.04, b, y=yb, z=h / 2 - b / 2, cor=cor, bisel=0, liso=False))
        else:
            objs.append(mb.caixa(b, 0.04, h, y=yb, z=0, cor=cor, bisel=0, liso=False))
            zc = (h - w / 2) if forma == "arco" else h * 0.55
            objs.append(mb.caixa(w, 0.04, b, y=yb, z=zc - b / 2, cor=cor, bisel=0, liso=False))
    if peitoril and forma != "redonda":
        objs.append(mb.caixa(w + 2 * f + 0.16, prof + 0.14, 0.1, y=-(prof + 0.14) / 2 + 0.04, z=-f - 0.1, cor=cor,
                             bisel=0, liso=False))
    if persiana:
        ws = w * 0.52
        for s in (-1, 1):
            x = s * (w / 2 + f + ws / 2 + 0.03)
            hh = h if forma != "redonda" else h * 0.9
            objs.append(mb.caixa(ws, 0.07, hh, x=x, y=-0.035, z=0, cor=persiana, bisel=0.025, seg=1))
            objs.append(mb.caixa(ws * 0.7, 0.03, 0.05, x=x, y=-0.08, z=hh * 0.5, cor=cor, bisel=0, liso=False))
    if floreira:
        wf = w + 2 * f + 0.1
        zf = -f - 0.48
        objs.append(mb.caixa(wf, 0.4, 0.34, y=-0.2, z=zf, cor=floreira if isinstance(floreira, str) else "madeira",
                             bisel=0.05, seg=1))
        objs.append(mb.caixa(wf - 0.12, 0.3, 0.12, y=-0.2, z=zf + 0.3, cor="folha", bisel=0.05, seg=1))
        for k in range(4):
            cf = ["rosa", "amarelo", "vermelho_claro", "lilas"][(k + int(w * 10)) % 4]
            objs.append(mb.esfera(0.11, x=-wf / 2 + wf * (k + 0.5) / 4, y=-0.24, z=zf + 0.46, cor=cf, seg=8))
    return objs


def porta(w=1.2, h=2.3, cor="madeira", cor_mold="branco", cor2=None, forma="arco", f=0.14, vigia=True,
          macaneta="ouro"):
    """Porta de entrada no quadro da parede: moldura, folha de tábuas, maçaneta e vigia redonda de vidro (janela)."""
    inn, ext = _contornos(forma, w, h, f)
    objs = [anel(ext, inn, 0.16, cor_mold),
            mb.extrudado(mb._ccw(list(inn)), 0.1, y=-0.06, plano="xz", cor=cor, bisel=0.02, seg=1)]
    cor2 = cor2 or {"madeira": "madeira_escura", "madeira_media": "madeira_escura", "madeira_mel": "madeira",
                    "chocolate": "marrom", "madeira_clara": "madeira_mel"}.get(cor, "grafite")
    hh = h - (w / 2 if forma == "arco" else 0.0)
    for s in (-1, 1):
        objs.append(mb.caixa(0.05, 0.03, hh * 0.85, x=s * w / 6, y=-0.07, z=0.12, cor=cor2, bisel=0, liso=False))
    objs.append(mb.esfera(0.07, x=w * 0.32, y=-0.13, z=min(1.0, h * 0.45), cor=macaneta, seg=10))
    if vigia:
        vg = janela("redonda", w=min(0.42, w * 0.34), cor=cor_mold, f=0.05, prof=0.05, cruz=True, peitoril=False)
        poe(vg, 0, -0.06, h - (w / 2 if forma == "arco" else 0.2) - 0.32)
        objs += vg
    return objs


def lampiao(cor="grafite_escuro"):
    """Lampião de parede (luz quente acesa), centro do vidro em z = 0, no quadro da parede."""
    objs = [mb.caixa(0.08, 0.32, 0.08, y=-0.16, z=0.18, cor=cor, bisel=0.02, seg=1),
            mb.caixa(0.3, 0.3, 0.05, y=-0.34, z=-0.24, cor=cor, bisel=0.015, seg=1),
            mb.caixa(0.2, 0.2, 0.38, y=-0.34, z=-0.2, cor=None, mat="luz", bisel=0.02, seg=1),
            cil(0.22, 0.16, x=0, y=-0.34, z=0.17, cor=cor, r2=0.03, seg=4, bisel=0)]
    for sx in (-1, 1):
        for sy in (-1, 1):
            objs.append(mb.caixa(0.035, 0.035, 0.4, x=sx * 0.11, y=-0.34 + sy * 0.11, z=-0.21, cor=cor, bisel=0,
                                 liso=False))
    return objs


def poste_luz(x, y, alt=2.6, cor="grafite_escuro"):
    objs = [cil(0.18, 0.15, x=x, y=y, z=0, cor=cor, seg=10, bisel=0.03),
            cil(0.06, alt, x=x, y=y, z=0.1, cor=cor, seg=8, bisel=0)]
    lp = lampiao(cor)
    poe(lp, x, y + 0.34, alt + 0.15)
    return objs + lp[1:]


def degraus(w, alt, n, prof=0.38, cor="cinza_claro"):
    """Escadinha no quadro da parede (sobe até 'alt' encostada em y = 0, para −Y)."""
    out = []
    for k in range(n):
        hk = alt * (n - k) / n
        out.append(mb.caixa(w, prof * (k + 1) + 0.04, hk, y=-(prof * (k + 1)) / 2 + 0.02, z=0, cor=cor, bisel=0.03,
                            seg=1))
    return out


# ---------------------------------------------------------------------------------------------------- telhados
def telhado(L, P, h, z0, cor, borda, beiral=0.5, esp=0.2, fileiras=5, oitao=None, cume="x", x=0.0, y=0.0,
            cumeeira=True, testeira=True, forro=None, oitoes=(True, True), passo=5.0, cor_alt=None):
    """Telhado de duas águas de fileiras de telhas (tábuas sobrepostas), com forro, cumeeira e testeiras grossas
    (borda). L × P é a projeção das paredes; z0 é o topo da parede; h a altura do cume acima de z0. cume "x" ou "y".
    oitao = cor do oitão (o triângulo de parede nas pontas) ou None. Devolve (objs, info) com a função z do telhado."""
    if cume == "y":
        L, P = P, L
    d = P / 2
    a = math.atan2(h, d)
    ta = math.tan(a)
    b = beiral
    ey, ez = -(d + b), z0 - b * ta
    S = math.hypot(d + b, h + b * ta)
    Lt = L + 2 * b
    objs = []
    forro = forro or borda
    for lado in (0, 1):
        ps = []
        # laje de base (o plano do telhado é o topo dela)
        lj = mb.caixa(Lt, S, esp * 0.6, cor=forro, bisel=0.03, seg=1)
        mb.transforma(lj, loc=(0, 0, -esp * 0.6))
        mb.transforma(lj, loc=(0, S / 2, 0))
        mb.transforma(lj, rot=("X", math.degrees(a)))
        mb.transforma(lj, loc=(0, ey, ez))
        ps.append(lj)
        ws = S / fileiras
        for k in range(fileiras):
            ult = k == fileiras - 1
            wb = (ws + esp * 0.3) if ult else ws * 1.25
            t = mb.caixa(Lt, wb, esp, cor=cor_alt if (cor_alt and k % 2) else cor, bisel=min(0.07, esp * 0.35), seg=1)
            mb.transforma(t, loc=(0, wb / 2, 0))
            mb.transforma(t, rot=("X", math.degrees(a) - (0 if ult else passo)))
            mb.transforma(t, loc=(0, 0, esp * 0.12))
            s0 = k * ws
            mb.transforma(t, loc=(0, ey + s0 * math.cos(a), ez + s0 * math.sin(a)))
            ps.append(t)
        if testeira:
            # testeira na beira do beiral (sob a primeira fileira) e nas duas empenas
            fa = mb.caixa(Lt + 0.1, 0.2, esp * 1.5, cor=borda, bisel=0.05, seg=1)
            mb.transforma(fa, rot=("X", math.degrees(a)))
            mb.transforma(fa, loc=(0, ey + 0.08, ez - esp * 0.85))
            ps.append(fa)
            if oitoes[0] or oitoes[1]:
                for sx, ok in ((-1, oitoes[0]), (1, oitoes[1])):
                    if not ok:
                        continue
                    te = mb.caixa(0.22, S + 0.12, esp * 2.2, cor=borda, bisel=0.06, seg=1)
                    mb.transforma(te, loc=(0, (S + 0.12) / 2 - 0.12, -esp * 0.95))
                    mb.transforma(te, rot=("X", math.degrees(a)))
                    mb.transforma(te, loc=(sx * (Lt / 2 + 0.06), ey, ez))
                    ps.append(te)
        if lado == 1:
            for o in ps:
                mb.transforma(o, rot=("Z", 180))
        objs += ps
    if cumeeira:
        objs.append(cil(esp * 0.95, Lt + 0.24, x=0, y=0, z=z0 + h + esp * 0.55, cor=borda, seg=12, eixo="x",
                                bisel=0.03))
    if oitao:
        for sx, ok in ((-1, oitoes[0]), (1, oitoes[1])):
            if not ok:
                continue
            tri = [(-d + 0.02, -0.02), (d - 0.02, -0.02), (0, h - 0.06)]
            x0 = (L / 2 - 0.3) if sx > 0 else -L / 2 + 0.005
            objs.append(mb.extrudado(tri, 0.295, x=x0, y=0, z=z0, cor=oitao, bisel=0.0, plano="yz", liso=False))
    rot = 90 if cume == "y" else 0
    for o in objs:
        mb.transforma(o, loc=(x, y, 0), rot=("Z", rot))

    def zt(u):
        """Altura do topo das telhas a uma distância u (perpendicular ao cume) do cume."""
        return z0 + (d - abs(u)) * ta + esp * 0.9
    return objs, {"z": zt, "a": a, "d": d, "zc": z0 + h, "S": S}


def telhado_4aguas(L, P, h, z0, cor, borda, beiral=0.5, esp=0.25, x=0.0, y=0.0):
    """Telhado de quatro águas (sólido boleado) com aba de borda."""
    Lb, Pb = L + 2 * beiral, P + 2 * beiral
    a = math.atan2(h, P / 2)
    zb = z0 - beiral * math.tan(a)
    hh = h + beiral * math.tan(a)
    r = max(0.0, (Lb - Pb) / 2)
    bm = bmesh.new()
    base = [bm.verts.new(c) for c in ((-Lb / 2, -Pb / 2, zb), (Lb / 2, -Pb / 2, zb), (Lb / 2, Pb / 2, zb),
                                       (-Lb / 2, Pb / 2, zb))]
    top = [bm.verts.new((-r, 0, zb + hh)), bm.verts.new((r, 0, zb + hh))]
    bm.faces.new((base[3], base[2], base[1], base[0]))
    bm.faces.new((base[0], base[1], top[1], top[0]))
    bm.faces.new((base[1], base[2], top[1]))
    bm.faces.new((base[2], base[3], top[0], top[1]))
    bm.faces.new((base[3], base[0], top[0]))
    mb._bevel(bm, 0.12, 2, [e for e in bm.edges])
    t = mb._obj("telhado4", bm, cor, liso=True, angulo=35)
    aba = mb.caixa(Lb + 0.1, Pb + 0.1, esp, z=zb - esp * 0.8, cor=borda, bisel=0.08, seg=2)
    objs = [t, aba]
    for o in objs:
        mb.transforma(o, loc=(x, y, 0))
    return objs


def lucarna(w, hp, parede, cor_tel, borda, cor_mold, prof=2.4, forma="arco", h_tel=None):
    """Água-furtada (lucarna) no quadro da parede: frente em y = 0 olhando −Y, base em z = 0; entra no telhado por trás."""
    objs = [mb.caixa(w, prof, hp + 0.9, y=prof / 2, z=-0.9, cor=parede, bisel=0.05, seg=1)]
    jn = janela(forma, w=w * 0.52, h=hp * 0.62, cor=cor_mold, f=0.09, prof=0.09, peitoril=False)
    poe(jn, 0, 0, hp * 0.16)
    objs += jn
    tl, _ = telhado(w, prof, h_tel or w * 0.62, hp, cor_tel, borda, beiral=0.22, esp=0.14, fileiras=1,
                    cume="y", y=prof / 2, oitao=parede, oitoes=(True, False), testeira=True)
    objs += tl
    return objs


def chamine(x, y, z0, z1, cor="tijolo", topo="cinza_claro", l=0.9, p=0.9):
    return [mb.caixa(l, p, z1 - z0, x=x, y=y, z=z0, cor=cor, bisel=0.06, seg=1),
            mb.caixa(l + 0.26, p + 0.26, 0.24, x=x, y=y, z=z1, cor=topo, bisel=0.06, seg=1),
            cil(0.2, 0.42, x=x, y=y, z=z1 + 0.2, cor=topo, seg=10, bisel=0.03)]


def cone(r, h, z0, cor, anel_cor=None, x=0.0, y=0.0, seg=24, ponta="esfera", cor_ponta="ouro"):
    """Telhado cônico de torre (sino, com a aba virada) com anel na base e ponteira."""
    pf = [(r * 0.96, 0.0), (r * 1.22, 0.08), (r * 1.2, 0.3), (r * 0.94, h * 0.2), (r * 0.66, h * 0.44),
          (r * 0.36, h * 0.7), (r * 0.12, h * 0.92), (0.0, h)]
    objs = [mb.torno(pf, x=x, y=y, z=z0, cor=cor, seg=seg, angulo=55)]
    if anel_cor:
        objs.append(cil(r * 1.06, 0.32, x=x, y=y, z=z0 - 0.3, cor=anel_cor, seg=seg, bisel=0.06))
    if ponta == "esfera":
        objs.append(mb.esfera(max(0.12, r * 0.09), x=x, y=y, z=z0 + h + 0.02, cor=cor_ponta, seg=8))
    elif ponta == "lanca":
        objs.append(cil(0.08, 0.9, x=x, y=y, z=z0 + h - 0.1, cor=cor_ponta, r2=0.0, seg=8, bisel=0))
    return objs


def bandeira(x, y, z, cor="vermelho", alt=2.2, larg=1.1, ang=0.0):
    objs = [cil(0.05, alt, x=0, y=0, z=0, cor="branco", seg=8, bisel=0),
            mb.esfera(0.09, x=0, y=0, z=alt, cor="ouro", seg=8)]
    fl = mb.extrudado([(0, 0), (larg, 0.32), (0, 0.64)], 0.05, x=0.04, y=-0.025, z=alt - 0.75, cor=cor, bisel=0.01,
                      seg=1, plano="xz")
    objs.append(fl)
    for o in objs:
        mb.transforma(o, loc=(x, y, z), rot=("Z", ang))
    return objs


def ameias_circ(r, z, n, cor, w=0.55, h=0.65, esp=0.45, x=0.0, y=0.0, mureta=0.45):
    objs = []
    if mureta:
        objs.append(cil(r, mureta, x=x, y=y, z=z, cor=cor, seg=max(16, n * 2), bisel=0.06))
    for k in range(n):
        t = 2 * math.pi * (k + 0.5) / n
        m = mb.caixa(w, esp, h, cor=cor, bisel=0.08, seg=1)
        mb.transforma(m, loc=(x + (r - esp / 2) * math.cos(t), y + (r - esp / 2) * math.sin(t), z + mureta),
                      rot=("Z", math.degrees(t) + 90))
        objs.append(m)
    return objs


def ameias_lin(p0, p1, z, cor, w=0.6, h=0.7, esp=0.5, passo=1.3):
    """Merlões ao longo de um segmento (p0 → p1, 2D)."""
    a, b = V(p0), V(p1)
    L = (b - a).length
    n = max(1, int(L / passo))
    ang = math.degrees(math.atan2(b.y - a.y, b.x - a.x))
    objs = []
    for k in range(n):
        p = a + (b - a) * ((k + 0.5) / n)
        m = mb.caixa(w, esp, h, cor=cor, bisel=0.08, seg=1)
        mb.transforma(m, loc=(p.x, p.y, z), rot=("Z", ang))
        objs.append(m)
    return objs


def entorta(it, kx=0.0, ky=0.0, giro=0.0, z0=0.6, z1=None):
    """Casa torta de conto de fadas: desloca e gira a malha cada vez mais para cima (quadrático em z)."""
    partes = [o for o in it.partes if o.type == "MESH"]
    if z1 is None:
        z1 = max((o.matrix_world @ v.co).z for o in partes for v in o.data.vertices)
    for o in partes:
        for v in o.data.vertices:
            t = max(0.0, (v.co.z - z0) / (z1 - z0))
            s = t * t
            g = RAD(giro) * t
            x, y = v.co.x, v.co.y
            v.co.x = x * math.cos(g) - y * math.sin(g) + kx * s
            v.co.y = x * math.sin(g) + y * math.cos(g) + ky * s
        o.data.update()


def apoia_chao(it, z_min=0.0):
    """Achata em z_min o que ficou abaixo do chão (pontas enterradas de cristais, raízes): nada desce de z = 0."""
    for o in it.partes:
        if o.type != "MESH":
            continue
        for v in o.data.vertices:
            if v.co.z < z_min:
                v.co.z = z_min
        o.data.update()


def blob_contorno(r, n=28, ruido=0.12, semente=3):
    rnd = random.Random(semente)
    fases = [rnd.uniform(0, 6.28) for _ in range(3)]
    pts = []
    for k in range(n):
        t = 2 * math.pi * k / n
        rr = r * (1 + ruido * (0.5 * math.sin(2 * t + fases[0]) + 0.3 * math.sin(3 * t + fases[1]) +
                               0.2 * math.sin(5 * t + fases[2])))
        pts.append((rr * math.cos(t), rr * math.sin(t)))
    return pts


def fachada_janelas(objs, lado, L, P, us, z, **kj):
    """Janelas numa fachada de um bloco L × P centrado na origem: lado 'f' (−Y), 'd' (+X), 't' (+Y), 'e' (−X);
    us = posições ao longo da fachada (da esquerda para a direita de quem olha de fora)."""
    for u in us:
        jn = janela(**kj)
        if lado == "f":
            poe(jn, u, -P / 2, z, 0)
        elif lado == "t":
            poe(jn, -u, P / 2, z, 180)
        elif lado == "d":
            poe(jn, L / 2, u, z, 90)
        else:
            poe(jn, -L / 2, -u, z, -90)
        objs += jn
    return objs


# =====================================================================================================================
# Casas tortas de conto de fadas
# =====================================================================================================================
def casa_torta_empena(it, parede="rosa", tel="verde_claro", borda="branco", tel_borda="verde_lima", base="cinza_claro",
                      cor_porta="madeira", chamine_cor="tijolo"):
    """Sobrado de dois andares com empena cruzada na frente (a ala da porta), faixas e cunhais brancos, chaminé alta.
    Inclinado e girado (casa torta)."""
    L, P, PL = 9.0, 6.6, 0.45
    Hc = 2 * AND
    zt = PL + Hc
    o = []
    o.append(mb.caixa(L + 0.4, P + 0.4, PL, cor=base, bisel=0.08, seg=2))
    o.append(mb.caixa(L, P, Hc, z=PL, cor=parede, bisel=0.06, seg=2))
    # ala da frente
    Lw, Dw = 4.0, 1.5
    yw = -P / 2 - Dw / 2 + 0.05
    o.append(mb.caixa(Lw + 0.4, Dw + 0.3, PL, y=yw - 0.1, cor=base, bisel=0.08, seg=2))
    o.append(mb.caixa(Lw, Dw + 0.1, Hc, y=yw, z=PL, cor=parede, bisel=0.06, seg=2))
    # faixas entre os andares e cimalha
    for zz, hh in ((PL + AND - 0.12, 0.24), (zt - 0.16, 0.26)):
        o.append(mb.caixa(L + 0.24, P + 0.24, hh, z=zz, cor=borda, bisel=0.07, seg=1))
        o.append(mb.caixa(Lw + 0.24, Dw + 0.2, hh, y=yw - 0.06, z=zz, cor=borda, bisel=0.07, seg=1))
    for sx in (-1, 1):
        for sy in (-1, 1):
            o.append(mb.caixa(0.36, 0.36, Hc, x=sx * (L / 2 - 0.12), y=sy * (P / 2 - 0.12), z=PL, cor=borda, bisel=0.06,
                              seg=1))
        o.append(mb.caixa(0.32, 0.32, Hc, x=sx * (Lw / 2 - 0.1), y=-P / 2 - Dw + 0.12, z=PL, cor=borda, bisel=0.06,
                          seg=1))
    # telhados
    tl, ti = telhado(L, P, 4.4, zt + 0.08, tel, tel_borda, beiral=0.6, esp=0.22, fileiras=5, oitao=parede)
    o += tl
    tw, _ = telhado(Lw, P / 2 + Dw, 3.5, zt + 0.08, tel, tel_borda, beiral=0.45, esp=0.2, fileiras=4, cume="y",
                    y=-(P / 2 + Dw) / 2 - 0.02, oitao=parede, oitoes=(True, False))
    o += tw
    # janela redonda na empena da ala
    jr = janela("redonda", w=0.95, cor=borda, f=0.13)
    poe(jr, 0, -P / 2 - Dw - 0.015, zt + 0.75)
    o += jr
    # janelas
    kj = dict(forma="ret", w=0.9, h=1.3, cor=borda, persiana=None)
    for k in range(2):
        z = PL + k * AND + 0.85
        fachada_janelas(o, "f", L, P, [-3.2, 3.2], z, **kj)
        fachada_janelas(o, "d", L, P, [-1.6, 1.6], z, **kj)
        fachada_janelas(o, "e", L, P, [-1.6, 1.6], z, **kj)
        fachada_janelas(o, "t", L, P, [-2.8, 0, 2.8], z, **kj)
    jn = janela("arco", w=1.0, h=1.5, cor=borda, floreira="madeira")
    poe(jn, 0, -P / 2 - Dw, PL + AND + 0.8)
    o += jn
    # porta, escadinha e lampião
    pt = porta(1.3, 2.45, cor_porta, borda)
    poe(pt, 0, -P / 2 - Dw, PL)
    o += pt
    o += poe(degraus(2.0, PL, 2), 0, -P / 2 - Dw - 0.2, 0)
    o += poe(lampiao(), 1.15, -P / 2 - Dw, PL + 2.2)
    o += chamine(2.8, 1.3, zt, ti["zc"] + 1.6, chamine_cor)
    it.add(o)
    entorta(it, kx=0.28, giro=3.5)
    it.colisao([((0, 0, 0), (L + 0.4, P + 0.4, zt)), ((0, yw, 0), (Lw + 0.4, Dw + 0.3, zt)),
                ((0, 0, zt), (L + 1.2, P + 1.2, 4.4))])
    return dict(andares=2)


def casa_torta_lucarnas(it, terreo="azul", sup="branco_gelo", tel="laranja", tel_borda="laranja_claro",
                        viga="madeira_escura", jan="turquesa_escuro", base="cinza_claro"):
    """Casa de dois andares com o de cima em balanço (enxaimel), telhadão com três águas-furtadas e toldo na porta."""
    L, P, PL = 8.0, 7.0, 0.45
    o = []
    o.append(mb.caixa(L + 0.4, P + 0.4, PL, cor=base, bisel=0.08, seg=2))
    o.append(mb.caixa(L, P, AND, z=PL, cor=terreo, bisel=0.06, seg=2))
    z2 = PL + AND + 0.2
    L2, P2 = L + 0.5, P + 0.5
    o.append(mb.caixa(L + 0.66, P + 0.66, 0.3, z=PL + AND - 0.1, cor=viga, bisel=0.06, seg=1))
    o.append(mb.caixa(L2, P2, 2.9, z=z2, cor=sup, bisel=0.06, seg=2))
    zt = z2 + 2.9
    # enxaimel: vigas no andar de cima
    for sx in (-1, 1):
        for sy in (-1, 1):
            o.append(mb.caixa(0.26, 0.26, 2.9, x=sx * (L2 / 2 - 0.08), y=sy * (P2 / 2 - 0.08), z=z2, cor=viga,
                              bisel=0.05, seg=1))
    for u in (-1.3, 1.3):
        o.append(mb.caixa(0.2, 0.08, 2.9, x=u, y=-P2 / 2 - 0.02, z=z2, cor=viga, bisel=0.03, seg=1))
        o.append(mb.caixa(0.08, 0.2, 2.9, x=L2 / 2 + 0.02, y=u, z=z2, cor=viga, bisel=0.03, seg=1))
        o.append(mb.caixa(0.08, 0.2, 2.9, x=-L2 / 2 - 0.02, y=u, z=z2, cor=viga, bisel=0.03, seg=1))
    o.append(mb.caixa(L2 + 0.1, P2 + 0.1, 0.22, z=zt - 0.18, cor=viga, bisel=0.05, seg=1))
    tl, ti = telhado(L2, P2, 5.0, zt, tel, tel_borda, beiral=0.5, esp=0.24, fileiras=6, oitao=sup)
    o += tl
    # águas-furtadas
    for x, lado in ((-2.0, 0), (2.0, 0), (0.0, 1)):
        yf = -P2 / 2 + 1.0
        zb = ti["z"](P2 / 2 - 1.0) - 0.05
        lc = lucarna(1.8, 1.7, sup, tel, tel_borda, jan, forma="arco")
        poe(lc, x if lado == 0 else -x, yf if lado == 0 else -yf, zb, 0 if lado == 0 else 180)
        o += lc
    # janelas
    kj1 = dict(forma="arredondada", w=0.95, h=1.2, cor=jan)
    kj2 = dict(forma="ret", w=0.85, h=1.05, cor=jan, persiana=tel)
    fachada_janelas(o, "f", L, P, [1.7], PL + 0.9, **kj1)
    fachada_janelas(o, "d", L, P, [-1.7, 1.7], PL + 0.9, **kj1)
    fachada_janelas(o, "e", L, P, [-1.7, 1.7], PL + 0.9, **kj1)
    fachada_janelas(o, "t", L, P, [-2.2, 2.2], PL + 0.9, **kj1)
    fachada_janelas(o, "f", L2, P2, [-2.4, 0, 2.4], z2 + 0.5, **kj2)
    fachada_janelas(o, "d", L2, P2, [0], z2 + 0.5, **kj2)
    fachada_janelas(o, "e", L2, P2, [0], z2 + 0.5, **kj2)
    fachada_janelas(o, "t", L2, P2, [-2.4, 2.4], z2 + 0.5, **kj2)
    # porta com toldo
    xp = -1.8
    o += poe(porta(1.2, 2.3, "madeira_media", jan, forma="ret"), xp, -P / 2, PL)
    o += poe(degraus(1.9, PL, 2, cor="cinza"), xp, -P / 2 - 0.15, 0)
    toldo = mb.caixa(1.9, 1.0, 0.12, cor=tel, bisel=0.04, seg=1)
    mb.transforma(toldo, loc=(0, -0.5, 0))
    mb.transforma(toldo, rot=("X", -18))
    mb.transforma(toldo, loc=(xp, -P / 2, PL + 2.75))
    o.append(toldo)
    for k in range(5):
        o.append(cil(0.19, 1.9 / 5, x=xp - 0.95 + 1.9 * (k + 0.5) / 5, y=-P / 2 - 0.95, z=PL + 2.43,
                             cor=tel_borda, eixo="x", seg=10, bisel=0.02))
    o += poe(lampiao(), xp + 1.0, -P / 2, PL + 2.0)
    o += chamine(-2.6, 1.6, zt, ti["zc"] + 1.3, "tijolo")
    it.add(o)
    entorta(it, kx=-0.3, giro=-4.0)
    it.colisao([((0, 0, 0), (L + 0.4, P + 0.4, PL + AND)), ((0, 0, PL + AND), (L2, P2, zt - PL - AND)),
                ((0, 0, zt), (L2 + 1.4, P2 + 1.4, 5.0))])
    return dict(andares=2)


def casa_torta_torreao(it, parede="terracota_clara", tel="turquesa", tel_borda="turquesa_claro", borda="creme_claro",
                       base="cinza", jan="branco", cone_cor=None):
    """Casa de um andar e sótão com torreão redondo no canto (telhado cônico), duas águas-furtadas e chaminé de cano."""
    L, P, PL = 9.4, 7.0, 0.6
    Hp = 3.5
    zt = PL + Hp
    o = []
    o.append(mb.caixa(L + 0.4, P + 0.4, PL, cor=base, bisel=0.1, seg=2))
    o.append(mb.caixa(L, P, Hp, z=PL, cor=parede, bisel=0.06, seg=2))
    o.append(mb.caixa(L + 0.2, P + 0.2, 0.22, z=zt - 0.2, cor=borda, bisel=0.06, seg=1))
    for sx in (-1, 1):
        for sy in (-1, 1):
            o.append(mb.caixa(0.4, 0.4, Hp, x=sx * (L / 2 - 0.12), y=sy * (P / 2 - 0.12), z=PL, cor=borda, bisel=0.07,
                              seg=1))
    tl, ti = telhado(L, P, 4.6, zt, tel, tel_borda, beiral=0.65, esp=0.24, fileiras=5, oitao=parede)
    o += tl
    for x in (-2.8, -0.2):
        lc = lucarna(1.7, 1.6, parede, tel, tel_borda, jan, forma="arco")
        poe(lc, x, -P / 2 + 1.0, ti["z"](P / 2 - 1.0) - 0.05)
        o += lc
    lc = lucarna(1.7, 1.6, parede, tel, tel_borda, jan, forma="arco")
    poe(lc, -1.0, P / 2 - 1.0, ti["z"](P / 2 - 1.0) - 0.05, 180)
    o += lc
    # torreão no canto da frente à direita
    cx, cy, r = L / 2 - 0.9, -P / 2 + 0.6, 2.0
    ht = Hp + 2.8
    o.append(cil(r + 0.2, PL, x=cx, y=cy, z=0, cor=base, seg=20, bisel=0.08))
    o.append(cil(r, ht, x=cx, y=cy, z=PL, cor=parede, seg=20, bisel=0.0))
    o.append(cil(r + 0.12, 0.22, x=cx, y=cy, z=zt - 0.2, cor=borda, seg=20, bisel=0.05))
    o.append(cil(r + 0.1, 0.22, x=cx, y=cy, z=PL + ht - 0.22, cor=borda, seg=20, bisel=0.05))
    o += cone(r + 0.15, 5.2, PL + ht, cone_cor or tel, tel_borda, x=cx, y=cy, seg=20)
    for ang_, z, fm in ((-25, PL + 0.9, "arco"), (35, PL + 0.9, "arco"), (-60, PL + 0.9, "arco"),
                        (-20, zt + 0.55, "redonda"), (40, zt + 0.55, "redonda")):
        t = RAD(ang_ - 90)
        jn = janela(fm, w=0.85 if fm == "arco" else 0.8, h=1.45, cor=jan, f=0.11, peitoril=fm == "arco")
        poe(jn, cx + r * math.cos(t), cy + r * math.sin(t), z, ang_)
        o += jn
    # janelas
    kj = dict(forma="arco", w=0.9, h=1.45, cor=jan, persiana=tel)
    fachada_janelas(o, "f", L, P, [-3.3], PL + 0.9, **kj)
    fachada_janelas(o, "d", L, P, [1.4], PL + 0.9, **kj)
    fachada_janelas(o, "e", L, P, [-1.6, 1.6], PL + 0.9, **kj)
    fachada_janelas(o, "t", L, P, [-3.0, 0, 3.0], PL + 0.9, **kj)
    o += poe(porta(1.3, 2.5, "madeira", jan), -1.1, -P / 2, PL)
    o += poe(degraus(2.0, PL, 3, cor="cinza_claro"), -1.1, -P / 2 - 0.15, 0)
    o += poe(lampiao(), 0.0, -P / 2, PL + 2.2)
    # chaminé de cano
    xc, yc = -3.0, 1.4
    z0c = ti["z"](yc) - 0.4
    o.append(cil(0.42, ti["zc"] + 2.0 - z0c, x=xc, y=yc, z=z0c, cor="cinza_claro", seg=14, bisel=0.04))
    o.append(cil(0.55, 0.3, x=xc, y=yc, z=ti["zc"] + 1.9, cor="cinza", seg=14, bisel=0.06))
    o.append(cil(0.5, 0.18, x=xc, y=yc, z=z0c + 0.4, cor="cinza", seg=14, bisel=0.05))
    it.add(o)
    entorta(it, kx=0.22, ky=0.1, giro=2.5)
    it.colisao([((0, 0, 0), (L + 0.4, P + 0.4, zt)), ((cx, cy, 0), (2 * r + 0.4, 2 * r + 0.4, PL + ht + 4.5)),
                ((0, 0, zt), (L + 1.3, P + 1.3, 4.6))])
    return dict(andares=2)


# =====================================================================================================================
# Casa de cubo mágico
# =====================================================================================================================
def _cubo_pastilhas(S, z0, ang, cores, moldura, jan, rnd, porta_frente=False, topo=True):
    o = [mb.caixa(S - 0.12, S - 0.12, S - 0.12, z=z0 + 0.06, cor=moldura, bisel=0.3, seg=2)]
    n = 3
    c = S / n
    tp = c - 0.2
    esp = 0.2

    def cor_k(k):
        return cores[(k * 7 + rnd.randint(0, len(cores) - 1)) % len(cores)]

    k = 0
    faces = [0, 90, 180, -90]
    for fa in faces:
        grupo = []
        for i in range(n):
            for j in range(n):
                u = -S / 2 + c * (i + 0.5)
                zc = z0 + c * j + 0.1
                grupo.append(mb.caixa(tp, esp, tp, x=u, y=-S / 2, z=zc, cor=cor_k(k), bisel=0.09,
                                      seg=1))
                k += 1
                if porta_frente and fa == 0 and i == 1 and j == 0:
                    grupo += poe(porta(0.95, 1.85, "madeira_mel", "branco", forma="arco", f=0.1), u, -S / 2 - 0.1,
                                 zc + 0.08)
                elif (i + j + faces.index(fa)) % 2 == 0 or j == 2:
                    jn = janela("ret", w=tp * 0.5, h=tp * 0.42, cor="branco", f=0.1, prof=0.09, cruz=False,
                                peitoril=False)
                    poe(jn, u, -S / 2 - 0.1, zc + tp * 0.3)
                    grupo += jn
        for g in grupo:
            mb.transforma(g, rot=("Z", fa))
        o += grupo
    if topo:
        for i in range(n):
            for j in range(n):
                o.append(mb.caixa(tp, tp, esp, x=-S / 2 + c * (i + 0.5), y=-S / 2 + c * (j + 0.5), z=z0 + S - 0.1,
                                  cor=cor_k(k), bisel=0.09, seg=1))
                k += 1
    for g in o:
        mb.transforma(g, rot=("Z", ang))
    return o


def casa_cubo_magico(it, cores=("vermelho", "amarelo", "verde_lima", "azul_celeste", "laranja", "rosa", "branco"),
                     moldura="roxo_escuro", jan="branco"):
    """Dois cubos mágicos empilhados, o de cima girado: pastilhas coloridas, janelinhas e a porta numa pastilha."""
    rnd = random.Random(len(moldura) * 7 + len(cores))
    S1, S2 = 6.6, 6.0
    o = [mb.caixa(S1 + 0.3, S1 + 0.3, 0.3, cor=moldura, bisel=0.1, seg=2)]
    o += _cubo_pastilhas(S1, 0.25, 0, list(cores), moldura, jan, rnd, porta_frente=True, topo=True)
    o += _cubo_pastilhas(S2, 0.25 + S1 - 0.02, 17, list(cores), moldura, jan, rnd, topo=True)
    o += poe(degraus(1.4, 0.3, 1, cor=moldura), 0, -S1 / 2 - 0.2, 0)
    it.add(o)
    it.colisao([((0, 0, 0), (S1 + 0.4, S1 + 0.4, S1 + 0.4)), ((0, 0, S1 + 0.3), (S2 * 1.25, S2 * 1.25, S2 + 0.3))])
    return dict(andares=2)


# =====================================================================================================================
# Casa de doce
# =====================================================================================================================
def _gota(x, y, z, r, alt, cor):
    pf = [(0.0, -alt), (r * 0.6, -alt * 0.9), (r, -alt * 0.45), (r, 0.0), (0.0, 0.0)]
    return mb.torno(pf, x=x, y=y, z=z, cor=cor, seg=7, angulo=70)


def _bengala(x, y, h, ang=0):
    o = []
    n = 7
    for k in range(n):
        o.append(cil(0.13, h / n + 0.002, x=0, y=0, z=k * h / n, cor="vermelho" if k % 2 == 0 else "branco",
                             seg=10, bisel=0.0))
    o.append(mb.tubo(mb.arco_pts(0.35, h, 0.35, 180, 0, 8), 0.13, cor="vermelho", seg=8, raio_curva=0))
    o.append(mb.esfera(0.13, x=0.7, y=0, z=h, cor="branco", seg=8))
    for g in o:
        mb.transforma(g, loc=(x, y, 0), rot=("Z", ang))
    return o


def _pirulito(x, y, h, cores):
    o = [cil(0.07, h, x=x, y=y, z=0, cor="branco", seg=8, bisel=0)]
    r = 0.75
    for k, c in enumerate(cores):
        rr = r * (1 - k / len(cores))
        o.append(cil(rr, 0.22 + 0.04 * k, x=x, y=y, z=h + r, cor=c, eixo="y", seg=16, bisel=0.05))
    return o


def casa_doce(it, parede="caramelo", tel="rosa", tel_alt="rosa_claro", glace="branco", porta_cor="chocolate",
              estampa="placa_doces_rosa",
              confeitos=("vermelho", "amarelo", "verde_lima", "azul_celeste", "lilas")):
    """Casa de biscoito de gengibre: glacê escorrendo dos beirais, gomas no cume, janelas de biscoito, bengalas e
    pirulitos na porta e uma placa de DOCES."""
    L, P, PL = 8.0, 6.6, 0.35
    Hp = 3.7
    zt = PL + Hp
    o = []
    o.append(mb.extrudado(mb.ret_arredondado(L + 0.6, P + 0.6, 0.5, 4), PL, cor=glace, bisel=0.12, seg=2))
    o.append(mb.extrudado(mb.ret_arredondado(L, P, 0.45, 4), Hp, z=PL - 0.02, cor=parede, bisel=0.12, seg=2))
    o.append(mb.extrudado(mb.ret_arredondado(L + 0.25, P + 0.25, 0.55, 4), 0.26, z=zt - 0.24, cor=glace, bisel=0.11,
                          seg=2))
    # confeitos nos cantos
    for sx in (-1, 1):
        for sy in (-1, 1):
            for k in range(2):
                o.append(mb.esfera(0.2, x=sx * (L / 2 - 0.05), y=sy * (P / 2 - 0.05), z=PL + 1.0 + k * 1.5,
                                   cor=confeitos[(k + sx + 2 * sy) % len(confeitos)], seg=8))
    tl, ti = telhado(L, P, 4.2, zt, tel, glace, beiral=0.6, esp=0.28, fileiras=5, oitao=parede, passo=4.0,
                     cor_alt=tel_alt, cume="y")
    o += tl
    # glacê escorrendo dos beirais (laterais)
    ze = zt - 0.6 * math.tan(ti["a"])
    for lado in (-1, 1):
        n = 8
        o.append(cil(0.2, P + 1.35, x=lado * (L / 2 + 0.69), y=0, z=ze - 0.05, cor=glace, eixo="y", seg=10,
                     bisel=0.05))
        for k in range(n):
            y = -P / 2 - 0.45 + (P + 0.9) * (k + 0.5) / n
            alt = 0.4 + 0.3 * ((k * 37) % 5) / 4
            o.append(_gota(lado * (L / 2 + 0.71), y, ze - 0.05, 0.19, alt, glace))
    # granulado de confeito no telhado
    rr = random.Random(5)
    for lado in (-1, 1):
        for k in range(7):
            u = rr.uniform(0.7, L / 2 + 0.2)
            y = rr.uniform(-P / 2 + 0.2, P / 2 - 0.2)
            zz = ti["z"](u) + 0.1
            dc = cil(0.3, 0.14, cor=confeitos[(k + lado) % len(confeitos)], seg=8, bisel=0.04)
            mb.transforma(dc, rot=("Y", math.degrees(ti["a"]) * lado))
            mb.transforma(dc, loc=(lado * u, y, zz))
            o.append(dc)
    # gomas no cume
    for k in range(5):
        y = -P / 2 + 0.3 + (P - 0.6) * k / 4
        o.append(mb.torno([(0.0, 0.0), (0.38, 0.0), (0.4, 0.15), (0.3, 0.45), (0.0, 0.55)], x=0, y=y,
                          z=ti["zc"] + 0.35, cor=confeitos[k % len(confeitos)], seg=12, angulo=60))
    # janelas de biscoito
    kj = dict(forma="redonda", w=1.05, cor=glace, f=0.16, prof=0.14)
    fachada_janelas(o, "f", L, P, [-2.5, 2.5], PL + 1.0, **kj)
    fachada_janelas(o, "d", L, P, [-1.5, 1.5], PL + 1.0, **kj)
    fachada_janelas(o, "e", L, P, [-1.5, 1.5], PL + 1.0, **kj)
    fachada_janelas(o, "t", L, P, [-2.0, 2.0], PL + 1.0, **kj)
    for sy in (-1, 1):
        jr = janela("redonda", w=0.95, cor=glace, f=0.15)
        poe(jr, 0, sy * P / 2, zt + 0.95, 0 if sy < 0 else 180)
        o += jr
    # porta de chocolate (gomos) com placa
    pt = porta(1.3, 2.4, porta_cor, glace, vigia=True)
    o += poe(pt, 0, -P / 2, PL)
    for i in (-1, 1):
        for j in range(2):
            o.append(mb.caixa(0.36, 0.06, 0.5, x=i * 0.3, y=-P / 2 - 0.1, z=PL + 0.25 + j * 0.62, cor=porta_cor,
                              bisel=0.05, seg=1))
    if estampa:
        png = os.path.join(SAIDA, "predios_magicos", "estampas", estampa + ".png")
        o.append(mb.caixa(2.4, 0.12, 0.98, x=0, y=-P / 2 - 0.08, z=PL + 2.72, cor=glace, bisel=0.05, seg=1))
        o.append(poe(placa_estampa(png, 2.24, 0.84, y=0), 0, -P / 2 - 0.15, PL + 2.79))
    o += _bengala(-1.15, -P / 2 - 0.45, 2.3, ang=180)
    o += _bengala(1.15, -P / 2 - 0.45, 2.3, ang=0)
    o += _pirulito(-3.3, -P / 2 - 1.0, 1.4, [tel, glace, confeitos[1], glace])
    o += _pirulito(3.2, -P / 2 - 1.1, 1.1, [confeitos[3], glace, tel])
    o += poe(degraus(1.8, PL, 1, cor=glace), 0, -P / 2 - 0.25, 0)
    o += chamine(1.9, 1.6, zt, ti["zc"] + 1.0, parede, glace, 0.95, 0.95)
    it.add(o)
    it.colisao([((0, 0, 0), (L + 0.6, P + 0.6, zt)), ((0, 0, zt), (L + 1.3, P + 1.3, 4.5)),
                ((0, -P / 2 - 0.9, 0), (7.6, 1.2, 2.2))])
    return dict(andares=1)


# =====================================================================================================================
# Casa-cogumelo e casa-abóbora
# =====================================================================================================================
def _perfil_ponto(pf, s):
    """Ponto e normal (r, z, nr, nz) a uma fração s (0..1) do comprimento de um perfil de torno."""
    seg = [(V(a), V(b)) for a, b in zip(pf, pf[1:])]
    Ls = [(b - a).length for a, b in seg]
    alvo = s * sum(Ls)
    for (a, b), L in zip(seg, Ls):
        if alvo <= L or (a, b) == seg[-1]:
            p = a + (b - a) * min(1.0, alvo / L)
            t = (b - a).normalized()
            return p.x, p.y, t.y, -t.x
        alvo -= L


def casa_cogumelo(it, chapeu="vermelho", pintas="branco", caule="creme_claro", lamela="creme", jan="madeira_mel",
                  porta_cor="madeira", grama="grama"):
    """Casa-cogumelo de dois andares: caule bojudo com porta em arco e janelas redondas, chapéu com pintas e lamelas,
    chaminé torta saindo do chapéu."""
    o = [mb.extrudado(blob_contorno(5.4, 28, 0.08, 5), 0.18, cor=grama, bisel=0.08, seg=2)]
    pc = [(0.0, 0.1), (3.05, 0.1), (3.15, 0.35), (3.0, 1.6), (2.8, 3.6), (2.68, 5.6), (2.8, 6.8), (0.0, 6.8)]
    o.append(mb.torno(pc, cor=caule, seg=32, angulo=50))
    # chapéu (lamelas por baixo, cor própria)
    pch = [(2.5, 6.6), (3.5, 6.35), (4.5, 6.05), (5.3, 5.85), (5.6, 6.05), (5.6, 6.5), (5.3, 7.35), (4.7, 8.35),
           (3.8, 9.25), (2.6, 9.9), (1.3, 10.25), (0.0, 10.35)]
    cap = mb.torno(pch, cor=chapeu, seg=36, angulo=50)
    mb.pinta_onde(cap, lamela, lambda c, n: n.z < -0.35)
    o.append(cap)
    # pintas
    rnd = random.Random(11)
    dome = pch[5:]
    for k in range(9):
        s = 0.1 + 0.75 * (k % 4) / 3 + rnd.uniform(-0.05, 0.05)
        th = RAD(k * 137.5 + 20)
        r_, z_, nr, nz = _perfil_ponto(dome, min(0.92, s))
        rr = 0.55 + 0.25 * rnd.random()
        sp = mb.esfera(rr, cor=pintas, esc=(1, 1, 0.28), seg=12)
        n = V((nr * math.cos(th), nr * math.sin(th), nz)).normalized()
        q = V((0, 0, 1)).rotation_difference(n)
        sp.data.transform(Matrix.Translation(V((r_ * math.cos(th), r_ * math.sin(th), z_)) - n * 0.04) @
                          q.to_matrix().to_4x4())
        o.append(sp)
    # porta em arco e degrau de pedra
    o += poe(porta(1.3, 2.4, porta_cor, jan), 0, -3.02, 0.18)
    o.append(cil(0.95, 0.12, x=0, y=-3.55, z=0.1, cor="cinza_claro", seg=14, bisel=0.04))
    for k, (x, y) in enumerate(((0.3, -4.5), (-0.2, -5.25), (0.25, -5.95))):
        o.append(cil(0.42, 0.08, x=x, y=y, z=0.0, cor="cinza_claro", seg=10, bisel=0.03))
    # janelas redondas no caule (dois andares)
    for ang_, z, w in ((-55, 1.2, 0.95), (55, 1.2, 0.95), (125, 1.2, 0.95), (-125, 1.2, 0.95),
                       (-28, 3.75, 0.85), (30, 3.75, 0.85), (150, 3.75, 0.85), (-100, 3.75, 0.85), (90, 3.75, 0.85)):
        t = RAD(ang_ - 90)
        rz = 3.0 if z < 3 else 2.78
        jn = janela("redonda", w=w, cor=jan, f=0.13, prof=0.14)
        poe(jn, rz * math.cos(t), rz * math.sin(t), z, ang_)
        o += jn
    o += poe(lampiao(), 1.25, -2.95, 2.3, 0)
    # chaminé torta
    o.append(mb.tubo([(2.8, 1.9, 8.0), (3.0, 2.05, 9.0), (2.8, 2.2, 9.8), (3.15, 2.3, 10.5)], 0.3, cor="cinza_claro",
                     seg=10, raio_curva=0.4))
    o.append(cil(0.42, 0.3, x=3.15, y=2.3, z=10.4, cor="cinza", seg=12, bisel=0.05))
    it.add(o)
    it.colisao([((0, 0, 0), (6.2, 6.2, 6.8)), ((0, 0, 5.8), (11.2, 11.2, 4.6))])
    return dict(andares=2)


def casa_abobora(it, casca="laranja", talo="verde_escuro", folha="folha", porta_cor="madeira_mel", jan="verde_escuro",
                 alpendre="madeira", tel_alp="verde"):
    """Casa-abóbora: abóbora gigante com gomos, talo torto como chaminé, folhas e gavinha, alpendre de madeira na porta e
    janelas redondas nos dois andares."""
    R, Hb = 5.2, 6.9
    pad = mb.extrudado(blob_contorno(5.9, 28, 0.06, 9), 0.15, cor="grama", bisel=0.07, seg=2)
    o = []
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=40, v_segments=18, radius=1.0)
    for v in bm.verts:
        th = math.atan2(v.co.y, v.co.x)
        gomo = 1.0 - 0.085 * math.sin(5 * th) ** 2
        rxy = math.hypot(v.co.x, v.co.y)
        z = v.co.z
        dent = 0.22 * max(0.0, 1 - rxy * 1.6) ** 2
        v.co.x *= R * gomo
        v.co.y *= R * gomo
        v.co.z = Hb / 2 + z * Hb / 2 - (dent * Hb if z > 0 else -dent * Hb * 0.5)
        if v.co.z < 0.12:
            v.co.z = 0.12
    ab = mb._obj("abobora", bm, casca, liso=True, angulo=80)
    o.append(ab)

    def sup(th, z):
        """Ponto e normal aproximada na casca, no ângulo th (graus, 0 = frente −Y) e altura z."""
        zz = (z - Hb / 2) / (Hb / 2)
        rxy = math.sqrt(max(0.0, 1 - zz * zz))
        t = RAD(th - 90)
        g = 1.0 - 0.085 * math.sin(5 * t) ** 2
        p = V((R * g * rxy * math.cos(t), R * g * rxy * math.sin(t), z))
        n = V((rxy * math.cos(t) / R, rxy * math.sin(t) / R, zz / (Hb / 2))).normalized()
        return p, n

    for th, z, w in ((-54, 3.3, 1.0), (54, 3.3, 1.0), (126, 3.3, 1.0), (-126, 3.3, 1.0), (162, 3.3, 1.0),
                     (-90, 3.3, 1.0), (90, 3.3, 1.0), (-18, 5.2, 0.8), (18, 5.2, 0.8), (-162, 5.2, 0.8)):
        p, n = sup(th, z)
        jn = janela("redonda", w=w, cor=jan, f=0.13, prof=0.13)
        poe_normal(jn, p + n * 0.02, n)
        o += jn
    # alpendre com a porta
    yf = -R + 0.05
    o.append(mb.caixa(2.6, 2.6, 3.0, y=yf + 0.3, z=0.12, cor=alpendre, bisel=0.08, seg=2))
    for k in range(4):
        o.append(mb.caixa(2.64, 2.5, 0.06, y=yf + 0.33, z=0.6 + k * 0.62, cor="madeira_escura", bisel=0, liso=False))
    o += poe(porta(1.1, 2.15, porta_cor, "creme_claro"), 0, yf - 1.0, 0.18)
    tl, _ = telhado(2.6, 3.0, 1.5, 3.12, tel_alp, "verde_lima", beiral=0.3, esp=0.16, fileiras=3, cume="y",
                    y=yf + 0.1, oitao=alpendre, oitoes=(True, False))
    o += tl
    o += poe(lampiao(), 0.95, yf - 1.0, 2.25)
    o += poe(degraus(1.6, 0.18, 1, cor="cinza_claro"), 0, yf - 1.0, 0)
    # talo-chaminé, folhas e gavinha
    zt = Hb * 0.86
    o.append(mb.tubo([(0, 0, zt - 0.3), (0.2, 0.1, zt + 1.0), (0.7, 0.2, zt + 1.8), (1.4, 0.3, zt + 2.1)], 0.5,
                     cor=talo, seg=12, raio_curva=0.7))
    o.append(cil(0.55, 0.3, x=1.45, y=0.3, z=zt + 1.85, cor="verde_floresta", seg=12, bisel=0.06, eixo="z"))
    for ang_, sx in ((30, 1), (200, -1)):
        lf = mb.superelipsoide(3.2, 1.8, 0.35, cor=folha, e=0.55, e_v=0.5, nu=20, nv=8)
        mb.transforma(lf, loc=(1.6, 0, 0))
        mb.transforma(lf, rot=[("Z", ang_), ("Y", -12 * sx)])
        mb.transforma(lf, loc=(0, 0, zt + 0.15))
        o.append(lf)
    pts = [(math.cos(t * 0.9) * (0.6 + t * 0.12) - 1.2, math.sin(t * 0.9) * (0.6 + t * 0.12) + 0.4,
            zt + 0.4 + t * 0.12) for t in [k * 0.5 for k in range(14)]]
    o.append(mb.tubo(pts, 0.07, cor="folha_clara", seg=6, raio_curva=0))
    dy = 0.75  # a abóbora e o alpendre recuam para o alpendre caber no lote
    for g in _lista(o):
        mb.transforma(g, loc=(0, dy, 0))
    it.add(pad, o)
    it.colisao([((0, dy, 0), (2 * R, 2 * R, Hb)), ((0, yf - 0.4 + dy, 0), (2.8, 2.0, 3.4))])
    return dict(andares=2)


# =====================================================================================================================
# Casinhas
# =====================================================================================================================
def _abobada(L, P, alt, z0, cor, aro, faixas=7, beiral=0.45, esp=0.24, ab=None):
    """Telhado em abóbada (meia-cana) de tábuas ao longo de X, com aros grossos nas pontas. Devolve (objs, R, yc)."""
    w = P / 2 + beiral
    R = (w * w + alt * alt) / (2 * alt)
    zc = z0 + alt - R
    a0 = math.asin(min(1.0, w / R))
    objs = []
    Lt = L + 2 * (ab if ab is not None else beiral * 0.6)
    for k in range(faixas):
        t0 = -a0 + 2 * a0 * k / faixas
        t1 = -a0 + 2 * a0 * (k + 1) / faixas
        tm = (t0 + t1) / 2
        lw = 2 * R * math.sin((t1 - t0) / 2) * 1.08
        t = mb.caixa(Lt, lw, esp, cor=cor, bisel=0.06, seg=1)
        mb.transforma(t, rot=("X", -math.degrees(tm)))
        mb.transforma(t, loc=(0, R * math.sin(tm) * 1.0, zc + R * math.cos(tm) - 0.02))
        objs.append(t)
    # aros nas pontas (anel em arco no plano yz)
    n = 18
    ext = [((R + esp + 0.12) * math.sin(-a0 + 2 * a0 * k / n), (R + esp + 0.12) * math.cos(-a0 + 2 * a0 * k / n))
           for k in range(n + 1)]
    inn = [((R - 0.18) * math.sin(-a0 + 2 * a0 * k / n), (R - 0.18) * math.cos(-a0 + 2 * a0 * k / n))
           for k in range(n + 1)]
    for sx in (-1, 1):
        bm = bmesh.new()
        e0 = [bm.verts.new((sx * Lt / 2 - 0.2, u, zc + v)) for u, v in ext]
        e1 = [bm.verts.new((sx * Lt / 2 + 0.2, u, zc + v)) for u, v in ext]
        i0 = [bm.verts.new((sx * Lt / 2 - 0.2, u, zc + v)) for u, v in inn]
        i1 = [bm.verts.new((sx * Lt / 2 + 0.2, u, zc + v)) for u, v in inn]
        for k in range(n):
            bm.faces.new((e0[k], e0[k + 1], e1[k + 1], e1[k]))
            bm.faces.new((i0[k + 1], i0[k], i1[k], i1[k + 1]))
            bm.faces.new((e0[k + 1], e0[k], i0[k], i0[k + 1]))
            bm.faces.new((e1[k], e1[k + 1], i1[k + 1], i1[k]))
        for a_, b_ in ((0, 0), (n, n)):
            bm.faces.new((e0[a_], i0[a_], i1[a_], e1[a_]))
        mb._bevel(bm, 0.05, 1, [e for e in bm.edges if len(e.link_faces) == 2 and
                                 e.link_faces[0].normal.dot(e.link_faces[1].normal) < 0.5])
        objs.append(mb._obj("aro", bm, aro, liso=True, angulo=40))
    return objs, R, zc, a0


def _tampa_abobada(L, R, zc, z0, cor, P):
    """Fecha o vão entre o topo da parede e a abóbada nas duas pontas (segmento de círculo)."""
    objs = []
    w = P / 2
    if zc + R <= z0:
        return objs
    a = math.acos(max(-1.0, min(1.0, (z0 - zc) / R)))
    a = min(a, math.asin(min(1.0, w / R)) if R > w else a)
    pts = [(R * math.sin(-a + 2 * a * k / 14), zc + R * math.cos(-a + 2 * a * k / 14) - z0) for k in range(15)]
    pts = [(pts[0][0], -0.02)] + pts + [(pts[-1][0], -0.02)]
    for sx in (-1, 1):
        x0 = (L / 2 - 0.3) if sx > 0 else -L / 2 + 0.005
        objs.append(mb.extrudado(mb._ccw(pts), 0.295, x=x0, y=0, z=z0, cor=cor, bisel=0.0, plano="yz", liso=False))
    return objs


def casinha_arredondada(it, parede="rosa_bebe", tel="salmao", aro="vermelho_claro", jan="vermelho_claro",
                        porta_cor="vermelho_claro", base="rosa"):
    """Casinha de um cômodo, toda boleada, com telhado em abóbada de tábuas e aros grossos."""
    L, P = 6.4, 5.4
    Hp = 3.3
    o = [mb.extrudado(mb.ret_arredondado(L + 0.5, P + 0.5, 1.1, 5), 0.32, cor=base, bisel=0.12, seg=2),
         mb.extrudado(mb.ret_arredondado(L, P, 0.9, 5), Hp, z=0.3, cor=parede, bisel=0.16, seg=2)]
    z0 = 0.3 + Hp
    tl, R, zc, a0 = _abobada(L, P, 1.9, z0 - 0.05, tel, aro, faixas=7, beiral=0.55)
    o += tl
    o += _tampa_abobada(L - 0.3, R, zc, z0 - 0.1, parede, P)
    o += poe(porta(1.15, 2.2, porta_cor, aro), 1.3, -P / 2, 0.3)
    o += poe(degraus(1.6, 0.3, 1, cor=base), 1.3, -P / 2 - 0.15, 0)
    jn = janela("arco", w=1.1, h=1.45, cor=jan, floreira="branco")
    o += poe(jn, -1.3, -P / 2, 1.3)
    o += poe(lampiao(), 0.2, -P / 2, 2.3)
    fachada_janelas(o, "d", L, P, [0], 1.2, forma="redonda", w=1.0, cor=jan)
    fachada_janelas(o, "e", L, P, [0], 1.2, forma="redonda", w=1.0, cor=jan)
    fachada_janelas(o, "t", L, P, [-1.2, 1.2], 1.3, forma="arco", w=0.95, h=1.3, cor=jan)
    # janelinha redonda nas pontas da abóbada
    for sx in (-1, 1):
        jr = janela("redonda", w=0.6, cor=aro, f=0.1)
        poe(jr, sx * (L / 2 - 0.15), 0, z0 + 0.15, 90 * sx)
        o += jr
    it.add(o)
    it.colisao([((0, 0, 0), (L + 0.5, P + 0.5, z0)), ((0, 0, z0), (L + 1.0, P + 1.2, 2.2))])
    return dict(andares=1)


def casa_sobrado_redondo(it, parede="pessego", aro="laranja", tel="laranja_claro", jan="turquesa",
                         porta_cor="azul_celeste"):
    """Sobradinho boleado de dois andares com aros grossos entre os andares e terraço com meia-abóbada e guarda-corpo."""
    L, P = 6.6, 5.8
    h1 = AND
    o = [mb.extrudado(mb.ret_arredondado(L + 0.6, P + 0.6, 1.4, 5), 0.32, cor=aro, bisel=0.12, seg=2)]
    z = 0.3
    for k in range(2):
        o.append(mb.extrudado(mb.ret_arredondado(L, P, 1.2, 5), h1, z=z, cor=parede, bisel=0.14, seg=2))
        o.append(mb.extrudado(mb.ret_arredondado(L + 0.55, P + 0.55, 1.45, 5), 0.38, z=z + h1 - 0.12, cor=aro,
                              bisel=0.15, seg=2))
        zj = z + 0.9
        fachada_janelas(o, "f", L, P, [-1.6] if k == 0 else [-1.5, 1.5], zj, forma="arco", w=0.95, h=1.4, cor=jan)
        fachada_janelas(o, "d", L, P, [0], zj, forma="arco", w=0.95, h=1.4, cor=jan)
        fachada_janelas(o, "e", L, P, [0], zj, forma="arco", w=0.95, h=1.4, cor=jan)
        fachada_janelas(o, "t", L, P, [-1.4, 1.4], zj, forma="arco", w=0.95, h=1.4, cor=jan)
        z += h1 + 0.2
    ztop = z - 0.2 + 0.26
    # terraço: meia abóbada cobrindo o fundo, guarda-corpo na frente
    tl, R, zc, a0 = _abobada(L - 0.4, 3.2, 1.5, ztop + 1.9, tel, aro, faixas=5, beiral=0.4, esp=0.22, ab=0.2)
    for g in tl:
        mb.transforma(g, loc=(0, 1.2, 0))
    o += tl
    for sx in (-1, 1):
        o.append(mb.caixa(0.35, 0.35, 1.9, x=sx * (L / 2 - 0.6), y=0.0, z=ztop, cor=aro, bisel=0.1, seg=1))
    o.append(mb.caixa(L - 0.6, 0.3, 1.9, y=P / 2 - 0.5, z=ztop, cor=parede, bisel=0.1, seg=1))
    o.append(mb.caixa(L - 0.6, 3.2, 0.3, y=1.2, z=ztop + 1.75, cor=parede, bisel=0.08, seg=1))
    pts = mb.ret_arredondado(L - 0.7, P - 0.7, 1.0, 4)
    frente = [(x, y, ztop + 1.0) for x, y in pts if y < -0.2]
    frente.sort(key=lambda p: p[0])
    o.append(mb.tubo(frente, 0.08, cor="branco", seg=8, raio_curva=0.3))
    for x, y, _ in frente[::2]:
        o.append(cil(0.05, 1.0, x=x, y=y, z=ztop, cor="branco", seg=6, bisel=0))
    o.append(cil(0.5, 0.06, x=-0.8, y=-0.9, z=ztop + 0.75, cor="branco", seg=14, bisel=0.02))
    o.append(cil(0.06, 0.75, x=-0.8, y=-0.9, z=ztop, cor="branco", seg=6, bisel=0))
    o.append(mb.superelipsoide(0.9, 0.9, 0.5, x=0.9, y=-0.7, z=ztop, cor="rosa", e=0.4))
    o += poe(porta(1.2, 2.3, porta_cor, jan), 1.4, -P / 2, 0.3)
    o += poe(degraus(1.7, 0.3, 1, cor=aro), 1.4, -P / 2 - 0.2, 0)
    o += poe(lampiao(), 0.35, -P / 2, 2.4)
    it.add(o)
    it.colisao([((0, 0, 0), (L + 0.6, P + 0.6, ztop)), ((0, 1.2, ztop), (L, 3.6, 3.5))])
    return dict(andares=2)


def casinha_cupula(it, parede="azul_celeste", tel="lilas", tel_borda="lilas_claro", jan="roxo", persiana="rosa",
                   base="lilas_claro", porta_cor="roxo"):
    """Casinha térrea com telhado de quatro águas e uma cúpula na frente com janela de meia-lua."""
    L, P, PL = 8.0, 6.0, 0.4
    Hp = 3.3
    zt = PL + Hp
    o = [mb.caixa(L + 0.4, P + 0.4, PL, cor=base, bisel=0.1, seg=2),
         mb.caixa(L, P, Hp, z=PL, cor=parede, bisel=0.07, seg=2),
         mb.caixa(L + 0.2, P + 0.2, 0.24, z=zt - 0.22, cor="branco", bisel=0.06, seg=1)]
    o += telhado_4aguas(L, P, 2.5, zt, tel, tel_borda, beiral=0.55)
    # cúpula
    cy = -P / 2 + 1.3
    o.append(cil(1.65, 1.6, x=0, y=cy, z=zt - 0.2, cor=parede, seg=28, bisel=0.05))
    o.append(cil(1.8, 0.22, x=0, y=cy, z=zt + 1.35, cor="branco", seg=28, bisel=0.06))
    o.append(mb.torno([(1.78, 0.0), (1.7, 0.6), (1.4, 1.2), (0.9, 1.6), (0.0, 1.78)], x=0, y=cy, z=zt + 1.55,
                      cor=tel, seg=28, angulo=60))
    o.append(mb.esfera(0.2, x=0, y=cy, z=zt + 3.4, cor="ouro", seg=10))
    o.append(cil(0.06, 0.4, x=0, y=cy, z=zt + 3.2, cor="ouro", seg=6, bisel=0))
    jm = janela("arco", w=1.6, h=0.86, cor="branco", f=0.12, n=10, peitoril=False)
    o += poe(jm, 0, cy - 1.62, zt + 0.25)
    kj = dict(forma="ret", w=0.8, h=1.25, cor="branco", persiana=persiana)
    fachada_janelas(o, "f", L, P, [-2.6, 2.6], PL + 0.9, **kj)
    fachada_janelas(o, "d", L, P, [-1.2, 1.2], PL + 0.9, **kj)
    fachada_janelas(o, "e", L, P, [0], PL + 0.9, **kj)
    fachada_janelas(o, "t", L, P, [-2.2, 0.6], PL + 0.9, **kj)
    o += poe(porta(1.2, 2.3, porta_cor, "branco", forma="arco"), 0, -P / 2, PL)
    o += poe(degraus(2.0, PL, 2, cor="branco"), 0, -P / 2 - 0.2, 0)
    for sx in (-1, 1):
        o += poe(lampiao(), sx * 1.05, -P / 2, PL + 2.2)
    o += chamine(2.4, 1.0, zt, zt + 3.0, "tijolo", "cinza_claro", 0.8, 0.8)
    it.add(o)
    it.colisao([((0, 0, 0), (L + 0.4, P + 0.4, zt)), ((0, 0, zt), (L + 1.1, P + 1.1, 2.8)),
                ((0, cy, zt), (3.6, 3.6, 3.6))])
    return dict(andares=1)


def casinha_chamine_azul(it, terreo="amarelo_claro", tel="azul", tel_borda="azul_claro", jan="azul_medio",
                         base="cinza_claro", porta_cor="madeira_mel"):
    """Casinha térrea com sótão: telhado azul íngreme, água-furtada na frente, chaminé branca."""
    L, P, PL = 6.4, 6.0, 0.4
    Hp = 3.2
    zt = PL + Hp
    o = [mb.caixa(L + 0.4, P + 0.4, PL, cor=base, bisel=0.1, seg=2),
         mb.caixa(L, P, Hp, z=PL, cor=terreo, bisel=0.06, seg=2),
         mb.caixa(L + 0.2, P + 0.2, 0.22, z=zt - 0.2, cor="madeira", bisel=0.05, seg=1)]
    for sx in (-1, 1):
        for sy in (-1, 1):
            o.append(mb.caixa(0.32, 0.32, Hp, x=sx * (L / 2 - 0.1), y=sy * (P / 2 - 0.1), z=PL, cor="madeira",
                              bisel=0.05, seg=1))
    tl, ti = telhado(L, P, 4.2, zt, tel, tel_borda, beiral=0.55, esp=0.22, fileiras=5, oitao=terreo)
    o += tl
    lc = lucarna(1.9, 1.5, terreo, tel, tel_borda, jan, forma="ret")
    poe(lc, 0.3, -P / 2 + 0.9, ti["z"](P / 2 - 0.9) - 0.05)
    o += lc
    kj = dict(forma="ret", w=0.85, h=1.2, cor=jan)
    fachada_janelas(o, "f", L, P, [1.7], PL + 0.95, **kj)
    fachada_janelas(o, "d", L, P, [-1.3, 1.3], PL + 0.95, **kj)
    fachada_janelas(o, "e", L, P, [0], PL + 0.95, **kj)
    fachada_janelas(o, "t", L, P, [-1.4, 1.4], PL + 0.95, **kj)
    for sx in (-1, 1):
        jr = janela("redonda", w=0.75, cor=jan, f=0.11)
        o += poe(jr, sx * L / 2, 0, zt + 0.8, 90 * sx)
    o += poe(porta(1.15, 2.25, porta_cor, jan, forma="ret"), -1.2, -P / 2, PL)
    o += poe(degraus(1.6, PL, 2, cor=base), -1.2, -P / 2 - 0.15, 0)
    o += poe(lampiao(), -0.2, -P / 2, PL + 2.2)
    o += chamine(1.8, 1.5, zt, ti["zc"] + 1.4, "branco", "cinza", 0.85, 0.85)
    it.add(o)
    entorta(it, kx=0.15, giro=-3.0)
    it.colisao([((0, 0, 0), (L + 0.4, P + 0.4, zt)), ((0, 0, zt), (L + 1.1, P + 1.1, 4.4))])
    return dict(andares=1)


def casinha_telhado_vermelho(it, parede="creme_claro", tel="vermelho", tel_borda="vermelho_claro", jan="branco",
                             base="cinza", porta_cor="madeira_media"):
    """Casa térrea com fileira de janelas em arco e telhadão vermelho com duas empenas na frente (janelas redondas)."""
    L, P, PL = 9.0, 7.0, 0.5
    Hp = 3.3
    zt = PL + Hp
    o = [mb.caixa(L + 0.4, P + 0.4, PL, cor=base, bisel=0.1, seg=2),
         mb.caixa(L, P, Hp, z=PL, cor=parede, bisel=0.07, seg=2),
         mb.caixa(L + 0.22, P + 0.22, 0.22, z=zt - 0.2, cor=tel_borda, bisel=0.06, seg=1)]
    for u in (-L / 2 + 0.15, -1.45, 1.45, L / 2 - 0.15):
        o.append(mb.caixa(0.34, 0.2, Hp, x=u, y=-P / 2 - 0.04, z=PL, cor="branco", bisel=0.05, seg=1))
    tl, ti = telhado(L, P, 4.0, zt, tel, tel_borda, beiral=0.6, esp=0.24, fileiras=5, oitao=parede)
    o += tl
    for x in (-2.3, 2.3):
        tw, _ = telhado(3.0, P / 2, 3.9, zt, tel, tel_borda, beiral=0.5, esp=0.22, fileiras=4, cume="y",
                        x=x, y=-P / 4, oitao=parede, oitoes=(True, False))
        o += tw
        jr = janela("redonda", w=0.95, cor=jan, f=0.14)
        o += poe(jr, x, -P / 2 + 0.005, zt + 0.7)
    kj = dict(forma="arco", w=0.85, h=1.6, cor=jan)
    fachada_janelas(o, "f", L, P, [-3.3, -2.3 + 0.0, 2.3, 3.3], PL + 0.8, **kj)
    fachada_janelas(o, "d", L, P, [-1.8, 0, 1.8], PL + 0.8, **kj)
    fachada_janelas(o, "e", L, P, [-1.8, 0, 1.8], PL + 0.8, **kj)
    fachada_janelas(o, "t", L, P, [-3.0, -1.0, 1.0, 3.0], PL + 0.8, **kj)
    o += poe(porta(1.3, 2.4, porta_cor, jan), 0, -P / 2, PL)
    o += poe(degraus(2.1, PL, 2, cor="cinza_claro"), 0, -P / 2 - 0.2, 0)
    o += poe(lampiao(), 0.0, -P / 2, PL + 3.0)
    o += chamine(-2.8, 1.6, zt, ti["zc"] + 1.1, "tijolo", "cinza_claro")
    it.add(o)
    it.colisao([((0, 0, 0), (L + 0.4, P + 0.4, zt)), ((0, 0, zt), (L + 1.2, P + 1.2, 4.3))])
    return dict(andares=1)


def casa_estreita_enxaimel(it, parede="lilas_claro", viga="roxo", tel="laranja", tel_borda="laranja_claro",
                           jan="branco", base="cinza", porta_cor="madeira_media"):
    """Casa estreita e alta de dois andares e sótão, com a empena para a rua, enxaimel colorido e chaminé."""
    L, P, PL = 5.6, 8.2, 0.45
    Hc = 2 * AND
    zt = PL + Hc
    o = [mb.caixa(L + 0.4, P + 0.4, PL, cor=base, bisel=0.1, seg=2),
         mb.caixa(L, P, Hc, z=PL, cor=parede, bisel=0.06, seg=2)]
    # enxaimel: esteios, frechais e mãos-francesas
    for sx in (-1, 1):
        for sy in (-1, 1):
            o.append(mb.caixa(0.3, 0.3, Hc, x=sx * (L / 2 - 0.1), y=sy * (P / 2 - 0.1), z=PL, cor=viga, bisel=0.05,
                              seg=1))
    for zz in (PL + AND - 0.12, zt - 0.2):
        o.append(mb.caixa(L + 0.12, P + 0.12, 0.24, z=zz, cor=viga, bisel=0.05, seg=1))
    for z0, us in ((PL + 0.25, (0.1,)), (PL + AND + 0.25, (-2.0, 2.0))):
        for u in us:
            for s in (-1, 1):
                b = mb.caixa(0.16, 0.08, 1.7, cor=viga, bisel=0.03, seg=1)
                mb.transforma(b, loc=(0, 0, -0.85))
                mb.transforma(b, rot=("Y", s * 30))
                mb.transforma(b, loc=(u, -P / 2 - 0.03, z0 + 1.3))
                o.append(b)
    tl, ti = telhado(L, P, 4.6, zt, tel, tel_borda, beiral=0.55, esp=0.22, fileiras=5, cume="y", oitao=parede)
    o += tl
    for zz in (zt + 0.9,):
        jn = janela("arco", w=0.85, h=1.3, cor=jan)
        o += poe(jn, 0, -P / 2 - 0.0, zz)
    kj = dict(forma="ret", w=0.75, h=1.2, cor=jan, persiana=tel_borda)
    for k in range(2):
        z = PL + k * AND + 0.85
        if k == 1:
            fachada_janelas(o, "f", L, P, [-0.85, 0.85], z, forma="ret", w=0.7, h=1.2, cor=jan)
        else:
            fachada_janelas(o, "f", L, P, [1.4], z, forma="ret", w=0.75, h=1.2, cor=jan)
        fachada_janelas(o, "d", L, P, [-2.5, 0, 2.5], z, **kj)
        fachada_janelas(o, "e", L, P, [-2.5, 0, 2.5], z, **kj)
        fachada_janelas(o, "t", L, P, [0], z, **kj)
    o += poe(porta(1.1, 2.3, porta_cor, jan, forma="ret"), -1.2, -P / 2, PL)
    o += poe(degraus(1.6, PL, 2, cor="cinza_claro"), -1.2, -P / 2 - 0.15, 0)
    toldo = mb.caixa(1.6, 0.8, 0.12, cor=tel, bisel=0.04, seg=1)
    mb.transforma(toldo, loc=(0, -0.4, 0))
    mb.transforma(toldo, rot=("X", -22))
    mb.transforma(toldo, loc=(-1.2, -P / 2, PL + 2.75))
    o.append(toldo)
    o += poe(lampiao(), -0.3, -P / 2, PL + 2.2)
    o += chamine(1.3, 2.2, zt, ti["zc"] + 1.0, "cinza_claro", "cinza")
    it.add(o)
    entorta(it, kx=0.32, ky=-0.1, giro=2.0)
    it.colisao([((0, 0, 0), (L + 0.4, P + 0.4, zt)), ((0, 0, zt), (L + 1.1, P + 1.1, 4.8))])
    return dict(andares=2)


# =====================================================================================================================
# Marcos
# =====================================================================================================================
def _cristal(r, h, ponta, cores, x=0.0, y=0.0, z=0.0, incl=(0.0, 0.0), giro=0.0, fenda=False, nome="cristal"):
    """Cristal hexagonal facetado (prisma afinando um pouco, ponta em pirâmide), faces alternando as cores da lista.
    fenda=True: duas faces da parte de baixo viram frestas de luz roxa (brilho_roxo), que brilham só à noite."""
    bm = bmesh.new()
    n = 6
    b = [bm.verts.new((r * math.cos(2 * math.pi * k / n), r * math.sin(2 * math.pi * k / n), -0.6)) for k in range(n)]
    m = [bm.verts.new((r * 1.02 * math.cos(2 * math.pi * k / n), r * 1.02 * math.sin(2 * math.pi * k / n), h * 0.45))
         for k in range(n)]
    t = [bm.verts.new((r * 0.86 * math.cos(2 * math.pi * k / n), r * 0.86 * math.sin(2 * math.pi * k / n), h))
         for k in range(n)]
    pt = bm.verts.new((r * 0.05, 0, h + ponta))
    for k in range(n):
        j = (k + 1) % n
        bm.faces.new((b[k], b[j], m[j], m[k]))
        bm.faces.new((m[k], m[j], t[j], t[k]))
        bm.faces.new((t[k], t[j], pt))
    bm.faces.new(b[::-1])
    ob = mb._obj(nome, bm, cores[0], liso=False)
    for p in ob.data.polygons:
        ang = math.atan2(p.center.y, p.center.x)
        k = int(((ang + math.pi) / (2 * math.pi)) * n + 0.5) % n
        topo = p.center.z > h * 0.99
        c = cores[(k + (1 if topo else 0)) % len(cores)]
        mb.pinta(ob, c, [p.index])
    if fenda:
        alvo = [p.index for p in ob.data.polygons if h * 0.05 < p.center.z < h * 0.45 and
                abs(math.atan2(p.center.y, p.center.x) + math.pi / 2) < 1.2]
        mb.pinta(ob, None, alvo[:1], mat="brilho_roxo")
    M = Matrix.Translation((x, y, z)) @ Matrix.Rotation(RAD(giro), 4, "Z") @ \
        Matrix.Rotation(RAD(incl[0]), 4, "X") @ Matrix.Rotation(RAD(incl[1]), 4, "Y")
    ob.data.transform(M)
    return ob


def cristais_roxos(it):
    """Aglomerado de cristais roxos gigantes sobre uma gruta de pedra com porta, janelinhas e placa: uma loja de
    cristais. Fendas e lascas de luz roxa brilham por dentro à noite (brilho_roxo: de dia são só cristais lilás)."""
    o = [mb.extrudado(blob_contorno(5.9, 30, 0.08, 21), 0.2, cor="terra_seca", bisel=0.08, seg=2)]
    # gruta (cúpula de pedra) com pedras em volta
    pg = [(0.0, 0.15), (4.7, 0.15), (4.85, 0.6), (4.6, 1.6), (4.0, 2.7), (3.0, 3.5), (1.6, 3.95), (0.0, 4.1)]
    o.append(mb.torno(pg, cor="marrom_claro", seg=28, angulo=50))
    rnd = random.Random(7)
    for k in range(9):
        t = 2 * math.pi * k / 9 + 0.3
        if abs(math.degrees(t) % 360 - 270) < 28:
            continue
        rr = 4.6 + rnd.uniform(-0.2, 0.3)
        s = rnd.uniform(1.3, 2.1)
        pd = mb.superelipsoide(s * 1.4, s, s * 0.9, x=rr * math.cos(t), y=rr * math.sin(t), z=0.05,
                               cor=["caramelo", "terracota", "marrom_claro"][k % 3], e=0.6, e_v=0.6, nu=12, nv=6)
        mb.transforma(pd, loc=(-rr * math.cos(t), -rr * math.sin(t), 0))
        mb.transforma(pd, rot=("Z", math.degrees(t)))
        mb.transforma(pd, loc=(rr * math.cos(t), rr * math.sin(t), 0))
        o.append(pd)
    # cristais
    roxos = ["roxo", "violeta", "lilas", "roxo_escuro"]
    azuis = ["azul_medio", "roxo", "lilas", "azul_escuro"]
    o.append(_cristal(2.0, 14.0, 4.2, roxos, x=0.3, y=0.7, z=2.5, incl=(0, 3), giro=8, fenda=True))
    o.append(_cristal(1.55, 10.5, 3.2, azuis, x=-1.7, y=1.6, z=2.6, incl=(-8, -15), giro=25, fenda=True))
    o.append(_cristal(1.4, 9.0, 2.8, roxos, x=2.2, y=1.4, z=2.5, incl=(-6, 17), giro=-12))
    o.append(_cristal(1.1, 7.0, 2.3, ["lilas", "violeta", "roxo"], x=-2.1, y=-0.6, z=2.3, incl=(14, -26), giro=40,
                      fenda=True))
    o.append(_cristal(1.05, 6.2, 2.1, azuis, x=2.4, y=-0.5, z=2.1, incl=(16, 24), giro=-30, fenda=True))
    o.append(_cristal(0.95, 5.2, 1.9, roxos, x=-0.4, y=3.1, z=1.5, incl=(-26, 4), giro=10))
    o.append(_cristal(0.75, 4.0, 1.6, ["violeta", "lilas", "roxo_escuro"], x=0.9, y=-1.5, z=3.0, incl=(24, 6),
                      giro=70))
    o.append(_cristal(0.85, 4.6, 1.7, azuis, x=-1.0, y=-1.2, z=3.0, incl=(20, -14), giro=-50))
    for k, (x, y, s, ang_) in enumerate(((4.5, 2.4, 1.0, 0), (-4.3, 2.8, 0.9, 50), (4.8, -1.8, 0.8, 120),
                                         (-4.8, -2.0, 0.85, -30), (2.4, 4.4, 0.7, 90))):
        o.append(_cristal(0.45 * s, 2.2 * s, 0.9 * s, roxos if k % 2 else azuis, x=x, y=y, z=0.1,
                          incl=(10 * (-1) ** k, 18), giro=ang_))
    # lascas de luz roxa entre as pedras
    for k, (x, y, s) in enumerate(((3.6, -3.5, 0.6), (-3.2, -3.9, 0.55), (5.2, 0.6, 0.5), (-5.2, 0.4, 0.5),
                                   (-1.8, -4.8, 0.4), (2.0, -4.9, 0.42))):
        c = _cristal(0.22 * s / 0.5, 1.0 * s / 0.5, 0.45 * s / 0.5, ["lilas"], x=x, y=y, z=0.1,
                     incl=(14 * (-1) ** k, 10), giro=k * 40)
        mb.pinta(c, None, mat="brilho_roxo")
        o.append(c)
    # porta, janelinhas e placa
    o += poe(porta(1.35, 2.4, "roxo_escuro", "lilas", macaneta="neon_ciano"), 0, -4.72, 0.15)
    o.append(cil(1.0, 0.12, x=0, y=-5.3, z=0.15, cor="cinza_claro", seg=14, bisel=0.04))
    for th, z in ((-42, 1.4), (42, 1.4), (100, 1.4), (-100, 1.4), (160, 1.4), (-160, 1.4)):
        t = RAD(th - 90)
        rr = 4.62
        jn = janela("redonda", w=0.95, cor="lilas", f=0.14, prof=0.14)
        poe(jn, rr * math.cos(t), rr * math.sin(t), z, th, incl=-8)
        o += jn
    png = os.path.join(SAIDA, "predios_magicos", "estampas", "placa_cristais.png")
    pl = [mb.caixa(2.9, 0.14, 1.06, y=0.07, z=-0.08, cor="roxo_escuro", bisel=0.05, seg=1),
          placa_estampa(png, 2.7, 0.9, y=-0.01)]
    poe(pl, 0, -4.35, 2.95, 0, incl=-24)
    o += pl
    o += poe(lampiao(), 1.15, -4.7, 2.1)
    o += poe(lampiao(), -1.15, -4.7, 2.1)
    it.add(o)
    apoia_chao(it)
    it.colisao([((0, 0, 0), (10.0, 10.0, 4.1)), ((0.3, 0.8, 4.1), (6.0, 5.5, 16.0)), ((0, 0, 0), (12.4, 12.4, 0.25))])
    return dict(andares=1)


def castelo_areia(it, areia="laranja_claro", chao="pessego", bandeira_cor="vermelho", jan="branco"):
    """Castelo de areia gigante: torre central em camadas, três torres redondas, muralha com ameias, portão em arco,
    bandeira no topo, conchas e estrelas-do-mar no monte de areia."""
    o = [mb.extrudado(blob_contorno(6.3, 32, 0.08, 31), 0.55, cor=chao, bisel=0.3, seg=3)]
    zb = 0.5
    # torre central em camadas (escorrida)
    pk = [(0.0, zb), (3.4, zb), (3.35, zb + 1.2), (3.1, zb + 1.35), (3.15, zb + 3.6), (2.95, zb + 4.8),
          (2.55, zb + 5.0), (2.5, zb + 6.6), (2.2, zb + 8.2), (1.8, zb + 8.4), (1.2, zb + 9.9), (0.6, zb + 10.8),
          (0.0, zb + 11.1)]
    o.append(mb.torno(pk, x=0, y=1.0, cor=areia, seg=28, angulo=45))
    o += ameias_circ(3.05, zb + 4.75, 10, areia, w=0.62, h=0.6, esp=0.5, x=0, y=1.0, mureta=0.0)
    o += ameias_circ(2.25, zb + 8.1, 8, areia, w=0.5, h=0.5, esp=0.42, x=0, y=1.0, mureta=0.0)
    o += bandeira(0, 1.0, zb + 10.9, bandeira_cor, alt=2.0, ang=-30)
    # torres
    torres = [(-3.6, -2.4, 1.75, 6.4), (3.6, -2.4, 1.75, 6.8), (3.4, 3.4, 1.6, 6.0), (-3.5, 3.2, 1.4, 5.0)]
    for tx, ty, tr, th in torres:
        pf = [(0.0, zb), (tr * 1.12, zb), (tr * 1.06, zb + 0.9), (tr * 0.96, zb + 1.0), (tr * 0.98, zb + th * 0.55),
              (tr * 0.9, zb + th * 0.62), (tr * 0.88, zb + th), (0.0, zb + th)]
        o.append(mb.torno(pf, x=tx, y=ty, cor=areia, seg=22, angulo=45))
        o += ameias_circ(tr * 0.95, zb + th - 0.05, 7, areia, w=0.55, h=0.55, esp=0.45, x=tx, y=ty, mureta=0.3)
    # muralha
    for (x0, y0, r0, _), (x1, y1, r1, _) in zip(torres, torres[1:] + torres[:1]):
        a, b = V((x0, y0)), V((x1, y1))
        L = (b - a).length
        ang = math.degrees(math.atan2(y1 - y0, x1 - x0))
        mw = mb.caixa(L, 0.9, 3.2, cor=areia, bisel=0.15, seg=2)
        mb.transforma(mw, loc=((a + b).x / 2, (a + b).y / 2, zb), rot=("Z", ang))
        o.append(mw)
        o += ameias_lin(a + (b - a).normalized() * r0, b - (b - a).normalized() * r1, zb + 3.2, areia, w=0.55,
                        h=0.5, esp=0.75, passo=1.1)
    # portão (casinha com ameias na frente)
    o.append(mb.caixa(2.8, 1.2, 3.8, y=-2.9, z=zb, cor=areia, bisel=0.15, seg=2))
    o += ameias_lin((-1.3, -3.3), (1.3, -3.3), zb + 3.8, areia, w=0.5, h=0.5, esp=0.45, passo=0.85)
    o += poe(porta(1.4, 2.4, "madeira_media", "pessego", vigia=True), 0, -3.5, zb)
    # janelinhas (frestas em arco)
    for tx, ty, tr, th in torres:
        for k, ang_ in enumerate((-30, 30)):
            if ty > 0 and ang_ < 0 and tx < 0:
                continue
            a = RAD(ang_ + (0 if ty < 0 else 180) - 90 + (20 if tx > 0 else -20))
            jn = janela("arco", w=0.55, h=1.0, cor=jan, f=0.09, prof=0.1, cruz=False, peitoril=False)
            poe(jn, tx + tr * 0.97 * math.cos(a), ty + tr * 0.97 * math.sin(a), zb + th * 0.62, math.degrees(a) + 90)
            o += jn
    for ang_, z, rr in ((-20, zb + 5.8, 2.5), (25, zb + 5.8, 2.5), (180, zb + 5.8, 2.5), (0, zb + 2.4, 3.15),
                        (-130, zb + 2.4, 3.15), (130, zb + 2.4, 3.15), (5, zb + 8.8, 1.7)):
        a = RAD(ang_ - 90)
        jn = janela("arco", w=0.6, h=1.1, cor=jan, f=0.09, prof=0.1, cruz=False, peitoril=False)
        poe(jn, rr * math.cos(a), 1.0 + rr * math.sin(a), z, ang_)
        o += jn
    # estrelas-do-mar e concha
    estrela = [((0.55 if k % 2 == 0 else 0.22) * math.cos(math.pi * k / 5 + math.pi / 2),
                (0.55 if k % 2 == 0 else 0.22) * math.sin(math.pi * k / 5 + math.pi / 2)) for k in range(10)]
    for x, y, c, ang_ in ((-4.4, -4.6, "rosa", 15), (4.8, -3.9, "vermelho_claro", -20), (-5.3, 1.0, "amarelo", 40)):
        e = mb.extrudado(mb._ccw(estrela), 0.14, cor=c, bisel=0.05, seg=1)
        mb.transforma(e, loc=(x, y, 0.5), rot=("Z", ang_))
        o.append(e)
    for x, y in ((2.6, -5.0),):
        o.append(mb.torno([(0.0, 0.0), (0.5, 0.0), (0.42, 0.2), (0.2, 0.32), (0.0, 0.35)], x=x, y=y, z=0.5,
                          cor="rosa_claro", seg=10, esc=(1.0, 0.8)))
    it.colisao([((0, 0, 0), (12.4, 12.4, 0.55)), ((0, 0, 0.5), (9.0, 7.6, 4.0)), ((0, 1.0, 0.5), (6.4, 6.4, 10.5))])
    it.add(o)
    return dict(andares=3)


def castelo_rosa(it, parede="rosa", torre="rosa_bebe", tel="rosa_escuro", borda="branco", jan="branco",
                 base="rosa_escuro"):
    """Castelo de conto de fadas rosa (2 × 2 quadras): muralha com ameias, quatro torres de canto, portão com duas
    torrinhas, torre de menagem com duas torres altas de telhado cônico e bandeiras."""
    o = [mb.extrudado(mb.ret_arredondado(25.0, 24.0, 2.0, 4), 0.3, cor=base, bisel=0.1, seg=2)]
    o.append(mb.caixa(20.0, 19.0, 0.12, z=0.26, cor="piso_rosado", bisel=0.02, seg=1))
    W, D, Hm, E = 21.0, 20.0, 7.0, 1.6
    # muralha (com vão do portão na frente)
    segs = [((-W / 2, D / 2), (W / 2, D / 2)), ((W / 2, -D / 2), (W / 2, D / 2)), ((-W / 2, -D / 2), (-W / 2, D / 2)),
            ((-W / 2, -D / 2), (-2.6, -D / 2)), ((2.6, -D / 2), (W / 2, -D / 2))]
    for (x0, y0), (x1, y1) in segs:
        a, b = V((x0, y0)), V((x1, y1))
        L = (b - a).length
        ang = math.degrees(math.atan2(y1 - y0, x1 - x0))
        c = (a + b) / 2
        mw = mb.caixa(L, E, Hm, cor=parede, bisel=0.12, seg=2)
        mb.transforma(mw, loc=(c.x, c.y, 0.25), rot=("Z", ang))
        cj = mb.caixa(L + 0.2, E + 0.3, 0.3, cor=borda, bisel=0.08, seg=1)
        mb.transforma(cj, loc=(c.x, c.y, 0.25 + Hm - 0.1), rot=("Z", ang))
        o += [mw, cj]
        n_ = V((-(y1 - y0), x1 - x0)).normalized()
        if n_.dot(c) < 0:
            n_ = -n_
        off = n_ * (E / 2 - 0.25)
        o += ameias_lin((a + off) + (b - a).normalized() * 2.6, (b + off) - (b - a).normalized() * 2.6,
                        0.25 + Hm + 0.2, parede, w=0.8, h=0.8, esp=0.5, passo=2.0)
    # janelinhas na muralha (de fora)
    for x in (-7.0, -4.2, 4.2, 7.0):
        jn = janela("arco", w=0.75, h=1.4, cor=jan, f=0.12, cruz=False)
        o += poe(jn, x, -D / 2 - E / 2, 3.2)
    for y in (-4.0, 4.0):
        for sx in (-1, 1):
            jn = janela("arco", w=0.75, h=1.4, cor=jan, f=0.12, cruz=False)
            o += poe(jn, sx * (W / 2 + E / 2), y * sx * -1 * -1, 3.2, 90 * sx)
    # torres de canto
    for sx in (-1, 1):
        for sy in (-1, 1):
            tx, ty, r, h = sx * W / 2, sy * D / 2, 2.4, 12.5
            o.append(cil(r + 0.25, 0.8, x=tx, y=ty, z=0.2, cor=base, seg=15, bisel=0.1))
            o.append(cil(r, h, x=tx, y=ty, z=0.25, cor=torre, seg=15, bisel=0.0))
            o.append(cil(r + 0.35, 0.5, x=tx, y=ty, z=h - 0.2, cor=borda, seg=15, bisel=0.1))
            o += cone(r + 0.35, 7.5, h + 0.55, tel, borda, x=tx, y=ty, ponta="lanca", seg=15)
            for zz in (5.2,):  # uma fileira de janelas por torre (malha abaixo de 16 mil)
                a = math.atan2(-1 if sy < 0 else 1, sx * 1.0) if sy > 0 else -math.pi / 2 + sx * 0.6
                for da in (-0.55, 0.55):
                    aa = a + da
                    jn = janela("arco", w=0.75, h=1.45, cor=jan, f=0.12, cruz=False)
                    poe(jn, tx + r * math.cos(aa), ty + r * math.sin(aa), zz, math.degrees(aa) + 90)
                    o += jn
    # portão com duas torrinhas
    for sx in (-1, 1):
        tx, ty, r, h = sx * 2.9, -D / 2 - 0.3, 1.7, 10.5
        o.append(cil(r, h, x=tx, y=ty, z=0.25, cor=torre, seg=13, bisel=0.0))
        o.append(cil(r + 0.3, 0.42, x=tx, y=ty, z=h - 0.15, cor=borda, seg=13, bisel=0.08))
        o += cone(r + 0.3, 5.2, h + 0.4, tel, borda, x=tx, y=ty, seg=13)
        jn = janela("arco", w=0.65, h=1.2, cor=jan, f=0.1, cruz=False)
        o += poe(jn, tx, ty - r, 6.0)
    o.append(mb.caixa(4.4, 2.2, 8.2, y=-D / 2 - 0.2, z=0.25, cor=parede, bisel=0.12, seg=2))
    o.append(mb.caixa(4.6, 2.4, 0.3, y=-D / 2 - 0.2, z=8.3, cor=borda, bisel=0.08, seg=1))
    o += ameias_lin((-1.8, -D / 2 - 1.05), (1.8, -D / 2 - 1.05), 8.6, parede, w=0.6, h=0.65, esp=0.4, passo=1.2)
    o += poe(porta(2.6, 4.2, "madeira", borda, vigia=False), 0, -D / 2 - 1.3, 0.25)
    jr = janela("redonda", w=1.2, cor=jan, f=0.16)
    o += poe(jr, 0, -D / 2 - 1.3, 5.4)
    for sx in (-1, 1):
        o += poe(lampiao(), sx * 1.8, -D / 2 - 1.3, 3.0)
    # torre de menagem
    kx, ky, KL, KP, KH = 0.0, 3.0, 11.0, 9.0, 15.0
    o.append(mb.caixa(KL, KP, KH, x=kx, y=ky, z=0.25, cor=parede, bisel=0.12, seg=2))
    for zz in (5.4, 10.4):
        o.append(mb.caixa(KL + 0.24, KP + 0.24, 0.26, x=kx, y=ky, z=zz, cor=borda, bisel=0.07, seg=1))
    o.append(mb.caixa(KL + 0.5, KP + 0.5, 0.4, x=kx, y=ky, z=KH + 0.1, cor=borda, bisel=0.1, seg=1))
    for (x0, y0), (x1, y1) in (((-KL / 2, -KP / 2), (KL / 2, -KP / 2)), ((KL / 2, -KP / 2), (KL / 2, KP / 2)),
                               ((KL / 2, KP / 2), (-KL / 2, KP / 2)), ((-KL / 2, KP / 2), (-KL / 2, -KP / 2))):
        o += ameias_lin((kx + x0, ky + y0), (kx + x1, ky + y1), KH + 0.5, parede, w=0.75, h=0.8, esp=0.5, passo=2.0)
    for k in range(3):
        z = 1.6 + k * 5.0
        fachada_jan = dict(forma="arco", w=0.9, h=1.7 if k else 2.0, cor=jan)
        objs = []
        fachada_janelas(objs, "f", KL, KP, [-3.6, 3.6] if k == 0 else [-3.6, -1.2, 1.2, 3.6], z, **fachada_jan)
        fachada_janelas(objs, "d", KL, KP, [-2.4, 2.4], z, **fachada_jan)
        fachada_janelas(objs, "e", KL, KP, [-2.4, 2.4], z, **fachada_jan)
        fachada_janelas(objs, "t", KL, KP, [-2.4, 2.4], z, **fachada_jan)
        o += poe(objs, kx, ky, 0)
    o += poe(porta(2.0, 3.4, "madeira", borda, vigia=True), kx, ky - KP / 2, 0.25)
    # sacada
    o.append(mb.caixa(4.2, 1.4, 0.35, x=kx, y=ky - KP / 2 - 0.65, z=10.65, cor=borda, bisel=0.1, seg=1))
    for k in range(7):
        o.append(cil(0.08, 0.9, x=kx - 1.9 + k * 3.8 / 6, y=ky - KP / 2 - 1.25, z=11.0, cor=borda, seg=6,
                             bisel=0))
    o.append(mb.caixa(4.2, 0.16, 0.14, x=kx, y=ky - KP / 2 - 1.25, z=11.85, cor=borda, bisel=0.04, seg=1))
    # torres altas sobre a menagem
    for tx, ty, r, h, hc in ((-3.0, ky + 1.6, 2.4, 25.0, 9.0), (3.2, ky - 1.2, 1.9, 21.0, 7.0)):
        o.append(cil(r, h - KH, x=tx, y=ty, z=KH + 0.2, cor=torre, seg=15, bisel=0.0))
        o.append(cil(r + 0.35, 0.45, x=tx, y=ty, z=h - 0.2, cor=borda, seg=15, bisel=0.08))
        o += cone(r + 0.35, hc, h + 0.45, tel, borda, x=tx, y=ty, ponta="esfera", seg=15)
        o += bandeira(tx, ty, h + 0.45 + hc - 0.2, "lilas", alt=2.4, ang=-20)
        for aa in (-110, -60, 30):
            a = RAD(aa)
            jn = janela("arco", w=0.75, h=1.4, cor=jan, f=0.12, cruz=False)
            poe(jn, tx + r * math.cos(a), ty + r * math.sin(a), h - 4.0, aa + 90)
            o += jn
    # torrinha pendurada no canto da menagem
    tx, ty = kx + KL / 2, ky - KP / 2
    o.append(mb.torno([(0.0, 9.4), (0.5, 9.5), (1.25, 10.6), (1.25, 13.6), (0.0, 13.6)], x=tx, y=ty, cor=torre, seg=13))
    o.append(cil(1.55, 0.3, x=tx, y=ty, z=13.5, cor=borda, seg=13, bisel=0.06))
    o += cone(1.5, 4.0, 13.8, tel, None, x=tx, y=ty)
    it.add(o)
    it.colisao([((0, 0, 0), (25.0, 24.0, 0.4)), ((0, D / 2, 0), (W + E, E, Hm + 1.2)), ((W / 2, 0, 0), (E, D, Hm + 1.2)),
                ((-W / 2, 0, 0), (E, D, Hm + 1.2)), ((0, -D / 2, 0), (W + E, E + 1.2, Hm + 1.2)),
                ((kx, ky, 0), (KL, KP, KH + 1.2))])
    return dict(andares=5)


def casa_arvore(it):
    """Casa na árvore: árvore enorme com raízes, galhos e copa de bolotas, cabana de madeira num deque com guarda-corpo,
    escada de mão até o chão e um balanço."""
    o = [mb.extrudado(blob_contorno(5.7, 30, 0.1, 41), 0.2, cor="grama", bisel=0.09, seg=2)]
    tr = [(0.0, 0.1), (2.3, 0.1), (1.95, 0.35), (1.5, 0.95), (1.25, 2.4), (1.12, 5.5), (1.0, 8.5), (0.92, 11.0),
          (0.85, 12.6), (0.0, 12.8)]
    o.append(mb.torno(tr, cor="madeira_media", seg=18, angulo=50))
    for k in range(5):
        t = 2 * math.pi * k / 5 + 0.4
        rz = mb.superelipsoide(3.0, 0.9, 0.9, cor="madeira_media", e=0.7, e_v=0.7, nu=12, nv=6)
        mb.transforma(rz, loc=(1.4, 0, 0.0), rot=("Y", 18))
        mb.transforma(rz, rot=("Z", math.degrees(t)))
        o.append(rz)
    galhos = [((0, 0, 9.5), (2.2, 1.0, 11.8), (3.6, 1.5, 13.0)), ((0, 0, 10.0), (-2.0, 0.6, 12.0), (-3.4, 0.8, 13.6)),
              ((0, 0, 10.5), (0.4, 2.2, 12.6), (0.6, 3.4, 14.0)), ((0, 0, 8.8), (2.8, -0.6, 9.6), (4.6, -0.8, 10.2))]
    for g in galhos:
        o.append(mb.tubo([V(p) for p in g], 0.42, cor="madeira_media", seg=10, raio_curva=1.0))
    copa = [((0, 0.4, 15.6), 4.2, "folha_clara"), ((3.0, 1.2, 14.0), 3.0, "verde_claro"),
            ((-3.0, 0.8, 14.4), 3.1, "folha"), ((0.6, 3.0, 14.4), 3.0, "folha"), ((-1.2, -2.4, 14.6), 2.8,
                                                                                    "verde_claro"),
            ((2.4, -1.8, 15.6), 2.6, "folha_clara"), ((-2.2, 2.6, 16.6), 2.5, "verde_lima"),
            ((1.0, 0.6, 18.4), 2.8, "verde_lima"), ((4.1, -0.6, 11.4), 1.8, "folha"),
            ((-3.4, -0.8, 12.6), 1.9, "verde_claro")]
    for (x, y, z), r, c in copa:
        o.append(mb.esfera(r * 1.1, x=x, y=y, z=z + 0.3, cor=c, seg=16, esc=(1, 1, 0.9)))
    # deque
    zd = 7.0
    dx, dy = -0.2, -1.4
    o.append(mb.caixa(5.6, 5.2, 0.32, x=dx, y=dy, z=zd, cor="madeira_clara", bisel=0.06, seg=1))
    for k in range(6):
        o.append(mb.caixa(5.62, 0.04, 0.02, x=dx, y=dy - 2.6 + 5.2 * (k + 0.5) / 6, z=zd + 0.31, cor="madeira_mel",
                          bisel=0, liso=False))
    for sx in (-1, 1):
        o.append(mb.tubo([(dx + sx * 2.4, dy - 2.2, zd), (sx * 0.6, -0.9, zd - 3.0)], 0.16, cor="madeira",
                         seg=8, raio_curva=0.1))
    # guarda-corpo (aberto à esquerda, onde chega a escada)
    post = []
    pts = [(dx - 2.7, dy - 1.2), (dx - 2.7, dy - 2.5), (dx + 2.7, dy - 2.5), (dx + 2.7, dy + 2.5)]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        n_ = max(2, int(math.hypot(x1 - x0, y1 - y0) / 0.9))
        for k in range(n_ + 1):
            post.append(mb.caixa(0.12, 0.12, 1.0, x=x0 + (x1 - x0) * k / n_, y=y0 + (y1 - y0) * k / n_, z=zd + 0.3,
                                 cor="madeira", bisel=0.02, seg=1))
    o += post
    o.append(mb.tubo([(x, y, zd + 1.3) for x, y in pts], 0.07, cor="madeira", seg=6, raio_curva=0.1))
    # cabana
    cx, cy, CL, CP, CH = dx + 0.3, dy - 0.2, 3.6, 3.0, 2.6
    o.append(mb.caixa(CL, CP, CH, x=cx, y=cy, z=zd + 0.3, cor="madeira_mel", bisel=0.06, seg=1))
    for k in range(4):
        o.append(mb.caixa(CL + 0.04, CP + 0.04, 0.05, x=cx, y=cy, z=zd + 0.85 + k * 0.55, cor="madeira",
                          bisel=0, liso=False))
    tl, _ = telhado(CL, CP, 1.8, zd + 0.3 + CH, "terracota", "madeira_escura", beiral=0.4, esp=0.18, fileiras=3,
                    x=cx, y=cy, oitao="madeira_mel")
    o += tl
    jr = janela("redonda", w=0.85, cor="branco", f=0.12)
    o += poe(jr, cx + 0.6, cy - CP / 2, zd + 1.25)
    jn = janela("ret", w=0.7, h=0.8, cor="branco", f=0.1, persiana="verde")
    o += poe(jn, cx + CL / 2, cy, zd + 1.3, 90)
    jn = janela("redonda", w=0.6, cor="branco", f=0.1)
    o += poe(jn, cx - CL / 2, cy - 0.3, zd + CH + 0.6, -90)
    o += poe(porta(0.95, 1.95, "verde", "branco", forma="arco", vigia=True), cx - 0.85, cy - CP / 2, zd + 0.3)
    o += poe(lampiao(), cx - 0.1, cy - CP / 2, zd + 2.2)
    # escada de mão
    xa, y0, y1 = dx - 2.2, dy - 4.9, dy - 2.55
    for s in (-1, 1):
        o.append(mb.tubo([(xa + s * 0.32, y0, 0.1), (xa + s * 0.32, y1, zd + 1.0)], 0.07, cor="madeira_clara",
                         seg=6, raio_curva=0.05))
    for k in range(1, 20):
        t = k / 20 * (zd + 0.3) / (zd + 1.0)
        o.append(cil(0.05, 0.62, x=xa, y=y0 + (y1 - y0) * t, z=0.1 + (zd + 0.9) * t, cor="madeira_clara",
                             eixo="x", seg=6, bisel=0))
    # balanço no galho do lado
    bx, by = 4.0, -0.7
    for s in (-1, 1):
        o.append(cil(0.03, 9.4, x=bx, y=by + s * 0.4, z=0.75, cor="bege", seg=5, bisel=0))
    o.append(mb.caixa(0.5, 1.1, 0.1, x=bx, y=by, z=0.7, cor="vermelho", bisel=0.03, seg=1))
    it.add(o)
    apoia_chao(it)
    it.colisao([((0, 0, 0), (3.0, 3.0, 12.6)), ((dx, dy, zd), (5.6, 5.2, 4.8)), ((0.3, 0.8, 11.0), (11.0, 9.0, 10.5)),
                ((xa, (y0 + y1) / 2, 0), (0.8, 2.4, zd + 0.4))])
    return dict(andares=1)


# =====================================================================================================================
# Lista de peças e execução
# =====================================================================================================================
# (id, rótulo, grupo, função, opções, lote, tags)
PECAS = [
    ("cristais_roxos", "Aglomerado de cristais roxos", "cristais_roxos", cristais_roxos, {}, (1, 1),
     ["marco", "cristal", "loja", "neon", "letreiro"]),
    ("castelo_areia", "Castelo de areia gigante", "castelo_areia", castelo_areia, {}, (1, 1), ["marco", "castelo"]),
    ("castelo_rosa", "Castelo de conto de fadas rosa", "castelo_rosa", castelo_rosa, {}, (2, 2),
     ["marco", "castelo", "torre"]),
    ("casa_arvore", "Casa na árvore", "casa_arvore", casa_arvore, {}, (1, 1), ["marco", "arvore", "casa"]),
    ("casa_torta_empena_rosa", "Casa torta com empena (rosa)", "casa_torta_empena", casa_torta_empena, {}, (1, 1),
     ["casa", "conto_de_fadas", "chamine"]),
    ("casa_torta_empena_azul", "Casa torta com empena (azul)", "casa_torta_empena", casa_torta_empena,
     dict(parede="azul_celeste", tel="laranja", tel_borda="laranja_claro", borda="branco", cor_porta="madeira_media"),
     (1, 1), ["casa", "conto_de_fadas", "chamine"]),
    ("casa_torta_lucarnas_laranja", "Casa torta com águas-furtadas (laranja)", "casa_torta_lucarnas",
     casa_torta_lucarnas, {}, (1, 1), ["casa", "conto_de_fadas", "chamine"]),
    ("casa_torta_lucarnas_verde", "Casa torta com águas-furtadas (verde)", "casa_torta_lucarnas", casa_torta_lucarnas,
     dict(terreo="verde", sup="verde_lima", tel="laranja_claro", tel_borda="amarelo_claro", viga="verde_escuro",
          jan="creme_claro"), (1, 1), ["casa", "conto_de_fadas", "chamine"]),
    ("casa_torta_torreao_turquesa", "Casa torta com torreão (turquesa)", "casa_torta_torreao", casa_torta_torreao, {},
     (1, 1), ["casa", "conto_de_fadas", "torre"]),
    ("casa_torta_torreao_lilas", "Casa torta com torreão (lilás)", "casa_torta_torreao", casa_torta_torreao,
     dict(parede="rosa_claro", tel="lilas", tel_borda="lilas_claro", borda="branco", jan="roxo", cone_cor="roxo"),
     (1, 1), ["casa", "conto_de_fadas", "torre"]),
    ("casa_cubo_magico", "Casa de cubo mágico", "casa_cubo_magico", casa_cubo_magico, {}, (1, 1),
     ["casa", "brinquedo"]),
    ("casa_cubo_magico_pastel", "Casa de cubo mágico (pastel)", "casa_cubo_magico", casa_cubo_magico,
     dict(cores=("rosa_bebe", "amarelo_claro", "menta", "azul_bebe", "pessego", "lilas_claro", "turquesa_claro"),
          moldura="roxo"), (1, 1), ["casa", "brinquedo"]),
    ("casa_doce_rosa", "Casa de doce (rosa)", "casa_doce", casa_doce, {}, (1, 1), ["casa", "loja", "doces", "letreiro"]),
    ("casa_doce_menta", "Casa de doce (menta)", "casa_doce", casa_doce,
     dict(parede="marrom_claro", tel="verde_agua", tel_alt="menta", porta_cor="chocolate", estampa="placa_doces_menta",
          confeitos=("rosa", "amarelo", "lilas", "vermelho_claro", "azul_claro")), (1, 1),
     ["casa", "loja", "doces", "letreiro"]),
    ("casa_cogumelo_vermelho", "Casa-cogumelo (vermelha)", "casa_cogumelo", casa_cogumelo, {}, (1, 1),
     ["casa", "natureza"]),
    ("casa_cogumelo_lilas", "Casa-cogumelo (lilás)", "casa_cogumelo", casa_cogumelo,
     dict(chapeu="lilas", pintas="branco", caule="creme_claro", lamela="lilas_claro", jan="roxo", porta_cor="roxo",
          grama="grama"), (1, 1), ["casa", "natureza"]),
    ("casa_abobora", "Casa-abóbora", "casa_abobora", casa_abobora, {}, (1, 1), ["casa", "natureza"]),
    ("casinha_arredondada_rosa", "Casinha arredondada (rosa)", "casinha_arredondada", casinha_arredondada, {}, (1, 1),
     ["casa", "um_comodo"]),
    ("casinha_arredondada_turquesa", "Casinha arredondada (turquesa)", "casinha_arredondada", casinha_arredondada,
     dict(parede="turquesa_claro", tel="amarelo", aro="laranja", jan="laranja", porta_cor="laranja",
          base="turquesa"), (1, 1), ["casa", "um_comodo"]),
    ("casa_sobrado_redondo", "Sobradinho redondo com terraço", "casa_sobrado_redondo", casa_sobrado_redondo, {},
     (1, 1), ["casa", "terraco"]),
    ("casinha_cupula_lilas", "Casinha com cúpula (lilás)", "casinha_cupula", casinha_cupula, {}, (1, 1),
     ["casa", "um_comodo", "cupula"]),
    ("casinha_chamine_azul", "Casinha de telhado azul com chaminé", "casinha_chamine_azul", casinha_chamine_azul, {},
     (1, 1), ["casa", "um_comodo", "chamine"]),
    ("casinha_telhado_vermelho", "Casinha de telhado vermelho com empenas", "casinha_telhado_vermelho",
     casinha_telhado_vermelho, {}, (1, 1), ["casa", "conto_de_fadas"]),
    ("casa_estreita_enxaimel", "Casa estreita com enxaimel", "casa_estreita_enxaimel", casa_estreita_enxaimel, {},
     (1, 1), ["casa", "conto_de_fadas", "chamine"]),

]


def roda(ids=None):
    global SORT, RND
    cat = mb.Catalogo("predios_magicos", SAIDA, rotulo="Prédios mágicos")
    for id_, rot, grupo, f, op, lote, tags in PECAS:
        if ids and id_ not in ids:
            continue
        mb.limpa()
        sem = sum(ord(ch) for ch in id_)
        SORT = Sorteio(sem)
        RND = random.Random(sem)
        it = mb.Item(id_)
        info = f(it, **op) or {}
        if os.environ.get("MAG_TRIS"):
            cont = {}
            for ob in it.partes:
                k = ob.name.split(".")[0]
                cont[k] = cont.get(k, 0) + sum(len(p.vertices) - 2 for p in ob.data.polygons)
            print("tris", id_, sorted(cont.items(), key=lambda kv: -kv[1])[:10], flush=True)
        extra = {"lote": list(lote), "andares": info.get("andares", 1), "estilo": ESTILO}
        cat.exporta(it, rot, grupo=grupo, tags=["predio", ESTILO] + list(tags), extra=extra)
    # mantém no catálogo só as peças desta lista, na ordem dela
    ordem = [p[0] for p in PECAS]
    cat.dados["itens"] = sorted([i for i in cat.dados["itens"] if i["id"] in ordem], key=lambda i: ordem.index(i["id"]))
    cat.salva()


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:]
    SAIDA = args[0]
    roda(args[1:] or None)
