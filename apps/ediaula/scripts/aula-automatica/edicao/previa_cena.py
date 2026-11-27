"""A prévia de uma cena .edisvg do edisvg_cena, para conferir o layout antes de vincular na aula (REGRAS.md, seções 9
e 10).

Uso: python -X utf8 previa_cena.py <cena.edisvg> <folha.jpg> [quadros, padrão 8] [--grande]

Calcula os nós em alguns instantes da animação (cena_layout.py: as trilhas como retas, o cubic-bezier sai linear) e
desenha cada quadro no Chrome local, com as fontes da cena (espera as fontes carregarem: antes, o título saía com
letra serifada na prévia, só porque a fonte ainda não tinha chegado). Junta os quadros numa folha com o segundo de
cada um; --grande põe dois quadros por linha, em 960 x 540, para ler os textos. Não precisa do EdiSVG; o render de
verdade continua sendo o dele. Não rode durante uma gravação: o Chrome disputa a máquina com o jogo do palco.
"""
import json
import os
import sys
import tempfile

from playwright.sync_api import sync_playwright

from cena_layout import FPS, Layout

args = [a for a in sys.argv[1:] if not a.startswith("--")]
grande = "--grande" in sys.argv
arq, saida = args[0], args[1]
n = int(args[2]) if len(args) > 2 else 8
lay = Layout(json.load(open(arq, encoding="utf8")))
total = lay.total

quadros = [round(total * k / (n - 1)) for k in range(n)]
quadros[-1] = max(0, total - 8)
with sync_playwright() as pw:
    nav = pw.chromium.launch(executable_path="C:/Program Files/Google/Chrome/Application/chrome.exe", headless=True)
    pag = nav.new_page(viewport={"width": 1920, "height": 1080})
    pag.set_content(f'<html><head><style>{lay.css_fontes()}</style></head><body style="margin:0"><div id="q"></div>'
                    "</body></html>")
    imgs = []
    for f in quadros:
        pag.evaluate("(s) => { document.getElementById('q').innerHTML = s }",
                     f'<svg width="1920" height="1080" viewBox="0 0 1920 1080">{lay.svg(f)}</svg>')
        pag.evaluate("async () => { await document.fonts.ready }")
        pag.wait_for_timeout(60)
        p = os.path.join(tempfile.gettempdir(), f"previa-cena-{os.getpid()}-{f}.png")
        pag.screenshot(path=p)
        imgs.append((f, p))
    nav.close()

from PIL import Image, ImageDraw  # noqa: E402

W, H = (960, 540) if grande else (640, 360)
cols = 2 if grande else 4
rows = (len(imgs) + cols - 1) // cols
folha = Image.new("RGB", (cols * W, rows * (H + 30)), "white")
for k, (f, p) in enumerate(imgs):
    im = Image.open(p).convert("RGB").resize((W, H), Image.LANCZOS)
    x, y = (k % cols) * W, (k // cols) * (H + 30)
    folha.paste(im, (x, y))
    ImageDraw.Draw(folha).text((x + 8, y + H + 6), f"quadro {f} ({total} no total) = {f / FPS:.1f} s", fill="black")
folha.save(saida, quality=88)
for _, p in imgs:
    os.remove(p)
print("ok", saida)
