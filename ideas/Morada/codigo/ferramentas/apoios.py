"""Recalcula as medidas de cadeira e cama (apoios.json) a partir do corpos.blend já gerado."""
import bpy, json, os, sys
import numpy as np
bpy.ops.wm.open_mainfile(filepath=os.path.abspath(sys.argv[1]))
sys.argv = [sys.argv[0], "/dev/null"]
scn = bpy.context.scene
APOIOS = {"sentando": ("cadeira", "fim"), "sentado": ("cadeira", "meio"),
          "deitando": ("cama", "fim"), "dormindo_cama": ("cama", "meio")}
def peso(o, nomes):
    idx = {o.vertex_groups[n].index for n in nomes if n in o.vertex_groups}
    return np.array([sum(g.weight for g in v.groups if g.group in idx) for v in o.data.vertices])
def malha(o):
    dg = bpy.context.evaluated_depsgraph_get(); ev = o.evaluated_get(dg); me = ev.to_mesh()
    P = np.array([ev.matrix_world @ v.co for v in me.vertices]); ev.to_mesh_clear(); return P
out = {}
arms = [o for o in bpy.data.objects if o.type == "ARMATURE"]
for arm in arms:
    nome = arm.name; corpo = bpy.data.objects[nome + "_corpo"]; lugar = arm.parent
    for o in arms: o.animation_data.action = None
    res = {}
    for k, (tipo, quando) in APOIOS.items():
        a = bpy.data.actions.get(f"{nome}_{k}")
        if not a: continue
        arm.animation_data.action = a
        if a.slots: arm.animation_data.action_slot = a.slots[0]
        f0, f1 = (int(x) for x in a.frame_range); scn.frame_set(f1 if quando == "fim" else (f0 + f1) // 2)
        P = malha(corpo); hq = arm.matrix_world @ arm.pose.bones["Hips"].head; cab = arm.matrix_world @ arm.pose.bones["Head"].head
        sel = peso(corpo, ["Hips"] if tipo == "cadeira" else ["Hips", "Spine", "Spine1"]) > 0.45
        h = float(P[sel, 2].min()); o = lugar.location
        res[k] = {"tipo": tipo, "h": round(h, 3), "quadril": [round(hq.x - o.x, 3), round(hq.y - o.y, 3)], "cabeca": [round(cab.x - o.x, 3), round(cab.y - o.y, 3)]}
    # auxiliares das animações que precisam de alguma coisa na cena (só na cena de teste)
    o = lugar.location
    rosto = bpy.data.objects[nome + "_rosto_neutro"]
    arm.animation_data.action = None
    for pb in arm.pose.bones: pb.matrix_basis.identity()
    scn.frame_set(1); P0 = malha(corpo); k = float(np.ptp(P0[:, 2])) / 1.75
    W = lambda n, cauda=False: arm.matrix_world @ (arm.pose.bones[n].tail if cauda else arm.pose.bones[n].head)
    def quadros(a, n=24):
        arm.animation_data.action = a
        if a.slots: arm.animation_data.action_slot = a.slots[0]
        f0, f1 = (int(x) for x in a.frame_range)
        for f in np.linspace(f0, f1, n).astype(int):
            scn.frame_set(int(f)); yield f
    a = bpy.data.actions.get(f"{nome}_chute")
    if a:
        melhor = None
        for _ in quadros(a, 49):
            for lado in ("Left", "Right"):
                p = W(lado + "ToeBase", True); fr = -(p.y - o.y)
                if melhor is None or fr > melhor[0]: melhor = (fr, p.x - o.x, p.z - o.z)
        res["chute"] = {"tipo": "saco", "frente": round(melhor[0], 3), "x": round(melhor[1], 3), "z": round(max(melhor[2], 0.1 * k), 3), "k": round(k, 3)}
    a = bpy.data.actions.get(f"{nome}_escada")
    if a:
        fr, topo, xs = [], 0, []
        for _ in quadros(a, 12):
            for lado in ("Left", "Right"):
                for b in (lado + "Hand", lado + "ToeBase"):
                    fr.append(-(W(b).y - o.y))
                topo = max(topo, W(lado + "HandMiddle2", True).z - o.z); xs.append(W(lado + "Hand").x - o.x)
        xc = float(np.mean(xs)); larg = float(np.max(np.abs(np.array(xs) - xc)))
        res["escada"] = {"tipo": "escada", "frente": round(float(np.percentile(fr, 85)) + 0.03 * k, 3), "topo": round(topo + 0.4 * k, 3),
                         "x": round(xc, 3), "meia_largura": round(max(larg, 0.15 * k) + 0.06 * k, 3), "k": round(k, 3)}
    a = bpy.data.actions.get(f"{nome}_pendurado")
    if a:
        hs, fr, larg = [], [], 0
        for _ in quadros(a, 12):
            for lado in ("Left", "Right"):
                p = W(lado + "Hand", True); hs.append(p.z - o.z); fr.append(-(p.y - o.y)); larg = max(larg, abs(p.x - o.x))
        res["pendurado"] = {"tipo": "barra", "h": round(float(np.mean(hs)), 3), "frente": round(float(np.mean(fr)), 3),
                            "meia_largura": round(larg + 0.35 * k, 3), "k": round(k, 3)}
    a = bpy.data.actions.get(f"{nome}_beijo_par")
    if a:
        frente = max(-(float(malha(rosto)[:, 1].min()) - o.y) for _ in quadros(a, 40))
        res["beijo_par"] = {"tipo": "par", "dist": round(2 * frente + 0.004, 3), "anim": "beijo_par", "k": round(k, 3)}
    if bpy.data.actions.get(f"{nome}_insulto"):
        res["insulto"] = {"tipo": "par", "dist": round(max(0.8, 1.25 * k), 3), "anim": "parado", "k": round(k, 3)}
    out[nome] = res
    print(nome, {k_: v for k_, v in res.items() if k_ in ("chute", "escada", "pendurado", "beijo_par")})
json.dump(out, open("corpos_viewer/corpos/apoios.json", "w"), ensure_ascii=False)
