"""Vitrines por grupo da decoração (plantas grandes e pequenas, separadas pela fixação).
Uso: blender-venv/bin/python -I morada-art/moveis_decoracao_vitrines.py -- <saida>"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402,F401
import moveis_base as mb  # noqa: E402

SAIDA = sys.argv[sys.argv.index("--") + 1]
pasta = os.path.join(SAIDA, "plantas")
itens = json.load(open(os.path.join(pasta, "catalogo.json")))["itens"]
grandes = [i["id"] for i in itens if i["fixacao"] == "chao"]
pequenas = [i["id"] for i in itens if i["fixacao"] != "chao"]
mb.vitrine(pasta, os.path.join(pasta, "vitrine_grandes.png"), ids=grandes)
mb.vitrine(pasta, os.path.join(pasta, "vitrine_pequenas.png"), ids=pequenas)
