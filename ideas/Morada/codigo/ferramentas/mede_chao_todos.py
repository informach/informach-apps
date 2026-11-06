"""Para cada ação: menor altura do corpo e qual osso domina o vértice mais baixo (frame a frame, passo 3)."""
import bpy, sys, json, numpy as np
a = sys.argv[sys.argv.index("--") + 1:]
bpy.ops.wm.open_mainfile(filepath=a[0]); CORPO = a[1]
scn = bpy.context.scene; arm = bpy.data.objects[CORPO]; corpo = bpy.data.objects[CORPO + "_corpo"]
for o in bpy.data.objects:
    if o.type == "MESH" and o.parent is arm and o is not corpo:
        for m in o.modifiers: m.show_viewport = False
nomes = {g.index: g.name for g in corpo.vertex_groups}
dom = [nomes.get(max(v.groups, key=lambda g: g.weight).group, "?") if v.groups else "?" for v in corpo.data.vertices]
res = {}
for act in sorted(bpy.data.actions, key=lambda x: x.name):
    if not act.name.startswith("resident."): continue
    arm.animation_data.action = act
    if act.slots: arm.animation_data.action_slot = act.slots[0]
    f0, f1 = [int(x) for x in act.frame_range]; best = (9, None, None, 0)
    zs = []
    for f in range(f0, f1 + 1, 3):
        scn.frame_set(f); ev = corpo.evaluated_get(bpy.context.evaluated_depsgraph_get()); me = ev.to_mesh()
        P = np.empty(len(me.vertices) * 3); me.vertices.foreach_get("co", P); ev.to_mesh_clear()
        M = np.array(corpo.matrix_world); z = (P.reshape(-1, 3) @ M[:3, :3].T + M[:3, 3])[:, 2]
        i = int(z.argmin()); zs.append(z[i])
        if z[i] < best[0]: best = (float(z[i]), dom[i], f, 0)
    res[act.name] = {"min": round(best[0], 3), "osso": best[1], "quadro": best[2], "frac_abaixo": round(float(np.mean(np.array(zs) < -0.02)), 2)}
json.dump(res, open(a[2], "w"), indent=0)
ruins = {k: v for k, v in res.items() if v["min"] < -0.025}
print(CORPO, len(res), "abaixo de -2,5 cm:", len(ruins))
for k, v in sorted(ruins.items(), key=lambda x: x[1]["min"]): print(" ", k, v)
