"""Exemplo: as animações da Ilha do Farol, Aula 2, Parte 6, "Conte que a chave foi recolhida" (22/11/2026). As
peças são numeradas na ordem da aula. Ficam na tela as ações (Rodar de novo, as setas, arrastar, abrir as
categorias, encaixar, escolher, escrever a mensagem, a tecla R, verificar, enviar), o aviso que a fala aponta e o
conferir.
  1. conceito-1-o-aviso-e-uma-variavel (0:11,6 a 0:20,1): o aviso no alto do jogo mostra o texto da variável
     aviso; para mudar o aviso, muda-se o texto no encontro com a chave (recorte do encontro da Parte 5).
  2. conceito-2-uma-mensagem (0:41,5 a 0:47,5): o valor chega com um número, mas o aviso é uma mensagem: o
     número vira um texto.
  3. conceito-3-voce-programou (1:47,8 a 1:54,0): a chave num lugar em três dimensões (x, y e z); o personagem
     pega a chave; o aviso novo; estrelas.
  4. conceito-4-na-proxima-aula (1:54,2 a 1:58,7): o personagem leva a chave até o farol, que confere.
Imagens (pasta de blocos): os renders de ilha-render-modelos.py, jogo-ilha.png e um recorte da gravação:
bloco-encontro-temchave.png (o encontro com Esconder o objeto chave e Alterar variável temChave, antes do aviso).
Uso: ilha-a2p6-conceitos.py <base.edisvg> <pasta dos blocos> <pasta de saída (a pasta pecas da parte)>
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from edisvg_cena import AMARELO, BRANCO, NOITE, SUAVE, TINTA, VERDE, Cena, tf  # noqa: E402
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
AVISO_INICIO = "Encontre a chave e leve o personagem até o farol."
AVISO_NOVO = "Você pegou a chave! Agora vá ao farol."


def faixa_aviso(c, nome, texto, t0, t1=None, y=300):
    """O aviso do jogo: uma faixa escura com o texto, como no alto da ilha."""
    g = c.grupo(nome, 640, y, [c.rect("faixa", -560, -46, 1120, 92, NOITE, rx=26),
                               c.texto("texto", texto, 0, 14, 40, BRANCO, familia="Nunito", ancora="middle")])
    c.nos.append(g)
    c.mostra(g, t0, t1, pop=True)
    return g


# 1. O aviso é uma variável (11,6 a 20,1).
c = Cena("Conceito · O aviso é uma variável", 11.6, 20.1, BASE, BLOCOS, SAIDA)
c.ideia("O aviso mostra um texto", 11.65, 15.5, None)
c.ideia(None, 13.6, 15.5, "O texto da variável aviso")
c.ideia("Para mudar o aviso", 15.55, 20.1, None)
c.ideia(None, 17.6, 20.1, "Mude o texto no encontro com a chave")
faixa_aviso(c, "Aviso do jogo", AVISO_INICIO, 11.75, 15.5)
variavel(c, "aviso", "aviso", 640, 640, [(13.7, "Encontre a chave…", TINTA)], w=640, t0=13.65, t1=15.5)
seta = c.poly("Seta · para o aviso", [(600, 470), (640, 400), (680, 470)], AMARELO)
seta["transform"] = tf(op=0)
c.nos.append(seta)
c.mostra(seta, 14.3, 15.5)
encontro, _ = c.bloco("bloco-encontro-temchave", 110, 380, 1.1)
c.mostra(encontro, 15.7, pop=True)
c.mostra(c.caixa("Caixa · texto novo", "+ o aviso novo", VERDE, AMARELO, 640, 900, 420), 17.6, pop=True)
c.salvar("conceito-1-o-aviso-e-uma-variavel")

# 2. Uma mensagem (41,5 a 47,5).
c = Cena("Conceito · Uma mensagem", 41.5, 47.5, BASE, BLOCOS, SAIDA)
c.ideia("O valor vem com um número", 41.55, 43.6, None)
c.ideia("O aviso é uma mensagem", 43.65, 45.2, None)
c.ideia("Troque o número por um texto", 45.25, 47.5, None)
variavel(c, "aviso", "aviso", 640, 560, [(42.2, "1", TINTA), (46.85, "“Olá”", VERDE)], w=520, t0=41.6)
balao = c.balao("Balão · mensagem", "uma mensagem", 640, 820, 420, 0)
c.mostra(balao, 43.75, pop=True)
c.salvar("conceito-2-uma-mensagem")

# 3. Você programou (107,8 a 114,0).
c = Cena("Conceito · Você programou", 107.8, 114.0, BASE, BLOCOS, SAIDA)
c.ideia("Pronto!", 107.85, 108.55, None)
c.ideia("Um lugar em três dimensões", 108.6, 111.5, None)
c.ideia("O personagem pega a chave", 111.55, 114.0, None)
chao(c, 107.9)
chave = no_chao(c, "Chave", "chave", 820, 860, 0.42)
c.mostra(chave, 108.6, 112.9)
percurso(c, chave, "chave", pop(108.6, 820, 860, 0.42))
for k, (letra, t0) in enumerate((("x", 109.6), ("y", 109.9), ("z", 110.1))):
    n = c.caixa(f"Número · {letra}", letra, BRANCO, TINTA, 1120, 420 + 150 * k, 130, tam=64)
    c.mostra(n, t0, 111.5, pop=True)
heroi = Personagem(c, "Aventureiro")
heroi.em(107.8, 320, 960, 0.6)
heroi.anda(111.6, 112.8, (320, 960, 0.6), (680, 900, 0.6))
c.trilha(heroi.g, "opacity", [(107.9, 0, None), (108.2, 100, None)])
heroi.fechar()
pegou = estrela(c, "Estrela · pegou", 820, 780, 60)
c.mostra(pegou, 112.9, 113.6, pop=True)
faixa_aviso(c, "Aviso novo", AVISO_NOVO, 113.0, y=320)
for k, (x, y) in enumerate(((240, 420), (1080, 700), (300, 760))):
    brilho = estrela(c, f"Estrela · festa {k + 1}", x, y, 34)
    c.mostra(brilho, 107.9 + 0.12 * k, 108.8, pop=True)
c.salvar("conceito-3-voce-programou")

# 4. Na próxima aula (114,2 a 118,7).
c = Cena("Conceito · Na próxima aula", 114.2, 118.7, BASE, BLOCOS, SAIDA)
c.ideia("Na próxima aula", 114.25, 118.7, None)
c.ideia(None, 115.3, 118.7, "O farol confere se ele tem a chave")
chao(c, 114.25)
farol = no_chao(c, "Farol", "farol-listrado", 980, 900, 0.7)
c.mostra(farol, 114.35, pop=True)
heroi4 = Personagem(c, "Aventureiro")
heroi4.em(114.2, 260, 980, 0.6)
heroi4.anda(114.5, 116.2, (260, 980, 0.6), (640, 940, 0.55))
c.trilha(heroi4.g, "opacity", [(114.25, 0, None), (114.5, 100, None)])
heroi4.fechar()
chave4 = no_chao(c, "Chave · com ele", "chave", 440, 760, 0.22)
c.mostra(chave4, 114.3)
percurso(c, chave4, "chave", [(114.5, (440, 760, 0.22), None), (116.2, (800, 720, 0.22), None)])
confere = balao_pensa(c, "Balão · tem a chave?", 1010, 300, "?")
c.mostra(confere, 116.4, pop=True)
c.salvar("conceito-4-na-proxima-aula")
