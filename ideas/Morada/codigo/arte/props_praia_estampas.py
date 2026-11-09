"""Estampas (PNG) da categoria props_praia: toalhas de praia, letreiros do quiosque de coco e do carrinho de picolé,
faixa do posto de salva-vidas, placas de praia, placas das bandeiras de aviso e etiqueta da lixeira.
Textos genéricos em português, sem marcas.

Uso: python3 -I morada-art/props_praia_estampas.py SP/cidade_out
(o gerador cidade_props_praia.py chama desenha_tudo() quando falta algum PNG).
Grava em SP/cidade_out/props_praia/estampas/.
"""
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFont

F_BLACK = "/usr/share/fonts/opentype/inter/Inter-Black.otf"
F_XBOLD = "/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf"

COR = {
    "branco": (247, 247, 244), "creme": (245, 229, 188), "creme_claro": (251, 242, 220), "areia": (216, 192, 151),
    "coral": (245, 157, 138), "salmao": (245, 157, 138), "vermelho": (229, 72, 77), "vermelho_escuro": (183, 50, 58),
    "rosa": (242, 127, 162), "rosa_claro": (251, 211, 221), "laranja": (249, 139, 55), "amarelo": (255, 211, 64),
    "amarelo_claro": (255, 232, 156), "verde": (78, 179, 95), "verde_escuro": (30, 122, 75), "verde_claro": (143, 208, 123),
    "verde_lima": (183, 220, 91), "turquesa": (44, 183, 194), "turquesa_claro": (144, 224, 224), "azul": (48, 135, 224),
    "azul_celeste": (80, 179, 240), "azul_claro": (144, 203, 245), "azul_escuro": (32, 64, 143),
    "azul_marinho": (29, 44, 86), "preto": (30, 33, 39), "chocolate": (62, 37, 26), "madeira": (184, 118, 63),
    "madeira_escura": (109, 67, 41), "madeira_clara": (230, 179, 119), "grafite": (64, 71, 82), "lilas": (186, 161, 235),
    "roxo": (139, 93, 214),
}


def fonte(tam, f=F_BLACK):
    try:
        return ImageFont.truetype(f, tam)
    except OSError:
        return ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", tam)


def cabe(dr, txt, larg_max, alt_max, f_nome=F_BLACK, contorno=0):
    t = int(alt_max)
    while t > 8:
        f = fonte(t, f_nome)
        bb = dr.textbbox((0, 0), txt, font=f, stroke_width=contorno)
        if bb[2] - bb[0] <= larg_max and bb[3] - bb[1] <= alt_max:
            return f
        t -= 2
    return fonte(t, f_nome)


def texto(dr, cx, cy, txt, larg, alt, cor, f_nome=F_BLACK, contorno=None, lc=0):
    f = cabe(dr, txt, larg, alt, f_nome, lc)
    bb = dr.textbbox((0, 0), txt, font=f, stroke_width=lc)
    w, h = bb[2] - bb[0], bb[3] - bb[1]
    dr.text((cx - w / 2 - bb[0], cy - h / 2 - bb[1]), txt, font=f, fill=cor, stroke_width=lc, stroke_fill=contorno)


def ret_arred(dr, box, r, cor, contorno=None, larg=0):
    dr.rounded_rectangle(box, r, fill=cor, outline=contorno, width=larg)


def sol(dr, cx, cy, r, cor=COR["amarelo"], raios=10):
    for k in range(raios):
        a = 2 * math.pi * k / raios
        a1, a2 = a - 0.13, a + 0.13
        dr.polygon([(cx + r * 1.15 * math.cos(a1), cy + r * 1.15 * math.sin(a1)),
                    (cx + r * 1.65 * math.cos(a), cy + r * 1.65 * math.sin(a)),
                    (cx + r * 1.15 * math.cos(a2), cy + r * 1.15 * math.sin(a2))], fill=cor)
    dr.ellipse((cx - r, cy - r, cx + r, cy + r), fill=cor)


def ondas(dr, x0, x1, y, amp, per, larg, cor):
    pts = [(x, y + amp * math.sin(2 * math.pi * (x - x0) / per)) for x in range(int(x0), int(x1) + 1, 3)]
    dr.line(pts, fill=cor, width=larg, joint="curve")


def estrela_mar(dr, cx, cy, r, cor, rot=-90):
    pts = []
    for k in range(10):
        rr = r if k % 2 == 0 else r * 0.42
        a = math.radians(rot + 36 * k)
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    dr.polygon(pts, fill=cor)


# ------------------------------------------------------------------------------------------------ toalhas (2:1)
def franja(dr, W, H, cor):
    """Franjinhas nas duas pontas (x = 0 e x = W)."""
    for x0, s in ((0, 1), (W, -1)):
        for y in range(6, H - 4, 12):
            dr.line([(x0, y), (x0 + s * 18, y)], fill=cor, width=5)


def toalha_listras(caminho):
    W, H = 1024, 512
    im = Image.new("RGB", (W, H), COR["branco"])
    dr = ImageDraw.Draw(im)
    faixas = [("coral", 120), ("branco", 40), ("amarelo", 70), ("branco", 40), ("turquesa", 120), ("branco", 40),
              ("amarelo", 70), ("branco", 40), ("coral", 120)]
    tot = sum(w for _, w in faixas)
    x = 30
    for c, w in faixas:
        ww = w * (W - 60) / tot
        dr.rectangle((x, 0, x + ww, H), fill=COR[c])
        x += ww
    for y in (40, H - 52):
        dr.rectangle((30, y, W - 30, y + 12), fill=COR["branco"])
    franja(dr, W, H, COR["creme"])
    im.save(caminho)


def toalha_melancia(caminho):
    W, H = 1024, 512
    im = Image.new("RGB", (W, H), COR["verde_escuro"])
    dr = ImageDraw.Draw(im)
    ret_arred(dr, (24, 22, W - 24, H - 22), 60, COR["verde_claro"])
    ret_arred(dr, (46, 44, W - 46, H - 44), 50, COR["creme_claro"])
    ret_arred(dr, (62, 60, W - 62, H - 60), 44, COR["vermelho"])
    import random
    rnd = random.Random(4)
    for k in range(46):
        x, y = rnd.uniform(110, W - 110), rnd.uniform(100, H - 100)
        a = rnd.uniform(0, math.pi)
        dx, dy = 9 * math.cos(a), 9 * math.sin(a)
        dr.ellipse((x - 10, y - 15, x + 10, y + 15), fill=COR["chocolate"])
        dr.ellipse((x - 4, y - 10, x + 2, y - 2), fill=COR["grafite"])
    franja(dr, W, H, COR["verde_claro"])
    im.save(caminho)


def toalha_ondas(caminho):
    W, H = 1024, 512
    im = Image.new("RGB", (W, H), COR["azul_celeste"])
    dr = ImageDraw.Draw(im)
    for k, y in enumerate(range(60, H, 64)):
        ondas(dr, 30, W - 30, y, 14, 128, 16, COR["branco"] if k % 2 == 0 else COR["azul_claro"])
    dr.rectangle((0, 0, W, 26), fill=COR["azul_escuro"])
    dr.rectangle((0, H - 26, W, H), fill=COR["azul_escuro"])
    dr.ellipse((W - 330, 120, W - 110, 340), fill=COR["azul_celeste"])
    sol(dr, W - 220, 230, 70, COR["amarelo"], 12)
    estrela_mar(dr, 200, 300, 70, COR["laranja"])
    estrela_mar(dr, 200, 300, 40, COR["amarelo_claro"])
    franja(dr, W, H, COR["branco"])
    im.save(caminho)


# ------------------------------------------------------------------------------------------------ letreiros
def letreiro_coco(caminho):
    """Placa de madeira do quiosque: COCO GELADO com dois cocos."""
    W, H = 1024, 256
    im = Image.new("RGB", (W, H), COR["madeira_escura"])
    dr = ImageDraw.Draw(im)
    ret_arred(dr, (10, 10, W - 10, H - 10), 40, COR["madeira"])
    for y in (80, 160):
        dr.line([(30, y), (W - 30, y)], fill=COR["madeira_escura"], width=4)
    ret_arred(dr, (36, 30, W - 36, H - 30), 30, COR["amarelo_claro"])
    texto(dr, W / 2 + 10, H / 2, "COCO GELADO", W - 360, 120, COR["verde_escuro"], contorno=COR["branco"], lc=6)
    for cx in (110, W - 110):
        dr.ellipse((cx - 62, H / 2 - 62, cx + 62, H / 2 + 62), fill=COR["verde"])
        dr.ellipse((cx - 30, H / 2 - 58, cx + 30, H / 2 - 18), fill=COR["creme_claro"])
        dr.line([(cx + 8, H / 2 - 40), (cx + 34, H / 2 - 96)], fill=COR["rosa"], width=10)
    im.save(caminho)


def cardapio(caminho):
    """Quadro do cardápio (lousa verde) sem preços."""
    W, H = 512, 640
    im = Image.new("RGB", (W, H), COR["madeira"])
    dr = ImageDraw.Draw(im)
    ret_arred(dr, (24, 24, W - 24, H - 24), 20, (38, 74, 58))
    texto(dr, W / 2, 100, "SUCOS", W - 120, 90, COR["amarelo"])
    itens = ["ÁGUA DE COCO", "LARANJA", "MARACUJÁ", "ABACAXI", "AÇAÍ"]
    for k, t in enumerate(itens):
        y = 200 + k * 82
        dr.ellipse((60, y - 12, 84, y + 12), fill=[COR["verde_lima"], COR["laranja"], COR["amarelo"], COR["amarelo_claro"],
                                                      COR["roxo"]][k])
        f = cabe(dr, t, W - 170, 46, F_XBOLD)
        dr.text((104, y - 26), t, font=f, fill=COR["branco"])
    im.save(caminho)


def picole(caminho):
    W, H = 768, 256
    im = Image.new("RGB", (W, H), COR["azul_celeste"])
    dr = ImageDraw.Draw(im)
    ret_arred(dr, (12, 12, W - 12, H - 12), 50, COR["branco"])
    ret_arred(dr, (28, 28, W - 28, H - 28), 40, COR["azul_celeste"])
    texto(dr, W / 2, H / 2, "PICOLÉ", W - 330, 130, COR["branco"], contorno=COR["azul_escuro"], lc=8)
    for cx, c in ((100, "rosa"), (W - 100, "amarelo")):
        dr.rectangle((cx - 9, 150, cx + 9, 220), fill=COR["madeira_clara"])
        ret_arred(dr, (cx - 42, 40, cx + 42, 168), 38, COR[c])
        dr.rectangle((cx - 42, 40, cx + 42, 76), fill=COR["chocolate"])
        ret_arred(dr, (cx - 42, 40, cx + 42, 92), 38, COR["chocolate"])
    im.save(caminho)


def salva_vidas(caminho):
    W, H = 1024, 192
    im = Image.new("RGB", (W, H), COR["branco"])
    dr = ImageDraw.Draw(im)
    dr.rectangle((0, 0, W, 18), fill=COR["vermelho"])
    dr.rectangle((0, H - 18, W, H), fill=COR["vermelho"])
    texto(dr, W / 2 + 40, H / 2, "SALVA-VIDAS", W - 300, 110, COR["vermelho"])
    cx, cy = 120, H / 2
    dr.rectangle((cx - 22, cy - 62, cx + 22, cy + 62), fill=COR["vermelho"])
    dr.rectangle((cx - 62, cy - 22, cx + 62, cy + 22), fill=COR["vermelho"])
    im.save(caminho)


def placa_praia(caminho):
    """Placa grande de madeira: PRAIA, sol e ondas, e as regras em ícones."""
    W, H = 1024, 640
    im = Image.new("RGB", (W, H), COR["madeira_escura"])
    dr = ImageDraw.Draw(im)
    ret_arred(dr, (12, 12, W - 12, H - 12), 46, COR["madeira"])
    for y in range(90, H, 110):
        dr.line([(30, y), (W - 30, y)], fill=COR["madeira_escura"], width=4)
    ret_arred(dr, (44, 40, W - 44, 340), 36, COR["azul_celeste"])
    sol(dr, W - 170, 150, 56, COR["amarelo"], 12)
    for k, y in enumerate((260, 300)):
        ondas(dr, 60, W - 60, y, 10, 110, 14, COR["branco"] if k == 0 else COR["azul_claro"])
    texto(dr, W / 2 - 80, 150, "PRAIA", W - 420, 170, COR["branco"], contorno=COR["azul_escuro"], lc=8)
    # ícones: salva-vidas, chuveiro, quiosque, lixeira
    y = 490
    for k, (rot, cor) in enumerate((("BOIA", "laranja"), ("DUCHA", "azul"), ("COCO", "verde"), ("LIXO", "grafite"))):
        cx = 150 + k * 242
        ret_arred(dr, (cx - 100, y - 110, cx + 100, y + 110), 30, COR["creme_claro"])
        if rot == "BOIA":
            dr.ellipse((cx - 52, y - 82, cx + 52, y + 22), fill=COR["laranja"])
            dr.ellipse((cx - 24, y - 54, cx + 24, y - 6), fill=COR["creme_claro"])
            for a in (45, 135, 225, 315):
                r = math.radians(a)
                dr.line([(cx + 26 * math.cos(r), y - 30 + 26 * math.sin(r)), (cx + 52 * math.cos(r),
                                                                                y - 30 + 52 * math.sin(r))],
                        fill=COR["branco"], width=14)
        elif rot == "DUCHA":
            dr.line([(cx - 30, y + 20), (cx - 30, y - 80), (cx + 30, y - 80), (cx + 30, y - 60)], fill=COR["grafite"],
                    width=12)
            for dx in (-14, 0, 14, 28):
                dr.line([(cx + 30 + dx * 0.5, y - 46), (cx + 18 + dx, y + 10)], fill=COR["azul_celeste"], width=6)
        elif rot == "COCO":
            dr.ellipse((cx - 50, y - 80, cx + 50, y + 20), fill=COR["verde"])
            dr.ellipse((cx - 22, y - 78, cx + 22, y - 48), fill=COR["creme_claro"])
            dr.line([(cx + 6, y - 64), (cx + 30, y - 110)], fill=COR["rosa"], width=9)
        else:
            dr.rectangle((cx - 38, y - 70, cx + 38, y + 18), fill=COR["grafite"])
            dr.rectangle((cx - 46, y - 84, cx + 46, y - 70), fill=COR["grafite"])
            for dx in (-18, 0, 18):
                dr.line([(cx + dx, y - 56), (cx + dx, y + 6)], fill=COR["creme_claro"], width=6)
        texto(dr, cx, y + 70, rot, 170, 44, COR["madeira_escura"], F_XBOLD)
    im.save(caminho)


def aviso(caminho, cor, txt):
    W, H = 768, 384
    im = Image.new("RGB", (W, H), COR["branco"])
    dr = ImageDraw.Draw(im)
    ret_arred(dr, (10, 10, W - 10, H - 10), 40, COR[cor])
    ret_arred(dr, (34, 34, W - 34, H - 34), 28, COR["branco"])
    tc = COR["preto"] if cor == "amarelo" else COR[cor]
    texto(dr, W / 2, H * 0.36, txt, W - 120, 120, tc)
    ondas(dr, 90, W - 90, H * 0.72, 18, 150, 18, COR["azul_celeste"])
    ondas(dr, 90, W - 90, H * 0.72 + 40, 18, 150, 12, COR["azul_claro"])
    im.save(caminho)


def lixo(caminho):
    W, H = 512, 384
    im = Image.new("RGB", (W, H), COR["branco"])
    dr = ImageDraw.Draw(im)
    texto(dr, W / 2, H * 0.34, "LIXO", W - 80, 150, COR["azul_escuro"])
    # concha estilizada
    cx, cy = W / 2, H * 0.74
    for k in range(7):
        a = math.radians(200 + 20 * k)
        dr.polygon([(cx, cy + 40), (cx + 90 * math.cos(a - 0.09), cy + 40 + 90 * math.sin(a - 0.09)),
                    (cx + 90 * math.cos(a + 0.09), cy + 40 + 90 * math.sin(a + 0.09))],
                   fill=COR["coral"] if k % 2 else COR["laranja"])
    dr.ellipse((cx - 16, cy + 26, cx + 16, cy + 56), fill=COR["coral"])
    im.save(caminho)


def setas(caminho):
    """Placa de direção: MAR, QUIOSQUE, DUCHA (três tábuas)."""
    W, H = 768, 576
    im = Image.new("RGB", (W, H), COR["madeira_escura"])
    dr = ImageDraw.Draw(im)
    linhas = [("MAR", "azul_celeste"), ("QUIOSQUE", "verde"), ("DUCHA", "turquesa")]
    for k, (t, c) in enumerate(linhas):
        y0 = 12 + k * 188
        ret_arred(dr, (12, y0, W - 12, y0 + 176), 30, COR["madeira_clara"])
        dr.ellipse((40, y0 + 38, 140, y0 + 138), fill=COR[c])
        texto(dr, W / 2 + 50, y0 + 88, t, W - 260, 100, COR["madeira_escura"])
    im.save(caminho)


def letreiro_neon(caminho, txt, fundo, letra, borda, icone=None):
    """Letreiro luminoso: palavra grande com contorno, fundo escuro, lampadinhas na borda (emissivo no material)."""
    W, H = 1024, 320
    im = Image.new("RGB", (W, H), COR[borda])
    dr = ImageDraw.Draw(im)
    ret_arred(dr, (14, 14, W - 14, H - 14), 60, COR[fundo])
    for k in range(22):
        x = 40 + k * (W - 80) / 21
        for y in (34, H - 34):
            dr.ellipse((x - 9, y - 9, x + 9, y + 9), fill=COR["amarelo_claro"])
    texto(dr, W / 2 + (50 if icone else 0), H / 2, txt, W - (330 if icone else 160), 170, COR[letra],
          contorno=COR["branco"], lc=8)
    if icone == "coco":
        cx, cy = 150, H / 2
        dr.ellipse((cx - 70, cy - 70, cx + 70, cy + 70), fill=COR["madeira_escura"])
        dr.ellipse((cx - 52, cy - 60, cx + 52, cy - 4), fill=COR["turquesa_claro"])
        dr.line([(cx + 10, cy - 40), (cx + 40, cy - 110)], fill=COR["laranja"], width=12)
    elif icone == "prancha":
        cx, cy = 150, H / 2
        dr.ellipse((cx - 36, cy - 100, cx + 36, cy + 100), fill=COR["amarelo"])
        dr.line([(cx, cy - 96), (cx, cy + 96)], fill=COR["vermelho"], width=10)
    elif icone == "acai":
        cx, cy = 150, H / 2
        dr.polygon([(cx - 70, cy - 30), (cx + 70, cy - 30), (cx + 50, cy + 80), (cx - 50, cy + 80)], fill=COR["roxo"])
        for dx in (-40, 0, 40):
            dr.ellipse((cx + dx - 26, cy - 70, cx + dx + 26, cy - 18), fill=COR["chocolate"] if dx else COR["vermelho"])
    im.save(caminho)


TUDO = {
    "toalha_listras": toalha_listras, "toalha_melancia": toalha_melancia, "toalha_ondas": toalha_ondas,
    "letreiro_coco": letreiro_coco, "cardapio": cardapio, "picole": picole, "salva_vidas": salva_vidas,
    "placa_praia": placa_praia, "lixo": lixo, "setas": setas,
    "aviso_verde": lambda c: aviso(c, "verde", "MAR CALMO"),
    "aviso_amarela": lambda c: aviso(c, "amarelo", "ATENÇÃO"),
    "aviso_vermelha": lambda c: aviso(c, "vermelho", "PERIGO"),
    "neon_sucos": lambda c: letreiro_neon(c, "SUCOS", "azul_marinho", "laranja", "laranja", "coco"),
    "neon_surfe": lambda c: letreiro_neon(c, "SURFE", "azul_marinho", "turquesa", "turquesa", "prancha"),
    "neon_acai": lambda c: letreiro_neon(c, "AÇAÍ", "azul_marinho", "lilas", "roxo", "acai"),
}


def desenha_tudo(pasta):
    os.makedirs(pasta, exist_ok=True)
    for nome, f in TUDO.items():
        f(os.path.join(pasta, nome + ".png"))
    print("estampas", pasta, len(TUDO), flush=True)


if __name__ == "__main__":
    desenha_tudo(os.path.join(sys.argv[1], "props_praia", "estampas"))
