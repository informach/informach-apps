"""Liga cada corpo exportado (GLB) às peças: a ordem dos vértices do Blender (a das malhas-base) para os vértices do
GLB, a família da malha, a caixa da cabeça e a transformação do mundo do Blender para o espaço da malha no GLB.

Uso: python peles.py -- <corpos.blend> <pasta dos GLB> <saida peles.txt>
"""
import base64, gzip, json, os, struct, sys
import bpy
import numpy as np
from mathutils.kdtree import KDTree

AQUI = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(AQUI, "morada-art"))
import roupas as R  # noqa: E402
import cabelos as CAB  # noqa: E402

a = sys.argv[sys.argv.index("--") + 1:]
BLEND, PASTA, SAIDA = a[:3]


def glb_posicoes(caminho, no):
    d = open(caminho, "rb").read()
    jl = struct.unpack("<I", d[12:16])[0]
    j = json.loads(d[20:20 + jl])
    bin_ = d[20 + jl + 8:]
    n = next(x for x in j["nodes"] if x.get("name") == no)
    prim = j["meshes"][n["mesh"]]["primitives"][0]
    acc = j["accessors"][prim["attributes"]["POSITION"]]
    bv = j["bufferViews"][acc["bufferView"]]
    ini = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
    passo = bv.get("byteStride", 12)
    raw = np.frombuffer(bin_, np.uint8, count=passo * acc["count"], offset=ini).reshape(acc["count"], passo)
    return raw[:, :12].copy().view(np.float32).reshape(-1, 3)


bpy.ops.wm.open_mainfile(filepath=BLEND)
res = {}
for arq in sorted(os.listdir(PASTA)):
    if not arq.endswith(".glb"):
        continue
    c = arq[:-4]
    arm = bpy.data.objects.get(c)
    corpo = bpy.data.objects.get(c + "_corpo")
    if arm is None or corpo is None:
        continue
    lugar = arm.parent
    loc = lugar.location.copy()
    lugar.location = (0, 0, lugar.location.z)
    if arm.animation_data:
        arm.animation_data.action = None
    for pb in arm.pose.bones:
        pb.matrix_basis.identity()
    bpy.context.view_layer.update()
    G = glb_posicoes(os.path.join(PASTA, arq), c + "_corpo")
    Pw = R.pos_mundo(corpo)
    Pl = np.array([v.co[:] for v in corpo.data.vertices])
    kd = KDTree(len(G))
    for i, g in enumerate(G):
        kd.insert(g, i)
    kd.balance()
    melhor = None
    for nome, Q in (("local_yup", np.c_[Pl[:, 0], Pl[:, 2], -Pl[:, 1]]), ("local", Pl),
                    ("mundo_yup", np.c_[Pw[:, 0], Pw[:, 2], -Pw[:, 1]]), ("mundo", Pw)):
        idx, dist = zip(*[(kd.find(q)[1], kd.find(q)[2]) for q in Q])
        err = float(np.median(dist))
        if melhor is None or err < melhor[0]:
            melhor = (err, nome, np.array(idx))
    err, nome, b2g = melhor
    # mundo do Blender → espaço da malha no GLB (mínimos quadrados, afim)
    A = np.c_[Pw, np.ones(len(Pw))]
    M, *_ = np.linalg.lstsq(A, G[b2g], rcond=None)
    fam = R.familia(corpo, os.path.join(AQUI, "ideias"))
    hmin, hmax = CAB.caixa_cabeca(corpo)
    res[c] = {"familia": fam, "b2g": b2g.tolist(), "afim": M.T.round(7).tolist(),
              "cabeca": [hmin.round(5).tolist(), hmax.round(5).tolist()]}
    print("pele", c, fam, nome, f"erro {err:.2e}", "resíduo", float(np.abs(A @ M - G[b2g]).max()), flush=True)
    lugar.location = loc
R.limpa_fontes()
open(SAIDA, "w").write(base64.b64encode(gzip.compress(json.dumps(res).encode(), 9)).decode())
print("fim", len(res))
