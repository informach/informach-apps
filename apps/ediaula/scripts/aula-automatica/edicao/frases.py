"""As frases da voz de uma parte com o segundo delas na linha do tempo da edição, para marcar os trechos das
animações (`montar`) e o lugar dos personagens.

A transcrição dá o segundo no Áudio.wav. Na edição, a narração entra no segundo em que a voz começou na
gravação (`narrationOffset` do guided-run.json: 0 quando a parte abre falando, 0,3 a 0,5 s quando abre com
uma ação, como expandir o Estúdio). Os trechos tirados direto da transcrição ficavam esse tanto adiantados
(Ilha do Farol, 22/11/2026). Antes de gravar não há atraso conhecido: as frases saem no segundo da voz.

Uso: frases.py <transcript.json> [<pasta da gravação>]
"""

import json
import os
import re
import sys

transcricao = sys.argv[1]
gravacao = sys.argv[2] if len(sys.argv) > 2 else ""
words = json.load(open(transcricao, encoding="utf8"))["words"]

atraso = None
run = os.path.join(gravacao, "guided-run.json") if gravacao else ""
if run and os.path.exists(run):
    atraso = float(json.load(open(run, encoding="utf8")).get("narrationOffset") or 0)

frases, atual = [], []
for w in words:
    atual.append(w)
    if re.search(r"[.?!]\"?$", w["text"].strip()):
        frases.append(atual)
        atual = []
if atual:
    frases.append(atual)

if atraso is None:
    print("Sem gravação: segundos da voz. Depois de gravar, rode de novo para ter os da linha do tempo.")
    atraso = 0.0
else:
    print(f"A narração começa em {atraso:.2f} s na linha do tempo: os segundos abaixo já somam esse atraso.")
for f in frases:
    texto = " ".join(x["text"].strip() for x in f)
    print(f"{f[0]['start'] + atraso:7.2f} a {f[-1]['end'] + atraso:7.2f}  {texto}")
