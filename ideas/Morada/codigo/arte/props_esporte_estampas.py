"""Estampas (PNG) da categoria props_esporte: a tela do placar eletrônico (4 quadros lado a lado em U, para a
animação "trocar") e a faixa do topo do placar. Textos genéricos em português, sem marcas.

Uso: python3 -I morada-art/props_esporte_estampas.py SP/cidade_out
(o gerador cidade_props_esporte.py chama desenha_tudo() quando falta algum PNG).
Grava em SP/cidade_out/props_esporte/estampas/.
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

F_BLACK = "/usr/share/fonts/opentype/inter/Inter-Black.otf"
F_XBOLD = "/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf"

FUNDO = (14, 18, 28)
APAGADO = (40, 30, 30)
AMBAR = (255, 176, 40)
VERMELHO = (255, 70, 60)
VERDE = (90, 255, 140)
BRANCO = (245, 245, 240)
CIANO = (80, 225, 255)


def fonte(tam, f=F_BLACK):
    try:
        return ImageFont.truetype(f, tam)
    except OSError:
        return ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", tam)


def texto_centro(dr, cx, cy, txt, f, cor):
    bb = dr.textbbox((0, 0), txt, font=f)
    w, h = bb[2] - bb[0], bb[3] - bb[1]
    dr.text((cx - w / 2 - bb[0], cy - h / 2 - bb[1]), txt, font=f, fill=cor)


# dígito de 7 segmentos (a, b, c, d, e, f, g)
SEG = {"0": "abcdef", "1": "bc", "2": "abged", "3": "abgcd", "4": "fgbc", "5": "afgcd", "6": "afgedc", "7": "abc",
       "8": "abcdefg", "9": "abcdfg"}


def digito(dr, x, y, w, h, ch, cor, apagado=APAGADO):
    """Dígito de LED de 7 segmentos com os segmentos apagados em tom escuro (como num placar de verdade)."""
    e = w * 0.24
    m = h / 2
    segs = {
        "a": [(x + e * 0.6, y), (x + w - e * 0.6, y), (x + w - e * 1.4, y + e), (x + e * 1.4, y + e)],
        "d": [(x + e * 1.4, y + h - e), (x + w - e * 1.4, y + h - e), (x + w - e * 0.6, y + h), (x + e * 0.6, y + h)],
        "g": [(x + e * 0.8, y + m), (x + e * 1.4, y + m - e / 2), (x + w - e * 1.4, y + m - e / 2), (x + w - e * 0.8, y + m),
              (x + w - e * 1.4, y + m + e / 2), (x + e * 1.4, y + m + e / 2)],
        "f": [(x, y + e * 0.6), (x + e, y + e * 1.4), (x + e, y + m - e * 0.7), (x, y + m - e * 0.2)],
        "b": [(x + w, y + e * 0.6), (x + w, y + m - e * 0.2), (x + w - e, y + m - e * 0.7), (x + w - e, y + e * 1.4)],
        "e": [(x, y + m + e * 0.2), (x + e, y + m + e * 0.7), (x + e, y + h - e * 1.4), (x, y + h - e * 0.6)],
        "c": [(x + w, y + m + e * 0.2), (x + w, y + h - e * 0.6), (x + w - e, y + h - e * 1.4), (x + w - e, y + m + e * 0.7)],
    }
    acesos = SEG.get(ch, "")
    for k, pts in segs.items():
        dr.polygon(pts, fill=cor if k in acesos else apagado)


def numero(dr, cx, y, w, h, txt, cor, gap=0.25):
    larg = [w * 0.45 if ch == ":" else w for ch in txt]
    total = sum(larg) + (len(txt) - 1) * w * gap
    x = cx - total / 2
    for ch, lw in zip(txt, larg):
        if ch == ":":
            r = w * 0.13
            for yy in (y + h * 0.32, y + h * 0.68):
                dr.ellipse((x + lw / 2 - r, yy - r, x + lw / 2 + r, yy + r), fill=cor)
        else:
            digito(dr, x, y, w, h, ch, cor)
        x += lw + w * gap


def quadro_placar(dr, x0, W, H, casa, visita, tempo, periodo):
    # moldura interna
    dr.rounded_rectangle((x0 + 8, 8, x0 + W - 8, H - 8), radius=18, outline=(60, 70, 90), width=4, fill=FUNDO)
    f_rot = fonte(int(H * 0.105))
    texto_centro(dr, x0 + W * 0.2, H * 0.14, "CASA", f_rot, AMBAR)
    texto_centro(dr, x0 + W * 0.8, H * 0.14, "VISITA", f_rot, AMBAR)
    texto_centro(dr, x0 + W * 0.5, H * 0.14, "TEMPO", f_rot, CIANO)
    # placar grande
    dw, dh = W * 0.15, H * 0.5
    numero(dr, x0 + W * 0.2, H * 0.27, dw, dh, casa, VERMELHO)
    numero(dr, x0 + W * 0.8, H * 0.27, dw, dh, visita, VERMELHO)
    # relógio
    numero(dr, x0 + W * 0.5, H * 0.3, W * 0.05, H * 0.22, tempo, VERDE, gap=0.22)
    # período e bolinhas de falta
    texto_centro(dr, x0 + W * 0.5, H * 0.66, periodo, fonte(int(H * 0.085), F_XBOLD), BRANCO)
    for k in range(5):
        cx = x0 + W * (0.4 + 0.05 * k)
        cor = AMBAR if k < 2 else APAGADO
        dr.ellipse((cx - 9, H * 0.83 - 9, cx + 9, H * 0.83 + 9), fill=cor)


def desenha_placar(caminho):
    W, H = 512, 256
    quadros = [("0", "0", "00:00", "1º TEMPO"), ("1", "0", "12:34", "1º TEMPO"), ("1", "1", "27:10", "2º TEMPO"),
               ("2", "1", "44:59", "2º TEMPO")]
    im = Image.new("RGB", (W * len(quadros), H), FUNDO)
    dr = ImageDraw.Draw(im)
    for k, (c, v, t, p) in enumerate(quadros):
        quadro_placar(dr, W * k, W, H, c, v, t, p)
    im.save(caminho)


def desenha_faixa_placar(caminho):
    W, H = 1024, 160
    im = Image.new("RGB", (W, H), (32, 64, 143))
    dr = ImageDraw.Draw(im)
    dr.rectangle((0, H - 22, W, H), fill=(255, 211, 64))
    dr.rectangle((0, 0, W, 14), fill=(255, 211, 64))
    texto_centro(dr, W / 2, H * 0.47, "PLACAR", fonte(96), (247, 247, 244))
    for cx in (110, W - 110):  # bolas estilizadas nas pontas
        dr.ellipse((cx - 46, H * 0.47 - 46, cx + 46, H * 0.47 + 46), fill=(247, 247, 244))
        dr.ellipse((cx - 16, H * 0.47 - 16, cx + 16, H * 0.47 + 16), fill=(30, 33, 39))
        for a in range(5):
            import math
            t = math.radians(-90 + 72 * a)
            px, py = cx + 34 * math.cos(t), H * 0.47 + 34 * math.sin(t)
            dr.ellipse((px - 9, py - 9, px + 9, py + 9), fill=(30, 33, 39))
    im.save(caminho)


def desenha_tudo(pasta):
    os.makedirs(pasta, exist_ok=True)
    desenha_placar(os.path.join(pasta, "placar_tela.png"))
    desenha_faixa_placar(os.path.join(pasta, "placar_faixa.png"))


if __name__ == "__main__":
    desenha_tudo(os.path.join(sys.argv[1], "props_esporte", "estampas"))
