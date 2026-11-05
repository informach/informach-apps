"""Mede, nas animações do P2, onde fica o que a cena precisa: escada, corda, parapeito, banco do carro, banco do piano.

Uso: python mede_apoios_p2.py -- <corrigido_todos/corpo.blend> <corpo>
Atualiza <corrigido_todos/corpo.json> (campo "apoios"). Coordenadas do Blender: x, y (frente = -y), z para cima.
"""
import bpy, json, sys
import numpy as np

a = sys.argv[sys.argv.index("--") + 1:]
BLEND, CORPO = a[:2]
bpy.ops.wm.open_mainfile(filepath=BLEND)
scn = bpy.context.scene
arm = bpy.data.objects[CORPO]
corpo = bpy.data.objects[CORPO + "_corpo"]
for o in bpy.data.objects:
    if o.type == "MESH" and o.parent is arm and o is not corpo:
        for m in o.modifiers:
            m.show_viewport = False
mw = arm.matrix_world
J = BLEND[:-6] + ".json"
dados = json.load(open(J))
apoios = dados["apoios"]


def usar(act):
    arm.animation_data.action = act
    if act.slots:
        arm.animation_data.action_slot = act.slots[0]
    return [int(x) for x in act.frame_range]


def maos(f):
    """Ponto de pegada de cada mão (base do dedo médio) no quadro f."""
    scn.frame_set(f)
    return np.array([list(mw @ arm.pose.bones[l + "Hand"].tail) for l in ("Left", "Right")])


def pes(f):
    scn.frame_set(f)
    return np.array([list(mw @ arm.pose.bones[l + "Foot"].head) for l in ("Left", "Right")])


idx_q = {corpo.vertex_groups[n].index for n in ["Hips"] if n in corpo.vertex_groups}
quadril = np.array([sum(g.weight for g in v.groups if g.group in idx_q) for v in corpo.data.vertices]) > 0.45


def assento(f):
    scn.frame_set(f)
    ev = corpo.evaluated_get(bpy.context.evaluated_depsgraph_get())
    me = ev.to_mesh()
    P = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get("co", P)
    ev.to_mesh_clear()
    M = np.array(corpo.matrix_world)
    P = P.reshape(-1, 3) @ M[:3, :3].T + M[:3, 3]
    Q = P[quadril]
    return {"tipo": "assento", "altura": round(float(Q[:, 2].min()), 3),
            "x": round(float(Q[:, 0].mean()), 3), "y": round(float(Q[:, 1].mean()), 3)}


r = lambda v: round(float(v), 3)  # noqa: E731
altura = dados["altura"]
for act in bpy.data.actions:
    n = act.name
    if not n.startswith("resident."):
        continue
    base = n[:-3] if n.endswith(".rm") else n
    if base not in ("resident.climb.ladder", "resident.climb.rope", "resident.climb.top", "resident.hang.enter",
                    "resident.car.drive", "resident.car.enter", "resident.car.exit", "resident.music.piano",
                    "resident.play.videogame"):
        continue
    f0, f1 = usar(act)
    H = np.stack([maos(f) for f in range(f0, f1 + 1)])  # quadros × 2 × 3
    if base == "resident.climb.ladder":
        # as mãos pegam os degraus: a escada fica no plano mais à frente que as mãos alcançam
        apoios[n] = {"tipo": "escada", "frente": r(-np.median(H[:, :, 1]) + 0.02), "x": r(H[:, :, 0].mean()),
                     "meia_largura": r(max(0.18, np.abs(H[:, 0, 0] - H[:, 1, 0]).mean() / 2 + 0.03)),
                     "topo": r(H[:, :, 2].max() + 0.35 * altura)}
    elif base == "resident.climb.rope":
        apoios[n] = {"tipo": "corda", "frente": r(-np.median(H[:, :, 1])), "x": r(H[:, :, 0].mean()),
                     "topo": r(H[:, :, 2].max() + 0.6 * altura)}
    elif base in ("resident.climb.top", "resident.hang.enter"):
        # pendurado na borda: no climb.top é o começo; no hang.enter é o fim
        f = 0 if base == "resident.climb.top" else -1
        topo = H[f, :, 2].mean() - 0.02
        if base == "resident.climb.top":
            p = pes(f1)  # no fim ele está em pé em cima do parapeito
            if abs(p[:, 2].min() - topo) < 0.25 * altura:
                topo = (topo + p[:, 2].min()) / 2
        apoios[n] = {"tipo": "parapeito", "frente": r(-H[f, :, 1].mean() - 0.03), "x": r(H[f, :, 0].mean()),
                     "topo": r(topo)}
    elif base == "resident.music.piano":
        m = assento((f0 + f1) // 2)
        m["teclado"] = {"z": r(np.median(H[:, :, 2]) - 0.03), "y": r(np.median(H[:, :, 1]))}
        apoios[n] = m
    elif base == "resident.play.videogame":
        m = assento((f0 + f1) // 2)
        scn.frame_set((f0 + f1) // 2)
        if m["altura"] < 0.4 * altura:  # só se for sentado
            apoios[n] = m
    else:  # carro: banco no meio do drive, no fim do enter, no começo do exit
        f = {"resident.car.drive": (f0 + f1) // 2, "resident.car.enter": f1, "resident.car.exit": f0}[base]
        m = assento(f)
        m["carro"] = True
        apoios[n] = m
    print(CORPO, n, apoios.get(n))
json.dump(dados, open(J, "w"), ensure_ascii=False, indent=1)
print("fim", CORPO)
