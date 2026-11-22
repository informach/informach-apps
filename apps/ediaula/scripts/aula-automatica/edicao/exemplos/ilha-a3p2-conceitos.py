"""Exemplo: as animações da Ilha do Farol, Aula 3, Parte 2, "Acenda o farol com a chave" (22/11/2026). Ficam na tela
as ações (rodar, andar, arrastar, abrir as categorias, encaixar, escolher, escrever), o "Tá vendo?", a regra pronta
que a fala aponta e o "olha só".

Os tempos saem da voz da parte (tempos_da_voz.Voz), já na linha do tempo da edição: grave antes de gerar. Cada
cena procura a sua frase depois do fim da anterior.
  1. conceito-1-a-resposta-do-sim ("Agora a gente vai pôr a resposta do sim" até "um aviso para quem está
     jogando"): o espaço do então e os três blocos da resposta (recorte do fim da parte), um de cada vez.
  2. conceito-2-o-farol-sabe-acender ("No jogo 2D, a gente trocava a imagem" até "animação de acender"): no 2D,
     duas imagens trocando; no 3D, o farol acende sozinho.
  3. conceito-3-uma-vez-ou-repetindo ("Uma vez quer dizer" até "recomeçar sem parar"): uma vez, a luz acende e
     fica; repetindo, ela recomeça sem parar.
  4. conceito-4-a-variavel-ganhou ("O segundo bloco guarda" até "quando o farol acende"): a caixa ganhou com
     falso; o farol acende e ela vira verdadeiro.
  5. conceito-5-o-aviso-da-vitoria (a pergunta da Debinha até "ainda dentro do então"): a Debinha fala por
     cima, à esquerda; o aviso da vitória aparece no alto da ilha.
Imagens (pasta de blocos): os renders e o recorte bloco-entao-completo (o então com os três blocos).
Uso: ilha-a3p2-conceitos.py <base.edisvg> <pasta dos blocos> <pasta de saída (a pasta pecas da parte)>
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from edisvg_cena import AMARELO, BRANCO, NOITE, TINTA, VERDE, Cena  # noqa: E402
from ilha_cena import chao, estrela, no_chao, variavel  # noqa: E402
from tempos_da_voz import Voz  # noqa: E402

BASE, BLOCOS, SAIDA = sys.argv[1:4]
voz = Voz.da_parte("ilha", 3, 2)
VERMELHO = "#E2563B"


def faixa(c, nome, texto, cx, cy, w=760):
    g = c.grupo(nome, cx, cy, [c.rect("faixa", -w / 2, -40, w, 80, NOITE, rx=22),
                               c.texto("texto", texto, 0, 12, 32, BRANCO, familia="Nunito", ancora="middle")], op=0)
    c.nos.append(g)
    return g


# 1. A resposta do sim.
t0, t1 = voz.trecho("Agora a gente vai pôr a resposta do sim", "para quem está jogando.")
c = Cena("Conceito · A resposta do sim", t0, t1, BASE, BLOCOS, SAIDA)
t_tres = voz.palavra("A resposta do sim vai ter três blocos", t0)
t_luz = voz.palavra("um que acende a luz", t_tres)
t_ganha = voz.palavra("um que guarda", t_luz)
t_aviso = voz.palavra("e um aviso", t_ganha)
c.ideia("A resposta do sim", t0 + 0.05, t_tres - 0.1, None)
c.ideia("Três blocos, um embaixo do outro", t_tres - 0.05, t1, None)
entao, _ = c.bloco("bloco-entao-completo", 260, 330, 1.0)
c.mostra(entao, t0 + 0.2, pop=True)
for k, (rotulo, t, y) in enumerate((("a luz", t_luz, 470), ("ganhou", t_ganha, 560), ("o aviso", t_aviso, 650))):
    c.mostra(c.caixa(f"Papel · {rotulo}", rotulo, AMARELO, TINTA, 1290, y, 260, num=k + 1, tam=40), t, pop=True)
c.salvar("conceito-1-a-resposta-do-sim")

# 2. O farol sabe acender.
t0, t1 = voz.trecho("No jogo 2D, a gente trocava a imagem", "animação de acender.", depois=t1)
c = Cena("Conceito · O farol sabe acender", t0, t1, BASE, BLOCOS, SAIDA)
t_aqui = voz.palavra("Aqui o farol é um modelo 3D", t0)
t_sabe = voz.palavra("e ele sabe acender", t_aqui)
c.ideia("No 2D, duas imagens", t0 + 0.05, t_aqui - 0.1, None)
c.ideia("No 3D, ele sabe acender", t_aqui - 0.05, t1, None)
for k, (arq, x) in enumerate((("farol-listrado", 360), ("farol-listrado-aceso", 760))):
    quadro = c.rect(f"Imagem 2D · {k + 1}", x - 160, 320, 320, 560, BRANCO, rx=24, stroke="#C9D6E8", sw=6, op=0)
    c.nos.append(quadro)
    c.mostra(quadro, t0 + 0.3 + 0.5 * k, t_aqui, pop=True)
    c.mostra(no_chao(c, f"Farol 2D · {k + 1}", arq, x, 850, 0.46), t0 + 0.4 + 0.5 * k, t_aqui, pop=True)
chao(c, t_aqui)
apagado = no_chao(c, "Farol 3D apagado", "farol-listrado", 660, 960, 0.75)
c.mostra(apagado, t_aqui + 0.1, t_sabe + 0.8, pop=True)
aceso = no_chao(c, "Farol 3D aceso", "farol-listrado-aceso", 660, 960, 0.75)
c.mostra(aceso, t_sabe + 0.5)
c.mostra(estrela(c, "Estrela · acende", 660, 360, 50), t_sabe + 0.6, t_sabe + 1.6, pop=True)
c.salvar("conceito-2-o-farol-sabe-acender")

# 3. Uma vez ou repetindo.
t0, t1 = voz.trecho("Uma vez quer dizer", "recomeçar sem parar.", depois=t1)
c = Cena("Conceito · Uma vez ou repetindo", t0, t1, BASE, BLOCOS, SAIDA)
t_rep = voz.palavra("Repetindo faria", t0)
c.ideia("Uma vez: acende e fica", t0 + 0.05, t_rep - 0.1, None)
c.ideia("Repetindo: recomeça sem parar", t_rep - 0.05, t1, None)
c.mostra(c.caixa("Rótulo · uma vez", "uma vez", VERDE, BRANCO, 380, 330, 240, tam=44), t0 + 0.1, pop=True)
um_apagado = no_chao(c, "Uma vez · apagado", "farol-listrado", 380, 900, 0.55)
c.mostra(um_apagado, t0 + 0.2, t0 + 1.4)
c.mostra(no_chao(c, "Uma vez · aceso", "farol-listrado-aceso", 380, 900, 0.55), t0 + 1.2)
c.mostra(c.caixa("Rótulo · repetindo", "repetindo", VERMELHO, BRANCO, 1000, 330, 280, tam=44), t_rep, pop=True)
rep_apagado = no_chao(c, "Repetindo · apagado", "farol-listrado", 1000, 900, 0.55)
c.mostra(rep_apagado, t_rep + 0.1)
rep_aceso = no_chao(c, "Repetindo · aceso", "farol-listrado-aceso", 1000, 900, 0.55)
pisca, t = [(t_rep + 0.1, 0, None)], t_rep + 0.5
while t < t1 - 0.4:
    pisca += [(t, 100, None), (t + 0.45, 100, None), (t + 0.5, 0, None)]
    t += 0.9
c.trilha(rep_aceso, "opacity", pisca)
c.salvar("conceito-3-uma-vez-ou-repetindo")

# 4. A variável ganhou.
t0, t1 = voz.trecho("O segundo bloco guarda", "quando o farol acende.", depois=t1)
c = Cena("Conceito · A variável ganhou", t0, t1, BASE, BLOCOS, SAIDA)
t_comeca = voz.palavra("ela começa falso", t0)
t_vira = voz.palavra("e vira verdadeiro", t_comeca)
c.ideia("A partida foi ganha?", t0 + 0.05, t_comeca - 0.1, None)
c.ideia("A variável ganhou", t_comeca - 0.05, t1, None)
variavel(c, "ganhou", "ganhou", 470, 600, [(t_comeca, "falso", VERMELHO), (t_vira + 0.4, "verdadeiro", VERDE)], w=480,
         t0=t0 + 0.2)
apagado = no_chao(c, "Farol apagado", "farol-listrado", 1050, 920, 0.62)
c.mostra(apagado, t0 + 0.3, t_vira + 0.5, pop=True)
c.mostra(no_chao(c, "Farol aceso", "farol-listrado-aceso", 1050, 920, 0.62), t_vira + 0.2)
c.salvar("conceito-4-a-variavel-ganhou")

# 5. O aviso da vitória (a Debinha à esquerda).
t0 = voz.palavra("E quem está jogando vai saber", t1)
t1 = voz.fim("ainda dentro do então.", t0)
c = Cena("Conceito · O aviso da vitória", t0, t1, BASE, BLOCOS, SAIDA)
t_sim = voz.palavra("Vai, sim", t0)
c.ideia("Quem joga vai saber?", t0 + 0.05, t_sim - 0.1, None)
c.ideia("O aviso da vitória", t_sim - 0.05, t1, None)
chao(c, t0 + 0.05)
c.mostra(no_chao(c, "Farol aceso", "farol-listrado-aceso", 1000, 900, 0.62), t0 + 0.2, pop=True)
c.mostra(no_chao(c, "Barco", "barco-veleiro", 540, 760, 0.28), t_sim + 0.6, pop=True)
c.mostra(faixa(c, "Aviso da vitória", "Você acendeu o farol! O barco pode chegar.", 780, 360), t_sim, pop=True)
c.salvar("conceito-5-o-aviso-da-vitoria")
