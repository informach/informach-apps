"""Ambientes do Morada (laços de 45 s, estéreo): bairro de dia, bairro à noite com grilos, centro com trânsito,
praia com ondas e gaivotas, parque com crianças ao longe, parque de diversões, chuva e vento.
Também o murmúrio da TV (casa), que usa a voz inventada.

Tudo em modo circular: ruído periódico feito no domínio da frequência, eventos que dão a volta no fim,
filtros em três voltas e reverberação circular. Fim e começo se encaixam por construção.
As vozes ao longe (crianças, multidão, TV) vêm do motor da voz inventada (sons_voz_motor.js)."""
import sys
import numpy as np
from sons_lib import *
from sons_instrumentos import *
from sons_bichos import voz_animal, latido_sint
from sons_voz import render as render_voz

CAT = "ambientes"
L = 45.0


def s(ident, x, nome, grupo, desc="", cat=CAT, **kw):
    it = salvar(cat, ident, x, nome, grupo, laco=True, descricao=desc, **kw)
    print(f"{ident:26s} {it['dur']:6.2f}s  {it['lufs']:6.1f} LUFS  pico {it['pico_dbfs']:5.1f}")


def cama(n, r, f1, f2, incl=-1.0, est=0.6):
    """Ruído de fundo estéreo, periódico, numa faixa de frequência (descorrelação parcial entre os canais)."""
    f = np.fft.rfftfreq(n, 1 / SR)
    mag = np.where((f > f1) & (f < f2), np.maximum(f, 1) ** (incl / 2), 0)
    # bordas suaves (meia oitava)
    mag *= np.clip(np.log2(np.maximum(f, 1) / f1) * 2 + 1, 0, 1) * np.clip(np.log2(f2 / np.maximum(f, 1)) * 2 + 1, 0, 1)
    def um():
        y = np.fft.irfft(mag * np.exp(1j * r.uniform(0, 2 * np.pi, len(f))), n)
        return y / (np.std(y) + 1e-12) * 0.3
    c, a, b = um(), um(), um()
    return np.stack([c * (1 - est) + a * est, c * (1 - est) + b * est], 1)


def ev(buf, som, t, pan=0.0, ganho=1.0):
    misturar_em(buf, estereo(som * ganho, pan), t, circular=True)


def longe(x, fc=2500):
    return lp(x, fc)


def lenta(n, r, fmax):
    return curva_lenta(n, r, fmax)


def piado(f, dur, subida):
    n = n_am(dur)
    ff = curva(n, subida) * f
    return np.sin(fase(ff, n) + 0.3 * np.sin(fase(ff * 2.0, n))) * curva(n, [(0, 0), (0.15, 1), (0.7, 0.8), (1, 0)])


def canto(r):
    """Uma frase de passarinho: 3 a 8 piados com glissandos."""
    f = r.uniform(2800, 5200)
    y = np.zeros(n_am(1.6))
    t = 0.0
    for j in range(r.integers(3, 9)):
        d = r.uniform(0.03, 0.12)
        a, b = r.uniform(0.75, 1.3), r.uniform(0.75, 1.3)
        y = misturar_em(y, piado(f * r.uniform(0.92, 1.08), d, [(0, a), (1, b)]) * r.uniform(0.5, 1), t)
        t += d + r.uniform(0.02, 0.1)
        if t > 1.4:
            break
    return y


def carro(r, dur=5.0, grave=1.0):
    """Carro passando: ronco do motor (harmônicos) + pneu (ruído) com sino de volume e pan que atravessa."""
    n = n_am(dur)
    t = np.arange(n) / SR
    perto = np.exp(-((t - dur / 2) / (dur / 5)) ** 2)
    f0 = r.uniform(70, 110) * grave * (1 + 0.04 * np.tanh((dur / 2 - t) * 2))   # leve Doppler
    motor = sum(np.sin(fase(f0 * k, n)) / k for k in range(1, 7)) * 0.4
    pneu = bp(ruido(n, r), 300, 3000) * 1.2
    y = (motor + pneu) * perto
    fc = 600 + 3500 * perto
    return filtro_variavel(y, fc, "low", 0.7)


def buzina(r):
    n = n_am(r.uniform(0.25, 0.6))
    f = r.uniform(380, 460)
    y = lp(quadrada(f, n, 8) * 0.6 + quadrada(f * 1.26, n, 8) * 0.5, 2500)
    return y * env_adsr(n, 0.01, 0.05, 0.9, 0.05)


def onda(r, dur):
    """Uma onda: rolo que cresce e quebra (ruído com filtro que abre) e a espuma que espalha."""
    n = n_am(dur)
    z = ruido(n, r)
    fc = curva(n, [(0, 250), (0.3, 900), (0.42, 3500), (0.6, 2500), (1, 1200)])
    rolo = filtro_variavel(z, fc, "low", 0.7) * curva(n, [(0, 0), (0.35, 0.6), (0.42, 1), (0.6, 0.6), (1, 0)]) ** 1.3
    esp = bp(ruido(n, r), 1500, 9000) * curva(n, [(0, 0), (0.42, 0), (0.5, 0.8), (1, 0)]) ** 1.5
    bolhas = np.zeros(n)
    k = int(dur * 120)
    pos = r.integers(int(0.45 * n), n, k)
    bolhas[pos] = r.exponential(1, k) * r.choice([-1, 1], k)
    bolhas = hp(bolhas, 3000) * curva(n, [(0, 0), (0.45, 0), (0.55, 1), (1, 0)])
    return rolo * 2.2 + esp * 0.8 + bolhas * 0.3


def grilos(n, r, quantos=8):
    """Grilos: trens de pulsos numa portadora aguda, cada grilo com seu ritmo e lugar."""
    buf = np.zeros((n, 2))
    for g in range(quantos):
        fc = r.uniform(3900, 5000)
        pulso = n_am(0.011)
        tp = np.arange(pulso) / SR
        p1 = np.sin(2 * np.pi * fc * tp) * np.sin(np.pi * tp / tp[-1]) ** 2
        periodo = r.uniform(0.55, 1.1)
        k = r.integers(2, 5)
        canto_ = np.zeros(n_am(0.02 * k + 0.02))
        for j in range(k):
            canto_ = misturar_em(canto_, p1, j * 0.022)
        pan = r.uniform(-0.9, 0.9)
        ganho = r.uniform(0.25, 1.0)
        t = r.uniform(0, periodo)
        while t < n / SR:
            if r.random() > 0.08:
                ev(buf, canto_, t, pan, ganho * r.uniform(0.85, 1))
            t += periodo * r.uniform(0.97, 1.03)
    return buf


def vozes(pedidos, nome):
    return render_voz(pedidos, f"/dev/shm/morada_sons/amb_{nome}")


def multidao(n, r, quantos, idades, emocoes, semente, fc=1800, ganho=0.25):
    buf = np.zeros((n, 2))
    ped = []
    for k in range(quantos):
        idade = idades[r.integers(len(idades))]
        ped.append({"id": f"v{k}", "idade": idade, "sexo": "mf"[r.integers(2)], "emocao": emocoes[r.integers(len(emocoes))],
                    "semente": int(semente * 1000 + k)})
    falas = vozes(ped, f"mult{semente}")
    for k, p in enumerate(ped):
        x, _ = falas[p["id"]]
        ev(buf, lp(x, fc), r.uniform(0, n / SR), r.uniform(-0.8, 0.8), ganho * r.uniform(0.4, 1.0))
    return buf


# ---------------------------------------------------------------- ambientes

def bairro_dia():
    r = rng("bairro_dia")
    n = n_am(L)
    y = cama(n, r, 40, 700, -2.0) * 0.35                       # trânsito distante
    y *= (1 + 0.15 * lenta(n, r, 0.2))[:, None]
    y += cama(n, r, 1500, 9000, -1.0) * 0.04 * (1 + 0.5 * lenta(n, r, 0.3))[:, None]   # folhas
    for k in range(28):
        ev(y, canto(r), r.uniform(0, L), r.uniform(-0.9, 0.9), r.uniform(0.15, 0.5))
    for k in range(3):
        ev(y, longe(carro(r, r.uniform(4, 7)), 1500), r.uniform(0, L), 0, 0.35)
    for k in range(2):
        t0 = r.uniform(0, L)
        for j in range(r.integers(2, 4)):
            ev(y, longe(latido_sint("medio", k * 5 + j), 1500), t0 + j * 0.35, -0.6, 0.12)
    s("bairro_dia_laco", reverb(y, 1.2, 0.15, circular=True), "Bairro de dia", "Cidade",
      "trânsito ao longe, passarinhos, folhas, um carro passando e um cachorro distante")


def bairro_noite():
    r = rng("bairro_noite")
    n = n_am(L)
    y = cama(n, r, 40, 500, -2.0) * 0.18
    y += cama(n, r, 200, 2000, -1.0) * 0.04 * (1 + 0.6 * lenta(n, r, 0.1))[:, None]   # brisa
    y += grilos(n, r, 9) * 0.35
    for k in range(2):   # coruja
        t0 = r.uniform(0, L)
        for j in range(2):
            m = n_am(0.45)
            hoo = np.sin(fase(curva(m, [(0, 380), (0.3, 420), (1, 350)]), m)) * curva(m, [(0, 0), (0.2, 1), (1, 0)])
            ev(y, hoo, t0 + j * 0.65, 0.7, 0.18)
    ev(y, longe(carro(r, 6, 0.9), 900), r.uniform(0, L), 0, 0.25)
    t0 = r.uniform(0, L)
    for j in range(3):
        ev(y, longe(latido_sint("grande", 20 + j), 900), t0 + j * 0.5, 0.5, 0.06)
    s("bairro_noite_laco", reverb(y, 1.5, 0.2, circular=True), "Bairro à noite", "Cidade",
      "grilos em volta, brisa, uma coruja, um carro e um cachorro bem longe")


def centro():
    r = rng("centro")
    n = n_am(L)
    y = cama(n, r, 40, 2500, -1.6) * 0.5 * (1 + 0.2 * lenta(n, r, 0.15))[:, None]
    for k in range(22):
        c = carro(r, r.uniform(3, 6), r.choice([1.0, 1.0, 0.6]))
        st = np.stack([c * np.linspace(1, 0.3, len(c)), c * np.linspace(0.3, 1, len(c))], 1) if r.random() < 0.5 else \
            np.stack([c * np.linspace(0.3, 1, len(c)), c * np.linspace(1, 0.3, len(c))], 1)
        misturar_em(y, st * r.uniform(0.25, 0.6), r.uniform(0, L), circular=True)
    for k in range(4):
        ev(y, buzina(r), r.uniform(0, L), r.uniform(-0.6, 0.6), r.uniform(0.15, 0.3))
    y += multidao(n, r, 40, ["adulto", "adulto", "idoso", "crianca"], ["neutro", "neutro", "feliz", "surpreso"], 3, 1600, 0.12)
    s("centro_transito_laco", reverb(y, 1.0, 0.2, circular=True), "Centro com trânsito", "Cidade",
      "carros e ônibus passando, buzinas e gente conversando na calçada")


def praia():
    r = rng("praia")
    n = n_am(L)
    y = cama(n, r, 50, 900, -1.5) * 0.25 * (1 + 0.2 * lenta(n, r, 0.12))[:, None]
    t = 0.0
    while t < L:
        d = r.uniform(6.5, 9.5)
        ev(y, onda(r, d), t, r.uniform(-0.3, 0.3), r.uniform(0.6, 0.9))
        t += d * r.uniform(0.55, 0.8)
    y += cama(n, r, 300, 3000, -1.0) * 0.05 * (1 + 0.7 * lenta(n, r, 0.08))[:, None]   # vento
    for k in range(6):
        g = np.zeros(n_am(1.6))
        t0 = 0.0
        for j in range(r.integers(2, 4)):
            f = r.uniform(1000, 1300)
            d = r.uniform(0.25, 0.4)
            v = voz_animal(d, [(0, f * 0.85), (0.25, f * 1.45), (1, f * 0.75)], [[(0, 1900), (0.3, 2600), (1, 2000)], 3600, 5200],
                           [250, 400, 600], [1, 0.6, 0.2], sopro=0.25, aspereza=0.35, inclinacao=0.8, semente=100 + k * 5 + j, harm=20,
                           env=[(0, 0), (0.1, 1), (0.6, 0.7), (1, 0)])
            g = misturar_em(g, v, t0)
            t0 += d + r.uniform(0.05, 0.12)
        ev(y, longe(g, 4000), r.uniform(0, L), r.uniform(-0.8, 0.8), r.uniform(0.08, 0.18))
    s("praia_laco", reverb(y, 1.2, 0.12, circular=True), "Praia", "Cidade", "ondas quebrando e espalhando, vento e gaivotas")


def parque():
    r = rng("parque")
    n = n_am(L)
    y = cama(n, r, 40, 600, -2.0) * 0.15
    y += cama(n, r, 1200, 9000, -1.0) * 0.06 * (1 + 0.7 * lenta(n, r, 0.25))[:, None]   # folhas ao vento
    for k in range(22):
        ev(y, canto(r), r.uniform(0, L), r.uniform(-0.9, 0.9), r.uniform(0.15, 0.4))
    kids = multidao(n, r, 34, ["crianca"], ["feliz", "rindo", "surpreso", "neutro", "rindo"], 5, 2600, 0.16)
    y += reverb(kids, 1.2, 0.35, circular=True)
    # balanço rangendo num trecho
    t0 = r.uniform(0, L)
    for j in range(8):
        m = n_am(0.5)
        nn = np.arange(m) / SR
        f = curva(m, [(0, 90), (1, 140)]) if j % 2 == 0 else curva(m, [(0, 140), (1, 90)])
        trem = np.diff(np.floor(np.cumsum(f / SR)), prepend=0)
        rang = ressonador(trem, 900, 60) + ressonador(trem, 1900, 120) * 0.5
        ev(y, rang * np.sin(np.pi * nn / nn[-1]) * 0.6, t0 + j * 1.1, -0.5, 0.18)
    s("parque_laco", reverb(y, 1.0, 0.12, circular=True), "Parque", "Cidade", "passarinhos, folhas, crianças brincando ao longe e um balanço")


def parque_diversoes():
    r = rng("diversoes")
    n = n_am(48.0)
    y = np.zeros((n, 2))
    # realejo de carrossel em valsa: 3/4 a 150 bpm, 40 compassos = 48 s (o laço fecha no compasso)
    spb = 60 / 150
    frase_a = ["C5", "E5", "G5", "C6", "B5", "G5", "A5", "F5", "D5", "G5", "F5", "D5", "E5", "G5", "C6", "E6", "D6", "B5", "C6", "G5", "E5", "D5", "B4", "G4"]
    frase_b = ["F5", "A5", "C6", "A5", "F5", "A5", "E5", "G5", "C6", "G5", "E5", "G5", "D5", "F5", "B5", "A5", "G5", "F5", "E5", "G5", "C6", "E5", "D5", "C5"]
    acordes = [["C3", "G3", "C4"], ["F3", "A3", "C4"], ["G3", "B3", "D4"], ["C3", "E3", "G3"]]
    mel = (frase_a + frase_b) * 2
    musica = np.zeros((n, 2))
    for c in range(40):
        ac = acordes[(c // 2) % 4] if c % 8 < 6 else acordes[2 if c % 8 == 6 else 0]
        b = c * 3 * spb
        musica = misturar_em(musica, estereo(baixo(hz(ac[0]), 0.4) * 0.5, -0.2), b, circular=True)
        for k in (1, 2):
            for m in ac[1:]:
                musica = misturar_em(musica, estereo(realejo(hz(m), 0.3) * 0.12, 0.2), b + k * spb, circular=True)
        nota = mel[(c * 2) % len(mel)]
        musica = misturar_em(musica, estereo(realejo(hz(nota), spb * 1.9) * 0.3, 0.1), b, circular=True)
        nota2 = mel[(c * 2 + 1) % len(mel)]
        musica = misturar_em(musica, estereo(realejo(hz(nota2), spb * 0.95) * 0.3, 0.1), b + 2 * spb, circular=True)
        musica = misturar_em(musica, estereo(glock(hz(nota) * 2, 0.6) * 0.06, 0.3), b, circular=True)
    y += reverb(filtro_circ(musica, lambda v: lp(v, 4000)), 1.4, 0.4, circular=True) * 0.5
    y += multidao(n, r, 44, ["adulto", "crianca", "crianca", "idoso"], ["feliz", "neutro", "rindo", "surpreso"], 7, 2000, 0.13)
    gritos = multidao(n, r, 8, ["crianca", "adulto"], ["surpreso", "rindo"], 8, 3000, 0.12)
    y += reverb(gritos, 1.0, 0.3, circular=True)
    # montanha-russa passando ao longe
    m = n_am(7.0)
    trilho = lp(ruido(m, r), 500) * curva(m, [(0, 0), (0.5, 1), (1, 0)]) * (1 + 0.5 * np.sin(2 * np.pi * 9 * np.arange(m) / SR))
    ev(y, trilho * 0.6, r.uniform(0, 48), 0.6, 0.6)
    for k in range(3):   # sininho do "teste de força"
        ev(y, sino(hz("A6"), 1.2, 0.6, 1.0), r.uniform(0, 48), -0.7, 0.08)
    y += cama(n, r, 40, 800, -2.0) * 0.08
    s("parque_diversoes_laco", reverb(y, 1.0, 0.12, circular=True), "Parque de diversões", "Cidade",
      "realejo de carrossel em valsa, multidão, gritinhos, montanha-russa ao longe; laço de 48 s (40 compassos)")


def chuva():
    r = rng("chuva")
    n = n_am(L)
    y = cama(n, r, 300, 9000, -0.8) * 0.5 * (1 + 0.15 * lenta(n, r, 0.1))[:, None]
    gotas = np.zeros((n, 2))
    k = int(L * 2500)
    for c in range(2):
        pos = r.integers(0, n, k)
        gotas[pos, c] += r.exponential(1, k) ** 1.5 * r.choice([-1, 1], k)
    gotas = filtro_circ(gotas, lambda v: bp(v, 1500, 9000))
    y += gotas * 0.35
    for j in range(int(L * 1.5)):   # pingos da calha
        m = n_am(0.08)
        tt = np.arange(m) / SR
        f0 = r.uniform(900, 2600)
        pingo = np.sin(2 * np.pi * np.cumsum(f0 * (1 + 3 * tt)) / SR) * np.exp(-tt / 0.015)
        ev(y, pingo, r.uniform(0, L), r.uniform(-0.7, 0.7), r.uniform(0.05, 0.15))
    m = n_am(7.0)
    trovao = lp(ruido(m, r), 180) * curva(m, [(0, 0), (0.05, 1), (0.2, 0.5), (0.3, 0.8), (1, 0)]) ** 1.5 * 3
    ev(y, trovao, r.uniform(0, L), 0.2, 0.6)
    s("chuva_laco", reverb(y, 0.8, 0.1, circular=True), "Chuva", "Clima", "chuva constante, pingos na calha e um trovão ao longe")


def vento():
    r = rng("vento")
    n = n_am(L)
    rajada = np.clip(0.55 + 0.45 * lenta(n, r, 0.12), 0.05, 1.6)
    canais = []
    for c in range(2):
        z = ruido_espectral(n, -1.0, r)
        fc = 250 + 900 * rajada
        corpo = filtro_circ(z, lambda v: filtro_variavel(v, np.concatenate([fc, fc, fc]), "band", 0.8))
        assobio_ = filtro_circ(ruido(n, r), lambda v: filtro_variavel(v, np.concatenate([600 + 500 * rajada] * 3), "band", 12)) * 0.5
        folhas = filtro_circ(ruido(n, r), lambda v: hp(v, 3000)) * np.clip(rajada - 0.6, 0, 1) * 0.3
        canais.append((corpo * 1.2 + assobio_ * rajada + folhas) * rajada)
    y = np.stack(canais, 1)
    s("vento_laco", reverb(y, 1.0, 0.1, circular=True), "Vento", "Clima", "vento em rajadas, com assobio e folhas nas mais fortes")


def tv():
    """Murmúrio genérico de TV (casa): vozes de apresentador e entrevistados pelo alto-falante, música de fundo e risadas."""
    r = rng("tv")
    n = n_am(20.0)
    y = np.zeros((n, 2))
    ped = []
    t = 0.0
    k = 0
    while t < 19.5:
        idade = ["adulto", "adulto", "idoso", "crianca"][r.integers(4)]
        ped.append({"id": f"tv{k}", "idade": idade, "sexo": "mf"[r.integers(2)], "emocao": ["neutro", "feliz", "surpreso", "neutro"][r.integers(4)],
                    "semente": 5000 + k, "_t": t})
        t += r.uniform(1.0, 2.2)
        k += 1
    falas = vozes([{kk: v for kk, v in p.items() if kk != "_t"} for p in ped], "tv")
    for p in ped:
        x, _ = falas[p["id"]]
        ev(y, x, p["_t"], 0, 0.5)
    risos = multidao(n, r, 10, ["adulto"], ["rindo"], 9, 3000, 0.25)
    pos = int(r.uniform(5, 15) * SR)
    risos *= np.roll(curva(n, [(0, 0), (0.05, 1), (0.25, 1), (0.3, 0), (1, 0)]), pos)[:, None]
    y += risos
    acordes_ = [["C4", "E4", "G4"], ["A3", "C4", "E4"], ["F3", "A3", "C4"], ["G3", "B3", "D4"]]
    for c in range(10):
        for m in acordes_[c % 4]:
            ev(y, pad(hz(m), 2.2, 1400) * 0.05, c * 2.0, 0.0, 1.0)
    alto_falante = lambda v: lp(hp(v, 280, 3), 4200, 3)
    y = filtro_circ(y, alto_falante)
    y = np.tanh(y * 2.0) / 2.0
    y = reverb(y, 0.5, 0.25, circular=True)
    s("tv_murmurio_laco", y, "TV ligada (laço)", "Eletrônicos", "vozes inventadas pelo alto-falante, música e risadas; laço de 20 s", cat="casa")


PARTES = {"bairro_dia": bairro_dia, "bairro_noite": bairro_noite, "centro": centro, "praia": praia, "parque": parque,
          "parque_diversoes": parque_diversoes, "chuva": chuva, "vento": vento, "tv": tv}

if __name__ == "__main__":
    for p in (sys.argv[1:] or PARTES):
        PARTES[p]()
