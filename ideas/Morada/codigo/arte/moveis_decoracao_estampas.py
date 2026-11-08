"""Estampas da decoração do Morada (artes dos quadros), desenhadas com PIL num atlas.

Uso: python3 -I moveis_decoracao_estampas.py <saida> [quadros] [id_arte ...]
Grava <saida>/quadros/estampas_quadros.png e estampas_quadros.json ({"grade": [colunas, linhas], "artes": {id: {"cel": [col, lin],
"aspecto": l/a}}}). O gerador (moveis_decoracao.py) lê o json para pôr o UV do miolo de cada quadro na célula certa.
Com ids, redesenha só essas artes (as outras células ficam como estavam no PNG).
As cores vêm da paleta de moveis_base.py (lida como texto, sem importar o Blender).
Os tapetes são feitos em geometria (faixas e anéis em relevo), então não têm estampa.
"""
import ast
import json
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFont

AQUI = os.path.dirname(os.path.abspath(__file__))
CEL = 384  # pixels por célula do atlas
SS = 3  # superamostragem (desenha grande e reduz: bordas lisas)


def _paleta():
    arv = ast.parse(open(os.path.join(AQUI, "moveis_base.py"), encoding="utf-8").read())
    for no in arv.body:
        if isinstance(no, ast.Assign) and getattr(no.targets[0], "id", "") == "CORES":
            return ast.literal_eval(no.value)
    raise RuntimeError("CORES não encontrada em moveis_base.py")


CORES = _paleta()


def c(nome):
    h = CORES[nome].lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


class Tela:
    """Desenho em coordenadas normalizadas: x de 0 a 1 (esquerda→direita), y de 0 a 1 (cima→baixo)."""

    def __init__(self, aspecto, fundo):
        self.W = CEL * SS
        self.H = int(round(CEL * SS / aspecto)) if aspecto >= 1 else CEL * SS
        if aspecto < 1:
            self.W = int(round(CEL * SS * aspecto))
        self.im = Image.new("RGB", (self.W, self.H), c(fundo))
        self.d = ImageDraw.Draw(self.im)

    def p(self, x, y):
        return (x * self.W, y * self.H)

    def ret(self, x0, y0, x1, y1, cor, raio=0):
        r = raio * min(self.W, self.H)
        box = [*self.p(x0, y0), *self.p(x1, y1)]
        if r:
            self.d.rounded_rectangle(box, r, fill=c(cor))
        else:
            self.d.rectangle(box, fill=c(cor))

    def circ(self, x, y, r, cor, contorno=None, larg=0.0):
        """r em fração da menor dimensão (círculo de verdade, qualquer aspecto)."""
        rr = r * min(self.W, self.H)
        cx, cy = self.p(x, y)
        box = [cx - rr, cy - rr, cx + rr, cy + rr]
        if contorno:
            self.d.ellipse(box, outline=c(contorno), width=max(1, int(larg * min(self.W, self.H))))
        else:
            self.d.ellipse(box, fill=c(cor))

    def elipse(self, x, y, rx, ry, cor):
        cx, cy = self.p(x, y)
        self.d.ellipse([cx - rx * self.W, cy - ry * self.H, cx + rx * self.W, cy + ry * self.H], fill=c(cor))

    def pol(self, pts, cor, contorno=None, larg=0.0):
        q = [self.p(x, y) for x, y in pts]
        if contorno:
            w = max(1, int(larg * min(self.W, self.H)))
            self.d.line(q + [q[0]], fill=c(contorno), width=w, joint="curve")
            for pt in q:
                self.d.ellipse([pt[0] - w / 2, pt[1] - w / 2, pt[0] + w / 2, pt[1] + w / 2], fill=c(contorno))
        else:
            self.d.polygon(q, fill=c(cor))

    def linha(self, pts, cor, larg):
        q = [self.p(x, y) for x, y in pts]
        w = max(1, int(larg * min(self.W, self.H)))
        self.d.line(q, fill=c(cor), width=w, joint="curve")
        for pt in (q[0], q[-1]):
            self.d.ellipse([pt[0] - w / 2, pt[1] - w / 2, pt[0] + w / 2, pt[1] + w / 2], fill=c(cor))

    def morro(self, y_base, pts_topo, cor):
        """Polígono que desce até a base da tela: pts_topo = [(x, y), ...] da esquerda para a direita."""
        self.pol([(pts_topo[0][0], 1.01)] + pts_topo + [(pts_topo[-1][0], 1.01)], cor)

    def onda(self, y, amp, freq, fase, cor, ate=1.01):
        n = 80
        pts = [(k / n, y + amp * math.sin(2 * math.pi * (freq * k / n) + fase)) for k in range(n + 1)]
        self.pol([(0, ate)] + pts + [(1, ate)], cor)

    def semicirculo(self, x, y, r, cor, para_cima=True):
        rr = r * min(self.W, self.H)
        cx, cy = self.p(x, y)
        box = [cx - rr, cy - rr, cx + rr, cy + rr]
        self.d.pieslice(box, 180 if para_cima else 0, 360 if para_cima else 180, fill=c(cor))

    def texto(self, s, x, y, alt, cor, sombra=None, desl=0.02):
        fonte = None
        for f in ("/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
                  "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf"):
            if os.path.exists(f):
                fonte = ImageFont.truetype(f, int(alt * self.H))
                break
        fonte = fonte or ImageFont.load_default()
        cx, cy = self.p(x, y)
        if sombra:
            dd = desl * min(self.W, self.H)
            self.d.text((cx + dd, cy + dd), s, font=fonte, fill=c(sombra), anchor="mm")
        self.d.text((cx, cy), s, font=fonte, fill=c(cor), anchor="mm")

    def imagem(self):
        return self.im.resize((CEL, CEL), Image.LANCZOS)


def estrela_pts(cx, cy, r, ri, n=5, rot=-90, asp=1.0):
    out = []
    for k in range(2 * n):
        a = math.radians(rot + 180 * k / n)
        rr = r if k % 2 == 0 else ri
        out.append((cx + rr * math.cos(a) / asp, cy + rr * math.sin(a)))
    return out


# ---------------------------------------------------------------------------------------------------------------------
# Artes (cada uma: aspecto largura/altura e função que desenha). Desenhos originais, planos e simples.
# ---------------------------------------------------------------------------------------------------------------------
ARTES = {}


def arte(nome, aspecto):
    def reg(fn):
        ARTES[nome] = (aspecto, fn)
        return fn
    return reg


@arte("montanhas_entardecer", 1.45)
def _a(t):
    t.ret(0, 0, 1, 1, "terracota_clara")
    t.ret(0, 0.58, 1, 1, "pessego")
    t.circ(0.74, 0.30, 0.13, "amarelo")
    t.morro(1, [(0, 0.78), (0.18, 0.46), (0.34, 0.74), (0.5, 0.82)], "lilas")
    t.morro(1, [(0.22, 1.0), (0.52, 0.40), (0.86, 1.0)], "azul_acinzentado")
    t.pol([(0.52, 0.40), (0.445, 0.53), (0.49, 0.51), (0.52, 0.55), (0.56, 0.51), (0.60, 0.535)], "branco")
    t.morro(1, [(0.6, 1.0), (0.84, 0.58), (1.0, 0.76)], "cinza_azulado")
    t.pol([(0.84, 0.58), (0.79, 0.66), (0.83, 0.645), (0.86, 0.68), (0.89, 0.64)], "branco")
    for x, y in ((0.2, 0.22), (0.27, 0.27)):
        t.linha([(x - 0.03, y - 0.02), (x, y + 0.005), (x + 0.03, y - 0.02)], "terracota_escura", 0.012)


@arte("mar_ilha_sol", 1.45)
def _a(t):
    t.ret(0, 0, 1, 1, "amarelo_claro")
    t.circ(0.30, 0.52, 0.17, "laranja")
    t.morro(1, [(0.42, 0.62), (0.62, 0.38), (0.72, 0.36), (0.95, 0.62)], "verde_agua")
    t.morro(1, [(0.7, 0.62), (0.86, 0.48), (1.0, 0.44)], "verde_medio")
    t.ret(0, 0.62, 1, 1, "azul_medio")
    for k, y in enumerate((0.70, 0.79, 0.88)):
        x0 = 0.08 + 0.17 * (k % 2)
        for j in range(3):
            xa = x0 + j * 0.32
            t.linha([(xa, y), (xa + 0.05, y - 0.02), (xa + 0.1, y)], "azul_claro", 0.016)


@arte("estrada_campo", 2.0)
def _a(t):
    t.ret(0, 0, 1, 1, "azul_celeste")
    for x, y, s in ((0.18, 0.18, 1.0), (0.66, 0.12, 0.8)):
        t.elipse(x, y, 0.06 * s, 0.07 * s, "branco")
        t.elipse(x + 0.05 * s, y + 0.02, 0.05 * s, 0.055 * s, "branco")
        t.elipse(x - 0.05 * s, y + 0.025, 0.04 * s, 0.045 * s, "branco")
    t.onda(0.48, 0.03, 1.2, 0.4, "verde_claro")
    t.onda(0.56, 0.02, 0.8, 2.0, "verde")
    est = [(0.62, 0.5), (0.64, 0.5), (0.70, 0.6), (0.60, 0.72), (0.66, 0.86), (0.84, 1.01), (0.52, 1.01),
           (0.44, 0.86), (0.48, 0.72), (0.60, 0.6)]
    t.pol(est, "grafite")
    t.linha([(0.63, 0.53), (0.64, 0.6), (0.555, 0.72), (0.58, 0.86), (0.66, 1.0)], "amarelo", 0.012)


@arte("formas_contorno", 0.72)
def _a(t):
    t.ret(0, 0, 1, 1, "lilas_claro")
    a = 0.2
    q = [(0.6 + a * math.cos(math.radians(20 + 90 * k)) / 0.72, 0.62 + a * math.sin(math.radians(20 + 90 * k)))
         for k in range(4)]
    t.pol(q, "vermelho_claro")
    t.pol(q, None, contorno="grafite_escuro", larg=0.035)
    t.circ(0.4, 0.38, 0.27, None, contorno="grafite_escuro", larg=0.035)
    t.circ(0.4, 0.38, 0.06, "grafite_escuro")


@arte("letras_lar", 1.4)
def _a(t):
    t.ret(0, 0, 1, 1, "creme_claro")
    t.texto("LAR", 0.5, 0.5, 0.42, "vermelho", sombra="vermelho_escuro", desl=0.03)
    t.ret(0.2, 0.8, 0.8, 0.83, "vermelho")


@arte("pedras_equilibrio", 0.7)
def _a(t):
    t.ret(0, 0, 1, 1, "cinza_claro")
    t.ret(0, 0.86, 1, 1, "cinza")
    t.elipse(0.5, 0.78, 0.36, 0.09, "cinza_medio")
    t.elipse(0.47, 0.62, 0.27, 0.075, "bege_escuro")
    t.elipse(0.53, 0.485, 0.19, 0.06, "cinza_azulado")
    t.elipse(0.49, 0.375, 0.12, 0.045, "areia")
    t.circ(0.75, 0.16, 0.08, "branco")


@arte("arcos_boho", 0.72)
def _a(t):
    t.ret(0, 0, 1, 1, "creme")
    for r, cor in ((0.40, "terracota"), (0.31, "pessego"), (0.22, "madeira_rosada"), (0.13, "creme")):
        t.semicirculo(0.5, 0.78, r, cor)
    t.ret(0, 0.78, 1, 1, "bege")
    t.circ(0.78, 0.16, 0.07, "mostarda")


@arte("silhueta_retrato", 0.72)
def _a(t):
    t.ret(0, 0, 1, 1, "azul_bebe")
    t.circ(0.5, 0.40, 0.30, "amarelo_claro")
    t.semicirculo(0.5, 1.0, 0.36, "grafite")
    t.ret(0.43, 0.6, 0.57, 0.75, "grafite", raio=0.02)
    t.circ(0.5, 0.45, 0.16, "grafite")


@arte("galhos_frutos", 0.72)
def _a(t):
    t.ret(0, 0, 1, 1, "chocolate")
    g = "verde_lima"
    t.linha([(0.35, 1.0), (0.42, 0.62), (0.30, 0.36), (0.36, 0.05)], g, 0.07)
    t.linha([(0.42, 0.62), (0.78, 0.38), (0.88, 0.14)], g, 0.06)
    t.linha([(0.30, 0.36), (0.12, 0.22)], g, 0.05)
    t.linha([(0.62, 0.49), (0.82, 0.72)], g, 0.05)
    for x, y in ((0.12, 0.17), (0.90, 0.10), (0.84, 0.77), (0.36, 0.04), (0.70, 0.30)):
        t.circ(x, y, 0.055, "amarelo")


@arte("dois_sois", 0.5)
def _a(t):
    t.ret(0, 0, 1, 1, "azul_acinzentado")
    t.circ(0.5, 0.40, 0.30, "amarelo")
    t.circ(0.5, 0.62, 0.38, "laranja")
    t.ret(0, 0.9, 1, 1, "azul_noite")


@arte("sol_dividido", 1.25)
def _a(t):
    t.ret(0, 0, 1, 1, "pessego")
    rr = 0.27 * min(t.W, t.H)
    cx, cy = t.p(0.5, 0.42)
    t.d.pieslice([cx - rr, cy - rr, cx + rr, cy + rr], 90, 270, fill=c("laranja_escuro"))
    t.d.pieslice([cx - rr, cy - rr, cx + rr, cy + rr], 270, 90, fill=c("verde_lima"))
    t.ret(0, 0.76, 1, 1, "laranja")


@arte("colinas_douradas", 1.25)
def _a(t):
    t.ret(0, 0, 1, 1, "mostarda")
    t.circ(0.75, 0.25, 0.1, "amarelo_claro")
    t.onda(0.55, 0.06, 1.0, 0.5, "verde")
    t.onda(0.72, 0.05, 1.3, 2.5, "verde_escuro")


@arte("pico_aurora", 1.2)
def _a(t):
    t.ret(0, 0, 1, 1, "laranja_claro")
    t.ret(0, 0, 1, 0.3, "amarelo_claro")
    t.circ(0.5, 0.42, 0.13, "vermelho_claro")
    t.morro(1, [(0, 0.85), (0.3, 0.42), (0.55, 0.8), (0.8, 0.5), (1.0, 0.7)], "verde_medio")
    t.morro(1, [(0, 0.9), (0.4, 0.68), (1.0, 0.92)], "petroleo")


@arte("estrela", 1.15)
def _a(t):
    t.ret(0, 0, 1, 1, "verde_medio")
    t.pol(estrela_pts(0.5, 0.53, 0.36, 0.16, asp=1.15), "amarelo")


@arte("faixa_mar", 3.2)
def _a(t):
    t.ret(0, 0, 1, 1, "azul_bebe")
    t.semicirculo(0.5, 0.62, 0.32, "laranja")
    t.ret(0, 0.62, 1, 1, "azul")
    t.ret(0.1, 0.75, 0.32, 0.8, "azul_claro")
    t.ret(0.6, 0.85, 0.85, 0.9, "azul_claro")


@arte("faixa_duna", 3.2)
def _a(t):
    t.ret(0, 0, 1, 1, "branco_gelo")
    t.morro(1, [(0.25, 0.75), (0.55, 0.28), (0.85, 0.75)], "mostarda")
    t.morro(1, [(0.45, 0.75), (0.7, 0.42), (0.95, 0.75)], "amarelo_escuro")
    t.ret(0, 0.72, 1, 1, "verde_escuro")


@arte("campo_faixas", 1.5)
def _a(t):
    t.ret(0, 0, 1, 1, "turquesa_claro")
    t.pol([(0, 0.48), (1, 0.32), (1, 1.01), (0, 1.01)], "verde_lima")
    t.pol([(0, 0.70), (1, 0.55), (1, 1.01), (0, 1.01)], "laranja")
    t.circ(0.2, 0.2, 0.09, "branco")


@arte("borboleta", 1.0)
def _a(t):
    t.ret(0, 0, 1, 1, "porcelana_azul")
    for s in (-1, 1):
        t.pol([(0.5, 0.42), (0.5 + s * 0.12, 0.2), (0.5 + s * 0.36, 0.16), (0.5 + s * 0.40, 0.3), (0.5 + s * 0.28, 0.5),
               (0.5, 0.52)], "azul_celeste")
        t.pol([(0.5, 0.5), (0.5 + s * 0.26, 0.52), (0.5 + s * 0.32, 0.7), (0.5 + s * 0.2, 0.8), (0.5 + s * 0.06, 0.7)],
              "azul")
        t.circ(0.5 + s * 0.24, 0.3, 0.05, "amarelo_claro")
        t.linha([(0.5, 0.3), (0.5 + s * 0.08, 0.15), (0.5 + s * 0.11, 0.13)], "azul_marinho", 0.012)
    t.elipse(0.5, 0.5, 0.025, 0.24, "azul_marinho")


@arte("quadro_no_quadro", 1.3)
def _a(t):
    t.ret(0, 0, 1, 1, "verde_lima")
    t.ret(0.26, 0.2, 0.74, 0.8, "verde_floresta", raio=0.02)
    t.ret(0.36, 0.33, 0.64, 0.67, "verde_claro", raio=0.02)


@arte("nascer_colina", 1.6)
def _a(t):
    t.ret(0, 0, 1, 1, "azul_celeste")
    t.circ(0.62, 0.56, 0.28, "vermelho")
    t.onda(0.6, 0.06, 0.6, 3.3, "verde")
    t.onda(0.82, 0.04, 1.1, 0.3, "verde_floresta")


def main():
    saida = sys.argv[1]
    resto = sys.argv[2:]
    if resto and resto[0] in ("quadros", "tapetes", "plantas"):
        if resto[0] != "quadros":
            print("só os quadros têm estampa (tapetes e plantas são geometria)")
            return
        resto = resto[1:]
    pasta = os.path.join(saida, "quadros")
    os.makedirs(pasta, exist_ok=True)
    nomes = list(ARTES)
    n = 5  # colunas
    m = math.ceil(len(nomes) / n)  # linhas
    png = os.path.join(pasta, "estampas_quadros.png")
    if resto and os.path.exists(png) and Image.open(png).size == (n * CEL, m * CEL):
        atlas = Image.open(png).convert("RGB")
    else:
        atlas = Image.new("RGB", (n * CEL, m * CEL), c("papel"))
        resto = []
    info = {"grade": [n, m], "artes": {}}
    for i, nome in enumerate(nomes):
        col, lin = i % n, i // n
        asp, fn = ARTES[nome]
        info["artes"][nome] = {"cel": [col, lin], "aspecto": asp}
        if resto and nome not in resto:
            continue
        t = Tela(asp, "papel")
        fn(t)
        atlas.paste(t.imagem(), (col * CEL, lin * CEL))
    atlas.save(png, optimize=True)
    json.dump(info, open(os.path.join(pasta, "estampas_quadros.json"), "w"), ensure_ascii=False, indent=1)
    print("estampas", png, len(nomes), "artes, grade", n, "x", m)


if __name__ == "__main__":
    main()
