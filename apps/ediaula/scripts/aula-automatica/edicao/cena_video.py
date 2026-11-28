"""Cena de conceito com um vídeo de verdade (REGRAS.md, seção 10: "Vídeo ilustrando, com as sinalizações por cima").

O EdiSVG não guarda vídeo, então a peça sai como MP4 (`conceito-N-<nome>.mp4` na pasta das peças), montado com o
ffmpeg: o fundo do curso, o vídeo num cartão branco arredondado com degrau, e os títulos do kit (kit_cena.titulo),
cada um entrando na palavra da fala. O fundo, o cartão e os títulos são desenhados como as cenas do EdiSVG
(cena_layout.Layout, no Chrome, com as fontes do kit), então ficam iguais às outras peças. O vídeo entra sem som (a
voz é a da aula). Se o trecho da fala for mais longo que o vídeo, o último quadro fica parado.

O editar-parte.sh importa a peça e a põe no trecho dela; o acabamento a trata como animação de conceito (o nome
começa com "conceito-").
"""
import json
import os
import shutil
import subprocess
import tempfile

from cena_layout import FPS, Layout
from edisvg_cena import Cena

FF = shutil.which("ffmpeg")
CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe"


def _png(d, quadro, saida, transparente=False):
    """Desenha o quadro de um documento .edisvg num PNG 1920 x 1080 (o mesmo desenho da prévia)."""
    from playwright.sync_api import sync_playwright

    lay = Layout(d)
    with sync_playwright() as pw:
        nav = pw.chromium.launch(executable_path=CHROME, headless=True)
        pag = nav.new_page(viewport={"width": 1920, "height": 1080})
        fundo = "transparent" if transparente else "white"
        pag.set_content(f'<html><head><style>{lay.css_fontes()} html,body{{margin:0;background:{fundo}}}</style></head>'
                        f'<body><svg width="1920" height="1080" viewBox="0 0 1920 1080">{lay.svg(quadro)}</svg></body></html>')
        pag.evaluate("async () => { await document.fonts.ready }")
        pag.wait_for_timeout(120)
        pag.screenshot(path=saida, omit_background=transparente)
        nav.close()


def _doc(c):
    """O documento da cena como o salvar() escreveria, sem gravar o .edisvg."""
    d = json.loads(json.dumps(c.d))
    art = next(a for a in d["artboards"] if a["id"] == d["defaultArtboardId"])
    art["scene"]["viewBox"] = [0, 0, 1920, 1080]
    art["scene"]["nodes"] = c.nos
    d["motion"] = {"version": d["motion"]["version"], "animations": [
        {"id": "animation-video", "name": c.nome, "fps": FPS, "frames": c.total, "mode": "once", "tracks": c.trilhas}]}
    return d


CARTAO = (100, 250, 1120, 630)  # x, y, largura, altura (16:9) do vídeo na cena, na área livre da apresentadora


def video_conceito(nome, slug, t0, t1, video, base, blocos, saida, numero, inicio_video=0.0, titulos=(),
                   fundo="fundo-cade", cartao=CARTAO):
    """Gera <saida>/conceito-<numero>-<slug>.mp4 para o trecho [t0, t1] da aula. titulos: [(partes, t), ...], cada
    título (as partes do kit_cena.titulo) aparece em t (segundos da aula) e fica até o seguinte. Devolve o caminho e
    imprime a linha no formato das cenas (o editar-kit.sh tira dela o trecho)."""
    from kit_cena import titulo

    dur = round(t1 - t0, 3)
    tmp = tempfile.mkdtemp(prefix="cena-video-")
    x, y, w, h = cartao
    borda = 14
    # O fundo com o cartão (degrau e moldura branca) onde o vídeo entra.
    c = Cena(f"Conceito · {nome}", t0, t1, base, blocos, tmp, fundo=fundo)
    c.nos.remove(c.pilula)
    c.trilhas = [t for t in c.trilhas if t["targetId"] != c.pilula["id"]]
    c.nos += [c.rect("Cartão · degrau", x - borda, y - borda + 10, w + 2 * borda, h + 2 * borda, "#B9C6D9", rx=36),
              c.rect("Cartão", x - borda, y - borda, w + 2 * borda, h + 2 * borda, "#FFFFFF", rx=36)]
    _png(_doc(c), 0, os.path.join(tmp, "fundo.png"))
    # Cada título num PNG transparente, desenhado já inteiro (0,5 s depois de entrar).
    camadas = []
    for k, (partes, t) in enumerate(titulos):
        ct = Cena(f"Título {k}", t0, t1, base, blocos, tmp, fundo=fundo)
        ct.nos, ct.trilhas = [ct.pilula], []
        titulo(ct, partes, t, None)
        arq = os.path.join(tmp, f"titulo-{k}.png")
        _png(_doc(ct), ct.q(t + 0.5), arq, transparente=True)
        ate = titulos[k + 1][1] if k + 1 < len(titulos) else t1 + 1
        camadas.append((arq, max(0.0, t - t0), max(0.0, ate - t0)))
    # A máscara de cantos redondos do vídeo.
    from PIL import Image, ImageDraw

    mascara = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mascara).rounded_rectangle((0, 0, w - 1, h - 1), radius=26, fill=255)
    mascara.save(os.path.join(tmp, "mascara.png"))
    os.makedirs(saida, exist_ok=True)
    destino = f"{saida}/conceito-{numero}-{slug}.mp4"  # barra normal: o editar-kit.sh lê o trecho da linha
    entradas = ["-loop", "1", "-t", str(dur), "-i", os.path.join(tmp, "fundo.png"),
                "-ss", str(inicio_video), "-i", video,
                "-loop", "1", "-t", str(dur), "-i", os.path.join(tmp, "mascara.png")]
    for arq, _, _ in camadas:
        entradas += ["-loop", "1", "-t", str(dur), "-i", arq]
    filtro = [f"[1:v]fps={FPS},scale={w}:{h},format=rgba,tpad=stop_mode=clone:stop_duration={dur}[v]",
              "[2:v]format=gray[m]", "[v][m]alphamerge[vr]",
              f"[0:v][vr]overlay={x}:{y}:shortest=0[b0]"]
    atual = "b0"
    for k, (_, a, b) in enumerate(camadas):
        filtro.append(f"[{atual}][{3 + k}:v]overlay=0:0:enable='between(t,{a:.3f},{b:.3f})'[b{k + 1}]")
        atual = f"b{k + 1}"
    filtro.append(f"[{atual}]format=yuv420p[saida]")
    subprocess.run([FF, "-v", "error", "-y", *entradas, "-filter_complex", ";".join(filtro), "-map", "[saida]",
                    "-t", str(dur), "-r", str(FPS), "-an", "-c:v", "libx264", "-crf", "16", "-preset", "medium",
                    destino], check=True)
    shutil.rmtree(tmp, ignore_errors=True)
    print(f"{destino} | vídeo {os.path.basename(video)} | {dur:.2f} s | {t0}-{t1}")
    return destino
