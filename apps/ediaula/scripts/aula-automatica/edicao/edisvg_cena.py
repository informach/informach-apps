"""Cena de animação de conceito no style guide "Zero Kids · Kit de slides", para o EdiSVG.

Fundo Azul jogo, título em pílula branca e subtítulo por ideia, os blocos de verdade (recortados da gravação
com recortar.sh) em cartões da cor do Estúdio, destaque amarelo no lugar de seta, caixas de significado
(branca = termo, verde = reação com texto amarelo, numeradas, no máximo 3) e a faixa x >= 1320 livre para a
apresentadora. Os tempos são segundos da aula (a voz): a animação entra na aula de ini a fim.

Uso: veja exemplos/farol-a3p2-conceitos.py. Depois de salvar, confira com validar_svg.py e exporte o MP4
pelo condutor do EdiSVG (acoes/exportar-svg.mjs).

Direção de arte (Helena, 27/11/2026; REGRAS.md, seção 9). Quem escreve uma cena age como diretor de arte e
designer: a animação tem que ficar bonita, organizada e profissional, nunca feita de qualquer jeito.
- Um ponto de atenção por vez, alinhado numa grade: margem de 140 px, espaços iguais e respiro de 40 px.
- O conteúdo fica equilibrado na área livre à esquerda da apresentadora.
- As figuras do jogo ficam grandes o bastante para reconhecer, e o texto de apoio tem 30 px ou mais.
- Cada coisa entra na palavra que a anuncia, em sequência; o que não vale mais, sai.
- As peças comuns (rótulo, seta, anotação, anel, foco, selo, "+1") vêm do kit, kit_cena.py (REGRAS.md, seção 10).
- Antes de vincular, olhe os quadros em previa_cena.py e acerte o que estiver pequeno, desalinhado, vazio ou
  disputando atenção.
"""

import base64
import copy
import hashlib
import json
import os
import struct
import uuid

FPS = 30
# Artes comuns a todo curso, desenhadas com capricho (REGRAS.md, seção 10): as mãos do toque são os emojis do
# Noto Color Emoji (licença OFL), renderizados por artes/render_maos.py e recortados rente.
ARTES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "artes")
# Ponta do dedo de cada mão, em pixels do PNG, e o tamanho do PNG.
MAOS = {"mao-indicador": ((238, 6), (296, 479)), "mao-baixo": ((222, 458), (380, 464)),
        "mao-esquerda": ((6, 158), (465, 380)), "mao-direita": ((458, 157), (465, 380))}
AZUL_JOGO, TINTA, BRANCO, VERDE, AMARELO, NOITE = "#6E9BFF", "#0F1A33", "#FFFFFF", "#0B7A54", "#FFC02E", "#121A30"
# O azul do fundo das cenas (o mais claro do degradê de artes/fundo-cena.png): branco sobre ele passa de 4,5.
AZUL_FUNDO = "#3D6BE1"
AREA_ESTUDIO, AREA_GAVETA = "#E7EDF5", "#EEF2F8"
SUAVE = {"kind": "cubic-bezier", "points": [0.22, 1, 0.36, 1]}
VAIVEM = {"kind": "cubic-bezier", "points": [0.42, 0, 0.58, 1]}
# O EdiSVG recusa a peça cujos recursos passam de 4 MB ou 16 milhões de pixels (CATALOG_BYTES e IMAGE_PIXELS em
# packages/edi-motion/src/assets/limits.ts): "Catálogo excede orçamento de bytes" ao abrir, e o render nunca
# chega (Ilha A3P8, 23/11/2026, a cena do jogo pronto com doze artes de 600 × 800). A folga cobre o base64.
ORCAMENTO_BYTES, ORCAMENTO_PIXELS = 3_900_000, 15_500_000


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
        # O fundo com detalhes (artes/fundo-cena.png, de artes/fundo_cena.py): azul mais fundo que o antigo #6E9BFF,
        # para o texto branco passar de 4,5 de contraste (Helena, 27/11/2026), com ondas, nuvens e brilhos nas bordas.
        aid, fw, fh = self.imagem("fundo-cena")
        self.nos = [self.rect("Fundo · Azul jogo", 0, 0, 1920, 1080, AZUL_FUNDO),
                    {"id": nid(), "name": "Fundo · detalhes", "tag": "image", "assetId": aid,
                     "attrs": {"x": "0", "y": "0", "width": "1920", "height": "1080"}, "text": "", "children": [],
                     "transform": tf(), "visible": True, "locked": False}]
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
        # A pasta de blocos da parte primeiro; as artes comuns a todo curso (a mão do toque) ficam em artes/.
        caminho = f"{self.blocos}/{arq}.png"
        if not os.path.exists(caminho):
            caminho = os.path.join(ARTES, f"{arq}.png")
        dados = open(caminho, "rb").read()
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
            # Relativo à escala do próprio nó: um grupo em escala 0,4 entra de 0,28 a 0,42 e fica em 0,4.
            for p in ("sx", "sy"):
                e = no["transform"].get(p, 1)
                self.trilha(no, p, [(t0, 0.7 * e, SUAVE), (t0 + 0.28, 1.05 * e, VAIVEM), (t0 + 0.42, e, None)])
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

    def salvar(self, arq, refazer=False):
        """Salva <saida>/<arq>.edisvg. A peça já salva não é reescrita: depois de vinculada na aula ela é
        editada no EdiSVG, e o script apagaria o que foi feito lá (refazer=True ou AULA_REFAZER_CENAS=1
        reescreve). Os ids do projeto e da animação saem do nome do arquivo: refazer a cena mantém o vínculo
        com o clipe da aula."""
        os.makedirs(self.saida, exist_ok=True)
        caminho = f"{self.saida}/{arq}.edisvg"
        if os.path.exists(caminho) and not (refazer or os.environ.get("AULA_REFAZER_CENAS") == "1"):
            print(caminho, "| já existe: fica como está (edite no EdiSVG; AULA_REFAZER_CENAS=1 reescreve)")
            return caminho
        fixo = lambda tipo: f"{tipo}-{uuid.uuid5(uuid.NAMESPACE_URL, f'edisvg-cena:{arq}:{tipo}')}"
        self.d["id"] = fixo("project")
        self.cena["scene"]["viewBox"] = [0, 0, 1920, 1080]
        self.cena["scene"]["nodes"] = self.nos
        self.d["motion"] = {"version": self.d["motion"]["version"], "animations": [{
            "id": fixo("animation"), "name": self.nome, "fps": FPS, "frames": self.total,
            "mode": "once", "tracks": self.trilhas}]}
        self._caber_no_orcamento()
        json.dump(self.d, open(caminho, "w", encoding="utf8"), ensure_ascii=False)
        print(caminho, "| nós", len(self.nos), "| trilhas", len(self.trilhas), "| quadros", self.total,
              f"| {self.ini}-{self.fim}")
        return caminho

    def _escalas(self):
        """A maior escala de cada imagem na cena (pixels da cena por pixel do PNG): as escalas dos grupos acima
        dela, a fixa ou a maior das trilhas sx/sy (o pop passa um pouco de 1), vezes o tamanho da imagem sobre o
        do PNG."""
        nas_trilhas = {}
        for t in self.trilhas:
            if t["property"] in ("sx", "sy") and t["keys"]:
                v = max(abs(k["value"]) for k in t["keys"])
                nas_trilhas[t["targetId"]] = max(nas_trilhas.get(t["targetId"], 0), v)
        largura = {a["id"]: a["width"] for a in self.d["assets"] if a["kind"] == "image"}
        escalas = {}

        def desce(no, s):
            tr = no.get("transform") or {}
            s *= max(abs(tr.get("sx", 1)), abs(tr.get("sy", 1)), nas_trilhas.get(no["id"], 0))
            aid = no.get("assetId")
            if no.get("tag") == "image" and aid in largura:
                w = float(no.get("attrs", {}).get("width", largura[aid]))
                escalas[aid] = max(escalas.get(aid, 0), s * w / largura[aid])
            for f in no.get("children", []):
                desce(f, s)

        for no in self.nos:
            desce(no, 1)
        return escalas

    def _caber_no_orcamento(self):
        """Com os recursos acima do que o EdiSVG abre, reduz cada PNG ao tamanho em que ele aparece na cena de
        1920 × 1080 (o render tem esse tamanho: nada se perde no vídeo). Se ainda não couber, reduz todos um
        pouco mais e avisa. A imagem guarda a largura e a altura na cena; só o PNG fica menor."""
        imagens = [a for a in self.d["assets"] if a["kind"] == "image"]
        fixo = sum(a["byteLength"] for a in self.d["assets"] if a["kind"] != "image")
        bytes_ = lambda lista: fixo + sum(a["byteLength"] for a in lista)
        pixels = lambda lista: sum(a["width"] * a["height"] for a in lista)
        if bytes_(imagens) <= ORCAMENTO_BYTES and pixels(imagens) <= ORCAMENTO_PIXELS:
            return
        import io

        from PIL import Image

        escalas = self._escalas()
        originais = {a["id"]: Image.open(io.BytesIO(base64.b64decode(a["data"]))).convert("RGBA") for a in imagens}
        folga = 1.0
        while True:
            novas = []
            for a in imagens:
                im, s = originais[a["id"]], min(1.0, escalas.get(a["id"], 1.0) * folga)
                if s >= 0.98:
                    novas.append(a)
                    continue
                w, h = max(1, round(im.width * s)), max(1, round(im.height * s))
                # Com o alfa pré-multiplicado, a borda recortada não ganha um halo escuro ao reduzir.
                menor = im.convert("RGBa").resize((w, h), Image.LANCZOS).convert("RGBA")
                buf = io.BytesIO()
                menor.save(buf, "PNG", optimize=True)
                dados = buf.getvalue()
                novas.append({**a, "id": "asset-" + hashlib.sha256(dados).hexdigest(), "byteLength": len(dados),
                              "data": base64.b64encode(dados).decode(), "width": w, "height": h})
            if (bytes_(novas) <= ORCAMENTO_BYTES and pixels(novas) <= ORCAMENTO_PIXELS) or folga < 0.3:
                break
            folga *= 0.85
        troca = {a["id"]: n["id"] for a, n in zip(imagens, novas)}

        def renomeia(no):
            if no.get("assetId") in troca:
                no["assetId"] = troca[no["assetId"]]
            for f in no.get("children", []):
                renomeia(f)

        for no in self.nos:
            renomeia(no)
        vistos, catalogo = set(), []
        for a in [a for a in self.d["assets"] if a["kind"] != "image"] + novas:
            if a["id"] not in vistos:
                vistos.add(a["id"])
                catalogo.append(a)
        antes = bytes_(imagens)
        self.d["assets"] = catalogo
        print(f"{self.nome}: imagens reduzidas ao tamanho em que aparecem, {antes / 1e6:.1f} -> "
              f"{bytes_(novas) / 1e6:.1f} MB (o EdiSVG abre até 4 MB)"
              + ("" if folga == 1.0 else f"; AVISO: abaixo do tamanho na tela ({folga:.0%}), confira a nitidez"))
        if bytes_(novas) > ORCAMENTO_BYTES or pixels(novas) > ORCAMENTO_PIXELS:
            raise SystemExit(f"{self.nome}: os recursos não cabem no EdiSVG nem reduzidos; tire imagens da cena")




def mao_toque(c, toques, t0, t1, altura=220, nome="Mão"):
    """A mão de desenho (punho com o indicador para cima, nunca um dedo comprido sozinho) que toca cada ponto.

    toques: [(t, x, y)] em ordem; a ponta do dedo chega em (x, y) no segundo t, aperta e sobe um pouco. A mão entra
    de baixo antes do primeiro toque, vai de um ponto ao seguinte e sai com fade em t1. altura: altura da mão em px.
    """
    (px, py), (w, h) = MAOS["mao-indicador"]
    s = altura / h
    img_aid, _, _ = c.imagem("mao-indicador")
    img = {"id": nid(), "name": "mão", "tag": "image", "assetId": img_aid,
           "attrs": {"x": "0", "y": "0", "width": str(w), "height": str(h)},
           "text": "", "children": [], "transform": tf(-px, -py), "visible": True, "locked": False}
    t_1, x_1, y_1 = toques[0]
    g = c.grupo(nome, x_1 + 40, y_1 + altura, [img], op=0, s=s)
    c.nos.append(g)
    c.trilha(g, "opacity", [(t0, 0, None), (t0 + 0.25, 100, None), (t1 - 0.25, 100, None), (t1, 0, None)])
    xs, ys, ss = [(t0, x_1 + 40, SUAVE)], [(t0, y_1 + altura, SUAVE)], [(t0, s, None)]
    for k, (t, x, y) in enumerate(toques):
        # Chega um pouco acima do ponto, desce e aperta (encolhe 6 %), e volta a subir 30 px.
        chega = max(t - 0.35, (toques[k - 1][0] + 0.3) if k else t0 + 0.2)
        xs += [(chega, x, VAIVEM), (t + 0.3, x, VAIVEM)]
        ys += [(chega, y + 24, VAIVEM), (t, y, VAIVEM), (t + 0.3, y + 30, VAIVEM)]
        ss += [(t - 0.05, s, VAIVEM), (t + 0.08, s * 0.94, VAIVEM), (t + 0.25, s, None)]
    c.trilha(g, "x", xs)
    c.trilha(g, "y", ys)
    c.trilha(g, "sx", ss)
    c.trilha(g, "sy", ss)
    return g
