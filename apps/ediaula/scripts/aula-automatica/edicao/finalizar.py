"""Acabamento da edição automática no .ediaula (com o EdiAula fechado).

- Animações de conceito (mídias "conceito-*", já na linha do tempo no segundo certo) passam para a faixa da
  tela, no lugar do trecho, com a transição de círculos coloridos nas duas pontas; a tela e o som da página
  são cortados ali.
- Apresentadora nos intervalos do montar.py (<saida>-apresentadora.json), fora da fala dos personagens.
- Voz da professora em silêncio enquanto um personagem fala (o clipe do personagem já recortado na fala).

Depois rode anotacoes.py acabar (caixas das categorias e ordem das faixas).
Uso: finalizar.py <projeto.ediaula> <apresentadora.json> [--apresentadora "<trecho do nome da mídia>"]
"""

import argparse
import copy
import json
import random
import string

ap = argparse.ArgumentParser()
ap.add_argument("projeto")
ap.add_argument("intervalos")
ap.add_argument("--apresentadora", default="HeyGen", help="trecho do nome da mídia da apresentadora")
args = ap.parse_args()
p = args.projeto
d = json.load(open(p, encoding="utf8"))
A = {a["id"]: a for a in d["assets"]}
TRANS = {"kind": "colorcircles", "duration": 0.6, "colors": ["#1B5CF3", "#6D3BF5", "#FFC02E"]}


def novo(pre="c"):
    return pre + "".join(random.choice(string.ascii_lowercase + string.digits) for _ in range(12))


def nome(c):
    return A[c["assetId"]]["name"]


def eh_apresentadora(c):
    return args.apresentadora in nome(c)


tela_track = next(c["trackId"] for c in d["clips"] if nome(c).startswith("Tela"))

# 1. Animações na faixa da tela.
for anim in [c for c in d["clips"] if nome(c).startswith("conceito-") and c["trackId"] != tela_track]:
    a = A[anim["assetId"]]
    a.pop("key", None)  # o EdiAula recorta sozinho o fundo azul liso; null quebra a abertura do projeto
    a["alpha"] = False
    INI, FIM = anim["start"], anim["start"] + anim["duration"]
    novos, depois = [], None
    for c in list(d["clips"]):
        n = nome(c)
        if not (n.startswith("Tela") or n.startswith("som-da")):
            continue
        s, e = c["start"], c["start"] + c["duration"]
        if e <= INI or s >= FIM:
            continue
        sp = c.get("speed", 1) or 1
        if s < INI and e > FIM:
            b = copy.deepcopy(c)
            b["id"] = novo()
            b["start"] = FIM
            b["duration"] = round(e - FIM, 6)
            b["in"] = round(c.get("in", 0) + (FIM - s) * sp, 6)
            b.pop("transition", None)
            c["duration"] = round(INI - s, 6)
            novos.append(b)
            if n.startswith("Tela"):
                depois = b
        elif s < INI:
            c["duration"] = round(INI - s, 6)
        elif e > FIM:
            c["in"] = round(c.get("in", 0) + (FIM - s) * sp, 6)
            c["duration"] = round(e - FIM, 6)
            c["start"] = FIM
            if n.startswith("Tela"):
                depois = c
        else:
            d["clips"].remove(c)
    d["clips"] += novos
    anim.update(trackId=tela_track, transition=dict(TRANS))
    for k in ("enter", "exit", "fadeIn", "fadeOut"):
        anim.pop(k, None)
    if depois:
        depois["transition"] = dict(TRANS)
    print(f"animação {a['name']}: {INI:.2f}-{FIM:.2f}")

# 2. Apresentadora: fora da fala dos personagens.
pers = [(c["start"], c["start"] + c["duration"]) for c in d["clips"]
        if A[c["assetId"]].get("origin") == "presenter" and not eh_apresentadora(c)]
pres = [c for c in d["clips"] if eh_apresentadora(c)]
modelo = copy.deepcopy(min(pres, key=lambda c: c["start"]))
d["clips"] = [c for c in d["clips"] if not eh_apresentadora(c)]
intervalos = []
for a, b in json.load(open(args.intervalos)):
    pedacos = [(a, b)]
    for p0, p1 in pers:
        pedacos = [x for q0, q1 in pedacos for x in ([(q0, q1)] if p1 <= q0 or p0 >= q1 else
                                                        [y for y in ((q0, p0 - 0.05), (p1 + 0.05, q1)) if y[1] - y[0] >= 1.5])]
    intervalos += pedacos
for a, b in intervalos:
    c = copy.deepcopy(modelo)
    c.update(id=novo(), start=round(a, 3), duration=round(b - a, 3))
    c["in"] = round(a, 3)
    if a < 0.1:
        c["fadeIn"] = 0  # a capa e a apresentadora são o primeiro quadro
        c.pop("enter", None)
    else:
        c.update(fadeIn=0.25, enter="fade")
    c.update(fadeOut=0.25, exit="fade")
    d["clips"].append(c)
print("apresentadora:", [(round(a, 1), round(b, 1)) for a, b in intervalos])

# 3. Voz da professora em silêncio na fala do personagem.
for p0, p1 in pers:
    narr = next((c for c in d["clips"] if nome(c).startswith("narracao") and c.get("volume", 1) > 0
                 and c["start"] <= p0 < c["start"] + c["duration"]), None)
    if not narr:
        continue
    s, e = narr["start"], narr["start"] + narr["duration"]
    base_in = narr.get("in", 0)
    meio, fim = copy.deepcopy(narr), copy.deepcopy(narr)
    narr["duration"] = round(p0 - s, 6)
    meio.update(id=novo(), start=p0, duration=round(min(p1, e) - p0, 6), volume=0)
    meio["in"] = round(base_in + (p0 - s), 6)
    d["clips"].append(meio)
    if e > p1:
        fim.update(id=novo(), start=p1, duration=round(e - p1, 6))
        fim["in"] = round(base_in + (p1 - s), 6)
        d["clips"].append(fim)
    print(f"voz da professora em silêncio de {p0:.2f} a {min(p1, e):.2f}")

json.dump(d, open(p, "w", encoding="utf8"), ensure_ascii=False)
