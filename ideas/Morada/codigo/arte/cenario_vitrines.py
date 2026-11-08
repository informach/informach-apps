"""Vitrines por grupo da categoria "cenario", de dia e de noite.

Uso: MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/cenario_vitrines.py -- SP/cidade_out [grupo...] [noite]
Grupos: terreno, montanhas, marcos, predios (o mesmo campo extra["cenario"] do catálogo).
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import moveis_base as mb  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:]
saida = argv[0]
args = argv[1:]
noite = "noite" in args
grupos = [a for a in args if a != "noite"] or ["terreno", "montanhas", "marcos", "predios"]
pasta = os.path.join(saida, "cenario")
cat = json.load(open(os.path.join(pasta, "catalogo.json")))
for g in grupos:
    ids = [i["id"] for i in cat["itens"] if i.get("cenario") == g]
    if not ids:
        continue
    arq = os.path.join(pasta, f"vitrine_{g}{'_noite' if noite else ''}.png")
    mb.vitrine(pasta, arq, ids=ids, noite=noite, res=(2000, 1150), amostras=int(os.environ.get("AMOSTRAS", 32)))
