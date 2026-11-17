"""Exemplo: as duas animações da Farol Aula 3 Parte 4 ("Deixe o jogo com a sua cara").

O roteiro pede, na edição, duas coisas que o robô não grava:
  1. "as duas versões do jogo rodando" (0:00,0 a 0:11,8): robo, lancha, chave-prateada, farol-colorido e
     ilha-nevada; depois mergulhador, veleiro, chave-dourada, farol-de-madeira e costa-rochosa. Em cada uma, o
     personagem chega à porta, o farol acende e o barco entra pela direita;
  2. "galerias do Passo a passo do projeto" (0:11,8 a 0:25,4): todas as opções com o nome de cada uma, a lista
     de imagens do Estúdio (desenho pequeno e o mesmo nome) e a escolha que fica no jogo.
As artes são as do jogo (base_jogo.py sobre o animacao1.edisvg da Aula 1). Os tempos são da transcrição da voz.
Uso: farol-a3p4-versoes-e-opcoes.py <base.edisvg> <pasta qualquer (sem blocos)> <pasta de saída>
"""

import copy
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from edisvg_cena import AMARELO, BRANCO, NOITE, SUAVE, TINTA, VAIVEM, Cena, nid, tf  # noqa: E402

BASE, BLOCOS, SAIDA = sys.argv[1:4]
CEU = "#94D5F5"


def arte(c, nome, x, y, w, h=None, op=100):
    """Instância de uma arte do jogo (grupo "Jogo" da base), no tamanho pedido."""
    no = copy.deepcopy(c.arte[nome])
    no["id"] = nid()
    no["transform"] = tf(x, y, op)
    no["instance"]["width"], no["instance"]["height"] = w, h or w
    return no


def etiqueta(c, nome, t, x, y, w):
    """Pílula amarela com texto escuro (o amarelo de "o que olhar agora")."""
    return c.grupo(nome, x, y, [c.rect("fundo", -w / 2, -34, w, 68, AMARELO, rx=34),
                                c.texto("texto", t, 0, 14, 36, TINTA, ancora="middle")])


def tela_do_jogo(c, nome, cenario, farol, barco, personagem, t0, t_porta, t_acende, t_barco):
    """A tela do jogo (como nas animações do curso): moldura, céu, cenário, farol, barco e personagem.
    O personagem chega à porta em t_porta, o farol acende em t_acende e o barco entra entre t_barco e +1,2 s."""
    apagado = arte(c, f"farol · {farol}-apagado", 984, 120, 456)
    aceso = arte(c, f"farol · {farol}-aceso", 984, 120, 456, op=0)
    boat = arte(c, f"barco · {barco}", 1380, 720, 264, op=0)
    pers = arte(c, f"personagem · {personagem}", 820, 400, 192)
    conteudo = c.grupo("Jogo · conteúdo", 104, 176, [
        c.rect("Fundo do palco", 0, 0, 1440, 1080, CEU),
        arte(c, f"cenário · {cenario}", 0, 0, 1440, 1080),
        apagado, aceso, boat, pers], op=100, s=0.8)
    tela = c.grupo(nome, 0, 0, [c.rect("moldura", 96, 168, 1168, 880, NOITE, rx=18), conteudo])
    c.nos.append(tela)
    c.trilha(pers, "x", [(t0, 820, None), (t_porta, 1010, SUAVE)])
    c.trilha(pers, "y", [(t0, 400, None), (t0 + 0.2, 388, VAIVEM), (t0 + 0.4, 400, VAIVEM),
                         (t0 + 0.6, 388, VAIVEM), (t_porta, 400, None)])
    c.trilha(aceso, "opacity", [(t_acende, 0, None), (t_acende + 0.2, 100, None)])
    c.trilha(apagado, "opacity", [(t_acende + 0.15, 100, None), (t_acende + 0.3, 0, None)])
    c.trilha(aceso, "y", [(t_acende, 120, None), (t_acende + 0.12, 104, VAIVEM), (t_acende + 0.25, 120, None)])
    # Entra pela borda direita da tela do jogo (fora dela não há o que ver).
    c.trilha(boat, "x", [(t_barco, 1380, None), (t_barco + 1.2, 1150, SUAVE)])
    c.trilha(boat, "opacity", [(t_barco, 0, None), (t_barco + 0.25, 100, None)])
    balanco = [(t_barco + 1.2 + k * 0.6, 720 if k % 2 == 0 else 732, VAIVEM) for k in range(8)]
    c.trilha(boat, "y", balanco)
    return tela, pers, boat


# 1. As duas versões do jogo (0:00,0 a 0:11,8).
c = Cena("Conceito · Duas versões do jogo", 0.0, 11.8, BASE, BLOCOS, SAIDA)
c.ideia("A surpresa chegou!", 0.3, 3.6, None)
c.ideia("Olha quantas versões!", 3.7, 9.9, None)
a, _, _ = tela_do_jogo(c, "Versão 1", "ilha-nevada", "farol-colorido", "lancha", "robo",
                       0.3, 1.1, 1.3, 1.4)
c.trilha(a, "opacity", [(0.0, 100, None), (6.0, 100, None), (6.35, 0, None)])
b, pers_b, barco_b = tela_do_jogo(c, "Versão 2", "costa-rochosa", "farol-de-madeira", "veleiro",
                                  "mergulhador", 6.3, 7.0, 7.2, 8.0)
c.trilha(b, "opacity", [(6.0, 0, None), (6.35, 100, None)])
for nome, t, x, y, w in (("outro personagem", 6.5, 560, 560, 380), ("outro cenário", 7.9, 400, 900, 330),
                         ("outro barco", 8.9, 1010, 760, 300)):
    e = etiqueta(c, f"Etiqueta · {nome}", nome, x, y, w)
    c.nos.append(e)
    c.mostra(e, t, 11.6, pop=True)
c.ideia("Que combinação você vai criar?", 10.1, 11.8, None)
c.salvar("conceito-1-duas-versoes-do-jogo")

# 2. Todas as opções (0:11,8 a 0:25,4).
c = Cena("Conceito · Todas as opções", 11.8, 25.4, BASE, BLOCOS, SAIDA)
c.ideia("Todas as opções", 11.9, 14.3, None)
c.ideia("No seu Passo a passo do projeto", 14.4, 16.5, None)
c.ideia("Na lista de imagens do Estúdio", 16.6, 21.2, None)
c.ideia("Com o mesmo nome", 21.3, 22.7, None)
c.ideia("Fica no seu jogo!", 22.8, 25.4, None)
PERS = ["aventureiro", "menina-de-laco", "marinheira", "menino-de-bone", "exploradora-de-chapeu", "pirata",
        "mergulhador", "robo"]
LINHAS = [
    ("Personagens", [(f"personagem · {p}", p, 112, 112) for p in PERS], 150),
    ("Cenários", [(f"cenário · {p}", p, 144, 108) for p in ("praia-tropical", "costa-rochosa", "ilha-nevada",
                                                             "noite-na-ilha")], 160),
    ("Barcos", [(f"barco · {p}", p, 104, 104) for p in ("veleiro", "barco-de-pesca", "lancha", "barco-pirata")], 130),
    ("Chaves", [(f"chave · {p}", p, 72, 72) for p in ("chave-dourada", "chave-prateada", "chave-de-estrela")], 110),
    ("Faróis", [(f"farol · {p}-aceso", p, 104, 104) for p in ("farol-listrado", "farol-de-pedra", "farol-de-madeira",
                                                              "farol-colorido")], 130),
]
galeria = []
# A linha de base de cada linha: os nomes desta mais a figura da seguinte, sem encostar.
BASES = [330, 518, 682, 814, 978]
for k, (titulo, itens, _) in enumerate(LINHAS):
    y = BASES[k]
    t = 12.8 + k * 0.55
    filhos = [c.texto("rótulo", titulo, 0, 0, 34, BRANCO, op=100)]
    largura = 1168 - 210
    for i, (arte_nome, nome, w, h) in enumerate(itens):
        x = 210 + i * (largura / len(itens))
        filhos.append(arte(c, arte_nome, x, -h + 6, w, h))
        # Nomes longos lado a lado: um sim, um não um pouco mais abaixo (os personagens).
        ny = 28 + (20 if len(itens) > 5 and i % 2 else 0)
        filhos.append(c.texto("nome", nome, x + w / 2, ny, 19, BRANCO, familia="Nunito", peso=700,
                              ancora="middle", op=100))
    linha = c.grupo(f"Galeria · {titulo}", 96, y, filhos)
    c.nos.append(linha)
    # Entra subindo; esmaece quando a lista do Estúdio aparece; sai com o jogo.
    c.trilha(linha, "opacity", [(t, 0, None), (t + 0.3, 100, None), (16.4, 100, None), (16.7, 22, None),
                                (22.6, 22, None), (22.8, 0, None)])
    c.trilha(linha, "y", [(t, y + 16, SUAVE), (t + 0.3, y, None)])
    galeria.append(linha)
# A lista de imagens do Estúdio: desenho pequeno e o mesmo nome.
filhos = [c.rect("cartão", 0, 0, 620, 640, BRANCO, rx=28),
          c.texto("bloco", "com imagem  aventureiro", 36, 64, 34, TINTA, op=100),
          c.poly("abre a lista", [(452, 42), (476, 42), (464, 58)], TINTA)]
for i, p in enumerate(PERS):
    yy = 110 + i * 64
    if p == "pirata":
        filhos.append(c.rect("linha escolhida", 20, yy - 8, 580, 60, "#FFE7A6", rx=14))
    filhos.append(arte(c, f"personagem · {p}", 40, yy - 4, 52))
    filhos.append(c.texto("nome", p, 110, yy + 34, 30, TINTA, familia="Nunito", peso=700, op=100))
lista = c.grupo("Lista de imagens do Estúdio", 370, 300, filhos)
c.nos.append(lista)
c.mostra(lista, 16.7, 22.7, pop=True)
marca = c.rect("Destaque · pirata", 370 + 14, 300 + 110 + 5 * 64 - 14, 592, 72, "none", rx=16, stroke=AMARELO,
               sw=6, op=0)
c.nos.append(marca)
c.pisca(marca, 21.3, 22.6, vezes=2)
# O que você escolher fica no jogo: o pirata na tela do jogo.
pirata = arte(c, "personagem · pirata", 380, 500, 288, op=100)
jogo = c.grupo("Jogo com o pirata", 0, 0, [
    c.rect("moldura", 96, 168, 1168, 880, NOITE, rx=18),
    c.grupo("Jogo · conteúdo", 104, 176, [c.rect("Fundo do palco", 0, 0, 1440, 1080, CEU),
                                          arte(c, "cenário · praia-tropical", 0, 0, 1440, 1080),
                                          arte(c, "farol · farol-listrado-apagado", 984, 120, 456), pirata],
            op=100, s=0.8)])
c.nos.append(jogo)
c.mostra(jogo, 22.8)
for p in ("sx", "sy"):
    c.trilha(pirata, p, [(23.0, 0.6, SUAVE), (23.35, 1.08, VAIVEM), (23.5, 1, None)])
c.salvar("conceito-2-todas-as-opcoes")
