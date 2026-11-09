"""Sons dos bichos do Morada: cachorros (pequeno, médio, grande), gatos (miado e ronronar), pássaro, pombo,
gaivota e bichos do zoológico (leão, elefante, macaco).
Os latidos e miados gravados vêm de pacotes CC0 do OpenGameArt; o resto é sintetizado (fonte vocal com
formantes, FM e ruído). Há também latidos e miados sintetizados como alternativa."""
import numpy as np
from scipy import signal
from sons_lib import *
from sons_instrumentos import *

CAT = "bichos"


def s(ident, x, nome, grupo, desc="", **kw):
    it = salvar(CAT, ident, x, nome, grupo, descricao=desc, **kw)
    print(f"{ident:28s} {it['dur']:6.2f}s  {it['lufs']:6.1f} LUFS  pico {it['pico_dbfs']:5.1f} {it['origem']}")


def segmentos(x, lim_db=-24, gap=0.05, dmin=0.08, dmax=0.7):
    """Corta uma gravação em eventos (latidos) pela energia."""
    h = n_am(0.005)
    e = np.array([np.sqrt(np.mean(x[i:i + h] ** 2)) for i in range(0, len(x) - h, h)])
    edb = 20 * np.log10(e + 1e-9)
    on = edb > (edb.max() + lim_db)
    regs = []
    i = 0
    while i < len(on):
        if on[i]:
            j = i
            while j < len(on) and (on[j] or (j + int(gap / 0.005) < len(on) and on[j:j + int(gap / 0.005)].any())):
                j += 1
            regs.append((i, j))
            i = j
        else:
            i += 1
    out = []
    for a, b in regs:
        d = (b - a) * 0.005
        if dmin <= d <= dmax:
            a0 = max(0, a * h - n_am(0.01))
            b0 = min(len(x), b * h + n_am(0.04))
            out.append((float(edb[a:b].max()), x[a0:b0]))
    return [seg for _, seg in sorted(out, key=lambda t: -t[0])]


def reamostrar(x, fator):
    """Muda altura e duração juntas (fator > 1: mais agudo e curto)."""
    num = 1000
    den = int(round(1000 * fator))
    return signal.resample_poly(x, num, den)


def voz_animal(dur, f0c, formc, bw, ganhos=None, sopro=0.1, aspereza=0.0, inclinacao=1.0, semente=0, env=None, harm=60):
    """Vocalização sintética: fonte glotal (f0 por pontos) em formantes (por pontos), com sopro e aspereza."""
    r = rng(semente)
    n = n_am(dur)
    f0 = curva(n, f0c)
    src = fonte_glotal(f0, 0.6, inclinacao, harm, 0.02, r)
    if aspereza > 0:   # modulação sub-harmônica e irregular (rosnado)
        src *= 1 + aspereza * (0.6 * np.sin(np.cumsum(2 * np.pi * f0 * 0.5 / SR)) + 0.4 * curva_lenta(n, r, 60))
    src = src + ruido(n, r) * sopro * 3
    F = [curva(n, fc) if isinstance(fc, list) else fc for fc in formc]
    y = filtro_formantes(src, F, bw, ganhos)
    e = curva(n, env) if env else curva(n, [(0, 0), (0.08, 1), (0.7, 0.8), (1, 0)])
    return y * e


def latido_sint(tam, k):
    esc = {"pequeno": (1.9, 1.45, 0.11), "medio": (1.0, 1.0, 0.16), "grande": (0.55, 0.72, 0.24)}[tam]
    fm, ff, dur = esc
    r = rng(f"lat{tam}{k}")
    f0 = 380 * fm * r.uniform(0.92, 1.08)
    y = voz_animal(dur, [(0, f0 * 0.8), (0.18, f0 * 1.25), (1, f0 * 0.6)],
                   [[(0, 500 * ff), (0.3, 900 * ff), (1, 600 * ff)], [(0, 1300 * ff), (0.3, 1700 * ff), (1, 1400 * ff)], 2600 * ff, 3800 * ff],
                   [140 * ff, 200 * ff, 300 * ff, 400 * ff], [1.0, 0.8, 0.35, 0.15], sopro=0.35, aspereza=0.5 if tam == "grande" else 0.25,
                   inclinacao=0.9, semente=k, env=[(0, 0), (0.06, 1), (0.35, 0.8), (1, 0)])
    return y


def miado_sint(k, filhote=False):
    r = rng(f"miado{k}{filhote}")
    dur = r.uniform(0.6, 0.9) * (0.7 if filhote else 1)
    f0 = r.uniform(480, 620) * (1.5 if filhote else 1)
    ff = 1.25 if filhote else 1.0
    y = voz_animal(dur, [(0, f0 * 0.9), (0.3, f0 * 1.35), (0.7, f0 * 1.2), (1, f0 * 0.8)],
                   [[(0, 400 * ff), (0.3, 950 * ff), (0.75, 800 * ff), (1, 450 * ff)],
                    [(0, 2300 * ff), (0.3, 1700 * ff), (0.75, 1300 * ff), (1, 900 * ff)], 3200 * ff, 4500 * ff],
                   [120, 180, 300, 500], [1.0, 0.7, 0.3, 0.12], sopro=0.08, inclinacao=1.1, semente=k,
                   env=[(0, 0), (0.12, 1), (0.75, 0.85), (1, 0)])
    return y


def main():
    # ---------------- cachorros: latidos gravados (CC0), em três tamanhos por reamostragem
    latidos = []
    creds = []
    for arq in ["x/Dog__Dog.wav", "x/Dog__Dog_1.wav", "x/Dog__Dog_2.wav"]:
        x, cr = cc0("dog-sounds", arq)
        for seg in segmentos(x)[:3]:
            latidos.append(seg)
            creds.append(cr)
    print("latidos gravados encontrados:", len(latidos), [round(len(l) / SR, 2) for l in latidos])
    tamanhos = [("pequeno", "Cachorro pequeno", 1.45), ("medio", "Cachorro médio", 1.0), ("grande", "Cachorro grande", 0.74)]
    for tam, nome, fator in tamanhos:
        for k in range(3):
            if k < len(latidos):
                y = reamostrar(latidos[(k + (0 if tam == "medio" else 3 if tam == "pequeno" else 5)) % len(latidos)], fator)
                if tam == "grande":
                    y = mix(y, lp(y, 400) * 0.5)
                s(f"latido_{tam}_{k + 1}", reverb(y, 0.3, 0.08), f"{nome}: latido {k + 1}", "Cachorros",
                  "latido gravado (CC0), altura ajustada ao tamanho", origem="cc0",
                  creditos=[creds[(k + (0 if tam == 'medio' else 3 if tam == 'pequeno' else 5)) % len(latidos)]])
        # sintetizado: latido simples e duplo
        y = latido_sint(tam, 0)
        s(f"latido_{tam}_sint", reverb(y, 0.3, 0.08), f"{nome}: latido sintetizado", "Cachorros", "alternativa sintetizada")
        y = mix(latido_sint(tam, 1), np.concatenate([np.zeros(n_am(0.22 if tam != "grande" else 0.3)), latido_sint(tam, 2)]))
        s(f"latido_{tam}_duplo_sint", reverb(y, 0.3, 0.08), f"{nome}: \"au-au\" sintetizado", "Cachorros", "dois latidos seguidos")
    for ident, arq, nome in [("cachorro_choro", "x/Dog__Sad_Dog.wav", "Cachorro chorando")]:
        x, cr = cc0("dog-sounds", arq)
        s(ident, x, nome, "Cachorros", "ganido triste gravado (CC0)", origem="cc0", creditos=[cr])

    # ---------------- gatos
    for ident, slug, arq, nome in [("miado_1", "cat-purr-meow", "cat_softmew.wav", "Gato: miado suave"),
                                   ("miado_2", "cat-purr-meow", "cat_mewfood.wav", "Gato: miado pedindo comida"),
                                   ("miado_3", "meow", "Meow.ogg", "Gato: miado curto"),
                                   ("miado_ronron", "cat-purr-meow", "cat_mewpurr.wav", "Gato: miado com ronrom")]:
        x, cr = cc0(slug, arq)
        x = hp(x, 120)
        s(ident, x, nome, "Gatos", "gravação real (CC0)", origem="cc0", creditos=[cr])
    for k in range(2):
        s(f"miado_sint_{k + 1}", reverb(miado_sint(k), 0.3, 0.08), f"Gato: miado sintetizado {k + 1}", "Gatos", "\"mi-au\" com formantes que deslizam")
    s("miado_filhote_sint", reverb(miado_sint(5, True), 0.3, 0.08), "Filhote: miado sintetizado", "Gatos", "miado fino de filhote")
    x, cr = cc0("cat-purr-meow", "cat_purractive_loop.wav")
    s("ronronar_laco", laco_cruzado(hp(x, 30), 1.0), "Gato: ronronar (laço)", "Gatos", "ronrom gravado (CC0), fechado em laço",
      laco=True, origem="cc0", creditos=[cr])
    # ronrom sintetizado: pulsos a ~26 Hz, inspirar e expirar alternados, ressonâncias graves
    r = rng("ronrom")
    n = n_am(6.0)
    t = np.arange(n) / SR
    ciclo = 2.0  # s por respiração; 3 respirações no laço
    fase_resp = (t % ciclo) / ciclo
    f0 = np.where(fase_resp < 0.45, 27.0, 23.0)
    ph = np.cumsum(f0 / SR)
    pulsos = np.diff(np.floor(ph), prepend=0) * (0.7 + 0.3 * r.random(n))
    corpo = ressonador(pulsos, 180, 90) * 1.0 + ressonador(pulsos, 420, 200) * 0.6 + ressonador(pulsos, 900, 400) * 0.2
    corpo = filtro_circ(corpo, lambda v: v)  # (já é periódico: f0 constante por trecho)
    resp = np.sin(np.pi * np.where(fase_resp < 0.45, fase_resp / 0.45, (fase_resp - 0.45) / 0.55)) ** 0.7
    resp = resp * np.where(fase_resp < 0.45, 0.8, 1.0)
    ar = filtro_circ(ruido(n, r), lambda v: bp(v, 300, 2000)) * 0.08
    s("ronronar_sint_laco", (corpo + ar) * (0.15 + resp), "Gato: ronronar sintetizado (laço)", "Gatos",
      "pulsos de 23 a 27 Hz, inspirando e expirando", laco=True)

    # ---------------- aves
    def piado(f, dur, subida, semente):
        n = n_am(dur)
        ff = curva(n, subida) * f
        y = np.sin(fase(ff, n) + 0.1 * np.sin(fase(ff * 2.0, n)))
        return y * curva(n, [(0, 0), (0.15, 1), (0.7, 0.8), (1, 0)])
    for k in range(3):
        r = rng(f"passaro{k}")
        y = np.zeros(n_am(1.6))
        t0 = 0.0
        padrao = [(0.06, [(0, 0.8), (1, 1.3)]), (0.05, [(0, 1.3), (1, 0.9)]), (0.12, [(0, 0.9), (0.5, 1.4), (1, 1.1)])]
        f = r.uniform(3200, 4600)
        for j in range(r.integers(4, 8)):
            d, cv = padrao[(j + k) % 3]
            y = misturar_em(y, piado(f * r.uniform(0.9, 1.1), d, cv, j) * r.uniform(0.6, 1), t0)
            t0 += d + r.uniform(0.03, 0.09)
        if k == 2:   # trinado final
            for j in range(10):
                y = misturar_em(y, piado(f * 1.2, 0.025, [(0, 1.1), (1, 0.9)], j) * 0.6, t0 + j * 0.032)
        s(f"passaro_{k + 1}", reverb(y, 0.6, 0.15), f"Pássaro piando {k + 1}", "Aves", "piados com FM leve e glissandos")
    try:
        x, cr = cc0("ambient-bird-sounds", "birds-isaiah658_0.ogg")
        seg = x[n_am(4.0):n_am(14.0)]
        s("passaros_gravados", fades(seg, 0.3, 0.6), "Pássaros ao fundo (gravação)", "Aves", "10 s de passarinhos gravados (CC0)",
          origem="cc0", creditos=[cr])
    except Exception as e:
        print("pássaros cc0", e)

    for k in range(2):
        r = rng(f"pombo{k}")
        y = np.zeros(n_am(1.8))
        t0 = 0.0
        for j, (d, f, trill) in enumerate([(0.25, 420, 0), (0.55, 470, 1), (0.35, 380, 0)]):
            n = n_am(d)
            ff = curva(n, [(0, f * 0.9), (0.3, f * 1.08), (1, f * 0.85)]) * (1 + 0.04 * k)
            src = fonte_glotal(ff, 0.6, 2.2, 8)
            if trill:
                src *= 1 + 0.6 * np.sin(2 * np.pi * 28 * np.arange(n) / SR)
            v = filtro_formantes(src, [ff * 1.0, 900], [80, 300], [1, 0.25]) * curva(n, [(0, 0), (0.2, 1), (0.8, 0.8), (1, 0)])
            y = misturar_em(y, v, t0)
            t0 += d + 0.06
        s(f"pombo_{k + 1}", reverb(y, 0.5, 0.12), f"Pombo arrulhando {k + 1}", "Aves", "\"ruu-RRUU-ru\" grave com trinado na garganta")

    for k in range(2):
        r = rng(f"gaivota{k}")
        y = np.zeros(n_am(2.2))
        t0 = 0.0
        for j in range(3 + k):
            d = r.uniform(0.25, 0.4) if j else 0.5
            f = r.uniform(1000, 1300)
            v = voz_animal(d, [(0, f * 0.85), (0.25, f * 1.45), (1, f * 0.75)],
                           [[(0, 1900), (0.3, 2600), (1, 2000)], 3600, 5200], [250, 400, 600], [1, 0.6, 0.2],
                           sopro=0.25, aspereza=0.35, inclinacao=0.8, semente=j + 10 * k, harm=20,
                           env=[(0, 0), (0.1, 1), (0.6, 0.7), (1, 0)])
            y = misturar_em(y, v, t0)
            t0 += d + r.uniform(0.05, 0.12)
        s(f"gaivota_{k + 1}", reverb(y, 0.8, 0.2), f"Gaivota {k + 1}", "Aves", "chamados agudos e ásperos em série")

    # ---------------- zoológico
    r = rng("leao")
    y = voz_animal(2.6, [(0, 95), (0.2, 150), (0.45, 165), (0.8, 120), (1, 70)],
                   [[(0, 300), (0.3, 650), (1, 350)], [(0, 900), (0.3, 1250), (1, 800)], 2200, 3200],
                   [150, 220, 400, 600], [1.0, 0.8, 0.3, 0.12], sopro=0.5, aspereza=0.9, inclinacao=0.85, semente=1, harm=90,
                   env=[(0, 0), (0.15, 0.6), (0.4, 1), (0.75, 0.7), (1, 0)])
    y = mix(y, lp(y, 250) * 0.8)
    gr = np.zeros(n_am(1.5))
    for j in range(3):
        gr = misturar_em(gr, voz_animal(0.3, [(0, 90), (1, 70)], [400, 1000, 2300], [200, 300, 500], [1, 0.6, 0.2], sopro=0.6, aspereza=1.0,
                                         semente=5 + j, harm=60, env=[(0, 0), (0.2, 1), (1, 0)]) * (0.6 - 0.12 * j), j * 0.42)
    y = np.concatenate([y, gr])
    s("leao_rugido", reverb(y, 1.4, 0.18), "Leão: rugido", "Zoológico", "rugido grave e áspero seguido de grunhidos")

    r = rng("elefante")
    n = n_am(2.0)
    f0 = curva(n, [(0, 330), (0.12, 520), (0.5, 560), (0.85, 600), (1, 420)])
    f0 *= 1 + 0.03 * np.sin(2 * np.pi * 7 * np.arange(n) / SR)
    src = fonte_glotal(f0, 0.3, 0.55, 40, 0.03, r)
    src = np.tanh(src * 2.5) + ruido(n, r) * 0.25
    y = filtro_formantes(src, [curva(n, [(0, 700), (0.2, 1200), (1, 1000)]), 2100, 3300, 4800], [300, 400, 600, 900], [1, 0.9, 0.5, 0.25])
    y *= curva(n, [(0, 0), (0.08, 0.7), (0.2, 1), (0.85, 0.9), (1, 0)])
    s("elefante_barrido", reverb(y, 1.2, 0.2), "Elefante: barrido", "Zoológico", "trombeta metálica que sobe e treme")

    y = np.zeros(n_am(2.4))
    t0 = 0.0
    for j in range(7):
        f = 280 + 75 * j
        d = 0.16 if j < 5 else 0.3
        vog = [(0, 400), (1, 380)] if j < 5 else [(0, 450), (1, 900)]
        v = voz_animal(d, [(0, f * 0.9), (0.5, f * 1.1), (1, f)], [vog, 1100 if j < 5 else 1500, 2600], [120, 200, 400],
                       [1, 0.4, 0.15], sopro=0.25 if j < 5 else 0.4, inclinacao=1.2, semente=30 + j, harm=40)
        y = misturar_em(y, v, t0)
        t0 += d + (0.07 if j < 5 else 0.05)
    s("macaco", reverb(y, 0.8, 0.15), "Macaco", "Zoológico", "\"uh-uh-uh... aah!\" subindo")


if __name__ == "__main__":
    main()
