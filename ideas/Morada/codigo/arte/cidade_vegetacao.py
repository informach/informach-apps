"""Cidade do Morada: vegetação do parque e da cidade — categoria "vegetacao".

Uso (ver GUIA_CIDADE.md e GUIA_PARQUE.md):
  MOVEIS_THREADS=1 CIDADE_PACOTE_FBX=... CIDADE_PACOTE_TEX=... CIDADE_PACOTE_TEXTURAS=... \
    blender-venv/bin/python -I morada-art/cidade_vegetacao.py -- SP/cidade_out [ids|grupos...]

Convenções:
- metros, Z para cima, frente para −Y, origem no chão, no meio da peça (fixacao "chao").
- Copas em poucas bolotas lisas (esferas e superelipsoides de poucos gomos, sombreado liso): árvores de 400 a 2.500
  triângulos.
- Colisão: árvores e palmeiras só no tronco (caixa fina até a copa); arbustos, topiarias, cerca-viva, floreiras e
  vasos numa caixa do volume; canteiro só na borda baixa; touceira de grama sem colisão.
- Peças do pacote Cartoon City (Bush_06/07/10, Palm_03) entram com pacote=True e o id terminando em _pacote.
  Palm_03 vem com 22,5 m e entra a 0,55 × (≈12 m). Pine_01 vem do pacote Apocalypse (cidade_mobiliario.importa_apo).
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import moveis_base as mb  # noqa: E402
import cidade_base as cb  # noqa: E402

V = Vector
CAT = "vegetacao"
P = []


def peca(id_, rotulo, grupo, tags=(), pacote=False):
    def deco(f):
        P.append((id_, rotulo, grupo, list(tags), pacote, f))
        return f
    return deco


# ======================================================================================================================
# Primitivas da vegetação
# ======================================================================================================================
def bolota(r, x, y, z, cor, esc=(1, 1, 1), seg=16):
    """Bolota lisa de copa (esfera de poucos gomos), centrada em (x, y, z)."""
    return mb.esfera(r, x=x, y=y, z=z, cor=cor, esc=esc, seg=seg, nome="bolota")


def tronco(h, r0, r1, cor="madeira_media", seg=10, saia=1.45, x=0.0, y=0.0):
    """Tronco torneado com a base alargada (raízes curtas) e o topo fechado (fica dentro da copa)."""
    perfil = [(0.0, 0.0), (r0 * saia, 0.0), (r0 * saia * 0.96, 0.03), (r0 * 1.12, h * 0.07), (r0, h * 0.16),
              (r1, h), (0.0, h)]
    return mb.torno(perfil, x=x, y=y, cor=cor, seg=seg, angulo=50, nome="tronco")


def galho(p0, p1, r, cor="madeira_media", seg=6):
    return mb.tubo([V(p0), V(p1)], r, cor=cor, seg=seg, raio_curva=0.05, nome="galho")


def copa_redonda(R, zc, cores, rng, seg=16, n=4):
    """Copa de bolotas: uma grande no meio, n menores em volta (um pouco abaixo) e uma no alto."""
    o = [bolota(R, 0, 0, zc, cores[0], esc=(1, 1, 0.92), seg=seg)]
    a0 = rng.uniform(0, 360)
    for k in range(n):
        a = math.radians(a0 + 360 * k / n + rng.uniform(-18, 18))
        d = R * rng.uniform(0.55, 0.68)
        r = R * rng.uniform(0.6, 0.7)
        o.append(bolota(r, d * math.cos(a), d * math.sin(a), zc - R * rng.uniform(0.12, 0.3), cores[1 + k % (len(cores) - 1)],
                        esc=(1, 1, 0.9), seg=seg))
    o.append(bolota(R * 0.62, R * 0.12, R * 0.08, zc + R * 0.52, cores[-1], esc=(1, 1, 0.9), seg=seg))
    return o


def perfil_ogiva(R, z0, H, n=10, base=0.12, ponta=0.85):
    """Perfil (r, z) de uma copa cônica arredondada: abre rápido embaixo e fecha em ponta boleada em cima."""
    pts = [(0.0, z0)]
    for k in range(1, n):
        t = k / n
        r = R * min(1.0, (t / base) ** 0.5) * (1 - t) ** ponta
        pts.append((r, z0 + H * t))
    pts.append((R * 0.04, z0 + H * 0.985))
    pts.append((0.0, z0 + H))
    return pts


def apoia_no_chao(objs):
    """Nada desce abaixo de z = 0 (a vitrine subiria a peça)."""
    lo, _ = mb.bbox(objs)
    if lo.z < -1e-4:
        for o in objs:
            mb.transforma(o, loc=(0, 0, -lo.z))


def col_tronco(h, r=0.22, x=0.0, y=0.0):
    return [((x, y, 0.0), (2 * r, 2 * r, h))]


# ======================================================================================================================
# Árvores
# ======================================================================================================================
def arvore_redonda(it, H, R, cores, sem):
    rng = random.Random(sem)
    zc = H - R * 0.95
    it.add(tronco(zc - R * 0.2, R * 0.16, R * 0.1, seg=10))
    # dois galhinhos que somem na copa
    for s in (-1, 1):
        it.add(galho((0, 0, zc - R * 0.9), (s * R * 0.45, R * 0.1, zc - R * 0.35), R * 0.055))
    it.add(copa_redonda(R, zc, cores, rng, seg=16 if R < 2.5 else 18))
    it.colisao(col_tronco(zc - R * 0.5, r=max(0.16, R * 0.11)))


@peca("arvore_redonda_pequena", "Árvore redonda pequena", "arvore_redonda", ["arvore", "parque", "rua"])
def _(it):
    arvore_redonda(it, 3.6, 1.15, ["folha", "verde", "folha", "folha_clara"], 1)


@peca("arvore_redonda_media", "Árvore redonda média", "arvore_redonda", ["arvore", "parque", "rua"])
def _(it):
    arvore_redonda(it, 5.6, 1.8, ["folha", "verde", "folha", "folha_clara"], 2)


@peca("arvore_redonda_grande", "Árvore redonda grande", "arvore_redonda", ["arvore", "parque"])
def _(it):
    arvore_redonda(it, 8.4, 2.75, ["folha", "verde", "folha", "folha_clara"], 3)


@peca("arvore_oval_alta", "Árvore oval alta", "arvore_oval", ["arvore", "parque", "rua"])
def _(it):
    """A árvore de copa oval e alta (quase caixa boleada) que enfileira os caminhos da referência."""
    it.add(tronco(2.4, 0.17, 0.11, seg=10))
    # duas metades ovais encostadas: a copa fica com um vinco suave, como as da referência
    it.add(mb.superelipsoide(1.9, 2.1, 4.0, x=-0.3, z=1.75, cor="verde_claro", e=0.62, e_v=0.6, nu=20, nv=12,
                             nome="copa"))
    it.add(mb.superelipsoide(1.8, 2.0, 3.6, x=0.38, y=-0.08, z=2.05, cor="verde_claro", e=0.62, e_v=0.6, nu=20, nv=12,
                             nome="copa"))
    it.colisao(col_tronco(1.8, 0.17))


@peca("arvore_conica", "Árvore de copa cônica", "arvore_conica", ["arvore", "parque", "rua"])
def _(it):
    it.add(tronco(1.6, 0.15, 0.1, seg=10))
    it.add(mb.torno(perfil_ogiva(1.35, 1.0, 5.3, n=14, base=0.14, ponta=0.75), cor="verde", seg=20, angulo=70,
                    nome="copa"))
    it.colisao(col_tronco(1.4, 0.15))


@peca("pinheiro", "Pinheiro", "pinheiro", ["arvore", "parque", "rua", "pinheiro"])
def _(it):
    it.add(tronco(2.2, 0.17, 0.1, cor="madeira_escura", seg=10))
    camadas = [(1.85, 1.0, 2.3), (1.5, 2.3, 2.1), (1.15, 3.5, 1.9), (0.8, 4.6, 1.7), (0.45, 5.6, 1.2)]
    for i, (r, z0, h) in enumerate(camadas):
        perfil = [(0.0, z0), (r * 0.8, z0), (r, z0 + 0.1), (r * 0.98, z0 + 0.22), (r * 0.62, z0 + h * 0.55),
                  (r * 0.28, z0 + h * 0.86), (0.04, z0 + h * 0.99), (0.0, z0 + h)]
        it.add(mb.torno(perfil, cor="verde_escuro" if i % 2 == 0 else "verde_floresta", seg=16, angulo=55,
                        nome="camada"))
    it.colisao(col_tronco(1.6, 0.17))


@peca("arvore_florida_rosa", "Árvore florida rosa", "arvore_florida", ["arvore", "parque", "flores"])
def _(it):
    rng = random.Random(7)
    H, R = 5.4, 1.75
    zc = H - R * 0.95
    it.add(tronco(zc - R * 0.2, 0.25, 0.15, cor="madeira_escura", seg=10))
    for s in (-1, 1):
        it.add(galho((0, 0, zc - R * 0.9), (s * R * 0.5, -R * 0.05, zc - R * 0.3), 0.09, cor="madeira_escura"))
    copa = copa_redonda(R, zc, ["rosa_bebe", "rosa", "rosa_bebe", "rosa_claro"], rng, seg=16)
    it.add(copa)
    # florzinhas brancas e rosa-claro pousadas na copa (pontinhos que dão a textura de flor)
    for k in range(16):
        a = rng.uniform(0, 2 * math.pi)
        b = rng.uniform(-0.15, 1.1)
        n = V((math.cos(a) * math.cos(b), math.sin(a) * math.cos(b), math.sin(b)))
        p = V((0, 0, zc)) + V((n.x * R * 1.08, n.y * R * 1.08, n.z * R * 0.95))
        it.add(mb.superelipsoide(0.26, 0.26, 0.17, x=p.x, y=p.y, z=p.z - 0.08, cor="branco" if k % 3 == 0 else
                                 "rosa_claro", e=0.9, e_v=0.9, nu=8, nv=4, nome="florzinha"))
    # pétalas caídas no chão
    for k in range(5):
        a = rng.uniform(0, 2 * math.pi)
        d = rng.uniform(0.7, 1.5)
        it.add(mb.superelipsoide(0.42, 0.3, 0.02, x=d * math.cos(a), y=d * math.sin(a), z=0.0, cor="rosa_bebe", e=0.9,
                                 e_v=0.9, nu=10, nv=4, nome="petalas"))
    it.colisao(col_tronco(zc - R * 0.5, 0.25))


@peca("arvore_outono", "Árvore de outono", "arvore_outono", ["arvore", "parque", "outono"])
def _(it):
    rng = random.Random(11)
    H, R = 5.6, 1.85
    zc = H - R * 0.95
    it.add(tronco(zc - R * 0.2, 0.26, 0.15, cor="madeira_media", seg=10))
    for s in (-1, 1):
        it.add(galho((0, 0, zc - R * 0.9), (s * R * 0.48, R * 0.15, zc - R * 0.32), 0.09))
    it.add(copa_redonda(R, zc, ["laranja", "mostarda", "laranja_escuro", "amarelo_escuro"], rng, seg=16, n=4))
    # folhas caídas em volta do tronco
    for k in range(6):
        a = rng.uniform(0, 2 * math.pi)
        d = rng.uniform(0.6, 1.6)
        it.add(mb.superelipsoide(0.5, 0.36, 0.025, x=d * math.cos(a), y=d * math.sin(a), z=0.0,
                                 cor=("laranja", "mostarda", "laranja_escuro")[k % 3], e=0.9, e_v=0.9, nu=10, nv=4,
                                 nome="folhas"))
    it.colisao(col_tronco(zc - R * 0.5, 0.26))


@peca("arvore_praca_gigante", "Árvore enorme de praça", "arvore_gigante", ["arvore", "parque", "marco"])
def _(it):
    """A árvore enorme da casa na árvore, sem a casa: tronco grosso com raízes, galhos tortos e copa de bolotas."""
    tr = [(0.0, 0.0), (2.0, 0.0), (1.75, 0.3), (1.35, 0.9), (1.12, 2.4), (1.0, 5.5), (0.9, 8.5), (0.82, 10.6),
          (0.0, 10.9)]
    it.add(mb.torno(tr, cor="madeira_media", seg=14, angulo=50, nome="tronco"))
    for k in range(5):
        t = 2 * math.pi * k / 5 + 0.4
        rz = mb.superelipsoide(2.6, 0.8, 0.8, cor="madeira_media", e=0.7, e_v=0.7, nu=10, nv=5, nome="raiz")
        mb.transforma(rz, loc=(1.3, 0, -0.18), rot=("Y", 16))
        mb.transforma(rz, rot=("Z", math.degrees(t)))
        it.add(rz)
    galhos = [((0, 0, 8.0), (2.1, 0.9, 10.0), (3.4, 1.3, 11.1)), ((0, 0, 8.4), (-1.9, 0.5, 10.2), (-3.2, 0.7, 11.6)),
              ((0, 0, 7.5), (2.6, -0.6, 8.2), (4.2, -0.8, 8.7)), ((0, 0, 8.8), (0.3, 2.0, 10.6), (0.5, 3.1, 11.8))]
    for g in galhos:
        it.add(mb.tubo([V(p) for p in g], 0.36, cor="madeira_media", seg=8, raio_curva=0.9, nome="galho"))
    copa = [((0, 0.4, 13.6), 3.9, "folha"), ((2.9, 1.1, 12.1), 2.8, "verde"), ((-2.9, 0.7, 12.4), 2.9, "folha"),
            ((0.6, 2.9, 12.4), 2.8, "verde"), ((-1.1, -2.3, 12.6), 2.6, "folha_clara"), ((2.3, -1.7, 13.4), 2.5, "folha"),
            ((-2.1, 2.5, 14.4), 2.4, "folha_clara"), ((0.9, 0.5, 16.2), 2.6, "folha_clara"),
            ((4.0, -0.7, 9.7), 1.7, "verde")]
    for (x, y, z), r, c in copa:
        it.add(bolota(r * 1.08, x, y, z, c, esc=(1, 1, 0.9), seg=12))
    it.colisao([((0, 0, 0), (2.6, 2.6, 10.0)), ((0, 0, 0), (4.4, 4.4, 0.6))])


# ======================================================================================================================
# Palmeiras
# ======================================================================================================================
def folha_palmeira(L, W, ang, incl, cor, x0=V((0, 0, 0)), queda=0.32, sobe=0.55):
    """Folha de palmeira: elipse comprida e fina, dobrada em V no meio, que sobe um pouco e cai para a ponta."""
    ob = mb.superelipsoide(L, W, 0.07, x=L / 2, cor=cor, e=0.55, e_v=0.9, nu=14, nv=4, nome="folha")
    for v in ob.data.vertices:
        x = v.co.x
        t = x / L
        v.co.y *= 1.0 - 0.55 * t ** 2
        v.co.z += sobe * x - queda * x * x / L * 2.2 - abs(v.co.y) * 0.45
    mb.transforma(ob, rot=[("Z", ang), ("Y", -incl)])
    mb.transforma(ob, loc=tuple(x0))
    return ob


@peca("palmeira", "Palmeira", "palmeira", ["arvore", "palmeira", "parque", "praia", "rua"])
def _(it):
    H = 7.2
    n = 11
    curva = lambda t: V((0.75 * t * t, 0.15 * t * t, H * t))  # noqa: E731
    for k in range(n):
        t0, t1 = k / n, (k + 1) / n
        a, b = curva(t0), curva(t1)
        d = b - a
        r0 = 0.25 - 0.08 * t0
        r1 = 0.25 - 0.08 * t1
        anel = mb.cilindro(r0 * 1.12, d.length * 1.04, r2=r1 * 0.92, cor="caramelo" if k % 2 else "madeira_mel",
                           seg=9, bisel=0.02, nome="anel")
        q = V((0, 0, 1)).rotation_difference(d.normalized())
        anel.data.transform(q.to_matrix().to_4x4())
        mb.transforma(anel, loc=tuple(a))
        it.add(anel)
    topo = curva(1.0)
    it.add(bolota(0.34, topo.x, topo.y, topo.z + 0.05, "folha_escura", esc=(1, 1, 0.8), seg=10))
    for k in range(3):  # cocos
        a = math.radians(40 + 120 * k)
        it.add(bolota(0.17, topo.x + 0.24 * math.cos(a), topo.y + 0.24 * math.sin(a), topo.z - 0.25, "marrom",
                      seg=10))
    for k in range(10):
        ang = 36 * k + (12 if k % 2 else 0)
        incl = -10 + (k % 3) * 10
        L = 3.1 if k % 2 == 0 else 2.6
        it.add(folha_palmeira(L, 0.85, ang, incl, "folha" if k % 2 == 0 else "folha_escura",
                              x0=topo + V((0, 0, 0.12)), queda=0.4))
    it.colisao(col_tronco(H - 1.0, 0.26))


# ======================================================================================================================
# Arbustos e topiarias
# ======================================================================================================================
@peca("arbusto_redondo", "Arbusto redondo", "arbusto_redondo", ["arbusto", "parque", "jardim"])
def _(it):
    for (x, y, r, c) in ((0.0, 0.05, 0.58, "folha"), (0.45, -0.12, 0.42, "verde"), (-0.42, -0.08, 0.44, "folha"),
                         (0.08, -0.36, 0.36, "folha_clara")):
        it.add(bolota(r, x, y, r * 0.9, c, esc=(1, 1, 0.9), seg=14))
    it.colisao([((0, -0.05, 0), (1.5, 1.05, 1.0))])


@peca("topiaria_bolas", "Topiaria de três bolas", "topiaria_bolas", ["arbusto", "topiaria", "parque", "jardim"])
def _(it):
    it.add(mb.caixa(0.72, 0.72, 0.48, cor="branco", bisel=0.04, nome="vaso"))
    it.add(mb.caixa(0.8, 0.8, 0.07, z=0.45, cor="madeira_clara", bisel=0.025, nome="borda"))
    it.add(mb.caixa(0.6, 0.6, 0.05, z=0.46, cor="terra", bisel=0.01, nome="terra"))
    it.add(mb.cilindro(0.04, 1.9, z=0.48, cor="madeira_escura", seg=8, nome="haste"))
    for z, r in ((1.02, 0.46), (1.72, 0.34), (2.25, 0.2)):
        it.add(bolota(r, 0, 0, z, "verde_escuro" if r > 0.3 else "folha_escura", seg=16))
    it.colisao([((0, 0, 0), (0.8, 0.8, 0.52)), ((0, 0, 0.52), (0.6, 0.6, 1.4))])


@peca("topiaria_espiral", "Topiaria em espiral no vaso", "topiaria_espiral", ["arbusto", "topiaria", "parque", "jardim"])
def _(it):
    vaso = [(0.0, 0.0), (0.24, 0.0), (0.27, 0.03), (0.34, 0.44), (0.39, 0.47), (0.39, 0.54), (0.33, 0.54),
            (0.31, 0.5), (0.0, 0.5)]
    it.add(mb.torno(vaso, cor="terracota", seg=20, nome="vaso"))
    it.add(mb.cilindro(0.3, 0.02, z=0.49, cor="terra", seg=20, bisel=0, nome="terra"))
    it.add(mb.cilindro(0.035, 0.4, z=0.5, cor="madeira_escura", seg=8, nome="haste"))
    camadas = [(0.42, 0.72), (0.34, 1.02), (0.26, 1.28), (0.18, 1.5)]
    for i, (r, z) in enumerate(camadas):
        d = mb.superelipsoide(2 * r, 2 * r, 0.32, z=z - 0.16, cor="verde_escuro" if i % 2 == 0 else "folha_escura",
                              e=0.9, e_v=0.65, nu=16, nv=8, nome="camada")
        mb.transforma(d, loc=(0.03 * math.cos(i * 2.1), 0.03 * math.sin(i * 2.1), 0))
        it.add(d)
    it.add(bolota(0.1, 0, 0, 1.7, "folha_escura", seg=10))
    it.colisao([((0, 0, 0), (0.78, 0.78, 0.54)), ((0, 0, 0.54), (0.6, 0.6, 1.1))])


# ======================================================================================================================
# Cerca-viva, canteiros, floreiras, vasos e grama
# ======================================================================================================================
@peca("cerca_viva", "Cerca-viva (3 m)", "cerca_viva", ["arbusto", "cerca", "parque", "jardim", "modular"])
def _(it):
    it.add(mb.superelipsoide(3.0, 0.8, 1.12, cor="folha", e=0.2, e_v=0.3, nu=28, nv=10, nome="cerca"))
    it.colisao([((0, 0, 0), (3.0, 0.8, 1.12))])


def flor(x, y, z, cor, r=0.075):
    """Florzinha: miolo amarelo com uma coroa de pétalas achatada (pouca malha)."""
    return [mb.superelipsoide(2 * r, 2 * r, r * 0.9, x=x, y=y, z=z, cor=cor, e=0.8, e_v=0.7, nu=8, nv=4, nome="flor"),
            mb.superelipsoide(r * 0.7, r * 0.7, r * 0.4, x=x, y=y, z=z + r * 0.7,
                              cor="amarelo" if cor != "amarelo" else "laranja", e=0.9, e_v=0.9, nu=6, nv=3, nome="miolo")]


@peca("canteiro_flores", "Canteiro de flores", "canteiro", ["flores", "canteiro", "parque", "jardim"])
def _(it):
    L, W, h = 3.0, 1.2, 0.3
    e = 0.14
    for (l, p, x, y) in ((L, e, 0, -W / 2 + e / 2), (L, e, 0, W / 2 - e / 2), (e, W - 2 * e + 0.004, -L / 2 + e / 2, 0),
                         (e, W - 2 * e + 0.004, L / 2 - e / 2, 0)):
        it.add(mb.caixa(l, p, h, x=x, y=y, cor="concreto", bisel=0.035, nome="meio_fio"))
    it.add(mb.caixa(L - 2 * e + 0.01, W - 2 * e + 0.01, 0.22, cor="terra", bisel=0.0, nome="terra", liso=False))
    rng = random.Random(5)
    cores = ["vermelho", "amarelo", "rosa", "lilas", "branco", "laranja"]
    for j, yy in enumerate((-0.27, 0.0, 0.27)):
        it.add(mb.superelipsoide(2.55, 0.3, 0.26, y=yy, z=0.14, cor="folha" if j % 2 == 0 else "verde", e=0.6,
                                 e_v=0.7, nu=20, nv=6, nome="folhagem"))
        for k in range(8):
            x = -1.12 + 2.24 * k / 7 + rng.uniform(-0.06, 0.06)
            it.add(flor(x, yy + rng.uniform(-0.07, 0.07), 0.36 + rng.uniform(-0.02, 0.04), cores[(k + 2 * j) % len(cores)]))
    it.colisao([((0, 0, 0), (L, W, h))])


@peca("floreira_redonda", "Floreira redonda com flores laranja", "floreira", ["flores", "floreira", "parque", "jardim"])
def _(it):
    perfil = [(0.0, 0.0), (0.36, 0.0), (0.38, 0.04), (0.6, 0.48), (0.66, 0.5), (0.66, 0.58), (0.58, 0.58),
              (0.56, 0.52), (0.0, 0.52)]
    it.add(mb.torno(perfil, cor="cinza_claro", seg=24, nome="floreira"))
    rng = random.Random(9)
    tufos = [(0.0, 0.0, 0.48), (0.28, 0.18, 0.34), (-0.26, 0.2, 0.34), (0.05, -0.3, 0.34)]
    for x, y, r in tufos:
        it.add(bolota(r, x, y, 0.5 + r * 0.72, "folha" if r > 0.4 else "verde", esc=(1, 1, 0.86), seg=14))
    for k in range(11):
        a = rng.uniform(0, 2 * math.pi)
        b = rng.uniform(0.15, 1.2)
        n = V((math.cos(a) * math.cos(b), math.sin(a) * math.cos(b), math.sin(b)))
        p = V((0, 0, 0.85)) + V((n.x * 0.55, n.y * 0.55, n.z * 0.44))
        fl = mb.superelipsoide(0.2, 0.2, 0.09, cor="laranja", e=0.6, e_v=0.8, nu=8, nv=4, nome="flor")
        q = V((0, 0, 1)).rotation_difference(n)
        fl.data.transform(q.to_matrix().to_4x4())
        mb.transforma(fl, loc=tuple(p))
        it.add(fl, mb.superelipsoide(0.07, 0.07, 0.07, x=p.x + n.x * 0.04, y=p.y + n.y * 0.04, z=p.z + n.z * 0.04 - 0.035,
                                     cor="brasa", e=0.9, e_v=0.9, nu=6, nv=3, nome="miolo"))
    it.colisao([((0, 0, 0), (1.25, 1.25, 0.58))])


@peca("vaso_calcada", "Vaso grande de calçada com arvoreta", "vaso_calcada", ["vaso", "calcada", "rua", "parque"])
def _(it):
    it.add(mb.caixa(0.82, 0.82, 0.8, cor="concreto", bisel=0.06, nome="vaso"))
    it.add(mb.caixa(0.92, 0.92, 0.1, z=0.78, cor="concreto_escuro", bisel=0.035, nome="borda"))
    it.add(mb.caixa(0.92, 0.92, 0.06, z=0.0, cor="concreto_escuro", bisel=0.025, nome="pe"))
    it.add(mb.caixa(0.7, 0.7, 0.05, z=0.81, cor="terra", bisel=0.01, nome="terra"))
    t =tronco(1.25, 0.06, 0.045, cor="madeira_escura", seg=8)
    mb.transforma(t, loc=(0, 0, 0.84))
    it.add(t)
    rng = random.Random(4)
    it.add(copa_redonda(0.52, 2.28, ["folha", "verde", "folha_clara"], rng, seg=14, n=3))
    it.colisao([((0, 0, 0), (0.92, 0.92, 0.88))])


@peca("touceira_grama", "Touceira de grama alta", "touceira", ["grama", "parque", "jardim"])
def _(it):
    rng = random.Random(3)
    for cx, cy, s in ((0.0, 0.0, 1.0), (0.32, 0.18, 0.75), (-0.28, 0.14, 0.8), (0.06, -0.26, 0.65)):
        nb = 9
        for k in range(nb):
            h = rng.uniform(0.45, 0.75) * s
            ob = mb.cilindro(0.028, h, r2=0.004, cor=("grama_escura", "verde_oliva", "folha", "grama")[k % 4],
                             seg=4, bisel=0, nome="folha")
            mb.transforma(ob, rot=[("Z", 360 * k / nb + rng.uniform(-15, 15)), ("Y", rng.uniform(12, 30))])
            mb.transforma(ob, loc=(cx + rng.uniform(-0.04, 0.04), cy + rng.uniform(-0.04, 0.04), 0))
            it.add(ob)
        for k in range(2):  # pendões
            h = 0.8 * s
            a = math.radians(rng.uniform(0, 360))
            dx, dy = 0.12 * math.cos(a), 0.12 * math.sin(a)
            it.add(mb.tubo([(cx, cy, 0), (cx + dx * 0.5, cy + dy * 0.5, h * 0.6), (cx + dx, cy + dy, h)], 0.008,
                           cor="verde_oliva", seg=4, raio_curva=0.1, nome="haste"))
            it.add(mb.esfera(0.04, x=cx + dx, y=cy + dy, z=h + 0.07, cor="bege", esc=(1, 1, 2.6), seg=6,
                             nome="pendao"))
    it.semcolisao = True


# ======================================================================================================================
# Pacote Cartoon City
# ======================================================================================================================
def do_pacote(it, nome):
    pc = cb.importa_cidade(nome)
    objs = list(pc.values())
    it.add(*objs)
    return objs


@peca("palm_03_pacote", "Palmeira alta (pacote)", "palm_03", ["arvore", "palmeira", "praia", "pacote"], pacote=True)
def _(it):
    objs = do_pacote(it, "Palm_03")
    for o in objs:  # o pacote traz 22,5 m: 0,55 × fica com ~12 m, a altura das palmeiras da referência ao lado dos prédios
        mb.transforma(o, esc=(0.55, 0.55, 0.55))
    pts = [o.matrix_world @ v.co for o in objs for v in o.data.vertices if v.co.z < 1.5]
    cx = sum(p.x for p in pts) / len(pts)
    cy = sum(p.y for p in pts) / len(pts)
    it.colisao(col_tronco(10.0, 0.22, cx, cy))


@peca("bush_06_pacote", "Arbusto com flores vermelhas no vaso (pacote)", "bush_vaso",
      ["arbusto", "flores", "vaso", "pacote"], pacote=True)
def _(it):
    do_pacote(it, "Bush_06")
    it.colisao([((0, 0, 0), (1.3, 1.3, 1.9))])


@peca("bush_07_pacote", "Arbusto com flores laranja no vaso (pacote)", "bush_vaso",
      ["arbusto", "flores", "vaso", "pacote"], pacote=True)
def _(it):
    do_pacote(it, "Bush_07")
    it.colisao([((0, 0, 0), (1.3, 1.3, 1.9))])


@peca("bush_10_pacote", "Cerca-viva quadrada (pacote)", "bush_10", ["arbusto", "cerca", "pacote", "modular"],
      pacote=True)
def _(it):
    do_pacote(it, "Bush_10")
    it.colisao([((0, 0, 0), (1.98, 0.98, 1.0))])


@peca("pine_01_pacote", "Pinheiro alto (pacote Apocalypse)", "pine_01", ["arvore", "pinheiro", "parque", "pacote"],
      pacote=True)
def _(it):
    import cidade_mobiliario as cm  # o importador do pacote Apocalypse mora no gerador do mobiliário
    objs = cm.importa_apo("Pine_01")
    it.add(objs)
    pts = [o.matrix_world @ v.co for o in objs for v in o.data.vertices if v.co.z < 1.0]
    cx = sum(p.x for p in pts) / len(pts)
    cy = sum(p.y for p in pts) / len(pts)
    it.colisao(col_tronco(2.0, 0.2, cx, cy))


# ======================================================================================================================
# Execução
# ======================================================================================================================
def main():
    argv = sys.argv[sys.argv.index("--") + 1:]
    saida, filtro = argv[0], argv[1:]
    cat = mb.Catalogo(CAT, saida, rotulo="Vegetação")
    ids = [p[0] for p in P]
    assert len(ids) == len(set(ids)), "ids repetidos"
    for id_, rotulo, grupo, tags, pacote, f in P:
        if filtro and id_ not in filtro and grupo not in filtro:
            continue
        mb.limpa()
        it = mb.Item(id_)
        f(it)
        apoia_no_chao(it.partes)
        sem = getattr(it, "semcolisao", False)
        e = cat.exporta(it, rotulo, grupo=grupo, tags=["vegetacao"] + tags, pacote=pacote)
        if sem:
            e["colisao"] = []
        cat.salva()
    validos = set(ids)
    cat.dados["itens"] = [x for x in cat.dados["itens"] if x["id"] in validos]
    cat.dados["itens"].sort(key=lambda x: ids.index(x["id"]))
    cat.salva()
    print("pecas", len(cat.dados["itens"]), flush=True)


if __name__ == "__main__":
    main()
