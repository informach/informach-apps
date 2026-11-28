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
    gx,
    gy,
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
from kit_cena import AMARELO_DEGRAU, anel, caixa_surpresa, mais_um, seta  # noqa: E402
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
    # Menos de 1,5 s de tela entre duas cenas vira uma piscada (a tela entra e sai com duas transições, Cadê A2P1,
    # 28/11/2026): a cena começa onde a anterior acaba. O place_cutaway põe uma cena por vez e não cobre essa sobra.
    if fim_anterior and 0 < t0 - fim_anterior < 1.5:
        t0 = fim_anterior
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
    icone(c, "Ação", 470, 360, 290, "#FFFFFF", "#B9C6D9", "mao-indicador", 215, t_acao, t1)
    rotulo(c, "Ação", "Ação", 615, 720, t_acao + 0.1, t1, estilo="acao", largura=240)
    trilha(c, "Ação para reação", (790, 505), (855, 450), (920, 505), t_acao + 0.4, t1, n=5)
    icone(c, "Reação", 940, 360, 290, "#0B7A54", "#075A3D", "coelho", 225, t_reacao, t1)
    rotulo(c, "Reação", "Reação", 1085, 720, t_reacao + 0.1, t1, estilo="reacao", largura=240)
    salvar(c, "acao-e-reacao")

    # 2. As cócegas: o vídeo de verdade (a mãe faz cócegas e a menina ri).
    t_frase, _ = voz.trecho("Sabe quando alguém faz cócegas", "parar de rir?", depois=fim_anterior)
    t0 = fim_anterior if 0 < t_frase - fim_anterior < 1.5 else t_frase  # sem a piscada de tela entre as cenas
    t_cocega = p("A cócega é a ação", t_frase)
    numero += 1
    video = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "artes", "videos",
                         "cocegas-acao-e-reacao.mp4")
    video_conceito("Cócegas", "cocegas", t0, round(t_cocega, 2), video, BASE, BLOCOS, SAIDA, numero,
                   titulos=[([("As ", False), ("cócegas", True)], p("cócegas", t_frase)),
                            ([("Não para de ", False), ("rir", True)], p("parar de rir", t_frase))])
    fim_anterior = round(t_cocega, 2)

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
    icone(c, "Toque", 330, 400, 230, "#FFFFFF", "#B9C6D9", "mao-indicador", 170, t_essa + 0.1, t1)
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
    icone(c, "Toque", 470, 330, 300, "#FFFFFF", "#B9C6D9", "mao-indicador", 215, t_toque, t_ligada - 0.1)
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
    passos = (("Toque", "mao-indicador", "#FFFFFF", "#B9C6D9", 100, 120), ("Some", "arbusto", "#FFFFFF", "#B9C6D9", 30, 110),
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
def pulo(c, g, t, alto=1.18):
    """O pulinho de uma peça (cresce e volta) em t, para apontar "este aqui"."""
    for eixo in ("sx", "sy"):
        e = g["transform"][eixo]
        c.trilha(g, eixo, [(t, e, VAIVEM), (t + 0.2, alto * e, VAIVEM), (t + 0.45, e, None)])
    return g


def toques_contando(c, ts, t1, valores_antes=0, mais=True):
    """A mão toca cada esconderijo num tempo de `ts` e o placar sobe um a cada toque, com o "+1" e os raios no
    personagem que aparece. Devolve os valores do placar para quem quiser usar."""
    pontos = []
    for k, t in enumerate(ts):
        x, y = centro(k)
        pontos.append((t, x, y + 30))
        toque(c, x, y, t)
        raios(c, f"Achado {k + 1}", x, y + 40, 110, t + 0.35, min(t + 1.4, t1))
        if mais:
            mais_um(c, f"Achado {k + 1}", x, y - 150, t + 0.35)  # em cima de quem apareceu: nunca dois juntos
    if ts:
        mao_toque(c, pontos, ts[0] - 0.4, min(ts[-1] + 0.8, t1))
    return [(t + 0.15, valores_antes + k + 1) for k, t in enumerate(ts)]


def a2p1():
    """Cadê A2P1 no kit (28/11/2026): hoje o jogo vai contar; o jardim do jeito que ficou na Aula 1, com o número
    parado no zero (a pergunta do Dedé por cima); e por que ele não conta ainda. Cada coisa na sua palavra."""
    # 1. Hoje: contar os personagens (a capa cobre os 3 primeiros segundos).
    # A frase quase toda fica debaixo da capa (sobra menos de 2 s): sem mão, só o placar subindo e os esconderijos
    # abrindo, um a um, até o fim da frase.
    c, t0, t1 = cena("Contar", "Hoje você vai ensinar", "que você encontra.")
    titulo(c, [("Hoje: ", False), ("contar", True)], t0 + 0.05, t1)
    painel(c, t0 + 0.05, t1)
    for k in range(3):
        bicho(c, k, t0 + 0.05, t1)
    passo = max(0.3, (t1 - t0 - 0.5) / 3)
    ts = [t0 + 0.25 + passo * k for k in range(3)]
    for k in range(3):
        esconderijo(c, k, t0 + 0.05, ts[k], t1, sumir=0.25)
    placar(c, [(t0 + 0.05, 0)] + [(t + 0.15, k + 1) for k, t in enumerate(ts)], t1)
    salvar(c, "contar")

    # 2. O jardim da Aula 1: o toque no "esconderijo", ele fica invisível, o personagem aparece; e o número parado
    # no zero, que o Dedé pergunta (ele aparece por cima, à esquerda; o anel fica no número).
    c, t0, t1 = cena("O jardim da Aula 1", "Olha aqui o jardim", "ficou no zero?")
    t_toca = p("esconderijo", p("eu toco num esconderijo", t0))
    t_inv = p("invisível", t_toca)
    t_aparece = p("o personagem aparece", t_inv)
    t_zero = p("ficou no zero", t_aparece)
    titulo(c, [("O jardim da ", False), ("Aula 1", True)], t0 + 0.05, t_aparece + 0.8)
    titulo(c, [("E o ", False), ("número", True), ("?", False)], t_aparece + 0.85, t1)
    painel(c, t0 + 0.05, t1)
    x0, y0 = centro(0)
    for k in range(3):
        bicho(c, k, t0 + 0.1, t1)
        esconderijo(c, k, t0 + 0.1, t_toca if k == 0 else None, t1)
    toque(c, x0, y0, t_toca)
    mao_toque(c, [(t_toca, x0, y0 + 30)], t0 + 0.4, t_toca + 0.8)
    anotacao(c, "Invisível", "Ficou invisível", (x0, y0 - 40), t_inv, t_aparece + 0.8, estilo="reacao",
             centro=(x0 + 420, y0 - 220))
    raios(c, "Apareceu", x0, y0 + 40, 110, t_aparece, t_aparece + 1.2)
    placar(c, [(t0 + 0.1, 0)], t1, destaque=(t_aparece + 0.9, t1))
    rotulo(c, "Ainda zero", "Ainda zero", gx(330), gy(30), t_zero, t1, estilo="escuro")
    salvar(c, "o-jardim-da-aula-1")

    # 3. O jogo ainda não conta; agora a gente vai fazer o número contar cada personagem encontrado.
    c, t0, t1 = cena("Ainda não conta", "É que o jogo ainda não conta", "cada personagem encontrado.")
    t_agora = p("Então, agora a gente vai fazer", t0)
    t_cada = p("cada personagem encontrado", t_agora)
    titulo(c, [("Ainda não ", False), ("conta", True)], t0 + 0.05, t_agora - 0.05)
    titulo(c, [("Agora: ", False), ("contar", True), (" cada um", False)], t_agora, t1)
    painel(c, t0 + 0.05, t1)
    selo(c, "Não conta", gx(225), gy(30), t0 + 0.6, t_agora - 0.05, ok=False)
    for k in range(3):
        bicho(c, k, t0 + 0.1, t1)
    passo = max(0.45, min(0.7, (t1 - t_agora - 0.8) / 3))
    ts = [max(t_agora + 0.4, t_cada - 0.6) + passo * k for k in range(3)]
    for k in range(3):
        esconderijo(c, k, t0 + 0.1, ts[k], t1)
    placar(c, [(t0 + 0.1, 0)] + toques_contando(c, ts, t1), t1, destaque=(t0 + 0.5, t_agora - 0.05))
    salvar(c, "ainda-nao-conta")


def a2p2():
    """Cadê A2P2 no kit (28/11/2026), parte de experiência, toda em animação: a variável guarda um valor que muda,
    o placar do futebol, a variável achados no jardim e a investigação com o Zappy."""
    # 1. Guardar um número: a variável.
    c, t0, t1 = cena("Variável", "Para contar os personagens", "um valor que pode mudar.")
    t_num = p("guardar um número", t0)
    t_var = p("variável", p("A gente chama esse lugar", t_num))
    t_guarda = p("Ela guarda um valor", t_var)
    t_muda = p("que pode mudar", t_guarda)
    titulo(c, [("Guardar um ", False), ("número", True)], t0 + 0.05, t_var - 0.05)
    titulo(c, [("Uma ", False), ("variável", True)], t_var, t1)
    zappy_vivo(c, "pensando", 110, 520, 300, t0 + 0.1, t1)
    variavel(c, "Variável", "Achados", 760, 600, [(t_num + 0.4, "0", TINTA), (t_muda + 0.2, "1", VERDE)], w=480,
             t0=t_num, t1=t1, cor_nome=TINTA)
    mais_um(c, "Muda", 1060, 520, t_muda + 0.2)
    rotulo(c, "Guarda", "Guarda um valor", 760, 800, t_guarda + 0.1, t1, estilo="termo")
    salvar(c, "variavel")

    # 2. O placar do futebol: mostra quantos gols; saiu outro gol, aumenta em um.
    c, t0, t1 = cena("Placar", "Sabe o placar de um jogo de futebol", "aumenta em um.")
    t_mostra = p("Ele mostra quantos gols", t0)
    t_outro = p("Quando sai outro gol", t_mostra)
    t_aumenta = p("o número aumenta em um", t_outro)
    titulo(c, [("O ", False), ("placar", True)], t0 + 0.05, t1)
    placar_futebol(c, 680, 600, t0 + 0.2, t1, [(t0 + 0.2, 1, 0), (t_aumenta, 2, 0)], s=1.45)
    anel(c, "Gols", 680 - 261, 600 + 87, 130, t_mostra + 0.2, t_outro)
    bola(c, 200, 960, t_outro - 0.2, t_aumenta + 0.4, para=(t_aumenta, 420, 720))
    mais_um(c, "Gol", 420, 420, t_aumenta + 0.1)
    raios(c, "Gol", 420, 690, 170, t_aumenta, t1)
    salvar(c, "placar")

    # 3. No jardim: a variável achados guarda quantos personagens; o placar mostra; cada novo soma um.
    c, t0, t1 = cena("Achados", "No jardim, a variável achados", "que já estava guardado.")
    t_quantos = p("guarda quantos personagens", t0)
    t_placar = p("O placar mostra esse valor", t_quantos)
    t_cada = p("Cada novo personagem", t_placar)
    t_guardado = p("que já estava guardado", t_cada)
    titulo(c, [("A variável ", False), ("achados", True)], t0 + 0.05, t1)
    painel(c, t0 + 0.05, t1)
    for k in range(3):
        bicho(c, k, t0 + 0.1, t1)
    t_toca = t_cada + 0.5
    for k in range(3):
        esconderijo(c, k, t0 + 0.1, t_toca if k == 0 else None, t1)
    # A variável no céu do jardim (à direita fica a apresentadora): a seta leva o valor dela ao placar.
    caixa_var = variavel(c, "Variável", "Achados", gx(500), gy(75), [(t0 + 0.4, "0", TINTA), (t_toca + 0.15, "1", VERDE)],
                         w=280, t0=t0 + 0.3, t1=t1, cor_nome=TINTA)
    # "guarda quantos personagens": um anel em volta da variável (a caixa já tem a trilha de escala da entrada).
    anel(c, "Guarda", gx(500), gy(75), 175, t_quantos, t_placar)
    seta(c, "Mostra", (gx(500) - 160, gy(75)), (gx(200), gy(40)), t_placar, t1)
    placar(c, [(t0 + 0.1, 0)] + toques_contando(c, [t_toca], t1), t1, destaque=(t_placar, t_cada))
    rotulo(c, "Soma um", "Soma 1 ao que já estava", 660, 1010, t_guardado, t1, estilo="reacao")
    salvar(c, "achados")

    # 4. Agora você investiga: quando o número muda e quando continua igual; o Zappy mostra o que testar.
    c, t0, t1 = cena("Investigue", "Agora você vai investigar", "repetir quando quiser.")
    t_inv = p("investigar", t0)
    t_muda = p("quando esse número muda", t_inv)
    t_igual = p("quando continua igual", t_muda)
    t_zappy = p("vai te mostrando", t_igual)
    t_rep = p("você pode repetir", t_zappy)
    titulo(c, [("Hora de ", False), ("investigar", True)], t_inv, t1)
    icone(c, "Muda", 340, 330, 300, "#0B7A54", "#075A3D", "coelho", 235, t_muda, t_zappy - 0.1)
    rotulo(c, "Muda", "Muda: +1", 490, 700, t_muda + 0.1, t_zappy - 0.1, estilo="reacao", largura=260)
    icone(c, "Igual", 820, 330, 300, "#FFFFFF", "#B9C6D9", "arbusto", 220, t_igual, t_zappy - 0.1, op_arte=30)
    rotulo(c, "Igual", "Fica igual", 970, 700, t_igual + 0.1, t_zappy - 0.1, estilo="escuro", largura=260)
    _, cabeca = zappy_vivo(c, "falando", 300, 460, 360, t_zappy - 0.1, t1,
                           falas=[(t_zappy, t_rep - 0.1), (t_rep, t1 - 0.2)])
    balao_fala(c, "Testar", "Eu te mostro o que testar!", cabeca, t_zappy, t_rep - 0.05, tam=42, maxw=420)
    balao_fala(c, "Repetir", "Pode repetir quando quiser!", cabeca, t_rep, t1, tam=42, maxw=420)
    salvar(c, "investigue")


def a2p3():
    """Cadê A2P3 no kit (28/11/2026): o que o jogo vai fazer (contar como na experiência), o 1 do bloco, a contagem
    que faz a mensagem, o mesmo lugar que não conta duas vezes e como conferir os blocos."""
    # 1. Lembra da experiência: cada personagem somava um. Agora no seu jogo.
    c, t0, t1 = cena("Lembra da experiência", "Lembra da experiência da parte anterior", "contar do mesmo jeito!")
    t_cada = p("Cada personagem encontrado", t0)
    t_agora = p("Agora a gente vai fazer", t_cada)
    titulo(c, [("Lembra da ", False), ("experiência", True), ("?", False)], t0 + 0.05, t_agora - 0.05)
    titulo(c, [("Agora no ", False), ("seu jogo", True)], t_agora, t1)
    painel(c, t0 + 0.05, t1)
    for k in range(3):
        bicho(c, k, t0 + 0.1, t1)
    passo = max(0.5, min(0.75, (t_agora - t_cada - 0.3) / 3))
    ts = [t_cada + 0.3 + passo * k for k in range(3)]
    for k in range(3):
        esconderijo(c, k, t0 + 0.1, ts[k], t1)
    placar(c, [(t0 + 0.1, 0)] + toques_contando(c, ts, t1), t1)
    salvar(c, "lembra-da-experiencia")

    # 2. O 1 do bloco já está certo: cada personagem vale um achado.
    c, t0, t1 = cena("Um achado", "O número 1 já está certo", "cada personagem vale um achado.")
    t_cada = p("cada personagem vale um achado", t0)
    titulo(c, [("Somar ", False), ("1", True)], t0 + 0.05, t_cada - 0.05)
    titulo(c, [("Cada um vale ", False), ("um achado", True)], t_cada, t1)
    if tem_bloco("somar-1"):
        g, _ = c.bloco("somar-1", 160, 380, 2.6)
        c.mostra(g, t0 + 0.1, t1, pop=True)
        anel(c, "O 1", 160 + 75.5 * 2.6, 380 + 29 * 2.6, 36, t0 + 0.5, t1)  # o campo do 1 no recorte
    bicho(c, 0, t_cada, t1)
    variavel(c, "Variável", "Achados", 1000, 700, [(t_cada, "0", TINTA), (t_cada + 0.6, "1", VERDE)], w=360,
             t0=t_cada, t1=t1, cor_nome=TINTA)
    mais_um(c, "Um", 1230, 620, t_cada + 0.6)
    salvar(c, "um-achado")

    # 3. A contagem faz a mensagem: ela aparece quando Achados chega a 3 (o toque na mensagem fica na tela antes).
    c, t0, t1 = cena("A mensagem", "a contagem que você acabou de montar", "Achados chega a 3.")
    t_chega = p("quando Achados chega a 3", t0)
    titulo(c, [("A ", False), ("contagem", True), (" faz a mensagem", False)], t0 + 0.05, t1)
    jardim(c, t0, t1, achados_antes=(0, 1, 2), mensagem=t_chega)
    placar(c, [(t0, 2), (t_chega - 0.4, 3)], t1, destaque=(t_chega - 0.4, t1))
    mais_um(c, "Três", gx(235), gy(30), t_chega - 0.4)
    moldura(c, "Mensagem", gx(174) - 14, gy(72) - 52, gx(174) + 560, gy(72) + 18, t_chega + 0.2, t1)
    salvar(c, "a-mensagem")

    # 4. O mesmo lugar não conta duas vezes: o esconderijo invisível não recebe outro toque.
    c, t0, t1 = cena("Mesmo lugar", "É que o esconderijo invisível", "não conta duas vezes.")
    t_nao = p("não recebe outro toque", t0)
    t_mesmo = p("então o mesmo personagem", t_nao)
    titulo(c, [("Não conta ", False), ("duas vezes", True)], t0 + 0.05, t1)
    painel(c, t0 + 0.05, t1)
    for k in range(3):
        bicho(c, k, t0 + 0.1, t1)
    x0, y0 = centro(0)
    toque(c, x0, y0, t_nao)
    mao_toque(c, [(t_nao, x0, y0 + 30)], t0 + 0.4, t_nao + 0.9)
    anotacao(c, "Sem toque", "Invisível: não recebe toque", (x0 + 30, y0 + 40), t_nao + 0.2, t1, estilo="escuro",
             centro=(x0 + 480, y0 + 190))
    placar(c, [(t0 + 0.1, 3)], t1, destaque=(t_mesmo, t1))
    rotulo(c, "Continua 3", "Continua em 3", gx(330), gy(30), t_mesmo + 0.2, t1, estilo="reacao")
    salvar(c, "mesmo-lugar")

    # 5. Confira os blocos: os dois dentro de Quando clicar ou tocar, primeiro fica invisível, logo abaixo soma 1.
    c, t0, t1 = cena("Confira", "volte aos blocos e confira", "soma 1 em achados.")
    t_dois = p("os dois blocos estão dentro", t0)
    t_prim = p("primeiro o esconderijo", t_dois)
    t_abaixo = p("logo abaixo", t_prim)
    titulo(c, [("Confira os ", False), ("blocos", True)], t0 + 0.05, t1)
    if tem_bloco("bloco-montado-a2"):
        g, _ = c.bloco("bloco-montado-a2", 160, 290, 2.2)
        c.mostra(g, t0 + 0.1, t1, pop=True)
    larg = largura_comum(c, ["1. Os dois dentro", "2. Primeiro: invisível", "3. Depois: soma 1"]) + 24
    for k, (t, texto) in enumerate(((t_dois, "1. Os dois dentro"), (t_prim, "2. Primeiro: invisível"),
                                    (t_abaixo, "3. Depois: soma 1"))):
        rotulo(c, f"Item {k + 1}", texto, 620, 700 + 120 * k, t, t1, estilo="termo", largura=larg)
        selo(c, f"Certo {k + 1}", 620 + larg / 2 + 60, 700 + 120 * k, t + 0.4, t1)
    salvar(c, "confira")


def a2p4():
    """Cadê A2P4 no kit (28/11/2026): a surpresa abre; o Passo a passo com os bichos e os esconderijos, com o nome
    de cada um; o desenho novo cabe no lugar do antigo; cada imagem no seu tipo; e o jogo com a cara da criança."""
    novos_b, novos_e = ["gato", "sapo", "esquilo"], ["toco", "cogumelo", "folhas"]
    # 1. Chegou a surpresa: a caixa chacoalha e abre; você escolhe quem se esconde e onde.
    # "Chegou a surpresa! Agora você pode escolher" é dito debaixo da capa: a cena abre com a caixa já abrindo, e o
    # jardim novo entra logo depois (as palavras são buscadas desde o começo da voz).
    c, t0, t1 = cena("A surpresa", "Chegou a surpresa", "onde cada um vai ficar.")
    t_agora = max(t0 + 1.4, p("Agora você pode escolher", 0))
    t_onde = p("onde cada um vai ficar", 0)
    titulo(c, [("Chegou a ", False), ("surpresa", True), ("!", False)], t0 + 0.05, t_agora - 0.05)
    titulo(c, [("Você ", False), ("escolhe", True)], t_agora, t1)
    caixa_surpresa(c, 660, 880, t0 + 0.1, t_agora + 0.2, chacoalha=[t0 + 0.2], abre=t0 + 0.7)
    jardim(c, t_agora + 0.3, t1, artes_bicho=novos_b, artes_esc=novos_e)
    rotulo(c, "Quem", "Quem se esconde", gx(160), gy(30), t_agora + 0.6, t1, estilo="acao")
    rotulo(c, "Onde", "E onde", gx(470), gy(30), t_onde, t1, estilo="acao")
    salvar(c, "a-surpresa")

    # 2. No Passo a passo: os bichos e os esconderijos com o nome de cada um; a mensagem também; fica no seu jogo.
    c, t0, t1 = cena("Bichos e esconderijos", "No Passo a passo do projeto", "fica no seu jogo.")
    t_bichos = p("os bichos", t0)
    t_esc = p("e os esconderijos", t_bichos)
    t_msg = p("E a mensagem do final", t_esc)
    t_tudo = p("Tudo o que você mudar", t_msg)
    titulo(c, [("No ", False), ("Passo a passo", True)], t0 + 0.05, t_msg - 0.05)
    # Os bichos numa faixa azul (o coelho branco sumia no branco) e os esconderijos numa branca (o arbusto verde
    # sumia no azul): contraste dos desenhos, 28/11/2026.
    for nome_f, y_f, h_f, cor_f, deg_f in (("Bichos", 260, 300, "#9DBDE6", "#6F93C4"),
                                           ("Esconderijos", 590, 340, BRANCO, "#B9C6D9")):
        for no in (c.rect(f"Faixa · {nome_f} · degrau", 90, y_f + 10, 1150, h_f, deg_f, rx=36),
                   c.rect(f"Faixa · {nome_f}", 90, y_f, 1150, h_f, cor_f, rx=36)):
            c.nos.append(no)
            c.mostra(no, t0 + 0.05, t_msg - 0.05, sobe=20)
    for k, nome in enumerate(("coelho", "raposa", "coruja", "gato", "sapo", "tartaruga", "esquilo")):
        x = 165 + 155 * k
        g = sprite(c, nome, nome, 0, 0, 72)
        g["transform"].update({"x": x - 50, "y": 300, "sx": 0.40, "sy": 0.40})
        c.mostra(g, t_bichos + 0.1 * k, t_msg - 0.05, pop=True)
        r = c.texto(f"Código · {nome}", nome, x, 505, 30, TINTA, familia="Nunito", peso=800, ancora="middle", op=0)
        c.nos.append(r)
        c.mostra(r, t_bichos + 0.2 + 0.1 * k, t_msg - 0.05)
    for k, nome in enumerate(("arbusto", "pedras", "flores", "toco", "cogumelo", "folhas")):
        x = 190 + 180 * k
        g = sprite(c, nome, nome, 0, 0, 161)
        g["transform"].update({"x": x - 80, "y": 600, "sx": 0.26, "sy": 0.26})
        c.mostra(g, t_esc + 0.1 * k, t_msg - 0.05, pop=True)
        r = c.texto(f"Código · {nome}", nome, x, 860, 30, TINTA, familia="Nunito", peso=800, ancora="middle", op=0)
        c.nos.append(r)
        c.mostra(r, t_esc + 0.2 + 0.1 * k, t_msg - 0.05)
    titulo(c, [("A ", False), ("mensagem", True), (" também", False)], t_msg, t_tudo - 0.05)
    jardim(c, t_msg, t1, achados_antes=(0, 1, 2), mensagem=t_msg + 0.3, artes_bicho=novos_b)
    rotulo(c, "Sua frase", "Sua frase", gx(310), gy(112), t_msg + 0.6, t1, estilo="acao")
    titulo(c, [("Fica no ", False), ("seu jogo", True)], t_tudo, t1)
    selo(c, "Fica", gx(620), gy(20), t_tudo + 0.3, t1)
    salvar(c, "bichos-e-esconderijos")

    # 3. O desenho novo cabe no lugar do antigo: os bichos pulam um a um ("todos os bichos ... do mesmo tamanho"),
    # depois os esconderijos, e o arbusto vira toco no mesmo lugar ("cabe certinho").
    c, t0, t1 = cena("Mesmo tamanho", "Isso acontece porque todos os bichos", "no lugar do antigo.")
    t_bichos = p("todos os bichos", t0)
    t_mesmo = p("do mesmo tamanho", t_bichos)
    t_esc = p("e todos os esconderijos também", t_mesmo)
    t_cabe = p("o desenho novo cabe", t_esc)
    titulo(c, [("Todos do ", False), ("mesmo tamanho", True)], t0 + 0.05, t1)
    painel(c, t0 + 0.05, t1)
    for k in range(3):
        pulo(c, bicho(c, k, t0 + 0.1, t1), t_bichos + 0.25 * k)
    esconderijo(c, 0, t0 + 0.1, None, t_cabe)
    pulo(c, esconderijo(c, 0, t_cabe, None, t1, arte="toco"), t_cabe + 0.3)
    for k in (1, 2):
        pulo(c, esconderijo(c, k, t0 + 0.1, None, t1), t_esc + 0.25 * k)
    rotulo(c, "Mesmo tamanho", "Mesmo tamanho", gx(330), gy(30), t_mesmo, t1, estilo="termo")
    x0, y0 = centro(0)
    moldura(c, "Mesmo lugar", x0 - 150, y0 - 135, x0 + 150, y0 + 135, t_cabe - 0.3, t1)
    rotulo(c, "Cabe", "Cabe certinho", x0 + 120, y0 + 200, t_cabe + 0.4, t1, estilo="reacao")
    salvar(c, "mesmo-tamanho")

    # 4. O tipo da imagem: o bicho que aparece antes do toque (um bicho no bloco do esconderijo) e o desenho grande
    # demais (um esconderijo no bloco do bicho), cada um com o x na sua palavra; depois, cada um no seu tipo.
    c, t0, t1 = cena("O tipo da imagem", "Se algum bicho aparecer antes do toque", "esconderijo no bloco do esconderijo.")
    t_grande = p("ou se um desenho ficar grande demais", t0)
    t_outro = p("do outro tipo", t_grande)
    t_aqui = p("Aí é só clicar de novo", t_outro)
    t_mesmo = p("escolher um desenho do mesmo tipo", t_aqui)
    t_bicho = p("bicho no bloco do bicho", t_mesmo)
    t_esc = p("esconderijo no bloco do esconderijo", t_bicho)
    titulo(c, [("Tipo ", False), ("errado", True), ("?", False)], t0 + 0.05, t_aqui - 0.05)
    titulo(c, [("Cada um no ", False), ("seu tipo", True)], t_aqui, t1)
    painel(c, t0 + 0.05, t1)
    for k in range(3):
        bicho(c, k, t0 + 0.1, t1)
    # Erro 1: um bicho no lugar do esconderijo 3 aparece antes do toque (à frente, pequeno).
    esconderijo(c, 2, t0 + 0.1, None, t0 + 0.5)
    bicho_fora = sprite(c, "Bicho no bloco do esconderijo", "gato", 447, 181, 72)
    c.mostra(bicho_fora, t0 + 0.5, t_aqui, pop=True)
    esconderijo(c, 2, t_aqui + 0.2, None, t1)
    x2, y2 = centro(2)
    selo(c, "Errado 1", x2 + 90, y2 - 110, t0 + 0.9, t_aqui, ok=False)
    # Erro 2: um esconderijo no bloco do bicho fica grande, por cima do arbusto.
    esconderijo(c, 0, t0 + 0.1, None, t1)
    errado = sprite(c, "Esconderijo no bloco do bicho", "cogumelo", 101 - 44, 181 - 40, 161)
    c.mostra(errado, t_grande, t_aqui, pop=True)
    x0, y0 = centro(0)
    selo(c, "Errado 2", x0 + 110, y0 - 150, t_grande + 0.4, t_aqui, ok=False)
    esconderijo(c, 1, t0 + 0.1, None, t1)
    rotulo(c, "Outro tipo", "Imagem do outro tipo", gx(330), gy(30), t_outro, t_aqui, estilo="escuro")
    rotulo(c, "Mesmo tipo", "Desenho do mesmo tipo", gx(330), gy(30), t_mesmo, t1, estilo="reacao")
    rotulo(c, "Bicho", "Bicho: bloco do bicho", 400, 1010, t_bicho, t1, estilo="termo")
    rotulo(c, "Esconderijo", "Esconderijo: do esconderijo", 960, 1010, t_esc, t1, estilo="termo")
    salvar(c, "o-tipo-da-imagem")

    # 5. Com a sua cara: o jogo novo encontrado de novo, com a mensagem; é essa versão que vai para o Mural.
    c, t0, t1 = cena("Com a sua cara", "O jogo ficou com a sua cara", "publicar no Mural.")
    t_mural = p("publicar no Mural", t0)
    titulo(c, [("Com a ", False), ("sua cara", True), ("!", False)], t0 + 0.05, t1)
    painel(c, t0 + 0.05, t1)
    passo = max(0.35, min(0.55, (t_mural - t0 - 0.8) / 3))
    ts = [t0 + 0.4 + passo * k for k in range(3)]
    for k in range(3):
        bicho(c, k, t0 + 0.1, t1, arte=novos_b[k])
        esconderijo(c, k, t0 + 0.1, ts[k], t1, arte=novos_e[k])
    placar(c, [(t0 + 0.1, 0)] + toques_contando(c, ts, t1, mais=False), t1)
    m = c.texto("Mensagem do fim", "Achei todo mundo!", gx(174), gy(72), round(27 * 1.72), "#173844", op=0)
    c.nos.append(m)
    c.mostra(m, ts[-1] + 0.4, t1, pop=True)
    rotulo(c, "Mural", "Vai para o Mural", 660, 1010, t_mural, t1, estilo="acao")
    salvar(c, "com-a-sua-cara")


def a2p5():
    """Cadê A2P5 no kit (28/11/2026): pronto, publicar ou concluir; e o jogo no Mural para a família e os amigos."""
    # 1. Seu jogo está pronto: publicar no Mural (família e amigos) ou concluir sem publicar.
    c, t0, t1 = cena("Pronto", "Seu jogo está pronto", "continuar a jornada sem publicar.")
    t_mural = max(t0 + 0.3, p("você pode publicar no Mural", 0))
    t_conc = p("Você também pode clicar em Concluir", t_mural)
    titulo(c, [("Seu jogo está ", False), ("pronto", True), ("!", False)], t0 + 0.05, t1)
    _, cabeca = zappy_vivo(c, "celebrando", 110, 520, 300, t0 + 0.1, t1)
    t_se = max(t0 + 0.3, p("Se quiser", 0))  # dito debaixo da capa
    t_familia = p("para a sua família", t_mural)
    raios(c, "Pronto", 260, 640, 210, t0 + 0.5, t1)
    larg = largura_comum(c, ["Publicar no Mural", "Família e amigos jogam", "Ou concluir a aula"], tam="g") + 24
    rotulo(c, "Publicar", "Publicar no Mural", 820, 430, t_se, t1, estilo="acao", tam="g", largura=larg)
    rotulo(c, "Família", "Família e amigos jogam", 820, 580, t_familia, t1, estilo="reacao", tam="g", largura=larg)
    rotulo(c, "Concluir", "Ou concluir a aula", 820, 760, t_conc, t1, estilo="termo", tam="g", largura=larg)
    salvar(c, "pronto")

    # 2. No Mural: você, a sua família e os seus amigos jogam o jogo que você criou.
    c, t0, t1 = cena("No Mural", "Seu jogo está no Mural", "o jogo que você criou.")
    t_familia = p("a sua família", t0)
    t_criou = p("o jogo que você criou", t_familia)
    titulo(c, [("No ", False), ("Mural", True), ("!", False)], t0 + 0.05, t1)
    painel(c, t0 + 0.05, t1)
    passo = max(0.4, min(0.6, (t1 - t_familia - 0.6) / 3))
    ts = [t_familia + 0.2 + passo * k for k in range(3)]
    for k in range(3):
        bicho(c, k, t0 + 0.1, t1)
        esconderijo(c, k, t0 + 0.1, ts[k], t1)
    placar(c, [(t0 + 0.1, 0)] + toques_contando(c, ts, t1, mais=False), t1)
    rotulo(c, "Família", "Família e amigos jogam", 660, 1010, t_familia, t1, estilo="reacao")
    raios(c, "Criou", gx(320), gy(180), 260, t_criou, t1)
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
