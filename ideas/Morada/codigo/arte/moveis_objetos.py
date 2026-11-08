"""Móveis do Morada: objetos (props), livros e luminárias.

Uso (de SP):
  MOVEIS_THREADS=1 MOVEIS_PACOTE_FBX=... MOVEIS_PACOTE_TEX=... blender-venv/bin/python -I morada-art/moveis_objetos.py \
      -- SP/moveis_out [objetos|livros|luminarias] [id1,id2 ...]
Sem categoria: as três. Com ids: só essas peças (o catálogo guarda as demais).
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
ARGS = sys.argv[sys.argv.index("--") + 1:]
SAIDA = ARGS[0]
CAT_PEDIDA = ARGS[1] if len(ARGS) > 1 else None
IDS_PEDIDOS = set(",".join(ARGS[2:]).split(",")) - {""} if len(ARGS) > 2 else None

C = mb.caixa
Cil = mb.cilindro
Esf = mb.esfera
T = mb.transforma
LUZ_COR = "#FFE3A0"


# =====================================================================================================================
# Ajudantes
# =====================================================================================================================
def toro(R, r, x=0.0, y=0.0, z=0.0, cor="branco", seg=24, segt=8, eixo="z", mat="atlas", nome="toro"):
    """Anel (toro) de raio R e tubo r. eixo "z": deitado (no plano XY) em z; "y": de pé, virado para −Y."""
    perfil = [(R + r * math.cos(2 * math.pi * k / segt), r * math.sin(2 * math.pi * k / segt)) for k in range(segt)]
    perfil.append(perfil[0])
    ob = mb.torno(perfil, cor=cor, seg=seg, mat=mat, nome=nome, angulo=70)
    if eixo == "y":
        T(ob, rot=("X", 90))
    elif eixo == "x":
        T(ob, rot=("Y", 90))
    T(ob, loc=(x, y, z))
    return ob


def cupula(rb, rt, h, t=0.008, x=0.0, y=0.0, z=0.0, cor="creme_claro", seg=32, luz=True, nome="cupula"):
    """Cúpula aberta (tronco de cone oco) com as bordas boleadas; boca de raio rb em z, topo rt em z + h.
    O lado de dentro usa o material luz (miolo aceso)."""
    pts = [(rb, 0.0), (rt, h)]
    k = 5
    perfil = []
    perfil += [(rb - t / 2 + t / 2 * math.cos(math.pi + math.pi * i / k), t / 2 * math.sin(math.pi + math.pi * i / k))
               for i in range(k + 1)]  # boca: meia-volta por baixo, de dentro para fora
    perfil += [(rt - t / 2 + t / 2 * math.cos(math.pi * i / k), h + t / 2 * math.sin(math.pi * i / k))
               for i in range(k + 1)]  # topo: meia-volta por cima, de fora para dentro
    perfil.append(perfil[0])
    ob = mb.torno(perfil, cor=cor, seg=seg, nome=nome, angulo=50)
    del pts
    if luz:
        def dentro(c, n):
            rad = V((c.x, c.y, 0))
            return rad.length > 1e-6 and n.dot(rad.normalized()) < -0.35
        mb.pinta_onde(ob, None, dentro, mat="luz")
    T(ob, loc=(x, y, z))
    return ob


def domo(r, h, t=0.008, x=0.0, y=0.0, z=0.0, cor="amarelo_claro", seg=32, luz=True, nome="domo", n=10):
    """Cúpula em domo (meia elipse) com a boca para baixo em z e o alto em z + h; oca, miolo aceso."""
    ext = [(r * math.cos(math.pi / 2 * i / n), h * math.sin(math.pi / 2 * i / n)) for i in range(n + 1)]
    ri, hi = r - t, h - t
    inn = [(ri * math.cos(math.pi / 2 * i / n), hi * math.sin(math.pi / 2 * i / n)) for i in range(n, -1, -1)]
    borda = [(r - t / 2 + t / 2 * math.cos(math.pi + math.pi * i / 4), t / 2 * math.sin(math.pi + math.pi * i / 4))
             for i in range(1, 4)]
    perfil = ext + inn + borda
    perfil = [(max(0.0, a), b) for a, b in perfil]
    perfil.append(perfil[0])
    ob = mb.torno(perfil, cor=cor, seg=seg, nome=nome, angulo=50)
    if luz:
        def dentro(c, nn):
            return nn.dot(V((0, 0, 0)) - V(c)) > 0.0 and V(c).length < max(r, h) - t * 0.4
        mb.pinta_onde(ob, None, dentro, mat="luz")
    T(ob, loc=(x, y, z))
    return ob


def suave(pts, n=4):
    """Catmull-Rom pelos pontos de um perfil (para tornos lisos)."""
    P = [V((a, b, 0)) for a, b in pts]
    out = []
    for i in range(len(P) - 1):
        p0 = P[i - 1] if i > 0 else P[i]
        p1, p2 = P[i], P[i + 1]
        p3 = P[i + 2] if i + 2 < len(P) else P[i + 1]
        for k in range(n):
            t = k / n
            q = 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
                       (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3)
            out.append((max(0.0, q.x), q.y))
    out.append(pts[-1])
    return out


def lampada(r=0.035, x=0.0, y=0.0, z=0.0, nome="lampada"):
    return Esf(r, x=x, y=y, z=z, cor=None, mat="luz", seg=16, nome=nome)


def gira(objs, eixo, graus, centro=(0, 0, 0)):
    M = Matrix.Translation(centro) @ Matrix.Rotation(math.radians(graus), 4, eixo) @ Matrix.Translation(-V(centro))
    for o in (objs if isinstance(objs, (list, tuple)) else [objs]):
        o.data.transform(M)
    return objs


def move(objs, d):
    for o in (objs if isinstance(objs, (list, tuple)) else [objs]):
        o.data.transform(Matrix.Translation(d))
    return objs


def corta(ob, eixo, valores):
    """Corta a malha em planos perpendiculares ao eixo (para pintar faixas depois)."""
    no = {"x": (1, 0, 0), "y": (0, 1, 0), "z": (0, 0, 1)}[eixo]
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    for v in valores:
        co = [0, 0, 0]
        co["xyz".index(eixo)] = v
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=co, plane_no=no)
    bm.to_mesh(ob.data)
    bm.free()
    return ob


def projeta_estampa(ob, mat, x0, x1, z0, z1, teste=None, faces=None):
    """Põe a estampa (material mat) nas faces viradas para −Y (ou nas faces indicadas), com UV projetado de frente."""
    me = ob.data
    uv = me.uv_layers["UVMap"].data
    for p in me.polygons:
        n = V(p.normal)
        if faces is not None:
            ok = p.index in faces
        else:
            ok = teste(V(p.center), n) if teste else n.y < -0.5
        if ok:
            p.material_index = mat
            for li in p.loop_indices:
                co = me.vertices[me.loops[li].vertex_index].co
                uv[li].uv = ((co.x - x0) / (x1 - x0), (co.z - z0) / (z1 - z0))
    return ob


def disco_polar(raios, nseg, cor_fn, x=0.0, y=0.0, z=0.0, nome="disco"):
    """Disco plano virado para −Y (no plano y), em anéis (raios crescentes, o primeiro 0) e nseg fatias; cada face
    pinta com cor_fn(anel, fatia). Para o alvo de dardos."""
    bm = bmesh.new()
    centro = bm.verts.new((0, 0, 0))
    aneis = []
    for r in raios[1:]:
        aneis.append([bm.verts.new((r * math.sin(2 * math.pi * k / nseg), 0, r * math.cos(2 * math.pi * k / nseg)))
                      for k in range(nseg)])
    faces = []
    for k in range(nseg):
        f = bm.faces.new((centro, aneis[0][(k + 1) % nseg], aneis[0][k]))
        faces.append((f, 0, k))
    for a in range(1, len(aneis)):
        for k in range(nseg):
            f = bm.faces.new((aneis[a - 1][k], aneis[a - 1][(k + 1) % nseg], aneis[a][(k + 1) % nseg], aneis[a][k]))
            faces.append((f, a, k))
    me = bpy.data.meshes.new(nome)
    uvl = bm.loops.layers.uv.new("UVMap")
    for f, a, k in faces:
        u = mb.uv_cor(cor_fn(a, k))
        for lo in f.loops:
            lo[uvl].uv = u
    bm.to_mesh(me)
    bm.free()
    for n in mb.MAT_NOMES:
        me.materials.append(bpy.data.materials[n])
    me.shade_flat()
    ob = bpy.data.objects.new(nome, me)
    bpy.context.scene.collection.objects.link(ob)
    if me.polygons[0].normal.y > 0:
        me.flip_normals()
    T(ob, loc=(x, y, z))
    return ob


def placa(l, a, x=0.0, y=0.0, z=0.0, esp=0.004, mat=None, cor="tela", r=0.01, nome="placa"):
    """Painel fino no plano XZ (frente em y, espessura para +Y), base em z; com estampa (mat) projetada na frente."""
    ob = mb.extrudado(mb.ret_arredondado(l, a, r), esp, x=x, y=y, z=z + a / 2, cor=cor, bisel=min(esp * 0.4, 0.002),
                      seg=1, plano="xz", nome=nome)
    if mat is not None:
        projeta_estampa(ob, mat, x - l / 2, x + l / 2, z, z + a)
    return ob


def aro_tubo(l, a, r, x=0.0, y=0.0, z=0.0, raio=0.03, cor="madeira", nome="aro"):
    """Moldura redonda (tubo fechado) em volta de um retângulo arredondado no plano XZ, centrada em (x, z)."""
    pts = [(x + px, y, z + pz) for px, pz in mb.ret_arredondado(l, a, raio, seg=5)]
    return mb.tubo(pts, r, cor=cor, raio_curva=0, seg=8, nome=nome, fechado=True)


def aro_pontos(pts2d, r, y=0.0, cor="madeira", nome="aro"):
    pts = [(px, y, pz) for px, pz in pts2d]
    return mb.tubo(pts, r, cor=cor, raio_curva=0, seg=8, nome=nome, fechado=True)


def assenta(it, modo="chao"):
    """Leva a peça para a origem certa (chao/apoio: centro e base; parede: meio, plano y=0, base; teto: topo)."""
    objs = list(it.partes) + [o for o, _ in it.interativos]
    bpy.context.view_layer.update()
    lo, hi = mb.bbox(objs)
    if modo == "parede":
        d = V((-(lo.x + hi.x) / 2, -hi.y, -lo.z))
    elif modo == "teto":
        d = V((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -hi.z))
    else:
        d = V((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z))
    for o in it.partes:
        o.data.transform(Matrix.Translation(d))
    for o, _ in it.interativos:
        o.location += d
    it.slots = [(n, tuple(V(c) + d), t, p) for n, c, t, p in it.slots]
    if it.colisores:
        it.colisores = [(tuple(V(c) + d), t) for c, t in it.colisores]
    return d


def luz_extra(pos, alcance, cor=LUZ_COR):
    return {"luz": {"posicao": mb._gl(V(pos)), "cor": cor, "alcance": alcance}}


def pacote(nome, esc=1.0, rot_z=0.0):
    pc = mb.importa_pacote(nome)
    objs = list(pc.values())
    for o in objs:
        T(o, rot=("Z", rot_z) if rot_z else None, esc=(esc, esc, esc) if esc != 1 else None)
    lo, hi = mb.bbox(objs)
    move(objs, V((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z)))
    return pc


def mostrador(r, x, y, z, face="creme_claro", marcas="grafite", ponteiro="grafite", aro=None, aro_r=None, h=(10, 2),
              grossura=0.012):
    """Mostrador de relógio virado para −Y, com a frente da face no plano y."""
    ps = [Cil(r, grossura, x=x, y=y + grossura / 2, z=z, cor=face, eixo="y", seg=32, bisel=0.002)]
    for k in range(12):
        a = math.radians(k * 30)
        rr = r * 0.78
        if k % 3 == 0:
            ps.append(Cil(r * 0.075, 0.006, x=x + rr * math.sin(a), y=y - 0.001, z=z + rr * math.cos(a), cor=marcas,
                          eixo="y", seg=10, bisel=0.0))
        else:
            ps.append(Cil(r * 0.04, 0.005, x=x + rr * math.sin(a), y=y - 0.001, z=z + rr * math.cos(a), cor=marcas,
                          eixo="y", seg=8, bisel=0.0))
    for horas, L, w in ((h[0] + h[1] / 60, r * 0.48, r * 0.09), (h[1] * 5, r * 0.68, r * 0.065)):
        ang = horas * 30 if L < r * 0.6 else horas * 6
        pt = C(w, 0.004, L + w, z=-w / 2, cor=ponteiro, bisel=w * 0.45, seg=2)
        T(pt, rot=("Y", ang))
        T(pt, loc=(x, y - 0.005 - (0.004 if L > r * 0.6 else 0), z))
        ps.append(pt)
    ps.append(Cil(r * 0.09, 0.008, x=x, y=y - 0.008, z=z, cor=ponteiro, eixo="y", seg=12, bisel=0.002))
    if aro:
        ps.append(toro(aro_r or r, r * 0.13, x=x, y=y + 0.002, z=z, cor=aro, eixo="y", seg=28, segt=6))
    return ps


# =====================================================================================================================
# Estampas (telas e foto) — PNGs feitos aqui mesmo
# =====================================================================================================================
EST_DIR = os.path.join(SAIDA, "objetos", "_estampas")
EST = {}


def _hex(h):
    h = h.lstrip("#")
    return [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]


def _mix(a, b, t):
    t = max(0.0, min(1.0, t))
    return [a[i] * (1 - t) + b[i] * t for i in range(3)]


def _png(nome, w, h, fn):
    os.makedirs(EST_DIR, exist_ok=True)
    caminho = os.path.join(EST_DIR, nome + ".png")
    img = bpy.data.images.new("tmp_" + nome, w, h, alpha=False)
    px = []
    for j in range(h):
        for i in range(w):
            px += fn(i / (w - 1), j / (h - 1)) + [1.0]
    img.pixels = px
    img.filepath_raw = caminho
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)
    return caminho


def estampas():
    if EST:
        return EST

    def tela(cima, baixo, brilho):
        def f(u, v):
            c = _mix(_hex(baixo), _hex(cima), v)
            d = abs((u * 0.9 + (1 - v)) - 0.75)  # faixa de reflexo na diagonal
            if d < 0.12:
                c = _mix(c, _hex(brilho), 0.22 * (1 - d / 0.12))
            d2 = abs((u * 0.9 + (1 - v)) - 1.0)
            if d2 < 0.04:
                c = _mix(c, _hex(brilho), 0.12 * (1 - d2 / 0.04))
            return c
        return f

    def foto(u, v):
        c = _mix(_hex("#CEE8FA"), _hex("#50B3F0"), v)
        if (u - 0.72) ** 2 + ((v - 0.74) * 0.8) ** 2 < 0.012:
            c = _hex("#FFD340")
        if v < 0.36 + 0.12 * math.sin(u * 5.0 + 0.6):
            c = _hex("#8FD07B")
        if v < 0.22 + 0.10 * math.sin(u * 4.0 + 2.8):
            c = _hex("#4EB35F")
        if abs(u - 0.3) < 0.025 and 0.3 < v < 0.5:
            c = _hex("#7C4F37")
        if (u - 0.3) ** 2 + ((v - 0.55) * 0.9) ** 2 < 0.008:
            c = _hex("#2F9A56")
        return c

    EST["tela"] = mb.material_estampa("obj_tela", _png("obj_tela", 96, 54, tela("#34558A", "#1B2433", "#9FC4F0")))
    EST["tela_retro"] = mb.material_estampa("obj_tela_retro", _png("obj_tela_retro", 64, 48,
                                                                   tela("#2C8C9C", "#14485A", "#BFF2F0")))
    EST["foto"] = mb.material_estampa("obj_foto", _png("obj_foto", 64, 80, foto))
    return EST


# =====================================================================================================================
# LIVROS
# =====================================================================================================================
def livro(t, p, a, cor, faixas=(), pag="papel", x=0.0, y=0.0, z=0.0, inclina=0.0, nome="livro"):
    """Livro em pé: espessura t (x), largura da capa p (y), altura a (z), lombada boleada para −Y, miolo de papel
    recuado. faixas: [(z0, z1, cor)] na lombada. inclina: graus em volta de Y (encostado), girando pela quina de baixo."""
    e = max(0.0024, min(0.004, t * 0.12))
    b = max(2.2 * e, min(t * 0.32, 0.011))
    pts = [(t / 2, p / 2), (t / 2, -p / 2 + b)]
    n = 5
    for k in range(1, n):
        th = math.pi * k / n
        pts.append((t / 2 * math.cos(th), -p / 2 + b - b * math.sin(th)))
    pts += [(-t / 2, -p / 2 + b), (-t / 2, p / 2)]
    ti = t / 2 - e
    pts += [(-ti, p / 2), (-ti, -p / 2 + b)]
    for k in range(n - 1, 0, -1):
        th = math.pi * k / n
        pts.append((ti * math.cos(th), -p / 2 + b - (b - e) * math.sin(th)))
    pts += [(ti, -p / 2 + b), (ti, p / 2)]
    casca = mb.extrudado(mb._ccw(pts), a, cor=cor, bisel=e * 0.42, seg=2, nome=nome + "_capa")
    if faixas:
        corta(casca, "z", [v for z0, z1, _ in faixas for v in (z0, z1)])
        for z0, z1, cf in faixas:
            mb.pinta_onde(casca, cf, lambda c, nn, z0=z0, z1=z1: z0 < c.z < z1 and c.y < -p / 2 + b + 0.0005 and
                          nn.z * nn.z < 0.5 and (nn.y < 0.2))
    miolo = C(2 * ti + 0.0016, p - b - 0.0045, a - 0.009, y=(-p / 2 + b + p / 2 - 0.0045) / 2, z=0.0045, cor=pag,
              bisel=0.0015, seg=1, nome=nome + "_miolo")
    objs = [casca, miolo]
    if inclina:
        piv = (t / 2 if inclina > 0 else -t / 2, 0, 0)
        gira(objs, "Y", inclina, piv)
    move(objs, V((x, y, z)))
    return objs


def livro_deitado(t, p, a, cor, faixas=(), pag="papel", x=0.0, y=0.0, z=0.0, rot=0.0, nome="livro"):
    """Livro deitado: comprimento a em x, largura p em y, espessura t em z; lombada para −Y; base em z."""
    objs = livro(t, p, a, cor, faixas, pag, nome=nome)
    move(objs, V((0, 0, -a / 2)))
    gira(objs, "Y", 90)
    move(objs, V((0, 0, t / 2)))
    if rot:
        gira(objs, "Z", rot)
    move(objs, V((x, y, z)))
    return objs


PAL_LIVROS = ["marrom", "azul_celeste", "verde_claro", "verde_lima", "turquesa", "amarelo_escuro", "rosa", "rosa_bebe",
              "laranja", "verde_agua", "lilas", "roxo", "azul", "cinza", "vermelho", "menta", "salmao", "verde",
              "azul_claro", "mostarda", "rosa_escuro", "petroleo", "vermelho_claro", "lilas_claro", "terracota_clara"]
ESCURO = {"marrom": "marrom_escuro", "azul_celeste": "azul", "verde_claro": "verde", "verde_lima": "verde",
          "turquesa": "turquesa_escuro", "amarelo_escuro": "laranja", "rosa": "rosa_escuro", "rosa_bebe": "rosa",
          "laranja": "laranja_escuro", "verde_agua": "verde_medio", "lilas": "roxo", "roxo": "roxo_escuro",
          "azul": "azul_escuro", "cinza": "cinza_medio", "vermelho": "vermelho_escuro", "menta": "verde_agua",
          "salmao": "terracota_clara", "verde": "verde_escuro", "azul_claro": "azul", "mostarda": "terracota",
          "rosa_escuro": "magenta", "petroleo": "azul_marinho", "vermelho_claro": "vermelho", "lilas_claro": "lilas",
          "terracota_clara": "terracota", "amarelo": "laranja", "creme": "bege_escuro"}


def fileira(especs, sem=0, inclina_ultimo=0.0):
    """especs: [(t, p, a, cor, faixa?)]; monta lado a lado em x, centrado. faixa: None ou (frac0, frac1, cor)."""
    objs = []
    larg = sum(e[0] for e in especs) + 0.002 * (len(especs) - 1)
    x = -larg / 2
    for i, e in enumerate(especs):
        t, p, a, cor = e[:4]
        fx = e[4] if len(e) > 4 else None
        faixas = [(a * fx[0], a * fx[1], fx[2])] if fx else ()
        inc = inclina_ultimo if (i == len(especs) - 1 and inclina_ultimo) else 0.0
        if inc:
            # encosta no vizinho: gira pela quina de baixo do lado de fora
            ob = livro(t, p, a, cor, faixas, x=0, nome=f"l{i}")
            gira(ob, "Y", inc, (t / 2, 0, 0))
            dx = x + 0.002 + a * math.sin(math.radians(abs(inc))) + t / 2 - t / 2 * math.cos(math.radians(abs(inc)))
            move(ob, V((dx, 0, 0)))
            # assenta no chão depois de girar
            lo, _ = mb.bbox(ob)
            move(ob, V((0, 0, -lo.z)))
            objs += ob
        else:
            objs += livro(t, p, a, cor, faixas, x=x + t / 2, nome=f"l{i}")
        x += t + 0.002
    return objs


def livros_itens():
    R = []

    def reg(id_, rotulo, grupo, fn, tags=(), pac=False):
        R.append((id_, rotulo, grupo, fn, tags, pac))

    # --- fileiras em pé (alturas desencontradas)
    def fileira_grande():
        it = mb.Item("livros_fileira_grande")
        rnd = random.Random(3)
        cores = ["marrom", "azul_celeste", "verde_claro", "verde_lima", "turquesa", "amarelo_escuro", "rosa",
                 "rosa_bebe", "laranja", "verde_agua"]
        esp = []
        for i, c in enumerate(cores):
            a = [0.27, 0.25, 0.245, 0.255, 0.24, 0.23, 0.25, 0.265, 0.245, 0.24][i]
            t = [0.045, 0.03, 0.034, 0.04, 0.03, 0.028, 0.036, 0.046, 0.03, 0.032][i]
            fx = (0.78, 0.84, ESCURO[c]) if i in (0, 3, 7) else None
            esp.append((t, 0.17 + rnd.uniform(-0.01, 0.01), a, c, fx))
        it.add(fileira(esp, inclina_ultimo=-22))
        assenta(it, "apoio")
        return it
    reg("livros_fileira_grande", "Fileira de livros grande", "livros_fileira_grande", fileira_grande,
        ["estante", "decoracao"])

    def fileira_media():
        it = mb.Item("livros_fileira_media")
        cores = ["verde_claro", "roxo", "azul_celeste", "cinza", "azul", "vermelho_claro", "lilas"]
        hs = [0.2, 0.235, 0.215, 0.23, 0.205, 0.225, 0.21]
        ts = [0.03, 0.04, 0.03, 0.036, 0.024, 0.03, 0.026]
        esp = []
        for i, c in enumerate(cores):
            fx = {1: (0.72, 0.8, "lilas"), 4: (0.4, 0.5, "verde_lima"), 3: (0.8, 0.86, "grafite")}.get(i)
            esp.append((ts[i], 0.15, hs[i], c, fx))
        it.add(fileira(esp))
        assenta(it, "apoio")
        return it
    reg("livros_fileira_media", "Fileira de livros média", "livros_fileira_media", fileira_media, ["estante"])

    def fileira_pequena():
        it = mb.Item("livros_fileira_pequena")
        esp = [(0.028, 0.14, 0.19, "amarelo_escuro", (0.55, 0.68, "vermelho")), (0.034, 0.15, 0.215, "rosa"),
               (0.026, 0.14, 0.2, "turquesa"), (0.05, 0.16, 0.225, "verde_lima")]
        it.add(fileira(esp))
        assenta(it, "apoio")
        return it
    reg("livros_fileira_pequena", "Quatro livros em pé", "livros_fileira_pequena", fileira_pequena, ["estante"])

    def fileira_escada():
        it = mb.Item("livros_fileira_escada")
        esp = [(0.06, 0.19, 0.27, "verde", (0.66, 0.73, "verde_escuro")), (0.03, 0.18, 0.26, "azul_celeste"),
               (0.028, 0.17, 0.235, "marrom"), (0.04, 0.18, 0.255, "verde_agua", (0.85, 0.9, "verde_medio")),
               (0.032, 0.18, 0.27, "amarelo"), (0.03, 0.17, 0.25, "rosa_bebe"), (0.036, 0.17, 0.28, "menta"),
               (0.026, 0.16, 0.24, "salmao")]
        it.add(fileira(esp, inclina_ultimo=-18))
        assenta(it, "apoio")
        return it
    reg("livros_fileira_escada", "Fileira de livros com um tombado", "livros_fileira_escada", fileira_escada,
        ["estante"])

    # --- pilhas
    def pilha_dois():
        it = mb.Item("livros_pilha_dois")
        it.add(livro_deitado(0.04, 0.17, 0.24, "azul", [(0.03, 0.05, "azul_escuro")], z=0))
        it.add(livro_deitado(0.035, 0.16, 0.23, "verde", z=0.0405, rot=-4, x=-0.005))
        assenta(it, "apoio")
        return it
    reg("livros_pilha_dois", "Dois livros empilhados", "livros_pilha_dois", pilha_dois, ["mesa"])

    def pilha_cinco():
        it = mb.Item("livros_pilha_cinco")
        z = 0.0
        for k, (t, p, a, c, r) in enumerate([(0.032, 0.18, 0.25, "amarelo", 3), (0.03, 0.17, 0.24, "roxo", -4),
                                             (0.034, 0.175, 0.235, "azul_claro", 2), (0.03, 0.17, 0.24, "verde_agua", -2),
                                             (0.036, 0.17, 0.225, "azul_acinzentado", 5)]):
            it.add(livro_deitado(t, p, a, c, x=0.004 * ((-1) ** k), z=z, rot=r, nome=f"p{k}"))
            z += t + 0.0005
        assenta(it, "apoio")
        return it
    reg("livros_pilha_cinco", "Pilha de cinco livros", "livros_pilha_cinco", pilha_cinco, ["mesa"])

    def pilha_tres():
        it = mb.Item("livros_pilha_tres")
        it.add(livro_deitado(0.034, 0.17, 0.25, "vermelho", z=0))
        it.add(livro_deitado(0.03, 0.155, 0.23, "marrom", [(0.03, 0.05, "marrom_escuro")], z=0.0345, rot=8, x=0.01))
        it.add(livro_deitado(0.028, 0.14, 0.2, "amarelo", z=0.065, rot=-6, x=-0.005))
        assenta(it, "apoio")
        return it
    reg("livros_pilha_tres", "Três livros empilhados", "livros_pilha_tres", pilha_tres, ["mesa"])

    # --- soltos
    def fechado():
        it = mb.Item("livro_fechado_marrom")
        it.add(livro_deitado(0.034, 0.155, 0.22, "marrom_claro", rot=0))
        it.add(C(0.07, 0.05, 0.003, x=0.02, y=0.01, z=0.0332, cor="creme_claro", bisel=0.0012, seg=1))
        assenta(it, "apoio")
        return it
    reg("livro_fechado_marrom", "Livro fechado com etiqueta", "livro_fechado", fechado, ["mesa"])

    def aberto():
        it = mb.Item("livro_aberto")
        p, a = 0.15, 0.22
        it.add(C(2 * p + 0.016, a + 0.012, 0.005, cor="azul_celeste", bisel=0.0022, seg=2))
        for s in (-1, 1):
            pag = mb.superelipsoide(p - 0.004, a - 0.006, 0.022, e=0.14, e_v=0.4, nu=24, nv=8, cor="papel")
            T(pag, loc=(0, 0, -0.011))
            T(pag, rot=("Y", -s * 5))
            T(pag, loc=(s * (p / 2 + 0.001), 0, 0.016))
            it.add(pag)
            for k in range(6):
                w = p * (0.62 if k != 5 else 0.4)
                ln = C(w, 0.004, 0.0016, x=-s * (p * 0.62 - w) / 2, y=a * 0.3 - k * 0.026, z=0.0102,
                       cor="cinza_claro", bisel=0.0007, seg=1)
                T(ln, rot=("Y", -s * 5))
                T(ln, loc=(s * (p / 2 + 0.001), 0, 0.016))
                it.add(ln)
        it.add(Cil(0.004, a - 0.004, z=0.012, cor="papel_amarelado", eixo="y", seg=10, bisel=0.0))
        it.add(C(0.006, 0.05, 0.003, x=0.004, y=-a / 2 - 0.02, z=0.003, cor="vermelho", bisel=0.001, seg=1))
        assenta(it, "apoio")
        return it
    reg("livro_aberto", "Livro aberto", "livro_aberto", aberto, ["mesa", "leitura"])

    def revistas():
        it = mb.Item("revistas_par")
        r1 = C(0.21, 0.28, 0.006, cor="vermelho", bisel=0.0022, seg=2)
        T(r1, rot=("Z", -8))
        it.add(r1)
        r2 = C(0.2, 0.27, 0.006, x=0.03, y=-0.015, z=0.0062, cor="turquesa", bisel=0.0022, seg=2)
        T(r2, rot=("Z", 6))
        it.add(r2)
        for k, (cf, w) in enumerate((("amarelo", 0.12), ("branco", 0.08))):
            fx = C(w, 0.025, 0.002, x=0.01 + 0.02, y=0.07 - k * 0.04, z=0.0122, cor=cf, bisel=0.0008, seg=1)
            T(fx, rot=("Z", 6))
            it.add(fx)
        assenta(it, "apoio")
        return it
    reg("revistas_par", "Duas revistas", "revistas", revistas, ["mesa", "papel"])

    def revista_listrada():
        it = mb.Item("revista_listrada")
        rv = C(0.2, 0.27, 0.007, cor="verde_claro", bisel=0.0022, seg=2)
        corta(rv, "y", [-0.06, -0.02, 0.03, 0.06])
        mb.pinta_onde(rv, "amarelo_claro", lambda c, n: -0.06 < c.y < -0.02 and n.z > 0.5)
        mb.pinta_onde(rv, "azul_celeste", lambda c, n: 0.03 < c.y < 0.06 and n.z > 0.5)
        it.add(rv)
        assenta(it, "apoio")
        return it
    reg("revista_listrada", "Revista listrada", "revistas", revista_listrada, ["mesa", "papel"])

    def caderno():
        it = mb.Item("caderno_rosa")
        it.add(C(0.18, 0.24, 0.012, cor="rosa", bisel=0.003, seg=2))
        it.add(C(0.17, 0.234, 0.008, x=0.004, z=0.002, cor="papel", bisel=0.0015, seg=1))
        for (w, d_, x, y) in ((0.12, 0.004, 0.004, 0.085), (0.12, 0.004, 0.004, -0.085), (0.004, 0.174, -0.056, 0),
                              (0.004, 0.174, 0.064, 0)):
            it.add(C(w, d_, 0.0016, x=x, y=y, z=0.0115, cor="rosa_claro", bisel=0.0007, seg=1))
        it.add(C(0.014, 0.24, 0.0135, x=-0.084, cor="rosa_escuro", bisel=0.003, seg=2))
        assenta(it, "apoio")
        return it
    reg("caderno_rosa", "Caderno rosa", "caderno", caderno, ["mesa", "papel"])

    # --- pacote
    def pac(nome, id_, esc):
        def f():
            it = mb.Item(id_)
            it.add(list(pacote(nome, esc).values()))
            assenta(it, "apoio")
            return it
        return f
    reg("livros_fileira_pacote", "Fileira de livros (pacote)", "livros_fileira_pacote", pac("Book_03", "livros_fileira_pacote", 0.8), ["estante"], True)
    reg("livros_pilha_pacote", "Pilha de livros (pacote)", "livros_pilha_pacote", pac("Book_08", "livros_pilha_pacote", 0.8), ["mesa"], True)
    reg("papeis_pacote", "Folhas soltas (pacote)", "papeis", pac("Paper_01", "papeis_pacote", 0.8), ["mesa", "papel"], True)
    reg("papel_pacote", "Folha de papel (pacote)", "papeis", pac("Paper_02", "papel_pacote", 1.0), ["mesa", "papel"], True)
    return R


# =====================================================================================================================
# LUMINÁRIAS
# =====================================================================================================================
def luminarias_itens():
    R = []

    def reg(id_, rotulo, grupo, fn, tags=(), fix="chao", alt=None, pac=False):
        R.append((id_, rotulo, grupo, fn, tags, pac, fix, alt))

    def base_disco(r, h, x=0.0, y=0.0, cor="grafite"):
        return mb.torno([(0, 0), (r * 0.97, 0), (r, h * 0.25), (r * 0.98, h * 0.7), (r * 0.85, h), (r * 0.3, h * 1.15),
                         (0, h * 1.15)], x=x, y=y, cor=cor, seg=32)

    # 1. de arco com cúpula em domo
    def arco():
        it = mb.Item("luminaria_chao_arco")
        x0, x1, zt = -0.32, 0.32, 1.42
        it.add(base_disco(0.17, 0.035, x=x0))
        pts = [(x0, 0, 0.03), (x0, 0, zt)] + mb.arco_pts(0, zt, 0.32, 180, 0, n=12)[1:] + [(x1, 0, zt - 0.06)]
        it.add(mb.tubo(pts, 0.012, cor="cinza_azulado", raio_curva=0.05))
        it.add(Cil(0.022, 0.05, x=x1, z=zt - 0.09, cor="grafite", seg=16))
        it.add(domo(0.17, 0.16, 0.008, x=x1, z=zt - 0.24, cor="amarelo_claro"))
        it.add(lampada(0.04, x=x1, z=zt - 0.17))
        d = assenta(it)
        return it, luz_extra(V((x1, 0, zt - 0.19)) + d, 4.5)
    reg("luminaria_chao_arco", "Luminária de chão em arco", "luminaria_chao_arco", arco, ["chao", "sala"])

    # 2. de chão com cúpula cônica
    def conica():
        it = mb.Item("luminaria_chao_cupula")
        it.add(base_disco(0.15, 0.035, cor="amarelo_escuro"))
        it.add(Cil(0.015, 1.3, z=0.03, cor="amarelo", seg=16))
        it.add(Cil(0.03, 0.05, z=1.28, cor="amarelo_escuro", seg=16))
        it.add(cupula(0.2, 0.12, 0.32, 0.009, z=1.27, cor="lilas"))
        it.add(lampada(0.045, z=1.38))
        d = assenta(it)
        return it, luz_extra(V((0, 0, 1.4)) + d, 4.0)
    reg("luminaria_chao_cupula", "Luminária de chão com cúpula", "luminaria_chao_cupula", conica, ["chao", "sala", "quarto"])

    # 3. tripé do pacote
    def tripe():
        it = mb.Item("luminaria_chao_tripe_pacote")
        pc = pacote("Light_05")
        o = pc["corpo"]
        uv = o.data.uv_layers["UVMap"].data
        lamp, cup = mb.NOMES.index("laranja_claro"), mb.NOMES.index("terracota")
        lo, hi = mb.bbox(o)
        for p in o.data.polygons:
            u = uv[p.loop_indices[0]].uv
            ci = int(u[0] * 16) + 16 * int((1 - u[1]) * 16)
            c, n = V(p.center), V(p.normal)
            rad = V((c.x, c.y, 0))
            if ci == lamp or (ci == cup and c.z > hi.z - 0.19 and rad.length > 1e-4 and
                              n.dot(rad.normalized()) < -0.3):
                p.material_index = mb.MAT_NOMES.index("luz")
        it.add(o)
        d = assenta(it)
        return it, luz_extra(V((0, 0, hi.z - 0.12)) + d, 4.0)
    reg("luminaria_chao_tripe_pacote", "Luminária de tripé (pacote)", "luminaria_chao_tripe", tripe, ["chao", "sala"], pac=True)

    # 4. de chão com prato (domo baixo)
    def prato():
        it = mb.Item("luminaria_chao_prato")
        it.add(mb.torno([(0, 0), (0.17, 0), (0.175, 0.012), (0.12, 0.05), (0.04, 0.085), (0.018, 0.1), (0, 0.1)],
                        cor="branco_gelo", seg=32))
        it.add(Cil(0.011, 1.42, z=0.09, cor="metal_claro", seg=14))
        it.add(Cil(0.024, 0.03, z=0.96, cor="metal_claro", seg=16))
        it.add(Cil(0.022, 0.05, z=1.49, cor="grafite", seg=16))
        it.add(domo(0.26, 0.1, 0.008, z=1.52, cor="menta", n=8))
        it.add(toro(0.256, 0.009, z=1.52, cor="grafite", seg=40, segt=6))
        it.add(lampada(0.045, z=1.54))
        d = assenta(it)
        return it, luz_extra(V((0, 0, 1.53)) + d, 4.0)
    reg("luminaria_chao_prato", "Luminária de chão com prato", "luminaria_chao_prato", prato, ["chao", "sala"])

    # 5. lanterna de papel
    def lanterna():
        it = mb.Item("luminaria_chao_lanterna")
        it.add(base_disco(0.16, 0.04, cor="terracota_escura"))
        it.add(toro(0.13, 0.012, z=0.03, cor="terracota", seg=32, segt=6))
        it.add(Cil(0.022, 0.72, z=0.04, cor="terracota_escura", seg=16))
        it.add(Cil(0.05, 0.03, z=0.74, cor="terracota", seg=20))
        z0, h, nb = 0.76, 0.62, 6
        ext, inn = [], []
        for k in range(nb * 4 + 1):
            u = k / (nb * 4)
            r = 0.13 + 0.016 * math.cos(2 * math.pi * u * nb)
            ext.append((r, h * u))
            inn.append((r - 0.008, h * u))
        perfil = ext + [(ext[-1][0] - 0.004, h + 0.004)] + inn[::-1] + [(inn[0][0] + 0.004, -0.004)]
        perfil.append(perfil[0])
        lt = mb.torno(perfil, z=z0, cor="creme_claro", seg=22, angulo=70)
        mb.pinta_onde(lt, None, lambda c, n: n.dot(V((c.x, c.y, 0)).normalized()) < -0.3, mat="luz")
        it.add(lt)
        for zz in (z0, z0 + h):
            it.add(toro(0.135, 0.01, z=zz, cor="terracota_escura", seg=32, segt=6))
        for a in (0, 90):
            br = C(0.25, 0.012, 0.012, z=z0 + h - 0.006, cor="terracota_escura", bisel=0.004, seg=1)
            T(br, rot=("Z", a))
            it.add(br)
        it.add(Esf(0.022, z=z0 + h + 0.004, cor="terracota", seg=12))
        it.add(lampada(0.05, z=z0 + h * 0.55))
        d = assenta(it)
        return it, luz_extra(V((0, 0, z0 + h * 0.55)) + d, 4.0)
    reg("luminaria_chao_lanterna", "Luminária de chão lanterna", "luminaria_chao_lanterna", lanterna, ["chao", "sala", "oriental"])

    # 6. globo com mesinha
    def globo():
        it = mb.Item("luminaria_chao_globo_mesinha")
        xo = -0.1
        it.add(base_disco(0.17, 0.035, x=xo))
        pts = [(xo, 0, 0.03), (xo, 0, 1.5)] + mb.arco_pts(xo + 0.15, 1.5, 0.15, 180, 0, n=14)[1:] + \
              [(xo + 0.3, 0, 1.4)]
        it.add(mb.tubo(pts, 0.012, cor="grafite", raio_curva=0.05))
        it.add(Cil(0.02, 0.04, x=xo + 0.3, z=1.37, cor="grafite_escuro", seg=16))
        it.add(Esf(0.085, x=xo + 0.3, z=1.29, cor=None, mat="luz", seg=24))
        it.add(Cil(0.15, 0.032, x=xo + 0.04, z=0.62, cor="madeira_media", seg=32, bisel=0.01))
        it.add(Cil(0.02, 0.05, x=xo, z=0.6, cor="grafite_escuro", seg=16))
        d = assenta(it)
        return it, luz_extra(V((xo + 0.3, 0, 1.29)) + d, 4.0)
    reg("luminaria_chao_globo_mesinha", "Luminária de chão com globo e mesinha", "luminaria_chao_globo", globo, ["chao", "sala"])

    # 7. dois cones
    def dupla():
        it = mb.Item("luminaria_chao_dupla")
        it.add(base_disco(0.16, 0.035))
        a1, a2 = (-0.09, 1.3), (0.12, 1.12)
        it.add(mb.tubo([(-0.025, 0, 0.03), (a1[0], 0, a1[1])], 0.011, cor="metal", raio_curva=0.001))
        it.add(mb.tubo([(0.025, 0, 0.03), (a2[0], 0, a2[1])], 0.011, cor="metal", raio_curva=0.001))
        tri = mb.extrudado(mb._ccw([(-0.06, 0.0), (0.075, 0.0), (0.0, -0.05)]), 0.03, y=-0.015, z=0.5, plano="xz",
                           cor="grafite", bisel=0.008)
        it.add(tri)
        it.add(cupula(0.06, 0.1, 0.26, 0.008, x=a1[0], z=a1[1] - 0.03, cor="verde_lima"))
        it.add(cupula(0.06, 0.1, 0.26, 0.008, x=a2[0], z=a2[1] - 0.03, cor="laranja_claro"))
        it.add(lampada(0.035, x=a1[0], z=a1[1] + 0.08))
        it.add(lampada(0.035, x=a2[0], z=a2[1] + 0.08))
        d = assenta(it)
        return it, luz_extra(V((a1[0], 0, a1[1] + 0.12)) + d, 4.0)
    reg("luminaria_chao_dupla", "Luminária de chão com dois cones", "luminaria_chao_dupla", dupla, ["chao", "sala"])

    # 8. arandela com cúpula pendurada
    def arandela_cupula():
        it = mb.Item("arandela_cupula")
        zp = 0.3
        it.add(Cil(0.07, 0.022, y=-0.011, z=zp, cor="grafite", eixo="y", seg=28, bisel=0.006))
        it.add(toro(0.07, 0.016, y=-0.024, z=zp, cor="amarelo", eixo="y", seg=28, segt=8))
        it.add(Cil(0.03, 0.02, y=-0.035, z=zp, cor="grafite", eixo="y", seg=16))
        it.add(mb.tubo([(0, -0.04, zp), (0, -0.12, zp), (0, -0.15, zp - 0.04), (0, -0.15, 0.16)], 0.011,
                       cor="grafite", raio_curva=0.035))
        it.add(cupula(0.09, 0.075, 0.15, 0.008, y=-0.15, z=0.01, cor="creme_claro"))
        it.add(toro(0.09, 0.009, y=-0.15, z=0.01, cor="grafite", seg=32, segt=6))
        it.add(toro(0.075, 0.009, y=-0.15, z=0.16, cor="grafite", seg=32, segt=6))
        it.add(lampada(0.035, y=-0.15, z=0.11))
        d = assenta(it, "parede")
        return it, luz_extra(V((0, -0.15, 0.09)) + d, 3.5)
    reg("arandela_cupula", "Arandela com cúpula", "arandela_cupula", arandela_cupula, ["parede", "quarto"], fix="parede", alt=1.55)

    # 9. arandela com prato largo
    def arandela_prato():
        it = mb.Item("arandela_prato")
        zp = 0.3
        it.add(Cil(0.075, 0.02, y=-0.01, z=zp, cor="amarelo_escuro", eixo="y", seg=28, bisel=0.006))
        it.add(Cil(0.055, 0.02, y=-0.028, z=zp, cor="amarelo", eixo="y", seg=28, bisel=0.006))
        it.add(toro(0.06, 0.012, y=-0.02, z=zp, cor="amarelo", eixo="y", seg=28, segt=6))
        it.add(mb.tubo([(0, -0.035, zp), (0, -0.1, zp + 0.03), (0, -0.17, zp + 0.01), (0, -0.21, zp - 0.05),
                        (0, -0.21, 0.19)], 0.012, cor="amarelo_escuro", raio_curva=0.04))
        it.add(mb.torno([(0, 0), (0.035, 0), (0.04, 0.01), (0.03, 0.04), (0.014, 0.06), (0, 0.065)], y=-0.21, z=0.14,
                        cor="amarelo", seg=20))
        it.add(domo(0.2, 0.09, 0.008, y=-0.21, z=0.06, cor="azul_bebe", n=8))
        it.add(lampada(0.035, y=-0.21, z=0.09))
        d = assenta(it, "parede")
        return it, luz_extra(V((0, -0.21, 0.08)) + d, 3.5)
    reg("arandela_prato", "Arandela com prato", "arandela_prato", arandela_prato, ["parede", "sala"], fix="parede", alt=1.6)

    # 10. plafon
    def plafon():
        it = mb.Item("plafon_disco")
        it.add(mb.torno([(0, -0.045), (0.15, -0.045), (0.17, -0.035), (0.175, -0.012), (0.165, 0.0), (0, 0.0)],
                        cor="branco", seg=36))
        it.add(toro(0.12, 0.008, z=-0.045, cor="amarelo_claro", seg=36, segt=6))
        b = Esf(0.105, z=-0.045, cor=None, mat="luz", seg=28, esc=(1, 1, 0.75))
        it.add(b)
        d = assenta(it, "teto")
        return it, luz_extra(V((0, 0, -0.1)) + d, 5.0)
    reg("plafon_disco", "Plafon redondo", "plafon_disco", plafon, ["teto"], fix="teto")

    # 11. arandela tubo (difusor deitado)
    def arandela_tubo():
        it = mb.Item("arandela_tubo")
        L, r = 0.36, 0.055
        perfil = [(0, -L / 2)] + [(r * math.cos(a), -L / 2 + r - r * math.sin(a)) for a in
                                  [math.pi / 2 * (1 - k / 6) for k in range(1, 7)]]
        perfil += [(r * math.cos(a), L / 2 - r + r * math.sin(a)) for a in [math.pi / 2 * k / 6 for k in range(0, 6)]]
        perfil += [(0, L / 2)]
        cap = mb.torno(perfil, cor=None, mat="luz", seg=24, angulo=60)
        T(cap, rot=("Y", 90))
        T(cap, loc=(0, -0.085, 0.07))
        it.add(cap)
        it.add(Cil(r + 0.008, 0.055, x=0, y=-0.085, z=0.07, cor="terracota", eixo="x", seg=28, bisel=0.008))
        it.add(C(0.05, 0.06, 0.05, y=-0.03, z=0.045, cor="terracota_escura", bisel=0.012))
        it.add(Cil(0.04, 0.012, y=-0.006, z=0.07, cor="terracota_escura", eixo="y", seg=24, bisel=0.004))
        d = assenta(it, "parede")
        return it, luz_extra(V((0, -0.085, 0.07)) + d, 3.0)
    reg("arandela_tubo", "Arandela de tubo", "arandela_tubo", arandela_tubo, ["parede", "banheiro"], fix="parede", alt=1.7)

    # 12. arandela taça
    def arandela_taca():
        it = mb.Item("arandela_taca")
        it.add(Cil(0.065, 0.02, y=-0.01, z=0.14, cor="amarelo", eixo="y", seg=28, bisel=0.006))
        it.add(toro(0.06, 0.012, y=-0.022, z=0.14, cor="amarelo_escuro", eixo="y", seg=28, segt=6))
        it.add(Cil(0.018, 0.08, y=-0.06, z=0.14, cor="amarelo_escuro", eixo="y", seg=14))
        it.add(mb.torno([(0, 0), (0.04, 0), (0.042, 0.012), (0.024, 0.03), (0.02, 0.07), (0.03, 0.1), (0.035, 0.12),
                         (0.0, 0.12)], y=-0.1, z=0.0, cor="amarelo", seg=24))
        it.add(toro(0.026, 0.01, y=-0.1, z=0.135, cor="amarelo_escuro", seg=20, segt=6))
        it.add(cupula(0.032, 0.062, 0.08, 0.008, y=-0.1, z=0.12, cor="amarelo"))
        it.add(lampada(0.026, y=-0.1, z=0.17))
        d = assenta(it, "parede")
        return it, luz_extra(V((0, -0.1, 0.19)) + d, 3.0)
    reg("arandela_taca", "Arandela de taça", "arandela_taca", arandela_taca, ["parede", "sala"], fix="parede", alt=1.6)

    # 13. pendente
    def pendente():
        it = mb.Item("pendente_cupula")
        it.add(mb.torno([(0, -0.03), (0.055, -0.03), (0.065, -0.02), (0.065, -0.004), (0.06, 0), (0, 0)],
                        cor="branco", seg=24))
        it.add(Cil(0.004, 0.58, z=-0.6, cor="preto", seg=8, bisel=0.0))
        it.add(mb.torno([(0, 0), (0.05, 0), (0.05, 0.01), (0.03, 0.05), (0.012, 0.075), (0, 0.078)], z=-0.68,
                        cor="amarelo", seg=24))
        it.add(domo(0.21, 0.12, 0.008, z=-0.78, cor="azul_bebe", n=9))
        it.add(lampada(0.04, z=-0.74))
        d = assenta(it, "teto")
        return it, luz_extra(V((0, 0, -0.76)) + d, 5.0)
    reg("pendente_cupula", "Pendente com cúpula", "pendente_cupula", pendente, ["teto", "cozinha"], fix="teto")

    # 14. luminária de lava
    def lava():
        it = mb.Item("luminaria_lava")
        it.add(mb.torno([(0, 0), (0.07, 0), (0.074, 0.008), (0.07, 0.016), (0.044, 0.1), (0.04, 0.11), (0, 0.11)],
                        cor="cinza_azulado", seg=28))
        perf = [(0, 0.1)] + [(0.045 + 0.012 * math.sin(math.pi * k / 6), 0.1 + 0.08 * k / 6) for k in range(7)]
        perf += [(0.057 - 0.03 * (k / 8) ** 1.3, 0.18 + 0.16 * k / 8) for k in range(1, 9)]
        perf += [(0.027 * math.cos(math.pi / 2 * k / 4), 0.34 + 0.03 * math.sin(math.pi / 2 * k / 4)) for k in range(1, 5)]
        vid = mb.torno(perf, cor=None, mat="vidro", seg=28)
        it.add(vid)
        for x, z, r in ((0.0, 0.14, 0.03), (0.012, 0.25, 0.02), (-0.008, 0.215, 0.017), (0.006, 0.31, 0.012)):
            it.add(Esf(r, x=x, y=0.0, z=z, cor=None, mat="luz", seg=14, esc=(1, 1, 1.25)))
        it.add(Cil(0.05, 0.012, z=0.105, cor="cinza_azulado", seg=24, bisel=0.004))
        it.add(mb.torno([(0, 0.335), (0.03, 0.335), (0.034, 0.345), (0.026, 0.375), (0.012, 0.384), (0, 0.385)],
                        cor="cinza_azulado", seg=24))
        d = assenta(it, "apoio")
        return it, luz_extra(V((0, 0, 0.2)) + d, 1.8, "#FFD8A0")
    reg("luminaria_lava", "Luminária de lava", "luminaria_lava", lava, ["mesa", "quarto", "retro"], fix="apoio")

    # 15. abajur cogumelo
    def cogumelo():
        it = mb.Item("abajur_cogumelo")
        it.add(mb.torno([(0, 0), (0.08, 0), (0.083, 0.012), (0.075, 0.025), (0.03, 0.035), (0, 0.035)],
                        cor="azul_celeste", seg=28))
        it.add(Cil(0.016, 0.21, z=0.03, cor="azul_celeste", seg=14))
        it.add(domo(0.17, 0.11, 0.008, z=0.22, cor="verde_medio", n=9))
        it.add(lampada(0.03, z=0.25))
        d = assenta(it, "apoio")
        return it, luz_extra(V((0, 0, 0.24)) + d, 2.5)
    reg("abajur_cogumelo", "Abajur cogumelo", "abajur_cogumelo", cogumelo, ["mesa", "quarto"], fix="apoio")

    # 16. de mesa articulada
    def articulada():
        it = mb.Item("luminaria_mesa_articulada")
        it.add(mb.torno([(0, 0), (0.085, 0), (0.088, 0.012), (0.08, 0.03), (0.02, 0.036), (0, 0.036)],
                        cor="vermelho", seg=28))
        it.add(C(0.04, 0.035, 0.04, y=0.02, z=0.03, cor="vermelho", bisel=0.01))
        it.add(Cil(0.018, 0.05, y=0.02, z=0.06, cor="amarelo", eixo="x", seg=16))
        p0, p1, p2 = V((0, 0.02, 0.06)), V((0, 0.07, 0.25)), V((0, -0.05, 0.36))
        for sx in (-0.013, 0.013):
            it.add(mb.tubo([p0 + V((sx, 0, 0)), p1 + V((sx, 0, 0))], 0.006, cor="turquesa", raio_curva=0.001))
            it.add(mb.tubo([p1 + V((sx, 0, 0)), p2 + V((sx, 0, 0))], 0.006, cor="turquesa", raio_curva=0.001))
        it.add(Cil(0.02, 0.045, x=0, y=p1.y, z=p1.z, cor="amarelo", eixo="x", seg=16))
        it.add(Cil(0.018, 0.04, x=0, y=p2.y, z=p2.z, cor="amarelo", eixo="x", seg=16))
        cab = [cupula(0.07, 0.035, 0.09, 0.008, cor="vermelho"), lampada(0.03, z=0.03)]
        cab.append(Cil(0.035, 0.03, z=0.085, cor="vermelho", seg=20, bisel=0.008))
        ang = -55
        gira(cab, "X", ang)
        ax = V((0, -math.sin(math.radians(ang)), math.cos(math.radians(ang))))
        move(cab, p2 - ax * 0.11 + V((0, -0.005, 0)))
        it.add(cab)
        luzp = p2 - ax * 0.08
        d = assenta(it, "apoio")
        return it, luz_extra(luzp + d, 2.5)
    reg("luminaria_mesa_articulada", "Luminária de mesa articulada", "luminaria_mesa_articulada", articulada, ["mesa", "escritorio"], fix="apoio")

    # 17. de mesa flexível
    def flexivel():
        it = mb.Item("luminaria_mesa_flexivel")
        it.add(mb.torno([(0, 0), (0.09, 0), (0.094, 0.012), (0.085, 0.03), (0.02, 0.036), (0, 0.036)],
                        cor="amarelo", seg=28, esc=(1.25, 1.0)))
        it.add(Cil(0.014, 0.012, x=-0.05, y=-0.035, z=0.03, cor="vermelho", seg=14, bisel=0.004))
        it.add(Cil(0.022, 0.06, x=0.05, y=0.03, z=0.03, cor="amarelo", seg=16))
        pts = [(0.05, 0.03, 0.08), (0.05, 0.035, 0.26)] + [(0.05, 0.035 - 0.07 + 0.07 * math.cos(math.pi * k / 10),
                                                           0.26 + 0.07 * math.sin(math.pi * k / 10)) for k in range(1, 11)]
        pts += [(0.05, -0.105, 0.22)]
        it.add(mb.tubo(pts, 0.008, cor="cinza", raio_curva=0.03))
        cab = [domo(0.07, 0.065, 0.007, cor="amarelo", n=8), lampada(0.028, z=0.02),
               Cil(0.018, 0.03, z=0.06, cor="amarelo_escuro", seg=14)]
        gira(cab, "X", -35)
        move(cab, V((0.05, -0.105 - 0.065 * math.sin(math.radians(35)), 0.22 - 0.075 * math.cos(math.radians(35)))))
        it.add(cab)
        d = assenta(it, "apoio")
        return it, luz_extra(V((0.05, -0.16, 0.15)) + d, 2.5)
    reg("luminaria_mesa_flexivel", "Luminária de mesa flexível", "luminaria_mesa_flexivel", flexivel, ["mesa", "escritorio"], fix="apoio")

    # 18. abajur clássico
    def classico():
        it = mb.Item("abajur_classico")
        it.add(mb.torno([(0, 0)] + suave([(0.062, 0), (0.082, 0.02), (0.088, 0.06), (0.07, 0.095), (0.035, 0.115),
                                          (0.022, 0.13)], 3) + [(0, 0.13)], cor="rosa", seg=28, angulo=60))
        it.add(Cil(0.012, 0.05, z=0.125, cor="ouro", seg=12))
        it.add(cupula(0.115, 0.06, 0.13, 0.008, z=0.14, cor="amarelo_claro"))
        it.add(lampada(0.032, z=0.2))
        d = assenta(it, "apoio")
        return it, luz_extra(V((0, 0, 0.2)) + d, 2.5)
    reg("abajur_classico", "Abajur clássico", "abajur_classico", classico, ["mesa", "quarto"], fix="apoio")
    return R


# =====================================================================================================================
# OBJETOS (definidos mais abaixo)
# =====================================================================================================================
def objetos_itens():
    return OBJETOS_ITENS()


# =====================================================================================================================
# Execução
# =====================================================================================================================
def roda_livros():
    cat = mb.Catalogo("livros", SAIDA, "Livros e papéis")
    for id_, rot, grupo, fn, tags, pac in livros_itens():
        if IDS_PEDIDOS and id_ not in IDS_PEDIDOS:
            continue
        mb.limpa()
        it = fn()
        cat.exporta(it, rot, grupo=grupo, fixacao="apoio", pacote=pac, tags=["livros"] + list(tags),
                    miniatura_dir=(0.6, -1.0, 0.75))
    cat.salva()


def roda_luminarias():
    cat = mb.Catalogo("luminarias", SAIDA, "Luminárias")
    for id_, rot, grupo, fn, tags, pac, fix, alt in luminarias_itens():
        if IDS_PEDIDOS and id_ not in IDS_PEDIDOS:
            continue
        mb.limpa()
        it, extra = fn()
        md = (0.55, -1.0, 0.5) if fix != "teto" else (0.55, -1.0, -0.25)
        cat.exporta(it, rot, grupo=grupo, fixacao=fix, altura_instalacao=alt, pacote=pac,
                    tags=["luminaria", "luz"] + list(tags), extra=extra, miniatura_dir=md)
    cat.salva()


def roda_objetos():
    cat = mb.Catalogo("objetos", SAIDA, "Objetos")
    estampas()
    for id_, rot, grupo, fn, tags, pac, fix, alt in objetos_itens():
        if IDS_PEDIDOS and id_ not in IDS_PEDIDOS:
            continue
        mb.limpa()
        r = fn()
        it, extra, md = (r + (None, None))[:3] if isinstance(r, tuple) else (r, None, None)
        cat.exporta(it, rot, grupo=grupo, fixacao=fix, altura_instalacao=alt, pacote=pac, tags=list(tags),
                    extra=extra, miniatura_dir=md or (0.55, -1.0, 0.5))
    cat.salva()


def alto_falante(r, x, y, z, aro="grafite", cone="grafite_escuro", centro="cinza_azulado", seg=20):
    """Alto-falante num painel cuja frente está no plano y (sai para −Y)."""
    ps = [toro(r * 0.86, r * 0.13, x=x, y=y - 0.002, z=z, cor=aro, eixo="y", seg=seg, segt=5)]
    cn = mb.torno([(0, -0.004), (r * 0.8, -0.004), (r * 0.8, r * 0.14), (r * 0.74, r * 0.14), (r * 0.25, r * 0.03),
                   (0, r * 0.03)], cor=cone, seg=seg, angulo=50)
    T(cn, rot=("X", 90))
    T(cn, loc=(x, y + 0.001, z))
    ps.append(cn)
    ps.append(Esf(r * 0.26, x=x, y=y - r * 0.03, z=z, cor=centro, esc=(1, 0.55, 1), seg=10))
    return ps


def botao_y(r, x, y, z, cor, h=0.012, seg=12):
    """Botão redondo saindo de um painel com frente em y."""
    return Cil(r, h, x=x, y=y - h / 2 + 0.002, z=z, cor=cor, eixo="y", seg=seg, bisel=min(r * 0.3, h * 0.3))


def teclas(x0, x1, y_frente, z, prof, alt, n_brancas, nota0=0):
    """Teclado de piano: brancas lado a lado de x0 a x1, frente em y_frente, base em z; pretas no padrão."""
    out = []
    wk = (x1 - x0) / n_brancas
    notas = "CDEFGAB"
    for i in range(n_brancas):
        out.append(C(wk - 0.0016, prof, alt, x=x0 + wk * (i + 0.5), y=y_frente + prof / 2, z=z, cor="branco",
                     bisel=min(0.0022, wk * 0.2), seg=1))
        if notas[(i + nota0) % 7] in "CDFGA" and i < n_brancas - 1:
            out.append(C(wk * 0.56, prof * 0.6, alt * 0.75, x=x0 + wk * (i + 1), y=y_frente + prof * 0.7,
                         z=z + alt * 0.7, cor="preto", bisel=0.0018, seg=1))
    return out


def OBJETOS_ITENS():
    E = estampas()
    R = []

    def reg(id_, rotulo, grupo, fn, tags=(), fix="chao", alt=None, pac=False):
        R.append((id_, rotulo, grupo, fn, tags, pac, fix, alt))

    # ------------------------------------------------------------------ piano de armário
    def piano(id_, cor, cor2):
        def f():
            it = mb.Item(id_)
            W = 1.40
            it.add(C(W, 0.36, 0.08, y=0.12, cor=cor, bisel=0.012))
            it.add(C(W, 0.34, 1.10, y=0.13, z=0.07, cor=cor, bisel=0.015))
            it.add(C(W + 0.07, 0.41, 0.045, y=0.115, z=1.17, cor=cor, bisel=0.016))
            it.add(C(W + 0.02, 0.37, 0.03, y=0.125, z=1.145, cor=cor2, bisel=0.01))
            fr = mb.frente(1.22, 0.30, esp=0.02, estilo="moldura", cor=cor, cor2=cor2, margem=0.035)
            T(fr, loc=(0, -0.04, 0.83))
            it.add(fr)
            it.add(C(0.34, 0.03, 0.028, y=-0.075, z=0.99, cor=cor2, bisel=0.012))
            fr2 = mb.frente(1.2, 0.44, esp=0.02, estilo="moldura", cor=cor, cor2=cor2, margem=0.045)
            T(fr2, loc=(0, -0.04, 0.12))
            it.add(fr2)
            it.add(C(1.34, 0.30, 0.10, y=-0.17, z=0.62, cor=cor, bisel=0.012))
            it.add(C(1.30, 0.115, 0.05, y=-0.0975, z=0.715, cor=cor2, bisel=0.008))
            it.add(teclas(-0.64, 0.64, -0.30, 0.72, 0.15, 0.024, 52, nota0=5))
            for sx in (-1, 1):
                it.add(C(0.07, 0.34, 0.24, x=sx * 0.70, y=-0.16, z=0.6, cor=cor, bisel=0.028))
                it.add(mb.torno([(0, 0)] + suave([(0.03, 0), (0.038, 0.03), (0.026, 0.1), (0.028, 0.3), (0.04, 0.42),
                                                  (0.045, 0.5)], 2) + [(0, 0.5)], x=sx * 0.70, y=-0.27, z=0.08, cor=cor,
                                seg=16, angulo=60))
                it.add(C(0.08, 0.36, 0.085, x=sx * 0.70, y=-0.15, z=0.0, cor=cor, bisel=0.025))
            for k in (-1, 0, 1):
                it.add(C(0.032, 0.075, 0.018, x=k * 0.055, y=-0.075, z=0.05, cor="ouro", bisel=0.006))
            # tampa do teclado (abre para cima, eixo x)
            tampa = [C(1.30, 0.265, 0.02, y=-0.1925, z=0.775, cor=cor, bisel=0.008),
                     C(1.30, 0.02, 0.072, y=-0.315, z=0.723, cor=cor, bisel=0.008),
                     C(0.12, 0.004, 0.012, y=-0.326, z=0.765, cor="ouro", bisel=0.0018, seg=1)]
            it.porta(tampa, dobradica=(0, -0.06, 0.795), eixo="x", lado="cima", angulo=-82, nome="tampa_teclado")
            it.colisao([((0, 0.12, 0), (1.47, 0.41, 1.215)), ((0, -0.165, 0), (1.47, 0.34, 0.84))])
            assenta(it)
            return it, None, (0.5, -1.0, 0.45)
        return f
    reg("piano_armario_chocolate", "Piano de armário (chocolate)", "piano_armario", piano("piano_armario_chocolate", "chocolate", "marrom_escuro"), ["musica", "sala"])
    reg("piano_armario_branco", "Piano de armário (branco)", "piano_armario", piano("piano_armario_branco", "branco", "branco_gelo"), ["musica", "sala"])

    # ------------------------------------------------------------------ espelhos
    def espelho_chao(id_, cor):
        def f():
            it = mb.Item(id_)
            W, H = 0.62, 1.62
            ps = [mb.extrudado(mb.ret_arredondado(W, H, 0.06), 0.032, z=H / 2, plano="xz", cor=cor, bisel=0.012),
                  aro_tubo(W - 0.05, H - 0.05, 0.022, y=-0.004, z=H / 2, raio=0.045, cor=cor),
                  mb.extrudado(mb.ret_arredondado(W - 0.085, H - 0.085, 0.03), 0.006, y=-0.006, z=H / 2, plano="xz",
                               cor=None, mat="espelho", bisel=0.002)]
            gira(ps, "X", -9)
            it.add(ps)
            q = Matrix.Rotation(math.radians(-9), 4, "X") @ V((0, 0.032, 0.95))
            it.add(mb.tubo([(0, q.y - 0.01, q.z), (0, 0.48, 0.016)], 0.014, cor=cor, raio_curva=0.001))
            it.add(C(0.05, 0.04, 0.05, y=q.y + 0.005, z=q.z - 0.03, cor=cor, bisel=0.012))
            it.add(Esf(0.02, y=0.48, z=0.016, cor="borracha", seg=12, esc=(1, 1, 0.8)))
            assenta(it)
            it.colisao([((0, 0, 0), (0.64, 0.5, 1.6))])
            return it
        return f
    reg("espelho_chao_madeira", "Espelho de chão (madeira)", "espelho_chao", espelho_chao("espelho_chao_madeira", "madeira_media"), ["quarto"])
    reg("espelho_chao_branco", "Espelho de chão (branco)", "espelho_chao", espelho_chao("espelho_chao_branco", "branco"), ["quarto"])

    def recorte(W, H, rc, n=6):
        pts = []
        for cx, cz, a0 in ((W / 2, -H / 2, 180), (W / 2, H / 2, 270), (-W / 2, H / 2, 360), (-W / 2, -H / 2, 90)):
            for k in range(n + 1):
                a = math.radians(a0 - 90 * k / n)
                pts.append((cx + rc * math.cos(a), cz + rc * math.sin(a)))
        return pts

    def espelho_recortado():
        it = mb.Item("espelho_parede_recortado")
        W, H, rc, zc = 0.52, 0.74, 0.085, 0.37
        it.add(mb.extrudado(mb._ccw(recorte(W, H, rc)), 0.026, y=-0.026, z=zc, plano="xz", cor="madeira_media", bisel=0.008))
        it.add(aro_pontos([(x, z + zc) for x, z in recorte(W - 0.036, H - 0.036, rc + 0.018, 5)], 0.015, y=-0.03,
                          cor="madeira_media"))
        it.add(mb.extrudado(mb._ccw(recorte(W - 0.07, H - 0.07, rc + 0.035)), 0.004, y=-0.031, z=zc, plano="xz", cor=None,
                            mat="espelho", bisel=0.0015))
        assenta(it, "parede")
        return it
    reg("espelho_parede_recortado", "Espelho de parede recortado", "espelho_recortado", espelho_recortado, ["banheiro", "quarto"], fix="parede", alt=1.15)

    def espelho_oval():
        it = mb.Item("espelho_parede_oval")
        zc = 0.31
        it.add(mb.extrudado(mb.circulo(1, 40, 0.225, 0.305), 0.026, y=-0.026, z=zc, plano="xz", cor="madeira_media", bisel=0.008))
        it.add(aro_pontos([(x, z + zc) for x, z in mb.circulo(1, 40, 0.205, 0.285)], 0.02, y=-0.03, cor="madeira_media"))
        it.add(aro_pontos([(x, z + zc) for x, z in mb.circulo(1, 40, 0.172, 0.252)], 0.012, y=-0.032, cor="ouro"))
        it.add(mb.extrudado(mb.circulo(1, 40, 0.165, 0.245), 0.004, y=-0.031, z=zc, plano="xz", cor=None, mat="espelho",
                            bisel=0.0015))
        assenta(it, "parede")
        return it
    reg("espelho_parede_oval", "Espelho oval", "espelho_oval", espelho_oval, ["banheiro", "quarto"], fix="parede", alt=1.2)

    def espelho_camarim():
        it = mb.Item("espelho_camarim")
        W, H, zb = 0.6, 0.76, 0.035
        it.add(C(0.46, 0.17, 0.04, cor="petroleo", bisel=0.015))
        it.add(mb.extrudado(mb.ret_arredondado(W, H, 0.05), 0.045, y=-0.0225, z=zb + H / 2, plano="xz", cor="turquesa_escuro",
                            bisel=0.014))
        it.add(mb.extrudado(mb.ret_arredondado(W - 0.15, H - 0.15, 0.025), 0.004, y=-0.0255, z=zb + H / 2, plano="xz",
                            cor=None, mat="espelho", bisel=0.0015))
        pos = [(-0.2 + 0.4 * k / 3, H - 0.04) for k in range(4)] + [(-0.2 + 0.4 * k / 3, 0.04) for k in range(4)]
        pos += [(s * (W / 2 - 0.038), 0.04 + (H - 0.08) * k / 4) for s in (-1, 1) for k in (1, 2, 3)]
        for x, z in pos:
            it.add(Cil(0.016, 0.012, x=x, y=-0.026, z=zb + z, cor="creme", eixo="y", seg=12, bisel=0.003))
            it.add(Esf(0.021, x=x, y=-0.04, z=zb + z, cor=None, mat="luz", seg=14))
        d = assenta(it, "apoio")
        return it, luz_extra(V((0, -0.15, zb + H / 2)) + d, 2.0)
    reg("espelho_camarim", "Espelho de camarim com lâmpadas", "espelho_camarim", espelho_camarim, ["quarto", "penteadeira"], fix="apoio")

    # ------------------------------------------------------------------ relógios
    def relogio_pe_verde():
        it = mb.Item("relogio_pe_verde")
        cor, cor2 = "verde", "verde_claro"
        W, D = 0.46, 0.27
        it.add(mb.quatro_pes("bola", W - 0.02, D - 0.02, 0.045, cor2, r=0.028, recuo=0.035))
        it.add(mb.carcaca(W, D, 0.26, z=0.04, cor=cor))
        fr = mb.frente(W - 0.05, 0.2, esp=0.02, estilo="lisa", cor="amarelo", bisel=0.008)
        T(fr, loc=(0, -D / 2, 0.068))
        pux = mb.puxador("bola", x=0, y=-D / 2 - 0.02, z=0.168, cor="verde_escuro", tam=0.9)
        it.gaveta(W - 0.07, D - 0.06, 0.15, [fr, pux], y_frente=-D / 2, z=0.072, cor="creme")
        it.add(C(W + 0.03, D + 0.02, 0.035, z=0.30, cor=cor2, bisel=0.012))
        it.add(mb.carcaca(0.40, 0.25, 0.84, z=0.335, cor=cor))
        it.add(C(0.356, 0.004, 0.796, y=0.1035, z=0.357, cor="verde_escuro", bisel=0.0015, seg=1))
        it.add(Cil(0.005, 0.56, y=0.03, z=0.6, cor="ouro", seg=10, bisel=0.0))
        it.add(Cil(0.068, 0.02, y=0.03, z=0.585, cor="amarelo", eixo="y", seg=28, bisel=0.006))
        it.add(Cil(0.04, 0.026, y=0.03, z=0.585, cor="amarelo_escuro", eixo="y", seg=20, bisel=0.006))
        for sx in (-1, 1):
            it.add(Cil(0.02, 0.84, x=sx * 0.207, y=-0.118, z=0.335, cor=cor2, seg=14, bisel=0.006))
        porta = mb.frente(0.36, 0.80, esp=0.02, estilo="vidro", cor=cor2, margem=0.035)
        T(porta, loc=(0, -0.125, 0.355))
        kn = mb.puxador("bola", x=0.15, y=-0.145, z=0.75, cor="amarelo", tam=0.8)
        it.porta([porta, kn], dobradica=(-0.18, -0.135, 0), lado="esq")
        it.add(C(W, D, 0.42, z=1.175, cor=cor, bisel=0.02))
        it.add(mostrador(0.12, 0, -D / 2 - 0.002, 1.385, face="branco_gelo", aro="amarelo", aro_r=0.128))
        it.add(C(W + 0.05, D + 0.04, 0.04, z=1.595, cor=cor2, bisel=0.014))
        it.add(C(W - 0.02, D - 0.02, 0.03, z=1.635, cor=cor, bisel=0.012))
        it.slot("relogio_dentro", (0, 0.0, 0.357), (0.356, 0.2, 0.2))
        assenta(it)
        return it
    reg("relogio_pe_verde", "Relógio de pé verde", "relogio_pe_verde", relogio_pe_verde, ["sala", "classico"])

    def relogio_pe_madeira():
        it = mb.Item("relogio_pe_madeira")
        cor, cor2 = "madeira_escura", "nogueira"
        W, D, H = 0.5, 0.27, 1.6
        it.add(C(W + 0.04, D + 0.03, 0.06, cor=cor2, bisel=0.016))
        it.add(mb.carcaca(W, D, H, z=0.06, cor=cor, prateleiras=[0.48, 1.08]))
        for sx in (-1, 1):
            it.add(C(0.03, 0.03, H - 0.06, x=sx * (W / 2 - 0.012), y=-D / 2 - 0.006, z=0.09, cor=cor2, bisel=0.01))
        it.add(Cil(0.035, 0.1, y=0.06, z=1.4, cor=cor2, eixo="y", seg=14))
        it.add(mostrador(0.15, 0, -0.01, 1.4, face="branco_gelo", aro="amarelo", aro_r=0.157))
        it.add(Cil(0.005, 0.38, y=0.04, z=0.74, cor="ouro", seg=10, bisel=0.0))
        it.add(Cil(0.075, 0.022, y=0.04, z=0.72, cor="amarelo", eixo="y", seg=28, bisel=0.007))
        it.add(Cil(0.042, 0.028, y=0.04, z=0.72, cor="amarelo_escuro", eixo="y", seg=20, bisel=0.006))
        hp = 1.08 + 0.022 - 0.004
        porta = mb.frente(W - 0.07, hp, esp=0.02, estilo="vidro", cor=cor2, margem=0.04)
        T(porta, loc=(0, -D / 2, 0.062))
        kn = mb.puxador("bola", x=-(W - 0.07) / 2 + 0.035, y=-D / 2 - 0.02, z=0.75, cor="amarelo", tam=0.85)
        it.porta([porta, kn], dobradica=((W - 0.07) / 2, -D / 2 - 0.01, 0), lado="dir")
        it.add(C(W + 0.06, D + 0.045, 0.05, z=0.06 + H, cor=cor2, bisel=0.016))
        it.add(C(W - 0.02, D - 0.01, 0.035, z=0.11 + H, cor=cor, bisel=0.012))
        it.slot("prateleira_baixo", (0, 0.0, 0.082), (W - 0.044, D - 0.06, 0.44))
        assenta(it)
        return it
    reg("relogio_pe_madeira", "Relógio de pé de madeira", "relogio_pe_madeira", relogio_pe_madeira, ["sala", "classico"])

    def relogio_pendulo_parede():
        it = mb.Item("relogio_parede_pendulo")
        D, yb = 0.08, -0.07
        it.add(Cil(0.12, D, y=-D / 2, z=0.5, cor="marrom", eixo="y", seg=32, bisel=0.014))
        it.add(mostrador(0.093, 0, -D - 0.001, 0.5, face="creme_claro", marcas="marrom_escuro", ponteiro="marrom_escuro"))
        it.add(C(0.14, 0.07, 0.32, y=-0.035, z=0.12, cor="marrom", bisel=0.012))
        it.add(C(0.094, 0.004, 0.22, y=yb - 0.002, z=0.15, cor="marrom_escuro", bisel=0.0015, seg=1))
        it.add(Cil(0.0035, 0.2, y=yb - 0.009, z=0.2, cor="ouro", seg=8, bisel=0.0))
        it.add(Cil(0.034, 0.008, y=yb - 0.009, z=0.19, cor="amarelo", eixo="y", seg=24, bisel=0.0025))
        it.add(mb.extrudado(mb.ret_arredondado(0.1, 0.23, 0.01), 0.003, y=yb - 0.016, z=0.26, plano="xz", cor=None,
                            mat="vidro", bisel=0.001))
        for (w, h, x, z) in ((0.12, 0.016, 0, 0.142), (0.12, 0.016, 0, 0.378), (0.016, 0.25, -0.052, 0.135),
                             (0.016, 0.25, 0.052, 0.135)):
            it.add(C(w, 0.016, h, x=x, y=yb - 0.004, z=z, cor="marrom_claro", bisel=0.005))
        it.add(C(0.18, 0.085, 0.05, y=-0.0425, z=0.08, cor="marrom_escuro", bisel=0.014))
        it.add(C(0.11, 0.07, 0.06, y=-0.035, z=0.025, cor="marrom", bisel=0.016))
        it.add(Esf(0.018, y=-0.04, z=0.02, cor="marrom_escuro", seg=12))
        assenta(it, "parede")
        return it
    reg("relogio_parede_pendulo", "Relógio de parede com pêndulo", "relogio_parede_pendulo", relogio_pendulo_parede, ["sala"], fix="parede", alt=1.45)

    def relogio_redondo(id_, aro, marcas, ponteiro):
        def f():
            it = mb.Item(id_)
            R = 0.15
            it.add(Cil(R, 0.04, y=-0.02, z=R, cor=aro, eixo="y", seg=36, bisel=0.012))
            it.add(toro(R - 0.012, 0.018, y=-0.04, z=R, cor=aro, eixo="y", seg=32, segt=6))
            it.add(mostrador(R - 0.03, 0, -0.041, R, face="branco", marcas=marcas, ponteiro=ponteiro, h=(4, 7)))
            assenta(it, "parede")
            return it
        return f
    reg("relogio_parede_redondo_vermelho", "Relógio de parede redondo (vermelho)", "relogio_parede_redondo",
        relogio_redondo("relogio_parede_redondo_vermelho", "vermelho", "amarelo_escuro", "azul"), ["cozinha", "sala"], fix="parede", alt=1.8)
    reg("relogio_parede_redondo_azul", "Relógio de parede redondo (azul)", "relogio_parede_redondo",
        relogio_redondo("relogio_parede_redondo_azul", "azul_celeste", "verde", "verde_medio"), ["cozinha", "sala"], fix="parede", alt=1.8)

    # ------------------------------------------------------------------ ar-condicionado
    def ar_condicionado():
        it = mb.Item("ar_condicionado")
        L, P, A = 0.86, 0.22, 0.29
        it.add(C(L, P, A, y=-P / 2, cor="branco", bisel=0.055, seg=4))
        it.add(C(L - 0.02, 0.012, 0.012, y=-P + 0.002, z=A * 0.62, cor="branco_gelo", bisel=0.004, seg=1))
        it.add(C(L - 0.12, 0.05, 0.03, y=-P + 0.035, z=0.025, cor="cinza", bisel=0.008))
        it.add(C(L - 0.1, 0.03, 0.035, y=-P - 0.002, z=0.012, cor="branco_gelo", bisel=0.012))
        it.add(C(0.1, 0.006, 0.045, x=0.26, y=-P - 0.001, z=0.13, cor="tela_azul", bisel=0.0022, seg=1))
        for k in range(3):
            it.add(C(0.014, 0.004, 0.022, x=0.235 + k * 0.022, y=-P - 0.004, z=0.142, cor="azul_celeste", bisel=0.001, seg=1))
        for k in range(2):
            it.add(botao_y(0.011, -0.33 + k * 0.032, -P + 0.001, 0.16, "azul_celeste", h=0.006, seg=12))
        assenta(it, "parede")
        return it
    reg("ar_condicionado", "Ar-condicionado de parede", "ar_condicionado", ar_condicionado, ["eletro", "quarto"], fix="parede", alt=2.05)

    # ------------------------------------------------------------------ tábua de passar com ferro
    def forma_tabua(L=1.12, w=0.35):
        xb = -L / 2 + w / 2
        top = []
        n = 16
        for k in range(n + 1):
            u = k / n
            x = xb + (L / 2 - 0.03 - xb) * u
            hw = w / 2 if u < 0.38 else w / 2 * (1 - ((u - 0.38) / 0.62) ** 1.8 * 0.83)
            top.append((x, hw))
        r_tip = top[-1][1]
        tip = [(top[-1][0] + r_tip * math.cos(a), r_tip * math.sin(a)) for a in
               [math.pi / 2 - math.pi * k / 6 for k in range(1, 6)]]
        bot = [(x, -y) for x, y in top[::-1]]
        back = [(xb + w / 2 * math.cos(a), w / 2 * math.sin(a)) for a in
                [3 * math.pi / 2 - math.pi * k / 10 for k in range(1, 10)]]
        return mb._ccw(top + tip + bot + back)

    def tabua():
        it = mb.Item("tabua_passar_ferro")
        zt = 0.83
        it.add(mb.extrudado(forma_tabua(), 0.012, z=zt, cor="cinza_claro", bisel=0.004))
        it.add(mb.extrudado(forma_tabua(1.115, 0.345), 0.026, z=zt + 0.008, cor="pessego", bisel=0.011))
        for y in (-0.1, 0.1):
            it.add(mb.tubo([(-0.33, y, 0.016), (0.27, y, zt - 0.005)], 0.013, cor="mostarda", raio_curva=0.001))
            it.add(mb.tubo([(0.33, y, 0.016), (-0.27, y, zt - 0.005)], 0.013, cor="mostarda", raio_curva=0.001))
        for x in (-0.33, 0.33):
            it.add(Cil(0.016, 0.27, x=x, z=0.016, cor="mostarda", eixo="y", seg=14, bisel=0.005))
            for y in (-0.135, 0.135):
                it.add(Esf(0.019, x=x, y=y, z=0.017, cor="laranja_escuro", seg=12))
        for x in (-0.27, 0.27):
            it.add(Cil(0.012, 0.24, x=x, z=zt - 0.012, cor="mostarda", eixo="y", seg=12, bisel=0.004))
        it.add(Cil(0.016, 0.24, x=0, z=0.432, cor="laranja_escuro", eixo="y", seg=14, bisel=0.005))
        # ferro
        zf = zt + 0.034
        sola = mb._ccw([(-0.11, -0.055), (0.035, -0.055), (0.125, 0.0), (0.035, 0.055), (-0.11, 0.055)])
        ferro = [mb.extrudado(sola, 0.016, z=zf, cor="branco", bisel=0.007),
                 mb.extrudado([(x * 0.86 - 0.01, y * 0.86) for x, y in sola], 0.045, z=zf + 0.013, cor="azul_celeste",
                              bisel=0.02),
                 mb.tubo([(-0.085, 0, zf + 0.05), (-0.085, 0, zf + 0.1), (0.035, 0, zf + 0.1), (0.07, 0, zf + 0.05)],
                         0.013, cor="azul", raio_curva=0.025),
                 Cil(0.016, 0.012, x=0.02, z=zf + 0.054, cor="vermelho", seg=14, bisel=0.004)]
        gira(ferro, "Z", 12)
        move(ferro, V((0.12, 0.0, 0)))
        it.add(ferro)
        it.colisao([((0, 0, zt - 0.02), (1.12, 0.36, 0.06)), ((0, 0, 0), (0.7, 0.3, zt - 0.02)),
                    ((0.12, 0, zt + 0.03), (0.26, 0.14, 0.12))])
        assenta(it)
        return it
    reg("tabua_passar_ferro", "Tábua de passar com ferro", "tabua_passar", tabua, ["lavanderia"])

    # ------------------------------------------------------------------ supino com barra
    def supino():
        it = mb.Item("supino_barra")
        yb = 0.32
        for sx in (-1, 1):
            x = sx * 0.5
            it.add(C(0.055, 0.055, 1.18, x=x, y=yb, z=0.04, cor="cinza_claro", bisel=0.012))
            it.add(C(0.09, 0.56, 0.05, x=x, y=yb - 0.02, cor="grafite", bisel=0.016))
            for y in (yb - 0.29, yb + 0.25):
                it.add(C(0.1, 0.05, 0.03, x=x, y=y, cor="borracha", bisel=0.01))
            it.add(C(0.075, 0.06, 0.05, x=x, y=yb - 0.035, z=1.03, cor="grafite", bisel=0.012))
            it.add(C(0.075, 0.025, 0.06, x=x, y=yb - 0.07, z=1.05, cor="grafite", bisel=0.008))
            it.add(C(0.075, 0.075, 0.05, x=x, y=yb, z=0.6, cor="grafite", bisel=0.012))
        it.add(C(1.0, 0.045, 0.045, y=yb + 0.0, z=0.05, cor="cinza_claro", bisel=0.01))
        it.add(C(1.0, 0.045, 0.045, y=yb, z=0.55, cor="cinza_claro", bisel=0.01))
        # banco
        it.add(C(0.32, 1.05, 0.08, y=-0.25, z=0.42, cor="marrom_escuro", bisel=0.03))
        it.add(C(0.22, 0.95, 0.04, y=-0.25, z=0.385, cor="grafite", bisel=0.01))
        for y in (-0.62, 0.12):
            it.add(C(0.05, 0.05, 0.36, y=y, z=0.03, cor="cinza_claro", bisel=0.01))
            it.add(C(0.4, 0.06, 0.04, y=y, z=0.0, cor="grafite", bisel=0.012))
            for sx in (-1, 1):
                it.add(C(0.06, 0.07, 0.025, x=sx * 0.2, y=y, z=0.0, cor="borracha", bisel=0.008))
        # barra com anilhas
        zb = 1.115
        it.add(Cil(0.014, 1.5, y=yb - 0.06, z=zb, cor="metal_claro", eixo="x", seg=14, bisel=0.003))
        for sx in (-1, 1):
            it.add(Cil(0.024, 0.3, x=sx * 0.84, y=yb - 0.06, z=zb, cor="cromo", eixo="x", seg=16, bisel=0.006))
            for k, (r, e) in enumerate(((0.2, 0.04), (0.17, 0.035), (0.135, 0.03))):
                x = sx * (0.74 + 0.045 * k)
                it.add(Cil(r, e, x=x, y=yb - 0.06, z=zb, cor="grafite", eixo="x", seg=24, bisel=0.012))
            it.add(Cil(0.045, 0.14, x=sx * 0.78, y=yb - 0.06, z=zb, cor="laranja", eixo="x", seg=18, bisel=0.006))
            it.add(Cil(0.03, 0.03, x=sx * 0.67, y=yb - 0.06, z=zb, cor="grafite_escuro", eixo="x", seg=16, bisel=0.006))
        it.colisao([((0, yb - 0.02, 0), (1.95, 0.56, 1.33)), ((0, -0.25, 0), (0.4, 1.05, 0.5))])
        assenta(it)
        return it
    reg("supino_barra", "Supino com barra", "supino", supino, ["academia", "exercicio"])

    # ------------------------------------------------------------------ esteira
    def esteira():
        it = mb.Item("esteira")
        it.add(C(0.74, 1.55, 0.14, y=-0.05, z=0.03, cor="grafite", bisel=0.035))
        it.add(C(0.54, 1.47, 0.02, y=-0.07, z=0.165, cor="preto", bisel=0.008))
        for sx in (-1, 1):
            it.add(C(0.09, 1.5, 0.03, x=sx * 0.315, y=-0.06, z=0.16, cor="grafite", bisel=0.012))
            it.add(C(0.026, 1.46, 0.008, x=sx * 0.292, y=-0.06, z=0.187, cor="laranja", bisel=0.003, seg=1))
        it.add(C(0.76, 0.24, 0.17, y=0.74, z=0.03, cor="grafite_escuro", bisel=0.05))
        for x in (-0.3, 0.3):
            for y in (-0.76, 0.76):
                it.add(C(0.08, 0.06, 0.035, x=x, y=y, cor="borracha", bisel=0.012))
        for sx in (-1, 1):
            it.add(mb.tubo([(sx * 0.34, 0.76, 0.16), (sx * 0.34, 0.7, 1.12)], 0.028, cor="grafite", raio_curva=0.001))
            it.add(mb.tubo([(sx * 0.34, 0.71, 0.98), (sx * 0.34, 0.36, 0.98), (sx * 0.34, 0.33, 0.95)], 0.02,
                           cor="grafite_escuro", raio_curva=0.03))
        cons = [C(0.8, 0.13, 0.32, cor="grafite", bisel=0.04),
                C(0.3, 0.012, 0.17, y=-0.065, z=0.11, cor="menta", bisel=0.006),
                C(0.22, 0.01, 0.04, y=-0.064, z=0.035, cor="laranja", bisel=0.004, seg=1)]
        for sx in (-1, 1):
            for k in range(2):
                for j in range(2):
                    cons.append(C(0.03, 0.012, 0.025, x=sx * (0.24 + 0.045 * k), y=-0.066, z=0.2 - 0.05 * j,
                                  cor="vermelho" if (k == 1 and j == 0 and sx > 0) else "cinza", bisel=0.004, seg=1))
        for k in range(4):
            cons.append(C(0.022, 0.006, 0.02, x=-0.06 + 0.04 * k, y=-0.07, z=0.045, cor="amarelo", bisel=0.002, seg=1))
        gira(cons, "X", -18)
        move(cons, V((0, 0.72, 1.1)))
        it.add(cons)
        it.colisao([((0, -0.0, 0), (0.78, 1.66, 0.22)), ((0, 0.7, 0.22), (0.8, 0.2, 1.22))])
        assenta(it)
        return it
    reg("esteira", "Esteira", "esteira", esteira, ["academia", "exercicio"])

    # ------------------------------------------------------------------ TVs
    def tv_plana(id_, L):
        def f():
            it = mb.Item(id_)
            H, D, zb = L * 0.57, 0.05, 0.075
            it.add(C(L, D, H, z=zb, cor="cinza_azulado", bisel=0.018))
            it.add(placa(L - 0.05, H - 0.05, y=-D / 2 - 0.003, z=zb + 0.025, esp=0.006, mat=E["tela"]))
            it.add(C(L * 0.5, 0.05, H * 0.5, y=D / 2 + 0.012, z=zb + H * 0.22, cor="grafite", bisel=0.018))
            it.add(Cil(0.007, 0.004, x=L / 2 - 0.05, y=-D / 2 - 0.0015, z=zb + 0.0125, cor="vermelho", eixo="y", seg=10,
                       bisel=0.0))
            for sx in (-1, 1):
                pe_ = mb.extrudado(mb._ccw([(-0.11, 0.0), (0.11, 0.0), (0.025, 0.1), (-0.025, 0.1)]), 0.03,
                                   x=sx * (L / 2 - 0.16) - 0.015, plano="yz", cor="grafite", bisel=0.008)
                it.add(pe_)
            assenta(it)
            return it, None, (0.45, -1.0, 0.35)
        return f
    reg("tv_tela_plana_100", "TV de tela plana (1 m)", "tv_tela_plana", tv_plana("tv_tela_plana_100", 1.0), ["eletronico", "sala"], fix="apoio")
    reg("tv_tela_plana_120", "TV de tela plana grande (1,2 m)", "tv_tela_plana", tv_plana("tv_tela_plana_120", 1.2), ["eletronico", "sala"], fix="apoio")

    def tv_cavalete():
        it = mb.Item("tv_cavalete")
        L = 0.95
        H, D, zb = L * 0.57, 0.05, 0.56
        it.add(C(L, D, H, z=zb, cor="cinza_azulado", bisel=0.018))
        it.add(placa(L - 0.05, H - 0.05, y=-D / 2 - 0.003, z=zb + 0.025, esp=0.006, mat=E["tela"]))
        it.add(C(L * 0.45, 0.04, H * 0.45, y=D / 2 + 0.01, z=zb + H * 0.25, cor="grafite", bisel=0.015))
        for sx in (-1, 1):
            topo = (sx * 0.40, 0.0, zb + 0.24)
            it.add(mb.tubo([topo, (sx * 0.46, -0.2, 0.012)], 0.016, cor="laranja_claro", raio_curva=0.001))
            it.add(mb.tubo([topo, (sx * 0.46, 0.22, 0.012)], 0.016, cor="laranja_claro", raio_curva=0.001))
            it.add(Esf(0.026, x=topo[0], z=topo[2], cor="laranja", seg=14))
            for y in (-0.2, 0.22):
                it.add(Esf(0.02, x=sx * 0.46, y=y, z=0.014, cor="madeira_mel", seg=12, esc=(1, 1, 0.8)))
        it.add(Cil(0.018, 0.86, y=-0.03, z=zb - 0.012, cor="laranja_claro", eixo="x", seg=14, bisel=0.005))
        assenta(it)
        return it, None, (0.45, -1.0, 0.35)
    reg("tv_cavalete", "TV no cavalete", "tv_cavalete", tv_cavalete, ["eletronico", "sala"])

    def tv_parede():
        it = mb.Item("tv_parede")
        L, H, D = 1.1, 0.63, 0.04
        it.add(C(L, D, H, y=-D / 2, cor="grafite", bisel=0.014))
        it.add(placa(L - 0.04, H - 0.04, y=-D - 0.0015, z=0.02, esp=0.004, mat=E["tela"]))
        it.add(Cil(0.006, 0.004, x=0, y=-D - 0.001, z=0.009, cor="azul_celeste", eixo="y", seg=10, bisel=0.0))
        assenta(it, "parede")
        return it, None, (0.45, -1.0, 0.3)
    reg("tv_parede", "TV de parede", "tv_parede", tv_parede, ["eletronico", "sala"], fix="parede", alt=1.1)

    def tv_retro(id_, corpo, moldura, aro, botoes, pernas):
        def f():
            it = mb.Item(id_)
            W, D, H, zb = 0.56, 0.42, 0.44, 0.075
            zc = zb + H / 2
            it.add(mb.superelipsoide(W, D, H, z=zb, cor=corpo, e=0.28, e_v=0.28, nu=28, nv=14))
            it.add(mb.extrudado(mb.ret_arredondado(W - 0.035, H - 0.035, 0.075), 0.03, y=-D / 2 - 0.012, z=zc, plano="xz",
                                cor=moldura, bisel=0.012))
            xs = -0.055
            it.add(placa(0.35, 0.29, x=xs, y=-D / 2 - 0.014, z=zc - 0.145, esp=0.01, mat=E["tela_retro"], r=0.05))
            it.add(aro_tubo(0.36, 0.30, 0.012, x=xs, y=-D / 2 - 0.016, z=zc, raio=0.055, cor=aro))
            xb = 0.195
            it.add(botao_y(0.026, xb, -D / 2 - 0.012, zc + 0.085, botoes, h=0.022, seg=18))
            it.add(botao_y(0.026, xb, -D / 2 - 0.012, zc + 0.012, botoes, h=0.022, seg=18))
            for i in range(2):
                for j in range(2):
                    it.add(C(0.018, 0.012, 0.018, x=xb - 0.013 + 0.026 * i, y=-D / 2 - 0.016, z=zc - 0.085 + 0.026 * j,
                             cor=botoes, bisel=0.004, seg=1))
            it.add(mb.quatro_pes("palito", W - 0.2, D - 0.16, 0.085, pernas, r=0.02, recuo=0.0, abre=12))
            assenta(it)
            return it
        return f
    reg("tv_tubo_pes_marrom", "TV de tubo com pés (marrom e verde)", "tv_tubo_pes",
        tv_retro("tv_tubo_pes_marrom", "marrom_claro", "verde", "verde_claro", "amarelo", "laranja"), ["eletronico", "sala", "retro"], fix="apoio")
    reg("tv_tubo_pes_rosa", "TV de tubo com pés (rosa e turquesa)", "tv_tubo_pes",
        tv_retro("tv_tubo_pes_rosa", "rosa", "turquesa", "turquesa_claro", "amarelo_claro", "madeira_mel"), ["eletronico", "sala", "retro"], fix="apoio")

    def tv_tubo_cinza():
        it = mb.Item("tv_tubo_cinza")
        W, D, H, zb = 0.52, 0.44, 0.42, 0.06
        zc = zb + H / 2
        it.add(mb.superelipsoide(W, D, H, z=zb, cor="cinza_azulado", e=0.3, e_v=0.3, nu=28, nv=14))
        it.add(mb.extrudado(mb.ret_arredondado(W - 0.02, H - 0.02, 0.08), 0.034, y=-D / 2 - 0.014, z=zc, plano="xz",
                            cor="laranja", bisel=0.014))
        it.add(placa(0.39, 0.31, x=-0.02, y=-D / 2 - 0.016, z=zc - 0.155, esp=0.01, mat=E["tela"], r=0.06))
        it.add(aro_tubo(0.4, 0.32, 0.01, x=-0.02, y=-D / 2 - 0.017, z=zc, raio=0.065, cor="laranja_escuro"))
        for k, c in enumerate(("vermelho", "verde_claro", "azul_celeste", "amarelo")):
            it.add(botao_y(0.011, 0.215, -D / 2 - 0.014, zc + 0.06 - k * 0.035, c, h=0.012, seg=12))
        it.add(C(0.3, 0.26, 0.04, cor="cinza_azulado", bisel=0.014))
        it.add(Cil(0.06, 0.04, z=0.035, cor="grafite", seg=20, bisel=0.008))
        assenta(it)
        return it
    reg("tv_tubo_cinza", "TV de tubo cinza e laranja", "tv_tubo_cinza", tv_tubo_cinza, ["eletronico", "sala", "retro"], fix="apoio")

    def tv_tubo_agua():
        it = mb.Item("tv_tubo_agua")
        W, D, H, zb = 0.56, 0.34, 0.42, 0.03
        zc = zb + H / 2
        it.add(mb.superelipsoide(W * 0.86, 0.3, H * 0.84, y=0.12, z=zb + H * 0.08, cor="verde_claro", e=0.35, e_v=0.35, nu=24, nv=12))
        it.add(mb.superelipsoide(W, D, H, z=zb, cor="azul_claro", e=0.25, e_v=0.25, nu=28, nv=14))
        it.add(mb.extrudado(mb.ret_arredondado(W - 0.03, H - 0.03, 0.08), 0.03, y=-D / 2 - 0.012, z=zc, plano="xz",
                            cor="verde_lima", bisel=0.013))
        it.add(placa(0.34, 0.28, x=-0.06, y=-D / 2 - 0.014, z=zc - 0.14, esp=0.01, mat=E["tela_retro"], r=0.06))
        it.add(aro_tubo(0.35, 0.29, 0.011, x=-0.06, y=-D / 2 - 0.015, z=zc, raio=0.065, cor="verde_lima"))
        it.add(botao_y(0.03, 0.195, -D / 2 - 0.012, zc + 0.07, "azul", h=0.024, seg=18))
        for k in range(2):
            it.add(botao_y(0.016, 0.195, -D / 2 - 0.012, zc - 0.02 - k * 0.045, "rosa", h=0.016, seg=14))
        it.add(mb.quatro_pes("bola", W - 0.12, D - 0.1, 0.035, "cinza_claro", r=0.022, recuo=0.0))
        assenta(it)
        return it
    reg("tv_tubo_agua", "TV de tubo azul e verde", "tv_tubo_agua", tv_tubo_agua, ["eletronico", "quarto", "retro"], fix="apoio")

    def tv_pequena():
        it = mb.Item("tv_pequena")
        W, D, H, zb = 0.34, 0.26, 0.27, 0.025
        zc = zb + H / 2
        it.add(mb.superelipsoide(W, D, H, z=zb, cor="terracota_clara", e=0.4, e_v=0.4, nu=24, nv=12))
        it.add(placa(0.22, 0.17, x=-0.02, y=-D / 2 - 0.004, z=zc - 0.085, esp=0.02, mat=E["tela_retro"], r=0.04))
        it.add(aro_tubo(0.235, 0.185, 0.022, x=-0.02, y=-D / 2 - 0.004, z=zc, raio=0.05, cor="amarelo"))
        it.add(Cil(0.03, 0.02, x=W / 2 - 0.004, z=zc + 0.01, cor="amarelo", eixo="x", seg=18, bisel=0.006))
        it.add(Cil(0.012, 0.02, x=W / 2 + 0.012, z=zc + 0.01, cor="amarelo_escuro", eixo="x", seg=12, bisel=0.004))
        for sx in (-1, 1):
            it.add(C(0.05, 0.08, 0.03, x=sx * 0.1, y=0.0, z=0.0, cor="amarelo_escuro", bisel=0.012))
        assenta(it)
        return it
    reg("tv_pequena", "TV pequena retrô", "tv_pequena", tv_pequena, ["eletronico", "quarto", "retro"], fix="apoio")

    # ------------------------------------------------------------------ som
    def caixa_som(id_, corpo, painel, aro):
        def f():
            it = mb.Item(id_)
            W, D, H = 0.32, 0.3, 0.6
            it.add(C(W, D, H, z=0.025, cor=corpo, bisel=0.04, seg=3))
            yp = -D / 2 - 0.012
            it.add(mb.extrudado(mb.ret_arredondado(W - 0.05, H - 0.06, 0.025), 0.02, y=yp, z=0.025 + H / 2, plano="xz",
                                cor=painel, bisel=0.008))
            for z in (0.025 + H * 0.7, 0.025 + H * 0.3):
                it.add(alto_falante(0.095, 0, yp, z, aro=aro, cone="grafite", centro="cinza_azulado"))
            for sx in (-1, 1):
                for z in (0.06, 0.025 + H - 0.04):
                    it.add(botao_y(0.008, sx * (W / 2 - 0.045), yp, z, "grafite", h=0.006, seg=10))
            it.add(mb.quatro_pes("bloco", W - 0.06, D - 0.06, 0.03, "grafite", r=0.02, recuo=0.0))
            assenta(it)
            return it
        return f
    reg("caixa_som_torre_vermelha", "Caixa de som torre (vermelha)", "caixa_som_torre",
        caixa_som("caixa_som_torre_vermelha", "vermelho_claro", "amarelo", "cinza_azulado"), ["eletronico", "musica"])
    reg("caixa_som_torre_azul", "Caixa de som torre (azul)", "caixa_som_torre",
        caixa_som("caixa_som_torre_azul", "azul", "azul_celeste", "grafite"), ["eletronico", "musica"])

    def micro_system():
        it = mb.Item("som_micro_system")
        for sx in (-1, 1):
            x = sx * 0.26
            it.add(C(0.21, 0.24, 0.38, x=x, cor="grafite", bisel=0.03))
            it.add(alto_falante(0.075, x, -0.121, 0.12, aro="turquesa_claro", cone="grafite_escuro", centro="grafite"))
            it.add(alto_falante(0.05, x, -0.121, 0.285, aro="cinza_azulado", cone="grafite_escuro", centro="grafite"))
        it.add(C(0.24, 0.24, 0.28, cor="cinza_azulado", bisel=0.025))
        it.add(C(0.14, 0.008, 0.045, y=-0.122, z=0.21, cor="menta", bisel=0.003, seg=1))
        it.add(C(0.16, 0.006, 0.008, y=-0.121, z=0.17, cor="grafite_escuro", bisel=0.002, seg=1))
        it.add(botao_y(0.034, 0, -0.12, 0.1, "grafite", h=0.018, seg=20))
        it.add(botao_y(0.014, 0, -0.135, 0.1, "cinza_claro", h=0.01, seg=12))
        for k in range(4):
            it.add(botao_y(0.008, -0.075 + k * 0.05 if k < 2 else -0.075 + k * 0.05, -0.12, 0.04, "cinza_claro", h=0.008, seg=10))
        assenta(it)
        return it
    reg("som_micro_system", "Micro system com duas caixas", "som_micro_system", micro_system, ["eletronico", "musica"], fix="apoio")

    def boombox():
        it = mb.Item("som_boombox")
        W, D = 0.5, 0.14
        it.add(C(W, D, 0.2, cor="roxo", bisel=0.03))
        it.add(C(W, D, 0.08, z=0.19, cor="verde_lima", bisel=0.025))
        for sx in (-1, 1):
            it.add(alto_falante(0.07, sx * 0.155, -D / 2, 0.1, aro="amarelo", cone="roxo_escuro", centro="amarelo"))
            it.add(Cil(0.016, 0.07, x=sx * 0.2, z=0.25, cor="roxo", seg=14))
        it.add(mb.tubo([(-0.2, 0, 0.31), (-0.2, 0, 0.345), (0.2, 0, 0.345), (0.2, 0, 0.31)], 0.016, cor="roxo",
                       raio_curva=0.03))
        it.add(C(0.13, 0.012, 0.08, y=-D / 2 - 0.001, z=0.06, cor="azul", bisel=0.005))
        it.add(C(0.1, 0.006, 0.04, y=-D / 2 - 0.006, z=0.075, cor="tela", bisel=0.003, seg=1))
        for sx in (-1, 1):
            it.add(botao_y(0.011, sx * 0.025, -D / 2 - 0.008, 0.095, "branco", h=0.004, seg=10))
        for k in range(3):
            it.add(C(0.018, 0.006, 0.01, x=-0.03 + 0.03 * k, y=-D / 2 - 0.004, z=0.035, cor="vermelho", bisel=0.002, seg=1))
        it.add(C(0.26, 0.01, 0.03, y=-D / 2 - 0.001, z=0.215, cor="amarelo_claro", bisel=0.004, seg=1))
        for k, c in enumerate(("vermelho", "amarelo", "azul_celeste", "verde")):
            it.add(C(0.03, 0.03, 0.014, x=-0.06 + 0.04 * k, y=-0.01, z=0.265, cor=c, bisel=0.005, seg=2))
        assenta(it)
        return it
    reg("som_boombox", "Som portátil (boombox)", "som_boombox", boombox, ["eletronico", "musica", "retro"], fix="apoio")

    # ------------------------------------------------------------------ teclado com suporte
    def teclado_suporte():
        it = mb.Item("teclado_suporte")
        zk = 0.78
        it.add(C(1.0, 0.32, 0.075, z=zk, cor="grafite_escuro", bisel=0.02))
        it.add(teclas(-0.44, 0.44, -0.158, zk + 0.06, 0.14, 0.02, 29, nota0=0))
        it.add(C(0.96, 0.15, 0.012, y=0.075, z=zk + 0.07, cor="grafite", bisel=0.004))
        it.add(C(0.14, 0.008, 0.05, x=0.12, y=0.08, z=zk + 0.08, cor="verde_claro", bisel=0.003))
        for k, c in enumerate(("rosa", "amarelo", "verde_claro", "azul_celeste")):
            it.add(C(0.035, 0.035, 0.012, x=-0.36 + 0.045 * k, y=0.085, z=zk + 0.078, cor=c, bisel=0.005, seg=2))
        for k in range(3):
            it.add(Cil(0.013, 0.016, x=0.3 + 0.045 * k, y=0.085, z=zk + 0.078, cor="cinza_claro", seg=14, bisel=0.004))
        for sx in (-1, 1):
            x = sx * 0.3
            it.add(mb.tubo([(x, -0.26, 0.02), (x, 0.2, zk - 0.02)], 0.016, cor="cinza_azulado", raio_curva=0.001))
            it.add(mb.tubo([(x, 0.26, 0.02), (x, -0.2, zk - 0.02)], 0.016, cor="cinza_azulado", raio_curva=0.001))
            it.add(C(0.04, 0.44, 0.025, x=x, z=zk - 0.025, cor="cinza_azulado", bisel=0.01))
            for y in (-0.26, 0.26):
                it.add(Cil(0.02, 0.08, x=x, y=y, z=0.018, cor="borracha", eixo="x", seg=12, bisel=0.006))
        it.add(Cil(0.016, 0.66, z=0.4, cor="cinza_azulado", eixo="x", seg=14, bisel=0.004))
        it.colisao([((0, 0, zk - 0.03), (1.0, 0.33, 0.14)), ((0, 0, 0), (0.7, 0.56, zk - 0.03))])
        assenta(it)
        return it
    reg("teclado_suporte", "Teclado com suporte", "teclado_suporte", teclado_suporte, ["musica", "quarto"])

    # ------------------------------------------------------------------ alvo de dardos
    def alvo():
        it = mb.Item("alvo_dardos")
        zc, D = 0.26, 0.05
        it.add(Cil(0.26, D, y=-D / 2, z=zc, cor="marrom_escuro", eixo="y", seg=40, bisel=0.016))
        raios = [0, 0.014, 0.034, 0.1, 0.112, 0.17, 0.184, 0.205]

        def cor(a, k):
            s = (k // 2) % 2
            return {0: "vermelho", 1: "verde", 2: ("preto" if s else "creme"), 3: ("vermelho" if s else "verde"),
                    4: ("preto" if s else "creme"), 5: ("vermelho" if s else "verde"), 6: "preto"}[a]
        disco = disco_polar(raios, 40, cor, y=-D - 0.0015, z=zc)
        it.add(disco)
        for k in range(20):
            a = math.radians(k * 18 + 9)
            it.add(C(0.003, 0.004, 0.16, z=0, x=0, cor="cinza_claro", bisel=0.001, seg=1))
            T(it.partes[-1], loc=(0, 0, 0.034))
            T(it.partes[-1], rot=("Y", math.degrees(a)))
            it.partes[-1].data.transform(Matrix.Translation((0, -D - 0.003, zc)))
        for (x, z, c) in ((0.035, 0.03, "verde_lima"), (-0.05, -0.02, "rosa"), (0.012, -0.06, "azul_celeste")):
            p0 = V((x, -D - 0.002, zc + z))
            dard = [mb.tubo([p0, p0 + V((0.01, -0.09, 0.02))], 0.0045, cor="cinza_claro", raio_curva=0.001),
                    mb.tubo([p0 + V((0.01, -0.09, 0.02)), p0 + V((0.015, -0.13, 0.03))], 0.006, cor=c, raio_curva=0.001)]
            for ang in (0, 90):
                fl = C(0.04, 0.035, 0.002, cor=c, bisel=0.0009, seg=1)
                T(fl, rot=("Y", ang))
                T(fl, loc=p0 + V((0.016, -0.135, 0.032)))
                dard.append(fl)
            it.add(dard)
        assenta(it, "parede")
        return it
    reg("alvo_dardos", "Alvo de dardos", "alvo_dardos", alvo, ["jogo", "sala"], fix="parede", alt=1.47)

    # ------------------------------------------------------------------ halteres
    def halter(x0, y0, comp=0.34, r=0.075, rot=0.0):
        ps = [Cil(0.014, comp - 0.04, cor="metal_claro", eixo="x", seg=10, bisel=0.0)]
        for sx in (-1, 1):
            for k, (rr, e) in enumerate(((r, 0.032), (r * 0.85, 0.028))):
                ps.append(Cil(rr, e, x=sx * (comp / 2 - 0.07 - 0.032 * k), cor="grafite", eixo="x", seg=18, bisel=0.009))
            ps.append(Cil(0.022, 0.012, x=sx * (comp / 2 - 0.105), cor="laranja", eixo="x", seg=12, bisel=0.0))
            ps.append(Cil(0.02, 0.025, x=sx * (comp / 2 - 0.015), cor="cinza_claro", eixo="x", seg=12, bisel=0.005))
        move(ps, V((0, 0, r)))
        if rot:
            gira(ps, "Z", rot)
        move(ps, V((x0, y0, 0)))
        return ps

    def halteres_par():
        it = mb.Item("halteres_par")
        it.add(halter(0, -0.1, rot=4))
        it.add(halter(0.02, 0.1, rot=-6))
        assenta(it)
        return it
    reg("halteres_par", "Par de halteres", "halteres", halteres_par, ["academia", "exercicio"])

    def barra_anilhas():
        it = mb.Item("barra_anilhas")
        zc = 0.2
        it.add(Cil(0.014, 1.2, z=zc, cor="metal_claro", eixo="x", seg=14, bisel=0.003))
        for sx in (-1, 1):
            it.add(Cil(0.024, 0.3, x=sx * 0.68, z=zc, cor="cromo", eixo="x", seg=16, bisel=0.006))
            for k, (r, e) in enumerate(((0.2, 0.04), (0.17, 0.035), (0.135, 0.03))):
                it.add(Cil(r, e, x=sx * (0.6 + 0.042 * k), z=zc, cor="grafite", eixo="x", seg=28, bisel=0.012))
            it.add(Cil(0.045, 0.13, x=sx * 0.64, z=zc, cor="laranja", eixo="x", seg=18, bisel=0.006))
            it.add(Cil(0.03, 0.03, x=sx * 0.53, z=zc, cor="grafite_escuro", eixo="x", seg=16, bisel=0.006))
        assenta(it)
        return it
    reg("barra_anilhas", "Barra com anilhas", "barra_anilhas", barra_anilhas, ["academia", "exercicio"])

    def halter_pequeno(id_, cor):
        def f():
            it = mb.Item(id_)
            it.add(Cil(0.016, 0.14, cor=cor, eixo="x", seg=14, bisel=0.004))
            for sx in (-1, 1):
                hx = mb.extrudado(mb.poligono(6, 0.045), 0.05, plano="yz", cor=cor, bisel=0.012)
                T(hx, loc=(sx * 0.07 - 0.025 + (0.0 if sx < 0 else 0.0), 0, 0))
                it.add(hx)
            move(it.partes, V((0, 0, 0.039)))
            assenta(it)
            return it
        return f
    reg("halter_pequeno_magenta", "Halter pequeno (magenta)", "halter_pequeno", halter_pequeno("halter_pequeno_magenta", "magenta"), ["academia"], fix="apoio")
    reg("halter_pequeno_lima", "Halter pequeno (verde-lima)", "halter_pequeno", halter_pequeno("halter_pequeno_lima", "verde_lima"), ["academia"], fix="apoio")

    # ------------------------------------------------------------------ cabideiros
    def cabideiro_pe():
        it = mb.Item("cabideiro_pe_amarelo")
        cor, cor2 = "amarelo", "amarelo_escuro"
        it.add(Cil(0.02, 1.62, z=0.1, cor=cor, seg=16))
        for k in range(4):
            a = math.radians(45 + 90 * k)
            c, s = math.cos(a), math.sin(a)
            it.add(mb.tubo([(0.02 * c, 0.02 * s, 0.16), (0.16 * c, 0.16 * s, 0.07), (0.3 * c, 0.3 * s, 0.025)], 0.014,
                           cor=cor, raio_curva=0.12))
            it.add(Esf(0.026, x=0.3 * c, y=0.3 * s, z=0.024, cor=cor2, seg=14))
        it.add(toro(0.026, 0.014, z=0.16, cor=cor2, seg=18, segt=6))
        it.add(toro(0.026, 0.014, z=1.52, cor=cor2, seg=18, segt=6))
        for k in range(6):
            a = math.radians(60 * k)
            c, s = math.cos(a), math.sin(a)
            it.add(mb.tubo([(0.02 * c, 0.02 * s, 1.55), (0.12 * c, 0.12 * s, 1.66), (0.15 * c, 0.15 * s, 1.75)], 0.01,
                           cor=cor, raio_curva=0.06))
            it.add(Esf(0.018, x=0.15 * c, y=0.15 * s, z=1.755, cor=cor2, seg=12))
            a2 = math.radians(60 * k + 30)
            c2, s2 = math.cos(a2), math.sin(a2)
            it.add(mb.tubo([(0.02 * c2, 0.02 * s2, 1.49), (0.09 * c2, 0.09 * s2, 1.47), (0.11 * c2, 0.11 * s2, 1.52)],
                           0.008, cor=cor, raio_curva=0.03))
            it.add(Esf(0.013, x=0.11 * c2, y=0.11 * s2, z=1.525, cor=cor2, seg=10))
        it.add(Esf(0.032, z=1.72, cor=cor2, seg=16))
        it.colisao([((0, 0, 0), (0.6, 0.6, 0.2)), ((0, 0, 0.2), (0.35, 0.35, 1.58))])
        assenta(it)
        return it
    reg("cabideiro_pe_amarelo", "Cabideiro de pé amarelo", "cabideiro_pe", cabideiro_pe, ["entrada", "quarto"])

    def cabideiro_galho():
        it = mb.Item("cabideiro_galho")
        cor = "carvao"
        it.add(mb.tubo([(0, 0, 0.06), (0.01, 0.0, 0.6), (-0.01, 0.0, 1.2), (0.0, 0.0, 1.72)], 0.024, cor=cor,
                       raio_curva=0.4))
        for k, z in enumerate((0.55, 0.78, 0.98, 1.18, 1.38, 1.56)):
            a = math.radians(70 * k + 20)
            c, s = math.cos(a), math.sin(a)
            it.add(mb.tubo([(0, 0, z), (0.1 * c, 0.1 * s, z + 0.07), (0.18 * c, 0.18 * s, z + 0.16)], 0.012, cor=cor,
                           raio_curva=0.05))
            it.add(Esf(0.016, x=0.18 * c, y=0.18 * s, z=z + 0.16, cor=cor, seg=12))
        for k in range(3):
            a = math.radians(120 * k + 90)
            c, s = math.cos(a), math.sin(a)
            it.add(mb.tubo([(0, 0, 0.12), (0.12 * c, 0.12 * s, 0.05), (0.24 * c, 0.24 * s, 0.018)], 0.018, cor=cor,
                           raio_curva=0.1))
            it.add(Esf(0.022, x=0.24 * c, y=0.24 * s, z=0.02, cor="grafite_escuro", seg=12, esc=(1, 1, 0.8)))
        it.add(Esf(0.026, z=1.72, cor=cor, seg=14))
        it.colisao([((0, 0, 0), (0.5, 0.5, 0.15)), ((0, 0, 0.15), (0.38, 0.38, 1.6))])
        assenta(it)
        return it
    reg("cabideiro_galho", "Cabideiro de galhos", "cabideiro_galho", cabideiro_galho, ["entrada", "quarto"])

    def cabideiro_parede():
        it = mb.Item("cabideiro_parede")
        it.add(mb.extrudado(mb.ret_arredondado(0.52, 0.085, 0.03), 0.026, y=-0.026, z=0.0425, plano="xz",
                            cor="laranja_claro", bisel=0.009))
        for k in range(4):
            x = -0.18 + 0.12 * k
            it.add(mb.tubo([(x, -0.02, 0.0425), (x, -0.07, 0.055), (x, -0.085, 0.07)], 0.011, cor="terracota_clara",
                           raio_curva=0.03))
            it.add(Esf(0.018, x=x, y=-0.088, z=0.074, cor="terracota_clara", seg=14))
        assenta(it, "parede")
        return it
    reg("cabideiro_parede", "Cabideiro de parede", "cabideiro_parede", cabideiro_parede, ["entrada", "banheiro"], fix="parede", alt=1.6)

    # ------------------------------------------------------------------ aquecedor a óleo
    def aquecedor():
        it = mb.Item("aquecedor_oleo")
        n, passo = 7, 0.06
        for k in range(n):
            x = (k - (n - 1) / 2) * passo
            it.add(mb.superelipsoide(0.046, 0.2, 0.56, x=x, z=0.08, cor="creme_claro", e=0.45, e_v=0.22, nu=16, nv=10))
            for z in (0.16, 0.6):
                it.add(Esf(0.016, x=x, y=-0.1, z=z, cor="creme", seg=8))
        it.add(Cil(0.025, n * passo, z=0.13, cor="creme", eixo="x", seg=16))
        it.add(Cil(0.025, n * passo, z=0.6, cor="creme", eixo="x", seg=16))
        xb = (n / 2) * passo + 0.035
        it.add(C(0.07, 0.15, 0.2, x=xb, z=0.42, cor="laranja", bisel=0.025))
        it.add(Cil(0.022, 0.016, x=xb + 0.035, z=0.55, cor="branco", eixo="x", seg=16, bisel=0.005))
        it.add(Cil(0.018, 0.016, x=xb + 0.035, z=0.48, cor="branco", eixo="x", seg=16, bisel=0.005))
        it.add(Esf(0.008, x=xb + 0.036, y=-0.045, z=0.44, cor="vermelho", seg=10))
        for sx in (-1, 1):
            it.add(C(0.04, 0.3, 0.03, x=sx * 0.15, z=0.05, cor="laranja", bisel=0.012))
            for y in (-0.12, 0.12):
                it.add(Cil(0.025, 0.025, x=sx * 0.15, y=y, z=0.025, cor="borracha", eixo="x", seg=14, bisel=0.006))
        assenta(it)
        return it
    reg("aquecedor_oleo", "Aquecedor a óleo", "aquecedor_oleo", aquecedor, ["eletro", "quarto"])

    # ------------------------------------------------------------------ toca-discos com tampa
    def toca_discos():
        it = mb.Item("toca_discos")
        W, D = 0.46, 0.36
        it.add(C(W, D, 0.09, z=0.012, cor="marrom_claro", bisel=0.028))
        it.add(C(W - 0.035, D - 0.035, 0.012, z=0.096, cor="amarelo", bisel=0.005))
        for sx in (-1, 1):
            for sy in (-1, 1):
                it.add(Cil(0.018, 0.016, x=sx * 0.18, y=sy * 0.14, cor="marrom", seg=14, bisel=0.005))
        xp = -0.07
        it.add(Cil(0.135, 0.018, x=xp, z=0.105, cor="cinza_azulado", seg=32, bisel=0.004))
        it.add(Cil(0.125, 0.004, x=xp, z=0.122, cor="preto", seg=32, bisel=0.0))
        it.add(Cil(0.09, 0.0012, x=xp, z=0.1255, cor="grafite_escuro", seg=32, bisel=0.0, tampas=False))
        it.add(Cil(0.04, 0.0045, x=xp, z=0.1235, cor="vermelho", seg=20, bisel=0.0))
        it.add(Cil(0.004, 0.018, x=xp, z=0.12, cor="cromo", seg=8, bisel=0.0))
        it.add(Cil(0.026, 0.03, x=0.16, y=0.11, z=0.105, cor="cinza_claro", seg=18, bisel=0.006))
        it.add(mb.tubo([(0.16, 0.11, 0.14), (0.15, 0.0, 0.14), (0.08, -0.08, 0.137)], 0.005, cor="cromo", raio_curva=0.04))
        it.add(C(0.03, 0.02, 0.012, x=0.075, y=-0.085, z=0.13, cor="grafite", bisel=0.004, seg=1))
        for k, c in enumerate(("vermelho", "verde")):
            it.add(C(0.008, 0.07, 0.004, x=0.13 + 0.035 * k, y=-0.08, z=0.107, cor="grafite", bisel=0.0015, seg=1))
            it.add(C(0.02, 0.014, 0.016, x=0.13 + 0.035 * k, y=-0.08 + 0.02 * (k * 2 - 1), z=0.108, cor=c, bisel=0.004, seg=1))
        for k in range(3):
            it.add(Cil(0.012, 0.014, x=0.11 + 0.035 * k, y=0.025, z=0.106, cor="cinza", seg=14, bisel=0.004))
        # tampa de acrílico (vidro), dobradiça atrás
        zt, ht = 0.108, 0.085
        tampa = [C(W - 0.01, D - 0.01, 0.006, z=zt + ht - 0.006, cor=None, mat="vidro", bisel=0.003, seg=1),
                 C(W - 0.01, 0.006, ht - 0.006, y=-(D - 0.01) / 2 + 0.003, z=zt, cor=None, mat="vidro", bisel=0.002, seg=1),
                 C(0.006, D - 0.022, ht - 0.006, x=-(W - 0.01) / 2 + 0.003, z=zt, cor=None, mat="vidro", bisel=0.002, seg=1),
                 C(0.006, D - 0.022, ht - 0.006, x=(W - 0.01) / 2 - 0.003, z=zt, cor=None, mat="vidro", bisel=0.002, seg=1),
                 C(W - 0.01, 0.006, ht - 0.006, y=(D - 0.01) / 2 - 0.003, z=zt, cor=None, mat="vidro", bisel=0.002, seg=1)]
        it.porta(tampa, dobradica=(0, D / 2 - 0.005, zt + ht), eixo="x", lado="cima", angulo=-75, nome="tampa")
        for sx in (-1, 1):
            it.add(C(0.04, 0.02, 0.02, x=sx * 0.15, y=D / 2 - 0.004, z=0.095, cor="grafite", bisel=0.005))
        assenta(it)
        return it
    reg("toca_discos", "Toca-discos com tampa", "toca_discos", toca_discos, ["musica", "retro", "sala"], fix="apoio")

    # ------------------------------------------------------------------ câmera no tripé
    def camera_tripe():
        it = mb.Item("camera_tripe")
        zh = 1.05
        for k in range(3):
            a = math.radians(90 + 120 * k)
            c, s = math.cos(a), math.sin(a)
            it.add(mb.tubo([(0.03 * c, 0.03 * s, zh), (0.3 * c, 0.3 * s, 0.03)], 0.012, cor="metal_claro", raio_curva=0.001))
            it.add(Esf(0.02, x=0.3 * c, y=0.3 * s, z=0.02, cor="borracha", seg=12, esc=(1, 1, 0.9)))
            it.add(mb.tubo([(0.0, 0.0, 0.55), (0.15 * c, 0.15 * s, 0.55)], 0.006, cor="metal", raio_curva=0.001))
        it.add(Cil(0.045, 0.06, z=zh - 0.03, cor="grafite", seg=18, bisel=0.01))
        it.add(Cil(0.014, 0.6, z=0.5, cor="metal", seg=12))
        it.add(C(0.1, 0.1, 0.03, z=zh + 0.03, cor="grafite", bisel=0.008))
        it.add(mb.tubo([(0.05, 0.02, zh + 0.04), (0.2, 0.15, zh - 0.05)], 0.008, cor="grafite", raio_curva=0.001))
        zc = zh + 0.06
        it.add(C(0.2, 0.26, 0.17, z=zc, cor="marrom_claro", bisel=0.035))
        it.add(Cil(0.07, 0.07, y=-0.15, z=zc + 0.085, cor="grafite", eixo="y", seg=28, bisel=0.01))
        it.add(toro(0.068, 0.014, y=-0.185, z=zc + 0.085, cor="amarelo", eixo="y", seg=28, segt=6))
        it.add(Cil(0.055, 0.01, y=-0.183, z=zc + 0.085, cor=None, mat="vidro", eixo="y", seg=24, bisel=0.002))
        it.add(Cil(0.04, 0.006, y=-0.178, z=zc + 0.085, cor="tela", eixo="y", seg=20, bisel=0.0))
        it.add(Cil(0.04, 0.04, x=0.1, y=0.03, z=zc + 0.1, cor="amarelo", eixo="x", seg=20, bisel=0.008))
        it.add(Cil(0.04, 0.04, x=-0.1, y=0.03, z=zc + 0.1, cor="amarelo", eixo="x", seg=20, bisel=0.008))
        it.add(mb.tubo([(-0.05, -0.06, zc + 0.165), (-0.05, -0.06, zc + 0.205), (0.05, 0.06, zc + 0.205),
                        (0.05, 0.06, zc + 0.165)], 0.012, cor="marrom", raio_curva=0.02))
        it.add(Esf(0.012, x=0.07, y=-0.13, z=zc + 0.15, cor="vermelho", seg=10))
        it.colisao([((0, 0, 0), (0.55, 0.5, zh)), ((0, -0.02, zh), (0.28, 0.32, 0.33))])
        assenta(it)
        return it
    reg("camera_tripe", "Câmera no tripé", "camera_tripe", camera_tripe, ["eletronico", "foto"])

    # ------------------------------------------------------------------ brinquedos
    def argolas():
        it = mb.Item("brinquedo_argolas")
        it.add(mb.torno([(0, 0)] + suave([(0.07, 0), (0.08, 0.012), (0.074, 0.028), (0.02, 0.032)], 2) + [(0, 0.032)],
                        cor="laranja_claro", seg=24, angulo=60))
        it.add(Cil(0.01, 0.2, z=0.03, cor="laranja", seg=10))
        z = 0.03
        for R, r, c in ((0.052, 0.022, "vermelho"), (0.047, 0.02, "laranja"), (0.042, 0.019, "amarelo"),
                        (0.037, 0.018, "azul_celeste"), (0.032, 0.017, "verde")):
            it.add(toro(R, r, z=z + r, cor=c, seg=16, segt=6))
            z += 2 * r - 0.004
        it.add(mb.torno([(0, 0)] + suave([(0.014, 0), (0.016, 0.02), (0.012, 0.045)], 2) + [(0, 0.05)], z=z - 0.004,
                        cor="laranja", seg=14, angulo=60))
        assenta(it)
        return it
    reg("brinquedo_argolas", "Argolas de empilhar", "brinquedo_argolas", argolas, ["brinquedo", "infantil"], fix="apoio")

    def blocos():
        it = mb.Item("brinquedo_blocos")
        s = 0.07
        pos = [(-s, 0, 0, "vermelho", 4), (0, 0, 0, "amarelo", -3), (s, 0, 0, "verde", 6), (-s / 2, 0.005, s, "azul", -5),
               (s / 2, -0.005, s, "laranja", 3), (0, 0.0, 2 * s, "verde_claro", 8)]
        for x, y, z, c, r in pos:
            b = mb.superelipsoide(s - 0.003, s - 0.003, s - 0.003, cor=c, e=0.22, nu=16, nv=8)
            T(b, rot=("Z", r))
            T(b, loc=(x * 1.02, y, z))
            it.add(b)
        assenta(it)
        return it
    reg("brinquedo_blocos", "Blocos de montar", "brinquedo_blocos", blocos, ["brinquedo", "infantil"], fix="apoio")

    def bola(id_, c1, c2):
        def f():
            it = mb.Item(id_)
            b = Esf(0.12, cor=c1, seg=32)
            mb.pinta_onde(b, c2, lambda c, n: int(((math.atan2(c.y, c.x) + math.pi) / (2 * math.pi)) * 8) % 2 == 0)
            T(b, rot=[("X", 25), ("Y", 20)])
            T(b, loc=(0, 0, 0.12))
            it.add(b)
            assenta(it)
            return it
        return f
    reg("brinquedo_bola_azul", "Bola listrada (azul e amarela)", "brinquedo_bola", bola("brinquedo_bola_azul", "azul_celeste", "amarelo"), ["brinquedo", "infantil"], fix="apoio")
    reg("brinquedo_bola_vermelha", "Bola listrada (vermelha e branca)", "brinquedo_bola", bola("brinquedo_bola_vermelha", "vermelho", "branco"), ["brinquedo", "infantil"], fix="apoio")

    def tambor():
        it = mb.Item("brinquedo_tambor")
        r, h = 0.1, 0.11
        corpo = Cil(r, h, z=0.012, cor="amarelo", seg=24, bisel=0.0)
        mb.pinta_onde(corpo, "vermelho", lambda c, n: abs(n.z) < 0.5 and
                      int(((math.atan2(c.y, c.x) + math.pi) / (2 * math.pi)) * 12) % 2 == 0)
        it.add(corpo)
        it.add(toro(r, 0.014, z=0.014, cor="azul", seg=28, segt=7))
        it.add(toro(r, 0.014, z=h + 0.01, cor="azul", seg=28, segt=7))
        it.add(Cil(r - 0.006, 0.006, z=h + 0.008, cor="creme_claro", seg=28, bisel=0.002))
        for sx in (-1, 1):
            p0 = V((sx * 0.03, 0.05, h + 0.025))
            p1 = V((sx * 0.005, -0.03, h + 0.11))
            it.add(mb.tubo([p0, p1], 0.007, cor="madeira_clara", raio_curva=0.001))
            it.add(Esf(0.016, x=p0.x, y=p0.y, z=p0.z - 0.004, cor="vermelho", seg=12))
        assenta(it)
        return it
    reg("brinquedo_tambor", "Tamborzinho", "brinquedo_tambor", tambor, ["brinquedo", "infantil", "musica"], fix="apoio")

    def chocalho():
        it = mb.Item("brinquedo_chocalho")
        cabo = mb.torno([(0, 0)] + suave([(0.012, 0), (0.016, 0.012), (0.01, 0.06), (0.012, 0.1)], 2) + [(0, 0.1)],
                        cor="madeira_clara", seg=14, angulo=60)
        cab = Esf(0.05, z=0.15, cor="amarelo", seg=20, esc=(1, 1, 1.25))
        corta(cab, "z", [0.11 + 0.012 * k for k in range(1, 7)])
        mb.pinta_onde(cab, "vermelho", lambda c, n: int((c.z - 0.11) / 0.012) % 2 == 1 and 0.11 < c.z < 0.19)
        ps = [cabo, cab]
        gira(ps, "Y", 90)
        gira(ps, "Y", -14)
        it.add(ps)
        assenta(it)
        return it
    reg("brinquedo_chocalho", "Chocalho", "brinquedo_chocalho", chocalho, ["brinquedo", "infantil", "musica"], fix="apoio")

    def almofada_chao(id_, cor):
        def f():
            it = mb.Item(id_)
            it.add(mb.almofada(0.52, 0.52, 0.17, cor=cor, e=0.2, estufa=0.5))
            assenta(it)
            return it
        return f
    reg("almofada_chao_turquesa", "Almofada de chão (turquesa)", "almofada_chao", almofada_chao("almofada_chao_turquesa", "turquesa"), ["sala", "quarto", "macio"])
    reg("almofada_chao_verde", "Almofada de chão (verde-água)", "almofada_chao", almofada_chao("almofada_chao_verde", "verde_agua"), ["sala", "quarto", "macio"])

    # ------------------------------------------------------------------ videogame
    def console():
        it = mb.Item("videogame_console")
        it.add(C(0.36, 0.22, 0.06, cor="cinza_azulado", bisel=0.016))
        it.add(C(0.358, 0.03, 0.034, y=-0.098, z=0.004, cor="laranja", bisel=0.01))
        for k in range(5):
            it.add(C(0.3, 0.008, 0.006, y=-0.07 + k * 0.022, z=0.058, cor="grafite", bisel=0.002, seg=1))
        it.add(C(0.1, 0.07, 0.03, y=0.04, z=0.056, cor="grafite", bisel=0.008))
        it.add(C(0.075, 0.03, 0.065, y=0.04, z=0.07, cor="cinza_azulado", bisel=0.008))
        it.add(C(0.06, 0.032, 0.012, y=0.04, z=0.128, cor="azul_celeste", bisel=0.004, seg=1))
        for sx in (-1, 1):
            for k in range(2):
                it.add(Cil(0.011, 0.01, x=sx * (0.1 + 0.03 * k), y=0.06, z=0.058, cor="amarelo", seg=12, bisel=0.003))
        assenta(it)
        return it
    reg("videogame_console", "Videogame com cartucho", "videogame_console", console, ["eletronico", "jogo", "retro"], fix="apoio")

    def joystick():
        it = mb.Item("videogame_joystick")
        it.add(C(0.12, 0.12, 0.04, cor="cinza_azulado", bisel=0.014))
        it.add(mb.torno([(0, 0.036), (0.03, 0.036)] + [(0.026 - 0.004 * k + 0.004 * (k % 2), 0.042 + 0.006 * k) for k in range(5)]
                        + [(0.008, 0.072), (0, 0.072)], cor="grafite", seg=18, angulo=60))
        it.add(Cil(0.009, 0.08, z=0.07, cor="grafite", seg=12))
        it.add(Esf(0.017, z=0.152, cor="vermelho", seg=14))
        it.add(Cil(0.013, 0.012, x=0.035, y=-0.035, z=0.036, cor="vermelho", seg=14, bisel=0.004))
        assenta(it)
        return it
    reg("videogame_joystick", "Joystick", "videogame_joystick", joystick, ["eletronico", "jogo", "retro"], fix="apoio")

    def cartucho(id_, rot):
        def f():
            it = mb.Item(id_)
            it.add(C(0.09, 0.1, 0.024, cor="cinza_azulado", bisel=0.008))
            it.add(C(0.062, 0.06, 0.004, y=0.008, z=0.022, cor=rot, bisel=0.0015, seg=1))
            for k in range(3):
                it.add(C(0.07, 0.005, 0.003, y=-0.03 - k * 0.008, z=0.023, cor="grafite", bisel=0.001, seg=1))
            assenta(it)
            return it
        return f
    reg("videogame_cartucho_verde", "Cartucho de videogame (verde)", "videogame_cartucho", cartucho("videogame_cartucho_verde", "verde_claro"), ["jogo", "retro"], fix="apoio")
    reg("videogame_cartucho_amarelo", "Cartucho de videogame (amarelo)", "videogame_cartucho", cartucho("videogame_cartucho_amarelo", "limao"), ["jogo", "retro"], fix="apoio")

    # ------------------------------------------------------------------ porta-retrato
    def porta_retrato(id_, cor):
        def f():
            it = mb.Item(id_)
            W, H = 0.19, 0.24
            ps = [mb.extrudado(mb.ret_arredondado(W, H, 0.02), 0.018, z=H / 2, plano="xz", cor=cor, bisel=0.006),
                  aro_tubo(W - 0.02, H - 0.02, 0.01, y=-0.002, z=H / 2, raio=0.02, cor=cor),
                  placa(W - 0.05, H - 0.05, y=-0.003, z=0.025, esp=0.004, mat=E["foto"], r=0.006)]
            gira(ps, "X", -12)
            it.add(ps)
            q = Matrix.Rotation(math.radians(-12), 4, "X") @ V((0, 0.018, 0.15))
            it.add(mb.tubo([(0, q.y - 0.004, q.z), (0, 0.09, 0.006)], 0.006, cor=cor, raio_curva=0.001))
            assenta(it)
            return it
        return f
    reg("porta_retrato_rosa", "Porta-retrato (rosa)", "porta_retrato", porta_retrato("porta_retrato_rosa", "rosa_escuro"), ["decoracao"], fix="apoio")
    reg("porta_retrato_azul", "Porta-retrato (azul)", "porta_retrato", porta_retrato("porta_retrato_azul", "azul_celeste"), ["decoracao"], fix="apoio")

    # ------------------------------------------------------------------ microfone
    def microfone(id_, cabo, anel, cabeca):
        def f():
            it = mb.Item(id_)
            c = mb.torno([(0, 0)] + suave([(0.013, 0), (0.016, 0.01), (0.022, 0.12), (0.025, 0.14)], 2) + [(0, 0.14)],
                         cor=cabo, seg=18, angulo=60)
            a = Cil(0.028, 0.022, z=0.138, cor=anel, seg=20, bisel=0.006)
            h = Esf(0.042, z=0.19, cor=cabeca, seg=20)
            ps = [c, a, h]
            gira(ps, "Y", 90)
            gira(ps, "Y", -9)
            it.add(ps)
            assenta(it)
            return it
        return f
    reg("microfone_roxo", "Microfone (roxo)", "microfone", microfone("microfone_roxo", "violeta", "azul_celeste", "amarelo"), ["musica", "festa"], fix="apoio")
    reg("microfone_preto", "Microfone (preto)", "microfone", microfone("microfone_preto", "grafite_escuro", "vermelho", "cinza_claro"), ["musica", "festa"], fix="apoio")

    # ------------------------------------------------------------------ rádios e fitas
    def radio_portatil():
        it = mb.Item("radio_portatil")
        W, H, D = 0.4, 0.2, 0.12
        it.add(mb.extrudado(mb.ret_arredondado(W, H, H / 2 - 0.002, seg=8), D, y=-D / 2, z=H / 2, plano="xz", cor="laranja",
                            bisel=0.025, seg=3))
        yf = -D / 2
        it.add(C(0.15, 0.01, 0.15, x=0.09, y=yf - 0.001, z=0.025, cor="cinza", bisel=0.02))
        it.add(alto_falante(0.06, 0.09, yf - 0.006, 0.1, aro="cinza_claro", cone="cinza", centro="cinza_claro"))
        it.add(C(0.09, 0.008, 0.045, x=-0.075, y=yf - 0.001, z=0.045, cor="azul_celeste", bisel=0.004, seg=1))
        it.add(C(0.065, 0.004, 0.022, x=-0.075, y=yf - 0.005, z=0.056, cor="tela", bisel=0.002, seg=1))
        for sx in (-1, 1):
            it.add(Cil(0.007, 0.004, x=-0.075 + sx * 0.018, y=yf - 0.008, z=0.067, cor="branco", eixo="y", seg=10, bisel=0.0))
        it.add(C(0.12, 0.006, 0.01, x=-0.07, y=yf - 0.001, z=0.13, cor="amarelo", bisel=0.002, seg=1))
        it.add(C(0.016, 0.016, 0.028, x=-0.095, y=yf - 0.006, z=0.121, cor="azul_celeste", bisel=0.005, seg=1))
        for k, c in enumerate(("vermelho", "azul_celeste", "azul_celeste", "azul_celeste", "azul_celeste")):
            it.add(C(0.03, 0.04, 0.018, x=-0.1 + 0.035 * k, y=0.0, z=H - 0.005, cor=c, bisel=0.006, seg=2))
        assenta(it)
        return it
    reg("radio_portatil", "Rádio portátil", "radio_portatil", radio_portatil, ["eletronico", "musica", "retro"], fix="apoio")

    def radio_antigo():
        it = mb.Item("radio_antigo")
        W, D, H = 0.36, 0.17, 0.25
        it.add(C(W, D, H, cor="terracota", bisel=0.05, seg=4))
        yf = -D / 2
        it.add(mb.extrudado(mb.ret_arredondado(W - 0.07, H - 0.07, 0.03), 0.01, y=yf - 0.004, z=H / 2, plano="xz",
                            cor="areia", bisel=0.004))
        for k in range(5):
            it.add(C(W - 0.12, 0.004, 0.006, y=yf - 0.005, z=0.15 + 0.016 * k, cor="madeira_cinza", bisel=0.0015, seg=1))
        it.add(C(0.13, 0.006, 0.035, y=yf - 0.006, z=0.07, cor="cinza_azulado", bisel=0.004, seg=1))
        it.add(C(0.003, 0.004, 0.028, x=0.02, y=yf - 0.009, z=0.0735, cor="vermelho", bisel=0.001, seg=1))
        for sx in (-1, 1):
            it.add(botao_y(0.026, sx * 0.11, yf - 0.006, 0.085, "branco_gelo", h=0.022, seg=18))
            it.add(Cil(0.035, 0.03, x=sx * (W / 2 + 0.005), z=H * 0.62, cor="cinza_claro", eixo="x", seg=20, bisel=0.008))
        for k, c in enumerate(("vermelho", "cinza_claro", "cinza_claro")):
            it.add(C(0.04, 0.035, 0.02, x=-0.02 + 0.045 * k, y=-0.02, z=H - 0.008, cor=c, bisel=0.007, seg=2))
        it.add(mb.tubo([(-W / 2 - 0.012, 0, H * 0.62), (-W / 2 - 0.012, 0, H + 0.05), (W / 2 + 0.012, 0, H + 0.05),
                        (W / 2 + 0.012, 0, H * 0.62)], 0.012, cor="cinza_claro", raio_curva=0.05))
        assenta(it)
        return it
    reg("radio_antigo", "Rádio antigo", "radio_antigo", radio_antigo, ["eletronico", "musica", "retro"], fix="apoio")

    def fita(x=0.0, y=0.0, rot=0.0, cor="turquesa"):
        ps = [C(0.1, 0.064, 0.012, cor=cor, bisel=0.004, seg=2),
              C(0.084, 0.03, 0.0016, y=0.006, z=0.0118, cor="branco", bisel=0.0007, seg=1),
              C(0.04, 0.013, 0.0016, y=0.006, z=0.0126, cor="tela", bisel=0.0006, seg=1)]
        for sx in (-1, 1):
            ps.append(Cil(0.005, 0.0015, x=sx * 0.012, y=0.006, z=0.0134, cor="branco_gelo", seg=10, bisel=0.0))
        ps.append(C(0.05, 0.012, 0.002, y=-0.024, z=0.011, cor=ESCURO.get(cor, "grafite") if cor in ESCURO else "grafite",
                    bisel=0.0008, seg=1))
        if rot:
            gira(ps, "Z", rot)
        move(ps, V((x, y, 0)))
        return ps

    def fita_cassete():
        it = mb.Item("fita_cassete")
        it.add(fita())
        assenta(it)
        return it
    reg("fita_cassete", "Fita cassete", "fita_cassete", fita_cassete, ["musica", "retro"], fix="apoio")

    def walkman():
        it = mb.Item("walkman_fone")
        # walkman deitado
        it.add(C(0.09, 0.125, 0.03, cor="azul", bisel=0.008))
        it.add(C(0.075, 0.07, 0.004, y=0.02, z=0.029, cor="rosa", bisel=0.002, seg=1))
        it.add(C(0.05, 0.022, 0.003, y=0.025, z=0.032, cor="tela", bisel=0.001, seg=1))
        for sx in (-1, 1):
            it.add(Cil(0.005, 0.002, x=sx * 0.013, y=0.025, z=0.0335, cor="branco", seg=10, bisel=0.0))
        it.add(C(0.012, 0.125, 0.026, x=0.046, z=0.002, cor="verde_claro", bisel=0.005, seg=1))
        for k in range(3):
            it.add(C(0.022, 0.015, 0.008, x=-0.026 + 0.026 * k, y=-0.045, z=0.027, cor="verde", bisel=0.003, seg=1))
        it.add(Cil(0.004, 0.012, x=-0.03, y=0.066, z=0.015, cor="grafite", eixo="y", seg=8, bisel=0.0))
        # fone
        cx, cy, R = -0.18, 0.12, 0.085
        arco = [(cx + R * math.cos(math.radians(a)), cy + R * math.sin(math.radians(a)), 0.012) for a in range(-10, 191, 20)]
        it.add(mb.tubo(arco, 0.007, cor="rosa_escuro", raio_curva=0, seg=8))
        it.add(mb.tubo([(cx - R * 0.6, cy + R * 0.82, 0.02), (cx + R * 0.6, cy + R * 0.82, 0.02)], 0.006, cor="roxo",
                       raio_curva=0.001))
        for a in (-10, 190):
            x, y = cx + R * math.cos(math.radians(a)), cy + R * math.sin(math.radians(a)) - 0.02
            it.add(Cil(0.032, 0.022, x=x, y=y, cor="laranja", seg=20, bisel=0.007))
            it.add(Cil(0.022, 0.006, x=x, y=y, z=0.021, cor="grafite", seg=18, bisel=0.002))
        # cabo no chão
        pts = [(-0.03, 0.075, 0.004), (-0.04, 0.16, 0.003), (0.05, 0.25, 0.003), (0.16, 0.2, 0.003), (0.17, 0.05, 0.003),
               (0.12, -0.08, 0.003), (-0.02, -0.12, 0.003), (-0.16, -0.06, 0.003), (-0.24, 0.02, 0.003),
               (cx + R * math.cos(math.radians(190)), cy + R * math.sin(math.radians(190)) - 0.035, 0.004)]
        it.add(mb.tubo(pts, 0.0028, cor="rosa_escuro", raio_curva=0.04, seg=6))
        it.add(fita(x=0.17, y=-0.15, rot=-15, cor="turquesa"))
        assenta(it)
        return it
    reg("walkman_fone", "Walkman com fone e fita", "walkman", walkman, ["eletronico", "musica", "retro"], fix="apoio")

    # ------------------------------------------------------------------ do pacote
    def tela_pc(it, pc):
        o = pc["corpo"]
        uv = o.data.uv_layers["UVMap"].data
        alvo = {mb.NOMES.index("turquesa"), mb.NOMES.index("agua")}
        ids = set()
        for p in o.data.polygons:
            u = uv[p.loop_indices[0]].uv
            if p.material_index == 0 and int(u[0] * 16) + 16 * int((1 - u[1]) * 16) in alvo and p.normal.y < -0.5:
                ids.add(p.index)
        vs = [o.data.vertices[k].co for p in o.data.polygons if p.index in ids for k in p.vertices]
        projeta_estampa(o, E["tela"], min(v.x for v in vs), max(v.x for v in vs), min(v.z for v in vs),
                        max(v.z for v in vs), faces=ids)
        it.add(list(pc.values()))

    def pac(nome, id_, esc=1.0, rot=0.0, interno=None, tela=None):
        def f():
            it = mb.Item(id_)
            pc = pacote(nome, esc, rot)
            if interno:
                interno(it, pc)
            else:
                it.add(list(pc.values()))
            assenta(it)
            return it
        return f
    reg("relogio_pe_pacote", "Relógio de pé (pacote)", "relogio_pe_pacote", pac("Clock_03", "relogio_pe_pacote"), ["sala", "classico"], pac=True)
    reg("computador_pacote", "Computador com teclado e mouse (pacote)", "computador", pac("Computer_01", "computador_pacote", interno=tela_pc), ["eletronico", "escritorio"], fix="apoio", pac=True)
    reg("bicicleta_ergometrica_pacote", "Bicicleta ergométrica (pacote)", "bicicleta_ergometrica", pac("ExerciseBike_01", "bicicleta_ergometrica_pacote"), ["academia", "exercicio"], pac=True)
    reg("videogame_controle_pacote", "Controle de videogame (pacote)", "videogame_controle", pac("GameConsole_01", "videogame_controle_pacote", 0.75), ["eletronico", "jogo"], fix="apoio", pac=True)
    reg("violao_pacote", "Violão (pacote)", "violao", pac("Guitar_01", "violao_pacote"), ["musica"], pac=True)
    reg("brinquedo_carrinho_pacote", "Carrinho (pacote)", "brinquedo_carrinho", pac("Toy_02", "brinquedo_carrinho_pacote"), ["brinquedo", "infantil"], fix="apoio", pac=True)
    reg("brinquedo_piao_pacote", "Pião (pacote)", "brinquedo_piao", pac("Toy_03", "brinquedo_piao_pacote"), ["brinquedo", "infantil"], fix="apoio", pac=True)
    return R


if __name__ == "__main__":
    pedidas = [CAT_PEDIDA] if CAT_PEDIDA else ["livros", "luminarias", "objetos"]
    for c in pedidas:
        {"livros": roda_livros, "luminarias": roda_luminarias, "objetos": roda_objetos}[c]()
    print("ok", pedidas)
