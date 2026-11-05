"""Quanto o antebraço entra no próprio corpo, quadro a quadro, em todas as ações de uma biblioteca.

Para pontos da malha do antebraço: estão dentro do corpo (sem a malha dos braços)? O teste conta quantas vezes raios
em 4 direções horizontais atravessam o corpo (ímpar = dentro; vale a maioria, porque o corpo sem braços tem um buraco
em cada ombro). A profundidade é a distância do ponto de dentro até a pele mais próxima.
Uso: python mede_antebraco.py -- <biblioteca.blend> <corpo> <saida.json>
"""
import bpy, sys, json
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

a = sys.argv[sys.argv.index("--") + 1:]
BLEND, CORPO, SAIDA = a[:3]
SO = set(a[3].split(",")) if len(a) > 3 and a[3] else set()
bpy.ops.wm.open_mainfile(filepath=BLEND)
scn = bpy.context.scene
arm = bpy.data.objects[CORPO]
corpo = bpy.data.objects[CORPO + "_corpo"]
for o in bpy.data.objects:
    if o.type == "MESH" and o.parent is arm and o is not corpo:
        for m in o.modifiers:
            m.show_viewport = False


def peso(nomes):
    idx = {corpo.vertex_groups[n].index for n in nomes if n in corpo.vertex_groups}
    return np.array([sum(g.weight for g in v.groups if g.group in idx) for v in corpo.data.vertices])


tris = []
for p in corpo.data.polygons:
    v = p.vertices
    for i in range(1, len(v) - 1):
        tris.append((v[0], v[i], v[i + 1]))
tris = np.array(tris)
masc, raio, inseguro, idx_ante = {}, {}, {}, {}
arm.animation_data.action = None
for pb in arm.pose.bones:
    pb.matrix_basis.identity()
bpy.context.view_layer.update()
P0 = np.array([corpo.matrix_world @ v.co for v in corpo.data.vertices])
mw = arm.matrix_world
for lado in ("Left", "Right"):
    # o corpo, para este antebraço: sem os dois braços (um braço encostado no outro não conta)
    w = peso([b.name for b in arm.data.bones if any(t in b.name for t in ("Shoulder", "Arm", "Hand"))])
    T = tris[(w[tris] < 0.3).all(1)]
    masc[lado] = [tuple(t) for t in T]
    # triângulos perto do buraco do ombro (onde o braço foi tirado): ali o lado de dentro/fora não é confiável
    from collections import Counter
    ar = Counter(tuple(sorted(e)) for t in T for e in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])))
    borda_v = {v for e, n in ar.items() if n == 1 for v in e}
    for _ in range(3):
        borda_v |= {v for t in T if borda_v.intersection(t) for v in t}
    inseguro[lado] = {i for i, t in enumerate(T) if borda_v.intersection(t)}
    wf = peso([lado + "ForeArm"]) > 0.6
    pf = arm.pose.bones[lado + "ForeArm"]
    A, B = np.array(mw @ pf.head), np.array(mw @ pf.tail)
    d = (B - A) / np.linalg.norm(B - A)
    X = P0[wf] - A
    raio[lado] = float(np.median(np.linalg.norm(X - np.outer(X @ d, d), axis=1)))
    idx_ante[lado] = list(np.nonzero(wf)[0][::2])
DIRS = [Vector((1, 0, 0)), Vector((-1, 0, 0)), Vector((0, 1, 0)), Vector((0, -1, 0))]
res = {}
for act in sorted(bpy.data.actions, key=lambda x: x.name):
    if not act.name.startswith("resident.") or (SO and act.name not in SO):
        continue
    arm.animation_data.action = act
    if act.slots:
        arm.animation_data.action_slot = act.slots[0]
    f0, f1 = (int(x) for x in act.frame_range)
    pior, quadros = 0.0, 0
    n = 0
    for f in range(f0, f1 + 1, 2):
        scn.frame_set(f)
        ev = corpo.evaluated_get(bpy.context.evaluated_depsgraph_get())
        me = ev.to_mesh()
        P = [ev.matrix_world @ v.co for v in me.vertices]
        ev.to_mesh_clear()
        q_pior = 0.0
        for lado in ("Left", "Right"):
            bvh = BVHTree.FromPolygons(P, masc[lado])
            for vi in idx_ante[lado]:
                q = P[vi]
                dentro = 0
                for d in DIRS:
                    o_, n_ = q, 0
                    while True:
                        hit = bvh.ray_cast(o_, d, 2.0)
                        if hit[0] is None:
                            break
                        n_ += 1
                        o_ = hit[0] + d * 1e-4
                    dentro += n_ % 2
                if dentro >= 3:
                    q_pior = max(q_pior, bvh.find_nearest(q)[3])
        pior = max(pior, q_pior)
        quadros += q_pior > 0.01
        n += 1
    res[act.name] = {"cm": round(pior * 100, 1), "amostras_1cm": quadros, "amostras": n}
json.dump({"raio_antebraco": raio, "acoes": res}, open(SAIDA, "w"), indent=1)
ruins = sorted(((v["cm"], k, v["amostras_1cm"]) for k, v in res.items() if v["cm"] > 1.0), reverse=True)
print(CORPO, "ações:", len(res), "antebraço entra > 1 cm:", len(ruins))
for cm, k, q in ruins:
    print(f"  {k}: {cm} cm, {q} amostras")
