"""O fundo das cenas: Azul jogo com detalhes (degradê, ondas claras e escuras, nuvens, brilhos e raminhos nas bordas)."""
import math, os, random
random.seed(7)
W, H = 1920, 1080

def estrela(cx, cy, r, cor, op):
    # Brilho de quatro pontas, de lados curvos.
    k = r * 0.28
    return (f'<path d="M{cx} {cy - r} Q{cx + k} {cy - k} {cx + r} {cy} Q{cx + k} {cy + k} {cx} {cy + r} '
            f'Q{cx - k} {cy + k} {cx - r} {cy} Q{cx - k} {cy - k} {cx} {cy - r}Z" fill="{cor}" opacity="{op}"/>')

def nuvem(x, y, s, op):
    return (f'<g transform="translate({x} {y}) scale({s})" fill="#FFFFFF" opacity="{op}">'
            '<ellipse cx="0" cy="18" rx="62" ry="22"/><circle cx="-22" cy="6" r="24"/><circle cx="14" cy="-2" r="32"/>'
            '<circle cx="42" cy="12" r="20"/></g>')

def ramo(x, y, s, cor, op, vira=1):
    # Raminho de três folhas, como os tufos de planta das bordas.
    folha = 'M0 0 C -10 -30, -4 -62, 0 -78 C 4 -62, 10 -30, 0 0Z'
    g = [f'<path d="{folha}" transform="rotate({a})"/>' for a in (-34, 0, 34)]
    return (f'<g transform="translate({x} {y}) scale({s * vira} {s})" fill="{cor}" opacity="{op}">' + "".join(g) + '</g>')

def svg():
    p = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">',
         '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3D6BE1"/>'
         '<stop offset="1" stop-color="#3160D8"/></linearGradient></defs>',
         f'<rect width="{W}" height="{H}" fill="url(#g)"/>',
         # Onda clara em cima e onda escura embaixo.
         '<path d="M0 0H1920V40C1700 64 1520 22 1300 38S880 70 640 44S220 22 0 52Z" fill="#5D88EE" opacity="0.7"/>',
         '<path d="M0 0H1920V18C1720 34 1500 8 1260 20S860 40 600 24S200 8 0 28Z" fill="#7FA1F3" opacity="0.6"/>',
         '<path d="M0 1080H1920V968C1720 920 1540 1000 1310 962S900 900 660 952S240 1000 0 944Z" fill="#2A55C8" opacity="0.55"/>',
         '<path d="M0 1080H1920V1018C1700 990 1480 1046 1240 1016S840 978 600 1012S220 1046 0 1006Z" fill="#234BB8" opacity="0.55"/>']
    for x, y, s, op in ((1110, 150, 0.8, 0.16), (1250, 250, 0.55, 0.13), (1650, 130, 1.0, 0.16), (60, 640, 0.6, 0.12)):
        p.append(nuvem(x, y, s, op))
    for x, y, r in ((70, 330, 14), (1268, 300, 18), (60, 760, 11), (1290, 620, 12), (980, 990, 10), (420, 1000, 13),
                    (1780, 520, 16), (1880, 300, 10), (740, 168, 9), (1450, 240, 12)):
        p.append(estrela(x, y, r, "#FFE08A", 0.75))
    for x, y in ((240, 300), (880, 280), (1180, 980), (300, 960), (1600, 900), (40, 520), (1240, 450)):
        p.append(f'<circle cx="{x}" cy="{y}" r="5" fill="#FFFFFF" opacity="0.22"/>')
    for x, y, s, vira in ((70, 1060, 1.1, 1), (150, 1068, 0.75, -1), (1250, 1062, 0.9, -1), (1190, 1070, 0.6, 1),
                          (1800, 1060, 1.0, 1), (640, 1074, 0.5, 1)):
        p.append(ramo(x, y, s, "#1E44AE", 0.6, vira))
    p.append('</svg>')
    return "".join(p)

if __name__ == "__main__":
    open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "fundo-cena.svg"), "w", encoding="utf8").write(svg())
    print("ok")
