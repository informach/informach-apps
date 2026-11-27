"""Peças das animações de conceito de Moedas no caminho (Poder do Faísca, 27/11/2026), por cima de edisvg_cena e
ilha_cena: o chão da ilha com os renders do jogo 3D (o aventureiro, a moeda e o baú que abre), o placar do canto
de cima, o cofrinho `moedas`, o aviso, a pergunta do baú e os sinais de certo e de errado.

O EdiSVG aceita uma trilha por propriedade em cada nó: cada peça recebe todos os seus tempos de uma vez (a
opacidade como intervalos visíveis).

Aula 1 (o jogo 2D, a classe Painel): praia-tropical, aventureiro, moeda, bau-fechado, bau-aberto, chave-dourada,
farol-listrado-apagado e veleiro, as artes do projeto do curso em PNG (exemplos/moedas-artes-2d.py), e zappy.

Aula 2: imagens na pasta de blocos da parte (exemplos/moedas-render-modelos.py): aventureiro-parado e
aventureiro-andando-1 a 4 (600 x 800), moeda-3d (600 x 600), bau-3d-fechado, bau-3d-abrindo-1 e 2 e bau-3d-aberto
(800 x 800), todos na mesma medida por pixel: a mesma escala na cena deixa as figuras do tamanho certo umas das
outras.
"""
from edisvg_cena import AMARELO, BRANCO, NOITE, SUAVE, TINTA, VAIVEM, VERDE, nid, tf
from ilha_cena import Personagem, chao, circulo, estrela, no_chao, pe_do_png, variavel

FADE = 0.28
VERMELHO = "#E5484D"
AVISO_FUNDO = "#1F3A2C"
PLACAR_FUNDO = "#14213D"


def vis(c, no, intervalos):
    """Uma trilha de opacidade com os intervalos visíveis [(t0, t1), ...] (t1 None: até o fim)."""
    ch = [(intervalos[0][0] - 0.01, 0, None)]
    for t0, t1 in intervalos:
        ch += [(t0, 0, None), (t0 + FADE, 100, None)]
        if t1 is not None:
            ch += [(t1 - FADE, 100, None), (t1, 0, None)]
    c.trilha(no, "opacity", ch)


def esc(y):
    """A escala de uma figura com a base em y no chão em perspectiva (430 no fundo, 1040 na frente)."""
    return round(0.22 + 0.30 * (y - 430) / 610, 3)


def chao_ilha(c, t0, t1=None):
    return chao(c, t0, t1)


def moeda(c, nome, x, y, t0, t_pega=None, t1=None, s=None):
    """A moeda 3D com a base em (x, y). Em t_pega o personagem a pega: ela sobe, cresce e some."""
    s = s or esc(y)
    bx, by = pe_do_png(c, "moeda-3d")
    g = no_chao(c, nome, "moeda-3d", x, y, s, pe=(bx, by))
    fim = t_pega + 0.35 if t_pega else t1
    vis(c, g, [(t0, fim)])
    if t_pega:
        for prop, a, b in (("y", y - by * s, y - by * s - 90), ("sx", s, s * 1.35), ("sy", s, s * 1.35),
                           ("x", x - bx * s, x - bx * s * 1.35)):
            c.trilha(g, prop, [(t_pega, a, SUAVE), (t_pega + 0.35, b, None)])
    return g


def vaga(c, nome, x, y, t0, t1, s=None):
    """O lugar de uma moeda que já saiu da cena: um círculo tracejado no chão."""
    s = s or esc(y)
    # Do tamanho da moeda (o disco ocupa metade do render de 600 px): uma vaga não encosta na outra.
    r = 150 * s
    no = c.rect(nome, x - r, y - 2 * r - 30 * s, 2 * r, 2 * r, "none", rx=r, stroke=BRANCO, sw=5, op=0)
    no["attrs"]["stroke-dasharray"] = "14 10"
    c.nos.append(no)
    vis(c, no, [(t0, t1)])
    return no


def bau(c, x, y, t0, t1, t_abre=None, s=None, brilho=True):
    """O baú 3D com a base em (x, y): fechado e, de t_abre em diante, abrindo (0,6 s) e aberto."""
    s = s or esc(y)
    pe = pe_do_png(c, "bau-3d-fechado")
    quadros = ["bau-3d-fechado"] + (["bau-3d-abrindo-1", "bau-3d-abrindo-2", "bau-3d-aberto"] if t_abre else [])
    tempos = [t0] + ([t_abre, t_abre + 0.2, t_abre + 0.4] if t_abre else []) + [t1]
    ultimo = len(quadros) - 1
    for k, arq in enumerate(quadros):
        g = no_chao(c, f"Baú · {arq}", arq, x, y, s, pe=pe)
        a, b = tempos[k], tempos[k + 1]
        # O primeiro entra com fade e o último sai com fade; entre eles os quadros trocam seco (o clipe abrir).
        ch = [(a - 0.01, 0, None)] + ([(a, 0, None), (a + FADE, 100, None)] if k == 0 else [(a, 100, None)])
        ch += [(b - FADE, 100, None), (b, 0, None)] if k == ultimo else [(b - 0.01, 100, None), (b, 0, None)]
        c.trilha(g, "opacity", ch)
    if t_abre and brilho:
        # Em volta da tampa aberta (no render de 800 px, o alto da tampa fica 500 px acima da base).
        for k, (dx, dy) in enumerate(((-250, -500), (0, -580), (250, -500))):
            b = estrela(c, f"Brilho {k + 1}", x + dx * s, y + dy * s, max(18, 40 * s), op=0)
            c.mostra(b, t_abre + 0.45 + 0.12 * k, t1, pop=True)


def personagem(c, nome, t0, t1, caminho):
    """O aventureiro: visível de t0 a t1; caminho = [(ta, tb, de, para), ...] (andar) ou [(t, onde)] (parado),
    com onde = (x, y, s)."""
    h = Personagem(c, nome)
    primeiro = caminho[0]
    h.em(t0, *(primeiro[2] if len(primeiro) == 4 else primeiro[1]))
    for passo in caminho:
        if len(passo) == 4:
            h.anda(*passo)
        else:
            h.em(passo[0], *passo[1])
    c.trilha(h.g, "opacity", [(t0, 0, None), (t0 + FADE, 100, None), (t1 - FADE, 100, None), (t1, 0, None)])
    h.fechar()
    return h


def placar(c, x, y, valores, t0, t1, tam=1.0):
    """O número do canto de cima do jogo: uma pílula escura com a moeda e o valor. valores = [(t, texto), ...]."""
    w, h = 230 * tam, 110 * tam
    fundo = c.rect("Placar · fundo", x, y, w, h, PLACAR_FUNDO, rx=28 * tam, op=0)
    c.nos.append(fundo)
    vis(c, fundo, [(t0, t1)])
    icone = no_chao(c, "Placar · moeda", "moeda-3d", x + 60 * tam, y + 95 * tam, 0.16 * tam,
                    pe=pe_do_png(c, "moeda-3d"))
    vis(c, icone, [(t0, t1)])
    for k, (t, texto) in enumerate(valores):
        fim = valores[k + 1][0] if k + 1 < len(valores) else t1
        n = c.texto(f"Placar · {texto}", texto, x + 160 * tam, y + 80 * tam, 70 * tam, BRANCO, ancora="middle", op=0)
        c.nos.append(n)
        if k == 0:
            vis(c, n, [(t, fim)])
        else:
            c.mostra(n, t, fim, pop=True)
    return fundo


def aviso(c, mensagens, t1, y=330, x=140, w=1120, tam=38):
    """A faixa do aviso do jogo, com as mensagens trocando: mensagens = [(t, texto), ...]."""
    faixa = c.rect("Aviso · faixa", x, y, w, 76, AVISO_FUNDO, rx=16, op=0)
    c.nos.append(faixa)
    vis(c, faixa, [(mensagens[0][0], t1)])
    for k, (t, texto) in enumerate(mensagens):
        fim = mensagens[k + 1][0] if k + 1 < len(mensagens) else t1
        n = c.texto(f"Aviso · {k + 1}", texto, x + 30, y + 52, tam, BRANCO, familia="Nunito", peso=800, op=0)
        c.nos.append(n)
        vis(c, n, [(t, fim)])


def caixa_em(c, nome, texto, cx, cy, w, t0, t1, fill=BRANCO, cor=TINTA, num=None, tam=44):
    g = c.caixa(nome, texto, fill, cor, cx, cy, w, num=num, tam=tam)
    g["transform"] = tf(cx, cy, 0)
    c.mostra(g, t0, t1, pop=True)
    return g


def certo(c, nome, cx, cy, t0, t1, ok=True, r=40):
    """Um sinal num círculo: certo (verde) ou errado (vermelho)."""
    if ok:
        marca = c.poly("certo", [(-21, 0), (-7, 16), (23, -16), (16, -23), (-7, 3), (-15, -7)], BRANCO)
    else:
        marca = c.poly("errado", [(-18, -24), (0, -6), (18, -24), (24, -18), (6, 0), (24, 18), (18, 24), (0, 6),
                                  (-18, 24), (-24, 18), (-6, 0), (-24, -18)], BRANCO)
    g = c.grupo(nome, cx, cy, [circulo(c, "fundo", 0, 0, r, VERDE if ok else VERMELHO), marca], op=0, s=r / 40)
    c.nos.append(g)
    c.mostra(g, t0, t1, pop=True)
    return g


def pergunta(c, texto, cx, cy, w, t0, t1, ponta_x=0):
    """O balão do baú com a pergunta."""
    g = c.balao("Pergunta", texto, cx, cy, w, ponta_x)
    g["transform"] = tf(cx, cy, 0)
    c.mostra(g, t0, t1, pop=True)
    return g


def cofrinho(c, cx, cy, valores, t0, t1, w=380):
    """A variável moedas: a caixa com o nome numa aba laranja e o valor dentro."""
    return variavel(c, "Cofrinho", "moedas", cx, cy, valores, w=w, t0=t0, t1=t1)


# ── Aula 1: o jogo 2D (as artes do projeto do curso, exemplos/moedas-artes-2d.py) ─────────────────────────────
# Posições do jogo (480 x 360, canto de cima à esquerda de cada sprite), de moedas-2d.szproject.json.
JOGO_2D = {
    "personagem": ("aventureiro", 21, 141, 64),
    "chave": ("chave-dourada", 211, 53, 32),
    "farol": ("farol-listrado-apagado", 328, 40, 152),
    "barco": ("veleiro", 392, 240, 88),
    "bau": ("bau-fechado", 28, 270, 48),
}
MOEDAS_2D = [(95, 166), (150, 166), (205, 166), (260, 166), (332, 166), (100, 62)]
MOEDA_2D = 24


class Painel:
    """O jogo 2D num cartão: a praia em escala s com o canto em (x0, y0). As figuras saem um pouco maiores que no
    jogo (amplia), para se reconhecerem no vídeo."""

    def __init__(self, c, t0, t1, x0=170, y0=300, s=2.0, amplia=1.3):
        self.c, self.x0, self.y0, self.s, self.amplia = c, x0, y0, s, amplia
        _, w, _ = c.imagem("praia-tropical")
        self.fundo, _ = c.bloco("praia-tropical", x0, y0, 480 * s / w, fundo=BRANCO, pad=12)
        vis(c, self.fundo, [(t0, t1)])

    def ponto(self, x, y):
        return self.x0 + x * self.s, self.y0 + y * self.s

    def figura(self, nome, arq, x, y, w, t0, t1, op=0):
        """Uma arte do jogo no lugar dela (x, y, w do jogo), centrada no mesmo ponto, maior por `amplia`."""
        aid, pw, _ = self.c.imagem(arq)
        lado = w * self.s * self.amplia
        cx, cy = self.ponto(x + w / 2, y + w / 2)
        img = {"id": nid(), "name": arq, "tag": "image", "assetId": aid,
               "attrs": {"x": "0", "y": "0", "width": str(pw), "height": str(pw)},
               "text": "", "children": [], "transform": tf(), "visible": True, "locked": False}
        g = self.c.grupo(nome, cx - lado / 2, cy - lado / 2, [img], op=op, s=lado / pw)
        self.c.nos.append(g)
        if t0 is not None:
            vis(self.c, g, [(t0, t1)])
        return g

    def cenario(self, t0, t1, sem=()):
        """O farol, a chave e o barco nos lugares do jogo."""
        for chave, (arq, x, y, w) in JOGO_2D.items():
            if chave not in ("personagem", "bau", *sem):
                self.figura(chave.capitalize(), arq, x, y, w, t0, t1)

    def personagem(self, t0, t1, caminho):
        """O aventureiro: visível de t0 a t1, andando pelos pontos [(t, x, y), ...] do jogo, com um pulinho a cada
        passo enquanto anda."""
        arq, _, _, w = JOGO_2D["personagem"]
        g = self.figura("Personagem", arq, caminho[0][1], caminho[0][2], w, None, None)
        lado = w * self.s * self.amplia
        chx, chy = [], []
        for k, (t, px, py) in enumerate(caminho):
            cx, cy = self.ponto(px + w / 2, py + w / 2)
            chx.append((t, cx - lado / 2, None))
            chy.append((t, cy - lado / 2, None))
            if k + 1 < len(caminho):
                t2, qx, qy = caminho[k + 1]
                if (qx, qy) != (px, py):
                    _, cy2 = self.ponto(qx + w / 2, qy + w / 2)
                    passos = max(1, int((t2 - t) / 0.25))
                    for j in range(1, passos):
                        u = j / passos
                        chy.append((t + (t2 - t) * u, cy + (cy2 - cy) * u - lado / 2 - (8 if j % 2 else 0), None))
        self.c.trilha(g, "x", chx)
        self.c.trilha(g, "y", chy)
        vis(self.c, g, [(t0, t1)])
        return g

    def moeda(self, k, t0, t1, t_pega=None):
        """A moeda k do caminho: entra com pop em t0; em t_pega o personagem a pega (ela sobe, cresce e some)."""
        x, y = MOEDAS_2D[k]
        g = self.figura(f"Moeda {k + 1}", "moeda", x, y, MOEDA_2D, None, None)
        e = g["transform"]["sx"]
        fim = t_pega + 0.35 if t_pega else t1
        escala = [(t0, 0.6 * e, SUAVE), (t0 + 0.28, 1.08 * e, VAIVEM), (t0 + 0.42, e, None)]
        if t_pega:
            escala += [(t_pega, e, SUAVE), (t_pega + 0.35, 1.5 * e, None)]
            gy = g["transform"]["y"]
            self.c.trilha(g, "y", [(t_pega, gy, SUAVE), (t_pega + 0.35, gy - 50, None)])
        for p in ("sx", "sy"):
            self.c.trilha(g, p, escala)
        vis(self.c, g, [(t0, fim)])
        return g

    def bau(self, t0, t1, t_abre=None):
        _, x, y, w = JOGO_2D["bau"]
        fechado = self.figura("Baú fechado", "bau-fechado", x, y, w, None, None)
        if t_abre:
            aberto = self.figura("Baú aberto", "bau-aberto", x, y, w, None, None)
            self.c.trilha(fechado, "opacity", [(t0 - 0.01, 0, None), (t0, 0, None), (t0 + FADE, 100, None),
                                               (t_abre - 0.01, 100, None), (t_abre, 0, None)])
            self.c.trilha(aberto, "opacity", [(t_abre - 0.01, 0, None), (t_abre, 100, None), (t1 - FADE, 100, None),
                                              (t1, 0, None)])
            cx, cy = self.ponto(x + w / 2, y)
            for k, dx in enumerate((-60, 0, 60)):
                b = estrela(self.c, f"Brilho {k + 1}", cx + dx, cy - 40 - (20 if k == 1 else 0), 22, op=0)
                self.c.mostra(b, t_abre + 0.15 + 0.12 * k, t1, pop=True)
        else:
            vis(self.c, fechado, [(t0, t1)])

    def placar(self, valores, t0, t1):
        """O placar do jogo, ao lado do ícone da moeda: "Moedas: N"; valores = [(t, n), ...]."""
        self.figura("Ícone da moeda", "moeda", 10, 42, 22, t0, t1)
        x, y = self.ponto(38, 62)
        for k, (t, n) in enumerate(valores):
            fim = valores[k + 1][0] if k + 1 < len(valores) else t1
            no = self.c.texto(f"Placar {n}", f"Moedas: {n}", x, y, 28 * self.s, BRANCO, familia="Nunito", peso=800, op=0)
            self.c.nos.append(no)
            vis(self.c, no, [(t, fim)])

    def aviso(self, mensagens, t1):
        """A faixa do aviso do jogo, no alto: mensagens = [(t, texto), ...]."""
        x, y = self.ponto(8, 8)
        faixa = self.c.rect("Aviso · faixa", x, y, 464 * self.s, 28 * self.s, "#143d35", rx=6 * self.s, op=0)
        self.c.nos.append(faixa)
        vis(self.c, faixa, [(mensagens[0][0], t1)])
        for k, (t, texto) in enumerate(mensagens):
            fim = mensagens[k + 1][0] if k + 1 < len(mensagens) else t1
            no = self.c.texto(f"Aviso · {k + 1}", texto, x + 10 * self.s, y + 19 * self.s, 13 * self.s, BRANCO,
                              familia="Nunito", peso=800, op=0)
            self.c.nos.append(no)
            vis(self.c, no, [(t, fim)])

    def vaga(self, k, t0, t1):
        """O lugar da moeda k, que já saiu: um círculo tracejado."""
        x, y = MOEDAS_2D[k]
        cx, cy = self.ponto(x + MOEDA_2D / 2, y + MOEDA_2D / 2)
        r = MOEDA_2D * self.s * self.amplia / 2
        no = self.c.rect(f"Vaga {k + 1}", cx - r, cy - r, 2 * r, 2 * r, "none", rx=r, stroke=BRANCO, sw=4, op=0)
        no["attrs"]["stroke-dasharray"] = "10 8"
        self.c.nos.append(no)
        vis(self.c, no, [(t0, t1)])


__all__ = ["AMARELO", "BRANCO", "NOITE", "TINTA", "VAIVEM", "VERDE", "VERMELHO"]
