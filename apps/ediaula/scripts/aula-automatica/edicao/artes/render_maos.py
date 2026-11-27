"""Renderiza as mãos do toque (emojis do Noto Color Emoji, licença OFL) em PNG transparente, na pasta atual.
Depois recorte rente (PIL getbbox) e confira a ponta do dedo em MAOS, no edisvg_cena.py.
Uso (dentro de edicao/artes): python render_maos.py"""
import sys
from playwright.sync_api import sync_playwright
glifos = {"mao-cima": "\U0001F446", "mao-indicador": "\u261D\uFE0F", "mao-esquerda": "\U0001F448", "mao-direita": "\U0001F449", "mao-baixo": "\U0001F447"}
html = """<html><head><link rel=stylesheet href="https://fonts.googleapis.com/css2?family=Noto+Color+Emoji&display=block">
<style>body{margin:0;background:transparent} span{font-family:'Noto Color Emoji';font-size:440px;line-height:1;display:inline-block;padding:20px}</style></head>
<body>%s</body></html>""" % "".join(f'<span id="{k}">{v}</span>' for k, v in glifos.items())
with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path="C:/Program Files/Google/Chrome/Application/chrome.exe", headless=True)
    p = b.new_page(viewport={"width": 2600, "height": 600})
    p.set_content(html); p.wait_for_timeout(3000)
    print(p.evaluate("document.fonts.check(\"40px 'Noto Color Emoji'\")"))
    for k in glifos:
        p.locator(f"#{k}").screenshot(path=f"{k}.png", omit_background=True)
    b.close()
