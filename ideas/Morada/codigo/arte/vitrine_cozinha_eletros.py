"""Vitrines por grupo da categoria cozinha_eletros.
Uso: blender-venv/bin/python -I morada-art/vitrine_cozinha_eletros.py -- <pasta_categoria> <saida.png> <prefixos,vírgula|todos> [abertos] [colunas]"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa
import moveis_base as mb
a = sys.argv[sys.argv.index("--") + 1:]
pasta, saida, pref = a[0], a[1], a[2]
abertos = len(a) > 3 and a[3] == "abertos"
col = int(a[4]) if len(a) > 4 else None
cat = json.load(open(os.path.join(pasta, "catalogo.json")))
ids = [i["id"] for i in cat["itens"]]
if pref != "todos":
    ps = pref.split(",")
    ids = [i for i in ids if any(i.startswith(p.rstrip("*")) if p.endswith("*") else i == p for p in ps)]
mb.vitrine(pasta, saida, ids=ids, abertos=abertos, colunas=col, amostras=int(os.environ.get("AMOSTRAS", 32)))
