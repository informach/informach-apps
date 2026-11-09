"""Folhas de sprites e parâmetros de emissão dos efeitos visuais do Morada (sem Blender).

Uso: python3 -I efeitos_sprites.py <saida>      (ex.: SP/efeitos_out)

Para cada efeito grava em <saida>/<id>/:
  <id>_folha.png   quadros de 128 px em grade, fundo transparente
  <id>.json        parâmetros de emissão (ver FORMATO abaixo)
e, em <saida>/: efeitos.json (índice), folha_efeitos.png (todas as folhas, para conferência) e as faixas usadas pelos
GLB com {"anima": "trocar"} (_faixas/*.png, lidas por efeitos_glb.py).

Estilo: o mesmo traço dos ícones (icones_desenhos.py): formas boleadas, contorno no tom escuro da própria cor (ou o
grafite da paleta nos indicadores), cores de CORES. O que o motor tinge (fumaça, vapor, confete) é desenhado em branco e
cinza: a cor da partícula multiplica a folha.

FORMATO (<id>.json, metros e segundos, Y para cima como no glTF):
  folha:     arquivo, colunas, linhas, quadros, quadro_px, modo ("vida": o quadro segue a idade da partícula;
             "laco": toca em fps e repete; "variante": cada partícula sorteia um quadro e fica nele; "variante_laco": cada partícula sorteia uma linha da
             grade e toca as colunas dela em laço, como o confete), fps
  emissao:   taxa (partículas/s), rajada (de uma vez, a cada `repete` s; 0 = contínuo), max, forma
             ({tipo: ponto|disco|esfera|caixa|anel, raio, tamanho}), deslocamento (a partir da âncora), ancora
  particula: vida [mín, máx]; velocidade {direcao, min, max, abertura (graus)}; gravidade (m/s², positivo puxa para
             baixo, negativo faz subir); arrasto (1/s); tamanho [[t, m], ...] (lado do quadro, t = idade de 0 a 1);
             cor [[t, "#RRGGBB", alfa], ...] (multiplica a folha); rotacao {inicial, velocidade} (graus, graus/s);
             opcionais: balanco {amplitude, frequencia}, orbita {raio, velocidade, altura}, cores_aleatorias
  render:    mistura (normal|aditiva), orientacao (camera: billboard; chao: deitado, para decalques; camera_y:
             billboard que só gira em Y), luz_propria (não escurece à noite), noite (multiplicador da cor à noite)
  icone:     (só os balões) area [cx, cy, lado] do ícone dentro do quadro, em fração de 0 a 1
  glb:       arquivo, laco (s), animacao (nome do clipe), e o que tem de extras
"""
import json
import math
import os
import random
import shutil
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import icones_desenhos as D  # noqa: E402
from icones_desenhos import C, _f, escuro, claro, mistura  # noqa: E402

TINTA = D.TINTA


def suave(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def tr(t, a, b):
    """0 antes de a, 1 depois de b, rampa suave no meio."""
    return suave((t - a) / max(1e-6, b - a))


def contorno(cor, w=4):
    return f'stroke="{cor}" stroke-width="{_f(w)}" stroke-linejoin="round" stroke-linecap="round"'


def circ(cx, cy, r, fill, stroke=None, w=4, op=None):
    s = contorno(stroke, w) if stroke else 'stroke="none"'
    o = f' opacity="{_f(op)}"' if op is not None else ""
    return f'<circle cx="{_f(cx)}" cy="{_f(cy)}" r="{_f(max(r, 0.01))}" fill="{fill}" {s}{o}/>'


def path(d, fill, stroke=None, w=4, op=None):
    s = contorno(stroke, w) if stroke else 'stroke="none"'
    o = f' opacity="{_f(op)}"' if op is not None else ""
    return f'<path d="{d}" fill="{fill}" {s}{o}/>'


def blob(cx, cy, r, seed, n=9, irregular=0.28, fase=0.0):
    """Mancha boleada fechada (curvas suaves por pontos com raio sorteado)."""
    rnd = random.Random(seed)
    raios = [r * (1 + irregular * (rnd.random() * 2 - 1)) for _ in range(n)]
    pts = [(cx + raios[k] * math.cos(2 * math.pi * k / n + fase), cy + raios[k] * math.sin(2 * math.pi * k / n + fase))
           for k in range(n)]
    d = ""
    for k in range(n):
        p0, p1 = pts[k], pts[(k + 1) % n]
        m = ((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2)
        if k == 0:
            m0 = ((pts[-1][0] + p0[0]) / 2, (pts[-1][1] + p0[1]) / 2)
            d += f"M{_f(m0[0])} {_f(m0[1])} "
        d += f"Q{_f(p0[0])} {_f(p0[1])} {_f(m[0])} {_f(m[1])} "
    return d + "Z"


def nuvem_bolas(bolas, fill, stroke, w=4, op=None, brilho=True):
    """União de círculos com contorno só por fora: desenha os contornos (mais grossos) e depois os preenchimentos."""
    o = f' opacity="{_f(op)}"' if op is not None else ""
    out = f"<g{o}>"
    out += "".join(circ(x, y, r + w / 2, stroke) for x, y, r in bolas)
    out += "".join(circ(x, y, r - w / 2, fill) for x, y, r in bolas)
    if brilho and bolas:
        x, y, r = max(bolas, key=lambda b: b[2])
        out += f'<ellipse cx="{_f(x - r * 0.35)}" cy="{_f(y - r * 0.4)}" rx="{_f(r * 0.3)}" ry="{_f(r * 0.16)}" ' \
               f'transform="rotate(-30 {_f(x - r * 0.35)} {_f(y - r * 0.4)})" fill="#FFFFFF" opacity=".75"/>'
    return out + "</g>"


def nuvem_sombreada(bolas, luz, sombra, traco, w=2.5, op=None):
    """Nuvenzinha de cartum que lê sobre fundo claro: contorno fino, a união das bolas na cor da sombra e, por cima,
    cada bola um pouco menor e deslocada para o alto e para a esquerda na cor clara (a sombra sobra nas bordas de baixo)."""
    o = f' opacity="{_f(op)}"' if op is not None else ""
    out = f"<g{o}>"
    out += "".join(circ(x, y, r + w / 2, traco) for x, y, r in bolas)
    out += "".join(circ(x, y, r - w / 2, sombra) for x, y, r in bolas)
    out += "".join(circ(x - r * 0.12, y - r * 0.16, r * 0.8, luz) for x, y, r in bolas)
    x, y, r = max(bolas, key=lambda b: b[2])
    out += f'<ellipse cx="{_f(x - r * 0.35)}" cy="{_f(y - r * 0.42)}" rx="{_f(r * 0.28)}" ry="{_f(r * 0.14)}" ' \
           f'transform="rotate(-30 {_f(x - r * 0.35)} {_f(y - r * 0.42)})" fill="#FFFFFF" opacity=".9"/>'
    return out + "</g>"


# ---------------------------------------------------------------------------------------------------------------------
# quadros de cada efeito: f(u, k, n) -> miolo SVG de 128 × 128 (u de 0 a 1 ao longo dos quadros)
# ---------------------------------------------------------------------------------------------------------------------
AGUA_C = C["azul_celeste"]
AGUA_E = C["azul_medio"]


def q_espuma(u, k, n):
    cresce = tr(u, 0.0, 0.25)
    some = tr(u, 0.78, 1.0)
    esc = (0.35 + 0.65 * cresce) * (1 - 0.85 * some)
    base = [(64, 70, 26), (40, 76, 18), (88, 76, 19), (54, 50, 17), (78, 52, 15), (64, 88, 14)]
    bolas = []
    for j, (x, y, r) in enumerate(base):
        w = 1 + 0.08 * math.sin(2 * math.pi * (u * 3 + j * 0.37))
        bolas.append((64 + (x - 64) * esc, 70 + (y - 70) * esc, r * esc * w))
    out = nuvem_bolas(bolas, "#FFFFFF", C["azul_acinzentado"], 4)
    out += "".join(circ(64 + (x - 64) * esc + r * esc * 0.3, 70 + (y - 70) * esc + r * esc * 0.25, r * esc * 0.12,
                        C["porcelana_azul"]) for x, y, r in base[:4])
    if some > 0.05:
        for j in range(6):
            a = 2 * math.pi * j / 6 + 0.3
            d = 30 + 26 * some
            out += circ(64 + d * math.cos(a), 70 + d * math.sin(a), 4 * (1 - some) + 1, "#FFFFFF", C["azul_acinzentado"], 3)
    return out


def q_bolhas(u, k, n):
    cresce = tr(u, 0.0, 0.18)
    estoura = tr(u, 0.82, 0.86)
    if estoura < 1:
        r = 14 + 34 * cresce
        rx = r * (1 + 0.06 * math.sin(u * 22))
        ry = r * (1 - 0.06 * math.sin(u * 22))
        return (f'<ellipse cx="64" cy="64" rx="{_f(rx)}" ry="{_f(ry)}" fill="{C["azul_bebe"]}" fill-opacity=".38" '
                f'{contorno(C["azul_celeste"], 4.5)}/>'
                f'<path d="M{_f(64 - rx * 0.62)} {_f(64 - ry * 0.18)} A{_f(rx * 0.66)} {_f(ry * 0.66)} 0 0 1 '
                f'{_f(64 - rx * 0.12)} {_f(64 - ry * 0.64)}" fill="none" {contorno("#FFFFFF", 5)}/>'
                + circ(64 + rx * 0.42, 64 + ry * 0.4, r * 0.08, "#FFFFFF")
                + f'<ellipse cx="64" cy="64" rx="{_f(rx * 0.94)}" ry="{_f(ry * 0.94)}" fill="none" '
                  f'stroke="{C["rosa_claro"]}" stroke-width="2" opacity=".6" stroke-dasharray="{_f(rx)} {_f(rx * 2)}"/>')
    t = tr(u, 0.86, 1.0)
    out = ""
    for j in range(8):
        a = 2 * math.pi * j / 8
        r0, r1 = 40 + 14 * t, 50 + 18 * t
        out += (f'<path d="M{_f(64 + r0 * math.cos(a))} {_f(64 + r0 * math.sin(a))} L{_f(64 + r1 * math.cos(a))} '
                f'{_f(64 + r1 * math.sin(a))}" {contorno(C["azul_celeste"], 5 * (1 - t) + 1)} opacity="{_f(1 - t * 0.8)}"/>')
        out += circ(64 + (r1 + 6) * math.cos(a + 0.4), 64 + (r1 + 6) * math.sin(a + 0.4), 3.5 * (1 - t) + 0.5,
                    C["azul_bebe"], C["azul_celeste"], 2)
    return out


def q_vapor(u, k, n):
    cresce = tr(u, 0.0, 0.45)
    esc = 0.4 + 0.6 * cresce
    sobe = u * 18
    curva = math.sin(u * math.pi * 1.5) * 10
    bolas = [(64 + curva, 78 - sobe, 22 * esc), (48 + curva * 0.5, 64 - sobe, 16 * esc), (78 + curva * 1.2, 58 - sobe, 18 * esc),
             (62 + curva * 1.4, 44 - sobe, 14 * esc * (1 - 0.3 * u))]
    if u > 0.55:  # desfia em fiapos
        s = tr(u, 0.55, 1.0)
        bolas = [(x + (x - 64) * s * 0.6, y - s * 6, r * (1 - 0.55 * s)) for x, y, r in bolas]
    return nuvem_sombreada(bolas, "#FFFFFF", mistura("#FFFFFF", C["azul_acinzentado"], 0.32), C["cinza_azulado"], 2.5,
                           op=1 - 0.2 * u)


def q_respingos(u, k, n):
    out = ""
    base = 108
    cr = tr(u, 0, 0.22) * (1 - tr(u, 0.5, 0.85))
    if cr > 0.02:  # coroa d'água na base
        w = 18 + 18 * tr(u, 0, 0.45)
        h = 38 * cr
        pontas = [(-1.0, 0.0), (-0.78, 0.75), (-0.55, 0.35), (-0.3, 1.0), (0.0, 0.45), (0.3, 1.0), (0.55, 0.35),
                  (0.78, 0.75), (1.0, 0.0)]
        d = f"M{_f(64 - w - 6)} {base} "
        for px, ph in pontas:
            d += f"L{_f(64 + px * w)} {_f(base - ph * h)} "
        d += f"L{_f(64 + w + 6)} {base} Z"
        out += path(d, C["agua"], AGUA_E, 4)
        out += f'<ellipse cx="64" cy="{base}" rx="{_f(w + 10)}" ry="5" fill="{C["agua"]}" {contorno(AGUA_E, 3.5)}/>'
    for j in range(6):
        a = (j - 2.5) / 2.5
        vx, vy = a * 62, -(270 - 60 * abs(a))
        t = u * 0.95
        x, y = 64 + vx * t, base - 12 + vy * t + 240 * t * t
        if y > base - 2 or u < 0.03:
            continue
        vyy = vy + 480 * t
        ang = math.degrees(math.atan2(-vx, vyy))
        r = 5.5 * (1 - 0.35 * u) + 1.5
        out += f'<g transform="rotate({_f(ang)} {_f(x)} {_f(y)})">' + \
            path(D.P(D.GOTA, x, y, r, r * 1.5), C["agua"], AGUA_E, 3) + "</g>"
    return out


def q_gotas(u, k, n):
    st = 1 + 0.12 * math.sin(2 * math.pi * u)
    return (path(D.P(D.GOTA, 64, 64, 30 / st, 40 * st), C["agua"], AGUA_E, 4.5) +
            f'<ellipse cx="54" cy="68" rx="6" ry="11" transform="rotate(20 54 68)" fill="#FFFFFF" opacity=".75"/>')


def q_fumaca(u, k, n):
    cresce = tr(u, 0.0, 0.5)
    esc = 0.35 + 0.65 * cresce
    rnd = random.Random(7)
    bolas = []
    for j in range(6):
        a = 2 * math.pi * j / 6 + u * 0.8
        d = 18 * esc + 4 * math.sin(u * 6 + j)
        bolas.append((64 + d * math.cos(a), 66 + d * math.sin(a) * 0.8, (14 + rnd.random() * 8) * esc))
    bolas.append((64, 64, 22 * esc))
    if u > 0.6:
        s = tr(u, 0.6, 1.0)
        bolas = [(x + (x - 64) * s * 0.5, y + (y - 64) * s * 0.5, r * (1 - 0.6 * s)) for x, y, r in bolas]
    return nuvem_sombreada(bolas, "#F2F2F2", mistura("#F2F2F2", C["cinza_azulado"], 0.45), C["grafite"], 2.5)


def q_fogo(u, k, n):
    cresce = tr(u, 0.0, 0.2)
    some = tr(u, 0.6, 1.0)
    h = (34 + 50 * cresce) * (1 - 0.75 * some)
    w = (20 + 14 * cresce) * (1 - 0.6 * some)
    bal = math.sin(u * 2 * math.pi * 2) * 8 * (1 - some * 0.5)
    base = 104 - some * 30

    def lingua(hh, ww, b):
        tip_x, tip_y = 64 + b, base - hh
        return (f"M{_f(64 - ww)} {_f(base - ww * 0.4)} C{_f(64 - ww)} {_f(base - hh * 0.45)} {_f(tip_x - ww * 0.3)} "
                f"{_f(tip_y + hh * 0.3)} {_f(tip_x)} {_f(tip_y)} C{_f(tip_x + ww * 0.2)} {_f(tip_y + hh * 0.35)} "
                f"{_f(64 + ww)} {_f(base - hh * 0.4)} {_f(64 + ww)} {_f(base - ww * 0.4)} "
                f"C{_f(64 + ww)} {_f(base + ww * 0.55)} {_f(64 - ww)} {_f(base + ww * 0.55)} {_f(64 - ww)} {_f(base - ww * 0.4)} Z")
    return (path(lingua(h, w, bal), C["laranja"], C["vermelho_escuro"], 4.5) +
            path(lingua(h * 0.66, w * 0.64, bal * 0.6), C["amarelo"], None) +
            path(lingua(h * 0.36, w * 0.34, bal * 0.3), C["creme_claro"], None))


SUJ_CORES = [C["marrom"], C["terra"], C["vinho"], C["verde_oliva"], C["cinza_medio"], C["vermelho_escuro"],
             C["mostarda"], C["marrom_claro"]]


def q_sujeira_chao(u, k, n):
    rnd = random.Random(100 + k)
    if k == 0:  # barro
        out = path(blob(64, 66, 40, 11, 11, 0.32), C["marrom"], escuro(C["marrom"], 0.3), 3.5, op=0.92)
        out += "".join(path(blob(64 + 50 * math.cos(a), 66 + 48 * math.sin(a), 6, 12 + j, 7, 0.3), C["marrom"], None)
                       for j, a in enumerate((0.4, 1.9, 3.3, 4.6, 5.6)))
        return out + path(blob(52, 56, 12, 13, 7, 0.3), claro(C["marrom"], 0.2), None)
    if k == 1:  # pegadas
        out = ""
        for j, (x, y, a) in enumerate(((44, 80, -12), (82, 46, 14))):
            out += f'<g transform="rotate({a} {x} {y})">' + \
                path(D.P("M0 -24 C10 -24 13 -8 11 4 C9 14 6 22 0 22 C-6 22 -9 14 -11 4 C-13 -8 -10 -24 0 -24 Z", x, y, 1),
                     C["marrom"], escuro(C["marrom"], 0.3), 3, op=0.85) + "</g>"
        return out
    if k == 2:  # farelos
        return "".join(path(blob(rnd.uniform(24, 104), rnd.uniform(24, 104), rnd.uniform(3, 7), 200 + j, 6, 0.3),
                            rnd.choice([C["madeira_mel"], C["caramelo"], C["pinus"]]), escuro(C["caramelo"], 0.3), 2.5)
                       for j in range(16))
    if k == 3:  # suco derramado
        return (path(blob(60, 68, 38, 31, 10, 0.35), C["violeta"], escuro(C["violeta"], 0.3), 3.5, op=0.72) +
                path(blob(50, 56, 10, 32, 7, 0.2), "#FFFFFF", None, op=0.35) + circ(104, 30, 6, C["violeta"], None, op=0.72))
    if k == 4:  # gordura
        return (path(blob(64, 64, 34, 41, 10, 0.22), C["mostarda"], None, op=0.45) +
                path(blob(64, 64, 20, 42, 8, 0.2), C["amarelo_escuro"], None, op=0.4) +
                circ(54, 54, 5, "#FFFFFF", None, op=0.5) + circ(76, 70, 3, "#FFFFFF", None, op=0.5))
    if k == 5:  # poeira (bolinhos de pó)
        out = ""
        for j in range(3):
            x, y, r = (46, 70, 16), (84, 60, 12), (66, 92, 9)
            x, y, r = [(46, 70, 16), (84, 60, 12), (66, 92, 9)][j]
            out += nuvem_bolas([(x + r * 0.5 * math.cos(a), y + r * 0.5 * math.sin(a), r * 0.6) for a in (0, 2.1, 4.2)] +
                               [(x, y, r * 0.7)], C["cinza_claro"], C["cinza_medio"], 3, brilho=False)
        return out
    if k == 6:  # molho de tomate
        out = path(blob(60, 64, 30, 61, 9, 0.38), C["vermelho"], C["vermelho_escuro"], 3.5, op=0.9)
        out += "".join(circ(60 + 46 * math.cos(a), 64 + 44 * math.sin(a), 5, C["vermelho"], C["vermelho_escuro"], 2.5)
                       for a in (0.2, 1.4, 3.0, 4.4))
        return out + circ(52, 56, 6, "#FFFFFF", None, op=0.45)
    # k == 7: água suja
    return (path(blob(64, 66, 42, 71, 12, 0.25), C["azul_acinzentado"], escuro(C["azul_acinzentado"], 0.25), 3.5, op=0.6) +
            path(blob(52, 56, 12, 72, 7, 0.25), "#FFFFFF", None, op=0.35))


def q_sujeira_louca(u, k, n):
    rnd = random.Random(300 + k)
    if k == 0:  # molho espalhado
        return (path(blob(64, 64, 36, 81, 11, 0.4), C["vermelho"], None, op=0.75) +
                path(blob(70, 70, 16, 82, 8, 0.3), C["vermelho_escuro"], None, op=0.6))
    if k == 1:  # arroz
        out = ""
        for j in range(22):
            x, y, a = rnd.uniform(28, 100), rnd.uniform(28, 100), rnd.uniform(0, 180)
            out += f'<ellipse cx="{_f(x)}" cy="{_f(y)}" rx="6" ry="3" transform="rotate({_f(a)} {_f(x)} {_f(y)})" ' \
                   f'fill="#FFFFFF" {contorno(C["cinza"], 2)}/>'
        return out
    if k == 2:  # feijão
        out = path(blob(64, 64, 30, 91, 10, 0.3), C["marrom"], None, op=0.55)
        for j in range(12):
            x, y, a = rnd.uniform(36, 92), rnd.uniform(36, 92), rnd.uniform(0, 180)
            out += f'<ellipse cx="{_f(x)}" cy="{_f(y)}" rx="6" ry="4" transform="rotate({_f(a)} {_f(x)} {_f(y)})" ' \
                   f'fill="{C["chocolate"]}" {contorno(escuro(C["chocolate"], 0.3), 2)}/>'
        return out
    if k == 3:  # migalhas
        return "".join(path(blob(rnd.uniform(26, 102), rnd.uniform(26, 102), rnd.uniform(2.5, 6), 400 + j, 6, 0.3),
                            rnd.choice([C["madeira_mel"], C["pinus"], C["caramelo"]]), escuro(C["caramelo"], 0.35), 2)
                       for j in range(18))
    if k == 4:  # anel de gordura
        return (f'<circle cx="64" cy="64" r="38" fill="none" stroke="{C["mostarda"]}" stroke-width="10" opacity=".45"/>' +
                path(blob(48, 70, 12, 101, 8, 0.3), C["amarelo_escuro"], None, op=0.4))
    if k == 5:  # folhas de salada
        out = ""
        for j, (x, y, a) in enumerate(((50, 56, 20), (78, 66, -30), (60, 84, 70))):
            out += f'<g transform="rotate({a} {x} {y})">' + \
                path(D.P("M-14 0 Q0 -12 14 0 Q0 12 -14 0 Z", x, y, 1), C["folha_clara"], C["folha_escura"], 2.5) + \
                f'<path d="M{x - 10} {y} H{x + 10}" {contorno(C["folha_escura"], 2)}/></g>'
        return out
    if k == 6:  # queimadinho
        return "".join(path(blob(rnd.uniform(30, 98), rnd.uniform(30, 98), rnd.uniform(5, 11), 500 + j, 7, 0.4),
                            C["carvao"], None, op=0.85) for j in range(9))
    # k == 7: borra de café
    return (f'<circle cx="64" cy="64" r="34" fill="none" stroke="{C["marrom"]}" stroke-width="6" opacity=".6"/>' +
            path(blob(64, 64, 24, 111, 9, 0.3), C["marrom_claro"], None, op=0.4))


def q_moscas(u, k, n):
    a = [-38, -6, 30, -6][k % 4]
    asa = (f'<ellipse cx="0" cy="-16" rx="11" ry="20" fill="{C["porcelana_azul"]}" fill-opacity=".8" '
           f'{contorno(C["cinza_azulado"], 3)}/>')
    return (f'<g opacity=".55">' + circ(64, 74, 22, "#FFFFFF") + circ(64, 52, 16, "#FFFFFF") + "</g>" +
            f'<g transform="translate(52 66) rotate({a})">{asa}</g>'
            f'<g transform="translate(76 66) rotate({-a})">{asa}</g>' +
            f'<ellipse cx="64" cy="74" rx="16" ry="20" fill="{C["grafite"]}" {contorno(TINTA, 3.5)}/>' +
            f'<path d="M50 74 H78 M52 84 H76" {contorno(C["cinza_medio"], 3)}/>' +
            circ(64, 52, 12, C["grafite"], TINTA, 3.5) + circ(57, 50, 5, C["vermelho"], TINTA, 2) +
            circ(71, 50, 5, C["vermelho"], TINTA, 2) + circ(56, 48, 1.6, "#FFFFFF"))


def q_cheiro_ruim(u, k, n):
    out = ""
    cresce = tr(u, 0, 0.25)
    some = tr(u, 0.7, 1.0)
    for j, x0 in enumerate((40, 64, 88)):
        h = 70 * cresce
        fase = u * 2 * math.pi * 1.5 + j * 1.3
        pts = []
        for s in range(13):
            t = s / 12
            pts.append((x0 + 9 * math.sin(fase + t * 2 * math.pi), 104 - 6 * j % 12 - t * h - u * 10))
        d = "M" + " L".join(f"{_f(x)} {_f(y)}" for x, y in pts)
        op = 1 - some
        out += f'<path d="{d}" fill="none" {contorno(C["verde_floresta"], 12)} opacity="{_f(op)}"/>'
        out += f'<path d="{d}" fill="none" {contorno(C["verde_lima"], 6)} opacity="{_f(op)}"/>'
    return out


def q_brilho(u, k, n):
    s = math.sin(math.pi * u)
    s = s ** 0.7
    a = u * 90
    out = f'<g transform="rotate({_f(a)} 64 64)">' + \
        path(D.P(D.ESTRELA4, 64, 64, 50 * s + 0.5), C["amarelo_claro"], C["amarelo_escuro"], 4) + \
        path(D.P(D.ESTRELA4, 64, 64, 22 * s + 0.2), "#FFFFFF", None) + "</g>"
    for j, (x, y) in enumerate(((26, 30), (100, 96), (98, 28))):
        ss = max(0.0, math.sin(math.pi * min(1, max(0, u * 1.4 - j * 0.15))))
        out += circ(x, y, 6 * ss + 0.1, "#FFFFFF", C["amarelo_escuro"], 2.5)
    return out


def q_coracoes(u, k, n):
    b = 1 + 0.12 * math.sin(2 * math.pi * u) ** 3 if math.sin(2 * math.pi * u) > 0 else 1 - 0.04 * math.sin(2 * math.pi * u)
    return (path(D.P(D.CORACAO, 64, 66, 44 * b, 44 / b ** 0.5), C["rosa"], C["vermelho_escuro"], 4.5) +
            path(D.P(D.CORACAO, 64, 70, 30 * b, 30 / b ** 0.5), C["vermelho_claro"], None, op=0.55) +
            f'<ellipse cx="44" cy="44" rx="10" ry="6" transform="rotate(-35 44 44)" fill="#FFFFFF" opacity=".8"/>')


NOTAS_CORES = [C["roxo"], C["azul"], C["rosa_escuro"], C["verde_medio"]]


def q_notas(u, k, n):
    cor = NOTAS_CORES[k % 4]
    e = escuro(cor, 0.35)
    forma = k // 2 % 4 if k < 8 else 0
    forma = [0, 1, 2, 3, 1, 0, 3, 2][k]
    if forma == 0:  # semínima
        return (f'<path d="M78 24 V88" {contorno(e, 12)}/><path d="M78 24 V88" {contorno(cor, 6)}/>' +
                f'<ellipse cx="62" cy="92" rx="18" ry="13" transform="rotate(-20 62 92)" fill="{cor}" {contorno(e, 4.5)}/>')
    if forma == 1:  # colcheia
        return (f'<path d="M74 22 V88" {contorno(e, 12)}/><path d="M74 22 V88" {contorno(cor, 6)}/>' +
                path("M74 22 C90 30 100 42 92 62 C92 48 86 42 74 40 Z", cor, e, 4.5) +
                f'<ellipse cx="58" cy="92" rx="18" ry="13" transform="rotate(-20 58 92)" fill="{cor}" {contorno(e, 4.5)}/>')
    if forma == 2:  # duas colcheias
        return (path("M44 34 L96 22 V36 L44 48 Z", cor, e, 4.5) +
                f'<path d="M46 36 V90 M94 24 V80" {contorno(e, 12)}/><path d="M46 36 V90 M94 24 V80" {contorno(cor, 6)}/>' +
                f'<ellipse cx="34" cy="92" rx="15" ry="11" transform="rotate(-20 34 92)" fill="{cor}" {contorno(e, 4.5)}/>' +
                f'<ellipse cx="82" cy="82" rx="15" ry="11" transform="rotate(-20 82 82)" fill="{cor}" {contorno(e, 4.5)}/>')
    # 3: clave de sol simplificada (espiral)
    return (path("M66 108 C52 108 52 94 62 94 C70 94 70 104 64 104", "none", e, 10) +
            f'<path d="M64 104 V20 C80 24 82 44 64 56 C42 70 40 92 64 94 C86 96 90 72 68 70 C52 68 52 86 64 86" '
            f'fill="none" {contorno(e, 11)}/>'
            f'<path d="M64 104 V20 C80 24 82 44 64 56 C42 70 40 92 64 94 C86 96 90 72 68 70 C52 68 52 86 64 86" '
            f'fill="none" {contorno(cor, 5)}/>')


def letra_z(cx, cy, s, rot):
    d = D.P("M-22 -22 H22 L-22 22 H22", cx, cy, s)
    return (f'<g transform="rotate({_f(rot)} {cx} {cy})"><path d="{d}" fill="none" {contorno(TINTA, 22 * s)}/>'
            f'<path d="{d}" fill="none" {contorno("#FFFFFF", 12 * s)}/></g>')


def q_zzz(u, k, n):
    return letra_z(64, 64, 1.4 * (1 + 0.05 * math.sin(2 * math.pi * u)), 10 * math.sin(2 * math.pi * u))


def q_suor(u, k, n):
    if u < 0.75:
        cresce = tr(u, 0, 0.3)
        estica = tr(u, 0.35, 0.75)
        sx = (10 + 14 * cresce) * (1 - 0.25 * estica)
        sy = (14 + 18 * cresce) * (1 + 0.45 * estica)
        y = 46 + 34 * estica
        return path(D.P(D.GOTA, 64, y, sx, sy), C["azul_bebe"], C["azul_celeste"], 4) + \
            f'<ellipse cx="{_f(64 - sx * 0.3)}" cy="{_f(y + sy * 0.15)}" rx="{_f(sx * 0.18)}" ry="{_f(sy * 0.3)}" ' \
            f'fill="#FFFFFF" opacity=".8"/>'
    t = tr(u, 0.75, 1.0)
    out = f'<ellipse cx="64" cy="108" rx="{_f(14 + 16 * t)}" ry="{_f(5 + 2 * t)}" fill="{C["azul_bebe"]}" ' \
          f'{contorno(C["azul_celeste"], 3.5)} opacity="{_f(1 - t * 0.6)}"/>'
    for j in (-1, 1):
        out += circ(64 + j * (16 + 14 * t), 96 - 10 * t, 4 * (1 - t) + 1, C["azul_bebe"], C["azul_celeste"], 2.5)
    return out


def q_raiva(u, k, n):
    p = math.sin(2 * math.pi * u)
    bolas = [(44 + 2 * p, 64, 20 + 2 * p), (64, 52, 24 - p), (86 - 2 * p, 62, 20 + 2 * p), (64, 72, 20), (34, 76, 13),
             (94, 76, 13)]
    halo = "".join(circ(x, y, r + 6, "#FFFFFF") for x, y, r in bolas)  # halo claro: lê na cena de noite
    out = f'<g opacity=".55">{halo}</g>' + nuvem_bolas(bolas, C["grafite"], TINTA, 4.5, brilho=False)
    out += circ(50, 50, 5, C["cinza_medio"], None, op=0.7)
    # olhinhos bravos da nuvem
    out += f'<path d="M46 62 L58 68 M82 62 L70 68" {contorno(C["vermelho_claro"], 5)}/>'
    if k % 4 in (1, 2):  # raio piscando
        out += path("M70 82 L56 104 H66 L60 122 L80 96 H70 L76 82 Z", C["amarelo"], C["laranja_escuro"], 3.5)
    if k % 2 == 0:
        out += path("M98 30 L104 22 M108 38 L118 36 M92 24 L92 14", "none", C["vermelho"], 4)
    return out


CONFETE = [("papel", C["rosa"]), ("circulo", C["amarelo"]), ("serpentina", C["azul_celeste"]), ("papel", C["verde_claro"]),
           ("circulo", C["laranja"]), ("serpentina", C["roxo"])]


def q_confete(u, k, n):
    """Linha = peça (papel, círculo ou serpentina, cada uma numa cor), coluna = quadro do giro."""
    tipo, cor = CONFETE[k // 4]
    a = 2 * math.pi * (k % 4) / 4 + 0.4  # nenhum quadro de perfil: a peça não some no giro
    e = escuro(cor, 0.3)
    c2 = mistura(cor, "#FFFFFF", 0.3) if math.cos(a) > 0 else escuro(cor, 0.08)  # frente clara, verso mais escuro
    if tipo == "papel":
        w = 52 * abs(math.cos(a)) + 10
        return (f'<rect x="{_f(64 - w / 2)}" y="44" width="{_f(w)}" height="40" rx="6" fill="{c2}" {contorno(e, 4)} '
                f'transform="rotate({_f(25 + 20 * math.sin(a))} 64 64)"/>')
    if tipo == "circulo":
        rx = 26 * abs(math.cos(a)) + 6
        return (f'<ellipse cx="64" cy="64" rx="{_f(rx)}" ry="26" fill="{c2}" {contorno(e, 4)} '
                f'transform="rotate({_f(-20 + 15 * math.sin(a))} 64 64)"/>' +
                f'<ellipse cx="{_f(64 - rx * 0.3)}" cy="54" rx="{_f(rx * 0.25)}" ry="6" fill="#FFFFFF" opacity=".6"/>')
    # serpentina: fita em espiral que gira (a fase da onda anda)
    pts = []
    for j in range(40):
        t = j / 39
        ang = 2 * math.pi * 2.2 * t + a
        pts.append((24 + 80 * t, 64 + 22 * math.sin(ang) * (0.55 + 0.45 * t)))
    d = "M" + " L".join(f"{_f(x)} {_f(y)}" for x, y in pts)
    return (f'<path d="{d}" fill="none" {contorno(e, 16)}/>' f'<path d="{d}" fill="none" {contorno(cor, 9)}/>' +
            f'<path d="{d}" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" opacity=".55" '
            f'transform="translate(0 -2)"/>')


def q_balao_pensamento(u, k, n):
    p = math.sin(2 * math.pi * u)
    bolas = [(64, 52, 30 + p), (40, 56, 22 - p), (88, 56, 22 + p), (52, 34, 20), (78, 34, 20 - p), (64, 70, 24)]
    out = nuvem_bolas(bolas, "#FFFFFF", TINTA, 5, brilho=False)
    out += circ(36, 96, 9 + 0.8 * p, "#FFFFFF", TINTA, 4.5) + circ(24, 114, 5.5, "#FFFFFF", TINTA, 4)
    return out


def q_balao_fala(u, k, n):
    p = math.sin(2 * math.pi * u)
    w, h = 96 + 2 * p, 74 - 2 * p
    x, y = 64 - w / 2, 50 - h / 2
    return (path(f"M44 {_f(y + h - 4)} L34 112 L66 {_f(y + h - 4)} Z", "#FFFFFF", TINTA, 5) +
            f'<rect x="{_f(x)}" y="{_f(y)}" width="{_f(w)}" height="{_f(h)}" rx="30" fill="#FFFFFF" {contorno(TINTA, 5)}/>' +
            f'<path d="M42 {_f(y + h - 6)} L58 {_f(y + h - 6)}" {contorno("#FFFFFF", 8)}/>')


# ---------------------------------------------------------------------------------------------------------------------
# definição de cada efeito
# ---------------------------------------------------------------------------------------------------------------------
def cor(t, h, a=1.0):
    return [t, h, a]


EFEITOS = [
    dict(id="espuma", rotulo="Espuma", usos=["banho", "banheira", "louça na pia"], grupo="água e limpeza", desenho=q_espuma,
         folha=(4, 4, 16, "vida", 12),
         emissao=dict(taxa=9, rajada=0, max=48, forma={"tipo": "disco", "raio": 0.4}, deslocamento=[0, 0.02, 0],
                      ancora="superficie"),
         particula=dict(vida=[1.6, 2.6], velocidade={"direcao": [0, 1, 0], "min": 0.02, "max": 0.08, "abertura": 30},
                        gravidade=0, arrasto=1.5, tamanho=[[0, 0.16], [0.3, 0.26], [1, 0.28]],
                        cor=[cor(0, "#FFFFFF", 1), cor(1, "#FFFFFF", 1)], rotacao={"inicial": [0, 360], "velocidade": [-10, 10]}),
         render=dict(mistura="normal", orientacao="camera", luz_propria=False, noite=0.6)),
    dict(id="bolhas", rotulo="Bolhas", usos=["banho", "louça", "brincadeira"], grupo="água e limpeza", desenho=q_bolhas,
         folha=(4, 4, 16, "vida", 12),
         emissao=dict(taxa=4, rajada=0, max=24, forma={"tipo": "disco", "raio": 0.3}, deslocamento=[0, 0.05, 0],
                      ancora="superficie"),
         particula=dict(vida=[2.2, 3.4], velocidade={"direcao": [0, 1, 0], "min": 0.15, "max": 0.3, "abertura": 25},
                        gravidade=-0.02, arrasto=0.4, tamanho=[[0, 0.09], [1, 0.16]],
                        cor=[cor(0, "#FFFFFF", 0), cor(0.08, "#FFFFFF", 1), cor(1, "#FFFFFF", 1)],
                        rotacao={"inicial": [0, 0], "velocidade": [0, 0]}, balanco={"amplitude": 0.04, "frequencia": 0.8}),
         render=dict(mistura="normal", orientacao="camera", luz_propria=False, noite=0.7)),
    dict(id="vapor", rotulo="Vapor", usos=["chuveiro", "panela", "café", "chaleira"], grupo="água e limpeza", desenho=q_vapor,
         folha=(4, 4, 16, "vida", 12),
         emissao=dict(taxa=5, rajada=0, max=30, forma={"tipo": "disco", "raio": 0.06}, deslocamento=[0, 0.02, 0],
                      ancora="boca"),
         particula=dict(vida=[1.8, 2.6], velocidade={"direcao": [0, 1, 0], "min": 0.18, "max": 0.3, "abertura": 14},
                        gravidade=-0.03, arrasto=0.5, tamanho=[[0, 0.1], [0.5, 0.26], [1, 0.38]],
                        cor=[cor(0, "#FFFFFF", 0), cor(0.15, "#FFFFFF", 0.8), cor(0.7, "#F2F5F8", 0.5), cor(1, "#ECF0F4", 0)],
                        rotacao={"inicial": [-20, 20], "velocidade": [-15, 15]}, balanco={"amplitude": 0.03, "frequencia": 0.5}),
         render=dict(mistura="normal", orientacao="camera", luz_propria=False, noite=0.55)),
    dict(id="respingos", rotulo="Respingos", usos=["pia", "banho", "poça", "chuva no chão"], grupo="água e limpeza",
         desenho=q_respingos, folha=(4, 4, 16, "vida", 16),
         emissao=dict(taxa=0, rajada=3, repete=0.6, max=12, forma={"tipo": "disco", "raio": 0.12}, deslocamento=[0, 0.005, 0],
                      ancora="superficie"),
         particula=dict(vida=[0.6, 0.8], velocidade={"direcao": [0, 1, 0], "min": 0, "max": 0, "abertura": 0}, gravidade=0,
                        arrasto=0, tamanho=[[0, 0.16], [1, 0.2]], cor=[cor(0, "#FFFFFF", 1), cor(1, "#FFFFFF", 1)],
                        rotacao={"inicial": [0, 0], "velocidade": [0, 0]}),
         render=dict(mistura="normal", orientacao="camera_y", luz_propria=False, noite=0.6)),
    dict(id="gotas", rotulo="Gotas d'água", usos=["chuveiro", "torneira pingando", "cabelo molhado"], grupo="água e limpeza",
         desenho=q_gotas, folha=(2, 2, 4, "laco", 10),
         emissao=dict(taxa=18, rajada=0, max=48, forma={"tipo": "disco", "raio": 0.1}, deslocamento=[0, 0, 0], ancora="bico"),
         particula=dict(vida=[0.7, 0.9], velocidade={"direcao": [0, -1, 0], "min": 0.6, "max": 1.0, "abertura": 8},
                        gravidade=9.8, arrasto=0, tamanho=[[0, 0.06], [1, 0.07]],
                        cor=[cor(0, "#FFFFFF", 1), cor(0.9, "#FFFFFF", 1), cor(1, "#FFFFFF", 0)],
                        rotacao={"inicial": [0, 0], "velocidade": [0, 0]}),
         render=dict(mistura="normal", orientacao="camera_y", luz_propria=False, noite=0.6)),
    dict(id="fumaca", rotulo="Fumaça", usos=["fogão queimando (escura)", "churrasqueira (clara)"], grupo="fogo e fumaça",
         desenho=q_fumaca, folha=(4, 4, 16, "vida", 10),
         emissao=dict(taxa=4, rajada=0, max=30, forma={"tipo": "disco", "raio": 0.1}, deslocamento=[0, 0.05, 0], ancora="boca"),
         particula=dict(vida=[2.4, 3.4], velocidade={"direcao": [0, 1, 0], "min": 0.25, "max": 0.4, "abertura": 16},
                        gravidade=-0.04, arrasto=0.35, tamanho=[[0, 0.15], [0.5, 0.4], [1, 0.62]],
                        cor=[cor(0, "#76808C", 0), cor(0.12, "#5E6C7D", 0.9), cor(0.7, "#9CA4AF", 0.55), cor(1, "#CBD0D7", 0)],
                        rotacao={"inicial": [0, 360], "velocidade": [-20, 20]}, balanco={"amplitude": 0.05, "frequencia": 0.3}),
         variantes={"queimando": [cor(0, "#2C313A", 0), cor(0.12, "#1E2127", 0.97), cor(0.7, "#2C313A", 0.75), cor(1, "#404752", 0)],
                    "churrasqueira": [cor(0, "#CBD0D7", 0), cor(0.12, "#ECF0F4", 0.8), cor(0.7, "#CBD0D7", 0.45),
                                      cor(1, "#F7F7F4", 0)]},
         render=dict(mistura="normal", orientacao="camera", luz_propria=False, noite=0.5)),
    dict(id="fogo", rotulo="Fogo pequeno", usos=["fogão pegando fogo", "panela esquecida"], grupo="fogo e fumaça", desenho=q_fogo,
         folha=(4, 4, 16, "vida", 16),
         emissao=dict(taxa=16, rajada=0, max=30, forma={"tipo": "disco", "raio": 0.12}, deslocamento=[0, 0, 0], ancora="tampo"),
         particula=dict(vida=[0.55, 0.85], velocidade={"direcao": [0, 1, 0], "min": 0.25, "max": 0.45, "abertura": 10},
                        gravidade=-0.4, arrasto=0.6, tamanho=[[0, 0.16], [0.4, 0.24], [1, 0.12]],
                        cor=[cor(0, "#FFFFFF", 1), cor(0.85, "#FFFFFF", 1), cor(1, "#FFFFFF", 0)],
                        rotacao={"inicial": [-8, 8], "velocidade": [0, 0]}),
         render=dict(mistura="normal", orientacao="camera_y", luz_propria=True, noite=1.0, luz={"cor": "#FF9A3C", "intensidade": 1.6,
                                                                                               "alcance": 2.5, "tremula": True})),
    dict(id="sujeira_chao", rotulo="Sujeira no chão", usos=["barro", "pegadas", "farelos", "suco", "gordura", "poeira", "molho",
                                                             "água suja"], grupo="sujeira", desenho=q_sujeira_chao,
         folha=(4, 2, 8, "variante", 0),
         emissao=dict(taxa=0, rajada=1, max=1, forma={"tipo": "ponto"}, deslocamento=[0, 0.003, 0], ancora="chao"),
         particula=dict(vida=[0, 0], velocidade={"direcao": [0, 1, 0], "min": 0, "max": 0, "abertura": 0}, gravidade=0, arrasto=0,
                        tamanho=[[0, 0.6], [1, 0.6]], cor=[cor(0, "#FFFFFF", 1), cor(1, "#FFFFFF", 1)],
                        rotacao={"inicial": [0, 360], "velocidade": [0, 0]}),
         render=dict(mistura="normal", orientacao="chao", luz_propria=False, noite=0.6, decalque=True,
                     sujar={"segundos_para_aparecer": 1.5, "limpar": "a opacidade vai a zero em 1 s"})),
    dict(id="sujeira_louca", rotulo="Louça suja", usos=["prato", "tigela", "panela", "caneca"], grupo="sujeira",
         desenho=q_sujeira_louca, folha=(4, 2, 8, "variante", 0),
         emissao=dict(taxa=0, rajada=1, max=1, forma={"tipo": "ponto"}, deslocamento=[0, 0.004, 0], ancora="tampo"),
         particula=dict(vida=[0, 0], velocidade={"direcao": [0, 1, 0], "min": 0, "max": 0, "abertura": 0}, gravidade=0, arrasto=0,
                        tamanho=[[0, 0.16], [1, 0.16]], cor=[cor(0, "#FFFFFF", 1), cor(1, "#FFFFFF", 1)],
                        rotacao={"inicial": [0, 360], "velocidade": [0, 0]}),
         render=dict(mistura="normal", orientacao="chao", luz_propria=False, noite=0.6, decalque=True)),
    dict(id="moscas", rotulo="Moscas", usos=["lixo cheio", "comida estragada", "louça suja há dias"], grupo="sujeira",
         desenho=q_moscas, folha=(2, 2, 4, "laco", 24),
         emissao=dict(taxa=0, rajada=4, max=4, forma={"tipo": "ponto"}, deslocamento=[0, 0.3, 0], ancora="topo"),
         particula=dict(vida=[0, 0], velocidade={"direcao": [0, 0, 0], "min": 0, "max": 0, "abertura": 0}, gravidade=0, arrasto=0,
                        tamanho=[[0, 0.13], [1, 0.13]], cor=[cor(0, "#FFFFFF", 1), cor(1, "#FFFFFF", 1)],
                        rotacao={"inicial": [0, 0], "velocidade": [0, 0]},
                        orbita={"raio": [0.12, 0.26], "velocidade": [140, 260], "altura": [0.0, 0.18], "zigue": 0.04}),
         render=dict(mistura="normal", orientacao="camera", luz_propria=False, noite=0.7)),
    dict(id="cheiro_ruim", rotulo="Cheiro ruim", usos=["lixo", "comida estragada", "morador sem banho", "fralda"],
         grupo="sujeira", desenho=q_cheiro_ruim, folha=(4, 4, 16, "vida", 10),
         emissao=dict(taxa=1.4, rajada=0, max=8, forma={"tipo": "disco", "raio": 0.12}, deslocamento=[0, 0.1, 0], ancora="topo"),
         particula=dict(vida=[1.8, 2.4], velocidade={"direcao": [0, 1, 0], "min": 0.12, "max": 0.2, "abertura": 12},
                        gravidade=0, arrasto=0.2, tamanho=[[0, 0.3], [1, 0.38]],
                        cor=[cor(0, "#FFFFFF", 0), cor(0.15, "#FFFFFF", 1), cor(0.8, "#FFFFFF", 1), cor(1, "#FFFFFF", 0)],
                        rotacao={"inicial": [-8, 8], "velocidade": [0, 0]}),
         render=dict(mistura="normal", orientacao="camera_y", luz_propria=False, noite=0.85)),
    dict(id="brilho", rotulo="Brilho de coisa nova ou limpa", usos=["móvel novo", "depois de limpar", "presente"],
         grupo="indicadores", desenho=q_brilho, folha=(4, 4, 16, "vida", 16),
         emissao=dict(taxa=8, rajada=0, max=20, forma={"tipo": "caixa", "tamanho": [0.9, 1.6, 0.25]}, deslocamento=[0, 0, 0],
                      ancora="volume"),
         particula=dict(vida=[0.7, 1.1], velocidade={"direcao": [0, 1, 0], "min": 0, "max": 0.05, "abertura": 0}, gravidade=0,
                        arrasto=0, tamanho=[[0, 0.22], [1, 0.28]], cor=[cor(0, "#FFFFFF", 1), cor(1, "#FFFFFF", 1)],
                        rotacao={"inicial": [0, 45], "velocidade": [0, 0]}),
         render=dict(mistura="normal", orientacao="camera", luz_propria=True, noite=1.0)),
    dict(id="coracoes", rotulo="Corações", usos=["romance", "namorar", "beijo", "carinho"], grupo="indicadores",
         desenho=q_coracoes, folha=(4, 2, 8, "laco", 10),
         emissao=dict(taxa=1.6, rajada=0, max=10, forma={"tipo": "disco", "raio": 0.15}, deslocamento=[0, 0.25, 0],
                      ancora="cabeca"),
         particula=dict(vida=[1.6, 2.2], velocidade={"direcao": [0, 1, 0], "min": 0.25, "max": 0.35, "abertura": 18},
                        gravidade=0, arrasto=0.4,
                        tamanho=[[0, 0.02], [0.12, 0.2], [0.2, 0.17], [0.85, 0.17], [1, 0.0]],
                        cor=[cor(0, "#FFFFFF", 1), cor(1, "#FFFFFF", 1)],
                        rotacao={"inicial": [-15, 15], "velocidade": [0, 0]}, balanco={"amplitude": 0.04, "frequencia": 1.0}),
         render=dict(mistura="normal", orientacao="camera", luz_propria=True, noite=0.9)),
    dict(id="notas", rotulo="Notas musicais", usos=["tocar música", "cantar", "rádio", "ninar"], grupo="indicadores",
         desenho=q_notas, folha=(4, 2, 8, "variante", 0),
         emissao=dict(taxa=1.4, rajada=0, max=8, forma={"tipo": "disco", "raio": 0.15}, deslocamento=[0, 0.25, 0],
                      ancora="cabeca"),
         particula=dict(vida=[1.8, 2.4], velocidade={"direcao": [0, 1, 0], "min": 0.22, "max": 0.32, "abertura": 22},
                        gravidade=0, arrasto=0.3, tamanho=[[0, 0.02], [0.12, 0.18], [0.85, 0.17], [1, 0.0]],
                        cor=[cor(0, "#FFFFFF", 1), cor(1, "#FFFFFF", 1)],
                        rotacao={"inicial": [-12, 12], "velocidade": [-25, 25]}, balanco={"amplitude": 0.06, "frequencia": 0.9}),
         render=dict(mistura="normal", orientacao="camera", luz_propria=True, noite=0.9)),
    dict(id="zzz", rotulo="Zzz de sono", usos=["dormir", "cochilar", "com sono"], grupo="indicadores", desenho=q_zzz,
         folha=(2, 2, 4, "laco", 6),
         emissao=dict(taxa=0.9, rajada=0, max=5, forma={"tipo": "ponto"}, deslocamento=[0.12, 0.2, 0], ancora="cabeca"),
         particula=dict(vida=[2.2, 2.6], velocidade={"direcao": [0.45, 1, 0], "min": 0.18, "max": 0.22, "abertura": 6},
                        gravidade=0, arrasto=0, tamanho=[[0, 0.03], [0.15, 0.12], [0.85, 0.24], [1, 0.0]],
                        cor=[cor(0, "#FFFFFF", 1), cor(1, "#FFFFFF", 1)],
                        rotacao={"inicial": [-10, 10], "velocidade": [0, 0]}, balanco={"amplitude": 0.03, "frequencia": 0.6}),
         render=dict(mistura="normal", orientacao="camera", luz_propria=True, noite=0.9)),
    dict(id="suor", rotulo="Gotas de suor", usos=["tenso", "malhando", "calor", "correndo"], grupo="indicadores",
         desenho=q_suor, folha=(4, 2, 8, "vida", 0),
         emissao=dict(taxa=2.6, rajada=0, max=8, forma={"tipo": "anel", "raio": 0.11}, deslocamento=[0, 0.04, 0.06],
                      ancora="cabeca"),
         particula=dict(vida=[0.9, 1.1], velocidade={"direcao": [0, -1, 0], "min": 0.0, "max": 0.05, "abertura": 30},
                        gravidade=0.6, arrasto=0, tamanho=[[0, 0.1], [1, 0.11]], cor=[cor(0, "#FFFFFF", 1), cor(1, "#FFFFFF", 1)],
                        rotacao={"inicial": [-15, 15], "velocidade": [0, 0]}),
         render=dict(mistura="normal", orientacao="camera", luz_propria=False, noite=0.8)),
    dict(id="raiva", rotulo="Nuvem de raiva", usos=["irritado", "briga", "conta atrasada"], grupo="indicadores",
         desenho=q_raiva, folha=(4, 2, 8, "laco", 8),
         emissao=dict(taxa=0, rajada=1, max=1, forma={"tipo": "ponto"}, deslocamento=[0, 0.42, 0], ancora="cabeca"),
         particula=dict(vida=[0, 0], velocidade={"direcao": [0, 0, 0], "min": 0, "max": 0, "abertura": 0}, gravidade=0, arrasto=0,
                        tamanho=[[0, 0.42], [1, 0.42]], cor=[cor(0, "#FFFFFF", 1), cor(1, "#FFFFFF", 1)],
                        rotacao={"inicial": [0, 0], "velocidade": [0, 0]}, balanco={"amplitude": 0.015, "frequencia": 2.0}),
         render=dict(mistura="normal", orientacao="camera", luz_propria=False, noite=1.0)),
    dict(id="confete", rotulo="Confete", usos=["aniversário", "promoção", "formatura", "casamento"], grupo="indicadores",
         desenho=q_confete, folha=(4, 6, 24, "variante_laco", 12),
         emissao=dict(taxa=0, rajada=70, repete=3.0, max=140, forma={"tipo": "disco", "raio": 0.2}, deslocamento=[0, 1.0, 0],
                      ancora="chao"),
         particula=dict(vida=[2.2, 3.0], velocidade={"direcao": [0, 1, 0], "min": 2.4, "max": 3.4, "abertura": 38},
                        gravidade=3.2, arrasto=1.4, tamanho=[[0, 0.12], [1, 0.12]],
                        cor=[cor(0, "#FFFFFF", 1), cor(0.8, "#FFFFFF", 1), cor(1, "#FFFFFF", 0)],
                        rotacao={"inicial": [0, 360], "velocidade": [-300, 300]}, balanco={"amplitude": 0.08, "frequencia": 1.2}),
         render=dict(mistura="normal", orientacao="camera", luz_propria=True, noite=0.9)),
    dict(id="balao_pensamento", rotulo="Balão de pensamento", usos=["morador pensando no que quer", "desejo", "dúvida"],
         grupo="balões", desenho=q_balao_pensamento, folha=(2, 2, 4, "laco", 3),
         emissao=dict(taxa=0, rajada=1, repete=3.2, max=1, forma={"tipo": "ponto"}, deslocamento=[0.22, 0.42, 0], ancora="cabeca"),
         particula=dict(vida=[3.0, 3.0], velocidade={"direcao": [0, 0, 0], "min": 0, "max": 0, "abertura": 0}, gravidade=0,
                        arrasto=0, tamanho=[[0, 0.0], [0.08, 0.56], [0.13, 0.48], [0.88, 0.48], [0.94, 0.54], [1, 0.0]],
                        cor=[cor(0, "#FFFFFF", 1), cor(1, "#FFFFFF", 1)], rotacao={"inicial": [0, 0], "velocidade": [0, 0]}),
         icone={"area": [0.5, 0.41, 0.5]},
         render=dict(mistura="normal", orientacao="camera", luz_propria=True, noite=0.95)),
    dict(id="balao_fala", rotulo="Balão de fala", usos=["conversar", "telefonar", "chamar alguém"], grupo="balões",
         desenho=q_balao_fala, folha=(2, 2, 4, "laco", 3),
         emissao=dict(taxa=0, rajada=1, repete=3.2, max=1, forma={"tipo": "ponto"}, deslocamento=[0.2, 0.4, 0], ancora="cabeca"),
         particula=dict(vida=[3.0, 3.0], velocidade={"direcao": [0, 0, 0], "min": 0, "max": 0, "abertura": 0}, gravidade=0,
                        arrasto=0, tamanho=[[0, 0.0], [0.08, 0.54], [0.13, 0.46], [0.88, 0.46], [0.94, 0.52], [1, 0.0]],
                        cor=[cor(0, "#FFFFFF", 1), cor(1, "#FFFFFF", 1)], rotacao={"inicial": [0, 0], "velocidade": [0, 0]}),
         icone={"area": [0.5, 0.39, 0.46]},
         render=dict(mistura="normal", orientacao="camera", luz_propria=True, noite=0.95)),
]

# ícones que os balões mostram no GLB ({"anima": "trocar"}) e na página
ICONES_BALAO = ["fome", "energia", "social", "diversao", "dinheiro", "cozinhar", "dormir", "apaixonado"]


def svg_folha(ef):
    col, lin, nq = ef["folha"][:3]
    partes = []
    for k in range(nq):
        u = k / max(1, nq - 1) if ef["folha"][3] == "vida" else k / nq
        x, y = (k % col) * 128, (k // col) * 128
        partes.append(f'<svg x="{x}" y="{y}" width="128" height="128" viewBox="0 0 128 128" overflow="hidden">'
                      f'{ef["desenho"](u, k, nq)}</svg>')
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {col * 128} {lin * 128}">' + "".join(partes) + "</svg>"


def svg_faixa_icones():
    itens = {i[0]: i for i in D.todos()}
    n = len(ICONES_BALAO)
    partes = "".join(f'<svg x="{k * 128}" y="0" width="128" height="128" viewBox="0 0 128 128">{itens[i][3]}</svg>'
                     for k, i in enumerate(ICONES_BALAO))
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {n * 128} 128">{partes}</svg>', n


def svg_faixa(ef, n=8):
    partes = "".join(f'<svg x="{k * 128}" y="0" width="128" height="128" viewBox="0 0 128 128" overflow="hidden">'
                     f'{ef["desenho"](k / (n - 1), k, n)}</svg>' for k in range(n))
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {n * 128} 128">{partes}</svg>'


def json_efeito(ef):
    col, lin, nq, modo, fps = ef["folha"]
    out = {"id": ef["id"], "rotulo": ef["rotulo"], "grupo": ef["grupo"], "usos": ef["usos"],
           "folha": {"arquivo": f"{ef['id']}_folha.png", "colunas": col, "linhas": lin, "quadros": nq, "quadro_px": 128,
                     "modo": modo, "fps": fps},
           "emissao": dict(ef["emissao"]), "particula": ef["particula"], "render": ef["render"]}
    out["emissao"].setdefault("repete", 0)
    for k in ("icone", "variantes"):
        if k in ef:
            out[k] = ef[k]
    if "icone" in ef:
        out["icone"]["icones_exemplo"] = ICONES_BALAO
        out["icone"]["atlas"] = "../../icones_out/sprite/icones_128.png (índice em icones.json)"
    return out


def main():
    saida = os.path.abspath(sys.argv[1])
    sys.path.insert(0, AQUI)
    import icones_gera as G
    tarefas = []
    tmp = os.path.join(saida, "_svg")
    os.makedirs(tmp, exist_ok=True)
    indice = []
    for ef in EFEITOS:
        d = os.path.join(saida, ef["id"])
        os.makedirs(d, exist_ok=True)
        s = svg_folha(ef)
        c = os.path.join(tmp, ef["id"] + ".svg")
        G.escreve(c, s)
        col, lin = ef["folha"][:2]
        tarefas.append({"svg": c, "png": os.path.join(d, f"{ef['id']}_folha.png"), "w": col * 128, "h": lin * 128})
        js = json_efeito(ef)
        anterior = os.path.join(d, ef["id"] + ".json")
        if os.path.exists(anterior):  # preserva o bloco "glb" que efeitos_glb.py escreve
            velho = json.load(open(anterior, encoding="utf-8"))
            if "glb" in velho:
                js["glb"] = velho["glb"]
        G.escreve(anterior, json.dumps(js, ensure_ascii=False, indent=1))
        indice.append({"id": ef["id"], "rotulo": ef["rotulo"], "grupo": ef["grupo"], "usos": ef["usos"],
                       "json": f"{ef['id']}/{ef['id']}.json", "folha": f"{ef['id']}/{ef['id']}_folha.png",
                       "glb": f"{ef['id']}/{ef['id']}.glb"})
    # faixas para os GLB
    s, n = svg_faixa_icones()
    c = os.path.join(tmp, "icones_balao.svg")
    G.escreve(c, s)
    tarefas.append({"svg": c, "png": os.path.join(saida, "_faixas", "icones_balao.png"), "w": n * 128, "h": 128})
    br = next(e for e in EFEITOS if e["id"] == "brilho")
    c = os.path.join(tmp, "brilho_faixa.svg")
    G.escreve(c, svg_faixa(br, 8))
    tarefas.append({"svg": c, "png": os.path.join(saida, "_faixas", "brilho.png"), "w": 8 * 128, "h": 128})
    # folha de conferência: todas as folhas lado a lado, em fundo claro e escuro
    partes, y = [], 20
    for ef in EFEITOS:
        col, lin = ef["folha"][:2]
        w, h = col * 64, lin * 64
        for j, fundo in enumerate(("#E8EEF5", "#16213A")):
            x = 200 + j * 300
            partes.append(f'<rect x="{x - 6}" y="{y - 6}" width="{w + 12}" height="{h + 12}" rx="8" fill="{fundo}"/>')
            partes.append(f'<svg x="{x}" y="{y}" width="{w}" height="{h}" viewBox="0 0 {col * 128} {lin * 128}">'
                          f'{svg_folha(ef)[svg_folha(ef).index(">") + 1:-6]}</svg>')
        partes.append(f'<text x="16" y="{y + 24}" font-family="Inter, sans-serif" font-size="18" font-weight="700" '
                      f'fill="{TINTA}">{G.esc(ef["rotulo"])}</text>')
        partes.append(f'<text x="16" y="{y + 46}" font-family="Inter, sans-serif" font-size="13" fill="#5E6C7D">'
                      f'{ef["folha"][2]} quadros · {ef["folha"][3]}</text>')
        y += h + 24
    c = os.path.join(tmp, "folha_efeitos.svg")
    G.escreve(c, f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 {y}"><rect width="800" height="{y}" fill="#FFFFFF"/>'
                 + "".join(partes) + "</svg>")
    tarefas.append({"svg": c, "png": os.path.join(saida, "folha_efeitos.png"), "w": 800, "h": y})
    G.rasteriza(tarefas, saida)
    shutil.rmtree(tmp)
    G.escreve(os.path.join(saida, "efeitos.json"), json.dumps({"versao": 1, "efeitos": indice,
                                                                "icones_balao": ICONES_BALAO}, ensure_ascii=False, indent=1))
    print("efeitos:", len(EFEITOS))


if __name__ == "__main__":
    main()
