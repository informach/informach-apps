"""Exemplo: as animações da Ilha do Farol, Aula 2, Parte 4, "Recolha a chave" (22/11/2026). As peças são
numeradas na ordem da aula. Ficam na tela as ações (Rodar de novo, as setas, arrastar, abrir as categorias,
encaixar, escolher, a tecla R), o "Tá vendo?", os apontar e o conferir.
  1. conceito-1-sem-reacao (0:05,5 a 0:10,9): o personagem encosta na chave e nada acontece; o lugar da reação
     está vazio.
  2. conceito-2-o-que-voce-descobriu (0:11,1 a 0:18,6): a experiência do contato, de lado: no chão e na mesma
     altura, encosta; a chave alta não encosta, mesmo parecendo junto de cima.
  3. conceito-3-os-encontros (0:18,8 a 0:25,4): o jogo percebe o encontro (o olho e a estrela); os encontros
     ficam na área Quando acontecer (recorte do topo da área).
  4. conceito-4-o-bloco-que-percebe (0:59,8 a 0:71,7): o bloco do encontro (recorte): confere o chão e a altura;
     os nomes personagem e chave; falta a reação, a chave sumir.
  5. conceito-5-so-nesta-partida (1:46,6 a 1:50,9): a pergunta do Dedé (106,66 a 108,2, à esquerda: o conteúdo
     fica do meio para a direita); a chave sai só desta partida.
  6. conceito-6-outro-caminho (1:52,4 a 1:56,1): a tecla R; a chave volta e dois caminhos levam até ela.
Imagens (pasta de blocos): os renders de ilha-render-modelos.py e dois recortes da gravação: area-quando-acontecer.png
(o topo da área Quando acontecer) e bloco-encontro.png (o bloco Quando personagem encostar em chave, antes da
reação). Os destaques do bloco (personagem, chave, fazer) estão em recortes.json, em pixels do recorte.
Uso: ilha-a2p4-conceitos.py <base.edisvg> <pasta dos blocos> <pasta de saída (a pasta pecas da parte)>
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from edisvg_cena import AMARELO, BRANCO, NOITE, SUAVE, TINTA, VERDE, Cena, tf  # noqa: E402
from ilha_cena import (  # noqa: E402
    Personagem,
    aperta,
    balao_pensa,
    chao,
    estrela,
    no_chao,
    olho,
    percurso,
    pop,
    tecla,
)

BASE, BLOCOS, SAIDA = sys.argv[1:4]
ENCONTRO = json.load(open(os.path.join(BLOCOS, "recortes.json"), encoding="utf8"))["bloco-encontro"]
AREIA, AREIA_BORDA, VERMELHO = "#F3D9A0", "#E2BF7A", "#E8505B"


def faixa_de_chao(c, t0, t1=None, y=860):
    """O chão visto de lado: uma faixa de areia."""
    r = c.rect("Chão de lado", 80, y, 1180, 120, AREIA, rx=24, stroke=AREIA_BORDA, sw=6, op=0)
    c.nos.append(r)
    c.mostra(r, t0, t1)
    return r


def pontinhos(c, nome, pts, t0, passo=0.06):
    """Um caminho tracejado: bolinhas que aparecem uma depois da outra."""
    for k, (x, y) in enumerate(pts):
        b = c.rect(f"{nome} · {k + 1}", x - 9, y - 9, 18, 18, BRANCO, rx=9, op=0)
        c.nos.append(b)
        c.mostra(b, t0 + k * passo)


# 1. Sem reação (5,5 a 10,9).
c = Cena("Conceito · Sem reação", 5.5, 10.9, BASE, BLOCOS, SAIDA)
c.ideia("A chave continua ali", 5.55, 7.3, None)
c.ideia("Ainda não tem reação", 7.35, 10.9, None)
chao(c, 5.55)
chave = no_chao(c, "Chave", "chave", 720, 900, 0.45)
c.mostra(chave, 5.6, pop=True)
heroi = Personagem(c, "Aventureiro")
heroi.em(5.5, 560, 930, 0.6)
c.trilha(heroi.g, "opacity", [(5.55, 0, None), (5.85, 100, None)])
heroi.fechar()
contorno = c.rect("Destaque · a chave", 720 - 110, 900 - 170, 220, 190, "none", rx=30, stroke=AMARELO, sw=8, op=0)
c.nos.append(contorno)
c.pisca(contorno, 6.1, 7.3)
vazio = c.rect("Reação · vazia", 860, 380, 380, 150, "none", rx=30, stroke=BRANCO, sw=8, op=0)
vazio["attrs"]["stroke-dasharray"] = "26 18"
c.nos.append(vazio)
c.mostra(vazio, 9.1, pop=True)
rotulo = c.texto("Reação · rótulo", "reação: ?", 1050, 475, 56, BRANCO, ancora="middle", op=0)
c.nos.append(rotulo)
c.mostra(rotulo, 9.2)
c.salvar("conceito-1-sem-reacao")

# 2. O que você descobriu (11,1 a 18,6): de lado.
c = Cena("Conceito · O que você descobriu", 11.1, 18.6, BASE, BLOCOS, SAIDA)
c.ideia("Lembra da experiência?", 11.15, 13.4, None)
c.ideia("No chão e na mesma altura", 13.45, 18.6, None)
faixa_de_chao(c, 11.2)
heroi2 = Personagem(c, "Aventureiro")
heroi2.em(11.1, 420, 900, 0.75)
c.trilha(heroi2.g, "opacity", [(11.2, 0, None), (11.5, 100, None)])
heroi2.fechar()
chave2 = no_chao(c, "Chave", "chave", 680, 900, 0.5)
c.mostra(chave2, 11.4)
percurso(c, chave2, "chave", pop(11.4, 680, 900, 0.5) + [
    (13.5, (680, 900, 0.5), None), (14.3, (560, 900, 0.5), SUAVE),     # encosta, no chão
    (15.9, (560, 900, 0.5), None), (16.7, (560, 330, 0.5), SUAVE)])    # alta: não encosta
toque = estrela(c, "Estrela · encosta", 500, 760, 55)
c.mostra(toque, 14.3, 15.85, pop=True)
c.mostra(c.caixa("Caixa · encosta", "encosta", VERDE, AMARELO, 1050, 520, 300), 14.4, 15.85, pop=True)
c.mostra(c.caixa("Caixa · não encosta", "não encosta", BRANCO, VERMELHO, 1050, 520, 320), 16.8, pop=True)
c.mostra(c.caixa("Caixa · chão", "no chão", BRANCO, TINTA, 1050, 680, 300, num=1), 16.55, pop=True)
c.mostra(c.caixa("Caixa · altura", "na altura", BRANCO, TINTA, 1050, 820, 300, num=2), 17.5, pop=True)
c.salvar("conceito-2-o-que-voce-descobriu")

# 3. Os encontros (18,8 a 25,4).
c = Cena("Conceito · Os encontros", 18.8, 25.4, BASE, BLOCOS, SAIDA)
c.ideia("O jogo vai perceber", 18.85, 22.25, None)
c.ideia("Os encontros", 22.3, 25.4, None)
c.ideia(None, 23.6, 25.4, "Na área Quando acontecer")
o = olho(c, "Olho do jogo", 640, 420)
c.mostra(o, 19.0, 22.25, pop=True)
chao(c, 18.85, 22.25)
heroi3 = Personagem(c, "Aventureiro")
heroi3.em(18.8, 360, 940, 0.6)
heroi3.anda(19.3, 20.6, (360, 940, 0.6), (600, 930, 0.6))
c.trilha(heroi3.g, "opacity", [(18.85, 0, None), (19.1, 100, None), (22.0, 100, None), (22.25, 0, None)])
heroi3.fechar()
chave3 = no_chao(c, "Chave", "chave", 760, 920, 0.45)
c.mostra(chave3, 18.9, 22.25)
brilho = estrela(c, "Estrela · encontro", 700, 790, 60)
c.mostra(brilho, 20.65, 22.25, pop=True)
area, _ = c.bloco("area-quando-acontecer", 180, 440, 1.25)
c.mostra(area, 23.5, pop=True)
c.salvar("conceito-3-os-encontros")

# 4. O bloco que percebe (59,8 a 71,7).
c = Cena("Conceito · O bloco que percebe", 59.8, 71.7, BASE, BLOCOS, SAIDA)
c.ideia("Ele confere", 59.85, 64.1, None)
c.ideia("Os nomes certos", 64.15, 68.8, None)
c.ideia("Falta a reação", 68.85, 71.7, None)
S4 = ENCONTRO.get("escala", 1.3)
bloco, destaque = c.bloco("bloco-encontro", 110, 320, S4)
c.mostra(bloco, 59.9, pop=True)
c.mostra(c.caixa("Caixa · chão", "no chão", BRANCO, TINTA, 330, 820, 300, num=1), 62.6, 64.1, pop=True)
c.mostra(c.caixa("Caixa · altura", "na altura", BRANCO, TINTA, 700, 820, 300, num=2), 63.05, 64.1, pop=True)
d_pers = destaque("Destaque · personagem", *ENCONTRO["personagem"])
c.pisca(d_pers, 66.8, 68.8)
d_chave = destaque("Destaque · chave", *ENCONTRO["chave"])
c.pisca(d_chave, 67.7, 68.8)
mini_heroi = no_chao(c, "Aventureiro · pequeno", "aventureiro-parado", 420, 960, 0.32,
                     pe=(299, 645))
c.mostra(mini_heroi, 66.85, 68.8, pop=True)
mini_chave = no_chao(c, "Chave · pequena", "chave", 760, 940, 0.3)
c.mostra(mini_chave, 67.75, 70.8, pop=True)
d_fazer = destaque("Destaque · fazer", *ENCONTRO["fazer"])
c.pisca(d_fazer, 69.4, 71.7, vezes=3)
sumiu = estrela(c, "Estrela · some", 760, 880, 60)
c.mostra(sumiu, 70.8, 71.5, pop=True)
c.salvar("conceito-4-o-bloco-que-percebe")

# 5. Só nesta partida (106,6 a 110,9): o Dedé fala de 106,66 a 108,2, à esquerda.
c = Cena("Conceito · Só nesta partida", 106.6, 110.9, BASE, BLOCOS, SAIDA)
c.ideia("Some para sempre?", 106.65, 108.5, None)
c.ideia("Não! Só nesta partida", 108.55, 110.9, None)
for k, (rotulo_p, x, t0, tem) in enumerate((("esta partida", 880, 106.8, False), ("nova partida", 1170, 109.5, True))):
    card = c.rect(f"Partida · {rotulo_p}", x - 140, 420, 280, 420, BRANCO, rx=36, op=0)
    c.nos.append(card)
    c.mostra(card, t0, pop=True)
    nome = c.texto(f"Partida · {rotulo_p} · nome", rotulo_p, x, 500, 40, TINTA, ancora="middle", op=0)
    c.nos.append(nome)
    c.mostra(nome, t0 + 0.1)
    ch = no_chao(c, f"Chave · {rotulo_p}", "chave", x, 760, 0.42)
    if tem:
        c.mostra(ch, t0 + 0.2, pop=True)
    else:
        c.mostra(ch, t0 + 0.1, 107.7)
        poof = estrela(c, "Estrela · some", x, 680, 55)
        c.mostra(poof, 107.6, 108.4, pop=True)
c.salvar("conceito-5-so-nesta-partida")

# 6. Outro caminho (112,4 a 116,1).
c = Cena("Conceito · Outro caminho", 112.4, 116.1, BASE, BLOCOS, SAIDA)
c.ideia("A chave volta", 112.45, 113.6, None)
c.ideia("Pegue por outro caminho", 113.65, 116.1, None)
chao(c, 112.45)
r = tecla(c, "Tecla R", 1120, 420, rotulo="R")
c.mostra(r, 112.45, pop=True)
aperta(c, r, 112.6)
chave6 = no_chao(c, "Chave", "chave", 820, 640, 0.36)
c.mostra(chave6, 112.75)
percurso(c, chave6, "chave", pop(112.75, 820, 640, 0.36))
heroi6 = Personagem(c, "Aventureiro")
heroi6.em(112.4, 320, 960, 0.55)
c.trilha(heroi6.g, "opacity", [(112.45, 0, None), (112.7, 100, None)])
heroi6.fechar()
pontinhos(c, "Caminho 1", [(380 + 32 * k, 880 - 18 * k) for k in range(14)], 113.7)
pontinhos(c, "Caminho 2", [(420 + 24 * k, 960 - 2 * k * k) for k in range(16)], 114.7)
c.salvar("conceito-6-outro-caminho")
