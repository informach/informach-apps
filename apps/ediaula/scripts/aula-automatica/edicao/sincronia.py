"""Conferência da sincronia de uma tomada: em que palavra da voz caiu cada gesto, e o que o jogo mostrava logo
depois de cada gesto no jogo.

Uso: python -X utf8 sincronia.py <curso> <aula> <parte> [--tolerancia 0.15]
Saída, em <parte>/edicao/:
  sincronia.md        uma linha por etapa: o gesto, a palavra em que o plano o pôs, a palavra em que ele
                      aconteceu de fato e o atraso; "ATRASADO" ou "ADIANTADO" acima da tolerância
  sincronia-jogo.jpg  um quadro da gravação logo depois de cada gesto no jogo (tocar, apontar e segurar no
                      jogo ou na prévia), com a fala daquele instante, para conferir se o jogo fez o que a fala
                      diz (o esconderijo sumiu, o Achados mudou, o personagem pegou o regador antes da flor)
Sai com 1 quando algum gesto passou da tolerância.

Por que: a Helena viu a mão chegar ao jogo fora da fala (Jardim A2, 23/11/2026: "pega o regador e depois vai
na flor", e o personagem foi direto para a flor). O plano pode estar certo e a página atrasar o gesto, ou o
gesto cair na hora e o jogo não fazer o que a fala diz (segurar a seta por um tempo estimado). A tabela pega o
primeiro caso; a folha de quadros, o segundo.

Tempos: os do guided-run.json. As etapas (`start`, `act`, `end`) estão em segundos da linha do tempo da edição,
e as ações (`actions[].t`) em segundos do vídeo, que passam para a linha do tempo pelos trechos acelerados
(`lapses`, como `alignedAt` de src/shared/guidedLapse.ts). As palavras vêm da transcrição da voz, já com o
atraso da narração (tempos_da_voz.Voz).
"""

import json
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

args = [a for a in sys.argv[1:] if not a.startswith("--")]
curso, aula, n = args[0], int(args[1]), int(args[2])
TOL = float(sys.argv[sys.argv.index("--tolerancia") + 1]) if "--tolerancia" in sys.argv else 0.15
cfg = parte(curso, aula, n)
ed = cfg["edicao"]
gravacao = open(os.path.join(ed, "gravacao.txt"), encoding="utf8").read().strip()
run = json.load(open(os.path.join(gravacao, "guided-run.json"), encoding="utf8"))
voz = Voz.da_parte(curso, aula, n)

lapses = sorted((l for l in run.get("lapses", []) if l["to"] > l["from"] and l["narration"] > 0), key=lambda l: l["from"])


def linha_do_tempo(v):
    """Segundo da linha do tempo de um segundo do vídeo (alignedAt)."""
    desvio = 0.0
    for l in lapses:
        if v <= l["from"]:
            break
        dur = l["to"] - l["from"]
        if v < l["to"]:
            return l["from"] - desvio + (v - l["from"]) * l["narration"] / dur
        desvio += dur - l["narration"]
    return v - desvio


def em_volta(t, antes=3, depois=2):
    """As palavras ditas em volta do segundo t, com a do instante entre colchetes."""
    ps = voz.palavras
    if not ps:
        return ""
    i = min(range(len(ps)), key=lambda k: 0 if ps[k][1] <= t <= ps[k][2] else min(abs(ps[k][1] - t), abs(ps[k][2] - t)))
    dentro = ps[i][1] - 0.05 <= t <= ps[i][2] + 0.05
    trecho = [p[0] for p in ps[max(0, i - antes):i]] + [f"[{ps[i][0]}]" if dentro else f"({ps[i][0]})"]
    return " ".join(trecho + [p[0] for p in ps[i + 1:i + 1 + depois]])


# Os gestos que não têm ação registrada (apontar, mostrar) agem no fim da chegada da mão: vale o `finished`
# da etapa no vídeo. Os outros, a primeira ação (o clique, o começo da tecla, o começo do arrasto).
acoes = {}
for a in run.get("actions", []):
    acoes.setdefault(a["step"], []).append(a)

JOGO = re.compile(r"^(?!(abrir )?categoria).*(prévia|jogo|tecla|arbusto|seta)", re.I)
linhas, ruins, quadros = [], [], []
for s in run["steps"]:
    plano = s.get("act")
    if plano is None or s.get("status") not in (None, "done"):
        linhas.append(f"| {s['index'] + 1} | {s['speech']} | | | não feita ({s.get('status')}) |")
        ruins.append(s["index"])
        continue
    A = acoes.get(s["index"], [])
    # A rolagem da lista (wheel) é o preparo, que começa com a frase; o gesto que cai na palavra é a primeira ação
    # depois dela (o clique na opção, Cadê A1P4 "escolhido"). As ações seguintes do mesmo gesto (o clique fora do
    # bloco depois de trocar um campo, o Enviar da confirmação) vêm depois, com as palavras delas.
    decide = [a for a in A if a["kind"] != "wheel"] or A
    if A:
        real = linha_do_tempo(decide[0]["t"])
    elif s.get("finished") is not None:
        # Sem ação registrada (apontar): a etapa acaba a pausa depois de a mão chegar (`end` − `act` no plano).
        real = linha_do_tempo(s["finished"]) - (s["end"] - plano)
    else:
        real = None
    if real is None:
        linhas.append(f"| {s['index'] + 1} | {s['speech']} | {plano:.2f} | | sem registro |")
        continue
    d = real - plano
    # "apontar" sem ação registrada termina quando a mão para: chegar um pouco antes da palavra é o certo.
    so_aponta = not A
    # Arrastar a área até um bloco aparecer é preparo: quando precisa de mais de um arrasto, o primeiro começa com
    # a frase ("Encontre a área Enquanto estiver rodando, arrastando um espaço vazio", Cadê A2P4). Vale não sair
    # antes do começo da frase da etapa.
    preparo = bool(re.match(r"(arrastar até|mostrar blocos)", s["speech"])) and len(A) > 1 and real >= s["start"] - TOL
    marca = "ok"
    if plano < 1.0 and not JOGO.search(s["speech"]):
        # O preparo da abertura ("A parte começa com o Estúdio expandido") não tem palavra: o gesto seguinte é
        # que mostra se ele atrasou a parte.
        marca = "abertura"
    elif d > TOL:
        marca = "ATRASADO"
    elif d < -TOL and not so_aponta and not preparo:
        marca = "ADIANTADO"
    elif d < -TOL and preparo:
        marca = "preparo, com a frase"
    if marca not in ("ok", "abertura", "preparo, com a frase"):
        ruins.append(s["index"])
    linhas.append(f"| {s['index'] + 1} | {s['speech']} | {plano:.2f} · {em_volta(plano)} | {real:.2f} · {em_volta(real)} "
                  f"| {d:+.2f} s {marca} |")
    if JOGO.search(s["speech"]):
        fim = A[-1]["until"] if A else s.get("finished")
        # Logo depois do gesto: o tempo de o jogo responder (o esconderijo some, o número muda).
        quadros.append((fim + 0.6, s, real))

titulo = f"{cfg['nome']} · sincronia da tomada"
saida = [f"# {titulo}", "", f"Gravação: `{gravacao}`", "",
         f"Tolerância: {TOL:.2f} s. Atraso = segundo em que o gesto aconteceu menos o segundo em que o plano o pôs "
         "(linha do tempo da edição). Entre colchetes, a palavra dita naquele instante.", "",
         "| Etapa | Gesto | Plano | Aconteceu | Atraso |", "| --- | --- | --- | --- | --- |", *linhas, ""]
saida.append(f"**{len(ruins)} etapa(s) fora da tolerância.**" if ruins else "**Todas as etapas na palavra.**")

FF = shutil.which("ffmpeg")
if quadros and FF:
    from PIL import Image, ImageDraw, ImageFont

    fonte = ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", 15)
    W, H = 480, 270
    cols = min(4, len(quadros))
    folha = Image.new("RGB", (cols * W, ((len(quadros) + cols - 1) // cols) * (H + 44)), "white")
    d = ImageDraw.Draw(folha)
    tmp = os.path.join(ed, "sincronia-quadro.png")
    for k, (v, s, real) in enumerate(quadros):
        subprocess.run([FF, "-v", "error", "-y", "-ss", f"{v:.2f}", "-i", os.path.join(gravacao, "tela.mp4"),
                        "-frames:v", "1", "-vf", f"scale={W}:{H}", tmp], check=True)
        x, y = (k % cols) * W, (k // cols) * (H + 44)
        folha.paste(Image.open(tmp).convert("RGB"), (x, y))
        d.text((x + 4, y + H + 2), f"{s['index'] + 1}. {s['speech']}"[:58], fill="black", font=fonte)
        d.text((x + 4, y + H + 22), f"{real:.1f} s · {em_volta(real + 0.6, 3, 1)}"[:58], fill="black", font=fonte)
    os.remove(tmp)
    folha.save(os.path.join(ed, "sincronia-jogo.jpg"), quality=88)
    saida += ["", f"Quadros do jogo logo depois de cada gesto: `sincronia-jogo.jpg` ({len(quadros)})."]

open(os.path.join(ed, "sincronia.md"), "w", encoding="utf8", newline="\n").write("\n".join(saida) + "\n")
print(saida[-1] if not quadros else saida[-3])
for ln in linhas:
    if "ATRASADO" in ln or "ADIANTADO" in ln or "não feita" in ln:
        print(ln)
sys.exit(1 if ruins else 0)
