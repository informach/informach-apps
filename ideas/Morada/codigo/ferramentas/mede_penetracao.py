import bpy, sys, numpy as np
from mathutils.bvhtree import BVHTree
a = sys.argv[sys.argv.index("--") + 1:]
BLEND, CORPO, IDS = a[0], a[1], a[2].split(",")
bpy.ops.wm.open_mainfile(filepath=BLEND)
scn = bpy.context.scene; arm = bpy.data.objects[CORPO]; corpo = bpy.data.objects[CORPO + "_corpo"]
def peso(nomes):
    idx = {corpo.vertex_groups[n].index for n in nomes if n in corpo.vertex_groups}
    return np.array([sum(g.weight for g in v.groups if g.group in idx) for v in corpo.data.vertices])
tris = []
for p in corpo.data.polygons:
    v = p.vertices
    for i in range(1, len(v) - 1): tris.append((v[0], v[i], v[i + 1]))
tris = np.array(tris)
masc = {}
for lado in ("Left", "Right"):
    w = peso([b.name for b in arm.data.bones if b.name.startswith(lado) and any(t in b.name for t in ("Shoulder", "Arm", "Hand"))])
    masc[lado] = [tuple(t) for t in tris[(w[tris] < 0.3).all(1)]]
for i in IDS:
    act = bpy.data.actions[i]; arm.animation_data.action = act
    if act.slots: arm.animation_data.action_slot = act.slots[0]
    f0, f1 = (int(x) for x in act.frame_range); pior = 0.0; ruins = 0
    for f in range(f0, f1 + 1, 2):
        scn.frame_set(f)
        ev = corpo.evaluated_get(bpy.context.evaluated_depsgraph_get()); me = ev.to_mesh()
        P = [ev.matrix_world @ v.co for v in me.vertices]; ev.to_mesh_clear()
        mw = arm.matrix_world; q_pior = 0
        for lado in ("Left", "Right"):
            bvh = BVHTree.FromPolygons([tuple(p) for p in P], masc[lado])
            ph = arm.pose.bones[lado + "Hand"]
            for q in (mw @ ph.head, (mw @ ph.head + mw @ ph.tail) / 2, mw @ ph.tail, mw @ arm.pose.bones[lado + "HandMiddle2"].tail):
                loc, nrm, _, d = bvh.find_nearest(q)
                if loc is not None and (q - loc).dot(nrm) < 0: q_pior = max(q_pior, d)
        pior = max(pior, q_pior); ruins += q_pior > 0.01
    print(f"{i}: penetração máx {pior*100:.1f} cm, quadros >1 cm: {ruins}")
