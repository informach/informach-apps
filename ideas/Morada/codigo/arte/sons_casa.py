"""Sons da casa e das ações do Morada, um por animação de uso: banheiro, cozinha, portas e móveis,
eletrônicos, passos em cinco pisos, quarto e limpeza. Os laços são feitos em modo circular
(ruído periódico, eventos que dão a volta e filtros aplicados em três voltas), então fim e começo se encaixam."""
import sys
import numpy as np
from sons_lib import *
from sons_instrumentos import *

CAT = "casa"


def s(ident, x, nome, grupo, desc="", **kw):
    it = salvar(CAT, ident, x, nome, grupo, descricao=desc, **kw)
    print(f"{ident:30s} {it['dur']:6.2f}s  {it['lufs']:6.1f} LUFS  pico {it['pico_dbfs']:5.1f}  {'laço' if it['laco'] else ''}")


# ---------------------------------------------------------------- blocos

def gotas(n, r, taxa, fmin, fmax, queda=0.012, amp=(0.3, 1.0), circular=True):
    """Gotinhas: senoides curtas com glissando para cima (bolha de Minnaert), espalhadas no tempo."""
    y = np.zeros(n)
    k = int(taxa * n / SR)
    for _ in range(k):
        f0 = r.uniform(fmin, fmax)
        d = queda * r.uniform(0.6, 1.6)
        m = n_am(d * 3)
        t = np.arange(m) / SR
        g = np.sin(2 * np.pi * np.cumsum(f0 * (1 + 2.5 * t / (d * 3))) / SR) * np.exp(-t / d)
        misturar_em(y, g * r.uniform(*amp), r.uniform(0, n / SR), circular=circular)
    return y


def estalos(n, r, taxa, fc1, fc2, circular=True, dist=1.5):
    """Estalidos aleatórios (fritura, grama, grão): impulsos com amplitude exponencial, filtrados."""
    y = np.zeros(n)
    k = int(taxa * n / SR)
    pos = r.integers(0, n, k)
    y[pos] += r.exponential(1.0, k) ** dist * r.choice([-1, 1], k)
    if circular:
        return filtro_circ(y, lambda v: bp(v, fc1, fc2))
    return bp(y, fc1, fc2)


def agua_jato(n, r, centro=3000, largura=0.9, textura=60):
    """Jato d'água: ruído em banda com modulação rápida aleatória (circular)."""
    z = ruido_banda(n, r, centro, largura)
    am = 1 + 0.35 * curva_lenta(n, r, textura)
    return z * np.clip(am, 0.2, 2)


def madeira(f, dur=0.15, brilho=1.0):
    return modal([f, f * 2.4, f * 4.1, f * 6.3], [dur, dur * 0.6, dur * 0.35, dur * 0.2], [1, 0.5 * brilho, 0.25 * brilho, 0.1 * brilho], dur, 0.0004)


def rangido(dur, r, f_ini=90, f_fim=160, ress=(420, 980, 1750), aspereza=0.25):
    """Rangido (atrito que gruda e solta): trem de pulsos com período instável em ressonâncias de madeira."""
    n = n_am(dur)
    f = np.geomspace(f_ini, f_fim, n) * (1 + aspereza * curva_lenta(n, r, 12) * 0.3)
    ph = np.cumsum(f / SR)
    trem = np.diff(np.floor(ph), prepend=0) * (0.6 + 0.4 * r.random(n))
    y = sum(ressonador(trem, fr * r.uniform(0.95, 1.05), fr * 0.06) * (1 / (i + 1)) for i, fr in enumerate(ress))
    return y * np.sin(np.linspace(0, np.pi, n)) ** 0.6


def baque(f=90, dur=0.25, r=None, ruido_amp=0.5, lpf=800):
    r = r or rng(1)
    n = n_am(dur)
    y = np.sin(fase(f * (1 + 0.8 * np.exp(-np.arange(n) / SR / 0.01)), n)) * env_exp(n, 0.002, dur * 0.6)
    y += lp(ruido(n, r), lpf) * env_exp(n, 0.002, dur * 0.3) * ruido_amp * 3
    return y


def trecho_estavel(caminho_slug, arquivo, dur, mono=True):
    """Escolhe, numa gravação CC0 longa, o trecho de 'dur' segundos com nível mais constante."""
    x, cr = cc0(caminho_slug, arquivo, mono)
    h = n_am(0.25)
    e = np.array([np.sqrt(np.mean(x[i:i + h] ** 2) + 1e-12) for i in range(0, len(x) - h, h)])
    edb = 20 * np.log10(e)
    w = int(dur / 0.25)
    best, bi = 1e9, 0
    med = np.median(edb)
    for i in range(0, len(edb) - w):
        seg = edb[i:i + w]
        sc = np.std(seg) - 0.3 * (np.mean(seg) - med)
        if sc < best:
            best, bi = sc, i
    t0 = bi * 0.25
    x, cr = cc0(caminho_slug, arquivo, mono, inicio=t0, dur=dur)
    return x, cr, t0


# ---------------------------------------------------------------- banheiro

def banheiro():
    r = rng("chuveiro")
    n = n_am(10.0)
    spray = agua_jato(n, r, 4200, 1.1, 80) * 1.0
    chao = agua_jato(n, r, 700, 0.8, 25) * 0.6
    gt = gotas(n, r, 260, 900, 4000, 0.006, (0.05, 0.25))
    y = spray + chao + gt
    y *= 1 + 0.08 * curva_lenta(n, r, 0.5)
    s("chuveiro_laco", estereo(reverb(y, 0.5, 0.25, circular=True), 0, 0.5), "Chuveiro (laço)", "Banheiro",
      "jato contínuo batendo no piso, com gotas; laço de 10 s", laco=True)

    r = rng("banheira")
    n = n_am(10.0)
    jato = agua_jato(n, r, 1200, 1.0, 40) * 0.8
    fundo = agua_jato(n, r, 300, 0.7, 8) * 1.0
    bolhas = gotas(n, r, 90, 180, 700, 0.03, (0.2, 0.8))
    y = jato + fundo + bolhas
    s("banheira_enchendo_laco", estereo(reverb(y, 0.7, 0.3, circular=True), 0, 0.4), "Banheira enchendo (laço)", "Banheiro",
      "água caindo em água funda, com borbulhas graves", laco=True)

    # descarga sintetizada: alavanca, jorro rodando, gorgolejo e caixa enchendo
    r = rng("descarga")
    dur = 5.5
    n = n_am(dur)
    y = np.zeros(n)
    y = misturar_em(y, madeira(1400, 0.05) * 0.4, 0.0)
    y = misturar_em(y, baque(160, 0.1, r, 0.2) * 0.4, 0.05)
    m = n_am(3.2)
    z = ruido(m, r)
    fc = curva(m, [(0, 900), (0.15, 2600), (0.6, 1500), (1, 500)])
    jorro = filtro_variavel(z, fc, "band", 0.7) * curva(m, [(0, 0), (0.06, 1), (0.5, 0.9), (1, 0)]) ** 1.2 * 2.5
    jorro *= 1 + 0.4 * np.sin(2 * np.pi * np.cumsum(np.linspace(3, 1.5, m)) / SR)  # redemoinho
    y = misturar_em(y, jorro, 0.12)
    g = gotas(n_am(1.6), r, 40, 150, 500, 0.04, (0.3, 1.0), circular=False)
    y = misturar_em(y, g * curva(len(g), [(0, 0), (0.2, 1), (1, 0)]) * 1.2, 2.4)
    m = n_am(2.8)
    enche = bp(ruido(m, r), 2500, 7000) * curva(m, [(0, 0), (0.2, 1), (1, 0)]) * 0.5
    y = misturar_em(y, enche, 2.6)
    s("descarga", reverb(y, 0.5, 0.3), "Descarga", "Banheiro", "alavanca, jorro rodando, gorgolejo e caixa enchendo")
    try:
        x, cr = cc0("100-cc0-sfx", "x/toilet_02.ogg")
        s("descarga_gravada", x, "Descarga (gravação CC0)", "Banheiro", "gravação real de descarga", origem="cc0", creditos=[cr])
    except Exception as e:
        print("descarga cc0:", e)

    r = rng("torneira")
    n = n_am(8.0)
    fio = agua_jato(n, r, 2600, 0.7, 120) * 0.8
    pia = agua_jato(n, r, 900, 0.6, 30) * 0.5
    y = fio + pia + gotas(n, r, 120, 1200, 3500, 0.005, (0.05, 0.2))
    s("torneira_laco", reverb(y, 0.4, 0.2, circular=True), "Torneira aberta (laço)", "Banheiro", "fio de água na pia", laco=True)

    r = rng("escova")
    n = n_am(6.0)
    golpes = 27  # 4,5 por segundo, número inteiro de idas e vindas no laço
    t = np.arange(n) / SR
    am = np.abs(np.sin(np.pi * golpes * t / 6.0)) ** 1.5
    cerdas = ruido_banda(n, r, 5500, 0.6) * am * (1 + 0.3 * curva_lenta(n, r, 3))
    espuma = estalos(n, r, 900, 1500, 5000) * 0.25 * (0.4 + am)
    y = cerdas + espuma
    s("escovar_dentes_laco", y, "Escovar os dentes (laço)", "Banheiro", "cerdas indo e voltando com espuma", laco=True)


# ---------------------------------------------------------------- cozinha

def cozinha():
    r = rng("fritar")
    n = n_am(8.0)
    chiado = ruido_banda(n, r, 6000, 0.8) * 0.5 * (1 + 0.25 * curva_lenta(n, r, 2))
    est = estalos(n, r, 420, 1500, 9000, dist=2.2) * 1.0
    pipoca = estalos(n, r, 14, 400, 3000, dist=1.0) * 2.0
    s("fritar_laco", reverb(chiado + est + pipoca, 0.4, 0.15, circular=True), "Fritar (laço)", "Cozinha", "chiado de óleo e estalinhos", laco=True, max_limite=18.0)

    r = rng("ferver")
    n = n_am(8.0)
    bol = gotas(n, r, 70, 250, 900, 0.025, (0.2, 1.0)) * 1.2
    fundo = ruido_banda(n, r, 350, 0.7) * 0.4 * (1 + 0.3 * curva_lenta(n, r, 4))
    tampa = np.zeros(n)
    for k in range(5):
        misturar_em(tampa, modal([1900, 3300, 5200], [0.05, 0.03, 0.02], [1, 0.6, 0.3], 0.08) * 0.08, r.uniform(0, 8), circular=True)
    s("ferver_laco", reverb(bol + fundo + tampa, 0.5, 0.2, circular=True), "Ferver (laço)", "Cozinha", "panela borbulhando, a tampa tremendo", laco=True)

    r = rng("picar")
    n = n_am(4.0)
    y = np.zeros(n)
    t = 0.0
    while t < 4.0 - 0.01:
        golpe = madeira(r.uniform(700, 820), 0.09) * 0.8 + 0
        golpe = mix(golpe, hp(ruido(n_am(0.02), r), 2500) * env_exp(n_am(0.02), 0.0005, 0.015) * 0.7,
                    baque(110, 0.08, r, 0.2) * 0.5)
        misturar_em(y, golpe * r.uniform(0.75, 1.0), t, circular=True)
        t += 4.0 / 12
    s("picar_laco", reverb(y, 0.35, 0.12, circular=True), "Picar (laço)", "Cozinha", "faca na tábua, 3 golpes por segundo", laco=True, max_limite=16.0)

    # micro-ondas e forno
    r = rng("micro")
    n = n_am(6.0)
    t = np.arange(n) / SR
    zumbido = sum(np.sin(2 * np.pi * 120 * k * t) / k for k in range(1, 8)) * 0.15
    vent = ruido_banda(n, r, 900, 1.0) * 0.4
    prato = np.zeros(n)
    for k in range(12):
        misturar_em(prato, madeira(r.uniform(2500, 3200), 0.03) * 0.04, k * 0.5 + r.uniform(0, 0.1), circular=True)
    s("micro_ondas_laco", lp_circ(zumbido + vent, 4000) + prato, "Micro-ondas ligado (laço)", "Cozinha", "zumbido e ventoinha", laco=True)
    d = mix(sino(hz("E6") * 1.0, 1.6, 0.4, 1.0) * 0.7, modal([hz("E6") * 2.76], [0.6], [0.2], 1.6))
    s("micro_ondas_ding", reverb(d, 0.4, 0.15), "Micro-ondas: ding", "Cozinha", "o \"ding\" de pronto")
    bip = np.zeros(n_am(1.6))
    for k in range(3):
        m = n_am(0.22)
        misturar_em(bip, lp(quadrada(2000, m, 6), 5000) * env_adsr(m, 0.004, 0.02, 0.9, 0.01) * 0.6, k * 0.45)
    s("micro_ondas_bipes", bip, "Micro-ondas: três bipes", "Cozinha", "variação digital do aviso")
    for ident, arq, nome in [("micro_ondas_porta_abrir", "x/microwave_door_open.ogg", "Micro-ondas: abrir a porta"),
                             ("micro_ondas_porta_fechar", "x/microwave_door_close.ogg", "Micro-ondas: fechar a porta")]:
        try:
            x, cr = cc0("100-cc0-sfx", arq)
            s(ident, x, nome, "Cozinha", "gravação real", origem="cc0", creditos=[cr])
        except Exception as e:
            print(ident, e)
    # timer de forno mecânico: martelinho batendo num sino
    timer = np.zeros(n_am(2.0))
    for k in range(int(1.2 * 22)):
        misturar_em(timer, modal([2350, 2350 * 2.7, 2350 * 5.1], [0.25, 0.12, 0.06], [1, 0.4, 0.15], 0.3) * (0.8 + 0.2 * np.sin(k)), k / 22)
    timer = mix(timer, sino(2350, 1.5, 0.3, 1.0) * 0.5)
    s("forno_ding", reverb(timer, 0.5, 0.15), "Forno: timer tocando", "Cozinha", "o martelinho do timer batendo no sino")
    r = rng("forno")
    y = mix(rangido(0.5, r, 70, 110, (600, 1300, 2600)) * 0.5, np.zeros(1))
    y = misturar_em(np.concatenate([y, np.zeros(n_am(0.6))]), mix(baque(80, 0.3, r, 0.3), modal([520, 1180, 1990], [0.3, 0.2, 0.1], [0.5, 0.3, 0.2], 0.4)) * 0.8, 0.45)
    s("forno_porta_abrir", reverb(y, 0.4, 0.15), "Forno: abrir a porta", "Cozinha", "dobradiça de metal e a porta descendo")
    y = mix(bp(ruido(n_am(0.25), r), 300, 2000) * curva(n_am(0.25), [(0, 0), (1, 1)]) * 0.5)
    y = misturar_em(np.concatenate([y, np.zeros(n_am(0.6))]), mix(baque(90, 0.3, r, 0.4), modal([480, 1100, 2100, 3400], [0.4, 0.25, 0.12, 0.08], [0.6, 0.4, 0.25, 0.15], 0.5)), 0.22)
    s("forno_porta_fechar", reverb(y, 0.4, 0.15), "Forno: fechar a porta", "Cozinha", "porta de metal batendo")

    # geladeira
    r = rng("geladeira")
    y = np.zeros(n_am(1.6))
    m = n_am(0.12)
    misturar_em(y, lp(ruido(m, r), 500) * env_exp(m, 0.001, 0.1) * 1.4, 0.0)        # vedação soltando
    misturar_em(y, bp(ruido(n_am(0.35), r), 300, 2500) * curva(n_am(0.35), [(0, 1), (1, 0)]) * 0.4, 0.02)
    for k in range(3):
        misturar_em(y, modal([3100 + 400 * k, 5300 + 300 * k], [0.25, 0.12], [1, 0.4], 0.35) * 0.18, 0.18 + 0.05 * k)
    t = np.arange(n_am(1.3)) / SR
    misturar_em(y, np.sin(2 * np.pi * 60 * t) * 0.12 * curva(len(t), [(0, 0), (0.2, 1), (1, 0.8)]) + lp(ruido(len(t), r), 300) * 0.1, 0.2)
    s("geladeira_abrir", reverb(y, 0.4, 0.15), "Geladeira: abrir", "Cozinha", "vedação soltando, potes tilintando e o zumbido")
    y = np.zeros(n_am(1.0))
    misturar_em(y, bp(ruido(n_am(0.2), r), 200, 1500) * curva(n_am(0.2), [(0, 0), (1, 1)]) * 0.5, 0)
    misturar_em(y, baque(70, 0.3, r, 0.6, 600) * 1.0, 0.18)
    for k in range(3):
        misturar_em(y, modal([2900 + 500 * k, 5000], [0.2, 0.1], [1, 0.4], 0.3) * 0.12, 0.2 + 0.03 * k)
    s("geladeira_fechar", reverb(y, 0.4, 0.15), "Geladeira: fechar", "Cozinha", "o \"tum\" abafado da porta com os vidros")

    # louça
    r = rng("louca")
    n = n_am(10.0)
    agua = agua_jato(n, r, 2300, 0.8, 90) * 0.45 + agua_jato(n, r, 700, 0.6, 20) * 0.3
    pratos = np.zeros(n)
    for k in range(26):
        f = r.uniform(1800, 3600)
        pratos = misturar_em(pratos, modal([f, f * 1.61, f * 2.48, f * 3.9], [0.18, 0.1, 0.07, 0.04], [1, 0.6, 0.4, 0.2], 0.25) * r.uniform(0.08, 0.3),
                             r.uniform(0, 10), circular=True)
    esponja = np.zeros(n)
    for k in range(10):
        m = n_am(0.4)
        esponja = misturar_em(esponja, bp(ruido(m, r), 800, 4000) * np.sin(np.linspace(0, np.pi, m)) * 0.35, r.uniform(0, 10), circular=True)
    s("lavar_louca_laco", reverb(agua + pratos + esponja, 0.5, 0.2, circular=True), "Lavar louça (laço)", "Cozinha",
      "água corrente, pratos batendo e esponja", laco=True)

    # gravações CC0 de cozinha (bretbernhoft, "General Household Sound Effects")
    for ident, arq, nome, dur in [("fritar_gravado_laco", "fryingpan01.wav", "Fritar, gravação (laço)", 10.0),
                                  ("ferver_gravado_laco", "boilingwater01.wav", "Ferver, gravação (laço)", 10.0)]:
        try:
            x, cr, t0 = trecho_estavel("general-household-sound-effects", arq, dur + 1.0)
            x = laco_cruzado(x, 1.0)
            s(ident, x, nome, "Cozinha", f"gravação real, trecho a partir de {t0:.0f} s, fechado em laço", laco=True,
              origem="cc0", creditos=[cr], max_limite=18.0)
        except Exception as e:
            print(ident, e)


# ---------------------------------------------------------------- portas e móveis

def moveis():
    r = rng("porta")
    y = np.zeros(n_am(1.5))
    misturar_em(y, madeira(1800, 0.04) * 0.5 + 0, 0)                       # trinco
    misturar_em(y, modal([2600, 4100], [0.03, 0.02], [1, 0.5], 0.05) * 0.4, 0.06)
    misturar_em(y, rangido(0.9, r, 70, 140) * 0.7, 0.15)
    misturar_em(y, lp(ruido(n_am(0.8), r), 900) * np.sin(np.linspace(0, np.pi, n_am(0.8))) * 0.25, 0.15)
    s("porta_abrir", reverb(y, 0.5, 0.18), "Porta: abrir", "Portas e móveis", "trinco e dobradiça rangendo")
    y = np.zeros(n_am(1.0))
    misturar_em(y, lp(ruido(n_am(0.3), r), 800) * curva(n_am(0.3), [(0, 0), (1, 1)]) * 0.4, 0)
    misturar_em(y, mix(baque(85, 0.35, r, 0.5, 700), madeira(240, 0.2) * 0.6) * 1.0, 0.28)
    misturar_em(y, madeira(1900, 0.04) * 0.35, 0.3)
    s("porta_fechar", reverb(y, 0.5, 0.18), "Porta: fechar", "Portas e móveis", "ar empurrado, batida de madeira e trinco")
    for ident, arq, nome in [("porta_abrir_kenney", "x/OGG__doorOpen_1.ogg", "Porta: abrir (Kenney)"),
                             ("porta_fechar_kenney", "x/OGG__doorClose_1.ogg", "Porta: fechar (Kenney)")]:
        try:
            x, cr = cc0("50-rpg-sound-effects", arq)
            s(ident, x, nome, "Portas e móveis", "alternativa de um pacote CC0", origem="cc0", creditos=[cr])
        except Exception as e:
            print(ident, e)

    def deslizar(dur, r, abrir):
        n = n_am(dur)
        z = bp(ruido(n, r), 350, 2200)
        am = np.clip(1 + 0.6 * curva_lenta(n, r, 30), 0.1, 2.5)
        env = curva(n, [(0, 0), (0.1, 1), (0.85, 1), (1, 0)]) if abrir else curva(n, [(0, 0), (0.2, 1), (1, 0.7)])
        return z * am * env * 0.9
    r = rng("gaveta")
    y = np.zeros(n_am(0.9))
    misturar_em(y, deslizar(0.45, r, True), 0)
    misturar_em(y, mix(madeira(320, 0.12), baque(140, 0.1, r, 0.2)) * 0.5, 0.43)
    for k in range(3):
        misturar_em(y, madeira(r.uniform(2000, 3500), 0.05) * 0.12, 0.44 + r.uniform(0, 0.08))  # talheres
    s("gaveta_abrir", reverb(y, 0.35, 0.12), "Gaveta: abrir", "Portas e móveis", "madeira deslizando e as coisas dentro")
    y = np.zeros(n_am(0.8))
    misturar_em(y, deslizar(0.3, r, False), 0)
    misturar_em(y, mix(madeira(260, 0.15), baque(120, 0.15, r, 0.4)) * 0.9, 0.29)
    s("gaveta_fechar", reverb(y, 0.35, 0.12), "Gaveta: fechar", "Portas e móveis", "deslizar e a batida no fim")
    r = rng("armario")
    y = np.zeros(n_am(0.9))
    misturar_em(y, modal([1500, 2900], [0.03, 0.02], [1, 0.4], 0.05) * 0.5, 0)       # ímã soltando
    misturar_em(y, rangido(0.45, r, 140, 220, (700, 1500, 2900)) * 0.45, 0.05)
    s("armario_abrir", reverb(y, 0.4, 0.15), "Armário: abrir", "Portas e móveis", "fecho de ímã e rangido curto")
    y = np.zeros(n_am(0.6))
    misturar_em(y, mix(madeira(420, 0.12), baque(150, 0.12, r, 0.3)) * 0.8, 0)
    misturar_em(y, modal([1600, 3000], [0.03, 0.02], [1, 0.4], 0.05) * 0.5, 0.01)
    s("armario_fechar", reverb(y, 0.4, 0.15), "Armário: fechar", "Portas e móveis", "porta leve batendo e o ímã")


# ---------------------------------------------------------------- eletrônicos

def eletronicos():
    r = rng("teclado")
    n = n_am(8.0)
    y = np.zeros(n)
    t = 0.0
    while t < 8.0:
        rajada = r.integers(3, 9)
        for _ in range(rajada):
            f = r.uniform(1800, 3600)
            esp = r.random() < 0.12
            tecla = mix(modal([f, f * 1.7, f * 2.9], [0.02, 0.012, 0.008], [1, 0.5, 0.2], 0.03) * 0.5,
                        baque(380 if not esp else 240, 0.05, r, 0.3, 1500) * (0.35 if not esp else 0.6),
                        hp(ruido(n_am(0.004), r), 3000) * 0.3)
            solta = modal([f * 1.2, f * 2.1], [0.012, 0.008], [1, 0.4], 0.02) * 0.2
            misturar_em(y, tecla * r.uniform(0.6, 1.0), t, circular=True)
            misturar_em(y, solta, t + r.uniform(0.05, 0.09), circular=True)
            t += r.uniform(0.09, 0.2)
        t += r.uniform(0.25, 0.8)
    s("computador_digitando_laco", reverb(y, 0.3, 0.1, circular=True), "Computador: digitando (laço)", "Eletrônicos",
      "rajadas de teclas, com a barra de espaço mais grave", laco=True, max_limite=16.0)
    # (o murmúrio da TV usa a voz inventada e é gerado em sons_ambientes.py)


# ---------------------------------------------------------------- passos

def passo(piso, k):
    r = rng(f"passo_{piso}_{k}")
    if piso == "madeira":
        calc = mix(baque(95 + 10 * k, 0.12, r, 0.6, 500), madeira(r.uniform(200, 240), 0.1, 0.8) * 0.5)
        ponta = madeira(r.uniform(380, 450), 0.06, 0.6) * 0.35
        y = misturar_em(np.zeros(n_am(0.35)), calc, 0)
        y = misturar_em(y, ponta, r.uniform(0.07, 0.1))
        if k == 3:
            y = misturar_em(y, rangido(0.25, r, 150, 120, (500, 1100, 2100)) * 0.12, 0.05)
    elif piso == "ceramica":
        calc = mix(hp(ruido(n_am(0.01), r), 2000) * env_exp(n_am(0.01), 0.0002, 0.006) * 1.2,
                   modal([r.uniform(1700, 2100), 3200, 4700], [0.03, 0.02, 0.012], [1, 0.5, 0.3], 0.05) * 0.4,
                   baque(130, 0.06, r, 0.2, 900) * 0.4)
        ponta = mix(hp(ruido(n_am(0.008), r), 2500) * env_exp(n_am(0.008), 0.0002, 0.005) * 0.6,
                    modal([2300, 3900], [0.02, 0.012], [1, 0.4], 0.03) * 0.2)
        y = misturar_em(np.zeros(n_am(0.3)), calc, 0)
        y = misturar_em(y, ponta, r.uniform(0.06, 0.09))
    elif piso == "carpete":
        m = n_am(0.18)
        calc = lp(ruido(m, r), 350) * curva(m, [(0, 0), (0.08, 1), (1, 0)]) ** 2 * 2.0
        calc = mix(calc, bp(ruido(m, r), 1000, 3500) * curva(m, [(0, 0), (0.2, 1), (1, 0)]) * 0.12,
                   np.sin(fase(70, m)) * env_exp(m, 0.008, 0.08) * 0.4)
        y = misturar_em(np.zeros(n_am(0.3)), calc, 0)
        y = misturar_em(y, calc * 0.4, r.uniform(0.07, 0.1))
    elif piso == "grama":
        m = n_am(0.22)
        cr = estalos(m, r, 2500, 1500, 7000, circular=False, dist=1.0) * curva(m, [(0, 0), (0.1, 1), (0.5, 0.6), (1, 0)])
        folhas = bp(ruido(m, r), 1800, 7000) * curva(m, [(0, 0), (0.12, 1), (0.5, 0.5), (1, 0)]) * (1 + 0.8 * curva_lenta(m, r, 80))
        y = mix(cr * 0.5, folhas * 0.6, lp(ruido(m, r), 400) * env_exp(m, 0.005, 0.07) * 0.8)
    else:  # calçada
        m = n_am(0.2)
        calc = mix(baque(110, 0.08, r, 0.5, 1000) * 0.7, hp(ruido(n_am(0.01), r), 1500) * env_exp(n_am(0.01), 0.0002, 0.008) * 0.6)
        areia = estalos(m, r, 700, 2000, 8000, circular=False, dist=2.0) * curva(m, [(0, 0), (0.15, 1), (1, 0)]) * 0.5
        raspa = bp(ruido(m, r), 1500, 6000) * curva(m, [(0, 0), (0.3, 1), (1, 0)]) * 0.12
        y = misturar_em(np.zeros(n_am(0.3)), calc, 0)
        y = misturar_em(y, areia + raspa, 0.03)
        y = misturar_em(y, calc * 0.35, r.uniform(0.07, 0.1))
    return y


def passos():
    nomes = {"madeira": "madeira", "ceramica": "cerâmica", "carpete": "carpete", "grama": "grama", "calcada": "calçada"}
    for piso, nome in nomes.items():
        for k in range(4):
            s(f"passo_{piso}_{k + 1}", reverb(passo(piso, k), 0.3, 0.08 if piso in ("grama", "calcada") else 0.15),
              f"Passo na {nome} {k + 1}" if piso in ("madeira", "ceramica", "grama", "calcada") else f"Passo no carpete {k + 1}",
              "Passos", f"um passo (calcanhar e ponta) em {nome}; sortear entre as 4 variações", max_limite=16.0)


# ---------------------------------------------------------------- quarto, avisos e limpeza

def quarto():
    r = rng("sofa")
    y = np.zeros(n_am(1.2))
    m = n_am(0.45)
    misturar_em(y, lp(ruido(m, r), 1100) * curva(m, [(0, 0), (0.3, 1), (1, 0)]) * 0.6, 0)        # ar saindo da almofada
    misturar_em(y, baque(65, 0.3, r, 0.7, 350) * 1.0, 0.18)
    misturar_em(y, bp(ruido(n_am(0.4), r), 1200, 4000) * curva(n_am(0.4), [(0, 0), (0.2, 1), (1, 0)]) * 0.12, 0.2)
    t = np.arange(n_am(0.5)) / SR
    mola = np.sin(2 * np.pi * 310 * t * (1 + 0.01 * np.sin(2 * np.pi * 9 * t))) * np.exp(-t / 0.12) * 0.06
    misturar_em(y, mola, 0.22)
    s("sentar_sofa", reverb(y, 0.4, 0.12), "Sentar no sofá", "Quarto e sala", "almofada soltando ar, baque macio e a mola")

    for k in range(3):
        r = rng(f"cama{k}")
        y = rangido([0.6, 0.45, 0.8][k], r, [80, 110, 70][k], [140, 90, 150][k], (380, 870, 1600)) * 0.8
        if k == 2:
            y = mix(y, np.concatenate([np.zeros(n_am(0.35)), rangido(0.4, r, 130, 85, (380, 870, 1600)) * 0.6]))
        s(f"cama_rangendo_{k + 1}", reverb(y, 0.4, 0.15), f"Cama rangendo {k + 1}", "Quarto e sala", "rangido da cama ao deitar ou virar")

    # despertador digital: 4 bipes, pausa
    n = n_am(2.0)
    y = np.zeros(n)
    for k in range(4):
        m = n_am(0.09)
        misturar_em(y, lp(quadrada(2700, m, 5), 6000) * env_adsr(m, 0.003, 0.02, 0.9, 0.01) * 0.6, k * 0.16)
    s("despertador_laco", y, "Despertador digital (laço)", "Quarto e sala", "quatro bipes e uma pausa, em laço de 2 s", laco=True)
    n = n_am(2.0)
    y = np.zeros(n)
    for k in range(int(1.25 * 24)):
        sinos = modal([2900, 2900 * 2.6, 4100, 4100 * 2.4], [0.2, 0.08, 0.2, 0.08], [1, 0.3, 0.8, 0.25], 0.25)
        misturar_em(y, sinos * (1.0 if k % 2 else 0.85), k / 24, circular=True)
    y *= curva(n, [(0, 1), (0.6, 1), (0.66, 0.0), (0.97, 0.0), (1, 1)])
    s("despertador_sino_laco", filtro_circ(y, lambda v: lp(v, 9000)), "Despertador de sino (laço)", "Quarto e sala",
      "martelinho entre dois sinos", laco=True)

    # telefones
    n = n_am(3.0)
    y = np.zeros(n)
    mel = [("E6", 0), ("C6", 0.14), ("G6", 0.28), ("E6", 0.42), ("C7", 0.56), ("G6", 0.84),
           ("E6", 1.12), ("C6", 1.26), ("G6", 1.4), ("E6", 1.54), ("C7", 1.68)]
    for nn, t0 in mel:
        misturar_em(y, mix(marimba(hz(nn), 0.5) * 0.7, kalimba(hz(nn), 0.6) * 0.3), t0, circular=True)
    s("telefone_tocando_laco", reverb(y, 0.4, 0.12, circular=True), "Celular tocando (laço)", "Quarto e sala",
      "toque de marimba inventado, laço de 3 s", laco=True)
    n = n_am(4.0)
    y = np.zeros(n)
    for b in range(2):
        for k in range(int(0.45 * 20)):
            misturar_em(y, modal([1150, 1150 * 2.5, 1720, 1720 * 2.3], [0.15, 0.06, 0.15, 0.06], [1, 0.3, 0.7, 0.2], 0.2) * 0.5,
                        b * 0.6 + k / 20, circular=True)
    s("telefone_fixo_laco", filtro_circ(y, lambda v: bp(v, 300, 7000)), "Telefone fixo tocando (laço)", "Quarto e sala",
      "campainha dupla de telefone antigo", laco=True)

    # campainha "ding-dong" de duas barras
    y = np.zeros(n_am(3.0))
    misturar_em(y, modal([hz("E5"), hz("E5") * 2.76, hz("E5") * 5.4], [2.2, 0.9, 0.3], [1, 0.3, 0.1], 2.4), 0)
    misturar_em(y, modal([hz("C5"), hz("C5") * 2.76, hz("C5") * 5.4], [2.4, 1.0, 0.3], [1, 0.3, 0.1], 2.6), 0.55)
    s("campainha", reverb(y, 0.9, 0.2), "Campainha", "Quarto e sala", "\"ding-dong\" de duas barras de metal")
    try:
        x, cr = cc0("doorbell", "doorbell.wav")
        s("campainha_beepbox", x, "Campainha eletrônica (CC0)", "Quarto e sala", "campainha feita no BeepBox, CC0", origem="cc0", creditos=[cr])
    except Exception as e:
        print("campainha cc0", e)

    # aspirador
    r = rng("aspirador")
    n = n_am(8.0)
    t = np.arange(n) / SR
    f0 = 187.5   # período inteiro dentro do laço
    motor = sum(np.sin(2 * np.pi * f0 * k * t + r.uniform(0, 6)) * (0.6 / k) for k in range(1, 12))
    apito = np.sin(2 * np.pi * 2437.5 * t) * 0.05 + np.sin(2 * np.pi * 3750 * t) * 0.03
    ar = ruido_espectral(n, -0.6, r) * 1.0
    ar = filtro_circ(ar, lambda v: bp(v, 250, 7000))
    y = (motor * 0.25 + apito + ar) * (1 + 0.05 * curva_lenta(n, r, 0.6))
    s("aspirador_laco", y, "Aspirador ligado (laço)", "Limpeza", "motor, apito agudo e ar", laco=True)
    m = n_am(1.5)
    ff = curva(m, [(0, 0.05), (1, 1)]) ** 0.6 * f0
    lig = sum(np.sin(fase(ff * k, m)) * (0.6 / k) for k in range(1, 10)) * 0.25 + bp(ruido(m, r), 250, 7000) * curva(m, [(0, 0), (1, 1)]) * 1.0
    s("aspirador_ligar", lig * curva(m, [(0, 0), (0.1, 0.5), (1, 1)]), "Aspirador: ligar", "Limpeza", "motor subindo", fade_sai=0.05)
    m = n_am(2.0)
    ff = curva(m, [(0, 1), (1, 0.05)]) ** 1.5 * f0
    des = sum(np.sin(fase(ff * k, m)) * (0.6 / k) for k in range(1, 10)) * 0.25 + bp(ruido(m, r), 250, 7000) * curva(m, [(0, 1), (0.5, 0.2), (1, 0)]) * 1.0
    s("aspirador_desligar", des * curva(m, [(0, 1), (1, 0)]), "Aspirador: desligar", "Limpeza", "motor descendo")

    r = rng("vassoura")
    n = n_am(4.2)
    y = np.zeros(n)
    for k in range(6):
        m = n_am(0.42)
        ida = k % 2 == 0
        fc = np.geomspace(2500, 6000, m) if ida else np.geomspace(5000, 2200, m)
        golpe = filtro_variavel(ruido(m, r), fc, "band", 0.7) * curva(m, [(0, 0), (0.25, 1), (1, 0)]) ** 1.3 * 2.4
        golpe += estalos(m, r, 300, 2000, 8000, circular=False) * curva(m, [(0, 0), (0.3, 1), (1, 0)]) * 0.15
        misturar_em(y, golpe * (1.0 if ida else 0.7), k * 0.7 + r.uniform(0, 0.03), circular=True)
    s("vassoura_laco", y, "Vassoura (laço)", "Limpeza", "vassouradas para lá e para cá", laco=True)
    try:
        x, cr, t0 = trecho_estavel("general-household-sound-effects", "vacuumcleaner01.wav", 9.0)
        s("aspirador_gravado_laco", laco_cruzado(x, 1.0), "Aspirador, gravação (laço)", "Limpeza",
          f"gravação real, trecho a partir de {t0:.0f} s, fechado em laço", laco=True, origem="cc0", creditos=[cr])
    except Exception as e:
        print("aspirador cc0", e)


PARTES = {"banheiro": banheiro, "cozinha": cozinha, "moveis": moveis, "eletronicos": eletronicos, "passos": passos, "quarto": quarto}

if __name__ == "__main__":
    for p in (sys.argv[1:] or PARTES):
        PARTES[p]()
