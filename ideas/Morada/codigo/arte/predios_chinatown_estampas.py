"""Estampas dos letreiros de Chinatown (prédios da cidade do Morada), desenhadas com PIL.

Uso: python3 -I predios_chinatown_estampas.py <pasta_saida>
Grava <pasta>/<nome>.png para cada letreiro: placas horizontais (texto numa linha) e verticais (letras empilhadas, como
as tabuletas de Chinatown). Palavras genéricas em português, sem marca. As cores vêm da paleta de moveis_base.py (lida
como texto, sem importar o Blender).
"""
import ast
import os
import sys

from PIL import Image, ImageDraw, ImageFont

AQUI = os.path.dirname(os.path.abspath(__file__))
SS = 3
FONTE = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"


def _paleta():
    arv = ast.parse(open(os.path.join(AQUI, "moveis_base.py"), encoding="utf-8").read())
    for no in arv.body:
        if isinstance(no, ast.Assign) and getattr(no.targets[0], "id", "") == "CORES":
            return ast.literal_eval(no.value)
    raise RuntimeError("CORES")


CORES = _paleta()


def c(nome):
    h = CORES[nome].lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


# nome: (texto, vertical, fundo, letra, borda)
LETREIROS = {
    "sushi": ("SUSHI", False, "vermelho_escuro", "amarelo_claro", "ouro"),
    "cha": ("CHÁ", False, "verde_floresta", "amarelo_claro", "ouro"),
    "macarrao": ("MACARRÃO", False, "vermelho", "branco", "ouro"),
    "loja": ("LOJA", False, "vermelho_escuro", "amarelo", "ouro"),
    "doces": ("DOCES", False, "rosa_escuro", "branco", "ouro"),
    "mercado": ("MERCADO", False, "verde_floresta", "amarelo", "ouro"),
    "pastel": ("PASTEL", False, "laranja_escuro", "branco", "ouro"),
    "restaurante": ("RESTAURANTE", False, "vermelho_escuro", "amarelo_claro", "ouro"),
    "bem_vindo": ("BEM-VINDO", False, "vermelho_escuro", "amarelo", "ouro"),
    "templo": ("TEMPLO", False, "azul_marinho", "amarelo", "ouro"),
    "hotel": ("HOTEL", False, "vermelho_escuro", "amarelo", "ouro"),
    "hotel_v": ("HOTEL", True, "vermelho_escuro", "amarelo", "ouro"),
    "cha_v": ("CHÁ", True, "verde_floresta", "amarelo_claro", "ouro"),
    "loja_v": ("LOJA", True, "vermelho", "amarelo_claro", "ouro"),
    "sushi_v": ("SUSHI", True, "azul_marinho", "branco", "ouro"),
    "ervas_v": ("ERVAS", True, "verde_floresta", "amarelo", "ouro"),
    "flores_v": ("FLORES", True, "magenta", "branco", "ouro"),
    "bar_v": ("BAR", True, "roxo_escuro", "amarelo_claro", "ouro"),
}


def desenha(texto, vertical, fundo, letra, borda):
    n = len(texto)
    if vertical:
        W, H = 160 * SS, 160 * SS * max(3, n) // 1
        W, H = 192 * SS, int(192 * SS * (0.95 * n + 0.5))
    else:
        W = int(150 * SS * (0.72 * n + 0.9))
        H = 192 * SS
    im = Image.new("RGB", (W, H), c(borda))
    d = ImageDraw.Draw(im)
    e = int(min(W, H) * 0.07)
    d.rounded_rectangle([e, e, W - e, H - e], int(min(W, H) * 0.08), fill=c(fundo))
    e2 = int(min(W, H) * 0.13)
    d.rounded_rectangle([e2, e2, W - e2, H - e2], int(min(W, H) * 0.05), outline=c(borda), width=max(2, SS * 2))
    if vertical:
        passo = (H - 2 * e2) / n
        f = ImageFont.truetype(FONTE, int(min(passo * 0.78, W * 0.62)))
        for k, ch in enumerate(texto):
            y = e2 + passo * (k + 0.5)
            d.text((W / 2 + SS * 3, y + SS * 3), ch, font=f, fill=c("preto"), anchor="mm")
            d.text((W / 2, y), ch, font=f, fill=c(letra), anchor="mm")
    else:
        alt = H * 0.5
        f = ImageFont.truetype(FONTE, int(alt))
        while f.getlength(texto) > W - 2.6 * e2:
            alt *= 0.94
            f = ImageFont.truetype(FONTE, int(alt))
        d.text((W / 2 + SS * 3, H / 2 + SS * 3), texto, font=f, fill=c("preto"), anchor="mm")
        d.text((W / 2, H / 2), texto, font=f, fill=c(letra), anchor="mm")
    return im.resize((W // SS, H // SS), Image.LANCZOS)


if __name__ == "__main__":
    pasta = sys.argv[1]
    os.makedirs(pasta, exist_ok=True)
    for nome, (t, v, fu, le, bo) in LETREIROS.items():
        im = desenha(t, v, fu, le, bo)
        im.save(os.path.join(pasta, nome + ".png"))
        print(nome, im.size)
