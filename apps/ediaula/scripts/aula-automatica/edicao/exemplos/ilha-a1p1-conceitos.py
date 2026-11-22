"""Exemplo: as duas animações de conceito da Ilha do Farol, Aula 1, Parte 1, "Jogue na ilha" (22/11/2026).

1. conceito-1-a-ilha-em-tres-dimensoes (0:00,2 a 0:13,8): o roteiro pede o título A Ilha do Farol sobre a
   cena inicial do jogo pronto, do "Oi" até o "para o barco chegar". A cena é o jogo 3D ampliado, recortado
   da gravação (jogo-ilha.png), com o título, "Agora em três dimensões", a caixa 3D e os destaques no aviso
   do jogo ("O desafio continua") e no farol ("acender o farol"). A chave não é apontada: achar a chave é
   da criança.
2. conceito-2-a-profundidade (0:35,8 a 0:46,4): "a profundidade. Um objeto pode ficar mais perto ou mais
   longe, e o da frente pode esconder o que está atrás dele." Com os modelos 3D do curso renderizados com
   fundo transparente: o aventureiro anda do fundo para a frente do chão em perspectiva ("mais perto") e o
   lugar de onde ele saiu fica marcado ("mais longe"); depois o farol fica na frente e o aventureiro passa
   atrás dele e some. A pedra não aparece: o que ela esconde é a pergunta da Debinha logo em seguida.

Os PNG da pasta de blocos:
  jogo-ilha.png: quadro da gravação de 22/11/2026 em 21,5 s da voz (vídeo 20,17 s), recorte 244,112 a 1676,1004
  aventureiro-parado.png, aventureiro-andando-1..4.png e farol-listrado.png: render_modelos.py (Blender 5.2.3,
  os GLB da biblioteca de modelos dos cursos), 600 x 800 e 520 x 1000, fundo transparente.
Uso: ilha-a1p1-conceitos.py <base.edisvg> <pasta dos blocos> <pasta de saída (a pasta pecas da parte)>
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from edisvg_cena import BRANCO, SUAVE, TINTA, VAIVEM, Cena, nid, tf  # noqa: E402

BASE, BLOCOS, SAIDA = sys.argv[1:4]
AREIA, AREIA_BORDA = "#F3D9A0", "#E2BF7A"
# O pé do aventureiro nos renders (alfa > 128): x 168 a 430, pés em y 645; o farol: x 137 a 383, base em 887.
PE_X, PE_Y = 299, 645
FAROL_X, FAROL_Y = 260, 887


def figura(c, arq, op=100):
    """Imagem transparente no tamanho do PNG (sem cartão), para ir dentro de um grupo escalado."""
    aid, w, h = c.imagem(arq)
    return {"id": nid(), "name": arq, "tag": "image", "assetId": aid,
            "attrs": {"x": "0", "y": "0", "width": str(w), "height": str(h)},
            "text": "", "children": [], "transform": tf(op=op), "visible": True, "locked": False}


class Personagem:
    """O aventureiro: um grupo com o parado e os quatro quadros do passo. A posição é a dos pés."""

    def __init__(self, c, nome):
        self.c = c
        self.parado = figura(c, "aventureiro-parado")
        self.passo = [figura(c, f"aventureiro-andando-{k}", op=0) for k in range(1, 5)]
        self.g = c.grupo(nome, 0, 0, [self.parado, *self.passo])
        self.chaves = {"x": [], "y": [], "sx": [], "sy": []}
        self.vis = {n["id"]: [] for n in [self.parado, *self.passo]}
        c.nos.append(self.g)

    def em(self, t, px, py, s, easing=None):
        """Pés em (px, py) com escala s no instante t."""
        for prop, v in (("x", px - PE_X * s), ("y", py - PE_Y * s), ("sx", s), ("sy", s)):
            self.chaves[prop].append((t, v, easing))

    def anda(self, t0, t1, de, para, passo=0.11):
        """Anda de (px, py, s) em t0 até (px, py, s) em t1, trocando os quadros do passo."""
        self.em(t0, *de, None)
        self.em(t1, *para, None)
        ids = [self.parado["id"]] + [p["id"] for p in self.passo]
        self.vis[ids[0]] += [(t0 - 0.034, 100), (t0, 0), (t1, 0), (t1 + 0.034, 100)]
        k, t = 0, t0
        while t < t1:
            atual = ids[1 + k % 4]
            fim = min(t + passo, t1)
            self.vis[atual] += [(t - 0.001 if t > t0 else t, 0), (t + 0.001, 100), (fim - 0.001, 100), (fim, 0)]
            k, t = k + 1, fim

    def fechar(self):
        for prop, ch in self.chaves.items():
            if ch:
                self.c.trilha(self.g, prop, ch)
        for no in [self.parado, *self.passo]:
            ch = self.vis[no["id"]]
            if ch:
                self.c.trilha(no, "opacity", [(t, v, None) for t, v in ch])


# 1. A ilha em três dimensões (0,2 a 13,8).
c = Cena("Conceito · A ilha em três dimensões", 0.2, 13.8, BASE, BLOCOS, SAIDA)
c.ideia("A Ilha do Farol", 0.25, 13.8, None)
c.ideia(None, 3.16, 8.6, "Agora em três dimensões")
c.ideia(None, 8.69, 13.8, "Encontre a chave e acenda o farol")
S = 0.8
jogo, destaque = c.bloco("jogo-ilha", 106, 310, S, fundo=BRANCO, pad=10)
c.mostra(jogo, 0.3)
for p in ("sx", "sy"):  # um respiro lento na ilha, sem tirar nada do quadro
    c.trilha(jogo, p, [(3.0, 1, None), (13.8, 1.02, VAIVEM)])
tres = c.caixa("Caixa · 3D", "3D", BRANCO, TINTA, 1170, 372, 170, tam=56)
c.mostra(tres, 5.84, 8.6, pop=True)
aviso = destaque("Destaque · o aviso do jogo", 460, 8, 972, 50)
c.pisca(aviso, 9.0, 11.6)
farol = destaque("Destaque · o farol", 978, 276, 1114, 540)
c.pisca(farol, 11.87, 13.7)
c.salvar("conceito-1-a-ilha-em-tres-dimensoes")

# 2. A profundidade (35,8 a 46,4).
c = Cena("Conceito · A profundidade", 35.8, 46.4, BASE, BLOCOS, SAIDA)
c.ideia("A novidade do 3D", 35.85, 39.25, None)
c.ideia("A profundidade", 39.3, 46.4, None)
c.ideia(None, 40.55, 43.85, "Mais perto ou mais longe")
c.ideia(None, 43.9, 46.4, "O da frente esconde o de trás")
chao = c.poly("Chão em perspectiva", [(380, 430), (950, 430), (1250, 1040), (80, 1040)], AREIA)
chao["attrs"].update({"stroke": AREIA_BORDA, "stroke-width": "6", "stroke-linejoin": "round"})
chao["transform"] = tf(op=0)
c.nos.append(chao)
# O chão e o aventureiro já entram na "novidade do 3D": a cena não fica só com o título.
c.mostra(chao, 36.0)

# Na diagonal, do fundo à esquerda para a frente à direita: o lugar de onde ele saiu fica à vista.
LONGE, PERTO = (520, 560, 0.38), (760, 990, 1.0)
# O lugar de onde ele saiu, marcado quando a fala chega ao "longe".
fantasma = c.grupo("Aventureiro · lá no fundo", LONGE[0] - PE_X * LONGE[2], LONGE[1] - PE_Y * LONGE[2],
                   [figura(c, "aventureiro-parado")], op=0, s=LONGE[2])
c.nos.append(fantasma)
c.trilha(fantasma, "opacity", [(43.25, 0, None), (43.5, 45, None), (43.65, 45, None), (43.85, 0, None)])
perto = Personagem(c, "Aventureiro · do fundo para a frente")
perto.em(35.8, *LONGE)
perto.anda(41.27, 42.37, LONGE, PERTO)
c.trilha(perto.g, "opacity", [(36.4, 0, None), (36.7, 100, None), (43.65, 100, None), (43.85, 0, None)])
perto.fechar()
c.mostra(c.caixa("Caixa · mais perto", "mais perto", BRANCO, TINTA, 1080, 760, 300), 42.37, 43.85, pop=True)
c.mostra(c.caixa("Caixa · mais longe", "mais longe", BRANCO, TINTA, 290, 440, 300), 43.25, 43.85, pop=True)

# O da frente esconde o de trás: o aventureiro passa atrás do farol (o farol vem depois na lista: fica na frente).
atras = Personagem(c, "Aventureiro · atrás do farol")
ESQ, DIR = (330, 640, 0.3), (980, 640, 0.3)
atras.em(35.8, *ESQ)
atras.anda(44.53, 46.3, ESQ, DIR)
c.trilha(atras.g, "opacity", [(44.0, 0, None), (44.3, 100, None)])
atras.fechar()
SF = 0.8
torre = c.grupo("Farol · na frente", 640 - FAROL_X * SF, 1000 - FAROL_Y * SF, [figura(c, "farol-listrado")],
                op=0, s=SF)
c.nos.append(torre)
c.trilha(torre, "opacity", [(43.9, 0, None), (44.15, 100, None)])
for p, base in (("y", 1000 - FAROL_Y * SF),):
    c.trilha(torre, p, [(43.9, base + 30, SUAVE), (44.2, base, None)])
c.mostra(c.caixa("Caixa · na frente", "na frente", BRANCO, TINTA, 965, 900, 280), 44.19, pop=True)
c.salvar("conceito-2-a-profundidade")
