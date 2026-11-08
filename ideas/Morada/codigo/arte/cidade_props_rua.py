"""Cidade do Morada: props de rua, calçada e telhado — categoria "props_rua".

Completa o mobiliario_urbano (bancos, postes, lixeiras, hidrante, correio, orelhão, ponto de ônibus, placas e
semáforos já existem lá): obra e trânsito (cones, cavalete, barreira, balizadores, corrente), serviços de calçada
(parquímetro, máquinas de venda, caixa eletrônico, carregador de carro elétrico, bicicletas compartilhadas),
comércio (banca de jornal, chaveiro, banca de frutas), informação (totem com mapa, placa de direção), detalhes
(bebedouro de cachorro, gradil, floreiras, tampa de bueiro, boca de lobo, lixeira subterrânea, contêiner de vidro) e
o telhado e a fachada dos prédios (caixas d'água, antenas, condensadoras, exaustor, painel solar, para-raios, chaminé,
casa de máquinas, toldo, varal, escada de incêndio, luminária, câmera, interfone e caixa de correio de parede).

Uso (ver GUIA_PROPS.md, GUIA_CIDADE.md e GUIA_PARQUE.md):
  MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/cidade_props_rua.py -- SP/cidade_out [ids|grupos...]

Convenções:
- metros, Z para cima, frente para −Y. fixacao "chao": origem no chão, no meio da peça. As peças de telhado também são
  "chao" (vão em cima da laje do telhado). fixacao "parede": as costas no plano y = 0, o corpo para −Y, origem no meio
  da largura e na base da peça; a altura sugerida vai em altura_instalacao.
- Estampas (PNG de props_rua_estampas.py, gravados em <saida>/props_rua/estampas/) para telas, vitrines, mapa e
  placas; as que brilham à noite levam emissão (a página deixa fracas de dia).
- Animadas: o nó filho leva os extras glTF e a mesma lista vai em extra["animacoes"] (girar, piscar, balancar,
  trocar). Interativos: porta (Item.porta) e correr (Item.correr).
- Decalques (tampa de bueiro, boca de lobo): 1 a 2 cm de altura, sem colisão.
- Não há peça nova do pacote Cartoon City: todos os FBX dele já entraram em outras categorias.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import moveis_base as mb  # noqa: E402
import props_rua_estampas as pre  # noqa: E402

V = Vector
CAT = "props_rua"
EST_DIR = ""
ASSENTO = (0.5, 0.5, 0.9)
P = []  # (id, rotulo, grupo, fixacao, altura, tags, mini, extra, f)
MINI_TOPO = (0.55, -1.0, 1.35)


def peca(id_, rotulo, grupo, tags=(), fixacao="chao", alt=None, mini=None, extra=None):
    def deco(f):
        P.append((id_, rotulo, grupo, fixacao, alt, list(tags), mini, extra, f))
        return f
    return deco


class ItemP(mb.Item):
    """Item com filhos animados (extras glTF no nó filho) e assentos numerados."""

    def __init__(self, id_):
        super().__init__(id_)
        self.animados = []
        self.n_assento = 0

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

    def assento(self, x, y, z):
        self.n_assento += 1
        self.slot(f"assento_{self.n_assento}", (x, y, z), ASSENTO)

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
# Utilitários
# ======================================================================================================================
_EST = {}


def est(nome, emissao=0.0, apelido=None):
    """Material da estampa <nome>.png (apelido: outro material com a mesma imagem, p. ex. com emissão diferente)."""
    chave = apelido or nome
    if chave not in _EST:
        _EST[chave] = mb.material_estampa("pr_" + chave, os.path.join(EST_DIR, nome + ".png"), emissao=emissao)
    return _EST[chave]


def cx(l, p, a, x=0.0, y=0.0, z=0.0, cor="branco", b=0.01, seg=2, mat="atlas", liso=True):
    return mb.caixa(l, p, a, x=x, y=y, z=z, cor=cor, bisel=b, seg=seg, mat=mat, liso=liso)


def cil(r, a, x=0.0, y=0.0, z=0.0, cor="branco", seg=20, b=0.004, eixo="z", r2=None, mat="atlas"):
    return mb.cilindro(r, a, x=x, y=y, z=z, cor=cor, seg=seg, bisel=b, eixo=eixo, r2=r2, mat=mat)


def tb(pts, r, cor="metal", seg=8, rc=None):
    return mb.tubo(pts, r, cor=cor, seg=seg, raio_curva=rc)


def adesivo(pts, y, mat, esp=0.004, uvcaixa=None, uvrect=(0, 0, 1, 1)):
    """Placa impressa: contorno 2D (x, z) com a face da frente em y (olhando para −Y) e espessura esp para trás. O UV
    projeta (x, z) da caixa uvcaixa=(x0, z0, x1, z1) no retângulo uvrect da textura."""
    ob = mb.extrudado(mb._ccw([tuple(p) for p in pts]), esp, y=y, plano="xz", cor="branco", bisel=0.0, liso=False,
                      nome="adesivo")
    xs, zs = [p[0] for p in pts], [p[1] for p in pts]
    x0, z0, x1, z1 = uvcaixa or (min(xs), min(zs), max(xs), max(zs))
    u0, v0, u1, v1 = uvrect
    me = ob.data
    uv = me.uv_layers["UVMap"].data
    for p in me.polygons:
        p.material_index = mb._mat_idx(mat)
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            uv[li].uv = (u0 + (u1 - u0) * (co.x - x0) / (x1 - x0), v0 + (v1 - v0) * (co.z - z0) / (z1 - z0))
    return ob


def placa(mat, l, a, x=0.0, y=0.0, z=0.0, esp=0.004, uvrect=(0, 0, 1, 1)):
    """Retângulo impresso l × a (x centrado, base em z), face da frente em y olhando para −Y."""
    return adesivo([(x - l / 2, z), (x + l / 2, z), (x + l / 2, z + a), (x - l / 2, z + a)], y, mat, esp, uvrect=uvrect)


def gira_z(ob, graus, loc=(0, 0, 0)):
    mb.transforma(ob, rot=("Z", graus))
    mb.transforma(ob, loc=loc)
    return ob


def gira(objs, eixo, graus, centro=(0, 0, 0)):
    """Gira objetos (malha) em volta de um eixo passando por centro."""
    c = V(centro)
    M = Matrix.Translation(c) @ Matrix.Rotation(math.radians(graus), 4, eixo) @ Matrix.Translation(-c)
    for o in (objs if isinstance(objs, (list, tuple)) else [objs]):
        o.data.transform(M)
    return objs


def move(objs, d):
    for o in (objs if isinstance(objs, (list, tuple)) else [objs]):
        o.data.transform(Matrix.Translation(V(d)))
    return objs


def anel(R, r, x=0.0, y=0.0, z=0.0, cor="metal", seg=20, seg_r=6, esc=(1, 1), eixo="z"):
    """Toro (argola, pneu, borda): raio maior R, menor r. eixo: a normal do anel."""
    perfil = [(R + r * math.cos(math.radians(a)), r * math.sin(math.radians(a))) for a in
              [-90 + 360 * k / seg_r for k in range(seg_r + 1)]]
    ob = mb.torno(perfil, cor=cor, seg=seg, esc=esc, angulo=60)
    if eixo == "x":
        mb.transforma(ob, rot=("Y", 90))
    elif eixo == "y":
        mb.transforma(ob, rot=("X", 90))
    mb.transforma(ob, loc=(x, y, z))
    return ob


def clip_rect(poly, x0, z0, x1, z1):
    """Recorta um polígono 2D pelo retângulo (Sutherland–Hodgman)."""
    def corta(pts, dentro, cruza):
        out = []
        for i, a in enumerate(pts):
            b = pts[(i + 1) % len(pts)]
            if dentro(b):
                if not dentro(a):
                    out.append(cruza(a, b))
                out.append(b)
            elif dentro(a):
                out.append(cruza(a, b))
        return out

    def cx_(xc):
        return lambda a, b: (xc, a[1] + (b[1] - a[1]) * (xc - a[0]) / (b[0] - a[0]))

    def cz_(zc):
        return lambda a, b: (a[0] + (b[0] - a[0]) * (zc - a[1]) / (b[1] - a[1]), zc)
    pts = list(poly)
    for dentro, cruza in ((lambda p: p[0] >= x0, cx_(x0)), (lambda p: p[0] <= x1, cx_(x1)),
                          (lambda p: p[1] >= z0, cz_(z0)), (lambda p: p[1] <= z1, cz_(z1))):
        if not pts:
            break
        pts = corta(pts, dentro, cruza)
    return pts


def listras(L, A, w=0.12, cores=("vermelho", "branco"), esp=0.025, incl=1.0, y=0.0):
    """Tábua de listras diagonais (cavalete de obra) no plano XZ: x de −L/2 a L/2, z de 0 a A, face da frente em y−esp."""
    objs = []
    k0, k1 = int(-A * abs(incl) / w) - 2, int(L / w) + 3
    for k in range(k0, k1):
        a = -L / 2 + k * w
        poly = [(a, 0), (a + w, 0), (a + w + A * incl, A), (a + A * incl, A)]
        c = clip_rect(poly, -L / 2, 0, L / 2, A)
        if len(c) >= 3 and abs(sum(p[0] * q[1] - q[0] * p[1] for p, q in zip(c, c[1:] + c[:1]))) > 1e-5:
            objs.append(mb.extrudado(mb._ccw(c), esp, y=y - esp, plano="xz", cor=cores[k % len(cores)], bisel=0,
                                     liso=False))
    return mb.junta(objs, "listras")


def solidifica(ob, esp):
    md = ob.modifiers.new("s", "SOLIDIFY")
    md.thickness = esp
    md.offset = 0.0
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    velho = ob.data
    ob.modifiers.clear()
    ob.data = me
    bpy.data.meshes.remove(velho)
    for n in mb.MAT_NOMES[len(me.materials):]:
        me.materials.append(bpy.data.materials[n])
    return ob


def fita(pontos, larg, normal_fn, cor="metal", esp=0.006):
    """Fita (lâmina curva) ao longo de pontos 3D; a largura vai na direção normal_fn(p, t) × tangente."""
    bm = bmesh.new()
    pts = [V(p) for p in pontos]
    pares = []
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        n = normal_fn(p)
        lado = t.cross(n).normalized() * (larg / 2)
        pares.append((bm.verts.new(p - lado), bm.verts.new(p + lado)))
    for (a, b), (c, d) in zip(pares, pares[1:]):
        bm.faces.new((a, b, d, c))
    ob = mb._obj("fita", bm, cor, liso=True, angulo=70)
    return solidifica(ob, esp)


def lampada_pisca(x, y, z, r=0.045, cor_caixa="amarelo", mat="luz"):
    """Lâmpada de sinalização (cone, cavalete): base e lente (a lente é o nó que pisca)."""
    base = cil(r * 1.05, r * 0.9, x=x, y=y, z=z, cor=cor_caixa, seg=16, b=0.006)
    lente = mb.esfera(r, x=x, y=y, z=z + r * 0.9, cor=None, esc=(1, 1, 1.05), seg=14, mat=mat)
    return base, lente


# ======================================================================================================================
# Obra e trânsito
# ======================================================================================================================
def cone(it, pisca=False):
    it.add(mb.extrudado(mb.ret_arredondado(0.4, 0.4, 0.06, seg=4), 0.035, cor="preto", bisel=0.01, seg=2))
    h0, h1, r0, r1 = 0.035, 0.74, 0.165, 0.032

    def r(h):
        return r0 + (r1 - r0) * (h - h0) / (h1 - h0)
    it.add(mb.torno([(r0 + 0.004, h0 - 0.002), (r0, h0 + 0.02), (r1, h1), (r1 * 0.75, h1 + 0.014), (0, h1 + 0.02)],
                    cor="laranja", seg=24))
    for a_, b_ in ((0.25, 0.37), (0.47, 0.54)):
        it.add(mb.torno([(r(a_) - 0.001, a_ - 0.002), (r(a_) + 0.005, a_), (r(b_) + 0.005, b_), (r(b_) - 0.001, b_ + 0.002)],
                        cor="branco", seg=24))
    if pisca:
        it.add(cil(0.012, 0.03, z=h1 + 0.01, cor="grafite", seg=8))
        base, lente = lampada_pisca(0, 0, h1 + 0.035)
        it.add(base)
        it.anima(lente, {"anima": "piscar", "periodo": 1.0}, "lampada_pisca")
        it.colisao([((0, 0, 0), (0.4, 0.4, 0.86))])


@peca("cone_transito", "Cone de trânsito", "cone_transito", ["obra", "transito", "rua", "calcada"])
def _(it):
    cone(it)


@peca("cone_transito_pisca", "Cone de trânsito com lâmpada que pisca", "cone_transito",
      ["obra", "transito", "rua", "luz", "animado"])
def _(it):
    cone(it, pisca=True)


@peca("cavalete_obra", "Cavalete de obra listrado com lâmpada", "cavalete_obra", ["obra", "transito", "rua", "luz", "animado"])
def _(it):
    alt, abre = 1.05, 0.32
    incl = math.degrees(math.atan2(abre, alt))
    for sx in (-0.62, 0.62):
        it.add(tb([(sx, -abre, 0.03), (sx, 0, alt), (sx, abre, 0.03)], 0.026, cor="branco", seg=10, rc=0.06))
        for sy in (-abre, abre):
            it.add(cx(0.07, 0.1, 0.03, x=sx, y=sy * 1.02, cor="preto", b=0.008))
    it.add(tb([(-0.62, 0, alt), (0.62, 0, alt)], 0.022, cor="branco", seg=10))
    for lado in (1, -1):  # tábuas listradas nas duas faces do cavalete, inclinadas como as pernas
        for z0, a in ((0.66, 0.24), (0.3, 0.2)):
            t = listras(1.5, a, w=0.14, incl=0.9, esp=0.024)
            gira(t, "X", -incl)
            yl = -abre * (1 - z0 / alt) - 0.03
            move(t, (0, yl, z0))
            if lado < 0:
                gira(t, "Z", 180)
            it.add(t)
    it.add(cil(0.012, 0.05, x=-0.62, z=alt + 0.01, cor="grafite", seg=8))
    base, lente = lampada_pisca(-0.62, 0, alt + 0.05, r=0.05)
    it.add(base)
    it.anima(lente, {"anima": "piscar", "periodo": 1.2}, "lampada_pisca")
    it.colisao([((0, 0, 0), (1.4, 0.7, 1.05))])


@peca("barreira_plastica", "Barreira plástica de água (vermelha)", "barreira_plastica", ["obra", "transito", "rua", "barreira"])
def _(it):
    L = 1.2
    perfil = [(-0.27, 0), (0.27, 0), (0.27, 0.1), (0.13, 0.32), (0.1, 0.74), (0.05, 0.8), (-0.05, 0.8), (-0.1, 0.74),
              (-0.13, 0.32), (-0.27, 0.1)]
    it.add(mb.extrudado(perfil, L, x=-L / 2, plano="yz", cor="vermelho", bisel=0.03, seg=3))
    faixa = [(-0.123, 0.5), (0.123, 0.5), (0.115, 0.62), (-0.115, 0.62)]
    it.add(mb.extrudado(faixa, L - 0.12, x=-(L - 0.12) / 2, plano="yz", cor="branco", bisel=0.006, seg=2))
    it.add(cil(0.06, 0.035, x=-0.33, z=0.79, cor="branco", seg=18, b=0.01))
    it.add(cil(0.035, 0.02, x=-0.33, z=0.82, cor="cinza_claro", seg=14, b=0.006))
    for z in (0.08, 0.42):  # encaixes macho/fêmea nas pontas
        it.add(cil(0.05, 0.17, x=L / 2 + 0.02, z=z, cor="vermelho", seg=16, b=0.012))
        it.add(cil(0.05, 0.17, x=-L / 2 - 0.02, z=z + 0.17, cor="vermelho", seg=16, b=0.012))
    for s in (-1, 1):  # vãos da empilhadeira e alças
        for x in (-0.3, 0.3):
            it.add(cx(0.24, 0.012, 0.07, x=x, y=s * 0.271, z=0.012, cor="vermelho_escuro", b=0.004))
        it.add(cx(0.3, 0.012, 0.05, x=0, y=s * (0.098), z=0.7, cor="vermelho_escuro", b=0.004))
    it.colisao([((0, 0, 0), (L + 0.14, 0.54, 0.84))])


@peca("balizador_fixo", "Balizador de ferro (frade) com faixa amarela", "balizador", ["balizador", "calcada", "rua"])
def _(it):
    it.add(mb.torno([(0, 0), (0.14, 0), (0.14, 0.03), (0.105, 0.06), (0.088, 0.12), (0.085, 0.78), (0.1, 0.8),
                     (0.1, 0.83), (0.075, 0.88), (0.035, 0.91), (0, 0.915)], cor="grafite_escuro", seg=24))
    it.add(mb.torno([(0.086, 0.64), (0.091, 0.645), (0.091, 0.735), (0.086, 0.74)], cor="amarelo", seg=24))
    it.add(mb.esfera(0.03, z=0.92, cor="ouro", seg=12))
    it.colisao([((0, 0, 0), (0.24, 0.24, 0.92))])


@peca("balizador_retratil", "Balizador retrátil de aço (abaixa)", "balizador_retratil", ["balizador", "calcada", "rua",
                                                                                         "interativo", "luz"])
def _(it):
    it.add(cil(0.2, 0.012, cor="metal_escuro", seg=28, b=0.004))
    it.add(anel(0.125, 0.012, z=0.012, cor="metal", seg=28, seg_r=6))
    corpo = [cil(0.105, 0.8, z=0.012, cor="metal_claro", seg=28, b=0.02)]
    for z in (0.52, 0.62):
        corpo.append(mb.torno([(0.105, z - 0.001), (0.108, z), (0.108, z + 0.05), (0.105, z + 0.051)], cor="vermelho",
                              seg=28))
    corpo.append(anel(0.085, 0.01, z=0.812, cor=None, seg=28, seg_r=6))
    mb.pinta(corpo[-1], None, mat="luz_vermelha")
    corpo.append(cil(0.07, 0.012, z=0.808, cor="metal", seg=20, b=0.004))
    it.correr(corpo, direcao=(0, 0, -1), curso=0.78, nome="coluna")
    it.colisao([((0, 0, 0), (0.22, 0.22, 0.83))])


@peca("corrente_balizadores", "Corrente de plástico entre dois balizadores", "corrente_balizadores",
      ["balizador", "corrente", "calcada", "rua", "obra"])
def _(it):
    X = 0.95
    for x in (-X, X):
        it.add(mb.torno([(0, 0), (0.17, 0), (0.17, 0.03), (0.12, 0.07), (0.05, 0.09), (0, 0.09)], x=x, cor="preto", seg=20))
        for k in range(4):
            z0 = 0.09 + k * 0.19
            it.add(cil(0.045, 0.19, x=x, z=z0, cor="vermelho" if k % 2 == 0 else "branco", seg=16, b=0.0))
        it.add(mb.esfera(0.055, x=x, z=0.86, cor="vermelho", esc=(1, 1, 0.8), seg=14))
        it.add(anel(0.022, 0.006, x=x - math.copysign(0.06, x), z=0.82, cor="grafite", seg=10, seg_r=4, eixo="y"))
    # corrente em catenária (parábola), elos alternando amarelo e preto, deitados e em pé
    xa, xb, zt, sag = -X + 0.075, X - 0.075, 0.8, 0.2

    def zc(x):
        u = (x - (xa + xb) / 2) / ((xb - xa) / 2)
        return zt - sag * (1 - u * u)
    passo = 0.058
    n = int((xb - xa) / passo)
    elos = []
    for k in range(n + 1):
        x = xa + (xb - xa) * k / n
        dz = (zc(x + 0.01) - zc(x - 0.01)) / 0.02
        e = anel(0.022, 0.0055, cor="amarelo" if k % 2 == 0 else "preto", seg=8, seg_r=4, esc=(1.55, 1))
        if k % 2:
            mb.transforma(e, rot=("X", 90))
        mb.transforma(e, rot=("Y", -math.degrees(math.atan(dz))))
        mb.transforma(e, loc=(x, 0, zc(x)))
        elos.append(e)
    it.add(mb.junta(elos, "corrente"))
    it.colisao([((-X, 0, 0), (0.34, 0.34, 0.9)), ((X, 0, 0), (0.34, 0.34, 0.9))])


# ======================================================================================================================
# Serviços de calçada
# ======================================================================================================================
@peca("parquimetro", "Parquímetro com tela e painel solar", "parquimetro", ["parquimetro", "calcada", "rua", "tela"])
def _(it):
    it.add(cx(0.3, 0.3, 0.03, cor="concreto_escuro", b=0.01))
    it.add(cil(0.045, 1.08, z=0.02, cor="grafite", seg=16, b=0.01))
    z0 = 1.06
    it.add(cx(0.36, 0.25, 0.5, z=z0, cor="cinza_azulado", b=0.05, seg=3))
    it.add(cx(0.38, 0.27, 0.06, z=z0 + 0.5, cor="amarelo", b=0.02))
    sol = cx(0.32, 0.22, 0.025, z=0, cor="azul_noite", b=0.006)
    gira(sol, "X", -18)
    move(sol, (0, 0, z0 + 0.58))
    it.add(sol)
    it.add(cx(0.08, 0.06, 0.06, z=z0 + 0.54, cor="grafite", b=0.01))
    yf = -0.125
    it.add(cx(0.24, 0.01, 0.19, y=yf - 0.004, z=z0 + 0.25, cor="preto", b=0.006))
    it.add(placa(est("tela_parquimetro", 0.9), 0.2, 0.16, y=yf - 0.011, z=z0 + 0.265))
    for i in range(3):
        for j in range(2):
            it.add(cil(0.016, 0.012, x=-0.07 + 0.07 * i, y=yf - 0.006, z=z0 + 0.16 - 0.055 * j, cor="branco" if j else
                       "amarelo", seg=10, b=0.003, eixo="y"))
    it.add(cx(0.1, 0.012, 0.025, x=0, y=yf - 0.005, z=z0 + 0.04, cor="preto", b=0.004))
    it.add(cx(0.012, 0.01, 0.05, x=0.13, y=yf - 0.004, z=z0 + 0.2, cor="preto", b=0.003))
    it.colisao([((0, 0, 0), (0.12, 0.12, 1.06)), ((0, 0, z0), (0.38, 0.27, 0.62))])


def maquina_venda(it, cor, cor2, vitrine, topo):
    L, Pp, A, z0 = 0.95, 0.78, 1.83, 0.05
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.add(cx(0.08, 0.08, z0, x=sx * 0.38, y=sy * 0.3, cor="preto", b=0.01))
    it.add(cx(L, Pp, A, z=z0, cor=cor, b=0.04, seg=3))
    yf = -Pp / 2
    e = 0.05  # porta da frente com moldura em volta da vitrine
    x0, x1, zb, zt = -L / 2 + 0.06, 0.17, z0 + 0.42, z0 + 1.63
    for xa, xb_, za, zb_ in ((-L / 2, x0, z0, z0 + A), (x1, L / 2, z0, z0 + A), (x0, x1, z0, zb), (x0, x1, zt, z0 + A)):
        it.add(cx(xb_ - xa, e, zb_ - za, x=(xa + xb_) / 2, y=yf - e / 2 + 0.01, z=za, cor=cor2, b=0.015))
    it.add(placa(est(vitrine, 1.0), x1 - x0, zt - zb, x=(x0 + x1) / 2, y=yf - 0.002, z=zb))
    it.add(cx(x1 - x0 - 0.01, 0.006, zt - zb - 0.01, x=(x0 + x1) / 2, y=yf - 0.03, z=zb + 0.005, cor=None, mat="vidro",
              b=0.0))
    it.add(placa(est(topo, 1.4), L - 0.14, 0.15, y=yf - e + 0.006, z=z0 + A - 0.19))
    xc = (x1 + L / 2) / 2  # coluna de comando
    it.add(cx(0.2, 0.01, 0.07, x=xc, y=yf - e + 0.008, z=z0 + 1.42, cor="preto", b=0.004))
    it.add(cx(0.18, 0.006, 0.05, x=xc, y=yf - e + 0.004, z=z0 + 1.43, cor=None, mat="luz", b=0.0))
    for i in range(2):
        for j in range(4):
            it.add(cx(0.06, 0.018, 0.04, x=xc - 0.045 + 0.09 * i, y=yf - e, z=z0 + 1.12 + 0.065 * j, cor="branco_gelo",
                      b=0.006))
    it.add(cx(0.03, 0.012, 0.08, x=xc - 0.05, y=yf - e, z=z0 + 0.95, cor="preto", b=0.004))
    it.add(cx(0.09, 0.02, 0.1, x=xc + 0.04, y=yf - e - 0.002, z=z0 + 0.93, cor="grafite", b=0.008))
    it.add(cx(0.05, 0.004, 0.012, x=xc + 0.04, y=yf - e - 0.012, z=z0 + 1.0, cor=None, mat="neon", b=0.0))
    it.add(cx(0.12, 0.03, 0.08, x=xc, y=yf - e - 0.005, z=z0 + 0.6, cor="grafite", b=0.01))
    it.add(cx(0.5, 0.012, 0.18, x=(x0 + x1) / 2, y=yf - e + 0.004, z=z0 + 0.12, cor="preto", b=0.006))
    aba = cx(0.5, 0.018, 0.17, x=(x0 + x1) / 2, y=0, z=0, cor="grafite", b=0.006)
    gira(aba, "X", 18)
    move(aba, (0, yf - e - 0.005, z0 + 0.12))
    it.add(aba)
    it.colisao([((0, 0, 0), (L, Pp + 0.1, A + z0))])


@peca("maquina_venda_bebidas", "Máquina de bebidas geladas", "maquina_venda", ["maquina", "calcada", "luz", "tela"])
def _(it):
    maquina_venda(it, "vermelho", "vermelho_escuro", "vitrine_bebidas", "topo_bebidas")


@peca("maquina_venda_lanches", "Máquina de lanches", "maquina_venda", ["maquina", "calcada", "luz", "tela"])
def _(it):
    maquina_venda(it, "azul_medio", "azul_escuro", "vitrine_lanches", "topo_lanches")


@peca("caixa_eletronico_rua", "Caixa eletrônico de rua (saque 24 h)", "caixa_eletronico", ["caixa_eletronico", "calcada",
                                                                                          "luz", "tela", "animado"])
def _(it):
    it.add(cx(1.1, 0.95, 0.08, cor="concreto", b=0.02))
    L, Pp, z0 = 0.9, 0.7, 0.08
    it.add(cx(L, Pp, 1.55, z=z0, cor="cinza_claro", b=0.03))
    yf = -Pp / 2
    for s in (-1, 1):  # abas de privacidade
        it.add(cx(0.05, 0.3, 0.68, x=s * 0.43, y=yf - 0.14, z=0.98, cor="verde_escuro", b=0.02))
    it.add(cx(0.8, 0.2, 0.05, y=yf - 0.09, z=0.96, cor="verde_escuro", b=0.015))  # balcão do teclado
    for i in range(3):
        for j in range(4):
            it.add(cx(0.034, 0.03, 0.012, x=-0.05 + 0.04 * i, y=yf - 0.07 - 0.035 * j, z=1.01, cor="branco_gelo" if j < 3
                      else ("vermelho", "amarelo", "verde")[i], b=0.004, seg=1))
    it.add(cx(0.5, 0.03, 0.36, y=yf - 0.005, z=1.08, cor="preto", b=0.01))
    tl = placa(est("tela_atm", 1.0), 0.44, 0.3, y=yf - 0.022, z=1.11, uvrect=(0, 0, 1 / 3, 1))
    it.anima(tl, {"anima": "trocar", "quadros": 3, "periodo": 3}, "tela_troca")
    it.add(cx(0.12, 0.02, 0.04, x=0.25, y=yf - 0.01, z=1.02, cor="grafite", b=0.006))
    it.add(cx(0.07, 0.006, 0.01, x=0.25, y=yf - 0.022, z=1.04, cor=None, mat="neon", b=0.0))
    it.add(cx(0.3, 0.02, 0.03, x=0, y=yf - 0.01, z=0.84, cor="preto", b=0.006))
    it.add(cil(0.012, 0.012, y=yf - 0.004, z=1.46, cor="preto", seg=10, eixo="y"))
    # cobertura com letreiro luminoso e luz embaixo
    it.add(cx(1.04, 0.92, 0.24, y=-0.06, z=1.62, cor="verde_escuro", b=0.04))
    it.add(placa(est("topo_atm", 1.3), 0.92, 0.2, y=-0.06 - 0.461, z=1.64))
    it.add(cx(0.7, 0.06, 0.012, y=yf - 0.12, z=1.608, cor=None, mat="luz", b=0.0))
    it.colisao([((0, -0.08, 0), (1.1, 1.12, 1.86))])


@peca("carregador_carro_eletrico", "Carregador de carro elétrico", "carregador_eletrico", ["carregador", "calcada", "carro",
                                                                                         "luz", "tela"])
def _(it):
    it.add(cx(0.62, 0.46, 0.06, cor="concreto", b=0.02))
    it.add(cx(0.46, 0.3, 1.5, z=0.06, cor="branco", b=0.1, seg=4))
    it.add(mb.superelipsoide(0.58, 0.42, 0.14, z=1.53, cor="verde_agua", e=0.35, e_v=0.5))
    yf = -0.15
    it.add(cx(0.27, 0.02, 0.38, y=yf, z=1.0, cor="grafite_escuro", b=0.02))
    it.add(placa(est("tela_recarga", 1.0), 0.21, 0.315, y=yf - 0.011, z=1.03))
    for s in (-1, 1):
        it.add(cx(0.02, 0.012, 0.95, x=s * 0.19, y=yf + 0.01, z=0.35, cor=None, mat="neon", b=0.004))
    it.add(cx(0.3, 0.012, 0.08, y=yf - 0.002, z=0.2, cor="verde_agua", b=0.01))
    # suporte da pistola no lado direito, pistola e cabo enrolado até o chão
    it.add(cx(0.06, 0.12, 0.16, x=0.255, y=-0.02, z=0.86, cor="grafite", b=0.015))
    it.add(cx(0.07, 0.07, 0.14, x=0.27, y=-0.06, z=0.84, cor="preto", b=0.02))
    it.add(cil(0.02, 0.06, x=0.27, y=-0.06, z=0.79, cor="preto", seg=10))
    it.add(tb([(0.27, -0.06, 0.8), (0.33, -0.12, 0.55), (0.3, -0.2, 0.12), (0.12, -0.24, 0.08), (0.0, -0.19, 0.22),
               (0.0, -0.152, 0.32)], 0.018, cor="preto", seg=8, rc=0.08))
    it.colisao([((0, 0, 0), (0.62, 0.46, 1.67))])


def bicicleta(x, y, z, cor="laranja"):
    """Bicicleta compartilhada de quadro rebaixado, de frente para +Y, rodas no chão (z)."""
    R = 0.31
    c = z + R + 0.025
    yb, yf = y - 0.5, y + 0.5
    o = []
    for yy in (yb, yf):
        o.append(anel(R, 0.025, x=x, y=yy, z=c, cor="borracha", seg=16, seg_r=4, eixo="x"))
        o.append(cil(R - 0.02, 0.012, x=x, y=yy, z=c, cor="cinza_claro", seg=16, b=0.0, eixo="x"))
        o.append(cil(0.04, 0.06, x=x, y=yy, z=c, cor="grafite", seg=10, b=0.0, eixo="x"))
    bb = V((x, y - 0.06, c - 0.03))
    sel = V((x, y - 0.2, c + 0.48))
    cab = V((x, y + 0.36, c + 0.5))
    seg = 6
    o.append(tb([cab, (x, y + 0.2, c + 0.1), bb], 0.024, cor=cor, seg=seg, rc=0.12))
    o.append(tb([bb, (x, yb, c)], 0.016, cor=cor, seg=seg))
    o.append(tb([(x, y - 0.15, c + 0.36), (x, yb, c)], 0.014, cor=cor, seg=seg))
    o.append(tb([bb, sel], 0.02, cor=cor, seg=seg))
    o.append(tb([cab, (x, yf, c)], 0.018, cor="grafite", seg=seg))
    o.append(tb([cab, (x, cab.y - 0.04, cab.z + 0.12)], 0.016, cor="grafite", seg=seg))
    o.append(tb([(x - 0.27, cab.y - 0.08, cab.z + 0.13), (x + 0.27, cab.y - 0.08, cab.z + 0.13)], 0.014, cor="grafite", seg=seg))
    for s in (-1, 1):
        o.append(cil(0.02, 0.09, x=x + s * 0.27, y=cab.y - 0.08, z=cab.z + 0.13, cor="preto", seg=8, b=0.0, eixo="x"))
    o.append(mb.superelipsoide(0.15, 0.25, 0.06, x=x, y=sel.y - 0.02, z=sel.z, cor="preto", e=0.5, nu=10, nv=5))
    o.append(cx(0.32, 0.26, 0.2, x=x, y=yf + 0.03, z=c + 0.38, cor=cor, b=0.03))
    o.append(cx(0.27, 0.21, 0.02, x=x, y=yf + 0.03, z=c + 0.57, cor="grafite_escuro", b=0.0))
    o.append(cx(0.06, 0.4, 0.05, x=x, y=yb + 0.04, z=c + 0.33, cor=cor, b=0.015))  # bagageiro/paralama
    return o


@peca("estacao_bicicletas", "Estação de bicicletas compartilhadas (3 bicicletas)", "estacao_bicicletas",
      ["bicicleta", "calcada", "rua", "tela", "luz"])
def _(it):
    it.add(cx(3.3, 1.5, 0.05, x=0.2, cor="concreto_escuro", b=0.015))
    xs = (-0.4, 0.4, 1.2, 2.0)
    for k, x in enumerate(xs[:4]):
        it.add(cx(0.13, 0.16, 0.72, x=x - 0.4, y=0.52, z=0.05, cor="verde", b=0.04))
        it.add(cx(0.1, 0.14, 0.12, x=x - 0.4, y=0.4, z=0.45, cor="grafite", b=0.02))
        it.add(cx(0.06, 0.01, 0.02, x=x - 0.4, y=0.437, z=0.66, cor=None, mat="neon" if k < 3 else "luz_vermelha", b=0.0))
    for k, x in enumerate(xs[:3]):
        it.add(bicicleta(x - 0.4, -0.15, 0.05, cor="laranja"))
    it.add(cx(0.48, 0.28, 1.75, x=-1.2, y=0.45, z=0.05, cor="verde", b=0.06))
    it.add(cx(0.36, 0.02, 0.62, x=-1.2, y=0.30, z=0.98, cor="preto", b=0.01))
    it.add(placa(est("tela_bicicletas", 1.0), 0.3, 0.6, x=-1.2, y=0.288, z=0.99))
    it.add(cx(0.56, 0.36, 0.06, x=-1.2, y=0.45, z=1.8, cor="verde_escuro", b=0.02))
    it.colisao([((0.2, 0, 0), (3.3, 1.5, 0.05)), ((0.4, 0.5, 0), (2.6, 0.2, 0.76)), ((-1.2, 0.45, 0), (0.48, 0.28, 1.86))])


# ======================================================================================================================
# Comércio de calçada
# ======================================================================================================================
def toldo_listrado(L, prof, z_alto, queda, y0=0.0, cores=("vermelho", "branco"), n=None, babado=True, x0=0.0):
    """Toldo inclinado de listras: preso em y0 na altura z_alto, desce 'queda' até y0 − prof. Babado de meias-luas."""
    n = n or max(3, int(round(L / 0.22)))
    w = L / n
    comp = math.hypot(prof, queda)
    ang = math.degrees(math.atan2(queda, prof))
    o = []
    for k in range(n):
        xc = x0 - L / 2 + w * (k + 0.5)
        s = cx(w + 0.002, comp, 0.014, x=0, y=0, z=-0.007, cor=cores[k % 2], b=0.003, seg=1)
        gira(s, "X", ang)
        move(s, (xc, y0 - prof / 2, z_alto - queda / 2))
        o.append(s)
        if babado:
            r = w / 2
            pts = [(xc + r * math.cos(math.radians(180 + 180 * t / 8)), 0.9 * r * math.sin(math.radians(180 + 180 * t / 8)))
                   for t in range(9)]
            pts = [(xc - r, 0.06)] + pts + [(xc + r, 0.06)]
            bab = mb.extrudado(mb._ccw([(px, pz) for px, pz in pts]), 0.012, y=y0 - prof - 0.006, plano="xz",
                               cor=cores[k % 2], bisel=0.0, liso=False)
            move(bab, (0, 0, z_alto - queda - 0.06))
            o.append(bab)
    return o


@peca("banca_jornal", "Banca de jornal e revistas", "banca_jornal", ["banca", "comercio", "calcada", "luz"])
def _(it):
    L, Pp, A, z0 = 2.6, 1.6, 2.35, 0.1
    it.add(cx(L + 0.1, Pp + 0.2, z0, cor="concreto_escuro", b=0.02))
    it.add(mb.carcaca(L, Pp, A, z=z0, esp=0.06, cor="verde_escuro", bisel=0.01))
    yi = Pp / 2 - 0.06
    it.add(placa(est("revistas", 0.5, "revistas_dentro"), L - 0.16, 1.3, y=yi - 0.001, z=0.9))  # luz de dentro
    for z in (2.2 - 0.32 * 1.3, 2.2 - 0.645 * 1.3, 2.2 - 0.97 * 1.3):
        it.add(cx(L - 0.14, 0.1, 0.025, y=yi - 0.05, z=z - 0.025, cor="madeira", b=0.006))
    for s in (-1, 1):  # revistas penduradas nas laterais de fora
        m = placa(est("revistas"), 1.1, 1.0, y=0, z=0.85, uvrect=(0.0 if s < 0 else 0.5, 0.0, 0.5 if s < 0 else 1.0, 0.66))
        gira_z(m, 90 * s, (s * (L / 2 + 0.001), 0.1, 0))
        it.add(m)
        it.add(gira_z(cx(1.2, 0.03, 0.04, z=1.9, cor="metal", b=0.01), 90 * s, (s * (L / 2 + 0.02), 0.1, 0)))
    # balcão com jornais e revistas
    yb = -Pp / 2 + 0.3
    it.add(cx(L - 0.14, 0.42, 0.85, y=yb, z=z0, cor="verde", b=0.02))
    it.add(cx(L - 0.1, 0.5, 0.05, y=yb - 0.02, z=z0 + 0.85, cor="madeira", b=0.015))
    for k, x in enumerate((-0.9, -0.45, 0.0)):
        for j in range(3):
            it.add(cx(0.36, 0.28, 0.035, x=x, y=yb - 0.02, z=z0 + 0.9 + 0.036 * j, cor="papel", b=0.004, seg=1))
        it.add(cx(0.28, 0.2, 0.004, x=x, y=yb - 0.02, z=z0 + 1.008, cor="cinza", b=0.0))
    for k, (x, c) in enumerate(((0.5, "vermelho"), (0.75, "amarelo"), (1.0, "azul"))):
        it.add(cx(0.2, 0.26, 0.012, x=x, y=yb - 0.02, z=z0 + 0.9, cor=c, b=0.003, seg=1))
    # fachada: testeira com letreiro, telhado com beiral, rolo da porta de enrolar e luz interna
    it.add(cx(L + 0.1, 0.1, 0.4, y=-Pp / 2 - 0.02, z=z0 + A - 0.4, cor="verde_escuro", b=0.02))
    it.add(placa(est("letreiro_banca", 0.7), 2.4, 0.375, y=-Pp / 2 - 0.072, z=z0 + A - 0.39))
    it.add(cil(0.09, L - 0.1, y=-Pp / 2 + 0.12, z=z0 + A - 0.2, cor="metal", seg=16, eixo="x"))
    it.add(cx(L + 0.4, Pp + 0.38, 0.12, y=0.08, z=z0 + A, cor="verde_escuro", b=0.04))
    it.add(cx(L + 0.3, Pp + 0.28, 0.04, y=0.08, z=z0 + A + 0.12, cor="verde", b=0.015))
    it.add(cx(1.6, 0.06, 0.04, y=0.0, z=z0 + A - 0.12, cor=None, mat="luz", b=0.01))
    it.slot("balcao", (0, yb - 0.02, z0 + 0.9), (L - 0.3, 0.4, 0.4))
    it.colisao([((0, 0, 0), (L + 0.1, Pp + 0.2, A + z0 + 0.16))])


@peca("quiosque_chaveiro", "Quiosque de chaveiro e sapateiro", "quiosque_chaveiro", ["quiosque", "comercio", "calcada",
                                                                                   "interativo", "luz"])
def _(it):
    L, Pp, A, z0, e = 1.8, 1.4, 2.25, 0.08, 0.06
    cor, cor2 = "azul", "azul_marinho"
    it.add(cx(L + 0.1, Pp + 0.1, z0, cor="concreto_escuro", b=0.02))
    it.add(cx(L, e, A, y=Pp / 2 - e / 2, z=z0, cor=cor, b=0.01))  # fundo
    it.add(cx(e, Pp, A, x=-L / 2 + e / 2, z=z0, cor=cor, b=0.01))  # lado esquerdo
    yd0, yd1, zd = -0.35, 0.35, 2.0  # vão da porta no lado direito
    xr = L / 2 - e / 2
    it.add(cx(e, yd0 + Pp / 2, A, x=xr, y=(-Pp / 2 + yd0) / 2, z=z0, cor=cor, b=0.01))
    it.add(cx(e, Pp / 2 - yd1, A, x=xr, y=(yd1 + Pp / 2) / 2, z=z0, cor=cor, b=0.01))
    it.add(cx(e, yd1 - yd0, A - zd, x=xr, y=(yd0 + yd1) / 2, z=z0 + zd, cor=cor, b=0.01))
    it.add(cx(L, e, 1.0, y=-Pp / 2 + e / 2, z=z0, cor=cor, b=0.01))  # frente baixa (balcão)
    it.add(cx(L, e, 0.3, y=-Pp / 2 + e / 2, z=z0 + A - 0.3, cor=cor, b=0.01))
    it.add(cx(L - 0.1, Pp - 0.1, 0.02, z=z0, cor="madeira_clara", b=0.0))
    it.add(cx(L + 0.04, 0.34, 0.05, y=-Pp / 2 - 0.08, z=z0 + 1.0, cor="madeira", b=0.012))
    it.add(placa(est("quadro_chaves"), 1.4, 0.7, y=Pp / 2 - e - 0.001, z=z0 + 1.15))
    it.add(cx(L - 0.14, 0.4, 0.04, y=Pp / 2 - e - 0.2, z=z0 + 0.95, cor="madeira", b=0.01))  # bancada de trabalho
    # máquina de copiar chaves e sapatos no balcão
    it.add(cx(0.26, 0.2, 0.16, x=-0.5, y=-Pp / 2 - 0.02, z=z0 + 1.05, cor="grafite", b=0.03))
    it.add(cil(0.06, 0.03, x=-0.58, y=-Pp / 2 - 0.02, z=z0 + 1.27, cor="metal_claro", seg=16, eixo="x"))
    it.add(cil(0.06, 0.03, x=-0.42, y=-Pp / 2 - 0.02, z=z0 + 1.27, cor="metal_claro", seg=16, eixo="x"))
    for k, (x, c) in enumerate(((0.35, "vermelho"), (0.58, "marrom"))):
        it.add(mb.superelipsoide(0.12, 0.28, 0.04, x=x, y=-Pp / 2 - 0.04, z=z0 + 1.05, cor="preto", e=0.5, nu=12, nv=6))
        it.add(mb.superelipsoide(0.11, 0.24, 0.1, x=x, y=-Pp / 2 - 0.02, z=z0 + 1.08, cor=c, e=0.45, nu=12, nv=6))
        it.add(mb.superelipsoide(0.1, 0.1, 0.1, x=x, y=-Pp / 2 + 0.06, z=z0 + 1.13, cor=c, e=0.5, nu=12, nv=6))
    # porta lateral (dobradiça na frente do vão, abre para fora, +X)
    porta = [cx(0.04, yd1 - yd0 - 0.02, zd - 0.02, x=xr, y=(yd0 + yd1) / 2, z=z0 + 0.01, cor=cor2, b=0.01),
             cx(0.02, 0.1, 0.03, x=xr + 0.03, y=yd1 - 0.12, z=z0 + 1.0, cor="metal_claro", b=0.006)]
    it.porta(porta, (xr + 0.02, yd0 + 0.01, z0), eixo="z", angulo=-100, nome="porta")
    # teto, testeira com letreiro e toldo de listras amarelas
    it.add(cx(L + 0.2, Pp + 0.3, 0.1, y=-0.05, z=z0 + A, cor=cor2, b=0.03))
    it.add(cx(L + 0.1, 0.08, 0.32, y=-Pp / 2 - 0.04, z=z0 + A + 0.06, cor=cor2, b=0.02))
    it.add(placa(est("letreiro_chaveiro", 0.8), 1.86, 0.29, y=-Pp / 2 - 0.081, z=z0 + A + 0.075))
    it.add(toldo_listrado(L + 0.1, 0.5, z0 + A - 0.05, 0.25, y0=-Pp / 2, cores=("amarelo", "branco")))
    it.add(cx(1.2, 0.05, 0.03, y=0.1, z=z0 + A - 0.04, cor=None, mat="luz", b=0.008))
    it.slot("balcao", (0, -Pp / 2 - 0.08, z0 + 1.05), (L - 0.2, 0.3, 0.35))
    it.colisao([((0, 0, 0), (L + 0.1, Pp + 0.1, z0 + A + 0.1))])


def bolinha(r, x=0.0, y=0.0, z=0.0, cor="laranja", esc=(1, 1, 1), seg=7, aneis=4):
    """Esfera leve (mb.esfera tem no mínimo 8 anéis): seg × aneis."""
    perfil = [(r * math.sin(math.pi * k / aneis), -r * math.cos(math.pi * k / aneis)) for k in range(aneis + 1)]
    ob = mb.torno(perfil, cor=cor, seg=seg, angulo=80)
    mb.transforma(ob, loc=(x, y, z), esc=esc)
    return ob


def fruta_pilha(x, y, z, cor, r=0.05, n=7, forma="bola", rnd=None):
    """Monte de frutas numa caixa: bolinhas (laranja, maçã, limão, tomate) em duas camadas."""
    o = []
    pos = [(-0.18, -0.07), (-0.06, -0.08), (0.06, -0.07), (0.18, -0.08), (-0.12, 0.05), (0.0, 0.06), (0.12, 0.05),
           (-0.06, -0.01), (0.06, 0.0)]
    for k, (dx, dy) in enumerate(pos[:n]):
        zz = z + r * (0.9 if k < 7 else 2.3)
        if forma == "pera":
            o.append(bolinha(r, x=x + dx, y=y + dy, z=zz, cor=cor, esc=(0.9, 0.9, 1.15), seg=6))
        else:
            o.append(bolinha(r, x=x + dx, y=y + dy, z=zz, cor=cor, seg=6))
    return o


@peca("banca_frutas", "Banca de frutas com toldo", "banca_frutas", ["banca", "comercio", "calcada", "feira", "luz"])
def _(it):
    L, Pp = 2.2, 1.2
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.add(cx(0.07, 0.07, 2.25, x=sx * (L / 2 - 0.05), y=sy * (Pp / 2 - 0.05), cor="madeira", b=0.012))
    it.add(cx(L, Pp, 0.06, z=0.62, cor="madeira_clara", b=0.015))
    it.add(cx(L - 0.1, 0.04, 0.5, y=-Pp / 2 + 0.06, z=0.12, cor="madeira_mel", b=0.01))
    it.add(cx(L - 0.1, Pp - 0.1, 0.03, z=0.15, cor="madeira_media", b=0.008))
    for k, (zt, yt) in enumerate(((0.68, -0.33), (0.86, 0.0), (1.04, 0.33))):  # degraus da banca
        if k:
            it.add(cx(L - 0.1, 0.36, zt - 0.68, y=yt, z=0.68, cor="madeira_mel", b=0.01))
    frutas = [("laranja", "bola", 0.05), ("vermelho", "bola", 0.048), ("verde_claro", "bola", 0.038),
              ("amarelo", "banana", 0), ("roxo", "uva", 0), ("verde_escuro", "melancia", 0),
              ("verde_lima", "pera", 0.045), ("vermelho_claro", "bola", 0.042), ("amarelo_escuro", "abacaxi", 0)]
    xs = (-0.7, 0.0, 0.7)
    for j, (zt, yt) in enumerate(((0.68, -0.33), (0.86, 0.0), (1.04, 0.33))):
        for i, x in enumerate(xs):
            cor, forma, r = frutas[j * 3 + i]
            it.add(cx(0.64, 0.32, 0.14, x=x, y=yt, z=zt, cor="madeira_clara", b=0.008, seg=1))
            it.add(cx(0.58, 0.26, 0.02, x=x, y=yt, z=zt + 0.1, cor="madeira_media", b=0.0, seg=1))
            zf = zt + 0.12
            if forma in ("bola", "pera"):
                it.add(fruta_pilha(x, yt, zf, cor, r, n=7, forma=forma))
            elif forma == "banana":
                for k in range(3):
                    for q in range(4):
                        dx = -0.18 + 0.18 * k + 0.025 * q
                        it.add(tb([(x + dx, yt - 0.1, zf + 0.04), (x + dx + 0.01, yt, zf + 0.07), (x + dx, yt + 0.1, zf + 0.04)],
                                  0.018, cor="amarelo", seg=4, rc=0.0))
            elif forma == "uva":
                for k in range(3):
                    for q in range(5):
                        a = q * 1.25
                        it.add(bolinha(0.024, x=x - 0.18 + 0.18 * k + 0.035 * math.cos(a), y=yt + 0.035 * math.sin(a),
                                       z=zf + 0.03 + 0.012 * q, cor="roxo", seg=5, aneis=3))
            elif forma == "melancia":
                for k in range(2):
                        it.add(bolinha(0.15, x=x - 0.14 + 0.28 * k, y=yt, z=zf + 0.08, cor="verde_escuro",
                                   esc=(1.0, 0.75, 0.6), seg=12, aneis=6))
                fat = bolinha(0.12, x=x, y=yt - 0.06, z=zf + 0.13, cor="vermelho", esc=(1, 0.35, 0.55), seg=10, aneis=5)
                it.add(fat)
            elif forma == "abacaxi":
                for k in range(3):
                    xx = x - 0.18 + 0.18 * k
                    it.add(bolinha(0.06, x=xx, y=yt, z=zf + 0.07, cor="amarelo_escuro", esc=(1, 1, 1.4), seg=8, aneis=5))
                    it.add(mb.torno([(0, 0), (0.04, 0.0), (0.0, 0.1)], x=xx, y=yt, z=zf + 0.14, cor="folha", seg=5))
    # toldo e placa
    it.add(toldo_listrado(L + 0.3, Pp + 0.2, 2.45, 0.35, y0=Pp / 2 + 0.1, cores=("verde", "branco")))
    it.add(cx(L + 0.1, 0.06, 0.3, y=-Pp / 2 - 0.07, z=1.86, cor="verde_escuro", b=0.015))
    it.add(placa(est("placa_frutas", 0.6), 1.8, 0.3, y=-Pp / 2 - 0.101, z=1.86))
    it.add(cil(0.01, 0.25, x=0.0, y=0.0, z=1.9, cor="preto", seg=6))
    it.add(mb.esfera(0.05, x=0, y=0, z=1.85, cor=None, mat="luz", seg=12))
    it.add(tb([(0.95, -0.55, 2.2), (0.95, -0.55, 1.75)], 0.004, cor="grafite", seg=4))  # balança pendurada
    it.add(cil(0.07, 0.1, x=0.95, y=-0.55, z=1.65, cor="branco", seg=16, b=0.02))
    it.add(cil(0.12, 0.015, x=0.95, y=-0.55, z=1.48, cor="metal", seg=16, b=0.004))
    for a in (0, 120, 240):
        it.add(tb([(0.95 + 0.1 * math.cos(math.radians(a)), -0.55 + 0.1 * math.sin(math.radians(a)), 1.495),
                   (0.95, -0.55, 1.65)], 0.003, cor="grafite", seg=4))
    it.slot("bancada", (0, -0.33, 0.82), (2.0, 0.3, 0.3))
    it.colisao([((0, 0, 0), (L, Pp, 1.25))])


# ======================================================================================================================
# Informação
# ======================================================================================================================
@peca("totem_informacao_mapa", "Totem de informação com mapa luminoso", "totem_informacao", ["totem", "mapa", "calcada",
                                                                                           "luz", "tela"])
def _(it):
    it.add(cx(1.35, 0.5, 0.25, cor="concreto_escuro", b=0.05))
    W, Hm, z0 = 1.05, 1.58, 0.35
    it.add(cx(1.2, 0.3, 1.8, z=0.25, cor="azul_medio", b=0.08, seg=4))
    for s in (-1, 1):
        it.add(cx(W + 0.04, 0.012, Hm + 0.04, y=s * 0.15, z=z0 - 0.02, cor="grafite_escuro", b=0.006))
        m = placa(est("mapa_bairro", 1.0), W, Hm, y=-0.157, z=z0)
        if s > 0:
            gira_z(m, 180)
        it.add(m)
    it.add(cx(1.3, 0.38, 0.09, z=2.05, cor="azul_escuro", b=0.03))
    it.add(cx(1.1, 0.04, 0.025, y=-0.13, z=2.03, cor=None, mat="luz", b=0.006))
    it.add(cx(0.16, 0.12, 0.2, z=2.13, cor="azul_escuro", b=0.03))
    it.add(cil(0.26, 0.1, z=2.55, cor="branco", seg=32, b=0.02, eixo="y"))
    it.add(cil(0.22, 0.12, z=2.55, cor="azul_medio", seg=32, b=0.01, eixo="y"))
    for s in (-1, 1):
        it.add(cx(0.07, 0.03, 0.18, y=s * 0.06, z=2.42, cor="branco", b=0.02))
        it.add(cil(0.042, 0.03, y=s * 0.06, z=2.67, cor="branco", seg=14, b=0.008, eixo="y"))
    it.colisao([((0, 0, 0), (1.35, 0.5, 2.15))])


SETAS = (("seta_centro", "azul_medio", 0), ("seta_praia", "marrom", 165), ("seta_parque", "marrom", 35),
         ("seta_estacao", "azul_medio", 200), ("seta_museu", "marrom", -25))


@peca("placa_direcao_setas", "Placa de direção com setas (bairros)", "placa_direcao", ["placa", "direcao", "calcada", "rua"])
def _(it):
    it.add(cil(0.14, 0.04, cor="concreto_escuro", seg=20, b=0.01))
    it.add(cil(0.05, 3.25, z=0.04, cor="grafite", seg=16, b=0.01))
    it.add(mb.esfera(0.075, z=3.32, cor="ouro", seg=14))
    it.add(cil(0.065, 0.04, z=3.24, cor="grafite", seg=16, b=0.01))
    for k, (nome, cor, ang) in enumerate(SETAS):
        z = 2.92 - 0.3 * k
        L0, L1, a = 0.07, 0.95, 0.24
        perfil = [(L0, 0), (L1 - 0.12, 0), (L1, a / 2), (L1 - 0.12, a), (L0, a)]
        pl = mb.extrudado(perfil, 0.035, y=-0.0175, plano="xz", cor=cor, bisel=0.008, seg=2)
        objs = [pl]
        for s in (-1, 1):
            m = placa(est(nome), 0.72, 0.18, x=(L0 + L1 - 0.12) / 2, y=-0.0185, z=0.03)
            if s > 0:
                gira_z(m, 180, (L0 + L1 - 0.12, 0, 0))
            objs.append(m)
        objs.append(cx(0.08, 0.06, 0.2, x=0.06, z=0.02, cor="grafite", b=0.01))
        for o in objs:
            gira_z(o, ang, (0, 0, z))
        it.add(objs)
    it.colisao([((0, 0, 0), (0.15, 0.15, 3.3))])


# ======================================================================================================================
# Detalhes de calçada
# ======================================================================================================================
@peca("bebedouro_cachorro", "Bebedouro de cachorro com pedal", "bebedouro_cachorro", ["bebedouro", "pet", "agua", "calcada",
                                                                                    "parque"])
def _(it):
    it.add(cx(0.7, 0.85, 0.05, y=-0.12, cor="concreto", b=0.015))
    it.add(cx(0.36, 0.28, 0.8, y=0.12, z=0.05, cor="turquesa", b=0.06, seg=3))
    it.add(cx(0.4, 0.32, 0.06, y=0.12, z=0.85, cor="turquesa_escuro", b=0.025))
    it.add(placa(est("placa_pet"), 0.3, 0.094, y=0.12 - 0.141, z=0.66))
    it.add(tb([(0, -0.02, 0.56), (0, -0.2, 0.58), (0, -0.25, 0.46)], 0.018, cor="cromo", seg=10, rc=0.06))
    it.add(mb.torno([(0, 0.0), (0.2, 0.0), (0.22, 0.1), (0.2, 0.11), (0.17, 0.03), (0, 0.03)], y=-0.27, z=0.05,
                    cor="metal_claro", seg=28))
    it.add(cil(0.185, 0.005, y=-0.27, z=0.12, cor=None, seg=28, b=0.0, mat="agua"))
    it.add(cx(0.12, 0.12, 0.04, x=0.22, y=-0.05, z=0.05, cor="amarelo", b=0.012))
    it.add(_pata_3d(0.0, 0.12 - 0.141, 0.36))
    it.colisao([((0, 0.12, 0), (0.4, 0.32, 0.91)), ((0, -0.27, 0), (0.44, 0.44, 0.16))])


def _pata_3d(x, y, z, s=0.12, cor="branco"):
    o = [cil(s * 0.3, 0.012, x=x, y=y - 0.006, z=z, cor=cor, seg=14, b=0.003, eixo="y")]
    for dx, dz in ((-0.35, 0.3), (-0.12, 0.45), (0.12, 0.45), (0.35, 0.3)):
        o.append(cil(s * 0.11, 0.012, x=x + dx * s, y=y - 0.006, z=z + dz * s, cor=cor, seg=10, b=0.003, eixo="y"))
    return o


@peca("gradil_calcada", "Gradil de calçada (módulo de 2 m)", "gradil_calcada", ["gradil", "calcada", "modular", "rua"])
def _(it):
    L, A, cor = 2.0, 1.0, "verde_floresta"
    for x in (-L / 2 + 0.03, L / 2 - 0.03):
        it.add(cx(0.06, 0.06, A + 0.04, x=x, cor=cor, b=0.012))
        it.add(cx(0.12, 0.12, 0.02, x=x, cor=cor, b=0.006))
        it.add(mb.esfera(0.04, x=x, z=A + 0.07, cor=cor, seg=12))
    it.add(tb([(-L / 2 + 0.03, 0, A - 0.02), (L / 2 - 0.03, 0, A - 0.02)], 0.024, cor=cor, seg=10))
    it.add(cx(L - 0.06, 0.04, 0.04, z=0.14, cor=cor, b=0.01))
    n = 15
    for k in range(n):
        x = -L / 2 + 0.1 + (L - 0.2) * k / (n - 1)
        it.add(cil(0.011, A - 0.2, x=x, z=0.16, cor=cor, seg=8, b=0.0))
        if k % 2 == 0:
            it.add(anel(0.05, 0.008, x=x, z=0.6, cor=cor, seg=12, seg_r=4, eixo="y"))
    it.colisao([((0, 0, 0), (L, 0.12, A + 0.1))])


def floreira(it, L, Pp, A, plantas):
    it.add(cx(L, Pp, A - 0.04, cor="concreto", b=0.05, seg=3))
    e = 0.08  # borda em moldura (4 peças) e a terra um pouco abaixo dela
    for sx, sy, l, p in ((0, 1, L + 0.04, e), (0, -1, L + 0.04, e), (1, 0, e, Pp + 0.04 - 2 * e), (-1, 0, e, Pp + 0.04 - 2 * e)):
        it.add(cx(l, p, 0.08, x=sx * (L + 0.04 - e) / 2, y=sy * (Pp + 0.04 - e) / 2, z=A - 0.06, cor="concreto_escuro",
                  b=0.02))
    it.add(cx(L - 2 * e + 0.05, Pp - 2 * e + 0.05, 0.03, z=A - 0.05, cor="terra", b=0.0))
    it.add(cx(L + 0.01, Pp + 0.01, 0.04, z=0.1, cor="concreto_escuro", b=0.01))
    for x, y, r, h in plantas:
        it.add(mb.superelipsoide(2 * r, 2 * r, h, x=x, y=y, z=A - 0.06, cor="folha", e=0.7, e_v=0.6, nu=16, nv=8))
        it.add(mb.superelipsoide(1.4 * r, 1.4 * r, h * 0.6, x=x - r * 0.25, y=y - r * 0.2, z=A - 0.06 + h * 0.5,
                                 cor="folha_clara", e=0.7, e_v=0.6, nu=12, nv=6))
        for k in range(5):
            a = k * 1.3 + x
            it.add(mb.esfera(0.035, x=x + r * 0.8 * math.cos(a), y=y + r * 0.8 * math.sin(a),
                             z=A - 0.06 + h * (0.55 + 0.08 * (k % 2)), cor=("rosa", "amarelo", "branco", "rosa", "lilas")[k],
                             seg=7))


@peca("floreira_concreto_pequena", "Floreira de concreto pequena", "floreira_concreto", ["floreira", "calcada", "planta"])
def _(it):
    floreira(it, 0.9, 0.9, 0.55, [(0, 0, 0.32, 0.45)])


@peca("floreira_concreto_grande", "Floreira de concreto grande com bancos de ripas", "floreira_concreto",
      ["floreira", "calcada", "planta", "banco"])
def _(it):
    L, Pp, A = 2.4, 1.1, 0.42
    it.add(cx(L, Pp, A, cor="concreto", b=0.05, seg=3))
    it.add(cx(L + 0.01, Pp + 0.01, 0.04, z=0.1, cor="concreto_escuro", b=0.01))
    for s in (-1, 1):
        for k in range(3):
            it.add(cx(L - 0.06, 0.085, 0.04, y=s * (Pp / 2 - 0.06 - 0.1 * k), z=A, cor="madeira_mel", b=0.012))
        for x in (-0.6, 0.6):
            it.assento(x, s * (Pp / 2 - 0.16), A + 0.04)
    it.add(cx(2.2, 0.38, 0.32, z=A, cor="concreto_escuro", b=0.04))
    it.add(cx(2.06, 0.26, 0.02, z=A + 0.31, cor="terra", b=0.0))
    for x in (-0.75, 0.75):
        it.add(mb.superelipsoide(0.42, 0.34, 0.34, x=x, y=0, z=A + 0.3, cor="folha", e=0.7, e_v=0.6, nu=16, nv=8))
        for k in range(4):
            it.add(mb.esfera(0.03, x=x + 0.15 * math.cos(k * 1.6), y=0.13 * math.sin(k * 1.6), z=A + 0.55,
                             cor=("rosa", "amarelo", "branco", "lilas")[k], seg=7))
    it.add(cil(0.04, 0.9, z=A + 0.3, cor="madeira_media", seg=10))
    it.add(mb.superelipsoide(0.8, 0.8, 0.75, z=A + 1.0, cor="folha", e=0.85, e_v=0.7, nu=18, nv=9))
    it.add(mb.superelipsoide(0.5, 0.5, 0.45, x=-0.12, y=-0.1, z=A + 1.4, cor="folha_clara", e=0.85, e_v=0.7, nu=14, nv=7))
    it.colisao([((0, 0, 0), (L, Pp, A + 0.04)), ((0, 0, A), (2.2, 0.38, 0.32))])


@peca("tampa_bueiro", "Tampa de bueiro (decalque)", "tampa_bueiro", ["decalque", "rua", "calcada"], mini=MINI_TOPO)
def _(it):
    it.add(mb.torno([(0.33, 0.0), (0.42, 0.0), (0.42, 0.006), (0.405, 0.01), (0.34, 0.01), (0.33, 0.004)],
                    cor="concreto_escuro", seg=36))
    it.add(cil(0.335, 0.01, cor="metal_escuro", seg=36, b=0.002))
    for r in (0.1, 0.2, 0.29):
        it.add(mb.torno([(r - 0.012, 0.009), (r + 0.012, 0.009), (r + 0.01, 0.0135), (r - 0.01, 0.0135)], cor="grafite",
                        seg=32))
    for k in range(8):
        b = cx(0.18, 0.018, 0.004, x=0.195, z=0.009, cor="grafite", b=0.0, seg=1)
        gira(b, "Z", 22.5 + 45 * k)
        it.add(b)
    for x in (-0.24, 0.24):
        it.add(cil(0.02, 0.003, x=x, y=0.05, z=0.0095, cor="preto", seg=10, b=0.0))
    it.colisao([])


@peca("grelha_boca_lobo", "Grelha de boca de lobo (decalque)", "boca_lobo", ["decalque", "rua", "drenagem"], mini=MINI_TOPO)
def _(it):
    L, Pp = 1.0, 0.45
    it.add(cx(L - 0.06, Pp - 0.06, 0.004, cor="preto", b=0.0, seg=1))
    for xs, ys, l, p in ((0, Pp / 2 - 0.02, L, 0.04), (0, -Pp / 2 + 0.02, L, 0.04), (L / 2 - 0.02, 0, 0.04, Pp),
                         (-L / 2 + 0.02, 0, 0.04, Pp)):
        it.add(cx(l, p, 0.012, x=xs, y=ys, cor="metal_escuro", b=0.003, seg=1))
    for k in range(11):
        x = -L / 2 + 0.07 + (L - 0.14) * k / 10
        it.add(cx(0.035, Pp - 0.06, 0.01, x=x, cor="grafite", b=0.002, seg=1))
    it.add(cx(L - 0.1, 0.03, 0.009, cor="grafite", b=0.002, seg=1))
    it.colisao([])


@peca("lixeira_subterranea", "Lixeira subterrânea (boca de inox)", "lixeira_subterranea", ["lixeira", "calcada", "rua",
                                                                                         "interativo"])
def _(it):
    it.add(cx(1.3, 1.3, 0.025, cor="metal_escuro", b=0.008))
    for k in range(6):
        it.add(cx(1.1, 0.03, 0.006, y=-0.5 + 0.2 * k, z=0.025, cor="metal", b=0.0, seg=1))
    it.add(cx(0.62, 0.62, 1.05, z=0.025, cor="metal_claro", b=0.12, seg=4))
    it.add(cx(0.68, 0.68, 0.1, z=1.05, cor="verde_escuro", b=0.04))
    it.add(anel(0.07, 0.014, z=1.17, cor="amarelo", seg=14, seg_r=5, eixo="y"))
    it.add(cil(0.04, 0.03, z=1.15, cor="amarelo", seg=12))
    yf = -0.31
    it.add(cx(0.38, 0.012, 0.22, y=yf + 0.004, z=0.74, cor="preto", b=0.004))
    it.add(placa(est("rotulo_lixo"), 0.3, 0.3, y=yf - 0.002, z=0.28))
    aba = [cx(0.42, 0.03, 0.26, y=yf - 0.014, z=0.72, cor="verde_escuro", b=0.01),
           cx(0.2, 0.03, 0.03, y=yf - 0.04, z=0.75, cor="metal_escuro", b=0.008)]
    it.porta(aba, (0, yf - 0.014, 0.98), eixo="x", lado="cima", abre_graus=70, nome="aba")
    it.colisao([((0, 0, 0), (0.68, 0.68, 1.15))])


@peca("conteiner_reciclagem_vidro", "Contêiner de reciclagem de vidro (iglu)", "conteiner_vidro", ["lixeira", "reciclagem",
                                                                                                 "calcada", "rua"])
def _(it):
    perfil = [(0, 0), (0.72, 0), (0.75, 0.05), (0.74, 0.4), (0.67, 0.88), (0.52, 1.22), (0.3, 1.43), (0.1, 1.5), (0, 1.5)]
    it.add(mb.torno(perfil, cor="verde", seg=32, angulo=50))
    it.add(mb.torno([(0.75, 0.0), (0.77, 0.0), (0.77, 0.1), (0.745, 0.11)], cor="verde_escuro", seg=32))
    for ang in (-28, 28):  # bocas de borracha
        b = [cil(0.13, 0.14, y=0, z=0, cor="verde_escuro", seg=20, b=0.02, eixo="y"),
             cil(0.1, 0.02, y=-0.075, cor="preto", seg=18, b=0.0, eixo="y"),
             anel(0.1, 0.02, y=-0.07, cor="borracha", seg=18, seg_r=4, eixo="y")]
        for o in b:
            mb.transforma(o, rot=("X", -22))
            mb.transforma(o, loc=(0, -0.62, 1.0))
            gira_z(o, ang)
        it.add(b)
    rt = placa(est("rotulo_vidro"), 0.38, 0.38, y=0, z=-0.19)
    mb.transforma(rt, rot=("X", -8))
    mb.transforma(rt, loc=(0, -0.725, 0.55))
    it.add(rt)
    it.add(cil(0.05, 0.12, z=1.45, cor="amarelo_escuro", seg=12))
    it.add(anel(0.11, 0.025, z=1.7, cor="amarelo", seg=16, seg_r=5, eixo="y"))
    it.colisao([((0, 0, 0), (1.4, 1.4, 1.5))])


# ======================================================================================================================
# Telhado
# ======================================================================================================================
@peca("caixa_dagua_torre", "Caixa d'água de prédio em torre de metal", "caixa_dagua_torre", ["telhado", "caixa_dagua",
                                                                                           "predio"])
def _(it):
    zt, b0, b1 = 3.0, 0.85, 0.62
    cor = "metal_escuro"
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.add(tb([(sx * b0, sy * b0, 0), (sx * b1, sy * b1, zt)], 0.055, cor=cor, seg=8))
            it.add(cx(0.24, 0.24, 0.06, x=sx * b0, y=sy * b0, cor="concreto_escuro", b=0.015))
    def lado(z):
        return b0 + (b1 - b0) * z / zt
    for z in (1.0, 2.0, zt - 0.05):
        r = lado(z)
        it.add(tb([(-r, -r, z), (r, -r, z), (r, r, z), (-r, r, z), (-r, -r, z)], 0.03, cor=cor, seg=8, rc=0.0))
    for z0, z1 in ((0.0, 1.0), (1.0, 2.0), (2.0, zt - 0.05)):
        r0, r1 = lado(z0), lado(z1)
        for k in range(4):
            a = math.radians(90 * k)
            c, s = math.cos(a), math.sin(a)
            def pt(u, r, z):  # ponto na face k (u de −1 a 1)
                return (c * r - s * u * r, s * r + c * u * r, z)
            it.add(tb([pt(-1, r0, z0), pt(1, r1, z1)], 0.018, cor=cor, seg=6))
            it.add(tb([pt(1, r0, z0), pt(-1, r1, z1)], 0.018, cor=cor, seg=6))
    it.add(cx(1.75, 1.75, 0.08, z=zt, cor="metal", b=0.02))
    R = 1.02
    it.add(mb.torno([(0, zt + 0.08), (R - 0.08, zt + 0.08), (R, zt + 0.18), (R, zt + 1.95), (R + 0.03, zt + 2.0),
                     (0.18, zt + 2.45), (0.0, zt + 2.47)], cor="cinza_claro", seg=32))
    it.add(mb.torno([(R + 0.03, zt + 1.98), (R + 0.05, zt + 2.0), (0.2, zt + 2.47), (0.0, zt + 2.5)], cor="verde_lima",
                    seg=32))
    for z in (zt + 0.7, zt + 1.35):
        it.add(anel(R + 0.005, 0.025, z=z, cor="metal", seg=32, seg_r=5))
    it.add(cil(0.12, 0.12, z=zt + 2.48, cor="verde_lima", seg=12, b=0.02))
    it.add(cil(0.17, 0.04, z=zt + 2.6, cor="verde_lima", seg=14, b=0.01))
    # escada de marinheiro até o topo e guarda-corpo da plataforma
    ye = -1.12
    for x in (-0.2, 0.2):
        it.add(tb([(x, -b0 - 0.05, 0.0), (x, ye, zt - 0.2), (x, ye, zt + 2.05)], 0.02, cor="metal", seg=6, rc=0.15))
    for k in range(1, 24):
        z = 0.25 * k
        y = -b0 - 0.05 + (ye + b0 + 0.05) * min(1, z / (zt - 0.2))
        it.add(tb([(-0.2, y, z), (0.2, y, z)], 0.012, cor="metal", seg=6))
    it.colisao([((0, 0, 0), (1.9, 1.9, zt + 0.08)), ((0, 0, zt), (2.1, 2.1, 2.6))])


@peca("caixa_dagua_fibra", "Caixa d'água de fibra azul (1.000 L)", "caixa_dagua_fibra", ["telhado", "caixa_dagua", "casa"])
def _(it):
    it.add(cx(1.45, 1.45, 0.1, cor="concreto", b=0.02))
    perfil = [(0, 0.1), (0.5, 0.1), (0.55, 0.14)]
    for k in range(4):
        z = 0.22 + 0.18 * k
        r = 0.56 + 0.025 * k
        perfil += [(r, z - 0.04), (r + 0.025, z - 0.02), (r + 0.025, z + 0.02), (r, z + 0.04)]
    perfil += [(0.66, 0.92), (0.0, 0.92)]
    it.add(mb.torno(perfil, cor="azul_medio", seg=32))
    it.add(mb.torno([(0, 0.9), (0.7, 0.9), (0.71, 0.96), (0.62, 1.04), (0.2, 1.1), (0, 1.11)], cor="azul", seg=32))
    it.add(cil(0.08, 0.05, z=1.09, cor="azul", seg=14, b=0.015))
    # cano de entrada com boia (em cima) e saída com registro (embaixo)
    it.add(tb([(0.4, 0.25, 0.95), (0.4, 0.75, 0.95), (0.4, 0.75, 0.1)], 0.028, cor="branco", seg=8, rc=0.08))
    it.add(tb([(-0.5, -0.2, 0.22), (-0.85, -0.2, 0.22), (-0.85, -0.2, 0.1)], 0.028, cor="branco", seg=8, rc=0.06))
    it.add(cil(0.045, 0.08, x=-0.7, y=-0.2, z=0.22, cor="amarelo", seg=12, eixo="x"))
    it.add(cx(0.03, 0.14, 0.025, x=-0.7, y=-0.2, z=0.27, cor="vermelho", b=0.008))
    it.colisao([((0, 0, 0), (1.45, 1.45, 1.12))])


def parabolica(it, R, cor, alt, elev=35, base="lastro"):
    f = 0.62 * R
    perfil = []
    for k in range(9):
        r = R * k / 8
        perfil.append((r, r * r / (4 * f)))
    perfil += [(R * 1.0, R * R / (4 * f) + 0.025)] + [(R * k / 8, (R * k / 8) ** 2 / (4 * f) + 0.025) for k in range(7, -1, -1)]
    prato = mb.torno(perfil[:-1] + [(0, 0.025)], cor=cor, seg=32, angulo=60)
    zR = R * R / (4 * f)
    lnb = [tb([(0, -R * 0.96, zR), (0, -0.03, f - 0.08)], 0.018 * max(1, R), cor="cinza", seg=6),
           cil(0.035 * max(1, R), 0.12 * max(1, R), z=f - 0.11, cor="grafite", seg=12),
           cil(0.045 * max(1, R), 0.03, z=f - 0.12, cor="vermelho", seg=12)]
    costas = cil(0.12 * R, 0.1, z=-0.08, cor="metal", seg=12)
    grupo = [prato, costas] + lnb
    th = 90 - elev
    for o in grupo:
        mb.transforma(o, rot=("X", th))
        mb.transforma(o, loc=(0, 0, alt))
    it.add(grupo)
    it.add(cil(0.04 * max(1, R), alt - 0.04, z=0.04, cor="metal_escuro", seg=12))
    it.add(cil(0.07 * max(1, R), 0.14, z=alt - 0.22, cor="metal_escuro", seg=12, b=0.01))
    it.add(tb([(0, 0, alt - 0.12), (0, 0.06, alt)], 0.035 * max(1, R), cor="metal_escuro", seg=8))
    if base == "lastro":
        for a in (0, 90):
            it.add(gira_z(cx(1.6, 0.1, 0.08, cor="metal_escuro", b=0.01), a))
        for sx, sy in ((0.7, 0), (-0.7, 0), (0, 0.7), (0, -0.7)):
            it.add(cx(0.34, 0.34, 0.16, x=sx, y=sy, cor="concreto", b=0.03))
    else:
        for k in range(3):
            a = math.radians(90 + 120 * k)
            it.add(tb([(0, 0, alt * 0.45), (0.45 * math.cos(a), 0.45 * math.sin(a), 0.02)], 0.016, cor="metal_escuro", seg=6))
            it.add(cx(0.08, 0.08, 0.02, x=0.45 * math.cos(a), y=0.45 * math.sin(a), cor="metal_escuro", b=0.005))


@peca("antena_parabolica_grande", "Antena parabólica grande", "antena_parabolica", ["telhado", "antena"])
def _(it):
    parabolica(it, 1.15, "branco", 1.45, base="lastro")
    it.colisao([((0, 0, 0), (1.7, 1.7, 0.2)), ((0, -0.3, 0.3), (2.3, 1.6, 2.2))])


@peca("antena_parabolica_pequena", "Antena parabólica pequena", "antena_parabolica", ["telhado", "antena", "casa"])
def _(it):
    parabolica(it, 0.38, "cinza_claro", 1.05, elev=30, base="tripe")
    it.colisao([((0, 0, 0), (0.84, 0.82, 1.46))])


def yagi(x, y, z, comp, n, l0, l1, cor="metal", r=0.008):
    """Antena de TV tipo espinha (yagi): gancho ao longo de Y (frente −Y), elementos em X."""
    o = [tb([(x, y + comp * 0.3, z), (x, y - comp * 0.7, z)], 0.012, cor=cor, seg=6)]
    for k in range(n):
        yy = y + comp * 0.3 - comp * k / (n - 1)
        L = l0 + (l1 - l0) * k / (n - 1)
        o.append(tb([(x - L / 2, yy, z), (x + L / 2, yy, z)], r, cor=cor, seg=5))
    return o


@peca("antena_tv_espinha", "Antena de TV espinha de peixe", "antena_tv", ["telhado", "antena", "casa"])
def _(it):
    for k in range(3):
        a = math.radians(90 + 120 * k)
        it.add(tb([(0, 0, 0.9), (0.55 * math.cos(a), 0.55 * math.sin(a), 0.02)], 0.016, cor="metal_escuro", seg=6))
        it.add(cx(0.1, 0.1, 0.02, x=0.55 * math.cos(a), y=0.55 * math.sin(a), cor="metal_escuro", b=0.005))
    it.add(cil(0.025, 2.55, cor="metal", seg=10))
    it.add(yagi(0, 0, 2.45, 1.5, 10, 0.95, 0.42))
    for z in (2.3, 2.38, 2.52, 2.6):  # refletor em grade atrás
        it.add(tb([(-0.45, 0.5, z), (0.45, 0.5, z)], 0.006, cor="metal", seg=4))
    it.add(tb([(0, 0.5, 2.28), (0, 0.5, 2.62)], 0.008, cor="metal", seg=4))
    it.add(cx(0.08, 0.06, 0.05, y=0.25, z=2.39, cor="preto", b=0.01))
    it.add(tb([(0, 0.25, 2.39), (0.04, 0.03, 2.2), (0.035, 0.03, 0.05)], 0.008, cor="preto", seg=5, rc=0.1))
    it.colisao([((0, 0, 0), (0.15, 0.15, 2.6))])


@peca("antena_tv_mastro", "Mastro de antenas de TV com estais", "antena_tv", ["telhado", "antena", "predio"])
def _(it):
    it.add(cx(0.3, 0.3, 0.03, cor="metal_escuro", b=0.008))
    it.add(cil(0.035, 3.3, z=0.03, cor="metal", seg=10))
    # log-periódica no alto: elementos em leque ao longo do gancho
    zt = 3.15
    it.add(tb([(0, 0.35, zt), (0, -0.85, zt)], 0.014, cor="metal", seg=6))
    for k in range(9):
        yy = 0.35 - 1.2 * k / 8
        L = 1.1 - 0.85 * k / 8
        it.add(tb([(-L / 2, yy + 0.06, zt), (0, yy, zt), (L / 2, yy + 0.06, zt)], 0.007, cor="metal", seg=5, rc=0.0))
    # bigode (VHF) mais baixo, virado de lado
    zb = 2.5
    for s in (-1, 1):
        it.add(tb([(0, 0, zb), (s * 0.55, 0, zb + 0.3)], 0.01, cor="metal", seg=5))
    it.add(cx(0.07, 0.05, 0.06, y=-0.04, z=zb - 0.03, cor="preto", b=0.01))
    it.add(yagi(0, 0, 1.9, 0.8, 6, 0.5, 0.3))
    for k in range(3):  # estais
        a = math.radians(30 + 120 * k)
        p = (1.1 * math.cos(a), 1.1 * math.sin(a))
        it.add(tb([(0, 0, 2.2), (p[0], p[1], 0.06)], 0.004, cor="cinza", seg=4))
        it.add(cil(0.04, 0.06, x=p[0], y=p[1], cor="metal_escuro", seg=8))
    it.add(tb([(0.0, -0.04, zb - 0.03), (0.05, 0.02, 2.0), (0.04, 0.02, 0.05)], 0.008, cor="preto", seg=5, rc=0.1))
    it.colisao([((0, 0, 0), (0.3, 0.3, 3.35))])


def helice(r, n=3, cor="cinza_medio", larg=0.42):
    """Hélice de ventilador no plano XZ (eixo Y), centrada na origem."""
    o = [cil(r * 0.22, 0.05, y=0, cor="grafite", seg=14, b=0.01, eixo="y")]
    for k in range(n):
        pts = [(r * 0.18 + (r * 0.8) * t / 6, larg * r * math.sin(math.pi * t / 6) * (1.1 - 0.3 * t / 6)) for t in range(7)]
        pts += [(r * 0.18 + (r * 0.8) * t / 6, -0.25 * larg * r * math.sin(math.pi * t / 6)) for t in range(5, 0, -1)]
        pa = mb.extrudado(mb._ccw(pts), 0.012, y=-0.006, plano="xz", cor=cor, bisel=0.0, seg=1)
        gira(pa, "X", 0)
        gira(pa, "Y", 360 * k / n + 15)
        o.append(pa)
    return o


@peca("condensadora_parede", "Condensadora de ar-condicionado de parede (hélice gira)", "condensadora_parede",
      ["fachada", "ar_condicionado", "animado"], fixacao="parede", alt=2.6)
def _(it):
    for x in (-0.3, 0.3):  # mãos-francesas
        it.add(cx(0.04, 0.03, 0.4, x=x, y=-0.015, z=0.0, cor="metal_escuro", b=0.008))
        it.add(cx(0.04, 0.47, 0.035, x=x, y=-0.235, z=0.0, cor="metal_escuro", b=0.008))
        it.add(tb([(x, -0.03, 0.36), (x, -0.42, 0.04)], 0.012, cor="metal_escuro", seg=6))
    L, Pp, A, y0, z0 = 0.86, 0.32, 0.6, -0.1, 0.035
    yc = y0 - Pp / 2
    it.add(cx(L, Pp, A, y=yc, z=z0, cor="branco_gelo", b=0.03, seg=3))
    for x in (-0.36, 0.36):
        it.add(cx(0.06, 0.08, 0.02, x=x, y=yc, z=z0 - 0.002, cor="borracha", b=0.005))
    yf = y0 - Pp
    xc, zc, r = -0.12, z0 + A / 2, 0.24
    it.add(anel(r + 0.012, 0.016, x=xc, y=yf - 0.005, z=zc, cor="cinza_claro", seg=32, seg_r=6, eixo="y"))
    it.add(cil(r, 0.01, x=xc, y=yf + 0.06, z=zc, cor="preto", seg=28, b=0.0, eixo="y"))
    gr = []
    for rr in (0.08, 0.16, 0.235):
        gr.append(anel(rr, 0.005, x=xc, y=yf - 0.012, z=zc, cor="branco", seg=24, seg_r=4, eixo="y"))
    for a in (0, 90):
        b = cx(0.48, 0.01, 0.012, x=0, y=0, z=-0.006, cor="branco", b=0.0, seg=1)
        gira(b, "Y", a)
        move(b, (xc, yf - 0.012, zc))
        gr.append(b)
    it.add(gr)
    hel = helice(0.2)
    move(hel, (xc, yf + 0.035, zc))
    it.anima(hel, {"anima": "girar", "eixo": "z", "velocidade": 300}, "helice", pivo=(xc, yf + 0.035, zc))
    for k in range(6):  # venezianas do lado direito da frente
        it.add(cx(0.22, 0.012, 0.02, x=0.27, y=yf - 0.004, z=z0 + 0.12 + 0.07 * k, cor="cinza_claro", b=0.004, seg=1))
    # tampa de serviço e canos de cobre com isolamento até a parede
    it.add(cx(0.012, 0.16, 0.2, x=L / 2 + 0.004, y=yc - 0.04, z=z0 + 0.08, cor="cinza_claro", b=0.004))
    for k, (z, r_) in enumerate(((z0 + 0.12, 0.016), (z0 + 0.2, 0.022))):
        it.add(tb([(L / 2, yc - 0.08, z), (L / 2 + 0.06, yc - 0.08, z), (L / 2 + 0.06, -0.003, z)], r_,
                  cor="cobre" if k == 0 else "preto", seg=8, rc=0.04))
    it.colisao([((0, yc, z0), (L, Pp, A))])


@peca("condensadora_telhado", "Condensadora grande de telhado (2 hélices giram)", "condensadora_telhado",
      ["telhado", "ar_condicionado", "animado"])
def _(it):
    L, Pp, A, z0 = 1.4, 0.85, 1.0, 0.12
    for y in (-0.33, 0.33):
        it.add(cx(1.55, 0.1, z0, y=y, cor="metal_escuro", b=0.015))
    it.add(cx(L, Pp, A, z=z0, cor="branco_gelo", b=0.04, seg=3))
    for k in range(9):  # venezianas na frente e nos lados
        z = z0 + 0.12 + 0.08 * k
        it.add(cx(L - 0.16, 0.012, 0.025, y=-Pp / 2 - 0.004, z=z, cor="cinza_claro", b=0.0, seg=1))
        it.add(cx(0.012, Pp - 0.16, 0.025, x=-L / 2 - 0.004, z=z, cor="cinza_claro", b=0.0, seg=1))
    zt = z0 + A
    for i, x in enumerate((-0.34, 0.34)):
        it.add(anel(0.31, 0.03, x=x, z=zt + 0.01, cor="cinza_claro", seg=32, seg_r=6))
        it.add(cil(0.3, 0.01, x=x, z=zt - 0.08, cor="preto", seg=28, b=0.0))
        gr = [anel(rr, 0.006, x=x, z=zt + 0.035, cor="grafite", seg=18, seg_r=3) for rr in (0.1, 0.2, 0.29)]
        for a in (0, 60, 120):
            b = cx(0.6, 0.012, 0.012, z=-0.006, cor="grafite", b=0.0, seg=1)
            gira(b, "Z", a)
            move(b, (x, 0, zt + 0.035))
            gr.append(b)
        it.add(gr)
        hel = helice(0.27, n=4)
        gira(hel, "X", 90)
        move(hel, (x, 0, zt - 0.03))
        it.anima(hel, {"anima": "girar", "eixo": "y", "velocidade": 280 if i == 0 else -260}, f"helice_{i + 1}",
                 pivo=(x, 0, zt - 0.03))
    it.add(cx(0.012, 0.3, 0.3, x=L / 2 + 0.004, y=-0.1, z=z0 + 0.15, cor="cinza_claro", b=0.004))
    for k, z in enumerate((z0 + 0.22, z0 + 0.32)):
        it.add(tb([(L / 2, 0.1, z), (L / 2 + 0.12, 0.1, z), (L / 2 + 0.12, 0.6, z), (L / 2 + 0.12, 0.6, 0.02)],
                  0.02 + 0.008 * k, cor="cobre" if k == 0 else "preto", seg=8, rc=0.06))
    it.colisao([((0, 0, 0), (L + 0.15, Pp, zt + 0.05))])


@peca("exaustor_telhado", "Exaustor eólico de telhado (gira)", "exaustor_telhado", ["telhado", "ventilacao", "animado"])
def _(it):
    it.add(cx(0.72, 0.72, 0.03, cor="metal", b=0.01))
    it.add(mb.torno([(0.34, 0.03), (0.22, 0.12), (0.2, 0.13)], cor="metal", seg=24))
    it.add(cil(0.2, 0.3, z=0.12, cor="metal_claro", seg=24, b=0.004))
    it.add(anel(0.205, 0.012, z=0.42, cor="metal", seg=24, seg_r=4))
    rot = [anel(0.22, 0.014, z=0.44, cor="metal_claro", seg=24, seg_r=4), anel(0.12, 0.012, z=0.84, cor="metal_claro",
                                                                               seg=20, seg_r=4)]
    n = 16
    for k in range(n):
        f0 = 2 * math.pi * k / n
        pts = []
        for t in range(9):
            u = t / 8
            r = 0.22 + (0.12 - 0.22) * u + 0.1 * math.sin(math.pi * u)
            f = f0 + math.radians(55) * u
            pts.append((r * math.cos(f), r * math.sin(f), 0.44 + 0.4 * u))
        rot.append(fita(pts, 0.07, lambda p: V((p.x, p.y, 0)).normalized(), cor="metal_claro", esp=0.006))
    rot.append(mb.torno([(0.13, 0.84), (0.1, 0.88), (0.0, 0.9)], cor="metal", seg=20))
    rot.append(cil(0.02, 0.05, z=0.88, cor="metal_escuro", seg=8))
    it.anima(rot, {"anima": "girar", "eixo": "y", "velocidade": 90}, "rotor", pivo=(0, 0, 0.44))
    it.colisao([((0, 0, 0), (0.72, 0.72, 0.95))])


@peca("painel_solar_telhado", "Painel solar de telhado (6 placas)", "painel_solar", ["telhado", "solar", "energia"])
def _(it):
    inc = 25
    pw, ph = 0.92, 1.42
    th = math.radians(inc)
    for row in range(2):
        for col in range(3):
            x = -0.95 + 0.95 * col
            s0 = row * (ph + 0.04)
            g = [cx(pw, ph, 0.04, cor="metal_claro", b=0.008), cx(pw - 0.04, ph - 0.04, 0.004, z=0.04, cor="azul_escuro",
                                                                 b=0.0, seg=1)]
            cel = placa(est("celulas_solares"), pw - 0.05, ph - 0.05, y=0, z=-(ph - 0.05) / 2)
            gira(cel, "X", -90)
            move(cel, (0, 0, 0.045))
            g.append(cel)
            for o in g:
                mb.transforma(o, loc=(0, ph / 2 + s0, 0))
                mb.transforma(o, rot=("X", inc))
                mb.transforma(o, loc=(x, -1.35, 0.35))
            it.add(g)
    Ltot = 2 * ph + 0.04
    yb, zb = -1.35, 0.35
    for x in (-1.3, -0.45, 0.45, 1.3):
        ya, za = yb + 0.1 * math.cos(th), zb + 0.1 * math.sin(th) - 0.03
        yt, zt_ = yb + (Ltot - 0.1) * math.cos(th), zb + (Ltot - 0.1) * math.sin(th) - 0.03
        it.add(tb([(x, ya, za), (x, yt, zt_)], 0.02, cor="metal", seg=6))
        it.add(tb([(x, ya, za), (x, ya, 0.0)], 0.022, cor="metal", seg=6))
        it.add(tb([(x, yt, zt_), (x, yt, 0.0)], 0.022, cor="metal", seg=6))
        it.add(tb([(x, ya, 0.05), (x, yt, zt_ * 0.6)], 0.012, cor="metal", seg=6))
        for y in (ya, yt):
            it.add(cx(0.12, 0.12, 0.03, x=x, y=y, cor="metal_escuro", b=0.008))
    it.add(cx(0.32, 0.12, 0.42, x=1.3, y=yt + 0.1, z=0.25, cor="cinza_claro", b=0.03))
    it.add(cx(0.08, 0.01, 0.03, x=1.3, y=yt + 0.035, z=0.55, cor=None, mat="neon", b=0.0))
    it.colisao([((0, -1.35 + Ltot * math.cos(th) / 2, 0), (2.9, Ltot * math.cos(th) + 0.2, 0.35 + Ltot * math.sin(th)))])


@peca("para_raios", "Para-raios com luz de balizamento (pisca)", "para_raios", ["telhado", "para_raios", "luz", "animado"])
def _(it):
    it.add(cx(0.4, 0.4, 0.03, cor="metal_escuro", b=0.008))
    it.add(cil(0.045, 2.0, z=0.03, cor="metal", seg=12))
    it.add(cil(0.032, 1.55, z=2.0, cor="metal", seg=12))
    it.add(cil(0.05, 0.08, z=1.98, cor="metal_escuro", seg=12, b=0.01))
    it.add(cil(0.045, 0.12, z=3.55, cor="preto", seg=12, b=0.01))
    it.add(mb.torno([(0, 3.66), (0.02, 3.66), (0.012, 3.95), (0, 3.98)], cor="cobre", seg=10))
    for k in range(4):
        a = math.radians(90 * k)
        it.add(tb([(0, 0, 3.7), (0.09 * math.cos(a), 0.09 * math.sin(a), 3.88)], 0.007, cor="cobre", seg=5))
    for z in (0.6, 1.4, 2.2, 3.0):  # isoladores e cabo de descida
        it.add(tb([(0, 0, z), (0.09, 0, z)], 0.008, cor="metal", seg=5))
        it.add(mb.esfera(0.022, x=0.09, z=z, cor="branco", seg=10))
    it.add(tb([(0.0, 0.0, 3.65), (0.09, 0.0, 3.4), (0.09, 0.0, 0.08), (0.18, 0.0, 0.03)], 0.007, cor="cobre", seg=5, rc=0.05))
    it.add(cil(0.05, 0.05, z=2.75, cor="grafite", seg=12, b=0.01))
    lz = mb.esfera(0.045, z=2.83, cor=None, mat="luz_vermelha", esc=(1, 1, 1.2), seg=12)
    it.anima(lz, {"anima": "piscar", "periodo": 1.5}, "balizamento")
    it.colisao([((0, 0, 0), (0.12, 0.12, 3.6))])


@peca("chamine_tijolo", "Chaminé de tijolo com potes", "chamine_tijolo", ["telhado", "chamine", "casa"])
def _(it):
    it.add(cx(0.86, 0.86, 0.04, cor="metal", b=0.01))
    it.add(cx(0.68, 0.68, 1.5, z=0.03, cor="terracota_escura", b=0.015))
    import random
    rnd = random.Random(4)
    for k in range(11):
        z = 0.05 + 0.13 * k
        it.add(cx(0.7, 0.7, 0.105, z=z, cor="tijolo", b=0.012, seg=1))
        for j in range(2):
            lado = rnd.randrange(4)
            u = rnd.uniform(-0.2, 0.2)
            b = cx(0.2, 0.02, 0.09, x=u, y=-0.355, z=z + 0.008, cor="terracota" if j else "terracota_clara", b=0.008, seg=1)
            gira(b, "Z", 90 * lado)
            it.add(b)
    it.add(cx(0.84, 0.84, 0.1, z=1.5, cor="concreto", b=0.02))
    it.add(cx(0.74, 0.74, 0.06, z=1.6, cor="concreto_escuro", b=0.015))
    for x in (-0.17, 0.17):
        it.add(mb.torno([(0, 1.66), (0.12, 1.66), (0.13, 1.7), (0.1, 1.75), (0.09, 1.95), (0.11, 1.98), (0.09, 2.0),
                         (0.07, 1.98), (0.07, 1.7), (0, 1.7)], x=x, cor="terracota", seg=16))
        it.add(cil(0.069, 0.01, x=x, z=1.9, cor="preto", seg=14, b=0.0))
    it.colisao([((0, 0, 0), (0.86, 0.86, 2.0))])


@peca("casa_maquinas", "Casa de máquinas de telhado", "casa_maquinas", ["telhado", "predio", "interativo", "luz"])
def _(it):
    L, Pp, A = 3.0, 2.4, 2.6
    yf = -Pp / 2
    it.add(cx(L, Pp, A, cor="concreto", b=0.03))
    it.add(cx(L + 0.3, Pp + 0.3, 0.15, z=A, cor="concreto_escuro", b=0.04))
    it.add(cx(L + 0.02, Pp + 0.02, 0.12, z=0, cor="concreto_escuro", b=0.01))
    xd0, xd1, zd = -0.45, 0.45, 2.15
    e = 0.1
    for xa, xb, za, zb in ((-L / 2, xd0, 0, A), (xd1, L / 2, 0, A), (xd0, xd1, zd, A)):
        it.add(cx(xb - xa, e, zb - za, x=(xa + xb) / 2, y=yf - e / 2 + 0.005, z=za, cor="concreto", b=0.012))
    it.add(cx(xd1 - xd0, 0.01, zd, x=0, y=yf - 0.002, z=0, cor="preto", b=0.0))
    it.add(cx(1.3, 0.4, 0.12, y=yf - 0.25, cor="concreto_escuro", b=0.02))
    porta = [cx(0.88, 0.05, 2.1, x=0, y=yf - 0.07, z=0.03, cor="cinza_azulado", b=0.012)]
    for k in range(6):
        porta.append(cx(0.6, 0.012, 0.03, y=yf - 0.1, z=0.2 + 0.06 * k, cor="metal_escuro", b=0.004, seg=1))
    porta.append(placa(est("placa_maquinas"), 0.36, 0.18, x=0, y=yf - 0.097, z=1.5))
    porta.append(tb([(0.32, yf - 0.095, 1.05), (0.32, yf - 0.14, 1.05), (0.22, yf - 0.14, 1.05)], 0.012, cor="metal_claro",
                    seg=6, rc=0.02))
    it.porta(porta, (xd0 + 0.01, yf - 0.07, 0.03), eixo="z", lado="esq", nome="porta")
    it.add(cx(0.3, 0.14, 0.12, y=yf - 0.07 - e, z=zd + 0.18, cor="grafite", b=0.02))
    it.add(cx(0.24, 0.02, 0.05, y=yf - 0.14 - e, z=zd + 0.19, cor=None, mat="luz", b=0.006))
    # veneziana na lateral, exaustor no teto e escada de marinheiro
    it.add(cx(0.04, 1.0, 0.7, x=L / 2 + 0.01, z=1.4, cor="metal_escuro", b=0.01))
    for k in range(7):
        it.add(cx(0.06, 0.94, 0.03, x=L / 2 + 0.025, z=1.45 + 0.09 * k, cor="cinza_claro", b=0.006, seg=1))
    it.add(cx(0.6, 0.6, 0.35, x=0.7, y=0.3, z=A + 0.15, cor="metal", b=0.03))
    it.add(cx(0.66, 0.66, 0.05, x=0.7, y=0.3, z=A + 0.5, cor="metal_claro", b=0.015))
    for y in (0.55, 0.95):
        it.add(tb([(-L / 2 - 0.15, y, 0.0), (-L / 2 - 0.15, y, A + 0.9)], 0.02, cor="metal", seg=6))
    for k in range(1, 12):
        it.add(tb([(-L / 2 - 0.15, 0.55, 0.28 * k), (-L / 2 - 0.15, 0.95, 0.28 * k)], 0.012, cor="metal", seg=6))
    it.colisao([((0, 0, 0), (L, Pp, A + 0.15))])


# ======================================================================================================================
# Fachada
# ======================================================================================================================
@peca("toldo_janela", "Toldo avulso de janela (listrado)", "toldo_janela", ["fachada", "toldo", "janela"],
      fixacao="parede", alt=1.9)
def _(it):
    L, prof, z_alto, queda = 1.4, 0.75, 0.62, 0.45
    it.add(cx(L + 0.06, 0.05, 0.06, y=-0.025, z=z_alto - 0.03, cor="metal_escuro", b=0.012))
    it.add(toldo_listrado(L, prof, z_alto, queda, y0=-0.01, cores=("vermelho", "branco"), n=7))
    for s in (-1, 1):
        lado = mb.extrudado([(-0.02, z_alto), (-prof + 0.01, z_alto - queda + 0.01), (-0.02, z_alto - queda + 0.01)],
                            0.012, x=s * (L / 2 + 0.003) - 0.006, plano="yz", cor="vermelho", bisel=0.0, liso=False)
        it.add(lado)
        it.add(tb([(s * (L / 2 - 0.05), -0.02, 0.12), (s * (L / 2 - 0.05), -prof + 0.05, z_alto - queda + 0.03)], 0.011,
                  cor="metal_escuro", seg=6))
        it.add(cx(0.05, 0.03, 0.08, x=s * (L / 2 - 0.05), y=-0.015, z=0.08, cor="metal_escuro", b=0.008))


@peca("varal_roupas", "Varal de roupas de laje (roupas balançam)", "varal_roupas", ["telhado", "varal", "casa", "animado"])
def _(it):
    X, zl = 1.3, 1.72
    for x in (-X, X):
        it.add(cx(0.3, 0.3, 0.12, x=x, cor="concreto", b=0.03))
        it.add(cil(0.032, 1.78, x=x, z=0.12, cor="metal_claro", seg=10))
        it.add(tb([(x, -0.32, zl + 0.05), (x, 0.32, zl + 0.05)], 0.022, cor="metal_claro", seg=8))
    linhas = (-0.25, 0.0, 0.25)
    for y in linhas:
        it.add(tb([(-X, y, zl), (0, y, zl - 0.05), (X, y, zl)], 0.004, cor="branco", seg=4, rc=0.5))
    def prendedor(x, y, z):
        return cx(0.018, 0.025, 0.06, x=x, y=y, z=z - 0.04, cor="madeira_clara", b=0.004, seg=1)

    def peca_roupa(pts, x, y, z, cor, faixa=None):
        o = [mb.extrudado(mb._ccw([(x + px, z + pz) for px, pz in pts]), 0.012, y=y - 0.006, plano="xz", cor=cor,
                          bisel=0.004, seg=1)]
        if faixa:
            z0, z1, c2 = faixa
            xs = [p[0] for p in pts]
            o.append(cx(max(xs) - min(xs) - 0.005, 0.016, z1 - z0, x=x + (min(xs) + max(xs)) / 2, y=y, z=z + z0,
                        cor=c2, b=0.002, seg=1))
        return o

    def zl_(x):
        return zl - 0.05 * (1 - abs(x) / X) - 0.004
    camisa = [(-0.12, 0), (-0.26, -0.06), (-0.22, -0.16), (-0.13, -0.12), (-0.12, -0.5), (0.12, -0.5), (0.13, -0.12),
              (0.22, -0.16), (0.26, -0.06), (0.12, 0)]
    calca = [(-0.16, 0), (0.16, 0), (0.17, -0.72), (0.04, -0.72), (0.0, -0.18), (-0.04, -0.72), (-0.17, -0.72)]
    vestido = [(-0.09, 0), (-0.06, -0.06), (-0.12, -0.2), (-0.24, -0.62), (0.24, -0.62), (0.12, -0.2), (0.06, -0.06),
               (0.09, 0)]
    toalha = [(-0.25, 0), (0.25, 0), (0.25, -0.6), (-0.25, -0.6)]
    meia = [(-0.04, 0), (0.04, 0), (0.04, -0.18), (0.1, -0.22), (0.1, -0.27), (-0.04, -0.27)]
    lencol = [(-0.45, 0), (0.45, 0), (0.45, -0.85), (-0.45, -0.85)]
    fronha = [(-0.2, 0), (0.2, 0), (0.2, -0.32), (-0.2, -0.32)]
    roupas = {
        -0.25: [(camisa, -0.75, "azul", None), (toalha, -0.1, "amarelo", (-0.5, -0.43, "laranja")),
                (meia, 0.4, "vermelho", (-0.06, -0.02, "branco")), (meia, 0.58, "branco", (-0.06, -0.02, "vermelho")),
                (camisa, 0.95, "verde", None)],
        0.0: [(calca, -0.8, "azul_escuro", None), (vestido, -0.2, "rosa", (-0.4, -0.34, "branco")),
              (camisa, 0.45, "laranja", (-0.3, -0.24, "branco"))],
        0.25: [(lencol, -0.55, "branco", (-0.2, -0.14, "azul_claro")), (fronha, 0.35, "lilas", None),
               (toalha, 0.9, "turquesa", (-0.5, -0.43, "branco"))],
    }
    for i, y in enumerate(linhas):
        grupo = []
        for pts, x, cor, faixa in roupas[y]:
            z = zl_(x)
            grupo += peca_roupa(pts, x, y, z, cor, faixa)
            xs = [p[0] for p in pts]
            for px in (min(xs) + 0.03, max(xs) - 0.03):
                grupo.append(prendedor(x + px, y, z + 0.02))
        it.anima(grupo, {"anima": "balancar", "angulo": 7, "periodo": 2.2 + 0.35 * i, "eixo": "x"}, f"roupas_{i + 1}",
                 pivo=(0, y, zl))
    it.colisao([((-X, 0, 0), (0.3, 0.7, 1.8)), ((X, 0, 0), (0.3, 0.7, 1.8))])


@peca("escada_incendio_modulo", "Escada de incêndio de fachada (módulo de andar)", "escada_incendio",
      ["fachada", "escada", "modular", "predio"], fixacao="parede", alt=3.6, extra={"passo_z": 3.2})
def _(it):
    W, D, zp, H = 3.0, 1.1, 0.6, 3.2
    cor = "grafite_escuro"
    hx0, hx1, hy0 = -0.6, 1.05, -0.5  # vão da escada que vem de baixo (faixa de fora)
    it.add(cx(W, 0.06, 0.1, y=-D + 0.03, z=zp - 0.1, cor=cor, b=0.01))
    it.add(cx(W, 0.06, 0.1, y=-0.03, z=zp - 0.1, cor=cor, b=0.01))
    for x in (-W / 2 + 0.03, W / 2 - 0.03):
        it.add(cx(0.06, D, 0.1, x=x, y=-D / 2, z=zp - 0.1, cor=cor, b=0.01))
    for x in (hx0, hx1):
        it.add(cx(0.05, hy0 + D, 0.08, x=x, y=(hy0 - D) / 2, z=zp - 0.08, cor=cor, b=0.008))
    it.add(cx(hx1 - hx0, 0.05, 0.08, x=(hx0 + hx1) / 2, y=hy0, z=zp - 0.08, cor=cor, b=0.008))
    for k in range(8):
        y = -0.1 - 0.125 * k
        if y > hy0:
            it.add(cx(W - 0.1, 0.07, 0.025, y=y, z=zp - 0.025, cor="ferro", b=0.004, seg=1))
        else:
            for xa, xb in ((-W / 2 + 0.05, hx0 - 0.02), (hx1 + 0.02, W / 2 - 0.05)):
                it.add(cx(xb - xa, 0.07, 0.025, x=(xa + xb) / 2, y=y, z=zp - 0.025, cor="ferro", b=0.004, seg=1))
    for x in (-1.1, 1.1):  # mãos-francesas
        it.add(tb([(x, -0.02, 0.02), (x, -D + 0.1, zp - 0.1)], 0.025, cor=cor, seg=6))
        it.add(cx(0.12, 0.03, 0.14, x=x, y=-0.015, z=0.0, cor=cor, b=0.01))
    # guarda-corpo
    zr = zp + 1.0
    yo = -D + 0.03
    it.add(tb([(-W / 2 + 0.03, -0.03, zr), (-W / 2 + 0.03, yo, zr), (W / 2 - 0.03, yo, zr), (W / 2 - 0.03, -0.03, zr)],
              0.022, cor=cor, seg=8, rc=0.05))
    it.add(tb([(-W / 2 + 0.03, -0.03, zp + 0.5), (-W / 2 + 0.03, yo, zp + 0.5), (W / 2 - 0.03, yo, zp + 0.5),
               (W / 2 - 0.03, -0.03, zp + 0.5)], 0.015, cor=cor, seg=6, rc=0.05))
    for k in range(13):
        x = -W / 2 + 0.03 + (W - 0.06) * k / 12
        it.add(cil(0.012, 1.0, x=x, y=yo, z=zp, cor=cor, seg=6, b=0.0))
    for s in (-1, 1):
        for y in (-0.4, -0.75):
            it.add(cil(0.012, 1.0, x=s * (W / 2 - 0.03), y=y, z=zp, cor=cor, seg=6, b=0.0))
    # escada de marinheiro inclinada: sobe para −X, do patamar até o vão do módulo de cima
    xb_, xt_ = hx1 + 0.1, hx0 + 0.02
    zb_, zt_ = zp, zp + H
    for y in (-0.98, -0.56):
        it.add(tb([(xb_, y, zb_), (xt_, y, zt_)], 0.025, cor=cor, seg=6))
        it.add(tb([(xb_ + 0.05, y, zb_ + 0.9), (xt_ + 0.05, y, zt_ + 0.9)], 0.016, cor=cor, seg=6))
        it.add(tb([(xb_ + 0.05, y, zb_ + 0.9), (xb_ + 0.05, y, zb_ + 0.02)], 0.016, cor=cor, seg=6))
    n = 12
    for k in range(1, n):
        u = k / n
        x, z = xb_ + (xt_ - xb_) * u, zb_ + (zt_ - zb_) * u
        it.add(cx(0.12, 0.44, 0.025, x=x, y=-0.77, z=z - 0.0125, cor="ferro", b=0.004, seg=1))
    it.colisao([((0, -D / 2, zp - 0.1), (W, D, 0.1)), ((0, -D + 0.03, zp), (W, 0.06, 1.0))])


@peca("luminaria_fachada", "Luminária de fachada (lanterna, acende à noite)", "luminaria_fachada",
      ["fachada", "luz", "luminaria"], fixacao="parede", alt=2.0)
def _(it):
    it.add(cx(0.15, 0.03, 0.26, y=-0.015, z=0.28, cor="grafite_escuro", b=0.01))
    it.add(tb([(0, -0.03, 0.44), (0, -0.2, 0.5), (0, -0.3, 0.47), (0, -0.3, 0.4)], 0.014, cor="grafite_escuro", seg=8,
              rc=0.05))
    it.add(tb([(0, -0.03, 0.33), (0, -0.12, 0.36), (0, -0.2, 0.49)], 0.01, cor="grafite_escuro", seg=6, rc=0.04))
    yc = -0.3
    it.add(mb.torno([(0, 0.32), (0.11, 0.32), (0.12, 0.34), (0.03, 0.4), (0.0, 0.41)], y=yc, cor="grafite_escuro", seg=4,
                    angulo=30))
    gira(it.partes[-1], "Z", 45, (0, yc, 0))
    it.add(cx(0.17, 0.17, 0.03, y=yc, z=0.04, cor="grafite_escuro", b=0.008))
    it.add(mb.torno([(0, 0.0), (0.05, 0.0), (0.06, 0.04), (0, 0.04)], y=yc, cor="grafite_escuro", seg=4))
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.add(cx(0.016, 0.016, 0.26, x=sx * 0.07, y=yc + sy * 0.07, z=0.06, cor="grafite_escuro", b=0.003, seg=1))
    it.add(cx(0.13, 0.13, 0.25, y=yc, z=0.065, cor=None, mat="vidro", b=0.0))
    it.add(mb.esfera(0.045, y=yc, z=0.17, cor=None, mat="luz", esc=(1, 1, 1.4), seg=14))
    it.add(cil(0.025, 0.04, y=yc, z=0.07, cor="latao", seg=10))


@peca("camera_seguranca", "Câmera de segurança (vira de um lado para o outro)", "camera_seguranca",
      ["fachada", "seguranca", "animado"], fixacao="parede", alt=2.8)
def _(it):
    it.add(cil(0.065, 0.03, y=-0.015, z=0.12, cor="branco", seg=18, b=0.008, eixo="y"))
    it.add(tb([(0, -0.03, 0.12), (0, -0.12, 0.12)], 0.02, cor="branco", seg=8))
    piv = (0, -0.12, 0.12)
    cam = [mb.esfera(0.03, x=0, y=-0.12, z=0.12, cor="branco_gelo", seg=12),
           tb([(0, -0.12, 0.12), (0, -0.14, 0.18)], 0.016, cor="branco", seg=6)]
    corpo = [cil(0.055, 0.24, y=0, cor="branco_gelo", seg=18, b=0.012, eixo="y"),
             cx(0.14, 0.27, 0.012, y=-0.02, z=0.06, cor="branco", b=0.004),
             cil(0.042, 0.012, y=-0.121, cor="preto", seg=16, b=0.002, eixo="y"),
             cil(0.022, 0.006, y=-0.128, cor=None, seg=14, b=0.0, eixo="y", mat="vidro"),
             mb.esfera(0.007, x=0.03, y=-0.126, z=0.025, cor=None, mat="luz_vermelha", seg=8)]
    for o in corpo:
        mb.transforma(o, rot=("X", -15))
        mb.transforma(o, loc=(0, -0.24, 0.2))
    it.anima(cam + corpo, {"anima": "balancar", "angulo": 35, "periodo": 8, "eixo": "y"}, "camera", pivo=piv)
    it.colisao([((0, -0.18, 0.05), (0.15, 0.36, 0.22))])


@peca("interfone_campainha", "Interfone com campainha", "interfone", ["fachada", "interfone", "casa", "predio", "luz"],
      fixacao="parede", alt=1.15)
def _(it):
    it.add(cx(0.17, 0.025, 0.32, y=-0.0125, cor="metal_claro", b=0.01))
    hood = cx(0.19, 0.07, 0.014, y=-0.035, z=0.0, cor="metal", b=0.004)
    gira(hood, "X", -12, (0, 0, 0))
    move(hood, (0, 0, 0.325))
    it.add(hood)
    yf = -0.025
    it.add(cil(0.018, 0.008, y=yf - 0.004, z=0.27, cor="preto", seg=14, b=0.002, eixo="y"))
    it.add(cil(0.009, 0.004, y=yf - 0.009, z=0.27, cor=None, seg=10, b=0.0, eixo="y", mat="vidro"))
    for i in range(4):
        for j in range(3):
            it.add(cil(0.0045, 0.004, x=-0.03 + 0.02 * i, y=yf - 0.002, z=0.2 + 0.018 * j, cor="preto", seg=6, b=0.0,
                       eixo="y"))
    for k in range(3):
        z = 0.15 - 0.042 * k
        it.add(cx(0.08, 0.004, 0.026, x=-0.025, y=yf - 0.002, z=z - 0.013, cor="papel", b=0.0, seg=1))
        it.add(cil(0.012, 0.01, x=0.045, y=yf - 0.005, z=z, cor="metal", seg=12, b=0.003, eixo="y"))
    it.add(anel(0.019, 0.004, x=0.0, y=yf - 0.004, z=0.035, cor=None, seg=16, seg_r=4, eixo="y"))
    mb.pinta(it.partes[-1], None, mat="luz")
    it.add(cil(0.016, 0.012, x=0.0, y=yf - 0.006, z=0.035, cor="branco", seg=14, b=0.004, eixo="y"))


@peca("caixa_correio_parede", "Caixa de correio de parede", "caixa_correio_parede", ["fachada", "correio", "casa",
                                                                                    "interativo"],
      fixacao="parede", alt=1.0)
def _(it):
    L, Pp, A = 0.32, 0.14, 0.42
    it.add(mb.carcaca(L, Pp, A, y=-Pp / 2, esp=0.012, cor="azul_medio", bisel=0.004))
    it.add(cx(L + 0.03, Pp + 0.03, 0.03, y=-Pp / 2 - 0.005, z=A, cor="azul_escuro", b=0.012))
    zt = 0.24
    it.add(cx(L, 0.014, A - zt, y=-Pp + 0.007, z=zt, cor="azul_medio", b=0.004))
    it.add(placa(est("faixa_cartas"), 0.26, 0.081, y=-Pp - 0.001, z=zt + 0.03))
    it.add(cx(0.18, 0.012, 0.025, y=-Pp - 0.003, z=A - 0.06, cor="preto", b=0.004))
    it.add(cx(0.2, 0.03, 0.012, y=-Pp - 0.012, z=A - 0.03, cor="azul_escuro", b=0.004))
    porta = [cx(L - 0.01, 0.016, zt - 0.02, y=-Pp + 0.004, z=0.01, cor="azul_medio", b=0.005),
             cil(0.014, 0.012, y=-Pp - 0.008, z=zt - 0.06, cor="latao", seg=12, b=0.003, eixo="y")]
    it.porta(porta, (0, -Pp - 0.004, 0.01), eixo="x", lado="baixo", abre_graus=95, nome="tampa")
    it.slot("cartas", (0, -Pp / 2, 0.014), (L - 0.03, Pp - 0.03, A - 0.05))


# ======================================================================================================================
# Ciclovia e calçadão (peças de quadra de 15 m, no nível da calçada)
# ======================================================================================================================
Q, H = 15.0, 7.5
LARG_CICLO = 1.3  # meia largura da ciclovia (2,6 m, mão dupla)
QUADRA = {"quadras": [1, 1]}


def poli(pts, z=0.0, cor="branco", alt=0.004):
    """Pintura plana (uma face) alt acima de z, com o contorno dado."""
    pts = mb._ccw([tuple(p) for p in pts])
    bm = bmesh.new()
    vs = [bm.verts.new((p[0], p[1], z + alt)) for p in pts]
    f = bm.faces.new(vs)
    if len(vs) > 4:
        bmesh.ops.triangulate(bm, faces=[f], quad_method="BEAUTY", ngon_method="BEAUTY")
    ob = mb._obj("tinta", bm, cor, liso=False)
    if ob.data.polygons and sum(p.normal.z for p in ob.data.polygons) < 0:
        ob.data.flip_normals()
    return ob


def banda_arco(cx_, cy_, r0, r1, a0, a1, n=40, cor="laranja_escuro", alt=0.003):
    """Faixa curva (anel entre r0 e r1, de a0 a a1 graus) feita de quads: plana, alt acima de z = 0."""
    bm = bmesh.new()
    pares = []
    for k in range(n + 1):
        a = math.radians(a0 + (a1 - a0) * k / n)
        c, s_ = math.cos(a), math.sin(a)
        pares.append((bm.verts.new((cx_ + r0 * c, cy_ + r0 * s_, alt)), bm.verts.new((cx_ + r1 * c, cy_ + r1 * s_, alt))))
    for (a, b), (c, d) in zip(pares, pares[1:]):
        bm.faces.new((a, b, d, c))
    ob = mb._obj("tinta", bm, cor, liso=False)
    for p in ob.data.polygons:
        if p.normal.z < 0:
            ob.data.flip_normals()
            break
    return ob


def ret(x0, y0, x1, y1):
    return [(min(x0, x1), min(y0, y1)), (max(x0, x1), min(y0, y1)), (max(x0, x1), max(y0, y1)), (min(x0, x1), max(y0, y1))]


def decal_chao(mat, xc, yc, w, h, ang=0.0, z=0.0045, uv=(0, 0, 1, 1)):
    """Quadro com estampa deitado no chão; o "alto" da imagem aponta para o ângulo ang (graus, 0 = +Y)."""
    bm = bmesh.new()
    a = math.radians(ang)
    up = V((-math.sin(a), math.cos(a), 0))
    rt = V((math.cos(a), math.sin(a), 0))
    c = V((xc, yc, z))
    cantos = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
    vs = [bm.verts.new(c + rt * (u * w / 2) + up * (v * h / 2)) for u, v in cantos]
    f = bm.faces.new(vs)
    uvl = bm.loops.layers.uv.new("UVMap")
    for lo, (u, v) in zip(f.loops, cantos):
        lo[uvl].uv = (uv[0] + (uv[2] - uv[0]) * (u + 1) / 2, uv[1] + (uv[3] - uv[1]) * (v + 1) / 2)
    ob = mb._obj("decal", bm, None, mat=mat, liso=False)
    if ob.data.polygons[0].normal.z < 0:
        ob.data.flip_normals()
    return ob


def calcada_base(it):
    """Calçada lisa igual à da categoria pisos (laje até −0,40 e juntas a cada 1,5 m, meia junta na borda)."""
    import cidade_base as cb
    it.add(cb.laje(ret(-H, -H, H, H), 0.0, "calcada", nome="calcada"))
    for k in range(1, 10):
        c = -H + k * 1.5
        it.add(poli(ret(c - 0.018, -H, c + 0.018, H), cor="concreto", alt=0.002))
        it.add(poli(ret(-H, c - 0.018, H, c + 0.018), cor="concreto", alt=0.0025))
    for c in (-H + 0.02, H - 0.02):
        it.add(poli(ret(c - 0.018, -H, c + 0.018, H), cor="concreto", alt=0.002))
        it.add(poli(ret(-H, c - 0.018, H, c + 0.018), cor="concreto", alt=0.0025))
    it.colisao([((0, 0, -0.4), (Q, Q, 0.4))])


def ciclo_reta_y(it, y0=-H, y1=H, tracejado=True, simbolos=True, cortes=(), cor="laranja_escuro", simbolo="ciclovia_simbolo"):
    """Trecho reto de ciclovia em Y (x centrado em 0) entre y0 e y1. cortes: intervalos de y sem tracejado."""
    import cidade_base as cb
    a = LARG_CICLO
    it.add(poli(ret(-a, y0, a, y1), cor=cor, alt=0.003))
    for s in (-1, 1):
        it.add(poli(ret(s * (a - 0.12), y0, s * a, y1), cor="branco", alt=0.0042))
    if tracejado:
        f = cb.faixa([(0, y0), (0, y1)], larg=0.1, cor="branco", tracejada=(1.0, 1.5), fase=y0 - 0.5, z=0.0002)
        if f:
            it.add(f)
    if simbolos:
        for s, yy, ang in ((1, -3.75, 0), (-1, 3.75, 180)):
            if y0 + 1 < yy < y1 - 1 and not any(c0 - 1.2 < yy < c1 + 1.2 for c0, c1 in cortes):
                it.add(decal_chao(est(simbolo), s * a / 2, yy, 0.8, 1.6, ang))


@peca("ciclovia_reta", "Ciclovia reta na calçada (15 m)", "ciclovia", ["ciclovia", "calcada", "modular", "piso"],
      mini=MINI_TOPO, extra=QUADRA)
def _(it):
    calcada_base(it)
    ciclo_reta_y(it)


@peca("ciclovia_reta_verde", "Ciclovia verde reta (bairro futurista, 15 m)", "ciclovia_verde",
      ["ciclovia", "calcada", "modular", "piso", "futurista"], mini=MINI_TOPO, extra=QUADRA)
def _(it):
    calcada_base(it)
    ciclo_reta_y(it, cor="verde", simbolo="ciclovia_simbolo_verde")


@peca("ciclovia_curva", "Ciclovia em curva na calçada (15 m)", "ciclovia", ["ciclovia", "calcada", "modular", "piso"],
      mini=MINI_TOPO, extra=QUADRA)
def _(it):
    import cidade_base as cb
    calcada_base(it)
    a, n = LARG_CICLO, 40
    cxx, cyy = H, -H  # centro da curva no canto: entra pelo sul (x = 0) e sai pelo leste (y = 0)
    it.add(banda_arco(cxx, cyy, H - a, H + a, 90, 180, n, "laranja_escuro", 0.003))
    for r0, r1 in ((H + a - 0.12, H + a), (H - a, H - a + 0.12)):
        it.add(banda_arco(cxx, cyy, r0, r1, 90, 180, n, "branco", 0.0042))
    f = cb.faixa(cb.arco(cxx, cyy, H, 180, 90, n * 2), larg=0.1, cor="branco", tracejada=(1.0, 1.5), fase=-H - 0.5,
                 z=0.0002)
    if f:
        it.add(f)
    # metade de dentro anda do sul para o leste, a de fora volta (como na reta: cada um pela sua direita)
    for ang, r, rot_ in ((150, H - a / 2, -30), (120, H + a / 2, 120)):
        x, y = cxx + r * math.cos(math.radians(ang)), cyy + r * math.sin(math.radians(ang))
        it.add(decal_chao(est("ciclovia_simbolo"), x, y, 0.8, 1.6, rot_))


@peca("ciclovia_cruzamento", "Cruzamento de ciclovias (15 m)", "ciclovia", ["ciclovia", "calcada", "modular", "piso"],
      mini=MINI_TOPO, extra=QUADRA)
def _(it):
    calcada_base(it)
    a = LARG_CICLO
    it.add(poli(ret(-a, -H, a, H), cor="laranja_escuro", alt=0.003))
    it.add(poli(ret(-H, -a, H, a), cor="laranja_escuro", alt=0.0031))
    for s in (-1, 1):
        for y0, y1 in ((-H, -a), (a, H)):
            it.add(poli(ret(s * (a - 0.12), y0, s * a, y1), cor="branco", alt=0.0042))
            it.add(poli(ret(y0, s * (a - 0.12), y1, s * a), cor="branco", alt=0.0042))
    import cidade_base as cb
    for y0, y1 in ((-H, -a - 0.6), (a + 0.6, H)):
        for f in (cb.faixa([(0, y0), (0, y1)], larg=0.1, tracejada=(1.0, 1.5), fase=y0 - 0.5, z=0.0002),
                  cb.faixa([(y0, 0), (y1, 0)], larg=0.1, tracejada=(1.0, 1.5), fase=y0 - 0.5, z=0.0002)):
            if f:
                it.add(f)
    for k in range(4):  # "dentes" de dê a preferência na chegada de cada braço e símbolos nos braços
        g = 90 * k
        for j in range(5):
            t = poli([(-a + 0.15 + 0.48 * j, -a - 0.35), (-a + 0.55 + 0.48 * j, -a - 0.35), (-a + 0.35 + 0.48 * j, -a - 0.08)],
                     cor="branco", alt=0.0044)
            gira(t, "Z", g)
            it.add(t)
        d = decal_chao(est("ciclovia_simbolo"), a / 2, -4.6, 0.8, 1.6, 0)
        gira(d, "Z", g)
        it.add(d)


@peca("ciclovia_faixa_pedestres", "Ciclovia com faixa de pedestres (15 m)", "ciclovia", ["ciclovia", "calcada", "modular",
                                                                                       "piso", "faixa_pedestres"],
      mini=MINI_TOPO, extra=QUADRA)
def _(it):
    calcada_base(it)
    ciclo_reta_y(it, -H, -1.9)
    ciclo_reta_y(it, 1.9, H)
    a = LARG_CICLO
    it.add(poli(ret(-a, -1.9, a, 1.9), cor="laranja_escuro", alt=0.003))
    for s in (-1, 1):
        it.add(poli(ret(s * (a - 0.12), -1.9, s * a, 1.9), cor="branco", alt=0.0042))
    for k in range(6):  # listras da zebra (paralelas à ciclovia): quem anda atravessa em X
        x = -a + 0.25 + 0.43 * k
        it.add(poli(ret(x - 0.16, -1.5, x + 0.16, 1.5), cor="branco", alt=0.0044))
    for s in (-1, 1):
        it.add(poli(ret(-a, s * 1.62, a, s * 1.74), cor="branco", alt=0.0044))


@peca("laje_calcadao", "Laje do calçadão de ladrilho (15 m)", "calcadao", ["calcadao", "calcada", "modular", "piso", "orla"],
      mini=MINI_TOPO, extra=QUADRA)
def _(it):
    import cidade_base as cb
    it.add(cb.laje(ret(-H, -H, H, H), 0.0, "bege_escuro", z_fundo=-1.9, nome="calcadao"))  # elevado: a borda desce até
    # o fundo da água aberta (−1,9), como um muro de arrimo de pedra quando a quadra vizinha é mar ou areia
    bm = bmesh.new()
    n = 5  # ladrilho repete a cada 3 m
    vs = {}
    for i in range(n + 1):
        for j in range(n + 1):
            vs[i, j] = bm.verts.new((-H + Q * i / n, -H + Q * j / n, 0.002))
    uvl = bm.loops.layers.uv.new("UVMap")
    for i in range(n):
        for j in range(n):
            f = bm.faces.new((vs[i, j], vs[i + 1, j], vs[i + 1, j + 1], vs[i, j + 1]))
            for lo, (u, v) in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
                lo[uvl].uv = (u, v)
    ob = mb._obj("ladrilho", bm, None, mat=est("ladrilho_calcadao"), liso=False)
    it.add(ob)
    it.colisao([((0, 0, -0.4), (Q, Q, 0.4))])


# ---------------------------------------------------------------------------------------------------- balaustrada
PEDRA, PEDRA2, PEDRA3 = "creme_claro", "creme", "bege"
BAL_PERFIL = [(0, 0), (0.06, 0), (0.042, 0.07), (0.04, 0.11), (0.072, 0.3), (0.06, 0.42), (0.031, 0.52), (0.05, 0.59),
              (0.06, 0.63), (0, 0.63)]


def pilar(x, y=0.0, l=0.42, topo="capitel"):
    o = [cx(l + 0.08, l + 0.08, 0.16, x=x, y=y, cor=PEDRA3, b=0.025),
         cx(l, l, 0.84, x=x, y=y, z=0.14, cor=PEDRA, b=0.02),
         cx(l + 0.02, l + 0.02, 0.04, x=x, y=y, z=0.82, cor=PEDRA2, b=0.01),
         cx(l + 0.1, l + 0.1, 0.08, x=x, y=y, z=0.98, cor=PEDRA2, b=0.025),
         cx(l + 0.02, l + 0.02, 0.05, x=x, y=y, z=1.06, cor=PEDRA, b=0.015)]
    for s in (-1, 1):  # almofadas rebaixadas nas faces
        o.append(cx(l * 0.62, 0.012, 0.5, x=x, y=y + s * (l / 2 + 0.002), z=0.26, cor=PEDRA2, b=0.004, seg=1))
    if topo == "bola":
        o.append(cx(0.22, 0.22, 0.06, x=x, y=y, z=1.11, cor=PEDRA2, b=0.015))
        o.append(mb.esfera(0.14, x=x, y=y, z=1.3, cor=PEDRA, seg=16))
    elif topo == "vaso":
        o.append(mb.torno([(0, 0), (0.12, 0), (0.12, 0.04), (0.06, 0.08), (0.08, 0.14), (0.19, 0.26), (0.21, 0.36),
                           (0.18, 0.38), (0.0, 0.38)], x=x, y=y, z=1.11, cor=PEDRA2, seg=20))
        o.append(mb.superelipsoide(0.4, 0.4, 0.36, x=x, y=y, z=1.42, cor="folha", e=0.8, e_v=0.7, nu=16, nv=8))
        for k in range(5):
            a_ = k * 1.25
            o.append(mb.esfera(0.035, x=x + 0.15 * math.cos(a_), y=y + 0.15 * math.sin(a_), z=1.68,
                               cor=("rosa", "vermelho", "rosa_bebe", "amarelo", "rosa")[k], seg=7))
    return o


def balaustrada(it, L, pilares, x_ini=None, x_fim=None):
    """Balaustrada de pedra clara ao longo de X, de −L/2 a L/2: base, balaústres torneados (seg 8), corrimão largo e
    pilares (posições x dos centros)."""
    x_ini = -L / 2 if x_ini is None else x_ini
    x_fim = L / 2 if x_fim is None else x_fim
    it.add(cx(x_fim - x_ini, 0.4, 0.18, x=(x_ini + x_fim) / 2, cor=PEDRA3, b=0.025))
    it.add(cx(x_fim - x_ini, 0.3, 0.05, x=(x_ini + x_fim) / 2, z=0.18, cor=PEDRA2, b=0.012))
    it.add(cx(x_fim - x_ini, 0.36, 0.12, x=(x_ini + x_fim) / 2, z=0.86, cor=PEDRA2, b=0.04, seg=3))
    it.add(cx(x_fim - x_ini, 0.26, 0.03, x=(x_ini + x_fim) / 2, z=0.84, cor=PEDRA, b=0.008))
    vaos = []
    bordas = sorted([x_ini] + [p - 0.21 for p in pilares] + [p + 0.21 for p in pilares] + [x_fim])
    for a, b in zip(bordas[::2], bordas[1::2]):
        if b - a > 0.2:
            vaos.append((a, b))
    bals = []
    for a, b in vaos:
        n = max(1, int(round((b - a) / 0.24)))
        for k in range(n):
            x = a + (b - a) * (k + 0.5) / n
            bals.append(mb.torno(BAL_PERFIL, x=x, z=0.23, cor=PEDRA, seg=8, angulo=40))
    if bals:
        it.add(mb.junta(bals, "balaustres"))
    for p in pilares:
        it.add(pilar(p))


@peca("balaustrada_3m", "Balaustrada de pedra clara (módulo de 3 m)", "balaustrada", ["calcadao", "balaustrada", "modular",
                                                                                     "orla", "guarda_corpo"],
      extra={"modulo": 3.0})
def _(it):
    balaustrada(it, 3.0, [-1.5 + 0.21])
    it.colisao([((0, 0, 0), (3.0, 0.42, 1.11))])


@peca("balaustrada_15m", "Balaustrada de pedra clara (módulo de 15 m)", "balaustrada", ["calcadao", "balaustrada", "modular",
                                                                                       "orla", "guarda_corpo"],
      extra={"modulo": 15.0})
def _(it):
    balaustrada(it, 15.0, [-7.5 + 0.21 + 3 * k for k in range(5)])
    it.colisao([((0, 0, 0), (15.0, 0.42, 1.11))])


@peca("balaustrada_canto", "Pilar de canto da balaustrada (com vaso)", "balaustrada", ["calcadao", "balaustrada", "orla"])
def _(it):
    it.add(pilar(0, l=0.5, topo="vaso"))
    it.colisao([((0, 0, 0), (0.6, 0.6, 1.11))])


@peca("balaustrada_terminal", "Pilar terminal da balaustrada (com bola)", "balaustrada", ["calcadao", "balaustrada", "orla"])
def _(it):
    it.add(pilar(0, topo="bola"))
    # voluta de arremate do lado de fora (+X): o módulo chega pelo −X e o terminal fecha a ponta aberta dele
    vol = []
    for k in range(10):
        a = math.radians(90 + 32 * k)
        r = 0.16 - 0.011 * k
        vol.append((0.21 + 0.16 + r * math.cos(a), 0, 0.62 + r * math.sin(a)))
    it.add(tb([(0.21, 0, 0.9)] + vol, 0.05, cor=PEDRA2, seg=10, rc=0.03))
    it.add(cx(0.25, 0.4, 0.18, x=0.33, cor=PEDRA3, b=0.025))
    it.colisao([((0.1, 0, 0), (0.7, 0.5, 1.11))])


@peca("lixeira_calcadao", "Lixeira cilíndrica de calçadão (ripas e pedra)", "lixeira_calcadao", ["lixeira", "calcadao",
                                                                                               "orla", "calcada"])
def _(it):
    it.add(mb.torno([(0, 0), (0.3, 0), (0.3, 0.06), (0.27, 0.09), (0.25, 0.14), (0, 0.14)], cor=PEDRA, seg=24))
    it.add(cil(0.235, 0.74, z=0.13, cor="grafite", seg=24, b=0.01))
    n = 16
    for k in range(n):
        r = cx(0.075, 0.03, 0.68, y=-0.25, z=0.17, cor="madeira_mel", b=0.01)
        gira(r, "Z", 360 * k / n)
        it.add(r)
    for z in (0.26, 0.76):
        it.add(anel(0.262, 0.012, z=z, cor="grafite", seg=24, seg_r=4))
    it.add(mb.torno([(0.2, 0.86), (0.3, 0.86), (0.31, 0.9), (0.28, 0.94), (0.2, 0.94)], cor=PEDRA2, seg=24))
    it.add(cil(0.2, 0.01, z=0.88, cor="preto", seg=24, b=0.0))
    it.colisao([((0, 0, 0), (0.6, 0.6, 0.94))])


@peca("banco_calcadao", "Banco de calçadão com pés de pedra e ripas", "banco_calcadao", ["banco", "calcadao", "orla",
                                                                                       "calcada"])
def _(it):
    perfil = [(-0.27, 0), (0.18, 0), (0.18, 0.06), (0.1, 0.1), (0.1, 0.4), (0.2, 0.42), (0.29, 0.86), (0.22, 0.88),
              (0.13, 0.5), (-0.27, 0.42), (-0.27, 0.3), (-0.18, 0.26), (-0.18, 0.06), (-0.27, 0.04)]
    for x in (-0.82, 0.82):
        it.add(mb.extrudado(mb._ccw(perfil), 0.14, x=x - 0.07, plano="yz", cor=PEDRA, bisel=0.025, seg=2))
    for k in range(5):
        y = -0.25 + 0.085 * k
        it.add(cx(1.95, 0.075, 0.04, y=y, z=0.42 + 0.004 * k, cor="madeira_mel", b=0.012))
    for k in range(3):
        u = 0.1 + 0.15 * k
        r = cx(1.95, 0.075, 0.04, z=-0.02, cor="madeira_mel", b=0.012)
        gira(r, "X", -90 + 22)
        move(r, (0, 0.14 + u * 0.4, 0.48 + u * 0.9))
        it.add(r)
    for x in (-0.58, 0.0, 0.58):
        it.assento(x, -0.08, 0.46)
    it.colisao([((0, -0.04, 0), (1.95, 0.5, 0.46)), ((0, 0.24, 0.46), (1.95, 0.14, 0.42))])


# ======================================================================================================================
# Execução
# ======================================================================================================================
def main():
    global EST_DIR
    argv = sys.argv[sys.argv.index("--") + 1:]
    saida, filtro = argv[0], argv[1:]
    EST_DIR = os.path.join(saida, CAT, "estampas")
    pre.desenha(EST_DIR)
    cat = mb.Catalogo(CAT, saida, rotulo="Props de rua, calçada e telhado")
    ids = [p[0] for p in P]
    assert len(ids) == len(set(ids)), "ids repetidos"
    for id_, rotulo, grupo, fixacao, alt, tags, mini, extra0, f in P:
        if filtro and id_ not in filtro and grupo not in filtro:
            continue
        mb.limpa()
        it = ItemP(id_)
        f(it)
        bpy.context.view_layer.update()
        plano = bool(extra0 and "quadras" in extra0)
        lo, _ = mb.bbox(it.partes + [o for o, _d in it.animados] + [o for o, _d in it.interativos])
        if lo.z < -1e-4 and not plano:  # nada abaixo do chão (as quadras descem até −0,40 de propósito)
            for o in it.partes:
                mb.transforma(o, loc=(0, 0, -lo.z))
            for o, _d in it.animados + it.interativos:
                o.location.z -= lo.z
            it.slots = [(n, (c[0], c[1], c[2] - lo.z), t, p) for n, c, t, p in it.slots]
            if it.colisores:
                it.colisores = [((c[0], c[1], c[2] - lo.z), t) for c, t in it.colisores]
            bpy.context.view_layer.update()
        extra = dict(extra0 or {})
        if it.animados:
            extra["animacoes"] = it.lista_animacoes()
        e = cat.exporta(it, rotulo, grupo=grupo, fixacao=fixacao, altura_instalacao=alt,
                        tags=["props_rua"] + tags, miniatura_dir=mini or (0.55, -1.0, 0.5), extra=extra or None)
        if it.animados:
            e["animacoes"] = it.lista_animacoes()
        cat.salva()
    validos = set(ids)
    cat.dados["itens"] = [x for x in cat.dados["itens"] if x["id"] in validos]
    cat.dados["itens"].sort(key=lambda x: ids.index(x["id"]))
    cat.salva()
    print("pecas", len(cat.dados["itens"]), flush=True)


if __name__ == "__main__":
    main()
