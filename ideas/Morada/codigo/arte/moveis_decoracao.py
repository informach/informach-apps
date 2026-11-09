"""Decoração do Morada: quadros, tapetes e plantas (biblioteca de móveis, estilo fofo).

Uso (numa sessão do Blender para tudo):
    blender-venv/bin/python -I morada-art/moveis_decoracao.py -- <saida> [quadros|tapetes|plantas ...] [id ...]
Sem categoria, faz as três. Com ids, refaz só essas peças (o catálogo guarda as outras).
Antes dos quadros, gere as artes: python3 -I morada-art/moveis_decoracao_estampas.py <saida>
"""
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402,F401
import bmesh  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import moveis_base as mb  # noqa: E402

V = Vector
ARGS = sys.argv[sys.argv.index("--") + 1:]
SAIDA = ARGS[0]
CATS = [a for a in ARGS[1:] if a in ("quadros", "tapetes", "plantas")]
IDS = [a for a in ARGS[1:] if a not in CATS]
CATS = CATS or ["quadros", "tapetes", "plantas"]


def rad(g):
    return math.radians(g)


def norm(v):
    v = V(v)
    return v.normalized() if v.length > 1e-9 else V((0, 0, 1))


def az(giro, incl):
    """(frente, cima) de uma folha que sai na direção giro (graus, a partir de +X) e inclinação incl (graus acima do
    horizonte). cima é a face de cima da folha."""
    g, i = rad(giro), rad(incl)
    f = V((math.cos(i) * math.cos(g), math.cos(i) * math.sin(g), math.sin(i)))
    u = V((-math.sin(i) * math.cos(g), -math.sin(i) * math.sin(g), math.cos(i)))
    return f, u


# ---------------------------------------------------------------------------------------------------------------------
# Malha com cor por face (folhas, hastes, troncos): tudo numa malha só, pintada no fim
# ---------------------------------------------------------------------------------------------------------------------
PERFIS = {
    "lanceolada": lambda t: math.sin(math.pi * t ** 0.75) ** 0.85,
    "eliptica": lambda t: math.sin(math.pi * t) ** 0.6,
    "oval": lambda t: math.sin(math.pi * t ** 0.85) ** 0.5,
    "larga": lambda t: math.sin(math.pi * t ** 0.8) ** 0.4,
    "espada": lambda t: min(1.0, t / 0.2) ** 0.5 * (1 - max(0.0, (t - 0.5) / 0.5) ** 1.8),
    "linear": lambda t: min(1.0, t / 0.08) ** 0.5 * (1 - t ** 2.5) ** 0.7,
    "agulha": lambda t: min(1.0, t / 0.06) ** 0.5 * (1 - t) ** 0.9,
    "redonda": lambda t: math.sqrt(max(0.0, 1 - (2 * t - 1) ** 2)) ** 0.9,
    "petala": lambda t: math.sin(math.pi * t ** 1.4) ** 0.55,
    "coracao": lambda t: math.sin(math.pi * (0.18 + 0.82 * t) ** 1.15) ** 0.6,
    "costela": lambda t: math.sin(math.pi * (0.1 + 0.9 * t) ** 1.05) ** 0.45,
}


class Malha:
    def __init__(self):
        self.bm = bmesh.new()
        self.cl = self.bm.faces.layers.int.new("cor_i")
        self.cores = []

    def _ci(self, cor):
        if cor not in self.cores:
            self.cores.append(cor)
        return self.cores.index(cor)

    def face(self, vs, cor):
        try:
            f = self.bm.faces.new(vs)
        except ValueError:
            return None
        f[self.cl] = self._ci(cor)
        return f

    def vazia(self):
        return len(self.bm.faces) == 0

    def obj(self, nome="malha", angulo=70):
        if self.vazia():
            self.bm.free()
            return None
        ob = mb._obj(nome, self.bm, cor=self.cores[0], angulo=angulo)
        me = ob.data
        grupos = {}
        for i, d in enumerate(me.attributes["cor_i"].data):
            grupos.setdefault(d.value, []).append(i)
        for k, fs in grupos.items():
            mb.pinta(ob, self.cores[k], fs)
        me.attributes.remove(me.attributes["cor_i"])
        return ob

    # -- folha: tira fechada com nervura (dobra em V), espessura em lente, curvada e torcida
    def folha(self, base, frente, cima, comp, larg, perfil="lanceolada", nt=10, ns=3, esp=None, dobra=0.22,
              curva=30.0, p_curva=1.5, torce=0.0, rol=0.0, nervura=None, cor="folha", cor_baixo=None, cor_ponta=None,
              t_ponta=0.72, listras=None, recuo=0.0, varre=0.0, recortes=None, onda=0.0, esc_lado=1.0):
        """base: ponto de onde a folha sai; frente: direção inicial; cima: lado de cima (ortogonaliza). comp, larg em m
        (larg é a largura total). curva: quanto a ponta cai (graus, para o lado de baixo). torce: giro da lâmina na
        ponta (graus). nervura: cor da faixa do meio. listras: (cor, período em linhas) faixas atravessadas.
        recortes: (n, fundo) recortes da borda (costela-de-adão). varre: avanço das bordas para a ponta (fração de comp).
        recuo: bordas da base puxadas para trás (lóbulos de coração)."""
        fn = PERFIS[perfil] if isinstance(perfil, str) else perfil
        esp = esp if esp is not None else max(0.0018, min(0.012, larg * 0.07))
        cor_baixo = cor_baixo or cor
        f = norm(frente)
        u = V(cima) - f * V(cima).dot(f)
        u = norm(u) if u.length > 1e-6 else norm(f.orthogonal())
        lado0 = u.cross(f).normalized()
        lado_s = [k / ns for k in range(1, ns + 1)]
        if nervura and lado_s[0] > 0.1:
            lado_s = [0.07] + lado_s
        ss = [-x for x in lado_s[::-1]] + [0.0] + lado_s
        m = len(lado_s)
        # espinha
        pos, dirs, nors, lados = [], [], [], []
        P = V(base)
        passo = comp / nt
        for i in range(nt + 1):
            t = i / nt
            th = rad(curva) * t ** p_curva
            d = f * math.cos(th) - u * math.sin(th)
            n = u * math.cos(th) + f * math.sin(th)
            r = rad(rol + torce * t)
            lt = lado0 * math.cos(r) + n * math.sin(r)
            nt_ = n * math.cos(r) - lado0 * math.sin(r)
            pos.append(P.copy())
            dirs.append(d)
            nors.append(nt_)
            lados.append(lt)
            tm = (i + 0.5) / nt
            thm = rad(curva) * tm ** p_curva
            P = P + (f * math.cos(thm) - u * math.sin(thm)) * passo
        bm = self.bm
        aneis = []
        linhas_rec = set()
        if recortes:
            k, fundo = recortes
            linhas_rec = {int(round(nt * (0.22 + 0.66 * q / max(1, k - 1)))) for q in range(k)}
        for i in range(1, nt):
            t = i / nt
            w = max(0.02, fn(t)) * larg / 2
            if i in linhas_rec:
                w *= 1 - fundo
            meia = esp / 2 * (1 - 0.55 * t)
            topo, baixo = [], []
            for j, s in enumerate(ss):
                a = abs(s)
                ws = w * (esc_lado if s > 0 else 1.0)
                desl = varre * comp * a - recuo * comp * a ** 2 * (1 - t) ** 3
                c = pos[i] + dirs[i] * desl + lados[i] * (s * ws)
                c = c + nors[i] * (dobra * ws * a ** 1.2 + onda * ws * a ** 2 * math.sin(t * 9 + s))
                h = meia * math.sqrt(max(0.0, 1 - a * a))
                topo.append(bm.verts.new(c + nors[i] * h))
                if 0 < j < len(ss) - 1:
                    baixo.append(bm.verts.new(c - nors[i] * h))
            aneis.append((topo + baixo[::-1], t))
        R = 4 * m
        ponta0 = bm.verts.new(pos[0] - nors[0] * 0.0)
        ponta1 = bm.verts.new(pos[nt])

        def cor_face(k, t):
            if k >= 2 * m:
                return cor_baixo
            s0, s1 = ss[k], ss[k + 1]
            if nervura and abs(s0) <= 0.08 and abs(s1) <= 0.08:
                return nervura
            if listras:
                c2, per = listras
                if int(t * nt) % per == per // 2:
                    return c2
            if cor_ponta and t > t_ponta:
                return cor_ponta
            return cor

        for (a0, t0), (a1, t1) in zip(aneis, aneis[1:]):
            tm = (t0 + t1) / 2
            for k in range(R):
                self.face([a0[k], a0[(k + 1) % R], a1[(k + 1) % R], a1[k]], cor_face(k, tm))
        a0, t0 = aneis[0]
        for k in range(R):
            self.face([ponta0, a0[(k + 1) % R], a0[k]], cor_face(k, t0 / 2))
        a1, t1 = aneis[-1]
        for k in range(R):
            self.face([a1[k], a1[(k + 1) % R], ponta1], cor_face(k, (1 + t1) / 2))
        return pos[nt], dirs[nt]

    # -- tubo de raio variável por uma curva suave (haste, tronco, ráquis)
    def tubo(self, pts, raio, n=None, seg=8, cor="folha", cor_t=None, tampa_ini=True, tampa_fim=True):
        """pts: pontos de controle (passa por todos, curva Catmull-Rom). raio: número, (r0, r1) ou função de t."""
        pts = [V(p) for p in pts]
        n = n or max(4, 4 * (len(pts) - 1))
        cur = _catmull(pts, n)
        if callable(raio):
            rf = raio
        elif isinstance(raio, (tuple, list)):
            rf = lambda t, a=raio[0], b=raio[1]: a + (b - a) * t  # noqa: E731
        else:
            rf = lambda t, a=raio: a  # noqa: E731
        tans = []
        for i in range(len(cur)):
            a, b = cur[max(0, i - 1)], cur[min(len(cur) - 1, i + 1)]
            tans.append(norm(b - a))
        ref = V((0, 0, 1)) if abs(tans[0].z) < 0.9 else V((1, 0, 0))
        nx = norm(ref - tans[0] * ref.dot(tans[0]))
        bm = self.bm
        aneis = []
        for i, (c, tg) in enumerate(zip(cur, tans)):
            if i:
                nx = norm(nx - tg * nx.dot(tg))
            ny = tg.cross(nx)
            t = i / (len(cur) - 1)
            r = rf(t)
            aneis.append([bm.verts.new(c + (nx * math.cos(2 * math.pi * k / seg) + ny * math.sin(2 * math.pi * k / seg))
                                       * r) for k in range(seg)])
        for i in range(len(aneis) - 1):
            t = (i + 0.5) / (len(aneis) - 1)
            cr = cor_t(t) if cor_t else cor
            for k in range(seg):
                self.face([aneis[i][k], aneis[i][(k + 1) % seg], aneis[i + 1][(k + 1) % seg], aneis[i + 1][k]], cr)
        if tampa_ini:
            p0 = bm.verts.new(cur[0] - tans[0] * rf(0) * 0.35)
            cr = cor_t(0.0) if cor_t else cor
            for k in range(seg):
                self.face([aneis[0][(k + 1) % seg], aneis[0][k], p0], cr)
        if tampa_fim:
            p1 = bm.verts.new(cur[-1] + tans[-1] * rf(1) * 0.6)
            cr = cor_t(1.0) if cor_t else cor
            for k in range(seg):
                self.face([aneis[-1][k], aneis[-1][(k + 1) % seg], p1], cr)
        return cur[-1], tans[-1]

    def bola(self, c, r, cor, seg=10, esc=(1, 1, 1)):
        """Esfera baixa (miolo de flor, botão, fruto)."""
        bm = self.bm
        nv = max(3, seg // 2)
        polo0 = bm.verts.new(V(c) + V((0, 0, -r * esc[2])))
        polo1 = bm.verts.new(V(c) + V((0, 0, r * esc[2])))
        aneis = []
        for j in range(1, nv):
            fi = -math.pi / 2 + math.pi * j / nv
            aneis.append([bm.verts.new(V(c) + V((r * esc[0] * math.cos(fi) * math.cos(2 * math.pi * k / seg),
                                                  r * esc[1] * math.cos(fi) * math.sin(2 * math.pi * k / seg),
                                                  r * esc[2] * math.sin(fi)))) for k in range(seg)])
        for k in range(seg):
            self.face([polo0, aneis[0][(k + 1) % seg], aneis[0][k]], cor)
            self.face([aneis[-1][k], aneis[-1][(k + 1) % seg], polo1], cor)
        for a0, a1 in zip(aneis, aneis[1:]):
            for k in range(seg):
                self.face([a0[k], a0[(k + 1) % seg], a1[(k + 1) % seg], a1[k]], cor)


def _catmull(pts, n):
    if len(pts) == 2:
        return [pts[0].lerp(pts[1], k / n) for k in range(n + 1)]
    ext = [pts[0] * 2 - pts[1]] + pts + [pts[-1] * 2 - pts[-2]]
    segs = len(pts) - 1
    out = []
    for k in range(n + 1):
        x = k / n * segs
        i = min(int(x), segs - 1)
        t = x - i
        p0, p1, p2, p3 = ext[i], ext[i + 1], ext[i + 2], ext[i + 3]
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
                          (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    return out


# ---------------------------------------------------------------------------------------------------------------------
# Peças comuns
# ---------------------------------------------------------------------------------------------------------------------
def _interp(perfil, z):
    for (r0, z0), (r1, z1) in zip(perfil, perfil[1:]):
        if z0 <= z <= z1 and z1 > z0:
            return r0 + (r1 - r0) * (z - z0) / (z1 - z0)
    return perfil[-1][0] if z > perfil[-1][1] else perfil[0][0]


def vaso(ext, cor, borda=0.012, fundo_terra=0.025, seg=32, cor_terra="terra", sulcos=0, sulco=0.0, cor_sulco=None,
         faixas=(), x=0.0, y=0.0, z=0.0, terra=True, nome="vaso", esc=(1, 1), mat="atlas", suave=2):
    """Vaso torneado: ext = [(r, z), ...] por fora, do pé até a boca. Faz a borda boleada, a parede de dentro e a terra.
    sulcos: n gomos verticais (sulco = fundo relativo, cor_sulco = cor dos gomos fundos). faixas: [(z0, z1, cor)].
    Devolve (objeto, z da terra, raio de dentro na terra). suave: reamostra o perfil numa curva lisa."""
    if suave > 1 and len(ext) > 2:
        ext = [(max(0.003, q.x), q.y) for q in _catmull([V((r_, z_, 0)) for r_, z_ in ext], (len(ext) - 1) * suave)]
    h, rt = ext[-1][1], ext[-1][0]
    r0 = ext[0][0]
    perfil = [(0.0, 0.0), (r0 * 0.94, 0.0), (r0, min(0.006, h * 0.04))] + [p for p in ext[1:]]
    b = borda
    perfil += [(rt - b * 0.12, h + b * 0.28), (rt - b * 0.5, h + b * 0.4), (rt - b * 0.88, h + b * 0.28), (rt - b, h)]
    zt = h - fundo_terra
    rin = max(0.01, _interp(ext, zt) - b * 1.1)
    if terra:
        perfil += [(rt - b * 1.06, h - min(0.012, fundo_terra * 0.4)), (rin, zt), (rin * 0.55, zt + 0.004),
                   (0.0, zt + 0.006)]
    else:
        zt = max(0.01, h * 0.06)
        perfil += [(rin, h * 0.5), (_interp(ext, zt) - b, zt), (0.0, zt)]
    ob = mb.torno(perfil, x=0, y=0, z=0, cor=cor, seg=seg, nome=nome, mat=mat)
    if mat != "atlas":
        mb.transforma(ob, loc=(x, y, z), esc=(esc[0], esc[1], 1))
        return ob, z + zt, rin
    me = ob.data
    if sulcos:
        for v in me.vertices:
            rr = math.hypot(v.co.x, v.co.y)
            if 0.004 < v.co.z < h - 0.002 and rr > _interp(ext, v.co.z) - b * 0.5:
                ang = math.atan2(v.co.y, v.co.x)
                k = 1 - sulco * (0.5 - 0.5 * math.cos(sulcos * ang))
                v.co.x *= k
                v.co.y *= k
    if terra:
        mb.pinta_onde(ob, cor_terra, lambda c, n: c.z < zt + 0.008 and math.hypot(c.x, c.y) < rin + 0.002
                      and n.z > 0.3)
    fora = lambda c: math.hypot(c.x, c.y) > _interp(ext, min(max(c.z, 0), h)) - b * 0.6 - sulco * rt  # noqa: E731
    for z0, z1, cf in faixas:
        mb.pinta_onde(ob, cf, lambda c, n, z0=z0, z1=z1: z0 <= c.z <= z1 and fora(c) and abs(n.z) < 0.9)
    if sulcos and cor_sulco:
        mb.pinta_onde(ob, cor_sulco, lambda c, n: 0.003 < c.z < h - 0.001 and fora(c) and
                      math.cos(sulcos * math.atan2(c.y, c.x)) > 0.0)
    mb.transforma(ob, loc=(x, y, z), esc=(esc[0], esc[1], 1))
    return ob, z + zt, rin


def anel_ret(l, a, larg, prof, raio, cor, z0=0.0, b_fora=None, b_dentro=None, seg=6, nome="moldura"):
    """Moldura: anel de retângulo arredondado no plano XZ, de y = −prof (frente) a y = 0, base em z0. Boleada."""
    fora = mb.ret_arredondado(l, a, raio, seg)
    dentro = mb.ret_arredondado(l - 2 * larg, a - 2 * larg, max(0.004, raio - larg * 0.7), seg)
    bm = bmesh.new()
    zc = z0 + a / 2
    of = [bm.verts.new((x, -prof, z + zc)) for x, z in fora]
    df = [bm.verts.new((x, -prof, z + zc)) for x, z in dentro]
    ot = [bm.verts.new((x, 0.0, z + zc)) for x, z in fora]
    dt = [bm.verts.new((x, -prof * 0.15, z + zc)) for x, z in dentro]
    n = len(fora)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((of[i], of[j], df[j], df[i]))
        bm.faces.new((ot[j], ot[i], dt[i], dt[j]))
        bm.faces.new((ot[i], ot[j], of[j], of[i]))
        bm.faces.new((df[i], df[j], dt[j], dt[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    ef = [e for e in bm.edges if all(v in set(of) for v in e.verts)]
    edf = [e for e in bm.edges if all(v in set(df) for v in e.verts)]
    eot = [e for e in bm.edges if all(v in set(ot) for v in e.verts)]
    mb._bevel(bm, b_fora if b_fora is not None else prof * 0.42, 4, ef + eot[:0])
    bm2 = bm
    edf = [e for e in bm2.edges if e.is_valid and all(abs(v.co.y + prof) < 1e-6 for v in e.verts) and
           all(_dentro_ret(v.co.x, v.co.z - zc, l - 2 * larg, a - 2 * larg, 1e-4) for v in e.verts)]
    mb._bevel(bm2, b_dentro if b_dentro is not None else min(larg, prof) * 0.22, 2, edf)
    eot = [e for e in bm2.edges if e.is_valid and all(abs(v.co.y) < 1e-6 for v in e.verts) and
           all(not _dentro_ret(v.co.x, v.co.z - zc, l - 0.004, a - 0.004, 0) for v in e.verts)]
    mb._bevel(bm2, min(0.004, prof * 0.1), 1, eot)
    return mb._obj(nome, bm2, cor, angulo=40)


def _dentro_ret(x, z, l, a, tol):
    return abs(x) <= l / 2 + tol and abs(z) <= a / 2 + tol


# ---------------------------------------------------------------------------------------------------------------------
# QUADROS
# ---------------------------------------------------------------------------------------------------------------------
_ESTAMPA = {}


def estampa_quadros():
    if not _ESTAMPA:
        pasta = os.path.join(SAIDA, "quadros")
        png = os.path.join(pasta, "estampas_quadros.png")
        info = json.load(open(os.path.join(pasta, "estampas_quadros.json")))
        _ESTAMPA["mat"] = mb.material_estampa("quadros", png)
        _ESTAMPA["info"] = info
    return _ESTAMPA


def pinta_miolo(ob, arte, folga=0.004):
    """Põe a arte (célula do atlas de estampas) nas faces da frente (normal −Y) do miolo: UV projetado de frente,
    esticado na célula inteira (a arte foi desenhada no aspecto do miolo)."""
    e = estampa_quadros()
    cols, lins = e["info"]["grade"]
    col, lin = e["info"]["artes"][arte]["cel"]
    u0, u1 = col / cols + folga, (col + 1) / cols - folga
    v0, v1 = 1 - (lin + 1) / lins + folga, 1 - lin / lins - folga
    me = ob.data
    fs = [p for p in me.polygons if p.normal.y < -0.9]
    xs = [me.vertices[i].co.x for p in fs for i in p.vertices]
    zs = [me.vertices[i].co.z for p in fs for i in p.vertices]
    x0, x1, z0, z1 = min(xs), max(xs), min(zs), max(zs)
    uv = me.uv_layers["UVMap"].data
    for p in fs:
        p.material_index = e["mat"]
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            uv[li].uv = (u0 + (co.x - x0) / (x1 - x0) * (u1 - u0), v0 + (co.z - z0) / (z1 - z0) * (v1 - v0))
    return ob


QUADROS = [
    # id, rótulo, arte, largura da arte, cor da moldura, largura da moldura, profundidade, raio, passe-partout, tags
    ("quadro_montanhas_entardecer", "Quadro de montanhas ao entardecer", "montanhas_entardecer", 0.62, "madeira_media",
     0.045, 0.04, 0.022, "papel", ["paisagem", "grande"]),
    ("quadro_mar_ilha", "Quadro de mar com ilha e sol", "mar_ilha_sol", 0.62, "marrom", 0.045, 0.04, 0.022, "papel",
     ["paisagem", "grande"]),
    ("quadro_estrada_campo", "Quadro panorâmico de estrada no campo", "estrada_campo", 0.72, "nogueira", 0.05, 0.045,
     0.03, None, ["paisagem", "grande"]),
    ("quadro_formas_contorno", "Quadro abstrato de formas (magenta)", "formas_contorno", 0.36, "magenta", 0.042, 0.04,
     0.02, None, ["abstrato", "retrato"]),
    ("quadro_letras_lar", "Quadro com letras LAR (roxo)", "letras_lar", 0.46, "roxo", 0.06, 0.05, 0.045, "papel",
     ["letras", "grande"]),
    ("quadro_pedras_empilhadas", "Quadro de pedras empilhadas", "pedras_equilibrio", 0.3, "cinza_azulado", 0.036, 0.035,
     0.016, None, ["abstrato", "retrato"]),
    ("quadro_arcos_boho", "Quadro de arcos", "arcos_boho", 0.3, "madeira_cinza", 0.036, 0.035, 0.016, None,
     ["abstrato", "retrato"]),
    ("quadro_silhueta", "Quadro de silhueta", "silhueta_retrato", 0.3, "grafite", 0.036, 0.035, 0.016, None,
     ["retrato"]),
    ("quadro_galhos_frutos", "Quadro de galhos com frutos (laranja)", "galhos_frutos", 0.3, "laranja", 0.036, 0.035,
     0.016, None, ["abstrato", "retrato"]),
    ("quadro_dois_sois", "Quadro estreito de dois sóis", "dois_sois", 0.18, "nogueira", 0.032, 0.032, 0.014, None,
     ["abstrato", "estreito"]),
    ("quadro_sol_dividido", "Quadrinho de sol dividido", "sol_dividido", 0.28, "madeira", 0.034, 0.035, 0.016, "papel",
     ["abstrato"]),
    ("quadro_colinas_douradas", "Quadrinho de colinas douradas", "colinas_douradas", 0.22, "madeira_media", 0.03, 0.03,
     0.014, "papel", ["paisagem", "pequeno"]),
    ("quadro_pico_aurora", "Quadrinho de montanha e sol", "pico_aurora", 0.22, "marrom", 0.03, 0.03, 0.014, "papel",
     ["paisagem", "pequeno"]),
    ("quadro_estrela", "Quadrinho de estrela", "estrela", 0.22, "madeira", 0.03, 0.03, 0.014, "papel",
     ["infantil", "pequeno"]),
    ("quadro_faixa_mar", "Quadrinho comprido de mar", "faixa_mar", 0.3, "madeira_media", 0.026, 0.028, 0.012, "papel",
     ["paisagem", "pequeno"]),
    ("quadro_faixa_duna", "Quadrinho comprido de dunas", "faixa_duna", 0.3, "marrom", 0.026, 0.028, 0.012, "papel",
     ["paisagem", "pequeno"]),
    ("quadro_campo_faixas", "Quadrinho de campo", "campo_faixas", 0.24, "madeira_escura", 0.028, 0.03, 0.013, None,
     ["paisagem", "pequeno"]),
    ("quadro_borboleta", "Quadrinho de borboleta", "borboleta", 0.22, "nogueira", 0.032, 0.032, 0.014, None,
     ["infantil", "pequeno"]),
    ("quadro_verde_moldurado", "Quadrinho verde moldurado", "quadro_no_quadro", 0.2, "madeira_media", 0.03, 0.03, 0.014,
     None, ["abstrato", "pequeno"]),
    ("quadro_nascer_colina", "Quadrinho de sol nascendo na colina", "nascer_colina", 0.24, "marrom", 0.028, 0.03, 0.013,
     None, ["paisagem", "pequeno"]),
]

QUADROS_PACOTE = [
    # (escala: o pacote vem grande demais perto dos nossos; deixa do tamanho dos quadros de retrato e dos pequenos)
    ("quadro_flores_abstratas_pacote", "Quadro de flores abstratas", "Picture_08", 0.7, ["abstrato", "retrato"]),
    ("quadro_circulos_pacote", "Quadro de círculos", "Picture_17", 0.6, ["abstrato", "retrato"]),
    ("quadro_piramide_pacote", "Quadro de pirâmide", "Picture_21", 0.62, ["abstrato", "pequeno"]),
]


def altura_quadro(a):
    """Altura da base na parede: o meio do quadro a ~1,50 m do chão (quadros pequenos um pouco mais baixos)."""
    meio = 1.5 if a > 0.4 else 1.42
    return round(meio - a / 2, 2)


def faz_quadro(cat, spec):
    qid, rot, arte, la, cor, w, prof, raio, passe, tags = spec
    asp = estampa_quadros()["info"]["artes"][arte]["aspecto"]
    aa = la / asp
    mb.limpa()
    it = mb.Item(qid)
    pp = 0.012 if passe else 0.0  # largura do passe-partout
    L, A = la + 2 * (w + pp), aa + 2 * (w + pp)
    it.add(anel_ret(L, A, w, prof, raio, cor))
    y_arte = -prof * 0.42
    if passe:
        lip = anel_ret(la + 2 * pp + 0.008, aa + 2 * pp + 0.008, pp + 0.004, 0.006, 0.004, passe,
                       z0=w - 0.004, b_fora=0.0022, b_dentro=0.0012)
        mb.transforma(lip, loc=(0, y_arte - 0.0005 + 0.006 * 0.15, 0))
        it.add(lip)
    # miolo: placa com a arte na frente (entra 4 mm na moldura dos lados, sem fresta)
    miolo = mb.caixa(la + 2 * pp + 0.008, abs(y_arte) - 0.003, aa + 2 * pp + 0.008, y=(y_arte - 0.003) / 2,
                     z=w - 0.004, cor="papel", bisel=0.001, seg=1)
    if passe:
        miolo2 = mb.caixa(la + 0.002, 0.002, aa + 0.002, y=y_arte - 0.001 + 0.0002, z=w + pp - 0.001, cor="papel",
                          bisel=0.0005, seg=1)
        pinta_miolo(miolo2, arte)
        it.add(miolo2)
    else:
        pinta_miolo(miolo, arte)
    it.add(miolo)
    cat.exporta(it, rot, grupo=arte, fixacao="parede", altura_instalacao=altura_quadro(A),
                tags=["quadro"] + tags, miniatura_dir=(0.3, -1, 0.15))


def faz_quadro_pacote(cat, spec):
    qid, rot, nome, esc, tags = spec
    mb.limpa()
    pc = mb.importa_pacote(nome)
    it = mb.Item(qid)
    objs = list(pc.values())
    for o in objs:
        mb.transforma(o, esc=(esc, esc, esc))
    lo, hi = mb.bbox(objs)
    for o in objs:
        mb.transforma(o, loc=(-(lo.x + hi.x) / 2, -hi.y, -lo.z))
    it.add(objs)
    cat.exporta(it, rot, grupo=nome.lower(), fixacao="parede", altura_instalacao=altura_quadro(hi.z - lo.z),
                pacote=True, tags=["quadro"] + tags, miniatura_dir=(0.3, -1, 0.15))


def quadros():
    cat = mb.Catalogo("quadros", SAIDA, "Quadros")
    for spec in QUADROS:
        if not IDS or spec[0] in IDS:
            faz_quadro(cat, spec)
    for spec in QUADROS_PACOTE:
        if not IDS or spec[0] in IDS:
            faz_quadro_pacote(cat, spec)
    ordena(cat, [q[0] for q in QUADROS] + [q[0] for q in QUADROS_PACOTE])
    cat.salva()


# ---------------------------------------------------------------------------------------------------------------------
# TAPETES (geometria: base macia + camadas de 1,5 mm em relevo, franjas de verdade)
# ---------------------------------------------------------------------------------------------------------------------
BASE_T = 0.010
PASSO_T = 0.0016


def _clip(poly, x0, x1, y0, y1):
    """Sutherland–Hodgman: recorta um polígono 2D pelo retângulo."""
    def corta(pts, dentro, inter):
        out = []
        for i, p in enumerate(pts):
            q = pts[i - 1]
            if dentro(p):
                if not dentro(q):
                    out.append(inter(q, p))
                out.append(p)
            elif dentro(q):
                out.append(inter(q, p))
        return out

    def ix(xc):
        return lambda a, b: (xc, a[1] + (b[1] - a[1]) * (xc - a[0]) / (b[0] - a[0]))

    def iy(yc):
        return lambda a, b: (a[0] + (b[0] - a[0]) * (yc - a[1]) / (b[1] - a[1]), yc)

    pts = poly
    pts = corta(pts, lambda p: p[0] >= x0, ix(x0))
    pts = corta(pts, lambda p: p[0] <= x1, ix(x1)) if pts else pts
    pts = corta(pts, lambda p: p[1] >= y0, iy(y0)) if pts else pts
    pts = corta(pts, lambda p: p[1] <= y1, iy(y1)) if pts else pts
    return pts


def camada(pts, k, cor, nome="camada", seg=2):
    """Camada k (1, 2, ...) sobre a base: entra 0,5 mm na de baixo e sobe 1,6 mm."""
    z0 = BASE_T + (k - 1) * PASSO_T - 0.0006
    e = PASSO_T + 0.0006
    return mb.extrudado(mb._ccw(list(pts)), e, z=z0, cor=cor, bisel=e * 0.42, seg=seg, nome=nome)


def ordena(cat, ids):
    """Deixa o catálogo na ordem do gerador (a vitrine e a página seguem essa ordem)."""
    cat.dados["itens"].sort(key=lambda i: ids.index(i["id"]) if i["id"] in ids else len(ids))


def base_tapete(pts, cor):
    return mb.extrudado(mb._ccw(list(pts)), BASE_T, cor=cor, bisel=BASE_T * 0.45, seg=3, nome="base")


def franjas(L, P, cor, n=None, comp=0.08, larg=0.04):
    """Franjas nos lados curtos (x = ±L/2): tirinhas boleadas no chão, que entram 2 cm por baixo do tapete."""
    out = []
    n = n or max(5, int(P / 0.095))
    passo = (P - 0.05) / (n - 1)
    for sx in (-1, 1):
        for k in range(n):
            yy = -P / 2 + 0.025 + k * passo
            pts = mb.ret_arredondado(comp + 0.02, larg, larg * 0.48, 3)
            o = mb.extrudado(pts, 0.006, x=sx * (L / 2 + comp / 2 - 0.01), y=yy, cor=cor, bisel=0.0026, seg=1,
                             nome="franja")
            out.append(o)
    return out


def losango(cx, cy, rx, ry):
    return [(cx + rx, cy), (cx, cy + ry), (cx - rx, cy), (cx, cy - ry)]


def losango_arred(cx, cy, rx, ry, r=0.02):
    pts = losango(cx, cy, rx, ry)
    pts = pts + pts[:2]
    return [tuple(p) for p in mb._arredonda_cantos(pts, r, 4)][1:-1]


def tapete_retangulos(it, L, P, camadas, raio=0.06):
    """camadas: [(cor, recuo_da_borda, raio)] da base (recuo 0) para dentro, cada uma por cima da anterior."""
    for k, (cor, rec, rr) in enumerate(camadas):
        pts = mb.ret_arredondado(L - 2 * rec, P - 2 * rec, rr if rr is not None else max(0.01, raio - rec * 0.5), 6)
        it.add(base_tapete(pts, cor) if k == 0 else camada(pts, k, cor))


def tapete_redondo(it, R, aneis, seg=56):
    """aneis: [(cor, raio)] de fora para dentro."""
    for k, (cor, r) in enumerate(aneis):
        pts = mb.circulo(r, seg=seg)
        it.add(base_tapete(pts, cor) if k == 0 else camada(pts, k, cor))


def tapetes():
    cat = mb.Catalogo("tapetes", SAIDA, "Tapetes")

    def novo(tid):
        if IDS and tid not in IDS:
            return None
        mb.limpa()
        return mb.Item(tid)

    def fim(it, rot, grupo, tags):
        cat.exporta(it, rot, grupo=grupo, fixacao="chao", tags=["tapete"] + tags, miniatura_dir=(0.45, -1, 0.75))

    # 1. rosa com zigue-zague
    it = novo("tapete_zigue_zague_rosa")
    if it:
        L, P = 1.8, 1.2
        it.add(base_tapete(mb.ret_arredondado(L, P, 0.09, 6), "rosa"))
        m = 0.045
        n_z, amp, larg = 6, 0.1, 0.11
        for faixa in range(-4, 4):
            x0 = faixa * 0.235 + 0.07
            pts_e, pts_d = [], []
            for k in range(n_z * 2 + 1):
                yy = -P / 2 - 0.05 + k * (P + 0.1) / (n_z * 2)
                dx = amp if k % 2 else 0.0
                pts_e.append((x0 + dx - larg / 2, yy))
                pts_d.append((x0 + dx + larg / 2, yy))
            poly = pts_d + pts_e[::-1]
            poly = _clip(poly, -L / 2 + m, L / 2 - m, -P / 2 + m, P / 2 - m)
            if len(poly) >= 3:
                it.add(camada(poly, 1, "rosa_bebe", seg=1))
        fim(it, "Tapete rosa com zigue-zague", "zigue_zague", ["sala", "quarto"])

    # 2. amarelo com duas molduras azuis
    it = novo("tapete_molduras_azuis")
    if it:
        tapete_retangulos(it, 1.8, 1.2, [("amarelo", 0, 0.1), ("azul_celeste", 0.07, 0.07), ("amarelo", 0.13, 0.05),
                                         ("azul_celeste", 0.22, 0.03), ("amarelo", 0.27, 0.02)])
        fim(it, "Tapete amarelo com molduras azuis", "molduras", ["sala"])

    # 3. persa com medalhão e franjas
    it = novo("tapete_persa_medalhao")
    if it:
        L, P = 1.9, 1.2
        tapete_retangulos(it, L, P, [("terracota", 0, 0.012), ("amarelo", 0.06, 0.008), ("terracota", 0.12, 0.008)])
        it.add(camada(mb.ret_arredondado(L - 0.6, P - 0.44, 0.17, 8), 3, "amarelo_escuro"))
        it.add(camada(losango_arred(0, 0, 0.18, 0.12, 0.025), 4, "terracota"))
        it.add(franjas(L, P, "terracota"))
        fim(it, "Tapete persa com medalhão", "persa_medalhao", ["sala", "persa", "franjas"])

    # 4. persa terracota com losango vazado
    it = novo("tapete_persa_losango_terracota")
    if it:
        L, P = 1.6, 1.0
        tapete_retangulos(it, L, P, [("terracota", 0, 0.012), ("amarelo", 0.1, 0.008)])
        it.add(camada(losango_arred(0, 0, 0.3, 0.2, 0.03), 2, "terracota"))
        it.add(camada(losango_arred(0, 0, 0.2, 0.13, 0.02), 3, "amarelo"))
        it.add(camada(losango_arred(0, 0, 0.09, 0.06, 0.012), 4, "terracota"))
        it.add(franjas(L, P, "terracota"))
        fim(it, "Tapete persa com losango (terracota)", "persa_losango", ["sala", "persa", "franjas"])

    # 5. persa azul com losango cheio e franjas amarelas
    it = novo("tapete_persa_losango_azul")
    if it:
        L, P = 1.6, 1.0
        tapete_retangulos(it, L, P, [("azul", 0, 0.012), ("amarelo", 0.09, 0.008)])
        it.add(camada(losango_arred(0, 0, 0.26, 0.15, 0.03), 2, "azul"))
        it.add(franjas(L, P, "amarelo"))
        fim(it, "Tapete persa com losango azul", "persa_losango_cheio", ["sala", "persa", "franjas"])

    # 6. verde com quadrado turquesa
    it = novo("tapete_verde_quadrado")
    if it:
        tapete_retangulos(it, 1.3, 1.0, [("verde_medio", 0, 0.09), ("turquesa_claro", 0.06, 0.06),
                                         ("verde_medio", 0.1, 0.035)])
        it.add(camada(mb.ret_arredondado(0.3, 0.24, 0.02, 4), 3, "turquesa_claro"))
        fim(it, "Tapete verde com quadrado turquesa", "quadrado_central", ["quarto", "sala"])

    # 7. redondo creme com anéis turquesa
    it = novo("tapete_redondo_aneis_turquesa")
    if it:
        tapete_redondo(it, 0.65, [("amarelo_claro", 0.65), ("turquesa_claro", 0.53), ("amarelo_claro", 0.42),
                                  ("turquesa_claro", 0.2)])
        fim(it, "Tapete redondo com anéis turquesa", "redondo_aneis", ["redondo", "sala"])

    # 8. pequeno vinho
    it = novo("tapete_pequeno_vinho")
    if it:
        tapete_retangulos(it, 0.8, 0.6, [("vinho", 0, 0.05), ("salmao", 0.045, 0.035), ("madeira_rosada", 0.075, 0.02)])
        fim(it, "Tapete pequeno vinho", "pequeno_moldura", ["pequeno", "banheiro", "quarto"])

    # 9. amarelo com moldura azul
    it = novo("tapete_amarelo_moldura_azul")
    if it:
        tapete_retangulos(it, 1.3, 0.8, [("amarelo", 0, 0.08), ("azul_celeste", 0.05, 0.05), ("amarelo", 0.085, 0.03)])
        fim(it, "Tapete amarelo com moldura azul", "molduras", ["sala", "corredor"])

    # 10. pequeno persa com franjas
    it = novo("tapete_persa_pequeno")
    if it:
        L, P = 1.0, 0.65
        tapete_retangulos(it, L, P, [("terracota", 0, 0.01), ("amarelo", 0.07, 0.006)])
        it.add(camada(losango_arred(0, 0, 0.17, 0.12, 0.02), 2, "terracota"))
        it.add(camada(losango_arred(0, 0, 0.11, 0.075, 0.014), 3, "amarelo"))
        it.add(camada(losango_arred(0, 0, 0.05, 0.034, 0.008), 4, "terracota"))
        it.add(franjas(L, P, "terracota", n=6, comp=0.065, larg=0.032))
        fim(it, "Tapete persa pequeno", "persa_losango", ["pequeno", "persa", "franjas"])

    # 11. redondo rosa com anel pêssego
    it = novo("tapete_redondo_rosa")
    if it:
        tapete_redondo(it, 0.55, [("rosa", 0.55), ("pessego", 0.4), ("rosa", 0.18)])
        fim(it, "Tapete redondo rosa com anel", "redondo_aneis", ["redondo", "quarto", "infantil"])

    # 12. redondo pêssego
    it = novo("tapete_redondo_pessego")
    if it:
        tapete_redondo(it, 0.5, [("terracota_clara", 0.5), ("pessego", 0.44)])
        fim(it, "Tapete redondo pêssego", "redondo_liso", ["redondo", "quarto"])
    ordena(cat, ["tapete_zigue_zague_rosa", "tapete_molduras_azuis", "tapete_persa_medalhao",
                 "tapete_persa_losango_terracota", "tapete_persa_losango_azul", "tapete_verde_quadrado",
                 "tapete_redondo_aneis_turquesa", "tapete_pequeno_vinho", "tapete_amarelo_moldura_azul",
                 "tapete_persa_pequeno", "tapete_redondo_rosa", "tapete_redondo_pessego"])
    cat.salva()


# ---------------------------------------------------------------------------------------------------------------------
# PLANTAS
# ---------------------------------------------------------------------------------------------------------------------
import random  # noqa: E402

UP = V((0, 0, 1))


def flor(M, c, d, r, n, cor, miolo, perfil="petala", abertura=12.0, larg_rel=0.6, cor_baixo=None, curva=-8.0, nt=4,
         ns=1, dobra=0.3, rol0=0.0, r_miolo=None, cor_ponta=None, esp=None, nervura=None, t_ponta=0.72):
    """Flor de n pétalas em volta do eixo d (para onde a flor olha), raio r. abertura: quanto as pétalas sobem para a
    frente (0 = flor chata, 70 = taça). curva negativa fecha a pétala para dentro."""
    c, d = V(c), norm(d)
    e1 = norm(d.orthogonal())
    e2 = d.cross(e1)
    ab = rad(abertura)
    for k in range(n):
        a = 2 * math.pi * k / n + rad(rol0)
        rr = e1 * math.cos(a) + e2 * math.sin(a)
        fr = rr * math.cos(ab) + d * math.sin(ab)
        cima = d - fr * d.dot(fr)
        M.folha(c + rr * r * 0.08 - d * r * 0.04, fr, cima, r, r * larg_rel, perfil, nt=nt, ns=ns, curva=curva,
                dobra=dobra, cor=cor, cor_baixo=cor_baixo or cor, cor_ponta=cor_ponta, esp=esp, nervura=nervura,
                t_ponta=t_ponta)
    if miolo:
        M.bola(c + d * r * 0.06, r_miolo or r * 0.26, miolo, seg=8)


def arco(base, giro, incl, comp, curva, n=8, p=1.3):
    """Pontos de uma haste que sai de base para o lado giro, inclinação incl, e vai curvando para baixo (curva graus)."""
    pts = [V(base)]
    P = V(base)
    for i in range(n):
        t = (i + 0.5) / n
        th = rad(incl - curva * t ** p)
        g = rad(giro)
        P = P + V((math.cos(th) * math.cos(g), math.cos(th) * math.sin(g), math.sin(th))) * comp / n
        pts.append(P.copy())
    return pts


def tangente(pts):
    return norm(pts[-1] - pts[-2])


def fronde(M, base, giro, incl, comp, curva, n_lado, folio_comp, folio_larg, ang=58.0, cor="folha",
           cor_baixo="folha_escura", cor_raque="folha_clara", r_raque=(0.009, 0.0035), inicio=0.3, perfil="linear",
           curva_folio=25.0, v=0.25, nt=5, folio_dobra=0.4, perfil_tam=None, p_arco=1.3):
    """Folha pinada (palmeira, samambaia): ráquis em arco e folíolos dos dois lados, apontando para a ponta."""
    pts = arco(base, giro, incl, comp, curva, n=12, p=p_arco)
    M.tubo(pts, r_raque, n=16, seg=6, cor=cor_raque)
    cur = _catmull(pts, 60)
    lado = V((-math.sin(rad(giro)), math.cos(rad(giro)), 0))
    perfil_tam = perfil_tam or (lambda tau: math.sin(math.pi * (0.12 + 0.88 * tau)) ** 0.6)
    for k in range(n_lado):
        tau = (k + 0.5) / n_lado
        t = inicio + (1 - inicio) * tau * 0.97
        i = min(len(cur) - 2, int(t * (len(cur) - 1)))
        p = cur[i]
        d = norm(cur[i + 1] - cur[i])
        nr = norm(lado.cross(d))
        if nr.z < 0:
            nr = -nr
        tam = perfil_tam(tau)
        for s in (-1, 1):
            fr = norm(d * math.cos(rad(ang)) + lado * s * math.sin(rad(ang)) + nr * v)
            cima = nr - fr * nr.dot(fr)
            M.folha(p + lado * s * 0.002, fr, cima, folio_comp * tam, folio_larg * (0.6 + 0.4 * tam), perfil, nt=nt,
                    ns=1, curva=curva_folio, dobra=folio_dobra, cor=cor, cor_baixo=cor_baixo)
    return pts


def fib_esfera(n):
    out = []
    ga = math.pi * (3 - math.sqrt(5))
    for i in range(n):
        z = 1 - 2 * (i + 0.5) / n
        r = math.sqrt(1 - z * z)
        out.append(V((r * math.cos(ga * i), r * math.sin(ga * i), z)))
    return out


def pompom(M, c, R, n=28, cor="folha", cor_ponta="folha_clara", cor_miolo="folha_escura"):
    """Bola de folhas: miolo e folhas pontudas que saem da superfície, viradas para cima e para fora."""
    c = V(c)
    M.bola(c, R * 0.78, cor_miolo, seg=12)
    for k, nn in enumerate(fib_esfera(n)):
        if nn.z < -0.82:
            continue
        tu = UP - nn * nn.dot(UP)
        tu = norm(tu) if tu.length > 1e-3 else norm(nn.orthogonal())
        fr = norm(tu * 0.75 + nn * 0.65)
        cima = nn - fr * nn.dot(fr)
        rot = (k * 37) % 30 - 15
        M.folha(c + nn * R * 0.5 - tu * R * 0.18, fr, cima, R * 0.9, R * 0.62, "lanceolada", nt=5, ns=2, curva=-22,
                dobra=0.45, rol=rot, cor=cor, cor_ponta=cor_ponta, t_ponta=0.62, cor_baixo=cor_miolo)


def suporte_pes(n, r, z_topo, cor, abre=12.0, raio_pe=0.016, rot0=90.0):
    """n pés palito abertos em volta do eixo, do chão até z_topo (entram no fundo do vaso)."""
    out = []
    for k in range(n):
        a = rad(rot0 + 360 * k / n)
        o = mb.cilindro(raio_pe * 0.7, z_topo + 0.01, cor=cor, r2=raio_pe, seg=12, bisel=0.004)
        mb.transforma(o, rot=("Y", -abre))
        mb.transforma(o, loc=(r, 0, 0))
        mb.transforma(o, rot=("Z", math.degrees(a)))
        out.append(o)
    return out


def anel_tubo(r, z, rt, cor, seg=40):
    pts = [(r * math.cos(2 * math.pi * k / seg), r * math.sin(2 * math.pi * k / seg), z) for k in range(seg)]
    return mb.tubo(pts, rt, cor=cor, raio_curva=0.0, seg=8, fechado=True, nome="anel")


def tronco_contas(M, pts, r0, n_contas, cor="laranja", cor_junta="laranja_escuro", seg=8, afina=0.25, tampa_fim=True):
    """Tronco de gomos (contas encadeadas), como o da árvore de pompons."""
    def rf(t):
        return r0 * (1 - afina * t) * (0.78 + 0.3 * abs(math.sin(math.pi * n_contas * t)) ** 0.6)

    def cf(t):
        return cor_junta if abs(math.sin(math.pi * n_contas * t)) < 0.35 else cor
    M.tubo(pts, rf, n=n_contas * 4, seg=seg, cor=cor, cor_t=cf, tampa_fim=tampa_fim)


def tronco_aneis(M, pts, r0, n_aneis, cor="terracota", cor_anel="terracota_escura", seg=8, afina=0.25):
    def ring(t):
        f = (n_aneis * t) % 1.0
        return max(0.0, 1 - abs(f - 0.5) / 0.14)

    def rf(t):
        return r0 * (1 - afina * t) * (1 + 0.09 * ring(t))

    def cf(t):
        return cor_anel if ring(t) > 0.3 else cor
    M.tubo(pts, rf, n=n_aneis * 3, seg=seg, cor=cor, cor_t=cf)


def roseta(M, c, n, comp, larg, incl0, incl1, curva, perfil="linear", cor="folha", cor_baixo="folha_escura",
           ns=2, nt=6, giro0=0.0, dobra=0.35, cor_ponta=None, seed=1):
    rnd = random.Random(seed)
    for k in range(n):
        f = k / max(1, n - 1)
        g = giro0 + k * 137.5 + rnd.uniform(-10, 10)
        inc = incl0 + (incl1 - incl0) * f + rnd.uniform(-5, 5)
        fr, ci = az(g, inc)
        M.folha(V(c) + V((math.cos(rad(g)), math.sin(rad(g)), 0)) * 0.006, fr, ci,
                comp * (1 - 0.35 * f) * rnd.uniform(0.9, 1.08), larg, perfil, nt=nt, ns=ns,
                curva=curva * (0.6 + 0.8 * f), dobra=dobra, cor=cor, cor_baixo=cor_baixo, cor_ponta=cor_ponta,
                torce=rnd.uniform(-20, 20))


class Planta:
    """Atalho para montar uma planta: Item + Malha de folhas + exportar no catálogo."""

    def __init__(self, cat, pid):
        self.cat = cat
        mb.limpa()
        self.it = mb.Item(pid)
        self.M = Malha()

    def add(self, *o):
        self.it.add(*o)

    def fim(self, rot, grupo, fixacao="apoio", tags=(), colisao=None, mini=(0.55, -1.0, 0.45)):
        ob = self.M.obj("folhagem", angulo=75)
        if ob:
            self.it.add(ob)
        if colisao:
            self.it.colisao(colisao)
        self.cat.exporta(self.it, rot, grupo=grupo, fixacao=fixacao, tags=["planta"] + list(tags), miniatura_dir=mini)


def col_vaso(r, h, z=0.0):
    return ((0, 0, z), (2 * r, 2 * r, h))


# ---------------------------------------------------------------------------------------------------------------------
# As plantas
# ---------------------------------------------------------------------------------------------------------------------
def p_palmeira_areca(cat):
    p = Planta(cat, "planta_palmeira_areca")
    ob, zt, rin = vaso([(0.15, 0), (0.18, 0.08), (0.205, 0.2), (0.215, 0.3), (0.212, 0.36)], "terracota_clara",
                       borda=0.016, sulcos=18, sulco=0.05, cor_sulco="terracota", seg=54, fundo_terra=0.03)
    p.add(ob)
    rnd = random.Random(3)
    frondes = [(10, 82, 1.55, 85), (75, 74, 1.45, 95), (140, 80, 1.6, 85), (200, 70, 1.4, 100), (260, 82, 1.55, 80),
               (320, 74, 1.45, 95), (110, 88, 1.1, 55)]
    for g, inc, cp, cv in frondes:
        b = V((math.cos(rad(g)) * 0.02, math.sin(rad(g)) * 0.02, zt - 0.03))
        fronde(p.M, b, g + rnd.uniform(-6, 6), inc, cp, cv, 14 if cp > 1.2 else 11, 0.33 if cp > 1.2 else 0.26, 0.03,
               ang=60, inicio=0.36, curva_folio=30, v=0.3, p_arco=2.2)
    p.M.bola(V((0, 0, zt)), 0.03, "folha_escura", seg=8)
    p.fim("Palmeira-areca em vaso listrado", "palmeira_areca", "chao", ["grande", "sala"],
          colisao=[col_vaso(0.22, 0.38), ((0, 0, 0.38), (0.5, 0.5, 1.0))])


def p_costela_de_adao(cat):
    p = Planta(cat, "planta_costela_de_adao")
    zv = 0.15
    ob, zt, rin = vaso([(0.12, 0), (0.135, 0.12), (0.145, 0.22), (0.15, 0.25)], "vermelho", borda=0.024, seg=36,
                       fundo_terra=0.03, z=zv, faixas=[(0.0, 0.03, "vermelho_escuro")])
    p.add(ob)
    p.add(suporte_pes(3, 0.085, zv + 0.02, "madeira_clara", abre=14, raio_pe=0.024))
    rnd = random.Random(7)
    folhas = [(20, 0.95, 62, 0.42), (95, 0.78, 55, 0.4), (165, 0.6, 48, 0.37), (230, 0.88, 58, 0.42),
              (300, 0.68, 50, 0.38), (60, 0.45, 40, 0.33), (270, 0.42, 38, 0.32)]
    for g, h, inc, tam in folhas:
        base = V((math.cos(rad(g)) * 0.025, math.sin(rad(g)) * 0.025, zt - 0.03))
        pts = arco(base, g, 86, h, 86 - inc + 20, n=6, p=2.2)
        p.M.tubo(pts, (0.009, 0.0055), n=14, seg=6, cor="verde_medio")
        tg = tangente(pts)
        gl = g + rnd.uniform(-10, 10)
        fr, ci = az(gl, -18)
        p.M.folha(pts[-1] - tg * 0.01, fr, ci, tam, tam * 1.05, "costela", nt=24, ns=4, recortes=(4, 0.72),
                  varre=0.16, recuo=0.10, dobra=0.14, curva=34, p_curva=1.6, esp=0.008, cor="folha",
                  cor_baixo="folha_escura", cor_ponta="folha_clara", t_ponta=0.84, nervura="folha_clara",
                  torce=rnd.uniform(-12, 12))
    p.fim("Costela-de-adão em vaso de pés", "costela_de_adao", "chao", ["grande", "sala"],
          colisao=[col_vaso(0.16, 0.42), ((0, 0, 0.42), (0.6, 0.6, 0.75))])


def p_arvore_pompons(cat):
    p = Planta(cat, "planta_arvore_pompons")
    ob, zt, rin = vaso([(0.17, 0), (0.235, 0.05), (0.265, 0.12), (0.255, 0.19), (0.21, 0.24), (0.19, 0.25)],
                       "azul_celeste", borda=0.03, seg=40, fundo_terra=0.03, cor_terra="terracota_escura")
    p.add(ob)
    tronco_contas(p.M, [(0, 0, zt - 0.04), (0.02, 0, 0.5), (-0.02, 0.01, 0.9), (0.0, 0.0, 1.28)], 0.03, 17,
                  tampa_fim=False)
    tronco_contas(p.M, [(0.01, 0, 0.52), (-0.14, 0.0, 0.58), (-0.3, -0.02, 0.68), (-0.36, -0.03, 0.86)], 0.024, 8,
                  afina=0.15, tampa_fim=False)
    tronco_contas(p.M, [(0.0, 0, 0.66), (0.14, 0.02, 0.74), (0.29, 0.05, 0.86), (0.32, 0.06, 1.0)], 0.023, 7,
                  afina=0.15, tampa_fim=False)
    pompom(p.M, (0.0, 0.0, 1.42), 0.18, n=30)
    pompom(p.M, (-0.36, -0.03, 0.98), 0.14, n=24)
    pompom(p.M, (0.32, 0.06, 1.12), 0.14, n=24)
    p.fim("Árvore de pompons em vaso azul", "arvore_pompons", "chao", ["grande", "sala"],
          colisao=[col_vaso(0.27, 0.27), ((0, 0, 0.27), (0.9, 0.4, 1.35))])


def p_palmeira_tres_troncos(cat):
    p = Planta(cat, "planta_palmeira_tres_troncos")
    ob, zt, rin = vaso([(0.14, 0), (0.18, 0.2), (0.2, 0.3), (0.205, 0.32)], "marrom_escuro", borda=0.016, seg=36,
                       fundo_terra=0.03, faixas=[(0.27, 0.33, "marrom")])
    p.add(ob)
    troncos = [((0.06, -0.03), (0.16, -0.06), 1.15), ((-0.05, 0.05), (-0.12, 0.10), 1.42),
               ((0.0, -0.05), (0.02, -0.14), 1.72)]
    for k, ((bx, by), (tx, ty), h) in enumerate(troncos):
        pts = [(bx, by, zt - 0.04), (bx + (tx - bx) * 0.3, by + (ty - by) * 0.3, h * 0.4),
               (bx + (tx - bx) * 0.75, by + (ty - by) * 0.75, h * 0.78), (tx, ty, h)]
        tronco_aneis(p.M, pts, 0.034, int(h / 0.075), seg=8, afina=0.3)
        topo = V((tx, ty, h))
        roseta(p.M, topo + V((0, 0, 0.01)), 15, 0.46, 0.05, 72, -18, 28, perfil="linear", ns=2, nt=6, seed=k + 3,
               cor="folha", cor_ponta="folha_clara", dobra=0.4)
        p.M.bola(topo + V((0, 0, 0.012)), 0.034, "folha_escura", seg=8)
    roseta(p.M, (0, 0, zt - 0.01), 11, 0.2, 0.025, 70, 25, 25, perfil="linear", ns=1, nt=6, seed=9)
    p.fim("Palmeira de três troncos", "palmeira_tres_troncos", "chao", ["grande", "sala", "varanda"],
          colisao=[col_vaso(0.21, 0.33), ((0, 0, 0.33), (0.45, 0.45, 1.5))])


def p_espada_suporte(cat):
    p = Planta(cat, "planta_espada_suporte")
    zv = 0.13
    ob, zt, rin = vaso([(0.145, 0), (0.15, 0.2), (0.155, 0.28), (0.157, 0.3)], "azul", borda=0.014, seg=36,
                       fundo_terra=0.03, z=zv)
    p.add(ob)
    for k in range(4):
        a = rad(45 + 90 * k)
        x, y = 0.172 * math.cos(a), 0.172 * math.sin(a)
        p.add(mb.cilindro(0.013, zv + 0.25, x=x, y=y, cor="grafite", seg=12, bisel=0.008))
    p.add(anel_tubo(0.168, 0.05, 0.011, "grafite"))
    p.add(mb.cilindro(0.165, 0.02, z=zv - 0.02, cor="grafite", seg=36, bisel=0.006))
    rnd = random.Random(11)
    for k in range(10):
        g = k * 137.5 + rnd.uniform(-8, 8)
        inc = 86 - (k % 4) * 6 - rnd.uniform(0, 5)
        cp = rnd.uniform(0.72, 1.0) * (1 - 0.06 * (k % 3))
        fr, ci = az(g, inc)
        b = V((math.cos(rad(g)) * 0.03, math.sin(rad(g)) * 0.03, zt - 0.03))
        p.M.folha(b, fr, ci, cp, rnd.uniform(0.075, 0.095), "espada", nt=12, ns=3, curva=rnd.uniform(14, 38),
                  p_curva=2.0, torce=rnd.uniform(-30, 30), dobra=0.3, esp=0.008, cor="folha",
                  cor_baixo="folha_escura", nervura="folha_clara")
    p.fim("Espada-de-são-jorge alta no suporte", "espada_suporte", "chao", ["grande", "sala"],
          colisao=[col_vaso(0.19, 0.45), ((0, 0, 0.45), (0.4, 0.4, 0.85))])


def p_espada_listrada(cat):
    p = Planta(cat, "planta_espada_listrada")
    ob, zt, rin = vaso([(0.085, 0), (0.12, 0.05), (0.13, 0.1), (0.118, 0.15)], "porcelana", borda=0.012, seg=32,
                       fundo_terra=0.025)
    p.add(ob)
    rnd = random.Random(5)
    for k in range(8):
        g = k * 137.5 + rnd.uniform(-8, 8)
        inc = 84 - (k % 3) * 9
        fr, ci = az(g, inc)
        b = V((math.cos(rad(g)) * 0.025, math.sin(rad(g)) * 0.025, zt - 0.02))
        p.M.folha(b, fr, ci, rnd.uniform(0.36, 0.46) * (1 - 0.1 * (k % 3)), rnd.uniform(0.06, 0.072), "espada", nt=19,
                  ns=3, curva=rnd.uniform(8, 22), torce=rnd.uniform(-35, 35), dobra=0.38, esp=0.009,
                  cor="verde_medio", cor_baixo="verde_escuro", listras=("folha_clara", 3))
    p.fim("Espada-de-são-jorge listrada", "espada_listrada", "apoio", ["media", "mesa"],
          colisao=[col_vaso(0.13, 0.55)])


def haste_flor(M, base, topo, curva_lado=(0, 0, 0), r=0.0032, cor="verde_medio"):
    b, t = V(base), V(topo)
    meio = b.lerp(t, 0.5) + V(curva_lado)
    M.tubo([b, b.lerp(meio, 0.6), meio, t], r, n=10, seg=5, cor=cor)
    return norm(t - meio)


def p_flores_ceramica(cat):
    p = Planta(cat, "planta_flores_vaso_ceramica")
    ob, zt, rin = vaso([(0.04, 0), (0.06, 0.05), (0.062, 0.09), (0.045, 0.15), (0.03, 0.18), (0.034, 0.2)],
                       "marrom_claro", borda=0.008, seg=28, fundo_terra=0.012, faixas=[(0.0, 0.025, "marrom")])
    p.add(ob)
    flores = [((0.01, -0.03, 0.4), (0.03, -0.02, 0), "vermelho", "amarelo", 0.045, 5),
              ((-0.05, 0.02, 0.45), (-0.03, 0.01, 0), "azul_claro", "amarelo", 0.04, 5),
              ((-0.07, -0.04, 0.37), (-0.02, -0.02, 0), "rosa_claro", "amarelo_escuro", 0.035, 6),
              ((0.06, 0.03, 0.34), (0.02, 0.02, 0), "laranja", "amarelo_claro", 0.03, 5)]
    for k, (topo, desv, cor, mio, r, n) in enumerate(flores):
        base = V((0.004 * k - 0.006, 0.003 * k, zt - 0.02))
        d = haste_flor(p.M, base, topo, desv)
        flor(p.M, topo, norm(d + V((0, -0.6, 0.4))), r, n, cor, mio, abertura=14, larg_rel=0.7, rol0=k * 20)
    for g, inc, h in ((30, 40, 0.25), (200, 35, 0.27), (120, 50, 0.3)):
        fr, ci = az(g, inc)
        p.M.folha(V((0, 0, h)), fr, ci, 0.08, 0.03, "lanceolada", nt=6, ns=2, curva=30, cor="folha",
                  cor_baixo="folha_escura")
    p.fim("Flores no vaso de cerâmica", "flores_ceramica", "apoio", ["flores", "mesa"])


def p_jiboia(cat):
    p = Planta(cat, "planta_jiboia")
    ob, zt, rin = vaso([(0.07, 0), (0.08, 0.06), (0.088, 0.11), (0.092, 0.13)], "turquesa", borda=0.012, seg=32,
                       fundo_terra=0.02, faixas=[(0.0, 0.055, "turquesa_escuro")])
    p.add(ob)
    rnd = random.Random(21)
    folhas = [(10, 0.2, 58), (80, 0.18, 50), (150, 0.21, 62), (215, 0.16, 45), (290, 0.19, 55), (340, 0.14, 30),
              (120, 0.1, 25), (250, 0.12, 20), (45, 0.25, 72)]
    for g, h, inc in folhas:
        base = V((math.cos(rad(g)) * 0.015, math.sin(rad(g)) * 0.015, zt - 0.015))
        pts = arco(base, g, 80, h, 80 - inc, n=5, p=1.8)
        p.M.tubo(pts, (0.004, 0.003), n=10, seg=5, cor="folha")
        fr, ci = az(g + rnd.uniform(-15, 15), inc * 0.35)
        tam = rnd.uniform(0.13, 0.17)
        p.M.folha(pts[-1], fr, ci, tam, tam * 0.66, "coracao", nt=10, ns=3, recuo=0.06, dobra=0.22, curva=35,
                  cor="folha_clara", cor_baixo="folha", nervura="verde_lima", torce=rnd.uniform(-15, 15))
    # dois ramos caindo pela borda
    for g, L in ((300, 0.1), (200, 0.08)):  # os ramos param acima da base (a jiboia vai em prateleira)
        gx, gy = math.cos(rad(g)), math.sin(rad(g))
        r0 = 0.09
        pts = [V((gx * 0.04, gy * 0.04, zt - 0.01)), V((gx * (r0 - 0.005), gy * (r0 - 0.005), 0.142)),
               V((gx * (r0 + 0.025), gy * (r0 + 0.025), 0.14)), V((gx * (r0 + 0.035), gy * (r0 + 0.035), 0.14 - L * 0.5)),
               V((gx * (r0 + 0.04), gy * (r0 + 0.04), 0.14 - L))]
        p.M.tubo(pts, 0.003, n=16, seg=5, cor="folha")
        cur = _catmull(pts, 16)
        for k, i in enumerate((6, 9, 12, 15)):
            sx = 1 if k % 2 else -1
            lado = V((-gy, gx, 0)) * sx
            fr = norm(lado * 0.8 + V((gx, gy, 0)) * 0.5 + V((0, 0, -0.2)))
            p.M.folha(cur[i], fr, V((gx, gy, 0.3)), 0.07, 0.05, "coracao", nt=8, ns=2, recuo=0.05, dobra=0.2, curva=30,
                      cor="folha_clara", cor_baixo="folha", nervura="verde_lima")
    p.fim("Jiboia em vaso turquesa", "jiboia", "apoio", ["media", "mesa", "estante"])


def p_flores_vidro(cat):
    p = Planta(cat, "planta_flores_vaso_vidro")
    ob, zt, rin = vaso([(0.045, 0), (0.046, 0.12), (0.044, 0.22)], None, borda=0.004, seg=32, terra=False, mat="vidro")
    p.add(ob)
    p.add(mb.cilindro(0.039, 0.12, z=0.007, cor="agua", seg=28, bisel=0.003))
    flores = [((0.02, -0.03, 0.46), (0.02, -0.02, 0), "vermelho", "amarelo", 0.042, 6),
              ((-0.04, 0.0, 0.43), (-0.03, 0.0, 0), "violeta", "amarelo", 0.045, 5),
              ((0.05, 0.03, 0.42), (0.03, 0.02, 0), "azul_celeste", "branco", 0.038, 5),
              ((-0.01, -0.05, 0.37), (0.0, -0.03, 0), "amarelo", "laranja", 0.04, 5),
              ((0.0, 0.04, 0.4), (0.0, 0.02, 0), "laranja_claro", "vermelho", 0.03, 6)]
    for k, (topo, desv, cor, mio, r, n) in enumerate(flores):
        a = rad(72 * k)
        base = V((0.018 * math.cos(a), 0.018 * math.sin(a), 0.012))
        d = haste_flor(p.M, base, topo, desv, r=0.003)
        flor(p.M, topo, norm(d + V((0, -0.5, 0.3))), r, n, cor, mio, abertura=12, larg_rel=0.7, rol0=k * 15)
    for g, inc, h in ((60, 30, 0.27), (250, 35, 0.3)):
        fr, ci = az(g, inc)
        p.M.folha(V((0, 0, h)), fr, ci, 0.07, 0.028, "lanceolada", nt=6, ns=2, curva=30)
    p.fim("Flores no vaso de vidro", "flores_vidro", "apoio", ["flores", "mesa"])


def p_flores_amarelo(cat):
    p = Planta(cat, "planta_flores_vaso_amarelo")
    ob, zt, rin = vaso([(0.05, 0), (0.07, 0.05), (0.068, 0.1), (0.048, 0.135), (0.05, 0.15)], "amarelo_escuro",
                       borda=0.008, seg=32, fundo_terra=0.012)
    p.add(ob)
    taças = [((0.0, -0.02, 0.36), (0.02, -0.02, 0)), ((-0.05, 0.02, 0.33), (-0.03, 0, 0)),
             ((0.045, 0.03, 0.31), (0.03, 0.01, 0)), ((-0.02, 0.05, 0.38), (0, 0.02, 0))]
    for k, (topo, desv) in enumerate(taças):
        base = V((0.004 * k, -0.003 * k, zt - 0.02))
        d = haste_flor(p.M, base, topo, desv)
        flor(p.M, topo, d, 0.035, 5, "rosa", None, perfil="petala", abertura=62, larg_rel=0.95, curva=-28, nt=5,
             ns=2, dobra=0.4, rol0=k * 30, cor_baixo="rosa_escuro")
        p.M.bola(V(topo) + d * 0.008, 0.012, "rosa_escuro", seg=8)
    topo = (0.04, -0.045, 0.27)
    d = haste_flor(p.M, (0, 0, zt - 0.02), topo, (0.02, -0.02, 0))
    flor(p.M, topo, norm(d + V((0, -0.8, 0.3))), 0.036, 5, "amarelo", "laranja", abertura=10, larg_rel=0.75)
    for g, inc, h in ((100, 30, 0.2), (300, 35, 0.22), (200, 45, 0.24)):
        fr, ci = az(g, inc)
        p.M.folha(V((0, 0, h)), fr, ci, 0.08, 0.03, "lanceolada", nt=6, ns=2, curva=35)
    p.fim("Flores rosa no vaso amarelo", "flores_amarelo", "apoio", ["flores", "mesa"])


def p_flores_turquesa(cat):
    p = Planta(cat, "planta_flores_vaso_turquesa")
    ob, zt, rin = vaso([(0.05, 0), (0.066, 0.05), (0.062, 0.09), (0.034, 0.15), (0.026, 0.19), (0.032, 0.21)],
                       "turquesa_escuro", borda=0.007, seg=32, fundo_terra=0.01)
    p.add(ob)
    lirios = [((0.01, -0.03, 0.43), (0.02, -0.02, 0)), ((-0.05, 0.0, 0.4), (-0.03, 0, 0)),
              ((0.05, 0.03, 0.39), (0.03, 0.02, 0))]
    for k, (topo, desv) in enumerate(lirios):
        base = V((0.003 * k, 0.002 * k, zt - 0.02))
        d = haste_flor(p.M, base, topo, desv)
        dd = norm(d + V((0, -0.7, 0.2)))
        flor(p.M, topo, dd, 0.05, 6, "rosa_escuro", None, perfil="lanceolada", abertura=38, larg_rel=0.42,
             curva=40, nt=5, ns=2, dobra=0.35, rol0=k * 25, cor_baixo="magenta", cor_ponta="rosa")
        p.M.bola(V(topo) + dd * 0.004, 0.009, "magenta", seg=8)
        for j in range(3):
            a = 2 * math.pi * j / 3
            e1 = norm(dd.orthogonal())
            e2 = dd.cross(e1)
            pt = V(topo) + dd * 0.03 + (e1 * math.cos(a) + e2 * math.sin(a)) * 0.008
            p.M.tubo([V(topo), pt], 0.0012, n=2, seg=4, cor="amarelo_claro", tampa_fim=False)
            p.M.bola(pt, 0.0035, "laranja", seg=6)
    for g, inc, h in ((40, 35, 0.27), (220, 30, 0.3)):
        fr, ci = az(g, inc)
        p.M.folha(V((0, 0, h)), fr, ci, 0.09, 0.028, "lanceolada", nt=6, ns=2, curva=35)
    p.fim("Lírios no vaso turquesa", "flores_turquesa", "apoio", ["flores", "mesa"])


def p_zamioculca(cat):
    p = Planta(cat, "planta_zamioculca")
    ob, zt, rin = vaso([(0.05, 0), (0.085, 0.04), (0.097, 0.09), (0.088, 0.14), (0.074, 0.16)], "amarelo",
                       borda=0.01, seg=32, fundo_terra=0.018)
    p.add(ob)
    rnd = random.Random(31)
    hastes = [(20, 84, 0.48, 18), (110, 70, 0.38, 30), (200, 78, 0.44, 22), (290, 66, 0.34, 34), (160, 88, 0.3, 10)]
    for g, inc, cp, cv in hastes:
        base = V((math.cos(rad(g)) * 0.015, math.sin(rad(g)) * 0.015, zt - 0.02))
        pts = arco(base, g, inc, cp, cv, n=6)
        p.M.tubo(pts, (0.008, 0.0035), n=16, seg=6, cor="verde_escuro")
        cur = _catmull(pts, 30)
        lado = V((-math.sin(rad(g)), math.cos(rad(g)), 0))
        nf = 8
        for k in range(nf):
            t = 0.3 + 0.68 * k / (nf - 1)
            i = int(t * (len(cur) - 2))
            d = norm(cur[i + 1] - cur[i])
            s = 1 if k % 2 else -1
            fr = norm(d * 0.55 + lado * s * 0.83 + V((0, 0, 0.1)))
            nr = norm(lado.cross(d))
            nr = nr if nr.z > 0 else -nr
            tam = 0.075 * (0.75 + 0.35 * math.sin(math.pi * (k + 0.5) / nf))
            p.M.folha(cur[i], fr, nr, tam, tam * 0.5, "eliptica", nt=6, ns=2, curva=18, dobra=0.15, esp=0.005,
                      cor="verde_medio", cor_baixo="verde_escuro", torce=rnd.uniform(-10, 10))
        p.M.folha(cur[-1], tangente(pts), V((0, 0, 1)), 0.06, 0.03, "eliptica", nt=6, ns=2, curva=10,
                  cor="verde_medio", cor_baixo="verde_escuro")
    p.fim("Zamioculca em vaso amarelo", "zamioculca", "apoio", ["media", "mesa"])


def p_samambaia_anfora(cat):
    p = Planta(cat, "planta_samambaia_anfora")
    ext = [(0.07, 0), (0.06, 0.03), (0.075, 0.06), (0.125, 0.15), (0.14, 0.24), (0.125, 0.33), (0.075, 0.41),
           (0.062, 0.45), (0.072, 0.49), (0.09, 0.52)]
    ob, zt, rin = vaso(ext, "terracota", borda=0.012, seg=36, fundo_terra=0.03,
                       faixas=[(0.29, 0.35, "grafite_escuro"), (0.0, 0.03, "terracota_escura")])
    p.add(ob)
    for s in (-1, 1):
        pts = [(s * 0.07, 0, 0.47), (s * 0.13, 0, 0.47), (s * 0.155, 0, 0.42), (s * 0.15, 0, 0.36), (s * 0.13, 0, 0.32)]
        p.add(mb.tubo(pts, 0.011, cor="terracota", raio_curva=0.02, seg=10))
    rnd = random.Random(13)
    frondes = [(0, 62, 0.72, 110), (45, 40, 0.66, 100), (95, 66, 0.75, 115), (140, 38, 0.62, 95), (185, 60, 0.7, 108),
               (230, 42, 0.66, 100), (280, 64, 0.74, 112), (325, 40, 0.64, 98), (60, 82, 0.5, 70)]
    for g, inc, cp, cv in frondes:
        b = V((math.cos(rad(g)) * 0.02, math.sin(rad(g)) * 0.02, zt - 0.03))
        fronde(p.M, b, g + rnd.uniform(-6, 6), inc, cp, cv, 10, 0.11, 0.038, ang=72, cor="folha",
               cor_raque="folha_escura", r_raque=(0.006, 0.0025), inicio=0.16, perfil="oval", curva_folio=20, v=0.15,
               perfil_tam=lambda tau: 1.0 - 0.55 * tau ** 1.5)
    p.fim("Samambaia na ânfora", "samambaia_anfora", "chao", ["grande", "sala", "varanda"],
          colisao=[col_vaso(0.15, 0.53), ((0, 0, 0.53), (0.6, 0.6, 0.4))])


# ---- miniaturas
def vasinho(cor, h=0.065, r=0.042, forma="reto", faixas=(), cor_terra="terra", seg=24):
    if forma == "bola":
        ext = [(r * 0.7, 0), (r * 1.0, h * 0.4), (r * 0.98, h * 0.75), (r * 0.85, h)]
    elif forma == "copo":
        ext = [(r * 0.75, 0), (r * 0.95, h * 0.85), (r, h)]
    else:
        ext = [(r * 0.78, 0), (r, h)]
    return vaso(ext, cor, borda=r * 0.2, seg=seg, fundo_terra=h * 0.18, faixas=faixas, cor_terra=cor_terra,
                suave=2 if forma == "bola" else 1)


def cacto_torno(h, r, gomos, cor="verde", x=0.0, y=0.0, z=0.0, forma="bola", seg=None):
    if forma == "bola":
        perfil = [(0, 0), (r * 0.7, 0.002), (r * 0.98, h * 0.3), (r, h * 0.55), (r * 0.82, h * 0.85), (r * 0.4, h * 0.98),
                  (0, h)]
    else:
        perfil = [(0, 0), (r * 0.85, 0.002), (r, h * 0.15), (r, h * 0.8), (r * 0.75, h * 0.95), (r * 0.3, h), (0, h)]
    seg = seg or gomos * 2
    ob = mb.torno(perfil, cor=cor, seg=seg, nome="cacto", angulo=60)
    for v in ob.data.vertices:
        a = math.atan2(v.co.y, v.co.x)
        k = 1 - 0.12 * (0.5 - 0.5 * math.cos(gomos * a))
        v.co.x *= k
        v.co.y *= k
    mb.transforma(ob, loc=(x, y, z))
    return ob


def espinhos(M, c, h, r, n, cor="creme_claro", seed=1):
    rnd = random.Random(seed)
    for k in range(n):
        a = rnd.uniform(0, 2 * math.pi)
        zz = rnd.uniform(0.2, 0.85)
        rr = r * (0.95 if zz < 0.7 else 0.8)
        M.bola(V(c) + V((rr * math.cos(a), rr * math.sin(a), h * zz)), 0.0028, cor, seg=6)


def p_mini_cacto(cat):
    p = Planta(cat, "planta_mini_cacto")
    ob, zt, rin = vasinho("branco", h=0.058, r=0.044, forma="bola", seg=28)
    p.add(ob)
    p.add(cacto_torno(0.066, 0.029, 10, "verde", z=zt - 0.006))
    espinhos(p.M, (0, 0, zt - 0.006), 0.066, 0.029, 10)
    flor(p.M, (0, 0, zt + 0.058), (0, 0, 1), 0.01, 5, "rosa_claro", "amarelo", abertura=25, larg_rel=0.7)
    p.fim("Cactinho bola", "mini_cacto", "apoio", ["mini", "mesa", "suculenta"])


def p_mini_cacto_flor(cat):
    p = Planta(cat, "planta_mini_cacto_flor")
    ob, zt, rin = vasinho("terracota", h=0.06, r=0.04, forma="copo", seg=20)
    p.add(ob)
    z0 = zt - 0.006
    p.add(cacto_torno(0.12, 0.024, 8, "verde_medio", z=z0, forma="coluna"))
    for s, zz, hh in ((1, 0.05, 0.045), (-1, 0.035, 0.035)):
        braco = cacto_torno(hh, 0.012, 6, "verde_medio", forma="coluna", seg=12)
        mb.transforma(braco, loc=(s * 0.026, 0, z0 + zz))
        p.add(braco)
        p.M.tubo([(s * 0.012, 0, z0 + zz - 0.004), (s * 0.03, 0, z0 + zz + 0.004)], 0.008, n=2, seg=6,
                 cor="verde_medio")
    espinhos(p.M, (0, 0, z0), 0.12, 0.024, 5)
    for c, dd in (((0, 0, z0 + 0.122), (0, 0, 1)), ((0.026, 0, z0 + 0.05 + 0.046), (0.2, 0, 1)),
                  ((-0.026, 0, z0 + 0.035 + 0.036), (-0.3, -0.2, 1))):
        flor(p.M, c, dd, 0.013, 5, "vermelho", "amarelo", abertura=30, larg_rel=0.75, r_miolo=0.004)
    p.fim("Cacto com flores", "mini_cacto_flor", "apoio", ["mini", "mesa", "suculenta"])


def p_mini_suculenta(cat):
    p = Planta(cat, "planta_mini_suculenta")
    ob, zt, rin = vasinho("amarelo", h=0.05, r=0.042, forma="bola", seg=28)
    p.add(ob)
    c = V((0, 0, zt - 0.004))
    for anel, (n, comp, larg, inc, g0) in enumerate(((7, 0.056, 0.032, 14, 0), (6, 0.046, 0.03, 40, 25),
                                                     (5, 0.034, 0.025, 66, 10))):
        for k in range(n):
            g = g0 + 360 * k / n
            fr, ci = az(g, inc)
            p.M.folha(c + V((0, 0, anel * 0.006)), fr, ci, comp, larg, "oval", nt=5, ns=1, curva=-18, dobra=0.5,
                      esp=larg * 0.4, cor="verde_claro", cor_baixo="verde_medio", cor_ponta="menta", t_ponta=0.7)
    p.fim("Suculenta", "mini_suculenta", "apoio", ["mini", "mesa", "suculenta"])


def p_mini_babosa(cat):
    p = Planta(cat, "planta_mini_babosa")
    ob, zt, rin = vasinho("terracota", h=0.075, r=0.04, forma="copo", faixas=[(0.06, 0.08, "terracota_escura")])
    p.add(ob)
    rnd = random.Random(17)
    for k in range(8):
        g = k * 137.5
        inc = 82 - (k % 3) * 12
        fr, ci = az(g, inc)
        p.M.folha(V((math.cos(rad(g)) * 0.008, math.sin(rad(g)) * 0.008, zt - 0.006)), fr, ci,
                  rnd.uniform(0.11, 0.16) * (1 - 0.12 * (k % 3)), 0.03, "agulha", nt=6, ns=1, curva=rnd.uniform(15, 30),
                  dobra=0.55, esp=0.01, cor="verde_medio", cor_baixo="verde_escuro", cor_ponta="verde_agua",
                  t_ponta=0.82)
    p.fim("Babosa", "mini_babosa", "apoio", ["mini", "mesa", "suculenta"])


def p_mini_tulipa(cat):
    p = Planta(cat, "planta_mini_tulipa")
    ob, zt, rin = vasinho("creme_claro", h=0.055, r=0.04, forma="bola", faixas=[(0.0, 0.016, "bege")], seg=28)
    p.add(ob)
    topo = V((0.004, -0.004, 0.19))
    d = haste_flor(p.M, (0, 0, zt - 0.01), topo, (0.008, -0.004, 0), r=0.0035)
    flor(p.M, topo - d * 0.006, d, 0.032, 5, "vermelho", None, perfil="petala", abertura=72, larg_rel=0.9, curva=-18,
         nt=5, ns=2, dobra=0.45, cor_baixo="vermelho_escuro")
    p.M.bola(topo + d * 0.004, 0.011, "vermelho_escuro", seg=8)
    for g, inc, cp in ((20, 62, 0.1), (200, 55, 0.085)):
        fr, ci = az(g, inc)
        p.M.folha(V((0, 0, zt - 0.006)), fr, ci, cp, 0.026, "lanceolada", nt=6, ns=2, curva=40, dobra=0.45, esp=0.004)
    p.fim("Tulipa no vasinho", "mini_tulipa", "apoio", ["mini", "mesa", "flores"])


def p_mini_violeta(cat):
    p = Planta(cat, "planta_mini_violeta")
    ob, zt, rin = vasinho("marrom", h=0.05, r=0.042, forma="copo")
    p.add(ob)
    for g, inc in ((0, 18), (95, 25), (180, 15), (270, 22)):
        fr, ci = az(g, inc)
        p.M.folha(V((0, 0, zt - 0.004)), fr, ci, 0.06, 0.016, "linear", nt=5, ns=1, curva=25, dobra=0.4)
    for k, (topo, desv) in enumerate((((0.0, -0.01, 0.12), (0.005, -0.004, 0)), ((-0.03, 0.015, 0.105), (-0.01, 0, 0)),
                                      ((0.03, 0.02, 0.1), (0.01, 0.004, 0)))):
        d = haste_flor(p.M, (0.003 * k, 0, zt - 0.005), topo, desv, r=0.0025)
        dd = norm(d + V((0, -0.3, 0)))
        flor(p.M, topo, dd, 0.03, 6, "violeta", None, perfil="lanceolada", abertura=40, larg_rel=0.5, curva=25, nt=4,
             ns=1, dobra=0.4, rol0=k * 20, cor_baixo="roxo_escuro", cor_ponta="lilas", t_ponta=0.75)
        p.M.bola(V(topo) + dd * 0.01, 0.005, "amarelo", seg=6)
    p.fim("Violeta no vasinho", "mini_violeta", "apoio", ["mini", "mesa", "flores"])


def p_mini_pileia(cat):
    p = Planta(cat, "planta_mini_pileia")
    ob, zt, rin = vasinho("terracota_clara", h=0.06, r=0.042, forma="copo", seg=18)
    p.add(ob)
    for g, h, inc, tam in ((0, 0.07, 45, 0.047), (75, 0.092, 55, 0.052), (150, 0.06, 35, 0.044), (220, 0.085, 50, 0.05),
                           (295, 0.105, 68, 0.044)):
        base = V((0, 0, zt - 0.006))
        pts = arco(base, g, 82, h, 82 - inc, n=4)
        p.M.tubo(pts, 0.0025, n=5, seg=4, cor="verde_medio", tampa_fim=False)
        fr, ci = az(g, 4)
        p.M.folha(pts[-1] - fr * tam * 0.42 + V((0, 0, 0.002)), fr, ci, tam, tam * 0.95, "redonda", nt=7, ns=3,
                  curva=14, dobra=-0.18, esp=0.0045, cor="folha", cor_baixo="folha_escura")
    p.fim("Pileia no vasinho", "mini_pileia", "apoio", ["mini", "mesa"])


PLANTAS_PACOTE = [
    ("planta_florzinha_pacote", "Florzinha no vaso", "Plants_05", 1.0, "apoio", ["mini", "mesa", "flores"]),
    ("planta_galhos_redondos_pacote", "Galhos de folhas redondas", "Plants_15", 0.55, "apoio", ["media", "mesa"]),
    ("planta_ave_do_paraiso_pacote", "Ave-do-paraíso", "Plants_19", 0.62, "chao", ["grande", "sala"]),
]


def p_pacote(cat, spec):
    pid, rot, nome, esc, fix, tags = spec
    mb.limpa()
    pc = mb.importa_pacote(nome)
    it = mb.Item(pid)
    objs = list(pc.values())
    for o in objs:
        mb.transforma(o, esc=(esc, esc, esc))
    lo, hi = mb.bbox(objs)
    for o in objs:
        mb.transforma(o, loc=(0, 0, -lo.z))
    it.add(objs)
    cat.exporta(it, rot, grupo=nome.lower(), fixacao=fix, pacote=True, tags=["planta"] + tags)


PLANTAS = [
    ("planta_palmeira_areca", p_palmeira_areca), ("planta_costela_de_adao", p_costela_de_adao),
    ("planta_arvore_pompons", p_arvore_pompons), ("planta_palmeira_tres_troncos", p_palmeira_tres_troncos),
    ("planta_espada_suporte", p_espada_suporte), ("planta_espada_listrada", p_espada_listrada),
    ("planta_flores_vaso_ceramica", p_flores_ceramica), ("planta_jiboia", p_jiboia),
    ("planta_flores_vaso_vidro", p_flores_vidro), ("planta_flores_vaso_amarelo", p_flores_amarelo),
    ("planta_flores_vaso_turquesa", p_flores_turquesa), ("planta_zamioculca", p_zamioculca),
    ("planta_samambaia_anfora", p_samambaia_anfora),
    ("planta_mini_cacto", p_mini_cacto), ("planta_mini_cacto_flor", p_mini_cacto_flor),
    ("planta_mini_suculenta", p_mini_suculenta), ("planta_mini_babosa", p_mini_babosa),
    ("planta_mini_tulipa", p_mini_tulipa), ("planta_mini_violeta", p_mini_violeta),
    ("planta_mini_pileia", p_mini_pileia),
]


def plantas(saida, ids):
    cat = mb.Catalogo("plantas", saida, "Plantas")
    for pid, fn in PLANTAS:
        if not ids or pid in ids:
            fn(cat)
    for spec in PLANTAS_PACOTE:
        if not ids or spec[0] in ids:
            p_pacote(cat, spec)
    ordena(cat, [q[0] for q in PLANTAS] + [q[0] for q in PLANTAS_PACOTE])
    cat.salva()


if __name__ == "__main__":
    if "quadros" in CATS:
        quadros()
    if "tapetes" in CATS:
        tapetes()
    if "plantas" in CATS:
        plantas(SAIDA, IDS)
    print("ok decoracao", CATS, IDS)
