import bpy, os, sys
import numpy as np
sys.path.insert(0, os.path.abspath("morada-art"))
import contato
from mathutils.bvhtree import BVHTree
bpy.ops.wm.open_mainfile(filepath=os.path.abspath(sys.argv[sys.argv.index("--") + 1]))
scn = bpy.context.scene
NOME = sys.argv[sys.argv.index("--") + 2]; ANIMS = [x for x in sys.argv[sys.argv.index("--") + 3:] if not x.startswith("--")]
arm = bpy.data.objects[NOME]; corpo = bpy.data.objects[NOME + "_corpo"]
for o in bpy.data.objects:
    if o.type == "ARMATURE": o.animation_data.action = None
def serie(a):
    arm.animation_data.action = a; arm.animation_data.action_slot = a.slots[0]
    f0, f1 = (int(x) for x in a.frame_range); P = []
    for f in range(f0, f1 + 1):
        scn.frame_set(f); P.append([list(arm.matrix_world @ arm.pose.bones[l + "HandMiddle2"].tail) for l in ("Left", "Right")])
    return np.array(P)
def tremor(P):
    acc = np.linalg.norm(P[2:] - 2 * P[1:-1] + P[:-2], axis=2)  # aceleração por quadro (m/quadro²)
    return round(float(acc.max()) * 1000, 1), round(float(np.percentile(acc, 95)) * 1000, 2)
acts = [bpy.data.actions[f"{NOME}_{a}"] for a in ANIMS]
antes = {a.name: tremor(serie(a)) for a in acts}
if "--sem" not in sys.argv:
    r = contato.corrigir(arm, corpo, acts, 1.0, descanso=("deitando", "dormindo_cama", "dormindo_chao", "sentado", "sentando"),
                         apoio={"deitando": "cama", "dormindo_cama": "cama", "dormindo_chao": "chao", "abdominal": "chao", "rezando": "chao"})
    print("corrigidos", r)
for a in acts: print(a.name, "tremor (máx, p95 em mm/quadro²) antes", antes[a.name], "depois", tremor(serie(a)))
