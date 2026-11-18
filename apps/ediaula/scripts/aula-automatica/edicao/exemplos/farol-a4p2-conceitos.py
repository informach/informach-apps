"""Exemplo: a animação de conceito da Farol Aula 4 Parte 2, "Comemore sua criação" (0:08 a 0:19,9).

A parte não tem Estúdio. O roteiro pede o jogo da demonstração no lugar da tela parada, do "Olha só o seu jogo"
até o "quem montou foi você". A edição divide esse trecho em dois:
  1. o jogo da demonstração (0:03,1 a 0:08,0), em vídeo: o pirata pega a chave, o farol acende e o barco chega
     (edicao/animacao/conceito-1-o-seu-jogo.mp4, recortado de jogo-da-demonstracao.mp4 de 6,2 s a 11,1 s);
  2. esta cena, que recapitula as três regras ("o personagem que anda, a memória da chave e o farol que só
     acende com a chave") com as artes do jogo e os blocos de verdade, e fecha no "quem montou foi você!" e no
     "Parabéns!".
Blocos: "Ativar controles clássicos" e "Criar variável temChave" recortados do jogo da demonstração (10 s);
"Se valor da variável temChave" do recorte se-completo.png da Aula 3 Parte 3.
Uso: farol-a4p2-conceitos.py <base.edisvg> <pasta dos blocos> <pasta de saída>
"""

import copy
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from edisvg_cena import AMARELO, BRANCO, SUAVE, TINTA, VAIVEM, VERDE, Cena, nid, tf  # noqa: E402

BASE, BLOCOS, SAIDA = sys.argv[1:4]


def arte(c, nome, x, y, w, op=100):
    """Instância de uma arte do jogo (grupo "Jogo" da base), quadrada."""
    no = copy.deepcopy(c.arte[nome])
    no["id"] = nid()
    no["transform"] = tf(x, y, op)
    no["instance"]["width"] = no["instance"]["height"] = w
    return no


def estrela(c, nome, cx, cy, r, cor=AMARELO):
    pts = []
    for k in range(10):
        a = -math.pi / 2 + k * math.pi / 5
        rr = r if k % 2 == 0 else r * 0.45
        pts.append((rr * math.cos(a), rr * math.sin(a)))
    return c.grupo(nome, cx, cy, [c.poly("estrela", pts, cor)])


c = Cena("Conceito · As regras do seu jogo", 8.0, 19.9, BASE, BLOCOS, SAIDA)
c.ideia("O que você programou", 8.05, 13.55, None)
c.ideia("As regras do seu jogo", 13.6, 16.45, None)
c.ideia("Quem montou foi você!", 16.5, 18.55, None)
c.ideia("Parabéns!", 18.6, 19.9, None)

# As três regras, uma linha cada, entrando na palavra: personagem 8,5; memória 9,8; farol 11,3.
LINHA_Y, LINHA_H, LX, LW = (222, 464, 706), 226, 96, 1170
REGRAS = (("O personagem que anda", "controles", 8.4), ("A memória da chave", "temchave", 9.7),
          ("O farol que só acende com a chave", "se-temchave", 11.1))
linhas = []
for k, ((titulo, bloco, t0), y) in enumerate(zip(REGRAS, LINHA_Y)):
    if k == 0:
        figura = arte(c, "personagem · pirata", 34, 28, 170)
    elif k == 1:
        figura = arte(c, "chave · chave-de-estrela", 44, 38, 150)
    else:
        figura = arte(c, "farol · farol-de-pedra-apagado", 30, 24, 178)
    filhos = [c.rect("fundo", 0, 0, LW, LINHA_H, BRANCO, rx=30), figura,
              c.texto("regra", titulo, 240, 82, 50, TINTA)]
    if k == 2:
        aceso = arte(c, "farol · farol-de-pedra-aceso", 30, 24, 178, op=0)
        filhos.append(aceso)
    linha = c.grupo(f"Regra {k + 1} · {titulo}", LX, y, filhos)
    c.nos.append(linha)
    c.mostra(linha, t0, 16.45, pop=True)
    linhas.append(linha)
    if k == 0:  # o personagem anda de um lado para o outro
        c.trilha(figura, "x", [(8.9, 34, None), (9.6, 64, VAIVEM), (10.3, 34, VAIVEM), (11.0, 64, VAIVEM),
                               (11.7, 34, None)])
        c.trilha(figura, "y", [(8.9 + j * 0.175, 28 if j % 2 == 0 else 18, VAIVEM) for j in range(17)])
    if k == 2:  # o farol acende na palavra "acende"
        c.trilha(aceso, "opacity", [(12.1, 0, None), (12.3, 100, None)])
        c.trilha(figura, "opacity", [(12.25, 100, None), (12.4, 0, None)])
    # O bloco de verdade, embaixo do nome da regra.
    g, _ = c.bloco(bloco, LX + 240, y + 116, 1.45, pad=8)
    c.mostra(g, t0 + 0.25, 16.45)

# "São essas regras que fazem o seu jogo funcionar": o contorno verde junta as três.
juntas = c.rect("Destaque · as três regras", LX - 14, LINHA_Y[0] - 14, LW + 28,
                LINHA_Y[2] + LINHA_H - LINHA_Y[0] + 28, "none", rx=40, stroke=VERDE, sw=10, op=0)
c.nos.append(juntas)
c.pisca(juntas, 13.9, 16.3, vezes=3)

# "E quem montou foi você!": o jogo pronto, com o farol aceso e o barco chegando.
farol = arte(c, "farol · farol-de-pedra-aceso", 470, 250, 420, op=0)
pirata = arte(c, "personagem · pirata", 330, 520, 210, op=0)
barco = arte(c, "barco · barco-pirata", 1120, 560, 300, op=0)
for no in (farol, pirata):
    c.nos.append(no)
    c.mostra(no, 16.55, pop=True)
c.nos.append(barco)
c.mostra(barco, 16.7)
c.trilha(barco, "x", [(16.7, 1120, None), (17.9, 860, SUAVE)])
c.trilha(barco, "y", [(17.9 + j * 0.5, 560 if j % 2 == 0 else 572, VAIVEM) for j in range(5)])

# "Parabéns!": estrelas.
ESTRELAS = ((230, 330, 54, 18.65), (1130, 330, 46, 18.75), (180, 760, 40, 18.85), (1180, 820, 58, 18.7),
            (690, 220, 34, 18.9), (420, 930, 30, 19.0), (960, 960, 36, 18.95))
for k, (x, y, r, t0) in enumerate(ESTRELAS):
    e = estrela(c, f"Estrela {k + 1}", x, y, r)
    c.nos.append(e)
    c.mostra(e, t0, pop=True)
c.salvar("conceito-2-as-regras-do-seu-jogo")
