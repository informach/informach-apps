"""Folhas da revisão: por slot, cada peça com frente e costas lado a lado e o id embaixo. Uso: python folha_revisao.py <dir>"""
import json, os, sys
from PIL import Image, ImageDraw
d = sys.argv[1]
feitos = json.load(open(os.path.join(d, "feitos.json")))
por = {}
for slot, id_, rot in feitos:
    por.setdefault(slot, []).append((id_, rot))
W, H, COL = 150, 200, 6
for slot, lst in por.items():
    for parte in range(0, len(lst), 24):
        bloco = lst[parte:parte + 24]
        linhas = (len(bloco) + COL - 1) // COL
        im = Image.new("RGB", (COL * W * 2, linhas * (H + 14)), (255, 255, 255))
        dr = ImageDraw.Draw(im)
        for i, (id_, rot) in enumerate(bloco):
            x, y = (i % COL) * W * 2, (i // COL) * (H + 14)
            for k in (0, 1):
                f = os.path.join(d, f"{id_}_{k}.png")
                if os.path.exists(f):
                    im.paste(Image.open(f).convert("RGB").resize((W, H)), (x + k * W, y))
            dr.text((x + 3, y + H + 1), id_.replace("nov_", "").replace("roupa_", "r:")[:28], fill=(0, 0, 0))
        im.save(os.path.join(d, f"folha_{slot}_{parte // 24}.png"))
        print("folha", slot, parte // 24, len(bloco))
