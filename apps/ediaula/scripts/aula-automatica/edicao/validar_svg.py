"""Confere as chaves das animações: uma trilha por propriedade, quadros em ordem, únicos e dentro da duração."""
import glob
import json
import sys

for f in glob.glob(sys.argv[1] + "/*.edisvg"):
    d = json.load(open(f, encoding="utf8"))
    a = d["motion"]["animations"][0]
    vistos = set()
    for t in a["tracks"]:
        k = (t["targetId"], t["property"])
        assert k not in vistos, (f, k)
        vistos.add(k)
        fr = [x["frame"] for x in t["keys"]]
        assert fr == sorted(set(fr)) and max(fr) <= a["frames"], (f, fr)
print("ok")
