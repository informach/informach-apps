"""Planta de conferência (vista de cima, PIL) de uma cena gravada por cidade_cenas.py: chão por tipo e as caixas das
peças. Uso: python3 -I morada-art/cidade_cenas_planta.py SP/cidade_out <id> <saida.png> [px_por_m]"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image, ImageDraw  # noqa: E402

import cidade_cenas as cs  # noqa: E402

COR_CHAO = {"ruas": (70, 70, 78), "pisos": (200, 200, 190), "agua": (60, 140, 210), "estacionamentos": (110, 110, 120),
            "parque_areas": (120, 200, 110), "parque_brinquedos": (230, 150, 90), "estruturas": (150, 150, 160),
            "pontes": (180, 180, 200), "cenario": (240, 210, 150)}


def main():
    saida, id_, png = sys.argv[1:4]
    esc = float(sys.argv[4]) if len(sys.argv) > 4 else 2.0
    cs.B = cs.Biblioteca(saida)
    cena = json.load(open(os.path.join(saida, "cenas", id_ + ".json")))
    pecas = cena["pecas"]
    xs = [p["p"][0] for p in pecas]
    ys = [p["p"][1] for p in pecas]
    x0, x1, y0, y1 = min(xs) - 30, max(xs) + 30, min(ys) - 30, max(ys) + 30
    W, H = int((x1 - x0) * esc), int((y1 - y0) * esc)
    im = Image.new("RGB", (W, H), (20, 30, 50))
    dr = ImageDraw.Draw(im)

    def P(x, y):
        return ((x - x0) * esc, (y1 - y) * esc)

    for p in pecas:
        k = cs.classe(p["c"], p["i"])
        if k != "tile":
            continue
        cor = COR_CHAO.get(p["c"], (150, 150, 150))
        i = p["i"]
        if i == "piso_grama" or "grama" in i:
            cor = (110, 190, 90)
        if i in ("mar", "mar_grande", "agua_aberta"):
            cor = (40, 110, 190)
        if i == "areia":
            cor = (240, 200, 140)
        lo, hi = cs.B.caixa(p["c"], i)
        poly = cs._ret(lo[0], lo[1], hi[0], hi[1], p["p"][0], p["p"][1], p.get("r", 0))
        dr.polygon([P(*a) for a in poly], fill=cor, outline=(40, 40, 40))
        if p["c"] == "ruas" or "costa" in i or "grama_areia" in i:
            # marca a superfície de asfalto por amostragem
            for a in range(-7, 8):
                for b in range(-7, 8):
                    lx, ly = a + 0.0, b + 0.0
                    s = cs.superficie_local(i, lx, ly)
                    gx, gy = cs.rp(lx, ly, p.get("r", 0))
                    c2 = {"asfalto": (40, 40, 45), "agua": (40, 110, 190), "livre": (240, 200, 140),
                          "costa": (200, 230, 255)}.get(s)
                    if c2:
                        X, Y = P(p["p"][0] + gx, p["p"][1] + gy)
                        dr.rectangle([X - esc / 2, Y - esc / 2, X + esc / 2, Y + esc / 2], fill=c2)
    for p in pecas:
        k = cs.classe(p["c"], p["i"])
        if k == "tile":
            continue
        cor = {"veiculo": (255, 60, 60), "barco": (255, 255, 255), "arvore": (20, 120, 30), "poste": (255, 230, 0),
               "bicho": (255, 120, 255), "elev": (160, 160, 255)}.get(k, (230, 120, 40))
        if p["c"].startswith("predios") or p["c"] == "arranha_ceus":
            cor = (180, 80, 200)
        for poly, z0, z1 in cs.volumes(p):
            if k == "elev":
                dr.polygon([P(*a) for a in poly], outline=cor)
            else:
                dr.polygon([P(*a) for a in poly], outline=cor, fill=None if k in ("arvore",) and z0 > 1 else cor)
        if "rota" in p:
            pts = [P(a[0], a[1]) for a in p["rota"]] + [P(p["rota"][0][0], p["rota"][0][1])]
            dr.line(pts, fill=(255, 0, 0), width=1)
    im.save(png)
    print(png, W, H)


main()
