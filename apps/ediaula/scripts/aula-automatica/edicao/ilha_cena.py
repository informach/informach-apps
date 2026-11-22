"""Peças das cenas da Ilha do Farol (jogo 3D) para o edisvg_cena: imagens transparentes dos modelos do curso,
renderizadas com exemplos/ilha-render-modelos.py, e o aventureiro que anda.

As medidas são as dos renders (alfa > 128): o aventureiro (600 x 800) tem os pés em y 645 e o meio em x 299;
o farol listrado (520 x 1000), a base em y 887 e o meio em x 260; as pedras (800 x 600), a base em y 505 e o
meio em x 400; o Zappy (zappy.png, 520 x 530, de packages/community-kids/public/ilustra/zappy-final.webp),
a base em y 484 e o meio em x 270.

Da Aula 2: a chave dourada (chave.png, 600 x 600, na mesma medida por pixel do aventureiro-parado) tem a base em
y 458 e o meio em x 302; de cima (600 x 600, a mesma medida por pixel nas duas), o aventureiro tem o meio em
(299, 290) e a chave, em pé, vira uma barra com o meio em (302, 300). Nas vistas de cima, "pe" é o meio da figura.
"""

import math

from edisvg_cena import AMARELO, BRANCO, NOITE, SUAVE, TINTA, VAIVEM, nid, tf

PE = {"aventureiro": (299, 645), "farol-listrado": (260, 887), "pedras": (400, 505), "zappy": (270, 484),
      "chave": (302, 458), "aventureiro-de-cima": (299, 290), "chave-de-cima": (302, 300)}


def figura(c, arq, op=100):
    """Imagem transparente no tamanho do PNG (sem cartão), para ir dentro de um grupo escalado."""
    aid, w, h = c.imagem(arq)
    return {"id": nid(), "name": arq, "tag": "image", "assetId": aid,
            "attrs": {"x": "0", "y": "0", "width": str(w), "height": str(h)},
            "text": "", "children": [], "transform": tf(op=op), "visible": True, "locked": False}


def pe_do_png(c, arq):
    """O pé de uma arte sem medida em PE: o meio da base da parte visível (alfa > 128) do PNG. Serve para os
    renders da Aula 3 (ilha-render-aula3.py) e as miniaturas dos cenários (opacas: a base da imagem)."""
    from PIL import Image

    im = Image.open(f"{c.blocos}/{arq}.png").convert("RGBA")
    caixa = im.getchannel("A").point(lambda a: 255 if a > 128 else 0).getbbox() or (0, 0, im.width, im.height)
    return (caixa[0] + caixa[2]) // 2, caixa[3]


def no_chao(c, nome, arq, px, py, s, op=0, pe=None):
    """Um modelo com a base em (px, py) e escala s, num grupo (opacidade inicial op)."""
    bx, by = pe or PE.get(arq) or pe_do_png(c, arq)
    g = c.grupo(nome, px - bx * s, py - by * s, [figura(c, arq)], op=op, s=s)
    c.nos.append(g)
    return g


def mover(c, g, arq, t0, de, t1, para, easing=None, pe=None):
    """Leva o grupo de no_chao de (px, py, s) em t0 para (px, py, s) em t1, com a base no lugar."""
    bx, by = pe or PE.get(arq) or pe_do_png(c, arq)
    for prop, a, b in (("x", de[0] - bx * de[2], para[0] - bx * para[2]),
                       ("y", de[1] - by * de[2], para[1] - by * para[2]), ("sx", de[2], para[2]), ("sy", de[2], para[2])):
        c.trilha(g, prop, [(t0, a, None), (t1, b, easing)])


def percurso(c, g, arq, pontos, pe=None):
    """Vários movimentos do grupo de no_chao numa trilha só por propriedade (o EdiSVG aceita uma por nó):
    pontos = [(t, (px, py, s), easing), ...], a base no lugar em cada um. Para um pop junto, ponha os pontos
    da escala aqui também, e não use mostra(pop=True) no mesmo grupo."""
    bx, by = pe or PE.get(arq) or pe_do_png(c, arq)
    for prop in ("x", "y", "sx", "sy"):
        chaves = []
        for t, (px, py, s), easing in pontos:
            v = {"x": px - bx * s, "y": py - by * s, "sx": s, "sy": s}[prop]
            chaves.append((t, v, easing))
        c.trilha(g, prop, chaves)


def pop(t0, px, py, s):
    """Os pontos de um pop com a base no lugar, para o começo de um percurso."""
    return [(t0, (px, py, 0.7 * s), SUAVE), (t0 + 0.28, (px, py, 1.05 * s), VAIVEM), (t0 + 0.42, (px, py, s), None)]


class Personagem:
    """O aventureiro: um grupo com o parado e os quatro quadros do passo. A posição é a dos pés."""

    def __init__(self, c, nome):
        self.c = c
        self.parado = figura(c, "aventureiro-parado")
        self.passo = [figura(c, f"aventureiro-andando-{k}", op=0) for k in range(1, 5)]
        self.g = c.grupo(nome, 0, 0, [self.parado, *self.passo])
        self.chaves = {"x": [], "y": [], "sx": [], "sy": []}
        self.vis = {n["id"]: [] for n in [self.parado, *self.passo]}
        c.nos.append(self.g)

    def em(self, t, px, py, s, easing=None):
        """Pés em (px, py) com escala s no instante t."""
        x0, y0 = PE["aventureiro"]
        for prop, v in (("x", px - x0 * s), ("y", py - y0 * s), ("sx", s), ("sy", s)):
            self.chaves[prop].append((t, v, easing))

    def anda(self, t0, t1, de, para, passo=0.11):
        """Anda de (px, py, s) em t0 até (px, py, s) em t1, trocando os quadros do passo."""
        self.em(t0, *de, None)
        self.em(t1, *para, None)
        ids = [self.parado["id"]] + [p["id"] for p in self.passo]
        self.vis[ids[0]] += [(t0 - 0.034, 100), (t0, 0), (t1, 0), (t1 + 0.034, 100)]
        k, t = 0, t0
        while t < t1:
            atual = ids[1 + k % 4]
            fim = min(t + passo, t1)
            self.vis[atual] += [(t - 0.001 if t > t0 else t, 0), (t + 0.001, 100), (fim - 0.001, 100), (fim, 0)]
            k, t = k + 1, fim

    def fechar(self):
        for prop, ch in self.chaves.items():
            if ch:
                self.c.trilha(self.g, prop, ch)
        for no in [self.parado, *self.passo]:
            ch = self.vis[no["id"]]
            if ch:
                self.c.trilha(no, "opacity", [(t, v, None) for t, v in ch])


def chao(c, t0, t1=None, cor="#F3D9A0", borda="#E2BF7A"):
    """O chão de areia em perspectiva (estreito no fundo, largo na frente), à esquerda da faixa da apresentadora."""
    no = c.poly("Chão em perspectiva", [(380, 430), (950, 430), (1250, 1040), (80, 1040)], cor)
    no["attrs"].update({"stroke": borda, "stroke-width": "6", "stroke-linejoin": "round"})
    no["transform"] = tf(op=0)
    c.nos.append(no)
    c.mostra(no, t0, t1)
    return no


# Desenhos simples (câmera, olho, balão de pensamento), das cenas das Partes 3 e 4 da Aula 1.
def circulo(c, nome, cx, cy, r, cor, borda=None, sw=0, op=100):
    return c.rect(nome, cx - r, cy - r, 2 * r, 2 * r, cor, rx=r, stroke=borda, sw=sw, op=op)


def olho(c, nome, x, y, op=0, s=1):
    """Um olho grande (branco, íris escura, brilho)."""
    filhos = [c.rect("branco", -70, -46, 140, 92, BRANCO, rx=46, stroke=NOITE, sw=6),
              circulo(c, "íris", 0, 0, 30, NOITE), circulo(c, "brilho", 10, -10, 9, BRANCO)]
    g = c.grupo(nome, x, y, filhos, op=op, s=s)
    c.nos.append(g)
    return g


def camera(c, nome, x, y, op=0):
    """Uma câmera de desenho: corpo escuro, lente branca e o botão em cima."""
    filhos = [c.rect("botão", -56, -78, 44, 22, NOITE, rx=8),
              c.rect("corpo", -90, -60, 180, 120, NOITE, rx=26),
              circulo(c, "lente", 0, 0, 40, BRANCO, borda=AMARELO, sw=8), circulo(c, "vidro", 0, 0, 20, "#1B5CF3")]
    g = c.grupo(nome, x, y, filhos, op=op)
    c.nos.append(g)
    return g


def balao_pensa(c, nome, x, y, texto, op=0):
    filhos = [circulo(c, "bolinha 1", -70, 70, 12, BRANCO), circulo(c, "bolinha 2", -44, 44, 18, BRANCO),
              c.rect("balão", -10, -60, 150, 110, BRANCO, rx=55), c.texto("marca", texto, 65, 22, 80, TINTA, ancora="middle")]
    g = c.grupo(nome, x, y, filhos, op=op)
    c.nos.append(g)
    return g


SETAS = {"dir": [(-18, -20), (20, 0), (-18, 20)], "esq": [(18, -20), (-20, 0), (18, 20)],
         "cima": [(-20, 18), (0, -20), (20, 18)], "baixo": [(-20, -18), (0, 20), (20, -18)]}


def tecla(c, nome, cx, cy, rotulo=None, seta=None, op=0, s=1, cor=None):
    """Uma tecla do teclado, desenhada: quadrado escuro com uma letra (rotulo) ou uma seta (dir, esq, cima,
    baixo). A fonte não tem o caractere de seta, por isso a seta é um triângulo."""
    filhos = [c.rect("tecla", -48, -44, 96, 88, cor or NOITE, rx=18)]
    if seta:
        filhos.append(c.poly("seta", SETAS[seta], BRANCO))
    if rotulo:
        filhos.append(c.texto("letra", rotulo, 0, 20, 56, BRANCO, ancora="middle"))
    g = c.grupo(nome, cx, cy, filhos, op=op, s=s)
    c.nos.append(g)
    return g


def aperta(c, g, tempos, s=1):
    """A tecla afunda e volta em cada toque (tempos: um segundo ou uma lista; uma trilha só por propriedade)."""
    tempos = [tempos] if isinstance(tempos, (int, float)) else list(tempos)
    chaves = []
    for t in tempos:
        chaves += [(t - 0.05, s, None), (t + 0.06, s * 0.82, None), (t + 0.22, s, None)]
    for p in ("sx", "sy"):
        c.trilha(g, p, chaves)


def estrela(c, nome, cx, cy, r, cor=AMARELO, op=0):
    """Uma estrela de cinco pontas (o toque, o acerto)."""
    pts = []
    for k in range(10):
        a = -math.pi / 2 + k * math.pi / 5
        rr = r if k % 2 == 0 else r * 0.45
        pts.append((round(rr * math.cos(a), 1), round(rr * math.sin(a), 1)))
    g = c.grupo(nome, cx, cy, [c.poly("estrela", pts, cor)], op=op)
    c.nos.append(g)
    return g


PELE, PELE_BORDA = "#F6C9A0", "#D99A6C"


def mao(c, nome, cx, cy, espelho=False, op=0, s=1):
    """Uma mão aberta de desenho, de lado, com os dedos para cima e a palma virada para o meio (espelho: a
    mão da direita)."""
    k = -1 if espelho else 1
    filhos = [c.rect("palma", -60, -40, 120, 150, PELE, rx=50, stroke=PELE_BORDA, sw=5)]
    for j, (dx, alto) in enumerate(((-42, 120), (-14, 140), (14, 134), (42, 112))):
        filhos.append(c.rect(f"dedo {j + 1}", k * dx - 13, -40 - alto + 30, 26, alto, PELE, rx=13, stroke=PELE_BORDA, sw=5))
    filhos.append(c.rect("polegar", k * 50 - 15 if k > 0 else k * 50 - 15, 0, 30, 90, PELE, rx=15, stroke=PELE_BORDA, sw=5))
    g = c.grupo(nome, cx, cy, filhos, op=op, s=s)
    c.nos.append(g)
    return g


LARANJA_VARIAVEL = "#E8893A"  # a cor da categoria Variáveis no Estúdio


def variavel(c, nome, rotulo, cx, cy, valores, w=420, t0=None, t1=None):
    """Uma variável desenhada: uma caixa com o nome numa aba laranja e o valor dentro. valores = [(t, texto,
    cor do texto), ...]: cada valor entra no seu tempo e sai quando entra o seguinte. Devolve o grupo da caixa
    (sem os valores, que são nós próprios)."""
    h = 150
    filhos = [c.rect("aba", -w / 2, -h / 2 - 66, min(w, 40 + 30 * len(rotulo)), 80, LARANJA_VARIAVEL, rx=22),
              c.texto("nome", rotulo, -w / 2 + 22, -h / 2 - 12, 44, BRANCO),
              c.rect("caixa", -w / 2, -h / 2, w, h, BRANCO, rx=30, stroke=LARANJA_VARIAVEL, sw=10)]
    g = c.grupo(nome, cx, cy, filhos)
    c.nos.append(g)
    if t0 is not None:
        c.mostra(g, t0, t1, pop=True)
    for k, (t, texto, cor) in enumerate(valores):
        fim = valores[k + 1][0] if k + 1 < len(valores) else t1
        v = c.texto(f"{nome} · valor {k + 1}", texto, cx, cy + 22, 64, cor, ancora="middle", op=0)
        c.nos.append(v)
        c.mostra(v, t, fim, pop=True)
    return g
