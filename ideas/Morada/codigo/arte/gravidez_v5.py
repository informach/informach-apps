"""Barriga de grávida em três estágios, como formas (shape keys) no corpo: gravidez_1, gravidez_2, gravidez_3.

A malha da barriga é subdividida (mais pontos onde a curva acontece) e cada estágio é um domo de perfil suave: cheio e
redondo no meio, entrando no tronco sem quina (perfil (1 − r²)^e numa elipse), empurrando para a frente e um pouco para
os lados. Costas, braços e coxas não se mexem. No 2º e no 3º trimestre os seios crescem um pouco. O esqueleto não muda:
a biblioteca de animações continua servindo, e o jogo escolhe o estágio pelo peso da forma (0 a 1).

Uso: python gravidez.py -- <corpos.blend> <corpo1,corpo2,...>   (grava no mesmo .blend)
"""
import bpy, bmesh, sys
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

a = sys.argv[sys.argv.index("--") + 1:]
BLEND, CORPOS = a[0], a[1].split(",")
bpy.ops.wm.open_mainfile(filepath=BLEND)

# estágio: (quanto a barriga avança, raio da esfera, centro entre quadril (0) e peito (1), seios), em alturas de 1,75 m
ESTAGIOS = {
    "gravidez_1": (0.022, 0.13, 0.30, 0.0),
    "gravidez_2": (0.085, 0.17, 0.38, 0.006),
    "gravidez_3": (0.175, 0.225, 0.42, 0.012),
}


def peso(o, nomes):
    idx = {o.vertex_groups[n].index for n in nomes if n in o.vertex_groups}
    return np.array([sum(g.weight for g in v.groups if g.group in idx) for v in o.data.vertices])


def vizinhos(me):
    viz = [[] for _ in me.vertices]
    for e in me.edges:
        i, j = e.vertices
        viz[i].append(j)
        viz[j].append(i)
    return viz


def suave(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


for c in CORPOS:
    arm = bpy.data.objects[c]
    corpo = bpy.data.objects[c + "_corpo"]
    mw, mwa = corpo.matrix_world, arm.matrix_world
    quad = mwa @ arm.data.bones["Hips"].head_local
    peito = mwa @ arm.data.bones["Spine1"].head_local
    if corpo.data.shape_keys:
        corpo.shape_key_clear()
    P0 = np.array([mw @ v.co for v in corpo.data.vertices])
    k = (P0[:, 2].max() - P0[:, 2].min()) / 1.75
    if not corpo.get("barriga_subdividida"):  # mais pontos na barriga, sem mudar a forma de base
        w_br = peso(corpo, [b.name for b in arm.data.bones if any(t in b.name for t in ("Shoulder", "Arm", "Hand"))])
        regiao = (np.abs(P0[:, 0] - quad.x) < 0.26 * k) & (P0[:, 2] > quad.z - 0.16 * k) & \
                 (P0[:, 2] < peito.z + 0.12 * k) & (P0[:, 1] < quad.y + 0.04 * k) & (w_br < 0.3)
        bm = bmesh.new()
        bm.from_mesh(corpo.data)
        bm.faces.ensure_lookup_table()
        faces = [f for f in bm.faces if all(regiao[vv.index] for vv in f.verts)]
        bmesh.ops.subdivide_edges(bm, edges=list({e for f in faces for e in f.edges}), cuts=3, use_grid_fill=True)
        bm.to_mesh(corpo.data)
        bm.free()
        corpo.data.update()
        corpo["barriga_subdividida"] = True
        print(c, "subdividida:", len(faces), "faces", flush=True)
    P = np.array([mw @ v.co for v in corpo.data.vertices])
    N = np.array([(mw.to_3x3() @ v.normal).normalized() for v in corpo.data.vertices])
    BVH = BVHTree.FromPolygons([tuple(p) for p in P], [tuple(f.vertices) for f in corpo.data.polygons])
    w_bracos = peso(corpo, [b.name for b in arm.data.bones if any(t in b.name for t in ("Shoulder", "Arm", "Hand"))])
    w_pernas = peso(corpo, [b.name for b in arm.data.bones if any(t in b.name for t in ("UpLeg", "Leg", "Foot", "Toe"))])
    w_peito = peso(corpo, ["Spine1", "Spine2"]) if "Spine2" in corpo.vertex_groups else peso(corpo, ["Spine1"])
    viz = vizinhos(corpo.data)
    mi = mw.inverted()
    FORMAS = {}
    for nome, (proj, raio, t_alt, seio) in ESTAGIOS.items():
        proj, raio = proj * k, raio * k
        zc = quad.z + t_alt * (peito.z - quad.z)
        hit = BVH.ray_cast(Vector((quad.x, quad.y - 1.0, zc)), Vector((0, 1, 0)), 2.0)[0]
        y_pele = hit.y if hit is not None else quad.y - 0.1 * k
        centro = np.array([quad.x, y_pele + (raio - proj), zc])  # a frente da esfera fica 'proj' além da pele
        v = P - centro
        d = np.linalg.norm(v, axis=1)
        dirs = v / np.maximum(d, 1e-9)[:, None]
        # encontro da esfera com o corpo arredondado (sem vinco): máximo suave numa faixa de ~3 cm
        e_ = raio - d
        sv = 0.03 * k
        empurra = 0.5 * (e_ + np.sqrt(e_ * e_ + sv * sv)) - 0.5 * sv * np.exp(-np.maximum(e_, 0) / sv)
        empurra = np.maximum(empurra, 0.0)
        # pesos como funções contínuas da posição (não dependem da malha): frente, altura e coxas
        frente = suave((-(dirs[:, 1]) + 0.45) / 0.75)
        vert = suave(1 - (np.abs(P[:, 2] - zc) - 0.5 * raio) / (0.6 * raio))
        w = frente * vert * (1 - np.clip(w_pernas, 0, 1) * 0.85) * (1 - np.clip(w_bracos * 3, 0, 1))
        D = dirs * (empurra * w)[:, None]
        for _ in range(3):  # acabamento leve na malha densa
            D = 0.7 * D + 0.3 * np.array([D[nv].mean(0) if nv else D[i_] for i_, nv in enumerate(viz)])
        if seio:
            frente_p = suave((-(N[:, 1]) - 0.2) / 0.5)
            alto = suave(1 - np.abs(P[:, 2] - (peito.z + 0.07 * k)) / (0.09 * k))
            lado = suave(1 - (np.abs(np.abs(P[:, 0] - quad.x) - 0.09 * k)) / (0.07 * k))
            D[:, 1] -= seio * k * frente_p * alto * lado * np.clip(w_peito, 0, 1)
        FORMAS[nome] = P + D
        print(c, nome, f"barriga {np.max(-D[:, 1]) * 100:.1f} cm à frente", flush=True)
    corpo.shape_key_add(name="Basis", from_mix=False)
    for nome, X in FORMAS.items():
        kb = corpo.shape_key_add(name=nome, from_mix=False)
        for i_, p in enumerate(X):
            kb.data[i_].co = mi @ Vector(p)
        kb.value = 0.0
bpy.ops.wm.save_mainfile()
print("fim")
