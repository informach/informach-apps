"""Exemplo: as animações da Ilha do Farol, Aula 3, Parte 5, "Deixe o jogo com a sua cara" (22/11/2026). Ficam na
tela as ações (arrastar, abrir a lista, escolher o modelo, rodar, jogar), os "olha só" e o jogo que a fala aponta.

Os tempos saem da voz da parte (tempos_da_voz.Voz), já na linha do tempo da edição: grave antes de gerar.
  1. conceito-1-duas-combinacoes ("E agora chegou uma surpresa" até "outro cenário"): "[na edição: duas
     combinações prontas]", em animação com os renders dos modelos: robo, lancha, chave prateada, farol
     colorido e ilha nevada (o farol acende e o barco chega); depois, a cada "outro …" da fala, uma peça troca
     pela da segunda combinação: mergulhador, veleiro, chave dourada, farol de madeira e costa rochosa.
  2. conceito-2-os-mesmos-nomes ("São as mesmas opções" até "três dimensões"): os modelos 3D com os nomes que
     a criança já conhece da Chave do Farol.
  3. conceito-3-a-mesma-medida ("porque todos os personagens" até "como o Aventureiro"): os oito personagens
     lado a lado, com a régua da mesma altura; o pirata anda no lugar.
  4. conceito-4-um-farol-so ("No 2D, o farol tinha duas imagens" até "trocar num lugar"): no 2D, duas imagens
     (apagada e acesa); no 3D, os quatro faróis acendem, cada um um modelo só.
  5. conceito-5-a-ilha-inteira ("é a ilha inteira" até "e o céu"): o cenário de praia tropical grande, e cada
     parte apontada quando a fala diz: o mar, o chão, a ponte, as árvores e o céu.
Imagens (pasta de blocos): os renders de ilha-render-aula3.py e as miniaturas dos cenários da galeria do jogo.
Uso: ilha-a3p5-conceitos.py <base.edisvg> <pasta dos blocos> <pasta de saída (a pasta pecas da parte)>
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from edisvg_cena import AMARELO, BRANCO, SUAVE, TINTA, VAIVEM, Cena  # noqa: E402
from ilha_cena import chao, estrela, mover, no_chao  # noqa: E402
from tempos_da_voz import Voz  # noqa: E402

BASE, BLOCOS, SAIDA = sys.argv[1:4]
voz = Voz.da_parte("ilha", 3, 5)
PERSONAGENS = ["aventureiro", "menina-de-laco", "marinheira", "menino-de-bone", "exploradora-de-chapeu", "pirata",
               "mergulhador", "robo"]
FAROIS = ["farol-listrado", "farol-de-pedra", "farol-de-madeira", "farol-colorido"]


def combinacao(c, nome, pecas, t0, t_fim):
    """Uma combinação montada: cenário ao fundo, personagem, chave, farol e barco (cada um um grupo)."""
    cenario, personagem, chave, farol, barco = pecas
    g = {
        "cenario": no_chao(c, f"{nome} · cenário", f"cenario-{cenario}", 690, 980, 2.3),
        "personagem": no_chao(c, f"{nome} · personagem", f"personagem-{personagem}", 560, 930, 0.32),
        "chave": no_chao(c, f"{nome} · chave", chave, 760, 900, 0.17),
        "farol": no_chao(c, f"{nome} · farol", farol, 1040, 880, 0.36),
        "farol aceso": no_chao(c, f"{nome} · farol aceso", f"{farol}-aceso", 1040, 880, 0.36),
        "barco": no_chao(c, f"{nome} · barco", f"barco-{barco}", 330, 820, 0.3),
    }
    return g


# 1. Duas combinações.
t0, t1 = voz.trecho("E agora chegou uma surpresa", "outro cenário.")
c = Cena("Conceito · Duas combinações", t0, t1, BASE, BLOCOS, SAIDA)
t_versoes = voz.palavra("outras versões", t0)
t_pers = voz.palavra("outro personagem", t_versoes)
t_barco = voz.palavra("outro barco", t_pers)
t_chave = voz.palavra("outra chave", t_barco)
t_farol = voz.palavra("outro farol", t_chave)
t_cen = voz.palavra("outro cenário", t_farol)
c.ideia("Uma surpresa", t0 + 0.05, t_versoes - 0.1, None)
c.ideia("Outras versões", t_versoes - 0.05, t1, None)
a = combinacao(c, "Robô", ("ilha-nevada", "robo", "chave-prateada", "farol-colorido", "lancha"), t0, t_pers)
b = combinacao(c, "Mergulhador", ("costa-rochosa", "mergulhador", "chave-dourada", "farol-de-madeira", "veleiro"),
               t_pers, t1)
c.mostra(a["cenario"], t0 + 0.1, t_cen + 0.3)
# O farol colorido acende e a lancha chega, antes das trocas. Cada peça da primeira combinação sai quando a
# fala diz a dela ("outro personagem", "outro barco", …), e a da segunda entra no lugar.
t_acende = t0 + (t_pers - t0) * 0.45
c.mostra(a["personagem"], t0 + 0.3, t_pers + 0.2, pop=True)
c.mostra(a["chave"], t0 + 0.5, t_chave + 0.2, pop=True)
c.mostra(a["farol"], t0 + 0.7, t_acende + 0.4, pop=True)
c.mostra(a["farol aceso"], t_acende, t_farol + 0.2)
c.mostra(a["barco"], t_acende + 0.2, t_barco + 0.2)
mover(c, a["barco"], "barco-lancha", t_acende + 0.2, (120, 820, 0.3), t_pers - 0.2, (330, 820, 0.3), SUAVE)
brilho = estrela(c, "Estrela · acendeu", 1040, 470, 46)
c.mostra(brilho, t_acende, t_acende + 1.0, pop=True)
for chave, t in (("personagem", t_pers), ("barco", t_barco), ("chave", t_chave), ("farol", t_farol)):
    c.mostra(b[chave], t, None, pop=True)
c.mostra(b["farol aceso"], t_farol + 0.6, pop=True)
c.mostra(b["cenario"], t_cen)
# O cenário novo entra por trás: o grupo dele vem logo depois do primeiro na ordem de desenho.
c.nos.remove(b["cenario"])
c.nos.insert(c.nos.index(a["cenario"]) + 1, b["cenario"])
c.salvar("conceito-1-duas-combinacoes")

# 2. Os mesmos nomes.
t0, t1 = voz.trecho("São as mesmas opções", "três dimensões.")
c = Cena("Conceito · Os mesmos nomes", t0, t1, BASE, BLOCOS, SAIDA)
t_nomes = voz.palavra("com os mesmos nomes", t0)
t_3d = voz.palavra("agora em três dimensões", t_nomes)
c.ideia("As mesmas opções", t0 + 0.05, t_nomes - 0.1, None)
c.ideia("Os mesmos nomes", t_nomes - 0.05, t_3d - 0.1, None)
c.ideia("Agora em 3D", t_3d - 0.05, t1, None)
cartoes = [("personagem-aventureiro", "aventureiro", 0.36), ("personagem-pirata", "pirata", 0.36),
           ("barco-veleiro", "veleiro", 0.32), ("chave-dourada", "chave-dourada", 0.24),
           ("farol-listrado", "farol-listrado", 0.3)]
for k, (arq, nome, s) in enumerate(cartoes):
    x = 190 + k * 270
    fundo = c.rect(f"Cartão · {nome}", x - 120, 380, 240, 470, BRANCO, rx=28, op=0)
    c.nos.append(fundo)
    c.mostra(fundo, t0 + 0.2 + 0.25 * k, pop=True)
    figura = no_chao(c, f"Modelo · {nome}", arq, x, 760, s)
    c.mostra(figura, t0 + 0.3 + 0.25 * k, pop=True)
    rotulo = c.texto(f"Nome · {nome}", nome, x, 820, 30, TINTA, familia="Nunito", ancora="middle", op=0)
    c.nos.append(rotulo)
    c.mostra(rotulo, t_nomes + 0.15 * k, sobe=8)
c.salvar("conceito-2-os-mesmos-nomes")

# 3. A mesma medida.
t0 = voz.palavra("porque todos os personagens")
t1 = voz.fim("como o Aventureiro.", t0)
c = Cena("Conceito · A mesma medida", t0, t1, BASE, BLOCOS, SAIDA)
t_anda = voz.palavra("também anda e respira", t0)
c.ideia("A mesma medida", t0 + 0.05, t_anda - 0.1, None)
c.ideia("Anda e respira", t_anda - 0.05, t1, None)
chao(c, t0 + 0.05)
figuras = []
for k, nome in enumerate(PERSONAGENS):
    f = no_chao(c, f"Personagem · {nome}", f"personagem-{nome}", 230 + k * 150, 900, 0.34)
    c.mostra(f, t0 + 0.2 + 0.12 * k, pop=True)
    figuras.append(f)
regua = c.rect("Régua · mesma altura", 140, 655, 1180, 8, AMARELO, rx=4, op=0)
c.nos.append(regua)
c.pisca(regua, t0 + 1.4, t_anda - 0.1, vezes=3)
pirata = figuras[PERSONAGENS.index("pirata")]
y = pirata["transform"]["y"]
balanco = [(t_anda + 0.05 + 0.5 * k, y - (14 if k % 2 else 0), VAIVEM) for k in range(int((t1 - t_anda) / 0.5))]
c.trilha(pirata, "y", [(t_anda, y, None)] + balanco)
c.salvar("conceito-3-a-mesma-medida")

# 4. Um farol só.
t0, t1 = voz.trecho("No 2D, o farol tinha duas imagens", "trocar num lugar.")
c = Cena("Conceito · Um farol só", t0, t1, BASE, BLOCOS, SAIDA)
t_aqui = voz.palavra("Aqui, cada farol", t0)
t_todos = voz.palavra("todos sabem acender", t_aqui)
c.ideia("No 2D, duas imagens", t0 + 0.05, t_aqui - 0.1, None)
c.ideia("No 3D, um modelo só", t_aqui - 0.05, t1, None)
for k, (arq, x) in enumerate((("farol-listrado", 420), ("farol-listrado-aceso", 860))):
    quadro = c.rect(f"Imagem 2D · {k + 1}", x - 170, 330, 340, 560, BRANCO, rx=24, stroke="#C9D6E8", sw=6, op=0)
    c.nos.append(quadro)
    c.mostra(quadro, t0 + 0.3 + 0.5 * k, t_aqui, pop=True)
    f = no_chao(c, f"Farol 2D · {k + 1}", arq, x, 850, 0.46)
    c.mostra(f, t0 + 0.4 + 0.5 * k, t_aqui, pop=True)
for k, nome in enumerate(FAROIS):
    x = 230 + k * 330
    apagado = no_chao(c, f"Farol 3D · {nome}", nome, x, 940, 0.52)
    c.mostra(apagado, t_aqui + 0.1 + 0.15 * k, t_todos + 0.6, pop=True)
    aceso = no_chao(c, f"Farol 3D aceso · {nome}", f"{nome}-aceso", x, 940, 0.52)
    c.mostra(aceso, t_todos + 0.3)
c.salvar("conceito-4-um-farol-so")

# 5. A ilha inteira.
t0 = voz.palavra("é a ilha inteira")
t1 = voz.fim("e o céu.", t0)
c = Cena("Conceito · A ilha inteira", t0, t1, BASE, BLOCOS, SAIDA)
c.ideia("O cenário é a ilha inteira", t0 + 0.05, t1, None)
ilha = no_chao(c, "Cenário · praia tropical", "cenario-praia-tropical", 700, 1010, 2.6)
c.mostra(ilha, t0 + 0.1, pop=True)
partes = [("o mar", "mar", 260, 820), ("o chão", "chão", 640, 760), ("a ponte", "ponte", 930, 700),
          ("as árvores", "árvores", 520, 560), ("e o céu", "céu", 1150, 330)]
depois = t0
for fala, rotulo, x, y in partes:
    t = voz.palavra(fala, depois)
    depois = t
    marca = c.caixa(f"Parte · {rotulo}", rotulo, AMARELO, TINTA, x, y, 220, tam=44)
    c.mostra(marca, t, pop=True)
c.salvar("conceito-5-a-ilha-inteira")
