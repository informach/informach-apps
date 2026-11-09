"""Músicas do Morada, compostas aqui por código: um sequenciador simples com instrumentos sintetizados
(sons_instrumentos.py). Cada música tem três partes: início (introdução curta), laço (o corpo, de 1 a 2 min,
sem emenda: as notas e a reverberação que passam do fim voltam ao começo) e fim (cadência com cauda).
O laço é normalizado a -20 LUFS; início e fim recebem o mesmo ganho, para a passagem não mudar de volume.

Uso: python sons_musica.py [nome ...]   (menu, construir, casa_dia, casa_noite, festa, romance, tensao)
"""
import sys
import numpy as np
from sons_lib import *
from sons_instrumentos import *

CAT = "musica"

ACORDES = {"": [0, 4, 7], "m": [0, 3, 7], "7": [0, 4, 7, 10], "maj7": [0, 4, 7, 11], "m7": [0, 3, 7, 10],
           "6": [0, 4, 7, 9], "sus4": [0, 5, 7], "dim": [0, 3, 6], "add9": [0, 4, 7, 14], "m6": [0, 3, 7, 9]}
ESCALAS = {"maior": [0, 2, 4, 5, 7, 9, 11], "menor": [0, 2, 3, 5, 7, 8, 10]}


def acorde(simb, oitava=3):
    """'F#m7' → (fundamental midi, [notas midi])."""
    raiz = simb[:2] if len(simb) > 1 and simb[1] in "#b" else simb[:1]
    tipo = simb[len(raiz):]
    m = 12 * (oitava + 1) + NOTAS[raiz]
    return m, [m + i for i in ACORDES[tipo]]


class Peca:
    def __init__(self, bpm, compasso=4, semente=0):
        self.bpm = bpm
        self.cb = compasso
        self.spb = 60.0 / bpm
        self.ev = []
        self.r = rng(semente)

    def nota(self, t, fn, dur_b, ganho=1.0, pan=0.0, rev=0.25):
        """t e dur em tempos (batidas); fn(dur_s) devolve o som mono."""
        self.ev.append((t, fn, dur_b, ganho, pan, rev))

    def render(self, total_b, circular, cauda=3.0, rev_dur=1.8, rev_mix=1.0, brilho=7000):
        n = n_am(total_b * self.spb + (0 if circular else cauda))
        seco = np.zeros((n, 2))
        envio = np.zeros((n, 2))
        for t, fn, dur_b, g, pan, rev in self.ev:
            som = fn(dur_b * self.spb)
            st = estereo(som * g, pan)
            misturar_em(seco, st, t * self.spb, circular=circular)
            misturar_em(envio, st * rev, t * self.spb, circular=circular)
        molhado = reverb(envio, rev_dur, 1.0, brilho, circular=circular, semente=11)[:n]
        molhado = molhado - envio * 0.5   # reverb() devolve seco*(1-mix/2)+mol*mix; aqui só o molhado
        y = seco + molhado * rev_mix * 0.6
        # cola leve: compressão suave de pico (tanh) no barramento
        return np.tanh(y * 1.2) / 1.2


# ---------------------------------------------------------------- melodia gerada com motivos

RITMOS = [  # padrões de 1 compasso em 4/4: (início, duração) em tempos
    [(0, 1), (1, 0.5), (1.5, 0.5), (2, 1.5), (3.5, 0.5)],
    [(0, 0.5), (0.5, 0.5), (1, 1), (2, 0.5), (2.5, 0.5), (3, 1)],
    [(0, 1.5), (1.5, 0.5), (2, 1), (3, 1)],
    [(0.5, 0.5), (1, 0.5), (1.5, 1), (2.5, 0.5), (3, 1)],
    [(0, 1), (1, 1), (2, 0.5), (2.5, 0.5), (3, 0.5), (3.5, 0.5)],
]


def melodia(peca, prog, tom, escala, oitava, compassos, semente, ritmos=None, cadencia=4):
    """Gera notas (tempo, midi, dur) sobre a progressão: motivo de 1 compasso repetido e variado,
    notas do acorde nos tempos fortes, graus da escala nos fracos, frase fechando a cada 4 compassos."""
    r = rng(semente)
    ritmos = ritmos or RITMOS
    esc = [12 * (oitava + 1) + NOTAS[tom] + e + 12 * k for k in (-1, 0, 1) for e in ESCALAS[escala]]
    lo, hi = 12 * (oitava + 1) + NOTAS[tom] - 3, 12 * (oitava + 2) + NOTAS[tom] + 5
    notas = []
    motivo = ritmos[r.integers(len(ritmos))]
    motivo_b = ritmos[r.integers(len(ritmos))]
    atual = 12 * (oitava + 1) + NOTAS[tom] + 4
    for c in range(compassos):
        _, tons = acorde(prog[c % len(prog)], oitava)
        tons_all = [t + 12 * k for t in tons for k in (-1, 0, 1)]
        fim_frase = (c % cadencia) == cadencia - 1
        ritmo = motivo if (c // 2) % 2 == 0 else motivo_b
        if fim_frase:
            ritmo = [(0, 1), (1, 1), (2, 2)] if r.random() < 0.6 else [(0, 0.5), (0.5, 0.5), (1, 3)]
        for i, (t0, d) in enumerate(ritmo):
            forte = t0 in (0, 2) or (fim_frase and i == len(ritmo) - 1)
            cand = tons_all if forte else esc
            cand = [m for m in cand if lo <= m <= hi]
            # passo pequeno preferido; às vezes um salto
            pesos = np.array([np.exp(-abs(m - atual) / (2.5 if r.random() < 0.8 else 6)) for m in cand])
            if fim_frase and i == len(ritmo) - 1:
                cand = [m for m in tons_all if lo <= m <= hi and (m - tons[0]) % 12 in (0, 4, 3, 7)]
                pesos = np.array([np.exp(-abs(m - atual) / 3) for m in cand])
            m = cand[r.choice(len(cand), p=pesos / pesos.sum())]
            atual = m
            notas.append((c * peca.cb + t0, m, d))
    return notas


# ---------------------------------------------------------------- arranjos

def bateria(p, compassos, estilo, ini=0, ganho=1.0, sem_virada=False):
    for c in range(compassos):
        b = ini + c * p.cb
        ult = (c % 8 == 7) and not sem_virada
        if estilo == "pop":
            for t in (0, 2.5):
                p.nota(b + t, lambda d: bumbo(0.4), 0.5, 0.75 * ganho, 0, 0.05)
            for t in (1, 3):
                p.nota(b + t, lambda d, s=c: mix(caixa(0.22, s, 200) * 0.6, palmas(s) * 0.25), 0.5, 0.42 * ganho, 0.05, 0.25)
            for k in range(8):
                p.nota(b + k * 0.5, lambda d, s=c * 8 + k: chocalho(0.1, s), 0.25, (0.16 if k % 2 else 0.1) * ganho, 0.35, 0.1)
            if ult:
                for k, t in enumerate((3, 3.25, 3.5, 3.75)):
                    p.nota(b + t, lambda d, f=[220, 180, 150, 120][k]: tom_tambor(f, 0.3, k), 0.25, 0.35 * ganho, -0.3 + 0.2 * k, 0.2)
        elif estilo == "suave":
            p.nota(b, lambda d: bumbo(0.35, 90, 45), 0.5, 0.5 * ganho, 0, 0.05)
            p.nota(b + 2.5, lambda d: bumbo(0.35, 90, 45), 0.5, 0.35 * ganho, 0, 0.05)
            for t in (1, 3):
                p.nota(b + t, lambda d, s=c: vassourinha(0.25, s), 0.5, 0.35 * ganho, 0.1, 0.3)
            for k in range(8):
                p.nota(b + k * 0.5, lambda d, s=c * 8 + k: chocalho(0.08, s), 0.25, (0.1 if k % 2 else 0.06) * ganho, -0.3, 0.1)
        elif estilo == "festa":
            for t in range(4):
                p.nota(b + t, lambda d: bumbo(0.38, 140, 50), 0.5, 0.85 * ganho, 0, 0.03)
                p.nota(b + t + 0.5, lambda d, s=c * 4 + t: chimbal(0.06, s, aberto=True), 0.5, 0.22 * ganho, 0.25, 0.1)
            for t in (1, 3):
                p.nota(b + t, lambda d, s=c: palmas(s), 0.5, 0.5 * ganho, -0.1, 0.3)
            for k in range(16):
                p.nota(b + k * 0.25, lambda d, s=c * 16 + k: chimbal(0.03, s), 0.25, (0.1 if k % 2 else 0.05) * ganho, 0.4, 0.05)
            if ult:
                for k in range(4):
                    p.nota(b + 3 + k * 0.25, lambda d, s=k: caixa(0.15, s, 220), 0.25, (0.25 + 0.08 * k) * ganho, 0, 0.2)
        elif estilo == "brincar":
            for t in (0, 2):
                p.nota(b + t, lambda d: bumbo(0.3, 110, 55), 0.5, 0.55 * ganho, 0, 0.05)
            for t in (1, 3):
                p.nota(b + t, lambda d, s=c: palmas(s), 0.5, 0.4 * ganho, 0.1, 0.3)
            for k, t in enumerate((0.5, 1.5, 2.5, 3.25, 3.5)):
                p.nota(b + t, lambda d, f=[900, 1200, 900, 1200, 1000][k]: woodblock(f, 0.1), 0.25, 0.18 * ganho, -0.4, 0.15)
        elif estilo == "tensao":
            for k in range(8):
                p.nota(b + k * 0.5, lambda d, s=k: tic_relogio(s, 3300 if k % 2 == 0 else 2700), 0.25, (0.25 if k % 2 == 0 else 0.15) * ganho, 0.45 * (1 if k % 2 else -1), 0.15)
            p.nota(b, lambda d: tom_tambor(75, 0.5), 0.5, 0.45 * ganho, 0, 0.2)
            if c % 2 == 1:
                p.nota(b + 3.5, lambda d: tom_tambor(95, 0.3), 0.5, 0.3 * ganho, 0.2, 0.2)


def baixo_linha(p, prog, compassos, ini=0, padrao="pop", oitava=2, ganho=0.5, inst=None):
    inst = inst or (lambda f: (lambda d: baixo(f, d)))
    for c in range(compassos):
        raiz, tons = acorde(prog[c % len(prog)], oitava)
        quinta = raiz + 7
        b = ini + c * p.cb
        if padrao == "pop":
            seq = [(0, raiz, 1.5), (1.5, raiz, 0.5), (2, quinta, 1), (3, raiz + 12 if c % 2 else quinta, 1)]
        elif padrao == "festa":
            seq = [(k * 0.5, raiz + (12 if k % 2 else 0), 0.45) for k in range(8)]
        elif padrao == "suave":
            seq = [(0, raiz, 2.5), (2.5, quinta - 12 if quinta - 12 > 30 else quinta, 1.5)]
        elif padrao == "noite":
            seq = [(0, raiz, 4)]
        elif padrao == "pulso":
            seq = [(k * 0.5, raiz, 0.35) for k in range(8)]
        else:
            seq = [(0, raiz, 1), (1, quinta, 1), (2, raiz + 12, 1), (3, quinta, 1)]
        for t, m, d in seq:
            p.nota(b + t, inst(hz(m)), d, ganho, 0, 0.05)


def acordes_ritmo(p, prog, compassos, ini, inst, padrao, oitava=4, ganho=0.25, pan=0.0, rev=0.3, abertura=0.012):
    """Acordes tocados num padrão de tempos (ataques escalonados como num dedilhado de cordas)."""
    for c in range(compassos):
        _, tons = acorde(prog[c % len(prog)], oitava)
        b = ini + c * p.cb
        for t, d, g in padrao:
            for k, m in enumerate(tons):
                p.nota(b + t + k * abertura / p.spb, inst(hz(m)), d, ganho * g / len(tons) ** 0.5, pan + 0.1 * (k - 1), rev)


def arpejo(p, prog, compassos, ini, inst, passos, oitava=5, ganho=0.25, pan=0.0, rev=0.3, dur=0.5, ordem=(0, 1, 2, 1)):
    for c in range(compassos):
        _, tons = acorde(prog[c % len(prog)], oitava)
        b = ini + c * p.cb
        for i, t in enumerate(passos):
            m = tons[ordem[i % len(ordem)] % len(tons)]
            p.nota(b + t, inst(hz(m)), dur, ganho, pan, rev)


def tocar_melodia(p, notas, inst, ganho, pan=0.0, rev=0.35, ini=0, transp=0, legato=0.95):
    for t, m, d in notas:
        p.nota(ini + t, inst(hz(m + transp)), d * legato, ganho, pan, rev)


# ---------------------------------------------------------------- as sete músicas

def mus_menu(p, parte):
    A = ["C", "G", "Am", "F", "C", "G", "F", "C"]
    B = ["F", "G", "Em", "Am", "Dm", "G", "C", "C"]
    prog = A + A + B + A
    uke = lambda f: (lambda d: corda_ded(f, d + 0.6, 0.6, int(f)))
    strum = [(0, 1, 1.0), (1, 0.5, 0.6), (1.5, 1, 0.8), (2.5, 0.5, 0.6), (3, 1, 0.8)]
    if parte == "laco":
        acordes_ritmo(p, prog, 32, 0, uke, strum, 4, 0.36, -0.25, 0.25)
        baixo_linha(p, prog, 32, 0, "pop", 2, 0.5)
        bateria(p, 32, "pop", 0, 0.8)
        mel = melodia(p, prog, "C", "maior", 5, 32, 101)
        tocar_melodia(p, mel, lambda f: (lambda d: glock(f, max(d, 0.6) + 0.5)), 0.32, 0.2, 0.35)
        tocar_melodia(p, mel, lambda f: (lambda d: marimba(f, max(d, 0.4) + 0.3)), 0.2, 0.25, 0.3, transp=-12)
        return 32 * 4
    if parte == "inicio":
        acordes_ritmo(p, ["F", "G"], 2, 0, uke, strum, 4, 0.36, -0.25, 0.25)
        for k, nn in enumerate(["G5", "A5", "B5", "D6"]):
            p.nota(4 + k, lambda d, f=hz(nn): glock(f, 1.2), 1, 0.3, 0.2, 0.35)
        p.nota(7.5, lambda d: tom_tambor(160, 0.3), 0.5, 0.3, 0, 0.2)
        return 8
    acordes_ritmo(p, ["G7", "C"], 2, 0, uke, [(0, 2, 1.0), (2, 1, 0.7)], 4, 0.36, -0.25, 0.25)
    for k, nn in enumerate(["E5", "G5", "C6"]):
        p.nota(4 + k * 0.33, lambda d, f=hz(nn): glock(f, 2.5), 2, 0.32, 0.2, 0.4)
    p.nota(4, lambda d: baixo(hz("C2"), 1.5), 2, 0.5, 0, 0.05)
    p.nota(4, lambda d: bumbo(0.4), 1, 0.6, 0, 0.05)
    return 8


def mus_construir(p, parte):
    prog = ["F", "Bb", "C", "F", "Dm", "Bb", "C", "C", "Bb", "C", "Am", "Dm", "Gm", "C", "F", "F"]
    mar = lambda f: (lambda d: marimba(f, 0.5))
    if parte == "laco":
        arpejo(p, prog, 32, 0, mar, [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], 4, 0.22, -0.3, 0.2, ordem=(0, 1, 2, 1, 0, 2, 1, 2))
        baixo_linha(p, prog, 32, 0, "brincar", 2, 0.42, inst=lambda f: (lambda d: mix(pizz(f, 0.4) * 1.5, baixo(f, 0.3) * 0.5)))
        bateria(p, 32, "brincar", 0, 0.9)
        mel = melodia(p, prog, "F", "maior", 5, 32, 202)
        tocar_melodia(p, mel, lambda f: (lambda d: assobio(f, d)), 0.24, 0.25, 0.35, legato=0.85)
        mel2 = melodia(p, prog, "F", "maior", 4, 32, 203)
        tocar_melodia(p, [n for i, n in enumerate(mel2) if (n[0] // 16) % 2 == 1], lambda f: (lambda d: pizz(f, 0.35)), 0.3, -0.1, 0.25)
        return 32 * 4
    if parte == "inicio":
        arpejo(p, ["F"], 2, 0, mar, [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], 4, 0.22, -0.3, 0.2, ordem=(0, 1, 2, 1, 0, 2, 1, 2))
        for k in range(4):
            p.nota(4 + k, lambda d, f=[900, 1200, 900, 1500][k]: woodblock(f, 0.1), 0.5, 0.25, 0, 0.15)
        return 8
    p.nota(0, lambda d: mix(marimba(hz("C5"), 0.6), marimba(hz("E5"), 0.6)), 1, 0.3, 0, 0.2)
    p.nota(1, lambda d: mix(marimba(hz("Bb4"), 0.6), marimba(hz("G5"), 0.6)), 1, 0.3, 0, 0.2)
    for k, nn in enumerate(["F4", "A4", "C5", "F5"]):
        p.nota(2 + k * 0.08, lambda d, f=hz(nn): marimba(f, 1.5), 2, 0.3, -0.2 + 0.15 * k, 0.3)
    p.nota(2, lambda d: pizz(hz("F2"), 0.8) * 1.5, 1, 0.45, 0, 0.1)
    p.nota(2, lambda d: palmas(1), 0.5, 0.4, 0, 0.3)
    return 4


def mus_casa_dia(p, parte):
    prog = ["Gmaj7", "Em7", "Cmaj7", "D", "G", "Bm", "C", "D", "Em", "C", "G", "D", "Am7", "D7", "G", "G"]
    ep = lambda f: (lambda d: piano_el(f, d + 0.4, 0.6, d))
    vi = lambda f: (lambda d: corda_ded(f, 1.6, 0.5, int(f * 3)))
    if parte == "laco":
        acordes_ritmo(p, prog, 32, 0, ep, [(0, 1.5, 1.0), (1.5, 1, 0.6), (2.5, 1.5, 0.7)], 3, 0.42, -0.2, 0.3)
        arpejo(p, prog, 32, 0, vi, [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], 4, 0.14, 0.35, 0.25, ordem=(0, 2, 1, 2, 0, 2, 1, 2))
        baixo_linha(p, prog, 32, 0, "suave", 2, 0.42)
        bateria(p, 32, "suave", 0, 0.8)
        mel = melodia(p, prog, "G", "maior", 5, 32, 303)
        tocar_melodia(p, [n for n in mel if n[0] >= 16 * 4 or n[0] < 8 * 4 or True], lambda f: (lambda d: flauta(f, d + 0.05)), 0.25, 0.15, 0.4)
        return 32 * 4
    if parte == "inicio":
        acordes_ritmo(p, ["Cmaj7", "D"], 2, 0, ep, [(0, 1.5, 1.0), (1.5, 1, 0.6), (2.5, 1.5, 0.7)], 3, 0.42, -0.2, 0.3)
        arpejo(p, ["Cmaj7", "D"], 2, 0, vi, [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], 4, 0.14, 0.35, 0.25, ordem=(0, 2, 1, 2, 0, 2, 1, 2))
        baixo_linha(p, ["Cmaj7", "D"], 2, 0, "suave", 2, 0.42)
        bateria(p, 1, "suave", 4, 0.8)
        for k, (nn, t, d) in enumerate([("D5", 6, 0.5), ("E5", 6.5, 0.5), ("F#5", 7, 1)]):
            p.nota(t, lambda dd, f=hz(nn): flauta(f, dd + 0.05), d, 0.25, 0.15, 0.4)
        return 8
    acordes_ritmo(p, ["D7", "Gmaj7"], 2, 0, ep, [(0, 2, 1.0)], 3, 0.42, -0.2, 0.3)
    for k, nn in enumerate(["B4", "D5", "G5"]):
        p.nota(4 + k * 0.5, lambda d, f=hz(nn): flauta(f, 2.0 - 0.5 * k), 2, 0.25, 0.15, 0.45)
    p.nota(4, lambda d: baixo(hz("G2"), 2.0), 2, 0.42, 0, 0.05)
    return 8


def mus_casa_noite(p, parte):
    prog = ["Dmaj7", "Bm7", "Gmaj7", "A6", "Dmaj7", "F#m7", "Gmaj7", "Em7", "Bm7", "Gmaj7", "Em7", "A",
            "Gmaj7", "F#m7", "Em7", "A6", "Dmaj7", "Bm7", "Gmaj7", "A6", "Gmaj7", "A", "Dmaj7", "Dmaj7"]
    ep = lambda f: (lambda d: piano_el(f, d + 1.0, 0.45, d))
    if parte == "laco":
        acordes_ritmo(p, prog, 24, 0, ep, [(0, 3, 1.0), (3, 1, 0.5)], 3, 0.42, -0.15, 0.45, abertura=0.03)
        for c in range(24):
            raiz, tons = acorde(prog[c], 3)
            p.nota(c * 4, lambda d, ts=tons: sum(pad(hz(m + 12), d + 0.6, 1200) for m in ts) / 3, 4, 0.16, 0.0, 0.5)
        baixo_linha(p, prog, 24, 0, "noite", 2, 0.38, inst=lambda f: (lambda d: baixo(f, d, sub=0.9) * env_adsr(n_am(d), 0.05, 0.5, 0.7, 0.4)))
        mel = melodia(p, prog, "D", "maior", 5, 24, 404, ritmos=[[(0, 1.5), (2, 1), (3, 1)], [(0.5, 1), (1.5, 1.5), (3, 1)], [(0, 2), (2, 2)]])
        tocar_melodia(p, mel, lambda f: (lambda d: kalimba(f, 1.6)), 0.3, 0.25, 0.5)
        for c in range(24):
            for k in range(4):
                p.nota(c * 4 + k + 0.5, lambda d, s=c * 4 + k: chocalho(0.1, s), 0.25, 0.04, -0.4, 0.2)
        return 24 * 4
    if parte == "inicio":
        for k, nn in enumerate(["A4", "D5", "F#5", "A5"]):
            p.nota(k * 0.75, lambda d, f=hz(nn): kalimba(f, 2.0), 1, 0.3, 0.2, 0.5)
        acordes_ritmo(p, ["Gmaj7", "A6"], 1, 4, ep, [(0, 2, 0.8), (2, 2, 0.8)], 3, 0.42, -0.15, 0.45)
        return 8
    acordes_ritmo(p, ["Gmaj7"], 1, 0, ep, [(0, 4, 0.9)], 3, 0.42, -0.15, 0.5, abertura=0.06)
    acordes_ritmo(p, ["Dmaj7"], 1, 4, ep, [(0, 4, 0.9)], 3, 0.42, -0.15, 0.5, abertura=0.08)
    p.nota(4, lambda d: baixo(hz("D2"), 3.0, sub=0.9), 4, 0.36, 0, 0.05)
    for k, nn in enumerate(["F#5", "A5", "D6"]):
        p.nota(4.5 + k * 0.7, lambda d, f=hz(nn): kalimba(f, 2.5), 1, 0.28, 0.25, 0.55)
    return 8


def mus_festa(p, parte):
    A = ["A", "F#m", "D", "E", "A", "F#m", "Bm", "E"]
    B = ["D", "E", "C#m", "F#m", "Bm", "E", "A", "E"]
    prog = A + A + B + A + B
    stab = lambda f: (lambda d: piano_el(f, 0.35, 0.9, 0.18))
    lead = lambda f: (lambda d: lp(quadrada(f, n_am(d + 0.05), 10), 2600) * env_adsr(n_am(d + 0.05), 0.01, 0.1, 0.7, 0.05, d))
    if parte == "laco":
        acordes_ritmo(p, prog, 40, 0, stab, [(0.5, 0.25, 1.0), (1.5, 0.25, 0.8), (2.5, 0.25, 1.0), (3.25, 0.25, 0.6), (3.5, 0.25, 0.9)], 4, 0.4, 0.2, 0.2)
        baixo_linha(p, prog, 40, 0, "festa", 2, 0.48)
        bateria(p, 40, "festa", 0, 0.85)
        mel = melodia(p, prog, "A", "maior", 5, 40, 505, ritmos=[[(0, 0.5), (0.5, 0.5), (1.5, 0.5), (2, 1), (3, 0.5), (3.5, 0.5)],
                                                                [(0, 0.75), (0.75, 0.75), (1.5, 0.5), (2.5, 0.5), (3, 1)]])
        tocar_melodia(p, [n for n in mel if (n[0] // 32) % 2 == 1 or n[0] >= 96], lead, 0.16, -0.2, 0.25, legato=0.8)
        for c in range(0, 40, 8):     # metais nos fins de frase
            raiz, tons = acorde(prog[(c + 7) % len(prog)], 4)
            for k, m in enumerate(tons):
                p.nota((c + 7) * 4 + 2.5, lambda d, f=hz(m): metais(f, 0.35), 0.5, 0.18, -0.1 + 0.1 * k, 0.25)
                p.nota((c + 7) * 4 + 3, lambda d, f=hz(m): metais(f, 0.7), 1, 0.2, -0.1 + 0.1 * k, 0.25)
        return 40 * 4
    if parte == "inicio":
        bateria(p, 1, "festa", 4, 0.85, sem_virada=True)
        for k in range(4):
            p.nota(k, lambda d: palmas(k), 0.5, 0.45, 0, 0.3)
        for k in range(4):
            p.nota(4 + 3 + k * 0.25, lambda d, s=k: caixa(0.15, s, 220), 0.25, 0.25 + 0.08 * k, 0, 0.2)
        return 8
    for k, m in enumerate(acorde("E", 4)[1]):
        p.nota(0, lambda d, f=hz(m): metais(f, 0.5), 1, 0.2, -0.1 + 0.1 * k, 0.25)
    for k, m in enumerate(acorde("A", 4)[1] + [acorde("A", 5)[0]]):
        p.nota(1, lambda d, f=hz(m): metais(f, 1.4), 2, 0.2, -0.15 + 0.1 * k, 0.3)
    p.nota(1, lambda d: bumbo(0.5, 140, 50), 1, 0.8, 0, 0.05)
    p.nota(1, lambda d: prato(2.0, 2), 2, 0.25, 0.2, 0.3)
    p.nota(1, lambda d: baixo(hz("A1"), 1.2), 2, 0.5, 0, 0.05)
    return 4


def mus_romance(p, parte):
    prog = ["Ebmaj7", "Cm7", "Fm7", "Bb7", "Gm7", "C7", "Fm7", "Bb7", "Abmaj7", "Bb", "Gm7", "Cm7",
            "Fm7", "Bb7", "Ebmaj7", "Ebmaj7", "Abmaj7", "Gm7", "Fm7", "Bb7", "Gm7", "C7", "Fm7", "Bb7"]
    ep = lambda f: (lambda d: piano_el(f, d + 0.8, 0.55, d))
    if parte == "laco":
        acordes_ritmo(p, prog, 24, 0, ep, [(0, 1.5, 1.0), (1.5, 0.5, 0.5), (2, 2, 0.8)], 3, 0.42, -0.2, 0.4, abertura=0.025)
        for c in range(24):
            _, tons = acorde(prog[c], 4)
            p.nota(c * 4, lambda d, ts=tons: sum(cordas(hz(m), d + 0.4) for m in ts[1:]) / 3, 4, 0.13, 0.25, 0.5)
        baixo_linha(p, prog, 24, 0, "suave", 2, 0.4)
        bateria(p, 24, "suave", 0, 0.6, sem_virada=True)
        mel = melodia(p, prog, "Eb", "maior", 5, 24, 606, ritmos=[[(0, 1.5), (1.5, 0.5), (2, 2)], [(0.5, 1), (1.5, 1), (2.5, 1.5)], [(0, 1), (1, 1), (2, 1), (3, 1)]])
        tocar_melodia(p, mel, lambda f: (lambda d: flauta(f, d + 0.1, sopro=0.12)), 0.25, 0.1, 0.45)
        return 24 * 4
    if parte == "inicio":
        acordes_ritmo(p, ["Abmaj7", "Bb7"], 2, 0, ep, [(0, 1.5, 1.0), (1.5, 0.5, 0.5), (2, 2, 0.8)], 3, 0.42, -0.2, 0.45, abertura=0.04)
        p.nota(0, lambda d: sum(cordas(hz(m), 4.4) for m in acorde("Abmaj7", 4)[1][1:]) / 3, 4, 0.13, 0.25, 0.5)
        p.nota(4, lambda d: sum(cordas(hz(m), 4.4) for m in acorde("Bb7", 4)[1][1:]) / 3, 4, 0.13, 0.25, 0.5)
        baixo_linha(p, ["Abmaj7", "Bb7"], 2, 0, "suave", 2, 0.4)
        for nn, t, d in [("C5", 1, 1), ("Eb5", 2, 1.5), ("F5", 4, 1), ("G5", 5, 1), ("Ab5", 6, 1), ("Bb5", 7, 1)]:
            p.nota(t, lambda dd, f=hz(nn): flauta(f, dd + 0.1, sopro=0.12), d, 0.25, 0.1, 0.45)
        return 8
    acordes_ritmo(p, ["Fm7", "Bb7"], 1, 0, ep, [(0, 2, 0.8), (2, 2, 0.8)], 3, 0.42, -0.2, 0.45)
    acordes_ritmo(p, ["Ebmaj7"], 1, 4, ep, [(0, 4, 0.9)], 3, 0.42, -0.2, 0.5, abertura=0.07)
    p.nota(4, lambda d: sum(cordas(hz(m), 4.0) for m in acorde("Ebmaj7", 4)[1][1:]) / 3, 4, 0.13, 0.25, 0.55)
    p.nota(4, lambda d: flauta(hz("G5"), 3.0, sopro=0.12), 4, 0.25, 0.1, 0.5)
    p.nota(4, lambda d: baixo(hz("Eb2"), 3.0), 4, 0.4, 0, 0.05)
    return 8


def mus_tensao(p, parte):
    prog = ["Am", "Am", "F", "E", "Am", "Am", "Dm", "E", "F", "G", "Em", "Am", "Dm", "E", "Am", "E"]
    pz = lambda f: (lambda d: pizz(f, 0.3))
    fagote = lambda f: (lambda d: lp(serra(f, n_am(d + 0.05), 15), 900) * env_adsr(n_am(d + 0.05), 0.03, 0.1, 0.8, 0.05, d))
    if parte == "laco":
        arpejo(p, prog, 32, 0, pz, [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], 4, 0.3, -0.25, 0.2, ordem=(0, 1, 2, 1, 0, 1, 2, 1))
        baixo_linha(p, prog, 32, 0, "pulso", 2, 0.35, inst=lambda f: (lambda d: mix(pizz(f, 0.3) * 1.4, baixo(f, 0.25) * 0.4)))
        bateria(p, 32, "tensao", 0, 0.8)
        mel = melodia(p, prog, "A", "menor", 3, 32, 707, ritmos=[[(0, 0.5), (1, 0.5), (2, 0.5), (3, 1)], [(0, 1), (1.5, 0.5), (2, 0.5), (3.5, 0.5)]])
        tocar_melodia(p, [n for n in mel if (n[0] // 16) % 2 == 1], fagote, 0.22, 0.2, 0.25, legato=0.75)
        for c in range(3, 32, 4):
            p.nota(c * 4 + 3.5, lambda d: mix(glock(hz("E6"), 0.8) * 0.5, glock(hz("F6"), 0.8) * 0.5), 0.5, 0.12, 0.4, 0.4)
        return 32 * 4
    if parte == "inicio":
        for k in range(8):
            p.nota(k * 0.5, lambda d, s=k: tic_relogio(s, 3300 if k % 2 == 0 else 2700), 0.25, 0.25, 0, 0.15)
        arpejo(p, ["Am", "E"], 2, 0, pz, [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], 4, 0.3, -0.25, 0.2, ordem=(0, 1, 2, 1))
        baixo_linha(p, ["Am", "E"], 2, 0, "pulso", 2, 0.35, inst=lambda f: (lambda d: mix(pizz(f, 0.3) * 1.4, baixo(f, 0.25) * 0.4)))
        p.nota(0, lambda d: tom_tambor(75, 0.5), 0.5, 0.45, 0, 0.2)
        p.nota(4, lambda d: tom_tambor(75, 0.5), 0.5, 0.45, 0, 0.2)
        p.nota(7.5, lambda d: tom_tambor(95, 0.3), 0.5, 0.3, 0.2, 0.2)
        return 8
    for k, m in enumerate([hz("E3"), hz("A2")]):
        p.nota(k * 1.0, lambda d, f=m: pizz(f, 0.5) * 1.5, 1, 0.45, 0, 0.2)
    p.nota(1, lambda d: tom_tambor(70, 0.8), 1, 0.5, 0, 0.3)
    p.nota(1.5, lambda d: glock(hz("A5"), 2.0), 1, 0.2, 0.3, 0.5)
    return 4


MUSICAS = {
    "menu": ("Tema do menu", mus_menu, 108, "Dó maior, ukulele, glockenspiel e bateria leve"),
    "construir": ("Construir", mus_construir, 118, "Fá maior, marimba, pizzicato, palmas e assobio"),
    "casa_dia": ("Casa de dia", mus_casa_dia, 96, "Sol maior, piano elétrico, violão dedilhado e flauta"),
    "casa_noite": ("Casa à noite", mus_casa_noite, 70, "Ré maior, piano elétrico suave, pad e kalimba"),
    "festa": ("Festa", mus_festa, 122, "Lá maior, bumbo a cada tempo, baixo em oitavas, acordes e metais"),
    "romance": ("Romance", mus_romance, 76, "Mi bemol maior, piano elétrico, cordas e flauta"),
    "tensao": ("Tensão leve", mus_tensao, 100, "Lá menor, pizzicato, relógio e fagote de desenho"),
}


def main(nomes):
    for nome in nomes:
        titulo, fn, bpm, desc = MUSICAS[nome]
        partes = {}
        for parte in ("laco", "inicio", "fim"):
            p = Peca(bpm, 4, semente=sum(map(ord, nome)))
            total = fn(p, parte)
            y = p.render(total, circular=(parte == "laco"), cauda=3.5 if parte == "fim" else 2.5)
            partes[parte] = (y, total)
        laco, tb = partes["laco"]
        g = de_db(ALVO_MUSICA - lufs(laco))
        dur_ini = partes["inicio"][1] * 60 / bpm
        comum = {"bpm": bpm, "compasso": 4, "musica": nome, "titulo": titulo}
        it = salvar(CAT, f"{nome}_laco", laco * g, f"{titulo}: laço", titulo, laco=True, alvo=ALVO_MUSICA, normalizado=False,
                    descricao=f"{desc}. Laço de {tb // 4} compassos.", extra=dict(comum, parte="laco", compassos=tb // 4))
        print(f"{nome}_laco  {it['dur']:6.1f}s  {it['lufs']} LUFS")
        y, tb2 = partes["inicio"]
        it = salvar(CAT, f"{nome}_inicio", y * g, f"{titulo}: início", titulo, alvo=ALVO_MUSICA, normalizado=True, aparar_silencio=False,
                    fade_ent=0.002, fade_sai=0.3, descricao=f"Introdução de {tb2 // 4} compassos; o laço entra em {dur_ini:.3f} s",
                    extra=dict(comum, parte="inicio", entrada_do_laco_s=round(dur_ini, 4)))
        print(f"{nome}_inicio {it['dur']:6.1f}s  {it['lufs']} LUFS")
        y, tb3 = partes["fim"]
        it = salvar(CAT, f"{nome}_fim", y * g, f"{titulo}: fim", titulo, alvo=ALVO_MUSICA, normalizado=True, aparar_silencio=False,
                    fade_ent=0.002, fade_sai=0.6, descricao="Cadência final; toque no começo de um compasso do laço",
                    extra=dict(comum, parte="fim"))
        print(f"{nome}_fim   {it['dur']:6.1f}s  {it['lufs']} LUFS")


if __name__ == "__main__":
    main(sys.argv[1:] or list(MUSICAS))
