"""Exemplo: as animações da Ilha do Farol, Aula 1, Parte 4, "Faça o personagem andar" (22/11/2026). As peças
são numeradas na ordem da aula (montar.py casa a peça N com o trecho N); 1, 3, 4, 5, 7, 8 e 9 estão no fim
do arquivo (pedido dela de 22/11: bastante animação em cada parte, ilustrando tudo o que puder).

  2. conceito-2-os-quadros (0:12,4 a 0:32,0): a parte de blocos relembra a experiência e o conceito no começo.
     "Na experiência, quem mudava de lugar era a câmera" (a câmera passa sobre a ilha 3D), "agora, quem vai sair
     do lugar é o personagem" (o aventureiro anda), "Lembra dos quadros do jogo 2D?": uma fila de quadros, cada um
     com o aventureiro um passinho adiante, e no "olhar as setas em todo quadro" uma seta embaixo de cada quadro.
  6. conceito-6-a-velocidade (1:23,4 a 1:32,3): o bloco de verdade (recortado da gravação, ainda com o 3),
     "personagem" (quem anda) e o número (a velocidade); no "quanto maior, mais rápido", dois aventureiros andam o
     mesmo caminho, um com 3 e outro com 6.
Imagens (pasta de blocos): os renders do aventureiro, jogo-ilha.png (o recorte da Parte 1) e bloco-andar.png
(vídeo 87,37 s da gravação de 22/11, recorte 878,326 a 1556,400: o bloco selecionado, com o 3),
area-rodando.png (50,5 s da voz, vídeo 51,71 s, recorte 798,200 a 1550,402: o topo da área "Enquanto estiver
rodando", com "A cada quadro da cena" e o "Escrever na tela") e pedras.png (render da Parte 3).
Uso: ilha-a1p4-conceitos.py <base.edisvg> <pasta dos blocos> <pasta de saída (a pasta pecas da parte)>
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from edisvg_cena import AMARELO, BRANCO, NOITE, SUAVE, TINTA, Cena  # noqa: E402
from ilha_cena import Personagem, camera, chao, circulo, figura  # noqa: E402

BASE, BLOCOS, SAIDA = sys.argv[1:4]
AZUL_CEU = "#9FD8FF"


def tecla_seta(c, nome, cx, cy, op=0):
    """A tecla da seta para a direita, desenhada (sem caractere de seta na fonte)."""
    filhos = [c.rect("tecla", -44, -40, 88, 80, NOITE, rx=16),
              c.poly("seta", [(-18, -20), (20, 0), (-18, 20)], BRANCO)]
    g = c.grupo(nome, cx, cy, filhos, op=op)
    c.nos.append(g)
    return g


# 2. Os quadros (12,4 a 32,0).
c = Cena("Conceito · Os quadros", 12.4, 32.0, BASE, BLOCOS, SAIDA)
c.ideia("Na experiência: a câmera", 12.45, 15.85, None)
c.ideia("Agora: o personagem anda", 15.9, 18.85, None)
c.ideia("Os quadros do jogo", 18.9, 26.4, None)
c.ideia(None, 21.21, 26.4, "Cada desenho é um quadro")
c.ideia("No 3D é igual", 26.44, 32.0, None)
c.ideia(None, 28.09, 32.0, "O jogo olha as setas em todo quadro")

ilha, _ = c.bloco("jogo-ilha", 330, 330, 0.62, fundo=BRANCO, pad=10)
c.mostra(ilha, 12.5, 15.85, pop=True)
cam = camera(c, "Câmera", 230, 380)
c.mostra(cam, 12.8, 15.85, pop=True)
c.trilha(cam, "x", [(13.4, 230, None), (15.1, 1150, SUAVE)])

chao(c, 15.95, 18.85)
anda = Personagem(c, "Aventureiro · andando")
anda.em(12.4, 300, 900, 0.7)
anda.anda(16.2, 18.5, (300, 900, 0.7), (1000, 900, 0.7))
c.trilha(anda.g, "opacity", [(15.95, 0, None), (16.2, 100, None), (18.6, 100, None), (18.85, 0, None)])
anda.fechar()

# A fila de quadros: cada um com o aventureiro um passinho adiante.
QX, QY, QW, QH, PASSO = 100, 400, 210, 210, 232
for k in range(5):
    x = QX + k * PASSO
    quadro = [c.rect("moldura", 0, 0, QW, QH, BRANCO, rx=18),
              c.rect("céu", 8, 8, QW - 16, QH - 16, AZUL_CEU, rx=12),
              c.rect("chão", 8, QH - 52, QW - 16, 44, "#F3D9A0", rx=10)]
    s = 0.27
    fig = figura(c, f"aventureiro-andando-{k % 4 + 1}")
    fig["transform"]["x"] = 26 + k * 26 - 168 * s
    fig["transform"]["y"] = QH - 18 - 645 * s
    fig["transform"]["sx"] = fig["transform"]["sy"] = s
    quadro.append(fig)
    g = c.grupo(f"Quadro {k + 1}", x, QY, quadro)
    c.nos.append(g)
    c.mostra(g, 21.8 + k * 0.62, pop=True)
    seta = tecla_seta(c, f"Seta · quadro {k + 1}", x + QW / 2, QY + QH + 80)
    c.mostra(seta, 30.67 + k * 0.22, pop=True)
c.mostra(c.caixa("Caixa · quadro", "quadro", BRANCO, TINTA, QX + QW / 2, QY - 60, 230), 25.76, pop=True)
c.salvar("conceito-2-os-quadros")

# 6. A velocidade (83,4 a 92,3).
c = Cena("Conceito · A velocidade", 83.4, 92.3, BASE, BLOCOS, SAIDA)
c.ideia("O bloco que faz andar", 83.45, 92.3, None)
S = 1.6
bloco, destaque = c.bloco("bloco-andar", 110, 300, S, pad=14)
c.mostra(bloco, 83.5, pop=True)
nome = destaque("Destaque · personagem", 76, 12, 212, 64)
c.pisca(nome, 84.69, 87.5)
c.mostra(c.caixa("Caixa · quem anda", "quem anda", BRANCO, TINTA, 110 + 144 * S, 520, 280, num=1), 84.9, 87.5, pop=True)
numero = destaque("Destaque · velocidade", 600, 18, 656, 58)
c.pisca(numero, 87.98, 92.3)
c.mostra(c.caixa("Caixa · velocidade", "velocidade", BRANCO, TINTA, 110 + 628 * S - 60, 520, 300, num=2), 88.2, 92.3, pop=True)

# "Quanto maior, mais rápido": o mesmo caminho com 3 e com 6.
for k, (n, y, fim) in enumerate(((3, 790, 92.25), (6, 990, 90.75))):
    raia = c.rect(f"Raia · {n}", 110, y - 14, 1120, 28, BRANCO, rx=14, op=0)
    c.nos.append(raia)
    c.trilha(raia, "opacity", [(89.4, 0, None), (89.6, 45, None)])
    selo = c.grupo(f"Selo · {n}", 160, y - 60, [circulo(c, "fundo", 0, 0, 46, BRANCO, borda=AMARELO, sw=6),
                                                 c.texto("número", str(n), 0, 20, 56, TINTA, ancora="middle")])
    c.nos.append(selo)
    c.mostra(selo, 89.45, pop=True)
    corre = Personagem(c, f"Aventureiro · velocidade {n}")
    corre.em(83.4, 280, y, 0.3)
    corre.anda(89.75, fim, (280, y, 0.3), (1130, y, 0.3), passo=0.16 if n == 3 else 0.08)
    c.trilha(corre.g, "opacity", [(89.45, 0, None), (89.7, 100, None)])
    corre.fechar()
c.salvar("conceito-6-a-velocidade")

# As cenas de 22/11/2026 (bastante animação em cada parte). Ficam na tela as ações: ampliar, Rodar de novo, as
# setas no jogo, arrastar até a área, abrir as categorias, encaixar, trocar o 3 por 4, Verificar e Enviar.
import math  # noqa: E402

import ilha_cena as ic  # noqa: E402

DOURADO, DOURADO_ESCURO = "#F6B826", "#C98A0C"


def chave_desenho(c, nome, cx, cy, s=1, op=0):
    """Uma chave dourada de desenho: argola, haste e dois dentes."""
    filhos = [c.rect("argola", -70, -40, 80, 80, "none", rx=40, stroke=DOURADO, sw=18),
              c.rect("haste", 4, -11, 150, 22, DOURADO, rx=8),
              c.rect("dente 1", 112, 4, 18, 34, DOURADO_ESCURO, rx=4),
              c.rect("dente 2", 138, 4, 14, 24, DOURADO_ESCURO, rx=4)]
    g = c.grupo(nome, cx, cy, filhos, op=op, s=s)
    c.nos.append(g)
    return g


def estrela(c, nome, cx, cy, r, op=0):
    pts = []
    for k in range(10):
        a = -math.pi / 2 + k * math.pi / 5
        rr = r if k % 2 == 0 else r * 0.45
        pts.append((round(rr * math.cos(a), 1), round(rr * math.sin(a), 1)))
    g = c.grupo(nome, cx, cy, [c.poly("estrela", pts, DOURADO)], op=op)
    c.nos.append(g)
    return g


def marca_no_chao(c, nome, cx, cy):
    r = c.rect(nome, cx - 70, cy - 24, 140, 48, "none", rx=24, stroke=BRANCO, sw=6, op=0)
    c.nos.append(r)
    return r


def fila_de_quadros(c, x0, y0, n=4, w=180, h=180, dx=205):
    """Quadros do jogo, cada um com o aventureiro um passinho adiante (como na cena 2, menor)."""
    grupos = []
    for k in range(n):
        quadro = [c.rect("moldura", 0, 0, w, h, BRANCO, rx=16),
                  c.rect("céu", 7, 7, w - 14, h - 14, AZUL_CEU, rx=10),
                  c.rect("chão", 7, h - 46, w - 14, 39, "#F3D9A0", rx=9)]
        s = 0.23
        fig = figura(c, f"aventureiro-andando-{k % 4 + 1}")
        fig["transform"]["x"] = 22 + k * 24 - 168 * s
        fig["transform"]["y"] = h - 15 - 645 * s
        fig["transform"]["sx"] = fig["transform"]["sy"] = s
        quadro.append(fig)
        g = c.grupo(f"Quadro {k + 1}", x0 + k * dx, y0, quadro)
        c.nos.append(g)
        grupos.append(g)
    return grupos


S_AREA, AX, AY = 1.45, 110, 360  # a área recortada: 752 x 202, na cena 1090 x 293


# 1. Ele fica parado (7,2 a 12,4): a seta afunda e o aventureiro não sai do lugar; no "não sabe", um "?".
c = Cena("Conceito · O jogo ainda não sabe", 7.2, 12.4, BASE, BLOCOS, SAIDA)
c.ideia("Ele fica parado", 7.25, 9.0, None)
c.ideia("O jogo ainda não sabe", 9.05, 12.4, None)
chao(c, 7.3)
parado1 = ic.no_chao(c, "Aventureiro · parado", "aventureiro-parado", 560, 930, 0.75, pe=ic.PE["aventureiro"])
c.mostra(parado1, 7.35)
seta1 = ic.tecla(c, "Tecla · seta direita", 1010, 560, seta="dir", s=1.5)
c.mostra(seta1, 7.4)
ic.aperta(c, seta1, (8.02, 9.06, 10.91), s=1.5)
c.mostra(c.caixa("Caixa · parado", "parado", BRANCO, TINTA, 560, 330, 240), 8.34, 9.9, pop=True)
duvida1 = ic.balao_pensa(c, "Balão · ?", 700, 360, "?")
c.mostra(duvida1, 9.95, pop=True)
c.salvar("conceito-1-o-jogo-nao-sabe")

# 3. Onde vai o bloco? (32,0 a 40,45): a Debinha pergunta à esquerda (32,35 a 35,0), com o bloco de andar e um
# "?" à direita; a professora responde com a área de verdade: "A cada quadro da cena" pisca, depois a faixa
# "Enquanto estiver rodando". O "Encontre essa área" fica na tela (leva ao arrasto).
c = Cena("Conceito · Onde vai o bloco", 32.0, 40.45, BASE, BLOCOS, SAIDA)
c.ideia("Onde vai esse bloco?", 32.05, 35.05, None)
c.ideia("A cada quadro da cena", 35.1, 37.95, None)
c.ideia("Enquanto estiver rodando", 38.0, 40.45, None)
andar3, _ = c.bloco("bloco-andar", 600, 235, 0.95, pad=12)  # acima da cabeça da Debinha
c.mostra(andar3, 32.5, 35.1, pop=True)
duvida3 = ic.balao_pensa(c, "Balão · ?", 1060, 470, "?")
c.mostra(duvida3, 33.58, 35.1, pop=True)
area3, marca3 = c.bloco("area-rodando", AX, AY, S_AREA, pad=16)
c.mostra(area3, 35.15, pop=True)
c.pisca(marca3("Destaque · A cada quadro da cena", 22, 62, 314, 130), 36.27, 37.95)
c.pisca(marca3("Destaque · Enquanto estiver rodando", 2, 5, 462, 62), 38.33, 40.45)
c.salvar("conceito-3-onde-vai-o-bloco")

# 4. Já tem o "escrever na tela" (47,65 a 52,9): a mesma área; "A cada quadro da cena" e depois o bloco
# "Escrever na tela" piscam. O lugar do bloco novo (ao lado de "fazer") é apontado na tela logo depois.
c = Cena("Conceito · Já tem o escrever", 47.65, 52.9, BASE, BLOCOS, SAIDA)
c.ideia("A cada quadro da cena", 47.7, 50.8, None)
c.ideia("Já tem o Escrever na tela", 50.83, 52.9, None)
area4, marca4 = c.bloco("area-rodando", AX, AY, S_AREA, pad=16)
c.mostra(area4, 47.7, pop=True)
c.pisca(marca4("Destaque · A cada quadro da cena", 22, 62, 314, 130), 48.72, 50.8)
c.pisca(marca4("Destaque · Escrever na tela", 88, 130, 748, 198), 51.4, 52.9)
c.salvar("conceito-4-ja-tem-o-escrever")

# 5. Este bloco faz andar (74,6 a 83,4): o bloco; no "em todo quadro" a fila de quadros com uma seta embaixo de
# cada um; no "leva o personagem para aquele lado" ele anda para a direita enquanto a seta fica apertada.
c = Cena("Conceito · Este bloco faz andar", 74.6, 83.4, BASE, BLOCOS, SAIDA)
c.ideia("Este bloco faz andar", 74.65, 77.5, None)
c.ideia("Em todo quadro: qual seta?", 77.56, 80.95, None)
c.ideia("E leva para aquele lado", 81.0, 83.4, None)
andar5, _ = c.bloco("bloco-andar", 110, 300, 1.4, pad=14)
c.mostra(andar5, 74.7, pop=True)
for k, g in enumerate(fila_de_quadros(c, 110, 480)):
    t0 = 77.9 + k * 0.2
    c.trilha(g, "opacity", [(t0, 0, None), (t0 + 0.3, 100, None), (80.75, 100, None), (81.0, 0, None)])
    s5 = ic.tecla(c, f"Tecla · quadro {k + 1}", 110 + k * 205 + 90, 760, seta="dir", s=0.9)
    c.mostra(s5, 79.55 + k * 0.15, 81.0)
anda5 = Personagem(c, "Aventureiro · para a direita")
anda5.em(74.6, 260, 1000, 0.5)
anda5.anda(81.45, 82.95, (260, 1000, 0.5), (900, 1000, 0.5))
c.trilha(anda5.g, "opacity", [(81.0, 0, None), (81.3, 100, None)])
anda5.fechar()
seta5 = ic.tecla(c, "Tecla · seta direita", 1080, 640, seta="dir", s=1.4)
c.trilha(seta5, "opacity", [(81.0, 0, None), (81.3, 100, None)])
for p in ("sx", "sy"):
    c.trilha(seta5, p, [(81.4, 1.4, None), (81.5, 1.15, None), (82.95, 1.15, None), (83.1, 1.4, None)])
c.salvar("conceito-5-este-bloco-faz-andar")

# 7. Andando e parado (108,9 a 116,6): ele anda mexendo pernas e braços; parado, respira (cresce e volta, com os
# pés no lugar); no "outras 3 setas" a seta da direita fica de lado e as outras três entram.
c = Cena("Conceito · Andando e parado", 108.9, 116.6, BASE, BLOCOS, SAIDA)
c.ideia("Andando: pernas e braços", 108.95, 111.7, None)
c.ideia("Parado: ele respira", 111.75, 113.65, None)
c.ideia("Agora as outras 3 setas", 113.7, 116.6, None)
chao(c, 109.0, 113.65)
anda7 = Personagem(c, "Aventureiro · andando")
anda7.em(108.9, 300, 930, 0.75)
anda7.anda(109.0, 111.55, (300, 930, 0.75), (880, 930, 0.75))
c.trilha(anda7.g, "opacity", [(109.0, 0, None), (109.2, 100, None), (111.6, 100, None), (111.62, 0, None)])
anda7.fechar()
c.mostra(c.caixa("Caixa · pernas e braços", "pernas e braços", BRANCO, TINTA, 600, 330, 380), 110.32, 111.7, pop=True)
bx, by = ic.PE["aventureiro"]
resp = c.grupo("Aventureiro · respira", 880 - bx * 0.75, 930 - by * 0.75, [figura(c, "aventureiro-parado")], op=0, s=0.75)
c.nos.append(resp)
c.trilha(resp, "opacity", [(111.6, 0, None), (111.62, 100, None), (113.4, 100, None), (113.65, 0, None)])
xs, ys, ss = [], [], []
for k, t in enumerate((111.7, 112.3, 112.9, 113.5)):
    e = 0.75 if k % 2 == 0 else 0.775
    xs.append((t, 880 - bx * e, SUAVE))
    ys.append((t, 930 - by * e, SUAVE))
    ss.append((t, e, SUAVE))
c.trilha(resp, "x", xs)
c.trilha(resp, "y", ys)
c.trilha(resp, "sx", ss)
c.trilha(resp, "sy", ss)
c.mostra(c.caixa("Caixa · respira", "respira", BRANCO, TINTA, 880, 330, 260), 112.8, 113.65, pop=True)
direita7 = ic.tecla(c, "Tecla · seta direita (feita)", 750, 640, seta="dir", s=1.5)
c.trilha(direita7, "opacity", [(113.75, 0, None), (114.05, 100, None), (115.0, 100, None), (115.3, 40, None)])
for k, (nome, seta, x, y) in enumerate((("esquerda", "esq", 450, 640), ("cima", "cima", 600, 500),
                                         ("baixo", "baixo", 600, 640))):
    t7 = ic.tecla(c, f"Tecla · seta {nome}", x, y, seta=seta, s=1.5)
    c.mostra(t7, 115.18 + k * 0.25)
contorno7 = c.rect("Destaque · as 3 setas", 360, 420, 330, 310, "none", rx=30, stroke=AMARELO, sw=8, op=0)
c.nos.append(contorno7)
c.pisca(contorno7, 115.9, 116.6, vezes=1)
c.salvar("conceito-7-andando-e-parado")

# 8. Você programou! (155,9 a 161,75): estrelas em volta do aventureiro; no "anda pela ilha em 3 dimensões" ele
# vai para o fundo (fica menor) e entra a caixa 3D. O clique em Reduzir (161,9) fica na tela.
c = Cena("Conceito · Você programou", 155.9, 161.75, BASE, BLOCOS, SAIDA)
c.ideia("Você programou o movimento!", 155.95, 158.8, None)
c.ideia("Ele anda pela ilha em 3D", 158.83, 161.75, None)
chao(c, 156.0)
anda8 = Personagem(c, "Aventureiro · pela ilha")
anda8.em(155.9, 380, 990, 0.75)
anda8.anda(158.85, 160.8, (380, 990, 0.75), (820, 620, 0.4))
c.trilha(anda8.g, "opacity", [(156.0, 0, None), (156.25, 100, None)])
anda8.fechar()
for k, (x, y, r, t) in enumerate(((200, 560, 46, 156.39), (420, 470, 60, 156.9), (600, 600, 40, 157.43))):
    e8 = estrela(c, f"Estrela {k + 1}", x, y, r)
    c.mostra(e8, t, 158.8, pop=True)
c.mostra(c.caixa("Caixa · 3D", "3D", BRANCO, TINTA, 1080, 430, 170, tam=56), 160.53, pop=True)
c.salvar("conceito-8-voce-programou")

# 9. Na próxima aula (162,25 a 167,9): três lugares marcados no chão ("escolher um lugar"), a chave desce para
# um deles; o aventureiro anda até ela, a chave some e aparece um "!" ("pegar a chave").
c = Cena("Conceito · Na próxima aula", 162.25, 167.9, BASE, BLOCOS, SAIDA)
c.ideia("Na próxima aula", 162.3, 165.4, None)
c.ideia("Ensinar a pegar a chave", 165.45, 167.9, None)
chao(c, 162.35)
for k, (x, y, t) in enumerate(((560, 600, 163.55), (900, 760, 163.75), (420, 840, 163.95))):
    m9 = marca_no_chao(c, f"Lugar {k + 1}", x, y)
    c.trilha(m9, "opacity", [(t, 0, None), (t + 0.25, 100, None), (164.9, 100, None), (165.2, 35, None)])
chave9 = chave_desenho(c, "Chave", 860, 300, s=0.8)
c.trilha(chave9, "opacity", [(164.17, 0, None), (164.4, 100, None), (167.0, 100, None), (167.15, 0, None)])
c.trilha(chave9, "y", [(164.4, 300, None), (164.95, 735, SUAVE)])
anda9 = Personagem(c, "Aventureiro · até a chave")
anda9.em(162.25, 320, 1000, 0.62)
anda9.anda(166.0, 167.0, (320, 1000, 0.62), (800, 790, 0.5))
c.trilha(anda9.g, "opacity", [(162.4, 0, None), (162.65, 100, None)])
anda9.fechar()
achou9 = ic.balao_pensa(c, "Balão · !", 900, 400, "!")
c.mostra(achou9, 167.05, pop=True)
c.salvar("conceito-9-na-proxima-aula")
