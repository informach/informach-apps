"""As animações de conceito de Cadê Todo Mundo, Aula 1 (Faísca, 24/11/2026), as quatro partes num arquivo.

O jogo é o jardim 2D com três esconderijos; as cenas usam as artes do projeto final do curso e o Zappy
vagalume (cade_cena.py). Os tempos saem da voz da parte (tempos_da_voz.Voz), já na linha do tempo da edição:
grave antes de gerar. Cada cena procura a sua frase depois do fim da anterior.

- Parte 1: a abertura (o jogo e os personagens escondidos) e "os outros dois" + a surpresa do fim do curso.
- Parte 2: o Passo a passo como lugar para voltar quando esquecer um passo.
- Parte 3 (experiência): inteira, do primeiro ao último segundo de fala, sem mostrar o que a criança descobre.
- Parte 4: o "[na edição]" (o toque deixando o esconderijo invisível), os comandos como blocos, o bloco que
  percebe o toque e o "escolhido", o zero de visibilidade, a conferência dos blocos e a primeira regra pronta.

Uso: cade-conceitos.py <aula> <parte> <base.edisvg> <pasta dos blocos> <pasta de saída (pecas da parte)>
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from cade_cena import (  # noqa: E402
    AMARELO,
    BRANCO,
    TINTA,
    VERDE,
    Painel,
    botao,
    brilhos,
    caixa_em,
    ligacao,
    pena,
    personagem,
    presente,
    recorte,
    risada,
    seta_dir,
    toque,
    zappy,
)
from edisvg_cena import Cena  # noqa: E402
from tempos_da_voz import Voz  # noqa: E402

AULA, PARTE = int(sys.argv[1]), int(sys.argv[2])
BASE, BLOCOS, SAIDA = sys.argv[3:6]
voz = Voz.da_parte("cade", AULA, PARTE)
fim_anterior = 0.0


def cena(nome, comeco, final, ini=None, fim=None):
    """A cena de `comeco` ao fim de `final` (ou de ini a fim, quando dados), depois do fim da anterior."""
    global fim_anterior
    t0, t1 = voz.trecho(comeco, final, depois=fim_anterior)
    t0 = t0 if ini is None else ini
    t1 = round((t1 if fim is None else fim) + 0.3, 2)
    fim_anterior = t1
    return Cena(f"Conceito · {nome}", t0, t1, BASE, BLOCOS, SAIDA), t0, t1


def p(frase, depois):
    return voz.palavra(frase, depois)


# ── Parte 1: Bem-vindo ao jardim ──────────────────────────────────────────────────────────────────────────
def p1():
    c, t0, t1 = cena("O jogo", "Oi", "como ele funciona", ini=0.0)
    c.ideia("Cadê Todo Mundo?", t0 + 0.05, t1, "o jogo que você vai construir")
    j = Painel(c, t0, t1)
    j.jardim(espiar={"coelho": [t0 + 1.6], "raposa": [t0 + 3.0], "coruja": [t0 + 4.4]})
    j.achados([(t0, 0)])
    c.salvar("conceito-1-o-jogo")

    c, t0, t1 = cena("A surpresa", "Esses eu deixo", "ainda mais seu")
    t_mais = p("Ah, e tem mais uma coisa", t0)
    t_seu = p("Ela vai deixar", t_mais)
    c.ideia("Para você descobrir", t0 + 0.05, t_mais - 0.05, None)
    j = Painel(c, t0, t_mais)
    j.jardim(some={"arbusto": t0 - 0.2})
    j.achados([(t0, 1)])
    j.pergunta("pedras", t0 + 0.3, t_mais)
    j.pergunta("flores", t0 + 0.6, t_mais)
    c.ideia("Uma surpresa", t_mais, t1, "esperando no fim do curso")
    presente(c, 560, 640, t_mais + 0.1, t1)
    brilhos(c, [(330, 470, 40), (800, 450, 34), (300, 820, 30), (840, 830, 40)], t_mais + 0.5, t1)
    caixa_em(c, "Ainda mais seu", "o seu jogo ainda mais seu", 560, 960, 760, t_seu, t1, fill=VERDE, cor=AMARELO,
             tam=40)
    zappy(c, "happy", 1080, 700, 0.5, t_mais + 0.3, t1)
    c.salvar("conceito-2-a-surpresa")


# ── Parte 2: Seu passo a passo do projeto ─────────────────────────────────────────────────────────────────
def p2():
    c, t0, t1 = cena("Volte aqui", "Então, se você esquecer", "abrir o material")
    t_volta = p("é só voltar aqui", t0)
    c.ideia("Esqueceu um passo?", t0 + 0.05, t1, None)
    zappy(c, "thinking", 420, 640, 0.75, t0 + 0.1, t_volta)
    caixa_em(c, "Qual era o passo?", "qual era o próximo passo?", 760, 330, 760, t0 + 0.4, t_volta, tam=40)
    img, _ = recorte(c, "capa-passo-a-passo", 150, 300, 0.78, t_volta, t1)
    caixa_em(c, "Volte aqui", "volte ao Passo a passo", 920, 520, 560, t_volta + 0.3, t1, fill=AMARELO, num=1, tam=38)
    caixa_em(c, "Abra o material", "e abra o material", 920, 680, 560, t_volta + 1.2, t1, num=2, tam=38)
    zappy(c, "happy", 960, 900, 0.36, t_volta + 0.5, t1)
    c.salvar("conceito-1-volte-aqui")


# ── Parte 3: O que um toque faz? (experiência: inteira) ───────────────────────────────────────────────────
def p3():
    c, t0, t1 = cena("Ação e reação", "Nesta parte", "A ação e a reação", ini=0.0)
    t_acao = p("A ação e a reação", t0)
    c.ideia("Uma ideia importante", t0 + 0.05, t_acao - 0.05, "para o seu jogo responder")
    zappy(c, "speaking", 660, 680, 0.75, t0 + 0.3, t_acao)
    c.ideia("Ação e reação", t_acao, t1, None)
    caixa_em(c, "Ação", "ação", 330, 600, 360, t_acao + 0.1, t1, num=1, tam=48)
    seta_dir(c, "Seta", 540, 790, 600, BRANCO, t_acao + 0.4, t1)
    caixa_em(c, "Reação", "reação", 1010, 600, 380, t_acao + 0.7, t1, fill=VERDE, cor=AMARELO, num=2, tam=48)
    c.salvar("conceito-1-acao-e-reacao")

    c, t0, t1 = cena("Cócegas", "Sabe quando alguém faz cócegas", "a risada é a reação")
    t_rir = p("parar de rir", t0)
    t_cocega = p("A cócega é a ação", t_rir)
    t_risada = p("e a risada é a reação", t_cocega)
    c.ideia("Cócegas!", t0 + 0.05, t1, None)
    personagem(c, "coelho", 470, 960, 560, t0 + 0.1, t1, ri=[t_rir - 0.4, t_rir + 0.8, t_risada])
    pena(c, 790, 700, t0 + 0.3, t_cocega + 0.2, mexe=(t0 + 0.5, t_rir + 1.6))
    risada(c, 640, 420, t_rir - 0.3, t_cocega)
    caixa_em(c, "Ação · cócegas", "ação: cócegas", 1000, 560, 440, t_cocega + 0.1, t1, num=1, tam=42)
    caixa_em(c, "Reação · risada", "reação: risada", 1000, 720, 440, t_risada + 0.1, t1, fill=VERDE, cor=AMARELO,
             num=2, tam=42)
    risada(c, 640, 420, t_risada + 0.2, t1)
    c.salvar("conceito-2-cocegas")

    c, t0, t1 = cena("O toque", "No seu jogo, o toque é a ação", "ligada ao toque para acontecer")
    t_toque = p("toque", t0)
    t_reacao = p("A reação que a gente quer", t0)
    t_invisivel = p("invisível", t_reacao)
    t_essa = p("Essa reação precisa", t_invisivel)
    t_ligada = p("ligada", t_essa)
    c.ideia("No seu jogo", t0 + 0.05, t_essa - 0.05, None)
    c.ideia("Ligada ao toque", t_essa, t1, None)
    j = Painel(c, t0, t1, x0=120, y0=300, largura=820)
    j.jardim(some={"arbusto": t_invisivel + 0.2})
    toque(c, *j.meio("arbusto"), t_toque + 0.1)
    toque(c, *j.meio("arbusto"), t_invisivel - 0.3)
    caixa_em(c, "Ação · toque", "ação: toque", 300, 910, 400, t_toque + 0.1, t1, num=1, tam=40)
    caixa_em(c, "Reação · invisível", "reação: ficar invisível", 960, 910, 520, t_reacao + 0.3, t1, fill=VERDE,
             cor=AMARELO, num=2, tam=38)
    ligacao(c, 510, 690, 910, t_reacao + 0.6, t_ligada, t1)
    c.salvar("conceito-3-o-toque")

    c, t0, t1 = cena("Investigue", "Agora você vai investigar", "clique em próxima parte")
    t_zap = p("vai te mostrando", t0) - 0.6
    t_repetir = p("repetir", t_zap)
    t_fim = p("Quando terminar", t_repetir)
    c.ideia("Agora você investiga", t0 + 0.05, t_zap - 0.05, "o que um toque faz no jardim")
    caixa_em(c, "Com a reação ligada", "com a reação ligada ?", 660, 470, 820, t0 + 0.8, t_zap, num=1, tam=42)
    caixa_em(c, "Sem a reação ligada", "sem a reação ligada ?", 660, 640, 820, t0 + 2.4, t_zap, num=2, tam=42)
    zappy(c, "thinking", 660, 900, 0.4, t0 + 3.0, t_zap)
    c.ideia("O Zappy te mostra", t_zap, t1, "o que testar, quantas vezes quiser")
    zappy(c, "speaking", 380, 700, 0.8, t_zap + 0.1, t1)
    c.balao("Balão · Zappy", "teste comigo!", 900, 470, 420, -120)
    c.mostra(c.nos[-1], t_zap + 0.5, t1, pop=True)
    caixa_em(c, "Repita", "repita quando quiser", 900, 640, 520, t_repetir, t1, fill=AMARELO, tam=40)
    botao(c, "Próxima parte", 900, 860, t_fim + 0.2, t1)
    c.salvar("conceito-4-investigue")


# ── Parte 4: Faça alguém aparecer ─────────────────────────────────────────────────────────────────────────
def p4():
    global fim_anterior
    c, t0, t1 = cena("Lembra da experiência", "Lembra da experiência", "esconderijos do seu jogo")
    t_toque = p("toque", t0)
    t_ligada = p("ligada", t_toque)
    t_agora = p("Agora, a gente vai fazer", t_ligada)
    c.ideia("Lembra da experiência?", t0 + 0.05, t_agora - 0.05, None)
    j = Painel(c, t0, t1, x0=120, y0=300, largura=820)
    j.jardim(some={"arbusto": t_ligada + 0.5})
    toque(c, *j.meio("arbusto"), t_toque + 0.1)
    toque(c, *j.meio("arbusto"), t_ligada + 0.2)
    caixa_em(c, "Toque", "toque", 300, 910, 300, t_toque + 0.1, t1, num=1, tam=42)
    caixa_em(c, "Invisível", "ficar invisível", 930, 910, 440, t_toque + 0.8, t1, fill=VERDE, cor=AMARELO, num=2,
             tam=40)
    ligacao(c, 460, 700, 910, t_toque + 1.0, t_ligada, t1)
    c.ideia("Agora, no seu jogo", t_agora, t1, None)
    j.contorno("pedras", t_agora + 0.3, t1)
    j.contorno("flores", t_agora + 0.6, t1)
    c.salvar("conceito-1-lembra-da-experiencia")

    fim_blocos = p("que aqui aparecem como blocos", fim_anterior) - 0.35
    c, t0, t1 = cena("Comandos", "Para fazer isso", "servem os comandos", fim=fim_blocos - 0.3)
    t_comandos = p("É para isso", t0)
    c.ideia("Diga ao jogo o que fazer", t0 + 0.05, t_comandos - 0.05, None)
    zappy(c, "final", 300, 700, 0.6, t0 + 0.1, t1)
    caixa_em(c, "O que fazer", "o que o jogo deve fazer?", 860, 560, 640, t0 + 0.8, t_comandos, tam=40)
    c.ideia("Comandos", t_comandos, t1, "aqui, cada comando é um bloco")
    recorte(c, "bloco-visibilidade-50", 600, 520, 1.1, t_comandos + 0.2, t1)
    recorte(c, "bloco-quando-tocar", 580, 720, 0.8, t_comandos + 0.7, t1)
    c.salvar("conceito-2-comandos")

    c, t0, t1 = cena("Escolhido", "É ele que percebe", "esconderijo que você tocar")
    t_toca = p("toca", t0)
    t_sprite = p("Cada esconderijo é um sprite", t_toca)
    t_objeto = p("objeto", t_sprite)
    t_escolhido = p("é o nome que o jogo dá", t_objeto) - 1.2
    t_tocar = p("que você tocar", t_escolhido)
    c.ideia("Ele percebe o toque", t0 + 0.05, t_sprite - 0.05, None)
    c.ideia("Cada esconderijo é um sprite", t_sprite, t_escolhido - 0.05, None)
    c.ideia("Escolhido", t_escolhido, t1, None)
    g, destaque = recorte(c, "bloco-quando-tocar", 110, 250, 1.0, t0 + 0.1, t1)
    d1 = destaque("Destaque · quando tocar", 0, 0, 770, 72)
    c.pisca(d1, t0 + 0.3, t_sprite)
    d2 = destaque("Destaque · escolhido", 650, 10, 760, 60)
    c.pisca(d2, t_escolhido + 0.2, t1)
    j = Painel(c, t0, t1, x0=120, y0=470, largura=760)
    j.jardim()
    toque(c, *j.meio("pedras"), t_toca)
    for k, esc in enumerate(("arbusto", "pedras", "flores")):
        j.contorno(esc, t_sprite + 0.2 + 0.3 * k, t_escolhido - 0.1)
    caixa_em(c, "Sprite", "sprite: um objeto do jogo", 1080, 620, 440, t_objeto, t_escolhido, num=1, tam=32)
    toque(c, *j.meio("flores"), t_tocar - 0.1)
    fx, _ = j.meio("flores")
    caixa_em(c, "Escolhido · etiqueta", "escolhido", fx, j.gy(137) - 40, 300, t_tocar + 0.2, t1, fill=AMARELO,
             num=2, tam=40)
    c.salvar("conceito-3-escolhido")

    fim_anterior = p("Clique no 50", fim_anterior)
    c, t0, t1 = cena("Zero de visibilidade", "Com zero de visibilidade", "que está atrás dele")
    t_atras = p("E aí, dá para ver", t0)
    c.ideia("Zero de visibilidade", t0 + 0.05, t1, "o esconderijo fica invisível")
    j = Painel(c, t0, t1, x0=120, y0=320, largura=720)
    j.jardim(sem=("arbusto",))
    j.sprite("arbusto", opacidade=[(t0 - 0.01, 0), (t0, 0), (t0 + 0.3, 100), (t0 + 1.2, 100), (t0 + 2.2, 45),
                                   (t0 + 2.8, 45), (t0 + 3.8, 0)])
    g, destaque = recorte(c, "bloco-visibilidade-0", 140, 780, 1.25, t0 + 0.2, t1)
    d = destaque("Destaque · zero", 316, 10, 370, 56)
    c.pisca(d, t0 + 0.8, t1)
    caixa_em(c, "Dá para ver", "dá para ver quem está atrás", 1050, 520, 460, t_atras, t1, fill=VERDE, cor=AMARELO,
             tam=32)
    j.contorno("coelho", t_atras + 0.2, t1)
    c.salvar("conceito-4-zero-de-visibilidade")

    c, t0, t1 = cena("Confira", "Se aconteceu com você", "teste de novo")
    t_dentro = p("O bloco está dentro", t0)
    t_sprite = p("o sprite é escolhido", t_dentro)
    t_numero = p("o número é zero", t_sprite)
    t_teste = p("Depois de corrigir", t_numero)
    c.ideia("Confira os blocos", t0 + 0.05, t_teste - 0.05, None)
    c.ideia("Corrija e teste de novo", t_teste, t1, None)
    g, destaque = recorte(c, "regra-completa", 130, 240, 1.05, t0 + 0.2, t1)
    for k, (t, texto, caixa) in enumerate(((t_dentro, "dentro de Quando clicar ou tocar", (86, 128, 626, 206)),
                                           (t_sprite, "o sprite é escolhido", (238, 138, 346, 186)),
                                           (t_numero, "o número é 0", (404, 141, 454, 181)))):
        caixa_em(c, f"Confira {k + 1}", texto, 600, 650 + 130 * k, 900, t, t1, num=k + 1, tam=36)
        d = destaque(f"Destaque {k + 1}", *caixa)
        c.pisca(d, t, (t_sprite, t_numero, t_teste)[k])
    c.salvar("conceito-5-confira")

    c, t0, t1 = cena("Primeira regra", "Pronto, você já programou", "você já vai descobrir o que é")
    t_surpresa = p("E lembra da surpresa", t0)
    t_prox = p("Na próxima aula", t_surpresa)
    c.ideia("Primeira regra pronta!", t0 + 0.05, t_surpresa - 0.05, None)
    recorte(c, "regra-completa", 150, 330, 0.95, t0 + 0.2, t_surpresa)
    brilhos(c, [(170, 320, 44), (900, 300, 36), (920, 640, 40), (190, 660, 32)], t0 + 0.6, t_surpresa)
    zappy(c, "celebrating", 1100, 700, 0.5, t0 + 0.3, t1)
    c.ideia("A surpresa está chegando", t_surpresa, t1, None)
    presente(c, 560, 600, t_surpresa + 0.1, t1)
    caixa_em(c, "Próxima aula", "na próxima aula!", 560, 930, 520, t_prox, t1, fill=AMARELO, tam=44)
    c.salvar("conceito-6-primeira-regra")


{1: p1, 2: p2, 3: p3, 4: p4}[PARTE]()
_ = (TINTA,)
