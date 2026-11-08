"""Vitrines por grupo da categoria natal (de dia e de noite), além da vitrine geral de tools/vitrine_cat.py.
Uso: blender-venv/bin/python -I morada-art/moveis_natal_vitrines.py -- SP/moveis_out [qual ...]
qual: moveis, moveis_abertos, decoracao, decoracao_noite, pequenos, construcao, construcao_noite (padrão: todos)."""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402,F401
import moveis_base as mb  # noqa: E402

A = sys.argv[sys.argv.index("--") + 1:]
SAIDA = A[0]
PASTA = os.path.join(SAIDA, "natal")
QUAIS = A[1:] or ["moveis", "moveis_abertos", "decoracao", "decoracao_noite", "pequenos", "construcao",
                  "construcao_noite"]
itens = json.load(open(os.path.join(PASTA, "catalogo.json")))["itens"]
cons = [i["id"] for i in itens if i.get("construcao")]
pequenos = [i["id"] for i in itens if i["id"] not in cons and max(i["dims"]) <= 0.5]
MOV = ("poltrona", "sofa", "pufe", "mesa", "cabideiro", "luminaria", "lustre", "cama", "criado", "aparador",
       "armario", "nicho", "prateleira", "pia", "fogao", "geladeira", "banqueta", "lareira")
moveis = [i["id"] for i in itens if i["id"] not in cons + pequenos and i["id"].startswith(MOV)]
deco = [i["id"] for i in itens if i["id"] not in cons + pequenos + moveis]
inter = [i["id"] for i in itens if i["interativos"]]
G = {"moveis": (moveis, False, False), "moveis_abertos": (inter, True, False), "decoracao": (deco, False, False),
     "decoracao_noite": (deco, False, True), "pequenos": (pequenos, False, False),
     "construcao": (cons, False, False), "construcao_noite": (cons, False, True)}
for q in QUAIS:
    ids, ab, noite = G[q]
    mb.vitrine(PASTA, os.path.join(PASTA, f"vitrine_{q}.png"), ids=ids, res=(1800, 1000), abertos=ab, noite=noite)
print("moveis", len(moveis), "decoracao", len(deco), "pequenos", len(pequenos), "construcao", len(cons),
      "interativos", len(inter))
