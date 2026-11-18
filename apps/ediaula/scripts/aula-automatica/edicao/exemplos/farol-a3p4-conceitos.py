"""Exemplo: as animações de conceito da Farol Aula 3 Parte 4 que o roteiro não pede na edição (1:31 e 1:50).

As duas do roteiro ("as duas versões do jogo rodando" e "galerias do Passo a passo") estão em
farol-a3p4-versoes-e-opcoes.py e são as cenas 1 e 2. Estas são as 3 e 4:
  3. "O barco novo ainda não aparece, porque o barco só chega quando o farol acende" (1:31,3 a 1:38,0);
  4. "O farol tem duas imagens ... do mesmo modelo ... troque as duas" (1:50,6 a 2:06,5). O "Primeiro, o apagado"
     fica na tela: é a instrução que abre o gesto seguinte.
Neste ponto da aula o jogo já tem o pirata e o barco pirata, e ainda a praia tropical e o farol listrado.
As artes são as do jogo (base_jogo.py sobre o animacao1.edisvg da Aula 1). Os tempos são da transcrição da voz.
Uso: farol-a3p4-conceitos.py <base.edisvg> <pasta qualquer (sem blocos)> <pasta de saída>
"""

import copy
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from edisvg_cena import AMARELO, BRANCO, NOITE, SUAVE, TINTA, VAIVEM, VERDE, Cena, nid, tf  # noqa: E402

BASE, BLOCOS, SAIDA = sys.argv[1:4]
CEU = "#94D5F5"
VERMELHO = "#E5484D"


def arte(c, nome, x, y, w, h=None, op=100):
    """Instância de uma arte do jogo (grupo "Jogo" da base), no tamanho pedido."""
    no = copy.deepcopy(c.arte[nome])
    no["id"] = nid()
    no["transform"] = tf(x, y, op)
    no["instance"]["width"], no["instance"]["height"] = w, h or w
    return no


def etiqueta(c, nome, t, x, y, w, fundo=AMARELO, cor=TINTA, tam=36):
    """Pílula com texto (amarela: "o que olhar agora")."""
    return c.grupo(nome, x, y, [c.rect("fundo", -w / 2, -34, w, 68, fundo, rx=34),
                                c.texto("texto", t, 0, 14, tam, cor, ancora="middle")])


def xis(c, nome, cx, cy, r=34, e=12):
    """Um X vermelho desenhado (sem depender de símbolo da fonte)."""
    pts = [(-r, -r + e), (-r + e, -r), (0, -e), (r - e, -r), (r, -r + e), (e, 0), (r, r - e), (r - e, r), (0, e),
           (-r + e, r), (-r, r - e), (-e, 0)]
    return c.poly(nome, [(cx + x, cy + y) for x, y in pts], VERMELHO)


def seta(c, nome, x0, x1, y, cor=BRANCO, op=0):
    """Seta para a direita, de x0 a x1."""
    return c.grupo(nome, 0, 0, [c.rect("haste", x0, y - 7, x1 - x0 - 26, 14, cor, rx=7),
                                c.poly("ponta", [(x1 - 34, y - 24), (x1, y), (x1 - 34, y + 24)], cor)], op=op)


# 3. O barco espera o farol (1:31,3 a 1:38,0).
c = Cena("Conceito · O barco espera o farol", 91.3, 98.0, BASE, BLOCOS, SAIDA)
c.ideia("Cadê o barco novo?", 91.4, 93.4, None)
c.ideia("Só com o farol aceso", 93.5, 96.3, None)
c.ideia("Você vai ver no teste!", 96.4, 98.0, None)
apagado = arte(c, "farol · farol-listrado-apagado", 984, 120, 456)
aceso = arte(c, "farol · farol-listrado-aceso", 984, 120, 456, op=0)
barco = arte(c, "barco · barco-pirata", 1380, 720, 264, op=0)
pirata = arte(c, "personagem · pirata", 820, 400, 192)
tela = c.grupo("Jogo", 0, 0, [
    c.rect("moldura", 96, 168, 1168, 880, NOITE, rx=18),
    c.grupo("Jogo · conteúdo", 104, 176, [c.rect("Fundo do palco", 0, 0, 1440, 1080, CEU),
                                          arte(c, "cenário · praia-tropical", 0, 0, 1440, 1080),
                                          apagado, aceso, barco, pirata], op=100, s=0.8)])
c.nos.append(tela)
c.mostra(tela, 91.4)
# O pirata chega à porta com a chave; o farol acende na palavra "acende" e só então o barco entra.
c.trilha(pirata, "x", [(91.8, 820, None), (93.2, 1010, SUAVE)])
c.trilha(pirata, "y", [(91.8, 400, None), (92.1, 388, VAIVEM), (92.4, 400, VAIVEM), (92.7, 388, VAIVEM),
                       (93.2, 400, None)])
espera = etiqueta(c, "Etiqueta · cadê o barco?", "ainda não aparece", 640, 900, 380)
c.nos.append(espera)
c.mostra(espera, 92.4, 95.2, pop=True)
c.trilha(aceso, "opacity", [(95.3, 0, None), (95.5, 100, None)])
c.trilha(apagado, "opacity", [(95.45, 100, None), (95.6, 0, None)])
c.trilha(aceso, "y", [(95.3, 120, None), (95.42, 104, VAIVEM), (95.55, 120, None)])
c.trilha(barco, "x", [(95.6, 1380, None), (96.8, 1150, SUAVE)])
c.trilha(barco, "opacity", [(95.6, 0, None), (95.85, 100, None)])
c.trilha(barco, "y", [(96.8 + k * 0.6, 720 if k % 2 == 0 else 732, VAIVEM) for k in range(3)])
chegou = etiqueta(c, "Etiqueta · barco pirata", "o barco chegou!", 640, 900, 360)
c.nos.append(chegou)
c.mostra(chegou, 96.4, pop=True)
c.salvar("conceito-3-o-barco-espera-o-farol")

# 4. As duas imagens do farol (1:50,6 a 2:06,5).
c = Cena("Conceito · As duas imagens do farol", 110.6, 126.5, BASE, BLOCOS, SAIDA)
c.ideia("O farol tem duas imagens", 110.7, 117.6, None)
c.ideia("Do mesmo modelo", 117.7, 123.1, None)
c.ideia("Trocou o farol? Troque as duas!", 123.2, 126.5, None)
CW, CH, CY = 400, 470, 250  # cartões
CARTOES = []
for k, (estado, legenda, t0) in enumerate((("apagado", "no começo", 112.6), ("aceso", "na resposta do sim", 115.0))):
    x = 170 + k * 600
    listrado = arte(c, f"farol · farol-listrado-{estado}", 50, 30, 300)
    pedra = arte(c, f"farol · farol-de-pedra-{estado}", 50, 30, 300, op=0)
    cartao = c.grupo(f"Cartão · farol {estado}", x, CY, [
        c.rect("fundo", 0, 0, CW, CH, BRANCO, rx=30), listrado, pedra,
        c.texto("estado", estado, CW / 2, 380, 46, TINTA, ancora="middle"),
        c.texto("legenda", legenda, CW / 2, 432, 30, TINTA, familia="Nunito", peso=700, ancora="middle")])
    c.nos.append(cartao)
    c.mostra(cartao, t0, pop=True)
    # O modelo de pedra no lugar do listrado, nos dois cartões ao mesmo tempo.
    c.trilha(pedra, "opacity", [(124.3, 0, None), (124.6, 100, None)])
    c.trilha(listrado, "opacity", [(124.3, 100, None), (124.6, 0, None)])
    CARTOES.append((x, cartao))
acende = seta(c, "Seta · acende", 170 + CW + 30, 770 - 30, CY + 200)
c.nos.append(acende)
c.mostra(acende, 115.0)
# Mesmo modelo: o contorno verde nos dois cartões.
for x, _ in CARTOES:
    contorno = c.rect(f"Destaque · mesmo modelo {x}", x - 10, CY - 10, CW + 20, CH + 20, "none", rx=36, stroke=VERDE,
                      sw=8, op=0)
    c.nos.append(contorno)
    c.pisca(contorno, 118.4, 120.1, vezes=2)
modelo = etiqueta(c, "Etiqueta · listrado e listrado", "listrado e listrado", 670, 790, 420, fundo=VERDE, cor=BRANCO)
c.nos.append(modelo)
c.mostra(modelo, 119.0, 120.1, pop=True)
# Modelos diferentes: o farol muda quando acende.
ERRADO_Y = 770
errado = c.grupo("Errado · modelos diferentes", 0, 0, [
    c.rect("fundo", 230, ERRADO_Y, 1000, 220, BRANCO, rx=30),
    arte(c, "farol · farol-listrado-apagado", 280, ERRADO_Y + 20, 180),
    seta(c, "seta", 480, 600, ERRADO_Y + 110, cor=TINTA, op=100),
    arte(c, "farol · farol-de-pedra-aceso", 620, ERRADO_Y + 20, 180),
    xis(c, "xis", 880, ERRADO_Y + 110),
    c.texto("o farol muda", "o farol muda!", 940, ERRADO_Y + 125, 40, VERMELHO)])
c.nos.append(errado)
c.mostra(errado, 120.4, 123.1, pop=True)
pedra = etiqueta(c, "Etiqueta · de pedra e de pedra", "de pedra e de pedra", 670, 790, 440, fundo=VERDE, cor=BRANCO)
c.nos.append(pedra)
c.mostra(pedra, 124.6, pop=True)
c.salvar("conceito-4-as-duas-imagens-do-farol")
