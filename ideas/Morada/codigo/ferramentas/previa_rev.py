"""Prévia da revisão em andamento: folhas de 30 peças (frente e costas) na ordem do log. Uso: previa_rev.py <log> <dir> <ini> <fim>"""
import os, sys
from PIL import Image, ImageDraw
log, d, ini, fim = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
ids = [l.split()[1] for l in open(log) if l.startswith("revisto")][ini:fim]
W, H, COL = 180, 240, 6
for parte in range(0, len(ids), 30):
    bl = ids[parte:parte + 30]
    im = Image.new("RGB", (COL * W * 2, ((len(bl) + COL - 1) // COL) * (H + 14)), "white")
    dr = ImageDraw.Draw(im)
    for i, x in enumerate(bl):
        X, Y = (i % COL) * W * 2, (i // COL) * (H + 14)
        for k in (0, 1):
            f = os.path.join(d, f"{x}_{k}.png")
            if os.path.exists(f):
                im.paste(Image.open(f).convert("RGB").resize((W, H)), (X + k * W, Y))
        dr.text((X + 3, Y + H + 1), x.replace("nov_", "").replace("roupa_", "r:")[:30], fill=(0, 0, 0))
    out = os.path.join(os.path.dirname(d.rstrip("/")), f"previa_{ini + parte}.png")
    im.save(out); print(out)
