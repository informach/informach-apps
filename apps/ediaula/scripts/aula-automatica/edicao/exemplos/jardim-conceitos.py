"""As animações de conceito de O Jardim Secreto (missão do Faísca, 24/11/2026), as dez partes num arquivo.

A missão não monta blocos no vídeo: as cenas mostram o que o jogo precisa fazer (o personagem andando, a borda,
o regador que some, a memória, a flor que abre) e onde a criança aprendeu cada coisa (a capa do curso base com
as partes). Na Aula 1 o jogo é o 2D (as artes do jogo); na Aula 2, o jardim 3D (os renders). Os tempos saem da
voz da parte (tempos_da_voz.Voz), já na linha do tempo da edição: grave antes de gerar. Cada cena procura a sua
frase depois do fim da anterior. Peças das cenas em jardim_cena.py.

Uso: jardim-conceitos.py <aula> <parte> <base.edisvg> <pasta dos blocos> <pasta de saída (pecas da parte)>
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from edisvg_cena import AMARELO, BRANCO, Cena  # noqa: E402
from jardim_cena import (  # noqa: E402
    F3,
    FLOR_2D,
    P3,
    PERSONAGEM_2D,
    R3,
    REGADOR_2D,
    aviso2d,
    aviso3d,
    caixa_em,
    chao3d,
    curso_base,
    estrela_no,
    flor2d,
    flor3d,
    memoria,
    painel2d,
    personagem2d,
    personagem3d,
    regador2d,
    regador3d,
    setas,
    vis,
    zappy,
)
from tempos_da_voz import Voz  # noqa: E402

AULA, PARTE = int(sys.argv[1]), int(sys.argv[2])
BASE, BLOCOS, SAIDA = sys.argv[3:6]
voz = Voz.da_parte("jardim", AULA, PARTE)
CHAVE, ILHA = "curso-chave-do-farol", "curso-ilha-do-farol"
fim_anterior = 0.0


def cena(nome, comeco, final):
    global fim_anterior
    t0, t1 = voz.trecho(comeco, final, depois=fim_anterior)
    fim_anterior = t1
    return Cena(f"Conceito · {nome}", t0, t1, BASE, BLOCOS, SAIDA), t0, t1


def onde_aprendeu(n, slug, comeco, final, arte, aulas, sub):
    c, t0, t1 = cena("Onde você aprendeu", comeco, final)
    c.ideia("Você já aprendeu", t0 + 0.05, t1, sub)
    curso_base(c, arte, aulas, t0, t1)
    c.salvar(f"conceito-{n}-{slug}")


def missao2d(n, comeco, final, titulo):
    """O jogo pronto em resumo: pega o regador e a flor abre."""
    c, t0, t1 = cena("A missão", comeco, final)
    c.ideia(titulo, t0 + 0.05, t1, None)
    painel2d(c, t0, t1)
    d = (t1 - t0)
    ta, tb = t0 + 0.35 * d, t0 + 0.62 * d
    regador2d(c, t0 + 0.1, ta, t1)
    personagem2d(c, t0 + 0.1, t1, [(t0 + 0.15, *PERSONAGEM_2D[:2]), (ta, 270, 190), (ta + 0.1, 270, 190), (tb, 690, 280)])
    flor2d(c, t0 + 0.1, tb, t1)
    c.salvar(f"conceito-{n}-a-missao")


def quem_programa(n, comeco, final):
    c, t0, t1 = cena("Quem programa é você", comeco, final)
    t_cada = voz.palavra("Em cada parte", t0)
    c.ideia("Quem programa é você", t0 + 0.05, t_cada - 0.05, None)
    c.ideia("Em cada parte", t_cada, t1, None)
    caixa_em(c, "Sem montar junto", "sem montar os blocos junto", 660, 420, 900, t0 + 0.6, t_cada, fill=AMARELO, tam=44)
    caixa_em(c, "Eu mostro", "eu mostro o que o jogo faz", 660, 470, 900, t_cada + 0.2, t1, num=1)
    caixa_em(c, "Você programa", "você programa no Estúdio", 660, 640, 900, t_cada + 1.4, t1, num=2)
    zappy(c, t0 + 0.2, t1, px=660, py=1040, s=0.42)
    c.salvar(f"conceito-{n}-quem-programa")


# ── Aula 1 (2D) ──────────────────────────────────────────────────────────────────────────────────────────
def a1p1():
    missao2d(1, "No jardim tem uma flor fechada", "depois chegar até a flor.", "A missão: a flor abrir")
    quem_programa(2, "Esta missão é diferente", "você programa no Estúdio.")
    c, t0, t1 = cena("Você já sabe", "Você já sabe tudo o que precisa", "é só voltar lá.")
    c.ideia("Você já sabe tudo", t0 + 0.05, t1, "aprendeu na Chave do Farol")
    from jardim_cena import curso_base as _cb  # noqa: F401
    img, _ = c.bloco(CHAVE, 120, 330, 0.5, fundo=BRANCO, pad=12)
    c.mostra(img, t0 + 0.1, t1, pop=True)
    for k, rotulo in enumerate(("Aula 1", "Aula 2", "Aula 3")):
        caixa_em(c, f"Aula {k + 1}", rotulo, 960, 400 + k * 140, 420, t0 + 0.8 + 0.4 * k, t1, fill=AMARELO, tam=42)
    c.salvar("conceito-3-voce-ja-sabe")
    c, t0, t1 = cena("2D e 3D", "Nesta aula, o jardim é numa tela plana", "em três dimensões.")
    t_prox = voz.palavra("Na próxima", t0)
    c.ideia("Nesta aula: 2D", t0 + 0.05, t_prox - 0.05, None)
    c.ideia("Na próxima: 3D", t_prox, t1, None)
    painel2d(c, t0, t_prox)
    regador2d(c, t0 + 0.1, None, t_prox)
    personagem2d(c, t0 + 0.1, t_prox, [(t0, *PERSONAGEM_2D[:2])])
    flor2d(c, t0 + 0.1, None, t_prox)
    img, _ = c.bloco("curso-jardim", 140, 300, 1.04, fundo=BRANCO, pad=10)
    vis(c, img, [(t_prox, t1)])
    c.salvar("conceito-4-2d-e-3d")


def a1p2():
    c, t0, t1 = cena("Andar", "Nesta etapa, o seu jogo precisa fazer duas coisas", "quando solta, ele para.")
    t_prim = voz.palavra("Primeira", t0)
    t_quando = voz.palavra("Quando você segura uma seta", t_prim)
    c.ideia("Duas coisas", t0 + 0.05, t_prim - 0.05, None)
    c.ideia("1. As setas e o passo", t_prim, t1, None)
    painel2d(c, t0, t1)
    regador2d(c, t0 + 0.1, None, t1)
    flor2d(c, t0 + 0.1, None, t1)
    a, b = t_quando + 0.3, t_quando + 1.6
    personagem2d(c, t0 + 0.1, t1, [(t0, *PERSONAGEM_2D[:2]), (a, 130, 310), (b, 330, 310), (b + 0.6, 330, 310), (b + 1.4, 330, 420)])
    setas(c, t_prim + 0.2, t1, toques=[(a + 0.1, "dir"), (b + 0.7, "baixo")])
    c.salvar("conceito-1-as-setas")
    c, t0, t1 = cena("A borda", "Segunda: o personagem não sai do jardim", "e consegue voltar.")
    c.ideia("2. Fica no jardim", t0 + 0.05, t1, None)
    painel2d(c, t0, t1)
    d = t1 - t0
    personagem2d(c, t0 + 0.1, t1, [(t0, 330, 310), (t0 + 0.3 * d, 0, 310), (t0 + 0.55 * d, 0, 310), (t0 + 0.85 * d, 180, 310)])
    borda = c.rect("Borda", 100, 300, 14, 690, AMARELO, rx=7, op=0)
    c.nos.append(borda)
    vis(c, borda, [(t0 + 0.3 * d, t0 + 0.6 * d)])
    caixa_em(c, "Borda", "a borda", 330, 900, 260, t0 + 0.3 * d, t0 + 0.65 * d, fill=AMARELO, tam=40)
    c.salvar("conceito-2-a-borda")
    onde_aprendeu(3, "chave-do-farol-aula-1", "Você já sabe fazer as duas coisas", "volte lá.", CHAVE,
                  [("Aula 1", ["Faça o personagem andar", "Mantenha o personagem na tela"])], "na Chave do Farol")


def a1p3():
    c, t0, t1 = cena("O regador", "Nesta etapa, o seu jogo precisa fazer quatro coisas", "um aviso conta que ele pegou.")
    t_prim = voz.palavra("Primeira", t0)
    c.ideia("Quatro coisas", t0 + 0.05, t_prim - 0.05, None)
    c.ideia("1. Pegar o regador", t_prim, t1, None)
    painel2d(c, t0, t1)
    ta = t_prim + 1.6
    regador2d(c, t0 + 0.1, ta, t1)
    personagem2d(c, t0 + 0.1, t1, [(t0, *PERSONAGEM_2D[:2]), (t_prim + 0.2, *PERSONAGEM_2D[:2]), (ta, 270, 190)])
    flor2d(c, t0 + 0.1, None, t1)
    aviso2d(c, [(t0 + 0.1, "Recolha o regador e leve o personagem até a flor."), (ta, "Você pegou o regador!")], t1)
    c.salvar("conceito-1-o-regador")
    c, t0, t1 = cena("A memória", "Segunda: o jogo lembra", "ele ainda não pegou.")
    t_comeco = voz.palavra("No começo da partida", t0)
    c.ideia("2. O jogo lembra", t0 + 0.05, t1, None)
    memoria(c, t0 + 0.2, None, t1)
    caixa_em(c, "Começo", "no começo: ainda não pegou", 660, 860, 760, t_comeco, t1, tam=40)
    c.salvar("conceito-2-a-memoria")
    c, t0, t1 = cena("Sem o regador", "Essa é a terceira", "o aviso diz o que falta.")
    c.ideia("3. Sem o regador", t0 + 0.05, t1, None)
    painel2d(c, t0, t1)
    d = t1 - t0
    ta = t0 + 0.55 * d
    regador2d(c, t0 + 0.1, None, t1)
    personagem2d(c, t0 + 0.1, t1, [(t0, *PERSONAGEM_2D[:2]), (ta, 690, 310)])
    flor2d(c, t0 + 0.1, None, t1)
    aviso2d(c, [(t0 + 0.1, "Recolha o regador e leve o personagem até a flor."), (ta, "Falta o regador! Volte e pegue.")], t1)
    c.salvar("conceito-3-sem-o-regador")
    c, t0, t1 = cena("A flor abre", "Quarta: com o regador", "e o aviso comemora.")
    c.ideia("4. Com o regador", t0 + 0.05, t1, None)
    painel2d(c, t0, t1)
    d = t1 - t0
    ta, tb = t0 + 0.3 * d, t0 + 0.65 * d
    regador2d(c, t0 + 0.1, ta, t1)
    personagem2d(c, t0 + 0.1, t1, [(t0, *PERSONAGEM_2D[:2]), (ta, 270, 190), (tb, 690, 280)])
    flor2d(c, t0 + 0.1, tb, t1)
    aviso2d(c, [(t0 + 0.1, "Recolha o regador e leve o personagem até a flor."), (ta, "Você pegou o regador!"),
                (tb, "A flor abriu! Você conseguiu!")], t1)
    c.salvar("conceito-4-a-flor-abre")
    onde_aprendeu(5, "chave-do-farol-aulas-2-e-3", "Você aprendeu tudo isso na Chave do Farol", "volte lá.", CHAVE,
                  [("Aula 2", ["Recolha a chave", "Guarde que a chave foi encontrada"]),
                   ("Aula 3", ["Acenda o farol com a chave"])], "na Chave do Farol")


def a1p4():
    c, t0, t1 = cena("Um lugar novo", "Nesta etapa, escolha outro lugar para o regador", "consiga chegar.")
    c.ideia("Outro lugar", t0 + 0.05, t1, "aonde o personagem consiga chegar")
    painel2d(c, t0, t1)
    d = t1 - t0
    r = regador2d(c, t0 + 0.1, None, t1)
    from jardim_cena import caminho2d
    caminho2d(c, r, [(t0, *REGADOR_2D[:2]), (t0 + 0.35 * d, *REGADOR_2D[:2]), (t0 + 0.7 * d, 470, 420)])
    personagem2d(c, t0 + 0.1, t1, [(t0, *PERSONAGEM_2D[:2])])
    flor2d(c, t0 + 0.1, None, t1)
    c.salvar("conceito-1-um-lugar-novo")
    c, t0, t1 = cena("Os dois casos", "Depois teste de novo os dois casos", "a flor abre.")
    t_com = voz.palavra("com ele", t0)
    c.ideia("Teste os dois casos", t0 + 0.05, t1, None)
    caixa_em(c, "Sem", "sem o regador: fechada", 400, 420, 560, t0 + 0.4, t1, num=1, tam=36)
    caixa_em(c, "Com", "com o regador: aberta", 960, 420, 560, t_com, t1, num=2, tam=36)
    from jardim_cena import sprite2d
    for k, (x, arq, t) in enumerate(((330, "flor-fechada", t0 + 0.4), (890, "flor-aberta", t_com))):
        g = c.grupo(f"Flor {k + 1}", x, 560, [], op=0)
        f = sprite2d(c, f"Flor {k + 1}", arq, 0, 0, 120)
        f["transform"]["x"], f["transform"]["y"] = x, 520
        vis(c, f, [(t, t1)])
    estrela_no(c, 1000, 540, t_com + 0.3, t1)
    c.salvar("conceito-2-os-dois-casos")
    onde_aprendeu(3, "chave-do-farol-aula-3", "Você aprendeu a mudar o lugar de um objeto", "volte lá.", CHAVE,
                  [("Aula 3", ["Escolha onde fica a chave"])], "na Chave do Farol")


def a1p5():
    c, t0, t1 = cena("Pronto", "Pronto, o seu jardim em duas dimensões", "a primeira parte da missão sozinho.")
    c.ideia("Seu jardim 2D está pronto", t0 + 0.05, t1, None)
    painel2d(c, t0, t1)
    personagem2d(c, t0 + 0.1, t1, [(t0, 690, 280)])
    flor2d(c, t0 + 0.1, t0 + 0.6, t1)
    aviso2d(c, [(t0 + 0.1, "A flor abriu! Você conseguiu!")], t1)
    c.salvar("conceito-1-pronto")
    c, t0, t1 = cena("Próxima aula", "Na próxima aula", "em três dimensões.")
    c.ideia("Na próxima: 3D", t0 + 0.05, t1, None)
    img, _ = c.bloco("curso-jardim", 140, 300, 1.04, fundo=BRANCO, pad=10)
    c.mostra(img, t0 + 0.1, t1, pop=True)
    c.salvar("conceito-2-proxima-aula")


# ── Aula 2 (3D) ──────────────────────────────────────────────────────────────────────────────────────────
def missao3d(n, comeco, final, titulo):
    c, t0, t1 = cena("A missão", comeco, final)
    c.ideia(titulo, t0 + 0.05, t1, None)
    chao3d(c, t0, t1)
    d = t1 - t0
    ta, tb = t0 + 0.35 * d, t0 + 0.7 * d
    regador3d(c, t0 + 0.1, ta, t1)
    personagem3d(c, "Aventureiro", t0 + 0.1, t1, [(t0 + 0.15, ta, P3, (R3[0] - 40, R3[1] + 20, 0.42)),
                                                   (ta + 0.1, tb, (R3[0] - 40, R3[1] + 20, 0.42), (F3[0] - 150, F3[1], 0.5))])
    flor3d(c, t0 + 0.1, tb, t1)
    c.salvar(f"conceito-{n}-a-missao")


def a2p1():
    missao3d(1, "A missão continua a mesma", "para ela abrir.", "A mesma missão, em 3D")
    quem_programa(2, "Como na Aula 1, quem programa é você", "você programa no Estúdio.")
    onde_aprendeu(3, "ilha-do-farol", "Tudo o que você precisa, aprendeu na Ilha do Farol", "é só voltar lá.", ILHA,
                  [("Aulas 1, 2 e 3", ["Andar, recolher e acender o farol"])], "na Ilha do Farol")


def a2p2():
    c, t0, t1 = cena("Andar no chão", "Nesta etapa, o seu jogo precisa fazer duas coisas", "quando solta, ele para.")
    t_prim = voz.palavra("Primeira", t0)
    c.ideia("Duas coisas", t0 + 0.05, t_prim - 0.05, None)
    c.ideia("1. Andar pelo chão", t_prim, t1, None)
    chao3d(c, t0, t1)
    a, b = t_prim + 0.6, t_prim + 2.4
    personagem3d(c, "Aventureiro", t0 + 0.1, t1, [(a, b, P3, (700, 900, 0.5))])
    setas(c, t_prim + 0.2, t1, cx=1050, cy=480, toques=[(a + 0.1, "dir")])
    c.salvar("conceito-1-andar-no-chao")
    c, t0, t1 = cena("O regador some", "Segunda: quando o personagem encosta no regador", "um aviso conta que ele pegou.")
    c.ideia("2. Recolher o regador", t0 + 0.05, t1, None)
    chao3d(c, t0, t1)
    d = t1 - t0
    ta = t0 + 0.55 * d
    regador3d(c, t0 + 0.1, ta, t1)
    personagem3d(c, "Aventureiro", t0 + 0.1, t1, [(t0 + 0.3, ta, P3, (R3[0] - 40, R3[1] + 20, 0.42))])
    aviso3d(c, [(t0 + 0.1, "Recolha o regador e leve o personagem até a flor."), (ta, "Você pegou o regador!")], t1)
    c.salvar("conceito-2-o-regador-some")
    onde_aprendeu(3, "ilha-do-farol-aulas-1-e-2", "Você já sabe fazer as duas coisas", "volte lá.", ILHA,
                  [("Aula 1", ["Faça o personagem andar"]), ("Aula 2", ["Recolha a chave"])], "na Ilha do Farol")


def a2p3():
    c, t0, t1 = cena("A memória", "Nesta etapa, o seu jogo precisa fazer quatro coisas", "ele ainda não pegou.")
    t_prim = voz.palavra("Primeira", t0)
    c.ideia("Quatro coisas", t0 + 0.05, t_prim - 0.05, None)
    c.ideia("1. O jogo lembra", t_prim, t1, None)
    memoria(c, t_prim + 0.2, None, t1)
    c.salvar("conceito-1-a-memoria")
    c, t0, t1 = cena("Sem o regador", "Segunda: sem o regador", "o aviso diz o que falta.")
    c.ideia("2. Sem o regador", t0 + 0.05, t1, None)
    chao3d(c, t0, t1)
    d = t1 - t0
    ta = t0 + 0.55 * d
    regador3d(c, t0 + 0.1, None, t1)
    personagem3d(c, "Aventureiro", t0 + 0.1, t1, [(t0 + 0.3, ta, P3, (F3[0] - 150, F3[1], 0.5))])
    flor3d(c, t0 + 0.1, None, t1)
    aviso3d(c, [(t0 + 0.1, "Recolha o regador e leve o personagem até a flor."), (ta, "Falta o regador! Volte e pegue.")], t1)
    c.salvar("conceito-2-sem-o-regador")
    c, t0, t1 = cena("A flor floresce", "Terceira: com o regador", "e o aviso comemora.")
    c.ideia("3. Com o regador", t0 + 0.05, t1, None)
    chao3d(c, t0, t1)
    d = t1 - t0
    ta, tb = t0 + 0.3 * d, t0 + 0.65 * d
    regador3d(c, t0 + 0.1, ta, t1)
    personagem3d(c, "Aventureiro", t0 + 0.1, t1, [(t0 + 0.15, ta, P3, (R3[0] - 40, R3[1] + 20, 0.42)),
                                                   (ta + 0.1, tb, (R3[0] - 40, R3[1] + 20, 0.42), (F3[0] - 150, F3[1], 0.5))])
    flor3d(c, t0 + 0.1, tb, t1)
    aviso3d(c, [(t0 + 0.1, "Recolha o regador e leve o personagem até a flor."), (ta, "Você pegou o regador!"),
                (tb, "A flor abriu! Você conseguiu!")], t1)
    c.salvar("conceito-3-a-flor-floresce")
    c, t0, t1 = cena("Uma vez só", "Essa é a quarta", "Ela abre uma vez só.")
    c.ideia("4. Abre uma vez só", t0 + 0.05, t1, None)
    chao3d(c, t0, t1)
    d = t1 - t0
    ta, tb = t0 + 0.35 * d, t0 + 0.6 * d
    perto, longe = (F3[0] - 150, F3[1], 0.5), (F3[0] - 420, F3[1] + 40, 0.52)
    personagem3d(c, "Aventureiro", t0 + 0.1, t1, [(t0 + 0.2, ta, perto, longe), (ta + 0.1, tb, longe, perto)])
    flor3d(c, t0 + 0.1, t0 + 0.12, t1)
    caixa_em(c, "Continua aberta", "continua aberta", 660, 480, 520, tb + 0.2, t1, fill=AMARELO, tam=42)
    c.salvar("conceito-4-uma-vez-so")
    onde_aprendeu(5, "ilha-do-farol-aulas-2-e-3", "Você aprendeu tudo isso na Ilha do Farol", "volte lá.", ILHA,
                  [("Aula 2", ["Guarde que você pegou a chave"]),
                   ("Aula 3", ["Acenda o farol com a chave", "O farol acende uma vez só"])], "na Ilha do Farol")


def a2p4():
    c, t0, t1 = cena("Um lugar novo no chão", "Nesta etapa, escolha outro lugar no chão", "consiga chegar.")
    c.ideia("Outro lugar no chão", t0 + 0.05, t1, "aonde o personagem consiga chegar")
    chao3d(c, t0, t1)
    d = t1 - t0
    from ilha_cena import mover
    r = regador3d(c, t0 + 0.1, None, t1)
    novo = (820, 980, 0.5)
    mover(c, r, "regador-3d", t0 + 0.35 * d, R3, t0 + 0.7 * d, novo)
    personagem3d(c, "Aventureiro", t0 + 0.1, t1, [(t0, P3)])
    flor3d(c, t0 + 0.1, None, t1)
    c.salvar("conceito-1-um-lugar-novo-no-chao")
    c, t0, t1 = cena("Os dois casos", "Depois teste de novo os dois casos", "a flor floresce.")
    t_com = voz.palavra("com ele", t0)
    c.ideia("Teste os dois casos", t0 + 0.05, t1, None)
    caixa_em(c, "Sem", "sem o regador: fechada", 400, 420, 560, t0 + 0.4, t1, num=1, tam=36)
    caixa_em(c, "Com", "com o regador: floresce", 960, 420, 560, t_com, t1, num=2, tam=36)
    flor3d(c, t0 + 0.4, None, t1, onde=(400, 1000, 0.6))
    flor3d(c, t_com, t_com + 0.5, t1, onde=(960, 1000, 0.6))
    c.salvar("conceito-2-os-dois-casos")
    onde_aprendeu(3, "ilha-do-farol-aula-3", "Você aprendeu a mudar o lugar de um objeto no 3D", "volte lá.", ILHA,
                  [("Aula 3", ["Escolha seu esconderijo e teste de verdade"])], "na Ilha do Farol")


def a2p5():
    c, t0, t1 = cena("Missão cumprida", "Missão cumprida", "está no fim da Aula 1.")
    t_se = voz.palavra("Se quiser conferir", t0)
    c.ideia("Missão cumprida!", t0 + 0.05, t_se - 0.05, None)
    c.ideia("O Passo a passo", t_se, t1, "está no fim da Aula 1")
    chao3d(c, t0, t_se)
    personagem3d(c, "Aventureiro", t0 + 0.1, t_se, [(t0, (F3[0] - 150, F3[1], 0.5))])
    flor3d(c, t0 + 0.1, t0 + 0.5, t_se)
    for k, (x, y) in enumerate(((300, 470), (700, 400), (1100, 480))):
        estrela_no(c, x, y, t0 + 0.8 + 0.3 * k, t_se, r=46)
    img, _ = c.bloco("curso-jardim", 300, 330, 0.75, fundo=BRANCO, pad=12)
    vis(c, img, [(t_se, t1)])
    c.salvar("conceito-1-missao-cumprida")


{(1, 1): a1p1, (1, 2): a1p2, (1, 3): a1p3, (1, 4): a1p4, (1, 5): a1p5,
 (2, 1): a2p1, (2, 2): a2p2, (2, 3): a2p3, (2, 4): a2p4, (2, 5): a2p5}[(AULA, PARTE)]()
