"""Estampas dos grafites da cidade do Morada: decalques de fundo transparente, texturas de muro e murais (PIL).

Uso: python3 -I morada-art/grafites_estampas.py SP/cidade_out [nomes...]
Grava SP/cidade_out/grafites/estampas/<nome>.png:
- grafite_<palavra>.png  RGBA, fundo transparente (o alfa vira MASK com corte 0,5 no GLB): letra de grafite em bolha,
  com degradê, contorno claro, contorno escuro grosso, bloco 3D de sombra, brilhos, escorridos e respingos;
- tijolo.png, concreto.png  texturas que emendam (repetem em U e V);
- mural_<nome>.png      pinturas opacas para os muros.
Palavras genéricas em português.
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont  # noqa: E402

import sinalizacao_estampas as se  # noqa: E402  (só as funções de desenho)

SAIDA = sys.argv[1]
FILTRO = [a for a in sys.argv[2:]]
PASTA = os.path.join(SAIDA, "grafites", "estampas")
os.makedirs(PASTA, exist_ok=True)
FONTE = "/usr/share/fonts/opentype/inter/Inter-Black.otf"


def quer(nome):
    return not FILTRO or nome in FILTRO


def dil(m, r, corte=40):
    """Dilata uma máscara L por ~r px (borrão + corte), com borda lisa."""
    if r <= 0:
        return m
    b = m.filter(ImageFilter.GaussianBlur(r)).point(lambda v: 255 if v > corte else 0)
    return b.filter(ImageFilter.GaussianBlur(1.2))


def ero(m, r):
    b = m.filter(ImageFilter.GaussianBlur(r)).point(lambda v: 255 if v > 215 else 0)
    return b.filter(ImageFilter.GaussianBlur(1.0))


def bolha(m, r):
    """Arredonda a forma (letra em bolha): engorda e alisa."""
    b = m.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(r)).point(lambda v: 255 if v > 70 else 0)
    return b.filter(ImageFilter.GaussianBlur(1.5))


def desloca(m, dx, dy):
    return ImageChops.offset(m, int(dx), int(dy))


def maximo(*ms):
    out = ms[0]
    for m in ms[1:]:
        out = ImageChops.lighter(out, m)
    return out


def degrade(size, cores, vertical=True, ang=0):
    W, H = size
    n = H if vertical else W
    f = Image.new("RGB", (1, n) if vertical else (n, 1))
    px = f.load()
    for i in range(n):
        t = i / max(1, n - 1) * (len(cores) - 1)
        k = min(len(cores) - 2, int(t))
        c = se.mistura(cores[k], cores[k + 1], t - k)
        if vertical:
            px[0, i] = c
        else:
            px[i, 0] = c
    g = f.resize((W, H))
    if ang:
        g = g.rotate(ang, resample=Image.BICUBIC, expand=False, fillcolor=cores[-1])
    return g


def camada(img, m, cor_ou_img):
    if isinstance(cor_ou_img, Image.Image):
        src = cor_ou_img.convert("RGBA")
    else:
        src = Image.new("RGBA", img.size, (*cor_ou_img, 255))
    img.paste(src, (0, 0), m)


def letras_mascara(palavra, W, H, tam, semente, inclina=9, pula=0.07, aperto=0.1):
    """Máscara das letras soltas, cada uma girada e saltada um pouco (jeito de grafite), centradas na tela."""
    q = random.Random(semente)
    f = ImageFont.truetype(FONTE, tam)
    pecas = []
    for ch in palavra:
        bb = f.getbbox(ch)
        w, h = bb[2] - bb[0], bb[3] - bb[1]
        m = Image.new("L", (w + tam, h + tam), 0)
        ImageDraw.Draw(m).text((tam // 2 - bb[0], tam // 2 - bb[1]), ch, font=f, fill=255)
        m = m.rotate(q.uniform(-inclina, inclina), resample=Image.BICUBIC)
        pecas.append((m, w, h, q.uniform(-pula, pula) * tam))
    total = sum(w for _, w, _, _ in pecas) - aperto * tam * (len(pecas) - 1)
    out = Image.new("L", (W, H), 0)
    x = (W - total) / 2
    for m, w, h, dy in pecas:
        out.paste(m, (int(x - tam // 2), int(H / 2 - h / 2 - tam // 2 + dy)), m)
        x += w - aperto * tam
    return out


def pinta_grafite(nome, forma, W, H, esquema, semente=1, escorridos=4, respingos=26, padrao="bolinhas",
                  r_bolha=6, contorno=16, borda_clara=7, prof=14):
    """Pinta a forma (máscara L) com as camadas do grafite e salva o PNG transparente."""
    q = random.Random(semente)
    fill_cores, clara, escura, bloco, acentos = esquema
    m = bolha(forma, r_bolha)
    m_clara = dil(m, borda_clara)
    m_escura = dil(m_clara, contorno)
    # escorridos: gotas que descem da borda de baixo
    gotas = Image.new("L", (W, H), 0)
    dg = ImageDraw.Draw(gotas)
    px = m.load()
    cand = []
    for x in range(0, W, 6):
        for y in range(H - 1, 0, -3):
            if px[x, y] > 128:
                cand.append((x, y))
                break
    q.shuffle(cand)
    usados = []
    for x, y in cand:
        if len(usados) >= escorridos:
            break
        if any(abs(x - u) < W * 0.08 for u in usados) or y > H * 0.82:
            continue
        r = q.uniform(5, 9)
        L = min(q.uniform(0.08, 0.2) * H, H * 0.93 - y - 2 * r)
        if L < 0.04 * H:
            continue
        dg.rounded_rectangle((x - r, y - 10, x + r, y + L), radius=r, fill=255)
        dg.ellipse((x - r * 1.5, y + L - r * 1.2, x + r * 1.5, y + L + r * 1.8), fill=255)
        usados.append(x)
    gotas = gotas.filter(ImageFilter.GaussianBlur(1.2))
    m_fill = maximo(m, gotas)
    m_clara = maximo(m_clara, dil(gotas, borda_clara * 0.6))
    m_escura = maximo(m_escura, dil(gotas, borda_clara * 0.6 + contorno * 0.7))
    # bloco 3D: a forma escura arrastada para baixo e para a direita
    m_bloco = m_escura
    for k in range(1, prof + 1, 2):
        m_bloco = maximo(m_bloco, desloca(m_escura, k * 0.8, k))
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    # respingos atrás
    sp = Image.new("L", (W, H), 0)
    ds = ImageDraw.Draw(sp)
    cores_sp = []
    for _ in range(respingos):
        x, y = q.uniform(0.04, 0.96) * W, q.uniform(0.08, 0.92) * H
        r = q.choice((3, 4, 5, 7, 9, 12))
        cores_sp.append((x, y, r, q.choice(acentos)))
    for x, y, r, c in cores_sp:
        ds.ellipse((x - r, y - r, x + r, y + r), fill=255)
    camada(img, dil(sp, 3), escura)
    for x, y, r, c in cores_sp:
        lay = Image.new("L", (W, H), 0)
        ImageDraw.Draw(lay).ellipse((x - r, y - r, x + r, y + r), fill=255)
        camada(img, lay.filter(ImageFilter.GaussianBlur(0.8)), c)
    camada(img, m_bloco, bloco)
    camada(img, m_escura, escura)
    camada(img, m_clara, clara)
    g = degrade((W, H), fill_cores)
    # padrão dentro do preenchimento
    pd = ImageDraw.Draw(g)
    if padrao == "bolinhas":
        for _ in range(60):
            x, y, r = q.uniform(0, W), q.uniform(0, H), q.uniform(5, 16)
            c = se.mistura(fill_cores[q.randrange(len(fill_cores))], (255, 255, 255), 0.35)
            pd.ellipse((x - r, y - r, x + r, y + r), fill=c)
    elif padrao == "listras":
        for k in range(-H, W, 46):
            pd.polygon([(k, H), (k + 18, H), (k + 18 + H * 0.6, 0), (k + H * 0.6, 0)],
                       fill=se.mistura(fill_cores[0], (255, 255, 255), 0.25))
    elif padrao == "faixa":
        pd.rectangle((0, H * 0.48, W, H * 0.56), fill=se.mistura(fill_cores[-1], (255, 255, 255), 0.5))
    camada(img, m_fill, g)
    # brilho: a forma encolhida e puxada para cima/esquerda, em branco translúcido só dentro
    br = ImageChops.multiply(ero(m, 10), ImageChops.invert(desloca(ero(m, 10), 9, 12)))
    br = ImageChops.multiply(br, m)
    img.paste(Image.new("RGBA", (W, H), (255, 255, 255, 255)), (0, 0), br.point(lambda v: int(v * 0.75)))
    # brilhinhos (estrelinhas de 4 pontas)
    d = ImageDraw.Draw(img)
    for _ in range(5):
        for _t in range(40):
            x, y = q.uniform(0.1, 0.9) * W, q.uniform(0.15, 0.6) * H
            if m.getpixel((int(x), int(y))) > 200:
                break
        r = q.uniform(8, 16)
        pts = []
        for k in range(8):
            rr = r if k % 2 == 0 else r * 0.25
            a = math.radians(45 * k)
            pts.append((x + rr * math.cos(a), y + rr * math.sin(a)))
        d.polygon(pts, fill=(255, 255, 255, 255))
    if quer(nome):
        img.save(os.path.join(PASTA, nome + ".png"))
        print("estampa", nome, W, H, flush=True)


def grafite_palavra(nome, palavra, esquema, semente, H=512, tam=None, **k):
    n = len(palavra)
    tam = tam or int(H * (0.62 if n > 3 else 0.7))
    W = int(max(H * 1.1, tam * (0.78 * n + 0.6)))
    W = min(W, 2048)
    forma = letras_mascara(palavra, W, H, tam, semente)
    pinta_grafite(nome, forma, W, H, esquema, semente, **k)


def grafite_seta(nome, esquema, semente=7):
    W, H = 1024, 512
    t = se.Tela(W, H, (0, 0, 0, 0), ss=1)
    m, md = t.mascara()
    pts = []
    for k in range(40):
        u = k / 39
        pts.append((90 + 720 * u, 300 + 110 * math.sin(u * math.pi * 2.2 + 0.3) * (1 - 0.3 * u)))
    md.line(pts, fill=255, width=70, joint="curve")
    for x, y in (pts[0],):
        md.ellipse((x - 35, y - 35, x + 35, y + 35), fill=255)
    x, y = pts[-1]
    dx, dy = pts[-1][0] - pts[-3][0], pts[-1][1] - pts[-3][1]
    L = math.hypot(dx, dy)
    ux, uy = dx / L, dy / L
    nx, ny = -uy, ux
    md.polygon([(x + nx * 110, y + ny * 110), (x + ux * 170, y + uy * 170), (x - nx * 110, y - ny * 110)], fill=255)
    # laço do tag
    md.ellipse((230, 150, 350, 270), outline=255, width=46)
    pinta_grafite(nome, m, W, H, esquema, semente, escorridos=3, padrao="listras", r_bolha=8)


def grafite_estrela(nome, esquema, semente=9):
    W = H = 640
    m = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(m)
    pts = []
    for k in range(10):
        r = 270 if k % 2 == 0 else 125
        a = math.radians(-90 + 36 * k + 6)
        pts.append((W / 2 + r * math.cos(a), H / 2 + 20 + r * math.sin(a)))
    d.polygon(pts, fill=255)
    pinta_grafite(nome, m, W, H, esquema, semente, escorridos=3, padrao="bolinhas", r_bolha=14, contorno=18)


def grafite_abstrato(nome, esquema, semente):
    W, H = 1024, 640
    q = random.Random(semente)
    m = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(m)
    for _ in range(7):  # bolhas
        x, y, r = q.uniform(200, 820), q.uniform(200, 440), q.uniform(60, 140)
        d.ellipse((x - r, y - r * 0.8, x + r, y + r * 0.8), fill=255)
    for _ in range(3):  # pinceladas em onda
        y0 = q.uniform(220, 420)
        pts = [(140 + 740 * k / 30, y0 + 90 * math.sin(k / 30 * math.pi * q.uniform(1.5, 3) + q.uniform(0, 3)))
               for k in range(31)]
        d.line(pts, fill=255, width=int(q.uniform(40, 70)), joint="curve")
    # furos (vazado)
    for _ in range(4):
        x, y, r = q.uniform(260, 760), q.uniform(240, 400), q.uniform(14, 30)
        d.ellipse((x - r, y - r, x + r, y + r), fill=0)
    pinta_grafite(nome, m, W, H, esquema, semente, escorridos=5, padrao="listras" if semente % 2 else "bolinhas",
                  r_bolha=12)


# esquemas: (cores do preenchimento de cima para baixo, contorno claro, contorno escuro, bloco 3D, respingos)
ESQ = {
    "rosa": ([(255, 120, 200), (255, 70, 150), (190, 40, 170)], (255, 240, 250), (40, 16, 50), (110, 30, 120),
             [(255, 220, 60), (80, 220, 255), (255, 255, 255)]),
    "azul": ([(110, 230, 255), (40, 150, 240), (40, 70, 200)], (240, 255, 255), (16, 22, 60), (30, 50, 140),
             [(255, 90, 180), (255, 220, 60)]),
    "amarelo": ([(255, 245, 120), (255, 200, 40), (255, 120, 30)], (255, 255, 240), (60, 24, 10), (190, 70, 20),
                [(80, 220, 255), (255, 80, 160)]),
    "verde": ([(200, 255, 110), (100, 220, 80), (20, 150, 90)], (245, 255, 230), (12, 40, 26), (20, 90, 60),
              [(255, 220, 60), (255, 120, 200)]),
    "roxo": ([(220, 170, 255), (150, 90, 240), (90, 40, 190)], (250, 240, 255), (30, 12, 60), (70, 30, 140),
             [(90, 240, 200), (255, 220, 60)]),
    "laranja": ([(255, 200, 90), (255, 130, 40), (230, 60, 50)], (255, 250, 230), (50, 14, 10), (150, 40, 30),
                [(255, 240, 120), (90, 200, 255)]),
    "turquesa": ([(150, 255, 230), (40, 210, 200), (20, 130, 160)], (240, 255, 250), (10, 36, 50), (20, 80, 110),
                 [(255, 120, 200), (255, 230, 80)]),
    "vermelho": ([(255, 140, 120), (240, 60, 70), (170, 20, 50)], (255, 240, 230), (40, 8, 14), (110, 16, 30),
                 [(255, 220, 60), (255, 255, 255)]),
    "arco": ([(255, 90, 160), (255, 200, 50), (80, 220, 120), (60, 160, 255)], (255, 255, 255), (24, 18, 40),
             (70, 40, 110), [(255, 255, 255), (255, 220, 60)]),
    "limao": ([(240, 255, 90), (170, 230, 60), (60, 170, 80)], (255, 255, 230), (20, 40, 14), (50, 100, 30),
              [(255, 150, 40), (255, 255, 255)]),
}

PALAVRAS = [  # (nome, palavra, esquema, padrão)
    ("paz", "PAZ", "azul", "bolinhas"), ("amor", "AMOR", "rosa", "listras"), ("legal", "LEGAL", "verde", "faixa"),
    ("arte", "ARTE", "roxo", "bolinhas"), ("sonho", "SONHO", "turquesa", "listras"), ("vai", "VAI", "laranja", "faixa"),
    ("oi", "OI", "amarelo", "bolinhas"), ("luz", "LUZ", "amarelo", "listras"), ("fe", "FÉ", "vermelho", "bolinhas"),
    ("cores", "CORES", "arco", "faixa"), ("rua", "RUA", "vermelho", "listras"), ("vida", "VIDA", "verde", "bolinhas"),
]


# ---------------------------------------------------------------------------------------------------- muros
def tijolo(nome="tijolo", W=512, H=512, base=(186, 86, 58), junta=(222, 196, 170)):
    """Tijolo terracota que emenda: 4 tijolos por fiada e 10 fiadas (o PNG cobre 1,6 × 1,6 m no muro)."""
    q = random.Random(3)
    img = Image.new("RGB", (W, H), junta)
    d = ImageDraw.Draw(img)
    nf, nt = 10, 4
    fh, tw = H / nf, W / nt
    g = 5
    for j in range(nf):
        off = (tw / 2) if j % 2 else 0
        for i in range(-1, nt + 1):
            x0 = i * tw + off
            c = se.mistura(base, (q.choice((150, 210)), q.choice((70, 110)), 50), q.uniform(0.0, 0.3))
            box = (x0 + g / 2, j * fh + g / 2, x0 + tw - g / 2, (j + 1) * fh - g / 2)
            d.rounded_rectangle(box, radius=6, fill=c)
            d.rounded_rectangle((box[0] + 4, box[1] + 3, box[2] - 6, box[1] + 9), radius=3,
                                fill=se.mistura(c, (255, 255, 255), 0.18))
    if quer(nome):
        img.save(os.path.join(PASTA, nome + ".png"))
        print("estampa", nome, flush=True)


def concreto(nome="concreto", W=512, H=512):
    """Placas de concreto que emendam (cada PNG = uma placa de 2 × 2 m com quatro furinhos)."""
    q = random.Random(5)
    img = Image.new("RGB", (W, H), (190, 196, 204))
    d = ImageDraw.Draw(img)
    for _ in range(900):
        x, y = q.randrange(W), q.randrange(H)
        c = q.choice(((176, 182, 190), (202, 208, 214), (184, 190, 198)))
        r = q.choice((1, 2, 2, 3))
        d.ellipse((x - r, y - r, x + r, y + r), fill=c)
    d.rectangle((0, 0, W, 5), fill=(150, 156, 166))
    d.rectangle((0, 0, 5, H), fill=(150, 156, 166))
    for x in (W * 0.2, W * 0.8):
        for y in (H * 0.2, H * 0.8):
            d.ellipse((x - 7, y - 7, x + 7, y + 7), fill=(130, 136, 146))
    if quer(nome):
        img.save(os.path.join(PASTA, nome + ".png"))
        print("estampa", nome, flush=True)


def mural_mar(nome="mural_mar"):
    t = se.Tela(1024, 384, se.BRANCO)
    se.ceu(t, [(255, 150, 120), (255, 210, 140), (140, 210, 255)])
    se.sol(t, 760, 230, 90, (255, 230, 120), raios=True, halo=False)
    for k in range(4):
        y = 250 + k * 30
        pts = [(x, y + 14 * math.sin(x / 70 + k)) for x in range(0, 1025, 16)]
        t.poli(pts + [(1024, 384), (0, 384)], [(60, 170, 230), (40, 140, 220), (30, 110, 200), (20, 90, 170)][k])
    for x, y in ((200, 90), (260, 120), (330, 80)):
        t.arco(x, y, 18, 200, 340, se.PRETO, 5)
        t.arco(x + 36, y, 18, 200, 340, se.PRETO, 5)
    t.texto("MAR", (40, 30, 360, 190), se.F_BLACK_IT, se.BRANCO, (40, 90, 170), 0.08)
    if quer(nome):
        t.imagem().convert("RGB").save(os.path.join(PASTA, nome + ".png"))
        print("estampa", nome, flush=True)


def mural_casinhas(nome="mural_casinhas"):
    t = se.Tela(1024, 384, se.BRANCO)
    se.ceu(t, [(120, 200, 255), (210, 240, 255)])
    se.nuvem(t, 200, 80, 40)
    se.nuvem(t, 760, 60, 30)
    se.morro(t, 300, 0, 1024, 40, (110, 200, 100), 0.2, 1.4)
    cores = [(255, 120, 150), (255, 200, 60), (90, 200, 230), (160, 120, 240), (255, 150, 70), (110, 210, 140)]
    x = 20
    for k in range(7):
        w = 120 + (k % 3) * 14
        h = 140 + (k % 2) * 50
        c = cores[k % len(cores)]
        t.ret(x, 330 - h, x + w, 330, c)
        t.poli([(x - 10, 330 - h), (x + w + 10, 330 - h), (x + w / 2, 330 - h - 60)], (200, 70, 60))
        t.ret(x + w * 0.38, 330 - 60, x + w * 0.62, 330, (120, 70, 40), raio=8)
        t.ret(x + 15, 330 - h + 25, x + 45, 330 - h + 55, (255, 250, 210))
        t.ret(x + w - 45, 330 - h + 25, x + w - 15, 330 - h + 55, (255, 250, 210))
        x += w + 18
    t.ret(0, 330, 1024, 384, (90, 96, 108))
    for xx in range(0, 1024, 90):
        t.ret(xx, 352, xx + 45, 360, se.BRANCO)
    if quer(nome):
        t.imagem().convert("RGB").save(os.path.join(PASTA, nome + ".png"))
        print("estampa", nome, flush=True)


def mural_flores(nome="mural_flores"):
    t = se.Tela(768, 384, (40, 30, 80))
    se.ceu(t, [(60, 30, 110), (130, 60, 170)])
    q = random.Random(12)
    for k in range(26):
        x, y = q.uniform(20, 750), q.uniform(40, 360)
        t.linha([(x, y + 40), (x - 10, y + 90)], (60, 180, 90), 6)
        se.folha(t, x - 6, y + 70, 30, q.uniform(-160, -20), (80, 200, 110))
        se.flor(t, x, y, q.uniform(18, 38), q.choice(((255, 120, 200), (255, 220, 60), (90, 220, 255),
                                                       (255, 150, 70), (250, 250, 250))))
    t.texto("FLORESÇA", (40, 130, 728, 260), se.F_BLACK_IT, (255, 240, 120), (60, 20, 80), 0.08)
    if quer(nome):
        t.imagem().convert("RGB").save(os.path.join(PASTA, nome + ".png"))
        print("estampa", nome, flush=True)


def mural_arcoiris(nome="mural_arcoiris"):
    t = se.Tela(768, 384, se.BRANCO)
    se.ceu(t, [(150, 220, 255), (230, 246, 255)])
    for k, c in enumerate(((240, 70, 80), (255, 150, 50), (255, 220, 60), (90, 200, 100), (60, 150, 240),
                           (150, 90, 230))):
        t.arco(384, 420, 330 - k * 34, 180, 360, c, 36)
    se.nuvem(t, 90, 330, 70)
    se.nuvem(t, 680, 330, 70)
    se.sol(t, 660, 80, 40, (255, 220, 70), raios=True, halo=False)
    t.texto("BOM DIA", (200, 230, 568, 330), se.F_BLACK_IT, se.BRANCO, (60, 60, 140), 0.1)
    if quer(nome):
        t.imagem().convert("RGB").save(os.path.join(PASTA, nome + ".png"))
        print("estampa", nome, flush=True)


if __name__ == "__main__":
    for i, (nome, palavra, esq, pad) in enumerate(PALAVRAS):
        grafite_palavra("grafite_" + nome, palavra, ESQ[esq], 11 + i * 7, padrao=pad)
    grafite_seta("grafite_seta", ESQ["rosa"])
    grafite_estrela("grafite_estrela", ESQ["amarelo"])
    grafite_abstrato("grafite_abstrato_limao", ESQ["limao"], 21)
    grafite_abstrato("grafite_abstrato_laranja", ESQ["laranja"], 34)
    tijolo()
    concreto()
    mural_mar()
    mural_casinhas()
    mural_flores()
    mural_arcoiris()
    print("estampas em", PASTA)
