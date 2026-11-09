"""Categoria "mesas" da biblioteca de móveis do Morada: mesas de jantar, de centro, laterais, escrivaninhas,
aparadores e balcões (referência: moveis/refs/ref_08.webp; pacote: Coffee_Table_03, Work_Table_06, Kitchen_Table_09).

Uso: blender-venv/bin/python -I morada-art/moveis_mesas.py -- <saida> [id1,id2 ...]
Sem ids, gera a categoria inteira; com ids (separados por vírgula ou espaço), só esses."""
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
FILTRO = {a for s in ARGS[1:] for a in s.replace(" ", ",").split(",") if a}
cat = mb.Catalogo("mesas", SAIDA, "Mesas")


# ---------------------------------------------------------------------------------------------------------------------
# Ajudantes de forma
# ---------------------------------------------------------------------------------------------------------------------
def _dedup(pts):
    out = []
    for p in pts:
        if not out or (V(p) - V(out[-1])).length > 1e-5:
            out.append(p)
    while len(out) > 2 and (V(out[0]) - V(out[-1])).length <= 1e-5:
        out.pop()
    return out


def arred(pts, raios, n=6):
    """Polígono fechado com raio próprio em cada vértice (0 = canto vivo, usado onde a curva já é desenhada)."""
    if not isinstance(raios, (list, tuple)):
        raios = [raios] * len(pts)
    P = [V((p[0], p[1])) for p in pts]
    N = len(P)
    out = []
    for i in range(N):
        a, b, c = P[i - 1], P[i], P[(i + 1) % N]
        r = raios[i]
        if r <= 0:
            out.append((b.x, b.y))
            continue
        d1, d2 = a - b, c - b
        rr = min(r, d1.length * 0.49, d2.length * 0.49)
        p1, p2 = b + d1.normalized() * rr, b + d2.normalized() * rr
        for k in range(n + 1):
            t = k / n
            q = (1 - t) ** 2 * p1 + 2 * (1 - t) * t * b + t * t * p2
            out.append((q.x, q.y))
    return mb._ccw(_dedup(out))


def desloca(pts, d):
    """Desloca um contorno anti-horário para fora (d > 0) ou para dentro (d < 0), com meia-esquadria."""
    P = [V(p) for p in pts]
    N = len(P)
    out = []
    for i in range(N):
        a, b, c = P[i - 1], P[i], P[(i + 1) % N]
        e1, e2 = (b - a).normalized(), (c - b).normalized()
        n1, n2 = V((e1.y, -e1.x)), V((e2.y, -e2.x))
        m = n1 + n2
        m = n1 if m.length < 1e-6 else m.normalized()
        k = d / max(0.3, m.dot(n1))
        out.append((b.x + m.x * k, b.y + m.y * k))
    return out


def tampo(pts, esp, z, cor, bisel=None, x=0.0, y=0.0, nome="tampo"):
    """Tampo boleado: extrusão do contorno com bisel generoso."""
    b = esp * 0.4 if bisel is None else bisel
    return mb.extrudado(pts, esp, x=x, y=y, z=z, cor=cor, bisel=b, seg=3, nome=nome)


def ret(l, p, r=0.04, seg=6):
    return mb._ccw(mb.ret_arredondado(l, p, r, seg))


def oval(rx, ry, n=64, ovo=0.0):
    """Elipse; ovo > 0 engorda o lado +X (formato de ovo)."""
    pts = []
    for k in range(n):
        t = 2 * math.pi * k / n
        pts.append((rx * math.cos(t), ry * math.sin(t) * (1 + ovo * math.cos(t))))
    return mb._ccw(pts)


def nuvem(circulos, n=120, suaviza=2):
    """Contorno em estrela a partir do centro: o raio de cada direção é o alcance máximo do raio nos círculos."""
    rs = []
    for k in range(n):
        t = 2 * math.pi * k / n
        d = V((math.cos(t), math.sin(t)))
        best = 0.0
        for cx, cy, r in circulos:
            c = V((cx, cy))
            b = d.dot(c)
            disc = b * b - c.length_squared + r * r
            if disc >= 0:
                best = max(best, b + math.sqrt(disc))
        rs.append(best)
    for _ in range(suaviza):
        rs = [(rs[i - 1] + 2 * rs[i] + rs[(i + 1) % n]) / 4 for i in range(n)]
    return mb._ccw([(r * math.cos(2 * math.pi * k / n), r * math.sin(2 * math.pi * k / n)) for k, r in enumerate(rs)])


def perna(p0, p1, r0, r1, cor, seg=16, bisel=None, nome="perna"):
    """Cilindro (ou cone) de p0 (raio r0) até p1 (raio r1), em qualquer direção."""
    p0, p1 = V(p0), V(p1)
    d = p1 - p0
    ob = mb.cilindro(r0, d.length, r2=r1, cor=cor, seg=seg, bisel=min(r0, r1) * 0.3 if bisel is None else bisel,
                     nome=nome)
    R = V((0, 0, 1)).rotation_difference(d.normalized()).to_matrix().to_4x4()
    ob.data.transform(Matrix.Translation(p0) @ R)
    return ob


def corta_chao(ob, cor):
    """Corta o que passa abaixo do chão (z < 0) e tampa o furo: pé inclinado apoiado de chapa no chão."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, 0), plane_no=(0, 0, 1),
                           clear_inner=True)
    borda = [e for e in bm.edges if e.is_boundary]
    if borda:
        novas = bmesh.ops.holes_fill(bm, edges=borda, sides=0)["faces"]
        uvl = bm.loops.layers.uv["UVMap"]
        u = mb.uv_cor(cor)
        for f in novas:
            f.material_index = 0
            f.smooth = False
            for lo in f.loops:
                lo[uvl].uv = u
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()
    return ob


def perna_chao(topo, pe_xy, r_topo, r_pe, cor, seg=16):
    """Perna inclinada do ponto topo (dentro do tampo) até o chão em pe_xy, cortada rente ao chão."""
    T, F = V(topo), V((pe_xy[0], pe_xy[1], 0.0))
    d = (T - F).normalized()
    F2 = F - d * 0.05
    ob = perna(F2, T, r_pe, r_topo, cor, seg=seg)
    return corta_chao(ob, cor)


def ponto_em(pe_xy, topo, z):
    """Ponto da linha central da perna (do chão em pe_xy até topo) na altura z."""
    F, T = V((pe_xy[0], pe_xy[1], 0.0)), V(topo)
    t = z / T.z
    return F + (T - F) * t


def barra(p0, p1, w, t, cor, bisel=0.008, nome="barra"):
    """Barra retangular (w × t de seção) de p0 a p1."""
    p0, p1 = V(p0), V(p1)
    d = p1 - p0
    ob = mb.caixa(w, t, d.length, cor=cor, bisel=bisel, nome=nome)
    R = V((0, 0, 1)).rotation_difference(d.normalized()).to_matrix().to_4x4()
    ob.data.transform(Matrix.Translation(p0) @ R)
    return ob


def anel(R, rt, z, cor, x=0.0, y=0.0, n=48, ry=None):
    """Aro (toro) de raio R (ou elipse R × ry) com tubo de raio rt, na altura z."""
    ry = R if ry is None else ry
    pts = [(x + R * math.cos(2 * math.pi * k / n), y + ry * math.sin(2 * math.pi * k / n), z) for k in range(n)]
    return mb.tubo(pts, rt, cor=cor, raio_curva=0, seg=12, fechado=True, nome="anel")


def pe_quadrado_conico(l0, l1, a, cor, bisel=0.012, nome="pe_q"):
    """Pé de seção quadrada que afina para baixo (l0 embaixo, l1 em cima), com o topo em z = 0 e a base em z = −a."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        s = l1 if v.co.z > 0 else l0
        v.co = V((v.co.x * s, v.co.y * s, v.co.z * a - a / 2))
    mb._bevel(bm, min(bisel, l0 / 2.1), 3)
    return mb._obj(nome, bm, cor)


def anel_extrudado(ext, inn, prof, y=0.0, cor="branco", bisel=0.012, nome="moldura"):
    """Moldura vazada: contorno externo e interno (mesmo número de pontos, plano XZ) extrudados em Y (prof),
    centrada em y. Para mesas de nicho."""
    bm = bmesh.new()
    ve = [bm.verts.new((px, 0, pz)) for px, pz in ext]
    vi = [bm.verts.new((px, 0, pz)) for px, pz in inn]
    n = len(ve)
    for k in range(n):
        bm.faces.new((ve[k], ve[(k + 1) % n], vi[(k + 1) % n], vi[k]))
    r = bmesh.ops.extrude_face_region(bm, geom=bm.faces[:])
    for v in [g for g in r["geom"] if isinstance(g, bmesh.types.BMVert)]:
        v.co.y += prof
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    mb._bevel(bm, bisel, 3, [e for e in bm.edges if len(e.link_faces) == 2 and
                             e.link_faces[0].normal.dot(e.link_faces[1].normal) < 0.85])
    bm.transform(Matrix.Translation((0, y - prof / 2, 0)))
    return mb._obj(nome, bm, cor)


def sem_col(*objs):
    for o in objs:
        o["sem_col"] = 1
    return objs[0] if len(objs) == 1 else objs


def pe_classico(a, x, y, cor, r=0.04, bloco=True, cor_anel=None, h_anel=0.0):
    """Pé torneado clássico e encorpado: bloco quadrado em cima (onde encaixa o avental), vaso torneado com anéis e,
    se pedido, um anel de outra cor no pé."""
    out = []
    hb = min(0.11, a * 0.2) if bloco else 0.0
    if bloco:
        out.append(mb.caixa(1.7 * r, 1.7 * r, hb + 0.004, x=x, y=y, z=a - hb, cor=cor, bisel=r * 0.22))
    z0 = h_anel - 0.004 if cor_anel else 0.0
    k = a - hb - z0
    perfil = [(0, 0), (r * 0.62, 0), (r * 0.7, k * 0.03), (r * 0.55, k * 0.07), (r * 0.48, k * 0.13),
              (r * 0.6, k * 0.3), (r * 0.88, k * 0.47), (r * 0.84, k * 0.57), (r * 0.56, k * 0.7), (r * 0.5, k * 0.78),
              (r * 0.74, k * 0.84), (r * 0.58, k * 0.9), (r * 0.66, k * 0.96), (r * 0.7, k + 0.006), (0, k + 0.006)]
    if not bloco:
        perfil[-2:] = [(r * 0.9, k * 0.985), (r * 0.9, k), (0, k)]
    out.append(mb.torno(perfil, x=x, y=y, z=z0, cor=cor, seg=16))
    if cor_anel:
        out.append(mb.torno([(0, 0), (r * 0.66, 0), (r * 0.8, h_anel * 0.25), (r * 0.82, h_anel * 0.6),
                             (r * 0.64, h_anel), (0, h_anel)], x=x, y=y, cor=cor_anel, seg=16))
    return out


def pe_torneado_anel(a, x, y, cor, cor_anel, r=0.035, h_anel=0.06):
    """Pé torneado sem bloco, com um anel de outra cor no pé (penteadeira, mesa de centro de tampo curvo)."""
    return pe_classico(a, x, y, cor, r=r, bloco=False, cor_anel=cor_anel, h_anel=h_anel)


def avental_com_gaveta(it, xl, yl, za, ha, wg, cor, cor_frente, cor_caixa, pux="bola", cor_pux="ouro", esp=0.025,
                       prof=0.38):
    """Avental de mesa (fundo, laterais e dois trechos da frente) com uma gaveta de verdade no meio da frente."""
    it.add(mb.caixa(2 * xl, esp, ha, y=yl, z=za, cor=cor, bisel=0.008))
    for sx in (-1, 1):
        it.add(mb.caixa(esp, 2 * yl, ha, x=sx * xl, z=za, cor=cor, bisel=0.008))
        w = xl - wg / 2 - 0.004
        it.add(mb.caixa(w, esp, ha, x=sx * (wg / 2 + 0.004 + w / 2), y=-yl, z=za, cor=cor, bisel=0.008))
    gaveteiro(it, 0.0, -yl + esp / 2 + prof / 2, wg, prof, za + 0.002, ha + 0.006, 1, cor, cor_frente, cor_caixa,
              pux=pux, cor_pux=cor_pux, esp=0.016, folga_frente=0.008)


# ---------------------------------------------------------------------------------------------------------------------
# Gavetas
# ---------------------------------------------------------------------------------------------------------------------
def gaveta(it, cx, yf, z0, w, h, caixa_lpa, zb, cor, cor_caixa, pux="bola", cor_pux="ouro", estilo="lisa", cor2=None,
           n_pux=1, tam_pux=1.0):
    """Frente (w × h, base em z0, face de trás no plano yf) + puxador(es) + caixa de verdade com slot."""
    fr = mb.frente(w, h, estilo=estilo, cor=cor, cor2=cor2 or cor, margem=min(w, h) * 0.17)
    mb.transforma(fr, loc=(cx, yf, z0))
    objs = [fr]
    xs = [cx] if n_pux == 1 else [cx - w * 0.3, cx + w * 0.3]
    for px in xs:
        objs.append(mb.puxador(pux, x=px, y=yf - 0.022, z=z0 + h / 2, cor=cor_pux, vertical=False, tam=tam_pux))
    bl, bp, ba = caixa_lpa
    return it.gaveta(bl, bp, ba, objs, x=cx, y_frente=yf, z=zb, cor=cor_caixa)


def gaveteiro(it, cx, cy, L, P, z0, A, n, cor_corpo, cor_frente, cor_caixa, pux="bola", cor_pux="ouro",
              estilo="lisa", cor2=None, esp=0.02, n_pux=1, folga_frente=0.004):
    """Corpo oco aberto na frente (−Y) com n compartimentos iguais, cada um com uma gaveta de frente sobreposta."""
    passo = (A - esp) / n
    hs = [passo * k for k in range(1, n)]
    it.add(mb.carcaca(L, P, A, x=cx, y=cy, z=z0, esp=esp, cor=cor_corpo, prateleiras=hs))
    pisos = [z0 + esp] + [z0 + h + esp * 0.8 for h in hs]
    tetos = [z0 + h for h in hs] + [z0 + A - esp]
    yf = cy - P / 2
    hf = A / n
    gs = []
    for k in range(n):
        g = gaveta(it, cx, yf, z0 + k * hf + folga_frente / 2, L - folga_frente, hf - folga_frente,
                   (L - 2 * esp - 0.008, P - esp - 0.03, tetos[k] - pisos[k] - 0.012), pisos[k] + 0.003,
                   cor_frente, cor_caixa, pux=pux, cor_pux=cor_pux, estilo=estilo, cor2=cor2, n_pux=n_pux)
        gs.append(g)
    return gs


# ---------------------------------------------------------------------------------------------------------------------
# Colisão e slot do tampo
# ---------------------------------------------------------------------------------------------------------------------
def _ilhas(o):
    me = o.data
    M = o.matrix_world
    pai = list(range(len(me.vertices)))

    def f(i):
        while pai[i] != i:
            pai[i] = pai[pai[i]]
            i = pai[i]
        return i

    for e in me.edges:
        a, b = f(e.vertices[0]), f(e.vertices[1])
        if a != b:
            pai[a] = b
    g = {}
    for v in me.vertices:
        g.setdefault(f(v.index), []).append(M @ v.co)
    return list(g.values())


def _bb(pts):
    return (V([min(p[i] for p in pts) for i in range(3)]), V([max(p[i] for p in pts) for i in range(3)]))


def colisao_auto(it, z_corte):
    """Uma caixa para o tampo (tudo acima de z_corte) e uma por apoio abaixo dele (pés, pedestal, painel, gaveteiro),
    para o vão debaixo da mesa ficar livre. Peças marcadas com sem_col (travessas finas) não entram."""
    bpy.context.view_layer.update()
    objs = [o for o in it.partes if not o.get("sem_col")] + [o for o, _ in it.interativos]
    altos, baixos = [], []
    for o in objs:
        for ilha in _ilhas(o):
            lo, hi = _bb(ilha)
            altos += [p for p in ilha if p.z >= z_corte - 1e-4]
            if lo.z < z_corte - 0.02:
                baixos.append([lo.x, lo.y, max(0.0, lo.z), hi.x, hi.y, min(hi.z, z_corte)])
    mudou = True
    while mudou:
        mudou = False
        for i in range(len(baixos)):
            for j in range(i + 1, len(baixos)):
                a, b = baixos[i], baixos[j]
                if all(a[k] <= b[k + 3] + 0.005 and b[k] <= a[k + 3] + 0.005 for k in range(3)):
                    baixos[i] = [min(a[k], b[k]) for k in range(3)] + [max(a[k + 3], b[k + 3]) for k in range(3)]
                    del baixos[j]
                    mudou = True
                    break
            if mudou:
                break
    if len(baixos) > 5:
        baixos = [[min(b[k] for b in baixos) for k in range(3)] + [max(b[k + 3] for b in baixos) for k in range(3)]]
    caixas = []
    lo, hi = _bb(altos)
    caixas.append((((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z), (hi.x - lo.x, hi.y - lo.y, hi.z - lo.z)))
    for b in baixos:
        caixas.append((((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, b[2]), (b[3] - b[0], b[4] - b[1], b[5] - b[2])))
    topo_z = max(p.z for o in it.partes for p in (o.matrix_world @ v.co for v in o.data.vertices))
    return [((round(c[0], 4), round(c[1], 4), round(c[2], 4)), tuple(round(t, 4) for t in tam)) for c, tam in caixas], \
        (lo, hi, topo_z)


def fecha(it, rotulo, grupo, tags, z_corte=None, cols="auto", slot_tampo=True, pacote=False, slots=None,
          altura_livre=0.45):
    if cols == "auto":
        caixas, (lo, hi, topo) = colisao_auto(it, z_corte)
        it.colisao(caixas)
        if slot_tampo:
            it.slot("tampo", ((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, topo),
                    (round((hi.x - lo.x) * 0.84, 3), round((hi.y - lo.y) * 0.84, 3), altura_livre))
    elif cols:
        it.colisao(cols)
    for s in slots or []:
        it.slot(*s)
    return cat.exporta(it, rotulo, grupo=grupo, pacote=pacote, tags=tags)


# ---------------------------------------------------------------------------------------------------------------------
# Mesas de jantar (0,75 m)
# ---------------------------------------------------------------------------------------------------------------------
H = 0.75


def mesa_redonda_pedestal(it, c):
    D, e = 0.95, 0.045
    it.add(tampo(mb.circulo(D / 2, 64), e, H - e, c["tampo"], bisel=0.018))
    it.add(mb.extrudado(mb.circulo(D / 2 - 0.09, 48), 0.05, z=H - e - 0.045, cor=c["saia"], bisel=0.012))
    zt = H - e - 0.04
    it.add(mb.torno([(0, 0), (0.25, 0), (0.265, 0.012), (0.255, 0.035), (0.2, 0.06), (0.12, 0.085), (0.07, 0.11),
                     (0.055, 0.15), (0.05, 0.28), (0.075, 0.30), (0.085, 0.33), (0.075, 0.36), (0.05, 0.38),
                     (0.046, 0.56), (0.07, 0.6), (0.13, 0.63), (0.14, zt - 0.01), (0.13, zt), (0, zt)],
                    cor=c["pe"], seg=40))
    return H - e - 0.05


def mesa_redonda_aro(it, c):
    D, e = 0.9, 0.045
    it.add(tampo(mb.circulo(D / 2, 64), e, H - e, c["tampo"], bisel=0.018))
    it.add(mb.extrudado(mb.circulo(0.34, 48), 0.035, z=H - e - 0.03, cor=c["tampo2"], bisel=0.01))
    zt = H - e + 0.01
    za = 0.47
    for k in range(4):
        a = math.radians(45 + 90 * k)
        topo = (0.29 * math.cos(a), 0.29 * math.sin(a), zt)
        pe_ = (0.36 * math.cos(a), 0.36 * math.sin(a))
        it.add(perna_chao(topo, pe_, 0.028, 0.022, c["pe"]))
    ra = ponto_em((0.36, 0), (0.29, 0, zt), za).x
    it.add(sem_col(anel(ra, 0.014, za, c["pe"], n=56)))
    return H - e - 0.03


def mesa_octogonal(it, c):
    e = 0.05
    it.add(tampo(mb.poligono(8, 0.5, rot=math.pi / 8), e, H - e, c["tampo"], bisel=0.016))
    zt = H - e + 0.005
    it.add(mb.torno([(0, 0), (0.24, 0), (0.235, 0.025), (0.18, 0.1), (0.13, 0.22), (0.1, 0.38), (0.092, 0.52),
                     (0.1, 0.6), (0.14, 0.64), (0.15, 0.66), (0.15, zt), (0, zt)], cor=c["pe"], seg=8, angulo=30))
    return H - e - 0.09


def mesa_cavalete_azul(it, c):
    L, P, e = 1.3, 0.72, 0.05
    it.add(tampo(ret(L, P, 0.04), e, H - e, c["tampo"], bisel=0.018))
    za, ha = H - e - 0.075, 0.08
    xl, yl = L / 2 - 0.09, P / 2 - 0.08
    it.add(mb.caixa(2 * xl, 0.025, ha, y=-yl, z=za, cor=c["tampo"], bisel=0.008))
    it.add(mb.caixa(2 * xl, 0.025, ha, y=yl, z=za, cor=c["tampo"], bisel=0.008))
    for sx in (-1, 1):
        it.add(mb.caixa(0.025, 2 * yl, ha, x=sx * xl, z=za, cor=c["tampo"], bisel=0.008))
        it.add(mb.caixa(0.045, 2 * yl, 0.055, x=sx * xl, z=0.12, cor=c["pe"], bisel=0.012))
        it.add(mb.caixa(0.04, 0.05, za - 0.17 + 0.006, x=sx * xl, y=0, z=0.17, cor=c["pe"], bisel=0.01))
        for sy in (-1, 1):
            it.add(mb.pe("bloco", H - e + 0.004, x=sx * xl, y=sy * yl, cor=c["pe"], r=0.032))
    return za


def mesa_cavalete_x(it, c):
    L, P, e = 1.25, 0.64, 0.06
    it.add(tampo(ret(L, P, 0.04), e, H - e, c["tampo"], bisel=0.022))
    zt = H - e + 0.004
    for sx in (-1, 1):
        x = sx * (L / 2 - 0.16)
        it.add(mb.caixa(0.06, P - 0.1, 0.045, x=x, z=H - e - 0.04, cor=c["pe"], bisel=0.012))
        for s in (-1, 1):
            b = barra((x, s * 0.27, -0.05), (x, -s * 0.23, zt), 0.045, 0.075, c["pe"], bisel=0.014)
            it.add(corta_chao(b, c["pe"]))
    t = 0.27 / 0.5
    zc = -0.05 + t * (zt + 0.05)
    it.add(sem_col(barra((-(L / 2 - 0.16), 0, zc), ((L / 2 - 0.16), 0, zc), 0.05, 0.04, c["pe"], bisel=0.012)))
    return H - e - 0.04


def mesa_chanfrada(it, c):
    L, P, e = 1.1, 0.62, 0.06
    it.add(tampo(ret(L, P, 0.035), e, H - e, c["tampo"], bisel=0.022))
    za, ha = H - e - 0.08, 0.085
    xl, yl = L / 2 - 0.07, P / 2 - 0.07
    it.add(mb.caixa(2 * xl, 0.03, ha, y=-yl, z=za, cor=c["tampo"], bisel=0.01))
    it.add(mb.caixa(2 * xl, 0.03, ha, y=yl, z=za, cor=c["tampo"], bisel=0.01))
    for sx in (-1, 1):
        it.add(mb.caixa(0.03, 2 * yl, ha, x=sx * xl, z=za, cor=c["tampo"], bisel=0.01))
    ang = 5.0
    a = (H - e + 0.01) / math.cos(math.radians(ang)) + 0.05
    for sx in (-1, 1):
        for sy in (-1, 1):
            p = pe_quadrado_conico(0.045, 0.07, a, c["pe"], bisel=0.014)
            mb.transforma(p, rot=[("Y", -sx * ang), ("X", sy * ang)])
            mb.transforma(p, loc=(sx * (xl - 0.005), sy * (yl - 0.005), H - e + 0.01))
            it.add(corta_chao(p, c["pe"]))
    return za


def _contorno_pontas_curvas(L, P, b, n=10, lados=False):
    """Retângulo com as pontas (ou os lados compridos) abauladas para fora em b, cantos boleados."""
    pts, raios = [], []
    if lados:  # frente e fundo abaulados
        for k in range(n + 1):
            x = -L / 2 + L * k / n
            pts.append((x, -P / 2 - b * math.sin(math.pi * k / n)))
        for k in range(n + 1):
            x = L / 2 - L * k / n
            pts.append((x, P / 2 + b * math.sin(math.pi * k / n)))
        raios = [0.0] * len(pts)
        for i in (0, n, n + 1, 2 * n + 1):
            raios[i] = 0.035
    else:  # pontas abauladas
        pts.append((-L / 2, -P / 2))
        raios.append(0.035)
        for k in range(n + 1):
            y = -P / 2 + P * k / n
            pts.append((L / 2 + b * math.sin(math.pi * k / n), y))
            raios.append(0.035 if k in (0, n) else 0.0)
        pts.append((-L / 2, P / 2))
        raios.append(0.035)
        for k in range(1, n):
            y = P / 2 - P * k / n
            pts.append((-L / 2 - b * math.sin(math.pi * k / n), y))
            raios.append(0.0)
        pts = pts[:1] + pts[1:]
    return arred(pts, raios)


def mesa_torneada_clara(it, c):
    L, P, e = 1.15, 0.62, 0.05
    it.add(tampo(_contorno_pontas_curvas(L, P, 0.05), e, H - e, c["tampo"], bisel=0.02))
    za, ha = H - e - 0.095, 0.1
    xl, yl = L / 2 - 0.08, P / 2 - 0.07
    avental_com_gaveta(it, xl, yl, za, ha, 0.42, c["saia"], c["frente"], c["caixa"], pux="bola", cor_pux=c["pux"])
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.add(pe_classico(H - e + 0.004, sx * xl, sy * yl, c["pe"], r=0.045))
    return za


def mesa_oval_aro(it, c):
    e = 0.045
    it.add(tampo(oval(0.52, 0.34), e, H - e, c["tampo"], bisel=0.018))
    it.add(mb.extrudado(oval(0.4, 0.24, 48), 0.04, z=H - e - 0.035, cor=c["tampo"], bisel=0.01))
    zt = H - e + 0.01
    zs = 0.22
    tops, pes = {}, {}
    for sx in (-1, 1):
        for sy in (-1, 1):
            tops[sx, sy] = (sx * 0.33, sy * 0.17, zt)
            pes[sx, sy] = (sx * 0.39, sy * 0.22)
            it.add(perna_chao(tops[sx, sy], pes[sx, sy], 0.026, 0.02, c["pe"]))
    q = {k: ponto_em(pes[k], tops[k], zs) for k in tops}
    for a, b in (((-1, -1), (1, -1)), ((-1, 1), (1, 1)), ((-1, -1), (-1, 1)), ((1, -1), (1, 1))):
        it.add(sem_col(perna(q[a], q[b], 0.014, 0.014, c["pe"], seg=12)))
    return H - e - 0.035


def mesa_palito(it, c):
    L, P, e = 0.95, 0.56, 0.05
    it.add(tampo(ret(L, P, 0.045), e, H - e, c["tampo"], bisel=0.02))
    it.add(mb.caixa(L - 0.12, P - 0.12, 0.03, z=H - e - 0.025, cor=c["tampo"], bisel=0.01))
    zt = H - e + 0.01
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.add(perna_chao((sx * (L / 2 - 0.1), sy * (P / 2 - 0.09), zt), (sx * (L / 2 - 0.05), sy * (P / 2 - 0.05)),
                              0.03, 0.017, c["pe"]))
    return H - e - 0.025


def mesa_aranha(it, c):
    D, e = 0.86, 0.045
    it.add(tampo(mb.circulo(D / 2, 64), e, H - e, c["tampo"], bisel=0.018))
    it.add(mb.cilindro(0.11, 0.03, z=H - e - 0.025, cor=c["pe"], seg=28, bisel=0.008))
    it.add(mb.torno([(0, 0.2), (0.03, 0.202), (0.045, 0.22), (0.048, 0.26), (0.042, 0.3), (0.04, H - e - 0.02),
                     (0, H - e - 0.02)], cor=c["pe"], seg=20))
    for k in range(4):
        a = math.radians(45 + 90 * k)
        it.add(perna_chao((0.03 * math.cos(a), 0.03 * math.sin(a), 0.34), (0.37 * math.cos(a), 0.37 * math.sin(a)),
                          0.03, 0.022, c["pe"]))
    return H - e - 0.03


def mesa_treno(it, c):
    L, P, e = 1.0, 0.52, 0.05
    it.add(tampo(ret(L, P, 0.04), e, H - e, c["tampo"], bisel=0.02))
    r = 0.022
    for sx in (-1, 1):
        x = sx * (L / 2 - 0.12)
        it.add(mb.tubo([(x, -0.17, H - e + 0.006), (x, -0.215, r), (x, 0.215, r), (x, 0.17, H - e + 0.006)], r,
                       cor=c["pe"], raio_curva=0.06, fechado=True, seg=12))
    return H - e - 0.02


# ---------------------------------------------------------------------------------------------------------------------
# Escrivaninhas, penteadeira e aparadores
# ---------------------------------------------------------------------------------------------------------------------
def escrivaninha_gamer(it, c):
    L, P = 1.3, 0.66
    n = 28
    pts, raios = [], []
    for k in range(n + 1):
        x = -L / 2 + L * k / n
        u = x / 0.5
        dip = 0.075 * math.cos(math.pi * u / 2) ** 2 if abs(u) < 1 else 0.0
        pts.append((x, -P / 2 + dip))
        raios.append(0.06 if k in (0, n) else 0.0)
    pts += [(L / 2, P / 2), (-L / 2, P / 2)]
    raios += [0.06, 0.06]
    ct = arred(pts, raios)
    it.add(tampo(ct, 0.018, H - 0.05, c["tampo"], bisel=0.007))
    it.add(tampo(desloca(ct, 0.007), 0.015, H - 0.035, c["friso"], bisel=0.005))
    it.add(tampo(ct, 0.023, H - 0.023, c["tampo"], bisel=0.011))
    zb = H - 0.05
    for sx in (-1, 1):
        x = sx * (L / 2 - 0.16)
        it.add(mb.caixa(0.075, 0.6, 0.045, x=x, y=0.02, cor=c["pe"], bisel=0.02))
        it.add(mb.caixa(0.08, 0.025, 0.025, x=x, y=-0.28 + 0.02, z=0.012, cor=c["friso"], bisel=0.008))
        a, b = V((x, -0.03, 0.03)), V((x, 0.13, zb + 0.004))
        it.add(barra(a, b, 0.055, 0.045, c["pe"], bisel=0.012))
        d = (b - a).normalized()
        nf = V((0, -d.z, d.y)).normalized()
        it.add(barra(a + nf * 0.0225, b + nf * 0.0225 - d * 0.02, 0.018, 0.008, c["friso"], bisel=0.003))
        it.add(mb.caixa(0.05, 0.56, 0.035, x=x, y=0.02, z=zb - 0.03, cor=c["pe"], bisel=0.01))
    it.add(mb.caixa(L - 0.32 + 0.05, 0.04, 0.05, y=0.22, z=zb - 0.045, cor=c["pe"], bisel=0.012))
    return zb - 0.045


def escrivaninha_l(it, c):
    e = 0.04
    pts = [(0, 0), (1.0, 0), (1.0, -0.5), (1.5, -0.5), (1.5, 0.6), (0, 0.6)]
    raios = [0.04, 0.2, 0.04, 0.04, 0.04, 0.04]
    ct = [(x - 0.75, y - 0.05) for x, y in arred(pts, raios, n=8)]
    it.add(tampo(ct, e, H - e, c["tampo"], bisel=0.016))
    zt = H - e + 0.005
    # painel da esquerda e painel do fundo
    it.add(mb.caixa(0.04, 0.56, zt, x=-0.72, y=0.25, cor=c["corpo"], bisel=0.012))
    it.add(mb.caixa(1.4, 0.022, 0.36, x=-0.03, y=0.52, z=zt - 0.36, cor=c["corpo"], bisel=0.008))
    it.add(mb.caixa(0.04, 0.5, zt, x=0.72, y=0.27, cor=c["corpo"], bisel=0.012))
    # gaveteiro na ponta do retorno
    gx, gy, gL, gP, z0 = 0.5, -0.29, 0.44, 0.48, 0.035
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.add(mb.pe("bola", z0 + 0.004, x=gx + sx * (gL / 2 - 0.04), y=gy + sy * (gP / 2 - 0.04),
                         cor=c["corpo"], r=0.02))
    gaveteiro(it, gx, gy, gL, gP, z0, zt - z0, 2, c["corpo"], c["frente"], c["caixa"], pux="bola", cor_pux=c["pux"])
    cols = [((0.0, 0.25, H - e), (1.5, 0.6, e)), ((0.5, -0.3, H - e), (0.5, 0.5, e)),
            ((-0.72, 0.25, 0), (0.04, 0.56, H - e)), ((0.72, 0.27, 0), (0.04, 0.5, H - e)),
            ((gx, gy - 0.01, 0), (gL, gP + 0.03, H - e)), ((-0.03, 0.52, zt - 0.36), (1.4, 0.022, 0.36))]
    slots = [("tampo", (-0.25, 0.25, H), (0.9, 0.5, 0.45)), ("tampo_retorno", (0.5, -0.27, H), (0.42, 0.45, 0.45))]
    return cols, slots


def escrivaninha_gaveteiro(it, c):
    L, P, e = 1.2, 0.6, 0.045
    it.add(tampo(ret(L, P, 0.04), e, H - e, c["tampo"], bisel=0.018))
    zt = H - e + 0.005
    gL, gP, gx, z0 = 0.42, 0.55, -L / 2 + 0.03 + 0.21, 0.035
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.add(mb.esfera(0.018, x=gx + sx * (gL / 2 - 0.04), y=sy * (gP / 2 - 0.05), z=0.018, cor=c["pux"],
                             seg=12))
    it.add(mb.caixa(gL - 0.02, gP - 0.02, 0.02, x=gx, z=0.022, cor=c["corpo"], bisel=0.006))
    gaveteiro(it, gx, 0.0, gL, gP, z0, zt - z0, 2, c["corpo"], c["frente"], c["caixa"], pux="bola", cor_pux=c["pux"])
    it.add(mb.caixa(0.04, gP, zt, x=L / 2 - 0.05, cor=c["corpo"], bisel=0.014))
    xa, xb = gx + gL / 2 - 0.01, L / 2 - 0.05
    it.add(sem_col(mb.caixa(xb - xa, 0.02, 0.32, x=(xa + xb) / 2, y=gP / 2 - 0.02, z=zt - 0.32, cor=c["corpo"],
                            bisel=0.006)))
    return H - e - 0.01


def escrivaninha_pes_finos(it, c):
    L, P, e = 1.1, 0.56, 0.045
    it.add(tampo(ret(L, P, 0.04), e, H - e, c["tampo"], bisel=0.018))
    zt = H - e + 0.005
    xl, yl = L / 2 - 0.06, P / 2 - 0.06
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.add(mb.pe("bloco", zt, x=sx * xl, y=sy * yl, cor=c["pe"], r=0.022))
    # travessas finas embaixo do tampo (fundo e laterais) e a caixa da gaveta no meio
    it.add(mb.caixa(2 * xl, 0.02, 0.06, y=yl, z=zt - 0.06, cor=c["pe"], bisel=0.006))
    for sx in (-1, 1):
        it.add(mb.caixa(0.02, 2 * yl, 0.06, x=sx * xl, z=zt - 0.06, cor=c["pe"], bisel=0.006))
    gaveteiro(it, 0.0, -P / 2 + 0.035 + 0.21, 0.42, 0.42, zt - 0.1, 0.1, 1, c["corpo_gaveta"], c["frente"], c["caixa"],
              pux="bola", cor_pux=c["pux"], esp=0.016)
    return zt - 0.1


def penteadeira_banquinho(it, c):
    L, P, e = 1.0, 0.5, 0.05
    it.add(tampo(ret(L, P, 0.035), e, H - e, c["tampo"], bisel=0.02))
    it.add(tampo(ret(L - 0.04, P - 0.04, 0.03), 0.02, H - e - 0.015, c["tampo"], bisel=0.008))
    zt = H - e - 0.012
    ha = 0.12
    za = zt - ha
    xl, yl = L / 2 - 0.07, P / 2 - 0.07
    avental_com_gaveta(it, xl, yl, za, ha, 0.4, c["tampo"], c["frente"], c["caixa"], pux="bola", cor_pux=c["pux"])
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.add(pe_torneado_anel(zt + 0.004, sx * xl, sy * yl, c["tampo"], c["anel"], r=0.04, h_anel=0.07))
    # banquinho
    bx, by, bh = 0.16, -0.17, 0.44
    it.add(mb.superelipsoide(0.36, 0.3, 0.06, x=bx, y=by, z=bh - 0.06, cor=c["assento"], e=0.25, e_v=0.4))
    it.add(mb.caixa(0.3, 0.24, 0.05, x=bx, y=by, z=bh - 0.09, cor=c["tampo"], bisel=0.01))
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.add(pe_torneado_anel(bh - 0.08, bx + sx * 0.12, by + sy * 0.09, c["tampo"], c["anel"], r=0.026,
                                    h_anel=0.045))
    return za


def aparador_u(it, c):
    L, P, e = 1.15, 0.36, 0.05
    cx = -L / 2 + P / 2
    pts = [(L / 2, -P / 2), (L / 2, P / 2), (cx, P / 2)]
    raios = [0.035, 0.035, 0.0]
    for k in range(1, 24):
        t = math.pi / 2 + math.pi * k / 24
        pts.append((cx + P / 2 * math.cos(t), P / 2 * math.sin(t)))
        raios.append(0.0)
    pts.append((cx, -P / 2))
    raios.append(0.0)
    zt = 0.78
    it.add(tampo(arred(pts, raios), e, zt - e, c["tampo"], bisel=0.02))
    it.add(mb.cilindro(0.05, zt - e + 0.005, x=cx, cor=c["pe"], seg=28, bisel=0.012))
    it.add(mb.cilindro(0.062, 0.02, x=cx, cor=c["pe"], seg=28, bisel=0.008))
    it.add(mb.caixa(0.07, P - 0.02, zt - e + 0.01, x=L / 2 - 0.045, cor=c["pe"], bisel=0.028))
    return zt - e - 0.01


def aparador_u_gaveta(it, c):
    L, P, A, t = 1.15, 0.38, 0.78, 0.055
    ext = [(-L / 2, 0), (-L / 2 + t, 0), (-L / 2 + t, A - t), (L / 2 - t, A - t), (L / 2 - t, 0), (L / 2, 0), (L / 2, A),
           (-L / 2, A)]
    ct = arred(ext, [0.01, 0.01, 0.025, 0.025, 0.01, 0.01, 0.11, 0.11], n=8)
    it.add(mb.extrudado(ct, P, y=-P / 2, cor=c["corpo"], bisel=0.018, plano="xz"))
    li = L - 2 * t
    hg = 0.11
    gaveteiro(it, 0.0, 0.022 / 2 + 0.005, li + 0.004, P - 0.022 - 0.01, A - t - hg, hg + 0.005, 1, c["corpo"],
              c["frente"], c["caixa"], pux="alca", cor_pux=c["pux"], esp=0.016, folga_frente=0.006)
    cols = [((0, 0, A - t - hg), (L, P, t + hg)), ((-L / 2 + t / 2, 0, 0), (t, P, A - t - hg)),
            ((L / 2 - t / 2, 0, 0), (t, P, A - t - hg))]
    return cols


# ---------------------------------------------------------------------------------------------------------------------
# Mesas de centro (0,40–0,45 m)
# ---------------------------------------------------------------------------------------------------------------------
def centro_oval_verde(it, c):
    h, e = 0.44, 0.045
    ct = oval(0.4, 0.25)
    it.add(tampo(ct, e, h - e, c["tampo"], bisel=0.016))
    it.add(mb.extrudado(oval(0.355, 0.205, 56), 0.008, z=h - 0.0045, cor=c["miolo"], bisel=0.003))
    zt = h - e + 0.008
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.add(perna_chao((sx * 0.24, sy * 0.12, zt), (sx * 0.28, sy * 0.15), 0.03, 0.026, c["pe"]))
    return h - e - 0.005


def centro_baixa(it, c):
    h, e = 0.4, 0.07
    it.add(tampo(ret(0.72, 0.52, 0.04), e, h - e, c["tampo"], bisel=0.025))
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.add(mb.pe("reto", h - e + 0.004, x=sx * 0.29, y=sy * 0.19, cor=c["pe"], r=0.026))
            it.add(mb.esfera(0.028, x=sx * 0.29, y=sy * 0.19, z=h - e - 0.004, cor=c["pe"], esc=(1, 1, 0.5)))
    return h - e - 0.01


def centro_nicho(it, c):
    l, a, prof, t = 0.76, 0.4, 0.5, 0.04
    ext = [(x, z + a / 2) for x, z in mb.ret_arredondado(l, a, 0.035, 6)]
    inn = [(x, z + a / 2) for x, z in mb.ret_arredondado(l - 2 * t, a - 2 * t, 0.012, 6)]
    it.add(anel_extrudado(ext, inn, prof, cor=c["corpo"], bisel=0.014))
    it.add(mb.caixa(l - 2 * t + 0.004, prof - 0.03, 0.025, z=a / 2 - 0.0125, cor=c["prat"], bisel=0.006))
    hn = a / 2 - 0.0125 - t
    return [("nicho_baixo", (0, 0, t), (l - 2 * t - 0.02, prof - 0.05, hn - 0.01)),
            ("nicho_cima", (0, 0, a / 2 + 0.0125), (l - 2 * t - 0.02, prof - 0.05, hn - 0.01)),
            ("tampo", (0, 0, a), (l * 0.84, prof * 0.84, 0.45))]


def centro_nicho_arredondada(it, c):
    l, a, prof = 0.72, 0.42, 0.48
    ext = [(x, z + a / 2) for x, z in mb.ret_arredondado(l, a, 0.11, 6)]
    inn = [(x, z + a / 2) for x, z in mb.ret_arredondado(l - 0.12, a - 0.12, 0.045, 6)]
    ob = anel_extrudado(ext, inn, prof, cor=c["corpo"], bisel=0.016)
    li, ai = (l - 0.12) / 2 + 0.004, (a - 0.12) / 2 + 0.004
    mb.pinta_onde(ob, c["dentro"], lambda q, n: abs(q.x) < li and abs(q.z - a / 2) < ai and abs(n.y) < 0.8)
    it.add(ob)
    return [("nicho", (0, 0, 0.06), (l - 0.16, prof - 0.04, a - 0.13)), ("tampo", (0, 0, a), (l * 0.8, prof * 0.84, 0.45))]


def centro_gaveta(it, c):
    h, e = 0.42, 0.05
    it.add(tampo(ret(0.64, 0.54, 0.035), e, h - e, c["tampo"], bisel=0.02))
    z0, gL, gP = 0.05, 0.56, 0.47
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.add(mb.pe("bola", z0 + 0.006, x=sx * (gL / 2 - 0.05), y=sy * (gP / 2 - 0.05), cor=c["pe"], r=0.024))
    gaveteiro(it, 0.0, 0.0, gL, gP, z0, h - e - z0 + 0.005, 1, c["corpo"], c["frente"], c["caixa"], pux="bola",
              cor_pux=c["pux"], estilo="moldura", n_pux=2)
    return None


def centro_torneada(it, c):
    L, P, h, e = 1.1, 0.52, 0.45, 0.045
    it.add(tampo(ret(L, P, 0.03), e, h - e, c["tampo"], bisel=0.018))
    it.add(tampo(ret(L - 0.035, P - 0.035, 0.025), 0.022, h - e - 0.016, c["tampo"], bisel=0.009))
    zt = h - e - 0.012
    za, ha = zt - 0.07, 0.07
    xl, yl = L / 2 - 0.075, P / 2 - 0.07
    for sy in (-1, 1):
        it.add(mb.caixa(2 * xl, 0.025, ha + 0.004, y=sy * yl, z=za, cor=c["tampo"], bisel=0.008))
    for sx in (-1, 1):
        it.add(mb.caixa(0.025, 2 * yl, ha + 0.004, x=sx * xl, z=za, cor=c["tampo"], bisel=0.008))
        for sy in (-1, 1):
            it.add(pe_classico(zt + 0.004, sx * xl, sy * yl, c["pe"], r=0.044))
    return za


def centro_tampo_curvo(it, c):
    L, P, h, e = 1.0, 0.5, 0.4, 0.055
    it.add(tampo(_contorno_pontas_curvas(L, P, 0.035, n=12, lados=True), e, h - e, c["tampo"], bisel=0.024))
    zt = h - e + 0.006
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.add(pe_torneado_anel(zt, sx * (L / 2 - 0.11), sy * (P / 2 - 0.09), c["pe"], c["anel"], r=0.034,
                                    h_anel=0.06))
    return h - e - 0.005


def centro_prateleira(it, c):
    L, P, h, e = 1.0, 0.55, 0.42, 0.04
    it.add(tampo(ret(L, P, 0.04), e, h - e, c["tampo"], bisel=0.016))
    it.add(tampo(ret(L - 0.1, P - 0.09, 0.03), 0.025, 0.1, c["tampo"], bisel=0.01))
    xl, yl = L / 2 - 0.06, P / 2 - 0.06
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.add(mb.pe("bloco", h - e + 0.004, x=sx * xl, y=sy * yl, cor=c["pe"], r=0.024))
    it.add(mb.caixa(2 * xl, 0.02, 0.06, y=yl, z=h - e - 0.056, cor=c["pe"], bisel=0.006))
    it.add(mb.caixa(2 * xl, 0.02, 0.06, y=-yl, z=h - e - 0.056, cor=c["pe"], bisel=0.006))
    return [("prateleira", (0, 0, 0.125), (L - 0.16, P - 0.14, h - e - 0.06 - 0.125))]


# ---------------------------------------------------------------------------------------------------------------------
# Mesas laterais (0,45–0,55 m)
# ---------------------------------------------------------------------------------------------------------------------
def lateral_gota(it, c):
    h, e = 0.46, 0.045
    base = [(x * 1.12, y) for x, y in mb.poligono(3, 0.37, rot=math.radians(110))]
    ct = arred(base, [0.24, 0.27, 0.3], n=12)
    it.add(tampo(ct, e, h - e, c["tampo"], bisel=0.017))
    zt = h - e + 0.008
    for x, y in base:
        it.add(perna_chao((x * 0.45, y * 0.45, zt), (x * 0.56, y * 0.56), 0.022, 0.014, c["pe"]))
    return h - e - 0.005


def lateral_nuvem(it, c):
    h, e = 0.46, 0.05
    ct = nuvem([(0, -0.03, 0.17), (-0.18, -0.06, 0.13), (0.18, -0.06, 0.13), (-0.1, 0.08, 0.13), (0.11, 0.09, 0.14),
                (-0.25, 0.02, 0.09), (0.26, 0.01, 0.085)])
    it.add(tampo(ct, e, h - e, c["tampo"], bisel=0.02))
    zt = h - e + 0.008
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.add(perna_chao((sx * 0.2, sy * 0.06 - 0.01, zt), (sx * 0.25, sy * 0.1 - 0.01), 0.026, 0.024, c["pe"]))
    return h - e - 0.005


def lateral_aros(it, c):
    h, e, R = 0.5, 0.05, 0.235
    it.add(tampo(mb.circulo(0.28, 56), e, h - e, c["tampo"], bisel=0.02))
    for k in range(4):
        a = math.radians(45 + 90 * k)
        it.add(mb.pe("reto", h - e + 0.004, x=R * math.cos(a), y=R * math.sin(a), cor=c["pe"], r=0.014))
    for z in (0.07, 0.17, 0.27):
        it.add(anel(R, 0.012, z, c["pe"], n=56))
    return h - e - 0.005


def lateral_pedestal(it, c):
    h, e = 0.56, 0.045
    it.add(tampo(ret(0.5, 0.5, 0.06), e, h - e, c["tampo"], bisel=0.018))
    it.add(mb.caixa(0.13, 0.13, 0.035, z=h - e - 0.03, cor=c["coluna"], bisel=0.01))
    it.add(mb.caixa(0.27, 0.27, 0.05, cor=c["base"], bisel=0.018))
    it.add(mb.caixa(0.2, 0.2, 0.04, z=0.045, cor=c["base"], bisel=0.014))
    it.add(mb.caixa(0.14, 0.14, 0.065, z=0.08, cor=c["anel"], bisel=0.016))
    it.add(mb.cilindro(0.038, h - e - 0.14, z=0.14, cor=c["coluna"], seg=20, bisel=0.006))
    return h - e - 0.03


def lateral_tripe(it, c):
    h, e = 0.56, 0.042
    it.add(tampo(mb.circulo(0.25, 56), e, h - e, c["tampo"], bisel=0.017))
    it.add(mb.extrudado(mb.circulo(0.215, 48), 0.05, z=h - e - 0.045, cor=c["tampo"], bisel=0.012))
    zt = h - e - 0.04
    it.add(mb.torno([(0, 0.1), (0.04, 0.1), (0.05, 0.13), (0.042, 0.19), (0.03, 0.25), (0.028, 0.3), (0.045, 0.33),
                     (0.03, 0.36), (0.032, zt - 0.03), (0.05, zt - 0.01), (0.05, zt + 0.002), (0, zt + 0.002)],
                    cor=c["tampo"], seg=24))
    r = 0.02
    for k in range(3):
        a = math.radians(90 + 120 * k)
        ca, sa = math.cos(a), math.sin(a)
        it.add(mb.tubo([(0.0, 0.0, 0.2), (0.07 * ca, 0.07 * sa, 0.15), (0.17 * ca, 0.17 * sa, 0.05),
                        (0.23 * ca, 0.23 * sa, r * 0.82)], r, cor=c["pe"], raio_curva=0.05, seg=12))
    return h - e - 0.045


def lateral_prateleira(it, c):
    h, e, R = 0.5, 0.045, 0.17
    it.add(tampo(mb.circulo(0.225, 56), e, h - e, c["tampo"], bisel=0.018))
    it.add(mb.extrudado(mb.circulo(0.2, 48), 0.055, z=h - e - 0.05, cor=c["tampo"], bisel=0.012))
    it.add(tampo(mb.circulo(0.195, 48), 0.025, 0.1, c["tampo"], bisel=0.01))
    for k in range(4):
        a = math.radians(45 + 90 * k)
        it.add(mb.pe("reto", h - e - 0.04, x=R * math.cos(a), y=R * math.sin(a), cor=c["pe"], r=0.019))
    return [("prateleira", (0, 0, 0.125), (0.26, 0.26, h - e - 0.05 - 0.125))]


def lateral_ovo(it, c):
    h, e = 0.5, 0.042
    it.add(tampo(oval(0.33, 0.22, ovo=0.18), e, h - e, c["tampo"], bisel=0.017))
    zt = h - e + 0.008
    for x0, y0, x1, y1 in ((-0.19, -0.1, -0.25, -0.15), (-0.19, 0.1, -0.25, 0.15), (0.17, -0.13, 0.24, -0.19),
                           (0.17, 0.13, 0.24, 0.19)):
        it.add(perna_chao((x0, y0, zt), (x1, y1), 0.022, 0.014, c["pe"]))
    return h - e - 0.005


def lateral_tres_pes(it, c):
    h, e = 0.45, 0.055
    it.add(tampo(mb.circulo(0.18, 48), e, h - e, c["tampo"], bisel=0.025))
    zt = h - e + 0.008
    for k in range(3):
        a = math.radians(90 + 120 * k)
        it.add(perna_chao((0.1 * math.cos(a), 0.1 * math.sin(a), zt), (0.17 * math.cos(a), 0.17 * math.sin(a)), 0.022,
                          0.014, c["pe"]))
    return h - e - 0.005


# ---------------------------------------------------------------------------------------------------------------------
# Balcões (1,05 m)
# ---------------------------------------------------------------------------------------------------------------------
def balcao_listrado(it, c):
    L, P, t, R = 1.3, 0.52, 0.035, 0.13
    pts = [(L / 2, P / 2), (L / 2, -P / 2), (-L / 2, -P / 2), (-L / 2, P / 2), (-L / 2 + t, P / 2),
           (-L / 2 + t, -P / 2 + t), (L / 2 - t, -P / 2 + t), (L / 2 - t, P / 2)]
    ct = arred(pts, [0, R, R, 0, 0, R - t, R - t, 0], n=8)
    zs = [0.0, 0.3, 0.46, 0.985]
    cores = [c["corpo"], c["faixa"], c["corpo"]]
    for k in range(3):
        it.add(mb.extrudado(ct, zs[k + 1] - zs[k] + (0.002 if k < 2 else 0.0), z=zs[k], cor=cores[k], bisel=0.008))
    it.add(tampo(ret(L + 0.08, P + 0.08, R + 0.03), 0.07, 0.98, c["tampo"], y=-0.025, bisel=0.03))
    y0, y1 = -P / 2 + t - 0.002, P / 2 - 0.002
    dentro = [(x, y + (y0 + y1) / 2) for x, y in ret(L - 2 * t + 0.004, y1 - y0, R - t)]
    it.add(mb.extrudado(dentro, 0.025, z=0.03, cor=c["dentro"], bisel=0.006))
    it.add(mb.extrudado(dentro, 0.022, z=0.5, cor=c["dentro"], bisel=0.006))
    li = L - 2 * t - 0.04
    return [("prateleira_baixo", (0, 0.03, 0.055), (li, P - 0.1, 0.42)),
            ("prateleira_cima", (0, 0.03, 0.522), (li, P - 0.1, 0.42)),
            ("tampo", (0, -0.025, 1.05), ((L + 0.08) * 0.84, (P + 0.08) * 0.84, 0.45))]


def mesa_alta_ferro(it, c):
    L, P, e, h = 1.0, 0.42, 0.05, 1.05
    it.add(tampo(ret(L, P, 0.03), e, h - e, c["tampo"], bisel=0.02))
    r = 0.016
    zt = h - e + 0.004
    for sx in (-1, 1):
        x = sx * (L / 2 - 0.08)
        it.add(mb.tubo([(x, -0.15, zt), (x, -0.175, r), (x, 0.175, r), (x, 0.15, zt)], r, cor=c["pe"],
                       raio_curva=0.03, fechado=True, seg=12))
    zb = 0.3
    yb = 0.175 - 0.025 * (zb - r) / (zt - r)
    it.add(sem_col(perna((-(L / 2 - 0.08), yb, zb), ((L / 2 - 0.08), yb, zb), 0.013, 0.013, c["pe"], seg=12)))
    return h - e - 0.01


# ---------------------------------------------------------------------------------------------------------------------
# Pacote gratuito
# ---------------------------------------------------------------------------------------------------------------------
def pacote(nome, dz=0.0, repinta=None):
    def fn(it, c):
        pc = mb.importa_pacote(nome)
        corpo = pc.pop("corpo")
        lo, hi = mb.bbox(corpo)
        mb.transforma(corpo, loc=(-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z))
        if repinta:
            repinta(corpo)
        it.add(corpo)
        for ob in pc.values():
            mb.transforma(ob, loc=(-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z))
            it.add(ob)
        return None
    return fn


def _repinta_coffee(ob):
    # tampo do ícone é cinza-claro frio; o importador puxa para um cinza amarronzado
    uv = ob.data.uv_layers["UVMap"].data
    troca = {"madeira_cinza": "cinza", "cinzas": "cinza_medio"}
    for p in ob.data.polygons:
        u = uv[p.loop_indices[0]].uv
        i = int(u[0] * 16) + 16 * int((1 - u[1]) * 16)
        nm = mb.NOMES[i] if 0 <= i < len(mb.NOMES) else None
        if nm in troca:
            mb.pinta(ob, troca[nm], [p.index])


# ---------------------------------------------------------------------------------------------------------------------
# Lista de peças: (id, rótulo, grupo, tags, função, cores, z_corte especial)
# ---------------------------------------------------------------------------------------------------------------------
PECAS = []


def reg(id_, rotulo, grupo, tags, fn, **cores):
    PECAS.append((id_, rotulo, grupo, tags, fn, cores))


J = ["jantar", "cozinha"]
reg("mesa_jantar_redonda_pedestal_amarela", "Mesa de jantar redonda de pedestal (amarela)", "jantar_redonda_pedestal",
    J + ["redonda", "pedestal"], mesa_redonda_pedestal, tampo="amarelo", saia="amarelo_escuro", pe="cinza_azulado")
reg("mesa_jantar_redonda_pedestal_branca", "Mesa de jantar redonda de pedestal (branca)", "jantar_redonda_pedestal",
    J + ["redonda", "pedestal"], mesa_redonda_pedestal, tampo="branco_gelo", saia="cinza_claro", pe="madeira_mel")
reg("mesa_jantar_redonda_aro_mel", "Mesa de jantar redonda com aro (mel)", "jantar_redonda_aro",
    J + ["redonda", "madeira"], mesa_redonda_aro, tampo="laranja_claro", tampo2="madeira_mel", pe="madeira_mel")
reg("mesa_jantar_octogonal_verde", "Mesa de jantar octogonal de pé cônico (verde)", "jantar_octogonal",
    J + ["pedestal"], mesa_octogonal, tampo="verde", pe="verde_medio")
reg("mesa_jantar_cavalete_azul", "Mesa de jantar de pés de cavalete (azul)", "jantar_cavalete",
    J + ["retangular"], mesa_cavalete_azul, tampo="azul_medio", pe="azul_medio")
reg("mesa_jantar_cavalete_x_amarela", "Mesa de cavalete em X (amarela)", "jantar_cavalete_x",
    J + ["retangular", "rustica"], mesa_cavalete_x, tampo="amarelo_escuro", pe="laranja_claro")
reg("mesa_jantar_cavalete_x_madeira", "Mesa de cavalete em X (madeira)", "jantar_cavalete_x",
    J + ["retangular", "rustica", "madeira"], mesa_cavalete_x, tampo="madeira", pe="madeira_escura")
reg("mesa_jantar_pes_chanfrados_vermelha", "Mesa de pés chanfrados (vermelha)", "jantar_chanfrada",
    J + ["retangular"], mesa_chanfrada, tampo="vermelho", pe="vermelho")
reg("mesa_jantar_pes_chanfrados_turquesa", "Mesa de pés chanfrados (turquesa)", "jantar_chanfrada",
    J + ["retangular"], mesa_chanfrada, tampo="turquesa", pe="turquesa")
reg("mesa_jantar_pes_torneados_azul_claro", "Mesa de pés torneados com gaveta (azul-clara)", "jantar_torneada",
    J + ["retangular", "classica", "gavetas"], mesa_torneada_clara, tampo="azul_bebe", saia="azul_bebe", pe="azul_claro",
    frente="azul_claro", caixa="creme", pux="azul")
reg("mesa_jantar_oval_aro_laranja", "Mesa oval com travessas (laranja)", "jantar_oval_aro",
    J + ["oval"], mesa_oval_aro, tampo="laranja", pe="laranja_escuro")
reg("mesa_jantar_pes_palito_amarela", "Mesa de pés palito (amarela)", "jantar_palito",
    J + ["retangular"], mesa_palito, tampo="amarelo", pe="mostarda")
reg("mesa_jantar_aranha_laranja", "Mesa redonda de pés aranha (laranja)", "jantar_aranha",
    J + ["redonda", "pedestal"], mesa_aranha, tampo="laranja_escuro", pe="laranja_escuro")
reg("mesa_jantar_pes_treno_azul", "Mesa com pés de trenó (azul e amarela)", "jantar_treno",
    J + ["retangular", "infantil"], mesa_treno, tampo="azul_celeste", pe="amarelo_escuro")

E = ["escritorio", "quarto"]
reg("escrivaninha_gamer_verde", "Escrivaninha gamer com friso (verde)", "escrivaninha_gamer",
    E + ["gamer"], escrivaninha_gamer, tampo="cinza_azulado", friso="verde_lima", pe="grafite")
reg("escrivaninha_gamer_rosa", "Escrivaninha gamer com friso (rosa)", "escrivaninha_gamer",
    E + ["gamer"], escrivaninha_gamer, tampo="azul_noite", friso="rosa", pe="grafite_escuro")
reg("escrivaninha_l_gaveteiro_laranja", "Escrivaninha em L com gaveteiro (laranja)", "escrivaninha_l",
    E + ["gavetas", "canto"], escrivaninha_l, tampo="laranja_claro", corpo="marrom", frente="laranja_claro",
    caixa="madeira_clara", pux="marrom_escuro")
reg("escrivaninha_gaveteiro_rosa", "Escrivaninha com gaveteiro (gavetas rosa)", "escrivaninha_gaveteiro",
    E + ["gavetas", "infantil"], escrivaninha_gaveteiro, tampo="laranja_claro", corpo="branco", frente="rosa",
    caixa="rosa_claro", pux="rosa_escuro")
reg("escrivaninha_gaveteiro_azul", "Escrivaninha com gaveteiro (gavetas azuis)", "escrivaninha_gaveteiro",
    E + ["gavetas", "infantil"], escrivaninha_gaveteiro, tampo="madeira_clara", corpo="branco_gelo", frente="azul_claro",
    caixa="azul_bebe", pux="azul")
reg("escrivaninha_gaveta_pes_finos_laranja", "Escrivaninha com gaveta e pés finos (laranja)", "escrivaninha_pes_finos",
    E + ["gavetas"], escrivaninha_pes_finos, tampo="laranja_claro", pe="azul_claro", corpo_gaveta="laranja_claro",
    frente="laranja", caixa="creme", pux="rosa_escuro")
reg("penteadeira_banquinho_marrom", "Penteadeira com banquinho (marrom)", "penteadeira",
    ["quarto", "gavetas", "classica"], penteadeira_banquinho, tampo="marrom_claro", frente="bege", caixa="creme",
    pux="marrom_escuro", anel="bege", assento="cinza_medio")
A_ = ["sala", "entrada"]
reg("aparador_u_amarelo", "Aparador com pé redondo (amarelo)", "aparador_u",
    A_ + ["console"], aparador_u, tampo="amarelo_escuro", pe="amarelo_escuro")
reg("aparador_u_gaveta_marrom", "Aparador em U com gaveta (marrom e amarelo)", "aparador_u_gaveta",
    A_ + ["console", "gavetas"], aparador_u_gaveta, corpo="marrom_claro", frente="amarelo_escuro", caixa="creme",
    pux="marrom_escuro")

C = ["sala", "centro"]
reg("mesa_centro_oval_verde", "Mesa de centro oval de tampo verde", "centro_oval",
    C + ["oval"], centro_oval_verde, tampo="laranja_claro", miolo="verde", pe="laranja_claro")
reg("mesa_centro_baixa_turquesa", "Mesa de centro baixa (turquesa e amarela)", "centro_baixa",
    C + ["retangular"], centro_baixa, tampo="turquesa_escuro", pe="amarelo")
reg("mesa_centro_nicho_turquesa", "Mesa de centro de nichos (turquesa)", "centro_nicho",
    C + ["nicho"], centro_nicho, corpo="turquesa_escuro", prat="turquesa_escuro")
reg("mesa_centro_nicho_grafite", "Mesa de centro de nicho arredondada (grafite)", "centro_nicho_arredondada",
    C + ["nicho"], centro_nicho_arredondada, corpo="grafite", dentro="preto")
reg("mesa_centro_gaveta_turquesa", "Mesa de centro com gaveta (turquesa e marrom)", "centro_gaveta",
    C + ["gavetas"], centro_gaveta, tampo="turquesa_escuro", corpo="madeira_media", frente="madeira_media",
    caixa="madeira_escura", pux="amarelo", pe="madeira_escura")
reg("mesa_centro_pes_torneados_marrom", "Mesa de centro de pés torneados (marrom)", "centro_torneada",
    C + ["classica"], centro_torneada, tampo="madeira_media", pe="madeira_media")
reg("mesa_centro_tampo_curvo_cinza", "Mesa de centro de tampo curvo (cinza)", "centro_tampo_curvo",
    C + ["classica"], centro_tampo_curvo, tampo="cinza", pe="madeira_escura", anel="bege")
reg("mesa_centro_prateleira_madeira", "Mesa de centro com prateleira (madeira e branca)", "centro_prateleira",
    C + ["prateleira"], centro_prateleira, tampo="madeira_clara", pe="branco")

LT = ["sala", "quarto", "lateral"]
reg("mesa_lateral_gota_marrom", "Mesinha lateral em gota (marrom)", "lateral_gota",
    LT, lateral_gota, tampo="terracota_escura", pe="madeira_escura")
reg("mesa_lateral_nuvem_azul", "Mesinha nuvem (azul-clara)", "lateral_nuvem",
    LT + ["infantil"], lateral_nuvem, tampo="azul_claro", pe="azul_claro")
reg("mesa_lateral_nuvem_rosa", "Mesinha nuvem (rosa)", "lateral_nuvem",
    LT + ["infantil"], lateral_nuvem, tampo="rosa_bebe", pe="rosa_bebe")
reg("mesa_lateral_redonda_aros_azul", "Mesinha redonda com aros (azul)", "lateral_aros",
    LT + ["redonda"], lateral_aros, tampo="azul_celeste", pe="azul_celeste")
reg("mesa_lateral_pedestal_rosa", "Mesinha de pedestal (rosa e roxa)", "lateral_pedestal",
    LT + ["pedestal"], lateral_pedestal, tampo="rosa_escuro", coluna="violeta", anel="rosa", base="roxo")
reg("mesa_lateral_tripe_laranja", "Mesinha de pedestal com três pés (laranja)", "lateral_tripe",
    LT + ["redonda", "pedestal", "classica"], lateral_tripe, tampo="laranja_claro", pe="laranja_claro")
reg("mesa_lateral_redonda_prateleira_verde", "Mesinha redonda com prateleira (verde)", "lateral_prateleira",
    LT + ["redonda", "prateleira"], lateral_prateleira, tampo="verde_medio", pe="verde_medio")
reg("mesa_lateral_ovo_rosa", "Mesinha em ovo de pés palito (rosa)", "lateral_ovo",
    LT + ["oval"], lateral_ovo, tampo="rosa", pe="magenta")
reg("mesa_lateral_redonda_tres_pes_branca", "Mesinha redonda de três pés (branca)", "lateral_tres_pes",
    LT + ["redonda"], lateral_tres_pes, tampo="branco_gelo", pe="laranja_claro")

B = ["cozinha", "bar"]
reg("balcao_listrado_amarelo", "Balcão listrado (amarelo e preto)", "balcao_listrado",
    B + ["prateleira"], balcao_listrado, corpo="amarelo_escuro", faixa="grafite_escuro", tampo="grafite_escuro",
    dentro="amarelo")
reg("balcao_listrado_menta", "Balcão listrado (menta e petróleo)", "balcao_listrado",
    B + ["prateleira"], balcao_listrado, corpo="menta", faixa="petroleo", tampo="petroleo", dentro="menta")
reg("mesa_alta_ferro_mostarda", "Mesa alta de ferro (mostarda)", "mesa_alta_ferro",
    B + ["industrial"], mesa_alta_ferro, tampo="mostarda", pe="ferro")

reg("mesa_centro_redonda_cinza_pacote", "Mesa de centro redonda (cinza)", "pacote_coffee_table_03",
    C + ["redonda", "pacote"], pacote("Coffee_Table_03", repinta=_repinta_coffee))
reg("mesa_trabalho_pes_metal_pacote", "Mesa com pés de metal (laranja)", "pacote_work_table_06",
    E + ["pacote", "metal"], pacote("Work_Table_06"))
reg("mesa_cozinha_comprida_marrom_pacote", "Mesa de cozinha comprida (marrom)", "pacote_kitchen_table_09",
    J + ["pacote", "classica"], pacote("Kitchen_Table_09"))

Z_PACOTE = {"mesa_centro_redonda_cinza_pacote": 0.36, "mesa_trabalho_pes_metal_pacote": 0.6,
            "mesa_cozinha_comprida_marrom_pacote": 0.62}


def gera(id_, rotulo, grupo, tags, fn, cores):
    mb.limpa()
    it = mb.Item(id_)
    r = fn(it, cores)
    pac = id_.endswith("_pacote")
    if pac:
        fecha(it, rotulo, grupo, tags, z_corte=Z_PACOTE[id_], pacote=True)
    elif isinstance(r, tuple):  # (colisões, slots) próprios
        fecha(it, rotulo, grupo, tags, cols=r[0], slots=r[1])
    elif isinstance(r, list) and r and isinstance(r[0][0], str):  # só slots próprios
        tem_tampo = any(s[0] == "tampo" for s in r)
        if tem_tampo:  # peça compacta (nicho, balcão): colisão automática da base
            fecha(it, rotulo, grupo, tags, cols=None, slots=r)
        else:
            zc = min(s[1][2] for s in r) - 0.03
            fecha(it, rotulo, grupo, tags, z_corte=zc, slots=r)
    elif isinstance(r, list):  # só colisões próprias
        lo_z = max(c[0][2] for c in r)
        fecha(it, rotulo, grupo, tags, cols=r, slots=[("tampo", (0, 0, lo_z + r[0][1][2]),
                                                       (r[0][1][0] * 0.84, r[0][1][1] * 0.84, 0.45))])
    elif r is None:  # compacta (gaveteiro inteiro): colisão automática da base + tampo
        fecha(it, rotulo, grupo, tags, cols="auto", z_corte=0.0)
    else:
        fecha(it, rotulo, grupo, tags, z_corte=r)


feitos = 0
for p in PECAS:
    if FILTRO and p[0] not in FILTRO:
        continue
    gera(*p)
    feitos += 1
ids = {p[0] for p in PECAS}
cat.dados["itens"] = [x for x in cat.dados["itens"] if x["id"] in ids]
cat.salva()
print("mesas:", feitos, "geradas;", len(PECAS), "no total", flush=True)
