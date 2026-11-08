"""Vitrines da categoria mesas, em dois grupos (jantar/balcões e escritório/sala).
Uso: blender-venv/bin/python -I morada-art/moveis_mesas_vitrine.py -- <pasta mesas> <grupo 1|2> [abertos]"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402,F401
import moveis_base as mb  # noqa: E402

a = sys.argv[sys.argv.index("--") + 1:]
pasta, grupo = a[0], a[1]
abertos = len(a) > 2 and a[2] == "abertos"
itens = json.load(open(os.path.join(pasta, "catalogo.json")))["itens"]
g1 = [i["id"] for i in itens if i["id"].startswith(("mesa_jantar", "balcao", "mesa_alta", "mesa_cozinha",
                                                     "mesa_trabalho"))]
ids = g1 if grupo == "1" else [i["id"] for i in itens if i["id"] not in g1]
nome = f"vitrine_{grupo}{'_abertos' if abertos else ''}.png"
mb.vitrine(pasta, os.path.join(pasta, nome), ids=ids, abertos=abertos)
