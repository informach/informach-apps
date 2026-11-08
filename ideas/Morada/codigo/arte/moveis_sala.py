"""Móveis de sala do Morada: sofás e espreguiçadeiras (sofas), pufes (pufes) e lareiras (lareiras).

Uso (na pasta SP):
  MOVEIS_THREADS=1 MOVEIS_PACOTE_FBX=... MOVEIS_PACOTE_TEX=... \
    blender-venv/bin/python -I morada-art/moveis_sala.py -- SP/moveis_out [sofas|pufes|lareiras|id1,id2,...]
Sem o segundo argumento, gera as três categorias.
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
R = math.radians


# =====================================================================================================================
# Auxiliares próprios (a base não muda)
# =====================================================================================================================
def se(l, p, a, x=0.0, y=0.0, z=0.0, cor="branco", e=0.2, ev=0.3, nu=24, nv=12, estufa=0.0, nome="se"):
    """Superelipsoide com malha mais leve (sofás têm muitas partes)."""
    return mb.superelipsoide(l, p, a, x, y, z, cor, e=e, e_v=ev, nu=nu, nv=nv, estufa=estufa, nome=nome)


def almof(l, p, a, c=(0, 0, 0), cor="azul", e=0.22, ev=0.55, estufa=0.45, rot=None, nu=24, nv=12, nome="alm"):
    """Almofada fofa centrada em c. l (x) × p (y) × a (espessura, z) antes de girar. rot = [(eixo, graus), ...], a
    última da lista é aplicada primeiro (para encosto: [("Z", giro), ("X", 78)])."""
    ob = mb.superelipsoide(l, p, a, 0, 0, -a / 2, cor, e=e, e_v=ev, estufa=0.0, nu=nu, nv=nv, nome=nome)
    if estufa:
        # estufado liso (o da base usa max() e deixa um vinco em X): k = 0 no meio, 1 na borda
        for v in ob.data.vertices:
            x, y, z = v.co
            u = min(1.0, abs(x) / (l / 2))
            w = min(1.0, abs(y) / (p / 2))
            k = 1 - (1 - u ** 3) * (1 - w ** 3)
            v.co.z = z * (1 - estufa * k)
        ob.data.update()
    M = Matrix.Translation(c)
    for eixo, g in (rot or []):
        M = M @ Matrix.Rotation(R(g), 4, eixo)
    ob.data.transform(M)
    return ob


def rolo(comp, r, c=(0, 0, 0), eixo="y", cor="azul", botao=None, seg=20, nome="rolo"):
    """Rolo (almofada cilíndrica / braço enrolado) com as pontas boleadas e um botão afundado em cada ponta."""
    h = comp
    k = min(r * 0.35, h * 0.2)
    perfil = [(0, 0.012), (r * 0.25, 0.0), (r * 0.7, 0.004), (r * 0.92, k * 0.35), (r, k), (r, h - k),
              (r * 0.92, h - k * 0.35), (r * 0.7, h - 0.004), (r * 0.25, h), (0, h - 0.012)]
    ob = mb.torno(perfil, z=-h / 2, cor=cor, seg=seg, nome=nome, angulo=50)
    ps = [ob]
    if botao:
        for s in (-1, 1):
            ps.append(mb.cilindro(r * 0.16, 0.014, z=s * (h / 2 - 0.006) - 0.007, cor=botao, seg=12, bisel=0.004))
    ob = mb.junta(ps, nome)
    if eixo == "y":
        mb.transforma(ob, rot=("X", 90))
    elif eixo == "x":
        mb.transforma(ob, rot=("Y", 90))
    mb.transforma(ob, loc=c)
    return ob


def ret_cantos(w, h, rb, rt, seg=4, v0=0.0):
    """Contorno (u, v) de um retângulo w × h com cantos de baixo rb e de cima rt (anti-horário). Mesma contagem de
    pontos para qualquer tamanho (serve de seção de varredura)."""
    rb = min(rb, w / 2 - 1e-4, h / 2 - 1e-4)
    rt = min(rt, w / 2 - 1e-4, h / 2 - 1e-4)
    pts = []
    for cx, cz, r, a0 in ((w / 2 - rb, rb, rb, 270), (w / 2 - rt, h - rt, rt, 0), (-w / 2 + rt, h - rt, rt, 90),
                          (-w / 2 + rb, rb, rb, 180)):
        for k in range(seg + 1):
            t = R(a0 + 90 * k / seg)
            pts.append((cx + r * math.cos(t), v0 + cz + r * math.sin(t)))
    return pts


def varre(caminho, secao, cor="branco", up=(0, 0, 1), lado=None, domo=(0, 0), nome="varre", angulo=60, mat="atlas"):
    """Varre uma seção 2D (u, v) por um caminho 3D. secao: lista de pontos (igual em todo o caminho) ou função
    i -> lista (mesma contagem). u vai para o lado (S), v para cima (U). domo=(n_ini, n_fim) fecha as pontas com uma
    calota arredondada; senão a ponta é fechada reta."""
    P = [V(p) for p in caminho]
    n = len(P)
    sec = secao if callable(secao) else (lambda i: secao)

    def quadro(i):
        if i == 0:
            T = P[1] - P[0]
        elif i == n - 1:
            T = P[-1] - P[-2]
        else:
            T = (P[i + 1] - P[i]).normalized() + (P[i] - P[i - 1]).normalized()
        T.normalize()
        if lado is not None:
            S = V(lado)
            S = (S - T * S.dot(T)).normalized()
        else:
            S = T.cross(V(up)).normalized()
        return T, S, S.cross(T)

    aneis = []
    for i in range(n):
        T, S, U = quadro(i)
        aneis.append([P[i] + S * u + U * v for u, v in sec(i)])

    def calota(i, sentido, m):
        T, S, U = quadro(i)
        T = T * sentido
        pts2 = sec(i)
        cu = sum(p[0] for p in pts2) / len(pts2)
        cv = sum(p[1] for p in pts2) / len(pts2)
        raio = (max(p[0] for p in pts2) - min(p[0] for p in pts2)) / 2
        out = []
        for k in range(1, m + 1):
            fi = (math.pi / 2) * (k / m) * 0.96
            s = math.cos(fi)
            out.append([P[i] + T * raio * math.sin(fi) + S * (cu + (u - cu) * s) + U * (cv + (v - cv) * s)
                        for u, v in pts2])
        return out

    if domo[0]:
        aneis = calota(0, -1, domo[0])[::-1] + aneis
    if domo[1]:
        aneis = aneis + calota(n - 1, 1, domo[1])
    bm = bmesh.new()
    vs = [[bm.verts.new(p) for p in a] for a in aneis]
    m = len(vs[0])
    for a, b in zip(vs, vs[1:]):
        for j in range(m):
            bm.faces.new((a[j], a[(j + 1) % m], b[(j + 1) % m], b[j]))
    for anel in (vs[0], vs[-1]):
        c = bm.verts.new(sum((v.co for v in anel), V()) / m)
        for j in range(m):
            bm.faces.new((anel[j], anel[(j + 1) % m], c))
    return mb._obj(nome, bm, cor, mat, angulo=angulo)


def loft(base, z0, topo, z1, cor="branco", bisel=0.01, seg=3, nome="loft"):
    """Sólido entre dois contornos (x, y) com o mesmo número de pontos (anti-horário): base em z0, topo em z1."""
    bm = bmesh.new()
    a = [bm.verts.new((x, y, z0)) for x, y in base]
    b = [bm.verts.new((x, y, z1)) for x, y in topo]
    n = len(a)
    for j in range(n):
        bm.faces.new((a[j], a[(j + 1) % n], b[(j + 1) % n], b[j]))
    fa = bm.faces.new(a[::-1])
    fb = bm.faces.new(b)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    if n > 4:
        bmesh.ops.triangulate(bm, faces=[fa, fb], quad_method="BEAUTY", ngon_method="BEAUTY")
    if bisel > 0:
        ed = [e for e in bm.edges if len(e.link_faces) == 2 and e.link_faces[0].normal.dot(e.link_faces[1].normal) < 0.85]
        bmesh.ops.bevel(bm, geom=ed, offset=bisel, offset_type="OFFSET", segments=seg, profile=0.5, affect="EDGES",
                        clamp_overlap=True)
    return mb._obj(nome, bm, cor)


def tronco(l0, p0, l1, p1, a, x=0.0, y=0.0, z=0.0, cor="branco", bisel=0.012, fundo_reto=True, nome="tronco"):
    """Tronco de pirâmide retangular (coifa, chaminé afinando). fundo_reto: as costas ficam no mesmo plano (parede)."""
    yt = y + ((p0 - p1) / 2 if fundo_reto else 0)
    rb = [(x + sx * l0 / 2, y + sy * p0 / 2) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    rt = [(x + sx * l1 / 2, yt + sy * p1 / 2) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    return loft(rb, z, rt, z + a, cor, bisel, nome=nome)


def recorta(base, cortadores, cor, bisel=0.008, cor_dentro="carvao", cor_chao="cinzas", y_boca=None, nome="recortado",
            angulo=50):
    """Booleana (diferença) de base pelos cortadores, bisel nas arestas novas e pintura do interior escuro: as faces
    dentro da caixa de um cortador e atrás de y_boca + 1 cm ficam cor_dentro (as de chão, cor_chao)."""
    caixas = [mb.bbox(c) for c in cortadores]
    for c in cortadores:
        md = base.modifiers.new("b", "BOOLEAN")
        md.operation = "DIFFERENCE"
        md.object = c
        md.solver = "EXACT"
    if bisel:
        bv = base.modifiers.new("v", "BEVEL")
        bv.width = bisel
        bv.segments = 2
        bv.limit_method = "ANGLE"
        bv.angle_limit = R(angulo)
    for c in cortadores:
        c.hide_render = True
        c.hide_viewport = True
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(base.evaluated_get(dg))
    bm = bmesh.new()
    bm.from_mesh(me)
    bpy.data.meshes.remove(me)
    for o in [base] + list(cortadores):
        m = o.data
        bpy.data.objects.remove(o)
        if m and m.users == 0:
            bpy.data.meshes.remove(m)
    ob = mb._obj(nome, bm, cor, angulo=40)
    if cor_dentro:
        e = 0.003
        me = ob.data
        co = [V(v.co) for v in me.vertices]
        dentro, chao = [], []
        for p in me.polygons:
            c = V(p.center)
            if y_boca is not None and c.y < y_boca + 0.012:
                continue
            vs = [co[i] for i in p.vertices]
            if any(all(lo.x - e <= q.x <= hi.x + e and lo.y - e <= q.y <= hi.y + e and lo.z - e <= q.z <= hi.z + e
                       for q in vs) for lo, hi in caixas):
                (chao if (cor_chao and p.normal.z > 0.8) else dentro).append(p.index)
        mb.pinta(ob, cor_dentro, dentro)
        if chao:
            mb.pinta(ob, cor_chao, chao)
    return ob


def arco(w, h, n=14, x=0.0, z=0.0):
    """Contorno (x, z) de uma boca em arco: retângulo w × h com meia-volta em cima (anti-horário)."""
    r = w / 2
    pts = [(x - r, z), (x + r, z)]
    for k in range(n + 1):
        t = math.pi * k / n
        pts.append((x + r * math.cos(t), z + h - r + r * math.sin(t)))
    return pts


def cortador_xz(pts, y0, prof, nome="cort"):
    """Prisma de corte a partir de um contorno (x, z), de y0 para trás (+Y) por prof."""
    return mb.extrudado(mb._ccw(pts), prof, y=y0, plano="xz", bisel=0, nome=nome)


def brasas(cx, cy, z, rx, ry, n=18, seed=1, r=(0.022, 0.034), luz=0.2, altura=0.07):
    """Montinho de brasas: bolinhas brasa/fogo, algumas com o material luz (brilho)."""
    rnd = random.Random(seed)
    ps = []
    for _ in range(n):
        a = rnd.random() * 2 * math.pi
        d = math.sqrt(rnd.random())
        x = cx + math.cos(a) * d * rx
        y = cy + math.sin(a) * d * ry
        rr = rnd.uniform(*r)
        zz = z + rr * 0.75 + altura * (1 - d * d) * rnd.uniform(0.4, 1.0)
        if rnd.random() < luz:
            ps.append(mb.esfera(rr * 0.75, x, y, zz - rr * 0.2, cor=None, mat="luz", seg=10))
        else:
            ps.append(mb.esfera(rr, x, y, zz, cor=rnd.choice(["brasa", "brasa", "fogo"]), seg=10))
    return mb.junta(ps, "brasas")


def tora(comp, r, c, giro=0.0, inclina=0.0, cor="madeira_escura"):
    """Lenha: cilindro deitado em X com as pontas claras."""
    ob = mb.cilindro(r, comp, cor=cor, eixo="x", seg=10, bisel=0.006)
    mb.pinta_onde(ob, "madeira_clara", lambda cc, n: abs(n.x) > 0.8)
    mb.transforma(ob, rot=[("Z", giro), ("Y", inclina)])
    mb.transforma(ob, loc=c)
    return ob


def fogo(cx, cy, z, larg, prof, seed=1, lenha=True, n=None):
    """Brasas e (opcional) duas toras cruzadas, no chão da fornalha (z)."""
    ps = [brasas(cx, cy, z, larg / 2, prof / 2, n=n or max(10, int(larg * prof * 160)), seed=seed)]
    if lenha:
        rr = min(0.045, prof * 0.18)
        ps.append(tora(larg * 0.8, rr, (cx, cy + prof * 0.12, z + rr + 0.03), giro=12))
        ps.append(tora(larg * 0.7, rr * 0.9, (cx, cy - prof * 0.1, z + rr + 0.05), giro=-14, inclina=4,
                       cor="marrom"))
    return mb.junta(ps, "fogo")


def tubo_chamine(r, z0, z1, x=0.0, y=0.0, cor="grafite", nome="chamine"):
    """Tubo de chaminé aberto em cima (por dentro escuro), com um colar na base."""
    e = 0.006
    perfil = [(0, z0), (r, z0), (r, z1 - 0.004), (r - 0.002, z1), (r - e + 0.002, z1), (r - e, z1 - 0.004),
              (r - e, z1 - 0.07), (0, z1 - 0.07)]
    ob = mb.torno(perfil, x=x, y=y, cor=cor, seg=24, nome=nome)
    mb.pinta_onde(ob, "carvao", lambda c, n: math.hypot(c.x - x, c.y - y) < r - e * 0.5 and c.z > z1 - 0.075)
    return ob


def faixa(pts, esp):
    """Contorno de uma faixa de largura esp ao longo de uma linha 2D (para ripas curvas e cabeceiras de madeira)."""
    pts = [V((p[0], p[1])) for p in pts]
    esq, dirt = [], []
    for i, p in enumerate(pts):
        if i == 0:
            t = pts[1] - pts[0]
        elif i == len(pts) - 1:
            t = pts[-1] - pts[-2]
        else:
            t = (pts[i + 1] - pts[i - 1])
        t.normalize()
        nrm = V((-t.y, t.x))
        esq.append(p + nrm * esp / 2)
        dirt.append(p - nrm * esp / 2)
    return [(q.x, q.y) for q in dirt + esq[::-1]]


def suave(pts, n=6):
    """Curva Catmull-Rom pelos pontos (2D ou 3D)."""
    P = [V(p) for p in pts]
    out = []
    for i in range(len(P) - 1):
        p0 = P[max(0, i - 1)]
        p1, p2 = P[i], P[i + 1]
        p3 = P[min(len(P) - 1, i + 2)]
        for k in range(n):
            t = k / n
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
                              (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(P[-1])
    return [tuple(q) for q in out]


def pes(tipo, l, p, a, cor, r=0.025, recuo=0.05, abre=0.0):
    return mb.quatro_pes(tipo, l, p, a, cor, r=r, recuo=recuo, abre=abre)


# =====================================================================================================================
# Estofados: peças comuns
# =====================================================================================================================
ASSENTO = 0.30  # topo da base estofada; a almofada de assento vai de 0,30 a ~0,44


def assento(x, y, w, d, cor, z=ASSENTO, a=0.15, e=0.2, estufa=0.35, nu=24):
    """Almofada de assento (topo em ~z + a)."""
    return almof(w, d, a, (x, y, z + a / 2 - 0.01), cor, e=e, ev=0.5, estufa=estufa, nu=nu, nome="assento")


def encosto_alm(x, y_costas, w, h, cor, z=ASSENTO + 0.13, esp=0.19, incl=12, giro=0.0, nu=24, e=0.24):
    """Almofada de encosto em pé, encostada num plano y_costas (atrás), inclinada incl graus para trás, com a base
    apoiada em z (topo da almofada de assento)."""
    t = R(incl)
    cy = y_costas - esp / 2 * math.cos(t) - h / 2 * math.sin(t)
    cz = z + h / 2 * math.cos(t) + esp / 2 * math.sin(t) - 0.03
    ob = almof(w, h, esp, (0, 0, 0), cor, e=e, ev=0.55, estufa=0.5, rot=[("X", 90 - incl)], nu=nu, nome="encosto")
    mb.transforma(ob, rot=("Z", giro))
    mb.transforma(ob, loc=(x, cy, cz))
    return ob


def almofada_solta(x, y, cor, tam=0.42, z=ASSENTO + 0.13, giro=0.0, incl=22, inclina_lado=0.0):
    """Almofada decorativa fofa, inclinada contra o encosto."""
    ob = almof(tam, tam, 0.15, (0, 0, 0), cor, e=0.32, ev=0.6, estufa=0.65, rot=[("Y", inclina_lado),
                                                                               ("X", 90 - incl)], nu=20, nv=10,
               nome="solta")
    mb.transforma(ob, rot=("Z", giro))
    mb.transforma(ob, loc=(x, y, z + tam / 2 * math.cos(R(incl)) - 0.02))
    return ob


def braco(tipo, x, P, cor, wa=0.2, ha=0.62, z0=0.08, y=0.0, lado=1, nu=24):
    """Braço de sofá centrado em x. tipos: bloco (caixa macia), rolo (corpo + rolo por cima, abrindo para fora),
    baixo (bloco baixo e redondo)."""
    if tipo == "bloco":
        return se(wa, P, ha - z0, x=x, y=y, z=z0, cor=cor, e=0.22, ev=0.28, nu=nu)
    if tipo == "rolo":
        corpo = se(wa * 0.92, P - 0.02, ha - z0 - 0.08, x=x - lado * 0.01, y=y, z=z0, cor=cor, e=0.2, ev=0.3, nu=nu)
        topo = se(wa * 1.3, P, 0.2, x=x + lado * 0.025, y=y, z=ha - 0.2, cor=cor, e=0.32, ev=0.95, nu=nu)
        return [corpo, topo]
    if tipo == "baixo":
        return se(wa, P, ha - z0, x=x, y=y, z=z0, cor=cor, e=0.3, ev=0.45, nu=nu)
    raise ValueError(tipo)


def caminho_u(L, P, r, n=8, y_frente=None, y_fundo=None):
    """Caminho em U (planta): da frente esquerda até o fundo, pelo fundo e até a frente direita, cantos com raio r."""
    yf = -P / 2 if y_frente is None else y_frente
    yb = P / 2 if y_fundo is None else y_fundo
    x0, x1 = -L / 2, L / 2
    pts = [(x0, yf, 0)]
    for k in range(n + 1):
        t = R(180 - 90 * k / n)
        pts.append((x0 + r + r * math.cos(t), yb - r + r * math.sin(t), 0))
    for k in range(n + 1):
        t = R(90 - 90 * k / n)
        pts.append((x1 - r + r * math.cos(t), yb - r + r * math.sin(t), 0))
    pts.append((x1, yf, 0))
    return pts


def concha(L, P, esp, h_braco, h_fundo, z0, cor, r=0.3, y_frente=None, nome="concha", curva=1.6):
    """Encosto e braços numa peça só (sofá concha): parede de topo redondo varrida em U, mais alta no fundo."""
    cam = caminho_u(L - esp, P - esp, r, y_frente=y_frente)
    yf, yb = cam[0][1], cam[len(cam) // 2][1]

    def h(i):
        y = cam[i][1]
        s = max(0.0, min(1.0, (y - yf) / (yb - yf)))
        return h_braco + (h_fundo - h_braco) * s ** curva

    cam3 = [(x, y, z0) for x, y, _ in cam]
    return varre(cam3, lambda i: ret_cantos(esp, h(i) - z0, 0.03, esp / 2 * 0.98, seg=4), cor, domo=(4, 4),
                 nome=nome)


# =====================================================================================================================
# Sofás
# =====================================================================================================================
def sofa_encosto_inteiro(it, cor, pe_cor="madeira_escura", solta=None):
    """Roxo da referência: encosto num rolo único e alto, braços enrolados, três almofadas de assento."""
    L, P, wa = 2.0, 0.9, 0.22
    z0 = 0.09
    it.add(se(L - 0.06, P - 0.02, ASSENTO - z0, z=z0, cor=cor, e=0.16, ev=0.25))
    for s in (-1, 1):
        it.add(braco("rolo", s * (L / 2 - wa / 2), P, cor, wa=wa, ha=0.63, z0=z0, lado=s))
    it.add(se(L - 2 * wa + 0.06, 0.27, 0.86 - z0, y=P / 2 - 0.135, z=z0, cor=cor, e=0.2, ev=0.42))
    n = 3
    w = (L - 2 * wa) / n
    for k in range(n):
        it.add(assento(-L / 2 + wa + w * (k + 0.5), -0.1, w - 0.012, P - 0.3, cor))
    if solta:
        for s in (-1, 1):
            it.add(almofada_solta(s * (L / 2 - wa - 0.24), P / 2 - 0.39, solta, giro=-s * 12, inclina_lado=s * 8))
    it.add(pes("bola", L - 0.1, P - 0.12, z0 + 0.03, pe_cor, r=0.03, recuo=0.05))


def sofa_classico(it, cor, n=3, L=2.05, pe_cor="madeira_mel", solta=None, braco_tipo="bloco", cor_alm=None):
    """Azul da referência: braços de bloco, três almofadas de encosto e três de assento, pezinhos de bola."""
    P, wa, z0 = 0.9, 0.21, 0.1
    ca = cor_alm or cor
    it.add(se(L - 0.04, P - 0.02, ASSENTO - z0, z=z0, cor=cor, e=0.14, ev=0.22))
    for s in (-1, 1):
        it.add(braco(braco_tipo, s * (L / 2 - wa / 2), P, cor, wa=wa, ha=0.62, z0=z0, lado=s))
    yc = P / 2 - 0.1
    it.add(se(L - 2 * wa + 0.06, 0.2, 0.66 - z0, y=yc, z=z0, cor=cor, e=0.18, ev=0.3))
    w = (L - 2 * wa) / n
    for k in range(n):
        x = -L / 2 + wa + w * (k + 0.5)
        it.add(assento(x, -0.09, w - 0.012, P - 0.24, ca))
        it.add(encosto_alm(x, yc - 0.1, w - 0.03, 0.46, ca, incl=13))
    if solta:
        for s in (-1, 1):
            it.add(almofada_solta(s * (L / 2 - wa - 0.22), P / 2 - 0.56, solta, giro=-s * 14, inclina_lado=s * 10,
                                  z=ASSENTO + 0.12))
    it.add(pes("bola", L - 0.12, P - 0.14, z0 + 0.03, pe_cor, r=0.032, recuo=0.05))


def sofa_moldura(it, cor, pe_cor="madeira_escura", cor_alm=None):
    """Laranja da referência: moldura alta e reta (encosto e braços quase da mesma altura), três almofadinhas de
    encosto e duas grandes de assento, pés palito."""
    L, P, wa, z0 = 1.85, 0.88, 0.16, 0.16
    ca = cor_alm or cor
    it.add(se(L - 0.03, P - 0.04, ASSENTO - z0, y=-0.01, z=z0, cor=cor, e=0.14, ev=0.22))
    it.add(se(L, 0.2, 0.92 - z0, y=P / 2 - 0.1, z=z0, cor=cor, e=0.14, ev=0.18))
    for s in (-1, 1):
        it.add(se(wa, P - 0.02, 0.74 - z0, x=s * (L / 2 - wa / 2), y=0.0, z=z0, cor=cor, e=0.18, ev=0.2))
    w = (L - 2 * wa) / 2
    for k in range(2):
        it.add(assento(-L / 2 + wa + w * (k + 0.5), -0.08, w - 0.014, P - 0.22, ca, a=0.16))
    w3 = (L - 2 * wa) / 3
    for k in range(3):
        it.add(encosto_alm(-L / 2 + wa + w3 * (k + 0.5), P / 2 - 0.2, w3 - 0.03, 0.3, ca, esp=0.15, incl=6,
                           z=ASSENTO + 0.19))
    for sx in (-1, 1):
        for sy in (-1, 1):
            o = mb.pe("palito", z0 + 0.03, cor=pe_cor, r=0.026)
            mb.transforma(o, rot=[("Y", -sx * 8), ("X", sy * 8)])
            mb.transforma(o, loc=(sx * (L / 2 - 0.1), sy * (P / 2 - 0.1), 0.0))
            it.add(o)


def sofa_base_madeira(it, cor, madeira="madeira_media", solta=None):
    """Verde da referência: estofado sobre um rodapé de madeira, braços redondos e duas almofadas de encosto altas."""
    L, P, wa = 1.65, 0.9, 0.22
    zb = 0.13
    it.add(caixa_b(L - 0.03, P - 0.05, 0.05, z=zb - 0.045, cor=madeira, bisel=0.014))
    it.add(se(L - 0.06, P - 0.06, ASSENTO - zb, z=zb, cor=cor, e=0.14, ev=0.25))
    for s in (-1, 1):
        it.add(se(wa, P - 0.04, 0.64 - zb, x=s * (L / 2 - wa / 2 - 0.02), z=zb, cor=cor, e=0.3, ev=0.42))
    yc = P / 2 - 0.11
    it.add(se(L - 2 * wa + 0.04, 0.2, 0.62 - zb, y=yc, z=zb, cor=cor, e=0.2, ev=0.3))
    w = (L - 2 * wa - 0.04) / 2
    for k in range(2):
        x = -w / 2 + k * w
        it.add(assento(x, -0.1, w - 0.012, P - 0.26, cor))
        it.add(encosto_alm(x, yc - 0.09, w - 0.02, 0.52, cor, incl=12, esp=0.21))
    if solta:
        it.add(almofada_solta(-0.36, P / 2 - 0.58, solta, giro=14, inclina_lado=-10, tam=0.38))
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.add(mb.pe("conico", zb - 0.04, x=sx * (L / 2 - 0.07), y=sy * (P / 2 - 0.08), cor=madeira, r=0.026))


def caixa_b(l, p, a, x=0.0, y=0.0, z=0.0, cor="branco", bisel=0.012, seg=3):
    return mb.caixa(l, p, a, x=x, y=y, z=z, cor=cor, bisel=bisel, seg=seg)


def namoradeira_curva(it, cor, pe_cor="madeira_escura"):
    """Rosa da referência: planta arredondada, braços curvos que sobem para o encosto e duas almofadas fofas."""
    L, P = 1.55, 0.86
    z0 = 0.15
    it.add(se(L - 0.06, P - 0.04, ASSENTO - z0 + 0.01, z=z0, cor=cor, e=0.55, ev=0.35, nu=32))
    it.add(concha(L, P, 0.2, 0.6, 0.66, z0, cor, r=0.36, curva=1.2))
    it.add(almof(L - 0.36, P - 0.3, 0.13, (0, -0.06, ASSENTO + 0.06), cor, e=0.45, ev=0.5, estufa=0.3, nu=28,
                 nome="assento"))
    for s in (-1, 1):
        it.add(encosto_alm(s * 0.3, P / 2 - 0.19, 0.58, 0.44, cor, incl=16, esp=0.22, giro=-s * 4, e=0.35))
    for sx in (-1, 1):
        for sy in (-1, 1):
            o = mb.pe("palito", z0 + 0.03, cor=pe_cor, r=0.024)
            mb.transforma(o, rot=[("Y", -sx * 12), ("X", sy * 10)])
            mb.transforma(o, loc=(sx * (L / 2 - 0.2), sy * (P / 2 - 0.14), 0.0))
            it.add(o)


def namoradeira_concha(it, cor, pe_cor="madeira_mel"):
    """Azul-lavanda da referência: encosto e braços numa concha contínua e alta, duas almofadas de assento."""
    L, P = 1.6, 0.86
    z0 = 0.13
    it.add(se(L - 0.04, P - 0.04, ASSENTO - z0 + 0.01, z=z0, cor=cor, e=0.28, ev=0.25, nu=28))
    it.add(concha(L, P, 0.24, 0.66, 0.8, z0, cor, r=0.4, curva=2.0))
    w = (L - 0.48) / 2
    for k in range(2):
        it.add(assento(-w / 2 + k * w, -0.07, w - 0.012, P - 0.3, cor, e=0.24))
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.add(mb.pe("conico", z0 + 0.02, x=sx * (L / 2 - 0.12), y=sy * (P / 2 - 0.12), cor=pe_cor, r=0.024))


SOFAS = []  # (id, rotulo, grupo, tags, funcao, kwargs, extra)


def sofa(id_, rotulo, grupo, tags, f, **kw):
    SOFAS.append((id_, rotulo, grupo, tags, f, kw))


sofa("sofa_encosto_inteiro_roxo", "Sofá de três lugares com encosto inteiro (roxo)", "sofa_encosto_inteiro",
     ["3 lugares", "almofadas"], sofa_encosto_inteiro, cor="roxo", solta="amarelo_claro")
sofa("sofa_encosto_inteiro_verde_agua", "Sofá de três lugares com encosto inteiro (verde-água)",
     "sofa_encosto_inteiro", ["3 lugares", "almofadas"], sofa_encosto_inteiro, cor="verde_agua", solta="amarelo")
sofa("sofa_classico_azul_celeste", "Sofá clássico de três lugares (azul-celeste)", "sofa_classico",
     ["3 lugares", "almofadas"], sofa_classico, cor="azul_celeste")
sofa("sofa_classico_mostarda", "Sofá clássico de três lugares (mostarda)", "sofa_classico",
     ["3 lugares", "almofadas"], sofa_classico, cor="mostarda", solta="azul_marinho", pe_cor="madeira_escura")
sofa("sofa_moldura_laranja", "Sofá de moldura alta (laranja)", "sofa_moldura", ["2 lugares", "almofadas"],
     sofa_moldura, cor="laranja")
sofa("sofa_moldura_turquesa_escuro", "Sofá de moldura alta (turquesa-escuro)", "sofa_moldura",
     ["2 lugares", "almofadas"], sofa_moldura, cor="turquesa_escuro", pe_cor="madeira_mel")
sofa("sofa_base_madeira_verde", "Sofá de dois lugares com base de madeira (verde)", "sofa_base_madeira",
     ["2 lugares", "madeira"], sofa_base_madeira, cor="verde")
sofa("sofa_base_madeira_azul_marinho", "Sofá de dois lugares com base de madeira (azul-marinho)",
     "sofa_base_madeira", ["2 lugares", "madeira"], sofa_base_madeira, cor="azul_marinho", madeira="madeira_mel",
     solta="mostarda")
sofa("namoradeira_curva_rosa", "Namoradeira curva (rosa)", "namoradeira_curva", ["2 lugares", "namoradeira"],
     namoradeira_curva, cor="rosa")
sofa("namoradeira_curva_turquesa", "Namoradeira curva (turquesa)", "namoradeira_curva",
     ["2 lugares", "namoradeira"], namoradeira_curva, cor="turquesa", pe_cor="madeira_mel")
sofa("namoradeira_concha_lilas", "Namoradeira concha (lilás)", "namoradeira_concha", ["2 lugares", "namoradeira"],
     namoradeira_concha, cor="lilas")
sofa("namoradeira_concha_verde_claro", "Namoradeira concha (verde-claro)", "namoradeira_concha",
     ["2 lugares", "namoradeira"], namoradeira_concha, cor="verde_claro", pe_cor="madeira_escura")


# ---------------------------------------------------------------------------------------------------------------------
# Sofás modulares (U e L), chaise, divãs
# ---------------------------------------------------------------------------------------------------------------------
def modulo(tipo, w, d, cor, plinto=None, lado="esq", macio=False, z0=0.07, h_enc=0.82, wb=0.24, nu=20, solta=None):
    """Módulo de sofá no próprio eixo (largura em X, profundidade em Y, costas em +Y), base no chão.
    tipos: reto, canto (costas em +Y e no lado), ponta (sem costas), braco, chaise (ponta com costas)."""
    ps = []
    if plinto:
        ps.append(caixa_b(w - 0.12, d - 0.12, z0 + 0.012, cor=plinto, bisel=0.01))
    if tipo == "braco":
        if macio:
            ps.append(se(wb, d - 0.01, 0.6 - z0, z=z0, cor=cor, e=0.3, ev=0.42, nu=nu))
        else:
            ps.append(se(wb, d - 0.01, 0.64 - z0, z=z0, cor=cor, e=0.16, ev=0.22, nu=nu))
        return ps
    ps.append(se(w - 0.012, d - 0.012, ASSENTO - z0, z=z0, cor=cor, e=0.14 if not macio else 0.2, ev=0.22, nu=nu))
    eb = 0.24 if not macio else 0.2  # espessura das costas
    costas = tipo in ("reto", "canto", "chaise")
    sx = -1 if lado == "esq" else 1
    if costas:
        if macio:
            ps.append(se(w - 0.012, eb, 0.66 - ASSENTO + 0.04, y=d / 2 - eb / 2, z=ASSENTO - 0.04, cor=cor, e=0.2,
                         ev=0.32, nu=nu))
        else:
            ps.append(se(w - 0.014, eb, h_enc - ASSENTO + 0.04, y=d / 2 - eb / 2, z=ASSENTO - 0.04, cor=cor, e=0.16,
                         ev=0.24, nu=nu))
    if tipo == "canto":
        if macio:
            ps.append(se(eb, d - eb + 0.02, 0.66 - ASSENTO + 0.04, x=sx * (w / 2 - eb / 2), y=-eb / 2 + 0.01,
                         z=ASSENTO - 0.04, cor=cor, e=0.2, ev=0.32, nu=nu))
        else:
            ps.append(se(eb, d - eb + 0.02, h_enc - ASSENTO + 0.04, x=sx * (w / 2 - eb / 2), y=-eb / 2 + 0.01,
                         z=ASSENTO - 0.04, cor=cor, e=0.16, ev=0.24, nu=nu))
    # almofadas de assento
    ya = -eb / 2 if costas else 0.0
    da = d - (eb if costas else 0) - 0.03
    if tipo == "canto":
        ps.append(assento(-sx * eb / 2, ya, w - eb - 0.03, da, cor, nu=nu))
    else:
        ps.append(assento(0, ya, w - 0.03, da, cor, nu=nu))
    if macio and costas:  # almofadas de encosto inclinadas, encostadas na estrutura
        yb = d / 2 - eb
        if tipo == "canto":
            esp_a = 0.24  # o que a almofada inclinada ocupa à frente da estrutura
            wl = w - eb - esp_a - 0.04
            ps.append(encosto_alm(-sx * (eb + esp_a) / 2 - sx * 0.01, yb, wl, 0.44, cor, incl=12, nu=nu))
            dl = d - eb - 0.04
            o = encosto_alm(0, 0, dl, 0.44, cor, incl=12, nu=nu)
            mb.transforma(o, rot=("Z", 90 if sx < 0 else -90))
            mb.transforma(o, loc=(sx * (w / 2 - eb), -d / 2 + 0.02 + dl / 2, 0))
            ps.append(o)
            if solta:
                ps.append(almofada_solta(sx * (w / 2 - eb - 0.46), yb - 0.36, solta, giro=-sx * 18, incl=22, inclina_lado=sx * 8))
        else:
            ps.append(encosto_alm(0, yb, w - 0.05, 0.44, cor, incl=12, nu=nu))
    return ps


def poe(it, objs, x, y, rotz=0.0):
    for o in objs:
        if rotz:
            mb.transforma(o, rot=("Z", rotz))
        mb.transforma(o, loc=(x, y, 0))
        it.add(o)


def centraliza(it, caixas=None):
    """Põe a origem no meio da planta (e desloca as caixas de colisão junto)."""
    lo, hi = mb.bbox(it.partes)
    c = (lo + hi) / 2
    for o in it.partes:
        mb.transforma(o, loc=(-c.x, -c.y, 0))
    if caixas:
        it.colisao([((x - c.x, y - c.y, z), t) for (x, y, z), t in caixas])


def cx(x0, x1, y0, y1, a, z=0.0):
    """Caixa de colisão a partir dos limites."""
    return (((x0 + x1) / 2, (y0 + y1) / 2, z), (x1 - x0, y1 - y0, a))


def sofa_u(it, cor, plinto):
    """Marrom da referência: sofá em U de módulos quadradões, com chaise de um lado."""
    w, d, wb, Lp = 0.8, 0.92, 0.24, 0.85
    poe(it, modulo("canto", d, d, cor, plinto, "esq"), 0, 0)
    for k in range(3):
        poe(it, modulo("reto", w, d, cor, plinto), d / 2 + w / 2 + k * w, 0)
    xl = d / 2 + 2.5 * w
    poe(it, modulo("braco", wb, d, cor, plinto, wb=wb), d / 2 + 3 * w + wb / 2, 0)
    poe(it, modulo("ponta", w, Lp, cor, plinto), xl, -d / 2 - Lp / 2)
    for k in range(2):
        poe(it, modulo("reto", w, d, cor, plinto), 0, -d / 2 - w / 2 - k * w, rotz=90)
    poe(it, modulo("braco", wb, d, cor, plinto, wb=wb), 0, -d / 2 - 2 * w - wb / 2, rotz=90)
    xr = d / 2 + 3 * w + wb
    yf = -d / 2 - 2 * w - wb
    centraliza(it, [cx(-d / 2, xr, -d / 2, d / 2, 0.82), cx(-d / 2, d / 2, yf, -d / 2, 0.82),
                    cx(xl - w / 2, xl + w / 2, -d / 2 - Lp, -d / 2, 0.45)])
    return {"tags": ["canto", "modular", "U"]}


def sofa_l(it, cor, plinto=None, solta=None):
    """Cinza da referência: sofá de canto em L, macio, com chaise e braço baixo de um lado."""
    w, d, wb, Lc = 0.82, 0.95, 0.22, 0.75
    z0 = 0.07
    # chaise com costas, braço baixo à esquerda
    poe(it, modulo("chaise", w, d + Lc, cor, plinto, macio=True), 0, -Lc / 2)
    poe(it, [se(wb, d + Lc - 0.01, 0.56 - z0, z=z0, cor=cor, e=0.35, ev=0.5)], -w / 2 - wb / 2, -Lc / 2)
    for k in range(2):
        poe(it, modulo("reto", w, d, cor, plinto, macio=True), w * (1 + k), 0)
    xc = w / 2 + 2 * w + d / 2
    poe(it, modulo("canto", d, d, cor, plinto, "dir", macio=True, solta=solta), xc, 0)
    for k in range(2):
        poe(it, modulo("reto", w, d, cor, plinto, macio=True), xc, -d / 2 - w / 2 - k * w, rotz=-90)
    poe(it, modulo("braco", wb, d, cor, plinto, macio=True, wb=wb), xc, -d / 2 - 2 * w - wb / 2, rotz=-90)
    x0 = -w / 2 - wb
    x1 = xc + d / 2
    yf = -d / 2 - 2 * w - wb
    centraliza(it, [cx(x0, x1, -d / 2, d / 2, 0.8), cx(xc - d / 2, x1, yf, -d / 2, 0.8),
                    cx(x0, w / 2, -d / 2 - Lc, -d / 2, 0.56)])
    return {"tags": ["canto", "L", "chaise"]}


def sofa_chaise(it, cor, pe_cor="madeira_mel", solta=None):
    """Amarelo da referência: três lugares com chaise à esquerda, três almofadas de encosto."""
    L, P, wa, wc, Lc = 2.3, 0.9, 0.2, 0.8, 0.7
    z0 = 0.1
    it.add(se(L - wa / 2, P - 0.02, ASSENTO - z0, x=-wa / 4 + 0.01, z=z0, cor=cor, e=0.12, ev=0.22))
    it.add(se(wc, Lc + 0.2, ASSENTO - z0, x=-L / 2 + wc / 2, y=-P / 2 - Lc / 2 + 0.09, z=z0, cor=cor, e=0.16,
              ev=0.22))
    it.add(braco("bloco", L / 2 - wa / 2, P, cor, wa=wa, ha=0.62, z0=z0))
    it.add(se(wa, 0.46, 0.62 - z0, x=-L / 2 + wa / 2 - 0.01, y=P / 2 - 0.23, z=z0, cor=cor, e=0.22, ev=0.28))
    yc = P / 2 - 0.1
    it.add(se(L - wa - 0.02, 0.2, 0.66 - z0, x=-wa / 2, y=yc, z=z0, cor=cor, e=0.18, ev=0.3))
    w = (L - wa - wc) / 2
    it.add(assento(-L / 2 + wc / 2 + 0.01, -Lc / 2 - 0.08, wc - 0.03, P + Lc - 0.24, cor, e=0.16))
    for k in range(2):
        it.add(assento(-L / 2 + wc + w * (k + 0.5), -0.09, w - 0.014, P - 0.24, cor))
    w3 = (L - 2 * wa) / 3
    for k in range(3):
        it.add(encosto_alm(-L / 2 + wa + w3 * (k + 0.5), yc - 0.1, w3 - 0.03, 0.46, cor, incl=13))
    if solta:
        it.add(almofada_solta(L / 2 - wa - 0.22, P / 2 - 0.56, solta, giro=14, inclina_lado=10))
    for x, y in ((-L / 2 + 0.08, P / 2 - 0.08), (L / 2 - 0.08, P / 2 - 0.08), (L / 2 - 0.08, -P / 2 + 0.08),
                 (-L / 2 + wc - 0.08, -P / 2 + 0.06), (-L / 2 + 0.08, -P / 2 - Lc + 0.08),
                 (-L / 2 + wc - 0.08, -P / 2 - Lc + 0.08)):
        it.add(mb.pe("bola", z0 + 0.03, x=x, y=y, cor=pe_cor, r=0.032))
    centraliza(it, [cx(-L / 2, L / 2, -P / 2, P / 2, 0.82), cx(-L / 2, -L / 2 + wc, -P / 2 - Lc, -P / 2, 0.45)])
    return {"tags": ["chaise", "3 lugares", "canto"]}


def diva_rolo(it, cor, pe_cor="amarelo_escuro"):
    """Laranja da referência: divã reto de colchão grosso com rolo de apoio na cabeceira."""
    L, P = 1.9, 0.76
    it.add(se(L, P, 0.09, z=0.18, cor=cor, e=0.1, ev=0.3))
    it.add(se(L - 0.03, P - 0.03, 0.17, z=0.25, cor=cor, e=0.14, ev=0.35, estufa=0.12, nu=28))
    for sy in (-1, 1):
        it.add(mb.cilindro(0.022, 0.15, x=L / 2 - 0.15, y=sy * 0.29, z=0.38, cor=pe_cor, seg=12, bisel=0.008))
        it.add(mb.esfera(0.028, x=L / 2 - 0.15, y=sy * 0.29, z=0.535, cor=pe_cor, seg=12))
    it.add(rolo(P - 0.06, 0.1, (L / 2 - 0.15, 0, 0.57), "y", cor, botao=pe_cor))
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.add(mb.cilindro(0.032, 0.2, x=sx * (L / 2 - 0.1), y=sy * (P / 2 - 0.09), cor=pe_cor, seg=14,
                               bisel=0.012))
    return {"tags": ["diva"]}


def diva_braco(it, cor, pe_cor="madeira_mel"):
    """Azul da referência: divã de encosto baixo com rolo no topo, braço enrolado e almofada-rolo solta."""
    L, P, z0 = 1.85, 0.84, 0.09
    it.add(se(L - 0.02, P - 0.02, ASSENTO - z0, z=z0, cor=cor, e=0.12, ev=0.22))
    it.add(braco("rolo", -L / 2 + 0.11, P, cor, wa=0.22, ha=0.64, z0=z0, lado=-1))
    it.add(se(L - 0.24, 0.22, 0.6 - z0, x=0.1, y=P / 2 - 0.11, z=z0, cor=cor, e=0.16, ev=0.28))
    it.add(rolo(L - 0.24, 0.115, (0.1, P / 2 - 0.12, 0.6), "x", cor))
    it.add(assento(0.11, -0.1, L - 0.26, P - 0.26, cor, e=0.12, nu=28))
    it.add(rolo(P - 0.34, 0.1, (L / 2 - 0.2, -0.1, ASSENTO + 0.14 + 0.09), "y", cor, botao=cor))
    it.add(pes("bola", L - 0.1, P - 0.12, z0 + 0.03, pe_cor, r=0.03, recuo=0.05))
    return {"tags": ["diva", "braco"]}


def chaise_longue(it, cor, pe_cor="madeira_clara"):
    """Vermelho da referência: chaise de assento comprido com o encosto alto curvado numa ponta."""
    L, P, z0 = 1.75, 0.76, 0.15
    it.add(se(L, P, ASSENTO - z0, z=z0, cor=cor, e=0.12, ev=0.25))
    esp, r = 0.17, 0.26
    xa = L / 2 - esp / 2
    yb = P / 2 - esp / 2
    cam = [(-0.32 + k * (xa - r + 0.32) / 6, yb, z0) for k in range(7)]
    for k in range(1, 9):
        t = R(90 - 90 * k / 8)
        cam.append((xa - r + r * math.cos(t), yb - r + r * math.sin(t), z0))
    for k in range(1, 6):
        cam.append((xa, yb - r - k * (yb - r + P / 2 - 0.09) / 5, z0))
    n = len(cam)
    comp = [0.0]
    for a, b in zip(cam, cam[1:]):
        comp.append(comp[-1] + (V(b) - V(a)).length)

    def h(i):
        s = comp[i] / comp[-1]
        if s < 0.55:
            hh = 0.5 + (0.92 - 0.5) * (s / 0.55) ** 1.4
        else:
            hh = 0.92 - (0.92 - 0.7) * ((s - 0.55) / 0.45) ** 1.6
        return hh - z0

    it.add(varre(cam, lambda i: ret_cantos(esp, h(i), 0.03, esp / 2 * 0.98), cor, domo=(4, 4), nome="encosto"))
    it.add(assento(-0.08, -0.06, L - 0.2, P - 0.2, cor, e=0.12, nu=28))
    for sx in (-1, 1):
        for sy in (-1, 1):
            o = mb.pe("palito", z0 + 0.03, cor=pe_cor, r=0.026)
            mb.transforma(o, rot=[("Y", -sx * 10), ("X", sy * 8)])
            mb.transforma(o, loc=(sx * (L / 2 - 0.1), sy * (P / 2 - 0.1), 0.0))
            it.add(o)
    _ = n
    return {"tags": ["chaise", "diva"]}


def diva_madeira(it, cor, madeira="madeira_media"):
    """Cinza da referência: colchão sobre estrutura de madeira com a cabeceira curvada e rolo."""
    L, P = 1.95, 0.8
    it.add(caixa_b(L - 0.04, P, 0.1, z=0.13, cor=madeira, bisel=0.03))
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.add(mb.pe("conico", 0.14, x=sx * (L / 2 - 0.12), y=sy * (P / 2 - 0.1), cor=madeira, r=0.03))
    it.add(se(L - 0.14, P - 0.05, 0.18, x=-0.03, z=0.225, cor=cor, e=0.12, ev=0.35, estufa=0.1, nu=28))
    cab = suave([(L / 2 - 0.06, 0.15), (L / 2 - 0.05, 0.4), (L / 2 - 0.02, 0.58), (L / 2 + 0.04, 0.7),
                 (L / 2 + 0.11, 0.75), (L / 2 + 0.15, 0.72)], 5)
    it.add(mb.extrudado(mb._ccw(faixa(cab, 0.05)), P, y=-P / 2, plano="xz", cor=madeira, bisel=0.012))
    pe_ = suave([(-L / 2 + 0.06, 0.15), (-L / 2 + 0.05, 0.3), (-L / 2 + 0.0, 0.39), (-L / 2 - 0.04, 0.4)], 5)
    it.add(mb.extrudado(mb._ccw(faixa(pe_, 0.045)), P, y=-P / 2, plano="xz", cor=madeira, bisel=0.012))
    it.add(rolo(P - 0.1, 0.11, (L / 2 - 0.2, 0, 0.405 + 0.105), "y", cor, botao=madeira))
    return {"tags": ["diva", "madeira"]}


# ---------------------------------------------------------------------------------------------------------------------
# Espreguiçadeiras (comprimento em Y: cabeceira no fundo, +Y; pés para a frente, −Y)
# ---------------------------------------------------------------------------------------------------------------------
def _ao_longo(curva, passo):
    """Pontos (posição, tangente) a cada passo de comprimento ao longo de uma curva 3D."""
    P = [V(p) for p in curva]
    seg = [(a, b, (b - a).length) for a, b in zip(P, P[1:])]
    total = sum(s[2] for s in seg)
    out = []
    d = passo / 2
    while d < total - passo / 4:
        acc = 0.0
        for a, b, l in seg:
            if acc + l >= d:
                t = (d - acc) / l
                out.append((a.lerp(b, t), (b - a).normalized()))
                break
            acc += l
        d += passo
    return out


def ripa(p, t, larg, comp, esp, cor, x=0.0):
    """Ripa atravessada (larg em X) apoiada sobre a curva no ponto p, alinhada à tangente t (no plano YZ)."""
    ang = math.degrees(math.atan2(t.z, t.y))
    ob = caixa_b(larg, comp, esp, z=0, cor=cor, bisel=min(0.008, esp * 0.4), seg=2)
    mb.transforma(ob, rot=("X", ang))
    mb.transforma(ob, loc=(x + p.x, p.y, p.z))
    return ob


def espreguicadeira_curva(it, cor, roda="grafite"):
    """Laranja da referência: ripas sobre longarinas curvas em S, com rodinhas na cabeceira."""
    W = 0.66
    curva = suave([(0, -0.95, 0.12), (0, -0.72, 0.24), (0, -0.46, 0.34), (0, -0.2, 0.37), (0, 0.04, 0.33),
                   (0, 0.24, 0.36), (0, 0.44, 0.47), (0, 0.62, 0.66), (0, 0.78, 0.86), (0, 0.9, 1.0)], 5)
    for sx in (-1, 1):
        cam = [(sx * (W / 2 - 0.04), y, z) for _, y, z in curva]
        it.add(varre(cam, ret_cantos(0.045, 0.075, 0.012, 0.012, seg=2, v0=-0.075), cor, lado=(1, 0, 0),
                     nome="longarina"))
    for p, t in _ao_longo(curva, 0.088):
        it.add(ripa(p, t, W, 0.062, 0.022, cor))
    # apoio: pé dianteiro, perna do meio e cavalete com rodas atrás
    for sx in (-1, 1):
        xx = sx * (W / 2 - 0.04)
        it.add(caixa_b(0.045, 0.08, 0.1, x=xx, y=-0.9, z=0.0, cor=cor, bisel=0.01))
        it.add(caixa_b(0.045, 0.05, 0.31, x=xx, y=-0.2, z=0.0, cor=cor, bisel=0.01))
        it.add(varre([(xx, 0.5, 0.48), (xx, 0.62, 0.075)], ret_cantos(0.045, 0.05, 0.01, 0.01, seg=2, v0=-0.025), cor,
                     lado=(1, 0, 0), nome="cavalete"))
        it.add(mb.cilindro(0.075, 0.035, x=sx * (W / 2 + 0.005), y=0.63, z=0.075, cor=roda, eixo="x", seg=20,
                           bisel=0.01))
        it.add(mb.cilindro(0.025, 0.045, x=sx * (W / 2 + 0.012), y=0.63, z=0.075, cor=cor, eixo="x", seg=12,
                           bisel=0.006))
    it.add(caixa_b(W - 0.08, 0.04, 0.05, y=-0.2, z=0.18, cor=cor, bisel=0.01))
    it.add(caixa_b(W - 0.02, 0.04, 0.045, y=0.6, z=0.12, cor=cor, bisel=0.01))
    it.colisao([cx(-W / 2 - 0.03, W / 2 + 0.03, -0.96, 0.3, 0.4), cx(-W / 2 - 0.03, W / 2 + 0.03, 0.3, 0.92, 1.0)])
    return {"tags": ["espreguicadeira", "madeira", "area externa"]}


def espreguicadeira_dobravel(it, tecido, tubo_cor):
    """Roxa da referência: lona esticada num quadro de tubo dobrado, pés em U."""
    W, r = 0.6, 0.013
    F, H, T = (-0.95, 0.34), (0.2, 0.37), (0.8, 0.93)
    xs = W / 2
    loop = [(-xs, F[0], F[1]), (-xs, H[0], H[1]), (-xs, T[0], T[1]), (xs, T[0], T[1]), (xs, H[0], H[1]),
            (xs, F[0], F[1])]
    it.add(mb.tubo(loop, r, cor=tubo_cor, raio_curva=0.05, fechado=True, nome="quadro"))
    for (y0, z0), (y1, z1) in ((F, H), (H, T)):
        comp = math.hypot(y1 - y0, z1 - z0)
        ang = math.degrees(math.atan2(z1 - z0, y1 - y0))
        o = se(W - 0.035, comp - 0.03, 0.03, z=-0.012, cor=tecido, e=0.12, ev=0.5, nu=20, nv=8)
        mb.transforma(o, rot=("X", ang))
        mb.transforma(o, loc=(0, (y0 + y1) / 2, (z0 + z1) / 2))
        it.add(o)
    for y, zf, dy in ((-0.8, 0.345, -0.03), (0.05, 0.365, 0.02)):
        it.add(mb.tubo([(-xs, y, zf), (-xs - 0.02, y + dy, r), (xs + 0.02, y + dy, r), (xs, y, zf)], r,
                       cor=tubo_cor, raio_curva=0.04, nome="pe"))
    yb = 0.55
    zb = H[1] + (T[1] - H[1]) * (yb - H[0]) / (T[0] - H[0])
    it.add(mb.tubo([(-xs, yb, zb), (-xs - 0.02, yb + 0.12, r), (xs + 0.02, yb + 0.12, r), (xs, yb, zb)], r,
                   cor=tubo_cor, raio_curva=0.04, nome="cavalete"))
    for sx in (-1, 1):
        for y in (-0.83, 0.07, 0.67):
            it.add(mb.esfera(0.02, x=sx * (xs + 0.02), y=y, z=0.012, cor="borracha", esc=(1, 1, 0.6), seg=10))
    it.colisao([cx(-W / 2 - 0.03, W / 2 + 0.03, -0.97, 0.2, 0.38), cx(-W / 2 - 0.03, W / 2 + 0.03, 0.2, 0.82, 0.94)])
    return {"tags": ["espreguicadeira", "dobravel", "area externa"]}


def espreguicadeira_reclinavel(it, cor):
    """Amarelo-pinho da referência: estrado de ripas em quatro pés, encosto de ripas reclinável."""
    W, Lt = 0.66, 1.9
    zt = 0.3
    for sx in (-1, 1):
        it.add(caixa_b(0.05, Lt, 0.08, x=sx * (W / 2 - 0.025), z=zt - 0.08, cor=cor, bisel=0.012))
        for sy in (-1, 1):
            it.add(caixa_b(0.055, 0.06, zt - 0.02, x=sx * (W / 2 - 0.08), y=sy * (Lt / 2 - 0.09), cor=cor, bisel=0.012))
    for sy in (-1, 1):
        it.add(caixa_b(W - 0.1, 0.05, 0.07, y=sy * (Lt / 2 - 0.025), z=zt - 0.075, cor=cor, bisel=0.012))
    n = 19
    passo = (Lt - 0.04) / n
    for k in range(n):
        it.add(caixa_b(W - 0.1, passo - 0.022, 0.022, y=-Lt / 2 + 0.02 + passo * (k + 0.5), z=zt, cor=cor,
                       bisel=0.008))
    # encosto: montantes + ripas, articulado em y = 0,25
    ang, comp = 52, 0.78
    y0, z0 = 0.25, zt + 0.03
    for sx in (-1, 1):
        o = caixa_b(0.045, comp, 0.035, cor=cor, bisel=0.01)
        mb.transforma(o, loc=(0, comp / 2, 0))
        mb.transforma(o, rot=("X", ang))
        mb.transforma(o, loc=(sx * (W / 2 - 0.09), y0, z0))
        it.add(o)
    for k in range(7):
        s = 0.06 + k * (comp - 0.1) / 6
        o = caixa_b(W - 0.12, 0.07, 0.02, cor=cor, bisel=0.008)
        mb.transforma(o, loc=(0, s, 0.035))
        mb.transforma(o, rot=("X", ang))
        mb.transforma(o, loc=(0, y0, z0))
        it.add(o)
    # escora do encosto
    sa = comp * 0.55
    ya, za = y0 + sa * math.cos(R(ang)), z0 + sa * math.sin(R(ang))
    for sx in (-1, 1):
        it.add(varre([(sx * (W / 2 - 0.13), ya, za), (sx * (W / 2 - 0.13), 0.78, zt + 0.02)],
                     ret_cantos(0.03, 0.03, 0.01, 0.01, seg=2, v0=-0.015), cor, lado=(1, 0, 0), nome="escora"))
    it.colisao([cx(-W / 2, W / 2, -Lt / 2, Lt / 2, zt + 0.03),
                cx(-W / 2, W / 2, y0, y0 + comp * math.cos(R(ang)) + 0.04, z0 + comp * math.sin(R(ang)) + 0.04)])
    return {"tags": ["espreguicadeira", "madeira", "area externa", "ripas"]}


def uniformiza(ob, mapa):
    """Troca cores do atlas por outras (o degradê do pacote vira manchas de duas cores; aqui viram uma só)."""
    uv = ob.data.uv_layers["UVMap"].data
    for p in ob.data.polygons:
        if mb.MAT_NOMES[p.material_index] != "atlas":
            continue
        u = uv[p.loop_indices[0]].uv
        i = int(u[0] * 16) + 16 * int((1 - u[1]) * 16)
        nome = mb.NOMES[i] if 0 <= i < len(mb.NOMES) else None
        if nome in mapa:
            mb.pinta(ob, mapa[nome], [p.index])


def do_pacote(it, nome, mapa=None):
    pc = mb.importa_pacote(nome)
    for o in pc.values():
        if mapa:
            uniformiza(o, mapa)
        it.add(o)
    centraliza(it)
    lo, hi = mb.bbox(it.partes)
    for o in it.partes:
        mb.transforma(o, loc=(0, 0, -lo.z))
    return {"pacote": True, "tags": ["pacote"]}


sofa("sofa_classico_dois_lugares_coral", "Sofá clássico de dois lugares (coral)", "sofa_classico_dois_lugares",
     ["2 lugares", "almofadas"], sofa_classico, cor="vermelho_claro", n=2, L=1.55, solta="creme",
     pe_cor="madeira_escura")
sofa("sofa_u_modular_marrom", "Sofá em U modular (marrom)", "sofa_u_modular", [], sofa_u, cor="marrom",
     plinto="marrom_escuro")
sofa("sofa_u_modular_cinza_azulado", "Sofá em U modular (cinza-azulado)", "sofa_u_modular", [], sofa_u,
     cor="cinza_azulado", plinto="grafite")
sofa("sofa_canto_l_cinza", "Sofá de canto em L com chaise (cinza)", "sofa_canto_l", [], sofa_l, cor="tecido_cinza",
     plinto="cinza_medio", solta="amarelo")
sofa("sofa_canto_l_bege", "Sofá de canto em L com chaise (bege)", "sofa_canto_l", [], sofa_l, cor="bege",
     plinto="madeira_escura", solta="verde_agua")
sofa("sofa_chaise_amarelo", "Sofá com chaise (amarelo)", "sofa_chaise", [], sofa_chaise, cor="amarelo")
sofa("sofa_chaise_rosa_bebe", "Sofá com chaise (rosa-bebê)", "sofa_chaise", [], sofa_chaise, cor="rosa_bebe",
     solta="azul_celeste", pe_cor="madeira_escura")
sofa("diva_rolo_laranja", "Divã com rolo na cabeceira (laranja)", "diva_rolo", [], diva_rolo, cor="laranja")
sofa("diva_rolo_menta", "Divã com rolo na cabeceira (menta)", "diva_rolo", [], diva_rolo, cor="menta",
     pe_cor="madeira_clara")
sofa("diva_braco_azul", "Divã com braço enrolado (azul)", "diva_braco", [], diva_braco, cor="azul")
sofa("chaise_longue_vermelha", "Chaise longue (vermelha)", "chaise_longue", [], chaise_longue, cor="vermelho")
sofa("chaise_longue_roxa", "Chaise longue (roxa)", "chaise_longue", [], chaise_longue, cor="roxo",
     pe_cor="madeira_escura")
sofa("diva_madeira_cinza", "Divã com estrutura de madeira (cinza)", "diva_madeira", [], diva_madeira,
     cor="cinza_claro")
sofa("espreguicadeira_curva_tijolo", "Espreguiçadeira de ripas curva (tijolo)", "espreguicadeira_curva", [],
     espreguicadeira_curva, cor="tijolo")
sofa("espreguicadeira_curva_madeira", "Espreguiçadeira de ripas curva (madeira)", "espreguicadeira_curva", [],
     espreguicadeira_curva, cor="madeira_mel")
sofa("espreguicadeira_dobravel_violeta", "Espreguiçadeira dobrável de lona (violeta)", "espreguicadeira_dobravel", [],
     espreguicadeira_dobravel, tecido="violeta", tubo_cor="verde_escuro")
sofa("espreguicadeira_dobravel_laranja", "Espreguiçadeira dobrável de lona (laranja)", "espreguicadeira_dobravel",
     [], espreguicadeira_dobravel, tecido="laranja", tubo_cor="azul_marinho")
sofa("espreguicadeira_reclinavel_pinus", "Espreguiçadeira reclinável de ripas (pinho)", "espreguicadeira_reclinavel",
     [], espreguicadeira_reclinavel, cor="pinus")
sofa("espreguicadeira_reclinavel_branca", "Espreguiçadeira reclinável de ripas (branca)",
     "espreguicadeira_reclinavel", [], espreguicadeira_reclinavel, cor="branco")
sofa("sofa_tres_lugares_azul_pacote", "Sofá de três lugares azul (pacote)", "sofa_tres_lugares_pacote", [],
     do_pacote, nome="Couch_08", mapa={"azul_celeste": "azul", "terracota_clara": "laranja_claro"})
sofa("sofa_curvo_rosa_pacote", "Sofá curvo rosa (pacote)", "sofa_curvo_pacote", [], do_pacote, nome="Couch_11",
     mapa={"vermelho": "rosa", "rosa_escuro": "rosa", "terra": "marrom"})


# =====================================================================================================================
# Pufes
# =====================================================================================================================
PUFES = []


def pufe(id_, rotulo, grupo, tags, f, **kw):
    PUFES.append((id_, rotulo, grupo, tags, f, kw))


def pufe_cubo(it, cor):
    """Cubo macio, um pouco estufado em cima."""
    it.add(almof(0.46, 0.46, 0.42, (0, 0, 0.21), cor, e=0.32, ev=0.32, estufa=0.06, nu=28, nv=16, nome="cubo"))
    return {}


def pufe_tambor(it, cor, cor_topo, madeira="madeira_clara"):
    """Banquinho de tambor com almofada redonda em cima e quatro pés de ripa por fora."""
    r = 0.2
    it.add(mb.cilindro(r, 0.26, z=0.07, cor=cor, seg=32, bisel=0.02))
    it.add(se(2 * r + 0.03, 2 * r + 0.03, 0.12, z=0.3, cor=cor_topo, e=1.0, ev=0.4, nu=32, nv=12, estufa=0.1))
    for k in range(4):
        a = R(45 + 90 * k)
        cxx, cyy = math.cos(a) * (r + 0.018), math.sin(a) * (r + 0.018)
        o = caixa_b(0.036, 0.036, 0.31, cor=madeira, bisel=0.01)
        mb.transforma(o, rot=("Z", math.degrees(a)))
        mb.transforma(o, loc=(cxx, cyy, 0))
        it.add(o)
    return {}


def pufe_cilindro(it, cor, cor_base):
    """Cilindro estofado de duas cores: assento fofo em cima, faixa na base."""
    r = 0.2
    it.add(mb.cilindro(r - 0.008, 0.13, z=0.0, cor=cor_base, seg=32, bisel=0.02))
    it.add(se(2 * r, 2 * r, 0.32, z=0.1, cor=cor, e=1.0, ev=0.3, nu=32, nv=14, estufa=0.05))
    return {}


def pufe_banco(it, cor, madeira="madeira_escura"):
    """Banco estofado comprido (pé de cama ou de sala) sobre um rodapé de madeira."""
    it.add(caixa_b(0.92, 0.34, 0.07, z=0.0, cor=madeira, bisel=0.015))
    it.add(se(1.0, 0.42, 0.36, z=0.055, cor=cor, e=0.22, ev=0.32, nu=28, nv=14, estufa=0.04))
    return {}


def pufe_pes(it, cor, pe_cor="metal_claro"):
    """Pufe quadrado macio em quatro pés palito abertos."""
    it.add(se(0.44, 0.44, 0.3, z=0.15, cor=cor, e=0.3, ev=0.34, nu=28, nv=14, estufa=0.05))
    for sx in (-1, 1):
        for sy in (-1, 1):
            o = mb.pe("palito", 0.18, cor=pe_cor, r=0.022)
            mb.transforma(o, rot=[("Y", -sx * 10), ("X", sy * 10)])
            mb.transforma(o, loc=(sx * 0.14, sy * 0.14, 0.0))
            it.add(o)
    return {}


def pufe_redondo(it, cor, botao):
    """Pufe redondo baixo, com o meio afundado e um botão de capitonê."""
    perfil = [(0, 0.0), (0.26, 0.0), (0.31, 0.03), (0.33, 0.11), (0.32, 0.22), (0.27, 0.3), (0.19, 0.335),
              (0.1, 0.33), (0.04, 0.305), (0, 0.3)]
    it.add(mb.torno(perfil, cor=cor, seg=40, angulo=60))
    it.add(mb.esfera(0.025, z=0.305, cor=botao, esc=(1, 1, 0.55), seg=12))
    return {}


def pufe_pera(it, cor):
    """Pufe-pera (puff de bolinhas): gota baixa com o assento afundado na frente."""
    perfil = [(0, 0.0), (0.3, 0.0), (0.4, 0.035), (0.445, 0.14), (0.44, 0.3), (0.39, 0.46), (0.3, 0.6),
              (0.19, 0.7), (0.08, 0.75), (0, 0.76)]
    ob = mb.torno(perfil, cor=cor, seg=40, angulo=80)
    me = ob.data
    for v in me.vertices:
        x, y, z = v.co
        z += 0.1 * (y / 0.44) * (z / 0.76)  # costas mais altas
        d = math.exp(-((x / 0.32) ** 2 + ((y + 0.16) / 0.3) ** 2 + ((z - 0.62) / 0.22) ** 2))
        z -= 0.3 * d
        y += 0.08 * d
        rug = 0.012 * math.sin(7 * math.atan2(y, x) + z * 9) * (z / 0.76)  # dobrinhas do tecido
        rr = math.hypot(x, y)
        if rr > 1e-4:
            x += x / rr * rug
            y += y / rr * rug
        v.co = (x, y, max(0.0, z))
    me.update()
    me.set_sharp_from_angle(angle=R(80))
    it.add(ob)
    return {}


def pufe_bau(it, cor, cor_tampa, pe_cor="madeira_mel"):
    """Pufe-baú: caixa estofada oca com tampa capitonê que abre para cima (dobradiça atrás)."""
    L, P, H, z0, e = 0.72, 0.44, 0.38, 0.06, 0.04
    c = dict(cor=cor, bisel=0.018, seg=3)
    it.add(mb.caixa(L, e, H, y=-P / 2 + e / 2, z=z0, **c), mb.caixa(L, e, H, y=P / 2 - e / 2, z=z0, **c))
    it.add(mb.caixa(e, P - 2 * e + 0.004, H, x=-L / 2 + e / 2, z=z0, **c),
           mb.caixa(e, P - 2 * e + 0.004, H, x=L / 2 - e / 2, z=z0, **c))
    it.add(mb.caixa(L - 2 * e + 0.004, P - 2 * e + 0.004, 0.02, z=z0, cor="creme", bisel=0.004))
    it.add(caixa_b(L - 0.06, P - 0.06, z0 + 0.01, cor=pe_cor, bisel=0.012))
    zt = z0 + H
    tampa = [caixa_b(L + 0.012, P + 0.012, 0.025, z=zt + 0.002, cor=cor_tampa, bisel=0.01),
             almof(L - 0.01, P - 0.01, 0.1, (0, 0, zt + 0.027 + 0.05), cor_tampa, e=0.18, ev=0.5, estufa=0.3, nu=28,
                   nv=12)]
    for bx, by in ((-0.2, -0.07), (0.0, -0.07), (0.2, -0.07), (-0.1, 0.07), (0.1, 0.07)):
        tampa.append(mb.esfera(0.016, x=bx, y=by, z=zt + 0.112, cor="roxo_escuro", esc=(1, 1, 0.6), seg=10))
    it.porta(tampa, dobradica=(0, P / 2, zt + 0.002), eixo="x", lado="cima", nome="tampa")
    it.slot("bau", (0, 0, z0 + 0.02), (L - 2 * e, P - 2 * e, H - 0.03))
    return {"tags": ["bau", "guarda-volumes"]}


pufe("pufe_cubo_azul", "Pufe cubo macio (azul)", "pufe_cubo", ["pufe"], pufe_cubo, cor="azul_medio")
pufe("pufe_tambor_amarelo_verde", "Pufe tambor com pés (amarelo e verde)", "pufe_tambor", ["pufe", "madeira"],
     pufe_tambor, cor="verde", cor_topo="amarelo")
pufe("pufe_cilindro_vermelho", "Pufe cilindro (vermelho e amarelo)", "pufe_cilindro", ["pufe"], pufe_cilindro,
     cor="vermelho_escuro", cor_base="amarelo_escuro")
pufe("pufe_banco_turquesa", "Pufe banco comprido (turquesa)", "pufe_banco", ["pufe", "banco"], pufe_banco,
     cor="turquesa")
pufe("pufe_quadrado_pes_verde", "Pufe quadrado com pés (verde)", "pufe_quadrado_pes", ["pufe"], pufe_pes,
     cor="verde_medio")
pufe("pufe_redondo_mostarda", "Pufe redondo capitonê (mostarda)", "pufe_redondo", ["pufe"], pufe_redondo,
     cor="mostarda", botao="laranja_escuro")
pufe("pufe_pera_vermelho", "Pufe-pera (vermelho)", "pufe_pera", ["pufe", "puff"], pufe_pera, cor="vermelho")
pufe("pufe_bau_lilas", "Pufe-baú com tampa (lilás)", "pufe_bau", ["pufe"], pufe_bau, cor="lilas", cor_tampa="roxo")


# =====================================================================================================================
# Lareiras
# =====================================================================================================================
LAREIRAS = []


def lareira(id_, rotulo, grupo, tags, f, **kw):
    LAREIRAS.append((id_, rotulo, grupo, tags, f, kw))


def tijolinhos(it, lista, y, cor, esp=0.012):
    """Tijolinhos em relevo na face y (frente) ou, com ('x', x0, sinal), na lateral."""
    for item in lista:
        x, z, w, h = item[:4]
        it.add(caixa_b(w, esp, h, x=x, y=y - esp / 2 + 0.003, z=z, cor=cor, bisel=0.004, seg=2))


def tijolinhos_lado(it, lista, x, cor, esp=0.012):
    for y, z, w, h in lista:
        it.add(caixa_b(esp, w, h, x=x + math.copysign(esp / 2 - 0.003, x), y=y, z=z, cor=cor, bisel=0.004, seg=2))


def tampa_chamine(it, l, p, x, y, z, cor="carvao"):
    """Boca escura no topo da chaminé (um rebaixo fino)."""
    it.add(caixa_b(l, p, 0.008, x=x, y=y, z=z - 0.004, cor=cor, bisel=0.003, seg=1))


def lareira_tijolo_chamine(it):
    W, D = 1.15, 0.62
    yf = -D / 2
    it.add(caixa_b(1.3, 0.78, 0.08, y=D / 2 - 0.39, cor="amarelo_escuro", bisel=0.022))
    corpo = caixa_b(W, D, 0.88, z=0.08, cor="terracota", bisel=0.02)
    it.add(recorta(corpo, [cortador_xz(arco(0.62, 0.62, z=0.08), yf - 0.05, 0.5)], "terracota", bisel=0.014,
                   y_boca=yf))
    it.add(caixa_b(1.25, 0.72, 0.09, y=D / 2 - 0.36, z=0.955, cor="amarelo_escuro", bisel=0.022))
    it.add(tronco(1.06, 0.56, 0.44, 0.34, 0.58, y=D / 2 - 0.28, z=1.04, cor="terracota", bisel=0.016))
    it.add(caixa_b(0.44, 0.34, 0.84, y=D / 2 - 0.17, z=1.6, cor="terracota", bisel=0.016))
    tampa_chamine(it, 0.3, 0.2, 0, D / 2 - 0.17, 2.44)
    tijolinhos(it, [(-0.43, 0.22, 0.16, 0.07), (0.44, 0.36, 0.14, 0.07), (-0.38, 0.78, 0.18, 0.07),
                    (0.36, 0.84, 0.12, 0.06), (0.0, 0.84, 0.16, 0.06)], yf, "tijolo")
    yc = D / 2 - 0.34
    tijolinhos(it, [(-0.1, 1.85, 0.14, 0.06), (0.12, 2.12, 0.12, 0.06), (-0.08, 2.32, 0.16, 0.06)], yc, "tijolo")
    tijolinhos_lado(it, [(0.0, 1.95, 0.12, 0.06), (0.08, 2.25, 0.1, 0.06)], 0.22, "tijolo")
    tijolinhos_lado(it, [(-0.1, 0.5, 0.16, 0.07)], W / 2, "tijolo")
    it.add(fogo(0, yf + 0.25, 0.08, 0.42, 0.28, seed=3))
    return {"tags": ["tijolo", "chamine"]}


def lareira_canto_coifa(it):
    pent = [(-0.45, -0.35), (0.45, -0.35), (0.6, -0.2), (0.0, 0.4), (-0.6, -0.2)]
    canto = V((0.0, 0.4))

    def esc(pts, k):
        return [tuple(canto + (V(p) - canto) * k) for p in pts]

    yf = -0.35
    corpo = mb.extrudado(pent, 0.95, cor="branco_gelo", bisel=0.016)
    boca = [(x, z + 0.56) for x, z in mb.ret_arredondado(0.5, 0.34, 0.06)]
    it.add(recorta(corpo, [cortador_xz(boca, yf - 0.06, 0.5)], "branco_gelo", bisel=0.014, y_boca=yf))
    it.add(mb.extrudado(esc(pent, 1.06), 0.055, z=0.11, cor="madeira_media", bisel=0.016))
    it.add(mb.extrudado(esc(pent, 1.13), 0.075, z=0.94, cor="madeira_media", bisel=0.02))
    it.add(loft(esc(pent, 0.97), 1.01, esc(pent, 0.36), 2.3, cor="branco_gelo", bisel=0.02))
    tp = esc(pent, 0.2)
    bm_ = mb.extrudado(tp, 0.008, z=2.296, cor="carvao", bisel=0.002)
    it.add(bm_)
    it.add(fogo(0, -0.2, 0.39, 0.36, 0.2, seed=5))
    centraliza(it)
    return {"tags": ["canto", "coifa"]}


def lareira_simples_chamine(it):
    D = 0.62
    it.add(caixa_b(1.22, 0.64, 0.06, y=D / 2 - 0.32, cor="terracota_escura", bisel=0.014))
    it.add(caixa_b(1.12, 0.57, 0.06, y=D / 2 - 0.285, z=0.058, cor="terracota_escura", bisel=0.014))
    yb = D / 2 - 0.5
    corpo = caixa_b(1.0, 0.5, 0.8, y=D / 2 - 0.25, z=0.116, cor="terracota", bisel=0.018)
    raso = cortador_xz([(x, z + 0.116 + 0.31) for x, z in mb.ret_arredondado(0.62, 0.62, 0.02)], yb - 0.05, 0.085)
    fundo = cortador_xz([(x, z + 0.116 + 0.27) for x, z in mb.ret_arredondado(0.48, 0.54, 0.02)], yb - 0.05, 0.42)
    ob = recorta(corpo, [raso, fundo], "terracota", bisel=0.01, y_boca=yb + 0.035)
    it.add(ob)
    it.add(caixa_b(1.16, 0.6, 0.075, y=D / 2 - 0.3, z=0.915, cor="marrom", bisel=0.022))
    it.add(caixa_b(0.42, 0.3, 1.36, y=D / 2 - 0.15, z=0.99, cor="terracota", bisel=0.016))
    tampa_chamine(it, 0.28, 0.18, 0, D / 2 - 0.15, 2.35)
    it.add(fogo(0, yb + 0.22, 0.116, 0.38, 0.26, seed=7))
    return {"tags": ["chamine"]}


def lareira_branca_tampo(it):
    D = 0.62
    for s in (-1, 1):
        it.add(caixa_b(0.3, 0.6, 0.06, x=s * 0.31, y=D / 2 - 0.3, cor="amarelo_escuro", bisel=0.02))
    yb = D / 2 - 0.5
    corpo = caixa_b(0.9, 0.5, 0.82, y=D / 2 - 0.25, z=0.058, cor="branco_gelo", bisel=0.022)
    nicho = cortador_xz([(-0.18, 0.0), (0.18, 0.0)] + [(x, z + 0.26 - 0.06) for x, z in
                                                     [(0.18, 0.0), (0.12, 0.05), (0.06, 0.06), (-0.06, 0.06),
                                                      (-0.12, 0.05), (-0.18, 0.0)]][1:-1] + [(-0.18, 0.2)],
                        yb - 0.05, 0.36)
    boca = cortador_xz([(x, z + 0.53) for x, z in mb.ret_arredondado(0.42, 0.3, 0.06)], yb - 0.05, 0.38)
    it.add(recorta(corpo, [boca, nicho], "branco_gelo", bisel=0.014, y_boca=yb))
    # o nicho de baixo guarda lenha (pinta de volta o que a rotina escureceu)
    for k, (x, z) in enumerate(((-0.08, 0.1), (0.08, 0.1), (0.0, 0.17))):
        it.add(mb.cilindro(0.045, 0.3, x=x, y=yb + 0.17, z=z, cor="madeira_media", eixo="y", seg=10, bisel=0.006))
    it.add(caixa_b(1.0, 0.62, 0.07, y=D / 2 - 0.31, z=0.874, cor="amarelo_escuro", bisel=0.024))
    it.add(tronco(0.5, 0.34, 0.32, 0.24, 1.28, y=D / 2 - 0.17, z=0.94, cor="branco_gelo", bisel=0.018))
    tampa_chamine(it, 0.08, 0.06, 0, D / 2 - 0.12, 2.22)
    it.add(fogo(0, yb + 0.18, 0.38, 0.32, 0.2, seed=9, n=14))
    return {"tags": ["chamine"]}


def lareira_tijolo_coifa(it):
    D = 0.62
    it.add(caixa_b(1.32, 0.72, 0.05, y=D / 2 - 0.36, cor="grafite", bisel=0.014))
    yb = D / 2 - 0.5
    corpo = caixa_b(1.12, 0.5, 0.86, y=D / 2 - 0.25, z=0.048, cor="tijolo", bisel=0.018)
    boca = cortador_xz([(-0.26, 0.0), (0.26, 0.0), (0.26, 0.46), (0.22, 0.5), (-0.22, 0.5), (-0.26, 0.46)],
                       yb - 0.05, 0.4)
    boca.data.transform(Matrix.Translation((0, 0, 0.048)))
    it.add(recorta(corpo, [boca], "tijolo", bisel=0.012, y_boca=yb))
    for s in (-1, 1):
        it.add(caixa_b(0.24, 0.03, 0.74, x=s * 0.42, y=yb - 0.012, z=0.1, cor="madeira_rosada", bisel=0.01))
        it.add(caixa_b(0.3, 0.06, 0.08, x=s * 0.42, y=yb - 0.02, z=0.44, cor="terracota", bisel=0.014))
        tijolinhos(it, [(s * 0.38, 0.2, 0.12, 0.06), (s * 0.46, 0.3, 0.1, 0.06), (s * 0.4, 0.62, 0.14, 0.06),
                        (s * 0.45, 0.74, 0.1, 0.06)], yb - 0.027, "tijolo")
    it.add(caixa_b(0.62, 0.03, 0.26, y=yb - 0.012, z=0.58, cor="madeira_rosada", bisel=0.01))
    tijolinhos(it, [(-0.14, 0.66, 0.16, 0.06), (0.12, 0.74, 0.14, 0.06)], yb - 0.027, "tijolo")
    it.add(caixa_b(1.24, 0.6, 0.08, y=D / 2 - 0.3, z=0.905, cor="terracota", bisel=0.02))
    for s in (-1, 1):
        it.add(caixa_b(0.2, 0.64, 0.11, x=s * 0.55, y=D / 2 - 0.32, z=0.9, cor="terracota", bisel=0.022))
    it.add(tronco(1.0, 0.48, 0.42, 0.3, 0.86, y=D / 2 - 0.24, z=0.985, cor="salmao", bisel=0.018))
    tampa_chamine(it, 0.2, 0.14, 0, D / 2 - 0.15, 1.845, cor="terracota_escura")
    it.add(fogo(0, yb + 0.2, 0.048, 0.4, 0.26, seed=11))
    return {"tags": ["tijolo", "coifa"]}


def porta_vidro(l, a, x0, yf, z0, cor="ferro", moldura=0.022, esp=0.014, pux="metal", lado="esq"):
    """Porta de vidro com moldura (frente em yf, para −Y); devolve a lista de objetos fechados."""
    m = moldura
    ps = [caixa_b(l, esp, m, x=x0 + l / 2, y=yf - esp / 2, z=z0, cor=cor, bisel=0.004),
          caixa_b(l, esp, m, x=x0 + l / 2, y=yf - esp / 2, z=z0 + a - m, cor=cor, bisel=0.004),
          caixa_b(m, esp, a - 2 * m + 0.004, x=x0 + m / 2, y=yf - esp / 2, z=z0 + m - 0.002, cor=cor, bisel=0.004),
          caixa_b(m, esp, a - 2 * m + 0.004, x=x0 + l - m / 2, y=yf - esp / 2, z=z0 + m - 0.002, cor=cor,
                  bisel=0.004),
          mb.caixa(l - 2 * m + 0.006, 0.005, a - 2 * m + 0.006, x=x0 + l / 2, y=yf - esp / 2, z=z0 + m - 0.003,
                   cor=None, mat="vidro", bisel=0.001)]
    xp = x0 + l - m / 2 if lado == "esq" else x0 + m / 2
    ps.append(mb.puxador("bola", x=xp, y=yf - esp, z=z0 + a / 2, cor=pux, tam=0.8))
    return ps


def fogareiro_cilindro(it, cor="grafite"):
    it.add(mb.torno([(0, 0), (0.2, 0), (0.22, 0.012), (0.22, 0.028), (0.19, 0.044), (0.08, 0.058), (0, 0.06)],
                    cor=cor, seg=32))
    it.add(mb.cilindro(0.07, 0.16, z=0.05, cor=cor, seg=24, bisel=0.01))
    corpo = mb.torno([(0, 0.19), (0.12, 0.19), (0.18, 0.205), (0.2, 0.25), (0.2, 0.72), (0.18, 0.765), (0.12, 0.78),
                      (0, 0.78)], cor=cor, seg=40)
    yfac = -0.155
    face = mb.caixa(0.6, 0.3, 0.27, y=yfac - 0.15, z=0.33, cor=cor, bisel=0)
    boca = cortador_xz([(x, z + 0.46) for x, z in mb.ret_arredondado(0.17, 0.11, 0.025)], -0.3, 0.3)
    ob = recorta(corpo, [face, boca], cor, bisel=0.008, y_boca=yfac, angulo=40)
    mb.pinta_onde(ob, cor, lambda c, n: c.y < yfac + 0.004)
    it.add(ob)
    it.add(brasas(0, -0.05, 0.405, 0.07, 0.05, n=11, seed=2, r=(0.017, 0.025)))
    it.add(mb.cilindro(0.075, 0.05, z=0.76, cor=cor, seg=24, bisel=0.01))
    it.add(tubo_chamine(0.055, 0.78, 2.0, cor=cor))
    it.porta(porta_vidro(0.21, 0.15, -0.105, yfac, 0.385, cor="ferro", moldura=0.02), dobradica=(-0.105, yfac - 0.007, 0),
             lado="esq")
    it.slot("fornalha", (0, -0.03, 0.405), (0.16, 0.12, 0.1))
    return {"tags": ["fogareiro", "ferro", "porta de vidro"]}


def fogareiro_caixa(it, cor="grafite"):
    D = 0.42
    yf = -D / 2
    corpo = caixa_b(0.6, D, 0.4, z=0.16, cor=cor, bisel=0.03)
    boca = cortador_xz([(x, z + 0.34) for x, z in mb.ret_arredondado(0.44, 0.22, 0.04)], yf - 0.05, 0.36)
    it.add(recorta(corpo, [boca], cor, bisel=0.01, y_boca=yf))
    it.add(caixa_b(0.66, 0.48, 0.04, z=0.555, cor=cor, bisel=0.016))
    it.add(caixa_b(0.62, 0.44, 0.03, z=0.14, cor=cor, bisel=0.012))
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.add(mb.tubo([(sx * 0.25, sy * 0.15, 0.17), (sx * 0.27, sy * 0.17, 0.08), (sx * 0.29, sy * 0.19, 0.02)],
                           0.02, cor=cor, raio_curva=0.05))
            it.add(mb.esfera(0.026, x=sx * 0.29, y=sy * 0.19, z=0.016, cor=cor, esc=(1.1, 1.1, 0.6), seg=12))
    it.add(fogo(0, yf + 0.18, 0.23, 0.38, 0.22, seed=13))
    it.add(mb.cilindro(0.085, 0.05, y=0.04, z=0.59, cor=cor, seg=24, bisel=0.01))
    it.add(tubo_chamine(0.065, 0.6, 2.05, y=0.04, cor=cor))
    it.porta(porta_vidro(0.48, 0.26, -0.24, yf, 0.21, cor="ferro", moldura=0.03), dobradica=(-0.24, yf - 0.007, 0),
             lado="esq")
    it.slot("fornalha", (0, 0.0, 0.23), (0.42, 0.3, 0.2))
    return {"tags": ["fogareiro", "ferro", "porta de vidro"]}


def fogareiro_conico(it, cor="grafite"):
    perfil = [(0, 0), (0.26, 0), (0.28, 0.015), (0.28, 0.04), (0.2, 0.07), (0.14, 0.1), (0.14, 0.15), (0.24, 0.19),
              (0.31, 0.24), (0.335, 0.3), (0.325, 0.37), (0.28, 0.41), (0.27, 0.43), (0.27, 0.47), (0.24, 0.55),
              (0.19, 0.64), (0.13, 0.73), (0.09, 0.8), (0.08, 0.84), (0, 0.84)]
    corpo = mb.torno(perfil, cor=cor, seg=40)
    boca = cortador_xz([(x, z + 0.33) for x, z in mb.ret_arredondado(0.4, 0.13, 0.05)], -0.45, 0.45)
    it.add(recorta(corpo, [boca], cor, bisel=0.008, y_boca=-0.36))
    it.add(brasas(0, -0.1, 0.265, 0.15, 0.1, n=18, seed=4, r=(0.02, 0.03)))
    it.add(tubo_chamine(0.065, 0.82, 2.05, cor=cor))
    return {"tags": ["fogareiro", "ferro"]}


def fogareiro_bola(it, cor="grafite"):
    it.add(mb.torno([(0, 0), (0.17, 0), (0.18, 0.014), (0.16, 0.03), (0.11, 0.06), (0.085, 0.11), (0, 0.11)],
                    cor=cor, seg=32))
    corpo = mb.esfera(0.33, z=0.43, cor=cor, seg=40)
    boca = cortador_xz([(x, z + 0.38) for x, z in mb.ret_arredondado(0.36, 0.17, 0.07)], -0.45, 0.45)
    it.add(recorta(corpo, [boca], cor, bisel=0.008, y_boca=-0.34))
    it.add(brasas(0, -0.08, 0.295, 0.14, 0.1, n=16, seed=6, r=(0.02, 0.03)))
    it.add(mb.cilindro(0.08, 0.05, z=0.74, cor=cor, seg=24, bisel=0.01))
    it.add(tubo_chamine(0.065, 0.75, 2.05, cor=cor))
    return {"tags": ["fogareiro", "ferro"]}


def lareira_moderna_rosada(it):
    W, D, H = 0.6, 0.42, 1.5
    corpo = caixa_b(W, D, H, cor="rosa_claro", bisel=0.03)
    x0, x1, y0, y1, z0, z1 = -W / 2 - 0.05, 0.2, -D / 2 - 0.05, 0.08, 0.5, 0.85
    cort = mb.caixa(x1 - x0, y1 - y0, z1 - z0, x=(x0 + x1) / 2, y=(y0 + y1) / 2, z=z0, bisel=0)
    it.add(recorta(corpo, [cort], "rosa_claro", bisel=0.006, y_boca=-D / 2 - 0.1))
    for zz in (z0 - 0.045, z1 - 0.005):
        it.add(caixa_b(x1 - x0 + 0.03 - 0.05, y1 - y0 + 0.03 - 0.05, 0.05, x=(x0 + x1) / 2 + 0.01,
                       y=(y0 + y1) / 2 + 0.01, z=zz, cor="madeira_escura", bisel=0.012))
    it.add(fogo(-0.06, -0.06, z0 + 0.005, 0.36, 0.18, seed=15))
    it.add(mb.caixa(0.006, y1 - (-D / 2) - 0.01, z1 - z0 - 0.004, x=-W / 2 + 0.006, y=(y1 - D / 2) / 2 - 0.004,
                    z=z0 + 0.002, cor=None, mat="vidro", bisel=0.001))
    porta = [mb.caixa(x1 + W / 2 - 0.004, 0.006, z1 - z0 - 0.004, x=(x1 - W / 2) / 2, y=-D / 2 - 0.004,
                      z=z0 + 0.002, cor=None, mat="vidro", bisel=0.001),
             mb.tubo([(x1 - 0.05, -D / 2 - 0.007, z0 + 0.08), (x1 - 0.05, -D / 2 - 0.03, z0 + 0.1),
                      (x1 - 0.05, -D / 2 - 0.03, z1 - 0.1), (x1 - 0.05, -D / 2 - 0.007, z1 - 0.08)], 0.006,
                     cor="madeira_escura", raio_curva=0.015)]
    it.porta(porta, dobradica=(-W / 2 + 0.003, -D / 2 - 0.004, 0), lado="esq")
    it.slot("fornalha", ((x0 + x1) / 2 + 0.03, (-D / 2 + y1) / 2, z0 + 0.005), (0.45, 0.26, z1 - z0 - 0.01))
    return {"tags": ["moderna", "porta de vidro"]}


def lareira_caixa_vidro(it, W, D, H, lado=-1, wv=0.62, zb=0.3, hv=0.4):
    """Caixa branca moderna com a fornalha num canto de baixo, de vidro na frente e no lado (lado=-1: esquerdo)."""
    corpo = caixa_b(W, D, H, cor="branco", bisel=0.045)
    s = lado
    xin = s * W / 2 - s * wv  # x interno do vão (onde termina a fornalha)
    xa, xb = sorted((s * (W / 2 + 0.05), xin))
    y0, y1 = -D / 2 - 0.05, D / 2 - 0.16
    cort = mb.caixa(xb - xa, y1 - y0, hv, x=(xa + xb) / 2, y=(y0 + y1) / 2, z=zb, bisel=0)
    it.add(recorta(corpo, [cort], "branco", bisel=0.008, y_boca=-D / 2 - 0.1))
    # soleira de pedra (sai um pouco para a frente e para o lado)
    xs0, xs1 = sorted((s * (W / 2 + 0.025), xin - s * 0.03))
    it.add(caixa_b(xs1 - xs0, y1 + D / 2 + 0.03, 0.065, x=(xs0 + xs1) / 2, y=(y1 - D / 2 - 0.03) / 2, z=zb - 0.06,
                   cor="bege_escuro", bisel=0.014))
    # caixilho fino de ferro nas arestas do vão
    xe = s * (W / 2 - 0.009)
    ye = -D / 2 + 0.009
    f = 0.018
    it.add(caixa_b(f, f, hv, x=xe, y=ye, z=zb, cor="grafite", bisel=0.005))
    it.add(caixa_b(abs(xin - xe) + f, f, f, x=(xin + xe) / 2, y=ye, z=zb + hv - f, cor="grafite", bisel=0.005))
    it.add(caixa_b(f, y1 - ye + f / 2, f, x=xe, y=(y1 + ye) / 2, z=zb + hv - f, cor="grafite", bisel=0.005))
    it.add(caixa_b(f, y1 - ye + f / 2, f, x=xe, y=(y1 + ye) / 2, z=zb + 0.001, cor="grafite", bisel=0.005))
    it.add(mb.caixa(0.005, y1 - ye - 0.012, hv - 2 * f + 0.004, x=xe, y=(y1 + ye) / 2, z=zb + f - 0.002, cor=None,
                    mat="vidro", bisel=0.001))
    # porta da frente: vidro com caixilho, dobradiça do lado de dentro do vão
    l = abs(xin - xe) - f / 2
    xa_ = min(xin, xe + s * f / 2) if s < 0 else xin
    porta = porta_vidro(l, hv, xa_ if s < 0 else xin, -D / 2 - 0.0005, zb, cor="grafite", moldura=0.018, esp=0.012,
                        pux="grafite", lado="dir" if s < 0 else "esq")
    it.porta(porta, dobradica=(xin, -D / 2 - 0.006, 0), lado="dir" if s < 0 else "esq")
    xm = (xin + xe) / 2
    it.add(fogo(xm, (-D / 2 + y1) / 2 + 0.01, zb + 0.005, min(0.4, abs(xin - xe) * 0.62), 0.2, seed=17))
    it.slot("fornalha", (xm, (-D / 2 + y1) / 2, zb + 0.005), (abs(xin - xe) - 0.04, y1 + D / 2 - 0.04, hv - 0.02))
    return {"tags": ["moderna", "porta de vidro", "vidro de canto"]}


def lareira_classica_colunas(it):
    D = 0.5
    it.add(caixa_b(1.42, D, 0.08, cor="branco", bisel=0.02))
    yb = D / 2 - 0.36
    corpo = caixa_b(1.16, 0.36, 0.98, y=D / 2 - 0.18, z=0.078, cor="porcelana_azul", bisel=0.016)
    raso = cortador_xz([(x, z + 0.078 + 0.35) for x, z in mb.ret_arredondado(0.7, 0.7, 0.02)], yb - 0.05, 0.08)
    fundo = cortador_xz([(x, z + 0.078 + 0.3) for x, z in mb.ret_arredondado(0.56, 0.6, 0.02)], yb - 0.05, 0.3)
    it.add(recorta(corpo, [raso, fundo], "porcelana_azul", bisel=0.01, y_boca=yb + 0.03))
    for s in (-1, 1):
        x = s * 0.48
        it.add(mb.torno([(0, 0), (0.085, 0), (0.085, 0.035), (0.07, 0.05), (0.06, 0.07), (0.06, 0.76),
                         (0.07, 0.79), (0.085, 0.81), (0.085, 0.86), (0, 0.86)], x=x, y=yb - 0.06, z=0.078,
                        cor="branco", seg=24))
    it.add(caixa_b(1.36, 0.06, 0.12, y=yb - 0.02, z=0.92, cor="branco", bisel=0.014))
    it.add(caixa_b(1.5, D + 0.04, 0.09, y=-0.02, z=1.035, cor="branco", bisel=0.022))
    for s in (-1, 1):
        it.add(caixa_b(0.24, 0.12, 0.1, x=s * 0.48, y=yb - 0.05, z=0.94, cor="branco", bisel=0.016))
    it.add(fogo(0, yb + 0.16, 0.078, 0.42, 0.2, seed=19))
    return {"tags": ["classica", "colunas"]}


def lareira_classica_verde(it):
    D = 0.48
    cor, cor2 = "verde_escuro", "turquesa_escuro"
    it.add(caixa_b(1.34, D, 0.07, cor=cor, bisel=0.02))
    yb = D / 2 - 0.34
    corpo = caixa_b(1.16, 0.34, 0.92, y=D / 2 - 0.17, z=0.068, cor=cor, bisel=0.016)
    raso = cortador_xz([(x, z + 0.068 + 0.33) for x, z in mb.ret_arredondado(0.64, 0.66, 0.015)], yb - 0.05, 0.1)
    fundo = cortador_xz([(x, z + 0.068 + 0.29) for x, z in mb.ret_arredondado(0.5, 0.58, 0.015)], yb - 0.05, 0.28)
    ob = recorta(corpo, [raso, fundo], cor, bisel=0.008, y_boca=yb + 0.05)
    mb.pinta_onde(ob, cor2, lambda c, n: yb + 0.004 < c.y < yb + 0.052 and abs(c.x) < 0.33 and c.z < 0.068 + 0.67)
    it.add(ob)
    for s in (-1, 1):
        f = mb.frente(0.2, 0.72, estilo="almofada", cor=cor, cor2="verde_medio", margem=0.035, esp=0.03)
        mb.transforma(f, loc=(s * 0.45, yb + 0.002, 0.11))
        it.add(f)
    f = mb.frente(0.66, 0.15, estilo="almofada", cor=cor, cor2="verde_medio", margem=0.03, esp=0.03)
    mb.transforma(f, loc=(0, yb + 0.002, 0.79))
    it.add(f)
    it.add(caixa_b(1.3, D - 0.04, 0.05, y=-0.02, z=0.985, cor=cor, bisel=0.016))
    it.add(caixa_b(1.4, D + 0.04, 0.06, y=-0.03, z=1.03, cor=cor, bisel=0.022))
    it.add(fogo(0, yb + 0.16, 0.068, 0.38, 0.2, seed=21))
    return {"tags": ["classica"]}


def lareira_terracota_arco(it):
    D = 0.56
    yb = D / 2 - 0.5
    it.add(caixa_b(1.12, 0.66, 0.05, y=D / 2 - 0.33, cor="marrom", bisel=0.014))
    corpo = caixa_b(1.0, 0.5, 0.88, y=D / 2 - 0.25, z=0.048, cor="terracota_clara", bisel=0.03)
    it.add(recorta(corpo, [cortador_xz(arco(0.46, 0.56, z=0.048), yb - 0.05, 0.4)], "terracota_clara", bisel=0.012,
                   y_boca=yb))
    aro = mb.extrudado(mb._ccw(arco(0.62, 0.65, z=0.048)), 0.05, y=yb - 0.035, plano="xz", cor="marrom_claro",
                       bisel=0.014)
    it.add(recorta(aro, [cortador_xz(arco(0.46, 0.56, z=0.0), yb - 0.1, 0.2)], "marrom_claro", bisel=0.01,
                   cor_dentro=None))
    it.add(caixa_b(1.06, 0.54, 0.06, y=D / 2 - 0.27, z=0.92, cor="terracota_clara", bisel=0.022))
    for sx in (-1, 1):
        for zz in (0.28, 0.72):
            x = sx * 0.5
            it.add(caixa_b(0.1, 0.012, 0.05, x=x - sx * 0.045, y=yb - 0.004, z=zz, cor="grafite", bisel=0.004))
            it.add(caixa_b(0.012, 0.1, 0.05, x=x + sx * 0.004, y=yb + 0.045, z=zz, cor="grafite", bisel=0.004))
            it.add(mb.esfera(0.008, x=x - sx * 0.06, y=yb - 0.01, z=zz + 0.025, cor="metal_escuro", seg=8))
    it.add(fogo(0, yb + 0.2, 0.048, 0.36, 0.24, seed=23))
    return {"tags": ["terracota", "arco"]}


lareira("lareira_tijolo_chamine", "Lareira de tijolo com chaminé", "lareira_tijolo_chamine", ["lareira"],
        lareira_tijolo_chamine)
lareira("lareira_canto_coifa", "Lareira de canto com coifa (branca)", "lareira_canto_coifa", ["lareira"],
        lareira_canto_coifa)
lareira("lareira_simples_chamine", "Lareira simples com chaminé", "lareira_simples_chamine", ["lareira"],
        lareira_simples_chamine)
lareira("lareira_branca_tampo_amarelo", "Lareira branca com tampo amarelo", "lareira_branca_tampo", ["lareira"],
        lareira_branca_tampo)
lareira("lareira_tijolo_coifa_rosada", "Lareira de tijolo com coifa rosada", "lareira_tijolo_coifa", ["lareira"],
        lareira_tijolo_coifa)
lareira("lareira_fogareiro_cilindro", "Fogareiro de ferro cilíndrico", "lareira_fogareiro_cilindro",
        ["lareira"], fogareiro_cilindro)
lareira("lareira_fogareiro_caixa", "Fogareiro de ferro de caixa com pés", "lareira_fogareiro_caixa", ["lareira"],
        fogareiro_caixa)
lareira("lareira_fogareiro_conico", "Fogareiro de ferro cônico", "lareira_fogareiro_conico", ["lareira"],
        fogareiro_conico)
lareira("lareira_fogareiro_bola", "Fogareiro de ferro em bola", "lareira_fogareiro_bola", ["lareira"],
        fogareiro_bola)
lareira("lareira_moderna_rosada", "Lareira moderna rosada com vidro", "lareira_moderna_rosada", ["lareira"],
        lareira_moderna_rosada)
lareira("lareira_caixa_vidro_canto", "Lareira moderna com vidro de canto", "lareira_caixa_vidro_canto",
        ["lareira"], lareira_caixa_vidro, W=0.95, D=0.5, H=1.3, lado=-1, wv=0.56)
lareira("lareira_caixa_vidro_larga", "Lareira moderna larga com vidro de canto", "lareira_caixa_vidro_larga",
        ["lareira"], lareira_caixa_vidro, W=1.25, D=0.55, H=1.45, lado=1, wv=0.78, zb=0.32, hv=0.44)
lareira("lareira_classica_colunas", "Lareira clássica com colunas (branca)", "lareira_classica_colunas",
        ["lareira"], lareira_classica_colunas)
lareira("lareira_classica_verde", "Lareira clássica (verde)", "lareira_classica_verde", ["lareira"],
        lareira_classica_verde)
lareira("lareira_terracota_arco", "Lareira de terracota com boca em arco", "lareira_terracota_arco", ["lareira"],
        lareira_terracota_arco)


# =====================================================================================================================
# Execução
# =====================================================================================================================
CATS = {"sofas": ("Sofás e espreguiçadeiras", SOFAS), "pufes": ("Pufes", PUFES), "lareiras": ("Lareiras", LAREIRAS)}


def main():
    a = sys.argv[sys.argv.index("--") + 1:]
    saida = a[0]
    sel = a[1] if len(a) > 1 else None
    for cat_nome, (cat_rot, lista) in CATS.items():
        if sel and sel in CATS and sel != cat_nome:
            continue
        ids = None if (not sel or sel in CATS) else set(sel.split(","))
        alvo = [x for x in lista if ids is None or x[0] in ids]
        if not alvo:
            continue
        cat = mb.Catalogo(cat_nome, saida, cat_rot)
        for id_, rotulo, grupo, tags, f, kw in alvo:
            mb.limpa()
            it = mb.Item(id_)
            extra = dict(f(it, **kw) or {})
            tg = list(tags) + [t for t in extra.pop("tags", []) if t not in tags]
            cat.exporta(it, rotulo, grupo=grupo, tags=tg, **extra)
        cat.salva()
    print("ok", flush=True)


if __name__ == "__main__":
    main()
