"""Base das animações de conceito a partir de um .edisvg do curso que tem as artes do jogo como pranchetas.

Uso: base_jogo.py <.edisvg com as artes> <base.edisvg de saída>

A base (o que o edisvg_cena.Cena espera) tem uma prancheta 1920x1080 padrão com o grupo "Jogo": uma instância
de cada arte, com o nome "<tipo> · <arte>" (personagem, chave, farol, barco, cenário), no tamanho do jogo
(3x a prancheta, como na tela do jogo das animações do curso). As outras pranchetas e as fontes ficam; as
animações do arquivo de origem saem.
"""

import copy
import json
import sys
import uuid

origem, saida = sys.argv[1], sys.argv[2]
d = json.load(open(origem, encoding="utf8"))


def tipo(nome, w, h):
    if (w, h) == (480, 360):
        return "cenário"
    if nome.startswith("farol-"):
        return "farol"
    if nome.startswith("chave-"):
        return "chave"
    if w == 88:
        return "barco"
    if w == 64:
        return "personagem"
    return None


instancias = []
for a in d["artboards"]:
    _, _, w, h = a["scene"]["viewBox"]
    t = tipo(a["name"], w, h)
    if not t:
        continue
    instancias.append({
        "id": f"node-{uuid.uuid4()}", "name": f"{t} · {a['name']}", "tag": "g", "attrs": {}, "text": "",
        "transform": {"x": 0, "y": 0, "rotation": 0, "sx": 1, "sy": 1, "opacity": 0}, "visible": True,
        "locked": False,
        "instance": {"artboardId": a["id"], "animationId": None, "width": w * 3, "height": h * 3,
                     "fit": "stretch", "speed": 1, "offsetSeconds": 0, "overrides": []}})
cena = {"id": "artboard-cena", "name": "Cena", "scene": {"viewBox": [0, 0, 1920, 1080], "nodes": [{
    "id": f"node-{uuid.uuid4()}", "name": "Jogo", "tag": "g", "attrs": {}, "text": "",
    "transform": {"x": 0, "y": 0, "rotation": 0, "sx": 1, "sy": 1, "opacity": 0}, "visible": False,
    "locked": False, "children": instancias}]}}
base = copy.deepcopy(d)
base["artboards"] = [a for a in base["artboards"] if a["id"] != "artboard-cena"] + [cena]
base["defaultArtboardId"] = "artboard-cena"
base["motion"] = {"version": d["motion"]["version"], "animations": []}
json.dump(base, open(saida, "w", encoding="utf8"), ensure_ascii=False)
print(saida, "|", len(instancias), "artes:", ", ".join(sorted(i["name"] for i in instancias)))
