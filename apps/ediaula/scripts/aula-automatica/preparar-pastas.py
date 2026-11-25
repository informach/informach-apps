"""Monta as pastas das partes de uma aula a partir do que chegou do ElevenLabs e do HeyGen.

Uso: python -X utf8 preparar-pastas.py <curso> <aula> [--conferir] [--sem-transcricao]
  --conferir         só mostra o que casou e o que a transcrição achou; não escreve nada
  --sem-transcricao  pula a conferência da voz contra a fala do roteiro (mais rápido)

Lê do config.json o roteiro da aula, a pasta de material do curso e o prefixo dos vídeos do HeyGen
("prefixoHeyGen", ou o "cursoEdiAula"). Os originais ficam na pasta do curso, ou na "Aula 0N" dela,
sem alteração:
  ElevenLabs_<data>_<voz>.mp3               as vozes da professora e do personagem, em qualquer ordem
  <prefixo>Aula0NParte0M_<resolução>.mp4    a apresentadora de cada parte com vídeo
  <prefixo>Aula0N<Personagem>_<res>.mp4     o personagem com todas as falas dele na aula (Debinha, Dede)

O que faz, nesta ordem:
  1. Lê as partes do roteiro. Só as que têm "Fala para ElevenLabs" têm vídeo; o HeyGen numera só essas
     (na Ilha A3, a Parte 6 do roteiro é o HeyGen 5, porque a Parte 5 não tem vídeo).
  2. Casa cada vídeo com a voz de mesma duração (o HeyGen é feito da voz: a diferença fica em
     centésimos). Duas vozes com a mesma duração, ou nenhuma, param o script.
  3. Transcreve cada voz com o motor do perfil do condutor e compara com a fala do roteiro. Uma voz
     gerada antes de uma mudança no texto aparece aqui, com os trechos diferentes.
  4. Corta o vídeo do personagem nos silêncios entre as falas, pelo meio do silêncio, uma fala por parte
     na ordem do roteiro.
  5. Cria <material>/Aula 0N/Parte M - <título>/ com:
       Parte M - Áudio.wav       a voz em WAV 48 kHz estéreo
       Parte M - HeyGen.mp4      a apresentadora sem recompressão, só sem o som
       Parte M - Debinha 1.mp4   o trecho do personagem, em 4K, com som, e o .wav dele (quando a parte tem)
       Parte M - Roteiro.md      a parte do roteiro
       Parte M - Falas.txt       as falas sem as direções de voz, com as do personagem marcadas
       origem dos arquivos.txt   de onde veio cada arquivo
     Mídia que já existe na pasta fica como está; os textos são escritos de novo.
"""

import difflib
import glob
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unicodedata

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
from config import _caminho, carregar  # noqa: E402

args = [a for a in sys.argv[1:] if not a.startswith("--")]
if len(args) != 2:
    sys.exit(__doc__)
CURSO, AULA = args[0], int(args[1])
CONFERIR = "--conferir" in sys.argv
TRANSCREVER = "--sem-transcricao" not in sys.argv
TOLERANCIA = 0.15  # segundos entre a voz e o vídeo do HeyGen

cfg = carregar()
c = cfg["cursos"][CURSO]
a = c["aulas"][str(AULA)]
sz = _caminho(cfg["sistemaZero"])
roteiro_rel = a["roteiro"]
roteiro_path = _caminho(a.get("roteiroLocal") or os.path.join(sz, roteiro_rel))
material = _caminho(c["material"])
prefixo = c.get("prefixoHeyGen") or c["cursoEdiAula"]
nome_curso = c.get("subtituloCapa") or c["nome"]
perfil = _caminho(os.environ.get("AULA_PERFIL_EDIAULA") or "~/EdiAula-teste/user-data")


def achar_ffmpeg():
    achados = [shutil.which(nome) for nome in ("ffmpeg", "ffprobe")]
    if not all(achados):
        sys.exit("ffmpeg e ffprobe precisam estar no PATH")
    return achados


FF, FP = achar_ffmpeg()


def ff(*a):
    subprocess.run([FF, "-v", "error", "-y", *a], check=True)


def duracao(arq):
    r = subprocess.run([FP, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", arq],
                       capture_output=True, text=True, check=True)
    return float(r.stdout.strip())


def ascii_(s):
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()


def palavras(texto):
    return re.findall(r"[a-z0-9]+", ascii_(texto.lower()))


def limpa(paragrafo):
    """A fala sem as direções de voz ([curious], [long pause])."""
    return re.sub(r"\s+", " ", re.sub(r"\[[^\]]+\]", "", paragrafo)).strip()


NUMEROS = dict(enumerate("zero um dois tres quatro cinco seis sete oito nove dez".split()))


def juntas(ws):
    """As palavras coladas, com os números por extenso, para comparar sem ligar para espaços."""
    return "".join(NUMEROS.get(int(w), w) if w.isdigit() and int(w) <= 10 else w for w in ws)


fmt = lambda s: f"{s:.2f}".rstrip("0").rstrip(".").replace(".", ",")

# ── 1. O roteiro ──
txt = open(roteiro_path, encoding="utf8").read().replace("\r\n", "\n")
blocos = re.split(r"(?m)^(?=## )", txt)
nota = blocos[0].split("\n", 1)[1].strip()
partes = []
for sec in blocos[1:]:
    m = re.match(r"## Parte (\d+)\. (.+)", sec)
    if not m:
        continue
    corpo = sec.split("\n", 1)[1].strip()
    f = re.search(r"\*\*Fala para ElevenLabs:\*\*\s*\n```text\n(.*?)\n```", corpo, re.S)
    # As falas do personagem: a coluna "Fala exata substituída" das tabelas de substituição.
    pers = [(ln.split("|")[2].strip(), ln.split("|")[5].strip())
            for ln in corpo.splitlines() if re.match(r"\| video-\S+-K\d+ \| [^|]+\|", ln)]
    partes.append({"n": int(m.group(1)), "titulo": m.group(2).strip(), "corpo": corpo,
                   "fala": f.group(1) if f else None, "pers": pers})
com_video = [p for p in partes if p["fala"]]
nomes_pers = sorted({nome for p in partes for nome, _ in p["pers"]})
if len(nomes_pers) > 1:
    sys.exit(f"Mais de um personagem na aula ({nomes_pers}): o script corta um só vídeo de personagem.")
PERS = nomes_pers[0] if nomes_pers else None
falas_pers = [(p["n"], fala) for p in partes for _, fala in p["pers"]]

# ── 2. Os originais e a duração de cada um ──
pasta_aula = os.path.join(material, f"Aula {AULA:02d}")
origens = [material, pasta_aula]
mp3s = sorted({os.path.normpath(x) for d in origens for x in glob.glob(os.path.join(d, "ElevenLabs_*.mp3"))})
if not mp3s:
    sys.exit(f"Nenhuma voz do ElevenLabs em {material} nem em {pasta_aula}")
dur_mp3 = {x: duracao(x) for x in mp3s}


def video(sufixo):
    achados = sorted({os.path.normpath(x) for d in origens
                      for x in glob.glob(os.path.join(d, f"{prefixo}Aula{AULA:02d}{sufixo}_*.mp4"))})
    return achados[0] if achados else None


def voz_do_video(vid):
    d = duracao(vid)
    cand = [x for x, dx in dur_mp3.items() if abs(dx - d) < TOLERANCIA]
    if len(cand) != 1:
        lista = "\n".join(f"  {fmt(dx)} s  {os.path.basename(x)}" for x, dx in sorted(dur_mp3.items(), key=lambda i: i[1]))
        sys.exit(f"{os.path.basename(vid)} ({fmt(d)} s) casou com {len(cand)} vozes; as vozes que há:\n{lista}")
    return cand[0], d


plano = []
for k, p in enumerate(com_video, 1):
    vid = video(f"Parte{k:02d}")
    if not vid:
        sys.exit(f"Falta o vídeo do HeyGen da Parte {p['n']}: {prefixo}Aula{AULA:02d}Parte{k:02d}_<resolução>.mp4")
    voz, d = voz_do_video(vid)
    plano.append({**p, "heygen": vid, "voz": voz, "dur": d})
usadas = [x["voz"] for x in plano]
if len(set(usadas)) != len(usadas):
    sys.exit("Duas partes casaram com a mesma voz; confira as durações.")
sobra = len(com_video) and video(f"Parte{len(com_video) + 1:02d}")
if sobra:
    sys.exit(f"Há um vídeo a mais ({os.path.basename(sobra)}) do que partes com fala no roteiro.")

vid_pers = voz_pers = None
if PERS:
    vid_pers = video(ascii_(PERS))
    if not vid_pers:
        sys.exit(f"Falta o vídeo do personagem: {prefixo}Aula{AULA:02d}{ascii_(PERS)}_<resolução>.mp4")
    voz_pers, _ = voz_do_video(vid_pers)

print(f"{nome_curso} · Aula {AULA} · roteiro {os.path.basename(roteiro_path)}")
for x in plano:
    print(f"  Parte {x['n']}: {os.path.basename(x['heygen'])} ({fmt(x['dur'])} s) <- {os.path.basename(x['voz'])}")
if PERS:
    print(f"  {PERS}: {os.path.basename(vid_pers)} <- {os.path.basename(voz_pers)}, {len(falas_pers)} falas")
for p in partes:
    if not p["fala"]:
        print(f"  Parte {p['n']}: sem vídeo no roteiro ({p['titulo']})")


# ── 3. A voz diz a fala do roteiro? ──
def motor():
    w = os.path.join(perfil, "whisper")
    try:
        modelo = json.load(open(os.path.join(w, "settings.json"), encoding="utf8"))["model"]
    except (OSError, KeyError, ValueError):
        return None, None
    cli = sorted(glob.glob(os.path.join(w, "bin", "*", "Release", "whisper-cli.exe"))
                 + glob.glob(os.path.join(w, "bin", "*", "whisper-cli*")))
    return (cli[0], modelo) if cli and os.path.exists(modelo) else (None, None)


def conferir_voz(mp3, esperado, rotulo, tmp):
    cli, modelo = motor()
    if not cli:
        print(f"  {rotulo}: sem o motor de transcrição em {perfil}/whisper; conferência pulada")
        return True
    wav = os.path.join(tmp, "voz.wav")
    ff("-i", mp3, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wav)
    saida = os.path.join(tmp, "voz")
    subprocess.run([cli, "-m", modelo, "-l", "pt", "-f", wav, "-otxt", "-of", saida, "-np"],
                   capture_output=True, check=True)
    ouvido = palavras(open(saida + ".txt", encoding="utf8").read())
    escrito = palavras(esperado)
    sm = difflib.SequenceMatcher(None, escrito, ouvido, autojunk=False)
    nota_ = sm.ratio()
    difs = []
    ops = sm.get_opcodes()
    for k, (op, i1, i2, j1, j2) in enumerate(ops):
        e, o = escrito[i1:i2], ouvido[j1:j2]
        je, jo = juntas(e), juntas(o)
        if op == "equal" or (je and jo and difflib.SequenceMatcher(None, je, jo).ratio() >= 0.85):
            continue  # "moedasDoCaminho" dito (e transcrito "moedas do camino"), "0" dito "zero"
        if op == "insert" and k in (0, len(ops) - 1):
            continue  # frase que a transcrição inventa no silêncio do começo ou do fim
        difs.append((len(e), len(o), " ".join(e), " ".join(o)))
    # Trecho de mais de duas palavras é texto diferente; uma ou duas costumam ser da transcrição.
    grandes = [d for d in difs if max(d[0], d[1]) > 2]
    ok = nota_ >= 0.9 and not grandes
    print(f"  {rotulo}: {nota_:.0%} das palavras batem" + ("" if ok else " ← CONFERIR"))
    # As pequenas só no --conferir: quase sempre são da transcrição ("se" escrito "c").
    for _, _, e, o in (grandes + ([d for d in difs if d not in grandes] if CONFERIR else []))[:8]:
        print(f"      roteiro: «{e}»  |  voz: «{o}»")
    return ok


tudo_ok = True
if TRANSCREVER:
    print("Conferência das vozes com o roteiro:")
    with tempfile.TemporaryDirectory() as tmp:
        for x in plano:
            fala = " ".join(limpa(par) for par in x["fala"].split("\n\n"))
            tudo_ok &= conferir_voz(x["voz"], fala, f"Parte {x['n']}", tmp)
        if PERS:
            tudo_ok &= conferir_voz(voz_pers, " ".join(f for _, f in falas_pers), PERS, tmp)

# ── 4. Os cortes do personagem, no meio dos silêncios entre as falas ──
cortes = {}
if PERS:
    d = duracao(vid_pers)
    r = subprocess.run([FF, "-hide_banner", "-i", vid_pers, "-vn", "-af", "silencedetect=noise=-38dB:d=0.25",
                        "-f", "null", "-"], capture_output=True, text=True).stderr
    ini = [float(v) for v in re.findall(r"silence_start: ([\d.]+)", r)]
    fim = [float(v) for v in re.findall(r"silence_end: ([\d.]+)", r)]
    meio = [(e - s, (s + e) / 2) for s, e in zip(ini, fim) if s > 0.05 and e < d - 0.05]
    precisa = len(falas_pers) - 1
    if len(meio) < precisa:
        sys.exit(f"O vídeo de {PERS} tem {len(meio)} silêncios entre falas; precisava de {precisa}.")
    pontos = sorted(t for _, t in sorted(meio, reverse=True)[:precisa])
    limites = [0.0, *pontos, None]
    for i, (n, fala) in enumerate(falas_pers):
        if n in cortes:
            sys.exit(f"A Parte {n} tem duas falas de {PERS}; o script põe uma por parte.")
        cortes[n] = (limites[i], limites[i + 1], fala)
    print(f"Cortes de {PERS} (s): " + ", ".join(
        f"Parte {n} de {fmt(s)} " + (f"a {fmt(e)}" if e else "até o fim") for n, (s, e, _) in cortes.items()))

if CONFERIR:
    print("\n--conferir: nada foi escrito." + ("" if tudo_ok else " Há vozes para conferir."))
    sys.exit(0 if tudo_ok else 1)
if not tudo_ok:
    sys.exit("\nUma voz não bate com o roteiro: gere a voz de novo, ou rode com --sem-transcricao se a diferença "
             "for só da transcrição.")


# ── 5. As pastas ──
def git(*a):
    return subprocess.run(["git", "-C", sz, *a], capture_output=True, text=True).stdout.strip()


if a.get("roteiroLocal"):
    origem_roteiro = f"a cópia local {roteiro_path}"
else:
    igual = subprocess.run(["git", "-C", sz, "diff", "--quiet", "origin/staging", "--", roteiro_rel]).returncode == 0
    sha = git("log", "-1", "--format=%h", "origin/staging" if igual else "HEAD", "--", roteiro_rel)
    origem_roteiro = (f"{roteiro_rel}, no Sistema Zero, staging {sha}" if igual
                      else f"{roteiro_rel}, no Sistema Zero, staging local {sha} (diferente da origin/staging)")

os.makedirs(pasta_aula, exist_ok=True)
artigo = "da" if PERS and PERS.endswith("a") else "do"
for x in plano:
    n, titulo = x["n"], x["titulo"]
    pasta = os.path.join(pasta_aula, f"Parte {n} - " + re.sub(r'[<>:"/\\|?*]', "", titulo).strip())
    os.makedirs(pasta, exist_ok=True)
    pre = os.path.join(pasta, f"Parte {n} - ")
    feito = []
    if not os.path.exists(pre + "Áudio.wav"):
        ff("-i", x["voz"], "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", pre + "Áudio.wav")
        feito.append("Áudio.wav")
    if not os.path.exists(pre + "HeyGen.mp4"):
        ff("-i", x["heygen"], "-map", "0:v:0", "-c", "copy", "-an", pre + "HeyGen.mp4")
        feito.append("HeyGen.mp4")
    corte = cortes.get(n)
    if corte and not os.path.exists(pre + f"{PERS} 1.mp4"):
        s, e, _ = corte
        janela = ["-ss", f"{s:.2f}"] + (["-to", f"{e:.2f}"] if e else [])
        # O corte obriga a recodificar: qualidade alta, mesma resolução, com som.
        ff(*janela, "-i", vid_pers, "-c:v", "libx264", "-preset", "slow", "-crf", "12", "-pix_fmt", "yuv420p",
           "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", pre + f"{PERS} 1.mp4")
        ff("-i", pre + f"{PERS} 1.mp4", "-vn", "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", pre + f"{PERS} 1.wav")
        feito.append(f"{PERS} 1")

    open(pre + "Roteiro.md", "w", encoding="utf8", newline="\n").write(
        f"# {nome_curso} · Aula {AULA} · Parte {n}. {titulo}\n\n{nota}\n\n{x['corpo']}\n")
    kids = {f for _, f in x["pers"]}
    linhas = []
    for par in x["fala"].split("\n\n"):
        lp = limpa(par)
        if lp:
            quem = f"{PERS} (só na edição kids; no adulto, a professora)" if lp in kids else "Professora"
            linhas.append(f"{quem}: {lp}")
    if len(kids) != sum(ln.startswith(f"{PERS} (") for ln in linhas if PERS):
        sys.exit(f"Parte {n}: a fala de {PERS} da tabela não é um parágrafo inteiro da fala do roteiro.")
    cabeca = f"{nome_curso} · Aula {AULA} · Parte {n}. {titulo}\n\nFalas da parte, na ordem em que estão no áudio."
    if kids:
        cabeca += (f" A professora grava todas; na edição kids, a voz e o vídeo {artigo} {PERS} entram no lugar "
                   "das frases marcadas, com a professora calada nesse trecho.")
    open(pre + "Falas.txt", "w", encoding="utf8", newline="\n").write(cabeca + "\n\n" + "\n\n".join(linhas) + "\n")

    res = "4K (2160 × 3840)" if "_2160p" in x["heygen"] else "na resolução exportada"
    origem = [
        f"Origem dos arquivos · {nome_curso} · Aula {AULA} · Parte {n}. {titulo}",
        "",
        f"Parte {n} - Áudio.wav: {os.path.basename(x['voz'])}, convertido para WAV 48 kHz estéreo."
        + (" A transcrição confere com a fala do roteiro." if TRANSCREVER else ""),
        f"Parte {n} - HeyGen.mp4: {os.path.basename(x['heygen'])} em {res}: o mesmo vídeo, sem recompressão, "
        "só sem o som. A voz entra pelo Áudio.wav.",
    ]
    if corte:
        s, e, _ = corte
        trecho = f"de {fmt(s)} a {fmt(e)} s" if e else f"de {fmt(s)} s até o fim"
        origem.append(
            f"Parte {n} - {PERS} 1.mp4 e .wav: {os.path.basename(vid_pers)}, trecho {trecho} (o vídeo {artigo} "
            f"{PERS} tem as {len(falas_pers)} falas da aula, cortadas no meio do silêncio), com som, recodificado "
            f"em qualidade alta por causa do corte. Voz gerada com {os.path.basename(voz_pers)}.")
    origem += [
        f"Parte {n} - Roteiro.md: a Parte {n} de {origem_roteiro}.",
        f"Parte {n} - Falas.txt: as falas desse roteiro, sem as direções de voz"
        + (f", com as {artigo} {PERS} marcadas." if kids else "."),
        "",
        f"Os originais continuam em {material}, sem alteração.",
    ]
    open(os.path.join(pasta, "origem dos arquivos.txt"), "w", encoding="utf8", newline="\n").write("\n".join(origem) + "\n")
    print(f"{os.path.basename(pasta)}: " + (", ".join(feito) if feito else "mídia já estava") + "; textos escritos")
