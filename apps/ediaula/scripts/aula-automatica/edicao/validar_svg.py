"""Confere as chaves das animações: uma trilha por propriedade, quadros em ordem, únicos e dentro da duração.

Uso: validar_svg.py <peça.edisvg ou pasta das peças> [...]. Sem nenhuma peça para conferir, sai com erro: antes,
um arquivo passado no lugar da pasta não era conferido e a resposta era "ok" mesmo assim (Ilha A2P4, 22/11/2026,
uma tecla com pop e aperta ao mesmo tempo, duas trilhas de escala, que o EdiSVG recusa ao abrir).
"""
import glob
import json
import os
import sys

arquivos = []
for alvo in sys.argv[1:]:
    arquivos += sorted(glob.glob(os.path.join(alvo, "*.edisvg"))) if os.path.isdir(alvo) else [alvo]
if not arquivos:
    sys.exit(f"nenhuma peça .edisvg em {sys.argv[1:]}")
for f in arquivos:
    d = json.load(open(f, encoding="utf8"))
    a = d["motion"]["animations"][0]
    vistos = set()
    for t in a["tracks"]:
        k = (t["targetId"], t["property"])
        assert k not in vistos, f"{os.path.basename(f)}: duas trilhas de {k[1]} no mesmo nó ({k[0]})"
        vistos.add(k)
        fr = [x["frame"] for x in t["keys"]]
        assert fr == sorted(set(fr)) and max(fr) <= a["frames"], (f, fr)
    # Os limites do EdiSVG (packages/edi-motion/src/assets/limits.ts): acima deles a peça não abre e o render
    # nunca chega (Ilha A3P8, 23/11/2026).
    recursos = d.get("assets", [])
    total = sum(r["byteLength"] for r in recursos)
    px = sum(r["width"] * r["height"] for r in recursos if r["kind"] == "image")
    assert total <= 4_000_000, f"{os.path.basename(f)}: recursos de {total / 1e6:.2f} MB; o EdiSVG abre até 4 MB"
    assert px <= 16_000_000, f"{os.path.basename(f)}: {px / 1e6:.1f} milhões de pixels; o EdiSVG abre até 16"
print(f"ok ({len(arquivos)} peças)")
