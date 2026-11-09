"""Desenhos dos ícones 2D do Morada (SVG puro, sem Blender).

Estilo (vale para todos os ícones e para as folhas de efeitos):
- Caixa de 128 × 128 (viewBox), contorno sempre na mesma cor (TINTA, o grafite escuro da paleta), traço redondo.
- Cada ícone vem numa ficha com contorno grosso: assim ele lê sobre a cena de dia (o contorno escuro) e de noite (o
  preenchimento claro ou saturado). Necessidades, interações e marcador usam ficha redonda; a interface usa a ficha
  quadrada boleada creme; os humores são o próprio rostinho.
- Cores só da paleta de moveis_base.py (CORES), lida do arquivo sem importar o Blender.
- Brilho branco no alto à esquerda e sombra em meia-lua embaixo, iguais em todas as fichas.
- Espessuras: ficha 6, desenho 4,5 (a 64 px dão 3 e 2,25 px). Nada de detalhe mais fino que 3 px a 128.

Cada desenho é uma função que devolve o miolo do SVG; `svg(id)` monta o arquivo inteiro.
"""
import ast
import math
import os
import re

AQUI = os.path.dirname(os.path.abspath(__file__))


def _le_cores():
    src = open(os.path.join(AQUI, "moveis_base.py"), encoding="utf-8").read()
    for no in ast.parse(src).body:
        if isinstance(no, ast.Assign) and getattr(no.targets[0], "id", None) == "CORES":
            return ast.literal_eval(no.value)
    raise RuntimeError("CORES não encontrada em moveis_base.py")


C = _le_cores()
TINTA = C["grafite_escuro"]
BRANCO = C["branco"]
W = 4.5     # traço do desenho
WF = 6      # traço da ficha
_K = 1.0    # escala do desenho dentro da ficha (o traço é compensado para sair sempre com a mesma espessura)


def _w(w):
    return w / _K


# ---------------------------------------------------------------------------------------------------------------------
# cores
# ---------------------------------------------------------------------------------------------------------------------
def _rgb(h):
    h = h.lstrip("#")
    return [int(h[i:i + 2], 16) for i in (0, 2, 4)]


def mistura(a, b, t):
    ra, rb = _rgb(a), _rgb(b)
    return "#%02X%02X%02X" % tuple(round(ra[i] + (rb[i] - ra[i]) * t) for i in range(3))


def escuro(c, t=0.2):
    return mistura(c, "#14161B", t)


def claro(c, t=0.35):
    return mistura(c, "#FFFFFF", t)


# ---------------------------------------------------------------------------------------------------------------------
# primitivas
# ---------------------------------------------------------------------------------------------------------------------
def _f(v):
    s = ("%.2f" % v).rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def P(d, cx=0.0, cy=0.0, s=1.0, sy=None):
    """Transforma um caminho com comandos absolutos (M L H V C Q A Z): escala s e desloca para (cx, cy).
    O traço não muda de espessura (o caminho é reescrito, não leva transform)."""
    sy = s if sy is None else sy
    toks = re.findall(r"[MLHVCQSAZ]|-?\d*\.?\d+(?:e-?\d+)?", d)
    out, i, cmd = [], 0, None
    while i < len(toks):
        t = toks[i]
        if t.isalpha():
            cmd = t
            out.append(t)
            i += 1
            continue
        if cmd in "MLCQS":
            out += [_f(float(toks[i]) * s + cx), _f(float(toks[i + 1]) * sy + cy)]
            i += 2
        elif cmd == "H":
            out.append(_f(float(t) * s + cx))
            i += 1
        elif cmd == "V":
            out.append(_f(float(t) * sy + cy))
            i += 1
        elif cmd == "A":
            rx, ry, rot, la, sw, x, y = (float(v) for v in toks[i:i + 7])
            out += [_f(rx * s), _f(ry * sy), _f(rot), str(int(la)), str(int(sw)), _f(x * s + cx), _f(y * sy + cy)]
            i += 7
        else:
            raise ValueError(d)
    return " ".join(out)


def st(w=W, cor=TINTA):
    return f'stroke="{cor}" stroke-width="{_f(_w(w))}" stroke-linejoin="round" stroke-linecap="round"'


def g(conteudo, w=W, extra=""):
    return f'<g {st(w)} {extra}>{conteudo}</g>'


def circ(cx, cy, r, cor, contorno=True, op=None, w=None):
    o = f' opacity="{op}"' if op is not None else ""
    s = "" if contorno else ' stroke="none"'
    ww = f' stroke-width="{_f(_w(w))}"' if w is not None else ""
    return f'<circle cx="{_f(cx)}" cy="{_f(cy)}" r="{_f(r)}" fill="{cor}"{s}{ww}{o}/>'


def elip(cx, cy, rx, ry, cor, rot=0, contorno=True, op=None):
    o = f' opacity="{op}"' if op is not None else ""
    s = "" if contorno else ' stroke="none"'
    t = f' transform="rotate({_f(rot)} {_f(cx)} {_f(cy)})"' if rot else ""
    return f'<ellipse cx="{_f(cx)}" cy="{_f(cy)}" rx="{_f(rx)}" ry="{_f(ry)}" fill="{cor}"{t}{s}{o}/>'


def ret(x, y, w, h, cor, r=0, rot=None, contorno=True, op=None):
    o = f' opacity="{op}"' if op is not None else ""
    s = "" if contorno else ' stroke="none"'
    t = f' transform="rotate({_f(rot[0])} {_f(rot[1])} {_f(rot[2])})"' if rot else ""
    return f'<rect x="{_f(x)}" y="{_f(y)}" width="{_f(w)}" height="{_f(h)}" rx="{_f(r)}" fill="{cor}"{t}{s}{o}/>'


def cam(d, cor="none", contorno=True, op=None, w=None, extra=""):
    o = f' opacity="{op}"' if op is not None else ""
    s = "" if contorno else ' stroke="none"'
    ww = f' stroke-width="{_f(_w(w))}"' if w is not None else ""
    return f'<path d="{d}" fill="{cor}"{s}{ww}{o} {extra}/>'


def linha(pts, w=None, cor=None):
    d = "M" + " L".join(f"{_f(x)} {_f(y)}" for x, y in pts)
    ww = f' stroke-width="{_f(_w(w))}"' if w is not None else ""
    cc = f' stroke="{cor}"' if cor else ""
    return f'<path d="{d}" fill="none"{ww}{cc}/>'


def brilho(cx, cy, rx, ry, rot=-30, op=0.45):
    return elip(cx, cy, rx, ry, "#FFFFFF", rot=rot, contorno=False, op=op)


# formas normalizadas (centro 0,0, ~2 de largura): usar com P(..., cx, cy, s)
CORACAO = ("M0 0.92 C-0.18 0.78 -1 0.3 -1 -0.28 C-1 -0.72 -0.66 -0.98 -0.32 -0.98 C-0.12 -0.98 0 -0.86 0 -0.68 "
           "C0 -0.86 0.12 -0.98 0.32 -0.98 C0.66 -0.98 1 -0.72 1 -0.28 C1 0.3 0.18 0.78 0 0.92 Z")
GOTA = "M0 -1 C0.3 -0.55 0.72 -0.1 0.72 0.32 C0.72 0.74 0.4 1 0 1 C-0.4 1 -0.72 0.74 -0.72 0.32 C-0.72 -0.1 -0.3 -0.55 0 -1 Z"
NUVEM = ("M-0.62 0.5 C-0.98 0.5 -1.05 0.02 -0.72 -0.1 C-0.78 -0.52 -0.3 -0.72 -0.08 -0.44 C0.06 -0.86 0.7 -0.8 0.66 -0.3 "
         "C1.02 -0.3 1.08 0.5 0.62 0.5 Z")
ESTRELA4 = "M0 -1 C0.1 -0.3 0.3 -0.1 1 0 C0.3 0.1 0.1 0.3 0 1 C-0.1 0.3 -0.3 0.1 -1 0 C-0.3 -0.1 -0.1 -0.3 0 -1 Z"


def estrela5(cx, cy, r, ri=None, rot=-90):
    ri = r * 0.48 if ri is None else ri
    pts = []
    for k in range(10):
        a = math.radians(rot + k * 36)
        rr = r if k % 2 == 0 else ri
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    # cantos boleados: curva quadrática por ponto
    d = ""
    n = len(pts)
    for k in range(n):
        p0, p1, p2 = pts[k - 1], pts[k], pts[(k + 1) % n]
        a = (p1[0] + (p0[0] - p1[0]) * 0.18, p1[1] + (p0[1] - p1[1]) * 0.18)
        b = (p1[0] + (p2[0] - p1[0]) * 0.18, p1[1] + (p2[1] - p1[1]) * 0.18)
        d += ("M" if k == 0 else "L") + f"{_f(a[0])} {_f(a[1])} Q{_f(p1[0])} {_f(p1[1])} {_f(b[0])} {_f(b[1])} "
    return d + "Z"


def coracao(cx, cy, s, cor, op=None):
    return cam(P(CORACAO, cx, cy, s), cor, op=op)


def gota(cx, cy, s, cor):
    return cam(P(GOTA, cx, cy, s), cor)


def pessoa(cx, cy, s, cor, pele=None, cabelo=None):
    """Busto: cabeça e ombros. (cx, cy) é o centro da cabeça; s=1 dá cabeça de raio 11."""
    pele = pele or C["pessego"]
    ombro = P("M-21 37 C-21 18 -12 13 0 13 C12 13 21 18 21 37 Z", cx, cy, s)
    out = cam(ombro, cor) + circ(cx, cy, 11 * s, pele)
    if cabelo:
        out += cam(P("M-11 -1 C-12 -10 -6 -12 0 -12 C7 -12 12 -9 11 -1 C7 -6 -6 -7 -11 -1 Z", cx, cy, s), cabelo)
    return out


def zz(x, y, s, cor=BRANCO):
    d = P("M-6 -6 H6 L-6 6 H6", x, y, s)
    return f'<path d="{d}" fill="none" stroke="{TINTA}" stroke-width="{_f(_w(W + 4))}"/>' \
           f'<path d="{d}" fill="none" stroke="{cor}" stroke-width="{_f(_w(W))}"/>'


def faisca(cx, cy, s, cor=None):
    return cam(P(ESTRELA4, cx, cy, s), cor or C["amarelo"])


# ---------------------------------------------------------------------------------------------------------------------
# fichas
# ---------------------------------------------------------------------------------------------------------------------
def ficha_redonda(cor):
    s = escuro(cor, 0.22)
    return (f'<circle cx="64" cy="64" r="60" fill="none" stroke="#FFFFFF" stroke-width="3" opacity=".55"/>'
            f'<circle cx="64" cy="64" r="56" fill="{cor}"/>'
            f'<path d="M8.14 60 A56 56 0 1 0 119.86 60 A56 56 0 0 1 8.14 60 Z" fill="{s}" opacity=".5"/>'
            f'<ellipse cx="42" cy="30" rx="20" ry="9" transform="rotate(-32 42 30)" fill="#fff" opacity=".42"/>'
            f'<circle cx="64" cy="64" r="56" fill="none" {st(WF)}/>')


def ficha_quadrada(cor):
    s = escuro(cor, 0.16)
    return (f'<rect x="4" y="4" width="120" height="120" rx="34" fill="none" stroke="#FFFFFF" stroke-width="3" opacity=".55"/>'
            f'<rect x="8" y="8" width="112" height="112" rx="30" fill="{cor}"/>'
            f'<path d="M8 86 Q8 120 38 120 H90 Q120 120 120 86 V80 Q120 112 90 112 H38 Q8 112 8 80 Z" fill="{s}" '
            f'opacity=".55"/>'
            f'<ellipse cx="36" cy="25" rx="16" ry="6" transform="rotate(-20 36 25)" fill="#fff" opacity=".7"/>'
            f'<rect x="8" y="8" width="112" height="112" rx="30" fill="none" {st(WF)}/>')


# ---------------------------------------------------------------------------------------------------------------------
# NECESSIDADES (as do documento: fome, energia, bexiga, higiene, social, diversão; bebês: conforto, fralda, vínculo)
# ---------------------------------------------------------------------------------------------------------------------
NEC_COR = {"fome": C["laranja"], "energia": C["azul_medio"], "bexiga": C["turquesa"], "higiene": C["azul_celeste"],
           "social": C["rosa"], "diversao": C["violeta"], "conforto": C["lilas"], "fralda": C["verde_agua"],
           "vinculo": C["vermelho_claro"]}


def d_fome():
    osso = (ret(76, 64, 12, 30, BRANCO, r=5, rot=(-45, 82, 79)) + circ(96, 86, 8, BRANCO) + circ(88, 95, 8, BRANCO) +
            ret(77, 68, 10, 16, BRANCO, r=3, rot=(-45, 82, 76), contorno=False))
    carne = elip(55, 56, 29, 23, C["madeira_mel"], rot=-45)
    marcas = linha([(42, 58), (50, 50)], w=4, cor=escuro(C["madeira_mel"], 0.3)) + \
        linha([(52, 66), (60, 58)], w=4, cor=escuro(C["madeira_mel"], 0.3))
    return g(osso + carne + marcas + brilho(46, 44, 10, 5, rot=-45, op=0.6))


def d_energia():
    raio = "M72 18 L36 70 H59 L50 110 L92 52 H68 L82 18 Z"
    return g(cam(raio, C["amarelo"]) + linha([(70, 28), (50, 60)], w=4, cor="#FFF6C8"))


def d_bexiga():
    agua = C["agua"]
    return g(ret(38, 22, 52, 28, BRANCO, r=8) + circ(64, 36, 4.5, C["cinza_claro"]) +
             cam("M32 62 C32 86 46 94 52 96 L50 106 H78 L76 96 C82 94 96 86 96 62 Z", BRANCO) +
             elip(64, 62, 33, 11, BRANCO) + elip(64, 62, 22, 5.5, agua) +
             linha([(44, 76), (48, 86)], w=3.5, cor=C["cinza_claro"]))


def bolha(cx, cy, r):
    return circ(cx, cy, r, claro(C["azul_bebe"], 0.3)) + \
        elip(cx - r * 0.35, cy - r * 0.35, r * 0.32, r * 0.2, "#FFFFFF", rot=-40, contorno=False)


def d_higiene():
    sab = C["rosa_bebe"]
    return g(ret(26, 58, 62, 36, escuro(sab, 0.12), r=13, rot=(-14, 57, 76)) +
             ret(28, 56, 58, 28, sab, r=11, rot=(-14, 57, 70)) +
             ret(40, 62, 26, 8, "#FFFFFF", r=4, rot=(-14, 53, 66), contorno=False, op=0.6) +
             bolha(86, 44, 15) + bolha(62, 32, 9) + bolha(100, 72, 8))


def d_social():
    return g(pessoa(46, 52, 1.0, C["amarelo_claro"], cabelo=C["marrom"]) +
             pessoa(80, 58, 1.08, BRANCO, cabelo=C["madeira_escura"]))


def d_diversao():
    bal = C["amarelo"]
    return g(cam("M64 92 C58 100 72 104 66 112", "none") +
             cam("M58 88 L64 80 L70 88 Z", escuro(bal, 0.1)) +
             elip(64, 52, 26, 30, bal) + brilho(54, 38, 7, 11, rot=20, op=0.7) +
             faisca(98, 36, 9, BRANCO) + faisca(28, 74, 7, C["rosa_claro"]))


def d_conforto():
    alm = C["creme_claro"]
    corpo = "M28 34 Q64 24 100 34 Q110 64 100 96 Q64 106 28 96 Q18 64 28 34 Z"
    return g(cam(corpo, alm) + linha([(36, 42), (58, 60)], w=3.5) + linha([(92, 42), (70, 60)], w=3.5) +
             linha([(36, 88), (58, 70)], w=3.5) + linha([(92, 88), (70, 70)], w=3.5) + circ(64, 65, 6, C["lilas"]) +
             brilho(44, 44, 9, 4, op=0.8))


def d_fralda():
    return g(cam("M26 40 H102 V50 C102 76 86 96 64 96 C42 96 26 76 26 50 Z", BRANCO) +
             ret(26, 38, 76, 13, C["azul_claro"], r=5) + ret(20, 44, 14, 16, C["amarelo"], r=4) +
             ret(94, 44, 14, 16, C["amarelo"], r=4) + coracao(64, 70, 9, C["rosa"]) +
             cam("M44 92 C50 84 50 72 40 66", "none", w=3.5) + cam("M84 92 C78 84 78 72 88 66", "none", w=3.5))


def d_vinculo():
    mao = C["pessego"]
    return g(coracao(64, 44, 22, C["vermelho"]) + brilho(52, 33, 6, 3, op=0.7) +
             cam("M20 74 C30 70 40 76 46 82 H70 C78 82 78 92 70 92 H54 M70 92 C86 92 96 84 108 72 V98 "
                 "C96 108 82 112 64 112 H20 Z", mao))


# ---------------------------------------------------------------------------------------------------------------------
# HUMORES (rostinhos). Os 9 do documento + 5 pedidos a mais
# ---------------------------------------------------------------------------------------------------------------------
HUM_COR = {"alegre": C["amarelo"], "tranquilo": C["menta"], "focado": C["azul_celeste"], "inspirado": C["laranja_claro"],
           "triste": C["azul_claro"], "irritado": C["vermelho"], "tenso": C["lilas"], "envergonhado": C["rosa"],
           "apaixonado": C["rosa_bebe"], "entediado": C["cinza_claro"], "confiante": C["verde_claro"],
           "com_sono": C["azul_acinzentado"], "brincalhao": C["laranja"], "enjoado": C["verde_lima"]}


def rosto(cor, miolo, extra_fundo=""):
    s = escuro(cor, 0.2)
    return (extra_fundo +
            f'<circle cx="64" cy="66" r="54" fill="none" stroke="#FFFFFF" stroke-width="3" opacity=".55"/>'
            f'<circle cx="64" cy="66" r="50" fill="{cor}"/>'
            f'<path d="M14.6 62 A50 50 0 1 0 113.4 62 A50 50 0 0 1 14.6 62 Z" fill="{s}" opacity=".45"/>'
            f'<ellipse cx="44" cy="36" rx="16" ry="7" transform="rotate(-30 44 36)" fill="#fff" opacity=".5"/>'
            f'<circle cx="64" cy="66" r="50" fill="none" {st(WF)}/>' + g(miolo))


def olho(cx, cy, r=6):
    return circ(cx, cy, r, TINTA, contorno=False) + circ(cx - r * 0.3, cy - r * 0.35, r * 0.35, "#FFFFFF", contorno=False)


def bochechas(cor=None, op=0.55):
    c = cor or C["rosa_escuro"]
    return elip(36, 80, 9, 5.5, c, contorno=False, op=op) + elip(92, 80, 9, 5.5, c, contorno=False, op=op)


def d_alegre():
    return rosto(HUM_COR["alegre"], olho(46, 58) + olho(82, 58) + bochechas() +
                 cam("M42 76 Q64 102 86 76 Z", C["vermelho_escuro"]) + cam("M52 90 Q64 84 76 90 Q64 98 52 90 Z",
                                                                            C["rosa"], contorno=False))


def d_tranquilo():
    return rosto(HUM_COR["tranquilo"], cam("M38 60 Q46 52 54 60", w=5) + cam("M74 60 Q82 52 90 60", w=5) +
                 bochechas(op=0.35) + cam("M50 80 Q64 90 78 80", w=5))


def d_focado():
    return rosto(HUM_COR["focado"], linha([(36, 46), (56, 52)], w=5.5) + linha([(92, 46), (72, 52)], w=5.5) +
                 olho(47, 62, 5.5) + olho(81, 62, 5.5) + linha([(52, 86), (76, 86)], w=5) +
                 cam("M98 30 L104 24", w=4) + cam("M104 40 L112 38", w=4))


def d_inspirado():
    return rosto(HUM_COR["inspirado"],
                 cam(estrela5(46, 60, 10), C["amarelo"]) + cam(estrela5(82, 60, 10), C["amarelo"]) +
                 cam("M46 80 Q64 98 82 80 Z", C["vermelho_escuro"]) +
                 cam(P(ESTRELA4, 102, 22, 14), C["amarelo"]) + cam(P(ESTRELA4, 22, 28, 8), BRANCO))


def d_triste():
    return rosto(HUM_COR["triste"], cam("M38 52 Q46 46 54 50", w=4.5) + cam("M90 52 Q82 46 74 50", w=4.5) +
                 olho(47, 62, 5.5) + olho(81, 62, 5.5) + cam("M48 90 Q64 76 80 90", w=5) +
                 gota(36, 82, 8, C["azul_celeste"]))


def d_irritado():
    vapor = cam(P(NUVEM, 100, 24, 15), BRANCO)
    return rosto(HUM_COR["irritado"], linha([(34, 46), (56, 56)], w=6) + linha([(94, 46), (72, 56)], w=6) +
                 olho(47, 64, 5.5) + olho(81, 64, 5.5) + cam("M44 92 Q64 76 84 92", w=5.5) + vapor)


def d_tenso():
    return rosto(HUM_COR["tenso"], olho(46, 58, 6.5) + olho(82, 58, 6.5) + cam("M40 48 L54 44", w=4) +
                 cam("M88 48 L74 44", w=4) +
                 cam("M40 84 Q46 78 52 84 Q58 90 64 84 Q70 78 76 84 Q82 90 88 84", w=4.5) +
                 gota(102, 44, 10, C["azul_bebe"]))


def d_envergonhado():
    return rosto(HUM_COR["envergonhado"], cam("M40 60 Q47 55 54 60", w=5) + cam("M74 60 Q81 55 88 60", w=5) +
                 elip(38, 76, 12, 7, C["vermelho"], contorno=False, op=0.6) +
                 elip(90, 76, 12, 7, C["vermelho"], contorno=False, op=0.6) +
                 linha([(32, 74), (36, 70)], w=3) + linha([(40, 76), (44, 72)], w=3) +
                 linha([(84, 74), (88, 70)], w=3) + linha([(92, 76), (96, 72)], w=3) +
                 cam("M54 88 Q59 84 64 88 Q69 92 74 88", w=4.5))


def d_apaixonado():
    return rosto(HUM_COR["apaixonado"], coracao(46, 60, 11, C["vermelho"]) + coracao(82, 60, 11, C["vermelho"]) +
                 bochechas() + cam("M46 80 Q64 96 82 80", w=5) + coracao(104, 26, 9, C["rosa_escuro"]))


def d_entediado():
    return rosto(HUM_COR["entediado"],
                 cam("M36 58 H56", w=5) + cam("M40 58 A7 6 0 0 0 52 58 Z", TINTA) +
                 cam("M72 58 H92", w=5) + cam("M76 58 A7 6 0 0 0 88 58 Z", TINTA) +
                 linha([(50, 86), (78, 84)], w=5))


def d_confiante():
    oc = (cam("M30 52 H98 L94 60 Q92 72 80 72 Q68 72 66 60 H62 Q60 72 48 72 Q36 72 34 60 Z", C["grafite"]) +
          linha([(40, 58), (46, 54)], w=3, cor="#FFFFFF") + linha([(72, 58), (78, 54)], w=3, cor="#FFFFFF"))
    return rosto(HUM_COR["confiante"], oc + cam("M48 86 Q66 96 82 82", w=5) + cam(P(ESTRELA4, 104, 92, 9), BRANCO))


def d_com_sono():
    return rosto(HUM_COR["com_sono"], cam("M38 62 Q46 68 54 62", w=5) + cam("M74 62 Q82 68 90 62", w=5) +
                 elip(64, 86, 7, 8, C["vinho"]) + zz(96, 32, 1.1) + zz(110, 16, 0.75))


def d_brincalhao():
    return rosto(HUM_COR["brincalhao"], olho(46, 58, 6) + cam("M74 58 Q82 50 90 58", w=5) + bochechas() +
                 cam("M42 78 Q64 92 86 78", w=5) + cam("M58 84 V96 Q64 104 70 96 V86", C["rosa_escuro"]))


def d_enjoado():
    esp = (cam("M38 60 Q42 52 48 58 Q52 64 46 66 Q40 66 42 60", w=3.5) +
           cam("M80 60 Q84 52 90 58 Q94 64 88 66 Q82 66 84 60", w=3.5))
    return rosto(HUM_COR["enjoado"], esp + cam("M42 86 Q48 80 54 86 Q60 92 66 86 Q72 80 78 86 Q84 92 88 86", w=4.5) +
                 elip(34, 76, 7, 4, C["verde_medio"], contorno=False, op=0.5) +
                 elip(94, 76, 7, 4, C["verde_medio"], contorno=False, op=0.5) + gota(100, 36, 8, C["azul_bebe"]))


# ---------------------------------------------------------------------------------------------------------------------
# INTERAÇÕES (ficha redonda; a cor da ficha é a do grupo)
# ---------------------------------------------------------------------------------------------------------------------
GRUPO_COR = {"social": C["rosa"], "corpo": C["laranja"], "sono": C["azul_medio"], "banho": C["azul_celeste"],
             "banheiro": C["turquesa"], "casa": C["verde"], "trabalho": C["azul"], "lazer": C["violeta"],
             "bicho": C["madeira_mel"], "bebe": C["lilas"]}


def balao_fala(x, y, w, h, cor, rabo="esq"):
    r = h / 2
    if rabo == "esq":
        rb = f"M{_f(x + w * 0.22)} {_f(y + h - 2)} L{_f(x + w * 0.12)} {_f(y + h + 12)} L{_f(x + w * 0.42)} {_f(y + h - 2)}"
    else:
        rb = f"M{_f(x + w * 0.58)} {_f(y + h - 2)} L{_f(x + w * 0.88)} {_f(y + h + 12)} L{_f(x + w * 0.78)} {_f(y + h - 2)}"
    return cam(rb + " Z", cor) + ret(x, y, w, h, cor, r=r) + \
        ret(x + w * 0.2, y + h - 6, w * 0.25, 8, cor, contorno=False)


def d_conversar():
    return g(balao_fala(20, 26, 56, 36, BRANCO, "esq") + circ(36, 44, 3.5, TINTA, False) + circ(48, 44, 3.5, TINTA, False) +
             circ(60, 44, 3.5, TINTA, False) + balao_fala(52, 58, 56, 34, C["amarelo_claro"], "dir") +
             cam("M66 74 H94", w=4.5))


def d_abracar():
    pele = C["pessego"]
    return g(pessoa(46, 50, 1.0, C["amarelo_claro"], cabelo=C["marrom"]) +
             pessoa(82, 50, 1.0, C["azul_claro"], cabelo=C["madeira_escura"]) +
             cam("M34 82 C46 70 74 70 92 66 Q100 66 100 72 Q98 78 90 78 C76 80 56 84 44 92 Z", pele) +
             cam("M94 82 C84 74 70 76 60 80 Q54 82 56 88 Q60 92 66 88 C74 86 84 86 92 92 Z", pele) +
             coracao(64, 24, 10, C["vermelho"]))


def d_beijar():
    labio = C["vermelho"]
    return g(cam("M24 66 C34 52 48 46 56 52 Q64 56 72 52 C80 46 94 52 104 66 C92 66 80 66 64 66 C48 66 36 66 24 66 Z",
                 labio) +
             cam("M24 66 C36 86 52 92 64 92 C76 92 92 86 104 66 C92 70 80 72 64 72 C48 72 36 70 24 66 Z",
                 escuro(labio, 0.12)) + brilho(48, 56, 8, 3, rot=-10, op=0.6) +
             coracao(98, 32, 10, C["rosa_claro"]) + coracao(80, 22, 6, C["rosa_claro"]))


def d_namorar():
    return g(linha([(26, 98), (102, 28)], w=W + 4) + linha([(26, 98), (102, 28)], w=W - 0.5, cor=C["madeira_mel"]) +
             cam("M102 28 L86 30 L98 42 Z", C["cinza_claro"]) + coracao(62, 62, 26, C["vermelho"]) +
             brilho(50, 50, 7, 4, op=0.6) +
             linha([(68, 58), (102, 28)], w=W + 4) + linha([(68, 58), (102, 28)], w=W - 0.5, cor=C["madeira_mel"]) +
             cam("M30 94 L20 92 L22 104 L32 104 Z", C["amarelo"]))


def d_cumprimentar():
    pele = C["pessego"]
    return g(ret(14, 58, 30, 24, C["azul"], r=6) + ret(84, 58, 30, 24, C["verde_claro"], r=6) +
             ret(38, 52, 52, 34, pele, r=15) + linha([(54, 54), (54, 66)], w=3.5) + linha([(64, 54), (64, 66)], w=3.5) +
             linha([(74, 54), (74, 66)], w=3.5) + cam("M40 72 Q52 80 62 74", w=3.5) +
             faisca(64, 30, 10, BRANCO))


def d_telefonar():
    return g(ret(42, 22, 40, 78, C["grafite"], r=10) + ret(48, 32, 28, 52, C["azul_claro"], r=4) +
             circ(62, 92, 3.5, C["cinza"]) + cam("M90 40 Q98 50 90 60", w=4.5) + cam("M98 32 Q112 50 98 68", w=4.5) +
             coracao(62, 58, 8, C["rosa"]))


def d_comer():
    return g(circ(56, 66, 38, BRANCO) + circ(56, 66, 28, C["porcelana_azul"], w=3) +
             cam("M38 62 C34 48 50 40 60 46 C70 40 80 52 74 62 C82 72 70 86 58 82 C46 90 30 78 38 62 Z", "#FFFFFF") +
             circ(57, 64, 10, C["amarelo_escuro"]) + brilho(53, 60, 3.5, 2, op=0.8) +
             ret(100, 50, 9, 58, C["cromo"], r=4) + cam("M96 22 V44 Q96 52 104.5 52 Q113 52 113 44 V22", C["cromo"]) +
             linha([(104.5, 22), (104.5, 40)], w=3))


def d_lanche():
    mac = C["vermelho"]
    return g(cam("M64 40 C50 30 26 34 26 60 C26 86 44 104 56 104 C60 104 62 102 64 102 C66 102 68 104 72 104 "
                 "C84 104 102 86 102 60 C102 34 78 30 64 40 Z", mac) +
             cam("M64 40 Q62 28 68 20", "none", w=W + 1) + cam("M68 32 C76 18 92 20 94 26 C86 34 76 34 68 32 Z",
                                                               C["folha"]) +
             brilho(42, 54, 6, 12, rot=20, op=0.6))


def cama(x, y, w, cor_coberta, travesseiro=BRANCO):
    return (ret(x, y - 30, 12, 46, C["madeira"], r=5) + ret(x + 6, y - 6, w - 6, 18, C["colchao"], r=6) +
            ret(x + 12, y - 16, 22, 12, travesseiro, r=6) + cam(
                f"M{_f(x + 34)} {_f(y - 10)} H{_f(x + w - 4)} Q{_f(x + w + 4)} {_f(y - 10)} {_f(x + w + 4)} {_f(y + 2)} "
                f"V{_f(y + 10)} H{_f(x + 30)} Z", cor_coberta) +
            ret(x + w - 6, y - 14, 12, 40, C["madeira"], r=5) + linha([(x + 4, y + 16), (x + 4, y + 24)], w=6) +
            linha([(x + w, y + 26), (x + w, y + 30)], w=6))


def d_dormir():
    return g(cama(20, 76, 82, C["azul_claro"]) + zz(84, 36, 1.2) + zz(102, 22, 0.8))


def sofa(x, y, w, cor):
    return (ret(x + 6, y - 22, w - 12, 24, cor, r=8) + ret(x, y - 8, 16, 26, escuro(cor, 0.08), r=7) +
            ret(x + w - 16, y - 8, 16, 26, escuro(cor, 0.08), r=7) + ret(x + 12, y - 2, w - 24, 16, claro(cor, 0.2), r=5) +
            linha([(x + 8, y + 18), (x + 8, y + 24)], w=5) + linha([(x + w - 8, y + 18), (x + w - 8, y + 24)], w=5))


def d_cochilar():
    return g(sofa(18, 80, 78, C["laranja_claro"]) + zz(90, 40, 1.0) + zz(106, 26, 0.7) +
             cam("M62 36 A16 16 0 1 0 78 54 A12 12 0 1 1 62 36 Z", C["amarelo"]))


def d_sentar():
    cor = C["vermelho_claro"]
    return g(ret(42, 24, 44, 42, cor, r=10) + ret(36, 62, 56, 16, escuro(cor, 0.06), r=6) +
             linha([(42, 78), (40, 104)], w=W + 2) + linha([(86, 78), (88, 104)], w=W + 2) +
             linha([(42, 78), (40, 104)], w=W - 1.5, cor=C["madeira"]) +
             linha([(86, 78), (88, 104)], w=W - 1.5, cor=C["madeira"]) + brilho(54, 34, 8, 4, op=0.6))


def d_tomar_banho():
    agua = C["azul_bebe"]
    gotas = "".join(gota(x, y, 6, agua) for x, y in ((44, 76), (60, 90), (76, 78), (52, 104), (88, 98), (36, 96)))
    return g(cam("M26 22 H62 Q72 22 72 32 V40", "none", w=W + 4) + cam("M26 22 H62 Q72 22 72 32 V40", "none", w=W - 1,
                                                                       extra=f'stroke="{C["cromo"]}"') +
             cam("M48 52 Q50 38 72 38 Q94 38 96 52 Z", C["cromo"]) + linha([(56, 58), (54, 62)], w=3) +
             linha([(72, 58), (72, 62)], w=3) + linha([(88, 58), (90, 62)], w=3) + gotas)


def d_usar_banheiro():
    pap = BRANCO
    return g(cam("M30 40 H82 V96 H30 Z", pap) + elip(30, 68, 14, 28, claro(C["cinza_claro"], 0.3)) +
             elip(30, 68, 6, 10, C["cinza_medio"]) + cam("M82 40 C92 40 96 54 96 68 C96 82 92 96 82 96", pap) +
             cam("M96 68 V106 L88 100 L82 106 L76 100 V96", pap) + linha([(84, 82), (94, 82)], w=3, cor=C["cinza"]) +
             brilho(52, 50, 12, 3, rot=0, op=0.8))


def d_cozinhar():
    pan = C["vermelho"]
    vap = "".join(cam(P("M0 0 C-6 -6 6 -12 0 -18", x, 40, 1.0), "none", w=4.5) for x in (50, 64, 78))
    return g(vap + ret(26, 52, 76, 10, escuro(pan, 0.1), r=5) + ret(56, 44, 16, 9, C["grafite"], r=4) +
             cam("M30 62 H98 V82 Q98 98 82 98 H46 Q30 98 30 82 Z", pan) + ret(16, 64, 16, 9, C["grafite"], r=4) +
             ret(96, 64, 16, 9, C["grafite"], r=4) + brilho(44, 72, 8, 3, rot=0, op=0.6))


def d_limpar():
    return g(linha([(92, 18), (60, 70)], w=W + 5) + linha([(92, 18), (60, 70)], w=W, cor=C["madeira_clara"]) +
             cam("M50 62 L72 74 L64 82 L38 106 Q26 104 24 96 Z", C["amarelo"]) +
             cam("M50 62 L72 74 L66 82 L46 72 Z", C["vermelho"]) +
             linha([(40, 92), (54, 80)], w=3) + linha([(46, 98), (60, 86)], w=3) +
             faisca(92, 82, 12, BRANCO) + faisca(104, 60, 7, BRANCO))


def d_abrir_porta():
    return g(ret(30, 20, 54, 90, C["madeira_media"], r=6) + cam("M84 20 L106 30 V100 L84 110 Z", C["madeira_mel"]) +
             circ(96, 66, 4, C["ouro"]) + ret(38, 28, 38, 74, escuro(C["madeira_media"], 0.35), r=3) +
             cam("M38 102 L84 110", w=3) + faisca(56, 50, 12, C["amarelo_claro"]))


def d_trancar_porta():
    return g(cam("M42 56 V42 Q42 22 64 22 Q86 22 86 42 V56", "none", w=W + 6) +
             cam("M42 56 V42 Q42 22 64 22 Q86 22 86 42 V56", "none", w=W, extra=f'stroke="{C["cinza"]}"') +
             ret(30, 52, 68, 52, C["amarelo"], r=12) + circ(64, 72, 8, TINTA, False) +
             cam("M60 74 L57 92 H71 L68 74 Z", TINTA, contorno=False) + brilho(44, 62, 8, 4, rot=0, op=0.7))


def maleta(x, y, w, h, cor):
    return (cam(f"M{_f(x + w * 0.34)} {_f(y)} V{_f(y - 10)} Q{_f(x + w * 0.34)} {_f(y - 14)} {_f(x + w * 0.4)} "
                f"{_f(y - 14)} H{_f(x + w * 0.6)} Q{_f(x + w * 0.66)} {_f(y - 14)} {_f(x + w * 0.66)} {_f(y - 10)} "
                f"V{_f(y)}", "none", w=W + 1) +
            ret(x, y, w, h, cor, r=9) + linha([(x, y + h * 0.42), (x + w, y + h * 0.42)], w=3.5) +
            ret(x + w / 2 - 7, y + h * 0.42 - 6, 14, 12, C["ouro"], r=3))


def d_trabalhar():
    return g(maleta(24, 46, 80, 54, C["madeira_media"]) + brilho(40, 56, 9, 3, rot=0, op=0.5))


def d_trabalhar_de_casa():
    return g(ret(30, 28, 68, 48, C["grafite"], r=6) + ret(36, 34, 56, 36, C["azul_claro"], r=2) +
             cam("M20 82 H108 L100 94 H28 Z", C["cinza_claro"]) + ret(22, 76, 84, 8, C["metal"], r=3) +
             cam("M50 54 L58 46 L66 54 V64 H50 Z", C["amarelo_claro"], w=3) + ret(56, 56, 4, 8, C["madeira"], contorno=False) +
             linha([(70, 46), (86, 46)], w=3) + linha([(70, 54), (84, 54)], w=3) + linha([(70, 62), (80, 62)], w=3))


def livro_aberto(cx, cy, w, h, capa, folha=BRANCO):
    return (cam(f"M{_f(cx - w / 2 - 4)} {_f(cy - h / 2 + 6)} V{_f(cy + h / 2 + 4)} H{_f(cx + w / 2 + 4)} "
                f"V{_f(cy - h / 2 + 6)} Z", capa) +
            cam(f"M{_f(cx)} {_f(cy - h / 2 + 6)} Q{_f(cx - w * 0.25)} {_f(cy - h / 2 - 2)} {_f(cx - w / 2)} "
                f"{_f(cy - h / 2 + 2)} V{_f(cy + h / 2)} Q{_f(cx - w * 0.25)} {_f(cy + h / 2 - 6)} {_f(cx)} {_f(cy + h / 2)} Z",
                folha) +
            cam(f"M{_f(cx)} {_f(cy - h / 2 + 6)} Q{_f(cx + w * 0.25)} {_f(cy - h / 2 - 2)} {_f(cx + w / 2)} "
                f"{_f(cy - h / 2 + 2)} V{_f(cy + h / 2)} Q{_f(cx + w * 0.25)} {_f(cy + h / 2 - 6)} {_f(cx)} {_f(cy + h / 2)} Z",
                folha))


def d_ler():
    return g(livro_aberto(64, 66, 76, 52, C["azul"]) + linha([(36, 56), (56, 58)], w=3) + linha([(36, 66), (56, 68)], w=3) +
             linha([(72, 58), (92, 56)], w=3) + linha([(72, 68), (92, 66)], w=3) + linha([(72, 78), (86, 77)], w=3))


def d_estudar():
    cap = C["grafite"]
    return g(livro_aberto(64, 82, 68, 34, C["vermelho"]) +
             cam("M64 22 L104 38 L64 54 L24 38 Z", cap) + cam("M40 46 V58 Q64 70 88 58 V46 L64 54 Z", escuro(cap, 0.1)) +
             linha([(104, 38), (104, 58)], w=3.5) + circ(104, 60, 5, C["amarelo"]))


def d_dever_de_casa():
    pag = C["papel"]
    esp = "".join(circ(30, y, 4, C["cromo"]) for y in (36, 52, 68, 84))
    return g(ret(30, 22, 58, 84, pag, r=6) + esp + linha([(42, 42), (76, 42)], w=3, cor=C["azul_claro"]) +
             linha([(42, 56), (76, 56)], w=3, cor=C["azul_claro"]) + linha([(42, 70), (66, 70)], w=3, cor=C["azul_claro"]) +
             cam("M44 86 L52 94 L68 78", "none", w=5, extra=f'stroke="{C["verde"]}"') +
             cam("M100 26 L110 36 L80 92 L68 98 L70 84 Z", C["amarelo"]) + cam("M70 84 L80 92 L68 98 Z", C["pessego"]) +
             cam("M96 34 L106 44", w=3))


def d_assistir_tv():
    return g(linha([(52, 34), (40, 16)], w=4) + linha([(76, 34), (90, 18)], w=4) + circ(40, 16, 4, C["vermelho"]) +
             circ(90, 18, 4, C["vermelho"]) +
             ret(18, 34, 92, 64, C["madeira_mel"], r=14) + ret(28, 42, 58, 48, C["azul_noite"], r=8) +
             cam("M50 54 L66 66 L50 78 Z", BRANCO, w=3.5) + circ(98, 54, 5, C["creme"]) + circ(98, 72, 5, C["creme"]) +
             linha([(36, 98), (32, 108)], w=5) + linha([(92, 98), (96, 108)], w=5))


def d_jogar():
    cor = C["cinza_claro"]
    return g(cam("M30 48 Q34 38 48 40 H80 Q94 38 98 48 L108 82 Q112 98 98 98 Q90 98 84 86 H44 Q38 98 30 98 "
                 "Q16 98 20 82 Z", cor) +
             ret(36, 56, 22, 8, C["grafite"], r=3) + ret(43, 49, 8, 22, C["grafite"], r=3) +
             circ(82, 54, 5.5, C["vermelho"]) + circ(94, 64, 5.5, C["azul"]) + circ(82, 74, 5.5, C["verde"]) +
             circ(70, 64, 5.5, C["amarelo"]) + brilho(42, 44, 8, 3, rot=0, op=0.7))


def bloco(x, y, l, cor):
    t = l * 0.34
    return (cam(f"M{_f(x)} {_f(y)} L{_f(x + t)} {_f(y - t)} H{_f(x + l + t)} L{_f(x + l)} {_f(y)} Z", claro(cor, 0.3)) +
            cam(f"M{_f(x + l)} {_f(y)} L{_f(x + l + t)} {_f(y - t)} V{_f(y + l - t)} L{_f(x + l)} {_f(y + l)} Z",
                escuro(cor, 0.15)) +
            ret(x, y, l, l, cor, r=3))


def d_brincar():
    return g(bloco(24, 72, 30, C["vermelho"]) + bloco(60, 72, 30, C["azul"]) + bloco(42, 36, 30, C["amarelo"]) +
             circ(57, 51, 6, BRANCO) + cam("M30 82 L44 92", w=3.5) + cam(estrela5(75, 87, 7), BRANCO, w=3))


def pata(cx, cy, s, cor):
    return (cam(P("M0 -4 C10 -4 16 6 14 12 C12 18 4 16 0 16 C-4 16 -12 18 -14 12 C-16 6 -10 -4 0 -4 Z", cx, cy, s), cor) +
            elip(cx - 15 * s, cy - 10 * s, 5.5 * s, 7 * s, cor, rot=-20) + elip(cx - 5.5 * s, cy - 18 * s, 5.5 * s, 7.5 * s, cor) +
            elip(cx + 5.5 * s, cy - 18 * s, 5.5 * s, 7.5 * s, cor) + elip(cx + 15 * s, cy - 10 * s, 5.5 * s, 7 * s, cor, rot=20))


def d_carinho_bicho():
    return g(pata(56, 74, 1.7, C["marrom_claro"]) + coracao(94, 36, 13, C["vermelho"]) + brilho(90, 30, 4, 2, op=0.7))


def d_passear():
    sola = C["azul_claro"]
    return g(cam("M36 66 C30 54 34 34 46 34 C58 34 60 52 56 66 Z", sola) + elip(46, 80, 9, 8, sola) +
             cam("M72 46 C66 34 70 14 82 14 C94 14 96 32 92 46 Z", sola) + elip(82, 60, 9, 8, sola) +
             cam("M30 98 Q64 86 98 98", "none", w=3.5, extra='stroke-dasharray="2 9"'))


def d_comprar():
    sac = C["rosa"]
    return g(cam("M46 44 V36 Q46 22 64 22 Q82 22 82 36 V44", "none", w=W + 1) +
             cam("M30 40 H98 L104 104 H24 Z", sac) + cam("M30 40 H98 L99 52 H29 Z", escuro(sac, 0.1)) +
             circ(46, 46, 3.5, TINTA, False) + circ(82, 46, 3.5, TINTA, False) + coracao(64, 78, 11, BRANCO))


def bebe(cx, cy, s=1.0):
    pele = C["pessego"]
    return (circ(cx, cy, 16 * s, pele) + cam(P("M-8 -14 Q0 -22 6 -14", cx, cy, s), "none", w=3.5) +
            circ(cx - 6 * s, cy - 1 * s, 2.4 * s, TINTA, False) + circ(cx + 6 * s, cy - 1 * s, 2.4 * s, TINTA, False) +
            circ(cx, cy + 8 * s, 4.5 * s, C["azul_claro"]) +
            elip(cx - 10 * s, cy + 5 * s, 3.5 * s, 2.2 * s, C["rosa_escuro"], contorno=False, op=0.45) +
            elip(cx + 10 * s, cy + 5 * s, 3.5 * s, 2.2 * s, C["rosa_escuro"], contorno=False, op=0.45))


def d_pegar_no_colo():
    pele = C["pessego"]
    return g(cam("M30 60 Q64 68 98 60 Q104 88 64 100 Q24 88 30 60 Z", C["amarelo_claro"]) + bebe(64, 56, 1.25) +
             cam("M18 78 C30 92 50 98 64 98 C78 98 98 92 110 78 L110 92 C98 104 80 110 64 110 C48 110 30 104 18 92 Z",
                 pele))


def d_ninar():
    return g(cam("M58 22 A36 36 0 1 0 104 74 A28 28 0 1 1 58 22 Z", C["amarelo_claro"]) +
             cam(estrela5(92, 30, 9), C["amarelo"]) + cam(estrela5(30, 30, 6), BRANCO) +
             circ(76, 92, 7, BRANCO) + linha([(82, 92), (82, 66), (94, 62)], w=W) + brilho(46, 52, 5, 10, rot=10, op=0.6))


def d_dar_mamadeira():
    return g(cam("M56 30 Q56 16 64 14 Q72 16 72 30 Z", C["amarelo_claro"]) + ret(48, 28, 32, 12, C["azul_claro"], r=4) +
             cam("M46 40 H82 V96 Q82 108 70 108 H58 Q46 108 46 96 Z", BRANCO) +
             cam("M48 66 H80 V96 Q80 106 70 106 H58 Q48 106 48 96 Z", C["creme_claro"], contorno=False) +
             linha([(46, 66), (82, 66)], w=3) + linha([(52, 52), (60, 52)], w=3) + linha([(52, 80), (60, 80)], w=3) +
             linha([(52, 94), (60, 94)], w=3) + brilho(56, 60, 3, 12, rot=0, op=0.8))


def d_trocar_fralda():
    seta = C["verde"]
    return g(cam("M30 40 H98 V48 C98 72 84 88 64 88 C44 88 30 72 30 48 Z", BRANCO) + ret(30, 38, 68, 11, C["azul_claro"], r=5) +
             ret(24, 42, 12, 13, C["amarelo"], r=4) + ret(92, 42, 12, 13, C["amarelo"], r=4) +
             cam("M100 82 A30 30 0 0 1 60 104", "none", w=W + 4) + cam("M100 82 A30 30 0 0 1 60 104", "none", w=W - 0.5,
                                                                      extra=f'stroke="{seta}"') +
             cam("M58 94 L52 106 L66 110 Z", seta) + faisca(102, 24, 9, BRANCO))


def d_por_no_berco():
    mad = C["madeira_clara"]
    grade = "".join(linha([(x, 54), (x, 90)], w=W) for x in (36, 48, 80, 92))
    return g(bebe(64, 52, 1.0) + cam("M44 70 Q64 62 84 70 V90 H44 Z", C["azul_bebe"]) + grade +
             ret(22, 48, 84, 9, mad, r=4) + ret(22, 86, 84, 9, mad, r=4) + ret(18, 40, 10, 70, mad, r=4) +
             ret(100, 40, 10, 70, mad, r=4))


def d_dar_banho_bebe():
    pato = C["amarelo"]
    bolhas = bolha(30, 50, 7) + bolha(44, 40, 5) + bolha(98, 44, 6)
    return g(bolhas + cam("M56 54 C54 40 70 34 78 44 C82 50 80 56 76 58 H90 Q94 66 86 74 H52 Q44 66 56 54 Z", pato) +
             cam("M78 46 L90 48 L80 54 Z", C["laranja"]) + circ(68, 46, 3, TINTA, False) +
             cam("M18 66 H110 Q108 100 80 104 H48 Q20 100 18 66 Z", C["branco_gelo"]) +
             cam("M22 74 H106", "none", w=3.5, extra=f'stroke="{C["azul_celeste"]}"') +
             linha([(38, 104), (34, 112)], w=5) + linha([(90, 104), (94, 112)], w=5))


# ---------------------------------------------------------------------------------------------------------------------
# INTERFACE (ficha quadrada creme)
# ---------------------------------------------------------------------------------------------------------------------
FICHA_INTERFACE = C["creme_claro"]


def moeda(cx, cy, r, s_casa=1.0):
    """A moeda do Morada: dourada, borda serrilhada em gomos e uma casinha com porta em baixo-relevo."""
    o = C["ouro"]
    k = s_casa * r / 38
    casa = P("M0 -17 L18 -2 V16 H-18 V-2 Z", cx, cy + 2 * k, k)
    porta = P("M-5 16 V6 Q-5 2 0 2 Q5 2 5 6 V16 Z", cx, cy + 2 * k, k)
    return (circ(cx, cy, r, escuro(o, 0.12)) + circ(cx, cy - r * 0.06, r * 0.94, o, contorno=False) +
            circ(cx, cy - r * 0.04, r * 0.74, claro(o, 0.15), contorno=True) +
            cam(casa, C["ouro_escuro"], w=W * 0.8) + cam(porta, claro(o, 0.5), w=W * 0.6) +
            brilho(cx - r * 0.4, cy - r * 0.45, r * 0.22, r * 0.1, rot=-35, op=0.8))


def d_dinheiro():
    return g(moeda(64, 64, 42))


def d_relogio():
    return g(circ(64, 66, 40, BRANCO) + circ(64, 66, 32, C["azul_bebe"], contorno=False) +
             "".join(linha([(64 + 30 * math.cos(a), 66 + 30 * math.sin(a)), (64 + 24 * math.cos(a), 66 + 24 * math.sin(a))],
                           w=4) for a in [math.radians(d) for d in range(0, 360, 90)]) +
             linha([(64, 66), (64, 44)], w=5) + linha([(64, 66), (80, 74)], w=5) + circ(64, 66, 4, TINTA, False) +
             ret(56, 16, 16, 10, C["vermelho"], r=4))


def setas_play(n):
    w = 26
    tot = n * w * 0.62 + w * 0.38
    x0 = 64 - tot / 2
    out = ""
    for k in range(n):
        x = x0 + k * w * 0.62
        out += cam(f"M{_f(x)} 40 L{_f(x + w)} 64 L{_f(x)} 88 Z", C["verde"] if n == 1 else (C["laranja"] if n == 2
                                                                                            else C["vermelho"]))
    return out


def d_pausar():
    return g(ret(38, 36, 18, 56, C["azul"], r=6) + ret(72, 36, 18, 56, C["azul"], r=6))


def d_vel_1():
    return g(setas_play(1))


def d_vel_2():
    return g(setas_play(2))


def d_vel_3():
    return g(setas_play(3))


def d_construir():
    tij = C["tijolo"]
    parede = "".join(ret(x, y, 26, 14, tij, r=3) for x, y in ((22, 84), (48, 84), (74, 84), (35, 70), (61, 70)))
    return g(parede + ret(58, 22, 10, 56, C["madeira_mel"], r=4, rot=(35, 63, 50)) +
             ret(44, 18, 40, 16, C["cinza_medio"], r=5, rot=(35, 64, 26)) + brilho(56, 22, 8, 3, rot=35, op=0.6))


def d_comprar_modo():
    cor = C["azul_celeste"]
    return g(sofa(16, 84, 72, cor) + cam("M74 26 H104 V52 L88 66 L60 40 Z", C["amarelo"]) + circ(94, 36, 4, TINTA, False))


def d_familia():
    return g(pessoa(40, 46, 1.0, C["verde_claro"], cabelo=C["marrom"]) + pessoa(88, 46, 1.0, C["azul_claro"],
                                                                                cabelo=C["madeira_escura"]) +
             pessoa(64, 68, 0.8, C["amarelo"], cabelo=C["laranja_escuro"]))


def d_relacionamento():
    return g(coracao(48, 60, 24, C["amarelo"]) + coracao(80, 68, 24, C["vermelho"]) + brilho(70, 56, 6, 3, op=0.6) +
             brilho(38, 48, 6, 3, op=0.6))


def d_habilidade():
    return g(cam("M50 66 L36 106 L50 98 L58 110 L66 72 Z", C["azul"]) + cam("M78 66 L92 106 L78 98 L70 110 L62 72 Z",
                                                                            C["vermelho"]) +
             circ(64, 52, 32, C["ouro"]) + circ(64, 52, 24, claro(C["ouro"], 0.2)) +
             cam(estrela5(64, 53, 15), BRANCO))


def d_carreira():
    seta = C["verde"]
    return g(maleta(18, 58, 66, 44, C["madeira_media"]) +
             cam("M94 66 V40 H84 L100 18 L116 40 H106 V66 Z", seta))


def d_configuracoes():
    pts = []
    n = 8
    for k in range(n * 2):
        a = math.radians(k * 180 / n - 90)
        r = 40 if k % 2 == 0 else 30
        da = math.radians(9 if k % 2 == 0 else -9)
        pts += [(64 + r * math.cos(a - da), 64 + r * math.sin(a - da)), (64 + r * math.cos(a + da), 64 + r * math.sin(a + da))]
    d = "M" + " L".join(f"{_f(x)} {_f(y)}" for x, y in pts) + " Z"
    return g(cam(d, C["cinza_claro"]) + circ(64, 64, 14, FICHA_INTERFACE) + brilho(52, 42, 8, 3, op=0.7))


def d_camera():
    corpo = C["grafite"]
    return g(ret(42, 30, 26, 12, corpo, r=4) + ret(18, 38, 92, 62, corpo, r=12) + circ(64, 70, 22, C["cinza_claro"]) +
             circ(64, 70, 13, C["azul_noite"]) + circ(58, 64, 4, "#FFFFFF", contorno=False) + circ(94, 50, 5, C["amarelo"]))


def d_voltar():
    seta = C["azul"]
    return g(cam("M50 26 L18 54 L50 82 V66 H70 Q94 66 94 86 Q94 98 84 104 Q112 102 112 76 Q112 42 74 42 H50 Z", seta) +
             brilho(40, 50, 7, 3, rot=-40, op=0.6))


def d_viver():
    casa = C["laranja_claro"]
    return g(cam("M64 18 L106 54 H96 V104 H32 V54 H22 Z", casa) + cam("M32 54 L64 26 L96 54", "none", w=W) +
             coracao(64, 74, 16, C["vermelho"]) + brilho(56, 66, 5, 2, op=0.7))


def d_servicos():
    return g(ret(28, 24, 60, 82, C["madeira_mel"], r=8) + ret(36, 36, 44, 62, BRANCO, r=3) + ret(46, 18, 24, 12, C["cinza"], r=4) +
             cam("M42 52 L46 56 L54 48", "none", w=3.5, extra=f'stroke="{C["verde"]}"') + linha([(60, 52), (74, 52)], w=3) +
             cam("M42 70 L46 74 L54 66", "none", w=3.5, extra=f'stroke="{C["verde"]}"') + linha([(60, 70), (74, 70)], w=3) +
             linha([(42, 88), (74, 88)], w=3) +
             linha([(108, 30), (88, 84)], w=W + 4) + linha([(108, 30), (88, 84)], w=W - 1, cor=C["madeira_clara"]) +
             cam("M80 80 L96 86 L94 108 L72 100 Z", C["amarelo"]))


def d_convidar():
    mais = C["verde"]
    return g(pessoa(52, 52, 1.2, C["azul_claro"], cabelo=C["marrom"]) + circ(92, 78, 18, mais) +
             linha([(92, 68), (92, 88)], w=5, cor="#FFFFFF") + linha([(82, 78), (102, 78)], w=5, cor="#FFFFFF"))


def d_salvar():
    nuv = BRANCO
    return g(cam(P(NUVEM, 64, 62, 42), nuv) + cam("M48 66 L60 78 L82 54", "none", w=W + 5) +
             cam("M48 66 L60 78 L82 54", "none", w=W, extra=f'stroke="{C["verde"]}"'))


def casinha(cx, cy, s, cor, telhado=None):
    return (cam(P("M-14 -2 V16 H14 V-2 Z", cx, cy, s), cor) +
            cam(P("M-19 0 L0 -17 L19 0 Z", cx, cy, s), telhado or C["vermelho"]) +
            cam(P("M-4 16 V7 H4 V16 Z", cx, cy, s), C["madeira_media"], w=3))


def d_mundos():
    return g(cam("M14 92 Q64 70 114 92 V100 Q64 112 14 100 Z", C["grama"]) + casinha(38, 70, 0.95, C["amarelo_claro"]) +
             casinha(90, 70, 0.95, C["azul_bebe"], telhado=C["azul"]) + casinha(64, 48, 1.15, BRANCO, telhado=C["laranja"]) +
             circ(104, 30, 9, C["amarelo"]))


# ---------------------------------------------------------------------------------------------------------------------
# MARCADOR (2D) e propostas
# ---------------------------------------------------------------------------------------------------------------------
HUMOR_GERAL = {"otimo": C["verde"], "bom": C["amarelo"], "ruim": C["laranja"], "pessimo": C["vermelho"]}
HUMOR_GERAL_ROTULO = {"otimo": "humor ótimo", "bom": "humor bom", "ruim": "humor ruim", "pessimo": "humor péssimo"}


def marcador_casinha(cor):
    """O escolhido: casinha boleada com chaminé, porta em arco e janela redonda. Vista de frente, levemente 3/4."""
    tel = escuro(cor, 0.22)
    lado = escuro(cor, 0.12)
    halo = ('<path d="M64 14 Q60 14 56 18 L18 52 Q14 56 18 60 Q22 62 26 60 V100 Q26 108 34 108 H86 Q94 108 94 100 V96 '
            'L106 84 V40 L94 30 L72 18 Q68 14 64 14 Z" fill="none" stroke="#FFFFFF" stroke-width="13" opacity=".55"/>')
    return halo + g(cam("M94 30 L106 40 V84 L94 96 Z", lado) +
             cam("M74 22 H88 V44 L74 34 Z", tel) +
             cam("M64 14 Q60 14 56 18 L18 52 Q14 56 18 60 Q22 62 26 60 V100 Q26 108 34 108 H86 Q94 108 94 100 V60 "
                 "Q98 62 102 60 Q106 56 102 52 L72 18 Q68 14 64 14 Z", cor) +
             cam("M22 58 L64 22 L106 58", "none", w=W, extra='opacity="0"') +
             cam("M26 60 L64 28 L94 54", "none", w=4, extra=f'stroke="{tel}"') +
             cam("M52 108 V84 Q52 72 64 72 Q76 72 76 84 V108 Z", C["creme_claro"]) +
             circ(64, 52, 8, C["creme_claro"]) + brilho(40, 66, 6, 14, rot=12, op=0.5))


def marcador_chave(cor):
    return g(cam("M58 66 H70 V104 L76 108 L70 112 V116 H58 Z", cor) + ret(70, 88, 10, 6, cor, r=2) +
             cam("M64 10 L100 40 V68 Q100 74 94 74 H34 Q28 74 28 68 V40 Z", cor) + circ(64, 50, 9, C["creme_claro"]) +
             brilho(46, 50, 5, 10, op=0.5))


def marcador_estrela(cor):
    return g(cam(estrela5(64, 64, 52, 24), cor) + cam("M54 92 V76 Q54 66 64 66 Q74 66 74 76 V92 Z", C["creme_claro"]) +
             brilho(48, 50, 6, 12, rot=20, op=0.5))


# ---------------------------------------------------------------------------------------------------------------------
# catálogo
# ---------------------------------------------------------------------------------------------------------------------
NECESSIDADES = [
    ("fome", "Fome", d_fome, "documento"), ("energia", "Energia", d_energia, "documento"),
    ("bexiga", "Bexiga (banheiro)", d_bexiga, "documento"), ("higiene", "Higiene", d_higiene, "documento"),
    ("social", "Social", d_social, "documento"), ("diversao", "Diversão", d_diversao, "documento"),
    ("conforto", "Conforto (bebês)", d_conforto, "documento: bebês"), ("fralda", "Fralda (bebês)", d_fralda, "documento: bebês"),
    ("vinculo", "Vínculo (bebês)", d_vinculo, "documento: bebês"),
]
HUMORES = [
    ("alegre", "Alegre (feliz)", d_alegre, "documento"), ("tranquilo", "Tranquilo", d_tranquilo, "documento"),
    ("focado", "Focado", d_focado, "documento"), ("inspirado", "Inspirado", d_inspirado, "documento"),
    ("triste", "Triste", d_triste, "documento"), ("irritado", "Irritado (bravo)", d_irritado, "documento"),
    ("tenso", "Tenso", d_tenso, "documento"), ("envergonhado", "Envergonhado", d_envergonhado, "documento"),
    ("apaixonado", "Apaixonado", d_apaixonado, "documento"), ("entediado", "Entediado", d_entediado, "pedido"),
    ("confiante", "Confiante", d_confiante, "pedido"), ("com_sono", "Com sono", d_com_sono, "pedido"),
    ("brincalhao", "Brincalhão", d_brincalhao, "pedido"), ("enjoado", "Enjoado", d_enjoado, "pedido"),
]
INTERACOES = [
    ("conversar", "Conversar", d_conversar, "social", "pedido"), ("abracar", "Abraçar", d_abracar, "social", "pedido"),
    ("beijar", "Beijar", d_beijar, "social", "pedido"), ("namorar", "Namorar", d_namorar, "social", "documento"),
    ("cumprimentar", "Apertar a mão", d_cumprimentar, "social", "documento"),
    ("telefonar", "Telefonar", d_telefonar, "social", "documento"),
    ("comer", "Comer", d_comer, "corpo", "pedido"), ("lanche", "Fazer um lanche", d_lanche, "corpo", "documento"),
    ("dormir", "Dormir", d_dormir, "sono", "pedido"), ("cochilar", "Cochilar", d_cochilar, "sono", "documento"),
    ("sentar", "Sentar", d_sentar, "corpo", "documento"),
    ("tomar_banho", "Tomar banho", d_tomar_banho, "banho", "pedido"),
    ("usar_banheiro", "Usar o banheiro", d_usar_banheiro, "banheiro", "pedido"),
    ("cozinhar", "Cozinhar", d_cozinhar, "casa", "pedido"), ("limpar", "Limpar", d_limpar, "casa", "pedido"),
    ("abrir_porta", "Abrir a porta", d_abrir_porta, "casa", "documento"),
    ("trancar_porta", "Trancar a porta", d_trancar_porta, "casa", "documento"),
    ("trabalhar", "Trabalhar", d_trabalhar, "trabalho", "pedido"),
    ("trabalhar_de_casa", "Trabalhar de casa", d_trabalhar_de_casa, "trabalho", "documento"),
    ("estudar", "Estudar", d_estudar, "trabalho", "pedido"),
    ("dever_de_casa", "Dever de casa", d_dever_de_casa, "trabalho", "documento"),
    ("assistir_tv", "Assistir TV", d_assistir_tv, "lazer", "pedido"), ("jogar", "Jogar", d_jogar, "lazer", "pedido"),
    ("ler", "Ler", d_ler, "lazer", "pedido"), ("brincar", "Brincar", d_brincar, "lazer", "pedido"),
    ("carinho_bicho", "Fazer carinho no bicho", d_carinho_bicho, "bicho", "pedido"),
    ("passear", "Passear", d_passear, "lazer", "pedido"), ("comprar", "Comprar", d_comprar, "lazer", "pedido"),
    ("pegar_no_colo", "Pegar no colo", d_pegar_no_colo, "bebe", "documento"),
    ("ninar", "Ninar", d_ninar, "bebe", "documento"), ("dar_mamadeira", "Dar mamadeira", d_dar_mamadeira, "bebe", "documento"),
    ("trocar_fralda", "Trocar a fralda", d_trocar_fralda, "bebe", "documento"),
    ("por_no_berco", "Pôr no berço", d_por_no_berco, "bebe", "documento"),
    ("dar_banho_bebe", "Dar banho no bebê", d_dar_banho_bebe, "bebe", "documento"),
]
INTERFACE = [
    ("dinheiro", "Dinheiro (moeda)", d_dinheiro, "pedido"), ("relogio", "Relógio", d_relogio, "pedido"),
    ("pausar", "Pausar", d_pausar, "documento"), ("vel_1", "Velocidade 1×", d_vel_1, "documento"),
    ("vel_2", "Velocidade 2×", d_vel_2, "documento"), ("vel_3", "Velocidade 3×", d_vel_3, "documento"),
    ("viver", "Viver", d_viver, "documento"), ("construir", "Construir", d_construir, "pedido"),
    ("comprar_modo", "Comprar (modo)", d_comprar_modo, "pedido"), ("familia", "Família", d_familia, "pedido"),
    ("servicos", "Serviços", d_servicos, "documento"), ("relacionamento", "Relacionamento", d_relacionamento, "pedido"),
    ("habilidade", "Habilidade", d_habilidade, "pedido"), ("carreira", "Carreira", d_carreira, "pedido"),
    ("convidar", "Convidar", d_convidar, "documento"), ("mundos", "Seus mundos", d_mundos, "documento"),
    ("salvar", "Salvo", d_salvar, "documento"), ("configuracoes", "Configurações", d_configuracoes, "pedido"),
    ("camera", "Câmera", d_camera, "pedido"), ("voltar", "Voltar", d_voltar, "pedido"),
]

TAGS = {
    "fome": "comida comer refeição", "energia": "cansaço sono raio", "bexiga": "banheiro xixi vaso", "higiene": "banho sabonete limpo",
    "social": "amigos conversa pessoas", "diversao": "lazer festa balão", "conforto": "bebê almofada", "fralda": "bebê troca",
    "vinculo": "bebê carinho coração", "conversar": "falar papo", "abracar": "abraço carinho", "beijar": "beijo romance",
    "namorar": "romance amor cama", "cumprimentar": "aperto de mão oi", "telefonar": "celular ligar", "comer": "refeição prato",
    "lanche": "fruta maçã geladeira", "dormir": "cama sono", "cochilar": "sofá soneca", "sentar": "cadeira",
    "tomar_banho": "chuveiro higiene", "usar_banheiro": "privada papel bexiga", "cozinhar": "fogão panela", "limpar": "vassoura faxina",
    "abrir_porta": "entrar sair", "trancar_porta": "cadeado privacidade", "trabalhar": "emprego maleta",
    "trabalhar_de_casa": "computador notebook", "estudar": "escola livro", "dever_de_casa": "escola caderno lápis",
    "assistir_tv": "televisão", "jogar": "videogame controle", "ler": "livro", "brincar": "bola criança",
    "carinho_bicho": "cachorro gato pata", "passear": "andar rua", "comprar": "loja sacola", "pegar_no_colo": "bebê colo",
    "ninar": "bebê lua canção", "dar_mamadeira": "bebê mamar leite", "trocar_fralda": "bebê fralda", "por_no_berco": "bebê berço dormir",
    "dar_banho_bebe": "bebê banheira patinho", "dinheiro": "moeda M$ saldo", "relogio": "hora tempo", "pausar": "pausa tempo",
    "vel_1": "velocidade normal tempo", "vel_2": "velocidade rápido tempo", "vel_3": "velocidade muito rápido tempo",
    "viver": "modo viver casa", "construir": "obra parede martelo", "comprar_modo": "móveis loja etiqueta",
    "familia": "moradores retratos", "servicos": "contrato diarista babá", "relacionamento": "amizade romance",
    "habilidade": "medalha nível", "carreira": "emprego promoção", "convidar": "convite pessoa", "mundos": "bairro casas",
    "salvar": "nuvem salvo", "configuracoes": "opções engrenagem", "camera": "vista foto", "voltar": "retornar",
}


def svg(miolo, tam=None, extra_attr=""):
    t = f' width="{tam}" height="{tam}"' if tam else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"{t}{extra_attr}>{miolo}</svg>')


ESCALA = {"redonda": 0.86, "quadrada": 0.92}


def escalado(f, k):
    global _K
    _K = k
    try:
        m = f()
    finally:
        _K = 1.0
    return f'<g transform="translate(64 64) scale({k}) translate(-64 -64)">{m}</g>'


def todos():
    """Lista de (id, rótulo, categoria, miolo SVG, dados extras)."""
    out = []
    for i, r, f, o in NECESSIDADES:
        out.append((i, r, "necessidades", ficha_redonda(NEC_COR[i]) + escalado(f, ESCALA["redonda"]), {"origem": o, "cor": NEC_COR[i]}))
    for i, r, f, o in HUMORES:
        out.append((i, r, "humores", f(), {"origem": o, "cor": HUM_COR[i]}))
    for i, r, f, gr, o in INTERACOES:
        out.append((i, r, "interacoes", ficha_redonda(GRUPO_COR[gr]) + escalado(f, ESCALA["redonda"]), {"origem": o, "grupo": gr,
                                                                              "cor": GRUPO_COR[gr]}))
    for i, r, f, o in INTERFACE:
        out.append((i, r, "interface", ficha_quadrada(FICHA_INTERFACE) + escalado(f, ESCALA["quadrada"]), {"origem": o}))
    for k, cor in HUMOR_GERAL.items():
        out.append((f"marcador_{k}", f"Marcador {HUMOR_GERAL_ROTULO[k].split()[-1]}", "marcador", marcador_casinha(cor),
                    {"cor": cor, "humor_geral": k}))
    return out


# barra de necessidade: 5 estados de cor
ESTADOS = [("otimo", "ótimo", C["verde"], 1.0), ("bom", "bom", C["verde_lima"], 0.75), ("medio", "médio", C["amarelo"], 0.5),
           ("baixo", "baixo", C["laranja"], 0.28), ("critico", "crítico", C["vermelho"], 0.1)]


def barra(estado, largura=200, altura=28, x0=0, y0=0, nivel=None):
    _, _, cor, f = next(e for e in ESTADOS if e[0] == estado)
    f = f if nivel is None else nivel
    r = altura / 2
    inner = max(altura - 8, 1)
    wi = max(inner, (largura - 8) * f)
    return (ret(x0, y0, largura, altura, C["grafite"], r=r, contorno=False, op=0.85) +
            ret(x0 + 4, y0 + 4, wi, inner, cor, r=inner / 2, contorno=False) +
            ret(x0 + 8, y0 + 6, max(wi - 10, 2), inner * 0.32, "#FFFFFF", r=inner * 0.16, contorno=False, op=0.45) +
            f'<rect x="{_f(x0)}" y="{_f(y0)}" width="{_f(largura)}" height="{_f(altura)}" rx="{_f(r)}" fill="none" '
            f'{st(4)}/>')


def svg_barra(estado):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 208 36">{barra(estado)}</svg>')


def svg_necessidade_estado(nec, estado):
    """Ícone da necessidade com a barra ao lado, no estado dado (para o painel do morador)."""
    miolo = ficha_redonda(NEC_COR[nec]) + escalado(dict((i, f) for i, _, f, _ in NECESSIDADES)[nec], ESCALA["redonda"])
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 352 128">{miolo}'
            f'<g transform="translate(140 46)">{barra(estado, 204, 36)}</g></svg>')
