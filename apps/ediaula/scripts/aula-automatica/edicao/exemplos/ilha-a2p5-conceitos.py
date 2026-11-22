"""Exemplo: as animações da Ilha do Farol, Aula 2, Parte 5, "Guarde que você pegou a chave" (22/11/2026). As peças
são numeradas na ordem da aula. Ficam na tela as ações (arrastar, abrir as categorias, encaixar, escrever,
soltar, escolher), os apontar e o conferir.
  1. conceito-1-sumir-nao-e-guardar (0:00,0 a 0:14,3): a chave some; a lembrança do 2D; sumir não é guardar;
     a variável temChave, que responde se o personagem tem a chave.
  2. conceito-2-comecar-sem-a-chave (0:14,4 a 0:17,8): a partida começa sem a chave: temChave falso.
  3. conceito-3-sim-ou-nao (0:37,4 a 0:44,9): a variável chega com 0, mas temChave guarda sim ou não:
     verdadeiro ou falso.
  4. conceito-4-a-outra-metade (0:57,1 a 1:02,7): o personagem pega a chave e temChave vira verdadeiro.
  5. conceito-5-os-dois-lugares (1:35,7 a 1:40,9): os dois blocos prontos (recortes): ao começar, falso; ao
     pegar a chave, verdadeiro.
  6. conceito-6-guardado-por-dentro (1:41,1 a 1:51,3): a pergunta do Dedé (101,18 a 103,3, à esquerda: o
     conteúdo fica do meio para a direita); o valor não aparece na ilha; quem vai usar é o farol, na próxima aula.
Imagens (pasta de blocos): os renders de ilha-render-modelos.py, jogo-ilha.png e dois recortes da gravação:
bloco-criar-temchave.png (Criar variável temChave com valor falso) e bloco-alterar-temchave.png (Alterar
variável temChave para verdadeiro).
Uso: ilha-a2p5-conceitos.py <base.edisvg> <pasta dos blocos> <pasta de saída (a pasta pecas da parte)>
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from edisvg_cena import AMARELO, BRANCO, NOITE, SUAVE, TINTA, VERDE, Cena  # noqa: E402
from ilha_cena import (  # noqa: E402
    Personagem,
    balao_pensa,
    chao,
    estrela,
    no_chao,
    percurso,
    pop,
    variavel,
)

BASE, BLOCOS, SAIDA = sys.argv[1:4]
VERMELHO = "#E8505B"

# 1. Sumir não é guardar (0,0 a 14,3).
c = Cena("Conceito · Sumir não é guardar", 0.0, 14.3, BASE, BLOCOS, SAIDA)
c.ideia("A chave já some", 0.05, 1.45, None)
c.ideia("Lembra do jogo 2D?", 1.5, 3.45, None)
c.ideia("Sumir não é guardar", 3.5, 7.9, None)
c.ideia("A variável temChave", 7.95, 14.3, None)
c.ideia(None, 11.7, 14.3, "Responde se o personagem tem a chave")
chao(c, 0.05, 1.45)
chave = no_chao(c, "Chave", "chave", 700, 880, 0.45)
c.mostra(chave, 0.05, 0.6)
poof = estrela(c, "Estrela · some", 700, 800, 60)
c.mostra(poof, 0.55, 1.4, pop=True)
tela = c.rect("Tela 2D", 260, 380, 620, 440, BRANCO, rx=30, stroke=NOITE, sw=8, op=0)
c.nos.append(tela)
c.mostra(tela, 1.55, 3.45, pop=True)
chave2d = no_chao(c, "Chave · 2D", "chave", 570, 660, 0.38)
c.mostra(chave2d, 1.7, 3.45)
c.mostra(c.caixa("Caixa · sumir", "sumir", BRANCO, TINTA, 360, 520, 280, num=1), 3.5, 7.9, pop=True)
nao_e = c.texto("Não é", "não é", 640, 540, 52, AMARELO, ancora="middle", op=0)
c.nos.append(nao_e)
c.mostra(nao_e, 4.0, 7.9)
c.mostra(c.caixa("Caixa · guardar", "guardar", VERDE, AMARELO, 920, 520, 300, num=2), 5.45, 7.9, pop=True)
heroi = Personagem(c, "Aventureiro · pegou")
heroi.em(0.0, 640, 940, 0.42)
c.trilha(heroi.g, "opacity", [(6.1, 0, None), (6.4, 100, None), (7.65, 100, None), (7.9, 0, None)])
heroi.fechar()
variavel(c, "temChave", "temChave", 640, 640, [(11.75, "sim ou não?", TINTA)], t0=9.95)
c.salvar("conceito-1-sumir-nao-e-guardar")

# 2. Começar sem a chave (14,4 a 17,8).
c = Cena("Conceito · Começar sem a chave", 14.4, 17.8, BASE, BLOCOS, SAIDA)
c.ideia("A partida começa sem a chave", 14.45, 17.8, None)
chao(c, 14.45)
heroi2 = Personagem(c, "Aventureiro")
heroi2.em(14.4, 420, 960, 0.6)
c.trilha(heroi2.g, "opacity", [(14.45, 0, None), (14.75, 100, None)])
heroi2.fechar()
variavel(c, "temChave", "temChave", 900, 520, [(16.6, "falso", VERMELHO)], t0=14.9)
c.salvar("conceito-2-comecar-sem-a-chave")

# 3. Sim ou não (37,4 a 44,9).
c = Cena("Conceito · Sim ou não", 37.4, 44.9, BASE, BLOCOS, SAIDA)
c.ideia("Agora o valor", 37.45, 40.3, None)
c.ideia("temChave: sim ou não", 40.35, 44.9, None)
variavel(c, "temChave", "temChave", 640, 520, [(38.8, "0", TINTA)], t0=37.5)
risco = c.rect("Risco no 0", 560, 534, 160, 14, VERMELHO, rx=7, op=0)
c.nos.append(risco)
c.mostra(risco, 40.4)
c.mostra(c.caixa("Caixa · verdadeiro", "verdadeiro", VERDE, AMARELO, 420, 820, 360, num=1), 42.95, pop=True)
c.mostra(c.caixa("Caixa · falso", "falso", BRANCO, VERMELHO, 860, 820, 300, num=2), 43.8, pop=True)
sim = c.texto("sim", "sim", 420, 720, 46, BRANCO, familia="Nunito", ancora="middle", op=0)
nao = c.texto("não", "não", 860, 720, 46, BRANCO, familia="Nunito", ancora="middle", op=0)
c.nos += [sim, nao]
c.mostra(sim, 42.2)
c.mostra(nao, 42.45)
c.salvar("conceito-3-sim-ou-nao")

# 4. A outra metade (57,1 a 62,7).
c = Cena("Conceito · A outra metade", 57.1, 62.7, BASE, BLOCOS, SAIDA)
c.ideia("A outra metade", 57.15, 58.8, None)
c.ideia("Pegou a chave: verdadeiro", 58.85, 62.7, None)
chao(c, 57.15)
chave4 = no_chao(c, "Chave", "chave", 700, 900, 0.42)
c.mostra(chave4, 57.2, 60.1)
heroi4 = Personagem(c, "Aventureiro")
heroi4.em(57.1, 300, 950, 0.6)
heroi4.anda(58.9, 59.9, (300, 950, 0.6), (560, 930, 0.6))
c.trilha(heroi4.g, "opacity", [(57.15, 0, None), (57.45, 100, None)])
heroi4.fechar()
pegou = estrela(c, "Estrela · pegou", 700, 820, 60)
c.mostra(pegou, 60.1, 61.0, pop=True)
variavel(c, "temChave", "temChave", 1050, 480, [(57.3, "falso", VERMELHO), (61.3, "verdadeiro", VERDE)], w=380, t0=57.2)
c.salvar("conceito-4-a-outra-metade")

# 5. Os dois lugares (95,7 a 100,9).
c = Cena("Conceito · Os dois lugares", 95.7, 100.9, BASE, BLOCOS, SAIDA)
c.ideia("Os dois lugares", 95.75, 97.1, None)
c.ideia("Ao começar: falso", 97.15, 98.75, None)
c.ideia("Ao pegar a chave: verdadeiro", 98.8, 100.9, None)
inicio, d1 = c.bloco("bloco-criar-temchave", 110, 380, 1.15)
c.mostra(inicio, 95.85, pop=True)
encontro, d2 = c.bloco("bloco-alterar-temchave", 110, 680, 1.15)
c.mostra(encontro, 96.1, pop=True)
variavel(c, "temChave · começo", "temChave", 1120, 450, [(97.2, "falso", VERMELHO)], w=320, t0=97.15)
variavel(c, "temChave · pegou", "temChave", 1120, 760, [(98.9, "verdadeiro", VERDE)], w=320, t0=98.85)
c.salvar("conceito-5-os-dois-lugares")

# 6. Guardado por dentro (101,1 a 111,3): o Dedé fala de 101,18 a 103,3, à esquerda.
c = Cena("Conceito · Guardado por dentro", 101.1, 111.3, BASE, BLOCOS, SAIDA)
c.ideia("Como eu vejo?", 101.15, 103.6, None)
c.ideia("Não aparece na ilha", 103.65, 107.7, None)
c.ideia("Quem usa é o farol", 107.75, 111.3, None)
c.ideia(None, 109.9, 111.3, "Na próxima aula")
jogo, _ = c.bloco("jogo-ilha", 520, 330, 0.5, fundo=BRANCO, pad=10)
c.mostra(jogo, 101.2, 107.7, pop=True)
duvida = balao_pensa(c, "Balão · ?", 1050, 300, "?")
c.mostra(duvida, 101.3, 103.6, pop=True)
variavel(c, "temChave", "temChave", 900, 860, [(101.4, "verdadeiro", VERDE)], w=380, t0=101.3)
c.mostra(c.caixa("Caixa · não aparece", "não aparece na ilha", BRANCO, VERMELHO, 870, 440, 430), 104.4, 107.7, pop=True)
farol = no_chao(c, "Farol", "farol-listrado", 420, 1000, 0.62)
c.mostra(farol, 107.8, pop=True)
seta = c.poly("Seta · para o farol", [(700, 830), (620, 790), (620, 870)], AMARELO)
seta["transform"]["opacity"] = 0
c.nos.append(seta)
c.mostra(seta, 108.5)
c.salvar("conceito-6-guardado-por-dentro")
