"""Peças das animações de conceito do Cadê Todo Mundo (regravação de 26/11/2026), por cima de edisvg_cena: o
jardim do jogo com as artes de verdade, os esconderijos que ficam invisíveis, os bichos atrás deles, o placar
Achados, a mensagem do fim, o toque, a variável, o placar de futebol e o presente da surpresa.

Imagens na pasta de blocos da parte (PNG transparente, 4 vezes o tamanho do jogo; o fundo, 3 vezes):
jardim, arbusto, pedras, flores, toco, cogumelo, folhas, coelho, raposa, coruja, gato, sapo, tartaruga,
esquilo (as artes do projeto-final.szproject.json do curso) e zappy.

As medidas vêm do script.js do projeto final: palco de 640 x 360, esconderijos de 161 x 144 com o canto em
(56,5, 137), (229,5, 137) e (402,5, 137), bichos de 72 x 87 em (101, 181), (274, 181) e (447, 181), o placar
em (18, 34) com 24 px e a mensagem em (174, 72) com 27 px. O EdiSVG aceita uma trilha por propriedade em cada
nó: cada peça recebe todos os seus tempos de uma vez (vis() com os intervalos visíveis).
"""
from edisvg_cena import AMARELO, BRANCO, NOITE, SUAVE, TINTA, VAIVEM, VERDE, mao_toque, nid, tf
from ilha_cena import circulo, estrela, figura
from jardim_cena import caixa_em, vis

TEXTO_JOGO = "#173844"
# O painel do jogo: o palco de 640 x 360 em escala S a partir de (X0, Y0), à esquerda da apresentadora.
X0, Y0, S = 120, 330, 1.72
ESCONDERIJOS = [(56.5, 137), (229.5, 137), (402.5, 137)]
BICHOS = [(101, 181), (274, 181), (447, 181)]
ARTES_ESCONDERIJO = ["arbusto", "pedras", "flores"]
ARTES_BICHO = ["coelho", "raposa", "coruja"]


def gx(x):
    return X0 + x * S


def gy(y):
    return Y0 + y * S


def centro(k):
    """O meio do esconderijo k (0, 1, 2), em pixels da cena."""
    x, y = ESCONDERIJOS[k]
    return gx(x + 80.5), gy(y + 72)


def painel(c, t0, t1=None):
    """O fundo do jogo (o jardim) num cartão branco."""
    g, _ = c.bloco("jardim", X0, Y0, S * 640 / 1920, fundo=BRANCO, pad=10)
    vis(c, g, [(t0, t1)])
    return g


def sprite(c, nome, arq, x, y, w, s_extra=1.0):
    """Um sprite do jogo, com o canto de cima à esquerda em (x, y) do jogo e a largura w do jogo."""
    f = figura(c, arq)
    pw = int(f["attrs"]["width"])
    g = c.grupo(nome, gx(x), gy(y), [f], op=0, s=w * S * s_extra / pw)
    c.nos.append(g)
    return g


def bicho(c, k, t0, t1=None, arte=None):
    x, y = BICHOS[k]
    g = sprite(c, f"Bicho {k + 1}", arte or ARTES_BICHO[k], x, y, 72)
    vis(c, g, [(t0, t1)])
    return g


def esconderijo(c, k, t0, t_some=None, t1=None, arte=None, sumir=0.45, trilha=True):
    """O esconderijo k, visível de t0 e ficando invisível em t_some (a visibilidade cai a 0 em `sumir` s).
    trilha=False: sem trilha de opacidade (a cena dá a sua)."""
    x, y = ESCONDERIJOS[k]
    g = sprite(c, f"Esconderijo {k + 1}", arte or ARTES_ESCONDERIJO[k], x, y, 161)
    if not trilha:
        return g
    if t_some is None:
        vis(c, g, [(t0, t1)])
    else:
        c.trilha(g, "opacity", [(t0 - 0.01, 0, None), (t0, 0, None), (t0 + 0.28, 100, None), (t_some, 100, None),
                                (t_some + sumir, 0, None)])
    return g


def jardim(c, t0, t1, toques=(), achados=None, bichos=True, mensagem=None, artes_bicho=None, artes_esc=None,
           achados_antes=()):
    """O jogo inteiro: o fundo, os bichos, os esconderijos (toques = [(t, k), ...] deixam o k invisível em t;
    achados_antes = os que já começam invisíveis), o placar (achados = [(t, n), ...], None sem placar) e a
    mensagem do fim em `mensagem` (segundo ou None)."""
    painel(c, t0, t1)
    some = {k: t for t, k in toques}
    for k in range(3):
        if bichos:
            bicho(c, k, t0 + 0.05, t1, arte=(artes_bicho or ARTES_BICHO)[k])
    for k in range(3):
        if k not in achados_antes:
            esconderijo(c, k, t0 + 0.05, some.get(k), t1, arte=(artes_esc or ARTES_ESCONDERIJO)[k])
    for t, k in toques:
        toque(c, *centro(k), t)
    if achados:
        placar(c, achados, t1)
    if mensagem:
        m = c.texto("Mensagem do fim", "Você achou todo mundo!", gx(174), gy(72), round(27 * S), TEXTO_JOGO, op=0)
        c.nos.append(m)
        c.mostra(m, mensagem, t1, pop=True)


def placar(c, valores, t1, destaque=None):
    """O placar do jogo, "Achados: n", com os valores [(t, n), ...]: cada um até o seguinte (o novo entra com pop).
    destaque = (t0, t1): o contorno amarelo em volta dele."""
    for k, (t, n) in enumerate(valores):
        fim = valores[k + 1][0] if k + 1 < len(valores) else t1
        v = c.texto(f"Achados · {n}", f"Achados: {n}", gx(18), gy(34), round(24 * S), TEXTO_JOGO, op=0)
        c.nos.append(v)
        if k == 0:
            vis(c, v, [(t, fim)])
        else:
            c.mostra(v, t, fim, pop=True)
    if destaque:
        r = c.rect("Achados · destaque", gx(8), gy(6), 170 * S, 40 * S, "none", rx=12, stroke=AMARELO, sw=7, op=0)
        c.nos.append(r)
        c.pisca(r, *destaque)


def toque(c, cx, cy, t):
    """O toque: um anel amarelo que abre e some no ponto, e uma estrelinha."""
    anel = c.rect("Toque · anel", cx - 40, cy - 40, 80, 80, "none", rx=40, stroke=AMARELO, sw=8, op=0)
    c.nos.append(anel)
    c.trilha(anel, "opacity", [(t - 0.01, 0, None), (t, 100, None), (t + 0.45, 0, None)])
    e = estrela(c, "Toque · estrela", cx, cy, 26)
    c.trilha(e, "opacity", [(t - 0.01, 0, None), (t, 100, None), (t + 0.35, 100, None), (t + 0.6, 0, None)])
    for p in ("sx", "sy"):
        c.trilha(e, p, [(t, 0.6, SUAVE), (t + 0.25, 1.2, VAIVEM), (t + 0.5, 1.0, None)])


def dedo(c, cx, cy, t0, t_toca, t1):
    """A mão de desenho que toca em (cx, cy) em t_toca, com o anel e a estrelinha do toque."""
    g = mao_toque(c, [(t_toca, cx, cy)], t0, t1)
    toque(c, cx, cy, t_toca)
    return g


def presente(c, cx, cy, t0, t1, abre=None, s=1.0):
    """O presente da surpresa: caixa roxa com laço amarelo e um ponto de interrogação; abre=t levanta a tampa."""
    roxo, roxo2 = "#6D3BF5", "#5326D6"
    caixa = [c.rect("caixa", -150, -40, 300, 220, roxo, rx=22), c.rect("fita", -26, -40, 52, 220, AMARELO),
             # O "?" num círculo branco: branco sobre a fita amarela dava 1,6 de contraste (27/11/2026).
             c.rect("fundo", -74, -6, 148, 148, BRANCO, rx=74),
             c.texto("interrogação", "?", 0, 120, 150, roxo, ancora="middle")]
    g = c.grupo("Presente", cx, cy, caixa, op=0, s=s)
    c.nos.append(g)
    c.mostra(g, t0, t1, pop=True)
    tampa = c.grupo("Presente · tampa", cx, cy, [c.rect("tampa", -172, -110, 344, 80, roxo2, rx=20),
                                                 c.rect("fita da tampa", -26, -110, 52, 80, AMARELO),
                                                 c.rect("laço 1", -78, -160, 70, 56, AMARELO, rx=28),
                                                 c.rect("laço 2", 8, -160, 70, 56, AMARELO, rx=28)], op=0, s=s)
    c.nos.append(tampa)
    c.mostra(tampa, t0, t1, pop=True)
    if abre:
        c.trilha(tampa, "y", [(abre, cy, SUAVE), (abre + 0.4, cy - 120 * s, None)])
        for k, (dx, dy) in enumerate(((-120, -260), (0, -300), (120, -260))):
            e = estrela(c, f"Brilho {k + 1}", cx + dx * s, cy + dy * s, 30)
            vis(c, e, [(abre + 0.2 + 0.15 * k, t1)])
    return g


def placar_futebol(c, cx, cy, t0, t1, gols):
    """Um placar de estádio: dois times e os números; gols = [(t, a, b), ...] (cada placar até o seguinte)."""
    filhos = [c.rect("placar", -330, -120, 660, 240, NOITE, rx=28),
              c.rect("visor A", -290, -60, 220, 150, "#1E2A4A", rx=18), c.rect("visor B", 70, -60, 220, 150, "#1E2A4A", rx=18),
              c.texto("time A", "TIME A", -180, -78, 34, AMARELO, ancora="middle"),
              c.texto("time B", "TIME B", 180, -78, 34, AMARELO, ancora="middle"),
              c.texto("x", "x", 0, 40, 60, BRANCO, ancora="middle")]
    g = c.grupo("Placar de futebol", cx, cy, filhos, op=0)
    c.nos.append(g)
    c.mostra(g, t0, t1, pop=True)
    for k, (t, a, b) in enumerate(gols):
        fim = gols[k + 1][0] if k + 1 < len(gols) else t1
        for lado, n, dx in (("A", a, -180), ("B", b, 180)):
            v = c.texto(f"Placar {lado} · {n}", str(n), cx + dx, cy + 60, 120, BRANCO, ancora="middle", op=0)
            c.nos.append(v)
            if k and str(n) != str(gols[k - 1][1 if lado == "A" else 2]):
                c.mostra(v, t, fim, pop=True)
            else:
                vis(c, v, [(t, fim)])
    return g


def bola(c, cx, cy, t0, t1, para=None):
    """Uma bola de futebol simples; para=(t, x, y) a leva até lá (o gol)."""
    g = c.grupo("Bola", cx, cy, [circulo(c, "bola", 0, 0, 46, BRANCO, borda=NOITE, sw=5),
                                 c.poly("gomo", [(0, -16), (15, -5), (9, 13), (-9, 13), (-15, -5)], NOITE)], op=0)
    c.nos.append(g)
    vis(c, g, [(t0, t1)])
    if para:
        t, x, y = para
        c.trilha(g, "x", [(t - 0.6, cx, SUAVE), (t, x, None)])
        c.trilha(g, "y", [(t - 0.6, cy, SUAVE), (t, y, None)])
    return g


def ligacao(c, x0, y, x1, t0, t1, rotulo="ligada"):
    """Uma corrente entre duas caixas (a reação ligada à ação): uma barra verde que cresce e o rótulo."""
    barra = c.rect("Ligação", x0, y - 8, x1 - x0, 16, VERDE, rx=8, op=0)
    c.nos.append(barra)
    vis(c, barra, [(t0, t1)])
    r = c.texto("Ligação · rótulo", rotulo, (x0 + x1) / 2, y - 66, 36, BRANCO, familia="Nunito", peso=800,
                ancora="middle", op=0)
    c.nos.append(r)
    c.mostra(r, t0 + 0.2, t1, pop=True)
    return barra


def visibilidade(c, cx, cy, t0, t1, passos):
    """A régua da visibilidade: "visibilidade: N%" com os passos [(t, n), ...]."""
    filhos = [c.rect("régua", -260, -50, 520, 100, BRANCO, rx=30)]
    g = c.grupo("Visibilidade", cx, cy, filhos, op=0)
    c.nos.append(g)
    c.mostra(g, t0, t1, pop=True)
    for k, (t, n) in enumerate(passos):
        fim = passos[k + 1][0] if k + 1 < len(passos) else t1
        v = c.texto(f"Visibilidade · {n}", f"visibilidade: {n}%", cx, cy + 16, 46, TINTA, ancora="middle", op=0)
        c.nos.append(v)
        c.mostra(v, t, fim, pop=k > 0)
    return g


def interrogacao(c, cx, cy, t0, t1, tam=110):
    q = c.texto("Pergunta", "?", cx, cy, tam, AMARELO, ancora="middle", op=0)
    c.nos.append(q)
    c.mostra(q, t0, t1, pop=True)
    return q


def check(c, cx, cy, t0, t1):
    """Um sinal de certo verde num círculo branco."""
    g = c.grupo("Certo", cx, cy, [circulo(c, "fundo", 0, 0, 30, BRANCO),
                                  c.poly("certo", [(-16, 0), (-5, 12), (17, -12), (12, -17), (-5, 2), (-11, -5)], VERDE)],
                op=0)
    c.nos.append(g)
    c.mostra(g, t0, t1, pop=True)
    return g


__all__ = ["AMARELO", "BRANCO", "NOITE", "TINTA", "VERDE", "caixa_em", "vis", "nid", "tf"]
