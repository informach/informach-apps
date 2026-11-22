"""Exemplo: as animações da Ilha do Farol, Aula 3, Parte 4, "O farol acende uma vez só" (22/11/2026). Ficam na tela
as ações (rodar, andar, arrastar, abrir as categorias, encaixar, jogar na lixeira, escolher, mover), o "Tá vendo?",
o "olha aqui", o "olha só" e o jogo que a fala aponta.

Os tempos saem da voz da parte (tempos_da_voz.Voz), já na linha do tempo da edição: grave antes de gerar. Cada
cena procura a sua frase depois do fim da anterior.
  1. conceito-1-acendeu-de-novo (a pergunta da Debinha até "manda acender outra vez"): a Debinha fala por cima,
     à esquerda; o personagem encosta no farol duas vezes, e a cada encontro a luz recomeça.
  2. conceito-2-o-apito-final ("Sabe o apito final" até "a partida acabou"): "[na edição: o apito final e o gol
     que não vale]": o Zappy de juiz apita, a bola entra no gol depois e o placar não muda.
  3. conceito-3-ganhou-e-o-apito ("No seu jogo, o apito final" até "responder outra vez"): a caixa ganhou vira
     verdadeiro com o apito; o farol fica aceso.
  4. conceito-4-a-pergunta-com-nao ("Por isso, o encontro vai fazer uma pergunta" até "virava ao contrário"):
     "A partida ainda não foi ganha?" e a porta da experiência, com o não que vira a resposta.
  5. conceito-5-falso-responde-verdadeiro-para ("No seu jogo é igual" até "para de responder"): ganhou falso,
     a resposta é sim e o farol responde; ganhou verdadeiro, a resposta é não e o farol fica quieto.
  6. conceito-6-uma-pergunta-dentro-da-outra ("Agora a pergunta da chave vai ficar dentro" até "ainda não foi
     ganha"): o encontro com o Se não ganhou e o Se temChave dentro dele (recorte do fim da parte).
Imagens (pasta de blocos): os renders, zappy.png e o recorte bloco-se-dentro-do-se.
Uso: ilha-a3p4-conceitos.py <base.edisvg> <pasta dos blocos> <pasta de saída (a pasta pecas da parte)>
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from edisvg_cena import AMARELO, BRANCO, NOITE, SUAVE, TINTA, VERDE, Cena  # noqa: E402
from ilha_cena import Personagem, chao, circulo, estrela, mover, no_chao, variavel  # noqa: E402
from tempos_da_voz import Voz  # noqa: E402

BASE, BLOCOS, SAIDA = sys.argv[1:4]
voz = Voz.da_parte("ilha", 3, 4)
VERMELHO, MADEIRA, MADEIRA_ESCURA, GRAMA = "#E2563B", "#B7793F", "#7A4A22", "#3FA34D"


def apito(c, nome, cx, cy):
    g = c.grupo(nome, cx, cy, [c.rect("corpo", -60, -30, 120, 60, "#C9D6E8", rx=30),
                               c.rect("bocal", 50, -14, 50, 28, "#9AA8BC", rx=10),
                               c.rect("cordão", -80, -6, 30, 12, VERMELHO, rx=6)], op=0)
    c.nos.append(g)
    return g


# 1. Acendeu de novo (a Debinha à esquerda).
t0 = voz.palavra("Ué, por que a luz")
t1 = voz.fim("acender outra vez.", t0)
c = Cena("Conceito · Acendeu de novo", t0, t1, BASE, BLOCOS, SAIDA)
t_cada = voz.palavra("Porque, cada vez", t0)
c.ideia("Acendeu de novo?", t0 + 0.05, t_cada - 0.1, None)
c.ideia("Cada encontro acende outra vez", t_cada - 0.05, t1, None)
chao(c, t0 + 0.05)
heroi = Personagem(c, "Aventureiro")
heroi.em(t0, 760, 930, 0.55)
ida1, volta = t_cada + 0.2, t_cada + 1.6
heroi.anda(ida1, ida1 + 0.8, (760, 930, 0.55), (900, 920, 0.55))
heroi.anda(volta, volta + 0.6, (900, 920, 0.55), (780, 930, 0.55))
heroi.anda(volta + 1.0, volta + 1.6, (780, 930, 0.55), (900, 920, 0.55))
c.trilha(heroi.g, "opacity", [(t0 + 0.1, 0, None), (t0 + 0.4, 100, None)])
heroi.fechar()
apagado = no_chao(c, "Farol apagado", "farol-listrado", 1100, 900, 0.6)
c.mostra(apagado, t0 + 0.2)
aceso = no_chao(c, "Farol aceso", "farol-listrado-aceso", 1100, 900, 0.6)
acende = [(t0, 0, None)]
for t in (ida1 + 0.8, volta + 1.6):
    acende += [(t, 0, None), (t + 0.25, 100, None), (t + 0.9, 100, None), (t + 1.0, 0, None)]
c.trilha(aceso, "opacity", acende)
for k, t in enumerate((ida1 + 0.8, volta + 1.6)):
    c.mostra(c.caixa(f"Encontro · {k + 1}", f"encontro {k + 1}", AMARELO, TINTA, 1100, 330 + 110 * k, 300, tam=40), t, pop=True)
c.salvar("conceito-1-acendeu-de-novo")

# 2. O apito final.
t0, t1 = voz.trecho("Sabe o apito final", "a partida acabou.", depois=t1)
c = Cena("Conceito · O apito final", t0, t1, BASE, BLOCOS, SAIDA)
t_depois = voz.palavra("Depois dele", t0)
t_porque = voz.palavra("porque a partida acabou", t_depois)
c.ideia("O apito final", t0 + 0.05, t_depois - 0.1, None)
c.ideia("Depois dele, não vale", t_depois - 0.05, t1, None)
campo = c.rect("Campo", 120, 440, 1220, 560, GRAMA, rx=30, op=0)
c.nos.append(campo)
c.mostra(campo, t0 + 0.1)
gol = c.grupo("Gol", 1020, 520, [c.rect("trave de cima", 0, 0, 260, 18, BRANCO, rx=9),
                                 c.rect("trave esquerda", 0, 0, 18, 300, BRANCO, rx=9),
                                 c.rect("trave direita", 242, 0, 18, 300, BRANCO, rx=9)], op=0)
c.nos.append(gol)
c.mostra(gol, t0 + 0.2)
juiz = no_chao(c, "Zappy juiz", "zappy", 420, 860, 0.55)
c.mostra(juiz, t0 + 0.3, pop=True)
silvo = apito(c, "Apito", 560, 520)
c.mostra(silvo, t0 + 0.8, pop=True)
placar = c.caixa("Placar", "1 a 0", BRANCO, TINTA, 680, 330, 240, tam=56)
c.mostra(placar, t0 + 0.5, pop=True)
bola = circulo(c, "Bola", 700, 800, 34, BRANCO, borda=TINTA, sw=6, op=0)
c.nos.append(bola)
c.mostra(bola, t_depois)
# O retângulo da bola já está no lugar: a trilha é o deslocamento até o gol.
c.trilha(bola, "x", [(t_depois + 0.2, 0, None), (t_depois + 1.2, 450, SUAVE)])
c.trilha(bola, "y", [(t_depois + 0.2, 0, None), (t_depois + 1.2, -100, SUAVE)])
risco = c.caixa("Não vale", "não vale", VERMELHO, BRANCO, 1150, 420, 260, tam=44)
c.mostra(risco, t_porque, pop=True)
c.salvar("conceito-2-o-apito-final")

# 3. ganhou é o apito.
t0, t1 = voz.trecho("No seu jogo, o apito final", "responder outra vez.", depois=t1)
c = Cena("Conceito · ganhou é o apito", t0, t1, BASE, BLOCOS, SAIDA)
t_ganhou = voz.palavra("é ganhou ficar verdadeiro", t0)
t_vencida = voz.palavra("Depois disso", t_ganhou)
c.ideia("O apito final do seu jogo", t0 + 0.05, t_vencida - 0.1, None)
c.ideia("O farol não responde outra vez", t_vencida - 0.05, t1, None)
variavel(c, "ganhou", "ganhou", 430, 600, [(t0 + 0.3, "falso", VERMELHO), (t_ganhou + 0.4, "verdadeiro", VERDE)], w=480,
         t0=t0 + 0.2)
silvo = apito(c, "Apito", 430, 820)
c.mostra(silvo, t_ganhou + 0.3, pop=True)
c.mostra(no_chao(c, "Farol aceso", "farol-listrado-aceso", 1050, 920, 0.62), t0 + 0.3, pop=True)
c.mostra(estrela(c, "Estrela · vencida", 1050, 380, 50), t_vencida, pop=True)
c.salvar("conceito-3-ganhou-e-o-apito")

# 4. A pergunta com o não.
t0, t1 = voz.trecho("Por isso, o encontro vai fazer uma pergunta", "virava ao contrário.", depois=t1)
c = Cena("Conceito · A pergunta com o não", t0, t1, BASE, BLOCOS, SAIDA)
t_nao = voz.palavra("a gente usa a palavra não", t0)
t_porta = voz.palavra("Lembra da porta", t_nao)
c.ideia("Uma pergunta antes de tudo", t0 + 0.05, t_porta - 0.1, None)
c.ideia("Com o não, a resposta vira", t_porta - 0.05, t1, None)
pergunta = c.balao("Balão · pergunta", "A partida ainda não foi ganha?", 700, 400, 760, -200)
c.mostra(pergunta, t0 + 0.6, pop=True)
nao = c.caixa("Palavra · não", "não", VERMELHO, BRANCO, 640, 600, 180, tam=56)
c.mostra(nao, t_nao, pop=True)
porta = c.grupo("Porta", 1060, 560, [c.rect("batente", -20, -20, 260, 440, MADEIRA_ESCURA, rx=16),
                                     c.rect("folha", 0, 0, 220, 400, MADEIRA, rx=8),
                                     c.rect("maçaneta", 184, 200, 22, 22, AMARELO, rx=11)], op=0)
c.nos.append(porta)
c.mostra(porta, t_porta, pop=True)
vira = c.caixa("Vira", "o sim vira não", BRANCO, TINTA, 640, 820, 380, tam=44)
c.mostra(vira, t_porta + 1.0, pop=True)
c.salvar("conceito-4-a-pergunta-com-nao")

# 5. Falso responde, verdadeiro para.
t0, t1 = voz.trecho("No seu jogo é igual", "para de responder.", depois=t1)
c = Cena("Conceito · Falso responde, verdadeiro para", t0, t1, BASE, BLOCOS, SAIDA)
t_falso = voz.palavra("Enquanto ganhou é falso", t0)
t_verd = voz.palavra("Quando ganhou vira verdadeiro", t_falso)
c.ideia("No seu jogo é igual", t0 + 0.05, t1, None)
for k, (valor, cor, resposta, t, farol) in enumerate((("falso", VERMELHO, "sim", t_falso, "responde"),
                                                     ("verdadeiro", VERDE, "não", t_verd, "fica quieto"))):
    y = 430 + 260 * k
    c.mostra(c.caixa(f"ganhou · {valor}", f"ganhou {valor}", BRANCO, cor, 330, y, 380, tam=44), t, pop=True)
    c.mostra(c.caixa(f"Resposta · {resposta}", resposta, VERDE if resposta == "sim" else VERMELHO, BRANCO, 700, y, 150, tam=48),
             t + 0.8, pop=True)
    c.mostra(c.caixa(f"Farol · {farol}", f"o farol {farol}", AMARELO, TINTA, 1090, y, 360, tam=40), t + 1.4, pop=True)
c.salvar("conceito-5-falso-responde-verdadeiro-para")

# 6. Uma pergunta dentro da outra.
t0, t1 = voz.trecho("Agora a pergunta da chave vai ficar dentro", "ainda não foi ganha.", depois=t1)
c = Cena("Conceito · Uma pergunta dentro da outra", t0, t1, BASE, BLOCOS, SAIDA)
t_assim = voz.palavra("Assim, o farol só confere", t0)
c.ideia("Uma pergunta dentro da outra", t0 + 0.05, t1, None)
dentro, _ = c.bloco("bloco-se-dentro-do-se", 220, 300, 0.85)
c.mostra(dentro, t0 + 0.2, pop=True)
c.mostra(c.caixa("Primeiro", "primeiro", AMARELO, TINTA, 1330, 420, 240, num=1, tam=40), t_assim, pop=True)
c.mostra(c.caixa("Depois", "depois", AMARELO, TINTA, 1330, 560, 240, num=2, tam=40), t_assim + 0.8, pop=True)
c.salvar("conceito-6-uma-pergunta-dentro-da-outra")
