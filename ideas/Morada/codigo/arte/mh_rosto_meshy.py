"""Teste: cabeça do MakeHuman (topologia boa, olhos, pálpebras, dentes, língua, expressões) vestida com a
forma e a textura do rosto do Meshy.

Uso: python mh_rosto_meshy.py <personagem.blend> <rosto_mapa.npz> <ext/> <id> <saida_dir> <medidas.json>

Etapas:
 1. Cabeça MH com macros de adulto, convertida para o espaço do Blender.
 2. Pontos-chave nos dois rostos (olhos, nariz, boca, queixo, laterais, topo, nuca, pescoço).
 3. Deformação: escala por eixo + spline de placa fina (TPS) pelos pontos-chave, depois aproximação iterativa
    da pele do rosto à superfície do Meshy com suavização (pálpebras e boca seguem só a deformação suave).
 4. Globos oculares esféricos encaixados na abertura das pálpebras.
 5. Textura do Meshy (olhos e boca pintados apagados) transferida por bake para o UV da cabeça MH.
 6. Expressões do MH como shape keys, convertidas pela deformação local (jacobiano) para a escala cartoon.
 7. Rosto do Meshy apagado (fica cabelo, orelhas e roupa); cabeça MH presa ao esqueleto.
"""
import json
import math
import os
import sys

import bpy
import bmesh  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Vector  # noqa: E402
from mathutils.bvhtree import BVHTree  # noqa: E402
from mathutils.kdtree import KDTree  # noqa: E402
from PIL import Image, ImageDraw, ImageFilter  # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mh_base as mh  # noqa: E402

BLEND, MAPA, EXT, PID, OUT, MEDIDAS_JSON = sys.argv[1:7]
# medidas do rosto do Meshy (metros, vista de frente): olhos, boca, nariz, queixo. Ver rosto_medidas_*.json
MED = json.load(open(MEDIDAS_JSON))
os.makedirs(OUT, exist_ok=True)
P = "mixamorig:"
DATA = os.path.join(EXT, "makehuman", "makehuman", "data")
PESOS = os.path.join(EXT, "mpfb2", "src", "mpfb", "data", "rigs", "standard", "weights.mixamo.json")
ETNIA = {"caucasian": 0.5, "african": 0.3, "asian": 0.2}

bpy.ops.wm.open_mainfile(filepath=BLEND)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
meshy = next(o for o in bpy.data.objects if o.type == "MESH" and o.name.startswith(PID + "_corpo"))
arm.data.pose_position = "REST"
for t in (arm.animation_data.nla_tracks if arm.animation_data else []):
    t.mute = True
bpy.context.view_layer.update()
scn = bpy.context.scene

# ------------------------------------------------------------------ Meshy: textura e classificação das faces
img_m = next(i for i in bpy.data.images if i.size[0] > 0 and i.name.startswith(PID))
TW, TH = img_m.size
TEX = np.array(img_m.pixels[:], dtype=np.float32).reshape(TH, TW, 4)[..., :3]  # sRGB, linha 0 = baixo
mm = meshy.data
mm.calc_loop_triangles()
mw = meshy.matrix_world
MV = np.array([tuple(mw @ v.co) for v in mm.vertices])
uvm = mm.uv_layers.active.data
nomes_g = {g.index: g.name for g in meshy.vertex_groups}


def cor_face(p):
    u = np.mean([uvm[l].uv[0] for l in p.loop_indices])
    v = np.mean([uvm[l].uv[1] for l in p.loop_indices])
    return TEX[min(TH - 1, int(v * TH)), min(TW - 1, int(u * TW))]


def dom_face(p):
    soma = {}
    for vi in p.vertices:
        for g in mm.vertices[vi].groups:
            soma[nomes_g[g.group]] = soma.get(nomes_g[g.group], 0) + g.weight
    return max(soma, key=soma.get) if soma else None


CLASSE = {}
for p in mm.polygons:
    c = cor_face(p)
    cen = mw @ p.center
    lum = float(c.mean())
    marrom = lum < 0.36 and c[0] > c[2] + 0.05
    pele = lum > 0.42 and c[0] > c[1] > c[2]
    azul = c[2] > c[0] + 0.05
    d = dom_face(p)
    if d not in (P + "Head", P + "Neck", P + "HeadTop_End", "headfront"):
        CLASSE[p.index] = "corpo"
    elif azul or (lum > 0.8 and cen.z < 1.42):
        CLASSE[p.index] = "roupa"
    elif MED.get("tem_cabelo", True) and marrom and (cen.z > 1.645 or (cen.y > -0.04 and cen.z > 1.50)
                                                    or (abs(cen.x) > 0.088 and cen.z > 1.565)):
        CLASSE[p.index] = "cabelo"
    elif pele and abs(cen.x) > MED.get("orelha_x", 0.106) and MED["olhos"]["l"]["zc"] - 0.07 < cen.z < MED["olhos"]["l"]["zc"] + 0.06 \
            and cen.y > -0.06:
        CLASSE[p.index] = "orelha"
    else:
        CLASSE[p.index] = "rosto"
print("classes", {k: list(CLASSE.values()).count(k) for k in set(CLASSE.values())})


def bvh_de(classes):
    ids = [p.index for p in mm.polygons if CLASSE[p.index] in classes]
    tris, mapa = [], []
    for lt in mm.loop_triangles:
        if CLASSE[lt.polygon_index] in classes:
            tris.append(tuple(lt.vertices))
            mapa.append(lt.polygon_index)
    return BVHTree.FromPolygons([Vector(v) for v in MV], tris), ids


BVH_ROSTO, IDS_ROSTO = bvh_de({"rosto"})
BVH_CABELO, IDS_CABELO = bvh_de({"cabelo"})
BVH_TUDO, _ = bvh_de({"rosto", "orelha", "cabelo"})

# ------------------------------------------------------------------ 1. cabeça MH
vs, vts, faces = mh.ler_obj(os.path.join(DATA, "3dobjs", "base.obj"))
mh.macros(vs, DATA, 1.0, 33, 0.62, 0.55, ETNIA)
mh.definir_chao(vs, faces)
BASE = np.array([tuple(mh.mh_para_blender(v)) for v in vs])
G = mh.GRUPOS
W = json.load(open(PESOS))["weights"]
w_head = np.zeros(len(vs))
w_neck = np.zeros(len(vs))
for i, val in W[P + "Head"]:
    w_head[i] = val
for i, val in W[P + "Neck"]:
    w_neck[i] = val
GR_EXTRA = {"helper-upper-teeth", "helper-lower-teeth", "helper-tongue"}  # cílios de malha ficam de fora no cartoon
reg = (w_head > 0.01) | (w_neck > 0.01)
faces_cab = [f for f in faces if (f[2] == "body" and all(reg[i] for i in f[0])) or f[2] in GR_EXTRA]
REG = sorted({i for f in faces_cab for i in f[0]})
print("cabeça MH: vértices", len(REG), "faces", len(faces_cab))

vizinhos = {}
for vi, _, g in faces_cab:
    n = len(vi)
    for k in range(n):
        a, b = vi[k], vi[(k + 1) % n]
        vizinhos.setdefault(a, set()).add(b)
        vizinhos.setdefault(b, set()).add(a)


def laco_olho(lado):
    """Borda da pálpebra: a malha do MH é fechada, então a borda é o anel de vértices do corpo que encosta
    no globo (helper do olho) mais perto do eixo de visão, um por faixa de ângulo em volta do olho."""
    hv = list(G[f"helper-{lado}-eye"])
    c = BASE[hv].mean(0)
    R0 = np.linalg.norm(BASE[hv] - c, axis=1).mean()
    eixo = np.array([0.0, -1.0, 0.0])
    melhor = {}
    for i in G["body"]:
        if not reg[i]:
            continue
        v = BASE[i] - c
        dist = np.linalg.norm(v)
        if abs(dist - R0) > 0.0025 or dist < 1e-6:
            continue
        w = v / dist
        polar = math.acos(max(-1, min(1, w @ eixo)))
        if polar > 1.3:
            continue
        az = int(((math.atan2(w[2], w[0]) + math.pi) / (2 * math.pi)) * 24) % 24
        if az not in melhor or polar < melhor[az][0]:
            melhor[az] = (polar, i)
    return [melhor[k][1] for k in sorted(melhor)], c


LACO = {}
for lado in ("l", "r"):
    ids, c = laco_olho(lado)
    LACO[lado] = ids
    print("laço do olho", lado, len(ids), "centro", np.round(c, 4))


def pontos_olho(ids, pos):
    q = pos[ids]
    cx = q[:, 0].mean()
    ext = ids[int(np.argmax(np.abs(q[:, 0])))]
    inn = ids[int(np.argmin(np.abs(q[:, 0])))]
    perto = [i for i in ids if abs(pos[i][0] - cx) < 0.004] or ids
    sup = max(perto, key=lambda i: pos[i][2])
    inf = min(perto, key=lambda i: pos[i][2])
    return dict(ext=ext, int=inn, sup=sup, inf=inf)


def frente(cond):
    cand = [i for i in REG if cond(BASE[i]) and i in G["body"]]
    return min(cand, key=lambda i: BASE[i][1])


OLHO_Z = BASE[list(G["joint-l-eye"])].mean(0)[2]
BOCA_MH = BASE[list(G["joint-mouth"])].mean(0)
LM_MH = {}
for lado in ("l", "r"):
    cmh = BASE[LACO[lado]].mean(0)
    for i in LACO[lado]:
        LM_MH[f"olho_{lado}_{i}"] = i
# perfil de frente do MH (ponto mais à frente em cada altura, na linha do meio)
_meio = [i for i in REG if i in G["body"] and abs(BASE[i][0]) < 0.0025 and BASE[i][1] < -0.09]


def _frente_em(z0, z1):
    c = [i for i in _meio if z0 <= BASE[i][2] <= z1]
    return min(c, key=lambda i: BASE[i][1])


LM_MH["nariz"] = _frente_em(OLHO_Z - 0.06, OLHO_Z - 0.025)
Z_NARIZ_MH = BASE[LM_MH["nariz"]][2]
Z_LAB_MH = Z_NARIZ_MH - 0.019
# interior da boca no MH: faces perto da boca que não aparecem de frente (escondidas atrás dos lábios)
CORPO_CAB = [k for k, f in enumerate(faces_cab) if f[2] == "body"]
bvh_base = BVHTree.FromPolygons([Vector(v) for v in BASE], [faces_cab[k][0] for k in CORPO_CAB])
INTERIOR = set()
for n_, k in enumerate(CORPO_CAB):
    cen = BASE[faces_cab[k][0]].mean(0)
    if abs(cen[0]) > 0.032 or abs(cen[2] - Z_LAB_MH) > 0.0065 or cen[1] > BASE[LM_MH["nariz"]][1] + 0.04:
        continue  # só a frente do rosto (a nuca também fica "escondida" de quem olha de frente)
    loc, nor, idx, dist = bvh_base.ray_cast(Vector((cen[0], -1.0, cen[2])), Vector((0, 1, 0)))
    if loc is not None and idx != n_ and cen[1] - loc.y > 0.003:
        INTERIOR.add(k)
v_int = {i for k in INTERIOR for i in faces_cab[k][0]}
v_ext = {i for k in CORPO_CAB if k not in INTERIOR for i in faces_cab[k][0]}
LABIO = sorted(i for i in v_int & v_ext if BASE[i][1] < BASE[LM_MH["nariz"]][1] + 0.03)  # só a borda da frente (lábios)
print("joint da boca", np.round(BOCA_MH, 4))
# fenda da boca: vértices da faixa dos lábios que ficam recuados em relação à frente da vizinhança
_cand = [i for i in REG if i in G["body"] and abs(BASE[i][2] - Z_LAB_MH) < 0.0055 and abs(BASE[i][0]) < 0.036
         and BASE[i][1] < BASE[LM_MH["nariz"]][1] + 0.035]
_C = BASE[_cand]
FENDA = []
for k_, i in enumerate(_cand):
    viz_ = (np.abs(_C[:, 0] - BASE[i][0]) < 0.003) & (np.abs(_C[:, 2] - BASE[i][2]) < 0.003)
    if BASE[i][1] > _C[viz_, 1].min() + 0.004:
        FENDA.append(i)
_fm = [i for i in FENDA if abs(BASE[i][0]) < 0.006]
Z_LINHA_MH = float(np.mean([BASE[i][2] for i in _fm])) if _fm else Z_LAB_MH
LM_MH["boca_canto_l"] = max(FENDA, key=lambda i: BASE[i][0])
LM_MH["boca_canto_r"] = min(FENDA, key=lambda i: BASE[i][0])
LM_MH["labio_sup"] = _frente_em(Z_LINHA_MH + 0.0005, Z_LINHA_MH + 0.006)
LM_MH["labio_inf"] = _frente_em(Z_LINHA_MH - 0.006, Z_LINHA_MH - 0.0005)
print("linha da boca MH", round(Z_LINHA_MH, 4), "fenda", len(FENDA))
# interior só na altura da boca (embaixo do nariz também fica "escondido", mas não é boca)
INTERIOR = {k for k in INTERIOR if abs(BASE[faces_cab[k][0]].mean(0)[2] - Z_LINHA_MH) < 0.0045}
v_int = {i for k in INTERIOR for i in faces_cab[k][0]}
print("interior da boca: faces", len(INTERIOR), "borda dos lábios", len(LABIO))
LM_MH["queixo"] = _frente_em(Z_LAB_MH - 0.035, Z_LAB_MH - 0.015)
LM_MH["testa"] = frente(lambda p: abs(p[0]) < 0.006 and OLHO_Z + 0.04 < p[2] < OLHO_Z + 0.055)
OLHO_DX = abs(BASE[list(G["helper-l-eye"])].mean(0)[0])


def sup_mh(x, z):
    """Vértice da pele do MH mais à frente perto de (x, z) na vista frontal."""
    cand = [i for i in REG if i in G["body"] and abs(BASE[i][0] - x) < 0.004 and abs(BASE[i][2] - z) < 0.004]
    return min(cand, key=lambda i: BASE[i][1])


for s, lado in ((1, "l"), (-1, "r")):
    LM_MH[f"bochecha_{lado}"] = sup_mh(s * OLHO_DX * 1.5, Z_LAB_MH + 0.022)
    LM_MH[f"temporal_{lado}"] = sup_mh(s * OLHO_DX * 1.9, OLHO_Z + 0.02)
topo_mh = max(REG, key=lambda i: BASE[i][2] if i in G["body"] else -9)
LM_MH["topo"] = topo_mh
LM_MH["nuca"] = max([i for i in REG if i in G["body"] and abs(BASE[i][2] - OLHO_Z) < 0.012 and abs(BASE[i][0]) < 0.02],
                    key=lambda i: BASE[i][1])

# ------------------------------------------------------------------ 2. pontos-chave no Meshy (mapa frontal)
d = np.load(MAPA)
POS = d["pos"]
X0, Z1, RES = float(d["x0"]), float(d["z1"]), float(d["res"])


def ym(x, z):
    i, j = int(round((x - X0) / RES)), int(round((Z1 - z) / RES))
    janela = POS[max(0, j - 2):j + 3, max(0, i - 2):i + 3, 1]
    return float(np.nanmedian(janela))


def min_y(x0, x1, z0, z1):
    i0, i1 = int((x0 - X0) / RES), int((x1 - X0) / RES)
    j0, j1 = int((Z1 - z1) / RES), int((Z1 - z0) / RES)
    w = POS[j0:j1, i0:i1]
    k = np.nanargmin(w[..., 1])
    jj, ii = np.unravel_index(k, w.shape[:2])
    return w[jj, ii]


OLHOS_MESHY = MED["olhos"]
ZO = OLHOS_MESHY["l"]["zc"]
BM = MED["boca"]
LM_ME = {}
for lado, o in OLHOS_MESHY.items():
    cx, zc = (o["x0"] + o["x1"]) / 2, o["zc"]
    a_ = (o["x1"] - o["x0"]) / 2
    cmh = BASE[LACO[lado]].mean(0)
    for i in LACO[lado]:
        th = math.atan2(BASE[i][2] - cmh[2], BASE[i][0] - cmh[0])
        b_ = (o["zs"] - zc) if math.sin(th) > 0 else (zc - o["zi"])
        x, z = cx + a_ * math.cos(th), zc + b_ * math.sin(th)
        LM_ME[f"olho_{lado}_{i}"] = (x, ym(x, z) - 0.002, z)
LM_ME["nariz"] = tuple(min_y(*MED["nariz_janela"]))


def y_boca(x):
    if BM.get("fechada"):  # boca fechada: a superfície é contínua, a linha dos lábios fica nela
        return ym(x, BM["z"])
    # boca aberta esculpida: superfície lisa por cima da cavidade (média do que há acima e abaixo)
    return (ym(x, BM["z"] + 0.0185) + ym(x, BM["z"] - 0.0195)) / 2 - 0.002


CX = MED.get("centro_x", 0.001)
for s_, lado in ((1, "l"), (-1, "r")):
    xc = CX + s_ * BM["canto_dx"]
    LM_ME[f"boca_canto_{lado}"] = (xc, y_boca(xc) + (0.0 if BM.get("fechada") else 0.004), BM["z"])
abre = BM.get("labios_meia_abertura", 0.004)
LM_ME["labio_sup"] = (CX, y_boca(CX), BM["z"] + abre)
LM_ME["labio_inf"] = (CX, y_boca(CX), BM["z"] - abre)
LM_ME["queixo"] = tuple(min_y(*MED["queixo_janela"]))
LM_ME["testa"] = (CX, ym(CX, ZO + 0.055), ZO + 0.055)
OLHO_DX_ME = (OLHOS_MESHY["l"]["x0"] + OLHOS_MESHY["l"]["x1"]) / 2 - CX
for s, lado in ((1, "l"), (-1, "r")):
    x = CX + s * OLHO_DX_ME * 1.5
    LM_ME[f"bochecha_{lado}"] = (x, ym(x, BM["z"] + 0.022), BM["z"] + 0.022)
    x = CX + s * OLHO_DX_ME * 1.9
    LM_ME[f"temporal_{lado}"] = (x, ym(x, ZO + 0.02), ZO + 0.02)
topo_bone = arm.matrix_world @ arm.data.bones[P + "HeadTop_End"].head_local
Z_CORTE = LM_ME["queixo"][2] - 0.012  # provisório; recalculado depois da deformação
print("corte embaixo do queixo", round(Z_CORTE, 4))
LM_ME["topo"] = (topo_bone.x, topo_bone.y + 0.01, topo_bone.z - 0.03)
loc, *_ = BVH_TUDO.ray_cast(Vector((CX, 1.0, ZO)), Vector((0, -1, 0)))
LM_ME["nuca"] = (CX, loc.y - (0.016 if MED.get("tem_cabelo", True) else 0.0), ZO)
for k in LM_MH:
    print(f"{k:16s} MH {np.round(BASE[LM_MH[k]], 4)}  Meshy {np.round(LM_ME[k], 4)}")

# pescoço: 8 pontos em dois anéis, casando alturas relativas ao queixo
pesc_mh, pesc_me = [], []
for dz_rel in (0.045, 0.085):
    z_me = LM_ME["queixo"][2] - dz_rel * 0.9
    z_mh = BASE[LM_MH["queixo"]][2] - dz_rel * 0.75
    for a in range(4):
        ang = a * math.pi / 2
        dirc = Vector((math.sin(ang), -math.cos(ang), 0))
        o_me = Vector((0.004, 0.012, z_me)) + dirc * 0.4
        l2, *_ = BVH_ROSTO.ray_cast(o_me, -dirc)
        cand = [i for i in REG if i in G["body"] and abs(BASE[i][2] - z_mh) < 0.004]
        if l2 is None or not cand:
            continue
        cmh = BASE[cand].mean(0)
        i_mh = max(cand, key=lambda i: (BASE[i][:2] - cmh[:2]) @ np.array([dirc.x, dirc.y]))
        pesc_mh.append(BASE[i_mh])
        pesc_me.append(tuple(l2))
print("pontos do pescoço", len(pesc_mh))

# ------------------------------------------------------------------ 3. deformação
S = np.array([BASE[LM_MH[k]] for k in LM_MH] + pesc_mh)
T = np.array([LM_ME[k] for k in LM_MH] + pesc_me)
# escala por eixo + translação
A0 = np.zeros((3, 2))
for k in range(3):
    M = np.stack([S[:, k], np.ones(len(S))], 1)
    A0[k] = np.linalg.lstsq(M, T[:, k], rcond=None)[0]
print("escala por eixo", np.round(A0[:, 0], 3))


def afim(p):
    return p * A0[:, 0] + A0[:, 1]


S1 = afim(S)
n = len(S1)
K = np.linalg.norm(S1[:, None] - S1[None], axis=2)
Pm = np.hstack([np.ones((n, 1)), S1])
L = np.zeros((n + 4, n + 4))
L[:n, :n] = K + np.eye(n) * 1e-5
L[:n, n:] = Pm
L[n:, :n] = Pm.T
rhs = np.zeros((n + 4, 3))
rhs[:n] = T
sol = np.linalg.solve(L, rhs)
Wt, At = sol[:n], sol[n:]


def tps(p):
    r = np.linalg.norm(p[:, None] - S1[None], axis=2)
    return r @ Wt + np.hstack([np.ones((len(p), 1)), p]) @ At


X = BASE.copy()
X[REG] = tps(afim(BASE[REG]))
X_SUAVE = X.copy()

z_min_pesc_me = min((mw @ mm.polygons[i].center).z for i in IDS_ROSTO)
z_min_mh = X[[i for i in REG if i in G["body"]]][:, 2].min()
Z_CORTE = max(z_min_pesc_me + 0.012, z_min_mh + 0.01)
print("emenda no pescoço", round(Z_CORTE, 4), "(pescoço Meshy até", round(z_min_pesc_me, 4), "MH até", round(z_min_mh, 4), ")")
olho_c = {lado: X[LACO[lado]].mean(0) for lado in ("l", "r")}
boca_c = np.array(LM_ME["labio_sup"])


def zona_livre(p):
    """Pálpebras e boca não grudam na superfície do Meshy (lá ela tem cavidades)."""
    for c in olho_c.values():
        if ((p[0] - c[0]) / 0.03) ** 2 + ((p[2] - c[2]) / 0.024) ** 2 < 1 and p[1] < c[1] + 0.02:
            return True
    if not BM.get("fechada") and abs(p[0] - boca_c[0]) < 0.04 and abs(p[2] - (boca_c[2] - 0.004)) < 0.014 \
            and p[1] < boca_c[1] + 0.03:
        return True
    return False


_boca_dentro = v_int | set(FENDA)
pele = [i for i in REG if i in G["body"] and i not in _boca_dentro]
for it in range(10):
    alvo = X.copy()
    for i in pele:
        p = Vector(X[i])
        if zona_livre(X[i]):
            continue
        loc, nor, idx, dist = BVH_ROSTO.find_nearest(p)
        if loc is not None and dist < 0.03:
            alvo[i] = tuple(loc)
    X[pele] = X[pele] + 0.6 * (alvo[pele] - X[pele])
    desl = X - X_SUAVE
    for _ in range(2):
        novo = desl.copy()
        for i in REG:
            viz = vizinhos.get(i)
            if viz:
                novo[i] = 0.5 * desl[i] + 0.5 * desl[list(viz)].mean(0)
        desl = novo
    X[REG] = X_SUAVE[REG] + desl[REG]
# último passe: a pele do rosto encosta na superfície
for i in pele:
    if zona_livre(X[i]):
        continue
    loc, nor, idx, dist = BVH_ROSTO.find_nearest(Vector(X[i]))
    if loc is not None and dist < 0.02:
        X[i] = tuple(loc)
# interior da boca (e a fenda) fica por trás da superfície do rosto
recuados = 0
for i in v_int:
    if abs(X[i][0] - CX) < 0.02:  # no meio o lábio de dentro fica como está (recuar dobra o lábio ao abrir)
        continue
    loc, nor, idx, dist = BVH_ROSTO.find_nearest(Vector(X[i]))
    if loc is not None and (Vector(X[i]) - loc).dot(nor) > -0.003:
        X[i] = tuple(loc - nor * 0.004)
        recuados += 1
print("vértices do interior da boca recuados", recuados)
# pescoço: na faixa da emenda o MH fica 1 mm por fora do pescoço do Meshy (cobre a borda)
for i in pele:
    if X[i][2] < Z_CORTE + 0.025:
        loc, nor, idx, dist = BVH_ROSTO.find_nearest(Vector(X[i]))
        if loc is not None and dist < 0.02:
            X[i] = tuple(loc + nor * 0.0012)
# couro cabeludo fica por dentro do cabelo do Meshy
dentro = 0
for i in (pele if IDS_CABELO else []):
    loc, nor, idx, dist = BVH_CABELO.find_nearest(Vector(X[i]))
    if loc is None or dist > 0.04:
        continue
    if (Vector(X[i]) - loc).dot(nor) > -0.006:
        X[i] = tuple(loc - nor * 0.008)
        dentro += 1
print("vértices empurrados para dentro do cabelo", dentro)

# ------------------------------------------------------------------ 4. globos oculares
OLHOS = {}
for lado in ("l", "r"):
    hv = list(G[f"helper-{lado}-eye"])
    H_ = tps(afim(BASE[hv]))  # o globo do MH deformado junto (vira um elipsoide no tamanho cartoon)
    q = X[LACO[lado]]
    c = q.mean(0)
    u, s_, vt = np.linalg.svd(q - c)
    nrm = vt[2] if vt[2][1] < 0 else -vt[2]
    a = np.linalg.norm(q - c, axis=1).mean()
    Rr = max(a * 1.05, np.linalg.norm(H_ - H_.mean(0), axis=1).mean())
    centro = c - nrm * math.sqrt(max(Rr * Rr - a * a, 0)) - nrm * 0.001
    OLHOS[lado] = (centro, Rr, nrm)
    print("olho", lado, "centro", np.round(centro, 4), "raio", round(Rr, 4))


def empurrar_palpebras(Y):
    for lado, (c, Rr, nrm) in OLHOS.items():
        dd = np.linalg.norm(Y[REG] - c, axis=1)
        for k, i in enumerate(REG):
            if i in G["helper-l-eyelashes-2"] or i in G["helper-r-eyelashes-2"]:
                continue
            if dd[k] < Rr + 0.0015 and dd[k] > 1e-6:
                Y[i] = c + (Y[i] - c) / dd[k] * (Rr + 0.0015)
    return Y


X = empurrar_palpebras(X)

U_ = sorted(G["helper-upper-teeth"])
B_ = sorted(G["helper-lower-teeth"] | G["helper-tongue"])
todos = U_ + B_
larg = X[U_][:, 0].max() - X[U_][:, 0].min()
esc = (abs(LM_ME["boca_canto_l"][0] - LM_ME["boca_canto_r"][0]) * 0.92) / max(larg, 1e-6)
c0 = X[todos].mean(0)
X[todos] = c0 + (X[todos] - c0) * esc
frente_u = X[U_][:, 1].min()
topo_u = X[U_][:, 2].max()
X[todos] += np.array([CX - X[U_][:, 0].mean(), (LM_ME["labio_sup"][1] + 0.004) - frente_u,
                      (LM_ME["labio_sup"][2] + 0.003) - topo_u])
print("dentes: escala", round(esc, 3))

# ------------------------------------------------------------------ 5. objeto da cabeça + materiais
grupos_mat = {"interior": [], "dentes": [], "lingua": [], "cilios": []}
face_mat = []
zb = boca_c
for k_face, (vi, ti, g) in enumerate(faces_cab):
    cen = X[vi].mean(0)
    if g in ("helper-upper-teeth", "helper-lower-teeth"):
        face_mat.append(2)
    elif g == "helper-tongue":
        face_mat.append(3)
    elif "eyelashes" in g:
        face_mat.append(4)
    elif k_face in INTERIOR:
        face_mat.append(1)  # dentro da boca
    else:
        face_mat.append(0)
me = bpy.data.meshes.new(f"{PID}_cabeca")
me.from_pydata([tuple(v) for v in X], [], [f[0] for f in faces_cab])
for p_ in me.polygons:
    p_.use_smooth = True
cab = bpy.data.objects.new(f"{PID}_cabeca", me)
scn.collection.objects.link(cab)


def material(nome, cor, rough=0.6, img=None):
    m = bpy.data.materials.new(nome)
    m.use_nodes = True
    b = next(n_ for n_ in m.node_tree.nodes if n_.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = cor + (1,)
    b.inputs["Roughness"].default_value = rough
    if img is not None:
        t = m.node_tree.nodes.new("ShaderNodeTexImage")
        t.image = img
        m.node_tree.links.new(t.outputs["Color"], b.inputs["Base Color"])
    return m


M_PELE = material(f"{PID}_pele_cabeca", (0.8, 0.6, 0.5), 0.62)
for m_ in (M_PELE, material("boca_dentro", (0.16, 0.03, 0.03), 0.5), material("dentes", (0.92, 0.9, 0.86), 0.3),
           material("lingua", (0.55, 0.16, 0.18), 0.45), material("cilios", (0.04, 0.025, 0.02), 0.6)):
    me.materials.append(m_)
for p_, k in zip(me.polygons, face_mat):
    p_.material_index = k
uv_layer = me.uv_layers.new(name="UVMap")

# UV novo só da cabeça (o rosto ganha bastante área)
for x in bpy.context.selected_objects:
    x.select_set(False)
bpy.context.view_layer.objects.active = cab
cab.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.006)
bpy.ops.object.mode_set(mode="OBJECT")

# ------------------------------------------------------------------ textura do Meshy sem olhos e boca pintados
cor_m, pos_m = d["cor"], d["pos"]
NZ, NX = cor_m.shape[:2]
hitm = ~np.isnan(pos_m[..., 0])
jj, ii = np.mgrid[0:NZ, 0:NX]
gx, gz = X0 + ii * RES, Z1 - jj * RES


def elipse(cx, cz, rx, rz):
    return ((gx - cx) / rx) ** 2 + ((gz - cz) / rz) ** 2 <= 1


def suav(m, s=2.0):
    return np.array(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(s))).astype(np.float32) / 255


m_p = np.zeros((NZ, NX), bool)
for lado, o in OLHOS_MESHY.items():
    m_p |= elipse((o["x0"] + o["x1"]) / 2, o["zc"], 0.026, 0.02)
m_b = (elipse(CX, BM["z"] - 0.001, 0.063, 0.018) & hitm) if MED.get("limpar_boca") else np.zeros((NZ, NX), bool)
pele_cor = np.median(cor_m[elipse(CX, (ZO + BM["z"]) / 2, 0.03, 0.006) & hitm], 0)
anel = elipse(CX, BM["z"], 0.072, 0.026) & ~elipse(CX, BM["z"], 0.064, 0.019) & hitm
escuro_ = anel & (cor_m.mean(2) < 0.12)
barba_cor = np.median(cor_m[escuro_], 0) if escuro_.sum() > 20 else pele_cor
a_p, a_b = suav(m_p), suav(m_b)
px = np.array(img_m.pixels[:], dtype=np.float32).reshape(TH, TW, 4)
cab_y = (arm.matrix_world @ arm.data.bones[P + "Head"].head_local).y
for lt in mm.loop_triangles:
    vi = list(lt.vertices)
    P3 = MV[vi]
    if P3[:, 1].mean() > cab_y or abs(P3[:, 0].mean()) > 0.14 or not (ZO - 0.13 < P3[:, 2].mean() < ZO + 0.08):
        continue
    uv = np.array([tuple(uvm[l].uv) for l in lt.loops]) * np.array([TW, TH])
    u0, v0 = np.maximum(np.floor(uv.min(0)).astype(int) - 2, 0)
    u1, v1 = np.minimum(np.ceil(uv.max(0)).astype(int) + 2, [TW - 1, TH - 1])
    if u1 <= u0 or v1 <= v0:
        continue
    gu, gv = np.meshgrid(np.arange(u0, u1 + 1) + 0.5, np.arange(v0, v1 + 1) + 0.5)
    (ax, ay), (bx, by), (cx, cy) = uv
    den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
    if abs(den) < 1e-9:
        continue
    l0 = ((by - cy) * (gu - cx) + (cx - bx) * (gv - cy)) / den
    l1 = ((cy - ay) * (gu - cx) + (ax - cx) * (gv - cy)) / den
    l2 = 1 - l0 - l1
    ok = (l0 >= -0.12) & (l1 >= -0.12) & (l2 >= -0.12)
    pos = l0[..., None] * P3[0] + l1[..., None] * P3[1] + l2[..., None] * P3[2]
    gi = np.clip(np.round((pos[..., 0] - X0) / RES).astype(int), 0, NX - 1)
    gj = np.clip(np.round((Z1 - pos[..., 2]) / RES).astype(int), 0, NZ - 1)
    ok &= np.abs(pos[..., 1] - np.nan_to_num(pos_m[gj, gi, 1], nan=9)) < 0.005
    ap, ab = a_p[gj, gi] * ok, a_b[gj, gi] * ok
    bl = px[v0:v1 + 1, u0:u1 + 1, :3]
    bl = bl * (1 - ap[..., None]) + pele_cor * ap[..., None]
    bl = bl * (1 - ab[..., None]) + barba_cor * ab[..., None]
    px[v0:v1 + 1, u0:u1 + 1, :3] = bl
caminho_fonte = os.path.join(OUT, f"{PID}_meshy_sem_olhos_boca.png")
Image.fromarray((np.clip(px[::-1, :, :3], 0, 1) * 255 + 0.5).astype(np.uint8)).save(caminho_fonte)
img_fonte = bpy.data.images.load(caminho_fonte)
for mat in mm.materials:
    for n_ in mat.node_tree.nodes:
        if n_.type == "TEX_IMAGE":
            n_.image = img_fonte

# ------------------------------------------------------------------ cor: ponto mais próximo no Meshy -> UV da cabeça MH
# (mais robusto que bake por raio: cada texel pega a cor do ponto da superfície do Meshy mais perto dele)
PXF = px[..., :3]  # textura do Meshy já sem olhos e boca pintados (sRGB)
tris_c, lts_c = [], []
for lt in mm.loop_triangles:
    if CLASSE[lt.polygon_index] in ("rosto", "orelha", "cabelo"):
        tris_c.append(tuple(lt.vertices))
        lts_c.append(lt)
bvh_cor = BVHTree.FromPolygons([Vector(v) for v in MV], tris_c)
UVL = [np.array([tuple(uvm[l].uv) for l in lt.loops]) for lt in lts_c]
N_TEX = 2048
saida = np.zeros((N_TEX, N_TEX, 3), np.float32)
preenchido = np.zeros((N_TEX, N_TEX), bool)
me.calc_loop_triangles()
uvc = me.uv_layers.active.data
me.calc_normals_split() if hasattr(me, "calc_normals_split") else None
NRM = np.array([tuple(v.normal) for v in me.vertices])
for lt in me.loop_triangles:
    if me.polygons[lt.polygon_index].material_index != 0:
        continue
    vi = list(lt.vertices)
    P3 = X[vi]
    N3 = NRM[vi]
    uv = np.array([tuple(uvc[l].uv) for l in lt.loops]) * N_TEX
    u0, v0 = np.maximum(np.floor(uv.min(0)).astype(int) - 1, 0)
    u1, v1 = np.minimum(np.ceil(uv.max(0)).astype(int) + 1, N_TEX - 1)
    gu, gv = np.meshgrid(np.arange(u0, u1 + 1) + 0.5, np.arange(v0, v1 + 1) + 0.5)
    (ax, ay), (bx, by), (cx, cy) = uv
    den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
    if abs(den) < 1e-12:
        continue
    l0 = ((by - cy) * (gu - cx) + (cx - bx) * (gv - cy)) / den
    l1 = ((cy - ay) * (gu - cx) + (ax - cx) * (gv - cy)) / den
    l2 = 1 - l0 - l1
    ok = (l0 >= -0.15) & (l1 >= -0.15) & (l2 >= -0.15)
    for jv, iu in zip(*np.nonzero(ok)):
        q = l0[jv, iu] * P3[0] + l1[jv, iu] * P3[1] + l2[jv, iu] * P3[2]
        nq = l0[jv, iu] * N3[0] + l1[jv, iu] * N3[1] + l2[jv, iu] * N3[2]
        nq = Vector(nq).normalized()
        loc, nor, idx, dist = bvh_cor.ray_cast(Vector(q) + nq * 0.012, -nq, 0.03)
        if loc is None:
            loc, nor, idx, dist = bvh_cor.find_nearest(Vector(q))
        if loc is None:
            continue
        a3 = MV[list(tris_c[idx])]
        # baricêntricas do ponto achado no triângulo do Meshy
        v0_, v1_, v2_ = a3[1] - a3[0], a3[2] - a3[0], np.array(loc) - a3[0]
        d00, d01, d11 = v0_ @ v0_, v0_ @ v1_, v1_ @ v1_
        d20, d21 = v2_ @ v0_, v2_ @ v1_
        dn = d00 * d11 - d01 * d01 or 1e-12
        bb = (d11 * d20 - d01 * d21) / dn
        cc = (d00 * d21 - d01 * d20) / dn
        uvq = UVL[idx][0] * (1 - bb - cc) + UVL[idx][1] * bb + UVL[idx][2] * cc
        saida[v0 + jv, u0 + iu] = PXF[min(TH - 1, int(uvq[1] * TH)), min(TW - 1, int(uvq[0] * TW))]
        preenchido[v0 + jv, u0 + iu] = True
# margem: espalha a cor para fora das ilhas (evita costura escura)
for _ in range(6):
    viz_ = np.zeros_like(saida)
    cnt = np.zeros(preenchido.shape, np.float32)
    for dy_, dx_ in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        sh = np.roll(np.roll(saida * preenchido[..., None], dy_, 0), dx_, 1)
        shm = np.roll(np.roll(preenchido, dy_, 0), dx_, 1)
        viz_ += sh
        cnt += shm
    novo_ = ~preenchido & (cnt > 0)
    saida[novo_] = viz_[novo_] / cnt[novo_][:, None]
    preenchido |= novo_
caminho_cab = os.path.join(OUT, f"{PID}_cabeca.png")
Image.fromarray((np.clip(saida[::-1], 0, 1) * 255 + 0.5).astype(np.uint8)).save(caminho_cab)
nt = M_PELE.node_tree
alvo_tex = nt.nodes.new("ShaderNodeTexImage")
alvo_tex.image = bpy.data.images.load(caminho_cab)
b = next(n_ for n_ in nt.nodes if n_.type == "BSDF_PRINCIPLED")
nt.links.new(alvo_tex.outputs["Color"], b.inputs["Base Color"])

# ------------------------------------------------------------------ 6. expressões (shape keys)
viz2 = {}
for i in REG:
    s1 = set(vizinhos.get(i, ()))
    s2 = set(s1)
    for j in s1:
        s2 |= vizinhos.get(j, set())
    s2.discard(i)
    viz2[i] = list(s2)
JAC = {}
for i in REG:
    nb = viz2[i]
    if len(nb) < 3:
        JAC[i] = np.eye(3)
        continue
    B = (BASE[nb] - BASE[i]).T
    Dd = (X[nb] - X[i]).T
    J = Dd @ B.T @ np.linalg.inv(B @ B.T + np.eye(3) * 1e-8)
    U_, S_, Vt_ = np.linalg.svd(J)
    JAC[i] = U_ @ np.diag(np.clip(S_, 0.4, 3.0)) @ Vt_  # sem explosões onde a vizinhança é degenerada


def delta_unidade(nome):
    dlt = np.zeros_like(BASE)
    for r, wr in ETNIA.items():
        c = os.path.join(DATA, "targets", "expression", "units", r, nome + ".target")
        if os.path.exists(c):
            for i, (dx, dy, dz) in mh.ler_target(c).items():
                dlt[i] += np.array([dx * 0.1, -dz * 0.1, dy * 0.1]) * wr
    return dlt


UNIDADES = {
    "arregalar_e": "eye-left-opened-up", "arregalar_d": "eye-right-opened-up",
    "apertar_e": "eye-left-slit", "apertar_d": "eye-right-slit",
    "sobr_sobe_e": "eyebrows-left-up", "sobr_sobe_d": "eyebrows-right-up",
    "sobr_desce_e": "eyebrows-left-down", "sobr_desce_d": "eyebrows-right-down",
    "sobr_dentro_sobe_e": "eyebrows-left-inner-up", "sobr_dentro_sobe_d": "eyebrows-right-inner-up",
"sorriso": "mouth-corner-puller", "boca_triste": "mouth-depression",
"boca_larga": "mouth-retraction", "labios_separa": "mouth-parling",
    "boca_bico_frente": "mouth-protusion", "labio_sobe": "mouth-elevation", "comprime": "mouth-compression",
}
cab.shape_key_add(name="Basis")
for nome, unidade in UNIDADES.items():
    dl = delta_unidade(unidade)
    Y = X.copy()
    for i in REG:
        if np.any(dl[i]):
            Y[i] = X[i] + JAC[i] @ dl[i]
    Y = empurrar_palpebras(Y)
    k = cab.shape_key_add(name=nome)
    k.data.foreach_set("co", Y.astype(np.float32).ravel())


def piscar(lado, intensidade=1.0):
    """Piscar procedural: a pálpebra de cima gira em volta do centro do globo até encontrar a de baixo
    (a pele desliza sobre o olho, sem atravessar). A de baixo sobe um pouco."""
    c, Rr, nrm = OLHOS[lado]
    q = X[LACO[lado]] - c
    phis = np.degrees(np.arctan2(q[:, 2], -q[:, 1]))
    phi_sup, phi_inf = np.percentile(phis, 92), np.percentile(phis, 8)
    curso = math.radians(phi_sup - phi_inf) * intensidade
    Y = X.copy()
    for i in REG:
        if i not in G["body"]:
            continue
        v = X[i] - c
        dist = np.linalg.norm(v)
        if dist > Rr * 2.1 or -v[1] < -0.2 * Rr or abs(v[0]) > Rr * 1.9:
            continue
        phi = math.degrees(math.atan2(v[2], -v[1]))
        lateral = max(0.0, 1 - max(0.0, abs(v[0]) / Rr - 1.0) / 0.9)
        radial = max(0.0, 1 - max(0.0, dist - Rr * 1.15) / (Rr * 0.9))
        if phi >= phi_sup - 4:
            w = max(0.0, 1 - (phi - phi_sup) / 55.0) * lateral * radial
            ang = -curso * 0.88 * w
        elif phi <= phi_inf + 4:
            w = max(0.0, 1 - (phi_inf - phi) / 40.0) * lateral * radial
            ang = curso * 0.12 * w
        else:
            continue
        ca, sa = math.cos(ang), math.sin(ang)
        # rotação em volta do eixo x passando pelo centro do olho (no plano y-z, com "frente" = -y)
        fy, fz = -v[1], v[2]
        nf, nz = fy * ca - fz * sa, fy * sa + fz * ca
        Y[i] = c + np.array([v[0], -nf, nz])
    return empurrar_palpebras(Y)


def lado_de_baixo():
    """Separa lábio de cima e de baixo pela malha (não pela altura): caminho mais curto pelas arestas a partir
    de uma semente no bigode e outra no queixo. Cada vértice da região da boca fica com a semente mais perto,
    então a divisão segue a linha onde os lábios se encostam e os cantos se dividem ao meio."""
    import heapq
    zl = BM["z"]
    zona = {i for i in REG if (i in G["body"]) and abs(X[i][0] - CX) < 0.075 and abs(X[i][2] - zl) < 0.06 and X[i][1] < -0.01}

    def semente(z0, z1):
        c = [i for i in zona if abs(X[i][0] - CX) < 0.006 and z0 < X[i][2] < z1]
        return sorted(c, key=lambda i: X[i][1])[:3]
    # sementes nos próprios lábios, logo acima e logo abaixo da fenda real (vértices recuados do MH já deformados)
    zf = float(np.mean([X[i][2] for i in FENDA if abs(X[i][0] - CX) < 0.008]))
    print("fenda deformada em z", round(zf, 4), "linha do Meshy", zl)
    fontes = {"cima": semente(zf + 0.0015, zf + 0.006), "baixo": semente(zf - 0.006, zf - 0.0015)}
    dist = {}
    dono = {}
    h = []
    for nome, ids in fontes.items():
        for i in ids:
            dist[i] = 0.0
            dono[i] = nome
            heapq.heappush(h, (0.0, i, nome))
    while h:
        d_, i, nome = heapq.heappop(h)
        if d_ > dist.get(i, 9):
            continue
        for j in vizinhos.get(i, ()):
            if j not in zona:
                continue
            nd = d_ + float(np.linalg.norm(X[j] - X[i]))
            if nd < dist.get(j, 9):
                dist[j] = nd
                dono[j] = nome
                heapq.heappush(h, (nd, j, nome))
    return {i for i, n in dono.items() if n == "baixo"}


BAIXO = lado_de_baixo()
# os lábios do MH vêm costurados na frente: as faces que ligam o de cima ao de baixo são removidas
# (abre a fenda; com a boca fechada ela vira só a linha escura entre os lábios)
_fx = np.array([X[i][0] for i in FENDA])
_ord = np.argsort(_fx)
_fx_s, _fz_s = _fx[_ord], np.array([X[i][2] for i in FENDA])[_ord]
RASGAR = set()
for k_face, (vi, ti, g) in enumerate(faces_cab):
    if g != "body" or k_face in INTERIOR:
        continue
    lados_ = {i in BAIXO for i in vi}
    if len(lados_) < 2:
        continue
    c_ = X[vi].mean(0)
    z_f_ = float(np.interp(c_[0], _fx_s, _fz_s))
    if abs(c_[0] - CX) < BM["canto_dx"] + 0.003 and abs(c_[2] - z_f_) < 0.008 and c_[1] < LM_ME["labio_sup"][1] + 0.012:
        RASGAR.add(k_face)
print("vértices do lado de baixo da boca", len(BAIXO), "faces da costura dos lábios", len(RASGAR))
# em repouso os lábios se encostam: as bordas de cima e de baixo da fenda vão para a linha do meio
_U = sorted({i for k in RASGAR for i in faces_cab[k][0] if i not in BAIXO})
_L = sorted({i for k in RASGAR for i in faces_cab[k][0] if i in BAIXO})
DESLOC = np.zeros_like(X)
if _U and _L:
    for i in _U:
        j = min(_L, key=lambda j: abs(X[j][0] - X[i][0]) + 0.3 * abs(X[j][2] - X[i][2]))
        meio_ = (X[i] + X[j]) / 2
        DESLOC[i] = meio_ + np.array([0, 0, 0.0004]) - X[i]
    for j in _L:
        i = min(_U, key=lambda i: abs(X[j][0] - X[i][0]) + 0.3 * abs(X[j][2] - X[i][2]))
        meio_ = (X[i] + X[j]) / 2
        DESLOC[j] = meio_ - np.array([0, 0, 0.0004]) - X[j]
    X = X + DESLOC
    for kb_ in cab.data.shape_keys.key_blocks:  # as chaves já criadas recebem o mesmo ajuste
        co_ = np.zeros(len(kb_.data) * 3, np.float32)
        kb_.data.foreach_get("co", co_)
        co_ = co_.reshape(-1, 3) + DESLOC.astype(np.float32)
        kb_.data.foreach_set("co", co_.ravel())
    me.vertices.foreach_set("co", X.astype(np.float32).ravel())
print("bordas dos lábios encostadas", len(_U), len(_L))


def abrir_mandibula(graus=20.0):
    """Mandíbula procedural: o lado de baixo da boca gira em volta de um eixo horizontal perto das orelhas.
    O peso cai suavemente depois dos cantos da boca (bochecha) e no pescoço. Dentes de baixo e língua giram inteiros."""
    zl = BM["z"]
    piv = np.array([CX, 0.0, zl + 0.035])
    zq = LM_ME["queixo"][2]
    inf = set(G["helper-lower-teeth"]) | set(G["helper-tongue"])
    canto = BM["canto_dx"]
    Y = X.copy()
    a = math.radians(graus)
    for i in REG:
        v = X[i]
        if i in inf:
            w = 1.0
        elif i in G["body"]:
            if v[1] > -0.01:
                continue
            dx = abs(v[0] - CX)
            if i in BAIXO:
                w = 1.0
            elif v[2] < zl - 0.06:
                w = 1.0  # queixo e embaixo (fora da zona da boca)
            else:
                continue
            w *= min(1.0, max(0.0, 1 - (dx - canto) / 0.035))  # bochecha: transição depois do canto
            w *= min(1.0, max(0.0, 1 - ((zq - 0.008) - v[2]) / 0.045))  # pescoço fica
        else:
            continue
        if w <= 0:
            continue
        ang = a * (w * w * (3 - 2 * w))
        r = v - piv
        fy, fz = -r[1], r[2]
        ca, sa = math.cos(-ang), math.sin(-ang)
        nf, nz = fy * ca - fz * sa, fy * sa + fz * ca
        Y[i] = piv + np.array([r[0], -nf, nz])
    return Y


def bico(forca=1.0):
    """Bico (O, U): lábios juntam para o centro e vão para a frente, com queda suave em volta da boca."""
    zl = BM["z"]
    Y = X.copy()
    for i in REG:
        if i not in G["body"]:
            continue
        v = X[i]
        if v[1] > -0.03:
            continue
        e = ((v[0] - CX) / 0.05) ** 2 + ((v[2] - zl) / 0.028) ** 2
        if e >= 1:
            continue
        w = (1 - e) ** 2 * forca
        Y[i] = v + np.array([-(v[0] - CX) * 0.38 * w, -0.009 * w, -(v[2] - zl) * 0.15 * w])
    return Y


k = cab.shape_key_add(name="bico")
k.data.foreach_set("co", bico().astype(np.float32).ravel())
Y_ABRE = abrir_mandibula()
k = cab.shape_key_add(name="boca_abre")
k.data.foreach_set("co", Y_ABRE.astype(np.float32).ravel())
# (pintar as faces da fenda como interior foi testado e piorou: ficam visíveis com a boca fechada)
for nome, lado in (("piscar_e", "l"), ("piscar_d", "r")):
    k = cab.shape_key_add(name=nome)
    k.data.foreach_set("co", piscar(lado).astype(np.float32).ravel())
for kb_ in cab.data.shape_keys.key_blocks[1:]:
    kb_.value = 0.0  # chaves novas nascem com valor 1 nesta versão do Blender
print("shape keys", len(UNIDADES) + 2)

# ------------------------------------------------------------------ 7. pesos, esqueleto, limpeza
mh.pesos_mixamo(cab, PESOS)
for g_ in list(cab.vertex_groups):
    if g_.name not in arm.data.bones:
        cab.vertex_groups.remove(g_)
# vértices sem peso completo (dentes, língua, forro das pálpebras não vêm no arquivo de pesos) seguem a cabeça
g_cab = cab.vertex_groups.get(P + "Head") or cab.vertex_groups.new(name=P + "Head")
completados = 0
for v in me.vertices:
    tot = sum(g.weight for g in v.groups)
    if tot < 0.999:
        atual = next((g.weight for g in v.groups if g.group == g_cab.index), 0.0)
        g_cab.add([v.index], atual + (1.0 - tot), "REPLACE")
        completados += 1
print("vértices com peso completado na cabeça", completados)
cab.parent = arm
cab.matrix_parent_inverse = arm.matrix_world.inverted()
cab.modifiers.new("Esqueleto", "ARMATURE").object = arm
for x in bpy.context.selected_objects:
    x.select_set(False)
bpy.context.view_layer.objects.active = cab
cab.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="DESELECT")
bpy.ops.object.mode_set(mode="OBJECT")
for p_ in me.polygons:  # pescoço abaixo da gola some
    p_.select = bool((cab.matrix_world @ p_.center).z < Z_CORTE) or p_.index in RASGAR
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.delete(type="FACE")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.delete_loose()
bpy.ops.object.mode_set(mode="OBJECT")

# globos oculares
img_olho = Image.new("RGB", (512, 512), (246, 243, 238))
dr = ImageDraw.Draw(img_olho)
for k_ in range(14):
    r = 140 * (1 - k_ / 14)
    t = k_ / 13
    c = tuple(int(x * (0.5 + 0.7 * t)) for x in (70, 44, 26))
    dr.ellipse((256 - r, 256 - r, 256 + r, 256 + r), fill=c)
dr.ellipse((256 - 140, 256 - 140, 256 + 140, 256 + 140), outline=(26, 16, 10), width=8)
dr.ellipse((256 - 70, 256 - 70, 256 + 70, 256 + 70), fill=(12, 8, 6))
dr.ellipse((256 - 75 - 26, 256 - 70 - 26, 256 - 75 + 26, 256 - 70 + 26), fill=(255, 255, 255))
caminho_olho = os.path.join(OUT, f"{PID}_olho.png")
img_olho.save(caminho_olho)
M_OLHO = material(f"{PID}_olho", (1, 1, 1), 0.15, bpy.data.images.load(caminho_olho))
for lado, (c, Rr, nrm) in OLHOS.items():
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=Rr, location=(0, 0, 0))
    o = bpy.context.active_object
    o.name = f"{PID}_olho_{lado}"
    o.rotation_euler = (math.pi / 2, 0, 0)  # polo para a frente (-y)
    bpy.ops.object.transform_apply(rotation=True)
    for v in o.data.vertices:
        v.co = Vector(v.co)
    uvo = o.data.uv_layers.active.data
    for poly in o.data.polygons:
        for li in poly.loop_indices:
            co = o.data.vertices[o.data.loops[li].vertex_index].co
            uvo[li].uv = (0.5 + co.x / Rr * 0.5, 0.5 + co.z / Rr * 0.5)
    o.location = Vector(c)
    o.data.materials.append(M_OLHO)
    for p_ in o.data.polygons:
        p_.use_smooth = True
    o.vertex_groups.new(name=P + "Head").add(list(range(len(o.data.vertices))), 1.0, "REPLACE")
    o.parent = arm
    o.matrix_parent_inverse = arm.matrix_world.inverted()
    o.modifiers.new("Esqueleto", "ARMATURE").object = arm

# apaga o rosto do Meshy (fica cabelo, orelhas e roupa)
bm = bmesh.new()
bm.from_mesh(mm)
bm.faces.ensure_lookup_table()
bmesh.ops.delete(bm, geom=[bm.faces[i] for i in IDS_ROSTO if (mw @ bm.faces[i].calc_center_median()).z > Z_CORTE + 0.01],
                 context="FACES")  # o pescoço do Meshy fica; a emenda é embaixo do queixo
bm.to_mesh(mm)
bm.free()

arm.data.pose_position = "POSE"
me.calc_loop_triangles()
print("triângulos da cabeça MH", len(me.loop_triangles))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, f"{PID}_mh.blend"))
print("ok")
