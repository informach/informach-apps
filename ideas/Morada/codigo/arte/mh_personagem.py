"""Gera UM personagem do Morada sobre a base anatômica CC0 a partir da ficha.

Uso: python mh_personagem.py <build/clipes.blend> <ext/> <dist/> <id>
Saída: build/mh_<id>.blend com a coleção <id> (esqueleto + malhas) e texturas em dist/texturas/<id>_*.png
"""
import math
import os
import random
import sys

import bpy
import bmesh  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Vector, noise  # noqa: E402
from mathutils.geometry import intersect_point_line  # noqa: E402
from PIL import Image, ImageDraw, ImageFilter  # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mh_base as mh  # noqa: E402
import mh_cabelo as cb  # noqa: E402
import mh_detalhe as det  # noqa: E402
from fichas import FICHAS  # noqa: E402

LIB, EXT, DIST, PID = sys.argv[1:5]
F = FICHAS[PID]
DATA = os.path.join(EXT, "makehuman", "makehuman", "data")
RIGS = os.path.join(EXT, "mpfb2", "src", "mpfb", "data", "rigs", "standard")
TEX = os.path.join(DIST, "texturas")
os.makedirs(TEX, exist_ok=True)
P = mh.P
FEM = F["genero"] < 0.5
rnd = random.Random(hash(PID) & 0xFFFF)
S = det.suave

bpy.ops.wm.open_mainfile(filepath=LIB)
scn = bpy.context.scene
CH46 = bpy.data.objects["Esqueleto"]
CH46.data.pose_position = "REST"


# ================================================================== utilidades
def hexf(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def hex8(h):
    return tuple(int(c * 255) for c in hexf(h))


def material(nome, cor=None, img=None, rough=0.6, sss=0.0, escala=None, metal=0.0):
    m = bpy.data.materials.new(f"{PID}_{nome}")
    if hasattr(m, "use_nodes"):
        m.use_nodes = True
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
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
    else:
        b.inputs["Base Color"].default_value = (*[c ** 2.2 for c in cor], 1)
    return m


def salvar(arr_ou_img, nome):
    caminho = os.path.join(TEX, f"{PID}_{nome}.png")
    img = arr_ou_img if isinstance(arr_ou_img, Image.Image) else Image.fromarray(arr_ou_img)
    img.save(caminho)
    return bpy.data.images.load(caminho)


def tecido(tipo, cor, cor2=None, n=512):
    """Texturas de tecido geradas por script."""
    r = np.random.default_rng(abs(hash((PID, tipo, cor))) % 2 ** 31)
    y, x = np.mgrid[0:n, 0:n] / n
    base = np.array(hexf(cor))
    if tipo == "xadrez":
        esc, cla = np.array(hexf(cor2 or "#203E76")), base * 1.6
        fu, fv = (x * 6) % 1, (y * 6) % 1
        bu, bv = fu < 0.34, fv < 0.34
        img = np.ones((n, n, 3)) * base
        img[bu] *= 0.8
        img[bv] *= 0.8
        img[bu & bv] = esc
        img[(np.abs(fu - 0.67) < 0.02) | (np.abs(fv - 0.67) < 0.02)] = np.clip(cla, 0, 1)
        img *= (1 + 0.04 * np.sin((x + y) * n * 2.2))[..., None]
    elif tipo == "jeans":
        k = 1 + 0.06 * np.sin((x * 3 + y) * n * 1.4) + r.normal(0, 0.05, (n, n))
        img = base * k[..., None]
    elif tipo == "malha":  # moletom, camiseta
        k = 1 + 0.03 * np.sin(x * n * 3.0) * np.sin(y * n * 1.5) + r.normal(0, 0.025, (n, n))
        img = base * k[..., None]
    elif tipo == "trico":
        k = 1 + 0.08 * np.abs(np.sin(x * n * 0.9)) * np.sin(y * n * 1.6) + r.normal(0, 0.03, (n, n))
        img = base * k[..., None]
    elif tipo == "tweed":
        k = 1 + r.normal(0, 0.09, (n, n)) + 0.05 * np.sin((x - y) * n * 1.2)
        img = base * k[..., None]
    else:  # liso
        k = 1 + r.normal(0, 0.02, (n, n)) + 0.02 * np.sin(x * n * 2.5)
        img = base * k[..., None]
    return (np.clip(img, 0, 1) * 255).astype(np.uint8)


def mat_tecido(nome, tipo, cor, cor2=None, rough=0.85, escala=(3, 3)):
    return material(nome, img=salvar(tecido(tipo, cor, cor2), nome), rough=rough, escala=escala)


def tubo(pts, raios, nome, mat, lados=8, fechado=False, osso="Head", arm=None, pesos=None):
    bm = bmesh.new()
    an = []
    n = len(pts)
    for i, p in enumerate(pts):
        if fechado:
            d = (pts[(i + 1) % n] - pts[(i - 1) % n]).normalized()
        else:
            d = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
        lado = d.cross(Vector((0, 0, 1))) if abs(d.z) < 0.95 else d.cross(Vector((0, -1, 0)))
        lado.normalize()
        fr = lado.cross(d).normalized()
        a, b = raios[i] if isinstance(raios[i], tuple) else (raios[i], raios[i])
        an.append([bm.verts.new(p + lado * math.cos(2 * math.pi * j / lados) * a + fr * math.sin(2 * math.pi * j / lados) * b)
                   for j in range(lados)])
    segs = n if fechado else n - 1
    for i in range(segs):
        A, B = an[i], an[(i + 1) % n]
        for j in range(lados):
            bm.faces.new((A[j], A[(j + 1) % lados], B[(j + 1) % lados], B[j]))
    if not fechado:
        bm.faces.new(list(reversed(an[0])))
        bm.faces.new(an[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(nome)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(nome, me)
    scn.collection.objects.link(o)
    o.data.materials.append(mat)
    for p in o.data.polygons:
        p.use_smooth = True
    if arm:
        if pesos:
            grupos = {}
            for v in o.data.vertices:
                for os_, val in pesos(v.co).items():
                    g = grupos.get(os_) or o.vertex_groups.new(name=P + os_)
                    grupos[os_] = g
                    g.add([v.index], val, "REPLACE")
        else:
            o.vertex_groups.new(name=P + osso).add(list(range(len(me.vertices))), 1.0, "REPLACE")
        o.modifiers.new("Esqueleto", "ARMATURE").object = arm
    return o


# ================================================================== 1. forma
vs, vts, faces = mh.ler_obj(os.path.join(DATA, "3dobjs", "base.obj"))
ETNIA = F.get("etnia", {"caucasian": 0.55, "african": 0.25, "asian": 0.2})
mh.macros(vs, DATA, genero=F["genero"], anos=F["anos"], musculo=F.get("musculo", 0.5), peso=F.get("peso", 0.5), etnia=ETNIA)
for caminho, w in F.get("detalhes", {}).items():
    mh.detalhe(vs, DATA, caminho, w)
sorriso = F.get("sorriso", 0.85)
mh.expressao(vs, DATA, {"mouth-corner-puller": sorriso, "mouth-open": F.get("boca_aberta", 0.12),
                        "mouth-upward-retraction": 0.25 * sorriso, "eye-left-opened-up": 0.3,
                        "eye-right-opened-up": 0.3}, ETNIA)
mh.estilizar(vs, faces, cabeca=F.get("cabeca", 1.16), olhos=F.get("olhos", 1.34))
mh.definir_chao(vs, faces)
olho_vs, olho_vts, olho_faces = mh.encaixar_mhclo(os.path.join(DATA, "eyes", "high-poly", "high-poly.mhclo"), vs)
_dente = [mh.mh_para_blender(vs[i]) for i in mh.GRUPOS["helper-upper-teeth"] | mh.GRUPOS["helper-lower-teeth"]]
BOCA = sum(_dente, Vector()) / len(_dente)

# ================================================================== 2. malhas e esqueleto
cilios = "eyelashes-2"  # cílio de cima; o de baixo marcava como delineador
GRUPOS = {g for _, _, g in faces if g == "body" or cilios in g or (F.get("dentes", True) and "teeth" in g)
          or (F.get("dentes", True) and g == "helper-tongue")}
M_PELE_TMP = material("pele_tmp", hexf(F["pele"]))
M_CILIO = material("cilio", hexf("#2A1C14" if FEM else "#3A281C"), rough=0.5)
M_DENTE = material("dente", hexf("#F4F1EA"), rough=0.25)
M_LINGUA = material("lingua", hexf("#B85B62"), rough=0.4)
corpo = mh.criar_malha(f"{PID}_corpo", vs, vts, faces, GRUPOS,
                       {r"body": M_PELE_TMP, r".*eyelashes.*": M_CILIO, r".*teeth.*": M_DENTE, r"helper-tongue": M_LINGUA})
mh.pesos_mixamo(corpo, os.path.join(RIGS, "weights.mixamo.json"))
mh.limpar_soltos(corpo)
justa = mh.criar_malha(f"{PID}_justa", vs, vts, faces, {"helper-tights"})
mh.pesos_mixamo(justa, os.path.join(RIGS, "weights.mixamo.json"))
mh.limpar_soltos(justa)
saia_h = mh.criar_malha(f"{PID}_saia_h", vs, vts, faces, {"helper-skirt"})
mh.pesos_mixamo(saia_h, os.path.join(RIGS, "weights.mixamo.json"))
mh.limpar_soltos(saia_h)
olhos = mh.criar_malha(f"{PID}_olhos", olho_vs, olho_vts, olho_faces, None, {r".*": M_PELE_TMP})
olhos.vertex_groups.new(name=P + "Head").add(list(range(len(olhos.data.vertices))), 1.0, "REPLACE")

arm = mh.esqueleto_mpfb(f"{PID}", os.path.join(RIGS, "rig.mixamo.json"), vs, CH46)
for ob in (corpo, justa, saia_h, olhos):
    ob.modifiers.new("Esqueleto", "ARMATURE").object = arm
mh.ajustar_pose_t(arm, [corpo, justa, saia_h, olhos], CH46)
bpy.context.view_layer.update()


def osso(n, cauda=False):
    b = arm.data.bones[P + n]
    return arm.matrix_world @ (b.tail_local if cauda else b.head_local)


HIPS, NECK, HEAD = osso("Hips"), osso("Neck"), osso("Head")
ALT = max((corpo.matrix_world @ v.co).z for v in corpo.data.vertices)
ESC = ALT / 1.75  # escala relativa a um adulto
_ov = [olhos.matrix_world @ v.co for v in olhos.data.vertices]
ESQ = sum((v for v in _ov if v.x > 0), Vector()) / max(1, sum(1 for v in _ov if v.x > 0))
DIR = sum((v for v in _ov if v.x < 0), Vector()) / max(1, sum(1 for v in _ov if v.x < 0))
D = abs(ESQ.x - DIR.x) / 2
OC = (ESQ + DIR) / 2
print(PID, "altura", round(ALT, 3), "quadril", round(HIPS.z, 3))


def fc(p):
    return ((p.x - OC.x) / D, (p.z - OC.z) / D, (p.y - OC.y) / D)


BU, BV, BW = fc(BOCA)


def na_cabeca(p):
    return p.z > NECK.z - 0.03 * ESC


# ================================================================== 3. rosto: pele pintada
N = 2048
proj = det.Projetor(corpo, N)
COR_CAB = hex8(F["cabelo_cor"])


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


LINHA = F.get("linha_cabelo", 2.15)


def v_linha(au):
    return LINHA + 0.12 * au * au


def m_cabelo(p):
    u, v, w = fc(p)
    au = abs(u)
    frente = S((v - v_linha(au)) / 0.35)
    lados = S((v - 0.85) / 0.35) * S((au - 1.4) / 0.3)
    tras = S((w - 0.9) / 0.5) * S((v + 2.3) / 0.6)
    costeleta = S((au - 1.95) / 0.2) * S((v + 0.55) / 0.3) * S((0.95 - w) / 0.25) * S((w + 0.2) / 0.25)
    orelha = S((au - 2.05) / 0.15) * S((0.85 - v) / 0.2) * S((v + 1.1) / 0.2) * S((w - 0.25) / 0.2) * S((1.9 - w) / 0.2)
    m = max(frente, lados, tras, costeleta) * (1 - orelha)
    if any(a_[0] == "boina" for a_ in F.get("acessorios", [])):
        m *= 1 - S((v - 1.15) / 0.2) * S((2.4 - w) / 0.3)  # a boina cobre o topo
    return m


def campo(p):
    u, v, w = fc(p)
    topo = S((v - 2.2) / 0.8)
    lado = S((abs(u) - 1.5) / 0.6)
    d = Vector((0, 1.0, 0.25)) * topo + Vector((math.copysign(0.25, u), 0.5, -1.0)) * (1 - topo) * lado + \
        Vector((0, 0.35, -1.0)) * (1 - topo) * (1 - lado)
    if w > 1.2:
        d = d.lerp(Vector((0, 0.25, -1.0)), S((w - 1.2) / 0.6))
    return d.normalized()


def campo_risca(p):
    """Cabelo longo com risca no meio: sai da risca para os lados e desce."""
    u, v, w = fc(p)
    s = 1 if u >= 0 else -1
    topo = S((v - 2.0) / 0.9)
    d = Vector((s * 0.9, 0.25, -0.2)) * topo + Vector((s * 0.2, 0.3, -1.0)) * (1 - topo)
    if w > 1.0:
        d = d.lerp(Vector((s * 0.1, 0.35, -1.0)), S((w - 1.0) / 0.7))
    return d.normalized()


pele = np.ones((N, N, 3)) * np.array(hexf(F["pele"]))
rng = np.random.default_rng(3)
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
            dr_.polygon([(uvl[li].uv[0] * N, (1 - uvl[li].uv[1]) * N) for li in poly.loop_indices], fill=cor + (int(alfa * m),))
    img.alpha_composite(camada.filter(ImageFilter.GaussianBlur(borrar)))


labio = F.get("labio", (176, 84, 92) if FEM else (168, 88, 82))
ANOS = F["anos"]
pintar_regiao(base_img, m_labios, labio, int((175 if FEM else 140) * (0.45 if ANOS < 6 else 0.7 if ANOS < 13 else 1)), 5)
blush = F.get("blush", 70 if (FEM or F["anos"] < 12) else 40)
pintar_regiao(base_img, lambda p: S(1 - ((fc(p)[0] - 1.45) ** 2 + (fc(p)[1] + 1.15) ** 2) / 0.45) +
              S(1 - ((fc(p)[0] + 1.45) ** 2 + (fc(p)[1] + 1.15) ** 2) / 0.45), (210, 100, 95), blush, 18)
if F.get("barba"):
    cor_barba = hex8(F["barba"])
    pintar_regiao(base_img, m_barba, tuple(int(c * 0.9 + 25) for c in cor_barba), 140, 7)
pintar_regiao(base_img, m_cabelo, COR_CAB, 255 if F["cabelo"] != "bebe" else 120, 6)
dr = ImageDraw.Draw(base_img)
if F.get("barba"):
    for p in det.amostrar_regiao(proj, m_barba, 14000, 3, na_cabeca):
        det.desenhar_fios(dr, proj, det.fio(proj, p, lambda q: Vector((0, -0.2, -1)), 0.004 * ESC, 2), cor_barba, 2, 200)

# sobrancelhas
SB = F.get("sobrancelha", {})
sob = Image.new("RGBA", (N, N), (0, 0, 0, 0))
ds = ImageDraw.Draw(sob)
cor_sob = hex8(SB.get("cor", F["cabelo_cor"]))
esp0 = SB.get("esp", 0.15 if FEM else 0.2)
arco = SB.get("arco", 0.22 if FEM else 0.16)
for s in (-1, 1):
    sup_, inf_ = [], []
    for k in range(13):
        t = k / 12
        u = s * (0.42 + 1.05 * t)
        v = 0.92 + arco * math.sin(math.pi * min(1, t * 1.25)) - 0.1 * t
        esp = (esp0 + 0.08 * math.sin(math.pi * min(1, t * 1.6))) * (1 - 0.7 * t)
        a = proj.raio(Vector((OC.x + u * D, OC.y - 0.3, OC.z + (v + esp / 2) * D)), Vector((0, 1, 0)))
        b = proj.raio(Vector((OC.x + u * D, OC.y - 0.3, OC.z + (v - esp / 2) * D)), Vector((0, 1, 0)))
        if a and b:
            sup_.append(a[3])
            inf_.append(b[3])
    if len(sup_) > 3:
        ds.polygon(sup_ + inf_[::-1], fill=cor_sob + (110,))
    for _ in range(700):
        t = rnd.random()
        u = s * (0.42 + 1.05 * t)
        v = 0.92 + arco * math.sin(math.pi * min(1, t * 1.25)) - 0.1 * t + (rnd.random() - 0.5) * esp0 * 0.9 * (1 - 0.6 * t)
        r0 = proj.raio(Vector((OC.x + u * D, OC.y - 0.3, OC.z + v * D)), Vector((0, 1, 0)))
        if not r0:
            continue
        ang = (0.9 - 0.8 * t)
        d3 = Vector((math.copysign(math.cos(ang), s), 0, abs(math.sin(ang)) * (1 if t < 0.5 else 0.3)))
        det.desenhar_fios(ds, proj, det.fio(proj, r0[0], lambda q, d3=d3: d3, 0.0065 * ESC, 2),
                          tuple(int(c * 0.8) for c in cor_sob), rnd.choice((2, 2, 3)), rnd.randint(170, 240))
base_img.alpha_composite(sob.filter(ImageFilter.GaussianBlur(0.8)))
base_img.convert("RGB").save(os.path.join(TEX, f"{PID}_pele.png"))
M_PELE = material("pele", img=bpy.data.images.load(os.path.join(TEX, f"{PID}_pele.png")), rough=0.5, sss=0.1)
corpo.data.materials[0] = M_PELE
caminho_olho = det.olho_estilizado(os.path.join(DATA, "eyes", "materials", "brown_eye.png"),
                                   os.path.join(TEX, f"{PID}_olho.png"), ampliar=F.get("iris", 1.42))
olhos.data.materials[0] = det.material_alfa(f"{PID}_olho", bpy.data.images.load(caminho_olho), rough=0.08)

# ================================================================== 4. roupas
SEG = {n: (osso(n), osso(n, True)) for n in ("Spine", "Spine1", "Spine2", "LeftArm", "LeftForeArm", "RightArm",
                                            "RightForeArm", "LeftUpLeg", "LeftLeg", "RightUpLeg", "RightLeg", "Hips")}
EIXO_TRONCO = (HIPS - Vector((0, 0, 0.1)), NECK)


def dominante_fn(o):
    nomes = {i: g.name.replace(P, "") for i, g in enumerate(o.vertex_groups)}

    def dom(v, dl):
        if not dl or not v[dl]:
            return None
        gi, _ = max(v[dl].items(), key=lambda kv: kv[1])
        return nomes.get(gi)
    return dom


TORSO = {"Hips", "Spine", "Spine1", "Spine2", "LeftShoulder", "RightShoulder", "Neck"}
BRACOS = {"LeftArm", "RightArm", "LeftForeArm", "RightForeArm"}
PERNAS = {"LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg"}
PES = {"LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase"}


def radial(p, dom, extra, rmin):
    """Afasta o ponto do eixo do osso (folga) com raio mínimo (perna reta, manga larga)."""
    if dom in SEG and dom != "Hips" and dom not in ("Spine", "Spine1", "Spine2"):
        a, b = SEG[dom]
    else:
        a, b = EIXO_TRONCO
    c, t = intersect_point_line(p, a, b)
    t = max(0.0, min(1.0, t))
    c = a.lerp(b, t)
    d = p - c
    r = d.length
    if r < 1e-6:
        return p
    alvo = max(r + extra, rmin(dom, t) if rmin else 0)
    return c + d / r * alvo


def peca(nome, origem, regiao, planos, afastar, mat, espessura=0.003, rmin=None, extra=0.0, recortes=None,
         sub=0):
    o = origem.copy()
    o.data = origem.data.copy()
    o.name = f"{PID}_{nome}"
    scn.collection.objects.link(o)
    o.modifiers.clear()
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0008)
    dl = bm.verts.layers.deform.active
    dom = dominante_fn(o)
    fora = [f for f in bm.faces if not all(dom(v, dl) in regiao for v in f.verts)]
    bmesh.ops.delete(bm, geom=fora, context="FACES")
    for co, no, so_frente in planos:
        geom = list(bm.verts) + list(bm.edges) + list(bm.faces)
        if so_frente:  # True = só a frente; função = só as faces cujo centro ela aceita
            filtro = so_frente if callable(so_frente) else (lambda c: c.y < HIPS.y - 0.01)
            fs = [f for f in bm.faces if filtro(o.matrix_world @ f.calc_center_median())]
            geom = list({e for f in fs for e in f.edges}) + list({v for f in fs for v in f.verts}) + fs
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=no, clear_outer=True)
    if recortes:
        apagar = [f for f in bm.faces if recortes(o.matrix_world @ f.calc_center_median())]
        bmesh.ops.delete(bm, geom=apagar, context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)  # normais coerentes: a costura não afunda no corpo
    bm.normal_update()
    for v in bm.verts:
        p = o.matrix_world @ v.co + v.normal * afastar
        if extra or rmin:
            p = radial(p, dom(v, dl), extra, rmin)
        v.co = o.matrix_world.inverted() @ p
    bm.to_mesh(o.data)
    bm.free()
    o.data.materials.clear()
    o.data.materials.append(mat)
    if sub:
        s_ = o.modifiers.new("sub", "SUBSURF")
        s_.levels = sub
    if espessura:
        so = o.modifiers.new("solid", "SOLIDIFY")
        so.thickness = espessura
        so.offset = 1
        so.use_rim = True
    for p in o.data.polygons:
        p.use_smooth = True
    for x in bpy.context.selected_objects:
        x.select_set(False)
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.01)
    bpy.ops.object.mode_set(mode="OBJECT")
    o.modifiers.new("Esqueleto", "ARMATURE").object = arm
    return o


def plano_manga(lado, tipo):
    s = 1 if lado == "Left" else -1
    a, e, w = osso(lado + "Arm"), osso(lado + "ForeArm"), osso(lado + "Hand")
    pos = {"curta": a.lerp(e, 0.42), "bufante": a.lerp(e, 0.32), "dobrada": e.lerp(w, 0.45),
           "longa": e.lerp(w, 0.93), "3/4": e.lerp(w, 0.55), "regata": a.lerp(e, 0.02)}[tipo]
    eixo = (e - a).normalized() if tipo in ("curta", "bufante", "regata") else (w - e).normalized()
    return (pos, eixo, False)


def topo_saia():
    """Altura mais baixa da borda de cima da malha-guia da saia: abaixo dela o corte é um plano limpo."""
    bm_ = bmesh.new()
    bm_.from_mesh(saia_h.data)
    zs = [(saia_h.matrix_world @ v.co).z for e in bm_.edges if e.is_boundary for v in e.verts]
    bm_.free()
    meio = (max(zs) + min(zs)) / 2
    return min(z for z in zs if z > meio) - 0.006 * ESC


Z_SAIA = min(topo_saia(), HIPS.z + 0.06 * ESC)
pecas = []
esconder = []  # regiões do corpo cobertas (faces do corpo apagadas)
for R in F["roupas"]:
    t = R["tipo"]
    cor = R.get("cor", "#CCCCCC")
    mat = mat_tecido(f"{t}_{len(pecas)}", R.get("tecido", "liso"), cor, R.get("cor2"), escala=R.get("escala", (3, 3)))
    if t in ("blusa", "vestido"):
        manga = R.get("manga", "curta")
        barra = HIPS.z + R.get("barra", 0.0) * ESC if t == "blusa" else Z_SAIA - 0.025 * ESC  # cobre a borda da saia
        planos = [(Vector((0, 0, barra)), Vector((0, 0, -1)), False),
                  # gola: o plano só corta perto do pescoço; no T-pose o alto do ombro fica acima dele
                  (NECK + Vector((0, 0, -0.012 * ESC)), Vector((0, -0.35, 1)).normalized(),
                   lambda c: (Vector((c.x, c.y, 0)) - Vector((NECK.x, NECK.y, 0))).length < 0.095 * ESC)]
        decote_v = R.get("decote") == "v"
        for lado in ("Left", "Right"):
            planos.append(plano_manga(lado, manga))
        if decote_v:  # V: cada plano corta só a sua metade da frente, perto do pescoço
            z_v = NECK.z - 0.11 * ESC
            for sx in (1, -1):
                planos.append((Vector((NECK.x, NECK.y, z_v)), Vector((-sx * 1.5, 0, 1)).normalized(),
                               lambda c, sx=sx: sx * (c.x - NECK.x) >= 0 and c.y < HIPS.y - 0.02 and c.z > z_v - 0.03 * ESC
                               and abs(c.x - NECK.x) < 0.12 * ESC))
        # nas crianças o peso da cabeça desce pelo pescoço e o da coxa sobe pela barriga: gola e barra cortam
        regiao = TORSO | BRACOS | {"Head", "LeftUpLeg", "RightUpLeg"}
        aberta = R.get("aberta", False)
        larg_ab = 0.03 * ESC

        def recorte(c, aberta=aberta, larg_ab=larg_ab, decote_v=decote_v):
            return aberta and abs(c.x) < larg_ab and c.y < HIPS.y - 0.03 and c.z > HIPS.z - 0.12

        def rmin_blusa(dom, tt, manga=manga, R=R):
            if dom in BRACOS and manga == "bufante" and "ForeArm" not in dom:
                return 0.06 * ESC * (1.4 - 0.5 * tt)
            return 0.0
        o = peca(t, justa, regiao, planos, (0.006 if t == "blusa" else 0.016) + 0.004 * R.get("camada", 0), mat, rmin=rmin_blusa,
                 extra=R.get("folga", 0.006) * ESC, recortes=recorte)
        if R.get("cor_manga"):  # raglan: mangas de outra cor
            o.data.materials.append(mat_tecido(f"manga_{len(pecas)}", R.get("tecido", "liso"), R["cor_manga"]))
            x_ombro = abs(osso("LeftArm").x) - 0.03 * ESC
            for p_ in o.data.polygons:
                c_ = o.matrix_world @ p_.center
                if abs(c_.x) > x_ombro - (c_.z - osso("LeftArm").z) * 0.8:
                    p_.material_index = 1
        pecas.append(o)
        esconder.append(("braco", manga))
        if not aberta and not R.get("camada"):
            esconder.append(("tronco", barra))
            if decote_v:
                esconder.append(("decote", NECK.z - 0.11 * ESC))
        if t == "vestido":
            R2 = dict(R)
            R2["tipo"] = "saia"
            F["roupas"].append(dict(tipo="saia", cor=cor, tecido=R.get("tecido", "liso"), comprimento=R.get("comprimento", "joelho"),
                                    roda=R.get("roda", 1.25), _de_vestido=True))
    elif t == "calca":
        comp = R.get("comprimento", "longa")
        z_barra = {"longa": osso("LeftFoot").z + 0.02 * ESC, "curta": osso("LeftLeg").z + 0.03 * ESC,
                   "bermuda": osso("LeftLeg").z - 0.02 * ESC}[comp]
        planos = [(Vector((0, 0, HIPS.z + R.get("cintura", 0.06) * ESC)), Vector((0, 0, 1)), False),
                  (Vector((0, 0, z_barra)), Vector((0, 0, -1)), False)]
        larga = R.get("larga", 0.0)

        def rmin_calca(dom, tt, larga=larga):
            if dom in ("LeftLeg", "RightLeg"):
                return (0.062 + larga * tt) * ESC
            if dom in ("LeftUpLeg", "RightUpLeg"):
                return (0.07 + larga * 0.3) * ESC
            return 0.0
        o = peca(t, justa, TORSO | PERNAS, planos, 0.005, mat, rmin=rmin_calca, extra=R.get("folga", 0.004) * ESC)
        pecas.append(o)
        esconder.append(("pernas", z_barra))
        if R.get("barra_dobrada"):
            for lado in ("Left", "Right"):
                k = osso(lado + "Leg").lerp(osso(lado + "Foot"), 0.94)
                k.z = z_barra + 0.022 * ESC
                r_ = (0.062 + larga) * ESC + 0.012
                pecas.append(tubo([k - Vector((0, 0, 0.018 * ESC)), k + Vector((0, 0, 0.018 * ESC))], [r_, r_],
                                  f"{PID}_barra", mat_tecido("barra", R.get("tecido", "jeans"), R["barra_dobrada"]),
                                  lados=16, arm=arm, osso=lado + "Leg"))
    elif t == "macacao":
        z_peito = HIPS.z + 0.07 * ESC
        acima = lambda c: c.z > z_peito  # noqa: E731
        # peitilho com bordas retas: planos laterais e de trás valem só acima da cintura
        planos = [(Vector((0, 0, osso("LeftFoot").z + 0.025 * ESC)), Vector((0, 0, -1)), False),
                  (Vector((0, 0, osso("Spine1").z + 0.02 * ESC)), Vector((0, 0, 1)), False),
                  (Vector((0.075 * ESC, 0, 0)), Vector((1, 0, 0)), lambda c: acima(c) and c.x > 0),
                  (Vector((-0.075 * ESC, 0, 0)), Vector((-1, 0, 0)), lambda c: acima(c) and c.x < 0),
                  (Vector((0, HIPS.y + 0.02, 0)), Vector((0, 1, 0)), acima)]
        o = peca(t, justa, TORSO | PERNAS, planos, 0.009, mat,
                 rmin=lambda dom, tt: 0.07 * ESC if dom in PERNAS else 0.0, extra=0.006 * ESC)
        pecas.append(o)
        for s in (-1, 1):
            topo = Vector((s * 0.06 * ESC, HIPS.y - 0.11 * ESC, osso("Spine1").z + 0.01))
            costas = Vector((s * 0.05 * ESC, HIPS.y + 0.11 * ESC, HIPS.z + 0.1 * ESC))
            meio = Vector((s * 0.075 * ESC, HIPS.y, NECK.z - 0.03 * ESC))
            pts = [topo, topo.lerp(meio, 0.5) + Vector((0, -0.03 * ESC, 0.02 * ESC)), meio + Vector((0, 0, 0.03 * ESC)),
                   meio.lerp(costas, 0.5) + Vector((0, 0.04 * ESC, 0)), costas]
            pecas.append(tubo(pts, [(0.013 * ESC, 0.004)] * 5, f"{PID}_alca", mat, lados=6, arm=arm, osso="Spine2"))
            pecas.append(tubo([topo + Vector((0, -0.006, -0.005)), topo + Vector((0, -0.012, -0.005))], [0.009 * ESC] * 2,
                              f"{PID}_botao", material("botao", hexf("#D9B25A"), rough=0.3, metal=0.8), lados=10,
                              arm=arm, osso="Spine1"))
        esconder.append(("pernas", osso("LeftFoot").z + 0.025 * ESC))
    elif t == "meia":
        alt = osso("LeftLeg").lerp(osso("LeftFoot"), R.get("altura", 0.55)).z
        pecas.append(peca(t, corpo, PERNAS | PES, [(Vector((0, 0, alt)), Vector((0, 0, 1)), False)], 0.0018, mat,
                          espessura=0.0))

for R in [r for r in F["roupas"] if r.get("_de_vestido")] + [r for r in F["roupas"] if r["tipo"] == "saia" and not r.get("_de_vestido")]:
    cor = R.get("cor", "#CCCCCC")
    mat = mat_tecido(f"saia_{len(pecas)}", R.get("tecido", "liso"), cor, R.get("cor2"))
    z_fim = {"joelho": osso("LeftLeg").z - 0.02 * ESC, "curta": osso("LeftLeg").z + 0.08 * ESC,
             "tornozelo": osso("LeftFoot").z + 0.06 * ESC, "canela": osso("LeftLeg").lerp(osso("LeftFoot"), 0.55).z}[R.get("comprimento", "joelho")]
    roda = R.get("roda", 1.2)
    planos = [(Vector((0, 0, z_fim)), Vector((0, 0, -1)), False),
              (Vector((0, 0, Z_SAIA)), Vector((0, 0, 1)), False)]

    def rmin_saia(dom, tt, roda=roda, z_fim=z_fim):
        return 0.0
    o = peca("saia", saia_h, TORSO | PERNAS | {"LeftLeg", "RightLeg"}, planos, 0.012, mat, espessura=0.003)
    # roda: abre a barra proporcionalmente à distância da cintura
    me_ = o.data
    zc = Z_SAIA
    for v in me_.vertices:
        p = o.matrix_world @ v.co
        k = max(0.0, (zc - p.z) / max(0.01, zc - z_fim))
        cx = Vector((HIPS.x, HIPS.y, p.z))
        d = p - cx
        d.z = 0
        p2 = cx + d * (1 + (roda - 1) * k)
        v.co = o.matrix_world.inverted() @ Vector((p2.x, p2.y, p.z))
    pecas.append(o)

# calçados (forma própria em volta do pé)
CAL = F["calcado"]
M_CAL = material("calcado", hexf(CAL["cor"]), rough=CAL.get("rough", 0.55))
M_SOLA = material("sola", hexf(CAL.get("sola", "#D2D2D2")), rough=0.7)
for lado in ("Left", "Right"):
    f, tb, tt = osso(lado + "Foot"), osso(lado + "ToeBase"), osso(lado + "ToeBase", True)
    d = Vector((tt.x - f.x, tt.y - f.y, 0)).normalized()
    a0 = Vector((f.x, f.y, 0))
    comp = Vector((tt.x - f.x, tt.y - f.y, 0)).length
    e = ESC
    if CAL["tipo"] == "sandalia":
        sola = tubo([a0 + d * (-0.07 * e) + Vector((0, 0, 0.008)), a0 + d * (comp + 0.035 * e) + Vector((0, 0, 0.008))],
                    [(0.05 * e, 0.008)] * 2, f"{PID}_sola", M_SOLA, lados=14, arm=arm, osso=lado + "Foot")
        pecas.append(sola)
        for tt_, rr in ((0.15, 0.045), (0.62, 0.05)):
            c = a0 + d * (comp * tt_) + Vector((0, 0, 0.03 * e))
            lado_v = d.cross(Vector((0, 0, 1)))
            pts = [c + lado_v * math.cos(a) * rr * e + Vector((0, 0, math.sin(a) * 0.035 * e)) for a in
                   [math.pi * k / 8 for k in range(9)]]
            pecas.append(tubo(pts, [(0.008 * e, 0.003)] * 9, f"{PID}_tira", M_CAL, lados=6, arm=arm, osso=lado + "Foot"))
        continue
    alto = 0.075 if CAL["tipo"] in ("tenis", "bebe") else 0.06
    perfil = [(-0.075, 0.045, 0.04, alto - 0.015), (-0.04, 0.058, 0.055, alto), (0.02, 0.06, 0.05, alto + 0.002),
              (comp / e * 0.55, 0.062, 0.044, alto - 0.02), (comp / e * 0.9, 0.058, 0.036, alto - 0.03),
              (comp / e + 0.02, 0.045, 0.028, 0.035), (comp / e + 0.045, 0.02, 0.014, 0.03)]
    pts = [a0 + d * (t_ * e) + Vector((0, 0, z * e)) for t_, _, _, z in perfil]
    ten = tubo(pts, [(w_ * e, h_ * e) for _, w_, h_, _ in perfil], f"{PID}_calcado", M_CAL, lados=14,
               arm=arm, pesos=lambda co, f=f, d=d, tb=tb, lado=lado: {lado + "ToeBase": 1}
               if Vector((co.x - f.x, co.y - f.y, 0)).dot(d) > Vector((tb.x - f.x, tb.y - f.y, 0)).dot(d) else {lado + "Foot": 1})
    s_ = ten.modifiers.new("sub", "SUBSURF")
    s_.levels = 1
    ten.modifiers.move(len(ten.modifiers) - 1, 0)
    pecas.append(ten)
    pecas.append(tubo([a0 + d * (-0.08 * e) + Vector((0, 0, 0.012 * e)), a0 + d * (comp + 0.04 * e) + Vector((0, 0, 0.012 * e))],
                      [(0.064 * e, 0.012 * e)] * 2, f"{PID}_sola", M_SOLA, lados=14, arm=arm, osso=lado + "Foot"))
    esconder.append(("pes", 0.0))

# apaga a pele coberta (evita a pele atravessar a roupa e economiza polígonos)
bm = bmesh.new()
bm.from_mesh(corpo.data)
dl = bm.verts.layers.deform.active
dom = dominante_fn(corpo)
apagar = []
decote_pele = next((lim for t_, lim in esconder if t_ == "decote"), None)
for f in bm.faces:
    if f.material_index != 0:
        continue
    c = corpo.matrix_world @ f.calc_center_median()
    ds_ = {dom(v, dl) for v in f.verts}
    for tipo_, lim in esconder:
        if tipo_ == "tronco" and ds_ <= (TORSO - {"Neck"}) and lim + 0.03 < c.z < NECK.z - 0.1 * ESC and not (
                decote_pele and c.y < HIPS.y and c.z > decote_pele - 0.05 * ESC):
            apagar.append(f)
            break
        if tipo_ == "pernas" and ds_ <= (PERNAS | {"Hips"}) and lim + 0.03 < c.z < HIPS.z - 0.02:
            apagar.append(f)
            break
        if tipo_ == "braco":
            lado = "Left" if c.x > 0 else "Right"
            if ds_ <= {lado + "Arm", lado + "Shoulder", lado + "ForeArm"}:
                pl_co, pl_no, _ = plano_manga(lado, lim)
                if (c - pl_co).dot(pl_no) < -0.035 * ESC and abs(c.x) > abs(osso(lado + "Shoulder").x) + 0.02 * ESC:
                    apagar.append(f)
                    break
        if tipo_ == "pes" and ds_ <= PES and c.z < 0.06 * ESC:
            apagar.append(f)
            break
bmesh.ops.delete(bm, geom=apagar, context="FACES")
bm.to_mesh(corpo.data)
bm.free()

# ================================================================== 5. cabelo
EST = F["cabelo"]


def textura_fios(mascara, campo_fn, n_fios, comp, larg, alfa, semente, cor=COR_CAB, tipo="liso"):
    brilho = tuple(min(255, int(c * 1.9 + 18)) for c in cor)
    img = Image.new("RGBA", (N, N), cor + (0,))
    d = ImageDraw.Draw(img)
    r_ = random.Random(semente)
    for p in det.amostrar_regiao(proj, mascara, n_fios, semente, na_cabeca):
        c = brilho if r_.random() < 0.15 else tuple(max(0, min(255, int(k * r_.uniform(0.8, 1.2)))) for k in cor)
        if tipo == "cacheado":
            fn = (lambda base: (lambda q: (base + Vector((math.sin(q.z * 900), math.cos(q.x * 900), 0)) * 0.9).normalized()))(campo_fn(p))
        else:
            fn = campo_fn
        det.desenhar_fios(d, proj, det.fio(proj, p, fn, comp * r_.uniform(0.7, 1.3), 4), c, larg, int(alfa * r_.uniform(0.7, 1.0)))
    return img


camadas = []
CAMPO = campo_risca if EST in ("ondulado", "coque", "cacheado_longo") else campo
TIPO_FIO = "cacheado" if "cacheado" in EST else "liso"
n_camadas = {"bebe": 1, "grisalho": 2}.get(EST, 3)
for k, (afastar, n_fios, comp, alfa, fator) in enumerate(((0.0022, 26000, 0.016, 235, 1.0), (0.0055, 16000, 0.02, 210, 0.95),
                                                         (0.0095, 9000, 0.024, 190, 0.8))[:n_camadas]):
    fat = fator * (0.45 if EST == "bebe" else 1.0)
    mk = (lambda f_: (lambda p: m_cabelo(p) * (f_ if fc(p)[1] > 0.5 else f_ * 0.4)))(fat)
    tex = textura_fios(mk, CAMPO, int(n_fios * (0.5 if EST == "bebe" else 1)), comp * ESC, 2, alfa, 20 + k, tipo=TIPO_FIO)
    mat = det.material_alfa(f"{PID}_cabelo_{k}", salvar(tex, f"cabelo_{k}"))
    camadas.append(det.casca_alfa(corpo, mk, f"{PID}_cabelo_{k}", mat, afastar * ESC, na_cabeca, arm))
if F.get("barba"):
    for k, (afastar, n_fios, alfa) in enumerate(((0.0012, 16000, 215), (0.0028, 9000, 170))):
        tex = textura_fios(m_barba, lambda q: Vector((0, -0.3, -1)), n_fios, 0.006, 2, alfa, 40 + k, cor=hex8(F["barba"]))
        mat = det.material_alfa(f"{PID}_barba_{k}", salvar(tex, f"barba_{k}"))
        camadas.append(det.casca_alfa(corpo, m_barba, f"{PID}_barba_{k}", mat, afastar, na_cabeca, arm))


def raizes(cond, n, semente):
    return det.amostrar_regiao(proj, lambda p: m_cabelo(p) * (1 if cond(fc(p)) else 0), n, semente, na_cabeca)


def peso_longo(p):
    if p.z > NECK.z + 0.02 * ESC:
        return {"Head": 1.0}
    k = S((NECK.z + 0.02 * ESC - p.z) / (0.12 * ESC))
    return {"Head": 1 - 0.6 * k, "Spine2": 0.6 * k}


Z_ORELHA = OC.z - 0.6 * D
cards = []
if EST == "topete":
    M_CARD = det.material_alfa(f"{PID}_mecha", salvar(cb.textura_mecha("liso", COR_CAB), "mecha"))
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
            lift = (0.004 + 0.016 * math.sin(math.pi * min(1, t * 1.15)) ** 0.7) * ESC
            pts.append(hit[0] + nrm * lift)
            nors.append(nrm)
            q = det.tangente(proj, hit[0], Vector((u * 0.04, 0.35 + 0.65 * t, 0.9 - 0.75 * t)).normalized(), 0.012 * ESC)
        cards.append(det.card(f"{PID}_mecha_{k}", pts, nors, [D * w for w in (0.18, 0.28, 0.33, 0.33, 0.3, 0.26, 0.2, 0.13, 0.05)],
                              M_CARD, arm))
elif EST == "espetado":
    M_CARD = det.material_alfa(f"{PID}_mecha", salvar(cb.textura_mecha("liso", COR_CAB), "mecha"))
    cards = cb.mechas(proj, raizes(lambda f_: f_[1] > 1.6, 34, 5),
                      lambda p: (Vector((0, -0.25, 1)) + campo(p) * 0.6).normalized(), M_CARD, arm, f"{PID}_esp",
                      comp=(0.045 * ESC, 0.075 * ESC), larg=(0.012 * ESC, 0.018 * ESC), h=(0.004, 0.03), passo=0.007 * ESC)
elif EST == "baguncado":
    M_CARD = det.material_alfa(f"{PID}_mecha", salvar(cb.textura_mecha("liso", COR_CAB), "mecha"))
    frente = lambda p: (Vector((math.copysign(0.2, fc(p)[0]), -1.0, -0.15))).normalized()  # noqa: E731
    cards = cb.mechas(proj, raizes(lambda f_: f_[1] > 1.9, 40, 6), frente, M_CARD, arm, f"{PID}_bag",
                      comp=(0.05 * ESC, 0.08 * ESC), larg=(0.012 * ESC, 0.02 * ESC), h=(0.004, 0.012), passo=0.007 * ESC)
elif EST in ("ondulado", "cacheado_longo"):
    cacho = EST == "cacheado_longo"
    M_CARD = det.material_alfa(f"{PID}_mecha", salvar(cb.textura_mecha("cacheado" if cacho else "ondulado", COR_CAB), "mecha"))
    n_m = 230 if cacho else 260
    comp = F.get("comprimento_cabelo", 0.36)
    cards = cb.mechas(proj, raizes(lambda f_: f_[1] > 0.6, n_m, 7), campo_risca, M_CARD, arm, f"{PID}_longo",
                      comp=(comp * 0.8 * ESC, comp * 1.05 * ESC), larg=((0.012 if cacho else 0.036) * ESC, (0.018 if cacho else 0.055) * ESC),
                      z_queda=Z_ORELHA, onda=0.0 if cacho else 0.004 * ESC, espiral=0.008 * ESC if cacho else 0.0,
                      periodo=0.035 * ESC if cacho else 0.07 * ESC, h=(0.004, 0.016 if cacho else 0.01),
                      peso_fn=peso_longo, passo=0.008 * ESC)
elif EST == "cacheado_curto":
    # cachinhos curtos: muitos tufos largos e rentes, em espiral fechada, formando volume fofo
    M_CARD = det.material_alfa(f"{PID}_mecha", salvar(cb.textura_mecha("cacheado", COR_CAB, fios=900), "mecha"))
    cards = cb.mechas(proj, raizes(lambda f_: f_[1] > -0.5, 240, 8), campo, M_CARD, arm, f"{PID}_cachos",
                      comp=(0.022 * ESC, 0.038 * ESC), larg=(0.014 * ESC, 0.021 * ESC), espiral=0.0035 * ESC,
                      periodo=0.02 * ESC, h=(0.004, 0.011), passo=0.005 * ESC)
elif EST == "coque":
    M_CARD = det.material_alfa(f"{PID}_mecha", salvar(cb.textura_mecha("liso", COR_CAB), "mecha"))
    alvo_coque = OC + Vector((0, 1.4 * D, 2.6 * D))
    fl = lambda p: (alvo_coque - p).normalized()  # noqa: E731
    cards = cb.mechas(proj, raizes(lambda f_: True, 90, 9), fl, M_CARD, arm, f"{PID}_puxado",
                      comp=(0.06 * ESC, 0.1 * ESC), larg=(0.012 * ESC, 0.02 * ESC), h=(0.003, 0.008), passo=0.008 * ESC)
    M_COQUE = material("coque", tuple(c / 255 for c in COR_CAB), rough=0.5)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, radius=0.9 * D, location=alvo_coque)
    coque = bpy.context.active_object
    coque.name = f"{PID}_coque"
    coque.scale = (1.0, 0.9, 0.8)
    coque.data.materials.append(M_COQUE)
    for p_ in coque.data.polygons:
        p_.use_smooth = True
    coque.vertex_groups.new(name=P + "Head").add(list(range(len(coque.data.vertices))), 1.0, "REPLACE")
    coque.modifiers.new("Esqueleto", "ARMATURE").object = arm
    cards.append(coque)
    for k in range(18):
        a0_ = 2 * math.pi * k / 18
        pts = [alvo_coque + Vector((math.cos(a0_ + t * 2.4) * D * (0.95 - 0.2 * t), math.sin(a0_ + t * 2.4) * D * 0.85 * (0.95 - 0.2 * t),
                                    (t - 0.5) * 0.6 * D)) for t in [i / 7 for i in range(8)]]
        nors = [(p - alvo_coque).normalized() for p in pts]
        cards.append(det.card(f"{PID}_coque_{k}", pts, nors, [0.28 * D] * 8, M_CARD, arm))
elif EST == "bebe":
    M_CARD = det.material_alfa(f"{PID}_mecha", salvar(cb.textura_mecha("ondulado", COR_CAB), "mecha"))
    cards = cb.mechas(proj, raizes(lambda f_: f_[1] > 1.6, 40, 10), campo, M_CARD, arm, f"{PID}_tufo",
                      comp=(0.02 * ESC, 0.032 * ESC), larg=(0.012 * ESC, 0.018 * ESC), espiral=0.002 * ESC, periodo=0.03 * ESC,
                      h=(0.002, 0.005), passo=0.005 * ESC)
camadas += cards
scn.cycles.transparent_max_bounces = 64

# ================================================================== 6. acessórios
justa_capuz = justa  # o capuz sai da casca justa do pescoço e das costas
for A in F.get("acessorios", []):
    tipo = A[0]
    if tipo == "oculos":
        M_ARM = material("armacao", hexf(A[2] if len(A) > 2 else "#2A2A2A"), rough=0.3)
        for s in (-1, 1):
            c = (ESQ if s > 0 else DIR) + Vector((0, -0.9 * D, 0.05 * D))
            rx, rz = (0.85 * D, 0.62 * D) if A[1] == "quadrado" else (0.78 * D, 0.78 * D)
            n_ = 16
            pts = []
            for k in range(n_):
                a = 2 * math.pi * k / n_
                if A[1] == "quadrado":
                    cx_, cz_ = math.cos(a), math.sin(a)
                    m_ = max(abs(cx_), abs(cz_)) ** 0.6
                    pts.append(c + Vector((cx_ / m_ * rx * 0.9, 0, cz_ / m_ * rz * 0.9)))
                else:
                    pts.append(c + Vector((math.cos(a) * rx, 0, math.sin(a) * rz)))
            pecas.append(tubo(pts, [0.06 * D] * n_, f"{PID}_aro", M_ARM, lados=6, fechado=True, arm=arm))
            haste_ini = c + Vector((s * rx, 0, 0.1 * D))
            orelha = proj.perto(OC + Vector((s * 2.1 * D, 1.0 * D, 0.1 * D)))[0] + Vector((s * 0.15 * D, 0, 0))
            pecas.append(tubo([haste_ini, haste_ini.lerp(orelha, 0.5) + Vector((s * 0.25 * D, 0, 0)), orelha],
                              [0.05 * D] * 3, f"{PID}_haste", M_ARM, lados=6, arm=arm))
        ponte = [ESQ + Vector((-0.6 * D, -0.95 * D, 0.2 * D)), OC + Vector((0, -1.05 * D, 0.3 * D)),
                 DIR + Vector((0.6 * D, -0.95 * D, 0.2 * D))]
        pecas.append(tubo(ponte, [0.05 * D] * 3, f"{PID}_ponte", M_ARM, lados=6, arm=arm))
    elif tipo == "boina":
        # boina de motorista montada por anéis: faixa justa na testa, copa que estufa e topo chato
        # mais largo e puxado para a frente, por cima da aba
        M_B = mat_tecido("boina", "tweed", A[1], rough=0.9, escala=(2, 2))
        z_ref = OC.z + 1.6 * D
        fr_ = proj.raio(Vector((OC.x, OC.y - 0.5, z_ref)), Vector((0, 1, 0)))[0]
        tr_ = proj.raio(Vector((OC.x, OC.y + 0.5, z_ref)), Vector((0, -1, 0)))[0]
        HC = Vector((OC.x, (fr_.y + tr_.y) / 2, z_ref))
        topo_c = proj.raio(Vector((HC.x, HC.y, HC.z + 0.5)), Vector((0, 0, -1)))[0]
        N_ = 28
        faixa = []
        for k in range(N_):
            a = 2 * math.pi * k / N_
            dirc = Vector((math.sin(a), -math.cos(a), 0))  # k=0 é a frente
            frente_ = max(0.0, -dirc.y)
            z_b = HC.z + (-0.25 * frente_ - 0.55 * (1 - frente_)) * D  # mais baixa atrás e dos lados
            hit = proj.raio(Vector((HC.x, HC.y, z_b)) + dirc * 0.5, -dirc)
            p_ = hit[0] if hit else Vector((HC.x, HC.y, z_b)) + dirc * 2.2 * D
            faixa.append(p_ + dirc * 0.012 * ESC)
        z_topo = topo_c.z + 0.012 * ESC
        aneis = [faixa]
        for f_alt, f_larg, f_frente in ((0.5, 1.07, 0.1), (0.85, 1.11, 0.3), (0.97, 1.06, 0.42), (1.0, 0.75, 0.4)):
            anel = []
            for k, p_ in enumerate(faixa):
                a = 2 * math.pi * k / N_
                frente_ = max(0.0, math.cos(a))
                d_ = Vector((p_.x - HC.x, p_.y - HC.y, 0)) * f_larg
                z_ = p_.z + (z_topo - 0.75 * D * frente_ ** 1.5 - p_.z) * f_alt
                anel.append(Vector((HC.x + d_.x, HC.y + d_.y - f_frente * D, z_)))
            aneis.append(anel)
        bm_ = bmesh.new()
        vv = [[bm_.verts.new(p_) for p_ in anel] for anel in aneis]
        for r_ in range(len(vv) - 1):
            for k in range(N_):
                bm_.faces.new((vv[r_][k], vv[r_][(k + 1) % N_], vv[r_ + 1][(k + 1) % N_], vv[r_ + 1][k]))
        centro = sum(aneis[-1], Vector()) / N_
        cv = bm_.verts.new(centro + Vector((0, 0, 0.004)))
        for k in range(N_):
            bm_.faces.new((vv[-1][k], vv[-1][(k + 1) % N_], cv))
        botao_b = centro + Vector((0, 0, 0.006))
        bmesh.ops.recalc_face_normals(bm_, faces=bm_.faces)
        me_b = bpy.data.meshes.new(f"{PID}_boina")
        bm_.to_mesh(me_b)
        bm_.free()
        boina = bpy.data.objects.new(f"{PID}_boina", me_b)
        scn.collection.objects.link(boina)
        me_b.materials.append(M_B)
        for p_ in me_b.polygons:
            p_.use_smooth = True
        boina.modifiers.new("sub", "SUBSURF").levels = 2
        so_b = boina.modifiers.new("solid", "SOLIDIFY")
        so_b.thickness = 0.004
        so_b.offset = -1
        boina.vertex_groups.new(name=P + "Head").add(list(range(len(me_b.vertices))), 1.0, "REPLACE")
        boina.modifiers.new("Esqueleto", "ARMATURE").object = arm
        pecas.append(boina)
        # aba: placa curva presa à faixa da frente, levemente inclinada para baixo
        bm_ = bmesh.new()
        ks = [k % N_ for k in range(-5, 6)]
        dentro, fora_ = [], []
        for k in ks:
            p_ = faixa[k]
            a = 2 * math.pi * k / N_
            prof = 0.95 * D * math.cos(a * 1.25) ** 0.7
            dentro.append(bm_.verts.new(p_ + Vector((0, 0.004, 0.004))))
            fora_.append(bm_.verts.new(p_ + Vector((math.sin(a) * 0.15 * D, -prof, -0.18 * prof))))
        for k in range(len(ks) - 1):
            bm_.faces.new((dentro[k], dentro[k + 1], fora_[k + 1], fora_[k]))
        me_a = bpy.data.meshes.new(f"{PID}_aba")
        bm_.to_mesh(me_a)
        bm_.free()
        aba_o = bpy.data.objects.new(f"{PID}_aba", me_a)
        scn.collection.objects.link(aba_o)
        me_a.materials.append(M_B)
        for p_ in me_a.polygons:
            p_.use_smooth = True
        aba_o.modifiers.new("sub", "SUBSURF").levels = 1
        so_a = aba_o.modifiers.new("solid", "SOLIDIFY")
        so_a.thickness = 0.006
        so_a.offset = 0
        aba_o.vertex_groups.new(name=P + "Head").add(list(range(len(me_a.vertices))), 1.0, "REPLACE")
        aba_o.modifiers.new("Esqueleto", "ARMATURE").object = arm
        pecas.append(aba_o)
        pecas.append(tubo([botao_b, botao_b + Vector((0, 0, 0.005))], [0.008 * ESC] * 2, f"{PID}_botao_boina", M_B,
                          lados=10, arm=arm))
    elif tipo == "brinco":
        M_O = material("ouro", hexf("#E2B24A"), rough=0.2, metal=1.0)
        for s in (-1, 1):
            lobo = proj.perto(OC + Vector((s * 2.15 * D, 0.55 * D, -1.15 * D)))[0]
            c = lobo + Vector((0, 0, -0.35 * D))
            pts = [c + Vector((0, math.cos(a) * 0.32 * D, math.sin(a) * 0.32 * D)) for a in [2 * math.pi * k / 12 for k in range(12)]]
            pecas.append(tubo(pts, [0.05 * D] * 12, f"{PID}_brinco", M_O, lados=6, fechado=True, arm=arm))
    elif tipo == "colar":
        M_O = material("ouro_c", hexf("#E2B24A"), rough=0.2, metal=1.0)
        pts = []
        for k in range(20):
            a = 2 * math.pi * k / 20
            pts.append(proj.perto(NECK + Vector((math.sin(a) * 0.08 * ESC, -math.cos(a) * 0.07 * ESC, -0.03 * ESC)))[0]
                       + Vector((math.sin(a), -math.cos(a), 0)) * 0.006)
        pecas.append(tubo(pts, [0.0018] * 20, f"{PID}_colar", M_O, lados=5, fechado=True, arm=arm, osso="Spine2"))
    elif tipo in ("laco", "tiara"):
        M_L = material("laco", hexf(A[1]), rough=0.5)
        if tipo == "tiara":
            pts = [proj.perto(OC + Vector((math.cos(a) * 2.4 * D, 0.9 * D - math.sin(a) * 0.4 * D, 2.0 * D + math.sin(a) * 1.0 * D)))[0]
                   for a in [math.pi * k / 12 for k in range(13)]]
            pts = [p + (p - (OC + Vector((0, 1.0 * D, 0.6 * D)))).normalized() * 0.006 for p in pts]
            pecas.append(tubo(pts, [(0.18 * D, 0.06 * D)] * 13, f"{PID}_tiara", M_L, lados=6, arm=arm))
        pos = A[2] if len(A) > 2 else (0.5, 0.2, 0.85)
        base = proj.raio(OC + Vector(pos).normalized() * 6 * D + Vector((0, 0.9 * D, 0.8 * D)), -Vector(pos).normalized())
        c = (base[0] if base else OC + Vector((0, D, 3 * D))) + (Vector(pos).normalized()) * 0.15 * D
        for s in (-1, 1):
            pts = [c, c + Vector((s * 0.6 * D, 0, 0.35 * D)), c + Vector((s * 1.1 * D, 0, 0.1 * D)),
                   c + Vector((s * 0.65 * D, 0, -0.3 * D)), c]
            pecas.append(tubo(pts, [(0.25 * D, 0.12 * D), (0.45 * D, 0.14 * D), (0.35 * D, 0.12 * D), (0.4 * D, 0.13 * D),
                                    (0.25 * D, 0.12 * D)], f"{PID}_laco", M_L, lados=8, arm=arm))
        pecas.append(tubo([c - Vector((0, 0, 0.2 * D)), c + Vector((0, 0, 0.2 * D))], [0.22 * D, 0.22 * D], f"{PID}_no", M_L,
                          lados=8, arm=arm))
    elif tipo == "suspensorio":
        M_S = material("suspensorio", hexf(A[1]), rough=0.6)
        camisa = next((o_ for o_ in pecas if o_.name.startswith(f"{PID}_blusa")), None)
        proj_t = det.Projetor(camisa, 16) if camisa else proj  # passa por cima da camisa, não da pele
        for s in (-1, 1):
            pts = []
            zs_s = [HIPS.z + 0.05 * ESC + (NECK.z - 0.06 * ESC - HIPS.z - 0.05 * ESC) * k / 7 for k in range(8)]
            for z_, frente in [(z_, -1) for z_ in zs_s] + [(None, 0)] + [(z_, 1) for z_ in reversed(zs_s)]:
                if frente:
                    o_ = Vector((s * 0.085 * ESC, HIPS.y + frente * 0.4, z_))
                    hit = proj_t.raio(o_, Vector((0, -frente, 0)).normalized())
                else:  # por cima do ombro
                    hit = proj_t.raio(Vector((s * 0.095 * ESC, NECK.y, NECK.z + 0.4)), Vector((0, 0, -1)))
                if hit:
                    nrm = hit[1].normalized()
                    pts.append(hit[0] + nrm * 0.008 * ESC)
            pecas.append(tubo(pts, [(0.015 * ESC, 0.003)] * len(pts), f"{PID}_suspensorio", M_S, lados=6, arm=arm,
                              pesos=lambda co: {"Spine1": 0.5, "Spine2": 0.5}))
    elif tipo == "cinto":
        M_C = material("cinto", hexf(A[1]), rough=0.45)
        z_ = HIPS.z + 0.045 * ESC
        pts = []
        for k in range(24):
            a = 2 * math.pi * k / 24
            dirc = Vector((math.sin(a), -math.cos(a), 0))
            o_ = Vector((HIPS.x, HIPS.y, z_)) + dirc * 0.4
            hit = proj.raio(o_, -dirc)
            if hit:
                pts.append(hit[0] + dirc * 0.013 * ESC)
        pecas.append(tubo(pts, [(0.004, 0.017 * ESC)] * len(pts), f"{PID}_cinto", M_C, lados=4, fechado=True, arm=arm, osso="Hips"))
        frente_c = min(pts, key=lambda p: p.y)
        pecas.append(tubo([frente_c + Vector((0, -0.004, 0)), frente_c + Vector((0, -0.009, 0))], [(0.02 * ESC, 0.014 * ESC)] * 2,
                          f"{PID}_fivela", material("fivela", hexf("#D9B25A"), rough=0.25, metal=0.9), lados=4, arm=arm, osso="Hips"))
    elif tipo == "capuz":
        M_H = mat_tecido("capuz", "malha", A[1])
        sp2 = osso("Spine2")
        capuz = peca("capuz", justa_capuz, TORSO | {"Head"}, [(Vector((0, 0, sp2.z + 0.03 * ESC)), Vector((0, 0, -1)), False),
                                                         (NECK + Vector((0, 0, 0.05 * ESC)), Vector((0, 0, 1)), False)],
                     0.03 * ESC, M_H, espessura=0.008, recortes=lambda c: c.y < NECK.y + 0.005, sub=1)
        pecas.append(capuz)
        M_BR = material("cordao", hexf("#F2F2F2"), rough=0.6)
        for s in (-1, 1):
            a_ = NECK + Vector((s * 0.035 * ESC, -0.085 * ESC, -0.03 * ESC))
            pecas.append(tubo([a_, a_ + Vector((0, -0.01, -0.12 * ESC))], [0.0035, 0.0035], f"{PID}_cordao", M_BR, lados=6,
                              arm=arm, osso="Spine2"))
    elif tipo == "botoes":
        M_BT = material("botoes", hexf(A[1] if len(A) > 1 else "#F5F2E8"), rough=0.3)
        for k in range(5):
            z_ = NECK.z - (0.05 + 0.075 * k) * ESC
            hit = proj.raio(Vector((0, HIPS.y - 0.4, z_)), Vector((0, 1, 0)))
            if hit:
                c = hit[0] + Vector((0, -0.016 * ESC, 0))
                pecas.append(tubo([c, c + Vector((0, -0.003, 0))], [0.006 * ESC] * 2, f"{PID}_botao", M_BT, lados=8, arm=arm,
                                  osso="Spine2"))

# ================================================================== 7. coleção e arquivo
tudo = [corpo, olhos] + pecas + camadas
for o in (justa, saia_h):
    bpy.data.objects.remove(o, do_unlink=True)
for o in tudo:  # malhas filhas do esqueleto: mover o personagem move tudo junto
    mw = o.matrix_world.copy()
    o.parent = arm
    o.matrix_world = mw
col = bpy.data.collections.new(PID)
scn.collection.children.link(col)
for o in tudo + [arm]:
    for c_ in list(o.users_collection):
        c_.objects.unlink(o)
    col.objects.link(o)
arm["nome"] = F["nome"]
arm["altura"] = ALT
arm["quadril"] = HIPS.z
dg = bpy.context.evaluated_depsgraph_get()
tris = 0
for o in tudo:
    ev = o.evaluated_get(dg)
    m_ = ev.to_mesh()
    m_.calc_loop_triangles()
    tris += len(m_.loop_triangles)
    ev.to_mesh_clear()
arm["triangulos_alta"] = tris
print(PID, "triângulos (alta):", tris, "objetos:", len(tudo))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(os.path.dirname(LIB), f"mh_{PID}.blend"), compress=True)
print("ok", PID)
