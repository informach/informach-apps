"""Acha, no cache do EdiAula, a transcrição (com tempo por palavra) da voz de uma parte. O gravador transcreve a
voz sozinho ao importá-la, e guarda a transcrição na pasta de cache do arquivo: o sha1 de "caminho|tamanho|
mtimeMs" (src/main/ffmpeg.ts cacheDir), com o caminho como o Windows o escreve.

Pela duração só quando a pasta da voz não tem transcrição (a voz importada de outro lugar): a de duração mais
próxima, e entre iguais a mais nova. Antes era sempre pela duração, a mais nova perto do fim do áudio, e duas
vozes quase do mesmo tamanho se confundiam (Ilha A3P2 e A3P4, 206,5 e 206,8 s: a Parte 2 recebeu a transcrição
da Parte 4, 22/11/2026).

Uso: transcricao.py <perfil do EdiAula> <voz.wav>  ->  imprime o caminho do transcript*.json
"""

import glob
import hashlib
import json
import os
import sys
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
        candidatas.append((abs(words[-1]["end"] - dur), -os.path.getmtime(f), f))
if not candidatas:
    sys.exit(f"Nenhuma transcrição de {dur:.1f} s no cache; importe a voz no gravador (ou transcreva no EdiAula).")
print(min(candidatas)[2].replace("\\", "/"))
