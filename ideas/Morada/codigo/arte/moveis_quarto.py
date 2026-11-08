"""Móveis do quarto do Morada: camas (inclui berços e beliches) e criados-mudos.

Uso (numa sessão do Blender só):
    blender-venv/bin/python -I morada-art/moveis_quarto.py -- <saida> [camas|criados|<id> ...]
Sem filtro gera as duas categorias. Grava em <saida>/camas/ e <saida>/criados/.

Convenções da base (moveis_base.py): metros, Z para cima, frente para −Y. Nas camas a cabeceira fica no fundo (+Y,
encostada na parede) e a peseira na frente (−Y). Gavetas sob a cama abrem para o lado (−X) e a bicama desliza para −X.
"""
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
FILTRO = set(ARGS[1:])


# =====================================================================================================================
# Ajudantes gerais (o que falta na base fica aqui)
# =====================================================================================================================
def _ccw(pts):
    s = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(pts, pts[1:] + pts[:1]))
    return pts if s > 0 else pts[::-1]


def ret_xz(w, z0, z1, rt, rb, seg=6, x=0.0):
    """Contorno de retângulo no plano XZ (de z0 a z1, largura w) com raio rt nos cantos de cima e rb nos de baixo."""
    pts = []
    for cx, cz, r, a0 in ((w / 2 - rb, z0 + rb, rb, 270), (w / 2 - rt, z1 - rt, rt, 0),
                          (-w / 2 + rt, z1 - rt, rt, 90), (-w / 2 + rb, z0 + rb, rb, 180)):
        if r < 1e-4:
            pts.append((cx + x, cz))
            continue
        for k in range(seg + 1):
            t = math.radians(a0 + 90 * k / seg)
            pts.append((cx + r * math.cos(t) + x, cz + r * math.sin(t)))
    return pts


def contorno_arco(w, z0, z1, flecha, n=20):
    """Retângulo w × (z0..z1) com o topo em arco circular de flecha (anti-horário)."""
    pts = [(-w / 2, z0), (w / 2, z0)]
    if flecha <= 1e-4:
        return pts + [(w / 2, z1), (-w / 2, z1)]
    R = (flecha ** 2 + (w / 2) ** 2) / (2 * flecha)
    cz = z1 + flecha - R
    for k in range(n + 1):
        x = w / 2 - w * k / n
        pts.append((x, cz + math.sqrt(max(R * R - x * x, 0))))
    return pts


def contorno_onda(w, z0, z1, f, n=28, ombro=0.0):
    """Topo ondulado (cabeceira estilo 'capitão'): sobe no meio (flecha f) e tem ombros nas pontas."""
    pts = [(-w / 2, z0), (w / 2, z0)]
    for k in range(n + 1):
        x = w / 2 - w * k / n
        u = 2 * x / w
        z = z1 + f * math.cos(math.pi * u / 2) ** 2 + ombro * abs(u) ** 8 - ombro * 0.35 * math.sin(math.pi * abs(u)) ** 2
        pts.append((x, z))
    return pts


def friso(pts, y, r=0.0065, cor="branco", nome="friso"):
    """Filete em relevo (tubo fino) seguindo um contorno fechado no plano XZ, na face y. Começa no meio do primeiro
    trecho, para a emenda cair numa reta e todos os cantos ficarem arredondados."""
    n = len(pts)
    i = max(range(n), key=lambda k: math.dist(pts[k], pts[(k + 1) % n]))
    a, b = pts[i], pts[(i + 1) % n]
    meio = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
    seq = [meio] + pts[i + 1:] + pts[:i + 1] + [((a[0] + meio[0]) / 2, (a[1] + meio[1]) / 2)]
    seq = _arredonda_seletivo(seq, 0.03)
    return mb.tubo([(px, y, pz) for px, pz in seq], r, cor=cor, raio_curva=0, seg=8, nome=nome, fechado=True)


def _arredonda_seletivo(pts, raio, lim=150, n=5):
    """Arredonda só os cantos vivos (ângulo interno menor que lim graus) de uma linha 2D; os trechos que já são
    curvas (arcos de muitos pontos) ficam como estão, para a malha não inchar."""
    out = [pts[0]]
    for a, b, c in zip(pts, pts[1:], pts[2:]):
        d1 = (a[0] - b[0], a[1] - b[1])
        d2 = (c[0] - b[0], c[1] - b[1])
        l1, l2 = math.hypot(*d1), math.hypot(*d2)
        if l1 < 1e-6 or l2 < 1e-6:
            continue
        ang = math.degrees(math.acos(max(-1.0, min(1.0, (d1[0] * d2[0] + d1[1] * d2[1]) / (l1 * l2)))))
        if ang >= lim:
            out.append(b)
            continue
        rr = min(raio, l1 * 0.45, l2 * 0.45)
        p1 = (b[0] + d1[0] / l1 * rr, b[1] + d1[1] / l1 * rr)
        p2 = (b[0] + d2[0] / l2 * rr, b[1] + d2[1] / l2 * rr)
        for k in range(n + 1):
            t = k / n
            out.append(((1 - t) ** 2 * p1[0] + 2 * (1 - t) * t * b[0] + t ** 2 * p2[0],
                        (1 - t) ** 2 * p1[1] + 2 * (1 - t) * t * b[1] + t ** 2 * p2[1]))
    out.append(pts[-1])
    return out


def carcaca(l, p, a, x=0.0, y=0.0, z=0.0, esp=0.022, cor="branco", prateleiras=(), divisorias=(), bisel=0.006,
            seg=2, nome="carcaca"):
    """Como mb.carcaca, mas com menos segmentos no boleado (malha mais leve; as tábuas são finas)."""
    ps = []
    c = lambda *q, **k: ps.append(mb.caixa(*q, cor=cor, bisel=bisel, seg=seg, **k))
    c(esp, p, a, x=x - l / 2 + esp / 2, y=y, z=z)
    c(esp, p, a, x=x + l / 2 - esp / 2, y=y, z=z)
    c(l - 2 * esp + 0.002, p, esp, x=x, y=y, z=z)
    c(l - 2 * esp + 0.002, p, esp, x=x, y=y, z=z + a - esp)
    c(l - 2 * esp + 0.002, esp, a - 2 * esp + 0.002, x=x, y=y + p / 2 - esp / 2, z=z + esp - 0.001)
    for h in prateleiras:
        c(l - 2 * esp + 0.002, p - esp - 0.01, esp * 0.8, x=x, y=y - esp / 2 - 0.005, z=z + h)
    for dx in divisorias:
        c(esp, p - esp, a - 2 * esp + 0.002, x=x + dx, y=y - esp / 2, z=z + esp - 0.001)
    return mb.junta(ps, nome)


def travesseiro(l, p, a, x=0.0, y=0.0, z=0.0, cor="branco"):
    """Travesseiro fofo e arredondado (oval visto de cima, cheio no meio)."""
    return mb.superelipsoide(l, p, a, x=x, y=y, z=z, cor=cor, e=0.42, e_v=0.6, estufa=0.38, nu=24, nv=10,
                             nome="travesseiro")


def casca(ext, inn, prof, y0=0.0, cor="branco", bisel=0.012, seg=3, nome="casca"):
    """Anel extrudado: contorno externo e interno no plano XZ (mesmo número de pontos, correspondentes), da face da
    frente y0 até y0 + prof. É o corpo oco de um móvel arredondado (sem o fundo)."""
    bm = bmesh.new()
    n = len(ext)
    assert len(inn) == n
    ve = [bm.verts.new((px, 0, pz)) for px, pz in ext]
    vi = [bm.verts.new((px, 0, pz)) for px, pz in inn]
    fs = [bm.faces.new((ve[i], ve[(i + 1) % n], vi[(i + 1) % n], vi[i])) for i in range(n)]
    r = bmesh.ops.extrude_face_region(bm, geom=fs)
    for v in [g for g in r["geom"] if isinstance(g, bmesh.types.BMVert)]:
        v.co.y += prof
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    mb._bevel(bm, bisel, seg, [e for e in bm.edges if len(e.link_faces) == 2 and
                               e.link_faces[0].normal.dot(e.link_faces[1].normal) < 0.85])
    bm.transform(Matrix.Translation((0, y0, 0)))
    return mb._obj(nome, bm, cor)


def setor_anel(r_ext, r_int, a0, a1, a, z=0.0, cor="branco", bisel=0.008, n=24, nome="setor"):
    """Setor de anel (parede curva) no plano XY, ângulos em graus, extrudado em Z de z a z + a."""
    pts = [(r_ext * math.cos(math.radians(a0 + (a1 - a0) * k / n)), r_ext * math.sin(math.radians(a0 + (a1 - a0) * k / n)))
           for k in range(n + 1)]
    pts += [(r_int * math.cos(math.radians(a1 - (a1 - a0) * k / n)), r_int * math.sin(math.radians(a1 - (a1 - a0) * k / n)))
            for k in range(n + 1)]
    return mb.extrudado(_ccw(pts), a, z=z, cor=cor, bisel=bisel, seg=2, nome=nome)


def _aplica_bool(ob, outro, op):
    m = ob.modifiers.new("b", "BOOLEAN")
    m.operation = op
    m.object = outro
    m.solver = "EXACT"
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    ob.modifiers.clear()
    velho = ob.data
    ob.data = me
    bpy.data.meshes.remove(velho)
    om = outro.data
    bpy.data.objects.remove(outro)
    if om.users == 0:
        bpy.data.meshes.remove(om)
    me.shade_smooth()
    me.set_sharp_from_angle(angle=math.radians(34))
    return ob


def subtrai(ob, *cortadores):
    """Tira do objeto o volume dos cortadores (nicho, vão de gaveta). As faces novas ficam com a cor do cortador."""
    for c in cortadores:
        _aplica_bool(ob, c, "DIFFERENCE")
    return ob


def intersecta(ob, outro):
    return _aplica_bool(ob, outro, "INTERSECT")


def orienta(objs, lado, loc):
    """Peças feitas viradas para −Y (frente, puxador) → viradas para o lado (−1: −X, +1: +X), depois movidas para loc."""
    M = Matrix.Translation(loc) @ Matrix.Rotation(math.radians(-90 if lado < 0 else 90), 4, "Z")
    for o in (objs if isinstance(objs, (list, tuple)) else [objs]):
        o.data.transform(M)
    return objs


def gaveta_lado(it, comp, prof, alt, frente_objs, x_face, y, z, lado=-1, cor="bege", esp=0.012, curso=None,
                nome=None, extras=(), slot=True):
    """Gaveta que abre para o lado (sob a cama): caixa de verdade (fundo + 4 lados, aberta em cima) de comp (ao longo
    de Y) × prof (para dentro, em X) × alt, atrás do plano da frente x_face. frente_objs já no lugar, virados para o
    lado. extras: peças que andam junto (colchão da bicama). Anda na direção (lado, 0, 0)."""
    nome = nome or f"gaveta_{sum(1 for _, d in it.interativos if d['interativo'] == 'gaveta') + 1}"
    x0 = x_face + 0.002 if lado < 0 else x_face - 0.002 - prof
    xc = x0 + prof / 2
    x_fundo = x0 + prof - esp / 2 if lado < 0 else x0 + esp / 2
    x_frente = x0 + esp / 2 if lado < 0 else x0 + prof - esp / 2
    c = dict(cor=cor, bisel=0.003, seg=1)
    ps = [mb.caixa(prof, comp, esp, x=xc, y=y, z=z, **c),
          mb.caixa(prof, esp, alt, x=xc, y=y - comp / 2 + esp / 2, z=z, **c),
          mb.caixa(prof, esp, alt, x=xc, y=y + comp / 2 - esp / 2, z=z, **c),
          mb.caixa(esp, comp, alt, x=x_fundo, y=y, z=z, **c),
          mb.caixa(esp, comp, alt * 0.9, x=x_frente, y=y, z=z, **c)]
    objs = ps + list(frente_objs if isinstance(frente_objs, (list, tuple)) else [frente_objs]) + list(extras)
    ob = mb.junta(objs, nome)
    d = V((x_face, y, z))
    ob.data.transform(Matrix.Translation(-d))
    ob.location = d
    curso = round(curso if curso is not None else prof * 0.78, 4)
    it.interativos.append((ob, {"interativo": "gaveta", "direcao": mb._gl((lado, 0, 0)), "curso": curso}))
    if slot:
        it.slots.append((f"slot_{nome}", (xc, y, z + esp), (prof - 2 * esp, comp - 2 * esp, alt - esp), nome))
    return ob


def frente_lado(l, a, x_face, y, z, lado=-1, pux="bola", cor_pux="ouro", pux_z=None, pux_tam=1.0, **kw):
    """Frente de gaveta lateral (estilos de mb.frente) + puxador, já virada para o lado e no lugar."""
    esp = kw.get("esp", 0.022)
    f = mb.frente(l, a, **kw)
    objs = [f]
    if pux:
        objs.append(mb.puxador(pux, x=0, y=-esp, z=a / 2 if pux_z is None else pux_z, cor=cor_pux, tam=pux_tam,
                               vertical=False))
    orienta(objs, lado, (x_face, y, z))
    return objs


def centraliza(it):
    """Põe a origem no meio da peça (x, y), com a base no chão. Move partes, interativos, slots e colisões."""
    lo = V((1e9, 1e9, 1e9))
    hi = V((-1e9, -1e9, -1e9))
    for o in it.partes + [ob for ob, _ in it.interativos]:
        for v in o.data.vertices:
            p = o.location + v.co
            lo = V((min(lo.x, p.x), min(lo.y, p.y), min(lo.z, p.z)))
            hi = V((max(hi.x, p.x), max(hi.y, p.y), max(hi.z, p.z)))
    d = V((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z))
    if abs(lo.z) > 0.003:
        print(f"aviso: {it.id} base em z={lo.z:.4f}", flush=True)
    M = Matrix.Translation(d)
    for o in it.partes:
        o.data.transform(M)
    for ob, _ in it.interativos:
        ob.location += d
    it.slots = [(n, tuple(V(c) + d), t, p) for n, c, t, p in it.slots]
    if it.colisores:
        it.colisores = [(tuple(V(c) + d), t) for c, t in it.colisores]
    return d


def escala_malha(ob, sx, sy, sz):
    ob.data.transform(Matrix.Diagonal((sx, sy, sz, 1)))
    return ob


# =====================================================================================================================
# Camas: roupa de cama e peças comuns
# =====================================================================================================================
LADO = 1  # lado das gavetas sob a cama, da bicama e das escadas: +X é o lado que a vista 3/4 mostra
SOL = (0.90, 1.90)
CAS = (1.40, 1.90)
BER = (0.62, 1.22)


def roupa(it, L, C, z, yc, cores, n_trav=1, h=0.2, frac=0.6, slot=True, trav=None, x=0.0, parte=None):
    """Colchão macio, edredom cobrindo o pé com a dobra do lençol (faixa de outra cor) e travesseiros fofos.
    cores: (lençol/colchão, edredom, faixa, travesseiro). parte: lista onde pôr as peças (para a bicama), senão it."""
    cl, ce, cf, ct = cores
    alvo = [] if parte is None else parte
    top = z + h
    alvo.append(mb.superelipsoide(L, C, h, x=x, y=yc, z=z, cor=cl, e=0.14, e_v=0.3, nu=24, nv=10, nome="colchao"))
    ced = C * frac
    y_pe = yc - C / 2 - 0.014
    hed = 0.06 + h * 0.42
    zb = top - hed + 0.04
    alvo.append(mb.superelipsoide(L + 0.034, ced, hed, x=x, y=y_pe + ced / 2, z=zb, cor=ce, e=0.12, e_v=0.3,
                                  nu=24, nv=10, nome="edredom"))
    lf = min(0.2, C * 0.12)
    alvo.append(mb.superelipsoide(L + 0.044, lf, hed + 0.016, x=x, y=y_pe + ced - lf / 2 + 0.012, z=zb - 0.008,
                                  cor=cf, e=0.2, e_v=0.4, nu=24, nv=8, nome="dobra"))
    tl, tp, ta = trav or ((0.54, 0.36, 0.16) if n_trav == 1 else (min(0.6, L / 2 - 0.08), 0.37, 0.16))
    yt = yc + C / 2 - tp / 2 - 0.06
    if n_trav == 1:
        alvo.append(travesseiro(tl, tp, ta, x=x, y=yt, z=top - 0.045, cor=ct))
    else:
        for sx in (-1, 1):
            alvo.append(travesseiro(tl, tp, ta, x=x + sx * (tl / 2 + 0.03), y=yt, z=top - 0.045, cor=ct))
    if parte is None:
        it.add(alvo)
        if slot:
            it.slot("colchao", (x, y_pe + ced / 2, zb + hed), (L - 0.12, ced - 0.12, 0.4))
    return alvo


def estrado(L, C, z, yc, cor, esp=0.03):
    """Tábua sob o colchão (some sob o colchão; fecha a vista de baixo)."""
    return mb.caixa(L + 0.02, C + 0.02, esp, y=yc, z=z - esp, cor=cor, bisel=0.006, seg=2)


def poste_torneado(H, r, x, y, cor, bola=True, seg=18, nome="poste"):
    """Coluna torneada de cama: pé com anel, fuste e remate em bola."""
    p = [(0, 0), (r * 0.8, 0), (r * 0.95, 0.012), (r * 0.95, 0.03), (r * 0.72, 0.05), (r * 0.72, 0.075),
         (r * 1.02, 0.1)]
    zt = H - (2.15 * r if bola else 0.03)
    p += [(r * 1.0, zt - 0.05), (r * 1.18, zt - 0.032), (r * 1.18, zt - 0.014), (r * 0.6, zt)]
    if bola:
        rb = r * 1.15
        cz = zt + rb * 0.85
        for k in range(-30, 91, 15):
            t = math.radians(k)
            p.append((rb * math.cos(t) if k < 90 else 0.0, cz + rb * math.sin(t)))
    else:
        p += [(r * 0.9, zt + 0.02), (r * 0.6, zt + 0.03), (0, zt + 0.03)]
    return mb.torno(p, x=x, y=y, cor=cor, seg=seg, nome=nome)


def poste_quadrado(H, w, x, y, cor, remate=None, cor_remate=None, nome="poste"):
    ps = [mb.caixa(w, w, H, x=x, y=y, cor=cor, bisel=w * 0.22, seg=2, nome=nome)]
    if remate == "bola":
        ps.append(mb.esfera(w * 0.62, x=x, y=y, z=H + w * 0.45, cor=cor_remate or cor, seg=16))
        ps.append(mb.cilindro(w * 0.3, w * 0.3, x=x, y=y, z=H - 0.01, cor=cor_remate or cor, seg=12, bisel=0.002))
    elif remate == "tampa":
        ps.append(mb.caixa(w * 1.25, w * 1.25, 0.02, x=x, y=y, z=H, cor=cor_remate or cor, bisel=0.008, seg=2))
    return ps


def ripas(xs, z0, z1, y, r, cor, quadrada=False):
    """Fileira de balaústres verticais (de z0 a z1) nos x dados, no plano y."""
    out = []
    for x in xs:
        if quadrada:
            out.append(mb.caixa(r * 2, r * 2, z1 - z0, x=x, y=y, z=z0, cor=cor, bisel=r * 0.45, seg=1))
        else:
            out.append(mb.cilindro(r, z1 - z0, x=x, y=y, z=z0, cor=cor, seg=10, bisel=0.002))
    return out


def ripas_sob_curva(fn, x0, x1, n, z0, y, r, cor, margem=0.01, quadrada=False):
    out = []
    for k in range(n):
        x = x0 + (x1 - x0) * (k + 0.5) / n
        out += ripas([x], z0, fn(x) + margem, y, r, cor, quadrada)
    return out


def faixa_curva(fn, x0, x1, w, esp, y, cor, bisel=0.01, n=24, nome="faixa"):
    """Travessa curva: faixa de altura w sob a curva z = fn(x), de x0 a x1, espessura esp a partir de y."""
    topo = [(x0 + (x1 - x0) * k / n, fn(x0 + (x1 - x0) * k / n)) for k in range(n + 1)]
    pts = topo + [(px, pz - w) for px, pz in reversed(topo)]
    return mb.extrudado(_ccw(pts), esp, y=y, cor=cor, bisel=bisel, seg=2, plano="xz", nome=nome)


def painel_xz(pts, y, esp, cor, bisel=0.012, nome="painel"):
    """Painel de contorno pts (plano XZ), centrado em y com espessura esp."""
    return mb.extrudado(_ccw(pts), esp, y=y - esp / 2, cor=cor, bisel=bisel, seg=3, plano="xz", nome=nome)


def colisao_cama(it, L, C0, C1, z_top, cab=None, pe_=None):
    """Colisão de cama: a base até o colchão, a cabeceira e a peseira (caixas)."""
    cx = [((0, (C0 + C1) / 2, 0), (L, C1 - C0, z_top))]
    if cab:
        y0, y1, h = cab
        cx.append(((0, (y0 + y1) / 2, 0), (L, y1 - y0, h)))
    if pe_:
        y0, y1, h = pe_
        cx.append(((0, (y0 + y1) / 2, 0), (L, y1 - y0, h)))
    it.colisao(cx)


# =====================================================================================================================
# Camas: desenhos
# =====================================================================================================================
def cama_classica(it, tam, cor, cor_friso, cores_roupa):
    """Cama clássica: colunas torneadas com bola, cabeceira e peseira com o topo em arco e filete em relevo."""
    L, C = tam
    nt = 1 if L < 1.2 else 2
    zc, h = 0.33, 0.2
    r = 0.042
    xp = L / 2 + 0.055
    yh, yf = C / 2 + 0.05, -C / 2 - 0.05
    for sx in (-1, 1):
        it.add(poste_torneado(1.0, r, sx * xp, yh, cor))
        it.add(poste_torneado(0.74, r, sx * xp, yf, cor))
    w = 2 * xp - 0.03
    pc = contorno_arco(w, 0.3, 0.78, 0.16 if nt == 1 else 0.2)
    it.add(painel_xz(pc, yh, 0.045, cor, bisel=0.014))
    it.add(friso(contorno_arco(w - 0.14, 0.38, 0.74, 0.12 if nt == 1 else 0.16), yh - 0.0225, cor=cor_friso))
    pp = contorno_arco(w, 0.24, 0.54, 0.1 if nt == 1 else 0.13)
    it.add(painel_xz(pp, yf, 0.045, cor, bisel=0.014))
    it.add(friso(contorno_arco(w - 0.14, 0.31, 0.51, 0.07 if nt == 1 else 0.1), yf - 0.0225, cor=cor_friso))
    for sx in (-1, 1):
        it.add(mb.caixa(0.045, C + 0.06, 0.17, x=sx * (L / 2 + 0.042), z=0.26, cor=cor, bisel=0.012))
    it.add(estrado(L, C, zc, 0, cor))
    roupa(it, L - 0.02, C - 0.02, zc, 0, cores_roupa, n_trav=nt, h=h)
    colisao_cama(it, 2 * xp + 0.1, yf - 0.05, yh + 0.05, zc + h, cab=(yh - 0.05, yh + 0.05, 1.0),
                 pe_=(yf - 0.05, yf + 0.05, 0.74))


def cama_grade_arco(it, tam, cor, cor_base, cores_roupa):
    """Cama baixa de plataforma com pés e cabeceira de grade: travessa curva em arco e balaústres."""
    L, C = tam
    nt = 1 if L < 1.2 else 2
    Lb, Cb = L + 0.1, C + 0.08
    it.add(mb.caixa(Lb, Cb, 0.13, z=0.12, cor=cor_base, bisel=0.025))
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.add(mb.caixa(0.07, 0.07, 0.125, x=sx * (Lb / 2 - 0.07), y=sy * (Cb / 2 - 0.07), cor=cor_base,
                            bisel=0.018, seg=2))
    zc, h = 0.25, 0.24
    roupa(it, L, C, zc, -0.01, cores_roupa, n_trav=nt, h=h)
    yh = Cb / 2 + 0.03
    wp = 0.065
    xp = Lb / 2 - wp / 2 + 0.005
    it.add(poste_quadrado(1.02, wp, -xp, yh, cor, remate="tampa"))
    it.add(poste_quadrado(1.02, wp, xp, yh, cor, remate="tampa"))
    xi = xp - wp / 2 + 0.01
    if nt == 1:
        fn = lambda x: 0.8 + 0.17 * math.sqrt(max(0.0, 1 - (x / xi) ** 2)) ** 0.8
        nr = 4
    else:
        fn = lambda x: 0.8 + 0.14 * math.cos(math.pi * x / (2 * xi)) ** 1.5 + 0.06 * (abs(x) / xi) ** 10
        nr = 7
    it.add(faixa_curva(fn, -xi, xi, 0.07, 0.045, yh - 0.0225, cor, bisel=0.012))
    it.add(mb.caixa(2 * xi, 0.045, 0.08, y=yh, z=0.36, cor=cor, bisel=0.012))
    it.add(ripas_sob_curva(lambda x: fn(x) - 0.07, -xi + 0.04, xi - 0.04, nr, 0.43, yh, 0.022, cor, quadrada=True))
    colisao_cama(it, Lb, -Cb / 2, Cb / 2, zc + h, cab=(yh - 0.04, yh + 0.04, 1.03))


def cama_gavetas(it, tam, cor, cor_frente, cor_pux, cores_roupa, dois_lados=False):
    """Cama-baú com gavetas sob o colchão (de um lado ou dos dois) e cabeceira ondulada."""
    L, C = tam
    nt = 1 if L < 1.2 else 2
    Lb, Cb = L + 0.1, C + 0.06
    zb0, zb1 = 0.05, 0.33
    # rodapé recuado
    it.add(mb.caixa(Lb - 0.08, Cb - 0.08, zb0 + 0.01, cor=cor, bisel=0.01, seg=2))
    hb = zb1 - zb0
    nb = 3
    if dois_lados:
        pl = Lb / 2
        for lado in (-1, 1):
            cc = carcaca(Cb, pl, hb, z=zb0, cor=cor, esp=0.024,
                            divisorias=[(-Cb / 2 + Cb * k / nb) for k in range(1, nb)])
            orienta(cc, lado, (lado * pl / 2, 0, 0))
            it.add(cc)
    else:
        cc = carcaca(Cb, Lb, hb, z=zb0, cor=cor, esp=0.024,
                        divisorias=[(-Cb / 2 + Cb * k / nb) for k in range(1, nb)])
        orienta(cc, LADO, (0, 0, 0))
        it.add(cc)
    lados = (-1, 1) if dois_lados else (LADO,)
    vao = (Cb - 0.024 * 2 - 0.024 * (nb - 1)) / nb
    prof = (Lb / 2 if dois_lados else Lb) - 0.06
    for lado in lados:
        xf = lado * Lb / 2
        for k in range(nb):
            yc = -Cb / 2 + 0.024 + vao / 2 + k * (vao + 0.024)
            est = dict(estilo="lisa", bisel=0.014) if dois_lados else dict(estilo="moldura", margem=0.03)
            fr = frente_lado(vao - 0.006, hb - 0.03, xf, yc, zb0 + 0.015, lado=lado, cor=cor_frente,
                             cor2=cor_frente, pux="bola", cor_pux=cor_pux, **est)
            gaveta_lado(it, vao - 0.03, prof - 0.03, hb - 0.075, fr, xf, yc, zb0 + 0.03, lado=lado, cor="bege")
    zc, h = zb1, 0.21
    it.add(mb.caixa(Lb - 0.04, Cb - 0.04, 0.02, z=zb1 - 0.012, cor=cor, bisel=0.008, seg=2))
    roupa(it, L, C, zc + 0.008, 0, cores_roupa, n_trav=nt, h=h)
    yh = Cb / 2 + 0.035
    pc = contorno_onda(Lb + 0.02, 0.0, 0.84, 0.16, ombro=0.06)
    it.add(painel_xz(pc, yh, 0.07, cor, bisel=0.025))
    colisao_cama(it, Lb + 0.02, -Cb / 2, yh + 0.035, zc + h, cab=(yh - 0.035, yh + 0.035, 1.0))


def cama_estofada(it, tam, cor, cor_base, cores_roupa):
    """Cama moderna estofada: base macia e cabeceira alta estofada (lisa, de cantos redondos)."""
    L, C = tam
    nt = 1 if L < 1.2 else 2
    Lb, Cb = L + 0.14, C + 0.12
    it.add(mb.superelipsoide(Lb, Cb, 0.27, y=-0.02, z=0.065, cor=cor_base, e=0.16, e_v=0.3, nu=32, nv=12))
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.add(mb.cilindro(0.025, 0.08, x=sx * (Lb / 2 - 0.12), y=sy * (Cb / 2 - 0.14) - 0.02, cor="grafite",
                               seg=12))
    zc, h = 0.31, 0.22
    roupa(it, L, C, zc, -0.02, cores_roupa, n_trav=nt, h=h)
    yh = Cb / 2 + 0.03
    it.add(mb.superelipsoide(Lb + 0.04, 0.13, 0.88, y=yh, z=0.12, cor=cor, e=0.12, e_v=0.22, nu=32, nv=14))
    it.add(mb.caixa(Lb - 0.1, 0.06, 0.2, y=yh + 0.02, z=0.04, cor="grafite", bisel=0.01, seg=2))
    colisao_cama(it, Lb + 0.04, -Cb / 2 - 0.02, yh + 0.065, zc + h, cab=(yh - 0.065, yh + 0.065, 1.0))


def cama_infantil_friso(it, cor, cor_friso, cor_frente, cor_pux, cores_roupa):
    """Cama infantil de painéis arredondados com filete, duas gavetas sob o colchão (lado −X)."""
    L, C = SOL
    Lb = L + 0.08
    zb0, zb1 = 0.05, 0.3
    yh, yf = C / 2 + 0.045, -C / 2 - 0.045
    w = Lb + 0.04
    ph = ret_xz(w, 0.0, 0.86, 0.12, 0.03)
    Cb = C + 0.05
    it.add(painel_xz(ph, yh, 0.05, cor, bisel=0.016))
    it.add(friso(ret_xz(w - 0.12, 0.42, 0.8, 0.08, 0.02), yh - 0.025, cor=cor_friso))
    it.add(mb.caixa(w - 0.12, 0.012, 0.024, y=yh - 0.026, z=0.62, cor=cor_friso, bisel=0.005, seg=2))
    pf = ret_xz(w, 0.0, 0.62, 0.1, 0.03)
    it.add(painel_xz(pf, yf, 0.05, cor, bisel=0.016))
    it.add(friso(ret_xz(w - 0.12, 0.08, 0.56, 0.07, 0.02), yf - 0.025, cor=cor_friso))
    hb = zb1 - zb0
    cc = carcaca(Cb, Lb, hb, z=zb0, cor=cor, esp=0.022, divisorias=[0.0])
    orienta(cc, LADO, (0, 0, 0))
    it.add(cc)
    vao = (Cb - 0.066) / 2
    for k in (0, 1):
        yc = -Cb / 2 + 0.022 + vao / 2 + k * (vao + 0.022)
        fr = frente_lado(vao - 0.006, hb - 0.03, LADO * Lb / 2, yc, zb0 + 0.015, lado=LADO, estilo="moldura",
                         cor=cor_frente, cor2=cor_friso, margem=0.03, pux="bola", cor_pux=cor_pux)
        gaveta_lado(it, vao - 0.03, Lb - 0.09, hb - 0.075, fr, LADO * Lb / 2, yc, zb0 + 0.03, lado=LADO, cor="bege")
    it.add(mb.caixa(0.04, Cb, 0.16, x=-LADO * (Lb / 2 - 0.015), z=zb1 - 0.02, cor=cor, bisel=0.012))
    it.add(mb.caixa(0.04, Cb, 0.08, x=LADO * (Lb / 2 - 0.015), z=zb1 - 0.01, cor=cor, bisel=0.012))
    it.add(mb.caixa(Lb - 0.06, Cb - 0.02, 0.02, z=zb1 - 0.012, cor=cor, bisel=0.006, seg=2))
    roupa(it, L - 0.02, C - 0.02, zb1 + 0.008, 0, cores_roupa, h=0.2)
    colisao_cama(it, w, yf - 0.025, yh + 0.025, zb1 + 0.21, cab=(yh - 0.025, yh + 0.025, 0.86),
                 pe_=(yf - 0.025, yf + 0.025, 0.62))


def cama_infantil_moldura(it, cor, cor_frente, cor_pux, cores_roupa):
    """Cama infantil de moldura aberta (cabeceira e peseira vazadas) com uma gaveta grande sob o colchão."""
    L, C = SOL
    Lb = L + 0.08
    zb0, zb1 = 0.04, 0.29
    yh, yf = C / 2 + 0.04, -C / 2 - 0.04
    wp = 0.06
    xp = Lb / 2 + 0.01
    for y, H, zl in ((yh, 0.86, 0.52), (yf, 0.6, 0.42)):
        for sx in (-1, 1):
            it.add(mb.caixa(wp, wp, H - 0.05, x=sx * xp, y=y, cor=cor, bisel=0.02, seg=2))
        it.add(mb.extrudado(_ccw(ret_xz(2 * xp + wp, H - 0.09, H, 0.035, 0.012)), wp * 0.9, y=y - wp * 0.45,
                            cor=cor, bisel=0.014, plano="xz"))
        it.add(mb.caixa(2 * xp, wp * 0.8, zl - 0.03, y=y, z=0.03, cor=cor, bisel=0.014))
    Cb = C + 0.05
    hb = zb1 - zb0
    cc = carcaca(Cb, Lb, hb, z=zb0, cor=cor, esp=0.022)
    orienta(cc, LADO, (0, 0, 0))
    it.add(cc)
    fr = frente_lado(Cb - 0.05, hb - 0.03, LADO * Lb / 2, 0, zb0 + 0.015, lado=LADO, estilo="lisa", cor=cor_frente,
                     pux="bola", cor_pux=cor_pux)
    gaveta_lado(it, Cb - 0.08, Lb - 0.08, hb - 0.07, fr, LADO * Lb / 2, 0, zb0 + 0.03, lado=LADO, cor="bege")
    it.add(mb.caixa(0.04, Cb, 0.13, x=-LADO * (Lb / 2 - 0.015), z=zb1 - 0.02, cor=cor, bisel=0.012))
    it.add(mb.caixa(0.04, Cb, 0.08, x=LADO * (Lb / 2 - 0.015), z=zb1 - 0.01, cor=cor, bisel=0.012))
    it.add(mb.caixa(Lb - 0.06, Cb - 0.02, 0.02, z=zb1 - 0.012, cor=cor, bisel=0.006, seg=2))
    roupa(it, L - 0.02, C - 0.02, zb1 + 0.008, 0, cores_roupa, h=0.2)
    colisao_cama(it, 2 * xp + wp, yf - 0.03, yh + 0.03, zb1 + 0.21, cab=(yh - 0.03, yh + 0.03, 0.86),
                 pe_=(yf - 0.03, yf + 0.03, 0.6))


def cama_painel(it, cor, cor_friso, cores_roupa):
    """Cama de solteiro de painéis retos com almofada emoldurada (filete) na cabeceira e na peseira."""
    L, C = SOL
    yh, yf = C / 2 + 0.04, -C / 2 - 0.04
    w = L + 0.12
    for y, H in ((yh, 0.88), (yf, 0.6)):
        it.add(painel_xz(ret_xz(w, 0.0, H, 0.025, 0.012), y, 0.06, cor, bisel=0.016))
        zt = H - 0.06
        z0 = 0.33 if y > 0 else 0.1
        if y > 0:
            it.add(friso(ret_xz(w - 0.12, H - 0.2, H - 0.06, 0.012, 0.012), y - 0.03, cor=cor_friso))
            zt = H - 0.28
        it.add(friso(ret_xz(w - 0.12, z0 if y > 0 else 0.1, zt, 0.015, 0.015), y - 0.03, cor=cor_friso))
    for sx in (-1, 1):
        it.add(mb.caixa(0.045, C + 0.04, 0.17, x=sx * (L / 2 + 0.03), z=0.24, cor=cor, bisel=0.012))
    zc = 0.32
    it.add(estrado(L, C, zc, 0, cor))
    roupa(it, L - 0.02, C - 0.02, zc, 0, cores_roupa, h=0.2)
    colisao_cama(it, w, yf - 0.03, yh + 0.03, zc + 0.2, cab=(yh - 0.03, yh + 0.03, 0.88), pe_=(yf - 0.03, yf + 0.03, 0.6))


def cama_ripas_arco(it, cor, cores_roupa):
    """Cama de solteiro de madeira com cabeceira e peseira em arco, cheias de balaústres."""
    L, C = SOL
    yh, yf = C / 2 + 0.045, -C / 2 - 0.045
    wp = 0.06
    xp = L / 2 + 0.05
    zc = 0.33
    for y, H, zr, f, nr in ((yh, 0.95, 0.74, 0.15, 7), (yf, 0.7, 0.55, 0.1, 7)):
        for sx in (-1, 1):
            it.add(poste_quadrado(H, wp, sx * xp, y, cor))
        xi = xp - wp / 2 + 0.008
        fn = (lambda zr_, f_, xi_: (lambda x: zr_ + f_ * math.cos(math.pi * x / (2 * xi_)) ** 1.2))(zr, f, xi)
        it.add(faixa_curva(fn, -xi, xi, 0.075, 0.05, y - 0.025, cor, bisel=0.014))
        zb = 0.27
        it.add(mb.caixa(2 * xi, 0.05, 0.08, y=y, z=zb, cor=cor, bisel=0.012))
        it.add(ripas_sob_curva(lambda x, fn=fn: fn(x) - 0.075, -xi + 0.02, xi - 0.02, nr, zb + 0.07, y, 0.019, cor))
    for sx in (-1, 1):
        it.add(mb.caixa(0.045, C + 0.06, 0.16, x=sx * (L / 2 + 0.035), z=0.25, cor=cor, bisel=0.012))
    it.add(estrado(L, C, zc, 0, cor))
    roupa(it, L - 0.02, C - 0.02, zc, 0, cores_roupa, h=0.2)
    colisao_cama(it, 2 * xp + wp, yf - 0.03, yh + 0.03, zc + 0.2, cab=(yh - 0.03, yh + 0.03, 0.95),
                 pe_=(yf - 0.03, yf + 0.03, 0.7))


def cama_tubo(it, cor, cores_roupa):
    """Cama de solteiro de tubos: colunas finas com tampinha e grades de barras curtas entre travessas."""
    L, C = SOL
    yh, yf = C / 2 + 0.035, -C / 2 - 0.035
    r = 0.03
    xp = L / 2 + 0.045
    zc = 0.34
    for y, H, zs in ((yh, 0.92, (0.4, 0.64, 0.84)), (yf, 0.66, (0.4, 0.5, 0.6))):
        for sx in (-1, 1):
            it.add(mb.cilindro(r, H, x=sx * xp, y=y, cor=cor, seg=16, bisel=0.008))
            it.add(mb.cilindro(r * 1.3, 0.025, x=sx * xp, y=y, z=H, cor=cor, seg=16, bisel=0.009))
        for z in zs:
            it.add(mb.cilindro(0.022, 2 * xp, x=0, y=y, z=z, cor=cor, eixo="x", seg=12, bisel=0.004))
        nb = 6
        it.add(ripas([-xp + 2 * xp * (k + 0.5) / nb for k in range(nb)], zs[-2], zs[-1], y, 0.014, cor))
    for sx in (-1, 1):
        it.add(mb.caixa(0.04, C + 0.04, 0.12, x=sx * (L / 2 + 0.03), z=0.28, cor=cor, bisel=0.014))
    it.add(estrado(L, C, zc, 0, cor))
    roupa(it, L - 0.02, C - 0.02, zc, 0, cores_roupa, h=0.2)
    colisao_cama(it, 2 * xp + 2 * r, yf - 0.03, yh + 0.03, zc + 0.2, cab=(yh - 0.03, yh + 0.03, 0.95),
                 pe_=(yf - 0.03, yf + 0.03, 0.69))


def cama_friso_vazada(it, cor, cor_friso, cores_roupa):
    """Cama branca de cantos redondos: cabeceira e peseira com fileira de vãos no alto e filete colorido nos
    painéis e nas laterais."""
    L, C = SOL
    yh, yf = C / 2 + 0.04, -C / 2 - 0.04
    w = L + 0.12
    esp = 0.06
    for y, H, zp in ((yh, 0.9, 0.62), (yf, 0.66, 0.42)):
        it.add(painel_xz(ret_xz(w, 0.0, zp, 0.0, 0.02), y, esp, cor, bisel=0.016))
        it.add(painel_xz(ret_xz(w, H - 0.12, H, 0.1, 0.0), y, esp, cor, bisel=0.016))
        for sx in (-1, 1):
            it.add(mb.caixa(0.08, esp, H - zp - 0.1, x=sx * (w / 2 - 0.04), y=y, z=zp - 0.01, cor=cor, bisel=0.012))
        nv = 5
        wi = w - 0.16
        for k in range(1, nv):
            it.add(mb.caixa(0.035, esp * 0.8, H - zp - 0.1, x=-wi / 2 + wi * k / nv, y=y, z=zp - 0.01, cor=cor,
                            bisel=0.01, seg=2))
        z0 = 0.34 if y > 0 else 0.08
        it.add(friso(ret_xz(w - 0.14, z0, zp - 0.06, 0.012, 0.012), y - esp / 2, r=0.006, cor=cor_friso))
    for sx in (-1, 1):
        it.add(mb.caixa(0.05, C + 0.04, 0.2, x=sx * (L / 2 + 0.035), z=0.22, cor=cor, bisel=0.014))
        it.add(mb.tubo([(sx * (L / 2 + 0.061), y, z) for y, z in
                        ((0, 0.255), (C / 2 - 0.05, 0.255), (C / 2 - 0.05, 0.385), (-C / 2 + 0.05, 0.385),
                         (-C / 2 + 0.05, 0.255), (0.05, 0.255))], 0.006, cor=cor_friso, raio_curva=0.012, seg=8,
                       fechado=True))
    zc = 0.33
    it.add(estrado(L, C, zc, 0, cor))
    roupa(it, L - 0.02, C - 0.02, zc, 0, cores_roupa, h=0.2)
    colisao_cama(it, w, yf - 0.03, yh + 0.03, zc + 0.2, cab=(yh - 0.03, yh + 0.03, 0.9), pe_=(yf - 0.03, yf + 0.03, 0.66))


def cama_bicama(it, cor, cor_frente, cores_roupa, cores_bicama):
    """Cama de solteiro com bicama: colunas com bola, cabeceira de travessas e a cama de baixo que desliza (−X)."""
    L, C = SOL
    yh, yf = C / 2 + 0.045, -C / 2 - 0.045
    wp = 0.07
    xp = L / 2 + 0.05
    zc = 0.42
    for y, H, travs in ((yh, 1.02, (0.62, 0.82)), (yf, 0.78, (0.64,))):
        for sx in (-1, 1):
            it.add(poste_quadrado(H, wp, sx * xp, y, cor, remate="bola"))
        for zt in travs:
            it.add(mb.caixa(2 * xp, 0.04, 0.07, y=y, z=zt, cor=cor, bisel=0.014))
        it.add(mb.caixa(2 * xp, 0.04, zc + 0.06 - 0.04, y=y, z=0.04, cor=cor, bisel=0.014))
    # laterais: a de −X deixa o vão da bicama embaixo
    it.add(mb.caixa(0.045, C + 0.04, 0.14, x=LADO * (L / 2 + 0.035), z=zc - 0.06, cor=cor, bisel=0.012))
    it.add(mb.caixa(0.045, C + 0.04, zc + 0.08 - 0.03, x=-LADO * (L / 2 + 0.035), z=0.03, cor=cor, bisel=0.012))
    it.add(estrado(L, C, zc, 0, cor))
    roupa(it, L - 0.02, C - 0.02, zc, 0, cores_roupa, h=0.19)
    # bicama
    Lt, Ct = L - 0.04, C - 0.06
    zt0 = 0.035
    xf = LADO * (L / 2 + 0.06)
    prof = Lt - 0.02
    xct = xf - LADO * (0.002 + prof / 2)
    rodas = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            rodas.append(mb.cilindro(0.024, 0.018, x=xct + sx * (prof / 2 - 0.07), y=sy * (Ct / 2 - 0.1), z=0.024,
                                     cor="grafite", eixo="y", seg=14))
    extras = roupa(None, prof - 0.05, Ct - 0.1, zt0 + 0.024, 0, cores_bicama, h=0.12, x=xct, slot=False, parte=[],
                   trav=(0.44, 0.28, 0.1))
    extras += rodas
    ht = zc - 0.08 - zt0 - 0.03
    fr = frente_lado(Ct, ht, xf, 0, zt0, lado=LADO, estilo="moldura", cor=cor_frente, cor2=cor,
                     margem=0.035, pux="alca", cor_pux="ouro", esp=0.024)
    g = gaveta_lado(it, Ct - 0.04, prof, 0.15, fr, xf, 0, zt0 + 0.012, lado=LADO, cor=cor_frente,
                    curso=0.88, nome="bicama", extras=extras, slot=False)
    it.slots.append(("slot_bicama", (xct, -0.25, zt0 + 0.024 + 0.12), (prof - 0.14, Ct * 0.5, 0.3), g.name))
    colisao_cama(it, 2 * xp + wp, yf - 0.035, yh + 0.035, zc + 0.19, cab=(yh - 0.035, yh + 0.035, 1.1),
                 pe_=(yf - 0.035, yf + 0.035, 0.86))


def beliche_madeira(it, cor, cor_rip, cores_a, cores_b):
    """Beliche de madeira: colunas, guarda-corpo de balaústres em cima, grades nas pontas e escada inclinada (−X)."""
    L, C = SOL
    wp = 0.075
    xp = L / 2 + 0.055
    yp = C / 2 + 0.055
    H = 1.66
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.add(poste_quadrado(H, wp, sx * xp, sy * yp, cor))
    zA, zB = 0.22, 1.08  # tábuas dos colchões (de baixo e de cima)
    for zt in (zA, zB):
        for sx in (-1, 1):
            it.add(mb.caixa(0.05, 2 * yp, 0.15, x=sx * (xp - 0.005), z=zt - 0.06, cor=cor, bisel=0.012))
        for sy in (-1, 1):
            it.add(mb.caixa(2 * xp, 0.05, 0.15, y=sy * yp, z=zt - 0.06, cor=cor, bisel=0.012))
        it.add(estrado(L, C, zt + 0.03, 0, cor))
    roupa(it, L - 0.02, C - 0.02, zA + 0.03, 0, cores_a, h=0.17)
    roupa(it, L - 0.02, C - 0.02, zB + 0.03, 0, cores_b, h=0.17)
    it.slots = [s for s in it.slots if s[0] != "slot_colchao"]
    # grades das pontas (balaústres entre travessas)
    for sy in (-1, 1):
        y = sy * yp
        for z0, z1 in ((zA + 0.09, zA + 0.5), (zB + 0.09, H - 0.06)):
            it.add(mb.caixa(2 * xp, 0.05, 0.06, y=y, z=z1 - 0.06, cor=cor, bisel=0.012))
            it.add(ripas([-xp + 2 * xp * (k + 0.5) / 7 for k in range(7)], z0, z1 - 0.055, y, 0.018, cor_rip,
                         quadrada=True))
    # guarda-corpo de cima: lado +X inteiro, lado −X até a escada
    zg0, zg1 = zB + 0.09, zB + 0.4
    for sx, y0, y1 in ((-LADO, -yp, yp), (LADO, -yp + 0.5, yp)):
        yc, cl = (y0 + y1) / 2, y1 - y0
        it.add(mb.caixa(0.05, cl, 0.06, x=sx * xp, y=yc, z=zg1 - 0.06, cor=cor, bisel=0.012))
        n = max(2, int(cl / 0.2))
        for k in range(n):
            yk = y0 + 0.06 + (cl - 0.12) * (k + 0.5) / n
            it.add(mb.caixa(0.036, 0.036, zg1 - zg0 - 0.055, x=sx * xp, y=yk, z=zg0, cor=cor_rip, bisel=0.01, seg=1))
    # escada inclinada no lado −X, perto do pé
    esc = []
    ang = 14
    Hs = zB + 0.42
    Ls = Hs / math.cos(math.radians(ang))
    for dy in (-0.19, 0.19):
        esc.append(mb.caixa(0.045, 0.045, Ls, y=dy, cor=cor, bisel=0.012, seg=2))
    for k in range(5):
        esc.append(mb.cilindro(0.017, 0.38, y=0, z=0.3 + k * (Ls - 0.45) / 4.4, eixo="y", cor=cor_rip, seg=10))
    xl = LADO * (xp + 0.035 + Hs * math.tan(math.radians(ang)))
    for o in esc:
        mb.transforma(o, rot=("Y", -LADO * ang))
        mb.transforma(o, loc=(xl, -yp + 0.26, 0.0058))
    it.add(esc)
    it.slot("cama_baixo", (0, -0.2, zA + 0.25), (L - 0.12, C * 0.5, 0.3))
    it.slot("cama_cima", (0, -0.2, zB + 0.25), (L - 0.12, C * 0.5, 0.25))
    it.colisao([((0, 0, 0), (2 * xp + wp, 2 * yp + wp, zA + 0.24)),
                ((0, 0, zB - 0.06), (2 * xp + wp, 2 * yp + wp, H - zB + 0.06)),
                ((0, yp, 0), (2 * xp + wp, wp, H)), ((0, -yp, 0), (2 * xp + wp, wp, H)),
                (((xl + LADO * xp) / 2, -yp + 0.26, 0), (abs(xl - LADO * xp) + 0.06, 0.45, zB + 0.45))])


def beliche_painel(it, cor, cor_base, cores_a, cores_b):
    """Beliche de painéis (branco): pontas em U com almofada no alto, guarda-corpo de grade e escada reta (−X)."""
    L, C = SOL
    w = L + 0.12
    esp = 0.055
    yp = C / 2 + 0.05
    H = 1.62
    zA, zB = 0.24, 1.06
    for sy in (-1, 1):
        y = sy * yp
        for sx in (-1, 1):
            it.add(mb.caixa(0.09, esp, H - 0.3, x=sx * (w / 2 - 0.045), y=y, cor=cor, bisel=0.016))
        it.add(painel_xz(ret_xz(w, H - 0.34, H, 0.06, 0.0), y, esp, cor, bisel=0.016))
        it.add(friso(ret_xz(w - 0.2, H - 0.29, H - 0.06, 0.02, 0.02), y - sy * esp / 2, cor=cor_base))
        it.add(mb.caixa(w - 0.1, esp * 0.85, 0.16, y=y, z=zA - 0.05, cor=cor, bisel=0.014))
        it.add(mb.caixa(w - 0.1, esp * 0.85, 0.16, y=y, z=zB - 0.05, cor=cor, bisel=0.014))
    for zt in (zA, zB):
        it.add(mb.caixa(L + 0.06, C + 0.05, 0.13, z=zt - 0.05, cor=cor_base, bisel=0.02))
    roupa(it, L - 0.02, C - 0.02, zA + 0.08, 0, cores_a, h=0.16)
    roupa(it, L - 0.02, C - 0.02, zB + 0.08, 0, cores_b, h=0.16)
    it.slots = [s for s in it.slots if s[0] != "slot_colchao"]
    # guarda-corpo de cima (os dois lados; o −X deixa a escada)
    zg0, zg1 = zB + 0.08, zB + 0.42
    for sx, y0, y1 in ((-LADO, -yp, yp), (LADO, -yp + 0.48, yp)):
        yc, cl = (y0 + y1) / 2, y1 - y0
        xg = sx * (L / 2 + 0.035)
        it.add(mb.caixa(0.05, cl, 0.06, x=xg, y=yc, z=zg1 - 0.06, cor=cor, bisel=0.014))
        n = max(3, int(cl / 0.16))
        it.add([mb.caixa(0.032, 0.032, zg1 - zg0 - 0.05, x=xg, y=y0 + 0.05 + (cl - 0.1) * (k + 0.5) / n, z=zg0,
                         cor=cor, bisel=0.009, seg=1) for k in range(n)])
    # escada reta encostada na lateral −X, perto do pé
    xe = LADO * (L / 2 + 0.11)
    Hs = zg1
    for dy in (-0.18, 0.18):
        it.add(mb.caixa(0.045, 0.045, Hs, x=xe, y=-yp + 0.25 + dy, cor=cor, bisel=0.012, seg=2))
    for k in range(5):
        it.add(mb.cilindro(0.016, 0.36, x=xe, y=-yp + 0.25, z=0.32 + k * (Hs - 0.45) / 4.2, eixo="y", cor=cor, seg=10))
    for zz in (zA + 0.02, zB + 0.02):
        it.add(mb.caixa(0.09, 0.03, 0.04, x=xe - LADO * 0.045, y=-yp + 0.25 - 0.18, z=zz, cor=cor, bisel=0.008, seg=1))
        it.add(mb.caixa(0.09, 0.03, 0.04, x=xe - LADO * 0.045, y=-yp + 0.25 + 0.18, z=zz, cor=cor, bisel=0.008, seg=1))
    it.slot("cama_baixo", (0, -0.2, zA + 0.3), (L - 0.12, C * 0.5, 0.3))
    it.slot("cama_cima", (0, -0.2, zB + 0.3), (L - 0.12, C * 0.5, 0.25))
    it.colisao([((0, 0, 0), (w, 2 * yp + esp, zA + 0.26)),
                ((0, 0, zB - 0.05), (w, 2 * yp + esp, H - zB + 0.05)),
                ((0, yp, 0), (w, esp, H)), ((0, -yp, 0), (w, esp, H)),
                ((xe, -yp + 0.25, 0), (0.08, 0.45, Hs))])


def berco_painel(it, cor, cor_friso, cores_roupa):
    """Berço de painéis: cabeceira e peseira cheias (com filete e barra curva embaixo) e laterais de grade."""
    L, C = BER
    yp = C / 2 + 0.04
    w = L + 0.12
    esp = 0.05
    for sy in (-1, 1):
        y = sy * yp
        pts = ret_xz(w, 0.0, 0.94, 0.05, 0.0)
        it.add(painel_xz(pts, y, esp, cor, bisel=0.016))
        it.add(friso(ret_xz(w - 0.14, 0.42, 0.86, 0.025, 0.025), y - esp / 2, cor=cor_friso))
    zc = 0.4
    for sx in (-1, 1):
        x = sx * (L / 2 + 0.03)
        it.add(mb.caixa(0.045, 2 * yp, 0.07, x=x, z=0.86, cor=cor, bisel=0.016))
        it.add(mb.caixa(0.045, 2 * yp, 0.08, x=x, z=zc - 0.06, cor=cor, bisel=0.016))
        n = 9
        for k in range(n):
            yk = -yp + 0.06 + (2 * yp - 0.12) * (k + 0.5) / n
            it.add(mb.cilindro(0.014, 0.86 - (zc + 0.02) + 0.01, x=x, y=yk, z=zc + 0.015, cor=cor, seg=10, bisel=0.002))
    it.add(estrado(L, C, zc, 0, cor))
    roupa(it, L - 0.02, C - 0.02, zc, 0, cores_roupa, h=0.12, frac=0.55, trav=(0.36, 0.22, 0.09))
    it.colisao([((0, 0, 0), (w, 2 * yp + esp, 0.94))])


def berco_redondo(it, cor, cores_roupa):
    """Berço de grade arredondada: pontas em arco feitas de tubo grosso e laterais de barras."""
    L, C = BER
    yp = C / 2 + 0.035
    w = L + 0.1
    rt = 0.026
    H = 0.92
    for sy in (-1, 1):
        y = sy * yp
        pts = ret_xz(w, 0.06, H, 0.2, 0.06, seg=8)
        it.add(friso(pts, y, r=rt, cor=cor))
        n = 5
        for k in range(n):
            x = -w / 2 + 0.06 + (w - 0.12) * (k + 0.5) / n
            ztop = H - rt
            if abs(x) > w / 2 - 0.2:
                dx = abs(x) - (w / 2 - 0.2)
                ztop = H - 0.2 + math.sqrt(max(0.0, 0.2 ** 2 - dx ** 2)) - rt
            it.add(mb.cilindro(0.014, ztop - 0.07, x=x, y=y, z=0.07, cor=cor, seg=10, bisel=0.002))
        for sx in (-1, 1):
            it.add(mb.esfera(0.035, x=sx * (w / 2 - 0.06), y=y, z=0.0315, cor=cor, esc=(1, 1, 0.9), seg=14))
    zc = 0.38
    for sx in (-1, 1):
        x = sx * (w / 2 - 0.006)
        it.add(mb.tubo([(x, -yp, H - 0.2), (x, yp, H - 0.2)], 0.022, cor=cor, seg=10))
        it.add(mb.tubo([(x, -yp, zc - 0.02), (x, yp, zc - 0.02)], 0.022, cor=cor, seg=10))
        n = 8
        for k in range(n):
            yk = -yp + 0.08 + (2 * yp - 0.16) * (k + 0.5) / n
            it.add(mb.cilindro(0.013, H - 0.2 - zc + 0.02, x=x, y=yk, z=zc - 0.02, cor=cor, seg=10, bisel=0.002))
    it.add(mb.caixa(L + 0.04, C + 0.04, 0.06, z=zc - 0.06, cor=cor, bisel=0.012))
    roupa(it, L - 0.02, C - 0.02, zc, 0, cores_roupa, h=0.12, frac=0.55, trav=(0.36, 0.22, 0.09))
    it.colisao([((0, 0, 0), (w + 0.05, 2 * yp + 0.05, H + 0.03))])


def berco_classico(it, cor, cor_rip, cores_roupa):
    """Berço clássico: quatro colunas com bola e grade de barras nos quatro lados."""
    L, C = BER
    xp, yp = L / 2 + 0.04, C / 2 + 0.04
    wp = 0.06
    H = 0.9
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.add(poste_torneado(H + 0.06, 0.032, sx * xp, sy * yp, cor, seg=16))
    zc = 0.4
    for sy in (-1, 1):
        y = sy * yp
        it.add(mb.caixa(2 * xp, 0.04, 0.06, y=y, z=H - 0.06, cor=cor, bisel=0.014))
        it.add(mb.caixa(2 * xp, 0.04, 0.12, y=y, z=zc - 0.1, cor=cor, bisel=0.014))
        it.add(ripas([-xp + 2 * xp * (k + 0.5) / 5 for k in range(5)], zc + 0.01, H - 0.055, y, 0.014, cor_rip))
    for sx in (-1, 1):
        x = sx * xp
        it.add(mb.caixa(0.04, 2 * yp, 0.06, x=x, z=H - 0.06, cor=cor, bisel=0.014))
        it.add(mb.caixa(0.04, 2 * yp, 0.12, x=x, z=zc - 0.1, cor=cor, bisel=0.014))
        n = 9
        for k in range(n):
            yk = -yp + 0.05 + (2 * yp - 0.1) * (k + 0.5) / n
            it.add(mb.cilindro(0.014, H - 0.055 - zc - 0.01, x=x, y=yk, z=zc + 0.01, cor=cor_rip, seg=10, bisel=0.002))
    it.add(estrado(L, C, zc, 0, cor))
    roupa(it, L - 0.02, C - 0.02, zc, 0, cores_roupa, h=0.12, frac=0.55, trav=(0.36, 0.22, 0.09))
    it.colisao([((0, 0, 0), (2 * xp + wp, 2 * yp + wp, H + 0.1))])


# ---- pacote ---------------------------------------------------------------------------------------------------------
def cama_pacote_bed07(it):
    """Bed_07 (cama de solteiro terracota do pacote), em escala de verdade: colchão de 0,90 × 1,90 a ~0,55 m."""
    pc = mb.importa_pacote("Bed_07")
    corpo = pc.pop("corpo")
    for o in pc.values():
        bpy.data.objects.remove(o)
    escala_malha(corpo, 0.95, 0.98, 0.66)
    it.add(corpo)
    lo, hi = mb.bbox(corpo)
    yc = (lo.y + hi.y) / 2
    it.slot("colchao", (0, lo.y + 0.55, 0.57), (0.75, 0.8, 0.4))
    colisao_cama(it, hi.x - lo.x, lo.y, hi.y, 0.56, cab=(hi.y - 0.12, hi.y, hi.z), pe_=(lo.y, lo.y + 0.12, 0.69))
    return yc


def cama_pacote_bed02(it):
    """Bed_02 (cama de casal verde com gavetas, do pacote): as três frentes de cada lado viram gavetas de verdade
    (caixa com slot) que abrem para os lados. Escala: colchão de 1,40 × 1,90."""
    sx_, sy_, sz_ = 0.85, 1.0, 0.67
    pc = mb.importa_pacote("Bed_02")
    corpo = pc.pop("corpo")
    escala_malha(corpo, sx_, sy_, sz_)
    uv = corpo.data.uv_layers["UVMap"].data
    u_va = mb.uv_cor("verde_agua")
    mb.pinta(corpo, "turquesa", [p.index for p in corpo.data.polygons
                                 if (uv[p.loop_indices[0]].uv - V(u_va)).length < 1e-4])
    it.add(corpo)
    for nm in sorted(pc):
        ob = pc[nm]
        escala_malha(ob, sx_, sy_, sz_)
        # separa as peças soltas: frente esquerda, frente direita, puxadores e a tábua que atravessa (descartada)
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        partes = []
        vistos = set()
        bm.verts.ensure_lookup_table()
        for v in bm.verts:
            if v.index in vistos:
                continue
            pilha, comp = [v], []
            vistos.add(v.index)
            while pilha:
                w_ = pilha.pop()
                comp.append(w_.index)
                for e in w_.link_edges:
                    o2 = e.other_vert(w_)
                    if o2.index not in vistos:
                        vistos.add(o2.index)
                        pilha.append(o2)
            partes.append(comp)
        bm.free()
        lados = {-1: [], 1: []}
        for comp in partes:
            xs = [ob.data.vertices[i].co.x for i in comp]
            if max(xs) - min(xs) > 0.5:
                continue  # tábua de ligação
            lados[-1 if sum(xs) < 0 else 1].append(set(comp))
        for lado, comps in lados.items():
            keep = set().union(*comps)
            c = ob.copy()
            c.data = ob.data.copy()
            bpy.context.scene.collection.objects.link(c)
            bm = bmesh.new()
            bm.from_mesh(c.data)
            bm.verts.ensure_lookup_table()
            bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.index not in keep], context="VERTS")
            bm.to_mesh(c.data)
            bm.free()
            lo, hi = mb.bbox(c)
            # plano da frente: a face de trás da tábua da frente (puxador fica para fora)
            xf = (0.85 * sx_) * lado
            yc = (lo.y + hi.y) / 2
            comp_ = hi.y - lo.y
            gaveta_lado(it, comp_ - 0.05, 0.6, 0.14, [c], xf, yc, lo.z + 0.03, lado=lado, cor="bege",
                        nome=f"gaveta_{'esq' if lado < 0 else 'dir'}_{nm[-1]}")
        bpy.data.objects.remove(ob)
    lo, hi = mb.bbox(corpo)
    it.slot("colchao", (0, lo.y + 0.6, 0.56), (1.2, 0.8, 0.4))
    colisao_cama(it, hi.x - lo.x, lo.y, hi.y, 0.55, cab=(hi.y - 0.1, hi.y, hi.z))


# =====================================================================================================================
# Registro das peças
# =====================================================================================================================
REG = []


def reg(cat, id_, fn, rotulo, grupo, tags=(), pacote=False):
    REG.append(dict(cat=cat, id=id_, fn=fn, rotulo=rotulo, grupo=grupo, tags=list(tags), pacote=pacote))


# roupas de cama (lençol, edredom, faixa, travesseiro)
R_ROSA = ("rosa_claro", "rosa", "vermelho_claro", "rosa_escuro")
R_PESSEGO = ("creme_claro", "laranja_claro", "salmao", "laranja")
R_TURQ = ("creme", "turquesa", "verde_lima", "turquesa_claro")
R_AMARELO = ("verde_lima", "amarelo", "amarelo_claro", "amarelo")
R_AZUL = ("azul_bebe", "azul_celeste", "azul_claro", "azul_celeste")
R_AZUL_AMAR = ("amarelo_claro", "azul_celeste", "azul_claro", "azul")
R_VERMELHO = ("amarelo", "vermelho_claro", "rosa", "vermelho_claro")
R_LILAS = ("lilas_claro", "lilas", "rosa_bebe", "roxo")
R_VERDE = ("creme_claro", "verde_claro", "menta", "verde")
R_MENTA = ("branco", "menta", "verde_agua", "verde_agua")
R_BEBE_AZUL = ("branco", "azul_claro", "azul_bebe", "azul_bebe")
R_BEBE_ROSA = ("rosa_claro", "rosa_bebe", "branco", "rosa_bebe")
R_BEBE_AMAR = ("amarelo_claro", "azul_bebe", "branco", "amarelo_claro")
R_BEBE_VERDE = ("verde_lima", "azul_claro", "azul_bebe", "azul_bebe")
R_CINZA = ("branco_gelo", "cinza_azulado", "cinza_claro", "branco")
R_CORAL = ("pessego", "salmao", "creme_claro", "vermelho_claro")

C = "camas"
reg(C, "cama_solteiro_classica_terracota_pacote", cama_pacote_bed07, "Cama de solteiro clássica (terracota, pacote)",
    "classica_solteiro_pacote", ["solteiro", "classica", "pacote"], pacote=True)
reg(C, "cama_solteiro_classica_rosa", lambda it: cama_classica(it, SOL, "rosa", "rosa_escuro", R_PESSEGO),
    "Cama de solteiro clássica (rosa)", "classica_solteiro", ["solteiro", "classica"])
reg(C, "cama_solteiro_classica_azul", lambda it: cama_classica(it, SOL, "azul_acinzentado", "azul_escuro", R_AZUL),
    "Cama de solteiro clássica (azul)", "classica_solteiro", ["solteiro", "classica"])
reg(C, "cama_casal_classica_terracota", lambda it: cama_classica(it, CAS, "terracota", "terracota_escura", R_ROSA),
    "Cama de casal clássica (terracota)", "classica_casal", ["casal", "classica"])
reg(C, "cama_casal_classica_madeira", lambda it: cama_classica(it, CAS, "madeira_mel", "madeira", R_TURQ),
    "Cama de casal clássica (madeira)", "classica_casal", ["casal", "classica", "madeira"])
reg(C, "cama_solteiro_grade_arco_laranja",
    lambda it: cama_grade_arco(it, SOL, "laranja", "laranja_escuro", R_PESSEGO),
    "Cama de solteiro com cabeceira de grade em arco (laranja)", "grade_arco_solteiro", ["solteiro", "grade"])
reg(C, "cama_solteiro_grade_arco_verde",
    lambda it: cama_grade_arco(it, SOL, "verde_claro", "verde", R_AMARELO),
    "Cama de solteiro com cabeceira de grade em arco (verde)", "grade_arco_solteiro", ["solteiro", "grade"])
reg(C, "cama_casal_grade_arco_laranja",
    lambda it: cama_grade_arco(it, CAS, "laranja", "laranja_escuro", R_PESSEGO),
    "Cama de casal com cabeceira de grade em arco (laranja)", "grade_arco_casal", ["casal", "grade"])
reg(C, "cama_casal_grade_arco_madeira",
    lambda it: cama_grade_arco(it, CAS, "madeira_clara", "madeira_mel", R_CINZA),
    "Cama de casal com cabeceira de grade em arco (madeira)", "grade_arco_casal", ["casal", "grade", "madeira"])
reg(C, "cama_casal_gavetas_verde_pacote", cama_pacote_bed02, "Cama de casal com gavetas (verde, pacote)",
    "gavetas_casal_pacote", ["casal", "gavetas", "pacote"], pacote=True)
reg(C, "cama_casal_gavetas_azul",
    lambda it: cama_gavetas(it, CAS, "azul_marinho", "azul_acinzentado", "amarelo", R_AMARELO, dois_lados=True),
    "Cama de casal com gavetas (azul-marinho)", "gavetas_casal", ["casal", "gavetas"])
reg(C, "cama_solteiro_gavetas_verde",
    lambda it: cama_gavetas(it, SOL, "verde_escuro", "verde_escuro", "ouro", R_TURQ),
    "Cama de solteiro com gavetas (verde)", "gavetas_solteiro", ["solteiro", "gavetas"])
reg(C, "cama_solteiro_gavetas_vinho",
    lambda it: cama_gavetas(it, SOL, "vinho", "vinho", "ouro", R_CORAL),
    "Cama de solteiro com gavetas (vinho)", "gavetas_solteiro", ["solteiro", "gavetas"])
reg(C, "cama_casal_estofada_verde", lambda it: cama_estofada(it, CAS, "verde", "verde", R_AMARELO),
    "Cama de casal estofada (verde)", "estofada_casal", ["casal", "estofada", "moderna"])
reg(C, "cama_casal_estofada_cinza", lambda it: cama_estofada(it, CAS, "tecido_cinza", "tecido_cinza", R_ROSA),
    "Cama de casal estofada (cinza)", "estofada_casal", ["casal", "estofada", "moderna"])
reg(C, "cama_solteiro_estofada_verde", lambda it: cama_estofada(it, SOL, "verde", "verde", R_AMARELO),
    "Cama de solteiro estofada (verde)", "estofada_solteiro", ["solteiro", "estofada", "moderna"])
reg(C, "cama_solteiro_estofada_azul", lambda it: cama_estofada(it, SOL, "azul_acinzentado", "azul_acinzentado",
                                                                R_AZUL_AMAR),
    "Cama de solteiro estofada (azul)", "estofada_solteiro", ["solteiro", "estofada", "moderna"])
reg(C, "cama_infantil_gavetas_lilas",
    lambda it: cama_infantil_friso(it, "lilas", "roxo", "lilas", "azul", R_LILAS),
    "Cama infantil com gavetas (lilás)", "infantil_friso", ["infantil", "solteiro", "gavetas"])
reg(C, "cama_infantil_gavetas_verde",
    lambda it: cama_infantil_friso(it, "verde_lima", "verde_medio", "verde_lima", "azul", R_AZUL),
    "Cama infantil com gavetas (verde)", "infantil_friso", ["infantil", "solteiro", "gavetas"])
reg(C, "cama_infantil_gavetas_coral",
    lambda it: cama_infantil_friso(it, "pessego", "laranja_escuro", "pessego", "laranja_escuro", R_ROSA),
    "Cama infantil com gavetas (coral)", "infantil_friso", ["infantil", "solteiro", "gavetas"])
reg(C, "cama_infantil_gaveta_laranja",
    lambda it: cama_infantil_moldura(it, "laranja_claro", "laranja", "laranja_escuro", R_AZUL),
    "Cama infantil com gavetão (laranja)", "infantil_moldura", ["infantil", "solteiro", "gavetas"])
reg(C, "cama_infantil_gaveta_azul",
    lambda it: cama_infantil_moldura(it, "azul_claro", "azul_celeste", "amarelo", R_VERMELHO),
    "Cama infantil com gavetão (azul)", "infantil_moldura", ["infantil", "solteiro", "gavetas"])
reg(C, "cama_solteiro_painel_azul", lambda it: cama_painel(it, "azul_claro", "azul", R_AZUL),
    "Cama de solteiro de painel (azul-clara)", "painel_solteiro", ["solteiro", "painel"])
reg(C, "cama_solteiro_painel_amarela", lambda it: cama_painel(it, "amarelo_claro", "amarelo_escuro", R_VERDE),
    "Cama de solteiro de painel (amarela)", "painel_solteiro", ["solteiro", "painel"])
reg(C, "cama_solteiro_ripas_arco_laranja", lambda it: cama_ripas_arco(it, "laranja_claro", R_VERDE),
    "Cama de solteiro de grade em arco (laranja)", "ripas_arco_solteiro", ["solteiro", "grade", "madeira"])
reg(C, "cama_solteiro_ripas_arco_madeira", lambda it: cama_ripas_arco(it, "madeira_mel", R_AZUL),
    "Cama de solteiro de grade em arco (madeira)", "ripas_arco_solteiro", ["solteiro", "grade", "madeira"])
reg(C, "cama_solteiro_tubo_azul", lambda it: cama_tubo(it, "azul_celeste", R_VERMELHO),
    "Cama de solteiro de grade (azul)", "tubo_solteiro", ["solteiro", "grade"])
reg(C, "cama_solteiro_tubo_vermelha", lambda it: cama_tubo(it, "vermelho", R_AZUL_AMAR),
    "Cama de solteiro de grade (vermelha)", "tubo_solteiro", ["solteiro", "grade"])
reg(C, "cama_solteiro_friso_vermelho", lambda it: cama_friso_vazada(it, "branco", "vermelho_claro", R_VERMELHO),
    "Cama de solteiro branca com friso (vermelho)", "friso_solteiro", ["solteiro", "branca"])
reg(C, "cama_solteiro_friso_azul", lambda it: cama_friso_vazada(it, "branco", "azul", R_AZUL),
    "Cama de solteiro branca com friso (azul)", "friso_solteiro", ["solteiro", "branca"])
reg(C, "cama_solteiro_bicama_marrom",
    lambda it: cama_bicama(it, "marrom_claro", "marrom", R_AZUL_AMAR, R_VERDE),
    "Cama de solteiro com bicama (marrom)", "bicama", ["solteiro", "bicama", "madeira"])
reg(C, "cama_solteiro_bicama_branca",
    lambda it: cama_bicama(it, "branco", "branco_gelo", R_ROSA, R_LILAS),
    "Cama de solteiro com bicama (branca)", "bicama", ["solteiro", "bicama"])
reg(C, "beliche_madeira_mel", lambda it: beliche_madeira(it, "madeira_mel", "madeira_clara", R_AZUL, R_BEBE_AZUL),
    "Beliche de madeira (mel)", "beliche_madeira", ["beliche", "infantil", "madeira"])
reg(C, "beliche_madeira_laranja", lambda it: beliche_madeira(it, "laranja_claro", "amarelo_claro", R_VERDE, R_AZUL),
    "Beliche de madeira (laranja)", "beliche_madeira", ["beliche", "infantil"])
reg(C, "beliche_painel_branco", lambda it: beliche_painel(it, "branco", "azul_claro", R_AMARELO, R_AMARELO),
    "Beliche de painel (branco)", "beliche_painel", ["beliche", "infantil"])
reg(C, "beliche_painel_rosa", lambda it: beliche_painel(it, "rosa_claro", "lilas", R_LILAS, R_ROSA),
    "Beliche de painel (rosa)", "beliche_painel", ["beliche", "infantil"])
reg(C, "berco_painel_azul", lambda it: berco_painel(it, "azul_bebe", "azul_celeste", R_BEBE_AMAR),
    "Berço de painel (azul)", "berco_painel", ["berco", "bebe"])
reg(C, "berco_painel_amarelo", lambda it: berco_painel(it, "amarelo_claro", "mostarda", R_BEBE_AZUL),
    "Berço de painel (amarelo)", "berco_painel", ["berco", "bebe"])
reg(C, "berco_redondo_rosa", lambda it: berco_redondo(it, "rosa_bebe", R_BEBE_ROSA),
    "Berço de grade redonda (rosa)", "berco_redondo", ["berco", "bebe"])
reg(C, "berco_redondo_menta", lambda it: berco_redondo(it, "menta", R_MENTA),
    "Berço de grade redonda (menta)", "berco_redondo", ["berco", "bebe"])
reg(C, "berco_classico_branco", lambda it: berco_classico(it, "branco", "branco", R_BEBE_VERDE),
    "Berço clássico (branco)", "berco_classico", ["berco", "bebe"])
reg(C, "berco_classico_madeira", lambda it: berco_classico(it, "madeira_clara", "pinus", R_BEBE_AMAR),
    "Berço clássico (madeira)", "berco_classico", ["berco", "bebe", "madeira"])

# =====================================================================================================================
# Criados-mudos
# =====================================================================================================================
def tampo(it, z, l, p, x=0.0, y=0.0):
    """Slot em cima do criado (abajur, livro, despertador)."""
    it.slot("tampo", (x, y, z), (l, p, 0.4))


def frente_em(l, a, y_costas, z, x=0.0, pux="bola", cor_pux="ouro", pux_z=None, pux_tam=1.4, vertical=False, **kw):
    """Frente (mb.frente) virada para −Y com as costas no plano y_costas e a base em z, mais o puxador."""
    esp = kw.get("esp", 0.022)
    f = mb.frente(l, a, **kw)
    mb.transforma(f, loc=(x, y_costas, z))
    objs = [f]
    if pux:
        objs.append(mb.puxador(pux, x=x, y=y_costas - esp, z=z + (a / 2 if pux_z is None else pux_z), cor=cor_pux,
                               tam=pux_tam, vertical=vertical))
    return objs


def puxador_barrinha(x, y, z, cor, l=0.08):
    """Puxador de barrinha arredondada (o das imagens): um tablete boleado saindo da frente."""
    return mb.caixa(l, 0.028, 0.026, x=x, y=y - 0.012, z=z - 0.013, cor=cor, bisel=0.011, seg=3)


def criado_painel(it, cor, cor_gav, cor_pux):
    """Criado de laterais cheias (sem pés), gaveta logo abaixo do tampo e prateleira baixa."""
    L, P, A = 0.48, 0.38, 0.56
    e = 0.045
    it.add(mb.caixa(L + 0.04, P + 0.03, 0.05, y=0.0, z=A - 0.05, cor=cor, bisel=0.02))
    for sx in (-1, 1):
        it.add(mb.caixa(e, P, A - 0.045, x=sx * (L / 2 - e / 2), cor=cor, bisel=0.015))
    Li = L - 2 * e
    zg = A - 0.05 - 0.17
    it.add(mb.caixa(Li + 0.004, P - 0.02, 0.022, y=0.01, z=zg, cor=cor, bisel=0.005, seg=2))
    it.add(mb.caixa(Li + 0.004, 0.02, A - 0.05 - zg, y=P / 2 - 0.012, z=zg, cor=cor, bisel=0.004, seg=1))
    it.add(mb.caixa(Li + 0.004, P - 0.04, 0.022, y=0.01, z=0.07, cor=cor, bisel=0.005, seg=2))
    fr = frente_em(Li - 0.008, 0.14, -P / 2 + 0.02, zg + 0.026, estilo="lisa", cor=cor_gav, cor_pux=cor_pux,
                   bisel=0.01)
    it.gaveta(Li - 0.03, P - 0.07, 0.1, fr, y_frente=-P / 2 + 0.02, z=zg + 0.03, cor="bege")
    it.slot("prateleira", (0, 0.01, 0.092), (Li - 0.02, P - 0.06, zg - 0.1))
    tampo(it, A, L, P)


def criado_banqueta(it, cor, cor_pe):
    """Banquinho de cabeceira: tampo macio de cantos redondos, pés cônicos abertos e travessas."""
    A = 0.54
    it.add(mb.superelipsoide(0.46, 0.34, 0.07, z=A - 0.07, cor=cor, e=0.28, e_v=0.45, nu=28, nv=10))
    abre = 5
    pl, pp, rec = 0.4, 0.28, 0.04
    it.add(mb.quatro_pes("conico", pl, pp, A - 0.05, cor_pe, r=0.026, recuo=rec, abre=abre))
    s = math.sin(math.radians(abre))
    for z, eixo in ((0.16, "x"), (0.26, "y")):
        dx = pl / 2 - rec - z * s
        dy = pp / 2 - rec - z * s
        for sg in (-1, 1):
            if eixo == "x":
                it.add(mb.cilindro(0.014, 2 * dx, y=sg * dy, z=z, eixo="x", cor=cor_pe, seg=10, bisel=0.003))
            else:
                it.add(mb.cilindro(0.014, 2 * dy, x=sg * dx, z=z, eixo="y", cor=cor_pe, seg=10, bisel=0.003))
    tampo(it, A, 0.36, 0.26)


def criado_oval(it, cor, cor_gav, cor_pe, cor_pux):
    """Criado oval (cápsula deitada) com a frente da gaveta embutida no aro e pés palito abertos."""
    W, P, z0, z1 = 0.52, 0.36, 0.22, 0.56
    t = 0.035
    ext = ret_xz(W, z0, z1, 0.12, 0.12, seg=8)
    inn = ret_xz(W - 2 * t, z0 + t, z1 - t, 0.085, 0.085, seg=8)
    it.add(casca(ext, inn, P, y0=-P / 2, cor=cor, bisel=0.028))
    it.add(painel_xz(ret_xz(W - 2 * t + 0.006, z0 + t - 0.003, z1 - t + 0.003, 0.088, 0.088, seg=8),
                     P / 2 - 0.014, 0.024, cor, bisel=0.004))
    fr = mb.extrudado(_ccw(ret_xz(W - 2 * t - 0.008, z0 + t + 0.004, z1 - t - 0.004, 0.081, 0.081, seg=8)), 0.03,
                      y=-P / 2 - 0.006, cor=cor_gav, bisel=0.01, plano="xz")
    zm = (z0 + z1) / 2
    pux = mb.puxador("bola", y=-P / 2 - 0.006, z=zm, cor=cor_pux, tam=1.4)
    it.gaveta(0.34, P - 0.1, 0.17, [fr, pux], y_frente=-P / 2 + 0.024, z=zm - 0.09, cor="bege")
    it.add(mb.quatro_pes("palito", 0.32, 0.24, 0.275, cor_pe, r=0.026, recuo=0.02, abre=9))
    tampo(it, z1, 0.28, P - 0.06)


def _u_contorno(w, H, rt, t):
    ext = ret_xz(w, 0.0, H, rt, 0.0, seg=8)
    inn = ret_xz(w - 2 * t, 0.0, H - t, rt - t, 0.0, seg=8)
    return ext + list(reversed(inn))


def criado_arco_gaveta(it, cor, cor_gav, cor_pux):
    """Criado em arco (U de cabeça para baixo, cantos de cima bem redondos): gaveta no alto e nicho aberto embaixo."""
    w, P, H, rt, t = 0.48, 0.38, 0.58, 0.12, 0.05
    it.add(mb.extrudado(_ccw(_u_contorno(w, H, rt, t)), P, y=-P / 2, cor=cor, bisel=0.022, seg=3, plano="xz"))
    inn = ret_xz(w - 2 * t + 0.004, 0.0, H - t + 0.002, rt - t + 0.002, 0.0, seg=8)
    it.add(painel_xz(inn, P / 2 - 0.016, 0.022, cor, bisel=0.004))
    wi = w - 2 * t
    zs = 0.34
    it.add(mb.caixa(wi + 0.004, P - 0.03, 0.024, y=0.0, z=zs, cor=cor, bisel=0.005, seg=2))
    f = mb.extrudado(_ccw(ret_xz(wi - 0.008, zs + 0.028, H - t - 0.004, rt - t - 0.004, 0.008, seg=8)), 0.022,
                     y=-P / 2 - 0.002, cor=cor_gav, bisel=0.008, plano="xz")
    zm = (zs + 0.028 + H - t) / 2
    pux = mb.puxador("bola", y=-P / 2 - 0.002, z=zm, cor=cor_pux, tam=1.4)
    it.gaveta(wi - 0.05, P - 0.08, 0.1, [f, pux], y_frente=-P / 2 + 0.02, z=zs + 0.03, cor="bege")
    it.slot("nicho", (0, 0.0, 0.0), (wi - 0.02, P - 0.06, zs - 0.01))
    tampo(it, H, w - 2 * rt, P - 0.06)


def criado_arco_porta(it, cor, cor_porta, cor_prat, cor_pux):
    """Criado em arco fechado: nicho aberto em cima, prateleira e porta embaixo (dobradiça à direita)."""
    w, P, H, t = 0.48, 0.38, 0.6, 0.04
    ext = ret_xz(w, 0.0, H, 0.11, 0.03, seg=8)
    inn = ret_xz(w - 2 * t, t, H - t, 0.075, 0.01, seg=8)
    it.add(casca(ext, inn, P, y0=-P / 2, cor=cor, bisel=0.02))
    it.add(painel_xz(ret_xz(w - 2 * t + 0.006, t - 0.003, H - t + 0.003, 0.078, 0.012, seg=8), P / 2 - 0.014, 0.024,
                     cor, bisel=0.004))
    wi = w - 2 * t
    zs = 0.3
    it.add(mb.caixa(wi + 0.004, P - 0.03, 0.022, y=0.0, z=zs, cor=cor_prat, bisel=0.005, seg=2))
    fp = frente_em(wi - 0.008, zs - t - 0.006, -P / 2 + 0.02, t + 0.003, x=0, estilo="lisa", cor=cor_porta,
                   cor_pux=cor_pux, pux=None, bisel=0.012)
    fp.append(mb.puxador("bola", x=-wi / 2 + 0.05, y=-P / 2 - 0.002, z=(t + zs) / 2, cor=cor_pux, tam=1.4))
    it.porta(fp, dobradica=(wi / 2 - 0.004, -P / 2 - 0.002, 0), lado="dir")
    it.slot("nicho", (0, 0.0, zs + 0.022), (wi - 0.02, P - 0.06, H - t - zs - 0.05))
    it.slot("armario", (0, 0.0, t), (wi - 0.02, P - 0.08, zs - t - 0.01))
    tampo(it, H, w - 0.22, P - 0.06)


def criado_basculante(it, cor, cor_frente, cor_pe, cor_pux):
    """Criado de cesto basculante: a frente tomba para a frente (dobradiça embaixo) e abre um cesto em V.
    Pés torneados."""
    W, P, z0, z1 = 0.46, 0.38, 0.08, 0.54
    ext = ret_xz(W, z0, z1, 0.05, 0.05)
    inn = ret_xz(W - 0.08, z0 + 0.04, z1 - 0.04, 0.012, 0.012)
    it.add(casca(ext, inn, P, y0=-P / 2, cor=cor, bisel=0.025))
    it.add(painel_xz(ret_xz(W - 0.074, z0 + 0.037, z1 - 0.037, 0.014, 0.014), P / 2 - 0.014, 0.024, cor, bisel=0.004))
    wi, hi = W - 0.08, z1 - z0 - 0.08
    yb = -P / 2 + 0.02  # costas da frente
    zb = z0 + 0.04 + 0.003
    hf = hi - 0.006
    objs = frente_em(wi - 0.008, hf, yb, zb, estilo="moldura", cor=cor_frente, cor2=cor_frente, margem=0.035,
                     pux=None, bisel=0.012)
    objs.append(mb.puxador("bola", x=0, y=yb - 0.022, z=zb + hf * 0.78, cor=cor_pux, tam=1.4))
    # laterais do cesto: fatia de 40 graus com centro na dobradiça
    rr = hf * 0.96
    fatia = [(0.0, 0.0)] + [(rr * math.cos(math.radians(a_)), rr * math.sin(math.radians(a_))) for a_ in
                            range(90, 49, -8)]
    for sx in (-1, 1):
        lat = mb.extrudado(_ccw(fatia), 0.012, cor=cor_frente, bisel=0.003, seg=1, plano="yz")
        mb.transforma(lat, loc=(sx * (wi / 2 - 0.03) - 0.006, yb + 0.001, zb + 0.01))
        objs.append(lat)
    fundo_l = rr
    fundo = mb.caixa(wi - 0.06 + 0.012, 0.012, fundo_l, cor=cor_frente, bisel=0.003, seg=1)
    mb.transforma(fundo, rot=("X", -40))
    mb.transforma(fundo, loc=(0, yb + 0.002, zb + 0.01))
    objs.append(fundo)
    po = it.porta(objs, dobradica=(0, yb - 0.011, zb), eixo="x", lado="baixo", abre_graus=36, nome="cesto")
    it.slots.append(("slot_cesto", (0, yb + 0.07, zb + 0.16), (wi - 0.1, 0.08, 0.14), po.name))
    it.add(mb.quatro_pes("torneado", W - 0.06, P - 0.08, z0 + 0.012, cor_pe, r=0.032, recuo=0.035))
    tampo(it, z1, W - 0.1, P - 0.06)


def criado_cavalete(it, cor, cor2):
    """Mesinha de cabeceira em cavalete: laterais de tábuas inclinadas (A) e duas prateleiras."""
    A = 0.6
    for sx in (-1, 1):
        x = sx * 0.21
        for sy in (-1, 1):
            yb, yt = sy * 0.2, sy * 0.115
            Ls = math.hypot(yt - yb, A - 0.02)
            tb = mb.caixa(0.045, 0.06, Ls, z=-Ls / 2, cor=cor, bisel=0.016, seg=2)
            mb.transforma(tb, rot=("X", -math.degrees(math.atan2(yt - yb, A - 0.02))))
            mb.transforma(tb, loc=(x, (yb + yt) / 2, (A - 0.02) / 2 + 0.004))
            it.add(tb)
    it.add(mb.caixa(0.5, 0.32, 0.045, z=A - 0.045, cor=cor, bisel=0.016))
    it.add(mb.caixa(0.46, 0.4, 0.04, z=0.13, cor=cor2, bisel=0.014))
    it.slot("prateleira", (0, 0, 0.17), (0.36, 0.34, A - 0.045 - 0.17 - 0.02))
    tampo(it, A, 0.46, 0.28)


def criado_retro(it, cor, cor_gav, cor_pe, cor_pux):
    """Criado retrô: corpo bem arredondado, painel embutido com duas gavetas e pés palito abertos."""
    W, P, z0, H = 0.48, 0.4, 0.17, 0.42
    corpo = mb.superelipsoide(W, P, H, z=z0, cor=cor, e=0.34, e_v=0.34, nu=36, nv=18)
    vao = mb.caixa(0.36, 0.42, 0.3, y=-0.06, z=z0 + 0.06, cor=cor, bisel=0.03)
    subtrai(corpo, vao)
    it.add(corpo)
    it.add(mb.caixa(0.364, 0.3, 0.02, y=0.0, z=z0 + 0.06 + 0.14, cor=cor_gav, bisel=0.004, seg=1))
    for k in range(2):
        zb = z0 + 0.063 + k * 0.15
        fr = frente_em(0.354, 0.144, -P / 2 + 0.03, zb, estilo="lisa", cor=cor_gav, cor_pux=cor_pux, bisel=0.022,
                       esp=0.03)
        it.gaveta(0.32, 0.27, 0.1, fr, y_frente=-P / 2 + 0.03, z=zb + 0.02 if k else zb + 0.004, cor="bege")
    it.add(mb.quatro_pes("palito", 0.32, 0.26, z0 + 0.04, cor_pe, r=0.026, recuo=0.02, abre=10))
    tampo(it, z0 + H, 0.3, 0.24)


def criado_classico(it, cor, cor_gav, cor_pux):
    """Criado clássico: rodapé com pezinhos de bola, colunas na frente, tampo saliente e duas gavetas."""
    L, P = 0.42, 0.34
    it.add(mb.quatro_pes("bola", 0.46, 0.36, 0.06, cor, r=0.032, recuo=0.045))
    it.add(mb.caixa(0.5, 0.4, 0.07, z=0.05, cor=cor, bisel=0.022))
    z0 = 0.115
    Hc = 0.4
    it.add(carcaca(L, P, Hc, z=z0, cor=cor, prateleiras=[0.19], esp=0.022))
    for sx in (-1, 1):
        it.add(mb.torno([(0, 0), (0.036, 0), (0.036, 0.02), (0.028, 0.03), (0.028, Hc - 0.03), (0.036, Hc - 0.02),
                         (0.036, Hc), (0, Hc)], x=sx * 0.22, y=-0.15, z=z0, cor=cor, seg=16))
    it.add(mb.caixa(0.52, 0.42, 0.05, y=0.01, z=z0 + Hc, cor=cor, bisel=0.02))
    li = L - 0.044
    for k, (zb, a) in enumerate(((z0 + 0.025, 0.16), (z0 + 0.19 + 0.022, 0.16))):
        fr = frente_em(li - 0.012, a, -P / 2, zb, estilo="lisa", cor=cor_gav, cor_pux=cor_pux, bisel=0.012)
        it.gaveta(li - 0.03, P - 0.06, 0.11, fr, y_frente=-P / 2, z=zb + 0.015, cor="bege")
    tampo(it, z0 + Hc + 0.05, 0.48, 0.38)


def criado_gavetao(it, cor, cor_gav, cor_pe, cor_pux):
    """Criado de gavetão: corpo arredondado com uma gaveta grande (frente cheia) e pés retos com travessas."""
    W, P, z0, z1 = 0.48, 0.38, 0.22, 0.5
    ext = ret_xz(W, z0, z1, 0.06, 0.06)
    inn = ret_xz(W - 0.08, z0 + 0.04, z1 - 0.04, 0.015, 0.015)
    it.add(casca(ext, inn, P, y0=-P / 2, cor=cor, bisel=0.025))
    it.add(painel_xz(ret_xz(W - 0.074, z0 + 0.037, z1 - 0.037, 0.017, 0.017), P / 2 - 0.014, 0.024, cor, bisel=0.004))
    f = mb.extrudado(_ccw(ret_xz(W - 0.03, z0 + 0.018, z1 - 0.018, 0.045, 0.045)), 0.035, y=-P / 2 - 0.035,
                     cor=cor_gav, bisel=0.014, plano="xz")
    pux = puxador_barrinha(0, -P / 2 - 0.035, (z0 + z1) / 2 + 0.03, cor_pux)
    it.gaveta(0.36, P - 0.08, 0.17, [f, pux], y_frente=-P / 2, z=z0 + 0.045, cor="bege")
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.add(mb.cilindro(0.028, z0 + 0.03, x=sx * 0.17, y=sy * 0.12, cor=cor_pe, seg=16, bisel=0.008))
        it.add(mb.cilindro(0.016, 0.24, x=sx * 0.17, z=0.08, eixo="y", cor=cor_pe, seg=12, bisel=0.004))
    tampo(it, z1, W - 0.12, P - 0.06)


def criado_nicho_gaveta(it, cor, cor_tampo, cor_gav, cor_pux):
    """Criado de nicho e gaveta: corpo claro, tampo saliente de outra cor e pés de bola."""
    L, P = 0.44, 0.36
    z0, Hc = 0.065, 0.4
    it.add(mb.quatro_pes("bola", L - 0.02, P - 0.02, 0.075, cor_tampo, r=0.034, recuo=0.05))
    it.add(carcaca(L, P, Hc, z=z0, cor=cor, prateleiras=[0.2], esp=0.024, bisel=0.01))
    it.add(mb.caixa(L + 0.06, P + 0.05, 0.05, y=0.005, z=z0 + Hc, cor=cor_tampo, bisel=0.022))
    li = L - 0.048
    fr = frente_em(li - 0.008, 0.168, -P / 2 + 0.022, z0 + 0.026, estilo="lisa", cor=cor_gav, cor_pux=cor_pux,
                   bisel=0.012)
    it.gaveta(li - 0.03, P - 0.07, 0.12, fr, y_frente=-P / 2 + 0.022, z=z0 + 0.03, cor="bege")
    it.slot("nicho", (0, 0.0, z0 + 0.2 + 0.02), (li - 0.02, P - 0.06, Hc - 0.2 - 0.05))
    tampo(it, z0 + Hc + 0.05, L, P)


def criado_dois_andares(it, cor, cor2):
    """Mesinha de dois andares: tampo em cima de quatro colunas que pousam numa prateleira com pés próprios."""
    it.add(mb.caixa(0.5, 0.42, 0.06, z=0.2, cor=cor2, bisel=0.026))
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.add(mb.cilindro(0.03, 0.205, x=sx * 0.2, y=sy * 0.16, cor=cor2, seg=16, bisel=0.01))
            it.add(mb.cilindro(0.027, 0.26, x=sx * 0.16, y=sy * 0.12, z=0.255, cor=cor, seg=16, bisel=0.008))
    it.add(mb.caixa(0.44, 0.36, 0.06, z=0.5, cor=cor, bisel=0.026))
    it.slot("prateleira", (0, 0, 0.26), (0.28, 0.2, 0.24))
    tampo(it, 0.56, 0.42, 0.34)


def criado_capsula_nicho(it, cor, cor_dentro, cor_pe):
    """Criado cápsula: corpo de pontas redondas (visto de cima) com um nicho aberto na frente e pés grossos."""
    W, P, z0, H = 0.52, 0.38, 0.2, 0.33
    corpo = mb.extrudado(mb.ret_arredondado(W, P, 0.17, seg=8), H, z=z0, cor=cor, bisel=0.05, seg=4)
    subtrai(corpo, mb.caixa(0.36, 0.42, 0.21, y=-0.08, z=z0 + 0.06, cor=cor_dentro, bisel=0.035))
    it.add(corpo)
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.add(mb.cilindro(0.036, z0 + 0.03, x=sx * 0.15, y=sy * 0.08, cor=cor_pe, seg=16, bisel=0.012))
    it.slot("nicho", (0, -0.02, z0 + 0.06), (0.32, 0.28, 0.2))
    tampo(it, z0 + H, 0.32, 0.26)


def criado_bicolor(it, cor, cor_base, cor_gav, cor_pux):
    """Criado de duas cores: caixa de cima com nicho, base escura com gaveta de cantos de baixo redondos e pés
    palito abertos."""
    P = 0.38
    cima = mb.caixa(0.46, P, 0.27, z=0.31, cor=cor, bisel=0.06)
    subtrai(cima, mb.caixa(0.36, P, 0.17, y=-0.07, z=0.35, cor=cor, bisel=0.025))
    it.add(cima)
    baixo = mb.caixa(0.44, P - 0.02, 0.17, z=0.15, cor=cor_base, bisel=0.03)
    subtrai(baixo, mb.caixa(0.37, P, 0.125, y=-0.08, z=0.172, cor=cor_base, bisel=0.008))
    it.add(baixo)
    f = mb.extrudado(_ccw(ret_xz(0.39, 0.158, 0.31, 0.012, 0.065, seg=8)), 0.026, y=-P / 2 - 0.02, cor=cor_gav,
                     bisel=0.01, plano="xz")
    pux = mb.puxador("bola", y=-P / 2 - 0.02, z=0.225, cor=cor_pux, tam=1.5)
    it.gaveta(0.33, P - 0.1, 0.09, [f, pux], y_frente=-P / 2 + 0.006, z=0.18, cor="bege")
    it.add(mb.quatro_pes("palito", 0.36, 0.28, 0.18, cor_base, r=0.028, recuo=0.03, abre=11))
    it.slot("nicho", (0, -0.01, 0.35), (0.34, 0.28, 0.16))
    tampo(it, 0.58, 0.34, 0.26)


def criado_cilindro(it, cor, cor_porta, cor_pe, cor_pux):
    """Criado cilíndrico com porta curva (um gomo da parede que gira na borda), tampa saliente e pés palito."""
    R, t = 0.22, 0.03
    z0, z1 = 0.18, 0.58
    it.add(setor_anel(R, R - t, -34.5, 214.5, z1 - z0 - 0.02, z=z0, cor=cor, n=40))
    it.add(mb.cilindro(R - 0.002, 0.032, z=z0, cor=cor, seg=40, bisel=0.01))
    it.add(mb.cilindro(R + 0.014, 0.042, z=z1 - 0.03, cor=cor, seg=40, bisel=0.016))
    it.add(mb.cilindro(R - t - 0.004, 0.02, z=0.37, cor=cor, seg=36, bisel=0.004))
    porta = setor_anel(R, R - t, -144.0, -36.0, z1 - 0.03 - z0 - 0.032 - 0.006, z=z0 + 0.035, cor=cor_porta, n=24)
    pux = mb.puxador("bola", x=0, y=-R, z=0.39, cor=cor_pux, tam=1.5)
    a0 = math.radians(-144.0)
    it.porta([porta, pux], dobradica=(R * math.cos(a0), R * math.sin(a0), 0), lado="esq", abre_graus=100)
    it.add(mb.quatro_pes("palito", 0.27, 0.27, z0 + 0.025, cor_pe, r=0.026, recuo=0.0, abre=10))
    it.slot("dentro_baixo", (0, 0, z0 + 0.032), (0.26, 0.26, 0.15))
    it.slot("dentro_cima", (0, 0, 0.39), (0.26, 0.26, 0.14))
    tampo(it, z1 + 0.012, 0.3, 0.3)


def criado_cubo_nicho(it, cor, cor_dentro, cor_gav, cor_pux, cor_pe):
    """Criado cubo gordinho: nicho com prateleira em cima e gaveta embaixo, pezinhos cônicos."""
    W, P, z0, H = 0.48, 0.42, 0.07, 0.46
    corpo = mb.caixa(W, P, H, z=z0, cor=cor, bisel=0.065, seg=4)
    subtrai(corpo, mb.caixa(0.38, P, 0.36, y=-0.07, z=z0 + 0.05, cor=cor_dentro, bisel=0.02))
    it.add(corpo)
    zs = z0 + 0.05 + 0.17
    it.add(mb.caixa(0.384, P - 0.07, 0.02, y=-0.025, z=zs, cor=cor_dentro, bisel=0.005, seg=2))
    fr = frente_em(0.37, 0.16, -P / 2 + 0.03, z0 + 0.053, estilo="lisa", cor=cor_gav, cor_pux=cor_pux, bisel=0.014)
    it.gaveta(0.34, 0.28, 0.12, fr, y_frente=-P / 2 + 0.03, z=z0 + 0.06, cor="bege")
    it.add(mb.quatro_pes("conico", W - 0.06, P - 0.06, z0 + 0.012, cor_pe, r=0.03, recuo=0.05))
    it.slot("nicho", (0, -0.02, zs + 0.02), (0.34, 0.3, z0 + 0.05 + 0.36 - zs - 0.03))
    tampo(it, z0 + H, 0.36, 0.3)


def criado_capsula_gaveta(it, cor, cor_gav, cor_pe, cor_pux):
    """Criado de frente redonda (D visto de cima) com a gaveta em faixa contornando a frente e pés retos."""
    W, P, z0, H = 0.48, 0.4, 0.18, 0.4
    plano = ret_xz(W, -P / 2, P / 2, 0.04, 0.17, seg=8)
    corpo = mb.extrudado(_ccw(plano), H, z=z0, cor=cor, bisel=0.04, seg=3)
    za, zb_ = z0 + 0.12, z0 + 0.27
    yc = -P / 2 + 0.075
    subtrai(corpo, mb.caixa(0.8, 0.3, zb_ - za, y=yc - 0.15, z=za, cor=cor, bisel=0.0),
            mb.caixa(0.36, 0.3, zb_ - za - 0.03, y=yc + 0.15 - 0.002, z=za + 0.015, cor=cor, bisel=0.01))
    it.add(corpo)
    faixa = mb.extrudado(_ccw(plano), zb_ - za - 0.008, z=za + 0.004, cor=cor_gav, bisel=0.012, seg=2)
    intersecta(faixa, mb.caixa(0.8, 0.3, 0.4, y=yc - 0.002 - 0.15, z=za - 0.1, cor=cor_gav, bisel=0.0))
    pux = mb.puxador("bola", y=-P / 2, z=(za + zb_) / 2, cor=cor_pux, tam=1.5)
    it.gaveta(0.33, 0.25, 0.1, [faixa, pux], y_frente=yc - 0.002, z=za + 0.02, cor="bege")
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.add(mb.cilindro(0.03, z0 + 0.03, x=sx * 0.15, y=sy * 0.11, cor=cor_pe, seg=16, bisel=0.012))
    tampo(it, z0 + H, 0.34, 0.28)


def criado_pacote_ns02(it):
    """Nightstand_02 do pacote: a frente do pacote ganha a caixa da gaveta (a do pacote era um bloco maciço)."""
    pc = mb.importa_pacote("Nightstand_02")
    it.add(pc.pop("corpo"))
    ob = pc.pop("Door")
    for o in pc.values():
        bpy.data.objects.remove(o)
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    # tira o bloco maciço (a parte que vai mais fundo que a frente)
    vistos, partes = set(), []
    bm.verts.ensure_lookup_table()
    for v in bm.verts:
        if v.index in vistos:
            continue
        pilha, comp = [v], []
        vistos.add(v.index)
        while pilha:
            w_ = pilha.pop()
            comp.append(w_)
            for e in w_.link_edges:
                o2 = e.other_vert(w_)
                if o2.index not in vistos:
                    vistos.add(o2.index)
                    pilha.append(o2)
        partes.append(comp)
    fora = [v for comp in partes if max(w_.co.y for w_ in comp) > -0.2 for v in comp]
    bmesh.ops.delete(bm, geom=fora, context="VERTS")
    bm.to_mesh(ob.data)
    bm.free()
    it.gaveta(0.31, 0.27, 0.1, [ob], y_frente=-0.377, z=0.368, cor="bege")
    tampo(it, 0.572, 0.42, 0.32, y=-0.2)


K = "criados"
reg(K, "criado_gaveta_palito_marrom_pacote", criado_pacote_ns02, "Criado-mudo com gaveta e pés palito (pacote)",
    "gaveta_palito_pacote", ["gaveta", "pes_palito", "pacote"], pacote=True)
reg(K, "criado_painel_nogueira", lambda it: criado_painel(it, "nogueira", "creme", "terracota"),
    "Criado-mudo de laterais cheias (nogueira)", "painel", ["gaveta", "prateleira", "madeira"])
reg(K, "criado_painel_branco", lambda it: criado_painel(it, "branco", "madeira_clara", "madeira"),
    "Criado-mudo de laterais cheias (branco)", "painel", ["gaveta", "prateleira"])
reg(K, "criado_banqueta_verde", lambda it: criado_banqueta(it, "verde", "verde_medio"),
    "Banquinho de cabeceira (verde)", "banqueta", ["banco", "pes"])
reg(K, "criado_banqueta_azul", lambda it: criado_banqueta(it, "azul_celeste", "azul"),
    "Banquinho de cabeceira (azul)", "banqueta", ["banco", "pes"])
reg(K, "criado_oval_turquesa", lambda it: criado_oval(it, "turquesa", "rosa", "amarelo", "amarelo"),
    "Criado-mudo oval com pés palito (turquesa)", "oval", ["gaveta", "pes_palito", "arredondado"])
reg(K, "criado_oval_amarelo", lambda it: criado_oval(it, "amarelo", "azul_celeste", "madeira_clara", "branco"),
    "Criado-mudo oval com pés palito (amarelo)", "oval", ["gaveta", "pes_palito", "arredondado"])
reg(K, "criado_arco_gaveta_verde", lambda it: criado_arco_gaveta(it, "verde_lima", "amarelo", "verde"),
    "Criado-mudo em arco com gaveta (verde)", "arco_gaveta", ["gaveta", "nicho", "arredondado"])
reg(K, "criado_arco_gaveta_rosa", lambda it: criado_arco_gaveta(it, "rosa", "branco", "rosa_escuro"),
    "Criado-mudo em arco com gaveta (rosa)", "arco_gaveta", ["gaveta", "nicho", "arredondado"])
reg(K, "criado_arco_porta_amarelo", lambda it: criado_arco_porta(it, "amarelo", "azul_celeste", "laranja_claro",
                                                                  "amarelo_escuro"),
    "Criado-mudo em arco com porta (amarelo)", "arco_porta", ["porta", "nicho", "arredondado"])
reg(K, "criado_arco_porta_menta", lambda it: criado_arco_porta(it, "menta", "rosa", "verde_agua", "rosa_escuro"),
    "Criado-mudo em arco com porta (menta)", "arco_porta", ["porta", "nicho", "arredondado"])
reg(K, "criado_basculante_marrom", lambda it: criado_basculante(it, "marrom_claro", "creme", "marrom", "terracota"),
    "Criado-mudo com cesto basculante (marrom)", "basculante", ["cesto", "pes_torneados"])
reg(K, "criado_basculante_azul", lambda it: criado_basculante(it, "azul_acinzentado", "branco", "branco", "azul"),
    "Criado-mudo com cesto basculante (azul)", "basculante", ["cesto", "pes_torneados"])
reg(K, "criado_cavalete_laranja", lambda it: criado_cavalete(it, "laranja_claro", "laranja_claro"),
    "Mesinha de cabeceira cavalete (laranja)", "cavalete", ["prateleira", "aberto"])
reg(K, "criado_cavalete_branco", lambda it: criado_cavalete(it, "branco", "madeira_clara"),
    "Mesinha de cabeceira cavalete (branca)", "cavalete", ["prateleira", "aberto"])
reg(K, "criado_retro_laranja", lambda it: criado_retro(it, "laranja", "azul_celeste", "azul_celeste", "laranja"),
    "Criado-mudo retrô de duas gavetas (laranja)", "retro", ["gavetas", "pes_palito", "arredondado"])
reg(K, "criado_retro_verde", lambda it: criado_retro(it, "verde_agua", "rosa", "rosa", "amarelo"),
    "Criado-mudo retrô de duas gavetas (verde-água)", "retro", ["gavetas", "pes_palito", "arredondado"])
reg(K, "criado_classico_verde", lambda it: criado_classico(it, "verde_claro", "amarelo", "verde"),
    "Criado-mudo clássico de duas gavetas (verde)", "classico", ["gavetas", "pes_bola", "classico"])
reg(K, "criado_classico_branco", lambda it: criado_classico(it, "branco", "rosa_claro", "ouro"),
    "Criado-mudo clássico de duas gavetas (branco)", "classico", ["gavetas", "pes_bola", "classico"])
reg(K, "criado_gavetao_laranja", lambda it: criado_gavetao(it, "laranja_claro", "azul_celeste", "pinus", "amarelo"),
    "Criado-mudo de gavetão (laranja)", "gavetao", ["gaveta", "pes"])
reg(K, "criado_gavetao_rosa", lambda it: criado_gavetao(it, "rosa_bebe", "verde_lima", "branco", "branco"),
    "Criado-mudo de gavetão (rosa)", "gavetao", ["gaveta", "pes"])
reg(K, "criado_nicho_gaveta_branco", lambda it: criado_nicho_gaveta(it, "branco", "marrom", "marrom", "amarelo"),
    "Criado-mudo com nicho e gaveta (branco)", "nicho_gaveta", ["gaveta", "nicho", "pes_bola"])
reg(K, "criado_nicho_gaveta_azul", lambda it: criado_nicho_gaveta(it, "azul_claro", "madeira_mel", "madeira_mel",
                                                                   "branco"),
    "Criado-mudo com nicho e gaveta (azul)", "nicho_gaveta", ["gaveta", "nicho", "pes_bola"])
reg(K, "criado_dois_andares_laranja", lambda it: criado_dois_andares(it, "laranja_claro", "laranja"),
    "Mesinha de cabeceira de dois andares (laranja)", "dois_andares", ["prateleira", "aberto"])
reg(K, "criado_capsula_nicho_laranja", lambda it: criado_capsula_nicho(it, "laranja", "laranja_escuro", "laranja"),
    "Criado-mudo cápsula com nicho (laranja)", "capsula_nicho", ["nicho", "arredondado"])
reg(K, "criado_capsula_nicho_lilas", lambda it: criado_capsula_nicho(it, "lilas", "roxo", "lilas"),
    "Criado-mudo cápsula com nicho (lilás)", "capsula_nicho", ["nicho", "arredondado"])
reg(K, "criado_bicolor_pessego", lambda it: criado_bicolor(it, "laranja_claro", "madeira_rosada", "creme_claro",
                                                            "madeira_media"),
    "Criado-mudo de duas cores (pêssego)", "bicolor", ["gaveta", "nicho", "pes_palito"])
reg(K, "criado_bicolor_menta", lambda it: criado_bicolor(it, "menta", "verde_medio", "creme_claro", "verde_escuro"),
    "Criado-mudo de duas cores (menta)", "bicolor", ["gaveta", "nicho", "pes_palito"])
reg(K, "criado_cilindro_verde", lambda it: criado_cilindro(it, "verde_lima", "verde_claro", "verde_claro", "verde"),
    "Criado-mudo cilíndrico com porta curva (verde)", "cilindro", ["porta", "pes_palito", "redondo"])
reg(K, "criado_cilindro_rosa", lambda it: criado_cilindro(it, "rosa_bebe", "rosa", "branco", "branco"),
    "Criado-mudo cilíndrico com porta curva (rosa)", "cilindro", ["porta", "pes_palito", "redondo"])
reg(K, "criado_cubo_nicho_amarelo", lambda it: criado_cubo_nicho(it, "amarelo_escuro", "mostarda", "madeira_media",
                                                                  "laranja_claro", "madeira_media"),
    "Criado-mudo cubo com nicho e gaveta (amarelo)", "cubo_nicho", ["gaveta", "nicho"])
reg(K, "criado_cubo_nicho_azul", lambda it: criado_cubo_nicho(it, "azul_celeste", "azul", "branco", "azul",
                                                               "branco"),
    "Criado-mudo cubo com nicho e gaveta (azul)", "cubo_nicho", ["gaveta", "nicho"])
reg(K, "criado_capsula_gaveta_petroleo", lambda it: criado_capsula_gaveta(it, "turquesa_escuro", "verde_lima",
                                                                          "verde_lima", "turquesa_escuro"),
    "Criado-mudo de frente redonda (petróleo)", "capsula_gaveta", ["gaveta", "arredondado"])
reg(K, "criado_capsula_gaveta_roxo", lambda it: criado_capsula_gaveta(it, "roxo", "amarelo", "amarelo", "roxo"),
    "Criado-mudo de frente redonda (roxo)", "capsula_gaveta", ["gaveta", "arredondado"])


# =====================================================================================================================
# Execução
# =====================================================================================================================
def main():
    cats = {}
    feitos = 0
    for r in REG:
        if FILTRO and not (r["cat"] in FILTRO or r["id"] in FILTRO):
            continue
        if r["cat"] not in cats:
            cats[r["cat"]] = mb.Catalogo(r["cat"], SAIDA, {"camas": "Camas", "criados": "Criados-mudos"}[r["cat"]])
        mb.limpa()
        it = mb.Item(r["id"])
        r["fn"](it)
        centraliza(it)
        cats[r["cat"]].exporta(it, r["rotulo"], grupo=r["grupo"], tags=r["tags"], pacote=r["pacote"])
        feitos += 1
    # catálogo: só os ids registrados, na ordem do registro
    for nome in ("camas", "criados"):
        if nome not in cats:
            if os.path.exists(os.path.join(SAIDA, nome, "catalogo.json")):
                cats[nome] = mb.Catalogo(nome, SAIDA, {"camas": "Camas", "criados": "Criados-mudos"}[nome])
            else:
                continue
        ordem = [r["id"] for r in REG if r["cat"] == nome]
        itens = {x["id"]: x for x in cats[nome].dados["itens"]}
        cats[nome].dados["itens"] = [itens[i] for i in ordem if i in itens]
        cats[nome].salva()
    print("feitos", feitos, flush=True)


main()
