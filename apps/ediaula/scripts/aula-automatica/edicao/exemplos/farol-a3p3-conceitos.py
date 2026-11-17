"""Exemplo: as três animações de conceito da Farol Aula 3 Parte 3, "Acenda o farol com a chave" (0:13, 0:38 e 1:14).

Os quadros do jogo e os blocos saem da gravação de 17/11/2026 (recortar.sh, segundos da voz):
  recortar.sh <gravação> 12.5  1245 295 1902 787 blocos/jogo-porta-apagado.png  (com a chave na porta, apagado)
  recortar.sh <gravação> 179.6 1245 295 1902 787 blocos/jogo-aceso.png          (o farol aceso e o barco)
  recortar.sh <gravação> 38.3  705 388 1475 660  blocos/se-vazio.png            (o Se com o então vazio)
  recortar.sh <gravação> 12.2  255 655 640 705   blocos/criar-ganhou.png        (Criar variável ganhou)
  recortar.sh <gravação> 206   788 460 1278 530  blocos/alterar-ganhou.png      (ganhou para verdadeiro)
  recortar.sh <gravação> 206   788 528 1388 597  blocos/trocar-imagem.png       (Trocar imagem do sprite)
As artes (barco, farol apagado e aceso) vêm da base do curso (base_jogo.py).
Uso: farol-a3p3-conceitos.py <base.edisvg> <pasta dos blocos> <pasta de saída (a pasta pecas da parte)>
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from edisvg_cena import AREA_GAVETA, BRANCO, SUAVE, TINTA, VAIVEM, VERDE, AMARELO, Cena  # noqa: E402

PASTAS = sys.argv[1:4]


def aparece(c, no, t0, t1=None, pop=True):
    c.mostra(no, t0, t1, pop=pop)


def quadro_jogo(c, arq, x, y, s, t0, t1=None):
    g, dest = c.bloco(arq, x, y, s, fundo=BRANCO, pad=10)
    c.trilha(g, "opacity", [(t0, 0, None), (t0 + 0.3, 100, None)] + ([(t1 - 0.25, 100, None), (t1, 0, None)] if t1 else []))
    return g, dest


# 1. A resposta do sim (0:13,0 a 0:32,6).
c = Cena("Conceito · A resposta do sim", 13.0, 32.6, *PASTAS)
c.ideia("A resposta do sim", 13.0, None, "Lembra da experiência?", t1_sub=15.85, ts=13.1)
c.ideia(None, 15.9, None, "Com a chave, a resposta era sim: o farol acendia.", t1_sub=20.25)
c.ideia(None, 20.3, None, "Essa resposta vai no então do seu jogo.", t1_sub=23.75)
c.ideia(None, 23.8, None, "Três blocos, um embaixo do outro.")
X, Y, S = 150, 310, 1.42
quadro_jogo(c, "jogo-porta-apagado", X, Y, S, 13.4, 18.75)
quadro_jogo(c, "jogo-aceso", X, Y, S, 18.6, 20.25)
pergunta = c.balao("Balão · Tem a chave?", "Tem a chave?", 760, 470, 330, -60)
aparece(c, pergunta, 16.0, 20.25)
sim = c.caixa("Caixa · Sim", "Sim", BRANCO, TINTA, 760, 610, 190, num=1)
aparece(c, sim, 17.4, 20.25)
se, dest = c.bloco("se-vazio", 110, 300, 1.3)
aparece(c, se, 20.4)
vaga = dest("Destaque · espaço do então", 85, 70, 372, 108)
c.pisca(vaga, 22.0, 32.6, vezes=4)
for k, (texto, t0) in enumerate([("Chama o barco", 28.3), ("Acende a luz", 29.6), ("Avisa quem joga", 30.8)]):
    caixa = c.caixa(f"Caixa · {texto}", texto, VERDE if k == 2 else BRANCO, AMARELO if k == 2 else TINTA,
                    470, 735 + k * 112, 560, num=k + 1)
    aparece(c, caixa, t0)
c.salvar("conceito-1-a-resposta-do-sim")

# 2. O primeiro bloco chama o barco: ganhou (0:38,5 a 0:47,1).
c = Cena("Conceito · Ganhou chama o barco", 38.5, 47.1, *PASTAS)
c.ideia("1. Chama o barco", 38.5, None, "O primeiro bloco chama o barco.", t1_sub=40.9, ts=38.6)
c.ideia(None, 40.95, None, "Quem chama o barco é a variável ganhou.", t1_sub=43.65)
c.ideia(None, 43.7, None, "Ganhou verdadeiro: o barco começa a chegar.")
mar = c.rect("Mar", 96, 640, 1170, 360, "#7CC6F2", rx=36, op=0)
c.nos.append(mar)
c.mostra(mar, 38.7)
barco = c.instancia("barco · veleiro", 1000, 700, 260)
c.trilha(barco, "opacity", [(39.0, 0, None), (39.3, 100, None)])
c.trilha(barco, "x", [(39.0, 1000, None), (45.4, 1000, VAIVEM), (47.0, 560, None)])
criar, dest_c = c.bloco("criar-ganhou", 130, 330, 1.9, fundo=AREA_GAVETA)
c.trilha(criar, "opacity", [(41.0, 0, None), (41.3, 100, None), (43.55, 100, None), (43.75, 0, None)])
c.pisca(dest_c("Destaque · ganhou", 118, 4, 186, 46), 42.0, 43.6, vezes=2)
alt, dest_a = c.bloco("alterar-ganhou", 130, 330, 1.9)
aparece(c, alt, 43.75)
c.pisca(dest_a("Destaque · verdadeiro", 306, 10, 474, 60), 44.3, 47.1, vezes=3)
c.salvar("conceito-2-ganhou-chama-o-barco")

# 3. O segundo bloco acende a luz: o farol troca de imagem (1:14,4 a 1:19,9).
c = Cena("Conceito · O farol troca de imagem", 74.4, 79.9, *PASTAS)
c.ideia("2. Acende a luz", 74.4, None, "Para isso, o farol troca de imagem.", t1_sub=77.0, ts=74.5)
c.ideia(None, 77.05, None, "Sai o farol apagado e entra o farol aceso.")
troca, dest_t = c.bloco("trocar-imagem", 130, 330, 1.75)
aparece(c, troca, 74.6)
c.pisca(dest_t("Destaque · farol aceso", 384, 10, 588, 58), 75.6, 79.9, vezes=3)
apagado = c.instancia("farol · farol-listrado-apagado", 380, 560, 420)
c.trilha(apagado, "opacity", [(75.0, 0, None), (75.3, 100, None), (77.3, 100, None), (77.8, 0, None)])
c.trilha(apagado, "x", [(77.3, 380, SUAVE), (77.8, 220, None)])
aceso = c.instancia("farol · farol-listrado-aceso", 380, 560, 420)
aparece(c, aceso, 78.6)
c.salvar("conceito-3-o-farol-troca-de-imagem")
