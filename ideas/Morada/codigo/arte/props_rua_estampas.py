"""Estampas (PNG desenhados com PIL) da categoria props_rua: telas, vitrines de máquinas, mapa, placas e rótulos.

Tudo original, em português e sem marcas. Roda dentro do gerador (blender-venv tem PIL) ou sozinho:
    python3 -I morada-art/props_rua_estampas.py SP/cidade_out/props_rua/estampas
"""
import math
import os
import random
import sys

F_BLACK = "/usr/share/fonts/opentype/inter/Inter-Black.otf"
F_BOLD = "/usr/share/fonts/opentype/inter/Inter-Bold.otf"
CORES = {
    "branco": "#F7F7F4", "creme": "#F5E5BC", "vermelho": "#E5484D", "vermelho_escuro": "#B7323A", "laranja": "#F98B37", "laranja_escuro": "#E0691F",
    "amarelo": "#FFD340", "amarelo_escuro": "#F1B61C", "verde": "#4EB35F", "verde_escuro": "#1E7A4B", "verde_claro": "#8FD07B",
    "verde_lima": "#B7DC5B", "turquesa": "#2CB7C2", "azul": "#3087E0", "azul_medio": "#2664C4", "azul_escuro": "#20408F",
    "azul_claro": "#90CBF5", "azul_marinho": "#1D2C56", "azul_noite": "#25375B", "roxo": "#8B5DD6", "rosa": "#F27FA2",
    "marrom": "#7C4F37", "madeira": "#B8763F", "grafite": "#404752", "grafite_escuro": "#2C313A", "preto": "#1E2127",
    "cinza_claro": "#CBD0D7", "cinza": "#9CA4AF", "tela": "#1F2734", "neon_ciano": "#44E4FF", "grama": "#7ACB4C",
    "agua_rio": "#3C99D5", "calcada": "#D4D8DE", "piso_rosado": "#E3BFB0", "lilas": "#BAA1EB", "menta": "#AAE5CA",
    "pessego": "#FBC6A2", "magenta": "#C83D8E", "mostarda": "#E4A92D", "metal_escuro": "#6B737D",
}
S = 2  # supersample


def _c(n):
    return CORES.get(n, n)


def _fonte(tam, f=F_BLACK):
    from PIL import ImageFont
    return ImageFont.truetype(f, int(tam))


def _txt(d, xy, t, tam, cor, f=F_BLACK, anc="mm"):
    d.text(xy, t, font=_fonte(tam, f), fill=_c(cor), anchor=anc)


def _txt_cabe(d, xy, t, tam, cor, larg_max, f=F_BLACK, anc="mm"):
    """Texto que encolhe até caber em larg_max."""
    while tam > 8 and d.textlength(t, font=_fonte(tam, f)) > larg_max:
        tam *= 0.94
    _txt(d, xy, t, tam, cor, f, anc)


def _nova(w, h, fundo):
    from PIL import Image, ImageDraw
    im = Image.new("RGB", (w * S, h * S), _c(fundo))
    return im, ImageDraw.Draw(im)


def _salva(im, pasta, nome, w, h):
    from PIL import Image
    im.resize((w, h), Image.LANCZOS).save(os.path.join(pasta, nome + ".png"))


def _raio(d, cx, cy, s, cor):
    """Raio (relâmpago) centrado em (cx, cy), altura s."""
    p = [(0.10, -0.50), (-0.28, 0.06), (-0.02, 0.06), (-0.12, 0.50), (0.28, -0.08), (0.02, -0.08), (0.14, -0.50)]
    d.polygon([(cx + x * s, cy + y * s) for x, y in p], fill=_c(cor))


def _bici(d, cx, cy, s, cor, w):
    """Bicicletinha de lado (ícone), centro (cx, cy), largura ~s."""
    r = s * 0.2
    a, b = (cx - s * 0.28, cy + s * 0.1), (cx + s * 0.28, cy + s * 0.1)
    for q in (a, b):
        d.ellipse((q[0] - r, q[1] - r, q[0] + r, q[1] + r), outline=_c(cor), width=w)
    sel, gui, ped = (cx - s * 0.08, cy - s * 0.2), (cx + s * 0.18, cy - s * 0.24), (cx, cy + s * 0.1)
    d.line([a, ped, (cx + s * 0.14, cy - s * 0.14), a], fill=_c(cor), width=w, joint="curve")
    d.line([ped, sel], fill=_c(cor), width=w)
    d.line([(cx + s * 0.14, cy - s * 0.14), b], fill=_c(cor), width=w)
    d.line([(cx + s * 0.14, cy - s * 0.14), gui], fill=_c(cor), width=w)
    d.line([(sel[0] - s * 0.07, sel[1]), (sel[0] + s * 0.06, sel[1])], fill=_c(cor), width=int(w * 1.4))
    d.line([(gui[0] - s * 0.02, gui[1]), (gui[0] + s * 0.08, gui[1] - s * 0.02)], fill=_c(cor), width=w)


def _pata(d, cx, cy, s, cor):
    d.ellipse((cx - s * 0.28, cy - s * 0.05, cx + s * 0.28, cy + s * 0.4), fill=_c(cor))
    for dx, dy in ((-0.36, -0.18), (-0.13, -0.36), (0.13, -0.36), (0.36, -0.18)):
        d.ellipse((cx + dx * s - s * 0.11, cy + dy * s - s * 0.14, cx + dx * s + s * 0.11, cy + dy * s + s * 0.14),
                  fill=_c(cor))


def vitrine_bebidas(pasta):
    """Vitrine da máquina de bebidas: 4 prateleiras de latas e garrafas coloridas atrás do vidro (512 × 1024)."""
    W, H = 512, 1024
    im, d = _nova(W, H, "#DDEFFA")
    w, h = W * S, H * S
    d.rectangle((0, 0, w, h * 0.06), fill="#FFFDF2")  # lâmpada interna da vitrine
    rnd = random.Random(3)
    cores = ["vermelho", "laranja", "verde", "azul", "amarelo", "roxo", "turquesa", "rosa", "verde_lima", "azul_medio"]
    for fi in range(4):
        y1 = h * (0.27 + 0.2 * fi)
        d.rectangle((w * 0.04, y1, w * 0.96, y1 + h * 0.018), fill=_c("cinza"))
        n = 5
        for k in range(n):
            x = w * (0.13 + 0.185 * k)
            c = cores[(fi * 3 + k) % len(cores)]
            if (fi + k) % 2 == 0:  # lata
                lw, lh = w * 0.13, h * 0.11
                d.rounded_rectangle((x - lw / 2, y1 - lh, x + lw / 2, y1), radius=lw * 0.18, fill=_c(c))
                d.rectangle((x - lw / 2, y1 - lh * 0.62, x + lw / 2, y1 - lh * 0.38), fill=_c("branco"))
                d.rectangle((x - lw * 0.4, y1 - lh - h * 0.006, x + lw * 0.4, y1 - lh + h * 0.006), fill=_c("cinza_claro"))
            else:  # garrafa
                gw, gh = w * 0.1, h * 0.15
                d.rounded_rectangle((x - gw / 2, y1 - gh * 0.7, x + gw / 2, y1), radius=gw * 0.3, fill=_c(c))
                d.polygon([(x - gw / 2, y1 - gh * 0.62), (x - gw * 0.2, y1 - gh * 0.9), (x + gw * 0.2, y1 - gh * 0.9),
                           (x + gw / 2, y1 - gh * 0.62)], fill=_c(c))
                d.rectangle((x - gw * 0.18, y1 - gh, x + gw * 0.18, y1 - gh * 0.88), fill=_c("branco"))
                d.rectangle((x - gw / 2, y1 - gh * 0.45, x + gw / 2, y1 - gh * 0.25), fill=_c("creme"))
            # etiqueta de preço com número do botão
            d.rounded_rectangle((x - w * 0.07, y1 + h * 0.024, x + w * 0.07, y1 + h * 0.05), radius=8, fill=_c("branco"))
            _txt(d, (x, y1 + h * 0.037), f"{fi + 1}{k + 1}", h * 0.02, "grafite", F_BOLD)
        _ = rnd
    # brilho no vidro
    d.polygon([(w * 0.62, 0 + h * 0.13), (w * 0.78, h * 0.13), (w * 0.38, h), (w * 0.22, h)], fill="#E8F6FD")
    _salva(im, pasta, "vitrine_bebidas", W, H)


def vitrine_lanches(pasta):
    """Vitrine da máquina de lanches: espirais com pacotinhos e barras (512 × 1024)."""
    W, H = 512, 1024
    im, d = _nova(W, H, "#F1F4F8")
    w, h = W * S, H * S
    d.rectangle((0, 0, w, h * 0.06), fill="#FFFDF2")  # lâmpada interna da vitrine
    cores = ["laranja", "vermelho", "amarelo", "verde", "roxo", "rosa", "azul", "marrom", "turquesa", "mostarda"]
    for fi in range(5):
        y1 = h * (0.27 + 0.16 * fi)
        d.rectangle((w * 0.03, y1, w * 0.97, y1 + h * 0.014), fill=_c("grafite"))
        for k in range(4):
            x = w * (0.14 + 0.24 * k)
            c = cores[(fi * 2 + k) % len(cores)]
            for e in range(5):  # espiral vista de frente: ondinhas
                ex = x - w * 0.09 + e * w * 0.045
                d.arc((ex - w * 0.03, y1 - h * 0.03, ex + w * 0.03, y1 + h * 0.004), 0, 180, fill=_c("cinza"), width=6)
            if fi % 2 == 0:  # pacotinho
                d.rounded_rectangle((x - w * 0.08, y1 - h * 0.115, x + w * 0.08, y1 - h * 0.012), radius=18, fill=_c(c))
                d.ellipse((x - w * 0.04, y1 - h * 0.085, x + w * 0.04, y1 - h * 0.045), fill=_c("branco"))
                d.rectangle((x - w * 0.08, y1 - h * 0.12, x + w * 0.08, y1 - h * 0.108), fill=_c("cinza_claro"))
            else:  # barra
                d.rounded_rectangle((x - w * 0.09, y1 - h * 0.06, x + w * 0.09, y1 - h * 0.012), radius=10, fill=_c(c))
                d.rectangle((x - w * 0.03, y1 - h * 0.06, x + w * 0.03, y1 - h * 0.012), fill=_c("branco"))
            d.rounded_rectangle((x - w * 0.06, y1 + h * 0.018, x + w * 0.06, y1 + h * 0.04), radius=8, fill=_c("amarelo"))
            _txt(d, (x, y1 + h * 0.029), f"{chr(65 + fi)}{k + 1}", h * 0.017, "grafite", F_BOLD)
    d.polygon([(w * 0.62, h * 0.13), (w * 0.76, h * 0.13), (w * 0.36, h), (w * 0.22, h)], fill="#FAFCFE")
    _salva(im, pasta, "vitrine_lanches", W, H)


def topo_maquina(pasta, nome, texto, fundo, cor="branco"):
    W, H = 512, 128
    im, d = _nova(W, H, fundo)
    w, h = W * S, H * S
    _txt_cabe(d, (w / 2, h / 2), texto, h * 0.6, cor, w * 0.9)
    _salva(im, pasta, nome, W, H)


def tela_atm(pasta):
    """Tela do caixa eletrônico: 3 quadros lado a lado (para "trocar"): OLÁ, SAQUE e 24 HORAS (768 × 256)."""
    W, H = 768, 256
    im, d = _nova(W, H, "azul_medio")
    q = W * S / 3
    h = H * S
    for k, (t1, t2) in enumerate((("OLÁ!", "TOQUE PARA COMEÇAR"), ("SAQUE", "DEPÓSITO • SALDO"), ("24 H", "TODOS OS DIAS"))):
        x0 = q * k
        d.rectangle((x0, 0, x0 + q, h), fill=_c(("azul_medio", "turquesa", "verde_escuro")[k]))
        d.rounded_rectangle((x0 + q * 0.06, h * 0.08, x0 + q * 0.94, h * 0.92), radius=26, outline=_c("branco"), width=8)
        _txt_cabe(d, (x0 + q / 2, h * 0.42), t1, h * 0.36, "branco", q * 0.8)
        _txt_cabe(d, (x0 + q / 2, h * 0.74), t2, h * 0.1, "amarelo", q * 0.8, F_BOLD)
    _salva(im, pasta, "tela_atm", W, H)


def revistas(pasta):
    """Parede de revistas da banca: capas coloridas em 3 fileiras (1024 × 512)."""
    W, H = 1024, 512
    im, d = _nova(W, H, "creme")
    w, h = W * S, H * S
    rnd = random.Random(7)
    cores = ["vermelho", "azul", "amarelo", "verde", "rosa", "roxo", "laranja", "turquesa", "magenta", "azul_escuro",
             "verde_lima", "mostarda"]
    titulos = ["CASA", "MODA", "BOLA", "GIBI", "VIAJE", "COZINHA", "CARRO", "SAÚDE", "CIÊNCIA", "MÚSICA", "JARDIM", "PET",
               "CINEMA", "JOGOS", "MAR", "ARTE"]
    for fi in range(3):
        y0 = h * (0.03 + 0.325 * fi)
        hh = h * 0.29
        d.rectangle((0, y0 + hh, w, y0 + hh + h * 0.02), fill=_c("madeira"))
        x = w * 0.01
        k = 0
        while x < w * 0.98:
            cw = w * rnd.uniform(0.075, 0.1)
            c = cores[rnd.randrange(len(cores))]
            d.rectangle((x, y0, x + cw, y0 + hh), fill=_c(c))
            claro = c in ("amarelo", "verde_lima", "mostarda", "rosa")
            tc = "grafite_escuro" if claro else "branco"
            _txt_cabe(d, (x + cw / 2, y0 + hh * 0.13), titulos[(fi * 7 + k) % len(titulos)], hh * 0.13, tc, cw * 0.86)
            fig = rnd.randrange(3)
            cx, cy = x + cw / 2, y0 + hh * 0.58
            if fig == 0:
                d.ellipse((cx - cw * 0.3, cy - cw * 0.3, cx + cw * 0.3, cy + cw * 0.3), fill=_c("branco"))
                d.ellipse((cx - cw * 0.16, cy - cw * 0.16, cx + cw * 0.16, cy + cw * 0.16), fill=_c(cores[(k + 3) % 12]))
            elif fig == 1:
                d.rectangle((x + cw * 0.12, cy - hh * 0.2, x + cw * 0.88, cy + hh * 0.18), fill=_c("creme"))
                d.polygon([(x + cw * 0.12, cy + hh * 0.18), (cx, cy - hh * 0.12), (x + cw * 0.88, cy + hh * 0.18)],
                          fill=_c("verde"))
            else:
                for j in range(3):
                    d.rectangle((x + cw * 0.15, cy - hh * 0.16 + j * hh * 0.12, x + cw * 0.85, cy - hh * 0.1 + j * hh * 0.12),
                                fill=_c("branco"))
            d.rectangle((x + cw * 0.1, y0 + hh * 0.86, x + cw * 0.6, y0 + hh * 0.9), fill=_c(tc))
            x += cw + w * 0.008
            k += 1
    _salva(im, pasta, "revistas", W, H)


def letreiro(pasta, nome, texto, fundo, cor="branco", W=1024, H=160, icone=None, cor_icone=None):
    im, d = _nova(W, H, fundo)
    w, h = W * S, H * S
    d.rounded_rectangle((h * 0.08, h * 0.1, w - h * 0.08, h * 0.9), radius=h * 0.18, outline=_c(cor), width=int(h * 0.04))
    x_txt = w / 2
    if icone == "chave":
        cx, cy, s = h * 0.62, h / 2, h * 0.5
        d.ellipse((cx - s * 0.5, cy - s * 0.35, cx + s * 0.2, cy + s * 0.35), outline=_c(cor_icone or cor), width=int(s * 0.18))
        d.rectangle((cx + s * 0.18, cy - s * 0.08, cx + s * 1.1, cy + s * 0.08), fill=_c(cor_icone or cor))
        for dx in (0.7, 0.95):
            d.rectangle((cx + s * dx, cy, cx + s * (dx + 0.1), cy + s * 0.3), fill=_c(cor_icone or cor))
        # sapato do outro lado
        sx, sy = w - h * 1.05, h * 0.62
        d.polygon([(sx, sy - h * 0.3), (sx + h * 0.18, sy - h * 0.3), (sx + h * 0.24, sy - h * 0.1), (sx + h * 0.7, sy - h * 0.02),
                   (sx + h * 0.74, sy + h * 0.1), (sx, sy + h * 0.1)], fill=_c(cor_icone or cor))
        x_txt = w / 2
    _txt_cabe(d, (x_txt, h / 2), texto, h * 0.52, cor, w * (0.56 if icone else 0.88))
    _salva(im, pasta, nome, W, H)


def mapa(pasta):
    """Mapa do bairro do totem luminoso: quadras, parque, rio, ruas e o alfinete VOCÊ ESTÁ AQUI (512 × 768)."""
    W, H = 512, 768
    im, d = _nova(W, H, "branco")
    w, h = W * S, H * S
    d.rectangle((0, 0, w, h * 0.13), fill=_c("azul_medio"))
    d.ellipse((w * 0.05, h * 0.02, w * 0.05 + h * 0.09, h * 0.11), fill=_c("branco"))
    _txt(d, (w * 0.05 + h * 0.045, h * 0.067), "i", h * 0.075, "azul_medio")
    _txt_cabe(d, (w * 0.6, h * 0.067), "MAPA DO BAIRRO", h * 0.06, "branco", w * 0.66)
    m0, m1 = h * 0.15, h * 0.8
    d.rectangle((w * 0.04, m0, w * 0.96, m1), fill=_c("calcada"))
    # rio
    pts = [(w * (0.04 + 0.92 * t / 20), m0 + (m1 - m0) * (0.75 + 0.06 * math.sin(t * 0.7))) for t in range(21)]
    d.line(pts, fill=_c("agua_rio"), width=int(h * 0.05), joint="curve")
    # quadras
    rnd = random.Random(5)
    cs = ["piso_rosado", "creme", "pessego", "lilas", "menta", "cinza_claro"]
    for i in range(4):
        for j in range(4):
            x0 = w * (0.07 + 0.225 * i)
            y0 = m0 + (m1 - m0) * (0.04 + 0.17 * j)
            c = cs[rnd.randrange(len(cs))]
            if (i, j) in ((1, 1), (2, 1)):
                c = "grama"
            d.rounded_rectangle((x0, y0, x0 + w * 0.19, y0 + (m1 - m0) * 0.14), radius=14, fill=_c(c))
    d.ellipse((w * 0.38, m0 + (m1 - m0) * 0.27, w * 0.52, m0 + (m1 - m0) * 0.35), fill=_c("agua_rio"))  # lago do parque
    for x, y in ((0.3, 0.24), (0.6, 0.26), (0.5, 0.36)):  # arvorezinhas
        d.ellipse((w * x - 18, m0 + (m1 - m0) * y - 18, w * x + 18, m0 + (m1 - m0) * y + 18), fill=_c("verde"))
    # rota tracejada até o parque
    px, py = w * 0.74, m0 + (m1 - m0) * 0.58
    alvo = (w * 0.45, m0 + (m1 - m0) * 0.31)
    for t in range(0, 10, 2):
        a = (px + (alvo[0] - px) * t / 10, py + (alvo[1] - py) * t / 10)
        b = (px + (alvo[0] - px) * (t + 1) / 10, py + (alvo[1] - py) * (t + 1) / 10)
        d.line([a, b], fill=_c("laranja"), width=10)
    # alfinete
    r = h * 0.035
    d.ellipse((px - r, py - r * 2.2, px + r, py - r * 0.2), fill=_c("vermelho"))
    d.polygon([(px - r * 0.8, py - r * 0.9), (px + r * 0.8, py - r * 0.9), (px, py + r * 0.5)], fill=_c("vermelho"))
    d.ellipse((px - r * 0.4, py - r * 1.6, px + r * 0.4, py - r * 0.8), fill=_c("branco"))
    d.rounded_rectangle((px - w * 0.2, py + r * 0.7, px + w * 0.2, py + r * 2.3), radius=12, fill=_c("vermelho"))
    _txt_cabe(d, (px, py + r * 1.5), "VOCÊ ESTÁ AQUI", r * 1.0, "branco", w * 0.36)
    # legenda
    y = h * 0.87
    for k, (c, t) in enumerate((("grama", "PARQUE"), ("agua_rio", "RIO"), ("laranja", "5 MIN A PÉ"))):
        x = w * (0.06 + 0.31 * k)
        d.rounded_rectangle((x, y - h * 0.02, x + h * 0.04, y + h * 0.02), radius=8, fill=_c(c))
        _txt_cabe(d, (x + h * 0.055, y), t, h * 0.028, "grafite", w * 0.24, F_BOLD, "lm")
    _txt(d, (w / 2, h * 0.95), "PRAÇA • ESTAÇÃO • MUSEU • PRAIA", h * 0.026, "azul_medio", F_BOLD)
    _salva(im, pasta, "mapa_bairro", W, H)


def setas(pasta):
    """Textos das placas de direção (fundo da cor da placa, texto branco centrado): 512 × 128 cada."""
    for nome, txt, fundo in (("seta_centro", "CENTRO", "azul_medio"), ("seta_estacao", "ESTAÇÃO", "azul_medio"),
                             ("seta_praia", "PRAIA", "marrom"), ("seta_parque", "PARQUE", "marrom"),
                             ("seta_museu", "MUSEU", "marrom")):
        W, H = 512, 128
        im, d = _nova(W, H, fundo)
        w, h = W * S, H * S
        d.rounded_rectangle((h * 0.08, h * 0.1, w - h * 0.08, h * 0.9), radius=h * 0.14, outline=_c("branco"),
                            width=int(h * 0.05))
        _txt_cabe(d, (w / 2, h * 0.53), txt, h * 0.56, "branco", w * 0.8)
        _salva(im, pasta, nome, W, H)


def tela_simples(pasta, nome, W, H, fundo, desenha):
    im, d = _nova(W, H, fundo)
    desenha(d, W * S, H * S)
    _salva(im, pasta, nome, W, H)


def outras(pasta):
    def parq(d, w, h):
        d.rounded_rectangle((w * 0.08, h * 0.08, w * 0.92, h * 0.6), radius=20, fill=_c("azul_medio"))
        _txt(d, (w / 2, h * 0.35), "P", h * 0.42, "branco")
        _txt(d, (w / 2, h * 0.74), "PAGUE AQUI", h * 0.11, "neon_ciano", F_BOLD)
        _txt(d, (w / 2, h * 0.88), "R$ 2,00 / H", h * 0.09, "branco", F_BOLD)
    tela_simples(pasta, "tela_parquimetro", 256, 256, "tela", parq)

    def recarga(d, w, h):
        d.rounded_rectangle((w * 0.1, h * 0.06, w * 0.9, h * 0.94), radius=30, outline=_c("neon_ciano"), width=10)
        d.ellipse((w * 0.25, h * 0.12, w * 0.75, h * 0.12 + w * 0.5), fill=_c("verde"))
        _raio(d, w / 2, h * 0.12 + w * 0.25, w * 0.4, "branco")
        _txt(d, (w / 2, h * 0.58), "RECARGA", h * 0.085, "branco")
        d.rounded_rectangle((w * 0.2, h * 0.68, w * 0.8, h * 0.78), radius=10, outline=_c("branco"), width=6)
        d.rectangle((w * 0.22, h * 0.69, w * 0.65, h * 0.77), fill=_c("verde_lima"))
        _txt(d, (w / 2, h * 0.86), "80%", h * 0.07, "verde_lima", F_BOLD)
    tela_simples(pasta, "tela_recarga", 256, 384, "tela", recarga)

    def bike(d, w, h):
        d.rectangle((0, 0, w, h * 0.3), fill=_c("verde"))
        _bici(d, w / 2, h * 0.15, w * 0.6, "branco", 9)
        _txt(d, (w / 2, h * 0.42), "BICICLETA", h * 0.07, "branco")
        _txt(d, (w / 2, h * 0.5), "COMPARTILHADA", h * 0.048, "verde_lima", F_BOLD)
        for k in range(3):
            y = h * (0.62 + 0.1 * k)
            d.rounded_rectangle((w * 0.12, y, w * 0.88, y + h * 0.07), radius=10, fill=_c("grafite"))
            _txt(d, (w * 0.3, y + h * 0.035), f"{k + 1}", h * 0.045, "branco", F_BOLD)
            d.ellipse((w * 0.7, y + h * 0.015, w * 0.7 + h * 0.04, y + h * 0.055),
                      fill=_c("verde_lima" if k != 2 else "vermelho"))
    tela_simples(pasta, "tela_bicicletas", 256, 512, "tela", bike)

    def vidro(d, w, h):
        d.rounded_rectangle((w * 0.04, h * 0.04, w * 0.96, h * 0.96), radius=30, fill=_c("branco"))
        bx = w / 2
        d.rounded_rectangle((bx - w * 0.13, h * 0.3, bx + w * 0.13, h * 0.66), radius=24, fill=_c("verde_escuro"))
        d.rectangle((bx - w * 0.05, h * 0.14, bx + w * 0.05, h * 0.32), fill=_c("verde_escuro"))
        _txt(d, (w / 2, h * 0.82), "VIDRO", h * 0.17, "verde_escuro")
    tela_simples(pasta, "rotulo_vidro", 256, 256, "verde", vidro)

    def lixo(d, w, h):
        d.rounded_rectangle((w * 0.04, h * 0.04, w * 0.96, h * 0.96), radius=30, fill=_c("branco"))
        cx = w / 2
        d.rounded_rectangle((cx - w * 0.16, h * 0.28, cx + w * 0.16, h * 0.62), radius=12, fill=_c("grafite"))
        d.rectangle((cx - w * 0.2, h * 0.22, cx + w * 0.2, h * 0.27), fill=_c("grafite"))
        d.rectangle((cx - w * 0.05, h * 0.16, cx + w * 0.05, h * 0.22), fill=_c("grafite"))
        _txt(d, (w / 2, h * 0.8), "LIXO", h * 0.18, "grafite")
    tela_simples(pasta, "rotulo_lixo", 256, 256, "cinza_claro", lixo)

    def cartas(d, w, h):
        ex, ey, ew, eh = w * 0.08, h * 0.25, h * 0.75, h * 0.5
        d.rectangle((ex, ey, ex + ew, ey + eh), fill=_c("branco"))
        d.line([(ex, ey), (ex + ew / 2, ey + eh * 0.58), (ex + ew, ey)], fill=_c("azul_medio"), width=int(h * 0.05))
        _txt(d, (w * 0.62, h * 0.52), "CARTAS", h * 0.4, "branco")
    tela_simples(pasta, "faixa_cartas", 512, 160, "azul_medio", cartas)

    def pet(d, w, h):
        _pata(d, w * 0.22, h * 0.48, h * 0.62, "branco")
        _txt(d, (w * 0.64, h * 0.5), "ÁGUA PET", h * 0.34, "branco")
    tela_simples(pasta, "placa_pet", 512, 160, "turquesa", pet)

    def solar(d, w, h):
        n, m = 6, 10
        for i in range(n):
            for j in range(m):
                x0, y0 = w * i / n, h * j / m
                d.rectangle((x0 + 4, y0 + 4, x0 + w / n - 4, y0 + h / m - 4), fill=_c("azul_escuro"))
                d.line([(x0 + w / n / 2, y0 + 4), (x0 + w / n / 2, y0 + h / m - 4)], fill=_c("azul_noite"), width=3)
    tela_simples(pasta, "celulas_solares", 256, 384, "cinza_claro", solar)

    def frutas(d, w, h):
        _txt(d, (w / 2, h * 0.52), "FRUTAS FRESCAS", h * 0.5, "branco")
    tela_simples(pasta, "placa_frutas", 768, 128, "verde_escuro", frutas)

    def maquinas(d, w, h):
        d.rectangle((0, 0, w, h), fill=_c("amarelo"))
        d.rectangle((w * 0.04, h * 0.1, w * 0.96, h * 0.9), fill=_c("amarelo"), outline=_c("preto"), width=6)
        _txt_cabe(d, (w / 2, h * 0.36), "CASA DE", h * 0.26, "preto", w * 0.86)
        _txt_cabe(d, (w / 2, h * 0.68), "MÁQUINAS", h * 0.26, "preto", w * 0.86)
    tela_simples(pasta, "placa_maquinas", 256, 128, "amarelo", maquinas)

    def chaves(d, w, h):  # quadro de chaves (pegboard) do chaveiro
        d.rectangle((0, 0, w, h), fill=_c("madeira"))
        rnd = random.Random(11)
        cs = ["amarelo_escuro", "cinza_claro", "mostarda", "vermelho", "azul", "verde"]
        for j in range(4):
            for i in range(8):
                x, y = w * (0.07 + 0.12 * i), h * (0.12 + 0.23 * j)
                d.ellipse((x - 5, y - 5, x + 5, y + 5), fill=_c("grafite_escuro"))
                c = cs[rnd.randrange(len(cs))]
                d.ellipse((x - 14, y + 4, x + 14, y + 30), outline=_c(c), width=7)
                d.rectangle((x - 4, y + 28, x + 4, y + 70), fill=_c(c))
                d.rectangle((x + 4, y + 52, x + 12, y + 58), fill=_c(c))
    tela_simples(pasta, "quadro_chaves", 512, 256, "madeira", chaves)


def ciclovia(pasta):
    """Símbolo pintado da ciclovia: bicicleta e seta brancas sobre a cor da faixa (256 × 512), laranja e verde."""
    def des(d, w, h):
        _bici(d, w / 2, h * 0.66, w * 0.86, "branco", int(w * 0.055))
        d.polygon([(w / 2, h * 0.06), (w * 0.84, h * 0.3), (w * 0.62, h * 0.3), (w * 0.62, h * 0.42), (w * 0.38, h * 0.42),
                   (w * 0.38, h * 0.3), (w * 0.16, h * 0.3)], fill=_c("branco"))
    tela_simples(pasta, "ciclovia_simbolo", 256, 512, "laranja_escuro", des)
    tela_simples(pasta, "ciclovia_simbolo_verde", 256, 512, "verde", des)


def ladrilho(pasta):
    """Ladrilho do calçadão (como no vídeo): placas quadradas de 0,75 m em creme, rosado e bege, com rejunte (512 × 512,
    4 × 4 placas: repete a cada 3 m)."""
    def des(d, w, h):
        d.rectangle((0, 0, w, h), fill="#C9AA7C")
        rnd = random.Random(21)
        tons = ["#F5E5BC", "#E3BFB0", "#E6CDA2", "#FBF2DC", "#EBCFC0"]
        n = 4
        t = w / n
        for i in range(n):
            for j in range(n):
                c = tons[rnd.randrange(len(tons))]
                d.rectangle((i * t + 5, j * t + 5, (i + 1) * t - 5, (j + 1) * t - 5), fill=c)
                d.line([(i * t + 8, (j + 1) * t - 9), ((i + 1) * t - 8, (j + 1) * t - 9)], fill="#D8C097", width=4)
    tela_simples(pasta, "ladrilho_calcadao", 512, 512, "creme", des)

def desenha(pasta):
    os.makedirs(pasta, exist_ok=True)
    vitrine_bebidas(pasta)
    vitrine_lanches(pasta)
    topo_maquina(pasta, "topo_bebidas", "GELADAS", "vermelho_escuro", "amarelo")
    topo_maquina(pasta, "topo_lanches", "PETISCOS", "azul_escuro", "amarelo")
    topo_maquina(pasta, "topo_atm", "SAQUE 24 H", "verde_escuro", "branco")
    tela_atm(pasta)
    revistas(pasta)
    letreiro(pasta, "letreiro_banca", "JORNAIS E REVISTAS", "amarelo", "verde_escuro")
    letreiro(pasta, "letreiro_chaveiro", "CHAVES • CONSERTOS", "azul_marinho", "amarelo", icone="chave",
             cor_icone="branco")
    mapa(pasta)
    setas(pasta)
    outras(pasta)
    ciclovia(pasta)
    ladrilho(pasta)


if __name__ == "__main__":
    desenha(sys.argv[1])
