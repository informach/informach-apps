"""Protótipo da técnica nova (pai): corpo contínuo por Skin + Subdivision, cabeça esculpida, olhos
reais, roupas e cabelo como cascas do corpo, texturas geradas por script, pesos automáticos.

Uso: python proto_pai.py <build/familia_foto.blend> <dist/>
"""
import math
import os
import sys

import bpy
import bmesh  # noqa: E402
from mathutils import Matrix, Vector, noise  # noqa: E402

SRC, DIST = sys.argv[1], sys.argv[2]
TEX = os.path.join(DIST, "texturas")
os.makedirs(TEX, exist_ok=True)
P = "mixamorig:"
FRENTE, CIMA = Vector((0, -1, 0)), Vector((0, 0, 1))

bpy.ops.wm.open_mainfile(filepath=SRC)
scn = bpy.context.scene
BASE = bpy.data.objects["Esqueleto"]
BASE.data.pose_position = "REST"
bpy.context.view_layer.update()
MW = BASE.matrix_world.copy()


def H(n):
    return MW @ BASE.data.bones[P + n].head_local


def T(n):
    return MW @ BASE.data.bones[P + n].tail_local


def mid(a, b, t=0.5):
    return a.lerp(b, t)


def ativar(o):
    bpy.ops.object.mode_set(mode="OBJECT") if bpy.context.object and bpy.context.object.mode != "OBJECT" else None
    for x in bpy.context.selected_objects:
        x.select_set(False)
    bpy.context.view_layer.objects.active = o
    o.select_set(True)


def aplicar(o, mod):
    ativar(o)
    bpy.ops.object.modifier_apply(modifier=mod.name)


def suave(o):
    for p in o.data.polygons:
        p.use_smooth = True


# ------------------------------------------------------------------ texturas por script
def imagem(nome, w, h, func):
    img = bpy.data.images.new(nome, w, h)
    px = [0.0] * (w * h * 4)
    for y in range(h):
        for x in range(w):
            r, g, b = func(x / w, y / h)
            o = (y * w + x) * 4
            px[o:o + 4] = (r, g, b, 1.0)
    img.pixels = px
    img.filepath_raw = os.path.join(TEX, nome + ".png")
    img.file_format = "PNG"
    img.save()
    return img


def hexrgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def xadrez(u, v):
    base, esc, cla = hexrgb("#3D64A6"), hexrgb("#24427A"), hexrgb("#7C9AD0")
    fu, fv = (u * 8) % 1, (v * 8) % 1
    bu, bv = fu < 0.32, fv < 0.32
    c = [base[i] * (0.82 if bu else 1) * (0.82 if bv else 1) for i in range(3)]
    if bu and bv:
        c = list(esc)
    if abs(fu - 0.66) < 0.025 or abs(fv - 0.66) < 0.025:
        c = list(cla)
    return tuple(c)


def jeans(u, v):
    b = hexrgb("#2E3A5E")
    n = noise.noise(Vector((u * 220, v * 60, 0))) * 0.5 + noise.noise(Vector((u * 40, v * 40, 3))) * 0.3
    diag = 0.04 * math.sin((u + v) * 600)
    k = 1 + n * 0.18 + diag
    return tuple(min(1, c * k) for c in b)


def iris(u, v):
    du, dv = u - 0.5, v - 0.5
    r = math.hypot(du, dv)
    if r < 0.13:
        return (0.02, 0.015, 0.01)
    if r < 0.30:
        a = math.atan2(dv, du)
        k = 0.75 + 0.25 * math.sin(a * 22) * (r - 0.13) / 0.17
        return (0.30 * k, 0.17 * k, 0.08 * k)
    if r < 0.33:
        return (0.12, 0.07, 0.04)
    return (0.97, 0.96, 0.95)


def pele_tex(u, v):
    b = hexrgb("#E2A780")
    n = noise.noise(Vector((u * 30, v * 30, 1))) * 0.03
    return tuple(min(1, c * (1 + n)) for c in b)


def material(nome, cor=None, img=None, rough=0.75, escala=(1, 1)):
    m = bpy.data.materials.new(nome)
    if hasattr(m, "use_nodes"):
        m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Roughness"].default_value = rough
    if img:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = img
        mp = nt.nodes.new("ShaderNodeMapping")
        mp.inputs["Scale"].default_value = (*escala, 1)
        tc = nt.nodes.new("ShaderNodeTexCoord")
        nt.links.new(tc.outputs["UV"], mp.inputs["Vector"])
        nt.links.new(mp.outputs["Vector"], t.inputs["Vector"])
        nt.links.new(t.outputs["Color"], bsdf.inputs["Base Color"])
    else:
        bsdf.inputs["Base Color"].default_value = (*[c ** 2.2 for c in hexrgb(cor)], 1)
    return m


M_PELE = material("pele", img=imagem("pele", 64, 64, pele_tex), rough=0.6)
M_CAMISETA = material("camiseta", "#F2F2EE", rough=0.9)
M_XADREZ = material("xadrez", img=imagem("xadrez", 256, 256, xadrez), rough=0.9, escala=(3, 3))
M_JEANS = material("jeans", img=imagem("jeans", 256, 256, jeans), rough=0.95, escala=(2, 2))
M_TENIS = material("tenis", "#F4F4F4", rough=0.6)
M_SOLA = material("sola", "#D8D8D8", rough=0.7)
M_CABELO = material("cabelo", "#2B1A10", rough=0.55)
M_OLHO = material("olho", img=imagem("iris", 128, 128, iris), rough=0.15)
M_BOCA = material("boca", "#6B2228", rough=0.5)
M_DENTE = material("dente", "#FAFAF7", rough=0.3)
M_LINGUA = material("lingua", "#C9606A", rough=0.5)


# ------------------------------------------------------------------ 1. corpo contínuo (Skin)
def grafo():
    """Nós (posição, raio) e arestas do corpo, com os nomes usados para recortar roupas."""
    hips, sp, sp1, sp2, nk, hd = (H(n) for n in ("Hips", "Spine", "Spine1", "Spine2", "Neck", "Head"))
    vs, ed, rad, tag = [], [], [], []

    def v(p, r, t="corpo"):
        vs.append(p.copy())
        rad.append(r)
        tag.append(t)
        return len(vs) - 1

    p0 = v(hips + CIMA * 0.0, (0.155, 0.115))
    s1 = v(sp, (0.142, 0.112))
    s2 = v(sp1, (0.148, 0.112))
    s3 = v(sp2 + CIMA * 0.03, (0.165, 0.108))
    n0 = v(mid(sp2, nk, 0.85), (0.058, 0.056))
    n1 = v(hd + CIMA * 0.04, (0.052, 0.052))
    ed += [(p0, s1), (s1, s2), (s2, s3), (s3, n0), (n0, n1)]
    for lado, s in (("Left", 1), ("Right", -1)):
        a, e, w = H(lado + "Arm"), H(lado + "ForeArm"), H(lado + "Hand")
        d = (w - e).normalized()
        c = v(mid(H(lado + "Shoulder"), a, 0.55) + CIMA * 0.01, (0.07, 0.07))
        ia = v(a, (0.062, 0.062))
        ib = v(mid(a, e, 0.45), (0.058, 0.056))
        ie = v(e, (0.046, 0.046))
        ifa = v(mid(e, w, 0.35), (0.048, 0.045))
        iw = v(w, (0.035, 0.034))
        ip = v(w + d * 0.05, (0.05, 0.026), "mao")
        ed += [(s3, c), (c, ia), (ia, ib), (ib, ie), (ie, ifa), (ifa, iw), (iw, ip)]
        for k, off in enumerate((-0.03, -0.01, 0.01, 0.03)):  # quatro dedos
            lat = Vector((0, off, 0))
            comp = (0.028, 0.032, 0.03, 0.024)[k]
            f1 = v(w + d * 0.095 + lat, (0.0135, 0.0125), "mao")
            f2 = v(w + d * (0.095 + comp) + lat * 1.05, (0.0125, 0.0115), "mao")
            f3 = v(w + d * (0.095 + comp * 1.6) + lat * 1.08, (0.011, 0.01), "mao")
            ed += [(ip, f1), (f1, f2), (f2, f3)]
        t1 = v(w + d * 0.035 + FRENTE * 0.03 + Vector((0, 0, -0.01)), (0.016, 0.016), "mao")
        t2 = v(w + d * 0.06 + FRENTE * 0.055 + Vector((0, 0, -0.012)), (0.013, 0.013), "mao")
        t3 = v(w + d * 0.08 + FRENTE * 0.07 + Vector((0, 0, -0.012)), (0.011, 0.011), "mao")
        ed += [(iw, t1), (t1, t2), (t2, t3)]
        u, k, f = H(lado + "UpLeg"), H(lado + "Leg"), H(lado + "Foot")
        tb, tt = H(lado + "ToeBase"), T(lado + "ToeBase")
        iu = v(u, (0.088, 0.088))
        iq = v(mid(u, k, 0.4), (0.082, 0.082))
        ik = v(k, (0.057, 0.06))
        ic = v(mid(k, f, 0.3), (0.06, 0.064))
        ia_ = v(f, (0.042, 0.044))
        ib_ = v(Vector((tb.x, tb.y, 0.035)), (0.045, 0.03))
        it_ = v(Vector((tt.x, tt.y, 0.03)), (0.035, 0.022))
        ed += [(p0, iu), (iu, iq), (iq, ik), (ik, ic), (ic, ia_), (ia_, ib_), (ib_, it_)]
    return vs, ed, rad, tag, p0


def skin(nome, vs, ed, rad, raiz, mult=1.0, soma=0.0, sub=2, excluir=()):
    ex = set(excluir)
    idx = [i for i in range(len(vs)) if i not in ex]
    novo = {i: k for k, i in enumerate(idx)}
    me = bpy.data.meshes.new(nome)
    me.from_pydata([tuple(vs[i]) for i in idx], [(novo[a], novo[b]) for a, b in ed if a in novo and b in novo], [])
    ob = bpy.data.objects.new(nome, me)
    scn.collection.objects.link(ob)
    sk = ob.modifiers.new("skin", "SKIN")
    sk.branch_smoothing = 0.6
    sk.use_smooth_shade = True
    for i in idx:
        r = rad[i]
        me.skin_vertices[0].data[novo[i]].radius = (r[0] * mult + soma, r[1] * mult + soma)
    me.skin_vertices[0].data[novo[raiz]].use_root = True
    s_ = ob.modifiers.new("sub", "SUBSURF")
    s_.levels = s_.render_levels = sub
    aplicar(ob, sk)
    aplicar(ob, s_)
    suave(ob)
    return ob


def cortar(ob, planos, solid=0.0, mat=None):
    """Recorta a malha com planos (ponto, normal): tudo do lado da normal sai. Borda limpa."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    for co, no in planos:
        geom = list(bm.verts) + list(bm.edges) + list(bm.faces)
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=no, clear_outer=True)
    bm.to_mesh(ob.data)
    bm.free()
    if mat:
        ob.data.materials.clear()
        ob.data.materials.append(mat)
    if solid:
        so = ob.modifiers.new("solid", "SOLIDIFY")
        so.thickness = solid
        so.offset = -1
        aplicar(ob, so)
    suave(ob)
    ativar(ob)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(60))
    bpy.ops.object.mode_set(mode="OBJECT")
    return ob


def transferir_pesos(origem, destino):
    for g in origem.vertex_groups:
        if g.name not in destino.vertex_groups:
            destino.vertex_groups.new(name=g.name)
    dt = destino.modifiers.new("pesos", "DATA_TRANSFER")
    dt.object = origem
    dt.use_vert_data = True
    dt.data_types_verts = {"VGROUP_WEIGHTS"}
    dt.vert_mapping = "POLYINTERP_NEAREST"
    dt.layers_vgroup_select_src = "ALL"
    dt.layers_vgroup_select_dst = "NAME"
    aplicar(destino, dt)


def corpo():
    vs, ed, rad, tag, p0 = grafo()
    ob = skin("corpo", vs, ed, rad, p0)
    return ob



# ------------------------------------------------------------------ 2. cabeça esculpida
R = 0.165
CAB = H("Head") + CIMA * (R * 0.82) + FRENTE * (R * 0.05)


def esculpir(p):
    """p em coordenadas da esfera unitária (x esq., -y frente, z cima)."""
    x, y, z = p
    f = -y
    if z < 0:  # mandíbula mais estreita e queixo
        t = -z
        x *= 1 - 0.14 * t ** 1.6
        if f > 0:
            y *= 1 + 0.06 * t * t
        z *= 1 + 0.05 * t
    if f > 0.3 and -0.1 < z < 0.25:  # bochechas
        x *= 1 + 0.04 * (1 - abs(z - 0.07) / 0.18)
    for s in (-1, 1):  # órbitas dos olhos
        d = math.hypot(x - s * 0.34, z + 0.0)
        if f > 0.5 and d < 0.24:
            y *= 1 - 0.07 * (1 - d / 0.24)
    if f > 0.7 and abs(x) < 0.1 and -0.3 < z < 0.0:  # nariz
        y *= 1 + 0.09 * (1 - abs(x) / 0.1) * (1 - abs(z + 0.15) / 0.15)
    if f > 0.6 and z > 0.2 and z < 0.4:  # arco das sobrancelhas
        y *= 1 + 0.03
    return Vector((x, y, z))


def cabeca():
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=40, v_segments=24, radius=1.0)
    for vt in bm.verts:
        vt.co = esculpir(vt.co)
        vt.co = Vector((vt.co.x * R, vt.co.y * R * 0.95, vt.co.z * R * 1.04)) + CAB
    me = bpy.data.meshes.new("cabeca")
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("cabeca", me)
    scn.collection.objects.link(ob)
    suave(ob)
    # orelhas
    for s in (-1, 1):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=1,
                                             location=CAB + Vector((s * 0.97 * R, 0.03 * R, -0.05 * R)))
        o = bpy.context.active_object
        o.scale = (0.1 * R, 0.07 * R, 0.17 * R)
        bpy.ops.object.transform_apply(scale=True)
        suave(o)
        o.data.materials.append(M_PELE)
        juntar(ob, o)
    return ob


def juntar(alvo, *outros):
    for x in bpy.context.selected_objects:
        x.select_set(False)
    for o in outros:
        o.select_set(True)
    alvo.select_set(True)
    bpy.context.view_layer.objects.active = alvo
    bpy.ops.object.join()


def ponto_rosto(u, v, extra=0.0):
    """Ponto na superfície da cabeça esculpida, por raio a partir do centro."""
    d = Vector((u, -math.sqrt(max(0.001, 1 - u * u - v * v)), v))
    p = esculpir(d)
    return CAB + Vector((p.x * R, p.y * R * 0.95, p.z * R * 1.04)) + d * extra * R


# ------------------------------------------------------------------ 3. olhos, boca, sobrancelhas
def olhos():
    objs = []
    for s in (-1, 1):
        c = ponto_rosto(s * 0.34, 0.0, -0.1)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, radius=0.17 * R, location=c)
        o = bpy.context.active_object
        o.scale = (1.0, 0.8, 1.15)
        o.rotation_euler = (math.radians(90), 0, 0)  # polo da esfera (centro da íris) para a frente
        bpy.ops.object.transform_apply(scale=True, rotation=True)
        o.data.materials.append(M_OLHO)
        ativar(o)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.sphere_project(direction="ALIGN_TO_OBJECT")
        bpy.ops.object.mode_set(mode="OBJECT")
        # UV planar frontal: íris no centro da textura
        uvl = o.data.uv_layers.active
        for loop in o.data.loops:
            co = o.data.vertices[loop.vertex_index].co
            uvl.data[loop.index].uv = (0.5 + co.x / (0.34 * R) * 0.62, 0.5 + co.z / (0.39 * R) * 0.62)
        suave(o)
        objs.append(o)
        # brilho
        bpy.ops.mesh.primitive_uv_sphere_add(segments=8, ring_count=6, radius=0.03 * R,
                                             location=c + Vector((-s * 0.035 * R, -0.115 * R, 0.06 * R)))
        b = bpy.context.active_object
        b.data.materials.append(material("brilho", "#FFFFFF", rough=0.05))
        suave(b)
        objs.append(b)
    return objs


def tira(pts, raios, mat, nome, lados=6):
    """Tubo com seção elíptica e raio variável ao longo de uma linha (sobrancelha, mecha, cílio)."""
    bm = bmesh.new()
    aneis = []
    for i, p in enumerate(pts):
        d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        lado = d.cross(FRENTE)
        if lado.length < 1e-4:
            lado = d.cross(CIMA)
        lado.normalize()
        fr = lado.cross(d).normalized()
        a_, b_ = raios[i]
        aneis.append([bm.verts.new(p + lado * math.cos(2 * math.pi * j / lados) * a_ + fr * math.sin(2 * math.pi * j / lados) * b_)
                      for j in range(lados)])
    for i in range(len(aneis) - 1):
        for j in range(lados):
            bm.faces.new((aneis[i][j], aneis[i][(j + 1) % lados], aneis[i + 1][(j + 1) % lados], aneis[i + 1][j]))
    bm.faces.new(list(reversed(aneis[0])))
    bm.faces.new(aneis[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(nome)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(nome, me)
    scn.collection.objects.link(o)
    o.data.materials.append(mat)
    suave(o)
    return o


def rosto_extras():
    objs = []
    for s in (-1, 1):  # sobrancelhas grossas
        pts = [ponto_rosto(s * u, 0.28 + 0.06 * math.sin(math.pi * (u - 0.17) / 0.36), 0.03) for u in
               (0.17, 0.26, 0.36, 0.45, 0.53)]
        objs.append(tira(pts, [(0.035 * R, 0.022 * R), (0.045 * R, 0.026 * R), (0.045 * R, 0.026 * R),
                               (0.036 * R, 0.02 * R), (0.022 * R, 0.014 * R)], M_CABELO, "sobrancelha"))
    # boca: sorriso aberto modelado (fundo escuro, dentes, língua)
    w = 0.25
    n = 12
    sup_ = [(-w + 2 * w * k / n) for k in range(n + 1)]
    pts_b = [ponto_rosto(u, -0.36 - 0.03 * (1 - (u / w) ** 2), 0.012) for u in sup_]
    pts_b += [ponto_rosto(u, -0.36 - 0.2 * math.sqrt(max(0, 1 - (u / w) ** 2)), 0.012) for u in reversed(sup_[1:-1])]
    for nome_, pts, mat in (("boca", pts_b, M_BOCA),):
        me = bpy.data.meshes.new(nome_)
        me.from_pydata([tuple(p) for p in pts], [], [list(range(len(pts)))])
        o = bpy.data.objects.new(nome_, me)
        scn.collection.objects.link(o)
        o.data.materials.append(mat)
        objs.append(o)
    dentes = [ponto_rosto(u * 0.88, -0.365 - 0.03 * (1 - (u / w) ** 2), 0.018) for u in sup_]
    dentes += [ponto_rosto(u * 0.84, -0.43 - 0.02 * (1 - (u / w) ** 2), 0.018) for u in reversed(sup_)]
    me = bpy.data.meshes.new("dentes")
    me.from_pydata([tuple(p) for p in dentes], [], [list(range(len(dentes)))])
    o = bpy.data.objects.new("dentes", me)
    scn.collection.objects.link(o)
    o.data.materials.append(M_DENTE)
    objs.append(o)
    lng = [ponto_rosto(math.cos(a) * 0.12, -0.5 + math.sin(a) * 0.045, 0.016) for a in
           [math.pi + math.pi * k / 10 for k in range(11)]]
    me = bpy.data.meshes.new("lingua")
    me.from_pydata([tuple(p) for p in lng], [], [list(range(len(lng)))])
    o = bpy.data.objects.new("lingua", me)
    scn.collection.objects.link(o)
    o.data.materials.append(M_LINGUA)
    objs.append(o)
    return objs


# ------------------------------------------------------------------ 4. cascas: roupa, cabelo, barba
def casca(origem, filtro, nome, mat, afastar, espessura, ruido=0.0, escala_ruido=0.05, subdiv=0):
    """Copia as faces escolhidas, afasta pela normal e dá espessura: roupa e cabelo ajustados."""
    me = origem.data.copy()
    o = bpy.data.objects.new(nome, me)
    scn.collection.objects.link(o)
    bm = bmesh.new()
    bm.from_mesh(me)
    fora = [f for f in bm.faces if not filtro(f.calc_center_median(), f.normal)]
    bmesh.ops.delete(bm, geom=fora, context="FACES")
    bm.normal_update()
    for v in bm.verts:
        n = v.normal
        k = afastar
        if ruido:
            k += ruido * max(0.0, noise.noise(v.co / escala_ruido))
        v.co += n * k
    bm.to_mesh(me)
    bm.free()
    o.data.materials.clear()
    o.data.materials.append(mat)
    if espessura:
        so = o.modifiers.new("solid", "SOLIDIFY")
        so.thickness = espessura
        so.offset = 1
        aplicar(o, so)
    if subdiv:
        su = o.modifiers.new("sub", "SUBSURF")
        su.levels = subdiv
        aplicar(o, su)
    suave(o)
    ativar(o)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(60))
    bpy.ops.object.mode_set(mode="OBJECT")
    return o


def local(p):
    q = p - CAB
    return Vector((q.x / R, q.y / (R * 0.95), q.z / (R * 1.04)))


# ------------------------------------------------------------------ montar o pai
c = corpo()
c.data.materials.append(M_PELE)
c.data.materials.append(M_CAMISETA)
hips, nk = H("Hips"), H("Neck")
punho_x = abs(mid(H("LeftForeArm"), H("LeftHand"), 0.45).x)
tor_top = mid(H("Spine2"), nk, 0.9).z
for p in c.data.polygons:  # camiseta branca no tronco
    cc = p.center
    if hips.z - 0.03 < cc.z < tor_top and abs(cc.x) < abs(H("LeftArm").x) + 0.02:
        p.material_index = 1
ativar(c)
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.smart_project(angle_limit=math.radians(60))
bpy.ops.object.mode_set(mode="OBJECT")

VS, ED, RAD, TAG, P0 = grafo()
sem_mao = [i for i, t in enumerate(TAG) if t == "mao"]
camisa = skin("camisa", VS, ED, RAD, P0, mult=1.07, soma=0.01, excluir=sem_mao)
planos = [(Vector((0, 0, hips.z - 0.07)), Vector((0, 0, -1)))]
for lado, s_ in (("Left", 1), ("Right", -1)):
    e, w = H(lado + "ForeArm"), H(lado + "Hand")
    planos.append((mid(e, w, 0.45), (w - e).normalized()))
planos = [pl for pl in planos if pl[1].length > 0]
# pernas fora da camisa
for lado in ("Left", "Right"):
    planos.append((H(lado + "UpLeg") + Vector((0, 0, -0.03)), Vector((0, 0, -1))))
cortar(camisa, planos)
# abertura da frente: apaga uma faixa entre dois cortes verticais
bm = bmesh.new()
bm.from_mesh(camisa.data)
bmesh.ops.bisect_plane(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces), plane_co=Vector((0, 0, tor_top - 0.01)),
                       plane_no=Vector((0, 0, 1)))
pescoco = [f for f in bm.faces if f.calc_center_median().z > tor_top - 0.01 and abs(f.calc_center_median().x) < 0.085]
bmesh.ops.delete(bm, geom=pescoco, context="FACES")
for xx in (-0.035, 0.035):
    bmesh.ops.bisect_plane(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces), plane_co=Vector((xx, 0, 0)),
                           plane_no=Vector((1, 0, 0)))
abre = [f for f in bm.faces if abs(f.calc_center_median().x) < 0.035 and f.calc_center_median().y < hips.y
        and f.calc_center_median().z > hips.z - 0.07]
bmesh.ops.delete(bm, geom=abre, context="FACES")
bm.to_mesh(camisa.data)
bm.free()
cortar(camisa, [], solid=0.006, mat=M_XADREZ)
pernas_e_quadril = [i for i, t in enumerate(TAG) if t == "corpo"]
calca = skin("calca", VS, ED, RAD, P0, mult=1.06, soma=0.009, excluir=sem_mao)
cortar(calca, [(Vector((0, 0, hips.z + 0.07)), Vector((0, 0, 1))), (Vector((0, 0, 0.14)), Vector((0, 0, -1)))],
       solid=0.006, mat=M_JEANS)
# barra dobrada das mangas
extras = []
for lado in ("Left", "Right"):
    e, w = H(lado + "ForeArm"), H(lado + "Hand")
    p = mid(e, w, 0.45)
    d = (w - e).normalized()
    extras.append(tira([p - d * 0.02, p + d * 0.018], [(0.064, 0.062)] * 2, M_XADREZ, "punho", lados=16))

# tênis: forma própria em volta do pé, com sola
for lado in ("Left", "Right"):
    f, tb, tt = H(lado + "Foot"), H(lado + "ToeBase"), T(lado + "ToeBase")
    d = Vector((tt.x - f.x, tt.y - f.y, 0)).normalized()
    a0 = Vector((f.x, f.y, 0))
    comp = Vector((tt.x - f.x, tt.y - f.y, 0)).length
    perfil = [(-0.075, 0.045, 0.04, 0.055), (-0.04, 0.058, 0.055, 0.07), (0.02, 0.06, 0.05, 0.075),
              (comp * 0.55, 0.062, 0.044, 0.055), (comp * 0.9, 0.058, 0.036, 0.045), (comp + 0.02, 0.045, 0.028, 0.035),
              (comp + 0.045, 0.02, 0.014, 0.03)]
    pts = [a0 + d * t + CIMA * z for t, _, _, z in perfil]
    ten = tira(pts, [(w_, h_) for _, w_, h_, _ in perfil], M_TENIS, "tenis", lados=14)
    su = ten.modifiers.new("sub", "SUBSURF")
    su.levels = 1
    aplicar(ten, su)
    sola = tira([a0 + d * (-0.08) + CIMA * 0.012, a0 + d * (comp + 0.04) + CIMA * 0.012], [(0.064, 0.012)] * 2,
                M_SOLA, "sola", lados=14)
    extras += [ten, sola]

cab = cabeca()
cab.data.materials.clear()
cab.data.materials.append(M_PELE)
ativar(cab)
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.sphere_project()
bpy.ops.object.mode_set(mode="OBJECT")

# cabelo curto com volume e topete
cabelo = casca(cab, lambda p, n: (lambda q: q.z > 0.45 or (q.z > -0.05 and q.y > -0.3) or (q.z > -0.5 and q.y > 0.35))(local(p))
               and not (abs(local(p).x) > 0.85 and local(p).z < 0.3 and local(p).y < 0.2),
               "cabelo", M_CABELO, 0.03 * R, 0.05 * R, ruido=0.025 * R, escala_ruido=0.08)
mechas = []
i = 0
for fila, (v0, n_) in enumerate(((0.62, 7), (0.8, 6), (0.93, 4))):
    for k in range(n_):
        i += 1
        x = -0.6 + 1.2 * (k + 0.5 * (fila % 2)) / max(1, n_ - 1 + 0.5 * (fila % 2))
        x = max(-0.62, min(0.62, x))
        a = ponto_rosto(x * (1 - 0.25 * fila), v0, 0.04)
        topo = CAB + CIMA * 1.12 * R + Vector((x * 0.35 * R, 0.05 * R + fila * 0.1 * R, 0))
        tras = CAB + Vector((x * 0.75 * R, 0.75 * R, 0.62 * R - fila * 0.05 * R))
        pts = [a, a.lerp(topo, 0.5) + CIMA * 0.08 * R, topo, topo.lerp(tras, 0.6), tras]
        rr = [(0.07 * R, 0.035 * R), (0.16 * R, 0.07 * R), (0.17 * R, 0.07 * R), (0.13 * R, 0.06 * R), (0.03 * R, 0.02 * R)]
        mechas.append(tira(pts, rr, M_CABELO, "mecha", lados=8))
for m_ in mechas:
    su = m_.modifiers.new("sub", "SUBSURF")
    su.levels = 1
    aplicar(m_, su)
# barba cheia: casca da mandíbula, sem cobrir a boca
barba = casca(cab, lambda p, n: (lambda q: q.z < -0.12 - 0.45 * max(0.0, 0.85 - abs(q.x)) and q.y < 0.3
                                            and not (abs(q.x) < 0.32 and q.z > -0.64 and q.y < -0.5))(local(p)),
              "barba", M_CABELO, 0.012 * R, 0.035 * R, ruido=0.03 * R, escala_ruido=0.04, subdiv=1)
bigode = tira([ponto_rosto(u, -0.27 - 0.06 * abs(u) / 0.3, 0.06) for u in (-0.3, -0.15, 0.0, 0.15, 0.3)],
              [(0.04 * R, 0.03 * R), (0.06 * R, 0.04 * R), (0.06 * R, 0.04 * R), (0.06 * R, 0.04 * R), (0.04 * R, 0.03 * R)],
              M_CABELO, "bigode", lados=6)
gola = []
for s in (-1, 1):
    base = Vector((s * 0.045, nk.y - 0.055, nk.z - 0.025))
    gola.append(tira([base, base + Vector((s * 0.05, -0.03, -0.07))], [(0.035, 0.008), (0.012, 0.006)], M_XADREZ, "gola", 4))

partes_cabeca = [cab] + olhos() + rosto_extras() + [cabelo, barba, bigode] + mechas
partes_corpo = [c, camisa, calca] + extras + gola

# ------------------------------------------------------------------ esqueleto: pesos automáticos no corpo
arm = BASE.copy()
arm.name = "pai_novo"
arm.animation_data_clear()
scn.collection.objects.link(arm)
for x in bpy.context.selected_objects:
    x.select_set(False)
c.select_set(True)
arm.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.parent_set(type="ARMATURE_AUTO")
for o_ in partes_corpo[1:]:
    transferir_pesos(c, o_)
c.modifiers.clear()
juntar(c, *partes_corpo[1:])
c.parent = arm
c.matrix_parent_inverse = arm.matrix_world.inverted()
c.modifiers.new("arm", "ARMATURE").object = arm
juntar(cab, *partes_cabeca[1:])
for g in [b.name for b in arm.data.bones]:
    cab.vertex_groups.new(name=g)
cab.vertex_groups[P + "Head"].add(list(range(len(cab.data.vertices))), 1.0, "REPLACE")
cab.parent = arm
cab.matrix_parent_inverse = arm.matrix_world.inverted()
cab.modifiers.new("arm", "ARMATURE").object = arm
juntar(c, cab)
c.name = "pai_novo_malha"
BASE.data.pose_position = "POSE"
arm.scale = BASE.scale * 1.22
tris = sum(len(p.vertices) - 2 for p in c.data.polygons)
print("pai novo: triângulos", tris, "materiais", len(c.data.materials))

# ------------------------------------------------------------------ comparação lado a lado
for o in bpy.data.objects:
    if o.type in ("MESH", "ARMATURE") and o.name not in ("pai", "pai_malha", "pai_novo", "pai_novo_malha", "Plane"):
        o.hide_render = True
velho = bpy.data.objects["pai"]
velho.location = (-0.55, 0.3, 0)
velho.rotation_euler = (math.radians(90), 0, math.radians(10))
arm.location = (0.55, 0.3, 0)
arm.rotation_euler = (math.radians(90), 0, math.radians(-10))
for a_ in (velho, arm):
    ad = a_.animation_data or a_.animation_data_create()
    ad.action = None
    for t in list(ad.nla_tracks):
        ad.nla_tracks.remove(t)
    act = bpy.data.actions["bracos_relaxados"]
    st = ad.nla_tracks.new().strips.new("pose", 1, act)
    if hasattr(st, "action_slot") and st.action_slot is None and act.slots:
        st.action_slot = act.slots[0]
scn.frame_set(1)
cam = scn.camera
cam.data.lens = 85
cam.location = (0, -6.2, 1.3)
cam.rotation_euler = (Vector((0, 0.3, 1.05)) - cam.location).to_track_quat("-Z", "Y").to_euler()
scn.render.resolution_x, scn.render.resolution_y = 1400, 1100
scn.cycles.samples = 64
scn.render.filepath = os.path.join(DIST, "proto_pai.png")
bpy.ops.render.render(write_still=True)
bpy.context.view_layer.update()
hc = arm.matrix_world @ arm.pose.bones[P + "Head"].head
alvo = hc + Vector((0, 0, R * 1.22 * 0.8))
cam.location = alvo + Vector((0, -2.4, 0.15))
cam.rotation_euler = (alvo - cam.location).to_track_quat("-Z", "Y").to_euler()
scn.render.resolution_x, scn.render.resolution_y = 1000, 1000
scn.render.filepath = os.path.join(DIST, "proto_pai_rosto.png")
bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=SRC.replace("_foto.blend", "_proto.blend"), compress=True)
print("ok")
