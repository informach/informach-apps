"""Vitrines por grupo dos prédios mágicos (marcos e casas), de dia e de noite.

Uso: MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/predios_magicos_vitrines.py -- SP/cidade_out [marcos|casas]
Grava SP/cidade_out/predios_magicos/vitrine_<grupo>.png e vitrine_<grupo>_noite.png.
(A vitrine da categoria inteira sai de tools/vitrine_cat.py.)
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402,F401
import moveis_base as mb  # noqa: E402

args = sys.argv[sys.argv.index("--") + 1:]
pasta = os.path.join(args[0], "predios_magicos")
itens = json.load(open(os.path.join(pasta, "catalogo.json")))["itens"]
GRUPOS = {
    "marcos": [i["id"] for i in itens if "marco" in i["tags"]],
    "casas": [i["id"] for i in itens if "marco" not in i["tags"]],
}
for g in [a for a in args[1:] if a in GRUPOS] or list(GRUPOS):
    for noite in (False, True):
        arq = os.path.join(pasta, f"vitrine_{g}{'_noite' if noite else ''}.png")
        mb.vitrine(pasta, arq, ids=GRUPOS[g], noite=noite, colunas=4 if g == "marcos" else 7)
