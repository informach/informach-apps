"""Exemplo: as animações da Ilha do Farol, Aula 3, Parte 8, "Sua ilha está pronta" (22/11/2026). Ficam na tela o
Compartilhar, o resumo, a capa, o Publicar, o Copiar link e o Concluir aula.

Os tempos saem da voz da parte (tempos_da_voz.Voz), já na linha do tempo da edição: grave antes de gerar.
  1. conceito-1-do-movimento-ao-barco ("Você transformou a ideia" até "com a sua cara"): "[na edição: o jogo
     pronto, do movimento ao barco]", em animação: o personagem anda ("o movimento"), a chave some ("o lugar da
     chave"), o farol acende ("o farol acender") e o barco chega; no fim, a turma de personagens ("a sua cara").
  2. conceito-2-o-mural ("O mural é o lugar" até "jogar o seu jogo"): um mural de jogos com o seu no meio, e a
     família e os amigos chegando para jogar.
  3. conceito-3-concluir-sem-publicar ("Você também pode clicar em Concluir aula" até "sem publicar"): dois
     caminhos, o mural e a jornada que continua.
  4. conceito-4-o-link ("Quem receber o link" até "com o teclado"): o link vai até um computador, e as setas
     do teclado jogam.
Imagens (pasta de blocos): os renders e as miniaturas dos cenários.
Uso: ilha-a3p8-conceitos.py <base.edisvg> <pasta dos blocos> <pasta de saída (a pasta pecas da parte)>
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from edisvg_cena import AMARELO, BRANCO, NOITE, SUAVE, TINTA, VERDE, Cena  # noqa: E402
from ilha_cena import Personagem, aperta, chao, estrela, mover, no_chao, tecla  # noqa: E402
from tempos_da_voz import Voz  # noqa: E402

BASE, BLOCOS, SAIDA = sys.argv[1:4]
voz = Voz.da_parte("ilha", 3, 8)
AZUL = "#1F6FD1"

# 1. Do movimento ao barco.
t0, t1 = voz.trecho("Você transformou a ideia", "com a sua cara.")
c = Cena("Conceito · Do movimento ao barco", t0, t1, BASE, BLOCOS, SAIDA)
t_mov = voz.palavra("Programou o movimento", t0)
t_chave = voz.palavra("escolheu o lugar da chave", t_mov)
t_farol = voz.palavra("fez o farol acender", t_chave)
t_cara = voz.palavra("deixou o jogo com a sua cara", t_farol)
c.ideia("Um jogo em três dimensões", t0 + 0.05, t_mov - 0.1, None)
c.ideia("Do movimento ao barco", t_mov - 0.05, t_cara - 0.1, None)
c.ideia("Com a sua cara", t_cara - 0.05, t1, None)
chao(c, t0 + 0.05, t_cara)
chave = no_chao(c, "Chave", "chave", 700, 900, 0.36)
c.mostra(chave, t0 + 0.3, t_chave + 1.0, pop=True)
some = estrela(c, "Estrela · pegou", 700, 780, 54)
c.mostra(some, t_chave + 0.8, t_chave + 1.6, pop=True)
heroi = Personagem(c, "Aventureiro")
heroi.em(t0, 300, 960, 0.6)
heroi.anda(t_mov + 0.1, t_chave + 0.8, (300, 960, 0.6), (640, 930, 0.6))
c.trilha(heroi.g, "opacity", [(t0 + 0.2, 0, None), (t0 + 0.5, 100, None), (t_cara - 0.25, 100, None), (t_cara, 0, None)])
heroi.fechar()
apagado = no_chao(c, "Farol apagado", "farol-listrado", 1080, 900, 0.62)
c.mostra(apagado, t0 + 0.4, t_farol + 0.6)
aceso = no_chao(c, "Farol aceso", "farol-listrado-aceso", 1080, 900, 0.62)
c.mostra(aceso, t_farol + 0.4, t_cara)
barco = no_chao(c, "Barco", "barco-veleiro", 180, 860, 0.3)
c.mostra(barco, t_farol + 0.8, t_cara)
mover(c, barco, "barco-veleiro", t_farol + 0.8, (120, 860, 0.3), t_cara, (330, 860, 0.3), SUAVE)
turma = ["aventureiro", "menina-de-laco", "pirata", "robo", "marinheira", "mergulhador"]
for k, nome in enumerate(turma):
    f = no_chao(c, f"Personagem · {nome}", f"personagem-{nome}", 260 + k * 200, 940, 0.42)
    c.mostra(f, t_cara + 0.05 + 0.12 * k, pop=True)
c.salvar("conceito-1-do-movimento-ao-barco")

# 2. O mural.
t0, t1 = voz.trecho("O mural é o lugar", "jogar o seu jogo.")
c = Cena("Conceito · O mural", t0, t1, BASE, BLOCOS, SAIDA)
t_familia = voz.palavra("a sua família", t0)
c.ideia("O Mural", t0 + 0.05, t_familia - 0.1, None)
c.ideia("Para a família e os amigos", t_familia - 0.05, t1, None)
mural = c.rect("Mural", 140, 260, 1180, 520, BRANCO, rx=36, op=0)
c.nos.append(mural)
c.mostra(mural, t0 + 0.1)
capas = ["costa-rochosa", "ilha-nevada", "praia-tropical", "noite-na-ilha", "costa-rochosa", "ilha-nevada"]
for k, nome in enumerate(capas):
    x, y = 330 + (k % 3) * 400, 470 + (k // 3) * 250
    capa = no_chao(c, f"Jogo · {k + 1}", f"cenario-{nome}", x, y, 0.62)
    c.mostra(capa, t0 + 0.3 + 0.12 * k, pop=True)
seu = c.rect("Destaque · o seu jogo", 730 - 165, 470 - 205, 330, 210, "none", rx=24, stroke=AMARELO, sw=10, op=0)
c.nos.append(seu)
c.pisca(seu, t0 + 1.4, t1, vezes=3)
for k, nome in enumerate(("marinheira", "menino-de-bone", "exploradora-de-chapeu")):
    p = no_chao(c, f"Quem joga · {nome}", f"personagem-{nome}", 420 + k * 300, 1060, 0.4)
    c.mostra(p, t_familia + 0.1 + 0.2 * k, pop=True)
c.salvar("conceito-2-o-mural")

# 3. Concluir sem publicar.
t0, t1 = voz.trecho("Você também pode clicar em Concluir aula", "sem publicar.")
c = Cena("Conceito · Concluir sem publicar", t0, t1, BASE, BLOCOS, SAIDA)
t_jornada = voz.palavra("continuar a jornada", t0)
c.ideia("Você escolhe", t0 + 0.05, t1, None)
publicar = c.caixa("Caminho · publicar", "Mural", AZUL, BRANCO, 420, 520, 320, tam=56)
c.mostra(publicar, t0 + 0.2, pop=True)
concluir = c.caixa("Caminho · concluir", "Concluir aula", VERDE, BRANCO, 1000, 520, 420, tam=56)
c.mostra(concluir, t0 + 0.5, pop=True)
for k in range(4):
    passo = c.rect(f"Jornada · {k + 1}", 900 + k * 80, 680 + k * 60, 60, 24, AMARELO, rx=12, op=0)
    c.nos.append(passo)
    c.mostra(passo, t_jornada + 0.15 * k)
c.mostra(estrela(c, "Estrela · jornada", 1240, 940, 44), t_jornada + 0.7, pop=True)
c.salvar("conceito-3-concluir-sem-publicar")

# 4. O link.
t0, t1 = voz.trecho("Quem receber o link", "com o teclado.")
c = Cena("Conceito · O link", t0, t1, BASE, BLOCOS, SAIDA)
t_pc = voz.palavra("no computador", t0)
t_teclado = voz.palavra("com o teclado", t_pc)
c.ideia("Joga direto", t0 + 0.05, t1, None)
link = c.caixa("Link", "link do jogo", BRANCO, AZUL, 300, 520, 300, tam=44)
c.mostra(link, t0 + 0.1)
mover(c, link, None, t0 + 0.8, (300, 520, 1), t_pc, (760, 470, 0.7), SUAVE, pe=(0, 0))
tela = c.grupo("Computador", 980, 330, [
    c.rect("moldura", -260, 0, 520, 340, NOITE, rx=24),
    c.rect("tela", -236, 22, 472, 296, "#8FD3FF", rx=12),
    c.rect("pé", -40, 340, 80, 60, NOITE),
    c.rect("base", -120, 396, 240, 24, NOITE, rx=12),
], op=0)
c.nos.append(tela)
c.mostra(tela, t_pc - 0.3, pop=True)
jogo = no_chao(c, "Jogo na tela", "cenario-praia-tropical", 980, 640, 0.9)
c.mostra(jogo, t_pc + 0.2)
teclas = [tecla(c, f"Tecla · {s}", 800 + k * 120, 920, seta=s) for k, s in enumerate(("esq", "cima", "baixo", "dir"))]
for k, tk in enumerate(teclas):
    # Sem o pulo: a última tecla afunda no toque (a escala dela é do aperta).
    c.mostra(tk, t_teclado - 0.2 + 0.08 * k)
aperta(c, teclas[3], (t_teclado + 0.6, t_teclado + 1.1))
c.salvar("conceito-4-o-link")
