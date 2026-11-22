"""Exemplo: as duas animações de conceito da Ilha do Farol, Aula 1, Parte 3, "O que aparece quando você muda de
lugar?" (parte de experiência, 22/11/2026).

A fala explica e convida; a descoberta é da criança, e a chave não aparece em nenhuma cena (o que acontece com
ela quando a câmera muda é o que a experiência investiga). Como no Farol A3P6, só o trecho que explica vira
animação: o convite com o Zappy fica na tela, e o roteiro manda a tela voltar para a experiência no "Na ilha, a
câmera também pode mudar de lugar" (23,3 s).
  1. conceito-1-a-camera (0:00,1 a 0:16,4): a pedra esconde o que está atrás (o aventureiro passa atrás dela),
     o que você vê depende de onde você olha (o olho muda de lugar e, com a paralaxe, o aventureiro aparece ao
     lado da pedra), e a câmera, que funciona como os olhos dentro do jogo (o jogo 3D da gravação da Parte 1).
  2. conceito-2-mude-de-lugar (0:16,8 a 0:23,2): "[na edição: a pessoa que tapa a vista]": o aventureiro para na
     frente do Zappy e tapa a vista dele; o Zappy pensa, muda de lugar e consegue olhar. O que está atrás não
     aparece.
Imagens (pasta de blocos): os renders de ilha-render-modelos.py (aventureiro, pedras), zappy.png e jogo-ilha.png
(o mesmo recorte da Parte 1).
Uso: ilha-a1p3-conceitos.py <base.edisvg> <pasta dos blocos> <pasta de saída (a pasta pecas da parte)>
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from edisvg_cena import BRANCO, SUAVE, TINTA, Cena, tf  # noqa: E402
from ilha_cena import Personagem, balao_pensa, camera, chao, mover, no_chao, olho  # noqa: E402

BASE, BLOCOS, SAIDA = sys.argv[1:4]


# 1. A câmera (0,1 a 16,4).
c = Cena("Conceito · A câmera", 0.1, 16.4, BASE, BLOCOS, SAIDA)
c.ideia("Lembra da pedra?", 0.15, 5.95, None)
c.ideia(None, 1.86, 5.95, "Um objeto pode esconder o que está atrás")
c.ideia("Depende de onde você olha", 6.0, 9.65, None)
c.ideia("A câmera", 9.7, 16.4, None)
c.ideia(None, 13.72, 16.4, "Os olhos dentro do jogo")

chao(c, 0.15, 9.65)
ROCHA = (650, 760, 0.8)
TRAS = (650, 640, 0.38)
aventureiro = Personagem(c, "Aventureiro · atrás da pedra")  # antes da pedra na lista: fica atrás dela
aventureiro.em(0.1, 250, TRAS[1], TRAS[2])
aventureiro.anda(2.9, 3.85, (250, TRAS[1], TRAS[2]), TRAS)  # escondido atrás da pedra grande no "esconder" (3,99)
c.trilha(aventureiro.g, "opacity", [(1.9, 0, None), (2.2, 100, None), (9.4, 100, None), (9.65, 0, None)])
pedra = no_chao(c, "Pedras", "pedras", *ROCHA)
c.trilha(pedra, "opacity", [(0.3, 0, None), (0.6, 100, None), (9.4, 100, None), (9.65, 0, None)])
# "onde você olha": o olho vai para a direita; com a paralaxe, a pedra (perto) anda mais que o aventureiro
# (longe) e ele aparece do lado direito dela.
o = olho(c, "Olho", 330, 900)
c.mostra(o, 6.3, 9.65, pop=True)
c.trilha(o, "x", [(8.3, 330, None), (9.1, 1110, SUAVE)])
mover(c, pedra, "pedras", 8.3, ROCHA, 9.1, (420, 760, 0.8), SUAVE)
aventureiro.em(8.3, *TRAS)
aventureiro.em(9.1, 720, TRAS[1], TRAS[2], SUAVE)
aventureiro.fechar()

# A câmera olhando a ilha (o jogo 3D da gravação); no "olhos", a câmera vira um par de olhos.
ilha, _ = c.bloco("jogo-ilha", 430, 330, 0.56, fundo=BRANCO, pad=10)
c.mostra(ilha, 9.75, pop=True)
cone = c.poly("O que a câmera vê", [(250, 470), (440, 330), (440, 840)], BRANCO)
cone["transform"] = tf(op=0)
c.nos.append(cone)
c.trilha(cone, "opacity", [(10.6, 0, None), (10.9, 35, None), (13.6, 35, None), (13.75, 0, None)])
cam = camera(c, "Câmera", 200, 470)
c.mostra(cam, 10.4, 13.75, pop=True)
c.mostra(c.caixa("Caixa · câmera", "câmera", BRANCO, TINTA, 210, 330, 250), 13.03, 16.4, pop=True)
for k, dx in enumerate((-80, 80)):
    olhos = olho(c, f"Olhos · {k + 1}", 200 + dx, 470, s=0.8)
    c.mostra(olhos, 13.72, pop=True)
c.salvar("conceito-1-a-camera")

# 2. Mude de lugar (16,8 a 23,2): a pessoa que tapa a vista.
c = Cena("Conceito · Mude de lugar", 16.8, 23.2, BASE, BLOCOS, SAIDA)
c.ideia("Alguém tapa a vista", 16.85, 20.65, None)
c.ideia("Mude de lugar e veja", 20.7, 23.2, None)
chao(c, 16.85)
ZAPPY, ZAPPY_DIR = (650, 600, 0.42), (1010, 600, 0.42)
zappy = no_chao(c, "Zappy · atrás", "zappy", *ZAPPY)
c.mostra(zappy, 16.9)
pessoa = Personagem(c, "Aventureiro · na frente")  # depois do Zappy na lista: fica na frente dele
FORA, FRENTE = (1180, 980, 1.2), (650, 980, 1.2)
pessoa.em(16.8, *FORA)
pessoa.anda(17.4, 18.65, FORA, FRENTE)
c.trilha(pessoa.g, "opacity", [(17.2, 0, None), (17.45, 100, None)])
pessoa.fechar()
duvida = balao_pensa(c, "Balão · ?", 830, 300, "?")
c.mostra(duvida, 19.24, 20.6, pop=True)
mover(c, zappy, "zappy", 20.75, ZAPPY, 21.6, ZAPPY_DIR, SUAVE)
viu = balao_pensa(c, "Balão · !", 1090, 300, "!")
c.mostra(viu, 22.25, pop=True)
c.salvar("conceito-2-mude-de-lugar")
