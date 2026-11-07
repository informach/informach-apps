"""Folhas da revisão na página: cada peça (frente e costas, recortadas no corpo) com o id embaixo, 6 por linha.
Uso: python folha_pagina.py <dir> <sexo> <ids separados por vírgula ou @arquivo> <saída.png> [recorte x0,y0,x1,y1]"""
import os, sys
from PIL import Image, ImageDraw
d, sx, ids, out = sys.argv[1:5]
ids = open(ids[1:]).read().split(",") if ids.startswith("@") else ids.split(",")
x0, y0, x1, y1 = map(int, (sys.argv[5] if len(sys.argv) > 5 else "290,110,610,780").split(","))
W = 150; H = int(W * (y1 - y0) / (x1 - x0)); COL = 6
ids = [i for i in ids if os.path.exists(os.path.join(d, f"{sx}_{i}_0.png"))]
im = Image.new("RGB", (COL * 2 * W, ((len(ids) + COL - 1) // COL) * (H + 14)), "white")
dr = ImageDraw.Draw(im)
for n, i in enumerate(ids):
    X, Y = (n % COL) * 2 * W, (n // COL) * (H + 14)
    for k in (0, 1):
        a = Image.open(os.path.join(d, f"{sx}_{i}_{k}.png")).convert("RGB").crop((x0, y0, x1, y1)).resize((W, H))
        im.paste(a, (X + k * W, Y))
    dr.text((X + 3, Y + H + 1), i.replace("nov_", "").replace("roupa_", "r:")[:30], fill=(0, 0, 0))
im.save(out); print(out, len(ids))
