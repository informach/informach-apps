"""Exemplo: as animações da Ilha do Farol, Aula 3, Parte 3, "O que muda com o não?" (parte de experiência,
22/11/2026). A fala inteira vira cena, sem a tela da experiência. A descoberta da criança é o que o não faz com a
resposta da porta: nenhuma cena mostra a porta com o não abrindo ou fechando.

Os tempos saem da voz da parte (tempos_da_voz.Voz), já na linha do tempo da edição: grave antes de gerar.
  1. conceito-1-uma-palavrinha-nova ("Seu farol já acende!" até "o não"): o farol acende; a palavra "não" chega.
  2. conceito-2-as-plaquinhas ("Sabe a plaquinha" até "uma palavrinha de diferença"): "[na edição: as duas
     plaquinhas de loja]": "Pode entrar" e "Não pode entrar", com o não destacado.
  3. conceito-3-a-porta-que-pergunta ("Imagine uma porta" até "a resposta é sim"): a porta pergunta "Está
     trancada?"; com o sim, ela abre.
  4. conceito-4-e-com-o-nao (a pergunta da Debinha e "O que você acha?" até "na experiência"): a pergunta ganha
     o não e a porta fica com "?". A Debinha fala por cima, à esquerda: a porta fica do meio para a direita.
  5. conceito-5-sua-investigacao ("Agora você vai investigar" até "repetir quando quiser"): o Zappy, a porta,
     com a chave e sem a chave, e "repita quando quiser". O "clique em Próxima parte" fica na tela.
Imagens (pasta de blocos): os renders (farol-listrado, farol-listrado-aceso, chave, zappy).
Uso: ilha-a3p3-conceitos.py <base.edisvg> <pasta dos blocos> <pasta de saída (a pasta pecas da parte)>
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from edisvg_cena import AMARELO, BRANCO, SUAVE, TINTA, VERDE, Cena, tf  # noqa: E402
from ilha_cena import balao_pensa, estrela, no_chao  # noqa: E402
from tempos_da_voz import Voz  # noqa: E402

BASE, BLOCOS, SAIDA = sys.argv[1:4]
voz = Voz.da_parte("ilha", 3, 3)
VERMELHO, MADEIRA, MADEIRA_ESCURA, PAREDE = "#E2563B", "#B7793F", "#7A4A22", "#F6E7C8"


def placa(c, nome, texto, cx, cy, cor, w=560):
    """Plaquinha de loja pendurada por dois fios."""
    filhos = [
        c.rect("fio esquerdo", -w / 2 + 60, -110, 6, 110, "#6B5B4B"),
        c.rect("fio direito", w / 2 - 66, -110, 6, 110, "#6B5B4B"),
        c.rect("placa", -w / 2, 0, w, 150, BRANCO, rx=28, stroke=cor, sw=10),
        c.texto("texto", texto, 0, 98, 60, cor, ancora="middle"),
    ]
    g = c.grupo(nome, cx, cy, filhos, op=0)
    c.nos.append(g)
    return g


def porta(c, nome, x, y, op=0):
    """Batente e folha da porta; a folha (devolvida) abre encolhendo para o lado da dobradiça."""
    batente = c.rect(f"{nome} · batente", x - 24, y - 24, 328, 548, MADEIRA_ESCURA, rx=18, op=op)
    vao = c.rect(f"{nome} · vão", x, y, 280, 500, "#3B2A1E", op=op)
    folha = c.grupo(f"{nome} · folha", x, y, [
        c.rect("folha", 0, 0, 280, 500, MADEIRA, rx=8),
        c.rect("almofada de cima", 40, 50, 200, 160, "#C98A4E", rx=10),
        c.rect("almofada de baixo", 40, 270, 200, 170, "#C98A4E", rx=10),
        c.rect("maçaneta", 232, 250, 26, 26, AMARELO, rx=13),
    ], op=op)
    c.nos += [batente, vao, folha]
    return batente, vao, folha


def mostra_porta(c, partes, t0, t1=None):
    for p in partes:
        c.mostra(p, t0, t1)


# 1. Uma palavrinha nova.
t0, t1 = voz.trecho("Seu farol já acende", "o não.")
c = Cena("Conceito · Uma palavrinha nova", t0, t1, BASE, BLOCOS, SAIDA)
t_pergunta = voz.palavra("numa pergunta", t0)
c.ideia("O seu farol acende", t0 + 0.05, t_pergunta - 0.1, None)
c.ideia("Uma palavra nova", t_pergunta - 0.05, t1, None)
apagado = no_chao(c, "Farol apagado", "farol-listrado", 640, 960, 0.75)
c.mostra(apagado, t0 + 0.1, t0 + 1.2)
aceso = no_chao(c, "Farol aceso", "farol-listrado-aceso", 640, 960, 0.75)
c.mostra(aceso, t0 + 1.0, pop=True)
brilho = estrela(c, "Estrela · acendeu", 640, 330, 54)
c.mostra(brilho, t0 + 1.2, t0 + 2.2, pop=True)
pergunta = balao_pensa(c, "Balão · pergunta", 1180, 520, "?")
c.mostra(pergunta, t_pergunta, pop=True)
t_nao = voz.palavra("o não", t_pergunta)
nao = c.caixa("Palavra · não", "não", VERMELHO, BRANCO, 1180, 760, 220, tam=64)
c.mostra(nao, t_nao, pop=True)
c.salvar("conceito-1-uma-palavrinha-nova")

# 2. As plaquinhas.
t0, t1 = voz.trecho("Sabe a plaquinha", "palavrinha de diferença.")
c = Cena("Conceito · As plaquinhas", t0, t1, BASE, BLOCOS, SAIDA)
t_pode = voz.palavra("Pode entrar", t0)
t_nao_pode = voz.palavra("Não pode entrar", t_pode)
t_dif = voz.palavra("As duas frases", t_nao_pode)
c.ideia("As plaquinhas da loja", t0 + 0.05, t_dif - 0.1, None)
c.ideia("Uma palavra de diferença", t_dif - 0.05, t1, None)
pode = placa(c, "Placa · pode entrar", "Pode entrar", 520, 560, VERDE)
c.mostra(pode, t_pode - 0.1, pop=True)
nao_pode = placa(c, "Placa · não pode entrar", "Não pode entrar", 1260, 560, VERMELHO, w=640)
c.mostra(nao_pode, t_nao_pode - 0.1, pop=True)
destaque = c.rect("Destaque · o não", 1260 - 290, 560 + 22, 150, 106, "none", rx=24, stroke=AMARELO, sw=10, op=0)
c.nos.append(destaque)
c.pisca(destaque, t_dif, t1, vezes=3)
c.salvar("conceito-2-as-plaquinhas")

# 3. A porta que pergunta.
t0, t1 = voz.trecho("Imagine uma porta", "resposta é sim.")
c = Cena("Conceito · A porta que pergunta", t0, t1, BASE, BLOCOS, SAIDA)
t_tranc = voz.palavra("a porta está trancada", t0)
t_abre = voz.palavra("E que abre", t_tranc)
t_sim = voz.palavra("é sim", t_abre)
c.ideia("A porta que pergunta", t0 + 0.05, t1, None)
parede = c.rect("Parede", 560, 330, 800, 680, PAREDE, rx=30, op=0)
c.nos.append(parede)
c.mostra(parede, t0 + 0.1)
_, _, folha = partes = porta(c, "Porta", 820, 430)
mostra_porta(c, partes, t0 + 0.2)
balao = c.balao("Balão · trancada?", "Está trancada?", 1500, 470, 420, -160)
c.mostra(balao, t_tranc, pop=True)
sim = c.caixa("Resposta · sim", "sim", VERDE, BRANCO, 1500, 700, 180, tam=60)
c.mostra(sim, t_sim, pop=True)
c.trilha(folha, "sx", [(t_sim + 0.3, 1, None), (t_sim + 1.0, 0.18, SUAVE)])
c.salvar("conceito-3-a-porta-que-pergunta")

# 4. E com o não? (a Debinha à esquerda).
t0 = voz.palavra("Com o não na pergunta", t1)
t1 = voz.fim("testar na experiência.", t0)
c = Cena("Conceito · E com o não?", t0, t1, BASE, BLOCOS, SAIDA)
t_acha = voz.palavra("O que você acha", t0)
c.ideia("E com o não?", t0 + 0.05, t_acha - 0.1, None)
c.ideia("O que você acha?", t_acha - 0.05, t1, None)
parede = c.rect("Parede", 900, 330, 760, 680, PAREDE, rx=30, op=0)
c.nos.append(parede)
c.mostra(parede, t0 + 0.1)
partes = porta(c, "Porta", 1140, 430)
mostra_porta(c, partes, t0 + 0.15)
balao = c.balao("Balão · não está trancada?", "Não está trancada?", 1380, 330, 470, -120)
c.mostra(balao, t0 + 0.6, pop=True)
duvida = balao_pensa(c, "Balão · ?", 1560, 760, "?")
c.mostra(duvida, t_acha, pop=True)
c.salvar("conceito-4-e-com-o-nao")

# 5. Sua investigação.
t0 = voz.palavra("Agora você vai investigar", t1)
t1 = voz.fim("repetir quando quiser.", t0)
c = Cena("Conceito · Sua investigação", t0, t1, BASE, BLOCOS, SAIDA)
t_com = voz.palavra("com a chave", t0)
t_sem = voz.palavra("sem a chave", t_com)
t_zappy = voz.palavra("O Zappy", t_sem)
t_rep = voz.palavra("pode repetir", t_zappy)
c.ideia("Sua investigação", t0 + 0.05, t_zappy - 0.1, None)
c.ideia("O Zappy te mostra", t_zappy - 0.05, t1, None)
parede = c.rect("Parede", 120, 360, 560, 600, PAREDE, rx=30, op=0)
c.nos.append(parede)
c.mostra(parede, t0 + 0.1, t_zappy)
partes = porta(c, "Porta", 260, 420)
mostra_porta(c, partes, t0 + 0.15, t_zappy)
nao = c.caixa("Palavra · não", "não", VERMELHO, BRANCO, 400, 330, 200, tam=56)
c.mostra(nao, t0 + 0.6, t_zappy, pop=True)
com = no_chao(c, "Chave · com", "chave", 900, 700, 0.5)
c.mostra(com, t_com, t_zappy, pop=True)
c.mostra(c.caixa("Caixa · com a chave", "com a chave", BRANCO, TINTA, 900, 800, 360, num=1), t_com, t_zappy, pop=True)
sem = no_chao(c, "Chave · sem", "chave", 1400, 700, 0.5)
c.trilha(sem, "opacity", [(t_sem, 0, None), (t_sem + 0.3, 35, None), (t_zappy - 0.25, 35, None), (t_zappy, 0, None)])
risco = c.rect("Risco · sem a chave", 1400 - 150, 560, 300, 14, VERMELHO, rx=7, op=0)
risco["transform"] = {**tf(op=0), "rotation": -30}
c.nos.append(risco)
c.mostra(risco, t_sem + 0.2, t_zappy)
c.mostra(c.caixa("Caixa · sem a chave", "sem a chave", BRANCO, TINTA, 1400, 800, 360, num=2), t_sem, t_zappy, pop=True)
zp = no_chao(c, "Zappy", "zappy", 640, 960, 0.95)
c.mostra(zp, t_zappy, pop=True)
c.mostra(c.caixa("Caixa · repita", "repita quando quiser", BRANCO, TINTA, 1180, 560, 460, num=3), t_rep, pop=True)
c.salvar("conceito-5-sua-investigacao")
