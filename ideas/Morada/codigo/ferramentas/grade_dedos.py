import sys, glob, os
from PIL import Image
D, saida = sys.argv[1], sys.argv[2]
acoes = sorted({os.path.basename(f).rsplit("_", 1)[0] for f in glob.glob(D + "/*.png") if not os.path.basename(f).startswith("_")})
W = Image.new("RGB", (6 * 150, 150 * len(acoes)), "white")
for i, a in enumerate(acoes):
    for j, s in enumerate(("0a", "0b", "1a", "1b", "2a", "2b")):
        f = f"{D}/{a}_{s}.png"
        if os.path.exists(f):
            W.paste(Image.open(f).resize((150, 150)), (j * 150, i * 150))
W.save(saida); print(acoes)
