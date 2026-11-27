"""O layout de uma cena .edisvg num quadro: onde está cada nó, com que escala, opacidade e caixa na tela.

É a conta que a prévia (previa_cena.py) e o validador (validar_svg.py) fazem igual: as trilhas como retas (o
cubic-bezier sai linear), a transformação do EdiSVG (translate, rotate, scale; edi-motion/src/affine.ts) e a
largura dos textos medida com as fontes da própria cena.
"""
import base64
import io
import math

from PIL import ImageFont

FPS = 30


class Layout:
    def __init__(self, d):
        self.d = d
        self.assets = {a["id"]: a for a in d["assets"]}
        art = next(a for a in d["artboards"] if a["id"] == d["defaultArtboardId"])
        self.nos = art["scene"]["nodes"]
        self.anim = d["motion"]["animations"][0]
        self.total = self.anim["frames"]
        self.trilhas = {}
        for t in self.anim["tracks"]:
            self.trilhas.setdefault(t["targetId"], {})[t["property"]] = t["keys"]
        self._fontes = {}
        self.pais = {}

        def marca(no, pai):
            self.pais[no["id"]] = pai
            for f in no.get("children", []):
                marca(f, no)

        for no in self.nos:
            marca(no, None)

    # Valores no quadro.
    @staticmethod
    def valor(keys, f, base):
        if not keys:
            return base
        if f <= keys[0]["frame"]:
            return keys[0]["value"]
        for a, b in zip(keys, keys[1:]):
            if a["frame"] <= f <= b["frame"]:
                if isinstance(a.get("easing"), str) and a["easing"] == "hold":
                    return a["value"]
                u = (f - a["frame"]) / max(1, b["frame"] - a["frame"])
                return a["value"] + (b["value"] - a["value"]) * u
        return keys[-1]["value"]

    def transform(self, no, f):
        tr = no.get("transform") or {}
        tk = self.trilhas.get(no["id"], {})
        return {p: self.valor(tk.get(p), f, tr.get(p, 1 if p in ("sx", "sy") else (100 if p == "opacity" else 0)))
                for p in ("x", "y", "rotation", "sx", "sy", "opacity")}

    # Fontes e medidas.
    def fonte(self, familia, peso, tam):
        chave = (familia, str(peso), round(tam, 1))
        if chave not in self._fontes:
            a = next((a for a in self.d["assets"] if a["kind"] == "font" and a["name"] == f"{familia} {peso}"), None)
            if a is None:
                a = next((a for a in self.d["assets"] if a["kind"] == "font" and a["name"].startswith(familia)), None)
            self._fontes[chave] = ImageFont.truetype(io.BytesIO(base64.b64decode(a["data"])), max(1, round(tam))) if a else None
        return self._fontes[chave]

    def caixa_local(self, no):
        """A caixa do nó no espaço dele (sem a própria transformação), ou None."""
        a = no.get("attrs", {})
        tag = no.get("tag")
        if tag in ("rect", "image"):
            x, y = float(a.get("x", 0)), float(a.get("y", 0))
            return x, y, x + float(a.get("width", 0)), y + float(a.get("height", 0))
        if tag == "polygon":
            pts = [tuple(map(float, p.split(","))) for p in a.get("points", "").split()]
            if not pts:
                return None
            return min(p[0] for p in pts), min(p[1] for p in pts), max(p[0] for p in pts), max(p[1] for p in pts)
        if tag == "text":
            tam = float(a.get("font-size", 16))
            ft = self.fonte(a.get("font-family", ""), a.get("font-weight", "400"), tam)
            if ft is None:
                w, (sobe, desce) = 0.55 * tam * len(no.get("text", "")), (0.75 * tam, 0.2 * tam)
            else:
                w = ft.getlength(no.get("text", ""))
                asc, desc = ft.getmetrics()
                # A altura das letras de verdade (a caixa da maiúscula e da minúscula com perna), não a da linha.
                bb = ft.getbbox("ÁgHy")
                sobe, desce = asc - bb[1], min(desc, bb[3] - asc)
            anc = a.get("text-anchor", "start")
            x0 = {"start": 0, "middle": -w / 2, "end": -w}.get(anc, 0) + float(a.get("x", 0))
            y = float(a.get("y", 0))
            return x0, y - sobe, x0 + w, y + desce
        return None

    def quadro(self, f):
        """Os nós visíveis no quadro f: [{no, caixa (x0, y0, x1, y1) na tela, escala, opacidade, pai}]."""
        saida = []

        def desce(no, m, op, s, pai):
            t = self.transform(no, f)
            op = op * t["opacity"] / 100
            if op <= 0.03 or no.get("visible") is False:
                return
            r = math.radians(t["rotation"])
            c, si = math.cos(r), math.sin(r)
            # m: matriz afim (a, b, c, d, e, f) do pai; a do nó = pai · translate · rotate · scale.
            a0, b0, c0, d0, e0, f0 = m
            la, lb, lc, ld = c * t["sx"], si * t["sx"], -si * t["sy"], c * t["sy"]
            nm = (a0 * la + c0 * lb, b0 * la + d0 * lb, a0 * lc + c0 * ld, b0 * lc + d0 * ld,
                  a0 * t["x"] + c0 * t["y"] + e0, b0 * t["x"] + d0 * t["y"] + f0)
            escala = s * max(abs(t["sx"]), abs(t["sy"]))
            cx = self.caixa_local(no)
            if cx:
                x0, y0, x1, y1 = cx
                pts = [(nm[0] * x + nm[2] * y + nm[4], nm[1] * x + nm[3] * y + nm[5])
                       for x, y in ((x0, y0), (x1, y0), (x0, y1), (x1, y1))]
                caixa = (min(p[0] for p in pts), min(p[1] for p in pts), max(p[0] for p in pts), max(p[1] for p in pts))
                saida.append({"no": no, "caixa": caixa, "escala": escala, "op": op, "pai": pai})
            for filho in no.get("children", []):
                desce(filho, nm, op, escala, no)

        for no in self.nos:
            desce(no, (1, 0, 0, 1, 0, 0), 1.0, 1.0, None)
        return saida

    def svg(self, f):
        """O quadro f como SVG (para a prévia)."""

        def no_svg(no):
            t = self.transform(no, f)
            if t["opacity"] <= 0.1 or no.get("visible") is False:
                return ""
            attrs = dict(no.get("attrs", {}))
            tag = no["tag"]
            g = (f'<g transform="translate({t["x"]},{t["y"]}) rotate({t["rotation"]}) scale({t["sx"]},{t["sy"]})" '
                 f'opacity="{t["opacity"] / 100:.3f}">')
            if tag == "g":
                inner = "".join(no_svg(c) for c in no.get("children", []))
            elif tag == "image":
                a = self.assets[no["assetId"]]
                inner = (f'<image x="{attrs.get("x", 0)}" y="{attrs.get("y", 0)}" width="{attrs["width"]}" '
                         f'height="{attrs["height"]}" href="data:{a["mime"]};base64,{a["data"]}"/>')
            elif tag == "text":
                # "Baloo 2" sem aspas não é um nome de fonte válido no CSS (o 2 solto): o Chrome caía na serifada.
                if "font-family" in attrs:
                    attrs["font-family"] = "'" + attrs["font-family"].strip("'\"") + "'"
                at = " ".join(f'{k}="{v}"' for k, v in attrs.items())
                inner = f'<text {at}>{no["text"].replace("&", "&amp;").replace("<", "&lt;")}</text>'
            elif tag == "use" or "instance" in no:
                inner = ""
            else:
                at = " ".join(f'{k}="{v}"' for k, v in attrs.items())
                inner = f"<{tag} {at}/>"
            return g + inner + "</g>"

        return "".join(no_svg(no) for no in self.nos)

    def css_fontes(self):
        css = []
        for a in self.d["assets"]:
            if a["kind"] == "font":
                fam, _, peso = a["name"].rpartition(" ")
                css.append(f"@font-face{{font-family:'{fam}';font-weight:{peso};"
                           f"src:url(data:{a.get('mime', 'font/ttf')};base64,{a['data']});}}")
        return "".join(css)
