"""Exemplo: as duas animações de conceito da Farol Aula 3 Parte 8, "Seu jogo está pronto" (0:03 e 1:02).

  recortar.sh <gravação P8> 5.5 1245 332 1902 824 blocos/jogo.png   (o jogo da criança, que vira a capa)
Os outros jogos do Mural são montados com as artes da base do curso (base_jogo.py). A capa que o Estúdio gera é
uma foto do próprio jogo: o recorte serve de cartão.
A animação 1 começa em 0:03,1 e cobre também o envio do projeto que o robô faz no começo (no palco, a parte 8
só compartilha depois de enviar).
Uso: farol-a3p8-conceitos.py <base.edisvg> <pasta dos blocos> <pasta de saída (a pasta pecas da parte)>
"""

import copy
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from edisvg_cena import AMARELO, BRANCO, NOITE, TINTA, VERDE, Cena, nid, tf  # noqa: E402

PASTAS = sys.argv[1:4]
CW, CH = 330, 248  # cartão do Mural (4:3, como o jogo)


def arte(c, nome, x, y, w, h, t0, t1=None):
    no = copy.deepcopy(c.arte[nome])
    no["id"] = nid()
    no["transform"] = tf(x, y, 0)
    no["instance"]["width"], no["instance"]["height"] = w, h
    c.nos.append(no)
    c.mostra(no, t0, t1)
    return no


def cartao_de_arte(c, x, y, cenario, farol, t0):
    """Outro jogo do Mural: um cenário do curso com um farol, no tamanho do cartão."""
    k = CW / 480
    fundo = c.rect("Cartão · borda", x - 8, y - 8, CW + 16, CH + 16, BRANCO, rx=18, op=0)
    c.nos.append(fundo)
    c.mostra(fundo, t0)
    arte(c, f"cenário · {cenario}", x, y, CW, CH, t0)
    arte(c, f"farol · {farol}", x + 328 * k, y + 40 * k, 152 * k, 152 * k, t0)


# 1. O Mural (0:03,1 a 0:19,1).
c = Cena("Conceito · O Mural", 3.1, 19.1, *PASTAS)
c.ideia("O Mural", 3.1, None, "Se quiser, publique o seu jogo no Mural.", t1_sub=5.85, ts=3.2)
c.ideia(None, 5.9, None, "É onde ficam os jogos publicados.", t1_sub=10.2)
c.ideia(None, 10.25, None, "Lá, a família e os amigos jogam o seu jogo.", t1_sub=14.1)
c.ideia(None, 14.15, None, "Ou clique em Concluir aula e siga sem publicar.")
painel = c.rect("Mural · painel", 96, 300, 1170, 620, "#F4F7FC", rx=36, op=0)
c.nos.append(painel)
c.mostra(painel, 3.4)
nome = c.texto("Mural · nome", "Mural dos Criadores", 136, 372, 46, TINTA, op=0)
c.nos.append(nome)
c.mostra(nome, 3.6)
cartao_de_arte(c, 520, 420, "ilha-nevada", "farol-colorido-aceso", 6.4)
cartao_de_arte(c, 910, 420, "costa-rochosa", "farol-de-madeira-aceso", 7.0)
seu, dest = c.bloco("jogo", 130, 420, CW / 657, fundo=BRANCO, pad=8)
c.mostra(seu, 8.6, pop=True)
c.pisca(dest("Destaque · seu jogo", 0, 0, 657, 492), 9.0, 14.0, vezes=2)
rotulo = c.caixa("Caixa · seu jogo", "Seu jogo", VERDE, AMARELO, 295, 735, 260, tam=38)
c.mostra(rotulo, 9.0, 14.05, pop=True)
familia = c.caixa("Caixa · família e amigos", "A família e os amigos jogam", BRANCO, TINTA, 800, 735, 560, tam=38)
c.mostra(familia, 10.6, 14.05, pop=True)
publicar = c.caixa("Caixa · publicar", "Publicar no Mural", VERDE, AMARELO, 420, 820, 460, num=1, tam=38)
c.mostra(publicar, 14.3, pop=True)
concluir = c.caixa("Caixa · concluir aula", "Concluir aula", BRANCO, TINTA, 940, 820, 400, num=2, tam=38)
c.mostra(concluir, 15.4, pop=True)
c.salvar("conceito-1-o-mural")

# 2. Mande o link (1:02,3 a 1:11,8).
c = Cena("Conceito · Mande o link", 62.3, 71.8, *PASTAS)
c.ideia("Mande o link", 62.3, None, "Mande o link para a família e os amigos.", t1_sub=67.8, ts=62.4)
c.ideia(None, 67.85, None, "Quem receber joga direto, até no celular.")
link = c.grupo("Link de jogar", 150, 420, [c.rect("fundo", 0, 0, 470, 110, BRANCO, rx=55),
                                          c.rect("ícone", 30, 30, 50, 50, VERDE, rx=14),
                                          c.texto("texto", "Link de jogar", 105, 72, 44, TINTA)])
c.nos.append(link)
c.mostra(link, 62.8, pop=True)
adulto = c.caixa("Caixa · com um adulto", "Com a ajuda de um adulto", VERDE, AMARELO, 385, 640, 520, tam=38)
c.mostra(adulto, 65.9, pop=True)
celular = c.rect("Celular", 780, 320, 380, 680, NOITE, rx=56, op=0)
c.nos.append(celular)
c.mostra(celular, 68.0, pop=True)
tela = c.rect("Celular · tela", 800, 380, 340, 560, "#0B1222", rx=24, op=0)
c.nos.append(tela)
c.mostra(tela, 68.1)
jogo, _ = c.bloco("jogo", 805, 535, 330 / 657, fundo="#0B1222", pad=0)
c.mostra(jogo, 68.5, pop=True)
c.salvar("conceito-2-mande-o-link")
