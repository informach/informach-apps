"""Confere os GLB do grupo urbano: animações (nome, duração), juntas, triângulos, cor por vértice."""
import json, struct, sys, os, glob
pasta = sys.argv[1]
cat = {b["id"]: b for b in json.load(open(os.path.join(pasta, "urbano.json")))["bichos"]}
for f in sorted(glob.glob(os.path.join(pasta, "glb", "*.glb"))):
    d = open(f, "rb").read()
    n = struct.unpack("<I", d[12:16])[0]
    g = json.loads(d[20:20 + n])
    sk = g["skins"][0]
    nj = len(sk["joints"])
    anims = []
    for a in g["animations"]:
        tmax = max(g["accessors"][s["input"]]["max"][0] for s in a["samplers"])
        alvos = {c["target"]["node"] for c in a["channels"]}
        anims.append((a["name"], round(tmax, 2), len(alvos)))
    prim = g["meshes"][0]["primitives"][0]
    tri = g["accessors"][prim["indices"]]["count"] // 3
    id_ = os.path.basename(f)[:-4]
    nomes_cat = [x["id"] for x in cat[id_]["animacoes"]]
    falta = set(nomes_cat) ^ {a[0] for a in anims}
    print(f"{id_:12} juntas={nj} tri={tri} cor={'COLOR_0' in prim['attributes']} anims={len(anims)} "
          f"{'OK' if not falta else 'DIFERENÇA ' + str(falta)} "
          + " ".join(f"{a}:{t}s/{k}" for a, t, k in anims))
