"""Cidade do Morada: sinalização (outdoors, faixas, painéis, totens, placas e letreiros) — categoria "sinalizacao".

Uso:
  python3 -I morada-art/sinalizacao_estampas.py SP/cidade_out           (uma vez: desenha os PNG)
  MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/cidade_sinalizacao.py -- SP/cidade_out [ids|grupos...]

Convenções (GUIA_CIDADE, GUIA_PREDIOS, GUIA_SINALIZACAO):
- metros, Z para cima, frente para −Y. fixacao "chao": origem no chão, no meio da peça. fixacao "parede": as costas no
  plano y = 0, o corpo para −Y, origem no meio da largura e na base da peça; a altura sugerida vai em altura_instalacao.
- As telas são estampas (mb.material_estampa com emissão: brilham à noite, fracas de dia). Bordas de neon com
  neon / neon_rosa / neon_roxo, refletores e lâmpadas com luz.
- Animadas: o objeto filho que anima leva extras glTF (anima, velocidade/periodo/quadros/angulo/eixo) e a mesma lista
  vai no catálogo em extra["animacoes"] = [{"nome": <nó>, "anima": ..., ..., "pivo": [x, y, z] (glTF)}]:
    rolar    {"anima": "rolar", "velocidade": v}       a textura do nó corre em U (offset.x += v·t, em UV por segundo,
                                                         repetindo); o PNG emenda e a malha mostra só um trecho dele.
    piscar   {"anima": "piscar", "periodo": p}         acende e apaga (metade do período com emissão, metade sem).
    girar    {"anima": "girar", "eixo": "y", "velocidade": g}   gira g graus/s no eixo do glTF, em volta da origem do nó.
    trocar   {"anima": "trocar", "quadros": n, "periodo": p}    a textura tem n quadros lado a lado em U; a malha mostra o
                                                         primeiro (u de 0 a 1/n); a cada p s, offset.x = k/n.
    balancar {"anima": "balancar", "angulo": a, "periodo": p, "eixo": "x"}   oscila ±a graus no eixo do glTF, em volta
                                                         da origem do nó (a haste da bandeira).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import moveis_base as mb  # noqa: E402

V = Vector
CAT = "sinalizacao"
EST_DIR = ""
F_BLACK = "/usr/share/fonts/opentype/inter/Inter-Black.otf"
UV1 = ((0, 0), (1, 0), (1, 1), (0, 1))
MINI_FRENTE = (0.22, -1.0, 0.16)
MINI = {"bandeirola_roxa": (1.0, -0.3, 0.15), "placa_wifi_redonda": (1.0, -0.3, 0.15),
        "placa_poste_cafe": (0.3, -1.0, 0.25), "fliperama_corrida": (0.45, -1.0, 0.35)}


# ======================================================================================================================
# Base própria (sem mexer na moveis_base)
# ======================================================================================================================
class ItemS(mb.Item):
    """Item com filhos animados (extras glTF no nó filho, como os interativos da biblioteca de móveis)."""

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


def obj(nome, bm, cor="branco", mat="atlas"):
    mb.materiais()
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


_EST = {}


def est(nome, emissao=1.0):
    """Material da estampa <nome>.png (emissão ligada à própria textura)."""
    if nome not in _EST:
        _EST[nome] = mb.material_estampa("sin_" + nome, os.path.join(EST_DIR, nome + ".png"), emissao=emissao)
    return _EST[nome]


def quad_uv(nome, c, u, v, w, h, mat, uv=UV1, duplo=False):
    """Retângulo com UV próprio: centro c, eixos u (largura) e v (altura); normal = u × v. duplo: verso também."""
    bm = bmesh.new()
    c, u, v = V(c), V(u).normalized(), V(v).normalized()
    vs = [bm.verts.new(c + u * (sx * w / 2) + v * (sy * h / 2)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    f = bm.faces.new(vs)
    uvl = bm.loops.layers.uv.new("UVMap")
    for lo, q in zip(f.loops, uv):
        lo[uvl].uv = q
    if duplo:  # verso: o mesmo desenho visto de trás (não espelhado), 2 mm atrás
        n = u.cross(v)
        vs2 = [bm.verts.new(c - n * 0.004 - u * (sx * w / 2) + v * (sy * h / 2))
               for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        f2 = bm.faces.new(vs2)
        for lo, q in zip(f2.loops, uv):
            lo[uvl].uv = q
    return obj(nome, bm, None, mat=mat)


def vira_para(f, n):
    """Garante que a face olhe para n (o UV anda junto com os vértices)."""
    f.normal_update()
    if f.normal.dot(V(n)) < 0:
        f.normal_flip()


def uv_quadro(n, k=0):
    """UV do quadro k de n quadros lado a lado em U."""
    return ((k / n, 0), ((k + 1) / n, 0), ((k + 1) / n, 1), (k / n, 1))


def uv_rolar(k):
    return ((0, 0), (k, 0), (k, 1), (0, 1))


def gira(objs, ang=0.0, loc=(0, 0, 0), eixo="Z"):
    out = []
    for o in (objs if isinstance(objs, (list, tuple)) else [objs]):
        if o is None:
            continue
        mb.transforma(o, rot=(eixo, ang))
        mb.transforma(o, loc=loc)
        out.append(o)
    return out


def tela(mat, w, h, z0=0.0, x=0.0, borda=0.12, esp=0.16, cor="grafite_escuro", uv=UV1, aro=0.05, y0=0.0,
         nome="tela", separa=False):
    """Painel de parede: fundo boleado + aro saliente (a moldura grossa) + a estampa na frente. As costas em y = y0.
    Devolve a lista de objetos; com separa=True devolve (moldura, [tela]) para animar a tela à parte."""
    W, H = w + 2 * borda, h + 2 * borda
    fundo = mb.caixa(W, esp, H, x=x, y=y0 - esp / 2, z=z0, cor=cor, bisel=min(0.05, borda * 0.45))
    e = esp + aro
    b = borda
    aros = [mb.caixa(W, e, b, x=x, y=y0 - e / 2, z=z0, cor=cor, bisel=min(0.04, b * 0.45)),
            mb.caixa(W, e, b, x=x, y=y0 - e / 2, z=z0 + H - b, cor=cor, bisel=min(0.04, b * 0.45)),
            mb.caixa(b, e, H - 2 * b + 0.01, x=x - W / 2 + b / 2, y=y0 - e / 2, z=z0 + b - 0.005, cor=cor,
                     bisel=min(0.04, b * 0.45)),
            mb.caixa(b, e, H - 2 * b + 0.01, x=x + W / 2 - b / 2, y=y0 - e / 2, z=z0 + b - 0.005, cor=cor,
                     bisel=min(0.04, b * 0.45))]
    tl = quad_uv(nome, (x, y0 - esp - 0.004, z0 + b + h / 2), (1, 0, 0), (0, 0, 1), w + 0.004, h + 0.004, mat, uv)
    if separa:
        return [fundo] + aros, [tl]
    return [fundo] + aros + [tl]


def neon_contorno(w, h, z0, x=0.0, y=-0.2, e=0.06, mat="neon", folga=0.0):
    """Tubos de neon (caixas boleadas) em volta de um retângulo w × h (base em z0), no plano y."""
    L, A = w + 2 * folga, h + 2 * folga
    k = dict(cor=None, mat=mat, bisel=e * 0.4, seg=2)
    return [mb.caixa(L + e, e, e, x=x, y=y, z=z0 - folga - e / 2, **k),
            mb.caixa(L + e, e, e, x=x, y=y, z=z0 + h + folga - e / 2, **k),
            mb.caixa(e, e, A, x=x - L / 2, y=y, z=z0 - folga, **k),
            mb.caixa(e, e, A, x=x + L / 2, y=y, z=z0 - folga, **k)]


def refletor(x, y, z, alvo_y=-0.2, alvo_z=None, braco=1.2, cor="grafite", acima=True):
    """Refletor de outdoor: braço saindo do alto (ou de baixo) do painel e cabeça virada para a tela."""
    sinal = 1 if acima else -1
    hx, hy, hz = x, y - braco, z + sinal * (0.35 + 0.3 * (braco < 1.0 and acima))
    objs = [mb.tubo([(x, y, z), (x, y - braco * 0.5, z + sinal * 0.25), (hx, hy + 0.1, hz)], 0.045, cor=cor)]
    cab = [mb.cilindro(0.17, 0.32, z=-0.16, cor=cor, seg=16, bisel=0.02),
           mb.cilindro(0.14, 0.012, z=-0.17 if acima else 0.158, cor=None, mat="luz", seg=16, bisel=0.0)]
    c = mb.junta(cab, "refletor")
    alvo_z = (z - sinal * 1.4) if alvo_z is None else alvo_z
    d = V((0, alvo_y - hy, alvo_z - hz)).normalized()
    ang = math.degrees(math.atan2(d.y, -d.z)) if acima else math.degrees(math.atan2(d.y, d.z))
    mb.transforma(c, rot=("X", -ang if acima else ang))
    mb.transforma(c, loc=(hx, hy, hz))
    objs.append(c)
    return objs


def refletor_baixo(x, y, z, cor="grafite", inclina=50):
    """Refletor baixo (na passarela ou na base): pé curto e cabeça virada para trás e para cima, para a tela."""
    cab = mb.junta([mb.cilindro(0.15, 0.3, z=0.0, cor=cor, seg=10, bisel=0.02),
                    mb.cilindro(0.12, 0.012, z=0.296, cor=None, mat="luz", seg=10, bisel=0.0)], "refletor")
    mb.transforma(cab, rot=("X", -inclina))
    mb.transforma(cab, loc=(x, y, z + 0.2))
    return [cab, mb.caixa(0.1, 0.1, 0.24, x=x, y=y, z=z, cor=cor, bisel=0.02),
            mb.caixa(0.3, 0.3, 0.04, x=x, y=y, z=z, cor=cor, bisel=0.01)]


def marquise_luz(w, z, cor, prof=0.45):
    """Marquise fina em cima do painel com a régua de luz embaixo (ilumina a tela sem cobrir o desenho)."""
    return [mb.caixa(w, prof, 0.1, y=-prof / 2, z=z, cor=cor, bisel=0.03),
            mb.caixa(w - 0.2, 0.08, 0.02, y=-prof + 0.12, z=z - 0.012, cor=None, mat="luz", bisel=0.005)]


def guarda_corpo(x0, x1, y, z, alt=1.1, cor="cinza_medio", n=None):
    n = n or max(2, int((x1 - x0) / 1.2) + 1)
    objs = [mb.tubo([(x0, y, z + alt), (x1, y, z + alt)], 0.035, cor=cor),
            mb.tubo([(x0, y, z + alt * 0.5), (x1, y, z + alt * 0.5)], 0.022, cor=cor)]
    for k in range(n):
        xx = x0 + (x1 - x0) * k / (n - 1)
        objs.append(mb.cilindro(0.03, alt, x=xx, y=y, z=z, cor=cor, seg=8, bisel=0.0))
    return objs


_FONTE = {}


def texto3d(txt, alt, prof, cor="branco", offset=0.0, nome="letras", mat="atlas", bisel=True, espaco=1.0):
    """Letras 3D (Inter Black): de pé no plano XZ, frente para −Y, a base da letra em z = 0, centradas em x,
    costas em y = 0 (a frente em y = −prof). alt = altura da maiúscula. offset > 0 engorda (contorno)."""
    if "f" not in _FONTE:
        _FONTE["f"] = bpy.data.fonts.load(F_BLACK, check_existing=True)
    cu = bpy.data.curves.new(nome, "FONT")
    cu.body = txt
    cu.font = _FONTE["f"]
    cu.size = alt / 0.727
    cu.space_character = espaco
    cu.align_x = "CENTER"
    cu.extrude = prof / 2
    cu.offset = offset
    cu.resolution_u = 2
    if bisel:
        cu.bevel_depth = min(0.02, alt * 0.015)
        cu.bevel_resolution = 1
    tmp = bpy.data.objects.new("tmp_" + nome, cu)
    bpy.context.scene.collection.objects.link(tmp)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
    bpy.data.objects.remove(tmp)
    bpy.data.curves.remove(cu)
    bm = bmesh.new()
    bm.from_mesh(me)
    bpy.data.meshes.remove(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    bm.transform(Matrix.Translation((0, -prof / 2, 0)) @ Matrix.Rotation(math.pi / 2, 4, "X"))
    return mb._obj(nome, bm, cor, mat, liso=True, angulo=40)


def letras_contorno(txt, alt, prof, cor, cor_contorno, mat_frente=None, mat_contorno="atlas", gordura=0.07):
    """Letra de bloco com contorno: a letra na frente e uma cópia engordada (contorno) atrás, mais funda."""
    frente = texto3d(txt, alt, prof, cor, nome="letras")
    mb.transforma(frente, loc=(0, -prof * 0.45, 0))
    if mat_frente:
        mb.pinta_onde(frente, None, lambda c, n: n.y < -0.7, mat=mat_frente)
    cont = texto3d(txt, alt, prof * 1.2, cor_contorno if mat_contorno == "atlas" else None, offset=alt * gordura,
                   nome="contorno", mat=mat_contorno, bisel=False)
    return [frente, cont]


def lampada(x, y, z, r=0.05):
    """Lâmpada de letreiro (baixa: cilindro boleado deitado em Y, saindo da placa para −Y)."""
    return mb.cilindro(r, 0.07, x=x, y=y - 0.035, z=z, cor=None, mat="luz", eixo="y", seg=8, bisel=0.0)


def pe_placa(x, alt, y=0.0, cor="grafite", r=0.05):
    """Pé fino de placa de chão com sapata."""
    return [mb.cilindro(r, alt, x=x, y=y, z=0.0, cor=cor, seg=12),
            mb.caixa(0.36, 0.5, 0.06, x=x, y=y, z=0.0, cor=cor, bisel=0.02)]


# ======================================================================================================================
# Peças
# ======================================================================================================================
P = []  # (id, rotulo, grupo, fixacao, altura_instalacao, tags, funcao)


def peca(id_, rotulo, grupo, fixacao="chao", alt=None, tags=()):
    def deco(f):
        P.append((id_, rotulo, grupo, fixacao, alt, list(tags), f))
        return f
    return deco


# ----------------------------------------------------------------------------------------------- outdoors de poste
W9, H3 = 9.0, 3.0


@peca("outdoor_poste_futuro", "Outdoor de poste com passarela (O futuro é agora)", "outdoor_poste",
      tags=["outdoor", "poste", "rua"])
def _(it):
    z0 = 6.0
    it.add(mb.cilindro(0.75, 0.45, cor="concreto_escuro", seg=20, bisel=0.06))
    it.add(mb.cilindro(0.36, z0 + 0.4, cor="cinza", seg=20, bisel=0.02))
    it.add(mb.cilindro(0.46, 0.3, z=z0 - 0.75, cor="cinza_medio", seg=20, bisel=0.04))
    it.add(mb.caixa(3.6, 0.5, 0.4, y=0.0, z=z0 - 0.45, cor="cinza_medio", bisel=0.05))
    it.add(tela(est("outdoor_futuro"), W9, H3, z0=z0, borda=0.2, esp=0.4, cor="grafite_escuro", y0=0.2))
    it.add(mb.caixa(W9 + 0.3, 0.12, H3 + 0.3, y=0.26, z=z0 + 0.05, cor="cinza", bisel=0.04))  # costas
    # passarela + guarda-corpo + mãos-francesas
    yp0, yp1 = -0.25, -1.25
    it.add(mb.caixa(W9 + 0.2, yp0 - yp1, 0.1, y=(yp0 + yp1) / 2, z=z0 - 0.3, cor="metal_escuro", bisel=0.02))
    it.add(guarda_corpo(-W9 / 2 - 0.05, W9 / 2 + 0.05, yp1 + 0.05, z0 - 0.2, alt=1.1, cor="cinza_claro"))
    for sx in (-1, 1):
        it.add(mb.tubo([(sx * 3.2, 0.1, z0 - 1.6), (sx * 3.2, yp1 + 0.15, z0 - 0.32)], 0.05, cor="metal_escuro"))
        it.add(mb.tubo([(sx * 1.4, 0.1, z0 - 0.45), (sx * 3.2, 0.1, z0 - 1.6)], 0.05, cor="metal_escuro"))
    for x in (-3.0, 0.0, 3.0):
        it.add(refletor_baixo(x, yp1 + 0.35, z0 - 0.25))
    it.colisao([((0, 0, 0), (1.5, 1.5, 0.45)), ((0, 0, 0), (0.75, 0.75, z0)),
                ((0, -0.5, z0 - 0.35), (W9 + 0.4, 1.6, H3 + 0.75))])


@peca("outdoor_braco_carro", "Outdoor de braço inclinado (carro elétrico)", "outdoor_braco",
      tags=["outdoor", "rua", "concreto"])
def _(it):
    z0 = 5.9
    perfil = [(-4.6, 0.0), (-3.1, 0.0), (0.2, z0 - 0.75), (4.3, z0 - 0.75), (4.3, z0 - 0.05), (-0.7, z0 - 0.05)]
    braco = mb.extrudado(perfil, 0.8, y=-0.4, cor="concreto_escuro", bisel=0.08, plano="xz")
    it.add(braco)
    it.add(mb.caixa(2.4, 1.6, 0.3, x=-3.85, z=0.0, cor="concreto", bisel=0.06))
    for x in (-2.0, 0.5, 2.8):
        it.add(mb.caixa(0.5, 0.06, 0.12, x=x - 0.5, y=-0.43, z=z0 - 0.5 if x > 0 else 1.6 + (x + 2) * 1.2,
                        cor="amarelo", bisel=0.02))
    it.add(tela(est("outdoor_carro"), W9, H3, z0=z0, borda=0.22, esp=0.35, cor="grafite_escuro", y0=0.2))
    it.add(mb.caixa(W9 + 0.34, 0.1, H3 + 0.34, y=0.24, z=z0 + 0.05, cor="cinza_medio", bisel=0.04))
    for x in (-3.4, 3.4):
        it.add(refletor(x, -0.2, z0 - 0.05, alvo_z=z0 + 2.0, braco=1.1, acima=False))
    it.colisao([((-3.85, 0, 0), (2.4, 1.6, 0.3)), ((-2.9, 0, 0.3), (1.6, 0.8, 2.6)), ((-1.3, 0, 2.9), (1.6, 0.8, 2.5)),
                ((0, 0, z0 - 0.8), (W9 + 0.5, 0.9, H3 + 1.25))])


@peca("outdoor_luminarias_vr", "Outdoor com luminárias penduradas (realidade virtual)", "outdoor_luminarias",
      tags=["outdoor", "rua"])
def _(it):
    z0 = 5.4
    for sx in (-1, 1):
        it.add(mb.caixa(0.5, 0.5, z0 + 0.6, x=sx * 3.0, y=0.05, cor="grafite", bisel=0.06))
        it.add(mb.caixa(1.1, 1.1, 0.3, x=sx * 3.0, y=0.05, cor="concreto_escuro", bisel=0.06))
        it.add(mb.caixa(0.6, 0.6, 0.12, x=sx * 3.0, y=0.05, z=z0 - 0.4, cor="metal_escuro", bisel=0.03))
    it.add(mb.caixa(7.0, 0.3, 0.3, y=0.05, z=z0 - 0.35, cor="grafite", bisel=0.04))
    it.add(tela(est("outdoor_vr"), W9, H3, z0=z0, borda=0.3, esp=0.4, cor="roxo_escuro", y0=0.3, aro=0.08))
    it.add(mb.caixa(W9 + 0.5, 0.1, H3 + 0.5, y=0.34, z=z0 + 0.05, cor="grafite", bisel=0.04))
    it.add(neon_contorno(W9 + 0.6, H3 + 0.6, z0, y=-0.2, e=0.07, mat="neon_rosa"))
    zt = z0 + H3 + 0.6
    for x in (0.0, 3.3):  # luminárias de pescoço de ganso: sobem das costas e pendem sobre a tela (fora do texto)
        it.add(mb.tubo([(x, 0.25, zt - 0.3), (x, 0.25, zt + 0.8), (x, -0.6, zt + 1.15), (x, -1.2, zt + 0.7)], 0.06,
                       cor="grafite", raio_curva=0.35))
        cupula = mb.torno([(0.0, 0.32), (0.12, 0.32), (0.2, 0.22), (0.42, -0.08), (0.44, -0.12), (0.0, -0.12)],
                          cor="grafite", seg=24)
        luz_ = mb.cilindro(0.38, 0.02, z=-0.13, cor=None, mat="luz", seg=24, bisel=0.0)
        c = mb.junta([cupula, luz_], "luminaria")
        mb.transforma(c, rot=("X", -25))
        mb.transforma(c, loc=(x, -1.3, zt + 0.35))
        it.add(c)
    it.colisao([((-3, 0.05, 0), (1.1, 1.1, z0)), ((3, 0.05, 0), (1.1, 1.1, z0)),
                ((0, 0.0, z0 - 0.4), (W9 + 0.8, 0.9, H3 + 1.0))])


@peca("outdoor_troca_promo", "Outdoor que troca de imagem (promoção, cinema, suco)", "outdoor_troca",
      tags=["outdoor", "rua", "animado"])
def _(it):
    z0 = 6.2
    it.add(mb.caixa(1.3, 1.3, 0.4, cor="concreto_escuro", bisel=0.06))
    it.add(mb.caixa(0.8, 0.8, z0, cor="azul_noite", bisel=0.08))
    for z in (1.2, 2.4, 3.6, 4.8):
        it.add(mb.caixa(0.84, 0.84, 0.06, z=z, cor="amarelo", bisel=0.02))
    it.add(mb.caixa(2.4, 0.9, 0.5, z=z0 - 0.5, cor="azul_noite", bisel=0.06))
    moldura, tl = tela(est("outdoor_troca"), W9, H3, z0=z0, borda=0.22, esp=0.38, cor="azul_noite", y0=0.25,
                       uv=uv_quadro(3), separa=True)
    it.add(moldura)
    it.add(mb.caixa(W9 + 0.34, 0.1, H3 + 0.34, y=0.3, z=z0 + 0.05, cor="cinza_medio", bisel=0.04))
    it.add(mb.caixa(W9 + 0.44, 0.7, 0.2, y=-0.05, z=z0 + H3 + 0.44, cor="amarelo", bisel=0.06))
    for x in (-2.5, 2.5):
        it.add(refletor(x, -0.3, z0 + H3 + 0.64, alvo_z=z0 + 1.0, braco=0.85))
    it.anima(tl, {"anima": "trocar", "quadros": 3, "periodo": 3}, "tela_troca")
    it.colisao([((0, 0, 0), (1.3, 1.3, 0.4)), ((0, 0, 0), (0.8, 0.8, z0)), ((0, 0, z0 - 0.5), (W9 + 0.5, 1.0, H3 + 1.2))])


@peca("outdoor_led_viagem", "Outdoor com letreiro de LED correndo (boa viagem)", "outdoor_led",
      tags=["outdoor", "rua", "led", "animado"])
def _(it):
    z0, h = 5.6, W9 * 330 / 1200
    for sx in (-1, 1):
        it.add(mb.cilindro(0.18, z0 + 0.2, x=sx * 3.4, cor="cinza_claro", seg=20))
        it.add(mb.cilindro(0.4, 0.25, x=sx * 3.4, cor="concreto_escuro", seg=20, bisel=0.04))
    it.add(mb.caixa(W9 + 0.5, 0.42, 0.9, y=-0.06, z=z0 - 0.9, cor="grafite_escuro", bisel=0.06))
    lmat = est("led_viagem", 1.6)
    k = (W9 / 0.62) * 96 / 2144
    led = quad_uv("led_viagem", (0, -0.28, z0 - 0.45), (1, 0, 0), (0, 0, 1), W9, 0.62, lmat, uv_rolar(k))
    it.add(tela(est("outdoor_viagem"), W9, h, z0=z0, borda=0.2, esp=0.36, cor="branco", y0=0.15))
    it.add(mb.caixa(W9 + 0.3, 0.1, h + 0.3, y=0.2, z=z0 + 0.05, cor="cinza", bisel=0.04))
    for x in (-3.0, 0.0, 3.0):
        it.add(refletor(x, -0.2, z0 + h + 0.4, alvo_z=z0 + 1.0, braco=0.85))
    it.anima(led, {"anima": "rolar", "velocidade": 0.06}, "led_rolante")
    it.colisao([((-3.4, 0, 0), (0.8, 0.8, z0)), ((3.4, 0, 0), (0.8, 0.8, z0)),
                ((0, 0, z0 - 0.9), (W9 + 0.5, 0.8, h + 1.4))])


# ----------------------------------------------------------------------------------------------- faixas e LED (parede)
def faixa(it, nome, w, aspecto, cor="preto", borda=0.06, esp=0.1, presilhas=True):
    h = w / aspecto
    it.add(tela(est(nome), w, h, borda=borda, esp=esp, cor=cor, aro=0.025))
    if presilhas:
        for sx in (-1, 1):
            it.add(mb.caixa(0.08, 0.04, h + 2 * borda + 0.16, x=sx * (w / 2 - 0.3), y=-0.02, z=-0.08, cor="metal",
                            bisel=0.015))
    return h


@peca("faixa_o_futuro_pixel", "Faixa de fachada em letra de pixel (O futuro é...)", "faixa_pixel", "parede", 3.6,
      tags=["faixa", "fachada"])
def _(it):
    faixa(it, "faixa_futuro", 4.8, 1024 / 170)


@peca("faixa_sinta_energia", "Faixa de fachada (Sinta a energia)", "faixa_italico", "parede", 3.6,
      tags=["faixa", "fachada"])
def _(it):
    faixa(it, "faixa_energia", 5.2, 1024 / 164, cor="azul_marinho")


@peca("faixa_sonhe_alto", "Faixa de fachada branca (Sonhe alto, voe)", "faixa_branca", "parede", 3.6,
      tags=["faixa", "fachada"])
def _(it):
    faixa(it, "faixa_sonhe", 4.5, 1024 / 170, cor="grafite_escuro")


@peca("faixa_energia_limpa", "Faixa de fachada turquesa (Energia limpa)", "faixa_turquesa", "parede", 3.4,
      tags=["faixa", "fachada"])
def _(it):
    faixa(it, "faixa_limpa", 3.8, 1024 / 166, cor="petroleo")


def led_caixa(it, nome, w, h, tex_w, tex_h=96, vel=0.08, cor="grafite_escuro", emissao=1.6, neon=None):
    it.add(mb.caixa(w + 0.16, 0.2, h + 0.16, y=-0.1, cor=cor, bisel=0.05))
    it.add(mb.caixa(w + 0.02, 0.05, h + 0.02, y=-0.2, z=0.07, cor="preto", bisel=0.01))
    k = (w / h) * tex_h / tex_w
    led = quad_uv(nome, (0, -0.228, 0.08 + h / 2), (1, 0, 0), (0, 0, 1), w, h, est(nome, emissao), uv_rolar(k))
    if neon:
        it.add(neon_contorno(w + 0.16, h + 0.16, 0.0, y=-0.12, e=0.045, mat=neon, folga=0.02))
    for sx in (-1, 1):
        it.add(mb.caixa(0.12, 0.16, h * 0.5, x=sx * (w / 2 + 0.02), y=-0.08, z=h * 0.25, cor="metal_escuro",
                        bisel=0.02))
    it.anima(led, {"anima": "rolar", "velocidade": vel}, "led_rolante")


@peca("led_aberto_rolante", "Letreiro de LED correndo (Aberto, bem-vindo)", "led_vermelho", "parede", 2.6,
      tags=["led", "fachada", "loja", "animado"])
def _(it):
    led_caixa(it, "led_aberto", 3.0, 0.42, 1632, vel=0.1)


@peca("led_promocao_rolante", "Letreiro de LED colorido correndo (promoção de hoje)", "led_colorido", "parede", 3.2,
      tags=["led", "fachada", "loja", "animado"])
def _(it):
    led_caixa(it, "led_promocao", 5.4, 0.62, 2069, vel=0.07, cor="azul_noite", neon="neon_roxo")


@peca("faixa_bandeira_festa", "Faixa de bandeira ao vento (Festa na rua)", "faixa_bandeira", "parede", 3.4,
      tags=["faixa", "bandeira", "animado"])
def _(it):
    w, h = 3.4, 0.85
    yb = -0.55
    zt = h + 0.25
    for sx in (-1, 1):
        it.add(mb.caixa(0.14, 0.06, 0.32, x=sx * (w / 2 + 0.05), y=-0.03, z=zt - 0.16, cor="metal_escuro", bisel=0.02))
        it.add(mb.tubo([(sx * (w / 2 + 0.05), -0.04, zt), (sx * (w / 2 + 0.05), yb, zt)], 0.03, cor="metal_escuro"))
        it.add(mb.esfera(0.06, x=sx * (w / 2 + 0.12), y=yb, z=zt, cor="amarelo", seg=12))
    haste = mb.cilindro(0.035, w + 0.3, y=yb, z=zt, cor="ouro", eixo="x", seg=12)
    # pano ondulado: tira com seno em y ao longo de x, presa na haste
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    n = 24
    linhas = []
    for j in range(3):
        v = j / 2
        lin = []
        for i in range(n + 1):
            u = i / n
            x = -w / 2 + w * u
            amp = 0.07 + 0.08 * (1 - v)
            y = yb + amp * math.sin(u * math.pi * 3) + 0.02
            z = zt - 0.04 - h * (1 - v) - 0.06 * math.sin(u * math.pi * 3 + 1.2) * (1 - v)
            lin.append((bm.verts.new((x, y, z)), (u, v)))
        linhas.append(lin)
    for j in range(2):
        for i in range(n):
            a, b, c, d = linhas[j][i], linhas[j][i + 1], linhas[j + 1][i + 1], linhas[j + 1][i]
            for lado in (0, 1):
                vs = [a, b, c, d] if lado == 0 else [d, c, b, a]
                try:
                    f = bm.faces.new([q[0] for q in vs])
                except ValueError:
                    vs2 = [bm.verts.new(q[0].co) for q in vs]
                    f = bm.faces.new(vs2)
                for lo, q in zip(f.loops, vs):
                    lo[uvl].uv = q[1] if lado == 0 else (q[1][0], q[1][1])
    pano = obj("pano", bm, None, est("bandeira_festa", 0.8))
    it.anima([pano, haste], {"anima": "balancar", "angulo": 6, "periodo": 2.5, "eixo": "x"}, "bandeira",
             pivo=(0, yb, zt))


# ----------------------------------------------------------------------------------------------- painéis de fachada
def painel_fachada(it, nome, w, cor, borda=0.14, esp=0.18, spots=0):
    h = w * 9 / 16
    it.add(tela(est(nome), w, h, borda=borda, esp=esp, cor=cor, aro=0.06))
    if spots:
        it.add(marquise_luz(w + 2 * borda + 0.1, h + 2 * borda + 0.02, cor))
    return h


@peca("painel_parque_verde", "Painel de fachada (Parque verde)", "painel_parque", "parede", 3.0,
      tags=["painel", "fachada"])
def _(it):
    painel_fachada(it, "painel_parque", 4.0, "grafite_escuro", spots=2)


@peca("painel_estude_brilhe", "Painel de fachada (Estude e brilhe)", "painel_estudo", "parede", 3.0,
      tags=["painel", "fachada"])
def _(it):
    painel_fachada(it, "painel_estudo", 3.2, "azul_marinho", borda=0.16)


@peca("painel_recarga_rapida", "Painel de fachada (Recarga rápida)", "painel_recarga", "parede", 3.0,
      tags=["painel", "fachada"])
def _(it):
    h = painel_fachada(it, "painel_recarga", 3.6, "branco", borda=0.16)
    it.add(neon_contorno(3.6 + 0.32, h + 0.32, 0.0, y=-0.12, e=0.05, mat="neon", folga=0.04))


@peca("painel_energia_sol", "Painel de fachada (Energia do sol)", "painel_sol", "parede", 3.0,
      tags=["painel", "fachada"])
def _(it):
    painel_fachada(it, "painel_sol", 3.6, "ameixa", spots=2)


@peca("painel_lanche_fresco", "Painel de fachada (Lanche fresco)", "painel_lanche", "parede", 2.8,
      tags=["painel", "fachada", "loja"])
def _(it):
    painel_fachada(it, "painel_lanche", 3.2, "verde_floresta")


def esquina(it, nome_a, nome_b, w, cor, borda=0.14, esp=0.18):
    """Par de painéis dobrando a quina do prédio. A quina fica na origem: a fachada da frente é o plano y = 0 (x ≤ 0,
    olhando para −Y) e a lateral é o plano x = 0 (y ≥ 0, olhando para +X)."""
    h = w * 9 / 16
    W = w + 2 * borda
    a = tela(est(nome_a), w, h, x=-W / 2 - 0.01, borda=borda, esp=esp, cor=cor, aro=0.06)
    b = tela(est(nome_b), w, h, x=W / 2 + 0.01, borda=borda, esp=esp, cor=cor, aro=0.06)
    gira(b, 90)  # frente −Y → +X, e x ≥ 0 → y ≥ 0 (as costas no plano x = 0)
    e = esp + 0.06
    canto = mb.caixa(e, e, h + 2 * borda, x=e / 2, y=-e / 2, cor=cor, bisel=0.04)
    it.add(a, b, canto)


@peca("painel_esquina_lago", "Par de painéis de esquina (lago e flores)", "painel_esquina_parque", "parede", 3.0,
      tags=["painel", "fachada", "esquina"])
def _(it):
    esquina(it, "painel_lago", "painel_flores", 3.2, "azul_marinho")


@peca("painel_esquina_cinema", "Par de painéis de esquina (cinema e estreia)", "painel_esquina_cinema", "parede", 3.2,
      tags=["painel", "fachada", "esquina", "cinema"])
def _(it):
    esquina(it, "painel_cinema", "painel_estreia", 3.4, "vinho")


# ----------------------------------------------------------------------------------------------- verticais 1:2
def vertical_chao(it, mat, w=1.0, h=2.0, z0=0.35, cor="grafite_escuro", uv=UV1, separa=False, verso="cinza_claro"):
    for sx in (-1, 1):
        it.add(pe_placa(sx * (w / 2 + 0.02), z0 + 0.3, y=-0.1, cor=cor, r=0.045))
    r = tela(mat, w, h, z0=z0, borda=0.08, esp=0.12, cor=cor, aro=0.04, y0=-0.04, uv=uv, separa=separa)
    it.add(mb.caixa(w + 0.12, 0.04, h + 0.12, y=-0.02, z=z0 + 0.02, cor=verso, bisel=0.015))
    it.colisao([((0, -0.1, 0), (w + 0.4, 0.5, z0 + h + 0.16))])
    if not separa:
        it.add(r)
    return r


def vertical_parede(it, nome, w=1.2, h=2.4, cor="grafite_escuro"):
    it.add(tela(est(nome), w, h, borda=0.09, esp=0.12, cor=cor, aro=0.04))


@peca("vertical_foguete_voe", "Painel vertical de chão (foguete, voe)", "vertical_foguete", tags=["painel", "calcada"])
def _(it):
    vertical_chao(it, est("vertical_foguete"))


@peca("vertical_banco_verde", "Painel vertical de parede (banco verde)", "vertical_banco", "parede", 1.2,
      tags=["painel", "fachada"])
def _(it):
    vertical_parede(it, "vertical_banco", cor="verde_floresta")


@peca("vertical_sua_saude", "Painel vertical de parede (sua saúde)", "vertical_saude", "parede", 1.0,
      tags=["painel", "fachada", "farmacia"])
def _(it):
    vertical_parede(it, "vertical_saude", 1.0, 2.0, cor="branco")
    it.add(mb.caixa(0.5, 0.14, 0.5, x=0, y=-0.07, z=2.3, cor="branco", bisel=0.05))
    it.add(mb.caixa(0.36, 0.03, 0.1, y=-0.15, z=2.5, cor=None, mat="neon", bisel=0.01))
    it.add(mb.caixa(0.1, 0.03, 0.36, y=-0.152, z=2.37, cor=None, mat="neon", bisel=0.01))


@peca("vertical_fique_conectado", "Painel vertical de chão (fique conectado)", "vertical_conectado",
      tags=["painel", "calcada"])
def _(it):
    vertical_chao(it, est("vertical_conectado"), cor="roxo_escuro")


@peca("vertical_show_drones", "Painel vertical de chão que troca de imagem (show de drones)", "vertical_drones",
      tags=["painel", "calcada", "animado"])
def _(it):
    moldura, tl = vertical_chao(it, est("vertical_drones"), cor="azul_noite", uv=uv_quadro(3), separa=True)
    it.add(moldura)
    it.anima(tl, {"anima": "trocar", "quadros": 3, "periodo": 2.5}, "tela_troca")


@peca("vertical_lixo_zero", "Painel vertical de parede (lixo zero)", "vertical_lixo", "parede", 1.2,
      tags=["painel", "fachada"])
def _(it):
    vertical_parede(it, "vertical_lixo", cor="verde_floresta")


@peca("vertical_pedale_mais", "Totem de calçada com base (pedale mais)", "vertical_bike", tags=["painel", "calcada"])
def _(it):
    w, h, z0 = 1.0, 2.0, 0.55
    it.add(mb.caixa(1.3, 0.7, 0.18, cor="azul_escuro", bisel=0.06))
    it.add(mb.caixa(0.2, 0.2, z0 + 0.1, z=0.1, cor="azul_escuro", bisel=0.04))
    frente = tela(est("vertical_bike"), w, h, z0=z0, borda=0.08, esp=0.1, cor="azul_escuro", aro=0.04, y0=0.0)
    verso = tela(est("vertical_bike"), w, h, z0=z0, borda=0.08, esp=0.1, cor="azul_escuro", aro=0.04, y0=0.0)
    gira(verso, 180)
    it.add(frente, verso)
    it.colisao([((0, 0, 0), (1.3, 0.7, 0.2)), ((0, 0, 0.2), (w + 0.2, 0.32, z0 + h - 0.04))])


# ----------------------------------------------------------------------------------------------- totens altos
def totem(it, nome, cor, w=3.0, h=8.0, extra=None):
    it.add(tela(est(nome), w, h, borda=0.2, esp=0.3, cor=cor, aro=0.08))
    return w, h


@peca("totem_universidade", "Totem alto de fachada (universidade)", "totem_universidade", "parede", 4.4,
      tags=["totem", "fachada"])
def _(it):
    w, h = totem(it, "totem_universidade", "azul_marinho")
    it.add(mb.caixa(w + 0.8, 0.7, 0.3, y=-0.35, z=h + 0.4, cor="branco", bisel=0.08))
    it.add(mb.caixa(w + 0.6, 0.6, 0.18, y=-0.3, z=-0.12, cor="branco", bisel=0.06))
    for x in (-1.0, 0.0, 1.0):
        it.add(refletor(x, -0.38, -0.1, alvo_z=h * 0.4, braco=0.5, cor="azul_marinho", acima=False))


@peca("totem_laboratorio_mente", "Totem alto de fachada (laboratório da mente)", "totem_laboratorio", "parede", 4.4,
      tags=["totem", "fachada"])
def _(it):
    w, h = totem(it, "totem_laboratorio", "petroleo")
    for sx in (-1, 1):
        it.add(mb.caixa(0.08, 0.08, h + 0.3, x=sx * (w / 2 + 0.26), y=-0.2, z=0.05, cor=None, mat="neon", bisel=0.03))
        it.add(mb.caixa(0.16, 0.24, h + 0.5, x=sx * (w / 2 + 0.26), y=-0.12, z=-0.05, cor="grafite_escuro",
                        bisel=0.05))


@peca("totem_refri_gelado", "Totem alto de fachada (refri gelado)", "totem_refri", "parede", 4.4,
      tags=["totem", "fachada", "loja"])
def _(it):
    w, h = totem(it, "totem_refri", "magenta")
    it.add(neon_contorno(w + 0.4, h + 0.4, 0.0, y=-0.22, e=0.08, mat="neon_rosa", folga=0.08))


@peca("totem_carro_voador", "Totem alto de fachada (o futuro chegou)", "totem_carro_voador", "parede", 4.4,
      tags=["totem", "fachada"])
def _(it):
    w, h = totem(it, "totem_carro_voador", "branco")
    it.add(neon_contorno(w + 0.4, h + 0.4, 0.0, y=-0.22, e=0.07, mat="neon", folga=0.08))
    it.add(mb.caixa(w + 0.2, 0.5, 0.4, y=-0.25, z=h + 0.4, cor="branco", bisel=0.15))
    it.add(mb.caixa(w - 0.2, 0.04, 0.12, y=-0.51, z=h + 0.54, cor=None, mat="neon", bisel=0.02))


# ----------------------------------------------------------------------------------------------- placas
@peca("placa_energia_gota", "Placa quadrada luminosa (energia)", "placa_gota", "parede", 2.4,
      tags=["placa", "fachada"])
def _(it):
    it.add(tela(est("placa_gota", 1.4), 1.0, 1.0, borda=0.08, esp=0.16, cor="grafite_escuro", aro=0.04))
    it.add(neon_contorno(1.16, 1.16, 0.0, y=-0.2, e=0.045, mat="neon_roxo", folga=0.03))


@peca("cavalete_desfile_neon", "Painel de cavalete neon (desfile neon sexta)", "cavalete_neon",
      tags=["placa", "calcada", "neon", "animado"])
def _(it):
    w, h, z0 = 2.4, 1.2, 1.0
    for sx in (-1, 1):
        x = sx * (w / 2 - 0.15)
        it.add(mb.tubo([(x - sx * 0.05, -0.35, 0.0), (x, -0.06, z0 + 0.4)], 0.035, cor="grafite"))
        it.add(mb.tubo([(x - sx * 0.05, 0.3, 0.0), (x, -0.02, z0 + 0.4)], 0.035, cor="grafite"))
        for yy in (-0.35, 0.3):
            it.add(mb.esfera(0.05, x=x - sx * 0.05, y=yy, z=0.04, cor="borracha", seg=10, esc=(1, 1, 0.8)))
    it.add(tela(est("placa_desfile", 1.5), w, h, z0=z0, borda=0.07, esp=0.1, cor="roxo_escuro", aro=0.03, y0=0.0))
    it.add(mb.caixa(w + 0.14, 0.04, h + 0.14, y=0.02, z=z0, cor="ameixa", bisel=0.015))
    tubos = neon_contorno(w + 0.14, h + 0.14, z0, y=-0.13, e=0.04, mat="neon_rosa", folga=0.03)
    tubos += neon_contorno(w + 0.14, h + 0.14, z0, y=-0.13, e=0.03, mat="neon", folga=0.09)
    it.anima(tubos, {"anima": "piscar", "periodo": 1.2}, "neon_pisca")
    it.colisao([((0, -0.02, 0), (w + 0.2, 0.75, z0 + h + 0.25))])


@peca("avisos_pilha", "Pilha de cinco telinhas de aviso", "avisos", "parede", 1.4, tags=["placa", "interno"])
def _(it):
    w, h, gap = 0.62, 0.31, 0.06
    mat = est("avisos", 1.0)
    it.add(mb.caixa(0.1, 0.05, 5 * (h + gap) + 0.1, y=-0.025, z=-0.05, cor="metal_escuro", bisel=0.015))
    for k in range(5):
        z = (4 - k) * (h + gap)
        v0, v1 = 1 - (k + 1) / 5, 1 - k / 5
        it.add(mb.caixa(w + 0.06, 0.07, h + 0.06, y=-0.085, z=z - 0.03, cor="grafite_escuro", bisel=0.02))
        it.add(quad_uv(f"aviso_{k}", (0, -0.124, z + h / 2), (1, 0, 0), (0, 0, 1), w, h, mat,
                       ((0, v0), (1, v0), (1, v1), (0, v1))))


@peca("bandeirola_roxa", "Bandeirola roxa em braço de parede", "bandeirola", "parede", 2.8,
      tags=["placa", "bandeira", "animado"])
def _(it):
    L, w, h = 0.9, 0.55, 1.5
    zt = h + 0.15
    it.add(mb.caixa(0.12, 0.05, 0.4, y=-0.025, z=zt - 0.2, cor="metal_escuro", bisel=0.02))
    it.add(mb.tubo([(0, -0.04, zt), (0, -L, zt)], 0.03, cor="metal_escuro"))
    it.add(mb.tubo([(0, -0.04, zt - 0.32), (0, -L * 0.6, zt - 0.02)], 0.02, cor="metal_escuro"))
    it.add(mb.esfera(0.05, y=-L - 0.04, z=zt, cor="amarelo", seg=12))
    # pano perpendicular à parede (plano YZ), com a ponta em V embaixo, desenho dos dois lados
    yc = -0.12 - w / 2 - 0.08
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    contorno = [(0, 0), (1, 0), (1, 1), (0.5, 0.86), (0, 1)]  # (u, desce) — a ponta do V sobe no meio
    for lado in (1, -1):
        vs = []
        for u, dz in contorno:
            vs.append(bm.verts.new((lado * 0.003, yc + (u - 0.5) * w * lado, zt - 0.05 - dz * h)))
        f = bm.faces.new(vs)
        for lo, (u, dz) in zip(f.loops, contorno):
            lo[uvl].uv = (u, 1 - dz)
        vira_para(f, (lado, 0, 0))
    pano = obj("pano", bm, None, est("bandeirola", 0.8))
    argolas = [mb.cilindro(0.04, 0.02, y=yc + s * w * 0.35, z=zt, cor="ouro", eixo="x", seg=10) for s in (-1, 1)]
    it.anima([pano] + argolas, {"anima": "balancar", "angulo": 8, "periodo": 2.2, "eixo": "z"}, "bandeirola",
             pivo=(0, yc, zt))


@peca("placa_wifi_redonda", "Placa redonda de wi-fi em braço de parede", "placa_wifi", "parede", 2.6,
      tags=["placa", "loja"])
def _(it):
    r = 0.4
    zc = r + 0.05
    it.add(mb.caixa(0.12, 0.05, 0.3, y=-0.025, z=zc + r - 0.1, cor="grafite", bisel=0.02))
    it.add(mb.tubo([(0, -0.04, zc + r + 0.05), (0, -0.2 - 2 * r, zc + r + 0.05)], 0.025, cor="grafite"))
    yc = -0.2 - r
    for s in (-1, 1):
        it.add(mb.tubo([(0, yc + s * r * 0.5, zc + r + 0.05), (0, yc + s * r * 0.5, zc + r * 0.86)], 0.012,
                       cor="grafite"))
    disco = mb.cilindro(r + 0.03, 0.06, x=0, y=yc, z=zc, cor="vermelho_escuro", eixo="x", seg=40, bisel=0.02)
    it.add(disco)
    mat = est("placa_wifi", 1.0)
    for lado in (1, -1):
        bm = bmesh.new()
        uvl = bm.loops.layers.uv.new("UVMap")
        n = 40
        vs, uvs = [], []
        for k in range(n):
            a = 2 * math.pi * k / n
            u, v = 0.5 + 0.5 * math.cos(a), 0.5 + 0.5 * math.sin(a)
            vs.append(bm.verts.new((lado * 0.033, yc + lado * (u - 0.5) * 2 * r, zc + (v - 0.5) * 2 * r)))
            uvs.append((u, v))
        f = bm.faces.new(vs)
        for lo, q in zip(f.loops, uvs):
            lo[uvl].uv = q
        vira_para(f, (lado, 0, 0))
        it.add(obj("wifi", bm, None, mat))


@peca("totem_mapa_calcada", "Totem estreito de calçada com mapa", "totem_mapa", tags=["placa", "calcada", "mapa"])
def _(it):
    w, h, z0 = 0.6, 1.8, 0.12
    it.add(mb.caixa(w + 0.2, 0.42, 0.12, cor="grafite", bisel=0.04))
    it.add(mb.caixa(w + 0.06, 0.3, h + 0.1, z=0.1, cor="azul_escuro", bisel=0.05))
    it.add(quad_uv("mapa", (0, -0.154, z0 + h / 2 + 0.04), (1, 0, 0), (0, 0, 1), w - 0.04, h - 0.08,
                   est("totem_mapa", 0.8)))
    it.add(quad_uv("mapa_v", (0, 0.154, z0 + h / 2 + 0.04), (-1, 0, 0), (0, 0, 1), w - 0.04, h - 0.08,
                   est("totem_mapa", 0.8)))
    it.add(mb.caixa(w + 0.16, 0.38, 0.1, z=h + 0.18, cor="azul_escuro", bisel=0.04))
    it.add(mb.caixa(w - 0.1, 0.32, 0.03, z=h + 0.15, cor=None, mat="luz", bisel=0.01))
    it.colisao([((0, 0, 0), (w + 0.2, 0.42, h + 0.28))])


@peca("placa_poste_cafe", "Placa vertical em braço de poste (café)", "placa_poste", tags=["placa", "poste", "loja"])
def _(it):
    hp = 3.6
    it.add(mb.cilindro(0.26, 0.2, cor="grafite", seg=20, bisel=0.03))
    it.add(mb.cilindro(0.07, hp, cor="grafite", seg=16))
    it.add(mb.esfera(0.1, z=hp, cor="grafite", seg=14))
    it.add(mb.tubo([(0, 0, hp - 0.25), (0.95, 0, hp - 0.25)], 0.035, cor="grafite"))
    it.add(mb.tubo([(0, 0, hp - 0.75), (0.5, 0, hp - 0.27)], 0.025, cor="grafite"))
    w, h = 0.5, 1.25
    xc = 0.62
    zt = hp - 0.35
    for s in (-1, 1):
        it.add(mb.tubo([(xc + s * 0.18, 0, hp - 0.25), (xc + s * 0.18, 0, zt)], 0.012, cor="grafite"))
    it.add(mb.caixa(w + 0.08, 0.08, h + 0.08, x=xc, z=zt - h - 0.08, cor="madeira_escura", bisel=0.025))
    mat = est("placa_cafe", 0.7)
    it.add(quad_uv("cafe", (xc, -0.044, zt - 0.04 - h / 2), (1, 0, 0), (0, 0, 1), w, h, mat))
    it.add(quad_uv("cafe_v", (xc, 0.044, zt - 0.04 - h / 2), (-1, 0, 0), (0, 0, 1), w, h, mat))
    it.colisao([((0, 0, 0), (0.52, 0.52, hp))])


@peca("fliperama_corrida", "Fliperama com tela de corrida que troca", "fliperama", tags=["placa", "jogo", "animado"])
def _(it):
    L = 0.8
    perfil = [(-0.38, 0.0), (0.36, 0.0), (0.36, 1.86), (-0.28, 1.86), (-0.28, 1.56), (-0.04, 1.5), (-0.14, 0.98),
              (-0.44, 0.9), (-0.44, 0.78), (-0.38, 0.74)]
    corpo = mb.extrudado(perfil, L, x=-L / 2, cor="roxo", bisel=0.025, plano="yz")
    it.add(corpo)
    for sx in (-1, 1):  # laterais com faixa
        it.add(mb.caixa(0.03, 0.5, 1.2, x=sx * (L / 2 + 0.005), y=0.0, z=0.3, cor="amarelo", bisel=0.01))
    a, b = V((0, -0.14, 0.98)), V((0, -0.04, 1.5))
    v = (b - a).normalized()
    n = V((1, 0, 0)).cross(v)
    c = (a + b) / 2 + n * 0.004
    tl = quad_uv("tela", c, (1, 0, 0), v, L - 0.14, (b - a).length - 0.06, est("tela_fliperama", 1.2), uv_quadro(3))
    it.add(mb.caixa(L - 0.04, 0.02, 0.24, y=-0.29, z=1.6, cor=None, mat="neon_rosa", bisel=0.01))
    it.add(mb.caixa(L + 0.04, 0.12, 0.04, y=-0.25, z=1.85, cor="roxo_escuro", bisel=0.015))
    it.add(mb.cilindro(0.015, 0.1, x=-0.18, y=-0.32, z=0.9, cor="preto", seg=8))
    it.add(mb.esfera(0.04, x=-0.18, y=-0.32, z=1.0, cor="vermelho", seg=12))
    for k, cor in enumerate(("amarelo", "azul_celeste", "verde")):
        it.add(mb.cilindro(0.03, 0.02, x=0.04 + k * 0.1, y=-0.3, z=0.9, cor=cor, seg=12, bisel=0.005))
    it.anima(tl, {"anima": "trocar", "quadros": 3, "periodo": 0.6}, "tela_troca")
    it.colisao([((0, -0.04, 0), (L, 0.82, 1.86))])


@peca("painel_maquina_lanche", "Painel de máquina de lanche", "maquina_lanche", "parede", 0.4,
      tags=["placa", "loja"])
def _(it):
    it.add(tela(est("maquina_lanche", 0.9), 0.9, 1.35, borda=0.1, esp=0.16, cor="vermelho_escuro", aro=0.05))
    it.add(mb.caixa(0.5, 0.12, 0.22, y=-0.2, z=-0.24, cor="grafite", bisel=0.03))
    it.add(mb.caixa(0.36, 0.02, 0.06, y=-0.26, z=-0.12, cor="preto", bisel=0.005))


@peca("placa_giratoria_pizza", "Placa redonda giratória em poste (pizza)", "placa_giratoria",
      tags=["placa", "poste", "loja", "animado"])
def _(it):
    hp, r = 2.6, 0.5
    it.add(mb.cilindro(0.3, 0.12, cor="verde_floresta", seg=24, bisel=0.03))
    it.add(mb.cilindro(0.05, hp, cor="metal_claro", seg=14))
    zc = hp + r + 0.05
    aro = mb.torno([(r + 0.02, -0.05), (r + 0.06, -0.03), (r + 0.06, 0.03), (r + 0.02, 0.05)], cor="verde_floresta",
                   seg=48)
    mb.transforma(aro, rot=("X", 90))
    fundo = mb.cilindro(r + 0.03, 0.06, eixo="y", cor="branco", seg=48, bisel=0.01)
    mat = est("placa_pizza", 0.9)
    faces = []
    for lado in (1, -1):
        bm = bmesh.new()
        uvl = bm.loops.layers.uv.new("UVMap")
        vs, uvs = [], []
        for k in range(40):
            a = 2 * math.pi * k / 40
            u, v = 0.5 + 0.5 * math.cos(a), 0.5 + 0.5 * math.sin(a)
            vs.append(bm.verts.new((lado * (u - 0.5) * 2 * r, -lado * 0.034, (v - 0.5) * 2 * r)))
            uvs.append((u, v))
        f = bm.faces.new(vs)
        for lo, q in zip(f.loops, uvs):
            lo[uvl].uv = q
        vira_para(f, (0, -lado, 0))
        faces.append(obj("pizza", bm, None, mat))
    topo = mb.esfera(0.06, z=r + 0.08, cor="vermelho", seg=12)
    eixo = mb.cilindro(0.025, 0.15, z=-r - 0.12, cor="metal", seg=10)
    partes = [aro, fundo, topo, eixo] + faces
    for p_ in partes:
        mb.transforma(p_, loc=(0, 0, zc))
    it.anima(partes, {"anima": "girar", "eixo": "y", "velocidade": 40}, "placa_gira", pivo=(0, 0, zc))
    it.colisao([((0, 0, 0), (0.6, 0.6, 0.12)), ((0, 0, 0), (0.14, 0.14, hp + 2 * r + 0.2))])


@peca("placa_aberto_neon", "Placa de neon que pisca (aberto)", "placa_aberto", "parede", 2.4,
      tags=["placa", "loja", "neon", "animado"])
def _(it):
    w, h = 1.1, 1.1 * 192 / 512
    it.add(mb.caixa(w + 0.1, 0.05, h + 0.1, y=-0.025, cor="preto", bisel=0.02))
    for sx in (-1, 1):
        it.add(mb.cilindro(0.02, 0.1, x=sx * (w / 2 - 0.06), y=-0.05, z=h + 0.04, cor="metal", eixo="y", seg=8))
    tl = quad_uv("aberto", (0, -0.056, 0.05 + h / 2), (1, 0, 0), (0, 0, 1), w, h, est("placa_aberto", 1.6))
    tubos = neon_contorno(w - 0.06, h - 0.06, 0.08, y=-0.07, e=0.025, mat="neon_rosa")
    it.anima([tl] + tubos, {"anima": "piscar", "periodo": 1.6}, "neon_pisca")


@peca("relogio_digital", "Relógio digital de fachada (hora, temperatura, bom dia)", "relogio", "parede", 3.0,
      tags=["placa", "led", "animado"])
def _(it):
    w, h = 1.4, 0.7
    moldura, tl = tela(est("relogio_digital", 1.5), w, h, borda=0.08, esp=0.14, cor="grafite_escuro", aro=0.04,
                       uv=uv_quadro(3), separa=True)
    it.add(moldura)
    it.add(mb.caixa(0.2, 0.3, 0.12, y=-0.15, z=h + 0.16, cor="grafite", bisel=0.03))
    it.anima(tl, {"anima": "trocar", "quadros": 3, "periodo": 4}, "tela_troca")


# ----------------------------------------------------------------------------------------------- letreiros de letras
@peca("letreiro_brilhe_telhado", "Letreiro de letras soltas de telhado (BRILHE)", "letreiro_brilhe",
      tags=["letreiro", "telhado"])
def _(it):
    alt, prof = 1.6, 0.3
    letras = letras_contorno("BRILHE", alt, prof, "branco", "amarelo", mat_frente="luz")
    for o in letras:
        mb.transforma(o, loc=(0, 0, 0.55))
    it.add(letras)
    lo, hi = mb.bbox(letras)
    L = hi.x - lo.x
    for z in (0.95, 1.85):
        it.add(mb.tubo([(lo.x + 0.2, 0.15, z), (hi.x - 0.2, 0.15, z)], 0.05, cor="metal_escuro"))
    n = max(3, int(L / 1.6) + 1)
    for k in range(n):
        x = lo.x + 0.3 + (L - 0.6) * k / (n - 1)
        it.add(mb.caixa(0.1, 0.1, 2.0, x=x, y=0.15, z=0.25, cor="metal_escuro", bisel=0.02))
        it.add(mb.tubo([(x, 0.15, 1.6), (x, 1.0, 0.3)], 0.04, cor="metal_escuro"))
    it.add(mb.caixa(L, 0.4, 0.25, y=0.15, cor="concreto_escuro", bisel=0.05))
    it.add(mb.caixa(L * 0.9, 0.4, 0.3, y=1.0, cor="concreto_escuro", bisel=0.05))
    it.colisao([((0, 0.4, 0), (L, 1.4, 0.3)), ((0, -0.05, 0.3), (L, 0.6, alt + 0.6))])


@peca("letreiro_sorria_telhado", "Letreiro de letras soltas de telhado (SORRIA)", "letreiro_sorria",
      tags=["letreiro", "telhado", "neon"])
def _(it):
    alt, prof = 1.4, 0.28
    letras = letras_contorno("SORRIA", alt, prof, "preto", None, mat_contorno="neon_rosa", gordura=0.06)
    for o in letras:
        mb.transforma(o, loc=(0, 0, 0.5))
    it.add(letras)
    lo, hi = mb.bbox(letras)
    L = hi.x - lo.x
    it.add(mb.caixa(L + 0.4, 0.5, 0.3, y=0.05, cor="grafite", bisel=0.06))
    it.add(mb.caixa(L + 0.2, 0.06, 0.06, y=-0.22, z=0.32, cor="amarelo", bisel=0.02))
    for k in range(3):
        x = lo.x + 0.6 + (L - 1.2) * k / 2
        it.add(refletor(x, -0.2, 0.3, alvo_z=1.2, braco=0.6, acima=False))
    it.colisao([((0, 0.05, 0), (L + 0.4, 0.7, alt + 0.6))])


@peca("letreiro_mexa_se_fachada", "Letreiro de letras soltas de fachada (MEXA-SE)", "letreiro_mexa_se", "parede",
      3.6, tags=["letreiro", "fachada", "academia"])
def _(it):
    alt, prof = 0.9, 0.16
    letras = letras_contorno("MEXA-SE", alt, prof, "branco", "amarelo", mat_frente="luz", gordura=0.08)
    for o in letras:
        mb.transforma(o, loc=(0, -0.12, 0.1))
    it.add(letras)
    lo, hi = mb.bbox(letras)
    for k in range(7):
        x = lo.x + 0.3 + (hi.x - lo.x - 0.6) * k / 6
        it.add(mb.cilindro(0.02, 0.14, x=x, y=-0.07, z=0.1 + alt * 0.5, cor="metal", eixo="y", seg=8))


@peca("letreiro_cinema_lampadas", "Letreiro de cinema com lâmpadas que piscam", "letreiro_cinema", "parede", 4.2,
      tags=["letreiro", "fachada", "cinema", "animado"])
def _(it):
    W, H = 4.4, 1.3
    it.add(mb.caixa(W, 0.22, H, y=-0.11, cor="vermelho_escuro", bisel=0.08))
    it.add(mb.caixa(W - 0.3, 0.06, H - 0.3, y=-0.24, z=0.15, cor="amarelo", bisel=0.04))
    letras = letras_contorno("CINEMA", 0.72, 0.1, "vermelho", "branco", gordura=0.06)
    for o in letras:
        mb.transforma(o, loc=(0, -0.26, 0.29))
    it.add(letras)
    bulbos = []
    n_x, n_z = 15, 4
    for k in range(n_x):
        x = -W / 2 + 0.16 + (W - 0.32) * k / (n_x - 1)
        for z in (0.08, H - 0.08):
            bulbos.append(lampada(x, -0.22, z))
    for k in range(1, n_z):
        z = 0.08 + (H - 0.16) * k / n_z
        for x in (-W / 2 + 0.08, W / 2 - 0.08):
            bulbos.append(lampada(x, -0.22, z))
    it.anima(bulbos, {"anima": "piscar", "periodo": 0.8}, "lampadas")


# ======================================================================================================================
def exporta(cat, it, rotulo, grupo, fixacao, alt, tags):
    anims = it.lista_animacoes()
    extra = {"animacoes": anims} if anims else {}
    if "esquina" in tags:
        extra["quina"] = [0.0, 0.0, 0.0]  # a origem é a quina do prédio (frente −Y em x ≤ 0, lateral +X em y ≥ 0)
    extra = extra or None
    mini = MINI.get(it.id) or (MINI_FRENTE if fixacao == "parede" else (0.5, -1.0, 0.42))
    e = cat.exporta(it, rotulo, grupo=grupo, fixacao=fixacao, altura_instalacao=alt, tags=tags, miniatura_dir=mini,
                    extra=extra)
    if fixacao == "parede":
        e["colisao"] = []  # placas de parede não colidem (a Catalogo põe a caixa automática quando a lista é vazia)
    if "letreiro" in tags or "totem" in tags or "outdoor" in tags:
        e["tags"] = sorted(set(e["tags"]) | {"sinalizacao"})
    cat.salva()


def main():
    global EST_DIR
    argv = sys.argv[sys.argv.index("--") + 1:]
    saida, filtro = argv[0], argv[1:]
    EST_DIR = os.path.join(saida, CAT, "estampas")
    cat = mb.Catalogo(CAT, saida, rotulo="Sinalização")
    ids = [p[0] for p in P]
    assert len(ids) == len(set(ids)), "ids repetidos"
    for id_, rotulo, grupo, fixacao, alt, tags, f in P:
        if filtro and id_ not in filtro and grupo not in filtro:
            continue
        mb.limpa()
        it = ItemS(id_)
        f(it)
        exporta(cat, it, rotulo, grupo, fixacao, alt, tags)
    validos = set(ids)
    cat.dados["itens"] = [x for x in cat.dados["itens"] if x["id"] in validos or x["id"].endswith("_pacote")]  # as peças de pacote (id terminado em _pacote) vêm de outro gerador e ficam
    cat.dados["itens"].sort(key=lambda x: ids.index(x["id"]))
    cat.salva()
    print("pecas", len(cat.dados["itens"]), flush=True)


if __name__ == "__main__":
    main()
