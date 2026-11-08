"""Empilha imagens (esboços) numa só: python -I bichos_zoologico_pilha.py saida.png a.png b.png ..."""
import sys
from PIL import Image
ims = [Image.open(f) for f in sys.argv[2:]]
W = max(i.width for i in ims); H = sum(i.height for i in ims)
o = Image.new("RGB", (W, H)); y = 0
for i in ims:
    o.paste(i, (0, y)); y += i.height
if W > 2000:
    o = o.resize((2000, int(H * 2000 / W)))
o.save(sys.argv[1])
