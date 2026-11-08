"""Estampas da sinalização da cidade do Morada (outdoors, faixas, painéis, totens e placas), desenhadas com PIL.

Uso: python3 -I morada-art/sinalizacao_estampas.py SP/cidade_out [nomes...]
Grava SP/cidade_out/sinalizacao/estampas/<nome>.png. O gerador (cidade_sinalizacao.py) carrega cada PNG com
mb.material_estampa. Só palavras genéricas em português, sem nome de marca.

Estampas animadas:
- "rolar": o PNG emenda em U (a ponta direita continua na esquerda); a malha mostra só um trecho e a página corre a
  textura em U.
- "trocar": os quadros ficam lado a lado em U, da esquerda para a direita (a malha mostra o primeiro).
Ilustrações em cartum: formas simples, degradês, contorno escuro e texto grande. Desenho em 2× e redução (antisserrilha).
"""
import math
import os
import random
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

SAIDA = sys.argv[1]
FILTRO = sys.argv[2:]
PASTA = os.path.join(SAIDA, "sinalizacao", "estampas")
os.makedirs(PASTA, exist_ok=True)
F_BLACK = "/usr/share/fonts/opentype/inter/Inter-Black.otf"
F_BLACK_IT = "/usr/share/fonts/opentype/inter/Inter-BlackItalic.otf"
F_XBOLD = "/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf"
SS = 2

# cores vivas (sRGB)
PRETO = (24, 26, 36)
MARINHO = (22, 32, 72)
BRANCO = (250, 250, 246)
AMARELO = (255, 212, 52)
AMARELO_C = (255, 236, 140)
LARANJA = (255, 138, 48)
VERMELHO = (232, 64, 76)
ROSA = (255, 86, 170)
ROSA_C = (255, 170, 210)
MAGENTA = (220, 50, 160)
ROXO = (122, 70, 208)
ROXO_E = (52, 24, 92)
LILAS = (190, 150, 255)
CIANO = (70, 226, 255)
TURQUESA = (36, 186, 198)
AZUL = (48, 128, 230)
AZUL_C = (130, 200, 250)
AZUL_E = (28, 60, 150)
VERDE = (76, 186, 90)
VERDE_C = (150, 220, 110)
VERDE_E = (30, 120, 72)
MARROM = (130, 82, 52)
PELE = (240, 190, 150)
PELE2 = (180, 120, 84)
CINZA = (160, 168, 180)
CINZA_E = (80, 88, 100)


def mistura(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


class Tela:
    """Tela de desenho em SS× com coordenadas no tamanho final."""

    def __init__(self, w, h, fundo=PRETO, ss=SS):
        self.w, self.h, self.s = w, h, ss
        f = fundo if len(fundo) == 4 else (*fundo, 255)
        self.img = Image.new("RGBA", (w * ss, h * ss), f)
        self.d = ImageDraw.Draw(self.img)

    def P(self, pts):
        return [(x * self.s, y * self.s) for x, y in pts]

    def B(self, x0, y0, x1, y1):
        return [min(x0, x1) * self.s, min(y0, y1) * self.s, max(x0, x1) * self.s, max(y0, y1) * self.s]

    def ret(self, x0, y0, x1, y1, cor, raio=0, borda=None, lb=0, d=None):
        (d or self.d).rounded_rectangle(self.B(x0, y0, x1, y1), radius=raio * self.s, fill=cor, outline=borda,
                                        width=int(lb * self.s))

    def elipse(self, cx, cy, rx, ry, cor, borda=None, lb=0, d=None):
        (d or self.d).ellipse(self.B(cx - rx, cy - ry, cx + rx, cy + ry), fill=cor, outline=borda,
                              width=int(lb * self.s))

    def circ(self, cx, cy, r, cor, borda=None, lb=0, d=None):
        self.elipse(cx, cy, r, r, cor, borda, lb, d)

    def poli(self, pts, cor, borda=None, lb=0, d=None):
        dd = d or self.d
        dd.polygon(self.P(pts), fill=cor)
        if borda and lb:
            dd.line(self.P(list(pts) + [pts[0], pts[1]]), fill=borda, width=int(lb * self.s), joint="curve")

    def linha(self, pts, cor, lb, d=None, pontas=True):
        dd = d or self.d
        dd.line(self.P(pts), fill=cor, width=int(lb * self.s), joint="curve")
        if pontas:
            for x, y in (pts[0], pts[-1]):
                self.circ(x, y, lb / 2, cor, d=dd)

    def arco(self, cx, cy, r, a0, a1, cor, lb, d=None):
        (d or self.d).arc(self.B(cx - r, cy - r, cx + r, cy + r), a0, a1, fill=cor, width=int(lb * self.s))

    def mascara(self):
        m = Image.new("L", self.img.size, 0)
        return m, ImageDraw.Draw(m)

    def grad(self, cores, box=None, vertical=True, mascara=None):
        """Degradê de várias cores (lista igualmente espaçada) na caixa, recortado pela máscara (opcional)."""
        x0, y0, x1, y1 = box or (0, 0, self.w, self.h)
        bx = self.B(x0, y0, x1, y1)
        W, H = max(1, int(bx[2] - bx[0])), max(1, int(bx[3] - bx[1]))
        n = H if vertical else W
        faixa = Image.new("RGBA", (1, n) if vertical else (n, 1))
        px = faixa.load()
        for i in range(n):
            t = i / max(1, n - 1) * (len(cores) - 1)
            k = min(len(cores) - 2, int(t))
            c = mistura(cores[k], cores[k + 1], t - k)
            if vertical:
                px[0, i] = (*c, 255)
            else:
                px[i, 0] = (*c, 255)
        g = faixa.resize((W, H))
        camada = Image.new("RGBA", self.img.size, (0, 0, 0, 0))
        camada.paste(g, (int(bx[0]), int(bx[1])))
        if mascara is not None:
            a = Image.new("L", self.img.size, 0)
            a.paste(mascara, (0, 0))
            camada.putalpha(Image.composite(camada.getchannel("A"), Image.new("L", self.img.size, 0), a))
        self.img.alpha_composite(camada)

    def fonte(self, arq, tam):
        return ImageFont.truetype(arq, max(4, int(tam * self.s)))

    def texto(self, txt, box, arq=F_BLACK, cor=BRANCO, contorno=None, lc=0.0, sombra=None, ds=(0.0, 0.06),
              alinhar="c", tam=None, espaco=0.1, glow=None):
        """Texto (uma ou mais linhas) no maior tamanho que cabe na caixa. lc e ds em fração do tamanho da letra."""
        x0, y0, x1, y1 = box
        W, H = (x1 - x0), (y1 - y0)
        t = tam or H
        while True:
            f = self.fonte(arq, t)
            sw = int(t * lc * self.s)
            bb = self.d.multiline_textbbox((0, 0), txt, font=f, spacing=int(t * espaco * self.s), align="center",
                                           stroke_width=sw)
            tw, th = (bb[2] - bb[0]) / self.s, (bb[3] - bb[1]) / self.s
            if (tw <= W and th <= H) or t < 5:
                break
            t *= 0.95
        if alinhar == "c":
            px = x0 + (W - tw) / 2
        elif alinhar == "e":
            px = x0
        else:
            px = x1 - tw
        py = y0 + (H - th) / 2
        org = (px * self.s - bb[0], py * self.s - bb[1])
        kw = dict(font=f, spacing=int(t * espaco * self.s), align="center")
        if glow:
            cam = Image.new("RGBA", self.img.size, (0, 0, 0, 0))
            ImageDraw.Draw(cam).multiline_text(org, txt, fill=glow, stroke_width=sw + int(t * 0.08 * self.s),
                                               stroke_fill=glow, **kw)
            cam = cam.filter(ImageFilter.GaussianBlur(t * 0.12 * self.s))
            self.img.alpha_composite(cam)
        if sombra:
            self.d.multiline_text((org[0] + ds[0] * t * self.s, org[1] + ds[1] * t * self.s), txt, fill=sombra,
                                  stroke_width=sw, stroke_fill=sombra, **kw)
        self.d.multiline_text(org, txt, fill=cor, stroke_width=sw, stroke_fill=contorno or cor, **kw)
        return (px, py, px + tw, py + th)

    def brilho(self, raio=6, forca=1.0):
        """Halo de luz por cima de tudo (neon)."""
        b = self.img.filter(ImageFilter.GaussianBlur(raio * self.s))
        from PIL import ImageChops
        b = Image.eval(b, lambda v: int(v * forca))
        self.img = ImageChops.add(self.img, b)
        self.img.putalpha(255)
        self.d = ImageDraw.Draw(self.img)

    def colar(self, outra, x, y):
        self.img.alpha_composite(outra.img, (int(x * self.s), int(y * self.s)))

    def imagem(self):
        return self.img.resize((self.w, self.h), Image.LANCZOS)

    def salva(self, nome):
        if FILTRO and nome not in FILTRO:
            return
        self.imagem().convert("RGB").save(os.path.join(PASTA, nome + ".png"))
        print("estampa", nome, self.w, self.h, flush=True)


def junta_quadros(nome, telas):
    """Quadros lado a lado em U (anima "trocar")."""
    if FILTRO and nome not in FILTRO:
        return
    ims = [t.imagem().convert("RGB") for t in telas]
    W = sum(i.width for i in ims)
    out = Image.new("RGB", (W, ims[0].height))
    x = 0
    for i in ims:
        out.paste(i, (x, 0))
        x += i.width
    out.save(os.path.join(PASTA, nome + ".png"))
    print("estampa", nome, out.size, "quadros", len(ims), flush=True)


# ======================================================================================================================
# Letra de pixel (5 × 7, com acentos em cima e cedilha embaixo)
# ======================================================================================================================
GL = {
    "A": "01110 10001 10001 11111 10001 10001 10001", "B": "11110 10001 10001 11110 10001 10001 11110",
    "C": "01110 10001 10000 10000 10000 10001 01110", "D": "11110 10001 10001 10001 10001 10001 11110",
    "E": "11111 10000 10000 11110 10000 10000 11111", "F": "11111 10000 10000 11110 10000 10000 10000",
    "G": "01110 10001 10000 10111 10001 10001 01111", "H": "10001 10001 10001 11111 10001 10001 10001",
    "I": "111 010 010 010 010 010 111", "J": "00111 00010 00010 00010 00010 10010 01100",
    "K": "10001 10010 10100 11000 10100 10010 10001", "L": "10000 10000 10000 10000 10000 10000 11111",
    "M": "10001 11011 10101 10101 10001 10001 10001", "N": "10001 10001 11001 10101 10011 10001 10001",
    "O": "01110 10001 10001 10001 10001 10001 01110", "P": "11110 10001 10001 11110 10000 10000 10000",
    "Q": "01110 10001 10001 10001 10101 10010 01101", "R": "11110 10001 10001 11110 10100 10010 10001",
    "S": "01111 10000 10000 01110 00001 00001 11110", "T": "11111 00100 00100 00100 00100 00100 00100",
    "U": "10001 10001 10001 10001 10001 10001 01110", "V": "10001 10001 10001 10001 10001 01010 00100",
    "W": "10001 10001 10001 10101 10101 10101 01010", "X": "10001 10001 01010 00100 01010 10001 10001",
    "Y": "10001 10001 01010 00100 00100 00100 00100", "Z": "11111 00001 00010 00100 01000 10000 11111",
    "0": "01110 10001 10011 10101 11001 10001 01110", "1": "00100 01100 00100 00100 00100 00100 01110",
    "2": "01110 10001 00001 00010 00100 01000 11111", "3": "11111 00010 00100 00010 00001 10001 01110",
    "4": "00010 00110 01010 10010 11111 00010 00010", "5": "11111 10000 11110 00001 00001 10001 01110",
    "6": "00110 01000 10000 11110 10001 10001 01110", "7": "11111 00001 00010 00100 01000 01000 01000",
    "8": "01110 10001 10001 01110 10001 10001 01110", "9": "01110 10001 10001 01111 00001 00010 01100",
    " ": "000 000 000 000 000 000 000", ".": "0 0 0 0 0 0 1", ",": "00 00 00 00 00 01 10",
    "!": "1 1 1 1 1 0 1", "?": "01110 10001 00001 00010 00100 00000 00100", "-": "0000 0000 0000 1111 0000 0000 0000",
    "+": "00000 00100 00100 11111 00100 00100 00000", ":": "0 1 1 0 1 1 0", "°": "010 101 010 000 000 000 000",
    "•": "000 000 010 111 010 000 000", "*": "00100 10101 01110 11111 01110 10101 00100",
    "♥": "01010 11111 11111 11111 01110 00100 00000", "%": "11001 11010 00010 00100 01000 01011 10011",
    ">": "10000 01000 00100 00010 00100 01000 10000", "/": "00001 00010 00010 00100 01000 01000 10000",
}
ACENTO = {"Á": ("A", "00010 00100"), "É": ("E", "00010 00100"), "Í": ("I", "001 010"), "Ó": ("O", "00010 00100"),
          "Ú": ("U", "00010 00100"), "Ã": ("A", "01101 10110"), "Õ": ("O", "01101 10110"), "Â": ("A", "00100 01010"),
          "Ê": ("E", "00100 01010"), "À": ("A", "01000 00100"), "Ô": ("O", "00100 01010"), "º": ("°", "")}


def glifo(ch):
    """Matriz (linhas de 0/1) com 2 linhas de acento em cima, 7 da letra e 2 de cedilha embaixo."""
    if ch == "Ç":
        base, cima, baixo = GL["C"], "", "00100 01100"
    elif ch in ACENTO:
        b, cima = ACENTO[ch]
        base, baixo = GL[b], ""
    else:
        base, cima, baixo = GL.get(ch, GL["?"]), "", ""
    linhas = base.split()
    w = len(linhas[0])
    cima_l = cima.split() if cima else ["0" * w] * 2
    baixo_l = baixo.split() if baixo else ["0" * w] * 2
    cima_l = [c[:w].ljust(w, "0") for c in cima_l]
    baixo_l = [c[:w].ljust(w, "0") for c in baixo_l]
    return cima_l + linhas + baixo_l


def pixel_largura(txt, p, gap_letra=1):
    return sum((len(glifo(c)[0]) + gap_letra) * p for c in txt)


def pixel_texto(t, txt, x, y, p, cor, gap=0.18, sombra=None, ds=(1, 1), redondo=False, cores=None):
    """Texto em letra de pixel: x, y = canto de cima da letra (sem o acento); p = tamanho do pixel."""
    cx = x
    for i, ch in enumerate(txt):
        g = glifo(ch)
        c = cores[i % len(cores)] if cores else cor
        for j, lin in enumerate(g):
            for k, b in enumerate(lin):
                if b != "1":
                    continue
                px0, py0 = cx + k * p, y + (j - 2) * p
                g_ = p * gap
                if sombra:
                    t.ret(px0 + ds[0] * p * 0.5, py0 + ds[1] * p * 0.5, px0 + p - g_ + ds[0] * p * 0.5,
                          py0 + p - g_ + ds[1] * p * 0.5, sombra)
                if redondo:
                    t.circ(px0 + (p - g_) / 2, py0 + (p - g_) / 2, (p - g_) / 2, c)
                else:
                    t.ret(px0, py0, px0 + p - g_, py0 + p - g_, c, raio=p * 0.15)
        cx += (len(g[0]) + 1) * p
    return cx


def pixel_caixa(t, txt, box, cor, **k):
    """Texto de pixel centrado na caixa, no maior pixel inteiro (em px finais × 0,5) que cabe."""
    x0, y0, x1, y1 = box
    p = min((x1 - x0) / (pixel_largura(txt, 1) - 1), (y1 - y0) / 7)
    w = pixel_largura(txt, p) - p
    return pixel_texto(t, txt, x0 + (x1 - x0 - w) / 2, y0 + (y1 - y0 - 7 * p) / 2, p, cor, **k), p


# ======================================================================================================================
# Peças de ilustração (cartum)
# ======================================================================================================================
def ceu(t, cores, box=None):
    t.grad(cores, box)


def sol(t, x, y, r, cor=AMARELO, raios=True, halo=True):
    if halo:
        for k in range(4, 0, -1):
            t.circ(x, y, r * (1 + 0.18 * k), (*mistura(cor, BRANCO, 0.5), 40))
    if raios:
        for k in range(12):
            a = math.radians(k * 30)
            t.linha([(x + math.cos(a) * r * 1.25, y + math.sin(a) * r * 1.25),
                     (x + math.cos(a) * r * 1.55, y + math.sin(a) * r * 1.55)], cor, r * 0.14)
    t.circ(x, y, r, cor)
    t.circ(x - r * 0.3, y - r * 0.3, r * 0.35, mistura(cor, BRANCO, 0.45))


def nuvem(t, x, y, s, cor=BRANCO):
    for dx, dy, r in ((-0.55, 0.1, 0.38), (-0.15, -0.15, 0.5), (0.35, -0.02, 0.42), (0.7, 0.15, 0.3)):
        t.circ(x + dx * s, y + dy * s, r * s, cor)
    t.ret(x - 0.9 * s, y + 0.05 * s, x + 0.95 * s, y + 0.45 * s, cor, raio=0.2 * s)


def predios(t, y_base, x0, x1, cores, semente=1, h_min=0.3, h_max=0.9, alt=100, janelas=AMARELO_C, larg=(0.06, 0.12),
            topo=True):
    """Silhueta de prédios de x0 a x1 (alturas em fração de 'alt'), janelas em quadradinhos."""
    r = random.Random(semente)
    x = x0
    W = x1 - x0
    while x < x1:
        w = W * r.uniform(*larg)
        h = alt * r.uniform(h_min, h_max)
        c = r.choice(cores)
        t.ret(x, y_base - h, x + w, y_base + 2, c, raio=min(w, h) * 0.08)
        if topo and r.random() < 0.35:
            t.ret(x + w * 0.4, y_base - h - alt * 0.08, x + w * 0.46, y_base - h, c)
        if janelas:
            cw = max(3.0, w / 5)
            for jx in range(int((w - cw * 0.5) // cw)):
                for jy in range(int((h - cw) // (cw * 1.4))):
                    if r.random() < 0.55:
                        xx = x + cw * 0.6 + jx * cw
                        yy = y_base - h + cw * 0.8 + jy * cw * 1.4
                        if xx + cw * 0.5 < x + w - 1:
                            t.ret(xx, yy, xx + cw * 0.5, yy + cw * 0.6, janelas)
        x += w + W * r.uniform(0.0, 0.015)


def arvore(t, x, y, s, copa=VERDE, tronco=MARROM, tipo="redonda"):
    t.ret(x - s * 0.08, y - s * 0.5, x + s * 0.08, y, tronco, raio=s * 0.04)
    if tipo == "redonda":
        t.circ(x, y - s * 0.75, s * 0.42, mistura(copa, PRETO, 0.15))
        t.circ(x - s * 0.06, y - s * 0.8, s * 0.36, copa)
        t.circ(x - s * 0.17, y - s * 0.92, s * 0.12, mistura(copa, BRANCO, 0.35))
    else:
        t.poli([(x - s * 0.36, y - s * 0.35), (x + s * 0.36, y - s * 0.35), (x, y - s * 1.3)], copa)
        t.poli([(x - s * 0.36, y - s * 0.35), (x, y - s * 0.35), (x, y - s * 1.3)], mistura(copa, BRANCO, 0.2))


def morro(t, y, x0, x1, amp, cor, fase=0.0, ondas=1.5, base=None):
    base = base if base is not None else t.h
    pts = [(x0 + (x1 - x0) * k / 40, y - amp * (0.5 + 0.5 * math.sin(fase + ondas * math.pi * k / 40)))
           for k in range(41)]
    t.poli(pts + [(x1, base), (x0, base)], cor)


def folha(t, x, y, s, ang=30, cor=VERDE, veio=VERDE_E):
    a = math.radians(ang)
    pts = []
    for k in range(21):
        u = k / 20
        w = math.sin(math.pi * u) * 0.38
        pts.append((u, w))
    pts += [(u, -w) for u, w in pts[::-1]]

    def rot(u, v):
        return (x + (u * math.cos(a) - v * math.sin(a)) * s, y + (u * math.sin(a) + v * math.cos(a)) * s)
    t.poli([rot(u, v) for u, v in pts], cor)
    t.linha([rot(0.05, 0), rot(0.92, 0)], veio, s * 0.05)


def raio_icone(t, x, y, s, cor=AMARELO, borda=PRETO):
    pts = [(0.15, -0.5), (-0.25, 0.08), (0.02, 0.08), (-0.15, 0.5), (0.3, -0.12), (0.03, -0.12), (0.2, -0.5)]
    t.poli([(x + px * s, y + py * s) for px, py in pts], cor, borda, s * 0.06)


def carro(t, x, y, s, cor=VERDE, vidro=AZUL_C, frente=1):
    """Carro de lado (frente para a direita se frente = 1): x, y = centro da base (chão)."""
    f = frente

    def X(v):
        return x + v * s * f
    esc = mistura(cor, PRETO, 0.3)
    corpo = [(X(-1.0), y - 0.2 * s), (X(-1.0), y - 0.55 * s), (X(-0.6), y - 0.62 * s), (X(-0.35), y - 0.98 * s),
             (X(0.38), y - 0.98 * s), (X(0.7), y - 0.62 * s), (X(1.0), y - 0.55 * s), (X(1.02), y - 0.2 * s)]
    t.poli(corpo, cor, esc, s * 0.05)
    t.poli([(X(-0.28), y - 0.9 * s), (X(0.02), y - 0.9 * s), (X(0.02), y - 0.64 * s), (X(-0.5), y - 0.64 * s)], vidro)
    t.poli([(X(0.1), y - 0.9 * s), (X(0.34), y - 0.9 * s), (X(0.56), y - 0.64 * s), (X(0.1), y - 0.64 * s)], vidro)
    t.ret(min(X(0.88), X(1.0)), y - 0.5 * s, max(X(0.88), X(1.0)), y - 0.4 * s, AMARELO_C, raio=s * 0.03)
    t.linha([(X(-0.85), y - 0.42 * s), (X(0.85), y - 0.42 * s)], mistura(cor, BRANCO, 0.35), s * 0.04)
    for wx in (-0.6, 0.62):
        t.circ(X(wx), y - 0.18 * s, 0.22 * s, PRETO)
        t.circ(X(wx), y - 0.18 * s, 0.1 * s, CINZA)


def pessoa(t, x, y, s, pele=PELE, roupa=AZUL, cabelo=MARROM, bracos="cima", olhos_fechados=False):
    """Bonequinho fofo: x, y = pés no chão, s = altura."""
    cab = s * 0.17
    yc = y - s + cab
    t.ret(x - s * 0.17, y - s * 0.62, x + s * 0.17, y - s * 0.12, roupa, raio=s * 0.1)
    t.ret(x - s * 0.13, y - s * 0.16, x - s * 0.02, y, PRETO, raio=s * 0.04)
    t.ret(x + s * 0.02, y - s * 0.16, x + s * 0.13, y, PRETO, raio=s * 0.04)
    if bracos == "cima":
        t.linha([(x - s * 0.14, y - s * 0.55), (x - s * 0.32, y - s * 0.86)], roupa, s * 0.09)
        t.linha([(x + s * 0.14, y - s * 0.55), (x + s * 0.32, y - s * 0.86)], roupa, s * 0.09)
        t.circ(x - s * 0.33, y - s * 0.9, s * 0.055, pele)
        t.circ(x + s * 0.33, y - s * 0.9, s * 0.055, pele)
    else:
        t.linha([(x - s * 0.15, y - s * 0.55), (x - s * 0.22, y - s * 0.3)], roupa, s * 0.09)
        t.linha([(x + s * 0.15, y - s * 0.55), (x + s * 0.22, y - s * 0.3)], roupa, s * 0.09)
    t.circ(x, yc, cab, pele)
    t.elipse(x, yc - cab * 0.45, cab * 1.05, cab * 0.6, cabelo)
    if olhos_fechados:
        for sx in (-1, 1):
            t.arco(x + sx * cab * 0.38, yc + cab * 0.05, cab * 0.18, 20, 160, PRETO, cab * 0.12)
    else:
        for sx in (-1, 1):
            t.circ(x + sx * cab * 0.38, yc + cab * 0.1, cab * 0.12, PRETO)
    t.arco(x, yc + cab * 0.25, cab * 0.35, 30, 150, PRETO, cab * 0.1)
    t.circ(x - cab * 0.62, yc + cab * 0.42, cab * 0.14, ROSA_C)
    t.circ(x + cab * 0.62, yc + cab * 0.42, cab * 0.14, ROSA_C)


def estrela(t, x, y, r, cor=AMARELO, borda=None, lb=0, pontas=5, rot=-90, interno=0.45):
    pts = []
    for k in range(pontas * 2):
        rr = r if k % 2 == 0 else r * interno
        a = math.radians(rot + 180 * k / pontas)
        pts.append((x + rr * math.cos(a), y + rr * math.sin(a)))
    t.poli(pts, cor, borda, lb)


def coracao(t, x, y, s, cor=ROSA):
    t.circ(x - s * 0.25, y - s * 0.1, s * 0.28, cor)
    t.circ(x + s * 0.25, y - s * 0.1, s * 0.28, cor)
    t.poli([(x - s * 0.52, y - s * 0.02), (x + s * 0.52, y - s * 0.02), (x, y + s * 0.55)], cor)


def estrelinhas(t, n, box, semente=3, cor=BRANCO, r=(1.0, 2.5)):
    q = random.Random(semente)
    x0, y0, x1, y1 = box
    for _ in range(n):
        x, y = q.uniform(x0, x1), q.uniform(y0, y1)
        rr = q.uniform(*r)
        if q.random() < 0.2:
            estrela(t, x, y, rr * 2.2, cor, pontas=4, rot=0, interno=0.3)
        else:
            t.circ(x, y, rr, cor)


def faixa_ponta(t, lado, larg, cores):
    """Faixa de cor na ponta das faixas de fachada (listras inclinadas)."""
    n = len(cores)
    for k, c in enumerate(cores):
        if lado == "d":
            x1 = t.w - k * larg / n
            t.poli([(x1 - larg / n - t.h * 0.25, t.h), (x1 - t.h * 0.25, t.h), (x1, 0), (x1 - larg / n, 0)], c)
        else:
            x0 = k * larg / n
            t.poli([(x0, t.h), (x0 + larg / n, t.h), (x0 + larg / n + t.h * 0.25, 0), (x0 + t.h * 0.25, 0)], c)
    if lado == "d":
        t.ret(t.w - larg * 0.2, 0, t.w, t.h, cores[0])
    else:
        t.ret(0, 0, larg * 0.2, t.h, cores[0])


def moldura(t, cor=PRETO, lb=None, raio=None):
    lb = lb or min(t.w, t.h) * 0.035
    t.ret(lb / 2, lb / 2, t.w - lb / 2, t.h - lb / 2, None, raio=raio if raio is not None else lb * 1.2, borda=cor,
          lb=lb)


# ======================================================================================================================
# Outdoors de poste (9 × 3 m)
# ======================================================================================================================
def outdoor_futuro():
    t = Tela(1200, 400)
    ceu(t, [(18, 34, 110), (40, 90, 200), (120, 170, 255)])
    estrelinhas(t, 40, (0, 0, 1200, 200), 5)
    t.circ(1010, 90, 46, (230, 240, 255))
    t.circ(992, 80, 46, (40, 80, 190))
    predios(t, 400, 0, 1200, [(60, 110, 220), (70, 130, 235), (52, 96, 200)], 3, 0.35, 0.8, 300, (150, 210, 255),
            (0.05, 0.09))
    predios(t, 400, 0, 1200, [(28, 56, 140), (34, 66, 160), (24, 48, 120)], 8, 0.2, 0.55, 300, AMARELO_C, (0.06, 0.1))
    t.ret(0, 372, 1200, 400, (20, 36, 90))
    pessoa(t, 960, 372, 230, roupa=AMARELO, cabelo=(60, 36, 24))
    estrela(t, 1100, 120, 26, AMARELO)
    estrela(t, 830, 150, 16, AMARELO_C)
    t.texto("O FUTURO", (50, 40, 760, 190), F_BLACK_IT, BRANCO, PRETO, 0.07, sombra=(10, 14, 50), ds=(0.04, 0.07))
    t.texto("É AGORA", (50, 190, 640, 320), F_BLACK_IT, AMARELO, PRETO, 0.07, sombra=(10, 14, 50), ds=(0.04, 0.07))
    moldura(t, (16, 18, 30), 12)
    t.salva("outdoor_futuro")


def outdoor_carro():
    t = Tela(1200, 400)
    ceu(t, [(110, 196, 255), (200, 236, 255)])
    sol(t, 1080, 80, 44)
    nuvem(t, 760, 80, 50)
    nuvem(t, 330, 60, 36)
    morro(t, 270, 0, 1200, 60, (120, 210, 110), 0.5, 1.4)
    morro(t, 300, 0, 1200, 40, VERDE, 2.0, 2.2)
    for k, x in enumerate(range(40, 1200, 140)):
        arvore(t, x + (k % 2) * 30, 300 - (k % 3) * 6, 60 + (k % 3) * 10, (60, 170, 80) if k % 2 else VERDE_E)
    t.poli([(0, 330), (1200, 310), (1200, 400), (0, 400)], (70, 76, 88))
    for x in range(0, 1200, 120):
        t.poli([(x, 360 - x * 0.016), (x + 60, 359 - x * 0.016), (x + 60, 365 - x * 0.016), (x, 366 - x * 0.016)],
               BRANCO)
    carro(t, 820, 362, 120, (70, 200, 100))
    folha(t, 1010, 230, 120, -50, (110, 220, 90))
    raio_icone(t, 1060, 172, 60)
    t.texto("CARRO", (40, 40, 600, 160), F_BLACK_IT, BRANCO, VERDE_E, 0.08, sombra=(20, 80, 50), ds=(0.04, 0.07))
    t.texto("ELÉTRICO", (40, 160, 600, 280), F_BLACK_IT, (255, 236, 80), VERDE_E, 0.08, sombra=(20, 80, 50),
            ds=(0.04, 0.07))
    moldura(t, (16, 18, 30), 12)
    t.salva("outdoor_carro")


def oculos_vr(t, x, y, s, cor=BRANCO):
    t.ret(x - s, y - s * 0.45, x + s, y + s * 0.45, cor, raio=s * 0.32, borda=PRETO, lb=s * 0.05)
    t.ret(x - s * 0.86, y - s * 0.3, x + s * 0.86, y + s * 0.3, (30, 24, 60), raio=s * 0.24)
    t.grad([(255, 80, 200), (80, 220, 255)], (x - s * 0.8, y - s * 0.25, x + s * 0.8, y + s * 0.25), False)
    t.ret(x - s * 0.7, y - s * 0.16, x - s * 0.2, y - s * 0.08, (255, 255, 255, 150), raio=s * 0.04)
    t.ret(x - s * 1.25, y - s * 0.12, x - s * 0.98, y + s * 0.12, (60, 60, 80), raio=s * 0.06)
    t.ret(x + s * 0.98, y - s * 0.12, x + s * 1.25, y + s * 0.12, (60, 60, 80), raio=s * 0.06)
    t.ret(x - s * 0.18, y + s * 0.3, x + s * 0.18, y + s * 0.5, cor, raio=s * 0.1)


def controle(t, x, y, s, ang=0, cor=(240, 240, 250)):
    t.ret(x - s * 0.22, y - s * 0.1, x + s * 0.22, y + s * 0.8, cor, raio=s * 0.18, borda=PRETO, lb=s * 0.04)
    t.circ(x, y - s * 0.2, s * 0.38, None, CIANO, s * 0.1)
    t.circ(x, y + s * 0.15, s * 0.08, ROSA)


def outdoor_vr():
    t = Tela(1200, 400)
    ceu(t, [(40, 10, 80), (120, 30, 140), (255, 90, 160)])
    sol(t, 600, 300, 120, (255, 200, 80), raios=False, halo=False)
    for k in range(6):
        t.ret(470, 230 + k * 22, 730, 236 + k * 22, (255, 90, 160))
    t.ret(0, 300, 1200, 400, (30, 8, 60))
    for k in range(-12, 13):
        t.linha([(600 + k * 30, 300), (600 + k * 160, 420)], (255, 80, 220), 2, pontas=False)
    for j, y in enumerate((310, 325, 345, 372)):
        t.linha([(0, y), (1200, y)], (255, 80, 220), 2, pontas=False)
    estrelinhas(t, 30, (0, 0, 1200, 220), 9)
    oculos_vr(t, 860, 200, 140)
    controle(t, 1080, 250, 90)
    controle(t, 650, 250, 90)
    t.texto("REALIDADE", (40, 50, 560, 170), F_BLACK_IT, CIANO, PRETO, 0.08, glow=(80, 220, 255, 160))
    t.texto("VIRTUAL", (40, 170, 500, 290), F_BLACK_IT, (255, 120, 220), PRETO, 0.08, glow=(255, 80, 200, 160))
    t.texto("JOGUE AGORA", (40, 300, 380, 360), F_BLACK, AMARELO, PRETO, 0.06)
    moldura(t, (16, 18, 30), 12)
    t.salva("outdoor_vr")


def quadro_promocao(w, h):
    t = Tela(w, h, AMARELO)
    cx, cy = w * 0.78, h * 0.5
    for k in range(24):
        a0, a1 = math.radians(k * 15), math.radians(k * 15 + 7.5)
        R = w
        t.poli([(cx, cy), (cx + R * math.cos(a0), cy + R * math.sin(a0)), (cx + R * math.cos(a1), cy + R * math.sin(a1))],
               (255, 196, 30))
    estrela(t, cx, cy, h * 0.42, VERMELHO, PRETO, 8, pontas=14, interno=0.78)
    t.texto("SÓ\nHOJE", (cx - h * 0.26, cy - h * 0.22, cx + h * 0.26, cy + h * 0.22), F_BLACK, BRANCO, espaco=0.0)
    t.texto("PROMOÇÃO", (w * 0.04, h * 0.12, w * 0.6, h * 0.6), F_BLACK_IT, VERMELHO, PRETO, 0.07, sombra=PRETO,
            ds=(0.03, 0.06))
    t.texto("APROVEITE!", (w * 0.06, h * 0.62, w * 0.5, h * 0.86), F_BLACK, PRETO)
    moldura(t, (16, 18, 30), h * 0.03)
    return t


def pipoca(t, x, y, s):
    for k in range(9):
        q = random.Random(k)
        t.circ(x + q.uniform(-0.4, 0.4) * s, y - s * 0.95 + q.uniform(-0.2, 0.15) * s, s * 0.2, (255, 244, 210))
    t.poli([(x - s * 0.45, y - s * 0.85), (x + s * 0.45, y - s * 0.85), (x + s * 0.34, y), (x - s * 0.34, y)], BRANCO)
    for k in range(3):
        xx = x - s * 0.3 + k * s * 0.3
        t.poli([(xx - s * 0.07, y - s * 0.85), (xx + s * 0.07, y - s * 0.85), (xx + s * 0.05, y), (xx - s * 0.05, y)],
               VERMELHO)


def claquete(t, x, y, s):
    t.ret(x - s, y - s * 0.5, x + s, y + s * 0.6, PRETO, raio=s * 0.06)
    t.poli([(x - s, y - s * 0.55), (x + s, y - s * 0.75), (x + s, y - s * 0.95), (x - s, y - s * 0.75)], PRETO)
    for k in range(5):
        xx = x - s + k * s * 0.42
        t.poli([(xx + s * 0.06, y - s * 0.57 - k * 0.042 * s), (xx + s * 0.24, y - s * 0.61 - k * 0.042 * s),
                (xx + s * 0.24, y - s * 0.81 - k * 0.042 * s), (xx + s * 0.06, y - s * 0.77 - k * 0.042 * s)], BRANCO)
    for k in range(3):
        t.ret(x - s * 0.8, y - s * 0.25 + k * s * 0.25, x + s * 0.8, y - s * 0.19 + k * s * 0.25, BRANCO)


def quadro_cinema(w, h):
    t = Tela(w, h)
    ceu(t, [(120, 16, 30), (60, 8, 30)])
    for k in range(7):
        t.ret(k * w / 7 + 4, 0, k * w / 7 + w / 14, h * 0.18, (160, 30, 44), raio=8)
    t.elipse(w * 0.75, h * 0.12, w * 0.25, h * 0.08, (255, 240, 180, 60))
    pipoca(t, w * 0.86, h * 0.88, h * 0.5)
    claquete(t, w * 0.66, h * 0.62, h * 0.2)
    t.texto("CINEMA", (w * 0.04, h * 0.14, w * 0.56, h * 0.62), F_BLACK, AMARELO, PRETO, 0.06, glow=(255, 200, 80, 140))
    t.texto("ESTREIA NESTA SEMANA", (w * 0.05, h * 0.66, w * 0.52, h * 0.84), F_BLACK, BRANCO)
    for k in range(18):
        t.circ(w * 0.03 + k * w * 0.055, h * 0.95, h * 0.018, AMARELO_C)
    moldura(t, (16, 18, 30), h * 0.03)
    return t


def copo_suco(t, x, y, s, cor=LARANJA):
    t.poli([(x - s * 0.36, y - s), (x + s * 0.36, y - s), (x + s * 0.28, y), (x - s * 0.28, y)], (230, 245, 255))
    t.poli([(x - s * 0.33, y - s * 0.8), (x + s * 0.33, y - s * 0.8), (x + s * 0.27, y - s * 0.04),
            (x - s * 0.27, y - s * 0.04)], cor)
    t.linha([(x + s * 0.1, y - s * 0.8), (x + s * 0.26, y - s * 1.35), (x + s * 0.45, y - s * 1.4)], ROSA, s * 0.07)
    t.circ(x - s * 0.34, y - s * 0.98, s * 0.2, (255, 200, 40), borda=(255, 240, 160), lb=s * 0.04)
    t.ret(x - s * 0.22, y - s * 0.7, x - s * 0.14, y - s * 0.2, (255, 255, 255, 110), raio=s * 0.04)


def laranja(t, x, y, r):
    t.circ(x, y, r, LARANJA)
    t.circ(x - r * 0.3, y - r * 0.3, r * 0.25, (255, 190, 110))
    folha(t, x, y - r * 0.9, r * 0.7, -40, VERDE)


def quadro_suco(w, h):
    t = Tela(w, h)
    ceu(t, [(255, 170, 60), (255, 120, 40)])
    for k in range(9):
        t.circ(w * (0.55 + 0.05 * k), h * (0.2 + 0.07 * (k % 3)), h * 0.03, (255, 220, 140))
    copo_suco(t, w * 0.78, h * 0.9, h * 0.62)
    laranja(t, w * 0.6, h * 0.8, h * 0.13)
    laranja(t, w * 0.92, h * 0.82, h * 0.1)
    t.texto("SUCO", (w * 0.04, h * 0.1, w * 0.5, h * 0.5), F_BLACK_IT, BRANCO, (150, 50, 10), 0.08)
    t.texto("FRESCO", (w * 0.04, h * 0.48, w * 0.54, h * 0.8), F_BLACK_IT, AMARELO_C, (150, 50, 10), 0.08)
    moldura(t, (16, 18, 30), h * 0.03)
    return t


def outdoor_trivision():
    w, h = 900, 300
    junta_quadros("outdoor_troca", [quadro_promocao(w, h), quadro_cinema(w, h), quadro_suco(w, h)])


def aviao(t, x, y, s, cor=BRANCO):
    t.ret(x - s, y - s * 0.12, x + s * 0.9, y + s * 0.12, cor, raio=s * 0.12, borda=CINZA_E, lb=s * 0.03)
    t.poli([(x - s * 0.1, y), (x + s * 0.25, y), (x - s * 0.35, y + s * 0.7), (x - s * 0.55, y + s * 0.7)], cor,
           CINZA_E, s * 0.03)
    t.poli([(x - s * 0.1, y), (x + s * 0.2, y), (x - s * 0.3, y - s * 0.6), (x - s * 0.48, y - s * 0.6)],
           mistura(cor, CINZA, 0.3), CINZA_E, s * 0.03)
    t.poli([(x - s * 0.85, y), (x - s * 0.65, y), (x - s * 0.95, y - s * 0.42), (x - s * 1.05, y - s * 0.42)], AZUL)
    for k in range(6):
        t.circ(x + s * 0.1 + k * s * 0.12, y - s * 0.02, s * 0.035, AZUL_C)


def outdoor_viagem():
    t = Tela(1200, 330)
    ceu(t, [(255, 140, 100), (255, 200, 120), (150, 220, 255)])
    sol(t, 300, 250, 80, (255, 230, 120), raios=False)
    t.poli([(0, 250), (1200, 250), (1200, 330), (0, 330)], (40, 150, 220))
    for k in range(12):
        t.linha([(k * 100 + 20, 275 + (k % 3) * 14), (k * 100 + 70, 275 + (k % 3) * 14)], (150, 220, 255), 5)
    t.poli([(700, 330), (850, 285), (1200, 280), (1200, 330)], (255, 220, 150))
    for x in (1020, 1110):
        t.linha([(x, 300), (x + 18, 210)], MARROM, 12)
        for a in (-150, -110, -60, -20, 10):
            r = math.radians(a)
            t.linha([(x + 18, 210), (x + 18 + 60 * math.cos(r), 210 + 40 * math.sin(r) + 20)], VERDE, 10)
    aviao(t, 760, 110, 110)
    t.linha([(560, 120), (640, 112)], (255, 255, 255, 160), 8)
    t.texto("BOA", (40, 30, 420, 130), F_BLACK_IT, BRANCO, (180, 60, 40), 0.08)
    t.texto("VIAGEM", (40, 120, 560, 230), F_BLACK_IT, AMARELO, (180, 60, 40), 0.08)
    moldura(t, (16, 18, 30), 12)
    t.salva("outdoor_viagem")


def led_loop(nome, msg, cor, fundo=(10, 8, 12), h=128, cores=None, n=1, p=None, apagado=(40, 22, 22)):
    """Faixa de LED que emenda em U: a mensagem repetida n vezes; pontos apagados no fundo."""
    p = p or h / 9
    mw = pixel_largura(msg, p)
    W = int(round(mw * n))
    t = Tela(W, h, fundo)
    # grade de LEDs apagados
    for j in range(int(h // p)):
        for i in range(int(W // p) + 1):
            t.circ(i * p + p * 0.45, j * p + p * 0.45 + (h - 9 * p) / 2 - p * 0.0, p * 0.32, apagado)
    for k in range(n):
        pixel_texto(t, msg, k * mw + p * 0.5, (h - 7 * p) / 2, p, cor, gap=0.12, redondo=True, cores=cores)
    t.brilho(p * 0.5, 0.7)
    t.salva(nome)


def outdoor_led():
    led_loop("led_viagem", "BEM-VINDO À CIDADE * BOM DIA * 25°C * ", (255, 190, 60), h=96, apagado=(48, 30, 16))


# ======================================================================================================================
# Faixas de fachada (5:1 a 8:1)
# ======================================================================================================================
def faixa_futuro():
    t = Tela(1024, 170, (14, 14, 20))
    faixa_ponta(t, "d", 150, [ROSA, (255, 140, 200), AMARELO])
    pixel_caixa(t, "O FUTURO É...", (40, 30, 840, 140), CIANO, sombra=MAGENTA, ds=(1.2, 1.2))
    moldura(t, PRETO, 8, 6)
    t.salva("faixa_futuro")


def faixa_energia():
    t = Tela(1024, 164, MARINHO)
    faixa_ponta(t, "e", 150, [TURQUESA, (120, 230, 230), BRANCO])
    for k in range(14):
        t.circ(240 + k * 56, 20 + (k % 2) * 124, 3, (90, 110, 180))
    t.texto("SINTA A ENERGIA", (190, 20, 920, 144), F_BLACK_IT, AMARELO, PRETO, 0.09, sombra=(255, 90, 160),
            ds=(0.05, 0.07))
    raio_icone(t, 960, 82, 100)
    moldura(t, PRETO, 8, 6)
    t.salva("faixa_energia")


def aviaozinho(t, x, y, s, cor=BRANCO, borda=AZUL_E):
    t.poli([(x - s, y), (x + s, y - s * 0.45), (x - s * 0.2, y + s * 0.45)], cor, borda, s * 0.06)
    t.poli([(x - s * 0.2, y + s * 0.45), (x + s, y - s * 0.45), (x - s * 0.05, y + s * 0.1)], mistura(cor, CINZA, 0.4),
           borda, s * 0.06)


def faixa_sonhe():
    t = Tela(1024, 170, BRANCO)
    faixa_ponta(t, "d", 140, [LARANJA, AMARELO, ROSA])
    t.texto("SONHE ALTO, VOE", (40, 22, 790, 148), F_BLACK_IT, ROSA, MARINHO, 0.1, sombra=MARINHO, ds=(0.04, 0.07))
    aviaozinho(t, 840, 70, 36)
    t.linha([(760, 130), (790, 115), (810, 95)], (180, 190, 220), 4)
    moldura(t, PRETO, 8, 6)
    t.salva("faixa_sonhe")


def faixa_limpa():
    t = Tela(1024, 166, TURQUESA)
    faixa_ponta(t, "d", 150, [VERDE, VERDE_C, BRANCO])
    sol(t, 90, 83, 34, AMARELO, raios=True, halo=False)
    folha(t, 150, 110, 70, -40, VERDE_C)
    t.texto("ENERGIA LIMPA", (210, 22, 850, 144), F_BLACK, BRANCO, (10, 90, 100), 0.08, sombra=(10, 90, 100),
            ds=(0.03, 0.06))
    moldura(t, PRETO, 8, 6)
    t.salva("faixa_limpa")


def led_aberto():
    led_loop("led_aberto", "ABERTO • BEM-VINDO • ENTRE • ", (255, 70, 60), h=96)


def led_promocao():
    led_loop("led_promocao", "PROMOÇÃO DE HOJE * LANCHE + SUCO * ", None, h=96, apagado=(30, 30, 50),
             cores=[(255, 220, 60), (255, 120, 200), (90, 230, 255), (140, 255, 120)])


def bandeira_festa():
    t = Tela(1024, 256, ROXO)
    t.grad([(150, 80, 230), (90, 40, 170)])
    for k in range(17):
        x = k * 64
        t.poli([(x, 0), (x + 64, 0), (x + 32, 26)], (AMARELO, ROSA, CIANO)[k % 3])
        t.poli([(x, 256), (x + 64, 256), (x + 32, 230)], (AMARELO, ROSA, CIANO)[(k + 1) % 3])
    pixel_caixa(t, "FESTA NA RUA", (60, 60, 964, 196), AMARELO, sombra=ROXO_E, ds=(1, 1))
    t.salva("bandeira_festa")


# ======================================================================================================================
# Painéis de fachada (16:9)
# ======================================================================================================================
def painel_parque():
    t = Tela(768, 432)
    ceu(t, [(100, 190, 255), (200, 236, 255)])
    sol(t, 650, 80, 40)
    nuvem(t, 200, 70, 40)
    nuvem(t, 470, 110, 28)
    morro(t, 260, 0, 768, 50, (110, 200, 100), 0.4, 1.2)
    morro(t, 290, 0, 768, 30, VERDE, 2.2, 2.0)
    t.elipse(420, 340, 240, 46, (60, 160, 230))
    t.elipse(400, 330, 160, 22, (130, 210, 250))
    t.poli([(330, 330), (380, 330), (372, 340), (338, 340)], BRANCO)
    t.poli([(355, 328), (355, 300), (378, 322)], ROSA)
    for x, s, c in ((60, 110, VERDE_E), (140, 80, VERDE), (680, 120, VERDE_E), (600, 80, (90, 190, 80)),
                    (250, 70, VERDE)):
        arvore(t, x, 300 + s * 0.15, s, c)
    t.poli([(560, 432), (640, 432), (560, 330), (540, 330)], (230, 200, 150))
    for k in range(10):
        q = random.Random(k)
        t.circ(q.uniform(20, 740), q.uniform(390, 425), 6, (ROSA, AMARELO, BRANCO)[k % 3])
    t.texto("PARQUE VERDE", (30, 16, 560, 120), F_BLACK, BRANCO, VERDE_E, 0.09, sombra=VERDE_E, ds=(0.03, 0.06))
    moldura(t, (16, 18, 30), 12)
    t.salva("painel_parque")


def livros(t, x, y, s):
    for k, c in enumerate((VERMELHO, AZUL, AMARELO, VERDE)):
        w = s * (1.0 - 0.08 * k)
        t.ret(x - w / 2, y - (k + 1) * s * 0.22, x + w / 2, y - k * s * 0.22 - 2, c, raio=s * 0.04, borda=PRETO,
              lb=s * 0.02)
        t.ret(x - w / 2 + s * 0.05, y - (k + 1) * s * 0.22 + s * 0.05, x + w / 2 - s * 0.08,
              y - (k + 1) * s * 0.22 + s * 0.08, BRANCO)


def painel_estudo():
    t = Tela(768, 432)
    ceu(t, [(255, 236, 160), (255, 200, 120)])
    t.ret(470, 40, 730, 220, (150, 210, 255), raio=10, borda=BRANCO, lb=10)
    nuvem(t, 560, 120, 30)
    t.ret(0, 330, 768, 432, (180, 110, 70))
    t.ret(0, 324, 768, 340, (210, 140, 90))
    # jovem estudando
    x, y = 520, 330
    t.ret(x - 80, y - 170, x + 80, y, (90, 120, 230), raio=50)
    t.circ(x, y - 220, 62, PELE2)
    t.elipse(x, y - 258, 70, 40, (40, 26, 20))
    t.circ(x - 50, y - 270, 26, (40, 26, 20))
    t.circ(x + 50, y - 270, 26, (40, 26, 20))
    t.arco(x, y - 225, 74, 190, 350, (60, 60, 70), 14)
    t.ret(x - 88, y - 248, x - 62, y - 196, ROSA, raio=10)
    t.ret(x + 62, y - 248, x + 88, y - 196, ROSA, raio=10)
    for sx in (-1, 1):
        t.arco(x + sx * 22, y - 218, 10, 20, 160, PRETO, 5)
    t.arco(x, y - 200, 16, 30, 150, PRETO, 5)
    t.ret(x - 110, y - 70, x + 60, y - 20, BRANCO, raio=6, borda=PRETO, lb=4)
    t.linha([(x - 25, y - 70), (x - 25, y - 20)], CINZA, 4)
    livros(t, 230, 330, 150)
    t.ret(660, 200, 676, 330, CINZA_E)
    t.poli([(620, 210), (720, 210), (690, 170), (650, 170)], AMARELO)
    t.texto("ESTUDE", (30, 30, 400, 130), F_BLACK_IT, AZUL_E, BRANCO, 0.08)
    t.texto("E BRILHE", (30, 128, 400, 210), F_BLACK_IT, VERMELHO, BRANCO, 0.08)
    estrela(t, 420, 60, 22, AMARELO, PRETO, 3)
    moldura(t, (16, 18, 30), 12)
    t.salva("painel_estudo")


def painel_recarga():
    t = Tela(768, 432)
    ceu(t, [(60, 150, 240), (170, 220, 255)])
    predios(t, 330, 0, 768, [(120, 160, 220), (140, 180, 230), (100, 140, 210)], 11, 0.3, 0.8, 300, BRANCO)
    t.ret(0, 330, 768, 432, (90, 96, 108))
    t.ret(0, 326, 768, 340, (200, 206, 214))
    carro(t, 300, 410, 120, (60, 190, 240))
    t.ret(520, 230, 590, 410, (240, 244, 250), raio=14, borda=PRETO, lb=5)
    t.ret(532, 250, 578, 300, (60, 230, 120), raio=6)
    raio_icone(t, 555, 275, 40, AMARELO)
    t.linha([(560, 340), (520, 380), (450, 380), (420, 340)], PRETO, 8)
    t.texto("RECARGA", (30, 26, 470, 120), F_BLACK_IT, BRANCO, AZUL_E, 0.09)
    t.texto("RÁPIDA", (30, 116, 420, 200), F_BLACK_IT, (120, 255, 140), AZUL_E, 0.09)
    raio_icone(t, 680, 90, 120)
    moldura(t, (16, 18, 30), 12)
    t.salva("painel_recarga")


def fabrica(t, x, y, s, cor=(60, 40, 80)):
    t.ret(x - s, y - s * 0.5, x + s, y, cor)
    for k in range(4):
        t.poli([(x - s + k * s * 0.5, y - s * 0.5), (x - s + k * s * 0.5 + s * 0.5, y - s * 0.5),
                (x - s + k * s * 0.5 + s * 0.5, y - s * 0.8)], cor)
    t.ret(x + s * 0.6, y - s * 1.3, x + s * 0.8, y - s * 0.5, cor)
    for k in range(5):
        t.ret(x - s * 0.9 + k * s * 0.36, y - s * 0.35, x - s * 0.72 + k * s * 0.36, y - s * 0.2, AMARELO_C)


def turbina(t, x, y, s, cor=BRANCO, ang=20):
    t.poli([(x - s * 0.04, y), (x + s * 0.04, y), (x + s * 0.02, y - s), (x - s * 0.02, y - s)], cor)
    for k in range(3):
        a = math.radians(ang + k * 120)
        t.linha([(x, y - s), (x + math.cos(a) * s * 0.6, y - s + math.sin(a) * s * 0.6)], cor, s * 0.06)
    t.circ(x, y - s, s * 0.06, cor)


def painel_solar(t, x, y, s):
    t.poli([(x - s, y), (x + s, y), (x + s * 0.7, y - s * 0.5), (x - s * 0.7, y - s * 0.5)], (30, 70, 160),
           (200, 220, 255), s * 0.04)
    for k in range(1, 4):
        t.linha([(x - s + k * s * 0.5, y), (x - s * 0.7 + k * s * 0.35, y - s * 0.5)], (200, 220, 255), s * 0.03,
                pontas=False)
    t.linha([(x - s * 0.85, y - s * 0.25), (x + s * 0.85, y - s * 0.25)], (200, 220, 255), s * 0.03, pontas=False)


def painel_sol():
    t = Tela(768, 432)
    ceu(t, [(80, 40, 140), (255, 90, 120), (255, 170, 80)])
    sol(t, 400, 300, 110, (255, 220, 100), raios=False)
    for k in range(5):
        t.ret(290, 260 + k * 14, 510, 265 + k * 14, (255, 130, 110))
    t.ret(0, 300, 768, 432, (50, 24, 70))
    fabrica(t, 160, 320, 110)
    for x in (560, 640, 720):
        turbina(t, x, 320, 120, (240, 230, 255), x * 0.7)
    for x in (60, 330, 470):
        painel_solar(t, x, 400, 50)
    t.texto("ENERGIA DO SOL", (24, 20, 744, 120), F_BLACK, AMARELO, (90, 20, 60), 0.08, sombra=(90, 20, 60),
            ds=(0.03, 0.06))
    moldura(t, (16, 18, 30), 12)
    t.salva("painel_sol")


def sanduiche(t, x, y, s):
    t.elipse(x, y - s * 0.12, s, s * 0.22, (230, 170, 90))
    t.ret(x - s * 1.02, y - s * 0.42, x + s * 1.02, y - s * 0.28, VERDE, raio=s * 0.08)
    t.ret(x - s * 0.95, y - s * 0.55, x + s * 0.95, y - s * 0.4, VERMELHO, raio=s * 0.08)
    t.ret(x - s * 1.0, y - s * 0.64, x + s * 1.0, y - s * 0.52, AMARELO, raio=s * 0.06)
    t.poli([(x - s, y - s * 0.62), (x + s, y - s * 0.62), (x + s * 0.8, y - s * 1.05), (x - s * 0.8, y - s * 1.05)],
           (240, 180, 90))
    t.elipse(x, y - s * 0.95, s * 0.82, s * 0.25, (240, 180, 90))
    for k in range(6):
        t.elipse(x - s * 0.55 + k * s * 0.22, y - s * 0.95 + (k % 2) * s * 0.06, s * 0.05, s * 0.025, AMARELO_C)


def maca(t, x, y, r, cor=VERMELHO):
    t.circ(x - r * 0.35, y, r * 0.8, cor)
    t.circ(x + r * 0.35, y, r * 0.8, cor)
    t.circ(x - r * 0.45, y - r * 0.3, r * 0.2, mistura(cor, BRANCO, 0.5))
    t.linha([(x, y - r * 0.6), (x + r * 0.1, y - r * 1.1)], MARROM, r * 0.15)
    folha(t, x + r * 0.1, y - r * 0.9, r * 0.6, -20, VERDE)


def morango(t, x, y, r):
    t.poli([(x - r, y - r * 0.6), (x + r, y - r * 0.6), (x, y + r)], VERMELHO)
    t.circ(x - r * 0.5, y - r * 0.55, r * 0.5, VERMELHO)
    t.circ(x + r * 0.5, y - r * 0.55, r * 0.5, VERMELHO)
    for k in range(6):
        t.circ(x - r * 0.5 + (k % 3) * r * 0.5, y - r * 0.4 + (k // 3) * r * 0.5, r * 0.06, AMARELO_C)
    estrela(t, x, y - r * 0.95, r * 0.5, VERDE, pontas=5, interno=0.5)


def banana(t, x, y, s):
    pts = [(x - s + s * 2 * k / 20, y - math.sin(math.pi * k / 20) * s * 0.45) for k in range(21)]
    t.linha(pts, AMARELO, s * 0.3)
    t.linha(pts[2:-2], AMARELO_C, s * 0.08, pontas=False)
    t.circ(pts[0][0], pts[0][1], s * 0.08, MARROM)


def painel_lanche():
    t = Tela(768, 432)
    ceu(t, [(190, 240, 150), (120, 210, 110)])
    for k in range(12):
        t.circ(40 + k * 64, 410, 30, (150, 225, 120))
    t.elipse(560, 380, 200, 36, BRANCO)
    sanduiche(t, 560, 360, 120)
    maca(t, 370, 360, 40)
    laranja(t, 730, 330, 36)
    morango(t, 420, 400, 28)
    banana(t, 690, 400, 60)
    copo_suco(t, 260, 400, 130, (255, 150, 60))
    t.texto("LANCHE", (30, 24, 470, 130), F_BLACK_IT, BRANCO, VERDE_E, 0.09, sombra=VERDE_E, ds=(0.03, 0.06))
    t.texto("FRESCO", (30, 126, 380, 210), F_BLACK_IT, AMARELO, VERDE_E, 0.09, sombra=VERDE_E, ds=(0.03, 0.06))
    moldura(t, (16, 18, 30), 12)
    t.salva("painel_lanche")


def painel_lago():
    t = Tela(768, 432)
    ceu(t, [(255, 190, 140), (160, 210, 255)])
    sol(t, 130, 120, 46, (255, 230, 140))
    morro(t, 250, 0, 768, 60, (90, 170, 120), 1.0, 1.0)
    t.ret(0, 250, 768, 432, (50, 150, 220))
    for k in range(14):
        t.linha([(k * 60 + 10, 290 + (k % 4) * 30), (k * 60 + 50, 290 + (k % 4) * 30)], (150, 210, 250), 5)
    t.poli([(420, 340), (560, 340), (530, 370), (450, 370)], VERMELHO)
    t.linha([(490, 340), (490, 250)], MARROM, 5)
    t.poli([(495, 255), (495, 330), (560, 330)], BRANCO)
    t.poli([(485, 265), (485, 330), (440, 330)], AMARELO_C)
    for x, s in ((60, 90), (700, 110), (620, 70)):
        arvore(t, x, 260, s, VERDE_E)
    t.texto("PASSEIE\nNO LAGO", (330, 20, 750, 220), F_BLACK_IT, BRANCO, AZUL_E, 0.09, espaco=0.0)
    moldura(t, (16, 18, 30), 12)
    t.salva("painel_lago")


def flor(t, x, y, r, cor=ROSA, miolo=AMARELO):
    for k in range(6):
        a = math.radians(k * 60)
        t.circ(x + math.cos(a) * r * 0.6, y + math.sin(a) * r * 0.6, r * 0.45, cor)
    t.circ(x, y, r * 0.4, miolo)


def painel_flores():
    t = Tela(768, 432)
    ceu(t, [(160, 210, 255), (220, 240, 255)])
    nuvem(t, 600, 90, 40)
    t.ret(0, 240, 768, 432, (110, 200, 100))
    q = random.Random(4)
    for k in range(40):
        x, y = q.uniform(10, 760), q.uniform(260, 420)
        t.linha([(x, y + 30), (x, y)], VERDE_E, 4)
        flor(t, x, y, q.uniform(10, 20), q.choice((ROSA, AMARELO, VERMELHO, BRANCO, LILAS, LARANJA)))
    t.texto("PARQUE DAS\nFLORES", (20, 20, 470, 230), F_BLACK_IT, ROSA, BRANCO, 0.09, espaco=0.0)
    moldura(t, (16, 18, 30), 12)
    t.salva("painel_flores")


def painel_cinema_esq():
    q = quadro_cinema(768, 432)
    q.salva("painel_cinema")


def painel_estreia():
    t = Tela(768, 432)
    ceu(t, [(30, 20, 70), (90, 30, 110)])
    for k in range(6):
        a0 = -70 + k * 9
        r = math.radians(a0)
        t.poli([(120, 432), (120 + 900 * math.cos(r), 432 + 900 * math.sin(r)),
                (120 + 900 * math.cos(r + 0.06), 432 + 900 * math.sin(r + 0.06))], (255, 240, 180, 50))
    estrelinhas(t, 50, (0, 0, 768, 300), 21)
    claquete(t, 600, 300, 110)
    estrela(t, 430, 330, 50, AMARELO, PRETO, 4)
    estrela(t, 330, 380, 28, AMARELO_C)
    t.texto("ESTREIA", (30, 30, 520, 150), F_BLACK_IT, AMARELO, PRETO, 0.08, glow=(255, 200, 80, 150))
    t.texto("HOJE", (30, 150, 330, 250), F_BLACK_IT, BRANCO, PRETO, 0.08)
    moldura(t, (16, 18, 30), 12)
    t.salva("painel_estreia")


# ======================================================================================================================
# Verticais (1:2)
# ======================================================================================================================
def foguete(t, x, y, s, cor=BRANCO, janela=AZUL_C, aleta=VERMELHO):
    """Foguete em pé: x, y = base do corpo; s = altura."""
    w = s * 0.2
    t.poli([(x - w, y), (x - w * 1.9, y + s * 0.12), (x - w * 1.6, y - s * 0.3), (x - w, y - s * 0.35)], aleta)
    t.poli([(x + w, y), (x + w * 1.9, y + s * 0.12), (x + w * 1.6, y - s * 0.3), (x + w, y - s * 0.35)], aleta)
    pts = [(x - w, y)] + [(x - w * math.cos(math.radians(a)) ** 0.6, y - s * 0.55 - s * 0.45 * math.sin(math.radians(a)))
                          for a in range(0, 91, 10)]
    pts += [(2 * x - px, py) for px, py in pts[::-1]]
    t.poli([(x - w, y), (x - w, y - s * 0.55)] + pts[1:-1] + [(x + w, y - s * 0.55), (x + w, y)], cor, PRETO, s * 0.02)
    t.circ(x, y - s * 0.58, w * 0.55, janela, PRETO, s * 0.02)
    t.circ(x - w * 0.15, y - s * 0.62, w * 0.18, BRANCO)
    t.ret(x - w * 0.15, y - s * 0.35, x + w * 0.15, y, aleta)


def chama(t, x, y, s):
    for k, c in enumerate(((255, 120, 40), (255, 200, 60), (255, 250, 200))):
        f = 1 - k * 0.3
        t.poli([(x - s * 0.25 * f, y), (x + s * 0.25 * f, y), (x + s * 0.1 * f, y + s * 0.6 * f), (x, y + s * f),
                (x - s * 0.1 * f, y + s * 0.6 * f)], c)


def vertical_foguete():
    t = Tela(384, 768)
    ceu(t, [(14, 18, 60), (60, 40, 140), (255, 120, 140)])
    estrelinhas(t, 60, (0, 0, 384, 500), 7)
    t.circ(300, 380, 50, (255, 170, 90))
    t.elipse(300, 380, 80, 16, None, (255, 220, 160), 6)
    for k in range(6):
        nuvem(t, 30 + k * 70, 700 + (k % 2) * 20, 50, (250, 240, 250))
    t.linha([(190, 650), (190, 560)], (255, 255, 255, 90), 70)
    chama(t, 190, 520, 140)
    foguete(t, 190, 520, 260)
    t.texto("VOE", (20, 30, 364, 200), F_BLACK_IT, AMARELO, PRETO, 0.08, sombra=ROSA, ds=(0.04, 0.06))
    t.texto("SONHE ALTO", (30, 200, 354, 250), F_BLACK, BRANCO)
    moldura(t, (16, 18, 30), 10)
    t.salva("vertical_foguete")


def predio_verde(t, x, y, w, h):
    t.ret(x - w / 2, y - h, x + w / 2, y, (80, 190, 120), raio=w * 0.1, borda=VERDE_E, lb=4)
    for j in range(int(h // 36)):
        yy = y - h + 20 + j * 36
        t.ret(x - w / 2 + 10, yy, x + w / 2 - 10, yy + 18, (180, 230, 255), raio=4)
        for k in range(4):
            t.circ(x - w / 2 + 14 + k * (w - 28) / 3, yy + 22, 7, VERDE_E)


def moeda(t, x, y, r):
    t.circ(x, y, r, (255, 200, 40), (200, 140, 20), r * 0.12)
    t.texto("$", (x - r * 0.6, y - r * 0.6, x + r * 0.6, y + r * 0.6), F_BLACK, (200, 140, 20))


def vertical_banco():
    t = Tela(384, 768)
    ceu(t, [(150, 220, 255), (230, 250, 255)])
    nuvem(t, 290, 300, 30)
    morro(t, 640, 0, 384, 30, (120, 210, 110), 0.3, 1.0)
    predio_verde(t, 190, 680, 200, 330)
    t.poli([(70, 350), (310, 350), (190, 300)], VERDE_E)
    t.ret(0, 680, 384, 768, (110, 200, 100))
    moeda(t, 70, 600, 30)
    moeda(t, 320, 560, 26)
    moeda(t, 330, 630, 20)
    folha(t, 40, 700, 60, -60, VERDE)
    t.texto("BANCO\nVERDE", (24, 30, 360, 210), F_BLACK, VERDE_E, BRANCO, 0.08, espaco=0.0)
    t.texto("POUPE PARA O FUTURO", (24, 214, 360, 256), F_BLACK, AZUL_E)
    moldura(t, (16, 18, 30), 10)
    t.salva("vertical_banco")


def capsula(t, x, y, s, ang=-35, c1=VERMELHO, c2=BRANCO):
    sub = Tela(int(s * 2.4), int(s * 2.4), (0, 0, 0, 0))
    cx = cy = s * 1.2
    sub.ret(cx - s, cy - s * 0.38, cx, cy + s * 0.38, c1, raio=s * 0.38)
    sub.ret(cx - s * 0.4, cy - s * 0.38, cx, cy + s * 0.38, c1)
    sub.ret(cx, cy - s * 0.38, cx + s, cy + s * 0.38, c2, raio=s * 0.38)
    sub.ret(cx, cy - s * 0.38, cx + s * 0.4, cy + s * 0.38, c2)
    sub.ret(cx - s, cy - s * 0.38, cx + s, cy + s * 0.38, None, raio=s * 0.38, borda=PRETO, lb=s * 0.06)
    sub.ret(cx - s * 0.75, cy - s * 0.24, cx - s * 0.2, cy - s * 0.12, (255, 255, 255, 140), raio=s * 0.06)
    im = sub.img.rotate(-ang, resample=Image.BICUBIC)
    t.img.alpha_composite(im, (int((x - s * 1.2) * t.s), int((y - s * 1.2) * t.s)))


def vertical_saude():
    t = Tela(384, 768)
    ceu(t, [(200, 236, 255), (120, 200, 250)])
    t.circ(192, 470, 150, (255, 255, 255, 120))
    t.ret(162, 330, 222, 450, VERMELHO, raio=10)
    t.ret(132, 360, 252, 420, VERMELHO, raio=10)
    capsula(t, 120, 560, 70, -30)
    capsula(t, 280, 580, 60, 25, AZUL, BRANCO)
    coracao(t, 300, 300, 60, ROSA)
    t.circ(80, 640, 26, (255, 255, 255), CINZA, 3)
    t.linha([(64, 640), (96, 640)], CINZA, 3)
    t.texto("SUA\nSAÚDE", (24, 30, 360, 230), F_BLACK, AZUL_E, BRANCO, 0.08, espaco=0.0)
    t.texto("EM PRIMEIRO LUGAR", (24, 680, 360, 730), F_BLACK, AZUL_E)
    moldura(t, (16, 18, 30), 10)
    t.salva("vertical_saude")


def celular(t, x, y, w, h, tela_cores=((90, 200, 255), (160, 100, 255))):
    t.ret(x - w / 2, y - h / 2, x + w / 2, y + h / 2, (30, 30, 40), raio=w * 0.16)
    t.grad(list(tela_cores), (x - w / 2 + w * 0.07, y - h / 2 + w * 0.12, x + w / 2 - w * 0.07, y + h / 2 - w * 0.12))
    t.ret(x - w * 0.12, y - h / 2 + w * 0.04, x + w * 0.12, y - h / 2 + w * 0.08, (60, 60, 70), raio=3)


def wifi(t, x, y, s, cor=BRANCO):
    t.circ(x, y, s * 0.12, cor)
    for k, r in enumerate((0.42, 0.72, 1.0)):
        t.arco(x, y, r * s, 225, 315, cor, s * 0.14)


def balao(t, x, y, w, h, cor, cauda=1):
    t.ret(x - w / 2, y - h / 2, x + w / 2, y + h / 2, cor, raio=h * 0.4)
    t.poli([(x + cauda * w * 0.2, y + h / 2 - 2), (x + cauda * w * 0.38, y + h / 2 - 2), (x + cauda * w * 0.45, y + h)],
           cor)


def vertical_conectado():
    t = Tela(384, 768)
    ceu(t, [(90, 50, 200), (40, 120, 230)])
    for k in range(5):
        t.circ(192, 470, 60 + k * 50, None, (255, 255, 255, 40), 4)
    celular(t, 192, 470, 170, 300)
    balao(t, 150, 390, 110, 40, BRANCO, 1)
    balao(t, 225, 450, 100, 40, AMARELO, -1)
    balao(t, 160, 510, 90, 40, ROSA_C, 1)
    for bx, bc in ((150, 390), (225, 450), (160, 510)):
        for k in range(3):
            t.circ(bx - 18 + k * 18, bc, 5, CINZA_E)
    wifi(t, 192, 600, 50)
    coracao(t, 320, 330, 34, ROSA)
    estrela(t, 60, 600, 22, AMARELO)
    t.texto("FIQUE\nCONECTADO", (24, 40, 360, 250), F_BLACK, BRANCO, PRETO, 0.07, espaco=0.0)
    moldura(t, (16, 18, 30), 10)
    t.salva("vertical_conectado")


def drones_quadro(forma):
    t = Tela(384, 768)
    ceu(t, [(8, 10, 40), (30, 30, 90), (70, 50, 130)])
    estrelinhas(t, 30, (0, 0, 384, 600), 13, (200, 210, 255), (0.8, 1.6))
    predios(t, 768, 0, 384, [(20, 22, 50), (28, 30, 64)], 31, 0.1, 0.32, 600, (255, 210, 120), (0.1, 0.2))
    pts = []
    cx, cy = 192, 400
    if forma == "estrela":
        for k in range(10):
            a = math.radians(-90 + 36 * k)
            r = 130 if k % 2 == 0 else 55
            p0 = (cx + r * math.cos(a), cy + r * math.sin(a))
            a2 = math.radians(-90 + 36 * (k + 1))
            r2 = 130 if (k + 1) % 2 == 0 else 55
            p1 = (cx + r2 * math.cos(a2), cy + r2 * math.sin(a2))
            for j in range(5):
                pts.append((p0[0] + (p1[0] - p0[0]) * j / 5, p0[1] + (p1[1] - p0[1]) * j / 5))
        cor = (255, 220, 90)
    elif forma == "coracao":
        for k in range(48):
            a = 2 * math.pi * k / 48
            x = 16 * math.sin(a) ** 3
            y = 13 * math.cos(a) - 5 * math.cos(2 * a) - 2 * math.cos(3 * a) - math.cos(4 * a)
            pts.append((cx + x * 8, cy - y * 8))
        cor = (255, 90, 180)
    else:  # carinha sorrindo
        for k in range(36):
            a = 2 * math.pi * k / 36
            pts.append((cx + 130 * math.cos(a), cy + 130 * math.sin(a)))
        for sx in (-1, 1):
            for j in range(4):
                pts.append((cx + sx * 45, cy - 55 + j * 14))
        for k in range(11):
            a = math.radians(20 + 14 * k)
            pts.append((cx + 75 * math.cos(a), cy + 10 + 60 * math.sin(a)))
        cor = (90, 230, 255)
    cam = Tela(384, 768, (0, 0, 0, 0))
    for x, y in pts:
        cam.circ(x, y, 6, (*cor, 255))
    glow = cam.img.filter(ImageFilter.GaussianBlur(10 * SS))
    t.img.alpha_composite(glow)
    t.img.alpha_composite(glow)
    t.img.alpha_composite(cam.img)
    for x, y in pts:
        t.circ(x, y, 2.5, BRANCO)
    t.texto("SHOW DE\nDRONES", (24, 30, 360, 200), F_BLACK, BRANCO, ROXO_E, 0.07, espaco=0.0,
            glow=(150, 120, 255, 140))
    t.texto("SÁBADO À NOITE", (40, 590, 344, 630), F_BLACK, AMARELO)
    moldura(t, (16, 18, 30), 10)
    return t


def vertical_drones():
    junta_quadros("vertical_drones", [drones_quadro("estrela"), drones_quadro("coracao"), drones_quadro("carinha")])


def seta_curva(t, cx, cy, r, a0, a1, cor, lb):
    t.arco(cx, cy, r, a0, a1, cor, lb)
    a = math.radians(a1)
    px, py = cx + r * math.cos(a), cy + r * math.sin(a)
    tx, ty = -math.sin(a), math.cos(a)
    nx, ny = math.cos(a), math.sin(a)
    t.poli([(px + nx * lb * 1.1, py + ny * lb * 1.1), (px - nx * lb * 1.1, py - ny * lb * 1.1),
            (px + tx * lb * 1.5, py + ty * lb * 1.5)], cor)


def planeta(t, x, y, r):
    t.circ(x, y, r, (50, 140, 230))
    for dx, dy, rx, ry in ((-0.35, -0.3, 0.35, 0.25), (0.3, 0.1, 0.4, 0.3), (-0.2, 0.45, 0.3, 0.18)):
        t.elipse(x + dx * r, y + dy * r, rx * r, ry * r, (90, 190, 90))
    t.circ(x - r * 0.4, y - r * 0.45, r * 0.15, (255, 255, 255, 120))
    t.circ(x, y, r, None, (20, 60, 120), r * 0.05)


def vertical_lixo():
    t = Tela(384, 768)
    ceu(t, [(40, 190, 150), (20, 120, 110)])
    planeta(t, 192, 460, 110)
    for a0 in (0, 120, 240):
        seta_curva(t, 192, 460, 155, a0 + 10, a0 + 100, (150, 255, 120), 22)
    for k in range(3):
        folha(t, 40 + k * 140, 740, 40, -60 + k * 30, (150, 230, 110))
    t.texto("LIXO\nZERO", (24, 30, 360, 250), F_BLACK, BRANCO, VERDE_E, 0.08, espaco=0.0)
    t.texto("SEPARE E RECICLE", (24, 650, 360, 690), F_BLACK, AMARELO_C)
    moldura(t, (16, 18, 30), 10)
    t.salva("vertical_lixo")


def bicicleta(t, x, y, s, cor=VERMELHO):
    for wx in (-0.6, 0.6):
        t.circ(x + wx * s, y, s * 0.42, None, PRETO, s * 0.07)
        t.circ(x + wx * s, y, s * 0.06, CINZA_E)
    t.linha([(x - s * 0.6, y), (x - s * 0.1, y), (x + s * 0.3, y - s * 0.55), (x - s * 0.25, y - s * 0.55),
             (x - s * 0.6, y)], cor, s * 0.07)
    t.linha([(x - s * 0.1, y), (x - s * 0.3, y - s * 0.7)], cor, s * 0.07)
    t.linha([(x + s * 0.3, y - s * 0.55), (x + s * 0.6, y)], cor, s * 0.07)
    t.linha([(x + s * 0.3, y - s * 0.55), (x + s * 0.25, y - s * 0.8), (x + s * 0.4, y - s * 0.82)], PRETO, s * 0.06)
    t.ret(x - s * 0.42, y - s * 0.78, x - s * 0.18, y - s * 0.7, PRETO, raio=s * 0.04)


def vertical_bike():
    t = Tela(384, 768)
    ceu(t, [(255, 220, 100), (255, 160, 80)])
    sol(t, 300, 300, 50, BRANCO, raios=True, halo=False)
    t.ret(0, 560, 384, 768, (90, 96, 108))
    for x in range(0, 384, 80):
        t.ret(x, 650, x + 40, 660, BRANCO)
    t.ret(0, 540, 384, 560, (60, 200, 110))
    bicicleta(t, 192, 520, 130, AZUL)
    t.texto("PEDALE\nMAIS", (24, 30, 360, 250), F_BLACK_IT, AZUL_E, BRANCO, 0.08, espaco=0.0)
    t.texto("CICLOVIA NA RUA", (24, 690, 360, 735), F_BLACK, BRANCO)
    moldura(t, (16, 18, 30), 10)
    t.salva("vertical_bike")


# ======================================================================================================================
# Totens altos de fachada (3 × 8 m)
# ======================================================================================================================
def predio_classico(t, x, y, w, h, cor=(245, 236, 215)):
    t.ret(x - w / 2, y - h * 0.08, x + w / 2, y, mistura(cor, CINZA, 0.3))
    for k in range(6):
        cx_ = x - w * 0.4 + k * w * 0.16
        t.ret(cx_ - w * 0.04, y - h * 0.62, cx_ + w * 0.04, y - h * 0.08, cor, borda=mistura(cor, PRETO, 0.25), lb=2)
    t.ret(x - w * 0.48, y - h * 0.7, x + w * 0.48, y - h * 0.62, cor)
    t.poli([(x - w / 2, y - h * 0.7), (x + w / 2, y - h * 0.7), (x, y - h)], cor, mistura(cor, PRETO, 0.25), 3)
    t.circ(x, y - h * 0.8, w * 0.06, (90, 150, 220))


def atomo(t, x, y, s, cor=CIANO):
    for a in (0, 60, 120):
        cam = Tela(int(s * 2.4), int(s * 2.4), (0, 0, 0, 0))
        cam.elipse(s * 1.2, s * 1.2, s, s * 0.36, None, (*cor, 255), s * 0.08)
        im = cam.img.rotate(a, resample=Image.BICUBIC)
        t.img.alpha_composite(im, (int((x - s * 1.2) * t.s), int((y - s * 1.2) * t.s)))
    t.circ(x, y, s * 0.16, ROSA)


def frasco(t, x, y, s, cor=VERDE_C):
    t.ret(x - s * 0.12, y - s, x + s * 0.12, y - s * 0.55, (230, 245, 255), borda=PRETO, lb=s * 0.04)
    t.poli([(x - s * 0.12, y - s * 0.55), (x + s * 0.12, y - s * 0.55), (x + s * 0.45, y), (x - s * 0.45, y)],
           (230, 245, 255), PRETO, s * 0.04)
    t.poli([(x - s * 0.28, y - s * 0.28), (x + s * 0.28, y - s * 0.28), (x + s * 0.43, y - s * 0.02),
            (x - s * 0.43, y - s * 0.02)], cor)
    t.circ(x - s * 0.1, y - s * 0.15, s * 0.06, BRANCO)


def capelo(t, x, y, s):
    t.poli([(x - s, y), (x, y - s * 0.4), (x + s, y), (x, y + s * 0.4)], PRETO)
    t.ret(x - s * 0.5, y + s * 0.1, x + s * 0.5, y + s * 0.5, PRETO, raio=s * 0.1)
    t.linha([(x, y), (x + s * 0.8, y + s * 0.2), (x + s * 0.8, y + s * 0.7)], AMARELO, s * 0.08)


def totem_universidade():
    t = Tela(384, 1024)
    ceu(t, [(40, 80, 180), (110, 170, 250), (210, 236, 255)])
    t.ret(0, 0, 384, 150, (24, 40, 110))
    t.texto("UNIVERSIDADE", (16, 30, 368, 120), F_BLACK, BRANCO, contorno=None)
    atomo(t, 100, 260, 60)
    frasco(t, 290, 320, 100)
    capelo(t, 290, 470, 60)
    livros(t, 90, 470, 100)
    nuvem(t, 300, 200, 26)
    t.ret(0, 820, 384, 1024, (110, 200, 100))
    predio_classico(t, 192, 830, 330, 280)
    for x in (30, 354):
        arvore(t, x, 850, 90, VERDE_E)
    t.texto("ESTUDE\nAQUI", (24, 860, 360, 1000), F_BLACK_IT, AMARELO, AZUL_E, 0.08, espaco=0.0)
    moldura(t, (16, 18, 30), 12)
    t.salva("totem_universidade")


def cerebro(t, x, y, s):
    cor = (255, 140, 200)
    for dx, dy, r in ((-0.45, -0.1, 0.4), (-0.1, -0.35, 0.42), (0.35, -0.25, 0.42), (0.5, 0.15, 0.35),
                      (-0.4, 0.3, 0.35), (0.05, 0.25, 0.42)):
        t.circ(x + dx * s, y + dy * s, r * s, cor)
    for k in range(5):
        t.arco(x - s * 0.5 + k * s * 0.25, y - s * 0.1 + (k % 2) * s * 0.2, s * 0.18, 200, 340, (200, 70, 150), s * 0.06)
    t.linha([(x, y - s * 0.7), (x, y + s * 0.6)], (200, 70, 150), s * 0.05)
    t.ret(x - s * 0.1, y + s * 0.6, x + s * 0.18, y + s * 0.95, (230, 110, 180), raio=s * 0.06)


def totem_laboratorio():
    t = Tela(384, 1024)
    ceu(t, [(10, 30, 50), (16, 80, 100), (30, 140, 150)])
    for k in range(14):
        q = random.Random(k)
        y = q.uniform(150, 700)
        x0 = q.choice((0, 384))
        xm = q.uniform(60, 324)
        t.linha([(x0, y), (xm, y), (xm + (30 if x0 == 0 else -30), y - 30)], (80, 230, 230), 3, pontas=False)
        t.circ(xm + (30 if x0 == 0 else -30), y - 30, 5, CIANO)
    cerebro(t, 192, 360, 130)
    t.circ(192, 360, 200, None, (120, 255, 255, 80), 6)
    # rosto de perfil, olhos fechados
    x, y = 192, 730
    t.circ(x, y, 110, PELE)
    t.elipse(x - 10, y - 70, 120, 60, (60, 40, 30))
    t.arco(x - 40, y, 24, 20, 160, PRETO, 6)
    t.arco(x + 40, y, 24, 20, 160, PRETO, 6)
    t.arco(x, y + 40, 26, 30, 150, PRETO, 6)
    t.circ(x - 70, y + 30, 16, ROSA_C)
    t.circ(x + 70, y + 30, 16, ROSA_C)
    t.ret(x - 110, y + 100, x + 110, y + 300, (240, 244, 250), raio=40)
    t.ret(0, 0, 384, 150, (8, 20, 36))
    t.texto("LABORATÓRIO", (16, 24, 368, 80), F_BLACK, CIANO)
    t.texto("DA MENTE", (16, 80, 368, 140), F_BLACK, BRANCO)
    moldura(t, (16, 18, 30), 12)
    t.salva("totem_laboratorio")


def lata(t, x, y, w, h, c1, c2, ang=0):
    sub = Tela(int(w * 2), int(h * 1.6), (0, 0, 0, 0))
    cx, cy = w, h * 0.8
    sub.ret(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2, c1, raio=w * 0.2)
    sub.ret(cx - w / 2, cy - h * 0.1, cx + w / 2, cy + h * 0.15, c2)
    sub.ret(cx - w * 0.42, cy - h / 2 - h * 0.04, cx + w * 0.42, cy - h / 2 + h * 0.06, CINZA, raio=w * 0.1)
    sub.ret(cx - w * 0.42, cy + h / 2 - h * 0.06, cx + w * 0.42, cy + h / 2 + h * 0.04, CINZA, raio=w * 0.1)
    sub.ret(cx - w * 0.36, cy - h * 0.38, cx - w * 0.24, cy + h * 0.38, (255, 255, 255, 110), raio=w * 0.05)
    estrela(sub, cx, cy + h * 0.02, w * 0.18, BRANCO)
    im = sub.img.rotate(ang, resample=Image.BICUBIC)
    t.img.alpha_composite(im, (int((x - w) * t.s), int((y - h * 0.8) * t.s)))


def respingo(t, x, y, r, cor, semente=1, n=9):
    q = random.Random(semente)
    t.circ(x, y, r, cor)
    for k in range(n):
        a = q.uniform(0, 2 * math.pi)
        d = r * q.uniform(1.1, 1.9)
        rr = r * q.uniform(0.12, 0.3)
        t.linha([(x + math.cos(a) * r * 0.6, y + math.sin(a) * r * 0.6), (x + math.cos(a) * d, y + math.sin(a) * d)],
                cor, rr * 1.2)
        t.circ(x + math.cos(a) * d * 1.15, y + math.sin(a) * d * 1.15, rr, cor)


def totem_refri():
    t = Tela(384, 1024)
    ceu(t, [(255, 90, 170), (255, 150, 120), (255, 220, 60)])
    cx, cy = 192, 520
    for k in range(20):
        a0 = math.radians(k * 18)
        t.poli([(cx, cy), (cx + 700 * math.cos(a0), cy + 700 * math.sin(a0)),
                (cx + 700 * math.cos(a0 + 0.16), cy + 700 * math.sin(a0 + 0.16))], (255, 255, 255, 50))
    respingo(t, 120, 420, 70, (255, 230, 60), 3)
    respingo(t, 280, 600, 80, (255, 60, 150), 5)
    respingo(t, 200, 740, 60, (80, 220, 255), 8)
    lata(t, 130, 560, 110, 200, (255, 60, 150), AMARELO, 18)
    lata(t, 270, 470, 110, 200, (255, 200, 30), ROSA, -14)
    lata(t, 200, 760, 100, 180, CIANO, BRANCO, 6)
    for k in range(26):
        q = random.Random(30 + k)
        t.circ(q.uniform(20, 364), q.uniform(200, 960), q.uniform(5, 14), None, BRANCO, 3)
    t.texto("REFRI", (16, 30, 368, 180), F_BLACK_IT, BRANCO, MAGENTA, 0.1, sombra=MAGENTA, ds=(0.03, 0.06))
    t.texto("GELADO", (16, 860, 368, 990), F_BLACK_IT, AMARELO, MAGENTA, 0.1, sombra=MAGENTA, ds=(0.03, 0.06))
    moldura(t, (16, 18, 30), 12)
    t.salva("totem_refri")


def carro_voador(t, x, y, s):
    t.elipse(x, y + s * 0.42, s * 0.8, s * 0.1, (255, 255, 255, 70))
    t.poli([(x - s, y), (x - s * 0.9, y - s * 0.28), (x - s * 0.3, y - s * 0.34), (x - s * 0.1, y - s * 0.62),
            (x + s * 0.45, y - s * 0.62), (x + s * 0.75, y - s * 0.3), (x + s * 1.05, y - s * 0.2), (x + s, y + s * 0.05),
            (x - s * 0.95, y + s * 0.08)], BRANCO, CINZA_E, s * 0.04)
    t.poli([(x - s * 0.02, y - s * 0.56), (x + s * 0.4, y - s * 0.56), (x + s * 0.62, y - s * 0.32),
            (x - s * 0.2, y - s * 0.32)], (90, 180, 250))
    t.linha([(x - s * 0.85, y - s * 0.05), (x + s * 0.9, y - s * 0.08)], CIANO, s * 0.05)
    for wx in (-0.55, 0.55):
        t.elipse(x + wx * s, y + s * 0.16, s * 0.24, s * 0.1, (200, 210, 225), CINZA_E, s * 0.03)
        t.elipse(x + wx * s, y + s * 0.26, s * 0.16, s * 0.06, (120, 230, 255))
    chama(t, x - s * 0.55, y + s * 0.28, s * 0.5)
    chama(t, x + s * 0.55, y + s * 0.28, s * 0.5)


def totem_carro_voador():
    t = Tela(384, 1024)
    ceu(t, [(255, 130, 120), (255, 190, 140), (150, 200, 255)])
    sol(t, 290, 300, 60, (255, 240, 170), raios=False)
    for k in range(5):
        nuvem(t, 40 + k * 90, 560 + (k % 2) * 30, 44, (255, 245, 250))
    predios(t, 1024, 0, 384, [(120, 110, 200), (90, 90, 180), (150, 130, 220)], 41, 0.2, 0.6, 420, AMARELO_C,
            (0.12, 0.22))
    carro_voador(t, 192, 440, 150)
    t.texto("O FUTURO\nCHEGOU", (16, 24, 368, 230), F_BLACK_IT, BRANCO, AZUL_E, 0.08, espaco=0.0)
    moldura(t, (16, 18, 30), 12)
    t.salva("totem_carro_voador")


# ======================================================================================================================
# Placas
# ======================================================================================================================
def placa_gota():
    t = Tela(512, 512, (16, 14, 30))
    for k in range(6):
        t.circ(256, 240, 230 - k * 30, None, (60 + k * 10, 40, 120 + k * 10), 3)
    m, md = t.mascara()
    pts = [(256, 70)]
    for k in range(0, 181, 6):
        a = math.radians(k)
        pts.append((256 + 120 * math.cos(a - math.pi / 2 + math.pi / 2) * 1.0, 300 + 120 * math.sin(a)))
    pts = [(256, 60), (330, 170)] + [(256 + 125 * math.cos(math.radians(a)), 300 + 125 * math.sin(math.radians(a)))
                                     for a in range(-40, 221, 10)] + [(182, 170)]
    md.polygon(t.P(pts), fill=255)
    t.grad([(255, 240, 80), (255, 150, 40), (255, 60, 140), (150, 60, 255)], (130, 60, 382, 430), mascara=m)
    pts2 = [(256, 190), (290, 250)] + [(256 + 60 * math.cos(math.radians(a)), 330 + 60 * math.sin(math.radians(a)))
                                       for a in range(-40, 221, 12)] + [(222, 250)]
    t.poli(pts2, (255, 250, 200, 220))
    t.elipse(215, 260, 16, 34, (255, 255, 255, 170))
    t.texto("ENERGIA", (60, 430, 452, 495), F_BLACK, BRANCO, contorno=None)
    t.brilho(10, 0.35)
    moldura(t, (40, 40, 60), 12, 30)
    t.salva("placa_gota")


def placa_desfile():
    t = Tela(1024, 512, (40, 14, 70))
    t.grad([(60, 20, 100), (30, 10, 60)])
    estrelinhas(t, 40, (0, 0, 1024, 512), 17, (255, 200, 255))
    t.texto("DESFILE", (60, 40, 964, 210), F_BLACK_IT, (255, 120, 220), (255, 200, 245), 0.03,
            glow=(255, 60, 200, 230))
    t.texto("NEON", (60, 200, 964, 360), F_BLACK_IT, (90, 240, 255), (210, 255, 255), 0.03, glow=(60, 220, 255, 230))
    t.texto("SEXTA • 20H", (200, 370, 824, 470), F_BLACK, (255, 230, 90), (255, 250, 200), 0.03,
            glow=(255, 200, 60, 230))
    t.brilho(6, 0.4)
    t.salva("placa_desfile")


def avisos():
    """5 telinhas empilhadas num PNG só (cada uma 256 × 128, de cima para baixo)."""
    t = Tela(256, 640, (20, 22, 30))
    itens = [("SAÍDA", (60, 200, 110), BRANCO, "seta"), ("ELEVADOR", (40, 80, 160), BRANCO, None),
             ("SILÊNCIO", BRANCO, VERMELHO, None), ("BEM-VINDO", AMARELO, PRETO, None),
             ("2º ANDAR", (120, 60, 200), BRANCO, None)]
    for k, (txt, fundo, letra, ic) in enumerate(itens):
        y0 = k * 128
        t.ret(6, y0 + 6, 250, y0 + 122, fundo, raio=14)
        if ic == "seta":
            t.poli([(200, y0 + 40), (236, y0 + 64), (200, y0 + 88)], letra)
            t.ret(170, y0 + 56, 205, y0 + 72, letra)
            t.texto(txt, (20, y0 + 30, 165, y0 + 98), F_BLACK, letra)
        else:
            t.texto(txt, (20, y0 + 30, 236, y0 + 98), F_BLACK, letra)
    t.salva("avisos")


def bandeirola():
    t = Tela(256, 768, ROXO)
    t.grad([(150, 90, 240), (100, 50, 190)])
    for k in range(5):
        y = 230 + k * 95
        t.poli([(50, y), (128, y + 60), (206, y), (206, y + 34), (128, y + 94), (50, y + 34)],
               (AMARELO, (255, 240, 160))[k % 2])
    t.texto("ENTRE", (20, 40, 236, 150), F_BLACK, BRANCO, ROXO_E, 0.06)
    t.ret(20, 170, 236, 180, (255, 255, 255, 120), raio=4)
    t.salva("bandeirola")


def placa_wifi():
    t = Tela(512, 512, VERMELHO)
    t.circ(256, 256, 250, (230, 50, 60))
    t.circ(256, 256, 226, None, BRANCO, 14)
    wifi(t, 256, 300, 150)
    t.texto("WI-FI LIVRE", (110, 330, 402, 400), F_BLACK, BRANCO)
    t.salva("placa_wifi")


def totem_mapa():
    t = Tela(256, 768, (240, 244, 248))
    t.ret(0, 0, 256, 120, (30, 60, 140))
    t.texto("VOCÊ ESTÁ\nAQUI", (12, 12, 244, 108), F_BLACK, BRANCO, espaco=0.0)
    t.ret(14, 136, 242, 600, (200, 236, 190), raio=12)
    t.ret(30, 160, 120, 260, (120, 200, 110), raio=10)
    t.elipse(180, 450, 50, 34, (90, 180, 240))
    for x in (100, 170):
        t.ret(x, 136, x + 16, 600, BRANCO)
    for y in (300, 380, 520):
        t.ret(14, y, 242, y + 16, BRANCO)
    for k, (x, y, c) in enumerate(((60, 330, VERMELHO), (210, 340, AMARELO), (60, 560, ROXO), (210, 560, LARANJA))):
        t.ret(x - 18, y - 18, x + 18, y + 18, c, raio=6)
    x, y = 140, 420
    t.circ(x, y - 30, 26, VERMELHO, PRETO, 3)
    t.poli([(x - 20, y - 18), (x + 20, y - 18), (x, y + 10)], VERMELHO)
    t.circ(x, y - 30, 10, BRANCO)
    t.ret(0, 620, 256, 768, (30, 60, 140))
    t.texto("PRAÇA • 200 m\nMETRÔ • 450 m", (14, 636, 242, 752), F_BLACK, BRANCO, espaco=0.25)
    t.salva("totem_mapa")


def xicara(t, x, y, s, cor=BRANCO):
    t.poli([(x - s * 0.5, y - s * 0.6), (x + s * 0.5, y - s * 0.6), (x + s * 0.38, y), (x - s * 0.38, y)], cor)
    t.circ(x + s * 0.55, y - s * 0.35, s * 0.18, None, cor, s * 0.08)
    t.elipse(x, y + s * 0.04, s * 0.7, s * 0.08, cor)
    for k in range(3):
        xx = x - s * 0.25 + k * s * 0.25
        t.linha([(xx, y - s * 0.75), (xx + s * 0.08, y - s * 0.95), (xx, y - s * 1.15)], (255, 255, 255, 170),
                s * 0.06)


def placa_cafe():
    t = Tela(256, 640, (90, 50, 34))
    t.ret(10, 10, 246, 630, None, raio=20, borda=(240, 200, 140), lb=6)
    xicara(t, 128, 330, 150, (250, 240, 220))
    t.texto("CAFÉ", (24, 380, 232, 500), F_BLACK, (255, 220, 150))
    t.texto("QUENTINHO", (24, 510, 232, 560), F_BLACK, BRANCO)
    t.salva("placa_cafe")


def fliper_quadro(k):
    t = Tela(512, 384, (12, 10, 30))
    t.grad([(20, 10, 60), (90, 30, 120)], (0, 0, 512, 170))
    sol(t, 256, 170, 70, (255, 120, 180), raios=False, halo=False)
    for j in range(4):
        t.ret(170, 120 + j * 14, 342, 126 + j * 14, (90, 30, 120))
    t.ret(0, 170, 512, 384, (30, 160, 80))
    t.poli([(236, 170), (276, 170), (470, 384), (42, 384)], (60, 60, 70))
    for j in range(6):
        y = 170 + ((j * 40 + k * 20) % 214)
        f = (y - 170) / 214
        w = 4 + 14 * f
        t.ret(256 - w / 2, y, 256 + w / 2, y + 6 + 20 * f, BRANCO)
    for j in range(5):
        y = 170 + ((j * 48 + k * 24) % 214)
        f = (y - 170) / 214
        for sx in (-1, 1):
            xx = 256 + sx * (20 + 214 * f)
            t.ret(xx - 6 * f - 2, y, xx + 6 * f + 2, y + 10 + 14 * f, (VERMELHO, BRANCO)[j % 2])
    px = 256 + (-60, 0, 60)[k]
    for dx, dy, w, h, c in ((0, 0, 70, 34, VERMELHO), (0, -22, 40, 22, (255, 120, 130))):
        t.ret(px - w / 2, 330 + dy, px + w / 2, 330 + dy + h, c, raio=6)
    for sx in (-1, 1):
        t.ret(px + sx * 38 - 8, 338, px + sx * 38 + 8, 366, PRETO, raio=4)
    pixel_texto(t, "VOLTA %d/3" % (k + 1), 16, 16, 4, AMARELO)
    pixel_texto(t, "%02d" % (88 + k * 3), 420, 16, 6, CIANO)
    moldura(t, (40, 40, 60), 10)
    return t


def tela_fliperama():
    junta_quadros("tela_fliperama", [fliper_quadro(k) for k in range(3)])


def maquina_lanche():
    t = Tela(512, 768, (30, 34, 50))
    t.ret(0, 0, 512, 120, VERMELHO)
    t.texto("LANCHE", (30, 16, 482, 104), F_BLACK_IT, BRANCO, (120, 20, 30), 0.08)
    t.ret(24, 140, 488, 700, (200, 230, 255), raio=10)
    cores = [VERMELHO, AMARELO, AZUL, VERDE, LARANJA, ROSA, ROXO, CIANO]
    for j in range(4):
        y = 170 + j * 130
        t.ret(24, y + 92, 488, y + 104, CINZA_E)
        for i in range(4):
            x = 80 + i * 115
            c = cores[(i + j * 3) % len(cores)]
            if (i + j) % 3 == 0:
                lata(t, x, y + 50, 46, 82, c, BRANCO)
            else:
                t.ret(x - 38, y + 12, x + 38, y + 90, c, raio=10, borda=PRETO, lb=3)
                t.ret(x - 28, y + 34, x + 28, y + 60, BRANCO, raio=6)
                t.circ(x, y + 47, 9, c)
            t.texto("%d%d" % (j + 1, i + 1), (x - 20, y + 104, x + 20, y + 122), F_BLACK, BRANCO)
    t.ret(24, 712, 488, 752, (20, 22, 30), raio=8)
    pixel_texto(t, "ESCOLHA!", 40, 722, 3, (90, 255, 120))
    t.salva("maquina_lanche")


def placa_pizza():
    t = Tela(512, 512, (30, 120, 70))
    t.circ(256, 256, 250, (40, 140, 80))
    t.circ(256, 256, 226, None, BRANCO, 12)
    t.poli([(256, 360), (150, 150), (362, 150)], (255, 210, 100))
    t.ret(140, 128, 372, 160, (220, 150, 60), raio=14)
    for x, y in ((220, 190), (290, 200), (256, 260), (240, 310 - 70)):
        t.circ(x, y, 18, VERMELHO)
    t.circ(300, 250, 8, VERDE_E)
    t.texto("PIZZA", (130, 360, 382, 440), F_BLACK, BRANCO, VERMELHO, 0.06)
    t.salva("placa_pizza")


def placa_aberto():
    t = Tela(512, 192, (18, 12, 24))
    t.ret(10, 10, 502, 182, None, raio=40, borda=(255, 120, 200), lb=6)
    t.texto("ABERTO", (40, 26, 472, 166), F_BLACK_IT, (255, 90, 120), (255, 200, 210), 0.03, glow=(255, 60, 100, 230))
    t.brilho(6, 0.35)
    t.salva("placa_aberto")


def relogio_quadro(txt, cor):
    t = Tela(512, 256, (12, 12, 16))
    for j in range(16):
        for i in range(33):
            t.circ(8 + i * 15.5, 10 + j * 15.5, 4, (36, 30, 30))
    pixel_caixa(t, txt, (24, 40, 488, 216), cor, gap=0.14, redondo=True)
    t.brilho(5, 0.6)
    return t


def relogio():
    junta_quadros("relogio_digital", [relogio_quadro("10:30", (255, 90, 70)), relogio_quadro("25°C", (255, 200, 60)),
                                      relogio_quadro("BOM DIA", (90, 230, 255))])


TODAS = [outdoor_futuro, outdoor_carro, outdoor_vr, outdoor_trivision, outdoor_viagem, outdoor_led,
         faixa_futuro, faixa_energia, faixa_sonhe, faixa_limpa, led_aberto, led_promocao, bandeira_festa,
         painel_parque, painel_estudo, painel_recarga, painel_sol, painel_lanche, painel_lago, painel_flores,
         painel_cinema_esq, painel_estreia, vertical_foguete, vertical_banco, vertical_saude, vertical_conectado,
         vertical_drones, vertical_lixo, vertical_bike, totem_universidade, totem_laboratorio, totem_refri,
         totem_carro_voador, placa_gota, placa_desfile, avisos, bandeirola, placa_wifi, totem_mapa, placa_cafe,
         tela_fliperama, maquina_lanche, placa_pizza, placa_aberto, relogio]

if __name__ == "__main__":
    for f in TODAS:
        f()
    print("estampas em", PASTA)
