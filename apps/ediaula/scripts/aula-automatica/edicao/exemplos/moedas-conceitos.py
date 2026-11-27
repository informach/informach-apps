"""As animações de conceito de Moedas no caminho (Poder do Faísca, 27/11/2026): Aula 1 (o Farol 2D) e Aula 2 (a
ilha 3D).

Aula 1: o painel do jogo 2D com as artes do projeto do curso (exemplos/moedas-artes-2d.py). A Parte 3, da
experiência, é toda em animação; a Parte 2 (o Passo a passo) mostra a tela.

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
from edisvg_cena import AMARELO, BRANCO, NOITE, SUAVE, TINTA, VERDE, Cena, nid, tf  # noqa: E402
from ilha_cena import no_chao  # noqa: E402
from moedas_cena import (  # noqa: E402
    Painel,
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


# ── Aula 1 (o Farol 2D): o painel do jogo com as artes do projeto (moedas_cena.Painel) ─────────────────────────
# O painel grande ocupa a área livre; o pequeno deixa a direita para o cofrinho ou as caixas.
GRANDE = dict(x0=170, y0=300, s=2.0, amplia=1.4)
PEQUENO = dict(x0=140, y0=320, s=1.6, amplia=1.5)
# O meio da coluna à direita do painel pequeno (até a faixa da apresentadora, x 1320).
DIREITA = 1110
# O caminho do personagem pelas cinco moedas de baixo (x do jogo; o y é o da trilha) e a descida até o baú.
TRILHA_Y = 141
PASSO_MOEDA = [60, 115, 170, 225, 297]


def caminhada(t0, t1, ate=5, volta=False):
    """Os pontos do personagem pela trilha de t0 a t1, pegando as `ate` primeiras moedas; os segundos em que passa
    por cada uma. volta: depois, volta ao começo pela mesma linha."""
    xs = [21] + PASSO_MOEDA[:ate]
    ida = t1 - t0 if not volta else (t1 - t0) * 0.6
    pts = [(t0 + ida * k / (len(xs) - 1), x, TRILHA_Y) for k, x in enumerate(xs)]
    pegas = [t for t, _, _ in pts[1:]]
    if volta:
        pts.append((t1, 21, TRILHA_Y))
    return pts, pegas


def cofre(c, cx, cy, valores, t0, t1, w=380):
    return cofrinho(c, cx, cy, [(t, str(v), TINTA) for t, v in valores], t0, t1, w=w)


def regras_2d(c, t_a, t_b, t_c, t1):
    """A regra das moedas em três cartões, no jogo 2D: a moeda soma 1 e sai, o placar mostra, o baú decide."""
    for k, (x, t, texto) in enumerate(((140, t_a, "soma 1, uma vez só"), (525, t_b, "aparece na tela"),
                                       (910, t_c, "o baú decide"))):
        cartao(c, f"Cartão {k + 1}", x, 380, 330, 470, t, t1)
        rotulo(c, f"Cartão {k + 1} · texto", texto, x + 165, 805, t + 0.2, t1, tam=30)
    pega = min(t_a + 0.9, t_b - 0.4)
    # Figuras soltas, grandes, centradas nos cartões (sem o fundo do jogo).
    figura_solta(c, "Moeda", "moeda", 305, 690, 150, t_a + 0.1, pega + 0.35, sobe_em=pega)
    caixa_em(c, "Mais um", "+1", 305, 560, 170, pega + 0.15, t1, fill=VERDE, cor=AMARELO, tam=60)
    caixa_em(c, "Placar", "Moedas: 2", 690, 620, 280, t_b + 0.1, t1, fill=NOITE, cor=BRANCO, tam=40)
    figura_solta(c, "Baú fechado", "bau-fechado", 1075, 660, 230, t_c + 0.1, min(t_c + 1.0, t1 - 0.8))
    figura_solta(c, "Baú aberto", "bau-aberto", 1075, 660, 230, min(t_c + 1.0, t1 - 0.8), t1, seco=True)


def figura_solta(c, nome, arq, cx, cy, lado, t0, t1, sobe_em=None, seco=False):
    """Uma arte do jogo sozinha, sem o fundo, com o meio em (cx, cy) e `lado` px; sobe_em: sobe e some (pegou)."""
    aid, pw, _ = c.imagem(arq)
    img = {"id": nid(), "name": arq, "tag": "image", "assetId": aid,
           "attrs": {"x": "0", "y": "0", "width": str(pw), "height": str(pw)},
           "text": "", "children": [], "transform": tf(), "visible": True, "locked": False}
    g = c.grupo(nome, cx - lado / 2, cy - lado / 2, [img], op=0, s=lado / pw)
    c.nos.append(g)
    if seco:
        c.trilha(g, "opacity", [(t0 - 0.01, 0, None), (t0, 100, None), (t1 - FADE_2D, 100, None), (t1, 0, None)])
    else:
        vis(c, g, [(t0, t1)])
    if sobe_em:
        c.trilha(g, "y", [(sobe_em, cy - lado / 2, SUAVE), (sobe_em + 0.35, cy - lado / 2 - 60, None)])
    return g


FADE_2D = 0.28


def a1p1():
    c, t0, t1 = cena("Moedas no caminho", "Oi! O caminho do Farol ganhou moedas", "escondido no gramado.")
    t_chave = voz.palavra("atrás da chave", t0)
    t_seis = voz.palavra("seis moedas", t0)
    t_bau = voz.palavra("e um baú", t0)
    c.ideia("Moedas no caminho", t0 + 0.05, t1, "o caminho do Farol ganhou moedas")
    p = Painel(c, t0 + 0.1, t1, **GRANDE)
    p.cenario(t0 + 0.2, t1)
    p.personagem(t0 + 0.2, t1, [(t0, 21, TRILHA_Y)])
    anel_x, anel_y = p.ponto(211 + 16, 53 + 16)
    anel = c.rect("Chave em destaque", anel_x - 46, anel_y - 46, 92, 92, "none", rx=46, stroke=AMARELO, sw=6, op=0)
    c.nos.append(anel)
    c.pisca(anel, t_chave, t_seis - 0.1, vezes=2)
    for k in range(6):
        p.moeda(k, t_seis + 0.15 * k, t1)
    p.bau(t_bau + 0.1, t1)
    c.salvar("conceito-1-moedas-no-caminho")


def a1p3():
    # A parte da experiência é toda em animação (REGRAS.md): as cenas vão de ponta a ponta da fala.
    c, t0, t1 = cena("O jogo conta", "Para saber quantas moedas", "durante a partida.")
    t_var = voz.palavra("Ele anota essa conta", t0)
    c.ideia("O jogo conta", t0 + 0.05, t_var - 0.05, "quantas moedas o personagem já pegou")
    c.ideia("Uma variável", t_var, t1, "um número que o jogo guarda e que muda")
    p = Painel(c, t0 + 0.1, t1, **PEQUENO)
    p.cenario(t0 + 0.2, t1)
    pts, pegas = caminhada(t0 + 0.6, min(t0 + 4.2, t1 - 0.5), ate=3)
    p.personagem(t0 + 0.2, t1, pts)
    for k in range(5):
        p.moeda(k, t0 + 0.2, t1, t_pega=pegas[k] if k < 3 else None)
    cofre(c, DIREITA, 640, [(t0 + 0.4, 0)] + [(t, k + 1) for k, t in enumerate(pegas)], t_var, t1, w=320)
    c.salvar("conceito-1-o-jogo-conta")

    c, t0, t1 = cena("O cofrinho", "Sabe quando você guarda moedas num cofrinho?", "ela está em zero.")
    t_jogo = voz.palavra("No seu jogo, o cofrinho", t0)
    t_zero = voz.palavra("Quando a partida começa", t0)
    c.ideia("O cofrinho", t0 + 0.05, t_jogo - 0.05, "cada moeda faz o total crescer")
    c.ideia("A variável moedas", t_jogo, t1, "começa em zero")
    quedas = [t0 + 1.0 + 0.7 * k for k in range(3)]
    for k, t in enumerate(quedas):
        m = figura_solta(c, f"Moeda caindo {k + 1}", "moeda", 520, 380, 110, t, t + 0.6)
        c.trilha(m, "y", [(t, 380 - 55, SUAVE), (t + 0.55, 560 - 55, None)])
    cofre(c, 520, 660, [(t0 + 0.3, 0)] + [(t + 0.55, k + 1) for k, t in enumerate(quedas)] + [(t_zero, 0)],
          t0 + 0.2, t1, w=440)
    caixa_em(c, "Começo", "a partida começa", 1000, 560, 440, t_zero, t1, fill=VERDE, cor=AMARELO, tam=38)
    caixa_em(c, "Zero", "moedas = 0", 1000, 720, 440, t_zero + 0.4, t1, tam=40)
    c.salvar("conceito-2-o-cofrinho")

    c, t0, t1 = cena("A pergunta do baú", "E o baú faz uma pergunta", "exatamente cinco?")
    t_dois = voz.palavra("Só que dá para perguntar", t0)
    t_pm = voz.palavra("pelo menos cinco", t_dois)
    t_ex = voz.palavra("exatamente cinco", t_dois)
    c.ideia("A pergunta do baú", t0 + 0.05, t_dois - 0.05, "sobre o número moedas")
    c.ideia("Dois jeitos de perguntar", t_dois, t1, None)
    figura_solta(c, "Baú", "bau-fechado", 420, 720, 380, t0 + 0.2, t1)
    pergunta(c, "Tem moedas suficientes?", 520, 420, 560, t0 + 0.5, t_dois, ponta_x=-100)
    caixa_em(c, "Pelo menos 5", "pelo menos 5?", 980, 560, 440, t_pm, t1, num=1, tam=42)
    caixa_em(c, "Exatamente 5", "exatamente 5?", 980, 720, 440, t_ex, t1, num=2, tam=42)
    c.salvar("conceito-3-a-pergunta-do-bau")

    c, t0, t1 = cena("Conta de novo?", "E se o personagem voltar", "na experiência.")
    t_acha = voz.palavra("O que você acha?", t0)
    c.ideia("Conta de novo?", t0 + 0.05, t1, "isso você vai testar na experiência", ts=t_acha)
    p = Painel(c, t0 + 0.1, t1, **PEQUENO)
    p.cenario(t0 + 0.1, t1)
    for k in range(2):
        p.vaga(k, t0 + 0.2, t1)
    for k in range(2, 5):
        p.moeda(k, t0 + 0.2, t1)
    p.personagem(t0 + 0.1, t1, [(t0 + 0.3, 140, TRILHA_Y), (t0 + 1.5, 60, TRILHA_Y)])
    cofre(c, DIREITA, 600, [(t0 + 0.3, 2)], t0 + 0.2, t1, w=300)
    interrogacao = c.texto("Interrogação", "?", DIREITA, 860, 140, AMARELO, ancora="middle", op=0)
    c.nos.append(interrogacao)
    c.mostra(interrogacao, t0 + 1.6, t1, pop=True)
    c.salvar("conceito-4-conta-de-novo")

    c, t0, t1 = cena("Sua vez de investigar", "Agora você vai investigar", "clique em Próxima parte.")
    t_baú = voz.palavra("e o que o baú responde", t0)
    t_zappy = voz.palavra("O Zappy vai", t0)
    c.ideia("Sua vez de investigar", t0 + 0.05, t1, "o Zappy vai mostrando o que testar")
    caixa_em(c, "Muda", "quando moedas muda", 560, 450, 620, t0 + 0.6, t1, num=1, tam=40)
    caixa_em(c, "Igual", "quando continua igual", 560, 610, 620, t0 + 1.6, t1, num=2, tam=40)
    caixa_em(c, "Responde", "o que o baú responde", 560, 770, 620, t_baú, t1, num=3, tam=40)
    zappy = no_chao(c, "Zappy", "zappy", 1080, 900, 0.62)
    vis(c, zappy, [(t_zappy, t1)])
    c.salvar("conceito-5-sua-vez-de-investigar")


def a1p4():
    c, t0, t1 = cena("O cofrinho no jogo", "Lembra da experiência da parte anterior?", "desde o começo da partida.")
    t_agora = voz.palavra("Agora a gente vai criar", t0)
    t_comeco = voz.palavra("O jogo precisa do cofrinho", t0)
    c.ideia("Lembra da experiência?", t0 + 0.05, t_agora - 0.05, "moedas começava em zero e mudava")
    c.ideia("O cofrinho no seu jogo", t_agora, t1, "desde o começo da partida")
    p = Painel(c, t0 + 0.1, t1, **PEQUENO)
    p.cenario(t0 + 0.1, t1)
    pts, pegas = caminhada(t0 + 0.6, min(t0 + 3.2, t_agora - 0.3), ate=2)
    p.personagem(t0 + 0.1, t1, pts + [(t_agora, 21, TRILHA_Y)])
    for k in range(5):
        p.moeda(k, t0 + 0.2, t_agora if k < 2 else t1, t_pega=pegas[k] if k < 2 else None)
    for k in range(2):
        p.moeda(k, t_agora, t1)
    cofre(c, DIREITA, 560, [(t0 + 0.4, 0)] + [(t, k + 1) for k, t in enumerate(pegas)] + [(t_agora, 0)], t0 + 0.2, t1,
          w=320)
    caixa_em(c, "Começo", "a partida começa", DIREITA, 780, 380, t_comeco, t1, fill=VERDE, cor=AMARELO, tam=34)
    c.salvar("conceito-1-o-cofrinho-no-jogo")

    c, t0, t1 = cena("Começa em zero", "Por que o cofrinho começa em zero?", "daqui a duas partes.")
    t_porque = voz.palavra("Porque, no começo da partida", t0)
    t_jogando = voz.palavra("Jogando, você ainda não vê", t0)
    c.ideia("Por que zero?", t0 + 0.05, t_porque - 0.05, None)
    c.ideia("Nenhuma moeda ainda", t_porque, t_jogando - 0.05, "no começo da partida")
    c.ideia("Ainda não aparece", t_jogando, t1, "o número vem daqui a duas partes")
    p = Painel(c, t0 + 0.1, t1, **PEQUENO)
    p.cenario(t0 + 0.1, t1)
    p.personagem(t0 + 0.1, t1, [(t0, 21, TRILHA_Y)])
    for k in range(6):
        p.moeda(k, t0 + 0.2, t1)
    p.bau(t0 + 0.2, t1)
    cofre(c, DIREITA, 640, [(t0 + 0.3, 0)], t0 + 0.2, t1, w=300)
    c.salvar("conceito-2-comeca-em-zero")


def a1p5():
    c, t0, t1 = cena("Um grupo de moedas", "Lembra da experiência da terceira parte", "com alguma moeda do grupo.")
    t_grupo = voz.palavra("As seis moedas estão num grupo", t0)
    t_regra = voz.palavra("Um grupo junta", t0)
    c.ideia("Cada moeda soma um", t0 + 0.05, t_grupo - 0.05, "e a que sumiu não conta de novo")
    c.ideia("Um grupo de moedas", t_grupo, t1, "uma regra para todas de uma vez", ts=t_regra)
    p = Painel(c, t0 + 0.1, t1, **PEQUENO)
    p.cenario(t0 + 0.1, t1)
    pts, pegas = caminhada(t0 + 0.6, min(t0 + 3.6, t_grupo - 0.4), ate=2)
    p.personagem(t0 + 0.1, t1, pts)
    for k in range(6):
        p.moeda(k, t0 + 0.2, t_grupo if k < 2 else t1, t_pega=pegas[k] if k < 2 else None)
    for k in range(2):
        p.moeda(k, t_grupo, t1)
    cofre(c, DIREITA, 640, [(t0 + 0.4, 0)] + [(t, k + 1) for k, t in enumerate(pegas)], t0 + 0.3, t_grupo)
    x0, y0 = p.ponto(80, 50)
    x1, y1 = p.ponto(372, 205)
    grupo = c.rect("Grupo", x0, y0, x1 - x0, y1 - y0, "none", rx=40, stroke=AMARELO, sw=7, op=0)
    grupo["attrs"]["stroke-dasharray"] = "24 16"
    c.nos.append(grupo)
    vis(c, grupo, [(t_grupo + 0.2, t1)])
    caixa_em(c, "Nome do grupo", "moedasDoCaminho", DIREITA, 640, 380, t_grupo + 0.4, t1, tam=36)
    c.salvar("conceito-1-um-grupo-de-moedas")


def a1p6():
    c, t0, t1 = cena("O número na tela", "Lembra da experiência da terceira parte", "na área Enquanto estiver rodando.")
    t_placar = voz.palavra("O placar precisa mostrar", t0)
    t_quadro = voz.palavra("Por isso, ele vai no bloco", t0)
    c.ideia("O número muda", t0 + 0.05, t_placar - 0.05, "durante a partida")
    c.ideia("O número na tela", t_placar, t1, "o de agora, o tempo todo")
    p = Painel(c, t0 + 0.1, t1, **PEQUENO)
    p.cenario(t0 + 0.1, t1)
    pts, pegas = caminhada(t_placar - 0.2, min(t_placar + 3.6, t1 - 0.8), ate=3)
    p.personagem(t0 + 0.1, t1, [(t0, 21, TRILHA_Y)] + pts)
    for k in range(5):
        p.moeda(k, t0 + 0.2, t1, t_pega=pegas[k] if k < 3 else None)
    p.placar([(t_placar, 0)] + [(t, k + 1) for k, t in enumerate(pegas)], t_placar, t1)
    caixa_em(c, "A cada quadro", "A cada quadro do jogo", DIREITA, 640, 380, t_quadro, t1, fill=VERDE, cor=AMARELO, tam=32)
    c.salvar("conceito-1-o-numero-na-tela")


def a1p7():
    c, t0, t1 = cena("A pergunta do baú", "Lembra da experiência da terceira parte", "como encostar numa moeda.")
    t_mais = voz.palavra("E, com mais de cinco moedas", t0)
    t_prim = voz.palavra("Primeiro, o jogo precisa perceber", t0)
    t_enc = voz.palavra("Chegar ao baú é um encontro", t0)
    c.ideia("Lembra da experiência?", t0 + 0.05, t_prim - 0.05, "com seis moedas")
    c.ideia("Chegar ao baú", t_prim, t1, "é um encontro")
    # Com seis moedas: pelo menos 5 abre, exatamente 5 não. Depois, o personagem chega ao baú no jogo.
    caixa_em(c, "Seis moedas", "Moedas: 6", 690, 420, 300, t0 + 0.6, t_prim, fill=NOITE, cor=BRANCO, tam=40)
    caixa_em(c, "Pelo menos", "pelo menos 5", 420, 560, 440, t_mais, t_prim, tam=40)
    caixa_em(c, "Exatamente", "exatamente 5", 960, 560, 440, t_mais + 0.5, t_prim, tam=40)
    figura_solta(c, "Aberto", "bau-aberto", 420, 800, 300, t_mais + 0.3, t_prim)
    figura_solta(c, "Fechado", "bau-fechado", 960, 800, 300, t_mais + 0.8, t_prim)
    certo(c, "Abre", 600, 900, t_mais + 0.6, t_prim, ok=True, r=50)
    certo(c, "Não abre", 1140, 900, t_mais + 1.1, t_prim, ok=False, r=50)
    p = Painel(c, t_prim, t1, **GRANDE)
    p.cenario(t_prim + 0.1, t1)
    p.bau(t_prim + 0.1, t1)
    chega = min(t_prim + 1.8, t_enc)
    p.personagem(t_prim + 0.1, t1, [(t_prim + 0.3, 21, TRILHA_Y), (chega, 30, 222)])
    caixa_em(c, "Encontro", "encontro", 640, 520, 300, t_enc, t1, fill=VERDE, cor=AMARELO)
    c.salvar("conceito-1-a-pergunta-do-bau")

    c, t0, t1 = cena("Uma condição", "Agora o baú vai fazer uma pergunta", "é o bloco Se.")
    t_cond = voz.palavra("se chama condição", t0)
    t_se = voz.palavra("Quem faz uma condição", t0)
    c.ideia("Sim ou não", t0 + 0.05, t_cond - 0.05, None)
    c.ideia("Uma condição", t_cond, t1, "quem faz no jogo é o bloco Se")
    figura_solta(c, "Baú", "bau-fechado", 400, 720, 300, t0 + 0.2, t1)
    pergunta(c, "Tem pelo menos 5 moedas?", 520, 420, 620, t0 + 0.4, t1, ponta_x=-120)
    caixa_em(c, "Sim", "sim", 900, 600, 220, t0 + 1.0, t1, fill=VERDE, cor=AMARELO)
    caixa_em(c, "Não", "não", 1160, 600, 220, t0 + 1.4, t1)
    caixa_em(c, "Condição", "condição", 1030, 760, 480, t_cond, t1, num=1, tam=40)
    caixa_em(c, "Bloco Se", "o bloco Se", 1030, 900, 480, t_se, t1, num=2, tam=40)
    c.salvar("conceito-2-uma-condicao")

    c, t0, t1 = cena("Cinco ou mais", "Agora o sinal.", "tracinho embaixo.")
    t_sinal = voz.palavra("O sinal que pergunta isso", t0)
    c.ideia("Pelo menos 5", t0 + 0.05, t1, "quer dizer cinco ou mais")
    for k, n in enumerate(range(3, 9)):
        t = t0 + 0.4 + 0.18 * k
        ok = n >= 5
        caixa_em(c, f"Número {n}", str(n), 220 + 170 * k, 520, 130, t, t1, fill=VERDE if ok else BRANCO,
                 cor=AMARELO if ok else TINTA, tam=56)
    # O sinal de maior ou igual desenhado (o "≥" pode não estar nas fontes da aula).
    sinal = c.grupo("Maior ou igual", 640, 760, [
        c.poly("maior", [(-60, -70), (50, -20), (-60, 30), (-60, 6), (14, -20), (-60, -46)], BRANCO),
        c.rect("tracinho", -60, 52, 110, 22, BRANCO, rx=8)], op=0)
    c.nos.append(sinal)
    c.mostra(sinal, t_sinal, t1, pop=True)
    caixa_em(c, "Nome do sinal", "maior ou igual", 1000, 760, 420, t_sinal + 0.3, t1, tam=40)
    c.salvar("conceito-3-cinco-ou-mais")

    c, t0, t1 = cena("Pelo menos 5", "Pronto: agora o Se pergunta", "como você viu na experiência.")
    t_ou = voz.palavra("ou seja", t0)
    t_seis = voz.palavra("Abre, sim", t0)
    t_igual = voz.palavra("Com o sinal de igual", t0)
    c.ideia("Pelo menos 5", t0 + 0.05, t_igual - 0.05, "com 5 abre, com 6 também")
    c.ideia("Com o igual, não", t_igual, t1, "com 6 moedas, o baú ficaria fechado")
    for k, (n, abre) in enumerate((("4", False), ("5", True), ("6", True))):
        y, t = 330 + 180 * k, t0 + 0.4 + 0.45 * k
        caixa_em(c, f"Moedas {n}", f"Moedas: {n}", 300, y + 60, 300, t, t1, fill=NOITE, cor=BRANCO, tam=40)
        tt = t_seis if n == "6" else t_ou
        figura_solta(c, f"Baú {n} fechado", "bau-fechado", 690, y + 60, 160, t, (tt + 0.2) if abre else t1)
        if abre:
            figura_solta(c, f"Baú {n} aberto", "bau-aberto", 690, y + 60, 160, tt + 0.2, t1, seco=True)
        certo(c, f"Resposta {n}", 1060, y + 60, tt, t1, ok=abre, r=46)
    caixa_em(c, "Igual", "com o sinal de igual, 6 não abre", 690, 960, 760, t_igual + 0.2, t1, tam=38)
    c.salvar("conceito-4-pelo-menos-5")


def a1p8():
    c, t0, t1 = cena("As duas respostas", "E, quando o baú abre", "as duas respostas!")
    t_agora = voz.palavra("Agora o aviso vai contar", t0)
    c.ideia("O aviso não conta", t0 + 0.05, t_agora - 0.05, None)
    c.ideia("As duas respostas", t_agora, t1, "o aviso conta o sim e o não")
    p = Painel(c, t0 + 0.1, t_agora, **PEQUENO)
    p.cenario(t0 + 0.1, t_agora)
    p.bau(t0 + 0.1, t_agora, t_abre=t0 + 0.7)
    p.aviso([(t0 + 0.2, "Junte moedas para o baú. Leve a chave ao farol.")], t_agora)
    figura_solta(c, "Aberto", "bau-aberto", 330, 520, 220, t_agora + 0.2, t1)
    caixa_em(c, "Sim", "Sim: O baú abriu!", 830, 520, 620, t_agora + 0.3, t1, fill=VERDE, cor=AMARELO, num=1, tam=40)
    figura_solta(c, "Fechado", "bau-fechado", 330, 780, 220, t_agora + 0.7, t1)
    caixa_em(c, "Não", "Não: pede pelo menos 5", 830, 780, 620, t_agora + 0.8, t1, num=2, tam=40)
    c.salvar("conceito-1-as-duas-respostas")

    c, t0, t1 = cena("O senão", "Para a resposta do não", "esse espaço agora.")
    t_so = voz.palavra("Só que o Se chega sem", t0)
    c.ideia("O espaço do não", t0 + 0.05, t1, "o senão")
    figura_solta(c, "Aberto", "bau-aberto", 330, 480, 200, t0 + 0.3, t1)
    caixa_em(c, "Então", "então: a resposta do sim", 830, 480, 640, t0 + 0.4, t1, fill=VERDE, cor=AMARELO, num=1, tam=38)
    figura_solta(c, "Fechado", "bau-fechado", 330, 700, 200, t0 + 0.9, t1)
    caixa_em(c, "Senão", "senão: a resposta do não", 830, 700, 640, t0 + 1.0, t1, num=2, tam=38)
    caixa_em(c, "Abrir", "o Se chega sem o senão: você abre", 690, 920, 760, t_so, t1, tam=36)
    c.salvar("conceito-2-o-senao")

    c, t0, t1 = cena("Pronto", "Pronto, você programou as moedas", "decide pela quantidade!")
    c.ideia("Moedas no caminho!", t0 + 0.05, t1, "você programou as moedas do caminho")
    regras_2d(c, voz.palavra("cada moeda conta", t0), voz.palavra("o número aparece", t0),
              voz.palavra("e o baú decide", t0), t1)
    c.salvar("conceito-3-pronto")


{(1, 1): a1p1, (1, 2): lambda: None, (1, 3): a1p3, (1, 4): a1p4, (1, 5): a1p5, (1, 6): a1p6, (1, 7): a1p7, (1, 8): a1p8,
 (2, 1): a2p1, (2, 2): a2p2, (2, 3): a2p3, (2, 4): a2p4, (2, 5): a2p5}[(AULA, PARTE)]()
