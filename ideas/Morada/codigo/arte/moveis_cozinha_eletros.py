"""Morada: eletrodomésticos e utensílios da cozinha (categoria cozinha_eletros).

Uso (numa sessão só do Blender, como manda o GUIA_MOVEIS.md):
    blender-venv/bin/python -I morada-art/moveis_cozinha_eletros.py -- <saida> [ids]
ids (opcional): lista separada por vírgula; aceita prefixo com * (ex.: "geladeira*,micro_ondas_rosa").
Sem ids, refaz a categoria inteira e tira do catálogo o que não existe mais.
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
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
SAIDA = ARGS[0] if ARGS else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "moveis_out")
FILTRO = [s for s in ARGS[1].split(",") if s] if len(ARGS) > 1 else None
CAT = "cozinha_eletros"


# =====================================================================================================================
# Ferramentas próprias (a base não tem estas)
# =====================================================================================================================
def _mapa(abre, x, y, z):
    """Matriz do quadro local (u, v, w) do casco para o mundo. w = profundidade a partir da boca."""
    if abre == "frente":  # boca em y (plano da frente), fundo para +Y; u → x, v → z
        return lambda u, v, w: V((x + u, y + w, z + v))
    if abre == "cima":  # boca em z (topo), fundo para baixo; u → x, v → y
        return lambda u, v, w: V((x + u, y + v, z - w))
    if abre == "baixo":
        return lambda u, v, w: V((x + u, y + v, z + w))
    raise ValueError(abre)


def casco(ext, intr, prof, fundo, x=0.0, y=0.0, z=0.0, abre="frente", cor="branco", bisel=0.02, bisel_boca=0.004,
          vazado=False, nome="casco", seg=3, cor_dentro=None):
    """Corpo oco de verdade (geladeira, micro-ondas, forno, bandeja): contorno de fora `ext` e da boca `intr` (listas 2D
    com o mesmo número de pontos, na mesma ordem: use ret_arredondado com o mesmo seg), profundidade `prof` e fundo
    `fundo`. abre="frente": contorno no plano XZ (u = x, v = z a partir de z), boca em y indo para +Y. abre="cima":
    contorno no plano XY, boca no topo z indo para baixo. vazado=True: furo passante (tábua com furo, aro)."""
    f = _mapa(abre, x, y, z)
    bm = bmesh.new()
    n = len(ext)
    assert n == len(intr)
    o0 = [bm.verts.new(f(u, v, 0)) for u, v in ext]
    o1 = [bm.verts.new(f(u, v, prof)) for u, v in ext]
    i0 = [bm.verts.new(f(u, v, 0)) for u, v in intr]
    i1 = [bm.verts.new(f(u, v, prof if vazado else prof - fundo)) for u, v in intr]
    for k in range(n):
        j = (k + 1) % n
        bm.faces.new((o0[k], o0[j], o1[j], o1[k]))
        bm.faces.new((o0[k], i0[k], i0[j], o0[j]))
        bm.faces.new((i0[k], i1[k], i1[j], i0[j]))
        if vazado:
            bm.faces.new((o1[k], o1[j], i1[j], i1[k]))
    if not vazado:
        tampas = [bm.faces.new(i1), bm.faces.new(o1)]
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        bmesh.ops.triangulate(bm, faces=tampas, quad_method="BEAUTY", ngon_method="BEAUTY")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    s0, s1, si0 = set(o0), set(o1), set(i0)
    so_vaz = set(i1) if vazado else set()
    fora = set(e for e in bm.edges if (e.verts[0] in s0 and e.verts[1] in s0) or
               (e.verts[0] in s1 and e.verts[1] in s1))
    boca = [e for e in bm.edges if (e.verts[0] in si0 and e.verts[1] in si0) or
            (e.verts[0] in so_vaz and e.verts[1] in so_vaz)]
    if bisel_boca > 0:
        mb._bevel(bm, bisel_boca, 2, boca)
    if bisel > 0:
        mb._bevel(bm, bisel, seg, [e for e in bm.edges if e.is_valid and e in fora])
    ob = mb._obj(nome, bm, cor)
    if cor_dentro and not vazado:
        # pinta o vão por dentro: faces atrás da boca, antes do fundo, dentro do contorno da boca
        cx = sum(u for u, _ in intr) / n
        cy = sum(v for _, v in intr) / n
        poli = []
        for u, v in intr:
            d = V((u - cx, v - cy))
            poli.append((u + d.normalized().x * 0.003, v + d.normalized().y * 0.003) if d.length else (u, v))

        def local(c):
            if abre == "frente":
                return c.x - x, c.z - z, c.y - y
            if abre == "cima":
                return c.x - x, c.y - y, z - c.z
            return c.x - x, c.y - y, c.z - z

        def teste(c, nrm):
            u, v, w = local(c)
            return 0.0006 < w < prof - fundo + 0.0012 and _dentro(u, v, poli)
        mb.pinta_onde(ob, cor_dentro, teste)
    return ob


def _dentro(u, v, poli):
    ok = False
    n = len(poli)
    for k in range(n):
        (x1, y1), (x2, y2) = poli[k], poli[(k + 1) % n]
        if (y1 > v) != (y2 > v) and u < x1 + (v - y1) * (x2 - x1) / (y2 - y1):
            ok = not ok
    return ok


def rr(l, a, r, seg=5):
    return mb.ret_arredondado(l, a, r, seg)


def rr2(l, a, rt, rb, seg=8):
    """Retângulo com cantos de cima (rt) e de baixo (rb) diferentes."""
    pts = []
    for cx, cz, r, a0 in ((l / 2 - rt, a / 2 - rt, rt, 0), (-l / 2 + rt, a / 2 - rt, rt, 90),
                          (-l / 2 + rb, -a / 2 + rb, rb, 180), (l / 2 - rb, -a / 2 + rb, rb, 270)):
        for k in range(seg + 1):
            t = math.radians(a0 + 90 * k / seg)
            pts.append((cx + r * math.cos(t), cz + r * math.sin(t)))
    return pts


def rr_off(l, a, r, du=0.0, dv=0.0, seg=5):
    return [(u + du, v + dv) for u, v in mb.ret_arredondado(l, a, r, seg)]


def placa(l, a, esp, r, x=0.0, y=0.0, z=0.0, cor="branco", bisel=None, nome="placa"):
    """Placa de cantos redondos em pé no plano XZ (porta): x centrado, z da base, face da frente em y, espessura para
    +Y (y até y + esp)."""
    b = min(esp * 0.45, 0.02) if bisel is None else bisel
    return mb.extrudado(rr(l, a, r), esp, x=x, y=y, z=z + a / 2, cor=cor, bisel=b, plano="xz", nome=nome)


def placa_deitada(l, p, esp, r, x=0.0, y=0.0, z=0.0, cor="branco", bisel=None, nome="placa"):
    b = min(esp * 0.45, 0.02) if bisel is None else bisel
    return mb.extrudado(rr(l, p, r), esp, x=x, y=y, z=z, cor=cor, bisel=b, nome=nome)


def bandeja(l, p, a, esp, r, x=0.0, y=0.0, z=0.0, cor="branco", bisel=None, nome="bandeja", seg_canto=5, seg=3):
    """Caixinha aberta em cima (prateleira de porta, cesto, bandeja). Base em z."""
    r = min(r, l / 2 - 0.002, p / 2 - 0.002)
    ri = max(0.002, r - esp)
    return casco(rr(l, p, r, seg_canto), rr(l - 2 * esp, p - 2 * esp, ri, seg_canto), a, esp, x=x, y=y, z=z + a,
                 abre="cima", cor=cor, bisel=min(esp * 0.45, 0.008) if bisel is None else bisel,
                 bisel_boca=min(esp * 0.3, 0.003), nome=nome, seg=seg)


def loft(secoes, cor="branco", bisel=0.0, seg=2, nome="loft", angulo=40):
    """Sólido ligando contornos 2D (mesmo número de pontos) em alturas diferentes: [(pts, z), ...] de baixo para cima.
    Os pontos podem ser deslocados em y no próprio contorno (coifa encostada na parede)."""
    bm = bmesh.new()
    aneis = [[bm.verts.new((u, v, zz)) for u, v in pts] for pts, zz in secoes]
    n = len(aneis[0])
    for a_, b_ in zip(aneis, aneis[1:]):
        for k in range(n):
            j = (k + 1) % n
            bm.faces.new((a_[k], a_[j], b_[j], b_[k]))
    tampas = [bm.faces.new(aneis[0]), bm.faces.new(aneis[-1])]
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bmesh.ops.triangulate(bm, faces=tampas, quad_method="BEAUTY", ngon_method="BEAUTY")
    if bisel > 0:
        es = [e for e in bm.edges if len(e.link_faces) == 2 and
              e.link_faces[0].normal.dot(e.link_faces[1].normal) < 0.8]
        mb._bevel(bm, bisel, seg, es)
    return mb._obj(nome, bm, cor, angulo=angulo)


def vaso(ext, esp, x=0.0, y=0.0, z=0.0, cor="branco", fundo=None, seg=32, nome="vaso", angulo=48, esc=(1, 1),
         labio=True, mat="atlas"):
    """Peça de torno oca (caneca, tigela, panela, pote, copo): ext = perfil de fora [(raio, altura)] de (0, 0) até a
    boca. Calcula a parede de dentro com espessura esp e fecha a boca com um lábio redondo."""
    fundo = esp if fundo is None else fundo
    p = [V(q) for q in ext]
    dentro = []
    for i in range(1, len(p)):
        t1 = (p[i] - p[i - 1]).normalized()
        t2 = (p[i + 1] - p[i]).normalized() if i + 1 < len(p) else t1
        n1 = V((-t1.y, t1.x))
        n2 = V((-t2.y, t2.x))
        nn = (n1 + n2)
        nn = nn.normalized() if nn.length > 1e-6 else n1
        k = esp / max(0.35, nn.dot(n1))
        q = p[i] + nn * k
        if i == 1:
            q.y = max(q.y, fundo)
        dentro.append(q)
    dentro[0] = V((max(0.0, dentro[0].x), fundo))
    perfil = [tuple(q) for q in p]
    if labio:
        mid = (p[-1] + dentro[-1]) / 2 + V((0, esp * 0.45))
        perfil.append(tuple(mid))
    perfil += [tuple(q) for q in reversed(dentro)] + [(0.0, fundo)]
    perfil = [(max(0.0, r), h) for r, h in perfil]
    return mb.torno(perfil, x=x, y=y, z=z, cor=None if mat != "atlas" else cor, seg=seg, nome=nome, angulo=angulo,
                    esc=esc, mat=mat)


def placa_furada(ext, furos, esp, x=0.0, y=0.0, z=0.0, cor="branco", bisel=0.006, seg=2, nome="placa_furada"):
    """Placa deitada (contorno ext no plano XY, espessura esp para cima a partir de z) com furos passantes."""
    from mathutils.geometry import tessellate_polygon
    loops = [list(ext)] + [list(f) for f in furos]
    bm = bmesh.new()
    vb, vt = [], []
    for lp in loops:
        vb.append([bm.verts.new((u + x, v + y, z)) for u, v in lp])
        vt.append([bm.verts.new((u + x, v + y, z + esp)) for u, v in lp])
    plano = [b for lp in vb for b in lp]
    topo = [t for lp in vt for t in lp]
    tris = tessellate_polygon([[V((u, v, 0)) for u, v in lp] for lp in loops])
    for a_, b_, c_ in tris:
        bm.faces.new((topo[a_], topo[b_], topo[c_]))
        bm.faces.new((plano[c_], plano[b_], plano[a_]))
    for lb, lt in zip(vb, vt):
        n = len(lb)
        for k in range(n):
            j = (k + 1) % n
            bm.faces.new((lb[k], lb[j], lt[j], lt[k]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-7)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    sb, st = set(plano), set(topo)
    bordas = [e for e in bm.edges if (e.verts[0] in sb and e.verts[1] in sb) or (e.verts[0] in st and e.verts[1] in st)]
    bordas = [e for e in bordas if len(e.link_faces) == 2 and e.link_faces[0].normal.dot(e.link_faces[1].normal) < 0.5]
    mb._bevel(bm, bisel, seg, bordas)
    return mb._obj(nome, bm, cor)


def subtrai(ob, cortes):
    """Booleana (diferença) com cortadores; as faces do corte ficam com a cor do cortador."""
    cortes = cortes if isinstance(cortes, (list, tuple)) else [cortes]
    for c in cortes:
        m = ob.modifiers.new("b", "BOOLEAN")
        m.operation = "DIFFERENCE"
        m.solver = "EXACT"
        m.object = c
        c.hide_render = True
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    velho = ob.data
    ob.modifiers.clear()
    ob.data = me
    if velho.users == 0:
        bpy.data.meshes.remove(velho)
    for c in cortes:
        m = c.data
        bpy.data.objects.remove(c)
        if m.users == 0:
            bpy.data.meshes.remove(m)
    return ob


def barra(x, y, z0, z1, d=0.035, r=0.011, cor="cromo", nome="barra"):
    """Puxador de barra vertical de geladeira, saindo do plano y para −Y."""
    return mb.tubo([(x, y + 0.003, z0), (x, y - d, z0), (x, y - d, z1), (x, y + 0.003, z1)], r, cor=cor,
                   raio_curva=min(0.03, (z1 - z0) / 4), nome=nome)


def barra_h(x0, x1, y, z, d=0.03, r=0.009, cor="cromo", nome="barra"):
    return mb.tubo([(x0, y + 0.003, z), (x0, y - d, z), (x1, y - d, z), (x1, y + 0.003, z)], r, cor=cor,
                   raio_curva=min(0.025, abs(x1 - x0) / 4), nome=nome)


def alavanca(x, y, z, sx=1, cor="rosa", tam=1.0, nome="alavanca"):
    """Puxador retrô em alavanca curva (geladeira antiga), saindo do plano y; sx = para que lado a ponta vai."""
    s = tam
    base = mb.superelipsoide(0.045 * s, 0.024 * s, 0.05 * s, x=x, y=y - 0.008 * s, z=z - 0.025 * s, cor=cor, e=0.6,
                             nu=16, nv=8)
    br = mb.tubo([(x, y - 0.015 * s, z), (x, y - 0.045 * s, z + 0.004 * s), (x + sx * 0.06 * s, y - 0.05 * s,
                                                                          z + 0.012 * s),
                  (x + sx * 0.1 * s, y - 0.045 * s, z + 0.02 * s)], 0.011 * s, cor=cor, raio_curva=0.03 * s)
    ponta = mb.esfera(0.015 * s, x=x + sx * 0.1 * s, y=y - 0.045 * s, z=z + 0.02 * s, cor=cor, seg=12)
    return mb.junta([base, br, ponta], nome)


def botao(x, y, z, r=0.01, cor="branco", prof=0.008, eixo="y", nome="botao"):
    """Botão redondo saindo do plano y para −Y (ou do plano z para cima, eixo "z")."""
    if eixo == "y":
        return mb.cilindro(r, prof, x=x, y=y - prof / 2 + 0.001, z=z, cor=cor, eixo="y", seg=14,
                           bisel=min(r * 0.35, prof * 0.4), nome=nome)
    return mb.cilindro(r, prof, x=x, y=y, z=z - 0.001, cor=cor, seg=14, bisel=min(r * 0.35, prof * 0.4), nome=nome)


def botao_giro(x, y, z, r=0.02, cor="branco", cor2=None, nome="botao_giro"):
    """Botão de girar (forno, micro-ondas antigo): disco com ressalto e marca."""
    d = mb.cilindro(r, 0.014, x=x, y=y - 0.006, z=z, cor=cor, eixo="y", seg=20, bisel=0.004)
    m = mb.caixa(r * 0.35, 0.01, r * 1.5, x=x, y=y - 0.016, z=z - r * 0.75, cor=cor2 or cor, bisel=0.002)
    return mb.junta([d, m], nome)


def aro_frente(l, a, r, larg, esp, x=0.0, y=0.0, z=0.0, cor="cinza_claro", nome="aro"):
    """Moldura plana de cantos redondos no plano XZ (borracha de vedação, moldura de visor). Face da frente em y."""
    return casco(rr(l, a, r), rr(l - 2 * larg, a - 2 * larg, max(0.002, r - larg)), esp, 0, x=x, y=y, z=z + a / 2,
                 abre="frente", cor=cor, bisel=min(esp * 0.4, 0.004), bisel_boca=min(esp * 0.3, 0.002), vazado=True,
                 nome=nome)


def anel(r_ext, r_int, a, x=0.0, y=0.0, z=0.0, cor="cromo", seg=32, nome="anel"):
    pts_e = mb.circulo(r_ext, seg)
    pts_i = mb.circulo(r_int, seg)
    return casco(pts_e, pts_i, a, 0, x=x, y=y, z=z + a, abre="cima", cor=cor, bisel=min(a * 0.4, 0.003),
                 bisel_boca=min(a * 0.3, 0.002), vazado=True, nome=nome)


def toro(R, r, x=0.0, y=0.0, z=0.0, cor="cromo", seg=28, seg2=10, eixo="z", nome="toro"):
    bm = bmesh.new()
    an = []
    for i in range(seg):
        t = 2 * math.pi * i / seg
        an.append([bm.verts.new(((R + r * math.cos(s)) * math.cos(t), (R + r * math.cos(s)) * math.sin(t),
                                 r * math.sin(s))) for s in (2 * math.pi * j / seg2 for j in range(seg2))])
    for i in range(seg):
        for j in range(seg2):
            a_, b_ = an[i], an[(i + 1) % seg]
            bm.faces.new((a_[j], b_[j], b_[(j + 1) % seg2], a_[(j + 1) % seg2]))
    M = Matrix.Translation((x, y, z))
    if eixo == "x":
        M = M @ Matrix.Rotation(math.pi / 2, 4, "Y")
    elif eixo == "y":
        M = M @ Matrix.Rotation(math.pi / 2, 4, "X")
    bm.transform(M)
    return mb._obj(nome, bm, cor, angulo=80)


def alca_arco(x, y, z, larg, alt, r=0.008, plano="xz", cor="preto", nome="alca"):
    """Alça em arco (chaleira, cesto): de (x − larg/2, z) a (x + larg/2, z) subindo alt. plano xz ou yz."""
    pts = []
    n = 14
    for k in range(n + 1):
        t = math.pi * k / n
        du, dz = -math.cos(t) * larg / 2, math.sin(t) * alt
        pts.append((x + du, y, z + dz) if plano == "xz" else (x, y + du, z + dz))
    return mb.tubo(pts, r, cor=cor, raio_curva=0.0, nome=nome)


def alca_caneca(x, y, z0, z1, d, r=0.007, cor="branco", lado=1, nome="alca"):
    """Alça de caneca/jarra no plano XZ, presa no corpo em x (lado +1 = direita)."""
    h = z1 - z0
    pts = [(x - lado * 0.004, y, z1), (x + lado * d * 0.6, y, z1 + h * 0.02), (x + lado * d, y, z1 - h * 0.2),
           (x + lado * d, y, z0 + h * 0.25), (x + lado * d * 0.6, y, z0), (x - lado * 0.004, y, z0)]
    return mb.tubo(pts, r, cor=cor, raio_curva=min(d * 0.45, h * 0.3), nome=nome)


def pes_bola(l, p, a, cor, r, recuo, z=0.0):
    return mb.quatro_pes("bola", l, p, a, cor, r=r, recuo=recuo, z=z)


# =====================================================================================================================
# Registro das peças
# =====================================================================================================================
PECAS = []  # (id, função, kwargs)


def reg(id_, fn, **kw):
    PECAS.append((id_, fn, kw))


def quer(id_):
    if FILTRO is None:
        return True
    for f in FILTRO:
        if f.endswith("*") and id_.startswith(f[:-1]):
            return True
        if f == id_:
            return True
    return False


# =====================================================================================================================
# Geladeiras
# =====================================================================================================================
def _porta_refri(it, x0, x1, z0, z1, yb, esp, cor, r, lado, nome, bins=(), cor_bin="azul_celeste", gaxeta=None,
                 extras=(), bin_p=0.07, bin_x=None, contorno=None):
    """Porta de geladeira de x0 a x1 e de z0 a z1, encostada no plano da boca yb (a porta fica em y < yb).
    bins: alturas (z da base) das prateleiras de porta, que ficam presas na porta (dentro do corpo quando fechada) e
    ganham um slot cada. bin_x = (xa, xb) limita as prateleiras ao vão da boca."""
    yf = yb - 0.002 - esp
    l, a = x1 - x0, z1 - z0
    xc = (x0 + x1) / 2
    if contorno:
        objs = [mb.extrudado(contorno, esp, x=xc, y=yf, z=z0 + a / 2, cor=cor, bisel=min(esp * 0.42, 0.022),
                             plano="xz", nome="folha")]
    else:
        objs = [placa(l, a, esp, r, x=xc, y=yf, z=z0, cor=cor, bisel=min(esp * 0.46, 0.03), nome="folha")]
    if gaxeta:
        objs.append(aro_frente(l - 0.03, a - 0.03, max(0.01, r - 0.015), 0.022, 0.006, x=xc, y=yb - 0.0075,
                               z=z0 + 0.015, cor=gaxeta))
    xa, xb = bin_x if bin_x else (x0 + 0.05, x1 - 0.05)
    bl = xb - xa
    for k, zb in enumerate(bins):
        objs.append(bandeja(bl, bin_p, 0.075, 0.008, 0.012, x=(xa + xb) / 2, y=yb + bin_p / 2 - 0.004, z=zb,
                            cor=cor_bin, nome=f"bin{k}", seg_canto=2, seg=2))
        it.slot(f"{nome}_prateleira_{k + 1}", ((xa + xb) / 2, yb + bin_p / 2 - 0.004, zb + 0.008),
                (bl - 0.02, bin_p - 0.02, 0.12), pai=nome)
    objs += list(extras)
    xp = x0 if lado == "esq" else x1
    return it.porta(objs, dobradica=(xp, yb - 0.002 - esp / 2, 0), lado=lado, nome=nome)


def _prateleiras(it, x0, x1, y0, y1, zs, cor, topo, nome, vidro=True, borda=None):
    """Prateleiras internas (vidro com borda colorida na frente) em zs; um slot para cada vão até a próxima/topo."""
    l = x1 - x0
    xc, yc = (x0 + x1) / 2, (y0 + y1) / 2
    for k, zp in enumerate(zs):
        if vidro:
            it.add(mb.caixa(l - 0.004, y1 - y0, 0.008, x=xc, y=yc, z=zp, cor=None, mat="vidro", bisel=0.002))
            it.add(mb.caixa(l - 0.002, 0.018, 0.022, x=xc, y=y0 + 0.008, z=zp - 0.006, cor=borda or cor, bisel=0.006))
        else:
            it.add(mb.caixa(l - 0.002, y1 - y0, 0.016, x=xc, y=yc, z=zp, cor=cor, bisel=0.005))
    alts = list(zs) + [topo]
    for k in range(len(zs)):
        it.slot(f"{nome}_{k + 1}", (xc, yc, zs[k] + (0.008 if vidro else 0.016)),
                (l - 0.02, y1 - y0 - 0.02, alts[k + 1] - zs[k] - 0.03))


def _gaveta_refri(it, x0, x1, zb, a, yfr, p, cor_frente, cor_caixa, nome, transparente=True):
    l = x1 - x0
    xc = (x0 + x1) / 2
    fr = []
    if transparente:
        fr.append(mb.caixa(l, 0.012, a, x=xc, y=yfr - 0.006, z=zb, cor=None, mat="vidro", bisel=0.004))
        fr.append(mb.caixa(l + 0.004, 0.02, 0.03, x=xc, y=yfr - 0.01, z=zb + a - 0.03, cor=cor_frente, bisel=0.008))
        fr.append(mb.caixa(l + 0.004, 0.016, 0.018, x=xc, y=yfr - 0.008, z=zb, cor=cor_frente, bisel=0.006))
    else:
        f = placa(l, a, 0.018, 0.012, x=xc, y=yfr - 0.018, z=zb, cor=cor_frente, bisel=0.007)
        fr.append(f)
        fr.append(mb.caixa(l * 0.4, 0.02, 0.016, x=xc, y=yfr - 0.026, z=zb + a - 0.03, cor=cor_caixa, bisel=0.007))
    return it.gaveta(l - 0.01, p, a - 0.01, fr, x=xc, y_frente=yfr, z=zb + 0.003, cor=cor_caixa, esp=0.008,
                     nome=nome, curso=p * 0.7)


def geladeira_duplex(id_, cor="cinza", cor_int="cinza_claro", cor_bin="azul_celeste", cor_pux="cinza_claro",
                     cor_disp="grafite", rotulo="", grupo="geladeira_duplex"):
    """Lado a lado: freezer à esquerda (dispenser na porta), refrigerador à direita, gavetas embaixo."""
    it = mb.Item(id_)
    L, A, Pb, esp = 0.92, 1.78, 0.64, 0.06
    zb0 = 0.04
    Ab = A - zb0
    yb = -(Pb + esp) / 2 + esp
    par = 0.045
    it.add(casco(rr(L, Ab, 0.07), rr_off(L - 2 * par, Ab - 2 * par, 0.03), Pb, 0.04, y=yb, z=zb0 + Ab / 2,
                 cor=cor, bisel=0.055, bisel_boca=0.008, nome="corpo", cor_dentro=cor_int))
    # interior: pintar por dentro com a cor interna (faces viradas para dentro da boca)
    xd = -0.05
    it.add(mb.caixa(0.03, Pb - 0.04, Ab - 2 * par + 0.004, x=xd, y=yb + (Pb - 0.04) / 2, z=zb0 + par - 0.002,
                    cor=cor_int, bisel=0.006))
    it.add(mb.caixa(L - 0.08, 0.05, zb0 + 0.004, y=yb + 0.08, z=0, cor="grafite_escuro", bisel=0.01))
    it.add(mb.caixa(L - 0.08, Pb - 0.15, zb0 + 0.004, y=yb + Pb / 2, z=0, cor="grafite_escuro", bisel=0.01))
    xi0, xi1 = -L / 2 + par, L / 2 - par
    zi0, zi1 = zb0 + par, zb0 + Ab - par
    ydi0, ydi1 = yb + 0.085, yb + Pb - 0.045
    # freezer (esquerda): 3 prateleiras + 1 gaveta
    fx0, fx1 = xi0 + 0.007, xd - 0.015
    _gaveta_refri(it, fx0 + 0.005, fx1 - 0.005, zi0 + 0.01, 0.2, ydi0, ydi1 - ydi0 - 0.01, cor_bin, cor_int,
                  "gaveta_freezer")
    _prateleiras(it, fx0, fx1, ydi0, ydi1, [zi0 + 0.25, zi0 + 0.62, zi0 + 1.0], cor_int, zi1, "freezer",
                 borda=cor_bin)
    # refrigerador (direita): 3 prateleiras + 2 gavetas
    rx0, rx1 = xd + 0.015, xi1 - 0.007
    _gaveta_refri(it, rx0 + 0.005, rx1 - 0.005, zi0 + 0.01, 0.17, ydi0, ydi1 - ydi0 - 0.01, cor_bin, cor_int,
                  "gaveta_legumes_1")
    _gaveta_refri(it, rx0 + 0.005, rx1 - 0.005, zi0 + 0.2, 0.17, ydi0, ydi1 - ydi0 - 0.01, cor_bin, cor_int,
                  "gaveta_legumes_2")
    _prateleiras(it, rx0, rx1, ydi0, ydi1, [zi0 + 0.4, zi0 + 0.75, zi0 + 1.1], cor_int, zi1 - 0.01, "geladeira",
                 borda=cor_bin)
    # portas
    zp0, zp1 = zb0 + 0.004, A - 0.002
    disp = []
    xm = (-L / 2 + xd) / 2
    nicho_z = zp0 + 0.95
    disp.append(placa(0.2, 0.3, 0.012, 0.03, x=xm, y=yb - 0.002 - esp - 0.01, z=nicho_z, cor=cor_pux, bisel=0.005))
    disp.append(placa(0.15, 0.2, 0.01, 0.022, x=xm, y=yb - 0.002 - esp - 0.012, z=nicho_z + 0.025, cor=cor_disp,
                      bisel=0.004))
    disp.append(mb.caixa(0.05, 0.03, 0.06, x=xm, y=yb - esp - 0.025, z=nicho_z + 0.13, cor=cor_pux, bisel=0.01))
    disp.append(mb.caixa(0.11, 0.01, 0.012, x=xm, y=yb - esp - 0.016, z=nicho_z + 0.04, cor="cinza_medio",
                         bisel=0.004))
    for k in range(3):
        disp.append(botao(xm - 0.04 + k * 0.04, yb - esp - 0.014, nicho_z + 0.255, r=0.009, cor="branco",
                          prof=0.006))
    disp.append(barra(xd - 0.035, yb - 0.002 - esp, zp0 + 0.55, zp1 - 0.35, d=0.04, r=0.012, cor=cor_pux))
    _porta_refri(it, -L / 2, xd - 0.002, zp0, zp1, yb, esp, cor, 0.06, "esq", "porta_freezer",
                 bins=[zp0 + 0.35, zp0 + 0.75, zp0 + 1.15], cor_bin=cor_bin, extras=disp,
                 bin_x=(xi0 + 0.02, xd - 0.03), bin_p=0.07)
    _porta_refri(it, xd + 0.002, L / 2, zp0, zp1, yb, esp, cor, 0.06, "dir", "porta_geladeira",
                 bins=[zp0 + 0.35, zp0 + 0.75, zp0 + 1.15], cor_bin=cor_bin,
                 extras=[barra(xd + 0.035, yb - 0.002 - esp, zp0 + 0.55, zp1 - 0.35, d=0.04, r=0.012, cor=cor_pux)],
                 bin_x=(xd + 0.03, xi1 - 0.02), bin_p=0.07)
    return it, dict(rotulo=rotulo, grupo=grupo, tags=["geladeira", "duplex", "portas", "gavetas"])


def geladeira_duas_portas(id_, cor="lilas", cor_pux="roxo", cor_int="branco_gelo", cor_bin="lilas_claro", rotulo="",
                          grupo="geladeira_duas_portas"):
    """Duas portas, freezer embaixo (a lilás da referência): portas boleadas e puxadores verticais."""
    it = mb.Item(id_)
    L, A, Pb, esp = 0.66, 1.76, 0.6, 0.065
    zb0 = 0.03
    yb = -(Pb + esp) / 2 + esp
    par = 0.04
    zdiv = 0.62  # altura da divisão freezer / geladeira
    Ab = A - zb0
    it.add(casco(rr(L, Ab, 0.09), rr_off(L - 2 * par, Ab - 2 * par, 0.03), Pb, 0.035, y=yb, z=zb0 + Ab / 2, cor=cor,
                 bisel=0.06, nome="corpo", cor_dentro=cor_int))
    it.add(mb.caixa(L - 2 * par + 0.004, Pb - 0.035, 0.05, y=yb + (Pb - 0.035) / 2, z=zdiv - 0.025, cor=cor_int,
                    bisel=0.008))
    it.add(mb.caixa(L - 0.1, Pb - 0.12, zb0 + 0.004, y=yb + Pb / 2, z=0, cor="grafite", bisel=0.008))
    xi0, xi1 = -L / 2 + par, L / 2 - par
    zi0, zi1 = zb0 + par, A - par
    y0, y1 = yb + 0.08, yb + Pb - 0.035
    x0, x1 = xi0 + 0.006, xi1 - 0.006
    # freezer: gaveta grande + prateleira
    _gaveta_refri(it, x0 + 0.005, x1 - 0.005, zi0 + 0.01, 0.24, y0, y1 - y0 - 0.01, cor_bin, cor_int,
                  "gaveta_freezer", transparente=False)
    _prateleiras(it, x0, x1, y0, y1, [zi0 + 0.3], cor_int, zdiv - 0.025, "freezer", borda=cor_bin)
    # geladeira: gaveta de legumes + 3 prateleiras
    zg = zdiv + 0.025
    _gaveta_refri(it, x0 + 0.005, x1 - 0.005, zg + 0.008, 0.18, y0, y1 - y0 - 0.01, cor_bin, cor_int,
                  "gaveta_legumes")
    _prateleiras(it, x0, x1, y0, y1, [zg + 0.22, zg + 0.5, zg + 0.78], cor_int, zi1, "geladeira", borda=cor_bin)
    _porta_refri(it, -L / 2, L / 2, zb0 + 0.004, zdiv - 0.003, yb, esp, cor, 0.08, "esq", "porta_freezer",
                 bins=[zb0 + 0.25], cor_bin=cor_bin,
                 extras=[barra(L / 2 - 0.06, yb - 0.002 - esp, zdiv - 0.4, zdiv - 0.08, d=0.04, r=0.017,
                               cor=cor_pux)], bin_x=(xi0 + 0.015, xi1 - 0.015))
    _porta_refri(it, -L / 2, L / 2, zdiv + 0.003, A - 0.002, yb, esp, cor, 0.08, "esq", "porta_geladeira",
                 bins=[zdiv + 0.2, zdiv + 0.5, zdiv + 0.8], cor_bin=cor_bin,
                 extras=[barra(L / 2 - 0.06, yb - 0.002 - esp, zdiv + 0.12, zdiv + 0.6, d=0.04, r=0.017,
                               cor=cor_pux)], bin_x=(xi0 + 0.015, xi1 - 0.015))
    return it, dict(rotulo=rotulo, grupo=grupo, tags=["geladeira", "duas portas", "freezer embaixo", "gavetas"])


def geladeira_retro_pes(id_, cor="rosa_claro", cor_pux="rosa", cor_int="rosa_claro", cor_bin="lilas",
                        cor_pe="laranja", rotulo="", grupo="geladeira_retro_pes"):
    """Retrô com pezinhos: congelador em cima (porta pequena) e geladeira embaixo; alavancas curvas."""
    it = mb.Item(id_)
    L, A, Pb, esp = 0.64, 1.72, 0.6, 0.06
    zb0 = 0.08
    Ab = A - zb0
    yb = -(Pb + esp) / 2 + esp
    par = 0.04
    zdiv = zb0 + 1.12
    it.add(casco(rr(L, Ab, 0.08), rr_off(L - 2 * par, Ab - 2 * par, 0.03), Pb, 0.035, y=yb, z=zb0 + Ab / 2, cor=cor,
                 bisel=0.045, nome="corpo", cor_dentro=cor_int))
    it.add(mb.caixa(L - 2 * par + 0.004, Pb - 0.035, 0.04, y=yb + (Pb - 0.035) / 2, z=zdiv - 0.02, cor=cor_int,
                    bisel=0.008))
    it.add(pes_bola(L - 0.06, Pb - 0.08, zb0 + 0.01, cor_pe, 0.025, 0.04, z=0))
    for p_ in it.partes[-4:]:
        mb.transforma(p_, loc=(0, yb + Pb / 2, 0))
    xi0, xi1 = -L / 2 + par + 0.002, L / 2 - par - 0.002
    zi0, zi1 = zb0 + par, A - par
    y0, y1 = yb + 0.08, yb + Pb - 0.035
    _gaveta_refri(it, xi0 + 0.01, xi1 - 0.01, zi0 + 0.01, 0.16, y0, y1 - y0 - 0.01, cor_bin, cor_int,
                  "gaveta_legumes")
    _prateleiras(it, xi0, xi1, y0, y1, [zi0 + 0.2, zi0 + 0.48, zi0 + 0.76], cor_int, zdiv - 0.02, "geladeira",
                 vidro=False)
    _prateleiras(it, xi0, xi1, y0, y1, [zdiv + 0.2], cor_int, zi1, "congelador", vidro=False)
    it.slot("congelador_fundo", (0, (y0 + y1) / 2, zdiv + 0.02), (xi1 - xi0 - 0.02, y1 - y0 - 0.02, 0.17))
    _porta_refri(it, -L / 2, L / 2, zdiv + 0.003, A - 0.002, yb, esp, cor, 0.06, "dir", "porta_congelador",
                 bins=[], extras=[alavanca(-L / 2 + 0.1, yb - 0.002 - esp, zdiv + 0.08, sx=1, cor=cor_pux)])
    _porta_refri(it, -L / 2, L / 2, zb0 + 0.004, zdiv - 0.003, yb, esp, cor, 0.06, "dir", "porta_geladeira",
                 bins=[zb0 + 0.15, zb0 + 0.45, zb0 + 0.75], cor_bin=cor_bin,
                 extras=[alavanca(-L / 2 + 0.1, yb - 0.002 - esp, zdiv - 0.16, sx=1, cor=cor_pux)],
                 bin_x=(xi0 + 0.01, xi1 - 0.01))
    return it, dict(rotulo=rotulo, grupo=grupo, tags=["geladeira", "retrô", "pés", "duas portas"])


def geladeira_retro_redonda(id_, cor="amarelo", cor_aro="cinza_claro", cor_int="rosa_claro", cor_bin="roxo",
                            cor_pux="cinza_claro", rotulo="", grupo="geladeira_retro_redonda"):
    """Retrô toda arredondada (a amarela da referência): duas portas com aro cinza por dentro."""
    it = mb.Item(id_)
    L, A, Pb, esp = 0.66, 1.74, 0.58, 0.075
    zb0 = 0.02
    Ab = A - zb0
    yb = -(Pb + esp) / 2 + esp
    par = 0.05
    zdiv = zb0 + 1.1
    it.add(casco(rr(L, Ab, 0.14, seg=8), rr_off(L - 2 * par, Ab - 2 * par, 0.09, seg=8), Pb, 0.035, y=yb,
                 z=zb0 + Ab / 2, cor=cor, bisel=0.07, bisel_boca=0.01, nome="corpo", cor_dentro=cor_int))
    it.add(aro_frente(L - 0.02, Ab - 0.02, 0.13, par - 0.004, 0.01, y=yb - 0.006, z=zb0 + 0.01, cor=cor_aro))
    it.add(placa_deitada(L - 0.2, Pb - 0.16, zb0 + 0.03, 0.04, y=yb + Pb / 2, cor="grafite", bisel=0.008))
    it.add(mb.caixa(L - 2 * par + 0.004, Pb - 0.035, 0.04, y=yb + (Pb - 0.035) / 2, z=zdiv - 0.02, cor=cor_aro,
                    bisel=0.008))
    xi0, xi1 = -L / 2 + par + 0.002, L / 2 - par - 0.002
    zi0, zi1 = zb0 + par, A - par
    y0, y1 = yb + 0.085, yb + Pb - 0.035
    it.add(mb.caixa(xi1 - xi0, Pb - 0.05, 0.012, y=yb + (Pb - 0.035) / 2 + 0.006, z=zi0, cor=cor_int, bisel=0.004))
    _prateleiras(it, xi0, xi1, y0, y1, [zi0 + 0.012, zi0 + 0.3, zi0 + 0.6], cor_int, zdiv - 0.02, "geladeira",
                 vidro=False)
    _prateleiras(it, xi0 + 0.04, xi1 - 0.04, y0, y1, [zdiv + 0.02], cor_int, zi1 - 0.06, "congelador", vidro=False)
    _porta_refri(it, -L / 2, L / 2, zdiv + 0.003, A - 0.002, yb, esp, cor, 0.13, "dir", "porta_congelador",
                 bins=[zdiv + 0.12], cor_bin=cor_bin, gaxeta=cor_aro, contorno=rr2(L, A - 0.005 - zdiv, 0.14, 0.04),
                 extras=[mb.junta([mb.caixa(0.03, 0.03, 0.08, x=-L / 2 + 0.07, y=yb - esp - 0.015, z=zdiv + 0.08,
                                            cor=cor_pux, bisel=0.012)])],
                 bin_x=(xi0 + 0.05, xi1 - 0.05), bin_p=0.065)
    _porta_refri(it, -L / 2, L / 2, zb0 + 0.004, zdiv - 0.003, yb, esp, cor, 0.13, "dir", "porta_geladeira",
                 bins=[zb0 + 0.25, zb0 + 0.55, zb0 + 0.85], cor_bin=cor_bin, gaxeta=cor_aro,
                 contorno=rr2(L, zdiv - 0.007 - zb0, 0.04, 0.14),
                 extras=[alavanca(-L / 2 + 0.07, yb - 0.002 - esp, zdiv - 0.12, sx=-1, cor=cor_pux, tam=0.9)],
                 bin_x=(xi0 + 0.03, xi1 - 0.03), bin_p=0.065)
    return it, dict(rotulo=rotulo, grupo=grupo, tags=["geladeira", "retrô", "arredondada", "duas portas"])


def geladeira_retro_uma_porta(id_, cor="vermelho", cor_pux="cinza_claro", cor_int="branco_gelo", cor_bin="vermelho_claro",
                              rotulo="", grupo="geladeira_retro_uma_porta"):
    """Retrô de uma porta, topo bem redondo (a vermelha da referência)."""
    it = mb.Item(id_)
    L, A, Pb, esp = 0.68, 1.72, 0.6, 0.07
    zb0 = 0.03
    Ab = A - zb0
    yb = -(Pb + esp) / 2 + esp
    par = 0.045
    contorno = rr2
    it.add(casco(contorno(L, Ab, 0.17, 0.05), contorno(L - 2 * par, Ab - 2 * par, 0.13, 0.02), Pb, 0.035, y=yb,
                 z=zb0 + Ab / 2, cor=cor, bisel=0.05, nome="corpo", cor_dentro=cor_int))
    it.add(mb.caixa(L - 0.1, Pb - 0.12, zb0 + 0.004, y=yb + Pb / 2, z=0, cor="grafite", bisel=0.008))
    xi0, xi1 = -L / 2 + par + 0.002, L / 2 - par - 0.002
    zi0, zi1 = zb0 + par, A - par
    y0, y1 = yb + 0.085, yb + Pb - 0.035
    # congelador interno (caixinha com portinhola) no alto
    it.add(bandeja(xi1 - xi0 - 0.08, y1 - y0, 0.2, 0.012, 0.02, y=(y0 + y1) / 2, z=zi1 - 0.36, cor=cor_int))
    it.slot("congelador", (0, (y0 + y1) / 2, zi1 - 0.36 + 0.012), (xi1 - xi0 - 0.12, y1 - y0 - 0.04, 0.17))
    _gaveta_refri(it, xi0 + 0.01, xi1 - 0.01, zi0 + 0.01, 0.17, y0, y1 - y0 - 0.01, cor_bin, cor_int,
                  "gaveta_legumes")
    _prateleiras(it, xi0, xi1, y0, y1, [zi0 + 0.22, zi0 + 0.52, zi0 + 0.82], cor_int, zi1 - 0.36, "geladeira",
                 borda=cor_bin)
    _porta_refri(it, -L / 2, L / 2, zb0 + 0.004, A - 0.002, yb, esp, cor, 0.0, "dir", "porta_geladeira",
                 bins=[zb0 + 0.25, zb0 + 0.6, zb0 + 0.95, zb0 + 1.25], cor_bin=cor_bin,
                 extras=[alavanca(-L / 2 + 0.08, yb - 0.002 - esp, zb0 + 1.1, sx=1, cor=cor_pux, tam=1.5)],
                 bin_x=(xi0 + 0.02, xi1 - 0.02), contorno=contorno(L, A - 0.006 - zb0, 0.17, 0.05))
    return it, dict(rotulo=rotulo, grupo=grupo, tags=["geladeira", "retrô", "uma porta"])


def frigobar_redondo(id_, cor="creme", cor_pux="cinza_claro", cor_int="branco_gelo", cor_bin="creme_claro", rotulo="",
                     grupo="frigobar_redondo"):
    """Frigobar bem arredondado (o creme da referência): porta abaulada, puxador curto."""
    it = mb.Item(id_)
    L, A, Pb, esp = 0.5, 0.85, 0.5, 0.075
    zb0 = 0.015
    Ab = A - zb0
    yb = -(Pb + esp) / 2 + esp
    par = 0.05
    it.add(casco(rr(L, Ab, 0.17, seg=8), rr_off(L - 2 * par, Ab - 2 * par, 0.12, seg=8), Pb, 0.04, y=yb,
                 z=zb0 + Ab / 2, cor=cor, bisel=0.1, bisel_boca=0.012, nome="corpo", cor_dentro=cor_int))
    xi0, xi1 = -L / 2 + par, L / 2 - par
    zi0, zi1 = zb0 + par, A - par
    y0, y1 = yb + 0.07, yb + Pb - 0.04
    it.add(mb.caixa(xi1 - xi0 - 0.12, Pb - 0.06, 0.01, y=yb + Pb / 2, z=zi0, cor=cor_int, bisel=0.003))
    for p_ in pes_bola(L - 0.18, Pb - 0.18, zb0 + 0.03, cor_pux, 0.02, 0.0):
        mb.transforma(p_, loc=(0, yb + Pb / 2, 0))
        it.add(p_)
    it.slot("fundo", (0, (y0 + y1) / 2, zi0 + 0.01), (xi1 - xi0 - 0.14, y1 - y0 - 0.02, 0.28))
    _prateleiras(it, xi0 + 0.02, xi1 - 0.02, y0, y1, [zi0 + 0.32], cor_int, zi1, "prateleira", vidro=False)
    # congelador pequeno no alto
    it.add(bandeja(xi1 - xi0 - 0.12, y1 - y0, 0.13, 0.01, 0.02, y=(y0 + y1) / 2, z=zi1 - 0.2, cor="cinza_claro"))
    folha = placa(L - 0.004, Ab - 0.006, esp, 0.17, y=yb - 0.002 - esp, z=zb0 + 0.004, cor=cor, bisel=0.034)
    # abaula a porta (o meio sai mais para a frente)
    for v in folha.data.vertices:
        if v.co.y < yb - 0.002 - esp * 0.5:
            k = 1 - min(1, (v.co.x / (L / 2)) ** 2 * 0.8 + ((v.co.z - A / 2) / (A / 2)) ** 2 * 0.6)
            v.co.y -= 0.025 * max(0, k)
    pux = mb.caixa(0.12, 0.034, 0.034, x=-L / 2 + 0.13, y=yb - esp - 0.034, z=zb0 + Ab * 0.62, cor=cor_pux,
                   bisel=0.015)
    pux2 = mb.caixa(0.034, 0.03, 0.03, x=-L / 2 + 0.085, y=yb - esp - 0.02, z=zb0 + Ab * 0.62, cor=cor_pux,
                    bisel=0.013)
    objs = [folha, pux, pux2]
    for k, zb in enumerate((zb0 + 0.12, zb0 + 0.42)):
        objs.append(bandeja(L - 0.16, 0.06, 0.07, 0.007, 0.012, y=yb + 0.026, z=zb, cor=cor_bin))
        it.slot(f"porta_prateleira_{k + 1}", (0, yb + 0.026, zb + 0.007), (L - 0.18, 0.045, 0.11), pai="porta")
    it.porta(objs, dobradica=(L / 2, yb - 0.002 - esp / 2, 0), lado="dir", nome="porta")
    return it, dict(rotulo=rotulo, grupo=grupo, tags=["frigobar", "arredondado", "pequeno"])


def frigobar_bicolor(id_, cor="verde_agua", cor_porta="amarelo", cor_pux="verde_agua", cor_int="branco_gelo",
                     cor_bin="amarelo_claro", rotulo="", grupo="frigobar_bicolor"):
    """Frigobar quadradinho de duas cores (o amarelo e verde da referência)."""
    it = mb.Item(id_)
    L, A, Pb, esp = 0.48, 0.85, 0.5, 0.045
    zb0 = 0.02
    Ab = A - zb0
    yb = -(Pb + esp) / 2 + esp
    par = 0.04
    it.add(casco(rr(L, Ab, 0.06), rr_off(L - 2 * par, Ab - 2 * par, 0.02), Pb, 0.035, y=yb, z=zb0 + Ab / 2, cor=cor,
                 bisel=0.045, nome="corpo", cor_dentro=cor_int))
    it.add(mb.caixa(L - 0.08, Pb - 0.1, zb0 + 0.004, y=yb + Pb / 2, z=0, cor="grafite", bisel=0.006))
    xi0, xi1 = -L / 2 + par, L / 2 - par
    zi0, zi1 = zb0 + par, A - par
    y0, y1 = yb + 0.065, yb + Pb - 0.035
    it.add(mb.caixa(xi1 - xi0 - 0.004, Pb - 0.04, 0.008, y=yb + (Pb - 0.035) / 2 + 0.004, z=zi0, cor=cor_int,
                    bisel=0.003))
    it.slot("fundo", (0, (y0 + y1) / 2, zi0 + 0.008), (xi1 - xi0 - 0.02, y1 - y0 - 0.02, 0.3))
    _prateleiras(it, xi0, xi1, y0, y1, [zi0 + 0.33, zi0 + 0.56], cor_int, zi1, "prateleira", vidro=False)
    objs = [placa(L - 0.05, Ab - 0.05, esp, 0.035, y=yb - 0.002 - esp, z=zb0 + 0.025, cor=cor_porta, bisel=0.016)]
    objs.append(barra(-L / 2 + 0.065, yb - 0.002 - esp, zb0 + Ab * 0.45, zb0 + Ab * 0.75, d=0.025, r=0.011,
                      cor=cor_pux))
    for k, zb in enumerate((zb0 + 0.12, zb0 + 0.42)):
        objs.append(bandeja(L - 0.14, 0.055, 0.065, 0.007, 0.01, y=yb + 0.024, z=zb, cor=cor_bin))
        it.slot(f"porta_prateleira_{k + 1}", (0, yb + 0.024, zb + 0.007), (L - 0.16, 0.04, 0.1), pai="porta")
    it.porta(objs, dobradica=(L / 2 - 0.025, yb - 0.002 - esp / 2, 0), lado="dir", nome="porta")
    return it, dict(rotulo=rotulo, grupo=grupo, tags=["frigobar", "duas cores", "pequeno"])


def geladeira_pacote(id_, rotulo="", grupo="geladeira_pacote"):
    """Fridge_01 do pacote gratuito, trazido para 1,75 m; as duas portas viram portas interativas."""
    pc = mb.importa_pacote("Fridge_01")
    S = Matrix.Diagonal((1.12, 1.12, 1.25, 1))
    for o in pc.values():
        o.data.transform(S)
    it = mb.Item(id_)
    corpo = pc.pop("corpo")
    it.add(corpo)
    lo_c, hi_c = bbox_malha([corpo])
    for nm in sorted(pc):
        ob = pc[nm]
        lo, hi = bbox_malha([ob])
        nome = "porta_congelador" if lo.z > 0.5 * hi_c.z else "porta_geladeira"
        it.porta([ob], dobradica=(hi.x, lo.y + 0.03, 0), lado="dir", nome=nome)
    # prateleiras do corpo: medidas na própria malha (faces viradas para cima dentro do vão)
    yb = lo_c.y
    niveis = sorted({round(corpo.data.polygons[i].center.z, 2) for i in range(len(corpo.data.polygons))
                     if corpo.data.polygons[i].normal.z > 0.95 and abs(corpo.data.polygons[i].center.x) < 0.2
                     and yb + 0.05 < corpo.data.polygons[i].center.y < hi_c.y - 0.06
                     and 0.05 < corpo.data.polygons[i].center.z < hi_c.z - 0.05})
    tetos = sorted({round(corpo.data.polygons[i].center.z, 2) for i in range(len(corpo.data.polygons))
                    if corpo.data.polygons[i].normal.z < -0.95 and abs(corpo.data.polygons[i].center.x) < 0.2
                    and yb + 0.05 < corpo.data.polygons[i].center.y < hi_c.y - 0.06})
    unicos = []
    for z in niveis:
        if not unicos or z - unicos[-1] > 0.05:
            unicos.append(z)
    print("pacote: niveis", unicos, "tetos", tetos, flush=True)
    x0, x1 = lo_c.x + 0.06, hi_c.x - 0.06
    yc = (yb + hi_c.y) / 2 + 0.03
    pd = hi_c.y - yb - 0.12
    for k, z0 in enumerate(unicos):
        acima = [t for t in tetos if t > z0 + 0.04]
        z1 = acima[0] if acima else hi_c.z - 0.06
        it.slot(f"prateleira_{k + 1}", (0, yc, z0), (x1 - x0, pd, z1 - z0 - 0.02))
    return it, dict(rotulo=rotulo, grupo=grupo, pacote=True, tags=["geladeira", "retrô", "pacote"])


GELADEIRAS = [
    ("geladeira_duplex_cinza", geladeira_duplex, dict(rotulo="Geladeira duplex lado a lado (cinza-azulada)")),
    ("geladeira_duplex_branca", geladeira_duplex, dict(cor="branco_gelo", cor_int="porcelana", cor_bin="turquesa",
                                                       cor_pux="cinza", rotulo="Geladeira duplex lado a lado (branca)")),
    ("geladeira_duplex_grafite", geladeira_duplex, dict(cor="grafite", cor_int="cinza_claro", cor_bin="laranja",
                                                        cor_pux="metal_claro", cor_disp="preto",
                                                        rotulo="Geladeira duplex lado a lado (grafite)")),
    ("geladeira_duas_portas_lilas", geladeira_duas_portas, dict(rotulo="Geladeira de duas portas (lilás)")),
    ("geladeira_duas_portas_azul", geladeira_duas_portas, dict(cor="azul_claro", cor_pux="azul_medio",
                                                               cor_bin="azul_bebe",
                                                               rotulo="Geladeira de duas portas (azul)")),
    ("geladeira_duas_portas_menta", geladeira_duas_portas, dict(cor="menta", cor_pux="verde_medio", cor_bin="verde_claro",
                                                                rotulo="Geladeira de duas portas (menta)")),
    ("geladeira_retro_pes_rosa", geladeira_retro_pes, dict(rotulo="Geladeira retrô com pés (rosa)")),
    ("geladeira_retro_pes_azul", geladeira_retro_pes, dict(cor="azul_bebe", cor_pux="azul_celeste",
                                                           cor_int="porcelana_azul", cor_bin="amarelo",
                                                           cor_pe="madeira_mel",
                                                           rotulo="Geladeira retrô com pés (azul-bebê)")),
    ("geladeira_retro_pes_creme", geladeira_retro_pes, dict(cor="creme", cor_pux="terracota_clara",
                                                            cor_int="creme_claro", cor_bin="verde_agua",
                                                            cor_pe="madeira",
                                                            rotulo="Geladeira retrô com pés (creme)")),
    ("geladeira_retro_redonda_amarela", geladeira_retro_redonda, dict(rotulo="Geladeira retrô arredondada (amarela)")),
    ("geladeira_retro_redonda_turquesa", geladeira_retro_redonda, dict(cor="turquesa", cor_int="porcelana_azul",
                                                                       cor_bin="laranja",
                                                                       rotulo="Geladeira retrô arredondada (turquesa)")),
    ("geladeira_retro_redonda_laranja", geladeira_retro_redonda, dict(cor="laranja", cor_int="creme_claro",
                                                                      cor_bin="azul_celeste",
                                                                      rotulo="Geladeira retrô arredondada (laranja)")),
    ("geladeira_retro_uma_porta_vermelha", geladeira_retro_uma_porta,
     dict(rotulo="Geladeira retrô de uma porta (vermelha)")),
    ("geladeira_retro_uma_porta_celeste", geladeira_retro_uma_porta,
     dict(cor="azul_celeste", cor_bin="azul_bebe", rotulo="Geladeira retrô de uma porta (azul-celeste)")),
    ("geladeira_retro_uma_porta_verde", geladeira_retro_uma_porta,
     dict(cor="verde_claro", cor_bin="menta", rotulo="Geladeira retrô de uma porta (verde)")),
    ("frigobar_redondo_creme", frigobar_redondo, dict(rotulo="Frigobar arredondado (creme)")),
    ("frigobar_redondo_rosa", frigobar_redondo, dict(cor="rosa_bebe", cor_pux="rosa_escuro", cor_bin="rosa_claro",
                                                     rotulo="Frigobar arredondado (rosa)")),
    ("frigobar_redondo_azul", frigobar_redondo, dict(cor="azul_bebe", cor_pux="azul", cor_bin="porcelana_azul",
                                                     rotulo="Frigobar arredondado (azul-bebê)")),
    ("frigobar_bicolor_amarelo", frigobar_bicolor, dict(rotulo="Frigobar bicolor (amarelo e verde)")),
    ("frigobar_bicolor_laranja", frigobar_bicolor, dict(cor="azul", cor_porta="laranja_claro", cor_pux="azul",
                                                        cor_bin="laranja_claro",
                                                        rotulo="Frigobar bicolor (laranja e azul)")),
    ("frigobar_bicolor_rosa", frigobar_bicolor, dict(cor="lilas", cor_porta="rosa", cor_pux="roxo", cor_bin="rosa_claro",
                                                     rotulo="Frigobar bicolor (rosa e lilás)")),
    ("geladeira_retro_pacote", geladeira_pacote, dict(rotulo="Geladeira retrô rosa (pacote)")),
]
for _id, _fn, _kw in GELADEIRAS:
    reg(_id, _fn, **_kw)


# =====================================================================================================================
# Coifas (parede: corpo de y = −P até 0, base em z = 0; instalar a 1,55 m, 65 cm acima da bancada)
# =====================================================================================================================
ALT_COIFA = 1.55


def _chanfro(L, P, c, y0=0.0):
    """Contorno encostado na parede (y de −P até y0) com os cantos da frente chanfrados (coifa de pirâmide)."""
    return mb._ccw([(-L / 2, y0), (-L / 2, y0 - P + c), (-L / 2 + c, y0 - P), (L / 2 - c, y0 - P),
                    (L / 2, y0 - P + c), (L / 2, y0)])


def _ret_parede(L, P, y0=0.0):
    return mb._ccw([(-L / 2, y0), (-L / 2, y0 - P), (L / 2, y0 - P), (L / 2, y0)])


def _circ_parede(r, n=32):
    """Círculo encostado na parede (tangente a y = 0 por trás)."""
    return [(r * math.cos(2 * math.pi * k / n), -r + r * math.sin(2 * math.pi * k / n)) for k in range(n)]


def _luzes_coifa(xs, ys, z=0.004):
    return [mb.cilindro(0.028, 0.006, x=x_, y=y_, z=z - 0.003, cor=None, mat="luz", seg=16, bisel=0.002)
            for x_ in xs for y_ in ys]


def _chamine(l, p, z0, z1, cor, cor_tampa, cor_grade):
    out = [mb.caixa(l, p, z1 - z0, y=-p / 2, z=z0, cor=cor, bisel=0.012)]
    out.append(mb.caixa(l + 0.02, p + 0.01, 0.035, y=-(p + 0.01) / 2, z=z1 - 0.03, cor=cor_tampa, bisel=0.012))
    out.append(mb.caixa(l * 0.6, p * 0.55, 0.01, y=-p / 2 - 0.005, z=z1 + 0.0, cor=cor_grade, bisel=0.004))
    return out


def coifa_piramide(id_, cor="grafite", cor_base="grafite_escuro", cor_friso="cinza_medio", rotulo="",
                   grupo="coifa_piramide"):
    """Coifa de pirâmide com cantos chanfrados (a grafite da referência): saia, friso, pirâmide e chaminé."""
    it = mb.Item(id_)
    L, P = 0.9, 0.5
    z = 0.004
    it.add(mb.extrudado(_chanfro(L, P, 0.12), 0.05, z=z, cor=cor_base, bisel=0.012))
    it.add(mb.extrudado(_chanfro(L - 0.02, P - 0.01, 0.115), 0.016, z=z + 0.048, cor=cor_friso, bisel=0.006))
    it.add(mb.extrudado(_chanfro(L - 0.04, P - 0.02, 0.11), 0.07, z=z + 0.062, cor=cor, bisel=0.014))
    it.add(loft([(_chanfro(L - 0.05, P - 0.025, 0.105), z + 0.13), (_chanfro(0.34, 0.27, 0.05), z + 0.46)],
                cor=cor, bisel=0.012))
    it.add(_chamine(0.3, 0.25, z + 0.44, 0.98, cor, cor_base, "grafite_escuro"))
    it.add(_luzes_coifa((-0.2, 0.2), (-0.25,)))
    return it, dict(rotulo=rotulo, grupo=grupo, fixacao="parede", altura_instalacao=ALT_COIFA,
                    tags=["coifa", "exaustor", "pirâmide"])


def coifa_quadrada(id_, cor="tijolo", cor_base="terracota_escura", rotulo="", grupo="coifa_quadrada"):
    """Coifa de pirâmide quadrada com moldura em degrau (a de tijolo da referência)."""
    it = mb.Item(id_)
    L, P = 0.86, 0.5
    z = 0.004
    it.add(mb.caixa(L, P, 0.05, y=-P / 2, z=z, cor=cor_base, bisel=0.014))
    it.add(mb.caixa(L - 0.04, P - 0.02, 0.04, y=-(P - 0.02) / 2, z=z + 0.048, cor=cor_base, bisel=0.012))
    it.add(loft([(_ret_parede(L - 0.06, P - 0.03), z + 0.085), (_ret_parede(0.3, 0.26), z + 0.42)], cor=cor,
                bisel=0.012))
    it.add(_chamine(0.28, 0.24, z + 0.4, 0.98, cor, cor_base, "chocolate"))
    for k in range(4):
        it.add(mb.caixa(0.282, 0.005, 0.012, y=-0.241, z=z + 0.52 + k * 0.1, cor=cor_base, bisel=0.002))
    it.add(_luzes_coifa((-0.2, 0.2), (-0.25,)))
    return it, dict(rotulo=rotulo, grupo=grupo, fixacao="parede", altura_instalacao=ALT_COIFA,
                    tags=["coifa", "exaustor", "pirâmide", "rústica"])


def _sino(secoes, n=32, cor="preto", nome="sino"):
    return loft([(_circ_parede(r, n), zz) for r, zz in secoes], cor=cor, nome=nome, angulo=60)


def coifa_conica(id_, cor="preto", cor_faixa="amarelo", rotulo="", grupo="coifa_conica"):
    """Coifa de sino cônico com faixa colorida na saia (a preta e amarela da referência)."""
    it = mb.Item(id_)
    z = 0.004
    R = 0.4
    it.add(_sino([(R - 0.02, z), (R, z + 0.012), (R, z + 0.05), (R - 0.012, z + 0.062)], cor=cor, nome="saia"))
    it.add(_sino([(R - 0.003, z + 0.016), (R + 0.006, z + 0.024), (R + 0.006, z + 0.042), (R - 0.003, z + 0.05)],
                 cor=cor_faixa, nome="faixa"))
    perfil = []
    for k in range(9):
        t = k / 8
        perfil.append((R - 0.015 - (R - 0.13) * (1 - (1 - t) ** 1.7), z + 0.055 + 0.42 * t))
    it.add(_sino(perfil, cor=cor))
    it.add(_sino([(0.12, z + 0.46), (0.12, 0.95), (0.135, 0.955), (0.135, 0.985), (0.12, 0.99)], cor=cor))
    it.add(mb.cilindro(0.08, 0.01, y=-0.12, z=0.985, cor="grafite_escuro", seg=24, bisel=0.003))
    it.add(_luzes_coifa((-0.15, 0.15), (-0.4,)))
    return it, dict(rotulo=rotulo, grupo=grupo, fixacao="parede", altura_instalacao=ALT_COIFA,
                    tags=["coifa", "exaustor", "cônica"])


def coifa_t(id_, cor="azul_acinzentado", cor_tampa="cinza_azulado", rotulo="", grupo="coifa_t"):
    """Coifa em T: tampo grosso boleado e chaminé retangular (a azul-acinzentada da referência)."""
    it = mb.Item(id_)
    L, P = 0.9, 0.5
    z = 0.004
    it.add(mb.caixa(L, P, 0.075, y=-P / 2, z=z, cor=cor, bisel=0.025))
    it.add(mb.caixa(L - 0.06, P - 0.06, 0.006, y=-P / 2, z=z - 0.002, cor="cinza_medio", bisel=0.002))
    it.add(_chamine(0.24, 0.2, z + 0.07, 0.98, cor, cor_tampa, "grafite"))
    it.add(mb.caixa(0.16, 0.012, 0.03, x=0.3, y=-P + 0.002, z=z + 0.022, cor=cor_tampa, bisel=0.005))
    for k in range(3):
        it.add(botao(0.24 + k * 0.035 + 0.04, -P - 0.004, z + 0.037, r=0.008, cor="branco", prof=0.005))
    it.add(_luzes_coifa((-0.25, 0.25), (-0.3,)))
    return it, dict(rotulo=rotulo, grupo=grupo, fixacao="parede", altura_instalacao=ALT_COIFA,
                    tags=["coifa", "exaustor", "moderna"])


def coifa_t_inclinada(id_, cor="preto", cor2="grafite_escuro", rotulo="", grupo="coifa_t_inclinada"):
    """Coifa em T com o tampo chanfrado na frente e chaminé alta e estreita (a preta da referência)."""
    it = mb.Item(id_)
    L, P = 0.9, 0.5
    z = 0.004
    perfil = mb._ccw([(0.0, z), (-P, z), (-P, z + 0.035), (-P + 0.12, z + 0.1), (0.0, z + 0.1)])
    it.add(mb.extrudado(perfil, L, x=-L / 2, cor=cor, bisel=0.014, plano="yz"))
    it.add(mb.caixa(L - 0.08, 0.008, 0.03, y=-P + 0.06 - 0.03, z=z + 0.05, cor=cor2, bisel=0.003))
    for k in range(4):
        it.add(botao(-0.06 + k * 0.04, -P + 0.06 - 0.035, z + 0.068, r=0.008, cor="branco", prof=0.005))
    it.add(_chamine(0.2, 0.17, z + 0.09, 0.98, cor, cor2, "grafite_escuro"))
    it.add(mb.caixa(L - 0.1, P - 0.08, 0.006, y=-P / 2, z=z - 0.002, cor="cinza_medio", bisel=0.002))
    it.add(_luzes_coifa((-0.25, 0.25), (-0.32,)))
    return it, dict(rotulo=rotulo, grupo=grupo, fixacao="parede", altura_instalacao=ALT_COIFA,
                    tags=["coifa", "exaustor", "moderna"])


def coifa_tubo(id_, cor="cinza_azulado", cor2="azul_acinzentado", rotulo="", grupo="coifa_tubo"):
    """Coifa de sino com tubo sanfonado que faz a curva e entra na parede (a da referência, à direita)."""
    it = mb.Item(id_)
    z = 0.004
    R = 0.33
    it.add(_sino([(R - 0.015, z), (R, z + 0.01), (R, z + 0.045), (R - 0.01, z + 0.055)], cor=cor2, nome="saia"))
    perfil = []
    for k in range(9):
        t = k / 8
        perfil.append((R - 0.012 - (R - 0.085) * (t ** 0.75), z + 0.05 + 0.36 * t))
    it.add(_sino(perfil, cor=cor))
    rt = 0.065
    yc = -0.09
    pts = [(0, yc, z + 0.38), (0, yc, 0.8), (0, yc, 0.92), (0, 0.0, 0.92)]
    it.add(mb.tubo(pts, rt, cor=cor, raio_curva=0.1, seg=20, tampas=False))
    for zz in (0.46, 0.56, 0.66, 0.76):
        it.add(toro(rt, 0.012, y=yc, z=zz, cor=cor2, seg=24, seg2=8))
    it.add(toro(rt, 0.014, y=-0.03, z=0.92, cor=cor2, seg=24, seg2=8, eixo="y"))
    it.add(mb.cilindro(rt + 0.03, 0.02, y=-0.01, z=0.92, cor=cor2, eixo="y", seg=28, bisel=0.006))
    it.add(_luzes_coifa((-0.12, 0.12), (-0.33,)))
    return it, dict(rotulo=rotulo, grupo=grupo, fixacao="parede", altura_instalacao=ALT_COIFA,
                    tags=["coifa", "exaustor", "industrial"])


for _id, _fn, _kw in [
    ("coifa_piramide_grafite", coifa_piramide, dict(rotulo="Coifa de pirâmide (grafite)")),
    ("coifa_piramide_inox", coifa_piramide, dict(cor="cinza_claro", cor_base="cinza", cor_friso="cromo",
                                                 rotulo="Coifa de pirâmide (inox)")),
    ("coifa_piramide_creme", coifa_piramide, dict(cor="creme", cor_base="bege_escuro", cor_friso="madeira_mel",
                                                  rotulo="Coifa de pirâmide (creme)")),
    ("coifa_quadrada_tijolo", coifa_quadrada, dict(rotulo="Coifa quadrada rústica (tijolo)")),
    ("coifa_quadrada_verde", coifa_quadrada, dict(cor="verde_oliva", cor_base="madeira_escura",
                                                  rotulo="Coifa quadrada rústica (verde-oliva)")),
    ("coifa_conica_preta", coifa_conica, dict(rotulo="Coifa cônica (preta com faixa amarela)")),
    ("coifa_conica_branca", coifa_conica, dict(cor="branco", cor_faixa="vermelho",
                                               rotulo="Coifa cônica (branca com faixa vermelha)")),
    ("coifa_t_azul", coifa_t, dict(rotulo="Coifa em T (azul-acinzentada)")),
    ("coifa_t_branca", coifa_t, dict(cor="branco_gelo", cor_tampa="cinza_claro", rotulo="Coifa em T (branca)")),
    ("coifa_t_inclinada_preta", coifa_t_inclinada, dict(rotulo="Coifa em T inclinada (preta)")),
    ("coifa_t_inclinada_inox", coifa_t_inclinada, dict(cor="metal_claro", cor2="metal",
                                                       rotulo="Coifa em T inclinada (inox)")),
    ("coifa_tubo_azul", coifa_tubo, dict(rotulo="Coifa com tubo curvo (azul-acinzentada)")),
    ("coifa_tubo_cobre", coifa_tubo, dict(cor="cobre", cor2="terracota_escura", rotulo="Coifa com tubo curvo (cobre)")),
]:
    reg(_id, _fn, **_kw)


# =====================================================================================================================
# Eletros de bancada (fixacao "apoio": origem na base, no centro; frente para −Y)
# =====================================================================================================================
def _apoio(rotulo, grupo, tags, **k):
    d = dict(rotulo=rotulo, grupo=grupo, fixacao="apoio", tags=tags)
    d.update(k)
    return d


def _porta_visor(dl, da, esp, cor, r=0.03, marg=0.04, x=0.0, y=0.0, z=0.0, cor_aro=None):
    """Porta com visor de vidro: moldura (com furo) + vidro no meio da espessura. Face da frente em y, base em z."""
    fr = casco(rr(dl, da, r), rr(dl - 2 * marg, da - 2 * marg, max(0.004, r - marg * 0.6)), esp, 0, x=x, y=y,
               z=z + da / 2, abre="frente", cor=cor, bisel=min(esp * 0.4, 0.01), bisel_boca=0.003, vazado=True,
               nome="moldura")
    out = [fr, mb.caixa(dl - 2 * marg + 0.01, esp * 0.3, da - 2 * marg + 0.01, x=x, y=y + esp * 0.5, z=z + marg - 0.005,
                        cor=None, mat="vidro", bisel=0.001)]
    if cor_aro:
        out.append(aro_frente(dl - 2 * marg + 0.016, da - 2 * marg + 0.016, max(0.005, r - marg * 0.6) + 0.006,
                              0.01, 0.004, x=x, y=y - 0.002, z=z + marg - 0.008, cor=cor_aro))
    return out


def micro_ondas(id_, cor="rosa_claro", cor_int="branco_gelo", cor_bot="rosa", cor_pe="rosa", rotulo="",
                grupo="micro_ondas_teclas"):
    """Micro-ondas de teclas (o rosa da referência): porta de lado com visor, painel com botão de girar e teclado."""
    it = mb.Item(id_)
    L, P, A = 0.48, 0.36, 0.29
    z0 = 0.012
    yb = -P / 2 + 0.015
    lc, ac = 0.31, A - 0.07
    du = -L / 2 + 0.03 + lc / 2
    it.add(casco(rr(L, A, 0.045), rr_off(lc, ac, 0.018, du=du, dv=-0.002), P - 0.015, 0.03, y=yb, z=z0 + A / 2,
                 cor=cor, bisel=0.03, cor_dentro=cor_int, nome="corpo"))
    it.add(pes_bola(L - 0.06, P - 0.08, z0 + 0.004, cor_pe, 0.014, 0.03))
    it.add(mb.cilindro(0.11, 0.008, x=du, y=yb + P / 2 - 0.01, z=z0 + A / 2 - ac / 2 + 0.004, cor=None, mat="vidro",
                       seg=28, bisel=0.002))
    it.slot("prato", (du, yb + P / 2 - 0.01, z0 + A / 2 - ac / 2 + 0.012), (0.22, 0.22, ac - 0.03))
    # painel
    xp = L / 2 - 0.06
    it.add(placa(0.085, A - 0.05, 0.006, 0.02, x=xp, y=yb - 0.005, z=z0 + 0.025, cor=cor, bisel=0.0025))
    it.add(botao_giro(xp, yb - 0.004, z0 + A - 0.07, r=0.024, cor=cor_bot, cor2="branco"))
    for i in range(2):
        for j in range(3):
            it.add(mb.caixa(0.022, 0.01, 0.018, x=xp - 0.016 + i * 0.032, y=yb - 0.009, z=z0 + 0.04 + j * 0.034,
                            cor=cor_bot, bisel=0.004))
    dl, da, esp = L - 0.1 - 0.012, A - 0.014, 0.03
    x0 = -L / 2 + 0.006
    objs = _porta_visor(dl, da, esp, cor, r=0.035, marg=0.04, x=x0 + dl / 2, y=yb - 0.002 - esp, z=z0 + 0.007)
    objs.append(mb.caixa(0.016, 0.02, da * 0.55, x=x0 + dl - 0.022, y=yb - esp - 0.012, z=z0 + da * 0.22, cor=cor_bot,
                         bisel=0.007))
    it.porta(objs, dobradica=(x0, yb - 0.002 - esp / 2, 0), lado="esq", nome="porta")
    return it, _apoio(rotulo, grupo, ["micro-ondas", "eletro", "porta"])


def micro_ondas_retro(id_, cor="azul_claro", cor2="mostarda", cor_int="porcelana_azul", rotulo="",
                      grupo="micro_ondas_retro"):
    """Micro-ondas retrô (o azul da referência): corpo bem redondo, moldura colorida e dois botões de girar."""
    it = mb.Item(id_)
    L, P, A = 0.46, 0.34, 0.28
    z0 = 0.018
    yb = -P / 2 + 0.015
    lc, ac = 0.29, A - 0.075
    du = -L / 2 + 0.035 + lc / 2
    it.add(casco(rr(L, A, 0.07), rr_off(lc, ac, 0.025, du=du), P - 0.015, 0.03, y=yb, z=z0 + A / 2, cor=cor,
                 bisel=0.045, cor_dentro=cor_int, nome="corpo"))
    it.add(pes_bola(L - 0.08, P - 0.08, z0 + 0.004, cor2, 0.016, 0.03))
    it.add(mb.cilindro(0.1, 0.008, x=du, y=yb + P / 2 - 0.01, z=z0 + A / 2 - ac / 2 + 0.004, cor=None, mat="vidro",
                       seg=28, bisel=0.002))
    it.slot("prato", (du, yb + P / 2 - 0.01, z0 + A / 2 - ac / 2 + 0.012), (0.2, 0.2, ac - 0.03))
    xp = L / 2 - 0.065
    it.add(placa(0.07, A - 0.08, 0.008, 0.03, x=xp, y=yb - 0.006, z=z0 + 0.04, cor=cor2, bisel=0.003))
    for zz in (z0 + A * 0.66, z0 + A * 0.36):
        it.add(botao_giro(xp, yb - 0.006, zz, r=0.022, cor="marrom", cor2=cor2))
    dl, da, esp = L - 0.11 - 0.012, A - 0.02, 0.028
    x0 = -L / 2 + 0.008
    objs = _porta_visor(dl, da, esp, cor2, r=0.04, marg=0.045, x=x0 + dl / 2, y=yb - 0.002 - esp, z=z0 + 0.01)
    it.porta(objs, dobradica=(x0, yb - 0.002 - esp / 2, 0), lado="esq", nome="porta")
    return it, _apoio(rotulo, grupo, ["micro-ondas", "eletro", "retrô", "porta"])


def micro_ondas_pacote(id_, rotulo="", grupo="micro_ondas_pacote"):
    pc = mb.importa_pacote("Microwave_01")
    it = mb.Item(id_)
    corpo = pc.pop("corpo")
    it.add(corpo)
    for nm, ob in pc.items():
        lo, hi = bbox_malha([ob])
        it.porta([ob], dobradica=(lo.x, (lo.y + hi.y) / 2, 0), lado="esq", nome="porta")
    it.slot("prato", (-0.06, 0.0, 0.035), (0.24, 0.22, 0.2))
    return it, _apoio(rotulo, grupo, ["micro-ondas", "eletro", "pacote"], pacote=True)


def panela_arroz(id_, cor="azul", cor_tampa="rosa_bebe", cor_painel="amarelo", cor_pe="laranja", rotulo="",
                 grupo="panela_arroz"):
    """Panela elétrica de arroz (a da referência): corpo fofo, aro escuro, tampa em cúpula que abre para trás."""
    it = mb.Item(id_)
    W = 0.27
    z0 = 0.012
    H = 0.17
    corpo = mb.superelipsoide(W, W, H, z=z0, cor=cor, e=0.5, e_v=0.35, nu=28, nv=12)
    corpo = subtrai(corpo, mb.cilindro(0.095, 0.2, z=z0 + H - 0.13, cor="cromo", seg=28, bisel=0))
    it.add(corpo)
    it.add(vaso([(0, 0), (0.093, 0), (0.096, 0.012), (0.096, 0.13)], 0.004, z=z0 + H - 0.128, cor="cromo", seg=28))
    it.slot("panela", (0, 0, z0 + H - 0.124), (0.17, 0.17, 0.12))
    it.add(anel(0.122, 0.096, 0.016, z=z0 + H - 0.012, cor="grafite", seg=32))
    it.add(placa(0.13, 0.05, 0.012, 0.015, y=-W / 2 + 0.01, z=z0 + 0.055, cor=cor_painel, bisel=0.005))
    for k in range(3):
        it.add(botao(-0.035 + k * 0.035, -W / 2 + 0.006, z0 + 0.08, r=0.009, cor=cor, prof=0.008))
    it.add(pes_bola(W - 0.07, W - 0.07, z0 + 0.003, cor_pe, 0.013, 0.02))
    zt = z0 + H + 0.004
    tampa = [mb.torno([(0, 0), (0.122, 0), (0.122, 0.012), (0.115, 0.04), (0.09, 0.07), (0.05, 0.088), (0, 0.093)],
                      z=zt, cor=cor_tampa, seg=32, angulo=60)]
    for k in range(10):
        a = 2 * math.pi * k / 10
        for rr_, hz in ((0.085, 0.058),):
            tampa.append(mb.esfera(0.007, x=rr_ * math.cos(a), y=rr_ * math.sin(a), z=zt + hz, cor="rosa_escuro",
                                   seg=8, esc=(1, 1, 0.6)))
    tampa.append(mb.torno([(0, 0), (0.018, 0), (0.02, 0.012), (0.014, 0.025), (0, 0.028)], z=zt + 0.088,
                          cor=cor_pe, seg=16))
    it.porta(tampa, dobradica=(0, 0.122, zt + 0.006), eixo="x", lado="cima", abre_graus=95, nome="tampa")
    return it, _apoio(rotulo, grupo, ["panela de arroz", "eletro", "tampa"])


def expresso(id_, cor="vermelho", cor2="cinza_claro", cor3="grafite", rotulo="", grupo="cafeteira_expresso"):
    """Cafeteira expresso grande (a vermelha da referência): cabeça com três manômetros, porta-filtro e bico de vapor."""
    it = mb.Item(id_)
    L, P = 0.3, 0.3
    it.add(mb.caixa(L, P, 0.045, cor=cor, bisel=0.02))
    it.add(mb.caixa(L - 0.06, 0.15, 0.01, y=-0.05, z=0.04, cor=cor2, bisel=0.004))
    for k in range(6):
        it.add(mb.caixa(L - 0.08, 0.006, 0.006, y=-0.11 + k * 0.024, z=0.049, cor=cor3, bisel=0.002))
    it.add(mb.caixa(L, 0.11, 0.3, y=P / 2 - 0.055, z=0.02, cor=cor, bisel=0.025))
    it.add(mb.caixa(L + 0.004, P, 0.12, z=0.24, cor=cor, bisel=0.03))
    it.add(placa(L - 0.05, 0.08, 0.008, 0.015, y=-P / 2 - 0.004, z=0.26, cor=cor2, bisel=0.003))
    for k in range(3):
        xg = -0.075 + k * 0.075
        it.add(mb.cilindro(0.026, 0.01, x=xg, y=-P / 2 - 0.008, z=0.3, cor=cor3, eixo="y", seg=20, bisel=0.003))
        it.add(mb.cilindro(0.019, 0.006, x=xg, y=-P / 2 - 0.012, z=0.3, cor="branco", eixo="y", seg=20, bisel=0.002))
        it.add(mb.caixa(0.004, 0.004, 0.016, x=xg, y=-P / 2 - 0.016, z=0.296, cor="vermelho_escuro", bisel=0.001))
    it.add(mb.cilindro(0.04, 0.03, y=-0.03, z=0.212, cor=cor2, seg=24, bisel=0.006))
    it.add(mb.cilindro(0.038, 0.025, y=-0.03, z=0.19, cor=cor3, seg=24, bisel=0.006))
    it.add(mb.tubo([(0.0, -0.03 - 0.03, 0.2), (0.0, -0.21, 0.19)], 0.012, cor="preto"))
    it.add(mb.esfera(0.014, y=-0.21, z=0.19, cor="preto", seg=12))
    it.add(mb.tubo([(0.12, -0.08, 0.24), (0.13, -0.11, 0.2), (0.135, -0.12, 0.1)], 0.006, cor=cor2, raio_curva=0.03))
    it.add(botao_giro(-L / 2 - 0.004 + 0.002, -0.05, 0.29, r=0.018, cor=cor3))
    mb.transforma(it.partes[-1], loc=(0, 0, 0))
    it.slot("xicara", (0, -0.06, 0.05), (0.14, 0.12, 0.13))
    return it, _apoio(rotulo, grupo, ["cafeteira", "expresso", "eletro"])


def expresso_compacta(id_, cor="salmao", cor2="cinza_claro", cor3="laranja", rotulo="",
                      grupo="cafeteira_expresso_compacta"):
    """Cafeteira de cápsula compacta (a salmão da referência): nicho para a xícara e porta-filtro colorido."""
    it = mb.Item(id_)
    L, P, A = 0.2, 0.28, 0.32
    corpo = mb.caixa(L, P, A, cor=cor, bisel=0.03)
    corpo = subtrai(corpo, mb.caixa(L - 0.05, 0.16, 0.15, y=-P / 2 - 0.02, z=0.035, cor=cor2, bisel=0.015))
    it.add(corpo)
    it.add(mb.caixa(L - 0.06, 0.13, 0.008, y=-P / 2 + 0.06, z=0.034, cor="metal", bisel=0.003))
    it.add(placa_deitada(L - 0.05, P - 0.07, 0.008, 0.02, y=0.0, z=A - 0.002, cor=cor2))
    for k in range(2):
        it.add(mb.caixa(0.022, 0.01, 0.016, x=-0.05 + k * 0.035, y=-P / 2 - 0.002, z=A - 0.06, cor="branco",
                        bisel=0.005))
    it.add(botao_giro(0.045, -P / 2 + 0.001, A - 0.06, r=0.02, cor="branco", cor2=cor))
    it.add(mb.cilindro(0.03, 0.02, y=-P / 2 + 0.07, z=0.165, cor=cor2, seg=20, bisel=0.005))
    it.add(mb.tubo([(0.0, -P / 2 + 0.05, 0.172), (0.03, -P / 2 - 0.04, 0.16)], 0.011, cor=cor3))
    it.add(mb.esfera(0.013, x=0.03, y=-P / 2 - 0.04, z=0.16, cor=cor3, seg=12))
    it.slot("xicara", (0, -P / 2 + 0.06, 0.042), (0.12, 0.1, 0.11))
    return it, _apoio(rotulo, grupo, ["cafeteira", "cápsula", "eletro"])


def lava_loucas(id_, cor="branco_gelo", cor_painel="grafite", cor_int="cinza_claro", cor_cesto="cinza", rotulo="",
                grupo="lava_loucas"):
    """Lava-louças de embutir sob a bancada: porta que abre para baixo e dois cestos que correm."""
    it = mb.Item(id_)
    L, P, A = 0.598, 0.58, 0.85
    zr = 0.1
    esp = 0.04
    yb = -P / 2 + esp / 2
    Ab = A - zr
    it.add(casco(rr(L, Ab, 0.02), rr_off(L - 0.06, Ab - 0.07, 0.015, dv=0.005), P - esp / 2, 0.03, y=yb, z=zr + Ab / 2,
                 cor=cor, bisel=0.015, cor_dentro=cor_int, nome="corpo"))
    it.add(mb.caixa(L - 0.04, 0.03, zr - 0.002, y=yb + 0.05, z=0, cor="grafite", bisel=0.008))
    it.add(mb.caixa(L - 0.04, P - 0.14, zr - 0.002, y=yb + P / 2, z=0, cor="grafite", bisel=0.008))
    zi0 = zr + Ab / 2 - (Ab - 0.07) / 2 + 0.005
    xi = (L - 0.06) / 2
    pi = P - esp / 2 - 0.03
    # trilhos e hélice
    for zz in (zi0 + 0.06, zi0 + 0.37):
        for sx in (-1, 1):
            it.add(mb.caixa(0.014, pi - 0.04, 0.014, x=sx * (xi - 0.007), y=yb + pi / 2, z=zz - 0.016, cor="metal",
                            bisel=0.004))
    it.add(mb.cilindro(0.025, 0.03, y=yb + pi / 2, z=zi0, cor="metal", seg=16, bisel=0.004))
    it.add(mb.caixa(0.38, 0.03, 0.012, y=yb + pi / 2, z=zi0 + 0.026, cor="metal", bisel=0.005))
    # cestos (gavetas de verdade, com pinos para os pratos no de baixo)
    for k, (zz, h, nome) in enumerate(((zi0 + 0.06, 0.2, "cesto_baixo"), (zi0 + 0.37, 0.15, "cesto_cima"))):
        lc, pc = 2 * xi - 0.04, pi - 0.06
        yf = yb + 0.03
        fr = [mb.caixa(lc, 0.012, h, y=yf + 0.006, z=zz, cor=cor_cesto, bisel=0.004)]
        for i in range(9 if k == 0 else 0):
            for j in range(2):
                fr.append(mb.cilindro(0.004, 0.11, x=-lc / 2 + 0.05 + i * (lc - 0.1) / 8, y=yf + 0.13 + j * 0.24,
                                      z=zz + 0.01, cor=cor_cesto, seg=6, bisel=0))
        if k == 1:
            for i in range(5):
                fr.append(mb.caixa(lc - 0.04, 0.005, 0.005, y=yf + 0.08 + i * 0.08, z=zz + 0.06, cor=cor_cesto,
                                   bisel=0.002))
        it.gaveta(lc, pc, h, fr, y_frente=yf, z=zz, cor=cor_cesto, esp=0.008, nome=nome, curso=pc * 0.75)
    # porta
    da = Ab - 0.004
    objs = [placa(L - 0.004, da, esp, 0.018, y=yb - 0.002 - esp, z=zr + 0.002, cor=cor, bisel=0.014)]
    objs.append(placa(L - 0.03, 0.07, 0.006, 0.012, y=yb - 0.002 - esp - 0.004, z=zr + da - 0.085, cor=cor_painel,
                      bisel=0.002))
    for k in range(4):
        objs.append(botao(-0.22 + k * 0.04, yb - esp - 0.006, zr + da - 0.05, r=0.009, cor="branco", prof=0.005))
    objs.append(mb.caixa(0.08, 0.004, 0.03, x=0.17, y=yb - esp - 0.008, z=zr + da - 0.065, cor=None, mat="luz",
                         bisel=0.002))
    objs.append(barra_h(-0.18, 0.18, yb - 0.002 - esp - 0.006, zr + da - 0.13, d=0.03, r=0.01, cor="metal_claro"))
    it.porta(objs, dobradica=(0, yb - 0.002 - esp / 2, zr + 0.002), eixo="x", lado="baixo", abre_graus=90,
             nome="porta")
    return it, dict(rotulo=rotulo, grupo=grupo, tags=["lava-louças", "eletro", "porta", "cestos"])


def forno_eletrico(id_, cor="vermelho", cor_porta="grafite", cor_int="cinza_claro", cor_bot="branco", rotulo="",
                   grupo="forno_eletrico"):
    """Forno elétrico de bancada: porta de vidro que abre para baixo, grade dentro e três botões."""
    it = mb.Item(id_)
    L, P, A = 0.5, 0.38, 0.3
    z0 = 0.02
    yb = -P / 2 + 0.014
    lc, ac = 0.35, A - 0.06
    du = -L / 2 + 0.025 + lc / 2
    it.add(casco(rr(L, A, 0.04), rr_off(lc, ac, 0.015, du=du), P - 0.014, 0.025, y=yb, z=z0 + A / 2, cor=cor,
                 bisel=0.028, cor_dentro=cor_int, nome="corpo"))
    it.add(pes_bola(L - 0.06, P - 0.08, z0 + 0.004, "grafite", 0.016, 0.03))
    zc0 = z0 + A / 2 - ac / 2
    # grade (de arame) e resistência
    gx0, gx1 = du - lc / 2 + 0.01, du + lc / 2 - 0.01
    gy0, gy1 = yb + 0.03, yb + P - 0.05
    zg = zc0 + 0.07
    gr = [mb.tubo([(gx0, gy0, zg), (gx1, gy0, zg), (gx1, gy1, zg), (gx0, gy1, zg)], 0.004, cor="metal", fechado=True,
                  raio_curva=0.01)]
    for k in range(7):
        xx = gx0 + 0.025 + k * (gx1 - gx0 - 0.05) / 6
        gr.append(mb.tubo([(xx, gy0, zg), (xx, gy1, zg)], 0.003, cor="metal", tampas=False))
    it.add(gr)
    for sx in (gx0 - 0.003, gx1 + 0.003):
        it.add(mb.caixa(0.008, gy1 - gy0, 0.008, x=sx, y=(gy0 + gy1) / 2, z=zg - 0.008, cor="metal", bisel=0.002))
    it.add(mb.tubo([(gx0 + 0.02, gy1, zc0 + ac - 0.03), (gx0 + 0.02, gy0 + 0.04, zc0 + ac - 0.03),
                    (gx1 - 0.02, gy0 + 0.04, zc0 + ac - 0.03), (gx1 - 0.02, gy1, zc0 + ac - 0.03)], 0.005,
                   cor="laranja_escuro", raio_curva=0.02))
    it.slot("grade", (du, (gy0 + gy1) / 2, zg + 0.004), (lc - 0.04, gy1 - gy0 - 0.02, ac - 0.12))
    xp = L / 2 - 0.065
    for k in range(3):
        it.add(botao_giro(xp, yb - 0.001, z0 + A - 0.07 - k * 0.075, r=0.02, cor=cor_bot, cor2=cor))
    dl, da, esp = lc + 0.04, A - 0.016, 0.024
    objs = _porta_visor(dl, da, esp, cor_porta, r=0.03, marg=0.04, x=du, y=yb - 0.002 - esp, z=z0 + 0.008)
    objs.append(barra_h(du - 0.12, du + 0.12, yb - 0.002 - esp, z0 + da - 0.02, d=0.028, r=0.008, cor="metal_claro"))
    it.porta(objs, dobradica=(du, yb - 0.002 - esp / 2, z0 + 0.008), eixo="x", lado="baixo", abre_graus=88,
             nome="porta")
    return it, _apoio(rotulo, grupo, ["forno", "eletro", "porta"])


def air_fryer(id_, cor="preto", cor2="grafite", cor_cesto="grafite_escuro", cor_detalhe="laranja", rotulo="",
              grupo="air_fryer"):
    """Fritadeira sem óleo: corpo arredondado, painel no alto e cesto que sai como gaveta."""
    it = mb.Item(id_)
    L, P, A = 0.29, 0.34, 0.33
    z0 = 0.01
    yb = -P / 2
    la, aa = 0.23, 0.16
    it.add(casco(rr(L, A, 0.09, seg=6), rr_off(la, aa, 0.035, dv=-A / 2 + 0.035 + aa / 2, seg=6), P, 0.03, y=yb,
                 z=z0 + A / 2, cor=cor, bisel=0.05, cor_dentro=cor_cesto, nome="corpo"))
    it.add(pes_bola(L - 0.1, P - 0.1, z0 + 0.012, cor2, 0.016, 0.0))
    # painel de cima (tela redonda e botões) na frente inclinada
    it.add(mb.cilindro(0.045, 0.01, y=-0.03, z=z0 + A - 0.004, cor=cor2, seg=28, bisel=0.003))
    it.add(mb.cilindro(0.032, 0.006, y=-0.03, z=z0 + A + 0.003, cor="tela_azul", seg=28, bisel=0.002))
    it.add(mb.caixa(0.03, 0.004, 0.012, y=-0.03, z=z0 + A + 0.008, cor="brasa", bisel=0.001))
    for sx in (-1, 1):
        it.add(botao(sx * 0.075, -0.03, z0 + A - 0.012, r=0.011, cor=cor_detalhe, eixo="z", prof=0.012))
    zg = z0 + 0.035
    fr = [placa(la + 0.03, aa + 0.012, 0.02, 0.04, y=yb - 0.02, z=zg - 0.006, cor=cor, bisel=0.008)]
    pega = mb.superelipsoide(0.055, 0.075, 0.13, y=yb - 0.045, z=zg + 0.005, cor=cor2, e=0.45, e_v=0.45)
    mb.transforma(pega, rot=("X", 12), loc=(0, 0, 0))
    fr.append(pega)
    fr.append(mb.caixa(0.026, 0.03, 0.014, y=yb - 0.06, z=zg + 0.122, cor=cor_detalhe, bisel=0.006))
    it.gaveta(la - 0.01, P - 0.08, aa - 0.015, fr, y_frente=yb, z=zg + 0.004, cor=cor_cesto, esp=0.008, nome="cesto",
              curso=0.2)
    return it, _apoio(rotulo, grupo, ["air fryer", "fritadeira", "eletro", "gaveta"])


def sanduicheira(id_, cor="vermelho", cor2="grafite", rotulo="", grupo="sanduicheira"):
    """Sanduicheira: duas conchas boleadas, chapas escuras por dentro, tampa que abre para trás."""
    it = mb.Item(id_)
    L, P = 0.25, 0.27
    h = 0.05
    base = mb.superelipsoide(L, P, h * 2, z=0.0, cor=cor, e=0.35, e_v=0.45, nu=28, nv=12)
    bm_corta_metade(base, h, cor=cor)
    it.add(base)
    it.add(placa_deitada(L - 0.04, P - 0.05, 0.008, 0.03, z=h - 0.004, cor=cor2))
    for k in range(4):
        it.add(mb.caixa(L - 0.07, 0.006, 0.004, y=-0.08 + k * 0.053, z=h + 0.003, cor="grafite_escuro", bisel=0.0015))
    it.add(mb.caixa(0.05, 0.02, 0.015, y=-P / 2 - 0.008, z=h - 0.02, cor=cor2, bisel=0.006))
    it.add(pes_bola(L - 0.08, P - 0.08, 0.008, cor2, 0.012, 0.02))
    for p_ in it.partes[-4:]:
        mb.transforma(p_, loc=(0, 0, -0.004))
    for p_ in it.partes:
        mb.transforma(p_, loc=(0, 0, 0.004))
    it.slot("chapa", (0, 0, h + 0.006), (L - 0.07, P - 0.08, 0.04))
    tampa = mb.superelipsoide(L, P, h * 2, z=0.0, cor=cor, e=0.35, e_v=0.45, nu=28, nv=12)
    bm_corta_metade(tampa, h, cima=True, cor=cor)
    mb.transforma(tampa, loc=(0, 0, 0.003))
    t = [tampa, placa_deitada(L - 0.04, P - 0.05, 0.008, 0.03, z=h + 0.0, cor=cor2)]
    t.append(mb.caixa(0.06, 0.035, 0.022, y=-P / 2 - 0.006, z=h + 0.008, cor=cor2, bisel=0.008))
    t.append(mb.cilindro(0.006, 0.004, x=0.06, y=-0.06, z=2 * h, cor=None, mat="luz", seg=10, bisel=0.001))
    t.append(mb.cilindro(0.006, 0.004, x=0.08, y=-0.06, z=2 * h, cor="verde", seg=10, bisel=0.001))
    for o in t:
        mb.transforma(o, loc=(0, 0, 0.004))
    it.porta(t, dobradica=(0, P / 2 - 0.01, h + 0.006), eixo="x", lado="cima", abre_graus=80, nome="tampa")
    return it, _apoio(rotulo, grupo, ["sanduicheira", "eletro", "tampa"])


def bm_corta_metade(ob, h, cima=False, cor=None):
    """Corta uma forma no plano z = h e fecha o corte (fica a metade de baixo, ou a de cima com cima=True)."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    r = bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, h), plane_no=(0, 0, 1), clear_outer=not cima,
                               clear_inner=cima)
    borda = [e for e in r["geom_cut"] if isinstance(e, bmesh.types.BMEdge)]
    if borda:
        f = bmesh.ops.edgeloop_fill(bm, edges=borda)
        bmesh.ops.triangulate(bm, faces=f["faces"], quad_method="BEAUTY", ngon_method="BEAUTY")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(ob.data)
    bm.free()
    if cor:
        mb.pinta(ob, cor)
    return ob


def cafeteira_filtro(id_, cor="preto", cor2="vermelho", rotulo="", grupo="cafeteira_filtro"):
    """Cafeteira elétrica de filtro: torre com reservatório, tampa que abre para trás e jarra de vidro na chapa."""
    it = mb.Item(id_)
    L, P = 0.2, 0.26
    it.add(mb.caixa(L, P, 0.04, cor=cor, bisel=0.016))
    it.add(mb.cilindro(0.07, 0.006, y=-0.04, z=0.039, cor="grafite_escuro", seg=24, bisel=0.002))
    it.add(mb.caixa(L, 0.1, 0.34, y=P / 2 - 0.05, z=0.02, cor=cor, bisel=0.02))
    it.add(mb.caixa(0.03, 0.004, 0.18, x=0.06, y=P / 2 - 0.1 - 0.001, z=0.1, cor=None, mat="vidro", bisel=0.001))
    it.add(mb.caixa(L, P, 0.07, z=0.29, cor=cor, bisel=0.022))
    it.add(botao(0.06, -P / 2 + 0.0, 0.02, r=0.012, cor=cor2, prof=0.008))
    it.add(mb.cilindro(0.005, 0.004, x=0.03, y=-P / 2 - 0.0, z=0.02, cor=None, mat="luz", eixo="y", seg=10))
    # jarra
    it.add(vaso([(0, 0), (0.065, 0), (0.075, 0.03), (0.075, 0.1), (0.06, 0.15), (0.055, 0.17)], 0.003, y=-0.04,
                z=0.045, cor=None, mat="vidro", seg=28))
    it.add(mb.torno([(0, 0), (0.07, 0), (0.073, 0.02), (0.074, 0.075), (0, 0.075)], y=-0.04, z=0.049,
                    cor="chocolate", seg=28))
    it.add(mb.torno([(0, 0), (0.058, 0), (0.058, 0.02), (0.04, 0.03), (0, 0.03)], y=-0.04, z=0.21, cor=cor, seg=24))
    it.add(alca_caneca(0.075, -0.04, 0.09, 0.2, 0.05, r=0.009, cor=cor))
    it.add(mb.caixa(0.03, 0.04, 0.012, x=-0.07, y=-0.04, z=0.21, cor=cor, bisel=0.005))
    t = [placa_deitada(L - 0.03, P - 0.05, 0.014, 0.025, z=0.358, cor=cor2, bisel=0.006),
         mb.caixa(0.06, 0.02, 0.01, y=-P / 2 + 0.04, z=0.37, cor=cor, bisel=0.004)]
    it.porta(t, dobradica=(0, P / 2 - 0.03, 0.365), eixo="x", lado="cima", abre_graus=85, nome="tampa")
    it.slot("reservatorio", (0, P / 2 - 0.08, 0.3), (0.12, 0.12, 0.05))
    return it, _apoio(rotulo, grupo, ["cafeteira", "filtro", "eletro", "tampa"])


def torradeira(id_, cor="vermelho", cor2="vermelho_escuro", cor_pux="cinza_claro", rotulo="", grupo="torradeira"):
    """Torradeira de duas fendas (a vermelha e a turquesa da referência), com alavanca na frente."""
    it = mb.Item(id_)
    L, P, A = 0.27, 0.16, 0.19
    z0 = 0.016
    corpo = mb.caixa(L, P, A, z=z0, cor=cor, bisel=0.045, seg=4)
    cortes = [mb.caixa(0.032, 0.115, 0.17, x=sx * 0.042, z=z0 + A - 0.15, cor="grafite_escuro", bisel=0.008)
              for sx in (-1, 1)]
    corpo = subtrai(corpo, cortes)
    it.add(corpo)
    it.add(placa_deitada(L + 0.012, P + 0.012, z0 + 0.002, 0.04, z=0, cor=cor2, bisel=0.006))
    for sx in (-1, 1):
        it.add(mb.caixa(0.026, 0.1, 0.006, x=sx * 0.042, z=z0 + A - 0.152, cor="grafite", bisel=0.002))
        it.slot(f"fenda_{1 if sx < 0 else 2}", (sx * 0.042, 0, z0 + A - 0.146), (0.026, 0.11, 0.14))
    it.add(mb.caixa(0.01, 0.006, 0.08, x=0.0, y=-P / 2 + 0.001, z=z0 + 0.04, cor=cor2, bisel=0.003))
    it.add(mb.caixa(0.06, 0.03, 0.016, x=0.0, y=-P / 2 - 0.014, z=z0 + 0.06, cor=cor_pux, bisel=0.007))
    it.add(botao_giro(0.085, -P / 2 + 0.003, z0 + 0.06, r=0.016, cor=cor_pux, cor2=cor2))
    it.add(botao(-0.085, -P / 2 + 0.002, z0 + 0.06, r=0.01, cor=cor_pux, prof=0.008))
    return it, _apoio(rotulo, grupo, ["torradeira", "eletro"])


def chaleira_eletrica(id_, cor="azul_celeste", cor2="roxo", rotulo="", grupo="chaleira_eletrica"):
    """Chaleira elétrica (a azul e roxa da referência): base, visor de água, alça alta e tampa que abre de lado."""
    it = mb.Item(id_)
    it.add(mb.torno([(0, 0), (0.095, 0), (0.1, 0.008), (0.1, 0.022), (0.094, 0.03), (0, 0.03)], cor=cor2, seg=32))
    corpo = vaso([(0, 0), (0.085, 0), (0.09, 0.012), (0.09, 0.15), (0.084, 0.2)], 0.004, z=0.03, cor=cor, seg=32)
    it.add(corpo)
    it.add(mb.caixa(0.016, 0.006, 0.11, x=-0.03, y=-0.087, z=0.07, cor="cinza", bisel=0.003))
    mb.transforma(it.partes[-1], loc=(0, 0, 0))
    it.add(mb.tubo([(0.084, 0, 0.215), (0.13, 0, 0.21), (0.135, 0, 0.17), (0.13, 0, 0.07), (0.088, 0, 0.06)], 0.014,
                   cor=cor2, raio_curva=0.03))
    it.add(mb.superelipsoide(0.05, 0.05, 0.05, x=-0.09, z=0.17, cor=cor, e=0.6))
    it.slot("agua", (0, 0, 0.038), (0.12, 0.12, 0.17))
    t = [mb.torno([(0, 0), (0.088, 0), (0.088, 0.008), (0.07, 0.018), (0, 0.022)], z=0.228, cor=cor2, seg=32),
         mb.cilindro(0.022, 0.012, x=-0.02, z=0.246, cor=cor, seg=16, bisel=0.004),
         mb.caixa(0.045, 0.03, 0.02, x=0.045, z=0.24, cor=cor2, bisel=0.009)]
    it.porta(t, dobradica=(0.082, 0, 0.232), eixo="y", angulo=95, nome="tampa")
    return it, _apoio(rotulo, grupo, ["chaleira", "elétrica", "eletro", "tampa"])


def liquidificador(id_, cor="roxo", cor2="lilas", rotulo="", grupo="liquidificador"):
    """Liquidificador (o roxo da referência): base boleada com botão, copo de vidro com alça e tampa."""
    it = mb.Item(id_)
    it.add(mb.torno([(0, 0), (0.08, 0), (0.085, 0.01), (0.078, 0.06), (0.07, 0.1), (0.062, 0.11), (0, 0.11)],
                    cor=cor, seg=32))
    it.add(botao_giro(0, -0.074, 0.05, r=0.022, cor=cor2, cor2="branco"))
    mb.transforma(it.partes[-1], rot=("X", -8))
    mb.transforma(it.partes[-1], loc=(0, 0.0, 0.006))
    it.add(mb.cilindro(0.058, 0.02, z=0.105, cor="grafite", seg=28, bisel=0.004))
    it.add(vaso([(0, 0), (0.05, 0), (0.06, 0.04), (0.08, 0.2), (0.082, 0.22)], 0.003, z=0.124, cor=None, mat="vidro",
                seg=28))
    for k in range(2):
        it.add(mb.caixa(0.08, 0.012, 0.003, z=0.135 + k * 0.005, cor="metal", bisel=0.001))
        mb.transforma(it.partes[-1], rot=("Z", 90 * k + 20), loc=(0, 0, 0))
    it.add(mb.tubo([(0.075, 0, 0.32), (0.12, 0, 0.31), (0.12, 0, 0.18), (0.06, 0, 0.16)], 0.012, cor="cinza_claro",
                   raio_curva=0.025))
    it.add(mb.torno([(0, 0), (0.086, 0), (0.086, 0.016), (0.07, 0.03), (0, 0.032)], z=0.344, cor=cor2, seg=28))
    it.add(mb.torno([(0, 0), (0.02, 0), (0.022, 0.015), (0.012, 0.03), (0, 0.032)], z=0.372, cor=cor, seg=16))
    it.slot("copo", (0, 0, 0.13), (0.1, 0.1, 0.2))
    return it, _apoio(rotulo, grupo, ["liquidificador", "eletro"])


def batedeira_planetaria(id_, cor="turquesa", cor_tigela="rosa_bebe", cor2="vermelho", rotulo="",
                         grupo="batedeira_planetaria"):
    """Batedeira planetária (a turquesa da referência): coluna, cabeça arredondada, tigela e batedor de arame."""
    it = mb.Item(id_)
    it.add(placa_deitada(0.22, 0.34, 0.035, 0.07, cor=cor, bisel=0.014))
    it.add(mb.superelipsoide(0.12, 0.12, 0.28, y=0.1, z=0.02, cor=cor, e=0.45, e_v=0.25))
    it.add(mb.superelipsoide(0.15, 0.32, 0.12, y=0.0, z=0.24, cor=cor, e=0.5, e_v=0.6))
    it.add(mb.torno([(0, 0), (0.035, 0), (0.035, 0.012), (0, 0.012)], y=-0.07, z=0.232, cor=cor, seg=20))
    it.add(mb.cilindro(0.012, 0.05, y=-0.07, z=0.19, cor="metal", seg=12, bisel=0.003))
    bat = []
    for k in range(4):
        a = k * 45
        pts = [(0.0, 0, 0.0), (0.042, 0, -0.058), (0.0, 0, -0.1), (-0.042, 0, -0.058), (0, 0, 0)]
        tb = mb.tubo(pts, 0.0025, cor="metal", raio_curva=0.02, tampas=False, seg=6)
        mb.transforma(tb, rot=("Z", a))
        mb.transforma(tb, loc=(0, -0.07, 0.195))
        bat.append(tb)
    it.add(bat)
    it.add(vaso([(0, 0), (0.05, 0), (0.08, 0.03), (0.095, 0.08), (0.098, 0.12)], 0.005, y=-0.07, z=0.034,
                cor=cor_tigela, seg=32))
    it.add(mb.cilindro(0.055, 0.004, y=-0.07, z=0.033, cor="metal", seg=24, bisel=0.001))
    it.add(botao(0.06, 0.1, 0.27, r=0.016, cor=cor2, prof=0.012))
    mb.transforma(it.partes[-1], rot=("Z", 90), loc=(0, 0, 0))
    it.partes[-1].data.transform(Matrix.Translation((0.1 + 0.06, -0.1 + 0.1 - 0.06 + 0.02, 0)))
    it.add(mb.esfera(0.012, x=0.0, y=-0.15, z=0.33, cor=cor2, seg=12, esc=(1, 0.6, 1)))
    it.slot("tigela", (0, -0.07, 0.04), (0.14, 0.14, 0.1))
    return it, _apoio(rotulo, grupo, ["batedeira", "planetária", "eletro"])


def batedeira_mao(id_, cor="azul_celeste", cor2="verde_lima", cor3="vermelho", rotulo="", grupo="batedeira_mao"):
    """Batedeira de mão (a da referência): corpo de cápsula em pé, painel colorido e dois batedores."""
    it = mb.Item(id_)
    zc = 0.1
    it.add(mb.superelipsoide(0.085, 0.07, 0.2, z=zc, cor=cor, e=0.6, e_v=0.5))
    it.add(mb.superelipsoide(0.06, 0.03, 0.1, y=-0.024, z=zc + 0.03, cor=cor2, e=0.5, e_v=0.5))
    it.add(mb.esfera(0.013, y=-0.028, z=zc + 0.165, cor=cor3, seg=12, esc=(1, 0.8, 1)))
    for sx in (-1, 1):
        it.add(mb.cilindro(0.004, 0.06, x=sx * 0.02, z=zc - 0.05, cor="metal", seg=8, bisel=0.001))
        for k in range(3):
            pts = [(0.0, 0, 0.0), (0.021, 0, -0.03), (0.0, 0, -0.054), (-0.021, 0, -0.03), (0, 0, 0)]
            tb = mb.tubo(pts, 0.002, cor="metal", raio_curva=0.01, tampas=False, seg=6)
            mb.transforma(tb, rot=("Z", k * 60))
            mb.transforma(tb, loc=(sx * 0.02, 0, 0.056))
            it.add(tb)
    lo, _ = bbox_malha(it.partes)
    for o in it.partes:
        mb.transforma(o, loc=(0, 0, -lo.z))
    return it, _apoio(rotulo, grupo, ["batedeira", "de mão", "eletro"])


def balanca(id_, cor="vermelho", cor_prato="amarelo", rotulo="", grupo="balanca_cozinha"):
    """Balança de cozinha de ponteiro (a vermelha da referência) com prato amarelo."""
    it = mb.Item(id_)
    it.add(mb.caixa(0.17, 0.15, 0.09, cor=cor, bisel=0.03))
    it.add(mb.cilindro(0.037, 0.008, y=-0.074, z=0.047, cor="branco", eixo="y", seg=28, bisel=0.003))
    it.add(anel(0.042, 0.036, 0.008, cor="grafite", seg=28))
    mb.transforma(it.partes[-1], rot=("X", 90), loc=(0, -0.075, 0.047))
    it.add(mb.caixa(0.004, 0.004, 0.028, x=0.006, y=-0.08, z=0.047, cor="vermelho_escuro", bisel=0.001))
    mb.transforma(it.partes[-1], loc=(0, 0, 0))
    it.add(mb.cilindro(0.008, 0.006, y=-0.08, z=0.047, cor="grafite", eixo="y", seg=12, bisel=0.002))
    it.add(mb.cilindro(0.025, 0.02, z=0.088, cor=cor, seg=20, bisel=0.006))
    it.add(vaso([(0, 0), (0.03, 0), (0.08, 0.025), (0.1, 0.045)], 0.004, z=0.105, cor=cor_prato, seg=32))
    it.slot("prato", (0, 0, 0.11), (0.12, 0.12, 0.08))
    return it, _apoio(rotulo, grupo, ["balança", "utensílio"])


def bule_cafe(id_, cor="amarelo_claro", cor2="marrom", vidro=False, rotulo="", grupo="bule_cafe"):
    """Bule de café de vidro/cerâmica (o amarelo da referência): bojo, gola marrom, bico e alça."""
    it = mb.Item(id_)
    ext = [(0, 0), (0.06, 0), (0.07, 0.03), (0.072, 0.07), (0.06, 0.12), (0.045, 0.15), (0.042, 0.17)]
    if vidro:
        it.add(vaso(ext, 0.003, cor=None, mat="vidro", seg=28))
        it.add(mb.torno([(0, 0), (0.063, 0), (0.07, 0.03), (0.069, 0.07), (0, 0.07)], z=0.004, cor="chocolate",
                        seg=28))
    else:
        it.add(vaso(ext, 0.005, cor=cor, seg=28))
    it.add(mb.torno([(0.04, 0), (0.05, 0), (0.05, 0.04), (0.046, 0.045), (0.04, 0.045)], z=0.135, cor=cor2, seg=28))
    it.add(mb.torno([(0, 0), (0.06, 0), (0.062, 0.012), (0.056, 0.016), (0, 0.016)], z=0.0, cor=cor2, seg=28))
    it.add(alca_caneca(0.05, 0, 0.07, 0.17, 0.05, r=0.009, cor=cor2))
    it.add(mb.cilindro(0.012, 0.03, r2=0.006, x=-0.055, z=0.155, cor=cor2, seg=12, bisel=0.002))
    mb.transforma(it.partes[-1], loc=(0, 0, 0))
    it.add(mb.torno([(0, 0), (0.044, 0), (0.044, 0.008), (0.03, 0.016), (0, 0.018)], z=0.178, cor=cor2, seg=24))
    return it, _apoio(rotulo, grupo, ["bule", "café", "louça"])


def chaleira(id_, cor="azul_acinzentado", cor2="amarelo", rotulo="", grupo="chaleira"):
    """Chaleira de fogão (a da referência): bojo achatado, bico curvo e alça em arco."""
    it = mb.Item(id_)
    it.add(mb.torno([(0, 0), (0.08, 0), (0.095, 0.02), (0.1, 0.05), (0.09, 0.09), (0.06, 0.115), (0.035, 0.12),
                     (0, 0.12)], cor=cor, seg=32))
    it.add(mb.tubo([(-0.08, 0, 0.05), (-0.12, 0, 0.09), (-0.14, 0, 0.12)], 0.014, cor=cor, raio_curva=0.04))
    it.add(mb.torno([(0, 0), (0.04, 0), (0.04, 0.01), (0.02, 0.02), (0.012, 0.03), (0.016, 0.04), (0, 0.042)],
                    z=0.116, cor=cor2, seg=20))
    for sx in (-1, 1):
        it.add(mb.cilindro(0.01, 0.025, x=sx * 0.06, z=0.095, cor=cor2, seg=10, bisel=0.003))
    it.add(alca_arco(0, 0, 0.115, 0.13, 0.1, r=0.011, cor=cor2))
    return it, _apoio(rotulo, grupo, ["chaleira", "fogão", "louça"])


def panela_pressao(id_, cor="metal_claro", cor2="preto", rotulo="", grupo="panela_pressao"):
    """Panela de pressão: corpo de metal, tampa com cabo comprido e válvula."""
    it = mb.Item(id_)
    it.add(vaso([(0, 0), (0.1, 0), (0.11, 0.01), (0.11, 0.15)], 0.004, cor=cor, seg=32))
    it.add(mb.torno([(0, 0), (0.116, 0), (0.116, 0.014), (0.1, 0.03), (0.04, 0.045), (0, 0.046)], z=0.146, cor=cor,
                    seg=32))
    it.add(mb.cilindro(0.012, 0.03, z=0.185, cor=cor2, seg=12, bisel=0.004))
    it.add(mb.cilindro(0.008, 0.012, z=0.212, cor="vermelho", seg=10, bisel=0.003))
    it.add(mb.caixa(0.2, 0.035, 0.03, x=-0.21, z=0.15, cor=cor2, bisel=0.012))
    it.add(mb.caixa(0.12, 0.03, 0.026, x=0.17, z=0.105, cor=cor2, bisel=0.011))
    it.add(mb.caixa(0.04, 0.03, 0.03, x=-0.1, z=0.152, cor=cor, bisel=0.008))
    return it, _apoio(rotulo, grupo, ["panela", "pressão", "fogão"])


def filtro_barro(id_, cor="terracota", cor2="terracota_escura", cor_torneira="cromo", rotulo="", grupo="filtro_barro"):
    """Filtro de barro (o clássico de duas talhas): talha de baixo com torneira, de cima com tampa."""
    it = mb.Item(id_)
    it.add(mb.torno([(0, 0), (0.1, 0), (0.105, 0.012), (0.135, 0.08), (0.14, 0.16), (0.125, 0.25), (0.11, 0.29),
                     (0.112, 0.3), (0, 0.3)], cor=cor, seg=32))
    it.add(mb.torno([(0.098, 0), (0.12, 0), (0.122, 0.012), (0.1, 0.016), (0.098, 0.016)], z=0.297, cor=cor2, seg=32))
    it.add(mb.torno([(0, 0), (0.09, 0), (0.12, 0.05), (0.13, 0.13), (0.12, 0.2), (0.122, 0.21), (0, 0.21)],
                    z=0.3, cor=cor, seg=32))
    for zz in (0.12, 0.42):
        it.add(anel(0.141 if zz < 0.3 else 0.131, 0.13 if zz < 0.3 else 0.12, 0.014, z=zz, cor=cor2, seg=32))
    it.add(mb.torno([(0, 0), (0.125, 0), (0.127, 0.012), (0.1, 0.03), (0.04, 0.045), (0, 0.046)], z=0.51, cor=cor2,
                    seg=32))
    it.add(mb.torno([(0, 0), (0.016, 0), (0.02, 0.02), (0.012, 0.03), (0, 0.032)], z=0.552, cor=cor2, seg=16))
    it.add(mb.cilindro(0.015, 0.04, y=-0.15, z=0.06, cor=cor_torneira, eixo="y", seg=14, bisel=0.004))
    it.add(mb.tubo([(0, -0.165, 0.06), (0, -0.175, 0.04)], 0.007, cor=cor_torneira))
    it.add(mb.caixa(0.04, 0.012, 0.01, y=-0.16, z=0.075, cor=cor_torneira, bisel=0.004))
    return it, _apoio(rotulo, grupo, ["filtro de água", "barro", "utensílio"])


def lixeira_pedal(id_, cor="metal_claro", cor2="preto", rotulo="", grupo="lixeira_pedal"):
    """Lixeira de pedal: balde de verdade por dentro e tampa que abre para trás."""
    it = mb.Item(id_)
    it.add(vaso([(0, 0), (0.13, 0), (0.135, 0.01), (0.145, 0.39)], 0.006, cor=cor, seg=32))
    it.add(mb.torno([(0, 0), (0.13, 0), (0.132, 0.02), (0, 0.02)], z=-0.0, cor=cor2, seg=32))
    it.add(anel(0.149, 0.139, 0.012, z=0.386, cor=cor2, seg=32))
    it.add(mb.caixa(0.1, 0.07, 0.025, y=-0.16, z=0.01, cor=cor2, bisel=0.01))
    it.add(mb.caixa(0.07, 0.03, 0.03, y=0.142, z=0.37, cor=cor2, bisel=0.008))
    it.slot("dentro", (0, 0, 0.008), (0.18, 0.18, 0.36))
    t = [mb.torno([(0, 0), (0.15, 0), (0.15, 0.015), (0.12, 0.04), (0.05, 0.055), (0, 0.056)], z=0.398, cor=cor,
                  seg=32)]
    it.porta(t, dobradica=(0, 0.15, 0.4), eixo="x", lado="cima", abre_graus=85, nome="tampa")
    return it, dict(rotulo=rotulo, grupo=grupo, tags=["lixeira", "pedal", "tampa"])


for _id, _fn, _kw in [
    ("micro_ondas_rosa", micro_ondas, dict(rotulo="Micro-ondas de teclas (rosa)")),
    ("micro_ondas_branco", micro_ondas, dict(cor="branco", cor_bot="cinza_medio", cor_pe="cinza",
                                             rotulo="Micro-ondas de teclas (branco)")),
    ("micro_ondas_lilas", micro_ondas, dict(cor="lilas_claro", cor_bot="roxo", cor_pe="roxo",
                                            rotulo="Micro-ondas de teclas (lilás)")),
    ("micro_ondas_retro_azul", micro_ondas_retro, dict(rotulo="Micro-ondas retrô (azul e mostarda)")),
    ("micro_ondas_retro_menta", micro_ondas_retro, dict(cor="menta", cor2="laranja", cor_int="creme_claro",
                                                        rotulo="Micro-ondas retrô (menta e laranja)")),
    ("micro_ondas_retro_creme", micro_ondas_retro, dict(cor="creme", cor2="vermelho", cor_int="creme_claro",
                                                        rotulo="Micro-ondas retrô (creme e vermelho)")),
    ("micro_ondas_pacote", micro_ondas_pacote, dict(rotulo="Micro-ondas rosa (pacote)")),
    ("panela_arroz_azul", panela_arroz, dict(rotulo="Panela elétrica de arroz (azul)")),
    ("panela_arroz_verde", panela_arroz, dict(cor="verde_claro", cor_tampa="amarelo_claro", cor_painel="branco",
                                              cor_pe="verde_medio", rotulo="Panela elétrica de arroz (verde)")),
    ("panela_arroz_branca", panela_arroz, dict(cor="branco", cor_tampa="vermelho_claro", cor_painel="vermelho",
                                               cor_pe="grafite", rotulo="Panela elétrica de arroz (branca)")),
    ("cafeteira_expresso_vermelha", expresso, dict(rotulo="Cafeteira expresso (vermelha)")),
    ("cafeteira_expresso_turquesa", expresso, dict(cor="turquesa", rotulo="Cafeteira expresso (turquesa)")),
    ("cafeteira_expresso_creme", expresso, dict(cor="creme", cor3="marrom", rotulo="Cafeteira expresso (creme)")),
    ("cafeteira_capsula_salmao", expresso_compacta, dict(rotulo="Cafeteira de cápsula (salmão)")),
    ("cafeteira_capsula_amarela", expresso_compacta, dict(cor="amarelo", cor3="azul",
                                                          rotulo="Cafeteira de cápsula (amarela)")),
    ("lava_loucas_branca", lava_loucas, dict(rotulo="Lava-louças (branca)")),
    ("lava_loucas_inox", lava_loucas, dict(cor="metal_claro", cor_painel="preto", rotulo="Lava-louças (inox)")),
    ("forno_eletrico_vermelho", forno_eletrico, dict(rotulo="Forno elétrico de bancada (vermelho)")),
    ("forno_eletrico_creme", forno_eletrico, dict(cor="creme", cor_porta="marrom", cor_bot="marrom",
                                                  rotulo="Forno elétrico de bancada (creme)")),
    ("air_fryer_preta", air_fryer, dict(rotulo="Air fryer (preta)")),
    ("air_fryer_branca", air_fryer, dict(cor="branco", cor2="cinza_claro", cor_detalhe="turquesa",
                                         rotulo="Air fryer (branca)")),
    ("air_fryer_menta", air_fryer, dict(cor="menta", cor2="verde_agua", cor_detalhe="rosa", rotulo="Air fryer (menta)")),
    ("sanduicheira_vermelha", sanduicheira, dict(rotulo="Sanduicheira (vermelha)")),
    ("sanduicheira_amarela", sanduicheira, dict(cor="amarelo", rotulo="Sanduicheira (amarela)")),
    ("cafeteira_filtro_preta", cafeteira_filtro, dict(rotulo="Cafeteira elétrica de filtro (preta)")),
    ("cafeteira_filtro_azul", cafeteira_filtro, dict(cor="azul", cor2="amarelo",
                                                     rotulo="Cafeteira elétrica de filtro (azul)")),
    ("torradeira_vermelha", torradeira, dict(rotulo="Torradeira (vermelha)")),
    ("torradeira_turquesa", torradeira, dict(cor="turquesa", cor2="vermelho_claro", rotulo="Torradeira (turquesa)")),
    ("torradeira_amarela", torradeira, dict(cor="amarelo", cor2="laranja", rotulo="Torradeira (amarela)")),
    ("chaleira_eletrica_azul", chaleira_eletrica, dict(rotulo="Chaleira elétrica (azul e roxa)")),
    ("chaleira_eletrica_rosa", chaleira_eletrica, dict(cor="rosa_bebe", cor2="verde_agua",
                                                       rotulo="Chaleira elétrica (rosa e verde-água)")),
    ("liquidificador_roxo", liquidificador, dict(rotulo="Liquidificador (roxo)")),
    ("liquidificador_vermelho", liquidificador, dict(cor="vermelho", cor2="cinza_claro",
                                                     rotulo="Liquidificador (vermelho)")),
    ("batedeira_planetaria_turquesa", batedeira_planetaria, dict(rotulo="Batedeira planetária (turquesa)")),
    ("batedeira_planetaria_amarela", batedeira_planetaria, dict(cor="amarelo", cor_tigela="azul_claro", cor2="azul",
                                                                rotulo="Batedeira planetária (amarela)")),
    ("batedeira_planetaria_rosa", batedeira_planetaria, dict(cor="rosa", cor_tigela="branco", cor2="roxo",
                                                             rotulo="Batedeira planetária (rosa)")),
    ("batedeira_mao_azul", batedeira_mao, dict(rotulo="Batedeira de mão (azul)")),
    ("batedeira_mao_laranja", batedeira_mao, dict(cor="laranja", cor2="amarelo_claro", cor3="verde",
                                                  rotulo="Batedeira de mão (laranja)")),
    ("balanca_cozinha_vermelha", balanca, dict(rotulo="Balança de cozinha (vermelha)")),
    ("balanca_cozinha_verde", balanca, dict(cor="verde_agua", cor_prato="rosa_claro",
                                            rotulo="Balança de cozinha (verde-água)")),
    ("bule_cafe_amarelo", bule_cafe, dict(rotulo="Bule de café (amarelo)")),
    ("bule_cafe_vidro", bule_cafe, dict(vidro=True, cor2="preto", rotulo="Bule de café de vidro")),
    ("chaleira_azul", chaleira, dict(rotulo="Chaleira (azul-acinzentada)")),
    ("chaleira_vermelha", chaleira, dict(cor="vermelho", cor2="preto", rotulo="Chaleira (vermelha)")),
    ("panela_pressao_inox", panela_pressao, dict(rotulo="Panela de pressão (inox)")),
    ("panela_pressao_vermelha", panela_pressao, dict(cor="vermelho", rotulo="Panela de pressão (vermelha)")),
    ("filtro_barro", filtro_barro, dict(rotulo="Filtro de barro")),
    ("filtro_barro_creme", filtro_barro, dict(cor="creme", cor2="azul", cor_torneira="branco",
                                              rotulo="Filtro de cerâmica (creme e azul)")),
    ("lixeira_pedal_inox", lixeira_pedal, dict(rotulo="Lixeira de pedal (inox)")),
    ("lixeira_pedal_vermelha", lixeira_pedal, dict(cor="vermelho", cor2="grafite", rotulo="Lixeira de pedal (vermelha)")),
]:
    reg(_id, _fn, **_kw)


# =====================================================================================================================
# Utensílios e louça
# =====================================================================================================================
def bbox_malha(objs):
    """Caixa pelos vértices de verdade (o bound_box do objeto pode estar velho depois de mexer na malha)."""
    pts = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]
    return (V([min(p[i] for p in pts) for i in range(3)]), V([max(p[i] for p in pts) for i in range(3)]))


def assentar(objs):
    """Desloca as malhas para a base ficar em z = 0 e o meio em (0, 0)."""
    lo, hi = bbox_malha(objs)
    for o in objs:
        mb.transforma(o, loc=(-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z))
    return objs


def utensilio(tipo, cor_cabo="amarelo", cor_cabeca="cinza_claro", cor_furo="roxo"):
    """Utensílio em pé, pendurado: origem no alto do cabo, cabeça para baixo, face larga virada para −Y.
    tipos: espatula, espatula_vazada, concha, garfo, batedor, colher_pau, garfo_pau."""
    out = []
    de_pau = tipo in ("colher_pau", "garfo_pau")
    if de_pau:
        out.append(mb.caixa(0.022, 0.012, 0.17, z=-0.17, cor=cor_cabo, bisel=0.0055, seg=2))
        out.append(mb.cilindro(0.004, 0.004, y=-0.007, z=-0.014, cor=cor_furo, eixo="y", seg=10, bisel=0.001))
        zh = -0.17
    else:
        out.append(mb.caixa(0.024, 0.014, 0.11, z=-0.11, cor=cor_cabo, bisel=0.0065, seg=2))
        out.append(mb.cilindro(0.004, 0.004, y=-0.008, z=-0.014, cor=cor_furo, eixo="y", seg=10, bisel=0.001))
        out.append(mb.cilindro(0.0045, 0.075, z=-0.18, cor=cor_cabeca, seg=10, bisel=0.001))
        zh = -0.175
    if tipo in ("espatula", "espatula_vazada"):
        pl = placa(0.06, 0.075, 0.005, 0.012, y=-0.0025, z=zh - 0.075, cor=cor_cabeca, bisel=0.002)
        if tipo == "espatula_vazada":
            pl = subtrai(pl, [mb.caixa(0.008, 0.02, 0.045, x=dx, y=0, z=zh - 0.062, cor=cor_cabeca, bisel=0.003)
                              for dx in (-0.016, 0, 0.016)])
        out.append(pl)
    elif tipo == "concha":
        cv = vaso([(0, 0), (0.025, 0.004), (0.036, 0.018), (0.04, 0.03)], 0.003, cor=cor_cabeca, seg=16)
        mb.transforma(cv, loc=(0, -0.012, zh - 0.06), rot=("X", 18))
        out.append(cv)
        out.append(mb.cilindro(0.0045, 0.012, z=zh - 0.008, cor=cor_cabeca, seg=10, bisel=0.001))
    elif tipo in ("garfo", "garfo_pau"):
        c = cor_cabeca if tipo == "garfo" else cor_cabo
        out.append(mb.caixa(0.05, 0.008 if tipo == "garfo" else 0.012, 0.022, z=zh - 0.02, cor=c, bisel=0.004, seg=2))
        n = 3
        for k in range(n):
            out.append(mb.caixa(0.008, 0.007 if tipo == "garfo" else 0.011, 0.055, x=-0.02 + k * 0.02, z=zh - 0.07,
                                cor=c, bisel=0.0033, seg=2))
    elif tipo == "batedor":
        for k in range(3):
            pts = [(0.0, 0, 0.0), (0.028, 0, -0.045), (0.0, 0, -0.078), (-0.028, 0, -0.045), (0, 0, 0)]
            tb = mb.tubo(pts, 0.002, cor=cor_cabeca, raio_curva=0.012, tampas=False, seg=6)
            mb.transforma(tb, rot=("Z", k * 60))
            mb.transforma(tb, loc=(0, 0, zh - 0.004))
            out.append(tb)
    elif tipo == "colher_pau":
        out.append(mb.esfera(0.028, z=zh - 0.03, cor=cor_cabo, esc=(1, 0.32, 1.25), seg=16))
    return out


def barra_utensilios(id_, cor="lilas", cor_cabo="amarelo", cor_cabeca="cinza_claro", cor_pau="laranja_escuro",
                     rotulo="", grupo="barra_utensilios"):
    """Barra de parede com ganchos e seis utensílios pendurados (a da referência)."""
    it = mb.Item(id_)
    L = 0.46
    zt = 0.33
    yb = -0.04
    it.add(mb.cilindro(0.015, L, x=0, y=yb, z=zt, cor=cor, eixo="x", seg=16, bisel=0.006))
    for sx in (-1, 1):
        it.add(mb.esfera(0.018, x=sx * L / 2, y=yb, z=zt, cor=cor, seg=14))
        it.add(mb.cilindro(0.016, 0.03, x=sx * (L / 2 - 0.04), y=-0.015, z=zt, cor=cor, eixo="y", seg=14,
                           bisel=0.005))
        it.add(mb.cilindro(0.024, 0.008, x=sx * (L / 2 - 0.04), y=-0.004, z=zt, cor=cor, eixo="y", seg=16,
                           bisel=0.003))
    tipos = [("espatula_vazada", cor_cabo, cor_cabeca), ("concha", cor_cabo, cor_cabeca),
             ("garfo", cor_cabo, cor_cabeca), ("batedor", cor_cabo, cor_cabeca), ("colher_pau", cor_pau, cor_pau),
             ("garfo_pau", cor_pau, cor_pau)]
    for k, (t, c1, c2) in enumerate(tipos):
        x = -L / 2 + 0.06 + k * (L - 0.12) / 5
        it.add(toro(0.012, 0.0028, x=x, y=yb, z=zt - 0.01, cor="metal", seg=10, seg2=5, eixo="x"))
        objs = utensilio(t, c1, c2)
        for o in objs:
            mb.transforma(o, loc=(x, yb, zt - 0.02))
        it.add(objs)
    lo, hi = bbox_malha(it.partes)
    for o in it.partes:
        mb.transforma(o, loc=(0, 0, -lo.z))
    return it, dict(rotulo=rotulo, grupo=grupo, fixacao="parede", altura_instalacao=1.15,
                    tags=["utensílios", "barra", "ganchos", "parede"])


def utensilio_solto(id_, tipo="espatula", cor_cabo="amarelo", cor_cabeca="cinza_claro", rotulo="", grupo=""):
    """Utensílio solto, deitado na bancada."""
    it = mb.Item(id_)
    objs = utensilio(tipo, cor_cabo, cor_cabeca, cor_furo="grafite")
    for o in objs:
        mb.transforma(o, rot=("X", 90 if tipo != "concha" else -90))
    if tipo == "concha":
        for o in objs:
            mb.transforma(o, rot=("Y", 0))
    assentar(objs)
    it.add(objs)
    return it, _apoio(rotulo, grupo or "utensilio_" + tipo, ["utensílio", tipo.replace("_", " ")])


def escorredor(id_, cor="turquesa", cor2="laranja", cor_prato="creme", rotulo="", grupo="escorredor_pratos"):
    """Escorredor de pratos (o da referência): laterais em arco, varetas e pratos em pé."""
    it = mb.Item(id_)
    L, P, A = 0.38, 0.2, 0.2
    for sx in (-1, 1):
        pts = [(sx * L / 2, -P / 2, 0.012), (sx * L / 2, -P / 2, A), (sx * L / 2, P / 2, A), (sx * L / 2, P / 2, 0.012)]
        it.add(mb.tubo(pts, 0.012, cor=cor, raio_curva=0.04, fechado=True))
    for yy, zz in ((-P / 2, 0.05), (P / 2, 0.05), (-P / 2, A - 0.03), (P / 2, A - 0.03), (0, 0.025)):
        it.add(mb.cilindro(0.007, L + 0.01, y=yy, z=zz, cor=cor2, eixo="x", seg=10, bisel=0.002))
    for k in range(9):
        it.add(mb.cilindro(0.004, P - 0.02, x=-L / 2 + 0.05 + k * (L - 0.1) / 8, z=0.032, cor=cor2, eixo="y", seg=8,
                           bisel=0.001))
    for k in range(5):
        pr = mb.torno([(0, 0), (0.07, 0), (0.095, 0.012), (0.1, 0.018), (0.075, 0.008), (0, 0.008)], cor=cor_prato,
                      seg=24)
        mb.transforma(pr, rot=[("Y", 90), ("Y", -8)])
        mb.transforma(pr, loc=(-0.05 + k * 0.026, 0, 0.122))
        it.add(pr)
    it.slot("pratos", (0, 0, 0.035), (L - 0.04, P - 0.03, A - 0.05))
    it.colisao([((0, 0, 0), (L + 0.03, P + 0.03, A + 0.02))])
    return it, _apoio(rotulo, grupo, ["escorredor", "pratos", "louça"])


def porta_temperos(id_, cor="laranja", tampas=("vermelho", "roxo", "verde"), rotulo="", grupo="porta_temperos"):
    """Porta-temperos de bancada com três potinhos (o da referência)."""
    it = mb.Item(id_)
    it.add(bandeja(0.2, 0.07, 0.03, 0.008, 0.012, cor=cor))
    for sx in (-1, 1):
        it.add(placa(0.012, 0.07, 0.07, 0.006, x=sx * 0.094, y=-0.035, z=0.0, cor=cor, bisel=0.005))
    for k, c in enumerate(tampas):
        x = -0.058 + k * 0.058
        it.add(mb.cilindro(0.024, 0.07, x=x, z=0.008, cor="branco", seg=20, bisel=0.005))
        it.add(mb.cilindro(0.025, 0.02, x=x, z=0.075, cor=c, seg=20, bisel=0.008))
    return it, _apoio(rotulo, grupo, ["temperos", "utensílio"])


def moedor_pimenta(id_, cor="laranja", cor2="vermelho", rotulo="", grupo="moedor_pimenta"):
    it = mb.Item(id_)
    it.add(mb.torno([(0, 0), (0.03, 0), (0.032, 0.01), (0.026, 0.05), (0.022, 0.1), (0.026, 0.12), (0.024, 0.125),
                     (0, 0.125)], cor=cor, seg=24))
    for zz in (0.015, 0.03):
        it.add(anel(0.0322, 0.028, 0.006, z=zz, cor=cor2, seg=24))
    it.add(mb.torno([(0, 0), (0.025, 0), (0.026, 0.02), (0.018, 0.04), (0, 0.045)], z=0.125, cor=cor, seg=24))
    it.add(mb.esfera(0.008, z=0.172, cor=cor2, seg=10))
    return it, _apoio(rotulo, grupo, ["moedor", "pimenta", "utensílio"])


def tabua_furo(id_, cor="laranja", rotulo="", grupo="tabua_corte_furo"):
    """Tábua de corte de cantos bem redondos com furo-alça (a laranja da referência)."""
    it = mb.Item(id_)
    furo = [(u, v + 0.11) for u, v in reversed(rr(0.1, 0.045, 0.0224, 6))]
    t = placa_furada(rr(0.26, 0.34, 0.06, 6), [furo], 0.022, cor=cor, bisel=0.007)
    it.add(t)
    return it, _apoio(rotulo, grupo, ["tábua", "corte", "utensílio"])


def tabua_redonda(id_, cor="madeira_mel", cor2="madeira", rotulo="", grupo="tabua_corte_redonda"):
    """Tábua redonda com cabo e furo para pendurar."""
    it = mb.Item(id_)
    pts = mb._ccw([(0.13 * math.cos(math.radians(a)), 0.13 * math.sin(math.radians(a))) for a in range(100, 441, 10)]
                  + [(0.025, 0.2), (0.03, 0.24), (0.0, 0.26), (-0.03, 0.24), (-0.025, 0.2)])
    furo = [(u, v + 0.235) for u, v in reversed(mb.circulo(0.012, 16))]
    t = placa_furada(pts, [furo], 0.02, cor=cor, bisel=0.006)
    it.add(t)
    it.add(anel(0.11, 0.104, 0.002, z=0.0195, cor=cor2, seg=36))
    assentar(it.partes)
    return it, _apoio(rotulo, grupo, ["tábua", "corte", "utensílio"])


def tabua_pacote(id_, rotulo="", grupo="tabua_corte_pacote"):
    pc = mb.importa_pacote("Cutting_board_02")
    it = mb.Item(id_)
    it.add(list(pc.values()))
    assentar(it.partes)
    return it, _apoio(rotulo, grupo, ["tábua", "corte", "pacote"], pacote=True)


def rolo_massa(id_, cor="branco_gelo", cor2="madeira_mel", rotulo="", grupo="rolo_massa"):
    it = mb.Item(id_)
    it.add(mb.cilindro(0.032, 0.25, z=0.032, cor=cor, eixo="x", seg=24, bisel=0.008))
    for sx in (-1, 1):
        it.add(mb.cilindro(0.008, 0.03, x=sx * 0.135, z=0.032, cor=cor2, eixo="x", seg=10, bisel=0.002))
        h = mb.torno([(0, 0), (0.014, 0), (0.019, 0.03), (0.017, 0.06), (0.01, 0.07), (0, 0.07)], cor=cor2, seg=16)
        mb.transforma(h, rot=("Y", sx * 90))
        mb.transforma(h, loc=(sx * 0.145, 0, 0.032))
        it.add(h)
    assentar(it.partes)
    return it, _apoio(rotulo, grupo, ["rolo", "massa", "utensílio"])


def rolo_pacote(id_, rotulo="", grupo="rolo_massa_pacote"):
    pc = mb.importa_pacote("Utensils_01")
    it = mb.Item(id_)
    it.add(list(pc.values()))
    assentar(it.partes)
    return it, _apoio(rotulo, grupo, ["rolo", "massa", "pacote"], pacote=True)


def pote_barro(id_, tam=1.0, cor="tijolo", rotulo="", grupo="pote_barro"):
    it = mb.Item(id_)
    s = tam
    it.add(vaso([(0, 0), (0.035 * s, 0), (0.05 * s, 0.02 * s), (0.055 * s, 0.045 * s), (0.045 * s, 0.07 * s),
                 (0.038 * s, 0.078 * s), (0.042 * s, 0.085 * s)], 0.005 * s, cor=cor, seg=28))
    it.slot("dentro", (0, 0, 0.006 * s), (0.06 * s, 0.06 * s, 0.07 * s))
    return it, _apoio(rotulo, grupo, ["pote", "barro", "louça"])


def garrafa(id_, cor="creme_claro", cor2="laranja", rotulo="", grupo="garrafa_leite"):
    it = mb.Item(id_)
    it.add(mb.torno([(0, 0), (0.035, 0), (0.038, 0.01), (0.038, 0.12), (0.03, 0.16), (0.02, 0.18), (0.02, 0.19),
                     (0, 0.19)], cor=cor, seg=24))
    it.add(mb.torno([(0, 0), (0.022, 0), (0.024, 0.006), (0.024, 0.022), (0.018, 0.03), (0, 0.032)], z=0.185,
                    cor=cor2, seg=20))
    return it, _apoio(rotulo, grupo, ["garrafa", "leite", "louça"])


def prato(id_, fundo=False, cor="louca", cor2=None, rotulo="", grupo="prato"):
    it = mb.Item(id_)
    if fundo:
        ext = [(0, 0), (0.05, 0), (0.06, 0.008), (0.075, 0.03), (0.11, 0.042), (0.115, 0.046)]
    else:
        ext = [(0, 0), (0.07, 0), (0.08, 0.006), (0.09, 0.012), (0.125, 0.022), (0.13, 0.025)]
    it.add(vaso(ext, 0.006, cor=cor, seg=32))
    if cor2:
        it.add(anel(0.122 if not fundo else 0.108, 0.112 if not fundo else 0.098, 0.002,
                    z=0.0225 if not fundo else 0.0435, cor=cor2, seg=32))
    it.slot("prato", (0, 0, 0.008), (0.14 if not fundo else 0.1, 0.14 if not fundo else 0.1, 0.05))
    return it, _apoio(rotulo, grupo, ["prato", "louça"])


def tigela(id_, cor="terracota", cor2=None, rotulo="", grupo="tigela"):
    it = mb.Item(id_)
    it.add(vaso([(0, 0), (0.055, 0), (0.06, 0.008), (0.09, 0.04), (0.105, 0.075), (0.108, 0.08)], 0.007, cor=cor,
                seg=32))
    if cor2:
        it.add(anel(0.106, 0.098, 0.012, z=0.058, cor=cor2, seg=32))
        mb.transforma(it.partes[-1], loc=(0, 0, 0))
    it.slot("dentro", (0, 0, 0.008), (0.12, 0.12, 0.07))
    return it, _apoio(rotulo, grupo, ["tigela", "louça"])


def panelas_empilhadas(id_, cor="carvao", rotulo="", grupo="panelas_empilhadas"):
    """Três panelas de barro pretas, uma dentro da outra (as da referência)."""
    it = mb.Item(id_)
    z = 0.0
    for k, s in enumerate((1.0, 0.8, 0.62)):
        it.add(vaso([(0, 0), (0.06 * s, 0), (0.09 * s, 0.025 * s), (0.105 * s, 0.06 * s), (0.1 * s, 0.085 * s),
                     (0.106 * s, 0.092 * s)], 0.008 * s, z=z, cor=cor if k != 1 else "chocolate", seg=32))
        z += 0.03 * s
    return it, _apoio(rotulo, grupo, ["panelas", "barro", "louça"])


def cacarola(id_, cor="azul_acinzentado", cor2="verde_lima", rotulo="", grupo="cacarola"):
    """Caçarola com tampa (a azul de alças verdes da referência). A tampa levanta."""
    it = mb.Item(id_)
    it.add(vaso([(0, 0), (0.1, 0), (0.11, 0.012), (0.112, 0.12)], 0.004, cor=cor, seg=32))
    for sx in (-1, 1):
        it.add(mb.superelipsoide(0.05, 0.05, 0.03, x=sx * 0.13, z=0.09, cor=cor2, e=0.4, e_v=0.6))
    it.slot("dentro", (0, 0, 0.005), (0.15, 0.15, 0.11))
    t = [mb.torno([(0, 0), (0.118, 0), (0.118, 0.008), (0.1, 0.025), (0.05, 0.038), (0, 0.04)], z=0.12, cor=cor,
                  seg=32),
         mb.superelipsoide(0.045, 0.045, 0.03, z=0.155, cor=cor2, e=0.5, e_v=0.6)]
    it.correr(t, direcao=(0, 0, 1), curso=0.12, nome="tampa")
    return it, _apoio(rotulo, grupo, ["panela", "caçarola", "tampa"])


def panela_cabo(id_, cor="azul_acinzentado", cor2="verde_lima", rotulo="", grupo="panela_cabo"):
    it = mb.Item(id_)
    it.add(vaso([(0, 0), (0.07, 0), (0.08, 0.01), (0.082, 0.1)], 0.004, cor=cor, seg=32))
    it.add(mb.caixa(0.04, 0.02, 0.02, x=0.1, z=0.08, cor=cor, bisel=0.006))
    it.add(mb.caixa(0.13, 0.035, 0.03, x=0.18, z=0.075, cor=cor2, bisel=0.013))
    it.slot("dentro", (0, 0, 0.005), (0.11, 0.11, 0.09))
    return it, _apoio(rotulo, grupo, ["panela", "cabo", "fogão"])


def frigideira(id_, cor="azul_acinzentado", cor2="verde_lima", rotulo="", grupo="frigideira"):
    it = mb.Item(id_)
    it.add(vaso([(0, 0), (0.09, 0), (0.1, 0.008), (0.12, 0.045)], 0.004, cor=cor, seg=32))
    it.add(mb.caixa(0.04, 0.02, 0.016, x=0.13, z=0.032, cor=cor, bisel=0.006))
    pc = mb.caixa(0.15, 0.032, 0.028, x=0.22, z=0.03, cor=cor2, bisel=0.012)
    mb.transforma(pc, rot=("Y", -6), loc=(0, 0, 0))
    it.add(pc)
    it.slot("dentro", (0, 0, 0.005), (0.16, 0.16, 0.05))
    return it, _apoio(rotulo, grupo, ["frigideira", "fogão"])


def caneca(id_, cor="branco", cor2="vermelho", rotulo="", grupo="caneca"):
    """Caneca de 10 cm com faixa colorida."""
    it = mb.Item(id_)
    it.add(vaso([(0, 0), (0.036, 0), (0.04, 0.006), (0.04, 0.1)], 0.004, cor=cor, seg=28))
    it.add(anel(0.0412, 0.0385, 0.016, z=0.07, cor=cor2, seg=28))
    it.add(alca_caneca(0.04, 0, 0.022, 0.08, 0.032, r=0.0065, cor=cor))
    it.slot("dentro", (0, 0, 0.004), (0.05, 0.05, 0.09))
    return it, _apoio(rotulo, grupo, ["caneca", "louça"])


def copo(id_, cor=None, rotulo="", grupo="copo"):
    it = mb.Item(id_)
    ext = [(0, 0), (0.03, 0), (0.032, 0.004), (0.037, 0.11)]
    if cor:
        it.add(vaso(ext, 0.003, cor=cor, seg=24))
    else:
        it.add(vaso(ext, 0.0025, cor=None, mat="vidro", seg=24, fundo=0.008))
    return it, _apoio(rotulo, grupo, ["copo", "louça"])


def xicara(id_, cor="branco", cor2="azul", rotulo="", grupo="xicara_pires"):
    it = mb.Item(id_)
    it.add(vaso([(0, 0), (0.06, 0), (0.065, 0.006), (0.075, 0.014)], 0.004, cor=cor2, seg=28))
    it.add(vaso([(0, 0), (0.022, 0), (0.035, 0.015), (0.042, 0.05), (0.044, 0.06)], 0.0035, z=0.008, cor=cor, seg=28))
    it.add(alca_caneca(0.04, 0, 0.03, 0.06, 0.022, r=0.005, cor=cor))
    it.add(anel(0.0448, 0.0415, 0.008, z=0.052, cor=cor2, seg=28))
    return it, _apoio(rotulo, grupo, ["xícara", "pires", "louça"])


def talher(id_, tipo="garfo", cor="cromo", cor_cabo="turquesa", rotulo="", grupo=""):
    """Talher deitado (garfo, faca, colher) de 19 cm, cabo colorido boleado e cabeça de metal."""
    it = mb.Item(id_)
    cabo = mb.superelipsoide(0.02, 0.1, 0.011, y=0.05, cor=cor_cabo, e=0.55, e_v=0.6, nu=20, nv=8)
    it.add(cabo)
    it.add(mb.caixa(0.007, 0.035, 0.004, y=0.115, z=0.004, cor=cor, bisel=0.0015))
    if tipo == "garfo":
        it.add(placa_deitada(0.026, 0.026, 0.004, 0.01, y=0.14, z=0.003, cor=cor, bisel=0.0015))
        for k in range(4):
            it.add(mb.caixa(0.0042, 0.034, 0.004, x=-0.0093 + k * 0.0062, y=0.165, z=0.003, cor=cor, bisel=0.0016,
                            seg=2))
    elif tipo == "faca":
        it.add(mb.extrudado(mb._ccw([(-0.009, 0.128), (0.007, 0.128), (0.009, 0.17), (0.004, 0.195), (-0.009, 0.195)]),
                            0.004, z=0.003, cor=cor, bisel=0.0014))
    else:
        it.add(mb.esfera(0.021, y=0.152, z=0.006, cor=cor, esc=(0.85, 1.35, 0.32), seg=16))
    for o in it.partes:
        mb.transforma(o, rot=("Z", -90))
    assentar(it.partes)
    return it, _apoio(rotulo, grupo or "talher_" + tipo, ["talher", tipo])


def jarra(id_, cor=None, liquido="laranja", rotulo="", grupo="jarra"):
    it = mb.Item(id_)
    ext = [(0, 0), (0.06, 0), (0.064, 0.008), (0.066, 0.16), (0.07, 0.2)]
    if cor:
        it.add(vaso(ext, 0.005, cor=cor, seg=28))
        it.add(alca_caneca(0.066, 0, 0.05, 0.18, 0.05, r=0.009, cor=cor))
    else:
        it.add(vaso(ext, 0.003, cor=None, mat="vidro", seg=28, fundo=0.008))
        it.add(mb.torno([(0, 0), (0.06, 0), (0.0625, 0.12), (0, 0.12)], z=0.009, cor=liquido, seg=28))
        it.add(alca_caneca(0.066, 0, 0.05, 0.18, 0.05, r=0.009, cor=None))
        pinta_mat(it.partes[-1], "vidro")
    bico = mb.superelipsoide(0.04, 0.03, 0.012, x=-0.07, z=0.192, cor=cor or "branco", e=0.6)
    if not cor:
        pinta_mat(bico, "vidro")
    it.add(bico)
    return it, _apoio(rotulo, grupo, ["jarra", "louça"])


def pinta_mat(ob, mat):
    for p_ in ob.data.polygons:
        p_.material_index = mb.MAT_NOMES.index(mat)
    return ob


def fruteira(id_, cor="branco", rotulo="", grupo="fruteira"):
    """Fruteira de pé com maçãs, laranjas e bananas."""
    it = mb.Item(id_)
    it.add(mb.torno([(0, 0), (0.06, 0), (0.062, 0.01), (0.02, 0.03), (0.016, 0.06), (0, 0.06)], cor=cor, seg=28))
    it.add(vaso([(0, 0), (0.05, 0), (0.1, 0.03), (0.13, 0.06), (0.14, 0.07)], 0.006, z=0.055, cor=cor, seg=32))
    frutas = [(0.05, 0.02, "vermelho"), (-0.045, 0.03, "laranja"), (0.0, -0.05, "verde_lima"), (-0.02, 0.06, "vermelho"),
              (0.06, -0.04, "laranja")]
    for x, y, c in frutas:
        it.add(mb.esfera(0.033, x=x, y=y, z=0.1, cor=c, seg=16))
        if c != "laranja":
            it.add(mb.cilindro(0.003, 0.015, x=x, y=y, z=0.13, cor="marrom", seg=6, bisel=0))
    ban = mb.tubo([(-0.08, -0.02, 0.15), (-0.03, -0.03, 0.125), (0.03, -0.03, 0.125), (0.08, -0.02, 0.15)], 0.013,
                  cor="amarelo", raio_curva=0.05)
    it.add(ban)
    it.add(mb.tubo([(-0.08, 0.0, 0.15), (-0.03, -0.005, 0.135), (0.03, -0.005, 0.138), (0.08, 0.0, 0.155)], 0.013,
                   cor="amarelo", raio_curva=0.05))
    return it, _apoio(rotulo, grupo, ["fruteira", "frutas", "louça"])


def assadeira(id_, cor="metal_claro", vidro=False, rotulo="", grupo="assadeira"):
    it = mb.Item(id_)
    b = bandeja(0.36, 0.24, 0.055, 0.005, 0.03, cor=cor)
    if vidro:
        pinta_mat(b, "vidro")
    it.add(b)
    for sx in (-1, 1):
        a = mb.caixa(0.03, 0.12, 0.008, x=sx * 0.19, z=0.047, cor=cor if not vidro else "cinza_claro", bisel=0.004)
        if vidro:
            pinta_mat(a, "vidro")
        it.add(a)
    it.slot("dentro", (0, 0, 0.005), (0.32, 0.2, 0.05))
    return it, _apoio(rotulo, grupo, ["assadeira", "forno"])


def forma_bolo(id_, cor="metal_claro", rotulo="", grupo="forma_bolo"):
    """Forma de bolo com furo no meio."""
    it = mb.Item(id_)
    it.add(mb.torno([(0.035, 0.0), (0.12, 0.0), (0.125, 0.08), (0.12, 0.08), (0.115, 0.004), (0.04, 0.004),
                     (0.03, 0.08), (0.025, 0.08), (0.035, 0.0)], cor=cor, seg=32))
    it.add(anel(0.128, 0.118, 0.006, z=0.076, cor=cor, seg=32))
    return it, _apoio(rotulo, grupo, ["forma", "bolo", "forno"])


def porta_utensilios(id_, cor="azul", cor2="branco", rotulo="", grupo="porta_utensilios"):
    """Pote com colher de pau, espátula e concha em pé."""
    it = mb.Item(id_)
    it.add(vaso([(0, 0), (0.05, 0), (0.054, 0.008), (0.056, 0.14)], 0.005, cor=cor, seg=28))
    it.add(anel(0.0565, 0.051, 0.02, z=0.1, cor=cor2, seg=28))
    for k, (t, c1, c2, ang) in enumerate((("colher_pau", "madeira_mel", "madeira_mel", 12),
                                          ("espatula", "vermelho", "preto", -10), ("concha", "preto", "metal", 2))):
        objs = utensilio(t, c1, c2, cor_furo="grafite")
        for o in objs:
            mb.transforma(o, rot=("X", 180))
            mb.transforma(o, rot=("Z", k * 120 + 30))
            mb.transforma(o, rot=("Y", ang))
            mb.transforma(o, loc=(0.015 * math.cos(math.radians(k * 120)), 0.015 * math.sin(math.radians(k * 120)),
                                  0.02 if t != "colher_pau" else 0.0))
        it.add(objs)
    return it, _apoio(rotulo, grupo, ["utensílios", "pote"])


for _id, _fn, _kw in [
    ("barra_utensilios", barra_utensilios, dict(rotulo="Barra com utensílios pendurados")),
    ("escorredor_pratos", escorredor, dict(rotulo="Escorredor de pratos")),
    ("espatula_vazada", utensilio_solto, dict(tipo="espatula_vazada", rotulo="Espátula vazada",
                                              grupo="utensilio_espatula_vazada")),
    ("espatula_lisa", utensilio_solto, dict(tipo="espatula", cor_cabo="vermelho", rotulo="Espátula lisa",
                                            grupo="utensilio_espatula")),
    ("concha", utensilio_solto, dict(tipo="concha", rotulo="Concha")),
    ("garfo_cozinha", utensilio_solto, dict(tipo="garfo", rotulo="Garfo de cozinha")),
    ("batedor_arame", utensilio_solto, dict(tipo="batedor", rotulo="Batedor de arame")),
    ("colher_pau", utensilio_solto, dict(tipo="colher_pau", cor_cabo="laranja_escuro", rotulo="Colher de pau")),
    ("porta_utensilios", porta_utensilios, dict(rotulo="Pote com utensílios")),
    ("porta_temperos", porta_temperos, dict(rotulo="Porta-temperos")),
    ("moedor_pimenta_laranja", moedor_pimenta, dict(rotulo="Moedor de pimenta (laranja)")),
    ("moedor_pimenta_madeira", moedor_pimenta, dict(cor="madeira_escura", cor2="ouro",
                                                    rotulo="Moedor de pimenta (madeira)")),
    ("tabua_corte_furo", tabua_furo, dict(rotulo="Tábua de corte com furo (laranja)")),
    ("tabua_corte_redonda", tabua_redonda, dict(rotulo="Tábua de corte redonda")),
    ("tabua_corte_pacote", tabua_pacote, dict(rotulo="Tábua de corte com cabo (pacote)")),
    ("rolo_massa_marmore", rolo_massa, dict(rotulo="Rolo de massa de mármore")),
    ("rolo_massa_pacote", rolo_pacote, dict(rotulo="Rolo de massa (pacote)")),
    ("pote_barro_pequeno", pote_barro, dict(tam=0.8, rotulo="Pote de barro pequeno")),
    ("pote_barro_grande", pote_barro, dict(tam=1.6, cor="terracota_escura", rotulo="Pote de barro grande",
                                           grupo="pote_barro_grande")),
    ("garrafa_leite", garrafa, dict(rotulo="Garrafa de leite")),
    ("prato_raso", prato, dict(rotulo="Prato raso", cor2="azul_celeste")),
    ("prato_fundo", prato, dict(fundo=True, cor="creme_claro", rotulo="Prato fundo", grupo="prato_fundo")),
    ("tigela_terracota", tigela, dict(rotulo="Tigela (terracota)")),
    ("tigela_azul", tigela, dict(cor="azul_celeste", cor2="branco", rotulo="Tigela (azul)")),
    ("panelas_empilhadas", panelas_empilhadas, dict(rotulo="Panelas de barro empilhadas")),
    ("cacarola_azul", cacarola, dict(rotulo="Caçarola com tampa (azul)")),
    ("cacarola_vermelha", cacarola, dict(cor="vermelho", cor2="creme", rotulo="Caçarola com tampa (vermelha)")),
    ("panela_cabo_azul", panela_cabo, dict(rotulo="Panela com cabo (azul)")),
    ("panela_cabo_cobre", panela_cabo, dict(cor="cobre", cor2="preto", rotulo="Panela com cabo (cobre)")),
    ("frigideira_azul", frigideira, dict(rotulo="Frigideira (azul)")),
    ("frigideira_preta", frigideira, dict(cor="grafite_escuro", cor2="madeira", rotulo="Frigideira (preta)")),
    ("caneca_branca", caneca, dict(rotulo="Caneca (branca)")),
    ("caneca_amarela", caneca, dict(cor="amarelo", cor2="laranja", rotulo="Caneca (amarela)")),
    ("caneca_azul", caneca, dict(cor="azul_claro", cor2="azul_medio", rotulo="Caneca (azul)")),
    ("copo_vidro", copo, dict(rotulo="Copo de vidro")),
    ("copo_colorido", copo, dict(cor="verde_agua", rotulo="Copo colorido", grupo="copo_colorido")),
    ("xicara_pires_azul", xicara, dict(rotulo="Xícara com pires (azul)")),
    ("xicara_pires_rosa", xicara, dict(cor2="rosa", rotulo="Xícara com pires (rosa)")),
    ("garfo", talher, dict(tipo="garfo", rotulo="Garfo")),
    ("faca", talher, dict(tipo="faca", cor_cabo="amarelo", rotulo="Faca")),
    ("colher", talher, dict(tipo="colher", cor_cabo="rosa", rotulo="Colher")),
    ("jarra_vidro", jarra, dict(rotulo="Jarra de vidro com suco")),
    ("jarra_ceramica", jarra, dict(cor="azul_celeste", rotulo="Jarra de cerâmica (azul)")),
    ("fruteira", fruteira, dict(rotulo="Fruteira com frutas")),
    ("assadeira_metal", assadeira, dict(rotulo="Assadeira de metal")),
    ("assadeira_vidro", assadeira, dict(vidro=True, rotulo="Refratário de vidro")),
    ("forma_bolo", forma_bolo, dict(rotulo="Forma de bolo")),
]:
    reg(_id, _fn, **_kw)


# =====================================================================================================================
# Execução
# =====================================================================================================================
def roda():
    cat = mb.Catalogo(CAT, SAIDA, "Cozinha: eletrodomésticos e utensílios")
    feitos = 0
    for id_, fn, kw in PECAS:
        if not quer(id_):
            continue
        mb.limpa()
        res = fn(id_, **kw)
        it, meta = res
        meta = dict(meta)
        rot = meta.pop("rotulo")
        cat.exporta(it, rot, grupo=meta.pop("grupo", ""), fixacao=meta.pop("fixacao", "chao"),
                    altura_instalacao=meta.pop("altura_instalacao", None), pacote=meta.pop("pacote", False),
                    tags=meta.pop("tags", ()), miniatura_dir=meta.pop("miniatura_dir", (0.55, -1.0, 0.5)),
                    extra=meta.pop("extra", None))
        feitos += 1
    if FILTRO is None:
        ids = {p[0] for p in PECAS}
        cat.dados["itens"] = [i for i in cat.dados["itens"] if i["id"] in ids]
        ordem = {p[0]: k for k, p in enumerate(PECAS)}
        cat.dados["itens"].sort(key=lambda i: ordem[i["id"]])
        cat.salva()
        for sub, ext in (("glb", ".glb"), ("miniaturas", ".webp")):
            d = os.path.join(cat.pasta, sub)
            for f in os.listdir(d):
                if f.endswith(ext) and f[:-len(ext)] not in ids:
                    os.remove(os.path.join(d, f))
    else:
        ordem = {p[0]: k for k, p in enumerate(PECAS)}
        cat.dados["itens"].sort(key=lambda i: ordem.get(i["id"], 9999))
        cat.salva()
    print("feitos", feitos, "registrados", len(PECAS), flush=True)


if __name__ == "__main__":
    roda()
