"""Vitrines por grupo dos prédios ecológicos (dia e noite).
  blender-venv/bin/python -I morada-art/predios_ecologicos_vitrines.py -- <pasta_categoria> <saida.png> [noite] [ids...]"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import moveis_base as mb  # noqa: E402

a = sys.argv[sys.argv.index("--") + 1:]
pasta, saida = a[0], a[1]
resto = a[2:]
noite = "noite" in resto
ids = [x for x in resto if x != "noite"] or None
mb.vitrine(pasta, saida, ids=ids, noite=noite, amostras=int(os.environ.get("AMOSTRAS", 40)))
