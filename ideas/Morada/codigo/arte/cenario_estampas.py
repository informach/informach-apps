"""Estampas da categoria "cenario" (letreiros, grafite e telas): um PNG por letreiro.

Uso: python3 -I morada-art/cenario_estampas.py SP/cidade_out
Grava SP/cidade_out/cenario/estampas/<nome>.png. Textos genéricos em português, sem marcas.
"""
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

SAIDA = sys.argv[1]
PASTA = os.path.join(SAIDA, "cenario", "estampas")
os.makedirs(PASTA, exist_ok=True)
F_BLACK = "/usr/share/fonts/opentype/inter/Inter-Black.otf"
F_XBOLD = "/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf"

# nome: (texto, largura, altura em px, fundo, letra, borda, fonte, contorno da letra)
LETREIROS = {
    "policia": ("POLÍCIA", 1024, 256, "#20408F", "#F7F7F4", "#90CBF5", F_BLACK, None),
    "bombeiros": ("BOMBEIROS", 1280, 256, "#B7323A", "#FFD340", "#FFE89C", F_BLACK, "#7D2335"),
    "hospital": ("HOSPITAL", 1280, 256, "#F7F7F4", "#E5484D", "#3087E0", F_BLACK, None),
    "aquario": ("AQUÁRIO", 1024, 256, "#FFD340", "#2664C4", "#F7F7F4", F_BLACK, None),
    "shopping": ("SHOPPING", 1280, 256, "#F7F7F4", "multi", "#F27FA2", F_BLACK, None),
    "lanchonete": ("LANCHONETE", 1280, 256, "#1D2C56", "#FF8FE0", "#FF3FD0", F_BLACK, None),
    "aberto_24h": ("ABERTO 24 HORAS", 1280, 192, "#1D2C56", "#FFE89C", "#44E4FF", F_XBOLD, None),
    "academia": ("ACADEMIA", 1280, 256, "#20408F", "#F7F7F4", "#FFD340", F_BLACK, None),
    "arena": ("ARENA", 1024, 256, "#1D2C56", "#7FEFFF", "#C49BFF", F_BLACK, None),
    "observatorio": ("OBSERVATÓRIO", 1536, 256, "#25375B", "#F7F7F4", "#90CBF5", F_BLACK, None),
    "aeroporto": ("AEROPORTO", 1280, 256, "#F7F7F4", "#20408F", "#2CB7C2", F_BLACK, None),
    "cruzeiros": ("TERMINAL DE CRUZEIROS", 1792, 224, "#155F6E", "#F7F7F4", "#5DCFB1", F_BLACK, None),
    "enigmas": ("SALA DE ENIGMAS", 1536, 256, "#2C1E5A", "#7FEFFF", "#FF3FD0", F_BLACK, None),
    "apartamentos": ("RESIDENCIAL", 1280, 256, "#583725", "#FFE89C", "#E8B53B", F_BLACK, None),
    "basquete": ("QUADRA", 1024, 256, "#E0691F", "#F7F7F4", "#FFD340", F_BLACK, None),
}
MULTI = ["#E5484D", "#F98B37", "#FFD340", "#4EB35F", "#2CB7C2", "#3087E0", "#8B5DD6", "#F27FA2"]


def cabe(texto, fonte, larg, alt):
    tam = int(alt)
    while tam > 8:
        f = ImageFont.truetype(fonte, tam)
        x0, y0, x1, y1 = f.getbbox(texto)
        if x1 - x0 <= larg and y1 - y0 <= alt:
            return f
        tam -= 4
    return ImageFont.truetype(fonte, 8)


def letreiro(nome, texto, W, H, fundo, letra, borda, fonte, contorno):
    im = Image.new("RGB", (W, H), fundo)
    d = ImageDraw.Draw(im)
    b = max(8, H // 16)
    d.rounded_rectangle((b // 2, b // 2, W - b // 2, H - b // 2), radius=H // 5, outline=borda, width=b)
    f = cabe(texto, fonte, W - 5 * b, H - 5 * b)
    x0, y0, x1, y1 = f.getbbox(texto)
    x, y = (W - (x1 - x0)) / 2 - x0, (H - (y1 - y0)) / 2 - y0
    if letra == "multi":
        cx = x
        for i, ch in enumerate(texto):
            d.text((cx, y), ch, font=f, fill=MULTI[i % len(MULTI)])
            cx += f.getlength(ch)
    else:
        if contorno:
            d.text((x, y), texto, font=f, fill=letra, stroke_width=max(3, H // 40), stroke_fill=contorno)
        else:
            d.text((x, y), texto, font=f, fill=letra)
    im.save(os.path.join(PASTA, nome + ".png"))


def grafite_paz():
    """Grafite colorido com a palavra PAZ, bolhas, estrelas e respingos, sobre parede de tijolo à vista."""
    W, H = 1024, 512
    im = Image.new("RGB", (W, H), "#B4533A")
    d = ImageDraw.Draw(im)
    for j in range(0, H, 32):  # tijolos
        off = 0 if (j // 32) % 2 == 0 else 48
        for i in range(-off, W, 96):
            d.rectangle((i + 3, j + 3, i + 93, j + 29), fill="#C9613F" if (i + j) % 192 else "#9B4530")
    # nuvem de fundo
    for k in range(9):
        cx, cy, r = 160 + k * 90, 260 + 50 * math.sin(k * 1.7), 120 + 30 * math.cos(k)
        d.ellipse((cx - r, cy - r * 0.8, cx + r, cy + r * 0.8), fill="#90CBF5")
    for k in range(9):
        cx, cy, r = 160 + k * 90, 260 + 50 * math.sin(k * 1.7), 100 + 30 * math.cos(k)
        d.ellipse((cx - r, cy - r * 0.8, cx + r, cy + r * 0.8), fill="#CEE8FA")
    f = ImageFont.truetype(F_BLACK, 300)
    cores = ["#F27FA2", "#FFD340", "#4EB35F"]
    x = 170
    for ch, c in zip("PAZ", cores):
        d.text((x + 10, 95 + 12), ch, font=f, fill="#1D2C56", stroke_width=14, stroke_fill="#1D2C56")
        d.text((x, 95), ch, font=f, fill=c, stroke_width=10, stroke_fill="#F7F7F4")
        x += f.getlength(ch) + 20
    for cx, cy, c in ((90, 90, "#FFD340"), (930, 120, "#F98B37"), (110, 420, "#8B5DD6"), (930, 420, "#2CB7C2")):
        pts = [(cx + (40 if k % 2 == 0 else 16) * math.cos(math.pi / 2 + k * math.pi / 5),
                cy - (40 if k % 2 == 0 else 16) * math.sin(math.pi / 2 + k * math.pi / 5)) for k in range(10)]
        d.polygon(pts, fill=c, outline="#F7F7F4")
    im.save(os.path.join(PASTA, "grafite_paz.png"))


def tela_rosto():
    """Telão roxo com rosto sorridente (para o prédio da sala de enigmas)."""
    W, H = 512, 768
    im = Image.new("RGB", (W, H), "#3A1E7A")
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((20, 20, W - 20, H - 20), radius=40, fill="#A340C4", outline="#FFD340", width=16)
    for k in range(0, W, 60):  # faixas de aviso em cima e embaixo
        d.polygon([(k, 40), (k + 30, 40), (k + 60, 90), (k + 30, 90)], fill="#FFD340")
        d.polygon([(k, H - 90), (k + 30, H - 90), (k + 60, H - 40), (k + 30, H - 40)], fill="#FFD340")
    d.ellipse((140, 270, 220, 350), fill="#FFE89C")
    d.ellipse((292, 270, 372, 350), fill="#FFE89C")
    d.arc((120, 320, 392, 540), 20, 160, fill="#FFE89C", width=26)
    im.save(os.path.join(PASTA, "tela_rosto.png"))


def faixa_texto():
    W, H = 2048, 128
    im = Image.new("RGB", (W, H), "#FF3FD0")
    d = ImageDraw.Draw(im)
    f = ImageFont.truetype(F_BLACK, 88)
    txt = "OLÁ, CIDADE!   ★   BEM-VINDO   ★   "
    x = 10
    while x < W:
        d.text((x, 12), txt, font=f, fill="#F7F7F4")
        x += f.getlength(txt)
    im.save(os.path.join(PASTA, "faixa_texto.png"))


def quadra_basquete():
    """Piso da quadra redonda do telhado (laranja e vermelho com linhas brancas)."""
    S = 1024
    im = Image.new("RGB", (S, S), "#F98B37")
    d = ImageDraw.Draw(im)
    c = S / 2
    d.ellipse((40, 40, S - 40, S - 40), fill="#F98B37", outline="#F7F7F4", width=14)
    for ang in (90, 210, 330):  # três garrafões apontando para as tabelas
        a = math.radians(ang)
        ex, ey = c + 380 * math.cos(a), c - 380 * math.sin(a)
        d.ellipse((ex - 120, ey - 120, ex + 120, ey + 120), fill="#E5484D", outline="#F7F7F4", width=12)
        d.line((c, c, c + 470 * math.cos(a), c - 470 * math.sin(a)), fill="#F7F7F4", width=12)
    d.ellipse((c - 110, c - 110, c + 110, c + 110), outline="#F7F7F4", width=12, fill="#E5484D")
    im = im.filter(ImageFilter.SMOOTH)
    im.save(os.path.join(PASTA, "quadra_basquete.png"))


def campo_estadio():
    W, H = 1024, 640
    im = Image.new("RGB", (W, H), "#4EB35F")
    d = ImageDraw.Draw(im)
    for k in range(0, W, 80):
        d.rectangle((k, 0, k + 40, H), fill="#56A63B")
    d.rectangle((30, 30, W - 30, H - 30), outline="#F7F7F4", width=8)
    d.line((W / 2, 30, W / 2, H - 30), fill="#F7F7F4", width=8)
    d.ellipse((W / 2 - 90, H / 2 - 90, W / 2 + 90, H / 2 + 90), outline="#F7F7F4", width=8)
    for sx in (30, W - 30):
        s = 1 if sx < W / 2 else -1
        d.rectangle(sorted((sx, H / 2 - 150))[0:1] + [0] if False else
                    (min(sx, sx + s * 150), H / 2 - 150, max(sx, sx + s * 150), H / 2 + 150), outline="#F7F7F4",
                    width=8)
    im.save(os.path.join(PASTA, "campo_estadio.png"))


for k, v in LETREIROS.items():
    letreiro(k, *v)
grafite_paz()
tela_rosto()
faixa_texto()
quadra_basquete()
campo_estadio()
print("estampas em", PASTA)
