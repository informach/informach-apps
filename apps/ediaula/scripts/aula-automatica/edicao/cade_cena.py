"""Peças das animações de conceito de Cadê Todo Mundo (Faísca, 24/11/2026), por cima de edisvg_cena.

O jogo é o 2D do curso: o jardim de 640 x 360 com três esconderijos (arbusto, pedras e flores) e, atrás de cada
um, um personagem (coelho, raposa e coruja), nos lugares do projeto final ("Ao iniciar" de
projeto-final.szproject.json). As artes são os SVG do projeto, passados a PNG em 3x (jardim 1920 x 1080,
esconderijos 483 x 432, personagens 216 x 261). O Zappy é o vagalume do Sistema Zero
(docs/design/zappy-vagalume/mestres, em 600 x 600: zappy-speaking, -happy, -thinking, -celebrating, -final).

Imagens na pasta de blocos da parte: jardim, arbusto, pedras, flores, coelho, raposa, coruja, zappy-*, e os
recortes da gravação que a cena usar.
"""
import math

from edisvg_cena import AMARELO, BRANCO, NOITE, SUAVE, TINTA, VAIVEM, VERDE
from ilha_cena import circulo, estrela, figura
from jardim_cena import caixa_em, vis

AZUL_BOTAO, VERMELHO, CINZA = "#1B5CF3", "#FF4D4D", "#9AA6BF"
PLACAR = "#173844"
# Os lugares do jogo (x, y, largura, altura), como em "Ao iniciar".
ESCONDERIJOS = {"arbusto": (56.5, 137, 161, 144), "pedras": (229.5, 137, 161, 144), "flores": (402.5, 137, 161, 144)}
BICHOS = {"coelho": (101, 181, 72, 87), "raposa": (274, 181, 72, 87), "coruja": (447, 181, 72, 87)}
ATRAS = {"arbusto": "coelho", "pedras": "raposa", "flores": "coruja"}


class Painel:
    """O jardim do jogo num cartão branco, com o canto de cima à esquerda em (x0, y0) e `largura` px de cena.
    gx/gy levam coordenadas do jogo para a cena."""

    def __init__(self, c, t0, t1=None, x0=110, y0=300, largura=1100):
        self.c, self.x0, self.y0 = c, x0, y0
        self.S = largura / 640
        self.g, _ = c.bloco("jardim", x0, y0, largura / 1920, fundo=BRANCO, pad=10)
        vis(c, self.g, [(t0, t1)])
        self.t0, self.t1 = t0, t1
        self.nos = {}

    def gx(self, x):
        return self.x0 + x * self.S

    def gy(self, y):
        return self.y0 + y * self.S

    def meio(self, nome):
        x, y, w, h = {**ESCONDERIJOS, **BICHOS}[nome]
        return self.gx(x + w / 2), self.gy(y + h / 2)

    def sprite(self, arq, nome=None, intervalos=None, x=None, y=None, w=None, opacidade=None):
        """Um sprite no lugar dele no jogo (ou em x, y, w do jogo), visível nos intervalos, ou com a trilha de
        opacidade dada: opacidade = [(t, valor), ...] (o esconderijo que some aos poucos)."""
        gx0, gy0, gw, _ = {**ESCONDERIJOS, **BICHOS}[arq]
        x, y, w = (gx0 if x is None else x), (gy0 if y is None else y), (gw if w is None else w)
        f = figura(self.c, arq)
        pw = int(f["attrs"]["width"])
        g = self.c.grupo(nome or arq.capitalize(), self.gx(x), self.gy(y), [f], op=0, s=w * self.S / pw)
        self.c.nos.append(g)
        if opacidade:
            self.c.trilha(g, "opacity", [(t, v, None) for t, v in opacidade])
        else:
            vis(self.c, g, intervalos or [(self.t0, self.t1)])
        self.nos[nome or arq] = g
        return g

    def jardim(self, some=None, espiar=None, sem=()):
        """Os três personagens atrás dos três esconderijos. some = {esconderijo: t} some o esconderijo em t (o
        personagem fica à vista); sem = esconderijos que a cena desenha à parte; espiar = {personagem: [t, ...]} o personagem sobe um pouco e volta."""
        some, espiar = some or {}, espiar or {}
        for esc, bicho in ATRAS.items():
            b = self.sprite(bicho)
            for t in espiar.get(bicho, []):
                y = b["transform"]["y"]
                self.c.trilha(b, "y", [(t, y, None), (t + 0.35, y - 46 * self.S, SUAVE), (t + 1.1, y - 46 * self.S, None),
                                       (t + 1.45, y, VAIVEM)])
        for esc in ESCONDERIJOS:
            if esc in sem or (some.get(esc) is not None and some[esc] <= self.t0 + 0.05):
                continue  # desenhado à parte, ou já tinha sumido quando a cena começa
            self.sprite(esc, intervalos=[(self.t0, some.get(esc) or self.t1)])

    def achados(self, valores):
        """O placar "Achados: n" no canto do jogo; valores = [(t, n), ...], cada um até o seguinte."""
        for k, (t, n) in enumerate(valores):
            fim = valores[k + 1][0] if k + 1 < len(valores) else self.t1
            tx = self.c.texto(f"Achados · {n}", f"Achados: {n}", self.gx(18), self.gy(34), round(24 * self.S),
                              PLACAR, op=0)
            self.c.nos.append(tx)
            vis(self.c, tx, [(t, fim)])

    def contorno(self, nome, t0, t1, cor=AMARELO):
        """Contorno (amarelo) em volta de um esconderijo ou personagem."""
        x, y, w, h = {**ESCONDERIJOS, **BICHOS}[nome]
        r = self.c.rect(f"Contorno · {nome}", self.gx(x) - 8, self.gy(y) - 8, w * self.S + 16, h * self.S + 16,
                        "none", rx=22, stroke=cor, sw=7, op=0)
        self.c.nos.append(r)
        self.c.pisca(r, t0, t1)
        return r

    def toque(self, nome, t):
        """Um toque no esconderijo: um anel amarelo que abre e some no meio dele."""
        cx, cy = self.meio(nome)
        return toque(self.c, cx, cy, t)

    def pergunta(self, nome, t0, t1):
        """Um "?" amarelo em cima do esconderijo."""
        cx, _ = self.meio(nome)
        return caixa_em(self.c, f"? · {nome}", "?", cx, self.gy(ESCONDERIJOS[nome][1]) - 30, 96, t0, t1,
                        fill=AMARELO, tam=60)


def toque(c, cx, cy, t, r=70):
    """O toque: um anel que abre e um ponto no meio."""
    filhos = [c.rect("anel", -r, -r, 2 * r, 2 * r, "none", rx=r, stroke=AMARELO, sw=10),
              circulo(c, "ponto", 0, 0, 20, AMARELO)]
    g = c.grupo(f"Toque · {t:.1f}", cx, cy, filhos, op=0)
    c.nos.append(g)
    c.trilha(g, "opacity", [(t - 0.01, 0, None), (t, 100, None), (t + 0.45, 100, None), (t + 0.75, 0, None)])
    for p in ("sx", "sy"):
        c.trilha(g, p, [(t, 0.35, SUAVE), (t + 0.6, 1.25, None)])
    return g


def zappy(c, pose, cx, cy, s, t0, t1, pop=True):
    """O vagalume (600 x 600) com o meio em (cx, cy)."""
    f = figura(c, f"zappy-{pose}")
    g = c.grupo(f"Zappy · {pose}", cx - 300 * s, cy - 300 * s, [f], op=0, s=s)
    c.nos.append(g)
    c.mostra(g, t0, t1, pop=False)
    if pop:
        y = g["transform"]["y"]
        c.trilha(g, "y", [(t0, y + 40, SUAVE), (t0 + 0.4, y, None), (t0 + 1.4, y - 12, VAIVEM), (t0 + 2.4, y, VAIVEM)])
    return g


def personagem(c, arq, cx, base, altura, t0, t1, ri=None):
    """Um personagem do jogo grande (216 x 261), com o pé em (cx, base). ri = [t, ...]: ele chacoalha de rir."""
    f = figura(c, arq)
    s = altura / 261
    g = c.grupo(arq.capitalize(), cx - 108 * s, base - 261 * s, [f], op=0, s=s)
    c.nos.append(g)
    vis(c, g, [(t0, t1)])
    if ri:
        ch = []
        for t in ri:
            ch += [(t, 0, None)] + [(t + 0.12 * (k + 1), (6 if k % 2 == 0 else -6), None) for k in range(8)] + [
                (t + 1.1, 0, None)]
        c.trilha(g, "rotation", ch)
    return g


def risada(c, x, y, t0, t1):
    """"ha" "ha" "ha" que pulam um depois do outro."""
    for k, (dx, dy, tam) in enumerate(((0, 0, 70), (120, -70, 80), (250, -10, 90))):
        tx = c.texto(f"Risada · {k + 1}", "ha!", x + dx, y + dy, tam, VERMELHO)
        g = c.grupo(f"Risada {k + 1}", 0, 0, [tx], op=0)
        c.nos.append(g)
        c.mostra(g, t0 + 0.25 * k, t1, pop=True)


def pena(c, cx, cy, t0, t1, mexe=None):
    """Uma pena (as cócegas): oval branca com o cabo, que balança."""
    filhos = [c.rect("pena", -40, -120, 80, 240, "#FFF4D6", rx=40, stroke="#E2BF7A", sw=5),
              c.rect("cabo", -4, -110, 8, 260, "#C8A15A", rx=4)]
    g = c.grupo("Pena", cx, cy, filhos, op=0)
    g["transform"]["rotation"] = -35
    c.nos.append(g)
    vis(c, g, [(t0, t1)])
    if mexe:
        ch = []
        t = mexe[0]
        while t < mexe[1]:
            ch += [(t, -35, VAIVEM), (t + 0.25, -10, VAIVEM)]
            t += 0.5
        c.trilha(g, "rotation", ch + [(t, -35, VAIVEM)])
    return g


def presente(c, cx, cy, t0, t1, s=1.0):
    """Uma caixa de presente com um "?" (a surpresa do fim do curso), que balança."""
    filhos = [c.rect("caixa", -150, -60, 300, 220, VERMELHO, rx=18),
              c.rect("tampa", -170, -120, 340, 76, "#FF7A7A", rx=16),
              c.rect("fita vertical", -22, -120, 44, 280, AMARELO),
              c.rect("laço esquerdo", -90, -170, 80, 56, AMARELO, rx=28),
              c.rect("laço direito", 10, -170, 80, 56, AMARELO, rx=28),
              c.texto("pergunta", "?", 0, 120, 150, BRANCO, ancora="middle")]
    g = c.grupo("Presente", cx, cy, filhos, op=0, s=s)
    c.nos.append(g)
    c.mostra(g, t0, t1)
    ch = [(t0, 0, None)]
    t = t0 + 0.6
    while t + 1.2 < (t1 or t0 + 6):
        ch += [(t, -6, VAIVEM), (t + 0.2, 6, VAIVEM), (t + 0.4, -4, VAIVEM), (t + 0.6, 0, VAIVEM)]
        t += 2.0
    c.trilha(g, "rotation", ch)
    for p in ("sx", "sy"):
        c.trilha(g, p, [(t0, 0.6 * s, SUAVE), (t0 + 0.3, 1.08 * s, VAIVEM), (t0 + 0.45, s, None)])
    return g


def brilhos(c, pontos, t0, t1):
    for k, (x, y, r) in enumerate(pontos):
        e = estrela(c, f"Brilho {k + 1}", x, y, r)
        c.mostra(e, t0 + 0.15 * k, t1, pop=True)


def ligacao(c, x0, x1, y, t_solta, t_liga, t1):
    """A ligação entre duas caixas: um traço cinza tracejado (solta) que vira verde e cheio (ligada)."""
    n = max(3, int((x1 - x0) / 46))
    passo = (x1 - x0) / n
    solta = [c.rect(f"traço {k + 1}", x0 + k * passo + 6, y - 6, passo - 18, 12, CINZA, rx=6) for k in range(n)]
    gs = c.grupo("Ligação · solta", 0, 0, solta, op=0)
    c.nos.append(gs)
    vis(c, gs, [(t_solta, t_liga)])
    cheia = c.rect("Ligação · ligada", x0, y - 9, x1 - x0, 18, VERDE, rx=9, op=0)
    c.nos.append(cheia)
    vis(c, cheia, [(t_liga, t1)])
    return gs, cheia


def seta_dir(c, nome, x0, x1, y, cor, t0, t1, h=26):
    """Uma seta para a direita (corpo e ponta)."""
    filhos = [c.rect("corpo", x0, y - h / 2, x1 - x0 - 40, h, cor, rx=h / 2),
              c.poly("ponta", [(x1 - 60, y - 2.2 * h), (x1, y), (x1 - 60, y + 2.2 * h)], cor)]
    g = c.grupo(nome, 0, 0, filhos, op=0)
    c.nos.append(g)
    c.mostra(g, t0, t1)
    return g


def botao(c, texto, cx, cy, t0, t1, w=520):
    """O botão azul da plataforma (Próxima parte), que pulsa."""
    filhos = [c.rect("fundo", -w / 2, -52, w, 104, AZUL_BOTAO, rx=52),
              c.texto("texto", texto, -28, 18, 50, BRANCO, familia="Nunito", peso=800, ancora="middle"),
              c.poly("seta", [(w / 2 - 78, -20), (w / 2 - 46, 0), (w / 2 - 78, 20)], BRANCO)]
    g = c.grupo(f"Botão · {texto}", cx, cy, filhos, op=0)
    c.nos.append(g)
    c.trilha(g, "opacity", [(t0, 0, None), (t0 + 0.3, 100, None), (t1 - 0.25, 100, None), (t1, 0, None)])
    ch = [(t0, 0.7, SUAVE), (t0 + 0.3, 1.05, VAIVEM), (t0 + 0.45, 1, None)]
    t = t0 + 1.0
    while t + 0.6 < t1:
        ch += [(t, 1, VAIVEM), (t + 0.3, 1.07, VAIVEM), (t + 0.6, 1, VAIVEM)]
        t += 1.2
    for p in ("sx", "sy"):
        c.trilha(g, p, ch)
    return g


def recorte(c, arq, x, y, escala, t0, t1, pop=True):
    """Um recorte da gravação (bloco ou painel) no cartão da cor do Estúdio; devolve (grupo, destaque)."""
    g, destaque = c.bloco(arq, x, y, escala)
    c.mostra(g, t0, t1, pop=pop)
    return g, destaque


def marca(c, no, t0, t1):
    """Um contorno de destaque (de recorte.destaque) que entra e pulsa."""
    c.pisca(no, t0, t1)


__all__ = ["AMARELO", "BRANCO", "NOITE", "TINTA", "VERDE", "caixa_em", "math", "vis"]
