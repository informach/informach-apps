"""Exemplo: as animações da Ilha do Farol, Aula 2, Parte 1, "Para onde vai a chave?" (parte de experiência,
22/11/2026). A fala inteira vira cena (pedido dela de 22/11): nada da tela da experiência.

O que cada número muda é a descoberta da criança: nenhuma cena diz que o y é a altura ou que o z é a
profundidade. As cenas mostram que o 3D tem três números, a estante da fala e o convite.
  1. conceito-1-tres-numeros (0:00,1 a 0:19,9): o personagem anda na ilha; a chave ganha um lugar novo; o 2D da
     Chave do Farol, uma tela com dois números (x e y); o 3D com profundidade (a chave vai para o fundo); três
     números, x, y e z.
  2. conceito-2-a-estante (0:20,2 a 0:32,4): "[na edição: a estante de livros]": o Zappy diante de uma estante
     anda para os lados, chega mais perto e mais longe e sobe até a prateleira de cima. Três caixas.
  3. conceito-3-e-o-y (0:32,8 a 0:46,4): a chave com os três números, cada um com "?"; o y pisca na pergunta do
     Dedé (38,8 a 42,5, à esquerda: a chave e os números ficam do meio para a direita); "O que você acha?".
  4. conceito-4-sua-investigacao (0:46,5 a 0:58,7): os três números, aumenta e diminui, e o Zappy que mostra o
     que testar; "repita quando quiser". O "clique em Próxima parte" (58,9) fica na tela.
Imagens (pasta de blocos): os renders de ilha-render-modelos.py (aventureiro, chave) e zappy.png.
Uso: ilha-a2p1-conceitos.py <base.edisvg> <pasta dos blocos> <pasta de saída (a pasta pecas da parte)>
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from edisvg_cena import AMARELO, BRANCO, NOITE, SUAVE, TINTA, VERDE, Cena, tf  # noqa: E402
from ilha_cena import Personagem, balao_pensa, chao, no_chao, percurso, pop  # noqa: E402

BASE, BLOCOS, SAIDA = sys.argv[1:4]
MADEIRA, MADEIRA_ESCURA = "#B9773F", "#8A5428"
LIVROS = ["#E8505B", "#1B5CF3", "#FFC02E", "#0B7A54", "#6D3BF5", "#F28C28"]


def numero(c, letra, cx, cy, t0, t1=None, s=1.0):
    """Um número da posição: caixa branca com a letra (x, y ou z)."""
    g = c.caixa(f"Número · {letra}", letra, BRANCO, TINTA, cx, cy, 130, tam=64)
    g["transform"] = tf(cx, cy, 0, s)
    c.mostra(g, t0, t1, pop=True)
    return g


# 1. Três números (0,1 a 19,9).
c = Cena("Conceito · Três números", 0.1, 19.9, BASE, BLOCOS, SAIDA)
c.ideia("Seu personagem já anda", 0.15, 2.5, None)
c.ideia("A chave vai mudar de lugar", 2.6, 5.45, None)
c.ideia("No jogo 2D: dois números", 5.55, 11.55, None)
c.ideia("No 3D: profundidade", 11.6, 14.8, None)
c.ideia("Três números", 14.85, 19.9, None)
c.ideia(None, 16.5, 19.9, "O lugar de cada objeto")
chao(c, 0.15, 5.45)
andarilho = Personagem(c, "Aventureiro")
andarilho.em(0.1, 330, 900, 0.55)
andarilho.anda(0.3, 2.2, (330, 900, 0.55), (560, 760, 0.45))
c.trilha(andarilho.g, "opacity", [(0.15, 0, None), (0.45, 100, None), (5.2, 100, None), (5.45, 0, None)])
andarilho.fechar()
chave1 = no_chao(c, "Chave · lugar antigo", "chave", 950, 760, 0.42)
c.mostra(chave1, 2.75, 5.45)
percurso(c, chave1, "chave", pop(2.75, 950, 760, 0.42) + [(3.9, (950, 760, 0.42), None), (4.45, (760, 950, 0.5), SUAVE)])
marca = c.rect("Marca · lugar novo", 760 - 110, 950 - 26, 220, 52, "none", rx=26, stroke=AMARELO, sw=8, op=0)
c.nos.append(marca)
c.pisca(marca, 4.4, 5.45)
# O 2D: uma tela plana com a chave e dois números.
tela = c.rect("Tela 2D", 200, 360, 640, 460, BRANCO, rx=30, stroke=NOITE, sw=8, op=0)
c.nos.append(tela)
c.mostra(tela, 5.6, 11.55, pop=True)
chave2d = no_chao(c, "Chave · 2D", "chave", 520, 660, 0.4)
c.mostra(chave2d, 5.8, 11.55)
numero(c, "x", 1000, 480, 8.15, 11.55)
numero(c, "y", 1000, 640, 8.5, 11.55)
# O 3D: o chão em perspectiva volta e a chave vai para o fundo (fica menor) e volta.
chao(c, 11.6)
chave3d = no_chao(c, "Chave · 3D", "chave", 660, 960, 0.6)
c.mostra(chave3d, 11.7)
percurso(c, chave3d, "chave", pop(11.7, 660, 960, 0.6) + [
    (12.5, (660, 960, 0.6), None), (13.5, (660, 520, 0.22), SUAVE),
    (13.9, (660, 520, 0.22), None), (14.7, (660, 800, 0.42), SUAVE)])
for k, (letra, t) in enumerate((("x", 18.8), ("y", 19.1), ("z", 19.3))):
    numero(c, letra, 980, 420 + 160 * k, t)
c.salvar("conceito-1-tres-numeros")

# 2. A estante (20,2 a 32,4).
c = Cena("Conceito · A estante", 20.2, 32.4, BASE, BLOCOS, SAIDA)
c.ideia("Imagine uma estante", 20.25, 29.65, None)
c.ideia("Três jeitos de mudar de lugar", 29.7, 32.4, None)
X0, X1, Y0, Y1 = 160, 820, 300, 960
estante = [c.rect("Estante · fundo", X0, Y0, X1 - X0, Y1 - Y0, MADEIRA, rx=18, stroke=MADEIRA_ESCURA, sw=10)]
for k, y in enumerate((500, 720)):
    estante.append(c.rect(f"Prateleira {k + 1}", X0, y, X1 - X0, 22, MADEIRA_ESCURA))
for linha, base_y in enumerate((500, 720, 950)):
    x = X0 + 30
    for k in range(9):
        alto = 120 + (k * 37 + linha * 19) % 50
        largo = 44 + (k * 13) % 22
        estante.append(c.rect(f"Livro {linha + 1}.{k + 1}", x, base_y - alto, largo, alto,
                              LIVROS[(k + linha) % len(LIVROS)], rx=6))
        x += largo + 14
g_estante = c.grupo("Estante", 0, 0, estante)
c.nos.append(g_estante)
c.mostra(g_estante, 20.3)
zappy = no_chao(c, "Zappy", "zappy", 300, 1040, 0.5)
c.mostra(zappy, 21.0)
# Para os lados; mais perto e mais longe (o Zappy cresce e diminui); mais alto (sobe até a prateleira de cima).
percurso(c, zappy, "zappy", pop(21.0, 300, 1040, 0.5) + [
    (23.0, (300, 1040, 0.5), None), (23.95, (680, 1040, 0.5), SUAVE),
    (24.5, (680, 1040, 0.5), None), (25.3, (600, 1075, 0.75), SUAVE),
    (25.7, (600, 1075, 0.75), None), (26.3, (600, 1000, 0.36), SUAVE),
    (26.9, (600, 1000, 0.36), None), (28.0, (600, 500, 0.36), SUAVE)])
c.mostra(c.caixa("Caixa · lados", "para os lados", BRANCO, TINTA, 1090, 420, 340, num=1), 23.96, pop=True)
c.mostra(c.caixa("Caixa · perto e longe", "mais perto ou longe", BRANCO, TINTA, 1060, 580, 420, num=2), 25.3, pop=True)
seta = c.poly("Seta · para cima", [(470, 860), (510, 800), (550, 860)], AMARELO)
seta["transform"] = tf(op=0)
c.nos.append(seta)
c.mostra(seta, 27.0, 28.3)
c.mostra(c.caixa("Caixa · alto", "mais alto", BRANCO, TINTA, 1100, 740, 300, num=3), 28.3, pop=True)
c.salvar("conceito-2-a-estante")

# 3. E o y? (32,8 a 46,4): a chave e os três números; o Dedé fala de 38,8 a 42,5, à esquerda.
c = Cena("Conceito · E o y?", 32.8, 46.4, BASE, BLOCOS, SAIDA)
c.ideia("A chave tem três números", 32.85, 38.75, None)
c.ideia(None, 35.6, 38.75, "Cada um muda o lugar de um jeito")
c.ideia("E o y?", 38.8, 42.9, None)
c.ideia("O que você acha?", 42.95, 44.2, None)
c.ideia("Teste na experiência", 44.25, 46.4, None)
chao(c, 32.85)
chave = no_chao(c, "Chave", "chave", 820, 860, 0.62)
c.mostra(chave, 33.0, pop=True)
nums = []
for k, (letra, t) in enumerate((("x", 34.7), ("y", 35.0), ("z", 35.25))):
    nums.append(numero(c, letra, 1150, 420 + 170 * k, t))
for k, t in enumerate((36.1, 36.55, 37.0)):
    p = balao_pensa(c, f"Balão · ? {k + 1}", 1220, 330 + 170 * k, "?")
    p["transform"] = tf(1220, 330 + 170 * k, 0, 0.55)
    c.mostra(p, t, 38.75, pop=True)
contorno_y = c.rect("Destaque · y", 1150 - 65 - 12, 590 - 48 - 12, 130 + 24, 96 + 24, "none", rx=36,
                    stroke=AMARELO, sw=8, op=0)
c.nos.append(contorno_y)
c.pisca(contorno_y, 38.85, 42.9, vezes=4)
duvida = balao_pensa(c, "Balão · ? da chave", 900, 420, "?")
c.mostra(duvida, 42.98, 46.4, pop=True)
c.salvar("conceito-3-e-o-y")

# 4. Sua investigação (46,5 a 58,7).
c = Cena("Conceito · Sua investigação", 46.5, 58.7, BASE, BLOCOS, SAIDA)
c.ideia("Sua investigação", 46.55, 53.8, None)
c.ideia(None, 48.2, 53.8, "Para onde a chave vai?")
c.ideia("O Zappy te mostra", 53.85, 58.7, None)
chave4 = no_chao(c, "Chave", "chave", 420, 760, 0.5)
c.mostra(chave4, 46.7, 53.8, pop=True)
for k, (letra, t) in enumerate((("x", 50.2), ("y", 50.45), ("z", 50.8))):
    numero(c, letra, 720 + 170 * k, 460, t, 53.8)
mais = c.caixa("Caixa · aumenta", "aumenta", VERDE, AMARELO, 820, 640, 300)
c.mostra(mais, 51.5, 53.8, pop=True)
menos = c.caixa("Caixa · diminui", "diminui", BRANCO, TINTA, 820, 790, 300)
c.mostra(menos, 52.5, 53.8, pop=True)
pergunta = balao_pensa(c, "Balão · ?", 520, 420, "?")
c.mostra(pergunta, 48.6, 53.8, pop=True)
zp = no_chao(c, "Zappy · mostra", "zappy", 640, 940, 0.95)
c.mostra(zp, 53.95, pop=True)
c.mostra(c.caixa("Caixa · repita", "repita quando quiser", BRANCO, TINTA, 1000, 520, 460, num=1), 56.45, pop=True)
c.salvar("conceito-4-sua-investigacao")
