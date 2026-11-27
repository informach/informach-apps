"""Peças das animações de conceito de Moedas no caminho (Poder do Faísca, 27/11/2026), por cima de edisvg_cena e
ilha_cena: o chão da ilha com os renders do jogo 3D (o aventureiro, a moeda e o baú que abre), o placar do canto
de cima, o cofrinho `moedas`, o aviso, a pergunta do baú e os sinais de certo e de errado.

O EdiSVG aceita uma trilha por propriedade em cada nó: cada peça recebe todos os seus tempos de uma vez (a
opacidade como intervalos visíveis).

Imagens na pasta de blocos da parte (exemplos/moedas-render-modelos.py): aventureiro-parado e
aventureiro-andando-1 a 4 (600 x 800), moeda-3d (600 x 600), bau-3d-fechado, bau-3d-abrindo-1 e 2 e bau-3d-aberto
(800 x 800), todos na mesma medida por pixel: a mesma escala na cena deixa as figuras do tamanho certo umas das
outras.
"""
from edisvg_cena import AMARELO, BRANCO, NOITE, SUAVE, TINTA, VAIVEM, VERDE, tf
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


__all__ = ["AMARELO", "BRANCO", "NOITE", "TINTA", "VAIVEM", "VERDE", "VERMELHO"]
