"""Peças das animações de conceito de O Jardim Secreto (missão do Faísca, 24/11/2026), por cima de edisvg_cena e
ilha_cena: o painel do jogo 2D com as artes do jogo (Aula 1), o chão do jardim 3D com os renders (Aula 2), o
aviso do jogo, o regador que some, a flor que abre, a memória temRegador e o cartão do curso base ("onde você
aprendeu"). O EdiSVG aceita uma trilha por propriedade em cada nó: cada peça recebe todos os seus tempos de uma
vez (a opacidade como intervalos visíveis).

Imagens na pasta de blocos da parte:
- Aula 1: jardim-acolhedor, aventureiro, regador-azul, flor-fechada e flor-aberta (os sprites 2D do jogo, em PNG);
- Aula 2: aventureiro-parado e aventureiro-andando-1 a 4, regador-3d, flor-3d-fechada e flor-3d-aberta
  (exemplos/jardim-render-modelos.py);
- as duas: curso-chave-do-farol, curso-ilha-do-farol e curso-jardim (as artes das capas dos cursos), zappy.
"""
from edisvg_cena import AMARELO, BRANCO, NOITE, SUAVE, TINTA, VERDE
from ilha_cena import Personagem, chao, estrela, no_chao, pe_do_png, tecla, variavel

FADE = 0.28
GRAMA, GRAMA_BORDA = "#A8D68A", "#6FAE55"
AVISO_FUNDO = "#1F3A2C"

# O painel do jogo 2D: o jogo de 960 x 600 em escala S a partir de (X0, Y0), à esquerda da apresentadora.
X0, Y0, S = 110, 300, 1.15
# Nas cenas, um pouco maiores que no jogo (72, 60 e 96), para o personagem não sumir no painel.
PERSONAGEM_2D, REGADOR_2D, FLOR_2D = (130, 300, 100), (290, 180, 82), (730, 240, 120)


def vis(c, no, intervalos):
    """Uma trilha de opacidade com os intervalos visíveis [(t0, t1), ...] (t1 None: até o fim)."""
    ch = [(intervalos[0][0] - 0.01, 0, None)]
    for t0, t1 in intervalos:
        ch += [(t0, 0, None), (t0 + FADE, 100, None)]
        if t1 is not None:
            ch += [(t1 - FADE, 100, None), (t1, 0, None)]
    c.trilha(no, "opacity", ch)


def gx(x):
    return X0 + x * S


def gy(y):
    return Y0 + y * S


def painel2d(c, t0, t1=None):
    """O fundo do jogo 2D (o jardim) num cartão branco."""
    g, _ = c.bloco("jardim-acolhedor", X0, Y0, S * 960 / 1920, fundo=BRANCO, pad=10)
    vis(c, g, [(t0, t1)])
    return g


def sprite2d(c, nome, arq, x, y, w):
    """Um sprite do jogo 2D, em coordenadas do jogo (canto de cima à esquerda e largura). Opacidade 0."""
    from ilha_cena import figura

    f = figura(c, arq)
    pw = int(f["attrs"]["width"])
    g = c.grupo(nome, gx(x), gy(y), [f], op=0, s=w * S / pw)
    c.nos.append(g)
    return g


def caminho2d(c, g, pontos):
    """Leva o sprite pelos pontos [(t, x, y), ...] do jogo, numa trilha por propriedade."""
    c.trilha(g, "x", [(t, gx(x), SUAVE if k else None) for k, (t, x, _) in enumerate(pontos)])
    c.trilha(g, "y", [(t, gy(y), SUAVE if k else None) for k, (t, _, y) in enumerate(pontos)])


def aviso2d(c, mensagens, t1):
    """A faixa do aviso no alto do jogo 2D, com as mensagens [(t, texto), ...]: cada uma até a seguinte."""
    faixa = c.rect("Aviso · faixa", gx(12), gy(12), 936 * S, 38 * S, AVISO_FUNDO, rx=8, op=0)
    c.nos.append(faixa)
    vis(c, faixa, [(mensagens[0][0], t1)])
    for k, (t, texto) in enumerate(mensagens):
        fim = mensagens[k + 1][0] if k + 1 < len(mensagens) else t1
        n = c.texto(f"Aviso · {k + 1}", texto, gx(30), gy(12) + 32, 30, BRANCO, familia="Nunito", peso=800, op=0)
        c.nos.append(n)
        vis(c, n, [(t, fim)])


def flor2d(c, t0, t_abre, t1, x=None, y=None):
    """A flor fechada que abre em t_abre (None: fica fechada), no lugar do jogo ou em (x, y)."""
    x = FLOR_2D[0] if x is None else x
    y = FLOR_2D[1] if y is None else y
    fechada = sprite2d(c, "Flor fechada", "flor-fechada", x, y, FLOR_2D[2])
    vis(c, fechada, [(t0, t_abre or t1)])
    if t_abre:
        aberta = sprite2d(c, "Flor aberta", "flor-aberta", x, y, FLOR_2D[2])
        vis(c, aberta, [(t_abre, t1)])
        for p in ("sx", "sy"):
            e = aberta["transform"]["sx"]
            c.trilha(aberta, p, [(t_abre, 0.75 * e, SUAVE), (t_abre + 0.3, 1.08 * e, None), (t_abre + 0.45, e, None)])
        estrela_no(c, gx(x + 48), gy(y - 10), t_abre + 0.2, t1)


def estrela_no(c, cx, cy, t0, t1, r=34):
    e = estrela(c, "Brilho", cx, cy, r)
    vis(c, e, [(t0, t1)])
    return e


def regador2d(c, t0, t_some, t1, x=None, y=None):
    x = REGADOR_2D[0] if x is None else x
    y = REGADOR_2D[1] if y is None else y
    r = sprite2d(c, "Regador", "regador-azul", x, y, REGADOR_2D[2])
    vis(c, r, [(t0, t_some or t1)])
    return r


def personagem2d(c, t0, t1, pontos):
    """O aventureiro do jogo 2D (o sprite), visível de t0 a t1, pelos pontos [(t, x, y), ...]."""
    p = sprite2d(c, "Aventureiro", "aventureiro", pontos[0][1], pontos[0][2], PERSONAGEM_2D[2])
    vis(c, p, [(t0, t1)])
    if len(pontos) > 1:
        caminho2d(c, p, pontos)
    return p


def setas(c, t0, t1, cx=660, cy=1020, toques=()):
    """As quatro setas da tela, numa fila embaixo do jogo; toques = [(t, "dir"), ...] afundam a tecla."""
    teclas = {}
    for k, s in enumerate(("esq", "cima", "baixo", "dir")):
        g = tecla(c, f"Seta · {s}", cx + (k - 1.5) * 112, cy, seta=s, s=0.85)
        vis(c, g, [(t0 + 0.08 * k, t1)])
        teclas[s] = g
    por_tecla = {}
    for t, s in toques:
        por_tecla.setdefault(s, []).append(t)
    for s, ts in por_tecla.items():
        ch = []
        for t in ts:
            ch += [(t - 0.05, 0.85, None), (t + 0.06, 0.7, None), (t + 0.22, 0.85, None)]
        for p in ("sx", "sy"):
            c.trilha(teclas[s], p, ch)
    return teclas


def memoria(c, t0, t_vira, t1, cx=660, cy=640):
    """A memória temRegador: falso, e verdadeiro quando o personagem pega o regador."""
    vals = [(t0 + 0.2, "falso", TINTA)] + ([(t_vira, "verdadeiro", VERDE)] if t_vira else [])
    return variavel(c, "Memória", "temRegador", cx, cy, vals, w=560, t0=t0, t1=t1)


def caixa_em(c, nome, texto, cx, cy, w, t0, t1, fill=BRANCO, cor=TINTA, num=None, tam=40):
    g = c.caixa(nome, texto, fill, cor, cx, cy, w, num=num, tam=tam)
    c.mostra(g, t0, t1, pop=True)
    return g


# ── O jardim 3D (Aula 2): o chão em perspectiva e os renders, em (px, py, s) com a base no lugar ──────────
P3, R3, F3 = (330, 960, 0.5), (640, 700, 0.38), (1010, 860, 0.5)


def chao3d(c, t0, t1=None):
    return chao(c, t0, t1, cor=GRAMA, borda=GRAMA_BORDA)


def regador3d(c, t0, t_some, t1, onde=R3):
    g = no_chao(c, "Regador", "regador-3d", *onde)
    vis(c, g, [(t0, t_some or t1)])
    return g


def flor3d(c, t0, t_abre, t1, onde=F3, t_fecha=None):
    """A flor 3D fechada; em t_abre floresce (aberta com pop). t_fecha: volta a fechar (uma nova partida)."""
    fechada = no_chao(c, "Flor fechada", "flor-3d-fechada", *onde)
    abertos = [(t_abre, t_fecha or t1)] if t_abre else []
    fechados = [(t0, t_abre or t1)] + ([(t_fecha, t1)] if t_fecha else [])
    vis(c, fechada, fechados)
    if t_abre:
        aberta = no_chao(c, "Flor aberta", "flor-3d-aberta", *onde)
        vis(c, aberta, abertos)
        estrela_no(c, onde[0] + 40, onde[1] - 420 * onde[2], t_abre + 0.2, t_fecha or t1)


def personagem3d(c, nome, t0, t1, caminho):
    """O aventureiro 3D: visível de t0 a t1; caminho = [(ta, tb, de, para), ...] (andar) ou [(t, onde)] (parado)."""
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


def aviso3d(c, mensagens, t1, y=330):
    faixa = c.rect("Aviso · faixa", 140, y, 1120, 76, AVISO_FUNDO, rx=16, op=0)
    c.nos.append(faixa)
    vis(c, faixa, [(mensagens[0][0], t1)])
    for k, (t, texto) in enumerate(mensagens):
        fim = mensagens[k + 1][0] if k + 1 < len(mensagens) else t1
        n = c.texto(f"Aviso · {k + 1}", texto, 170, y + 52, 38, BRANCO, familia="Nunito", peso=800, op=0)
        c.nos.append(n)
        vis(c, n, [(t, fim)])


# ── "Onde você aprendeu": a arte da capa do curso base, a aula e as partes ─────────────────────────────────
def curso_base(c, arte, aulas, t0, t1):
    """aulas = [(rotulo da aula, [partes]), ...]: a arte do curso à esquerda e, à direita, cada aula numa pílula
    amarela com as partes embaixo, uma depois da outra."""
    img, _ = c.bloco(arte, 120, 330, 500 / 1000, fundo=BRANCO, pad=12)
    c.mostra(img, t0 + 0.1, t1, pop=True)
    y, t = 330, t0 + 0.6
    for rotulo, partes in aulas:
        caixa_em(c, f"Aula · {rotulo}", rotulo, 960, y + 40, 600, t, t1, fill=AMARELO, tam=38)
        y, t = y + 120, t + 0.45
        for parte in partes:
            caixa_em(c, f"Parte · {parte}", parte, 960, y + 40, 600, t, t1, tam=32)
            y, t = y + 112, t + 0.45
    return img


def zappy(c, t0, t1, px=1150, py=1000, s=0.45):
    g = no_chao(c, "Zappy", "zappy", px, py, s)
    vis(c, g, [(t0, t1)])
    return g


__all__ = ["AMARELO", "BRANCO", "NOITE", "TINTA", "VERDE", "pe_do_png"]
