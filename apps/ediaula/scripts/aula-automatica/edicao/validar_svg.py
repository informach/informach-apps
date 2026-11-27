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
- cena parada: mais de 4 s sem nada se mexer.
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


def desenho(f, d):
    lay = Layout(d)
    probs = {}

    def prob(chave, t, msg):
        probs.setdefault(chave, f"{t:5.1f} s  {msg}")

    # Estático: letra, fonte.
    def textos(no):
        if no.get("tag") == "text":
            yield no
        for c in no.get("children", []):
            yield from textos(c)

    for raiz in lay.nos:
        for no in textos(raiz):
            t = no.get("text", "")
            letra = next((ch for ch in t if ch.isalpha()), "")
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
        txts = [i for i in conteudo if i["no"].get("tag") == "text" and i["op"] > 0.5]
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
    if area_max < 0.30:
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
