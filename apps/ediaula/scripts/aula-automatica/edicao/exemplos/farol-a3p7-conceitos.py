"""Exemplo: as três animações de conceito da Farol Aula 3 Parte 7, "Escolha onde fica a chave" (0:03, 0:40 e 1:40).

Os quadros saem das gravações de 17/11/2026 (recortar.sh, segundos da voz):
  recortar.sh <gravação P7> 2.6  1245 332 1902 824 blocos/jogo-inicio.png      (a chave no lugar de sempre)
  recortar.sh <gravação P7> 38.8 230 390 1230 470  blocos/criar-chave.png      (Criar sprite chave, x e y)
  recortar.sh <gravação P6> 47   40 160 960 840    blocos/experiencia.png      (a experiência ampliada da Parte 6)
Na Parte 7 a voz relembra para que lado cada número cresce: aqui o quadro da experiência pode aparecer (na
Parte 6, não). A caixa "Três lugares para experimentar" repete a do Passo a passo do projeto
(docs/aulas-interativas-tecnico/recursos/desafio-farol/caderno-conteudo.json, no Sistema Zero).
Uso: farol-a3p7-conceitos.py <base.edisvg> <pasta dos blocos> <pasta de saída (a pasta pecas da parte)>
"""

import copy
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from edisvg_cena import AMARELO, BRANCO, NOITE, TINTA, VERDE, Cena, nid, tf  # noqa: E402

PASTAS = sys.argv[1:4]
ESCALA_JOGO = 657 / 480  # o recorte do jogo (657 x 492) em pixels do jogo (480 x 360)
LUGARES = [("Perto da trilha", 211, 53), ("Na parte de baixo", 160, 250), ("Perto da ponte", 280, 160)]
EXPERIENCIA = "#E6F4EA"  # o tom "experiência" das caixas do Passo a passo


def quadro(c, arq, x, y, s, t0, t1=None, pop=False):
    g, dest = c.bloco(arq, x, y, s, fundo=BRANCO, pad=10)
    c.trilha(g, "opacity", [(t0, 0, None), (t0 + 0.3, 100, None)] + ([(t1 - 0.25, 100, None), (t1, 0, None)] if t1 else []))
    if pop:
        c.mostra(g, t0, t1, pop=True)
    return g, dest


def no_jogo(x, y, s, gx, gy):
    """Um ponto do jogo (pixels do jogo) no quadro, com o recorte do jogo posto em (x, y) com escala s."""
    return x + gx * ESCALA_JOGO * s, y + gy * ESCALA_JOGO * s


def marca(c, nome, n, cx, cy, t0, t1=None, cor=AMARELO):
    """Círculo numerado sobre um lugar do jogo."""
    filhos = [c.rect("anel", -30, -30, 60, 60, cor, rx=30, stroke=NOITE, sw=4),
              c.texto("número", str(n), 0, 13, 36, NOITE, ancora="middle")]
    g = c.grupo(nome, cx, cy, filhos)
    c.nos.append(g)
    c.mostra(g, t0, t1, pop=True)
    return g


def chave(c, x, y, tam, t0, t1):
    no = copy.deepcopy(c.arte["chave · chave-de-estrela"])
    no["id"] = nid()
    no["transform"] = tf(x, y, 0)
    no["instance"]["width"] = no["instance"]["height"] = tam
    c.nos.append(no)
    c.mostra(no, t0, t1, pop=True)
    return no


# 1. O lugar da chave e o que a experiência mostrou (0:03,1 a 0:28,2).
c = Cena("Conceito · Para que lado cada número leva", 3.1, 28.2, *PASTAS)
c.ideia("O lugar da chave", 3.1, 11.0, "Toda partida começa com a chave no mesmo lugar.", t1_sub=6.6, ts=3.2)
c.ideia(None, 6.65, None, "O jogo usa sempre o mesmo x e o mesmo y.", t1_sub=11.0)
c.ideia("Lembra da experiência?", 11.05, None, "Um x maior levava a chave para a direita.", t1_sub=16.05, ts=13.2)
c.ideia(None, 16.1, None, "Um y maior levava a chave para baixo.", t1_sub=19.0)
c.ideia(None, 19.05, None, "O y começa em zero lá no alto e cresce para baixo.", t1_sub=24.85)
c.ideia(None, 24.9, None, "Agora você escolhe onde fica a chave do seu jogo.")
JX, JY, JS = 150, 310, 1.42
quadro(c, "jogo-inicio", JX, JY, JS, 3.2, 11.0)
xy = c.caixa("Caixa · x 211, y 53", "x 211 · y 53", BRANCO, TINTA, *no_jogo(JX, JY, JS, 227, 115), 300)
c.mostra(xy, 7.2, 11.0, pop=True)
EX, EY, ES = 120, 300, 1.05
exp, dest = quadro(c, "experiencia", EX, EY, ES, 11.1)
c.pisca(dest("Destaque · x cresce", 778, 52, 892, 82), 13.5, 16.0, vezes=2)
c.pisca(dest("Destaque · y cresce", 88, 628, 192, 660), 16.5, 19.0, vezes=2)
c.pisca(dest("Destaque · zero no alto", 20, 8, 82, 46), 20.4, 24.8, vezes=3)
c.pisca(dest("Destaque · régua do y", 18, 160, 84, 655), 22.6, 24.8, vezes=2)
c.salvar("conceito-1-para-que-lado-cada-numero-leva")

# 2. Os campos x e y e os três lugares do Passo a passo (0:40,3 a 1:06,4).
c = Cena("Conceito · Três lugares para a chave", 40.3, 66.4, *PASTAS)
c.ideia("Os campos x e y", 40.3, 48.25, "Esse bloco tem os campos x e y.", t1_sub=44.1, ts=40.4)
c.ideia(None, 44.15, 48.25, "Eles escolhem onde a chave aparece no começo.")
c.ideia("Três lugares para experimentar", 48.3, None, "No seu Passo a passo do projeto.")
bloco, dest_b = c.bloco("criar-chave", 100, 420, 1.15)
c.trilha(bloco, "opacity", [(40.5, 0, None), (40.8, 100, None), (48.0, 100, None), (48.25, 0, None)])
c.pisca(dest_b("Destaque · x", 284, 22, 352, 68), 42.6, 48.0, vezes=2)
c.pisca(dest_b("Destaque · y", 366, 22, 434, 68), 43.4, 48.0, vezes=2)
MX, MY, MS = 100, 300, 1.0
quadro(c, "jogo-inicio", MX, MY, MS, 48.4)
caixa = c.rect("Passo a passo · caixa", 800, 300, 500, 492, EXPERIENCIA, rx=28, op=0)
c.nos.append(caixa)
c.mostra(caixa, 48.6)
titulo = c.texto("Passo a passo · título", "Três lugares", 830, 365, 46, VERDE)
c.nos.append(titulo)
c.mostra(titulo, 48.6)
for k, ((nome, gx, gy), t0) in enumerate(zip(LUGARES, (52.4, 56.8, 61.7))):
    marca(c, f"Marca · {nome}", k + 1, *no_jogo(MX, MY, MS, gx + 16, gy + 16), t0)
    linha = [c.rect("número fundo", 0, -34, 48, 48, NOITE, rx=24),
             c.texto("número", str(k + 1), 24, 0, 32, BRANCO, ancora="middle"),
             c.texto("lugar", nome, 64, -2, 34, TINTA),
             c.texto("números", f"x {gx} e y {gy}", 64, 40, 32, TINTA, familia="Nunito", peso=700)]
    g = c.grupo(f"Passo a passo · {nome}", 830, 455 + k * 105, linha)
    c.nos.append(g)
    c.mostra(g, t0, sobe=10)
c.salvar("conceito-2-tres-lugares-para-a-chave")

# 3. A chave tem que aparecer inteira (1:40,7 a 1:57,1).
c = Cena("Conceito · Repare na chave", 100.7, 117.1, *PASTAS)
c.ideia("Repare na chave", 100.7, None, "A chave tem que aparecer inteira.", t1_sub=103.2, ts=100.8)
c.ideia(None, 103.25, None, "Atrás do farol ou da faixa do aviso, ninguém acha.", t1_sub=108.5)
c.ideia(None, 108.55, None, "Em cima do personagem, ele já começa com a chave.", t1_sub=112.4)
c.ideia(None, 112.45, None, "Nesses casos, use um dos três lugares.")
RX, RY, RS = 120, 310, 1.18  # o jogo menor: as caixas ficam ao lado, sem cobrir o farol
quadro(c, "jogo-inicio", RX, RY, RS, 100.9)
tam = 32 * ESCALA_JOGO * RS
ruins = [("Atrás do farol", 380, 120, 104.0), ("Atrás do aviso", 150, 12, 105.4), ("Em cima do personagem", 37, 157, 109.0)]
for k, (nome, gx, gy, t0) in enumerate(ruins):
    x, y = no_jogo(RX, RY, RS, gx, gy)
    chave(c, x, y, tam, t0, 112.4)
    r = c.rect(f"Destaque · {nome}", x - 10, y - 10, tam + 20, tam + 20, "none", rx=16, stroke=AMARELO, sw=6, op=0)
    c.nos.append(r)
    c.pisca(r, t0 + 0.2, 112.4, vezes=2)
    aviso = c.caixa(f"Caixa · {nome}", nome, BRANCO, TINTA, 1120, 470 + k * 120, 380, num=k + 1, tam=30)
    c.mostra(aviso, t0 + 0.3, 112.4, pop=True)
for k, (nome, gx, gy) in enumerate(LUGARES):
    marca(c, f"Marca · {nome}", k + 1, *no_jogo(RX, RY, RS, gx + 16, gy + 16), 113.4 + k * 0.5, cor=VERDE)
c.salvar("conceito-3-repare-na-chave")
