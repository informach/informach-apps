"""Exemplo: as animações da Ilha do Farol, Aula 3, Parte 1, "O farol precisa conferir a chave" (22/11/2026). Ficam
na tela as ações (rodar, andar, arrastar, abrir as categorias, encaixar, jogar na lixeira, escolher, escrever), o
"Tá vendo?", o "olha só" e o jogo que a fala aponta.

Os tempos saem da voz da parte (tempos_da_voz.Voz), já na linha do tempo da edição: grave antes de gerar.
Cada cena procura a sua frase depois do fim da anterior: "o aviso de que falta a chave" casaria com "o
aviso dizia que falta a chave", lá no começo.
  1. conceito-1-nada-acontece ("Nada acontece" até "chega ao farol"): o personagem encosta no farol e nada
     acontece; o encaixe da reação vazio, com "?".
  2. conceito-2-a-porta-do-2d ("Lembra da porta do jogo 2D?" até "começando pelo aviso"): a pergunta "Está com a
     chave?" e os dois caminhos: sim, o farol acende; não, o aviso "Falta a chave".
  3. conceito-3-um-encontro ("Primeiro, o jogo precisa perceber" até "Quando acontecer"): o olho que percebe o
     personagem chegando ao farol; a área Quando acontecer (recorte).
  4. conceito-4-o-bloco-se ("Para fazer uma pergunta" até "o bloco Se"): o Se (recorte) com um "?" no lugar
     da pergunta.
  5. conceito-5-o-que-temchave-guarda ("A pergunta certa é sobre temChave" até "valor da variável"): a caixa
     temChave com verdadeiro; o bloco valor da variável a lê (recorte do Se com temChave).
  6. conceito-6-cada-resposta-seu-espaco ("Pronto: agora o Se pergunta" até "no espaço do senão"): a Debinha
     fala por cima, à esquerda; o Se completo (recorte do fim da parte): sim no então, não no senão.
  7. conceito-7-abrir-o-senao ("O aviso de que falta a chave" até "abrir esse espaço agora"): o Se sem o senão
     e, depois, com o espaço do senão aberto (recortes da gravação).
Imagens (pasta de blocos): os renders e os recortes bloco-area-quando-acontecer, bloco-se-vazio,
bloco-se-temchave, bloco-se-com-senao e bloco-se-final.
Uso: ilha-a3p1-conceitos.py <base.edisvg> <pasta dos blocos> <pasta de saída (a pasta pecas da parte)>
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from edisvg_cena import AMARELO, BRANCO, NOITE, SUAVE, TINTA, VERDE, Cena  # noqa: E402
from ilha_cena import balao_pensa, chao, estrela, no_chao, olho, variavel  # noqa: E402
from tempos_da_voz import Voz  # noqa: E402

BASE, BLOCOS, SAIDA = sys.argv[1:4]
voz = Voz.da_parte("ilha", 3, 1)
VERMELHO, MADEIRA, MADEIRA_ESCURA, PAREDE = "#E2563B", "#B7793F", "#7A4A22", "#F6E7C8"


def faixa(c, nome, texto, cx, cy, w=680):
    g = c.grupo(nome, cx, cy, [c.rect("faixa", -w / 2, -40, w, 80, NOITE, rx=22),
                               c.texto("texto", texto, 0, 12, 32, BRANCO, familia="Nunito", ancora="middle")], op=0)
    c.nos.append(g)
    return g


def porta(c, nome, x, y):
    partes = [c.rect(f"{nome} · batente", x - 20, y - 20, 260, 440, MADEIRA_ESCURA, rx=16, op=0),
              c.grupo(f"{nome} · folha", x, y, [c.rect("folha", 0, 0, 220, 400, MADEIRA, rx=8),
                                                c.rect("maçaneta", 184, 200, 22, 22, AMARELO, rx=11)], op=0)]
    c.nos += partes
    return partes


# 1. Nada acontece.
t0 = voz.palavra("Nada acontece")
t1 = voz.fim("chega ao farol.", t0)
c = Cena("Conceito · Nada acontece", t0, t1, BASE, BLOCOS, SAIDA)
t_porque = voz.palavra("porque o jogo ainda não sabe", t0)
c.ideia("Nada acontece", t0 + 0.05, t_porque - 0.1, None)
c.ideia("O jogo ainda não sabe", t_porque - 0.05, t1, None)
chao(c, t0 + 0.05)
farol = no_chao(c, "Farol apagado", "farol-listrado", 900, 900, 0.6)
c.mostra(farol, t0 + 0.1, pop=True)
heroi = no_chao(c, "Personagem", "aventureiro-parado", 700, 930, 0.6)
c.mostra(heroi, t0 + 0.2, pop=True)
vazio = c.rect("Encaixe da reação", 330, 420, 300, 90, "none", rx=20, stroke=BRANCO, sw=8, op=0)
c.nos.append(vazio)
c.mostra(vazio, t_porque, pop=True)
c.mostra(balao_pensa(c, "Balão · ?", 480, 360, "?"), t_porque + 0.4, pop=True)
c.salvar("conceito-1-nada-acontece")

# 2. A porta do jogo 2D.
t0, t1 = voz.trecho("Lembra da porta do jogo 2D", "começando pelo aviso", depois=t1)
c = Cena("Conceito · A porta do jogo 2D", t0, t1, BASE, BLOCOS, SAIDA)
t_perg = voz.palavra("o personagem está com a chave", t0)
t_sim = voz.palavra("Com a resposta sim", t_perg)
t_nao = voz.palavra("Com a resposta não", t_sim)
t_ilha = voz.palavra("Agora a gente vai montar", t_nao)
c.ideia("A pergunta da porta", t0 + 0.05, t_ilha - 0.1, None)
c.ideia("Agora no farol da ilha", t_ilha - 0.05, t1, None)
for p in porta(c, "Porta", 180, 430):
    c.mostra(p, t0 + 0.2, t_ilha)
pergunta = c.balao("Balão · com a chave?", "Está com a chave?", 640, 380, 440, -140)
c.mostra(pergunta, t_perg, pop=True)
sim = c.caixa("Resposta · sim", "sim", VERDE, BRANCO, 560, 600, 160, tam=52)
c.mostra(sim, t_sim, pop=True)
aceso = no_chao(c, "Farol aceso", "farol-listrado-aceso", 900, 820, 0.42)
c.mostra(aceso, t_sim + 0.4, pop=True)
nao = c.caixa("Resposta · não", "não", VERMELHO, BRANCO, 560, 800, 160, tam=52)
c.mostra(nao, t_nao, pop=True)
c.mostra(faixa(c, "Aviso · falta a chave", "Falta a chave.", 1080, 920, w=420), t_nao + 0.5, pop=True)
c.salvar("conceito-2-a-porta-do-2d")

# 3. Um encontro.
t0, t1 = voz.trecho("Primeiro, o jogo precisa perceber", "Quando acontecer.", depois=t1)
c = Cena("Conceito · Um encontro", t0, t1, BASE, BLOCOS, SAIDA)
t_enc = voz.palavra("Chegar ao farol é um encontro", t0)
t_area = voz.palavra("e os encontros ficam", t_enc)
c.ideia("O jogo precisa perceber", t0 + 0.05, t_enc - 0.1, None)
c.ideia("Um encontro", t_enc - 0.05, t_area - 0.1, None)
c.ideia("Na área Quando acontecer", t_area - 0.05, t1, None)
farol = no_chao(c, "Farol", "farol-listrado", 520, 880, 0.48)
c.mostra(farol, t0 + 0.1, t_area, pop=True)
heroi = no_chao(c, "Personagem", "aventureiro-parado", 330, 900, 0.48)
c.mostra(heroi, t0 + 0.2, t_area, pop=True)
o = olho(c, "Olho do jogo", 430, 420)
c.mostra(o, t0 + 0.4, t_area, pop=True)
c.mostra(estrela(c, "Estrela · encontro", 430, 720, 50), t_enc + 0.3, t_area, pop=True)
area, _ = c.bloco("bloco-area-quando-acontecer", 760, 300, 1.0)
c.mostra(area, t_area, pop=True)
c.salvar("conceito-3-um-encontro")

# 4. O bloco Se.
t0, t1 = voz.trecho("Para fazer uma pergunta", "o bloco Se.", depois=t1)
c = Cena("Conceito · O bloco Se", t0, t1, BASE, BLOCOS, SAIDA)
c.ideia("Para perguntar: o Se", t0 + 0.05, t1, None)
se, _ = c.bloco("bloco-se-vazio", 360, 380, 1.6)
c.mostra(se, t0 + 0.2, pop=True)
duvida = balao_pensa(c, "Balão · ?", 1100, 380, "?")
c.mostra(duvida, t0 + 0.6, pop=True)
c.salvar("conceito-4-o-bloco-se")

# 5. O que temChave guarda.
t0, t1 = voz.trecho("A pergunta certa é sobre temChave", "valor da variável.", depois=t1)
c = Cena("Conceito · O que temChave guarda", t0, t1, BASE, BLOCOS, SAIDA)
t_valor = voz.palavra("O bloco que traz", t0)
c.ideia("A pergunta é sobre temChave", t0 + 0.05, t_valor - 0.1, None)
c.ideia("O valor da variável", t_valor - 0.05, t1, None)
variavel(c, "temChave", "temChave", 440, 560, [(t0 + 0.3, "verdadeiro", VERDE)], w=480, t0=t0 + 0.2)
leitura, _ = c.bloco("bloco-se-temchave", 760, 420, 0.95)
c.mostra(leitura, t_valor, pop=True)
seta = c.poly("Seta · lê", [(700, 540), (750, 570), (700, 600)], AMARELO)
seta["transform"]["opacity"] = 0
c.nos.append(seta)
c.mostra(seta, t_valor + 0.4)
c.salvar("conceito-5-o-que-temchave-guarda")

# 6. Cada resposta no seu espaço (a Debinha à esquerda).
t0 = voz.palavra("Pronto: agora o Se pergunta", t1)
t1 = voz.fim("no espaço do senão.", t0)
c = Cena("Conceito · Cada resposta no seu espaço", t0, t1, BASE, BLOCOS, SAIDA)
t_deb = voz.palavra("E onde eu escrevo", t0)
t_espaco = voz.palavra("No bloco Se, cada resposta", t_deb)
t_entao = voz.palavra("A resposta do sim", t_espaco)
t_senao = voz.palavra("A resposta do não", t_entao)
c.ideia("Pegou a chave?", t0 + 0.05, t_espaco - 0.1, None)
c.ideia("Cada resposta tem o seu espaço", t_espaco - 0.05, t1, None)
final, _ = c.bloco("bloco-se-final", 700, 380, 0.75)
c.mostra(final, t0 + 0.2, pop=True)
c.mostra(c.caixa("Resposta · sim", "sim", VERDE, BRANCO, 560, 470, 150, tam=48), t_entao, pop=True)
c.mostra(no_chao(c, "Farol aceso", "farol-listrado-aceso", 560, 760, 0.3), t_entao + 0.3, pop=True)
c.mostra(c.caixa("Resposta · não", "não", VERMELHO, BRANCO, 560, 860, 150, tam=48), t_senao, pop=True)
c.salvar("conceito-6-cada-resposta-seu-espaco")

# 7. Abrir o senão.
t0, t1 = voz.trecho("O aviso de que falta a chave", "esse espaço agora.", depois=t1)
c = Cena("Conceito · Abrir o senão", t0, t1, BASE, BLOCOS, SAIDA)
t_sem = voz.palavra("Só que o Se chega sem", t0)
t_abrir = voz.palavra("e você vai abrir", t_sem)
c.ideia("O aviso é a resposta do não", t0 + 0.05, t_sem - 0.1, None)
c.ideia("Falta o espaço do senão", t_sem - 0.05, t_abrir - 0.1, None)
c.ideia("Você vai abrir", t_abrir - 0.05, t1, None)
c.mostra(faixa(c, "Aviso · falta a chave", "Falta a chave. Procure na ilha antes de voltar.", 640, 330, w=820), t0 + 0.2, pop=True)
sem, _ = c.bloco("bloco-se-temchave", 300, 470, 1.15)
c.mostra(sem, t_sem, t_abrir + 0.6, pop=True)
com, _ = c.bloco("bloco-se-com-senao", 300, 470, 1.15)
c.mostra(com, t_abrir + 0.4)
c.salvar("conceito-7-abrir-o-senao")
