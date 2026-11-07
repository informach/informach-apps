"""Base da biblioteca de cidade do Morada (por cima da moveis_base: mesma paleta, primitivas, Item e Catalogo).

Convenções da cidade (as mesmas do pacote gratuito Cartoon City, para as peças encaixarem nas dele):
- Grade de 15 m: cada quadra de rua tem 15 × 15 m, origem no centro, Z para cima. Peças maiores ocupam 2 × 2 ou mais
  quadras (30 × 30 m etc.) e continuam com a origem no centro.
- Alturas: o topo da calçada fica em z = 0, o asfalto em z = −0,10, e o meio-fio sobe até z = +0,10 (boleado). A laje
  de cada peça desce até z = −0,40 (as laterais aparecem limpas na borda da cidade).
- Perfis (os do pacote):
    RUA      2 faixas: asfalto de 7,30 m (x de −3,65 a 3,65), meio-fio centrado em ±3,75, calçadas até ±7,50;
    AVENIDA  4 faixas: asfalto de 12,30 m (±6,15), meio-fio em ±6,25, calçadas de 1,15 m até ±7,50.
  Uma reta corre no eixo Y (entra pelo lado y = −7,5 e sai pelo y = +7,5). Toda peça que tem rua numa borda usa o
  mesmo perfil nessa borda, então qualquer peça encaixa em qualquer outra pela borda.
- Faixas pintadas: geometria fina 4 mm acima do asfalto, branca (ou amarela). Tracejado com período de 5 m (traço de
  2,5 m centrado em y = 0, ±5): o desenho continua de uma quadra para a outra.
- Cores da paleta da biblioteca (mb.CORES): asfalto, asfalto_claro, calcada, concreto, concreto_escuro, grama,
  grama_escura, brita, dormente, trilho, agua_rio, agua_funda, neon_ciano, piso_rosado, terra_seca e as demais.
  Materiais à parte: agua (lâmina d'água), neon (faixas de luz ciano das pontes), vidro, luz.
"""
import math
import os

import bpy  # noqa: F401
import bmesh  # noqa: F401
from mathutils import Matrix, Vector

import moveis_base as mb

V = Vector
Q = 15.0  # quadra
H = Q / 2
Z_CALC, Z_ASF, Z_FUNDO = 0.0, -0.10, -0.40
RUA = {"nome": "rua", "asf": 3.65, "mf": 3.75, "faixas": 2}
AVENIDA = {"nome": "avenida", "asf": 6.15, "mf": 6.25, "faixas": 4}
LARG_FAIXA = 0.15
ALT_TINTA = 0.004


# ---------------------------------------------------------------------------------------------------- lajes
def laje(contorno, z_topo, cor, z_fundo=Z_FUNDO, bisel=0.0, nome="laje", mat="atlas"):
    """Laje com o contorno 2D (anti-horário) do topo em z_topo até z_fundo."""
    return mb.extrudado(mb._ccw(list(contorno)), z_topo - z_fundo, z=z_fundo, cor=cor, bisel=bisel, nome=nome,
                        liso=False, mat=mat)


def quadrado(x0, y0, x1, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


def arco(cx, cy, r, a0, a1, n=24):
    """Pontos de um arco (graus), de a0 para a1."""
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * k / n)),
             cy + r * math.sin(math.radians(a0 + (a1 - a0) * k / n))) for k in range(n + 1)]


# ------------------------------------------------------------------------------------------------ meio-fio
def meio_fio(pontos, cor="calcada", fechado=False, nome="meio_fio"):
    """Meio-fio boleado ao longo de uma linha 2D (no limite entre asfalto e calçada): 20 cm de largura, sobe de
    −0,10 (asfalto) até +0,10 e desce para 0 (calçada). O lado do asfalto é a ESQUERDA de quem anda pela linha."""
    pts = [V((p[0], p[1], 0.0)) for p in pontos]
    if fechado:
        pts.append(pts[0])
    perfil = [(-0.10, Z_ASF - 0.02), (-0.10, 0.03), (-0.07, 0.085), (0.0, 0.10), (0.07, 0.085), (0.10, 0.03),
              (0.10, Z_ASF - 0.02)]
    bm = bmesh.new()
    aneis = []
    for i, p in enumerate(pts):
        if i == 0:
            t = (pts[1] - pts[0])
        elif i == len(pts) - 1:
            t = (pts[-1] - pts[-2])
        else:
            t = (pts[i + 1] - pts[i - 1])
        t.z = 0
        t.normalize()
        lado = V((-t.y, t.x, 0))  # esquerda = asfalto
        anel = [bm.verts.new(p + lado * (-dx) + V((0, 0, dz))) for dx, dz in perfil]
        aneis.append(anel)
    for a, b in zip(aneis, aneis[1:]):
        for k in range(len(perfil) - 1):
            bm.faces.new((a[k], a[k + 1], b[k + 1], b[k]))
    if not fechado:
        for anel in (aneis[0], aneis[-1][::-1]):
            bm.faces.new(anel[::-1] if anel is aneis[0] else anel)
    return mb._obj(nome, bm, cor, liso=True, angulo=50)


# ------------------------------------------------------------------------------------------------ faixas pintadas
def _reamostra(pontos, passo=0.25):
    pts = [V((p[0], p[1])) for p in pontos]
    out = [pts[0]]
    for a, b in zip(pts, pts[1:]):
        L = (b - a).length
        n = max(1, int(L / passo))
        for k in range(1, n + 1):
            out.append(a + (b - a) * (k / n))
    return out


def faixa(pontos, larg=LARG_FAIXA, cor="branco", tracejada=None, fase=0.0, z=Z_ASF, nome="faixa"):
    """Faixa pintada ao longo de uma linha 2D. tracejada=(traço, vão): o tracejado é medido pelo comprimento ao longo
    da linha a partir de 'fase' (use a coordenada do início, p. ex. y inicial, para casar com a quadra vizinha)."""
    pts = _reamostra(pontos)
    s = [0.0]
    for a, b in zip(pts, pts[1:]):
        s.append(s[-1] + (b - a).length)
    trechos = []
    if not tracejada:
        trechos = [(0, len(pts) - 1)]
    else:
        tr, vao = tracejada
        per = tr + vao
        dentro = None
        for i, si in enumerate(s):
            u = (si + fase + tr / 2) % per
            on = u < tr
            if on and dentro is None:
                dentro = i
            elif not on and dentro is not None:
                if i - 1 > dentro:
                    trechos.append((dentro, i - 1))
                dentro = None
        if dentro is not None and len(pts) - 1 > dentro:
            trechos.append((dentro, len(pts) - 1))
    objs = []
    for i0, i1 in trechos:
        bm = bmesh.new()
        esq, dir_ = [], []
        for i in range(i0, i1 + 1):
            a = pts[max(i0, i - 1)]
            b = pts[min(i1, i + 1)]
            t = (b - a).normalized()
            n = V((-t.y, t.x))
            p = pts[i]
            esq.append(bm.verts.new((p.x + n.x * larg / 2, p.y + n.y * larg / 2, z + ALT_TINTA)))
            dir_.append(bm.verts.new((p.x - n.x * larg / 2, p.y - n.y * larg / 2, z + ALT_TINTA)))
        for k in range(len(esq) - 1):
            bm.faces.new((dir_[k], dir_[k + 1], esq[k + 1], esq[k]))
        objs.append(mb._obj(nome, bm, cor, liso=False))
    return mb.junta(objs, nome) if objs else None


def faixa_pedestres(cx, cy, comprimento, direcao="x", largura=3.0, listra=0.5, z=Z_ASF):
    """Faixa de pedestres (zebra) centrada em (cx, cy), atravessando 'comprimento' na direção dada (a rua corre na
    outra direção). As listras ficam paralelas à rua."""
    objs = []
    n = int(comprimento / (2 * listra))
    for k in range(n):
        off = -comprimento / 2 + listra * (2 * k + 1)
        if direcao == "x":
            objs.append(mb.caixa(listra, largura, ALT_TINTA, x=cx + off, y=cy, z=z, cor="branco", bisel=0, liso=False))
        else:
            objs.append(mb.caixa(largura, listra, ALT_TINTA, x=cx, y=cy + off, z=z, cor="branco", bisel=0, liso=False))
    return mb.junta(objs, "faixa_pedestres")


def marcacoes_reta(perfil, y0=-H, y1=H, x=0.0, eixo="y"):
    """Faixas de uma reta: rua = linha central tracejada; avenida = dupla contínua no centro + tracejadas entre as
    faixas. Linhas de bordo contínuas a 0,30 m do meio-fio."""
    a = perfil["asf"]
    objs = []

    def linha(off, **k):
        if eixo == "y":
            return faixa([(x + off, y0), (x + off, y1)], fase=y0, **k)
        return faixa([(y0, x + off), (y1, x + off)], fase=y0, **k)

    if perfil["faixas"] == 2:
        objs.append(linha(0.0, tracejada=(2.5, 2.5)))
    else:
        objs += [linha(-0.12), linha(0.12)]
        objs += [linha(-a / 2 + 0.06, tracejada=(2.5, 2.5)), linha(a / 2 - 0.06, tracejada=(2.5, 2.5))]
    objs += [linha(-a + 0.3, larg=0.12), linha(a - 0.3, larg=0.12)]
    return [o for o in objs if o]


# ------------------------------------------------------------------------------------------------ peças de rua prontas
def rua_reta(it, perfil=RUA, calcada="calcada"):
    a, m = perfil["asf"], perfil["mf"]
    it.add(laje(quadrado(-m, -H, m, H), Z_ASF, "asfalto", nome="asfalto"))
    it.add(laje(quadrado(-H, -H, -m, H), Z_CALC, calcada), laje(quadrado(m, -H, H, H), Z_CALC, calcada))
    it.add(meio_fio([(-m, H), (-m, -H)]), meio_fio([(m, -H), (m, H)]))
    it.add(marcacoes_reta(perfil))


def _canto(xs, ys, m, r, n=10):
    """Calçada de canto de cruzamento (xs, ys = ±1): o quadrado de (±m, ±m) até (±H, ±H) com o canto de dentro
    arredondado (raio r). Devolve (contorno, linha do meio-fio da borda y = ±H até a borda x = ±H)."""
    cx, cy = xs * (m + r), ys * (m + r)
    a1 = 270 if ys > 0 else 90           # ponto na linha y = ys·m
    a2 = 180 if xs > 0 else 0            # ponto na linha x = xs·m
    if abs(a2 - a1) > 180:
        a2 += 360
    arc = arco(cx, cy, r, a1, a2, n)     # de (xs(m+r), ys·m) até (xs·m, ys(m+r))
    contorno = arc + [(xs * m, ys * H), (xs * H, ys * H), (xs * H, ys * m)]
    linha = [(xs * m, ys * H)] + arc[::-1] + [(xs * H, ys * m)]
    return contorno, linha


def rua_cruzamento(it, perfil=RUA, bracos=(True, True, True, True), r=2.5, calcada="calcada", pare=True):
    """Cruzamento: bracos = (norte, leste, sul, oeste). 4 braços = X; 3 = T. Cantos com meio-fio arredondado."""
    a, m = perfil["asf"], perfil["mf"]
    N, L, S, O = bracos
    it.add(laje(quadrado(-H, -H, H, H), Z_ASF, "asfalto", nome="asfalto"))
    for xs, ys, ok in ((1, 1, N and L), (-1, 1, N and O), (-1, -1, S and O), (1, -1, S and L)):
        if ok:
            pts, linha = _canto(xs, ys, m, r)
            it.add(laje(pts, Z_CALC, calcada))
            it.add(meio_fio(linha))
    # braço fechado: faixa de calçada inteira daquele lado
    if not N:
        it.add(laje(quadrado(-H, m, H, H), Z_CALC, calcada), meio_fio([(H, m), (-H, m)]))
    if not S:
        it.add(laje(quadrado(-H, -H, H, -m), Z_CALC, calcada), meio_fio([(-H, -m), (H, -m)]))
    if not L:
        it.add(laje(quadrado(m, -H, H, H), Z_CALC, calcada), meio_fio([(m, -H), (m, H)]))
    if not O:
        it.add(laje(quadrado(-H, -H, -m, H), Z_CALC, calcada), meio_fio([(-m, H), (-m, -H)]))
    # faixas: só nos braços, até a linha de parada
    lim = m + r * 0.6
    for lado, ok in (("N", N), ("S", S), ("L", L), ("O", O)):
        if not ok:
            continue
        if lado in "NS":
            sg = 1 if lado == "N" else -1
            y0, y1 = sorted((sg * lim, sg * H))
            sub = marcacoes_reta(perfil, y0, y1)
            it.add([o for o in sub])
            if pare:  # linha de retenção na mão que chega ao cruzamento
                xa = (0, a - 0.3) if sg > 0 else (-(a - 0.3), 0)
                it.add(mb.caixa(xa[1] - xa[0], 0.4, ALT_TINTA, x=sum(xa) / 2, y=sg * (lim + 0.2), z=Z_ASF, cor="branco",
                                bisel=0, liso=False))
        else:
            sg = 1 if lado == "L" else -1
            x0, x1 = sorted((sg * lim, sg * H))
            it.add(marcacoes_reta(perfil, x0, x1, eixo="x"))
            if pare:
                ya = (-(a - 0.3), 0) if sg > 0 else (0, a - 0.3)
                it.add(mb.caixa(0.4, ya[1] - ya[0], ALT_TINTA, x=sg * (lim + 0.2), y=sum(ya) / 2, z=Z_ASF, cor="branco",
                                bisel=0, liso=False))


def rua_curva(it, perfil=RUA, calcada="calcada", n=32):
    """Curva de 90°: entra pelo sul (y = −7,5) e sai pelo leste (x = +7,5). Centro da curva no canto (+7,5, −7,5)."""
    a, m = perfil["asf"], perfil["mf"]
    cx, cy = H, -H
    r_in, r_out = H - m, H + m
    asf = arco(cx, cy, r_out, 90, 180, n) + arco(cx, cy, r_in, 180, 90, n)
    it.add(laje(asf, Z_ASF, "asfalto", nome="asfalto"))
    dentro = [(cx, cy)] + arco(cx, cy, r_in, 90, 180, n)
    it.add(laje(dentro, Z_CALC, calcada))
    fora = arco(cx, cy, r_out, 180, 90, n) + [(H, H), (-H, H), (-H, -H)]
    it.add(laje(fora, Z_CALC, calcada))
    it.add(meio_fio(arco(cx, cy, r_out, 180, 90, n)))
    it.add(meio_fio(arco(cx, cy, r_in, 90, 180, n)))
    rc = H
    if perfil["faixas"] == 2:
        it.add(faixa(arco(cx, cy, rc, 180, 90, n * 2), tracejada=(2.5, 2.5), fase=-H))
    else:
        it.add(faixa(arco(cx, cy, rc - 0.12, 180, 90, n * 2)), faixa(arco(cx, cy, rc + 0.12, 180, 90, n * 2)))
        for off in (-a / 2 + 0.06, a / 2 - 0.06):
            it.add(faixa(arco(cx, cy, rc + off, 180, 90, n * 2), tracejada=(2.5, 2.5), fase=-H))
    for off in (-(a - 0.3), a - 0.3):
        it.add(faixa(arco(cx, cy, rc + off, 180, 90, n * 2), larg=0.12))


def rua_fim(it, perfil=RUA, calcada="calcada", n=24):
    """Fim de rua (retorno): a rua chega pelo sul e termina num balão arredondado."""
    a, m = perfil["asf"], perfil["mf"]
    R = min(H - 1.2, m + 2.0)
    yc = 0.8
    ang = math.degrees(math.asin(min(1.0, m / R)))
    curva = arco(0, yc, R, -90 + ang, 270 - ang, n * 2)
    y_lig = yc - R * math.cos(math.radians(ang))
    asf = [(-m, -H), (m, -H), (m, y_lig)] + curva[1:-1] + [(-m, y_lig)]
    it.add(laje(asf, Z_ASF, "asfalto", nome="asfalto"))
    fora = [(m, -H), (H, -H), (H, H), (-H, H), (-H, -H), (-m, -H), (-m, y_lig)] + curva[::-1][1:-1] + [(m, y_lig)]
    it.add(laje(fora, Z_CALC, calcada))
    it.add(meio_fio([(m, -H), (m, y_lig)] + curva[1:-1] + [(-m, y_lig), (-m, -H)]))
    if perfil["faixas"] == 2:
        it.add(faixa([(0, -H), (0, y_lig - 1.0)], tracejada=(2.5, 2.5), fase=-H))


# ------------------------------------------------------------------------------------------------ catálogo
DIR_TOPO = (0.55, -1.0, 1.35)  # miniatura de peça plana: três quartos bem de cima


def exporta(cat, it, rotulo, grupo, tags=(), dir_mini=DIR_TOPO, colisao_plana=True, **op):
    """Exporta uma peça de cidade. Peças planas ganham colisão: laje inteira até o topo da calçada."""
    if colisao_plana and it.colisores is None:
        it.colisao([((0, 0, Z_FUNDO), (Q, Q, -Z_FUNDO))])
    return cat.exporta(it, rotulo, grupo=grupo, tags=tags, miniatura_dir=dir_mini, **op)


# ------------------------------------------------------------------------------------------------ pacote Cartoon City
CC_DIR = os.environ.get("CIDADE_PACOTE_FBX", "")
CC_TEX = os.environ.get("CIDADE_PACOTE_TEX", "")  # Textures1.png (atlas de cores do pacote)
CC_TEXTURAS = os.environ.get("CIDADE_PACOTE_TEXTURAS", "")  # pasta com Roads.png, Tiles_2.png


def importa_cidade(nome):
    """Importa uma peça do Cartoon City: as cores do atlas viram a nossa paleta (mb.importa_pacote) e os materiais com
    textura própria do pacote (Roads, Tile_1) viram estampas, com o UV original. Grass e Asphalt viram cores."""
    import bpy as _b
    antes = set(_b.data.objects)
    _b.ops.import_scene.fbx(filepath=os.path.join(CC_DIR, nome + ".fbx"))
    novos = [o for o in _b.data.objects if o not in antes]
    out = {}
    img = _b.data.images.load(CC_TEX, check_existing=True)
    W, Hh = img.size
    px = img.pixels[:]
    mb.materiais()
    est = {"roads": mb.material_estampa("ruas_pacote", os.path.join(CC_TEXTURAS, "Roads.png")),
           "tile_1": mb.material_estampa("ladrilho_pacote", os.path.join(CC_TEXTURAS, "Tiles_2.png"))}
    cache = {}
    for o in novos:
        if o.type != "MESH":
            continue
        me = o.data.copy()
        me.transform(o.matrix_world)
        mats = [m.name.lower() if m else "" for m in me.materials]
        bm = bmesh.new()
        bm.from_mesh(me)
        _b.data.meshes.remove(me)
        uvl = bm.loops.layers.uv.active
        for f in bm.faces:
            nm = mats[f.material_index] if f.material_index < len(mats) else ""
            if nm in est:
                f.material_index = est[nm]
                continue
            if "glass" in nm:
                f.material_index = mb.MAT_NOMES.index("vidro")
                continue
            if "emissive" in nm:
                f.material_index = mb.MAT_NOMES.index("luz")
                continue
            if "grass" in nm:
                cor = "grama"
            elif "asphalt" in nm:
                cor = "asfalto"
            else:
                us = [lo[uvl].uv for lo in f.loops]
                u = sum(q[0] for q in us) / len(us)
                v = sum(q[1] for q in us) / len(us)
                k = (min(Hh - 1, max(0, int(v % 1 * Hh))) * W + min(W - 1, max(0, int(u % 1 * W)))) * 4
                rgb = tuple(round(c, 3) for c in px[k:k + 3])
                if rgb not in cache:
                    cache[rgb] = mb.cor_mais_proxima(rgb)
                cor = cache[rgb]
            uu = mb.uv_cor(cor)
            for lo in f.loops:
                lo[uvl].uv = uu
            f.material_index = 0
        if uvl.name != "UVMap":
            uvl.name = "UVMap"
        mesh = _b.data.meshes.new(o.name)
        bm.to_mesh(mesh)
        bm.free()
        for n in mb.MAT_NOMES:
            mesh.materials.append(_b.data.materials[n])
        ob = _b.data.objects.new(o.name, mesh)
        _b.context.scene.collection.objects.link(ob)
        out[o.name] = ob
    for o in novos:
        _b.data.objects.remove(o)
    return out
