"""Exemplo: as animações da Ilha do Farol, Aula 3, Parte 6, "Escolha seu esconderijo e teste de verdade"
(22/11/2026). Ficam na tela as ações (arrastar, trocar os números, rodar, jogar, verificar, enviar), os "olha só" e
o jogo que a fala aponta.

Os tempos saem da voz da parte (tempos_da_voz.Voz), já na linha do tempo da edição: grave antes de gerar.
  1. conceito-1-x-y-z ("Lembra do x, do y e do z?" até "o y muda a altura"): o chão da ilha com a chave e as
     setas do x (vermelha, para os lados), do z (azul, para perto) e do y (verde, para cima), as cores do
     Passo a passo.
  2. conceito-2-ver-nao-basta ("Ver a chave não basta" até "não alcança"): a chave alta demais, acima do
     personagem, e a chave do outro lado da água; nas duas, o personagem não alcança.
  3. conceito-3-um-numero-de-cada-vez ("Se não conseguir pegar" até "teste novamente"): os três números do
     bloco; um muda, o jogo roda, e só então o próximo.
  4. conceito-4-o-papel-de-cada-aviso ("Se quiser, escreva também" até "Vitória"): as quatro faixas de aviso,
     cada uma com o seu papel: começo, chave pega, falta a chave e vitória.
  5. conceito-5-jogo-completo ("Pronto, o seu jogo em três dimensões está completo!"): o farol aceso, o barco
     chegando e estrelas.
Imagens (pasta de blocos): os renders (chave, aventureiro-parado, farol-listrado-aceso, barco-veleiro).
Uso: ilha-a3p6-conceitos.py <base.edisvg> <pasta dos blocos> <pasta de saída (a pasta pecas da parte)>
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from edisvg_cena import AMARELO, BRANCO, NOITE, SUAVE, TINTA, VERDE, Cena  # noqa: E402
from ilha_cena import chao, estrela, mover, no_chao  # noqa: E402
from tempos_da_voz import Voz  # noqa: E402

BASE, BLOCOS, SAIDA = sys.argv[1:4]
voz = Voz.da_parte("ilha", 3, 6)
EIXO = {"x": "#D64545", "y": "#2A9457", "z": "#2F6FDB"}
VERMELHO, AGUA, AREIA, AREIA_BORDA = "#E2563B", "#5B9BE6", "#F3D9A0", "#E2BF7A"


def seta(c, nome, x0, y0, x1, y1, cor, grossura=12):
    """Seta de (x0, y0) a (x1, y1): um grupo girado no ponto de partida."""
    comp = math.hypot(x1 - x0, y1 - y0)
    g = c.grupo(nome, x0, y0, [
        c.rect("haste", 0, -grossura / 2, comp - 34, grossura, cor, rx=grossura / 2),
        c.poly("ponta", [(comp - 40, -24), (comp, 0), (comp - 40, 24)], cor),
    ], op=0)
    g["transform"]["rotation"] = math.degrees(math.atan2(y1 - y0, x1 - x0))
    c.nos.append(g)
    return g


def rotulo(c, nome, texto, x, y, cor, tam=64):
    t = c.texto(nome, texto, x, y, tam, cor, ancora="middle", op=0)
    c.nos.append(t)
    return t


def proibido(c, nome, cx, cy, r=70):
    """Um X vermelho: o personagem não alcança."""
    g = c.grupo(nome, cx, cy, [
        c.rect("traço 1", -r, -10, 2 * r, 20, VERMELHO, rx=10),
        c.rect("traço 2", -10, -r, 20, 2 * r, VERMELHO, rx=10),
    ], op=0)
    g["transform"]["rotation"] = 45
    c.nos.append(g)
    return g


def faixa(c, nome, texto, cx, cy, w=760):
    g = c.grupo(nome, cx, cy, [c.rect("faixa", -w / 2, -40, w, 80, NOITE, rx=22),
                               c.texto("texto", texto, 0, 12, 32, BRANCO, familia="Nunito", ancora="middle")], op=0)
    c.nos.append(g)
    return g


# 1. x, y e z.
t0 = voz.palavra("Lembra do x")
t1 = voz.fim("muda a altura.", t0)
c = Cena("Conceito · x, y e z", t0, t1, BASE, BLOCOS, SAIDA)
t_xz = voz.palavra("O x e o z", t0)
t_y = voz.palavra("e o y muda", t_xz)
c.ideia("x, y e z", t0 + 0.05, t_xz - 0.1, None)
c.ideia("No chão e na altura", t_xz - 0.05, t1, None)
chao(c, t0 + 0.05)
chave = no_chao(c, "Chave", "chave", 640, 760, 0.4)
c.mostra(chave, t0 + 0.3, pop=True)
for nome, (x1, y1), t in (("x", (980, 860), t_xz), ("z", (590, 1010), t_xz + 0.5), ("y", (640, 360), t_y)):
    s = seta(c, f"Seta · {nome}", 640, 860, x1, y1, EIXO[nome])
    c.mostra(s, t, pop=True)
    lx, ly = {"x": (1030, 880), "z": (520, 1010), "y": (700, 390)}[nome]
    c.mostra(rotulo(c, f"Rótulo · {nome}", nome, lx, ly, EIXO[nome]), t + 0.15, pop=True)
c.salvar("conceito-1-x-y-z")

# 2. Ver não basta.
t0, t1 = voz.trecho("Ver a chave não basta", "não alcança.")
c = Cena("Conceito · Ver não basta", t0, t1, BASE, BLOCOS, SAIDA)
t_alta = voz.palavra("alta demais", t0)
t_agua = voz.palavra("do outro lado da água", t_alta)
t_nao = voz.palavra("o personagem não alcança", t_agua)
c.ideia("Ver não basta", t0 + 0.05, t1, None)
# Alta demais: o personagem embaixo, a chave lá em cima.
chao1 = c.rect("Chão · alta", 140, 860, 520, 60, AREIA, rx=20, stroke=AREIA_BORDA, sw=6, op=0)
c.nos.append(chao1)
c.mostra(chao1, t0 + 0.2)
heroi1 = no_chao(c, "Personagem · alta", "aventureiro-parado", 400, 870, 0.42)
c.mostra(heroi1, t0 + 0.3, pop=True)
alta = no_chao(c, "Chave · alta", "chave", 400, 380, 0.3)
c.mostra(alta, t_alta, pop=True)
c.mostra(proibido(c, "Não alcança · alta", 400, 480), t_nao, pop=True)
# Do outro lado da água.
chao2 = c.rect("Chão · deste lado", 780, 860, 260, 60, AREIA, rx=20, stroke=AREIA_BORDA, sw=6, op=0)
agua = c.rect("Água", 1040, 870, 200, 50, AGUA, rx=14, op=0)
chao3 = c.rect("Chão · do outro lado", 1240, 860, 220, 60, AREIA, rx=20, stroke=AREIA_BORDA, sw=6, op=0)
c.nos += [chao2, agua, chao3]
for no in (chao2, agua, chao3):
    c.mostra(no, t_agua - 0.3)
heroi2 = no_chao(c, "Personagem · água", "aventureiro-parado", 900, 870, 0.42)
c.mostra(heroi2, t_agua - 0.2, pop=True)
outro = no_chao(c, "Chave · do outro lado", "chave", 1350, 860, 0.3)
c.mostra(outro, t_agua, pop=True)
c.mostra(proibido(c, "Não alcança · água", 1140, 760), t_nao + 0.2, pop=True)
c.salvar("conceito-2-ver-nao-basta")

# 3. Um número de cada vez.
t0, t1 = voz.trecho("Se não conseguir pegar", "teste novamente.")
c = Cena("Conceito · Um número de cada vez", t0, t1, BASE, BLOCOS, SAIDA)
t_um = voz.palavra("mude um número de cada vez", t0)
t_teste = voz.palavra("e teste novamente", t_um)
c.ideia("Um número de cada vez", t0 + 0.05, t1, None)
caixas = []
for k, (nome, antes, depois) in enumerate((("x", "−8", "−7"), ("y", "1", "1"), ("z", "3", "2"))):
    x = 300 + k * 360
    c.mostra(rotulo(c, f"Nome · {nome}", nome, x, 470, EIXO[nome], tam=72), t0 + 0.2 + 0.15 * k, pop=True)
    a = c.caixa(f"Número · {nome}", antes, BRANCO, TINTA, x, 600, 220, tam=64)
    # O x sai quando muda (o novo entra no lugar); os outros ficam.
    c.mostra(a, t0 + 0.3 + 0.15 * k, t_um + 0.2 if k == 0 else None, pop=True)
    caixas.append((x, a, depois))
# Só o x muda; o jogo roda; o z espera a vez dele.
x0, a0, depois0 = caixas[0]
novo = c.caixa("Número · x novo", depois0, AMARELO, TINTA, x0, 600, 220, tam=64)
c.mostra(novo, t_um + 0.1, pop=True)
roda = c.grupo("Rodar", x0, 800, [c.rect("botão", -110, -50, 220, 100, "#1F6FD1", rx=50),
                                  c.poly("triângulo", [(-24, -26), (30, 0), (-24, 26)], BRANCO)], op=0)
c.nos.append(roda)
c.mostra(roda, t_teste, pop=True)
espera = c.caixa("Depois · z", "depois", BRANCO, TINTA, caixas[2][0], 760, 220, tam=40)
c.mostra(espera, t_teste + 0.3, pop=True)
c.salvar("conceito-3-um-numero-de-cada-vez")

# 4. O papel de cada aviso.
t0 = voz.palavra("Se quiser, escreva também")
t1 = voz.fim("Vitória.", t0)
c = Cena("Conceito · O papel de cada aviso", t0, t1, BASE, BLOCOS, SAIDA)
t_papel = voz.palavra("Só conserve o papel", t0)
c.ideia("Os seus avisos", t0 + 0.05, t_papel - 0.1, None)
c.ideia("Cada um com o seu papel", t_papel - 0.05, t1, None)
avisos = [("Começo", "Começo", "Encontre a chave e leve o personagem até o farol."),
          ("Chave pega", "Chave pega", "Você pegou a chave! Agora vá ao farol."),
          ("Falta chave", "Falta a chave", "Falta a chave. Procure na ilha antes de voltar."),
          ("Vitória", "Vitória", "Você acendeu o farol! O barco pode chegar.")]
depois = t_papel
for k, (fala, papel, texto) in enumerate(avisos):
    y = 330 + k * 170
    t = voz.palavra(fala, depois)
    depois = t
    c.mostra(faixa(c, f"Aviso · {papel}", texto, 900, y), t0 + 0.3 + 0.4 * k, pop=True)
    c.mostra(c.caixa(f"Papel · {papel}", papel, AMARELO, TINTA, 300, y, 300, tam=40), t, pop=True)
c.salvar("conceito-4-o-papel-de-cada-aviso")

# 5. Jogo completo.
t0, t1 = voz.trecho("Pronto, o seu jogo", "está completo!")
c = Cena("Conceito · Jogo completo", t0, t1, BASE, BLOCOS, SAIDA)
c.ideia("Seu jogo está completo!", t0 + 0.05, t1, None)
chao(c, t0 + 0.05)
farol = no_chao(c, "Farol aceso", "farol-listrado-aceso", 900, 900, 0.62)
c.mostra(farol, t0 + 0.1, pop=True)
barco = no_chao(c, "Barco", "barco-veleiro", 220, 880, 0.34)
c.mostra(barco, t0 + 0.2)
mover(c, barco, "barco-veleiro", t0 + 0.2, (180, 880, 0.34), t1, (420, 880, 0.34), SUAVE)
for k, (x, y) in enumerate(((560, 420), (1240, 520), (360, 640), (1180, 860))):
    c.mostra(estrela(c, f"Estrela · {k + 1}", x, y, 40), t0 + 0.3 + 0.15 * k, pop=True)
c.salvar("conceito-5-jogo-completo")
