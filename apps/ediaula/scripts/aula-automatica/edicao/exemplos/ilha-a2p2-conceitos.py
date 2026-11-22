"""Exemplo: as animações da Ilha do Farol, Aula 2, Parte 2, "Coloque a chave na ilha" (22/11/2026). As peças são
numeradas na ordem da aula (montar.py casa a peça N com o trecho N). Ficam na tela as ações: arrastar, clicar
nos números, Rodar de novo, as setas, o "Olha só!", conferir os blocos e verificar.
  1. conceito-1-o-que-voce-descobriu (0:00,0 a 0:13,0): a parte relembra a experiência: o x e o z levam a chave
     pelo chão, o y muda a altura (a sombra fica no chão); no 2D, o y mudava o lugar na tela.
  2. conceito-2-um-lugar-novo (0:13,3 a 0:20,3): a chave ganha um lugar novo; o lugar fica na área Ao iniciar
     (recorte do topo da área).
  3. conceito-3-os-tres-numeros (0:32,6 a 0:42,8): o bloco Colocar o objeto chave (recorte) com x −2, y 1 e z −3
     destacados um por vez; os três jeitos de mudar de lugar da experiência.
  4. conceito-4-a-reacao-vem-depois (1:23,8 a 1:28,1): a reação vem depois da experiência do contato (as mãos
     das palmas). De 1:15 a 1:23 a tela mostra a câmera do jogo girando até a chave, que a vista do começo
     esconde atrás da pedra (gravação com [girar a cena], pedido dela de 22/11/2026).
Imagens (pasta de blocos): os renders de ilha-render-modelos.py, zappy.png e dois recortes da gravação:
bloco-colocar-chave.png (o bloco Colocar o objeto chave com os três números) e area-ao-iniciar.png (o topo da
área Ao iniciar). Os destaques dos números estão em NUMEROS, em pixels do recorte.
Uso: ilha-a2p2-conceitos.py <base.edisvg> <pasta dos blocos> <pasta de saída (a pasta pecas da parte)>
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from edisvg_cena import AMARELO, BRANCO, NOITE, SUAVE, TINTA, VERDE, Cena, tf  # noqa: E402
from ilha_cena import chao, mao, no_chao, percurso, pop  # noqa: E402

BASE, BLOCOS, SAIDA = sys.argv[1:4]
# Os números do bloco recortado, em pixels do recorte (x0, y0, x1, y1): medidos depois do recorte e gravados
# em recortes.json, na pasta dos blocos.
NUMEROS = json.load(open(os.path.join(BLOCOS, "recortes.json"), encoding="utf8"))["bloco-colocar-chave"]
SOMBRA = "#C9A76A"


def sombra(c, nome, cx, cy, w=150):
    r = c.rect(nome, cx - w / 2, cy - 18, w, 36, SOMBRA, rx=18, op=0)
    c.nos.append(r)
    return r


# 1. O que você descobriu (0,0 a 13,0).
c = Cena("Conceito · O que você descobriu", 0.0, 13.0, BASE, BLOCOS, SAIDA)
c.ideia("Lembra da experiência?", 0.05, 2.4, None)
c.ideia("x e z: pelo chão", 2.45, 5.2, None)
c.ideia("y: a altura", 5.25, 7.9, None)
c.ideia("No jogo 2D era diferente", 7.95, 13.0, None)
c.ideia(None, 10.25, 13.0, "O y mudava o lugar na tela")
chao(c, 0.05, 7.9)
somb = sombra(c, "Sombra da chave", 660, 820)
c.mostra(somb, 0.4, 7.9)
c.trilha(somb, "x", [(2.6, 0, None), (3.3, -230, SUAVE), (3.5, -230, None), (3.9, 0, SUAVE)])
chave = no_chao(c, "Chave", "chave", 660, 820, 0.5)
c.mostra(chave, 0.4, 7.9)
percurso(c, chave, "chave", pop(0.4, 660, 820, 0.5) + [
    (2.6, (660, 820, 0.5), None), (3.3, (430, 820, 0.5), SUAVE),      # x: para o lado
    (3.5, (430, 820, 0.5), None), (3.9, (660, 820, 0.5), SUAVE),      # e volta
    (4.0, (660, 820, 0.5), None), (4.6, (660, 600, 0.32), SUAVE),     # z: para o fundo
    (4.7, (660, 600, 0.32), None), (5.0, (660, 820, 0.5), SUAVE),     # e volta
    (5.3, (660, 820, 0.5), None), (6.4, (660, 560, 0.5), SUAVE)])     # y: sobe
c.trilha(somb, "y", [(4.0, 0, None), (4.6, -220, SUAVE), (4.7, -220, None), (5.0, 0, SUAVE)])
c.mostra(c.caixa("Caixa · x", "x: para os lados", BRANCO, TINTA, 1080, 420, 360, num=1), 2.45, 7.9, pop=True)
c.mostra(c.caixa("Caixa · z", "z: frente e fundo", BRANCO, TINTA, 1080, 560, 360, num=2), 2.5, 7.9, pop=True)
c.mostra(c.caixa("Caixa · y", "y: altura", VERDE, AMARELO, 1080, 700, 360, num=3), 5.24, 7.9, pop=True)
# O 2D: a tela plana, e o y leva a chave para cima e para baixo na tela.
tela = c.rect("Tela 2D", 220, 360, 640, 460, BRANCO, rx=30, stroke=NOITE, sw=8, op=0)
c.nos.append(tela)
c.mostra(tela, 8.0, pop=True)
chave2d = no_chao(c, "Chave · 2D", "chave", 540, 620, 0.4)
c.mostra(chave2d, 8.2)
percurso(c, chave2d, "chave", [(8.2, (540, 620, 0.4), None), (10.4, (540, 620, 0.4), None),
                               (11.0, (540, 780, 0.4), SUAVE), (11.6, (540, 520, 0.4), SUAVE),
                               (12.1, (540, 660, 0.4), SUAVE)])
c.mostra(c.caixa("Caixa · y na tela", "y: lugar na tela", BRANCO, TINTA, 1080, 560, 360), 10.3, pop=True)
c.salvar("conceito-1-o-que-voce-descobriu")

# 2. Um lugar novo (13,3 a 20,3).
c = Cena("Conceito · Um lugar novo", 13.3, 20.3, BASE, BLOCOS, SAIDA)
c.ideia("Um lugar novo para a chave", 13.35, 17.3, None)
c.ideia("O lugar fica em Ao iniciar", 17.35, 20.3, None)
chao(c, 13.35, 17.3)
chave2 = no_chao(c, "Chave", "chave", 700, 860, 0.45)
c.mostra(chave2, 13.5, 17.3)
percurso(c, chave2, "chave", pop(13.5, 700, 860, 0.45) + [(14.3, (700, 860, 0.45), None),
                                                          (15.2, (480, 740, 0.38), SUAVE)])
anel = c.rect("Marca · lugar novo", 480 - 100, 740 - 22, 200, 44, "none", rx=22, stroke=AMARELO, sw=8, op=0)
c.nos.append(anel)
c.pisca(anel, 15.2, 17.3)
area, _ = c.bloco("area-ao-iniciar", 200, 440, 1.25)
c.mostra(area, 17.5, pop=True)
c.salvar("conceito-2-um-lugar-novo")

# 3. Os três números (32,6 a 42,8).
c = Cena("Conceito · Os três números", 32.6, 42.8, BASE, BLOCOS, SAIDA)
c.ideia("Três números", 32.65, 38.75, None)
c.ideia("O que você investigou", 38.8, 42.8, None)
S3 = 1.7
bloco, destaque = c.bloco("bloco-colocar-chave", 130, 360, S3)
c.mostra(bloco, 32.7, pop=True)
for k, (letra, t0) in enumerate((("x", 34.8), ("y", 35.95), ("z", 36.7))):
    d = destaque(f"Destaque · {letra}", *NUMEROS[letra])
    c.pisca(d, t0, 38.75 if letra == "z" else t0 + 1.2)
for k, (txt, t0) in enumerate((("x: para os lados", 38.85), ("y: altura", 39.15), ("z: frente e fundo", 39.45))):
    c.mostra(c.caixa(f"Caixa · {txt}", txt, BRANCO, TINTA, 300 + 390 * k, 700, 350, num=k + 1), t0, pop=True)
chave3 = no_chao(c, "Chave", "chave", 700, 980, 0.3)
c.mostra(chave3, 39.6, pop=True)
c.salvar("conceito-3-os-tres-numeros")

# 4. A reação vem depois (83,8 a 88,1). De 75 a 83 s a tela mostra a câmera girando até a chave e o
# personagem perto dela sem nada acontecer (pedido dela de 22/11: ver a chave mudando de lugar no jogo).
c = Cena("Conceito · A reação vem depois", 83.8, 88.1, BASE, BLOCOS, SAIDA)
c.ideia("A reação vem daqui a pouco", 83.85, 88.1, None)
c.ideia(None, 86.2, 88.1, "Depois da experiência do contato")
cartao = c.rect("Cartão · experiência do contato", 240, 380, 820, 560, BRANCO, rx=40, op=0)
c.nos.append(cartao)
c.mostra(cartao, 83.9, pop=True)
m1 = mao(c, "Mão esquerda", 520, 640, s=0.9)
m2 = mao(c, "Mão direita", 780, 640, espelho=True, s=0.9)
for m, x0, x1 in ((m1, 520, 600), (m2, 780, 700)):
    c.mostra(m, 84.1)
    c.trilha(m, "x", [(84.9, x0, None), (85.4, x1, SUAVE), (85.7, x0, SUAVE), (86.3, x1, SUAVE), (86.6, x0, SUAVE)])
c.mostra(c.caixa("Caixa · contato", "experiência do contato", NOITE, BRANCO, 650, 860, 520), 86.3, pop=True)
c.salvar("conceito-4-a-reacao-vem-depois")
