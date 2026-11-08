"""Base própria da categoria props_praia (por cima de moveis_base e cidade_base, sem alterá-las).

- ItemPP: Item com filhos animados (extras glTF "anima" no nó) e assentos (slots de 0,5 × 0,5 × 0,9 m), inclusive
  presos a um filho animado.
- Malha: bmesh com cor (ou material "m:<nome>") por face.
- Formas de praia: copa de guarda-sol em gomos (listras, franja), prancha de surfe (contorno, espessura, rocker,
  quilhas), palha (camadas de franja), toro (boias), lona listrada esticada num caminho, placas com estampa.
"""
import math

import bpy
import bmesh
from mathutils import Matrix, Vector
from mathutils.geometry import tessellate_polygon

import moveis_base as mb
import cidade_base as cb

V = Vector
H, Q, ZF = cb.H, cb.Q, cb.Z_FUNDO
EST = {}          # nome → função estampa(nome, emissao) (preenchida pelo gerador)


def estampa(nome, emissao=0.0):
    return EST["f"](nome, emissao)


# =====================================================================================================================
# Item com animações e assentos
# =====================================================================================================================
class ItemPP(mb.Item):
    def __init__(self, id_):
        super().__init__(id_)
        self.animados = []
        self.slots_anim = []

    def anima(self, objs, dados, nome, pivo=None):
        objs = [o for o in (objs if isinstance(objs, (list, tuple)) else [objs]) if o is not None]
        ob = mb.junta(objs, nome)
        if pivo is None:
            lo, hi = mb.bbox(ob)
            pivo = (lo + hi) / 2
        d = V(pivo)
        ob.data.transform(Matrix.Translation(-d))
        ob.location = d
        self.animados.append((ob, dict(dados)))
        return ob

    def assento(self, nome, x, y, z, pai=None, tam=(0.5, 0.5, 0.9)):
        if pai:
            self.slots_anim.append((f"slot_{nome}", (x, y, z), tam, pai))
        else:
            self.slot(nome, (x, y, z), tam)

    def n_assentos(self):
        return len([q for q in self.slots + self.slots_anim if "assento" in q[0]])

    def monta(self):
        corpo = super().monta()
        for ob, d in self.animados:
            ob.parent = corpo
            for k, v in d.items():
                ob[k] = v
        for nome, c, t, pai in self.slots_anim:
            po = next(o for o, _ in self.animados if o.name == pai)
            e = bpy.data.objects.new(nome, None)
            e.empty_display_type = "CUBE"
            e.empty_display_size = 0.5
            bpy.context.scene.collection.objects.link(e)
            e.parent = po
            e.location = V(c) - po.location
            e["slot"] = 1
            e["tamanho"] = [round(t[0], 4), round(t[2], 4), round(t[1], 4)]
        self.slots = self.slots + self.slots_anim
        self.slots_anim = []
        bpy.context.view_layer.update()
        return corpo

    def lista_animacoes(self):
        return [dict(nome=ob.name, **d, pivo=mb._gl(ob.location)) for ob, d in self.animados]


# =====================================================================================================================
# Malha com cor por face
# =====================================================================================================================
def _cod(cor):
    if cor.startswith("m:"):
        return -1 - mb.MAT_NOMES.index(cor[2:])
    return mb.NOMES.index(cor)


def area2(pts):
    return sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(pts, pts[1:] + pts[:1])) / 2


def ccw(pts):
    return list(pts) if area2(list(pts)) > 0 else list(pts)[::-1]


class Malha:
    def __init__(self):
        self.bm = bmesh.new()
        self.lay = self.bm.faces.layers.int.new("cor")

    def v(self, p):
        return self.bm.verts.new(p)

    def f(self, vs, cor):
        try:
            fc = self.bm.faces.new(vs)
        except ValueError:
            return None
        fc[self.lay] = _cod(cor)
        return fc

    def poligono(self, pts3, cor, normal=(0, 0, 1)):
        p2 = [V((p[0], p[1], 0)) for p in pts3]
        vs = [self.v(p) for p in pts3]
        nn = V(normal)
        for a, b, c in tessellate_polygon([p2]):
            A, B, C = V(pts3[a]), V(pts3[b]), V(pts3[c])
            if (B - A).cross(C - A).dot(nn) < 0:
                b, c = c, b
            self.f((vs[a], vs[b], vs[c]), cor)

    def grade(self, P, cor_fn, fechado_u=False, inverte=False):
        """P[i][j] = pontos 3D (i ao longo de u, j ao longo de v); cor_fn(i, j) → cor da face (i, j)."""
        nu, nv = len(P), len(P[0])
        vs = [[self.v(p) for p in linha] for linha in P]
        for i in range(nu if fechado_u else nu - 1):
            i2 = (i + 1) % nu
            for j in range(nv - 1):
                q = (vs[i][j], vs[i2][j], vs[i2][j + 1], vs[i][j + 1])
                self.f(q[::-1] if inverte else q, cor_fn(i, j))
        return vs

    def obj(self, nome="malha", liso=False, angulo=35, recalc=True):
        mb.materiais()
        bm = self.bm
        bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
        if recalc:
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        uvl = bm.loops.layers.uv.new("UVMap")
        for fc in bm.faces:
            c = fc[self.lay]
            if c >= 0:
                u, mi = mb.uv_cor(mb.NOMES[c]), 0
            else:
                u, mi = (0.5, 0.5), -1 - c
            fc.material_index = mi
            for lo in fc.loops:
                lo[uvl].uv = u
        me = bpy.data.meshes.new(nome)
        bm.to_mesh(me)
        bm.free()
        if "cor" in me.attributes:
            me.attributes.remove(me.attributes["cor"])
        for n in mb.MAT_NOMES:
            me.materials.append(bpy.data.materials[n])
        if liso:
            me.shade_smooth()
            me.set_sharp_from_angle(angle=math.radians(angulo))
        ob = bpy.data.objects.new(nome, me)
        bpy.context.scene.collection.objects.link(ob)
        return ob


def folha_dupla(P, cor_fn, cor_baixo=None, esp=0.012, nome="folha", liso=True, angulo=50, fechado_u=False):
    """Superfície fina com espessura (lona, tecido): face de cima, face de baixo deslocada pela normal e a borda.
    P[i][j] pontos; cor_fn(i, j) cor de cima; cor_baixo(i, j) (ou a mesma)."""
    nu, nv = len(P), len(P[0])
    Pv = [[V(p) for p in l] for l in P]
    N = [[V((0, 0, 1)) for _ in range(nv)] for _ in range(nu)]
    for i in range(nu):
        for j in range(nv):
            ia, ib = (i - 1) % nu if fechado_u else max(0, i - 1), (i + 1) % nu if fechado_u else min(nu - 1, i + 1)
            ja, jb = max(0, j - 1), min(nv - 1, j + 1)
            du = Pv[ib][j] - Pv[ia][j]
            dv = Pv[i][jb] - Pv[i][ja]
            n = du.cross(dv)
            if n.length > 1e-9:
                N[i][j] = n.normalized()
    m = Malha()
    cb_ = cor_baixo or cor_fn
    cima = [[Pv[i][j] + N[i][j] * esp / 2 for j in range(nv)] for i in range(nu)]
    baixo = [[Pv[i][j] - N[i][j] * esp / 2 for j in range(nv)] for i in range(nu)]
    vc = m.grade(cima, cor_fn, fechado_u)
    vb = m.grade(baixo, cb_, fechado_u, inverte=True)
    # bordas
    imax = nu if fechado_u else nu - 1
    for i in range(imax):
        i2 = (i + 1) % nu
        for j in (0, nv - 1):
            m.f((vc[i][j], vb[i][j], vb[i2][j], vc[i2][j]) if j == 0 else (vc[i2][j], vb[i2][j], vb[i][j], vc[i][j]),
                cor_fn(min(i, nu - 2), min(j, nv - 2)))
    if not fechado_u:
        for i in (0, nu - 1):
            for j in range(nv - 1):
                q = (vc[i][j], vc[i][j + 1], vb[i][j + 1], vb[i][j])
                m.f(q if i == 0 else q[::-1], cor_fn(min(i, nu - 2), j))
    return m.obj(nome, liso=liso, angulo=angulo, recalc=False)


# =====================================================================================================================
# Primitivas leves
# =====================================================================================================================
def bloco(l, p, a, x=0.0, y=0.0, z=0.0, cor="branco", bisel=0.0, mat="atlas"):
    return mb.caixa(l, p, a, x=x, y=y, z=z, cor=cor, bisel=bisel, seg=1, mat=mat)


def haste(p0, p1, r, cor="grafite", lados=6, mat="atlas", r2=None):
    a, b = V(p0), V(p1)
    d = b - a
    ob = mb.cilindro(r, d.length, z=0, cor=cor, seg=lados, bisel=0.0, mat=mat, r2=r2)
    q = V((0, 0, 1)).rotation_difference(d.normalized())
    ob.data.transform(Matrix.Translation(a) @ q.to_matrix().to_4x4())
    return ob


def bola(r, x=0.0, y=0.0, z=0.0, cor=None, mat="atlas", sub=1, esc=(1, 1, 1)):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    bm.transform(Matrix.Translation((x, y, z)) @ Matrix.Diagonal((*esc, 1)))
    return mb._obj("bola", bm, cor, mat, liso=True, angulo=89)


def gira_z(ob, graus, centro=(0, 0, 0)):
    c = V(centro)
    ob.data.transform(Matrix.Translation(c) @ Matrix.Rotation(math.radians(graus), 4, "Z") @ Matrix.Translation(-c))
    return ob


def mover(ob, x=0.0, y=0.0, z=0.0, rot=0.0):
    if rot:
        ob.data.transform(Matrix.Rotation(math.radians(rot), 4, "Z"))
    ob.data.transform(Matrix.Translation((x, y, z)))
    return ob


def roda(ob, eixo, graus, centro=(0, 0, 0)):
    c = V(centro)
    ob.data.transform(Matrix.Translation(c) @ Matrix.Rotation(math.radians(graus), 4, eixo) @ Matrix.Translation(-c))
    return ob


def placa_estampa(mat_idx, w, h, x, y, z, normal=(0, -1, 0), nome="letreiro", uv=((0, 0), (1, 0), (1, 1), (0, 1))):
    """Retângulo vertical com UV próprio, centrado em (x, y, z), olhando para 'normal' (horizontal)."""
    n = V(normal).normalized()
    up = V((0, 0, 1))
    u = (-n).cross(up).normalized()  # direita de quem olha a placa de frente
    c = V((x, y, z))
    bm = bmesh.new()
    vs = [bm.verts.new(c + u * (sx * w / 2) + up * (sy * h / 2)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    f = bm.faces.new(vs)
    f.normal_update()
    uvl = bm.loops.layers.uv.new("UVMap")
    for lo, q in zip(f.loops, uv):
        lo[uvl].uv = q
    mb.materiais()
    for fc in bm.faces:
        fc.material_index = mat_idx
    me = bpy.data.meshes.new(nome)
    bm.to_mesh(me)
    bm.free()
    for nm in mb.MAT_NOMES:
        me.materials.append(bpy.data.materials[nm])
    ob = bpy.data.objects.new(nome, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def placa_chao(mat_idx, w, h, x, y, z, nome="decal"):
    """Retângulo horizontal com UV 0..1 (u ao longo de x)."""
    bm = bmesh.new()
    vs = [bm.verts.new((x + sx * w / 2, y + sy * h / 2, z)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    f = bm.faces.new(vs)
    uvl = bm.loops.layers.uv.new("UVMap")
    for lo, q in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        lo[uvl].uv = q
    mb.materiais()
    f.material_index = mat_idx
    me = bpy.data.meshes.new(nome)
    bm.to_mesh(me)
    bm.free()
    for nm in mb.MAT_NOMES:
        me.materials.append(bpy.data.materials[nm])
    ob = bpy.data.objects.new(nome, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def caixa_estampa(mat_idx, l, esp, a, x, y, z, cor="branco", normal=(0, -1, 0), bisel=0.01, nome="placa"):
    """Placa com espessura (cor da paleta) e a estampa colada na face que olha para 'normal'."""
    n = V(normal)
    if abs(n.x) > 0.5:
        corpo = bloco(esp, l, a, x=x, y=y, z=z, cor=cor, bisel=bisel)
        face = placa_estampa(mat_idx, l * 0.995 - 2 * bisel, a * 0.995 - 2 * bisel, x + n.x * (esp / 2 + 0.002), y,
                             z + a / 2, normal=normal)
    else:
        corpo = bloco(l, esp, a, x=x, y=y, z=z, cor=cor, bisel=bisel)
        face = placa_estampa(mat_idx, l * 0.995 - 2 * bisel, a * 0.995 - 2 * bisel, x, y + n.y * (esp / 2 + 0.002),
                             z + a / 2, normal=normal)
    return mb.junta([corpo, face], nome)


def lampadas(pts3, r=0.05, mat="luz", sub=0):
    return [bola(r, p[0], p[1], p[2], cor=None, mat=mat, sub=sub) for p in pts3]


# =====================================================================================================================
# Formas de praia
# =====================================================================================================================
def toro(R, r, x=0.0, y=0.0, z=0.0, cor="laranja", seg=24, seg_r=10, esc_z=1.0, nome="toro"):
    """Toro deitado (boia) com a base em z (centro do tubo em z + r)."""
    perfil = [(R + r * math.cos(math.radians(a)), r * esc_z * math.sin(math.radians(a)) + r * esc_z)
              for a in range(-90, 271, int(360 / seg_r))]
    ob = mb.torno(perfil, x=x, y=y, z=z, cor=cor, seg=seg, nome=nome, angulo=80)
    return ob


def setores(ob, cores, n, cx=0.0, cy=0.0, fase=0.0, teste=None):
    """Pinta as faces de ob por setor angular em volta de (cx, cy): n setores alternando a lista de cores."""
    for k, cor in enumerate(cores):
        def t(c, nn, k=k):
            if teste and not teste(c, nn):
                return False
            a = (math.degrees(math.atan2(c.y - cy, c.x - cx)) - fase) % 360
            return int(a / (360 / n)) % len(cores) == k
        mb.pinta_onde(ob, cor, t)
    return ob


def copa_gomos(R, alt, n, cores, z0=0.0, sag=0.07, aneis=5, sub=3, franja=0.0, cores_franja=None, esp=0.014,
               cor_baixo=None, ponta=True, perfil_exp=1.7, nome="copa"):
    """Copa de guarda-sol em n gomos (cores alternando), bojuda, com a borda caindo um pouco entre as varetas
    (sag). Topo no centro em z0 + alt; borda em z0. franja > 0: saia ondulada de franja m na borda."""
    P = []
    for i in range(n * sub + 1):
        th = 2 * math.pi * i / (n * sub)
        u = (i % sub) / sub
        afunda = math.sin(math.pi * u)
        linha = []
        for j in range(aneis + 1):
            s = j / aneis
            rr = R * s * (1 - sag * 0.5 * afunda * s ** 2)
            zz = z0 + alt * (1 - s ** perfil_exp) - sag * 0.6 * afunda * s ** 3
            linha.append((rr * math.cos(th), rr * math.sin(th), zz))
        P.append(linha)

    def cor(i, j):
        return cores[(i // sub) % len(cores)]

    copa = folha_dupla(P, cor, (lambda i, j: cor_baixo) if cor_baixo else None, esp=esp, nome=nome, angulo=60)
    ps = [copa]
    if franja:
        cf = cores_franja or cores
        Pf = []
        for i in range(n * sub + 1):
            p = V(P[i][-1])
            th = 2 * math.pi * i / (n * sub)
            onda = 0.35 * franja * (0.5 + 0.5 * math.cos(2 * math.pi * (i % sub) / sub))
            Pf.append([tuple(p + V((0.01 * math.cos(th), 0.01 * math.sin(th), 0))),
                       tuple(p + V((0.03 * math.cos(th), 0.03 * math.sin(th), -franja + onda)))])
        ps.append(folha_dupla(Pf, lambda i, j: cf[(i // sub) % len(cf)], esp=0.008, nome="franja"))
    if ponta:
        ps.append(bola(0.05, 0, 0, z0 + alt + 0.03, cor="branco"))
    # varetas por baixo
    for k in range(n):
        th = 2 * math.pi * k / n
        pts = []
        for j in range(1, aneis + 1, 2):
            s = j / aneis
            pts.append((R * s * math.cos(th) * 0.98, R * s * math.sin(th) * 0.98,
                        z0 + alt * (1 - s ** perfil_exp) - esp))
        ps.append(mb.tubo([(0, 0, z0 + alt - 0.05)] + pts, 0.008, cor="metal_claro", seg=4, raio_curva=0))
    return mb.junta(ps, nome)


def prancha(L, W, T, cor="amarelo", cor2="branco", cor_fundo=None, faixa=None, quilhas=3, longboard=False,
            rocker=None, nt=26, ns=10, cor_quilha=None, nome="prancha"):
    """Prancha de surfe ao longo de +Y (bico em +Y), deque para cima, centrada em (0, 0); a parte de baixo encosta em
    z = 0 no meio. faixa = (t0, t1, cor): faixa transversal; cor2: longarina (stringer)."""
    rocker = rocker if rocker is not None else (0.10 if longboard else 0.13) * L / 2.0
    cor_fundo = cor_fundo or cor

    def meia(t):
        if longboard:
            return W / 2 * max(0.0, math.sin(math.pi * (0.07 + 0.93 * t))) ** 0.33
        return W / 2 * max(0.0, math.sin(math.pi * (0.08 + 0.92 * t))) ** 0.58

    def zc(t):
        return rocker * max(0, (t - 0.62) / 0.38) ** 2.2 + 0.25 * rocker * max(0, (0.18 - t) / 0.18) ** 2

    def esp(t):
        return T * (0.35 + 0.65 * math.sin(math.pi * min(1, max(0, 0.04 + 0.92 * t))) ** 0.7)

    ts = [k / nt for k in range(nt + 1)]
    ss = [-1 + 2 * k / ns for k in range(ns + 1)]
    cima, baixo = [], []
    for t in ts:
        w = max(meia(t), 0.004)
        y = (t - 0.5) * L
        e = esp(t)
        lc, lb = [], []
        for s in ss:
            x = s * w
            zt = zc(t) + 0.32 * e + 0.68 * e * (max(0.0, 1 - abs(s) ** 2.4)) ** 0.5
            zb = zc(t) + 0.32 * e - 0.32 * e * (max(0.0, 1 - abs(s) ** 4)) ** 0.5
            lc.append((x, y, zt))
            lb.append((x, y, zb))
        cima.append(lc)
        baixo.append(lb)
    # costura: as bordas (s = ±1) de cima e de baixo coincidem
    m = Malha()

    def cor_cima(i, j):
        t = (ts[i] + ts[i + 1]) / 2
        s = (ss[j] + ss[j + 1]) / 2
        if faixa and faixa[0] <= t <= faixa[1]:
            return faixa[2]
        if cor2 and abs(s) < 0.12:
            return cor2
        return cor

    def cor_baixo(i, j):
        t = (ts[i] + ts[i + 1]) / 2
        if faixa and faixa[0] <= t <= faixa[1]:
            return faixa[2]
        return cor_fundo

    m.grade(cima, cor_cima)
    m.grade(baixo, cor_baixo, inverte=True)
    ob = m.obj(nome, liso=True, angulo=70)
    ps = [ob]
    cq = cor_quilha or cor2 or "grafite"
    fins = [(0.0, 0.07)] if (longboard or quilhas == 1) else [(-0.32, 0.12), (0.32, 0.12), (0.0, 0.05)][:quilhas]
    for fx, ft in fins:
        t = ft
        w = meia(t)
        y = (t - 0.5) * L
        zb = zc(t) + 0.32 * esp(t) - 0.32 * esp(t)
        hq = 0.2 if longboard else 0.12
        cq_pts = ccw([(-0.06, 0.0), (0.07, 0.0), (-0.06 + 0.02, hq), (-0.1, hq * 0.9)])
        q = mb.extrudado(cq_pts, 0.012, x=0, y=0, z=0, cor=cq, bisel=0.004, seg=1, plano="yz")
        # contorno no plano (y, z): y para trás (−), z para baixo depois
        q.data.transform(Matrix.Diagonal((1, 1, -1, 1)))
        q.data.flip_normals()
        q.data.transform(Matrix.Translation((fx * w - 0.006, y, zb + 0.005)))
        ps.append(q)
    return mb.junta(ps, nome)


def palha(R, alt, z, camadas=3, cores=("mostarda", "amarelo_escuro", "caramelo"), lados=24, franja=0.12, rot=0.0,
          esc=(1, 1), nome="palha"):
    """Telhado de palha em cone (ou pirâmide com lados=4): camadas sobrepostas com a borda em zigue-zague (pontas de
    palha). Borda da camada de baixo em z, topo em z + alt."""
    ps = []
    for k in range(camadas):
        f0 = k / camadas
        f1 = (k + 1.25) / camadas
        r0 = R * (1 - f0 * 0.92)
        r1 = R * max(0.02, 1 - min(1.0, f1) * 0.97)
        z0 = z + alt * f0 * 0.98
        z1 = z + alt * min(1.0, f1)
        ob = mb.torno([(r0 * 0.9, z0 + 0.05), (r0, z0), (r0 * 0.97, z0 + 0.06), (r1, z1), (0, z1 + 0.01)],
                      cor=cores[k % len(cores)], seg=lados * 2, angulo=50)
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        for v in bm.verts:
            if abs(v.co.z - z0) < 1e-4 or abs(v.co.z - (z0 + 0.05)) < 1e-4:
                a = math.atan2(v.co.y, v.co.x)
                kk = round((a % (2 * math.pi)) / (2 * math.pi) * lados * 2)
                if kk % 2:
                    v.co.z -= franja
                    v.co.x *= 1.03
                    v.co.y *= 1.03
        bm.to_mesh(ob.data)
        bm.free()
        ps.append(ob)
    ob = mb.junta(ps, nome)
    ob.data.transform(Matrix.Rotation(math.radians(rot), 4, "Z"))
    ob.data.transform(Matrix.Diagonal((esc[0], esc[1], 1, 1)))
    return ob


def lona_listrada(cam, larg, cores, n_listras, esp=0.01, nome="lona", eixo_listra="u", nv=None):
    """Tira de tecido ao longo de um caminho 3D (cam) com largura larg em X (o caminho fica no plano YZ):
    listras ao longo do comprimento (eixo_listra "v": listras longitudinais) ou transversais ("u")."""
    nv = nv or n_listras * 2
    P = []
    for p in cam:
        P.append([(p[0] - larg / 2 + larg * j / nv, p[1], p[2]) for j in range(nv + 1)])

    def cor(i, j):
        if eixo_listra == "v":
            return cores[int(j / (nv / n_listras)) % len(cores)]
        return cores[i % len(cores)]

    return folha_dupla(P, cor, esp=esp, nome=nome, liso=True, angulo=40)


def bandeira_ondulada(w, h, x, y, z, cor, cor2=None, n=8, amp=0.06, nome="bandeira", listra=None):
    """Bandeira presa num mastro em (x, y), com a borda de cima em z; sai para +X, ondulada (tecido com espessura)."""
    P = []
    for i in range(n + 1):
        u = i / n
        dy = amp * math.sin(2 * math.pi * u * 1.3) * u
        P.append([(x + 0.03 + u * w, y + dy, z - h * j / 4 - 0.06 * u * u) for j in range(5)])

    def cor_fn(i, j):
        if listra == "h" and cor2:
            return cor if j < 2 else cor2
        if cor2 and listra == "v":
            return cor2 if i >= n // 2 else cor
        return cor

    return folha_dupla(P, cor_fn, esp=0.012, nome=nome)


def cordinha(p0, p1, queda=0.05, r=0.006, cor="bege", n=6):
    a, b = V(p0), V(p1)
    pts = []
    for k in range(n + 1):
        t = k / n
        p = a + (b - a) * t
        p.z -= queda * 4 * t * (1 - t)
        pts.append(tuple(p))
    return mb.tubo(pts, r, cor=cor, seg=4, raio_curva=0)


def boia_salva_vidas(R=0.33, r=0.07, cor="laranja", cor2="branco"):
    """Boia salva-vidas em pé (no plano XZ, olhando para −Y), centro na origem, 4 faixas brancas e corda."""
    b = toro(R, r, z=-r, cor=cor, seg=20, seg_r=8)
    setores(b, [cor, cor2], 8, fase=22.5)
    corda = mb.torno([(R + r * 0.75 + 0.012 * math.cos(math.radians(a)), 0.012 * math.sin(math.radians(a)))
                      for a in range(-90, 271, 60)], cor="creme", seg=20)
    ob = mb.junta([b, corda], "boia")
    ob.data.transform(Matrix.Rotation(math.radians(90), 4, "X"))
    return ob


def corrimao(pts, alt=0.95, cor="branco", r=0.03, passo=1.0, travessa=True, lados=6):
    """Guarda-corpo de tubo ao longo de pts (no chão do trecho): montantes a cada 'passo', corrimão e uma travessa."""
    ps = []
    pv = [V(p) for p in pts]
    topo = [tuple(p + V((0, 0, alt))) for p in pv]
    ps.append(mb.tubo(topo, r, cor=cor, seg=lados, raio_curva=0.08))
    if travessa:
        ps.append(mb.tubo([tuple(p + V((0, 0, alt * 0.5))) for p in pv], r * 0.7, cor=cor, seg=lados,
                          raio_curva=0.08))
    for a, b in zip(pv, pv[1:]):
        L = (b - a).length
        k = max(1, int(round(L / passo)))
        for i in range(k + (1 if b is pv[-1] else 0)):
            p = a + (b - a) * (i / k)
            ps.append(haste(tuple(p), tuple(p + V((0, 0, alt))), r * 0.85, cor, lados))
    return mb.junta(ps, "corrimao")


def rotulo_curvo(mat_idx, r, ang, h, zc, nome="rotulo", n=8):
    """Etiqueta curva colada num cilindro de raio r (eixo Z), centrada na frente (−Y), cobrindo 'ang' radianos."""
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    cols = []
    for i in range(n + 1):
        u = i / n
        a = -math.pi / 2 - ang / 2 + ang * u
        cols.append((bm.verts.new((r * math.cos(a), r * math.sin(a), zc - h / 2)),
                     bm.verts.new((r * math.cos(a), r * math.sin(a), zc + h / 2)), u))
    for (a0, a1, u0), (b0, b1, u1) in zip(cols, cols[1:]):
        f = bm.faces.new((a0, b0, b1, a1))
        for lo, q in zip(f.loops, ((u0, 0), (u1, 0), (u1, 1), (u0, 1))):
            lo[uvl].uv = q
        f.material_index = mat_idx
    me = bpy.data.meshes.new(nome)
    bm.to_mesh(me)
    bm.free()
    for nm in mb.MAT_NOMES:
        me.materials.append(bpy.data.materials[nm])
    me.shade_smooth()
    ob = bpy.data.objects.new(nome, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def se(l, p, a, x=0.0, y=0.0, z=0.0, cor="branco", e=0.3, e_v=None, nu=14, nv=7, **k):
    """mb.superelipsoide com malha leve por padrão (14 × 7)."""
    return mb.superelipsoide(l, p, a, x=x, y=y, z=z, cor=cor, e=e, e_v=e_v, nu=nu, nv=nv, **k)


def esf(r, x=0.0, y=0.0, z=0.0, cor="branco", esc=(1, 1, 1), seg=12, **k):
    """mb.esfera com malha leve por padrão (12 gomos)."""
    return mb.esfera(r, x=x, y=y, z=z, cor=cor, esc=esc, seg=seg, **k)


def cx(l, p, a, x=0.0, y=0.0, z=0.0, cor="branco", bisel=0.012, seg=2, **k):
    """mb.caixa com bisel de 2 segmentos por padrão (mais leve)."""
    return mb.caixa(l, p, a, x=x, y=y, z=z, cor=cor, bisel=bisel, seg=seg, **k)
