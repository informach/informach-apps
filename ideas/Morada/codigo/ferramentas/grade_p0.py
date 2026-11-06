import sys, os, glob
from PIL import Image, ImageDraw, ImageFont
pasta, saida, por = sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 8
nomes = sorted({os.path.basename(f).rsplit("__", 1)[0] for f in glob.glob(os.path.join(pasta, "*__0.png"))})
try: fonte = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 15)
except Exception: fonte = ImageFont.load_default()
W, H = 220, 280
for g in range(0, len(nomes), por):
    bloco = nomes[g:g + por]
    img = Image.new("RGB", (W * 4, (H + 22) * len(bloco)), (255, 255, 255))
    d = ImageDraw.Draw(img)
    for r, n in enumerate(bloco):
        d.text((6, r * (H + 22) + 3), n, fill=(20, 20, 40), font=fonte)
        for k in range(4):
            p = os.path.join(pasta, f"{n}__{k}.png")
            if os.path.exists(p): img.paste(Image.open(p).convert("RGB"), (k * W, r * (H + 22) + 22))
    img.save(os.path.join(saida, f"folha_{g // por + 1:02d}.png"))
print(len(nomes))
