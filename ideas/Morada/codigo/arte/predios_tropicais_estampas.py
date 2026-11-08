"""Estampas dos letreiros dos prédios tropicais (placas de fachada com palavras genéricas), desenhadas com PIL.

Uso: python3 -I predios_tropicais_estampas.py <pasta_saida>
Grava <pasta_saida>/<chave>.png (512 × 128). O gerador liga a textura também na emissão, então a placa brilha à
noite. Só palavras genéricas em português, nada de marca.
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

# chave: (texto, fundo, borda, letra)
ESTAMPAS = {
    "pousada": ("POUSADA", (32, 64, 143), (144, 224, 224), (255, 232, 156)),
    "pousada_rosa": ("POUSADA", (111, 48, 108), (251, 211, 221), (255, 240, 200)),
    "hotel": ("HOTEL", (92, 59, 163), (227, 213, 247), (255, 240, 200)),
    "hotel_azul": ("HOTEL", (21, 95, 110), (144, 224, 224), (255, 232, 156)),
    "hotel_rosa": ("HOTEL", (183, 50, 90), (251, 211, 221), (255, 247, 235)),
    "hotel_laranja": ("HOTEL", (155, 69, 48), (255, 186, 116), (255, 240, 200)),
    "cafe": ("CAFÉ", (21, 95, 110), (144, 224, 224), (255, 211, 64)),
    "cinema": ("CINEMA", (183, 50, 58), (255, 211, 64), (255, 247, 220)),
    "sucos": ("SUCOS", (224, 105, 31), (255, 232, 156), (255, 255, 240)),
    "praia": ("PRAIA", (23, 138, 153), (255, 232, 156), (255, 255, 240)),
}
FONTES = ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
          "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf")


def fonte(tam):
    for f in FONTES:
        if os.path.exists(f):
            return ImageFont.truetype(f, tam)
    return ImageFont.load_default()


def desenha(chave, pasta, W=512, H=128):
    texto, fundo, borda, letra = ESTAMPAS[chave]
    im = Image.new("RGB", (W, H), borda)
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((7, 7, W - 8, H - 8), radius=30, fill=fundo)
    d.rounded_rectangle((15, 15, W - 16, H - 16), radius=24, outline=borda, width=3)
    tam = 90
    while tam > 20:
        f = fonte(tam)
        x0, y0, x1, y1 = d.textbbox((0, 0), texto, font=f)
        if x1 - x0 <= W - 70 and y1 - y0 <= H - 46:
            break
        tam -= 2
    x0, y0, x1, y1 = d.textbbox((0, 0), texto, font=f)
    px, py = (W - (x1 - x0)) / 2 - x0, (H - (y1 - y0)) / 2 - y0
    sombra = tuple(max(0, c - 60) for c in fundo)
    d.text((px + 3, py + 4), texto, font=f, fill=sombra)
    d.text((px, py), texto, font=f, fill=letra)
    for cx in (34, W - 34):  # dois "parafusos" de enfeite
        d.ellipse((cx - 6, H / 2 - 6, cx + 6, H / 2 + 6), fill=borda)
    im.save(os.path.join(pasta, chave + ".png"))


if __name__ == "__main__":
    pasta = sys.argv[1]
    os.makedirs(pasta, exist_ok=True)
    for k in ESTAMPAS:
        desenha(k, pasta)
    print("estampas", len(ESTAMPAS), pasta)
