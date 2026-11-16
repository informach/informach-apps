"""Recapitulação da Farol Aula 3 Parte 2 (0:13,6 a 0:39,75) no style guide "Zero Kids · Kit de slides".

Fundo Azul jogo (#6E9BFF, a cor do oceano até a borda), título e subtítulo por ideia, o jogo do Estúdio numa
moldura azul-noite, balões numerados nas cores de significado, destaque amarelo no lugar de seta e, no fim, o
bloco Quando acontecer de verdade (recortado da gravação), grande e contornado em amarelo. A faixa x >= 1320
fica livre para a apresentadora. Uso: anima_recap2.py <base.edisvg> <bloco.png> <saida.edisvg>
"""

import base64
import copy
import hashlib
import json
import struct
import sys
import uuid

base, png, saida = sys.argv[1], sys.argv[2], sys.argv[3]
INICIO, FIM, FPS = 13.6, 39.75, 30
TOTAL = round((FIM - INICIO) * FPS)
AZUL_JOGO, TINTA, BRANCO, VERDE, AMARELO, NOITE = "#6E9BFF", "#0F1A33", "#FFFFFF", "#0B7A54", "#FFC02E", "#121A30"

d = copy.deepcopy(json.load(open(base, encoding="utf8")))
d["id"] = f"project-{uuid.uuid4()}"
d["name"] = "Recapitulação · A porta pergunta"
cena = [a for a in d["artboards"] if a["name"].startswith("Cena")][-1]
cena["name"] = "Recapitulação · A porta pergunta"
orig = {n["name"]: n for n in cena["scene"]["nodes"]}
fonte = {a["name"]: a["id"] for a in d["assets"] if a["kind"] == "font"}

# O bloco real como recurso de imagem.
dados = open(png, "rb").read()
pw, ph = struct.unpack(">II", dados[16:24])
img_id = "asset-" + hashlib.sha256(dados).hexdigest()
d["assets"].append({"id": img_id, "name": "Quando acontecer (Estúdio)", "byteLength": len(dados),
                    "data": base64.b64encode(dados).decode(), "kind": "image", "mime": "image/png",
                    "width": pw, "height": ph})


def nid():
    return f"node-{uuid.uuid4()}"


def tf(x=0, y=0, op=100, s=1):
    return {"x": x, "y": y, "rotation": 0, "sx": s, "sy": s, "opacity": op}


def rect(nome, x, y, w, h, fill, rx=0, stroke=None, sw=0, op=100):
    a = {"x": str(x), "y": str(y), "width": str(w), "height": str(h), "fill": fill}
    if rx:
        a["rx"] = str(rx)
    if stroke:
        a.update({"stroke": stroke, "stroke-width": str(sw)})
    return {"id": nid(), "name": nome, "tag": "rect", "attrs": a, "text": "", "transform": tf(op=op),
            "visible": True, "locked": False}


def poly(nome, pts, fill):
    return {"id": nid(), "name": nome, "tag": "polygon", "attrs": {"points": " ".join(f"{x},{y}" for x, y in pts), "fill": fill},
            "text": "", "transform": tf(), "visible": True, "locked": False}


def texto(nome, t, x, y, tam, cor, familia="Baloo 2", peso=800, ancora="start", op=100):
    chave = f"{familia} {peso}"
    no = {"id": nid(), "name": nome, "tag": "text",
          "attrs": {"fill": cor, "x": "0", "y": "0", "font-size": str(tam), "font-family": familia,
                    "text-anchor": ancora, "font-weight": str(peso), "font-style": "normal"},
          "text": t, "transform": tf(x, y, op), "visible": True, "locked": False}
    if chave in fonte:
        no["fontAssetId"] = fonte[chave]
    return no


def grupo(nome, x, y, filhos, op=0, s=1):
    return {"id": nid(), "name": nome, "tag": "g", "attrs": {}, "text": "", "transform": tf(x, y, op, s),
            "visible": True, "locked": False, "children": filhos}


trilhas = []
SUAVE = {"kind": "cubic-bezier", "points": [0.22, 1, 0.36, 1]}
VAIVEM = {"kind": "cubic-bezier", "points": [0.42, 0, 0.58, 1]}


def q(t):
    return max(0, round((t - INICIO) * FPS))


def trilha(no, prop, chaves):
    keys, ultimo = [], -1
    for t, v, e in sorted(chaves, key=lambda c: c[0]):
        f = min(max(q(t), ultimo + 1), TOTAL)
        if f <= ultimo:
            continue
        keys.append({"id": f"key-{uuid.uuid4()}", "frame": f, "value": v, "easing": e or "linear"})
        ultimo = f
    trilhas.append({"id": f"track-{uuid.uuid4()}", "targetId": no["id"], "property": prop, "keys": keys})


def mostra(no, t0, t1=None, pop=False, sobe=0):
    ch = [(t0, 0, None), (t0 + 0.3, 100, None)]
    if t1:
        ch += [(t1 - 0.25, 100, None), (t1, 0, None)]
    trilha(no, "opacity", ch)
    if pop:
        for p in ("sx", "sy"):
            trilha(no, p, [(t0, 0.7, SUAVE), (t0 + 0.28, 1.05, VAIVEM), (t0 + 0.42, 1, None)])
    if sobe:
        y = no["transform"]["y"]
        trilha(no, "y", [(t0, y + sobe, SUAVE), (t0 + 0.3, y, None)])


nos = [rect("Fundo · Azul jogo", 0, 0, 1920, 1080, AZUL_JOGO)]

# O jogo do Estúdio numa moldura de 8 px (12 em 1080p), à esquerda, na área de conteúdo.
GX, GY, GS = 108, 302, 742 / 1080
nos.append(rect("Moldura do jogo", GX - 12, GY - 12, 1440 * GS + 24, 1080 * GS + 24, NOITE, rx=24))
jogo_nos = [copy.deepcopy(orig[n]) for n in ("Fundo do palco", "Cenário · praia-tropical", "chave · chave-dourada",
                                              "farol · farol-listrado-apagado", "personagem · aventureiro",
                                              "fundoAviso", "Texto · aviso")]
por = {n["name"]: n for n in jogo_nos}
aviso = por["Texto · aviso"]
aviso2 = copy.deepcopy(aviso)
aviso2.update({"id": nid(), "name": "Texto · aviso falta a chave", "text": "A porta não abriu. Falta a chave."})
aviso2["transform"]["opacity"] = 0
jogo_nos.append(aviso2)
jogo = grupo("Jogo", GX, GY, jogo_nos, op=100, s=GS)
nos.append(jogo)


def abs_(x, y):
    return GX + x * GS, GY + y * GS


# Destaque amarelo do aviso (borda 4, em 1080p 6).
ax, ay = abs_(24, 24)
destaque_aviso = rect("Destaque · aviso", ax - 8, ay - 8, 1392 * GS + 16, 84 * GS + 16, "none", rx=14, stroke=AMARELO, sw=6, op=0)
nos.append(destaque_aviso)
# Destaque amarelo da chave (como pegar a chave).
kx, ky = abs_(633 + 48, 159 + 48)
destaque_chave = grupo("Destaque · chave", kx, ky, [rect("anel", -52, -52, 104, 104, "none", rx=52, stroke=AMARELO, sw=6)])
nos.append(destaque_chave)


def balao(nome, num, texto_, cor_fundo, cor_texto, x, y, w, ponta):
    """Balão numerado: raio 30, Baloo 45, número azul-noite no canto, rabinho apontando o alvo (dx, dy)."""
    h = 96
    filhos = [rect("fundo", -w / 2, -h / 2, w, h, cor_fundo, rx=30)]
    px, py = ponta
    filhos.append(poly("rabinho", [(px - 18, h / 2 - 2), (px + 18, h / 2 - 2), (px + 6, h / 2 + 30)], cor_fundo))
    filhos.append(texto("texto", texto_, 0, 15, 45, cor_texto, ancora="middle"))
    filhos.append(rect("número fundo", -w / 2 - 22, -h / 2 - 22, 54, 54, NOITE, rx=27))
    filhos.append(texto("número", str(num), -w / 2 + 5, -h / 2 + 18, 36, BRANCO, ancora="middle"))
    return grupo(nome, x, y, filhos)


# A porta do farol no jogo: (404, 178) em pixels do jogo; na cena 3x: (1212, 534).
porta = abs_(1212, 534)
b1 = balao("Balão 1 · Tem a chave?", 1, "Tem a chave?", BRANCO, TINTA, porta[0] - 250, porta[1] - 190, 400, (170, 0))
b2 = balao("Balão 2 · Não: falta a chave!", 2, "Não: falta a chave!", VERDE, AMARELO, porta[0] - 300, porta[1] + 200, 500, (230, 0))
b2["children"][1]["attrs"]["points"] = f"{230 - 18},{-46} {230 + 18},{-46} {236},{-78}"  # rabinho para cima
b3 = balao("Balão 1 · Encontro!", 1, "Encontro!", BRANCO, TINTA, porta[0] - 250, porta[1] - 190, 330, (150, 0))
nos += [b1, b2, b3]

# O bloco Quando acontecer de verdade, grande, contornado em amarelo.
iw = 1100
ih = iw * ph / pw
bloco = grupo("Bloco · Quando acontecer", 100, 330, [
    {"id": nid(), "name": "Quando acontecer (Estúdio)", "tag": "image", "assetId": img_id,
     "attrs": {"x": "0", "y": "0", "width": str(iw), "height": str(round(ih, 1))}, "text": "", "children": [],
     "transform": tf(), "visible": True, "locked": False},
    rect("contorno", -10, -10, iw + 20, ih + 20, "none", rx=20, stroke=AMARELO, sw=6),
])
nos.append(bloco)

# Título (pílula branca, Baloo 800) e subtítulo (Nunito 700), uma ideia por vez.
pilula = rect("Título · fundo", 96, 60, 1170, 128, BRANCO, rx=36)
nos.append(pilula)
IDEIAS = [
    (13.69, 23.05, "Lembra da experiência?", 16.13, "A porta pergunta se o personagem tem a chave."),
    (23.15, 29.05, "Agora, no seu jogo", 23.15, "O farol vai fazer essa pergunta. Primeiro, o aviso."),
    (29.16, 36.85, "A chegada ao farol", 29.16, "Chegar ao farol é um encontro, como pegar a chave."),
    (36.94, None, "Encontros ficam aqui", 36.94, "Na área Quando acontecer, como no seu Estúdio."),
]
for i, (t0, t1, tit, ts, sub) in enumerate(IDEIAS, 1):
    a = texto(f"Título {i}", tit, 140, 152, 78, TINTA, op=0)
    b = texto(f"Subtítulo {i}", sub, 100, 258, 42, BRANCO, familia="Nunito", peso=700, op=0)
    nos += [a, b]
    mostra(a, t0, t1, sobe=12)
    mostra(b, ts, t1, sobe=10)
trilha(pilula, "opacity", [(13.5, 0, None), (13.8, 100, None)])

# O personagem anda e encosta na porta (x 1050 na cena), uma vez na recapitulação e outra na chegada.
pers = por["personagem · aventureiro"]
x0, y0, XP = pers["transform"]["x"], pers["transform"]["y"], 1050


def andar(t_ini, t_fim):
    bob = []
    t = t_ini
    while t < t_fim:
        bob += [(t, y0, VAIVEM), (t + 0.12, y0 - 14, VAIVEM)]
        t += 0.24
    return bob + [(t_fim, y0, None)]


trilha(pers, "x", [(16.2, x0, VAIVEM), (17.75, XP, None), (29.2, XP, None), (29.21, x0, None),
                    (30.6, x0, VAIVEM), (33.0, XP, None)])
trilha(pers, "y", andar(16.2, 17.75) + andar(30.6, 33.0))
trilha(pers, "opacity", [(29.05, 100, None), (29.2, 0, None), (29.4, 100, None)])

# Pergunta da porta quando ele encosta; o não; o aviso que muda e o destaque nele.
mostra(b1, 17.85, 23.0, pop=True)
mostra(b2, 20.2, 23.0, pop=True)
trilha(aviso, "opacity", [(21.45, 100, None), (21.7, 0, None), (29.1, 0, None), (29.35, 100, None)])
trilha(aviso2, "opacity", [(21.5, 0, None), (21.75, 100, None), (29.1, 100, None), (29.35, 0, None)])
trilha(destaque_aviso, "opacity", [(21.5, 0, None), (21.8, 100, None), (22.8, 100, None), (23.05, 0, None),
                                   (27.8, 0, None), (28.1, 100, None), (29.0, 100, None), (29.15, 0, None)])
# A chegada: encontro quando encosta; a chave, como pegar a chave.
mostra(b3, 33.1, 36.85, pop=True)
mostra(destaque_chave, 35.9, 36.85, pop=True)
# O bloco real no lugar do jogo.
trilha(jogo, "opacity", [(36.9, 100, None), (37.25, 0, None)])
for no in (nos[1],):
    trilha(no, "opacity", [(36.9, 100, None), (37.25, 0, None)])
mostra(bloco, 37.1, None, pop=True)

cena["scene"]["viewBox"] = [0, 0, 1920, 1080]
cena["scene"]["nodes"] = nos
d["motion"] = {"version": d["motion"]["version"], "animations": [{
    "id": f"animation-{uuid.uuid4()}", "name": "Recapitulação · A porta pergunta", "fps": FPS,
    "frames": TOTAL, "mode": "once", "tracks": trilhas}]}
d["defaultArtboardId"] = cena["id"]
json.dump(d, open(saida, "w", encoding="utf8"), ensure_ascii=False)
print(saida, "| nós", len(nos), "| trilhas", len(trilhas), "| quadros", TOTAL, "| fontes", list(fonte))
