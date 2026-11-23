"""Acha, no cache do EdiAula, a transcrição (com tempo por palavra) da voz de uma parte. O gravador transcreve a
voz sozinho ao importá-la, e guarda a transcrição na pasta de cache do arquivo: o sha1 de "caminho|tamanho|
mtimeMs" (src/main/ffmpeg.ts cacheDir), com o caminho como o Windows o escreve.

Quando a pasta da voz não tem transcrição (a voz foi transcrita noutro caminho, como uma pasta renomeada
depois), entre as transcrições do tamanho do áudio vale a que mais bate com as falas da parte (o *Falas.txt
ao lado da voz); sem ele, a de duração mais próxima, e entre iguais a mais nova. Antes era sempre pela
duração, e vozes do mesmo tamanho se confundiam: a Ilha A3P2 recebeu a transcrição da Parte 4 (206,5 e
206,8 s), e a A3P3 (46,6 s), cuja transcrição ficou noutra chave, a de uma aula sobre o limite da tela
(22/11/2026).

Uso: transcricao.py <perfil do EdiAula> <voz.wav>  ->  imprime o caminho do transcript*.json
"""

import glob
import hashlib
import json
import os
import re
import sys
import unicodedata
import wave

perfil, voz = sys.argv[1], sys.argv[2]


def pasta_do_cache(caminho):
    st = os.stat(caminho)
    ms = st.st_mtime_ns / 1e6
    # O número como o JavaScript o escreve: sem ".0" quando é inteiro.
    texto = str(int(ms)) if ms == int(ms) else repr(ms)
    janelas = os.path.abspath(caminho).replace("/", os.sep)
    chave = hashlib.sha1(f"{janelas}|{st.st_size}|{texto}".encode()).hexdigest()[:16]
    return os.path.join(perfil, "cache", chave)


propria = sorted(glob.glob(os.path.join(pasta_do_cache(voz), "transcript*.json")), key=os.path.getmtime, reverse=True)
if propria:
    print(propria[0].replace("\\", "/"))
    sys.exit(0)

def palavras(texto):
    sem_acento = unicodedata.normalize("NFKD", texto.lower()).encode("ascii", "ignore").decode()
    return re.findall(r"[a-z0-9]+", sem_acento)


falas = sorted(glob.glob(os.path.join(os.path.dirname(os.path.abspath(voz)), "*Falas.txt")))
esperadas = set(palavras(open(falas[0], encoding="utf8").read())) if falas else set()


def parecida(words):
    """A parte das palavras da transcrição que está nas falas (0 a 1); 0 sem o arquivo de falas."""
    ditas = palavras(" ".join(w["text"] for w in words))
    return sum(1 for p in ditas if p in esperadas) / len(ditas) if esperadas and ditas else 0.0


with wave.open(voz) as w:
    dur = w.getnframes() / w.getframerate()
candidatas = []
for f in glob.glob(os.path.join(perfil, "cache", "*", "transcript*.json")):
    try:
        words = json.load(open(f, encoding="utf8")).get("words") or []
    except (OSError, ValueError):
        continue
    # A voz pode acabar com alguns segundos de silêncio (o ElevenLabs deixa até uns 3 s); a
    # transcrição nunca passa do fim do áudio.
    if words and -4.0 < words[-1]["end"] - dur < 2.0:
        candidatas.append((-round(parecida(words), 2), abs(words[-1]["end"] - dur), -os.path.getmtime(f), f))
if not candidatas:
    sys.exit(f"Nenhuma transcrição de {dur:.1f} s no cache; importe a voz no gravador (ou transcreva no EdiAula).")
melhor = min(candidatas)
if esperadas and -melhor[0] < 0.8:
    print(f"aviso: a transcrição mais parecida com as falas bate só {-melhor[0]:.0%}", file=sys.stderr)
print(melhor[3].replace("\\", "/"))
