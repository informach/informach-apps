"""Exemplo: as duas animações de conceito da Ilha do Farol, Aula 1, Parte 4, "Faça o personagem andar"
(22/11/2026).

  1. conceito-1-os-quadros (0:12,4 a 0:32,0): a parte de blocos relembra a experiência e o conceito no começo.
     "Na experiência, quem mudava de lugar era a câmera" (a câmera passa sobre a ilha 3D), "agora, quem vai sair
     do lugar é o personagem" (o aventureiro anda), "Lembra dos quadros do jogo 2D?": uma fila de quadros, cada um
     com o aventureiro um passinho adiante, e no "olhar as setas em todo quadro" uma seta embaixo de cada quadro.
  2. conceito-2-a-velocidade (1:23,4 a 1:32,3): o bloco de verdade (recortado da gravação, ainda com o 3),
     "personagem" (quem anda) e o número (a velocidade); no "quanto maior, mais rápido", dois aventureiros andam o
     mesmo caminho, um com 3 e outro com 6.
Os trechos "Dentro do bloco A cada quadro da cena…" e "Andando, ele mexe as pernas…" ficam na tela: um leva ao
arrasto da área, o outro é o próprio jogo.
Imagens (pasta de blocos): os renders do aventureiro, jogo-ilha.png (o recorte da Parte 1) e bloco-andar.png
(vídeo 87,37 s da gravação de 22/11, recorte 878,326 a 1556,400: o bloco selecionado, com o 3).
Uso: ilha-a1p4-conceitos.py <base.edisvg> <pasta dos blocos> <pasta de saída (a pasta pecas da parte)>
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from edisvg_cena import AMARELO, BRANCO, NOITE, SUAVE, TINTA, Cena  # noqa: E402
from ilha_cena import Personagem, camera, chao, circulo, figura  # noqa: E402

BASE, BLOCOS, SAIDA = sys.argv[1:4]
AZUL_CEU = "#9FD8FF"


def tecla_seta(c, nome, cx, cy, op=0):
    """A tecla da seta para a direita, desenhada (sem caractere de seta na fonte)."""
    filhos = [c.rect("tecla", -44, -40, 88, 80, NOITE, rx=16),
              c.poly("seta", [(-18, -20), (20, 0), (-18, 20)], BRANCO)]
    g = c.grupo(nome, cx, cy, filhos, op=op)
    c.nos.append(g)
    return g


# 1. Os quadros (12,4 a 32,0).
c = Cena("Conceito · Os quadros", 12.4, 32.0, BASE, BLOCOS, SAIDA)
c.ideia("Na experiência: a câmera", 12.45, 15.85, None)
c.ideia("Agora: o personagem anda", 15.9, 18.85, None)
c.ideia("Os quadros do jogo", 18.9, 26.4, None)
c.ideia(None, 21.21, 26.4, "Cada desenho é um quadro")
c.ideia("No 3D é igual", 26.44, 32.0, None)
c.ideia(None, 28.09, 32.0, "O jogo olha as setas em todo quadro")

ilha, _ = c.bloco("jogo-ilha", 330, 330, 0.62, fundo=BRANCO, pad=10)
c.mostra(ilha, 12.5, 15.85, pop=True)
cam = camera(c, "Câmera", 230, 380)
c.mostra(cam, 12.8, 15.85, pop=True)
c.trilha(cam, "x", [(13.4, 230, None), (15.1, 1150, SUAVE)])

chao(c, 15.95, 18.85)
anda = Personagem(c, "Aventureiro · andando")
anda.em(12.4, 300, 900, 0.7)
anda.anda(16.2, 18.5, (300, 900, 0.7), (1000, 900, 0.7))
c.trilha(anda.g, "opacity", [(15.95, 0, None), (16.2, 100, None), (18.6, 100, None), (18.85, 0, None)])
anda.fechar()

# A fila de quadros: cada um com o aventureiro um passinho adiante.
QX, QY, QW, QH, PASSO = 100, 400, 210, 210, 232
for k in range(5):
    x = QX + k * PASSO
    quadro = [c.rect("moldura", 0, 0, QW, QH, BRANCO, rx=18),
              c.rect("céu", 8, 8, QW - 16, QH - 16, AZUL_CEU, rx=12),
              c.rect("chão", 8, QH - 52, QW - 16, 44, "#F3D9A0", rx=10)]
    s = 0.27
    fig = figura(c, f"aventureiro-andando-{k % 4 + 1}")
    fig["transform"]["x"] = 26 + k * 26 - 168 * s
    fig["transform"]["y"] = QH - 18 - 645 * s
    fig["transform"]["sx"] = fig["transform"]["sy"] = s
    quadro.append(fig)
    g = c.grupo(f"Quadro {k + 1}", x, QY, quadro)
    c.nos.append(g)
    c.mostra(g, 21.8 + k * 0.62, pop=True)
    seta = tecla_seta(c, f"Seta · quadro {k + 1}", x + QW / 2, QY + QH + 80)
    c.mostra(seta, 30.67 + k * 0.22, pop=True)
c.mostra(c.caixa("Caixa · quadro", "quadro", BRANCO, TINTA, QX + QW / 2, QY - 60, 230), 25.76, pop=True)
c.salvar("conceito-1-os-quadros")

# 2. A velocidade (83,4 a 92,3).
c = Cena("Conceito · A velocidade", 83.4, 92.3, BASE, BLOCOS, SAIDA)
c.ideia("O bloco que faz andar", 83.45, 92.3, None)
S = 1.6
bloco, destaque = c.bloco("bloco-andar", 110, 300, S, pad=14)
c.mostra(bloco, 83.5, pop=True)
nome = destaque("Destaque · personagem", 76, 12, 212, 64)
c.pisca(nome, 84.69, 87.5)
c.mostra(c.caixa("Caixa · quem anda", "quem anda", BRANCO, TINTA, 110 + 144 * S, 520, 280, num=1), 84.9, 87.5, pop=True)
numero = destaque("Destaque · velocidade", 600, 18, 656, 58)
c.pisca(numero, 87.98, 92.3)
c.mostra(c.caixa("Caixa · velocidade", "velocidade", BRANCO, TINTA, 110 + 628 * S - 60, 520, 300, num=2), 88.2, 92.3, pop=True)

# "Quanto maior, mais rápido": o mesmo caminho com 3 e com 6.
for k, (n, y, fim) in enumerate(((3, 790, 92.25), (6, 990, 90.75))):
    raia = c.rect(f"Raia · {n}", 110, y - 14, 1120, 28, BRANCO, rx=14, op=0)
    c.nos.append(raia)
    c.trilha(raia, "opacity", [(89.4, 0, None), (89.6, 45, None)])
    selo = c.grupo(f"Selo · {n}", 160, y - 60, [circulo(c, "fundo", 0, 0, 46, BRANCO, borda=AMARELO, sw=6),
                                                 c.texto("número", str(n), 0, 20, 56, TINTA, ancora="middle")])
    c.nos.append(selo)
    c.mostra(selo, 89.45, pop=True)
    corre = Personagem(c, f"Aventureiro · velocidade {n}")
    corre.em(83.4, 280, y, 0.3)
    corre.anda(89.75, fim, (280, y, 0.3), (1130, y, 0.3), passo=0.16 if n == 3 else 0.08)
    c.trilha(corre.g, "opacity", [(89.45, 0, None), (89.7, 100, None)])
    corre.fechar()
c.salvar("conceito-2-a-velocidade")
