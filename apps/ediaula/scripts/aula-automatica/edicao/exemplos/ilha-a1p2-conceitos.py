"""Exemplo: as animações da Ilha do Farol, Aula 1, Parte 2, "Seu passo a passo do projeto" (22/11/2026).

A parte mostra o material na tela (o livro, as páginas, baixar). Desde 22/11/2026 (pedido dela: bastante
animação em cada parte, ilustrando tudo o que puder) as explicações viram animação; ficam na tela o "Olha, aqui
está", o "ler aqui mesmo" com o clique para sair da tela cheia, o clique em baixar e a Próxima parte.
  1. conceito-1-o-passo-a-passo (0:03,25 a 0:10,55): "Nele estão os passos para montar o seu jogo nas 3 aulas,
     com os blocos que você vai usar e o lugar de cada um." A capa; no "3 aulas" três cartões (1, 2, 3); no
     "blocos" o esquema de blocos de verdade do material; no "lugar de cada um" o encaixe pisca.
  2. conceito-2-esqueceu-volte-aqui (0:10,6 a 0:15,5): o aventureiro esquece um passo (?), a capa abre e o ?
     vira !.
  3. conceito-3-guardar-o-material (0:21,45 a 0:24,6): depois do clique em baixar, a capa desce para a pasta
     ("guardar") e sai de novo ao lado do olho ("consultar onde quiser").
Os PNG da pasta de blocos (gravação de 22/11/2026 08-20-26):
  capa-titulo.png: 5,3 s da voz (vídeo 5,41 s), recorte 655,545 a 1268,975: só a metade de baixo da capa, sem a
  ilha (a ilha da capa mostra a chave, que é a criança quem acha).
  esquema-blocos.png: 9,6 s da voz (vídeo 8,9 s), recorte 390,637 a 902,812: o esquema "Enquanto estiver rodando"
  da página 4.
  aventureiro-*.png e farol-listrado.png: os renders da Aula 1 (Parte 3).
Uso: ilha-a1p2-conceitos.py <base.edisvg> <pasta dos blocos> <pasta de saída (a pasta pecas da parte)>
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from edisvg_cena import AMARELO, BRANCO, NOITE, SUAVE, TINTA, Cena  # noqa: E402
import ilha_cena as ic  # noqa: E402

BASE, BLOCOS, SAIDA = sys.argv[1:4]
PAPEL = "#FFF8EC"


def figura_em(c, nome, arq, x, y, s, op=0):
    g = c.grupo(nome, x, y, [ic.figura(c, arq)], op=op, s=s)
    c.nos.append(g)
    return g


def cartao_aula(c, nome, cx, cy, numero):
    """Uma página do material: papel claro, o farol e o número da aula."""
    filhos = [c.rect("papel", -120, -160, 240, 320, PAPEL, rx=22, stroke="#E2BF7A", sw=6),
              c.grupo("farol", -52, -140, [ic.figura(c, "farol-listrado")], op=100, s=0.2),
              ic.circulo(c, "número fundo", 0, 100, 44, NOITE),
              c.texto("número", str(numero), 0, 120, 56, BRANCO, ancora="middle")]
    g = c.grupo(nome, cx, cy, filhos)
    c.nos.append(g)
    return g


def pasta(c, nome, cx, cy):
    filhos = [c.rect("aba", -150, -120, 120, 50, "#E8A93A", rx=14),
              c.rect("fundo", -150, -95, 300, 200, "#E8A93A", rx=22),
              c.rect("frente", -150, -55, 300, 160, "#F7C64B", rx=22)]
    g = c.grupo(nome, cx, cy, filhos)
    c.nos.append(g)
    return g


def seta_baixo(c, nome, cx, cy):
    g = c.grupo(nome, cx, cy, [c.poly("seta", [(-30, -70), (30, -70), (30, 0), (70, 0), (0, 70), (-70, 0), (-30, 0)],
                                      BRANCO)])
    c.nos.append(g)
    return g


# 1. O passo a passo (3,25 a 10,55).
c = Cena("Conceito · O passo a passo", 3.25, 10.55, BASE, BLOCOS, SAIDA)
c.ideia("O passo a passo", 3.3, 6.05, None)
c.ideia("As 3 aulas", 6.1, 7.4, None)
c.ideia("Os blocos e o lugar de cada um", 7.45, 10.55, None)
capa = figura_em(c, "Capa", "capa-titulo", 330, 330, 1.05)
c.mostra(capa, 3.35, 6.05, pop=True)
for k in range(3):
    cartao = cartao_aula(c, f"Cartão · aula {k + 1}", 300 + k * 320, 600, k + 1)
    c.mostra(cartao, 6.12 + k * 0.2, 7.4, pop=True)
S1 = 2.0
esquema, destaque = c.bloco("esquema-blocos", 90, 390, S1, fundo=BRANCO, pad=12)
c.mostra(esquema, 7.5, pop=True)
encaixe = destaque("Destaque · o lugar do bloco", 72, 83, 452, 117)  # o bloco Fazer, ao lado de "fazer"
c.pisca(encaixe, 9.18, 10.5)
c.salvar("conceito-1-o-passo-a-passo")

# 2. Esqueceu? Volte aqui (10,6 a 15,5).
c = Cena("Conceito · Esqueceu? Volte aqui", 10.6, 15.5, BASE, BLOCOS, SAIDA)
c.ideia("Esqueceu um passo?", 10.65, 13.55, None)
c.ideia("Volte aqui e abra o material", 13.6, 15.5, None)
ic.chao(c, 10.7)
av2 = ic.no_chao(c, "Aventureiro", "aventureiro-parado", 420, 930, 0.75, pe=ic.PE["aventureiro"])
c.mostra(av2, 10.75)
pergunta2 = ic.balao_pensa(c, "Balão · ?", 560, 420, "?")
c.mostra(pergunta2, 11.7, 14.6, pop=True)
achou = ic.balao_pensa(c, "Balão · !", 560, 420, "!")
c.mostra(achou, 14.65, pop=True)
capa2 = figura_em(c, "Capa", "capa-titulo", 760, 420, 0.75)
c.mostra(capa2, 13.62, pop=True)
c.salvar("conceito-2-esqueceu-volte-aqui")

# 3. Guardar o material (21,45 a 24,6).
c = Cena("Conceito · Guardar o material", 21.45, 24.6, BASE, BLOCOS, SAIDA)
c.ideia("Guardar o material", 21.5, 22.75, None)
c.ideia("Consultar onde quiser", 22.8, 24.6, None)
p3 = pasta(c, "Pasta", 560, 820)
c.mostra(p3, 21.5)
capa3 = figura_em(c, "Capa · desce", "capa-titulo", 560 - 0.45 * 613 / 2, 260, 0.45)
c.trilha(capa3, "opacity", [(21.5, 0, None), (21.75, 100, None), (22.3, 100, None), (22.5, 0, None)])
c.trilha(capa3, "y", [(21.8, 260, None), (22.45, 640, SUAVE)])
seta3 = seta_baixo(c, "Seta", 900, 560)
c.mostra(seta3, 21.6, 22.6, pop=True)
c.mostra(c.caixa("Caixa · guardado", "guardado", BRANCO, TINTA, 560, 1000, 280), 22.3, 22.75)
capa4 = figura_em(c, "Capa · consultar", "capa-titulo", 560 - 0.55 * 613 / 2, 300, 0.55)
c.mostra(capa4, 22.85, pop=True)
olho3 = ic.olho(c, "Olho", 1040, 420)
c.mostra(olho3, 23.4, pop=True)
c.salvar("conceito-3-guardar-o-material")
