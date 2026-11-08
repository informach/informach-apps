"""Estampas da categoria parque_brinquedos (lava e letreiros), desenhadas com PIL.

Uso: python3 -I morada-art/parque_brinquedos_estampas.py SP/cidade_out
Grava SP/cidade_out/parque_brinquedos/estampas/<nome>.png. Só palavras genéricas em português, sem marca.
- lava.png: lava em cartum (laranja e amarelo com crosta escura), emenda nas quatro bordas (UV planar repetido).
- letreiros: fundo colorido, contorno, texto grande; desenho em 2× e redução (antisserrilha).
"""
import math
import os
import random
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

SAIDA = sys.argv[1]
PASTA = os.path.join(SAIDA, "parque_brinquedos", "estampas")
os.makedirs(PASTA, exist_ok=True)
F_BLACK = "/usr/share/fonts/opentype/inter/Inter-Black.otf"
SS = 2


def lava(n=512):
    """Lava: campo de ruído liso que emenda (soma de senos em grade inteira), em faixas de cor."""
    rnd = random.Random(5)
    ondas = [(rnd.randint(1, 4), rnd.randint(1, 4), rnd.uniform(0, 6.28), rnd.uniform(0.5, 1.0)) for _ in range(9)]
    img = Image.new("RGB", (n, n))
    px = img.load()
    cores = [(150, 40, 18), (214, 70, 22), (250, 120, 28), (255, 170, 40), (255, 222, 90), (255, 246, 170)]
    for j in range(n):
        for i in range(n):
            u, v = 2 * math.pi * i / n, 2 * math.pi * j / n
            s = sum(a * math.sin(kx * u + ky * v + f) for kx, ky, f, a in ondas)
            s2 = math.sin(3 * u + 2 * math.sin(2 * v)) * 0.6 + math.sin(4 * v + 1.3 * math.sin(3 * u)) * 0.6
            t = (s / 4.0 + s2 / 2.4) * 0.5 + 0.5
            t = min(0.999, max(0.0, t))
            k = t * (len(cores) - 1)
            a, f = int(k), k - int(k)
            f = min(1.0, max(0.0, (f - 0.35) / 0.3))  # faixas quase chapadas (cartum)
            c0, c1 = cores[a], cores[min(a + 1, len(cores) - 1)]
            px[i, j] = tuple(int(c0[q] + (c1[q] - c0[q]) * f) for q in range(3))
    img = img.filter(ImageFilter.GaussianBlur(1.2))
    img.save(os.path.join(PASTA, "lava.png"))


def letreiro(nome, texto, fundo, borda, cor_texto, larg=1024, alt=256, estrelas=False, contorno=(30, 24, 50)):
    W, H = larg * SS, alt * SS
    img = Image.new("RGB", (W, H), borda)
    d = ImageDraw.Draw(img)
    m = int(H * 0.08)
    d.rounded_rectangle((m, m, W - m, H - m), radius=int(H * 0.18), fill=fundo)
    tam = int(H * 0.56)
    fonte = ImageFont.truetype(F_BLACK, tam)
    while d.textlength(texto, font=fonte) > W * (0.74 if estrelas else 0.86):
        tam -= 4
        fonte = ImageFont.truetype(F_BLACK, tam)
    tw = d.textlength(texto, font=fonte)
    x, y = (W - tw) / 2, H / 2
    for dx in range(-6 * SS, 6 * SS + 1, 2 * SS):
        for dy in range(-6 * SS, 6 * SS + 1, 2 * SS):
            d.text((x + dx, y + dy), texto, font=fonte, fill=contorno, anchor="lm")
    d.text((x, y), texto, font=fonte, fill=cor_texto, anchor="lm")
    if estrelas:
        for cx in (W * 0.07, W * 0.93):
            r1, r2 = H * 0.2, H * 0.085
            pts = [(cx + (r1 if k % 2 == 0 else r2) * math.sin(math.pi * k / 5),
                    H / 2 - (r1 if k % 2 == 0 else r2) * math.cos(math.pi * k / 5)) for k in range(10)]
            d.polygon(pts, fill=(255, 214, 60), outline=contorno)
    img = img.resize((larg, alt), Image.LANCZOS)
    img.save(os.path.join(PASTA, nome + ".png"))


lava()
letreiro("bilheteria", "BILHETERIA", (255, 214, 60), (240, 96, 40), (232, 64, 120))
letreiro("bate_bate", "BATE-BATE", (60, 140, 235), (255, 214, 60), (255, 255, 255), estrelas=True)
letreiro("dragao", "DRAGÃO", (120, 60, 200), (255, 150, 40), (255, 214, 60), estrelas=True)
letreiro("loopings", "LOOPINGS", (30, 90, 200), (255, 255, 255), (255, 214, 60), estrelas=True)
letreiro("toboagua", "TOBOÁGUA", (40, 190, 210), (255, 140, 50), (255, 255, 255), estrelas=True)
letreiro("trenzinho", "TRENZINHO", (240, 70, 80), (255, 214, 60), (255, 255, 255))
letreiro("carrossel", "CARROSSEL", (250, 120, 180), (255, 214, 60), (255, 255, 255), estrelas=True)
letreiro("torre", "QUEDA LIVRE", (110, 60, 200), (70, 226, 255), (255, 255, 255))
letreiro("viking", "VIKING", (200, 50, 60), (255, 214, 60), (255, 255, 255), estrelas=True)
letreiro("xicaras", "XÍCARAS", (170, 120, 240), (255, 180, 210), (255, 255, 255), estrelas=True)
print("estampas em", PASTA)
