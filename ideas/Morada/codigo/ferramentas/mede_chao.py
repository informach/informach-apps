"""Menor altura da cabeça e do corpo inteiro ao longo de cada ação (procura partes abaixo do chão)."""
import bpy, sys, numpy as np
a = sys.argv[sys.argv.index("--") + 1:]
bpy.ops.wm.open_mainfile(filepath=a[0]); CORPO = a[1]; SO = a[2].split(",")
scn = bpy.context.scene; arm = bpy.data.objects[CORPO]; corpo = bpy.data.objects[CORPO + "_corpo"]
for o in bpy.data.objects:
    if o.type == "MESH" and o.parent is arm and o is not corpo:
        for m in o.modifiers: m.show_viewport = False
idx = {corpo.vertex_groups[n].index for n in ("Head", "Neck") if n in corpo.vertex_groups}
cab = np.array([sum(g.weight for g in v.groups if g.group in idx) for v in corpo.data.vertices]) > 0.5
for n in SO:
    act = bpy.data.actions[n]; arm.animation_data.action = act
    if act.slots: arm.animation_data.action_slot = act.slots[0]
    f0, f1 = [int(x) for x in act.frame_range]; zc, zt = [], []
    for f in range(f0, f1 + 1, 2):
        scn.frame_set(f); ev = corpo.evaluated_get(bpy.context.evaluated_depsgraph_get()); me = ev.to_mesh()
        P = np.empty(len(me.vertices) * 3); me.vertices.foreach_get("co", P); ev.to_mesh_clear()
        M = np.array(corpo.matrix_world); P = P.reshape(-1, 3) @ M[:3, :3].T + M[:3, 3]
        zc.append(P[cab, 2].min()); zt.append(P[:, 2].min())
    print(f"{CORPO} {n}: cabeça mín {min(zc)*100:.1f} cm, corpo mín {min(zt)*100:.1f} cm")
