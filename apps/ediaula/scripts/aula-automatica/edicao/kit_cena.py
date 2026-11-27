"""O kit das cenas: as peças comuns a todo curso, desenhadas uma vez com capricho (REGRAS.md, seções 9 e 10).

Uma cena não redesenha rótulo, seta, anotação, destaque, selo de certo e errado ou "+1": usa estas peças, que já
saem no tamanho, na cor, no respiro e no movimento do kit. Assim a qualidade não depende de acertar cada cena.

- rotulo: a pílula com texto, na largura do texto medido com a fonte da cena. Texto começa com maiúscula (a peça
  recusa "coleta"); nome de variável ou de sprite vai no estilo "codigo", que pode começar em minúscula.
- linha / coluna: rótulos de um mesmo grupo, todos com a mesma largura, alinhados e com o mesmo espaço entre eles.
- seta: grossa, com contorno escuro, cresce da origem até o alvo.
- anel: o círculo amarelo que pulsa em volta do lugar (o "é aqui").
- anotacao: rótulo + seta + anel, o jeito de dizer "isto aqui é a ação" em cima de um vídeo, de um jogo ou de
  uma tela.
- foco: escurece tudo menos o retângulo que importa.
- selo: o certo (verde) e o errado (vermelho).
- mais_um: o "+1" que pula e sobe quando um número aumenta.
- cartao: um painel branco com sombra para agrupar figuras.
- encaixar: o bloco desliza até o lugar e assenta com um pulinho.

Tamanhos: "g" (48 px, rótulo principal), "m" (40 px, o padrão) e "p" (34 px, apoio). Nada abaixo de 30 px.
Estilos: "termo" (branco, texto escuro), "acao" (amarelo, texto escuro), "reacao" (verde, texto amarelo),
"escuro" (noite, texto branco), "aviso" (vermelho, texto branco) e "codigo" (noite, texto amarelo).
"""
import base64
import io
import math
from dataclasses import dataclass

from PIL import ImageFont

from edisvg_cena import AMARELO, BRANCO, NOITE, SUAVE, TINTA, VAIVEM, VERDE

VERMELHO = "#E5484D"
ESTILOS = {"termo": (BRANCO, TINTA), "acao": (AMARELO, TINTA), "reacao": (VERDE, AMARELO),
           "escuro": (NOITE, BRANCO), "aviso": (VERMELHO, BRANCO), "codigo": (NOITE, AMARELO)}
TAM = {"g": 48, "m": 40, "p": 34}
ALTURA = {"g": 108, "m": 92, "p": 78}
PAD = {"g": 44, "m": 38, "p": 30}
LARG_MIN = {"g": 220, "m": 180, "p": 140}
# A área livre da cena, à esquerda da apresentadora (x >= 1320 é dela), abaixo do título.
AREA = (96, 300, 1272, 1020)
CONTORNO = 5

_fontes = {}


@dataclass
class Peca:
    g: dict
    x0: float
    y0: float
    x1: float
    y1: float

    @property
    def cx(self):
        return (self.x0 + self.x1) / 2

    @property
    def cy(self):
        return (self.y0 + self.y1) / 2

    @property
    def w(self):
        return self.x1 - self.x0

    @property
    def h(self):
        return self.y1 - self.y0


def _fonte(c, familia, peso, tam):
    chave = (id(c.d), familia, peso, tam)
    if chave not in _fontes:
        a = next(a for a in c.d["assets"] if a["kind"] == "font" and a["name"] == f"{familia} {peso}")
        _fontes[chave] = ImageFont.truetype(io.BytesIO(base64.b64decode(a["data"])), tam)
    return _fontes[chave]


def medir(c, texto, tam, familia="Baloo 2", peso=800):
    """A largura do texto em px, com a fonte da cena."""
    return _fonte(c, familia, peso, tam).getlength(texto)


def linha_de_base(c, tam, familia="Baloo 2", peso=800):
    """Quanto a linha de base fica abaixo do meio para a letra parecer centrada na pílula (meia maiúscula)."""
    bb = _fonte(c, familia, peso, tam).getbbox("H", anchor="ls")
    return -bb[1] / 2


def _maiuscula(texto, estilo):
    letra = next((ch for ch in texto if ch.isalpha()), "")
    if letra and letra.islower() and estilo != "codigo":
        raise ValueError(f'rótulo "{texto}" começa com minúscula: escreva com maiúscula (REGRAS.md, seção 10), '
                         'ou use estilo="codigo" para nome de variável ou sprite')


def _mostra(c, g, t0, t1, entra):
    if entra == "pop":
        c.mostra(g, t0, t1, pop=True)
    elif entra == "sobe":
        c.mostra(g, t0, t1, sobe=24)
    else:
        c.mostra(g, t0, t1)


def rotulo(c, nome, texto, cx, cy, t0, t1=None, estilo="termo", tam="m", largura=None, entra="pop"):
    """A pílula com texto, centrada em (cx, cy). Devolve a Peca (caixa na tela)."""
    _maiuscula(texto, estilo)
    fill, cor = ESTILOS[estilo]
    fs, h = TAM[tam], ALTURA[tam]
    w = largura or max(LARG_MIN[tam], medir(c, texto, fs) + 2 * PAD[tam])
    filhos = [c.rect("sombra", -w / 2, -h / 2 + 8, w, h, NOITE, rx=h / 2, op=18),
              c.rect("fundo", -w / 2, -h / 2, w, h, fill, rx=h / 2),
              c.texto("texto", texto, 0, linha_de_base(c, fs), fs, cor, ancora="middle")]
    g = c.grupo(f"{'Código' if estilo == 'codigo' else 'Rótulo'} · {nome}", cx, cy, filhos)
    c.nos.append(g)
    _mostra(c, g, t0, t1, entra)
    return Peca(g, cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2)


def _itens(itens, estilo):
    return [(i, estilo) if isinstance(i, str) else i for i in itens]


def largura_comum(c, itens, tam="m", estilo="termo"):
    return max(max(LARG_MIN[tam], medir(c, t, TAM[tam]) + 2 * PAD[tam]) for t, _ in _itens(itens, estilo))


def linha(c, nome, itens, cx, cy, t0, t1=None, estilo="termo", tam="m", gap=48, passo=0.4):
    """Rótulos lado a lado, todos da mesma largura, centrados em cx. itens: textos ou (texto, estilo)."""
    itens = _itens(itens, estilo)
    w = largura_comum(c, itens, tam)
    total = len(itens) * w + (len(itens) - 1) * gap
    x = cx - total / 2 + w / 2
    pecas = []
    for k, (t, e) in enumerate(itens):
        pecas.append(rotulo(c, f"{nome} {k + 1}", t, x, cy, t0 + k * passo, t1, estilo=e, tam=tam, largura=w))
        x += w + gap
    return pecas


def coluna(c, nome, itens, cx, y0, t0, t1=None, estilo="termo", tam="m", gap=32, passo=0.4):
    """Rótulos um embaixo do outro, todos da mesma largura, a partir do topo y0."""
    itens = _itens(itens, estilo)
    w = largura_comum(c, itens, tam)
    h = ALTURA[tam]
    pecas = []
    for k, (t, e) in enumerate(itens):
        pecas.append(rotulo(c, f"{nome} {k + 1}", t, cx, y0 + h / 2 + k * (h + gap), t0 + k * passo, t1,
                            estilo=e, tam=tam, largura=w))
    return pecas


def seta(c, nome, de, para, t0, t1=None, cor=AMARELO, esp=18, cresce=0.45):
    """Seta grossa com contorno escuro, que cresce de `de` até a ponta em `para`."""
    (x0, y0), (x1, y1) = de, para
    L = math.hypot(x1 - x0, y1 - y0)
    hl, hw = esp * 2.4, esp * 3.0
    k = CONTORNO
    corpo = c.grupo("corpo", 0, 0, [
        c.rect("contorno", 0, -esp / 2 - k, max(1.0, L - hl + 4), esp + 2 * k, NOITE, rx=esp / 2 + k),
        c.rect("haste", 0, -esp / 2, max(1.0, L - hl + 4), esp, cor, rx=esp / 2)], op=100)
    ponta = c.grupo("ponta", L, 0, [
        c.poly("contorno", [(k * 1.6, 0), (-hl - k, -hw / 2 - k * 1.3), (-hl - k, hw / 2 + k * 1.3)], NOITE),
        c.poly("ponta", [(0, 0), (-hl, -hw / 2), (-hl, hw / 2)], cor)], op=100)
    g = c.grupo(f"Seta · {nome}", x0, y0, [corpo, ponta])
    g["transform"]["rotation"] = round(math.degrees(math.atan2(y1 - y0, x1 - x0)), 2)
    c.nos.append(g)
    c.mostra(g, t0, t1)
    c.trilha(corpo, "sx", [(t0, 0.02, SUAVE), (t0 + cresce, 1, None)])
    c.trilha(ponta, "x", [(t0, hl, SUAVE), (t0 + cresce, L, None)])
    return g


def anel(c, nome, x, y, r, t0, t1=None, cor=AMARELO, esp=10, pulsos=3):
    """O círculo que pulsa em volta do lugar: "é aqui"."""
    filhos = [c.rect("contorno", -r, -r, 2 * r, 2 * r, "none", rx=r, stroke=NOITE, sw=esp + 2 * CONTORNO, op=45),
              c.rect("anel", -r, -r, 2 * r, 2 * r, "none", rx=r, stroke=cor, sw=esp)]
    g = c.grupo(f"Anel · {nome}", x, y, filhos)
    c.nos.append(g)
    c.mostra(g, t0, t1)
    ch = [(t0, 0.6, SUAVE), (t0 + 0.3, 1.08, VAIVEM), (t0 + 0.45, 1.0, None)]
    t = t0 + 0.9
    for _ in range(pulsos - 1):
        if t1 and t + 0.6 > t1:
            break
        ch += [(t, 1.0, VAIVEM), (t + 0.3, 1.12, VAIVEM), (t + 0.6, 1.0, None)]
        t += 0.9
    c.trilha(g, "sx", ch)
    c.trilha(g, "sy", ch)
    return g


DIRECOES = {"cima": (0, -1), "baixo": (0, 1), "esquerda": (-1, 0), "direita": (1, 0),
            "cima-esquerda": (-0.75, -0.66), "cima-direita": (0.75, -0.66),
            "baixo-esquerda": (-0.75, 0.66), "baixo-direita": (0.75, 0.66)}


def _borda(p, para):
    """O ponto da borda da pílula p na direção de `para`."""
    dx, dy = para[0] - p.cx, para[1] - p.cy
    n = math.hypot(dx, dy) or 1
    dx, dy = dx / n, dy / n
    t = min((p.w / 2) / abs(dx) if dx else 1e9, (p.h / 2) / abs(dy) if dy else 1e9)
    return p.cx + dx * t, p.cy + dy * t


def anotacao(c, nome, texto, alvo, t0, t1=None, lado="cima", dist=230, estilo="acao", tam="m", anel_r=None,
             centro=None):
    """Rótulo a `dist` px do alvo, do `lado` escolhido, com a seta até o alvo e, com anel_r, o anel nele.
    centro=(x, y) põe o rótulo num lugar exato (para alinhar duas anotações pela mesma linha ou coluna).
    Devolve (rótulo, seta, anel)."""
    ux, uy = DIRECOES[lado]
    ax, ay = alvo
    cx, cy = centro or (ax + ux * dist, ay + uy * dist)
    rot = rotulo(c, nome, texto, cx, cy, t0, t1, estilo=estilo, tam=tam)
    de = _borda(rot, alvo)
    folga = (anel_r + 16) if anel_r else 20
    n = math.hypot(ax - de[0], ay - de[1]) or 1
    para = (ax - (ax - de[0]) / n * folga, ay - (ay - de[1]) / n * folga)
    de = (de[0] + (ax - de[0]) / n * 14, de[1] + (ay - de[1]) / n * 14)
    s = seta(c, nome, de, para, t0 + 0.15, t1)
    a = anel(c, nome, ax, ay, anel_r, t0 + 0.3, t1) if anel_r else None
    return rot, s, a


def foco(c, nome, x0, y0, x1, y1, t0, t1=None, op=62):
    """Escurece a cena toda menos o retângulo (x0, y0)-(x1, y1)."""
    filhos = [c.rect("cima", 0, 0, 1920, y0, NOITE), c.rect("baixo", 0, y1, 1920, 1080 - y1, NOITE),
              c.rect("esquerda", 0, y0, x0, y1 - y0, NOITE), c.rect("direita", x1, y0, 1920 - x1, y1 - y0, NOITE)]
    g = c.grupo(f"Foco · {nome}", 0, 0, filhos)
    c.nos.append(g)
    ch = [(t0, 0, None), (t0 + 0.35, op, None)]
    if t1:
        ch += [(t1 - 0.3, op, None), (t1, 0, None)]
    c.trilha(g, "opacity", ch)
    return g


def selo(c, nome, x, y, t0, t1=None, ok=True, r=46):
    """O certo (círculo verde com o visto) ou o errado (vermelho com o xis), com borda branca."""
    s = r / 46
    filhos = [c.rect("sombra", -r, -r + 6, 2 * r, 2 * r, NOITE, rx=r, op=20),
              c.rect("fundo", -r, -r, 2 * r, 2 * r, VERDE if ok else VERMELHO, rx=r, stroke=BRANCO, sw=6)]
    if ok:
        pts = [(-22, 2), (-8, 16), (22, -14), (14, -22), (-8, 0), (-14, -6)]
        filhos.append(c.poly("visto", [(round(px * s, 1), round(py * s, 1)) for px, py in pts], BRANCO))
    else:
        for ang in (45, -45):
            barra = c.rect("xis", -22 * s, -5 * s, 44 * s, 10 * s, BRANCO, rx=5 * s)
            barra["transform"]["rotation"] = ang
            filhos.append(barra)
    g = c.grupo(f"Selo · {nome}", x, y, filhos)
    c.nos.append(g)
    c.mostra(g, t0, t1, pop=True)
    return g


def mais_um(c, nome, x, y, t, texto="+1", r=58, sobe=60):
    """O "+1" que pula e sobe quando um número aumenta, e some em 1,2 s."""
    filhos = [c.rect("fundo", -r, -r, 2 * r, 2 * r, VERDE, rx=r, stroke=BRANCO, sw=6),
              c.texto("texto", texto, 0, linha_de_base(c, 56), 56, AMARELO, ancora="middle")]
    g = c.grupo(f"Mais um · {nome}", x, y, filhos)
    c.nos.append(g)
    c.trilha(g, "opacity", [(t - 0.01, 0, None), (t, 100, None), (t + 0.9, 100, None), (t + 1.2, 0, None)])
    c.trilha(g, "y", [(t, y, SUAVE), (t + 1.2, y - sobe, None)])
    for p in ("sx", "sy"):
        c.trilha(g, p, [(t, 0.5, SUAVE), (t + 0.25, 1.15, VAIVEM), (t + 0.45, 1.0, None)])
    return g


def cartao(c, nome, x0, y0, x1, y1, t0, t1=None, fill=BRANCO, rx=36):
    """Um painel com sombra para agrupar figuras (as figuras vão em cima, como nós seguintes)."""
    filhos = [c.rect("sombra", 0, 10, x1 - x0, y1 - y0, NOITE, rx=rx, op=18),
              c.rect("fundo", 0, 0, x1 - x0, y1 - y0, fill, rx=rx)]
    g = c.grupo(f"Cartão · {nome}", x0, y0, filhos)
    c.nos.append(g)
    c.mostra(g, t0, t1, sobe=20)
    return Peca(g, x0, y0, x1, y1)


def encaixar(c, g, de, para, t, dur=0.6):
    """O grupo (um bloco) desliza de `de` até `para` e assenta com um pulinho em t + dur."""
    c.trilha(g, "x", [(t, de[0], SUAVE), (t + dur, para[0], None)])
    c.trilha(g, "y", [(t, de[1], SUAVE), (t + dur, para[1] - 10, VAIVEM), (t + dur + 0.15, para[1], None)])
    g["transform"]["x"], g["transform"]["y"] = para
