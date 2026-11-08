"""Texturas sem emenda (seamless) do chão e das paredes da biblioteca de construção. Feitas aqui, com as imagens da
vitrine de pisos e paredes como norte (não são cópias), mais as aproveitadas dos pacotes gratuitos.

Escala (a mesma em todas, para trocar uma pela outra sem mexer no UV das peças):
  - piso: a imagem cobre 2 × 2 m (o chão de 4 × 4 m repete 2 vezes em cada direção);
  - parede: a imagem cobre 3 m de largura × 3 m de altura (a parede inteira: o degradê e a faixa das frutas acompanham
    a altura da parede; na horizontal todas emendam).

Uso: python3 -I construcao_texturas.py <saida>   (grava <saida>/<id>.png, 1024 px, e texturas.json)
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

S = 1024
AQUI = os.path.dirname(os.path.abspath(__file__))
PACOTES = os.path.join(os.path.dirname(AQUI), "ideias")


def hexa(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], float)


def mistura(a, b, t):
    return a + (b - a) * t


def suave(img, r=1.0):
    """Antisserrilhado: desfoque leve com borda circular (a imagem emenda nas bordas)."""
    pad = 8
    a = np.pad(img, ((pad, pad), (pad, pad), (0, 0)), mode="wrap")
    im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))
    return np.array(im).astype(float)[pad:-pad, pad:-pad]


def ruido(n_cel, seed, oitavas=3):
    """Ruído suave periódico (emenda nas bordas): grades aleatórias ladrilhadas 3 × 3, ampliadas e cortadas no meio."""
    rng = np.random.default_rng(seed)
    tot = np.zeros((S, S))
    amp, peso = 1.0, 0.0
    for o in range(oitavas):
        n = n_cel * 2 ** o
        g = np.tile(rng.random((n, n)), (3, 3))
        im = Image.fromarray((g * 255).astype(np.uint8)).resize((3 * S, 3 * S), Image.BICUBIC)
        tot += np.array(im).astype(float)[S:2 * S, S:2 * S] / 255 * amp
        peso += amp
        amp *= 0.5
    return tot / peso


yy, xx = np.mgrid[0:S, 0:S].astype(float)
U, V = xx / S, yy / S  # 0..1 (V para baixo na imagem)


# ------------------------------------------------------------------ piso: madeira
def madeira(cores, larg_m=0.16, seed=1, junta=(0, 0, 0), escala_veio=1.0):
    """Tábuas na vertical, com emendas desencontradas, um tom por tábua, veio suave e a junta escura entre elas."""
    rng = np.random.default_rng(seed)
    cores = [hexa(c) for c in cores]
    px_m = S / 2.0
    larg = int(round(larg_m * px_m))
    n_col = S // larg
    larg = S / n_col
    img = np.zeros((S, S, 3))
    col = np.floor(xx / larg).astype(int)
    for c in range(n_col):
        # tábuas de 0,6 a 1,3 m nesta coluna (a soma fecha em 2 m: emenda em cima e embaixo)
        cortes = [0.0]
        while cortes[-1] < 2.0 - 0.6:
            cortes.append(cortes[-1] + rng.uniform(0.55, 1.25))
        cortes[-1] = 2.0
        if len(cortes) < 3:
            cortes = [0.0, 1.0, 2.0]
        desloc = rng.uniform(0, 2.0)
        sel_c = col == c
        y_m = ((yy / px_m) + desloc) % 2.0
        x_loc = (xx - c * larg) / larg
        for a, b in zip(cortes, cortes[1:]):
            sel = sel_c & (y_m >= a) & (y_m < b)
            base = cores[rng.integers(len(cores))] * rng.uniform(0.92, 1.06)
            # veio: listras finas onduladas ao longo da tábua
            fase = rng.uniform(0, 6.28)
            veio = 0.5 + 0.5 * np.sin((x_loc * 9 + np.sin(y_m * 3.1 * escala_veio + fase) * 0.8) * 2 * math.pi / 3 + fase)
            t = (veio ** 6) * 0.10 + rng.uniform(-0.01, 0.01)
            cor = base[None, :] * (1 - t[sel][:, None])
            # ponta da tábua um pouco mais escura (emenda)
            dist_emenda = np.minimum(y_m[sel] - a, b - y_m[sel]) * px_m
            cor *= (1 - 0.18 * np.exp(-dist_emenda / 2.0))[:, None]
            img[sel] = cor
    # junta entre as colunas: linha fina escura com leve sombra de um lado
    d = np.minimum(xx % larg, larg - (xx % larg))
    junta_t = np.exp(-(d / 1.2) ** 2)
    img = img * (1 - 0.45 * junta_t[..., None]) + hexa("#000000") * 0
    sombra = np.exp(-((xx % larg) / 4.0)) * 0.06
    img *= (1 - sombra[..., None])
    return suave(img, 0.6)


# ------------------------------------------------------------------ piso: cerâmica
def ladrilhos(n, cores_fn, junta_cor="#FFFFFF", junta_px=3, bisel=0.10, seed=2, var=0.04):
    """Grade n × n de ladrilhos com junta, cada um com a cor de cores_fn(i, j, rng) e um bisel suave (claro em cima e à
    esquerda, escuro embaixo e à direita)."""
    rng = np.random.default_rng(seed)
    tam = S / n
    i = np.floor(yy / tam).astype(int) % n
    j = np.floor(xx / tam).astype(int) % n
    img = np.zeros((S, S, 3))
    for a in range(n):
        for b in range(n):
            sel = (i == a) & (j == b)
            img[sel] = hexa(cores_fn(a, b, rng)) * rng.uniform(1 - var, 1 + var)
    lx, ly = (xx % tam) / tam, (yy % tam) / tam
    luz = (0.5 - lx) * 0.5 + (0.5 - ly) * 0.5
    borda = np.clip(1 - np.minimum(np.minimum(lx, 1 - lx), np.minimum(ly, 1 - ly)) * tam / 6, 0, 1)
    img *= (1 + bisel * luz[..., None] * borda[..., None] * 2)
    d = np.minimum(np.minimum(xx % tam, tam - xx % tam), np.minimum(yy % tam, tam - yy % tam))
    junta = np.clip(1 - (d - junta_px / 2) / 1.0, 0, 1)
    img = mistura(img, hexa(junta_cor)[None, None, :], junta[..., None])
    return suave(img, 0.6)


def xadrez(n, c1, c2, **k):
    return ladrilhos(n, lambda a, b, r: c1 if (a + b) % 2 == 0 else c2, **k)


def mosaico(n, paleta, pesos=None, **k):
    pesos = np.array(pesos or [1] * len(paleta), float)
    pesos /= pesos.sum()
    return ladrilhos(n, lambda a, b, r: paleta[r.choice(len(paleta), p=pesos)], **k)


def octogonos(n, fundo, peca, inserto, junta="#FFFFFF"):
    """Octógonos (cantos cortados) com um quadradinho no encontro de quatro deles; junta fina entre todos."""
    tam = S / n
    lx, ly = (xx % tam) / tam - 0.5, (yy % tam) / tam - 0.5
    k = 0.30  # quanto do canto é cortado
    octo = (np.abs(lx) + np.abs(ly)) < (1 - k)
    img = np.zeros((S, S, 3)) + hexa(inserto)
    img[octo] = hexa(peca)
    # contorno (junta) do octógono e do quadrado
    d_oct = (1 - k) - (np.abs(lx) + np.abs(ly))
    d_box = np.minimum(0.5 - np.abs(lx), 0.5 - np.abs(ly))
    dd = np.minimum(np.abs(d_oct) / math.sqrt(2), np.where(octo, d_box, 1)) * tam
    junta_t = np.clip(1 - (dd - 1.6) / 1.0, 0, 1)
    # bisel no octógono
    luz = np.where(octo, (-lx - ly) * 0.25, 0) * np.clip(1 - np.abs(d_oct) * tam / 10, 0, 1)
    img *= (1 + luz[..., None] * 0.6)
    img = mistura(img, hexa(junta)[None, None, :], junta_t[..., None])
    return suave(img, 0.6)


def octogonos_ponto(n, peca, ponto, junta):
    """Variante: octógonos da mesma cor do fundo, com um ponto colorido no encontro (pastilha com ponto)."""
    tam = S / n
    lx, ly = (xx % tam) / tam - 0.5, (yy % tam) / tam - 0.5
    k = 0.22
    d_oct = (1 - k) - (np.abs(lx) + np.abs(ly))
    img = np.zeros((S, S, 3)) + hexa(peca)
    luz = (-lx - ly) * 0.18 * np.clip(1 - np.abs(d_oct) * tam / 10, 0, 1)
    img *= (1 + luz[..., None])
    d_box = np.minimum(0.5 - np.abs(lx), 0.5 - np.abs(ly))
    dd = np.minimum(np.abs(d_oct) / math.sqrt(2), d_box) * tam  # contorno: as diagonais e os lados retos (na borda da peça)
    junta_t = np.clip(1 - (dd - 1.4) / 1.0, 0, 1)
    img = mistura(img, hexa(junta)[None, None, :], junta_t[..., None])
    canto = np.hypot(np.abs(lx) - 0.5, np.abs(ly) - 0.5) * tam
    pt = np.clip(1 - (canto - tam * 0.09) / 1.2, 0, 1)
    img = mistura(img, hexa(ponto)[None, None, :], pt[..., None])
    return suave(img, 0.6)


# ------------------------------------------------------------------ parede
def degrade(c_cima, c_baixo):
    t = V ** 1.2
    img = mistura(hexa(c_cima)[None, None, :], hexa(c_baixo)[None, None, :], t[..., None])
    rng = np.random.default_rng(3)
    img += rng.normal(0, 0.8, img.shape)  # um grão finíssimo (sem faixas no degradê)
    return img


def espalha(n, seed, raio_min, raio_max):
    """Pontos espalhados sem se encostar (amostragem por tentativa), periódicos."""
    rng = np.random.default_rng(seed)
    pts = []
    tent = 0
    while len(pts) < n and tent < n * 60:
        tent += 1
        p = rng.random(2) * S
        r = rng.uniform(raio_min, raio_max)
        ok = True
        for q, rq in pts:
            d = np.abs(p - q)
            d = np.minimum(d, S - d)
            if math.hypot(*d) < (r + rq) * 2.2:
                ok = False
                break
        if ok:
            pts.append((p, r))
    return pts, rng


def disco(img, p, r, cor, aa=1.2):
    for dx in (-S, 0, S):
        for dy in (-S, 0, S):
            cx, cy = p[0] + dx, p[1] + dy
            if cx + r < -2 or cx - r > S + 2 or cy + r < -2 or cy - r > S + 2:
                continue
            x0, x1 = int(max(cx - r - 3, 0)), int(min(cx + r + 3, S))
            y0, y1 = int(max(cy - r - 3, 0)), int(min(cy + r + 3, S))
            d = np.hypot(xx[y0:y1, x0:x1] - cx, yy[y0:y1, x0:x1] - cy)
            t = np.clip((r - d) / aa + 0.5, 0, 1)[..., None]
            img[y0:y1, x0:x1] = mistura(img[y0:y1, x0:x1], hexa(cor)[None, None, :], t)


def confete(fundo, cores, n=70, seed=5):
    img = np.zeros((S, S, 3)) + hexa(fundo)
    pts, rng = espalha(n, seed, 9, 13)
    for p, r in pts:
        disco(img, p, r, cores[rng.integers(len(cores))])
    return img


def nuvens(fundo="#3DB5E6", cor="#FFFFFF", n=14, seed=6):
    img = np.zeros((S, S, 3)) + hexa(fundo)
    pts, rng = espalha(n, seed, 34, 52)
    for p, r in pts:
        # nuvem: três discos em cima de uma base achatada
        for dx, dy, k in ((-0.55, 0.12, 0.55), (0.0, -0.1, 0.75), (0.55, 0.1, 0.6), (-0.25, 0.25, 0.55), (0.3, 0.27, 0.55)):
            disco(img, (p[0] + dx * r, p[1] + dy * r), r * k, cor)
    return img


def estrela(img, p, r, cor):
    ang = np.arctan2(yy - p[1], xx - p[0])
    for dx in (-S, 0, S):
        for dy in (-S, 0, S):
            cx, cy = p[0] + dx, p[1] + dy
            if abs(cx - S / 2) > S / 2 + r + 3 or abs(cy - S / 2) > S / 2 + r + 3:
                continue
            x0, x1 = int(max(cx - r - 3, 0)), int(min(cx + r + 3, S))
            y0, y1 = int(max(cy - r - 3, 0)), int(min(cy + r + 3, S))
            X, Y = xx[y0:y1, x0:x1] - cx, yy[y0:y1, x0:x1] - cy
            a = np.arctan2(Y, X) + math.pi / 2
            raio = r * (0.45 + 0.55 * np.abs(np.cos(a * 2.5)) ** 3)
            t = np.clip((raio - np.hypot(X, Y)) / 1.0 + 0.5, 0, 1)[..., None]
            img[y0:y1, x0:x1] = mistura(img[y0:y1, x0:x1], hexa(cor)[None, None, :], t)


def ceu_estrelado(fundo="#3A4250", n=55, seed=7):
    img = np.zeros((S, S, 3)) + hexa(fundo)
    pts, rng = espalha(n, seed, 6, 16)
    for p, r in pts:
        if r > 10:
            estrela(img, p, r, "#F2D36B")
        else:
            disco(img, p, r * 0.45, "#E9EEF5" if rng.random() < 0.6 else "#F2D36B")
    return img


def fruta(fundo, semente, faixa1, faixa2, seed=8, forma="gota"):
    """Papel de parede de fruta: sementes na parte de cima e uma faixa ondulada embaixo (a casca), na altura da parede."""
    img = np.zeros((S, S, 3)) + hexa(fundo)
    pts, rng = espalha(16, seed, 20, 24)
    for p, r in pts:
        if p[1] > S * 0.62:
            continue
        # semente em gota: disco alongado
        for k in np.linspace(0, 1, 6):
            disco(img, (p[0], p[1] - r * 0.9 * k), r * (0.55 + 0.45 * (1 - k) ** 0.5) * 0.6, semente)
    onda1 = S * 0.80 + 16 * np.sin(U * 2 * math.pi * 4)
    onda2 = S * 0.86 + 14 * np.sin(U * 2 * math.pi * 4 + 1.3)
    t1 = np.clip((yy - onda1) / 1.2 + 0.5, 0, 1)[..., None]
    t2 = np.clip((yy - onda2) / 1.2 + 0.5, 0, 1)[..., None]
    img = mistura(img, hexa(faixa1)[None, None, :], t1)
    img = mistura(img, hexa(faixa2)[None, None, :], t2)
    return img


def tijolos(cores, argamassa, larg_m=0.40, alt_m=0.13, seed=9, var=0.06):
    """Fiadas desencontradas (meio tijolo), um tom por tijolo, argamassa recuada com sombra embaixo."""
    rng = np.random.default_rng(seed)
    px_m = S / 3.0
    n_lin = int(round(3.0 / alt_m))
    alt = S / n_lin
    n_col = int(round(3.0 / larg_m))
    larg = S / n_col
    lin = np.floor(yy / alt).astype(int)
    xo = xx + (lin % 2) * larg / 2
    col = np.floor(xo / larg).astype(int) % n_col
    img = np.zeros((S, S, 3))
    cores = [hexa(c) for c in cores]
    tons = {(a, b): cores[rng.integers(len(cores))] * rng.uniform(1 - var, 1 + var) for a in range(n_lin) for b in range(n_col)}
    for (a, b), cor in tons.items():
        sel = (lin == a) & (col == b)
        img[sel] = cor
    lx, ly = (xo % larg), (yy % alt)
    jp = 3.0
    dx = np.minimum(lx, larg - lx)
    dy = np.minimum(ly, alt - ly)
    junta = np.clip(1 - (np.minimum(dx, dy) - jp / 2) / 1.0, 0, 1)
    luz = np.clip(1 - ly / (alt * 0.35), 0, 1) * 0.08 - np.clip((ly - alt * 0.7) / (alt * 0.3), 0, 1) * 0.08
    img *= (1 + luz[..., None])
    img = mistura(img, hexa(argamassa)[None, None, :], junta[..., None])
    n = ruido(16, seed) - 0.5
    img *= (1 + n[..., None] * 0.06)
    return suave(img, 0.6)


def listras(cores, larguras_m, seed=10, brilho=0.0):
    """Listras verticais (a sequência de cores e larguras se repete e fecha em 3 m)."""
    px_m = S / 3.0
    seq = []
    tot = sum(larguras_m)
    rep = max(1, int(round(3.0 / tot)))
    escala = 3.0 / (tot * rep)
    for _ in range(rep):
        for c, w in zip(cores, larguras_m):
            seq.append((hexa(c), w * escala))
    img = np.zeros((S, S, 3))
    x_m = xx / px_m
    pos = 0.0
    for cor, w in seq:
        sel = (x_m >= pos) & (x_m < pos + w)
        img[sel] = cor
        pos += w
    if brilho:
        img *= (1 + brilho * np.sin(U * 2 * math.pi * rep * 3)[..., None])
    return suave(img, 0.5)


# ------------------------------------------------------------------ pacotes
def do_pacote(nome, tipo, escala_m):
    """Textura de um pacote gratuito, reamostrada para 1024 px (cobre escala_m metros)."""
    import glob
    f = sorted(glob.glob(os.path.join(PACOTES, "**", nome), recursive=True))
    if not f:
        return None
    im = Image.open(f[0]).convert("RGB")
    return np.array(im.resize((S, S), Image.LANCZOS)).astype(float)


def tabuas_do_pacote(seed=11):
    """Tábuas com o veio da madeira escura do pacote de xadrez: cada tábua é um recorte do veio, com o próprio tom."""
    import glob
    f = sorted(glob.glob(os.path.join(PACOTES, "**", "Wood_Dark.png"), recursive=True))
    if not f:
        return None
    rng = np.random.default_rng(seed)
    src = np.array(Image.open(f[0]).convert("RGB").resize((2048, 2048), Image.LANCZOS)).astype(float)
    px_m = S / 2.0
    n_col = 16  # 1024 / 16 = 64 px por tábua (fecha exato: sem emenda na borda)
    larg = S // n_col
    img = np.zeros((S, S, 3))
    for c in range(n_col):
        y = 0
        desloc = int(rng.integers(0, S))
        pecas = []
        while y < S:
            h = int(rng.uniform(0.55, 1.2) * px_m)
            pecas.append((y, min(h, S - y)))
            y += h
        for (y0, h) in pecas:
            sx = int(rng.integers(0, 2048 - larg))
            sy = int(rng.integers(0, 2048 - h))
            bloco = src[sy:sy + h, sx:sx + larg] * rng.uniform(0.85, 1.12)
            ys = (np.arange(y0, y0 + h) + desloc) % S
            img[ys, c * larg:(c + 1) * larg] = bloco
            for yy_ in (ys[0], ys[-1]):
                img[yy_, c * larg:(c + 1) * larg] *= 0.55
    for c in range(n_col + 1):
        img[:, (c * larg) % S] *= 0.5
    return suave(img, 0.6)


# ------------------------------------------------------------------ catálogo
PISO = [
    # madeira (6)
    ("madeira_nogueira", "Madeira nogueira", "madeira", lambda: madeira(["#6E4F3E", "#5C4234", "#7B5A47", "#4E392E"], seed=11)),
    ("madeira_rosada", "Madeira rosada", "madeira", lambda: madeira(["#A98A80", "#B79B90", "#9A7B72", "#C2A79B"], seed=12)),
    ("madeira_pinus", "Madeira pínus", "madeira", lambda: madeira(["#F2A766", "#EE9A57", "#F5B377", "#E8914B"], seed=13)),
    ("madeira_acinzentada", "Madeira acinzentada", "madeira", lambda: madeira(["#A5968C", "#B3A59C", "#978980", "#BFB2A8"], seed=14)),
    ("madeira_mel", "Madeira mel", "madeira", lambda: madeira(["#F7A35C", "#F3B270", "#EC9447", "#F9C088"], larg_m=0.12, seed=15)),
    ("madeira_clara", "Madeira clara", "madeira", lambda: madeira(["#D9D3CE", "#CFC8C2", "#E3DED9", "#C6BEB7"], larg_m=0.12, seed=16)),
    # cerâmica (12)
    ("mosaico_cinza", "Mosaico cinza", "ceramica", lambda: mosaico(16, ["#C9CED4", "#B9BFC6", "#D7DBE0", "#AEB5BE", "#C5CCD6"], junta_cor="#EEF1F4", seed=21)),
    ("xadrez_laranja", "Xadrez laranja", "ceramica", lambda: xadrez(8, "#E8743C", "#F6A36A", junta_cor="#F9D2B0", seed=22)),
    ("xadrez_pb_pequeno", "Xadrez preto e branco", "ceramica", lambda: xadrez(8, "#2E3036", "#F4F4F2", junta_cor="#D9DADC", seed=23)),
    ("mosaico_cinza_branco", "Mosaico cinza e branco", "ceramica", lambda: mosaico(16, ["#F1F3F5", "#B8C0C8", "#D8DDE2", "#9AA4AE"], pesos=[3, 2, 2, 1], junta_cor="#FFFFFF", seed=24)),
    ("mosaico_grafite", "Mosaico grafite", "ceramica", lambda: mosaico(16, ["#3B4148", "#4A5058", "#2F343A", "#565D66"], junta_cor="#6C737B", seed=25)),
    ("xadrez_cinza", "Xadrez cinza", "ceramica", lambda: xadrez(4, "#8E949B", "#F2F3F4", junta_cor="#FFFFFF", seed=26)),
    ("xadrez_azul", "Xadrez azul", "ceramica", lambda: xadrez(4, "#5B8BE0", "#F3F5FA", junta_cor="#FFFFFF", seed=27)),
    ("xadrez_verde", "Xadrez verde", "ceramica", lambda: xadrez(4, "#5AAE5C", "#F3F6F2", junta_cor="#FFFFFF", seed=28)),
    ("piscina", "Pastilha de piscina", "ceramica", lambda: mosaico(16, ["#6EC1F2", "#82CCF5", "#5CB5EE", "#97D6F7", "#4FA9E8"], junta_cor="#B9E3FA", seed=29)),
    ("octogono_laranja", "Octógono laranja", "ceramica", lambda: octogonos(12, "#FFFFFF", "#F6A43C", "#FFF4E0", junta="#FFFFFF")),
    ("octogono_grafite", "Octógono grafite com ponto", "ceramica", lambda: octogonos_ponto(12, "#3C4046", "#E04848", "#55595F")),
    ("octogono_branco", "Octógono branco com ponto", "ceramica", lambda: octogonos_ponto(12, "#FBFBFB", "#2E9FB8", "#C9D2D8")),
]
PAREDE = [
    # degradê (6)
    ("degrade_mostarda", "Degradê mostarda", "degrade", lambda: degrade("#E3C25A", "#C9A23A")),
    ("degrade_gelo", "Degradê gelo", "degrade", lambda: degrade("#F4F4F4", "#C9CACC")),
    ("degrade_vermelho", "Degradê vermelho", "degrade", lambda: degrade("#E15B55", "#BE3B38")),
    ("degrade_roxo", "Degradê roxo", "degrade", lambda: degrade("#9A62D9", "#6F3FB8")),
    ("degrade_verde", "Degradê verde", "degrade", lambda: degrade("#66D35A", "#3FAE3A")),
    ("degrade_azul", "Degradê azul", "degrade", lambda: degrade("#5B95E5", "#2D63C7")),
    # papel de parede (6)
    ("papel_confete", "Papel confete", "papel", lambda: confete("#F6F5F8", ["#E9558F", "#5A4FCF", "#F2A23A", "#3DB5E6"])),
    ("papel_nuvens", "Papel nuvens", "papel", lambda: nuvens()),
    ("papel_estrelas", "Papel estrelas", "papel", lambda: ceu_estrelado()),
    ("papel_melao", "Papel melão", "papel", lambda: fruta("#FBE7B5", "#2B2420", "#8BC34A", "#5E9E2E", seed=31)),
    ("papel_laranja", "Papel laranja", "papel", lambda: fruta("#F7962F", "#F9D9A6", "#FBE7B5", "#F7B04E", seed=32)),
    ("papel_melancia", "Papel melancia", "papel", lambda: fruta("#E84545", "#2B2420", "#BFE6A0", "#4E9E3A", seed=33)),
    # tijolo (6)
    ("tijolo_grafite", "Tijolo grafite", "tijolo", lambda: tijolos(["#5E6266", "#6B7074", "#545759", "#777C80"], "#3E4144", seed=41)),
    ("tijolo_marrom", "Tijolo marrom", "tijolo", lambda: tijolos(["#7A5A4E", "#6B4C42", "#866659", "#5E4239"], "#3F2E28", seed=42)),
    ("tijolo_branco", "Tijolo branco", "tijolo", lambda: tijolos(["#E6E2DF", "#DAD5D1", "#EFECEA", "#CFC9C4"], "#B9B3AE", seed=43)),
    ("tijolo_terracota", "Tijolo terracota", "tijolo", lambda: tijolos(["#9E5843", "#8C4A38", "#A9634D", "#7E4232"], "#5C3226", seed=44)),
    ("tijolo_vermelho", "Tijolo vermelho", "tijolo", lambda: tijolos(["#B35A3E", "#A44E34", "#BE6748", "#97452E"], "#6E3423", larg_m=0.30, alt_m=0.10, seed=45)),
    ("tijolo_rustico", "Tijolo rústico", "tijolo", lambda: tijolos(["#9C5F4C", "#A8705C", "#8A5141", "#B07A63"], "#7A4A3B", larg_m=0.48, alt_m=0.16, seed=46, var=0.1)),
    # listras (6)
    ("listra_laranja", "Listras laranja", "listras", lambda: listras(["#FBB56B", "#F79A3E", "#FFFFFF"], [0.14, 0.14, 0.03])),
    ("listra_azul_fina", "Listras azuis finas", "listras", lambda: listras(["#4E9BE8", "#FFFFFF", "#6FB0EE", "#FFFFFF"], [0.10, 0.03, 0.10, 0.03])),
    ("listra_turquesa", "Listras turquesa", "listras", lambda: listras(["#6DC3C4", "#5AB3B6"], [0.16, 0.16])),
    ("listra_cinza", "Listras cinza", "listras", lambda: listras(["#BCC2C8", "#A2A9B0"], [0.18, 0.18])),
    ("listra_celeste", "Listras celeste", "listras", lambda: listras(["#6CC0F2", "#8ED0F7", "#55B2EC"], [0.12, 0.12, 0.12])),
    ("listra_verde", "Listras verdes", "listras", lambda: listras(["#7DB35A", "#5F9441"], [0.17, 0.17])),
]
# dos pacotes gratuitos (uso interno, não distribuir)
DO_PACOTE = [
    ("piso", "carpete_cassino", "Carpete (Cassino)", "pacote", lambda: do_pacote("Carpet_4.png", "piso", 2.0)),
    ("piso", "pedra_cidade", "Piso de pedra (Cidade)", "pacote", lambda: do_pacote("Tiles_2.png", "piso", 2.0)),
    ("piso", "tabuas_escuras", "Tábuas escuras (Xadrez)", "pacote", lambda: tabuas_do_pacote()),
    ("parede", "biscoito", "Biscoito (Natal)", "pacote", lambda: do_pacote("Cookie.png", "parede", 3.0)),
]


def main():
    saida = sys.argv[1]
    os.makedirs(saida, exist_ok=True)
    cat = {"piso": [], "parede": [], "escala_m": {"piso": 2.0, "parede": 3.0}}
    todos = [("piso",) + x for x in PISO] + [("parede",) + x for x in PAREDE] + DO_PACOTE
    for uso, id_, rot, grupo, fn in todos:
        img = fn()
        if img is None:
            print("sem", id_)
            continue
        Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).save(os.path.join(saida, id_ + ".png"), optimize=True)
        media = np.clip(img, 0, 255).reshape(-1, 3).mean(0)
        cat[uso].append({"id": id_, "rotulo": rot, "grupo": grupo, "arquivo": id_ + ".png",
                         "media": "#%02x%02x%02x" % tuple(int(x) for x in media),
                         **({"pacote": True} if grupo == "pacote" else {})})
        print("textura", uso, id_, flush=True)
    json.dump(cat, open(os.path.join(saida, "texturas.json"), "w"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
