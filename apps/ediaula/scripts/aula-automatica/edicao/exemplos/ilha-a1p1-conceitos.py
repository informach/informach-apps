"""Exemplo: as animações da Ilha do Farol, Aula 1, Parte 1, "Jogue na ilha" (22/11/2026). As peças são
numeradas na ordem da aula (montar.py casa a peça N com o trecho N); 2, 4 e 5 estão no fim do arquivo.

1. conceito-1-a-ilha-em-tres-dimensoes (0:00,2 a 0:13,8): o roteiro pede o título A Ilha do Farol sobre a
   cena inicial do jogo pronto, do "Oi" até o "para o barco chegar". A cena é o jogo 3D ampliado, recortado
   da gravação (jogo-ilha.png), com o título, "Agora em três dimensões", a caixa 3D e os destaques no aviso
   do jogo ("O desafio continua") e no farol ("acender o farol"). A chave não é apontada: achar a chave é
   da criança.
3. conceito-3-a-profundidade (0:35,8 a 0:46,4): "a profundidade. Um objeto pode ficar mais perto ou mais
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

# 3. A profundidade (35,8 a 46,4).
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
c.salvar("conceito-3-a-profundidade")

# Desde 22/11/2026 (pedido dela): bastante animação em cada parte, ilustrando tudo o que puder. As três cenas
# abaixo cobrem o "W, A, S e D", a pergunta da Debinha e a tecla R; ficam na tela só as ações (ampliar,
# clicar no jogo, as setas que o personagem obedece, o aviso do jogo, voltar e Próxima parte).
import ilha_cena as ic  # noqa: E402
from edisvg_cena import AMARELO  # noqa: E402

# 2. Setas ou W, A, S, D (18,95 a 22,85): depois do clique dentro do jogo (18,7). As setas em cruz à esquerda;
# W, A, S e D entram na hora em que cada letra é dita, na mesma cruz, à direita; no "também funcionam" as
# duas cruzes piscam juntas e o aventureiro anda.
c = Cena("Conceito · Setas ou W, A, S, D", 18.95, 22.85, BASE, BLOCOS, SAIDA)
c.ideia("Setas ou W, A, S, D", 19.0, 22.85, None)
S3 = 1.5
for nome, seta, dx, dy in (("cima", "cima", 0, -1), ("esquerda", "esq", -1, 0), ("baixo", "baixo", 0, 0),
                           ("direita", "dir", 1, 0)):
    t = ic.tecla(c, f"Tecla · seta {nome}", 360 + dx * 150, 580 + dy * 140, seta=seta, s=S3)
    c.mostra(t, 19.05)
for letra, t0, dx, dy in (("W", 19.51, 0, -1), ("A", 19.99, -1, 0), ("S", 20.69, 0, 0), ("D", 21.16, 1, 0)):
    t = ic.tecla(c, f"Tecla · {letra}", 960 + dx * 150, 580 + dy * 140, rotulo=letra, s=S3, cor="#3B47C4")
    c.mostra(t, t0)
igual = c.texto("Ou", "ou", 660, 610, 72, BRANCO, ancora="middle", op=0)
c.nos.append(igual)
c.mostra(igual, 19.4)
for nome, x in (("setas", 360), ("letras", 960)):
    r = c.rect(f"Destaque · {nome}", x - 250, 580 - 140 - 90, 500, 320, "none", rx=30, stroke=AMARELO, sw=8, op=0)
    c.nos.append(r)
    c.pisca(r, 21.65, 22.85)
anda3 = ic.Personagem(c, "Aventureiro · anda")
anda3.em(18.95, 260, 1040, 0.4)
anda3.anda(21.7, 22.8, (260, 1040, 0.4), (1000, 1040, 0.4))
c.trilha(anda3.g, "opacity", [(21.4, 0, None), (21.65, 100, None)])
anda3.fechar()
c.salvar("conceito-2-setas-ou-wasd")

# 4. Será que a pedra esconde algo? (46,4 a 51,6): a Debinha fala à esquerda (46,5 a 49,55), por isso a pedra
# fica à direita do meio. Um "?" sai da pedra no "pedra"; no "Isso eu deixo para você descobrir" entra o olho
# (quem descobre é a criança, jogando). A chave nunca aparece.
c = Cena("Conceito · A pedra esconde algo?", 46.4, 51.6, BASE, BLOCOS, SAIDA)
c.ideia("Será que a pedra esconde algo?", 46.45, 49.7, None)
c.ideia("Descubra você!", 49.75, 51.6, None)
ic.chao(c, 46.45)
pedra4 = ic.no_chao(c, "Pedras", "pedras", 930, 880, 0.95)
c.mostra(pedra4, 46.5)
duvida = ic.balao_pensa(c, "Balão · ?", 1060, 360, "?")
c.mostra(duvida, 47.47, pop=True)
olho4 = ic.olho(c, "Olho · você", 470, 560, s=1.1)
c.mostra(olho4, 50.0, pop=True)
c.trilha(olho4, "x", [(50.4, 470, None), (51.2, 600, SUAVE)])
c.mostra(c.caixa("Caixa · jogando", "jogando", BRANCO, TINTA, 470, 720, 260), 50.77, pop=True)
c.salvar("conceito-4-a-pedra-esconde-algo")

# 5. Outra partida (56,6 a 60,45): o aventureiro está lá no fundo da ilha; no "toque na tecla R" a tecla
# entra, afunda no "R" e ele volta para o começo, na frente.
c = Cena("Conceito · Outra partida", 56.6, 60.45, BASE, BLOCOS, SAIDA)
c.ideia("Outra partida", 56.65, 60.45, None)
c.ideia(None, 58.61, 60.45, "Toque na tecla R")
ic.chao(c, 56.7)
inicio = c.rect("Marca · começo", 300, 930, 200, 60, "none", rx=30, stroke=BRANCO, sw=6, op=0)
c.nos.append(inicio)
c.mostra(inicio, 56.8)
longe5 = ic.no_chao(c, "Aventureiro · no fundo", "aventureiro-parado", 820, 560, 0.4, pe=ic.PE["aventureiro"])
c.trilha(longe5, "opacity", [(56.8, 0, None), (57.1, 100, None), (59.75, 100, None), (59.9, 0, None)])
volta5 = ic.no_chao(c, "Aventureiro · no começo", "aventureiro-parado", 400, 965, 0.62, pe=ic.PE["aventureiro"])
c.mostra(volta5, 59.9, pop=True)
r5 = ic.tecla(c, "Tecla · R", 960, 330, rotulo="R", s=1.5)
c.mostra(r5, 58.61)
ic.aperta(c, r5, 59.71, s=1.5)
c.mostra(c.caixa("Caixa · de novo", "do começo", BRANCO, TINTA, 680, 800, 300), 60.0, pop=True)
c.salvar("conceito-5-outra-partida")
