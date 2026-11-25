"""Onde o personagem (Debinha, Dedé) entra na linha do tempo da edição de uma parte.

Uso: python -X utf8 personagem.py <curso> <aula> <parte>
  -> uma linha por clipe de personagem da parte: "<arquivo>@<at>@<ini>@<fim>", o formato do editar-parte.sh
     (at = onde o clipe começa antes do corte, como o "at" do add_clip; [ini, fim] = o trecho que fica).

A fala vem do "Parte N - Falas.txt" (a linha marcada com o nome do personagem); o segundo em que a professora a
diz vem da transcrição da voz, já com o atraso da narração na gravação (tempos_da_voz.py). No clipe do
personagem, a fala vai do fim do silêncio do começo ao começo do silêncio do fim. A fala dele mais longa que a
da professora começa logo depois da última palavra anterior, para não calar a professora na frase seguinte.
"""

import glob
import os
import re
import shutil
import subprocess
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
sys.path.insert(0, os.path.dirname(AQUI))
from config import parte  # noqa: E402
from tempos_da_voz import Voz  # noqa: E402

curso, aula, n = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
cfg = parte(curso, aula, n)
FF = shutil.which("ffmpeg") or sys.exit("ffmpeg precisa estar no PATH")
falas_txt = glob.glob(os.path.join(cfg["pasta"], f"Parte {n} - Falas.txt"))
linhas = open(falas_txt[0], encoding="utf8").read().splitlines() if falas_txt else []
voz = None
for mp4 in cfg["personagens"]:
    nome = re.match(rf"Parte {n} - (.+) \d+\.mp4$", os.path.basename(mp4)).group(1)
    falas = [ln.split(": ", 1)[1] for ln in linhas if ln.startswith(f"{nome} (")]
    if len(falas) != 1:
        sys.exit(f"{os.path.basename(mp4)}: esperava uma fala de {nome} no Falas.txt e achei {len(falas)}")
    fala = falas[0]
    wav = mp4[:-4] + ".wav"
    r = subprocess.run([FF, "-hide_banner", "-i", wav, "-af", "silencedetect=noise=-38dB:d=0.12", "-f", "null", "-"],
                       capture_output=True, text=True).stderr
    h, m, s = re.search(r"Duration: (\d+):(\d+):([\d.]+)", r).groups()
    dur = int(h) * 3600 + int(m) * 60 + float(s)
    inicios = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", r)]
    fins = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", r)]
    s0 = fins[0] if inicios and inicios[0] < 0.05 and fins else 0.0
    s1 = next((x for x in inicios if x > s0 + 0.3), dur)
    voz = voz or Voz.da_parte(curso, aula, n)
    final = " ".join(fala.split()[-3:])
    t, fim_prof = voz.trecho(fala, final)
    seguinte = next((p[1] for p in voz.palavras if p[1] > fim_prof + 0.01), fim_prof + 10)
    anterior = max((p[2] for p in voz.palavras if p[2] < t - 0.01), default=0.0)
    dito = s1 - s0
    inicio = t if t + dito + 0.15 <= seguinte - 0.05 else max(anterior + 0.05, seguinte - 0.1 - dito)
    at = inicio - s0
    ini = max(at, inicio - 0.05)
    fim = min(at + dur, inicio + dito + 0.15, seguinte - 0.05)
    print(f"{nome}: professora {t:.2f}-{fim_prof:.2f}, {nome} {ini:.2f}-{fim:.2f} (fala {s0:.2f}-{s1:.2f} no clipe),"
          f" palavra anterior até {anterior:.2f}, próxima {seguinte:.2f}", file=sys.stderr)
    if inicio + dito > fim:
        print(f"AVISO: a fala de {nome} não cabe; o fim fica cortado em {fim:.2f}", file=sys.stderr)
    print(f"{os.path.basename(mp4)}@{at:.2f}@{ini:.2f}@{fim:.2f}")
