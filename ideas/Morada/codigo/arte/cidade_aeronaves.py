"""Aeronaves da biblioteca de cidade do Morada: dirigíveis, aviões, helicópteros, balões e balões temáticos.

Uso (de SP):
    MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/cidade_aeronaves.py -- SP/cidade_out [ids]

Grava SP/cidade_out/aeronaves/ (glb/, miniaturas/, catalogo.json).

Convenções (GUIA_TRANSPORTE.md):
- Escala real: avião de passageiros de 31 a 34 m, helicóptero de 10 a 11 m (com o rotor), balão de 18 a 21 m de altura,
  dirigível de 24 a 30 m.
- Frente para −Y, origem no centro, z = 0 no pé do trem de pouso, no fundo da cesta ou embaixo da gôndola.
  Todas levam extra {"voa": true, "tipo": ..., "animacoes": [...]}.
- Hélices e rotores são filhos com a origem no eixo: {"anima": "girar", "eixo": <eixo glTF>, "velocidade": 720,
  "helice": 1}. Rotor principal no eixo vertical ("y" do glTF), rotor de cauda no lateral ("x"), hélice de avião e de
  dirigível no longitudinal ("z"). Rodas do trem de pouso: {"anima": "girar", "eixo": "x", "velocidade": 240,
  "roda": 1, "raio": r}.
- Chama do maçarico do balão: filho com material luz e {"anima": "piscar", "periodo": 1.6, "suave": 1}. Farol
  anticolisão (luz_vermelha) piscando: {"anima": "piscar", "periodo": 1.2}.
- Luzes de navegação: luz_vermelha na ponta da asa esquerda (+X, a esquerda de quem olha para −Y), luz na direita e na
  cauda. Janelas da cabine com janela / janela_fria / janela_apagada (acendem à noite).
- Porta da cabine do avião e do helicóptero: Item.porta (dobradiça vertical na borda da frente).
- Assentos: Item.slot("assento_...") de 0,5 × 0,5 × 0,9 m na cabine, na cesta e na gôndola.
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

V = Vector
CAT = "aeronaves"
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
SAIDA = ARGS[0] if ARGS else os.path.join(os.path.dirname(mb.AQUI), "cidade_out")
FILTRO = set(ARGS[1:])
MINI = (0.55, -1.0, 0.85)  # três quartos pela frente, um pouco mais de cima
ASSENTO = (0.5, 0.5, 0.9)
HELICE = 720
ROTOR = 720
ROTOR_CAUDA = 1440


# =====================================================================================================================
# Item com filhos animados (hélices, rotores, rodas, chama, farol piscante)
# =====================================================================================================================
class Aero(mb.Item):
    def __init__(self, id_):
        super().__init__(id_)
        self.anims = []

    def anima(self, objs, pivo, dados, nome):
        """Junta objs num filho com a origem em pivo (o eixo de giro) e guarda os extras da animação."""
        ob = mb.junta(objs if isinstance(objs, (list, tuple)) else [objs], nome)
        d = V(pivo)
        ob.data.transform(Matrix.Translation(-d))
        ob.location = d
        self.anims.append((ob, dict(dados)))
        return ob

    def helice(self, objs, pivo, eixo, nome, velocidade=HELICE):
        return self.anima(objs, pivo, {"anima": "girar", "eixo": eixo, "velocidade": velocidade, "helice": 1}, nome)

    def roda(self, objs, pivo, raio, nome, eixo="x"):
        return self.anima(objs, pivo, {"anima": "girar", "eixo": eixo, "velocidade": 240, "roda": 1,
                                       "raio": round(raio, 3)}, nome)

    def pisca(self, objs, pivo, nome, periodo=1.2, suave=False):
        d = {"anima": "piscar", "periodo": periodo}
        if suave:
            d["suave"] = 1
        return self.anima(objs, pivo, d, nome)

    def monta(self):
        if os.environ.get("AERONAVES_TRIS"):
            cont = {}
            for o in self.partes + [ob for ob, _ in self.anims] + [ob for ob, _ in self.interativos]:
                n = o.name.split(".")[0]
                cont[n] = cont.get(n, 0) + sum(len(p.vertices) - 2 for p in o.data.polygons)
            print("tris por parte:", sorted(cont.items(), key=lambda q: -q[1])[:14], flush=True)
        corpo = super().monta()
        for ob, d in self.anims:
            ob.parent = corpo
            for k, v in d.items():
                ob[k] = v
        bpy.context.view_layer.update()
        return corpo

    def lista_anim(self):
        return [dict(nome=ob.name, pivo=mb._gl(ob.location), **d) for ob, d in self.anims]

    def assento(self, nome, x, y, z):
        self.slot(nome, (x, y, z), ASSENTO)


# =====================================================================================================================
# Geometria auxiliar
# =====================================================================================================================
def aeronaves_orienta(ob, centro, normal, cima=(0, 0, 1)):
    """Gira a malha para o −Y local olhar para 'normal' e o +Z local para 'cima'; depois leva a origem a 'centro'."""
    n = V(normal).normalized()
    u = V(cima).normalized()
    if abs(n.dot(u)) > 0.95:
        u = V((0, 1, 0)) if abs(n.y) < 0.9 else V((1, 0, 0))
    u = (u - n * u.dot(n)).normalized()
    yl, zl = -n, u
    xl = yl.cross(zl)
    M = Matrix((xl, yl, zl)).transposed().to_4x4()
    M.translation = V(centro)
    ob.data.transform(M)
    return ob


def aeronaves_placa(l, a, esp, centro, normal, cor="branco", mat="atlas", raio=None, cima=(0, 0, 1), seg=3,
                    bisel=0.0, nome="placa"):
    """Placa de cantos arredondados (janela, moldura), l na horizontal e a na vertical, de frente para 'normal'."""
    r = min(l, a) * 0.3 if raio is None else raio
    ob = mb.extrudado(mb.ret_arredondado(l, a, r, seg), esp, y=-esp / 2, cor=cor, mat=mat, plano="xz", bisel=bisel,
                      nome=nome, liso=False)
    return aeronaves_orienta(ob, centro, normal, cima)


def aeronaves_janela(l, a, centro, normal, mat="janela", moldura="azul_marinho", cima=(0, 0, 1), raio=None):
    """Janela: moldura escura rente ao casco e vidro (material de janela) um pouco para fora."""
    n = V(normal).normalized()
    c = V(centro)
    r = min(l, a) * 0.42 if raio is None else raio
    return [aeronaves_placa(l + 0.12, a + 0.12, 0.06, c + n * 0.0, n, cor=moldura, raio=r + 0.06, cima=cima, seg=1),
            aeronaves_placa(l, a, 0.06, c + n * 0.02, n, cor=None, mat=mat, raio=r, cima=cima, seg=2)]


def aeronaves_arredonda(pts, raio, n=4):
    """Arredonda todos os cantos de um contorno fechado 2D."""
    p = [V(q) for q in pts]
    out = mb._arredonda_cantos(p[-1:] + p + p[:1], raio, n)[1:-1]
    return [(q.x, q.y) for q in out]


def aeronaves_suaviza(pts, n=4):
    """Catmull-Rom pelos pontos (abertos): curva lisa passando por todos."""
    p = [V(q) for q in pts]
    p = [p[0] * 2 - p[1]] + p + [p[-1] * 2 - p[-2]]
    out = []
    for i in range(1, len(p) - 2):
        p0, p1, p2, p3 = p[i - 1], p[i], p[i + 1], p[i + 2]
        for k in range(n):
            t = k / n
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
                              (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(p[-2])
    return out


def aeronaves_tubo_afinado(pts, r0, r1, seg=8, cor="roxo", nome="tubo_afinado", ponta=True):
    """Tubo que afina de r0 a r1 ao longo dos pontos (tentáculos, chifres), com a ponta arredondada."""
    pts = [V(p) for p in pts]
    s = [0.0]
    for a, b in zip(pts, pts[1:]):
        s.append(s[-1] + (b - a).length)
    L = s[-1]
    bm = bmesh.new()
    aneis = []
    nrm = None
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        if nrm is None:
            aux = V((0, 0, 1)) if abs(t.z) < 0.9 else V((1, 0, 0))
            nrm = (aux - t * aux.dot(t)).normalized()
        else:
            nrm = (nrm - t * nrm.dot(t)).normalized()
        b = t.cross(nrm)
        r = r0 + (r1 - r0) * (s[i] / L)
        aneis.append([bm.verts.new(p + (nrm * math.cos(2 * math.pi * k / seg) + b * math.sin(2 * math.pi * k / seg))
                                   * r) for k in range(seg)])
        ult_t = t
    for A, B in zip(aneis, aneis[1:]):
        for k in range(seg):
            bm.faces.new((A[k], A[(k + 1) % seg], B[(k + 1) % seg], B[k]))
    bm.faces.new(aneis[0][::-1])
    if ponta:
        tip = bm.verts.new(pts[-1] + ult_t * r1 * 1.1)
        A = aneis[-1]
        for k in range(seg):
            bm.faces.new((A[k], A[(k + 1) % seg], tip))
    else:
        bm.faces.new(aneis[-1])
    return mb._obj(nome, bm, cor, angulo=70)


def aeronaves_tubo(pontos, r, cor="metal", raio_curva=None, seg=6, nome="tubo", fechado=False, mat="atlas", n_curva=3):
    """Tubo leve (anéis de 'seg' lados) por uma linha 3D; as dobras são arredondadas com poucos pontos (raio_curva,
    padrão 2,5 × r; 0 não arredonda). Pontas fechadas com tampa; fechado=True liga o fim ao começo."""
    rc = 2.5 * r if raio_curva is None else raio_curva
    p = [V(q) for q in pontos]
    if rc > 0 and len(p) > 2:
        p = mb._arredonda_cantos(p[-1:] + p + p[:1], rc, n_curva)[1:-1] if fechado else mb._arredonda_cantos(p, rc,
                                                                                                             n_curva)
    lim = []
    for q in p:
        if not lim or (q - lim[-1]).length > 1e-5:
            lim.append(q)
    p = lim
    if fechado and (p[0] - p[-1]).length < 1e-5:
        p = p[:-1]
    n = len(p)
    bm = bmesh.new()
    aneis = []
    nrm = None
    for i in range(n):
        if fechado:
            t = (p[(i + 1) % n] - p[(i - 1) % n]).normalized()
        else:
            t = (p[min(i + 1, n - 1)] - p[max(i - 1, 0)]).normalized()
        if nrm is None:
            aux = V((0, 0, 1)) if abs(t.z) < 0.9 else V((1, 0, 0))
            nrm = (aux - t * aux.dot(t)).normalized()
        else:
            nrm = (nrm - t * nrm.dot(t)).normalized()
        b = t.cross(nrm)
        aneis.append([bm.verts.new(p[i] + (nrm * math.cos(2 * math.pi * k / seg) + b * math.sin(2 * math.pi * k / seg))
                                   * r) for k in range(seg)])
    pares = list(zip(aneis, aneis[1:])) + ([(aneis[-1], aneis[0])] if fechado else [])
    for A, B in pares:
        for k in range(seg):
            bm.faces.new((A[k], A[(k + 1) % seg], B[(k + 1) % seg], B[k]))
    if not fechado:
        bm.faces.new(aneis[0][::-1])
        bm.faces.new(aneis[-1])
    return mb._obj(nome, bm, cor, mat, angulo=60)


def aeronaves_corta(ob, normal, valores):
    """Corta a malha nos planos normal·p = v (sem apagar nada), para as faixas de cor terem borda reta."""
    nn = V(normal).normalized()
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    for v in valores:
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=nn * v, plane_no=nn, dist=1e-5)
    bm.to_mesh(ob.data)
    bm.free()
    return ob


def aeronaves_estrela(r_ext, r_int, prof, cor="ouro", n=5, nome="estrela"):
    """Estrela facetada (bipirâmide) de frente para −Y, no plano XZ, centrada na origem."""
    bm = bmesh.new()
    frente = bm.verts.new((0, -prof, 0))
    tras = bm.verts.new((0, prof * 0.35, 0))
    anel = []
    for k in range(2 * n):
        r = r_ext if k % 2 == 0 else r_int
        a = math.pi / 2 + math.pi * k / n
        anel.append(bm.verts.new((r * math.cos(a), 0, r * math.sin(a))))
    for k in range(2 * n):
        a, b = anel[k], anel[(k + 1) % (2 * n)]
        bm.faces.new((frente, a, b))
        bm.faces.new((tras, b, a))
    ob = mb._obj(nome, bm, cor, liso=False)
    return ob


def aeronaves_roda(r, larg, centro, cor="borracha", aro="cinza_claro", nome="roda"):
    x, y, z = centro
    return [mb.cilindro(r, larg, x=x, y=y, z=z, cor=cor, eixo="x", seg=12, bisel=r * 0.22, nome=nome),
            mb.cilindro(r * 0.52, larg + 0.04, x=x, y=y, z=z, cor=aro, eixo="x", seg=8, bisel=0, nome=nome + "_aro")]


def aeronaves_anel(r, z, rt, cor, n=24, seg=8):
    """Anel (toro) horizontal de raio r na altura z, tubo de raio rt."""
    pts = [(r * math.cos(2 * math.pi * k / n), r * math.sin(2 * math.pi * k / n), z) for k in range(n)]
    return aeronaves_tubo(pts, rt, cor=cor, fechado=True, raio_curva=0, seg=seg, nome="anel")


def aeronaves_luz(pos, r=0.14, mat="luz", seg=7):
    return mb.esfera(r, *pos, cor=None, mat=mat, seg=seg, nome="luz_nav")


class Corpo:
    """Corpo de anéis (fuselagem, cabine, gôndola) ao longo de Y: aneis = [(y, zc, rx, rz)], rx = 0 fecha num polo."""

    def __init__(self, aneis, seg=24):
        self.a = aneis
        self.seg = seg

    def interp(self, y):
        a = self.a
        if y <= a[0][0]:
            return a[0][1:]
        for p, q in zip(a, a[1:]):
            if p[0] <= y <= q[0]:
                t = (y - p[0]) / (q[0] - p[0]) if q[0] > p[0] else 0.0
                return tuple(p[i] + (q[i] - p[i]) * t for i in (1, 2, 3))
        return a[-1][1:]

    def ponto(self, y, fi, off=0.0):
        zc, rx, rz = self.interp(y)
        return V(((rx + off) * math.cos(fi), y, zc + (rz + off) * math.sin(fi)))

    def normal(self, y, fi):
        e = 0.03
        dy = self.ponto(y + e, fi) - self.ponto(y - e, fi)
        df = self.ponto(y, fi + e) - self.ponto(y, fi - e)
        n = dy.cross(df)
        zc = self.interp(y)[0]
        if n.dot(self.ponto(y, fi) - V((0, y, zc))) < 0:
            n = -n
        return n.normalized()

    def malha(self, cor, nome="corpo", angulo=55):
        bm = bmesh.new()
        n = self.seg
        rows = []
        for y, zc, rx, rz in self.a:
            if rx < 1e-4:
                rows.append([bm.verts.new((0, y, zc))])
            else:
                rows.append([bm.verts.new((rx * math.cos(2 * math.pi * k / n), y, zc + rz * math.sin(2 * math.pi * k / n)))
                             for k in range(n)])
        for A, B in zip(rows, rows[1:]):
            if len(A) > 1 and len(B) > 1:
                for k in range(n):
                    bm.faces.new((A[k], A[(k + 1) % n], B[(k + 1) % n], B[k]))
            elif len(A) == 1:
                for k in range(n):
                    bm.faces.new((A[0], B[(k + 1) % n], B[k]))
            else:
                for k in range(n):
                    bm.faces.new((A[k], A[(k + 1) % n], B[0]))
        if len(rows[0]) > 1:
            bm.faces.new(rows[0])
        if len(rows[-1]) > 1:
            bm.faces.new(rows[-1])
        return mb._obj(nome, bm, cor, angulo=angulo)

    def painel(self, yc, ly, fic, afi, off0, off1, cor="branco", mat="atlas", nu=6, nv=8, p=4.0, nome="painel"):
        """Painel curvo que segue o casco (porta), com cantos arredondados (grade quadrada levada a uma superelipse)."""
        bm = bmesh.new()

        def mapa(s, t):
            if abs(s) < 1e-9 and abs(t) < 1e-9:
                return 0.0, 0.0
            f = max(abs(s), abs(t)) / (abs(s) ** p + abs(t) ** p) ** (1 / p)
            return s * f, t * f

        def pos(s, t, off):
            s2, t2 = mapa(s, t)
            return self.ponto(yc + s2 * ly / 2, fic + t2 * afi / 2, off)

        grades = []
        for off in (off0, off1):
            g = [[bm.verts.new(pos(-1 + 2 * i / nu, -1 + 2 * j / nv, off)) for j in range(nv + 1)] for i in range(nu + 1)]
            grades.append(g)
        for g in grades:
            for i in range(nu):
                for j in range(nv):
                    bm.faces.new((g[i][j], g[i + 1][j], g[i + 1][j + 1], g[i][j + 1]))
        borda = [(i, 0) for i in range(nu)] + [(nu, j) for j in range(nv)] + \
                [(i, nv) for i in range(nu, 0, -1)] + [(0, j) for j in range(nv, 0, -1)]
        a, b = grades
        for k in range(len(borda)):
            i0, j0 = borda[k]
            i1, j1 = borda[(k + 1) % len(borda)]
            bm.faces.new((a[i0][j0], a[i1][j1], b[i1][j1], b[i0][j0]))
        return mb._obj(nome, bm, cor, mat, angulo=60)


def aeronaves_gomos(perfil, n, cores, costura=None, m=3, larg_costura=0.12, inchar=0.05, cor_topo=None,
                    cor_fn=None, nome="envelope", angulo=50, fase=0.0):
    """Envelope em gomos em volta do eixo Z. perfil = [(r, z)] de baixo para cima (r = 0 fecha num polo). Cada gomo
    tem m colunas internas e estufa no meio (inchar); entre os gomos fica uma costura estreita (cor costura). As cores
    dos gomos alternam pela lista 'cores'. cor_topo pinta as faces que tocam o polo de cima (a válvula do balão).
    cor_fn(g, z, costura) -> cor sobrescreve a cor de cada face (listras horizontais)."""
    W = 2 * math.pi / n
    s = W * (larg_costura if costura else 0.0) / 2
    cols = []
    for g in range(n):
        t0 = fase + g * W - W / 2
        cols.append((t0 + s, 0.0, g))
        for k in range(1, m + 1):
            cols.append((t0 + s + (W - 2 * s) * k / (m + 1), k / (m + 1), g))
        if s > 0:
            cols.append((t0 + W - s, 1.0, g))
    rmax = max(r for r, _ in perfil)
    bm = bmesh.new()
    rows = []
    for r, z in perfil:
        if r < 1e-5:
            rows.append([bm.verts.new((0, 0, z))])
            continue
        inch = inchar * (r / rmax)
        rows.append([bm.verts.new((r * (1 + inch * math.sin(math.pi * u)) * math.cos(t),
                                   r * (1 + inch * math.sin(math.pi * u)) * math.sin(t), z)) for t, u, g in cols])
    nc = len(cols)
    cor_faces = []

    def cor_de(i, zf, polo_topo):
        g0, g1 = cols[i][2], cols[(i + 1) % nc][2]
        eh_costura = s > 0 and g0 != g1
        if cor_fn:
            c = cor_fn(g0, zf, eh_costura)
            if c:
                return c
        if polo_topo and cor_topo:
            return cor_topo
        if eh_costura:
            return costura
        return cores[g0 % len(cores)]

    for ri, (A, B) in enumerate(zip(rows, rows[1:])):
        zf = (perfil[ri][1] + perfil[ri + 1][1]) / 2
        topo = len(B) == 1 and ri == len(rows) - 2
        for i in range(nc):
            j = (i + 1) % nc
            if len(A) > 1 and len(B) > 1:
                bm.faces.new((A[i], A[j], B[j], B[i]))
            elif len(A) == 1:
                bm.faces.new((A[0], B[j], B[i]))
            else:
                bm.faces.new((A[i], A[j], B[0]))
            cor_faces.append(cor_de(i, zf, topo))
    ob = mb._obj(nome, bm, cores[0], angulo=angulo)
    grupos = {}
    for fi, c in enumerate(cor_faces):
        grupos.setdefault(c, []).append(fi)
    for c, fs in grupos.items():
        mb.pinta(ob, c, fs)
    return ob


def perfil_classico(z_boca, r_boca, zc, R, achata=1.0, n_baixo=6, n_cima=8, exp=0.8):
    """Perfil de balão de ar quente: boca, saia que abre até o equador (zc, R) e cúpula até o polo."""
    pts = [(r_boca, z_boca)]
    for k in range(1, n_baixo + 1):
        sk = k / n_baixo
        pts.append((r_boca + (R - r_boca) * math.sin(sk * math.pi / 2) ** exp, z_boca + (zc - z_boca) * sk))
    for k in range(1, n_cima + 1):
        a = k / n_cima * math.pi / 2
        pts.append((0.0 if k == n_cima else R * math.cos(a), zc + R * achata * math.sin(a)))
    return pts


def perfil_r(perfil, z):
    for (r0, z0), (r1, z1) in zip(perfil, perfil[1:]):
        if z0 <= z <= z1:
            return r0 + (r1 - r0) * (z - z0) / (z1 - z0) if z1 > z0 else r0
    return 0.0


def ponto_envelope(perfil, z, ang, off=0.0):
    """Ponto na superfície do envelope (sem o estufado dos gomos) na altura z, no ângulo ang (−90° = frente)."""
    r = perfil_r(perfil, z) + off
    a = math.radians(ang)
    return V((r * math.cos(a), r * math.sin(a), z))


def normal_envelope(perfil, z, ang):
    e = 0.05
    p0, p1 = ponto_envelope(perfil, z - e, ang), ponto_envelope(perfil, z + e, ang)
    dz = p1 - p0
    a = math.radians(ang)
    t = V((-math.sin(a), math.cos(a), 0))
    n = t.cross(dz)
    if n.dot(V((math.cos(a), math.sin(a), 0))) < 0:
        n = -n
    return n.normalized()


def aeronaves_saia(z_boca, r_boca, cor="grafite_escuro", seg=24):
    """Fundo escuro logo acima da boca do balão (esconde o interior do envelope)."""
    return mb.torno([(r_boca * 0.995, z_boca + 0.02), (r_boca * 0.6, z_boca + 0.45), (0, z_boca + 0.7)], cor=cor,
                    seg=seg, nome="saia")


# =====================================================================================================================
# Hélices, rotores, motores
# =====================================================================================================================
def aeronaves_helice(n, raio, larg, cor_pa="cinza_claro", cor_cubo="azul", r_cubo=None, comp_cubo=None, passo=22,
                     nome="helice"):
    """Hélice no referencial local: eixo em Y, nariz (cubo) para −Y, pás no plano XZ. Devolve objetos na origem."""
    rc = r_cubo or raio * 0.16
    cc = comp_cubo or rc * 1.6
    objs = []
    for k in range(n):
        pa = mb.superelipsoide(larg, larg * 0.28, raio * 0.94, z=0, cor=cor_pa, e=0.5, e_v=0.5, nu=12, nv=6,
                               nome=nome + "_pa")
        mb.transforma(pa, rot=("Z", passo))
        mb.transforma(pa, rot=("Y", 360 * k / n))
        objs.append(pa)
    cubo = mb.torno([(0, -cc * 0.25), (rc, -cc * 0.25), (rc * 0.98, cc * 0.25), (rc * 0.7, cc * 0.7), (0, cc)],
                    cor=cor_cubo, seg=14, nome=nome + "_cubo")
    mb.transforma(cubo, rot=("X", 90))
    objs.append(cubo)
    return objs


def aeronaves_leva(objs, pos, direcao, cima=(0, 0, 1)):
    for o in objs:
        aeronaves_orienta(o, pos, direcao, cima)
    return objs


def aeronaves_motor(cor="cinza_claro", cor_dentro="metal", L=3.8, R=1.0, nome="motor"):
    """Turbina: nacela (frente em y = 0, para −Y) e o fan (filho animado) com a origem no centro do fan."""
    perfil = [(0.0, 0.62 * L / 3.8), (0.76 * R, 0.62 * L / 3.8), (0.8 * R, 0.12), (0.86 * R, 0.0), (0.96 * R, 0.08),
              (R, 0.5), (0.98 * R, 0.62 * L), (0.8 * R, 0.86 * L), (0.56 * R, L), (0.46 * R, L + 0.05),
              (0.3 * R, L + 0.35), (0.0, L + 0.5)]
    nac = mb.torno(perfil, cor=cor, seg=14, nome=nome)
    mb.pinta_onde(nac, cor_dentro, lambda c, nn: c.z < 0.6 * L / 3.8 and math.hypot(c.x, c.y) < 0.83 * R)
    mb.pinta_onde(nac, "metal_escuro", lambda c, nn: c.z > L - 0.02)
    mb.pinta_onde(nac, "grafite", lambda c, nn: c.z < 0.65 * L / 3.8 and c.z > 0.55 * L / 3.8 and
                  math.hypot(c.x, c.y) < 0.75 * R and nn.z < -0.5)
    mb.transforma(nac, rot=("X", -90))
    yf = 0.62 * L / 3.8 - 0.06
    fan = []
    for k in range(7):
        pa = mb.caixa(0.2 * R, 0.05, 0.66 * R, z=0.06 * R, cor="grafite", bisel=0, nome="pa_fan", liso=False)
        mb.transforma(pa, rot=[("Y", 360 * k / 7), ("Z", 18)])
        fan.append(pa)
    cone = mb.torno([(0, 0), (0.24 * R, 0), (0.18 * R, 0.18 * R), (0, 0.34 * R)], cor="cinza_claro", seg=12,
                    nome="cone_fan")
    mb.transforma(cone, rot=("X", 90))
    fan.append(cone)
    for o in fan:
        mb.transforma(o, loc=(0, yf, 0))
    return [nac], fan, yf


def aeronaves_rotor(n, raio, larg, esp, cor="grafite", r_cubo=0.28, nome="rotor", giro=45):
    """Rotor principal no referencial local (eixo Z, centro na origem)."""
    objs = [mb.cilindro(r_cubo, 0.28, z=-0.1, cor=cor, seg=14, bisel=0.04, nome=nome + "_cubo"),
            mb.esfera(r_cubo * 0.55, z=0.2, cor="cinza", seg=12, nome=nome + "_tampa")]
    for k in range(n):
        pa = mb.caixa(raio - r_cubo * 0.4, larg, esp, x=(raio + r_cubo * 0.4) / 2, z=0.0, cor=cor,
                      bisel=min(larg, esp) * 0.45, seg=2, nome=nome + "_pa")
        mb.transforma(pa, rot=("Z", giro + 360 * k / n))
        objs.append(pa)
    return objs


def aeronaves_asa(meia, esp, z0, envergadura, afina=0.5, diedro=5.0, cor="branco", bisel=0.12, nome="asa"):
    """Meia asa (x >= 0) a partir do contorno 'meia' no plano XY; afina a espessura e sobe (diedro) para a ponta.
    Devolve [direita, esquerda]."""
    ob = mb.extrudado(mb._ccw(meia), esp, z=z0 - esp / 2, cor=cor, bisel=bisel, seg=2, nome=nome)
    tg = math.tan(math.radians(diedro))
    for v in ob.data.vertices:
        f = min(1.0, abs(v.co.x) / envergadura)
        v.co.z = z0 + (v.co.z - z0) * (1 - afina * f) + abs(v.co.x) * tg
    return [ob, mb.espelha_x(ob, nome + "_esq")]


def aeronaves_deriva(contorno, esp, cor="branco", bisel=0.12, nome="deriva", seg=2):
    """Deriva (leme) no plano YZ, centrada em x = 0."""
    return mb.extrudado(mb._ccw(contorno), esp, x=-esp / 2, plano="yz", cor=cor, bisel=bisel, seg=seg, nome=nome)


# =====================================================================================================================
# Cesta do balão (com maçarico, chama animada, cordas, sacos de areia e assentos)
# =====================================================================================================================
def aeronaves_cesta(it, z_boca, r_boca, lado=1.5, alt=1.05, cor="madeira_mel", borda="couro", redonda=False,
                    sacos=4, cor_saco="bege_escuro", z_q=2.55, cor_corda="bege", cor_anel=None):
    ps = []
    h = lado / 2
    if redonda:
        R = h
        ps.append(mb.torno([(0, 0), (R * 0.9, 0), (R, 0.08), (R, alt - 0.04), (R - 0.03, alt), (R - 0.09, alt),
                            (R - 0.09, 0.1), (0, 0.1)], cor=cor, seg=20, nome="cesta"))
        for zz, rr, cc in ((alt, R - 0.02, borda), (alt * 0.55, R + 0.01, borda), (0.12, R + 0.01, borda)):
            ps.append(aeronaves_anel(rr, zz, 0.055 if zz == alt else 0.035, cc, n=18, seg=5))
        cantos = [((R - 0.05) * math.cos(math.radians(45 + 90 * k)), (R - 0.05) * math.sin(math.radians(45 + 90 * k)))
                  for k in range(4)]
    else:
        e = 0.08
        ps.append(mb.caixa(lado, lado, e, cor=cor, bisel=0.02, seg=1, nome="fundo"))
        for sx in (-1, 1):
            ps.append(mb.caixa(e, lado, alt, x=sx * (h - e / 2), cor=cor, bisel=0.02, seg=1, nome="parede"))
            ps.append(mb.caixa(lado - 2 * e + 0.004, e, alt, y=sx * (h - e / 2), cor=cor, bisel=0.02, seg=1,
                               nome="parede"))
        aro = [(x_, y_, alt) for x_, y_ in mb.ret_arredondado(lado, lado, 0.08, 2)]
        ps.append(aeronaves_tubo(aro, 0.055, cor=borda, fechado=True, raio_curva=0, nome="aro"))
        faixa = [(x_ * 1.01, y_ * 1.01, alt * 0.5) for x_, y_ in mb.ret_arredondado(lado, lado, 0.08, 2)]
        ps.append(aeronaves_tubo(faixa, 0.03, cor=borda, fechado=True, raio_curva=0, seg=5, nome="faixa"))
        for sx in (-1, 1):
            for sy in (-1, 1):
                ps.append(mb.cilindro(0.05, alt, x=sx * (h - 0.02), y=sy * (h - 0.02), cor=borda, seg=8, bisel=0,
                                      nome="poste"))
        cantos = [(sx * (h - 0.06), sy * (h - 0.06)) for sx, sy in ((1, 1), (-1, 1), (-1, -1), (1, -1))]
        ps.append(mb.cilindro(0.14, 0.7, x=0, y=0, z=0.08, cor="vermelho", seg=12, bisel=0.05, nome="gas"))
    # maçarico: quatro hastes do aro até o quadro, quadro, queimador e serpentina
    q = 0.32
    for (cx, cy), (fx, fy) in zip(cantos, ((q, q), (-q, q), (-q, -q), (q, -q))):
        ps.append(aeronaves_tubo([(cx, cy, alt), (fx, fy, z_q)], 0.03, cor="metal", nome="haste"))
    ps.append(aeronaves_tubo([(q, q, z_q), (-q, q, z_q), (-q, -q, z_q), (q, -q, z_q)], 0.035, cor="metal", fechado=True,
                      raio_curva=0.05, nome="quadro"))
    ps.append(aeronaves_tubo([(q, 0, z_q), (-q, 0, z_q)], 0.03, cor="metal", nome="travessa"))
    ps.append(mb.cilindro(0.17, 0.42, z=z_q - 0.12, cor="metal_escuro", seg=14, bisel=0.03, nome="queimador"))
    ps.append(aeronaves_anel(0.21, z_q + 0.12, 0.035, "cobre", n=14, seg=6))
    ps.append(mb.cilindro(0.08, 0.12, z=z_q + 0.3, cor="metal", seg=10, nome="bico"))
    # cordas do aro da cesta até o anel da boca
    for k, (cx, cy) in enumerate(cantos):
        a = math.atan2(cy, cx)
        ps.append(aeronaves_tubo([(cx, cy, alt), (r_boca * math.cos(a), r_boca * math.sin(a), z_boca)], 0.035, cor=cor_corda,
                          seg=6, nome="corda"))
        a2 = a + math.pi / 4
        ps.append(aeronaves_tubo([(q * 1.41 * math.cos(a2), q * 1.41 * math.sin(a2), z_q),
                           (r_boca * math.cos(a2), r_boca * math.sin(a2), z_boca)], 0.03, cor=cor_corda, seg=6,
                          nome="corda"))
    ps.append(aeronaves_anel(r_boca, z_boca, 0.07, cor_anel or borda, n=18, seg=5))
    # sacos de areia pendurados por fora
    for k in range(sacos):
        a = math.radians(360 * k / sacos + (0 if sacos > 4 else 0))
        if redonda:
            px, py = (h + 0.13) * math.cos(a), (h + 0.13) * math.sin(a)
        else:
            lado_k = k % 4
            off = ((k // 4) - (sacos // 4 - 1) / 2) * 0.5 if sacos > 4 else 0.0
            px, py = [(h + 0.13, off), (off, h + 0.13), (-h - 0.13, -off), (-off, -h - 0.13)][lado_k]
        ps.append(mb.superelipsoide(0.24, 0.22, 0.34, x=px, y=py, z=alt * 0.25, cor=cor_saco, e=0.7, e_v=0.6, nu=10,
                                    nv=6, nome="saco"))
        ps.append(aeronaves_tubo([(px, py, alt * 0.25 + 0.3), (px * 0.97, py * 0.97, alt)], 0.018, cor=cor_corda, seg=6,
                          nome="amarra"))
    it.add(ps)
    # chama do maçarico (filho que pisca suave)
    zb = z_q + 0.42
    chama = mb.torno([(0, 0), (0.16, 0.08), (0.24, 0.32), (0.2, 0.7), (0.09, 1.05), (0, 1.25)], z=zb, cor=None,
                     mat="luz", seg=12, nome="chama")
    miolo = mb.torno([(0, 0.02), (0.1, 0.1), (0.13, 0.3), (0.06, 0.62), (0, 0.75)], z=zb, cor=None, mat="luz", seg=10,
                     nome="chama_miolo")
    mb.transforma(miolo, loc=(0, -0.0, 0))
    it.pisca([chama, miolo], (0, 0, zb), "chama_macarico", periodo=1.6, suave=True)
    # assentos nos cantos de dentro
    d = h - 0.09 - 0.27 if not redonda else 0.27
    for k, (sx, sy) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
        it.assento(f"assento_{k + 1}", sx * d, sy * d, 0.1 if redonda else 0.08)
    return [((0, 0, 0), (lado, lado, alt))]


# =====================================================================================================================
# Dirigíveis
# =====================================================================================================================
def perfil_dirigivel(L, R, n=16, cheio=0.6, nariz=1.2):
    pts = []
    for k in range(n + 1):
        s = (1 - math.cos(math.pi * k / n)) / 2
        u = s ** nariz
        r = 0.0 if k in (0, n) else R * math.sin(math.pi * u) ** cheio
        pts.append((r, -L / 2 + L * s))
    return pts


def aeronaves_envelope_dirigivel(L, R, zc, cores, costura, n_gomos=10, cheio=0.6, nariz=1.2):
    """Envelope deitado (eixo Y, nariz em −Y) com gomos longitudinais; centro do eixo em z = zc."""
    perfil = perfil_dirigivel(L, R, cheio=cheio, nariz=nariz)
    env = aeronaves_gomos(perfil, n_gomos, cores, costura, m=3, larg_costura=0.1, inchar=0.035, nome="envelope",
                          angulo=55)
    mb.transforma(env, rot=("X", 90))
    mb.transforma(env, loc=(0, 0, zc))
    return env, perfil


def raio_dirigivel(perfil, y):
    """Raio do envelope deitado na posição y (o perfil está em z = −y)."""
    return perfil_r(perfil, -y)


def aeronaves_lemes(contorno, esp, zc, angulos, cor):
    out = []
    for a in angulos:
        f = aeronaves_deriva(aeronaves_arredonda(contorno, 0.8), esp, cor=cor, bisel=0.14, nome="leme")
        mb.transforma(f, rot=("Y", a))
        mb.transforma(f, loc=(0, 0, zc))
        out.append(f)
    return out


def dirigivel_arco_iris(it):
    L, R = 27.0, 7.0
    zc = 2.4 + R - 0.45
    dy = L / 2 - 15
    env, perfil = aeronaves_envelope_dirigivel(L, R, zc, ["verde", "roxo", "lilas", "rosa_escuro", "amarelo",
                                                          "laranja"], "rosa_claro", n_gomos=12)
    # gomos: verde em cima, lilás, rosa e amarelo descendo (como a referência): giro para o verde ficar no topo
    it.add(env)
    it.add(aeronaves_lemes([(y + dy, h) for y, h in ((7.8, 1.6), (14.4, 1.6), (15.7, 7.4), (14.4, 8.4), (11.4, 6.2))],
                           0.42, zc, (0, 90, -90, 180), "lilas"))
    # nariz e cauda: capuz verde, cubos das hélices
    nar = mb.torno([(0, 0), (1.1, 0), (0.9, 0.45), (0, 0.7)], cor="verde", seg=16, nome="capuz")
    mb.transforma(nar, rot=("X", 90))
    mb.transforma(nar, loc=(0, -L / 2 + 0.35, zc))
    cau = mb.torno([(0, 0), (0.9, 0), (0.7, 0.4), (0, 0.6)], cor="verde", seg=16, nome="capuz_cauda")
    mb.transforma(cau, rot=("X", -90))
    mb.transforma(cau, loc=(0, L / 2 - 0.3, zc))
    it.add(nar, cau)
    hf = aeronaves_helice(2, 2.3, 0.55, "cinza_claro", "azul", r_cubo=0.32, comp_cubo=0.7)
    hf.append(mb.cilindro(0.12, 0.5, y=0.25, cor="verde", eixo="y", seg=10, nome="eixo"))
    it.helice(aeronaves_leva(hf, (0, -L / 2 - 0.4, zc), (0, -1, 0)), (0, -L / 2 - 0.4, zc), "z", "helice_nariz")
    ht = aeronaves_helice(2, 2.0, 0.5, "cinza_claro", "roxo", r_cubo=0.28, comp_cubo=0.6)
    ht.append(mb.cilindro(0.11, 0.5, y=0.25, cor="verde", eixo="y", seg=10, nome="eixo"))
    it.helice(aeronaves_leva(ht, (0, L / 2 + 0.35, zc), (0, 1, 0)), (0, L / 2 + 0.35, zc), "z", "helice_cauda")
    # gôndola laranja com janelas azuis e hélice traseira
    g = Corpo([(-3.7, 1.2, 0, 0), (-3.55, 1.2, 0.62, 0.66), (-3.0, 1.2, 1.0, 1.06), (-2.0, 1.2, 1.18, 1.2),
               (0.8, 1.22, 1.16, 1.18), (2.2, 1.28, 0.95, 0.98), (3.2, 1.34, 0.55, 0.6), (3.7, 1.36, 0, 0)], 20)
    go = g.malha("laranja", "gondola")
    mb.pinta_onde(go, "laranja_escuro", lambda c, n: c.z < 0.35)
    it.add(go)
    for lado in (1, -1):
        fi = 0.18 if lado > 0 else math.pi - 0.18
        for yy in (-2.2, -1.0, 0.2, 1.4):
            it.add(aeronaves_janela(0.75, 0.62, g.ponto(yy, fi), g.normal(yy, fi), mat="janela" if yy != 0.2 else
                                    "janela_fria", moldura="azul_marinho"))
    for fi in (math.radians(62), math.radians(118)):
        it.add(aeronaves_janela(0.62, 0.5, g.ponto(-3.12, fi), g.normal(-3.12, fi), mat="janela_fria"))
    hg = aeronaves_helice(2, 0.85, 0.24, "cinza_claro", "roxo", r_cubo=0.16)
    it.helice(aeronaves_leva(hg, (0, 3.85, 1.36), (0, 1, 0)), (0, 3.85, 1.36), "z", "helice_gondola")
    it.add(mb.cilindro(0.1, 0.4, y=3.65, z=1.36, cor="roxo", eixo="y", seg=10, nome="eixo_g"))
    # luzes de navegação nas pontas dos lemes laterais e farol piscante embaixo da gôndola
    it.add(aeronaves_luz((8.05, 14.9 + dy, zc), 0.2, "luz_vermelha"), aeronaves_luz((-8.05, 14.9 + dy, zc), 0.2, "luz"))
    it.add(aeronaves_luz((0, 14.9 + dy, zc + 8.05), 0.2, "luz"))
    it.pisca([aeronaves_luz((0, -0.5, 0.02), 0.16, "luz_vermelha")], (0, -0.5, 0.02), "farol_piscante")
    for k, (x, y) in enumerate(((-0.45, -2.1), (0.45, -2.1), (-0.45, -0.9), (0.45, -0.9))):
        it.assento(["assento_piloto", "assento_copiloto", "assento_1", "assento_2"][k], x, y, 0.35)
    it.colisao([((0, -0.2, 0), (2.5, 7.4, 2.4)), ((0, 0, zc - R), (2 * R, L, 2 * R)),
                ((0, 12.4 + dy, zc - 8.4), (16.8, 6.0, 16.8))])


def dirigivel_laranja_roxo(it):
    L, R = 22.0, 8.0
    zc = 2.3 + R - 0.5
    dy = L / 2 - 12
    env, perfil = aeronaves_envelope_dirigivel(L, R, zc, ["laranja", "roxo"], "lilas", n_gomos=10, cheio=0.5,
                                               nariz=1.1)
    it.add(env)
    it.add(aeronaves_lemes([(y + dy, h) for y, h in ((4.6, 1.6), (10.8, 1.6), (12.6, 7.6), (11.2, 8.8), (7.6, 6.6))],
                           0.45, zc, (45, -45, 135, -135), "verde_lima"))
    nar = mb.torno([(0, 0), (1.3, 0), (1.05, 0.5), (0, 0.8)], cor="azul", seg=16, nome="capuz")
    mb.transforma(nar, rot=("X", 90))
    mb.transforma(nar, loc=(0, -L / 2 + 0.4, zc))
    it.add(nar)
    hf = aeronaves_helice(2, 2.4, 0.55, "cinza_claro", "rosa", r_cubo=0.34, comp_cubo=0.7)
    hf.append(mb.cilindro(0.13, 0.5, y=0.25, cor="azul", eixo="y", seg=10, nome="eixo"))
    it.helice(aeronaves_leva(hf, (0, -L / 2 - 0.45, zc), (0, -1, 0)), (0, -L / 2 - 0.45, zc), "z", "helice_nariz")
    # gôndola verde-água em caixa boleada, faixa verde-limão, janelas e dois motores laterais
    it.add(mb.superelipsoide(3.0, 5.4, 2.5, z=0.25, cor="turquesa", e=0.32, e_v=0.3, nu=28, nv=12, nome="gondola"))
    it.add(mb.superelipsoide(3.2, 5.6, 0.6, z=0.0, cor="verde_lima", e=0.32, e_v=0.6, nu=28, nv=6, nome="faixa_g"))
    for lado in (1, -1):
        for yy in (-1.5, 0.0, 1.5):
            it.add(aeronaves_janela(0.85, 0.75, (lado * 1.5, yy, 1.55), (lado, 0, 0),
                                    mat=random.Random(int(yy * 10) + lado).choice(["janela", "janela_fria",
                                                                                     "janela"])))
    it.add(aeronaves_janela(1.9, 0.8, (0, -2.62, 1.6), (0, -1, 0.35), mat="janela_fria"))
    for lado in (1, -1):
        x = lado * 2.45
        nac = mb.torno([(0, 0), (0.42, 0.1), (0.5, 0.6), (0.45, 1.6), (0.25, 2.0), (0, 2.1)], cor="azul", seg=16,
                       nome="motor")
        mb.transforma(nac, rot=("X", -90))
        mb.transforma(nac, loc=(x, -0.9, 1.35))
        it.add(nac, mb.caixa(1.1, 0.7, 0.24, x=lado * 1.75, y=0.0, z=1.25, cor="azul_medio", bisel=0.08,
                             nome="suporte"))
        hp = aeronaves_helice(3, 0.95, 0.26, "cinza_claro", "verde_lima", r_cubo=0.2)
        it.helice(aeronaves_leva(hp, (x, -1.0, 1.35), (0, -1, 0)), (x, -1.0, 1.35), "z",
                  "helice_motor_" + ("esq" if lado > 0 else "dir"))
    it.add(aeronaves_luz((2.45, 1.25, 1.35), 0.14, "luz_vermelha"), aeronaves_luz((-2.45, 1.25, 1.35), 0.14, "luz"))
    it.add(aeronaves_luz((0, L / 2 + 0.05, zc), 0.2, "luz"))
    it.pisca([aeronaves_luz((0, 0.6, 0.03), 0.16, "luz_vermelha")], (0, 0.6, 0.03), "farol_piscante")
    for k, (x, y) in enumerate(((-0.55, -1.6), (0.55, -1.6), (-0.55, -0.3), (0.55, -0.3))):
        it.assento(["assento_piloto", "assento_copiloto", "assento_1", "assento_2"][k], x, y, 0.45)
    it.colisao([((0, 0, 0), (3.4, 5.8, 2.7)), ((0, 0, zc - R), (2 * R, L, 2 * R)),
                ((0, 9.0 + dy, zc - 7.6), (15.2, 7.0, 15.2))])


# =====================================================================================================================
# Aviões de passageiros
# =====================================================================================================================
def aneis_aviao(y0, y1, r, rz, zc, l_nariz, l_cauda, r_cauda, n_nariz=7, n_cauda=7):
    aneis = []
    for k in range(n_nariz + 1):
        a = k / n_nariz * math.pi / 2
        f = math.sin(a)
        y = y0 + l_nariz * (1 - math.cos(a))
        aneis.append((y, zc - rz * 0.32 * (1 - f), r * f, rz * f))
    ym = y1 - l_cauda
    aneis.append((ym, zc, r, rz))
    topo = zc + rz
    for k in range(1, n_cauda + 1):
        sk = k / n_cauda
        f = 1 - (1 - r_cauda) * sk ** 1.25
        aneis.append((ym + l_cauda * sk, topo - rz * f * 1.0 - rz * 0.08 * sk, r * f, rz * f))
    yz, zz, rr, rzz = aneis[-1]
    aneis.append((yz + 0.35, zz, rr * 0.6, rzz * 0.6))
    aneis.append((yz + 0.5, zz, 0, 0))
    return aneis


def aviao_passageiros(it, L, cor_asa, cor_barriga, cor_motor, motores, faixas_cauda, nariz_cor=None,
                      faixa_corpo=None, cor_winglet=None):
    y0, y1 = -L / 2, L / 2
    r, rz, zc = 2.35, 2.6, 4.1
    fus = Corpo(aneis_aviao(y0, y1, r, rz, zc, 5.6, 10.5, 0.2), 24)
    ob = fus.malha("branco", "fuselagem")
    if nariz_cor:
        aeronaves_corta(ob, (0, 1, 0), [y0 + 8.4, y0 + 10.2])
    if cor_barriga:
        mb.pinta_onde(ob, cor_barriga, lambda c, n: c.z < fus.interp(c.y)[0] - 0.3 * fus.interp(c.y)[2])
    if nariz_cor:
        mb.pinta_onde(ob, nariz_cor, lambda c, n: c.y < y0 + 8.4)
    if faixa_corpo:
        mb.pinta_onde(ob, faixa_corpo, lambda c, n: y0 + 8.4 <= c.y < y0 + 10.2)
    it.add(ob)
    topo = zc + rz
    # asas baixas, enflechadas, com winglets
    env = 15.5 if L > 32 else 14.2
    yle, yte = -4.0, 3.0
    meia = [(0.0, yle), (env, yle + 7.2), (env + 0.35, yle + 7.75), (env, yle + 8.9), (0.0, yte)]
    za = zc - 1.35
    asas = aeronaves_asa(meia, 0.62, za, env, afina=0.5, diedro=5.0, cor=cor_asa, bisel=0.14)
    it.add(asas)
    tg = math.tan(math.radians(5))
    for s in (1, -1):
        wl = aeronaves_deriva(aeronaves_arredonda([(yle + 7.3, -0.1), (yle + 8.85, -0.1), (yle + 9.5, 1.7),
                                                  (yle + 8.9, 1.85)], 0.25), 0.2, cor=cor_winglet or cor_asa,
                              bisel=0.07, nome="winglet", seg=1)
        mb.transforma(wl, rot=("Y", s * 12))
        mb.transforma(wl, loc=(s * (env + 0.1), 0, za + env * tg))
        it.add(wl)
    # empenagem
    der = aeronaves_deriva(aeronaves_arredonda([(y1 - 9.6, topo - 0.7), (y1 - 0.2, topo - 0.7), (y1 + 0.9, topo + 5.4),
                                               (y1 - 2.1, topo + 5.5)], 0.55), 0.5, cor="branco", bisel=0.18)
    aeronaves_corta(der, (0, 0, 1), sorted({topo + q for _, a_, b_ in faixas_cauda for q in (a_, b_)}))
    for cor_f, z_a, z_b in faixas_cauda:
        mb.pinta_onde(der, cor_f, lambda c, n, a=z_a, b=z_b: topo + a <= c.z < topo + b)
    it.add(der)
    zh = topo - 1.25
    meia_h = [(0.0, y1 - 5.8), (5.9, y1 - 1.4), (6.15, y1 - 0.8), (5.9, y1 + 0.2), (0.0, y1 - 1.5)]
    it.add(aeronaves_asa(meia_h, 0.36, zh, 6.0, afina=0.4, diedro=6.0, cor=cor_asa, bisel=0.1, nome="estab"))
    # motores
    pos_m = [(5.6,), (10.2,)] if motores == 4 else [(6.2,)]
    for (xm,) in pos_m:
        for s in (1, -1):
            R = 1.0 if motores == 4 else 1.25
            Lm = 3.8 if motores == 4 else 4.4
            nac, fan, yf = aeronaves_motor(cor_motor, "metal", L=Lm, R=R)
            y_le = yle + 7.2 * xm / env
            yfront = y_le - 2.3
            zw = za + xm * tg
            zm = zw - 0.3 - R - 0.25
            for o in nac + fan:
                mb.transforma(o, loc=(s * xm, yfront, zm))
            it.add(nac)
            it.add(mb.caixa(0.34, 2.6, zw - zm - R * 0.6, x=s * xm, y=yfront + 2.2, z=zm + R * 0.6, cor=cor_motor,
                            bisel=0.12, seg=1, nome="pilone"))
            it.helice(fan, (s * xm, yfront + yf, zm), "z", f"fan_motor_{'esq' if s > 0 else 'dir'}_{int(xm)}",
                      velocidade=900)
    # trem de pouso (rodas animadas)
    yn = y0 + 3.7
    zb = fus.ponto(yn, -math.pi / 2).z
    it.add(mb.cilindro(0.13, zb - 0.42 + 0.2, x=0, y=yn, z=0.42, cor="metal", seg=10, nome="perna_nariz"))
    it.add(mb.caixa(0.7, 0.18, 0.18, y=yn, z=0.34, cor="metal_escuro", bisel=0.05, seg=1, nome="eixo_n"))
    it.roda(aeronaves_roda(0.42, 0.3, (0.27, yn, 0.42)) + aeronaves_roda(0.42, 0.3, (-0.27, yn, 0.42)), (0, yn, 0.42),
            0.42, "roda_nariz")
    ym = 1.4
    for s in (1, -1):
        xg = s * 2.2
        zw = za - 0.2 + abs(xg) * tg
        it.add(mb.cilindro(0.17, zw - 0.55, x=xg, y=ym, z=0.55, cor="metal", seg=10, nome="perna"))
        it.add(mb.caixa(0.9, 0.22, 0.22, x=xg, y=ym, z=0.44, cor="metal_escuro", bisel=0.06, seg=1, nome="eixo"))
        it.roda(aeronaves_roda(0.55, 0.36, (xg + 0.32, ym, 0.55)) + aeronaves_roda(0.55, 0.36, (xg - 0.32, ym, 0.55)),
                (xg, ym, 0.55), 0.55, "roda_" + ("esq" if s > 0 else "dir"))
    # janelas: cabine (acesas) e fileiras de passageiros (mistura que acende à noite)
    rnd = random.Random(int(L * 10))
    yc = y0 + 1.95
    for fi_g in (57, 76, 104, 123):
        fi = math.radians(fi_g)
        it.add(aeronaves_janela(0.72, 0.5, fus.ponto(yc, fi), fus.normal(yc, fi), mat="janela", raio=0.14))
    n_jan = 12 if L > 32 else 11
    for s in (1, -1):
        fi = 0.17 if s > 0 else math.pi - 0.17
        for k in range(n_jan):
            yy = y0 + 9.4 + k * 1.3
            if s > 0 and yy < y0 + 10.6:
                continue
            r_ = rnd.random()
            mat = "janela_apagada" if r_ < 0.3 else ("janela_fria" if r_ < 0.5 else "janela")
            it.add(aeronaves_janela(0.42, 0.66, fus.ponto(yy, fi), fus.normal(yy, fi), mat=mat, raio=0.18))
    # porta da frente, do lado esquerdo (+X), abrindo para fora (dobradiça na borda da frente)
    yd, ly = y0 + 7.4, 1.05
    fic = math.asin(-0.15 / rz)
    afi = 1.95 / rz
    it.add(fus.painel(yd, ly + 0.16, fic, afi + 0.07, -0.05, 0.012, cor="cinza", nome="batente"))
    folha = fus.painel(yd, ly, fic, afi, -0.03, 0.04, cor=nariz_cor or "branco", nome="folha")
    fj = fic + 0.28
    vid = aeronaves_placa(0.3, 0.36, 0.05, fus.ponto(yd, fj, 0.05), fus.normal(yd, fj), cor=None, mat="janela",
                          raio=0.13)
    mac = mb.caixa(0.06, 0.22, 0.05, x=fus.ponto(yd + 0.3, fic, 0.07).x, y=yd + 0.3, z=fus.ponto(yd, fic).z,
                   cor="cinza_medio", bisel=0.02)
    p0 = fus.ponto(yd - ly / 2, fic, 0.04)
    it.porta([folha, vid, mac], (p0.x, yd - ly / 2, zc), eixo="z", angulo=-100, nome="porta_cabine")
    # luzes de navegação, farol piscante e farol de pouso
    tip_z = za + env * tg
    it.add(aeronaves_luz((env + 0.42, yle + 7.75, tip_z), 0.2, "luz_vermelha"),
           aeronaves_luz((-env - 0.42, yle + 7.75, tip_z), 0.2, "luz"))
    it.add(aeronaves_luz((0, fus.a[-1][0] + 0.05, fus.a[-1][1]), 0.16, "luz"))
    it.add(aeronaves_luz((0, yn - 0.2, 1.05), 0.14, "luz"))
    it.pisca([aeronaves_luz((0, -2.0, topo + 0.06), 0.18, "luz_vermelha"),
              aeronaves_luz((0, -2.0, zc - rz - 0.04), 0.16, "luz_vermelha")], (0, -2.0, topo + 0.06),
             "farol_piscante")
    # assentos
    zf = zc - 1.45
    it.assento("assento_piloto", 0.55, y0 + 3.2, zc - 1.25)
    it.assento("assento_copiloto", -0.55, y0 + 3.2, zc - 1.25)
    for k, (x, y) in enumerate(((0.8, -7.0), (-0.8, -7.0), (0.8, -2.0), (-0.8, -2.0), (0.8, 3.0), (-0.8, 3.0))):
        it.assento(f"assento_{k + 1}", x, y, zf)
    it.colisao([((0, 0, 0), (2 * r + 0.2, L + 0.8, topo)), ((0, 1.2, 0.6), (2 * env + 1.0, 9.6, za + env * tg + 2.0)),
                ((0, y1 - 2.6, topo - 1.8), (12.6, 7.2, 7.4))])


def aviao_passageiros_azul(it):
    aviao_passageiros(it, 34.0, "azul", "azul", "cinza_claro", 4,
                      [("azul", 1.4, 2.1), ("azul", 2.8, 3.4), ("azul", 4.2, 6.0)])


def aviao_passageiros_magenta(it):
    aviao_passageiros(it, 31.0, "branco", None, "magenta", 2,
                      [("roxo", 1.6, 3.0), ("magenta", 3.0, 6.0)], nariz_cor="magenta", faixa_corpo="roxo",
                      cor_winglet="magenta")


# =====================================================================================================================
# Helicópteros
# =====================================================================================================================
def helicoptero(it, cor, cor_barriga, esquis):
    dz = 0.3
    aneis = [(-3.15, 1.55, 0, 0), (-3.05, 1.55, 0.55, 0.5), (-2.8, 1.6, 0.95, 0.9), (-2.3, 1.65, 1.15, 1.15),
             (-1.6, 1.72, 1.22, 1.28), (-0.8, 1.78, 1.2, 1.3), (0.0, 1.82, 1.12, 1.25), (0.8, 1.9, 0.95, 1.08),
             (1.6, 2.05, 0.62, 0.7), (2.3, 2.25, 0.34, 0.38), (3.0, 2.35, 0.27, 0.29), (6.3, 2.55, 0.2, 0.22),
             (6.55, 2.55, 0, 0)]
    aneis = [(y, z + dz, rx, rz) for y, z, rx, rz in aneis]
    c = Corpo(aneis, 20)
    ob = c.malha(cor, "cabine")
    yv = -1.3

    def vidro(cc, n):
        zc_, rx_, rz_ = c.interp(cc.y)
        fi = math.degrees(math.atan2((cc.z - zc_) / max(rz_, 1e-3), cc.x / max(rx_, 1e-3)))
        return cc.y < yv and (-18 < fi < 198)
    if cor_barriga:
        mb.pinta_onde(ob, cor_barriga, lambda cc, n: cc.z < c.interp(cc.y)[0] - 0.5 * c.interp(cc.y)[2])
    mb.pinta_onde(ob, None, vidro, mat="janela_apagada")  # bolha grande: escura (acesa vira um farol branco)
    it.add(ob)
    # armação do vidro (linhas escuras sobre o casco)
    linhas = []
    fis = [math.radians(-18), math.radians(198)]
    for fi in fis:
        linhas.append([c.ponto(y, fi, 0.02) for y in [yv - 0.02 - k * 0.2 for k in range(9)]] + [c.ponto(-3.05, fi, 0.02)])
    linhas.append([c.ponto(-3.12 + k * (yv + 3.12) / 9, math.pi / 2, 0.02) for k in range(10)])
    for yy in (yv, -2.3):
        linhas.append([c.ponto(yy, math.radians(-18 + 216 * k / 14), 0.02) for k in range(15)])
    for ln in linhas:
        it.add(aeronaves_tubo(ln, 0.035, cor="grafite_escuro", seg=5, raio_curva=0, nome="armacao"))
    # janelas laterais e porta do lado esquerdo (+X)
    yd, ly = -0.45, 1.45
    zc_d, rx_d, rz_d = c.interp(yd)
    fic, afi = 0.06, 1.3 / rz_d
    c2 = Corpo([(y, z, rx, rz) for y, z, rx, rz in aneis], 20)
    it.add(c2.painel(yd, ly + 0.12, fic, afi + 0.08, -0.05, 0.012, cor="grafite_escuro", nome="batente"))
    folha = c2.painel(yd, ly, fic, afi, -0.03, 0.04, cor=cor, nome="folha")
    fj = fic + 0.22
    vid = c2.painel(yd + 0.05, ly * 0.66, fj, afi * 0.42, 0.0, 0.06, cor=None, mat="janela", nome="vidro_porta")
    mac = mb.caixa(0.06, 0.2, 0.05, x=c.ponto(yd + 0.4, fic, 0.07).x, y=yd + 0.4, z=c.ponto(yd, fic).z - 0.1,
                   cor="grafite", bisel=0.02)
    p0 = c.ponto(yd - ly / 2, fic, 0.04)
    it.porta([folha, vid, mac], (p0.x, yd - ly / 2, zc_d), eixo="z", angulo=-100, nome="porta_cabine")
    fi = math.pi - 0.2
    it.add(c2.painel(-0.4, 1.0, fi, 0.62, -0.02, 0.05, cor=None, mat="janela", nome="janela_dir"))
    for s in (1, -1):
        fi = 0.25 if s > 0 else math.pi - 0.25
        it.add(aeronaves_janela(0.42, 0.4, c.ponto(0.85, fi), c.normal(0.85, fi), mat="janela_fria"))
    # capô do motor, entradas de ar e mastro
    zt = c.interp(0.0)[0] + c.interp(0.0)[2]
    it.add(mb.superelipsoide(1.25, 2.3, 0.8, y=0.15, z=zt - 0.2, cor=cor, e=0.4, e_v=0.5, nu=20, nv=8, nome="capo"))
    for s in (1, -1):
        it.add(mb.cilindro(0.22, 0.7, x=s * 0.33, y=-0.82, z=zt + 0.22, cor=cor, eixo="y", seg=14, bisel=0.05,
                           nome="entrada"))
        it.add(mb.cilindro(0.15, 0.1, x=s * 0.33, y=-1.15, z=zt + 0.22, cor="grafite_escuro", eixo="y", seg=12,
                           nome="boca"))
    it.add(mb.cilindro(0.2, 0.6, y=0.25, z=zt + 0.5, cor=cor, r2=0.15, seg=12, nome="mastro"))
    zr = zt + 1.15
    rot = aeronaves_rotor(4, 5.2, 0.36, 0.08, cor="grafite")
    for o in rot:
        mb.transforma(o, loc=(0, 0.25, zr))
    it.helice(rot, (0, 0.25, zr), "y", "rotor_principal", velocidade=ROTOR)
    # cauda: deriva, estabilizador, rotor de cauda
    zb = aneis[-2][1]
    it.add(aeronaves_deriva(aeronaves_arredonda([(5.4, zb - 0.1), (6.6, zb - 0.1), (6.95, zb + 1.75),
                                                (6.35, zb + 1.85)], 0.22), 0.22, cor=cor, bisel=0.07))
    it.add(aeronaves_deriva(aeronaves_arredonda([(5.7, zb - 0.1), (6.5, zb - 0.1), (6.6, zb - 0.75),
                                                (6.2, zb - 0.8)], 0.15), 0.18, cor=cor, bisel=0.06,
                            nome="deriva_baixo"))
    it.add(aeronaves_asa([(0, 4.75), (1.15, 5.0), (1.2, 5.45), (0, 5.55)], 0.13, zb - 0.05, 1.2, afina=0.2,
                         diedro=0, cor=cor, bisel=0.05, nome="estab"))
    yrc, zrc = 6.45, zb + 1.15
    rc = [mb.cilindro(0.11, 0.2, x=0.25, y=yrc, z=zrc, cor="grafite", eixo="x", seg=10, nome="cubo_c")]
    for k in range(2):
        pa = mb.caixa(0.06, 0.17, 0.85, x=0.32, y=0, z=0.0, cor="grafite", bisel=0.03, seg=1, nome="pa_c")
        mb.transforma(pa, rot=("X", 180 * k + 30))
        mb.transforma(pa, loc=(0, yrc, zrc))
        rc.append(pa)
    it.add(mb.cilindro(0.06, 0.15, x=0.12, y=yrc, z=zrc, cor="grafite", eixo="x", seg=8, nome="eixo_c"))
    it.helice(rc, (0.32, yrc, zrc), "x", "rotor_cauda", velocidade=ROTOR_CAUDA)
    # trem de pouso
    zfund = c.interp(-0.5)[0] - c.interp(-0.5)[2]
    if esquis:
        for s in (1, -1):
            it.add(aeronaves_tubo([(s * 0.95, -2.55, 0.36), (s * 0.95, -2.25, 0.08), (s * 0.95, 1.55, 0.08),
                            (s * 0.95, 1.8, 0.2)], 0.08, cor="grafite", raio_curva=0.25, seg=8, nome="esqui"))
        for yy in (-1.4, 0.7):
            zf_ = c.interp(yy)[0] - c.interp(yy)[2] + 0.08
            it.add(aeronaves_tubo([(-0.95, yy, 0.08), (-0.95, yy, 0.42), (-0.55, yy, zf_ + 0.05), (0.55, yy, zf_ + 0.05),
                            (0.95, yy, 0.42), (0.95, yy, 0.08)], 0.06, cor="grafite", raio_curva=0.18, seg=8,
                           nome="travessa"))
    else:
        rr = 0.22
        it.add(aeronaves_tubo([(0, -2.05, c.interp(-2.05)[0] - c.interp(-2.05)[2] + 0.1), (0, -2.15, rr)], 0.06,
                       cor="grafite", nome="perna_n"))
        it.add(mb.caixa(0.36, 0.08, 0.08, y=-2.15, z=rr, cor="grafite", bisel=0.02, nome="garfo"))
        it.roda(aeronaves_roda(rr, 0.13, (0.11, -2.15, rr)) + aeronaves_roda(rr, 0.13, (-0.11, -2.15, rr)),
                (0, -2.15, rr), rr, "roda_frente")
        for s in (1, -1):
            it.add(aeronaves_tubo([(s * 0.55, 0.5, zfund + 0.25), (s * 0.95, 0.6, rr)], 0.07, cor="grafite", nome="perna"))
        it.add(mb.cilindro(0.04, 2.1, y=0.6, z=rr, cor="grafite", eixo="x", seg=8, nome="eixo_t"))
        it.roda(aeronaves_roda(rr, 0.15, (1.02, 0.6, rr)) + aeronaves_roda(rr, 0.15, (-1.02, 0.6, rr)), (0, 0.6, rr),
                rr, "rodas_tras")
    # luzes
    it.add(aeronaves_luz((1.25, 5.25, zb - 0.02), 0.09, "luz_vermelha"), aeronaves_luz((-1.25, 5.25, zb - 0.02), 0.09,
                                                                                        "luz"))
    it.add(aeronaves_luz((0, 6.6, zb), 0.08, "luz"), aeronaves_luz((0, -2.55, 1.0), 0.1, "luz"))
    it.pisca([aeronaves_luz((0, 6.5, zb + 1.9), 0.1, "luz_vermelha"),
              aeronaves_luz((0, -0.4, zfund - 0.04), 0.09, "luz_vermelha")], (0, 6.5, zb + 1.9), "farol_piscante")
    zs = zfund + 0.18
    it.assento("assento_piloto", 0.45, -1.75, zs)
    it.assento("assento_copiloto", -0.45, -1.75, zs)
    it.assento("assento_1", 0.45, -0.35, zs)
    it.assento("assento_2", -0.45, -0.35, zs)
    it.colisao([((0, -0.55, 0), (2.5, 5.3, zr - 0.2)), ((0, 4.6, zb - 0.9), (2.6, 4.6, 2.9))])


def helicoptero_vermelho(it):
    helicoptero(it, "vermelho", None, esquis=False)


def helicoptero_verde(it):
    helicoptero(it, "verde_medio", "branco", esquis=True)


# =====================================================================================================================
# Balões listrados
# =====================================================================================================================
def balao_listrado(it, cores, costura, cesta, borda, n=12):
    zb, rb = 4.4, 1.5
    perfil = perfil_classico(zb, rb, 11.6, 6.5, achata=1.08)
    it.add(aeronaves_gomos(perfil, n, cores, costura, m=3, larg_costura=0.1, inchar=0.05, cor_topo="grafite_escuro",
                           nome="envelope"))
    topo = perfil[-1][1]
    it.add(aeronaves_anel(perfil[-2][0] * 0.98, perfil[-2][1] - 0.02, 0.12, costura, n=20))
    it.add(aeronaves_saia(zb, rb))
    col = aeronaves_cesta(it, zb, rb, cor=cesta, borda=borda)
    it.colisao(col + [((0, 0, zb), (13.4, 13.4, topo - zb))])
    return perfil


def balao_listrado_amarelo_azul(it):
    balao_listrado(it, ["amarelo_escuro", "azul_celeste"], "creme_claro", "rosa_escuro", "azul_medio")


def balao_listrado_vermelho_branco(it):
    balao_listrado(it, ["vermelho", "branco"], "vermelho_claro", "madeira", "couro")


# =====================================================================================================================
# Balões temáticos
# =====================================================================================================================
def aeronaves_olho(centro, normal, r, cor_iris="branco", pupila="preto", r_pupila=0.45):
    n = V(normal).normalized()
    c = V(centro)
    return [mb.esfera(r, *c, cor=cor_iris, seg=14, esc=(1, 0.7, 1.12)),
            mb.esfera(r * r_pupila, *(c + n * r * 0.62), cor=pupila, seg=10, esc=(1, 0.6, 1.1)),
            mb.esfera(r * 0.14, *(c + n * r * 0.86 + V((0.25 * r, 0, 0.3 * r))), cor="branco", seg=6)]


def aeronaves_chapeu_pirata(z, R0=5.4, rc=4.0, hc=2.6):
    """Tricórnio: copa em domo, aba virada para cima em três lados, debrum dourado e faixa vermelha."""
    ps = [mb.torno([(0, 0), (rc, 0), (rc * 0.98, hc * 0.45), (rc * 0.8, hc * 0.85), (rc * 0.4, hc * 1.02), (0, hc)],
                   z=z, cor="grafite_escuro", seg=24, nome="copa")]
    ps.append(aeronaves_anel(rc * 1.005, z + 0.35, 0.3, "vermelho", n=24, seg=6))
    # aba: superfície entre o contorno de baixo (r(t)) e a borda de cima (mais alta no meio de cada lado)
    N = 48
    bm = bmesh.new()

    def rt(t):
        return R0 * (1 + 0.16 * math.cos(3 * t))

    def ht(t):
        return 0.5 + 1.25 * (1 - math.cos(3 * t)) / 2

    fora_b, fora_c, dentro_c, dentro_b = [], [], [], []
    for k in range(N):
        t = 2 * math.pi * k / N + math.pi / 2
        r, hh = rt(t), ht(t)
        fora_b.append(bm.verts.new((r * math.cos(t), r * math.sin(t), z)))
        fora_c.append(bm.verts.new((r * 1.07 * math.cos(t), r * 1.07 * math.sin(t), z + hh)))
        dentro_c.append(bm.verts.new(((r * 1.07 - 0.25) * math.cos(t), (r * 1.07 - 0.25) * math.sin(t), z + hh)))
        dentro_b.append(bm.verts.new((rc * 0.9 * math.cos(t), rc * 0.9 * math.sin(t), z + 0.25)))
    for k in range(N):
        j = (k + 1) % N
        for A, B in ((fora_b, fora_c), (fora_c, dentro_c), (dentro_c, dentro_b), (dentro_b, fora_b)):
            bm.faces.new((A[k], A[j], B[j], B[k]))
    ps.append(mb._obj("aba", bm, "grafite_escuro", angulo=50))
    borda = []
    for k in range(N + 1):
        t = 2 * math.pi * k / N + math.pi / 2
        r, hh = rt(t) * 1.07 - 0.12, ht(t)
        borda.append((r * math.cos(t), r * math.sin(t), z + hh + 0.02))
    ps.append(aeronaves_tubo(borda[:-1], 0.15, cor="ouro", fechado=True, raio_curva=0, seg=6, nome="debrum"))
    return ps


def balao_polvo_pirata(it):
    zb, rb = 5.4, 1.9
    perfil = perfil_classico(zb, rb, 12.2, 7.1, achata=0.82, exp=0.6)
    it.add(aeronaves_gomos(perfil, 16, ["azul_medio", "azul_bebe"], "azul_claro", m=2, larg_costura=0.06, inchar=0.07,
                           nome="envelope"))
    topo = perfil[-1][1]
    it.add(aeronaves_chapeu_pirata(topo - 1.1))
    it.add(aeronaves_saia(zb, rb))
    zr = 8.0
    it.add(aeronaves_anel(perfil_r(perfil, zr) + 0.15, zr, 0.2, "cinza", n=28, seg=6))
    # olhos na frente
    for s in (1, -1):
        a = -90 + s * 21
        zo = 10.4
        it.add(aeronaves_olho(ponto_envelope(perfil, zo, a, 0.25), normal_envelope(perfil, zo, a), 0.95))
    # tentáculos em volta da cesta
    rs = 2.7
    for k in range(8):
        a = math.radians(22.5 + 45 * k)
        curto = k in (1, 2)  # os da frente mais curtos, para a cesta aparecer
        base = [(rs, 7.6), (rs + 0.9, 6.3), (rs + 1.45, 4.8), (rs + 1.35, 3.4), (rs + 0.85, 2.3), (rs + 0.95, 1.45),
                (rs + 1.55, 1.3), (rs + 1.9, 1.8)]
        if curto:
            base = [(rs, 7.6), (rs + 0.9, 6.3), (rs + 1.4, 5.0), (rs + 1.3, 3.9), (rs + 1.7, 3.2), (rs + 2.25, 3.5)]
        pts = [(rr * math.cos(a), rr * math.sin(a), zz) for rr, zz in base]
        it.add(aeronaves_tubo_afinado(aeronaves_suaviza(pts, 2), 0.72, 0.13, seg=8, cor="violeta", nome="tentaculo"))
    col = aeronaves_cesta(it, zb, rb, lado=1.7, cor="madeira_media", borda="marrom_escuro", redonda=True, sacos=5,
                          cor_saco="terracota")
    it.colisao(col + [((0, 0, zb), (14.6, 14.6, topo + 2.2 - zb)), ((0, 0, 1.2), (9.6, 9.6, zb - 1.2))])


def aeronaves_crescente(Ro, Ri, ci, zc, Rf, Rb, N=26, M=3):
    """Lua crescente em relevo na frente do envelope: contorno = círculo externo (centro (0, zc), raio Ro) menos o
    interno (centro ci, raio Ri); a face da frente segue uma esfera de raio Rf e o fundo entra no envelope (Rb)."""
    cx, cz = ci
    d = math.hypot(cx, cz - zc)
    a = (Ro ** 2 - Ri ** 2 + d ** 2) / (2 * d)
    hh = math.sqrt(Ro ** 2 - a ** 2)
    ux, uz = cx / d, (cz - zc) / d
    A = (a * ux - hh * uz, zc + a * uz + hh * ux)
    B = (a * ux + hh * uz, zc + a * uz - hh * ux)
    aA = math.atan2(A[1] - zc, A[0])
    aB = math.atan2(B[1] - zc, B[0])
    # arco externo de A até B pelo lado oposto ao círculo interno
    centro_u = math.atan2(uz, ux)

    def arco_externo():
        a0, a1 = aA, aB
        for sg in (1, -1):
            span = (a1 - a0) % (2 * math.pi) if sg > 0 else -((a0 - a1) % (2 * math.pi))
            meio = a0 + span / 2
            if math.cos(meio - centro_u) < 0:
                return [(Ro * math.cos(a0 + span * k / N), zc + Ro * math.sin(a0 + span * k / N)) for k in range(N + 1)]

    def arco_interno():
        b0 = math.atan2(A[1] - cz, A[0] - cx)
        b1 = math.atan2(B[1] - cz, B[0] - cx)
        for sg in (1, -1):
            span = (b1 - b0) % (2 * math.pi) if sg > 0 else -((b0 - b1) % (2 * math.pi))
            meio = b0 + span / 2
            px, pz = cx + Ri * math.cos(meio), cz + Ri * math.sin(meio)
            if math.hypot(px, pz - zc) < Ro:
                return [(cx + Ri * math.cos(b0 + span * k / N), cz + Ri * math.sin(b0 + span * k / N))
                        for k in range(N + 1)]

    ext, inn = arco_externo(), arco_interno()

    def yf(x, z, R):
        q = R * R - x * x - (z - zc) ** 2
        return -math.sqrt(q) if q > 0 else 0.0

    bm = bmesh.new()
    frente, fundo = [], []
    for k in range(N + 1):
        lf, lb = [], []
        for j in range(M + 1):
            t = j / M
            x = ext[k][0] + (inn[k][0] - ext[k][0]) * t
            z = ext[k][1] + (inn[k][1] - ext[k][1]) * t
            lf.append(bm.verts.new((x, yf(x, z, Rf), z)))
            lb.append(bm.verts.new((x, yf(x, z, Rb), z)))
        frente.append(lf)
        fundo.append(lb)
    for k in range(N):
        for j in range(M):
            for G in (frente, fundo):
                q = [G[k][j], G[k + 1][j], G[k + 1][j + 1], G[k][j + 1]]
                if len(set(v.co.to_tuple(5) for v in q)) >= 3:
                    bm.faces.new(q)
        for j in (0, M):
            q = [frente[k][j], frente[k + 1][j], fundo[k + 1][j], fundo[k][j]]
            bm.faces.new(q)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-4)
    ob = mb._obj("crescente", bm, "lilas_claro", angulo=40)
    mb.pinta_onde(ob, "lilas", lambda c, n: abs(n.y) < 0.55)
    bordas = [[(p[0], yf(p[0], p[1], Rf) - 0.02, p[1]) for p in ext], [(p[0], yf(p[0], p[1], Rf) - 0.02, p[1])
                                                                        for p in inn]]
    return ob, bordas, ext, inn


def balao_lua_estrelas(it):
    zb, rb = 5.2, 1.7
    zc, R = 12.6, 7.3
    perfil = perfil_classico(zb, rb, zc, R, achata=1.0, exp=0.7)
    it.add(aeronaves_gomos(perfil, 10, ["azul_medio", "azul"], "pessego", m=3, larg_costura=0.06, inchar=0.04,
                           cor_topo="ouro", nome="envelope"))
    topo = perfil[-1][1]
    it.add(aeronaves_saia(zb, rb))
    lua, bordas, ext, inn = aeronaves_crescente(7.75, 6.3, (2.7, 13.7), zc, 8.25, 6.9)
    it.add(lua)
    for b in bordas:
        it.add(aeronaves_tubo(b, 0.14, cor="ouro", raio_curva=0, seg=6, nome="debrum"))
    # estrela grande no colo da lua
    est = aeronaves_estrela(3.5, 1.5, 1.25, cor="salmao", nome="estrela_grande")
    mb.transforma(est, rot=("Y", 12))
    it.add(aeronaves_orienta(est, (2.1, -6.4, 13.0), (0.15, -1, 0.05)))
    # estrelinhas douradas pelo envelope e na ponta da lua
    rnd = random.Random(7)
    for k, (zz, ang) in enumerate(((17.5, -40), (18.6, 20), (15.5, 30), (13.0, 60), (16.0, 110), (10.0, 80),
                                   (12.5, 150), (17.0, 200), (9.5, 135), (14.5, 250))):
        r_e = 0.6 + 0.35 * rnd.random()
        e = aeronaves_estrela(r_e, r_e * 0.45, 0.32, cor="ouro", nome="estrelinha")
        mb.transforma(e, rot=("Y", rnd.uniform(-30, 30)))
        it.add(aeronaves_orienta(e, ponto_envelope(perfil, zz, ang, 0.05), normal_envelope(perfil, zz, ang)))
    for p in (ext[0], ext[len(ext) // 2], ext[-1]):
        e = aeronaves_estrela(0.65, 0.3, 0.3, cor="ouro", nome="estrelinha_lua")
        it.add(aeronaves_orienta(e, (p[0] * 1.02, -2.4 if abs(p[0]) > 6 else -3.0, p[1]), (p[0], -1.2, p[1] - zc)))
    zr = 7.6
    it.add(aeronaves_anel(perfil_r(perfil, zr) + 0.08, zr, 0.13, "ouro", n=28))
    col = aeronaves_cesta(it, zb, rb, lado=1.7, cor="madeira_media", borda="marrom_escuro", redonda=True, sacos=0,
                          cor_corda="madeira_clara", cor_anel="ouro")
    it.colisao(col + [((0, 0, zb), (15.6, 16.6, topo - zb))])


def balao_dragao_roxo(it):
    zb, rb = 5.3, 1.8
    zc, R = 12.6, 7.3
    perfil = perfil_classico(zb, rb, zc, R, achata=1.0, exp=0.7)
    it.add(aeronaves_gomos(perfil, 16, ["rosa_bebe", "azul_bebe", "lilas_claro", "rosa_claro"], "branco", m=2,
                           larg_costura=0.05, inchar=0.04, cor_topo="rosa", nome="envelope"))
    topo = perfil[-1][1]
    it.add(aeronaves_saia(zb, rb))
    roxo = "roxo"
    # focinho, mandíbula, boca vermelha, dentes e narinas
    it.add(mb.superelipsoide(8.0, 5.6, 4.0, y=-7.0, z=7.6, cor=roxo, e=0.6, e_v=0.6, nu=18, nv=8, nome="focinho"))
    it.add(mb.superelipsoide(6.6, 4.6, 1.6, y=-6.2, z=6.5, cor=roxo, e=0.6, e_v=0.6, nu=16, nv=8, nome="queixo"))
    it.add(mb.superelipsoide(6.9, 4.9, 0.9, y=-6.75, z=7.2, cor="vermelho_escuro", e=0.55, e_v=0.6, nu=16, nv=6,
                           nome="boca"))
    for x in (-2.3, -0.9, 0.9, 2.3):
        it.add(mb.cilindro(0.03, 0.5, x=x, y=-9.0 + abs(x) * 0.16, z=7.45, cor="branco", r2=0.24, seg=8,
                           nome="dente"))
    for s in (1, -1):
        it.add(mb.esfera(0.42, s * 1.25, -9.55, 10.7, cor="roxo_escuro", seg=10, esc=(1.3, 0.6, 0.7)))
    # testa, sobrancelhas e olhos
    it.add(mb.superelipsoide(8.8, 3.2, 4.4, y=-6.6, z=10.0, cor=roxo, e=0.6, e_v=0.7, nu=16, nv=8, nome="testa"))
    for s in (1, -1):
        sob = mb.superelipsoide(3.3, 2.0, 1.25, x=0, y=0, z=0, cor=roxo, e=0.6, e_v=0.6, nu=14, nv=8,
                                nome="sobrancelha")
        mb.transforma(sob, rot=("Y", s * 16))
        mb.transforma(sob, loc=(s * 2.75, -8.0, 13.9))
        it.add(sob)
        it.add(aeronaves_olho((s * 2.75, -7.95, 12.55), (s * 0.18, -1, 0.05), 1.25, cor_iris="amarelo_escuro",
                              r_pupila=0.5))
    # chifres
    for s in (1, -1):
        pts = [(s * 3.3, -2.6, 17.6), (s * 3.9, -2.7, 18.9), (s * 4.7, -2.3, 19.9), (s * 5.6, -1.5, 20.4)]
        it.add(aeronaves_tubo_afinado(aeronaves_suaviza(pts, 4), 0.85, 0.08, seg=10, cor="marrom", nome="chifre"))
    # asas de morcego nas laterais
    for s in (1, -1):
        contorno = [(x_ * 1.45, z_ * 1.45) for x_, z_ in ((0, 1.7), (2.2, 2.6), (4.8, 2.8), (3.9, 0.7), (3.0, 1.2),
                                                          (2.3, -0.1), (1.4, 0.4), (0.0, -1.0))]
        mem = mb.extrudado(mb._ccw(contorno), 0.14, y=-0.07, plano="xz", cor="vermelho", bisel=0.04, seg=1,
                           nome="asa")
        k_ = 1.45
        ossos = [aeronaves_tubo([(0, 0, 0.4 * k_), (2.2 * k_, 0, 2.6 * k_), (4.8 * k_, 0, 2.8 * k_)], 0.13,
                                cor="marrom_escuro", seg=6, nome="osso"),
                 aeronaves_tubo([(2.2 * k_, 0, 2.55 * k_), (3.9 * k_, 0, 0.75 * k_)], 0.09, cor="marrom_escuro", seg=6,
                                nome="osso"),
                 aeronaves_tubo([(1.9 * k_, 0, 2.3 * k_), (2.3 * k_, 0, -0.05 * k_)], 0.09, cor="marrom_escuro",
                                seg=6, nome="osso")]
        partes = [mem] + ossos
        for o in partes:
            mb.transforma(o, rot=("Z", 25))
            if s < 0:
                o.data.transform(Matrix.Diagonal((-1, 1, 1, 1)))
                o.data.flip_normals()
            mb.transforma(o, loc=(s * 6.6, 1.0, 11.4))
        it.add(partes)
    col = aeronaves_cesta(it, zb, rb, lado=1.6, cor="madeira", borda="marrom_escuro", sacos=8, cor_saco="terracota",
                          cor_corda="madeira_clara")
    it.colisao(col + [((0, -0.9, zb), (14.8, 16.9, topo + 0.6 - zb)), ((0, 1.6, 8.6), (28.0, 3.2, 7.4))])


def balao_abelha(it):
    zb, rb = 4.8, 1.6
    zc, R = 12.3, 7.0
    perfil = perfil_classico(zb, rb, zc, R, achata=0.95, exp=0.75)

    def listras(g, z, costura):
        if z > 12.6:
            return "amarelo"
        return "grafite_escuro" if int((z - 4.4) / 1.9) % 2 == 1 else "amarelo"
    env = aeronaves_gomos(perfil, 12, ["amarelo"], "amarelo_escuro", m=3, larg_costura=0.06, inchar=0.05,
                          nome="envelope")
    aeronaves_corta(env, (0, 0, 1), [4.4 + 1.9 * i for i in range(1, 5)])
    mb.pinta_onde(env, "grafite_escuro", lambda c, n: listras(0, c.z, False) == "grafite_escuro")
    it.add(env)
    topo = perfil[-1][1]
    it.add(aeronaves_saia(zb, rb))
    # rosto: olhos grandes, bochechas e sorriso
    for s in (1, -1):
        a = -90 + s * 19
        zo = 14.6
        it.add(aeronaves_olho(ponto_envelope(perfil, zo, a, 0.15), normal_envelope(perfil, zo, a), 0.9, cor_iris="preto",
                              pupila="grafite_escuro", r_pupila=0.3))
        ab = -90 + s * 34
        bo = mb.esfera(0.75, *ponto_envelope(perfil, 13.2, ab, -0.1), cor="rosa", seg=12, esc=(1, 0.5, 0.7))
        it.add(bo)
    sor = [ponto_envelope(perfil, 13.3 - 0.75 * math.cos(math.radians((k - 6) * 15)) ** 2 * 1.0, -90 + (k - 6) * 3.0,
                          0.06) for k in range(13)]
    it.add(aeronaves_tubo(sor, 0.13, cor="grafite_escuro", raio_curva=0, seg=6, nome="sorriso"))
    # antenas
    for s in (1, -1):
        pts = [(s * 1.4, -0.6, topo - 0.4), (s * 1.9, -1.0, topo + 1.2), (s * 2.7, -1.5, topo + 2.4),
               (s * 3.4, -1.7, topo + 2.9)]
        it.add(aeronaves_tubo_afinado(aeronaves_suaviza(pts, 3), 0.18, 0.12, seg=8, cor="grafite_escuro",
                                      nome="antena", ponta=False))
        it.add(mb.esfera(0.5, s * 3.45, -1.72, topo + 3.0, cor="grafite_escuro", seg=12))
    # asas transparentes nas costas
    for s in (1, -1):
        for k, (rx, ry, ang, zz) in enumerate(((3.2, 1.7, 30, 13.8), (2.4, 1.3, -5, 11.6))):
            asa = mb.extrudado(mb.circulo(1, 24, rx=rx, ry=ry), 0.1, y=-0.05, plano="xz", cor=None, mat="vidro",
                               bisel=0.03, seg=1, nome="asa")
            borda = aeronaves_tubo([(rx * math.cos(2 * math.pi * j / 24), 0, ry * math.sin(2 * math.pi * j / 24))
                             for j in range(24)], 0.07, cor="branco", fechado=True, raio_curva=0, seg=5,
                            nome="asa_borda")
            for o in (asa, borda):
                mb.transforma(o, loc=(rx * 0.9, 0, 0))
                mb.transforma(o, rot=[("Z", 40), ("Y", -ang)])
                if s < 0:
                    o.data.transform(Matrix.Diagonal((-1, 1, 1, 1)))
                    o.data.flip_normals()
                mb.transforma(o, loc=(s * 5.6, 3.2, zz))
            it.add(asa, borda)
    col = aeronaves_cesta(it, zb, rb, lado=1.5, cor="amarelo_escuro", borda="grafite_escuro", sacos=4,
                          cor_saco="bege_escuro")
    it.colisao(col + [((0, 0, zb), (14.2, 14.2, topo + 3.4 - zb)), ((0, 3.4, 10.0), (20.0, 2.6, 6.0))])


# =====================================================================================================================
# Originais: teco-teco, hidroavião, ultraleve
# =====================================================================================================================
def aviao_pequeno(it, cor, cor2, cor_asa, flutuadores=False):
    k = 1.25 if flutuadores else 1.0
    dz = 1.05 if flutuadores else 0.0
    aneis = [(-3.95, 1.72, 0.42, 0.42), (-3.75, 1.72, 0.6, 0.6), (-3.0, 1.78, 0.68, 0.72), (-2.0, 1.92, 0.73, 0.88),
             (-0.8, 1.97, 0.72, 0.9), (0.2, 1.97, 0.62, 0.78), (1.5, 2.06, 0.42, 0.5), (3.0, 2.2, 0.25, 0.3),
             (4.0, 2.3, 0.18, 0.2), (4.18, 2.3, 0, 0)]
    aneis = [(y * k, z * k + dz, rx * k, rz * k) for y, z, rx, rz in aneis]
    c = Corpo(aneis, 18)
    ob = c.malha(cor, "fuselagem")
    zc0 = aneis[3][1]
    mb.pinta_onde(ob, cor2, lambda cc, n: cc.y < -3.0 * k)
    mb.pinta_onde(ob, cor2, lambda cc, n: cc.y >= -3.0 * k and abs(cc.z - (c.interp(cc.y)[0] - 0.05 * k)) < 0.13 * k
                  and abs(cc.x) > 0.1)
    if flutuadores:
        mb.pinta_onde(ob, cor2, lambda cc, n: cc.z < c.interp(cc.y)[0] - 0.55 * c.interp(cc.y)[2])
    it.add(ob)
    it.add(mb.cilindro(0.3 * k, 0.06, y=-3.98 * k, z=aneis[0][1], cor="grafite_escuro", eixo="y", seg=14, nome="grade"))
    # hélice do nariz
    yh, zh = -4.08 * k, aneis[0][1]
    hp = aeronaves_helice(3 if flutuadores else 2, 0.95 * k, 0.2 * k, "grafite", cor2, r_cubo=0.22 * k,
                          comp_cubo=0.42 * k, passo=18)
    it.helice(aeronaves_leva(hp, (0, yh, zh), (0, -1, 0)), (0, yh, zh), "z", "helice")
    # asa alta com montantes
    za = aneis[4][1] + aneis[4][3] + 0.06 * k
    env = (5.6 if not flutuadores else 5.4) * k
    meia = [(0, -2.15 * k), (env - 0.3, -2.1 * k), (env, -1.85 * k), (env, -0.85 * k), (env - 0.3, -0.6 * k),
            (0, -0.6 * k)]
    asas = aeronaves_asa(meia, 0.24 * k, za, env, afina=0.2, diedro=2.0, cor=cor_asa, bisel=0.08 * k)
    for o in asas:
        mb.pinta_onde(o, cor2, lambda cc, n: abs(cc.x) > env - 0.8 * k)
    it.add(asas)
    tg = math.tan(math.radians(2))
    for s in (1, -1):
        it.add(aeronaves_tubo([(s * 0.62 * k, -1.35 * k, c.interp(-1.35 * k)[0] - 0.45 * k),
                        (s * 2.7 * k, -1.35 * k, za + 2.7 * k * tg - 0.1)], 0.05 * k, cor="cinza_claro", nome="montante"))
    # cauda
    zt = aneis[-3][1]
    it.add(aeronaves_deriva(aeronaves_arredonda([(2.5 * k, zt - 0.05), (4.15 * k, zt - 0.05), (4.35 * k, zt + 1.35 * k),
                                                (3.55 * k, zt + 1.42 * k)], 0.2 * k), 0.15 * k, cor=cor2, bisel=0.05))
    it.add(aeronaves_asa([(0, 2.9 * k), (1.65 * k, 3.25 * k), (1.7 * k, 3.75 * k), (0, 4.05 * k)], 0.13 * k, zt,
                         1.7 * k, afina=0.2, diedro=0, cor=cor_asa, bisel=0.05, nome="estab"))
    # janelas: para-brisa, laterais
    for fi_g in (62, 118):
        fi = math.radians(fi_g)
        it.add(aeronaves_janela(0.55 * k, 0.42 * k, c.ponto(-2.55 * k, fi), c.normal(-2.55 * k, fi), mat="janela",
                                raio=0.12 * k))
    for s in (1, -1):
        fi = 0.3 if s > 0 else math.pi - 0.3
        it.add(aeronaves_janela(0.45 * k, 0.38 * k, c.ponto(0.15 * k, fi), c.normal(0.15 * k, fi), mat="janela_fria",
                                raio=0.12 * k))
    fi = math.pi - 0.28
    it.add(aeronaves_janela(0.75 * k, 0.45 * k, c.ponto(-1.25 * k, fi), c.normal(-1.25 * k, fi), mat="janela",
                            raio=0.14 * k))
    # porta do lado esquerdo (+X) com janela
    yd, ly = -1.25 * k, 0.95 * k
    zc_d, rx_d, rz_d = c.interp(yd)
    fic, afi = 0.12, 1.0 * k / rz_d
    it.add(c.painel(yd, ly + 0.1, fic, afi + 0.08, -0.04, 0.012, cor="grafite", nome="batente"))
    folha = c.painel(yd, ly, fic, afi, -0.03, 0.035, cor=cor, nome="folha")
    vid = c.painel(yd, ly * 0.75, fic + 0.3, afi * 0.4, 0.0, 0.05, cor=None, mat="janela", nome="vidro_porta")
    p0 = c.ponto(yd - ly / 2, fic, 0.035)
    mac = mb.caixa(0.05, 0.16, 0.04, x=c.ponto(yd + 0.3 * k, fic, 0.06).x, y=yd + 0.3 * k, z=c.ponto(yd, fic).z,
                   cor="cinza_medio", bisel=0.015)
    it.porta([folha, vid, mac], (p0.x, yd - ly / 2, zc_d), eixo="z", angulo=-95, nome="porta_cabine")
    # trem de pouso ou flutuadores
    if flutuadores:
        for s in (1, -1):
            xf = s * 1.75
            fl = Corpo([(-3.6, 0.42, 0, 0), (-3.45, 0.45, 0.24, 0.2), (-3.0, 0.42, 0.38, 0.36), (-1.8, 0.38, 0.42, 0.38),
                        (1.2, 0.38, 0.4, 0.38), (2.8, 0.45, 0.28, 0.3), (3.7, 0.55, 0.12, 0.14), (3.8, 0.55, 0, 0)], 14)
            fo = fl.malha("amarelo", "flutuador")
            mb.pinta_onde(fo, "branco", lambda cc, n: cc.z > 0.55)
            mb.transforma(fo, loc=(xf, 0, 0))
            it.add(fo)
            for yy in (-1.9, 0.6):
                zf_ = c.interp(yy)[0] - c.interp(yy)[2] * 0.6
                it.add(aeronaves_tubo([(xf, yy, 0.7), (s * 0.5, yy, zf_)], 0.07, cor="cinza_claro", nome="suporte"))
                it.add(aeronaves_tubo([(xf, yy, 0.7), (xf, yy + 0.4, 0.7)], 0.06, cor="cinza_claro", nome="suporte"))
        for s in (1, -1):
            it.add(aeronaves_tubo([(s * 1.75, -1.9, 0.7), (s * 1.75, 0.6, 0.7)], 0.06, cor="cinza_claro", nome="longarina"))
    else:
        rr = 0.3
        for s in (1, -1):
            xw = s * 1.15
            it.add(aeronaves_tubo([(s * 0.35, -1.0, c.interp(-1.0)[0] - c.interp(-1.0)[2] + 0.1), (xw, -1.0, rr + 0.05)], 0.06,
                           cor="cinza_claro", raio_curva=0.1, nome="perna"))
            it.add(mb.superelipsoide(0.3, 0.85, 0.45, x=xw, y=-1.0, z=rr - 0.02, cor=cor, e=0.6, e_v=0.7, nu=14, nv=8,
                                     nome="carenagem"))
        it.add(mb.cilindro(0.035, 2.5, y=-1.0, z=rr, cor="cinza", eixo="x", seg=8, nome="eixo"))
        it.roda(aeronaves_roda(rr, 0.18, (1.15, -1.0, rr)) + aeronaves_roda(rr, 0.18, (-1.15, -1.0, rr)),
                (0, -1.0, rr), rr, "rodas_principais")
        rn = 0.24
        it.add(aeronaves_tubo([(0, -3.25, c.interp(-3.25)[0] - c.interp(-3.25)[2] + 0.1), (0, -3.35, rn)], 0.05,
                       cor="cinza_claro", nome="perna_n"))
        it.add(mb.superelipsoide(0.24, 0.7, 0.36, y=-3.35, z=rn - 0.0, cor=cor, e=0.6, e_v=0.7, nu=12, nv=8,
                                 nome="carenagem_n"))
        it.roda(aeronaves_roda(rn, 0.14, (0, -3.35, rn)), (0, -3.35, rn), rn, "roda_frente")
    # luzes
    it.add(aeronaves_luz((env + 0.03, -1.35 * k, za + env * tg), 0.09 * k, "luz_vermelha"),
           aeronaves_luz((-env - 0.03, -1.35 * k, za + env * tg), 0.09 * k, "luz"))
    it.add(aeronaves_luz((0, 4.2 * k, zt), 0.07 * k, "luz"), aeronaves_luz((1.6 * k, -2.18 * k, za), 0.08 * k, "luz"))
    it.pisca([aeronaves_luz((0, 3.65 * k, zt + 1.48 * k), 0.08 * k, "luz_vermelha")], (0, 3.65 * k, zt + 1.48 * k),
             "farol_piscante")
    zs = c.interp(-1.5 * k)[0] - c.interp(-1.5 * k)[2] + 0.2 * k
    it.assento("assento_piloto", 0.3 * k, -1.75 * k, zs)
    it.assento("assento_copiloto", -0.3 * k, -1.75 * k, zs)
    it.assento("assento_1", 0.3 * k, -0.7 * k, zs + 0.03)
    it.assento("assento_2", -0.3 * k, -0.7 * k, zs + 0.03)
    topo_cab = za + 0.3 * k
    if flutuadores:
        it.colisao([((0, -0.1, 0), (4.4, 9.8, 1.0)), ((0, 0, 1.0), (1.9, 10.6, topo_cab - 1.0)),
                    ((0, -1.7, za - 0.3), (2 * env + 0.2, 2.2, 0.75)), ((0, 4.3, zt), (4.4, 2.2, 1.9))])
    else:
        it.colisao([((0, -0.2, 0), (2.7, 8.5, topo_cab)), ((0, -1.4, za - 0.25), (2 * env + 0.2, 1.8, 0.6)),
                    ((0, 3.4, zt - 0.2), (3.6, 1.8, 1.8))])


def aviao_teco_teco_amarelo(it):
    aviao_pequeno(it, "amarelo", "vermelho", "amarelo")


def hidroaviao_turquesa(it):
    aviao_pequeno(it, "branco", "turquesa_escuro", "branco", flutuadores=True)


def ultraleve_trike(it):
    # carrinho: casulo laranja aberto em cima, com para-brisa
    c = Corpo([(-1.55, 0.95, 0, 0), (-1.45, 0.95, 0.28, 0.25), (-1.15, 0.95, 0.46, 0.42), (-0.5, 1.0, 0.55, 0.5),
               (0.4, 1.05, 0.52, 0.48), (1.0, 1.1, 0.42, 0.4), (1.35, 1.15, 0.28, 0.28), (1.5, 1.15, 0, 0)], 18)
    ob = c.malha("laranja", "casulo")
    mb.pinta_onde(ob, "grafite", lambda cc, n: cc.z < 0.62)
    it.add(ob)
    it.add(mb.superelipsoide(0.62, 0.62, 0.32, y=-0.45, z=1.28, cor="grafite_escuro", e=0.5, nu=14, nv=6,
                             nome="banco"))
    it.add(mb.superelipsoide(0.6, 0.55, 0.32, y=0.3, z=1.38, cor="grafite_escuro", e=0.5, nu=14, nv=6, nome="banco2"))
    it.add(mb.superelipsoide(0.55, 0.18, 0.75, y=-0.12, z=1.4, cor="grafite_escuro", e=0.5, nu=12, nv=6,
                             nome="encosto"))
    pb = mb.superelipsoide(0.95, 0.6, 0.7, y=-1.0, z=1.12, cor=None, mat="vidro", e=0.6, nu=14, nv=6, nome="parabrisa")
    mb.transforma(pb, rot=("X", 0))
    it.add(pb)
    it.add(mb.superelipsoide(0.55, 0.5, 0.55, y=0.95, z=1.1, cor="grafite", e=0.4, nu=12, nv=6, nome="motor"))
    # mastro, trapézio e ponto de suspensão
    zw = 3.55
    hp = (0, -0.25, zw - 0.15)
    it.add(aeronaves_tubo([(0, 0.85, 1.35), hp], 0.06, cor="cinza", nome="mastro"))
    for s in (1, -1):
        it.add(aeronaves_tubo([hp, (s * 0.65, -1.15, 2.0)], 0.04, cor="cinza", nome="trapezio"))
    it.add(aeronaves_tubo([(-0.65, -1.15, 2.0), (0.65, -1.15, 2.0)], 0.04, cor="grafite", nome="barra"))
    it.add(aeronaves_tubo([(0, -1.35, 1.0), (0, -1.0, 1.5), (0, -0.45, 1.65)], 0.035, cor="cinza", nome="garfo_sup"))
    # asa delta com listras de arco-íris
    asa = [(0, -2.3), (4.95, 0.75), (5.15, 1.05), (4.85, 1.2), (0, 0.15)]
    partes = aeronaves_asa(asa, 0.14, zw, 5.1, afina=0.4, diedro=-3.0, cor="vermelho", bisel=0.05, nome="asa")
    faixas = ["vermelho", "laranja", "amarelo", "verde", "azul_celeste", "roxo"]
    for o in partes:
        aeronaves_corta(o, (1, 0, 0), [q * 0.86 * sg for q in range(1, 6) for sg in (1, -1)])
        for i, cor in enumerate(faixas):
            mb.pinta_onde(o, cor, lambda cc, n, a=i: a * 0.86 <= abs(cc.x) < (a + 1) * 0.86 + (9 if a == 5 else 0))
    it.add(partes)
    for s in (1, -1):
        it.add(aeronaves_tubo([(0, -2.25, zw + 0.06), (s * 4.95, 0.75, zw + 0.06 - 4.95 * math.tan(math.radians(3)))], 0.06,
                       cor="grafite", nome="bordo"))
    it.add(aeronaves_tubo([(0, -2.2, zw + 0.08), (0, 0.15, zw + 0.08)], 0.05, cor="grafite", nome="quilha"))
    # hélice traseira (empurradora)
    hpos = (0, 1.3, 1.25)
    it.add(mb.cilindro(0.07, 0.22, y=1.2, z=1.25, cor="grafite", eixo="y", seg=8))
    hh = aeronaves_helice(2, 0.78, 0.17, "madeira", "grafite", r_cubo=0.12, comp_cubo=0.2, passo=-20)
    it.helice(aeronaves_leva(hh, hpos, (0, 1, 0)), hpos, "z", "helice")
    # rodas
    rr = 0.25
    it.add(aeronaves_tubo([(0, -1.35, 1.0), (0, -1.45, rr)], 0.04, cor="cinza", nome="garfo"))
    it.roda(aeronaves_roda(rr, 0.12, (0, -1.45, rr)), (0, -1.45, rr), rr, "roda_frente")
    for s in (1, -1):
        it.add(aeronaves_tubo([(s * 0.3, 0.45, 0.75), (s * 0.9, 0.55, rr)], 0.045, cor="cinza", nome="perna"))
        it.add(aeronaves_tubo([(s * 0.3, 0.9, 0.85), (s * 0.9, 0.55, rr)], 0.035, cor="cinza", nome="perna"))
    it.roda(aeronaves_roda(rr, 0.13, (0.95, 0.55, rr)) + aeronaves_roda(rr, 0.13, (-0.95, 0.55, rr)), (0, 0.55, rr),
            rr, "rodas_tras")
    it.add(aeronaves_luz((5.12, 1.05, zw - 0.27), 0.07, "luz_vermelha"),
           aeronaves_luz((-5.12, 1.05, zw - 0.27), 0.07, "luz"), aeronaves_luz((0, -1.62, 1.0), 0.07, "luz"))
    it.pisca([aeronaves_luz((0, 0.15, zw + 0.16), 0.07, "luz_vermelha")], (0, 0.15, zw + 0.16), "farol_piscante")
    it.assento("assento_piloto", 0, -0.45, 1.2)
    it.assento("assento_1", 0, 0.3, 1.3)
    it.colisao([((0, -0.1, 0), (2.1, 3.1, 2.1)), ((0, -0.7, zw - 0.35), (10.4, 3.6, 0.6))])


# =====================================================================================================================
# Catálogo
# =====================================================================================================================
PECAS = [
    ("dirigivel_arco_iris", dirigivel_arco_iris, "Dirigível em gomos arco-íris", "dirigivel_arco_iris", "dirigivel",
     ["dirigivel", "gomos", "helice"]),
    ("dirigivel_laranja_roxo", dirigivel_laranja_roxo, "Dirigível gorducho laranja e roxo", "dirigivel_gorducho",
     "dirigivel", ["dirigivel", "gomos", "helice"]),
    ("aviao_passageiros_azul", aviao_passageiros_azul, "Avião de passageiros branco e azul", "aviao_quadrimotor",
     "aviao", ["aviao", "passageiros", "turbina"]),
    ("aviao_passageiros_magenta", aviao_passageiros_magenta, "Avião de passageiros branco e magenta", "aviao_bimotor",
     "aviao", ["aviao", "passageiros", "turbina"]),
    ("helicoptero_vermelho", helicoptero_vermelho, "Helicóptero vermelho", "helicoptero_rodas", "helicoptero",
     ["helicoptero", "rotor"]),
    ("helicoptero_verde", helicoptero_verde, "Helicóptero verde com esquis", "helicoptero_esquis", "helicoptero",
     ["helicoptero", "rotor"]),
    ("balao_listrado_amarelo_azul", balao_listrado_amarelo_azul, "Balão listrado amarelo e azul", "balao_listrado",
     "balao", ["balao", "gomos", "cesta"]),
    ("balao_listrado_vermelho_branco", balao_listrado_vermelho_branco, "Balão listrado vermelho e branco",
     "balao_listrado", "balao", ["balao", "gomos", "cesta"]),
    ("balao_polvo_pirata", balao_polvo_pirata, "Balão polvo pirata", "balao_polvo_pirata", "balao",
     ["balao", "tematico", "cesta"]),
    ("balao_lua_estrelas", balao_lua_estrelas, "Balão lua com estrelas", "balao_lua_estrelas", "balao",
     ["balao", "tematico", "cesta"]),
    ("balao_dragao_roxo", balao_dragao_roxo, "Balão dragão roxo", "balao_dragao", "balao",
     ["balao", "tematico", "cesta"]),
    ("aviao_teco_teco_amarelo", aviao_teco_teco_amarelo, "Avião pequeno de hélice (teco-teco)", "aviao_teco_teco",
     "aviao", ["aviao", "helice"]),
    ("hidroaviao_turquesa", hidroaviao_turquesa, "Hidroavião com flutuadores", "hidroaviao", "aviao",
     ["aviao", "helice", "agua"]),
    ("ultraleve_trike_arco_iris", ultraleve_trike, "Ultraleve de asa-delta arco-íris", "ultraleve", "ultraleve",
     ["ultraleve", "helice", "asa_delta"]),
    ("balao_abelha", balao_abelha, "Balão abelha", "balao_abelha", "balao", ["balao", "tematico", "cesta"]),
]


def main():
    cat = mb.Catalogo(CAT, SAIDA, rotulo="Aeronaves")
    for id_, f, rotulo, grupo, tipo, tags in PECAS:
        if FILTRO and id_ not in FILTRO:
            continue
        mb.limpa()
        it = Aero(id_)
        f(it)
        extra = {"voa": True, "tipo": tipo, "animacoes": it.lista_anim(), "altitude": [30, 80]}
        if id_ == "hidroaviao_turquesa":
            extra.update({"pousa_agua": True, "linha_dagua": 0.3})
        cat.exporta(it, rotulo, grupo=grupo, tags=tags, miniatura_dir=MINI, extra=extra)
    ordem = [p[0] for p in PECAS]
    cat.dados["itens"].sort(key=lambda e: ordem.index(e["id"]) if e["id"] in ordem else 99)
    cat.salva()


if __name__ == "__main__":
    main()
