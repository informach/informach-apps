"""As artes do jogo 2D de Moedas no caminho em PNG, para as animações de conceito da Aula 1 (27/11/2026).

    python -X utf8 moedas-artes-2d.py <moedas-2d.szproject.json> <pasta de saída>

As artes estão dentro do projeto do curso, como SVG (dataUrl). Cada uma sai em PNG com fundo transparente, desenhada
no Chrome local: os sprites com 512 px de lado (o primeiro quadro da folha), a praia em 1440 x 1080. São os nomes que
moedas_cena.Painel usa.
"""
import base64
import json
import os
import struct
import sys

from playwright.sync_api import sync_playwright

PROJETO, SAIDA = sys.argv[1], sys.argv[2]
ARTES = ["praia-tropical", "aventureiro", "moeda", "bau-fechado", "bau-aberto", "chave-dourada",
         "farol-listrado-apagado", "farol-listrado-aceso", "veleiro"]
os.makedirs(SAIDA, exist_ok=True)
assets = {a["name"]: a for a in json.load(open(PROJETO, encoding="utf8"))["assets"]}


def png_limpo(caminho):
    """Só os pedaços que o EdiSVG aceita num PNG embutido."""
    aceitos = {b"IHDR", b"PLTE", b"IDAT", b"IEND", b"tRNS", b"sRGB", b"gAMA"}
    dados = open(caminho, "rb").read()
    partes, i = [dados[:8]], 8
    while i < len(dados):
        n, tipo = struct.unpack(">I4s", dados[i:i + 8])
        if tipo in aceitos:
            partes.append(dados[i:i + 12 + n])
        i += 12 + n
    open(caminho, "wb").write(b"".join(partes))


with sync_playwright() as pw:
    nav = pw.chromium.launch(executable_path="C:/Program Files/Google/Chrome/Application/chrome.exe", headless=True)
    for nome in ARTES:
        a = assets[nome]
        svg = base64.b64decode(a["dataUrl"].split(",", 1)[1]).decode("utf8")
        w, h = float(a["width"]), float(a["height"])
        quadro = (a.get("sprite") or {}).get("frameW")
        if quadro:
            k = 512 / quadro
            vw, vh = 512, round((a["sprite"].get("frameH") or quadro) * k)
        else:
            k = 1440 / w
            vw, vh = 1440, round(h * k)
        pag = nav.new_page(viewport={"width": vw, "height": vh})
        # A folha de quadros inteira na escala k; o recorte da tela fica com o primeiro quadro.
        pag.set_content(
            '<html><body style="margin:0;background:transparent">'
            f'<img src="data:image/svg+xml;base64,{base64.b64encode(svg.encode()).decode()}" '
            f'style="display:block;width:auto;height:auto;transform-origin:0 0;transform:scale({k})"></body></html>')
        pag.wait_for_timeout(200)
        destino = os.path.join(SAIDA, f"{nome}.png")
        pag.screenshot(path=destino, omit_background=True, clip={"x": 0, "y": 0, "width": vw, "height": vh})
        png_limpo(destino)
        pag.close()
        print(nome, vw, "x", vh)
    nav.close()
