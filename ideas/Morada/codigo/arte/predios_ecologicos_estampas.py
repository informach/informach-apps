"""Estampas (letreiros) dos prédios ecológicos, desenhadas com PIL. Rodar com python3 -I:
    python3 -I morada-art/predios_ecologicos_estampas.py <pasta_saida>
Palavras genéricas em português, desenho nosso."""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

FONTE = "/usr/share/fonts/opentype/inter/Inter-Black.otf"
if not os.path.exists(FONTE):
    FONTE = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

# nome: (texto, fundo, letra, borda, largura, altura)
PLACAS = {
    "academia": ("ACADEMIA", "#165C3B", "#F7F7F4", "#B7DC5B", 1600, 280),
    "cafe": ("CAFÉ", "#6D4329", "#FBF2DC", "#8FD07B", 900, 300),
    "horta": ("HORTA", "#2F9A56", "#F7F7F4", "#FFE89C", 1000, 300),
    "heliponto": ("H", None, "#F7F7F4", None, 512, 512),
}


def placa(nome, texto, fundo, letra, borda, W, H, pasta):
    s = 2
    im = Image.new("RGBA", (W * s, H * s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if fundo:
        r = int(H * s * 0.22)
        d.rectangle((0, 0, W * s, H * s), fill=borda or fundo)
        m = int(H * s * 0.07)
        d.rounded_rectangle((m, m, W * s - 1 - m, H * s - 1 - m), r - m, fill=fundo)
    else:  # heliponto: círculo branco sobre grama, H no meio
        d.rectangle((0, 0, W * s, H * s), fill="#56A63B")
        m = int(W * s * 0.06)
        d.ellipse((m, m, W * s - m, H * s - m), outline=letra, width=int(W * s * 0.05))
    alvo = H * s * (0.58 if fundo else 0.62)
    tam = int(alvo)
    f = ImageFont.truetype(FONTE, tam)
    while True:
        bb = d.textbbox((0, 0), texto, font=f)
        if bb[2] - bb[0] < W * s * 0.84 or tam < 20:
            break
        tam -= 4
        f = ImageFont.truetype(FONTE, tam)
    bb = d.textbbox((0, 0), texto, font=f)
    x = (W * s - (bb[2] - bb[0])) / 2 - bb[0]
    y = (H * s - (bb[3] - bb[1])) / 2 - bb[1]
    d.text((x + s * 3, y + s * 4), texto, font=f, fill=(0, 0, 0, 70))
    d.text((x, y), texto, font=f, fill=letra)
    im = im.resize((W, H), Image.LANCZOS)
    fundo_rgb = Image.new("RGBA", im.size, (247, 247, 244, 255))  # sem transparência no GLB
    fundo_rgb.alpha_composite(im)
    fundo_rgb.convert("RGB").save(os.path.join(pasta, f"placa_{nome}.png"))


if __name__ == "__main__":
    pasta = sys.argv[1]
    os.makedirs(pasta, exist_ok=True)
    for n, (t, fu, le, bo, w, h) in PLACAS.items():
        placa(n, t, fu, le, bo, w, h, pasta)
    print("estampas em", pasta)
