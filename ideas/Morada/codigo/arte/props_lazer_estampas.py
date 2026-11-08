"""Estampas (PNG) da categoria props_lazer: letreiros dos carrinhos e do quiosque, placas de direção, faixa do palco,
painel do brinquedo de moeda e o emblema do portal oriental. Textos genéricos em português, sem marcas.

Uso: python3 -I morada-art/props_lazer_estampas.py SP/cidade_out
(o gerador cidade_props_lazer.py chama desenha_tudo() quando falta algum PNG). Grava em SP/cidade_out/props_lazer/estampas/.
"""
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFont

F_BLACK = "/usr/share/fonts/opentype/inter/Inter-Black.otf"
F_XBOLD = "/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf"

COR = {
    "laranja": (249, 139, 55), "amarelo": (255, 211, 64), "amarelo_claro": (255, 232, 156), "roxo": (139, 93, 214),
    "roxo_escuro": (92, 59, 163), "magenta": (200, 61, 142), "rosa": (242, 127, 162), "rosa_claro": (251, 211, 221),
    "rosa_escuro": (220, 79, 132), "branco": (247, 247, 244), "vermelho": (229, 72, 77),
    "vermelho_escuro": (183, 50, 58), "azul": (48, 135, 224), "azul_escuro": (32, 64, 143), "azul_noite": (37, 55, 91),
    "lilas": (186, 161, 235), "lilas_claro": (227, 213, 247), "verde": (78, 179, 95), "verde_escuro": (30, 122, 75),
    "turquesa": (44, 183, 194), "menta": (170, 229, 202), "creme": (245, 229, 188), "chocolate": (62, 37, 26),
    "preto": (30, 33, 39), "madeira_clara": (230, 179, 119), "madeira": (184, 118, 63), "ouro": (232, 181, 59),
    "ouro_escuro": (192, 138, 31), "azul_celeste": (80, 179, 240), "marrom_escuro": (80, 51, 39),
}


def fonte(tam, f=F_BLACK):
    try:
        return ImageFont.truetype(f, tam)
    except OSError:
        return ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", tam)


def cabe(dr, txt, larg_max, alt_max, f_nome=F_BLACK, contorno=0):
    t = int(alt_max * 1.3)
    while t > 8:
        f = fonte(t, f_nome)
        bb = dr.textbbox((0, 0), txt, font=f, stroke_width=contorno)
        if bb[2] - bb[0] <= larg_max and bb[3] - bb[1] <= alt_max:
            return f
        t -= 2
    return fonte(t, f_nome)


def texto(dr, cx, cy, txt, larg, alt, cor, contorno=None, lc=0, f_nome=F_BLACK):
    f = cabe(dr, txt, larg, alt, f_nome, lc)
    bb = dr.textbbox((0, 0), txt, font=f, stroke_width=lc)
    w, h = bb[2] - bb[0], bb[3] - bb[1]
    dr.text((cx - w / 2 - bb[0], cy - h / 2 - bb[1]), txt, font=f, fill=cor, stroke_width=lc, stroke_fill=contorno)


def estrela(dr, cx, cy, r, cor, pontas=5, rot=-90, r_in=0.45):
    pts = []
    for k in range(pontas * 2):
        rr = r if k % 2 == 0 else r * r_in
        a = math.radians(rot + 180 * k / pontas)
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    dr.polygon(pts, fill=cor)


def placa(nome, w, h, fundo, txt, cor_txt, borda=None, contorno=None, lc=0, linhas=None, enfeite=None, pasta="."):
    """Letreiro: fundo arredondado, borda e texto (uma ou duas linhas) com contorno opcional."""
    S = 4
    im = Image.new("RGB", (w * S, h * S), COR[borda or fundo])
    dr = ImageDraw.Draw(im)
    m = int(h * S * 0.07) if borda else 0
    dr.rounded_rectangle((m, m, w * S - m, h * S - m), radius=int(h * S * 0.18), fill=COR[fundo])
    ls = linhas or [txt]
    n = len(ls)
    marg_x = w * S * (0.16 if enfeite else 0.08)
    for i, t in enumerate(ls):
        cy = h * S * (i + 0.5) / n
        texto(dr, w * S / 2, cy, t, w * S - 2 * marg_x, h * S / n * 0.62, COR[cor_txt],
              COR[contorno] if contorno else None, lc * S)
    if enfeite == "estrelas":
        for sx in (0.075, 0.925):
            estrela(dr, w * S * sx, h * S / 2, h * S * 0.22, COR["amarelo"])
    elif enfeite == "bolinhas":
        for sx in (0.07, 0.93):
            dr.ellipse((w * S * sx - h * S * 0.13, h * S / 2 - h * S * 0.13, w * S * sx + h * S * 0.13,
                        h * S / 2 + h * S * 0.13), fill=COR["branco"])
    im = im.resize((w, h), Image.LANCZOS)
    im.save(os.path.join(pasta, nome + ".png"))


def seta(nome, txt, fundo, cor_txt, pasta):
    """Placa de direção em forma de seta (madeira), texto escuro. O PNG é retangular; a forma vem da malha."""
    w, h = 512, 128
    S = 3
    im = Image.new("RGB", (w * S, h * S), COR[fundo])
    dr = ImageDraw.Draw(im)
    for k in range(1, 4):  # veios da madeira
        y = h * S * k / 4
        dr.line((0, y, w * S, y + 6), fill=tuple(int(c * 0.92) for c in COR[fundo]), width=4)
    texto(dr, w * S * 0.46, h * S / 2, txt, w * S * 0.7, h * S * 0.5, COR[cor_txt])
    im = im.resize((w, h), Image.LANCZOS)
    im.save(os.path.join(pasta, nome + ".png"))


def emblema_flor(pasta):
    """Emblema do portal oriental: placa vermelha com moldura dourada e uma flor de cerejeira estilizada."""
    S = 4
    w, h = 256, 320
    im = Image.new("RGB", (w * S, h * S), COR["ouro"])
    dr = ImageDraw.Draw(im)
    m = 14 * S
    dr.rounded_rectangle((m, m, w * S - m, h * S - m), radius=20 * S, fill=COR["vermelho_escuro"])
    m2 = 26 * S
    dr.rounded_rectangle((m2, m2, w * S - m2, h * S - m2), radius=14 * S, outline=COR["ouro"], width=4 * S)
    cx, cy, R = w * S / 2, h * S / 2, 70 * S
    for k in range(5):
        a = math.radians(-90 + 72 * k)
        px, py = cx + R * 0.55 * math.cos(a), cy + R * 0.55 * math.sin(a)
        dr.ellipse((px - R * 0.5, py - R * 0.5, px + R * 0.5, py + R * 0.5), fill=COR["rosa_claro"])
    for k in range(5):
        a = math.radians(-90 + 72 * k)
        px, py = cx + R * 1.0 * math.cos(a), cy + R * 1.0 * math.sin(a)
        dr.polygon([(px - 10 * S * math.cos(a + 1.2), py - 10 * S * math.sin(a + 1.2)),
                    (px - 10 * S * math.cos(a - 1.2), py - 10 * S * math.sin(a - 1.2)),
                    (cx + R * 0.7 * math.cos(a), cy + R * 0.7 * math.sin(a))], fill=COR["vermelho_escuro"])
    dr.ellipse((cx - R * 0.3, cy - R * 0.3, cx + R * 0.3, cy + R * 0.3), fill=COR["rosa"])
    for k in range(10):
        a = math.radians(36 * k)
        px, py = cx + R * 0.2 * math.cos(a), cy + R * 0.2 * math.sin(a)
        dr.ellipse((px - 5 * S, py - 5 * S, px + 5 * S, py + 5 * S), fill=COR["amarelo"])
    im = im.resize((w, h), Image.LANCZOS)
    im.save(os.path.join(pasta, "emblema_flor.png"))


def painel_moeda(pasta):
    """Painel do brinquedo de moeda: "1 FICHA" com uma moeda desenhada e setas."""
    S = 4
    w, h = 256, 192
    im = Image.new("RGB", (w * S, h * S), COR["azul_escuro"])
    dr = ImageDraw.Draw(im)
    dr.rounded_rectangle((8 * S, 8 * S, w * S - 8 * S, h * S - 8 * S), radius=18 * S, fill=COR["azul"])
    cx, cy, r = w * S * 0.27, h * S * 0.5, 48 * S
    dr.ellipse((cx - r, cy - r, cx + r, cy + r), fill=COR["ouro_escuro"])
    dr.ellipse((cx - r * 0.82, cy - r * 0.82, cx + r * 0.82, cy + r * 0.82), fill=COR["ouro"])
    estrela(dr, cx, cy, r * 0.5, COR["amarelo_claro"])
    texto(dr, w * S * 0.68, h * S * 0.36, "1", w * S * 0.3, h * S * 0.36, COR["amarelo"])
    texto(dr, w * S * 0.68, h * S * 0.7, "FICHA", w * S * 0.42, h * S * 0.2, COR["branco"])
    im = im.resize((w, h), Image.LANCZOS)
    im.save(os.path.join(pasta, "painel_moeda.png"))


def faixa_palco(pasta):
    """Faixa do palco coberto: azul-noite com estrelas e o texto MÚSICA NA PRAÇA."""
    S = 3
    w, h = 768, 128
    im = Image.new("RGB", (w * S, h * S), COR["amarelo"])
    dr = ImageDraw.Draw(im)
    m = 8 * S
    dr.rounded_rectangle((m, m, w * S - m, h * S - m), radius=24 * S, fill=COR["azul_noite"])
    texto(dr, w * S / 2, h * S / 2, "MÚSICA NA PRAÇA", w * S * 0.74, h * S * 0.5, COR["amarelo"])
    for sx in (0.06, 0.94):
        estrela(dr, w * S * sx, h * S / 2, h * S * 0.26, COR["amarelo"])
    for sx in (0.12, 0.88):
        estrela(dr, w * S * sx, h * S * 0.32, h * S * 0.1, COR["branco"])
    im = im.resize((w, h), Image.LANCZOS)
    im.save(os.path.join(pasta, "faixa_palco.png"))


def desenha_tudo(pasta):
    os.makedirs(pasta, exist_ok=True)
    placa("baloes", 512, 160, "rosa", "BALÕES", "branco", borda="branco", contorno="rosa_escuro", lc=3,
          enfeite="estrelas", pasta=pasta)
    placa("cachorro_quente", 640, 200, "amarelo", "", "vermelho_escuro", borda="vermelho",
          linhas=["CACHORRO", "QUENTE"], pasta=pasta)
    placa("algodao_doce", 640, 180, "lilas_claro", "", "magenta", borda="rosa", linhas=["ALGODÃO", "DOCE"],
          pasta=pasta)
    placa("sorvetes", 1024, 160, "branco", "SORVETES  •  CASQUINHA  •  SORVETES", "azul", borda="azul_celeste",
          pasta=pasta)
    placa("pipoca", 512, 160, "vermelho", "PIPOCA", "amarelo", borda="amarelo", contorno="vermelho_escuro", lc=3,
          enfeite="bolinhas", pasta=pasta)
    placa("lanches_letreiro", 512, 160, "verde", "LANCHES", "branco", borda="branco", pasta=pasta)
    for nome, txt in (("seta_zoo", "ZOOLÓGICO"), ("seta_lago", "LAGO"), ("seta_parquinho", "PARQUINHO"),
                      ("seta_saida", "SAÍDA")):
        seta(nome, txt, "madeira_clara", "marrom_escuro", pasta)
    emblema_flor(pasta)
    painel_moeda(pasta)
    faixa_palco(pasta)


if __name__ == "__main__":
    desenha_tudo(os.path.join(sys.argv[1], "props_lazer", "estampas"))
