"""Sons de interface do Morada: cliques, painéis, confirmação, dinheiro, nível, conquista, velocidade do tempo
e modo construir. Quase tudo sintetizado aqui; algumas alternativas vêm dos pacotes CC0 da Kenney."""
import numpy as np
from sons_lib import *
from sons_instrumentos import *

CAT = "interface"


def s(ident, x, nome, grupo, desc="", **kw):
    it = salvar(CAT, ident, x, nome, grupo, descricao=desc, **kw)
    print(f"{ident:28s} {it['dur']:6.2f}s  {it['lufs']:6.1f} LUFS  pico {it['pico_dbfs']:5.1f}")


def swoosh(dur, f_ini, f_fim, semente=0, q=1.2):
    n = n_am(dur)
    z = ruido(n, rng(semente))
    fc = np.geomspace(f_ini, f_fim, n)
    y = filtro_variavel(z, fc, "band", q)
    return y * np.sin(np.linspace(0, np.pi, n)) ** 1.5 * 2.5


def clique(f=1900, dur=0.05, semente=0, corpo=1.0):
    y = modal([f, f * 2.1, f * 3.6, f * 0.52], [0.045, 0.025, 0.012, 0.07], [1, 0.45, 0.2, 0.45 * corpo], max(dur, 0.08), 0.0003)
    t = hp(ruido(n_am(0.003), rng(semente)), 3000) * env_exp(n_am(0.003), 0.0001, 0.003) * 0.6
    y[: len(t)] += t
    return y


def seq(notas, fn, passo, cauda=0.6):
    """Sequência de notas (lista de (nota, tempo_inicio)) com o timbre fn(f)."""
    dur = max(t for _, t in notas) + cauda
    y = np.zeros(n_am(dur))
    for nota, t0 in notas:
        y = misturar_em(y, fn(hz(nota)), t0)
    return y


def main():
    # cliques e foco
    s("clique", clique(1900), "Clique", "Botões", "toque curto de plástico, para botões")
    s("clique_suave", mix(clique(1500, corpo=0.5) * 0.7, clique(3100, semente=2) * 0.15), "Clique suave", "Botões",
      "variação mais macia, para listas e abas")
    n = n_am(0.05)
    s("passar_mouse", np.sin(fase(2900, n)) * env_exp(n, 0.002, 0.03) * 0.5 + np.sin(fase(4350, n)) * env_exp(n, 0.002, 0.015) * 0.15,
      "Passar o mouse", "Botões", "tique agudo e leve ao passar sobre um botão")

    # painéis
    ab = swoosh(0.22, 600, 3200, 1) * 0.35
    ab = misturar_em(ab, marimba(hz("C6"), 0.4) * 0.6, 0.05)
    ab = misturar_em(ab, marimba(hz("G6"), 0.5) * 0.5, 0.11)
    s("abrir_painel", reverb(ab, 0.6, 0.12), "Abrir painel", "Painéis", "sopro que sobe e duas notas de marimba")
    fe = swoosh(0.2, 3000, 500, 2) * 0.35
    fe = misturar_em(fe, marimba(hz("G6"), 0.35) * 0.5, 0.02)
    fe = misturar_em(fe, marimba(hz("C6"), 0.45) * 0.55, 0.08)
    s("fechar_painel", reverb(fe, 0.6, 0.12), "Fechar painel", "Painéis", "sopro que desce e duas notas de marimba")

    # respostas
    s("confirmar", reverb(seq([("E6", 0), ("B6", 0.085)], lambda f: mix(sino(f, 0.7, 0.6, 1.0) * 0.6, marimba(f, 0.4) * 0.5), 0.085), 0.8, 0.15),
      "Confirmar", "Respostas", "duas notas de sino que sobem")
    s("cancelar", reverb(seq([("A5", 0), ("E5", 0.09)], lambda f: mix(marimba(f, 0.35, 0.6), kalimba(f, 0.4) * 0.3), 0.09), 0.6, 0.1),
      "Cancelar", "Respostas", "duas notas suaves que descem")

    def buzz(f, dur):
        n = n_am(dur)
        y = lp(quadrada(f, n, 12), 1400) * env_adsr(n, 0.005, 0.05, 0.8, 0.04)
        return y
    er = np.zeros(n_am(0.45))
    er = misturar_em(er, buzz(hz("D#4"), 0.13), 0)
    er = misturar_em(er, buzz(hz("D4"), 0.2), 0.16)
    s("erro", reverb(er, 0.4, 0.08), "Erro", "Respostas", "\"ãh-ãh\" de dois toques graves")
    s("notificacao", reverb(seq([("C6", 0), ("E6", 0.09), ("G6", 0.18)], lambda f: mix(sino(f, 1.0, 0.5, 1.0) * 0.5, glock(f, 0.8) * 0.4), 0.09), 1.2, 0.25),
      "Notificação", "Respostas", "três notas de sino em arpejo")

    # dinheiro
    def moeda(f, semente):
        r = rng(semente)
        fs = [f, f * 2.32, f * 4.25, f * 6.63, f * 1.41]
        return modal(fs, [0.5, 0.3, 0.18, 0.1, 0.4], [1, 0.6, 0.35, 0.2, 0.3], 0.6, 0.0004) * (0.8 + 0.4 * r.random())
    din = np.zeros(n_am(1.2))
    r = rng(5)
    for k in range(6):
        din = misturar_em(din, moeda(2300 + r.uniform(-300, 400), k) * (0.6 if k else 1), 0.03 + k * 0.045 + r.uniform(0, 0.02))
    din = misturar_em(din, sino(hz("E7"), 0.9, 0.8, 1.0) * 0.35, 0.3)
    din = misturar_em(din, sino(hz("A7"), 0.9, 0.8, 1.0) * 0.3, 0.38)
    s("dinheiro_entra", reverb(din, 0.7, 0.18), "Dinheiro entrando", "Dinheiro", "moedas tilintando e o \"plim\" da caixa registradora")
    sai = swoosh(0.35, 2500, 400, 6) * 0.25
    for k in range(4):
        sai = misturar_em(sai, moeda(2600 - k * 280, 20 + k) * (0.9 - k * 0.15), 0.02 + k * 0.07)
    s("dinheiro_sai", reverb(sai, 0.6, 0.15), "Dinheiro saindo", "Dinheiro", "moedas que descem e um sopro")

    # progresso
    niv = seq([("C5", 0), ("E5", 0.07), ("G5", 0.14), ("C6", 0.21), ("E6", 0.28)], lambda f: mix(glock(f, 1.0) * 0.6, marimba(f, 0.6) * 0.4), 0.07, 1.0)
    br = np.zeros(len(niv))
    r = rng(9)
    for k in range(18):
        br = misturar_em(br, sino(r.uniform(4000, 9000), 0.25, 0.4, 1.0) * 0.08, 0.28 + k * 0.035)
    s("subir_nivel", reverb(mix(niv, br), 1.0, 0.22), "Subir de nível", "Progresso", "arpejo de glockenspiel que sobe, com brilho")

    def acorde(notas, t0, dur, buf):
        for nn in notas:
            buf = misturar_em(buf, metais(hz(nn), dur) * 0.35, t0)
        return buf
    cq = np.zeros(n_am(2.6))
    cq = acorde(["C4", "E4", "G4"], 0.0, 0.16, cq)
    cq = acorde(["C4", "E4", "G4"], 0.18, 0.16, cq)
    cq = acorde(["C4", "F4", "A4"], 0.36, 0.16, cq)
    cq = acorde(["D4", "G4", "B4"], 0.54, 0.22, cq)
    cq = acorde(["E4", "G4", "C5", "E5"], 0.8, 1.1, cq)
    cq = misturar_em(cq, tom_tambor(98, 0.5) * 0.5, 0.8)
    cq = misturar_em(cq, prato(1.6, 3) * 0.12, 0.8)
    for k, nn in enumerate(["C6", "E6", "G6", "C7"]):
        cq = misturar_em(cq, glock(hz(nn), 1.2) * 0.25, 0.85 + k * 0.06)
    s("conquista", reverb(cq, 1.2, 0.25), "Conquista", "Progresso", "pequena fanfarra de metais com glockenspiel")

    # velocidade do tempo
    def blip(f, dur=0.1):
        n = n_am(dur)
        return (np.sin(fase(f, n)) + 0.3 * np.sin(fase(f * 2, n))) * env_adsr(n, 0.003, 0.05, 0.6, 0.04)
    p = np.zeros(n_am(0.35))
    p = misturar_em(p, blip(hz("G5"), 0.1), 0)
    p = misturar_em(p, blip(hz("C5"), 0.16), 0.1)
    s("tempo_pausa", reverb(p, 0.4, 0.08), "Pausar o tempo", "Tempo", "dois toques que descem")
    for k, nome in [(1, "tempo_1x"), (2, "tempo_2x"), (3, "tempo_3x")]:
        y = np.zeros(n_am(0.12 + 0.075 * k))
        for j in range(k):
            y = misturar_em(y, blip(hz(["C5", "E5", "G5"][j]) * (1 + 0.0 * j)), j * 0.075)
        s(nome, reverb(y, 0.4, 0.08), f"Velocidade {k}×", "Tempo", f"{k} toque(s) que sobem")

    # modo construir
    def baque(semente, f=180):
        n = n_am(0.25)
        r = rng(semente)
        y = np.sin(fase(f * (1 + 0.6 * np.exp(-np.arange(n) / SR / 0.012)), n)) * env_exp(n, 0.001, 0.12)
        y += modal([620 + r.uniform(-60, 60), 1450, 2300], [0.07, 0.04, 0.025], [0.5, 0.25, 0.12], 0.25)
        y += bp(ruido(n, r), 300, 3000) * env_exp(n, 0.0005, 0.03) * 0.6
        return y
    for k in range(3):
        y = baque(k, 160 + 25 * k)
        y = misturar_em(y, clique(2400 + 200 * k, semente=k) * 0.25, 0.0)
        s(f"construir_por_{k + 1}", reverb(y, 0.35, 0.1), f"Pôr peça {k + 1}", "Construir", "baque de madeira de encaixar a peça")
    g = swoosh(0.18, 900, 1800, 11) * 0.3
    for k in range(3):
        g = misturar_em(g, clique(2800 - k * 150, 0.04, k, 0.3) * 0.7, 0.02 + k * 0.045)
    s("construir_girar", reverb(g, 0.3, 0.08), "Girar peça", "Construir", "catraca de três estalos com um sopro")
    n = n_am(0.45)
    z = ruido(n, rng(12))
    poof = filtro_variavel(z, np.geomspace(2500, 300, n), "band", 0.8) * env_exp(n, 0.004, 0.35) * 2.5
    poof += np.sin(fase(np.geomspace(500, 120, n), n)) * env_exp(n, 0.002, 0.12) * 0.4
    s("construir_apagar", reverb(poof, 0.4, 0.1), "Apagar peça", "Construir", "\"puf\" de poeira")
    pin = np.zeros(n_am(0.75))
    for k, (t0, a, b) in enumerate([(0, 1200, 2600), (0.3, 2400, 1100)]):
        nn = n_am(0.32)
        z = ruido(nn, rng(30 + k))
        trace = filtro_variavel(z, np.geomspace(a, b, nn), "band", 1.5) * np.sin(np.linspace(0, np.pi, nn)) ** 0.8
        trace *= 1 + 0.3 * np.sin(2 * np.pi * 38 * np.arange(nn) / SR)   # textura úmida do rolo
        pin = misturar_em(pin, trace * 2.2, t0)
    pin = misturar_em(pin, hp(ruido(n_am(0.05), rng(40)), 600) * env_exp(n_am(0.05), 0.001, 0.04) * 0.3, 0.62)
    s("construir_pintar", reverb(pin, 0.3, 0.08), "Pintar", "Construir", "duas passadas de rolo de tinta")

    # alternativas CC0 (Kenney, pacotes "Interface Sounds" e "Casino Audio")
    alts = [
        ("interface-sounds", "x/Audio__maximize_006.ogg", "abrir_painel_kenney", "Abrir painel (Kenney)", "Painéis"),
        ("interface-sounds", "x/Audio__minimize_006.ogg", "fechar_painel_kenney", "Fechar painel (Kenney)", "Painéis"),
        ("interface-sounds", "x/Audio__confirmation_002.ogg", "confirmar_kenney", "Confirmar (Kenney)", "Respostas"),
        ("interface-sounds", "x/Audio__error_006.ogg", "erro_kenney", "Erro (Kenney)", "Respostas"),
        ("interface-sounds", "x/Audio__drop_002.ogg", "construir_por_kenney", "Pôr peça (Kenney)", "Construir"),
        ("54-casino-sound-effects-cards-dice-chips", "x/Audio__chips-stack-3.ogg", "dinheiro_fichas_kenney", "Dinheiro, fichas (Kenney)", "Dinheiro"),
    ]
    for slug, arq, ident, nome, grupo in alts:
        try:
            x, cr = cc0(slug, arq)
        except FileNotFoundError as e:
            print("faltou", e); continue
        s(ident, x, nome, grupo, "alternativa de um pacote CC0", origem="cc0", creditos=[cr], max_limite=18.0)


if __name__ == "__main__":
    main()
