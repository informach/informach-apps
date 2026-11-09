"""Junta capturas num mosaico para conferência: python3 -I efeitos_mosaico.py <saida.jpg> <colunas> <larg> arquivos..."""
import sys
from PIL import Image, ImageDraw
saida, col, larg = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
ims = [Image.open(f).convert("RGB") for f in sys.argv[4:]]
h = max(int(im.height * larg / im.width) for im in ims)
lin = (len(ims) + col - 1) // col
M = Image.new("RGB", (col * larg, lin * (h + 18)), "white")
d = ImageDraw.Draw(M)
for k, (im, f) in enumerate(zip(ims, sys.argv[4:])):
    im = im.resize((larg, int(im.height * larg / im.width)))
    x, y = (k % col) * larg, (k // col) * (h + 18)
    M.paste(im, (x, y + 18))
    d.text((x + 4, y + 3), f.split("/")[-1][:-4], fill="black")
M.save(saida, quality=85)
