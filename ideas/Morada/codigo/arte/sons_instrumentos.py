"""Instrumentos e timbres sintetizados usados pela interface, pela casa e pela música do Morada."""
import numpy as np
from sons_lib import *


def sino(f, dur=1.2, brilho=1.0, razao=3.5, queda=None):
    """Sino FM (campainha, notificação, conquista)."""
    n = n_am(dur)
    q = queda or dur
    e = env_exp(n, 0.001, q)
    ei = env_exp(n, 0.001, q * 0.35)
    return fm(f, razao, 2.2 * brilho, n, ei) * e


def marimba(f, dur=0.6, dureza=1.0):
    """Marimba/xilofone de madeira (modos 1 : 3,9 : 9,2)."""
    y = modal([f, f * 3.93, f * 9.2, f * 2.0], [dur, dur * 0.35, dur * 0.12, dur * 0.5],
              [1.0, 0.35 * dureza, 0.12 * dureza, 0.05], dur)
    clique = hp(ruido(n_am(0.004), rng(int(f))), 2000) * env_exp(n_am(0.004), 0.0002, 0.003) * 0.4 * dureza
    y[: len(clique)] += clique
    return y


def kalimba(f, dur=1.0):
    return modal([f, f * 5.4, f * 9.6], [dur, dur * 0.2, dur * 0.08], [1.0, 0.25, 0.08], dur, ataque=0.001)


def glock(f, dur=1.4):
    return modal([f, f * 2.76, f * 5.4, f * 8.93], [dur, dur * 0.5, dur * 0.25, dur * 0.1],
                 [1.0, 0.45, 0.2, 0.08], dur, ataque=0.0008)


def piano_el(f, dur=1.2, vel=0.8, nota=None):
    """Piano elétrico FM (estilo Rhodes): portadora 1:1 com 'tine' 1:14 no ataque."""
    n = n_am(dur)
    nota = nota if nota is not None else dur - 0.15
    e = env_adsr(n, 0.002, 1.2, 0.0, 0.25, nota) * np.exp(-np.arange(n) / SR / (dur * 1.5 + 0.5))
    corpo = fm(f, 1.0, 1.2 * vel, n, env_exp(n, 0.001, 0.9)) * e
    tine = np.sin(fase(f * 14.0, n)) * env_exp(n, 0.0005, 0.07) * 0.12 * vel
    return (corpo + tine) * (0.6 + 0.4 * vel)


def corda_ded(f, dur=1.5, brilho=0.55, semente=1, decai=0.997):
    y = karplus(f, dur, brilho, decai, semente)
    return lp(y, 5500) * env_adsr(n_am(dur), 0.001, 0.2, 1.0, 0.08)


def baixo(f, dur=0.5, nota=None, sub=0.6):
    n = n_am(dur)
    nota = nota if nota is not None else dur * 0.85
    e = env_adsr(n, 0.004, 0.25, 0.65, 0.05, nota)
    y = serra(f, n, 12) * 0.5 + np.sin(fase(f, n)) * sub
    fc = 280 + 900 * env_exp(n, 0.002, 0.18)
    return filtro_variavel(y, fc, "low", 0.8) * e


def pad(f, dur=4.0, brilho=1500, nota=None, detune=0.006, voz=3):
    n = n_am(dur)
    nota = nota if nota is not None else dur - 0.6
    y = np.zeros(n)
    for k in range(voz):
        d = 1 + detune * (k - (voz - 1) / 2)
        y += serra(f * d, n, 20)
    y = lp(y / voz, brilho)
    return y * env_adsr(n, 0.5, 1.0, 0.85, 0.7, nota)


def cordas(f, dur=2.0, nota=None):
    n = n_am(dur)
    vib = 1 + 0.004 * np.sin(2 * np.pi * 5.2 * np.arange(n) / SR) * np.clip(np.arange(n) / SR / 0.4, 0, 1)
    y = serra(f * vib, n, 25) * 0.6 + serra(f * vib * 1.004, n, 25) * 0.4
    y = lp(y, 2600)
    y = pico_eq(y, 1100, 3, 1.2)
    nota = nota if nota is not None else dur - 0.3
    return y * env_adsr(n, 0.18, 0.4, 0.85, 0.35, nota)


def flauta(f, dur=0.8, nota=None, sopro=0.08, semente=0):
    n = n_am(dur)
    t = np.arange(n) / SR
    vib = 1 + 0.006 * np.sin(2 * np.pi * 5.0 * t) * np.clip((t - 0.15) / 0.3, 0, 1)
    ph = fase(f * vib, n)
    y = np.sin(ph) + 0.18 * np.sin(2 * ph) + 0.06 * np.sin(3 * ph)
    ar = bp(ruido(n, rng(semente + int(f))), f * 0.8, min(f * 3, 15000)) * sopro * 3
    nota = nota if nota is not None else dur - 0.08
    return (y + ar) * env_adsr(n, 0.04, 0.2, 0.85, 0.08, nota)


def assobio(f, dur=0.5, nota=None):
    n = n_am(dur)
    t = np.arange(n) / SR
    vib = 1 + 0.01 * np.sin(2 * np.pi * 6 * t)
    nota = nota if nota is not None else dur - 0.06
    return np.sin(fase(f * vib, n)) * env_adsr(n, 0.03, 0.1, 0.9, 0.06, nota)


def metais(f, dur=0.6, nota=None, brilho=1.0):
    """Metais sintéticos (fanfarra): serra com filtro que abre no ataque."""
    n = n_am(dur)
    nota = nota if nota is not None else dur - 0.1
    y = serra(f, n, 30) * 0.7 + serra(f * 1.003, n, 30) * 0.3
    fc = 600 + 3500 * brilho * curva(n, [(0, 0.2), (min(0.06 / dur, 0.5), 1.0), (1, 0.55)])
    return filtro_variavel(y, fc, "low", 1.0) * env_adsr(n, 0.02, 0.15, 0.8, 0.1, nota)


def pizz(f, dur=0.35):
    y = karplus(f, dur, 0.35, 0.985, int(f))
    return lp(y, 3000) * env_exp(n_am(dur), 0.001, dur)


def realejo(f, dur=0.4, nota=None):
    """Órgão de carrossel (calíope): flautas de tubo com tremolo."""
    n = n_am(dur)
    t = np.arange(n) / SR
    trem = 1 + 0.25 * np.sin(2 * np.pi * 6.5 * t)
    ph = fase(f, n)
    y = (np.sin(ph) + 0.5 * np.sin(2 * ph) + 0.25 * np.sin(4 * ph) + 0.1 * quadrada(f * 2, n, 6)) * trem
    nota = nota if nota is not None else dur - 0.04
    return y * env_adsr(n, 0.01, 0.05, 0.9, 0.04, nota)


# ---------------------------------------------------------------- percussão

def bumbo(dur=0.45, f0=120, f1=48, semente=0):
    n = n_am(dur)
    f = f1 + (f0 - f1) * np.exp(-np.arange(n) / SR / 0.035)
    y = np.sin(fase(f, n)) * env_exp(n, 0.001, dur)
    y[: n_am(0.003)] += hp(ruido(n_am(0.003), rng(semente)), 1500) * 0.5
    return y


def caixa(dur=0.25, semente=0, tom=190):
    n = n_am(dur)
    r = rng(semente)
    corpo = np.sin(fase(tom * (1 + 0.5 * np.exp(-np.arange(n) / SR / 0.01)), n)) * env_exp(n, 0.001, 0.09)
    esteira = bp(ruido(n, r), 1800, 9000) * env_exp(n, 0.001, dur * 0.8) * 2.2
    return corpo * 0.6 + esteira


def chimbal(dur=0.06, semente=0, aberto=False):
    n = n_am(0.35 if aberto else dur)
    y = hp(ruido(n, rng(semente)), 7000, 4) * env_exp(n, 0.0005, 0.32 if aberto else dur) * 2.5
    return y


def palmas(semente=0):
    r = rng(semente)
    n = n_am(0.25)
    y = np.zeros(n)
    for k, d in enumerate([0, 0.011, 0.021, 0.03]):
        b = bp(ruido(n_am(0.2), r), 900, 4000) * env_exp(n_am(0.2), 0.0005, 0.03 if k < 3 else 0.16)
        y = misturar_em(y, b * 2.5, d)
    return y


def chocalho(dur=0.12, semente=0):
    n = n_am(dur)
    y = hp(ruido(n, rng(semente)), 5000, 3) * curva(n, [(0, 0), (0.3, 1), (1, 0)]) * 1.6
    return y


def vassourinha(dur=0.25, semente=0):
    n = n_am(dur)
    return bp(ruido(n, rng(semente)), 2500, 9000) * curva(n, [(0, 0), (0.15, 1), (1, 0)]) * 1.2


def tic_relogio(semente=0, f=3200):
    return modal([f, f * 1.7, f * 2.6], [0.02, 0.012, 0.008], [1, 0.5, 0.3], 0.04)


def tom_tambor(f=110, dur=0.4, semente=0):
    n = n_am(dur)
    ff = f * (1 + 0.35 * np.exp(-np.arange(n) / SR / 0.04))
    return np.sin(fase(ff, n)) * env_exp(n, 0.001, dur) + bp(ruido(n, rng(semente)), 200, 1200) * env_exp(n, 0.001, 0.03) * 0.5


def prato(dur=1.6, semente=0):
    n = n_am(dur)
    r = rng(semente)
    y = hp(ruido(n, r), 4000, 2) * env_exp(n, 0.001, dur)
    y += bp(ruido(n, r), 3000, 6000) * env_exp(n, 0.001, dur * 0.4) * 0.5
    return y * 1.5


def woodblock(f=900, dur=0.12):
    return modal([f, f * 2.3, f * 3.9], [dur, dur * 0.5, dur * 0.3], [1, 0.4, 0.2], dur, ataque=0.0003)
