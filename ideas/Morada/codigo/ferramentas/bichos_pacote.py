"""Empacota os bichos dos três grupos para a página: bichos/<id>.txt (GLB → gzip → base64), bichos.json e miniaturas.json.

  python3 -I tools/bichos_pacote.py <SP>
"""
import base64, gzip, json, os, sys
SP = sys.argv[1]
P = os.path.join(SP, "pets"); V = os.path.join(SP, "pets_viewer", "bichos")
os.makedirs(V, exist_ok=True)
GRUPOS = [("estimacao", "Estimação"), ("zoologico", "Zoológico"), ("urbano", "Fauna urbana")]
info, minis, tam = {}, {}, 0
for g, _ in GRUPOS:
    d = json.load(open(os.path.join(P, g, g + ".json")))
    for b in d["bichos"]:
        i = b["id"]
        glb = open(os.path.join(P, g, "glb", i + ".glb"), "rb").read()
        txt = base64.b64encode(gzip.compress(glb, 9)).decode()
        open(os.path.join(V, i + ".txt"), "w").write(txt); tam += len(txt)
        minis[i] = base64.b64encode(open(os.path.join(P, g, i + ".webp"), "rb").read()).decode()
        info[i] = {"nome": b["nome"], "especie": b.get("especie", ""), "grupo": g, "escala": b.get("escala", 1.0),
                   "base": b.get("base", ""), "pacote": bool(b.get("pacote")),
                   "animacoes": [{"id": a["id"], "rotulo": a["rotulo"]} for a in b["animacoes"]]}
validos = set(info)
for f in os.listdir(V):  # bichos que não existem mais
    if f.endswith(".txt") and f[:-4] not in validos:
        os.remove(os.path.join(V, f))
json.dump(info, open(os.path.join(V, "bichos.json"), "w"), ensure_ascii=False, indent=1)
json.dump(minis, open(os.path.join(V, "miniaturas.json"), "w"))
json.dump([{"id": g, "rotulo": r, "bichos": [i for i in info if info[i]["grupo"] == g]} for g, r in GRUPOS],
          open(os.path.join(V, "grupos.json"), "w"), ensure_ascii=False, indent=1)
n_anim = len({(info[i]["especie"], a["id"]) for i in info for a in info[i]["animacoes"]})
print(f"ok {len(info)} bichos, {sum(len(v['animacoes']) for v in info.values())} animações no total, "
      f"{len({a['id'] for v in info.values() for a in v['animacoes']})} tipos, {tam / 1e6:.1f} MB")
