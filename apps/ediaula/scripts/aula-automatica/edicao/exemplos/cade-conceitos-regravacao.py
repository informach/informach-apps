"""As animações de conceito do Cadê Todo Mundo (regravação de 26/11/2026), as dez partes num arquivo. A Aula 1
também tem as cenas de exemplos/cade-conceitos.py (cade_cena.py), feitas em paralelo na outra máquina no mesmo dia.

Cada cena se ancora numa frase da voz (tempos_da_voz.Voz, já na linha do tempo da edição): grave a parte antes
de gerar. Cada cena procura a sua frase depois do fim da anterior. O jogo das cenas é desenhado com as artes
de verdade (cade_jogo_cena.py), e cada toque cai na palavra que o pede: o jogo pronto sendo jogado (Aula 2, Parte 1;
Aula 3, Parte 2) sai daqui, e não de um clipe gravado à parte, para a mão nunca chegar antes ou depois da fala.

Os blocos recortados da gravação ficam na pasta de blocos da parte, com o nome que a cena usa
(bloco-quando-tocar, bloco-montado-a1, bloco-montado-a2, bloco-criar-sprite); a cena que precisa de um bloco
que não está lá desenha só as artes.

Uso: cade-conceitos-regravacao.py <aula> <parte> <base.edisvg> <pasta dos blocos> <pasta de saída (pecas da parte)>
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from cade_jogo_cena import (  # noqa: E402
    ARTES_BICHO,
    ARTES_ESCONDERIJO,
    bicho,
    bola,
    centro,
    check,
    dedo,
    esconderijo,
    interrogacao,
    jardim,
    ligacao,
    painel,
    placar,
    placar_futebol,
    presente,
    sprite,
    toque,
    visibilidade,
)
from edisvg_cena import AMARELO, BRANCO, SUAVE, TINTA, VAIVEM, VERDE, Cena, mao_toque  # noqa: E402
from ilha_cena import mao, variavel  # noqa: E402
from jardim_cena import caixa_em, vis, zappy  # noqa: E402
from kit_cena import (  # noqa: E402
    anotacao,
    balao_fala,
    icone,
    largura_comum,
    moldura,
    raios,
    rotulo,
    selo,
    titulo,
    trilha,
)
from kit_cena import AMARELO_DEGRAU, anel, caixa_surpresa, seta  # noqa: E402
from zappy_kit import zappy_vivo  # noqa: E402
from cena_video import video_conceito  # noqa: E402
from tempos_da_voz import Voz  # noqa: E402

AULA, PARTE = int(sys.argv[1]), int(sys.argv[2])
BASE, BLOCOS, SAIDA = sys.argv[3:6]
voz = Voz.da_parte("cade", AULA, PARTE)
fim_anterior = 0.0
numero = 0


# A capa cobre os primeiros 3 s. Uma cena que começasse embaixo dela encurtava a capa no EdiAula (as duas na mesma
# faixa: Cadê A1P1, a capa ficou com 0,5 s); ela começa no fim da capa.
FIM_DA_CAPA = 3.0


def cena(nome, comeco, final):
    global fim_anterior
    t0, t1 = voz.trecho(comeco, final, depois=fim_anterior)
    t0 = max(t0, FIM_DA_CAPA)
    fim_anterior = t1
    return Cena(f"Conceito · {nome}", t0, t1, BASE, BLOCOS, SAIDA, fundo="fundo-cade"), t0, t1


def salvar(c, slug):
    global numero
    numero += 1
    c.salvar(f"conceito-{numero}-{slug}")


def tem_bloco(nome):
    return os.path.exists(os.path.join(BLOCOS, f"{nome}.png"))


def p(frase, depois):
    return voz.palavra(frase, depois)


def surpresa(c, t0, t1, cx=660, cy=640):
    presente(c, cx, cy, t0 + 0.2, t1)
    for k, (dx, dy) in enumerate(((-330, -160), (330, -120), (-300, 200), (310, 220))):
        from ilha_cena import estrela

        e = estrela(c, f"Brilho {k + 1}", cx + dx, cy + dy, 22)
        vis(c, e, [(t0 + 0.6 + 0.2 * k, t1)])


# ── Aula 1 ─────────────────────────────────────────────────────────────────────────────────────────────────
def a1p1():
    """Cadê A1P1 no kit (27/11/2026): o jogo apresentado com os bichos espiando, e depois os outros dois escondidos e
    a surpresa do fim do curso. Cada coisa na palavra que a fala diz; o Zappy de verdade, do EdiSVG."""
    # 1. O jogo (a capa cobre os primeiros 3 s): o título, o jardim e os bichos espiando atrás dos esconderijos.
    c, t0, t1 = cena("Cadê Todo Mundo", "Oi! Você vai construir", "vamos ver como ele funciona.")
    t_antes = p("Antes de montar o seu", t0)
    t_ver = p("vamos ver como ele funciona", t_antes)
    titulo(c, [("Cadê ", False), ("Todo Mundo", True), ("?", False)], t0 + 0.05, t1)
    painel(c, t0 + 0.05, t1)
    for k in range(3):
        b = bicho(c, k, t0 + 0.1, t1)
        y = b["transform"]["y"]
        ti = t_antes + 0.45 * k
        c.trilha(b, "y", [(ti, y, None), (ti + 0.3, y - 125, VAIVEM), (ti + 0.9, y - 125, None), (ti + 1.2, y, None)])
    for k in range(3):
        esconderijo(c, k, t0 + 0.1, None, t1)
    x2, y2 = centro(2)
    mao_toque(c, [(t_ver + 0.9, x2, y2 + 30)], t_ver, t1)
    salvar(c, "cade-todo-mundo")

    # 2. Os outros dois ficam para a criança; e a surpresa do fim do curso, numa caixa que chacoalha.
    c, t0, t1 = cena("A surpresa", "Esses eu deixo para você descobrir", "ainda mais seu.")
    t_desc = p("descobrir", t0)
    t_coisa = p("Ah, e tem mais uma coisa", t_desc)
    t_fim = p("No fim do curso", t_coisa)
    t_surpresa = p("surpresa", t_fim)
    t_esperando = p("esperando", t_surpresa)
    t_seu = p("Ela vai deixar o seu jogo", t_esperando)
    titulo(c, [("E os ", False), ("outros dois", True), ("?", False)], t0 + 0.05, t_desc - 0.05)
    titulo(c, [("Para você ", False), ("descobrir", True)], t_desc, t_coisa - 0.05)
    painel(c, t0, t_coisa - 0.05)
    bicho(c, 0, t0, t_coisa - 0.05)
    for k in (1, 2):
        bicho(c, k, t0, t_coisa - 0.05)
        esconderijo(c, k, t0, None, t_coisa - 0.05)
        cx, cy = centro(k)
        rotulo(c, f"Quem? {k}", "?", cx, cy - 190, t0 + 0.4 + 0.3 * k, t_coisa - 0.05, estilo="escuro", tam="g",
               largura=110)
    x0, y0 = centro(0)
    raios(c, "Achado", x0, y0 + 40, 110, t0 + 0.3, t_coisa - 0.05)
    titulo(c, [("Mais uma ", False), ("coisa", True)], t_coisa, t_surpresa - 0.05)
    titulo(c, [("Uma ", False), ("surpresa", True), (" no fim", False)], t_surpresa, t1)
    _, cabeca = zappy_vivo(c, "falando", 110, 500, 300, t_coisa, t1, falas=[(t_seu, t1 - 0.2)])
    rotulo(c, "No fim do curso", "No fim do curso", 860, 470, t_fim, t1, estilo="termo")
    caixa_surpresa(c, 860, 930, t_surpresa, t1, chacoalha=[t_esperando, t_seu + 0.8])
    balao_fala(c, "Mais seu", "Seu jogo ainda mais seu!", cabeca, t_seu, t1, tam=40, maxw=360)
    salvar(c, "a-surpresa")


def a1p2():
    """Cadê A1P2 no kit (27/11/2026): o material do passo a passo com os recortes da página de verdade."""
    # 1. Esqueceu um passo? Volte ao material: a capa de verdade, a mão abre e aparecem as páginas.
    c, t0, t1 = cena("Volte aqui", "Então, se você esquecer algum passo", "abrir o material.")
    t_esq = p("esquecer algum passo", t0)
    t_volta = p("é só voltar aqui", t_esq)
    t_abrir = p("abrir o material", t_volta)
    titulo(c, [("Esqueceu um ", False), ("passo", True), ("?", False)], t_esq, t_volta - 0.05)
    titulo(c, [("Volte ao ", False), ("material", True)], t_volta, t1)
    zappy_vivo(c, "pensando", 110, 520, 300, t0 + 0.1, t1)
    capa, _ = c.bloco("material-cade-capa", 640, 300, 1.25, fundo=BRANCO, pad=12)
    c.mostra(capa, t_volta + 0.1, t_abrir + 0.35, pop=True)
    mao_toque(c, [(t_abrir, 640 + 137 * 1.25, 300 + 250 * 1.25)], t_volta + 0.4, t_abrir + 0.6)
    paginas, _ = c.bloco("material-cade-paginas", 470, 300, 0.62, fundo=BRANCO, pad=12)
    c.mostra(paginas, t_abrir + 0.3, t1, pop=True)
    salvar(c, "volte-aqui")

    # 2. Baixado: o material vai para a pasta, para ler onde quiser.
    c, t0, t1 = cena("Guardar", "o material e consultar onde quiser", "consultar onde quiser.")
    t_onde = p("onde quiser", t0)
    titulo(c, [("Leia ", False), ("onde quiser", True)], t0 + 0.05, t1)
    capa, _ = c.bloco("material-cade-capa", 300, 330, 1.0, fundo=BRANCO, pad=10)
    c.mostra(capa, t0 + 0.05, t1)
    c.trilha(capa, "x", [(t0 + 0.4, 300, SUAVE), (t0 + 1.0, 560, None)])
    c.trilha(capa, "y", [(t0 + 0.4, 330, SUAVE), (t0 + 1.0, 420, None)])
    for prop in ("sx", "sy"):
        c.trilha(capa, prop, [(t0 + 0.4, 1.0, SUAVE), (t0 + 1.0, 0.55, None)])
    seta(c, "Baixar", (900, 330), (900, 560), t0 + 0.1, t1)
    pasta = c.grupo("Pasta", 900, 760, [c.rect("degrau", -200, -84, 400, 220, AMARELO_DEGRAU, rx=26),
                                         c.rect("aba", -180, -112, 150, 56, "#F2B33D", rx=16),
                                         c.rect("pasta", -200, -90, 400, 220, AMARELO, rx=26)], op=0)
    c.nos.append(pasta)
    c.mostra(pasta, t0 + 0.2, t1, pop=True)
    selo(c, "Guardado", 1060, 650, t_onde, t1)
    salvar(c, "guardar")


def a1p3():
    """Cadê A1P3 no kit (27/11/2026): parte de experiência, toda em animação. A analogia das cócegas usa o vídeo de
    verdade (cena_video.py) e depois os dois quadros dele lado a lado, com Ação e Reação apontadas."""
    global fim_anterior, numero
    # 1. Uma ideia importante: ação e reação.
    c, t0, t1 = cena("Ação e reação", "Nesta parte, a gente vai entender", "a ação e a reação.")
    t_acao = p("a ação", t0)
    t_reacao = p("e a reação", t_acao)
    titulo(c, [("Uma ", False), ("ideia importante", True)], t0 + 0.05, t_acao - 0.05)
    titulo(c, [("Ação", True), (" e ", False), ("reação", True)], t_acao, t1)
    zappy_vivo(c, "pensando", 100, 480, 340, t0 + 0.1, t1)
    icone(c, "Ação", 470, 360, 290, "#FFC02E", "#C98F00", "mao-indicador", 215, t_acao, t1)
    rotulo(c, "Ação", "Ação", 615, 720, t_acao + 0.1, t1, estilo="acao", largura=240)
    trilha(c, "Ação para reação", (790, 505), (855, 450), (920, 505), t_acao + 0.4, t1, n=5)
    icone(c, "Reação", 940, 360, 290, "#0B7A54", "#075A3D", "coelho", 225, t_reacao, t1)
    rotulo(c, "Reação", "Reação", 1085, 720, t_reacao + 0.1, t1, estilo="reacao", largura=240)
    salvar(c, "acao-e-reacao")

    # 2. As cócegas: o vídeo de verdade (a mãe faz cócegas e a menina ri).
    t0, _ = voz.trecho("Sabe quando alguém faz cócegas", "parar de rir?", depois=fim_anterior)
    t_cocega = p("A cócega é a ação", t0)
    numero += 1
    video = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "artes", "videos",
                         "cocegas-acao-e-reacao.mp4")
    video_conceito("Cócegas", "cocegas", t0, round(t_cocega, 2), video, BASE, BLOCOS, SAIDA, numero,
                   titulos=[([("As ", False), ("cócegas", True)], p("cócegas", t0)),
                            ([("Não para de ", False), ("rir", True)], p("parar de rir", t0))])
    fim_anterior = t_cocega - 0.08

    # 3. A cócega é a ação, a risada é a reação: os dois quadros do vídeo lado a lado.
    c, t0, t1 = cena("Cócega e risada", "A cócega é a ação", "a risada é a reação.")
    t_acao = p("é a ação", t0)
    t_risada = p("e a risada é a reação", t_acao)
    t_reacao = p("é a reação", t_risada)
    titulo(c, [("A cócega é a ", False), ("ação", True)], t0 + 0.05, t_risada - 0.05)
    titulo(c, [("A risada é a ", False), ("reação", True)], t_risada, t1)
    E = 560 / 960
    g, _ = c.bloco("cocegas-acao", 80, 360, E, fundo=BRANCO, pad=12)
    c.mostra(g, t0 + 0.05, t1, pop=True)
    anel(c, "Mãos", 80 + 0.40 * 560, 360 + 0.68 * 315, 62, t_acao, t1)
    rotulo(c, "Ação", "Ação: a cócega", 80 + 280, 740, t_acao + 0.1, t1, estilo="acao")
    g, _ = c.bloco("cocegas-reacao", 700, 360, E, fundo=BRANCO, pad=12)
    c.mostra(g, t_risada, t1, pop=True)
    anel(c, "Risada", 700 + 0.36 * 560, 360 + 0.40 * 315, 78, t_reacao, t1)
    rotulo(c, "Reação", "Reação: a risada", 700 + 280, 740, t_reacao + 0.1, t1, estilo="reacao")
    trilha(c, "Cócega para risada", (600, 330), (660, 280), (720, 330), t_risada + 0.2, t1, n=5)
    salvar(c, "cocega-e-risada")

    # 4. No seu jogo: o toque é a ação; a reação que a gente quer é o esconderijo ficar invisível; ligada ao toque.
    c, t0, t1 = cena("O toque", "No seu jogo, o toque é a ação", "ligada ao toque para acontecer.")
    t_toque = p("o toque é a ação", t0)
    t_quer = p("A reação que a gente quer", t_toque)
    t_inv = p("ficar invisível", t_quer)
    t_apar = p("para aparecer quem está atrás dele", t_inv)
    t_essa = p("Essa reação precisa estar ligada", t_apar)
    t_lig = p("ligada ao toque", t_essa)
    titulo(c, [("No seu ", False), ("jogo", True)], t0 + 0.05, t_essa - 0.05)
    titulo(c, [("Ligada ao ", False), ("toque", True)], t_essa, t1)
    painel(c, t0, t_essa - 0.05)
    x0, y0 = centro(0)
    for k in range(3):
        bicho(c, k, t0, t_essa - 0.05)
        esconderijo(c, k, t0, t_inv if k == 0 else None, t_essa - 0.05)
    mao_toque(c, [(t_toque + 0.3, x0, y0 + 30), (t_inv - 0.3, x0, y0 + 30)], t_toque - 0.2, t_inv + 0.5)
    larg = largura_comum(c, ["Ação: o toque", "Reação: ficar invisível"])
    anotacao(c, "Ação", "Ação: o toque", (x0 + 40, y0 + 120), t_toque + 0.4, t_essa - 0.05, estilo="acao",
             centro=(x0 + 470, y0 + 200), largura=larg)
    anotacao(c, "Reação", "Reação: ficar invisível", (x0, y0 - 30), t_inv + 0.2, t_essa - 0.05, estilo="reacao",
             centro=(x0 + 470, y0 - 220), largura=larg)
    raios(c, "Apareceu", x0, y0 + 40, 110, t_apar, t_essa - 0.05)
    icone(c, "Toque", 330, 400, 230, "#FFC02E", "#C98F00", "mao-indicador", 170, t_essa + 0.1, t1)
    rotulo(c, "Toque", "Toque", 445, 700, t_essa + 0.2, t1, estilo="acao", largura=220)
    icone(c, "Some", 900, 400, 230, "#FFFFFF", "#B9C6D9", "arbusto", 170, t_essa + 0.4, t1, op_arte=30)
    rotulo(c, "Some", "Some", 1015, 700, t_essa + 0.5, t1, estilo="reacao", largura=220)
    seta(c, "Ligada", (590, 515), (870, 515), t_lig, t1)
    rotulo(c, "Ligada", "Ligada", 730, 440, t_lig + 0.3, t1, estilo="escuro")
    salvar(c, "o-toque")

    # 5. Agora você investiga: ligada, o bicho aparece; sem ligar, nada acontece. O Zappy mostra o que testar.
    c, t0, t1 = cena("Investigue", "Agora você vai investigar", "repetir quando quiser.")
    t_inv = p("investigar", t0)
    t_ligada = p("quando a reação está ligada a ele", t_inv)
    t_nao = p("e quando não está", t_ligada)
    t_zappy = p("vai te mostrando", t_nao)
    t_rep = p("você pode repetir", t_zappy)
    titulo(c, [("Hora de ", False), ("investigar", True)], t_inv, t1)
    # "o que um toque faz no jardim": o toque e a pergunta, antes de Ligada e Sem ligar (a cena ficava vazia ali).
    t_toque = p("o que um toque faz", t_inv)
    icone(c, "Toque", 470, 330, 300, "#FFC02E", "#C98F00", "mao-indicador", 215, t_toque, t_ligada - 0.1)
    rotulo(c, "Toque", "Toque", 620, 700, t_toque + 0.1, t_ligada - 0.1, estilo="acao", largura=240)
    q = c.texto("Pergunta", "?", 900, 560, 220, BRANCO, ancora="middle", op=0)  # branco: o amarelo some no azul
    c.nos.append(q)
    c.mostra(q, p("faz", t_toque), t_ligada - 0.1, pop=True)
    icone(c, "Ligada", 340, 330, 300, "#0B7A54", "#075A3D", "coelho", 235, t_ligada, t_zappy - 0.1)
    rotulo(c, "Com ligação", "Ligada", 490, 700, t_ligada + 0.1, t_zappy - 0.1, estilo="reacao", largura=260)
    selo(c, "Funciona", 620, 345, t_ligada + 0.5, t_zappy - 0.1)
    icone(c, "Sem ligar", 820, 330, 300, "#FFFFFF", "#B9C6D9", "arbusto", 220, t_nao, t_zappy - 0.1)
    rotulo(c, "Sem ligação", "Sem ligar", 970, 700, t_nao + 0.1, t_zappy - 0.1, estilo="escuro", largura=260)
    selo(c, "Nada", 1100, 345, t_nao + 0.4, t_zappy - 0.1, ok=False)
    _, cabeca = zappy_vivo(c, "falando", 300, 460, 360, t_zappy - 0.1, t1,
                           falas=[(t_zappy, t_rep - 0.1), (t_rep, t1 - 0.2)])
    balao_fala(c, "Testar", "Eu te mostro o que testar!", cabeca, t_zappy, t_rep - 0.05, tam=42, maxw=420)
    balao_fala(c, "Repetir", "Pode repetir quando quiser!", cabeca, t_rep, t1, tam=42, maxw=420)
    salvar(c, "investigue")


def a1p4():
    """Cadê A1P4 no kit aprovado (27/11/2026): fundo do Cadê, título solto com marca-texto, o Zappy com o balão do
    EdiAula, molduras e raios. Cada coisa entra na palavra que a fala diz."""
    x0, y0 = centro(0)
    # 1. Lembra da experiência: a mão toca o arbusto, ele some e o coelho aparece; ação e reação apontadas.
    c, t0, t1 = cena("Lembra da experiência", "Lembra da experiência da parte anterior", "esconderijos do seu jogo!")
    t_so = p("O toque só deixava", t0)
    t_inv = p("invisível", t_so)
    t_agora = p("Agora a gente vai fazer isso", t_inv)
    titulo(c, [("Lembra da ", False), ("experiência", True), ("?", False)], t0 + 0.05, t_agora - 0.05)
    titulo(c, [("Agora no ", False), ("seu jogo", True)], t_agora, t1)
    painel(c, t0, t1)
    for k in range(3):
        bicho(c, k, t0 + 0.05, t1)
        esconderijo(c, k, t0 + 0.05, t_inv if k == 0 else None, t1)
    mao_toque(c, [(t_inv - 0.25, x0, y0 + 30)], t_so, t_inv + 1.0)
    larg = largura_comum(c, ["Ação: o toque", "Reação: sumir"])
    anotacao(c, "Ação", "Ação: o toque", (x0 + 40, y0 + 120), t_so + 0.3, t1, estilo="acao", centro=(x0 + 400, y0 + 200),
             largura=larg)
    anotacao(c, "Reação", "Reação: sumir", (x0, y0 - 30), t_inv + 0.2, t1, estilo="reacao", centro=(x0 + 400, y0 - 220),
             largura=larg)
    salvar(c, "lembra-da-experiencia")

    # 2. Comandos (Helena, 27/11/2026): nada dos comandos antes de a fala dizer "comandos"; o destaque é o bloco, e o
    # Zappy (o de verdade, do EdiSVG, menor) é complemento. Primeiro o jogo esperando uma ordem e o Zappy pensando;
    # em "comandos", o título e o bloco de verdade, grande, e o Zappy fala; em "aparecem como blocos", a etiqueta
    # Bloco aponta para ele.
    c, t0, t1 = cena("Comandos", "Para fazer isso, a gente precisa dizer", "que aqui aparecem como blocos")
    t_dizer = p("dizer ao jogo o que ele deve fazer", t0)
    t_cmd = p("comandos", t_dizer)
    t_blocos = p("aparecem como blocos", t_cmd)
    titulo(c, [("Dizer ao jogo ", False), ("o que fazer", True)], t_dizer, t_cmd - 0.05)
    titulo(c, [("Os ", False), ("comandos", True)], t_cmd, t1)
    # A troca de pose cruza: o pensando só sai depois que o falando já entrou (sem piscar).
    zappy_vivo(c, "pensando", 120, 560, 280, t0 + 0.1, t_cmd + 0.3)
    icone(c, "Jogo esperando", 600, 330, 300, BRANCO, "#B9C6D9", "arbusto", 230, t0 + 0.3, t_cmd - 0.1)
    rotulo(c, "Que faço?", "?", 930, 330, t0 + 0.8, t_cmd - 0.1, estilo="escuro", tam="g", largura=110)
    _, cabeca = zappy_vivo(c, "falando", 120, 560, 280, t_cmd, t1, falas=[(t_cmd + 0.1, t_blocos - 0.1)], pop=False)
    balao_fala(c, "Comando", "Comando é uma ordem para o jogo!", cabeca, t_cmd + 0.15, t1, tam=42, maxw=440)
    BX, BY, E = 380, 290, 1.1
    g, _ = c.bloco("bloco-quando-tocar", BX, BY, E)
    c.mostra(g, t_cmd + 0.1, t1, pop=True)
    anotacao(c, "Bloco", "Bloco", (BX + 560, BY + 150 * E + 18), t_blocos, t1, estilo="termo", centro=(BX + 640, BY + 330))
    salvar(c, "comandos")

    # 3. Quem percebe o toque, o sprite e o escolhido.
    c, t0, t1 = cena("Sprite e escolhido", "É ele que percebe", "esconderijo que você tocar.")
    t_sprite = p("Cada esconderijo é um sprite", t0)
    t_esc = p("E escolhido é o nome", t_sprite)
    titulo(c, [("Quem ", False), ("percebe", True), (" o toque", False)], t0 + 0.05, t_sprite - 0.05)
    E, BX, BY = 1.4, 150, 420
    g, _ = c.bloco("bloco-quando-tocar", BX, BY, E)
    c.mostra(g, t0 + 0.1, t_sprite - 0.05)
    moldura(c, "Quando tocar", BX + 2 * E, BY + 10 * E, BX + 382 * E, BY + 64 * E, t0 + 0.6, t_sprite - 0.05)
    titulo(c, [("Cada esconderijo é um ", False), ("sprite", True)], t_sprite, t_esc - 0.05, tam=80)
    painel(c, t_sprite, t1)
    for k in range(3):
        esconderijo(c, k, t_sprite, None, t1)
        cx, cy = centro(k)
        rotulo(c, f"Sprite {k + 1}", "Sprite", cx, cy - 175, t_sprite + 0.4 + 0.3 * k, t_esc - 0.05, tam="p")
    titulo(c, [("O ", False), ("escolhido", True)], t_esc, t1)
    x1, y1 = centro(1)
    mao_toque(c, [(t_esc + 0.4, x1, y1 + 30)], t_esc, t_esc + 1.4)
    raios(c, "Escolhido", x1, y1, 150, t_esc + 0.5, t1)
    anotacao(c, "Escolhido", "escolhido", (x1, y1 - 120), t_esc + 0.6, t1, estilo="codigo", centro=(x1 + 340, y1 - 230))
    salvar(c, "sprite-e-escolhido")

    # 4. Zero de visibilidade: o número desce de 100 a 0 e o coelho aparece.
    c, t0, t1 = cena("Zero de visibilidade", "Com zero de visibilidade, o esconderijo fica invisível", "que está atrás dele.")
    t_ver = p("e aí dá para ver", t0)
    titulo(c, [("Zero", True), (" de visibilidade", False)], t0 + 0.05, t1)
    painel(c, t0, t1)
    bicho(c, 0, t0 + 0.05, t1)
    g = esconderijo(c, 0, t0 + 0.05, None, t1, trilha=False)
    c.trilha(g, "opacity", [(t0, 0, None), (t0 + 0.28, 100, None), (t0 + 0.8, 100, None), (t0 + 1.3, 50, None),
                            (t0 + 1.9, 50, None), (t0 + 2.4, 0, None)])
    for k in (1, 2):
        bicho(c, k, t0 + 0.05, t1)
        esconderijo(c, k, t0 + 0.05, None, t1)
    for valor, ta, tb in (("100%", t0 + 0.2, t0 + 1.3), ("50%", t0 + 1.3, t0 + 2.4), ("0%", t0 + 2.4, t1)):
        rotulo(c, f"Visibilidade {valor}", valor, x0, y0 - 230, ta, tb, estilo="escuro", tam="g", largura=230)
    bx, by = x0, y0 + 40
    raios(c, "Coelho", bx, by, 110, t_ver, t1)
    rotulo(c, "Apareceu", "Apareceu!", bx + 330, by - 250, t_ver + 0.3, t1, estilo="reacao")
    salvar(c, "zero-de-visibilidade")

    # 5. Confira: cada parte do bloco ganha a moldura, e o item igual embaixo ganha o certo.
    c, t0, t1 = cena("Confira", "volte aos blocos e confira", "o número é 0.")
    t_dentro = p("o bloco está dentro", t0)
    t_sprite = p("o sprite é escolhido", t_dentro)
    t_num = p("o número é 0", t_sprite)
    titulo(c, [("Confira", True), (" os blocos", False)], t0 + 0.05, t1)
    E, BX, BY = 1.4, 150, 380
    g, _ = c.bloco("bloco-montado-a1", BX, BY, E)
    c.mostra(g, t0 + 0.1, t1)
    em = lambda px, py: (BX + px * E, BY + py * E)
    itens = (("Dentro", "termo", t_dentro, em(66, 74), em(610, 144)),
             ("escolhido", "codigo", t_sprite, em(214, 84), em(332, 132)),
             ("0", "escuro", t_num, em(378, 86), em(440, 130)))
    larg = largura_comum(c, [(t, e) for t, e, *_ in itens])
    for k, (texto, estilo, t, a, b) in enumerate(itens):
        moldura(c, texto, *a, *b, t, t1)
        cx = 690 - (len(itens) * larg + (len(itens) - 1) * 80) / 2 + larg / 2 + k * (larg + 80)
        rotulo(c, f"Item {texto}", texto, cx, 860, t, t1, estilo=estilo, largura=larg)
        selo(c, f"Certo {texto}", cx + larg / 2 - 8, 812, t + 0.4, t1, r=36)
    salvar(c, "confira")

    # 6. A primeira regra (o Zappy comemora, e a sequência da regra) e a surpresa que está chegando. Cada coisa na sua
    # palavra (Helena, 27/11/2026): o balão em "programou", o título em "primeira regra"; a caixa-surpresa entra
    # fechada em "surpresa", chacoalha em "quase chegando", o Zappy fala "Na próxima aula!" na hora em que a fala diz,
    # e a tampa abre com luz logo depois.
    c, t0, t1 = cena("A primeira regra", "Pronto, você já programou", "o que é.")
    t_prog = p("programou", t0)
    t_regra = p("primeira regra", t_prog)
    t_lembra = p("E lembra da surpresa", t_regra)
    t_surpresa = p("surpresa", t_lembra)
    t_quase = p("quase chegando", t_surpresa)
    t_prox = p("Na próxima aula", t_quase)
    titulo(c, [("A primeira ", False), ("regra", True)], t_regra, t_lembra - 0.05)
    _, cabeca = zappy_vivo(c, "celebrando", 110, 480, 320, t0 + 0.1, t_lembra - 0.05)
    balao_fala(c, "Programou", "Você programou!", cabeca, t_prog, t_lembra - 0.05, tam=50, maxw=420)
    passos = (("Toque", "mao-indicador", "#FFC02E", "#C98F00", 100, 120), ("Some", "arbusto", "#FFFFFF", "#B9C6D9", 30, 110),
              ("Aparece", "coelho", "#0B7A54", "#075A3D", 100, 120))
    for k, (nome, arte, cor, deg, op, alt) in enumerate(passos):
        x = 560 + k * 250
        icone(c, nome, x, 560, 190, cor, deg, arte, int(alt * 1.25), t_regra + 0.2 + 0.4 * k, t_lembra - 0.05, op_arte=op)
        rotulo(c, f"Passo {nome}", nome, x + 95, 840, t_regra + 0.3 + 0.4 * k, t_lembra - 0.05, largura=210)
    trilha(c, "Regra 1", (762, 655), (780, 615), (798, 655), t_regra + 0.6, t_lembra - 0.05, n=3)
    trilha(c, "Regra 2", (1012, 655), (1030, 615), (1048, 655), t_regra + 1.0, t_lembra - 0.05, n=3)
    titulo(c, [("Lembra da ", False), ("surpresa", True), ("?", False)], t_surpresa, t_quase - 0.05)
    titulo(c, [("Está ", False), ("chegando", True), ("!", False)], t_quase, t1)
    zappy_vivo(c, "pensando", 110, 520, 300, t_lembra, t_prox + 0.3)
    _, cabeca = zappy_vivo(c, "falando", 110, 520, 300, t_prox, t1, falas=[(t_prox, t_prox + 1.2)], pop=False)
    balao_fala(c, "Surpresa", "Na próxima aula!", cabeca, t_prox, t1, tam=44, maxw=360)
    # Abre quando a fala diz que vem na próxima aula (Helena: "quando eu falar que já tá chegando, que na próxima
    # aula vai ter, às vezes ela abre"), com tempo para a luz e os brilhos antes do fim da cena.
    caixa_surpresa(c, 860, 930, t_surpresa, t1, chacoalha=[t_quase, t_quase + 0.75], abre=t_prox + 0.5)
    salvar(c, "a-primeira-regra")


# ── Aula 2 ─────────────────────────────────────────────────────────────────────────────────────────────────
def a2p1():
    c, t0, t1 = cena("Contar", "Hoje você vai ensinar", "que você encontra.")
    c.ideia("Hoje: contar", t0 + 0.05, t1, "os personagens que você encontra")
    jardim(c, t0, t1, achados=[(t0, 0), (t0 + 1.2, 1), (t0 + 2.0, 2), (t0 + 2.8, 3)],
           toques=[(t0 + 1.2, 0), (t0 + 2.0, 1), (t0 + 2.8, 2)])
    salvar(c, "contar")
    # O jardim do jeito que ficou na Aula 1: o toque na palavra, o personagem aparece e Achados fica no zero.
    c, t0, t1 = cena("O jardim da Aula 1", "Olha aqui o jardim", "e o personagem aparece.")
    # No jogo a reação é na hora do toque: o dedo toca em "esconderijo" e ele some ali mesmo; "invisível" e "o
    # personagem aparece" ganham o destaque cada um na sua palavra.
    t_toca = p("esconderijo", p("eu toco num esconderijo", t0))
    t_inv = p("invisível", t_toca)
    t_aparece = p("o personagem aparece", t_inv)
    c.ideia("O jardim da Aula 1", t0 + 0.05, t1, None)
    painel(c, t0, t1)
    coelho = None
    for k in range(3):
        b = bicho(c, k, t0 + 0.05, t1)
        coelho = coelho or b
        esconderijo(c, k, t0 + 0.05, t_toca if k == 0 else None, t1)
    for p_ in ("sx", "sy"):
        e = coelho["transform"]["sx"]
        c.trilha(coelho, p_, [(t_aparece, e, VAIVEM), (t_aparece + 0.2, 1.18 * e, VAIVEM), (t_aparece + 0.45, e, None)])
    dedo(c, *centro(0), t0 + 0.3, t_toca, t_toca + 0.9)
    cx, cy = centro(0)
    caixa_em(c, "Invisível", "invisível", cx, cy - 190, 280, t_inv, t1, fill=VERDE, cor=AMARELO, tam=40)
    placar(c, [(t0, 0)], t1, destaque=(t_aparece + 0.4, t1))
    salvar(c, "o-jardim-da-aula-1")
    # Depois do Dedé: o número ainda não conta.
    c, t0, t1 = cena("Ainda não conta", "É que o jogo ainda não conta", "cada personagem encontrado.")
    t_agora = p("Então, agora a gente vai fazer", t0)
    c.ideia("O jogo ainda não conta", t0 + 0.05, t_agora - 0.05, None)
    c.ideia("Agora: contar cada um", t_agora, t1, None)
    painel(c, t0, t1)
    for k in range(3):
        bicho(c, k, t0 + 0.05, t1)
        if k:
            esconderijo(c, k, t0 + 0.05, t_agora + 0.8 * k, t1)
    placar(c, [(t0, 0), (t_agora + 0.3, 1), (t_agora + 1.1, 2), (t_agora + 1.9, 3)], t1)
    salvar(c, "ainda-nao-conta")


def a2p2():
    """A parte de experiência: toda em animação."""
    c, t0, t1 = cena("Variável", "Para contar os personagens", "um valor que pode mudar.")
    t_var = p("A gente chama esse lugar de variável", t0)
    t_muda = p("que pode mudar", t_var)
    c.ideia("Variável", t0 + 0.05, t1, "guarda um valor que pode mudar", ts=t_var)
    variavel(c, "Variável", "achados", 660, 640, [(t_var + 0.3, "0", TINTA), (t_muda, "1", VERDE)], w=480,
             t0=t_var, t1=t1)
    salvar(c, "variavel")

    c, t0, t1 = cena("Placar", "Sabe o placar de um jogo de futebol", "aumenta em um.")
    t_outro = p("Quando sai outro gol", t0)
    t_aumenta = p("o número aumenta em um", t_outro)
    c.ideia("O placar", t0 + 0.05, t1, "mostra quantos gols já aconteceram")
    placar_futebol(c, 660, 560, t0 + 0.2, t1, [(t0 + 0.2, 1, 0), (t_aumenta, 2, 0)])
    bola(c, 300, 900, t_outro - 0.3, t_aumenta + 0.3, para=(t_aumenta, 480, 600))
    caixa_em(c, "Mais um", "+1", 480, 830, 160, t_aumenta + 0.1, t1, fill=VERDE, cor=AMARELO, tam=52)
    salvar(c, "placar")

    c, t0, t1 = cena("Achados", "No jardim, a variável achados", "que já estava guardado.")
    t_placar = p("O placar mostra esse valor", t0)
    t_cada = p("Cada novo personagem", t_placar)
    c.ideia("A variável achados", t0 + 0.05, t1, None)
    jardim(c, t0, t1, toques=[(t_cada + 0.6, 0)], achados=[(t_placar, 0), (t_cada + 0.6, 1)])
    variavel(c, "Variável", "achados", 1010, 1000, [(t0 + 0.3, "0", TINTA), (t_cada + 0.6, "1", VERDE)], w=300,
             t0=t0 + 0.2, t1=t1)
    salvar(c, "achados")

    c, t0, t1 = cena("Investigue", "Agora você vai investigar", "repetir quando quiser.")
    t_zappy = p("O Zappy vai te mostrando", t0)
    c.ideia("Investigue", t0 + 0.05, t1, "quando o número muda e quando fica igual")
    jardim(c, t0, t1, achados=[(t0, 0)])
    interrogacao(c, 300, 420, t0 + 0.5, t1)
    zappy(c, t_zappy, t1, px=1160, py=960, s=0.42)
    salvar(c, "investigue")


def a2p3():
    c, t0, t1 = cena("Lembra da experiência", "Lembra da experiência da parte anterior", "contar do mesmo jeito!")
    t_cada = p("Cada personagem encontrado", t0)
    t_agora = p("Agora a gente vai fazer", t_cada)
    c.ideia("Lembra?", t0 + 0.05, t_agora - 0.05, "cada personagem somava um")
    c.ideia("Agora no seu jogo", t_agora, t1, None)
    passo = max(0.6, (t_agora - t_cada) / 3.2)
    ts = [t_cada + 0.3 + passo * k for k in range(3)]
    jardim(c, t0, t1, toques=[(t, k) for k, t in enumerate(ts)], achados=[(t0, 0)] + [(t, k + 1) for k, t in enumerate(ts)])
    salvar(c, "lembra-da-experiencia")

    c, t0, t1 = cena("Um achado", "O número 1 já está certo", "cada personagem vale um achado.")
    c.ideia("Somar 1", t0 + 0.05, t1, "cada personagem vale um achado")
    variavel(c, "Variável", "achados", 660, 660, [(t0 + 0.3, "0", TINTA), (t0 + 1.0, "1", VERDE)], w=420,
             t0=t0 + 0.2, t1=t1)
    caixa_em(c, "Mais um", "+1", 1000, 560, 160, t0 + 0.9, t1, fill=VERDE, cor=AMARELO, tam=52)
    salvar(c, "um-achado")

    c, t0, t1 = cena("A mensagem", "E quem faz essa mensagem aparecer", "Achados chega a 3.")
    t_chega = p("quando Achados chega a 3", t0)
    c.ideia("A contagem faz a mensagem", t0 + 0.05, t1, None)
    jardim(c, t0, t1, achados_antes=(0, 1, 2), mensagem=t0 + 0.2)
    placar(c, [(t0, 3)], t1, destaque=(t_chega, t1))
    caixa_em(c, "Quando 3", "Achados chega a 3", 660, 1010, 520, t_chega, t1, fill=AMARELO, tam=42)
    salvar(c, "a-mensagem")

    c, t0, t1 = cena("Mesmo lugar", "É que o esconderijo invisível", "não conta duas vezes.")
    t_mesmo = p("então o mesmo personagem", t0)
    c.ideia("Não conta duas vezes", t0 + 0.05, t1, "o esconderijo invisível não recebe toque")
    painel(c, t0, t1)
    for k in range(3):
        bicho(c, k, t0 + 0.05, t1)
    placar(c, [(t0, 3)], t1, destaque=(t_mesmo, t1))
    toque(c, *centro(0), t0 + 0.8)
    caixa_em(c, "Continua 3", "continua em 3", 660, 1010, 420, t_mesmo, t1, fill=VERDE, cor=AMARELO, tam=42)
    salvar(c, "mesmo-lugar")

    c, t0, t1 = cena("Confira", "volte aos blocos e confira", "soma 1 em achados.")
    t_dois = p("os dois blocos estão dentro", t0)
    t_prim = p("primeiro o esconderijo", t_dois)
    t_abaixo = p("logo abaixo", t_prim)
    c.ideia("Confira", t0 + 0.05, t1, None)
    if tem_bloco("bloco-montado-a2"):
        g, _ = c.bloco("bloco-montado-a2", 170, 300, 2.0)
        vis(c, g, [(t0 + 0.1, t1)])
    for k, (t, texto) in enumerate(((t_dois, "os dois dentro de Quando clicar ou tocar"),
                                    (t_prim, "primeiro: fica invisível"), (t_abaixo, "logo abaixo: soma 1 em achados"))):
        caixa_em(c, f"Item {k + 1}", texto, 640, 660 + 130 * k, 980, t, t1, num=k + 1, tam=36)
        check(c, 1170, 660 + 130 * k, t + 0.4, t1)
    salvar(c, "confira")


def a2p4():
    c, t0, t1 = cena("A surpresa", "Chegou a surpresa", "onde cada um vai ficar.")
    t_agora = p("Agora você pode escolher", t0)
    c.ideia("Chegou a surpresa!", t0 + 0.05, t1, "você escolhe quem se esconde e onde", ts=t_agora)
    presente(c, 660, 640, t0 + 0.1, t_agora + 0.6, abre=t0 + 0.6)
    jardim(c, t_agora + 0.5, t1, artes_bicho=["gato", "sapo", "esquilo"], artes_esc=["toco", "cogumelo", "folhas"])
    salvar(c, "a-surpresa")

    c, t0, t1 = cena("Bichos e esconderijos", "No Passo a passo do projeto", "fica no seu jogo.")
    t_msg = p("E a mensagem do final", t0)
    t_tudo = p("Tudo o que você mudar", t_msg)
    c.ideia("Bichos e esconderijos", t0 + 0.05, t_msg - 0.05, "com o nome de cada um")
    for k, nome in enumerate(("coelho", "raposa", "coruja", "gato", "sapo", "tartaruga", "esquilo")):
        g = sprite(c, nome, nome, 0, 0, 72)
        g["transform"].update({"x": 130 + 165 * k, "y": 330, "sx": 0.42, "sy": 0.42})
        c.mostra(g, t0 + 0.2 + 0.12 * k, t_msg, pop=True)
        r = c.texto(f"Nome · {nome}", nome, 130 + 165 * k + 60, 525, 30, BRANCO, familia="Nunito", peso=800,
                    ancora="middle", op=0)
        c.nos.append(r)
        vis(c, r, [(t0 + 0.4 + 0.12 * k, t_msg)])
    for k, nome in enumerate(("arbusto", "pedras", "flores", "toco", "cogumelo", "folhas")):
        g = sprite(c, nome, nome, 0, 0, 161)
        g["transform"].update({"x": 130 + 195 * k, "y": 600, "sx": 0.27, "sy": 0.27})
        c.mostra(g, t0 + 0.9 + 0.12 * k, t_msg, pop=True)
        r = c.texto(f"Nome · {nome}", nome, 130 + 195 * k + 87, 800, 30, BRANCO, familia="Nunito", peso=800,
                    ancora="middle", op=0)
        c.nos.append(r)
        vis(c, r, [(t0 + 1.1 + 0.12 * k, t_msg)])
    c.ideia("A mensagem também", t_msg, t_tudo - 0.05, None)
    caixa_em(c, "Mensagem", "Você achou todo mundo!", 660, 640, 760, t_msg + 0.2, t_tudo, fill=BRANCO, tam=46)
    c.ideia("Fica no seu jogo", t_tudo, t1, None)
    jardim(c, t_tudo, t1, artes_bicho=["gato", "sapo", "esquilo"], artes_esc=["toco", "cogumelo", "folhas"])
    salvar(c, "bichos-e-esconderijos")

    c, t0, t1 = cena("Mesmo tamanho", "Isso acontece porque todos os bichos", "no lugar do antigo.")
    c.ideia("Todos do mesmo tamanho", t0 + 0.05, t1, "o desenho novo cabe no lugar do antigo")
    painel(c, t0, t1)
    t_troca = t0 + 1.2
    for k in range(3):
        bicho(c, k, t0 + 0.05, t1)
    esconderijo(c, 0, t0 + 0.05, None, t_troca)
    esconderijo(c, 0, t_troca, None, t1, arte="toco")
    for k in (1, 2):
        esconderijo(c, k, t0 + 0.05, None, t1)
    x0, y0 = centro(0)
    moldura = c.rect("Mesmo lugar", x0 - 145, y0 - 130, 290, 260, "none", rx=16, stroke=AMARELO, sw=7, op=0)
    c.nos.append(moldura)
    c.pisca(moldura, t0 + 0.5, t1)
    salvar(c, "mesmo-tamanho")

    c, t0, t1 = cena("O tipo da imagem", "Se algum bicho aparecer antes do toque", "esconderijo no bloco do esconderijo.")
    t_aqui = p("Aí é só clicar de novo", t0)
    c.ideia("Cada um no seu tipo", t0 + 0.05, t1, None)
    painel(c, t0, t1)
    # A imagem do tipo errado: um esconderijo no lugar de um bicho fica por cima, grande demais.
    bicho(c, 0, t0 + 0.05, t1)
    esconderijo(c, 0, t0 + 0.05, None, t1)
    errado = sprite(c, "Esconderijo no bloco do bicho", "cogumelo", 101 - 44, 181 - 40, 161)
    vis(c, errado, [(t0 + 0.6, t_aqui)])
    caixa_em(c, "Errado", "tipo errado", 300, 370, 320, t0 + 0.8, t_aqui, fill=AMARELO, tam=40)
    for k in (1, 2):
        bicho(c, k, t0 + 0.05, t1)
        esconderijo(c, k, t0 + 0.05, None, t1)
    caixa_em(c, "Bicho", "bicho no bloco do bicho", 420, 1010, 560, t_aqui + 0.3, t1, num=1, tam=36)
    caixa_em(c, "Esconderijo", "esconderijo no do esconderijo", 960, 1010, 600, t_aqui + 0.9, t1, num=2, tam=36)
    salvar(c, "o-tipo-da-imagem")

    c, t0, t1 = cena("Com a sua cara", "O jogo ficou com a sua cara", "publicar no Mural.")
    c.ideia("Com a sua cara!", t0 + 0.05, t1, "é essa versão que vai para o Mural")
    jardim(c, t0, t1, toques=[(t0 + 0.4, 0), (t0 + 0.9, 1), (t0 + 1.4, 2)], achados=[(t0, 3)], mensagem=t0 + 1.6,
           artes_bicho=["gato", "sapo", "esquilo"], artes_esc=["toco", "cogumelo", "folhas"])
    salvar(c, "com-a-sua-cara")


def a2p5():
    c, t0, t1 = cena("Pronto", "Seu jogo está pronto", "continuar a jornada sem publicar.")
    t_mural = p("você pode publicar no Mural", t0)
    t_conc = p("Você também pode clicar em Concluir", t_mural)
    c.ideia("Seu jogo está pronto!", t0 + 0.05, t1, None)
    caixa_em(c, "Publicar", "publicar no Mural", 660, 520, 560, t_mural, t1, num=1)
    caixa_em(c, "Concluir", "ou concluir sem publicar", 660, 680, 640, t_conc, t1, num=2)
    salvar(c, "pronto")

    c, t0, t1 = cena("No Mural", "Seu jogo está no Mural", "o jogo que você criou.")
    c.ideia("No Mural!", t0 + 0.05, t1, "família e amigos podem jogar")
    jardim(c, t0, t1, toques=[(t0 + 0.8, 0), (t0 + 1.4, 1)], achados=[(t0, 0), (t0 + 0.8, 1), (t0 + 1.4, 2)])
    salvar(c, "no-mural")


# ── Aula 3 (certificado) ───────────────────────────────────────────────────────────────────────────────────
def a3p2():
    # O jogo pronto sendo jogado, com os três personagens encontrados: cada toque na palavra da fala.
    c, t0, t1 = cena("O seu jogo", "Você terminou", "Parabéns pelo seu jogo!")
    t_olha = p("Olha só o que você programou", t0)
    t_toque = p("o toque que faz cada personagem aparecer", t_olha)
    t_cont = p("e a contagem dos achados", t_toque)
    t_regras = p("São essas regras", t_cont)
    t_parab = p("Parabéns pelo seu jogo", t_regras)
    c.ideia("Você terminou!", t0 + 0.05, t_olha - 0.05, "Cadê Todo Mundo")
    c.ideia("O que você programou", t_olha, t_parab - 0.05, None)
    c.ideia("Parabéns!", t_parab, t1, None)
    # Primeiro toque no "toque", o segundo no "aparecer" e o último na "contagem", que chega a 3 com a mensagem.
    toques = [p("toque", t_olha), p("aparecer", t_toque), p("contagem", t_cont)]
    jardim(c, t0, t1, toques=[(t, k) for k, t in enumerate(toques)], achados=[(t0, 0)] + [(t, k + 1) for k, t in enumerate(toques)],
           mensagem=toques[2] + 0.3)
    caixa_em(c, "Regra 1", "toque: aparece", 380, 1010, 380, t_toque + 0.2, t1, num=1, tam=38)
    caixa_em(c, "Regra 2", "contagem dos achados", 900, 1010, 520, t_cont + 0.2, t1, num=2, tam=38)
    salvar(c, "o-seu-jogo")


PARTES = {(1, 1): a1p1, (1, 2): a1p2, (1, 3): a1p3, (1, 4): a1p4, (2, 1): a2p1, (2, 2): a2p2, (2, 3): a2p3,
          (2, 4): a2p4, (2, 5): a2p5, (3, 2): a3p2}
PARTES[(AULA, PARTE)]()
