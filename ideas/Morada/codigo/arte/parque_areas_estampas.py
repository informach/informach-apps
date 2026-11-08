"""Estampas (PNG) da categoria parque_areas: letreiros dos quiosques, faixa e telão do palco, placa do zoológico e do
circo. Textos genéricos em português, sem marcas.

Uso: python3 -I morada-art/parque_areas_estampas.py SP/cidade_out
(o gerador cidade_parque_areas.py também chama desenha_tudo() quando falta algum PNG).
Grava em SP/cidade_out/parque_areas/estampas/.
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
    "branco": (247, 247, 244), "vermelho": (229, 72, 77), "vermelho_escuro": (183, 50, 58), "azul": (48, 135, 224),
    "azul_escuro": (32, 64, 143), "azul_noite": (37, 55, 91), "lilas": (186, 161, 235), "verde": (78, 179, 95),
    "verde_escuro": (30, 122, 75), "turquesa": (44, 183, 194), "menta": (170, 229, 202), "creme": (245, 229, 188),
    "chocolate": (62, 37, 26), "preto": (30, 33, 39), "ciano": (68, 228, 255),
}


def fonte(tam, f=F_BLACK):
    try:
        return ImageFont.truetype(f, tam)
    except OSError:
        return ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", tam)


def estrela(dr, cx, cy, r, cor, pontas=5, rot=-90, r_in=0.45):
    pts = []
    for k in range(pontas * 2):
        rr = r if k % 2 == 0 else r * r_in
        a = math.radians(rot + 180 * k / pontas)
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    dr.polygon(pts, fill=cor)


def texto_centro(dr, cx, cy, txt, f, cor, contorno=None, larg_contorno=0):
    bb = dr.textbbox((0, 0), txt, font=f, stroke_width=larg_contorno)
    w, h = bb[2] - bb[0], bb[3] - bb[1]
    dr.text((cx - w / 2 - bb[0], cy - h / 2 - bb[1]), txt, font=f, fill=cor, stroke_width=larg_contorno,
            stroke_fill=contorno)


def cabe(dr, txt, larg_max, alt_max, f_nome=F_BLACK, contorno=0):
    t = int(alt_max)
    while t > 8:
        f = fonte(t, f_nome)
        bb = dr.textbbox((0, 0), txt, font=f, stroke_width=contorno)
        if bb[2] - bb[0] <= larg_max and bb[3] - bb[1] <= alt_max:
            return f
        t -= 2
    return fonte(t, f_nome)


def placa(caminho, txt, fundo, letra, contorno, w=1024, h=256, borda=None, icone=None):
    """Letreiro horizontal: fundo liso com borda arredondada clara e o texto centrado com contorno."""
    im = Image.new("RGB", (w, h), fundo)
    dr = ImageDraw.Draw(im)
    if borda:
        dr.rounded_rectangle((8, 8, w - 9, h - 9), radius=h // 5, outline=borda, width=max(6, h // 28))
    margem = w * 0.08 if icone else w * 0.05
    f = cabe(dr, txt, w - 2 * margem - (h * 0.9 if icone else 0), h * 0.62, contorno=max(3, h // 40))
    cx = w / 2 + (h * 0.22 if icone else 0)
    texto_centro(dr, cx, h / 2, txt, f, letra, contorno, max(3, h // 40))
    if icone:
        icone(dr, h * 0.55, h / 2, h * 0.36)
    im.save(caminho)


# ---------------------------------------------------------------------------------------------------- ícones
def ic_casquinha(dr, cx, cy, r):
    dr.polygon([(cx - r * 0.45, cy - r * 0.05), (cx + r * 0.45, cy - r * 0.05), (cx, cy + r * 1.05)],
               fill=COR["laranja"])
    dr.ellipse((cx - r * 0.55, cy - r * 0.95, cx + r * 0.55, cy + r * 0.1), fill=COR["rosa_claro"])
    dr.ellipse((cx - r * 0.18, cy - r * 1.25, cx + r * 0.18, cy - r * 0.9), fill=COR["vermelho"])


def ic_pipoca(dr, cx, cy, r):
    dr.polygon([(cx - r * 0.6, cy - r * 0.2), (cx + r * 0.6, cy - r * 0.2), (cx + r * 0.42, cy + r),
                (cx - r * 0.42, cy + r)], fill=COR["branco"])
    for k in range(3):
        x0 = cx - r * 0.5 + k * r * 0.36
        dr.polygon([(x0, cy - r * 0.2), (x0 + r * 0.16, cy - r * 0.2), (x0 + r * 0.12, cy + r), (x0 + r * 0.04, cy + r)],
                   fill=COR["vermelho_escuro"])
    for dx, dy in ((-0.4, -0.35), (0, -0.5), (0.4, -0.35), (-0.2, -0.65), (0.22, -0.68)):
        dr.ellipse((cx + r * (dx - 0.22), cy + r * (dy - 0.22), cx + r * (dx + 0.22), cy + r * (dy + 0.22)),
                   fill=COR["amarelo_claro"])


def ic_algodao(dr, cx, cy, r):
    dr.line((cx, cy - r * 0.1, cx, cy + r * 1.1), fill=COR["creme"], width=max(4, int(r * 0.12)))
    for dx, dy, rr in ((0, -0.45, 0.5), (-0.35, -0.2, 0.36), (0.35, -0.2, 0.36), (0, -0.85, 0.32)):
        dr.ellipse((cx + r * (dx - rr), cy + r * (dy - rr), cx + r * (dx + rr), cy + r * (dy + rr)),
                   fill=COR["rosa_claro"])


def ic_ingresso(dr, cx, cy, r):
    dr.rounded_rectangle((cx - r, cy - r * 0.55, cx + r, cy + r * 0.55), radius=int(r * 0.2), fill=COR["amarelo"])
    dr.line((cx + r * 0.35, cy - r * 0.5, cx + r * 0.35, cy + r * 0.5), fill=COR["laranja"], width=max(3, int(r * 0.08)))
    estrela(dr, cx - r * 0.25, cy, r * 0.38, COR["vermelho"])


def ic_pata(dr, cx, cy, r, cor=None):
    cor = cor or COR["creme"]
    dr.ellipse((cx - r * 0.5, cy - r * 0.1, cx + r * 0.5, cy + r * 0.75), fill=cor)
    for dx, dy in ((-0.62, -0.35), (-0.22, -0.72), (0.22, -0.72), (0.62, -0.35)):
        dr.ellipse((cx + r * (dx - 0.2), cy + r * (dy - 0.24), cx + r * (dx + 0.2), cy + r * (dy + 0.24)), fill=cor)


# ---------------------------------------------------------------------------------------------------- peças
def festival(caminho):
    w, h = 2048, 320
    im = Image.new("RGB", (w, h), COR["laranja"])
    dr = ImageDraw.Draw(im)
    dr.rectangle((0, 0, w, 26), fill=COR["amarelo"])
    dr.rectangle((0, h - 26, w, h), fill=COR["amarelo"])
    f = cabe(dr, "FESTIVAL", w * 0.6, h * 0.62, contorno=10)
    texto_centro(dr, w / 2, h / 2 + 4, "FESTIVAL", f, COR["roxo_escuro"], COR["branco"], 10)
    for k, x in enumerate((0.09, 0.17, 0.83, 0.91)):
        estrela(dr, w * x, h / 2, h * (0.26 if k in (0, 3) else 0.18), COR["magenta"] if k % 2 else COR["roxo"])
    im.save(caminho)


def show_vertical(caminho):
    w, h = 320, 1280
    im = Image.new("RGB", (w, h), COR["amarelo"])
    dr = ImageDraw.Draw(im)
    dr.rectangle((0, 0, 22, h), fill=COR["laranja"])
    dr.rectangle((w - 22, 0, w, h), fill=COR["laranja"])
    estrela(dr, w / 2, 150, 95, COR["magenta"])
    f = fonte(220)
    for k, ch in enumerate("SHOW"):
        texto_centro(dr, w / 2, 360 + k * 225, ch, f, COR["roxo_escuro"], COR["branco"], 8)
    im.save(caminho)


def telao(caminho):
    """3 quadros lado a lado em U (anima "trocar")."""
    fw, fh = 640, 360
    im = Image.new("RGB", (fw * 3, fh), COR["azul_noite"])
    dr = ImageDraw.Draw(im)
    # quadro 1: FESTIVAL com estrelas
    for j in range(fh):
        t = j / fh
        c = tuple(int(COR["roxo_escuro"][i] * (1 - t) + COR["magenta"][i] * t) for i in range(3))
        dr.line((0, j, fw, j), fill=c)
    for x, y, r in ((80, 70, 30), (560, 90, 36), (120, 290, 22), (520, 300, 28), (320, 60, 18)):
        estrela(dr, x, y, r, COR["amarelo"])
    texto_centro(dr, fw / 2, fh / 2, "FESTIVAL", cabe(dr, "FESTIVAL", fw * 0.8, fh * 0.3), COR["branco"], COR["roxo"], 6)
    # quadro 2: equalizador e notas
    x0 = fw
    dr.rectangle((x0, 0, x0 + fw, fh), fill=COR["azul_noite"])
    cores = [COR["ciano"], COR["verde"], COR["amarelo"], COR["laranja"], COR["rosa"], COR["magenta"], COR["roxo"]]
    for k in range(14):
        hh = 60 + int(220 * abs(math.sin(k * 1.3 + 0.5)))
        cx = x0 + 40 + k * 41
        dr.rounded_rectangle((cx, fh - 30 - hh, cx + 30, fh - 30), radius=8, fill=cores[k % len(cores)])
    for nx, ny in ((x0 + 110, 90), (x0 + 470, 70)):
        dr.ellipse((nx - 28, ny + 40, nx + 20, ny + 76), fill=COR["branco"])
        dr.rectangle((nx + 12, ny - 40, nx + 20, ny + 60), fill=COR["branco"])
        dr.polygon([(nx + 20, ny - 40), (nx + 60, ny - 20), (nx + 60, ny), (nx + 20, ny - 20)], fill=COR["branco"])
    # quadro 3: SHOW com confete
    x0 = 2 * fw
    dr.rectangle((x0, 0, x0 + fw, fh), fill=COR["turquesa"])
    import random
    rnd = random.Random(3)
    for k in range(60):
        x, y = x0 + rnd.uniform(10, fw - 10), rnd.uniform(10, fh - 10)
        dr.rectangle((x, y, x + 12, y + 6), fill=rnd.choice(cores))
    estrela(dr, x0 + fw / 2, fh / 2, 150, COR["amarelo"])
    texto_centro(dr, x0 + fw / 2, fh / 2 + 10, "SHOW", fonte(110), COR["magenta"], COR["branco"], 6)
    im.save(caminho)


def circo(caminho):
    w, h = 1024, 300
    im = Image.new("RGB", (w, h), COR["vermelho"])
    dr = ImageDraw.Draw(im)
    dr.rounded_rectangle((10, 10, w - 11, h - 11), radius=60, outline=COR["amarelo"], width=14)
    for k in range(12):  # lampadinhas pintadas na moldura
        x = 70 + k * (w - 140) / 11
        dr.ellipse((x - 9, 26, x + 9, 44), fill=COR["amarelo_claro"])
        dr.ellipse((x - 9, h - 44, x + 9, h - 26), fill=COR["amarelo_claro"])
    texto_centro(dr, w / 2, h / 2, "CIRCO", cabe(dr, "CIRCO", w * 0.62, h * 0.55, contorno=8), COR["amarelo"],
                 COR["vermelho_escuro"], 8)
    estrela(dr, 110, h / 2, 48, COR["branco"])
    estrela(dr, w - 110, h / 2, 48, COR["branco"])
    im.save(caminho)


def zoologico(caminho):
    w, h = 1536, 300
    im = Image.new("RGB", (w, h), COR["verde_escuro"])
    dr = ImageDraw.Draw(im)
    dr.rounded_rectangle((10, 10, w - 11, h - 11), radius=50, outline=COR["amarelo"], width=12)
    texto_centro(dr, w / 2, h / 2, "ZOOLÓGICO", cabe(dr, "ZOOLÓGICO", w * 0.7, h * 0.58, contorno=6),
                 COR["amarelo_claro"], COR["chocolate"], 6)
    ic_pata(dr, 120, h / 2, 60)
    ic_pata(dr, w - 120, h / 2, 60)
    im.save(caminho)


def skate(caminho):
    w, h = 1024, 256
    im = Image.new("RGB", (w, h), COR["preto"])
    dr = ImageDraw.Draw(im)
    for k in range(9):
        dr.polygon([(k * 130 - 40, h), (k * 130 + 20, h), (k * 130 + 90, 0), (k * 130 + 30, 0)],
                   fill=COR["amarelo"] if k % 2 else COR["preto"])
    dr.rounded_rectangle((90, 40, w - 90, h - 40), radius=40, fill=COR["preto"])
    texto_centro(dr, w / 2, h / 2, "PISTA DE SKATE", cabe(dr, "PISTA DE SKATE", w * 0.7, h * 0.4, contorno=5),
                 COR["ciano"], COR["azul_escuro"], 5)
    im.save(caminho)


def desenha_tudo(pasta):
    os.makedirs(pasta, exist_ok=True)
    j = lambda n: os.path.join(pasta, n + ".png")  # noqa: E731
    festival(j("festival"))
    show_vertical(j("show"))
    telao(j("telao"))
    circo(j("circo"))
    zoologico(j("zoologico"))
    skate(j("skate"))
    placa(j("sorvete"), "SORVETE", COR["rosa"], COR["branco"], COR["magenta"], borda=COR["branco"], icone=ic_casquinha)
    placa(j("pipoca"), "PIPOCA", COR["vermelho"], COR["amarelo"], COR["vermelho_escuro"], borda=COR["amarelo"],
          icone=ic_pipoca)
    placa(j("algodao"), "ALGODÃO-DOCE", COR["lilas"], COR["branco"], COR["roxo_escuro"], w=1280, borda=COR["rosa_claro"],
          icone=ic_algodao)
    placa(j("ingressos"), "INGRESSOS", COR["azul"], COR["amarelo"], COR["azul_escuro"], borda=COR["amarelo"],
          icone=ic_ingresso)
    return pasta


if __name__ == "__main__":
    print(desenha_tudo(os.path.join(sys.argv[1], "parque_areas", "estampas")))
