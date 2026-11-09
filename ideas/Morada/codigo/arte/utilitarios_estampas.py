"""Estampas dos utilitários da cidade do Morada (letreiros de ônibus, faixas de ambulância e bombeiros, placas),
desenhadas com PIL.

Uso: python3 -I morada-art/utilitarios_estampas.py SP/cidade_out
Grava SP/cidade_out/utilitarios/estampas/<nome>.png. O gerador (cidade_utilitarios.py) carrega cada PNG com
mb.material_estampa. Só palavras genéricas em português, sem nome de marca. Desenho em 2× e redução (antisserrilha).
"""
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFont

SAIDA = sys.argv[1]
PASTA = os.path.join(SAIDA, "utilitarios", "estampas")
os.makedirs(PASTA, exist_ok=True)
F_BLACK = "/usr/share/fonts/opentype/inter/Inter-Black.otf"
F_BLACK_IT = "/usr/share/fonts/opentype/inter/Inter-BlackItalic.otf"
F_MONO = "/usr/share/fonts/truetype/jetbrains-mono/JetBrainsMono-ExtraBold.ttf"
SS = 2

PRETO = (24, 26, 36)
MARINHO = (22, 32, 72)
BRANCO = (250, 250, 246)
AMARELO = (255, 212, 52)
AMBAR = (255, 178, 40)
LARANJA = (255, 138, 48)
VERMELHO = (229, 72, 77)
VERMELHO_E = (183, 50, 58)
ROSA = (242, 127, 162)
ROSA_C = (255, 200, 222)
MAGENTA = (220, 50, 160)
VERDE = (78, 179, 95)
VERDE_E = (30, 122, 75)
VERDE_LIMA = (183, 220, 91)
TURQUESA = (44, 183, 194)
AZUL = (48, 135, 224)
CIANO = (90, 230, 255)


def fonte(caminho, tam):
    try:
        return ImageFont.truetype(caminho, tam)
    except OSError:
        return ImageFont.truetype(F_BLACK, tam)


def nova(w, h, cor):
    return Image.new("RGBA", (w * SS, h * SS), cor + (255,))


def salva(im, nome):
    w, h = im.size
    im = im.resize((w // SS, h // SS), Image.LANCZOS).convert("RGB")
    im.save(os.path.join(PASTA, nome + ".png"))
    print("estampa", nome, im.size)


def texto_centro(dr, caixa, txt, f, cor, contorno=None, larg_contorno=0, sombra=None):
    x0, y0, x1, y1 = caixa
    bb = dr.textbbox((0, 0), txt, font=f, stroke_width=larg_contorno)
    w, h = bb[2] - bb[0], bb[3] - bb[1]
    x = (x0 + x1 - w) / 2 - bb[0]
    y = (y0 + y1 - h) / 2 - bb[1]
    if sombra:
        dr.text((x + sombra[0], y + sombra[1]), txt, font=f, fill=sombra[2], stroke_width=larg_contorno,
                stroke_fill=sombra[2])
    dr.text((x, y), txt, font=f, fill=cor, stroke_width=larg_contorno, stroke_fill=contorno)


def cabe(dr, txt, caminho, larg, alt, contorno=0):
    """Maior tamanho de fonte em que o texto cabe em larg × alt."""
    t = int(alt)
    while t > 8:
        f = fonte(caminho, t)
        bb = dr.textbbox((0, 0), txt, font=f, stroke_width=contorno)
        if bb[2] - bb[0] <= larg and bb[3] - bb[1] <= alt:
            return f
        t -= 2
    return fonte(caminho, 8)


def letreiro_led(nome, numero, destino, cor=AMBAR):
    """Letreiro de destino do ônibus: fundo preto, texto em pontinhos de LED âmbar (número + destino)."""
    W, H_ = 1024, 160
    im = nova(W, H_, (14, 16, 22))
    dr = ImageDraw.Draw(im)
    # texto num rascunho pequeno, depois cada pixel aceso vira um ponto de LED
    gw, gh = 192, 30
    g = Image.new("L", (gw, gh), 0)
    gd = ImageDraw.Draw(g)
    f_num = fonte(F_BLACK, 26)
    bbn = gd.textbbox((0, 0), numero, font=f_num)
    gd.text((4 - bbn[0], (gh - (bbn[3] - bbn[1])) / 2 - bbn[1]), numero, font=f_num, fill=255)
    x_dest = 4 + bbn[2] - bbn[0] + 10
    f_d = cabe(gd, destino, F_BLACK, gw - x_dest - 4, 22)
    bbd = gd.textbbox((0, 0), destino, font=f_d)
    gd.text((x_dest + (gw - x_dest - 4 - (bbd[2] - bbd[0])) / 2 - bbd[0], (gh - (bbd[3] - bbd[1])) / 2 - bbd[1]),
            destino, font=f_d, fill=255)
    passo = W * SS / gw
    r = passo * 0.36
    escuro = tuple(int(c * 0.16) for c in cor)
    for j in range(gh):
        for i in range(gw):
            v = g.getpixel((i, j))
            cx, cy = (i + 0.5) * passo, (j + 0.5) * (H_ * SS / gh)
            c = cor if v > 110 else escuro
            dr.ellipse((cx - r, cy - r, cx + r, cy + r), fill=c)
    salva(im, nome)


def faixa_texto(nome, txt, fundo, cor_txt, W=1024, H_=160, contorno=None, listra=None, italico=False):
    """Faixa lateral com uma palavra grande (bombeiros, escolar). listra = (cor, fração) nas bordas de cima e de baixo."""
    im = nova(W, H_, fundo)
    dr = ImageDraw.Draw(im)
    m = 0
    if listra:
        cor_l, fr = listra
        h_l = int(H_ * SS * fr)
        dr.rectangle((0, 0, W * SS, h_l), fill=cor_l)
        dr.rectangle((0, H_ * SS - h_l, W * SS, H_ * SS), fill=cor_l)
        m = h_l
    lc = 6 * SS if contorno else 0
    f = cabe(dr, txt, F_BLACK_IT if italico else F_BLACK, W * SS * 0.9, (H_ * SS - 2 * m) * 0.78, lc)
    texto_centro(dr, (0, m, W * SS, H_ * SS - m), txt, f, cor_txt, contorno, lc)
    salva(im, nome)


def ambulancia():
    # faixa lateral: vermelha com AMBULÂNCIA em branco, filete branco por dentro
    W, H_ = 1024, 150
    im = nova(W, H_, VERMELHO)
    dr = ImageDraw.Draw(im)
    dr.rectangle((0, 12 * SS, W * SS, 16 * SS), fill=BRANCO)
    dr.rectangle((0, (H_ - 16) * SS, W * SS, (H_ - 12) * SS), fill=BRANCO)
    f = cabe(dr, "AMBULÂNCIA", F_BLACK, W * SS * 0.86, 88 * SS)
    texto_centro(dr, (0, 18 * SS, W * SS, (H_ - 18) * SS), "AMBULÂNCIA", f, BRANCO)
    salva(im, "faixa_ambulancia")
    # estrela da vida em verde (seis braços) num círculo branco
    S = 256
    im = nova(S, S, BRANCO)
    dr = ImageDraw.Draw(im)
    c = S * SS / 2
    for k in range(3):
        a = math.radians(90 + 60 * k)
        L, w = S * SS * 0.42, S * SS * 0.13
        dx, dy = math.cos(a), math.sin(a)
        px, py = -dy, dx
        pts = [(c + dx * L + px * w, c + dy * L + py * w), (c + dx * L - px * w, c + dy * L - py * w),
               (c - dx * L - px * w, c - dy * L - py * w), (c - dx * L + px * w, c - dy * L + py * w)]
        dr.polygon(pts, fill=VERDE)
    dr.line((c, c - S * SS * 0.3, c, c + S * SS * 0.3), fill=BRANCO, width=int(S * SS * 0.03))
    salva(im, "estrela_vida")
    # letreiro da frente (o mesmo texto, para a testeira)
    faixa_texto("testeira_ambulancia", "AMBULÂNCIA", BRANCO, VERMELHO, W=768, H_=128)


def reciclagem():
    """Símbolo de reciclagem branco num círculo verde-escuro (três setas dobradas em triângulo)."""
    S = 512
    im = nova(S, S, VERDE)
    dr = ImageDraw.Draw(im)
    c = S * SS / 2
    R = S * SS * 0.47
    dr.ellipse((c - R, c - R, c + R, c + R), fill=VERDE_E)
    R2 = S * SS * 0.43
    dr.ellipse((c - R2, c - R2, c + R2, c + R2), outline=BRANCO, width=int(S * SS * 0.018))
    r_tri = S * SS * 0.27
    vert = [(c + r_tri * math.cos(math.radians(90 + 120 * k)), c - r_tri * math.sin(math.radians(90 + 120 * k)))
            for k in range(3)]
    w = S * SS * 0.075
    for k in range(3):
        a, b = vert[k], vert[(k + 1) % 3]
        # trecho do lado (com folga nas pontas) e ponta de seta perto de b
        t0, t1 = 0.12, 0.70
        p0 = (a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0)
        p1 = (a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1)
        dr.line((p0, p1), fill=BRANCO, width=int(w))
        dx, dy = b[0] - a[0], b[1] - a[1]
        L = math.hypot(dx, dy)
        dx, dy = dx / L, dy / L
        px, py = -dy, dx
        tip = (a[0] + (b[0] - a[0]) * 0.88, a[1] + (b[1] - a[1]) * 0.88)
        base = (p1[0] - dx * w * 0.2, p1[1] - dy * w * 0.2)
        dr.polygon([tip, (base[0] + px * w * 1.15, base[1] + py * w * 1.15),
                    (base[0] - px * w * 1.15, base[1] - py * w * 1.15)], fill=BRANCO)
    salva(im, "reciclagem")


def sorvete():
    """Placa SORVETE: letras gordas brancas com contorno magenta num fundo rosa, bolinhas coloridas (confeitos)."""
    W, H_ = 768, 256
    im = nova(W, H_, ROSA)
    dr = ImageDraw.Draw(im)
    import random
    rnd = random.Random(4)
    for _ in range(70):
        x, y = rnd.uniform(0, W * SS), rnd.uniform(0, H_ * SS)
        r = rnd.uniform(4, 9) * SS
        dr.ellipse((x - r, y - r * 0.45, x + r, y + r * 0.45),
                   fill=rnd.choice([AMARELO, CIANO, BRANCO, VERDE_LIMA, LARANJA]))
    dr.rounded_rectangle((10 * SS, 10 * SS, (W - 10) * SS, (H_ - 10) * SS), radius=40 * SS, outline=BRANCO,
                         width=10 * SS)
    f = cabe(dr, "SORVETE", F_BLACK, W * SS * 0.84, H_ * SS * 0.62, 10 * SS)
    texto_centro(dr, (0, 0, W * SS, H_ * SS), "SORVETE", f, BRANCO, MAGENTA, 10 * SS,
                 sombra=(0, 8 * SS, (150, 30, 110)))
    salva(im, "placa_sorvete")
    # cardápio da janela: três casquinhas e preços sem marca
    W, H_ = 512, 256
    im = nova(W, H_, (255, 246, 228))
    dr = ImageDraw.Draw(im)
    for k, cor in enumerate((ROSA, (130, 86, 60), (150, 220, 190))):
        cx = (90 + k * 166) * SS
        dr.polygon([(cx - 34 * SS, 120 * SS), (cx + 34 * SS, 120 * SS), (cx, 220 * SS)], fill=(226, 170, 96))
        for j in range(4):
            dr.line((cx - 30 * SS + j * 18 * SS, 124 * SS, cx + 4 * SS + j * 6 * SS, 200 * SS), fill=(196, 132, 66),
                    width=3 * SS)
        dr.ellipse((cx - 44 * SS, 50 * SS, cx + 44 * SS, 134 * SS), fill=cor)
        dr.ellipse((cx - 10 * SS, 34 * SS, cx + 10 * SS, 54 * SS), fill=VERMELHO)
    f = fonte(F_BLACK, 34 * SS)
    texto_centro(dr, (0, 4 * SS, W * SS, 40 * SS), "CASQUINHA  •  PICOLÉ  •  TAÇA", fonte(F_BLACK, 22 * SS),
                 MAGENTA)
    salva(im, "cardapio_sorvete")


def bombeiros():
    faixa_texto("faixa_bombeiros", "BOMBEIROS", VERMELHO, BRANCO, W=1024, H_=150, listra=(AMARELO, 0.12))
    faixa_texto("testeira_bombeiros", "BOMBEIROS", BRANCO, VERMELHO, W=768, H_=128)


def escolar():
    faixa_texto("faixa_escolar", "ESCOLAR", PRETO, AMARELO, W=1024, H_=160)
    faixa_texto("placa_escolar", "ESCOLAR", AMARELO, PRETO, W=640, H_=160)


def turismo():
    faixa_texto("faixa_turismo", "TURISMO", AZUL, BRANCO, W=1024, H_=180, contorno=(20, 60, 150), italico=True)


def som():
    """Painel do caminhão de som: equalizador em barras coloridas (brilha à noite)."""
    W, H_ = 512, 256
    im = nova(W, H_, (20, 16, 40))
    dr = ImageDraw.Draw(im)
    import random
    rnd = random.Random(7)
    n = 14
    cores = [CIANO, VERDE_LIMA, AMARELO, LARANJA, MAGENTA, (150, 100, 255)]
    for i in range(n):
        h = rnd.randint(4, 11)
        for j in range(h):
            cor = cores[min(len(cores) - 1, j // 2)]
            x0 = (16 + i * 34) * SS
            y1 = (H_ - 16 - j * 20) * SS
            dr.rounded_rectangle((x0, y1 - 14 * SS, x0 + 26 * SS, y1), radius=3 * SS, fill=cor)
    salva(im, "equalizador")


def placa_veiculo(nome, txt):
    """Placa de carro genérica (branca com faixa azul em cima)."""
    W, H_ = 400, 130
    im = nova(W, H_, BRANCO)
    dr = ImageDraw.Draw(im)
    dr.rectangle((0, 0, W * SS, 30 * SS), fill=(40, 70, 170))
    dr.rectangle((0, 0, W * SS - 1, H_ * SS - 1), outline=PRETO, width=5 * SS)
    f = cabe(dr, txt, F_MONO, W * SS * 0.86, 78 * SS)
    texto_centro(dr, (0, 32 * SS, W * SS, H_ * SS), txt, f, PRETO)
    salva(im, nome)


def main():
    letreiro_led("led_turismo", "25", "TURISMO")
    letreiro_led("led_centro", "96", "CENTRO")
    letreiro_led("led_estacao", "302", "ESTAÇÃO")
    letreiro_led("led_escolar", "", "ESCOLAR")
    letreiro_led("led_bonde", "1", "PRAÇA")
    letreiro_led("led_bonde_moderno", "VLT", "PORTO", cor=(120, 230, 255))
    letreiro_led("led_trem", "", "EXPRESSO", cor=(255, 120, 60))
    ambulancia()
    reciclagem()
    sorvete()
    bombeiros()
    escolar()
    turismo()
    som()
    placa_veiculo("placa_mor", "MOR·2A26")


if __name__ == "__main__":
    main()
