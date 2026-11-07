"""Props grandes da biblioteca, feitos aqui (não são objetos de mão do catálogo).

carrinho_bebe: carrinho com moisés para recém-nascido. Alça na altura das mãos de quem empurra; o moisés é oco (casca
por fora, forro por dentro, borda com espessura e colchão no fundo), com capota na ponta da cabeça (lado da alça), e
devolve o "berço": o lugar e a orientação em que o recém-nascido deita dentro dele (deita_recem faz isso com um corpo
recem_* do arquivo-mestre). Armação de tubos, quatro rodas com pneu, cubo e raios, e uma cestinha embaixo.
"""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

V = Vector


def _rgb(h):
    h = h.lstrip("#")
    return tuple((int(h[i:i + 2], 16) / 255) ** 2.2 for i in (0, 2, 4))


def material(nome, hexa, rug=0.6, metal=0.0):
    m = bpy.data.materials.get(nome) or bpy.data.materials.new(nome)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*_rgb(hexa), 1)
    b.inputs["Roughness"].default_value = rug
    b.inputs["Metallic"].default_value = metal
    return m


def _objeto(nome, bm, mat, liso=True):
    me = bpy.data.meshes.new(nome)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(me)
    bm.free()
    for f in me.polygons:
        f.use_smooth = liso
    me.materials.append(mat)
    ob = bpy.data.objects.new(nome, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def _tubo(bm, a, b, r=0.012, seg=10):
    d = b - a
    L = d.length
    if L < 1e-6:
        return
    r_ = bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=L)
    rot = V((0, 0, 1)).rotation_difference(d.normalized()).to_matrix().to_4x4()
    for v in r_["verts"]:
        v.co = (a + b) / 2 + (rot @ v.co.to_4d()).to_3d()


def _curva(bm, pts, r=0.012):
    for a, b in zip(pts, pts[1:]):
        _tubo(bm, a, b, r)
    for p in pts[1:-1]:  # juntas lisas
        s = bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=r)
        for v in s["verts"]:
            v.co += p


def _superelipse(t, a, b, n=3.2):
    c, s = math.cos(t), math.sin(t)
    return a * math.copysign(abs(c) ** (2 / n), c), b * math.copysign(abs(s) ** (2 / n), s)


def carrinho_bebe(alca_esq, alca_dir, frente, cores=None):
    """Carrinho com moisés. alca_esq/alca_dir: pontas da alça (onde as mãos seguram); frente: para onde ele anda.
    Devolve (objetos, berco), berco = Matrix 4x4 do colchão: origem no meio da superfície do colchão, x para a frente
    (pés do bebê), y para o lado, z para cima. A cabeça fica na ponta da alça, embaixo da capota."""
    cor = {"casca": "#F07AB0", "forro": "#FFD1E3", "faixa": "#3FC1C9", "colchao": "#FFF6EC", "armacao": "#3E5A72",
           "pneu": "#26282E", "cubo": "#C9CED6", "cesta": "#2B2D33", **(cores or {})}
    meio = (alca_esq + alca_dir) / 2
    lado = alca_dir - alca_esq
    lado.z = 0
    larg_alca = max(lado.length, 0.36)
    lado.normalize()
    fr = V((frente.x, frente.y, 0)).normalized()
    up = V((0, 0, 1))
    h = meio.z

    def P(f, s, z):  # frente (a partir da alça), lado, altura absoluta
        q = meio + fr * f + lado * s
        q.z = z
        return q

    # ---- moisés: anéis de superelipse do fundo arredondado até a borda
    f0, L2, W2 = 0.62, 0.32, 0.2  # centro (para a frente), meio comprimento, meia largura
    z_fundo, z_borda = 0.5, 0.76
    nseg = 48
    aneis = []  # (altura, escala): fundo arredondado, paredes um pouco abauladas, borda
    for k in range(9):
        t = k / 8
        zz = z_fundo + (z_borda - z_fundo) * t
        esc = 0.78 + 0.22 * math.sin(min(t / 0.45, 1) * math.pi / 2) - 0.03 * max(0, t - 0.6) / 0.4
        aneis.append((zz, esc))

    def anel(bm, zz, esc, inset=0.0):
        return [bm.verts.new(P(f0 + _superelipse(2 * math.pi * j / nseg, L2 * esc - inset, W2 * esc - inset)[0],
                               _superelipse(2 * math.pi * j / nseg, L2 * esc - inset, W2 * esc - inset)[1], zz))
                for j in range(nseg)]

    def costura(bm, A, B, fs):
        for j in range(nseg):
            k = (j + 1) % nseg
            fs.append(bm.faces.new((A[j], A[k], B[k], B[j])))

    def tampa(bm, A, zz, fs, para_cima):
        c = bm.verts.new(sum((v.co for v in A), V()) / len(A))
        c.co.z = zz
        for j in range(nseg):
            k = (j + 1) % nseg
            fs.append(bm.faces.new((A[j], A[k], c) if para_cima else (A[k], A[j], c)))

    esp = 0.018
    bm = bmesh.new()
    fs = []
    fora = [anel(bm, zz, e) for zz, e in aneis]
    for A, B in zip(fora, fora[1:]):
        costura(bm, A, B, fs)
    tampa(bm, fora[0], z_fundo - 0.01, fs, False)
    casca = _objeto("carrinho_casca", bm, material("carrinho_casca", cor["casca"], 0.5))
    bm = bmesh.new()  # forro: por dentro, mais claro, com fundo
    fs = []
    dentro = [anel(bm, zz + 0.012 * (1 - i / 8), e, esp) for i, (zz, e) in enumerate(aneis)]
    for A, B in zip(dentro, dentro[1:]):
        costura(bm, A, B, fs)
    tampa(bm, dentro[0], z_fundo + 0.01, fs, True)
    for f in fs:
        f.normal_flip()
    forro = _objeto("carrinho_forro", bm, material("carrinho_forro", cor["forro"], 0.7))
    bm = bmesh.new()  # borda: liga casca e forro por cima, arredondada
    fs = []
    zb = z_borda
    e_b = aneis[-1][1]
    A = anel(bm, zb, e_b)
    B = anel(bm, zb + 0.012, e_b, esp * 0.5)
    C = anel(bm, zb, e_b, esp)
    costura(bm, A, B, fs)
    costura(bm, B, C, fs)
    borda = _objeto("carrinho_borda", bm, material("carrinho_casca", cor["casca"], 0.5))
    bm = bmesh.new()  # faixa verde-água em volta, logo abaixo da borda
    fs = []
    A = anel(bm, zb - 0.075, aneis[-3][1] + 0.004)
    B = anel(bm, zb - 0.025, aneis[-1][1] + 0.004)
    costura(bm, A, B, fs)
    faixa = _objeto("carrinho_faixa", bm, material("carrinho_faixa", cor["faixa"], 0.45))
    bm = bmesh.new()  # colchão
    z_col = z_fundo + 0.045
    r_ = bmesh.ops.create_cube(bm, size=1.0)
    for v in r_["verts"]:
        x, y, z = v.co
        v.co = P(f0 + x * (2 * L2 * 0.78 - 0.06), y * (2 * W2 * 0.78 - 0.05), z_col - 0.02 + (z + 0.5) * 0.03)
    bmesh.ops.bevel(bm, geom=bm.edges[:], offset=0.012, segments=3, affect="EDGES")
    colchao = _objeto("carrinho_colchao", bm, material("carrinho_colchao", cor["colchao"], 0.85))

    # ---- capota: meia cúpula na ponta da alça (cabeça do bebê), aberta para a frente, com três gomos
    bm = bmesh.new()
    nth, nph = 10, 24
    fc = f0 - L2 * 0.98  # base da capota (ponta de trás do moisés)
    comp, alt = 0.36, 0.26
    grade = []
    for i in range(nth + 1):
        th = math.pi * i / nth  # de um lado ao outro, por cima
        linha = []
        for j in range(nph + 1):
            ph = (math.pi / 2) * j / nph  # da ponta de trás (0) até a frente (90°)
            x = fc + comp * (1 - math.cos(ph)) * 0.95
            raio = math.sin(ph) * 0.15 + 0.85
            y = -math.cos(th) * W2 * aneis[-1][1] * raio
            z = zb + math.sin(th) * alt * (0.35 + 0.65 * math.sin(ph))
            linha.append(bm.verts.new(P(x, y, z)))
        grade.append(linha)
    fs = []
    for i in range(nth):
        for j in range(nph):
            fs.append(bm.faces.new((grade[i][j], grade[i + 1][j], grade[i + 1][j + 1], grade[i][j + 1])))
    bmesh.ops.solidify(bm, geom=fs, thickness=0.012)
    capota = _objeto("carrinho_capota", bm, material("carrinho_casca", cor["casca"], 0.5))
    bm = bmesh.new()  # friso da capota (verde-água na beira da frente)
    pts = [P(fc + comp * 0.95, -math.cos(math.pi * i / 16) * W2 * aneis[-1][1], zb + math.sin(math.pi * i / 16) * alt)
           for i in range(17)]
    _curva(bm, pts, 0.014)
    friso = _objeto("carrinho_friso", bm, material("carrinho_faixa", cor["faixa"], 0.45))

    # ---- armação
    bm = bmesh.new()
    _tubo(bm, P(0, -larg_alca / 2, h), P(0, larg_alca / 2, h), 0.02)  # alça (espuma)
    for s in (-1, 1):
        no = P(0.34, s * 0.215, 0.47)  # junta onde tudo se encontra, logo abaixo do moisés
        _curva(bm, [P(0, s * larg_alca / 2, h), P(0.06, s * 0.215, h - 0.08), no], 0.013)
        _tubo(bm, no, P(0.2, s * 0.25, 0.115), 0.012)  # perna de trás
        _tubo(bm, no, P(0.88, s * 0.215, 0.09), 0.012)  # perna da frente
        _tubo(bm, P(0.36, s * 0.215, 0.475), P(0.86, s * 0.215, 0.475), 0.01)  # apoio do moisés
        _tubo(bm, P(0.86, s * 0.215, 0.475), P(0.88, s * 0.215, 0.09), 0.01)
        s_ = bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=0.022)  # junta
        for v in s_["verts"]:
            v.co += no
    _tubo(bm, P(0.2, -0.26, 0.115), P(0.2, 0.26, 0.115), 0.009)  # eixo de trás
    _tubo(bm, P(0.88, -0.23, 0.09), P(0.88, 0.23, 0.09), 0.009)  # eixo da frente
    armacao = _objeto("carrinho_armacao", bm, material("carrinho_armacao", cor["armacao"], 0.35, 0.6))
    bm = bmesh.new()  # cestinha embaixo
    r_ = bmesh.ops.create_cube(bm, size=1.0)
    for v in r_["verts"]:
        x, y, z = v.co
        v.co = P(0.5 + x * 0.36, y * 0.36, 0.25 + z * 0.08)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.normal.z > 0.9], context="FACES")
    bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.008)
    cesta = _objeto("carrinho_cesta", bm, material("carrinho_cesta", cor["cesta"], 0.8), liso=False)

    # ---- rodas: pneu (toro), cubo e seis raios
    bm_p, bm_c = bmesh.new(), bmesh.new()
    for f_, s_, r in ((0.2, -0.285, 0.11), (0.2, 0.285, 0.11), (0.88, -0.25, 0.09), (0.88, 0.25, 0.09)):
        c = P(f_, s_, r)
        eixo = lado
        u1, u2 = fr, up
        aneis_t = []
        for i in range(24):
            a = 2 * math.pi * i / 24
            d = u1 * math.cos(a) + u2 * math.sin(a)
            aneis_t.append([bm_p.verts.new(c + d * (r - 0.018 + 0.018 * math.cos(2 * math.pi * k / 8))
                                           + eixo * 0.018 * math.sin(2 * math.pi * k / 8)) for k in range(8)])
        for i in range(24):
            for k in range(8):
                A_, B_ = aneis_t[i], aneis_t[(i + 1) % 24]
                bm_p.faces.new((A_[k], B_[k], B_[(k + 1) % 8], A_[(k + 1) % 8]))
        cubo = bmesh.ops.create_cone(bm_c, cap_ends=True, segments=16, radius1=0.028, radius2=0.028, depth=0.04)
        rot = V((0, 0, 1)).rotation_difference(eixo).to_matrix().to_4x4()
        for v in cubo["verts"]:
            v.co = c + (rot @ v.co.to_4d()).to_3d()
        for i in range(6):
            a = 2 * math.pi * i / 6 + 0.3
            d = u1 * math.cos(a) + u2 * math.sin(a)
            _tubo(bm_c, c + d * 0.02, c + d * (r - 0.03), 0.004, 6)
    pneus = _objeto("carrinho_pneus", bm_p, material("carrinho_pneu", cor["pneu"], 0.85))
    cubos = _objeto("carrinho_cubos", bm_c, material("carrinho_cubo", cor["cubo"], 0.3, 0.7))

    objetos = [casca, forro, borda, faixa, colchao, capota, friso, armacao, cesta, pneus, cubos]
    lateral = up.cross(fr).normalized()
    berco = Matrix.Identity(4)
    berco.col[0] = (*fr, 0)
    berco.col[1] = (*lateral, 0)
    berco.col[2] = (*up, 0)
    berco.translation = P(f0 + 0.02, 0, z_col + 0.012)
    return objetos, berco


def deita_recem(c, berco, mostrar=("corpo", "manta", "gorro", "rosto_dormindo")):
    """Deita o recém-nascido c (recem_f ou recem_m, do arquivo-mestre) no berço: de costas, a cabeça para trás (eixo -x
    do berço, embaixo da capota), o rosto para cima. Mostra só as malhas pedidas (o resto do corpo fica escondido)."""
    arm = bpy.data.objects[c]
    lug = arm.parent
    malhas = [o for o in bpy.data.objects if o.type == "MESH" and o.name.startswith(c + "_")]
    for o in malhas:
        o.hide_render = o.hide_viewport = o.name[len(c) + 1:] not in mostrar
    bx, by, bz = (berco.col[i].to_3d() for i in range(3))
    # local z (dos pés à cabeça) -> -x do berço; local -y (frente do rosto) -> +z do berço; local x = y × z
    z_ = -bx
    y_ = -bz
    x_ = y_.cross(z_)
    R = Matrix.Identity(4)
    R.col[0], R.col[1], R.col[2] = (*x_, 0), (*y_, 0), (*z_, 0)
    lug.matrix_world = R
    bpy.context.view_layer.update()
    vis = [o for o in malhas if not o.hide_render]
    pts = [o.matrix_world @ v.co for o in vis for v in o.data.vertices]
    lo = V([min(p[i] for p in pts) for i in range(3)])
    hi = V([max(p[i] for p in pts) for i in range(3)])
    centro = (lo + hi) / 2
    alvo = berco.translation.copy()
    alvo.z += (hi.z - lo.z) / 2
    lug.matrix_world = Matrix.Translation(alvo - centro) @ lug.matrix_world
    bpy.context.view_layer.update()
    return vis
