"""Tipos de corpo do Morada derivados dos corpos grátis da ITHappy (mesmo esqueleto de 44 ossos).

Bases do pacote: adulto masculino (Chess Player 01), adulta feminina (Cashier, Casino), plus-size masculino (75, Casino).
Derivados:
  - plus-size feminina: a diferença entre o adulto e o plus-size masculinos (medida no próprio pacote) aplicada na
    adulta feminina, ponto a ponto;
  - idosos, adolescentes, crianças, musculoso, atlética, alto e magro: escala por osso (comprimento e grossura),
    postura no repouso; as malhas acompanham porque estão presas aos mesmos ossos.
Pele: o corpo usa uma faixa só da paleta; todas as bases são levadas para a mesma faixa e o tom vira uma cor que
multiplica a textura (no jogo: material.color). Cabelo: só troca de coluna na paleta (castanho, ruivo escuro, grisalho).

Uso: python corpos.py <saida_dir>
Saída: corpos.blend, <tipo>.glb (com a animação Idle do pacote), r_<tipo>_<tom>.png
"""
import json
import math
import os
import sys

import bpy
import bmesh  # noqa: E402 (depois do bpy)

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import expressoes as EX  # noqa: E402
import contato  # noqa: E402
import numpy as np
from mathutils import Matrix, Quaternion, Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

OUT = os.path.abspath(sys.argv[1])
os.makedirs(OUT, exist_ok=True)
SCR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
I = os.path.join(SCR, "ideias")
PALETA = os.path.join(I, "Casino", "textures", "textures", "Textures_4.png")
BASES = {
    "m": ("Chess_Pack/Chess_Pack_Free_fbx/Chess_Pack_Free_fbx/Characters/Chess_Player_01.fbx",
          {"ChessPlayer_01": "corpo", "ChessPlayer_Face_Usual_01": "rosto", "ChessPlayer_Hair_01": "cabelo"}),
    "f": ("Casino/Casino_Free_fbx/Casino_Free_fbx/Casino_Free_Characters_fbx/1_Cashier.fbx",
          {"Adult_Female_Cashier_Body": "corpo", "Adult_Female_Cashier_Face_Usual": "rosto",
           "Adult_Female_Cashier_Hairstyle": "cabelo"}),
    "p": ("Casino/Casino_Free_fbx/Casino_Free_fbx/Casino_Free_Characters_fbx/75.fbx",
          {"PlusSize_Male_Body_75": "corpo", "PlusSize_Male_Face_Usual_75": "rosto", "PlusSize_Male_Hairstyle_75": "cabelo"}),
}
if os.environ.get("ROUPAS"):  # para cenas: a roupa que o próprio pacote tem para cada corpo, presa aos mesmos ossos
    BASES["m"][1].update({"ChessPlayer_Pants_01": "roupa_baixo", "ChessPlayer_Shoes_01": "sapato"})
    # homem: camisa xadrez do lenhador do Apocalypse (camisa xadrez, calça e botas), feita para o mesmo corpo masculino
    ROUPA_M = ("Apocalypse/Apocalypse_Free_fbx/Apocalypse_Free_fbx/Characters/Adult_Woodcutter.fbx",
               {"Outwear_Adult_Male": "roupa_cima"},
               "Apocalypse/textures/textures")
    BASES["f"][1].update({"Adult_Female_Cashier_Shirt": "roupa_cima", "Adult_Female_Cashier_Pants": "roupa_baixo",
                          "Adult_Female_Cashier_Shoes": "sapato"})
    BASES["p"][1].update({"PlusSize_Male_Shirt_75": "roupa_cima", "PlusSize_Male_Shorts_75": "roupa_baixo",
                          "PlusSize_Male_Shoes_75": "sapato"})
# faixa da pele na paleta (a das bases adulto/adulta) e a cor média dela
PELE_U, PELE_V = 0.768, (0.301, 0.376)
# tons da referência (sRGB)
TONS = {"clara": (255, 182, 159), "media": (254, 166, 121), "morena": (186, 105, 83), "escura": (72, 43, 37)}
CABELOS = {"castanho": (0.841, (0.091, 0.202)), "ruivo": (0.81, (0.05, 0.16)), "grisalho": (0.88, (0.24, 0.34)),
           "preto": (0.875, (0.51, 0.58))}

# grossura (x, z do osso) e comprimento (y do osso) por grupo; s = escala geral; cab = cabeça (absoluta)
#   grupos: tronco (Hips/Spine), peito (Spine1), pescoco, ombro (clavícula), braco, antebraco, mao, coxa, perna, pe
TIPOS = [
    # nome, base, rótulo, cabelo, ajustes
    ("adulto", "m", "Adulto", "castanho", {}),
    ("adulta", "f", "Adulta", "ruivo", {}),
    ("plus_m", "p", "Plus-size masculino", "castanho", {"abre_bracos": 8}),
    ("plus_f", "f", "Plus-size feminina", "ruivo", {"plus": 1.7, "abre_bracos": 7, "coxa": (1.0, 1.07), "tronco": (1.0, (1.05, 1.07)),
                                                    "braco": (1.0, 1.06)}),
    ("idoso", "m", "Idoso", "grisalho", {"s": 0.975, "plus": 0.22, "postura": 7, "ombro": (0.94, 1.0), "braco": (1, 0.93),
                                          "antebraco": (1, 0.93), "coxa": (1, 0.94), "perna": (1, 0.93)}),
    ("idosa", "f", "Idosa", "grisalho", {"s": 0.97, "plus": 0.3, "postura": 7, "ombro": (0.95, 1.0), "braco": (1, 0.95),
                                          "antebraco": (1, 0.94), "perna": (1, 0.95)}),
    ("musculoso", "m", "Musculoso", "castanho", {"s": 1.015, "abre_bracos": 9, "ombro": (1.22, 1.35), "braco": (1.0, 1.36),
                                                 "antebraco": (1.0, 1.2), "peito": (1.0, (1.24, 1.32)), "pescoco": (1.0, 1.3),
                                                 "tronco": (1.0, (0.98, 1.0)), "coxa": (1.0, 1.24), "perna": (1.0, 1.2),
                                                 "mao": (1.0, 1.08)}),
    ("adolescente_m", "m", "Adolescente", "castanho", {"s": 0.92, "cab": 0.965, "olhos": 1.04, "ombro": (0.94, 0.95),
                                                       "braco": (1, 0.9), "antebraco": (1, 0.9), "peito": (1, 0.93),
                                                       "tronco": (1, 0.93), "coxa": (1, 0.9), "perna": (1, 0.9)}),
    ("adolescente_f", "f", "Adolescente", "ruivo", {"s": 0.92, "cab": 0.965, "olhos": 1.04, "ombro": (0.95, 0.96),
                                                    "braco": (1, 0.92), "antebraco": (1, 0.92), "peito": (1, 0.92),
                                                    "tronco": (1, 0.94), "coxa": (1, 0.92), "perna": (1, 0.92)}),
    ("crianca_m", "m", "Criança", "castanho", {"s": 0.64, "cab": 0.9, "olhos": 1.12, "rosto_redondo": 0.6,
                                              "ombro": (0.92, 1.05), "braco": (0.95, 1.05), "antebraco": (0.95, 1.05),
                                              "peito": (0.98, 1.06), "tronco": (1.0, 1.08), "pescoco": (0.8, 1.1),
                                              "coxa": (0.93, 1.1), "perna": (0.93, 1.08), "mao": (0.95, 1.05), "pe": (1, 1.05)}),
    ("crianca_f", "f", "Criança", "ruivo", {"s": 0.64, "cab": 0.9, "olhos": 1.12, "rosto_redondo": 0.6,
                                           "ombro": (0.92, 1.05), "braco": (0.95, 1.05), "antebraco": (0.95, 1.05),
                                           "peito": (0.98, (0.95, 0.85)), "tronco": (1.0, (0.97, 1.0)), "pescoco": (0.8, 1.1),
                                           "coxa": (0.93, 1.08), "perna": (0.93, 1.08), "mao": (0.95, 1.05), "pe": (1, 1.05)}),
    # bebês (mesmas proporções do bebê e da criança pequena aprovados antes): cabeça grande e redonda, membros curtos e
    # gordinhos, pescoço curto; meninos e meninas no mesmo corpo, com rosto e cabelo diferentes
    ("pequeno_m", "m", "Bebê 2–3 anos (m)", "castanho", {"s": 0.5, "cab": 0.86, "cab_redonda": True, "olhos": 1.15,
                                                        "rosto_redondo": 0.6, "tronco": (0.95, 1.22), "peito": (0.95, 1.22),
                                                        "pescoco": (0.4, 1.34), "ombro": (0.88, 1.22), "braco": (0.88, 1.22),
                                                        "antebraco": (0.88, 1.22), "mao": (0.9, 1.15), "coxa": (0.82, 1.28),
                                                        "perna": (0.82, 1.28), "pe": (0.82, 1.28)}),
    ("pequena_f", "fm", "Bebê 2–3 anos (f)", "ruivo", {"s": 0.5, "cab": 0.86, "cab_redonda": True, "olhos": 1.15,
                                                     "rosto_redondo": 0.6, "tronco": (0.95, 1.22),
                                                     "peito": (0.95, 1.22), "pescoco": (0.4, 1.34),
                                                     "ombro": (0.88, 1.22), "braco": (0.88, 1.22), "antebraco": (0.88, 1.22),
                                                     "mao": (0.9, 1.15), "coxa": (0.82, 1.28), "perna": (0.82, 1.28),
                                                     "pe": (0.82, 1.28)}),
    ("bebe_m", "m", "Bebê de colo (m)", "castanho", {"s": 0.4, "chupeta": True, "cab": 0.8, "cab_redonda": True, "olhos": 1.25,
                                                    "rosto_redondo": 1.0, "tronco": (0.92, 1.34), "peito": (0.92, 1.34),
                                                    "pescoco": (0.4, 1.47), "ombro": (0.8, 1.32), "braco": (0.8, 1.32),
                                                    "antebraco": (0.8, 1.32), "mao": (0.85, 1.2), "coxa": (0.72, 1.42),
                                                    "perna": (0.72, 1.42), "pe": (0.72, 1.42)}),
    ("bebe_f", "fm", "Bebê de colo (f)", "ruivo", {"s": 0.4, "chupeta": True, "cab": 0.8, "cab_redonda": True, "olhos": 1.25,
                                                 "rosto_redondo": 1.0, "tronco": (0.92, 1.34),
                                                 "peito": (0.92, 1.34), "pescoco": (0.4, 1.47), "ombro": (0.8, 1.32),
                                                 "braco": (0.8, 1.32), "antebraco": (0.8, 1.32), "mao": (0.85, 1.2),
                                                 "coxa": (0.72, 1.42), "perna": (0.72, 1.42), "pe": (0.72, 1.42)}),
    # recém-nascidos: menores que o bebê de colo, cabeça proporcionalmente maior, enrolados numa manta (só a cabeça
    # para fora), pouquinho cabelo; sem animações, só as expressões do rosto
    ("recem_m", "m", "Recém-nascido (m)", "castanho", {"recem": True, "s": 0.3, "chupeta": True, "cab": 0.66,
                                                     "cab_redonda": True, "olhos": 1.3, "rosto_redondo": 1.0,
                                                     "tronco": (0.92, 1.34), "peito": (0.92, 1.34), "pescoco": (0.35, 1.47),
                                                     "ombro": (0.8, 1.32), "braco": (0.8, 1.32), "antebraco": (0.8, 1.32),
                                                     "mao": (0.85, 1.2), "coxa": (0.72, 1.42), "perna": (0.72, 1.42),
                                                     "pe": (0.72, 1.42)}),
    ("recem_f", "fm", "Recém-nascido (f)", "castanho", {"recem": True, "s": 0.3, "chupeta": True, "cab": 0.66,
                                                      "cab_redonda": True, "olhos": 1.3, "rosto_redondo": 1.0,
                                                      "tronco": (0.92, 1.34), "peito": (0.92, 1.34), "pescoco": (0.35, 1.47),
                                                      "ombro": (0.8, 1.32), "braco": (0.8, 1.32), "antebraco": (0.8, 1.32),
                                                      "mao": (0.85, 1.2), "coxa": (0.72, 1.42), "perna": (0.72, 1.42),
                                                      "pe": (0.72, 1.42)}),
    # variações além da referência
    ("atletica", "f", "Atlética", "preto", {"s": 1.01, "ombro": (1.08, 1.18), "braco": (1.0, 1.2), "antebraco": (1.0, 1.14),
                                           "peito": (1.0, (1.08, 1.04)), "coxa": (1.0, 1.14), "perna": (1.0, 1.14),
                                           "pescoco": (1.0, 1.08)}),
    ("alto_magro", "m", "Alto e magro", "preto", {"s": 1.06, "ombro": (1.0, 0.92), "braco": (1.03, 0.86),
                                                 "antebraco": (1.03, 0.86), "peito": (1.02, 0.88), "tronco": (1.03, 0.88),
                                                 "coxa": (1.04, 0.86), "perna": (1.04, 0.86), "pescoco": (1.05, 0.9)}),
]

if os.environ.get("SOMENTE"):  # para testes: gera só alguns tipos
    TIPOS = [t_ for t_ in TIPOS if t_[0] in os.environ["SOMENTE"].split(",")]


def grupo(nome):
    n = nome.replace("Left", "").replace("Right", "")
    if n == "Head":
        return "cab"
    if n == "Neck":
        return "pescoco"
    if n == "Spine1":
        return "peito"
    if n in ("Root", "Hips", "Spine"):
        return "tronco"
    if n == "Shoulder":
        return "ombro"
    if n == "Arm":
        return "braco"
    if n == "ForeArm":
        return "antebraco"
    if n.startswith("Hand"):
        return "mao"
    if n in ("UpLeg",):
        return "coxa"
    if n in ("Leg",):
        return "perna"
    return "pe"  # Foot, ToeBase


bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene
img = bpy.data.images.load(PALETA)


def importar(base):
    if base == "fm":  # corpo do adulto masculino com rosto e cabelo da adulta (bebês: o corpo não muda com o sexo)
        arm, partes = importar("m")
        arm_f, pf = importar("f")
        # o rosto feminino vai para a cabeça masculina: cada ponto mantém a altura que tinha sobre a pele feminina
        Pf = pos_mundo(pf["corpo"])
        bvh_f = BVHTree.FromPolygons([tuple(p) for p in Pf], [tuple(f.vertices) for f in pf["corpo"].data.polygons])
        Pm_ = pos_mundo(partes["corpo"])
        bvh_m = BVHTree.FromPolygons([tuple(p) for p in Pm_], [tuple(f.vertices) for f in partes["corpo"].data.polygons])
        R_ = pos_mundo(pf["rosto"])
        for j, p in enumerate(R_):
            hf = bvh_f.ray_cast(Vector((p[0], -0.5, p[2])), Vector((0, 1, 0)), 1.0)[0]
            hm = bvh_m.ray_cast(Vector((p[0], -0.5, p[2])), Vector((0, 1, 0)), 1.0)[0]
            if hf is not None and hm is not None:
                R_[j][1] = p[1] + (hm.y - hf.y)
        grava_mundo(pf["rosto"], R_)
        for papel in ("rosto", "cabelo"):
            bpy.data.objects.remove(partes[papel], do_unlink=True)
            o = pf[papel]
            mw = o.matrix_world.copy()
            o.parent = arm
            o.matrix_world = mw
            next(m for m in o.modifiers if m.type == "ARMATURE").object = arm
            partes[papel] = o
        bpy.data.objects.remove(pf["corpo"], do_unlink=True)
        bpy.data.objects.remove(arm_f, do_unlink=True)
        bpy.context.view_layer.update()
        return arm, partes
    if base == "m" and os.environ.get("ROUPAS") and not getattr(importar, "_sem_roupa", False):
        importar._sem_roupa = True
        arm, partes = importar("m")
        importar._sem_roupa = False
        antes = set(bpy.data.objects)
        bpy.ops.import_scene.fbx(filepath=os.path.join(I, ROUPA_M[0]))
        novos = [o for o in bpy.data.objects if o not in antes]
        tex = os.path.join(I, ROUPA_M[2])
        for o in novos:
            papel = ROUPA_M[1].get(o.name.split(".")[0]) if o.type == "MESH" else None
            if papel:
                mw = o.matrix_world.copy()
                o.parent = arm
                o.matrix_world = mw
                next(m for m in o.modifiers if m.type == "ARMATURE").object = arm
                o["_roupa_propria"] = True
                for m in o.data.materials:
                    for n in (m.node_tree.nodes if m and m.node_tree else []):
                        if n.type == "TEX_IMAGE" and n.image:
                            c = os.path.join(tex, os.path.basename(n.image.filepath.replace("\\", "/")))
                            if os.path.exists(c):
                                n.image.filepath = c
                                n.image.reload()
                partes[papel] = o
            else:
                bpy.data.objects.remove(o, do_unlink=True)
        for a_ in [a_ for a_ in bpy.data.actions if a_.users == 0 and not a_.use_fake_user and "_fbx" not in a_]:
            bpy.data.actions.remove(a_)
        bpy.context.view_layer.update()
        return arm, partes
    caminho, pecas = BASES[base]
    antes, acoes_antes = set(bpy.data.objects), set(bpy.data.actions)
    bpy.ops.import_scene.fbx(filepath=os.path.join(I, caminho))
    novos = [o for o in bpy.data.objects if o not in antes]
    for a in set(bpy.data.actions) - acoes_antes:
        a["_fbx"] = base
    arm = next(o for o in novos if o.type == "ARMATURE")
    arm.animation_data_clear()
    for pb in arm.pose.bones:
        pb.matrix_basis.identity()
    partes = {}
    for o in novos:
        if o.type != "MESH":
            continue
        papel = pecas.get(o.name.split(".")[0])
        if papel is None:
            bpy.data.objects.remove(o, do_unlink=True)
        else:
            partes[papel] = o
    bpy.context.view_layer.update()
    return arm, partes


def pos_mundo(o):
    mw = o.matrix_world
    return np.array([mw @ v.co for v in o.data.vertices])


def grava_mundo(o, P):
    mi = o.matrix_world.inverted()
    for v, p in zip(o.data.vertices, P):
        v.co = mi @ Vector(p)
    o.data.update()


def vizinhos(me):
    viz = [[] for _ in me.vertices]
    for e in me.edges:
        a, b = e.vertices
        viz[a].append(b)
        viz[b].append(a)
    return viz


def peso(o, nomes):
    idx = {o.vertex_groups[n].index for n in nomes if n in o.vertex_groups}
    return np.array([sum(g.weight for g in v.groups if g.group in idx) for v in o.data.vertices])


# ------------------------------------------------------------------ campo "plus-size", medido no próprio pacote
def campo_plus():
    arm_m, pm = importar("m")
    arm_p, pp = importar("p")
    corpo_m, corpo_p = pm["corpo"], pp["corpo"]
    Pm, Pp = pos_mundo(corpo_m), pos_mundo(corpo_p)
    bvh = BVHTree.FromPolygons([tuple(p) for p in Pp], [tuple(f.vertices) for f in corpo_p.data.polygons])
    n3 = corpo_m.matrix_world.to_3x3()
    D = np.zeros_like(Pm)
    ok = np.zeros(len(Pm), bool)
    for i, v in enumerate(corpo_m.data.vertices):
        p, n = Vector(Pm[i]), (n3 @ v.normal).normalized()
        melhor = None
        for d in (n, -n):
            hit = bvh.ray_cast(p, d, 0.22)
            if hit[0] is not None and hit[1].dot(n) > 0.3 and (melhor is None or hit[3] < melhor[3]):
                melhor = hit
        if melhor is not None:
            D[i] = np.array(melhor[0]) - Pm[i]
            ok[i] = True
    # buracos e serrilhado: suaviza pelo vizinho
    viz = vizinhos(corpo_m.data)
    for _ in range(25):
        N = D.copy()
        for i, vs in enumerate(viz):
            if vs:
                m = D[vs].mean(0)
                N[i] = m if not ok[i] else 0.5 * D[i] + 0.5 * m
        D = N
    # mãos e pés não engordam; cabeça e pescoço só um pouco
    mao = peso(corpo_m, [b.name for b in arm_m.data.bones if "Hand" in b.name and b.name not in ("LeftHand", "RightHand")])
    mao += peso(corpo_m, ["LeftHand", "RightHand"])
    pe = peso(corpo_m, ["LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase"])
    cab = peso(corpo_m, ["Head"])
    k = np.clip(1 - mao, 0, 1) * np.clip(1 - 0.7 * pe, 0, 1) * np.clip(1 - 0.55 * cab, 0, 1)
    D *= k[:, None]
    print("campo plus: raios ok", ok.mean().round(3), "deslocamento máx", np.linalg.norm(D, axis=1).max().round(3))
    for o in list(pm.values()) + list(pp.values()) + [arm_m, arm_p]:
        bpy.data.objects.remove(o, do_unlink=True)
    return Pm, D


def aplica_campo(partes, Pm, D, quanto):
    kd = KDTree(len(Pm))
    for i, p in enumerate(Pm):
        kd.insert(Vector(p), i)
    kd.balance()
    for o in partes.values():
        P = pos_mundo(o)
        for j, p in enumerate(P):
            viz = kd.find_n(Vector(p), 8)
            w = np.array([1 / (d + 1e-4) ** 2 for _, _, d in viz])
            d_ = sum(wi * D[i] for wi, (_, i, _) in zip(w, viz)) / w.sum()
            P[j] = p + quanto * d_
        grava_mundo(o, P)


# ------------------------------------------------------------------ rosto: olhos maiores (crianças) e rosto redondo
def ilhas(o):
    bm = bmesh.new()
    bm.from_mesh(o.data)
    vis, res = set(), []
    for v in bm.verts:
        if v.index in vis:
            continue
        st, il = [v], []
        while st:
            x = st.pop()
            if x.index in vis:
                continue
            vis.add(x.index)
            il.append(x.index)
            st += [e.other_vert(x) for e in x.link_edges]
        res.append(il)
    bm.free()
    return res


def olhos(rosto, f):
    P = pos_mundo(rosto)
    ils = [(P[il].mean(0), il) for il in ilhas(rosto)]
    zs = sorted(c[2] for c, _ in ils)
    z_olho = sorted({round(c[2], 2) for c, _ in ils})
    # olhos: as duas ilhas de altura do meio, uma de cada lado
    meio = np.median(zs)
    for c, il in ils:
        if abs(c[0]) > 0.02 and abs(c[2] - 1.604) < 0.012:  # olhos (mesma altura nas bases)
            k = f
        elif c[2] > 1.62:  # sobrancelhas
            k = 1 - (f - 1) * 0.6
        else:  # boca
            k = 1 - (f - 1) * 0.4
        P[il] = c + (P[il] - c) * k
    grava_mundo(rosto, P)


def rosto_redondo(partes, arm, intensidade):
    """Encurta o queixo e alarga as bochechas (cara de criança), em tudo o que está preso à cabeça."""
    cab = arm.matrix_world @ arm.data.bones["Head"].head_local
    z_ref = 1.545
    for o in partes.values():
        g = o.vertex_groups.get("Head")
        if g is None:
            continue
        P = pos_mundo(o)
        w = peso(o, ["Head"])
        for j, p in enumerate(P):
            if w[j] < 0.05:
                continue
            if cab.z - 0.06 < p[2] < z_ref:
                P[j][2] = z_ref + (p[2] - z_ref) * (1 - 0.4 * intensidade * w[j])
            if p[2] < z_ref + 0.06:
                P[j][0] = cab.x + (p[0] - cab.x) * (1 + 0.06 * intensidade * w[j])
        grava_mundo(o, P)


# ------------------------------------------------------------------ esqueleto: escala por osso e postura
def deforma(arm, partes, cfg):
    s = cfg.get("s", 1.0)
    for b in arm.data.bones:
        b.inherit_scale = "NONE"
    for pb in arm.pose.bones:
        g = grupo(pb.name)
        if g == "cab":
            c = cfg.get("cab", 1.0) * (s if "cab" not in cfg else 1.0)
            pb.scale = (c * 1.07, c * 0.93, c * 1.07) if cfg.get("cab_redonda") else (c, c, c)
            continue
        comp, gr = cfg.get(g, (1.0, 1.0))
        gx, gz = gr if isinstance(gr, tuple) else (gr, gr)
        pb.scale = (s * gx, s * comp, s * gz)
    ang = cfg.get("postura", 0)
    if ang:
        bpy.context.view_layer.update()
        h0 = (arm.matrix_world @ arm.pose.bones["Head"].head).y
        for nome, a in (("Spine1", ang * 0.6), ("Neck", ang), ("Head", -ang * 1.2)):
            pb = arm.pose.bones[nome]
            pb.rotation_mode = "XYZ"
            pb.rotation_euler.x = math.radians(a)
        bpy.context.view_layer.update()
        if (arm.matrix_world @ arm.pose.bones["Head"].head).y > h0:  # a frente é -Y: inverte se foi para trás
            for nome in ("Spine1", "Neck", "Head"):
                arm.pose.bones[nome].rotation_euler.x *= -1
    bpy.context.view_layer.update()
    for o in partes.values():
        for x in bpy.context.selected_objects:
            x.select_set(False)
        bpy.context.view_layer.objects.active = o
        o.select_set(True)
        mod = next(m for m in o.modifiers if m.type == "ARMATURE")
        bpy.ops.object.modifier_apply(modifier=mod.name)
    for x in bpy.context.selected_objects:
        x.select_set(False)
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.select_all(action="SELECT")
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    for b in arm.data.bones:
        b.inherit_scale = "FULL"
        if b.name in ("Spine1", "Neck", "Head"):
            pass
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
    for o in partes.values():
        m = o.modifiers.new("Esqueleto", "ARMATURE")
        m.object = arm


# ------------------------------------------------------------------ cores
def uv_faixa(o, u_alvo, v_alvo):
    uv = o.data.uv_layers.active.data
    us = np.array([d.uv[:] for d in uv])
    v0, v1 = us[:, 1].min(), us[:, 1].max()
    du = u_alvo - us[:, 0].mean()
    for d, (u, v) in zip(uv, us):
        t = 0.5 if v1 - v0 < 1e-6 else (v - v0) / (v1 - v0)
        d.uv = (u + du, v_alvo[0] + t * (v_alvo[1] - v_alvo[0]))


def lin(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


A = np.array(__import__("PIL.Image", fromlist=["Image"]).open(PALETA).convert("RGB")).astype(float)
_faixa = A[int((1 - PELE_V[1]) * 1024):int((1 - PELE_V[0]) * 1024), int(PELE_U * 1024)]
REF = [np.mean([lin(x) for x in _faixa[:, c]]) for c in range(3)]
FATOR = {k: [lin(t[c]) / REF[c] for c in range(3)] for k, t in TONS.items()}


def material(nome, pele):
    m = bpy.data.materials.new(nome)
    m.use_nodes = True
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Roughness"].default_value = 0.72
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = img
    t.interpolation = "Closest"
    if pele:
        mul = nt.nodes.new("ShaderNodeVectorMath")
        mul.operation = "MULTIPLY"
        mul.name = "tom"
        mul.inputs[1].default_value = FATOR["media"]
        nt.links.new(t.outputs["Color"], mul.inputs[0])
        nt.links.new(mul.outputs["Vector"], b.inputs["Base Color"])
    else:
        nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
    return m


MAT = {"pele": material("Pele", True), "rosto": material("Rosto", True), "geral": material("Paleta", False)}
MAT["rosto"].node_tree.nodes["tom"].inputs[1].default_value = (1, 1, 1)
# rosto (olhos, sobrancelhas, boca): escurece nos tons escuros para não perder o contraste
ROSTO = {"clara": 1.0, "media": 1.0, "morena": 0.6, "escura": 0.28}


# ------------------------------------------------------------------ chupeta (Creative Characters), levada para a boca do nosso rosto
CREATIVE = os.path.join(I, "Creative_Characters/Creative_Characters_Free_fbx/Creative_Character_free.fbx")


def _boca_olhos(o):
    P = pos_mundo(o)
    ils = sorted(((P[il].mean(0), il) for il in ilhas(o)), key=lambda c: c[0][2])
    boca = ils[0][0] if not (len(ils) > 5) else np.mean([ils[0][0], ils[1][0]], 0)
    olhos_ = [c for c, _ in ils if abs(c[0]) > 0.02 and c[2] < ils[-1][0][2] - 0.01]
    dx = max(c[0] for c in olhos_) - min(c[0] for c in olhos_)
    return boca, dx


def chupeta(arm, rosto, cor=None):
    antes = set(bpy.data.objects)
    acoes_antes = set(bpy.data.actions)
    bpy.ops.import_scene.fbx(filepath=CREATIVE)
    novos = [o for o in bpy.data.objects if o not in antes]
    for a_ in set(bpy.data.actions) - acoes_antes:
        bpy.data.actions.remove(a_)
    arm_c = next(o for o in novos if o.type == "ARMATURE")
    arm_c.animation_data_clear()
    for pb in arm_c.pose.bones:
        pb.matrix_basis.identity()
    bpy.context.view_layer.update()
    ch = next(o for o in novos if o.name.startswith("Pacifier_001"))
    cr = next(o for o in novos if o.name.startswith("Male_emotion_usual_001"))
    b_cr, dx_cr = _boca_olhos(cr)
    b_n, dx_n = _boca_olhos(rosto)
    k_ = dx_n / dx_cr
    P = pos_mundo(ch)
    P = b_n + (P - b_cr) * k_
    mw = ch.matrix_world.copy()
    ch.parent = arm
    ch.matrix_world = mw
    grava_mundo(ch, P)
    if cor is not None:  # troca o rosa da chupeta por outra cor da paleta, na mesma linha (mantém o sombreado)
        uv = ch.data.uv_layers.active.data
        us = np.array([d.uv[:] for d in uv])
        px = A[((1 - us[:, 1]) * 1023).astype(int).clip(0, 1023), (us[:, 0] * 1023).astype(int).clip(0, 1023)]
        rosa = (px[:, 0] > px[:, 1] + 40) & (px[:, 0] > px[:, 2])
        u0, v0 = us[rosa].mean(0)
        melhor = min(((np.linalg.norm(A[int((1 - v0) * 1023), int(u * 1023)] - np.array(cor)), u)
                      for u in np.linspace(0.0, 0.95, 400)))
        du = melhor[1] - u0
        for d, r in zip(uv, rosa):
            if r:
                d.uv = (d.uv[0] + du, d.uv[1])
    for vg in list(ch.vertex_groups):
        ch.vertex_groups.remove(vg)
    g = ch.vertex_groups.new(name="Head")
    g.add(list(range(len(ch.data.vertices))), 1.0, "REPLACE")
    for m in list(ch.modifiers):
        ch.modifiers.remove(m)
    m = ch.modifiers.new("Esqueleto", "ARMATURE")
    m.object = arm
    for o in novos:
        if o is not ch:
            bpy.data.objects.remove(o, do_unlink=True)
    return ch


# ------------------------------------------------------------------ recém-nascido: manta e cabelo rente
MANTA_UV = (0.70, (0.982, 0.99))  # creme da paleta


def _aponta(arm, pb, d_mundo):
    """Gira o osso (com os filhos) para apontar na direção d_mundo."""
    mw = arm.matrix_world
    q = ((mw @ pb.tail) - (mw @ pb.head)).rotation_difference(Vector(d_mundo).normalized())
    R = mw.to_quaternion()
    qa = R.inverted() @ q @ R
    pb.matrix = Matrix.Translation(pb.head) @ qa.to_matrix().to_4x4() @ Matrix.Translation(-pb.head) @ pb.matrix
    bpy.context.view_layer.update()


def _objeto(nome, me, arm, grupo_osso, uv, material_):
    ob = bpy.data.objects.new(nome, me)
    scn.collection.objects.link(ob)
    while me.uv_layers:  # um mapa só, com a cor escolhida (a cópia do corpo trazia o da pele)
        me.uv_layers.remove(me.uv_layers[0])
    uvl = me.uv_layers.new(name="UVMap")
    for d in uvl.data:
        d.uv = (uv[0], uv[1])
    for f in me.polygons:
        f.use_smooth = True
    ob.parent = arm
    ob.matrix_parent_inverse = arm.matrix_world.inverted()  # os pontos já estão no mundo
    g = ob.vertex_groups.new(name=grupo_osso)
    g.add(list(range(len(me.vertices))), 1.0, "REPLACE")
    ob.modifiers.new("Esqueleto", "ARMATURE").object = arm
    me.materials.append(material_)
    return ob


def enrolar(arm, partes, nome):
    """Manta em volta do corpo (só a cabeça fica de fora) e cabelo rente no lugar do penteado."""
    corpo = partes["corpo"]
    mw = arm.matrix_world
    pbs = arm.pose.bones
    # 1. pose dentro da manta: braços dobrados no peito (mãos perto do queixo), pernas juntas e um pouco dobradas
    for lado, sx in (("Left", 1), ("Right", -1)):
        _aponta(arm, pbs[lado + "Arm"], (sx * 0.12, -0.2, -1))
        _aponta(arm, pbs[lado + "ForeArm"], (-sx * 0.5, -0.6, 0.62))
        _aponta(arm, pbs[lado + "Hand"], (-sx * 0.35, -0.4, 0.85))
        _aponta(arm, pbs[lado + "UpLeg"], (-sx * 0.07, -0.12, -1))  # joelhos se encostam
        _aponta(arm, pbs[lado + "Leg"], (-sx * 0.01, 0.1, -1))
        _aponta(arm, pbs[lado + "Foot"], (0, -1, -0.9))
    w_cab = peso(corpo, ["Head"])
    ev = corpo.evaluated_get(bpy.context.evaluated_depsgraph_get())
    me_ev = ev.to_mesh()
    bm = bmesh.new()
    bm.from_mesh(me_ev)
    bm.transform(ev.matrix_world)
    ev.to_mesh_clear()
    mwa = arm.matrix_world
    pes_ = [mwa @ arm.pose.bones[l + "Foot"].head for l in ("Left", "Right")]
    joe = [mwa @ arm.pose.bones[l + "Leg"].head for l in ("Left", "Right")]
    quad = mwa @ arm.pose.bones["Hips"].head
    for pb in pbs:
        pb.matrix_basis.identity()
    bpy.context.view_layer.update()
    R = pos_mundo(partes["rosto"])
    boca, _ = _boca_olhos(partes["rosto"])
    z_sobr = R[:, 2].max()
    Pc = pos_mundo(corpo)
    topo = Pc[w_cab > 0.5, 2].max()
    alt = topo - Pc[:, 2].min()
    k = alt / 0.5  # medidas pensadas para 50 cm
    z_gola = boca[2] - 0.55 * (z_sobr - boca[2])  # a manta sobe até um pouco abaixo da boca
    hc0 = Pc[w_cab > 0.9].mean(0)
    r_cab = np.median(np.linalg.norm((Pc[w_cab > 0.9] - hc0)[:, :2], axis=1))
    # 2. molde: o corpo posado sem a cabeça, inflado (braços, barriga e pernas marcam por baixo do tecido)
    bm.verts.ensure_lookup_table()
    z_corte = quad.z - 0.25 * (quad.z - joe[0].z)  # das coxas para baixo a manta é um volume só (pernas embrulhadas)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if w_cab[v.index] >= 0.5 or v.co.z > z_gola or v.co.z < z_corte],
                     context="VERTS")
    bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary], sides=0)
    bm.normal_update()
    for v in bm.verts:
        v.co = v.co + v.normal * (0.011 * k)
    # gola: um rolo da manta em volta do pescoço, mais alto atrás (emoldura o rosto como um capuz baixo)
    gola = bmesh.new()
    bmesh.ops.create_cone(gola, cap_ends=True, segments=32, radius1=r_cab * 0.95, radius2=r_cab * 1.02, depth=r_cab * 0.55)
    inc = Matrix.Rotation(math.radians(-24), 4, "X")  # a frente é -y: o lado de trás sobe
    gola.transform(Matrix.Translation(Vector((hc0[0], hc0[1] + r_cab * 0.12, z_gola - r_cab * 0.12))) @ inc)
    me_tmp = bpy.data.meshes.new("_g")
    gola.to_mesh(me_tmp)
    gola.free()
    bm.from_mesh(me_tmp)
    bpy.data.meshes.remove(me_tmp)
    # saco das pernas: do meio da barriga até abaixo dos pés, afunilando e com a ponta arredondada
    z_pe = min(p_.z for p_ in pes_) - 0.03 * k
    Vq = np.array([v.co[:] for v in bm.verts])
    perto = Vq[np.abs(Vq[:, 2] - z_corte) < 0.02 * k]
    cx, cy = perto[:, 0].mean(), perto[:, 1].mean()
    rx = (perto[:, 0].max() - perto[:, 0].min()) / 2 + 0.004 * k
    ry = (perto[:, 1].max() - perto[:, 1].min()) / 2 + 0.004 * k
    z_topo = z_corte + 0.06 * k
    ponta = bmesh.new()
    bmesh.ops.create_uvsphere(ponta, u_segments=40, v_segments=24, radius=1.0)
    for v in ponta.verts:  # esfera → casulo: t = 0 na ponta dos pés, 1 em cima; só a ponta de baixo arredonda
        t = (v.co.z + 1) / 2
        dxy = Vector((v.co.x, v.co.y))
        dxy = dxy.normalized() if dxy.length > 1e-6 else dxy
        afina = 0.6 + 0.4 * (1 - (1 - t) ** 1.6)
        r = afina * (math.sqrt(max(0.0, 1 - ((0.2 - t) / 0.2) ** 2)) if t < 0.2 else 1.0)
        if t > 0.97:
            r *= 0.0  # tampa de cima (fica dentro do tronco)
        v.co = Vector((cx + dxy.x * rx * r, cy + dxy.y * ry * r * (0.82 + 0.18 * afina), z_pe + t * (z_topo - z_pe)))
    me_tmp = bpy.data.meshes.new("_p")
    ponta.to_mesh(me_tmp)
    ponta.free()
    bm.from_mesh(me_tmp)
    bpy.data.meshes.remove(me_tmp)
    me = bpy.data.meshes.new(nome + "_manta")
    bm.to_mesh(me)
    bm.free()
    tmp = bpy.data.objects.new("_tmp", me)
    scn.collection.objects.link(tmp)
    rm = tmp.modifiers.new("r", "REMESH")
    rm.mode, rm.voxel_size = "VOXEL", 0.004 * k
    sm = tmp.modifiers.new("s", "SMOOTH")
    sm.factor, sm.iterations = 0.9, 8
    me2 = bpy.data.meshes.new_from_object(tmp.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(tmp, do_unlink=True)
    bpy.data.meshes.remove(me)
    me2.name = nome + "_manta"
    # 3. tricô fino (nervuras horizontais suaves) e a aba que cruza o peito na diagonal
    V = np.array([v.co[:] for v in me2.vertices])
    N = np.array([v.normal[:] for v in me2.vertices])
    c = V.mean(0)
    z0, z1 = V[:, 2].min(), V[:, 2].max()
    passo = 0.0045 * k
    desl = 0.0003 * k * np.sin(2 * np.pi * (V[:, 2] - z0) / passo)
    nrm = np.array([0.8, 0.0, 1.0]) / np.linalg.norm([0.8, 0.0, 1.0])  # borda da aba: sobe da direita para a esquerda
    meio = np.array([c[0], c[1], z0 + 0.6 * (z1 - z0)])
    d = (V - meio) @ nrm
    larg = 0.14 * k
    frente = N[:, 1] < 0.1
    aba = frente & (d < 0) & (d > -larg) & (V[:, 2] < z_gola - 0.02 * k)
    desl[aba] += 0.004 * k * np.clip(1 + d[aba] / larg, 0, 1) ** 0.5
    V = V + N * desl[:, None]
    for v, p in zip(me2.vertices, V):
        v.co = p
    if "manta" not in MAT:  # material próprio: no jogo a cor da manta é escolhida (material.color)
        MAT["manta"] = material("Manta", False)
    manta = _objeto(nome + "_manta", me2, arm, "Spine", (MANTA_UV[0], MANTA_UV[1][0]), MAT["manta"])
    # 4. o corpo que ficou dentro da manta sai (só fica a cabeça e o pescoço)
    nomes_g = {g.index: g.name for g in corpo.vertex_groups}
    dom = [nomes_g.get(max(v.groups, key=lambda g: g.weight).group, "") if v.groups else "" for v in corpo.data.vertices]
    bm = bmesh.new()
    bm.from_mesh(corpo.data)
    bm.verts.ensure_lookup_table()
    fora = [f for f in bm.faces if all(dom[v.index] not in ("Head", "Neck") for v in f.verts)]
    bmesh.ops.delete(bm, geom=fora, context="FACES")
    bm.to_mesh(corpo.data)
    bm.free()
    # 5. cabelo: no lugar do penteado, uma camada rente ao couro cabeludo (alto e atrás da cabeça)
    if "cabelo" in partes:
        bpy.data.objects.remove(partes.pop("cabelo"), do_unlink=True)
    Pc = pos_mundo(corpo)
    w_cab = peso(corpo, ["Head"])
    hc = Pc[w_cab > 0.9].mean(0)
    raio = np.median(np.linalg.norm(Pc[w_cab > 0.9] - hc, axis=1))
    # cópia da cabeça, subdividida (borda suave), cortada por um plano inclinado: alto na testa, baixo na nuca
    bm = bmesh.new()
    bm.from_mesh(corpo.data)
    bm.transform(corpo.matrix_world)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if w_cab[v.index] < 0.9], context="VERTS")
    bvh_cab = BVHTree.FromBMesh(bm)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=2, use_grid_fill=True)
    # a cabeça toda: linha do cabelo na testa, acima das orelhas e descendo na nuca (a frente é -y)
    n_pl = Vector((0, 0.4, 1)).normalized()
    p_pl = Vector((hc[0], hc[1] - raio, z_sobr + 0.33 * (topo - z_sobr)))
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=p_pl, plane_no=n_pl, clear_inner=True)
    for v in bm.verts:  # assenta na cabeça e sai um pouquinho, para fora a partir do centro
        q = bvh_cab.find_nearest(v.co)[0]
        v.co = (q if q is not None else v.co) + (v.co - Vector(hc)).normalized() * (0.001 * k)  # bem rente
    me_c = bpy.data.meshes.new(nome + "_cabelo")
    bm.to_mesh(me_c)
    bm.free()
    if "cabelo" not in MAT:  # material próprio: no jogo a cor do cabelo é escolhida (material.color) e o tipo liga/desliga
        MAT["cabelo"] = material("Cabelo", False)
    cab = _objeto(nome + "_cabelo", me_c, arm, "Head", (0.822, 0.254), MAT["cabelo"])  # castanho claro
    partes["cabelo"] = cab
    # 6. gorrinho de tricô: casca lisa que acompanha a cabeça (raio medido em cada direção e suavizado), cortada por
    #    um plano (borda reta: alta na testa, passando um pouco por cima da orelha, descendo atrás) e aba dobrada
    bm = bmesh.new()
    bm.from_mesh(corpo.data)
    bm.transform(corpo.matrix_world)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if w_cab[v.index] < 0.5], context="VERTS")
    bvh_h = BVHTree.FromBMesh(bm)
    bm.free()
    c_g = Vector(hc)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=96, v_segments=48, radius=1.0)
    bm.verts.ensure_lookup_table()
    dirs = [v.co.normalized() for v in bm.verts]
    r = np.zeros(len(dirs))
    for idx, d in enumerate(dirs):
        hit = bvh_h.ray_cast(c_g + d * raio * 3, -d, raio * 3)[0]  # de fora para dentro: pega a superfície externa
        r[idx] = (hit - c_g).length if hit is not None else raio
    viz_ = [[e.other_vert(v).index for e in v.link_edges] for v in bm.verts]
    for _ in range(14):  # suaviza o raio: a casca fica lisa, a orelha vira só um volume suave
        r = np.maximum(r, np.array([0.5 * r[a] + 0.5 * np.mean(r[viz_[a]]) for a in range(len(r))]))
    z_linha = z_sobr + 0.33 * (topo - z_sobr)
    p_g = Vector((hc[0], hc[1] - raio, z_linha + 0.22 * (topo - z_linha)))
    n_g = Vector((0, 0.6, 1)).normalized()
    for idx, v in enumerate(bm.verts):
        v.co = c_g + dirs[idx] * (r[idx] + 0.0035 * k)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=p_g, plane_no=n_g, clear_inner=True)
    for v in bm.verts:  # aba dobrada: um rolinho uniforme ao longo da borda; tricô em gomos bem leves
        d_ = (v.co - p_g).dot(n_g)
        t_ = max(0.0, 1 - d_ / (0.011 * k))
        aba = 0.0026 * k * math.sin(math.pi * min(1.0, t_ * 1.15)) ** 0.7 if t_ > 0 else 0.0
        gomo = 0.00022 * k * math.cos(math.atan2(v.co.y - hc[1], v.co.x - hc[0]) * 36) * (1 - t_)
        v.co = v.co + (v.co - c_g).normalized() * (aba + gomo)
    me_g = bpy.data.meshes.new(nome + "_gorro")
    bm.to_mesh(me_g)
    bm.free()
    if "gorro" not in MAT:
        MAT["gorro"] = material("Gorro", False)
    gorro = _objeto(nome + "_gorro", me_g, arm, "Head", (MANTA_UV[0], MANTA_UV[1][0]), MAT["gorro"])
    sol = gorro.modifiers.new("espessura", "SOLIDIFY")
    sol.thickness, sol.offset = 0.0025 * k, -1
    sol.use_even_offset = True
    gorro.modifiers.move(len(gorro.modifiers) - 1, 0)
    partes["gorro"] = gorro
    partes["manta"] = manta
    return manta


# ------------------------------------------------------------------ montagem
Pm, Dplus = campo_plus()
# animações do pacote para a página (id, arquivo de origem, nome no FBX); todas no mesmo esqueleto
ANIMS = [("parado", "m", "Idle"), ("olhando", "m", "Idle_LookAround"), ("andando", "m", "Adult_Walk"),
         ("correndo", "m", "Adult_Run"), ("comemorando", "m", "Adult_Happy"), ("triste", "m", "Adult_Sad"),
         ("aplaudindo", "m", "Adult_Clap"), ("conversando", "m", "Adult_TalkGestureActive"),
         ("telefone", "apoc", "Adult_IdleTalkPhone"), ("carregando", "apoc", "Adult_WalkCarryItem")]
_antes = set(bpy.data.objects)
_acoes_antes = set(bpy.data.actions)
bpy.ops.import_scene.fbx(filepath=os.path.join(I, "Apocalypse/Apocalypse_Free_fbx/Apocalypse_Free_fbx/Characters/Adult_Survivor.fbx"))
for _a in set(bpy.data.actions) - _acoes_antes:
    _a["_fbx"] = "apoc"  # o esqueleto do Santa vem girado no arquivo; o do Apocalypse é igual ao nosso
    _a.use_fake_user = True
for _o in set(bpy.data.objects) - _antes:
    bpy.data.objects.remove(_o, do_unlink=True)
ACOES_BASE = {}
# animações Mixamo já convertidas para o esqueleto do pacote (mixamo_pacote.py)
MIX = os.path.join(SCR, "corpos", "mixamo_pacote.blend")
with bpy.data.libraries.load(MIX, link=False) as (_src, _dst):
    _dst.actions = [a for a in _src.actions if a.startswith("mix|")]
MIXAMO = {}
for _a in _dst.actions:
    _a.use_fake_user = True
    MIXAMO[_a.name.split("|", 1)[1]] = _a
NO_CHAO = ("dormindo_chao", "abdominal", "rezando")  # apoio no chão ajustado em cada corpo
APOIOS = {"sentando": ("cadeira", "fim"), "sentado": ("cadeira", "meio"),
          "deitando": ("cama", "fim"), "dormindo_cama": ("cama", "meio")}
ANIMS = ANIMS + [(k, "mix", k) for k in MIXAMO]


def _curvas(acao, caminho):
    out = {}
    for lay in acao.layers:
        for st in lay.strips:
            for cb in st.channelbags:
                for fc in cb.fcurves:
                    if fc.data_path == caminho:
                        out[fc.array_index] = fc
    return out


def abre_bracos(arm, acoes, graus):
    """Afasta os braços do tronco (corpos largos): soma uma rotação fixa ao braço em todas as animações."""
    arm.animation_data.action = None
    for pb in arm.pose.bones:
        pb.matrix_basis.identity()
    bpy.context.view_layer.update()
    for lado in ("Left", "Right"):
        pb = arm.pose.bones[lado + "Arm"]
        x0 = abs((arm.matrix_world @ arm.pose.bones[lado + "Hand"].head).x)
        melhor = None
        for eixo in ((1, 0, 0), (0, 1, 0), (0, 0, 1)):
            for sg in (1, -1):
                q = Quaternion(eixo, math.radians(graus) * sg)
                pb.rotation_quaternion = q
                bpy.context.view_layer.update()
                h = arm.matrix_world @ arm.pose.bones[lado + "Hand"].head
                ganho = abs(h.x) - x0 - abs(h.y - (arm.matrix_world @ pb.head).y) * 0.5
                if melhor is None or ganho > melhor[0]:
                    melhor = (ganho, q)
        pb.rotation_quaternion = (1, 0, 0, 0)
        q_off = melhor[1]
        for a in acoes:
            fcs = _curvas(a, f'pose.bones["{lado}Arm"].rotation_quaternion')
            if len(fcs) != 4:
                continue
            n = len(fcs[0].keyframe_points)
            if any(len(fcs[i].keyframe_points) != n for i in range(4)):
                continue
            for k in range(n):
                q = Quaternion([fcs[i].keyframe_points[k].co.y for i in range(4)]) @ q_off
                for i in range(4):
                    kp = fcs[i].keyframe_points[k]
                    d = q[i] - kp.co.y
                    kp.co.y += d
                    kp.handle_left.y += d
                    kp.handle_right.y += d
    bpy.context.view_layer.update()


def _usar(arm, a):
    arm.animation_data.action = a
    if a is not None and a.slots:
        arm.animation_data.action_slot = a.slots[0]


def _malha_mundo(o):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = o.evaluated_get(dg)
    me = ev.to_mesh()
    P = np.array([ev.matrix_world @ v.co for v in me.vertices])
    ev.to_mesh_clear()
    return P


def apoia_no_chao(arm, corpo, a):
    """Desce ou sobe o quadril para que o ponto mais baixo do corpo encoste no chão (z = 0) nessa animação."""
    _usar(arm, a)
    f0, f1 = (int(x) for x in a.frame_range)
    zmin = min(_malha_mundo(corpo)[:, 2].min() for f in np.linspace(f0, f1, 10).astype(int)
               if scn.frame_set(int(f)) is None)
    hips = arm.data.bones["Hips"]
    d = (arm.matrix_world @ hips.matrix_local).to_3x3().inverted() @ Vector((0, 0, -zmin))
    for i, fc in _curvas(a, 'pose.bones["Hips"].location').items():
        for kp in fc.keyframe_points:
            kp.co.y += d[i]
            kp.handle_left.y += d[i]
            kp.handle_right.y += d[i]
    return round(-zmin, 3)


def evita_rosto(arm, corpo, acoes, s):
    """Mãos que entram na cabeça (crianças e bebês têm a cabeça proporcionalmente maior): em cada quadro em que a mão
    chega perto demais do rosto, o braço inteiro gira no ombro o mínimo para a mão ficar do lado de fora, com folga.
    A cabeça é uma esfera medida no próprio corpo (pontos presos ao osso da cabeça); a folga cresce com o tamanho."""
    bpy.context.view_layer.update()
    P = pos_mundo(corpo)
    w = peso(corpo, ["Head"])
    cab = P[w > 0.6]
    c0 = cab.mean(0)
    raio = float(np.percentile(np.linalg.norm(cab - c0, axis=1), 80))
    hb = arm.data.bones["Head"]
    c_local = (arm.matrix_world @ hb.matrix_local).inverted() @ Vector(c0)
    folga = 0.035 * max(s, 0.55)
    corrigidos = {}
    mods = [m for o in corpo.users_collection[0].objects if o.type == "MESH" and o.parent is arm for m in o.modifiers]
    for m in mods:
        m.show_viewport = False
    for a in acoes:
        _usar(arm, a)
        f0, f1 = (int(x) for x in a.frame_range)
        n = 0
        for f in range(f0, f1 + 1):
            scn.frame_set(f)
            mudou = False
            for lado in ("Left", "Right"):
                pb_cab = arm.pose.bones["Head"]
                C = arm.matrix_world @ pb_cab.matrix @ c_local
                pb = arm.pose.bones[lado + "Arm"]
                pontos = [arm.pose.bones[lado + "Hand"].head, arm.pose.bones[lado + "Hand"].tail,
                          arm.pose.bones[lado + "HandMiddle2"].tail, arm.pose.bones[lado + "HandIndex2"].tail]
                pontos = [arm.matrix_world @ q for q in pontos]
                pior = max(pontos, key=lambda q: (raio + folga) - (q - C).length)
                fundo = (raio + folga) - (pior - C).length
                if fundo <= 0:
                    continue
                S = arm.matrix_world @ pb.head
                alvo = C + (pior - C).normalized() * (raio + folga)
                d1, d2 = (pior - S).normalized(), (alvo - S).normalized()
                q_mundo = d1.rotation_difference(d2)
                R_arm = arm.matrix_world.to_quaternion()
                q_arm = R_arm.inverted() @ q_mundo @ R_arm
                Sa = pb.head.copy()
                pb.matrix = Matrix.Translation(Sa) @ q_arm.to_matrix().to_4x4() @ Matrix.Translation(-Sa) @ pb.matrix
                bpy.context.view_layer.update()
                pb.keyframe_insert("rotation_quaternion", frame=f)
                mudou = True
            n += mudou
        if n:
            corrigidos[a.name.split("_", 1)[-1] if False else a.name] = n
    for m in mods:
        m.show_viewport = True
    return corrigidos


def mede_apoio(arm, corpo, lugar, a, tipo, quando):
    """Altura e posição do assento (ou do colchão) que a animação espera, medidas no próprio corpo."""
    _usar(arm, a)
    f0, f1 = (int(x) for x in a.frame_range)
    scn.frame_set(f1 if quando == "fim" else (f0 + f1) // 2)
    bpy.context.view_layer.update()
    P = _malha_mundo(corpo)
    hq = arm.matrix_world @ arm.pose.bones["Hips"].head
    cab = arm.matrix_world @ arm.pose.bones["Head"].head
    # assento: o ponto mais baixo do bumbum (pele presa ao quadril); colchão: o mais baixo do tronco
    ossos = ["Hips"] if tipo == "cadeira" else ["Hips", "Spine", "Spine1"]
    sel = peso(corpo, ossos) > 0.45
    h = float(P[sel, 2].min()) if sel.any() else float(hq.z) * 0.8
    o = lugar.location
    return {"tipo": tipo, "h": round(h, 3), "quadril": [round(hq.x - o.x, 3), round(hq.y - o.y, 3)],
            "cabeca": [round(cab.x - o.x, 3), round(cab.y - o.y, 3)]}


ACAO_IDLE = None
atores = []
for k, (nome, base, rotulo, cabelo, cfg) in enumerate(TIPOS):
    arm, partes = importar(base)
    if ACAO_IDLE is None:
        ACAO_IDLE = next(a for a in bpy.data.actions if a.get("_fbx") == "m" and a.name.split("|")[-1] == "Idle")
        ACAO_IDLE.name = "Idle_base"
        ACAO_IDLE.use_fake_user = True
        for _id, _fbx, _n in ANIMS:
            if _fbx == "mix":
                continue
            ACOES_BASE[_id] = ACAO_IDLE if _n == "Idle" else next(
                a for a in bpy.data.actions if a.get("_fbx") == _fbx and a.name.split("|")[-1] == _n)
            ACOES_BASE[_id].use_fake_user = True
        for _id, _a in MIXAMO.items():
            ACOES_BASE[_id] = _a
    arm.name = nome
    for papel, o in partes.items():
        o.name = f"{nome}_{papel}"
        if o.get("_roupa_propria"):
            continue  # roupa de outro pacote mantém o material e a textura dele
        o.data.materials.clear()
        o.data.materials.append(MAT["pele"] if papel == "corpo" else MAT["rosto"] if papel == "rosto" else MAT["geral"])
    uv_faixa(partes["corpo"], PELE_U, PELE_V)
    if "cabelo" in partes:
        uv_faixa(partes["cabelo"], *CABELOS[cabelo])
    # expressões: uma malha de rosto por expressão (a neutra é a original)
    ex = EX.gerar(partes["corpo"], partes["rosto"], arm, base in ("f", "fm"), MAT["rosto"], A, nome)
    for k_, o_ in ex.items():
        o_.name = f"{nome}_rosto_{k_}"
        if k_ != "neutro":
            partes["rosto_" + k_] = o_
    if cfg.get("chupeta"):
        partes["chupeta"] = chupeta(arm, partes["rosto"], None if base in ("f", "fm") else (70, 140, 235))
        partes["chupeta"].name = f"{nome}_chupeta"
        partes["chupeta"].data.materials.clear()
        partes["chupeta"].data.materials.append(MAT["geral"])
    if cfg.get("plus"):
        aplica_campo(partes, Pm, Dplus, cfg["plus"])
    if cfg.get("olhos"):
        for k_ in [k_ for k_ in partes if k_.startswith("rosto")]:
            olhos(partes[k_], cfg["olhos"])
    if cfg.get("rosto_redondo"):
        rosto_redondo(partes, arm, cfg["rosto_redondo"])
    if any(x in cfg for x in ("s", "cab", "postura", "ombro", "braco", "antebraco", "peito", "tronco", "coxa", "perna",
                              "pescoco", "mao", "pe")):
        deforma(arm, partes, cfg)
    if cfg.get("recem"):
        enrolar(arm, partes, nome)
    # animações do pacote, com o deslocamento do quadril na escala nova
    s = cfg.get("s", 1.0)
    copias = {}
    for id_, base_a in ([] if cfg.get("recem") else ACOES_BASE.items()):  # recém-nascido: sem animações
        a = base_a.copy()
        a.name = f"{nome}_{id_}"
        for lay in a.layers:
            for st in lay.strips:
                for cb in st.channelbags:
                    for fc in cb.fcurves:
                        if fc.data_path.endswith('["Hips"].location') or fc.data_path.endswith('["Root"].location'):
                            for kp in fc.keyframe_points:
                                kp.co.y *= s
                                kp.handle_left.y *= s
                                kp.handle_right.y *= s
        a.use_fake_user = True  # só entra no arquivo pelas trilhas, na hora de exportar
        copias[id_] = a
    a = copias.get("parado")
    arm.animation_data_create()
    arm.animation_data.action = a
    if a and a.slots:
        arm.animation_data.action_slot = a.slots[0]
    bpy.context.view_layer.update()
    zmin = pos_mundo(partes["manta" if cfg.get("recem") else "corpo"])[:, 2].min()
    lugar = bpy.data.objects.new(nome + "_lugar", None)
    scn.collection.objects.link(lugar)
    arm.parent = lugar
    lugar.location = (k * 1.4, 0, -zmin)
    tri = 0
    for o in partes.values():
        o.data.calc_loop_triangles()
        tri += len(o.data.loop_triangles)
    bpy.context.view_layer.update()
    alt = max(pos_mundo(o)[:, 2].max() for o in partes.values())
    # ajustes das animações neste corpo. As do pacote ficam como vieram (só a escala do quadril acompanha o
    # tamanho); a única exceção é "Ao telefone" em crianças e bebês, com a mão afastada do rosto. Os ajustes de
    # braços, rosto e contato valem para as do Mixamo.
    mix_copias = [c_ for k_, c_ in copias.items() if k_ in MIXAMO]
    rosto_copias = mix_copias + ([copias["telefone"]] if nome.startswith(("crianca", "pequen", "bebe")) else [])
    if cfg.get("abre_bracos"):
        abre_bracos(arm, mix_copias, cfg["abre_bracos"])
    for x_ in atores:  # os corpos anteriores ficam parados enquanto este é ajustado (avaliação mais rápida)
        x_[2].animation_data.action = None
    mao = evita_rosto(arm, partes["corpo"], rosto_copias, s)
    chao = {k_: apoia_no_chao(arm, partes["corpo"], copias[k_]) for k_ in NO_CHAO if k_ in copias}
    # mãos: não entram no corpo; nas animações de descanso, encostam no corpo, no colchão ou no chão
    toque = {} if os.environ.get("SEM_CONTATO") else contato.corrigir(arm, partes["corpo"], mix_copias, alt / 1.75,
                             descanso=("deitando", "dormindo_cama", "dormindo_chao", "sentado", "sentando"),
                             apoio={"deitando": "cama", "dormindo_cama": "cama", "dormindo_chao": "chao",
                                    "abdominal": "chao", "rezando": "chao"})
    apoios = {k_: mede_apoio(arm, partes["corpo"], lugar, copias[k_], *v_) for k_, v_ in APOIOS.items() if k_ in copias}
    _usar(arm, a)
    scn.frame_set(1)
    arm["_apoios"] = json.dumps(apoios)
    print(f"{nome}: altura {alt:.2f} m, {tri} triângulos, chão {chao}, mão longe do rosto {mao}, contato das mãos {toque}")
    atores.append((nome, rotulo, arm, partes, lugar, a))
    arm["_copias"] = [c.name for c in copias.values()]

for x_ in atores:
    _usar(x_[2], x_[5])
for a in list(bpy.data.actions):
    if a.users == 0 and not a.use_fake_user:
        bpy.data.actions.remove(a)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "corpos.blend"))

# ------------------------------------------------------------------ GLB por tipo (corpo + rosto + cabelo + Idle)
info = {"tons": {k: list(v) for k, v in TONS.items()}, "fator": FATOR, "rosto": ROSTO, "ref_lin": REF,
        "expressoes": {k: v[0] for k, v in EX.EXPRESSOES.items()}, "animacoes": [x[0] for x in ANIMS], "tipos": []}
# o glTF não leva o nó de multiplicar: exporta a textura direto (o tom é aplicado no jogo, em material.color)
_nt = MAT["pele"].node_tree
_tex = next(n for n in _nt.nodes if n.type == "TEX_IMAGE")
_bsdf = next(n for n in _nt.nodes if n.type == "BSDF_PRINCIPLED")
_nt.links.new(_tex.outputs["Color"], _bsdf.inputs["Base Color"])
_nr = MAT["rosto"].node_tree
_nr.links.new(next(n for n in _nr.nodes if n.type == "TEX_IMAGE").outputs["Color"],
              next(n for n in _nr.nodes if n.type == "BSDF_PRINCIPLED").inputs["Base Color"])
for nome, rotulo, arm, partes, lugar, a in atores:
    for x in bpy.context.selected_objects:
        x.select_set(False)
    arm.select_set(True)
    for o in partes.values():
        o.select_set(True)
    loc = lugar.location.copy()
    lugar.location = (0, 0, loc.z)
    bpy.context.view_layer.update()
    # cada animação numa trilha NLA: o glTF sai com uma animação por trilha, com o id como nome
    arm.animation_data.action = None
    trilhas = []
    for an in arm["_copias"]:
        act = bpy.data.actions[an]
        tr = arm.animation_data.nla_tracks.new()
        tr.name = an.split(f"{nome}_", 1)[1]
        st = tr.strips.new(tr.name, int(act.frame_range[0]), act)
        if hasattr(st, "action_slot") and act.slots:
            st.action_slot = act.slots[0]
        trilhas.append(tr)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, nome + ".glb"), use_selection=True, export_animations=True,
                              export_animation_mode="NLA_TRACKS", export_apply=False, export_yup=True,
                              export_image_format="AUTO")
    for tr in trilhas:
        arm.animation_data.nla_tracks.remove(tr)
    arm.animation_data.action = a
    lugar.location = loc
    info["tipos"].append({"id": nome, "rotulo": rotulo, "apoios": json.loads(arm["_apoios"])})
json.dump(info, open(os.path.join(OUT, "corpos.json"), "w"), ensure_ascii=False, indent=1)
_nt.links.new(_nt.nodes["tom"].outputs["Vector"], _bsdf.inputs["Base Color"])
_nr.links.new(_nr.nodes["tom"].outputs["Vector"], next(n for n in _nr.nodes if n.type == "BSDF_PRINCIPLED").inputs["Base Color"])

# ------------------------------------------------------------------ renders individuais (de frente, braços em A)
scn.frame_set(1)
for nome, rotulo, arm, partes, lugar, a in atores:
    arm.animation_data.action = None
    for pb in arm.pose.bones:
        pb.matrix_basis.identity()
    for lado, sinal in (("Left", 1), ("Right", -1)):
        pb = arm.pose.bones[lado + "Arm"]
        pb.rotation_mode = "XYZ"
    bpy.context.view_layer.update()
# acha o eixo que abaixa o braço (o pulso tem que descer)
for nome, rotulo, arm, partes, lugar, a in atores:
    for lado in ("Left", "Right"):
        pb = arm.pose.bones[lado + "Arm"]
        mao0 = (arm.matrix_world @ arm.pose.bones[lado + "Hand"].head).z
        melhor = None
        for eixo in range(3):
            for sg in (1, -1):
                pb.rotation_euler = (0, 0, 0)
                pb.rotation_euler[eixo] = math.radians(28) * sg
                bpy.context.view_layer.update()
                h = arm.matrix_world @ arm.pose.bones[lado + "Hand"].head
                if melhor is None or h.z < melhor[0]:
                    melhor = (h.z, eixo, sg)
        pb.rotation_euler = (0, 0, 0)
        pb.rotation_euler[melhor[1]] = math.radians(28) * melhor[2]
bpy.context.view_layer.update()

scn.render.engine = "CYCLES"
scn.cycles.samples = 40
scn.cycles.device = "CPU"
scn.view_settings.view_transform = "Standard"
scn.view_settings.exposure = -0.7
scn.render.film_transparent = True
w = bpy.data.worlds.new("w")
scn.world = w
w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.8, 0.8, 0.8, 1)
w.node_tree.nodes["Background"].inputs[1].default_value = 0.4
luzes = []
for loc, en in (((1.5, -4, 3), 380), ((-2.5, -3, 1.5), 150), ((0, 3, 3), 200)):
    bpy.ops.object.light_add(type="AREA", location=loc)
    L = bpy.context.active_object
    L.data.energy = en
    L.data.size = 3
    luzes.append((L, Vector(loc)))
cd = bpy.data.cameras.new("c")
cam = bpy.data.objects.new("c", cd)
scn.collection.objects.link(cam)
scn.camera = cam
cd.type = "ORTHO"
cd.ortho_scale = 2.1
scn.render.resolution_x, scn.render.resolution_y = 560, 1040
todos = [(o, lugar) for _, _, _, partes, lugar, _ in atores for o in partes.values()]
for nome, rotulo, arm, partes, lugar, a in atores:
    for o, l in todos:
        o.hide_render = l is not lugar or ("_rosto_" in o.name and not o.name.endswith("_neutro"))
    x = lugar.location.x
    cam.location = (x, -10, 0.98)
    cam.rotation_euler = (math.radians(90), 0, 0)
    for L, loc in luzes:
        L.location = loc + Vector((x, 0, 0))
        L.rotation_euler = (Vector((x, 0, 0.9)) - L.location).to_track_quat("-Z", "Y").to_euler()
    tons = TONS if nome in ("adulta", "adulto") else {"media": None}
    for tom in tons:
        MAT["pele"].node_tree.nodes["tom"].inputs[1].default_value = FATOR[tom]
        MAT["rosto"].node_tree.nodes["tom"].inputs[1].default_value = (ROSTO[tom],) * 3
        scn.render.filepath = os.path.join(OUT, f"r_{nome}_{tom}.png")
        bpy.ops.render.render(write_still=True)
    MAT["pele"].node_tree.nodes["tom"].inputs[1].default_value = FATOR["media"]
print("ok")
