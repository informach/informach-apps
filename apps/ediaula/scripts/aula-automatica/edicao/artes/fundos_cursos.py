"""Um fundo por curso (REGRAS.md, seção 10): a mesma estrutura em todos (degradê, ondas finas em cima, ondas escuras
embaixo, detalhes só nas bordas, centro livre) com a paleta e o motivo do mundo de cada curso, tirados da capa.
O texto branco passa de 4,5 de contraste em todos (medido). As peças do kit e as cores com significado (amarelo é
ação, verde é reação, vermelho é erro) ficam iguais em todo curso.

Uso (dentro de edicao/artes): python fundos_cursos.py  ->  fundo-<curso>.svg para cada curso de CURSOS.
Para a cena do EdiSVG, renderize o SVG em PNG 1920 x 1080 (fundo-<curso>.png).
"""
import math
import os

W, H = 1920, 1080
CURSOS = {
    # Céu e jardim da capa: o azul, com folhinhas e flores.
    "cade": dict(topo="#3D6BE1", base="#3160D8", onda1="#5D88EE", onda2="#7FA1F3", escura1="#2A55C8",
                 escura2="#234BB8", motivo="folhas"),
    # O mar em volta da ilha: azul de mar fundo, com ondinhas e gaivotas.
    "farol": dict(topo="#1E6C9C", base="#17577F", onda1="#2F84B4", onda2="#4A9BC7", escura1="#124B6E",
                  escura2="#0E3F5E", motivo="mar"),
    # As moedas douradas: laranja de pôr do sol, com moedinhas e brilhos.
    "moedas": dict(topo="#A84A20", base="#93401B", onda1="#C0602F", onda2="#D07A45", escura1="#7E3515",
                   escura2="#6C2D11", motivo="moedas"),
    # A grama e as flores: verde-folha, com pétalas e florzinhas. A pílula verde da reação ganha borda branca aqui.
    "jardim": dict(topo="#2A7743", base="#226338", onda1="#3A8C55", onda2="#55A06C", escura1="#1B5230",
                   escura2="#164628", motivo="petalas"),
}


def estrela(cx, cy, r, cor="#FFE08A", op=0.75):
    k = r * 0.28
    return (f'<path d="M{cx} {cy - r} Q{cx + k} {cy - k} {cx + r} {cy} Q{cx + k} {cy + k} {cx} {cy + r} '
            f'Q{cx - k} {cy + k} {cx - r} {cy} Q{cx - k} {cy - k} {cx} {cy - r}Z" fill="{cor}" opacity="{op}"/>')


def nuvem(x, y, s, op):
    return (f'<g transform="translate({x} {y}) scale({s})" fill="#FFFFFF" opacity="{op}">'
            '<ellipse cx="0" cy="18" rx="62" ry="22"/><circle cx="-22" cy="6" r="24"/><circle cx="14" cy="-2" r="32"/>'
            '<circle cx="42" cy="12" r="20"/></g>')


def ramo(x, y, s, cor, op, vira=1):
    folha = "M0 0 C -10 -30, -4 -62, 0 -78 C 4 -62, 10 -30, 0 0Z"
    return (f'<g transform="translate({x} {y}) scale({s * vira} {s})" fill="{cor}" opacity="{op}">'
            + "".join(f'<path d="{folha}" transform="rotate({a})"/>' for a in (-34, 0, 34)) + "</g>")


def flor(x, y, r, cor, miolo="#FFD166", op=0.9):
    p = "".join(f'<circle cx="{x + r * 0.9 * math.cos(math.radians(a)):.1f}" cy="{y + r * 0.9 * math.sin(math.radians(a)):.1f}" '
                f'r="{r * 0.62:.1f}" fill="{cor}"/>' for a in range(0, 360, 72))
    return f'<g opacity="{op}">{p}<circle cx="{x}" cy="{y}" r="{r * 0.5:.1f}" fill="{miolo}"/></g>'


def petala(x, y, r, ang, cor="#F7A8C8", op=0.75):
    return (f'<ellipse cx="{x}" cy="{y}" rx="{r}" ry="{r * 0.55:.1f}" transform="rotate({ang} {x} {y})" '
            f'fill="{cor}" opacity="{op}"/>')


def moeda(x, y, r, op=0.9):
    return (f'<g opacity="{op}"><circle cx="{x}" cy="{y + 3}" r="{r}" fill="#C98F00"/>'
            f'<circle cx="{x}" cy="{y}" r="{r}" fill="#FFC02E"/>'
            f'<circle cx="{x}" cy="{y}" r="{r * 0.62:.1f}" fill="none" stroke="#E5A100" stroke-width="{max(2, r * 0.14):.1f}"/></g>')


def onda(x, y, s, op=0.4):
    return (f'<path d="M{x} {y} q {12 * s} {-14 * s} {24 * s} 0 t {24 * s} 0 t {24 * s} 0" fill="none" '
            f'stroke="#FFFFFF" stroke-width="{5 * s:.1f}" stroke-linecap="round" opacity="{op}"/>')


def gaivota(x, y, s, op=0.6):
    return (f'<path d="M{x - 22 * s} {y} q {11 * s} {-12 * s} {22 * s} 0 q {11 * s} {-12 * s} {22 * s} 0" fill="none" '
            f'stroke="#FFFFFF" stroke-width="{4 * s:.1f}" stroke-linecap="round" stroke-linejoin="round" opacity="{op}"/>')


def svg(curso):
    c = CURSOS[curso]
    p = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">',
         f'<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{c["topo"]}"/>'
         f'<stop offset="1" stop-color="{c["base"]}"/></linearGradient></defs>',
         f'<rect width="{W}" height="{H}" fill="url(#g)"/>',
         f'<path d="M0 0H1920V40C1700 64 1520 22 1300 38S880 70 640 44S220 22 0 52Z" fill="{c["onda1"]}" opacity="0.7"/>',
         f'<path d="M0 0H1920V18C1720 34 1500 8 1260 20S860 40 600 24S200 8 0 28Z" fill="{c["onda2"]}" opacity="0.6"/>',
         f'<path d="M0 1080H1920V968C1720 920 1540 1000 1310 962S900 900 660 952S240 1000 0 944Z" fill="{c["escura1"]}" opacity="0.6"/>',
         f'<path d="M0 1080H1920V1018C1700 990 1480 1046 1240 1016S840 978 600 1012S220 1046 0 1006Z" fill="{c["escura2"]}" opacity="0.6"/>']
    for x, y, r in ((70, 330, 14), (1268, 300, 18), (60, 760, 11), (1290, 620, 12), (980, 990, 10), (420, 1000, 13),
                    (1450, 240, 12)):
        p.append(estrela(x, y, r))
    m = c["motivo"]
    if m in ("folhas", "petalas"):
        for x, y, s, op in ((1110, 150, 0.8, 0.16), (1250, 250, 0.55, 0.13), (1650, 130, 1.0, 0.16)):
            p.append(nuvem(x, y, s, op))
    if m == "folhas":
        for x, y, s, v in ((70, 1060, 1.1, 1), (150, 1068, 0.75, -1), (1250, 1062, 0.9, -1), (1190, 1070, 0.6, 1),
                           (1800, 1060, 1.0, 1)):
            p.append(ramo(x, y, s, "#3FA56A", 0.75, v))
        for x, y, r in ((110, 1010, 11), (1222, 1022, 9), (40, 470, 8), (1295, 520, 9)):
            p.append(flor(x, y, r, "#FFFFFF"))
    elif m == "mar":
        for x, y, s in ((90, 1000, 1.3), (300, 1040, 1.0), (1080, 1000, 1.2), (1240, 1045, 0.9), (40, 600, 0.9),
                        (1270, 720, 1.0)):
            p.append(onda(x, y, s))
        for x, y, s in ((1150, 170, 1.2), (1230, 220, 0.8), (1700, 160, 1.1), (80, 420, 0.8)):
            p.append(gaivota(x, y, s))
    elif m == "moedas":
        for x, y, r in ((80, 1010, 22), (150, 1045, 15), (1230, 1020, 20), (1180, 1050, 13), (1290, 470, 14),
                        (45, 560, 12), (1120, 175, 12), (1790, 1015, 20)):
            p.append(moeda(x, y, r))
    elif m == "petalas":
        for x, y, s, v in ((80, 1062, 1.0, 1), (1240, 1066, 0.8, -1), (1820, 1062, 0.9, 1)):
            p.append(ramo(x, y, s, "#4FB36F", 0.75, v))
        for x, y, r, a in ((130, 1000, 12, 30), (1170, 1010, 11, -20), (50, 640, 10, 60), (1290, 560, 11, 10),
                           (1060, 215, 9, 45), (300, 1035, 9, -40)):
            p.append(petala(x, y, r, a))
        for x, y, r, cor in ((180, 1040, 12, "#F7A8C8"), (1290, 1030, 11, "#FFFFFF"), (1260, 380, 9, "#F7A8C8")):
            p.append(flor(x, y, r, cor))
    for x, y in ((240, 300), (880, 280), (1180, 980), (300, 960), (40, 520)):
        p.append(f'<circle cx="{x}" cy="{y}" r="5" fill="#FFFFFF" opacity="0.22"/>')
    p.append("</svg>")
    return "".join(p)


if __name__ == "__main__":
    aqui = os.path.dirname(os.path.abspath(__file__))
    for k in CURSOS:
        open(os.path.join(aqui, f"fundo-{k}.svg"), "w", encoding="utf8").write(svg(k))
    print("ok", ", ".join(CURSOS))
