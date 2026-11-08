"""Conta triângulos por nome de parte (depuração). Uso: blender-venv/bin/python -I morada-art/parque_brinquedos_tris.py -- SP/cidade_out <id>"""
import os
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import moveis_base as mb  # noqa: E402
import parque_brinquedos_base as pb  # noqa: E402
import cidade_parque_brinquedos as cp  # noqa: E402

a = sys.argv[sys.argv.index("--") + 1:]
pb.EST_DIR = os.path.join(a[0], cp.CAT, "estampas")
for id_, rot, grupo, tags, f, extra, mini in cp._pecas():
    if id_ not in a[1:]:
        continue
    mb.limpa()
    it = pb.ItemP(id_)
    f(it)
    c = Counter()
    for o in it.partes:
        c[o.name.split(".")[0]] += sum(len(p.vertices) - 2 for p in o.data.polygons)
    for o, *_ in it.animados:
        c["anim:" + o.name.split("_")[0]] += sum(len(p.vertices) - 2 for p in o.data.polygons)
    print(id_, sum(c.values()))
    for k, v in c.most_common(25):
        print(f"   {k:24s} {v}")
