"""Ferramentas da categoria parque_brinquedos (sem mexer em moveis_base nem cidade_base).

- ItemP: Item com filhos animados (extras glTF "anima" no nó, como a sinalização), animados aninhados (cabines da roda
  dentro da roda, xícaras dentro do prato), animados colocados com rotação (carrinhos já orientados no trilho) e slots
  presos a um animado (o assento anda com o carrinho).
- Varredura de perfis por caminhos 3D (trilhos, toboáguas, tubos de raio variável), com quadros "minimizando giro"
  (RMF) ou com o "para cima" dado (trilho de montanha-russa: Z com inclinação nas curvas, centro do looping no looping).
- Trilho de montanha-russa: Catmull-Rom centrípeta pelos pontos de controle, loopings analíticos, reamostragem por
  comprimento, trilho duplo com dormentes e espinha, pilares e pontos do percurso nos eixos do glTF.
- Terreno: montes de contorno arredondado em anéis, pedras facetadas (fecho convexo), caminhos de ladrilho rosado
  iguais ao piso_grama_caminho (2,6 m, juntas a cada 0,6 m, guias baixas de concreto).
"""
import math
import os
import random

import bpy
import bmesh
from mathutils import Matrix, Vector

import moveis_base as mb
import cidade_base as cb

V = Vector
Z = V((0, 0, 1))
EST_DIR = ""  # definido pelo gerador: <saida>/parque_brinquedos/estampas


# ======================================================================================================================
# Item com animados
# ======================================================================================================================
class ItemP(mb.Item):
    def __init__(self, id_):
        super().__init__(id_)
        self.animados = []  # (ob, dados, pai_nome, matriz_mundo)

    def anima(self, objs, dados, nome, pivo=None, pai=None):
        """Animado montado em coordenadas do mundo: a origem do nó vai para o pivô (sem rotação)."""
        ob = mb.junta(objs if isinstance(objs, (list, tuple)) else [objs], nome)
        if pivo is None:
            lo, hi = mb.bbox(ob)
            pivo = (lo + hi) / 2
        M = Matrix.Translation(V(pivo))
        ob.data.transform(M.inverted())
        self.animados.append((ob, dict(dados), pai, M))
        return ob

    def anima_local(self, objs, dados, nome, matriz, pai=None):
        """Animado montado nas coordenadas dele (origem no pivô, frente −Y) e posto no mundo pela matriz."""
        ob = mb.junta(objs if isinstance(objs, (list, tuple)) else [objs], nome)
        self.animados.append((ob, dict(dados), pai, matriz.copy()))
        return ob

    def matriz_de(self, nome):
        for ob, _, _, M in self.animados:
            if ob.name == nome:
                return M
        raise KeyError(nome)

    def slot_local(self, nome, centro_local, tamanho, pai):
        """Slot nas coordenadas locais do animado pai (anda com ele)."""
        c = self.matriz_de(pai) @ V(centro_local)
        self.slots.append((f"slot_{nome}", tuple(c), tuple(tamanho), pai))

    def monta(self):
        nomes_anim = {ob.name for ob, *_ in self.animados}
        todos = list(self.slots)
        self.slots = [s for s in todos if s[3] not in nomes_anim]
        corpo = super().monta()
        self.slots = todos
        por_nome = {ob.name: (ob, M) for ob, _, _, M in self.animados}
        for ob, d, pai, M in self.animados:
            if pai:
                po, Mp = por_nome[pai]
                ob.parent = po
                ob.matrix_basis = Mp.inverted() @ M
            else:
                ob.parent = corpo
                ob.matrix_basis = M
            for k, v in d.items():
                ob[k] = v
        bpy.context.view_layer.update()
        for nome, c, t, pai in todos:
            if pai not in nomes_anim:
                continue
            po, M = por_nome[pai]
            e = bpy.data.objects.new(nome, None)
            e.empty_display_type = "CUBE"
            e.empty_display_size = 0.5
            bpy.context.scene.collection.objects.link(e)
            e.parent = po
            e.matrix_basis = Matrix.Translation(po.matrix_world.inverted() @ V(c))
            e["slot"] = 1
            e["tamanho"] = [round(t[0], 4), round(t[2], 4), round(t[1], 4)]
        bpy.context.view_layer.update()
        return corpo

    def lista_animacoes(self):
        out = []
        for ob, d, pai, M in self.animados:
            e = {"nome": ob.name}
            e.update(d)
            e["pivo"] = mb._gl(M.to_translation())
            if pai:
                e["em"] = pai
            out.append(e)
        return out


def matriz_frente(pos, frente, cima=Z):
    """Matriz que leva o local (frente −Y, cima +Z) para pos, olhando para 'frente'."""
    t = V(frente).normalized()
    u = V(cima) - t * V(cima).dot(t)
    if u.length < 1e-6:
        u = V((0, 1, 0)) - t * t.y
    u.normalize()
    x = u.cross(t)
    M = Matrix(((x.x, -t.x, u.x, pos[0]), (x.y, -t.y, u.y, pos[1]), (x.z, -t.z, u.z, pos[2]), (0, 0, 0, 1)))
    return M


# ======================================================================================================================
# Malhas
# ======================================================================================================================
def obj(nome, bm, cor="branco", mat="atlas", liso=True, angulo=40):
    return mb._obj(nome, bm, cor, mat, liso, angulo)


def bola(x, y, z, r, cor="branco", mat="atlas", sub=1, esc=(1, 1, 1), nome="bola"):
    """Bolinha leve (icosfera: sub 0 = 20 triângulos, sub 1 = 80)."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    bm.transform(Matrix.Translation((x, y, z)) @ Matrix.Diagonal((*esc, 1)))
    return obj(nome, bm, cor, mat, liso=True, angulo=80)


def obj_cru(nome, bm, cor="branco", mat="atlas", liso=True, angulo=40):
    """Como mb._obj, mas sem recalcular as normais (malhas abertas com a orientação já certa)."""
    mb.materiais()
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-6)
    mi = mb._mat_idx(mat)
    uvl = bm.loops.layers.uv.get("UVMap") or bm.loops.layers.uv.new("UVMap")
    u = mb.uv_cor(cor) if cor else (0.5, 0.5)
    for f in bm.faces:
        f.material_index = mi
        for lo in f.loops:
            lo[uvl].uv = u
    me = bpy.data.meshes.new(nome)
    bm.to_mesh(me)
    bm.free()
    for n in mb.MAT_NOMES:
        me.materials.append(bpy.data.materials[n])
    if liso:
        me.shade_smooth()
        me.set_sharp_from_angle(angle=math.radians(angulo))
    ob = bpy.data.objects.new(nome, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def laje_furos(contorno, furos, z_topo, z_fundo, cor, cor_furo=None, nome="laje"):
    """Laje com furos: topo (triangulado com os furos), parede de fora e paredes dos furos até z_fundo."""
    bm = bmesh.new()
    arestas = []
    aneis = []
    for pts in [mb._ccw(list(contorno))] + [mb._ccw(list(f)) for f in furos]:
        vs = [bm.verts.new((x, y, z_topo)) for x, y in pts]
        aneis.append(vs)
        for i in range(len(vs)):
            arestas.append(bm.edges.new((vs[i], vs[(i + 1) % len(vs)])))
    bmesh.ops.triangle_fill(bm, use_beauty=True, use_dissolve=False, edges=arestas, normal=(0, 0, 1))
    for f in bm.faces:
        if f.normal.z < 0:
            f.normal_flip()
    paredes_furo = []
    for k, vs in enumerate(aneis):
        n = len(vs)
        baixo = [bm.verts.new((v.co.x, v.co.y, z_fundo)) for v in vs]
        for i in range(n):
            j = (i + 1) % n
            f = bm.faces.new((vs[i], baixo[i], baixo[j], vs[j]))  # anel anti-horário: normal para fora
            if k > 0:
                f.normal_flip()  # furo: parede olhando para dentro do furo
                paredes_furo.append(f)
    bm.faces.ensure_lookup_table()
    idx_furo = {f.index for f in paredes_furo}
    ob = obj_cru(nome, bm, cor, liso=False)
    if cor_furo:
        mb.pinta(ob, cor_furo, sorted(idx_furo))
    return ob


def helice(c, r, z0, z1, a0, voltas, sentido=1, passo=0.6):
    """Pontos de uma hélice (toboágua em espiral) em volta de c, do ângulo a0 (graus), descendo de z0 a z1."""
    L = abs(voltas) * 2 * math.pi * r
    n = max(8, int(L / passo))
    out = []
    for k in range(n + 1):
        f = k / n
        a = math.radians(a0) + sentido * 2 * math.pi * voltas * f
        out.append((c[0] + r * math.cos(a), c[1] + r * math.sin(a), z0 + (z1 - z0) * f))
    return out


def quadros_inclinados(P, inclina=1.6, inclina_max=0.55):
    """Tangentes e vetores para cima (Z inclinado para dentro das curvas) de um caminho aberto."""
    T = tangentes(P, False)
    n = len(P)
    kap = []
    for i in range(n):
        a, b = T[max(0, i - 1)], T[min(n - 1, i + 1)]
        ds = max(1e-3, (P[min(n - 1, i + 1)] - P[max(0, i - 1)]).length)
        ah, bh = V((a.x, a.y)), V((b.x, b.y))
        if ah.length < 0.2 or bh.length < 0.2:
            kap.append(0.0)
            continue
        ah.normalize()
        bh.normalize()
        kap.append((ah.x * bh.y - ah.y * bh.x) / ds)
    jan = 3
    sk = [sum(kap[max(0, min(n - 1, i + k))] for k in range(-jan, jan + 1)) / (2 * jan + 1) for i in range(n)]
    U = []
    for i in range(n):
        t = T[i]
        u = Z - t * t.z
        u = u.normalized() if u.length > 1e-4 else V((1, 0, 0))
        ang = max(-inclina_max, min(inclina_max, -inclina * sk[i]))
        U.append((Matrix.Rotation(ang, 3, t) @ u).normalized())
    return T, U


def caixa_eixos(centro, ex, ey, ez, dims, cor="branco", mat="atlas", nome="caixa"):
    """Caixa sem bisel com eixos dados (vetores unitários) e dims (ao longo de ex, ey, ez), centrada."""
    bm = bmesh.new()
    c = V(centro)
    hx, hy, hz = (d / 2 for d in dims)
    vs = {}
    for sx in (-1, 1):
        for sy in (-1, 1):
            for sz in (-1, 1):
                vs[(sx, sy, sz)] = bm.verts.new(c + V(ex) * sx * hx + V(ey) * sy * hy + V(ez) * sz * hz)
    for q in (((-1, -1, -1), (-1, 1, -1), (1, 1, -1), (1, -1, -1)), ((-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)),
              ((-1, -1, -1), (1, -1, -1), (1, -1, 1), (-1, -1, 1)), ((-1, 1, -1), (-1, 1, 1), (1, 1, 1), (1, 1, -1)),
              ((-1, -1, -1), (-1, -1, 1), (-1, 1, 1), (-1, 1, -1)), ((1, -1, -1), (1, 1, -1), (1, 1, 1), (1, -1, 1))):
        bm.faces.new([vs[k] for k in q])
    return obj(nome, bm, cor, mat, liso=False)


def barra(a, b, r, cor="metal", lados=6, nome="barra", tampas=True):
    """Cilindro de a até b (poste, braço, cabo)."""
    a, b = V(a), V(b)
    d = b - a
    L = d.length
    o = mb.cilindro(r, L, cor=cor, seg=lados, bisel=0.0, nome=nome, tampas=tampas)
    q = d.normalized().to_track_quat("Z", "Y")
    o.data.transform(Matrix.Translation(a) @ q.to_matrix().to_4x4())
    return o


def anel_extrudado(fora, dentro, z0, z1, cor="branco", bisel=0.0, nome="anel", seg_bisel=2):
    """Parede entre dois contornos 2D com o mesmo número de pontos (anti-horário), de z0 a z1 (tina, borda, mureta)."""
    n = len(fora)
    assert len(dentro) == n
    bm = bmesh.new()
    fb = [bm.verts.new((p[0], p[1], z0)) for p in fora]
    ft = [bm.verts.new((p[0], p[1], z1)) for p in fora]
    db = [bm.verts.new((p[0], p[1], z0)) for p in dentro]
    dt = [bm.verts.new((p[0], p[1], z1)) for p in dentro]
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((fb[i], fb[j], ft[j], ft[i]))
        bm.faces.new((dt[i], dt[j], db[j], db[i]))
        bm.faces.new((ft[i], ft[j], dt[j], dt[i]))
        bm.faces.new((db[i], db[j], fb[j], fb[i]))
    if bisel > 0:
        topo = [e for e in bm.edges if all(abs(v.co.z - z1) < 1e-6 for v in e.verts) and
                len(e.link_faces) == 2 and e.link_faces[0].normal.dot(e.link_faces[1].normal) < 0.5]
        bmesh.ops.bevel(bm, geom=topo, offset=bisel, offset_type="OFFSET", segments=seg_bisel, profile=0.5,
                        affect="EDGES",
                        clamp_overlap=True)
    return obj(nome, bm, cor, angulo=50)


def placa_estampa(png, centro, largura, altura, frente=(0, -1, 0), emissao=1.2, nome="placa", duplo=False):
    """Retângulo com uma estampa (letreiro) virado para 'frente'. duplo: o verso mostra o mesmo desenho."""
    mi = mb.material_estampa("pq_" + os.path.splitext(os.path.basename(png))[0], os.path.join(EST_DIR, png),
                             emissao=emissao)
    n = V(frente).normalized()
    faces = []
    for lado in ((1,) if not duplo else (1, -1)):
        nn = n * lado
        u = Z.cross(nn)
        if u.length < 1e-6:
            u = V((1, 0, 0))
        u.normalize()
        v = nn.cross(u).normalized()
        c = V(centro) + nn * 0.002
        bm = bmesh.new()
        uvl = bm.loops.layers.uv.new("UVMap")
        vs = [bm.verts.new(c + u * (sx * largura / 2) + v * (sy * altura / 2))
              for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        f = bm.faces.new(vs)
        for lo, q in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
            lo[uvl].uv = q
        ob = obj(nome, bm, None, mat=mi, liso=False)
        if ob.data.polygons[0].normal.dot(nn) < 0:
            ob.data.flip_normals()
        faces.append(ob)
    return faces[0] if len(faces) == 1 else mb.junta(faces, nome)


def planar_uv(ob, escala=0.12, mat=None, so=None):
    """UV planar (x, y) para estampas repetidas (lava). so: só as faces com esse índice de material."""
    me = ob.data
    uv = me.uv_layers["UVMap"].data
    for p in me.polygons:
        if so is not None and p.material_index != so:
            continue
        if mat is not None:
            p.material_index = mat
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            uv[li].uv = (co.x * escala, co.y * escala)
    return ob


def estampa(nome, emissao=0.0):
    return mb.material_estampa("pq_" + nome, os.path.join(EST_DIR, nome + ".png"), emissao=emissao)


# ======================================================================================================================
# Curvas e varredura
# ======================================================================================================================
def catmull(ctrl, fechado=True, n_por=14, tags=None):
    """Catmull-Rom centrípeta pelos pontos; devolve (pontos densos, tags densos interpoladas ou None)."""
    P = [V(p) for p in ctrl]
    n = len(P)
    out, tg = [], []
    rng = range(n) if fechado else range(n - 1)
    for i in rng:
        if fechado:
            p0, p1, p2, p3 = P[(i - 1) % n], P[i], P[(i + 1) % n], P[(i + 2) % n]
        else:
            p0 = P[i - 1] if i > 0 else P[0] * 2 - P[1]
            p1, p2 = P[i], P[i + 1]
            p3 = P[i + 2] if i + 2 < n else P[-1] * 2 - P[-2]

        def tj(ti, a, b):
            return ti + max((b - a).length, 1e-4) ** 0.5

        t0 = 0.0
        t1 = tj(t0, p0, p1)
        t2 = tj(t1, p1, p2)
        t3 = tj(t2, p2, p3)
        ta = tags[i] if tags else None
        tb = tags[(i + 1) % n] if tags else None
        for k in range(n_por):
            t = t1 + (t2 - t1) * k / n_por
            a1 = p0 * ((t1 - t) / (t1 - t0)) + p1 * ((t - t0) / (t1 - t0))
            a2 = p1 * ((t2 - t) / (t2 - t1)) + p2 * ((t - t1) / (t2 - t1))
            a3 = p2 * ((t3 - t) / (t3 - t2)) + p3 * ((t - t2) / (t3 - t2))
            b1 = a1 * ((t2 - t) / (t2 - t0)) + a2 * ((t - t0) / (t2 - t0))
            b2 = a2 * ((t3 - t) / (t3 - t1)) + a3 * ((t - t1) / (t3 - t1))
            out.append(b1 * ((t2 - t) / (t2 - t1)) + b2 * ((t - t1) / (t2 - t1)))
            f = k / n_por
            tg.append(ta.lerp(tb, f) if (ta is not None and tb is not None) else None)
    if not fechado:
        out.append(P[-1])
        tg.append(tags[-1] if tags else None)
    return out, tg


def comprimentos(P, fechado):
    L = [0.0]
    for a, b in zip(P, P[1:]):
        L.append(L[-1] + (b - a).length)
    if fechado:
        L.append(L[-1] + (P[0] - P[-1]).length)
    return L


def tangentes(P, fechado):
    n = len(P)
    T = []
    for i in range(n):
        if fechado:
            d = P[(i + 1) % n] - P[(i - 1) % n]
        else:
            d = P[min(n - 1, i + 1)] - P[max(0, i - 1)]
        T.append(d.normalized() if d.length > 1e-9 else V((1, 0, 0)))
    return T


def rmf(P, T, fechado, up0=None):
    """Quadros minimizando o giro (dupla reflexão). Devolve os vetores 'para cima' (normais)."""
    n = len(P)
    r0 = V(up0) if up0 is not None else (Z if abs(T[0].z) < 0.9 else V((1, 0, 0)))
    r0 = (r0 - T[0] * r0.dot(T[0])).normalized()
    R = [r0]
    for i in range(n - 1):
        v1 = P[i + 1] - P[i]
        c1 = v1.dot(v1)
        if c1 < 1e-12:
            R.append(R[-1].copy())
            continue
        rL = R[i] - v1 * (2 / c1 * v1.dot(R[i]))
        tL = T[i] - v1 * (2 / c1 * v1.dot(T[i]))
        v2 = T[i + 1] - tL
        c2 = v2.dot(v2)
        r = rL - v2 * (2 / c2 * v2.dot(rL)) if c2 > 1e-12 else rL
        R.append((r - T[i + 1] * r.dot(T[i + 1])).normalized())
    if fechado and n > 2:
        v1 = P[0] - P[-1]
        c1 = v1.dot(v1)
        rL = R[-1] - v1 * (2 / c1 * v1.dot(R[-1]))
        tL = T[-1] - v1 * (2 / c1 * v1.dot(T[-1]))
        v2 = T[0] - tL
        c2 = v2.dot(v2)
        r_fim = rL - v2 * (2 / c2 * v2.dot(rL)) if c2 > 1e-12 else rL
        r_fim = (r_fim - T[0] * r_fim.dot(T[0])).normalized()
        ang = math.atan2(T[0].dot(r_fim.cross(R[0])), r_fim.dot(R[0]))
        R = [(Matrix.Rotation(ang * i / n, 3, T[i]) @ R[i]).normalized() for i in range(n)]
    return R


def varre(P, U, perfil, cor="branco", fechado=False, perfil_fechado=True, escalas=None, tampas=False, mat="atlas",
          nome="varre", liso=True, angulo=60, T=None, cores_aneis=None):
    """Varre o perfil 2D [(lado, cima), ...] pelos pontos P com os vetores para cima U. 'lado' é para a direita de quem
    anda. cores_aneis: lista de cores por trecho (listras)."""
    n = len(P)
    T = T or tangentes(P, fechado)
    bm = bmesh.new()
    aneis = []
    for i in range(n):
        t = T[i]
        u = (U[i] - t * U[i].dot(t)).normalized()
        lado = t.cross(u)
        s = escalas[i] if escalas else 1.0
        aneis.append([bm.verts.new(P[i] + lado * (a * s) + u * (b * s)) for a, b in perfil])
    m = len(perfil)
    faces_trecho = []
    rng = range(n) if fechado else range(n - 1)
    for i in rng:
        A, B = aneis[i], aneis[(i + 1) % n]
        fs = []
        for k in range(m if perfil_fechado else m - 1):
            k2 = (k + 1) % m
            fs.append(bm.faces.new((A[k], A[k2], B[k2], B[k])))
        faces_trecho.append(fs)
    if tampas and not fechado and perfil_fechado:
        bm.faces.new(aneis[0][::-1])
        bm.faces.new(aneis[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    ob = obj(nome, bm, cor, mat, liso, angulo)
    if cores_aneis:
        me = ob.data
        idx = 0
        uv = me.uv_layers["UVMap"].data
        for ti, fs in enumerate(faces_trecho):
            c = cores_aneis[ti % len(cores_aneis)] if callable(cores_aneis) is False else cores_aneis(ti)
            u_ = mb.uv_cor(c)
            for _ in fs:
                p = me.polygons[idx]
                for li in p.loop_indices:
                    uv[li].uv = u_
                idx += 1
    return ob


def circulo_perfil(r, lados=8, rot=None):
    rot = math.pi / lados if rot is None else rot
    return [(r * math.cos(rot + 2 * math.pi * k / lados), r * math.sin(rot + 2 * math.pi * k / lados))
            for k in range(lados)]


def tubo(pts, r, cor="metal", lados=8, fechado=False, escalas=None, tampas=True, nome="tubo", suave=0,
         cores_aneis=None):
    """Tubo por pontos (com Catmull-Rom se suave > 0: pontos por trecho)."""
    P = [V(p) for p in pts]
    if suave:
        P, _ = catmull(P, fechado, suave)
        if escalas:
            m = len(pts) if fechado else len(pts) - 1
            esc = []
            for i in range(m):
                for k in range(suave):
                    f = k / suave
                    esc.append(escalas[i] * (1 - f) + escalas[(i + 1) % len(pts)] * f)
            if not fechado:
                esc.append(escalas[-1])
            escalas = esc
    T = tangentes(P, fechado)
    U = rmf(P, T, fechado)
    return varre(P, U, circulo_perfil(r, lados), cor, fechado, True, escalas, tampas and not fechado, nome=nome,
                 T=T, cores_aneis=cores_aneis)


def reamostra(P, fechado, passo, extra=None):
    """Reamostra por comprimento: devolve (pontos, índices fracionários)."""
    L = comprimentos(P, fechado)
    tot = L[-1]
    n = max(2, int(round(tot / passo)))
    Q, I = [], []
    j = 0
    m = len(P)
    for k in range(n if fechado else n + 1):
        s = tot * k / n
        while j < len(L) - 2 and L[j + 1] < s:
            j += 1
        f = (s - L[j]) / max(1e-9, L[j + 1] - L[j])
        a, b = P[j % m], P[(j + 1) % m]
        Q.append(a.lerp(b, f))
        I.append(j + f)
    return Q, I


# ======================================================================================================================
# Montanha-russa
# ======================================================================================================================
def looping(inicio, direcao, R, w, n=24):
    """Pontos de controle de um looping: entra em 'inicio' andando em 'direcao' (2D), sobe de costas para o centro e sai
    deslocado w para o lado (positivo = para a esquerda de quem anda). Cada ponto leva o centro (para o 'para cima')."""
    d = V((direcao[0], direcao[1], 0)).normalized()
    lat = V((-d.y, d.x, 0))
    p0 = V(inicio)
    out = []
    def sm(x):
        x = max(0.0, min(1.0, x))
        return x * x * (3 - 2 * x)

    jan = 0.75  # o desvio lateral acontece só no alto (trilho de cabeça para baixo, quase plano): sem torção
    for k in range(n + 1):
        th = 2 * math.pi * k / n
        dd = lat * (w * sm((th - (math.pi - jan)) / (2 * jan)))
        p = p0 + d * (R * math.sin(th)) + Z * (R * (1 - math.cos(th))) + dd
        c = p0 + Z * R + dd
        out.append((tuple(p), tuple(c)))
    return out


class Rota:
    """Monta o caminho de uma montanha-russa por trechos: retas (onde sobe e desce, com a inclinação começando e
    terminando em zero) e curvas planas (sem subir), mais loopings. Curva feita subindo ou descendo faz o referencial
    que acompanha o trilho (o da página) tombar de lado; assim o carrinho fica sempre em pé fora dos loopings."""

    def __init__(self, x, y, z, rumo):
        self.p = V((x, y, z))
        self.a = math.radians(rumo)  # graus a partir de +X, anti-horário
        self.pts = [(x, y, z)]

    def d(self):
        return V((math.cos(self.a), math.sin(self.a), 0))

    def reta(self, L, z1=None, passo=1.0, lombada=0.0):
        z0 = self.p.z
        z1 = z0 if z1 is None else z1
        n = max(1, int(round(L / passo)))
        d = self.d()
        for k in range(1, n + 1):
            f = k / n
            sm = f * f * (3 - 2 * f)
            z = z0 + (z1 - z0) * sm + lombada * math.sin(math.pi * f) ** 2
            q = self.p + d * (L * f)
            self.pts.append((q.x, q.y, z))
        self.p = self.p + d * L
        self.p.z = z1
        return self

    def curva(self, r, graus, passo=1.0, dz=0.0):
        """Curva de raio r; graus > 0 vira à esquerda. dz: sobe (ou desce) durante a curva — curva inclinada faz o
        referencial tombar; usada de propósito para desfazer a torção que cada looping deixa."""
        sg = 1 if graus > 0 else -1
        d = self.d()
        c = self.p + V((-d.y, d.x, 0)) * (sg * r)
        a0 = math.atan2(self.p.y - c.y, self.p.x - c.x)
        ang = math.radians(abs(graus))
        n = max(2, int(r * ang / passo))
        z0 = self.p.z
        for k in range(1, n + 1):
            t = a0 + sg * ang * k / n
            f = k / n
            self.pts.append((c.x + r * math.cos(t), c.y + r * math.sin(t), z0 + dz * f * f * (3 - 2 * f)))
        t = a0 + sg * ang
        self.p = V((c.x + r * math.cos(t), c.y + r * math.sin(t), z0 + dz))
        self.a += sg * ang
        return self

    def looping(self, R, w, n=24):
        d = self.d()
        lp = looping(tuple(self.p), (d.x, d.y), R, w, n)
        self.pts += lp[1:]
        q = V(lp[-1][0])
        self.p = q
        return self

    def fecha(self):
        """Pontos de controle (o último, igual ao primeiro, sai: o trilho é fechado)."""
        out = list(self.pts)
        if (V(out[-1][0] if isinstance(out[-1][0], tuple) else out[-1]) - V(self.pts[0])).length < 0.3:
            out.pop()
        return out


class Trilho:
    """Trilho fechado de montanha-russa. ctrl: lista de (x, y, z) ou ((x, y, z), centro_do_looping)."""

    def __init__(self, ctrl, inclina=1.4, inclina_max=0.5, n_por=16):
        pts, tags = [], []
        for c in ctrl:
            if len(c) == 2 and isinstance(c[0], (tuple, list)):
                pts.append(V(c[0]))
                tags.append(V(c[1]))
            else:
                pts.append(V(c))
                tags.append(None)
        self.ctrl = pts
        P, TG = catmull(pts, True, n_por, tags)
        # reamostra fino (10 cm) para os quadros ficarem lisos
        P2, I = reamostra(P, True, 0.1)
        m = len(P)
        TG2 = []
        for fi in I:
            j = int(fi) % m
            f = fi - int(fi)
            a, b = TG[j], TG[(j + 1) % m]
            TG2.append(a.lerp(b, f) if (a is not None and b is not None) else None)
        self.P = P2
        self.tag = TG2
        self.n = len(P2)
        self.L = comprimentos(P2, True)
        self.tot = self.L[-1]
        self.T = tangentes(P2, True)
        # referenciais que acompanham o trilho, iguais aos que a página usa no percurso: o "em cima" começa em Z e vai
        # sendo projetado de ponto a ponto (no looping fica de cabeça para baixo no alto); o giro que sobra ao fechar a
        # volta é repartido pelo comprimento. Assim o trilho desenhado e o carrinho animado têm a mesma inclinação.
        n = self.n
        T = self.T
        U = [(Z - T[0] * T[0].z).normalized()]
        for i in range(1, n):
            u = U[-1] - T[i] * U[-1].dot(T[i])
            U.append(u.normalized() if u.length > 1e-6 else U[-1].copy())
        fim = U[-1]
        ini = (U[0] - T[-1] * U[0].dot(T[-1])).normalized()
        erro = math.acos(max(-1.0, min(1.0, fim.dot(ini))))
        if fim.cross(ini).dot(T[-1]) < 0:
            erro = -erro
        self.erro_fechamento = math.degrees(erro)
        self.U = [(Matrix.Rotation(erro * self.L[i] / self.tot, 3, T[i]) @ U[i]).normalized() for i in range(n)]

    def idx(self, s):
        s = s % self.tot
        lo, hi = 0, self.n
        while hi - lo > 1:
            m = (lo + hi) // 2
            if self.L[m] <= s:
                lo = m
            else:
                hi = m
        f = (s - self.L[lo]) / max(1e-9, self.L[lo + 1] - self.L[lo])
        return lo, f

    def em(self, s):
        i, f = self.idx(s)
        j = (i + 1) % self.n
        p = self.P[i].lerp(self.P[j], f)
        t = self.T[i].lerp(self.T[j], f).normalized()
        u = self.U[i].lerp(self.U[j], f)
        u = (u - t * u.dot(t)).normalized()
        tg = self.tag[i] if (self.tag[i] is not None and self.tag[j] is not None) else None
        return p, t, u, tg

    def amostras_geo(self, passo_max=4.0, ang_max=8.0):
        """Índices densos para os anéis: mais onde curva."""
        idx = [0]
        for i in range(1, self.n):
            a = idx[-1]
            ang = math.degrees(self.T[a].angle(self.T[i], 0.0))
            dang = math.degrees(self.U[a].angle(self.U[i], 0.0))
            if ang > ang_max or dang > ang_max * 1.4 or self.L[i] - self.L[a] > passo_max:
                idx.append(i)
        return idx

    def malha(self, bitola=0.9, r_trilho=0.085, cor_trilho="magenta", cor_espinha="vinho", cor_dormente="vinho",
              r_espinha=0.15, prof_espinha=0.42, passo_dormente=1.6, lados=6, espinha=True, neon=None):
        idx = self.amostras_geo()
        P = [self.P[i] for i in idx]
        U = [self.U[i] for i in idx]
        T = [self.T[i] for i in idx]
        objs = []
        for sg in (-1, 1):
            Pl = [p + t.cross(u) * (sg * bitola / 2) for p, t, u in zip(P, T, U)]
            objs.append(varre(Pl, U, circulo_perfil(r_trilho, lados), cor_trilho, True, nome="trilho", T=T, angulo=75))
        if espinha:
            Pe = [p - u * prof_espinha for p, u in zip(P, U)]
            objs.append(varre(Pe, U, circulo_perfil(r_espinha, 5), cor_espinha, True, nome="espinha", T=T))
        if neon:  # filete luminoso dos dois lados da espinha (contorno do brinquedo à noite)
            for sg in (-1, 1):
                Pn = [p - u * (prof_espinha - 0.02) + t.cross(u) * (sg * (r_espinha + 0.03)) for p, t, u in zip(P, T, U)]
                tn = varre(Pn, U, [(0.0, -0.05), (0.0, 0.05)], None, True, perfil_fechado=False, nome="neon", T=T,
                           liso=False)
                mb.pinta(tn, None, mat=neon)
                objs.append(tn)
        ndorm = int(self.tot / passo_dormente)
        for k in range(ndorm):
            p, t, u, _ = self.em(k * self.tot / ndorm)
            lado = t.cross(u)
            objs.append(caixa_eixos(p - u * 0.07, lado, t, u, (bitola + 0.06, 0.14, 0.09), cor_dormente,
                                    nome="dormente"))
            if espinha and k % 4 == 0:
                objs.append(caixa_eixos(p - u * (prof_espinha / 2 + 0.04), lado, t, u,
                                        (0.1, 0.1, prof_espinha - 0.05), cor_dormente, nome="dormente"))
        return mb.junta(objs, "trilho")

    def pontos_percurso(self, passo=0.5, alto=0.09):
        """Pontos do percurso (topo do trilho) a cada 'passo', nos eixos do glTF."""
        n = max(4, int(round(self.tot / passo)))
        out = []
        for k in range(n):
            p, t, u, _ = self.em(k * self.tot / n)
            q = p + u * alto
            out.append([round(q.x, 3), round(q.z, 3), round(-q.y, 3)])
        return out

    def matriz_carro(self, s, alto=0.09):
        p, t, u, _ = self.em(s)
        return matriz_frente(p + u * alto, t, u)


def pilar(topo, z_chao, r=0.14, cor="cinza_claro", cor_sapata="concreto_escuro", lados=8, sapata=True):
    """Pilar vertical do topo até o chão, com sapata."""
    x, y, zt = topo
    objs = [mb.cilindro(r, zt - z_chao + 0.05, x=x, y=y, z=z_chao - 0.05, cor=cor, seg=lados, bisel=0.0, nome="pilar",
                        tampas=False)]
    if sapata:
        objs.append(mb.caixa(r * 4.2, r * 4.2, 0.32, x=x, y=y, z=z_chao - 0.08, cor=cor_sapata, bisel=0.0,
                             nome="sapata", liso=False))
    return objs


def pilar_a(topo, lado, z_chao, abertura, r=0.13, cor="branco", cor_sapata="concreto_escuro", lados=8):
    """Pilar em A: duas pernas do topo até o chão, abertas para os lados (lado = vetor horizontal)."""
    lado = V((lado[0], lado[1], 0)).normalized()
    t = V(topo)
    objs = []
    for sg in (-1, 1):
        pe = V((t.x, t.y, z_chao)) + lado * (sg * abertura)
        objs.append(barra(pe + V((0, 0, -0.05)), t, r, cor, lados, nome="perna"))
        objs.append(mb.caixa(r * 4.0, r * 4.0, 0.3, x=pe.x, y=pe.y, z=z_chao - 0.08, cor=cor_sapata, bisel=0.0,
                             nome="sapata", liso=False))
    if t.z - z_chao > 5:  # travessa no meio
        zm = z_chao + (t.z - z_chao) * 0.45
        f = 1 - (zm - z_chao) / (t.z - z_chao)
        a = V((t.x, t.y, zm)) - lado * (abertura * f)
        b = V((t.x, t.y, zm)) + lado * (abertura * f)
        objs.append(barra(a, b, r * 0.7, cor, lados, nome="travessa"))
    return objs


# ======================================================================================================================
# Terreno e caminhos
# ======================================================================================================================
def superelipse(a, b, n=4.0, pontos=48, cx=0.0, cy=0.0, ruido=None):
    out = []
    for k in range(pontos):
        t = 2 * math.pi * k / pontos
        c, s = math.cos(t), math.sin(t)
        r = 1.0 + (ruido(t) if ruido else 0.0)
        out.append((cx + a * r * math.copysign(abs(c) ** (2 / n), c), cy + b * r * math.copysign(abs(s) ** (2 / n), s)))
    return out


def monte(contornos, cor="marrom_claro", cor_lado=None, z_fundo=-0.05, nome="monte"):
    """Monte em anéis: contornos [(pts2d, z), ...] de fora para dentro, todos com o mesmo número de pontos. Topo fechado
    no último anel. A borda do primeiro anel desce até z_fundo."""
    bm = bmesh.new()
    aneis = []
    pts0, z0 = contornos[0]
    aneis.append([bm.verts.new((p[0], p[1], z_fundo)) for p in pts0])
    for pts, z in contornos:
        aneis.append([bm.verts.new((p[0], p[1], z)) for p in pts])
    n = len(pts0)
    for A, B in zip(aneis, aneis[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((A[i], A[j], B[j], B[i]))
    f = bm.faces.new(aneis[-1])
    bmesh.ops.triangulate(bm, faces=[f], quad_method="BEAUTY", ngon_method="BEAUTY")
    ob = obj(nome, bm, cor, liso=True, angulo=35)
    if cor_lado:
        mb.pinta_onde(ob, cor_lado, lambda c, nn: nn.z < 0.75)
    return ob


def pedra(x, y, z, l, p, a, cor="marrom", semente=0, rot=0.0, n=14, topo_plano=True, nome="pedra"):
    """Pedra facetada: fecho convexo de pontos num elipsoide (topo achatado como na referência)."""
    rnd = random.Random(semente)
    bm = bmesh.new()
    for k in range(n):
        u, v = rnd.uniform(0, 2 * math.pi), rnd.uniform(-0.2, 1.0)
        rr = math.sqrt(max(0.0, 1 - v * v))
        px, py, pz = rr * math.cos(u), rr * math.sin(u), v
        if topo_plano:
            pz = min(pz, 0.75)
        bm.verts.new((px * l / 2 * rnd.uniform(0.85, 1.05), py * p / 2 * rnd.uniform(0.85, 1.05), (pz + 0.2) / 0.95 * a))
    for k in range(6):  # base
        u = 2 * math.pi * k / 6 + rnd.uniform(0, 0.4)
        bm.verts.new((math.cos(u) * l / 2 * 1.02, math.sin(u) * p / 2 * 1.02, -0.05))
    bmesh.ops.convex_hull(bm, input=bm.verts[:])
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(3), verts=bm.verts[:], edges=bm.edges[:])
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.transform(Matrix.Translation((x, y, z)) @ Matrix.Rotation(rot, 4, "Z"))
    return obj(nome, bm, cor, liso=False)


def faixa_plana(pts, larg, z, cor, fechado=False, nome="faixa"):
    """Fita plana ao longo de uma linha 2D (normais para cima)."""
    P = [V((p[0], p[1], z)) for p in pts]
    T = tangentes(P, fechado)
    U = [Z] * len(P)
    ob = varre(P, U, [(-larg / 2, 0.0), (larg / 2, 0.0)], cor, fechado, perfil_fechado=False, nome=nome, liso=False,
               T=T)
    if sum(pp.normal.z for pp in ob.data.polygons) < 0:
        ob.data.flip_normals()
    return ob


def contorno_ret(cx, cy, hx, hy, r, seg=8):
    return [(cx + px, cy + py) for px, py in mb.ret_arredondado(2 * hx, 2 * hy, r, seg)]


def desloca_contorno(pts, d):
    """Desloca um contorno fechado anti-horário d para fora (d < 0 para dentro)."""
    n = len(pts)
    out = []
    for i in range(n):
        a, b, c = V(pts[i - 1]), V(pts[i]), V(pts[(i + 1) % n])
        t1 = (b - a).normalized()
        t2 = (c - b).normalized()
        n1 = V((t1.y, -t1.x))
        n2 = V((t2.y, -t2.x))
        m = (n1 + n2)
        m = m.normalized() if m.length > 1e-6 else n1
        k = d / max(0.3, m.dot(n1))
        out.append((b.x + m.x * k, b.y + m.y * k))
    return out


def caminho_anel(centro_linha, larg=2.6, z=0.0, juntas=0.6, nome="caminho"):
    """Caminho de ladrilho rosado sobre a grama ao longo de uma linha fechada (anti-horária): piso, juntas, linha do
    meio e guias baixas de concreto nos dois lados, como o piso_grama_caminho."""
    fora = desloca_contorno(centro_linha, larg / 2)
    dentro = desloca_contorno(centro_linha, -larg / 2)
    objs = [anel_plano(fora, dentro, z + 0.003, "piso_rosado", nome="ladrilho")]
    P = [V((p[0], p[1], 0)) for p in centro_linha]
    L = comprimentos(P, True)
    tot = L[-1]
    nj = int(tot / juntas)
    Q, _ = reamostra(P, True, tot / nj)
    T = tangentes(Q, True)
    for q, t in zip(Q, T):
        ld = V((-t.y, t.x, 0))
        a, b = q - ld * (larg / 2 - 0.02), q + ld * (larg / 2 - 0.02)
        bm = bmesh.new()
        w = t * 0.015
        vs = [bm.verts.new((v.x, v.y, z + 0.005)) for v in (a - w, b - w, b + w, a + w)]
        bm.faces.new(vs)
        objs.append(obj("junta", bm, "madeira_rosada", liso=False))
    objs.append(faixa_plana(centro_linha, 0.03, z + 0.0055, "madeira_rosada", fechado=True, nome="linha"))
    for d in (larg / 2 + 0.1, -larg / 2 - 0.1):
        lin = desloca_contorno(centro_linha, d)
        P2 = [V((p[0], p[1], 0)) for p in lin]
        objs.append(varre(P2, [Z] * len(P2), [(-0.1, -0.05), (0.1, -0.05), (0.08, 0.035), (-0.08, 0.035)], "concreto",
                          True, nome="guia", liso=False))
    ob = mb.junta(objs, nome)
    for p in ob.data.polygons:
        if p.normal.z < -0.5 and p.center.z > z - 0.01 and p.center.z < z + 0.01:
            pass
    return ob


def caminho_reto(x0, y0, x1, y1, larg=2.6, z=0.0, juntas=0.6, guia_inicio=True, guia_fim=True, nome="caminho"):
    """Trecho reto de caminho (entrada da área até a borda), igual ao piso_grama_caminho."""
    a, b = V((x0, y0, 0)), V((x1, y1, 0))
    t = (b - a).normalized()
    ld = V((-t.y, t.x, 0))
    L = (b - a).length
    objs = []
    bm = bmesh.new()
    vs = [bm.verts.new((v.x, v.y, z + 0.003)) for v in (a - ld * larg / 2, a + ld * larg / 2, b + ld * larg / 2,
                                                          b - ld * larg / 2)]
    bm.faces.new(vs)
    o = obj("ladrilho", bm, "piso_rosado", liso=False)
    if o.data.polygons[0].normal.z < 0:
        o.data.flip_normals()
    objs.append(o)
    nj = max(1, int(L / juntas))
    for k in range(1, nj):
        q = a + t * (L * k / nj)
        bm = bmesh.new()
        w = t * 0.015
        p1, p2 = q - ld * (larg / 2 - 0.02), q + ld * (larg / 2 - 0.02)
        vs = [bm.verts.new((v.x, v.y, z + 0.005)) for v in (p1 - w, p2 - w, p2 + w, p1 + w)]
        bm.faces.new(vs)
        o = obj("junta", bm, "madeira_rosada", liso=False)
        if o.data.polygons[0].normal.z < 0:
            o.data.flip_normals()
        objs.append(o)
    objs.append(faixa_plana([(a.x, a.y), (b.x, b.y)], 0.03, z + 0.0055, "madeira_rosada", nome="linha"))
    for sg in (-1, 1):
        q0 = a + ld * (sg * (larg / 2 + 0.1))
        q1 = b + ld * (sg * (larg / 2 + 0.1))
        objs.append(cb.laje(_ret_linha(q0, q1, 0.2), 0.035, "concreto", z_fundo=-0.05, nome="guia"))
    return mb.junta(objs, nome)


def _ret_linha(a, b, larg):
    t = (V(b) - V(a)).normalized()
    ld = V((-t.y, t.x, 0)) * (larg / 2)
    return [(a.x - ld.x, a.y - ld.y), (b.x - ld.x, b.y - ld.y), (b.x + ld.x, b.y + ld.y), (a.x + ld.x, a.y + ld.y)]


def anel_plano(fora, dentro, z, cor, nome="anel"):
    n = len(fora)
    bm = bmesh.new()
    F = [bm.verts.new((p[0], p[1], z)) for p in fora]
    D = [bm.verts.new((p[0], p[1], z)) for p in dentro]
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((F[i], F[j], D[j], D[i]))
    ob = obj(nome, bm, cor, liso=False)
    if sum(p.normal.z for p in ob.data.polygons) < 0:
        ob.data.flip_normals()
    return ob


def plano(pts, z, cor, mat="atlas", nome="plano"):
    """Face plana (normal para cima) com o contorno dado, triangulada."""
    pts = mb._ccw([tuple(p) for p in pts])
    bm = bmesh.new()
    f = bm.faces.new([bm.verts.new((p[0], p[1], z)) for p in pts])
    if len(pts) > 4:
        bmesh.ops.triangulate(bm, faces=[f], quad_method="BEAUTY", ngon_method="BEAUTY")
    ob = obj(nome, bm, cor, mat, liso=False)
    if sum(p.normal.z for p in ob.data.polygons) < 0:
        ob.data.flip_normals()
    return ob


def tufo(x, y, cor="grama_escura", alt=0.32, z=0.0):
    objs = []
    for j in range(4):
        ang = j * 2 * math.pi / 4 + 0.4
        o = mb.cilindro(0.07, alt * (0.75 + 0.25 * (j % 2)), r2=0.006, cor=cor, seg=4, bisel=0.0)
        mb.transforma(o, loc=(x + 0.07 * math.cos(ang), y + 0.07 * math.sin(ang), z - 0.02),
                      rot=[("Z", math.degrees(ang)), ("Y", 14)])
        objs.append(o)
    return objs


def arbusto(x, y, r=0.5, cor="folha", z=0.0):
    return mb.superelipsoide(2 * r, 2 * r, 1.5 * r, x=x, y=y, z=z - 0.05, cor=cor, e=0.8, e_v=0.8, nu=10, nv=5,
                             nome="arbusto")


def arvore(x, y, z=0.0, alt=3.4, r=1.3, cor="folha", cor2="folha_clara"):
    tronco = mb.cilindro(0.14, alt * 0.55, x=x, y=y, z=z, cor="madeira_media", seg=8, r2=0.10, bisel=0.0)
    return [tronco, mb.superelipsoide(2 * r, 2 * r, 1.7 * r, x=x, y=y, z=z + alt * 0.42, cor=cor, e=0.85, e_v=0.85,
                                      nu=12, nv=6, nome="copa"),
            mb.superelipsoide(1.3 * r, 1.3 * r, 1.1 * r, x=x + 0.35 * r, y=y - 0.25 * r, z=z + alt * 0.42 + 1.1 * r,
                              cor=cor2, e=0.85, e_v=0.85, nu=10, nv=5, nome="copa")]


def poste_parque(x, y, z=0.0, alt=4.4, cor="grafite", bracos=2, ang=0.0):
    """Poste de praça com lanternas (luz). Devolve (estrutura, lampadas)."""
    est = [mb.cilindro(0.16, 0.5, x=x, y=y, z=z, cor=cor, seg=8, r2=0.12, bisel=0.0),
           mb.cilindro(0.075, alt - 0.3, x=x, y=y, z=z + 0.4, cor=cor, seg=8, bisel=0.0),
           bola(x, y, z + alt + 0.12, 0.11, cor, sub=0)]
    luz = []
    for k in range(bracos):
        a = ang + 2 * math.pi * k / bracos
        dx, dy = math.cos(a), math.sin(a)
        p0 = V((x, y, z + alt - 0.1))
        p1 = V((x + dx * 0.55, y + dy * 0.55, z + alt + 0.05))
        est.append(barra(p0, p1, 0.035, cor, 6, nome="braco"))
        est.append(mb.cilindro(0.13, 0.06, x=p1.x, y=p1.y, z=p1.z - 0.06, cor=cor, seg=6, bisel=0.0))
        luz.append(bola(p1.x, p1.y, p1.z - 0.24, 0.17, None, mat="luz", sub=1, esc=(1, 1, 1.15)))
        est.append(mb.cilindro(0.07, 0.08, x=p1.x, y=p1.y, z=p1.z - 0.46, cor=cor, seg=6, bisel=0.0))
    return est, luz


def grade(pts, alt=1.1, passo=1.4, cor="branco", r=0.035, fechado=False, nome="grade"):
    """Gradil: corrimão + travessa + montantes ao longo de uma linha 3D (z dos pontos = piso)."""
    P = [V(p) for p in pts]
    if fechado:
        P = P + [P[0]]
    objs = [tubo([p + V((0, 0, alt)) for p in P], r, cor, 6, nome="corrimao"),
            tubo([p + V((0, 0, alt * 0.5)) for p in P], r * 0.7, cor, 6, nome="travessa")]
    L = comprimentos(P, False)
    n = max(1, int(L[-1] / passo))
    Q, _ = reamostra(P, False, L[-1] / n)
    for q in Q:
        objs.append(mb.cilindro(r, alt, x=q.x, y=q.y, z=q.z, cor=cor, seg=6, bisel=0.0))
    return mb.junta(objs, nome)
