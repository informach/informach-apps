"""Vitrines da sinalização e dos grafites (de dia e de noite), por grupo.

Uso: MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/cidade_sinalizacao_vitrines.py -- SP/cidade_out
     [sinalizacao|grafites] [grupos...] [dia|noite]

Como na página, as estampas emissivas (telas e letreiros) ficam fracas de dia (0,35 × a emissão do GLB) e fortes à
noite (1,2 ×). A mb.vitrine só mexe nas janelas e na luz; aqui ela é chamada com esse ajuste a mais.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402,F401

import moveis_base as mb  # noqa: E402

_orig = mb.emissao_janelas


def emissao_pagina(forca_janela, materiais_=None):
    antes = _orig(forca_janela, materiais_)
    noite = forca_janela > 0
    for m in (materiais_ or bpy.data.materials):
        if not m.name.startswith("estampa_") or not m.use_nodes:
            continue
        b = m.node_tree.nodes.get("Principled BSDF")
        if not b or not b.inputs["Emission Color"].is_linked:
            continue
        if "e0" not in m:
            m["e0"] = b.inputs["Emission Strength"].default_value
        b.inputs["Emission Strength"].default_value = m["e0"] * (1.2 if noite else 0.35)
    return antes


mb.emissao_janelas = emissao_pagina

_json_load = json.load


def _carrega(f, *a, **k):
    """Na vitrine, as peças de quina (origem na quina, não no meio) ganham uma vaga do dobro do tamanho."""
    d = _json_load(f, *a, **k)
    for i in d.get("itens", []) if isinstance(d, dict) else []:
        if "quina" in i:
            i["dims"] = [i["dims"][0] * 2, i["dims"][1] * 2, i["dims"][2]]
    return d


json.load = _carrega

GRUPOS = {
    "sinalizacao": {
        "outdoors": lambda i: "outdoor" in i["tags"],
        "faixas": lambda i: i["id"].startswith(("faixa_", "led_")),
        "paineis": lambda i: i["id"].startswith("painel_") and "maquina" not in i["id"],
        "verticais": lambda i: i["id"].startswith(("vertical_", "totem_")) and "mapa" not in i["id"],
        "placas": lambda i: i["id"].startswith(("placa_", "cavalete", "avisos", "bandeirola", "relogio", "fliperama",
                                                "totem_mapa", "painel_maquina")),
        "letreiros": lambda i: i["id"].startswith("letreiro_"),
        "todos": lambda i: True,
    },
    "grafites": {
        "decalques": lambda i: "decalque" in i["tags"],
        "muros": lambda i: "muro" in i["tags"],
        "todos": lambda i: True,
    },
}

if __name__ == "__main__":
    a = sys.argv[sys.argv.index("--") + 1:]
    saida = a[0]
    cat = a[1] if len(a) > 1 and a[1] in GRUPOS else "sinalizacao"
    resto = [x for x in a[1:] if x != cat]
    modos = [x for x in resto if x in ("dia", "noite")] or ["dia", "noite"]
    grupos = [x for x in resto if x in GRUPOS[cat]] or list(GRUPOS[cat])
    pasta = os.path.join(saida, cat)
    itens = json.load(open(os.path.join(pasta, "catalogo.json")))["itens"]
    for g in grupos:
        ids = [i["id"] for i in itens if GRUPOS[cat][g](i)]
        for modo in modos:
            nome = ("vitrine" if g == "todos" else "vitrine_" + g) + ("_noite" if modo == "noite" else "") + ".png"
            mb.vitrine(pasta, os.path.join(pasta, nome), ids=ids, noite=(modo == "noite"), amostras=32)
