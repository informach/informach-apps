"""Estampas dos letreiros dos prédios regulares (um atlas só): palavras genéricas em português e cartazes simples.

Uso: python3 -I morada-art/predios_regulares_estampas.py SP/cidade_out
Grava SP/cidade_out/predios_regulares/estampas/letreiros.png e letreiros.json ({nome: [u0, v0, u1, v1]}, UV do glTF/
Blender com v para cima). Cada célula é preenchida inteira pela cor de fundo do letreiro (as laterais da placa usam um
ponto da margem da célula).
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

SAIDA = sys.argv[1]
PASTA = os.path.join(SAIDA, "predios_regulares", "estampas")
os.makedirs(PASTA, exist_ok=True)
FONTE = "/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf"
FONTE_B = "/usr/share/fonts/opentype/inter/Inter-Black.otf"
W = H = 2048
LIN = 128  # altura de uma linha do atlas

# nome: (texto, linhas de altura, aspecto largura/altura, fundo, letra, borda, vertical?)
LETREIROS = {
    "empresarial": ("CENTRO\nEMPRESARIAL", 2, 3.2, "#20408F", "#F7F7F4", "#90CBF5", False),
    "hotel_v": ("HOTEL", 4, 0.30, "#1D2C56", "#FFD340", "#E5484D", True),
    "hotel": ("HOTEL", 1, 3.6, "#1D2C56", "#FFD340", "#E5484D", False),
    "cinema": ("CINEMA", 1, 4.4, "#B7323A", "#FFE89C", "#FFD340", False),
    "cine_v": ("CINE", 4, 0.34, "#FFD340", "#B7323A", "#E5484D", True),
    "boliche": ("BOLICHE", 1, 4.6, "#1D2C56", "#F7B7C9", "#F27FA2", False),
    "musica": ("MÚSICA", 1, 4.0, "#583725", "#FFE89C", "#E8B53B", False),
    "padaria": ("PADARIA", 1, 4.6, "#F5E5BC", "#9B4530", "#C9613F", False),
    "cafe": ("CAFÉ", 1, 3.0, "#155F6E", "#FBF2DC", "#5DCFB1", False),
    "farmacia": ("FARMÁCIA", 1, 5.0, "#F7F7F4", "#2F9A56", "#4EB35F", False),
    "mercado": ("MERCADO", 1, 5.0, "#E5484D", "#F7F7F4", "#FFD340", False),
    "flores": ("FLORES", 1, 4.0, "#FBD3DD", "#DC4F84", "#F27FA2", False),
    "livraria": ("LIVRARIA", 1, 5.0, "#20408F", "#FFE89C", "#90CBF5", False),
    "sorvetes": ("SORVETES", 1, 5.0, "#AAE5CA", "#C83D8E", "#F7B7C9", False),
    "lanches": ("LANCHES", 1, 4.6, "#F98B37", "#F7F7F4", "#FFD340", False),
    "bazar": ("BAZAR", 1, 3.6, "#5C3BA3", "#FFE89C", "#BAA1EB", False),
    "pizza": ("PIZZA", 1, 3.6, "#1E7A4B", "#F7F7F4", "#E5484D", False),
    "ingressos": ("INGRESSOS", 1, 5.4, "#1D2C56", "#FFD340", "#FFD340", False),
}
CARTAZES = ["cartaz_estrela", "cartaz_foguete", "cartaz_coracao", "cartaz_dino"]


def caixa_texto(dr, texto, fonte_arq, larg, alt):
    """Maior tamanho de fonte em que o texto cabe em larg × alt."""
    tam = int(alt)
    while tam > 6:
        f = ImageFont.truetype(fonte_arq, tam)
        bb = dr.multiline_textbbox((0, 0), texto, font=f, spacing=int(tam * 0.12), align="center")
        if bb[2] - bb[0] <= larg and bb[3] - bb[1] <= alt:
            return f, bb
        tam -= 2
    f = ImageFont.truetype(fonte_arq, tam)
    return f, dr.multiline_textbbox((0, 0), texto, font=f)


def desenha_letreiro(img, x, y, w, h, texto, fundo, letra, borda, vertical):
    dr = ImageDraw.Draw(img)
    dr.rectangle([x, y, x + w - 1, y + h - 1], fill=fundo)
    m = max(4, int(min(w, h) * 0.07))
    dr.rounded_rectangle([x + m, y + m, x + w - 1 - m, y + h - 1 - m], radius=int(min(w, h) * 0.14), outline=borda,
                         width=max(3, int(min(w, h) * 0.04)))
    if vertical:
        letras = list(texto)
        n = len(letras)
        ch = (h - 4 * m) / n
        for k, c in enumerate(letras):
            f, bb = caixa_texto(dr, c, FONTE_B, w - 4 * m, ch * 0.86)
            cx = x + w / 2 - (bb[0] + bb[2]) / 2
            cy = y + 2 * m + ch * (k + 0.5) - (bb[1] + bb[3]) / 2
            dr.text((cx, cy), c, font=f, fill=letra)
        return
    f, bb = caixa_texto(dr, texto, FONTE_B if "\n" not in texto else FONTE, w - 5 * m, h - 4.2 * m)
    cx = x + w / 2 - (bb[0] + bb[2]) / 2
    cy = y + h / 2 - (bb[1] + bb[3]) / 2
    sp = int(f.size * 0.12)
    dr.multiline_text((cx + max(2, f.size * 0.04), cy + max(2, f.size * 0.05)), texto, font=f, fill=borda,
                      spacing=sp, align="center")  # sombra colorida (letra "gorda", estilo fofo)
    dr.multiline_text((cx, cy), texto, font=f, fill=letra, spacing=sp, align="center")


def desenha_cartaz(img, x, y, w, h, tipo):
    """Cartazes de filme genéricos: fundo em degradê, uma figura simples, sem texto."""
    dr = ImageDraw.Draw(img)
    cores = {"cartaz_estrela": ("#20408F", "#8B5DD6", "#FFD340"), "cartaz_foguete": ("#1D2C56", "#2CB7C2", "#F7F7F4"),
             "cartaz_coracao": ("#DC4F84", "#F98B37", "#FBD3DD"), "cartaz_dino": ("#1E7A4B", "#8FD07B", "#FFE89C")}
    a, b, c = cores[tipo]
    ca = tuple(int(a[i:i + 2], 16) for i in (1, 3, 5))
    cb = tuple(int(b[i:i + 2], 16) for i in (1, 3, 5))
    for j in range(h):
        t = j / max(1, h - 1)
        dr.line([(x, y + j), (x + w - 1, y + j)], fill=tuple(int(ca[k] * (1 - t) + cb[k] * t) for k in range(3)))
    cx, cy, r = x + w / 2, y + h * 0.42, w * 0.3
    if tipo == "cartaz_estrela":
        import math
        pts = []
        for k in range(10):
            rr = r if k % 2 == 0 else r * 0.45
            an = -math.pi / 2 + k * math.pi / 5
            pts.append((cx + rr * math.cos(an), cy + rr * math.sin(an)))
        dr.polygon(pts, fill=c)
    elif tipo == "cartaz_foguete":
        dr.ellipse([cx - r * 0.35, cy - r, cx + r * 0.35, cy + r * 0.7], fill=c)
        dr.polygon([(cx - r * 0.35, cy + r * 0.3), (cx - r * 0.7, cy + r), (cx - r * 0.2, cy + r * 0.6)], fill="#E5484D")
        dr.polygon([(cx + r * 0.35, cy + r * 0.3), (cx + r * 0.7, cy + r), (cx + r * 0.2, cy + r * 0.6)], fill="#E5484D")
        dr.ellipse([cx - r * 0.15, cy - r * 0.4, cx + r * 0.15, cy - r * 0.1], fill="#2CB7C2")
        dr.polygon([(cx - r * 0.2, cy + r * 0.7), (cx + r * 0.2, cy + r * 0.7), (cx, cy + r * 1.2)], fill="#FFD340")
    elif tipo == "cartaz_coracao":
        dr.ellipse([cx - r, cy - r * 0.6, cx, cy + r * 0.4], fill=c)
        dr.ellipse([cx, cy - r * 0.6, cx + r, cy + r * 0.4], fill=c)
        dr.polygon([(cx - r * 0.97, cy), (cx + r * 0.97, cy), (cx, cy + r * 1.1)], fill=c)
    else:
        dr.ellipse([cx - r, cy - r * 0.3, cx + r * 0.6, cy + r * 0.6], fill=c)
        dr.rectangle([cx + r * 0.2, cy - r * 0.9, cx + r * 0.6, cy], fill=c)
        dr.ellipse([cx + r * 0.1, cy - r * 1.2, cx + r * 0.9, cy - r * 0.6], fill=c)
        dr.rectangle([cx - r * 0.7, cy + r * 0.5, cx - r * 0.4, cy + r], fill=c)
        dr.rectangle([cx + r * 0.1, cy + r * 0.5, cx + r * 0.4, cy + r], fill=c)
    for k in range(3):  # "linhas de texto" genéricas
        yy = y + h * (0.78 + k * 0.06)
        dr.rounded_rectangle([x + w * 0.2, yy, x + w * (0.8 - 0.15 * k), yy + h * 0.025], radius=3, fill=c)
    dr.rectangle([x, y, x + w - 1, y + h - 1], outline="#F7F7F4", width=max(4, w // 40))


def main():
    img = Image.new("RGB", (W, H), "#2C313A")
    itens = [(n, d[1] * LIN, int(d[1] * LIN * d[2])) for n, d in LETREIROS.items()]
    itens += [(n, 3 * LIN, int(3 * LIN * 0.68)) for n in CARTAZES]
    itens.sort(key=lambda t: -t[1])
    uv = {}
    x = y = 0
    alt_linha = 0
    for nome, h, w in itens:
        if x + w > W:
            x, y = 0, y + alt_linha + 8
            alt_linha = 0
        if nome in LETREIROS:
            t, _, _, fundo, letra, borda, vert = LETREIROS[nome]
            desenha_letreiro(img, x, y, w, h, t, fundo, letra, borda, vert)
        else:
            desenha_cartaz(img, x, y, w, h, nome)
        # UV (v para cima), com meio pixel de folga; "lado" = ponto da margem da célula
        uv[nome] = {"rect": [(x + 0.5) / W, 1 - (y + h - 0.5) / H, (x + w - 0.5) / W, 1 - (y + 0.5) / H],
                    "lado": [(x + 2.5) / W, 1 - (y + 2.5) / H], "aspecto": w / h}
        x += w + 8
        alt_linha = max(alt_linha, h)
    assert y + alt_linha <= H, "atlas cheio"
    img.save(os.path.join(PASTA, "letreiros.png"))
    json.dump(uv, open(os.path.join(PASTA, "letreiros.json"), "w"), indent=1)
    print("estampas", len(uv), "altura usada", y + alt_linha)


main()
