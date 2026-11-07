"""Portas, janelas, batentes e acabamentos da biblioteca de construção, feitos aqui com as imagens da vitrine de portas
e janelas como norte (não são cópias). Cada peça encaixa num vão das paredes de construcao.py.

Janelas (38): 12 desenhos × 3 cores (branca, preta, madeira) + óculo redondo (branco e preto).
  - largas (vão 1,60 × 0,80, "janela_larga_2m"): inteira, grade 6 × 2, grade 3 × 2, bandeira (3 em cima, 3 embaixo);
  - em arco (vão 0,80 × 1,20, "janela_arco_2m"): duas folhas, inteira, 2 × 3, 2 × 5;
  - quadradas (vão 1,20 × 1,10, "janela_2m"): inteira, bandeira, cruz 2 × 2, duas folhas;
  - óculo (vão 0,60 × 0,60, "janela_quadrada_1m").
Portas e acabamentos (57):
  - portas (30): 10 desenhos × 3 cores (vão 0,90 × 2,10, "porta_2m"; a de arco no "arco_2m");
  - portas duplas (9): 3 desenhos × 3 cores (vão 1,60 × 2,10, "porta_dupla_2m");
  - batentes (9): simples, duplo e em arco × 3 cores;
  - lambris (6): 1 m e 0,5 m × 3 cores; cantoneiras de lambri (3).
Materiais: "cor" (a cor da peça; a página troca por qualquer cor), "vidro", "metal" (maçanetas), "friso" (frisos
escuros das portas modernas). Origem: o meio do vão, no chão, no plano do meio da parede (y = 0); x ao longo da parede.

Uso: blender-venv/bin/python -I portas_janelas.py -- <pasta da construcao>  (grava pecas/*.glb e portas_janelas.json)
"""
import json
import math
import os
import sys

import bpy
import bmesh
from mathutils import Vector

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import construcao as C  # noqa: E402

V = Vector
ESP = C.ESP
CORES = {"branca": ("Branca", "#F3F4F6", 0.45), "preta": ("Preta", "#2B2E34", 0.5), "madeira": ("Madeira", "#7A4A31", 0.6)}
MAT_IDX = {"cor": 0, "vidro": 1, "metal": 2, "friso": 3}


# ------------------------------------------------------------------ geometria
class Peca:
    def __init__(self):
        self.bm = bmesh.new()

    def _junta(self, t, mat):
        vm = {v: self.bm.verts.new(v.co) for v in t.verts}
        for f in t.faces:
            try:
                nf = self.bm.faces.new([vm[v] for v in f.verts])
                nf.material_index = MAT_IDX[mat]
            except ValueError:
                pass
        t.free()

    def caixa(self, x0, x1, y0, y1, z0, z1, mat="cor", bisel=0.0):
        t = bmesh.new()
        r = bmesh.ops.create_cube(t, size=1.0)
        for v in r["verts"]:
            v.co = V(((x0 + x1) / 2 + v.co.x * (x1 - x0), (y0 + y1) / 2 + v.co.y * (y1 - y0), (z0 + z1) / 2 + v.co.z * (z1 - z0)))
        if bisel > 0:
            b = min(bisel, (x1 - x0) / 2.2, (z1 - z0) / 2.2, (y1 - y0) / 2.2)
            bmesh.ops.bevel(t, geom=t.edges[:], offset=b, segments=1, affect="EDGES")
        self._junta(t, mat)

    def anel(self, fora, dentro, y0, y1, mat="cor", fechado=True):
        """Moldura entre dois contornos (listas de (x, z) com o mesmo número de pontos), de y0 a y1."""
        n = len(fora)
        F0 = [self.bm.verts.new((x, y0, z)) for x, z in fora]
        F1 = [self.bm.verts.new((x, y1, z)) for x, z in fora]
        D0 = [self.bm.verts.new((x, y0, z)) for x, z in dentro]
        D1 = [self.bm.verts.new((x, y1, z)) for x, z in dentro]
        fs = []
        segs = range(n) if fechado else range(n - 1)
        for i in segs:
            j = (i + 1) % n
            for q in ((F0[i], F0[j], D0[j], D0[i]), (F1[j], F1[i], D1[i], D1[j]), (F0[j], F0[i], F1[i], F1[j]),
                      (D0[i], D0[j], D1[j], D1[i])):
                try:
                    fs.append(self.bm.faces.new(q))
                except ValueError:
                    pass
        if not fechado:  # tampas nas duas pontas
            for i in (0, n - 1):
                try:
                    fs.append(self.bm.faces.new((F0[i], D0[i], D1[i], F1[i])))
                except ValueError:
                    pass
        for f in fs:
            f.material_index = MAT_IDX[mat]
        return fs

    def placa(self, contorno, y0, y1, mat="vidro"):
        """Placa (vidro) com o contorno dado (convexo ou em arco), de y0 a y1."""
        vs0 = [self.bm.verts.new((x, y0, z)) for x, z in contorno]
        vs1 = [self.bm.verts.new((x, y1, z)) for x, z in contorno]
        fs = [self.bm.faces.new(vs0[::-1]), self.bm.faces.new(vs1)]
        n = len(contorno)
        for i in range(n):
            j = (i + 1) % n
            fs.append(self.bm.faces.new((vs0[i], vs0[j], vs1[j], vs1[i])))
        for f in fs:
            f.material_index = MAT_IDX[mat]
        return fs

    def cilindro(self, centro, raio, comp, eixo="y", mat="metal", seg=16):
        r = bmesh.ops.create_cone(self.bm, cap_ends=True, segments=seg, radius1=raio, radius2=raio, depth=comp)
        for v in r["verts"]:
            c = v.co.copy()
            if eixo == "y":
                c = V((c.x, c.z, c.y))
            elif eixo == "x":
                c = V((c.z, c.y, c.x))
            v.co = V(centro) + c
        for f in {f for v in r["verts"] for f in v.link_faces}:
            f.material_index = MAT_IDX[mat]

    def esfera(self, centro, raio, mat="metal", esc=(1, 1, 1)):
        r = bmesh.ops.create_uvsphere(self.bm, u_segments=14, v_segments=8, radius=raio)
        for v in r["verts"]:
            v.co = V(centro) + V((v.co.x * esc[0], v.co.y * esc[1], v.co.z * esc[2]))
        for f in {f for v in r["verts"] for f in v.link_faces}:
            f.material_index = MAT_IDX[mat]


def contorno(larg, alt, z0=0.0, arco=False, seg=24, aberto=False):
    """Contorno de um vão (sentido anti-horário a partir do canto de baixo à esquerda). Com arco, o alto é um
    semicírculo de raio larg/2. aberto=True: sem o lado de baixo (batente)."""
    x0, x1 = -larg / 2, larg / 2
    if not arco:
        pts = [(x0, z0), (x1, z0), (x1, z0 + alt), (x0, z0 + alt)]
    else:
        r = larg / 2
        zc = z0 + alt - r
        pts = [(x0, z0), (x1, z0), (x1, zc)] + [(r * math.cos(math.pi * k / seg), zc + r * math.sin(math.pi * k / seg))
                                                for k in range(1, seg)] + [(x0, zc)]
    if aberto:  # do pé esquerdo, subindo, até o pé direito
        pts = [pts[0]] + pts[3:][::-1] + [pts[2], pts[1]] if not arco else [pts[0], pts[-1]] + pts[3:-1][::-1] + [pts[2], pts[1]]
        pts = pts if not arco else [(x0, z0), (x0, zc)] + [(r * math.cos(math.pi * k / seg), zc + r * math.sin(math.pi * k / seg)) for k in range(seg - 1, 0, -1)] + [(x1, zc), (x1, z0)]
        if not arco:
            pts = [(x0, z0), (x0, z0 + alt), (x1, z0 + alt), (x1, z0)]
    return pts


def recua(pts, d, larg, alt, z0, arco):
    """O mesmo contorno, d para dentro (retângulo: lados; arco: raio menor, mesmo centro)."""
    x0, x1 = -larg / 2 + d, larg / 2 - d
    if not arco:
        return [(max(min(x, x1), x0), max(min(z, z0 + alt - d), z0 + d)) for x, z in pts]
    r = larg / 2
    zc = z0 + alt - r
    out = []
    for x, z in pts:
        if z > zc + 1e-6:
            a = math.atan2(z - zc, x)
            out.append(((r - d) * math.cos(a), zc + (r - d) * math.sin(a)))
        else:
            out.append((x0 if x < 0 else x1, max(z, z0 + d) if z < z0 + 1e-6 else z))
    return out


def largura_em(z, larg, alt, z0, arco, d=0.0):
    """Meia largura útil do contorno recuado d na altura z."""
    if not arco:
        return larg / 2 - d
    r = larg / 2 - d
    zc = z0 + alt - larg / 2
    if z <= zc:
        return r
    dz = z - zc
    return math.sqrt(max(r * r - dz * dz, 0.0))


# ------------------------------------------------------------------ janelas
JANELAS = [
    # (id, rótulo, vão (peça, índice), larg, alt, peitoril, arco, grade: (colunas, linhas) ou "bandeira:h" / "folhas")
    ("larga_inteira", "Janela larga inteira", ("janela_larga_2m", 0), 1.6, 0.8, 1.1, False, (1, 1)),
    ("larga_grade_6x2", "Janela larga 6 × 2", ("janela_larga_2m", 0), 1.6, 0.8, 1.1, False, (6, 2)),
    ("larga_grade_3x2", "Janela larga 3 × 2", ("janela_larga_2m", 0), 1.6, 0.8, 1.1, False, (3, 2)),
    ("larga_bandeira", "Janela larga com bandeira", ("janela_larga_2m", 0), 1.6, 0.8, 1.1, False, ("bandeira", 3, 0.72)),
    ("arco_folhas", "Janela em arco de duas folhas", ("janela_arco_2m", 0), 0.8, 1.2, 1.0, True, (2, 1)),
    ("arco_inteira", "Janela em arco inteira", ("janela_arco_2m", 0), 0.8, 1.2, 1.0, True, (1, 1)),
    ("arco_2x3", "Janela em arco 2 × 3", ("janela_arco_2m", 0), 0.8, 1.2, 1.0, True, (2, 3)),
    ("arco_2x5", "Janela em arco 2 × 5", ("janela_arco_2m", 0), 0.8, 1.2, 1.0, True, (2, 5)),
    ("quadrada_inteira", "Janela quadrada inteira", ("janela_2m", 0), 1.2, 1.1, 0.9, False, (1, 1)),
    ("quadrada_bandeira", "Janela quadrada com bandeira", ("janela_2m", 0), 1.2, 1.1, 0.9, False, ("bandeira", 1, 0.8)),
    ("quadrada_cruz", "Janela quadrada em cruz", ("janela_2m", 0), 1.2, 1.1, 0.9, False, (2, 2)),
    ("quadrada_folhas", "Janela quadrada de duas folhas", ("janela_2m", 0), 1.2, 1.1, 0.9, False, (2, 1)),
]
MOLD = 0.075       # largura da moldura vista de frente (dentro do vão)
SOBRA = 0.035      # quanto a moldura passa da borda do vão, nos dois lados da parede
PROF = ESP / 2 + 0.03  # meia profundidade da moldura (passa 3 cm de cada face)
BARRA = 0.028      # largura das travessas


def janela(larg, alt, peit, arco, grade):
    p = Peca()
    L, A, Z = larg + 2 * SOBRA, alt + 2 * SOBRA, peit - SOBRA
    fora = contorno(L, A, Z, arco)
    dentro = recua(fora, MOLD + SOBRA, L, A, Z, arco)
    d2 = recua(fora, MOLD + SOBRA + 0.012, L, A, Z, arco)
    p.anel(fora, dentro, -PROF, PROF)
    p.anel(dentro, d2, -0.02, 0.02)  # batente fino: o vidro fica recuado no meio
    p.placa(d2, -0.006, 0.006, "vidro")
    # travessas
    zi0, zi1 = peit + MOLD, peit + alt - MOLD
    meia = larg / 2 - MOLD
    b = BARRA / 2

    def vertical(x):
        topo = zi1 if not arco else peit + alt - larg / 2 + math.sqrt(max((larg / 2 - MOLD) ** 2 - x * x, 0))
        p.caixa(x - b, x + b, -0.016, 0.016, zi0, topo, bisel=0.004)

    def horizontal(z, x0=-meia, x1=meia):
        if arco:
            m = largura_em(z, larg, alt, peit, arco, MOLD)
            x0, x1 = max(x0, -m), min(x1, m)
        p.caixa(x0, x1, -0.016, 0.016, z - b, z + b, bisel=0.004)
    if isinstance(grade[0], str):  # bandeira: uma travessa alta e colunas
        _, cols, frac = grade
        zb = zi0 + (zi1 - zi0) * frac
        horizontal(zb)
        for k in range(1, cols):
            x = -meia + 2 * meia * k / cols
            vertical(x)
    else:
        cols, lins = grade
        for k in range(1, cols):
            vertical(-meia + 2 * meia * k / cols)
        alt_uteis = (zi1 - zi0) if not arco else (peit + alt - larg / 2 - zi0) + (larg / 2 - MOLD) * 0.75
        for k in range(1, lins):
            horizontal(zi0 + alt_uteis * k / lins)
    return p


def oculo():
    p = Peca()
    seg = 40
    c = 1.2 + 0.3  # centro: peitoril 1,2 + meia altura 0,3 (vão da janela quadrada de 1 m)

    def circ(r):
        return [(r * math.cos(2 * math.pi * k / seg), c + r * math.sin(2 * math.pi * k / seg)) for k in range(seg)]
    p.anel(circ(0.45), circ(0.29), -PROF, PROF)
    p.anel(circ(0.29), circ(0.27), -0.02, 0.02)
    p.placa(circ(0.27), -0.006, 0.006, "vidro")
    p.caixa(-BARRA / 2, BARRA / 2, -0.016, 0.016, c - 0.28, c + 0.28, bisel=0.004)
    p.caixa(-0.28, 0.28, -0.016, 0.016, c - BARRA / 2, c + BARRA / 2, bisel=0.004)
    return p


# ------------------------------------------------------------------ portas
T = 0.042           # espessura da folha
FOLGA = 0.02        # do vão até a folha (o batente cobre)


def macaneta(p, x, lado):
    """Maçaneta de alavanca dos dois lados, a 1 m do chão; lado: +1 (fechadura à direita) ou −1."""
    for s in (-1, 1):
        y = s * (T / 2 + 0.004)
        p.cilindro((x, y, 1.0), 0.028, 0.008, "y", seg=20)  # roseta
        p.cilindro((x, s * (T / 2 + 0.025), 1.0), 0.009, 0.042, "y", seg=12)  # haste
        p.caixa(x - lado * 0.12 if lado > 0 else x, x if lado > 0 else x - lado * 0.12, s * (T / 2 + 0.04) - 0.009,
                s * (T / 2 + 0.04) + 0.009, 1.0 - 0.009, 1.0 + 0.009, "metal", bisel=0.006)
        p.esfera((x - lado * 0.12, s * (T / 2 + 0.04), 1.0), 0.0105, "metal")
        p.cilindro((x, s * (T / 2 + 0.003), 0.9), 0.012, 0.006, "y", seg=14)  # espelho da chave


def painel(p, x0, x1, z0, z1):
    """Almofada: o miolo rebaixado entre as travessas, com a almofada chanfrada no meio (dos dois lados)."""
    p.caixa(x0, x1, -T / 2 + 0.008, T / 2 - 0.008, z0, z1)
    m = 0.03
    if x1 - x0 > 2.2 * m and z1 - z0 > 2.2 * m:
        p.caixa(x0 + m, x1 - m, -T / 2 - 0.002, T / 2 + 0.002, z0 + m, z1 - m, bisel=0.018)


def vidros(p, x0, x1, z0, z1, cols, lins):
    p.placa([(x0, z0), (x1, z0), (x1, z1), (x0, z1)], -0.005, 0.005, "vidro")
    b = 0.014
    for k in range(1, cols):
        x = x0 + (x1 - x0) * k / cols
        p.caixa(x - b, x + b, -T / 2 + 0.01, T / 2 - 0.01, z0, z1, bisel=0.004)
    for k in range(1, lins):
        z = z0 + (z1 - z0) * k / lins
        p.caixa(x0, x1, -T / 2 + 0.01, T / 2 - 0.01, z - b, z + b, bisel=0.004)
    # baguete em volta do vidro
    for (a0, a1, c0, c1) in ((x0, x1, z0, z0 + 0.012), (x0, x1, z1 - 0.012, z1), (x0, x0 + 0.012, z0, z1), (x1 - 0.012, x1, z0, z1)):
        p.caixa(a0, a1, -T / 2 + 0.004, T / 2 - 0.004, c0, c1)


def folha(desenho, X0, X1, Z1, lado=1, arco=False):
    """Folha de porta de X0 a X1 (x), do chão (folga 1 cm) até Z1. lado: onde fica a maçaneta (+1 à direita)."""
    p = Peca()
    z0 = 0.01
    w = X1 - X0
    mont, trav_c, trav_b, trav_m = 0.11, 0.11, 0.2, 0.1
    if desenho in ("ripas", "frisos_vidro", "faixa"):  # modernas: folha lisa
        if desenho == "frisos_vidro":
            fendas = [(0.32 + 0.37 * k, 0.32 + 0.37 * k + 0.09) for k in range(5)]
            fendas = [(z0 + Z1 * a / 2.1, z0 + Z1 * bb / 2.1) for a, bb in fendas]
            xa, xb = X0 + 0.16, X1 - 0.16
            p.caixa(X0, xa, -T / 2, T / 2, z0, Z1, bisel=0.003)
            p.caixa(xb, X1, -T / 2, T / 2, z0, Z1, bisel=0.003)
            zs = [z0] + [v for f in fendas for v in f] + [Z1]
            for a, bb in zip(zs[0::2], zs[1::2]):
                p.caixa(xa, xb, -T / 2, T / 2, a, bb)
            for a, bb in fendas:
                p.placa([(xa, a), (xb, a), (xb, bb), (xa, bb)], -0.005, 0.005, "vidro")
        else:
            p.caixa(X0, X1, -T / 2, T / 2, z0, Z1, bisel=0.003)
            if desenho == "ripas":  # frisos horizontais a cada 13 cm
                n = int((Z1 - z0) / 0.13)
                for k in range(1, n):
                    z = z0 + (Z1 - z0) * k / n
                    for s in (-1, 1):
                        p.caixa(X0 + 0.02, X1 - 0.02, s * T / 2 - 0.0015, s * T / 2 + 0.0015, z - 0.004, z + 0.004, "friso")
            else:  # faixa vertical escura do lado da fechadura e frisos curtos do outro
                xf = X1 - 0.13 if lado > 0 else X0 + 0.13
                for s in (-1, 1):
                    p.caixa(xf - 0.022, xf + 0.022, s * T / 2 - 0.002, s * T / 2 + 0.002, z0, Z1, "friso")
                    for k in range(6):
                        z = z0 + (Z1 - z0) * (0.15 + 0.14 * k)
                        xa = X0 + 0.06 if lado > 0 else X1 - 0.3
                        p.caixa(xa, xa + 0.24, s * T / 2 - 0.0015, s * T / 2 + 0.0015, z - 0.005, z + 0.005, "friso")
        macaneta(p, X1 - 0.065 if lado > 0 else X0 + 0.065, lado)
        return p
    if arco:  # porta em arco: moldura no contorno, vidro em cima, duas almofadas embaixo
        lg, al = w, Z1 - z0
        fora = contorno(lg, al, z0, True)
        fora = [(x + (X0 + X1) / 2, z) for x, z in fora]
        dentro = recua(contorno(lg, al, z0, True), mont, lg, al, z0, True)
        dentro = [(x + (X0 + X1) / 2, max(z, z0 + trav_b) if z < z0 + mont + 1e-3 else z) for x, z in dentro]
        p.anel(fora, dentro, -T / 2, T / 2)
        zr = z0 + al * 0.5
        cx = (X0 + X1) / 2
        p.caixa(X0 + mont, X1 - mont, -T / 2, T / 2, zr - trav_m / 2, zr + trav_m / 2)
        topo = [(x, z) for x, z in dentro if z >= zr + trav_m / 2]
        vid = [(X0 + mont, zr + trav_m / 2), (X1 - mont, zr + trav_m / 2)] + [(x, z) for x, z in topo if z > zr + trav_m / 2 + 1e-3]
        vid = sorted(vid[2:], key=lambda q: -math.atan2(q[1] - (z0 + al - lg / 2), q[0] - cx)) if False else vid
        p.placa(vid, -0.005, 0.005, "vidro")
        r_in = lg / 2 - mont
        zc = z0 + al - lg / 2
        p.caixa(cx - 0.014, cx + 0.014, -T / 2 + 0.01, T / 2 - 0.01, zr + trav_m / 2, zc + r_in, bisel=0.004)
        zh = zr + trav_m / 2 + (zc - zr) * 0.6
        p.caixa(cx - r_in, cx + r_in, -T / 2 + 0.01, T / 2 - 0.01, zh - 0.014, zh + 0.014, bisel=0.004)
        for a, bb in ((X0 + mont, cx - 0.04), (cx + 0.04, X1 - mont)):
            painel(p, a, bb, z0 + trav_b, zr - trav_m / 2)
        p.caixa(cx - 0.04, cx + 0.04, -T / 2, T / 2, z0 + trav_b, zr - trav_m / 2)
        macaneta(p, X1 - 0.07 if lado > 0 else X0 + 0.07, lado)
        return p
    # clássicas e de vidro: montantes, travessas e o miolo
    if desenho in ("vidro_inteiro", "vidro_10"):
        mont = trav_c = 0.1
    xi0, xi1 = X0 + mont, X1 - mont
    p.caixa(X0, xi0, -T / 2, T / 2, z0, Z1, bisel=0.003)
    p.caixa(xi1, X1, -T / 2, T / 2, z0, Z1, bisel=0.003)
    p.caixa(xi0, xi1, -T / 2, T / 2, Z1 - trav_c, Z1)
    p.caixa(xi0, xi1, -T / 2, T / 2, z0, z0 + trav_b)
    zi0, zi1 = z0 + trav_b, Z1 - trav_c

    def faixas(fracs):  # divide o miolo em faixas de baixo para cima com travessas entre elas
        H = zi1 - zi0 - trav_m * (len(fracs) - 1)
        z, out = zi0, []
        for k, f in enumerate(fracs):
            out.append((z, z + H * f))
            z += H * f
            if k < len(fracs) - 1:
                p.caixa(xi0, xi1, -T / 2, T / 2, z, z + trav_m)
                z += trav_m
        return out
    if desenho == "vidro_6":
        (a, bb), (c, d) = faixas([0.32, 0.68])
        painel(p, xi0, xi1, a, bb)
        vidros(p, xi0, xi1, c, d, 2, 3)
    elif desenho == "classica_2":
        (a, bb), (c, d) = faixas([0.32, 0.68])
        painel(p, xi0, xi1, a, bb)
        painel(p, xi0, xi1, c, d)
    elif desenho == "classica_4":
        fx = faixas([0.36, 0.64])
        xm = (xi0 + xi1) / 2
        for a, bb in fx:  # o montante do meio só entre as travessas (sobreposto a elas dava faces coincidentes)
            p.caixa(xm - 0.045, xm + 0.045, -T / 2, T / 2, a, bb)
            painel(p, xi0, xm - 0.045, a, bb)
            painel(p, xm + 0.045, xi1, a, bb)
    elif desenho == "classica_5":
        for a, bb in faixas([0.2] * 5):
            painel(p, xi0, xi1, a, bb)
    elif desenho == "vidro_inteiro":
        vidros(p, xi0, xi1, zi0, zi1, 1, 1)
    elif desenho == "vidro_10":
        vidros(p, xi0, xi1, zi0, zi1, 2, 5)
    macaneta(p, X1 - 0.065 if lado > 0 else X0 + 0.065, lado)
    return p


PORTAS = [  # (desenho, rótulo)
    ("vidro_6", "Porta clássica com 6 vidros"), ("classica_2", "Porta clássica de 2 almofadas"),
    ("classica_4", "Porta clássica de 4 almofadas"), ("classica_5", "Porta clássica de 5 almofadas"),
    ("vidro_inteiro", "Porta de vidro inteiro"), ("vidro_10", "Porta com 10 vidros"), ("ripas", "Porta moderna com frisos"),
    ("frisos_vidro", "Porta moderna com visores"), ("faixa", "Porta moderna com faixa"), ("arco", "Porta em arco"),
]
DUPLAS = [("vidro_6", "Porta dupla com vidros"), ("classica_2", "Porta dupla clássica"), ("vidro_inteiro", "Porta dupla de vidro")]


def batente(larg, alt, arco=False):
    """Batente com guarnição dos dois lados: o forro cobre a espessura da parede e a guarnição (7 cm, 1,5 cm de
    saliência) emoldura o vão nas duas faces. Sem o lado de baixo."""
    p = Peca()
    g, sai = 0.07, 0.015
    n = 24

    def u(l, a, z0=0.0):
        if not arco:
            return [(-l / 2, z0), (-l / 2, z0 + a), (l / 2, z0 + a), (l / 2, z0)]
        r = l / 2
        zc = a - r
        return [(-l / 2, 0.0), (-l / 2, zc)] + [(r * math.cos(math.pi * k / n), zc + r * math.sin(math.pi * k / n))
                                               for k in range(n - 1, 0, -1)] + [(l / 2, zc), (l / 2, 0.0)]
    # forro: da borda do vão até 2 cm para dentro, na espessura da parede
    p.anel(u(larg, alt), u(larg - 2 * FOLGA, alt - FOLGA if not arco else alt - FOLGA), -ESP / 2, ESP / 2, fechado=False)
    # guarnição nas duas faces
    for s in (-1, 1):
        y0, y1 = sorted((s * ESP / 2, s * (ESP / 2 + sai)))
        p.anel(u(larg + 2 * g, alt + g), u(larg - 2 * FOLGA, alt - FOLGA), y0, y1, fechado=False)
    # o forro da porta em arco precisa casar os pontos: refeito com a mesma amostragem
    return p


def canto_lambri():
    p = Peca()
    a, e, h = 0.06, 0.03, C.LAMBRI_ALT + 0.01
    p.caixa(0, a, 0, e, 0, h, bisel=0.004)
    p.caixa(0, e, 0, a, 0, h, bisel=0.004)
    p.caixa(-0.004, a + 0.004, -0.004, e + 0.004, 0, 0.1)
    p.caixa(-0.004, e + 0.004, -0.004, a + 0.004, 0, 0.1)
    return p


# ------------------------------------------------------------------ materiais e exportação
def materiais(cor_hex, rug):
    def m(nome, hexa, r, metal=0.0, emis=0.0):
        mt = bpy.data.materials.get(nome) or bpy.data.materials.new(nome)
        mt.use_nodes = True
        b = mt.node_tree.nodes["Principled BSDF"]
        h = hexa.lstrip("#")
        rgb = [(int(h[i:i + 2], 16) / 255) ** 2.2 for i in (0, 2, 4)]
        b.inputs["Base Color"].default_value = (*rgb, 1)
        b.inputs["Roughness"].default_value = r
        b.inputs["Metallic"].default_value = metal
        if emis:
            b.inputs["Emission Color"].default_value = (*rgb, 1)
            b.inputs["Emission Strength"].default_value = emis
        return mt
    return [m("cor_" + cor_hex, cor_hex, rug), m("vidro", "#1F8FE0", 0.08, 0.0, 0.25), m("metal", "#C9CDD3", 0.22, 1.0),
            m("friso", "#1E2025", 0.6)]


def objeto(nome, p, mats):
    me = bpy.data.meshes.new(nome)
    bmesh.ops.remove_doubles(p.bm, verts=p.bm.verts[:], dist=1e-6)
    bmesh.ops.recalc_face_normals(p.bm, faces=p.bm.faces[:])
    uvl = p.bm.loops.layers.uv.verify()
    for f in p.bm.faces:
        for lo in f.loops:
            c = lo.vert.co
            lo[uvl].uv = ((c.x + c.y) / 3.0, c.z / 3.0)
    p.bm.to_mesh(me)
    p.bm.free()
    for f in me.polygons:
        f.use_smooth = False
    usados = sorted({f.material_index for f in me.polygons})
    for mt in mats:
        me.materials.append(mt)
    # nomes de material estáveis no GLB: "cor", "vidro", "metal", "friso"
    ob = bpy.data.objects.new(nome, me)
    bpy.context.scene.collection.objects.link(ob)
    ob["usa"] = usados
    return ob


def main():
    a = sys.argv[sys.argv.index("--") + 1:]
    pasta = a[0]
    os.makedirs(os.path.join(pasta, "pecas"), exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    cat = {"cores": {k: {"rotulo": v[0], "hex": v[1]} for k, v in CORES.items()}, "janelas": [], "portas": [],
           "batentes": [], "lambris": [], "cantos": []}
    pecas_paredes = {p["id"]: p for p in C.PECAS}

    def vao(peca, i):
        t, cx, larg, peit, alt = pecas_paredes[peca]["vaos"][i]
        return {"peca": peca, "indice": i, "cx": cx}

    def grava(nome, p, cor, grupo, extra):
        mats = materiais(CORES[cor][1], CORES[cor][2])
        ob = objeto(nome, p, mats)
        C.exporta(ob, os.path.join(pasta, "pecas", nome + ".glb"))
        cat[grupo].append({"id": nome, "cor": cor, "arquivo": f"pecas/{nome}.glb", **extra})
        print(grupo, nome, len(ob.data.vertices), flush=True)
        return ob

    for cor in CORES:
        for jid, rot, (pc, vi), lg, al, pt, arco, grade in JANELAS:
            grava(f"janela_{jid}_{cor}", janela(lg, al, pt, arco, grade), cor, "janelas",
                  {"desenho": jid, "rotulo": f"{rot} ({CORES[cor][0].lower()})", "vao": vao(pc, vi)})
    for cor in ("branca", "preta"):
        grava(f"janela_oculo_{cor}", oculo(), cor, "janelas",
              {"desenho": "oculo", "rotulo": f"Óculo redondo ({CORES[cor][0].lower()})", "vao": vao("janela_quadrada_1m", 0)})
    for cor in CORES:
        for des, rot in PORTAS:
            if des == "arco":
                p = folha(des, -0.6 + FOLGA, 0.6 - FOLGA, 2.4 - FOLGA, 1, arco=True)
                v = vao("arco_2m", 0)
            else:
                p = folha(des, -0.45 + FOLGA, 0.45 - FOLGA, 2.1 - FOLGA)
                v = vao("porta_2m", 0)
            grava(f"porta_{des}_{cor}", p, cor, "portas", {"desenho": des, "rotulo": f"{rot} ({CORES[cor][0].lower()})",
                                                           "vao": v, "batente": f"batente_{'arco' if des == 'arco' else 'simples'}_{cor}"})
        for des, rot in DUPLAS:
            p = folha(des, -0.8 + FOLGA, -0.002, 2.1 - FOLGA, 1)
            q = folha(des, 0.002, 0.8 - FOLGA, 2.1 - FOLGA, -1)
            q.bm.to_mesh(me_ := bpy.data.meshes.new("tmp"))
            q.bm.free()
            p.bm.from_mesh(me_)
            bpy.data.meshes.remove(me_)
            grava(f"porta_dupla_{des}_{cor}", p, cor, "portas", {"desenho": "dupla_" + des, "rotulo": f"{rot} ({CORES[cor][0].lower()})",
                                                                  "vao": vao("porta_dupla_2m", 0), "batente": f"batente_duplo_{cor}"})
        for bid, rot, lg, al, arco in (("simples", "Batente", 0.9, 2.1, False), ("duplo", "Batente duplo", 1.6, 2.1, False),
                                       ("arco", "Batente em arco", 1.2, 2.4, True)):
            grava(f"batente_{bid}_{cor}", batente(lg, al, arco), cor, "batentes",
                  {"desenho": bid, "rotulo": f"{rot} ({CORES[cor][0].lower()})", "larg": lg, "alt": al})
        for comp in (1.0, 0.5):
            p = Peca()
            p.bm.free()
            p.bm = C.lambri(comp)
            nid = f"lambri_{('%g' % comp).replace('.', '_')}m_{cor}"
            grava(nid, p, cor, "lambris", {"comp": comp, "rotulo": f"Lambri {('%g' % comp).replace('.', ',')} m ({CORES[cor][0].lower()})"})
        grava(f"canto_lambri_{cor}", canto_lambri(), cor, "cantos", {"rotulo": f"Cantoneira de lambri ({CORES[cor][0].lower()})"})
    json.dump(cat, open(os.path.join(pasta, "portas_janelas.json"), "w"), ensure_ascii=False, indent=1)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(pasta, "portas_janelas.blend"), compress=True)
    n = {k: len(v) for k, v in cat.items() if isinstance(v, list)}
    print("fim", n, "janelas", n["janelas"], "portas e acabamentos", n["portas"] + n["batentes"] + n["lambris"] + n["cantos"])


if __name__ == "__main__":
    main()
