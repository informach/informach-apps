"""Base comum dos sons do Morada: osciladores, ruído, filtros, envelopes, reverberação, laço sem emenda,
medida de loudness (ITU-R BS.1770-4) e gravação em OGG (Vorbis) e MP3 a 44,1 kHz.

Tudo é gerado por código. Os WAV intermediários ficam em /dev/shm (o disco do scratchpad está quase cheio);
só os OGG e MP3 finais vão para sons_out/.
"""
import json, os, subprocess, hashlib
import numpy as np
from scipy import signal

SR = 44100
SP = "/tmp/claude-0/-home-user-informach-apps/4b0c5cb8-e6f3-54e3-8b85-cd31fc21bb7f/scratchpad"
OUT = os.path.join(SP, "sons_out")
TMP = "/dev/shm/morada_sons/wav"
REG = os.path.join(OUT, "_registro")
ALVO_EFEITO = -16.0
ALVO_MUSICA = -20.0
PICO_MAX = -1.5   # dBFS de pico de amostra antes de codificar (a codificação sobe um pouco)

os.makedirs(TMP, exist_ok=True)
os.makedirs(REG, exist_ok=True)


def rng(semente):
    if isinstance(semente, str):
        semente = int(hashlib.md5(semente.encode()).hexdigest()[:8], 16)
    return np.random.default_rng(semente)


def n_am(d):
    return int(round(d * SR))


def tempo(d):
    return np.arange(n_am(d)) / SR


def db(x):
    return 20 * np.log10(np.maximum(np.abs(x), 1e-12))


def de_db(v):
    return 10 ** (v / 20)


# ---------------------------------------------------------------- envelopes

def env_exp(n, ataque=0.002, queda=0.2, total=None):
    """Ataque linear curto e queda exponencial (queda = tempo para -60 dB)."""
    if isinstance(n, float):
        n = n_am(n)
    t = np.arange(n) / SR
    a = np.clip(t / max(ataque, 1e-5), 0, 1)
    d = np.exp(-6.9 * np.maximum(t - ataque, 0) / max(queda, 1e-4))
    return a * d


def env_adsr(n, a=0.01, d=0.1, s=0.7, r=0.2, nota=None):
    if isinstance(n, float):
        n = n_am(n)
    t = np.arange(n) / SR
    nota = (n / SR - r) if nota is None else nota
    e = np.where(t < a, t / max(a, 1e-5), s + (1 - s) * np.exp(-5 * (t - a) / max(d, 1e-4)))
    rel = np.clip(1 - (t - nota) / max(r, 1e-4), 0, 1) ** 2
    return e * np.where(t > nota, rel, 1)


def curva(n, pontos):
    """Curva por pontos [(t_relativo 0..1, valor), ...] interpolada."""
    if isinstance(n, float):
        n = n_am(n)
    xs = np.array([p[0] for p in pontos]) * (n - 1)
    ys = np.array([p[1] for p in pontos])
    return np.interp(np.arange(n), xs, ys)


def fades(x, ent=0.002, sai=0.02):
    x = x.copy()
    a, b = min(n_am(ent), len(x) // 2), min(n_am(sai), len(x) // 2)
    if a > 0:
        r = np.linspace(0, 1, a) ** 2
        x[:a] *= r if x.ndim == 1 else r[:, None]
    if b > 0:
        r = np.linspace(1, 0, b) ** 2
        x[-b:] *= r if x.ndim == 1 else r[:, None]
    return x


# ---------------------------------------------------------------- osciladores

def fase(freq, n=None):
    """Fase acumulada para frequência constante ou variável (array)."""
    if np.isscalar(freq):
        return 2 * np.pi * freq * np.arange(n) / SR
    return 2 * np.pi * np.cumsum(freq) / SR


def seno(freq, n=None, f0=0.0):
    return np.sin(fase(freq, n) + f0)


def serra(freq, n=None, harm=30):
    """Dente de serra limitada por banda (soma de harmônicos abaixo de Nyquist)."""
    ph = fase(freq, n)
    fmax = np.max(freq) if not np.isscalar(freq) else freq
    k_max = int(min(harm, (SR / 2 - 200) / max(fmax, 1)))
    y = np.zeros_like(ph)
    for k in range(1, max(k_max, 1) + 1):
        y += np.sin(k * ph) / k
    return y * (2 / np.pi)


def quadrada(freq, n=None, harm=25):
    ph = fase(freq, n)
    fmax = np.max(freq) if not np.isscalar(freq) else freq
    y = np.zeros_like(ph)
    for k in range(1, harm * 2, 2):
        if k * fmax > SR / 2 - 200:
            break
        y += np.sin(k * ph) / k
    return y * (4 / np.pi)


def triangulo(freq, n=None, harm=15):
    ph = fase(freq, n)
    fmax = np.max(freq) if not np.isscalar(freq) else freq
    y = np.zeros_like(ph)
    s = 1
    for k in range(1, harm * 2, 2):
        if k * fmax > SR / 2 - 200:
            break
        y += s * np.sin(k * ph) / (k * k)
        s = -s
    return y * (8 / np.pi ** 2)


def fm(fc, razao, indice, n, env_ind=None):
    """FM simples: portadora fc, moduladora fc*razao, índice (constante ou envelope)."""
    ind = indice * (env_ind if env_ind is not None else 1.0)
    pm = fase(fc * razao if np.isscalar(fc) else fc * razao, n)
    pc = fase(fc, n)
    return np.sin(pc + ind * np.sin(pm))


def karplus(freq, dur, brilho=0.5, decai=0.996, semente=1):
    """Corda dedilhada (Karplus-Strong) vetorizada com lfilter."""
    n = n_am(dur)
    p = SR / freq
    N = int(p)
    frac = p - N
    r = rng(semente)
    exc = np.zeros(n)
    rajada = r.uniform(-1, 1, N)
    rajada = signal.lfilter([brilho, 1 - brilho], [1], rajada)
    exc[:N] = rajada
    # y[n] = x[n] + g*((1-frac)*y[n-N] + frac*y[n-N-1]) com média de dois pontos (passa-baixas)
    g = decai
    a = np.zeros(N + 3)
    a[0] = 1
    a[N] -= g * 0.5 * (1 - frac)
    a[N + 1] -= g * 0.5
    a[N + 2] -= g * 0.5 * frac
    return signal.lfilter([1], a, exc)


def modal(freqs, quedas, amps, dur, ataque=0.0005):
    """Soma de modos senoidais com queda própria (marimba, sinos, madeira, metal)."""
    n = n_am(dur)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for f, q, a in zip(freqs, quedas, amps):
        if f < SR / 2 - 100:
            y += a * np.sin(2 * np.pi * f * t) * np.exp(-6.9 * t / q)
    return y * np.clip(t / ataque, 0, 1)


# ---------------------------------------------------------------- ruído e filtros

def ruido(n, r=None, cor="branco"):
    if isinstance(n, float):
        n = n_am(n)
    r = r or rng(0)
    if cor == "branco":
        return r.standard_normal(n) * 0.3
    return ruido_espectral(n, {"rosa": -1.0, "marrom": -2.0, "azul": 1.0}[cor], r)


def ruido_espectral(n, inclinacao, r, fmin=20, fmax=None):
    """Ruído periódico (circular) com espectro ~ f^(inclinacao/2) em amplitude. Laço perfeito por construção."""
    f = np.fft.rfftfreq(n, 1 / SR)
    mag = np.where(f > fmin, np.maximum(f, fmin) ** (inclinacao / 2), 0)
    if fmax:
        mag = mag * (f < fmax)
    fase_ = r.uniform(0, 2 * np.pi, len(f))
    y = np.fft.irfft(mag * np.exp(1j * fase_), n)
    return y / (np.std(y) + 1e-12) * 0.3


def ruido_banda(n, r, centro, largura, circular=True):
    """Ruído em banda (gaussiana em log-frequência), circular."""
    f = np.fft.rfftfreq(n, 1 / SR)
    lf = np.log2(np.maximum(f, 1) / centro)
    mag = np.exp(-0.5 * (lf / largura) ** 2)
    y = np.fft.irfft(mag * np.exp(1j * r.uniform(0, 2 * np.pi, len(f))), n)
    return y / (np.std(y) + 1e-12) * 0.3


def curva_lenta(n, r, fmax_hz, circular=True):
    """Curva aleatória suave (0 média, ~1 desvio) com conteúdo até fmax_hz; periódica em n."""
    f = np.fft.rfftfreq(n, 1 / SR)
    mag = np.where((f > 0) & (f < fmax_hz), 1.0, 0.0)
    if mag.sum() == 0:
        mag[1] = 1
    y = np.fft.irfft(mag * np.exp(1j * r.uniform(0, 2 * np.pi, len(f))), n)
    return y / (np.std(y) + 1e-12)


def lp(x, fc, ordem=2):
    fc = min(fc, SR / 2 * 0.98)
    return signal.sosfilt(signal.butter(ordem, fc, "low", fs=SR, output="sos"), x, axis=0)


def hp(x, fc, ordem=2):
    return signal.sosfilt(signal.butter(ordem, fc, "high", fs=SR, output="sos"), x, axis=0)


def bp(x, f1, f2, ordem=2):
    f2 = min(f2, SR / 2 * 0.98)
    return signal.sosfilt(signal.butter(ordem, [f1, f2], "band", fs=SR, output="sos"), x, axis=0)


def lp_circ(x, fc, ordem=2):
    """Passa-baixas aplicado em modo circular (para laços): filtra 3 voltas e pega a do meio."""
    n = len(x)
    y = lp(np.concatenate([x, x, x], axis=0), fc, ordem)
    return y[n:2 * n]


def filtro_circ(x, fn):
    n = len(x)
    y = fn(np.concatenate([x, x, x], axis=0))
    return y[n:2 * n]


def ressonador(x, f, bw):
    """Ressonador de 2ª ordem (formante) com ganho unitário no pico aproximado."""
    r = np.exp(-np.pi * bw / SR)
    th = 2 * np.pi * f / SR
    a = [1, -2 * r * np.cos(th), r * r]
    b = [1 - r]
    return signal.lfilter(b, a, x)


def pico_eq(x, f, ganho_db, q=1.0):
    A = 10 ** (ganho_db / 40)
    w0 = 2 * np.pi * f / SR
    al = np.sin(w0) / (2 * q)
    b = [1 + al * A, -2 * np.cos(w0), 1 - al * A]
    a = [1 + al / A, -2 * np.cos(w0), 1 - al / A]
    return signal.lfilter(np.array(b) / a[0], np.array(a) / a[0], x, axis=0)


def filtro_variavel(x, fcs, tipo="low", q=0.9, bloco=256):
    """Filtro de estado variável com frequência mudando por bloco (estado preservado)."""
    y = np.zeros_like(x)
    zi = np.zeros(2)
    for i in range(0, len(x), bloco):
        fc = float(np.clip(fcs[min(i, len(fcs) - 1)], 30, SR / 2 * 0.95))
        w0 = 2 * np.pi * fc / SR
        al = np.sin(w0) / (2 * q)
        c = np.cos(w0)
        if tipo == "low":
            b = [(1 - c) / 2, 1 - c, (1 - c) / 2]
        elif tipo == "high":
            b = [(1 + c) / 2, -(1 + c), (1 + c) / 2]
        else:
            b = [al, 0, -al]
        a = [1 + al, -2 * c, 1 - al]
        b = np.array(b) / a[0]
        a = np.array(a) / a[0]
        y[i:i + bloco], zi = signal.lfilter(b, a, x[i:i + bloco], zi=zi)
    return y


# ---------------------------------------------------------------- espaço

def resposta_sala(dur=1.2, pre=0.01, brilho=6000, r=None, estereo=False, densa=True):
    """Resposta ao impulso sintética: ruído com queda exponencial, mais escura no fim."""
    r = r or rng(7)
    n = n_am(dur)
    t = np.arange(n) / SR
    canais = []
    for c in range(2 if estereo else 1):
        z = r.standard_normal(n)
        cl = lp(z, brilho * 0.35)
        ch = z - cl
        e_low = np.exp(-6.9 * t / dur)
        e_high = np.exp(-6.9 * t / (dur * 0.45))
        ir = cl * e_low + ch * e_high
        ir[: n_am(pre)] = 0
        canais.append(ir / np.sqrt(np.sum(ir ** 2)))
    return np.stack(canais, 1) if estereo else canais[0]


def reverb(x, dur=1.0, mix=0.2, brilho=6000, circular=False, semente=7, pre=0.012):
    """Reverberação por convolução com IR sintética. Mono ou estéreo.
    Circular (laços): mesmo comprimento, a cauda volta ao começo. Senão: o resultado ganha a cauda."""
    r = rng(semente)
    est = x.ndim == 2
    ir = resposta_sala(dur, pre, brilho, r, estereo=True)
    n = len(x)
    if circular:
        def conv(sig, h):
            hh = np.zeros(n)
            k = min(len(h), n)
            hh[:k] = h[:k]
            return np.fft.irfft(np.fft.rfft(sig) * np.fft.rfft(hh), n)
        seco = x
    else:
        def conv(sig, h):
            return signal.fftconvolve(sig, h)
        pad = np.zeros((len(ir) - 1,) + x.shape[1:])
        seco = np.concatenate([x, pad], axis=0)
    if est:
        mol = np.stack([conv(x[:, 0], ir[:, 0]), conv(x[:, 1], ir[:, 1])], 1)
    else:
        mol = conv(x, ir[:, 0])
    return seco * (1 - mix * 0.5) + mol * mix


def mix(*xs):
    """Soma sinais de comprimentos diferentes (completa com zeros)."""
    n = max(len(x) for x in xs)
    sh = next((x.shape[1:] for x in xs if x.ndim == 2), ())
    y = np.zeros((n,) + sh)
    for x in xs:
        if x.ndim == 1 and sh:
            x = np.stack([x, x], 1)
        y[: len(x)] += x
    return y


def estereo(x, pan=0.0, largura=0.0, semente=3):
    """Mono → estéreo com pan (-1..1) por potência constante; largura cria leve descorrelação."""
    a = (pan + 1) * np.pi / 4
    L, R = x * np.cos(a), x * np.sin(a)
    if largura > 0:
        d = n_am(0.011)
        R = (1 - largura) * R + largura * np.concatenate([np.zeros(d), R[:-d]])
    return np.stack([L, R], 1)


def misturar_em(buf, som, t0, ganho=1.0, circular=False):
    """Soma 'som' em 'buf' a partir de t0 (s). Circular: o que passa do fim volta ao começo."""
    i = n_am(t0)
    n = len(buf)
    m = len(som)
    if circular:
        i %= n
        while m > 0:
            k = min(m, n - i)
            buf[i:i + k] += som[:k] * ganho
            som = som[k:]
            m -= k
            i = 0
        return buf
    if i >= n:
        return buf
    k = min(m, n - i)
    buf[i:i + k] += som[:k] * ganho
    return buf


def laco_cruzado(x, xf):
    """Fecha um laço de material não periódico: os últimos xf segundos entram, em potência constante,
    no começo. Devolve len(x) - xf amostras; fim e começo ficam contínuos."""
    k = n_am(xf)
    corpo = x[:-k].copy()
    cauda = x[-k:]
    a = np.linspace(0, np.pi / 2, k)
    fi, fo = np.sin(a), np.cos(a)
    if x.ndim == 2:
        fi, fo = fi[:, None], fo[:, None]
    corpo[:k] = corpo[:k] * fi + cauda * fo
    return corpo


# ---------------------------------------------------------------- medida

def _kweight(x):
    """K-weighting do BS.1770 com os coeficientes oficiais de 48 kHz (o sinal é reamostrado para 48 kHz)."""
    x48 = signal.resample_poly(x, 160, 147, axis=0)
    b1 = [1.53512485958697, -2.69169618940638, 1.19839281085285]
    a1 = [1.0, -1.69065929318241, 0.73248077421585]
    b2 = [1.0, -2.0, 1.0]
    a2 = [1.0, -1.99004745483398, 0.99007225036621]
    return signal.lfilter(b2, a2, signal.lfilter(b1, a1, x48, axis=0), axis=0)


def lufs(x):
    """Loudness integrada (BS.1770-4, com portas absoluta e relativa). Para sons mais curtos que
    400 ms, usa o próprio som como um bloco só (é a convenção usada na conferência)."""
    x = np.asarray(x, dtype=np.float64)
    if x.ndim == 1:
        x = x[:, None]
    y = _kweight(x)
    n = len(y)
    bl = int(0.4 * 48000)
    if n < bl:
        z = np.mean(y ** 2, axis=0).sum()
        return -0.691 + 10 * np.log10(max(z, 1e-20))
    passo = int(0.1 * 48000)
    p2 = np.cumsum(np.concatenate([np.zeros((1, y.shape[1])), y ** 2]), axis=0)
    ini = np.arange(0, n - bl + 1, passo)
    z = ((p2[ini + bl] - p2[ini]) / bl).sum(1)
    l = -0.691 + 10 * np.log10(np.maximum(z, 1e-20))
    z = z[l > -70]
    if len(z) == 0:
        return -100.0
    lr = -0.691 + 10 * np.log10(z.mean()) - 10
    z2 = z[(-0.691 + 10 * np.log10(z)) > lr]
    return -0.691 + 10 * np.log10(z2.mean()) if len(z2) else -100.0


def pico_real(x):
    """Pico real aproximado (sobreamostragem 4×), em dBFS."""
    x = np.asarray(x)
    if x.ndim == 1:
        x = x[:, None]
    m = 0
    for c in range(x.shape[1]):
        m = max(m, np.max(np.abs(signal.resample_poly(x[:, c], 4, 1))))
    return 20 * np.log10(max(m, 1e-12))


def limitador(x, teto_db=-1.5, solta=0.06, olhar=0.003):
    """Limitador com antecipação: ganho suave para o pico não passar do teto."""
    teto = de_db(teto_db)
    a = np.abs(x) if x.ndim == 1 else np.max(np.abs(x), 1)
    k = max(1, n_am(olhar))
    # máximo móvel com antecipação
    from scipy.ndimage import maximum_filter1d, uniform_filter1d
    m = maximum_filter1d(a, size=2 * k + 1)
    g = np.minimum(1.0, teto / np.maximum(m, 1e-12))
    # solta lenta: filtro de mínimo seguido de suavização
    g = -maximum_filter1d(-g, size=n_am(solta) // 4 + 1)
    g = uniform_filter1d(g, size=2 * k + 1)
    g = np.minimum(g, teto / np.maximum(m, 1e-12) * 1.0 + 0 * g)
    return x * (g if x.ndim == 1 else g[:, None])


def normalizar(x, alvo=ALVO_EFEITO, teto=-2.0, max_limite_db=12.0):
    """Leva à loudness alvo com o pico REAL (sobreamostrado) abaixo do teto. Se passar, limita
    (até max_limite_db de redução) e repete; se ainda assim não couber, abaixa tudo."""
    x = np.asarray(x, dtype=np.float64)
    for _ in range(6):
        x = x * de_db(alvo - lufs(x))
        tp = pico_real(x)
        if tp <= teto:
            break
        exc = tp - teto
        if exc > max_limite_db:
            x = x * de_db(-(exc - max_limite_db))
        sp = db(np.max(np.abs(x)))
        x = limitador(x, teto - max(0.0, tp - sp) - 0.3)
    tp = pico_real(x)
    if tp > teto:
        x = x * de_db(teto - tp)
    return x, lufs(x)


def aparar(x, limiar_db=-52, margem=0.005, limiar_ini_db=-40):
    """Tira o silêncio do começo (abaixo de limiar_ini_db do pico) e do fim (abaixo de limiar_db)."""
    a = np.abs(x) if x.ndim == 1 else np.max(np.abs(x), 1)
    lim = np.max(a) * de_db(limiar_db)
    idx = np.where(a > lim)[0]
    if len(idx) == 0:
        return x
    idx0 = np.where(a > np.max(a) * de_db(limiar_ini_db))[0]
    i0 = max(0, idx0[0] - n_am(margem))
    i1 = min(len(x), idx[-1] + n_am(margem * 4))
    return x[i0:i1]


# ---------------------------------------------------------------- gravação

def _ffmpeg(args):
    subprocess.run(["nice", "-n", "15", "ffmpeg", "-hide_banner", "-loglevel", "error", "-y"] + args, check=True)


def escrever_wav(caminho, x):
    from scipy.io import wavfile
    wavfile.write(caminho, SR, np.asarray(x, dtype=np.float32))


def ler_audio(caminho, mono=True, inicio=None, dur=None):
    """Decodifica qualquer áudio (via ffmpeg) para float a 44,1 kHz. Usado para os arquivos de terceiros
    e para conferir os arquivos finais."""
    ch = 1 if mono else 2
    corte = (["-ss", str(inicio)] if inicio is not None else []) + (["-t", str(dur)] if dur is not None else [])
    p = subprocess.run(["nice", "-n", "15", "ffmpeg", "-hide_banner", "-loglevel", "error"] + corte + ["-i", caminho,
                        "-f", "f32le", "-ac", str(ch), "-ar", str(SR), "-"], capture_output=True, check=True)
    y = np.frombuffer(p.stdout, dtype=np.float32).astype(np.float64)
    return y if mono else y.reshape(-1, 2)


def _codificar(wav, destino, fmt, est, alvo, x_len, mono_check=True, fixo=False):
    """Codifica e confere o arquivo decodificado; se a loudness ou o pico real saírem do lugar
    (a codificação mexe um pouco), corrige o ganho e codifica de novo. Guarda todas as tentativas e fica
    com a melhor que respeita o pico real (abaixo de -1,1 dBTP); o pico é regra dura, a loudness tem tolerância."""
    def cod(g):
        af = ["-af", f"volume={g:.3f}dB"] if g else []
        if fmt == "ogg":
            _ffmpeg(["-i", wav] + af + ["-ar", str(SR), "-c:a", "libvorbis", "-q:a", "4" if est else "3", destino])
        else:
            _ffmpeg(["-i", wav] + af + ["-ar", str(SR), "-c:a", "libmp3lame", "-b:a", "160k" if est else "128k", destino])
        y = ler_audio(destino, mono=not est)
        return lufs(y), pico_real(y)
    tent = []
    ganho = 0.0
    for _ in range(6):
        L, tp = cod(ganho)
        tent.append((ganho, L, tp))
        corr = 0.0 if fixo else alvo - L
        if tp + corr > -1.6:
            corr = -1.6 - tp
        if abs(corr) < 0.2 and tp <= -1.15:
            break
        ganho += corr
    boas = [t for t in tent if t[2] <= -1.1]
    if not boas:
        g = min(t[0] for t in tent) - 1.0
        L, tp = cod(g)
        return round(L, 2), round(tp, 2)
    melhor = min(boas, key=lambda t: abs(t[1] - alvo) if not fixo else abs(t[0]))
    if melhor is not tent[-1]:
        L, tp = cod(melhor[0])
    return round(L, 2), round(tp, 2)


def salvar(cat, ident, x, nome, grupo="", laco=False, alvo=ALVO_EFEITO, origem="sintetizado",
           creditos=(), descricao="", extra=None, aparar_silencio=None, fade_ent=0.002, fade_sai=0.02,
           max_limite=12.0, normalizado=False):
    """Normaliza, aplica cortes sem estalo, grava OGG (Vorbis) e MP3 e registra no índice da categoria."""
    x = np.asarray(x, dtype=np.float64)
    if aparar_silencio is None:
        aparar_silencio = not laco
    if aparar_silencio:
        x = aparar(x)
    # tira o DC (rangidos e ruídos graves deixam um pouco); nos laços, em modo circular
    x = filtro_circ(x, lambda v: hp(v, 18)) if laco else hp(x, 18)
    if not laco:
        x = fades(x, fade_ent, fade_sai)
    if normalizado:   # já veio no nível certo (partes de uma música com o ganho do laço): só garante o pico real
        tp = pico_real(x)
        if tp > -2.0:
            x = limitador(x, -2.0 - max(0.0, tp - db(np.max(np.abs(x)))) - 0.3)
    else:
        x, L = normalizar(x, alvo, max_limite_db=max_limite)
    if not laco:
        x = fades(x, 0.0015, min(fade_sai, 0.005))
        # 6 ms de silêncio antes e 5 ms depois: o eco prévio da codificação cai no silêncio, não no ataque
        z = np.zeros((n_am(0.006),) + x.shape[1:])
        x = np.concatenate([z, x, z[: n_am(0.005)]], axis=0)
    pasta = os.path.join(OUT, cat)
    os.makedirs(pasta, exist_ok=True)
    wav = os.path.join(TMP, f"{cat}__{ident}.wav")
    escrever_wav(wav, x)
    est = x.ndim == 2
    base = os.path.join(pasta, ident)
    L_ogg, tp_ogg = _codificar(wav, base + ".ogg", "ogg", est, alvo, len(x), fixo=normalizado)
    L_mp3, tp_mp3 = _codificar(wav, base + ".mp3", "mp3", est, alvo, len(x), fixo=normalizado)
    os.remove(wav)
    item = {"id": ident, "cat": cat, "grupo": grupo, "nome": nome, "arquivo": f"{cat}/{ident}",
            "laco": bool(laco), "dur": round(len(x) / SR, 3), "amostras": int(len(x)), "canais": 2 if est else 1,
            "origem": origem, "creditos": list(creditos), "descricao": descricao,
            "alvo_lufs": alvo, "lufs": L_ogg, "lufs_mp3": L_mp3, "pico_real_dbtp": max(tp_ogg, tp_mp3), "pico_dbfs": round(float(db(np.max(np.abs(x)))), 2)}
    if extra:
        item.update(extra)
    registrar(cat, item)
    return item


def registrar(cat, item):
    p = os.path.join(REG, f"{cat}.json")
    d = json.load(open(p)) if os.path.exists(p) else {}
    d[item["id"]] = item
    json.dump(d, open(p, "w"), indent=1, ensure_ascii=False)


# ---------------------------------------------------------------- notas

NOTAS = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5, "F#": 6, "Gb": 6, "G": 7,
         "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11}


def midi(nome):
    """'C4' → 60."""
    if isinstance(nome, (int, float)):
        return nome
    n = nome[:-1]
    o = int(nome[-1])
    return 12 * (o + 1) + NOTAS[n]


def hz(m):
    return 440.0 * 2 ** ((midi(m) - 69) / 12)


# ---------------------------------------------------------------- terceiros (CC0)

DL = os.path.join(SP, "sons_dl")
TIPOS_OK = {"audio/x-wav", "audio/wav", "audio/ogg", "audio/mpeg", "audio/flac", "audio/x-flac", "audio/vnd.wave"}
# itens recusados na conferência de licença: origem não comprovadamente CC0
RECUSADOS = {
    "gorilla-sounds": "parte dos sons veio do mediacollege.com, cuja licença não é CC0",
    "solo-seagull-sound-effects": "recortes de um vídeo do YouTube de terceiros; não é obra do autor",
    "doorbell-ring": "gravação achada no Wikimedia Commons, licença original não informada",
    "beach-ocean-waves": "trecho de som do Freesound que não deu para conferir (o site bloqueia o acesso daqui)",
    "water-waves": "trecho de som do Freesound que não deu para conferir (o site bloqueia o acesso daqui)",
    "dog-barking-mono": "licença dupla OGA-BY/CC0; preferimos só itens com CC0 puro",
}


def cc0(slug, arquivo, mono=True, inicio=None, dur=None):
    """Lê um arquivo de terceiros já baixado, conferindo licença (só CC0) e tipo real, e registra o crédito."""
    fichas = json.load(open(os.path.join(DL, "_fichas.json")))
    f = fichas[slug]
    if f["licencas"] != ["CC0"] or slug in RECUSADOS:
        raise ValueError(f"{slug}: licença não aceita {f['licencas']} {RECUSADOS.get(slug, '')}")
    caminho = os.path.join(DL, slug, arquivo)
    if not os.path.exists(caminho):   # os WAV grandes ficaram em /dev/shm (disco cheio)
        caminho = os.path.join("/dev/shm/morada_sons", slug, arquivo)
    if not os.path.isfile(caminho) or os.path.islink(caminho):
        raise FileNotFoundError(caminho)
    tipo = subprocess.run(["file", "--brief", "--mime-type", caminho], capture_output=True, text=True).stdout.strip()
    if tipo not in TIPOS_OK:
        raise ValueError(f"{caminho}: tipo real {tipo} não é áudio aceito")
    ident = f"{slug}/{arquivo}"
    p = os.path.join(REG, "_creditos.json")
    d = json.load(open(p)) if os.path.exists(p) else {}
    nome_orig = arquivo.split("/")[-1]
    d[ident] = {"id": ident, "fonte": "OpenGameArt.org", "titulo": f["titulo"], "url": f["url"], "autor": f["autor"],
                "licenca": "CC0 1.0 (domínio público)", "licenca_url": "https://creativecommons.org/publicdomain/zero/1.0/",
                "arquivo_original": nome_orig, "pacote": [a.rsplit("/", 1)[1] for a in f["arquivos"]],
                "tipo_conferido": tipo}
    json.dump(d, open(p, "w"), indent=1, ensure_ascii=False)
    if inicio is not None:
        d[ident].setdefault("trechos_usados", [])
        tr = f"{inicio:.1f}s a {inicio + (dur or 0):.1f}s"
        if tr not in d[ident]["trechos_usados"]:
            d[ident]["trechos_usados"].append(tr)
        json.dump(d, open(p, "w"), indent=1, ensure_ascii=False)
    return ler_audio(caminho, mono, inicio, dur), ident


# ---------------------------------------------------------------- voz (fonte glotal e formantes)

def fonte_glotal(f0, abertura=0.6, inclinacao=1.0, harm_max=80, jitter=0.0, r=None):
    """Fonte harmônica com f0 variável (array): soma de harmônicos com queda ~ 1/k^inclinacao
    (inclinação maior = voz mais suave/soprosa; menor = voz apertada/brava). Limitada abaixo de Nyquist."""
    n = len(f0)
    if jitter > 0:
        r = r or rng(0)
        f0 = f0 * (1 + jitter * curva_lenta(n, r, 40) * 0.5)
    ph = 2 * np.pi * np.cumsum(f0) / SR
    y = np.zeros(n)
    fmax = SR / 2 - 500
    for k in range(1, harm_max + 1):
        lim = (k * f0 < fmax).astype(float)
        if not lim.any():
            break
        # fase do harmônico com pequena defasagem para um pulso glotal assimétrico
        y += lim * np.sin(k * ph - 0.3 * k * abertura) / (k ** inclinacao)
    return y / np.max(np.abs(y) + 1e-9)


def filtro_formantes(x, formantes, larguras, ganhos=None, bloco=128):
    """Banco de ressonadores em paralelo com frequências variáveis no tempo (arrays por amostra).
    formantes/larguras: listas de arrays (ou escalares). O estado de cada filtro é preservado entre blocos."""
    n = len(x)
    y = np.zeros(n)
    ganhos = ganhos or [1.0] * len(formantes)
    for F, B, g in zip(formantes, larguras, ganhos):
        F = np.full(n, F) if np.isscalar(F) else F
        B = np.full(n, B) if np.isscalar(B) else B
        g = np.full(n, g) if np.isscalar(g) else g
        zi = np.zeros(2)
        for i in range(0, n, bloco):
            j = min(i + bloco, n)
            f = float(F[i]); bw = float(B[i])
            rr = np.exp(-np.pi * bw / SR)
            th = 2 * np.pi * min(f, SR / 2 - 200) / SR
            a = [1, -2 * rr * np.cos(th), rr * rr]
            b = [(1 - rr) * np.sqrt(1 - 2 * rr * np.cos(2 * th) + rr * rr)]
            seg, zi = signal.lfilter(b, a, x[i:j], zi=zi)
            y[i:j] += seg * g[i:j]
    return y
