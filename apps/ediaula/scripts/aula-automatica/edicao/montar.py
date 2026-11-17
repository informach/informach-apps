"""Comandos de edição (ferramentas do EdiAula) de uma parte gravada pelo robô: zoom, destaques, caixas
das categorias, balões dos botões e os intervalos da apresentadora.

Uso: montar.py <decisoes.json> <caixas.json> <saida.json> [--animacoes '[[ini, fim], ...]'] [--de S] [--ate S]
  decisoes.json  saída do decisoes.py
  caixas.json    contornos registrados na gravação (acoes/sonda-caixas.mjs, etapa "ler"); aceita a lista de
                 uma página ou o objeto {página: registros}, de onde usa a última página (a da gravação)
  --animacoes    trechos que viram animação do EdiSVG: sem zoom nem destaque por baixo, apresentadora à vista
Escreve <saida.json> (comandos add_zoom e add_annotation), <saida>-apresentadora.json e <saida>-revisar.json
(o que precisa de olho humano). Regras da Helena (16/11/2026), a revisão das regras de edição (17/11/2026) e
padrões medidos nos projetos do editor; ver README.md.

Faixas: o zoom vai numa faixa só, logo acima da gravação ("$ZOOM"), e as marcações numa faixa só, acima do
zoom ("$MARCACOES"); acoes/aplicar.mjs troca esses nomes pelas faixas da aula. Como ficam acima do zoom, as
marcações não crescem com ele: cada uma sai já na tela ampliada, x' = (x - cx)*s + 0,5, y' = (y - cy)*s + 0,5,
escala*s, com (s, cx, cy) o zoom ativo.
"""

import argparse
import json
import re

ap = argparse.ArgumentParser()
ap.add_argument("decisoes")
ap.add_argument("caixas")
ap.add_argument("saida")
ap.add_argument("--animacoes", default="[]")
ap.add_argument("--de", type=float, default=0.0)
ap.add_argument("--ate", type=float, default=1e9)
args = ap.parse_args()
dec = json.load(open(args.decisoes, encoding="utf8"))
caixas = json.load(open(args.caixas, encoding="utf8"))
if isinstance(caixas, dict):  # {página: registros}: a última página aberta é a da gravação
    caixas = caixas[max(caixas, key=lambda k: int(k))]
de, ate, saida = args.de, args.ate, args.saida
ANIM = json.loads(args.animacoes)
W, H = 1920, 1080
AMARELO = "#FFD60A"  # contorno dos destaques
AZUL = "#3D6BFF"  # destaque no encaixe vazio, antes do arrasto
XP = "#FFC02E"  # caixas das categorias (amarelo XP)
ESCURO = 0.5  # escurecimento do resto da tela no destaque de bloco inteiro
EASE = 0.6  # o zoom leva isso para abrir e para fechar
ZOOM_CURTO = 4.0  # zoom mais curto que isso, sem ação dentro, não ajuda a ler: sai
PALETA = 232  # borda esquerda das caixas: a ponta cai nas linhas da paleta do Estúdio (x ~246 em 1920)
CAIXA_ESCALA = 0.55  # caixas das categorias: 55% do tamanho padrão
# Onde as pessoas ficam (px do quadro): a apresentadora no plano da demonstração (canto inferior direito,
# só busto) e o personagem à esquerda, cortado na cintura. Nenhuma marcação cobre quem está à vista.
AREA_AP_CAIXA = (1500, 560, W, H)
AREA_PERS_CAIXA = (0, 300, 900, H)
REVISAR = []  # o que precisa de olho humano (vai para <saida>-revisar.json e para o relatório final)

# Contorno de cada gesto: o registro do palco na ordem dos verbos (os "afastar" são internos).
regs = [c for c in caixas if not c["verbo"].startswith("afastar")]
usados = set()


def caixa_de(g):
    for i, c in enumerate(regs):
        if i in usados or c["verbo"] != g["verbo"]:
            continue
        grupo = [i]
        while grupo[-1] + 1 < len(regs) and regs[grupo[-1] + 1]["verbo"] == g["verbo"]:
            grupo.append(grupo[-1] + 1)
        for j in grupo:
            usados.add(j)
        return [regs[j] for j in grupo]
    return []


cmds = []


def add(nome, entrada, nota=""):
    cmds.append({"tool": nome, "input": entrada, "nota": nota})


def centro(b):
    return ((b[0] + b[2]) / 2 / W, (b[1] + b[3]) / 2 / H)


# A apresentadora aparece quando não há ação: capa, fala, explicação parada e conceito (Helena, 16/11).
# Ela fica à direita (x >= AREA_AP): com ela à vista, o que se explica tem que ficar à esquerda dela.
AREA_AP = 1420  # onde começa o corpo dela (x 0,857, escala 1,58, do quadril para cima)
PRES = [[0.0, 3.0]] + [[t["ini"] - 0.1, t["fim"] + 0.1] for t in dec["trechos"]
                         if t["tipo"] in ("fala", "explica", "conceito") and t["fim"] > de and t["ini"] < ate]
PRES += [[a, b] for a, b in ANIM]
CONCEITO = [[t["ini"], t["fim"]] for t in dec["trechos"] if t["tipo"] == "conceito"] + [[a, b] for a, b in ANIM]
CONFLITO = []


def com_apresentadora(ini, fim):
    return any(a < fim and ini < b for a, b in PRES)


def zoom(ini, fim, caixa, nota, maxs=1.6):
    x0, y0, x1, y1 = caixa
    if (x1 - x0) * (y1 - y0) > 0.45 * W * H:
        return  # a professora mostra a tela inteira: sem zoom
    # Região livre: a tela inteira, ou só à esquerda da apresentadora quando ela está à vista.
    rx0, rx1 = (40, AREA_AP) if com_apresentadora(ini, fim) else (40, W - 40)
    w, h = max(x1 - x0, 80) * 1.25, max(y1 - y0, 60) * 1.3
    s = round(max(1.15, min(maxs, (rx1 - rx0) / w, H / h)), 2)
    bx, by = (x0 + x1) / 2, (y0 + y1) / 2
    # O centro do bloco vai ao meio da região livre; o quadro ampliado não sai da tela.
    cxp = bx - ((rx0 + rx1) / 2 - W / 2) / s
    cxp = min(max(cxp, W / 2 / s), W - W / 2 / s)
    cyp = min(max(by, H / 2 / s), H - H / 2 / s)
    dentro = (x1 - cxp) * s + W / 2 <= rx1 + 10 and (x0 - cxp) * s + W / 2 >= 20
    if rx1 == AREA_AP and not dentro:
        CONFLITO.append([ini, fim])  # não cabe à esquerda dela: ela sai nesse trecho
    add("add_zoom", {"at": round(ini, 2), "duration": round(max(1.5, fim - ini), 2), "scale": s,
                     "x": round(cxp / W, 4), "y": round(cyp / H, 4), "ease": EASE, "track_id": "$ZOOM"}, nota)


def destaque(t, dur, caixa, nota, pad=10, cor=AMARELO, escurecer=False, alvo=None):
    """Contorno de 1,5 a 3 s. escurecer: bloco inteiro apresentado pela primeira vez (o resto da tela
    escurece; só entra com o zoom já aberto). alvo: o que é destacado, para não repetir no mesmo bloco."""
    x0, y0, x1, y1 = caixa
    x0, y0, x1, y1 = max(0, x0 - pad), max(0, y0 - pad), min(W, x1 + pad), min(H, y1 + pad)
    cx, cy = centro((x0, y0, x1, y1))
    entrada = {"kind": "highlight", "at": round(t, 2), "duration": round(min(3.0, max(1.5, dur)), 2),
               "x": round(cx, 4), "y": round(cy, 4), "box_width": int(x1 - x0), "box_height": int(y1 - y0),
               "color": cor}
    if escurecer:
        entrada["dim"] = ESCURO
    add("add_annotation", entrada, nota)
    cmds[-1]["papel"] = "destaque"
    cmds[-1]["alvo"] = alvo or nota


def nome_do_bloco(v):
    """O bloco de um gesto: o primeiro nome entre aspas do verbo ('encaixar "Quando acontecer" em ...')."""
    m = re.search(r'"([^"]+)"', v)
    return m.group(1).strip().lower() if m else None


apresentados = set()  # blocos que já ganharam o destaque com escurecimento


# 2. Gestos do trecho: zoom acompanhando, destaque no bloco, balão no botão.
gestos = [g for g in dec["gestos"] if de <= g["acao"] < ate]
na_anim = lambda t: any(a - 0.2 <= t <= b + 0.2 for a, b in ANIM)
ARRASTOS = []  # (início, fim) de cada arrasto que sai da paleta ou vai à lixeira: sem zoom durante
grupo = None
for gi, g in enumerate(gestos):
    regs_g = caixa_de(g)
    v = g["verbo"]
    if v == "organizar blocos":
        continue
    proximo = gestos[gi + 1]["ini"] if gi + 1 < len(gestos) else 1e9
    t0, ta, t1 = g["ini"], g["acao"], g["fim"]
    if v.startswith(("encaixar", "soltar", "jogar na lixeira")):
        ARRASTOS.append((t0 - 0.2, t1 + 0.05))
    if na_anim(ta):
        continue
    if g["tipo"] == "jogo":
        jogo = next((r["alvo"] for r in regs_g if r["tag"] == "IFRAME"), None)
        if jogo and (not grupo or grupo["tipo"] != "jogo"):
            grupo = {"tipo": "jogo", "ini": max(t0, 3.0), "fim": t1 + 1.5, "caixa": jogo}
            # O jogo é alto: amplia a área de jogar (sem as setas de baixo), a 1,4x.
            jx0, jy0, jx1, jy1 = jogo
            zoom(grupo["ini"], 13.0 if ta < 13 else t1 + 2, [jx0, jy0, jx1, jy0 + (jx1 - jx0) * 0.75], f"zoom no jogo ({v})", maxs=1.4)
        continue
    if g["tipo"] == "botao" or g["balao"]:
        if t0 < 3.0:
            continue  # coberto pela abertura
        alvo = regs_g[0]["alvo"] if regs_g else None
        if not alvo and g.get("x") is not None:
            # Botão sem contorno registrado (o clique veio depois do último registro): o ponto do gesto.
            alvo = [g["x"] - 80, g["y"] - 22, g["x"] + 80, g["y"] + 22]
        if alvo:
            zoom(t0 - 0.3, t1 + 0.8, alvo, f"zoom no botão ({v})")
            bx, by = centro(alvo)
            add("add_annotation", {"kind": "balloon", "text": g["balao"], "at": round(ta - 0.6, 2), "duration": 2.0,
                                   "x": round(min(max(bx - 0.12, 0.12), 0.88), 4), "y": round(min(max(by + 0.12, 0.1), 0.9), 4),
                                   "tail": "top-right", "fill": AMARELO}, f"balão ({v})")
            cmds[-1]["papel"] = "balao"
        continue
    if g["tipo"] == "categoria":
        # A paleta: um zoom só para as categorias abertas em seguida.
        pt = (g["x"], g["y"])
        # O zoom fica aberto enquanto a caixa da categoria está à vista (1,5 s depois do clique).
        if grupo and grupo["tipo"] == "categoria" and t0 - grupo["fim"] < 2.5:
            grupo["fim"] = max(t1 + 0.6, ta + 1.5 + EASE)
            grupo["pts"].append(pt)
        else:
            grupo = {"tipo": "categoria", "ini": t0 - 0.3, "fim": max(t1 + 0.6, ta + 1.5 + EASE), "pts": [pt]}
            cmds.append({"tool": "_zoom_categoria", "grupo": grupo})
        # Caixa amarela numerada (instrução), apontando a categoria que a fala manda abrir.
        nome = v[len("abrir categoria "):]
        n = len(grupo["pts"])
        # 1 = a categoria, 2 = o item dentro dela. Entra no clique; a ponta encosta na paleta (a borda esquerda
        # da caixa em PALETA, acertada pelo aplicar.mjs com a largura de verdade).
        add("add_annotation", {"kind": "box", "text": nome, "badge": str(min(n, 2)), "pointer": "left",
                               "at": round(ta, 2), "duration": 1.5,
                               "x": 0.2, "y": round(pt[1] / H, 4), "color": XP, "scale": CAIXA_ESCALA},
            f"caixa numerada ({nome})")
        cmds[-1]["papel"] = "caixa"
        cmds[-1]["ancora_esquerda"] = round(PALETA / W, 4)
        continue
    # Blocos: destaque no bloco do gesto (o que caiu, depois de um arrasto) e zoom nele.
    caixa = None
    for r in regs_g:
        if r["k"] == "para" and r.get("depois"):
            caixa = r["depois"]
        elif r["bloco"] and not caixa:
            caixa = r["bloco"]
    campo = next((r["alvo"] for r in regs_g if r["fazer"] == "clicar" and r["tag"] == "g"), None)
    if v.startswith("arrastar até"):
        # A área que chegou: o maior bloco entre os próximos registros (a área contém os de dentro).
        prox = [r["bloco"] for r in regs[max(usados) + 1:max(usados) + 6] if r.get("bloco")] if usados else []
        if prox:
            caixa = max(prox, key=lambda c: (c[2] - c[0]) * (c[3] - c[1]))
    if v.startswith("apontar encaixe") or v.startswith("apontar abaixo"):
        x, y = regs_g[0]["ponto"] if regs_g else (g["x"], g["y"])
        # O espaço é onde o próximo bloco vai cair: a primeira linha do bloco que caiu ali.
        queda = next((r["depois"] for r in regs[max(usados) + 1:] if r.get("depois")), None) if usados else None
        if queda and abs(queda[0] - x) < 160 and abs(queda[1] - y) < 120:
            caixa_esp = [queda[0], queda[1], queda[0] + min(queda[2] - queda[0], 460), queda[1] + 72]
        else:
            caixa_esp = [x - 30, y - 22, x + 230, y + 22]
        destaque(ta - 0.4, max(2.0, t1 - ta + 1.5), caixa_esp, f"destaque no espaço ({v[:40]})", pad=4, cor=AZUL,
                 alvo=f"espaço {round(caixa_esp[0], -1)},{round(caixa_esp[1], -1)}")
        if caixa:
            zoom(t0 - 0.3, t1 + 1.2, [min(caixa[0], caixa_esp[0]), min(caixa[1], caixa_esp[1]), max(caixa[2], caixa_esp[2]), max(caixa[3], caixa_esp[3])], f"zoom ({v[:40]})")
        grupo = None
        continue
    if campo and v.startswith("abrir campo"):
        # Campo pequeno dentro do bloco (menu de escolha, valor, texto, variável): sem escurecer.
        destaque(ta - 0.3, 1.6, campo, f"destaque no campo ({v[:40]})", pad=6, alvo=f"campo {v}")
        # Zoom no bloco do campo (clicar e escrever se leem de perto). Se a mão arrastou a área antes para
        # achar o campo, as coordenadas mudaram: outro zoom. No mesmo lugar, o zoom aberto continua.
        perto_do_campo = next((r["bloco"] for r in regs_g if r["fazer"] == "clicar" and r["tag"] == "g" and r.get("bloco")), campo)
        rolou = any(r["fazer"] == "arrastar" for r in regs_g)
        if (not rolou and grupo and grupo.get("tipo") == "bloco" and ta - grupo["fim"] < 2.5
                and abs(centro(perto_do_campo)[0] - centro(grupo["caixa"])[0]) < 0.25):
            c0 = grupo["caixa"]
            grupo["caixa"] = [min(c0[0], perto_do_campo[0]), min(c0[1], perto_do_campo[1]),
                              max(c0[2], perto_do_campo[2]), max(c0[3], perto_do_campo[3])]
            grupo["fim"] = max(grupo["fim"], t1 + 1.0)
        else:
            grupo = {"tipo": "bloco", "ini": ta - 0.6, "fim": t1 + 1.0, "caixa": perto_do_campo}
            cmds.append({"tool": "_zoom_bloco", "grupo": grupo})
        continue
    if v.startswith("escolher"):
        # A lista que abre entra no enquadramento do zoom do bloco (o item escolhido não fica cortado). Num
        # campo de texto (sem lista), o zoom fica aberto enquanto a mão escreve.
        lista = next((r["alvo"] for r in regs_g if r["tag"] == "DIV"), None)
        if grupo and grupo.get("tipo") == "bloco":
            if lista:
                c0 = grupo["caixa"]
                grupo["caixa"] = [min(c0[0], lista[0]), min(c0[1], lista[1]), max(c0[2], lista[2]), max(c0[3], lista[3])]
            grupo["fim"] = max(grupo["fim"], t1 + 1.0)
        continue
    if caixa:
        if grupo and grupo.get("tipo") == "bloco" and t0 - grupo["fim"] < 2.5 and abs(centro(caixa)[0] - centro(grupo["caixa"])[0]) < 0.25:
            grupo["fim"] = t1 + 1.0
        else:
            da_paleta = v.startswith(("encaixar", "soltar"))
            grupo = {"tipo": "bloco", "ini": t1 + 0.05 if da_paleta else t0 - 0.3,
                     "fim": t1 + (3.0 if da_paleta else 1.0), "caixa": caixa}
            cmds.append({"tool": "_zoom_bloco", "grupo": grupo})
        # Num arrasto (encaixar, soltar, arrastar até) a caixa é a de onde o bloco ou a área parou:
        # o destaque entra quando o arrasto acaba, nunca sobre o lugar ainda vazio.
        arrasto = v.startswith(("encaixar", "soltar", "arrastar"))
        if v.startswith("arrastar até") and centro(caixa)[0] > 0.7:
            continue  # o arrasto centraliza o alvo: um contorno na beirada é de outro bloco
        if v.startswith("arrastar até") and proximo - t1 < 2.0:
            continue  # o gesto seguinte já destaca o que importa
        if v.startswith("jogar na lixeira"):
            # O que vai para a lixeira (a pergunta inteira, que a mão segura pelo sinal): destacado antes
            # de a mão pegar; depois ele sai da tela.
            pega = next((r["bloco"] for r in regs_g if r["k"] == "alvo" and r.get("bloco")), caixa)
            destaque(t0 - 1.5, 1.5, pega, f"destaque no bloco ({v[:40]})", alvo=nome_do_bloco(v))
            continue
        if v.startswith(("apontar mais de", 'abrir "senão')):
            # O sinal de mais e a palavra ao lado, não o bloco inteiro.
            alvo = next((r["alvo"] for r in regs_g if r["k"] == "alvo"), None)
            if alvo:
                largura = 98 if "senão se" in v else 66
                destaque(ta - 0.3, max(1.8, t1 - ta + 1.2), [alvo[0] - 8, alvo[1] - 10, alvo[2] + largura, alvo[3] + 10],
                         f"destaque no sinal ({v[:40]})", pad=2, alvo=f"sinal {v}")
                continue
        # Bloco inteiro (ou conjunto de blocos) apresentado pela primeira vez: o resto da tela escurece. Depois,
        # o mesmo bloco ganha só o contorno.
        bloco = nome_do_bloco(v)
        primeira = bloco is not None and bloco not in apresentados and v.startswith(
            ("encaixar", "soltar", "apontar bloco", "mostrar blocos", "arrastar até"))
        if bloco:
            apresentados.add(bloco)
        destaque(t1 + 0.1 if arrasto else ta - 0.3, 2.4 if arrasto else max(2.2, t1 - ta + 1.2), caixa,
                 f"destaque no bloco ({v[:40]})", escurecer=primeira, alvo=bloco)

# Zooms agrupados, agora com o fim de cada grupo conhecido.
final = []
for c in cmds:
    if c["tool"] == "_zoom_bloco":
        gz = c["grupo"]
        n = len(cmds)
        zoom(gz["ini"], gz["fim"], gz["caixa"], "zoom no bloco")
        if len(cmds) > n:
            final.append(cmds.pop())
    elif c["tool"] == "_zoom_categoria":
        gz = c["grupo"]
        xs = [p[0] for p in gz["pts"]]
        ys = [p[1] for p in gz["pts"]]
        n = len(cmds)
        zoom(gz["ini"], gz["fim"], [20, min(ys) - 60, max(xs) + 260, max(ys) + 60], "zoom nas categorias")
        if len(cmds) > n:
            final.append(cmds.pop())
    elif not c["tool"].startswith("_"):
        final.append(c)
# Zooms sem sobrepor (zoom sobre zoom amplia duas vezes): o mesmo lugar junta, outro lugar corta o anterior.
zs = sorted((c for c in final if c["tool"] == "add_zoom"), key=lambda c: c["input"]["at"])
outros = [c for c in final if c["tool"] != "add_zoom"]
junto = []
for z in zs:
    i = z["input"]
    if junto:
        a = junto[-1]["input"]
        fim_a = a["at"] + a["duration"]
        perto = abs(i["x"] - a["x"]) < 0.08 and abs(i["y"] - a["y"]) < 0.08 and abs(i["scale"] - a["scale"]) < 0.25
        # Mesmo lugar logo em seguida: fica ampliado, sem sair e voltar.
        if perto and i["at"] < fim_a + 4.5:
            a["duration"] = round(max(fim_a, i["at"] + i["duration"]) - a["at"], 2)
            continue
        if i["at"] < fim_a + 0.4:
            a["duration"] = round(max(1.2, i["at"] - 0.05 - a["at"]), 2)
            if a["at"] + a["duration"] > i["at"]:
                i["at"] = round(a["at"] + a["duration"] + 0.05, 2)
    junto.append(z)
final = sorted(outros + junto, key=lambda c: c["input"].get("at", 0))

# Arrasto que sai da paleta (ou vai à lixeira): a tela inteira enquanto a mão pega e leva o bloco; o zoom
# só entra depois que o bloco caiu (Helena, 16/11). Animação no lugar da tela: sem zoom por baixo.
def recorta(zooms, buracos):
    saida_z = []
    for z in zooms:
        pedacos = [(z["input"]["at"], z["input"]["at"] + z["input"]["duration"])]
        for b0, b1 in buracos:
            novos = []
            for p0, p1 in pedacos:
                if b1 <= p0 or b0 >= p1:
                    novos.append((p0, p1))
                    continue
                if b0 - p0 >= 1.2:
                    novos.append((p0, b0))
                if p1 - b1 >= 1.5:
                    novos.append((b1 + 0.05, p1))
            pedacos = novos
        for p0, p1 in pedacos:
            saida_z.append({**z, "input": {**z["input"], "at": round(p0, 2), "duration": round(p1 - p0, 2)}})
    return saida_z
# A caixa da categoria fica 1,5 s à vista na tela ampliada: o arrasto que sai da gaveta logo depois só abre a
# tela quando ela sai.
caixas_at = [c["input"]["at"] for c in final if c["input"].get("kind") == "box"]
ARRASTOS = [(max([b0] + [a + 1.5 + EASE for a in caixas_at if b0 - 3.0 < a < b0]), b1) for b0, b1 in ARRASTOS]
ARRASTOS = [(b0, b1) for b0, b1 in ARRASTOS if b1 > b0]
zs2 = recorta([c for c in final if c["tool"] == "add_zoom"], ARRASTOS + [(a, b) for a, b in ANIM])
final = sorted([c for c in final if c["tool"] != "add_zoom"] + zs2, key=lambda c: c["input"].get("at", 0))
# Zoom curto: menos de 2,2 s junta ao seguinte do mesmo lugar se vier logo, senão sai (zoom-relâmpago); menos
# de ZOOM_CURTO sem nenhum clique, escolha ou arrasto dentro também sai (não ajuda a ler).
ACOES = [g["acao"] for g in gestos if not g["verbo"].startswith(("apontar", "organizar"))]
zs3 = sorted((c for c in final if c["tool"] == "add_zoom"), key=lambda c: c["input"]["at"])
manter = []
for k, z in enumerate(zs3):
    i = z["input"]
    # A ação de um zoom pode vir logo antes dele (o bloco caiu e o zoom entra): 1,5 s antes contam.
    com_acao = any(i["at"] - 1.5 <= t <= i["at"] + i["duration"] for t in ACOES)
    if i["duration"] >= ZOOM_CURTO or (i["duration"] >= 2.2 and com_acao):
        manter.append(z)
        continue
    prox = zs3[k + 1]["input"] if k + 1 < len(zs3) else None
    if prox and prox["at"] - (i["at"] + i["duration"]) < 5 and abs(prox["x"] - i["x"]) < 0.12 and abs(prox["y"] - i["y"]) < 0.12:
        fim = prox["at"] + prox["duration"]
        prox["at"] = i["at"]
        prox["duration"] = round(fim - i["at"], 2)
final = sorted([c for c in final if c["tool"] != "add_zoom"] + manter, key=lambda c: c["input"].get("at", 0))
# Caixas das categorias: entram no clique; a 1 termina exatamente quando a 2 entra (nunca as duas juntas) e a
# 2 (ou a que vem sozinha) fica 1,5 s.
caixas_cat = sorted((c for c in final if c["input"].get("kind") == "box"), key=lambda c: c["input"]["at"])
for k, c in enumerate(caixas_cat):
    i = c["input"]
    prox = caixas_cat[k + 1]["input"] if k + 1 < len(caixas_cat) else None
    if prox and prox["at"] - i["at"] < 3.0:
        i["duration"] = round(max(0.5, prox["at"] - i["at"]), 2)
    else:
        i["duration"] = 1.5
# Nada passa do fim da aula (a última fala e o clique final): um zoom ou balão além dele esticaria a aula.
# A voz vai de 0,5 a 0,8 s além da última palavra, e a gravação tem o tamanho da voz: 0,5 s fica dentro dela.
FIM_AULA = max(t["fim"] for t in dec["trechos"]) + 0.5
final = [c for c in final if c["input"].get("at", 0) < FIM_AULA - 0.5]
for c in final:
    i = c["input"]
    if "duration" in i and i.get("at", 0) + i["duration"] > FIM_AULA:
        i["duration"] = round(FIM_AULA - i["at"], 2)
# Nada por cima da animação (destaques e caixas que começam nela saem; os que entram nela acabam antes).
final = [c for c in final if not any(a - 0.05 <= c["input"].get("at", -9) < b for a, b in ANIM)]
for c in final:
    i = c["input"]
    for a, b in ANIM:
        if i["at"] < a < i["at"] + i["duration"]:
            i["duration"] = round(max(0.5, a - i["at"]), 2)

# Marcações acima do zoom: cada uma dentro de um estado só do zoom (nunca entra antes de ele terminar de abrir,
# nem fica quando ele começa a fechar) e na posição da tela ampliada.
ZOOMS = sorted((c["input"] for c in final if c["tool"] == "add_zoom"), key=lambda z: z["at"])
MARCA = [c for c in final if c["tool"] == "add_annotation"]


def zoom_em(t):
    return next((z for z in ZOOMS if z["at"] <= t < z["at"] + z["duration"]), None)


def na_tela_ampliada(c, z):
    """(s, cx, cy) aplicado à marcação c: posição, contorno e escala."""
    i = c["input"]
    s_, cx, cy = z["scale"], z["x"], z["y"]
    i["x"] = round((i["x"] - cx) * s_ + 0.5, 4)
    i["y"] = round((i["y"] - cy) * s_ + 0.5, 4)
    for k in ("box_width", "box_height"):
        if k in i:
            i[k] = int(round(i[k] * s_))
    if i["kind"] != "highlight":
        i["scale"] = round(i.get("scale", 1) * s_, 4)
    if "ancora_esquerda" in c:
        c["ancora_esquerda"] = round((c["ancora_esquerda"] - cx) * s_ + 0.5, 4)
    c["zoom"] = [s_, cx, cy]


saem = []
for c in MARCA:
    i = c["input"]
    ini, fim = i["at"], i["at"] + i["duration"]
    z = zoom_em(ini + 0.01) or zoom_em(ini + EASE)
    if z:
        aberto, fechando = z["at"] + EASE, z["at"] + z["duration"] - EASE
        ini, fim = max(ini, aberto), min(fim, fechando)
    else:
        # Sem zoom: termina antes de um zoom que comece no meio dela.
        seguinte = next((x for x in ZOOMS if ini < x["at"] < fim), None)
        if seguinte:
            fim = seguinte["at"]
    if fim - ini < 0.8:
        saem.append(c)
        REVISAR.append(f"{c['input']['at']:.1f}s: {c['nota']} saiu (não cabe num estado só do zoom)")
        continue
    i["at"], i["duration"] = round(ini, 2), round(fim - ini, 2)
    if z:
        na_tela_ampliada(c, z)
final = [c for c in final if c not in saem]
MARCA = sorted((c for c in final if c["tool"] == "add_annotation"), key=lambda c: c["input"]["at"])

# Balão inteiro na tela e fora da apresentadora: na tela ampliada ele cresce com o zoom e pode passar da
# borda (o botão Verificar projeto fica embaixo, à direita, onde ela está).
BALAO_W, BALAO_H = 420, 130  # o balão do EdiAula em escala 1, em pixels do quadro
for c in MARCA:
    i = c["input"]
    if i.get("kind") != "balloon":
        continue
    s_ = i.get("scale", 1)
    hw, hh = BALAO_W * s_ / 2 / W, BALAO_H * s_ / 2 / H
    direita = (AREA_AP / W if com_apresentadora(i["at"], i["at"] + i["duration"]) else 1.0) - 0.01
    i["x"] = round(min(max(i["x"], hw + 0.01), direita - hw), 4)
    i["y"] = round(min(max(i["y"], hh + 0.01), 0.99 - hh), 4)

# Mesmo bloco destacado de novo em menos de 2 s: estende o anterior em vez de repetir.
repetidos = []
for k, c in enumerate(MARCA):
    if c.get("papel") != "destaque" or c in repetidos:
        continue
    i = c["input"]
    for d in MARCA[k + 1:]:
        j = d["input"]
        if j["at"] - (i["at"] + i["duration"]) >= 2.0:
            break
        if d.get("papel") == "destaque" and d.get("alvo") == c.get("alvo") and c.get("zoom") == d.get("zoom"):
            i["duration"] = round(max(i["at"] + i["duration"], j["at"] + j["duration"]) - i["at"], 2)
            repetidos.append(d)
final = [c for c in final if c not in repetidos]
MARCA = [c for c in MARCA if c not in repetidos]

# Uma faixa só para as marcações: nunca duas ao mesmo tempo; a anterior termina exatamente quando a seguinte
# começa (a que sobraria com menos de 0,5 s sai).
curtas = []
for a, b in zip(MARCA, MARCA[1:]):
    i, j = a["input"], b["input"]
    if i["at"] + i["duration"] > j["at"]:
        if j["at"] - i["at"] < 0.5:
            curtas.append(a)
            REVISAR.append(f"{i['at']:.1f}s: {a['nota']} saiu (sobreposta por {b['nota']})")
        else:
            i["duration"] = round(j["at"] - i["at"], 2)
final = [c for c in final if c not in curtas]
for c in final:
    if c["tool"] == "add_annotation":
        c["input"]["track_id"] = "$MARCACOES"


def caixa_na_tela(i):
    """Contorno aproximado da marcação em px do quadro (o destaque tem o tamanho; as outras, um palpite)."""
    w = i.get("box_width", 420 * i.get("scale", 1))
    h = i.get("box_height", 140 * i.get("scale", 1))
    x, y = i["x"] * W, i["y"] * H
    return (x - w / 2, y - h / 2, x + w / 2, y + h / 2)


def cobre(a, b):
    return a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]


# Nenhuma marcação cobre a apresentadora (ela sai nesse trecho) nem o personagem que está falando (revisar).
for c in final:
    if c["tool"] != "add_annotation":
        continue
    i = c["input"]
    ini, fim = i["at"], i["at"] + i["duration"]
    if com_apresentadora(ini, fim) and cobre(caixa_na_tela(i), AREA_AP_CAIXA):
        CONFLITO.append([ini - 0.3, fim + 0.3])
    for x in dec["insercoes"]:
        if x["ini"] < fim and ini < x["fim"] and cobre(caixa_na_tela(i), AREA_PERS_CAIXA):
            REVISAR.append(f"{ini:.1f}s: {c['nota']} cobre {x['personagem']} falando")

# Explicação sem zoom sobre o que fica atrás da apresentadora (o jogo, à direita): ela sai.
for g in gestos:
    if g["x"] is not None and g["x"] > AREA_AP and com_apresentadora(g["ini"], g["fim"]):
        if not any(c["tool"] == "add_zoom" and c["input"]["at"] <= g["acao"] <= c["input"]["at"] + c["input"]["duration"] for c in final):
            CONFLITO.append([g["ini"] - 0.5, g["fim"] + 0.5])
# Intervalos da apresentadora: sem os conflitos (no conceito ela fica: a animação reserva a faixa dela).
ap = []
for a, b in sorted(PRES):
    partes = [[max(a, de), min(b, ate)]]
    if a < 0.1:
        # A capa: ela fala desde o primeiro segundo (e fica até o fim de uma animação que começa junto).
        ap.append([0.0, max(3.0, min(b, ate))])
        continue
    for c0, c1 in CONFLITO:
        if any(c0 < k1 and k0 < c1 for k0, k1 in CONCEITO if k0 <= a + 0.2 and b - 0.2 <= k1):
            continue
        novas = []
        for x0, x1 in partes:
            if c1 <= x0 or c0 >= x1:
                novas.append([x0, x1])
            else:
                if c0 > x0: novas.append([x0, c0])
                if c1 < x1: novas.append([c1, x1])
        partes = novas
    ap += partes
junt = []
for a, b in sorted(ap):
    if junt and a - junt[-1][1] < 0.7:
        junt[-1][1] = max(junt[-1][1], b)
    else:
        junt.append([a, b])
apresentadora = [[round(a, 2), round(b, 2)] for a, b in junt if b - a >= 2.0 or a < 0.1]
json.dump(apresentadora, open(saida.replace(".json", "-apresentadora.json"), "w"), ensure_ascii=False)
print("apresentadora:", apresentadora, "| conflitos:", [[round(a, 1), round(b, 1)] for a, b in CONFLITO])
json.dump(final, open(saida, "w", encoding="utf8"), ensure_ascii=False, indent=1)
json.dump(REVISAR, open(saida.replace(".json", "-revisar.json"), "w", encoding="utf8"), ensure_ascii=False, indent=1)
for c in final:
    i = c["input"]
    print(f"{i.get('at', 0):6.1f} {c['tool']:15s} {i.get('kind', ''):10s} {c['nota']}")
print(len(final), "comandos")
for r in REVISAR:
    print("revisar:", r)
