"""Biblioteca de cidade do Morada: ruas e pontes diagonais (45°), categoria "ruas_diagonais".

Uso:
  MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/cidade_ruas_diagonais.py -- SP/cidade_out [ids...]

Geometria (grade de 15 m, origem no centro da peça, frente −Y, Z para cima):
- A rua diagonal tem o eixo nas linhas da grade que passam pelos CANTOS das quadras (x − y = 15·k). A peça
  principal (rua_diagonal) leva o eixo do canto sudoeste ao canto nordeste da quadra; o perfil é o de cb.RUA (ou
  cb.AVENIDA) medido na perpendicular: asfalto até 3,65 (6,15), meio-fio em 3,75 (6,25), calçada até 7,50. Medido
  em x, a faixa inteira tem 21,2 m, então ela passa para as duas quadras vizinhas do lado (a leste e a norte da
  principal): nelas vai a peça de enchimento (rua_diagonal_enchimento), com o triângulo de rua no canto.
- Encaixe das peças de chão: principal giro 0 na quadra (i, j); enchimento giro 0 em (i + 1, j) (triângulo no canto
  noroeste) e giro 180 em (i, j + 1) (triângulo no canto sudeste). A próxima principal fica em (i + 1, j + 1). Com
  tudo girado de 90°, a diagonal corre de sudeste para noroeste (as posições giram junto).
- O tracejado da diagonal tem período de 15·√2/4 = 5,30 m (4 traços por quadra), com o meio de um vão em cada canto,
  então continua de uma peça para a outra; as curvas ajustam o período ao comprimento delas.
- Peças elevadas (tabuleiros, cabeceira e pontes de efeito): o tabuleiro da diagonal é um módulo com as pontas
  cortadas na perpendicular, passando pelos cantos da quadra (comprimento 21,21 m); ele invade de propósito os
  triângulos das quadras vizinhas, no alto (calçada em z = 7,50), sobre água ou chão. Nada de enchimento sob a ponte.
- Rotas: o catálogo grava em extra "faixas" o centro de cada faixa de rolamento (pontos [x, y, z] do Blender, no
  sentido do trânsito, mão direita) e "mao": "direita".
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import moveis_base as mb  # noqa: E402
import cidade_base as cb  # noqa: E402
import cidade_ruas as cr  # noqa: E402
import cidade_agua_estruturas as ae  # noqa: E402
import cidade_ferrovia_pontes as fp  # noqa: E402

V = Vector
Q, H = cb.Q, cb.H
S2 = math.sqrt(2.0)
LD = Q * S2                 # comprimento do eixo na quadra, de canto a canto (21,213 m)
PER_D = LD / 4              # período do tracejado na diagonal (5,303 m)
ZA, ZF = cb.Z_ASF, cb.Z_FUNDO
ZE = cb.Z_ELEVADO           # calçada das pontes (7,50); asfalto em 7,40
RUA, AV = cb.RUA, cb.AVENIDA
DIAG = (1 / S2, 1 / S2)     # direção nordeste
R_CURVA = H / (S2 - 1)      # raio do eixo da curva de 45° (18,107 m): entra no meio da quadra e sai pelo canto
Z_AGUA = -1.0


# =====================================================================================================================
# Geometria 2D: recorte de polígonos (Sutherland–Hodgman), caminhos e deslocamentos
# =====================================================================================================================
def area2(pts):
    return sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(pts, pts[1:] + pts[:1])) / 2


def _interp(p, q, t):
    return tuple(a + (b - a) * t for a, b in zip(p, q))


def corta_semiplano(poly, f):
    """Mantém a parte do polígono em que f(p) <= 0 (f afim). Pontos 2D ou 3D (z interpolado)."""
    out = []
    n = len(poly)
    for i in range(n):
        P, R = poly[i], poly[(i + 1) % n]
        a, b = f(P), f(R)
        if a <= 0:
            out.append(P)
        if (a < 0 < b) or (b < 0 < a):
            out.append(_interp(P, R, a / (a - b)))
    return out


def limpa_poly(poly, tol=1e-5):
    out = []
    for p in poly:
        if not out or math.hypot(p[0] - out[-1][0], p[1] - out[-1][1]) > tol:
            out.append(p)
    while len(out) > 1 and math.hypot(out[0][0] - out[-1][0], out[0][1] - out[-1][1]) <= tol:
        out.pop()
    mudou = True
    while mudou and len(out) > 3:
        mudou = False
        for i in range(len(out)):
            a, b, c = out[i - 1], out[i], out[(i + 1) % len(out)]
            cruz = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
            if abs(cruz) < 1e-7:
                out.pop(i)
                mudou = True
                break
    if len(out) < 3 or abs(area2([(p[0], p[1]) for p in out])) < 1e-5:
        return []
    return out


def corta_ret(poly, ret):
    x0, y0, x1, y1 = ret
    for f in (lambda p: x0 - p[0], lambda p: p[0] - x1, lambda p: y0 - p[1], lambda p: p[1] - y1):
        poly = corta_semiplano(poly, f)
        if len(poly) < 3:
            return []
    return limpa_poly(poly)


def dentro(p, poly):
    """Ponto no polígono (par-ímpar)."""
    x, y = p
    d = False
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i][0], poly[i][1]
        x2, y2 = poly[(i + 1) % n][0], poly[(i + 1) % n][1]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            d = not d
    return d


def dist_borda(p, poly):
    m = 1e9
    for i in range(len(poly)):
        a, b = V(poly[i][:2]), V(poly[(i + 1) % len(poly)][:2])
        ab = b - a
        t = max(0.0, min(1.0, (V(p) - a).dot(ab) / max(1e-12, ab.length_squared)))
        m = min(m, (V(p) - (a + ab * t)).length)
    return m


class Caminho:
    """Eixo de uma rua: polilinha 2D (densa nas curvas), com âncoras (índices dos vértices que ficam no meio de um
    vão do tracejado: as bordas da peça e os cortes da diagonal) e altura do asfalto por vértice."""

    def __init__(self, pts, ancoras, z=0.0, tang=None):
        self.pts = [(float(p[0]), float(p[1])) for p in pts]
        self.anc = list(ancoras)
        self.z = list(z) if isinstance(z, (list, tuple)) else [z] * len(self.pts)
        self.t = [V((t[0], t[1])).normalized() for t in tang] if tang else ae.tangentes(self.pts)

    def desloca(self, off):
        """Linha paralela: off > 0 à direita de quem anda."""
        return [(p[0] + t.y * off, p[1] - t.x * off) for p, t in zip(self.pts, self.t)]

    def espelha(self):
        return Caminho([(-x, y) for x, y in self.pts], self.anc, self.z, [(-t.x, t.y) for t in self.t])


def caminho_reto(p0, d, ss, ancoras=None, z=0.0):
    pts = [(p0[0] + d[0] * s, p0[1] + d[1] * s) for s in ss]
    return Caminho(pts, range(len(pts)) if ancoras is None else ancoras, z, [d] * len(pts))


def arco_pts(cx, cy, r, a0, a1, n):
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * k / n)),
             cy + r * math.sin(math.radians(a0 + (a1 - a0) * k / n))) for k in range(n + 1)]


def caminho_curva(ext_fim=2):
    """Curva de 45° à direita num bloco de 2 × 2 (origem no centro): entra pela borda sul em x = −7,5 rumo ao norte e
    sai pelo canto nordeste (15, 15) rumo a nordeste. Devolve o caminho (estendido 6 m antes da entrada e ext_fim
    módulos depois da saída) e os índices da entrada e da saída."""
    cx, cy = -H + R_CURVA, -Q
    arco = arco_pts(cx, cy, R_CURVA, 180, 135, 22)   # de (−7,5, −15) a (−2,2, −2,2)
    pts = [(-H, -Q - 6.0)] + arco + [(Q, Q)]
    # tangentes exatas (rumo norte na entrada, a do arco, nordeste na reta): o deslocamento das bordas fica exato
    tg = [(0.0, 1.0)] + [(math.sin(math.radians(45 * k / 22)), math.cos(math.radians(45 * k / 22)))
                         for k in range(23)] + [DIAG]
    i_ent, i_sai = 1, len(pts) - 1
    for k in range(1, ext_fim + 1):
        pts.append((Q + Q * k, Q + Q * k))
        tg.append(DIAG)
    anc = [i_ent] + list(range(i_sai, len(pts)))
    return Caminho(pts, anc, tang=tg), i_ent, i_sai


def comprimentos(pts):
    return ae.comprimentos(pts)


def trecho(pts, S, s1, s2, zs=None):
    """Sub-polilinha entre os comprimentos s1 e s2 (com z interpolado se zs)."""
    out = []

    def em(s):
        for i in range(len(S) - 1):
            if S[i] - 1e-9 <= s <= S[i + 1] + 1e-9:
                u = (s - S[i]) / max(1e-12, S[i + 1] - S[i])
                p = _interp(pts[i], pts[i + 1], u)
                z = None if zs is None else zs[i] + (zs[i + 1] - zs[i]) * u
                return p, z
        i = 0 if s < S[0] else len(S) - 1
        return pts[i], (None if zs is None else zs[i])

    p, z = em(s1)
    out.append((p[0], p[1], z))
    for i in range(len(S)):
        if s1 + 1e-6 < S[i] < s2 - 1e-6:
            out.append((pts[i][0], pts[i][1], None if zs is None else zs[i]))
    p, z = em(s2)
    out.append((p[0], p[1], z))
    return out


# =====================================================================================================================
# Desenho de uma peça de chão: lajes, meios-fios e pinturas em coordenadas da peça, recortados no retângulo dela
# =====================================================================================================================
class Desenho:
    def __init__(self):
        self.lajes = []    # (poly2d, z_topo, cor)
        self.guias = []    # (pts2d, zs) meio-fio (perfil simétrico)
        self.tinta = []    # (poly3d, cor)
        self.enfeites = []  # objetos prontos (já dentro da peça)

    def laje(self, poly, z, cor):
        self.lajes.append(([(p[0], p[1]) for p in poly], z, cor))

    def espelha(self):
        self.lajes = [([(-x, y) for x, y in p], z, c) for p, z, c in self.lajes]
        self.guias = [([(-x, y) for x, y in g[0]][::-1], g[1][::-1]) + ((([(-t[0], t[1]) for t in g[2]][::-1],)
                      if len(g) > 2 and g[2] else ())) for g in self.guias]
        self.tinta = [([(-q[0], q[1], q[2]) for q in p], c) for p, c in self.tinta]

    def monta(self, it, ret):
        for i, (poly, z, cor) in enumerate(self.lajes):
            p = corta_ret(poly, ret)
            if p:
                it.add(cb.laje(p, z, cor, nome=f"laje_{cor}"))
        m = ae.Malha()
        n = 0
        for poly, cor in self.tinta:
            p = corta_ret(poly, ret)
            if p:
                m.poligono(p, cor)
                n += 1
        if n:
            it.add(m.obj("tinta"))
        else:
            m.bm.free()
        for g in self.guias:
            pts, zs = g[0], g[1]
            ob = meio_fio(pts, zs, tang=g[2] if len(g) > 2 else None)
            ob = corta_obj(ob, ret)
            if ob:
                it.add(ob)
        it.add(self.enfeites)


def meio_fio(pts, zs, nome="meio_fio", tang=None):
    """Meio-fio boleado da base (20 cm, de −0,12 a +0,10 da calçada), fechado embaixo, por uma linha com altura zs
    (topo da calçada em cada vértice)."""
    zs = zs if isinstance(zs, (list, tuple)) else [zs] * len(pts)
    perfil = [(-0.10, 0.03), (-0.07, 0.085), (0.0, 0.10), (0.07, 0.085), (0.10, 0.03)]
    return ae.varre(pts, zs, perfil, ["calcada"] * 4, fundo=[z - 0.12 for z in zs], lado="calcada", base="calcada",
                    nome=nome, liso=True, angulo=50, tang=tang)


def corta_obj(ob, ret, tampa=True):
    """Recorta um objeto 3D no prisma vertical do retângulo ret (x0, y0, x1, y1), fechando o corte (tampa)."""
    x0, y0, x1, y1 = ret
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    for co, no in (((x0, 0, 0), (-1, 0, 0)), ((x1, 0, 0), (1, 0, 0)), ((0, y0, 0), (0, -1, 0)),
                   ((0, y1, 0), (0, 1, 0))):
        if not bm.verts:
            break
        if all((V(v.co) - V(co)).dot(V(no)) <= 1e-6 for v in bm.verts):
            continue
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        r = bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-6, plane_co=co, plane_no=no, clear_outer=True)
        if tampa:
            borda = [e for e in r["geom_cut"] if isinstance(e, bmesh.types.BMEdge) and e.is_valid and e.is_boundary]
            if borda:
                novos = bmesh.ops.holes_fill(bm, edges=borda, sides=0)["faces"]
                uvl = bm.loops.layers.uv.active
                for f in novos:
                    viz = [lf for e in f.edges for lf in e.link_faces if lf is not f]
                    if viz and uvl is not None:
                        f.material_index = viz[0].material_index
                        uv = viz[0].loops[0][uvl].uv.copy()
                        for lo in f.loops:
                            lo[uvl].uv = uv
    if not bm.faces:
        bm.free()
        me = ob.data
        bpy.data.objects.remove(ob)
        bpy.data.meshes.remove(me)
        return None
    liso = any(f.smooth for f in bm.faces)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(ob.data)
    bm.free()
    if liso:   # as arestas novas do corte não têm a marca de quina: refaz (senão a tampa entorta a sombra do trecho)
        ob.data.shade_smooth()
        ob.data.set_sharp_from_angle(angle=math.radians(50))
    ob.data.update()
    return ob


def faixa_pintada(D, pts, zs, off, larg, cor="branco", tracejada=False, ancoras=None, tang=None, dz=cb.ALT_TINTA):
    """Pintura ao longo da linha pts (2D) deslocada de off (> 0 à direita), em z = zs + dz. Tracejada: em cada trecho
    entre âncoras consecutivas cabem n períodos inteiros (n = comprimento / 5 arredondado), traço = vão, com o meio de
    um vão em cada âncora (as bordas da peça)."""
    ts = tang or ae.tangentes(pts)
    lin = [(p[0] + t.y * off, p[1] - t.x * off) for p, t in zip(pts, ts)]
    S = comprimentos(lin)
    if tracejada:
        trechos = []
        for ia, ib in zip(ancoras, ancoras[1:]):
            A, B = S[ia], S[ib]
            n = max(1, round((B - A) / 5.0))
            P = (B - A) / n
            trechos += [(A + (k + 0.5) * P - P / 4, A + (k + 0.5) * P + P / 4) for k in range(n)]
    else:
        trechos = [(S[0], S[-1])]
    for s1, s2 in trechos:
        sub = trecho(lin, S, s1, s2, zs)
        if len(sub) < 2:
            continue
        tt = ae.tangentes([(p[0], p[1]) for p in sub])
        esq = [(p[0] - t.y * larg / 2, p[1] + t.x * larg / 2, p[2] + dz) for p, t in zip(sub, tt)]
        dir_ = [(p[0] + t.y * larg / 2, p[1] - t.x * larg / 2, p[2] + dz) for p, t in zip(sub, tt)]
        for k in range(len(sub) - 1):
            D.tinta.append(([esq[k], dir_[k], dir_[k + 1], esq[k + 1]], cor))


def estrada(D, cam, perfil, lados=(True, True), marcas=True, guias=(True, True), calcada="calcada"):
    """Rua pelo caminho cam (alturas cam.z = topo da calçada; asfalto 0,10 abaixo): asfalto, calçadas até 7,50 na
    perpendicular, meios-fios e pinturas (iguais às da cb.marcacoes_reta, tracejado ancorado)."""
    a, m = perfil["asf"], perfil["mf"]
    esq_m, dir_m = cam.desloca(-m), cam.desloca(m)
    esq_h, dir_h = cam.desloca(-H), cam.desloca(H)
    z0 = cam.z[0]
    D.laje(esq_m + dir_m[::-1], z0 + ZA, "asfalto")
    if lados[0]:
        D.laje(esq_h + esq_m[::-1], z0, calcada)
    if lados[1]:
        D.laje(dir_m + dir_h[::-1], z0, calcada)
    if guias[0]:
        D.guias.append((esq_m, cam.z, [(t.x, t.y) for t in cam.t]))
    if guias[1]:
        D.guias.append((dir_m, cam.z, [(t.x, t.y) for t in cam.t]))
    if marcas:
        marcacoes(D, cam, perfil)


def marcacoes(D, cam, perfil, centro=True, bordo=(True, True)):
    a = perfil["asf"]
    za = [z + ZA for z in cam.z]
    k = dict(ancoras=cam.anc, tang=cam.t)
    if centro:
        if perfil["faixas"] == 2:
            faixa_pintada(D, cam.pts, za, 0.0, cb.LARG_FAIXA, tracejada=True, **k)
        else:
            for o in (-0.12, 0.12):
                faixa_pintada(D, cam.pts, za, o, cb.LARG_FAIXA, **k)
            for o in (-a / 2 + 0.06, a / 2 - 0.06):
                faixa_pintada(D, cam.pts, za, o, cb.LARG_FAIXA, tracejada=True, **k)
    for lado, o in ((0, -(a - 0.3)), (1, a - 0.3)):
        if bordo[lado]:
            faixa_pintada(D, cam.pts, za, o, 0.12, **k)


def faixas_rolamento(cam, perfil, i0, i1, z_extra=0.0, passo=2.5, nomes=("ida", "volta")):
    """Centro de cada faixa entre os vértices i0 e i1 do caminho: as de ida (sentido do caminho) à direita do eixo, as
    de volta à esquerda e no sentido contrário. Pontos [x, y, z] com z no asfalto."""
    a = perfil["asf"]
    n = perfil["faixas"] // 2
    w = a / n
    out = []
    pts = cam.pts[i0:i1 + 1]
    zs = [z + ZA + z_extra for z in cam.z[i0:i1 + 1]]
    ts = cam.t[i0:i1 + 1]
    S = comprimentos(pts)
    nseg = max(1, round(S[-1] / passo))
    amostras = []
    for k in range(nseg + 1):
        s = S[-1] * k / nseg
        for i in range(len(S) - 1):
            if S[i] - 1e-9 <= s <= S[i + 1] + 1e-9:
                u = (s - S[i]) / max(1e-12, S[i + 1] - S[i])
                p = _interp(pts[i], pts[i + 1], u)
                t = (ts[i].lerp(ts[i + 1], u)).normalized()
                z = zs[i] + (zs[i + 1] - zs[i]) * u
                amostras.append((p, t, z))
                break
    for j in range(n):
        off = w * (j + 0.5)
        ida = [[round(p[0] + t.y * off, 3), round(p[1] - t.x * off, 3), round(z, 3)] for p, t, z in amostras]
        volta = [[round(p[0] - t.y * off, 3), round(p[1] + t.x * off, 3), round(z, 3)] for p, t, z in amostras][::-1]
        out.append({"nome": f"{nomes[0]}_{j + 1}", "pontos": ida})
        out.append({"nome": f"{nomes[1]}_{j + 1}", "pontos": volta})
    return out


def espelha_faixas(fx):
    """Espelho em x: a faixa troca de lado, então o sentido inverte para continuar na mão direita."""
    out = []
    for f in fx:
        pts = [[-p[0], p[1], p[2]] for p in f["pontos"]][::-1]
        nome = f["nome"].replace("ida", "@").replace("volta", "ida").replace("@", "volta")
        out.append({"nome": nome, "pontos": pts})
    return sorted(out, key=lambda f: f["nome"])


# =====================================================================================================================
# Acabamento das sobras da quadra: calçada com juntas (como piso_calcada_lisa) ou grama com tufos
# =====================================================================================================================
def resto(D, polys, tipo, ret, semente=1, juntas=True):
    """Sobras da quadra (fora da faixa da rua) em calçada ou grama, em z = 0."""
    cor = "calcada" if tipo == "calcada" else "grama"
    for p in polys:
        p = corta_ret(p, ret)
        if p:
            D.laje(p, 0.0, cor)
            if tipo == "calcada" and juntas:
                juntas_calcada(D, p, ret)
            elif tipo == "grama":
                # sem as faixas de corte da piso_grama: elas não são simétricas e estas peças vão giradas de 90 e 180
                tufos_grama(D, p, semente)


def intervalos_linha(poly, eixo, c):
    """Trechos da linha (x = c se eixo 0, y = c se eixo 1) dentro do polígono (qualquer, par-ímpar)."""
    cortes = []
    n = len(poly)
    for i in range(n):
        p, q_ = poly[i], poly[(i + 1) % n]
        a, b = p[eixo] - c, q_[eixo] - c
        if (a < 0) != (b < 0):
            t = a / (a - b)
            cortes.append(p[1 - eixo] + (q_[1 - eixo] - p[1 - eixo]) * t)
    cortes.sort()
    return [(cortes[k], cortes[k + 1]) for k in range(0, len(cortes) - 1, 2)]


def juntas_calcada(D, poly, ret):
    """Juntas da calçada a cada 1,5 m alinhadas com a grade, com meia junta junto da borda da peça (as mesmas da
    piso_calcada_lisa: com a vizinha formam a junta inteira), recortadas na sobra (qualquer forma). Cada junta é
    recortada como as duas linhas das bordas dela, pegando só o trecho comum (a junta não sai da sobra)."""
    x0, y0, x1, y1 = ret
    passo = 1.5
    w = 0.018
    for eixo in (0, 1):
        a0, a1 = (x0, x1) if eixo == 0 else (y0, y1)
        cs = []
        for nq in range(int(round((a1 - a0) / Q))):   # como peças de piso_calcada_lisa lado a lado
            base = a0 + Q * nq
            cs += [base + 0.02] + [base + passo * k for k in range(1, 10)] + [base + Q - 0.02]
        z = 0.002 + 0.0005 * eixo
        for c in cs:
            ia = intervalos_linha(poly, eixo, c - w)
            ib = intervalos_linha(poly, eixo, c + w)
            for u0, u1 in ia:
                for v0, v1 in ib:
                    lo, hi = max(u0, v0), min(u1, v1)
                    if hi - lo > 0.03:
                        if eixo == 0:
                            tira = [(c - w, lo, z), (c + w, lo, z), (c + w, hi, z), (c - w, hi, z)]
                        else:
                            tira = [(lo, c - w, z), (hi, c - w, z), (hi, c + w, z), (lo, c + w, z)]
                        D.tinta.append((tira, "concreto"))


def listras_grama(D, poly, ret):
    """Faixas de corte da grama (verde_claro, 2,5 m a cada 5 m em x, 2 mm acima), as mesmas da piso_grama."""
    x0, x1 = ret[0], ret[2]
    for nq in range(int(round((x1 - x0) / Q))):
        for k in range(3):
            a = x0 + Q * nq + 5 * k + 2.5
            p = [(q[0], q[1], 0.002) for q in poly]
            p = corta_semiplano(p, lambda q, a=a: a - q[0])
            p = corta_semiplano(p, lambda q, a=a: q[0] - (a + 2.5)) if len(p) >= 3 else []
            p = limpa_poly(p) if len(p) >= 3 else []
            if p:
                D.tinta.append((p, "verde_claro"))


def tufos_grama(D, poly, semente):
    rnd = random.Random(semente)
    area = abs(area2([(p[0], p[1]) for p in poly]))
    n = min(10, int(area / 30) + 1)
    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    feitos = 0
    tent = 0
    while feitos < n and tent < 200:
        tent += 1
        x, y = rnd.uniform(min(xs), max(xs)), rnd.uniform(min(ys), max(ys))
        if dentro((x, y), poly) and dist_borda((x, y), poly) > 0.7:
            if feitos % 6 == 5:
                D.enfeites += cr.flores(x, y, rnd.choice([("amarelo", "branco"), ("lilas", "branco"),
                                                          ("rosa_bebe", "amarelo")]))
            else:
                D.enfeites += cr.tufo(x, y)
            feitos += 1


def linha_borda(D, pts, cor="concreto", larg=0.06):
    """Frisos de 6 cm na calçada (limite da calçada da rua com a sobra), 2 mm acima."""
    faixa_pintada(D, pts, [0.0] * len(pts), 0.0, larg, cor=cor, dz=0.002)


# =====================================================================================================================
# Peças de chão
# =====================================================================================================================
RET1 = (-H, -H, H, H)
RET2 = (-Q, -Q, Q, Q)
C_BORDA = H * S2      # |x − y| da borda da calçada da diagonal (10,607)


def p_diagonal(it, perfil, tipo):
    """Rua diagonal: eixo do canto sudoeste ao nordeste."""
    D = Desenho()
    cam = caminho_reto((0, 0), DIAG, [-1.5 * LD, -0.5 * LD, 0.5 * LD, 1.5 * LD])
    estrada(D, cam, perfil)
    sq = cb.quadrado(-H, -H, H, H)
    r1 = corta_semiplano(sq, lambda p: C_BORDA - (p[0] - p[1]))
    r2 = corta_semiplano(sq, lambda p: (p[0] - p[1]) + C_BORDA)
    resto(D, [r1, r2], tipo, RET1, semente=3)
    if tipo == "calcada":
        for c in (C_BORDA, -C_BORDA):
            linha_borda(D, [(-30 + c / 2, -30 - c / 2), (30 + c / 2, 30 - c / 2)])
    D.monta(it, RET1)
    return {"faixas": faixas_rolamento(cam, perfil, 1, 2)}


def p_enchimento(it, perfil, tipo):
    """Enchimento: quadra vizinha da diagonal, com o triângulo da rua no canto noroeste (eixo pelo canto)."""
    D = Desenho()
    cam = caminho_reto((-H, H), DIAG, [-2 * LD, -LD, 0.0, LD, 2 * LD])
    estrada(D, cam, perfil)
    sq = cb.quadrado(-H, -H, H, H)
    r = corta_semiplano(sq, lambda p: (C_BORDA - Q) - (p[0] - p[1]))
    resto(D, [r], tipo, RET1, semente=5)
    if tipo == "calcada":
        c = C_BORDA - Q
        linha_borda(D, [(-30 + c / 2, -30 - c / 2), (30 + c / 2, 30 - c / 2)])
    D.monta(it, RET1)
    return {}


def resto_curva(cam):
    """Sobras do bloco 2 × 2 da curva: à direita e à esquerda da faixa da rua (polígonos que o recorte fecha)."""
    dh = cam.desloca(H)
    eh = cam.desloca(-H)
    xmax = max(p[0] for p in dh) + 5
    ymax = max(p[1] for p in eh) + 5
    direita = dh + [(xmax, dh[-1][1]), (xmax, dh[0][1])]
    esquerda = eh + [(eh[-1][0], ymax), (eh[0][0] - 0.0, ymax)]
    return direita, esquerda, dh, eh


def p_curva(it, perfil, tipo, lado="direita"):
    """Curva de 45° (2 × 2): entra pela borda sul na quadra sudoeste (x = −7,5) e sai pelo canto nordeste rumo à
    diagonal. A da esquerda é o espelho: entra em x = +7,5 e sai pelo canto noroeste. As sobras (juntas, faixas de
    corte da grama, árvores) entram depois do espelho, para seguir a grade das peças de piso."""
    D = Desenho()
    cam, i0, i1 = caminho_curva()
    estrada(D, cam, perfil)
    direita, esquerda, dh, eh = resto_curva(cam)
    eh = [p for p in eh if p[0] > -Q + 0.12]   # perto da tangência a borda corre junto do bloco
    fx = faixas_rolamento(cam, perfil, i0, i1)
    sx = 1
    if lado == "esquerda":
        D.espelha()
        fx = espelha_faixas(fx)
        sx = -1
        direita, esquerda, dh, eh = ([(-x, y) for x, y in pol] for pol in (direita, esquerda, dh, eh))
    resto(D, [direita, esquerda], tipo, RET2, semente=7 if lado == "direita" else 8)
    if tipo == "calcada":
        linha_borda(D, dh)
        linha_borda(D, eh)
    else:
        arvores_curva(D, sx)
    D.monta(it, RET2)
    return {"faixas": fx}


def p_bifurcacao(it, lado="direita"):
    """Bifurcação (2 × 2): a rua reta da grade atravessa a coluna oeste do bloco (x = −7,5, de sul a norte) e, logo
    depois da borda sul, um ramal sai à direita em curva de 45° até o canto nordeste (a mesma curva da peça de curva).
    Entre os dois fica uma ilha de calçada com o bico arredondado; quem desce do ramal dá a preferência. A da esquerda
    é o espelho (reta na coluna leste, ramal para o canto noroeste)."""
    perfil = RUA
    a_, m = perfil["asf"], perfil["mf"]
    D = Desenho()
    reta = caminho_reto((-H, -Q - 6.0), (0.0, 1.0), [0.0, 6.0, 21.0, 36.0, 42.0], ancoras=[1, 2, 3])
    ram, i0, i1 = caminho_curva()
    dir_m = ram.desloca(m)
    # asfalto: tudo entre a guia oeste da reta e a guia direita do ramal (a ilha fica por cima, 0,10 mais alta)
    D.laje([(-H - m, -Q - 6.0), (-H - m, 50.0), (dir_m[-1][0], 50.0)] + dir_m[::-1], ZA, "asfalto")
    D.laje([(-Q, -Q - 6.0), (-Q, 50.0), (-H - m, 50.0), (-H - m, -Q - 6.0)], 0.0, "calcada")   # calçada oeste
    D.laje(dir_m + ram.desloca(H)[::-1], 0.0, "calcada")                                       # calçada do ramal
    D.guias.append((reta.desloca(-m), reta.z, [(t.x, t.y) for t in reta.t]))
    D.guias.append((dir_m, ram.z, [(t.x, t.y) for t in ram.t]))
    # ilha: entre x = −3,75 (guia leste da reta) e a guia esquerda do ramal (x − y = −m·√2), bico arredondado
    xg = -H + m
    T = (xg, xg + m * S2)
    d = 40.0 / S2
    canto = mb._arredonda_cantos([(xg, 50.0), T, (T[0] + d, T[1] + d)], 1.1, 10)
    canto = [(p.x, p.y) for p in canto]
    ilha = canto + [(canto[-1][0], 50.0)]
    D.laje(ilha, 0.0, "calcada")
    D.guias.append((canto, [0.0] * len(canto)))
    # sobras: a sudeste do ramal e, dentro da ilha, a parte além da calçada do ramal (calçada com juntas)
    direita, esquerda, dh, eh = resto_curva(ram)
    resto(D, [direita], "calcada", RET2, semente=9)
    sobra_ilha = corta_semiplano(corta_semiplano(corta_ret(ilha, RET2), lambda q: -q[0]),
                                 lambda q: (q[0] - q[1]) + C_BORDA)
    if len(sobra_ilha) >= 3:
        juntas_calcada(D, sobra_ilha, RET2)
    linha_borda(D, dh)
    linha_borda(D, [(-30 - C_BORDA / 2, -30 + C_BORDA / 2), (30 - C_BORDA / 2, 30 + C_BORDA / 2)])
    # pinturas: eixo e bordo oeste da reta; bordo direito do ramal (desde a entrada); o "V" de bordos em volta do bico
    za = [ZA] * 5
    faixa_pintada(D, reta.pts, za, 0.0, cb.LARG_FAIXA, tracejada=True, ancoras=reta.anc, tang=reta.t)
    faixa_pintada(D, reta.pts, za, -(a_ - 0.3), 0.12, tang=reta.t)
    faixa_pintada(D, ram.pts, [ZA] * len(ram.pts), a_ - 0.3, 0.12, tang=ram.t)
    xb = -H + a_ - 0.3
    yv = xb + (a_ - 0.3) * S2               # onde o bordo esquerdo do ramal cruza o bordo leste da reta
    faixa_pintada(D, [(xb, yv), (xb, 30.0)], [ZA, ZA], 0.0, 0.12)
    faixa_pintada(D, [(xb, yv), (xb + 40 / S2, yv + 40 / S2)], [ZA, ZA], 0.0, 0.12)
    s0 = (T[0] + T[1]) / 2                  # projeção do bico no eixo do ramal (x = y)
    eixo = caminho_reto((s0, s0), DIAG, [0.0, (Q - s0) * S2, (2 * Q - s0) * S2], ancoras=[0, 1, 2])
    faixa_pintada(D, eixo.pts, [ZA] * 3, 0.0, cb.LARG_FAIXA, tracejada=True, ancoras=eixo.anc, tang=eixo.t)
    # dê a preferência na faixa de quem desce do ramal (à esquerda do eixo, rumo sudoeste)
    c0 = V((s0 + 0.9, s0 + 0.9))
    n_ = V((-1 / S2, 1 / S2))
    t_ = V(DIAG)
    o = 0.3
    while o + 0.45 <= a_ - 0.35:
        p0 = c0 + n_ * o
        q_ = [p0 - t_ * 0.15, p0 - t_ * 0.15 + n_ * 0.45, p0 + t_ * 0.15 + n_ * 0.45, p0 + t_ * 0.15]
        D.tinta.append(([(v.x, v.y, ZA + cb.ALT_TINTA) for v in q_], "branco"))
        o += 0.75
    fx = faixas_rolamento(reta, perfil, 1, 3, nomes=("reta_ida", "reta_volta")) + \
        faixas_rolamento(ram, perfil, i0, i1, nomes=("ramal_ida", "ramal_volta"))
    if lado == "esquerda":
        D.espelha()
        fx = espelha_faixas(fx)
    D.monta(it, RET2)
    return {"faixas": fx}


def arvores_curva(D, sx=1):
    """Duas árvores e uma moita na sobra grande de dentro da curva (canto sudeste do bloco; sx = −1 no espelho)."""
    for x, y, e in ((9.5, -9.0, 1.0), (12.0, -2.5, 0.85)):
        D.enfeites += [ae.arvore(sx * x, y, 0.0, esc=e)]
    D.enfeites += [ae.moita(sx * 5.0, -11.5, 0.0, esc=0.9)]


# =====================================================================================================================
# Registro (preenchido mais abaixo pelas peças elevadas)
# =====================================================================================================================
TOPO = cb.DIR_TOPO
T_D = ["modular", "diagonal"]


# =====================================================================================================================
# Peças elevadas. Construídas num referencial em que a rua corre em +Y (eixo em x = 0) e depois giradas de −45° em
# volta de Z (o +Y vira nordeste). Seção do tabuleiro igual em módulos, cabeceira e pontes de efeito.
# =====================================================================================================================
def anel_ponte(perfil):
    """Seção do tabuleiro (z relativo à calçada): calçadas, asfalto 0,10 abaixo, laje com abas e viga-caixão."""
    m = perfil["mf"]
    topo = [(-H, 0.0), (-m, 0.0), (-m, -0.10), (m, -0.10), (m, 0.0), (H, 0.0)]
    ct = ["calcada", "calcada", "asfalto", "calcada", "calcada"]
    resto_ = [(H, -0.80), (H - 0.25, -0.92), (5.3, -1.0), (4.6, -1.12), (4.0, -1.30), (-4.0, -1.30), (-4.6, -1.12),
              (-5.3, -1.0), (-(H - 0.25), -0.92), (-H, -0.80)]
    cc = ["concreto", "concreto"] + ["concreto_escuro"] * 7 + ["concreto", "concreto"]
    return topo + resto_, ct + cc


def gira45(objs, ang=-45.0, loc=(0, 0, 0)):
    for o in (objs if isinstance(objs, (list, tuple)) else [objs]):
        if o is not None:
            mb.transforma(o, loc=loc, rot=("Z", ang))
    return objs


def tabuleiro(it, cam, zs, perfil, neon=False, guarda=True, ancoras=None, postes=(), fase_post=0.0, col=None):
    """Tabuleiro pelo caminho cam (2D, em Y) com a calçada em zs (lista por vértice): laje, viga, frisos, meios-fios,
    pinturas, guarda-corpo e postes. Devolve a malha de colisão (topo e guarda-corpos) se col for uma ae.Malha."""
    pf, cs = anel_ponte(perfil)
    it.add(ae.varre(cam, zs, pf, cs, anel=True, nome="tabuleiro"))
    cor_friso = "m:neon" if neon else "branco"
    for s in (-1, 1):
        a, b = (H - 0.004, H + 0.012) if s > 0 else (-H - 0.012, -H + 0.004)
        it.add(ae.varre(cam, zs, [(a, -0.59), (b, -0.59)], [cor_friso], fundo=[z - 0.73 for z in zs], lado=cor_friso,
                        base=cor_friso, nome="friso"))
    m = perfil["mf"]
    for o in (-m, m):
        it.add(meio_fio(desl(cam, o), zs))
    D = Desenho()
    C = Caminho(cam, ancoras or [0, len(cam) - 1], zs)
    marcacoes(D, C, perfil)
    mm = ae.Malha()
    for poly, cor in D.tinta:
        mm.poligono(poly, cor)
    it.add(mm.obj("tinta"))
    if guarda:
        guarda_corpo(it, cam, zs, fase_post)
    for (y, lado) in postes:
        z = z_em(cam, zs, y)
        it.add(poste(lado * (H - 0.72), y, z0=z, ang=180 if lado > 0 else 0))
    if col is not None:
        topo = [(-H, 0.0), (-m, 0.0), (-m, -0.10), (m, -0.10), (m, 0.0), (H, 0.0)]
        ae.varre(cam, zs, topo, ["asfalto"] * 5, fundo=[z - 1.30 for z in zs], lado="asfalto", base="asfalto", m=col)
        for s in (-1, 1):
            x0, x1 = sorted((s * (H - 0.33), s * H))
            ae.varre(cam, zs, [(x0, 1.1), (x1, 1.1)], ["asfalto"], fundo=list(zs), lado="asfalto", base="asfalto",
                     m=col)


def poste(x, y, z0=0.0, ang=0.0, alt=5.6, braco=1.8, cor="cinza_azulado"):
    """Poste de luz leve (~150 triângulos): base, haste afinando, braço curvo e luminária com a lâmpada em 'luz'."""
    dx, dy = math.cos(math.radians(ang)), math.sin(math.radians(ang))
    top = z0 + 0.3 + alt
    ps = [mb.cilindro(0.16, 0.32, x=x, y=y, z=z0, cor="grafite", seg=8, bisel=0.0),
          mb.cilindro(0.08, alt, x=x, y=y, z=z0 + 0.3, cor=cor, seg=8, r2=0.06, bisel=0.0),
          fp.varre([(x, y, top - 0.3), (x + dx * 0.35, y + dy * 0.35, top + 0.08), (x + dx * braco, y + dy * braco,
                    top + 0.12)], fp.sec_circ(0.045, 6), cor=cor, angulo=70, nome="braco")]
    lum = mb.caixa(0.66, 0.3, 0.16, cor=cor, bisel=0.04, seg=1)
    luz = mb.caixa(0.52, 0.2, 0.03, cor=None, mat="luz", bisel=0.0)
    for o, dz in ((lum, 0.02), (luz, -0.005)):
        mb.transforma(o, rot=("Z", ang))
        mb.transforma(o, loc=(x + dx * braco, y + dy * braco, top + dz))
    return mb.junta(ps + [lum, luz], "poste")


def desl(cam, off):
    return [(p[0] + off, p[1]) for p in cam]   # caminhos dos tabuleiros são retos em Y


def z_em(cam, zs, y):
    for i in range(len(cam) - 1):
        if cam[i][1] - 1e-9 <= y <= cam[i + 1][1] + 1e-9:
            u = (y - cam[i][1]) / max(1e-12, cam[i + 1][1] - cam[i][1])
            return zs[i] + (zs[i + 1] - zs[i]) * u
    return zs[-1] if y > cam[-1][1] else zs[0]


def guarda_corpo(it, cam, zs, fase=0.0, passo=LD / 8):
    """Guarda-corpo de 1,10 m: mureta de concreto boleada (0,42 m) na borda da calçada, montantes a cada LD/8
    (2,65 m, com meio passo em cada corte da diagonal: continua de um módulo para o outro) e dois tubos."""
    y0, y1 = cam[0][1], cam[-1][1]
    for s in (-1, 1):
        if s > 0:
            pf = [(H - 0.33, 0.0), (H - 0.33, 0.36), (H - 0.28, 0.42), (H - 0.05, 0.42), (H, 0.37), (H, 0.0)]
        else:
            pf = [(-H, 0.0), (-H, 0.37), (-H + 0.05, 0.42), (-H + 0.28, 0.42), (-H + 0.33, 0.36), (-H + 0.33, 0.0)]
        it.add(ae.varre(cam, zs, pf, ["concreto"] * 5, fundo=[z - 0.02 for z in zs], lado="concreto",
                        base="concreto", nome="mureta"))
        x = s * (H - 0.17)
        idx = list(range(0, len(cam), 2)) + ([len(cam) - 1] if (len(cam) - 1) % 2 else [])
        for h, r in ((1.10, 0.045), (0.78, 0.028)):
            pts = [(x, cam[i][1], zs[i] + h) for i in idx]
            it.add(fp.varre(pts, fp.sec_circ(r, 6), cor="metal", angulo=80, nome="tubo"))
        k0 = math.ceil((y0 - fase) / passo - 0.5 - 1e-6)
        k1 = math.floor((y1 - fase) / passo - 0.5 + 1e-6)
        for k in range(k0, k1 + 1):
            y = fase + (k + 0.5) * passo
            if y0 + 0.05 < y < y1 - 0.05:
                z = z_em(cam, zs, y)
                it.add(mb.caixa(0.06, 0.06, 0.72, x=x, y=y, z=z + 0.40, cor="metal", bisel=0.0, liso=False))


def pilar_mar(it, y, z_topo, largura=9.2, cor="concreto", base=-1.9):
    """Pilar em martelo para água: sapata no fundo, bloco de coroamento 0,45 m acima da lâmina (−1,0), fuste
    arredondado e travessa (corre em X, na perpendicular da rua) sob a viga."""
    if base < -1.3:   # na água
        it.add(fp.caixa(4.6, 3.6, -1.30 - base, x=0, y=y, z=base, cor="concreto_escuro", bisel=0.1))
        it.add(fp.caixa(5.2, 4.0, 0.75, x=0, y=y, z=-1.30, cor="concreto_escuro", bisel=0.14))
        z_fuste = -0.6
    else:             # no chão: sapata rasa aparecendo 10 cm
        it.add(fp.caixa(4.2, 3.4, 0.5, x=0, y=y, z=-0.4, cor="concreto_escuro", bisel=0.1))
        z_fuste = 0.05
    zt = z_topo
    it.add(fp.varre([(0, y, z_fuste), (0, y, zt - 1.0)], fp.sec_ret(1.7, 2.6, 0.6), cor=cor, n0=(0, 1, 0), nome="fuste"))
    it.add(fp.varre([(0, y, zt - 1.1), (0, y, zt - 0.6), (0, y, zt)], fp.sec_ret(1.7, 2.6, 0.4), cor=cor,
                    n0=(0, 1, 0), escala=lambda t: (1.0, 1 + (largura / 2.6 - 1) * fp.smooth(t) ** 0.6),
                    nome="travessa"))


def caixas_faixa(s0, s1, z0, z1, n, larg=Q):
    """Caixas de colisão (AABB) de um trecho da diagonal de s0 a s1 (eixo pelo centro da peça, rumo nordeste)."""
    out = []
    for k in range(n):
        a = s0 + (s1 - s0) * k / n
        b = s0 + (s1 - s0) * (k + 1) / n
        c = (a + b) / 2 / S2
        lado = ((b - a) + larg) / S2
        out.append(((c, c, z0), (lado, lado, z1 - z0)))
    return out


def caixa_pilar(y, z_topo, l=5.2, p=4.0, base=-1.9):
    """Caixa do pilar girado de 45° (a AABB do bloco)."""
    c = y / S2
    lado = (l + p) / S2
    return ((c, c, base), (lado, lado, z_topo - base))


def colisao_malha_girada(it, col, nome):
    ob = col.obj(nome)
    gira45(ob)
    it.colisao_malha(ob, nome)


def p_modulo(it, perfil, pilar=True, neon=False):
    """Módulo de tabuleiro diagonal: de canto a canto da quadra (21,21 m), calçada em z = 7,50, com ou sem pilar."""
    y0, y1 = -LD / 2, LD / 2
    cam = [(0, y0), (0, y1)]
    zs = [ZE, ZE]
    col = ae.Malha()
    tabuleiro(it, cam, zs, perfil, neon=neon, postes=((0.0, 1), (0.0, -1)), fase_post=-LD / 2, col=col)
    if pilar:
        pilar_mar(it, 0.0, ZE - 1.30, largura=9.2 if perfil is RUA else 11.0)
    gira45(it.partes)
    colisao_malha_girada(it, col, "colisao_tabuleiro")
    caixas = caixas_faixa(-LD / 2, LD / 2, ZE - 1.30, ZE + 1.1, 3)
    if pilar:
        caixas.append(caixa_pilar(0.0, ZE - 1.30))
    it.colisao(caixas)
    fx = faixas_reta(-LD / 2, LD / 2, ZE, perfil)
    return {"faixas": fx, "z_elevado": ZE}


def faixas_reta(s0, s1, z, perfil, n=None):
    cam = caminho_reto((0, 0), DIAG, [s0, s1], z=z)
    return faixas_rolamento(cam, perfil, 0, 1)


# ------------------------------------------------------------------------------------------------- cabeceira
# Bloco 4 × 4 (60 m): a diagonal do bloco tem 84,85 m. Plana nos primeiros 7,5 m (a seção inteira já está dentro do
# bloco, então os enchimentos de chão do canto ficam em z = 0), concordância parabólica de 14 m, rampa constante de
# 11,8 % e outra concordância de 14 m até ficar plana em 7,50 no canto alto. Média de 9,7 % nos 77,35 m de subida.
N_CAB = 4
S_PLANO = H                 # trecho plano no começo
S_FIM = N_CAB * LD          # canto nordeste do bloco (z = 7,50)
S_ENC = S_FIM / 2           # encontro (fim do aterro, z = 3,3) no centro do bloco
L_CONC = 14.0               # concordâncias verticais
G_CAB = ZE / (S_FIM - S_PLANO - L_CONC)   # rampa do trecho reto (0,118)


def z_cabeceira(s):
    u = s - S_PLANO
    L = S_FIM - S_PLANO
    if u <= 0:
        return 0.0
    if u < L_CONC:
        return G_CAB * u * u / (2 * L_CONC)
    if u <= L - L_CONC:
        return G_CAB * L_CONC / 2 + G_CAB * (u - L_CONC)
    if u >= L:
        return ZE
    return ZE - G_CAB * (L - u) ** 2 / (2 * L_CONC)


def p_cabeceira(it, perfil, tipo):
    """Cabeceira diagonal (4 × 4): rua no chão no canto sudoeste, sobe em aterro até o centro do bloco (encontro) e
    segue em tabuleiro sobre dois pilares até o canto nordeste, na cota das pontes (7,50), plana na ponta. A ponta alta
    é o corte perpendicular pelo canto, como nos módulos (passa para os triângulos das quadras vizinhas)."""
    B = N_CAB * H                         # meia largura do bloco (30 m)
    RETB = (-B, -B, B, B)
    p_sw = (-B, -B)
    D = Desenho()
    cam_chao = caminho_reto(p_sw, DIAG, [-LD, 0.0, S_PLANO])
    cam_chao.anc = [0, 1]
    estrada(D, cam_chao, perfil, marcas=False, guias=(False, False))
    sq = cb.quadrado(-B, -B, B, B)
    r1 = corta_semiplano(sq, lambda p: C_BORDA - (p[0] - p[1]))
    r2 = corta_semiplano(sq, lambda p: (p[0] - p[1]) + C_BORDA)
    sob = corta_semiplano(corta_semiplano(corta_semiplano(sq, lambda p: -(p[0] + p[1])),
                                          lambda p: (p[0] - p[1]) - C_BORDA), lambda p: -(p[0] - p[1]) - C_BORDA)
    resto(D, [r1, r2, sob], tipo, RETB, semente=11)
    # estações comuns (aterro, tabuleiro, pinturas, meios-fios, guarda-corpo): a pintura fica 4 mm acima do asfalto.
    # Os múltiplos de LD entram como estações (âncoras do tracejado, iguais às dos módulos).
    passo = 1.25
    marcos = [S_PLANO] + [k * LD for k in range(1, N_CAB + 1)]
    est = [S_PLANO]
    for a, b in zip(marcos, marcos[1:]):
        n = max(1, round((b - a) / passo))
        est += [a + (b - a) * k / n for k in range(1, n + 1)]
    i_enc = min(range(len(est)), key=lambda i: abs(est[i] - S_ENC))
    ss = [-LD, 0.0] + est
    zz = [z_cabeceira(max(0.0, s)) for s in ss]
    camt = caminho_reto(p_sw, DIAG, ss, z=zz)
    camt.anc = [1] + [2 + min(range(len(est)), key=lambda i: abs(est[i] - k * LD)) for k in range(1, N_CAB + 1)]
    Dt = Desenho()
    marcacoes(Dt, camt, perfil)
    D2 = Desenho()
    for poly, cor in Dt.tinta:
        sc = sum((q_[0] + q_[1]) for q_ in poly) / len(poly) / S2 + S2 * B   # s do centro do quadrilátero
        (D.tinta if sc <= S_PLANO + 1e-6 else D2.tinta).append((poly, cor))
    m = perfil["mf"]
    i_pl = 2
    tg = [(t.x, t.y) for t in camt.t]
    for o in (-m, m):
        lin = camt.desloca(o)
        D.guias.append((lin[:i_pl + 1], camt.z[:i_pl + 1], tg[:i_pl + 1]))
        D2.guias.append((lin[i_pl:], camt.z[i_pl:], tg[i_pl:]))
    D.monta(it, RETB)
    D2.monta(it, (-3 * B, -3 * B, 3 * B, 3 * B))
    # rampa no referencial em Y (y = s − S_ENC; o encontro fica no centro do bloco) e girada
    ya = [s - S_ENC for s in est[:i_enc + 1]]
    za = [z_cabeceira(s) for s in est[:i_enc + 1]]
    cam_a = [(0.0, y) for y in ya]
    pa = []

    def pf(i):
        return ae.anel_tabuleiro(perfil, zrel_fundo=ZF - za[i])[0]

    cs = ae.anel_tabuleiro(perfil, zrel_fundo=-1.0)[1]
    pa.append(ae.varre(cam_a, za, pf, cs, anel=True, nome="aterro"))
    yt = [s - S_ENC for s in est[i_enc:]]
    zt = [z_cabeceira(s) for s in est[i_enc:]]
    cam_t = [(0.0, y) for y in yt]
    pf_t, cs_t = anel_ponte(perfil)
    pa.append(ae.varre(cam_t, zt, pf_t, cs_t, anel=True, nome="tabuleiro"))
    for sx in (-1, 1):
        a, b = (H - 0.004, H + 0.012) if sx > 0 else (-H - 0.012, -H + 0.004)
        pa.append(ae.varre(cam_t, zt, [(a, -0.59), (b, -0.59)], ["branco"], fundo=[z - 0.73 for z in zt],
                           lado="branco", base="branco", nome="friso"))
    it2 = mb.Item("tmp")
    i0 = next(i for i, z in enumerate(za) if z >= 0.06)
    guarda_corpo(it2, cam_a[i0:] + cam_t[1:], za[i0:] + zt[1:], fase=-S_ENC)
    pilares = [(k + 0.5) * LD for k in range(N_CAB // 2, N_CAB)]     # no meio das quadras da diagonal, sob o tabuleiro
    for sp in pilares:
        zp = z_cabeceira(sp)
        pilar_mar(it2, sp - S_ENC, zp - 1.30, largura=9.2 if perfil is RUA else 11.0, base=-0.4)
        for lado in (1, -1):
            it2.add(poste(lado * (H - 0.72), sp - S_ENC, z0=zp, ang=180 if lado > 0 else 0))
    sp0 = 1.5 * LD   # um par de postes também na rampa
    for lado in (1, -1):
        it2.add(poste(lado * (H - 0.72), sp0 - S_ENC, z0=z_cabeceira(sp0), ang=180 if lado > 0 else 0))
    for sj in [S_PLANO + 6.0 * k for k in range(1, 7)]:   # frisos verticais (juntas) nas paredes do aterro
        zt_ = z_cabeceira(sj) - 0.8
        if zt_ > 0.3 and sj < S_ENC - 1.0:
            for sx in (-1, 1):
                pa.append(mb.caixa(0.02, 0.12, zt_ - ZF, x=sx * (H - 0.012), y=sj - S_ENC, z=ZF, cor="concreto",
                                   bisel=0.0, seg=1))
    ze = z_cabeceira(S_ENC)
    pa.append(fp.caixa(Q - 0.2, 0.6, 0.25, x=0, y=0.3, z=ze - 1.55, cor="concreto_escuro", bisel=0.05))
    gira45(pa + it2.partes)
    it.add(pa, it2.partes)
    # colisão: laje do bloco (z = 0) e malha do aterro + tabuleiro + guarda-corpos (sem degraus)
    col = ae.Malha()
    topo = [(-H, 0.0), (-m, 0.0), (-m, -0.10), (m, -0.10), (m, 0.0), (H, 0.0)]
    camc = cam_a + cam_t[1:]
    zc = za + zt[1:]
    fundo = [max(ZF, z - 1.30) if y > 1e-6 else ZF for (x, y), z in zip(camc, zc)]
    ae.varre(camc, zc, topo, ["asfalto"] * 5, fundo=fundo, lado="asfalto", base="asfalto", m=col)
    for sx in (-1, 1):
        x0, x1 = sorted((sx * (H - 0.33), sx * H))
        ae.varre(camc[i0:], zc[i0:], [(x0, 1.1), (x1, 1.1)], ["asfalto"], fundo=zc[i0:], lado="asfalto",
                 base="asfalto", m=col)
    colisao_malha_girada(it, col, "colisao_rampa")
    caixas = [((0, 0, ZF), (2 * B, 2 * B, -ZF))] + caixas_faixa(0.0, S_FIM - S_ENC, 2.0, ZE + 1.1, 3)
    for sp in pilares:
        caixas.append(caixa_pilar(sp - S_ENC, z_cabeceira(sp) - 1.30, p=2.6, l=3.0, base=ZF))
    it.colisao(caixas)
    ssf = [k * S_FIM / 60 for k in range(61)]
    camf = caminho_reto(p_sw, DIAG, ssf, z=[z_cabeceira(s) for s in ssf])
    perfil_alt = [[round(s_, 2), round(z_cabeceira(s_), 3)] for s_ in [k * S_FIM / 24 for k in range(25)]]
    return {"faixas": faixas_rolamento(camf, perfil, 0, len(ssf) - 1, passo=2.0), "z_elevado": ZE,
            "perfil_altura_s": perfil_alt, "rampa": {"inclinacao_max": round(G_CAB, 4),
                                                     "inclinacao_media": round(ZE / (S_FIM - S_PLANO), 4),
                                                     "comprimento": round(S_FIM, 2)}}


# ------------------------------------------------------------------------------------------------- ponte estaiada
def p_estaiada(it, perfil=RUA):
    """Ponte estaiada diagonal (4 × 4 quadras, 84,9 m de tabuleiro): pilone branco em A estreito (Y invertido) no meio
    do vão. As duas pernas, largas e afuniladas, nascem separadas em blocos na água por fora do tabuleiro, sobem
    inclinadas deixando um olho alongado vazado acima da pista e se juntam 30 m acima dela numa agulha; uma cápsula
    oval com visor envolve a agulha. Estais em leque dos dois lados, frisos de neon e dois pilares de apoio."""
    L2 = 2 * LD
    cam = [(0, -L2), (0, -LD), (0, 0.0), (0, LD), (0, L2)]
    zs = [ZE] * 5
    col = ae.Malha()
    postes = [(y, sx) for y in (-1.5 * LD, -0.5 * LD, 0.5 * LD, 1.5 * LD) for sx in (-1, 1)]
    tabuleiro(it, cam, zs, perfil, neon=True, ancoras=[0, 1, 2, 3, 4], postes=postes, fase_post=-L2, col=col)
    for y in (-1.5 * LD, 1.5 * LD):
        pilar_mar(it, y, ZE - 1.30, largura=9.2 if perfil is RUA else 11.0, cor="porcelana_azul")
    zb = ZE - 1.30
    XB = 11.0          # pé das pernas (fora do tabuleiro)
    Z_JUNTA = ZE + 30.0
    for sx in (-1, 1):
        it.add(fp.caixa(5.4, 7.0, 0.7, x=sx * XB, y=0, z=-1.9, cor="concreto_escuro", bisel=0.12))
        it.add(fp.caixa(6.2, 7.8, 0.8, x=sx * XB, y=0, z=-1.35, cor="concreto_escuro", bisel=0.16))
        perna = [(sx * XB, 0, -0.9), (sx * 10.2, 0, ZE - 1.5), (sx * 7.4, 0, ZE + 10.0), (sx * 3.9, 0, ZE + 21.0),
                 (sx * 0.9, 0, Z_JUNTA - 1.2), (0.0, 0, Z_JUNTA + 0.6)]
        perna = mb._arredonda_cantos(perna, 5.0, 10)
        # u = ao longo da rua (Y), v = no plano do pilone: larga de lado (3,4 m) e afinando para cima
        it.add(fp.varre(perna, fp.sec_ret(4.2, 2.6, 0.8), cor="porcelana", n0=(0, 1, 0), nome="perna", angulo=35,
                        escala=lambda t: (1.0 - 0.5 * t, 1.0 - 0.5 * t)))
        for sy in (-1, 1):
            it.add(fp.varre(perna[1:-4], fp.sec_ret(0.05, 0.4, cu=sy * 2.12), cor=None, mat="neon", n0=(0, 1, 0),
                            escala=lambda t: (1.0 - 0.3 * t, 1.0), nome="neon"))
    # travessa sob o tabuleiro (a barra do A) e friso de neon nela
    it.add(fp.caixa(2 * 9.9, 3.0, 1.2, x=0, y=0, z=zb - 1.2, cor="porcelana", bisel=0.35, seg=2))
    # agulha: da junção das pernas até a ponta
    z_ag0, z_ag1 = Z_JUNTA - 1.5, Z_JUNTA + 20.0
    it.add(fp.varre([(0, 0, z_ag0), (0, 0, z_ag1)], fp.sec_ret(2.3, 1.6, 0.5), cor="porcelana", n0=(0, 1, 0),
                    escala=lambda t: (1 - 0.88 * t ** 1.3, 1 - 0.85 * t ** 1.3), nome="agulha"))
    # cápsula oval com visor (como a cabeça do pilone da referência), envolvendo a agulha
    zc = Z_JUNTA + 3.5
    it.add(mb.superelipsoide(5.4, 4.4, 12.0, x=0, y=0, z=zc, cor="porcelana", e=0.55, e_v=0.75, nu=24, nv=12,
                             nome="capsula"))
    it.add(mb.superelipsoide(4.0, 4.6, 8.8, x=0, y=0, z=zc + 1.8, cor=None, mat="janela_ciano", e=0.55, e_v=0.75,
                             nu=20, nv=10, nome="visor"))
    for sy in (-1, 1):
        it.add(fp.varre([(0, sy * 0.66, z_ag0 + 0.3), (0, sy * 0.66, zc - 0.2)], fp.sec_ret(0.3, 0.05), cor=None,
                        mat="neon", n0=(1, 0, 0), nome="neon"))
    # estais em leque, do alto das pernas e da agulha às duas bordas, nos dois sentidos
    n = 10
    for sy in (-1, 1):
        for k in range(n):
            ya = sy * (6.0 + 3.5 * k)
            za = Z_JUNTA - 4.0 + 1.25 * k
            xa = 0.0 if za > Z_JUNTA else 0.9 * (Z_JUNTA - za) / 4.0
            for sx in (-1, 1):
                it.add(fp.cabo((sx * xa, sy * 1.0, za), (sx * 6.55, ya, ZE + 0.2), r=0.05))
                it.add(mb.caixa(0.22, 0.32, 0.18, x=sx * 6.55, y=ya, z=ZE - 0.01, cor="grafite", bisel=0.0, liso=False))
    gira45(it.partes)
    colisao_malha_girada(it, col, "colisao_tabuleiro")
    caixas = caixas_faixa(-L2, L2, ZE - 1.30, ZE + 1.1, 3)
    for y in (-1.5 * LD, 1.5 * LD):
        caixas.append(caixa_pilar(y, ZE - 1.30))
    for sx in (-1, 1):   # pernas (girados: em volta de (±x / √2, ∓x / √2))
        for x, z0, z1, lado in ((10.0, -1.9, ZE + 8.0, 7.0), (4.8, ZE + 8.0, Z_JUNTA, 7.0)):
            caixas.append(((sx * x / S2, -sx * x / S2, z0), (lado, lado, z1 - z0)))
    caixas.append(((0, 0, Z_JUNTA), (5.6, 5.6, z_ag1 - Z_JUNTA)))
    it.colisao(caixas)
    return {"faixas": faixas_reta(-L2, L2, ZE, perfil), "z_elevado": ZE}


# ------------------------------------------------------------------------------------------------- ponte em laço
def fita_infinito(sx, XN, Y0, HA, W, n=48):
    """Eixo de uma das fitas: nasce em (sx·XN, −Y0) por fora do tabuleiro, abre um lóbulo para o lado dela, cruza o
    eixo da rua no alto e pousa do outro lado em (−sx·XN, +Y0). As duas fitas juntas desenham um 'infinito'."""
    out = []
    for k in range(n + 1):
        u = k / n
        x = sx * (XN * math.cos(math.pi * u) + W * math.sin(2 * math.pi * u))
        z = ZE + 0.3 + HA * math.sin(math.pi * u) ** 2.2   # lóbulos baixos dos lados, cruzamento alto
        out.append((x, -Y0 + 2 * Y0 * u, z))
    return out


def p_arco(it, perfil=RUA):
    """Ponte diagonal em laço (4 × 4 quadras, 84,9 m): duas fitas tubulares, uma branca e outra azul-clara, que
    nascem por fora do tabuleiro perto das pontas, abrem um lóbulo cada uma para o seu lado, se torcem e se cruzam no
    alto sobre a pista (uma passa 5 m por cima da outra), como um 'infinito'. Friso de neon fino nas bordas das fitas,
    pendurais até as bordas do tabuleiro e dois pilares que levam os pés das fitas."""
    L2 = 2 * LD
    cam = [(0, -L2), (0, -LD), (0, 0.0), (0, LD), (0, L2)]
    zs = [ZE] * 5
    col = ae.Malha()
    postes = [(y, sx) for y in (-1.5 * LD, 1.5 * LD) for sx in (-1, 1)]
    tabuleiro(it, cam, zs, perfil, neon=True, ancoras=[0, 1, 2, 3, 4], postes=postes, fase_post=-L2, col=col)
    Y0, XN, W = L2 - 5.0, 9.4, 10.0
    for y in (-Y0, Y0):
        pilar_mar(it, y, ZE - 1.30, largura=2 * XN + 2.6, cor="porcelana_azul")
        for sx in (-1, 1):   # consolo que leva o pé da fita
            it.add(fp.caixa(3.0, 3.6, 2.0, x=sx * XN, y=y, z=ZE - 1.6, cor="porcelana", bisel=0.3, seg=2))
    caixas = []
    for sx, HA, cor, cor_baixo in ((1, 24.5, "porcelana", "azul_bebe"), (-1, 19.0, "azul_bebe", "porcelana")):
        eixo = fita_infinito(sx, XN, Y0, HA, W)
        tor = (lambda t, sx=sx: sx * math.pi * 0.5 * math.sin(math.pi * t))   # torce até ficar em pé no cruzamento
        fita = fp.varre(eixo, fp.sec_ret(2.7, 1.0, 0.45, seg=3), cor=cor, n0=(1, 0, 0), torcao=tor, nome="fita",
                        angulo=40)
        mb.pinta_onde(fita, cor_baixo, lambda c, nn: nn.z < -0.35)
        it.add(fita)
        for su in (-1, 1):
            it.add(fp.varre(eixo[1:-1], fp.sec_ret(0.12, 0.16, cu=su * 1.36), cor=None, mat="neon", n0=(1, 0, 0),
                            torcao=tor, nome="neon_fita"))
        for k in range(4, len(eixo) - 4, 2):   # pendurais
            x, y, z = eixo[k]
            if abs(x) < 2.6 or abs(x) > 12.5 or z < ZE + 4.0:
                continue
            xs = math.copysign(6.55, x)
            it.add(fp.cabo((x - math.copysign(0.3, x), y, z - 0.6), (xs, y, ZE + 0.2), r=0.045))
            it.add(mb.caixa(0.2, 0.28, 0.16, x=xs, y=y, z=ZE - 0.01, cor="grafite", bisel=0.0, liso=False))
        # colisão aproximada da fita: uma caixa por metade (já girada para a diagonal: (x, y) -> ((x+y)/√2, (y−x)/√2))
        meio = len(eixo) // 2
        for parte in (eixo[:meio + 1], eixo[meio:]):
            pts = [((x + y) / S2, (y - x) / S2, z) for x, y, z in parte]
            lo = [min(p_[i] for p_ in pts) for i in range(3)]
            hi = [max(p_[i] for p_ in pts) for i in range(3)]
            caixas.append((((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, max(ZE + 1.1, lo[2] - 1.3)),
                           (hi[0] - lo[0] + 2.0, hi[1] - lo[1] + 2.0, hi[2] + 0.9 - max(ZE + 1.1, lo[2] - 1.3))))
    gira45(it.partes)
    colisao_malha_girada(it, col, "colisao_tabuleiro")
    caixas = caixas_faixa(-L2, L2, ZE - 1.30, ZE + 1.1, 4) + caixas
    for y in (-Y0, Y0):
        caixas.append(caixa_pilar(y, ZE - 1.30))
    it.colisao(caixas)
    return {"faixas": faixas_reta(-L2, L2, ZE, perfil), "z_elevado": ZE}


# =====================================================================================================================
# Registro
# =====================================================================================================================
ENC_DIAG = ("principal giro 0 na quadra (i, j): eixo do canto sudoeste ao nordeste; enchimento giro 0 em (i + 1, j) e "
            "giro 180 em (i, j + 1); a próxima principal em (i + 1, j + 1). Girado 90°: diagonal de sudeste a "
            "noroeste, com os enchimentos girados 90 e 270 nas posições giradas.")
ENC_ENCH = ("vai nas duas quadras do lado de cada canto por onde passa a diagonal: giro 0 a leste da principal (triângulo"
            " no canto noroeste), giro 180 ao norte dela (triângulo no canto sudeste).")
ENC_CURVA = ("bloco 2 × 2 (origem no centro): a rua reta chega pela borda sul na quadra {q} (x = {x}) e a diagonal sai "
             "pelo canto {c} (15·{sx}, 15) rumo a {r}; ali encostam a rua diagonal (na quadra além do canto) e os "
             "dois enchimentos (nas quadras ao lado do canto, fora do bloco).")
ENC_PONTE = ("módulo de canto a canto da quadra (21,21 m), pontas cortadas na perpendicular pelos cantos; giro 0 = "
             "nordeste. Encosta noutro módulo, na cabeceira ou na ponte de efeito pelo canto. O tabuleiro invade os "
             "triângulos das 4 quadras vizinhas a 7,50 m (água ou chão por baixo, sem enchimento).")
ENC_CAB = ("bloco 4 × 4: a rua diagonal de chão chega pelo canto sudoeste (rua_diagonal na quadra além do canto e os "
           "dois enchimentos de chão ao lado) e o tabuleiro sai a 7,50 m pelo canto nordeste, onde encosta o "
           "primeiro módulo de ponte. Do outro lado da água, gire 180 (alto no canto sudoeste).")
ENC_EST = ("bloco 4 × 4 com o pilone no centro (um canto da grade): ocupa o lugar de 4 módulos de ponte; as pontas "
           "são os cantos sudoeste e nordeste do bloco, a 7,50 m.")


def reg(id_, f, rot, grupo, tags, dmini=TOPO, quadras=(1, 1), encaixe="", col2=False):
    return dict(id=id_, f=f, rot=rot, grupo=grupo, tags=tags, dmini=dmini, quadras=list(quadras), encaixe=encaixe,
                col2=col2)


PONTE_DIR = (1.0, -0.62, 0.62)
PECAS = []
for _p, _n, _r in ((RUA, "rua", "Rua"), (AV, "avenida", "Avenida")):
    _t = T_D + [_n]
    PECAS += [
        reg(f"{_n}_diagonal", lambda it, p=_p: p_diagonal(it, p, "calcada"), f"{_r} diagonal", f"{_n}_diagonal", _t,
            encaixe=ENC_DIAG),
        reg(f"{_n}_diagonal_grama", lambda it, p=_p: p_diagonal(it, p, "grama"), f"{_r} diagonal (grama)",
            f"{_n}_diagonal", _t + ["grama"], encaixe=ENC_DIAG),
        reg(f"{_n}_diagonal_enchimento", lambda it, p=_p: p_enchimento(it, p, "calcada"),
            f"{_r} diagonal: enchimento", f"{_n}_diagonal_enchimento", _t + ["enchimento"], encaixe=ENC_ENCH),
        reg(f"{_n}_diagonal_enchimento_grama", lambda it, p=_p: p_enchimento(it, p, "grama"),
            f"{_r} diagonal: enchimento (grama)", f"{_n}_diagonal_enchimento", _t + ["enchimento", "grama"],
            encaixe=ENC_ENCH),
    ]
for _p, _n, _r, _tipos in ((RUA, "rua", "Rua", ("calcada", "grama")), (AV, "avenida", "Avenida", ("calcada",))):
    for _tipo in _tipos:
        for _lado, _q, _x, _c, _sx, _rr in (("direita", "sudoeste", "−7,5", "nordeste", "+1", "nordeste"),
                                            ("esquerda", "sudeste", "+7,5", "noroeste", "−1", "noroeste")):
            _suf = "" if _tipo == "calcada" else "_grama"
            PECAS.append(reg(
                f"{_n}_diagonal_curva_{_lado}{_suf}",
                lambda it, p=_p, t=_tipo, l=_lado: p_curva(it, p, t, l),
                f"{_r}: curva de 45° para a diagonal, à {_lado} (2 × 2){' (grama)' if _suf else ''}",
                f"{_n}_diagonal_curva_{_lado}", T_D + [_n, "curva", "2x2"] + (["grama"] if _suf else []),
                quadras=(2, 2), col2=True, encaixe=ENC_CURVA.format(q=_q, x=_x, c=_c, sx=_sx, r=_rr)))
ENC_BIF = ("bloco 2 × 2: a rua reta passa pela coluna {col} (x = {x}, bordas sul e norte com o perfil da rua) e o "
           "ramal sai pelo canto {c}, onde encostam a rua diagonal e os dois enchimentos, como na curva.")
for _lado, _col, _x, _c in (("direita", "oeste", "−7,5", "nordeste"), ("esquerda", "leste", "+7,5", "noroeste")):
    PECAS.append(reg(f"rua_diagonal_bifurcacao_{_lado}", lambda it, l=_lado: p_bifurcacao(it, l),
                     f"Rua: bifurcação para a diagonal, à {_lado} (2 × 2)", f"rua_diagonal_bifurcacao_{_lado}",
                     T_D + ["rua", "bifurcacao", "cruzamento", "2x2"], quadras=(2, 2), col2=True,
                     encaixe=ENC_BIF.format(col=_col, x=_x, c=_c)))
for _p, _n, _r in ((RUA, "rua", "rua"), (AV, "avenida", "avenida")):
    PECAS += [
        reg(f"ponte_diagonal_tabuleiro_{_n}", lambda it, p=_p: p_modulo(it, p, True),
            f"Ponte diagonal: tabuleiro com pilar ({_r})", f"ponte_diagonal_tabuleiro_{_n}",
            ["modular", "diagonal", "ponte", "elevado", _n], PONTE_DIR, encaixe=ENC_PONTE),
        reg(f"ponte_diagonal_vao_{_n}", lambda it, p=_p: p_modulo(it, p, False),
            f"Ponte diagonal: vão sem pilar ({_r})", f"ponte_diagonal_tabuleiro_{_n}",
            ["modular", "diagonal", "ponte", "elevado", _n], PONTE_DIR, encaixe=ENC_PONTE),
    ]
PECAS += [
    reg("ponte_diagonal_cabeceira_rua", lambda it: p_cabeceira(it, RUA, "grama"),
        "Ponte diagonal: cabeceira (rua, 4 × 4)", "ponte_diagonal_cabeceira",
        ["diagonal", "ponte", "elevado", "rampa", "rua", "4x4", "grama"], PONTE_DIR, (4, 4), ENC_CAB),
    reg("ponte_diagonal_cabeceira_rua_calcada", lambda it: p_cabeceira(it, RUA, "calcada"),
        "Ponte diagonal: cabeceira (rua, calçada, 4 × 4)", "ponte_diagonal_cabeceira",
        ["diagonal", "ponte", "elevado", "rampa", "rua", "4x4"], PONTE_DIR, (4, 4), ENC_CAB),
    reg("ponte_diagonal_cabeceira_avenida", lambda it: p_cabeceira(it, AV, "grama"),
        "Ponte diagonal: cabeceira (avenida, 4 × 4)", "ponte_diagonal_cabeceira_avenida",
        ["diagonal", "ponte", "elevado", "rampa", "avenida", "4x4", "grama"], PONTE_DIR, (4, 4), ENC_CAB),
    reg("ponte_diagonal_estaiada", p_estaiada, "Ponte diagonal estaiada (4 × 4)", "ponte_diagonal_estaiada",
        ["diagonal", "ponte", "elevado", "neon", "rua", "4x4"], (1.0, -0.55, 0.42), (4, 4), ENC_EST),
    reg("ponte_diagonal_estaiada_avenida", lambda it: p_estaiada(it, AV), "Ponte diagonal estaiada (avenida, 4 × 4)",
        "ponte_diagonal_estaiada", ["diagonal", "ponte", "elevado", "neon", "avenida", "4x4"], (1.0, -0.55, 0.42),
        (4, 4), ENC_EST),
    reg("ponte_diagonal_arco", p_arco, "Ponte diagonal em laço (4 × 4)", "ponte_diagonal_arco",
        ["diagonal", "ponte", "elevado", "neon", "rua", "4x4", "laco"], (1.0, -0.55, 0.42), (4, 4),
        ENC_EST.replace("o pilone no centro", "o cruzamento das fitas no centro")),
    reg("ponte_diagonal_arco_avenida", lambda it: p_arco(it, AV), "Ponte diagonal em laço (avenida, 4 × 4)",
        "ponte_diagonal_arco", ["diagonal", "ponte", "elevado", "neon", "avenida", "4x4", "laco"],
        (1.0, -0.55, 0.42), (4, 4), ENC_EST.replace("o pilone no centro", "o cruzamento das fitas no centro")),
]


def main():
    a = sys.argv[sys.argv.index("--") + 1:]
    saida, pedidos = a[0], a[1:]
    cat = mb.Catalogo("ruas_diagonais", saida, rotulo="Ruas e pontes diagonais")
    for r in PECAS:
        if pedidos and r["id"] not in pedidos:
            continue
        mb.limpa()
        it = mb.Item(r["id"])
        info = r["f"](it) or {}
        if r["col2"]:
            it.colisao([((0, 0, ZF), (2 * Q, 2 * Q, -ZF))])
        extra = {"quadras": r["quadras"]}
        if info.get("faixas"):
            extra["mao"] = "direita"
        extra.update(info)
        if r["encaixe"]:
            extra["encaixe"] = r["encaixe"]
        if os.environ.get("TRIS_DEBUG"):
            cont = {}
            for o in it.partes:
                nm = o.name.split(".")[0]
                cont[nm] = cont.get(nm, 0) + sum(len(p.vertices) - 2 for p in o.data.polygons)
            print("tris", r["id"], sorted(cont.items(), key=lambda kv: -kv[1])[:10], flush=True)
        cb.exporta(cat, it, r["rot"], r["grupo"], tags=r["tags"], dir_mini=r["dmini"], extra=extra)
    ordem = [r["id"] for r in PECAS]
    cat.dados["itens"].sort(key=lambda e: ordem.index(e["id"]) if e["id"] in ordem else len(ordem))
    cat.salva()


if __name__ == "__main__":
    main()
