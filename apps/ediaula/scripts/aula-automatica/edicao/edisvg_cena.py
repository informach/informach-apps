"""Cena de animação de conceito no style guide "Zero Kids · Kit de slides", para o EdiSVG.

Fundo Azul jogo, título em pílula branca e subtítulo por ideia, os blocos de verdade (recortados da gravação
com recortar.sh) em cartões da cor do Estúdio, destaque amarelo no lugar de seta, caixas de significado
(branca = termo, verde = reação com texto amarelo, numeradas, no máximo 3) e a faixa x >= 1320 livre para a
apresentadora. Os tempos são segundos da aula (a voz): a animação entra na aula de ini a fim.

Uso: veja exemplos/farol-a3p2-conceitos.py. Depois de salvar, confira com validar_svg.py e exporte o MP4
pelo condutor do EdiSVG (acoes/exportar-svg.mjs).
"""

import base64
import copy
import hashlib
import json
import os
import struct
import uuid

FPS = 30
AZUL_JOGO, TINTA, BRANCO, VERDE, AMARELO, NOITE = "#6E9BFF", "#0F1A33", "#FFFFFF", "#0B7A54", "#FFC02E", "#121A30"
AREA_ESTUDIO, AREA_GAVETA = "#E7EDF5", "#EEF2F8"
SUAVE = {"kind": "cubic-bezier", "points": [0.22, 1, 0.36, 1]}
VAIVEM = {"kind": "cubic-bezier", "points": [0.42, 0, 0.58, 1]}


def nid():
    return f"node-{uuid.uuid4()}"


def tf(x=0, y=0, op=100, s=1):
    return {"x": x, "y": y, "rotation": 0, "sx": s, "sy": s, "opacity": op}


class Cena:
    def __init__(self, nome, ini, fim, base, blocos, saida):
        """base: .edisvg do curso (fontes da aula e as artes do jogo numa cena "Jogo"); blocos: pasta dos PNG
        recortados da gravação (recortar.sh); saida: pasta onde o .edisvg é salvo. ini/fim em segundos da aula."""
        self.nome, self.ini, self.fim = nome, ini, fim
        self.blocos, self.saida = blocos, saida
        self.total = round((fim - ini) * FPS)
        self.d = copy.deepcopy(json.load(open(base, encoding="utf8")))
        self.d["id"] = f"project-{uuid.uuid4()}"
        self.d["name"] = nome
        self.d["assets"] = [a for a in self.d["assets"] if a["kind"] == "font"]
        self.fonte = {a["name"]: a["id"] for a in self.d["assets"]}
        self.cena = next(a for a in self.d["artboards"] if a["id"] == self.d["defaultArtboardId"])
        self.cena["name"] = nome
        jogo = next(n for n in self.cena["scene"]["nodes"] if n["name"] == "Jogo")
        self.arte = {n["name"]: n for n in jogo["children"]}
        self.nos = [self.rect("Fundo · Azul jogo", 0, 0, 1920, 1080, AZUL_JOGO)]
        self.trilhas = []
        self.pilula = self.rect("Título · fundo", 96, 60, 1170, 128, BRANCO, rx=36, op=0)
        self.nos.append(self.pilula)
        self.trilha(self.pilula, "opacity", [(ini, 0, None), (ini + 0.3, 100, None)])

    # Peças.
    def rect(self, nome, x, y, w, h, fill, rx=0, stroke=None, sw=0, op=100):
        a = {"x": str(x), "y": str(y), "width": str(w), "height": str(h), "fill": fill}
        if rx:
            a["rx"] = str(rx)
        if stroke:
            a.update({"stroke": stroke, "stroke-width": str(sw)})
        return {"id": nid(), "name": nome, "tag": "rect", "attrs": a, "text": "", "transform": tf(op=op),
                "visible": True, "locked": False}

    def poly(self, nome, pts, fill):
        return {"id": nid(), "name": nome, "tag": "polygon",
                "attrs": {"points": " ".join(f"{x},{y}" for x, y in pts), "fill": fill},
                "text": "", "transform": tf(), "visible": True, "locked": False}

    def texto(self, nome, t, x, y, tam, cor, familia="Baloo 2", peso=800, ancora="start", op=100):
        no = {"id": nid(), "name": nome, "tag": "text",
              "attrs": {"fill": cor, "x": "0", "y": "0", "font-size": str(tam), "font-family": familia,
                        "text-anchor": ancora, "font-weight": str(peso), "font-style": "normal"},
              "text": t, "transform": tf(x, y, op), "visible": True, "locked": False}
        chave = f"{familia} {peso}"
        if chave in self.fonte:
            no["fontAssetId"] = self.fonte[chave]
        return no

    def grupo(self, nome, x, y, filhos, op=0, s=1):
        return {"id": nid(), "name": nome, "tag": "g", "attrs": {}, "text": "", "transform": tf(x, y, op, s),
                "visible": True, "locked": False, "children": filhos}

    def imagem(self, arq):
        dados = open(f"{self.blocos}/{arq}.png", "rb").read()
        w, h = struct.unpack(">II", dados[16:24])
        aid = "asset-" + hashlib.sha256(dados).hexdigest()
        if not any(a["id"] == aid for a in self.d["assets"]):
            self.d["assets"].append({"id": aid, "name": f"{arq} (Estúdio)", "byteLength": len(dados),
                                     "data": base64.b64encode(dados).decode(), "kind": "image",
                                     "mime": "image/png", "width": w, "height": h})
        return aid, w, h

    def bloco(self, arq, x, y, escala, fundo=AREA_ESTUDIO, pad=22):
        """O bloco de verdade num cartão da cor da área do Estúdio. Devolve (grupo, função de destaque)."""
        aid, w, h = self.imagem(arq)
        W, H = w * escala, h * escala
        filhos = [self.rect("cartão", -pad, -pad, W + 2 * pad, H + 2 * pad, fundo, rx=24),
                  {"id": nid(), "name": arq, "tag": "image", "assetId": aid,
                   "attrs": {"x": "0", "y": "0", "width": str(round(W, 1)), "height": str(round(H, 1))},
                   "text": "", "children": [], "transform": tf(), "visible": True, "locked": False}]
        g = self.grupo(f"Bloco · {arq}", x, y, filhos)
        self.nos.append(g)

        def destaque(nome, x0, y0, x1, y1):
            """Contorno amarelo (borda 4, em 1080p 6) em coordenadas do recorte."""
            r = self.rect(nome, x + x0 * escala - 6, y + y0 * escala - 6, (x1 - x0) * escala + 12,
                          (y1 - y0) * escala + 12, "none", rx=14, stroke=AMARELO, sw=6, op=0)
            self.nos.append(r)
            return r

        return g, destaque

    def caixa(self, nome, t, fill, cor, cx, cy, w, num=None, tam=44):
        h = 96
        filhos = [self.rect("fundo", -w / 2, -h / 2, w, h, fill, rx=30),
                  self.texto("texto", t, 0, 15, tam, cor, ancora="middle")]
        if num:
            filhos += [self.rect("número fundo", -w / 2 - 22, -h / 2 - 22, 54, 54, NOITE, rx=27),
                       self.texto("número", str(num), -w / 2 + 5, -h / 2 + 18, 36, BRANCO, ancora="middle")]
        g = self.grupo(nome, cx, cy, filhos)
        self.nos.append(g)
        return g

    def balao(self, nome, t, cx, cy, w, ponta_x):
        h = 96
        filhos = [self.rect("fundo", -w / 2, -h / 2, w, h, BRANCO, rx=30),
                  self.poly("rabinho", [(ponta_x - 18, h / 2 - 2), (ponta_x + 18, h / 2 - 2), (ponta_x + 6, h / 2 + 30)], BRANCO),
                  self.texto("texto", t, 0, 15, 45, TINTA, ancora="middle")]
        g = self.grupo(nome, cx, cy, filhos)
        self.nos.append(g)
        return g

    def instancia(self, nome_arte, x, y, tam):
        no = copy.deepcopy(self.arte[nome_arte])
        no["id"] = nid()
        no["transform"] = tf(x, y, 0)
        no["instance"]["width"] = no["instance"]["height"] = tam
        self.nos.append(no)
        return no

    # Tempo.
    def q(self, t):
        return max(0, round((t - self.ini) * FPS))

    def trilha(self, no, prop, chaves):
        keys, ultimo = [], -1
        for t, v, e in sorted(chaves, key=lambda c: c[0]):
            f = min(max(self.q(t), ultimo + 1), self.total)
            if f <= ultimo:
                continue
            keys.append({"id": f"key-{uuid.uuid4()}", "frame": f, "value": v, "easing": e or "linear"})
            ultimo = f
        self.trilhas.append({"id": f"track-{uuid.uuid4()}", "targetId": no["id"], "property": prop, "keys": keys})

    def mostra(self, no, t0, t1=None, pop=False, sobe=0):
        ch = [(t0, 0, None), (t0 + 0.3, 100, None)]
        if t1:
            ch += [(t1 - 0.25, 100, None), (t1, 0, None)]
        self.trilha(no, "opacity", ch)
        if pop:
            for p in ("sx", "sy"):
                self.trilha(no, p, [(t0, 0.7, SUAVE), (t0 + 0.28, 1.05, VAIVEM), (t0 + 0.42, 1, None)])
        if sobe:
            y = no["transform"]["y"]
            self.trilha(no, "y", [(t0, y + sobe, SUAVE), (t0 + 0.3, y, None)])

    def pisca(self, no, t0, t1, vezes=2):
        """Destaque que entra, pulsa e sai."""
        ch = [(t0, 0, None), (t0 + 0.25, 100, None)]
        passo = 0.5
        t = t0 + 0.5
        for _ in range(vezes):
            ch += [(t, 100, None), (t + passo / 2, 35, None), (t + passo, 100, None)]
            t += passo
        ch += [(max(t, t1 - 0.25), 100, None), (max(t + 0.01, t1), 0, None)]
        self.trilha(no, "opacity", ch)

    def ideia(self, tit, t0, t1, sub, t1_sub=None, ts=None):
        """Título (pílula) e subtítulo de uma ideia; o subtítulo pode sair antes (t1_sub) para outro entrar."""
        if tit:
            a = self.texto("Título", tit, 140, 152, 78, TINTA, op=0)
            self.nos.append(a)
            self.mostra(a, t0, t1, sobe=12)
        if sub:
            b = self.texto("Subtítulo", sub, 100, 258, 42, BRANCO, familia="Nunito", peso=700, op=0)
            self.nos.append(b)
            self.mostra(b, ts or t0, t1_sub or t1, sobe=10)

    def salvar(self, arq):
        self.cena["scene"]["viewBox"] = [0, 0, 1920, 1080]
        self.cena["scene"]["nodes"] = self.nos
        self.d["motion"] = {"version": self.d["motion"]["version"], "animations": [{
            "id": f"animation-{uuid.uuid4()}", "name": self.nome, "fps": FPS, "frames": self.total,
            "mode": "once", "tracks": self.trilhas}]}
        os.makedirs(self.saida, exist_ok=True)
        caminho = f"{self.saida}/{arq}.edisvg"
        json.dump(self.d, open(caminho, "w", encoding="utf8"), ensure_ascii=False)
        print(caminho, "| nós", len(self.nos), "| trilhas", len(self.trilhas), "| quadros", self.total,
              f"| {self.ini}-{self.fim}")


