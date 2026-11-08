"""Cidade do Morada: utilitários e transporte sobre trilhos — categoria "utilitarios".

Uso:
  python3 -I morada-art/utilitarios_estampas.py SP/cidade_out                       (uma vez: desenha os PNG)
  MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/cidade_utilitarios.py -- SP/cidade_out [ids|grupos...]

Convenções (GUIA_CIDADE, GUIA_PREDIOS, GUIA_TRANSPORTE):
- metros, Z para cima, frente para −Y. Origem no centro, embaixo: as rodas tocam z = 0. Na rua, o veículo vai em
  z = −0,10 (o asfalto); no trilho de trem, em z = 0,31 (topo do boleto); no bonde, em z = −0,094 (trilho embutido no
  asfalto); no trem do tubo, em z = 7,76 (topo do trilho sobre o tabuleiro). O catálogo grava isso em extra["trilho"].
- Rodas: filhos "roda_<n>" com a origem no eixo e extras glTF
    {"anima": "girar", "eixo": "x", "velocidade": 240, "roda": 1, "raio": r}
  (graus por segundo no eixo X do glTF; positivo = rodando para a frente). A mesma lista vai em extra["animacoes"]
  com "nome" e "pivo" (glTF).
- Sirenes e giroflex: filhos "sirene_<cor>" com {"anima": "piscar", "periodo": 0.8} (e "fase" em segundos no segundo
  filho, para alternar azul e vermelho; sem "fase" os dois piscam juntos).
- Portas: Item.porta (motorista e passageiro, traseira das vans e da ambulância, caçamba, tampa do porta-malas,
  porta do ônibus, escada dos bombeiros, toldo do food truck) e Item.correr (porta lateral de correr da kombi, do
  furgão, dos vagões e do bonde). Atrás de cada porta há um painel escuro (o vão), visível só com ela aberta.
- Assentos: Item.slot "assento_motorista", "assento_1"... (0,5 × 0,5 × 0,9 m), no assento.
- Noite: faróis com "luz", lanternas com "luz_vermelha", sirenes "luz_azul"/"luz_vermelha"; vidros de carro, van e
  caminhão com "janela_apagada"; janelas de ônibus, trem e bonde com a mistura janela/janela_fria/janela_apagada;
  letreiros de destino com estampa emissiva.
- Trens: engates em extra["engate"] = [distância da origem até a face do engate da frente, idem atrás], em metros
  ao longo do eixo do veículo (frente positiva). Locomotiva + vagões encostam engate com engate.
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

V = Vector
CAT = "utilitarios"
EST_DIR = ""

# trilhos (cidade_ferrovia_pontes.py)
X_TR = 0.835          # centro do boleto: bitola de 1,60 m entre as faces internas
Z_TREM = 0.31         # topo do boleto do trilho de trem no chão (trilho_reto, plataforma_estacao)
Z_PLAT = 1.35         # piso da plataforma (1,04 acima do trilho)
X_PLAT = 1.72         # borda da plataforma (a partir do eixo da via)
Z_BONDE = -0.094      # topo do trilho de bonde embutido no asfalto (bonde_rua, bonde_grama)
X_BONDE = 1.825       # eixo de cada faixa com trilho de bonde
Z_TUBO = 7.76         # topo do trilho do trem do tubo (tabuleiro em 7,50 + dormente 0,12 + boleto 0,14)
R_TUBO = 2.63         # raio interno do tubo de vidro, centro em z = 8,00 (0,24 acima do trilho)
Z_RUA = -0.10         # asfalto

MAT_VIDRO_CARRO = "janela_apagada"


# ======================================================================================================================
# Item com filhos animados
# ======================================================================================================================
class ItemV(mb.Item):
    def __init__(self, id_):
        super().__init__(id_)
        self.animados = []
        self.extra = {}
        self._n = {}

    def nome(self, base):
        self._n[base] = self._n.get(base, 0) + 1
        return f"{base}_{self._n[base]}"

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

    def assento(self, nome, x, y, z):
        self.slot(nome, (x, y, z), (0.5, 0.5, 0.9))


# ======================================================================================================================
# Primitivas próprias
# ======================================================================================================================
def contorno(poly, n=5):
    """poly: [(y, z, raio)] fechado → pontos 2D com os cantos arredondados (Bézier quadrática tangente)."""
    pts = []
    m = len(poly)
    for i in range(m):
        a = V(poly[i - 1][:2])
        b = V(poly[i][:2])
        c = V(poly[(i + 1) % m][:2])
        r = poly[i][2] if len(poly[i]) > 2 else 0.0
        d1, d2 = a - b, c - b
        if r <= 0 or d1.length < 1e-6 or d2.length < 1e-6:
            pts.append(b)
            continue
        rr = min(r, d1.length * 0.48, d2.length * 0.48)
        p1, p2 = b + d1.normalized() * rr, b + d2.normalized() * rr
        k_n = max(2, int(n * min(1.0, rr / 0.15) + 0.5))
        for k in range(k_n + 1):
            t = k / k_n
            pts.append((1 - t) ** 2 * p1 + 2 * (1 - t) * t * b + t ** 2 * p2)
    out = []
    for p in pts:
        if not out or (p - out[-1]).length > 1e-4:
            out.append(p)
    if (out[0] - out[-1]).length < 1e-4:
        out.pop()
    return [(p.x, p.y) for p in out]


def arco_roda(yw, zc, ra, zb, n=10):
    """Trecho do contorno (de frente para trás, pela parte de baixo) que contorna a roda: desce até zb nas pontas."""
    pts = [(yw - ra, zb, 0.04)]
    for k in range(n + 1):
        a = math.radians(180 - 180 * k / n)
        pts.append((yw + ra * math.cos(a), zc + ra * math.sin(a), 0))
    pts.append((yw + ra, zb, 0.04))
    return pts


def lataria(poly, W, cor, bisel=0.08, x=0.0, n=5, seg=3, nome="lataria", mat="atlas"):
    """Extrusão do perfil lateral (y, z) na largura W (em X), centrada em x, com as arestas boleadas."""
    pts = mb._ccw(contorno(poly, n))
    return mb.extrudado(pts, W, x=x - W / 2, plano="yz", cor=cor, bisel=bisel, seg=seg, nome=nome, mat=mat)


def planta(poly, z0, z1, cor, bisel=0.05, n=5, seg=2, nome="planta", mat="atlas"):
    """Extrusão de um contorno em planta (x, y) de z0 a z1."""
    pts = mb._ccw(contorno(poly, n))
    return mb.extrudado(pts, z1 - z0, z=z0, cor=cor, bisel=bisel, seg=seg, nome=nome, mat=mat)


def varre(pts, secao, cor="branco", mat="atlas", tampas=True, angulo=50, nome="varre", n0=None):
    """Varre uma seção 2D fechada [(u, v)] ao longo de uma linha 3D (quadros por transporte paralelo)."""
    pts = [V(p) for p in pts]
    n = len(pts)
    T = []
    for i in range(n):
        a, b = pts[max(0, i - 1)], pts[min(n - 1, i + 1)]
        T.append((b - a).normalized())
    if n0 is None:
        n0 = V((0, 0, 1)).cross(T[0])
        if n0.length < 1e-6:
            n0 = V((0, 1, 0))
    n0 = V(n0)
    N = [(n0 - T[0] * n0.dot(T[0])).normalized()]
    for i in range(1, n):
        q = T[i - 1].rotation_difference(T[i])
        v = q @ N[-1]
        N.append((v - T[i] * v.dot(T[i])).normalized())
    bm = bmesh.new()
    aneis = []
    for i, p in enumerate(pts):
        bb = T[i].cross(N[i])
        aneis.append([bm.verts.new(p + N[i] * u + bb * v) for u, v in secao])
    m = len(secao)
    for a, b in zip(aneis, aneis[1:]):
        for k in range(m):
            bm.faces.new((a[k], a[(k + 1) % m], b[(k + 1) % m], b[k]))
    if tampas:
        fs = [bm.faces.new(aneis[0][::-1]), bm.faces.new(aneis[-1])]
        bmesh.ops.triangulate(bm, faces=fs)
    return mb._obj(nome, bm, cor, mat, liso=True, angulo=angulo)


def sec_circ(r, n=6):
    return [(r * math.cos(2 * math.pi * k / n), r * math.sin(2 * math.pi * k / n)) for k in range(n)]


def barra(pts, r, cor="grafite", n=6, curva=None, nome="barra"):
    """Tubo leve (seção de n lados) por uma linha de pontos, com as dobras arredondadas por poucos pontos."""
    pp = mb._arredonda_cantos(pts, curva if curva is not None else 2.5 * r, 2)
    return varre(pp, sec_circ(r, n), cor=cor, nome=nome, angulo=70)


def ret(y0, y1, z0, z1, r=0.0):
    return [(y0, z0, r), (y1, z0, r), (y1, z1, r), (y0, z1, r)]


def corta_z(ob, zs):
    """Corta a malha nos planos z (sem apagar nada), para pintar faixas pela altura."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    for z in zs:
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, z), plane_no=(0, 0, 1))
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()
    return ob


def corta_y(ob, ys):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    for y in ys:
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, y, 0), plane_no=(0, 1, 0))
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()
    return ob


def faixas_cor(ob, faixas):
    """faixas: [(z0, z1, cor)]: corta nos limites e pinta as faces cujo centro cai na faixa."""
    corta_z(ob, sorted({z for f in faixas for z in f[:2]}))
    for z0, z1, cor in faixas:
        mb.pinta_onde(ob, cor, lambda c, n, z0=z0, z1=z1: z0 <= c.z <= z1)
    return ob


def vidro_atravessado(poly, W, mat=MAT_VIDRO_CARRO, folga=0.012, x=0.0, n=4, nome="vidro"):
    """Janela lateral dos dois lados de uma vez: o contorno (y, z) extrudado na largura W + 2·folga."""
    return lataria(poly, W + 2 * folga, None, bisel=0.006, x=x, n=n, seg=1, nome=nome, mat=mat)


def placa(p0, p1, x0, x1, cor=None, mat="atlas", esp=0.03, folga=0.012, bisel=0.01, t0=0.0, t1=1.0, nome="placa"):
    """Placa fina deitada no segmento p0→p1 do perfil (y, z), com a face de fora 'folga' acima da superfície. p0→p1
    segue o sentido anti-horário do perfil (de cima para baixo na frente, de baixo para cima atrás)."""
    p0, p1 = V(p0), V(p1)
    a, b = p0 + (p1 - p0) * t0, p0 + (p1 - p0) * t1
    t = (b - a)
    L = t.length
    t.normalize()
    n = V((t.y, -t.x))
    phi = math.atan2(t.y, t.x)
    ob = mb.caixa(x1 - x0, L, esp, x=(x0 + x1) / 2, z=-esp / 2, cor=cor, mat=mat, bisel=bisel, seg=1, nome=nome)
    mb.transforma(ob, rot=("X", math.degrees(phi)))
    c = (a + b) / 2 + n * (folga - esp / 2)
    ob.data.transform(Matrix.Translation((0, c.x, c.y)))
    return ob


def quad_uv(nome, c, u, v, w, h, mat):
    """Retângulo com UV inteiro (estampa): centro c, eixos u (largura) e v (altura); normal = u × v."""
    bm = bmesh.new()
    c, u, v = V(c), V(u).normalized(), V(v).normalized()
    vs = [bm.verts.new(c + u * (sx * w / 2) + v * (sy * h / 2)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    f = bm.faces.new(vs)
    uvl = bm.loops.layers.uv.new("UVMap")
    for lo, q in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        lo[uvl].uv = q
    mb.materiais()
    for g in bm.faces:
        g.material_index = mb._mat_idx(mat)
    me = bpy.data.meshes.new(nome)
    bm.to_mesh(me)
    bm.free()
    for nm in mb.MAT_NOMES:
        me.materials.append(bpy.data.materials[nm])
    ob = bpy.data.objects.new(nome, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


_EST = {}


def est(nome, emissao=0.0):
    if nome not in _EST:
        _EST[nome] = mb.material_estampa("util_" + nome, os.path.join(EST_DIR, nome + ".png"), emissao=emissao)
    return _EST[nome]


def adesivo_lados(nome, W, y, z, w, h, png, emissao=0.0, folga=0.006, so=None):
    """A mesma estampa nos dois lados (sem espelhar): centro (y, z), largura w ao longo de Y, altura h."""
    m = est(png, emissao)
    out = []
    if so in (None, "esq"):
        out.append(quad_uv(nome, (-W / 2 - folga, y, z), (0, -1, 0), (0, 0, 1), w, h, m))
    if so in (None, "dir"):
        out.append(quad_uv(nome, (W / 2 + folga, y, z), (0, 1, 0), (0, 0, 1), w, h, m))
    return out


def adesivo_frente(nome, y, x, z, w, h, png, emissao=0.0, tras=False):
    m = est(png, emissao)
    if tras:
        return quad_uv(nome, (x, y, z), (-1, 0, 0), (0, 0, 1), w, h, m)
    return quad_uv(nome, (x, y, z), (1, 0, 0), (0, 0, 1), w, h, m)


def roda_malha(r, w, cor_aro="cromo", cor_pneu="borracha", seg=16, faixa_branca=False, dupla=False, calota=None):
    """Roda com eixo em X, centrada na origem: pneu boleado, aro e calota (dos dois lados)."""
    ps = []
    ws = [(-w * 0.55, w), (w * 0.55, w)] if dupla else [(0.0, w)]
    for cx, ww in ws:
        h = ww / 2
        perfil = [(r * 0.62, -h), (r * 0.9, -h), (r, -h * 0.55), (r, h * 0.55), (r * 0.9, h), (r * 0.62, h)]
        pneu = mb.torno(perfil, cor=cor_pneu, seg=seg, nome="pneu", angulo=50)
        mb.transforma(pneu, loc=(0, 0, cx))
        ps.append(pneu)
        if faixa_branca:
            for s in (-1, 1):
                anel = mb.torno([(r * 0.66, 0), (r * 0.84, 0), (r * 0.84, 0.006)], cor="branco", seg=seg,
                                nome="faixa")
                mb.transforma(anel, loc=(0, 0, cx + s * (h + 0.001) - (0.006 if s < 0 else 0)))
                ps.append(anel)
    lw = (w * 2.1 if dupla else w) * 0.86
    ps.append(mb.cilindro(r * 0.63, lw, z=-lw / 2, cor=cor_aro, seg=seg, bisel=0.0, nome="aro"))
    cal = calota or ("grafite" if cor_aro != "grafite" else "cinza")
    for s in (-1, 1):
        ps.append(mb.cilindro(r * 0.32, 0.03, z=s * lw / 2 - (0.03 if s < 0 else 0), cor=cal, seg=10, bisel=0.0,
                              nome="calota", r2=r * 0.26 if s > 0 else None))
        ps.append(mb.cilindro(r * 0.1, 0.03, z=s * (lw / 2 + 0.02) - (0.03 if s < 0 else 0), cor="cromo", seg=6,
                              bisel=0.0, nome="cubo"))
    ob = mb.junta(ps, "roda")
    mb.transforma(ob, rot=("Y", 90))
    return ob


def roda_trem(r, cor="metal_escuro"):
    """Roda ferroviária com friso: o friso fica do lado de dentro (+X local, para o meio da via quando espelhada)."""
    ps = [mb.cilindro(r, 0.13, z=-0.065, cor=cor, seg=14, bisel=0.0, nome="roda_trem"),
          mb.cilindro(r + 0.035, 0.03, z=0.065, cor="ferro", seg=14, bisel=0.0, nome="friso"),
          mb.cilindro(r * 0.55, 0.04, z=-0.105, cor="grafite", seg=10, bisel=0.0, nome="cubo"),
          mb.cilindro(r * 0.18, 0.04, z=-0.145, cor="amarelo", seg=6, bisel=0.0, nome="cubo")]
    ob = mb.junta(ps, "roda")
    mb.transforma(ob, rot=("Y", 90))
    return ob


def roda(it, x, y, r, w, vel=240, **k):
    """Roda animada (filho com a origem no eixo). x > 0 fica à direita; a calota olha para fora dos dois lados."""
    ob = roda_malha(r, w, **k)
    mb.transforma(ob, loc=(x, y, r))
    return it.anima(ob, {"anima": "girar", "eixo": "x", "velocidade": vel, "roda": 1, "raio": round(r, 3)},
                    it.nome("roda"), pivo=(x, y, r))


def rodeiro(it, y, r, bitola_x=X_TR, vel=300):
    """Par de rodas ferroviárias num eixo (um filho animado por eixo, com o eixo de aço no meio)."""
    ps = []
    for s in (-1, 1):
        w = roda_trem(r)
        if s > 0:
            w.data.transform(Matrix.Diagonal((-1, 1, 1, 1)))
            w.data.flip_normals()
        mb.transforma(w, loc=(s * bitola_x, y, r))
        ps.append(w)
    ps.append(mb.cilindro(0.07, 2 * bitola_x - 0.1, x=0, y=y, z=r, cor="ferro", eixo="x", seg=8, bisel=0.0,
                          nome="eixo"))
    return it.anima(ps, {"anima": "girar", "eixo": "x", "velocidade": vel, "roda": 1, "raio": round(r, 3)},
                    it.nome("roda"), pivo=(0, y, r))


def farol(x, y, z, r=0.11, sinal=-1, mat="luz", aro="cromo", prof=0.06):
    """Farol redondo na face da frente (sinal −1, olhando para −Y) ou de trás (+1)."""
    return [mb.cilindro(r + 0.025, prof, x=x, y=y + sinal * prof / 2, z=z, cor=aro, eixo="y", seg=12, bisel=0.01,
                        nome="aro_farol"),
            mb.cilindro(r, 0.02, x=x, y=y + sinal * (prof + 0.008), z=z, cor=None, mat=mat, eixo="y", seg=12,
                        bisel=0.0, nome="farol")]


def lanterna(x, y, z, l=0.14, a=0.22, sinal=1, mat="luz_vermelha", prof=0.05):
    return mb.caixa(l, prof, a, x=x, y=y + sinal * prof / 2 - sinal * 0.01, z=z - a / 2, cor=None, mat=mat,
                    bisel=0.02, seg=1, nome="lanterna")


def retrovisor(x, y, z, lado, haste=0.18, tam=(0.06, 0.12, 0.18), cor="grafite"):
    s = 1 if lado > 0 else -1
    pts = [(x, y, z), (x + s * haste, y - 0.02, z + 0.02)]
    return [barra(pts, 0.015, cor=cor, n=5), mb.caixa(*tam, x=x + s * (haste + tam[0] / 2 - 0.01), y=y - 0.02,
                                                          z=z - tam[2] / 2 + 0.03, cor=cor, bisel=0.025, seg=2)]


def para_choque(W, y, z, a=0.22, p=0.18, cor="grafite", sinal=-1, recuo=0.0):
    return mb.caixa(W, p, a, y=y + sinal * (p / 2 - recuo), z=z, cor=cor, bisel=0.06, seg=2, nome="parachoque")


def grade(W, y, z0, z1, n=4, cor="cromo", fundo="grafite_escuro", sinal=-1):
    ps = [mb.caixa(W, 0.03, z1 - z0, y=y + sinal * 0.012, z=z0, cor=fundo, bisel=0.01, seg=1)]
    for k in range(n):
        z = z0 + (z1 - z0) * (k + 0.5) / n
        ps.append(mb.caixa(W - 0.04, 0.04, 0.035, y=y + sinal * 0.03, z=z - 0.0175, cor=cor, bisel=0.012, seg=1))
    return ps


def porta_lateral(it, lado, y0, y1, z0, z1, W, cor, janela=None, r=0.06, angulo=70, macaneta="cromo", folga=0.012,
                  esp=0.035, vao="grafite_escuro", mat_vidro=MAT_VIDRO_CARRO, faixas=None, nome=None):
    """Porta de abrir num lado (lado −1 = esquerda, +1 = direita), dobradiça na frente (y0). janela = (y0, y1, z0, z1,
    r) do vidro. faixas = [(z0, z1, cor)] para portas de duas cores. Com o painel escuro do vão atrás."""
    s = lado
    xs = s * (W / 2 + folga) - s * esp  # face de dentro
    pl = lataria(ret(y0, y1, z0, z1, r), esp, cor, bisel=0.012, x=xs + s * esp / 2, seg=1, n=3, nome="porta")
    if faixas:
        faixas_cor(pl, faixas)
    objs = [pl]
    if janela:
        jx = janela[5] if len(janela) > 5 else W / 2 + folga
        objs.append(lataria(ret(*janela[:5]), 0.02, None, bisel=0.004, x=s * (jx + 0.006), seg=1, n=3,
                            nome="vidro_porta", mat=mat_vidro))
    yy = y1 - 0.18
    zz = (z0 + (janela[2] if janela else z1)) / 2 + 0.05 if janela else (z0 + z1) / 2
    objs.append(mb.caixa(0.03, 0.14, 0.035, x=s * (W / 2 + folga + 0.012), y=yy, z=zz, cor=macaneta, bisel=0.012,
                         seg=1, nome="macaneta"))
    ob = it.porta(objs, (s * (W / 2 + folga), y0, (z0 + z1) / 2), eixo="z", angulo=-s * angulo,
                  nome=nome or it.nome("porta"))
    # vão escuro (aparece com a porta aberta)
    if vao:
        it.add(mb.caixa(0.012, y1 - y0 - 0.08, z1 - z0 - 0.08, x=s * (W / 2 - 0.002), y=(y0 + y1) / 2, z=z0 + 0.04,
                        cor=vao, bisel=0.0, nome="vao"))
    return ob


def porta_traseira_dupla(it, y, W, z0, z1, x0, x1, cor, janela_z=None, angulo=100, vao="grafite_escuro",
                         mat_vidro=MAT_VIDRO_CARRO, folga=0.012, esp=0.035, faixas=None):
    """Duas folhas na face de trás (y = +L/2), dobradiças nas bordas, abrindo para fora (+Y)."""
    xm = (x0 + x1) / 2
    for lado, (a, b) in ((-1, (x0, xm - 0.006)), (1, (xm + 0.006, x1))):
        pl = mb.caixa(b - a, esp, z1 - z0, x=(a + b) / 2, y=y + folga - esp / 2, z=z0, cor=cor, bisel=0.012, seg=2,
                      nome="folha")
        if faixas:
            faixas_cor(pl, faixas)
        objs = [pl]
        if janela_z:
            objs.append(mb.caixa(b - a - 0.16, 0.02, janela_z[1] - janela_z[0], x=(a + b) / 2, y=y + folga + 0.006,
                                 z=janela_z[0], cor=None, mat=mat_vidro, bisel=0.02, seg=1, nome="vidro"))
        objs.append(mb.caixa(0.035, 0.03, 0.14, x=(b - 0.06) if lado < 0 else (a + 0.06), y=y + folga + 0.012,
                             z=z0 + (z1 - z0) * 0.45, cor="cromo", bisel=0.012, seg=1, nome="macaneta"))
        piv = (a if lado < 0 else b, y + folga, (z0 + z1) / 2)
        it.porta(objs, piv, eixo="z", angulo=angulo if lado < 0 else -angulo, nome=it.nome("porta_traseira"))
    it.add(mb.caixa(x1 - x0 - 0.08, 0.012, z1 - z0 - 0.08, x=xm, y=y - 0.004, z=z0 + 0.04, cor=vao, bisel=0.003,
                    seg=1, nome="vao"))


def tampa_traseira(it, y, W, z0, z1, x0, x1, cor, janela_z=None, angulo=75, vao="grafite_escuro",
                   mat_vidro=MAT_VIDRO_CARRO, folga=0.012, esp=0.035, nome="tampa"):
    """Tampa basculante na face de trás, dobradiça em cima, abrindo para cima e para fora."""
    objs = [mb.caixa(x1 - x0, esp, z1 - z0, x=(x0 + x1) / 2, y=y + folga - esp / 2, z=z0, cor=cor, bisel=0.012,
                     seg=2, nome=nome)]
    if janela_z:
        objs.append(mb.caixa(x1 - x0 - 0.2, 0.02, janela_z[1] - janela_z[0], x=(x0 + x1) / 2, y=y + folga + 0.006,
                             z=janela_z[0], cor=None, mat=mat_vidro, bisel=0.02, seg=1, nome="vidro"))
    objs.append(mb.caixa(0.16, 0.03, 0.035, x=(x0 + x1) / 2, y=y + folga + 0.012, z=z0 + 0.12, cor="cromo",
                         bisel=0.012, seg=1, nome="macaneta"))
    it.porta(objs, ((x0 + x1) / 2, y + folga, z1), eixo="x", angulo=angulo, nome=it.nome(nome))
    it.add(mb.caixa(x1 - x0 - 0.08, 0.012, z1 - z0 - 0.08, x=(x0 + x1) / 2, y=y - 0.004, z=z0 + 0.04, cor=vao,
                    bisel=0.003, seg=1, nome="vao"))


def sirene(it, objs, cor, periodo=0.8, fase=None):
    d = {"anima": "piscar", "periodo": periodo}
    if fase is not None:
        d["fase"] = fase
    return it.anima(objs, d, it.nome("sirene_" + cor))


def giroflex(it, y, z, W=1.2, prof=0.28, alt=0.16, cor_base="grafite"):
    """Barra de luz no teto: base escura, metade azul e metade vermelha, piscando alternadas."""
    it.add(mb.caixa(W + 0.06, prof + 0.04, 0.05, y=y, z=z, cor=cor_base, bisel=0.02, seg=1, nome="base_giroflex"))
    az = mb.caixa(W / 2 - 0.02, prof, alt, x=-W / 4, y=y, z=z + 0.05, cor=None, mat="luz_azul", bisel=0.05, seg=2)
    vm = mb.caixa(W / 2 - 0.02, prof, alt, x=W / 4, y=y, z=z + 0.05, cor=None, mat="luz_vermelha", bisel=0.05, seg=2)
    sirene(it, az, "azul")
    sirene(it, vm, "vermelha", fase=0.4)
    it.add(mb.caixa(0.06, prof - 0.02, alt + 0.01, y=y, z=z + 0.05, cor="cromo", bisel=0.02, seg=1))


def janelas_fileira(W, y0, y1, z0, z1, n, semente, montante=0.12, r=0.06, folga=0.008, pular=(), lados=(-1, 1),
                    apagadas=0.38, frias=0.25, x_lado=None):
    """Fileira de n janelas em cada lado (vidros com material sorteado: acendem à noite). pular = índices sem vidro
    (portas). Devolve a lista de objetos."""
    rnd = random.Random(semente)
    w = (y1 - y0 - montante * (n - 1)) / n
    out = []
    for s in lados:
        xl = (x_lado if x_lado is not None else W / 2) + folga
        for k in range(n):
            if (s, k) in pular or k in pular:
                continue
            q = rnd.random()
            mat = "janela_apagada" if q < apagadas else ("janela_fria" if q < apagadas + frias else "janela")
            yc = y0 + k * (w + montante) + w / 2
            out.append(mb.caixa(0.03, w, z1 - z0, x=s * (xl - 0.015), y=yc, z=z0, cor=None, mat=mat,
                                bisel=min(r, 0.014), seg=1, nome="janela"))
    return out


def mat_sorteado(rnd, apagadas=0.38, frias=0.25):
    q = rnd.random()
    return "janela_apagada" if q < apagadas else ("janela_fria" if q < apagadas + frias else "janela")


def mala(x, y, z, l, p, a, cor, cinta="marrom_escuro"):
    ps = [mb.caixa(l, p, a, x=x, y=y, z=z, cor=cor, bisel=min(0.05, a / 3), seg=2, nome="mala")]
    ps.append(mb.caixa(l + 0.012, 0.05, a + 0.012, x=x, y=y - p * 0.22, z=z - 0.006, cor=cinta, bisel=0.01, seg=1))
    ps.append(mb.caixa(l + 0.012, 0.05, a + 0.012, x=x, y=y + p * 0.22, z=z - 0.006, cor=cinta, bisel=0.01, seg=1))
    ps.append(barra([(x - 0.08, y, z + a), (x - 0.08, y, z + a + 0.05), (x + 0.08, y, z + a + 0.05),
                     (x + 0.08, y, z + a)], 0.012, cor=cinta, n=5, curva=0.02))
    return ps


# ======================================================================================================================
# KOMBI (de viagem e rosa)
# ======================================================================================================================
def kombi(it, cor_baixo, cor_cima, malas=True, cor_rack="grafite"):
    L, W, H = 4.4, 1.9, 2.02
    r = 0.37
    yf, yt = -1.4, 1.32
    zb = 0.30
    ra = r + 0.07
    poly = [(-L / 2 + 0.04, zb, 0.14)] + arco_roda(yf, r, ra, zb) + arco_roda(yt, r, ra, zb) + \
        [(L / 2, zb, 0.16), (L / 2, H - 0.1, 0.26), (-L / 2 + 0.12, H, 0.5), (-L / 2 - 0.06, 1.05, 0.35)]
    corpo = lataria(poly, W, cor_baixo, bisel=0.1, n=4)
    faixas_cor(corpo, [(1.12, 9, cor_cima)])
    it.add(corpo)
    # "V" da frente na cor de cima
    it.add(mb.extrudado([(-0.62, 1.12), (0.62, 1.12), (0.0, 0.62)], 0.02, x=0, y=-L / 2 - 0.03, z=0, plano="xz",
                        cor=cor_cima, bisel=0.004))
    # vidros: para-brisa partido, janelas laterais e traseira
    pf0, pf1 = V((-L / 2 + 0.12, H)), V((-L / 2 - 0.06, 1.05))
    for x0, x1 in ((-W / 2 + 0.16, -0.035), (0.035, W / 2 - 0.16)):
        it.add(placa(pf0, pf1, x0, x1, mat=MAT_VIDRO_CARRO, t0=0.22, t1=0.62, bisel=0.02))
    for y0, y1 in ((-0.85, 0.05), (0.17, 1.0), (1.12, 1.9)):
        it.add(vidro_atravessado(ret(y0, y1, 1.3, 1.82, 0.08), W))
    # para-choques, faróis, lanternas, retrovisores
    it.add(para_choque(W + 0.06, -L / 2 - 0.04, 0.36, a=0.16, cor="cromo"))
    it.add(para_choque(W + 0.06, L / 2 + 0.03, 0.36, a=0.16, cor="cromo", sinal=1))
    for s in (-1, 1):
        it.add(farol(s * 0.62, -L / 2 - 0.035, 0.82, r=0.11))
        it.add(lanterna(s * (W / 2 - 0.12), L / 2 + 0.01, 0.95, l=0.1, a=0.22))
        it.add(retrovisor(s * (W / 2 - 0.02), -L / 2 + 0.3, 1.5, s))
    it.add(grade(0.9, -L / 2 - 0.035, 0.5, 0.66, n=3))
    # portas: motorista e passageiro, porta de correr à direita, tampa traseira
    for s in (-1, 1):
        porta_lateral(it, s, -1.96, -1.02, 0.5, 1.86, W, cor_baixo, janela=(-1.86, -1.12, 1.3, 1.78, 0.07),
                      faixas=[(1.12, 9, cor_cima)])
    yc0, yc1 = -0.9, 0.12
    pl = lataria(ret(yc0, yc1, 0.5, 1.86, 0.06), 0.035, cor_baixo, bisel=0.012, x=W / 2 + 0.03, seg=2, nome="porta")
    faixas_cor(pl, [(1.12, 9, cor_cima)])
    vid = lataria(ret(yc0 + 0.08, yc1 - 0.08, 1.3, 1.78, 0.07), 0.02, None, bisel=0.004, x=W / 2 + 0.052, seg=1,
                  nome="vidro", mat=MAT_VIDRO_CARRO)
    mac = mb.caixa(0.03, 0.14, 0.035, x=W / 2 + 0.058, y=yc0 + 0.16, z=1.1, cor="cromo", bisel=0.012, seg=1)
    it.correr([pl, vid, mac], direcao=(0.1, 1, 0), curso=0.95, nome="porta_correr")
    it.add(mb.caixa(0.012, yc1 - yc0 - 0.08, 1.28, x=W / 2 - 0.002, y=(yc0 + yc1) / 2, z=0.54, cor="grafite_escuro",
                    bisel=0.0, nome="vao"))
    tampa_traseira(it, L / 2, W, 0.98, 1.64, -W / 2 + 0.22, W / 2 - 0.22, cor_cima, janela_z=(1.2, 1.56))
    # rack no teto
    zr = H + 0.12
    for s in (-1, 1):
        it.add(barra([(s * 0.78, -1.4, H - 0.02), (s * 0.78, -1.32, zr), (s * 0.78, 1.42, zr),
                      (s * 0.78, 1.5, H - 0.06)], 0.025, cor=cor_rack, curva=0.06))
    for y in (-1.0, -0.2, 0.6, 1.3):
        it.add(barra([(-0.78, y, zr), (0.78, y, zr)], 0.02, cor=cor_rack))
    if malas:
        it.add(mala(-0.32, -0.75, zr + 0.02, 0.62, 0.8, 0.34, "verde_medio"))
        it.add(mala(0.33, -0.55, zr + 0.02, 0.56, 0.62, 0.3, "laranja"))
        it.add(mala(0.0, 0.35, zr + 0.02, 0.9, 0.62, 0.4, "marrom_claro"))
        it.add(mala(-0.2, 0.4, zr + 0.42, 0.46, 0.45, 0.26, "vermelho"))
        it.add(mala(0.35, 1.05, zr + 0.02, 0.5, 0.5, 0.28, "amarelo"))
        it.add(mb.superelipsoide(0.42, 2.2, 0.07, x=0.52, y=0.25, z=zr + 0.445, cor="vermelho", e=0.9, e_v=0.6,
                                 nu=16, nv=6))
        it.add(mb.caixa(0.43, 0.06, 0.075, x=0.52, y=0.25, z=zr + 0.44, cor="amarelo", bisel=0.02, seg=1))
    # rodas
    for s in (-1, 1):
        for y in (yf, yt):
            roda(it, s * (W / 2 - 0.13), y, r, 0.24, calota="branco", cor_aro="branco")
    it.assento("assento_motorista", -0.45, -1.42, 0.78)
    it.assento("assento_1", 0.45, -1.42, 0.78)
    for k, (x, y) in enumerate(((-0.45, -0.3), (0.45, -0.3), (-0.45, 0.8), (0.45, 0.8))):
        it.assento(f"assento_{k + 2}", x, y, 0.72)
    it.colisao([((0, 0, 0.0), (W, L + 0.1, H))] + ([((0, 0.1, H), (1.7, 3.0, 0.75))] if malas else []))


# ======================================================================================================================
def exporta(cat, it, rotulo, grupo, tags, extra):
    e = dict(extra or {})
    anims = it.lista_animacoes()
    if anims:
        e["animacoes"] = anims
    e.setdefault("veiculo", "chao")
    e["rodas"] = sum(1 for a in anims if a.get("roda"))
    e["assentos"] = [s[0][5:] for s in it.slots if s[0].startswith("slot_assento")]
    cat.exporta(it, rotulo, grupo=grupo, tags=tags, extra=e)


P = []


def peca(id_, rotulo, grupo, tags, extra=None):
    def deco(f):
        P.append((id_, rotulo, grupo, tags, extra, f))
        return f
    return deco


@peca("kombi_viagem", "Kombi de viagem com malas no teto", "kombi", ["van", "viagem", "rua"])
def p_kombi_viagem(it):
    kombi(it, "turquesa_escuro", "branco_gelo", malas=True)


@peca("kombi_rosa", "Kombi rosa", "kombi", ["van", "rua"])
def p_kombi_rosa(it):
    kombi(it, "rosa", "branco_gelo", malas=False, cor_rack="cinza")


# ======================================================================================================================
# Mais primitivas
# ======================================================================================================================
def tampa_horizontal(it, y0, y1, x0, x1, z, cor, angulo=60, esp=0.03, nome="porta_malas"):
    """Tampa deitada (porta-malas): dobradiça na borda y0, abre levantando a borda y1."""
    objs = [mb.caixa(x1 - x0, abs(y1 - y0), esp, x=(x0 + x1) / 2, y=(y0 + y1) / 2, z=z - esp + 0.014, cor=cor,
                     bisel=0.012, seg=1, nome=nome)]
    it.porta(objs, ((x0 + x1) / 2, y0, z), eixo="x", angulo=angulo if y1 > y0 else -angulo, nome=it.nome(nome))
    it.add(mb.caixa(x1 - x0 - 0.1, abs(y1 - y0) - 0.1, 0.012, x=(x0 + x1) / 2, y=(y0 + y1) / 2, z=z - 0.02,
                    cor="grafite_escuro", bisel=0.0, nome="vao"))


def portinhola_lado(it, lado, y0, y1, z0, z1, x_face, cor, angulo=95, esp=0.035, folga=0.012, frisos=0,
                    cor_friso=None, nome="portinhola"):
    """Porta de compartimento num lado, dobradiça em cima (abre levantando para fora)."""
    s = lado
    objs = [mb.caixa(esp, y1 - y0, z1 - z0, x=s * (x_face + folga - esp / 2), y=(y0 + y1) / 2, z=z0, cor=cor,
                     bisel=0.012, seg=1, nome=nome)]
    for k in range(frisos):
        z = z0 + (z1 - z0) * (k + 1) / (frisos + 1)
        objs.append(mb.caixa(0.012, y1 - y0 - 0.06, 0.03, x=s * (x_face + folga + 0.004), y=(y0 + y1) / 2,
                             z=z - 0.015, cor=cor_friso or cor, bisel=0.0, seg=1))
    objs.append(mb.caixa(0.03, 0.16, 0.035, x=s * (x_face + folga + 0.012), y=(y0 + y1) / 2, z=z0 + 0.08,
                         cor="cromo", bisel=0.012, seg=1))
    it.porta(objs, (s * (x_face + folga), (y0 + y1) / 2, z1), eixo="y", angulo=s * angulo, nome=it.nome(nome))
    it.add(mb.caixa(0.012, y1 - y0 - 0.08, z1 - z0 - 0.08, x=s * (x_face - 0.002), y=(y0 + y1) / 2, z=z0 + 0.04,
                    cor="grafite_escuro", bisel=0.0, nome="vao"))


def porta_correr(it, lado, y0, y1, z0, z1, x_face, cor, sentido=1, curso=None, janela=None, esp=0.035, folga=0.02,
                 mat_vidro=MAT_VIDRO_CARRO, faixas=None, vao="grafite_escuro", nome="porta_correr"):
    """Porta de correr num lado: anda ao longo de Y (sentido ±1), um pouco para fora."""
    s = lado
    pl = lataria(ret(y0, y1, z0, z1, 0.05), esp, cor, bisel=0.01, x=s * (x_face + folga - esp / 2), seg=1, n=3,
                 nome=nome)
    if faixas:
        faixas_cor(pl, faixas)
    objs = [pl]
    if janela:
        objs.append(mb.caixa(0.02, y1 - y0 - 0.16, janela[1] - janela[0], x=s * (x_face + folga + 0.006),
                             y=(y0 + y1) / 2, z=janela[0], cor=None, mat=mat_vidro, bisel=0.01, seg=1))
    ym = y0 + 0.1 if sentido > 0 else y1 - 0.1
    objs.append(mb.caixa(0.03, 0.04, 0.3, x=s * (x_face + folga + 0.012), y=ym, z=(z0 + z1) / 2 - 0.15, cor="cromo",
                         bisel=0.01, seg=1))
    it.correr(objs, direcao=(s * 0.08, sentido, 0), curso=curso or (y1 - y0) * 0.95, nome=it.nome(nome))
    if vao:
        it.add(mb.caixa(0.012, y1 - y0 - 0.06, z1 - z0 - 0.06, x=s * (x_face - 0.002), y=(y0 + y1) / 2, z=z0 + 0.03,
                        cor=vao, bisel=0.0, nome="vao"))


def quad_em_placa(nome, p0, p1, t, x, w, h, png, emissao=0.0, folga=0.018):
    """Estampa sobre a placa do segmento p0→p1 (p. ex. o letreiro colado no alto do para-brisa)."""
    p0, p1 = V(p0), V(p1)
    d = (p1 - p0).normalized()
    n = V((d.y, -d.x))
    c = p0 + (p1 - p0) * t + n * folga
    up = -d if (-d).y * 0 + (-d).x * 0 + (p0 - p1).normalized().y * 0 + (p0.y - p1.y) * 0 == 0 else d
    vv = (p0 - p1).normalized()  # de baixo para cima (p0 é o de cima na frente)
    if vv.y < 0 and n.x < 0:
        vv = -vv
    return quad_uv(nome, (x, c.x, c.y), (1, 0, 0) if n.x < 0 else (-1, 0, 0), (0, vv.x, vv.y), w, h,
                   est(png, emissao))


def faixa_lado(W, y0, y1, z0, z1, cor, folga=0.01):
    """Friso/faixa pintada saliente nos dois lados (retângulo fino)."""
    return lataria(ret(y0, y1, z0, z1, 0.02), W + 2 * folga, cor, bisel=0.004, seg=1, n=2, nome="faixa")


def peixe(y, z, tam, cor, W, sentido=-1):
    """Peixinho pintado nos dois lados (contorno em y, z), olhando para a frente (sentido −1)."""
    s = sentido
    pts = []
    for k in range(14):
        a = 2 * math.pi * k / 14
        pts.append((y + s * 0.0 + math.cos(a) * tam * 0.5, z + math.sin(a) * tam * 0.3, 0))
    corpo = vidro_atravessado([(p[0], p[1], 0) for p in pts], W, mat="atlas", folga=0.008, nome="peixe")
    mb.pinta(corpo, cor)
    yr = y - s * tam * 0.45
    cauda = vidro_atravessado([(yr, z, 0), (yr - s * tam * 0.4, z + tam * 0.28, 0.02),
                               (yr - s * tam * 0.4, z - tam * 0.28, 0.02)], W, mat="atlas", folga=0.008, nome="cauda")
    mb.pinta(cauda, cor)
    olho = vidro_atravessado([(y + s * tam * 0.25 + math.cos(2 * math.pi * k / 8) * tam * 0.06,
                               z + tam * 0.06 + math.sin(2 * math.pi * k / 8) * tam * 0.06, 0) for k in range(8)], W,
                             mat="atlas", folga=0.012, nome="olho")
    mb.pinta(olho, "preto")
    return [corpo, cauda, olho]


def bolha(y, z, r, W, cor="branco"):
    o = vidro_atravessado([(y + math.cos(2 * math.pi * k / 10) * r, z + math.sin(2 * math.pi * k / 10) * r, 0)
                           for k in range(10)], W, mat="atlas", folga=0.008, nome="bolha")
    return mb.pinta(o, cor)


def taper_x(objs, y_ini, comp, k=0.5, pot=1.6, sentido=-1):
    """Afina em X (planta) o que passa de y_ini para a ponta (sentido −1: para −Y): nariz de trem."""
    for o in objs:
        for v in o.data.vertices:
            t = (y_ini - v.co.y) / comp if sentido < 0 else (v.co.y - y_ini) / comp
            if t > 0:
                v.co.x *= 1 - k * min(1.0, t) ** pot
        o.data.update()
    return objs


def rr(L, W, r):
    """Retângulo arredondado em planta (x = largura W, y = comprimento L) para planta()."""
    return [(-W / 2, -L / 2, r), (W / 2, -L / 2, r), (W / 2, L / 2, r), (-W / 2, L / 2, r)]


# ======================================================================================================================
# FURGÃO, AMBULÂNCIA, FOOD TRUCK
# ======================================================================================================================
def furgao_base(it, L, W, H, cor, r=0.4, zb=0.36, faixas=None, mat_vidro=MAT_VIDRO_CARRO, portas=True):
    yf, yt = -L / 2 + 1.0, L / 2 - 1.15
    ra = r + 0.07
    pa, pb = (-L / 2 + 0.42, H), (-L / 2 + 0.14, 1.42)
    poly = [(-L / 2, zb, 0.12)] + arco_roda(yf, r, ra, zb) + arco_roda(yt, r, ra, zb) + \
        [(L / 2, zb, 0.1), (L / 2, H, 0.2), (pa[0], pa[1], 0.26), (pb[0], pb[1], 0.12), (-L / 2, 1.28, 0.12)]
    corpo = lataria(poly, W, cor, bisel=0.09, n=4)
    if faixas:
        faixas_cor(corpo, faixas)
    it.add(corpo)
    it.add(placa(pa, pb, -W / 2 + 0.13, W / 2 - 0.13, mat=mat_vidro, t0=0.22, t1=0.9, bisel=0.03))
    # frente: para-choque, faróis, grade, retrovisores
    it.add(para_choque(W + 0.04, -L / 2 - 0.02, 0.36, a=0.24, cor="grafite"))
    it.add(grade(W * 0.45, -L / 2, 0.68, 1.1, n=4, cor="cinza_claro"))
    for s in (-1, 1):
        it.add(mb.caixa(0.34, 0.06, 0.2, x=s * (W / 2 - 0.3), y=-L / 2 - 0.02, z=0.86, cor=None, mat="luz",
                        bisel=0.03, seg=2))
        it.add(mb.caixa(0.12, 0.06, 0.1, x=s * (W / 2 - 0.3), y=-L / 2 - 0.02, z=0.72, cor="laranja", bisel=0.02,
                        seg=1))
        it.add(retrovisor(s * (W / 2 - 0.02), -L / 2 + 0.5, 1.75, s, haste=0.2, tam=(0.07, 0.14, 0.26)))
        it.add(lanterna(s * (W / 2 - 0.1), L / 2, 0.95, l=0.14, a=0.36))
        it.add(mb.caixa(0.1, 0.06, 0.06, x=s * (W / 2 - 0.18), y=-L / 2 + 0.36, z=H + 0.01, cor=None, mat="luz",
                        bisel=0.02, seg=1))
    it.add(para_choque(W + 0.04, L / 2 + 0.02, 0.36, a=0.22, cor="grafite", sinal=1))
    if portas:
        for s in (-1, 1):
            porta_lateral(it, s, -L / 2 + 1.52, -L / 2 + 2.32, 0.5, H - 0.2, W, cor,
                          janela=(-L / 2 + 1.6, -L / 2 + 2.24, 1.55, H - 0.32, 0.06), faixas=faixas,
                          mat_vidro=mat_vidro)
    for s in (-1, 1):
        for y in (yf, yt):
            roda(it, s * (W / 2 - 0.15), y, r, 0.28, cor_aro="cinza_claro")
    it.assento("assento_motorista", -0.5, -L / 2 + 1.9, 0.9)
    it.assento("assento_1", 0.5, -L / 2 + 1.9, 0.9)
    return yf, yt


@peca("furgao_cinza", "Furgão cinza", "furgao", ["van", "rua", "entrega"])
def p_furgao(it):
    L, W, H = 5.6, 2.1, 2.7
    furgao_base(it, L, W, H, "cinza", faixas=[(0.0, 0.62, "cinza_medio")])
    porta_correr(it, 1, -L / 2 + 2.45, -L / 2 + 3.4, 0.5, H - 0.22, W / 2, "cinza", sentido=1,
                 faixas=[(0.0, 0.62, "cinza_medio")])
    porta_traseira_dupla(it, L / 2, W, 0.5, H - 0.18, -W / 2 + 0.14, W / 2 - 0.14, "cinza",
                         janela_z=(1.6, H - 0.4))
    it.add(mb.caixa(1.0, 1.2, 0.18, y=-0.4, z=H - 0.02, cor="branco_gelo", bisel=0.06, seg=2))  # tampa do teto
    it.add(faixa_lado(W, -L / 2 + 0.3, L / 2 - 0.2, 1.22, 1.3, "laranja"))
    it.slot("carga", (0, 1.0, 0.5), (1.9, 2.8, 2.0))
    it.colisao([((0, 0, 0), (W, L + 0.1, H))])


@peca("ambulancia", "Ambulância", "ambulancia", ["van", "rua", "emergencia", "sirene"])
def p_ambulancia(it):
    L, W, H = 5.9, 2.15, 2.85
    r, zb = 0.4, 0.38
    yf, yt = -L / 2 + 0.95, L / 2 - 1.2
    ra = r + 0.07
    yc = -L / 2 + 1.85  # frente do baú (acima da cabine)
    pa, pb = (-L / 2 + 1.3, 2.25), (-L / 2 + 0.75, 1.32)
    poly = [(-L / 2, zb, 0.12)] + arco_roda(yf, r, ra, zb) + arco_roda(yt, r, ra, zb) + \
        [(L / 2, zb, 0.1), (L / 2, H, 0.15), (yc, H, 0.15), (yc, 2.3, 0.06), (pa[0], pa[1], 0.12),
         (pb[0], pb[1], 0.12), (-L / 2 + 0.05, 1.2, 0.25), (-L / 2, 0.75, 0.12)]
    corpo = lataria(poly, W, "branco", bisel=0.08, n=4)
    faixas_cor(corpo, [(0.0, 0.62, "cinza_claro"), (1.0, 1.24, "vermelho")])
    it.add(corpo)
    it.add(placa(pa, pb, -W / 2 + 0.14, W / 2 - 0.14, mat=MAT_VIDRO_CARRO, t0=0.12, t1=0.86, bisel=0.03))
    it.add(adesivo_lados("ambulancia_txt", W, 0.55, 1.75, 2.3, 0.34, "faixa_ambulancia"))
    it.add(adesivo_lados("estrela", W, 1.95, 1.78, 0.5, 0.5, "estrela_vida", so="esq"))
    it.add(adesivo_lados("estrela", W, -0.35, 1.78, 0.5, 0.5, "estrela_vida", so="dir"))
    it.add(adesivo_frente("testeira", yc - 0.006, 0, 2.55, 1.5, 0.25, "testeira_ambulancia"))
    it.add(adesivo_frente("estrela_tras", L / 2 + 0.03, 0.0, 2.45, 0.42, 0.42, "estrela_vida", tras=True))
    # frente
    it.add(para_choque(W + 0.04, -L / 2 - 0.02, 0.34, a=0.24, cor="grafite"))
    it.add(grade(W * 0.5, -L / 2 + 0.02, 0.66, 1.05, n=3, cor="cinza_claro"))
    for s in (-1, 1):
        it.add(mb.caixa(0.36, 0.08, 0.2, x=s * (W / 2 - 0.3), y=-L / 2 + 0.04, z=0.86, cor=None, mat="luz",
                        bisel=0.03, seg=2))
        it.add(retrovisor(s * (W / 2 - 0.02), -L / 2 + 1.05, 1.95, s, haste=0.2, tam=(0.07, 0.14, 0.26)))
        it.add(lanterna(s * (W / 2 - 0.1), L / 2, 1.0, l=0.14, a=0.36))
        porta_lateral(it, s, -L / 2 + 1.1, -L / 2 + 1.88, 0.52, 2.18, W, "branco",
                      janela=(-L / 2 + 1.18, -L / 2 + 1.8, 1.45, 2.1, 0.06),
                      faixas=[(0.0, 0.62, "cinza_claro"), (1.0, 1.24, "vermelho")])
    it.add(para_choque(W + 0.04, L / 2 + 0.02, 0.36, a=0.22, cor="grafite", sinal=1))
    # giroflex na frente do baú e sinalizadores vermelhos nos cantos de cima
    giroflex(it, yc + 0.3, H, W=1.3)
    for s in (-1, 1):
        sirene(it, mb.caixa(0.16, 0.16, 0.12, x=s * (W / 2 - 0.12), y=L / 2 - 0.12, z=H, cor=None,
                            mat="luz_vermelha", bisel=0.04, seg=2), "vermelha", fase=0.4 if s > 0 else 0.0)
    it.add(mb.caixa(0.7, 0.7, 0.14, y=0.8, z=H - 0.02, cor="branco", bisel=0.05, seg=2))
    # portas traseiras e lateral do baú
    porta_traseira_dupla(it, L / 2, W, 0.55, H - 0.2, -W / 2 + 0.14, W / 2 - 0.14, "branco", janela_z=(1.75, 2.35),
                         faixas=[(0.0, 0.62, "cinza_claro"), (1.0, 1.24, "vermelho")])
    porta_correr(it, 1, -0.55, 0.45, 0.55, H - 0.25, W / 2, "branco", sentido=1, janela=(1.7, 2.3),
                 faixas=[(0.0, 0.62, "cinza_claro"), (1.0, 1.24, "vermelho")])
    for s in (-1, 1):
        for y in (yf, yt):
            roda(it, s * (W / 2 - 0.15), y, r, 0.28, cor_aro="cinza_claro")
    it.assento("assento_motorista", -0.5, -L / 2 + 1.5, 0.9)
    it.assento("assento_1", 0.5, -L / 2 + 1.5, 0.9)
    it.assento("assento_maca", 0.0, 1.2, 0.85)
    it.assento("assento_2", -0.6, 0.2, 0.85)
    it.colisao([((0, -L / 2 + 0.9, 0), (W, 1.9, 2.3)), ((0, 0.9, 0), (W, L - 1.75, H + 0.15))])


@peca("food_truck_sorvete", "Food truck de sorvete", "food_truck", ["van", "rua", "comida", "toldo"])
def p_food_truck(it):
    L, W, H = 6.0, 2.2, 2.85
    fx = [(0.0, 1.0, "turquesa"), (1.0, 1.22, "laranja"), (1.22, 9.0, "branco")]
    furgao_base(it, L, W, H, "turquesa", faixas=fx)
    # janela de atendimento (direita) com balcão, vidro de correr e toldo listrado
    y0, y1, z0, z1 = -0.65, 1.75, 1.35, 2.35
    it.add(mb.caixa(0.04, y1 - y0 + 0.16, z1 - z0 + 0.16, x=W / 2 + 0.005, y=(y0 + y1) / 2, z=z0 - 0.08,
                    cor="branco_gelo", bisel=0.02, seg=1))
    it.add(mb.caixa(0.02, y1 - y0, z1 - z0, x=W / 2 + 0.02, y=(y0 + y1) / 2, z=z0, cor=None, mat="janela", bisel=0.0))
    it.add(mb.caixa(0.32, y1 - y0 + 0.1, 0.06, x=W / 2 + 0.15, y=(y0 + y1) / 2, z=z0 - 0.06, cor="madeira_mel",
                    bisel=0.02, seg=1))
    vid = mb.caixa(0.02, (y1 - y0) / 2, z1 - z0 - 0.04, x=W / 2 + 0.05, y=y0 + (y1 - y0) * 0.25, z=z0 + 0.02,
                   cor=None, mat="vidro", bisel=0.0)
    fr = mb.caixa(0.03, (y1 - y0) / 2 + 0.04, 0.05, x=W / 2 + 0.05, y=y0 + (y1 - y0) * 0.25, z=z0, cor="cromo",
                  bisel=0.01, seg=1)
    fr2 = mb.caixa(0.03, (y1 - y0) / 2 + 0.04, 0.05, x=W / 2 + 0.05, y=y0 + (y1 - y0) * 0.25, z=z1 - 0.05,
                   cor="cromo", bisel=0.01, seg=1)
    it.correr([vid, fr, fr2], direcao=(0, 1, 0), curso=(y1 - y0) / 2 - 0.05, nome="janela_atendimento")
    n = 8
    lw = (y1 - y0 + 0.5) / n
    for k in range(n):
        ya = y0 - 0.25 + lw * k
        cor = "rosa" if k % 2 == 0 else "branco"
        pano = mb.caixa(0.9, lw + 0.002, 0.03, x=0, y=ya + lw / 2, z=0, cor=cor, bisel=0.008, seg=1)
        mb.transforma(pano, rot=("Y", 18))
        mb.transforma(pano, loc=(W / 2 + 0.43, 0, z1 + 0.28))
        it.add(pano)
        bico = mb.cilindro(lw / 2, 0.03, x=W / 2 + 0.86, y=ya + lw / 2, z=z1 + 0.12, cor=cor, eixo="x", seg=10,
                           bisel=0.0)
        it.add(bico)
    for y in (y0 - 0.2, y1 + 0.2):
        it.add(barra([(W / 2 + 0.01, y, z1 + 0.05), (W / 2 + 0.82, y, z1 + 0.14)], 0.018, cor="cromo", n=5))
    it.add(adesivo_lados("cardapio", W, -1.35, 1.85, 0.9, 0.45, "cardapio_sorvete", so="dir"))
    it.add(adesivo_lados("placa_lado", W, 0.5, 1.85, 2.0, 0.66, "placa_sorvete", so="esq"))
    # teto: casquinha gigante com bola de sorvete, placa SORVETE e alto-falantes
    zt = H
    casq = mb.torno([(0.0, 0.0), (0.12, 0.1), (0.24, 0.32), (0.3, 0.42), (0.36, 0.56), (0.4, 0.72), (0.45, 0.9),
                     (0.5, 0.95), (0.0, 0.95)], x=0, y=0.6, z=zt + 0.02, cor="caramelo", seg=16)
    it.add(casq)
    for k in range(4):
        z = zt + 0.25 + k * 0.17
        rk = 0.13 + (z - zt) * 0.38
        it.add(mb.torno([(rk + 0.03, -0.02), (rk + 0.03, 0.02)], x=0, y=0.6, z=z, cor="madeira_mel", seg=16))
    it.add(mb.cilindro(0.18, 0.06, y=0.6, z=zt - 0.02, cor="branco", seg=14))
    it.add(mb.esfera(0.62, y=0.6, z=zt + 1.42, cor="azul_claro", seg=18, esc=(1, 1, 0.92)))
    it.add(mb.torno([(0.0, 0.0), (0.66, 0.0), (0.62, 0.1), (0.66, 0.2), (0.6, 0.26), (0.0, 0.28)], y=0.6,
                    z=zt + 0.86, cor="azul_claro", seg=18))
    rnd = random.Random(3)
    for k in range(34):
        th, ph = rnd.uniform(0, 2 * math.pi), rnd.uniform(-0.1, 1.2)
        nv = V((math.cos(th) * math.cos(ph), math.sin(th) * math.cos(ph), math.sin(ph) * 0.92))
        c = V((0, 0.6, zt + 1.42)) + nv * 0.615
        conf = mb.caixa(0.035, 0.11, 0.035, z=-0.0175, cor=rnd.choice(["rosa", "amarelo", "verde_lima", "branco",
                                                                         "laranja", "violeta"]), bisel=0.0)
        mb.transforma(conf, rot=[("Z", math.degrees(th) + rnd.uniform(-60, 60)), ("X", math.degrees(ph))])
        mb.transforma(conf, loc=tuple(c))
        it.add(conf)
    it.add(mb.esfera(0.13, y=0.6, z=zt + 2.07, cor="vermelho", seg=12))
    it.add(barra([(0, 0.6, zt + 2.17), (0.05, 0.62, zt + 2.32), (0.12, 0.66, zt + 2.38)], 0.015, cor="verde_escuro",
                 n=5))
    # placa SORVETE na frente do teto
    yp = -L / 2 + 1.05
    it.add(mb.caixa(1.7, 0.12, 0.62, y=yp, z=zt + 0.18, cor="magenta", bisel=0.05, seg=2))
    it.add(adesivo_frente("placa", yp - 0.065, 0, zt + 0.49, 1.58, 0.52, "placa_sorvete", emissao=1.2))
    for s in (-1, 1):
        it.add(mb.cilindro(0.035, 0.2, x=s * 0.6, y=yp + 0.02, z=zt - 0.02, cor="cromo", seg=6))
        cone = mb.cilindro(0.06, 0.24, x=s * 0.82, y=-L / 2 + 0.6, z=zt + 0.22, cor="branco", eixo="y", r2=0.13,
                           seg=12)
        it.add(cone, mb.cilindro(0.03, 0.22, x=s * 0.82, y=-L / 2 + 0.75, z=zt, cor="grafite", seg=6))
    porta_traseira_dupla(it, L / 2, W, 0.5, H - 0.18, -W / 2 + 0.14, W / 2 - 0.14, "branco", janela_z=(1.6, H - 0.45),
                         faixas=fx)
    it.slot("balcao", (W / 2 + 0.15, 0.55, z0 - 0.03), (0.3, 2.4, 0.5))
    it.assento("assento_2", 0.45, 0.5, 0.95)
    it.colisao([((0, 0, 0), (W, L + 0.1, H)), ((W / 2 + 0.2, 0.55, z0 - 0.1), (0.4, 2.5, 0.12)),
                ((0, 0.6, H), (1.3, 1.3, 2.1))])


# ======================================================================================================================
# CAMINHÕES (cabine avançada): baú, som, lixo, bombeiros
# ======================================================================================================================
def cabine(it, W, H, y0, Lc, cor, faixas=None, r=0.48, y_roda=None, zb=0.62, portas=((0.38, 1.45),),
           crew=False, grade_cor="cromo"):
    """Cabine avançada (motor embaixo): frente reta com o para-brisa inclinado, portas altas, degraus."""
    yr = y_roda if y_roda is not None else y0 + 0.78
    ra = r + 0.08
    pa, pb = (y0 + 0.24, H), (y0 + 0.06, 1.78)
    poly = [(y0, zb, 0.12)] + arco_roda(yr, r, ra, zb) + [(y0 + Lc, zb, 0.04), (y0 + Lc, H, 0.18),
                                                           (pa[0], pa[1], 0.36), (pb[0], pb[1], 0.1),
                                                           (y0, 1.58, 0.12)]
    corpo = lataria(poly, W, cor, bisel=0.1, n=4)
    if faixas:
        faixas_cor(corpo, faixas)
    it.add(corpo)
    it.add(placa(pa, pb, -W / 2 + 0.12, W / 2 - 0.12, mat=MAT_VIDRO_CARRO, t0=0.3, t1=0.9, bisel=0.03))
    # frente
    it.add(para_choque(W + 0.04, y0 - 0.02, 0.42, a=0.3, cor="grafite"))
    it.add(grade(W * 0.5, y0, 0.9, 1.45, n=4, cor=grade_cor))
    for s in (-1, 1):
        it.add(mb.caixa(0.36, 0.08, 0.2, x=s * (W / 2 - 0.3), y=y0 + 0.02, z=1.05, cor=None, mat="luz", bisel=0.03,
                        seg=2))
        it.add(mb.caixa(0.12, 0.08, 0.1, x=s * (W / 2 - 0.3), y=y0 + 0.02, z=0.9, cor="laranja", bisel=0.02,
                        seg=1))
        it.add(retrovisor(s * (W / 2 - 0.02), y0 + 0.35, 2.1, s, haste=0.28, tam=(0.08, 0.16, 0.42)))
        it.add(mb.caixa(0.32, 0.5, 0.06, x=s * (W / 2 - 0.1), y=y0 + 0.95, z=0.55, cor="metal", bisel=0.02,
                        seg=1))
        for k, (a, b) in enumerate(portas):
            porta_lateral(it, s, y0 + a, y0 + b, 1.12, H - 0.16, W, cor,
                          janela=(y0 + a + 0.08, y0 + b - 0.08, 1.85, H - 0.28, 0.06), faixas=faixas)
    for s in (-1, 1):
        roda(it, s * (W / 2 - 0.18), yr, r, 0.32, cor_aro="cinza_claro")
    it.assento("assento_motorista", -0.55, y0 + 0.9, 1.45)
    it.assento("assento_1", 0.55, y0 + 0.9, 1.45)
    if crew:
        it.assento("assento_2", -0.55, y0 + 2.0, 1.45)
        it.assento("assento_3", 0.55, y0 + 2.0, 1.45)
    return yr


def chassi(it, W, y0, y1, ys_tras, r=0.48, cor="grafite", z=0.62, para_lamas=True):
    it.add(mb.caixa(0.22, y1 - y0, 0.26, x=-0.45, y=(y0 + y1) / 2, z=z, cor=cor, bisel=0.03, seg=1))
    it.add(mb.caixa(0.22, y1 - y0, 0.26, x=0.45, y=(y0 + y1) / 2, z=z, cor=cor, bisel=0.03, seg=1))
    for y in ys_tras:
        for s in (-1, 1):
            roda(it, s * (W / 2 - 0.3), y, r, 0.26, dupla=True, cor_aro="cinza_claro")
    if para_lamas:
        for s in (-1, 1):
            ya, yb = min(ys_tras) - r - 0.12, max(ys_tras) + r + 0.12
            it.add(mb.caixa(0.62, yb - ya, 0.05, x=s * (W / 2 - 0.3), y=(ya + yb) / 2, z=2 * r + 0.06, cor=cor,
                            bisel=0.02, seg=1))
    it.add(mb.caixa(W - 0.1, 0.12, 0.22, y=y1, z=0.52, cor=cor, bisel=0.03, seg=1))  # para-choque traseiro
    for s in (-1, 1):
        it.add(lanterna(s * (W / 2 - 0.25), y1 + 0.06, 0.72, l=0.3, a=0.12))


@peca("caminhao_bau", "Caminhão-baú", "caminhao_bau", ["caminhao", "rua", "entrega"])
def p_caminhao_bau(it):
    L, W = 7.6, 2.45
    y0 = -L / 2
    cabine(it, W, 2.8, y0, 2.0, "branco", faixas=[(0.0, 0.85, "cinza_claro")])
    yb0, yb1 = y0 + 2.12, L / 2 - 0.05
    chassi(it, W, y0 + 1.6, yb1, [1.95, 3.05 - 0.05])
    zb0, zb1 = 0.95, 3.55
    it.add(mb.caixa(W, yb1 - yb0, zb1 - zb0, y=(yb0 + yb1) / 2, z=zb0, cor="cinza_claro", bisel=0.06, seg=2))
    it.add(mb.caixa(W + 0.04, yb1 - yb0 + 0.04, 0.1, y=(yb0 + yb1) / 2, z=zb1 - 0.08, cor="cinza", bisel=0.03,
                    seg=1))
    it.add(mb.caixa(W + 0.04, yb1 - yb0 + 0.04, 0.12, y=(yb0 + yb1) / 2, z=zb0 - 0.02, cor="cinza", bisel=0.03,
                    seg=1))
    for k in range(9):
        y = yb0 + 0.35 + k * (yb1 - yb0 - 0.7) / 8
        it.add(mb.caixa(W + 0.03, 0.06, zb1 - zb0 - 0.24, y=y, z=zb0 + 0.12, cor="cinza", bisel=0.015, seg=1))
    for s in (-1, 1):
        for y, zz in ((yb0 + 0.05, zb1 - 0.12), (yb1 - 0.05, zb1 - 0.12)):
            it.add(mb.caixa(0.08, 0.08, 0.08, x=s * (W / 2 - 0.05), y=y, z=zz, cor=None, mat="luz", bisel=0.02,
                            seg=1))
    tampa_traseira(it, yb1, W, zb0 + 0.1, zb1 - 0.12, -W / 2 + 0.1, W / 2 - 0.1, "branco_gelo", angulo=88,
                   nome="porta_bau")
    it.slot("bau", (0, (yb0 + yb1) / 2, zb0 + 0.12), (W - 0.2, yb1 - yb0 - 0.2, zb1 - zb0 - 0.3))
    it.colisao([((0, y0 + 1.0, 0), (W, 2.1, 2.85)), ((0, (yb0 + yb1) / 2, 0), (W, yb1 - yb0 + 0.1, zb1))])


def alto_falante(x, y, z, r, lado, aro="neon", cor_caixa="grafite"):
    s = lado
    ps = [mb.cilindro(r + 0.05, 0.06, x=x + s * 0.03, y=y, z=z, cor=cor_caixa, eixo="x", seg=16, bisel=0.015),
          mb.cilindro(r * 0.86, 0.04, x=x + s * 0.07, y=y, z=z, cor="preto", eixo="x", seg=16, r2=r * 0.5,
                      bisel=0.0),
          mb.esfera(r * 0.24, x=x + s * 0.07, y=y, z=z, cor="cromo", seg=10, esc=(0.6, 1, 1))]
    anel = mb.torno([(r * 0.92, -0.025), (r * 1.02, -0.025), (r * 1.02, 0.025), (r * 0.92, 0.025)], cor=None,
                    mat=aro, seg=16)
    mb.transforma(anel, rot=("Y", 90))
    mb.transforma(anel, loc=(x + s * 0.075, y, z))
    ps.append(anel)
    return ps


@peca("caminhao_som", "Caminhão de som", "caminhao_som", ["caminhao", "rua", "festa", "neon"])
def p_caminhao_som(it):
    L, W = 7.4, 2.45
    y0 = -L / 2
    cabine(it, W, 2.8, y0, 2.0, "laranja", faixas=[(0.0, 1.05, "rosa"), (1.05, 1.15, "turquesa")])
    yb0, yb1 = y0 + 2.1, L / 2 - 0.05
    chassi(it, W, y0 + 1.6, yb1, [1.85, 2.95])
    zb0, zb1 = 0.95, 3.45
    it.add(mb.caixa(W, yb1 - yb0, zb1 - zb0, y=(yb0 + yb1) / 2, z=zb0, cor="azul", bisel=0.08, seg=2))
    it.add(mb.caixa(W + 0.06, yb1 - yb0 - 0.9, zb1 - zb0 - 0.6, y=(yb0 + yb1) / 2 + 0.2, z=zb0 + 0.3, cor="magenta",
                    bisel=0.06, seg=2))
    it.add(mb.caixa(W + 0.04, 0.5, 0.75, y=yb0 - 0.05, z=zb1 - 0.15, cor="azul_medio", bisel=0.08, seg=2))
    for s in (-1, 1):
        xf = s * (W / 2 + 0.03)
        for (y, z, rr_, aro) in ((yb0 + 1.05, 1.75, 0.55, "neon"), (yb1 - 0.95, 1.75, 0.55, "neon_rosa"),
                                 ((yb0 + yb1) / 2 + 0.05, 1.75, 0.32, "neon_roxo")):
            it.add(alto_falante(xf, y, z, rr_, s, aro=aro))
        for k in range(4):
            y = (yb0 + yb1) / 2 - 0.75 + k * 0.5
            it.add(mb.cilindro(0.11, 0.05, x=xf + s * 0.02, y=y, z=zb1 - 0.48, cor="amarelo", eixo="x", seg=12,
                               bisel=0.01))
            it.add(mb.cilindro(0.06, 0.05, x=xf + s * 0.045, y=y, z=zb1 - 0.48, cor="grafite_escuro", eixo="x", seg=10,
                               bisel=0.0))
    it.add(adesivo_lados("equalizador", W + 0.06, (yb0 + yb1) / 2 + 0.05, 2.5, 0.9, 0.42, "equalizador",
                         emissao=1.4))
    # tela do equalizador também atrás, e caixas no teto
    it.add(adesivo_frente("eq_tras", yb1 + 0.006, 0, 2.6, 1.2, 0.6, "equalizador", emissao=1.4, tras=True))
    for s in (-1, 1):
        it.add(mb.caixa(0.7, 0.6, 0.5, x=s * 0.6, y=yb0 + 0.6, z=zb1, cor="grafite", bisel=0.05, seg=2))
        it.add(alto_falante(s * 0.6, yb0 + 0.3 - 0.075, zb1 + 0.25, 0.18, -1, aro="neon_rosa")
               if False else [])
        cone = mb.cilindro(0.2, 0.06, x=s * 0.6, y=yb0 + 0.31, z=zb1 + 0.25, cor="preto", eixo="y", r2=0.1, seg=14)
        anel = mb.cilindro(0.23, 0.03, x=s * 0.6, y=yb0 + 0.29, z=zb1 + 0.25, cor=None, mat="neon", eixo="y",
                           seg=14, bisel=0.0)
        it.add(cone, anel)
    porta_traseira_dupla(it, yb1, W, zb0 + 0.1, zb1 - 0.12, -W / 2 + 0.1, W / 2 - 0.1, "azul_medio",
                         janela_z=None)
    it.colisao([((0, y0 + 1.0, 0), (W, 2.1, 2.85)), ((0, (yb0 + yb1) / 2, 0), (W + 0.2, yb1 - yb0 + 0.1, zb1 + 0.5))])


@peca("caminhao_lixo", "Caminhão de lixo verde (reciclagem)", "caminhao_lixo", ["caminhao", "rua", "reciclagem"])
def p_caminhao_lixo(it):
    L, W = 7.8, 2.45
    y0 = -L / 2
    cabine(it, W, 2.75, y0, 2.0, "verde_lima", faixas=[(0.0, 0.85, "verde"), (2.55, 9, "branco")])
    sirene(it, [mb.cilindro(0.1, 0.16, x=0, y=y0 + 1.2, z=2.75, cor=None, mat="luz", seg=12, bisel=0.03)],
           "amarela", periodo=1.0)
    it.add(mb.cilindro(0.13, 0.04, x=0, y=y0 + 1.2, z=2.73, cor="grafite", seg=12))
    yb0 = y0 + 2.12
    yh = L / 2 - 1.25
    chassi(it, W, y0 + 1.6, L / 2 - 0.05, [1.6, 2.7])
    poly = [(yb0, 0.95, 0.05), (yh, 0.95, 0.0), (yh, 3.3, 0.12), (yb0 + 1.6, 3.35, 1.0), (yb0, 3.0, 0.4)]
    corpo = lataria(poly, W, "verde", bisel=0.12, n=5)
    it.add(corpo)
    for s in (-1, 1):  # trilhos do teto e frisos
        it.add(barra([(s * (W / 2 - 0.15), yb0 + 1.0, 3.42), (s * (W / 2 - 0.15), yh - 0.15, 3.42)], 0.03,
                     cor="verde_escuro"))
        for y in (yb0 + 1.2, yh - 0.3):
            it.add(mb.cilindro(0.025, 0.12, x=s * (W / 2 - 0.15), y=y, z=3.3, cor="verde_escuro", seg=6))
        it.add(mb.caixa(0.03, yh - yb0 - 0.3, 0.06, x=s * (W / 2 + 0.005), y=(yb0 + yh) / 2, z=1.3,
                        cor="verde_escuro", bisel=0.01, seg=1))
    it.add(adesivo_lados("reciclagem", W + 0.01, (yb0 + yh) / 2 + 0.1, 2.15, 1.25, 1.25, "reciclagem"))
    # caçamba traseira (abre levantando)
    yc1 = L / 2 + 0.1
    cpoly = [(yh + 0.02, 0.85, 0.06), (yc1 - 0.25, 0.85, 0.1), (yc1, 1.45, 0.12), (yc1 - 0.2, 3.05, 0.3),
             (yh + 0.02, 3.28, 0.06)]
    cac = lataria(cpoly, W - 0.05, "verde_medio", bisel=0.08, n=4, nome="cacamba")
    boca = mb.caixa(W - 0.5, 0.06, 0.5, y=yc1 - 0.05, z=1.05, cor="grafite_escuro", bisel=0.03, seg=1)
    mb.transforma(boca, rot=("X", -25))
    mb.transforma(boca, loc=(0, -0.12, 0.18))
    objs = [cac, boca]
    for s in (-1, 1):
        objs.append(lanterna(s * (W / 2 - 0.2), yc1 - 0.04, 2.6, l=0.14, a=0.28))
        objs.append(barra([(s * (W / 2 - 0.08), yc1 - 0.35, 1.0), (s * (W / 2 + 0.02), yc1 - 0.22, 1.2),
                           (s * (W / 2 + 0.02), yc1 - 0.32, 2.2), (s * (W / 2 - 0.08), yc1 - 0.42, 2.4)], 0.025,
                          cor="amarelo", curva=0.08))
    it.porta(objs, (0, yh + 0.02, 3.25), eixo="x", angulo=55, nome="cacamba")
    for s in (-1, 1):  # estribos de trás
        it.add(mb.caixa(0.55, 0.32, 0.05, x=s * 0.75, y=yc1 - 0.05, z=0.55, cor="metal", bisel=0.02, seg=1))
    it.slot("cacamba", (0, yh + 0.55, 0.95), (W - 0.4, 0.8, 1.2))
    it.colisao([((0, y0 + 1.0, 0), (W, 2.1, 2.8)), ((0, (yb0 + yc1) / 2, 0), (W, yc1 - yb0, 3.45))])


def escada(L, larg, z, y_frente, n_degraus, cor="cinza_claro", alt=0.16):
    """Escada deitada (de bombeiros) de y_frente até y_frente + L."""
    ps = []
    for s in (-1, 1):
        ps.append(mb.caixa(0.07, L, alt, x=s * larg / 2, y=y_frente + L / 2, z=z, cor=cor, bisel=0.02, seg=1))
    for k in range(n_degraus):
        y = y_frente + 0.2 + k * (L - 0.4) / max(1, n_degraus - 1)
        ps.append(mb.caixa(larg, 0.05, 0.04, y=y, z=z + alt * 0.5, cor="metal", bisel=0.0))
    return ps


@peca("caminhao_bombeiros", "Caminhão de bombeiros com escada", "bombeiros",
      ["caminhao", "rua", "emergencia", "sirene", "escada"])
def p_bombeiros(it):
    L, W = 8.8, 2.5
    y0 = -L / 2
    H = 2.85
    fx = [(0.0, 0.85, "vermelho_escuro"), (0.85, 2.3, "vermelho"), (2.3, 9.0, "branco")]
    cabine(it, W, H, y0, 2.95, "vermelho", faixas=fx, y_roda=y0 + 0.95,
           portas=((0.5, 1.45), (1.58, 2.5)), crew=True)
    giroflex(it, y0 + 0.55, H, W=1.6)
    it.add(adesivo_frente("testeira", y0 + 0.22 - 0.04, 0, H - 0.12, 1.4, 0.18, "testeira_bombeiros"))
    yb0, yb1 = y0 + 3.05, L / 2 - 0.05
    chassi(it, W, y0 + 2.6, yb1, [2.0, 3.25])
    zb0, zb1 = 0.9, 2.75
    it.add(mb.caixa(W, yb1 - yb0, zb1 - zb0, y=(yb0 + yb1) / 2, z=zb0, cor="vermelho", bisel=0.06, seg=2))
    it.add(mb.caixa(W + 0.04, yb1 - yb0 + 0.02, 0.1, y=(yb0 + yb1) / 2, z=zb1 - 0.02, cor="cromo", bisel=0.03, seg=1))
    # compartimentos: três de cada lado (o do meio abre), faixa BOMBEIROS em cima
    comps = [(yb0 + 0.15, yb0 + 1.25), (yb0 + 1.35, yb0 + 2.75), (yb0 + 2.85, yb1 - 1.5)]
    for s in (-1, 1):
        for k, (a, b) in enumerate(comps):
            if k == 1:
                portinhola_lado(it, s, a, b, 1.0, 2.1, W / 2, "metal_claro", frisos=5, cor_friso="metal")
            else:
                it.add(mb.caixa(0.04, b - a, 1.1, x=s * (W / 2 + 0.005), y=(a + b) / 2, z=1.0, cor="metal_claro",
                                bisel=0.012, seg=1))
                for j in range(5):
                    it.add(mb.caixa(0.012, b - a - 0.06, 0.03, x=s * (W / 2 + 0.026), y=(a + b) / 2,
                                    z=1.0 + 1.1 * (j + 1) / 6 - 0.015, cor="metal", bisel=0.0))
    it.add(adesivo_lados("bombeiros", W, (yb0 + yb1) / 2 - 0.3, 2.42, 2.6, 0.38, "faixa_bombeiros"))
    it.add(adesivo_lados("bombeiros_cab", W, y0 + 2.0, 1.55, 0.9, 0.13, "testeira_bombeiros"))
    # traseira: degraus e mangueira enrolada
    it.add(mb.caixa(W - 0.3, 0.3, 0.05, y=yb1 + 0.12, z=0.55, cor="metal", bisel=0.02, seg=1))
    for s in (-1, 1):
        it.add(barra([(s * (W / 2 - 0.12), yb1 + 0.02, 1.2), (s * (W / 2 - 0.12), yb1 + 0.12, 1.3),
                      (s * (W / 2 - 0.12), yb1 + 0.12, 2.4), (s * (W / 2 - 0.12), yb1 + 0.02, 2.5)], 0.025,
                     cor="cromo", curva=0.06))
        sirene(it, mb.caixa(0.14, 0.14, 0.12, x=s * (W / 2 - 0.1), y=yb1 - 0.1, z=zb1 + 0.08, cor=None,
                            mat="luz_vermelha", bisel=0.04, seg=2), "vermelha", fase=0.4 if s > 0 else 0.0)
    carretel = mb.cilindro(0.42, 0.9, x=0, y=yb1 - 0.55, z=zb1 + 0.5, cor="amarelo", eixo="x", seg=16, bisel=0.02)
    it.add(carretel, mb.cilindro(0.47, 0.06, x=-0.48, y=yb1 - 0.55, z=zb1 + 0.5, cor="grafite", eixo="x", seg=16),
           mb.cilindro(0.47, 0.06, x=0.48, y=yb1 - 0.55, z=zb1 + 0.5, cor="grafite", eixo="x", seg=16))
    # escada sobre a plataforma giratória (levanta a frente)
    yp = yb1 - 1.45
    zp = zb1 + 0.08
    it.add(mb.cilindro(0.75, 0.16, y=yp, z=zb1 + 0.08, cor="grafite", seg=20, bisel=0.03))
    it.add(mb.caixa(0.95, 0.9, 0.42, y=yp, z=zp + 0.16, cor="vermelho", bisel=0.08, seg=2))
    zpiv = zp + 0.5
    esc = escada(7.4, 0.86, zpiv - 0.05, yp - 7.2, 18) + escada(6.4, 0.66, zpiv + 0.12, yp - 6.2, 15, cor="metal_claro")
    esc.append(mb.cilindro(0.1, 1.0, x=0, y=yp, z=zpiv, cor="cromo", eixo="x", seg=10))
    it.porta(esc, (0, yp, zpiv), eixo="x", angulo=-38, nome="escada")
    # apoio da escada sobre a cabine
    for s in (-1, 1):
        it.add(mb.caixa(0.08, 0.08, zpiv - H - 0.05, x=s * 0.5, y=y0 + 1.6, z=H, cor="grafite", bisel=0.01, seg=1))
    it.add(mb.caixa(1.1, 0.12, 0.08, y=y0 + 1.6, z=zpiv - 0.13, cor="grafite", bisel=0.02, seg=1))
    it.colisao([((0, y0 + 1.45, 0), (W, 2.95, H + 0.2)), ((0, (yb0 + yb1) / 2, 0), (W, yb1 - yb0 + 0.3, zb1 + 0.95)),
                ((0, yp - 3.2, zpiv - 0.1), (0.95, 7.4, 0.4))])


# ======================================================================================================================
# ÔNIBUS
# ======================================================================================================================
def porta_onibus(it, y0, y1, z0, z1, W, cor_moldura="grafite", folga=0.014, lado=1):
    """Porta de duas folhas de vidro (lado direito), cada folha abrindo para fora pela borda de fora."""
    s = lado
    ym = (y0 + y1) / 2
    for k, (a, b) in enumerate(((y0, ym - 0.006), (ym + 0.006, y1))):
        objs = [mb.caixa(0.035, b - a, z1 - z0, x=s * (W / 2 + folga - 0.0175), y=(a + b) / 2, z=z0, cor=cor_moldura,
                         bisel=0.012, seg=1, nome="folha"),
                mb.caixa(0.02, b - a - 0.12, z1 - z0 - 0.3, x=s * (W / 2 + folga + 0.006), y=(a + b) / 2, z=z0 + 0.2,
                         cor=None, mat="janela_apagada", bisel=0.0, nome="vidro")]
        piv = (s * (W / 2 + folga), a if k == 0 else b, (z0 + z1) / 2)
        ang = -85 if k == 0 else 85
        it.porta(objs, piv, eixo="z", angulo=ang * s, nome=it.nome("porta_onibus"))
    it.add(mb.caixa(0.012, y1 - y0 - 0.06, z1 - z0 - 0.06, x=s * (W / 2 - 0.002), y=ym, z=z0 + 0.03,
                    cor="grafite_escuro", bisel=0.0, nome="vao"))
    for k in range(2):  # degraus
        it.add(mb.caixa(0.06, y1 - y0 - 0.1, 0.03, x=s * (W / 2 - 0.01), y=ym, z=z0 + 0.22 + k * 0.28, cor="cinza_claro",
                        bisel=0.0))


def onibus(it, L, W, H, cor_baixo, cor_cima, cor_teto, led, estilo="bolha", r=0.5, n_jan=6, semente=1,
           faixas_extra=(), portas_meio=False, z_cinta=1.3, zj=(1.55, 2.6), cor_saia=None):
    zb = 0.42
    ra = r + 0.08
    if estilo == "capo":
        yf, yt = -L / 2 + 0.95, L / 2 - 2.5
    else:
        yf, yt = -L / 2 + 2.25, L / 2 - 2.5
    if estilo == "bolha":
        pa, pb = (-L / 2 + 0.55, H), (-L / 2 - 0.02, 1.2)
        topo = [(L / 2, zb, 0.25), (L / 2, H, 0.75), (pa[0], pa[1], 0.7), (pb[0], pb[1], 0.3), (-L / 2, 0.6, 0.2)]
        t_vid = (0.33, 0.85)
    elif estilo == "reto":
        pa, pb = (-L / 2 + 0.2, H - 0.06), (-L / 2 - 0.02, 1.05)
        topo = [(L / 2, zb, 0.15), (L / 2, H, 0.3), (-L / 2 + 0.35, H, 0.35), (pa[0], pa[1], 0.1),
                (pb[0], pb[1], 0.1), (-L / 2 - 0.02, 0.6, 0.12)]
        t_vid = (0.17, 0.95)
    else:  # capo (escolar)
        pa, pb = (-L / 2 + 1.75, H - 0.02), (-L / 2 + 1.5, 1.62)
        topo = [(L / 2, zb, 0.15), (L / 2, H, 0.32), (pa[0], pa[1], 0.32), (pb[0], pb[1], 0.08),
                (-L / 2 + 0.25, 1.48, 0.28), (-L / 2, 0.95, 0.18), (-L / 2, 0.6, 0.1)]
        t_vid = (0.2, 0.9)
    poly = [(-L / 2 + 0.02, zb, 0.15)] + arco_roda(yf, r, ra, zb) + arco_roda(yt, r, ra, zb) + topo
    corpo = lataria(poly, W, cor_baixo, bisel=0.28 if estilo == "bolha" else 0.1, n=5)
    fx = [(z_cinta, 99, cor_cima), (H - 0.12, 99, cor_teto)] + list(faixas_extra)
    if cor_saia:
        fx = [(0, 0.62, cor_saia)] + fx
    faixas_cor(corpo, fx)
    it.add(corpo)
    it.add(placa(pa, pb, -W / 2 + 0.16, W / 2 - 0.16, mat="janela_apagada", t0=t_vid[0], t1=t_vid[1], bisel=0.03))
    # letreiro de destino no alto do para-brisa
    it.add(quad_em_placa("letreiro", pa, pb, t_vid[0] + 0.07, 0, 1.55, 0.24, led, emissao=1.6))
    # janelas: lado esquerdo (motorista na frente) e direito (porta na frente)
    y_j0 = (-L / 2 + 1.75) if estilo != "capo" else (-L / 2 + 2.55)
    y_j1 = L / 2 - 0.55
    jan = janelas_fileira(W, y_j0, y_j1, zj[0], zj[1], n_jan, semente, montante=0.16, pular=())
    if portas_meio:
        # tira as janelas que caem na porta do meio (lado direito)
        ym0, ym1 = -0.5, 0.75
        jan = [o for o in jan if not (mb.bbox(o)[0].x > 0 and mb.bbox(o)[1].y > ym0 and mb.bbox(o)[0].y < ym1)]
    it.add(jan)
    yd0, yd1 = (-L / 2 + 0.45, -L / 2 + 1.55) if estilo != "capo" else (-L / 2 + 1.65, -L / 2 + 2.45)
    it.add(janelas_fileira(W, yd0 + 0.05, yd1 - 0.05, zj[0], zj[1], 1, semente + 7, lados=(-1,), apagadas=0.0,
                           frias=1.0))
    porta_onibus(it, yd0, yd1, zb + 0.08, zj[1] + 0.05, W)
    if portas_meio:
        porta_onibus(it, -0.45, 0.7, zb + 0.08, zj[1] + 0.05, W)
    # traseira: vidro, lanternas, grade do motor, para-choque
    it.add(placa((L / 2, 1.9), (L / 2, H - 0.25), -W / 2 + 0.25, W / 2 - 0.25, mat="janela_apagada", bisel=0.03,
                 t0=0.0, t1=1.0))
    for s in (-1, 1):
        it.add(lanterna(s * (W / 2 - 0.16), L / 2, 1.45, l=0.18, a=0.55))
        it.add(lanterna(s * (W / 2 - 0.16), L / 2, 0.82, l=0.18, a=0.14, mat="luz"))
    it.add(grade(W * 0.55, L / 2 + 0.01, 0.75, 1.3, n=5, cor="grafite", sinal=1, fundo="grafite_escuro"))
    it.add(para_choque(W + 0.02, L / 2 + 0.02, 0.4, a=0.26, cor="grafite", sinal=1))
    # frente: para-choque, faróis, retrovisores "orelha"
    zf = 0.62 if estilo != "capo" else 0.65
    it.add(para_choque(W + 0.02, -L / 2 - 0.02, 0.38, a=0.28, cor="grafite"))
    yfr = -L / 2 - 0.01
    for s in (-1, 1):
        it.add(farol(s * (W / 2 - 0.32), yfr, zf + 0.33, r=0.13))
        it.add(mb.caixa(0.16, 0.05, 0.08, x=s * (W / 2 - 0.62), y=yfr - 0.01, z=zf + 0.29, cor="laranja", bisel=0.02,
                        seg=1))
        ym = -L / 2 + (0.25 if estilo != "capo" else 1.55)
        it.add(barra([(s * (W / 2 - 0.05), ym, H - 0.35), (s * (W / 2 + 0.22), ym - 0.25, H - 0.3),
                      (s * (W / 2 + 0.24), ym - 0.42, H - 0.6)], 0.025, cor="grafite", curva=0.1))
        it.add(mb.caixa(0.1, 0.16, 0.4, x=s * (W / 2 + 0.24), y=ym - 0.46, z=H - 1.05, cor="grafite", bisel=0.04,
                        seg=2))
    # teto: ar-condicionado
    it.add(mb.caixa(1.6, 2.2, 0.26, y=0.3, z=H - 0.04, cor="cinza_claro", bisel=0.08, seg=2))
    it.add(mb.caixa(1.2, 1.6, 0.04, y=0.3, z=H + 0.21, cor="cinza", bisel=0.02, seg=1))
    # rodas (traseiras duplas)
    for s in (-1, 1):
        roda(it, s * (W / 2 - 0.2), yf, r, 0.34, cor_aro="cinza_claro")
        roda(it, s * (W / 2 - 0.32), yt, r, 0.28, dupla=True, cor_aro="cinza_claro")
    # assentos (poucos, representativos)
    zs = 1.35
    it.assento("assento_motorista", -0.7, -L / 2 + 1.05 if estilo != "capo" else -L / 2 + 2.05, zs)
    k = 1
    for y in (-L / 2 + 3.0, -0.6, 1.4, L / 2 - 1.4):
        for x in (-0.75, 0.75):
            if k <= 7:
                it.assento(f"assento_{k}", x, y, zs)
                k += 1
    it.colisao([((0, 0, 0), (W, L + 0.1, H + 0.25))])
    return yf, yt


@peca("onibus_turismo_azul", "Ônibus de turismo azul com peixes", "onibus_turismo", ["onibus", "rua", "turismo"])
def p_onibus_turismo(it):
    L, W, H = 11.0, 2.55, 3.3
    onibus(it, L, W, H, "azul", "azul_celeste", "azul_celeste", "led_turismo", estilo="bolha", semente=3,
           cor_saia="azul_medio")
    # barbatana no teto
    it.add(lataria([(-L / 2 + 1.2, H - 0.1, 0.05), (-L / 2 + 3.2, H - 0.1, 0.05), (-L / 2 + 1.75, H + 0.85, 0.12),
                    (-L / 2 + 1.45, H + 0.6, 0.18)], 0.16, "turquesa", bisel=0.05, n=4))
    # peixes, bolhas e a faixa TURISMO
    for (y, z, tam, cor) in ((-1.95, 1.0, 0.62, "amarelo"), (-0.65, 0.84, 0.5, "laranja"), (0.6, 1.04, 0.6, "rosa"),
                             (1.85, 0.84, 0.46, "amarelo")):
        it.add(peixe(y, z, tam, cor, W))
    for (y, z, rb) in ((-2.4, 1.18, 0.07), (-2.5, 1.04, 0.045), (-1.05, 1.0, 0.05), (0.15, 1.16, 0.06),
                       (1.4, 1.02, 0.05), (1.3, 1.16, 0.035)):
        it.add(bolha(y, z, rb, W))
    it.add(adesivo_lados("turismo", W, 0.8, 2.82, 2.6, 0.42, "faixa_turismo"))


@peca("onibus_rosa_creme", "Ônibus rosa e creme", "onibus_rosa", ["onibus", "rua"])
def p_onibus_rosa(it):
    L, W, H = 10.2, 2.55, 3.25
    onibus(it, L, W, H, "rosa_escuro", "pessego", "creme", "led_centro", estilo="bolha", semente=5,
           faixas_extra=[(0.0, 0.62, "rosa_escuro"), (1.18, 1.3, "rosa")], z_cinta=1.3)
    it.add(faixa_lado(W, -L / 2 + 0.5, L / 2 - 0.3, 2.78, 2.86, "rosa"))


@peca("onibus_urbano", "Ônibus urbano", "onibus_urbano", ["onibus", "rua", "linha"])
def p_onibus_urbano(it):
    L, W, H = 12.0, 2.55, 3.15
    onibus(it, L, W, H, "verde_medio", "branco", "branco", "led_estacao", estilo="reto", semente=8, n_jan=7,
           portas_meio=True, z_cinta=1.2, zj=(1.4, 2.65), faixas_extra=[(1.2, 1.32, "amarelo")])


@peca("onibus_escolar", "Ônibus escolar amarelo", "onibus_escolar", ["onibus", "rua", "escola"])
def p_onibus_escolar(it):
    L, W, H = 10.0, 2.45, 3.05
    onibus(it, L, W, H, "amarelo", "amarelo", "amarelo", "led_escolar", estilo="capo", semente=11, n_jan=6,
           faixas_extra=[(0.0, 0.62, "grafite"), (1.24, 1.32, "preto"), (1.4, 1.46, "preto")], z_cinta=1.3,
           zj=(1.6, 2.55))
    it.add(adesivo_lados("escolar", W, 1.0, 1.1, 2.4, 0.38, "faixa_escolar"))
    # placa ESCOLAR no teto da frente, pisca-alertas vermelhos e grade cromada do capô
    yp = -L / 2 + 1.95
    it.add(mb.caixa(1.3, 0.1, 0.34, y=yp, z=H - 0.02, cor="preto", bisel=0.03, seg=1))
    it.add(adesivo_frente("placa_escolar", yp - 0.055, 0, H + 0.15, 1.22, 0.28, "placa_escolar"))
    for s in (-1, 1):
        sirene(it, mb.caixa(0.16, 0.08, 0.16, x=s * (W / 2 - 0.18), y=yp - 0.02, z=H - 0.2, cor=None,
                            mat="luz_vermelha", bisel=0.03, seg=2), "vermelha", fase=0.4 if s > 0 else 0.0)
    it.add(grade(1.0, -L / 2 - 0.005, 0.8, 1.3, n=5, cor="cromo"))


# ======================================================================================================================
# CARROS RETRÔ
# ======================================================================================================================
def carro_retro(it, L, W, cor, cor_teto, tipo, aro="cromo", r=0.34, faixa_branca=False, interior="couro"):
    zb = 0.3
    b = 0.86
    yf, yt = -L / 2 + 1.05, L / 2 - 1.1
    ra = r + 0.07
    if tipo == "conversivel":
        topo = [(L / 2, 0.36, 0.1), (L / 2 + 0.03, 0.78, 0.12), (L / 2 - 0.45, b + 0.02, 0.2), (1.15, b, 0.06),
                (1.1, 0.5, 0.05), (-0.58, 0.5, 0.05), (-0.62, b, 0.06), (-L / 2 + 0.55, b - 0.01, 0.28),
                (-L / 2 - 0.03, 0.74, 0.14)]
    else:
        topo = [(L / 2, 0.36, 0.1), (L / 2 + 0.03, 0.78, 0.12), (L / 2 - 0.45, b + 0.02, 0.2),
                (-L / 2 + 0.55, b - 0.01, 0.28), (-L / 2 - 0.03, 0.74, 0.14)]
    poly = [(-L / 2, 0.36, 0.12)] + arco_roda(yf, r, ra, zb) + arco_roda(yt, r, ra, zb) + topo
    corpo = lataria(poly, W, cor, bisel=0.09, n=4)
    it.add(corpo)
    Wc = W - 0.26
    if tipo != "conversivel":
        yc0, yc1 = -0.75, 1.15
        pa, pb = (-0.1, 1.4), (yc0, b - 0.02)
        pc, pd = (yc1, b - 0.02), (0.9, 1.38)
        cab = lataria([(yc0, b - 0.03, 0), (yc1, b - 0.03, 0), (pd[0], pd[1], 0.22), (pa[0], pa[1], 0.24)], Wc,
                      cor_teto, bisel=0.06, n=4, nome="cabine")
        it.add(cab)
        it.add(placa(pa, pb, -Wc / 2 + 0.07, Wc / 2 - 0.07, mat=MAT_VIDRO_CARRO, t0=0.2, t1=0.93, bisel=0.02))
        it.add(placa(pc, pd, -Wc / 2 + 0.1, Wc / 2 - 0.1, mat=MAT_VIDRO_CARRO, t0=0.08, t1=0.78, bisel=0.02))
        it.add(vidro_atravessado([(0.34, b + 0.08, 0.04), (0.84, b + 0.08, 0.04), (0.7, 1.3, 0.06),
                                  (0.34, 1.31, 0.04)], Wc))
        janela = (-0.52, 0.24, b + 0.08, 1.3, 0.04, Wc / 2 + 0.012)
    else:
        janela = None
        # para-brisa com moldura cromada, painel, volante, bancos
        pa, pb = (-0.3, 1.28), (-0.66, b)
        it.add(placa(pa, pb, -Wc / 2 + 0.06, Wc / 2 - 0.06, mat="vidro", t0=0.0, t1=1.0, bisel=0.01,
                     esp=0.02, folga=0.0))
        it.add(placa(pa, pb, -Wc / 2, -Wc / 2 + 0.06, cor="cromo", t0=0.0, t1=1.0, bisel=0.01, esp=0.04,
                     folga=0.01))
        it.add(placa(pa, pb, Wc / 2 - 0.06, Wc / 2, cor="cromo", t0=0.0, t1=1.0, bisel=0.01, esp=0.04, folga=0.01))
        it.add(placa(pa, pb, -Wc / 2, Wc / 2, cor="cromo", t0=0.0, t1=0.08, bisel=0.01, esp=0.04, folga=0.01))
        it.add(mb.caixa(W - 0.2, 0.3, 0.2, y=-0.5, z=b - 0.18, cor=interior, bisel=0.06, seg=2))
        vol = mb.torno([(0.16, -0.015), (0.19, -0.015), (0.19, 0.015), (0.16, 0.015)], cor="preto", seg=14)
        mb.transforma(vol, rot=("X", 60))
        mb.transforma(vol, loc=(-0.4, -0.3, b + 0.02))
        it.add(vol, barra([(-0.4, -0.42, b - 0.1), (-0.4, -0.3, b + 0.02)], 0.02, cor="preto"))
        for y in (-0.05, 0.75):
            it.add(mb.superelipsoide(W - 0.3, 0.5, 0.2, y=y, z=0.5, cor=interior, e=0.3, e_v=0.5, nu=16, nv=6))
            enc = mb.superelipsoide(W - 0.3, 0.18, 0.5, z=-0.25, cor=interior, e=0.3, e_v=0.5, nu=16, nv=6)
            mb.transforma(enc, rot=("X", -12))
            mb.transforma(enc, loc=(0, y + 0.24, 0.87))
            it.add(enc)
        for s in (-1, 1):  # laterais de trás do cockpit
            it.add(mb.caixa(0.1, 0.84, b - 0.5 + 0.02, x=s * (W / 2 - 0.05), y=0.73, z=0.48, cor=cor, bisel=0.03,
                            seg=1))
        mb.pinta_onde(corpo, interior, lambda c, n: c.z < 0.56 and n.z > 0.6 and -0.6 < c.y < 1.15)
    # portas
    for s in (-1, 1):
        porta_lateral(it, s, -0.62 if tipo != "conversivel" else -0.58, 0.3, 0.38, b - 0.01, W, cor, janela=janela,
                      r=0.06, angulo=68)
    # porta-malas
    tampa_horizontal(it, 1.22, L / 2 - 0.5, -W / 2 + 0.18, W / 2 - 0.18, b + 0.02, cor, angulo=60)
    # cromados: para-choques, grade, faróis, lanternas, retrovisores
    it.add(para_choque(W + 0.08, -L / 2 - 0.03, 0.34, a=0.2, cor="cromo"))
    it.add(para_choque(W + 0.08, L / 2 + 0.03, 0.34, a=0.2, cor="cromo", sinal=1))
    it.add(grade(W * 0.55, -L / 2 - 0.035, 0.55, 0.72, n=3, cor="cromo"))
    for s in (-1, 1):
        if tipo == "rabo":
            it.add(farol(s * (W / 2 - 0.2), -L / 2 - 0.03, 0.66, r=0.075))
            it.add(farol(s * (W / 2 - 0.4), -L / 2 - 0.03, 0.66, r=0.075))
        else:
            it.add(farol(s * (W / 2 - 0.26), -L / 2 - 0.03, 0.64, r=0.1))
        it.add(lanterna(s * (W / 2 - 0.2), L / 2 + 0.035, 0.74, l=0.28, a=0.1))
        it.add(retrovisor(s * (Wc / 2 + 0.05), -0.6, b + 0.06, s, haste=0.08, tam=(0.05, 0.08, 0.07), cor="cromo"))
        it.add(mb.caixa(0.03, L - 1.2, 0.035, x=s * (W / 2 + 0.006), y=0.0, z=0.62, cor="cromo", bisel=0.01, seg=1))
    for s in (-1, 1):
        for y in (yf, yt):
            roda(it, s * (W / 2 - 0.13), y, r, 0.24, cor_aro=aro, faixa_branca=faixa_branca, calota="cromo")
    it.assento("assento_motorista", -0.42, -0.1, 0.5)
    it.assento("assento_1", 0.42, -0.1, 0.5)
    it.assento("assento_2", -0.42, 0.72, 0.5)
    it.assento("assento_3", 0.42, 0.72, 0.5)
    alt = b + 0.55 if tipo != "conversivel" else b + 0.4
    it.colisao([((0, 0, 0), (W, L + 0.1, b + 0.02)), ((0, 0.2, b), (Wc, 1.9, alt - b))])


@peca("carro_rabo_de_peixe_rosa", "Carro retrô rosa “rabo de peixe”", "carro_rabo_de_peixe",
      ["carro", "rua", "retro"])
def p_rabo(it):
    L, W = 5.3, 1.98
    carro_retro(it, L, W, "rosa", "rosa", "rabo", faixa_branca=True)
    b = 0.86
    for s in (-1, 1):
        it.add(lataria([(0.9, b - 0.06, 0), (L / 2 + 0.02, b - 0.06, 0), (L / 2 + 0.12, b + 0.62, 0.05),
                        (L / 2 - 0.25, b + 0.42, 0.25)], 0.09, "rosa", bisel=0.03, x=s * (W / 2 - 0.08), n=4))
        it.add(mb.caixa(0.07, 0.08, 0.2, x=s * (W / 2 - 0.08), y=L / 2 + 0.06, z=b + 0.18, cor=None,
                        mat="luz_vermelha", bisel=0.025, seg=1))
    it.add(mb.caixa(0.06, 1.1, 0.03, y=-L / 2 + 0.9, z=b - 0.01, cor="cromo", bisel=0.01, seg=1))


@peca("carro_antigo_laranja", "Carro antigo laranja", "carro_antigo", ["carro", "rua", "retro"])
def p_antigo_laranja(it):
    carro_retro(it, 4.9, 1.9, "laranja_escuro", "cinza_claro", "antigo", aro="laranja")


@peca("carro_antigo_preto", "Carro antigo preto conversível", "carro_antigo_conversivel",
      ["carro", "rua", "retro", "conversivel"])
def p_antigo_preto(it):
    carro_retro(it, 4.9, 1.9, "preto", "preto", "conversivel", aro="cobre", interior="couro")


# ======================================================================================================================
# TRILHOS: trem de passageiros, bonde e trem do tubo
# ======================================================================================================================
def truque(it, y, r, dist, cor="grafite", bitola=X_TR, vel=300):
    """Truque com dois rodeiros (rodas com friso por dentro da via), longarinas por fora das rodas e travessa."""
    for d in (-dist / 2, dist / 2):
        rodeiro(it, y + d, r, bitola, vel)
    for s in (-1, 1):
        x = s * (bitola + 0.17)
        it.add(mb.caixa(0.1, dist + 1.6 * r, 0.2, x=x, y=y, z=r - 0.06, cor=cor, bisel=0.03, seg=1))
        for d in (-dist / 2, dist / 2):
            it.add(mb.caixa(0.14, 0.24, 0.22, x=x + s * 0.02, y=y + d, z=r - 0.11, cor="amarelo_escuro", bisel=0.03,
                            seg=1))
    it.add(mb.caixa(2 * bitola + 0.44, 0.45, 0.16, y=y, z=r + 0.1, cor=cor, bisel=0.03, seg=1))


def engate(it, y, sinal, z=0.95, para_choques=True):
    """Engate na ponta (sinal −1 na frente, +1 atrás): haste, cabeça e dois para-choques de mola."""
    it.add(mb.caixa(0.18, 0.5, 0.16, y=y + sinal * 0.2, z=z - 0.08, cor="ferro", bisel=0.02, seg=1))
    it.add(mb.caixa(0.34, 0.14, 0.26, y=y + sinal * 0.4, z=z - 0.13, cor="ferro", bisel=0.03, seg=1))
    if para_choques:
        for s in (-1, 1):
            it.add(mb.cilindro(0.08, 0.3, x=s * 0.62, y=y + sinal * 0.15, z=z + 0.05, cor="ferro", eixo="y", seg=10,
                               bisel=0.0))
            it.add(mb.cilindro(0.17, 0.05, x=s * 0.62, y=y + sinal * 0.32, z=z + 0.05, cor="grafite", eixo="y",
                               seg=14, bisel=0.01))
    return abs(y) + 0.47


TREM_CORES = {"baixo": "vermelho", "faixa": "amarelo", "cima": "creme_claro", "teto": "cinza"}


@peca("trem_locomotiva", "Trem de passageiros: locomotiva", "trem_passageiros", ["trem", "trilho", "ferrovia"],
      extra={"veiculo": "trem"})
def p_locomotiva(it):
    L, W = 12.0, 3.0
    c = TREM_CORES
    pa, pb = (-L / 2 + 1.9, 4.0), (-L / 2 + 0.55, 2.75)
    poly = [(-L / 2 + 0.25, 0.95, 0.08), (L / 2, 0.95, 0.06), (L / 2, 3.85, 0.35), (pa[0], pa[1], 0.45),
            (pb[0], pb[1], 0.25), (-L / 2, 2.35, 0.35), (-L / 2, 1.25, 0.25)]
    fx = [(0.0, 2.2, c["baixo"]), (2.2, 2.42, c["faixa"]), (2.42, 3.72, c["cima"]), (3.72, 9, c["teto"])]
    corpo = lataria(poly, W, c["baixo"], bisel=0.22, n=5)
    faixas_cor(corpo, fx)
    it.add(corpo)
    it.add(placa(pa, pb, -W / 2 + 0.3, -0.06, mat="janela_apagada", t0=0.26, t1=0.84, bisel=0.03))
    it.add(placa(pa, pb, 0.06, W / 2 - 0.3, mat="janela_apagada", t0=0.26, t1=0.84, bisel=0.03))
    it.add(vidro_atravessado([(-L / 2 + 1.3, 2.7, 0.06), (-L / 2 + 2.2, 2.7, 0.06), (-L / 2 + 2.2, 3.5, 0.06),
                              (-L / 2 + 1.72, 3.5, 0.06)], W, mat="janela"))
    it.add(mb.caixa(W + 0.04, L - 0.3, 0.24, y=0.1, z=0.95, cor="grafite", bisel=0.04, seg=1))  # longarina
    # venezianas do motor
    for y0 in (-L / 2 + 3.6, -0.9, 1.9):
        for s in (-1, 1):
            for k in range(6):
                it.add(mb.caixa(0.03, 2.2, 0.05, x=s * (W / 2 + 0.006), y=y0 + 1.1, z=2.55 + k * 0.17,
                                cor="cinza_medio" if k % 2 else "grafite", bisel=0.0))
    # limpa-trilhos, faróis, lanternas
    it.add(lataria([(-L / 2 - 0.42, 0.14, 0.04), (-L / 2 + 0.6, 0.14, 0.0), (-L / 2 + 0.6, 1.0, 0.0),
                    (-L / 2 + 0.05, 1.0, 0.1)], 2.5, "amarelo_escuro", bisel=0.04, n=3))
    for s in (-1, 1):
        it.add(farol(s * 0.85, -L / 2 + 0.01, 1.8, r=0.16))
        it.add(lanterna(s * 1.15, -L / 2 + 0.03, 1.48, l=0.16, a=0.12, sinal=-1))
        it.add(lanterna(s * 1.1, L / 2, 1.6, l=0.18, a=0.24))
        it.add(lanterna(s * 1.1, L / 2, 1.3, l=0.18, a=0.14, mat="luz"))
        porta_lateral(it, s, -L / 2 + 2.4, -L / 2 + 3.1, 1.22, 3.55, W, c["baixo"],
                      janela=(-L / 2 + 2.48, -L / 2 + 3.02, 2.65, 3.45, 0.05), faixas=fx, mat_vidro="janela")
        for y in (-L / 2 + 2.3, -L / 2 + 3.2):
            it.add(barra([(s * (W / 2 - 0.02), y, 1.4), (s * (W / 2 + 0.08), y, 1.45), (s * (W / 2 + 0.08), y, 3.0),
                          (s * (W / 2 - 0.02), y, 3.05)], 0.025, cor="cromo", curva=0.06))
        it.add(mb.caixa(0.5, 0.45, 0.05, x=s * (W / 2 - 0.2), y=-L / 2 + 2.75, z=0.75, cor="metal", bisel=0.02,
                        seg=1))
    it.add(mb.caixa(0.5, 0.3, 0.22, y=-L / 2 + 2.05, z=3.92, cor="cinza_medio", bisel=0.06, seg=2))
    it.add(farol(0, -L / 2 + 1.9, 4.03, r=0.08, prof=0.04))
    # teto: ventiladores, buzina e escapamento
    for y in (0.0, 2.8):
        it.add(mb.cilindro(0.5, 0.12, y=y, z=3.82, cor="grafite", seg=18, bisel=0.02))
        it.add(mb.cilindro(0.18, 0.06, y=y, z=3.94, cor="cromo", seg=12, bisel=0.01))
    it.add(mb.cilindro(0.06, 0.25, x=0.3, y=-L / 2 + 2.6, z=3.95, cor="cromo", eixo="y", seg=8, r2=0.1))
    it.add(mb.cilindro(0.06, 0.25, x=-0.3, y=-L / 2 + 2.6, z=3.95, cor="cromo", eixo="y", seg=8, r2=0.1))
    it.add(mb.caixa(0.5, 0.3, 0.25, y=1.4, z=3.85, cor="grafite_escuro", bisel=0.05, seg=1))
    # tanque e truques
    it.add(mb.caixa(2.2, 3.4, 0.5, y=0.0, z=0.45, cor="grafite", bisel=0.12, seg=2))
    for y in (-L / 2 + 2.8, L / 2 - 2.6):
        truque(it, y, 0.46, 2.0)
    # porta de intercomunicação atrás
    it.add(mb.caixa(0.9, 0.04, 2.0, y=L / 2 + 0.005, z=1.2, cor="grafite", bisel=0.02, seg=1))
    ef = engate(it, -L / 2 - 0.42, -1, para_choques=False)
    et = engate(it, L / 2, 1)
    it.extra.update({"trilho": {"tipo": "trem", "bitola": 1.6, "x_trilho": X_TR, "z_trilho": Z_TREM,
                                "pecas": ["trilho_reto", "trilho_curva", "trilho_desvio", "trilho_fim",
                                          "trilho_cruzamento_rua", "plataforma_estacao"]},
                     "engate": [round(ef, 3), round(et, 3)], "piso": 1.04})
    it.assento("assento_maquinista", -0.75, -L / 2 + 1.75, 2.05)
    it.assento("assento_1", 0.75, -L / 2 + 1.75, 2.05)
    it.colisao([((0, 0, 0.12), (W, L + 0.6, 3.9))])


def vagao(it, L, W, semente, cauda=False, cores=TREM_CORES):
    c = cores
    re_ = 0.35
    pl = [(-W / 2, -L / 2, re_), (W / 2, -L / 2, re_), (W / 2, L / 2, 0.9 if cauda else re_),
          (-W / 2, L / 2, 0.9 if cauda else re_)]

    def off(d):
        return [(x + (d if x > 0 else -d), y + (d if y > 0 else -d), max(0.02, r + d)) for x, y, r in pl]

    z0, z1, z2, z3, z4 = 1.0, 1.95, 2.95, 3.45, 3.7
    it.add(planta(rr(L - 0.4, W - 0.5, 0.2), 0.85, 1.06, "grafite", bisel=0.03))
    it.add(planta(pl, z0, z1, c["baixo"], bisel=0.06))
    it.add(planta(off(0.012), z1 - 0.07, z1 + 0.01, c["faixa"], bisel=0.01, seg=1))
    it.add(planta(off(-0.03), z1, z2, None, mat="janela" if cauda else "janela_apagada", bisel=0.0, seg=1))
    it.add(planta(pl, z2, z3, c["cima"], bisel=0.04))
    it.add(planta(off(0.03), z3, z4, c["teto"], bisel=0.1, seg=2))
    for y in (-L / 4, L / 4):
        it.add(mb.caixa(1.0, 1.4, 0.16, y=y, z=z4 - 0.02, cor="cinza_claro", bisel=0.05, seg=1))
    # portas (duas por lado, perto das pontas) e janelas
    yd = L / 2 - 1.45
    wd = 1.1
    ya, yb = -yd + wd / 2 + 0.2, yd - wd / 2 - 0.2
    n = 6
    rnd = random.Random(semente)
    mont = 0.2
    w = (yb - ya - mont * (n - 1)) / n
    for s in (-1, 1):
        xl = s * (W / 2 + 0.008 - 0.015)
        for k in range(n):
            yc = ya + k * (w + mont) + w / 2
            it.add(mb.caixa(0.03, w, z2 - z1 - 0.16, x=xl, y=yc, z=z1 + 0.08, cor=None, mat=mat_sorteado(rnd),
                            bisel=0.012, seg=1, nome="janela"))
        for k in range(n + 1):
            yc = ya - mont / 2 + k * (w + mont)
            it.add(mb.caixa(0.05, mont, z2 - z1, x=s * (W / 2 - 0.02), y=yc, z=z1, cor=c["cima"], bisel=0.0))
        for sy in (-1, 1):
            ye = sy * (L / 2 - 0.55) if not (cauda and sy > 0) else None
            if ye is not None:
                it.add(mb.caixa(0.03, 0.5, z2 - z1 - 0.16, x=xl, y=ye, z=z1 + 0.08, cor=None, mat=mat_sorteado(rnd),
                                bisel=0.012, seg=1, nome="janela"))
                for yy in (ye - 0.35, ye + 0.35 if sy < 0 else ye + 0.33):
                    it.add(mb.caixa(0.05, 0.2, z2 - z1, x=s * (W / 2 - 0.02), y=yy, z=z1, cor=c["cima"], bisel=0.0))
            else:  # cauda: janelas grandes até a ponta redonda
                it.add(mb.caixa(0.03, 0.9, z2 - z1 - 0.16, x=xl, y=L / 2 - 1.05, z=z1 + 0.08, cor=None,
                                mat=mat_sorteado(rnd), bisel=0.012, seg=1, nome="janela"))
                it.add(mb.caixa(0.05, 0.2, z2 - z1, x=s * (W / 2 - 0.02), y=L / 2 - 1.6, z=z1, cor=c["cima"],
                                bisel=0.0))
            porta_correr(it, s, sy * yd - wd / 2, sy * yd + wd / 2, 1.06, 2.98, W / 2, c["baixo"], sentido=-sy,
                         curso=0.95, janela=(1.95, 2.8), mat_vidro="janela_apagada",
                         faixas=[(z1 - 0.07, z1 + 0.01, c["faixa"]), (z1 + 0.01, 9, c["cima"])])
    # sanfonas, truques e engates
    pontas = (-1,) if cauda else (-1, 1)
    for sy in pontas:
        it.add(mb.caixa(1.3, 0.3, 2.3, y=sy * (L / 2 + 0.1), z=1.05, cor="grafite", bisel=0.06, seg=1))
        for k in range(3):
            it.add(mb.caixa(1.36, 0.04, 2.36, y=sy * (L / 2 + 0.02 + k * 0.08), z=1.02, cor="grafite_escuro",
                            bisel=0.01, seg=1))
    for y in (-L / 2 + 2.3, L / 2 - 2.3):
        truque(it, y, 0.42, 1.9)
    ef = engate(it, -L / 2, -1)
    et = engate(it, L / 2, 1)
    if cauda:
        for s in (-1, 1):
            it.add(lanterna(s * 0.4, L / 2 - 0.01, 1.5, l=0.22, a=0.16))
            it.add(lanterna(s * 0.4, L / 2 - 0.01, 1.25, l=0.22, a=0.1, mat="luz"))
    it.extra.update({"veiculo": "trem",
                     "trilho": {"tipo": "trem", "bitola": 1.6, "x_trilho": X_TR, "z_trilho": Z_TREM},
                     "engate": [round(ef, 3), round(et, 3)], "piso": 1.04})
    k = 1
    for y in (-L / 2 + 3.0, -1.0, 1.0, L / 2 - 3.0):
        for x in (-0.8, 0.8):
            it.assento(f"assento_{k}", x, y, 1.5)
            k += 1
    it.colisao([((0, 0, 0.3), (W, L + 0.6, z4 - 0.3))])


@peca("trem_vagao_passageiros", "Trem de passageiros: vagão", "trem_passageiros", ["trem", "trilho", "ferrovia"],
      extra={"veiculo": "trem"})
def p_vagao(it):
    vagao(it, 13.0, 3.0, 21)


@peca("trem_vagao_cauda", "Trem de passageiros: vagão do fim (mirante)", "trem_passageiros",
      ["trem", "trilho", "ferrovia"], extra={"veiculo": "trem"})
def p_vagao_cauda(it):
    vagao(it, 13.0, 3.0, 33, cauda=True)


def pantografo(it, y, z, alt=0.75, larg=1.0):
    it.add(mb.caixa(0.9, 0.7, 0.12, y=y, z=z, cor="grafite", bisel=0.03, seg=1))
    for s in (-1, 1):
        for sx in (-1, 1):
            it.add(barra([(sx * 0.3, y + s * 0.3, z + 0.12), (sx * 0.25, y - s * 0.05, z + alt * 0.55),
                          (sx * 0.2, y + s * 0.02, z + alt)], 0.02, cor="grafite", curva=0.0))
    it.add(barra([(-larg / 2, y, z + alt + 0.02), (larg / 2, y, z + alt + 0.02)], 0.03, cor="cinza_medio"))


@peca("bonde", "Bonde amarelo", "bonde", ["bonde", "trilho", "rua"], extra={"veiculo": "bonde"})
def p_bonde(it):
    L, W, R = 10.4, 2.4, 1.0
    pl = rr(L, W, R)

    def off(d):
        return [(x + (d if x > 0 else -d), y + (d if y > 0 else -d), max(0.02, r + d)) for x, y, r in pl]

    z0, z1, z2, z3, z4 = 0.42, 1.27, 2.3, 2.65, 2.8
    it.add(planta(pl, z0, z1, "amarelo", bisel=0.05))
    it.add(planta(off(0.012), z1 - 0.12, z1, "vermelho", bisel=0.01, seg=1))
    it.add(planta(off(0.012), z0, z0 + 0.1, "vermelho_escuro", bisel=0.01, seg=1))
    it.add(planta(off(-0.025), z1, z2, None, mat="janela_apagada", bisel=0.0, seg=1))
    it.add(planta(pl, z2, z3, "creme", bisel=0.03))
    it.add(planta(off(0.04), z3, z4, "cinza_medio", bisel=0.06, seg=2))
    it.add(planta(rr(L - 2.6, 1.3, 0.3), z4 - 0.02, z4 + 0.26, "creme", bisel=0.05))
    it.add(planta(rr(L - 2.5, 1.42, 0.32), z4 + 0.26, z4 + 0.32, "cinza_medio", bisel=0.03, seg=1))
    rnd = random.Random(5)
    for s in (-1, 1):
        for k in range(6):  # janelinhas do lanternim
            it.add(mb.caixa(0.02, 0.8, 0.14, x=s * 0.655, y=-3.0 + k * 1.2, z=z4 + 0.06, cor=None,
                            mat=mat_sorteado(rnd), bisel=0.0))
    # janelas e montantes entre as portas
    ya, yb = -L / 2 + 2.05, L / 2 - 2.05
    n, mont = 5, 0.16
    w = (yb - ya - mont * (n - 1)) / n
    for s in (-1, 1):
        xl = s * (W / 2 + 0.008 - 0.015)
        for k in range(n):
            yc = ya + k * (w + mont) + w / 2
            it.add(mb.caixa(0.03, w, z2 - z1 - 0.12, x=xl, y=yc, z=z1 + 0.06, cor=None, mat=mat_sorteado(rnd),
                            bisel=0.012, seg=1, nome="janela"))
        for k in range(n + 1):
            yc = ya - mont / 2 + k * (w + mont)
            it.add(mb.caixa(0.05, mont, z2 - z1, x=s * (W / 2 - 0.02), y=yc, z=z1, cor="creme", bisel=0.0))
        for sy in (-1, 1):
            porta_correr(it, s, sy * (L / 2 - 1.45) - 0.45, sy * (L / 2 - 1.45) + 0.45, z0 + 0.04, z2, W / 2,
                         "amarelo", sentido=-sy, curso=0.85, janela=(1.3, 2.15), mat_vidro="janela_apagada",
                         faixas=[(z1 - 0.12, z1, "vermelho"), (z1, 9, "amarelo")])
            yp = sy * (L / 2 - 1.45)
            for k in range(2):
                it.add(mb.caixa(0.1, 0.92, 0.04, x=s * (W / 2 - 0.02), y=yp, z=0.12 + k * 0.17, cor="metal",
                                bisel=0.01, seg=1))
    # pontas: farol, lanternas, letreiro, para-choque
    for sy in (-1, 1):
        ye = sy * L / 2
        it.add(farol(0, ye, 0.95, r=0.14, sinal=sy))
        for s in (-1, 1):
            it.add(lanterna(s * 0.5, ye - sy * 0.0, 0.72, l=0.12, a=0.1, sinal=sy))
        it.add(mb.caixa(1.1, 0.08, 0.3, y=ye + sy * 0.0, z=z2 + 0.02, cor="grafite_escuro", bisel=0.02, seg=1))
        it.add(quad_uv("letreiro", (0, ye + sy * 0.045, z2 + 0.17), (1, 0, 0) if sy < 0 else (-1, 0, 0), (0, 0, 1),
                       1.0, 0.24, est("led_bonde", 1.6)))
        it.add(planta([(-0.9, ye - 0.1, 0.1), (0.9, ye - 0.1, 0.1), (0.9, ye + 0.1, 0.1), (-0.9, ye + 0.1, 0.1)],
                      0.34, 0.5, "grafite", bisel=0.03, seg=1))
    pantografo(it, 0.0, z4 + 0.32)
    for y in (-L / 2 + 2.6, L / 2 - 2.6):
        truque(it, y, 0.33, 1.5)
    it.extra.update({"trilho": {"tipo": "bonde", "bitola": 1.6, "x_trilho": X_TR, "z_trilho": Z_BONDE,
                                "faixas_x": [-X_BONDE, X_BONDE],
                                "pecas": ["bonde_rua", "bonde_grama", "bonde_piso", "bonde_rua_curva",
                                          "bonde_grama_curva"]}, "piso": 0.75})
    it.assento("assento_motorneiro", 0.0, -L / 2 + 0.8, 1.2)
    k = 1
    for y in (-2.0, 0.0, 2.0):
        for x in (-0.65, 0.65):
            it.assento(f"assento_{k}", x, y, 1.2)
            k += 1
    it.colisao([((0, 0, 0.05), (W, L, z4 + 0.3))])


@peca("bonde_moderno", "Bonde moderno (VLT)", "bonde_moderno", ["bonde", "trilho", "rua", "vlt"],
      extra={"veiculo": "bonde"})
def p_vlt(it):
    L, W, R = 14.0, 2.6, 1.15
    pl = rr(L, W, R)

    def off(d):
        return [(x + (d if x > 0 else -d), y + (d if y > 0 else -d), max(0.02, r + d)) for x, y, r in pl]

    z0, z1, z2, z3, z4 = 0.3, 0.95, 2.45, 2.9, 3.05
    baixo = planta(pl, z0, z1, "branco", bisel=0.06)
    corta_y(baixo, (-L / 2 + 0.9, L / 2 - 0.9))
    mb.pinta_onde(baixo, "turquesa", lambda c, n: abs(c.y) > L / 2 - 0.9 and abs(n.z) < 0.7)
    it.add(baixo)
    it.add(planta(off(0.012), z1 - 0.1, z1 + 0.01, "turquesa_escuro", bisel=0.01, seg=1))
    it.add(planta(off(-0.03), z1, z2, None, mat="janela_apagada", bisel=0.0, seg=1))
    it.add(planta(pl, z2, z3, "branco", bisel=0.04))
    it.add(planta(off(0.012), z2, z2 + 0.08, "turquesa", bisel=0.01, seg=1))
    it.add(planta(off(0.02), z3, z4, "cinza_claro", bisel=0.06, seg=2))
    for y in (-3.5, 3.5):
        it.add(mb.caixa(1.4, 2.2, 0.35, y=y, z=z4 - 0.02, cor="cinza_claro", bisel=0.1, seg=2))
    rnd = random.Random(9)
    portas = (-4.2, 0.0, 4.2)
    wd = 1.3
    trechos = [(-L / 2 + 1.35, portas[0] - wd / 2 - 0.15), (portas[0] + wd / 2 + 0.15, portas[1] - wd / 2 - 0.15),
               (portas[1] + wd / 2 + 0.15, portas[2] - wd / 2 - 0.15), (portas[2] + wd / 2 + 0.15, L / 2 - 1.35)]
    for s in (-1, 1):
        xl = s * (W / 2 + 0.008 - 0.015)
        for a, b in trechos:
            n = 2
            mont = 0.14
            w = (b - a - mont * (n - 1)) / n
            for k in range(n):
                yc = a + k * (w + mont) + w / 2
                it.add(mb.caixa(0.03, w, z2 - z1 - 0.14, x=xl, y=yc, z=z1 + 0.07, cor=None, mat=mat_sorteado(rnd),
                                bisel=0.012, seg=1, nome="janela"))
            for yc in [a - 0.07 + k * (w + mont) for k in range(n + 1)]:
                it.add(mb.caixa(0.05, 0.14, z2 - z1, x=s * (W / 2 - 0.02), y=yc, z=z1, cor="branco", bisel=0.0))
        for yp in portas:
            porta_correr(it, s, yp - wd / 2, yp + wd / 2, z0 + 0.02, z2 - 0.05, W / 2, "turquesa", sentido=1,
                         curso=0.0, janela=(0.75, 2.2), mat_vidro="janela_apagada")
    # as portas do VLT são de duas folhas: troca a de correr por duas folhas que se afastam
    novos = []
    for ob, d in list(it.interativos):
        if d["interativo"] == "correr" and d["curso"] == 0.0:
            d["curso"] = round(wd / 2 - 0.05, 4)
    for sy in (-1, 1):
        ye = sy * L / 2
        for s in (-1, 1):
            it.add(mb.caixa(0.36, 0.08, 0.12, x=s * 0.62, y=ye + sy * 0.0, z=0.7, cor=None, mat="luz", bisel=0.03,
                            seg=1))
            it.add(mb.caixa(0.14, 0.08, 0.1, x=s * 0.9, y=ye - sy * 0.12, z=0.72, cor=None, mat="luz_vermelha",
                            bisel=0.02, seg=1))
        it.add(mb.caixa(1.2, 0.08, 0.28, y=ye, z=z2 + 0.06, cor="grafite_escuro", bisel=0.02, seg=1))
        it.add(quad_uv("letreiro", (0, ye + sy * 0.045, z2 + 0.2), (1, 0, 0) if sy < 0 else (-1, 0, 0), (0, 0, 1),
                       1.1, 0.22, est("led_bonde_moderno", 1.6)))
    pantografo(it, 0.0, z4, alt=0.6, larg=1.1)
    for y in (-L / 2 + 3.0, L / 2 - 3.0):
        truque(it, y, 0.3, 1.6)
    it.extra.update({"trilho": {"tipo": "bonde", "bitola": 1.6, "x_trilho": X_TR, "z_trilho": Z_BONDE,
                                "faixas_x": [-X_BONDE, X_BONDE]}, "piso": 0.35})
    it.assento("assento_motorneiro", 0.0, -L / 2 + 0.9, 0.85)
    k = 1
    for y in (-2.2, 2.2, -5.5):
        for x in (-0.7, 0.7):
            it.assento(f"assento_{k}", x, y, 0.8)
            k += 1
    it.colisao([((0, 0, 0.05), (W, L, z4 + 0.35))])


def trem_tubo(it, L, frente, semente):
    W = 2.7
    H = 2.45
    yn = -L / 2 + 4.5
    if frente:
        pa, pb = (yn, H), (-L / 2, 0.65)
        poly = [(-L / 2 + 0.5, 0.3, 0.15), (L / 2, 0.3, 0.1), (L / 2, H, 0.45), (pa[0], pa[1], 1.6),
                (pb[0], pb[1], 0.4)]
    else:
        poly = [(-L / 2, 0.3, 0.1), (L / 2, 0.3, 0.1), (L / 2, H, 0.45), (-L / 2, H, 0.45)]
    fx = [(0.0, 0.72, "lilas"), (0.72, 0.8, "azul"), (0.8, 9, "branco")]
    corpo = lataria(poly, W, "branco", bisel=0.4, n=6)
    faixas_cor(corpo, fx)
    nariz = [corpo]
    it.add(corpo)
    y0 = (yn - 0.2) if frente else -L / 2 + 0.6
    y1 = L / 2 - 0.6
    faixa = vidro_atravessado(ret(y0, y1, 1.15, 1.9, 0.12), W, mat="janela_apagada", folga=0.006)
    it.add(faixa)
    it.add(janelas_fileira(W, y0 + 0.2, y1 - 0.2, 1.22, 1.83, 7 if frente else 8, semente, montante=0.22,
                           folga=0.016, apagadas=0.3))
    neon = vidro_atravessado(ret(y0 - 0.3 if frente else -L / 2 + 0.3, L / 2 - 0.3, 0.92, 0.97, 0.02), W,
                             mat="neon", folga=0.01)
    it.add(neon)
    ya_n = yn + 0.4 if frente else -L / 2 + 0.5
    it.add(planta([(-0.09, ya_n, 0.08), (0.09, ya_n, 0.08), (0.09, L / 2 - 0.5, 0.08), (-0.09, L / 2 - 0.5, 0.08)],
                  H - 0.01, H + 0.04, None, mat="neon_roxo", bisel=0.0, seg=1))
    if frente:
        nariz.append(faixa)
        nariz.append(neon)
        vid = placa(pa, pb, -0.8, 0.8, mat="janela_apagada", t0=0.36, t1=0.6, bisel=0.04)
        luzes = [placa(pa, pb, s * 0.22, s * 0.62, mat="luz", t0=0.82, t1=0.88, bisel=0.02) if s > 0 else
                 placa(pa, pb, -0.62, -0.22, mat="luz", t0=0.82, t1=0.88, bisel=0.02) for s in (-1, 1)]
        lant = [placa(pa, pb, 0.25, 0.5, mat="luz_vermelha", t0=0.91, t1=0.94, bisel=0.01),
                placa(pa, pb, -0.5, -0.25, mat="luz_vermelha", t0=0.91, t1=0.94, bisel=0.01)]
        listra = [placa(pa, pb, -0.1, 0.1, cor="azul", t0=0.0, t1=0.36, bisel=0.01, esp=0.02, folga=0.006)]
        nariz += [vid] + luzes + lant + listra
        taper_x(nariz, yn, 4.5, k=0.42, pot=1.5)
        it.add(vid, luzes, lant, listra)
    # portas de correr (duas por lado)
    for s in (-1, 1):
        for yp in ((-1.0, L / 2 - 1.6) if frente else (-L / 2 + 1.7, L / 2 - 1.7)):
            porta_correr(it, s, yp - 0.55, yp + 0.55, 0.36, 2.0, W / 2, "branco", sentido=1 if yp < 0 else -1,
                         curso=0.95, janela=(1.15, 1.85), mat_vidro="janela_apagada",
                         faixas=[(0.0, 0.72, "lilas"), (0.72, 0.8, "azul"), (0.8, 9, "branco")])
    pontas = (1,) if frente else (-1, 1)
    for sy in pontas:
        it.add(mb.caixa(1.2, 0.28, 1.9, y=sy * (L / 2 + 0.08), z=0.4, cor="grafite", bisel=0.06, seg=1))
    for y in ((-L / 2 + 4.0, L / 2 - 2.2) if frente else (-L / 2 + 2.2, L / 2 - 2.2)):
        truque(it, y, 0.32, 1.8, vel=420)
    ef = L / 2 + 0.25
    et = L / 2 + 0.25
    it.extra.update({"veiculo": "trem_tubo",
                     "trilho": {"tipo": "trem_tubo", "bitola": 1.6, "x_trilho": X_TR, "z_trilho": Z_TUBO,
                                "raio_tubo": R_TUBO, "centro_tubo_acima_do_trilho": 0.24,
                                "pecas": ["trem_tubo_reto", "trem_tubo_curva", "trem_tabuleiro_aberto"]},
                     "engate": [round(ef, 3) if not frente else round(L / 2, 3), round(et, 3)], "piso": 0.4})
    k = 1
    for y in ((-2.5, 0.5, 3.5) if frente else (-3.5, 0.0, 3.5)):
        for x in (-0.6, 0.6):
            it.assento(f"assento_{k}", x, y, 0.85)
            k += 1
    if frente:
        it.assento("assento_condutor", 0.0, -L / 2 + 2.6, 1.0)
    it.colisao([((0, 0, 0.05), (W, L + (0.2 if frente else 0.5), H + 0.05))])


@peca("trem_tubo_frente", "Trem do tubo de vidro: cabeça", "trem_tubo", ["trem", "trilho", "elevado", "tubo"],
      extra={"veiculo": "trem_tubo"})
def p_trem_tubo_frente(it):
    trem_tubo(it, 14.0, True, 41)


@peca("trem_tubo_vagao", "Trem do tubo de vidro: vagão", "trem_tubo", ["trem", "trilho", "elevado", "tubo"],
      extra={"veiculo": "trem_tubo"})
def p_trem_tubo_vagao(it):
    trem_tubo(it, 13.0, False, 43)


def main():
    global EST_DIR
    argv = sys.argv[sys.argv.index("--") + 1:]
    saida, filtro = argv[0], argv[1:]
    EST_DIR = os.path.join(saida, CAT, "estampas")
    cat = mb.Catalogo(CAT, saida, rotulo="Utilitários")
    ids = [p[0] for p in P]
    assert len(ids) == len(set(ids)), "ids repetidos"
    for id_, rotulo, grupo, tags, extra, f in P:
        if filtro and id_ not in filtro and grupo not in filtro:
            continue
        mb.limpa()
        it = ItemV(id_)
        f(it)
        if os.environ.get("TRIS_DEBUG"):
            cont = {}
            for o in it.partes + [o for o, _ in it.interativos] + [o for o, _ in it.animados]:
                nm = o.name.split(".")[0]
                cont[nm] = cont.get(nm, 0) + sum(len(p.vertices) - 2 for p in o.data.polygons)
            print("tris", id_, sorted(cont.items(), key=lambda kv: -kv[1])[:14], flush=True)
        ex = dict(extra or {})
        ex.update(it.extra)
        exporta(cat, it, rotulo, grupo, tags, ex)
    cat.dados["itens"] = [x for x in cat.dados["itens"] if x["id"] in ids]
    cat.dados["itens"].sort(key=lambda x: ids.index(x["id"]))
    cat.salva()
    print("pecas", len(cat.dados["itens"]), flush=True)


if __name__ == "__main__":
    main()
