"""Penteados por script: cascas com fios (base), mechas planas com textura de fios (volume) e
caminhos de mecha que seguem o couro cabeludo e depois caem com a gravidade, sem atravessar o corpo.
"""
import math
import random

import bpy
import numpy as np  # noqa: E402
from mathutils import Vector  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402

import mh_detalhe as det


def textura_mecha(tipo="liso", cor=(42, 27, 17), brilho=None, n_w=256, n_h=1024, fios=460, semente=1):
    """Textura RGBA de uma mecha: fios na vertical, ponta afinando no alfa."""
    rnd = random.Random(semente)
    brilho = brilho or tuple(min(255, int(c * 1.9 + 18)) for c in cor)
    img = Image.new("RGBA", (n_w, n_h), cor + (0,))
    d = ImageDraw.Draw(img)
    for _ in range(fios):
        x0 = rnd.uniform(0.05, 0.95) * n_w
        comp = rnd.uniform(0.6, 1.0) * n_h
        larg = rnd.choice((1, 2, 2, 3))
        c = brilho if rnd.random() < 0.2 else tuple(max(0, min(255, int(k * rnd.uniform(0.7, 1.2)))) for k in cor)
        fase = rnd.uniform(0, 6.28)
        pts = []
        for k in range(40):
            t = k / 39
            if tipo == "cacheado":
                x = x0 + math.sin(t * 22 + fase) * n_w * 0.16 * (0.5 + 0.5 * t)
            elif tipo == "ondulado":
                x = x0 + math.sin(t * 7 + fase) * n_w * 0.06
            else:
                x = x0 + math.sin(t * 3 + fase) * 3
            pts.append((x, t * comp))
        d.line(pts, fill=c + (rnd.randint(150, 255),), width=larg)
    arr = np.array(img).astype(np.float32)
    v = np.linspace(0, 1, n_h)[:, None]
    u = np.linspace(0, 1, n_w)[None, :]
    arr[..., 3] *= np.clip((1 - v) / 0.3, 0, 1) ** 0.8 * np.clip(np.minimum(u, 1 - u) / 0.14, 0, 1)
    return Image.fromarray(arr.astype(np.uint8))


def caminho_mecha(proj, raiz, fluxo, comprimento, passo=0.008, h0=0.004, h1=0.012, z_queda=None,
                  onda=0.0, periodo=0.05, espiral=0.0, rnd=None, afastar_corpo=0.014):
    """Pontos e normais de uma mecha: anda pelo couro cabeludo seguindo o fluxo e, abaixo de z_queda,
    cai na vertical mantendo distância do corpo. onda/espiral dão o ondulado e o cacho."""
    rnd = rnd or random.Random(0)
    pts, nors = [], []
    q = raiz
    andado = 0.0
    livre = False
    fase = rnd.uniform(0, 6.28)
    while andado < comprimento:
        t = andado / comprimento
        hit = proj.perto(q)
        if hit is None:
            break
        n = hit[1].normalized()
        dist = (q - hit[0]).length
        if not livre:
            alt = h0 + (h1 - h0) * min(1, t * 2.5)
            p = hit[0] + n * alt
            d = fluxo(hit[0])
            proximo = det.tangente(proj, hit[0], d, passo)
            if z_queda is not None and proximo.z < z_queda:
                livre = True
            q = proximo
        else:
            p = q.copy()
            if dist < afastar_corpo:
                p = hit[0] + n * afastar_corpo
            q = p + Vector((0, 0, -passo)) + n * passo * 0.12
        lado = Vector((0, 0, 1)).cross(n)
        if lado.length > 1e-6:
            lado.normalize()
            p = p + lado * math.sin(andado / periodo * 6.28 + fase) * onda
        if espiral:
            eixo2 = lado.cross(n) if lado.length > 1e-6 else Vector((1, 0, 0))
            a = andado / periodo * 6.28 + fase
            p = p + (lado * math.cos(a) + eixo2 * math.sin(a)) * espiral
        pts.append(p)
        nors.append(n)
        andado += passo
    return pts, nors


def mechas(proj, raizes, fluxo, material, arm, nome, comp=(0.1, 0.16), larg=(0.012, 0.02), z_queda=None,
           onda=0.0, espiral=0.0, periodo=0.05, h=(0.004, 0.012), semente=3, peso_fn=None, P="mixamorig:",
           passo=0.008):
    rnd = random.Random(semente)
    out = []
    for i, r in enumerate(raizes):
        L = rnd.uniform(*comp)
        pts, nors = caminho_mecha(proj, r, fluxo, L, passo=passo, h0=h[0], h1=h[1], z_queda=z_queda, onda=onda,
                                  periodo=periodo * rnd.uniform(0.8, 1.2), espiral=espiral, rnd=rnd)
        if len(pts) < 3:
            continue
        w = rnd.uniform(*larg)
        n = len(pts)
        larguras = [w * (0.6 + 0.4 * math.sin(math.pi * min(1, (k / (n - 1)) * 1.6 + 0.15))) * (1 - 0.45 * (k / (n - 1)) ** 3)
                    for k in range(n)]
        o = det.card(f"{nome}_{i}", pts, nors, larguras, material, arm, P=P)
        if peso_fn:
            o.vertex_groups.clear()
            grupos = {}
            for v in o.data.vertices:
                for osso, val in peso_fn(o.matrix_world @ v.co).items():
                    g = grupos.get(osso) or o.vertex_groups.new(name=P + osso)
                    grupos[osso] = g
                    g.add([v.index], val, "REPLACE")
        out.append(o)
    return out


def juntar(objs, nome):
    if not objs:
        return None
    for x in bpy.context.selected_objects:
        x.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    objs[0].name = nome
    return objs[0]
