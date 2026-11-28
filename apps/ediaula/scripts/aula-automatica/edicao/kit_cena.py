"""O kit das cenas: as peças comuns a todo curso, desenhadas uma vez com capricho (REGRAS.md, seções 9 e 10).

Uma cena não redesenha rótulo, seta, anotação, destaque, selo de certo e errado ou "+1": usa estas peças, que já
saem no tamanho, na cor, no respiro e no movimento do kit. Assim a qualidade não depende de acertar cada cena.

- rotulo: a pílula com texto, na largura do texto medido com a fonte da cena. Texto começa com maiúscula (a peça
  recusa "coleta"); nome de variável ou de sprite vai no estilo "codigo", que pode começar em minúscula.
- linha / coluna: rótulos de um mesmo grupo, todos com a mesma largura, alinhados e com o mesmo espaço entre eles.
- seta: amarela, grossa, de pontas redondas, com o degrau do Zero Kids embaixo; cresce da origem até o alvo.
- anel: o círculo amarelo que pulsa em volta de uma coisa redonda do jogo (o "é aqui").
- moldura: o retângulo amarelo de um espaço retangular (o vazio do bloco, um botão), cobrindo o espaço inteiro.
- anotacao: rótulo + seta + anel, o jeito de dizer "isto aqui é a ação" em cima de um vídeo, de um jogo ou de
  uma tela.
- foco: escurece tudo menos o retângulo que importa.
- selo: o certo (verde) e o errado (vermelho).
- mais_um: o "+1" que pula e sobe quando um número aumenta.
- cartao: um painel branco com sombra para agrupar figuras.
- encaixar: o bloco desliza até o lugar e assenta com um pulinho.

Tamanhos: "g" (48 px, rótulo principal), "m" (40 px, o padrão) e "p" (34 px, apoio). Nada abaixo de 30 px.
Estilos: "termo" (branco, texto escuro), "acao" (amarelo, texto escuro), "reacao" (verde, texto branco: o amarelo no verde dava só 3,3 de contraste),
"escuro" (noite, texto branco), "aviso" (vermelho, texto branco) e "codigo" (noite, texto amarelo).
"""
import base64
import io
import math
from dataclasses import dataclass

from PIL import ImageFont

from edisvg_cena import AMARELO, BRANCO, NOITE, SUAVE, TINTA, VAIVEM, VERDE, nid, tf

VERMELHO = "#E5484D"
ESTILOS = {"termo": (BRANCO, TINTA), "acao": (AMARELO, TINTA), "reacao": (VERDE, BRANCO),
           "escuro": (NOITE, BRANCO), "aviso": (VERMELHO, BRANCO), "codigo": (NOITE, AMARELO)}
TAM = {"g": 48, "m": 40, "p": 34}
ALTURA = {"g": 108, "m": 92, "p": 78}
PAD = {"g": 44, "m": 38, "p": 30}
LARG_MIN = {"g": 220, "m": 180, "p": 140}
# A área livre da cena, à esquerda da apresentadora (x >= 1320 é dela), abaixo do título.
AREA = (96, 300, 1272, 1020)

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


AMARELO_DEGRAU = "#C98F00"


def seta(c, nome, de, para, t0, t1=None, cor=AMARELO, esp=18, cresce=0.45):
    """Seta amarela grossa, de pontas redondas, com o degrau do Zero Kids embaixo (o mesmo desenho em amarelo
    escuro, 5 px abaixo). Sem contorno preto: ficava pesado (Helena, 27/11/2026). Cresce de `de` até `para`."""
    (x0, y0), (x1, y1) = de, para
    L = math.hypot(x1 - x0, y1 - y0)
    hl, hw = esp * 2.6, esp * 3.0
    r = esp * 0.18  # arredonda as pontas da cabeça

    def desenho(nome_, cor_, dy):
        corpo = c.grupo("corpo", 0, dy, [c.rect("haste", 0, -esp / 2, max(1.0, L - hl + 4), esp, cor_, rx=esp / 2)], op=100)
        ponta = c.grupo("ponta", L, dy, [c.poly("ponta", [(0, 0), (-hl, -hw / 2 + r), (-hl + r, -hw / 2),
                                                         (-hl + r, hw / 2), (-hl, hw / 2 - r)], cor_)], op=100)
        return c.grupo(nome_, 0, 0, [corpo, ponta], op=100), corpo, ponta

    degrau, c_d, p_d = desenho("degrau", AMARELO_DEGRAU, 5)
    frente, c_f, p_f = desenho("frente", cor, 0)
    g = c.grupo(f"Seta · {nome}", x0, y0, [degrau, frente])
    g["transform"]["rotation"] = round(math.degrees(math.atan2(y1 - y0, x1 - x0)), 2)
    c.nos.append(g)
    c.mostra(g, t0, t1)
    for corpo, ponta in ((c_d, p_d), (c_f, p_f)):
        c.trilha(corpo, "sx", [(t0, 0.02, SUAVE), (t0 + cresce, 1, None)])
        c.trilha(ponta, "x", [(t0, hl, SUAVE), (t0 + cresce, L, None)])
    return g


def anel(c, nome, x, y, r, t0, t1=None, cor=AMARELO, esp=10, pulsos=3):
    """O círculo que pulsa em volta de uma coisa redonda do jogo (um esconderijo, um personagem): "é aqui".
    Espaço de bloco ou botão retangular usa a moldura."""
    filhos = [c.rect("degrau", -r, -r + 5, 2 * r, 2 * r, "none", rx=r, stroke=AMARELO_DEGRAU, sw=esp),
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


def moldura(c, nome, x0, y0, x1, y1, t0, t1=None, cor=AMARELO, esp=7, rx=14, piscadas=3):
    """O retângulo amarelo que marca um espaço retangular: o vazio ao lado de "fazer" num bloco, um botão do
    Estúdio, um número. Cobre o espaço inteiro (Helena, 27/11/2026: o anel no bloco ficava estranho)."""
    w, h = x1 - x0, y1 - y0
    filhos = [c.rect("degrau", 0, 5, w, h, "none", rx=rx, stroke=AMARELO_DEGRAU, sw=esp),
              c.rect("moldura", 0, 0, w, h, "none", rx=rx, stroke=cor, sw=esp)]
    g = c.grupo(f"Moldura · {nome}", x0, y0, filhos)
    c.nos.append(g)
    c.pisca(g, t0, t1 or (t0 + 0.5 + piscadas * 0.5 + 0.3), vezes=piscadas)
    return Peca(g, x0, y0, x1, y1)


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
             centro=None, largura=None):
    """Rótulo a `dist` px do alvo, do `lado` escolhido, com a seta até o alvo e, com anel_r, o anel nele.
    centro=(x, y) põe o rótulo num lugar exato (para alinhar duas anotações pela mesma linha ou coluna).
    Devolve (rótulo, seta, anel)."""
    ux, uy = DIRECOES[lado]
    ax, ay = alvo
    cx, cy = centro or (ax + ux * dist, ay + uy * dist)
    rot = rotulo(c, nome, texto, cx, cy, t0, t1, estilo=estilo, tam=tam, largura=largura)
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
              c.texto("texto", texto, 0, linha_de_base(c, 56), 56, BRANCO, ancora="middle")]
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


# ── Peças aprovadas no canvas do kit (27/11/2026): título solto, Zappy com balão, cartão, raios, trilha, ícones ──


# O marca-texto (Helena, 27/11/2026): a caixa amarela e a palavra dentro dela inclinadas juntas, na mesma
# inclinação, girando em torno do meio da palavra (girar em torno do começo do título subia a caixa das palavras
# mais à direita e a tirava da linha). A caixa abraça só as letras, com respiro, e nunca encosta na linha de cima
# nem na de baixo: o entrelinha de quem empilha linhas com marca-texto é ENTRELINHA_MARCA vezes o tamanho.
INCLINA_MARCA = -2
ENTRELINHA_MARCA = 1.3


def caixa_marca(c, tam, familia="Baloo 2", peso=800):
    """(topo, base) da caixa do marca-texto em relação à linha de base: as letras de verdade (maiúscula com acento
    e perna do g) mais um respiro de 10% do tamanho em cima e embaixo."""
    f = _fonte(c, familia, peso, round(tam))
    bb = f.getbbox("ÁgHy", anchor="ls")
    return bb[1] - tam * 0.1, bb[3] + tam * 0.1


def marca_texto(c, texto, x, y, tam, nome="Título · marca", cor=TINTA, inclina=INCLINA_MARCA):
    """A palavra no marca-texto, com a linha de base em y e o começo da caixa em x. A caixa, o degrau e o texto
    são um grupo só, girado em volta do meio da caixa. Devolve (grupo, largura da caixa)."""
    w = medir(c, texto, tam)
    pad = tam * 0.16
    topo, base = caixa_marca(c, tam)
    W, H = w + 2 * pad, base - topo
    mx, my = x + W / 2, y + (topo + base) / 2
    rx = min(tam * 0.18, H / 2)
    filhos = [c.rect("degrau", -W / 2, -H / 2 + 6, W, H, AMARELO_DEGRAU, rx=rx),
              c.rect("marca", -W / 2, -H / 2, W, H, AMARELO, rx=rx),
              c.texto("texto", texto, -W / 2 + pad, y - my, tam, cor)]
    g = c.grupo(nome, mx, my, filhos, op=100)
    g["transform"]["rotation"] = inclina
    return g, W


def titulo(c, partes, t0, t1, sub=None, t_sub=None, tam=92, x=96, y=148):
    """O título solto (sem a pílula): branco com degrau de sombra, e as palavras-chave em tinta escura num
    marca-texto amarelo levemente inclinado (a caixa e a palavra juntas). partes: [("A ", False), ("ação", True),
    ...]. sub: o subtítulo, abaixo do marca-texto com respiro."""
    if c.pilula in c.nos:
        c.nos.remove(c.pilula)
        c.trilhas = [t for t in c.trilhas if t["targetId"] != c.pilula["id"]]
    filhos, cx = [], 0.0
    for texto, marca in partes:
        if marca:
            g, W = marca_texto(c, texto, cx, 0, tam)
            filhos.append(g)
            cx += W + tam * 0.06
        else:
            w = medir(c, texto, tam)
            filhos += [c.texto("sombra", texto, cx, 6, tam, "#0A1432", op=30), c.texto("texto", texto, cx, 0, tam, BRANCO)]
            cx += w
    g = c.grupo("Título", x, y, filhos)
    c.nos.append(g)
    c.mostra(g, t0, t1, sobe=12)
    if sub:
        # O subtítulo começa abaixo da caixa do marca-texto (com a inclinação) mais 24 px de respiro.
        desce = caixa_marca(c, tam)[1] + 24 + 42 * 0.75
        s = c.texto("Subtítulo", sub, x + 4, y + max(82, desce), 42, BRANCO, familia="Nunito", peso=700, op=0)
        c.nos.append(s)
        c.mostra(s, t_sub or t0, t1, sobe=10)
    return g


def _q(p0, p1, p2, n=6):
    return [((1 - u) ** 2 * p0[0] + 2 * (1 - u) * u * p1[0] + u * u * p2[0],
             (1 - u) ** 2 * p0[1] + 2 * (1 - u) * u * p1[1] + u * u * p2[1]) for u in (k / n for k in range(1, n + 1))]


def _cb(p0, p1, p2, p3, n=10):
    return [((1 - u) ** 3 * p0[0] + 3 * (1 - u) ** 2 * u * p1[0] + 3 * (1 - u) * u * u * p2[0] + u ** 3 * p3[0],
             (1 - u) ** 3 * p0[1] + 3 * (1 - u) ** 2 * u * p1[1] + 3 * (1 - u) * u * u * p2[1] + u ** 3 * p3[1])
            for u in (k / n for k in range(1, n + 1))]


def _contorno_balao(w, h, along=0.16, curta=38, base=26, inclina=-22, r=30):
    """O balão do EdiAula (shared/annotation.ts balloonPath), com a ponta curva e inclinada aprovada no canvas, como
    polígono em volta de (0, 0) = canto de cima à esquerda do corpo. Devolve (pontos, ponta)."""
    r = min(r, w / 4, h / 4)
    tx, ty = w * along, h + curta
    bx = tx - inclina
    pts = [(r, 0), (w - r, 0)] + _q((w - r, 0), (w, 0), (w, r)) + [(w, h - r)] + _q((w, h - r), (w, h), (w - r, h))
    pts += [(bx + base + 10, h)]
    pts += _cb((bx + base + 10, h), (bx + base * 0.55, h), (tx + inclina * 0.15 + 6, ty - curta * 0.45), (tx, ty))
    pts += _cb((tx, ty), (tx - 2, ty - curta * 0.55), (bx - base * 0.7, h + 2), (bx - base - 6, h))
    pts += [(r, h)] + _q((r, h), (0, h), (0, h - r)) + [(0, r)] + _q((0, r), (0, 0), (r, 0))
    return [(round(x, 1), round(y, 1)) for x, y in pts], (tx, ty)


def balao_fala(c, nome, texto, ponta, t0, t1=None, tam=40, maxw=380, fill=BRANCO, cor=TINTA, along=0.16):
    """O balão de fala do EdiAula, corpo e ponta numa peça só (nunca um triângulo à parte), posto para a ponta cair
    em `ponta` (a cabeça do personagem). Entra inteiro com um pulinho a partir da ponta."""
    _maiuscula(texto, "termo")
    f = _fonte(c, "Nunito", 800, tam)
    linhas, atual = [], ""
    for pal in texto.split():
        tt = (atual + " " + pal).strip()
        if f.getlength(tt) <= maxw or not atual:
            atual = tt
        else:
            linhas.append(atual)
            atual = pal
    linhas.append(atual)
    larg = max(f.getlength(lin) for lin in linhas)
    lh = round(tam * 1.2)
    w, h = round(larg + 60), round(len(linhas) * lh + 40)
    pts, (tx, ty) = _contorno_balao(w, h, along=along)
    sombra = c.poly("sombra", [(x - tx, y - ty + 5) for x, y in pts], "#0A1432")
    sombra["transform"]["opacity"] = 22
    filhos = [sombra, c.poly("fundo", [(x - tx, y - ty) for x, y in pts], fill)]
    base = linha_de_base(c, tam, "Nunito", 800)
    for k, lin in enumerate(linhas):
        filhos.append(c.texto("texto", lin, w / 2 - tx, 20 + lh * (k + 0.5) + base - ty, tam, cor,
                              familia="Nunito", ancora="middle"))
    g = c.grupo(f"Balão · {nome}", ponta[0], ponta[1], filhos)
    c.nos.append(g)
    c.mostra(g, t0, t1, pop=True)
    return g


# Onde fica o lado de cima da cabeça, em fração do PNG recortado: a ponta do balão cai aí, sem cobrir a antena.
ZAPPY_CABECA = {"zappy-falando": (0.8, 0.3), "zappy-pensando": (0.8, 0.28), "zappy-celebrando": (0.82, 0.3),
                "zappy-saudacao": (0.82, 0.3), "zappy-alivio": (0.8, 0.3)}


def zappy(c, pose, x, y, altura, t0, t1=None, voa=True):
    """O Zappy (as poses do EdiSVG do Sistema Zero, em artes/) com o canto de cima à esquerda em (x, y), `altura` px.
    Voa de leve para cima e para baixo. Devolve (grupo, ponto ao lado da cabeça para a ponta do balão)."""
    aid, w, h = c.imagem(pose)
    s = altura / h
    img = {"id": nid(), "name": pose, "tag": "image", "assetId": aid,
           "attrs": {"x": "0", "y": "0", "width": str(w), "height": str(h)}, "text": "", "children": [],
           "transform": tf(), "visible": True, "locked": False}
    g = c.grupo(f"Zappy · {pose}", x, y, [img], op=0, s=s)
    c.nos.append(g)
    c.mostra(g, t0, t1)
    if voa:
        ch, t = [], t0
        fim = t1 or (t0 + 8)
        while t + 2.6 < fim:
            ch += [(t, y, VAIVEM), (t + 1.3, y - 12, VAIVEM)]
            t += 2.6
        ch.append((fim, y, None))
        c.trilha(g, "y", ch)
    fx, fy = ZAPPY_CABECA.get(pose, (0.8, 0.3))
    return g, (round(x + w * s * fx + 16), round(y + h * s * fy))


def cartao_texto(c, nome, x, y, w, h, linha1, linha2=None, etiqueta=None, t0=0, t1=None):
    """Texto num cartão branco bem redondo com degrau, e uma etiqueta amarela inclinada em cima (opcional)."""
    _maiuscula(linha1, "termo")
    filhos = [c.rect("degrau", 0, 8, w, h, "#B9C6D9", rx=40), c.rect("fundo", 0, 0, w, h, BRANCO, rx=40),
              c.texto("texto", linha1, 48, 108, 58, "#1B5CF3")]
    if linha2:
        filhos.append(c.texto("texto2", linha2, 48, 170, 34, TINTA, familia="Nunito"))
    g = c.grupo(f"Cartão · {nome}", x, y, filhos)
    c.nos.append(g)
    c.mostra(g, t0, t1, sobe=20)
    if etiqueta:
        _maiuscula(etiqueta, "termo")
        ew = medir(c, etiqueta, 30) + 56
        e = c.grupo(f"Etiqueta · {nome}", x + 28, y - 30, [
            c.rect("degrau", 0, 5, ew, 58, AMARELO_DEGRAU, rx=29), c.rect("fundo", 0, 0, ew, 58, AMARELO, rx=29),
            c.texto("texto", etiqueta, ew / 2, 29 + linha_de_base(c, 30), 30, TINTA, ancora="middle")])
        e["transform"]["rotation"] = -5
        c.nos.append(e)
        c.mostra(e, t0 + 0.25, t1, pop=True)
    return Peca(g, x, y, x + w, y + h)


def raios(c, nome, cx, cy, r, t0, t1=None, cor=AMARELO, n=12, comp=34, esp=12):
    """Raios em volta do que acabou de acontecer: entram crescendo e pulsam de leve."""
    filhos = []
    for k in range(n):
        barra = c.rect("raio", r, -esp / 2, comp, esp, cor, rx=esp / 2)
        g = c.grupo("raio", 0, 0, [barra], op=100)
        g["transform"]["rotation"] = round(360 * k / n, 2)
        filhos.append(g)
    g = c.grupo(f"Raios · {nome}", cx, cy, filhos)
    c.nos.append(g)
    c.mostra(g, t0, t1)
    ch = [(t0, 0.6, SUAVE), (t0 + 0.35, 1.08, VAIVEM), (t0 + 0.55, 1.0, None)]
    t = t0 + 1.0
    fim = t1 or (t0 + 4)
    while t + 0.8 < fim:
        ch += [(t, 1.0, VAIVEM), (t + 0.4, 1.06, VAIVEM), (t + 0.8, 1.0, None)]
        t += 1.2
    c.trilha(g, "sx", ch)
    c.trilha(g, "sy", ch)
    return g


def icone(c, nome, x, y, tam, cor, degrau, arte, arte_alt, t0, t1=None, op_arte=100):
    """Um passo num quadradinho colorido com o desenho dentro (arte: PNG da pasta de blocos ou de artes)."""
    aid, w, h = c.imagem(arte)
    s = arte_alt / h
    img = {"id": nid(), "name": arte, "tag": "image", "assetId": aid,
           "attrs": {"x": "0", "y": "0", "width": str(w), "height": str(h)}, "text": "", "children": [],
           "transform": tf((tam - w * s) / 2, (tam - h * s) / 2, op_arte, s), "visible": True, "locked": False}
    g = c.grupo(f"Ícone · {nome}", x, y, [c.rect("degrau", 0, 7, tam, tam, degrau, rx=tam * 0.21),
                                          c.rect("fundo", 0, 0, tam, tam, cor, rx=tam * 0.21), img])
    c.nos.append(g)
    c.mostra(g, t0, t1, pop=True)
    return Peca(g, x, y, x + tam, y + tam)


def trilha(c, nome, p0, p1, p2, t0, t1=None, n=9, r=6):
    """Uma trilha de pontinhos brancos numa curva de p0 a p2 (p1 puxa a curva), que aparecem um a um."""
    for k, (x, y) in enumerate([p0] + _q(p0, p1, p2, n)):
        d = c.rect(f"Trilha · {nome} {k + 1}", x - r, y - r, 2 * r, 2 * r, BRANCO, rx=r, op=0)
        c.nos.append(d)
        c.mostra(d, t0 + 0.05 * k, t1)


# ── A caixa-surpresa (Helena, 27/11/2026: "o laço ficou parecendo um Mickey Mouse... ela começa fechada... dá uma
# balançadinha... às vezes ela abre... mais animação, mais emoção") ──
ROXO, ROXO_ESCURO, ROXO_TAMPA = "#6D3BF5", "#4E22CC", "#7C4DFF"


def _no_path(c, nome, d, fill, op=100):
    return {"id": nid(), "name": nome, "tag": "path", "attrs": {"d": d, "fill": fill}, "text": "",
            "transform": tf(op=op), "visible": True, "locked": False}


def _alca(lado):
    """Uma alça do laço em gota (sai do nó, abre para o lado e volta), e a dobra de dentro, mais escura."""
    k = -1 if lado == "esq" else 1
    fora = (f"M0,0 C{k * 24},-58 {k * 112},-86 {k * 124},-40 C{k * 134},-4 {k * 70},10 0,0 Z")
    dentro = (f"M{k * 8},-6 C{k * 30},-44 {k * 88},-62 {k * 98},-36 C{k * 104},-16 {k * 62},-6 {k * 8},-6 Z")
    return fora, dentro


def caixa_surpresa(c, cx, base, t0, t1=None, chacoalha=(), abre=None, s=1.0, nome="Surpresa"):
    """O presente da surpresa, com a base em (cx, base): caixa roxa com fita amarela, tampa e um laço de alças em
    gota (nunca dois círculos, que pareciam orelhas). Entra fechado com um pulinho; chacoalha = [t, ...] balança
    para um lado e para o outro em volta da base (a caixa está viva); abre = t: a tampa pula, inclina e fica
    entreaberta, e de dentro sai luz (raios) e brilhos, sem mostrar o que é."""
    W, H = 300, 210
    corpo = [c.rect("degrau", -W / 2, -H + 10, W, H, ROXO_ESCURO, rx=24),
             c.rect("caixa", -W / 2, -H, W, H, ROXO, rx=24),
             c.rect("fita degrau", -22, -H, 44, H, AMARELO_DEGRAU),
             c.rect("fita", -26, -H, 44, H, AMARELO),
             c.rect("brilho", -W / 2 + 22, -H + 22, 18, H - 70, "#FFFFFF", rx=9, op=22)]
    # A tampa é um grupo com o ponto de giro na quina de trás à esquerda (abre como uma tampa de verdade).
    tw, th = W + 36, 70
    laco_f_e, laco_d_e = _alca("esq")
    laco_f_d, laco_d_d = _alca("dir")
    laco = c.grupo("Laço", tw / 2, -th + 6, [
        _no_path(c, "alça esquerda", laco_f_e, AMARELO), _no_path(c, "dobra esquerda", laco_d_e, AMARELO_DEGRAU),
        _no_path(c, "alça direita", laco_f_d, AMARELO), _no_path(c, "dobra direita", laco_d_d, AMARELO_DEGRAU),
        _no_path(c, "ponta esquerda", "M-6,6 L-34,52 L-18,50 L-10,62 L6,10 Z", AMARELO_DEGRAU),
        _no_path(c, "ponta direita", "M6,6 L34,52 L18,50 L10,62 L-6,10 Z", AMARELO_DEGRAU),
        c.rect("nó degrau", -22, -18, 44, 40, AMARELO_DEGRAU, rx=14),
        c.rect("nó", -22, -22, 44, 38, AMARELO, rx=14)], op=100)
    tampa_filhos = [c.rect("tampa degrau", 0, -th + 8, tw, th, ROXO_ESCURO, rx=20),
                    c.rect("tampa", 0, -th, tw, th, ROXO_TAMPA, rx=20),
                    c.rect("fita da tampa", tw / 2 - 26, -th, 52, th, AMARELO), laco]
    yt = -H + 4
    tampa = c.grupo("Tampa", -tw / 2, yt, tampa_filhos, op=100)
    # A luz de dentro: entra quando a tampa abre, atrás dela.
    # Uma luz suave em leque (três fachos claros, transparentes), nunca um bloco cheio.
    luz = c.grupo("Luz", 0, -H, [c.poly("facho", [(-30, 0), (30, 0), (dx + 70, -300), (dx - 70, -300)], "#FFD84A")
                                 for dx in (-190, 0, 190)], op=0)
    g = c.grupo(f"Presente · {nome}", cx, base, [luz] + corpo + [tampa], op=0, s=s)
    c.nos.append(g)
    c.mostra(g, t0, t1, pop=True)
    if chacoalha:
        ch = [(t0 + 0.45, 0, None)]
        for t in chacoalha:
            ch += [(t, 0, VAIVEM), (t + 0.1, -7, VAIVEM), (t + 0.22, 6, VAIVEM), (t + 0.34, -5, VAIVEM),
                   (t + 0.46, 3, VAIVEM), (t + 0.58, 0, None)]
        c.trilha(g, "rotation", ch)
        # Um pulinho da tampa em cada chacoalhada, como se algo lá dentro empurrasse.
        ct = [(t0 + 0.45, yt, None)]
        for t in chacoalha:
            ct += [(t + 0.08, yt, SUAVE), (t + 0.2, yt - 22, VAIVEM), (t + 0.36, yt, None)]
        if abre:
            ct += [(abre, yt, SUAVE), (abre + 0.25, yt - 120, VAIVEM), (abre + 0.55, yt - 70, None)]
        c.trilha(tampa, "y", ct)
    elif abre:
        c.trilha(tampa, "y", [(abre, yt, SUAVE), (abre + 0.25, yt - 120, VAIVEM), (abre + 0.55, yt - 70, None)])
    if abre:
        c.trilha(tampa, "rotation", [(abre, 0, SUAVE), (abre + 0.3, -16, VAIVEM), (abre + 0.55, -11, None)])
        c.trilha(tampa, "x", [(abre, -tw / 2, SUAVE), (abre + 0.3, -tw / 2 - 30, None)])
        fim = t1 or (abre + 4)
        c.trilha(luz, "opacity", [(abre + 0.1, 0, None), (abre + 0.35, 55, None), (abre + 0.9, 35, VAIVEM),
                                  (min(fim, abre + 1.6), 50, VAIVEM), (fim, 0, None)])
        raios(c, f"{nome} · luz", cx, base - (H + 120) * s, 150 * s, abre + 0.2, t1)
        for k, (dx, dy, r) in enumerate(((-210, -330, 22), (0, -420, 28), (200, -340, 22), (-120, -470, 16),
                                         (130, -480, 16))):
            pts = []
            for j in range(8):
                a = -math.pi / 2 + j * math.pi / 4
                rr = r if j % 2 == 0 else r * 0.38
                pts.append((round(rr * math.cos(a), 1), round(rr * math.sin(a), 1)))
            e = c.grupo(f"{nome} · brilho {k + 1}", cx + dx * s, base + dy * s, [c.poly("brilho", pts, BRANCO)], op=0)
            c.nos.append(e)
            c.mostra(e, abre + 0.3 + 0.12 * k, t1, pop=True)
    return g
