"""Exemplo: as duas animações de conceito da Farol Aula 3 Parte 6, "Como escolher um lugar para a chave".

Parte de experiência: a fala explica e convida, e a descoberta é da criança. As cenas usam as artes do jogo da
base do curso (base_jogo.py), nunca quadros da experiência ampliada, que mostram para que lado cada número
cresce. As setas do x e do y têm duas pontas: não dizem para que lado o número cresce.
  1. Um lugar para a chave e o mapa do tesouro (0:03,1 a 0:21,3): "[na edição: mapa do tesouro com setas]".
  2. Dois números: x e y (0:21,4 a 0:36,0).
Uso: farol-a3p6-conceitos.py <base.edisvg> <pasta dos blocos (não usada)> <pasta de saída (a pasta pecas da parte)>
"""

import copy
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from edisvg_cena import AMARELO, BRANCO, NOITE, TINTA, VERDE, Cena, nid, tf  # noqa: E402

PASTAS = sys.argv[1:4]
# O jogo (480 x 360) desenhado em K vezes, com o canto em (X0, Y0); as posições são as do Ao iniciar do projeto.
K, X0, Y0 = 1.6, 110, 300
CHAVE, PERSONAGEM, FAROL = (211, 53, 32), (21, 141, 64), (328, 40, 152)


def p(gx, gy):
    return X0 + gx * K, Y0 + gy * K


def arte(c, nome, gx, gy, gw, gh=None):
    """Uma arte do jogo no lugar dela (coordenadas do jogo)."""
    no = copy.deepcopy(c.arte[nome])
    no["id"] = nid()
    x, y = p(gx, gy)
    no["transform"] = tf(x, y, 0)
    no["instance"]["width"] = gw * K
    no["instance"]["height"] = (gh or gw) * K
    c.nos.append(no)
    return no


def cenario(c, t0, t1=None):
    """O jogo montado com as artes: cenário, farol, personagem e chave."""
    nos = [arte(c, "cenário · praia-tropical", 0, 0, 480, 360), arte(c, "farol · farol-listrado-apagado", *FAROL[:2], FAROL[2]),
           arte(c, "personagem · aventureiro", *PERSONAGEM[:2], PERSONAGEM[2]), arte(c, "chave · chave-dourada", *CHAVE[:2], CHAVE[2])]
    for no in nos:
        c.mostra(no, t0, t1)
    return nos


def seta(c, nome, a, b, t0, t1=None, duas=False, cor=AMARELO):
    """Seta reta (horizontal ou vertical) de a até b, em pixels do quadro, com contorno escuro."""
    (x0, y0), (x1, y1) = a, b
    horiz = abs(x1 - x0) >= abs(y1 - y0)
    e, ponta = 12, 30
    filhos = []
    for traço, grossura in ((NOITE, e + 6), (cor, e)):
        if horiz:
            filhos.append(c.rect("linha", min(x0, x1), y0 - grossura / 2, abs(x1 - x0), grossura, traço, rx=grossura / 2))
        else:
            filhos.append(c.rect("linha", x0 - grossura / 2, min(y0, y1), grossura, abs(y1 - y0), traço, rx=grossura / 2))
    pontas = [(b, a)] + ([(a, b)] if duas else [])
    for (px, py), (qx, qy) in pontas:
        if horiz:
            d = 1 if px > qx else -1
            pts = [(px + d * ponta * 0.4, py), (px - d * ponta * 0.8, py - ponta * 0.75), (px - d * ponta * 0.8, py + ponta * 0.75)]
        else:
            d = 1 if py > qy else -1
            pts = [(px, py + d * ponta * 0.4), (px - ponta * 0.75, py - d * ponta * 0.8), (px + ponta * 0.75, py - d * ponta * 0.8)]
        filhos.append(c.poly("ponta", pts, cor))
    g = c.grupo(nome, 0, 0, filhos)
    c.nos.append(g)
    c.mostra(g, t0, t1)
    return g


def contorno(c, nome, gx, gy, gw, t0, t1, cor=AMARELO):
    x, y = p(gx, gy)
    r = c.rect(nome, x - 10, y - 10, gw * K + 20, gw * K + 20, "none", rx=18, stroke=cor, sw=6, op=0)
    c.nos.append(r)
    c.pisca(r, t0, t1, vezes=2)
    return r


cx, cy = p(CHAVE[0] + CHAVE[2] / 2, CHAVE[1] + CHAVE[2] / 2)  # o meio da chave, no quadro

# 1. Um lugar para a chave e o mapa do tesouro (0:03,1 a 0:21,3).
c = Cena("Conceito · Um lugar para a chave", 3.1, 21.3, *PASTAS)
c.ideia("Um lugar para a chave", 3.1, 13.1, "No seu jogo, a chave começa sempre no mesmo lugar.", t1_sub=4.15, ts=3.2)
c.ideia(None, 4.2, None, "Daqui a pouco, você escolhe outro lugar.", t1_sub=7.6)
c.ideia(None, 7.65, None, "Como o jogo sabe onde fica cada coisa?", t1_sub=13.1)
c.ideia("Como num mapa do tesouro", 13.15, None, "Quantos passos para os lados e para cima ou para baixo.")
cenario(c, 3.2)
contorno(c, "Destaque · a chave", *CHAVE, 3.4, 4.2)
outra = arte(c, "chave · chave-dourada", 300, 250, CHAVE[2])
c.trilha(outra, "opacity", [(4.8, 0, None), (5.1, 55, None), (13.0, 55, None), (13.2, 0, None)])
duvida = c.balao("Balão · Outro lugar?", "Outro lugar?", *p(330, 215), 330, 0)
c.mostra(duvida, 5.3, 13.0, pop=True)
# O mapa: do personagem até o tesouro, primeiro para o lado, depois para cima.
pa = p(PERSONAGEM[0] + PERSONAGEM[2] / 2, PERSONAGEM[1] + PERSONAGEM[2] / 2)
canto = (cx, pa[1])
seta(c, "Seta · passos para os lados", (pa[0] + 50, pa[1]), canto, 16.3)
seta(c, "Seta · passos para cima ou para baixo", canto, (cx, cy + 40), 18.45)
tesouro = c.caixa("Caixa · tesouro", "Tesouro!", VERDE, AMARELO, cx + 10, cy - 95, 260)
c.mostra(tesouro, 14.8, pop=True)
lados = c.caixa("Caixa · passos para os lados", "Passos para os lados", BRANCO, TINTA, 1090, 520, 400, num=1, tam=38)
c.mostra(lados, 16.6, pop=True)
cima = c.caixa("Caixa · passos para cima ou baixo", "Para cima ou baixo", BRANCO, TINTA, 1090, 650, 400, num=2, tam=38)
c.mostra(cima, 18.8, pop=True)
c.salvar("conceito-1-um-lugar-para-a-chave")

# 2. Dois números: x e y (0:21,4 a 0:36,0). Setas de duas pontas: o lado para onde cada número cresce é a
# descoberta da criança na experiência.
c = Cena("Conceito · Dois números, x e y", 21.4, 36.0, *PASTAS)
c.ideia("Dois números: x e y", 21.4, None, "O lugar da chave é dito com dois números.", t1_sub=27.25, ts=21.5)
c.ideia(None, 27.3, None, "O x cuida dos lados: a direção horizontal.", t1_sub=31.95)
c.ideia(None, 32.0, None, "O y cuida de cima e de baixo: a direção vertical.")
cenario(c, 21.5)
contorno(c, "Destaque · a chave", *CHAVE, 22.4, 25.3)
xy = c.caixa("Caixa · x e y", "x e y", BRANCO, TINTA, cx + 10, cy - 95, 200)
c.mostra(xy, 25.4, 27.4, pop=True)
seta(c, "Seta · x, os lados", (X0 + 40, cy), (X0 + 480 * K - 40, cy), 27.5, duas=True)
seta(c, "Seta · y, cima e baixo", (cx, Y0 + 30), (cx, Y0 + 360 * K - 30), 32.2, duas=True)
cx_ = c.caixa("Caixa · x horizontal", "x: os lados", BRANCO, TINTA, 1090, 520, 400, num=1, tam=40)
c.mostra(cx_, 28.0, pop=True)
cy_ = c.caixa("Caixa · y vertical", "y: cima e baixo", BRANCO, TINTA, 1090, 650, 400, num=2, tam=40)
c.mostra(cy_, 32.7, pop=True)
c.salvar("conceito-2-dois-numeros-x-e-y")
