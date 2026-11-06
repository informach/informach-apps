"""Pai (Rafa) sobre a base anatômica CC0: morphs, estilo cartoon realista, sorriso, olhos encaixados,
esqueleto Mixamo em pose T, roupas da casca justa, barba e cabelo, textura de pele pintada por script.

Uso: python mh_pai.py <build/clipes.blend> <ext/> <dist/>
"""
import math
import os
import sys

import bpy
import bmesh  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Vector, noise  # noqa: E402
from mathutils.bvhtree import BVHTree  # noqa: E402
from PIL import Image, ImageDraw, ImageFilter  # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mh_base as mh  # noqa: E402

LIB, EXT, DIST = sys.argv[1], sys.argv[2], sys.argv[3]
DATA = os.path.join(EXT, "makehuman", "makehuman", "data")
RIGS = os.path.join(EXT, "mpfb2", "src", "mpfb", "data", "rigs", "standard")
TEX = os.path.join(DIST, "texturas")
os.makedirs(TEX, exist_ok=True)
P = mh.P

bpy.ops.wm.open_mainfile(filepath=LIB)
scn = bpy.context.scene
CH46 = bpy.data.objects["Esqueleto"]
CH46.data.pose_position = "REST"

# ------------------------------------------------------------------ 1. forma: morphs + estilo + sorriso
vs, vts, faces = mh.ler_obj(os.path.join(DATA, "3dobjs", "base.obj"))
ETNIA = {"caucasian": 0.55, "african": 0.25, "asian": 0.2}
mh.macros(vs, DATA, genero=1.0, anos=33, musculo=0.62, peso=0.58, etnia=ETNIA)
mh.expressao(vs, DATA, {"mouth-corner-puller": 0.85, "mouth-open": 0.12, "mouth-upward-retraction": 0.25,
                        "eye-left-opened-up": 0.3, "eye-right-opened-up": 0.3}, ETNIA)
mh.estilizar(vs, faces, cabeca=1.16, olhos=1.34)
mh.definir_chao(vs, faces)
olho_vs, olho_vts, olho_faces = mh.encaixar_mhclo(os.path.join(DATA, "eyes", "high-poly", "high-poly.mhclo"), vs)


# ------------------------------------------------------------------ materiais e texturas
def material(nome, cor=None, img=None, rough=0.6, sss=0.0, alpha=None, escala=None):
    m = bpy.data.materials.new(nome)
    if hasattr(m, "use_nodes"):
        m.use_nodes = True
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Roughness"].default_value = rough
    if sss and "Subsurface Weight" in b.inputs:
        b.inputs["Subsurface Weight"].default_value = sss
        b.inputs["Subsurface Radius"].default_value = (0.9, 0.35, 0.2)
        if "Subsurface Scale" in b.inputs:
            b.inputs["Subsurface Scale"].default_value = 0.01
    if img is not None:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = img
        if escala:
            mp = nt.nodes.new("ShaderNodeMapping")
            mp.inputs["Scale"].default_value = (*escala, 1)
            tc = nt.nodes.new("ShaderNodeTexCoord")
            nt.links.new(tc.outputs["UV"], mp.inputs["Vector"])
            nt.links.new(mp.outputs["Vector"], t.inputs["Vector"])
        nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
        if alpha:
            nt.links.new(t.outputs["Alpha"], b.inputs["Alpha"])
    else:
        b.inputs["Base Color"].default_value = (*[c ** 2.2 for c in cor], 1)
    return m


def hexf(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def salvar_img(nome, arr):
    Image.fromarray(arr).save(os.path.join(TEX, nome + ".png"))
    img = bpy.data.images.load(os.path.join(TEX, nome + ".png"))
    return img


def tex_xadrez(n=512):
    y, x = np.mgrid[0:n, 0:n] / n
    base, esc, cla = np.array(hexf("#3B62A4")), np.array(hexf("#203E76")), np.array(hexf("#86A3D6"))
    fu, fv = (x * 6) % 1, (y * 6) % 1
    bu, bv = fu < 0.34, fv < 0.34
    img = np.ones((n, n, 3)) * base
    img[bu] *= 0.8
    img[bv] *= 0.8
    img[bu & bv] = esc
    linha = (np.abs(fu - 0.67) < 0.02) | (np.abs(fv - 0.67) < 0.02)
    img[linha] = cla
    tram = 0.04 * np.sin((x + y) * n * 2.2)
    img = np.clip(img * (1 + tram[..., None]), 0, 1)
    return (img * 255).astype(np.uint8)


def tex_jeans(n=512):
    rng = np.random.default_rng(7)
    y, x = np.mgrid[0:n, 0:n] / n
    base = np.array(hexf("#2D3A5E"))
    diag = 0.06 * np.sin((x * 3 + y) * n * 1.4)
    ruido = rng.normal(0, 0.05, (n, n))
    img = np.clip(base * (1 + diag + ruido)[..., None], 0, 1)
    return (img * 255).astype(np.uint8)


# ------------------------------------------------------------------ 2. malhas
GRUPOS_CORPO = {g for _, _, g in faces if g == "body" or "eyelashes-2" in g or "teeth" in g or g == "helper-tongue"}  # homem: sem cílio inferior
M_PELE_TMP = material("pele_tmp", hexf("#D9A07A"))
M_CILIO = material("cilio", hexf("#3A281C"), rough=0.5)
M_DENTE = material("dente", hexf("#F4F1EA"), rough=0.25)
M_LINGUA = material("lingua", hexf("#B85B62"), rough=0.4)
corpo = mh.criar_malha("pai_corpo", vs, vts, faces, GRUPOS_CORPO,
                       {r"body": M_PELE_TMP, r".*eyelashes.*": M_CILIO, r".*teeth.*": M_DENTE, r"helper-tongue": M_LINGUA})
mh.pesos_mixamo(corpo, os.path.join(RIGS, "weights.mixamo.json"))
mh.limpar_soltos(corpo)
justa = mh.criar_malha("justa", vs, vts, faces, {"helper-tights"})
mh.pesos_mixamo(justa, os.path.join(RIGS, "weights.mixamo.json"))
mh.limpar_soltos(justa)

eye_img = bpy.data.images.load(os.path.join(DATA, "eyes", "materials", "brown_eye.png"))
M_OLHO = material("olho", img=eye_img, rough=0.08)
olhos = mh.criar_malha("olhos", olho_vs, olho_vts, olho_faces, None, {r".*": M_OLHO})
olhos.vertex_groups.new(name=P + "Head").add(list(range(len(olhos.data.vertices))), 1.0, "REPLACE")

# ------------------------------------------------------------------ 3. esqueleto Mixamo e pose T do Ch46
arm = mh.esqueleto_mpfb("pai_esqueleto", os.path.join(RIGS, "rig.mixamo.json"), vs, CH46)
for ob in (corpo, justa, olhos):
    ob.modifiers.new("Esqueleto", "ARMATURE").object = arm
mh.ajustar_pose_t(arm, [corpo, justa, olhos], CH46)
bpy.context.view_layer.update()

# referências no corpo já em pose T (metros, Z para cima)
def osso(n, cauda=False):
    b = arm.data.bones[P + n]
    return arm.matrix_world @ (b.tail_local if cauda else b.head_local)


HIPS, NECK, HEAD = osso("Hips"), osso("Neck"), osso("Head")
CAB_TOPO = max((corpo.matrix_world @ v.co).z for v in corpo.data.vertices)
_ov = [olhos.matrix_world @ v.co for v in olhos.data.vertices]
ESQ = sum((v for v in _ov if v.x > 0), Vector()) / max(1, sum(1 for v in _ov if v.x > 0))
DIR = Vector((-ESQ.x, ESQ.y, ESQ.z))
OLHO_Z = ESQ.z
RC = (CAB_TOPO - OLHO_Z)  # unidade de rosto: olho → topo
print("altura", round(CAB_TOPO, 3), "quadril", round(HIPS.z, 3), "olhos", round(OLHO_Z, 3))


def dominante(ob, v):
    melhor, pmax = None, 0
    for g in v.groups:
        if g.weight > pmax:
            melhor, pmax = ob.vertex_groups[g.group].name.replace(P, ""), g.weight
    return melhor


# ------------------------------------------------------------------ 4. rosto: pele pintada com fios projetados no UV
import mh_detalhe as det  # noqa: E402

N = 2048
proj = det.Projetor(corpo, N)
D = abs(ESQ.x - DIR.x) / 2  # meia distância entre os olhos
OC = (ESQ + DIR) / 2
_dentes = [corpo.matrix_world @ corpo.data.vertices[i].co for p in corpo.data.polygons if p.material_index == 2
           for i in p.vertices]
BOCA = sum(_dentes, Vector()) / len(_dentes)


def fc(p):
    """Referencial do rosto em meias distâncias interoculares: u lateral, v vertical, w profundidade (+ = para trás)."""
    return ((p.x - OC.x) / D, (p.z - OC.z) / D, (p.y - OC.y) / D)


BU, BV, BW = fc(BOCA)
S = det.suave


def m_labios(p):
    u, v, w = fc(p)
    e = ((u - BU) / 1.0) ** 2 + ((v - BV - 0.05) / 0.42) ** 2
    return S((1 - e) / 0.35) * S((BW + 0.8 - w) / 0.3)


def m_barba(p):
    u, v, w = fc(p)
    au = abs(u)
    topo = -1.62 if au < 1.0 else -1.62 + 0.8 * (au - 1.0)
    topo = min(topo, 0.1)
    m = S((topo - v) / 0.3) * S((v + 4.3) / 0.6) * S((1.7 - w) / 0.4) * S((2.6 - au) / 0.3)
    return m * (1 - min(1, m_labios(p) * 1.6))


def v_linha(au):
    return 2.15 + 0.12 * au * au


def m_cabelo(p):
    u, v, w = fc(p)
    au = abs(u)
    frente = S((v - v_linha(au)) / 0.35)
    lados = S((v - 0.85) / 0.35) * S((au - 1.4) / 0.3)
    tras = S((w - 0.9) / 0.5) * S((v + 2.3) / 0.6)
    costeleta = S((au - 1.95) / 0.2) * S((v + 0.55) / 0.3) * S((0.95 - w) / 0.25) * S((w + 0.2) / 0.25)
    orelha = S((au - 2.05) / 0.15) * S((0.85 - v) / 0.2) * S((v + 1.1) / 0.2) * S((w - 0.25) / 0.2) * S((1.9 - w) / 0.2)
    return max(frente, lados, tras, costeleta) * (1 - orelha)


def campo(p):
    u, v, w = fc(p)
    topo = S((v - 2.2) / 0.8)
    lado = S((abs(u) - 1.5) / 0.6)
    d = Vector((0, 1.0, 0.25)) * topo + Vector((math.copysign(0.25, u), 0.5, -1.0)) * (1 - topo) * lado + \
        Vector((0, 0.35, -1.0)) * (1 - topo) * (1 - lado)
    if w > 1.2:
        d = d.lerp(Vector((0, 0.25, -1.0)), S((w - 1.2) / 0.6))
    return d.normalized()


def na_cabeca(p):
    return p.z > NECK.z - 0.03


rnd = det.random.Random(11)
rng = np.random.default_rng(3)
pele = np.ones((N, N, 3)) * np.array(hexf("#C98A63"))
ruido = np.array(Image.fromarray((rng.normal(0.5, 0.25, (N // 8, N // 8)).clip(0, 1) * 255).astype(np.uint8))
                 .resize((N, N), Image.BICUBIC)) / 255.0
pele *= (0.97 + 0.06 * ruido)[..., None]
base_img = Image.fromarray((np.clip(pele, 0, 1) * 255).astype(np.uint8)).convert("RGBA")
uvl = corpo.data.uv_layers.active.data


def pintar_regiao(img, mascara, cor, alfa, borrar=6):
    camada = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    dr_ = ImageDraw.Draw(camada)
    for poly in corpo.data.polygons:
        if poly.material_index != 0:
            continue
        c = corpo.matrix_world @ poly.center
        if not na_cabeca(c):
            continue
        m = mascara(c)
        if m > 0.01:
            pts = [(uvl[li].uv[0] * N, (1 - uvl[li].uv[1]) * N) for li in poly.loop_indices]
            dr_.polygon(pts, fill=cor + (int(alfa * m),))
    img.alpha_composite(camada.filter(ImageFilter.GaussianBlur(borrar)))


COR_CAB = (38, 24, 15)
# lábios, bochechas e sombra da barba
pintar_regiao(base_img, m_labios, (168, 88, 82), 150, 5)
pintar_regiao(base_img, lambda p: S(1 - ((fc(p)[0] - 1.45) ** 2 + (fc(p)[1] + 1.15) ** 2) / 0.45) +
              S(1 - ((fc(p)[0] + 1.45) ** 2 + (fc(p)[1] + 1.15) ** 2) / 0.45), (205, 105, 95), 45, 18)
pintar_regiao(base_img, m_barba, (52, 36, 28), 150, 7)
pintar_regiao(base_img, m_cabelo, COR_CAB, 255, 6)

# fios: barba curta e couro cabeludo na própria pele
dr = ImageDraw.Draw(base_img)
for p in det.amostrar_regiao(proj, m_barba, 14000, 3, na_cabeca):
    det.desenhar_fios(dr, proj, det.fio(proj, p, lambda q: Vector((0, -0.2, -1)), 0.004, 2), COR_CAB, 2, 200)

# sobrancelhas: forma definida + fios
sob = Image.new("RGBA", (N, N), (0, 0, 0, 0))
ds = ImageDraw.Draw(sob)
for s in (-1, 1):
    sup_, inf_ = [], []
    for k in range(13):
        t = k / 12
        u = s * (0.42 + 1.0 * t)
        v = 0.92 + 0.16 * math.sin(math.pi * min(1, t * 1.25)) - 0.1 * t
        esp = (0.2 + 0.08 * math.sin(math.pi * min(1, t * 1.6))) * (1 - 0.65 * t)
        a = proj.raio(Vector((OC.x + u * D, OC.y - 0.3, OC.z + (v + esp / 2) * D)), Vector((0, 1, 0)))
        b = proj.raio(Vector((OC.x + u * D, OC.y - 0.3, OC.z + (v - esp / 2) * D)), Vector((0, 1, 0)))
        if a and b:
            sup_.append(a[3])
            inf_.append(b[3])
    ds.polygon(sup_ + inf_[::-1], fill=COR_CAB + (120,))
    for _ in range(800):
        t = rnd.random()
        u = s * (0.42 + 1.0 * t)
        v = 0.92 + 0.16 * math.sin(math.pi * min(1, t * 1.25)) - 0.1 * t + (rnd.random() - 0.5) * 0.18 * (1 - 0.6 * t)
        r0 = proj.raio(Vector((OC.x + u * D, OC.y - 0.3, OC.z + v * D)), Vector((0, 1, 0)))
        if not r0:
            continue
        ang = (0.9 - 0.8 * t) * (1 if s > 0 else -1)
        d3 = Vector((math.copysign(math.cos(ang), s), 0, abs(math.sin(ang)) * (1 if t < 0.5 else 0.3)))
        det.desenhar_fios(ds, proj, det.fio(proj, r0[0], lambda q, d3=d3: d3, 0.0065, 2), (24, 15, 9),
                          rnd.choice((2, 2, 3)), rnd.randint(170, 240))
base_img.alpha_composite(sob.filter(ImageFilter.GaussianBlur(0.8)))
base_img.convert("RGB").save(os.path.join(TEX, "pai_pele.png"))
pele_img = bpy.data.images.load(os.path.join(TEX, "pai_pele.png"))
M_PELE = material("pele", img=pele_img, rough=0.5, sss=0.1)
corpo.data.materials[0] = M_PELE

# olhos: íris maior, aro escuro e brilho, córnea transparente
caminho_olho = det.olho_estilizado(os.path.join(DATA, "eyes", "materials", "brown_eye.png"), os.path.join(TEX, "olho.png"), ampliar=1.42)
M_OLHO2 = det.material_alfa("olho2", bpy.data.images.load(caminho_olho), rough=0.08)
olhos.data.materials[0] = M_OLHO2

# ------------------------------------------------------------------ 5. roupas tiradas da casca justa
def casca_de(origem, filtro, nome, mat, afastar, espessura, uv_escala=None):
    o = origem.copy()
    o.data = origem.data.copy()
    o.name = nome
    scn.collection.objects.link(o)
    o.modifiers.clear()
    bm = bmesh.new()
    bm.from_mesh(o.data)
    dl = bm.verts.layers.deform.active
    nomes = {i: g.name.replace(P, "") for i, g in enumerate(o.vertex_groups)}

    def dom(v):
        if not dl or not v[dl]:
            return None
        gi, _ = max(v[dl].items(), key=lambda kv: kv[1])
        return nomes.get(gi)
    fora = [f for f in bm.faces if not filtro(o.matrix_world @ f.calc_center_median(), f, dom)]
    bmesh.ops.delete(bm, geom=fora, context="FACES")
    soltos = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=soltos, context="VERTS")
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * afastar
    bm.to_mesh(o.data)
    bm.free()
    o.data.materials.clear()
    o.data.materials.append(mat)
    if espessura:
        so = o.modifiers.new("solid", "SOLIDIFY")
        so.thickness = espessura
        so.offset = 1
        so.use_rim = True
    for p in o.data.polygons:
        p.use_smooth = True
    o.modifiers.new("Esqueleto", "ARMATURE").object = arm
    return o


TORSO = {"Spine", "Spine1", "Spine2", "LeftShoulder", "RightShoulder", "Neck"}
BRACOS = {"LeftArm", "RightArm", "LeftForeArm", "RightForeArm"}
PERNAS = {"LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg"}
punho = {s: osso(s + "ForeArm").lerp(osso(s + "Hand"), 0.5) for s in ("Left", "Right")}


def filtro_camisa(c, f, dom):
    d = None
    vs_ = [v for v in f.verts]
    doms = [dom(v) for v in vs_]
    if not all(x in TORSO | BRACOS | {"Hips"} for x in doms):
        return False
    if c.z < HIPS.z - 0.07:
        return False
    if c.z > NECK.z + 0.01:
        return False
    for s in ("Left", "Right"):
        e = osso(s + "ForeArm")
        w = osso(s + "Hand")
        ax = (w - e).normalized()
        if any(x in (s + "ForeArm",) for x in doms) and (c - punho[s]).dot(ax) > 0:
            return False
    # abertura da camisa na frente
    if abs(c.x) < 0.028 and c.y < HIPS.y - 0.04 and c.z > HIPS.z - 0.08 and c.z < NECK.z:
        return False
    return True


def filtro_calca(c, f, dom):
    doms = [dom(v) for v in f.verts]
    if not all(x in PERNAS | {"Hips", "Spine", "LeftFoot", "RightFoot"} for x in doms):
        return False
    return 0.11 < c.z < HIPS.z + 0.075


M_XADREZ = material("xadrez", img=salvar_img("xadrez", tex_xadrez()), rough=0.85, escala=(3, 3))
M_JEANS = material("jeans", img=salvar_img("jeans", tex_jeans()), rough=0.95)
M_CAMISETA = material("camiseta", hexf("#F1F1EC"), rough=0.9)
camisa = casca_de(justa, filtro_camisa, "camisa", M_XADREZ, 0.009, 0.004)
calca = casca_de(justa, filtro_calca, "calca", M_JEANS, 0.006, 0.004)
camiseta = casca_de(justa, lambda c, f, dom: HIPS.z - 0.05 < c.z < NECK.z - 0.005 and all(
    dom(v) in TORSO | {"Hips"} for v in f.verts), "camiseta", M_CAMISETA, 0.004, 0.0)
for o in (camisa, calca, camiseta):
    bpy.context.view_layer.objects.active = o
    for x in bpy.context.selected_objects:
        x.select_set(False)
    o.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.01)
    bpy.ops.object.mode_set(mode="OBJECT")

# tênis: casca do pé com sola
M_TENIS = material("tenis", hexf("#F3F3F1"), rough=0.55)
M_SOLA = material("sola", hexf("#CFCFCF"), rough=0.7)
tenis = casca_de(corpo, lambda c, f, dom: c.z < 0.115 and all(dom(v) in {"LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase", "LeftLeg", "RightLeg"} for v in f.verts),
                 "tenis", M_TENIS, 0.012, 0.0)
tenis.data.materials.append(M_SOLA)
for p in tenis.data.polygons:
    if (tenis.matrix_world @ p.center).z < 0.025:
        p.material_index = 1
sub = tenis.modifiers.new("sub", "SUBSURF")
sub.levels = 1
tenis.modifiers.move(len(tenis.modifiers) - 1, 0)

# ------------------------------------------------------------------ 6. cabelo e barba: cascas com alfa + mechas planas
def textura_fios(mascara, campo_fn, n_fios, comp, larg, alfa, semente, cor=COR_CAB, brilho=(88, 62, 42)):
    img = Image.new("RGBA", (N, N), cor + (0,))
    d = ImageDraw.Draw(img)
    r_ = det.random.Random(semente)
    for p in det.amostrar_regiao(proj, mascara, n_fios, semente, na_cabeca):
        c = brilho if r_.random() < 0.15 else tuple(int(k * r_.uniform(0.8, 1.2)) for k in cor)
        det.desenhar_fios(d, proj, det.fio(proj, p, campo_fn, comp * r_.uniform(0.7, 1.3), 4), c, larg,
                          int(alfa * r_.uniform(0.7, 1.0)))
    return img


def salvar(img, nome):
    caminho = os.path.join(TEX, nome + ".png")
    img.save(caminho)
    return bpy.data.images.load(caminho)


camadas = []
for k, (afastar, n_fios, comp, alfa, fator) in enumerate(((0.0022, 26000, 0.016, 235, 1.0), (0.0055, 16000, 0.02, 210, 0.95),
                                                         (0.0095, 9000, 0.024, 190, 0.8))):
    mk = (lambda f: (lambda p: m_cabelo(p) * (f if fc(p)[1] > 0.5 else f * 0.4)))(fator)
    tex = textura_fios(mk, campo, n_fios, comp, 2, alfa, 20 + k)
    mat = det.material_alfa(f"cabelo_{k}", salvar(tex, f"cabelo_{k}"))
    camadas.append(det.casca_alfa(corpo, mk, f"cabelo_{k}", mat, afastar, na_cabeca, arm))
for k, (afastar, n_fios, alfa) in enumerate(((0.0012, 16000, 215), (0.0028, 9000, 170))):
    tex = textura_fios(m_barba, lambda q: Vector((0, -0.3, -1)), n_fios, 0.006, 2, alfa, 40 + k)
    mat = det.material_alfa(f"barba_{k}", salvar(tex, f"barba_{k}"))
    camadas.append(det.casca_alfa(corpo, m_barba, f"barba_{k}", mat, afastar, na_cabeca, arm))

# topete: mechas planas saindo da linha do cabelo, subindo e varrendo para trás
M_CARD = det.material_alfa("card", salvar(det.textura_card(), "card_cabelo"))
cards = []
for k in range(15):
    u = -1.75 + 3.5 * k / 14 + (rnd.random() - 0.5) * 0.15
    r0 = proj.raio(Vector((OC.x + u * D, OC.y - 0.3, OC.z + (v_linha(abs(u)) + 0.15) * D)), Vector((0, 1, 0)))
    if not r0:
        continue
    pts, nors = [], []
    q = r0[0]
    for i in range(9):
        t = i / 8
        hit = proj.perto(q)
        nrm = hit[1].normalized()
        lift = 0.004 + 0.016 * math.sin(math.pi * min(1, t * 1.15)) ** 0.7
        pts.append(hit[0] + nrm * lift)
        nors.append(nrm)
        dirc = Vector((u * 0.04, 0.35 + 0.65 * t, 0.9 - 0.75 * t)).normalized()
        q = det.tangente(proj, hit[0], dirc, 0.012)
    larg = [D * w for w in (0.18, 0.28, 0.33, 0.33, 0.3, 0.26, 0.2, 0.13, 0.05)]
    cards.append(det.card(f"mecha_{k}", pts, nors, larg, M_CARD, arm))
camadas += cards
scn.cycles.transparent_max_bounces = 64

# ------------------------------------------------------------------ 7. relatório e render
pecas = [corpo, olhos, camisa, calca, camiseta, tenis] + camadas
dg = bpy.context.evaluated_depsgraph_get()
tris = 0
for o in pecas:
    ev = o.evaluated_get(dg)
    m_ = ev.to_mesh()
    m_.calc_loop_triangles()
    tris += len(m_.loop_triangles)
    ev.to_mesh_clear()
print("triângulos (alta, antes da redução):", tris)
for o in list(bpy.data.objects):
    if o.type in ("MESH", "ARMATURE") and o not in pecas and o is not arm and o.name != "Plane":
        o.hide_render = True
justa.hide_render = True
CH46.hide_render = True


def pose(nome):
    act = bpy.data.actions[nome]
    ad = arm.animation_data or arm.animation_data_create()
    ad.action = act
    if act.slots and ad.action_slot is None:
        ad.action_slot = act.slots[0]


pose("idle")
scn.frame_set(60)
bpy.context.view_layer.update()
world = bpy.data.worlds.new("w")
scn.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.9, 0.86, 0.84, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 0.55
for loc, en, tam in (((-2.5, -3.5, 3.2), 230, 3), ((3, -2.5, 2), 110, 3), ((0, 3, 3), 200, 3)):
    bpy.ops.object.light_add(type="AREA", location=loc)
    lz = bpy.context.active_object
    lz.data.energy, lz.data.size = en, tam
    lz.rotation_euler = (Vector((0, 0, 1.2)) - lz.location).to_track_quat("-Z", "Y").to_euler()
bpy.ops.mesh.primitive_plane_add(size=60)
chao = bpy.context.active_object
chao.data.materials.append(material("chao", hexf("#EDE3DE"), rough=0.9))
cam_d = bpy.data.cameras.new("cam")
cam = bpy.data.objects.new("cam", cam_d)
scn.collection.objects.link(cam)
scn.camera = cam
scn.render.engine = "CYCLES"
scn.cycles.samples = 64
scn.cycles.use_denoising = True
scn.view_settings.view_transform = "Standard" if "AgX" in [i.identifier for i in scn.view_settings.bl_rna.properties["view_transform"].enum_items] else "Standard"
hc = arm.matrix_world @ arm.pose.bones[P + "Head"].head
cam_d.lens = 70
alvo = Vector((0, 0, hc.z * 0.52))
cam.location = alvo + Vector((0.9, -5.2, 0.25))
cam.rotation_euler = (alvo - cam.location).to_track_quat("-Z", "Y").to_euler()
scn.render.resolution_x, scn.render.resolution_y = 900, 1200
scn.render.filepath = os.path.join(DIST, "mh_pai_corpo.png")
bpy.ops.render.render(write_still=True)
cam_d.lens = 85
alvo = hc + Vector((0, 0, 0.1))
cam.location = alvo + Vector((0.28, -1.05, 0.03))
cam.rotation_euler = (alvo - cam.location).to_track_quat("-Z", "Y").to_euler()
scn.render.resolution_x, scn.render.resolution_y = 1000, 1000
scn.render.filepath = os.path.join(DIST, "mh_pai_rosto.png")
bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(os.path.dirname(LIB), "mh_pai.blend"), compress=True)
print("ok")
