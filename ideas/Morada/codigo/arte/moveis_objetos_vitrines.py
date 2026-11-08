"""Vitrines das categorias objetos, livros e luminárias (por grupo).
Uso: blender-venv/bin/python -I morada-art/moveis_objetos_vitrines.py -- SP/moveis_out [qual ...]"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402,F401
import moveis_base as mb  # noqa: E402

A = sys.argv[sys.argv.index("--") + 1:]
SAIDA = A[0]
QUAIS = A[1:] or ["livros", "luminarias", "obj_grandes", "obj_pequenos", "obj_abertos"]


def itens(cat):
    return json.load(open(os.path.join(SAIDA, cat, "catalogo.json")))["itens"]


obj = itens("objetos")
grandes = [i["id"] for i in obj if i["fixacao"] == "chao" and max(i["dims"]) > 0.5]
pequenos = [i["id"] for i in obj if i["id"] not in grandes]
inter = [i["id"] for i in obj if i["interativos"]]
for q in QUAIS:
    if q == "livros":
        mb.vitrine(os.path.join(SAIDA, "livros"), os.path.join(SAIDA, "livros", "vitrine.png"), res=(1800, 1000))
    elif q == "luminarias":
        mb.vitrine(os.path.join(SAIDA, "luminarias"), os.path.join(SAIDA, "luminarias", "vitrine.png"), res=(1800, 1000))
    elif q == "obj_grandes":
        mb.vitrine(os.path.join(SAIDA, "objetos"), os.path.join(SAIDA, "objetos", "vitrine_grandes.png"), ids=grandes,
                   res=(1800, 1000))
    elif q == "obj_pequenos":
        mb.vitrine(os.path.join(SAIDA, "objetos"), os.path.join(SAIDA, "objetos", "vitrine_pequenos.png"), ids=pequenos,
                   res=(1800, 1000))
    elif q == "obj_abertos":
        mb.vitrine(os.path.join(SAIDA, "objetos"), os.path.join(SAIDA, "objetos", "vitrine_abertos.png"), ids=inter,
                   res=(1800, 1000), abertos=True)
print("grandes", len(grandes), "pequenos", len(pequenos), "inter", inter)
