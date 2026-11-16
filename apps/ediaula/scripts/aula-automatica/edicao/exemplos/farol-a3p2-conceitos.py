"""Exemplo: as quatro animações de conceito da Farol Aula 3 Parte 2 (1:40, 2:19, 2:56 e 4:01).

Cada conceito é uma Cena com os tempos das falas (da transcrição) e os blocos recortados da gravação:
  recortar.sh <gravação> 111.5 290 130 716 316 blocos/se-novo.png      (o Se da gaveta)
  recortar.sh <gravação> 151.5 290 294 514 364 blocos/valor-variavel.png
  recortar.sh <gravação> 151.5 290 207 434 276 blocos/texto-ola.png
  recortar.sh <gravação> 151.5 791 508 1012 664 blocos/se-vazio.png
  recortar.sh <gravação> 166 791 508 1158 674 blocos/se-temchave.png
  recortar.sh <gravação> 233 791 508 1158 752 blocos/se-entao-senao.png
  recortar.sh <gravação> 243 860 652 1216 728 blocos/alterar-1.png
  recortar.sh <gravação> 258 860 652 1298 728 blocos/alterar-texto.png
Uso: farol-a3p2-conceitos.py <base.edisvg> <pasta dos blocos> <pasta de saída>
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from edisvg_cena import AMARELO, AREA_GAVETA, BRANCO, SUAVE, TINTA, VAIVEM, VERDE, Cena  # noqa: E402

PASTAS = sys.argv[1:4]

# 1. O bloco Se faz a pergunta (1:40,0 a 1:46,6).
c = Cena("Conceito · O bloco Se pergunta", 100.0, 106.6, *PASTAS)
c.ideia("O bloco Se", 100.0, None, "Para fazer uma pergunta, o jogo usa o bloco Se.", t1_sub=104.15, ts=100.15)
c.ideia(None, 104.2, None, "É ele que vai fazer a pergunta da porta.")
se, dest = c.bloco("se-novo", 110, 420, 2.0, fundo=AREA_GAVETA)
c.mostra(se, 102.8, pop=True)
palavra = dest("Destaque · Se", 2, 14, 58, 62)
c.pisca(palavra, 103.2, 106.6, vezes=3)
farol = c.instancia("farol · farol-listrado-apagado", 1000, 590, 300)
c.mostra(farol, 104.2, pop=True)
pergunta = c.balao("Balão · Tem a chave?", "Tem a chave?", 1130, 500, 330, 20)
c.mostra(pergunta, 104.9, pop=True)
c.salvar("conceito-1-o-bloco-se")

# 2. A pergunta certa é sobre tem chave (2:19,0 a 2:26,6).
c = Cena("Conceito · A pergunta certa", 139.0, 146.6, *PASTAS)
c.ideia("A pergunta certa", 139.0, None, "É sobre tem chave: o personagem tem a chave?", t1_sub=142.15, ts=139.1)
c.ideia(None, 142.2, None, "Quem traz o que ela guarda: valor da variável.")
se, dest = c.bloco("se-vazio", 120, 400, 2.2)
c.mostra(se, 139.0, pop=True)
vaga = dest("Destaque · lugar da pergunta", 54, 10, 118, 52)
c.pisca(vaga, 139.6, 142.1, vezes=2)
termo = c.caixa("Caixa · temChave", "temChave", BRANCO, TINTA, 1010, 470, 360, num=1)
c.mostra(termo, 140.7, pop=True)
valor, dest_v = c.bloco("valor-variavel", 700, 720, 2.0, fundo=AREA_GAVETA)
c.mostra(valor, 144.9, pop=True)
contorno_v = dest_v("Destaque · valor da variável", 0, 0, 224, 70)
c.pisca(contorno_v, 145.3, 146.6, vezes=1)
c.salvar("conceito-2-a-pergunta-certa")

# 3. As duas respostas e os espaços então e senão (2:55,8 a 3:26,1).
c = Cena("Conceito · Então e senão", 175.8, 206.1, *PASTAS)
c.ideia("As respostas da porta", 175.8, 181.55, "A resposta fica num espaço do próprio Se.", t1_sub=177.95, ts=175.9)
c.ideia(None, 178.0, 181.55, "Lembra? A porta tem duas respostas.")
c.ideia("Então e senão", 181.6, 200.5, "No Se, cada resposta tem um espaço com nome.", t1_sub=185.6)
c.ideia(None, 185.7, 188.6, "Olha aqui: este é o espaço do então.")
c.ideia(None, 188.7, 193.0, "Nele vai a resposta do sim.")
c.ideia(None, 193.1, 198.8, "No senão vai a resposta do não.")
c.ideia(None, 198.9, 200.5, "É lá que vai o aviso.")
c.ideia("Abra o senão", 200.6, None, "O Se chega sem o senão: abra esse espaço.")
X, Y, E = 110, 380, 1.9
se1, dest1 = c.bloco("se-temchave", X, Y, E)
se2, dest2 = c.bloco("se-entao-senao", X, Y, E)
c.trilha(se1, "opacity", [(175.9, 0, None), (176.2, 100, None), (181.6, 100, None), (181.9, 0, None),
                          (200.6, 0, None), (200.9, 100, None)])
for p in ("sx", "sy"):
    c.trilha(se1, p, [(175.9, 0.7, SUAVE), (176.18, 1.05, VAIVEM), (176.32, 1, None)])
c.trilha(se2, "opacity", [(181.6, 0, None), (181.9, 100, None), (200.6, 100, None), (200.9, 0, None)])
farol = c.instancia("farol · farol-listrado-apagado", 930, 440, 300)
c.mostra(farol, 178.0, 181.55, pop=True)
pergunta = c.balao("Balão · Tem a chave?", "Tem a chave?", 1080, 390, 360, 30)
c.mostra(pergunta, 178.4, 181.55, pop=True)
sim = c.caixa("Caixa · Sim", "Sim", BRANCO, TINTA, 980, 830, 190, num=1)
nao = c.caixa("Caixa · Não", "Não", BRANCO, TINTA, 1190, 830, 190, num=2)
c.mostra(sim, 180.1, 181.55, pop=True)
c.mostra(nao, 180.9, 181.55, pop=True)
# Os dois espaços com nome: então (do sim) e senão (do não, com o aviso).
nome_entao = dest2("Destaque · então", 0, 62, 362, 140)
nome_senao = dest2("Destaque · senão", 0, 146, 362, 198)
c.trilha(nome_entao, "opacity", [(182.7, 0, None), (182.95, 100, None), (183.5, 100, None), (183.75, 0, None),
                                 (185.7, 0, None), (185.95, 100, None), (193.0, 100, None), (193.25, 0, None)])
c.trilha(nome_senao, "opacity", [(183.8, 0, None), (184.05, 100, None), (184.8, 100, None), (185.05, 0, None),
                                 (193.1, 0, None), (193.35, 100, None), (200.3, 100, None), (200.55, 0, None)])
resp_sim = c.caixa("Caixa · sim, com a chave", "Sim: chega com a chave", BRANCO, TINTA, 1060, Y + 100 * E, 440, num=1, tam=38)
c.mostra(resp_sim, 188.7, 200.5, pop=True)
resp_nao = c.caixa("Caixa · não, sem a chave", "Não: chega sem a chave", BRANCO, TINTA, 1060, Y + 172 * E, 440, num=2, tam=38)
c.mostra(resp_nao, 193.6, 200.5, pop=True)
aviso = c.caixa("Caixa · aviso", "Aviso: falta a chave!", VERDE, AMARELO, 1060, Y + 172 * E + 125, 440, num=3, tam=38)
c.mostra(aviso, 198.9, 200.5, pop=True)
mais = dest1("Destaque · + senão", 122, 112, 214, 154)
c.pisca(mais, 201.6, 206.1, vezes=4)
c.salvar("conceito-3-entao-e-senao")

# 4. Número ou texto (4:01,5 a 4:09,0).
c = Cena("Conceito · Número ou texto", 241.5, 249.0, *PASTAS)
c.ideia("Número ou texto?", 241.5, None, "O valor desse bloco vem com um número.", t1_sub=244.1, ts=241.6)
c.ideia(None, 244.2, 246.4, "Mas o aviso é uma mensagem.")
c.ideia(None, 246.5, None, "Troque o número por um texto.")
alt, dest_a = c.bloco("alterar-1", 110, 420, 2.4)
alt2, _ = c.bloco("alterar-texto", 110, 420, 2.4)
c.trilha(alt, "opacity", [(241.6, 0, None), (241.9, 100, None), (248.25, 100, None), (248.45, 0, None)])
for p in ("sx", "sy"):
    c.trilha(alt, p, [(241.6, 0.7, SUAVE), (241.88, 1.05, VAIVEM), (242.02, 1, None)])
c.trilha(alt2, "opacity", [(248.25, 0, None), (248.45, 100, None)])
um = dest_a("Destaque · número", 286, 12, 346, 64)
c.trilha(um, "opacity", [(242.3, 0, None), (242.55, 100, None), (243.0, 35, None), (243.4, 100, None),
                         (247.9, 100, None), (248.1, 0, None)])
msg = c.caixa("Caixa · mensagem", "A porta não abriu. Falta a chave.", VERDE, AMARELO, 680, 720, 1060, tam=44)
c.mostra(msg, 244.4, pop=True)
texto_b, dest_t = c.bloco("texto-ola", 130, 830, 2.4, fundo=AREA_GAVETA)
c.trilha(texto_b, "opacity", [(246.6, 0, None), (246.9, 100, None), (248.3, 100, None), (248.45, 0, None)])
for p in ("sx", "sy"):
    c.trilha(texto_b, p, [(246.6, 0.7, SUAVE), (246.88, 1.05, VAIVEM), (247.02, 1, None)])
# Leva o texto até em cima do número.
c.trilha(texto_b, "x", [(247.5, 130, VAIVEM), (248.3, 787, None)])
c.trilha(texto_b, "y", [(247.5, 830, VAIVEM), (248.3, 425, None)])
c.salvar("conceito-4-numero-ou-texto")
