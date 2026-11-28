"""Confere as peças .edisvg antes de vincular na aula: o técnico (o EdiSVG abre) e o desenho (REGRAS.md, 9 e 10).

Uso: validar_svg.py [--so-tecnico] <peça.edisvg ou pasta das peças> [...]

Técnico, sempre: uma trilha por propriedade, quadros em ordem, únicos e dentro da duração, e os limites de
recursos do EdiSVG. Sem nenhuma peça para conferir, sai com erro (Ilha A2P4, 22/11/2026: um arquivo no lugar
da pasta não era conferido e a resposta era "ok").

Desenho (a não ser com --so-tecnico, só para peça antiga que não vai ser refeita): o validador olha a cena a
cada meio segundo, com a conta da prévia (cena_layout.py), e barra o que a Helena apontou em 27/11/2026:
- texto que começa com minúscula ("coleta"); nome de variável ou sprite vai num rótulo "Código" ou no estilo
  "codigo" do kit;
- fonte fora do kit (Baloo 2 e Nunito) ou sem a fonte embutida;
- texto menor que 30 px na tela;
- texto que estoura a pílula ou encosta na borda dela;
- conteúdo fora da tela ou na faixa da apresentadora (x >= 1320);
- textos de rótulos diferentes um em cima do outro;
- rótulos quase alinhados (centros ou bordas a menos de 14 px, sem coincidir): "mais ou menos ali";
- quadro vazio: no momento mais cheio, o conteúdo ocupa menos de 30 % da área livre;
- texto demais ao mesmo tempo (mais de 14 palavras fora o título): criança não lê;
- cena parada: mais de 4 s sem nada se mexer;
- contraste do texto com o que está atrás dele abaixo de 4,5 (o branco no azul antigo dava 2,4).
Cada problema sai com o segundo da cena e o nome do nó. Com algum problema, sai com erro.
"""
import glob
import json
import os
import sys

from cena_layout import FPS, Layout

FONTES_DO_KIT = {"Baloo 2", "Nunito"}
FAIXA_APRESENTADORA = 1320
AREA_LIVRE = (96, 300, 1272, 1020)
QUASE = 14
MAX_PALAVRAS = 14
# Contraste do texto com o que está atrás dele (WCAG AA): o branco no azul antigo dava 2,4 (Helena, 27/11/2026).
CONTRASTE_MINIMO = 4.5
AZUL_FUNDO = "#3D6BE1"


def tecnico(f, d):
    a = d["motion"]["animations"][0]
    vistos = set()
    for t in a["tracks"]:
        k = (t["targetId"], t["property"])
        assert k not in vistos, f"{os.path.basename(f)}: duas trilhas de {k[1]} no mesmo nó ({k[0]})"
        vistos.add(k)
        fr = [x["frame"] for x in t["keys"]]
        assert fr == sorted(set(fr)) and max(fr) <= a["frames"], (f, fr)
    # Os limites do EdiSVG (packages/edi-motion/src/assets/limits.ts): acima deles a peça não abre e o render
    # nunca chega (Ilha A3P8, 23/11/2026).
    recursos = d.get("assets", [])
    total = sum(r["byteLength"] for r in recursos)
    px = sum(r["width"] * r["height"] for r in recursos if r["kind"] == "image")
    assert total <= 4_000_000, f"{os.path.basename(f)}: recursos de {total / 1e6:.2f} MB; o EdiSVG abre até 4 MB"
    assert px <= 16_000_000, f"{os.path.basename(f)}: {px / 1e6:.1f} milhões de pixels; o EdiSVG abre até 16"


def nome_de(no, lay):
    """O nome que a pessoa reconhece: o do grupo de cima com nome próprio."""
    partes = []
    while no is not None:
        if no.get("name") and no["name"] not in ("texto", "fundo", "sombra"):
            partes.append(no["name"])
        no = lay.pais.get(no["id"])
    return " / ".join(reversed(partes[:2])) or "?"


def e_codigo(no, lay):
    while no is not None:
        n = no.get("name", "")
        if n.startswith("Código") or n.startswith("Codigo"):
            return True
        no = lay.pais.get(no["id"])
    return False


def rotulo_de(item, lay):
    """O grupo pílula do texto (um grupo com um retângulo "fundo" e o texto), ou None."""
    pai = lay.pais.get(item["no"]["id"])
    if item["no"].get("name") != "texto":
        return None
    if pai and any(f.get("name") == "fundo" and f.get("tag") == "rect" for f in pai.get("children", [])):
        return pai
    return None


def e_fundo_ou_titulo(no, lay):
    raiz = no
    while lay.pais.get(raiz["id"]) is not None:
        raiz = lay.pais[raiz["id"]]
    n = raiz.get("name", "")
    return n.startswith("Fundo") or n.startswith("Título") or n.startswith("Subtítulo") or n.startswith("Foco")


def _lum(hexcor):
    h = hexcor.lstrip("#")[:6]
    if len(h) != 6:
        return None
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def contraste(a, b):
    la, lb = _lum(a), _lum(b)
    if la is None or lb is None:
        return None
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


_imagens_fundo = {}
DOC_ATUAL = {}


def _cor_mais_clara(no, caixa_texto, caixa_img):
    """A cor mais clara da imagem de fundo atrás do texto (o pior caso para texto branco), lida no PNG da cena."""
    a = DOC_ATUAL.get("assets", {}).get(no.get("assetId"))
    if not a:
        return None
    if a["id"] not in _imagens_fundo:
        import base64
        import io

        from PIL import Image
        _imagens_fundo[a["id"]] = Image.open(io.BytesIO(base64.b64decode(a["data"]))).convert("RGB")
    im = _imagens_fundo[a["id"]]
    ix0, iy0, ix1, iy1 = caixa_img
    sx, sy = im.width / max(1, ix1 - ix0), im.height / max(1, iy1 - iy0)
    x0, y0, x1, y1 = caixa_texto
    bx0, by0 = max(0, int((x0 - ix0) * sx)), max(0, int((y0 - iy0) * sy))
    bx1, by1 = min(im.width, int((x1 - ix0) * sx) + 1), min(im.height, int((y1 - iy0) * sy) + 1)
    if bx1 <= bx0 or by1 <= by0:
        return None
    px = im.load()
    melhor, cor = -1, None
    for y in range(by0, by1, 3):
        for x in range(bx0, bx1, 3):
            c = px[x, y]
            v = _lum("#%02x%02x%02x" % c)
            if v > melhor:
                melhor, cor = v, "#%02x%02x%02x" % c
    return cor


def fundo_do_texto(item, itens):
    """A cor que está atrás do texto: o último retângulo cheio (ou o fundo da cena) que contém o meio dele, na ordem
    de pintura. Uma imagem atrás (o jogo, um vídeo) deixa a cor desconhecida: None."""
    x0, y0, x1, y1 = item["caixa"]
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    cor = None
    for i in itens:
        if i is item:
            break
        if i["op"] < 0.5 or i["no"].get("name") in ("sombra", "degrau"):
            continue
        bx0, by0, bx1, by1 = i["caixa"]
        if not (bx0 <= cx <= bx1 and by0 <= cy <= by1):
            continue
        no = i["no"]
        if no.get("name", "").startswith("Fundo"):
            cor = (_cor_mais_clara(no, item["caixa"], i["caixa"]) or AZUL_FUNDO) if no.get("tag") == "image"                 else no.get("attrs", {}).get("fill", cor)
        elif no.get("tag") in ("rect", "polygon") and no.get("attrs", {}).get("fill", "none") not in ("none", ""):
            cor = no["attrs"]["fill"]
        elif no.get("tag") == "image":
            cor = None
    return cor


def desenho(f, d):
    lay = Layout(d)
    DOC_ATUAL["assets"] = lay.assets
    probs = {}

    def prob(chave, t, msg):
        probs.setdefault(chave, f"{t:5.1f} s  {msg}")

    # Estático: letra, fonte.
    def textos(no):
        if no.get("tag") == "text":
            yield no
        for c in no.get("children", []):
            yield from textos(c)

    def continua_frase(no):
        """Texto que continua uma frase de um título em pedaços ou de um balão de várias linhas: não é começo."""
        # O grupo de cima que é título ou balão (o marca-texto é um grupo dentro do título).
        pai, frase = lay.pais.get(no["id"]), None
        while pai is not None:
            if pai.get("name", "").startswith(("Título", "Balão")):
                frase = pai
            pai = lay.pais.get(pai["id"])
        if frase is None:
            return False
        irmaos = [f for f in textos(frase) if f.get("name") != "sombra" and not f.get("name", "").startswith("selo")]
        return bool(irmaos) and irmaos[0] is not no

    # O marca-texto: a palavra gira junto com a caixa amarela (Helena, 27/11/2026). Caixa inclinada com o texto reto
    # do lado é o erro de antes.
    def marcas(no):
        if no.get("tag") == "rect" and no.get("name") == "marca":
            yield no
        for c in no.get("children", []):
            yield from marcas(c)

    for raiz in lay.nos:
        for m in marcas(raiz):
            if (m.get("transform") or {}).get("rotation", 0):
                prob(("marca-reta", m["id"]), 0, f"marca-texto de {nome_de(m, lay)} inclinado com o texto reto: "
                                                 "use kit_cena.marca_texto (a caixa e a palavra giram juntas)")

    for raiz in lay.nos:
        for no in textos(raiz):
            t = no.get("text", "")
            letra = next((ch for ch in t if ch.isalpha()), "")
            if no.get("name") == "sombra" or continua_frase(no):
                continue
            if letra.islower() and not e_codigo(no, lay):
                prob(("min", no["id"]), 0, f'"{t}" começa com minúscula ({nome_de(no, lay)})')
            fam = no.get("attrs", {}).get("font-family", "")
            if fam not in FONTES_DO_KIT:
                prob(("fam", no["id"]), 0, f'"{t}" em {fam or "fonte nenhuma"}, fora do kit (Baloo 2, Nunito)')
            elif not no.get("fontAssetId"):
                prob(("emb", no["id"]), 0, f'"{t}" sem a fonte embutida ({fam}): no render sai outra letra')

    # Por quadro.
    passo = FPS // 2
    quadros = list(range(0, lay.total, passo)) + [max(0, lay.total - 1)]
    mais_cheio, area_max, t_max = None, 0.0, 0.0
    for q in quadros:
        t = q / FPS
        itens = lay.quadro(q)
        conteudo = [i for i in itens if not e_fundo_ou_titulo(i["no"], lay)]
        txts = [i for i in conteudo if i["no"].get("tag") == "text" and i["op"] > 0.5 and i["no"].get("name") != "sombra"]
        todos_txts = [i for i in itens if i["no"].get("tag") == "text" and i["op"] > 0.5 and i["no"].get("name") != "sombra"]
        for i in todos_txts:
            fundo = fundo_do_texto(i, itens)
            cr = contraste(i["no"]["attrs"].get("fill", "#000000"), fundo) if fundo else None
            if cr is not None and cr < CONTRASTE_MINIMO:
                prob(("contraste", i["no"]["id"]), t, f'"{i["no"]["text"]}" com contraste {cr:.1f} contra o fundo {fundo} '
                                                     f"(mínimo {CONTRASTE_MINIMO}): troque a cor do texto ou do fundo")
        # A caixa do marca-texto não encosta nas letras de outra linha (de cima ou de baixo).
        for m in itens:
            if m["no"].get("name") != "marca" or m["op"] < 0.5:
                continue
            grupo = lay.pais.get(m["no"]["id"])
            mx0, my0, mx1, my1 = m["caixa"]
            for i in todos_txts:
                if lay.pais.get(i["no"]["id"]) is grupo:
                    continue
                x0, y0, x1, y1 = i["caixa"]
                # Só as letras de outra linha (a palavra do lado, na mesma linha, não conta).
                if my0 <= (y0 + y1) / 2 <= my1:
                    continue
                if mx0 < x1 and x0 < mx1 and my0 - 4 < y1 and y0 < my1 + 4:
                    prob(("marca-cobre", m["no"]["id"], i["no"]["id"]), t,
                         f'o marca-texto de {nome_de(m["no"], lay)} encosta em "{i["no"]["text"]}": afaste as linhas')
        for i in txts:
            tam = float(i["no"]["attrs"].get("font-size", 0)) * i["escala"]
            if tam < 29.5 and i["escala"] > 0.97:
                prob(("tam", i["no"]["id"]), t, f'"{i["no"]["text"]}" com {tam:.0f} px na tela (mínimo 30)')
        for i in conteudo:
            x0, y0, x1, y1 = i["caixa"]
            if i["op"] < 0.5 or i["no"].get("name") == "sombra":
                continue
            if x1 > FAIXA_APRESENTADORA + 2 and x0 < 1900:
                prob(("faixa", i["no"]["id"]), t, f"{nome_de(i['no'], lay)} entra na faixa da apresentadora "
                                                   f"(vai até x {x1:.0f}; a área livre acaba em {FAIXA_APRESENTADORA})")
            if x0 < -2 or y0 < -2 or y1 > 1082:
                prob(("fora", i["no"]["id"]), t, f"{nome_de(i['no'], lay)} sai da tela")
        # Texto dentro da pílula, com respiro.
        caixas_rot = {}
        for i in txts:
            g = rotulo_de(i, lay)
            if not g:
                continue
            fundo = next(x for x in itens if x["no"] is next(c for c in g["children"] if c.get("name") == "fundo"))
            caixas_rot[g["id"]] = (fundo["caixa"], i)
            fx0, fy0, fx1, fy1 = fundo["caixa"]
            x0, y0, x1, y1 = i["caixa"]
            if i["escala"] > 0.97 and (x0 < fx0 + 16 or x1 > fx1 - 16):
                prob(("estoura", g["id"]), t, f'"{i["no"]["text"]}" encosta ou passa da borda da pílula '
                                               f'({nome_de(i["no"], lay)})')
        # Sobreposição e alinhamento entre pílulas.
        rots = [(gid, cx, i) for gid, (cx, i) in caixas_rot.items() if i["escala"] > 0.97]
        for k, (ga, a, ia) in enumerate(rots):
            for gb, b, ib in rots[k + 1:]:
                if a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]:
                    prob(("sob", *sorted((ga, gb))), t, f'"{ia["no"]["text"]}" e "{ib["no"]["text"]}" um em cima '
                                                        "do outro")
                    continue
                for nome_eixo, va, vb in (("na altura", (a[1] + a[3]) / 2, (b[1] + b[3]) / 2),
                                          ("no meio", (a[0] + a[2]) / 2, (b[0] + b[2]) / 2),
                                          ("na borda esquerda", a[0], b[0])):
                    if 1.0 < abs(va - vb) < QUASE:
                        prob(("alin", *sorted((ga, gb))), t, f'"{ia["no"]["text"]}" e "{ib["no"]["text"]}" quase '
                                                              f"alinhados {nome_eixo} ({abs(va - vb):.0f} px de "
                                                              "diferença): alinhe de vez ou afaste")
                        break
        # Palavras ao mesmo tempo.
        palavras = sum(len(i["no"]["text"].split()) for i in txts)
        if palavras > MAX_PALAVRAS:
            prob(("palavras", q // (FPS * 3)), t, f"{palavras} palavras na tela ao mesmo tempo (até "
                                                   f"{MAX_PALAVRAS}): criança não lê, mostre acontecendo")
        # Área ocupada.
        vis = [i["caixa"] for i in conteudo if i["op"] > 0.5 and i["no"].get("name") != "sombra"]
        if vis:
            ax0, ay0, ax1, ay1 = AREA_LIVRE
            # A área coberta (sem contar duas vezes), numa grade de 24 px.
            cel = 24
            cob = set()
            for x0, y0, x1, y1 in vis:
                for gx in range(int(max(x0, ax0) // cel), int(min(x1, ax1) // cel) + 1):
                    for gy in range(int(max(y0, ay0) // cel), int(min(y1, ay1) // cel) + 1):
                        if max(x0, ax0) < min(x1, ax1) and max(y0, ay0) < min(y1, ay1):
                            cob.add((gx, gy))
            area = len(cob) * cel * cel / ((ax1 - ax0) * (ay1 - ay0))
            if area > area_max:
                area_max, t_max = area, t
    # A abertura tem a capa do curso inteira no fundo: não está vazia.
    if area_max < 0.30 and not d.get("name", "").startswith("Capa"):
        prob(("vazio",), t_max, f"quadro vazio: no momento mais cheio o conteúdo cobre {area_max:.0%} da área livre "
                                "(mínimo 30 %); use figuras grandes")
    # Cena parada.
    mudancas = sorted({k["frame"] for tr in lay.anim["tracks"] for k in tr["keys"]})
    mudancas = [0] + mudancas + [lay.total]
    for a, b in zip(mudancas, mudancas[1:]):
        if (b - a) / FPS > 4.0:
            prob(("parada", a), a / FPS, f"cena parada por {(b - a) / FPS:.1f} s: uma mudança a cada frase")
    return list(probs.values())


def main():
    args = sys.argv[1:]
    so_tecnico = "--so-tecnico" in args
    args = [a for a in args if not a.startswith("--")]
    arquivos = []
    for alvo in args:
        arquivos += sorted(glob.glob(os.path.join(alvo, "*.edisvg"))) if os.path.isdir(alvo) else [alvo]
    if not arquivos:
        sys.exit(f"nenhuma peça .edisvg em {args}")
    ruins = 0
    for f in arquivos:
        d = json.load(open(f, encoding="utf8"))
        tecnico(f, d)
        if so_tecnico:
            continue
        probs = desenho(f, d)
        if probs:
            ruins += 1
            print(f"\n{os.path.basename(f)}: {len(probs)} problema(s) de desenho")
            for p in probs:
                print("  " + p)
    if ruins:
        sys.exit(f"\n{ruins} de {len(arquivos)} peças com problema de desenho (REGRAS.md, seções 9 e 10)")
    print(f"ok ({len(arquivos)} peças)")


if __name__ == "__main__":
    main()
