"""Exemplo: as animações da Ilha do Farol, Aula 2, Parte 3, "Parece junto, mas está encostando?" (parte de
experiência, 22/11/2026). A fala inteira vira cena (pedido dela de 22/11): nada da tela da experiência.

A descoberta da criança é que, de cima, a chave pode parecer estar sobre o personagem sem encostar (ela está
alta). Nenhuma cena mostra a vista de lado nem a altura da chave.
  1. conceito-1-pegar-a-chave (0:00,0 a 0:13,9): a chave no lugar novo; o personagem chega perto dela e para
     ("?"); o olho do jogo que precisa perceber; "encostar é tocar de verdade": a chave encosta no personagem e
     uma estrela marca o toque.
  2. conceito-2-palmas (0:14,2 a 0:19,4): "[na edição: as mãos batendo palmas]": as mãos chegam perto sem
     som; quando se tocam, "PLÁ!".
  3. conceito-3-olhando-de-cima (0:19,4 a 0:30,8): a ilha vista de cima (renders aventureiro-de-cima e
     chave-de-cima): a chave passa sobre o personagem e parece estar em cima dele. O Dedé pergunta de 25,2 a
     26,7, à esquerda: o personagem e a chave ficam do meio para a direita. "O que você acha?" e "Teste".
  4. conceito-4-sua-investigacao (0:30,8 a 0:43,4): o Zappy, as duas perguntas da investigação (encostando de
     verdade? só parecem juntos?) e "repita quando quiser". O "clique em Próxima parte" (43,5) fica na tela.
Imagens (pasta de blocos): os renders de ilha-render-modelos.py (aventureiro, chave, vistas de cima) e zappy.png.
Uso: ilha-a2p3-conceitos.py <base.edisvg> <pasta dos blocos> <pasta de saída (a pasta pecas da parte)>
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from edisvg_cena import AMARELO, BRANCO, NOITE, SUAVE, TINTA, Cena, tf  # noqa: E402
from ilha_cena import (  # noqa: E402
    Personagem,
    balao_pensa,
    chao,
    estrela,
    mao,
    no_chao,
    olho,
    percurso,
    pop,
)

BASE, BLOCOS, SAIDA = sys.argv[1:4]
AREIA, AREIA_BORDA = "#F3D9A0", "#E2BF7A"

# 1. Pegar a chave (0,0 a 13,9).
c = Cena("Conceito · Pegar a chave", 0.0, 13.9, BASE, BLOCOS, SAIDA)
c.ideia("A chave tem um lugar novo", 0.05, 2.5, None)
c.ideia("Falta pegar a chave", 2.55, 5.8, None)
c.ideia("O jogo precisa perceber", 5.85, 10.0, None)
c.ideia("Encostar", 10.05, 13.9, None)
c.ideia(None, 12.2, 13.9, "Tocar de verdade")
chao(c, 0.05)
chave = no_chao(c, "Chave", "chave", 860, 900, 0.42)
c.mostra(chave, 0.5)
percurso(c, chave, "chave", pop(0.5, 860, 900, 0.42) + [(11.6, (860, 900, 0.42), None),
                                                         (12.4, (760, 900, 0.42), SUAVE)])
heroi = Personagem(c, "Aventureiro")
heroi.em(0.0, 300, 950, 0.6)
heroi.anda(2.9, 4.7, (300, 950, 0.6), (600, 930, 0.6))
c.trilha(heroi.g, "opacity", [(2.6, 0, None), (2.9, 100, None)])
heroi.fechar()
duvida = balao_pensa(c, "Balão · ?", 640, 440, "?")
c.mostra(duvida, 4.9, 5.85, pop=True)
o = olho(c, "Olho do jogo", 720, 430)
c.mostra(o, 6.2, 10.0, pop=True)
c.trilha(o, "x", [(7.0, 720, None), (7.6, 560, SUAVE), (8.2, 880, SUAVE), (8.8, 720, SUAVE)])
toque = estrela(c, "Estrela · o toque", 700, 830, 70)
c.mostra(toque, 12.45, pop=True)
c.salvar("conceito-1-pegar-a-chave")

# 2. As palmas (14,2 a 19,4).
c = Cena("Conceito · As palmas", 14.2, 19.4, BASE, BLOCOS, SAIDA)
c.ideia("Bater palmas", 14.25, 19.4, None)
c.ideia(None, 16.2, 19.4, "Barulho só quando as mãos se tocam")
esq = mao(c, "Mão esquerda", 300, 640)
dir_ = mao(c, "Mão direita", 1000, 640, espelho=True)
for m, (x0, perto, junto) in ((esq, (300, 560, 600)), (dir_, (1000, 740, 700))):
    c.mostra(m, 14.3)
    c.trilha(m, "x", [(14.3, x0, None), (15.3, perto, SUAVE), (16.9, perto, None), (17.5, x0 + (perto - x0) * 0.6, SUAVE),
                      (18.0, junto, SUAVE), (18.35, junto, None), (18.7, perto, SUAVE)])
silencio = c.texto("Sem som", "…", 650, 520, 90, BRANCO, ancora="middle", op=0)
c.nos.append(silencio)
c.mostra(silencio, 15.4, 16.9)
pla = c.texto("PLÁ!", "PLÁ!", 650, 470, 120, AMARELO, ancora="middle", op=0)
c.nos.append(pla)
c.mostra(pla, 18.05, pop=True)
brilho = estrela(c, "Estrela · palma", 650, 640, 60)
c.mostra(brilho, 18.05, 18.9, pop=True)
c.salvar("conceito-2-palmas")

# 3. Olhando de cima (19,4 a 30,8): o Dedé fala de 25,2 a 26,7, à esquerda.
c = Cena("Conceito · Olhando de cima", 19.4, 30.8, BASE, BLOCOS, SAIDA)
c.ideia("Olhando de cima", 19.45, 25.1, None)
c.ideia(None, 21.6, 25.1, "A chave parece estar em cima dele")
c.ideia("Estão encostando?", 25.15, 27.05, None)
c.ideia("O que você acha?", 27.1, 28.4, None)
c.ideia("Teste na experiência", 28.45, 30.8, None)
ilha = c.rect("Ilha de cima", 560, 330, 700, 700, AREIA, rx=120, stroke=AREIA_BORDA, sw=8, op=0)
c.nos.append(ilha)
c.mostra(ilha, 19.5)
de_cima = olho(c, "Olho · de cima", 910, 360, s=0.8)
c.mostra(de_cima, 20.2, 24.0, pop=True)
heroi3 = no_chao(c, "Aventureiro · de cima", "aventureiro-de-cima", 910, 700, 1.0)
c.mostra(heroi3, 19.7, pop=True)
chave3 = no_chao(c, "Chave · de cima", "chave-de-cima", 1110, 560, 0.75)
c.mostra(chave3, 20.4)
percurso(c, chave3, "chave-de-cima", pop(20.4, 1110, 560, 0.75) + [(21.6, (1110, 560, 0.75), None),
                                                                   (22.6, (910, 690, 0.75), SUAVE)])
contorno = c.rect("Destaque · juntos", 910 - 190, 690 - 170, 380, 340, "none", rx=40, stroke=AMARELO, sw=8, op=0)
c.nos.append(contorno)
c.pisca(contorno, 23.0, 26.9, vezes=3)
pergunta = balao_pensa(c, "Balão · ?", 1060, 400, "?")
c.mostra(pergunta, 25.2, 30.8, pop=True)
c.salvar("conceito-3-olhando-de-cima")

# 4. Sua investigação (30,8 a 43,4).
c = Cena("Conceito · Sua investigação", 30.8, 43.4, BASE, BLOCOS, SAIDA)
c.ideia("Sua investigação", 30.85, 38.75, None)
c.ideia("O Zappy te mostra", 38.8, 43.4, None)
zp = no_chao(c, "Zappy · investigação", "zappy", 1050, 600, 0.5)
c.mostra(zp, 31.0, 38.75, pop=True)
c.mostra(c.caixa("Caixa · de verdade", "encostando de verdade?", BRANCO, TINTA, 470, 450, 560, num=1), 34.45, 38.75, pop=True)
c.mostra(c.caixa("Caixa · só parece", "só parecem juntos?", BRANCO, TINTA, 470, 610, 480, num=2), 36.4, 38.75, pop=True)
olhinho = olho(c, "Olho · imagem", 470, 800, s=0.8)
c.mostra(olhinho, 37.3, 38.75, pop=True)
zp2 = no_chao(c, "Zappy · mostra", "zappy", 640, 960, 0.95)
c.mostra(zp2, 38.9, pop=True)
c.mostra(c.caixa("Caixa · repita", "repita quando quiser", BRANCO, TINTA, 1020, 520, 460, num=3), 41.45, pop=True)
c.salvar("conceito-4-sua-investigacao")
