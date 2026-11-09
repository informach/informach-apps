"""Miniaturas, folhas e sprite do Elenco, a partir dos PNG de elenco_render.py.

- biblioteca/elenco/<id>.webp: 256 × 256, fundo transparente;
- biblioteca/elenco/_folha_<grupo>.png: os personagens do grupo em fundo azul, dez por linha, com o número, o nome e o
  papel embaixo (como as folhas do vídeo do pacote);
- corpos_viewer/elenco_sprite.webp: todas as miniaturas numa imagem só (CEL px por personagem), e
  corpos_viewer/elenco.json: o índice (posição no sprite, grupo, papel, nome) e o personagem no formato
  "morada-personagem" da página, pronto para aplicarPersonagem.

Uso: python3 -I elenco_folhas.py <pasta dos PNG>
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

AQUI = os.path.dirname(os.path.abspath(__file__))
SP = os.path.dirname(AQUI)
PNGS = sys.argv[1] if len(sys.argv) > 1 else os.path.join(SP, "elenco_tmp", "png")
OUT = os.path.join(SP, "biblioteca", "elenco")
VIEW = os.path.join(SP, "corpos_viewer")
CEL = 128          # célula do sprite da página
COLS = 20
TAM = 256
FONTE = "/usr/share/fonts/opentype/inter/Inter-SemiBold.otf"
FONTE2 = "/usr/share/fonts/opentype/inter/Inter-Regular.otf"


def fonte(arq, t):
    try:
        return ImageFont.truetype(arq, t)
    except OSError:
        return ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", t)


def fundo(w, h):
    """Degradê azul de cima para baixo (como as folhas do vídeo)."""
    im = Image.new("RGB", (w, h))
    dr = ImageDraw.Draw(im)
    a, b = (64, 82, 140), (30, 37, 78)
    for y in range(h):
        t = y / max(h - 1, 1)
        dr.line([(0, y), (w, y)], fill=tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3)))
    return im


def miniatura(pid):
    f = os.path.join(PNGS, pid + ".png")
    if not os.path.exists(f):
        return None
    im = Image.open(f).convert("RGBA")
    if im.size != (TAM, TAM):
        im = im.resize((TAM, TAM), Image.LANCZOS)
    return im


def personagem_pagina(p):
    """Só os campos que a página lê em aplicarPersonagem (formato morada-personagem)."""
    q = {"formato": "morada-personagem", "versao": 1, "corpo": p["corpo"], "pele": p["pele"], "expressao": p["expressao"],
         "cabelo": p["cabelo"]}
    if p["corpo"].startswith("recem"):
        q["manta"], q["chupeta"] = p["manta"], p["chupeta"]
    else:
        q["roupa"], q["objetos"] = p.get("roupa", {}), p.get("objetos", {})
        if "gravidez" in p:
            q["gravidez"] = p["gravidez"]
    return q


def main():
    d = json.load(open(os.path.join(AQUI, "elenco.json")))
    ps = d["personagens"]
    os.makedirs(OUT, exist_ok=True)
    faltam = []
    minis = {}
    for p in ps:
        im = miniatura(p["id"])
        if im is None:
            faltam.append(p["id"])
            continue
        minis[p["id"]] = im
        im.save(os.path.join(OUT, p["id"] + ".webp"), "WEBP", quality=88, method=6)
    # folhas por grupo
    f1, f2 = fonte(FONTE, 19), fonte(FONTE2, 16)
    num = 0
    for g, rot in d["grupos"].items():
        gs = [p for p in ps if p["grupo"] == g]
        cols = 10
        linhas = (len(gs) + cols - 1) // cols
        cw, ch = 220, 300
        topo = 70
        folha = fundo(cols * cw + 40, topo + linhas * ch + 30)
        dr = ImageDraw.Draw(folha)
        dr.text((24, 20), f"Elenco do Morada · {rot} ({len(gs)})", font=fonte(FONTE, 30), fill=(236, 240, 255))
        for i, p in enumerate(gs):
            num += 1
            x, y = 20 + (i % cols) * cw, topo + (i // cols) * ch
            im = minis.get(p["id"])
            if im is not None:
                folha.paste(im, (x + (cw - TAM) // 2, y - 6), im)
            nome = f"{num}. {p['nome']}"
            papel = p.get("rotulo") or p["papel"]
            for txt, ft, cor, dy in ((nome, f1, (226, 232, 250), 252), (papel, f2, (168, 180, 214), 276)):
                w = dr.textlength(txt, font=ft)
                while w > cw - 8 and len(txt) > 4:
                    txt = txt[:-2] + "…"
                    w = dr.textlength(txt, font=ft)
                dr.text((x + (cw - w) / 2, y + dy), txt, font=ft, fill=cor)
        folha.save(os.path.join(OUT, f"_folha_{g}.png"), optimize=True)
        print("folha", g, len(gs))
    # sprite e índice da página
    linhas = (len(ps) + COLS - 1) // COLS
    sprite = Image.new("RGBA", (COLS * CEL, linhas * CEL), (0, 0, 0, 0))
    idx = []
    for i, p in enumerate(ps):
        x, y = (i % COLS) * CEL, (i // COLS) * CEL
        im = minis.get(p["id"])
        if im is not None:
            sprite.paste(im.resize((CEL, CEL), Image.LANCZOS), (x, y))
        idx.append({"id": p["id"], "nome": p["nome"], "grupo": p["grupo"], "papel": p["papel"],
                    "rotulo": p.get("rotulo") or p["papel"], "faixa": p["faixa"], "corpo": p["corpo"],
                    "animacao": p.get("animacao"), "animacao_rotulo": p.get("animacao_rotulo"),
                    "veiculo": p.get("veiculo"), "x": x, "y": y, "personagem": personagem_pagina(p)})
    sprite.save(os.path.join(VIEW, "elenco_sprite.webp"), "WEBP", quality=85, method=6)
    json.dump({"_leia": "Índice do Elenco (gerado por morada-art/elenco_folhas.py): cada personagem com a posição da "
                        "miniatura no sprite (x, y, em px; célula de 'celula' px) e o personagem no formato "
                        "morada-personagem (aplicarPersonagem).",
               "sprite": "elenco_sprite.webp", "celula": CEL, "colunas": COLS, "largura": COLS * CEL,
               "altura": linhas * CEL, "grupos": d["grupos"], "personagens": idx},
              open(os.path.join(VIEW, "elenco.json"), "w"), ensure_ascii=False, separators=(",", ":"))
    print(len(minis), "miniaturas;", "faltam", len(faltam), faltam[:10])


if __name__ == "__main__":
    main()
