"""Gera a biblioteca de ícones 2D do Morada a partir de icones_desenhos.py.

Uso: python3 -I icones_gera.py <saida>            (ex.: SP/icones_out)
     python3 -I icones_gera.py <saida> --rapido   (só SVG e a folha de revisão, sem os PNG de cada tamanho)

Saída:
  svg/<categoria>/<id>.svg              um arquivo por ícone (viewBox 128)
  png/<64|128|256>/<categoria>/<id>.png  fundo transparente
  barras/barra_<estado>.svg|png          a barra de necessidade nos 5 estados (png a 1× e 2×)
  necessidades_estados/<nec>_<estado>.svg|png   ícone + barra, para o painel do morador
  sprite/icones_128.png, icones_64.png   todos os ícones numa imagem só (grade), mesmo índice
  sprite/icones.svg                      os mesmos como <symbol id="ico-<id>"> (para a interface em React)
  sprite/icones.json                     índice: posição de cada ícone no sprite, categoria, rótulo, cor
  folha_icones.png                       folha com todos os ícones e nomes
  folha_64_dia_noite.png                 todos a 64 px sobre fundo claro, de cena e escuro (conferência)
  menu_radial.svg|png                    exemplo do menu radial de interações
  marcador/propostas.svg|png             as 3 propostas de marcador
  icones.json                            catálogo completo
"""
import json
import math
import os
import shutil
import subprocess
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import icones_desenhos as D  # noqa: E402

NODE_PATH = os.environ.get("NODE_PATH", "/opt/node-tools/node_modules")
CATS = [("necessidades", "Necessidades"), ("humores", "Humores"), ("interacoes", "Interações"),
        ("interface", "Interface"), ("marcador", "Marcador")]


def escreve(caminho, txt):
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    with open(caminho, "w", encoding="utf-8") as f:
        f.write(txt)


def rasteriza(tarefas, saida):
    if not tarefas:
        return
    arq = os.path.join(saida, "_tarefas_raster.json")
    with open(arq, "w") as f:
        json.dump(tarefas, f)
    env = dict(os.environ, NODE_PATH=NODE_PATH)
    subprocess.run(["node", os.path.join(AQUI, "icones_rasteriza.js"), arq], check=True, env=env)
    os.remove(arq)


def miolo_svg(txt):
    """Conteúdo de um <svg> sem a tag externa."""
    a = txt.index(">") + 1
    return txt[a:txt.rindex("</svg>")]


def esc(t):
    return t.replace("&", "&amp;").replace("<", "&lt;")


FONTE = "Inter, DejaVu Sans, sans-serif"


def folha(itens, colunas=10, cel=128, rot=True, titulo="Ícones do Morada"):
    """SVG com todos os ícones agrupados por categoria e com os nomes."""
    pad, lab = 24, (34 if rot else 6)
    larg = pad * 2 + colunas * (cel + 16)
    y = 80
    corpo = [f'<text x="{pad}" y="52" font-family="{FONTE}" font-size="34" font-weight="800" fill="{D.TINTA}">'
             f'{esc(titulo)}</text>']
    for cat, nome in CATS:
        lst = [i for i in itens if i[2] == cat]
        if not lst:
            continue
        corpo.append(f'<text x="{pad}" y="{y + 30}" font-family="{FONTE}" font-size="22" font-weight="700" '
                     f'fill="{D.C["cinza_azulado"]}">{esc(nome)} ({len(lst)})</text>')
        y += 44
        for k, it in enumerate(lst):
            cx = pad + (k % colunas) * (cel + 16)
            cy = y + (k // colunas) * (cel + lab + 10)
            corpo.append(f'<svg x="{cx}" y="{cy}" width="{cel}" height="{cel}" viewBox="0 0 128 128">{it[3]}</svg>')
            if rot:
                r = it[1] if len(it[1]) <= 22 else it[1][:21] + "…"
                corpo.append(f'<text x="{cx + cel / 2}" y="{cy + cel + 20}" text-anchor="middle" font-family="{FONTE}" '
                             f'font-size="13" fill="{D.TINTA}">{esc(r)}</text>')
        y += math.ceil(len(lst) / colunas) * (cel + lab + 10) + 10
    alt = y + pad
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {larg} {alt}">'
            f'<rect width="{larg}" height="{alt}" fill="{D.C["branco_gelo"]}"/>' + "".join(corpo) + "</svg>"), larg, alt


def folha_64(itens):
    """Todos a 64 px em três faixas: fundo claro (interface de dia), cena de dia e noite."""
    fundos = [("claro", D.C["branco"]), ("cena de dia", "#9CC6E8"), ("cena de noite", "#16213A")]
    col = 20
    cel = 64
    linhas = math.ceil(len(itens) / col)
    faixa_h = linhas * (cel + 10) + 40
    larg = col * (cel + 10) + 30
    out = []
    for f, (nome, cor) in enumerate(fundos):
        y0 = f * faixa_h
        txt = "#FFFFFF" if f == 2 else D.TINTA
        out.append(f'<rect x="0" y="{y0}" width="{larg}" height="{faixa_h}" fill="{cor}"/>')
        out.append(f'<text x="16" y="{y0 + 26}" font-family="{FONTE}" font-size="16" font-weight="700" fill="{txt}">'
                   f'64 px · {esc(nome)}</text>')
        for k, it in enumerate(itens):
            x = 16 + (k % col) * (cel + 10)
            y = y0 + 36 + (k // col) * (cel + 10)
            out.append(f'<svg x="{x}" y="{y}" width="{cel}" height="{cel}" viewBox="0 0 128 128">{it[3]}</svg>')
    alt = faixa_h * 3
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {larg} {alt}">' + "".join(out) + "</svg>", larg, alt


# ---------------------------------------------------------------------------------------------------------------------
# menu radial de exemplo
# ---------------------------------------------------------------------------------------------------------------------
MENU_EXEMPLO = ["conversar", "abracar", "beijar", "cumprimentar", "telefonar", "carinho_bicho", "brincar", "namorar"]


def menu_radial(itens_por_id, ids=MENU_EXEMPLO, nome="Marcos", r_anel=150, tam=560, larg=820):
    """Menu radial: os botões em volta de uma etiqueta-casinha com o nome do morador. Cada botão tem o rótulo numa
    pílula. A fatia apontada (a primeira) aparece realçada."""
    c = tam / 2
    cx0 = larg / 2
    n = len(ids)
    out = [f'<circle cx="{cx0}" cy="{c}" r="{r_anel + 62}" fill="{D.C["azul_noite"]}" opacity=".18"/>',
           f'<circle cx="{cx0}" cy="{c}" r="{r_anel}" fill="none" stroke="{D.C["creme_claro"]}" stroke-width="56" '
           f'opacity=".9"/>',
           f'<circle cx="{cx0}" cy="{c}" r="{r_anel + 28}" fill="none" {D.st(5)}/>',
           f'<circle cx="{cx0}" cy="{c}" r="{r_anel - 28}" fill="none" {D.st(5)}/>']
    # etiqueta central em forma de casinha
    casa = D.P("M0 -64 L66 -10 Q70 -6 66 -2 H54 V46 Q54 56 44 56 H-44 Q-54 56 -54 46 V-2 H-66 Q-70 -6 -66 -10 Z", cx0, c, 1)
    out.append(f'<path d="{casa}" fill="{D.C["verde"]}" {D.st(6)}/>')
    out.append(f'<path d="{D.P("M-48 -4 H48 V30 Q48 38 40 38 H-40 Q-48 38 -48 30 Z", cx0, c, 1)}" fill="{D.C["creme_claro"]}" '
               f'{D.st(4)}/>')
    out.append(f'<text x="{cx0}" y="{c + 24}" text-anchor="middle" font-family="{FONTE}" font-size="20" font-weight="800" '
               f'fill="{D.TINTA}">{esc(nome)}</text>')
    out.append(f'<circle cx="{cx0}" cy="{c - 26}" r="10" fill="{D.C["creme_claro"]}" {D.st(4)}/>')
    for k, i in enumerate(ids):
        a = math.radians(-90 + k * 360 / n)
        x, y = cx0 + r_anel * math.cos(a), c + r_anel * math.sin(a)
        s = 84 if k == 0 else 72
        if k == 0:
            out.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{s / 2 + 9}" fill="{D.C["amarelo"]}" {D.st(5)}/>')
        out.append(f'<svg x="{x - s / 2:.1f}" y="{y - s / 2:.1f}" width="{s}" height="{s}" viewBox="0 0 128 128">'
                   f'{itens_por_id[i][3]}</svg>')
        rot = itens_por_id[i][1]
        lw = len(rot) * 9.2 + 24
        ca, sa = math.cos(a), math.sin(a)
        px, py = cx0 + (r_anel + s / 2 + 20) * ca, c + (r_anel + s / 2 + 14) * sa
        if ca > 0.3:
            lx = px - 8
        elif ca < -0.3:
            lx = px - lw + 8
        else:
            lx = px - lw / 2
        ly = py - 13
        out.append(f'<rect x="{lx:.1f}" y="{ly:.1f}" width="{lw:.1f}" height="26" rx="13" fill="{D.TINTA}"/>')
        out.append(f'<text x="{lx + lw / 2:.1f}" y="{ly + 18:.1f}" text-anchor="middle" font-family="{FONTE}" font-size="15" '
                   f'font-weight="600" fill="#FFFFFF">{esc(rot)}</text>')
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {larg} {tam}">' + "".join(out) + "</svg>"


def propostas_marcador():
    cor = D.C["verde"]
    desenhos = [("Casinha (escolhida)", D.marcador_casinha(cor)), ("Chave-casa", D.marcador_chave(cor)),
                ("Estrela-lar", D.marcador_estrela(cor))]
    out = [f'<rect width="900" height="380" fill="{D.C["branco_gelo"]}"/>']
    for k, (nome, m) in enumerate(desenhos):
        x = 40 + k * 290
        if k == 0:
            out.append(f'<rect x="{x - 14}" y="20" width="248" height="320" rx="24" fill="{D.C["creme_claro"]}" {D.st(4)}/>')
        out.append(f'<svg x="{x + 10}" y="40" width="200" height="200" viewBox="0 0 128 128">{m}</svg>')
        out.append(f'<text x="{x + 110}" y="280" text-anchor="middle" font-family="{FONTE}" font-size="22" font-weight="800" '
                   f'fill="{D.TINTA}">{esc(nome)}</text>')
        for j, c2 in enumerate(D.HUMOR_GERAL.values()):
            f = {0: D.marcador_casinha, 1: D.marcador_chave, 2: D.marcador_estrela}[k]
            out.append(f'<svg x="{x + 30 + j * 42}" y="294" width="36" height="36" viewBox="0 0 128 128">{f(c2)}</svg>')
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 380">' + "".join(out) + "</svg>"


# ---------------------------------------------------------------------------------------------------------------------
def main():
    saida = os.path.abspath(sys.argv[1])
    rapido = "--rapido" in sys.argv
    os.makedirs(saida, exist_ok=True)
    itens = D.todos()
    por_id = {i[0]: i for i in itens}
    assert len(por_id) == len(itens), "id repetido"
    tarefas = []
    catalogo = []
    for i, rot, cat, miolo, extra in itens:
        caminho = os.path.join(saida, "svg", cat, i + ".svg")
        escreve(caminho, D.svg(miolo))
        ent = {"id": i, "rotulo": rot, "categoria": cat, "svg": f"svg/{cat}/{i}.svg",
               "png": {str(t): f"png/{t}/{cat}/{i}.png" for t in (64, 128, 256)}, "tags": D.TAGS.get(i, "")}
        ent.update(extra)
        catalogo.append(ent)
        if not rapido:
            for t in (64, 128, 256):
                tarefas.append({"svg": caminho, "png": os.path.join(saida, ent["png"][str(t)]), "w": t, "h": t})

    # barras e necessidades com barra
    for e, rot, cor, f in D.ESTADOS:
        c = os.path.join(saida, "barras", f"barra_{e}.svg")
        escreve(c, D.svg_barra(e))
        tarefas += [{"svg": c, "png": c[:-4] + ".png", "w": 208, "h": 36},
                    {"svg": c, "png": c[:-4] + "@2x.png", "w": 416, "h": 72}]
        for n, *_ in D.NECESSIDADES:
            c2 = os.path.join(saida, "necessidades_estados", f"{n}_{e}.svg")
            escreve(c2, D.svg_necessidade_estado(n, e))
            if not rapido:
                tarefas += [{"svg": c2, "png": c2[:-4] + ".png", "w": 352, "h": 128},
                            {"svg": c2, "png": c2[:-4] + "_64.png", "w": 176, "h": 64}]

    # sprite: grade de 12 colunas, na ordem do catálogo
    col = 12
    lin = math.ceil(len(itens) / col)
    indice = {"colunas": col, "linhas": lin, "imagens": {"128": "icones_128.png", "64": "icones_64.png"},
              "svg": "icones.svg", "simbolo": "ico-<id>", "icones": {}}
    simbolos = []
    partes = {128: [], 64: []}
    for k, (i, rot, cat, miolo, extra) in enumerate(itens):
        cx, cy = k % col, k // col
        indice["icones"][i] = {"col": cx, "lin": cy, "categoria": cat, "rotulo": rot,
                               "x128": cx * 128, "y128": cy * 128, "x64": cx * 64, "y64": cy * 64}
        simbolos.append(f'<symbol id="ico-{i}" viewBox="0 0 128 128">{miolo}</symbol>')
        for t in (128, 64):
            partes[t].append(f'<svg x="{cx * t}" y="{cy * t}" width="{t}" height="{t}" viewBox="0 0 128 128">{miolo}</svg>')
    for t in (128, 64):
        c = os.path.join(saida, "sprite", f"_sprite_{t}.svg")
        escreve(c, f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {col * t} {lin * t}">' + "".join(partes[t]) + "</svg>")
        tarefas.append({"svg": c, "png": os.path.join(saida, "sprite", f"icones_{t}.png"), "w": col * t, "h": lin * t})
    escreve(os.path.join(saida, "sprite", "icones.svg"),
            '<svg xmlns="http://www.w3.org/2000/svg" style="display:none">' + "".join(simbolos) + "</svg>")
    escreve(os.path.join(saida, "sprite", "icones.json"), json.dumps(indice, ensure_ascii=False, indent=1))

    # folhas
    s, w, h = folha(itens)
    c = os.path.join(saida, "_folha.svg")
    escreve(c, s)
    tarefas.append({"svg": c, "png": os.path.join(saida, "folha_icones.png"), "w": w, "h": h})
    s, w, h = folha_64(itens)
    c = os.path.join(saida, "_folha64.svg")
    escreve(c, s)
    tarefas.append({"svg": c, "png": os.path.join(saida, "folha_64_dia_noite.png"), "w": w, "h": h})

    # menu radial e propostas do marcador
    c = os.path.join(saida, "menu_radial.svg")
    escreve(c, menu_radial(por_id))
    tarefas.append({"svg": c, "png": os.path.join(saida, "menu_radial.png"), "w": 820, "h": 560})
    c = os.path.join(saida, "marcador", "propostas.svg")
    escreve(c, propostas_marcador())
    tarefas.append({"svg": c, "png": os.path.join(saida, "marcador", "propostas.png"), "w": 900, "h": 380})

    rasteriza(tarefas, saida)
    for nome in ("_folha.svg", "_folha64.svg"):
        os.remove(os.path.join(saida, nome))
    for t in (128, 64):
        os.remove(os.path.join(saida, "sprite", f"_sprite_{t}.svg"))

    estados = [{"id": e, "rotulo": r, "cor": c, "nivel_exemplo": f} for e, r, c, f in D.ESTADOS]
    dados = {
        "versao": 1,
        "estilo": {"caixa": 128, "contorno": D.TINTA, "traco_ficha": D.WF, "traco_desenho": D.W,
                   "paleta": "CORES de moveis_base.py"},
        "categorias": [{"id": c, "rotulo": r, "total": sum(1 for x in catalogo if x["categoria"] == c)} for c, r in CATS],
        "estados_barra": estados,
        "humor_geral": [{"id": k, "rotulo": D.HUMOR_GERAL_ROTULO[k], "cor": v} for k, v in D.HUMOR_GERAL.items()],
        "grupos_interacao": D.GRUPO_COR,
        "menu_radial_exemplo": MENU_EXEMPLO,
        "icones": catalogo,
    }
    escreve(os.path.join(saida, "icones.json"), json.dumps(dados, ensure_ascii=False, indent=1))
    print("ícones:", len(itens), "| categorias:", {c: sum(1 for x in catalogo if x["categoria"] == c) for c, _ in CATS})


if __name__ == "__main__":
    main()
