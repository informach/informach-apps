"""Estampas dos prédios futuristas (telas e letreiros), desenhadas com PIL.

Uso: python3 -I morada-art/predios_futuristas_estampas.py SP/cidade_out/predios_futuristas/estampas
Grava PNG que o gerador (predios_futuristas.py) carrega com mb.material_estampa. Palavras genéricas, sem marca.
"""
import math
import os
import random
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
FONTE = "/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf"
if not os.path.exists(FONTE):
    FONTE = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

FUNDO = (14, 18, 40)
MAGENTA = (255, 70, 200)
LILAS = (190, 140, 255)
CIANO = (70, 235, 255)
AMARELO = (255, 220, 90)
BRANCO = (245, 250, 255)


def brilho(img, raio=6, forca=1.6):
    """Halo de neon: soma a imagem borrada por cima dela mesma."""
    b = img.filter(ImageFilter.GaussianBlur(raio))
    px_a, px_b = img.load(), b.load()
    out = Image.new("RGB", img.size)
    po = out.load()
    for y in range(img.size[1]):
        for x in range(img.size[0]):
            a, c = px_a[x, y], px_b[x, y]
            po[x, y] = tuple(min(255, int(a[k] + c[k] * forca)) for k in range(3))
    return out


def salva_letreiro(nome, texto, cor, w=512, h=128, borda=None):
    luz = Image.new("RGB", (w, h), (0, 0, 0))
    d = ImageDraw.Draw(luz)
    tam = int(h * 0.62)
    f = ImageFont.truetype(FONTE, tam)
    while d.textlength(texto, font=f) > w * 0.84 and tam > 10:
        tam -= 2
        f = ImageFont.truetype(FONTE, tam)
    tw = d.textlength(texto, font=f)
    bb = d.textbbox((0, 0), texto, font=f)
    th = bb[3] - bb[1]
    d.text(((w - tw) / 2, (h - th) / 2 - bb[1]), texto, font=f, fill=cor)
    if borda:
        d.rounded_rectangle((8, 8, w - 9, h - 9), radius=h // 5, outline=borda, width=max(3, h // 26))
    luz = brilho(luz, raio=max(3, h // 22), forca=1.2)
    base = Image.new("RGB", (w, h), FUNDO)
    out = Image.composite(luz, base, luz.convert("L").point(lambda v: 255 if v > 18 else int(v * 14)))
    out.save(os.path.join(OUT, nome + ".png"))


def tela_ondas(nome, c1, c2, c3, s=256):
    img = Image.new("RGB", (s, s), (0, 0, 0))
    d = ImageDraw.Draw(img)
    for k, (cor, fase, amp) in enumerate(((c1, 0.0, 26), (c2, 1.4, 20), (c3, 2.6, 32))):
        pts = [(x, s * (0.3 + 0.2 * k) + amp * math.sin(x / s * 2 * math.pi * 1.5 + fase)) for x in range(0, s + 1, 4)]
        d.line(pts, fill=cor, width=9, joint="curve")
    for k in range(18):  # pontinhos (estrelas)
        r = random.Random(k)
        x, y = r.randrange(s), r.randrange(s)
        d.ellipse((x - 2, y - 2, x + 2, y + 2), fill=BRANCO)
    img = brilho(img, 7, 1.1)
    base = Image.new("RGB", (s, s), FUNDO)
    out = Image.composite(img, base, img.convert("L").point(lambda v: 255 if v > 16 else v * 15))
    ImageDraw.Draw(out).rectangle((0, 0, s - 1, s - 1), outline=(60, 70, 120), width=6)
    out.save(os.path.join(OUT, nome + ".png"))


def tela_pixel(nome, s=256):
    """Tela de jogo: um coração e um foguetinho em pixel art, com placar de quadradinhos."""
    n = 16
    c = s // n
    img = Image.new("RGB", (s, s), FUNDO)
    d = ImageDraw.Draw(img)
    coracao = ["0110110", "1111111", "1111111", "0111110", "0011100", "0001000"]
    for j, lin in enumerate(coracao):
        for i, ch in enumerate(lin):
            if ch == "1":
                d.rectangle((c * (2 + i), c * (3 + j), c * (3 + i) - 2, c * (4 + j) - 2), fill=MAGENTA)
    nave = ["00100", "01110", "01110", "11111", "10101"]
    for j, lin in enumerate(nave):
        for i, ch in enumerate(lin):
            if ch == "1":
                d.rectangle((c * (10 + i), c * (7 + j), c * (11 + i) - 2, c * (8 + j) - 2), fill=CIANO)
    for i in range(12):
        cor = (AMARELO, LILAS, CIANO)[i % 3]
        d.rectangle((c * (2 + i), c * 13, c * (3 + i) - 3, c * 14 - 3), fill=cor)
    img = brilho(img, 5, 0.6)
    ImageDraw.Draw(img).rectangle((0, 0, s - 1, s - 1), outline=(60, 70, 120), width=6)
    img.save(os.path.join(OUT, nome + ".png"))


def tela_barras(nome, s=256):
    """Equalizador de música: barras do magenta ao ciano."""
    img = Image.new("RGB", (s, s), (0, 0, 0))
    d = ImageDraw.Draw(img)
    n = 10
    w = s / n
    r = random.Random(7)
    for i in range(n):
        h = int(s * (0.25 + 0.6 * abs(math.sin(i * 0.9 + 0.4))))
        t = i / (n - 1)
        cor = tuple(int(MAGENTA[k] * (1 - t) + CIANO[k] * t) for k in range(3))
        for y in range(s - 20, s - 20 - h, -14):
            d.rectangle((i * w + 5, y - 10, (i + 1) * w - 5, y), fill=cor)
    img = brilho(img, 6, 1.0)
    base = Image.new("RGB", (s, s), FUNDO)
    out = Image.composite(img, base, img.convert("L").point(lambda v: 255 if v > 16 else v * 15))
    ImageDraw.Draw(out).rectangle((0, 0, s - 1, s - 1), outline=(60, 70, 120), width=6)
    out.save(os.path.join(OUT, nome + ".png"))


def tela_planeta(nome, s=256):
    img = Image.new("RGB", (s, s), (0, 0, 0))
    d = ImageDraw.Draw(img)
    cx, cy, r = s * 0.52, s * 0.5, s * 0.24
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(150, 90, 230))
    d.ellipse((cx - r * 0.7, cy - r * 0.6, cx - r * 0.2, cy - r * 0.2), fill=(185, 140, 245))
    d.ellipse((cx - r * 1.9, cy - r * 0.45, cx + r * 1.9, cy + r * 0.45), outline=CIANO, width=8)
    for k in range(26):
        q = random.Random(100 + k)
        x, y = q.randrange(s), q.randrange(s)
        rr = q.choice((1, 2, 2, 3))
        d.ellipse((x - rr, y - rr, x + rr, y + rr), fill=BRANCO)
    img = brilho(img, 6, 0.35)
    base = Image.new("RGB", (s, s), FUNDO)
    out = Image.composite(img, base, img.convert("L").point(lambda v: 255 if v > 16 else v * 15))
    ImageDraw.Draw(out).rectangle((0, 0, s - 1, s - 1), outline=(60, 70, 120), width=6)
    out.save(os.path.join(OUT, nome + ".png"))


def colmeia(nome, s=256):
    """Painel de LED em favos (para a fachada do prédio colmeia): hexágonos laranja e magenta."""
    img = Image.new("RGB", (s, s), (0, 0, 0))
    d = ImageDraw.Draw(img)
    R = s / 10
    hgt = R * math.sqrt(3)
    j = 0
    y = 0
    while y < s + hgt:
        x0 = 0 if j % 2 == 0 else 1.5 * R
        x = x0 - 3 * R
        while x < s + 3 * R:
            q = random.Random(int(x * 13 + y * 7))
            cor = q.choice(((255, 150, 60), (255, 120, 70), (255, 90, 170), (255, 190, 90)))
            pts = [(x + R * 0.86 * math.cos(math.radians(60 * k)), y + R * 0.86 * math.sin(math.radians(60 * k)))
                   for k in range(6)]
            d.polygon(pts, fill=cor)
            x += 3 * R
        y += hgt / 2
        j += 1
    img = brilho(img, 4, 0.5)
    img.save(os.path.join(OUT, nome + ".png"))


def xadrez(nome, s=256, n=8):
    img = Image.new("RGB", (s * 2, s // 2), (250, 250, 250))
    d = ImageDraw.Draw(img)
    c = (s // 2) // 2
    for i in range(2 * s // c):
        for j in range(2):
            if (i + j) % 2:
                d.rectangle((i * c, j * c, (i + 1) * c - 1, (j + 1) * c - 1), fill=(30, 33, 45))
    img.save(os.path.join(OUT, nome + ".png"))


def ondas_fachada(nome, w=512, h=128):
    """Faixa decorativa branca e azul em ondas (base do prédio de telas)."""
    img = Image.new("RGB", (w, h), (247, 247, 244))
    d = ImageDraw.Draw(img)
    for k, (cor, off) in enumerate((((48, 135, 224), 0.30), ((38, 100, 196), 0.62))):
        pts = [(x, h * off + 14 * math.sin(x / w * 2 * math.pi * 2 + k)) for x in range(0, w + 1, 4)]
        poly = pts + [(x, y + 18) for x, y in pts[::-1]]
        d.polygon(poly, fill=cor)
    img.save(os.path.join(OUT, nome + ".png"))


if __name__ == "__main__":
    salva_letreiro("let_boate", "BOATE", MAGENTA, borda=CIANO)
    salva_letreiro("let_bemvindo", "BEM-VINDO", MAGENTA, w=1024, h=128)
    salva_letreiro("let_danca", "DANÇA", (170, 110, 255), borda=MAGENTA)
    salva_letreiro("let_fliperama", "FLIPERAMA", CIANO, borda=MAGENTA)
    salva_letreiro("let_clube_vr", "CLUBE VR", CIANO, borda=LILAS)
    salva_letreiro("let_cyber", "CYBER LOJA", MAGENTA, borda=CIANO)
    salva_letreiro("let_hotel", "HOTEL", AMARELO, w=512, h=128)
    salva_letreiro("let_cafe", "CAFÉ", CIANO, borda=MAGENTA)
    salva_letreiro("let_jogos", "JOGOS", AMARELO, borda=MAGENTA)
    salva_letreiro("let_loja", "LOJA", LILAS, borda=CIANO)
    salva_letreiro("let_academia", "ACADEMIA", CIANO)
    tela_ondas("tela_ondas", MAGENTA, CIANO, LILAS)
    tela_ondas("tela_ondas2", CIANO, AMARELO, MAGENTA)
    tela_pixel("tela_pixel")
    tela_barras("tela_barras")
    tela_planeta("tela_planeta")
    colmeia("tela_colmeia")
    xadrez("xadrez")
    ondas_fachada("ondas_fachada")
    print("estampas em", OUT)
