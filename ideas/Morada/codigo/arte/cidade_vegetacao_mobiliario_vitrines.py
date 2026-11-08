"""Vitrines da vegetação e do mobiliário urbano, por grupo, de dia e de noite.

Uso: MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/cidade_vegetacao_mobiliario_vitrines.py -- SP/cidade_out
     [vegetacao|mobiliario_urbano] [grupos...] [dia|noite]

Como na página, as estampas que brilham (placas do ponto de ônibus, mostrador do relógio) ficam fracas de dia
(0,35 × a emissão do GLB) e fortes à noite (1,2 ×); a mb.vitrine sozinha só mexe nas janelas e na luz.
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

GRUPOS = {
    "vegetacao": {
        "arvores": lambda i: "arvore" in i["tags"] and "palmeira" not in i["tags"] and i["id"] != "arvore_praca_gigante",
        "grandes": lambda i: i["id"] in ("arvore_praca_gigante", "palmeira", "palm_03_pacote", "arvore_redonda_grande"),
        "jardim": lambda i: "arvore" not in i["tags"],
        "todos": lambda i: True,
    },
    "mobiliario_urbano": {
        "bancos": lambda i: any(t in i["tags"] for t in ("banco", "mesa", "guarda_sol", "churrasqueira")),
        "luzes": lambda i: any(t in i["tags"] for t in ("poste", "luminaria", "refletor", "relogio")),
        "lixeiras": lambda i: "lixeira" in i["tags"],
        "rua": lambda i: any(t in i["tags"] for t in ("semaforo", "placa", "ponto_onibus", "barreira")),
        "calcada": lambda i: any(t in i["tags"] for t in ("hidrante", "bebedouro", "correio", "bicicletario",
                                                          "telefone")),
        "todos": lambda i: True,
    },
}

if __name__ == "__main__":
    a = sys.argv[sys.argv.index("--") + 1:]
    saida = a[0]
    cat = a[1] if len(a) > 1 and a[1] in GRUPOS else "vegetacao"
    resto = [x for x in a[1:] if x != cat]
    modos = [x for x in resto if x in ("dia", "noite")] or ["dia", "noite"]
    grupos = [x for x in resto if x in GRUPOS[cat]] or list(GRUPOS[cat])
    pasta = os.path.join(saida, cat)
    itens = json.load(open(os.path.join(pasta, "catalogo.json")))["itens"]
    for g in grupos:
        ids = [i["id"] for i in itens if GRUPOS[cat][g](i)]
        if not ids:
            continue
        for modo in modos:
            nome = "vitrine" if g == "todos" else f"vitrine_{g}"
            arq = os.path.join(pasta, nome + ("_noite" if modo == "noite" else "") + ".png")
            res = tuple(int(v) for v in os.environ.get("VITRINE_RES", "1800x1000").split("x"))
            mb.vitrine(pasta, arq, ids=ids, noite=modo == "noite", amostras=40, res=res)
