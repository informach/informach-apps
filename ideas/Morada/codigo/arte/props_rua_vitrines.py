"""Vitrines da categoria props_rua, por grupo, de dia e de noite.

Uso: MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/props_rua_vitrines.py -- SP/cidade_out [grupos...] [dia|noite]
Grava SP/cidade_out/props_rua/vitrine_<grupo>[_noite].png (o grupo "todos" grava vitrine.png e vitrine_noite.png).
Como na página, as estampas que brilham ficam fracas de dia e fortes à noite (o mesmo ajuste da vitrine do
mobiliário urbano).
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402,F401

import moveis_base as mb  # noqa: E402
import cidade_vegetacao_mobiliario_vitrines  # noqa: E402,F401  (estampas fracas de dia e fortes à noite)

T = lambda *ts: (lambda i: any(t in i["tags"] for t in ts))  # noqa: E731
GRUPOS = {
    "obra": T("obra", "balizador", "barreira"),
    "servicos": T("parquimetro", "maquina", "caixa_eletronico", "carregador", "bicicleta"),
    "comercio": T("banca", "quiosque", "totem", "direcao"),
    "detalhes": lambda i: any(t in i["tags"] for t in ("bebedouro", "gradil", "floreira", "decalque", "lixeira"))
    and "calcadao" not in i["tags"],
    "telhado": T("telhado"),
    "fachada": T("fachada"),
    "calcadao": lambda i: "calcadao" in i["tags"] and "piso" not in i["tags"],
    "pisos": T("piso"),
    "todos": lambda i: "piso" not in i["tags"] and i["id"] != "balaustrada_15m",
}

if __name__ == "__main__":
    a = sys.argv[sys.argv.index("--") + 1:]
    saida = a[0]
    pasta = os.path.join(saida, "props_rua")
    grupos = [x for x in a[1:] if x in GRUPOS] or list(GRUPOS)
    modos = [x for x in a[1:] if x in ("dia", "noite")] or ["dia", "noite"]
    itens = json.load(open(os.path.join(pasta, "catalogo.json")))["itens"]
    for g in grupos:
        ids = [i["id"] for i in itens if GRUPOS[g](i)]
        for m in modos:
            nome = ("vitrine" if g == "todos" else "vitrine_" + g) + ("_noite" if m == "noite" else "") + ".png"
            mb.vitrine(pasta, os.path.join(pasta, nome), ids=ids, noite=(m == "noite"),
                       colunas=3 if g == "pisos" else None)
