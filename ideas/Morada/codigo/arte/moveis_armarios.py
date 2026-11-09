"""Móveis do Morada: armários, estantes, sapateiras e racks de TV (quatro categorias num gerador só).

Uso (de SP):
  MOVEIS_THREADS=1 MOVEIS_PACOTE_FBX=... MOVEIS_PACOTE_TEX=... blender-venv/bin/python -I morada-art/moveis_armarios.py \
      -- SP/moveis_out [categoria|id ...]
Sem filtro gera as quatro categorias. Um nome de categoria (armarios, estantes, sapateiras, racks_tv) gera só ela;
ids soltos geram só aquelas peças (o catálogo da categoria é atualizado, não refeito).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402,F401
import bmesh  # noqa: E402
from mathutils import Vector as V  # noqa: E402

import moveis_base as mb  # noqa: E402

ARGS = sys.argv[sys.argv.index("--") + 1:]
SAIDA = ARGS[0]
FILTRO = ARGS[1:]
CATEGORIAS = {"armarios": "Armários", "estantes": "Estantes", "sapateiras": "Sapateiras", "racks_tv": "Racks de TV"}

ESP = 0.02  # espessura das frentes
FOLGA = 0.003  # folga de cada lado das portas e gavetas (dá 6 mm entre duas folhas)


# =====================================================================================================================
# Geometria auxiliar
# =====================================================================================================================
def anel_xz(ext, inn, prof, y0=0.0, cor="branco", bisel=0.01, seg=3, nome="anel"):
    """Moldura extrudada em Y: contorno externo e interno (mesmo número de pontos, mesma ordem, no plano x-z), de y0 até
    y0 + prof. É o corpo arredondado dos armários (laterais, base e topo numa peça só) e o dos nichos."""
    bm = bmesh.new()
    n = len(ext)
    ef = [bm.verts.new((x, y0, z)) for x, z in ext]
    eb = [bm.verts.new((x, y0 + prof, z)) for x, z in ext]
    nf = [bm.verts.new((x, y0, z)) for x, z in inn]
    nb = [bm.verts.new((x, y0 + prof, z)) for x, z in inn]
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((ef[i], ef[j], nf[j], nf[i]))
        bm.faces.new((eb[j], eb[i], nb[i], nb[j]))
        bm.faces.new((ef[j], ef[i], eb[i], eb[j]))
        bm.faces.new((nf[i], nf[j], nb[j], nb[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    arestas = [e for e in bm.edges if len(e.link_faces) == 2 and
               e.link_faces[0].normal.dot(e.link_faces[1].normal) < 0.85]
    mb._bevel(bm, bisel, seg, arestas)
    return mb._obj(nome, bm, cor)


def arredonda_fechado(pts, r, n=5):
    """Polígono fechado com os cantos arredondados; sempre len(pts) * (n + 1) pontos (para casar externo e interno)."""
    out = []
    N = len(pts)
    for i in range(N):
        a, b, c = V(pts[i - 1]), V(pts[i]), V(pts[(i + 1) % N])
        d1, d2 = a - b, c - b
        rr = min(r, d1.length * 0.45, d2.length * 0.45)
        p1, p2 = b + d1.normalized() * rr, b + d2.normalized() * rr
        for k in range(n + 1):
            t = k / n
            q = (1 - t) ** 2 * p1 + 2 * (1 - t) * t * b + t ** 2 * p2
            out.append((q.x, q.y))
    return out


def recua_poligono(pts, e):
    """Contorno recuado e para dentro (polígono anti-horário, cantos em esquadro ou convexos)."""
    N = len(pts)
    linhas = []
    for i in range(N):
        a, b = V(pts[i]), V(pts[(i + 1) % N])
        d = (b - a).normalized()
        nrm = V((-d.y, d.x))
        linhas.append((a + nrm * e, d))
    out = []
    for i in range(N):
        (p1, d1), (p2, d2) = linhas[i - 1], linhas[i]
        den = d1.x * d2.y - d1.y * d2.x
        if abs(den) < 1e-9:
            out.append((p2.x, p2.y))
            continue
        t = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / den
        q = p1 + d1 * t
        out.append((q.x, q.y))
    return out


def desloca(pts, dx=0.0, dz=0.0):
    return [(x + dx, z + dz) for x, z in pts]


def nicho_forma(pts, e, prof, y0, r_ext, r_int, cor, cor_fundo=None, fundo=True, bisel=0.01, n=5):
    """Corpo oco de qualquer contorno (casinha, hexágono, escada): anel + fundo. Devolve (objetos, contorno interno)."""
    ext = arredonda_fechado(pts, r_ext, n)
    inn_poly = recua_poligono(pts, e)
    inn = arredonda_fechado(inn_poly, r_int, n)
    obs = [anel_xz(ext, inn, prof, y0, cor, bisel)]
    if fundo:
        ef = 0.016
        fp = arredonda_fechado(recua_poligono(pts, e - 0.004), r_int + 0.004, n)
        obs.append(mb.extrudado(mb._ccw(fp), ef, y=y0 + prof - ef - 0.004, cor=cor_fundo or cor, bisel=0.003,
                                plano="xz"))
    return obs, inn_poly


def casco(l, a, p, e=0.03, r_ext=0.03, r_int=0.01, x=0.0, y=0.0, z=0.0, cor="branco", cor_fundo=None, fundo=True,
          bisel=0.01, seg=5):
    """Corpo de armário: laterais, base e topo numa moldura boleada (arredondada por fora e por dentro) + fundo."""
    ext = desloca(mb.ret_arredondado(l, a, r_ext, seg), x, z + a / 2)
    inn = desloca(mb.ret_arredondado(l - 2 * e, a - 2 * e, r_int, seg), x, z + a / 2)
    obs = [anel_xz(ext, inn, p, y - p / 2, cor, bisel)]
    if fundo:
        ef = 0.016
        pts = desloca(mb.ret_arredondado(l - 2 * e + 0.008, a - 2 * e + 0.008, r_int + 0.004, seg), x, z + a / 2)
        obs.append(mb.extrudado(pts, ef, y=y + p / 2 - ef - 0.004, cor=cor_fundo or cor, bisel=0.003, plano="xz"))
    return mb.junta(obs, "casco")


class Cx:
    """Um casco no item, com as medidas internas à mão para prateleiras, divisórias, portas, gavetas e slots."""

    def __init__(self, it, l, a, p, z0=0.0, e=0.03, r_ext=0.03, r_int=0.01, cor="branco", cor_int=None, x=0.0,
                 y=0.0, bisel=0.01, fundo=True):
        self.it, self.l, self.a, self.p, self.z0, self.e, self.x, self.y = it, l, a, p, z0, e, x, y
        self.cor, self.ci = cor, cor_int or cor
        it.add(casco(l, a, p, e, r_ext, r_int, x, y, z0, cor, self.ci, fundo, bisel))
        self.x0, self.x1 = x - l / 2 + e, x + l / 2 - e
        self.zi0, self.zi1 = z0 + e, z0 + a - e
        self.yf = y - p / 2
        self.yb = y + p / 2 - 0.02 if fundo else y + p / 2 - 0.002
        self.topo = z0 + a

    def prat(self, h, x0=None, x1=None, cor=None, t=0.02, recuo=0.03):
        """Prateleira com a face de cima em h."""
        x0 = self.x0 if x0 is None else x0
        x1 = self.x1 if x1 is None else x1
        yfr = self.yf + recuo
        d = self.yb - yfr + 0.003
        self.it.add(mb.caixa(x1 - x0 + 0.004, d, t, x=(x0 + x1) / 2, y=yfr + d / 2, z=h - t, cor=cor or self.ci,
                             bisel=0.005))

    def div(self, xc, z0=None, z1=None, t=0.022, recuo=0.03, cor=None):
        z0 = self.zi0 if z0 is None else z0
        z1 = self.zi1 if z1 is None else z1
        yfr = self.yf + recuo
        d = self.yb - yfr + 0.003
        self.it.add(mb.caixa(t, d, z1 - z0 + 0.004, x=xc, y=yfr + d / 2, z=z0 - 0.002, cor=cor or self.ci,
                             bisel=0.005))

    def vao(self, nome, x0, x1, zf, zc, recuo=0.03):
        yfr = self.yf + recuo
        self.it.slot(nome, ((x0 + x1) / 2, (yfr + self.yb) / 2, zf),
                     (x1 - x0 - 0.01, self.yb - yfr - 0.01, max(0.02, zc - zf - 0.005)))

    def cabideiro(self, x0, x1, z, cor="cromo", nome="cabideiro"):
        """Cabideiro (tubo) de parede a parede com os suportes, e o slot de pendurar embaixo dele."""
        yc = (self.yf + 0.03 + self.yb) / 2
        self.it.add(mb.tubo([(x0 - 0.004, yc, z), (x1 + 0.004, yc, z)], 0.013, cor=cor))
        for xx, s in ((x0, 1), (x1, -1)):
            self.it.add(mb.cilindro(0.028, 0.012, x=xx + s * 0.006, y=yc, z=z, cor=cor, eixo="x", seg=16,
                                    bisel=0.003))
        alto = min(1.2, z - self.zi0 - 0.05)
        self.it.slot(nome, ((x0 + x1) / 2, yc, z - alto), (x1 - x0 - 0.02, self.yb - self.yf - 0.06, alto))


def _prot(estilo, op):
    rel = op.get("rel", ESP * 0.35)
    if estilo in ("moldura", "vidro", "trelica"):
        return rel - 0.002
    if estilo == "almofada":
        return rel * 1.6 - 0.002
    if estilo == "recorte":
        return rel * 1.4 - 0.002
    return 0.0


def _margem(w, h, op):
    return op.get("margem", min(w, h) * 0.16)


def porta(it, x0, x1, z0, z1, yf, lado="esq", estilo="lisa", cor="branco", cor2=None, pux="bola", pcor="ouro",
          pz=None, ptam=1.0, inset=True, folga=FOLGA, extra=(), pux_dx=None, **op):
    """Porta de abrir dentro do vão x0..x1, z0..z1. yf = plano da frente do corpo; a porta fica embutida (a parte mais
    saliente 3 mm atrás de yf) ou sobreposta (inset=False: o fundo da porta encosta em yf)."""
    w, h = x1 - x0 - 2 * folga, z1 - z0 - 2 * folga
    pr = _prot(estilo, op)
    yface = yf + 0.003 + pr if inset else yf - ESP - 0.001
    f = mb.frente(w, h, esp=ESP, estilo=estilo, cor=cor, cor2=cor2, **op)
    xc = (x0 + x1) / 2
    mb.transforma(f, loc=(xc, yface + ESP, z0 + folga))
    objs = [f] + list(extra)
    if pux:
        m = _margem(w, h, op) if estilo in ("moldura", "vidro", "trelica", "almofada", "recorte") else 0.1
        dx = pux_dx if pux_dx is not None else max(0.035, min(m / 2, 0.06))
        px = (x1 - folga - dx) if lado == "esq" else (x0 + folga + dx)
        prp = pr if estilo in ("moldura", "vidro", "trelica") else 0.0
        objs.append(puxador(pux, x=px, y=yface - prp, z=pz if pz is not None else z0 + h / 2, cor=pcor, tam=ptam))
    piv = (x0 + folga, yface, z0) if lado == "esq" else (x1 - folga, yface, z0)
    return it.porta(objs, dobradica=piv, lado=lado)


def par_portas(it, x0, x1, z0, z1, yf, **k):
    xm = (x0 + x1) / 2
    return [porta(it, x0, xm, z0, z1, yf, lado="esq", **k), porta(it, xm, x1, z0, z1, yf, lado="dir", **k)]


def gaveta(it, x0, x1, z0, z1, yf, prof, piso=None, teto=None, estilo="lisa", cor="branco", cor2=None, pux="bola",
           pcor="ouro", ptam=1.0, dois=False, caixa_cor="creme", inset=True, folga=FOLGA, horizontal=True, **op):
    """Gaveta de verdade no vão x0..x1 (paredes), frente de z0 a z1. piso/teto: o espaço livre da caixa."""
    w, h = x1 - x0 - 2 * folga, z1 - z0 - 2 * folga
    pr = _prot(estilo, op)
    yface = yf + 0.003 + pr if inset else yf - ESP - 0.001
    f = mb.frente(w, h, esp=ESP, estilo=estilo, cor=cor, cor2=cor2, **op)
    xc = (x0 + x1) / 2
    mb.transforma(f, loc=(xc, yface + ESP, z0 + folga))
    objs = [f]
    zc = z0 + folga + h / 2
    ypx = yface - (pr if estilo == "almofada" else 0.0)
    if pux:
        xs = [xc - w * 0.28, xc + w * 0.28] if dois else [xc]
        for px in xs:
            objs.append(puxador(pux, x=px, y=ypx, z=zc, cor=pcor, tam=ptam, vertical=not horizontal))
    piso = z0 if piso is None else piso
    teto = z1 if teto is None else teto
    alt = max(0.04, min(teto, z1) - piso - 0.025)
    return it.gaveta(x1 - x0 - 0.014, prof, alt, objs, x=xc, y_frente=yface + ESP, z=piso + 0.003, cor=caixa_cor)


def painel_grade(x0, x1, z0, z1, yface, n, cor, cor2, quadro=0.03, centro="cor", esp=ESP):
    """Folha de porta de correr: quadro (cor2) com travessas horizontais e miolo colorido, ou espelho no meio."""
    w, h = x1 - x0, z1 - z0
    xc = (x0 + x1) / 2
    q = quadro
    obs = []
    if centro == "espelho":
        obs.append(mb.caixa(w - 2 * q + 0.012, esp * 0.3, h - 2 * q + 0.012, x=xc, y=yface + esp * 0.55, z=z0 + q - 0.006,
                            cor=None, mat="espelho", bisel=0.002))
        for k, (dz, lg) in enumerate(((0.62, 0.016), (0.55, 0.008))):
            ri = mb.caixa(lg, 0.002, h * 0.42, cor="branco", bisel=0.0008, seg=1)
            mb.transforma(ri, rot=("Y", 32))
            mb.transforma(ri, loc=(xc + 0.03 + k * 0.05, yface + esp * 0.38, z0 + h * dz - h * 0.2))
            obs.append(ri)
    else:
        obs.append(mb.caixa(w - 0.006, esp * 0.5, h - 0.006, x=xc, y=yface + esp * 0.6, z=z0 + 0.003, cor=cor,
                            bisel=0.004))
    c = dict(cor=cor2, bisel=0.006)
    obs.append(mb.caixa(w, esp, q, x=xc, y=yface + esp / 2, z=z0, **c))
    obs.append(mb.caixa(w, esp, q, x=xc, y=yface + esp / 2, z=z1 - q, **c))
    obs.append(mb.caixa(q, esp, h - 2 * q + 0.004, x=x0 + q / 2, y=yface + esp / 2, z=z0 + q - 0.002, **c))
    obs.append(mb.caixa(q, esp, h - 2 * q + 0.004, x=x1 - q / 2, y=yface + esp / 2, z=z0 + q - 0.002, **c))
    if centro != "espelho":
        for k in range(1, n):
            zz = z0 + q + (h - 2 * q) * k / n
            obs.append(mb.caixa(w - 2 * q + 0.004, esp * 0.75, q * 0.6, x=xc, y=yface + esp * 0.45, z=zz - q * 0.3,
                                cor=cor2, bisel=0.004))
    return obs


def porta_vazada(x0, x1, z0, z1, yface, celulas, cor, esp=ESP, folga=FOLGA):
    """Folha feita de blocos empilhados, cada um com um recorte (pílula, pílula alta ou círculo) que deixa ver dentro."""
    w = x1 - x0 - 2 * folga
    h = z1 - z0 - 2 * folga
    xc = (x0 + x1) / 2
    tot = sum(f for _, f in celulas)
    z = z0 + folga
    obs = []
    for forma, fr in celulas:
        hc = h * fr / tot - 0.004
        ext = mb.ret_arredondado(w, hc, 0.012, 5)
        if forma == "circulo":
            d = min(w * 0.58, hc * 0.7)
            inn = mb.ret_arredondado(d, d, d / 2, 5)
        else:
            wi = w * 0.52
            hi = hc * (0.78 if forma == "pilula_alta" else 0.66)
            inn = mb.ret_arredondado(wi, hi, wi / 2, 5)
        obs.append(anel_xz(desloca(ext, xc, z + hc / 2), desloca(inn, xc, z + hc / 2), esp, yface, cor, bisel=0.006))
        z += hc + 0.004
    return obs


def puxador(tipo="bola", x=0.0, y=0.0, z=0.0, cor="ouro", tam=1.0, vertical=True):
    """Puxador da base, com a bolinha mais leve (a da base tem 24 segmentos: ~600 triângulos por puxador)."""
    if tipo == "bola":
        s = tam
        return mb.junta([mb.cilindro(0.008 * s, 0.014 * s, x=x, y=y - 0.007 * s, z=z, cor=cor, eixo="y", seg=10,
                                     bisel=0.002),
                         mb.esfera(0.017 * s, x=x, y=y - 0.024 * s, z=z, cor=cor, esc=(1, 0.8, 1), seg=14)], "puxador")
    return mb.puxador(tipo, x=x, y=y, z=z, cor=cor, tam=tam, vertical=vertical)


def pes(tipo, l, p, a, cor, r=0.03, recuo=0.05, abre=0.0):
    return mb.quatro_pes(tipo, l, p, a, cor, r=r, recuo=recuo, abre=abre)


def col_casco(l, p, a, x=0.0, y=0.0, z=0.0, e=0.03, fundo=True):
    """Caixas de colisão de um corpo aberto (laterais, base, topo e fundo), para pôr coisas dentro dos vãos."""
    cx = [((x - l / 2 + e / 2, y, z), (e, p, a)), ((x + l / 2 - e / 2, y, z), (e, p, a)),
          ((x, y, z), (l, p, e)), ((x, y, z + a - e), (l, p, e))]
    if fundo:
        cx.append(((x, y + p / 2 - 0.01, z), (l, 0.02, a)))
    return cx


# =====================================================================================================================
# ARMÁRIOS
# =====================================================================================================================
def guarda_roupa_correr_espelho(it, cor, painel, quadro):
    """Como na referência: uma coluna de prateleiras abertas à esquerda e três folhas de correr (grade miúda, espelho,
    grade larga) cobrindo o resto."""
    L, P, A = 2.0, 0.62, 2.1
    z0 = 0.06
    it.add(mb.caixa(L - 0.08, P - 0.08, z0 + 0.01, cor=quadro, bisel=0.012))
    c = Cx(it, L, A - z0, P, z0=z0, e=0.045, r_ext=0.05, r_int=0.014, cor=cor)
    xa = c.x0 + 0.4  # divisória da coluna aberta
    rec = 0.065
    c.div(xa + 0.011, recuo=0.005)
    n = 6
    alt = (c.zi1 - c.zi0) / n
    for k in range(1, n):
        c.prat(c.zi0 + alt * k, c.x0, xa, recuo=0.005)
    for k in range(n):
        c.vao(f"aberta_{k + 1}", c.x0, xa, c.zi0 + alt * k, c.zi0 + alt * (k + 1) - 0.02, recuo=0.005)
    xi = xa + 0.022  # começo da parte com portas
    W = c.x1 - xi
    xb = xi + W / 2
    c.div(xb, recuo=rec)
    for k in range(1, 5):
        c.prat(c.zi0 + (c.zi1 - c.zi0) * k / 5, xi, xb - 0.011, recuo=rec)
    for k in range(5):
        c.vao(f"prateleira_{k + 1}", xi, xb - 0.011, c.zi0 + (c.zi1 - c.zi0) * k / 5,
              c.zi0 + (c.zi1 - c.zi0) * (k + 1) / 5 - 0.02, recuo=rec)
    hs = c.zi1 - 0.32
    c.prat(hs, xb + 0.011, c.x1, recuo=rec)
    c.vao("maleiro", xb + 0.011, c.x1, hs, c.zi1, recuo=rec)
    c.cabideiro(xb + 0.011, c.x1, hs - 0.07)
    c.prat(c.zi0 + 0.36, xb + 0.011, c.x1, recuo=rec)
    c.vao("sapatos", xb + 0.011, c.x1, c.zi0, c.zi0 + 0.34, recuo=rec)
    wp = W / 3 + 0.02
    zA, zB = c.zi0 + 0.004, c.zi1 - 0.004
    ytras, yfrente = c.yf + 0.034, c.yf + 0.008
    it.correr(painel_grade(xi + 0.002, xi + wp, zA, zB, ytras, 7, painel, quadro, quadro=0.026), direcao=(1, 0, 0),
              curso=wp - 0.04)
    it.correr(painel_grade(c.x1 - wp, c.x1 - 0.002, zA, zB, ytras, 5, painel, quadro), direcao=(-1, 0, 0),
              curso=wp - 0.04)
    xm = xi + W / 2
    it.correr(painel_grade(xm - wp / 2, xm + wp / 2, zA, zB, yfrente, 1, painel, quadro, centro="espelho"),
              direcao=(-1, 0, 0), curso=wp - 0.04)


def guarda_roupa_portas_vazadas(it, cor, portas, interno):
    L, P, A = 2.1, 0.6, 1.95
    c = Cx(it, L, A, P, z0=0.0, e=0.05, r_ext=0.05, r_int=0.014, cor=cor, cor_int=interno)
    xm = c.x
    c.div(xm)
    alt = (c.zi1 - c.zi0) / 5
    for k in range(1, 5):
        c.prat(c.zi0 + alt * k, c.x0, xm - 0.011)
    for k in range(5):
        c.vao(f"prateleira_{k + 1}", c.x0, xm - 0.011, c.zi0 + alt * k, c.zi0 + alt * (k + 1) - 0.02)
    hs = c.zi1 - 0.3
    c.prat(hs, xm + 0.011, c.x1)
    c.vao("maleiro", xm + 0.011, c.x1, hs, c.zi1)
    c.cabideiro(xm + 0.011, c.x1, hs - 0.07)
    c.prat(c.zi0 + 0.3, xm + 0.011, c.x1)
    c.vao("sapatos", xm + 0.011, c.x1, c.zi0, c.zi0 + 0.28)
    W = c.x1 - c.x0
    xs = [c.x0 + W * k / 4 for k in range(5)]
    yface = c.yf + 0.003
    vaz = [("pilula", 0.3), ("pilula_alta", 0.44), ("circulo", 0.26)]
    for k in range(4):
        lado = "esq" if k < 2 else "dir"  # as duas do meio abrem como um par, sem bater uma na outra
        if k in (1, 2):
            obs = porta_vazada(xs[k], xs[k + 1], c.zi0, c.zi1, yface, vaz if k == 1 else vaz[::-1], portas)
            piv = (xs[k] + FOLGA, yface, c.zi0) if lado == "esq" else (xs[k + 1] - FOLGA, yface, c.zi0)
            it.porta(obs, dobradica=piv, lado=lado)
        else:
            porta(it, xs[k], xs[k + 1], c.zi0, c.zi1, c.yf, lado=lado, cor=portas, pux="botao", pcor=interno,
                  pz=c.zi0 + 0.95)


def armario_2portas_gaveta(it, cor, frente, pcor, pecor):
    L, P, A = 0.82, 0.46, 1.66
    z0 = 0.075
    it.add(pes("bola", L, P, 0.085, pecor, r=0.03, recuo=0.07))
    c = Cx(it, L, A - z0, P, z0=z0, e=0.036, r_ext=0.04, r_int=0.01, cor=cor)
    zd = c.zi0 + 0.25
    c.prat(zd)
    hs = c.zi1 - 0.27
    c.prat(hs)
    c.vao("maleiro", c.x0, c.x1, hs, c.zi1)
    c.cabideiro(c.x0, c.x1, hs - 0.065)
    par_portas(it, c.x0, c.x1, zd, c.zi1, c.yf, cor=frente, pcor=pcor, pz=zd + 0.5)
    gaveta(it, c.x0, c.x1, c.zi0, zd, c.yf, P - 0.08, piso=c.zi0, teto=zd - 0.02, cor=frente, pcor=pcor, dois=True)


def armario_porta_gaveta_rodape(it, cor, interno, frente, pcor):
    L, P, A = 0.72, 0.42, 1.72
    it.add(mb.caixa(L + 0.04, P + 0.035, 0.1, cor=cor, bisel=0.035, seg=4))
    c = Cx(it, L, A - 0.17, P, z0=0.095, e=0.04, r_ext=0.03, r_int=0.01, cor=cor, cor_int=interno)
    it.add(mb.caixa(L + 0.055, P + 0.045, 0.075, z=c.topo - 0.005, cor=cor, bisel=0.035, seg=4))
    zd = c.zi0 + 0.3
    c.prat(zd)
    for k, h in enumerate((zd + 0.34, zd + 0.68)):
        c.prat(h)
    hs = [zd, zd + 0.34, zd + 0.68, c.zi1 + 0.02]
    for k in range(3):
        c.vao(f"prateleira_{k + 1}", c.x0, c.x1, hs[k], hs[k + 1] - 0.02)
    porta(it, c.x0, c.x1, zd, c.zi1, c.yf, lado="esq", cor=frente, pcor=pcor, pz=zd + 0.42)
    gaveta(it, c.x0, c.x1, c.zi0, zd, c.yf, P - 0.08, teto=zd - 0.02, cor=frente, pcor=pcor, dois=True)


def armario_vitrine(it, cor, interno, gav, pcor, pecor):
    L, P, A = 0.8, 0.42, 1.7
    z0 = 0.07
    it.add(pes("conico", L, P, 0.08, pecor, r=0.024, recuo=0.06))
    c = Cx(it, L, A - z0, P, z0=z0, e=0.042, r_ext=0.04, r_int=0.012, cor=cor, cor_int=interno)
    zd = c.zi0 + 0.23
    c.prat(zd)
    alt = (c.zi1 - zd) / 3
    for k in (1, 2):
        c.prat(zd + alt * k)
    for k in range(3):
        c.vao(f"prateleira_{k + 1}", c.x0, c.x1, zd + alt * k, zd + alt * (k + 1) - 0.02)
    par_portas(it, c.x0, c.x1, zd, c.zi1, c.yf, estilo="vidro", cor=cor, cor2=cor, pcor=pcor, pz=zd + 0.36,
               margem=0.045)
    gaveta(it, c.x0, c.x1, c.zi0, zd, c.yf, P - 0.08, teto=zd - 0.02, estilo="moldura", cor=gav, cor2=cor,
           pcor=pcor, dois=True, margem=0.03)


def guarda_roupa_retro(it, cor, frente, pcor, pecor):
    L, P, A = 1.05, 0.55, 1.6
    z0 = 0.2
    it.add(pes("palito", L - 0.12, P - 0.08, z0 + 0.02, pecor, r=0.026, recuo=0.06, abre=7))
    c = Cx(it, L, A - z0, P, z0=z0, e=0.055, r_ext=0.15, r_int=0.07, cor=cor)
    zd = c.zi0 + 0.26
    c.prat(zd)
    c.div(c.x, c.zi0, zd)
    hs = c.zi1 - 0.24
    c.prat(hs)
    c.vao("maleiro", c.x0, c.x1, hs, c.zi1)
    c.cabideiro(c.x0, c.x1, hs - 0.065)
    par_portas(it, c.x0, c.x1, zd, c.zi1, c.yf, cor=frente, pcor=cor, pz=zd + 0.45)
    for x0_, x1_ in ((c.x0, c.x - 0.011), (c.x + 0.011, c.x1)):
        gaveta(it, x0_, x1_, c.zi0, zd, c.yf, P - 0.08, teto=zd - 0.02, cor=frente, pcor=cor)


def guarda_roupa_3portas(it, cor, frente, pcor, estilo="almofada"):
    L, P, A = 1.38, 0.58, 2.02
    z0 = 0.07
    it.add(mb.caixa(L - 0.06, P - 0.06, z0 + 0.01, cor=cor, bisel=0.012))
    c = Cx(it, L, A - z0, P, z0=z0, e=0.036, r_ext=0.035, r_int=0.01, cor=cor)
    W = c.x1 - c.x0
    xa = c.x0 + W / 3
    zd1, zd2 = c.zi0 + 0.22, c.zi0 + 0.44
    c.prat(zd1)
    c.prat(zd2)
    c.div(c.x, c.zi0, zd2 - 0.02)
    c.div(xa, zd2, c.zi1)
    alt = (c.zi1 - zd2) / 5
    for k in range(1, 5):
        c.prat(zd2 + alt * k, c.x0, xa - 0.011)
    for k in range(5):
        c.vao(f"prateleira_{k + 1}", c.x0, xa - 0.011, zd2 + alt * k, zd2 + alt * (k + 1) - 0.02)
    hs = c.zi1 - 0.28
    c.prat(hs, xa + 0.011, c.x1)
    c.vao("maleiro", xa + 0.011, c.x1, hs, c.zi1)
    c.cabideiro(xa + 0.011, c.x1, hs - 0.065)
    pz = zd2 + 0.55
    porta(it, c.x0, xa, zd2, c.zi1, c.yf, lado="esq", estilo=estilo, cor=frente, pux="barra", pcor=pcor, pz=pz)
    par_portas(it, xa, c.x1, zd2, c.zi1, c.yf, estilo=estilo, cor=frente, pux="barra", pcor=pcor, pz=pz)
    for z0_, z1_ in ((c.zi0, zd1), (zd1, zd2)):
        for x0_, x1_ in ((c.x0, c.x - 0.011), (c.x + 0.011, c.x1)):
            gaveta(it, x0_, x1_, z0_, z1_, c.yf, P - 0.08, teto=z1_ - 0.02, estilo="lisa", cor=frente, pux="alca",
                   pcor=pcor)


def guarda_roupa_casinha(it, cor, frente, telhado, pcor):
    L, P = 0.92, 0.5
    Hp, Ht = 1.38, 1.8
    z0 = 0.06
    it.add(pes("bloco", L - 0.1, P - 0.08, z0 + 0.01, telhado, r=0.025, recuo=0.05))
    e = 0.045
    casa = [(-L / 2, z0), (L / 2, z0), (L / 2, Hp), (0, Ht), (-L / 2, Hp)]
    obs, inn = nicho_forma(casa, e, P, -P / 2, 0.04, 0.012, cor)
    it.add(obs)
    # beiral do telhado: duas tábuas na cor do telhado por cima das águas, e a chaminé atravessando a da direita
    ang = math.atan2(Ht - Hp, L / 2)
    for s in (-1, 1):
        lg = math.hypot(L / 2, Ht - Hp) + 0.07
        tb = mb.caixa(lg, P + 0.04, 0.04, cor=telhado, bisel=0.015)
        mb.transforma(tb, rot=("Y", s * math.degrees(ang)))
        mb.transforma(tb, loc=(s * (L / 4 + 0.01 * math.sin(ang)), 0, (Hp + Ht) / 2 - 0.02 + 0.01 * math.cos(ang)))
        it.add(tb)
    xch, wch = 0.27, 0.06
    zsl = Ht - (Ht - Hp) * (xch + wch / 2) / (L / 2)
    it.add(mb.caixa(wch, 0.1, 0.24, x=xch, y=0.06, z=zsl + 0.012, cor=telhado, bisel=0.015))
    x0, x1 = -L / 2 + e, L / 2 - e
    yf = -P / 2
    yb = P / 2 - 0.02
    zi0 = z0 + e
    zd = zi0 + 0.24
    zt = Hp - e - 0.006
    for h in (zd, zt):
        it.add(mb.caixa(x1 - x0 + 0.004, yb - yf - 0.027, 0.02, y=(yf + 0.03 + yb) / 2, z=h - 0.02, cor=cor,
                        bisel=0.005))
    yc = (yf + 0.03 + yb) / 2
    zc = zt - 0.09
    it.add(mb.tubo([(x0 - 0.004, yc, zc), (x1 + 0.004, yc, zc)], 0.013, cor="cromo"))
    it.slot("cabideiro", (0, yc, zd), (x1 - x0 - 0.02, yb - yf - 0.06, zc - zd - 0.03))
    it.slot("sotao", (0, yc, zt), (0.4, yb - yf - 0.06, 0.25))
    # janelinha redonda no sótão (só enfeite, na frente do fundo)
    it.add(mb.cilindro(0.075, 0.012, x=0, y=yb - 0.004, z=zt + 0.17, cor="amarelo_claro", eixo="y", seg=24,
                       bisel=0.004))
    par_portas(it, x0, x1, zd, zt, yf, cor=frente, pcor=pcor, pz=zd + 0.42, estilo="moldura",
               cor2=frente, margem=0.035)
    gaveta(it, x0, x1, zi0, zd, yf, P - 0.08, teto=zd - 0.02, cor=frente, pcor=pcor, dois=True)


def armario_estante_gaveta(it, cor, interno, gav, pcor, pecor):
    L, P, A = 0.76, 0.4, 1.62
    z0 = 0.07
    it.add(pes("bola", L, P, 0.08, pecor, r=0.028, recuo=0.07))
    c = Cx(it, L, A - z0, P, z0=z0, e=0.038, r_ext=0.04, r_int=0.01, cor=cor, cor_int=interno)
    zd = c.zi0 + 0.25
    c.prat(zd)
    alt = (c.zi1 - zd) / 3
    for k in (1, 2):
        c.prat(zd + alt * k)
    for k in range(3):
        c.vao(f"prateleira_{k + 1}", c.x0, c.x1, zd + alt * k, zd + alt * (k + 1) - 0.02)
    gaveta(it, c.x0, c.x1, c.zi0, zd, c.yf, P - 0.08, teto=zd - 0.02, cor=gav, pcor=pcor, dois=True)
    it.colisao(col_casco(L, P, A - z0, z=z0, e=0.038) + [((0, 0, 0), (L, P, zd))])


def comoda(it, cor, frente, tampo, pcor, pecor):
    L, P, A = 0.96, 0.48, 0.92
    z0 = 0.1
    it.add(pes("conico", L - 0.04, P - 0.04, z0 + 0.01, pecor, r=0.025, recuo=0.05))
    c = Cx(it, L, A - z0 - 0.035, P, z0=z0, e=0.034, r_ext=0.025, r_int=0.008, cor=cor)
    it.add(mb.caixa(L + 0.035, P + 0.025, 0.04, z=c.topo - 0.004, cor=tampo, bisel=0.015))
    H = c.zi1 - c.zi0
    zs = [c.zi0, c.zi0 + H * 0.36, c.zi0 + H * 0.68, c.zi1]
    for h in zs[1:3]:
        c.prat(h + 0.02)
    c.div(c.x, zs[2] + 0.02, c.zi1)
    gaveta(it, c.x0, c.x1, zs[0], zs[1] + 0.02, c.yf, P - 0.08, teto=zs[1], cor=frente, pcor=pcor, dois=True,
           estilo="almofada", cor2=frente, margem=0.03)
    gaveta(it, c.x0, c.x1, zs[1] + 0.02, zs[2] + 0.02, c.yf, P - 0.08, teto=zs[2], cor=frente, pcor=pcor, dois=True,
           estilo="almofada", cor2=frente, margem=0.03)
    for x0_, x1_ in ((c.x0, c.x - 0.011), (c.x + 0.011, c.x1)):
        gaveta(it, x0_, x1_, zs[2] + 0.02, c.zi1, c.yf, P - 0.08, cor=frente, pcor=pcor, estilo="almofada",
               cor2=frente, margem=0.03)
    it.slot("tampo", (0, 0, c.topo + 0.036), (L - 0.02, P - 0.02, 0.6))


def aparador(it, cor, painel, tampo, pcor):
    L, P = 1.12, 0.42
    z0 = 0.13
    it.add(pes("torneado", L - 0.03, P - 0.03, z0 + 0.01, cor, r=0.03, recuo=0.05))
    c = Cx(it, L, 0.64, P, z0=z0, e=0.034, r_ext=0.025, r_int=0.008, cor=cor)
    it.add(mb.caixa(L + 0.06, P + 0.05, 0.045, z=c.topo - 0.004, cor=tampo, bisel=0.018))
    zm = c.zi0 + (c.zi1 - c.zi0) / 2
    c.prat(zm)
    c.vao("baixo", c.x0, c.x1, c.zi0, zm - 0.02)
    c.vao("cima", c.x0, c.x1, zm, c.zi1)
    par_portas(it, c.x0, c.x1, c.zi0, c.zi1, c.yf, estilo="moldura", cor=painel, cor2=cor, pcor=pcor, margem=0.05)
    it.slot("tampo", (0, 0, c.topo + 0.041), (L, P, 0.6))


def guarda_roupa_correr_ripas(it, cor, ripas, fundo_ripas, pcor):
    L, P, A = 1.62, 0.62, 2.05
    z0 = 0.06
    it.add(mb.caixa(L - 0.06, P - 0.06, z0 + 0.01, cor=cor, bisel=0.012))
    c = Cx(it, L, A - z0, P, z0=z0, e=0.04, r_ext=0.04, r_int=0.012, cor=cor)
    rec = 0.06
    c.div(c.x, recuo=rec)
    alt = (c.zi1 - c.zi0) / 5
    for k in range(1, 5):
        c.prat(c.zi0 + alt * k, c.x0, c.x - 0.011, recuo=rec)
    for k in range(5):
        c.vao(f"prateleira_{k + 1}", c.x0, c.x - 0.011, c.zi0 + alt * k, c.zi0 + alt * (k + 1) - 0.02, recuo=rec)
    hs = c.zi1 - 0.3
    c.prat(hs, c.x + 0.011, c.x1, recuo=rec)
    c.vao("maleiro", c.x + 0.011, c.x1, hs, c.zi1, recuo=rec)
    c.cabideiro(c.x + 0.011, c.x1, hs - 0.07)
    W = c.x1 - c.x0
    wp = W / 2 + 0.02
    zA, zB = c.zi0 + 0.004, c.zi1 - 0.004
    for x0_, x1_, yy, d in ((c.x0 + 0.002, c.x0 + wp, c.yf + 0.034, 1), (c.x1 - wp, c.x1 - 0.002, c.yf + 0.008, -1)):
        f = mb.frente(x1_ - x0_, zB - zA, esp=ESP, estilo="ripas", cor=ripas, cor2=fundo_ripas)
        mb.transforma(f, loc=((x0_ + x1_) / 2, yy + ESP, zA))
        xh = x1_ - 0.05 if d == 1 else x0_ + 0.05
        h = mb.caixa(0.03, 0.02, 0.5, x=xh, y=yy - 0.008, z=zA + 0.75, cor=pcor, bisel=0.008)
        it.correr([f, h], direcao=(d, 0, 0), curso=wp - 0.06)


def armario_alto_estreito(it, cor, frente, pcor):
    L, P, A = 0.52, 0.42, 1.82
    z0 = 0.055
    it.add(pes("bloco", L - 0.02, P - 0.02, z0 + 0.01, cor, r=0.022, recuo=0.035))
    c = Cx(it, L, A - z0, P, z0=z0, e=0.034, r_ext=0.035, r_int=0.01, cor=cor)
    n = 5
    alt = (c.zi1 - c.zi0) / n
    for k in range(1, n):
        c.prat(c.zi0 + alt * k)
    for k in range(n):
        c.vao(f"prateleira_{k + 1}", c.x0, c.x1, c.zi0 + alt * k, c.zi0 + alt * (k + 1) - 0.02)
    porta(it, c.x0, c.x1, c.zi0, c.zi1, c.yf, lado="esq", estilo="almofada", cor=frente, pcor=pcor,
          pz=c.zi0 + 0.85, margem=0.05)


def cristaleira(it, cor, frente, pcor):
    L, P, A = 0.96, 0.45, 1.92
    it.add(mb.caixa(L + 0.04, P + 0.035, 0.09, cor=cor, bisel=0.03, seg=4))
    c = Cx(it, L, A - 0.16, P, z0=0.085, e=0.038, r_ext=0.03, r_int=0.01, cor=cor)
    it.add(mb.caixa(L + 0.05, P + 0.045, 0.07, z=c.topo - 0.005, cor=cor, bisel=0.03, seg=4))
    zb = c.zi0 + 0.5
    zg = zb + 0.17
    c.prat(zb)
    c.prat(zg)
    c.div(c.x, zb, zg - 0.02)
    alt = (c.zi1 - zg) / 3
    for k in (1, 2):
        c.prat(zg + alt * k)
    for k in range(3):
        c.vao(f"vitrine_{k + 1}", c.x0, c.x1, zg + alt * k, zg + alt * (k + 1) - 0.02)
    c.vao("baixo", c.x0, c.x1, c.zi0, zb - 0.02)
    par_portas(it, c.x0, c.x1, zg, c.zi1, c.yf, estilo="trelica", cor=frente, cor2=frente, pcor=pcor, pz=zg + 0.3,
               margem=0.04)
    par_portas(it, c.x0, c.x1, c.zi0, zb, c.yf, estilo="almofada", cor=frente, cor2=frente, pcor=pcor, pz=zb - 0.1,
               margem=0.045)
    for x0_, x1_ in ((c.x0, c.x - 0.011), (c.x + 0.011, c.x1)):
        gaveta(it, x0_, x1_, zb, zg, c.yf, P - 0.08, teto=zg - 0.02, cor=frente, pcor=pcor)


def guarda_roupa_maleiro(it, cor, frente, pcor):
    L, P, A = 1.02, 0.58, 2.12
    z0 = 0.06
    it.add(pes("bloco", L - 0.02, P - 0.02, z0 + 0.01, cor, r=0.025, recuo=0.04))
    c = Cx(it, L, A - z0, P, z0=z0, e=0.036, r_ext=0.035, r_int=0.01, cor=cor)
    zm = c.zi1 - 0.38
    c.prat(zm)
    c.vao("maleiro", c.x0, c.x1, zm, c.zi1)
    c.prat(c.zi0 + 0.3)
    c.vao("sapatos", c.x0, c.x1, c.zi0, c.zi0 + 0.28)
    c.cabideiro(c.x0, c.x1, zm - 0.09)
    par_portas(it, c.x0, c.x1, c.zi0, zm, c.yf, estilo="recorte", cor=frente, cor2=cor, pcor=pcor, pz=c.zi0 + 0.85,
               recorte="arco", margem=0.06)
    # basculante do maleiro: dobradiça em cima, abre para cima
    w, h = c.x1 - c.x0 - 2 * FOLGA, c.zi1 - zm - 2 * FOLGA
    pr = _prot("moldura", {})
    yface = c.yf + 0.003 + pr
    f = mb.frente(w, h, esp=ESP, estilo="moldura", cor=frente, cor2=cor, margem=0.045)
    mb.transforma(f, loc=(c.x, yface + ESP, zm + FOLGA))
    px = puxador("alca", x=c.x, y=yface - pr, z=zm + 0.05, cor=pcor, vertical=False)
    it.porta([f, px], dobradica=(c.x, yface, c.zi1 - FOLGA), eixo="x", lado="cima", abre_graus=95)


def pacote_closet02(it):
    pc = mb.importa_pacote("Closet_02")
    lo, hi = mb.bbox(list(pc.values()))
    dy = -(lo.y + hi.y) / 2
    for o in pc.values():
        o.data.transform(mb.Matrix.Translation((0, dy, 0)))
    it.add(pc.pop("corpo"))
    for nm, ob in sorted(pc.items()):
        lo_, hi_ = mb.bbox(ob)
        esq = (lo_.x + hi_.x) / 2 < 0
        it.porta([ob], dobradica=((lo_.x if esq else hi_.x), lo_.y, lo_.z), lado="esq" if esq else "dir")
    yb = -0.1 + dy
    yfr = -0.35 + dy
    zs = [0.272, 0.527, 0.887, 1.229, 1.5]
    for k in range(4):
        it.slot(f"prateleira_{k + 1}", (0, (yb + yfr) / 2, zs[k]), (0.6, yb - yfr - 0.01, zs[k + 1] - zs[k] - 0.03))


# =====================================================================================================================
# ESTANTES
# =====================================================================================================================
def estante_nichos(it, cor, cols, rows):
    cel, e, ei = 0.33, 0.04, 0.024
    P = 0.36
    L = cols * cel + 2 * e + (cols - 1) * ei
    A = rows * cel + 2 * e + (rows - 1) * ei
    c = Cx(it, L, A, P, z0=0.0, e=e, r_ext=0.06, r_int=0.014, cor=cor)
    for i in range(1, cols):
        c.div(c.x0 + i * (cel + ei) - ei / 2, t=ei, recuo=0.005)
    for j in range(1, rows):
        c.prat(c.zi0 + j * (cel + ei), t=ei, recuo=0.005)
    for j in range(rows):
        for i in range(cols):
            x0 = c.x0 + i * (cel + ei)
            z = c.zi0 + j * (cel + ei)
            c.vao(f"nicho_{j + 1}_{i + 1}", x0, x0 + cel, z, z + cel, recuo=0.005)
    it.colisao(col_casco(L, P, A, e=e))


def estante_escada(it, cor):
    cel, e, ei = 0.3, 0.04, 0.024
    P = 0.34
    n = 3
    passo = cel + ei
    L = n * cel + (n - 1) * ei + 2 * e
    x0 = -L / 2
    H = [2 * e + (n - k) * passo - ei for k in range(n)]  # altura de fora da coluna k (0 = a da esquerda, a mais alta)
    xr = [x0 + 2 * e + k * passo + cel for k in range(n)]  # espelho do degrau à direita da coluna k
    pts = [(x0, 0.0), (x0 + L, 0.0), (x0 + L, H[n - 1])]
    for k in range(n - 2, -1, -1):
        pts += [(xr[k], H[k + 1]), (xr[k], H[k])]
    pts.append((x0, H[0]))
    obs, inn = nicho_forma(pts, e, P, -P / 2, 0.05, 0.012, cor)
    it.add(obs)
    yfr, yb = -P / 2 + 0.005, P / 2 - 0.02
    yc, d = (yfr + yb) / 2, yb - yfr + 0.003
    for k in range(n - 1):  # divisória entre a coluna k e a k+1, até o teto da coluna k+1
        xd = x0 + e + k * passo + cel + ei / 2
        topo = e + (n - k - 1) * passo - ei
        it.add(mb.caixa(ei, d, topo - e + 0.004, x=xd, y=yc + 0.0015, z=e - 0.002, cor=cor, bisel=0.005))
    for j in range(1, n):  # prateleira do nível j: das colunas que ainda sobem
        zt = e + j * passo
        xa, xb = x0 + e - 0.002, x0 + e + (n - j - 1) * passo + cel + 0.002
        it.add(mb.caixa(xb - xa, d, ei, x=(xa + xb) / 2, y=yc + 0.0015, z=zt - ei, cor=cor, bisel=0.005))
    for k in range(n):
        for j in range(n - k):
            xa = x0 + e + k * passo
            it.slot(f"nicho_{k + 1}_{j + 1}", (xa + cel / 2, yc, e + j * passo), (cel - 0.01, yb - yfr - 0.01, cel - 0.01))
    col = [((0, 0, 0), (L, P, e)), ((x0 + e / 2, 0, 0), (e, P, H[0])), ((x0 + L - e / 2, 0, 0), (e, P, H[n - 1]))]
    for k in range(n):
        col.append(((x0 + e + k * passo + cel / 2, P / 2 - 0.012, 0), (passo, 0.024, H[k])))
    it.colisao(col)


def _sem_repetidos(pts):
    out = []
    for p in pts:
        if not out or (abs(out[-1][0] - p[0]) > 1e-6 or abs(out[-1][1] - p[1]) > 1e-6):
            out.append(p)
    if abs(out[0][0] - out[-1][0]) < 1e-6 and abs(out[0][1] - out[-1][1]) < 1e-6:
        out.pop()
    return out


def estante_tubos(it, cor, poste, niveis, L):
    P, t = 0.3, 0.045
    vao = 0.34
    zs = []
    z = 0.0
    for k in range(niveis):
        it.add(mb.caixa(L, P, t, z=z, cor=cor, bisel=0.018, seg=4))
        zs.append(z + t)
        if k < niveis - 1:
            for sx in (-1, 1):
                for sy in (-1, 1):
                    it.add(mb.cilindro(0.017, vao + 0.01, x=sx * (L / 2 - 0.07), y=sy * (P / 2 - 0.06), z=z + t - 0.005,
                                       cor=poste, seg=16, bisel=0.003))
            z += t + vao
    for k, zz in enumerate(zs):
        it.slot(f"prateleira_{k + 1}", (0, 0, zz), (L - 0.04, P - 0.04, vao - 0.03 if k < niveis - 1 else 0.5))
    it.colisao([((0, 0, zz - t), (L, P, t)) for zz in zs])


def prateleira_parede_simples(it, cor):
    L, P, t = 0.8, 0.18, 0.04
    y = -P / 2
    it.add(mb.caixa(L, P, t, y=y, cor=cor, bisel=0.014, seg=4))
    it.add(mb.caixa(L, 0.03, 0.035, y=-P + 0.016, z=t - 0.008, cor=cor, bisel=0.012))
    it.add(mb.caixa(L - 0.02, 0.02, 0.07, y=-0.012, z=t - 0.01, cor=cor, bisel=0.008))
    it.slot("prateleira", (0, -P / 2 + 0.01, t), (L - 0.04, P - 0.06, 0.4))


def prateleira_parede_barra(it, cor, barra):
    L, P, t = 0.7, 0.2, 0.035
    it.add(mb.caixa(L, P, t, y=-P / 2, cor=cor, bisel=0.012, seg=4))
    for s in (-1, 1):
        it.add(mb.caixa(0.04, P, 0.17, x=s * (L / 2 - 0.02), y=-P / 2, z=0, cor=cor, bisel=0.016, seg=4))
    it.add(mb.cilindro(0.012, L - 0.06, x=0, y=-P + 0.035, z=0.13, cor=barra, eixo="x", seg=16, bisel=0.003))
    it.add(mb.caixa(L - 0.06, 0.02, 0.1, y=-0.012, z=t - 0.005, cor=cor, bisel=0.008))
    it.slot("prateleira", (0, -P / 2 + 0.01, t), (L - 0.1, P - 0.06, 0.35))


def nicho_parede(it, forma, cor, interno=None):
    P = 0.2
    e = 0.035
    if forma == "hexagono":
        R = 0.2
        pts = mb.poligono(6, R)
        pts = [(x, z + R * math.sin(math.pi / 3)) for x, z in pts]
        obs, inn = nicho_forma(pts, e, P, -P, 0.03, 0.012, cor, cor_fundo=interno)
        it.add(obs)
        it.slot("nicho", (0, -P / 2 + 0.01, e), (R * 1.2, P - 0.04, 2 * R * math.sin(math.pi / 3) - 2 * e - 0.01))
    elif forma == "cubo":
        Ld = 0.34
        it.add(casco(Ld, Ld, P, e, 0.04, 0.012, y=-P / 2, cor=cor, cor_fundo=interno))
        it.slot("nicho", (0, -P / 2 + 0.01, e), (Ld - 2 * e - 0.01, P - 0.04, Ld - 2 * e - 0.01))
    else:  # casinha (1 ou 2 andares)
        duplo = forma == "casinha_dupla"
        Ld = 0.3 if not duplo else 0.32
        Hp = 0.24 if not duplo else 0.42
        Ht = Hp + 0.14
        pts = [(-Ld / 2, 0), (Ld / 2, 0), (Ld / 2, Hp), (0, Ht), (-Ld / 2, Hp)]
        obs, inn = nicho_forma(pts, e, P, -P, 0.03, 0.012, cor, cor_fundo=interno)
        it.add(obs)
        if duplo:
            hm = e + (Hp - e) / 2 + 0.01
            it.add(mb.caixa(Ld - 2 * e + 0.004, P - 0.02, 0.022, y=-P / 2 - 0.01, z=hm - 0.011, cor=cor, bisel=0.005))
            it.slot("andar_1", (0, -P / 2 + 0.01, e), (Ld - 2 * e - 0.01, P - 0.04, hm - e - 0.02))
            it.slot("andar_2", (0, -P / 2 + 0.01, hm + 0.011), (Ld - 2 * e - 0.01, P - 0.04, Hp - hm))
        else:
            it.slot("nicho", (0, -P / 2 + 0.01, e), (Ld - 2 * e - 0.01, P - 0.04, Hp - e))


def estante_retro(it, cor, prat, pecor):
    L, P, A = 0.68, 0.38, 1.38
    z0 = 0.17
    it.add(pes("palito", L - 0.1, P - 0.06, z0 + 0.02, pecor, r=0.024, recuo=0.05, abre=7))
    c = Cx(it, L, A - z0, P, z0=z0, e=0.05, r_ext=0.14, r_int=0.07, cor=cor, cor_int=cor)
    alt = (c.zi1 - c.zi0) / 4
    for k in (1, 2, 3):
        c.prat(c.zi0 + alt * k, cor=prat, t=0.026, recuo=0.005)
    for k in range(4):
        c.vao(f"prateleira_{k + 1}", c.x0 + 0.03, c.x1 - 0.03, c.zi0 + alt * k + (0.02 if k == 0 else 0),
              c.zi0 + alt * (k + 1) - 0.026, recuo=0.005)
    it.colisao(col_casco(L, P, A - z0, z=z0, e=0.05) + [((0, 0, 0), (L - 0.1, P - 0.06, z0))])


def estante_simples(it, cor, interno):
    L, P, A = 0.6, 0.33, 1.3
    c = Cx(it, L, A, P, z0=0.0, e=0.045, r_ext=0.035, r_int=0.012, cor=cor, cor_int=interno)
    n = 5
    alt = (c.zi1 - c.zi0) / n
    for k in range(1, n):
        c.prat(c.zi0 + alt * k, t=0.026, recuo=0.005)
    for k in range(n):
        c.vao(f"prateleira_{k + 1}", c.x0, c.x1, c.zi0 + alt * k, c.zi0 + alt * (k + 1) - 0.026, recuo=0.005)
    it.colisao(col_casco(L, P, A, e=0.045))


def pacote_closet01(it):
    pc = mb.importa_pacote("Closet_01")
    lo, hi = mb.bbox(list(pc.values()))
    dy = -(lo.y + hi.y) / 2
    for o in pc.values():
        o.data.transform(mb.Matrix.Translation((0, dy, 0)))
    it.add(pc.pop("corpo"))
    fr = pc["Door"]
    lo_, hi_ = mb.bbox(fr)
    yb = -0.05 + dy
    yfr = lo_.y + 0.08
    it.gaveta(0.62, yb - (-0.355 + dy) - 0.02, 0.27, [fr], x=0, y_frente=-0.355 + dy, z=0.176, cor="pessego")
    zs = [0.517, 0.862, 1.203, 1.5]
    for k in range(3):
        it.slot(f"prateleira_{k + 1}", (0, (yb + yfr) / 2, zs[k]), (0.6, yb - yfr - 0.01, zs[k + 1] - zs[k] - 0.03))


# =====================================================================================================================
# SAPATEIRAS E BANCOS DE ENTRADA
# =====================================================================================================================
def banco_entrada(it, cor, pecor):
    L, P = 1.0, 0.34
    it.add(mb.caixa(L, P, 0.06, z=0.39, cor=cor, bisel=0.022, seg=4))
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.add(mb.cilindro(0.028, 0.395, x=sx * (L / 2 - 0.09), y=sy * (P / 2 - 0.07), z=0, r2=0.036, cor=pecor,
                               seg=16, bisel=0.006))
    it.add(mb.caixa(L - 0.14, 0.03, 0.03, y=0, z=0.12, cor=pecor, bisel=0.01))
    for sx in (-1, 1):
        it.add(mb.caixa(0.03, P - 0.12, 0.03, x=sx * (L / 2 - 0.09), y=0, z=0.12, cor=pecor, bisel=0.01))
    it.slot("assento", (0, 0, 0.45), (L - 0.04, P - 0.04, 0.5))
    it.slot("sapatos", (0, 0, 0.0), (L - 0.22, P - 0.1, 0.11))
    it.colisao([((0, 0, 0.39), (L, P, 0.06)), ((0, 0, 0), (L - 0.12, P - 0.1, 0.39))])


def banco_sapateira_nichos(it, cor, almofada, interno):
    L, P, A = 1.0, 0.38, 0.44
    c = Cx(it, L, A, P, z0=0.0, e=0.036, r_ext=0.03, r_int=0.01, cor=cor, cor_int=interno)
    W = c.x1 - c.x0
    xs = [c.x0 + W * k / 3 for k in range(4)]
    for x in xs[1:3]:
        c.div(x, recuo=0.005)
    zm = c.zi0 + (c.zi1 - c.zi0) / 2 + 0.01
    for k in range(3):
        c.prat(zm, xs[k] + (0.011 if k else 0), xs[k + 1] - (0.011 if k < 2 else 0), recuo=0.005)
        c.vao(f"nicho_baixo_{k + 1}", xs[k] + 0.011, xs[k + 1] - 0.011, c.zi0, zm - 0.02, recuo=0.005)
        c.vao(f"nicho_cima_{k + 1}", xs[k] + 0.011, xs[k + 1] - 0.011, zm, c.zi1, recuo=0.005)
    it.add(mb.almofada(L - 0.02, P - 0.02, 0.08, z=A - 0.012, cor=almofada, e=0.18, estufa=0.3))
    it.slot("assento", (0, 0, A + 0.06), (L - 0.06, P - 0.06, 0.4))
    it.colisao(col_casco(L, P, A, e=0.036) + [((0, 0, A - 0.01), (L, P, 0.08))])


def banco_bau(it, cor, tampa, almofada, pecor):
    L, P = 0.92, 0.42
    z0 = 0.06
    A = 0.32
    e = 0.03
    it.add(pes("bola", L, P, z0 + 0.01, pecor, r=0.026, recuo=0.06))
    c = dict(cor=cor, bisel=0.012, seg=3)
    it.add(mb.caixa(L, e, A, y=-P / 2 + e / 2, z=z0, **c), mb.caixa(L, e, A, y=P / 2 - e / 2, z=z0, **c))
    it.add(mb.caixa(e, P - 2 * e + 0.004, A, x=-L / 2 + e / 2, z=z0, **c),
           mb.caixa(e, P - 2 * e + 0.004, A, x=L / 2 - e / 2, z=z0, **c))
    it.add(mb.caixa(L - 2 * e + 0.004, P - 2 * e + 0.004, e, z=z0, cor=cor, bisel=0.006))
    for sx in (-1, 1):  # dois painéis em relevo na frente
        it.add(mb.caixa(L / 2 - 0.08, 0.012, A - 0.1, x=sx * (L / 4 - 0.005), y=-P / 2 - 0.004, z=z0 + 0.05,
                        cor=tampa, bisel=0.005))
    zt = z0 + A
    tp = mb.caixa(L + 0.02, P + 0.02, 0.035, z=zt + 0.002, cor=tampa, bisel=0.014)
    al = mb.almofada(L - 0.06, P - 0.06, 0.07, z=zt + 0.03, cor=almofada, e=0.18, estufa=0.3)
    it.porta([tp, al], dobradica=(0, P / 2 + 0.01, zt + 0.02), eixo="x", lado="cima", abre_graus=80, nome="tampa")
    it.slot("bau", (0, 0, z0 + e), (L - 2 * e - 0.02, P - 2 * e - 0.02, A - e - 0.01))
    it.slot("assento", (0, 0, zt + 0.1), (L - 0.06, P - 0.06, 0.4))


def sapateira_basculante(it, cor, frente, pcor, niveis):
    L, P = 0.8, 0.26
    hn = 0.4
    z0 = 0.05
    A = niveis * hn + 0.08
    it.add(pes("bloco", L - 0.04, P - 0.02, z0 + 0.01, cor, r=0.02, recuo=0.03))
    c = Cx(it, L, A, P, z0=z0, e=0.032, r_ext=0.03, r_int=0.01, cor=cor)
    hcel = (c.zi1 - c.zi0) / niveis
    for k in range(niveis):
        za = c.zi0 + k * hcel
        zb = za + hcel
        if k:
            c.prat(za + 0.01, recuo=0.005)
        # gaveta basculante: frente + bandeja inclinada presa nela (gira em volta da aresta de baixo)
        w, h = c.x1 - c.x0 - 2 * FOLGA, hcel - 2 * FOLGA - 0.006
        yface = c.yf + 0.003 + _prot("moldura", {})
        f = mb.frente(w, h, esp=ESP, estilo="moldura", cor=frente, cor2=frente, margem=0.03)
        mb.transforma(f, loc=(c.x, yface + ESP, za + FOLGA + 0.006))
        bandeja = mb.caixa(w - 0.03, 0.012, h * 0.8, x=c.x, y=yface + ESP + 0.09, z=za + 0.03, cor=cor, bisel=0.004)
        mb.transforma(bandeja, loc=(0, 0, 0))
        lab = mb.caixa(w - 0.03, 0.09, 0.012, x=c.x, y=yface + ESP + 0.045, z=za + 0.025, cor=cor, bisel=0.004)
        px = puxador("alca", x=c.x, y=yface - _prot("moldura", {}), z=zb - 0.06, cor=pcor, vertical=False)
        it.porta([f, bandeja, lab, px], dobradica=(c.x, yface, za + FOLGA + 0.006), eixo="x", lado="baixo",
                 abre_graus=32, nome=f"basculante_{k + 1}")
        it.slot(f"sapatos_{k + 1}", (c.x, (c.yf + c.yb) / 2 + 0.03, za + 0.025), (w - 0.05, 0.12, hcel - 0.05),
                pai=f"basculante_{k + 1}")
    it.slot("tampo", (0, 0, c.topo), (L - 0.02, P - 0.02, 0.5))


def sapateira_alta(it, cor, frente, pcor):
    L, P, A = 0.72, 0.36, 1.22
    z0 = 0.06
    it.add(pes("conico", L - 0.02, P - 0.02, z0 + 0.01, "madeira_mel" if cor != "madeira_mel" else "branco",
               r=0.022, recuo=0.05))
    c = Cx(it, L, A - z0, P, z0=z0, e=0.034, r_ext=0.03, r_int=0.01, cor=cor)
    n = 4
    alt = (c.zi1 - c.zi0) / n
    yfr = c.yf + 0.03
    d = c.yb - yfr
    for k in range(n):
        z = c.zi0 + alt * k + 0.035
        sh = mb.caixa(c.x1 - c.x0 - 0.006, d / math.cos(math.radians(14)), 0.016, cor=cor, bisel=0.004)
        mb.transforma(sh, rot=("X", 14))
        mb.transforma(sh, loc=(c.x, (yfr + c.yb) / 2, z + 0.04))
        it.add(sh)
        it.add(mb.tubo([(c.x0 - 0.002, yfr + 0.02, z + 0.035), (c.x1 + 0.002, yfr + 0.02, z + 0.035)], 0.007,
                       cor="metal_claro"))
        it.slot(f"sapatos_{k + 1}", (c.x, (yfr + c.yb) / 2, z + 0.04), (c.x1 - c.x0 - 0.02, d - 0.02, alt - 0.08))
    par_portas(it, c.x0, c.x1, c.zi0, c.zi1, c.yf, estilo="ripas", cor=frente, cor2=cor, pcor=pcor, pz=c.zi0 + 0.6,
               pux="botao")
    it.slot("tampo", (0, 0, c.topo), (L - 0.02, P - 0.02, 0.5))


def sapateira_aberta(it, madeira, tubo_cor):
    L, P = 0.82, 0.3
    alts = [0.08, 0.3, 0.52]
    for sx in (-1, 1):
        pts = mb.ret_arredondado(P, 0.7, 0.04)
        lat = mb.extrudado([(y, z + 0.35) for y, z in pts], 0.03,
                           x=sx * (L / 2 - 0.015) - 0.015, cor=madeira, bisel=0.01, plano="yz")
        it.add(lat)
    for k, z in enumerate(alts):
        for j, yy in enumerate((-0.08, 0.0, 0.08)):
            zz = z + j * 0.025
            it.add(mb.cilindro(0.011, L - 0.05, x=0, y=yy, z=zz, cor=tubo_cor, eixo="x", seg=14, bisel=0.002))
        it.slot(f"sapatos_{k + 1}", (0, 0, z + 0.02), (L - 0.08, P - 0.04, 0.18))
    it.add(mb.caixa(L - 0.02, P, 0.035, z=0.7 - 0.035, cor=madeira, bisel=0.012))
    it.slot("tampo", (0, 0, 0.7), (L - 0.04, P - 0.02, 0.4))


def banco_cabideiro(it, cor, almofada, gancho):
    L, P = 0.9, 0.4
    A = 1.8
    # banco
    c = Cx(it, L, 0.45, P, z0=0.0, e=0.034, r_ext=0.03, r_int=0.01, cor=cor)
    c.prat(0.22, recuo=0.005)
    c.vao("sapatos_baixo", c.x0, c.x1, c.zi0, 0.2, recuo=0.005)
    c.vao("sapatos_cima", c.x0, c.x1, 0.22, c.zi1, recuo=0.005)
    it.add(mb.almofada(L - 0.04, P - 0.04, 0.08, z=0.44, cor=almofada, e=0.18, estufa=0.3))
    # costas: painel alto com ganchos e uma prateleira em cima
    for sx in (-1, 1):
        it.add(mb.caixa(0.045, 0.06, A - 0.45, x=sx * (L / 2 - 0.0225), y=P / 2 - 0.03, z=0.44, cor=cor, bisel=0.015))
    it.add(mb.caixa(L - 0.08, 0.025, 0.9, y=P / 2 - 0.02, z=0.75, cor=cor, bisel=0.008))
    it.add(mb.caixa(L + 0.02, 0.26, 0.04, y=P / 2 - 0.13, z=A - 0.04, cor=cor, bisel=0.014))
    for k in range(4):
        xg = -0.3 + k * 0.2
        it.add(mb.tubo([(xg, P / 2 - 0.035, 1.35), (xg, P / 2 - 0.09, 1.35), (xg, P / 2 - 0.1, 1.42)], 0.009,
                       cor=gancho, raio_curva=0.03))
        it.add(mb.esfera(0.016, x=xg, y=P / 2 - 0.1, z=1.43, cor=gancho))
    it.slot("prateleira", (0, P / 2 - 0.13, A), (L - 0.02, 0.24, 0.35))
    it.slot("assento", (0, -0.03, 0.52), (L - 0.08, P - 0.12, 0.4))
    it.colisao([((0, 0, 0), (L, P, 0.52)), ((0, P / 2 - 0.04, 0.44), (L, 0.08, A - 0.44)),
                ((0, P / 2 - 0.13, A - 0.04), (L + 0.02, 0.26, 0.04))])


def banco_estofado_gavetas(it, cor, estofado, pcor, pecor):
    L, P = 1.1, 0.4
    z0 = 0.1
    it.add(pes("palito", L - 0.04, P - 0.04, z0 + 0.01, pecor, r=0.022, recuo=0.05, abre=6))
    c = Cx(it, L, 0.25, P, z0=z0, e=0.03, r_ext=0.025, r_int=0.008, cor=cor)
    c.div(c.x)
    for x0_, x1_ in ((c.x0, c.x - 0.011), (c.x + 0.011, c.x1)):
        gaveta(it, x0_, x1_, c.zi0, c.zi1, c.yf, P - 0.07, cor=cor, pcor=pcor, estilo="moldura", cor2=cor,
               margem=0.025)
    it.add(mb.superelipsoide(L + 0.01, P + 0.01, 0.11, z=c.topo - 0.012, cor=estofado, e=0.2, e_v=0.35))
    for sx in (-0.25, 0.25):
        it.add(mb.cilindro(0.012, 0.01, x=sx * L, y=0, z=c.topo + 0.093, cor=estofado, seg=12, bisel=0.003))
    it.slot("assento", (0, 0, c.topo + 0.1), (L - 0.06, P - 0.06, 0.4))


# =====================================================================================================================
# RACKS E PAINÉIS DE TV
# =====================================================================================================================
def rack_porta_nicho(it, cor, interno, frente, pcor, pecor):
    L, P, A = 1.2, 0.42, 0.52
    z0 = 0.06
    it.add(pes("conico", L - 0.02, P - 0.02, z0 + 0.01, pecor, r=0.022, recuo=0.06))
    c = Cx(it, L, A - z0, P, z0=z0, e=0.04, r_ext=0.04, r_int=0.012, cor=cor, cor_int=interno)
    xd = c.x0 + (c.x1 - c.x0) * 0.47
    c.div(xd)
    zm = c.zi0 + (c.zi1 - c.zi0) * 0.5
    c.prat(zm, xd + 0.011, c.x1, recuo=0.04)
    c.prat(zm, c.x0, xd - 0.011)
    c.vao("nicho_baixo", xd + 0.011, c.x1, c.zi0, zm - 0.02, recuo=0.04)
    c.vao("nicho_cima", xd + 0.011, c.x1, zm, c.zi1, recuo=0.04)
    c.vao("armario_baixo", c.x0, xd - 0.011, c.zi0, zm - 0.02)
    c.vao("armario_cima", c.x0, xd - 0.011, zm, c.zi1)
    porta(it, c.x0, xd - 0.011, c.zi0, c.zi1, c.yf, lado="esq", cor=frente, pcor=pcor)
    it.slot("tampo", (0, 0, c.topo), (L - 0.04, P - 0.04, 1.0))


def rack_nichos(it, cor, interno, pecor):
    L, P, A = 1.2, 0.42, 0.5
    z0 = 0.06
    it.add(pes("conico", L - 0.02, P - 0.02, z0 + 0.01, pecor, r=0.022, recuo=0.06))
    c = Cx(it, L, A - z0, P, z0=z0, e=0.04, r_ext=0.04, r_int=0.012, cor=cor, cor_int=interno)
    xd = c.x0 + (c.x1 - c.x0) * 0.4
    c.div(xd, recuo=0.005)
    zm = c.zi0 + (c.zi1 - c.zi0) * 0.55
    c.prat(zm, xd + 0.011, c.x1, recuo=0.005)
    c.vao("nicho_esq", c.x0, xd - 0.011, c.zi0, c.zi1, recuo=0.005)
    c.vao("nicho_dir_baixo", xd + 0.011, c.x1, c.zi0, zm - 0.02, recuo=0.005)
    c.vao("nicho_dir_cima", xd + 0.011, c.x1, zm, c.zi1, recuo=0.005)
    it.slot("tampo", (0, 0, c.topo), (L - 0.04, P - 0.04, 1.0))
    it.colisao(col_casco(L, P, A - z0, z=z0, e=0.04) + [((0, 0, 0), (L - 0.06, P - 0.06, z0))])


def rack_rodape(it, cor, interno, frente, pcor):
    L, P = 1.6, 0.45
    it.add(mb.caixa(L + 0.03, P + 0.03, 0.09, cor=cor, bisel=0.035, seg=4))
    c = Cx(it, L, 0.4, P, z0=0.085, e=0.04, r_ext=0.03, r_int=0.01, cor=cor, cor_int=interno)
    it.add(mb.caixa(L + 0.06, P + 0.045, 0.06, z=c.topo - 0.005, cor=cor, bisel=0.028, seg=4))
    W = c.x1 - c.x0
    xa, xb = c.x0 + W * 0.3, c.x0 + W * 0.7
    c.div(xa)
    c.div(xb)
    zm = c.zi0 + (c.zi1 - c.zi0) * 0.5
    c.prat(zm, xa + 0.011, xb - 0.011, recuo=0.005)
    c.vao("nicho_baixo", xa + 0.011, xb - 0.011, c.zi0, zm - 0.02, recuo=0.005)
    c.vao("nicho_cima", xa + 0.011, xb - 0.011, zm, c.zi1, recuo=0.005)
    c.vao("armario", c.x0, xa - 0.011, c.zi0, c.zi1)
    c.prat(zm + 0.06, xb + 0.011, c.x1)
    c.vao("armario_dir", xb + 0.011, c.x1, c.zi0, zm + 0.04)
    porta(it, c.x0, xa - 0.011, c.zi0, c.zi1, c.yf, lado="esq", cor=frente, pcor=pcor)
    gaveta(it, xb + 0.011, c.x1, zm + 0.06, c.zi1, c.yf, P - 0.08, teto=c.zi1, cor=frente, pcor=pcor)
    porta(it, xb + 0.011, c.x1, c.zi0, zm + 0.06, c.yf, lado="dir", cor=frente, pcor=pcor)
    it.slot("tampo", (0, 0, c.topo + 0.055), (L - 0.02, P - 0.02, 1.0))


def rack_pes_portas(it, cor, frente, pcor):
    L, P, A = 1.3, 0.42, 0.56
    z0 = 0.13
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.add(mb.caixa(0.05, 0.05, z0 + 0.02, x=sx * (L / 2 - 0.07), y=sy * (P / 2 - 0.06), cor=cor, bisel=0.015))
    c = Cx(it, L, A - z0, P, z0=z0, e=0.038, r_ext=0.045, r_int=0.012, cor=cor)
    W = c.x1 - c.x0
    xa = c.x0 + W * 0.34
    c.div(xa, recuo=0.005)
    c.vao("nicho", c.x0, xa - 0.011, c.zi0, c.zi1, recuo=0.005)
    c.vao("armario", xa + 0.011, c.x1, c.zi0, c.zi1)
    par_portas(it, xa + 0.011, c.x1, c.zi0, c.zi1, c.yf, cor=frente, pcor=pcor, pux="bola")
    it.slot("tampo", (0, 0, c.topo), (L - 0.04, P - 0.04, 1.0))


def rack_baixo_gavetas(it, cor, pes_cor, pcor):
    L, P, A = 1.35, 0.5, 0.42
    z0 = 0.12
    it.add(pes("reto", L - 0.04, P - 0.04, z0 + 0.01, pes_cor, r=0.022, recuo=0.07))
    c = Cx(it, L, A - z0, P, z0=z0, e=0.03, r_ext=0.03, r_int=0.01, cor=cor)
    it.add(mb.caixa(L + 0.04, P + 0.04, 0.045, z=c.topo - 0.012, cor=cor, bisel=0.02, seg=4))
    zg = c.zi0 + 0.12
    c.prat(zg)
    c.div(c.x, zg, c.zi1)
    c.vao("nicho_baixo", c.x0, c.x1, c.zi0, zg - 0.02, recuo=0.005)
    for x0_, x1_ in ((c.x0, c.x - 0.011), (c.x + 0.011, c.x1)):
        gaveta(it, x0_, x1_, zg, c.zi1, c.yf, P - 0.08, cor=cor, pcor=pcor)
    it.slot("tampo", (0, 0, c.topo + 0.033), (L, P, 1.0))


def rack_gavetas_brancas(it, cor, gav, pcor, pecor):
    L, P, A = 1.05, 0.42, 0.52
    z0 = 0.07
    it.add(pes("conico", L - 0.02, P - 0.02, z0 + 0.01, pecor, r=0.022, recuo=0.06))
    c = Cx(it, L, A - z0, P, z0=z0, e=0.04, r_ext=0.04, r_int=0.012, cor=cor)
    zm = c.zi0 + (c.zi1 - c.zi0) * 0.5
    c.prat(zm)
    c.div(c.x, c.zi0, zm - 0.02)
    c.vao("nicho_cima", c.x0, c.x1, zm, c.zi1, recuo=0.005)
    for x0_, x1_ in ((c.x0, c.x - 0.011), (c.x + 0.011, c.x1)):
        gaveta(it, x0_, x1_, c.zi0, zm, c.yf, P - 0.08, teto=zm - 0.02, estilo="moldura", cor=gav, cor2=cor,
               pcor=pcor, margem=0.025)
    it.slot("tampo", (0, 0, c.topo), (L - 0.04, P - 0.04, 1.0))


def rack_retro(it, cor, frente, pecor):
    L, P, A = 0.95, 0.42, 0.62
    z0 = 0.17
    it.add(pes("palito", L - 0.12, P - 0.06, z0 + 0.02, pecor, r=0.022, recuo=0.05, abre=8))
    c = Cx(it, L, A - z0, P, z0=z0, e=0.05, r_ext=0.13, r_int=0.06, cor=cor)
    zm = c.zi0 + (c.zi1 - c.zi0) / 2
    c.prat(zm)
    c.vao("baixo", c.x0, c.x1, c.zi0 + 0.02, zm - 0.02)
    c.vao("cima", c.x0, c.x1, zm, c.zi1)
    par_portas(it, c.x0, c.x1, c.zi0, c.zi1, c.yf, cor=frente, pcor=cor, pux="bola")
    it.slot("tampo", (0, 0, c.topo), (L - 0.1, P - 0.04, 1.0))


def painel_tv(it, cor, prat_cor):
    L, A, Pp = 1.8, 1.05, 0.04
    it.add(mb.caixa(L, Pp, A, y=-Pp / 2, cor=cor, bisel=0.02, seg=4))
    for k in range(5):  # ripas na faixa da esquerda
        it.add(mb.caixa(0.035, 0.014, A - 0.12, x=-L / 2 + 0.07 + k * 0.05, y=-Pp - 0.005, z=0.06, cor=prat_cor,
                        bisel=0.006))
    P = 0.26
    xs = 0.08
    it.add(mb.caixa(1.5, P, 0.04, x=xs, y=-P / 2 - 0.01, z=0.08, cor=prat_cor, bisel=0.016, seg=4))
    xn = L / 2 - 0.25
    it.add(casco(0.4, 0.26, P, 0.03, 0.03, 0.01, x=xn, y=-P / 2 - 0.01, z=0.6, cor=prat_cor, fundo=False))
    it.add(mb.caixa(1.3, 0.012, 0.012, x=xs, y=-P * 0.75, z=0.068, cor=None, mat="luz", bisel=0.004))
    it.add(mb.caixa(0.3, 0.012, 0.012, x=xn, y=-P * 0.7, z=0.588, cor=None, mat="luz", bisel=0.004))
    it.add(mb.caixa(0.5, 0.18, 0.03, x=0.6, y=-0.1, z=0.95, cor=prat_cor, bisel=0.01))
    it.slot("prateleira", (xs, -P / 2 - 0.01, 0.12), (1.46, P - 0.04, 0.22))
    it.slot("nicho", (xn, -P / 2 - 0.01, 0.63), (0.33, P - 0.04, 0.19))
    it.slot("nicho_topo", (xn, -P / 2 - 0.01, 0.86), (0.38, P - 0.04, 0.08))
    it.slot("prateleira_alta", (0.6, -0.1, 0.98), (0.46, 0.14, 0.3))
    it.slot("tv", (-0.15, -Pp - 0.035, 0.32), (1.0, 0.06, 0.65))


def rack_suspenso(it, cor, frente, pcor):
    L, P, A = 1.4, 0.36, 0.32
    c = Cx(it, L, A, P, z0=0.0, y=-P / 2, e=0.032, r_ext=0.03, r_int=0.01, cor=cor)
    W = c.x1 - c.x0
    xa = c.x0 + W * 0.36
    c.div(xa, recuo=0.005)
    c.vao("nicho", c.x0, xa - 0.011, c.zi0, c.zi1, recuo=0.005)
    c.vao("armario", xa + 0.011, c.x1, c.zi0, c.zi1)
    w, h = c.x1 - xa - 0.011 - 2 * FOLGA, c.zi1 - c.zi0 - 2 * FOLGA
    yface = c.yf + 0.003
    f = mb.frente(w, h, esp=ESP, estilo="lisa", cor=frente)
    xc = (xa + 0.011 + c.x1) / 2
    mb.transforma(f, loc=(xc, yface + ESP, c.zi0 + FOLGA))
    px = puxador("alca", x=xc, y=yface, z=c.zi1 - 0.05, cor=pcor, vertical=False)
    it.porta([f, px], dobradica=(xc, yface, c.zi0 + FOLGA), eixo="x", lado="baixo", abre_graus=90)
    it.slot("tampo", (0, -P / 2, c.topo), (L - 0.04, P - 0.04, 1.0))


def rack_ripado(it, cor, ripas, interno, pecor):
    L, P, A = 1.6, 0.42, 0.52
    z0 = 0.14
    it.add(pes("palito", L - 0.06, P - 0.04, z0 + 0.02, pecor, r=0.022, recuo=0.06, abre=6))
    c = Cx(it, L, A - z0, P, z0=z0, e=0.035, r_ext=0.03, r_int=0.01, cor=cor, cor_int=interno)
    W = c.x1 - c.x0
    xa, xb = c.x0 + W * 0.3, c.x0 + W * 0.7
    c.div(xa)
    c.div(xb)
    c.vao("nicho", xa + 0.011, xb - 0.011, c.zi0, c.zi1, recuo=0.005)
    c.vao("armario_esq", c.x0, xa - 0.011, c.zi0, c.zi1)
    c.vao("armario_dir", xb + 0.011, c.x1, c.zi0, c.zi1)
    porta(it, c.x0, xa - 0.011, c.zi0, c.zi1, c.yf, lado="esq", estilo="ripas", cor=ripas, cor2=interno, pux=None)
    porta(it, xb + 0.011, c.x1, c.zi0, c.zi1, c.yf, lado="dir", estilo="ripas", cor=ripas, cor2=interno, pux=None)
    it.slot("tampo", (0, 0, c.topo), (L - 0.04, P - 0.04, 1.0))


def rack_vidro(it, cor, interno, pcor):
    L, P, A = 1.45, 0.42, 0.52
    z0 = 0.07
    it.add(pes("bloco", L - 0.04, P - 0.04, z0 + 0.01, cor, r=0.024, recuo=0.05))
    c = Cx(it, L, A - z0, P, z0=z0, e=0.036, r_ext=0.035, r_int=0.01, cor=cor, cor_int=interno)
    W = c.x1 - c.x0
    xa, xb = c.x0 + W * 0.32, c.x0 + W * 0.68
    c.div(xa)
    c.div(xb)
    zm = c.zi0 + (c.zi1 - c.zi0) * 0.55
    c.prat(zm, xa + 0.011, xb - 0.011, recuo=0.005)
    for x0_, x1_, nm in ((c.x0, xa - 0.011, "esq"), (xb + 0.011, c.x1, "dir")):
        hm = c.zi0 + (c.zi1 - c.zi0) / 2
        c.prat(hm, x0_, x1_)
        c.vao(f"vitrine_{nm}_baixo", x0_, x1_, c.zi0, hm - 0.02)
        c.vao(f"vitrine_{nm}_cima", x0_, x1_, hm, c.zi1)
    porta(it, c.x0, xa - 0.011, c.zi0, c.zi1, c.yf, lado="esq", estilo="vidro", cor=cor, cor2=cor, pcor=pcor,
          margem=0.035)
    porta(it, xb + 0.011, c.x1, c.zi0, c.zi1, c.yf, lado="dir", estilo="vidro", cor=cor, cor2=cor, pcor=pcor,
          margem=0.035)
    c.vao("nicho", xa + 0.011, xb - 0.011, zm, c.zi1, recuo=0.005)
    gaveta(it, xa + 0.011, xb - 0.011, c.zi0, zm - 0.01, c.yf, P - 0.08, teto=zm - 0.03, cor=cor, pcor=pcor,
           pux="alca")
    it.slot("tampo", (0, 0, c.topo), (L - 0.04, P - 0.04, 1.0))


def rack_com_painel(it, cor, painel, pcor):
    L, P = 1.7, 0.45
    z0 = 0.06
    it.add(mb.caixa(L - 0.06, P - 0.06, z0 + 0.01, cor=cor, bisel=0.012))
    c = Cx(it, L, 0.42, P, z0=z0, e=0.036, r_ext=0.03, r_int=0.01, cor=cor)
    W = c.x1 - c.x0
    xa, xb = c.x0 + W * 0.33, c.x0 + W * 0.67
    c.div(xa)
    c.div(xb)
    c.vao("nicho", xa + 0.011, xb - 0.011, c.zi0, c.zi1, recuo=0.005)
    for x0_, x1_, lado, nm in ((c.x0, xa - 0.011, "esq", "esq"), (xb + 0.011, c.x1, "dir", "dir")):
        porta(it, x0_, x1_, c.zi0, c.zi1, c.yf, lado=lado, estilo="moldura", cor=cor, cor2=cor, pcor=pcor,
              margem=0.03)
        c.vao(f"armario_{nm}", x0_, x1_, c.zi0, c.zi1)
    # painel alto atrás, com duas prateleiras nas laterais
    Ap = 1.35
    yp = P / 2 - 0.02
    it.add(mb.caixa(L, 0.04, Ap, y=yp, z=c.topo - 0.01, cor=painel, bisel=0.016, seg=4))
    zt = c.topo - 0.01 + Ap
    for sx in (-1, 1):
        for h in (0.45, 0.85):
            it.add(mb.caixa(0.32, 0.21, 0.03, x=sx * (L / 2 - 0.18), y=yp - 0.115, z=c.topo + h, cor=cor, bisel=0.01))
            it.slot(f"prateleira_{'esq' if sx < 0 else 'dir'}_{int(h * 100)}", (sx * (L / 2 - 0.18), yp - 0.12, c.topo + h + 0.03),
                    (0.3, 0.18, 0.3))
    it.add(mb.caixa(L + 0.02, 0.1, 0.035, y=yp - 0.03, z=zt - 0.01, cor=cor, bisel=0.012))
    it.slot("tampo", (0, -0.02, c.topo), (L - 0.04, P - 0.08, 0.9))
    it.colisao([((0, 0, 0), (L, P, c.topo)), ((0, yp, c.topo), (L, 0.06, Ap))])


# =====================================================================================================================
# Lista das peças
# =====================================================================================================================
PECAS = []


def R(cat, id_, rotulo, grupo, fn, tags=(), fix="chao", alt=None, pacote=False, mini=None, **kw):
    PECAS.append(dict(cat=cat, id=id_, rotulo=rotulo, grupo=grupo, fn=fn, tags=list(tags), fix=fix, alt=alt,
                      pacote=pacote, mini=mini, kw=kw))


# ---- armários (34)
for cor, painel, quadro, nm in (("verde_claro", "verde_lima", "madeira_media", "verde"),
                                 ("rosa_claro", "rosa_bebe", "madeira_rosada", "rosa"),
                                 ("branco", "azul_bebe", "cinza_azulado", "branco")):
    R("armarios", f"guarda_roupa_correr_espelho_{nm}", f"Guarda-roupa de correr com espelho ({nm})",
      "guarda_roupa_correr_espelho", guarda_roupa_correr_espelho, tags=["quarto", "portas de correr", "espelho"],
      cor=cor, painel=painel, quadro=quadro)
for cor, portas, interno, nm in (("madeira_rosada", "creme_claro", "madeira_rosada", "rosado"),
                                  ("azul_acinzentado", "branco", "azul_acinzentado", "azul")):
    R("armarios", f"guarda_roupa_portas_vazadas_{nm}", f"Guarda-roupa de portas vazadas ({nm})",
      "guarda_roupa_portas_vazadas", guarda_roupa_portas_vazadas, tags=["quarto", "4 portas"], cor=cor, portas=portas,
      interno=interno)
for cor, frente, pcor, pecor, nm in (("madeira_media", "madeira_media", "ouro", "amarelo_escuro", "madeira"),
                                      ("branco", "branco", "madeira_mel", "madeira_mel", "branco"),
                                      ("verde_medio", "verde", "amarelo", "amarelo_escuro", "verde")):
    R("armarios", f"armario_2portas_gaveta_{nm}", f"Armário de 2 portas e gaveta ({nm})", "armario_2portas_gaveta",
      armario_2portas_gaveta, tags=["quarto", "gaveta", "cabideiro"], cor=cor, frente=frente, pcor=pcor, pecor=pecor)
for cor, interno, frente, pcor, nm in (("laranja_claro", "laranja", "creme_claro", "madeira_escura", "laranja"),
                                        ("verde_agua", "menta", "branco", "madeira_escura", "verde_agua")):
    R("armarios", f"armario_porta_gaveta_rodape_{nm}", f"Armário de porta e gaveta com rodapé ({nm})",
      "armario_porta_gaveta_rodape", armario_porta_gaveta_rodape, tags=["gaveta", "prateleiras"], cor=cor,
      interno=interno, frente=frente, pcor=pcor)
for cor, interno, gav, pcor, pecor, nm in (("turquesa", "turquesa_escuro", "branco", "amarelo", "amarelo_escuro",
                                            "turquesa"),
                                           ("rosa", "rosa_escuro", "branco", "amarelo", "amarelo_escuro", "rosa"),
                                           ("amarelo_escuro", "mostarda", "branco", "azul", "azul", "amarelo")):
    R("armarios", f"armario_vitrine_{nm}", f"Armário-vitrine com portas de vidro ({nm})", "armario_vitrine",
      armario_vitrine, tags=["vidro", "gaveta", "prateleiras"], cor=cor, interno=interno, gav=gav, pcor=pcor,
      pecor=pecor)
R("armarios", "armario_turquesa_portas_rosa_pacote", "Armário turquesa de portas rosa (pacote)", "pacote_closet_02",
  pacote_closet02, tags=["pacote", "prateleiras"], pacote=True)
for cor, frente, pcor, nm in (("amarelo", "turquesa", "madeira_clara", "amarelo"),
                              ("lilas", "rosa_claro", "madeira_clara", "lilas")):
    R("armarios", f"guarda_roupa_retro_{nm}", f"Guarda-roupa retrô arredondado ({nm})", "guarda_roupa_retro",
      guarda_roupa_retro, tags=["quarto", "retrô", "gavetas", "cabideiro"], cor=cor, frente=frente, pcor=pcor,
      pecor="madeira_clara")
for cor, frente, pcor, nm in (("branco", "branco", "madeira_clara", "branco"),
                              ("madeira_mel", "creme", "madeira_escura", "mel"),
                              ("cinza_azulado", "branco_gelo", "cromo", "cinza")):
    R("armarios", f"guarda_roupa_3portas_gavetas_{nm}", f"Guarda-roupa de 3 portas e gavetas ({nm})",
      "guarda_roupa_3portas_gavetas", guarda_roupa_3portas, tags=["quarto", "gavetas", "cabideiro"], cor=cor,
      frente=frente, pcor=pcor)
for cor, frente, telhado, pcor, nm in (("rosa_bebe", "branco", "rosa_escuro", "amarelo", "rosa"),
                                        ("azul_claro", "branco", "azul", "amarelo", "azul")):
    R("armarios", f"guarda_roupa_infantil_casinha_{nm}", f"Guarda-roupa infantil casinha ({nm})",
      "guarda_roupa_infantil_casinha", guarda_roupa_casinha, tags=["infantil", "quarto", "gaveta"], cor=cor,
      frente=frente, telhado=telhado, pcor=pcor)
for cor, interno, gav, pcor, pecor, nm in (("madeira_media", "madeira_media", "madeira_media", "ouro",
                                            "amarelo_escuro", "madeira"),
                                           ("turquesa", "turquesa_escuro", "branco", "amarelo", "amarelo_escuro",
                                            "turquesa")):
    R("armarios", f"armario_estante_gaveta_{nm}", f"Armário aberto com gaveta ({nm})", "armario_estante_gaveta",
      armario_estante_gaveta, tags=["prateleiras", "gaveta"], cor=cor, interno=interno, gav=gav, pcor=pcor,
      pecor=pecor)
for cor, frente, tampo, pcor, pecor, nm in (("madeira", "madeira_clara", "madeira", "madeira_escura", "madeira",
                                             "madeira"),
                                            ("rosa_claro", "branco", "rosa", "ouro", "madeira_clara", "rosa")):
    R("armarios", f"comoda_4gavetas_{nm}", f"Cômoda de 4 gavetas ({nm})", "comoda_4gavetas", comoda,
      tags=["quarto", "gavetas"], cor=cor, frente=frente, tampo=tampo, pcor=pcor, pecor=pecor)
for cor, painel, tampo, pcor, nm in (("marrom_claro", "bege", "madeira_cinza", "madeira_escura", "madeira"),
                                      ("azul_acinzentado", "porcelana_azul", "branco_gelo", "ouro", "azul")):
    R("armarios", f"aparador_2portas_{nm}", f"Aparador de 2 portas ({nm})", "aparador_2portas", aparador,
      tags=["sala", "aparador"], cor=cor, painel=painel, tampo=tampo, pcor=pcor)
for cor, ripas, fr, pcor, nm in (("branco", "madeira_mel", "madeira", "madeira_escura", "mel"),
                                  ("creme", "verde_oliva", "verde_floresta", "creme_claro", "oliva")):
    R("armarios", f"guarda_roupa_correr_ripas_{nm}", f"Guarda-roupa de correr ripado ({nm})",
      "guarda_roupa_correr_ripas", guarda_roupa_correr_ripas, tags=["quarto", "portas de correr", "ripado"], cor=cor,
      ripas=ripas, fundo_ripas=fr, pcor=pcor)
for cor, frente, pcor, nm in (("madeira_escura", "madeira_media", "ouro", "madeira"),
                              ("azul_claro", "azul_bebe", "branco", "azul")):
    R("armarios", f"armario_alto_estreito_{nm}", f"Armário alto estreito ({nm})", "armario_alto_estreito",
      armario_alto_estreito, tags=["prateleiras", "1 porta"], cor=cor, frente=frente, pcor=pcor)
for cor, frente, pcor, nm in (("branco_gelo", "branco", "madeira_mel", "branco"),
                              ("verde_agua", "menta", "ouro", "verde_agua")):
    R("armarios", f"cristaleira_{nm}", f"Cristaleira ({nm})", "cristaleira", cristaleira,
      tags=["sala", "vidro", "gavetas"], cor=cor, frente=frente, pcor=pcor)
R("armarios", "guarda_roupa_maleiro_lilas", "Guarda-roupa com maleiro (lilás)", "guarda_roupa_maleiro",
  guarda_roupa_maleiro, tags=["quarto", "maleiro", "cabideiro"], cor="lilas", frente="lilas_claro", pcor="roxo")

# ---- estantes (14)
R("estantes", "estante_nichos_8_azul", "Estante de 8 nichos (azul)", "estante_nichos_8", estante_nichos,
  tags=["nichos", "cubos"], cor="azul_acinzentado", cols=4, rows=2)
R("estantes", "estante_nichos_6_azul", "Estante de 6 nichos (azul)", "estante_nichos_6", estante_nichos,
  tags=["nichos", "cubos"], cor="azul_acinzentado", cols=3, rows=2)
R("estantes", "estante_escada_branca", "Estante em escada (branca)", "estante_escada", estante_escada,
  tags=["nichos", "escada"], cor="branco_gelo")
R("estantes", "estante_tubos_3_laranja", "Estante de 3 tábuas com tubos (laranja)", "estante_tubos_3",
  estante_tubos, tags=["aberta"], cor="laranja_claro", poste="cinza", niveis=3, L=0.95)
R("estantes", "estante_tubos_2_laranja", "Estante baixa de 2 tábuas (laranja)", "estante_tubos_2",
  estante_tubos, tags=["aberta"], cor="laranja_claro", poste="cinza", niveis=2, L=0.75)
R("estantes", "prateleira_parede_simples_branca", "Prateleira de parede (branca)", "prateleira_parede_simples",
  prateleira_parede_simples, tags=["parede"], fix="parede", alt=1.3, cor="branco")
R("estantes", "prateleira_parede_barra_cinza", "Prateleira de parede com barra (cinza)", "prateleira_parede_barra",
  prateleira_parede_barra, tags=["parede", "banheiro"], fix="parede", alt=1.2, cor="cinza_claro",
  barra="laranja_claro")
R("estantes", "nicho_hexagonal_azul", "Nicho hexagonal de parede (azul)", "nicho_hexagonal", nicho_parede,
  tags=["parede", "nicho"], fix="parede", alt=1.4, forma="hexagono", cor="azul", interno="azul_medio")
R("estantes", "nicho_casinha_lima", "Nicho casinha de parede (lima)", "nicho_casinha", nicho_parede,
  tags=["parede", "nicho", "infantil"], fix="parede", alt=1.4, forma="casinha", cor="verde_lima",
  interno="limao")
R("estantes", "nicho_casinha_dupla_rosa", "Nicho casinha de 2 andares (rosa)", "nicho_casinha_dupla", nicho_parede,
  tags=["parede", "nicho", "infantil"], fix="parede", alt=1.3, forma="casinha_dupla", cor="rosa", interno="rosa_escuro")
R("estantes", "nicho_cubo_azul", "Nicho cubo de parede (azul-celeste)", "nicho_cubo", nicho_parede,
  tags=["parede", "nicho"], fix="parede", alt=1.4, forma="cubo", cor="azul_celeste", interno="azul")
R("estantes", "estante_retro_turquesa", "Estante retrô arredondada (turquesa)", "estante_retro", estante_retro,
  tags=["retrô", "pés palito"], cor="turquesa", prat="rosa_escuro", pecor="amarelo_escuro")
R("estantes", "estante_simples_laranja", "Estante simples de 5 vãos (laranja)", "estante_simples", estante_simples,
  tags=["aberta"], cor="laranja", interno="laranja_escuro")
R("estantes", "estante_gaveta_pacote", "Estante com gaveta (pacote)", "pacote_closet_01", pacote_closet01,
  tags=["pacote", "gaveta"], pacote=True)

# ---- sapateiras e bancos de entrada (11)
for cor, pecor, nm in (("verde", "laranja_escuro", "verde"), ("madeira_mel", "branco", "mel")):
    R("sapateiras", f"banco_entrada_{nm}", f"Banco de entrada ({nm})", "banco_entrada", banco_entrada,
      tags=["entrada", "banco"], cor=cor, pecor=pecor)
for cor, alm, interno, nm in (("branco", "azul_acinzentado", "branco_gelo", "branco"),
                              ("madeira_clara", "terracota_clara", "madeira_clara", "madeira")):
    R("sapateiras", f"banco_sapateira_nichos_{nm}", f"Banco sapateira de nichos ({nm})", "banco_sapateira_nichos",
      banco_sapateira_nichos, tags=["entrada", "banco", "nichos"], cor=cor, almofada=alm, interno=interno)
R("sapateiras", "banco_bau_azul", "Banco baú (azul)", "banco_bau", banco_bau, tags=["entrada", "banco", "tampa"],
  cor="azul_celeste", tampa="branco", almofada="amarelo", pecor="madeira_clara")
for cor, frente, pcor, niv, nm in (("branco", "branco", "madeira_mel", 2, "branca_2"),
                                    ("cinza_azulado", "porcelana_azul", "cromo", 3, "cinza_3")):
    R("sapateiras", f"sapateira_basculante_{nm}", f"Sapateira basculante de {niv} níveis ({nm.split('_')[0]})",
      f"sapateira_basculante_{niv}", sapateira_basculante, tags=["entrada", "basculante"], cor=cor, frente=frente,
      pcor=pcor, niveis=niv)
R("sapateiras", "sapateira_alta_ripada_mel", "Sapateira alta ripada (mel)", "sapateira_alta_ripada", sapateira_alta,
  tags=["entrada", "ripado"], cor="branco", frente="madeira_mel", pcor="madeira_escura")
R("sapateiras", "sapateira_aberta_tubos", "Sapateira aberta de tubos", "sapateira_aberta", sapateira_aberta,
  tags=["entrada", "aberta"], madeira="madeira_clara", tubo_cor="grafite")
R("sapateiras", "banco_cabideiro_branco", "Banco de entrada com cabideiro (branco)", "banco_cabideiro",
  banco_cabideiro, tags=["entrada", "cabideiro", "banco"], cor="branco", almofada="mostarda", gancho="ouro")
R("sapateiras", "banco_estofado_gavetas_rosa", "Banco estofado com gavetas (rosa)", "banco_estofado_gavetas",
  banco_estofado_gavetas, tags=["entrada", "banco", "gavetas", "estofado"], cor="branco", estofado="rosa",
  pcor="ouro", pecor="madeira_clara")

# ---- racks e painéis de TV (18)
for cor, interno, frente, pcor, pecor, nm in (("madeira_media", "madeira_escura", "madeira_media", "ouro",
                                               "amarelo_escuro", "madeira"),
                                              ("branco", "madeira_clara", "branco", "madeira_mel", "madeira_mel",
                                               "branco")):
    R("racks_tv", f"rack_porta_nicho_{nm}", f"Rack com porta e nicho ({nm})", "rack_porta_nicho", rack_porta_nicho,
      tags=["sala", "tv", "nichos"], cor=cor, interno=interno, frente=frente, pcor=pcor, pecor=pecor)
for cor, interno, pecor, nm in (("madeira_media", "madeira_escura", "amarelo_escuro", "madeira"),
                                ("cinza_claro", "cinza", "madeira_clara", "cinza")):
    R("racks_tv", f"rack_nichos_abertos_{nm}", f"Rack de nichos abertos ({nm})", "rack_nichos_abertos", rack_nichos,
      tags=["sala", "tv", "nichos"], cor=cor, interno=interno, pecor=pecor)
for cor, interno, frente, pcor, nm in (("laranja_claro", "laranja", "creme", "madeira_escura", "laranja"),
                                        ("verde_agua", "turquesa", "creme_claro", "madeira_escura", "verde_agua")):
    R("racks_tv", f"rack_longo_rodape_{nm}", f"Rack longo com rodapé ({nm})", "rack_longo_rodape", rack_rodape,
      tags=["sala", "tv", "nichos", "gaveta"], cor=cor, interno=interno, frente=frente, pcor=pcor)
for cor, frente, pcor, nm in (("vermelho_escuro", "vermelho", "vermelho_escuro", "vermelho"),
                              ("azul_escuro", "azul", "amarelo", "azul")):
    R("racks_tv", f"rack_pes_2portas_{nm}", f"Rack de pés com 2 portas ({nm})", "rack_pes_2portas", rack_pes_portas,
      tags=["sala", "tv"], cor=cor, frente=frente, pcor=pcor)
for cor, pes_cor, pcor, nm in (("vermelho_claro", "vermelho_escuro", "vermelho_escuro", "coral"),
                               ("menta", "verde_medio", "verde_medio", "menta")):
    R("racks_tv", f"rack_baixo_gavetas_{nm}", f"Rack baixo com gavetas ({nm})", "rack_baixo_gavetas",
      rack_baixo_gavetas, tags=["sala", "tv", "gavetas"], cor=cor, pes_cor=pes_cor, pcor=pcor)
for cor, gav, pcor, pecor, nm in (("turquesa", "branco", "amarelo", "amarelo_escuro", "turquesa"),
                                  ("rosa_escuro", "rosa_claro", "ouro", "madeira_clara", "rosa")):
    R("racks_tv", f"rack_gavetas_brancas_{nm}", f"Rack de 2 gavetas e nicho ({nm})", "rack_gavetas_nicho",
      rack_gavetas_brancas, tags=["sala", "tv", "gavetas"], cor=cor, gav=gav, pcor=pcor, pecor=pecor)
R("racks_tv", "rack_retro_turquesa", "Rack retrô arredondado (turquesa)", "rack_retro", rack_retro,
  tags=["sala", "tv", "retrô"], cor="turquesa_claro", frente="rosa_escuro", pecor="amarelo_escuro")
R("racks_tv", "painel_tv_parede_nogueira", "Painel de TV de parede (nogueira)", "painel_tv_parede", painel_tv,
  tags=["sala", "tv", "parede", "painel"], fix="parede", alt=0.55, cor="nogueira", prat_cor="madeira_clara")
R("racks_tv", "rack_suspenso_branco", "Rack suspenso (branco)", "rack_suspenso", rack_suspenso,
  tags=["sala", "tv", "parede"], fix="parede", alt=0.35, cor="branco", frente="madeira_clara", pcor="grafite")
R("racks_tv", "rack_ripado_mel", "Rack ripado de pés palito (mel)", "rack_ripado", rack_ripado,
  tags=["sala", "tv", "ripado"], cor="branco", ripas="madeira_mel", interno="madeira_clara", pecor="madeira_mel")
R("racks_tv", "rack_vidro_grafite", "Rack com portas de vidro (grafite)", "rack_vidro", rack_vidro,
  tags=["sala", "tv", "vidro", "gaveta"], cor="grafite", interno="grafite_escuro", pcor="ouro")
R("racks_tv", "rack_com_painel_madeira", "Rack com painel alto (madeira)", "rack_com_painel", rack_com_painel,
  tags=["sala", "tv", "painel"], cor="madeira_clara", painel="madeira_media", pcor="grafite")


# =====================================================================================================================
def main():
    cats_pedidas = [f for f in FILTRO if f in CATEGORIAS]
    ids = [f for f in FILTRO if f not in CATEGORIAS]
    if not FILTRO:
        cats_pedidas = list(CATEGORIAS)
    sel = [p for p in PECAS if p["cat"] in cats_pedidas or p["id"] in ids]
    if ids:
        desconhecidos = set(ids) - {p["id"] for p in PECAS}
        if desconhecidos:
            print("ids desconhecidos:", sorted(desconhecidos), flush=True)
    catalogos = {}
    for c in {p["cat"] for p in sel}:
        catalogos[c] = mb.Catalogo(c, SAIDA, CATEGORIAS[c])
        if c in cats_pedidas:  # categoria inteira: começa o catálogo do zero (sem sobras de ids antigos)
            catalogos[c].dados["itens"] = []
    ordem = {p["id"]: i for i, p in enumerate(PECAS)}
    for p in sel:
        mb.limpa()
        it = mb.Item(p["id"])
        p["fn"](it, **p["kw"])
        catalogos[p["cat"]].exporta(it, p["rotulo"], grupo=p["grupo"], fixacao=p["fix"], altura_instalacao=p["alt"],
                                    pacote=p["pacote"], tags=p["tags"],
                                    miniatura_dir=p["mini"] or (0.55, -1.0, 0.5))
    for c, cat in catalogos.items():
        cat.dados["itens"].sort(key=lambda x: ordem.get(x["id"], 9999))
        cat.salva()
    print("ok", len(sel), flush=True)


main()
