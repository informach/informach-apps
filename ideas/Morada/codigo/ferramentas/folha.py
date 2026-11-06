"""Junta PNGs numa folha (para revisão). Uso: python folha.py <saida.png> <colunas> <arquivos...>"""
import sys
from PIL import Image, ImageDraw
out, cols, fs = sys.argv[1], int(sys.argv[2]), sys.argv[3:]
ims = [Image.open(f).convert("RGB") for f in fs]
w, h = ims[0].size
rows = (len(ims) + cols - 1) // cols
F = Image.new("RGB", (cols * w, rows * h), (255, 255, 255))
d = ImageDraw.Draw(F)
for i, (im, f) in enumerate(zip(ims, fs)):
    x, y = (i % cols) * w, (i // cols) * h
    F.paste(im, (x, y)); d.text((x + 4, y + 4), f.split("/")[-1][:-4], fill=(0, 0, 0))
F.save(out)
