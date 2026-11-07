"""Móveis do Morada — categoria banheiro (112 peças).

Uso (de SP):
  MOVEIS_THREADS=1 MOVEIS_PACOTE_FBX=... MOVEIS_PACOTE_TEX=... blender-venv/bin/python -I morada-art/moveis_banheiro.py \
      -- SP/moveis_out [ids | grupos | seções A..E ...]
  ... -- SP/moveis_out vitrine [A B ...] [abertos]     vitrines por seção (vitrine_<S>.png / vitrine_<S>_abertos.png)
Sem seleção, gera tudo e tira do catálogo o que não existe mais no gerador.

Seções: A banho (boxes, chuveiros, banheiras) · B pias e armários · C vasos, máquinas, cestos e tapetes ·
D espelhos, toalheiros, prateleiras e banquinhos · E objetos pequenos (torneiras, frascos, toalhas...).
"""
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import moveis_base as mb  # noqa: E402

V = Vector
ARGS = sys.argv[sys.argv.index("--") + 1:]
SAIDA = ARGS[0]
SEL = ARGS[1:]
CAT = "banheiro"
PI = math.pi


# =====================================================================================================================
# Ferramentas próprias (a base não muda; o que falta fica aqui)
# =====================================================================================================================
def sup(a, b, n=2.0, seg=64, dx=0.0, dy=0.0):
    """Superelipse 2D (n = 2 elipse; n alto = retângulo boleado), anti-horária, começando em +X."""
    out = []
    for k in range(seg):
        t = 2 * PI * k / seg
        c, s = math.cos(t), math.sin(t)
        out.append((dx + a * math.copysign(abs(c) ** (2 / n), c), dy + b * math.copysign(abs(s) ** (2 / n), s)))
    return out


def ovo(a, b, n=2.2, seg=48, dx=0.0, dy=0.0, frente=1.1, afina=0.12):
    """Contorno de bacia de vaso: elipse mais comprida e mais fina na frente (−Y)."""
    out = []
    for x, y in sup(a, b, n, seg):
        if y < 0:
            x *= 1 - afina * (-y / b)
            y *= frente
        out.append((x + dx, y + dy))
    return out


def anel(pts, z, dx=0.0, dy=0.0, zf=None):
    return [(x + dx, y + dy, z + (zf(x, y) if zf else 0.0)) for x, y in pts]


def loft(aneis, cor="louca", ini=True, fim=True, ciclico=False, mat="atlas", nome="loft", angulo=48):
    """Malha por anéis (listas de pontos 3D com a mesma contagem). ini/fim fecham as pontas com leque."""
    bm = bmesh.new()
    R = [[bm.verts.new(p) for p in a] for a in aneis]
    n = len(R[0])
    pares = list(zip(R, R[1:])) + ([(R[-1], R[0])] if ciclico else [])
    for r0, r1 in pares:
        for i in range(n):
            j = (i + 1) % n
            try:
                bm.faces.new((r0[i], r0[j], r1[j], r1[i]))
            except ValueError:
                pass

    def leque(r):
        c = bm.verts.new(sum((v.co for v in r), V()) / n)
        for i in range(n):
            try:
                bm.faces.new((c, r[(i + 1) % n], r[i]))
            except ValueError:
                pass
    if ini and not ciclico:
        leque(R[0])
    if fim and not ciclico:
        leque(R[-1])
    return mb._obj(nome, bm, cor, mat, angulo=angulo)


def contorno(pts_r, n=5):
    """Polígono fechado com raio por vértice: [(x, y, r), ...]. r = 0 mantém o ponto; r > 0 arredonda o canto com
    n + 1 pontos (a contagem não depende da forma, então dá para fazer anéis com recuo e ligar)."""
    m = len(pts_r)
    out = []
    for i in range(m):
        a = V(pts_r[i - 1][:2])
        b = V(pts_r[i][:2])
        c = V(pts_r[(i + 1) % m][:2])
        r = pts_r[i][2]
        if r <= 0:
            out.append((b.x, b.y))
            continue
        d1, d2 = a - b, c - b
        rr = min(r, d1.length * 0.48, d2.length * 0.48)
        p1, p2 = b + d1.normalized() * rr, b + d2.normalized() * rr
        for k in range(n + 1):
            t = k / n
            q = (1 - t) ** 2 * p1 + 2 * (1 - t) * t * b + t ** 2 * p2
            out.append((q.x, q.y))
    return out


def faixa(pts, esp, z0, z1, cor="branco", mat="atlas", nome="faixa", fechada=False):
    """Parede fina vertical ao longo de uma linha 2D (vidro de box, painel curvo), espessura esp centrada na linha."""
    P = [V(p) for p in pts]
    n = len(P)
    aneis = []
    for i in range(n):
        if fechada:
            t = (P[(i + 1) % n] - P[i - 1])
        else:
            t = (P[min(i + 1, n - 1)] - P[max(i - 1, 0)])
        t.normalize()
        nn = V((-t.y, t.x)) * esp / 2
        a, b = P[i] + nn, P[i] - nn
        aneis.append([(a.x, a.y, z0), (b.x, b.y, z0), (b.x, b.y, z1), (a.x, a.y, z1)])
    return loft(aneis, cor, ini=not fechada, fim=not fechada, ciclico=fechada, mat=mat, nome=nome, angulo=60)


def arco2(cx, cy, r, a0, a1, n=16):
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * k / n)),
             cy + r * math.sin(math.radians(a0 + (a1 - a0) * k / n))) for k in range(n + 1)]


def radial(poly, seg=64, c=(0.0, 0.0)):
    """Amostra um polígono convexo (ou estrelado em c) por raios a partir de c: seg pontos, sempre a mesma contagem."""
    out = []
    P = [V(p) - V(c) for p in poly]
    for k in range(seg):
        t = 2 * PI * k / seg
        d = V((math.cos(t), math.sin(t)))
        best = 0.0
        for a, b in zip(P, P[1:] + P[:1]):
            e = b - a
            den = d.x * (-e.y) - d.y * (-e.x)
            if abs(den) < 1e-12:
                continue
            s = (a.x * (-e.y) - a.y * (-e.x)) / den
            u = (d.x * a.y - d.y * a.x) / den
            if s > 0 and -1e-9 <= u <= 1 + 1e-9:
                best = max(best, s)
        out.append((c[0] + d.x * best, c[1] + d.y * best))
    return out


def encolhe(pts, d, c=(0.0, 0.0), s=1.0):
    out = []
    for x, y in pts:
        v = V((x - c[0], y - c[1]))
        L = v.length
        k = max(0.0, L * s - d) / L if L > 1e-9 else 0
        out.append((c[0] + v.x * k, c[1] + v.y * k))
    return out


def fura(ob, cortador):
    """Boolean de diferença (as paredes do furo ficam com a cor do cortador)."""
    m = ob.modifiers.new("furo", "BOOLEAN")
    m.operation = "DIFFERENCE"
    m.object = cortador
    m.solver = "EXACT"
    cortador.hide_render = True
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    ob.modifiers.clear()
    velho = ob.data
    ob.data = me
    bpy.data.meshes.remove(velho)
    cm = cortador.data
    bpy.data.objects.remove(cortador)
    bpy.data.meshes.remove(cm)
    return ob


def moldura_xz(forma, larg, esp, cor, nome="moldura", y0=0.0):
    """Moldura de espelho/quadro: forma(d) → contorno (x, z) recuado d. Vai de y0 (parede) até y0 − esp."""
    r = min(esp, larg) * 0.42
    ext, ext_r, in_r, inn = forma(0), forma(r), forma(larg - r), forma(larg)

    def a3(pts, y):
        return [(x, y, z) for x, z in pts]
    aneis = [a3(ext, y0), a3(ext, y0 - esp + r), a3(ext_r, y0 - esp), a3(in_r, y0 - esp), a3(inn, y0 - esp + r),
             a3(inn, y0 - 0.004)]
    return loft(aneis, cor, ciclico=True, nome=nome, angulo=55)


def placa_xz(pts, y_frente, esp, cor=None, mat="atlas", bisel=0.002, nome="placa"):
    """Placa plana no plano da parede: contorno (x, z) com a face da frente em y_frente, indo esp para trás."""
    return mb.extrudado(_ccw(pts), esp, y=y_frente, plano="xz", cor=cor, mat=mat, bisel=bisel, seg=1, nome=nome)


def _ccw(pts):
    s = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(pts, pts[1:] + pts[:1]))
    return pts if s > 0 else pts[::-1]


def brilhos(dentro, cx, cz, y, escala=1.0, cor="branco"):
    """Dois riscos de reflexo (estilo da referência) num espelho; dentro(x, z) diz se o ponto está no vidro."""
    out = []
    d = V((math.sin(math.radians(50)), math.cos(math.radians(50))))
    for off, larg in ((-0.16, 0.03), (0.02, 0.011)):
        c = V((cx + off * escala, cz - off * escala * 0.4))
        ts = []
        for sgn in (1, -1):
            t = 0.0
            while dentro(*(c + d * (t + 0.005) * sgn)) and t < 5:
                t += 0.005
            ts.append(t * sgn)
        L = ts[0] - ts[1]
        if L < 0.04:
            continue
        m = c + d * (ts[0] + ts[1]) / 2
        b = mb.caixa(larg * escala ** 0.5, 0.0025, L, z=-L / 2, cor=cor, bisel=0.001, seg=1, nome="brilho")
        mb.transforma(b, rot=("Y", 50))
        mb.transforma(b, loc=(m.x, y, m.y))
        out.append(b)
    return out


def dentro_sup(a, b, n, cx=0.0, cz=0.0, margem=0.02):
    return lambda x, z: (abs((x - cx) / (a - margem)) ** n + abs((z - cz) / (b - margem)) ** n) < 1


def perfil_casca(ext, esp, fundo):
    """Perfil de torno de uma peça côncava: ext [(r, h)] de fora, de baixo até a borda; volta por dentro (recuo esp)
    até o fundo (altura interna do fundo). Começa e termina no eixo."""
    r_top, h_top = ext[-1]
    dentro = [(max(0.004, r - esp), h) for r, h in ext if h > fundo + esp * 0.5]
    p = [(0.0, ext[0][1])] + list(ext) + [(r_top - esp * 0.5, h_top + esp * 0.35)]
    p += dentro[::-1] + [(max(0.004, dentro[0][0] * 0.85), fundo), (0.0, fundo)]
    return p


def pinta_dentro(ob, cor, zmax, c=(0.0, 0.0)):
    """Pinta a parte de dentro de uma bacia (faces viradas para o centro, ou o fundo) abaixo de zmax."""
    def t(p, n):
        dx, dy = p.x - c[0], p.y - c[1]
        return p.z < zmax and ((n.x * dx + n.y * dy < -0.02 * math.hypot(dx, dy)) or (n.z > 0.6 and p.z < zmax - 0.12))
    return mb.pinta_onde(ob, cor, t)


def recolore(ob, mapa):
    """Troca cores da paleta numa malha pronta (peças do pacote cujo atlas caiu em cor errada)."""
    uv = ob.data.uv_layers["UVMap"].data
    for p in ob.data.polygons:
        if mb.MAT_NOMES[p.material_index] != "atlas":
            continue
        u = uv[p.loop_indices[0]].uv
        i = int(u[0] * 16) + 16 * int((1 - u[1]) * 16)
        if 0 <= i < len(mb.NOMES) and mb.NOMES[i] in mapa:
            mb.pinta(ob, mapa[mb.NOMES[i]], [p.index])
    return ob


def tubo_xz(pts_xz, y, r, cor, **k):
    return mb.tubo([(x, y, z) for x, z in pts_xz], r, cor=cor, **k)


def roda(objs, eixo, graus, centro=(0, 0, 0)):
    for o in objs if isinstance(objs, (list, tuple)) else [objs]:
        c = V(centro)
        o.data.transform(Matrix.Translation(c) @ Matrix.Rotation(math.radians(graus), 4, eixo) @ Matrix.Translation(-c))
    return objs


def move(objs, loc):
    for o in objs if isinstance(objs, (list, tuple)) else [objs]:
        o.data.transform(Matrix.Translation(loc))
    return objs


def cruzeta(x, y, z, cor, alt=0.05, tam=1.0, nome="cruzeta"):
    """Registro de cruzeta: base, haste e manopla em cruz com botão no meio."""
    s = tam
    ps = [mb.cilindro(0.022 * s, 0.012 * s, x=x, y=y, z=z, cor=cor, seg=12, bisel=0.004 * s),
          mb.cilindro(0.010 * s, alt, x=x, y=y, z=z, cor=cor, seg=8, bisel=0.0)]
    for g in (45, 135):
        b = mb.caixa(0.075 * s, 0.014 * s, 0.012 * s, z=-0.006 * s, cor=cor, bisel=0.005 * s, seg=1)
        mb.transforma(b, rot=("Z", g))
        mb.transforma(b, loc=(x, y, z + alt))
        ps.append(b)
        for sx in (-1, 1):
            ps.append(mb.esfera(0.009 * s, x=x + sx * 0.035 * s * math.cos(math.radians(g)),
                                y=y + sx * 0.035 * s * math.sin(math.radians(g)), z=z + alt, cor=cor, seg=8))
    ps.append(mb.esfera(0.012 * s, x=x, y=y, z=z + alt + 0.006 * s, cor=cor, seg=10, esc=(1, 1, 0.8)))
    return mb.junta(ps, nome)


def torneira_mono(x, y, z, cor, alt=0.17, bico=0.12, nome="torneira"):
    """Monocomando de bancada: corpo redondo, alavanca em cima e bica curva para −Y."""
    ps = [mb.cilindro(0.03, 0.01, x=x, y=y, z=z, cor=cor, seg=20, bisel=0.004),
          mb.torno([(0, 0), (0.022, 0), (0.022, alt * 0.8), (0.02, alt * 0.86), (0.0, alt * 0.88)], x=x, y=y, z=z + 0.008,
                   cor=cor, seg=20),
          mb.tubo([(x, y - 0.01, z + alt * 0.62), (x, y - bico, z + alt * 0.62), (x, y - bico - 0.012, z + alt * 0.5)],
                  0.011, cor=cor, raio_curva=0.03, seg=12),
          mb.tubo([(x, y, z + alt * 0.86), (x, y + 0.02, z + alt * 0.97), (x, y + 0.075, z + alt * 1.02)], 0.008,
                  cor=cor, raio_curva=0.02, seg=10)]
    return mb.junta(ps, nome)


def torneira_bica_alta(x, y, z, cor, alt=0.26, bico=0.13, nome="bica"):
    """Bica em pescoço de cisne (para cuba de apoio ou com cruzetas)."""
    ps = [mb.cilindro(0.026, 0.012, x=x, y=y, z=z, cor=cor, seg=18, bisel=0.004),
          mb.tubo([(x, y, z + 0.005), (x, y, z + alt), (x, y - bico, z + alt), (x, y - bico, z + alt - 0.05)], 0.0125,
                  cor=cor, raio_curva=bico * 0.48, seg=8),
          mb.cilindro(0.015, 0.02, x=x, y=y - bico, z=z + alt - 0.065, cor=cor, seg=12, bisel=0.003)]
    return mb.junta(ps, nome)


def ducha_mao(cor, comp=0.17, r_cab=0.042, nome="ducha"):
    """Chuveirinho em pé ao longo de +Z, com a base do cabo na origem e o crivo virado para −Y."""
    cabo = mb.torno([(0, 0), (0.012, 0), (0.014, comp * 0.6), (0.017, comp), (0, comp)], cor=cor, seg=14)
    cab = mb.cilindro(r_cab, 0.028, y=0.0, z=comp + r_cab * 0.6, cor=cor, eixo="y", seg=22, bisel=0.008)
    crivo = mb.cilindro(r_cab * 0.75, 0.004, y=-0.015, z=comp + r_cab * 0.6, cor="cinza_claro", eixo="y", seg=18,
                        bisel=0.001)
    return mb.junta([cabo, cab, crivo], nome)


def mangueira(pts, cor="cromo"):
    return mb.tubo(pts, 0.0065, cor=cor, raio_curva=0.06, seg=8)


def bandeja_box(forma, alt, cor="louca", nome="bandeja"):
    """Base de box: forma(d) → contorno 2D recuado d. Borda boleada e piso rebaixado com ralo."""
    aneis = [anel(forma(0.012), 0.0), anel(forma(0.0), 0.012), anel(forma(0.0), alt - 0.014),
             anel(forma(0.006), alt - 0.002), anel(forma(0.016), alt), anel(forma(0.045), alt - 0.002),
             anel(forma(0.056), alt - 0.014), anel(forma(0.07), alt - 0.035)]
    return loft(aneis, cor, nome=nome)


def coluna_chuveiro(x, y, z_reg, z_top, cor, cabeca="redonda", braco=0.3, ducha=True, r=0.013):
    """Chuveiro de parede dentro do box: registro na parede (y), tubo até z_top, braço e cabeça. Frente para −Y."""
    ps = [mb.cilindro(0.04, 0.012, x=x, y=y - 0.006, z=z_reg, cor=cor, eixo="y", seg=20),
          mb.cilindro(0.028, 0.06, x=x, y=y - 0.03, z=z_reg, cor=cor, eixo="y", seg=18),
          mb.caixa(0.012, 0.07, 0.016, x=x, y=y - 0.075, z=z_reg - 0.008, cor=cor, bisel=0.006),
          mb.tubo([(x, y - 0.05, z_reg + 0.02), (x, y - 0.05, z_top), (x, y - 0.05 - braco, z_top),
                   (x, y - 0.05 - braco, z_top - 0.05)], r, cor=cor, raio_curva=0.06, seg=12)]
    hy = y - 0.05 - braco
    if cabeca == "redonda":
        ps.append(mb.cilindro(0.11, 0.022, x=x, y=hy, z=z_top - 0.075, cor=cor, seg=28, bisel=0.008))
        ps.append(mb.cilindro(0.09, 0.004, x=x, y=hy, z=z_top - 0.078, cor="cinza_claro", seg=24, bisel=0.001))
    else:
        ps.append(mb.caixa(0.22, 0.22, 0.02, x=x, y=hy, z=z_top - 0.075, cor=cor, bisel=0.008))
        ps.append(mb.caixa(0.19, 0.19, 0.004, x=x, y=hy, z=z_top - 0.078, cor="cinza_claro", bisel=0.002))
    if ducha:
        d = ducha_mao(cor)
        mb.transforma(d, rot=("X", -12))
        mb.transforma(d, loc=(x + 0.12, y - 0.05, z_reg + 0.18))
        ps += [d, mb.caixa(0.04, 0.05, 0.03, x=x + 0.12, y=y - 0.025, z=z_reg + 0.22, cor=cor, bisel=0.008),
               mangueira([(x + 0.02, y - 0.07, z_reg - 0.02), (x + 0.04, y - 0.09, z_reg - 0.3),
                          (x + 0.12, y - 0.09, z_reg - 0.32), (x + 0.12, y - 0.06, z_reg + 0.17)], cor)]
    return ps


# =====================================================================================================================
# Registro das peças
# =====================================================================================================================
PECAS = []


def reg(id_, secao, grupo, fn, rotulo, **kw):
    PECAS.append({"id": id_, "secao": secao, "grupo": grupo, "fn": fn, "rotulo": rotulo, "kw": kw})


def ex(fixacao="chao", tags=(), alt=None, mini=None, pacote=False):
    d = {"fixacao": fixacao, "tags": list(tags), "pacote": pacote}
    if alt is not None:
        d["altura_instalacao"] = alt
    if mini:
        d["miniatura_dir"] = mini
    return d


# =====================================================================================================================
# A · Banho: boxes, chuveiros, banheiras
# =====================================================================================================================
def box_cabine(it, cor="azul_medio", moldura="branco"):
    """Cabine fechada: planta em D (fundo reto, frente em semicírculo), painéis coloridos, teto, portas curvas."""
    R0, H, B = 0.45, 2.0, 0.17

    def forma(d):
        R = R0 - d
        pts = [(x, y, 0) for x, y in arco2(0, 0, R, 180, 360, 20)]
        pts += [(R0 - d, R0 - d, 0.06), (-R0 + d, R0 - d, 0.06)]
        return contorno(pts, 4)
    it.add(bandeja_box(forma, B, "louca"))
    it.add(mb.cilindro(0.04, 0.004, z=B - 0.035, cor="cromo", seg=18, bisel=0.001))
    # painéis do fundo (U) e o painel de hidromassagem
    caminho = contorno([(-0.432, 0.0, 0), (-0.432, 0.432, 0.05), (0.432, 0.432, 0.05), (0.432, 0.0, 0)], 4)
    it.add(faixa(caminho, 0.014, B - 0.02, H, cor=cor))
    it.add(mb.caixa(0.17, 0.035, 0.95, y=0.41, z=0.9, cor="azul_marinho", bisel=0.012))
    for k in range(4):
        it.add(mb.cilindro(0.016, 0.012, x=0, y=0.39, z=1.05 + k * 0.17, cor="cromo", eixo="y", seg=14, bisel=0.003))
    for k in range(3):
        it.add(mb.cilindro(0.012, 0.012, x=-0.05 + k * 0.05, y=0.39, z=0.98, cor="cinza_claro", eixo="y", seg=12,
                           bisel=0.003))
    d = ducha_mao("cromo")
    mb.transforma(d, loc=(0.0, 0.37, 1.55))
    it.add(d, mangueira([(0, 0.385, 0.92), (0.06, 0.34, 0.75), (0.08, 0.34, 1.0), (0.0, 0.37, 1.55)]))
    # prateleira de canto
    it.add(mb.extrudado(contorno([(0.42, 0.42, 0), (0.25, 0.42, 0), (0.42, 0.25, 0)], 3), 0.02, z=1.25, cor=moldura,
                        bisel=0.006))
    it.slot("prateleira", (0.36, 0.36, 1.27), (0.1, 0.1, 0.18))
    # teto em cúpula
    aneis = [anel(forma(0.0), H - 0.01), anel(forma(0.0), H + 0.04), anel(forma(0.03), H + 0.075),
             anel(forma(0.12), H + 0.1), anel(forma(0.25), H + 0.11)]
    it.add(loft(aneis, moldura, ini=True, fim=True, nome="teto"))
    it.add(mb.cilindro(0.1, 0.012, y=0.1, z=H - 0.02, cor="cromo", seg=22, bisel=0.004))
    # montantes da frente
    for sx in (-1, 1):
        it.add(mb.caixa(0.03, 0.03, H - B + 0.02, x=sx * 0.44, y=0.0, z=B - 0.01, cor=moldura, bisel=0.01))
    # portas curvas: a da esquerda fixa, a da direita corre por dentro (gira em volta do centro do arco)

    def folha(R, a0, a1, puxa):
        pts = arco2(0, 0, R, a0, a1, 12)
        ps = [faixa(pts, 0.008, B + 0.01, H - 0.02, cor=None, mat="vidro", nome="vidro"),
              faixa(pts, 0.02, B + 0.005, B + 0.04, cor=moldura), faixa(pts, 0.02, H - 0.06, H - 0.02, cor=moldura)]
        for a in (a0, a1):
            px, py = R * math.cos(math.radians(a)), R * math.sin(math.radians(a))
            ps.append(mb.caixa(0.02, 0.02, H - B - 0.06, x=px, y=py, z=B + 0.02, cor=moldura, bisel=0.007))
        if puxa is not None:
            px, py = (R + 0.03) * math.cos(math.radians(puxa)), (R + 0.03) * math.sin(math.radians(puxa))
            ps.append(mb.cilindro(0.011, 0.3, x=px, y=py, z=1.0, cor=moldura, seg=12, bisel=0.004))
        return ps
    it.add(folha(R0 - 0.004, 182, 272, None))
    it.porta(folha(R0 - 0.026, 268, 358, 275), dobradica=(0, 0, 0), eixo="z", angulo=-80, nome="porta_box")
    return ex(tags=["box", "chuveiro", "hidromassagem"])


def box_canto(it, moldura="branco"):
    """Box de canto curvo (canto no fundo à esquerda), portas curvas de correr em volta do arco."""
    H, B, R = 2.0, 0.1, 0.55
    A = (0.45 - R, -0.45 + R)

    def forma(d):
        pts = [(-0.45 + d, 0.45 - d, 0.05), (-0.45 + d, -0.45 + d, 0.05)]
        pts += [(x, y, 0) for x, y in arco2(A[0], A[1], R - d, 270, 360, 16)]
        pts += [(0.45 - d, 0.45 - d, 0.05)]
        return contorno(pts, 4)
    it.add(bandeja_box(forma, B, "louca"))
    it.add(mb.cilindro(0.04, 0.004, x=-0.05, y=0.05, z=B - 0.035, cor="cromo", seg=18, bisel=0.001))
    # vidros fixos retos e a folha fixa curva
    it.add(faixa([(0.437, 0.44), (0.437, A[1])], 0.008, B, H, cor=None, mat="vidro"))
    it.add(faixa([(-0.44, -0.437), (A[0], -0.437)], 0.008, B, H, cor=None, mat="vidro"))
    it.add(faixa(arco2(A[0], A[1], R - 0.013, 312, 360, 10), 0.008, B, H, cor=None, mat="vidro"))
    # perfis
    topo = [(0.437, 0.45)] + arco2(A[0], A[1], R - 0.013, 360, 270, 16)[:-1] + [(A[0], -0.437), (-0.45, -0.437)]
    topo = [(0.437, 0.45), (0.437, A[1])] + arco2(A[0], A[1], R - 0.013, 360, 270, 16)[1:-1] + [(A[0], -0.437),
                                                                                             (-0.45, -0.437)]
    it.add(mb.tubo([(x, y, H) for x, y in topo], 0.014, cor=moldura, raio_curva=0.03, seg=10))
    for p in ((0.437, 0.44), (-0.44, -0.437), (0.437, A[1]), (A[0], -0.437)):
        it.add(mb.caixa(0.028, 0.028, H - B, x=p[0], y=p[1], z=B, cor=moldura, bisel=0.008))
    it.add(coluna_chuveiro(-0.25, 0.45, 1.0, 1.95, "cromo", "redonda", braco=0.2))
    # folha que corre (por dentro), gira em volta do centro do arco
    pts = arco2(A[0], A[1], R - 0.032, 270, 316, 10)
    fol = [faixa(pts, 0.008, B + 0.01, H - 0.03, cor=None, mat="vidro"),
           faixa(pts, 0.018, H - 0.07, H - 0.03, cor=moldura), faixa(pts, 0.018, B + 0.01, B + 0.04, cor=moldura)]
    a = math.radians(285)
    fol.append(mb.cilindro(0.01, 0.28, x=A[0] + (R - 0.06) * math.cos(a), y=A[1] + (R - 0.06) * math.sin(a), z=0.95,
                           cor=moldura, seg=12, bisel=0.004))
    fol.append(mb.cilindro(0.01, 0.28, x=A[0] + (R - 0.004) * math.cos(a), y=A[1] + (R - 0.004) * math.sin(a),
                           z=0.95, cor=moldura, seg=12, bisel=0.004))
    it.porta(fol, dobradica=(A[0], A[1], 0), eixo="z", angulo=38, nome="porta_box")
    it.add(mb.extrudado(contorno([(-0.43, 0.43, 0), (-0.27, 0.43, 0), (-0.43, 0.27, 0)], 3), 0.02, z=1.3,
                        cor=moldura, bisel=0.006))
    it.slot("prateleira", (-0.38, 0.38, 1.32), (0.1, 0.1, 0.18))
    return ex(tags=["box", "chuveiro", "canto"])


def box_retangular(it, moldura="branco"):
    """Box retangular 1,0 × 0,8: frente com folha fixa e folha de correr, lateral direita fixa."""
    L, P, H, B = 1.0, 0.8, 2.0, 0.08

    def forma(d):
        return mb.ret_arredondado(L - 2 * d, P - 2 * d, max(0.006, 0.05 - d), 4)
    it.add(bandeja_box(forma, B, "louca"))
    it.add(mb.cilindro(0.04, 0.004, x=0.1, z=B - 0.035, cor="cromo", seg=18, bisel=0.001))
    yf = -P / 2 + 0.03
    it.add(mb.caixa(L / 2 + 0.02, 0.008, H - B - 0.06, x=-L / 4 + 0.01, y=yf, z=B + 0.01, cor=None, mat="vidro"))
    it.add(mb.caixa(0.008, P - 0.04, H - B - 0.06, x=L / 2 - 0.02, y=0.0, z=B + 0.01, cor=None, mat="vidro"))
    for sx, sy in ((-1, -1), (1, -1), (1, 1)):
        it.add(mb.caixa(0.03, 0.03, H - B, x=sx * (L / 2 - 0.02), y=sy * (P / 2 - 0.02) + (0.01 if sy < 0 else 0), z=B,
                        cor=moldura, bisel=0.008))
    it.add(mb.caixa(L - 0.02, 0.05, 0.035, y=yf + 0.012, z=H - 0.035, cor=moldura, bisel=0.01))
    it.add(mb.caixa(0.035, P - 0.03, 0.035, x=L / 2 - 0.02, z=H - 0.035, cor=moldura, bisel=0.01))
    it.add(mb.caixa(L / 2, 0.03, 0.02, x=-L / 4, y=yf, z=B, cor=moldura, bisel=0.006))
    it.add(coluna_chuveiro(-0.1, P / 2, 1.0, 1.95, "cromo", "quadrada", braco=0.25))
    # folha de correr (por dentro da fixa), corre para a esquerda
    yc = yf + 0.025
    fol = [mb.caixa(L / 2 - 0.02, 0.008, H - B - 0.1, x=L / 4 - 0.02, y=yc, z=B + 0.04, cor=None, mat="vidro"),
           mb.caixa(L / 2 - 0.02, 0.02, 0.03, x=L / 4 - 0.02, y=yc, z=B + 0.025, cor=moldura, bisel=0.007),
           mb.caixa(L / 2 - 0.02, 0.02, 0.03, x=L / 4 - 0.02, y=yc, z=H - 0.075, cor=moldura, bisel=0.007),
           mb.caixa(0.02, 0.02, H - B - 0.1, x=0.02, y=yc, z=B + 0.04, cor=moldura, bisel=0.007),
           mb.puxador("barra", x=0.08, y=yc - 0.012, z=1.05, cor=moldura, tam=1.6)]
    it.correr(fol, direcao=(-1, 0, 0), curso=0.42, nome="porta_box")
    it.add(mb.extrudado(contorno([(-0.48, 0.38, 0), (-0.3, 0.38, 0), (-0.48, 0.2, 0)], 3), 0.02, z=1.3,
                        cor=moldura, bisel=0.006))
    it.slot("prateleira", (-0.42, 0.33, 1.32), (0.1, 0.1, 0.18))
    return ex(tags=["box", "chuveiro"])


# ---- conjuntos de chuveiro (de parede: y = 0 é a parede, a peça vai para −Y; base no ponto mais baixo)
def chuveiro_quadrado(it, cor="grafite"):
    z0 = 0.32  # registro
    ps = [mb.caixa(0.24, 0.05, 0.06, y=-0.03, z=z0 - 0.03, cor=cor, bisel=0.02)]
    for sx in (-1, 1):
        ps.append(mb.cilindro(0.032, 0.03, x=sx * 0.13, y=-0.04, z=z0, cor=cor, eixo="y", seg=20, bisel=0.008))
        ps.append(mb.cilindro(0.02, 0.012, x=sx * 0.13, y=-0.062, z=z0, cor="cinza", eixo="y", seg=16, bisel=0.003))
        ps.append(mb.cilindro(0.025, 0.012, x=sx * 0.08, y=-0.006, z=z0, cor=cor, eixo="y", seg=16))
    ps.append(mb.tubo([(0, -0.045, z0 + 0.03), (0, -0.045, z0 + 1.15), (0, -0.33, z0 + 1.15)], 0.014, cor=cor,
                      raio_curva=0.05, seg=12))
    ps.append(mb.cilindro(0.025, 0.012, y=-0.006, z=z0 + 0.95, cor=cor, eixo="y", seg=16))
    ps.append(mb.caixa(0.03, 0.04, 0.02, y=-0.026, z=z0 + 0.94, cor=cor, bisel=0.006))
    ps.append(mb.caixa(0.26, 0.26, 0.024, y=-0.3, z=z0 + 1.105, cor=cor, bisel=0.009))
    ps.append(mb.caixa(0.22, 0.22, 0.004, y=-0.3, z=z0 + 1.103, cor="cinza", bisel=0.002))
    d = ducha_mao(cor)
    mb.transforma(d, rot=("X", -10))
    mb.transforma(d, loc=(0.0, -0.075, z0 + 0.48))
    ps += [d, mb.caixa(0.045, 0.04, 0.035, y=-0.06, z=z0 + 0.52, cor=cor, bisel=0.01),
           mangueira([(0, -0.06, z0 - 0.04), (0.02, -0.08, z0 - 0.3), (0.1, -0.08, z0 - 0.32), (0.13, -0.08, z0 - 0.1),
                      (0.02, -0.08, z0 + 0.48)], cor)]
    minz = min(mb.bbox(o)[0].z for o in ps)
    move(ps, (0, 0, -minz))
    it.add(ps)
    return ex("parede", ["chuveiro", "ducha"], alt=round(1.0 - z0 + minz, 2))


def chuveiro_redondo(it, cor="branco"):
    z0 = 0.34
    ps = [mb.cilindro(0.04, 0.012, y=-0.006, z=z0, cor=cor, eixo="y", seg=22),
          mb.torno([(0, 0), (0.03, 0), (0.033, 0.06), (0.03, 0.14), (0, 0.15)], y=-0.05, z=z0 - 0.07, cor=cor, seg=20),
          mb.cilindro(0.012, 0.05, y=-0.03, z=z0, cor=cor, eixo="y", seg=12),
          mb.tubo([(0, -0.05, z0 + 0.075), (0, -0.07, z0 + 0.09), (0, -0.12, z0 + 0.09)], 0.009, cor=cor,
                  raio_curva=0.02, seg=10),
          mb.tubo([(0, -0.05, z0 + 0.08), (0, -0.05, z0 + 1.2), (0, -0.3, z0 + 1.28)], 0.013, cor=cor,
                  raio_curva=0.14, seg=12),
          mb.cilindro(0.12, 0.024, y=-0.33, z=z0 + 1.23, cor=cor, seg=30, bisel=0.01),
          mb.cilindro(0.1, 0.004, y=-0.33, z=z0 + 1.228, cor="cinza_claro", seg=26, bisel=0.001),
          mb.cilindro(0.03, 0.03, y=-0.33, z=z0 + 1.25, cor=cor, seg=18, bisel=0.008),
          mb.caixa(0.04, 0.05, 0.05, y=-0.025, z=z0 + 1.0, cor=cor, bisel=0.012)]
    d = ducha_mao(cor)
    mb.transforma(d, rot=("X", -8))
    mb.transforma(d, loc=(0.0, -0.08, z0 + 0.62))
    ps += [d, mb.caixa(0.04, 0.035, 0.04, y=-0.065, z=z0 + 0.66, cor=cor, bisel=0.012),
           mangueira([(0, -0.05, z0 - 0.07), (0.03, -0.07, z0 - 0.32), (0.11, -0.07, z0 - 0.33), (0.1, -0.08, z0),
                      (0.0, -0.08, z0 + 0.62)], cor)]
    minz = min(mb.bbox(o)[0].z for o in ps)
    move(ps, (0, 0, -minz))
    it.add(ps)
    return ex("parede", ["chuveiro", "ducha"], alt=round(1.0 - z0 + minz, 2))


def chuveiro_painel(it, cor="grafite"):
    it.add(mb.caixa(0.2, 0.05, 1.25, y=-0.03, z=0.0, cor=cor, bisel=0.02))
    it.add(mb.caixa(0.24, 0.24, 0.03, y=-0.13, z=1.22, cor=cor, bisel=0.012))
    it.add(mb.caixa(0.2, 0.2, 0.004, y=-0.13, z=1.218, cor="cinza", bisel=0.002))
    for k in range(3):
        for sx in (-1, 1):
            it.add(mb.cilindro(0.016, 0.01, x=sx * 0.05, y=-0.058, z=0.55 + k * 0.17, cor="cinza_claro", eixo="y",
                               seg=14, bisel=0.003))
    for k in range(2):
        it.add(mb.cilindro(0.022, 0.025, x=0, y=-0.065, z=0.25 + k * 0.12, cor="cromo", eixo="y", seg=18, bisel=0.006))
    it.add(mb.caixa(0.09, 0.006, 0.04, y=-0.056, z=1.06, cor="tela_azul", bisel=0.002))
    d = ducha_mao("cromo")
    mb.transforma(d, rot=("X", -8))
    mb.transforma(d, loc=(0.13, -0.05, 0.42))
    it.add(d, mb.caixa(0.05, 0.035, 0.035, x=0.12, y=-0.04, z=0.45, cor="cromo", bisel=0.01),
           mangueira([(0.08, -0.04, 0.12), (0.14, -0.06, 0.05), (0.16, -0.06, 0.2), (0.13, -0.05, 0.42)]))
    return ex("parede", ["chuveiro", "hidromassagem"], alt=0.9)


def ducha_barra(it, cor="cromo"):
    ps = [mb.cilindro(0.026, 0.012, x=0, y=-0.006, z=0.03, cor=cor, eixo="y", seg=18),
          mb.tubo([(0, -0.012, 0.03), (0, -0.04, 0.03), (0, -0.05, 0.0)], 0.011, cor=cor, raio_curva=0.02, seg=10),
          mb.tubo([(0.12, -0.0, 0.25), (0.12, -0.04, 0.25), (0.12, -0.04, 0.95), (0.12, 0.0, 0.95)], 0.011, cor=cor,
                  raio_curva=0.03, seg=12),
          mb.caixa(0.04, 0.03, 0.05, x=0.12, y=-0.045, z=0.78, cor=cor, bisel=0.01),
          mb.extrudado(contorno([(0.04, -0.01, 0.01), (0.2, -0.01, 0.01), (0.2, -0.1, 0.03), (0.04, -0.1, 0.03)], 3),
                       0.012, z=0.3, cor=cor, bisel=0.004)]
    for sx in (0.04, 0.2):
        ps.append(mb.cilindro(0.004, 0.025, x=sx, y=-0.1, z=0.31, cor=cor, seg=8, bisel=0.001))
    d = ducha_mao(cor, comp=0.18, r_cab=0.05)
    mb.transforma(d, rot=("X", -12))
    mb.transforma(d, loc=(0.12, -0.065, 0.62))
    ps += [d, mangueira([(0, -0.05, 0.0), (0.0, -0.06, -0.25), (0.07, -0.07, -0.28), (0.12, -0.07, 0.0),
                         (0.12, -0.07, 0.62)], cor)]
    minz = min(mb.bbox(o)[0].z for o in ps)
    move(ps, (-0.06, 0, -minz))
    it.add(ps)
    return ex("parede", ["chuveiro", "ducha"], alt=round(0.75 + minz, 2))


def chuveiro_exposto(it, cor="ferro"):
    """Tubulação aparente que sai do chão: dois tubos com registros de cruzeta, coluna e cabeça em sino."""
    ps = []
    for sx in (-1, 1):
        x = sx * 0.12
        ps += [mb.cilindro(0.035, 0.015, x=x, y=-0.07, z=0, cor=cor, seg=18, bisel=0.005),
               mb.cilindro(0.014, 1.0, x=x, y=-0.07, z=0.01, cor=cor, seg=12, bisel=0.002),
               mb.cilindro(0.02, 0.04, x=x, y=-0.07, z=0.45, cor=cor, seg=14, bisel=0.006),
               mb.tubo([(x, 0, 0.47), (x, -0.07, 0.47)], 0.009, cor=cor, seg=8),
               mb.cilindro(0.022, 0.06, x=x, y=-0.07, z=0.86, cor=cor, seg=14, bisel=0.008)]
        c = cruzeta(x, -0.07, 0.0, cor, alt=0.03, tam=0.9)
        mb.transforma(c, rot=("X", 90))
        mb.transforma(c, loc=(0, -0.095, 0.89))
        ps.append(c)
    ps += [mb.tubo([(-0.12, -0.07, 1.0), (-0.12, -0.07, 1.06), (0.12, -0.07, 1.06), (0.12, -0.07, 1.0)], 0.014,
                   cor=cor, raio_curva=0.04, seg=12),
           mb.cilindro(0.024, 0.06, x=0, y=-0.07, z=1.03, cor=cor, seg=14, bisel=0.008),
           mb.tubo([(0, -0.07, 1.08), (0, -0.07, 1.95), (0, -0.3, 1.95), (0, -0.3, 1.9)], 0.014, cor=cor,
                   raio_curva=0.08, seg=12),
           mb.torno([(0, 0), (0.09, 0), (0.085, 0.015), (0.04, 0.06), (0.018, 0.09), (0, 0.09)], y=-0.3, z=1.81,
                    cor=cor, seg=24),
           mb.cilindro(0.075, 0.004, y=-0.3, z=1.808, cor="cinza", seg=22, bisel=0.001),
           mb.caixa(0.03, 0.07, 0.02, y=-0.035, z=1.6, cor=cor, bisel=0.008)]
    d = ducha_mao(cor)
    mb.transforma(d, rot=("Z", 180))
    mb.transforma(d, loc=(0.2, -0.08, 0.56))
    ps += [d, mb.tubo([(0.12, -0.07, 0.62), (0.2, -0.08, 0.62), (0.2, -0.08, 0.72)], 0.008, cor=cor, seg=8),
           mangueira([(0.0, -0.08, 1.06), (0.04, -0.1, 0.7), (0.16, -0.1, 0.5), (0.2, -0.08, 0.56)], cor)]
    it.add(ps)
    return ex("parede", ["chuveiro", "retro"], alt=0.0)


# ---- banheiras
def banheira_solta(it, cor="louca", cor_dentro="porcelana_azul"):
    S = 96

    def r(a, b, z, n=4.5):
        return anel(sup(a, b, n, S), z)
    aneis = [r(0.70, 0.29, 0.0), r(0.735, 0.32, 0.015), r(0.80, 0.36, 0.3), r(0.835, 0.385, 0.53), r(0.84, 0.39, 0.565),
             r(0.825, 0.375, 0.585), r(0.79, 0.34, 0.585), r(0.775, 0.325, 0.56), r(0.75, 0.30, 0.38),
             r(0.70, 0.26, 0.2), r(0.64, 0.215, 0.135), r(0.56, 0.17, 0.115)]
    ob = loft(aneis, cor, nome="banheira")
    pinta_dentro(ob, cor_dentro, 0.58)
    it.add(ob)
    it.add(mb.cilindro(0.03, 0.006, x=-0.55, z=0.112, cor="cromo", seg=16, bisel=0.002))
    it.add(mb.cilindro(0.025, 0.012, x=-0.765, y=0, z=0.46, cor="cromo", eixo="x", seg=16, bisel=0.004))
    it.slot("dentro", (0, 0, 0.12), (1.1, 0.4, 0.4))
    return ex(tags=["banheira"], mini=(0.5, -1, 0.85))


def banheira_embutida(it, saia="madeira_media", cor="louca", cor_dentro="porcelana_azul"):
    L, P, Hs = 1.70, 0.76, 0.54
    e = 0.04
    it.add(mb.caixa(L - 0.08, P - 0.08, 0.06, cor="madeira_escura" if "madeira" in saia else "cinza", bisel=0.01))
    fr = mb.frente(L - 2 * e, Hs - 0.06, esp=e, estilo="moldura", cor=saia, cor2=saia, margem=0.06)
    mb.transforma(fr, loc=(0, -P / 2 + e, 0.05))
    it.add(fr, mb.caixa(L - 2 * e, e, Hs - 0.06, y=P / 2 - e / 2, z=0.05, cor=saia, bisel=0.008))
    for sx in (-1, 1):
        it.add(mb.caixa(e, P, Hs - 0.04, x=sx * (L / 2 - e / 2), z=0.04, cor=saia, bisel=0.012))
    S = 96
    # deck e bacia como um anel só: deck (retângulo) → borda da bacia (superelipse), amostrados pelo mesmo ângulo
    def rr(d, z):
        base = mb.ret_arredondado(L + 0.02 - 2 * d, P + 0.02 - 2 * d, max(0.01, 0.06 - d), 8)
        return anel(radial(base, S), z)

    def bb(a, b, z, dx=0.0):
        return anel(radial(sup(a, b, 5, 64, dx=dx), S), z)
    aneis = [rr(0.02, Hs - 0.04), rr(0.0, Hs - 0.02), rr(0.0, Hs + 0.025), rr(0.012, Hs + 0.045),
             bb(0.76, 0.31, Hs + 0.045), bb(0.745, 0.295, Hs + 0.03), bb(0.72, 0.28, Hs - 0.15),
             bb(0.66, 0.245, Hs - 0.36), bb(0.58, 0.19, Hs - 0.42), bb(0.48, 0.14, Hs - 0.43)]
    ob = loft(aneis, cor, nome="bacia")
    pinta_dentro(ob, cor_dentro, Hs + 0.04)
    it.add(ob)
    it.add(mb.cilindro(0.03, 0.006, x=-0.4, z=Hs - 0.432, cor="cromo", seg=16, bisel=0.002))
    # misturador de borda com bica e duas cruzetas
    zt = Hs + 0.045
    it.add(mb.cilindro(0.035, 0.012, x=0.5, y=0.35, z=zt, cor="cromo", seg=18, bisel=0.004))
    it.add(mb.caixa(0.2, 0.05, 0.05, x=0.5, y=0.35, z=zt + 0.03, cor="cromo", bisel=0.02))
    it.add(mb.tubo([(0.5, 0.33, zt + 0.06), (0.5, 0.26, zt + 0.06), (0.5, 0.24, zt + 0.03)], 0.012, cor="cromo",
                   raio_curva=0.025))
    for sx in (-1, 1):
        it.add(cruzeta(0.5 + sx * 0.1, 0.35, zt + 0.08, "cromo", alt=0.012, tam=0.8))
    it.slot("dentro", (0, 0, Hs - 0.43), (1.1, 0.38, 0.4))
    return ex(tags=["banheira", "embutida"], mini=(0.5, -1, 0.85))


def banheira_vitoriana(it, cor="louca", pes="ouro", coluna=None, cor_dentro=None):
    """Banheira de pés (vitoriana): bordas altas nas duas pontas, borda enrolada, pés de garra."""
    S = 96
    zb = 0.14

    def zf(x, y):
        k = abs(x) / 0.85
        return 0.16 * k ** 3.2

    def r(a, b, z, f=None, n=2.6):
        return anel(sup(a, b, n, S), z, zf=f)
    aneis = [r(0.5, 0.2, zb), r(0.56, 0.24, zb + 0.02), r(0.72, 0.33, zb + 0.15), r(0.82, 0.375, zb + 0.34, zf),
             r(0.86, 0.395, zb + 0.43, zf), r(0.87, 0.405, zb + 0.46, zf), r(0.855, 0.39, zb + 0.485, zf),
             r(0.82, 0.355, zb + 0.48, zf), r(0.8, 0.34, zb + 0.43, zf), r(0.75, 0.31, zb + 0.25),
             r(0.64, 0.255, zb + 0.1), r(0.5, 0.19, zb + 0.06)]
    ob = loft(aneis, cor, nome="banheira")
    if cor_dentro:
        pinta_dentro(ob, cor_dentro, zb + 0.48)
    it.add(ob)
    for sx in (-1, 1):
        for sy in (-1, 1):
            p = mb.torno([(0, 0), (0.05, 0), (0.055, 0.015), (0.04, 0.035), (0.026, 0.07), (0.024, 0.1), (0.04, 0.13),
                          (0.05, 0.155), (0, 0.16)], cor=pes, seg=16)
            mb.transforma(p, rot=[("Y", -sx * 12), ("X", sy * 10)])
            p.data.update()
            z_min = min(v.co.z for v in p.data.vertices)  # o pé inclinado não pode afundar no chão
            mb.transforma(p, loc=(sx * 0.52, sy * 0.19, -z_min))
            it.add(p)
            it.add(mb.esfera(0.035, x=sx * 0.56, y=sy * 0.22, z=0.025, cor=pes, esc=(1.2, 1.0, 0.7), seg=14))
    it.add(mb.esfera(0.022, x=-0.72, y=0, z=zb + 0.36, cor=pes, seg=12, esc=(0.6, 1, 1)))
    it.add(mb.cilindro(0.028, 0.006, x=-0.45, z=zb + 0.057, cor=pes, seg=16, bisel=0.002))
    if coluna:
        # coluna de piso com bica sobre a borda e chuveirinho
        y = 0.5
        it.add(mb.cilindro(0.05, 0.02, x=0, y=y, z=0, cor=coluna, seg=20, bisel=0.006))
        it.add(mb.tubo([(0, y, 0.01), (0, y, 0.85), (0, 0.32, 0.85), (0, 0.32, 0.79)], 0.016, cor=coluna,
                       raio_curva=0.08))
        for sx in (-1, 1):
            it.add(cruzeta(sx * 0.07, y, 0.6, coluna, alt=0.03, tam=0.8))
        it.add(mb.cilindro(0.02, 0.08, x=0, y=y, z=0.57, cor=coluna, seg=14, bisel=0.006))
        it.add(mb.caixa(0.14, 0.03, 0.03, x=0, y=y, z=0.6, cor=coluna, bisel=0.012))
        d = ducha_mao(coluna)
        mb.transforma(d, loc=(0.0, y + 0.02, 0.87))
        it.add(d, mb.caixa(0.05, 0.04, 0.04, x=0, y=y + 0.01, z=0.9, cor=coluna, bisel=0.01))
        it.colisao([((0, 0, 0), (1.74, 0.82, zb + 0.66)), ((0, y, 0), (0.15, 0.1, 1.15))])
    it.slot("dentro", (0, 0, zb + 0.07), (1.0, 0.36, 0.4))
    return ex(tags=["banheira", "classica", "pes"], mini=(0.5, -1, 0.85))


def banheira_canto(it, cor="porcelana_azul", cor_dentro="azul_bebe"):
    """Banheira de canto com hidromassagem: canto no fundo à direita, frente em arco, bacia oval com jatos."""
    S = 96
    L = 1.45
    C = (L / 2, L / 2)
    Rr = L
    base = [(C[0], C[1], 0.08), (C[0] - Rr, C[1], 0.12)]
    base += [(x, y, 0) for x, y in arco2(C[0], C[1], Rr, 180, 270, 24)[1:-1]]
    base += [(C[0], C[1] - Rr, 0.12)]
    poly = contorno(base, 5)
    cb = (0.1, 0.1)  # centro da bacia

    def rr(d, z):
        return anel(radial(encolhe(poly, d, c=cb), S, c=cb), z)
    rot = math.radians(-45)

    def bb(a, b, z):
        pts = [(cb[0] + x * math.cos(rot) - y * math.sin(rot), cb[1] + x * math.sin(rot) + y * math.cos(rot))
               for x, y in sup(a, b, 2.3, 96)]
        return anel(radial(pts, S, c=cb), z)
    H = 0.56
    aneis = [rr(0.015, 0.0), rr(0.0, 0.015), rr(0.0, H - 0.02), rr(0.012, H), bb(0.58, 0.42, H), bb(0.565, 0.405, H - 0.015),
             bb(0.54, 0.38, H - 0.18), bb(0.48, 0.33, H - 0.36), bb(0.38, 0.25, H - 0.43), bb(0.28, 0.17, H - 0.44)]
    ob = loft(aneis, cor, nome="banheira")
    pinta_dentro(ob, cor_dentro, H - 0.005, c=cb)
    it.add(ob)
    # jatos na parede interna
    pts_j = []
    for k in range(7):
        t = 2 * PI * (k + 0.5) / 7 + 1.0
        x0, y0 = 0.528 * math.cos(t), 0.374 * math.sin(t)
        x, y = cb[0] + x0 * math.cos(rot) - y0 * math.sin(rot), cb[1] + x0 * math.sin(rot) + y0 * math.cos(rot)
        pts_j.append((x, y))
    for x, y in pts_j:
        it.add(mb.esfera(0.018, x=x, y=y, z=H - 0.2, cor="cromo", seg=12))
    # comandos e bica no canto do fundo
    q = 0.6
    it.add(mb.cilindro(0.03, 0.012, x=q, y=q, z=H, cor="cromo", seg=16, bisel=0.004))
    it.add(mb.tubo([(q, q, H + 0.005), (q, q, H + 0.08), (q - 0.09, q - 0.09, H + 0.08), (q - 0.11, q - 0.11, H + 0.05)],
                   0.013, cor="cromo", raio_curva=0.03))
    for dx, dy in ((0.04, -0.14), (-0.14, 0.04), (0.06, -0.24), (-0.24, 0.06)):
        it.add(mb.cilindro(0.022, 0.025, x=q + dx, y=q + dy, z=H, cor="cromo", seg=14, bisel=0.006))
    it.slot("dentro", (cb[0], cb[1], 0.13), (0.6, 0.6, 0.4))
    return ex(tags=["banheira", "canto", "hidromassagem"], mini=(0.5, -1, 0.85))


def banheira_oval(it, cor="creme_claro", cor_dentro="pessego"):
    S = 96

    def zf(x, y):
        return 0.07 * max(0.0, x / 0.85) ** 2

    def r(a, b, z, f=None):
        return anel(sup(a, b, 2.15, S), z, zf=f)
    aneis = [r(0.55, 0.25, 0.0), r(0.6, 0.28, 0.02), r(0.78, 0.38, 0.25), r(0.84, 0.41, 0.48, zf), r(0.835, 0.405, 0.53, zf),
             r(0.815, 0.385, 0.55, zf), r(0.79, 0.36, 0.54, zf), r(0.755, 0.33, 0.4), r(0.66, 0.27, 0.2),
             r(0.55, 0.2, 0.13), r(0.42, 0.13, 0.115)]
    ob = loft(aneis, cor, nome="banheira")
    pinta_dentro(ob, cor_dentro, 0.62)
    it.add(ob)
    it.add(mb.cilindro(0.03, 0.006, x=0.0, z=0.112, cor="ouro", seg=16, bisel=0.002))
    it.slot("dentro", (0, 0, 0.12), (1.0, 0.4, 0.4))
    return ex(tags=["banheira", "oval"], mini=(0.5, -1, 0.85))


def banheira_pacote(it):
    pc = mb.importa_pacote("Bath_03")
    it.add(list(pc.values()))
    it.slot("dentro", (0, 0, 0.12), (1.2, 0.45, 0.35))
    return ex(tags=["banheira", "chuveiro"], pacote=True)


reg("box_chuveiro_cabine_azul", "A", "box_cabine", box_cabine, "Box cabine fechada (azul)")
reg("box_chuveiro_canto_curvo_branco", "A", "box_canto", box_canto, "Box de canto curvo (branco)")
reg("box_chuveiro_canto_curvo_grafite", "A", "box_canto", box_canto, "Box de canto curvo (grafite)",
    moldura="grafite")
reg("box_chuveiro_retangular_branco", "A", "box_retangular", box_retangular, "Box retangular (branco)")
reg("box_chuveiro_retangular_preto", "A", "box_retangular", box_retangular, "Box retangular (preto)",
    moldura="preto")
reg("chuveiro_quadrado_grafite", "A", "chuveiro_quadrado", chuveiro_quadrado, "Chuveiro de coluna quadrado (grafite)")
reg("chuveiro_quadrado_cromo", "A", "chuveiro_quadrado", chuveiro_quadrado, "Chuveiro de coluna quadrado (cromado)",
    cor="cromo")
reg("chuveiro_redondo_branco", "A", "chuveiro_redondo", chuveiro_redondo, "Chuveiro redondo com ducha (branco)")
reg("chuveiro_painel_grafite", "A", "chuveiro_painel", chuveiro_painel, "Painel de hidromassagem (grafite)")
reg("chuveiro_ducha_barra_cromo", "A", "ducha_barra", ducha_barra, "Ducha com barra deslizante (cromada)")
reg("chuveiro_exposto_ferro", "A", "chuveiro_exposto", chuveiro_exposto, "Chuveiro de tubos aparentes (ferro)")
reg("chuveiro_exposto_latao", "A", "chuveiro_exposto", chuveiro_exposto, "Chuveiro de tubos aparentes (latão)",
    cor="latao")
reg("banheira_solta_menta", "A", "banheira_solta", banheira_solta, "Banheira solta retangular (menta)",
    cor="porcelana_azul", cor_dentro="menta")
reg("banheira_solta_branca", "A", "banheira_solta", banheira_solta, "Banheira solta retangular (branca)")
reg("banheira_embutida_madeira", "A", "banheira_embutida", banheira_embutida, "Banheira com saia (madeira)")
reg("banheira_embutida_azul", "A", "banheira_embutida", banheira_embutida, "Banheira com saia (azul)",
    saia="azul_claro")
reg("banheira_vitoriana_branca", "A", "banheira_vitoriana", banheira_vitoriana,
    "Banheira vitoriana com pés dourados (branca)", coluna="cromo", cor_dentro="porcelana_azul")
reg("banheira_vitoriana_vermelha", "A", "banheira_vitoriana", banheira_vitoriana, "Banheira vitoriana (vermelha)",
    cor="terracota", pes="ferro")
reg("banheira_canto_hidro_azul", "A", "banheira_canto", banheira_canto, "Banheira de canto com hidromassagem (azul)")
reg("banheira_canto_hidro_branca", "A", "banheira_canto", banheira_canto,
    "Banheira de canto com hidromassagem (branca)", cor="louca", cor_dentro="porcelana_azul")
reg("banheira_oval_creme", "A", "banheira_oval", banheira_oval, "Banheira oval (creme)")
reg("banheira_oval_branca", "A", "banheira_oval", banheira_oval, "Banheira oval (branca)", cor="louca",
    cor_dentro="porcelana_azul")
reg("banheira_ducha_pacote", "A", "banheira_pacote", banheira_pacote, "Banheira com ducha")

# =====================================================================================================================
# B · Pias e armários
# =====================================================================================================================
E = 0.02  # espessura das chapas


def louca(ext, bac, z_top, prof, cor="louca", cor_dentro=None, laje=0.14, bojo=None, S=96, c=(0.0, 0.0),
          ralo="cromo"):
    """Louça de pia côncava: ext(d) = contorno externo recuado d; bac(k) = contorno da cuba na escala k (1 = borda).
    laje: altura da peça (fundo reto); bojo: (k, z) — em vez de fundo reto, a parte de baixo é uma bacia que fecha
    em bac(k) na altura z (pia de coluna, de console)."""
    def ee(d, z):
        return anel(radial(ext(d), S, c=c), z)

    def bb(k, z):
        return anel(radial(bac(k), S, c=c), z)
    z0 = z_top - laje
    if bojo:
        kb, zb = bojo
        aneis = [bb(kb * 0.8, zb), bb(kb, zb + 0.01), bb(kb * 1.25, zb + (z0 - zb) * 0.6), ee(0.02, z0), ee(0.0, z0 + 0.03)]
    else:
        aneis = [ee(0.008, z0), ee(0.0, z0 + 0.01)]
    aneis += [ee(0.0, z_top - 0.016), ee(0.01, z_top - 0.002), ee(0.022, z_top), bb(1.06, z_top - 0.001),
              bb(1.0, z_top - 0.012), bb(0.97, z_top - prof * 0.5), bb(0.86, z_top - prof * 0.86), bb(0.62, z_top - prof),
              bb(0.25, z_top - prof - 0.002)]
    ob = loft(aneis, cor, nome="louca")
    if cor_dentro:
        mb.pinta_onde(ob, cor_dentro, lambda p, n: p.z < z_top - 0.011 and p.z > z_top - prof - 0.01 and
                      (n.z > 0.3 or n.x * (p.x - c[0]) + n.y * (p.y - c[1]) < 0) and
                      (p.z > z0 + 0.012 or bojo is None))
    out = [ob]
    if ralo:
        out.append(mb.cilindro(0.022, 0.004, x=c[0], y=c[1], z=z_top - prof - 0.004, cor=ralo, seg=16, bisel=0.001))
    return out


def forma_pia(l, p, d, reto=0.32, rc=0.05, n=24):
    """Contorno de pia de parede: fundo reto (y = +p/2) e frente em meia elipse."""
    yb = p / 2 - p * reto
    pts = [(x, y, 0) for x, y in [(math.cos(t) * (l / 2 - d), yb + math.sin(t) * (yb + p / 2 - d))
                                  for t in [PI + PI * k / n for k in range(n + 1)]]]
    pts += [(l / 2 - d, p / 2 - d, rc), (-l / 2 + d, p / 2 - d, rc)]
    return contorno(pts, 4)


def portas_duplas(it, L, P, z0, alt, cor, cor2=None, estilo="moldura", pux="alca", cor_pux="ouro", margem=0.035,
                  zp=None, y_frente=None, folga=0.003):
    """Duas portas cobrindo o vão interno de uma carcaça centrada em x = 0."""
    yf = -P / 2 if y_frente is None else y_frente
    w = (L - 2 * E) / 2 - folga
    for lado, sx in (("esq", -1), ("dir", 1)):
        xc = sx * (folga / 2 + w / 2)
        f = mb.frente(w, alt, estilo=estilo, cor=cor, cor2=cor2 or cor, margem=margem)
        mb.transforma(f, loc=(xc, yf, z0))
        partes = [f]
        if pux:
            partes.append(mb.puxador(pux, x=xc - sx * (w / 2 - 0.04), y=yf - 0.022, z=zp if zp else z0 + alt * 0.7,
                                     cor=cor_pux, tam=0.9))
        it.porta(partes, dobradica=(sx * (L / 2 - E), yf - 0.011, z0), lado=lado)


def porta_simples(it, L, P, z0, alt, cor, cor2=None, estilo="moldura", pux="bola", cor_pux="ouro", lado="esq",
                  margem=0.035, y_frente=None, zp=None, nome=None):
    yf = -P / 2 if y_frente is None else y_frente
    w = L - 2 * E - 0.004
    f = mb.frente(w, alt, estilo=estilo, cor=cor, cor2=cor2 or cor, margem=margem)
    mb.transforma(f, loc=(0, yf, z0))
    sx = -1 if lado == "esq" else 1
    partes = [f]
    if pux:
        partes.append(mb.puxador(pux, x=-sx * (w / 2 - 0.045), y=yf - 0.022, z=zp if zp else z0 + alt * 0.5,
                                 cor=cor_pux, tam=0.9))
    return it.porta(partes, dobradica=(sx * (L / 2 - E), yf - 0.011, z0), lado=lado, nome=nome)


def gaveta_simples(it, L, P, z0, alt, cor, cor_caixa="creme", estilo="lisa", pux="alca", cor_pux="ouro", y_frente=None,
                   margem=0.02, larg=None):
    yf = -P / 2 if y_frente is None else y_frente
    w = (larg or (L - 2 * E)) - 0.004
    f = mb.frente(w, alt, estilo=estilo, cor=cor, cor2=cor, margem=margem)
    mb.transforma(f, loc=(0, yf, z0))
    pz = mb.puxador(pux, x=0, y=yf - 0.022, z=z0 + alt / 2, cor=cor_pux, tam=0.8, vertical=False)
    return it.gaveta(w - 0.02, P - 0.05, alt - 0.03, [f, pz], y_frente=yf, z=z0 + 0.012, cor=cor_caixa)


def gabinete_arredondado(it, cor="verde", pux="amarelo", pe="verde_escuro"):
    L, P, H, Zp = 0.60, 0.44, 0.60, 0.08
    it.add(mb.carcaca(L, P, H, z=Zp, cor=cor, prateleiras=[0.28]))
    it.add(mb.quatro_pes("bloco", L - 0.02, P - 0.02, Zp + 0.01, pe, r=0.025, recuo=0.03))
    c = (0.0, -0.045)
    it.add(louca(lambda d: sup(0.33 - d, 0.255 - d, 3.0, 96, dy=-0.01), lambda k: sup(0.22 * k, 0.15 * k, 2.3, 64,
                                                                                         dy=c[1]),
                 0.85, 0.11, laje=0.175, c=c, cor_dentro="porcelana_azul"))
    it.add(torneira_mono(0, 0.17, 0.85, "cromo", alt=0.16, bico=0.11))
    portas_duplas(it, L, P, Zp + E + 0.003, H - 2 * E - 0.006, cor, estilo="moldura", pux="alca", cor_pux=pux,
                  zp=Zp + H - 0.12)
    it.slot("baixo", (0, 0.01, Zp + E), (L - 2 * E, P - 0.05, 0.25))
    it.slot("prateleira", (0, 0.01, Zp + 0.28 + 0.018), (L - 2 * E, P - 0.05, 0.25))
    return ex(tags=["pia", "gabinete", "portas"], mini=(0.5, -1, 0.85))


def gabinete_duas_portas(it, cor="turquesa", pux="laranja"):
    L, P, H, Zp = 0.70, 0.46, 0.66, 0.07
    it.add(mb.carcaca(L, P, H, z=Zp, cor=cor, prateleiras=[0.3]))
    it.add(mb.caixa(L - 0.06, P - 0.06, Zp + 0.01, y=0.01, cor="grafite", bisel=0.008))
    c = (0.0, -0.04)
    it.add(louca(lambda d: mb.ret_arredondado(0.75 - 2 * d, 0.5 - 2 * d, max(0.006, 0.05 - d), 6),
                 lambda k: sup(0.255 * k, 0.16 * k, 5, 64, dy=c[1]), 0.855, 0.115, laje=0.13, c=c, cor_dentro="porcelana_azul"))
    it.add(torneira_mono(0, 0.18, 0.855, "cromo", alt=0.17, bico=0.12))
    for sx in (-1, 1):
        it.add(mb.cilindro(0.016, 0.02, x=sx * 0.1, y=0.18, z=0.855, cor="cromo", seg=14, bisel=0.004))
    portas_duplas(it, L, P, Zp + E + 0.003, H - 2 * E - 0.006, cor, estilo="moldura", pux="barra", cor_pux=pux,
                  zp=Zp + H * 0.62, margem=0.04)
    it.slot("baixo", (0, 0.01, Zp + E), (L - 2 * E, P - 0.05, 0.27))
    it.slot("prateleira", (0, 0.01, Zp + 0.3 + 0.018), (L - 2 * E, P - 0.05, 0.3))
    return ex(tags=["pia", "gabinete", "portas"], mini=(0.5, -1, 0.85))


def pia_console(it, cor="louca", pes="louca", metal="ouro"):
    c = (0.0, -0.04)
    it.add(louca(lambda d: forma_pia(0.62, 0.48, d, reto=0.3), lambda k: sup(0.205 * k, 0.15 * k, 2.4, 64, dy=c[1]),
                 0.85, 0.12, cor=cor, laje=0.15, c=c, cor_dentro="porcelana_azul"))
    it.add(mb.caixa(0.56, 0.035, 0.1, y=0.22, z=0.7, cor=cor, bisel=0.012))
    for sx in (-1, 1):
        a = 0.71
        perfil = [(0, 0), (0.03, 0), (0.033, 0.03), (0.024, 0.05), (0.021, 0.2), (0.03, 0.3), (0.022, 0.36),
                  (0.026, 0.46), (0.04, 0.55), (0.024, 0.62), (0.028, 0.68), (0.04, a), (0, a)]
        it.add(mb.torno(perfil, x=sx * 0.22, y=-0.13, cor=pes, seg=18))
    it.add(mb.tubo([(-0.22, -0.13, 0.42), (0.22, -0.13, 0.42)], 0.011, cor=metal, seg=10))
    it.add(torneira_bica_alta(0, 0.18, 0.85, metal, alt=0.13, bico=0.085))
    for sx in (-1, 1):
        it.add(cruzeta(sx * 0.1, 0.18, 0.85, metal, alt=0.035))
    it.colisao([((0, 0, 0.7), (0.62, 0.48, 0.3)), ((-0.22, -0.13, 0), (0.08, 0.08, 0.7)),
                ((0.22, -0.13, 0), (0.08, 0.08, 0.7))])
    return ex(tags=["pia", "console", "classica"], mini=(0.5, -1, 0.85))


def pia_bancada(it, cor="madeira_media", cor2="madeira_escura"):
    L, P = 0.80, 0.48
    it.add(mb.caixa(L, P, 0.04, z=0.70, cor=cor, bisel=0.012))
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.add(mb.caixa(0.045, 0.045, 0.702, x=sx * (L / 2 - 0.04), y=sy * (P / 2 - 0.04), cor=cor, bisel=0.01))
    it.add(mb.caixa(L - 0.1, P - 0.1, 0.025, z=0.15, cor=cor, bisel=0.008))
    it.add(mb.carcaca(L - 0.12, P - 0.08, 0.13, z=0.571, cor=cor, topo=False, fundo=True))
    gaveta_simples(it, L - 0.12, P - 0.08, 0.576, 0.115, cor2, cor_caixa="madeira_clara", pux="bola", cor_pux="latao")
    c = (0.0, -0.03)
    it.add(louca(lambda d: sup(0.26 - d, 0.19 - d, 4.0, 96, dy=c[1]), lambda k: sup(0.225 * k, 0.155 * k, 4.0, 64,
                                                                                    dy=c[1]),
                 0.855, 0.1, laje=0.115, c=c, cor_dentro="porcelana_azul"))
    it.add(torneira_mono(0, 0.19, 0.74, "cromo", alt=0.3, bico=0.15))
    it.slot("prateleira_baixo", (0, 0, 0.175), (L - 0.12, P - 0.12, 0.38))
    return ex(tags=["pia", "bancada", "madeira", "gaveta"], mini=(0.5, -1, 0.85))


def pia_coluna(it, cor="rosa_claro", metal="ouro"):
    it.add(mb.torno([(0, 0), (0.12, 0), (0.122, 0.025), (0.1, 0.04), (0.095, 0.07), (0.075, 0.1), (0.065, 0.3),
                     (0.065, 0.55), (0.08, 0.64), (0, 0.66)], y=0.04, cor=cor, seg=28, esc=(1, 0.8)))
    c = (0.0, -0.03)
    it.add(louca(lambda d: forma_pia(0.56, 0.46, d), lambda k: sup(0.19 * k, 0.15 * k, 2.2, 64, dy=c[1]), 0.86, 0.13,
                 cor=cor, laje=0.18, bojo=(1.15, 0.64), c=c, cor_dentro="porcelana_azul"))
    it.add(torneira_bica_alta(0, 0.165, 0.86, metal, alt=0.14, bico=0.09))
    it.add(mb.tubo([(0, 0.18, 0.95), (0.02, 0.22, 0.97), (0.06, 0.25, 0.98)], 0.007, cor=metal, raio_curva=0.02))
    return ex(tags=["pia", "coluna"], mini=(0.5, -1, 0.85))


def pia_pacote(it):
    pc = mb.importa_pacote("Wash_Basin_07")
    ps = [recolore(o, {"vermelho_escuro": "rosa_claro", "cinza": "cromo", "amarelo_claro": "ouro",
                       "laranja_claro": "ouro_escuro"}) for o in pc.values()]
    lo, hi = mb.bbox(ps)
    move(ps, (-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z))
    it.add(ps)
    return ex(tags=["pia", "coluna"], pacote=True)


def mesinha_cuba(it, cor="laranja", pernas="cinza", torneira="azul"):
    it.add(mb.extrudado(sup(0.29, 0.22, 3.0, 48), 0.05, z=0.66, cor=cor, bisel=0.016))
    it.add(mb.carcaca(0.44, 0.32, 0.12, z=0.541, cor=cor, topo=False))
    gaveta_simples(it, 0.44, 0.32, 0.546, 0.105, cor, cor_caixa="creme", pux="bola", cor_pux="branco")
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.add(mb.cilindro(0.016, 0.662, x=sx * 0.2, y=sy * 0.14, cor=pernas, r2=0.019, seg=14, bisel=0.004))
    cuba = mb.torno(perfil_casca([(0.07, 0.0), (0.12, 0.012), (0.15, 0.06), (0.158, 0.13)], 0.012, 0.014), y=-0.02,
                    z=0.71, cor="louca", seg=36)
    it.add(pinta_dentro(cuba, "porcelana_azul", 0.835, c=(0, -0.02)))
    it.add(mb.cilindro(0.02, 0.004, y=-0.02, z=0.722, cor="cromo", seg=14, bisel=0.001))
    it.add(torneira_bica_alta(0, 0.165, 0.71, torneira, alt=0.3, bico=0.17))
    it.colisao([((0, 0, 0.54), (0.58, 0.44, 0.47)), ((0, 0, 0), (0.44, 0.32, 0.54))])
    return ex(tags=["pia", "mesinha", "cuba", "gaveta"], mini=(0.5, -1, 0.85))


# ---- armários
def armario_alto_portas(it, corpo="branco", porta="amarelo", pe="madeira_mel"):
    L, P, H, Zp = 0.42, 0.32, 1.5, 0.07
    it.add(mb.carcaca(L, P, H, z=Zp, cor=corpo, prateleiras=[0.36, 0.74, 1.1]))
    it.add(mb.caixa(L + 0.02, P + 0.02, 0.03, z=Zp + H, cor=corpo, bisel=0.012))
    it.add(mb.quatro_pes("bola", L - 0.02, P - 0.02, Zp + 0.005, pe, r=0.025, recuo=0.035))
    zm = Zp + 0.74 + 0.016
    porta_simples(it, L, P, Zp + E + 0.003, zm - Zp - E - 0.006, porta, estilo="moldura", pux="botao", cor_pux=pe,
                  margem=0.03, zp=Zp + 0.6)
    porta_simples(it, L, P, zm + 0.003, Zp + H - E - zm - 0.006, porta, estilo="moldura", pux="botao", cor_pux=pe,
                  margem=0.03, zp=zm + 0.12)
    for k, (z0, z1) in enumerate(((0, 0.36), (0.36, 0.74), (0.74, 1.1), (1.1, H - E))):
        it.slot(f"prateleira_{k + 1}", (0, 0.01, Zp + z0 + (E if k == 0 else 0.018)), (L - 2 * E, P - 0.05, z1 - z0 - 0.03))
    return ex(tags=["armario", "alto", "portas"])


def estante_cestos(it, cor="laranja", cesto="madeira_rosada"):
    L, P, H = 0.42, 0.34, 1.26
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.add(mb.caixa(0.034, 0.034, H, x=sx * (L / 2 - 0.017), y=sy * (P / 2 - 0.017), cor=cor, bisel=0.01))
            it.add(mb.esfera(0.024, x=sx * (L / 2 - 0.017), y=sy * (P / 2 - 0.017), z=H + 0.012, cor=cor, seg=14))
    for z in (0.06, 0.41, 0.72, 1.0, 1.22):
        it.add(mb.caixa(L - 0.03, P - 0.03, 0.022, z=z, cor=cor, bisel=0.007))
    for sx in (-1, 1):
        it.add(mb.caixa(0.012, P - 0.04, 0.33, x=sx * (L / 2 - 0.022), z=0.075, cor=cor, bisel=0.004))
    it.add(mb.caixa(L - 0.04, 0.012, 0.33, y=P / 2 - 0.022, z=0.075, cor=cor, bisel=0.004))
    for k in range(2):
        z0 = 0.085 + k * 0.163
        w = L - 0.06
        f = mb.frente(w, 0.15, estilo="moldura", cor=cesto, cor2=cesto, margem=0.022)
        mb.transforma(f, loc=(0, -P / 2 + 0.012, z0))
        pz = mb.puxador("concha", x=0, y=-P / 2 - 0.01, z=z0 + 0.1, cor="creme")
        it.gaveta(w - 0.03, P - 0.07, 0.13, [f, pz], y_frente=-P / 2 + 0.012, z=z0 + 0.008, cor=cesto)
    for k, (z0, z1) in enumerate(((0.41, 0.72), (0.72, 1.0), (1.0, 1.22), (1.22, 1.5))):
        it.slot(f"prateleira_{k + 1}", (0, 0, z0 + 0.022), (L - 0.07, P - 0.07, z1 - z0 - 0.03))
    it.colisao([((0, 0, 0), (L, P, H + 0.04))])
    return ex(tags=["armario", "estante", "gavetas", "cestos"])


def armario_coluna_nicho(it, cor="verde_agua", cor2="menta", pux="branco"):
    L, P, H, Zp = 0.40, 0.34, 1.42, 0.06
    it.add(mb.carcaca(L, P, H, z=Zp, cor=cor, prateleiras=[0.62, 0.95, 1.18]))
    it.add(mb.caixa(L - 0.04, P - 0.05, Zp + 0.01, y=0.01, cor=cor2, bisel=0.008))
    it.add(mb.caixa(L + 0.04, P + 0.03, 0.035, z=Zp + H, y=-0.005, cor=cor, bisel=0.012))
    it.add(mb.caixa(L + 0.06, P + 0.04, 0.03, z=Zp + H + 0.03, y=-0.01, cor=cor2, bisel=0.012))
    it.add(mb.caixa(L + 0.02, P + 0.02, 0.03, z=0.0, cor=cor2, bisel=0.01))
    porta_simples(it, L, P, Zp + E + 0.003, 0.62 - E - 0.004, cor2, estilo="ripas", pux="bola", cor_pux=pux, lado="esq",
                  zp=Zp + 0.45)
    it.slot("baixo", (0, 0.01, Zp + E), (L - 2 * E, P - 0.05, 0.58))
    for k, (z0, z1) in enumerate(((0.62, 0.95), (0.95, 1.18), (1.18, H - E))):
        it.slot(f"nicho_{k + 1}", (0, 0.01, Zp + z0 + 0.018), (L - 2 * E, P - 0.05, z1 - z0 - 0.03))
    return ex(tags=["armario", "coluna", "nicho"])


def armario_alto_duas_portas(it, cor="turquesa_escuro", pux="marrom_claro"):
    L, P, H, Zp = 0.45, 0.36, 1.52, 0.07
    it.add(mb.carcaca(L, P, H, z=Zp, cor=cor, prateleiras=[0.55, 0.9, 1.22]))
    it.add(mb.superelipsoide(L + 0.03, P + 0.03, 0.07, z=Zp + H - 0.025, cor=cor, e=0.2, e_v=0.35))
    it.add(mb.quatro_pes("conico", L - 0.02, P - 0.02, Zp + 0.005, "grafite", r=0.022, recuo=0.035))
    zm = Zp + 0.55 + 0.016
    porta_simples(it, L, P, Zp + E + 0.003, zm - Zp - E - 0.006, cor, estilo="lisa", pux="barra", cor_pux=pux,
                  zp=zm - 0.15)
    porta_simples(it, L, P, zm + 0.003, Zp + H - E - zm - 0.006, cor, estilo="lisa", pux="barra", cor_pux=pux,
                  zp=zm + 0.18)
    for k, (z0, z1) in enumerate(((0, 0.55), (0.55, 0.9), (0.9, 1.22), (1.22, H - E))):
        it.slot(f"prateleira_{k + 1}", (0, 0.01, Zp + z0 + (E if k == 0 else 0.018)), (L - 2 * E, P - 0.05, z1 - z0 - 0.03))
    return ex(tags=["armario", "alto", "portas"])


def armario_coluna_gaveta(it, cor="verde_lima", cor2="verde", pux="branco"):
    L, P, H, Zp = 0.38, 0.32, 1.32, 0.08
    it.add(mb.carcaca(L, P, H, z=Zp, cor=cor, prateleiras=[0.56, 0.75, 1.03]))
    it.add(mb.caixa(L + 0.025, P + 0.02, 0.03, z=Zp + H, cor=cor2, bisel=0.012))
    it.add(mb.quatro_pes("bloco", L - 0.02, P - 0.02, Zp + 0.005, cor2, r=0.022, recuo=0.03))
    porta_simples(it, L, P, Zp + E + 0.003, 0.56 - E - 0.004, cor, cor2=cor2, estilo="moldura", pux="bola", cor_pux=pux,
                  zp=Zp + 0.42)
    gaveta_simples(it, L, P, Zp + 0.56 + 0.019, 0.75 - 0.56 - 0.022, cor, cor_caixa="creme", estilo="moldura",
                   pux="alca", cor_pux=pux)
    it.slot("baixo", (0, 0.01, Zp + E), (L - 2 * E, P - 0.05, 0.52))
    for k, (z0, z1) in enumerate(((0.75, 1.03), (1.03, H - E))):
        it.slot(f"nicho_{k + 1}", (0, 0.01, Zp + z0 + 0.018), (L - 2 * E, P - 0.05, z1 - z0 - 0.03))
    return ex(tags=["armario", "coluna", "gaveta"])


reg("gabinete_pia_arredondado_verde", "B", "gabinete_arredondado", gabinete_arredondado,
    "Gabinete com pia arredondada (verde)")
reg("gabinete_pia_arredondado_amarelo", "B", "gabinete_arredondado", gabinete_arredondado,
    "Gabinete com pia arredondada (amarelo)", cor="amarelo", pux="laranja", pe="mostarda")
reg("gabinete_pia_duas_portas_turquesa", "B", "gabinete_duas_portas", gabinete_duas_portas,
    "Gabinete de pia com duas portas (turquesa)")
reg("gabinete_pia_duas_portas_rosa", "B", "gabinete_duas_portas", gabinete_duas_portas,
    "Gabinete de pia com duas portas (rosa)", cor="rosa_bebe", pux="ouro")
reg("pia_console_branca", "B", "pia_console", pia_console, "Pia console com pés torneados (branca)")
reg("pia_console_azul", "B", "pia_console", pia_console, "Pia console com pés torneados (azul)",
    cor="porcelana_azul", pes="porcelana_azul", metal="cromo")
reg("pia_bancada_madeira", "B", "pia_bancada", pia_bancada, "Pia sobre bancada de madeira")
reg("pia_bancada_nogueira", "B", "pia_bancada", pia_bancada, "Pia sobre bancada de madeira (nogueira)",
    cor="nogueira", cor2="madeira_escura")
reg("pia_coluna_rosa", "B", "pia_coluna", pia_coluna, "Pia de coluna (rosa)")
reg("pia_coluna_rosa_pacote", "B", "pia_pacote", pia_pacote, "Pia de coluna rosa com torneira dourada")
reg("mesinha_cuba_laranja", "B", "mesinha_cuba", mesinha_cuba, "Mesinha com cuba (laranja)")
reg("mesinha_cuba_verde_agua", "B", "mesinha_cuba", mesinha_cuba, "Mesinha com cuba (verde-água)", cor="verde_agua",
    torneira="cromo")
reg("armario_alto_portas_amarelo", "B", "armario_alto_portas", armario_alto_portas,
    "Armário alto com portas (branco e amarelo)")
reg("armario_alto_portas_rosa", "B", "armario_alto_portas", armario_alto_portas,
    "Armário alto com portas (branco e rosa)", porta="rosa_bebe", pe="madeira_clara")
reg("estante_cestos_laranja", "B", "estante_cestos", estante_cestos, "Estante com cestos (laranja)")
reg("estante_cestos_madeira", "B", "estante_cestos", estante_cestos, "Estante com cestos (madeira)",
    cor="madeira_clara", cesto="verde_agua")
reg("armario_coluna_nicho_verde_agua", "B", "armario_coluna_nicho", armario_coluna_nicho,
    "Armário coluna com nicho (verde-água)")
reg("armario_coluna_nicho_lilas", "B", "armario_coluna_nicho", armario_coluna_nicho,
    "Armário coluna com nicho (lilás)", cor="lilas", cor2="lilas_claro")
reg("armario_alto_duas_portas_petroleo", "B", "armario_alto_duas_portas", armario_alto_duas_portas,
    "Armário alto de duas portas (petróleo)")
reg("armario_alto_duas_portas_azul", "B", "armario_alto_duas_portas", armario_alto_duas_portas,
    "Armário alto de duas portas (azul)", cor="azul_celeste", pux="branco")
reg("armario_coluna_gaveta_verde", "B", "armario_coluna_gaveta", armario_coluna_gaveta,
    "Armário coluna com gaveta (verde)")

# =====================================================================================================================
# C · Vasos, máquinas de lavar, cestos e tapetes
# =====================================================================================================================
def bacia_vaso(cy, cor, pedestal=True, n=2.2, a=0.18, b=0.235, zr=0.38, S=64, dyp=0.07, cor_dentro="porcelana_azul"):
    """Bacia de vaso côncava (borda, louça por dentro descendo até o sifão). pedestal=False: vaso suspenso."""
    def o(ka, kb, z, dy=0.0):
        return anel(ovo(ka, kb, n, S, dy=cy + dy), z)
    if pedestal:
        aneis = [o(0.115, 0.16, 0.0, dyp), o(0.12, 0.165, 0.012, dyp), o(0.112, 0.155, 0.04, dyp),
                 o(0.1, 0.145, 0.12, dyp * 0.8), o(0.115, 0.165, zr - 0.2, dyp * 0.5), o(0.15, 0.205, zr - 0.12, dyp * 0.2)]
    else:
        aneis = [o(0.06, 0.08, zr - 0.21, 0.07), o(0.11, 0.15, zr - 0.19, 0.05), o(0.15, 0.2, zr - 0.13, 0.02)]
    aneis += [o(a * 0.97, b * 0.97, zr - 0.045), o(a, b, zr - 0.012), o(a * 0.985, b * 0.985, zr), o(a * 0.9, b * 0.92, zr + 0.004),
              o(a * 0.76, b * 0.8, zr), o(a * 0.72, b * 0.76, zr - 0.03), o(a * 0.55, b * 0.6, zr - 0.12, 0.02),
              o(a * 0.3, b * 0.3, zr - 0.19, 0.045)]
    ob = loft(aneis, cor, nome="bacia")
    if cor_dentro:
        pinta_dentro(ob, cor_dentro, zr + 0.001, c=(0, cy + 0.02))
    return ob


def assento_tampa(it, cy, cor, n=2.2, a=0.18, b=0.235, zr=0.38, S=48, abre_tampa=92):
    def o(ka, kb, z):
        return anel(ovo(ka, kb, n, S, dy=cy), z)
    z0 = zr + 0.006
    ass = loft([o(a * 0.98, b * 0.98, z0), o(a, b, z0 + 0.008), o(a * 0.97, b * 0.97, z0 + 0.02),
                o(a * 0.72, b * 0.76, z0 + 0.02), o(a * 0.69, b * 0.73, z0 + 0.008), o(a * 0.71, b * 0.75, z0)],
               cor, ciclico=True, nome="assento")
    z1 = z0 + 0.022
    tam = loft([o(a * 0.97, b * 0.97, z1), o(a, b, z1 + 0.008), o(a * 0.95, b * 0.95, z1 + 0.024),
                o(a * 0.6, b * 0.62, z1 + 0.032)], cor, nome="tampa")
    yh = cy + b * 0.93
    it.add(mb.cilindro(0.016, 0.03, x=-0.07, y=yh, z=z0 + 0.01, cor="cromo", eixo="x", seg=12),
           mb.cilindro(0.016, 0.03, x=0.07, y=yh, z=z0 + 0.01, cor="cromo", eixo="x", seg=12))
    it.porta([ass], dobradica=(0, yh, z0 + 0.01), eixo="x", lado="cima", abre_graus=90, nome="assento")
    it.porta([tam], dobradica=(0, yh, z1 + 0.012), eixo="x", lado="cima", abre_graus=abre_tampa, nome="tampa")


def vaso_redondo(it, cor="louca"):
    cy, zr = -0.08, 0.38
    it.add(bacia_vaso(cy, cor))
    it.add(mb.superelipsoide(0.22, 0.16, 0.21, y=0.17, z=zr - 0.22, cor=cor, e=0.4, e_v=0.4))
    it.add(mb.superelipsoide(0.38, 0.17, 0.37, y=0.275, z=zr - 0.01, cor=cor, e=0.32, e_v=0.3))
    it.add(mb.superelipsoide(0.4, 0.19, 0.05, y=0.275, z=zr + 0.34, cor=cor, e=0.25, e_v=0.45))
    it.add(mb.cilindro(0.024, 0.014, y=0.275, z=zr + 0.38, cor="cromo", seg=18, bisel=0.004))
    assento_tampa(it, cy, cor)
    return ex(tags=["vaso", "sanitario", "tampa"])


def vaso_quadrado(it, cor="louca"):
    cy, zr, n = -0.08, 0.38, 3.0
    it.add(bacia_vaso(cy, cor, n=n))
    it.add(mb.caixa(0.22, 0.16, 0.21, y=0.17, z=zr - 0.22, cor=cor, bisel=0.04))
    it.add(mb.caixa(0.38, 0.17, 0.36, y=0.275, z=zr - 0.01, cor=cor, bisel=0.035))
    it.add(mb.caixa(0.4, 0.19, 0.04, y=0.275, z=zr + 0.345, cor=cor, bisel=0.016))
    it.add(mb.caixa(0.07, 0.035, 0.008, y=0.275, z=zr + 0.383, cor="cromo", bisel=0.003))
    assento_tampa(it, cy, cor, n=n)
    return ex(tags=["vaso", "sanitario", "tampa"])


def vaso_suspenso(it, cor="louca", placa="cromo"):
    cy, zr = -0.31, 0.21
    it.add(bacia_vaso(cy, cor, pedestal=False))
    it.add(mb.superelipsoide(0.3, 0.2, 0.18, y=-0.1, z=zr - 0.185, cor=cor, e=0.3, e_v=0.35))
    it.add(mb.caixa(0.22, 0.012, 0.15, y=-0.006, z=0.62, cor=placa, bisel=0.004))
    for sx in (-1, 1):
        it.add(mb.caixa(0.085, 0.01, 0.1, x=sx * 0.048, y=-0.014, z=0.645, cor="branco" if placa != "branco" else "cinza_claro",
                        bisel=0.004))
    assento_tampa(it, cy, cor)
    return ex("parede", ["vaso", "sanitario", "suspenso", "tampa"], alt=0.16)


def vaso_retro(it, cor="verde_medio", madeira="marrom", metal="latao"):
    cy, zr, n = -0.08, 0.38, 2.0
    it.add(bacia_vaso(cy, cor, n=n, a=0.185, b=0.23))
    it.add(mb.superelipsoide(0.2, 0.14, 0.18, y=0.15, z=zr - 0.2, cor=cor, e=0.45, e_v=0.45))
    assento_tampa(it, cy, madeira, n=n, a=0.185, b=0.23, abre_tampa=100)
    # caixa alta na parede, cano e corrente
    it.add(mb.caixa(0.42, 0.17, 0.24, y=0.265, z=1.72, cor=cor, bisel=0.035))
    it.add(mb.caixa(0.45, 0.19, 0.03, y=0.26, z=1.955, cor=cor, bisel=0.012))
    for sx in (-1, 1):
        it.add(mb.extrudado(_ccw([(0.35, 1.72), (0.22, 1.72), (0.35, 1.6)]), 0.03, x=sx * 0.16 - 0.015, plano="yz",
                            cor=madeira, bisel=0.006))
    it.add(mb.tubo([(0.0, 0.25, 1.73), (0.0, 0.25, 0.6), (0.0, 0.18, 0.4)], 0.018, cor=metal, raio_curva=0.12))
    it.add(mb.cilindro(0.03, 0.03, y=0.25, z=1.7, cor=metal, seg=16, bisel=0.006))
    it.add(mb.tubo([(0.2, 0.22, 1.86), (0.29, 0.2, 1.86)], 0.007, cor=metal, seg=8))
    it.add(mb.tubo([(0.29, 0.2, 1.86), (0.29, 0.2, 1.31)], 0.003, cor=metal, seg=6))
    for k in range(9):
        it.add(mb.esfera(0.0065, x=0.29, y=0.2, z=1.83 - k * 0.06, cor=metal, seg=8))
    it.add(mb.torno([(0, 0), (0.012, 0.0), (0.02, 0.03), (0.016, 0.07), (0.006, 0.09), (0, 0.095)], x=0.29, y=0.2, z=1.22,
                    cor=madeira, seg=14))
    it.colisao([((0, -0.03, 0), (0.4, 0.62, 0.44)), ((0, 0.265, 1.6), (0.46, 0.19, 0.4))])
    return ex(tags=["vaso", "sanitario", "retro", "corrente", "tampa"])


def vaso_pacote(it):
    pc = mb.importa_pacote("Toilet_03")
    ps = list(pc.values())
    lo, hi = mb.bbox(ps)
    move(ps, (-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z))
    tampa = pc.pop("Cover", None)
    it.add(list(pc.values()))
    if tampa:
        tl, th = mb.bbox(tampa)
        it.porta([tampa], dobradica=(0, th.y - 0.01, th.z - 0.01), eixo="x", lado="cima", abre_graus=95, nome="tampa")
    return ex(tags=["vaso", "sanitario", "tampa"], pacote=True)


def maquina(it, corpo="branco", aro="grafite", tampo=None, base=None, puxa="cinza", vidro_cor=None, retro=False,
            painel="tela"):
    L, P = 0.60, 0.58
    zc = 0.40
    if retro:
        body = mb.caixa(L, P, 0.72, z=0.06, cor=corpo, bisel=0.035)
        it.add(mb.caixa(L + 0.012, P + 0.012, 0.075, z=0.0, cor=base, bisel=0.025))
        it.add(mb.caixa(L + 0.014, P + 0.014, 0.06, z=0.77, cor=tampo, bisel=0.025))
        it.add(mb.caixa(L, 0.13, 0.11, y=P / 2 - 0.07, z=0.82, cor=tampo, bisel=0.03))
        it.add(mb.caixa(0.16, 0.012, 0.045, x=0.1, y=P / 2 - 0.137, z=0.85, cor="amarelo", bisel=0.004))
        it.add(mb.cilindro(0.032, 0.03, x=-0.16, y=P / 2 - 0.145, z=0.875, cor="branco", eixo="y", seg=20, bisel=0.008))
        zg = None
    else:
        body = mb.caixa(L, P, 0.85, cor=corpo, bisel=0.035)
        it.add(mb.caixa(L - 0.05, 0.006, 0.006, y=-P / 2 + 0.002, z=0.68, cor=aro, bisel=0.002))
        it.add(mb.caixa(0.16, 0.01, 0.05, x=0.06, y=-P / 2 - 0.002, z=0.735, cor=painel, bisel=0.004))
        it.add(mb.cilindro(0.035, 0.03, x=0.21, y=-P / 2 - 0.012, z=0.76, cor=puxa, eixo="y", seg=22, bisel=0.008))
        it.add(mb.cilindro(0.008, 0.008, x=0.21, y=-P / 2 - 0.03, z=0.785, cor=aro, eixo="y", seg=8, bisel=0.002))
        zg = 0.715
        fura(body, mb.caixa(0.17, 0.3, 0.075, x=-0.17, y=-P / 2 + 0.13, z=zg - 0.005, cor="cinza_claro", bisel=0.0))
    fura(body, mb.cilindro(0.19, 0.42, y=-P / 2 + 0.2, z=zc, eixo="y", cor="cromo", seg=40, bisel=0.0))
    it.add(body)
    circ = [(0.196 * math.cos(2 * PI * k / 40), 0.196 * math.sin(2 * PI * k / 40) + zc) for k in range(40)]
    it.add(tubo_xz(circ, -P / 2 + 0.002, 0.013, "cinza_medio", fechado=True, raio_curva=0.001, seg=8))
    if zg:
        f = mb.frente(0.165, 0.07, esp=0.014, estilo="lisa", cor=corpo, bisel=0.005)
        mb.transforma(f, loc=(-0.17, -P / 2 + 0.001, zg - 0.003))
        pz = mb.caixa(0.06, 0.012, 0.012, x=-0.17, y=-P / 2 - 0.016, z=zg + 0.005, cor=aro, bisel=0.004)
        it.gaveta(0.15, 0.26, 0.055, [f, pz], x=-0.17, y_frente=-P / 2 + 0.001, z=zg, cor="cinza_claro", slot=False)
    # porta redonda de vidro (abre de lado, dobradiça à esquerda)
    y0 = -P / 2 - 0.004

    def cc(r, y):
        return [(r * math.cos(2 * PI * k / 40), y, zc + r * math.sin(2 * PI * k / 40)) for k in range(40)]
    aro_ob = loft([cc(0.235, y0), cc(0.243, y0 - 0.016), cc(0.232, y0 - 0.042), cc(0.18, y0 - 0.046),
                   cc(0.168, y0 - 0.03), cc(0.165, y0 - 0.006)], aro, ciclico=True, nome="aro", angulo=55)
    vid = mb.esfera(0.172, y=y0 - 0.028, z=zc, cor=vidro_cor, mat="vidro" if not vidro_cor else "atlas",
                    esc=(1, 0.16, 1), seg=32)
    pux = mb.caixa(0.035, 0.03, 0.09, x=0.235, y=y0 - 0.03, z=zc - 0.045, cor=puxa, bisel=0.012)
    it.add(mb.caixa(0.03, 0.02, 0.07, x=-0.245, y=y0 - 0.006, z=zc - 0.035, cor=aro, bisel=0.008))
    it.porta([aro_ob, vid, pux], dobradica=(-0.24, y0 - 0.02, zc), lado="esq", nome="porta_maquina")
    it.slot("tambor", (0, -P / 2 + 0.22, zc - 0.17), (0.26, 0.32, 0.3))
    return ex(tags=["maquina_de_lavar", "eletro", "porta"])


def cesto(it, cor="verde_agua", cor2="azul_celeste"):
    S = 48
    H = 0.52

    def r(a, b, z):
        return anel(sup(a, b, 4.0, S), z)
    aneis = [r(0.17, 0.14, 0.0), r(0.18, 0.15, 0.012), r(0.2, 0.165, H - 0.02), r(0.2, 0.165, H), r(0.19, 0.155, H + 0.004),
             r(0.182, 0.147, H - 0.01), r(0.165, 0.132, 0.04), r(0.12, 0.09, 0.03)]
    corpo = loft(aneis, cor, nome="cesto")
    pinta_dentro(corpo, cor2, H - 0.012)
    it.add(corpo)
    tam = loft([r(0.2, 0.165, H + 0.006), r(0.207, 0.172, H + 0.016), r(0.2, 0.165, H + 0.038), r(0.15, 0.12, H + 0.045)],
               cor, nome="tampa")
    jan = mb.extrudado(mb.ret_arredondado(0.2, 0.13, 0.03), 0.006, y=-0.01, z=H + 0.041, cor=cor2, bisel=0.002)
    it.porta([tam, jan], dobradica=(0, 0.16, H + 0.02), eixo="x", lado="cima", nome="tampa")
    it.slot("dentro", (0, 0, 0.04), (0.3, 0.24, 0.45))
    return ex(tags=["cesto", "roupa", "tampa"], mini=(0.5, -1, 0.85))


def tapete_listras(it, c1="amarelo", c2="verde_claro"):
    for k in range(8):
        it.add(mb.caixa(0.068, 0.5, 0.018, x=-0.27 + k * 0.077, cor=c1 if k % 2 == 0 else c2, bisel=0.008))
    return ex(tags=["tapete"], mini=(0.4, -1, 1.1))


def tapete_redondo(it, cor="turquesa", cor2="turquesa_claro"):
    it.add(mb.cilindro(0.4, 0.016, cor=cor, seg=48, bisel=0.007))
    circ = [(0.31 * math.cos(2 * PI * k / 32), 0.31 * math.sin(2 * PI * k / 32), 0.016) for k in range(32)]
    it.add(mb.tubo(circ, 0.008, cor=cor2, raio_curva=0.001, seg=8, fechado=True))
    return ex(tags=["tapete", "redondo"], mini=(0.4, -1, 1.1))


def tapete_retangular(it, cor="lilas", cor2="roxo"):
    it.add(mb.superelipsoide(0.8, 0.52, 0.022, cor=cor, e=0.12, e_v=0.5, nu=48, nv=8))
    pts = [(x, y, 0.02) for x, y in mb.ret_arredondado(0.66, 0.38, 0.07, 6)]
    it.add(mb.tubo(pts, 0.008, cor=cor2, raio_curva=0.001, seg=8, fechado=True))
    return ex(tags=["tapete"], mini=(0.4, -1, 1.1))


def tapete_tiras(it, cor="rosa", cor2="rosa_bebe"):
    for k in range(3):
        it.add(mb.superelipsoide(0.68, 0.15, 0.032, y=(k - 1) * 0.155, cor=cor if k != 1 else cor2, e=0.25, e_v=0.6,
                                 nu=32, nv=8))
    return ex(tags=["tapete"], mini=(0.4, -1, 1.1))


reg("vaso_suspenso_branco", "C", "vaso_suspenso", vaso_suspenso, "Vaso sanitário suspenso (branco)")
reg("vaso_suspenso_grafite", "C", "vaso_suspenso", vaso_suspenso, "Vaso sanitário suspenso (grafite)",
    cor="grafite", placa="branco")
reg("vaso_caixa_redondo_branco", "C", "vaso_redondo", vaso_redondo, "Vaso com caixa acoplada redondo (branco)")
reg("vaso_caixa_quadrado_branco", "C", "vaso_quadrado", vaso_quadrado, "Vaso com caixa acoplada quadrado (branco)")
reg("vaso_retro_caixa_alta_verde", "C", "vaso_retro", vaso_retro, "Vaso retrô de caixa alta com corrente (verde)")
reg("vaso_retro_caixa_alta_azul", "C", "vaso_retro", vaso_retro, "Vaso retrô de caixa alta com corrente (azul)",
    cor="azul_medio", madeira="madeira_clara", metal="cromo")
reg("vaso_sanitario_pacote", "C", "vaso_pacote", vaso_pacote, "Vaso sanitário com caixa acoplada")
reg("maquina_lavar_retro_rosa", "C", "maquina_retro", maquina, "Máquina de lavar retrô (rosa e verde)",
    corpo="rosa_claro", aro="rosa", tampo="verde_medio", base="verde_medio", puxa="rosa_escuro", retro=True)
reg("maquina_lavar_retro_azul", "C", "maquina_retro", maquina, "Máquina de lavar retrô (azul e amarelo)",
    corpo="azul_bebe", aro="azul_celeste", tampo="amarelo", base="amarelo", puxa="azul", retro=True)
reg("maquina_lavar_branca", "C", "maquina_moderna", maquina, "Máquina de lavar (branca)", corpo="branco",
    aro="grafite", puxa="cinza_claro")
reg("maquina_lavar_grafite", "C", "maquina_moderna", maquina, "Máquina de lavar (grafite)", corpo="grafite",
    aro="cinza_claro", puxa="cinza", painel="tela_azul")
reg("maquina_lavar_pastel_amarela", "C", "maquina_pastel", maquina, "Máquina de lavar pastel (amarela)",
    corpo="amarelo_claro", aro="marrom", puxa="creme", vidro_cor="azul_celeste", painel="marrom")
reg("maquina_lavar_pastel_menta", "C", "maquina_pastel", maquina, "Máquina de lavar pastel (menta)",
    corpo="menta", aro="verde_escuro", puxa="branco", vidro_cor="azul_claro", painel="verde_escuro")
reg("cesto_roupa_tampa_verde_agua", "C", "cesto_roupa", cesto, "Cesto de roupa com tampa (verde-água)")
reg("cesto_roupa_tampa_lilas", "C", "cesto_roupa", cesto, "Cesto de roupa com tampa (lilás)", cor="lilas",
    cor2="roxo")
reg("tapete_listras_amarelo_verde", "C", "tapete_listras", tapete_listras, "Tapete de listras (amarelo e verde)")
reg("tapete_banheiro_redondo_turquesa", "C", "tapete_redondo", tapete_redondo, "Tapete redondo (turquesa)")
reg("tapete_banheiro_redondo_rosa", "C", "tapete_redondo", tapete_redondo, "Tapete redondo (rosa)", cor="rosa_bebe",
    cor2="rosa_escuro")
reg("tapete_retangular_lilas", "C", "tapete_retangular", tapete_retangular, "Tapete retangular com borda (lilás)")
reg("tapete_tiras_rosa", "C", "tapete_tiras", tapete_tiras, "Tapete de tiras (rosa)")

# =====================================================================================================================
# D · Espelhos, toalheiros, prateleiras e banquinhos (de parede: y = 0 é a parede, a peça vai para −Y)
# =====================================================================================================================
def _xz(pts, dz=0.0, dx=0.0):
    return [(x + dx, y + dz) for x, y in pts]


def espelho_redondo(it, cor="amarelo"):
    a, b = 0.3, 0.39
    pts = [(x, -0.032, z) for x, z in _xz(sup(a, b, 2, 40), b + 0.03)]
    it.add(mb.tubo(pts, 0.03, cor=cor, raio_curva=0.001, seg=12, fechado=True))
    it.add(placa_xz(_xz(sup(a - 0.005, b - 0.005, 2, 72), b + 0.03), -0.03, 0.026, mat="espelho"))
    it.add(brilhos(dentro_sup(a, b, 2, 0, b + 0.03, 0.04), 0.0, b + 0.03, -0.0315, 1.0))
    return ex("parede", ["espelho"], alt=1.0)


def espelho_oval(it, cor="marrom"):
    a, b = 0.21, 0.34
    it.add(moldura_xz(lambda d: _xz(sup(a - d, b - d, 2.0, 64), b), 0.05, 0.035, cor))
    it.add(placa_xz(_xz(sup(a - 0.04, b - 0.04, 2.0, 64), b), -0.02, 0.012, mat="espelho"))
    it.add(brilhos(dentro_sup(a - 0.05, b - 0.05, 2, 0, b, 0.0), 0.0, b, -0.0215, 0.7))
    return ex("parede", ["espelho"], alt=1.1)


def espelho_retangular(it, cor="rosa"):
    L, A = 0.8, 0.54
    it.add(moldura_xz(lambda d: _xz(mb.ret_arredondado(L - 2 * d, A - 2 * d, max(0.008, 0.08 - d), 6), A / 2), 0.06, 0.04,
                      cor))
    it.add(placa_xz(_xz(mb.ret_arredondado(L - 0.1, A - 0.1, 0.03, 4), A / 2), -0.022, 0.012, mat="espelho"))
    it.add(brilhos(dentro_sup(L / 2 - 0.06, A / 2 - 0.06, 8, 0, A / 2, 0.0), 0.0, A / 2, -0.0235, 1.2))
    return ex("parede", ["espelho"], alt=1.15)


def espelheira(it, cor="branco", porta=None):
    L, P, A = 0.5, 0.14, 0.62
    it.add(mb.carcaca(L, P, A, y=-P / 2, cor=cor, prateleiras=[0.2, 0.4]))
    f = mb.frente(L - 0.004, A - 0.004, estilo="lisa", cor=porta or cor, bisel=0.01)
    mb.transforma(f, loc=(0, -P, 0.002))
    esp = placa_xz(_xz(mb.ret_arredondado(L - 0.05, A - 0.05, 0.03, 4), A / 2), -P - 0.026, 0.006, mat="espelho")
    br = brilhos(dentro_sup(L / 2 - 0.04, A / 2 - 0.04, 8, 0, A / 2, 0.0), 0.0, A / 2, -P - 0.0275, 0.8)
    pz = mb.puxador("botao", x=L / 2 - 0.035, y=-P - 0.022, z=A / 2, cor=cor if porta else "cinza_claro", tam=0.7)
    it.porta([f, esp, pz] + br, dobradica=(-L / 2, -P - 0.011, 0), lado="esq", nome="porta_espelho")
    for k, (z0, z1) in enumerate(((0.0, 0.2), (0.2, 0.4), (0.4, A - E))):
        it.slot(f"prateleira_{k + 1}", (0, -P / 2 + 0.005, z0 + (E if k == 0 else 0.018)), (L - 2 * E, P - 0.04, z1 - z0 - 0.03))
    return ex("parede", ["espelho", "armario", "porta"], alt=1.2)


def espelho_prateleiras(it, cor="menta", cor2="verde_agua"):
    W, A = 0.62, 0.66
    it.add(mb.caixa(W, 0.02, A, y=-0.01, cor=cor, bisel=0.008))
    it.add(placa_xz(_xz(mb.ret_arredondado(0.4, A - 0.12, 0.04, 4), A / 2 - 0.02, -0.1), -0.026, 0.008, mat="espelho"))
    it.add(brilhos(dentro_sup(0.18, (A - 0.16) / 2, 8, -0.1, A / 2 - 0.02, 0.0), -0.1, A / 2 - 0.02, -0.0275, 0.8))
    it.add(moldura_xz(lambda d: _xz(mb.ret_arredondado(0.44 - 2 * d, A - 0.08 - 2 * d, max(0.006, 0.06 - d), 5),
                                    A / 2 - 0.02, -0.1), 0.025, 0.03, cor2, y0=-0.018))
    xs = W / 2 - 0.08
    it.add(mb.caixa(0.022, 0.13, A - 0.02, x=W / 2 - 0.011, y=-0.065, cor=cor2, bisel=0.008))
    for k, z in enumerate((0.0, 0.2, 0.4)):
        it.add(mb.caixa(0.15, 0.12, 0.02, x=xs, y=-0.07, z=z + 0.03, cor=cor2, bisel=0.007))
        it.slot(f"prateleira_{k + 1}", (xs, -0.07, z + 0.05), (0.12, 0.1, 0.15))
    it.add(mb.caixa(W + 0.03, 0.14, 0.025, y=-0.07, z=A, cor=cor2, bisel=0.009))
    it.slot("prateleira_topo", (0, -0.07, A + 0.025), (W, 0.12, 0.2))
    return ex("parede", ["espelho", "prateleiras"], alt=1.0)


def espelho_arco(it, cor="amarelo", cor2="laranja_claro"):
    w, h, z0 = 0.46, 0.62, 0.06

    def forma(d):
        r = w / 2 - d
        pts = [(-w / 2 + d, z0 + d, 0.03), (w / 2 - d, z0 + d, 0.03)]
        pts += [(x, y, 0) for x, y in arco2(0, z0 + h - w / 2, r, 0, 180, 20)]
        return contorno(pts, 4)
    it.add(moldura_xz(forma, 0.045, 0.035, cor))
    it.add(placa_xz(forma(0.04), -0.02, 0.012, mat="espelho"))

    def dentro(x, z):
        zc = z0 + h - w / 2
        if z > zc:
            return x * x + (z - zc) ** 2 < (w / 2 - 0.06) ** 2
        return abs(x) < w / 2 - 0.06 and z > z0 + 0.06
    it.add(brilhos(dentro, 0.0, z0 + h * 0.55, -0.0215, 0.8))
    it.add(mb.extrudado(mb.ret_arredondado(w + 0.08, 0.13, 0.04), 0.03, y=-0.065, z=0.0, cor=cor2, bisel=0.01))
    it.add(mb.caixa(w + 0.02, 0.015, 0.03, y=-0.0075, z=0.025, cor=cor2, bisel=0.006))
    it.slot("prateleira", (0, -0.07, 0.03), (w, 0.1, 0.18))
    return ex("parede", ["espelho", "prateleira"], alt=1.0)


def banquinho_gaveta(it, cor="laranja", cor2="madeira_rosada"):
    L, P, H = 0.42, 0.3, 0.36
    it.add(mb.caixa(L, P, 0.03, z=H - 0.03, cor=cor, bisel=0.01))
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.add(mb.caixa(0.04, 0.04, H - 0.028, x=sx * (L / 2 - 0.035), y=sy * (P / 2 - 0.035), cor=cor, bisel=0.01))
        it.add(mb.caixa(0.022, P - 0.09, 0.03, x=sx * (L / 2 - 0.035), z=0.07, cor=cor, bisel=0.008))
    it.add(mb.carcaca(L - 0.11, P - 0.07, 0.12, z=H - 0.152, cor=cor, topo=False, esp=0.015))
    w = L - 0.11 - 0.035
    f = mb.frente(w, 0.1, estilo="moldura", cor=cor2, cor2=cor2, margem=0.015)
    mb.transforma(f, loc=(0, -(P - 0.07) / 2, H - 0.146))
    pz = mb.puxador("bola", x=0, y=-(P - 0.07) / 2 - 0.022, z=H - 0.096, cor="creme", tam=0.7)
    it.gaveta(w - 0.02, P - 0.12, 0.08, [f, pz], y_frente=-(P - 0.07) / 2, z=H - 0.14, cor="creme")
    it.slot("assento", (0, 0, H), (L - 0.04, P - 0.04, 0.25))
    return ex(tags=["banquinho", "gaveta"])


def banquinho_degrau(it, cor="madeira_mel", cor2="madeira_clara"):
    L, P, H = 0.44, 0.3, 0.4
    for sy in (-1, 1):
        it.add(mb.caixa(L, 0.135, 0.03, y=sy * 0.073, z=H - 0.03, cor=cor2, bisel=0.01))
    for sx in (-1, 1):
        for sy in (-1, 1):
            p = mb.caixa(0.04, 0.05, H - 0.02, x=0, y=0, cor=cor, bisel=0.01)
            mb.transforma(p, rot=[("Y", -sx * 6)])
            mb.transforma(p, loc=(sx * (L / 2 - 0.07), sy * (P / 2 - 0.045), 0.0))
            it.add(p)
        it.add(mb.caixa(0.03, P - 0.08, 0.06, x=sx * (L / 2 - 0.075), z=H - 0.09, cor=cor, bisel=0.008))
    it.add(mb.caixa(L - 0.1, P - 0.06, 0.022, z=0.12, cor=cor2, bisel=0.008))
    it.slot("assento", (0, 0, H), (L - 0.04, P - 0.04, 0.25))
    it.slot("prateleira", (0, 0, 0.142), (L - 0.16, P - 0.08, 0.2))
    return ex(tags=["banquinho", "degrau"])


def prateleira_madeira(it, cor="madeira_escura"):
    L = 0.46
    it.add(mb.caixa(L, 0.14, 0.03, y=-0.07, z=0.07, cor=cor, bisel=0.01))
    for sx in (-1, 1):
        it.add(mb.extrudado(_ccw([(0.0, 0.0), (0.0, 0.072), (-0.1, 0.072)]), 0.02, x=sx * 0.16 - 0.01, plano="yz", cor=cor,
                            bisel=0.005))
    it.slot("prateleira", (0, -0.07, 0.1), (L - 0.02, 0.12, 0.3))
    return ex("parede", ["prateleira", "madeira"], alt=1.2)


def prateleira_vidro(it, metal="cromo"):
    L = 0.5
    it.add(mb.caixa(L, 0.13, 0.012, y=-0.075, z=0.03, cor=None, mat="vidro", bisel=0.004))
    for sx in (-1, 1):
        it.add(mb.cilindro(0.02, 0.012, x=sx * 0.2, y=-0.006, z=0.035, cor=metal, eixo="y", seg=16))
        it.add(mb.caixa(0.03, 0.06, 0.03, x=sx * 0.2, y=-0.035, z=0.02, cor=metal, bisel=0.008))
        it.add(mb.tubo([(sx * 0.2, -0.03, 0.03), (sx * 0.2, -0.14, 0.03), (sx * 0.2, -0.15, 0.06)], 0.006, cor=metal,
                       raio_curva=0.02, seg=8))
    it.add(mb.tubo([(-0.2, -0.15, 0.06), (0.2, -0.15, 0.06)], 0.006, cor=metal, seg=8))
    it.slot("prateleira", (0, -0.075, 0.042), (L - 0.02, 0.12, 0.25))
    return ex("parede", ["prateleira", "vidro"], alt=1.2)


def toalheiro_barra(it, toalha="azul", metal="grafite", listra="azul_claro"):
    zb = 0.42
    for sx in (-1, 1):
        it.add(mb.cilindro(0.022, 0.012, x=sx * 0.24, y=-0.006, z=zb, cor=metal, eixo="y", seg=16))
        it.add(mb.tubo([(sx * 0.24, -0.01, zb), (sx * 0.24, -0.07, zb), (sx * 0.2, -0.08, zb)], 0.009, cor=metal,
                       raio_curva=0.03, seg=8))
    it.add(mb.tubo([(-0.21, -0.08, zb), (0.21, -0.08, zb)], 0.009, cor=metal, seg=8))
    fr = mb.superelipsoide(0.3, 0.024, 0.42, y=-0.097, z=0.0, cor=toalha, e=0.25, e_v=0.15, nu=24, nv=12)
    tr = mb.superelipsoide(0.3, 0.024, 0.34, y=-0.063, z=0.08, cor=toalha, e=0.25, e_v=0.15, nu=24, nv=12)
    for z in (0.05, 0.1):
        it.add(mb.superelipsoide(0.304, 0.028, 0.022, y=-0.097, z=z, cor=listra, e=0.25, e_v=0.15, nu=24, nv=4))
    it.add(fr, tr, mb.cilindro(0.03, 0.3, y=-0.08, z=zb, cor=toalha, eixo="x", seg=20, bisel=0.012))
    return ex("parede", ["toalheiro", "toalha"], alt=0.6)


def toalheiro_escada(it, cor="ferro"):
    W, A, y = 0.48, 0.8, -0.07
    for sx in (-1, 1):
        it.add(mb.cilindro(0.016, A, x=sx * W / 2, y=y, cor=cor, seg=14, bisel=0.006))
        for z in (0.12, A - 0.12):
            it.add(mb.cilindro(0.008, 0.07, x=sx * W / 2, y=-0.035, z=z, cor=cor, eixo="y", seg=8))
            it.add(mb.cilindro(0.018, 0.01, x=sx * W / 2, y=-0.005, z=z, cor=cor, eixo="y", seg=14))
    for k in range(7):
        it.add(mb.cilindro(0.01, W, x=0, y=y, z=0.08 + k * 0.105, cor=cor, eixo="x", seg=10, bisel=0.002))
    return ex("parede", ["toalheiro", "aquecido"], alt=0.8)


def toalheiro_serpentina(it, cor="branco"):
    y, r = -0.07, 0.07
    pts = [(-0.22, 0.03)]
    zs = [0.03, 0.17, 0.31, 0.45, 0.59]
    for k in range(4):
        z0, z1 = zs[k], zs[k + 1]
        if k % 2 == 0:
            pts += arco2(0.18, (z0 + z1) / 2, r, -90, 90, 10)
        else:
            pts += arco2(-0.18, (z0 + z1) / 2, r, 270, 90, 10)
    pts += [(0.22, zs[-1])]
    path = [(-0.22, 0.0, 0.03), (-0.22, y, 0.03)] + [(x, y, z) for x, z in pts[1:-1]] + [(0.22, y, zs[-1]),
                                                                                        (0.22, 0.0, zs[-1])]
    path = [(-0.22, 0.0, 0.03)] + [(x, y, z) for x, z in pts[:-1]] + [(0.24, y, zs[-1]), (0.24, 0.0, zs[-1])]
    it.add(mb.tubo(path, 0.014, cor=cor, raio_curva=0.03, seg=10))
    for x, z in ((-0.22, 0.03), (0.24, zs[-1])):
        it.add(mb.cilindro(0.024, 0.012, x=x, y=-0.006, z=z, cor=cor, eixo="y", seg=16))
    minz = min(mb.bbox(o)[0].z for o in it.partes)
    move(it.partes, (0, 0, -minz))
    return ex("parede", ["toalheiro", "aquecido"], alt=0.9)


reg("espelho_redondo_amarelo", "D", "espelho_redondo", espelho_redondo, "Espelho redondo (amarelo)")
reg("espelho_redondo_turquesa", "D", "espelho_redondo", espelho_redondo, "Espelho redondo (turquesa)", cor="turquesa")
reg("espelho_oval_marrom", "D", "espelho_oval", espelho_oval, "Espelho oval (marrom)")
reg("espelho_retangular_rosa", "D", "espelho_retangular", espelho_retangular, "Espelho retangular (rosa)",
    cor="rosa_escuro")
reg("espelho_retangular_azul", "D", "espelho_retangular", espelho_retangular, "Espelho retangular (azul)",
    cor="azul")
reg("espelheira_branca", "D", "espelheira", espelheira, "Espelheira com porta (branca)")
reg("espelheira_azul", "D", "espelheira", espelheira, "Espelheira com porta (azul)", cor="branco", porta="azul_claro")
reg("espelho_prateleiras_menta", "D", "espelho_prateleiras", espelho_prateleiras, "Espelho com prateleiras (menta)")
reg("espelho_arco_prateleira_amarelo", "D", "espelho_arco", espelho_arco, "Espelho em arco com prateleira (amarelo)")
reg("espelho_arco_prateleira_verde_agua", "D", "espelho_arco", espelho_arco,
    "Espelho em arco com prateleira (verde-água)", cor="verde_agua", cor2="menta")
reg("banquinho_gaveta_laranja", "D", "banquinho_gaveta", banquinho_gaveta, "Banquinho com gaveta (laranja)")
reg("banquinho_degrau_madeira", "D", "banquinho_degrau", banquinho_degrau, "Banquinho degrau (madeira)")
reg("prateleira_madeira_escura", "D", "prateleira_madeira", prateleira_madeira, "Prateleira pequena de madeira")
reg("prateleira_vidro_cromo", "D", "prateleira_vidro", prateleira_vidro, "Prateleira de vidro")
reg("toalheiro_barra_toalha_azul", "D", "toalheiro_barra", toalheiro_barra, "Toalheiro com toalha (azul)")
reg("toalheiro_barra_toalha_rosa", "D", "toalheiro_barra", toalheiro_barra, "Toalheiro com toalha (rosa)",
    toalha="rosa", metal="cromo", listra="rosa_claro")
reg("toalheiro_escada_ferro", "D", "toalheiro_escada", toalheiro_escada, "Toalheiro aquecido de escada (ferro)")
reg("toalheiro_serpentina_branco", "D", "toalheiro_serpentina", toalheiro_serpentina,
    "Toalheiro aquecido em serpentina (branco)")

# =====================================================================================================================
# E · Objetos pequenos (apoio): torneiras, higiene, toalhas, frascos
# =====================================================================================================================
def rotulo(ob, cor, z0, z1, frente=-0.4):
    """Etiqueta na frente de um frasco: faces viradas para −Y entre z0 e z1."""
    return mb.pinta_onde(ob, cor, lambda c, n: z0 < c.z < z1 and n.y < frente)


def torneira_parede(it, cor="cinza_claro", cor2="cinza"):
    y = -0.07
    it.add(mb.cilindro(0.026, 0.2, y=y, z=0.06, cor=cor, eixo="x", seg=20, bisel=0.008))
    for sx in (-1, 1):
        it.add(mb.cilindro(0.04, 0.032, x=sx * 0.115, y=y, z=0.06, cor=cor, eixo="x", seg=24, bisel=0.01))
        it.add(mb.cilindro(0.028, 0.006, x=sx * 0.133, y=y, z=0.06, cor=cor2, eixo="x", seg=20, bisel=0.002))
        it.add(mb.cilindro(0.016, 0.07, x=sx * 0.06, y=-0.035, z=0.06, cor=cor, eixo="y", seg=14))
        it.add(mb.cilindro(0.026, 0.01, x=sx * 0.06, y=-0.005, z=0.06, cor=cor, eixo="y", seg=16))
    it.add(mb.caixa(0.05, 0.12, 0.034, y=y - 0.07, z=0.04, cor=cor, bisel=0.012))
    it.add(mb.caixa(0.05, 0.035, 0.05, y=y - 0.115, z=0.0, cor=cor, bisel=0.012))
    it.add(mb.caixa(0.036, 0.02, 0.004, y=y - 0.115, z=-0.001, cor=cor2, bisel=0.001))
    return ex("parede", ["torneira", "misturador"], alt=0.95, mini=(0.6, -1, 0.6))


def torneira_alavanca(it, cor="cinza_claro"):
    it.add(mb.cilindro(0.032, 0.012, cor=cor, seg=20, bisel=0.004))
    it.add(mb.torno([(0, 0), (0.026, 0), (0.026, 0.12), (0.023, 0.13), (0, 0.132)], z=0.01, cor=cor, seg=20))
    it.add(mb.tubo([(0, -0.01, 0.1), (0, -0.09, 0.1), (0, -0.11, 0.07)], 0.012, cor=cor, raio_curva=0.03, seg=12))
    it.add(mb.cilindro(0.014, 0.012, y=-0.112, z=0.055, cor="cinza", seg=12, bisel=0.003))
    it.add(mb.cilindro(0.018, 0.02, z=0.135, cor=cor, seg=14, bisel=0.005))
    it.add(mb.tubo([(0, 0, 0.148), (0.04, 0.01, 0.16), (0.11, 0.02, 0.165)], 0.009, cor=cor, raio_curva=0.03, seg=10))
    return ex("apoio", ["torneira", "monocomando"], mini=(0.6, -1, 0.5))


def torneira_cruzeta_jogo(it, cor="amarelo"):
    it.add(torneira_bica_alta(0, 0, 0, cor, alt=0.19, bico=0.1))
    for sx in (-1, 1):
        it.add(cruzeta(sx * 0.11, 0.0, 0.0, cor, alt=0.05, tam=1.1))
    return ex("apoio", ["torneira", "cruzeta"], mini=(0.6, -1, 0.5))


def torneira_cuba(it, cor="cinza_azulado"):
    it.add(mb.caixa(0.06, 0.07, 0.016, cor=cor, bisel=0.006))
    it.add(mb.caixa(0.05, 0.05, 0.13, y=0.005, z=0.01, cor=cor, bisel=0.012))
    b = mb.caixa(0.05, 0.15, 0.03, y=-0.06, z=0.0, cor=cor, bisel=0.01)
    mb.transforma(b, rot=("X", -6))
    mb.transforma(b, loc=(0, 0, 0.11))
    it.add(b, mb.caixa(0.034, 0.02, 0.004, y=-0.125, z=0.117, cor="cinza", bisel=0.001))
    it.add(mb.cilindro(0.032, 0.035, x=0.12, cor=cor, seg=20, bisel=0.008))
    it.add(mb.cilindro(0.024, 0.006, x=0.12, z=0.033, cor="cinza", seg=18, bisel=0.002))
    return ex("apoio", ["torneira", "cuba"], mini=(0.6, -1, 0.5))


def torneira_retro(it, cor="laranja"):
    it.add(mb.cilindro(0.03, 0.02, cor=cor, seg=18, bisel=0.006))
    it.add(mb.cilindro(0.022, 0.03, z=0.08, cor=cor, seg=16, bisel=0.006))
    it.add(mb.tubo([(0, 0, 0.01), (0, 0, 0.26), (0, -0.11, 0.26), (0, -0.11, 0.2)], 0.014, cor=cor, raio_curva=0.05,
                   seg=8))
    it.add(mb.cilindro(0.017, 0.025, y=-0.11, z=0.18, cor=cor, seg=14, bisel=0.005))
    for sx in (-1, 1):
        it.add(mb.cilindro(0.026, 0.018, x=sx * 0.12, y=0.02, cor=cor, seg=12, bisel=0.005))
        it.add(mb.cilindro(0.012, 0.09, x=sx * 0.12, y=0.02, cor=cor, seg=8, bisel=0.0))
        it.add(mb.cilindro(0.018, 0.025, x=sx * 0.12, y=0.02, z=0.06, cor=cor, seg=10, bisel=0.004))
        it.add(cruzeta(sx * 0.12, 0.02, 0.09, cor, alt=0.02, tam=1.15))
    return ex("apoio", ["torneira", "cruzeta", "retro"], mini=(0.6, -1, 0.5))


def torneira_gourmet(it, cor="azul"):
    it.add(mb.cilindro(0.034, 0.014, cor=cor, seg=20, bisel=0.005))
    it.add(mb.torno([(0, 0), (0.026, 0), (0.028, 0.03), (0.024, 0.12), (0.018, 0.14), (0, 0.14)], z=0.012, cor=cor,
                    seg=18))
    it.add(mb.tubo([(0, 0, 0.14), (0, 0, 0.33), (0, -0.17, 0.33), (0, -0.17, 0.25)], 0.014, cor=cor, raio_curva=0.085,
                   seg=12))
    it.add(mb.cilindro(0.019, 0.04, y=-0.17, z=0.22, cor=cor, seg=16, bisel=0.006))
    it.add(mb.cilindro(0.016, 0.03, x=0.03, z=0.1, cor=cor, eixo="x", seg=14, bisel=0.004))
    it.add(mb.tubo([(0.045, 0, 0.1), (0.07, 0.0, 0.12), (0.075, 0.0, 0.18)], 0.008, cor=cor, raio_curva=0.03, seg=10))
    return ex("apoio", ["torneira", "gourmet"], mini=(0.6, -1, 0.5))


def torneira_pacote(it):
    pc = mb.importa_pacote("Mixer_08")
    ps = list(pc.values())
    lo, hi = mb.bbox(ps)
    move(ps, (-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z))
    it.add(ps)
    return ex("apoio", ["torneira", "monocomando"], pacote=True, mini=(0.6, -1, 0.5))


def balanca(it, cor="azul_celeste", cor2="magenta"):
    it.add(mb.superelipsoide(0.32, 0.3, 0.045, cor=cor, e=0.22, e_v=0.35, nu=24, nv=8))
    it.add(mb.superelipsoide(0.29, 0.27, 0.012, z=0.036, cor="azul_claro", e=0.2, e_v=0.4, nu=24, nv=4))
    for sx in (-1, 1):
        it.add(mb.superelipsoide(0.09, 0.15, 0.012, x=sx * 0.065, y=-0.025, z=0.044, cor=cor2, e=0.4, e_v=0.5, nu=20, nv=6))
    it.add(mb.cilindro(0.04, 0.012, y=0.1, z=0.045, cor="branco", seg=20, bisel=0.004))
    it.add(mb.caixa(0.004, 0.03, 0.004, y=0.105, z=0.056, cor="vermelho", bisel=0.001))
    return ex("apoio", ["balanca"], mini=(0.5, -1, 0.9))


def desentupidor(it, cor="laranja_escuro", cabo="amarelo_escuro"):
    it.add(mb.torno([(0, 0.0), (0.072, 0.0), (0.078, 0.01), (0.07, 0.045), (0.035, 0.08), (0.016, 0.09), (0, 0.092)],
                    cor=cor, seg=28))
    it.add(mb.cilindro(0.014, 0.42, z=0.085, cor=cabo, seg=14, bisel=0.006))
    return ex("apoio", ["limpeza", "desentupidor"])


def escova_vaso(it, cor="azul", cerda="branco"):
    it.add(mb.torno(perfil_casca([(0.05, 0.0), (0.064, 0.04), (0.068, 0.1), (0.066, 0.13)], 0.007, 0.012), cor=cor, seg=28))
    it.add(mb.cilindro(0.06, 0.012, z=0.12, cor="branco", seg=24, bisel=0.004))
    it.add(mb.esfera(0.042, z=0.085, cor=cerda, seg=16, esc=(1, 1, 0.8)))
    it.add(mb.cilindro(0.011, 0.26, z=0.12, cor=cor, seg=12, bisel=0.004))
    it.add(mb.esfera(0.016, z=0.385, cor=cor, seg=12))
    return ex("apoio", ["limpeza", "vaso"])


def toalha_dobrada(it, cor="laranja", cor2="laranja_claro"):
    for k in range(3):
        it.add(mb.superelipsoide(0.3 - k * 0.004, 0.2, 0.036, x=(k % 2) * 0.004, z=k * 0.034, cor=cor, e=0.3, e_v=0.55,
                                 nu=24, nv=8))
    it.add(mb.cilindro(0.018, 0.29, y=-0.1, z=0.051, cor=cor2, eixo="x", seg=14, bisel=0.008))
    return ex("apoio", ["toalha"])


def toalha_enrolada(it, cor="pessego", cor2="salmao"):
    it.add(mb.cilindro(0.07, 0.3, z=0.07, cor=cor, eixo="x", seg=20, bisel=0.025))
    for sx in (-1, 1):
        pts = []
        for k in range(15):
            t = k / 14 * 2.4 * 2 * PI
            rr = 0.012 + 0.046 * k / 14
            pts.append((sx * 0.151, rr * math.cos(t), 0.07 + rr * math.sin(t)))
        it.add(mb.tubo(pts, 0.0035, cor=cor2, raio_curva=0.001, seg=4, tampas=False))
    it.add(mb.superelipsoide(0.29, 0.03, 0.06, y=-0.065, z=0.015, cor=cor, e=0.3, e_v=0.5, nu=16, nv=8))
    return ex("apoio", ["toalha"])


def porta_papel_tampa(it, tampa="laranja", metal="cinza_claro"):
    zr = 0.12
    it.add(mb.caixa(0.03, 0.02, 0.12, x=-0.08, y=-0.01, z=zr - 0.06, cor=metal, bisel=0.008))
    it.add(mb.cilindro(0.008, 0.15, x=0.0, y=-0.07, z=zr, cor=metal, eixo="x", seg=10))
    it.add(mb.tubo([(-0.08, -0.015, zr), (-0.08, -0.07, zr)], 0.01, cor=metal, seg=8))
    rolo = mb.cilindro(0.055, 0.11, x=0.0, y=-0.07, z=zr, cor="papel", eixo="x", seg=28, bisel=0.01)
    it.add(rolo, mb.cilindro(0.02, 0.112, x=0.0, y=-0.07, z=zr, cor="papel_amarelado", eixo="x", seg=16, bisel=0.002))
    it.add(mb.caixa(0.105, 0.004, 0.12, y=-0.125, z=zr - 0.12, cor="papel", bisel=0.0015))
    it.add(mb.caixa(0.03, 0.02, 0.07, x=-0.08, y=-0.01, z=zr + 0.05, cor=metal, bisel=0.008))
    it.add(mb.superelipsoide(0.2, 0.13, 0.035, x=0.0, y=-0.065, z=zr + 0.075, cor=tampa, e=0.25, e_v=0.45, nu=24, nv=8))
    return ex("parede", ["papel_higienico", "porta_papel"], alt=0.6)


def porta_papel_aberto(it, capa="grafite", rolo_cor="amarelo_claro"):
    zr = 0.13
    y = -0.07
    arco_ext = arco2(y, zr, 0.072, -20, 200, 16)
    arco_int = arco2(y, zr, 0.064, 200, -20, 16)
    it.add(mb.extrudado(_ccw(arco_ext + arco_int), 0.14, x=-0.07, plano="yz", cor=capa, bisel=0.003, seg=1))
    it.add(mb.caixa(0.14, 0.012, 0.11, y=-0.006, z=zr - 0.02, cor=capa, bisel=0.004))
    it.add(mb.cilindro(0.056, 0.12, y=y, z=zr, cor=rolo_cor, eixo="x", seg=28, bisel=0.01))
    for sx in (-1, 1):
        it.add(mb.cilindro(0.014, 0.012, x=sx * 0.066, y=y, z=zr, cor=capa, eixo="x", seg=6, bisel=0.002))
    it.add(mb.caixa(0.115, 0.004, 0.14, y=y - 0.056, z=zr - 0.14, cor=rolo_cor, bisel=0.0015))
    return ex("parede", ["papel_higienico", "porta_papel"], alt=0.6)


def chinelos(it, cor="laranja_claro", cor2="pessego"):
    for sx in (-1, 1):
        ps = [mb.superelipsoide(0.1, 0.25, 0.025, cor=cor, e=0.6, e_v=0.5, nu=20, nv=6),
              mb.superelipsoide(0.084, 0.226, 0.01, z=0.02, cor=cor2, e=0.6, e_v=0.6, nu=20, nv=4)]
        ext = [(0.052 * math.cos(t), 0.022 + 0.05 * math.sin(t)) for t in [PI * k / 12 for k in range(13)]]
        inn = [(0.04 * math.cos(t), 0.022 + 0.036 * math.sin(t)) for t in [PI - PI * k / 12 for k in range(13)]]
        ps.append(mb.extrudado(_ccw(ext + inn), 0.1, y=-0.105, plano="xz", cor=cor, bisel=0.008, seg=1))
        ch = mb.junta(ps, "chinelo")
        mb.transforma(ch, rot=("Z", -sx * 8))
        mb.transforma(ch, loc=(sx * 0.065, 0, 0))
        it.add(ch)
    return ex("apoio", ["chinelo", "calcado"], mini=(0.5, -1, 0.8))


def frasco_xampu(it, cor="amarelo", tampa="creme_claro", etiq="amarelo_claro"):
    b = mb.torno([(0, 0), (0.036, 0), (0.045, 0.02), (0.048, 0.1), (0.042, 0.15), (0.024, 0.172), (0.02, 0.18),
                  (0, 0.18)], cor=cor, seg=24, esc=(1, 0.66))
    rotulo(b, etiq, 0.04, 0.13)
    it.add(b, mb.torno([(0, 0), (0.026, 0), (0.027, 0.035), (0.022, 0.042), (0, 0.044)], z=0.175, cor=tampa, seg=20,
                       esc=(1, 0.8)))
    return ex("apoio", ["frasco", "xampu"])


def sabonete_liquido(it, cor="verde_claro", etiq="branco", bomba="branco"):
    b = mb.torno([(0, 0), (0.036, 0), (0.04, 0.015), (0.04, 0.1), (0.032, 0.12), (0.016, 0.13), (0, 0.13)], cor=cor,
                 seg=24, esc=(1, 0.8))
    rotulo(b, etiq, 0.03, 0.085)
    it.add(b, mb.cilindro(0.018, 0.02, z=0.125, cor=bomba, seg=16, bisel=0.004),
           mb.cilindro(0.006, 0.035, z=0.14, cor=bomba, seg=10),
           mb.caixa(0.026, 0.026, 0.02, z=0.17, cor=bomba, bisel=0.008),
           mb.tubo([(0, 0, 0.18), (-0.045, 0, 0.18), (-0.05, 0, 0.17)], 0.006, cor=bomba, raio_curva=0.01, seg=8))
    return ex("apoio", ["frasco", "sabonete"])


def spray(it, cor="roxo", faixa="amarelo"):
    b = mb.cilindro(0.025, 0.15, cor=cor, seg=24, bisel=0.006)
    mb.pinta_onde(b, faixa, lambda c, n: any(z0 < c.z < z0 + 0.008 for z0 in (0.02, 0.035, 0.05)) and abs(n.z) < 0.5)
    it.add(b, mb.cilindro(0.012, 0.02, z=0.15, cor="branco", seg=14, bisel=0.004),
           mb.cilindro(0.026, 0.05, z=0.148, cor=None, mat="vidro", seg=24, bisel=0.006))
    return ex("apoio", ["frasco", "spray"])


def desodorante(it, cor="branco", tampa="azul_celeste"):
    b = mb.torno([(0, 0), (0.026, 0), (0.03, 0.02), (0.03, 0.08), (0.024, 0.1), (0, 0.1)], cor=cor, seg=8, angulo=50)
    mb.pinta_onde(b, tampa, lambda c, n: 0.035 < c.z < 0.06 and abs(n.z) < 0.5)
    it.add(b, mb.torno([(0, 0), (0.028, 0), (0.03, 0.05), (0.024, 0.06), (0, 0.062)], z=0.098, cor=tampa, seg=8,
                       angulo=50))
    return ex("apoio", ["frasco", "desodorante"])


def saboneteira_bomba(it, cor="marrom", bomba="cinza"):
    it.add(mb.torno([(0, 0), (0.036, 0), (0.042, 0.015), (0.045, 0.08), (0.03, 0.105), (0.016, 0.115), (0, 0.115)],
                    cor=cor, seg=24))
    it.add(mb.cilindro(0.02, 0.022, z=0.11, cor=bomba, seg=16, bisel=0.005),
           mb.cilindro(0.006, 0.035, z=0.13, cor=bomba, seg=10),
           mb.cilindro(0.016, 0.018, z=0.16, cor=bomba, seg=14, bisel=0.005),
           mb.tubo([(0, 0, 0.17), (-0.04, 0, 0.17), (-0.045, 0, 0.162)], 0.006, cor=bomba, raio_curva=0.01, seg=8))
    return ex("apoio", ["frasco", "sabonete"])


def _escova_dentes(cor, cerda="branco"):
    c = mb.caixa(0.012, 0.008, 0.17, cor=cor, bisel=0.004, seg=2)
    h = mb.caixa(0.012, 0.012, 0.028, y=-0.008, z=0.145, cor=cerda, bisel=0.003, seg=2)
    return mb.junta([c, h], "escova")


def copo_escovas(it, cor="verde", c1="amarelo", c2="azul_celeste"):
    it.add(mb.torno(perfil_casca([(0.033, 0.0), (0.04, 0.03), (0.042, 0.1)], 0.005, 0.01), cor=cor, seg=24))
    for k, (cc, rz, rx) in enumerate(((c1, 20, 14), (c2, -25, -12))):
        e = _escova_dentes(cc)
        mb.transforma(e, rot=[("Z", rz), ("Y", rx)])
        mb.transforma(e, loc=(-0.012 if k == 0 else 0.012, 0.004, 0.012))
        it.add(e)
    return ex("apoio", ["escova_de_dentes", "copo"])


def secador(it, cor="vermelho_claro", bico="verde", cabo="roxo"):
    it.add(mb.cilindro(0.055, 0.15, x=0.0, y=0, z=0.17, cor=cor, eixo="x", seg=22, bisel=0.02))
    it.add(mb.esfera(0.052, x=0.075, z=0.17, cor=cabo, seg=14, esc=(0.45, 1, 1)))
    it.add(mb.cilindro(0.045, 0.06, x=-0.1, z=0.17, cor=bico, eixo="x", seg=20, r2=0.036, bisel=0.008))
    it.add(mb.cilindro(0.03, 0.004, x=-0.131, z=0.17, cor=cabo, eixo="x", seg=20, bisel=0.001))
    cb = mb.superelipsoide(0.045, 0.055, 0.15, cor=cabo, e=0.5, e_v=0.3, nu=20, nv=10)
    mb.transforma(cb, rot=("Y", 12))
    mb.transforma(cb, loc=(0.02, 0, 0.0))
    it.add(cb, mb.caixa(0.012, 0.02, 0.025, x=0.036, y=-0.025, z=0.08, cor="branco", bisel=0.004))
    return ex("apoio", ["secador", "cabelo"])


def caixinha(it, cor="azul_celeste", cor2="verde_agua"):
    b = mb.caixa(0.08, 0.08, 0.06, cor=cor, bisel=0.01)
    it.add(b, mb.caixa(0.085, 0.085, 0.02, z=0.055, cor=cor, bisel=0.008))
    it.add(mb.caixa(0.04, 0.004, 0.025, y=-0.041, z=0.018, cor=cor2, bisel=0.002))
    return ex("apoio", ["caixa"])


def vela(it, cor="vermelho_escuro", vid="vinho"):
    it.add(mb.torno(perfil_casca([(0.036, 0.0), (0.04, 0.02), (0.04, 0.08)], 0.004, 0.006), cor=None, mat="vidro", seg=24))
    it.add(mb.cilindro(0.034, 0.05, z=0.006, cor=cor, seg=24, bisel=0.004))
    it.add(mb.cilindro(0.0025, 0.012, z=0.055, cor="preto", seg=6, bisel=0.0))
    return ex("apoio", ["vela", "decoracao"])


def escova_cabelo(it, cor="azul_celeste", cerda="branco_gelo"):
    it.add(mb.cilindro(0.045, 0.022, x=-0.06, cor=cor, seg=22, bisel=0.008))
    it.add(mb.cilindro(0.038, 0.012, x=-0.06, z=0.02, cor=cerda, seg=22, bisel=0.004))
    for k in range(10):
        a = 2 * PI * k / 10
        it.add(mb.cilindro(0.004, 0.008, x=-0.06 + 0.024 * math.cos(a), y=0.024 * math.sin(a), z=0.03, cor=cerda, seg=6,
                           bisel=0.001))
    it.add(mb.superelipsoide(0.13, 0.032, 0.022, x=0.04, cor=cor, e=0.5, e_v=0.6, nu=16, nv=8))
    return ex("apoio", ["escova", "cabelo"])


def saboneteira(it, cor="roxo", sabao="amarelo"):
    it.add(mb.torno([(0, 0), (0.04, 0), (0.055, 0.008), (0.062, 0.02), (0.056, 0.024), (0.046, 0.014), (0, 0.012)],
                    cor=cor, seg=28, esc=(1, 0.78)))
    it.add(mb.superelipsoide(0.07, 0.05, 0.026, z=0.01, cor=sabao, e=0.45, e_v=0.5, nu=20, nv=8))
    return ex("apoio", ["sabonete", "saboneteira"])


def esponja(it, cor="laranja"):
    ob = mb.superelipsoide(0.11, 0.07, 0.042, cor=cor, e=0.35, e_v=0.5, nu=28, nv=10)
    for v in ob.data.vertices:
        k = 1 - 0.2 * math.exp(-(v.co.x / 0.028) ** 2)
        v.co.y *= k
        v.co.z = v.co.z * (1 - 0.1 * math.exp(-(v.co.x / 0.028) ** 2))
    it.add(ob)
    return ex("apoio", ["esponja", "banho"])


def pote_creme(it, cor="amarelo", tampa="creme_claro"):
    b = mb.torno([(0, 0), (0.04, 0), (0.045, 0.01), (0.045, 0.05), (0, 0.05)], cor=cor, seg=28)
    mb.pinta_onde(b, "amarelo_claro", lambda c, n: 0.015 < c.z < 0.04 and n.y < -0.3)
    it.add(b, mb.cilindro(0.047, 0.024, z=0.048, cor=tampa, seg=28, bisel=0.008))
    return ex("apoio", ["creme", "pote"])


def objeto_pacote(it, nome, escala=1.0, tags=()):
    pc = mb.importa_pacote(nome)
    ps = list(pc.values())
    if escala != 1.0:
        for o in ps:
            o.data.transform(Matrix.Diagonal((escala, escala, escala, 1)))
    lo, hi = mb.bbox(ps)
    move(ps, (-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z))
    it.add(ps)
    return ex("apoio", tags, pacote=True)


reg("torneira_misturador_parede", "E", "torneira_parede", torneira_parede, "Misturador de parede")
reg("torneira_monocomando_alavanca", "E", "torneira_alavanca", torneira_alavanca, "Torneira monocomando de alavanca")
reg("torneira_monocomando_pacote", "E", "torneira_pacote", torneira_pacote, "Torneira monocomando")
reg("torneira_cruzeta_amarela", "E", "torneira_cruzeta", torneira_cruzeta_jogo, "Torneira com cruzetas (amarela)")
reg("torneira_cuba_cinza", "E", "torneira_cuba", torneira_cuba, "Torneira de cuba (cinza)")
reg("torneira_retro_laranja", "E", "torneira_retro", torneira_retro, "Torneira retrô de cruzeta (laranja)")
reg("torneira_gourmet_azul", "E", "torneira_gourmet", torneira_gourmet, "Torneira gourmet (azul)")
reg("balanca_banheiro_azul", "E", "balanca", balanca, "Balança de banheiro")
reg("desentupidor_laranja", "E", "desentupidor", desentupidor, "Desentupidor")
reg("escova_vaso_azul", "E", "escova_vaso", escova_vaso, "Escova de vaso com suporte")
reg("toalha_dobrada_laranja", "E", "toalha_dobrada", toalha_dobrada, "Toalhas dobradas (laranja)")
reg("toalha_enrolada_pessego", "E", "toalha_enrolada", toalha_enrolada, "Toalha enrolada (pêssego)")
reg("porta_papel_tampa_laranja", "E", "porta_papel_tampa", porta_papel_tampa, "Porta-papel com prateleira")
reg("porta_papel_aberto_grafite", "E", "porta_papel_aberto", porta_papel_aberto, "Porta-papel com capa")
reg("chinelos_laranja", "E", "chinelos", chinelos, "Chinelos")
reg("frasco_xampu_amarelo", "E", "frasco_xampu", frasco_xampu, "Frasco de xampu")
reg("frasco_sabonete_liquido_verde", "E", "sabonete_liquido", sabonete_liquido, "Sabonete líquido")
reg("frasco_spray_roxo", "E", "spray", spray, "Spray de cabelo")
reg("frasco_desodorante_azul", "E", "desodorante", desodorante, "Desodorante")
reg("frasco_saboneteira_bomba_marrom", "E", "saboneteira_bomba", saboneteira_bomba, "Saboneteira de bomba")
reg("pasta_dente_pacote", "E", "pasta_pacote", objeto_pacote, "Pasta de dente", nome="Toothpaste_01", escala=0.7,
    tags=["pasta_de_dente", "higiene"])
reg("copo_escovas_verde", "E", "copo_escovas", copo_escovas, "Copo com escovas de dente")
reg("escova_dentes_pacote", "E", "escova_dentes_pacote", objeto_pacote, "Escova de dentes", nome="Toothbrush_01",
    tags=["escova_de_dentes", "higiene"])
reg("secador_cabelo_rosa", "E", "secador", secador, "Secador de cabelo")
reg("caixinha_azul", "E", "caixinha", caixinha, "Caixinha")
reg("vela_copo_vermelha", "E", "vela", vela, "Vela no copo")
reg("escova_cabelo_azul", "E", "escova_cabelo", escova_cabelo, "Escova de cabelo")
reg("saboneteira_sabonete_roxa", "E", "saboneteira", saboneteira, "Saboneteira com sabonete")
reg("esponja_banho_laranja", "E", "esponja", esponja, "Esponja de banho")
reg("pote_creme_amarelo", "E", "pote_creme", pote_creme, "Pote de creme")


# =====================================================================================================================
# Execução
# =====================================================================================================================
def _vitrines(args):
    abertos = "abertos" in args
    secoes = [a for a in args if a != "abertos"] or sorted({p["secao"] for p in PECAS})
    pasta = os.path.join(SAIDA, CAT)
    for s in secoes:
        ids = [p["id"] for p in PECAS if p["secao"] == s]
        arq = os.path.join(pasta, f"vitrine_{s}{'_abertos' if abertos else ''}.png")
        mb.vitrine(pasta, arq, ids=ids, abertos=abertos, amostras=int(os.environ.get("AMOSTRAS", 32)))


def main():
    if SEL and SEL[0] == "vitrine":
        _vitrines(SEL[1:])
        return
    ids = [p["id"] for p in PECAS]
    assert len(ids) == len(set(ids)), "ids repetidos"
    escolha = [p for p in PECAS if not SEL or p["id"] in SEL or p["grupo"] in SEL or p["secao"] in SEL]
    cat = mb.Catalogo(CAT, SAIDA, "Banheiro")
    falhas = []
    for p in escolha:
        mb.limpa()
        it = mb.Item(p["id"])
        try:
            e = p["fn"](it, **p["kw"])
            cat.exporta(it, rotulo=p["rotulo"], grupo=p["grupo"], **e)
        except Exception as err:  # segue com as outras e lista no fim
            import traceback
            traceback.print_exc()
            falhas.append((p["id"], repr(err)))
    if not SEL:
        validos = set(ids)
        velhos = [x for x in cat.dados["itens"] if x["id"] not in validos]
        for x in velhos:
            for k in ("arquivo", "miniatura"):
                f = os.path.join(cat.pasta, x[k])
                if os.path.exists(f):
                    os.remove(f)
        cat.dados["itens"] = [x for x in cat.dados["itens"] if x["id"] in validos]
    ordem = {i: k for k, i in enumerate(ids)}
    cat.dados["itens"].sort(key=lambda x: ordem.get(x["id"], 1e9))
    cat.salva()
    print("total no catalogo:", len(cat.dados["itens"]), "registradas:", len(PECAS), flush=True)
    if falhas:
        print("FALHAS:", falhas, flush=True)


main()
