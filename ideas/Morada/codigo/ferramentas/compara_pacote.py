import bpy, os, sys
import numpy as np
bpy.ops.wm.open_mainfile(filepath=os.path.abspath(sys.argv[sys.argv.index("--") + 1]))
PAC = {"parado": "Idle", "olhando": "Idle_LookAround", "andando": "Adult_Walk", "correndo": "Adult_Run", "comemorando": "Adult_Happy",
       "triste": "Adult_Sad", "aplaudindo": "Adult_Clap", "conversando": "Adult_TalkGestureActive", "telefone": "Adult_IdleTalkPhone",
       "carregando": "Adult_WalkCarryItem"}
base = {}
for a in bpy.data.actions:
    n = a.name.split("|")[-1]
    if a.name == "Idle_base": base["Idle"] = a
    elif "|" in a.name and n in PAC.values() and (a.get("_fbx") == ("apoc" if n in ("Adult_IdleTalkPhone", "Adult_WalkCarryItem") else "m")) and n not in base: base[n] = a
def curvas(a):
    out = {}
    for lay in a.layers:
        for st in lay.strips:
            for cb in st.channelbags:
                for fc in cb.fcurves:
                    out[(fc.data_path, fc.array_index)] = np.array([k.co[:] for k in fc.keyframe_points])
    return out
for corpo in sys.argv[sys.argv.index("--") + 2:]:
    linha = []
    for k, n in PAC.items():
        a = bpy.data.actions.get(f"{corpo}_{k}"); b = base.get(n)
        if not a or not b: linha.append(f"{k}:?"); continue
        ca, cb_ = curvas(a), curvas(b); dif = 0.0
        for key, v in cb_.items():
            if key not in ca or len(ca[key]) != len(v): dif = 99; break
            d = np.abs(ca[key] - v); 
            if key[0].endswith("location"): d = d[:, 0]  # o quadril é escalado de propósito: compara só os quadros
            dif = max(dif, float(d.max()))
        linha.append(f"{k}:{'igual' if dif < 1e-5 else ('MUDOU' if dif < 99 else 'MUDOU(chaves)')}")
    print(corpo, " ".join(linha))
