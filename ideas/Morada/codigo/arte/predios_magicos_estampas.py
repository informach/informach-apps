"""Estampas dos prédios mágicos (placas pintadas à mão), desenhadas com PIL.

Uso: python3 -I morada-art/predios_magicos_estampas.py SP/cidade_out
Grava SP/cidade_out/predios_magicos/estampas/<nome>.png. As cores vêm da paleta de moveis_base.py (lida como texto).
Só palavras genéricas em português.
"""
import ast
import os
import sys

from PIL import Image, ImageDraw, ImageFont

AQUI = os.path.dirname(os.path.abspath(__file__))
SS = 4


def _paleta():
    arv = ast.parse(open(os.path.join(AQUI, "moveis_base.py"), encoding="utf-8").read())
    for no in arv.body:
        if isinstance(no, ast.Assign) and getattr(no.targets[0], "id", "") == "CORES":
            return ast.literal_eval(no.value)
    raise RuntimeError("CORES não encontrada")


CORES = _paleta()


def c(nome):
    h = CORES[nome].lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def fonte(tam):
    for f in ("/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"):
        if os.path.exists(f):
            return ImageFont.truetype(f, tam)
    return ImageFont.load_default()


def placa(caminho, texto, fundo, borda, letra, sombra, w=512, h=192, enfeite=None):
    W, H = w * SS, h * SS
    im = Image.new("RGB", (W, H), c(borda))
    d = ImageDraw.Draw(im)
    m = int(H * 0.09)
    d.rounded_rectangle((m, m, W - m, H - m), radius=int(H * 0.22), fill=c(fundo))
    # bolinhas de confeito na moldura
    if enfeite:
        cores = [c(k) for k in enfeite]
        n = 14
        for i in range(n):
            x = int(W * (i + 0.5) / n)
            for y in (m // 2, H - m // 2):
                r = int(m * 0.32)
                d.ellipse((x - r, y - r, x + r, y + r), fill=cores[i % len(cores)])
    f = fonte(int(H * 0.52))
    bb = d.textbbox((0, 0), texto, font=f)
    tx = (W - (bb[2] - bb[0])) // 2 - bb[0]
    ty = (H - (bb[3] - bb[1])) // 2 - bb[1]
    off = int(H * 0.035)
    d.text((tx + off, ty + off), texto, font=f, fill=c(sombra))
    d.text((tx, ty), texto, font=f, fill=c(letra))
    im = im.resize((w, h), Image.LANCZOS)
    im.save(caminho)
    print("estampa", caminho)


if __name__ == "__main__":
    saida = sys.argv[1]
    pasta = os.path.join(saida, "predios_magicos", "estampas")
    os.makedirs(pasta, exist_ok=True)
    placa(os.path.join(pasta, "placa_doces_rosa.png"), "DOCES", "creme_claro", "rosa", "chocolate", "rosa_bebe",
          enfeite=["branco", "amarelo", "turquesa_claro", "verde_lima"])
    placa(os.path.join(pasta, "placa_doces_menta.png"), "DOCES", "creme_claro", "verde_agua", "chocolate", "menta",
          enfeite=["branco", "rosa", "amarelo", "lilas"])
    placa(os.path.join(pasta, "placa_cristais.png"), "CRISTAIS", "lilas_claro", "roxo_escuro", "roxo_escuro", "lilas",
          enfeite=["turquesa_claro", "branco", "rosa_bebe"])
