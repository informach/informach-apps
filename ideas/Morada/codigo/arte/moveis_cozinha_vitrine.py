"""Vitrines da cozinha por linha. Uso: blender-venv/bin/python -I moveis_cozinha_vitrine.py -- <pasta_cat> <saida.png>
<linha|todas-cores:linha|ids=a,b,c> [abertos]"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa
import moveis_base as mb
a = sys.argv[sys.argv.index("--") + 1:]
pasta, saida, sel = a[0], a[1], a[2]
abertos = len(a) > 3 and a[3] == "abertos"
cat = json.load(open(os.path.join(pasta, "catalogo.json")))
itens = cat["itens"]
if sel.startswith("ids="):
    ids = sel[4:].split(",")
elif sel.startswith("cores:"):
    ln = sel[6:]
    gs = {i["grupo"] for i in itens if i.get("linha") == ln}
    ids = [i["id"] for i in itens if i.get("linha") == ln]
else:
    vistos = set()
    ids = []
    for i in itens:  # só a primeira cor de cada desenho
        if i.get("linha") == sel and i["grupo"] not in vistos:
            vistos.add(i["grupo"]); ids.append(i["id"])
mb.vitrine(pasta, saida, ids=ids, abertos=abertos, res=(1800, 1000), amostras=int(os.environ.get("AMOSTRAS", 32)))
