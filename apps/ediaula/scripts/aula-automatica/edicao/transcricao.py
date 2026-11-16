"""Acha, no cache do EdiAula, a transcrição (com tempo por palavra) da voz de uma parte: a mais nova cuja
última palavra termina perto do fim do áudio. O gravador transcreve a voz sozinho ao importá-la.

Uso: transcricao.py <perfil do EdiAula> <voz.wav>  ->  imprime o caminho do transcript*.json
"""

import glob
import json
import os
import sys
import wave

perfil, voz = sys.argv[1], sys.argv[2]
with wave.open(voz) as w:
    dur = w.getnframes() / w.getframerate()
melhor = None
for f in sorted(glob.glob(os.path.join(perfil, "cache", "*", "transcript*.json")), key=os.path.getmtime, reverse=True):
    try:
        words = json.load(open(f, encoding="utf8")).get("words") or []
    except (OSError, ValueError):
        continue
    if words and abs(words[-1]["end"] - dur) < 2.0:
        melhor = f
        break
if not melhor:
    sys.exit(f"Nenhuma transcrição de {dur:.1f} s no cache; importe a voz no gravador (ou transcreva no EdiAula).")
print(melhor.replace("\\", "/"))
