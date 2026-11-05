"""Tira imagens/texturas de um GLB (a paleta é carregada uma vez só na página). Uso: glb_sem_textura.py <in> <out>"""
import json, struct, sys
b = open(sys.argv[1], "rb").read()
assert b[:4] == b"glTF"
L = struct.unpack_from("<I", b, 12)[0]
js = json.loads(b[20:20 + L])
off = 20 + L
blen = struct.unpack_from("<I", b, off)[0]
binc = b[off + 8: off + 8 + blen]
morto = {im["bufferView"] for im in js.get("images", []) if "bufferView" in im}
for k in ("images", "textures", "samplers"):
    js.pop(k, None)
for m in js.get("materials", []):
    m.get("pbrMetallicRoughness", {}).pop("baseColorTexture", None)
    for k in ("normalTexture", "emissiveTexture", "occlusionTexture"):
        m.pop(k, None)
novo, mapa, bvs = bytearray(), {}, []
for i, bv in enumerate(js["bufferViews"]):
    if i in morto:
        continue
    while len(novo) % 4:
        novo += b"\0"
    dado = binc[bv.get("byteOffset", 0): bv.get("byteOffset", 0) + bv["byteLength"]]
    bv = dict(bv, byteOffset=len(novo))
    novo += dado
    mapa[i] = len(bvs)
    bvs.append(bv)
js["bufferViews"] = bvs
for a in js.get("accessors", []):
    if "bufferView" in a:
        a["bufferView"] = mapa[a["bufferView"]]
while len(novo) % 4:
    novo += b"\0"
js["buffers"] = [{"byteLength": len(novo)}]
j = json.dumps(js, separators=(",", ":")).encode()
while len(j) % 4:
    j += b" "
out = b"glTF" + struct.pack("<II", 2, 12 + 8 + len(j) + 8 + len(novo)) + struct.pack("<I", len(j)) + b"JSON" + j + struct.pack("<I", len(novo)) + b"BIN\0" + bytes(novo)
open(sys.argv[2], "wb").write(out)
print(sys.argv[2], len(b), "->", len(out))
