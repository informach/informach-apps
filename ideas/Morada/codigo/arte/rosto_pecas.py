"""Rosto trocável (estilo cartoon): olhos, sobrancelhas e boca viram peças finas por cima do rosto,
cada uma com uma folha de desenhos (atlas). O jogo troca o quadro do atlas para piscar, olhar, falar e fazer expressão.

Uso: python rosto_pecas.py <personagem.blend> <rosto_mapa.npz> <id> <saida_dir>

1. Apaga da textura base os olhos, as sobrancelhas e a boca pintados (pele por cima dos olhos e sobrancelhas,
   barba ou pele por cima da boca).
2. Cria três malhas finas que acompanham a curva do rosto, presas ao osso da cabeça.
3. Desenha os atlas (PNG com transparência) e grava a tabela de quadros em <id>_rosto.json.
4. Salva <id>_rosto.blend e exporta <id>.glb.

Medidas do rosto (centros dos olhos, sobrancelhas e boca) ficam em ROSTO, em metros, lidas do mapa frontal.
"""
import json
import math
import os
import sys

import bpy
import bmesh  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Vector  # noqa: E402
from mathutils.bvhtree import BVHTree  # noqa: E402
from PIL import Image, ImageDraw, ImageFilter  # noqa: E402

BLEND, MAPA, PID, OUT = sys.argv[1:5]
P = "mixamorig:"

# ------------------------------------------------------------------ medidas do rosto (metros, vista de frente)
ROSTO = dict(
    olho_x=0.0446, olho_z=1.5707, centro_x=0.0007,      # olhos simétricos em torno de centro_x
    sobr_z=1.6105, sobr_int=0.0215, sobr_ext=0.0895,    # sobrancelha: altura e pontas (distância do centro)
    boca_x=0.0010, boca_z=1.5030,
    pele_lin=(0.7725, 0.5216, 0.3843),  # valores sRGB lidos da textura
    sobr_cor=(92, 56, 30), cilio_cor=(38, 22, 12), iris_cor=(74, 46, 26),
)
# retângulos das peças (centro x, centro z, largura, altura), proporção 2:1
PECAS = {
    "olhos": (0.001, 1.5925, 0.200, 0.100, 4, 3, 640, 320),
    "sobrancelhas": (0.001, 1.5925, 0.200, 0.100, 3, 2, 640, 320),
    "boca": (0.001, 1.5040, 0.152, 0.076, 4, 3, 512, 256),
}

bpy.ops.wm.open_mainfile(filepath=BLEND)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
corpo = next(o for o in bpy.data.objects if o.type == "MESH")
arm.data.pose_position = "REST"
bpy.context.view_layer.update()
me = corpo.data
me.calc_loop_triangles()
mw = corpo.matrix_world
VS = np.array([tuple(mw @ v.co) for v in me.vertices], np.float64)
TRIS = np.array([tuple(t.vertices) for t in me.loop_triangles], np.int64)
uvd = me.uv_layers.active.data
TUV = np.array([[tuple(uvd[l].uv) for l in t.loops] for t in me.loop_triangles], np.float64)
bvh = BVHTree.FromPolygons([Vector(v) for v in VS], [tuple(t) for t in TRIS])

# ------------------------------------------------------------------ 1. apagar os traços pintados
d = np.load(MAPA)
cor_m, pos_m = d["cor"], d["pos"]
X0, Z1, RES = float(d["x0"]), float(d["z1"]), float(d["res"])
NZ, NX = cor_m.shape[:2]
hit = ~np.isnan(pos_m[..., 0])
lum = cor_m.mean(2)
sat = cor_m.max(2) - cor_m.min(2)
jj, ii = np.mgrid[0:NZ, 0:NX]
gx = X0 + ii * RES
gz = Z1 - jj * RES


def elipse(cx, cz, rx, rz):
    return ((gx - cx) / rx) ** 2 + ((gz - cz) / rz) ** 2 <= 1


def dilatar(m, px):
    im = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(2 * px + 1))
    return np.array(im) > 127


R = ROSTO
m_pele = np.zeros((NZ, NX), bool)
for s in (-1, 1):
    m_pele |= elipse(R["centro_x"] + s * R["olho_x"], R["olho_z"], 0.025, 0.019)
    janela = elipse(R["centro_x"] + s * (R["sobr_int"] + R["sobr_ext"]) / 2, R["sobr_z"], 0.042, 0.021)
    m_pele |= dilatar(janela & hit & (lum < 0.12), 3)
pele_cor = np.array(R["pele_lin"])
# boca: tudo o que não é barba nem pele dentro da elipse da boca vira barba
boca_el = elipse(R["boca_x"], R["boca_z"] - 0.001, 0.062, 0.017)
anel = elipse(R["boca_x"], R["boca_z"], 0.072, 0.026) & ~elipse(R["boca_x"], R["boca_z"], 0.064, 0.019) & hit
escuro = anel & (lum < 0.12)
barba_cor = np.median(cor_m[escuro], 0) if escuro.sum() > 50 else np.array([0.18, 0.07, 0.01])
m_barba = dilatar(boca_el & hit, 2)
print("cor barba", barba_cor, "pixels pele", int(m_pele.sum()), "barba", int(m_barba.sum()))


def suavizar(m, sigma=2.0):
    im = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(sigma))
    return np.array(im).astype(np.float32) / 255


a_pele = suavizar(m_pele)
a_barba = suavizar(m_barba)

img = next(i for i in bpy.data.images if i.size[0] > 0 and i.name.startswith(PID))
W, H = img.size
px = np.array(img.pixels[:], dtype=np.float32).reshape(H, W, 4)
cab_y = (arm.matrix_world @ arm.data.bones[P + "Head"].head_local).y
cand = [k for k, t in enumerate(TRIS)
        if VS[t, 1].mean() < cab_y and abs(VS[t, 0].mean()) < 0.14 and 1.44 < VS[t, 2].mean() < 1.67]
mudou = 0
for k in cand:
    t = TRIS[k]
    P3 = VS[t]
    uv = TUV[k] * np.array([W, H])
    u0, v0 = np.floor(uv.min(0)).astype(int) - 2
    u1, v1 = np.ceil(uv.max(0)).astype(int) + 2
    u0, v0 = max(u0, 0), max(v0, 0)
    u1, v1 = min(u1, W - 1), min(v1, H - 1)
    if u1 <= u0 or v1 <= v0:
        continue
    gu, gv = np.meshgrid(np.arange(u0, u1 + 1) + 0.5, np.arange(v0, v1 + 1) + 0.5)
    (ax, ay), (bx, by), (cx, cy) = uv
    den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
    if abs(den) < 1e-9:
        continue
    l0 = ((by - cy) * (gu - cx) + (cx - bx) * (gv - cy)) / den
    l1 = ((cy - ay) * (gu - cx) + (ax - cx) * (gv - cy)) / den
    l2 = 1 - l0 - l1
    dentro = (l0 >= -0.12) & (l1 >= -0.12) & (l2 >= -0.12)
    if not dentro.any():
        continue
    pos = l0[..., None] * P3[0] + l1[..., None] * P3[1] + l2[..., None] * P3[2]
    gi = np.clip(np.round((pos[..., 0] - X0) / RES).astype(int), 0, NX - 1)
    gj = np.clip(np.round((Z1 - pos[..., 2]) / RES).astype(int), 0, NZ - 1)
    frente = np.abs(pos[..., 1] - np.nan_to_num(pos_m[gj, gi, 1], nan=9)) < 0.005
    ok = dentro & frente
    ap = a_pele[gj, gi] * ok
    ab = a_barba[gj, gi] * ok
    bloco = px[v0:v1 + 1, u0:u1 + 1, :3]
    bloco = bloco * (1 - ap[..., None]) + pele_cor * ap[..., None]
    bloco = bloco * (1 - ab[..., None]) + barba_cor * ab[..., None]
    px[v0:v1 + 1, u0:u1 + 1, :3] = bloco
    mudou += int(((ap + ab) > 0.01).sum())
print("texels repintados", mudou)
# img.pixels de uma imagem de 8 bits já vem em sRGB (igual ao mapa): grava sem converter
srgb = np.clip(px[::-1, :, :3], 0, 1)
caminho_base = os.path.join(OUT, f"{PID}_base_limpa.png")
Image.fromarray((srgb * 255 + 0.5).astype(np.uint8)).save(caminho_base)
nova = bpy.data.images.load(caminho_base)
nova.name = f"{PID}_base_limpa"
for mat in me.materials:
    for n in mat.node_tree.nodes:
        if n.type == "TEX_IMAGE":
            n.image = nova
bpy.data.images.remove(img)


# ------------------------------------------------------------------ 2. desenhos (atlas)
SS = 4  # superamostragem


class Celula:
    """Desenha numa célula em milímetros do retângulo da peça (x para a direita, y para baixo)."""

    def __init__(self, peca):
        cx, cz, w, h, cols, rows, cw, chh = PECAS[peca]
        self.xmin, self.zmax, self.w, self.h = cx - w / 2, cz + h / 2, w, h
        self.cw, self.ch = cw * SS, chh * SS
        self.k = self.cw / (w * 1000)  # px por mm
        self.img = Image.new("RGBA", (self.cw, self.ch), (0, 0, 0, 0))

    def mm(self, x, z):  # mundo (m) -> mm da célula
        return ((x - self.xmin) * 1000, (self.zmax - z) * 1000)

    def p(self, pts):
        return [(x * self.k, y * self.k) for x, y in pts]

    def camada(self):
        return Image.new("RGBA", (self.cw, self.ch), (0, 0, 0, 0))

    def mascara(self):
        return Image.new("L", (self.cw, self.ch), 0)

    def colar(self, cam, masc=None):
        if masc is not None:
            a = np.array(cam)[..., 3].astype(np.float32) * (np.array(masc).astype(np.float32) / 255)
            arr = np.array(cam)
            arr[..., 3] = a.astype(np.uint8)
            cam = Image.fromarray(arr)
        self.img = Image.alpha_composite(self.img, cam)

    def final(self):
        cx, cz, w, h, cols, rows, cw, chh = PECAS[self.peca_nome]
        return self.img.resize((cw, chh), Image.LANCZOS)


def tracado(pts, larg_ini, larg_fim, ponta_redonda=True):
    """Polígono de um traço com largura variável ao longo dos pontos (mm)."""
    n = len(pts)
    esq, dir_ = [], []
    for i, (x, y) in enumerate(pts):
        x0, y0 = pts[max(i - 1, 0)]
        x1, y1 = pts[min(i + 1, n - 1)]
        dx, dy = x1 - x0, y1 - y0
        L = math.hypot(dx, dy) or 1
        nx, ny = -dy / L, dx / L
        t = i / (n - 1)
        w = (larg_ini + (larg_fim - larg_ini) * t) / 2
        esq.append((x + nx * w, y + ny * w))
        dir_.append((x - nx * w, y - ny * w))
    return esq + dir_[::-1]


def curva(f, x0, x1, n=40):
    return [(x0 + (x1 - x0) * i / (n - 1), f(x0 + (x1 - x0) * i / (n - 1))) for i in range(n)]


# ---- olhos
A_OLHO, B_OLHO, R_IRIS, R_PUPILA = 19.5, 14.0, 9.6, 5.0


def olho(cel, s, ab_sup=1.0, incl=0.0, ab_inf=0.0, olhar=(0.0, 0.0), pupila=1.0, fechado=None, arregalado=0.0):
    """s = -1 olho da esquerda (de quem vê), +1 da direita. incl > 0 abaixa o canto de dentro (bravo),
    < 0 abaixa o canto de fora (triste). fechado = 'normal' ou 'feliz'."""
    cx, cy = cel.mm(R["centro_x"] + s * R["olho_x"], R["olho_z"])
    a, b = A_OLHO * (1 + 0.08 * arregalado), B_OLHO * (1 + 0.18 * arregalado)
    dentro = -s  # direção do canto de dentro em x
    d = ImageDraw.Draw(cel.img)
    cil = R["cilio_cor"] + (255,)
    if fechado:
        if fechado == "feliz":
            f = lambda x: cy + 0.25 * b - 0.75 * b * math.sqrt(max(0, 1 - ((x - cx) / a) ** 2))  # noqa: E731
        else:
            f = lambda x: cy + 0.15 * b + 0.32 * b * math.sqrt(max(0, 1 - ((x - cx) / a) ** 2))  # noqa: E731
        pts = curva(f, cx - a * 0.95, cx + a * 0.95)
        d.polygon(cel.p(tracado(pts, 2.6, 2.6)), fill=cil)
        fora = cx - dentro * a * 0.95
        y_f = f(fora)
        d.polygon(cel.p(tracado([(fora, y_f), (fora - dentro * 3.5, y_f - 2.5)], 2.4, 0.6)), fill=cil)
        for p_ in (pts[0], pts[-1]):
            r = 1.3 * cel.k
            d.ellipse((p_[0] * cel.k - r, p_[1] * cel.k - r, p_[0] * cel.k + r, p_[1] * cel.k + r), fill=cil)
        return

    def topo(x):
        q = max(0.0, 1 - ((x - cx) / a) ** 2)
        y = cy - b * math.sqrt(q)
        y += (1 - ab_sup) * 2 * b * math.sqrt(q)
        y += incl * b * 0.75 * ((x - cx) * dentro / a + 0.35) * math.sqrt(q)
        return y

    def base(x):
        q = max(0.0, 1 - ((x - cx) / a) ** 2)
        return cy + b * math.sqrt(q) - ab_inf * 1.4 * b * math.sqrt(q)

    xs = [cx - a + 2 * a * i / 59 for i in range(60)]
    reg = [(x, min(topo(x), base(x))) for x in xs] + [(x, base(x)) for x in reversed(xs)]
    masc = cel.mascara()
    ImageDraw.Draw(masc).polygon(cel.p(reg), fill=255)
    cam = cel.camada()
    dc = ImageDraw.Draw(cam)
    dc.rectangle((0, 0, cel.cw, cel.ch), fill=(250, 247, 242, 255))
    # sombra suave da pálpebra no alto do branco
    for i in range(6):
        yy = [topo(x) + i * 0.6 for x in xs]
        dc.line(cel.p(list(zip(xs, yy))), fill=(214, 200, 192, 255 - i * 40), width=max(1, int(0.8 * cel.k)))
    ix, iy = cx + olhar[0] * a * 0.5, cy + olhar[1] * b * 0.45
    ri, rp = R_IRIS * (1 - 0.18 * arregalado), R_PUPILA * pupila * (1 - 0.3 * arregalado)
    for k_ in range(12):  # íris com degradê (mais escura na borda)
        r = ri * (1 - k_ / 12)
        t = k_ / 11
        c = tuple(int(R["iris_cor"][j] * (0.55 + 0.6 * t)) for j in range(3))
        dc.ellipse(((ix - r) * cel.k, (iy - r) * cel.k, (ix + r) * cel.k, (iy + r) * cel.k), fill=c + (255,))
    dc.ellipse(((ix - ri) * cel.k, (iy - ri) * cel.k, (ix + ri) * cel.k, (iy + ri) * cel.k),
               outline=(30, 18, 10, 255), width=int(0.9 * cel.k))
    dc.ellipse(((ix - rp) * cel.k, (iy - rp) * cel.k, (ix + rp) * cel.k, (iy + rp) * cel.k), fill=(16, 10, 8, 255))
    for bx, by, br in ((-0.38, -0.42, 0.3), (0.34, 0.36, 0.12)):
        hx, hy, hr = ix + bx * ri, iy + by * ri, br * ri
        dc.ellipse(((hx - hr) * cel.k, (hy - hr) * cel.k, (hx + hr) * cel.k, (hy + hr) * cel.k), fill=(255, 255, 255, 245))
    cel.colar(cam, masc)
    d = ImageDraw.Draw(cel.img)
    # linha dos cílios em cima (mais grossa no canto de fora) e linha fina embaixo
    vis = [(x, topo(x)) for x in xs if topo(x) <= base(x) + 0.01]
    if len(vis) > 2:
        if dentro > 0:
            vis_o = vis
        else:
            vis_o = vis[::-1]
        d.polygon(cel.p(tracado(vis_o, 3.4, 1.6)), fill=cil)  # do canto de fora para o de dentro
        fx, fy = vis_o[0]
        d.polygon(cel.p(tracado([(fx + dentro * 1.0, fy + 0.4), (fx - dentro * 3.8, fy - 2.6)], 2.8, 0.5)), fill=cil)
    baixo = [(x, base(x)) for x in xs[8:-8] if topo(x) <= base(x)]
    if len(baixo) > 2:
        d.line(cel.p(baixo), fill=R["cilio_cor"] + (120,), width=max(1, int(0.9 * cel.k)))


QUADROS_OLHOS = [
    ("aberto", dict()),
    ("olhar_esquerda", dict(olhar=(-0.75, 0.05))),
    ("olhar_direita", dict(olhar=(0.75, 0.05))),
    ("olhar_cima", dict(olhar=(0.0, -0.7), ab_sup=1.0)),
    ("olhar_baixo", dict(olhar=(0.0, 0.5), ab_sup=0.62)),
    ("meio_fechado", dict(ab_sup=0.42, olhar=(0, 0.25))),
    ("fechado", dict(fechado="normal")),
    ("feliz", dict(fechado="feliz")),
    ("bravo", dict(incl=0.55, ab_sup=0.85, pupila=0.9)),
    ("triste", dict(incl=-0.45, ab_sup=0.8, olhar=(0, 0.25))),
    ("surpreso", dict(arregalado=1.0, pupila=0.7)),
    ("piscadinha", None),  # especial: um aberto, outro fechado
]

QUADROS_SOBR = [
    ("neutra", dict()),
    ("alta", dict(altura=5.5, arco=1.6)),
    ("brava", dict(dentro=-5.0, fora=2.0, arco=-0.5)),
    ("triste", dict(dentro=4.5, fora=-2.5, arco=0.4)),
    ("desconfiada", "assimetrica"),
    ("feliz", dict(altura=2.5, arco=1.0)),
]


def sobrancelha(cel, s, altura=0.0, dentro=0.0, fora=0.0, arco=0.0):
    """altura sobe tudo (mm); dentro/fora sobem (+) ou descem (-) cada ponta; arco aumenta a curva."""
    xi = R["centro_x"] + s * R["sobr_int"]
    xe = R["centro_x"] + s * R["sobr_ext"]
    pi_, pe_ = cel.mm(xi, R["sobr_z"] - 0.003), cel.mm(xe, R["sobr_z"] - 0.004)
    pts = []
    n = 30
    for i in range(n):
        t = i / (n - 1)
        x = pi_[0] + (pe_[0] - pi_[0]) * t
        y = pi_[1] + (pe_[1] - pi_[1]) * t
        y -= (5.5 + arco * 2.2) * math.sin(math.pi * min(1, t * 1.15))  # arco com pico perto de 45%
        y -= altura + dentro * (1 - t) + fora * t
        pts.append((x, y))
    d = ImageDraw.Draw(cel.img)
    d.polygon(cel.p(tracado(pts, 10.0, 4.2)), fill=R["sobr_cor"] + (255,))
    r = 5.0 * cel.k
    x0, y0 = pts[0][0] * cel.k, pts[0][1] * cel.k
    d.ellipse((x0 - r, y0 - r, x0 + r, y0 + r), fill=R["sobr_cor"] + (255,))


# ---- boca
CONTORNO = (30, 10, 6)
INTERIOR = (86, 26, 26)
DENTE = (247, 244, 238)
LINGUA = (196, 92, 100)
LABIO = (204, 128, 108)


def boca(cel, largura=24.0, abertura=0.0, canto=0.0, curva_sup=0.0, dentes_sup=0.0, dentes_inf=0.0, lingua=False,
         elipse_=None, covinha=False, espessura=3.2):
    cx, cy = cel.mm(R["boca_x"], R["boca_z"])
    d = ImageDraw.Draw(cel.img)
    w = largura
    if elipse_:
        rx, ry = elipse_
        reg = [(cx + rx * math.cos(2 * math.pi * i / 60), cy + ry * math.sin(2 * math.pi * i / 60)) for i in range(60)]
        top = lambda x: cy - ry * math.sqrt(max(0, 1 - ((x - cx) / rx) ** 2))  # noqa: E731
        bot = lambda x: cy + ry * math.sqrt(max(0, 1 - ((x - cx) / rx) ** 2))  # noqa: E731
        x0, x1 = cx - rx, cx + rx
    else:
        def top(x):
            u = (x - cx) / w
            return cy + canto * u * u - curva_sup * (1 - u * u)

        def bot(x):
            u = (x - cx) / w
            return cy + canto * u * u + abertura * max(0, 1 - u * u) ** 0.9

        x0, x1 = cx - w, cx + w
        xs = [x0 + (x1 - x0) * i / 59 for i in range(60)]
        reg = [(x, top(x)) for x in xs] + [(x, bot(x)) for x in reversed(xs)]
    if abertura > 0 or elipse_:
        masc = cel.mascara()
        ImageDraw.Draw(masc).polygon(cel.p(reg), fill=255)
        cam = cel.camada()
        dc = ImageDraw.Draw(cam)
        dc.rectangle((0, 0, cel.cw, cel.ch), fill=INTERIOR + (255,))
        xs2 = [x0 + (x1 - x0) * i / 59 for i in range(60)]
        if lingua:
            ly = max(bot(cx) - 3.5, cy)
            dc.ellipse(((cx - w * 0.5) * cel.k, (ly - 2) * cel.k, (cx + w * 0.5) * cel.k, (ly + 9) * cel.k), fill=LINGUA + (255,))
        if dentes_sup:
            pts = [(x, top(x) - 2) for x in xs2] + [(x, top(x) + dentes_sup) for x in reversed(xs2)]
            dc.polygon(cel.p(pts), fill=DENTE + (255,))
            dc.line(cel.p([(x, top(x) + dentes_sup) for x in xs2]), fill=(205, 196, 190, 255), width=int(0.6 * cel.k))
        if dentes_inf:
            pts = [(x, bot(x) - dentes_inf) for x in xs2] + [(x, bot(x) + 2) for x in reversed(xs2)]
            dc.polygon(cel.p(pts), fill=DENTE + (255,))
        cel.colar(cam, masc)
        d = ImageDraw.Draw(cel.img)
        d.line(cel.p(reg + [reg[0]]), fill=CONTORNO + (255,), width=int(1.8 * cel.k), joint="curve")
        # lábio de baixo: brilho suave logo abaixo da abertura
        lb = [(x, bot(x) + 3.0) for x in [cx - (x1 - cx) * 0.55 + (x1 - cx) * 1.1 * i / 19 for i in range(20)]]
        d.polygon(cel.p(tracado(lb, 3.0, 3.0)), fill=LABIO + (235,))
    else:
        xs = [x0 + (x1 - x0) * i / 39 for i in range(40)]
        linha = [(x, top(x)) for x in xs]
        d.polygon(cel.p(tracado(linha, espessura, espessura)), fill=CONTORNO + (255,))
        for p_ in (linha[0], linha[-1]):
            r = espessura / 2 * cel.k
            d.ellipse((p_[0] * cel.k - r, p_[1] * cel.k - r, p_[0] * cel.k + r, p_[1] * cel.k + r), fill=CONTORNO + (255,))
        lb = [(x, top(x) + 4.2 + 1.2 * (1 - ((x - cx) / (w * 0.5)) ** 2)) for x in
              [cx - w * 0.5 + w * i / 19 for i in range(20)]]
        d.polygon(cel.p(tracado(lb, 3.0, 3.0)), fill=LABIO + (235,))
    if covinha:
        for s in (-1, 1):
            xe = cx + s * (w + 1.0)
            ye = top(cx + s * w * 0.999)
            pts = [(xe - s * 0.5, ye - 2.2), (xe + s * 1.2, ye), (xe - s * 0.3, ye + 2.4)]
            d.line(cel.p(pts), fill=CONTORNO + (220,), width=int(1.3 * cel.k), joint="curve")


QUADROS_BOCA = [
    ("neutra", dict(largura=22, canto=-1.5)),
    ("sorriso", dict(largura=28, canto=-6.5, covinha=True)),
    ("sorrisao", dict(largura=32, abertura=14, canto=-7.5, curva_sup=-1.0, dentes_sup=7.0, lingua=True)),
    ("fala_a", dict(largura=19, abertura=17, canto=-1.0, dentes_sup=4.0, lingua=True)),
    ("fala_e", dict(largura=26, abertura=8, canto=-2.5, dentes_sup=4.5, dentes_inf=2.5)),
    ("fala_o", dict(elipse_=(10.5, 12.0), dentes_sup=3.0, lingua=True)),
    ("fala_u", dict(elipse_=(6.5, 6.0))),
    ("fala_m", dict(largura=19, canto=-0.5, espessura=4.4)),
    ("fala_f", dict(largura=21, abertura=5, canto=-1.0, dentes_sup=5.0)),
    ("brava", dict(largura=24, abertura=7, canto=5.0, curva_sup=0.5, dentes_sup=3.5, dentes_inf=3.5)),
    ("triste", dict(largura=19, canto=5.5)),
    ("surpresa", dict(elipse_=(9.0, 13.5), lingua=True)),
]


def atlas(peca, quadros, desenhar):
    cx, cz, w, h, cols, rows, cw, chh = PECAS[peca]
    folha = Image.new("RGBA", (cw * cols, chh * rows), (0, 0, 0, 0))
    tabela = {}
    for k, (nome, par) in enumerate(quadros):
        cel = Celula(peca)
        cel.peca_nome = peca
        desenhar(cel, par)
        c, r = k % cols, k // cols
        folha.paste(cel.final(), (c * cw, r * chh))
        tabela[nome] = [c, r]
    caminho = os.path.join(OUT, f"{PID}_{peca}.png")
    folha.save(caminho)
    return caminho, tabela


def des_olhos(cel, par):
    if par is None:
        olho(cel, -1, fechado="normal")
        olho(cel, 1, ab_inf=0.18)
        return
    for s in (-1, 1):
        olho(cel, s, **par)


def des_sobr(cel, par):
    if par == "assimetrica":
        sobrancelha(cel, -1, dentro=-2.5, fora=-1.0)
        sobrancelha(cel, 1, altura=4.5, arco=1.4)
        return
    for s in (-1, 1):
        sobrancelha(cel, s, **par)


def des_boca(cel, par):
    boca(cel, **par)


TABELA = {}
ARQ = {}
for peca, quadros, fn in (("olhos", QUADROS_OLHOS, des_olhos), ("sobrancelhas", QUADROS_SOBR, des_sobr),
                          ("boca", QUADROS_BOCA, des_boca)):
    ARQ[peca], TABELA[peca] = atlas(peca, quadros, fn)


# ------------------------------------------------------------------ 3. malhas das peças
def malha_peca(peca, frente_extra):
    cx, cz, w, h, cols, rows, cw, chh = PECAS[peca]
    nu, nv = 20, 10
    xmin, zmax = cx - w / 2, cz + h / 2
    ys = np.full((nv + 1, nu + 1), np.nan)
    for j in range(nv + 1):
        for i in range(nu + 1):
            x, z = xmin + w * i / nu, zmax - h * j / nv
            loc, nor, idx, dist = bvh.ray_cast(Vector((x, -1.0, z)), Vector((0, 1, 0)))
            if loc is not None:
                ys[j, i] = loc.y
    # superfície lisa (quadrática) que passa por cima de cavidades (olhos fundos, boca aberta)
    U, V = np.meshgrid(np.linspace(-1, 1, nu + 1), np.linspace(-1, 1, nv + 1))
    ok = ~np.isnan(ys)
    A = np.stack([np.ones_like(U), U, V, U * U, V * V, U * V], -1)
    coef, *_ = np.linalg.lstsq(A[ok], ys[ok], rcond=None)
    fit = A @ coef
    alvo = np.where(ok, np.minimum(fit, ys), fit)
    for _ in range(4):  # suaviza sem deixar entrar na pele
        m = alvo.copy()
        m[1:-1, 1:-1] = (alvo[:-2, 1:-1] + alvo[2:, 1:-1] + alvo[1:-1, :-2] + alvo[1:-1, 2:] + 4 * alvo[1:-1, 1:-1]) / 8
        alvo = np.where(ok, np.minimum(m, ys), m)
    alvo -= 0.0015 + frente_extra
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new()
    vv = [[bm.verts.new((xmin + w * i / nu, alvo[j, i], zmax - h * j / nv)) for i in range(nu + 1)] for j in range(nv + 1)]
    for j in range(nv):
        for i in range(nu):
            f = bm.faces.new((vv[j][i], vv[j + 1][i], vv[j + 1][i + 1], vv[j][i + 1]))
            for loop, (a, b) in zip(f.loops, ((i, j), (i, j + 1), (i + 1, j + 1), (i + 1, j))):
                # UV do quadro (0,0) do atlas; o jogo desloca para os outros quadros
                loop[uvl].uv = (a / nu / cols, 1 - (b / nv) / rows)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:  # normais para a frente (-y)
        if f.normal.y > 0:
            f.normal_flip()
    m_ = bpy.data.meshes.new(f"{PID}_{peca}")
    bm.to_mesh(m_)
    bm.free()
    o = bpy.data.objects.new(f"{PID}_{peca}", m_)
    bpy.context.scene.collection.objects.link(o)
    for p_ in m_.polygons:
        p_.use_smooth = True
    # material: atlas com transparência; o nó Mapping só serve para as prévias no Blender
    mat = bpy.data.materials.new(f"{PID}_{peca}")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Roughness"].default_value = 0.45 if peca == "olhos" else 0.7
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.4 if peca == "olhos" else 0.2
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(ARQ[peca])
    tex.image.name = f"{PID}_{peca}"
    tex.interpolation = "Linear"
    tex.extension = "CLIP"
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
    if hasattr(mat, "surface_render_method"):
        mat.surface_render_method = "BLENDED"
    if hasattr(mat, "blend_method"):
        mat.blend_method = "BLEND"
    mat.use_backface_culling = True
    m_.materials.append(mat)
    o.vertex_groups.new(name=P + "Head").add(list(range(len(m_.vertices))), 1.0, "REPLACE")
    o.parent = arm
    o.matrix_parent_inverse = arm.matrix_world.inverted()
    o.modifiers.new("Esqueleto", "ARMATURE").object = arm
    return o


pecas = {"olhos": malha_peca("olhos", 0.0), "sobrancelhas": malha_peca("sobrancelhas", 0.0006),
         "boca": malha_peca("boca", 0.0)}

arm.data.pose_position = "POSE"
info = {p: dict(colunas=PECAS[p][4], linhas=PECAS[p][5], quadros=TABELA[p], objeto=f"{PID}_{p}") for p in PECAS}
with open(os.path.join(OUT, f"{PID}_rosto.json"), "w") as f:
    json.dump(info, f, ensure_ascii=False, indent=1)
tri = sum(len(o.data.polygons) * 2 for o in pecas.values())
print("peças do rosto", {k: v.name for k, v in pecas.items()}, "triângulos extras", tri)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, f"{PID}_rosto.blend"))
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, f"{PID}.glb"), export_format="GLB", export_animations=True,
                          export_animation_mode="NLA_TRACKS", export_image_format="WEBP", export_apply=False)
print("ok")
