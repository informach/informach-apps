"""Exemplo: as três animações de conceito da Farol Aula 3 Parte 5, "Escreva seus avisos" (0:03, 1:23 e 1:56).

Os quadros do jogo e os blocos saem da gravação de 17/11/2026 (recortar.sh, segundos da voz):
  recortar.sh <gravação> 98.6  1245 332 1902 824 blocos/jogo-comeco.png      (o jogo começa)
  recortar.sh <gravação> 108.5 1245 332 1902 824 blocos/jogo-chave-pega.png
  recortar.sh <gravação> 104   1245 332 1902 824 blocos/jogo-sem-chave.png   (na porta, sem a chave)
  recortar.sh <gravação> 113.5 1245 332 1902 824 blocos/jogo-farol.png       (o farol aceso)
  recortar.sh <gravação> 104   451 196 1072 562  blocos/encontro-farol.png   (o Se do encontro com o farol)
  recortar.sh <gravação> 104   513 458 1070 512  blocos/aviso-opa.png
  recortar.sh <gravação> 83    1522 148 1852 207 blocos/se-ganhou.png        (outro bloco que usa o nome)
Os quadros do jogo já têm os avisos novos. No começo da parte a criança ainda tem os avisos que vieram no
projeto: a faixa do aviso é redesenhada por cima, com o texto original.
Uso: farol-a3p5-conceitos.py <base.edisvg> <pasta dos blocos> <pasta de saída (a pasta pecas da parte)>
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from edisvg_cena import AMARELO, BRANCO, SUAVE, TINTA, VAIVEM, VERDE, Cena  # noqa: E402

PASTAS = sys.argv[1:4]
FAIXA = "#123B35"  # a faixa do aviso no jogo
# A faixa do aviso no recorte do jogo (657 x 492): x 11 a 645, y 12 a 48; texto em 27, linha de base 39.
FX0, FY0, FX1, FY1 = 11, 12, 645, 48


def entra(c, no, t0, t1=None, pop=True):
    """Aparece (com pop) em t0 e some em t1."""
    c.mostra(no, t0, t1, pop=pop)


def aviso_por_cima(c, x, y, s, texto, t0, t1):
    """A faixa do aviso redesenhada sobre um quadro do jogo posto em (x, y) com escala s."""
    filhos = [c.rect("faixa", FX0 * s, FY0 * s, (FX1 - FX0) * s, (FY1 - FY0) * s, FAIXA),
              c.texto("aviso", texto, 27 * s, 39 * s, round(23 * s), BRANCO)]
    g = c.grupo(f"Aviso · {texto}", x, y, filhos)
    c.nos.append(g)
    c.trilha(g, "opacity", [(t0, 0, None), (t0 + 0.3, 100, None)] + ([(t1 - 0.25, 100, None), (t1, 0, None)] if t1 else []))
    return g


def quadro_jogo(c, arq, x, y, s, t0, t1=None, pop=False):
    g, dest = c.bloco(arq, x, y, s, fundo=BRANCO, pad=10)
    c.trilha(g, "opacity", [(t0, 0, None), (t0 + 0.3, 100, None)] + ([(t1 - 0.25, 100, None), (t1, 0, None)] if t1 else []))
    if pop:
        for p in ("sx", "sy"):
            c.trilha(g, p, [(t0, 0.85, SUAVE), (t0 + 0.28, 1.03, VAIVEM), (t0 + 0.42, 1, None)])
    return g, dest


# 1. Os quatro avisos (0:03,1 a 0:18,2).
c = Cena("Conceito · Os quatro avisos", 3.1, 18.2, *PASTAS)
c.ideia("Os quatro avisos", 3.1, None, "O seu jogo tem quatro avisos.", t1_sub=5.5, ts=3.2)
c.ideia(None, 5.6, None, "1. O do começo", t1_sub=6.8)
c.ideia(None, 6.85, None, "2. Quando a chave é pega", t1_sub=8.5)
c.ideia(None, 8.55, None, "3. Quando falta a chave", t1_sub=10.2)
c.ideia(None, 10.25, None, "4. Quando o farol acende", t1_sub=11.35)
c.ideia(None, 11.4, None, "Em cada um, você muda só o texto.", t1_sub=15.1)
c.ideia(None, 15.2, None, "O que você escrever aparece no seu jogo.")
X, Y, S = 150, 310, 1.42
MOMENTOS = [("jogo-comeco", "Encontre a chave e vá ao farol.", 5.6, 6.85),
            ("jogo-chave-pega", "Você pegou a chave! Agora vá ao farol.", 6.85, 8.55),
            ("jogo-sem-chave", "A porta não abriu. Falta a chave.", 8.55, 10.25),
            ("jogo-farol", "Você acendeu o farol! Olhe o barco chegando.", 10.25, 11.4)]
for i, (arq, texto, t0, t1) in enumerate(MOMENTOS):
    quadro_jogo(c, arq, X, Y, S, t0, t1, pop=i == 0)
    aviso_por_cima(c, X, Y, S, texto, t0, t1)
# Os quatro juntos: a faixa do aviso de cada um pisca (é só ela que muda).
s2 = 0.7
for i, (arq, texto, _, _) in enumerate(MOMENTOS):
    gx, gy = 110 + (i % 2) * 520, 300 + (i // 2) * 375
    _, dest = quadro_jogo(c, arq, gx, gy, s2, 11.4 + i * 0.12, 15.15)
    aviso_por_cima(c, gx, gy, s2, texto, 11.4 + i * 0.12, 15.15)
    faixa = dest(f"Destaque · aviso {i + 1}", FX0, FY0, FX1, FY1)
    c.pisca(faixa, 12.6 + i * 0.1, 15.05, vezes=3)
# O que a criança escreve aparece no jogo: o aviso do começo vira "Ache a chave da ilha!".
_, dest = quadro_jogo(c, "jogo-comeco", X, Y, S, 15.2, pop=True)
aviso_por_cima(c, X, Y, S, "Encontre a chave e vá ao farol.", 15.2, 16.4)
novo = dest("Destaque · aviso novo", FX0, FY0, FX1, FY1)
c.pisca(novo, 16.4, 18.2, vezes=2)
c.salvar("conceito-1-os-quatro-avisos")

# 2. Só o texto muda; os nomes ficam (1:23,7 a 1:32,5).
c = Cena("Conceito · Só o texto muda", 83.7, 92.5, *PASTAS)
c.ideia("Só o texto muda", 83.7, None, "Mude só os textos.", t1_sub=85.45, ts=83.8)
c.ideia(None, 85.5, None, "Os nomes ficam como estão.", t1_sub=89.7)
c.ideia(None, 89.75, None, "Outros blocos usam esses nomes.")
BX, BY, BS = 110, 320, 1.5
se, dest = c.bloco("encontro-farol", BX, BY, BS)
entra(c, se, 83.8)
textos = [dest("Destaque · texto do então", 360, 177, 582, 218), dest("Destaque · texto do senão", 357, 268, 604, 309)]
for d in textos:
    c.pisca(d, 84.2, 85.45, vezes=2)
muda = c.caixa("Caixa · muda o texto", "Muda: o texto", VERDE, AMARELO, 560, 945, 420)
entra(c, muda, 84.3, 85.45)
nomes = [("aviso", 85.9, [(193, 177, 248, 218), (193, 268, 248, 309)]), ("temChave", 86.9, [(192, 6, 284, 46)]),
         ("ganhou", 88.0, [(193, 63, 266, 102)])]
for nome, t0, caixas_nome in nomes:
    for k, (x0, y0, x1, y1) in enumerate(caixas_nome):
        d = dest(f"Destaque · {nome} {k + 1}", x0, y0, x1, y1)
        c.trilha(d, "opacity", [(t0, 0, None), (t0 + 0.25, 100, None), (t0 + 0.6, 40, None), (t0 + 0.9, 100, None),
                                (92.2, 100, None), (92.45, 0, None)])
fica = c.caixa("Caixa · o nome fica", "Fica: o nome", BRANCO, TINTA, 560, 945, 420)
entra(c, fica, 85.9, 89.7)
# Outro bloco que usa o mesmo nome: os dois "ganhou" piscam juntos.
outro, dest_o = c.bloco("se-ganhou", 560, 920, 1.5)
entra(c, outro, 90.0)
c.pisca(dest_o("Destaque · ganhou no outro bloco", 229, 6, 317, 53), 90.6, 92.5, vezes=2)
c.salvar("conceito-2-so-o-texto-muda")

# 3. Se algo não funcionou (1:56,3 a 2:03,9).
c = Cena("Conceito · Se algo não funcionou", 116.3, 123.9, *PASTAS)
c.ideia("Se algo não funcionou", 116.3, None, "A frase passou da tela? Deixe mais curta.", t1_sub=119.4, ts=116.4)
c.ideia(None, 119.45, None, "O aviso não mudou? Confira o texto do bloco.")
JX, JY, JS = 140, 310, 1.42
quadro_jogo(c, "jogo-farol", JX, JY, JS, 116.4, 119.4, pop=True)
# A frase comprida passa da faixa e sai do jogo; na hora do "deixe mais curta", vira a frase curta (a do jogo).
longa = aviso_por_cima(c, JX, JY, JS, "Você acendeu o farol! Olhe o barco chegando bem pertinho da ilha!", 116.5, 118.2)
fora = c.rect("Destaque · passou da tela", JX + 600 * JS, JY + 4 * JS, 230, 52, "none", rx=14, stroke=AMARELO, sw=6, op=0)
c.nos.append(fora)
c.pisca(fora, 117.2, 118.15, vezes=1)
aviso, dest_a = c.bloco("aviso-opa", 120, 560, 2.0)
entra(c, aviso, 119.5)
c.pisca(dest_a("Destaque · texto do aviso", 295, 6, 542, 47), 121.0, 123.9, vezes=3)
c.salvar("conceito-3-se-algo-nao-funcionou")
