"""As animações de conceito de Moedas no caminho (Poder do Faísca, 27/11/2026), Aula 2 (a ilha 3D).

As cenas entram onde a professora só explica, sem gesto na tela: a regra que vem da Aula 1, o cofrinho, o grupo
das moedas, o número a cada quadro, as moedas que já saíram da cena, a pergunta do baú, o "pelo menos 5", a
animação abrir, as duas respostas do aviso e o fecho. Os tempos saem da voz da parte (tempos_da_voz.Voz), já na
linha do tempo da edição: grave antes de gerar. Cada cena procura a sua frase depois do fim da anterior. Peças em
moedas_cena.py; renders em exemplos/moedas-render-modelos.py.

Uso: moedas-conceitos.py <aula> <parte> <base.edisvg> <pasta dos blocos> <pasta de saída (pecas da parte)>
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from edisvg_cena import AMARELO, BRANCO, TINTA, VERDE, Cena  # noqa: E402
from moedas_cena import (  # noqa: E402
    aviso,
    bau,
    caixa_em,
    certo,
    chao_ilha,
    cofrinho,
    esc,
    moeda,
    personagem,
    pergunta,
    placar,
    vaga,
    vis,
)
from tempos_da_voz import Voz  # noqa: E402

AULA, PARTE = int(sys.argv[1]), int(sys.argv[2])
BASE, BLOCOS, SAIDA = sys.argv[3:6]
voz = Voz.da_parte("moedas", AULA, PARTE)
fim_anterior = 0.0

# As moedas da trilha no chão em perspectiva, da frente (esquerda) para o fundo (direita), e o começo do caminho.
TRILHA = [(300, 975), (470, 880), (640, 795), (800, 715), (945, 645)]
COMECO = (150, 1010)


def cena(nome, comeco, final):
    global fim_anterior
    t0, t1 = voz.trecho(comeco, final, depois=fim_anterior)
    fim_anterior = t1
    return Cena(f"Conceito · {nome}", t0, t1, BASE, BLOCOS, SAIDA), t0, t1


def onde(x, y):
    return (x, y, esc(y))


def cartao(c, nome, x, y, w, h, t0, t1):
    no = c.rect(nome, x, y, w, h, BRANCO, rx=36, op=0)
    c.nos.append(no)
    vis(c, no, [(t0, t1)])
    return no


def rotulo(c, nome, texto, cx, y, t0, t1, tam=40, cor=TINTA):
    no = c.texto(nome, texto, cx, y, tam, cor, familia="Nunito", peso=800, ancora="middle", op=0)
    c.nos.append(no)
    c.mostra(no, t0, t1, sobe=8)
    return no


def tres_regras(c, t_a, t_b, t_c, t1):
    """A regra das moedas em três cartões, um por frase: a moeda soma 1 e sai (uma vez só), o número aparece na
    tela, o baú abre com pelo menos 5."""
    for k, (x, t, texto) in enumerate(((140, t_a, "soma 1, uma vez só"), (525, t_b, "aparece na tela"),
                                       (910, t_c, "com pelo menos 5"))):
        cartao(c, f"Cartão {k + 1}", x, 380, 330, 470, t, t1)
        rotulo(c, f"Cartão {k + 1} · texto", texto, x + 165, 805, t + 0.2, t1, tam=30)
    pega = min(t_a + 0.9, t_b - 0.4)
    moeda(c, "Moeda", 305, 740, t_a + 0.1, t_pega=pega, s=0.75)
    caixa_em(c, "Mais um", "+1", 305, 560, 170, pega + 0.15, t1, fill=VERDE, cor=AMARELO, tam=60)
    placar(c, 552, 545, [(t_b + 0.1, "0"), (t_b + 0.7, "1"), (t_b + 1.2, "2")], t_b + 0.1, t1, tam=1.2)
    bau(c, 1075, 760, t_c + 0.1, t1, t_abre=min(t_c + 1.0, t1 - 0.8), s=0.66)


# ── Parte 1 ────────────────────────────────────────────────────────────────────────────────────────────────
def a2p1():
    c, t0, t1 = cena("A mesma regra", "A regra continua a mesma", "pelo menos 5 moedas.")
    c.ideia("A mesma regra", t0 + 0.05, t1, "a do seu jogo 2D, agora na ilha")
    tres_regras(c, voz.palavra("cada moeda soma um", t0), voz.palavra("o número aparece na tela", t0),
                voz.palavra("e o baú abre", t0), t1)
    c.salvar("conceito-1-a-mesma-regra")


# ── Parte 2 ────────────────────────────────────────────────────────────────────────────────────────────────
def a2p2():
    c, t0, t1 = cena("O cofrinho", "Primeiro, o cofrinho", "na área Ao iniciar.")
    t_com = voz.palavra("desde o começo da partida", t0)
    t_area = voz.palavra("Por isso, ela vai", t0)
    c.ideia("O cofrinho", t0 + 0.05, t1, "a variável moedas")
    cofrinho(c, 400, 640, [(t0 + 0.6, "0", TINTA)], t0 + 0.3, t1, w=440)
    rotulo(c, "Começa em", "começa em 0", 400, 800, t0 + 0.9, t1, tam=36, cor=BRANCO)
    caixa_em(c, "Começo", "desde o começo da partida", 960, 560, 520, t_com, t1, fill=VERDE, cor=AMARELO, tam=38)
    seta = c.poly("Seta", [(945, 640), (975, 640), (975, 690), (1000, 690), (960, 730), (920, 690), (945, 690)], BRANCO)
    seta["transform"]["opacity"] = 0
    c.nos.append(seta)
    vis(c, seta, [(t_area, t1)])
    caixa_em(c, "Ao iniciar", "na área Ao iniciar", 960, 800, 520, t_area + 0.15, t1, tam=38)
    c.salvar("conceito-1-o-cofrinho")

    c, t0, t1 = cena("O grupo das moedas", "Agora o encontro com as moedas", "no jogo 3D?")
    t_grupo = voz.palavra("grupo, o moedasDoCaminho", t0)
    t_onde = voz.palavra("E onde fica esse encontro", t0)
    c.ideia("Um grupo de moedas", t0 + 0.05, t1, "o moedasDoCaminho")
    chao_ilha(c, t0, t1)
    for k, (x, y) in enumerate(TRILHA):
        moeda(c, f"Moeda {k + 1}", x, y, t0 + 0.2 + 0.12 * k, t1=t1)
    grupo = c.rect("Grupo", 220, 560, 820, 450, "none", rx=60, stroke=AMARELO, sw=8, op=0)
    grupo["attrs"]["stroke-dasharray"] = "26 18"
    c.nos.append(grupo)
    vis(c, grupo, [(t_grupo, t1)])
    caixa_em(c, "Nome do grupo", "moedasDoCaminho", 640, 470, 520, t_grupo + 0.2, t1, tam=40)
    chega = min(t_onde + 1.2, t1 - 0.5)
    personagem(c, "Aventureiro", t0 + 0.2, t1, [(t_onde, chega, onde(*COMECO), onde(250, 990))])
    c.salvar("conceito-2-o-grupo-das-moedas")

    c, t0, t1 = cena("O nome moeda", "É por esse nome", "acabou de encostar.")
    c.ideia("O nome moeda", t0 + 0.05, t1, "a moeda que ele acabou de encostar")
    chao_ilha(c, t0, t1)
    for k, (x, y) in enumerate(TRILHA[:3]):
        moeda(c, f"Moeda {k + 1}", x, y, t0 + 0.1, t1=t1)
    personagem(c, "Aventureiro", t0 + 0.1, t1, [(t0 + 0.3, t0 + 1.3, onde(*COMECO), onde(250, 990))])
    anel = c.rect("Encostou", 300 - 80, 975 - 175, 160, 160, "none", rx=80, stroke=AMARELO, sw=8, op=0)
    c.nos.append(anel)
    c.pisca(anel, t0 + 1.35, t1, vezes=2)
    caixa_em(c, "Nome", "moeda", 330, 740, 220, t0 + 1.5, t1, fill=VERDE, cor=AMARELO)
    c.salvar("conceito-3-o-nome-moeda")


# ── Parte 3 ────────────────────────────────────────────────────────────────────────────────────────────────
def a2p3():
    c, t0, t1 = cena("A cada quadro", "Na Aula 1, o placar ficava", "o valor de agora.")
    t_ilha = voz.palavra("Na ilha é igual", t0)
    t_agora = voz.palavra("para mostrar sempre", t0)
    c.ideia("A cada quadro", t0 + 0.05, t1, "o número de agora na tela")
    passo = max(0.5, min(0.9, (t_agora - t_ilha) / 4))
    for k in range(4):
        t = t_ilha + passo * k
        cartao(c, f"Quadro {k + 1}", 140 + 287 * k, 360, 240, 200, t, t1)
        placar(c, 160 + 287 * k, 405, [(t, str(k))], t, t1, tam=0.87)
        rotulo(c, f"Quadro {k + 1} · nome", f"quadro {k + 1}", 260 + 287 * k, 610, t, t1, tam=30, cor=BRANCO)
    caixa_em(c, "Na Aula 1", "Aula 1: A cada quadro do jogo", 690, 460, 760, t0 + 0.4, t_ilha, tam=40)
    caixa_em(c, "Na ilha", "A cada quadro da cena", 690, 710, 560, t_ilha + 0.2, t1, fill=VERDE, cor=AMARELO, tam=40)
    cofrinho(c, 690, 900, [(t_ilha + passo * k, str(k), TINTA) for k in range(4)], t_ilha, t1)
    c.salvar("conceito-1-a-cada-quadro")

    c, t0, t1 = cena("As moedas já saíram", "Por que o número não sobe", "em moeda nenhuma.")
    t_porque = voz.palavra("Porque as moedas", t0)
    c.ideia("Por que não sobe?", t0 + 0.05, t_porque - 0.05, None)
    c.ideia("As moedas já saíram", t_porque, t1, "voltar não encosta em moeda nenhuma")
    chao_ilha(c, t0, t1)
    for k, (x, y) in enumerate(TRILHA):
        vaga(c, f"Vaga {k + 1}", x, y, t0 + 0.2, t1)
    placar(c, 140, 300, [(t0 + 0.2, "5")], t0 + 0.2, t1)
    personagem(c, "Aventureiro", t0 + 0.1, t1, [(t0 + 0.4, max(t0 + 2.5, t1 - 0.6), onde(1020, 620), onde(*COMECO))])
    c.salvar("conceito-2-as-moedas-ja-sairam")


# ── Parte 4 ────────────────────────────────────────────────────────────────────────────────────────────────
def a2p4():
    c, t0, t1 = cena("A pergunta do baú", "Na Aula 1, o baú do jogo 2D perguntava", "como encostar numa moeda.")
    t_prim = voz.palavra("Primeiro, o jogo precisa perceber", t0)
    t_enc = voz.palavra("Chegar ao baú é um encontro", t0)
    c.ideia("A pergunta do baú", t0 + 0.05, t_prim - 0.05, "a mesma do jogo 2D")
    c.ideia("Chegar ao baú", t_prim, t1, "é um encontro")
    chao_ilha(c, t0, t1)
    bau(c, 420, 830, t0 + 0.2, t1, s=0.44)
    pergunta(c, "Tem pelo menos 5 moedas?", 560, 380, 640, t0 + 0.5, t_prim, ponta_x=-150)
    chega = min(t_prim + 1.6, t_enc)
    personagem(c, "Aventureiro", t0 + 0.2, t1, [(t_prim + 0.1, chega, onde(1050, 990), onde(650, 900))])
    caixa_em(c, "Encontro", "encontro", 620, 520, 300, t_enc, t1, fill=VERDE, cor=AMARELO)
    c.salvar("conceito-1-a-pergunta-do-bau")

    c, t0, t1 = cena("Pelo menos 5", "Pronto: agora o Se pergunta", "o baú abre.")
    t_ou = voz.palavra("ou seja", t0)
    t_sim = voz.palavra("Agora a resposta do sim", t0)
    c.ideia("Pelo menos 5", t0 + 0.05, t1, "com 5 abre, com 6 também")
    for k, (n, abre) in enumerate((("4", False), ("5", True), ("6", True))):
        y, t = 360 + 205 * k, t0 + 0.4 + 0.45 * k
        placar(c, 220, y, [(t, n)], t, t1)
        bau(c, 690, y + 122, t, t1, t_abre=(min(t_sim + 0.3, t1 - 0.8) if abre else None), s=0.34, brilho=False)
        certo(c, f"Resposta {n}", 1080, y + 55, max(t_ou, t + 0.3), t1, ok=abre, r=46)
    c.salvar("conceito-2-pelo-menos-5")

    c, t0, t1 = cena("A animação abrir", "E quem faz o baú abrir de verdade?", "quando ela toca.")
    t_anim = voz.palavra("A animação abrir", t0)
    t_voce = voz.palavra("Você só escolhe", t0)
    c.ideia("Quem abre o baú?", t0 + 0.05, t_anim - 0.05, None)
    c.ideia("A animação abrir", t_anim, t1, "já vem pronta no modelo do baú")
    bau(c, 470, 990, t0 + 0.2, t1, t_abre=min(t_anim + 0.6, t1 - 0.8), s=0.92)
    caixa_em(c, "Animação", "a animação abrir", 1000, 560, 440, t_anim + 0.1, t1, fill=VERDE, cor=AMARELO, tam=40)
    caixa_em(c, "Quando", "você escolhe quando", 1000, 720, 440, t_voce, t1, tam=40)
    c.salvar("conceito-3-a-animacao-abrir")


# ── Parte 5 ────────────────────────────────────────────────────────────────────────────────────────────────
def a2p5():
    c, t0, t1 = cena("As duas respostas", "E, quando o baú abre", "as duas respostas!")
    t_agora = voz.palavra("Agora o aviso vai contar", t0)
    c.ideia("O aviso não conta", t0 + 0.05, t_agora - 0.05, None)
    c.ideia("As duas respostas", t_agora, t1, "o aviso conta o sim e o não")
    aviso(c, [(t0 + 0.2, "Junte moedas para o baú.")], t_agora, y=340)
    bau(c, 320, 940, t0 + 0.2, t1, t_abre=t0 + 0.6, s=0.5)
    caixa_em(c, "Sim", "Sim: O baú abriu!", 790, 520, 600, t_agora + 0.2, t1, fill=VERDE, cor=AMARELO, num=1, tam=40)
    caixa_em(c, "Não", "Não: pede pelo menos 5", 790, 700, 600, t_agora + 0.7, t1, num=2, tam=40)
    c.salvar("conceito-1-as-duas-respostas")

    c, t0, t1 = cena("Pronto", "Pronto, você levou as moedas para a ilha", "abre com pelo menos cinco!")
    c.ideia("Moedas na ilha!", t0 + 0.05, t1, "você levou a regra para o 3D")
    tres_regras(c, voz.palavra("cada moeda conta", t0), voz.palavra("o número aparece", t0),
                voz.palavra("e o baú abre", t0), t1)
    c.salvar("conceito-2-pronto")


{(2, 1): a2p1, (2, 2): a2p2, (2, 3): a2p3, (2, 4): a2p4, (2, 5): a2p5}[(AULA, PARTE)]()
