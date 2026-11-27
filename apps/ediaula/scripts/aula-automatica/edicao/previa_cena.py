"""A prévia de uma cena .edisvg do edisvg_cena, para conferir o layout antes de vincular na aula (REGRAS.md, seção 9).

Uso: python -X utf8 previa_cena.py <cena.edisvg> <folha.jpg> [quadros, padrão 8]

Calcula os nós em alguns instantes da animação (as trilhas como retas: o cubic-bezier sai linear) e desenha cada
quadro no Chrome local, com as fontes da cena. Junta os quadros numa folha com o segundo de cada um. Não precisa do
EdiSVG; o render de verdade continua sendo o dele. Não rode durante uma gravação: o Chrome disputa a máquina com o
jogo do palco.
"""
import json
import os
import sys
import tempfile

from playwright.sync_api import sync_playwright

arq, saida = sys.argv[1], sys.argv[2]
n = int(sys.argv[3]) if len(sys.argv) > 3 else 8
d = json.load(open(arq, encoding="utf8"))
assets = {a["id"]: a for a in d["assets"]}
art = next(a for a in d["artboards"] if a["id"] == d["defaultArtboardId"])
anim = d["motion"]["animations"][0]
total = anim["frames"]
trilhas = {}
for t in anim["tracks"]:
    trilhas.setdefault(t["targetId"], {})[t["property"]] = t["keys"]


def valor(keys, f, base):
    if not keys:
        return base
    if f <= keys[0]["frame"]:
        return keys[0]["value"]
    for a, b in zip(keys, keys[1:]):
        if a["frame"] <= f <= b["frame"]:
            u = (f - a["frame"]) / max(1, b["frame"] - a["frame"])
            return a["value"] + (b["value"] - a["value"]) * u
    return keys[-1]["value"]


def fontes():
    css = []
    for a in d["assets"]:
        if a["kind"] == "font":
            fam, _, peso = a["name"].rpartition(" ")
            css.append(f"@font-face{{font-family:'{fam}';font-weight:{peso};src:url(data:{a.get('mime','font/ttf')};base64,{a['data']});}}")
    return "".join(css)


def no_svg(no, f):
    tr = no["transform"]
    tk = trilhas.get(no["id"], {})
    x = valor(tk.get("x"), f, tr["x"]); y = valor(tk.get("y"), f, tr["y"])
    sx = valor(tk.get("sx"), f, tr["sx"]); sy = valor(tk.get("sy"), f, tr["sy"])
    op = valor(tk.get("opacity"), f, tr["opacity"]) / 100
    if op <= 0.001:
        return ""
    attrs = dict(no.get("attrs", {}))
    tag = no["tag"]
    g = f'<g transform="translate({x},{y}) scale({sx},{sy})" opacity="{op:.3f}">'
    if tag == "g":
        inner = "".join(no_svg(c, f) for c in no.get("children", []))
    elif tag == "image":
        a = assets[no["assetId"]]
        inner = f'<image x="{attrs["x"]}" y="{attrs["y"]}" width="{attrs["width"]}" height="{attrs["height"]}" href="data:{a["mime"]};base64,{a["data"]}"/>'
    elif tag == "text":
        at = " ".join(f'{k}="{v}"' for k, v in attrs.items())
        inner = f'<text {at}>{no["text"].replace("&","&amp;").replace("<","&lt;")}</text>'
    elif tag == "use" or "instance" in no:
        inner = ""
    else:
        at = " ".join(f'{k}="{v}"' for k, v in attrs.items())
        inner = f"<{tag} {at}/>"
    return g + inner + "</g>"


quadros = [round(total * k / (n - 1)) for k in range(n)]
quadros[-1] = max(0, total - 8)
with sync_playwright() as pw:
    nav = pw.chromium.launch(executable_path="C:/Program Files/Google/Chrome/Application/chrome.exe", headless=True)
    pag = nav.new_page(viewport={"width": 1920, "height": 1080})
    imgs = []
    for f in quadros:
        svg = "".join(no_svg(no, f) for no in art["scene"]["nodes"])
        html = f'<html><head><style>{fontes()}</style></head><body style="margin:0"><svg width="1920" height="1080" viewBox="0 0 1920 1080">{svg}</svg></body></html>'
        pag.set_content(html)
        pag.wait_for_timeout(250)
        p = os.path.join(tempfile.gettempdir(), f"previa-cena-{os.getpid()}-{f}.png")
        pag.screenshot(path=p)
        imgs.append((f, p))
    nav.close()

from PIL import Image, ImageDraw  # noqa: E402

W, H = 640, 360
cols = 4
rows = (len(imgs) + cols - 1) // cols
folha = Image.new("RGB", (cols * W, rows * (H + 30)), "white")
for k, (f, p) in enumerate(imgs):
    im = Image.open(p).convert("RGB").resize((W, H))
    x, y = (k % cols) * W, (k // cols) * (H + 30)
    folha.paste(im, (x, y))
    ImageDraw.Draw(folha).text((x + 8, y + H + 6), f"quadro {f} ({anim['frames']} no total) = {f / 30:.1f} s", fill="black")
folha.save(saida, quality=85)
for _, p in imgs:
    os.remove(p)
print("ok", saida)
