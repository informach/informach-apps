"""Anotações geradas no .ediaula (com o EdiAula fechado).

limpar: tira destaques, caixas e balões (e as faixas que ficam vazias), para gerar de novo sem duplicar.
acabar: caixas das categorias a 55% do tamanho padrão, com a ponta encostada nas linhas da paleta; faixas na
        ordem personagens, apresentadora, Zoom (todas as camadas de zoom numa faixa só), o resto. Assim o
        zoom amplia a tela e as anotações juntas, mas nunca a apresentadora nem os personagens.
Uso: anotacoes.py limpar|acabar <projeto.ediaula> [--apresentadora "<trecho do nome da mídia>"]
"""

import argparse
import json
import random
import string

ap = argparse.ArgumentParser()
ap.add_argument("modo", choices=["limpar", "acabar"])
ap.add_argument("projeto")
ap.add_argument("--apresentadora", default="HeyGen")
args = ap.parse_args()
p = args.projeto
d = json.load(open(p, encoding="utf8"))
A = {a["id"]: a for a in d["assets"]}
PALETA = 232  # borda esquerda da caixa: a ponta cai nas linhas da paleta do Estúdio (x ~246 em 1920)


def kind(c):
    return (c.get("annotation") or {}).get("kind")


if args.modo == "limpar":
    fora = [c for c in d["clips"] if kind(c) in ("highlight", "box", "balloon")]
    d["clips"] = [c for c in d["clips"] if c not in fora]
    usadas = {c["trackId"] for c in d["clips"]}
    vazias = {c["trackId"] for c in fora} - usadas
    d["tracks"] = [t for t in d["tracks"] if t["id"] not in vazias]
    ids = {c["assetId"] for c in d["clips"]}
    d["assets"] = [a for a in d["assets"] if a["id"] in ids or a.get("generated") != "annotation"]
    print("tirados", len(fora), "| faixas", len(vazias))
else:
    for c in d["clips"]:
        t = c.get("transform")
        if kind(c) == "box" and t and t["scale"] > 0.13:  # ainda no tamanho padrão
            t["scale"] = round(t["scale"] * 0.55, 4)
            t["x"] = round((PALETA + t["scale"] * 1920 / 2) / 1920, 4)

    def eh_apresentadora(c):
        return args.apresentadora in A[c["assetId"]]["name"]

    def personagem(c):
        return A[c["assetId"]].get("origin") == "presenter" and not eh_apresentadora(c)

    zoom_t = next((t for t in d["tracks"] if t["name"] == "Zoom"), None)
    if not zoom_t and any(c.get("zoomLayer") for c in d["clips"]):
        zoom_t = {"id": "t" + "".join(random.choice(string.ascii_lowercase + string.digits) for _ in range(12)),
                  "kind": "video", "name": "Zoom", "muted": False, "hidden": False, "locked": False}
        d["tracks"].append(zoom_t)
    for c in d["clips"]:
        if c.get("zoomLayer") and zoom_t:
            c["trackId"] = zoom_t["id"]
    usadas = {c["trackId"] for c in d["clips"]}
    topo = [t for t in d["tracks"] if any(c["trackId"] == t["id"] and personagem(c) for c in d["clips"])]
    apres = [t for t in d["tracks"] if t not in topo
             and any(c["trackId"] == t["id"] and eh_apresentadora(c) for c in d["clips"])]
    zoom = [zoom_t] if zoom_t else []
    resto = [t for t in d["tracks"] if t not in topo + apres + zoom and t["id"] in usadas]
    d["tracks"] = topo + apres + zoom + resto
    print("faixas:", [t["name"] for t in d["tracks"]][:5], len(d["tracks"]))
json.dump(d, open(p, "w", encoding="utf8"), ensure_ascii=False)
