"""Conferência dos sons do Morada, feita nos arquivos finais (OGG e MP3 decodificados):
duração, pico de amostra e pico real, loudness integrada, silêncio no começo e no fim, estalo nas bordas,
emenda do laço (salto de amostra, nível, espectro e estalo agudo na emenda), saturação e DC.
Grava sons_out/_conferencia.json e a folha de espectrogramas sons_out/_conferencia.png.

Uso: python sons_confere.py [rodada]     (rodada só entra no nome do resumo)
"""
import json, os, sys, glob
import numpy as np
from scipy import signal
from sons_lib import *

TOL_LU = 1.0


def env_db(x, h):
    e = np.sqrt(np.convolve(x ** 2, np.ones(h) / h, mode="same") + 1e-20)
    return 20 * np.log10(e)


def bandas(x):
    """Energia em 24 bandas log de 60 Hz a 16 kHz (dB)."""
    X = np.abs(np.fft.rfft(x * np.hanning(len(x)))) ** 2
    f = np.fft.rfftfreq(len(x), 1 / SR)
    lim = np.geomspace(60, 16000, 25)
    return np.array([10 * np.log10(X[(f >= a) & (f < b)].sum() + 1e-12) for a, b in zip(lim[:-1], lim[1:])])


def medir(x, laco, alvo, bpm=None):
    m = {}
    mono = x if x.ndim == 1 else x.mean(1)
    n = len(mono)
    m["dur"] = round(n / SR, 3)
    pk = np.max(np.abs(x))
    m["pico_dbfs"] = round(float(db(pk)), 2)
    m["pico_real_dbtp"] = round(float(pico_real(x)), 2)
    m["lufs"] = round(float(lufs(x)), 2)
    m["dif_alvo"] = round(m["lufs"] - alvo, 2)
    m["saturadas"] = int(np.sum(np.abs(x) > 0.999))
    m["dc"] = round(float(np.mean(mono)), 5)
    e = env_db(mono, n_am(0.005))
    acima = np.where(e > db(pk) - 40)[0]
    m["silencio_ini_ms"] = round(1000 * acima[0] / SR, 1) if len(acima) else None
    m["silencio_fim_ms"] = round(1000 * (n - acima[-1]) / SR, 1) if len(acima) else None
    b = max(1, n_am(0.0001))
    m["borda_ini_dbfs"] = round(float(db(np.max(np.abs(mono[:b])))), 1)
    m["borda_fim_dbfs"] = round(float(db(np.max(np.abs(mono[-b:])))), 1)
    # transientes abruptos (agudos que saltam sobre a vizinhança): informativo
    hf = hp(mono, 9000, 4)
    h = n_am(0.001)
    fr = np.sqrt(np.add.reduceat(hf ** 2, np.arange(0, n - h, h)) / h + 1e-20)
    frdb = 20 * np.log10(fr)
    from scipy.ndimage import median_filter
    med = median_filter(frdb, size=51, mode="wrap" if laco else "nearest")
    m["transientes"] = int(np.sum((frdb - med) > 24))
    if laco:
        # a emenda é comparada com cortes no meio do próprio arquivo: ela deve parecer um ponto qualquer
        def corte(a, b):
            k = n_am(0.05)
            la = max(-90, db(np.sqrt(np.mean(a[-k:] ** 2))))
            lb = max(-90, db(np.sqrt(np.mean(b[:k] ** 2))))
            w = n_am(0.1)
            ea, eb = np.maximum(bandas(a[-w:]), -120), np.maximum(bandas(b[:w]), -120)
            hh = n_am(0.001)
            cc = np.concatenate([a[-n_am(0.012):], b[:n_am(0.012)]])
            hfc = hp(cc, 9000, 4)
            fc = 20 * np.log10(np.sqrt(np.add.reduceat(hfc ** 2, np.arange(0, len(cc) - hh + 1, hh)) / hh + 1e-20))
            c = len(fc) // 2
            viz = np.concatenate([fc[: c - 2], fc[c + 2:]])
            est = max(-90, fc[c - 1:c + 1].max()) - max(-90, viz.max())
            salto = abs(b[0] - a[-1])
            return abs(la - lb), float(np.mean(np.abs(ea - eb))), float(est), float(salto)
        em = corte(mono, mono)
        k5 = n_am(0.05)
        lados = (db(np.sqrt(np.mean(mono[-k5:] ** 2))), db(np.sqrt(np.mean(mono[:k5] ** 2))))
        m["emenda_lados_dbfs"] = [round(float(max(v, -120)), 1) for v in lados]
        r_ = np.random.default_rng(1)
        if bpm:   # música: a emenda cai no começo de um compasso; compara com os outros começos de compasso
            comp = n_am(4 * 60 / bpm)
            pos = [k * comp for k in range(1, n // comp) if n_am(0.2) < k * comp < n - n_am(0.2)]
        else:
            pos = list(r_.integers(n_am(0.2), n - n_am(0.2), 40))
        internos = np.array([corte(mono[:i], mono[i:]) for i in pos])
        d = np.abs(np.diff(mono))
        m["emenda_nivel_db"] = round(em[0], 2)
        m["emenda_nivel_max_interno"] = round(float(internos[:, 0].max()), 2)
        m["emenda_espectro"] = round(em[1] / (np.median(internos[:, 1]) + 1e-9), 2)
        m["emenda_espectro_max_interno"] = round(float(internos[:, 1].max() / (np.median(internos[:, 1]) + 1e-9)), 2)
        m["emenda_estalo_db"] = round(em[2], 1)
        m["emenda_salto_p99"] = round(em[3] / (np.percentile(d, 99) + 1e-9), 3)
    return m


def problemas(m, it):
    p = []
    if it.get("parte") in ("inicio", "fim"):
        pass   # início e fim de música levam o ganho do laço (a loudness própria é menor de propósito)
    elif abs(m["dif_alvo"]) > (TOL_LU if m["dur"] >= 0.4 else 1.5):
        # abaixo de 400 ms a norma não define a loudness integrada: o som inteiro vira um bloco só, tolerância 1,5 LU
        p.append(f"loudness {m['lufs']} (alvo {it['alvo_lufs']})")
    if m["pico_real_dbtp"] > -1.0:
        p.append(f"pico real {m['pico_real_dbtp']} dBTP")
    if m["saturadas"]:
        p.append(f"{m['saturadas']} amostras saturadas")
    if abs(m["dc"]) > 0.005:
        p.append(f"DC {m['dc']}")
    if not it["laco"]:
        if m["silencio_ini_ms"] is not None and m["silencio_ini_ms"] > 60:
            p.append(f"silêncio no começo {m['silencio_ini_ms']} ms")
        if m["borda_ini_dbfs"] > -35:
            p.append(f"borda inicial alta {m['borda_ini_dbfs']} dBFS")
        if m["borda_fim_dbfs"] > -40:
            p.append(f"borda final alta {m['borda_fim_dbfs']} dBFS (estalo)")
    else:
        sonoros = min(m["emenda_lados_dbfs"]) > -60   # silêncio de um lado: começo de nota, não emenda
        if sonoros and m["emenda_nivel_db"] > max(3.0, m["emenda_nivel_max_interno"] * 1.2):
            p.append(f"emenda: nível muda {m['emenda_nivel_db']} dB (no meio, até {m['emenda_nivel_max_interno']})")
        if sonoros and m["emenda_espectro"] > max(2.5, m["emenda_espectro_max_interno"] * 1.2):
            p.append(f"emenda: espectro muda {m['emenda_espectro']}× (no meio, até {m['emenda_espectro_max_interno']}×)")
        if m["emenda_estalo_db"] > 12:
            p.append(f"emenda: estalo agudo {m['emenda_estalo_db']} dB acima da vizinhança")
        if m["emenda_salto_p99"] > 1.0:
            p.append(f"emenda: salto de amostra {m['emenda_salto_p99']}× o p99")
    return p


def carregar_registro():
    itens = {}
    for f in sorted(glob.glob(os.path.join(REG, "*.json"))):
        if os.path.basename(f).startswith("_"):
            continue
        itens.update({f"{v['cat']}/{k}": v for k, v in json.load(open(f)).items()})
    return itens


def folha(itens, medidas, caminho):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    escolha = []
    por_cat = {}
    for k, it in itens.items():
        por_cat.setdefault(it["cat"], []).append(k)
    cotas = {"interface": 5, "casa": 7, "bichos": 6, "ambientes": 5, "voz": 6, "musica": 7}
    for c, ks in por_cat.items():
        ks = sorted(ks)
        q = cotas.get(c, 3)
        passo = max(1, len(ks) // q)
        escolha += ks[::passo][:q]
    cols = 6
    rows = int(np.ceil(len(escolha) / cols))
    fig, axs = plt.subplots(rows, cols, figsize=(cols * 3.3, rows * 2.5), dpi=80)
    axs = np.array(axs).reshape(-1)
    for ax, k in zip(axs, escolha):
        it = itens[k]
        x = ler_audio(os.path.join(OUT, it["arquivo"] + ".ogg"))
        rot = ""
        if it["laco"]:
            w = n_am(min(1.0, len(x) / SR / 2))
            x = np.concatenate([x[-w:], x[:w]])
            rot = " (emenda)"
        elif len(x) > n_am(12):
            x = x[: n_am(12)]
        f, t, S = signal.spectrogram(x, SR, nperseg=1024, noverlap=768)
        ax.pcolormesh(t, f / 1000, 10 * np.log10(S + 1e-12), shading="auto", cmap="magma", vmin=-110, vmax=-30)
        if it["laco"]:
            ax.axvline(len(x) / SR / 2, color="#7fd3ff", lw=1, ls="--")
        ax.set_ylim(0, 16)
        m = medidas[k]["ogg"]
        ax.set_title(f"{it['cat']}/{it['id']}{rot}\n{m['lufs']} LUFS · pico {m['pico_real_dbtp']} dBTP", fontsize=7.5)
        ax.tick_params(labelsize=6)
    for ax in axs[len(escolha):]:
        ax.axis("off")
    fig.suptitle("Morada · sons: espectrogramas de amostra (kHz × s). Nos laços, o fim seguido do começo, com a emenda tracejada.", fontsize=10)
    fig.tight_layout()
    fig.savefig(caminho)
    plt.close(fig)


def main():
    rodada = sys.argv[1] if len(sys.argv) > 1 else "1"
    itens = carregar_registro()
    medidas = {}
    resumo = {"rodada": rodada, "total": len(itens), "com_problema": 0, "problemas": {}}
    for k, it in itens.items():
        medidas[k] = {}
        for fmt in ("ogg", "mp3"):
            cam = os.path.join(OUT, it["arquivo"] + "." + fmt)
            x = ler_audio(cam, mono=(it.get("canais", 1) == 1))
            m = medir(x, it["laco"], it["alvo_lufs"], it.get("bpm"))
            if fmt == "mp3":
                m["amostras_a_mais"] = int(len(x) - it.get("amostras", len(x)))
            m["kb"] = round(os.path.getsize(cam) / 1024, 1)
            m["problemas"] = problemas(m, it)
            medidas[k][fmt] = m
        p = medidas[k]["ogg"]["problemas"] + [f"[mp3] {q}" for q in medidas[k]["mp3"]["problemas"]]
        if p:
            resumo["com_problema"] += 1
            resumo["problemas"][k] = p
    json.dump({"resumo": resumo, "medidas": medidas}, open(os.path.join(OUT, "_conferencia.json"), "w"), indent=1, ensure_ascii=False)
    linhas = [f"rodada {rodada}: {len(itens)} sons, {resumo['com_problema']} com algo fora"]
    linhas += [f"  {k} → " + "; ".join(p) for k, p in resumo["problemas"].items()]
    # resumo por categoria (medido no OGG)
    por = {}
    for k, it in itens.items():
        m = medidas[k]["ogg"]
        c = por.setdefault(it["cat"], {"n": 0, "lufs": [], "tp": [], "dur": 0.0, "lacos": 0, "salto": []})
        c["n"] += 1; c["dur"] += m["dur"]
        if it.get("parte") not in ("inicio", "fim"):
            c["lufs"].append(m["lufs"])
        c["tp"].append(m["pico_real_dbtp"])
        if it["laco"]:
            c["lacos"] += 1; c["salto"].append(m["emenda_salto_p99"])
    for cat, c in por.items():
        linhas.append(f"  [{cat}] {c['n']} arquivos, {c['dur'] / 60:.1f} min; LUFS {min(c['lufs']):.1f} a {max(c['lufs']):.1f}; "
                      f"pico real máx {max(c['tp']):.2f} dBTP; {c['lacos']} laços, salto na emenda máx "
                      f"{(max(c['salto']) if c['salto'] else 0):.3f}× o p99 das diferenças")
    print("\n".join(linhas))
    open(os.path.join(OUT, f"_conferencia_rodada{rodada}.txt"), "w").write("\n".join(linhas) + "\n")
    if "--sem-folha" not in sys.argv:
        folha(itens, medidas, os.path.join(OUT, "_conferencia.png"))
        print("folha:", os.path.join(OUT, "_conferencia.png"))


if __name__ == "__main__":
    main()
