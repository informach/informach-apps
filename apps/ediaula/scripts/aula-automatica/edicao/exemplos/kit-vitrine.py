"""Vitrine do kit das cenas (kit_cena.py): duas cenas curtas que usam todas as peças, para ver o padrão de uma vez.

Uso: kit-vitrine.py <base.edisvg> <pasta dos blocos do Cadê> <pasta de saída>
Depois: previa_cena.py <saida>/kit-1-acao-e-reacao.edisvg <folha.jpg> 8 --grande
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cade_jogo_cena import bicho, centro, esconderijo, gx, gy, painel, placar  # noqa: E402
from edisvg_cena import Cena, mao_toque  # noqa: E402
from kit_cena import anotacao, encaixar, foco, linha, mais_um, seta, selo  # noqa: E402

BASE, BLOCOS, SAIDA = sys.argv[1:4]

# 1. Ação e reação no jogo: a mão toca, o esconderijo some, o coelho aparece e Achados ganha um.
c = Cena("Kit · ação e reação", 0, 9, BASE, BLOCOS, SAIDA)
c.ideia("A ação e a reação", 0.05, 9, "O toque faz o esconderijo sumir")
painel(c, 0.2, 9)
t_toca, t_some = 1.6, 1.9
for k in range(3):
    bicho(c, k, 0.2, 9)
    esconderijo(c, k, 0.2, t_some if k == 0 else None, 9)
x, y = centro(0)
mao_toque(c, [(t_toca, x, y + 30)], 0.9, 3.2)
anotacao(c, "Ação", "Ação: o toque", (x + 40, y + 120), t_toca, 3.2, estilo="acao", centro=(x + 400, y + 200))
anotacao(c, "Reação", "Reação: sumir", (x, y - 30), 3.2, 9, estilo="reacao", centro=(x + 400, y - 220))
selo(c, "Achou", x + 110, y + 60, 4.6, 9)
placar(c, [(0.2, 0), (5.6, 1)], 9, destaque=(5.6, 7.5))
mais_um(c, "Achados", gx(225), gy(44), 5.6)
c.salvar("kit-1-acao-e-reacao", refazer=True)

# 2. Os blocos: o bloco de verdade entra e encaixa, o lugar da reação e o nome escolhido ganham anotação, a
# corrente toque, some e aparece em linha com setas, e no fim o foco no bloco.
c = Cena("Kit · os blocos", 0, 9, BASE, BLOCOS, SAIDA)
c.ideia("O bloco do toque", 0.05, 9, "Ele percebe quando você toca")
E, BX, BY = 1.4, 150, 360
g, destaque = c.bloco("bloco-quando-tocar", BX, BY, E)
c.mostra(g, 0.4, 9)
encaixar(c, g, (BX, BY + 100), (BX, BY), 0.4)
em = lambda px, py: (BX + px * E, BY + py * E)
anotacao(c, "Fazer", "A reação vai aqui", em(200, 92), 1.8, 9, centro=(BX + 200 * E, 740), estilo="reacao", anel_r=56)
anotacao(c, "Escolhido", "escolhido", em(707, 40), 3.0, 9, centro=(BX + 707 * E, 740), estilo="codigo")
pecas = linha(c, "Corrente", ["Toque", "Some", "Aparece"], 730, 930, 4.6, 9, estilo="termo", gap=110, passo=0.6)
for k, (a, b) in enumerate(zip(pecas, pecas[1:])):
    seta(c, f"Corrente {k + 1}", (a.x1 + 14, a.cy), (b.x0 - 14, b.cy), 4.9 + k * 0.6, 9, esp=14)
foco(c, "Bloco", BX - 40, BY - 40, BX + 772 * E + 40, BY + 150 * E + 40, 7.4, 9)
c.salvar("kit-2-os-blocos", refazer=True)
