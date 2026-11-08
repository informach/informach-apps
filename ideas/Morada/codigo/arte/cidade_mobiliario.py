"""Cidade do Morada: mobiliário urbano do parque e da cidade — categoria "mobiliario_urbano".

Uso (ver GUIA_CIDADE.md e GUIA_PARQUE.md):
  MOVEIS_THREADS=1 CIDADE_PACOTE_FBX=... CIDADE_PACOTE_TEX=... CIDADE_PACOTE_TEXTURAS=... \
    blender-venv/bin/python -I morada-art/cidade_mobiliario.py -- SP/cidade_out [ids|grupos...]

Convenções:
- metros, Z para cima, frente para −Y, origem no chão, no meio da peça (fixacao "chao").
- Lâmpadas de postes, luminárias, refletores e o mostrador do relógio com `luz` (fracas de dia, acesas à noite).
  Semáforos com as três luzes acesas: vermelho `luz_vermelha`, amarelo `luz`, verde `neon`.
- As placas (trânsito, ponto de ônibus, reciclagem, correio) são estampas desenhadas aqui com PIL, gravadas em
  <saida>/mobiliario_urbano/estampas/. Só o painel e a placa do ponto de ônibus brilham à noite (emissão).
- Assentos: Item.slot "assento_1", "assento_2"... de 0,5 × 0,5 × 0,9 m, com o centro na superfície do assento.
- Animadas: o nó filho leva os extras glTF e a mesma lista vai em extra["animacoes"]:
    semáforo do pacote: a luz amarela dos carros pisca ({"anima": "piscar", "periodo": 1.0}) e a vermelha do pedestre
    também ({"anima": "piscar", "periodo": 0.8}); relógio: o ponteiro de segundos gira ({"anima": "girar",
    "eixo": "z", "velocidade": ∓6}, um em cada face).
- Colisão: postes, placas, semáforos, relógio e orelhão só na haste (caixa fina); bancos no assento e no encosto;
  o resto numa caixa do volume.
- Peças do pacote Cartoon City (Trash_02..06, Trash_Can_04..08, Spotlight_01/02, Bus_Stop_02,
  traffic_light_001..003) entram com pacote=True e o id terminando em _pacote. Do pacote Apocalypse (pasta
  SP/ideias/Apocalypse, ou CIDADE_APO): Barbecue_Grill (tambor repintado de vermelho, com grelha e brasas nossas),
  Concrete_Fence (na verdade uma barricada de sucata), Road_Barrier_01 (defensa metálica) e Signs_Shield (com a placa
  AEROPORTO redesenhada no lugar do UV da placa em inglês). importa_apo é o importador desse pacote (a vegetação usa
  para o Pine_01).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import moveis_base as mb  # noqa: E402
import cidade_base as cb  # noqa: E402

V = Vector
CAT = "mobiliario_urbano"
EST_DIR = ""
ASSENTO = (0.5, 0.5, 0.9)
F_BLACK = "/usr/share/fonts/opentype/inter/Inter-Black.otf"
F_BOLD = "/usr/share/fonts/opentype/inter/Inter-Bold.otf"
P = []


def peca(id_, rotulo, grupo, tags=(), pacote=False):
    def deco(f):
        P.append((id_, rotulo, grupo, list(tags), pacote, f))
        return f
    return deco


class ItemM(mb.Item):
    """Item com filhos animados (extras glTF no nó filho) e assentos numerados."""

    def __init__(self, id_):
        super().__init__(id_)
        self.animados = []
        self.n_assento = 0
        self.semcolisao = False

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
# Estampas (PIL)
# ======================================================================================================================
def _pedestre(d, cx, cy, s, cor, larg=None):
    """Bonequinho andando (placas de pedestre), centrado em (cx, cy), altura ~s."""
    w = int(larg or s * 0.11)
    d.ellipse((cx + 0.02 * s - 0.085 * s, cy - 0.47 * s - 0.085 * s, cx + 0.02 * s + 0.085 * s, cy - 0.47 * s + 0.085 * s),
              fill=cor)
    om, qu = (cx - 0.01 * s, cy - 0.3 * s), (cx - 0.05 * s, cy + 0.04 * s)
    d.line([om, qu], fill=cor, width=w, joint="curve")
    d.line([(cx - 0.2 * s, cy - 0.04 * s), (cx - 0.12 * s, cy - 0.2 * s), om, (cx + 0.12 * s, cy - 0.15 * s),
            (cx + 0.2 * s, cy - 0.04 * s)], fill=cor, width=int(w * 0.8), joint="curve")
    d.line([qu, (cx - 0.12 * s, cy + 0.22 * s), (cx - 0.24 * s, cy + 0.42 * s)], fill=cor, width=w, joint="curve")
    d.line([qu, (cx + 0.06 * s, cy + 0.23 * s), (cx + 0.2 * s, cy + 0.42 * s)], fill=cor, width=w, joint="curve")
    for p in (om, qu):
        d.ellipse((p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2), fill=cor)


def _texto(d, xy, txt, tam, cor, fonte=F_BLACK, ancora="mm"):
    from PIL import ImageFont
    d.text(xy, txt, font=ImageFont.truetype(fonte, tam), fill=cor, anchor=ancora)


def _cor(nome):
    return mb.CORES[nome]


def desenha_estampas(pasta):
    from PIL import Image, ImageDraw
    os.makedirs(pasta, exist_ok=True)
    N = 512
    S = 2  # supersample

    def nova(fundo=(0, 0, 0, 0), w=N, h=N):
        im = Image.new("RGBA", (w * S, h * S), fundo)
        return im, ImageDraw.Draw(im)

    def salva(im, nome, w=N, h=N, fundo="#FFFFFF"):
        im = im.resize((w, h), Image.LANCZOS)
        bg = Image.new("RGB", (w, h), fundo)
        bg.paste(im, mask=im.split()[3])
        bg.save(os.path.join(pasta, nome + ".png"))

    M = N * S
    # PARE: octógono vermelho com borda branca
    im, d = nova()
    oct_ = lambda r: [(M / 2 + r * math.cos(math.radians(22.5 + 45 * k)), M / 2 - r * math.sin(math.radians(22.5 + 45 * k)))  # noqa: E731
                      for k in range(8)]
    d.polygon(oct_(M * 0.5 / math.cos(math.radians(22.5))), fill="#FFFFFF")
    d.polygon(oct_(M * 0.44 / math.cos(math.radians(22.5))), fill=_cor("vermelho"))
    _texto(d, (M / 2, M / 2 + M * 0.01), "PARE", int(M * 0.25), "#FFFFFF")
    salva(im, "placa_pare", fundo="#FFFFFF")
    # Dê a preferência: triângulo de ponta para baixo, branco com borda vermelha
    im, d = nova(fundo=(255, 255, 255, 255))
    tri = lambda m: [(m, m * 0.62), (M - m, m * 0.62), (M / 2, M - m * 1.15)]  # noqa: E731
    d.polygon(tri(0), fill=_cor("vermelho"))
    d.polygon(tri(M * 0.13), fill="#FFFFFF")
    salva(im, "placa_preferencia", fundo=_cor("vermelho"))
    # Passagem de pedestres: losango amarelo com borda preta e bonequinho
    im, d = nova(fundo=(0, 0, 0, 255))
    los = lambda m: [(M / 2, m), (M - m, M / 2), (M / 2, M - m), (m, M / 2)]  # noqa: E731
    d.polygon(los(M * 0.035), fill=_cor("amarelo"))
    _pedestre(d, M / 2, M * 0.52, M * 0.5, _cor("preto"))
    d.rectangle((M * 0.28, M * 0.76, M * 0.72, M * 0.785), fill=_cor("preto"))
    salva(im, "placa_pedestres", fundo=_cor("preto"))
    # Velocidade máxima 40: círculo branco, anel vermelho
    im, d = nova(fundo=(255, 255, 255, 255))
    d.ellipse((0, 0, M, M), fill=_cor("vermelho"))
    d.ellipse((M * 0.1, M * 0.1, M * 0.9, M * 0.9), fill="#FFFFFF")
    _texto(d, (M / 2, M * 0.47), "40", int(M * 0.38), _cor("preto"))
    _texto(d, (M / 2, M * 0.73), "km/h", int(M * 0.1), _cor("preto"), F_BOLD)
    salva(im, "placa_velocidade", fundo=_cor("vermelho"))
    # Placa azul de travessia (a do semáforo do pacote): quadrado azul, triângulo branco, bonequinho
    im, d = nova(fundo=(0, 0, 0, 0))
    d.rounded_rectangle((0, 0, M, M), radius=M * 0.08, fill=_cor("azul"))
    d.polygon([(M / 2, M * 0.14), (M * 0.88, M * 0.84), (M * 0.12, M * 0.84)], fill="#FFFFFF")
    _pedestre(d, M / 2, M * 0.6, M * 0.38, _cor("preto"))
    salva(im, "placa_travessia", fundo=_cor("azul"))
    # Ponto de ônibus: faixa azul com ÔNIBUS e um ônibus de lado (1024 × 256)
    W2, H2 = 1024, 256
    im, d = nova(fundo=(0, 0, 0, 0), w=W2, h=H2)
    w2, h2 = W2 * S, H2 * S
    d.rounded_rectangle((0, 0, w2, h2), radius=h2 * 0.18, fill=_cor("azul_medio"))
    bx, by, bw, bh = w2 * 0.06, h2 * 0.2, h2 * 0.95, h2 * 0.5
    d.rounded_rectangle((bx, by, bx + bw, by + bh), radius=bh * 0.18, fill=_cor("amarelo"))
    for k in range(3):
        d.rounded_rectangle((bx + bw * (0.08 + 0.29 * k), by + bh * 0.14, bx + bw * (0.3 + 0.29 * k), by + bh * 0.5),
                            radius=bh * 0.06, fill=_cor("azul_claro"))
    for k in (0.24, 0.76):
        d.ellipse((bx + bw * k - bh * 0.17, by + bh * 0.82, bx + bw * k + bh * 0.17, by + bh * 1.16),
                  fill=_cor("grafite_escuro"))
    _texto(d, (w2 * 0.6, h2 * 0.52), "ÔNIBUS", int(h2 * 0.5), "#FFFFFF")
    salva(im, "placa_onibus", W2, H2, fundo=_cor("azul_medio"))
    # Painel do ponto: cartaz do parque (512 × 768)
    W3, H3 = 512, 768
    im, d = nova(fundo=(0, 0, 0, 0), w=W3, h=H3)
    w3, h3 = W3 * S, H3 * S
    d.rectangle((0, 0, w3, h3), fill=_cor("azul_celeste"))
    d.ellipse((w3 * 0.62, h3 * 0.06, w3 * 0.9, h3 * 0.06 + w3 * 0.28), fill=_cor("amarelo"))
    d.rectangle((0, h3 * 0.62, w3, h3), fill=_cor("grama"))
    cx, cy, r = w3 * 0.42, h3 * 0.4, w3 * 0.27  # roda-gigante
    d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=_cor("rosa"), width=int(w3 * 0.03))
    for k in range(8):
        a = math.radians(45 * k)
        d.line([(cx, cy), (cx + r * math.cos(a), cy + r * math.sin(a))], fill=_cor("branco"), width=int(w3 * 0.012))
        cc = (_cor("vermelho"), _cor("azul"), _cor("amarelo"), _cor("roxo"))[k % 4]
        q = (cx + r * math.cos(a), cy + r * math.sin(a))
        d.rounded_rectangle((q[0] - w3 * 0.04, q[1] - w3 * 0.03, q[0] + w3 * 0.04, q[1] + w3 * 0.05), radius=w3 * 0.015,
                            fill=cc)
    d.polygon([(cx, cy), (cx - r * 0.55, h3 * 0.66), (cx + r * 0.55, h3 * 0.66)], outline=_cor("branco"),
              width=int(w3 * 0.02))
    _texto(d, (w3 / 2, h3 * 0.76), "VISITE O", int(w3 * 0.1), "#FFFFFF")
    _texto(d, (w3 / 2, h3 * 0.87), "PARQUE", int(w3 * 0.17), "#FFFFFF")
    salva(im, "painel_parque", W3, H3, fundo=_cor("grama"))
    # Rótulos da reciclagem (4 lado a lado, 1024 × 256)
    im, d = nova(fundo=(0, 0, 0, 0), w=1024, h=256)
    rot = (("PAPEL", "azul"), ("PLÁSTICO", "vermelho"), ("VIDRO", "verde_escuro"), ("METAL", "amarelo_escuro"))
    cw = 1024 * S / 4
    for k, (txt, c) in enumerate(rot):
        x0 = cw * k
        d.rounded_rectangle((x0 + cw * 0.04, 256 * S * 0.06, x0 + cw * 0.96, 256 * S * 0.94), radius=cw * 0.08,
                            fill="#FFFFFF")
        cx, cy, r = x0 + cw / 2, 256 * S * 0.36, 256 * S * 0.2
        for j in range(3):  # três setas em triângulo (o símbolo da reciclagem, simplificado)
            a0 = math.radians(90 + 120 * j)
            a1 = math.radians(90 + 120 * j + 95)
            p0 = (cx + r * math.cos(a0), cy - r * math.sin(a0))
            p1 = (cx + r * math.cos(a1), cy - r * math.sin(a1))
            d.line([p0, p1], fill=_cor(c), width=int(r * 0.32))
            ang = math.atan2(-(p1[1] - p0[1]), p1[0] - p0[0])
            t = r * 0.42
            d.polygon([(p1[0] + t * math.cos(ang), p1[1] - t * math.sin(ang)),
                       (p1[0] + t * 0.7 * math.cos(ang + 2.2), p1[1] - t * 0.7 * math.sin(ang + 2.2)),
                       (p1[0] + t * 0.7 * math.cos(ang - 2.2), p1[1] - t * 0.7 * math.sin(ang - 2.2))], fill=_cor(c))
        _texto(d, (cx, 256 * S * 0.76), txt, int(256 * S * (0.2 if len(txt) > 6 else 0.24)), _cor(c))
    salva(im, "rotulos_reciclagem", 1024, 256, fundo="#FFFFFF")
    # Correio: faixa azul com CARTAS e um envelope (512 × 160)
    im, d = nova(fundo=(0, 0, 0, 0), w=512, h=160)
    w4, h4 = 512 * S, 160 * S
    d.rectangle((0, 0, w4, h4), fill=_cor("azul_medio"))
    ex, ey, ew, eh = w4 * 0.06, h4 * 0.22, h4 * 0.8, h4 * 0.56
    d.rectangle((ex, ey, ex + ew, ey + eh), fill="#FFFFFF")
    d.line([(ex, ey), (ex + ew / 2, ey + eh * 0.58), (ex + ew, ey)], fill=_cor("azul_medio"), width=int(h4 * 0.05))
    _texto(d, (w4 * 0.6, h4 * 0.52), "CARTAS", int(h4 * 0.42), "#FFFFFF")
    salva(im, "faixa_cartas", 512, 160, fundo=_cor("azul_medio"))
    # Placa verde AEROPORTO no lugar exato do UV da placa-escudo do pacote Apocalypse (u 0,523–0,727; v 0,824–0,983)
    im, d = nova(fundo=(0, 0, 0, 255), w=1024, h=1024)
    T = 1024 * S
    x0, x1 = 0.5228 * T, 0.7271 * T
    y0, y1 = (1 - 0.9827) * T, (1 - 0.8243) * T
    d.rectangle((x0 - 8, y0 - 8, x1 + 8, y1 + 8), fill="#FFFFFF")
    d.rounded_rectangle((x0 + 10, y0 + 10, x1 - 10, y1 - 10), radius=18, fill=_cor("verde_medio"))
    cx, w_ = (x0 + x1) / 2, x1 - x0
    _texto(d, (cx, y0 + (y1 - y0) * 0.32), "AEROPORTO", int(w_ * 0.15), "#FFFFFF")
    ay = y0 + (y1 - y0) * 0.68  # aviãozinho
    d.rounded_rectangle((cx - w_ * 0.22, ay - w_ * 0.03, cx + w_ * 0.22, ay + w_ * 0.03), radius=w_ * 0.03, fill="#FFFFFF")
    d.polygon([(cx - w_ * 0.02, ay), (cx + w_ * 0.08, ay), (cx - w_ * 0.06, ay - w_ * 0.16), (cx - w_ * 0.12, ay - w_ * 0.16)],
              fill="#FFFFFF")
    d.polygon([(cx - w_ * 0.02, ay), (cx + w_ * 0.08, ay), (cx - w_ * 0.06, ay + w_ * 0.16), (cx - w_ * 0.12, ay + w_ * 0.16)],
              fill="#FFFFFF")
    d.polygon([(cx - w_ * 0.2, ay), (cx - w_ * 0.14, ay), (cx - w_ * 0.2, ay - w_ * 0.08), (cx - w_ * 0.24, ay - w_ * 0.08)],
              fill="#FFFFFF")
    salva(im, "placa_aeroporto", 1024, 1024, fundo="#000000")


_EST = {}


def est(nome, emissao=0.0):
    if nome not in _EST:
        _EST[nome] = mb.material_estampa("mob_" + nome, os.path.join(EST_DIR, nome + ".png"), emissao=emissao)
    return _EST[nome]


def adesivo(pts, y, mat, esp=0.004, uvcaixa=None, uvrect=(0, 0, 1, 1)):
    """Adesivo/placa impressa: contorno 2D (x, z) no plano da frente, com a face da frente em y (olhando para −Y) e
    espessura esp para trás. O UV projeta (x, z) da caixa uvcaixa=(x0, z0, x1, z1) no retângulo uvrect da textura."""
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


def gira_z(ob, graus, loc=(0, 0, 0)):
    mb.transforma(ob, rot=("Z", graus))
    mb.transforma(ob, loc=loc)
    return ob


def solidifica(ob, esp):
    """Dá espessura a uma casca (modificador Solidify aplicado)."""
    md = ob.modifiers.new("s", "SOLIDIFY")
    md.thickness = esp
    md.offset = 1.0
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    velho = ob.data
    ob.modifiers.clear()
    ob.data = me
    bpy.data.meshes.remove(velho)
    for n in mb.MAT_NOMES[len(me.materials):]:
        me.materials.append(bpy.data.materials[n])
    return ob


# ======================================================================================================================
# Bancos e mesa
# ======================================================================================================================
MADEIRA_BANCO = "madeira_media"
FERRO = "grafite"


def lateral_banco(cor=FERRO, braco=True, seg=8):
    """Pé lateral de ferro fundido do banco de praça, no plano x = 0 (y para trás, z para cima)."""
    o = []
    o.append(mb.tubo([(0, -0.2, 0.0), (0, -0.21, 0.43)], 0.032, cor=cor, seg=seg, nome="pe"))
    o.append(mb.tubo([(0, 0.2, 0.0), (0, 0.19, 0.43), (0, 0.27, 0.88)], 0.032, cor=cor, seg=seg, raio_curva=0.12,
                     nome="pe"))
    o.append(mb.caixa(0.05, 0.5, 0.05, y=-0.01, z=0.38, cor=cor, bisel=0.015, seg=2, nome="travessa"))
    o.append(mb.caixa(0.06, 0.1, 0.02, y=-0.2, z=0.0, cor=cor, bisel=0.008, seg=1, nome="sapata"))
    o.append(mb.caixa(0.06, 0.1, 0.02, y=0.2, z=0.0, cor=cor, bisel=0.008, seg=1, nome="sapata"))
    if braco:
        o.append(mb.tubo([(0, -0.21, 0.43), (0, -0.22, 0.6), (0, -0.12, 0.66), (0, 0.22, 0.66)], 0.026, cor=cor, seg=seg,
                         raio_curva=0.06, nome="braco"))
    return o


def ripas_banco(L, cor=MADEIRA_BANCO, encosto=True):
    o = []
    for y in (-0.21, -0.09, 0.03, 0.15):
        o.append(mb.caixa(L, 0.105, 0.035, y=y, z=0.425, cor=cor, bisel=0.012, seg=2, nome="ripa"))
    if encosto:
        for z in (0.56, 0.69, 0.82):
            r = mb.caixa(L, 0.03, 0.105, cor=cor, bisel=0.012, seg=2, nome="ripa_encosto")
            mb.transforma(r, rot=("X", -16))
            y = 0.19 + (z - 0.43) * 0.178 - 0.05
            mb.transforma(r, loc=(0, y, z - 0.05))
            o.append(r)
    return o


@peca("banco_praca_madeira", "Banco de praça de madeira com encosto", "banco_praca", ["banco", "parque", "rua"])
def _(it):
    L = 1.8
    it.add(ripas_banco(L))
    for sx in (-1, 1):
        it.add([gira_z(o, 0, (sx * (L / 2 - 0.12), 0, 0)) for o in lateral_banco()])
    for x in (-0.58, 0.0, 0.58):
        it.assento(x, -0.04, 0.46)
    it.colisao([((0, -0.02, 0), (L, 0.52, 0.46)), ((0, 0.25, 0.46), (L, 0.16, 0.44))])


@peca("banco_sem_encosto", "Banco de praça sem encosto", "banco_sem_encosto", ["banco", "parque", "rua"])
def _(it):
    L = 1.8
    for sx in (-1, 1):
        it.add(mb.caixa(0.36, 0.44, 0.36, x=sx * 0.6, cor="concreto", bisel=0.05, nome="apoio"))
        it.add(mb.caixa(0.06, 0.46, 0.05, x=sx * 0.6, z=0.355, cor=FERRO, bisel=0.015, nome="travessa"))
    for y in (-0.165, -0.055, 0.055, 0.165):
        it.add(mb.caixa(L, 0.1, 0.05, y=y, z=0.402, cor="madeira_mel", bisel=0.014, seg=2, nome="ripa"))
    for x in (-0.58, 0.0, 0.58):
        it.assento(x, 0.0, 0.452)
    it.colisao([((0, 0, 0), (L, 0.46, 0.45))])


@peca("banco_curvo", "Banco curvo de praça", "banco_curvo", ["banco", "parque"])
def _(it):
    """Banco em arco: quem senta olha para o centro do arco (na frente, −Y); o encosto fica do lado de fora."""
    R = 2.6
    a0, a1 = 58, 122
    n = 7

    def ponto(phi, r, z=0.0):
        return V((r * math.cos(math.radians(phi)), -R + r * math.sin(math.radians(phi)), z))

    def ripa_arco(r0, r1, z, h, inclina=0.0, n=10):
        """Ripa curva contínua: setor de anel de r0 a r1, de a0 a a1, da altura z a z + h; inclina empurra o topo para
        fora (encosto)."""
        cont = [tuple(ponto(a0 + (a1 - a0) * k / n, r1))[:2] for k in range(n + 1)] + \
            [tuple(ponto(a1 - (a1 - a0) * k / n, r0))[:2] for k in range(n + 1)]
        ob = mb.extrudado(mb._ccw(cont), h, z=z, cor=MADEIRA_BANCO, bisel=0.008, seg=1, nome="ripa")
        if inclina:
            for v in ob.data.vertices:
                d = V((v.co.x, v.co.y + R, 0))
                v.co += d.normalized() * (v.co.z - z) * inclina
        return ob

    for dr in (-0.17, -0.057, 0.057, 0.17):
        it.add(ripa_arco(R + dr - 0.05, R + dr + 0.05, 0.425, 0.035))
    for z in (0.6, 0.76):
        r = R + 0.14 + (z - 0.43) * 0.178
        it.add(ripa_arco(r - 0.015, r + 0.015, z - 0.05, 0.11, inclina=0.287))
    for phi in (a0 + 4, 90, a1 - 4):
        p = ponto(phi, R)
        for o in lateral_banco(braco=phi != 90, seg=6):
            gira_z(o, phi - 90, tuple(p))
            it.add(o)
    for phi in (72, 90, 108):
        p = ponto(phi, R - 0.03)
        it.assento(p.x, p.y, 0.46)
    cx = []
    for (b0, b1) in ((a0, 80), (80, 100), (100, a1)):
        ps = [ponto(b, r) for b in (b0, b1) for r in (R - 0.24, R + 0.36)]
        x0, x1 = min(q.x for q in ps), max(q.x for q in ps)
        y0, y1 = min(q.y for q in ps), max(q.y for q in ps)
        cx.append((((x0 + x1) / 2, (y0 + y1) / 2, 0), (x1 - x0, y1 - y0, 0.5)))
    it.colisao(cx)


@peca("mesa_praca", "Mesa de piquenique de praça", "mesa_praca", ["mesa", "parque", "piquenique"])
def _(it):
    L = 1.8
    cor, corp = "madeira_clara", "madeira_mel"
    for k in range(5):
        y = -0.3 + 0.15 * k
        it.add(mb.caixa(L, 0.14, 0.045, y=y, z=0.72, cor=cor if k % 2 == 0 else corp, bisel=0.012, seg=2,
                        nome="tampo"))
    for sy in (-1, 1):
        for k in range(2):
            it.add(mb.caixa(L, 0.135, 0.045, y=sy * (0.555 + 0.14 * (k - 0.5)), z=0.42, cor=cor, bisel=0.012, seg=2,
                            nome="assento"))
    for sx in (-1, 1):
        x = sx * 0.62
        it.add(mb.caixa(0.08, 1.5, 0.06, x=x, z=0.36, cor=corp, bisel=0.015, nome="travessa"))
        it.add(mb.caixa(0.08, 0.7, 0.06, x=x, z=0.66, cor=corp, bisel=0.015, nome="travessa"))
        for sy in (-1, 1):
            pe = mb.caixa(0.08, 0.09, 0.78, cor=corp, bisel=0.015, nome="pe")
            mb.transforma(pe, rot=("X", sy * 24))
            mb.transforma(pe, loc=(x, sy * 0.55, 0.018))
            it.add(pe)
    it.add(mb.cilindro(0.045, 0.012, z=0.762, cor="grafite", seg=14, bisel=0.003, nome="furo_guarda_sol"))
    it.add(mb.cilindro(0.028, 0.004, z=0.772, cor="preto", seg=12, bisel=0.0, nome="furo"))
    for sx in (-0.45, 0.45):
        for sy in (-1, 1):
            it.assento(sx, sy * 0.555, 0.445)
    it.slot("tampo", (0, 0, 0.765), (1.7, 0.7, 0.5))
    it.colisao([((0, 0, 0), (L, 0.76, 0.765)), ((0, -0.555, 0), (L, 0.28, 0.445)), ((0, 0.555, 0), (L, 0.28, 0.445))])


@peca("guarda_sol", "Guarda-sol listrado de praça", "guarda_sol", ["guarda_sol", "parque", "praia", "mesa"])
def _(it):
    it.add(mb.cilindro(0.26, 0.07, cor="concreto_escuro", seg=20, bisel=0.02, nome="base"))
    it.add(mb.cilindro(0.08, 0.12, r2=0.04, z=0.07, cor="concreto_escuro", seg=14, bisel=0.01, nome="base"))
    it.add(mb.cilindro(0.025, 2.42, z=0.1, cor="branco", seg=10, bisel=0.005, nome="haste"))
    perfil = [(0.0, 2.6), (0.35, 2.56), (0.8, 2.43), (1.32, 2.2), (1.34, 2.16), (1.29, 2.16), (0.8, 2.38),
              (0.35, 2.5), (0.0, 2.54)]
    lona = mb.torno(perfil, cor="branco", seg=16, angulo=30, nome="lona")
    mb.pinta_onde(lona, "vermelho", lambda c, n: int(((math.degrees(math.atan2(c.y, c.x)) % 360) // 45)) % 2 == 0)
    it.add(lona)
    for k in range(16):  # babadinho: aba em cada gomo
        a = math.radians(360 * k / 16 + 360 / 32)
        aba = mb.caixa(0.5, 0.012, 0.11, cor="vermelho" if (k // 2) % 2 == 0 else "branco", bisel=0.004, seg=1,
                       nome="aba")
        mb.transforma(aba, rot=("Z", math.degrees(a) + 90))
        mb.transforma(aba, loc=(1.29 * math.cos(a), 1.29 * math.sin(a), 2.07))
        it.add(aba)
    it.add(mb.esfera(0.05, z=2.63, cor="branco", seg=10, nome="ponta"))
    it.colisao([((0, 0, 0), (0.52, 0.52, 0.2)), ((0, 0, 0), (0.12, 0.12, 2.3))])


# ======================================================================================================================
# Iluminação
# ======================================================================================================================
@peca("poste_rua", "Poste de rua com braço", "poste_rua", ["poste", "luz", "rua"])
def _(it):
    it.add(mb.cilindro(0.2, 0.32, cor="concreto_escuro", seg=16, bisel=0.03, nome="base"))
    it.add(mb.cilindro(0.13, 0.12, z=0.32, cor="cinza_medio", seg=16, bisel=0.02, nome="flange"))
    it.add(mb.cilindro(0.1, 7.3, r2=0.07, z=0.4, cor="cinza", seg=12, bisel=0.01, nome="haste"))
    it.add(mb.tubo([(0, 0, 7.2), (0, 0, 7.75), (0, -0.7, 8.05), (0, -2.0, 8.12)], 0.055, cor="cinza", seg=10,
                   raio_curva=0.5, nome="braco"))
    it.add(mb.superelipsoide(0.4, 0.86, 0.22, y=-2.32, z=7.98, cor="cinza_claro", e=0.45, e_v=0.6, nu=20, nv=8,
                             nome="luminaria"))
    it.add(mb.superelipsoide(0.3, 0.66, 0.08, y=-2.34, z=7.95, cor=None, mat="luz", e=0.45, e_v=0.6, nu=16, nv=4,
                             nome="lampada"))
    it.colisao([((0, 0, 0), (0.4, 0.4, 7.7))])


def lanterna(x, y, z):
    """Lanterna de praça: pé escuro, corpo de vidro aceso (luz) e chapéu de quatro águas."""
    o = [mb.caixa(0.2, 0.2, 0.08, x=x, y=y, z=z, cor="grafite", bisel=0.02, seg=2, nome="pe"),
         mb.superelipsoide(0.24, 0.24, 0.34, x=x, y=y, z=z + 0.07, cor=None, mat="luz", e=0.32, e_v=0.25, nu=12, nv=4,
                           nome="vidro"),
         mb.caixa(0.27, 0.27, 0.05, x=x, y=y, z=z + 0.4, cor="grafite", bisel=0.015, seg=2, nome="aba")]
    chapeu = mb.torno([(0.0, 0.0), (0.2, 0.0), (0.2, 0.03), (0.04, 0.14), (0.0, 0.15)], seg=4, cor="grafite", angulo=20,
                      nome="chapeu")
    mb.transforma(chapeu, rot=("Z", 45))
    mb.transforma(chapeu, esc=(1.06, 1.06, 1), loc=(0, 0, 0))
    mb.transforma(chapeu, loc=(x, y, z + 0.44))
    o.append(chapeu)
    o.append(mb.cilindro(0.02, 0.06, r2=0.004, x=x, y=y, z=z + 0.58, cor="grafite", seg=8, bisel=0, nome="ponta"))
    return o


@peca("poste_praca_4_lanternas", "Poste de praça com 4 lanternas", "poste_praca", ["poste", "luz", "parque"])
def _(it):
    base = [(0.0, 0.0), (0.26, 0.0), (0.26, 0.12), (0.2, 0.18), (0.16, 0.5), (0.11, 0.62), (0.08, 0.64), (0.0, 0.64)]
    b = mb.torno(base, cor="grafite", seg=8, angulo=30, nome="base")
    mb.transforma(b, rot=("Z", 22.5))
    it.add(b)
    it.add(mb.cilindro(0.065, 3.1, r2=0.055, z=0.6, cor="grafite", seg=10, bisel=0.01, nome="haste"))
    it.add(mb.cilindro(0.1, 0.1, z=1.6, cor="grafite_escuro", seg=10, bisel=0.02, nome="anel"))
    it.add(mb.cilindro(0.11, 0.16, z=3.62, cor="grafite_escuro", seg=10, bisel=0.03, nome="cubo"))
    R = 0.62
    for k in range(4):
        a = math.radians(45 + 90 * k)
        c, s = math.cos(a), math.sin(a)
        it.add(mb.tubo([(0.05 * c, 0.05 * s, 3.7), (0.35 * c, 0.35 * s, 3.72), (R * c, R * s, 3.84)], 0.035,
                       cor="grafite", seg=6, raio_curva=0.15, nome="braco"))
        it.add(mb.tubo([(0.04 * c, 0.04 * s, 3.45), (0.3 * c, 0.3 * s, 3.66)], 0.02, cor="grafite", seg=6,
                       raio_curva=0.05, nome="mao_francesa"))
        it.add(lanterna(R * c, R * s, 3.84))
    it.add(mb.cilindro(0.04, 0.4, z=3.78, cor="grafite", seg=8, nome="haste_topo"))
    it.add(mb.esfera(0.09, z=4.25, cor="grafite", seg=12, nome="bola"))
    it.add(mb.cilindro(0.025, 0.2, r2=0.002, z=4.32, cor="grafite", seg=8, bisel=0, nome="ponta"))
    it.colisao([((0, 0, 0), (0.4, 0.4, 3.6))])


@peca("luminaria_jardim", "Luminária baixa de jardim", "luminaria_jardim", ["luminaria", "luz", "parque", "jardim"])
def _(it):
    it.add(mb.cilindro(0.11, 0.05, cor="grafite", seg=16, bisel=0.015, nome="base"))
    it.add(mb.cilindro(0.055, 0.56, z=0.05, cor="grafite", seg=12, bisel=0.01, nome="haste"))
    it.add(mb.cilindro(0.085, 0.04, z=0.6, cor="grafite_escuro", seg=16, bisel=0.01, nome="anel"))
    it.add(mb.cilindro(0.075, 0.15, z=0.64, cor=None, mat="luz", seg=16, bisel=0.01, nome="vidro"))
    it.add(mb.torno([(0.0, 0.79), (0.15, 0.79), (0.15, 0.81), (0.06, 0.88), (0.0, 0.9)], cor="grafite", seg=16,
                    nome="chapeu"))
    it.colisao([((0, 0, 0), (0.22, 0.22, 0.9))])


@peca("relogio_rua", "Relógio de rua", "relogio_rua", ["relogio", "parque", "rua", "animado"])
def _(it):
    verde, ouro = "verde_floresta", "ouro"
    base = [(0.0, 0.0), (0.3, 0.0), (0.3, 0.12), (0.24, 0.16), (0.2, 0.55), (0.15, 0.62), (0.15, 0.7), (0.1, 0.76),
            (0.0, 0.76)]
    it.add(mb.torno(base, cor=verde, seg=16, nome="base"))
    it.add(mb.cilindro(0.075, 2.2, r2=0.065, z=0.74, cor=verde, seg=12, bisel=0.01, nome="haste"))
    for z in (0.74, 1.5, 2.9):
        it.add(mb.cilindro(0.1, 0.06, z=z, cor=ouro, seg=12, bisel=0.015, nome="anel"))
    it.add(mb.torno([(0.0, 2.92), (0.1, 2.92), (0.2, 3.0), (0.2, 3.04), (0.0, 3.04)], cor=verde, seg=16, nome="apoio"))
    zc, Rr, prof = 3.46, 0.42, 0.24
    it.add(mb.cilindro(Rr, prof, eixo="y", z=zc, cor=verde, seg=24, bisel=0.03, nome="caixa"))
    for sy in (-1, 1):
        yf = sy * (prof / 2)
        it.add(mb.cilindro(Rr + 0.015, 0.035, eixo="y", y=yf, z=zc, cor=ouro, seg=24, bisel=0.012, nome="aro"))
        it.add(mb.cilindro(Rr - 0.06, 0.02, eixo="y", y=yf + sy * 0.012, z=zc, cor=None, mat="luz", seg=24,
                           bisel=0.0, nome="mostrador"))
        yd = yf + sy * 0.024
        for h in range(12):
            a = math.radians(30 * h)
            l = 0.07 if h % 3 == 0 else 0.04
            mk = mb.caixa(0.022 if h % 3 == 0 else 0.014, 0.006, l, z=-l / 2, cor="grafite_escuro", bisel=0.0,
                          liso=False, nome="marca")
            mb.transforma(mk, rot=("Y", -sy * math.degrees(a)))  # frente: sentido horário visto de −Y
            r = Rr - 0.1 - l / 2
            mb.transforma(mk, loc=(-sy * r * math.sin(a), yd, zc + r * math.cos(a)))
            it.add(mk)
        # ponteiros fixos em 10h10 (horas e minutos); o de segundos anda
        for ang, comp, larg in ((305, 0.18, 0.03), (60, 0.27, 0.022)):
            pt = mb.caixa(larg, 0.006, comp + 0.05, z=-0.05, cor="grafite_escuro", bisel=0.004, seg=1, nome="ponteiro")
            mb.transforma(pt, rot=("Y", ang if sy < 0 else -ang))
            mb.transforma(pt, loc=(0, yd + sy * 0.006, zc))
            it.add(pt)
        it.add(mb.cilindro(0.025, 0.02, eixo="y", y=yd + sy * 0.022, z=zc, cor=ouro, seg=12, bisel=0.004, nome="eixo"))
        seg = mb.caixa(0.008, 0.004, 0.36, z=-0.07, cor="vermelho", bisel=0.0, liso=False, nome="segundos")
        mb.transforma(seg, loc=(0, yd + sy * 0.014, zc))
        it.anima(seg, {"anima": "girar", "eixo": "z", "velocidade": -6 if sy < 0 else 6},
                 "ponteiro_segundos_frente" if sy < 0 else "ponteiro_segundos_tras", pivo=(0, yd + sy * 0.014, zc))
    it.add(mb.torno([(0.0, zc + Rr - 0.02), (0.12, zc + Rr - 0.02), (0.06, zc + Rr + 0.12), (0.0, zc + Rr + 0.14)],
                    cor=verde, seg=12, nome="topo"))
    it.add(mb.esfera(0.07, z=zc + Rr + 0.2, cor=ouro, seg=12, nome="bola"))
    it.add(mb.cilindro(0.02, 0.16, r2=0.002, z=zc + Rr + 0.25, cor=ouro, seg=8, bisel=0, nome="ponta"))
    it.colisao([((0, 0, 0), (0.4, 0.4, 3.0))])


# ======================================================================================================================
# Lixeiras
# ======================================================================================================================
def lixeira_colorida(x, cor, rotulo_k):
    o = [mb.caixa(0.38, 0.4, 0.68, x=x, cor=cor, bisel=0.045, seg=2, nome="corpo"),
         mb.caixa(0.43, 0.46, 0.15, x=x, z=0.66, cor=cor, bisel=0.05, seg=2, nome="tampa"),
         mb.caixa(0.24, 0.02, 0.06, x=x, y=-0.225, z=0.705, cor="grafite_escuro", bisel=0.01, nome="boca"),
         mb.caixa(0.34, 0.36, 0.03, x=x, z=0.0, cor="grafite", bisel=0.01, nome="pe")]
    o.append(adesivo([(x - 0.14, 0.3), (x + 0.14, 0.3), (x + 0.14, 0.44), (x - 0.14, 0.44)], -0.2015,
                     est("rotulos_reciclagem"), uvrect=(rotulo_k / 4, 0, (rotulo_k + 1) / 4, 1)))
    return o


@peca("lixeira_reciclagem", "Lixeiras de reciclagem (4 cores)", "lixeira_reciclagem", ["lixeira", "reciclagem", "parque", "rua"])
def _(it):
    cores = (("azul", 0), ("vermelho", 1), ("verde", 2), ("amarelo", 3))
    for k, (c, r) in enumerate(cores):
        it.add(lixeira_colorida(-0.69 + 0.46 * k, c, r))
    it.add(mb.caixa(1.86, 0.06, 0.06, y=0.24, z=0.38, cor="metal", bisel=0.015, nome="barra"))
    it.colisao([((0, 0, 0), (1.86, 0.5, 0.82))])


@peca("lixeira_comum", "Lixeira de praça", "lixeira_comum", ["lixeira", "parque", "rua"])
def _(it):
    h = 0.8
    corpo = mb.caixa(0.4, 0.4, h, cor="cinza", bisel=0.05, nome="corpo")
    for v in corpo.data.vertices:
        k = 1.0 + 0.16 * (v.co.z / h)
        v.co.x *= k
        v.co.y *= k
    it.add(corpo)
    it.add(mb.caixa(0.5, 0.5, 0.06, z=h - 0.04, cor="cinza_medio", bisel=0.025, nome="borda"))
    it.add(mb.caixa(0.36, 0.36, 0.02, z=h - 0.005, cor="grafite_escuro", bisel=0.01, nome="boca"))
    it.add(mb.caixa(0.42, 0.02, 0.06, y=-0.22, z=0.52, cor="cinza_medio", bisel=0.01, nome="friso"))
    it.colisao([((0, 0, 0), (0.5, 0.5, h + 0.02))])


# ======================================================================================================================
# Calçada: bebedouro, hidrante, correio, bicicletário, orelhão
# ======================================================================================================================
@peca("bebedouro", "Bebedouro de praça com cuia de cachorro", "bebedouro", ["bebedouro", "agua", "parque"])
def _(it):
    col = [(0.0, 0.0), (0.2, 0.0), (0.2, 0.06), (0.15, 0.1), (0.13, 0.75), (0.17, 0.8), (0.0, 0.8)]
    it.add(mb.torno(col, cor="concreto", seg=20, nome="coluna"))
    bacia = [(0.0, 0.78), (0.18, 0.78), (0.25, 0.86), (0.26, 0.92), (0.23, 0.92), (0.2, 0.86), (0.0, 0.84)]
    it.add(mb.torno(bacia, cor="metal_claro", seg=24, nome="bacia"))
    it.add(mb.cilindro(0.04, 0.012, z=0.845, cor="metal_escuro", seg=12, bisel=0.0, nome="ralo"))
    it.add(mb.tubo([(0.0, 0.12, 0.84), (0.0, 0.12, 0.96), (0.0, 0.06, 0.99)], 0.018, cor="cromo", seg=8,
                   raio_curva=0.04, nome="bica"))
    it.add(mb.tubo([(0.0, 0.05, 0.99), (0.0, 0.0, 1.03), (0.0, -0.06, 0.98), (0.0, -0.08, 0.9)], 0.008, cor=None,
                   mat="agua", seg=6, raio_curva=0.04, nome="jato"))
    it.add(mb.cilindro(0.03, 0.03, eixo="y", y=-0.27, z=0.88, cor="azul", seg=12, bisel=0.008, nome="botao"))
    it.add(mb.caixa(0.08, 0.06, 0.05, y=-0.24, z=0.855, cor="metal_claro", bisel=0.01, nome="suporte"))
    # cuia de cachorro com torneirinha
    it.add(mb.torno([(0.0, 0.0), (0.13, 0.0), (0.16, 0.08), (0.14, 0.08), (0.11, 0.025), (0.0, 0.025)], x=0.36,
                    cor="metal_claro", seg=18, nome="cuia"))
    it.add(mb.cilindro(0.1, 0.004, x=0.36, z=0.026, cor=None, mat="agua", seg=16, bisel=0, nome="agua"))
    it.add(mb.tubo([(0.14, 0.0, 0.3), (0.3, 0.0, 0.3), (0.34, 0.0, 0.24)], 0.014, cor="cromo", seg=6, raio_curva=0.03,
                   nome="torneira"))
    it.colisao([((0, 0, 0), (0.52, 0.52, 0.95)), ((0.36, 0, 0), (0.32, 0.32, 0.1))])


@peca("hidrante", "Hidrante", "hidrante", ["hidrante", "rua", "calcada"])
def _(it):
    vm, vme = "vermelho", "vermelho_escuro"
    it.add(mb.cilindro(0.17, 0.06, cor=vme, seg=16, bisel=0.015, nome="flange"))
    it.add(mb.cilindro(0.13, 0.08, z=0.05, cor=vme, seg=16, bisel=0.015, nome="flange"))
    it.add(mb.cilindro(0.115, 0.46, z=0.12, cor=vm, seg=16, bisel=0.01, nome="corpo"))
    it.add(mb.cilindro(0.135, 0.05, z=0.55, cor=vme, seg=16, bisel=0.015, nome="anel"))
    it.add(mb.torno([(0.0, 0.6), (0.125, 0.6), (0.12, 0.66), (0.08, 0.72), (0.0, 0.74)], cor=vm, seg=16, nome="cupula"))
    it.add(mb.cilindro(0.03, 0.06, z=0.73, cor="amarelo", seg=5, bisel=0.005, nome="porca"))
    for sx in (-1, 1):
        it.add(mb.cilindro(0.055, 0.1, eixo="x", x=sx * 0.15, z=0.38, cor=vm, seg=12, bisel=0.01, nome="saida"))
        it.add(mb.cilindro(0.065, 0.04, eixo="x", x=sx * 0.215, z=0.38, cor="amarelo", seg=12, bisel=0.01,
                           nome="tampa"))
        it.add(mb.cilindro(0.016, 0.03, eixo="x", x=sx * 0.245, z=0.38, cor="amarelo", seg=5, bisel=0.003,
                           nome="porca"))
    it.add(mb.cilindro(0.07, 0.1, eixo="y", y=-0.15, z=0.32, cor=vm, seg=14, bisel=0.01, nome="saida"))
    it.add(mb.cilindro(0.082, 0.04, eixo="y", y=-0.215, z=0.32, cor="amarelo", seg=14, bisel=0.01, nome="tampa"))
    it.add(mb.cilindro(0.018, 0.03, eixo="y", y=-0.245, z=0.32, cor="amarelo", seg=5, bisel=0.003, nome="porca"))
    it.colisao([((0, 0, 0), (0.4, 0.36, 0.76))])


@peca("caixa_correio", "Caixa de correio", "caixa_correio", ["correio", "rua", "calcada"])
def _(it):
    it.add(mb.caixa(0.36, 0.3, 0.04, cor="grafite", bisel=0.012, nome="base"))
    it.add(mb.caixa(0.12, 0.12, 0.62, z=0.04, cor="grafite", bisel=0.02, nome="pe"))
    W, Hc, Pf = 0.46, 0.66, 0.4
    z0 = 0.62
    cont = [(-W / 2, 0.0), (W / 2, 0.0), (W / 2, Hc - W / 2)] + \
        [(W / 2 * math.cos(math.radians(a)), Hc - W / 2 + W / 2 * math.sin(math.radians(a))) for a in range(15, 180, 15)] + \
        [(-W / 2, Hc - W / 2)]
    cx = [(x, z + z0) for x, z in cont]
    it.add(mb.extrudado(cx, Pf, y=-Pf / 2, plano="xz", cor="amarelo", bisel=0.03, nome="caixa"))
    it.add(mb.caixa(W + 0.03, Pf + 0.03, 0.05, z=z0 - 0.02, cor="amarelo_escuro", bisel=0.015, nome="rodape"))
    it.add(mb.caixa(0.27, 0.02, 0.035, y=-Pf / 2 - 0.004, z=z0 + 0.5, cor="preto", bisel=0.008, nome="boca"))
    it.add(mb.caixa(0.33, 0.035, 0.03, y=-Pf / 2 - 0.012, z=z0 + 0.54, cor="amarelo_escuro", bisel=0.01, nome="aba"))
    it.add(adesivo([(-W / 2 + 0.005, z0 + 0.22), (W / 2 - 0.005, z0 + 0.22), (W / 2 - 0.005, z0 + 0.36),
                    (-W / 2 + 0.005, z0 + 0.36)], -Pf / 2 - 0.0015, est("faixa_cartas")))
    it.add(mb.caixa(0.22, 0.015, 0.16, y=-Pf / 2 - 0.004, z=z0 + 0.03, cor="amarelo_escuro", bisel=0.01,
                    nome="portinhola"))
    it.add(mb.cilindro(0.014, 0.012, eixo="y", y=-Pf / 2 - 0.016, z=z0 + 0.11, cor="metal_claro", seg=10,
                       bisel=0.003, nome="fechadura"))
    it.colisao([((0, 0, 0), (0.5, 0.44, z0 + Hc))])


@peca("bicicletario", "Bicicletário de calçada", "bicicletario", ["bicicletario", "rua", "parque"])
def _(it):
    it.add(mb.caixa(2.3, 0.9, 0.04, cor="concreto", bisel=0.015, nome="laje"))
    for k in range(5):
        x = -0.9 + 0.45 * k
        it.add(mb.tubo([(x, -0.32, 0.03), (x, -0.32, 0.72), (x, 0.32, 0.72), (x, 0.32, 0.03)], 0.03,
                       cor="amarelo", seg=10, raio_curva=0.22, nome="arco"))
        for sy in (-1, 1):
            it.add(mb.cilindro(0.05, 0.02, x=x, y=sy * 0.32, z=0.035, cor="grafite", seg=12, bisel=0.005,
                               nome="sapata"))
    it.colisao([((0, 0, 0), (2.0, 0.72, 0.76))])


@peca("telefone_publico", "Telefone público (orelhão)", "telefone_publico", ["telefone", "rua", "calcada"])
def _(it):
    yp = 0.52
    it.add(mb.cilindro(0.11, 0.05, y=yp, cor="grafite", seg=14, bisel=0.015, nome="base"))
    it.add(mb.cilindro(0.05, 2.4, y=yp, z=0.04, cor="grafite", seg=10, bisel=0.01, nome="haste"))
    it.add(mb.tubo([(0, yp, 2.3), (0, yp, 2.42), (0, 0.24, 2.42)], 0.04, cor="grafite", seg=8, raio_curva=0.08,
                   nome="braco"))
    # concha em forma de ovo (laranja por fora, clara por dentro), aberta na frente e embaixo
    R, zc = 0.48, 1.98
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=14, radius=1.0)
    bm.transform(Matrix.Diagonal((R * 0.92, R * 0.86, R * 1.18, 1)))
    apagar = [f for f in bm.faces if f.calc_center_median().y < -R * 0.2 or f.calc_center_median().z < -0.45]
    bmesh.ops.delete(bm, geom=apagar, context="FACES")
    bm.transform(Matrix.Translation((0, 0, zc)))
    concha = mb._obj("concha", bm, "laranja", angulo=80)
    solidifica(concha, 0.035)
    mb.pinta_onde(concha, "laranja_claro", lambda c, n: (V(c) - V((0, 0, zc))).dot(n) < 0)
    it.add(concha)
    # aparelho no fundo da concha
    yf = 0.215
    it.add(mb.caixa(0.24, 0.1, 0.34, y=yf + 0.05, z=1.62, cor="cinza_azulado", bisel=0.03, nome="aparelho"))
    it.add(mb.caixa(0.12, 0.02, 0.12, y=yf - 0.002, z=1.68, cor="cinza_claro", bisel=0.008, nome="teclado"))
    for i in range(3):
        for j in range(3):
            it.add(mb.caixa(0.022, 0.012, 0.022, x=-0.034 + 0.034 * i, y=yf - 0.014, z=1.7 + 0.034 * j, cor="grafite",
                            bisel=0.004, seg=1, nome="tecla"))
    it.add(mb.caixa(0.1, 0.012, 0.04, y=yf - 0.004, z=1.87, cor="tela", bisel=0.005, nome="visor"))
    it.add(mb.superelipsoide(0.07, 0.07, 0.24, x=-0.155, y=yf + 0.02, z=1.66, cor="preto", e=0.5, e_v=0.6, nu=12, nv=6,
                             nome="fone"))
    it.add(mb.tubo([(-0.155, yf + 0.01, 1.67), (-0.18, yf - 0.02, 1.56), (-0.08, yf - 0.01, 1.57),
                    (-0.06, yf + 0.01, 1.64)], 0.008, cor="preto", seg=6, raio_curva=0.03, nome="fio"))
    it.colisao([((0, yp, 0), (0.22, 0.22, 2.4))])


# ======================================================================================================================
# Ponto de ônibus e placas de trânsito
# ======================================================================================================================
@peca("ponto_onibus", "Ponto de ônibus coberto", "ponto_onibus", ["ponto_onibus", "rua", "calcada", "banco"])
def _(it):
    L = 3.6
    yb = 0.5
    for sx in (-1, 1):
        it.add(mb.caixa(0.1, 0.1, 2.62, x=sx * (L / 2 - 0.05), y=yb, cor="cinza_medio", bisel=0.025, nome="pilar"))
        it.add(mb.caixa(0.22, 0.22, 0.04, x=sx * (L / 2 - 0.05), y=yb, cor="grafite", bisel=0.012, nome="sapata"))
    # fundo de vidro com caixilho
    it.add(mb.caixa(L - 0.2, 0.03, 1.9, y=yb + 0.01, z=0.3, cor=None, mat="vidro", bisel=0.002, nome="vidro"))
    for z in (0.26, 2.2):
        it.add(mb.caixa(L - 0.12, 0.06, 0.06, y=yb, z=z, cor="cinza_medio", bisel=0.015, nome="caixilho"))
    it.add(mb.caixa(0.05, 0.05, 1.9, y=yb, z=0.3, cor="cinza_medio", bisel=0.012, nome="montante"))
    # cobertura curva
    perfil = [(-1.0 + 1.6 * k / 12, 2.62 + 0.16 * math.sin(math.pi * k / 12)) for k in range(13)]
    cont = perfil + [(y, z + 0.08) for y, z in perfil[::-1]]
    it.add(mb.extrudado(mb._ccw(cont), L + 0.3, x=-(L + 0.3) / 2, plano="yz", cor="turquesa", bisel=0.025,
                        nome="cobertura"))
    it.add(mb.caixa(L + 0.3, 0.06, 0.28, y=-1.02, z=2.5, cor="azul_medio", bisel=0.02, nome="testeira"))
    it.add(adesivo([(-0.8, 2.52), (0.8, 2.52), (0.8, 2.92), (-0.8, 2.92)], -1.051, est("placa_onibus", 1.2)))
    it.add(mb.caixa(L - 0.4, 0.1, 0.03, y=-0.2, z=2.62, cor=None, mat="luz", bisel=0.01, nome="luz"))
    for sx in (-1, 1):
        it.add(mb.caixa(0.08, 1.3, 0.1, x=sx * (L / 2 - 0.05), y=-0.2, z=2.55, cor="cinza_medio", bisel=0.02,
                        nome="viga"))
    # banco
    for x in (-1.2, 0.0, 1.2):
        it.add(mb.caixa(0.06, 0.36, 0.06, x=x, y=yb - 0.2, z=0.36, cor="cinza_medio", bisel=0.015, nome="mao"))
    it.add(mb.caixa(0.06, 0.06, 0.4, x=0.0, y=yb - 0.34, z=0.0, cor="cinza_medio", bisel=0.015, nome="pe"))
    for k in range(3):
        it.add(mb.caixa(2.6, 0.11, 0.04, y=yb - 0.33 + 0.125 * k, z=0.42, cor="madeira_mel", bisel=0.012, seg=2,
                        nome="ripa"))
    for x in (-0.85, 0.0, 0.85):
        it.assento(x, yb - 0.2, 0.46)
    # painel luminoso lateral
    xp = L / 2 + 0.07
    it.add(mb.caixa(0.12, 1.12, 1.9, x=xp, y=0.0, z=0.3, cor="cinza_medio", bisel=0.03, nome="painel"))
    pa = adesivo([(-0.5, 0.42), (0.5, 0.42), (0.5, 2.08), (-0.5, 2.08)], 0.0, est("painel_parque", 1.0))
    mb.transforma(pa, rot=("Z", 90))  # olha para +X (para fora do abrigo)
    mb.transforma(pa, loc=(xp + 0.064, 0.0, 0))
    it.add(pa)
    it.add(mb.caixa(0.06, 0.06, 0.3, x=xp, y=0.0, z=0.0, cor="grafite", bisel=0.015, nome="pe_painel"))
    it.colisao([((0, yb, 0), (L, 0.2, 2.6)), ((0, yb - 0.2, 0), (2.6, 0.4, 0.46)), ((xp, 0, 0), (0.14, 1.14, 2.2))])


def placa(it, contorno, png, z_c, tam, cor_fundo="metal_claro"):
    """Placa de trânsito: poste com tampa, chapa de metal do contorno (escala tam, centrada em z_c) e o adesivo."""
    it.add(mb.cilindro(0.035, z_c + tam * 0.35, cor="cinza_claro", seg=10, bisel=0.008, nome="poste"))
    it.add(mb.cilindro(0.04, 0.02, z=z_c + tam * 0.35, cor="cinza", seg=10, bisel=0.006, nome="tampa"))
    it.add(mb.cilindro(0.07, 0.03, cor="cinza", seg=12, bisel=0.008, nome="pe"))
    pts = [(x * tam, z * tam + z_c) for x, z in contorno]
    yf = -0.06
    it.add(mb.extrudado(mb._ccw(pts), 0.018, y=yf, plano="xz", cor=cor_fundo, bisel=0.006, seg=2, nome="chapa"))
    it.add(adesivo(pts, yf - 0.002, est(png), esp=0.003, uvcaixa=(-tam / 2, z_c - tam / 2, tam / 2, z_c + tam / 2)))
    for dz in (-tam * 0.22, tam * 0.22):
        it.add(mb.caixa(0.1, 0.05, 0.04, y=-0.03, z=z_c + dz - 0.02, cor="cinza", bisel=0.01, nome="abracadeira"))
    it.colisao([((0, 0, 0), (0.14, 0.14, z_c + tam * 0.4))])


@peca("placa_pare", "Placa de PARE", "placa_transito", ["placa", "transito", "rua"])
def _(it):
    oct_ = [(0.5 / math.cos(math.radians(22.5)) * math.cos(math.radians(22.5 + 45 * k)),
             0.5 / math.cos(math.radians(22.5)) * math.sin(math.radians(22.5 + 45 * k))) for k in range(8)]
    placa(it, oct_, "placa_pare", 2.35, 0.62)


@peca("placa_preferencia", "Placa de Dê a preferência", "placa_transito", ["placa", "transito", "rua"])
def _(it):
    # o mesmo triângulo da estampa (ponta para baixo), na escala do quadrado unitário
    tri = [(-0.5, 0.5), (0.5, 0.5), (0.0, -0.5)]
    placa(it, tri, "placa_preferencia", 2.35, 0.7)


@peca("placa_faixa_pedestres", "Placa de passagem de pedestres", "placa_transito", ["placa", "transito", "rua"])
def _(it):
    los = [(0.0, 0.5), (-0.5, 0.0), (0.0, -0.5), (0.5, 0.0)]
    placa(it, los, "placa_pedestres", 2.4, 0.72)


@peca("placa_velocidade", "Placa de velocidade máxima 40 km/h", "placa_transito", ["placa", "transito", "rua"])
def _(it):
    placa(it, mb.circulo(0.5, seg=28), "placa_velocidade", 2.35, 0.6)


# ======================================================================================================================
# Pacote Cartoon City
# ======================================================================================================================
def do_pacote(it, nome):
    pc = cb.importa_cidade(nome)
    objs = list(pc.values())
    it.add(*objs)
    return objs


def separa_faces(ob, idxs, nome):
    """Tira as faces idxs de ob e devolve um objeto novo só com elas."""
    idxs = set(idxs)
    novo = mb.copia(ob, nome=nome)
    for o, manter in ((novo, True), (ob, False)):
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bm.faces.ensure_lookup_table()
        fora = [f for f in bm.faces if (f.index in idxs) != manter]
        bmesh.ops.delete(bm, geom=fora, context="FACES")
        bm.to_mesh(o.data)
        bm.free()
    return novo


def _uv_plano(ob, faces, mat, eixo_u, eixo_v):
    me = ob.data
    uv = me.uv_layers["UVMap"].data
    for fi in faces:
        p = me.polygons[fi]
        cos = [me.vertices[me.loops[li].vertex_index].co for li in p.loop_indices]
        us = [c.dot(eixo_u) for c in cos]
        vs = [c.dot(eixo_v) for c in cos]
        u0, u1, v0, v1 = min(us), max(us), min(vs), max(vs)
        p.material_index = mb._mat_idx(mat)
        for li, u, v in zip(p.loop_indices, us, vs):
            uv[li].uv = ((u - u0) / (u1 - u0), (v - v0) / (v1 - v0))


def semaforo_pacote(it, nome):
    """Semáforo do pacote com as luzes acesas (vermelho, amarelo, verde), a amarela dos carros e a vermelha do
    pedestre piscando, e a placa azul de travessia redesenhada."""
    ob = do_pacote(it, nome)[0]
    me = ob.data
    grupos = {}
    placa_ = []
    for p in me.polygons:
        mn = mb.MAT_NOMES[p.material_index]
        if mn == "luz":
            c, n = p.center, p.normal
            k = (round(c.x, 1), round(c.y, 1), round(n.x), round(n.y))
            grupos.setdefault(k, []).append(p.index)
        elif mn == "atlas":
            u = me.uv_layers["UVMap"].data[p.loop_indices[0]].uv
            i = int(u[0] * 16) + 16 * int((1 - u[1]) * 16)
            if mb.NOMES[i] == "magenta":
                placa_.append(p.index)
    amarelas, vermelhas_ped = [], []
    for k, fs in grupos.items():
        fs.sort(key=lambda i: me.polygons[i].center.z)
        if len(fs) == 3:  # carros: verde embaixo, amarela no meio, vermelha em cima
            mb.pinta(ob, None, [fs[0]], mat="neon")
            mb.pinta(ob, None, [fs[1]], mat="luz")
            mb.pinta(ob, None, [fs[2]], mat="luz_vermelha")
            amarelas.append(fs[1])
        elif len(fs) == 2:  # pedestre: verde embaixo, vermelha em cima
            mb.pinta(ob, None, [fs[0]], mat="neon")
            mb.pinta(ob, None, [fs[1]], mat="luz_vermelha")
            vermelhas_ped.append(fs[1])
    if placa_:
        _uv_plano(ob, placa_, est("placa_travessia"), V((1, 0, 0)), V((0, 0, 1)))
    if amarelas:
        am = separa_faces(ob, amarelas, "luz_amarela")
        it.anima(am, {"anima": "piscar", "periodo": 1.0}, "luz_amarela")
    if vermelhas_ped:
        vp = separa_faces(ob, vermelhas_ped, "pedestre_vermelho")
        it.anima(vp, {"anima": "piscar", "periodo": 0.8}, "pedestre_vermelho")
    return ob


@peca("traffic_light_001_pacote", "Semáforo de braço (pacote)", "semaforo_pacote", ["semaforo", "rua", "luz", "pacote",
                                                                                    "animado"], pacote=True)
def _(it):
    semaforo_pacote(it, "traffic_light_001")
    it.colisao([((0, 0, 0), (0.3, 0.3, 5.0))])


@peca("traffic_light_002_pacote", "Semáforo de braço com pedestre (pacote)", "semaforo_pacote",
      ["semaforo", "rua", "luz", "pacote", "animado"], pacote=True)
def _(it):
    semaforo_pacote(it, "traffic_light_002")
    it.colisao([((0, 0, 0), (0.3, 0.3, 5.0))])


@peca("traffic_light_003_pacote", "Semáforo de pedestre (pacote)", "semaforo_pacote",
      ["semaforo", "rua", "luz", "pacote", "animado"], pacote=True)
def _(it):
    semaforo_pacote(it, "traffic_light_003")
    it.colisao([((0, 0, 0), (0.24, 0.24, 3.6))])


@peca("spotlight_01_pacote", "Poste refletor (pacote)", "refletor_pacote", ["refletor", "luz", "rua", "pacote"],
      pacote=True)
def _(it):
    do_pacote(it, "Spotlight_01")
    it.colisao([((0, 0, 0), (0.4, 0.3, 7.8))])


@peca("spotlight_02_pacote", "Torre de refletores (pacote)", "refletor_pacote", ["refletor", "luz", "parque", "pacote"],
      pacote=True)
def _(it):
    do_pacote(it, "Spotlight_02")
    it.colisao([((0, 0, 0), (0.6, 0.6, 6.0))])


@peca("bus_stop_02_pacote", "Ponto de ônibus (pacote)", "ponto_onibus_pacote", ["ponto_onibus", "rua", "banco",
                                                                               "pacote"], pacote=True)
def _(it):
    objs = do_pacote(it, "Bus_Stop_02")
    # assentos: o tampo do banco é a face de cima mais larga entre 0,35 e 0,6 m
    tampo = [(o.matrix_world @ p.center, p.area) for o in objs for p in o.data.polygons
             if p.normal.z > 0.95 and 0.35 < (o.matrix_world @ p.center).z < 0.8]
    if tampo:
        zt = max(tampo, key=lambda t: t[1])[0].z
        pts = [o.matrix_world @ v.co for o in objs for v in o.data.vertices if abs((o.matrix_world @ v.co).z - zt) < 0.01]
        x0, x1 = min(p.x for p in pts), max(p.x for p in pts)
        y0, y1 = min(p.y for p in pts), max(p.y for p in pts)
        n = max(2, min(4, int((x1 - x0) / 0.9)))
        for k in range(n):
            it.assento(x0 + (x1 - x0) * (k + 0.5) / n, (y0 + y1) / 2, zt)
        it.banco_pacote = (x0, x1, y0, y1, zt)
    it.colisao([((0, 0.05, 0), (4.6, 0.3, 2.5)), ((0, -0.3, 0), (3.0, 0.5, 0.5))])


# ----------------------------------------------------------------------------------------------- pacote Apocalypse
APO = os.environ.get("CIDADE_APO", os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "ideias",
                                                "Apocalypse"))
APO_FBX = os.path.join(APO, "Apocalypse_Free_fbx", "Apocalypse_Free_fbx")
APO_TEX = os.path.join(APO, "textures", "textures")


def importa_apo(nome, textura="Color2.png", estampas=None, cores=None):
    """Importa uma peça do pacote Apocalypse (Props/ ou Environment/) como o cb.importa_cidade: a cor de cada face vem
    do atlas do pacote (textura) e vira a cor mais próxima da nossa paleta. estampas = {material: índice} mantém o UV
    original com uma estampa nossa; cores = {material: cor} pinta as faces daquele material de uma cor só."""
    estampas, cores = estampas or {}, cores or {}
    pasta = "Props" if os.path.exists(os.path.join(APO_FBX, "Props", nome + ".fbx")) else "Environment"
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=os.path.join(APO_FBX, pasta, nome + ".fbx"))
    novos = [o for o in bpy.data.objects if o not in antes]
    img = bpy.data.images.load(os.path.join(APO_TEX, textura) if os.path.dirname(textura) == "" else textura,
                               check_existing=True)
    W, Hh = img.size
    px = img.pixels[:]
    mb.materiais()
    out, cache = [], {}
    for o in novos:
        if o.type != "MESH":
            continue
        me = o.data.copy()
        me.transform(o.matrix_world)
        mats = [m.name.lower().split(".")[0] if m else "" for m in me.materials]
        bm = bmesh.new()
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
        uvl = bm.loops.layers.uv.active
        for fc in bm.faces:
            nm = mats[fc.material_index] if fc.material_index < len(mats) else ""
            if nm in estampas:
                fc.material_index = estampas[nm]
                continue
            if nm in cores:
                cor = cores[nm]
            else:
                us = [lo[uvl].uv for lo in fc.loops]
                u = sum(q[0] for q in us) / len(us)
                v = sum(q[1] for q in us) / len(us)
                k = (min(Hh - 1, max(0, int(v % 1 * Hh))) * W + min(W - 1, max(0, int(u % 1 * W)))) * 4
                rgb = tuple(round(c, 3) for c in px[k:k + 3])
                if rgb not in cache:
                    cache[rgb] = mb.cor_mais_proxima(rgb)
                cor = cache[rgb]
            uu = mb.uv_cor(cor)
            for lo in fc.loops:
                lo[uvl].uv = uu
            fc.material_index = 0
        if uvl.name != "UVMap":
            uvl.name = "UVMap"
        mesh = bpy.data.meshes.new(o.name)
        bm.to_mesh(mesh)
        bm.free()
        for n in mb.MAT_NOMES:
            mesh.materials.append(bpy.data.materials[n])
        mesh.shade_smooth()
        mesh.set_sharp_from_angle(angle=math.radians(40))
        ob = bpy.data.objects.new(o.name, mesh)
        bpy.context.scene.collection.objects.link(ob)
        out.append(ob)
    for o in novos:
        bpy.data.objects.remove(o)
    return out


def troca_cor(objs, de, para):
    """Repinta as faces de uma cor da paleta (de: conjunto de nomes) com outra (para)."""
    for o in objs:
        uv = o.data.uv_layers["UVMap"].data
        fs = []
        for p in o.data.polygons:
            if mb.MAT_NOMES[p.material_index] != "atlas":
                continue
            u = uv[p.loop_indices[0]].uv
            i = int(u[0] * 16) + 16 * int((1 - u[1]) * 16)
            if 0 <= i < len(mb.NOMES) and mb.NOMES[i] in de:
                fs.append(p.index)
        mb.pinta(o, para, fs)


@peca("churrasqueira_tambor_pacote", "Churrasqueira de tambor (pacote)", "churrasqueira_pacote",
      ["churrasqueira", "parque", "quintal", "pacote"], pacote=True)
def _(it):
    objs = importa_apo("Barbecue_Grill")
    # o tambor do pacote vem enferrujado: aqui ele fica pintado de vermelho, com a grelha de churrasco em cima
    troca_cor(objs, {"dormente", "marrom", "chocolate", "terra", "terra_escura", "couro", "madeira", "madeira_media",
                     "madeira_escura", "marrom_escuro", "marrom_claro", "nogueira", "caramelo"}, "vermelho_escuro")
    it.add(objs)
    lo, hi = mb.bbox(objs)
    zt = hi.z - 0.04
    it.add(mb.torno([(0.215, zt), (0.235, zt), (0.235, zt + 0.02), (0.215, zt + 0.02)], cor="metal_escuro", seg=20,
                    nome="aro_grelha"))
    for k in range(7):
        x = -0.18 + 0.06 * k
        meia = math.sqrt(max(0.0, 0.225 ** 2 - x * x))
        it.add(mb.cilindro(0.006, 2 * meia, eixo="y", x=x, z=zt + 0.012, cor="metal_escuro", seg=6, bisel=0,
                           nome="grelha"))
    it.add(mb.cilindro(0.2, 0.03, z=zt - 0.12, cor="carvao", seg=16, bisel=0.01, nome="carvao"))
    for k in range(5):
        a = math.radians(72 * k + 20)
        it.add(mb.cilindro(0.035, 0.03, x=0.1 * math.cos(a), y=0.1 * math.sin(a), z=zt - 0.1, cor="brasa", seg=6,
                           bisel=0.006, nome="brasa"))
    it.colisao([((0, 0, 0), (0.52, 0.52, 0.74))])


@peca("barricada_sucata_pacote", "Barricada de sucata e tábuas (pacote)", "barricada_pacote",
      ["barreira", "obra", "rua", "pacote"], pacote=True)
def _(it):
    it.add(importa_apo("Concrete_Fence"))
    it.colisao([((-0.13, -0.22, 0), (3.5, 1.5, 1.4))])


@peca("defensa_metalica_pacote", "Defensa metálica (guard-rail) (pacote)", "barreira_pacote",
      ["barreira", "obra", "rua", "evento", "pacote"], pacote=True)
def _(it):
    tex = os.path.join(os.path.dirname(APO), "Cute_Furniture", "textures", "textures", "Textures_4.png")
    it.add(importa_apo("Road_Barrier_01", textura=tex if os.path.exists(tex) else "Color2.png"))
    it.colisao([((0, -0.13, 0), (2.5, 0.3, 1.2))])


@peca("placa_escudo_pacote", "Placa de rua avulsa: Aeroporto (pacote)", "placa_escudo_pacote",
      ["placa", "transito", "rua", "pacote"], pacote=True)
def _(it):
    objs = importa_apo("Signs_Shield", estampas={"roadsigns": est("placa_aeroporto")},
                       cores={"licenseplates": "amarelo_claro"})
    it.add(objs)
    it.colisao([((0, -0.06, 0), (0.8, 0.18, 1.45))])


for _n, _r, _g, _t in (("Trash_02", "Lixeira amarela (pacote)", "lixeira_pacote", ["lixeira"]),
                       ("Trash_03", "Lixeira vermelha (pacote)", "lixeira_pacote", ["lixeira"]),
                       ("Trash_04", "Lixeira azul (pacote)", "lixeira_pacote", ["lixeira"]),
                       ("Trash_05", "Lixeira verde (pacote)", "lixeira_pacote", ["lixeira"]),
                       ("Trash_06", "Lixeiras de reciclagem (pacote)", "lixeira_reciclagem_pacote",
                        ["lixeira", "reciclagem"]),
                       ("Trash_Can_04", "Contêiner de lixo vermelho (pacote)", "conteiner_pacote", ["lixeira"]),
                       ("Trash_Can_05", "Contêiner de lixo laranja (pacote)", "conteiner_pacote", ["lixeira"]),
                       ("Trash_Can_06", "Contêiner redondo com tampa (pacote)", "conteiner_redondo_pacote",
                        ["lixeira"]),
                       ("Trash_Can_07", "Contêiner de lixo cinza (pacote)", "conteiner_pacote", ["lixeira"]),
                       ("Trash_Can_08", "Contêiner redondo de concreto (pacote)", "conteiner_redondo_pacote",
                        ["lixeira"])):
    def _f(it, _n=_n):
        do_pacote(it, _n)
    peca(_n.lower() + "_pacote", _r, _g, _t + ["rua", "pacote"], pacote=True)(_f)


# ======================================================================================================================
# Execução
# ======================================================================================================================
def main():
    global EST_DIR
    argv = sys.argv[sys.argv.index("--") + 1:]
    saida, filtro = argv[0], argv[1:]
    EST_DIR = os.path.join(saida, CAT, "estampas")
    desenha_estampas(EST_DIR)
    cat = mb.Catalogo(CAT, saida, rotulo="Mobiliário urbano")
    ids = [p[0] for p in P]
    assert len(ids) == len(set(ids)), "ids repetidos"
    for id_, rotulo, grupo, tags, pacote, f in P:
        if filtro and id_ not in filtro and grupo not in filtro:
            continue
        mb.limpa()
        it = ItemM(id_)
        f(it)
        bpy.context.view_layer.update()  # a matriz dos nós animados (origem no pivô) precisa estar em dia
        lo, _ = mb.bbox(it.partes + [o for o, _d in it.animados])
        if lo.z < -1e-4:  # nada abaixo do chão
            for o in it.partes:
                mb.transforma(o, loc=(0, 0, -lo.z))
            for o, _d in it.animados:
                o.location.z -= lo.z
            bpy.context.view_layer.update()
        extra = {"animacoes": it.lista_animacoes()} if it.animados else None
        e = cat.exporta(it, rotulo, grupo=grupo, tags=["mobiliario_urbano"] + tags, pacote=pacote, extra=extra)
        if extra:  # o pivô só fica certo depois de montado
            e["animacoes"] = it.lista_animacoes()
        if it.semcolisao:
            e["colisao"] = []
        cat.salva()
    validos = set(ids)
    cat.dados["itens"] = [x for x in cat.dados["itens"] if x["id"] in validos]
    cat.dados["itens"].sort(key=lambda x: ids.index(x["id"]))
    cat.salva()
    print("pecas", len(cat.dados["itens"]), flush=True)


if __name__ == "__main__":
    main()
