"""Lista de decisões de edição de uma parte gravada pelo robô.

Uso: decisoes.py <pasta da gravação> <transcrição.json> <roteiro.md> <número da parte> [saida.json]

Cada frase da voz vira um trecho de um de três tipos (regras da Helena, 16/11/2026):
  - acao: algum gesto do robô cai na frase -> só a tela, zoom, destaque no bloco, balão no botão;
  - conceito: sequência de frases sem gesto que explica ou recapitula -> animação do EdiSVG;
  - fala: frase curta sem gesto -> a apresentadora.
Debinha e Dedé saem da tabela de substituições do roteiro.
"""

import bisect
import json
import re
import sys
import unicodedata

pasta, transcricao, roteiro, parte = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
saida = sys.argv[5] if len(sys.argv) > 5 else None


def fold(s):
    s = unicodedata.normalize("NFD", s.lower())
    return re.sub(r"[^a-z0-9 ]", " ", "".join(c for c in s if unicodedata.category(c) != "Mn"))


def toks(s):
    return fold(s).split()


words = json.load(open(transcricao, encoding="utf8"))["words"]
run = json.load(open(f"{pasta}/guided-run.json", encoding="utf8"))
log = [json.loads(l) for l in open(f"{pasta}/guided-log.jsonl", encoding="utf8")]

# Vídeo -> narração, pelos pontos de sincronia do registro.
sync = sorted((r["t"], r["w"]) for r in log if r.get("k") == "sync")
vt = [a for a, _ in sync]


def narr(t):
    i = bisect.bisect_left(vt, t)
    if i <= 0:
        return sync[0][1] + (t - sync[0][0])
    if i >= len(sync):
        return sync[-1][1] + (t - sync[-1][0])
    (t0, w0), (t1, w1) = sync[i - 1], sync[i]
    return w0 + (w1 - w0) * (t - t0) / (t1 - t0 or 1)


glides = [r for r in log if r.get("k") == "glide"]

# Frases da voz.
def montar_frases(quebras=()):
    """Frases da voz pela pontuação; as falas dos personagens (quebras: índices de palavra onde começa ou
    acaba uma fala) também quebram, porque a transcrição às vezes junta a fala à frase anterior."""
    frases, atual = [], []
    for k, w in enumerate(words):
        if k in quebras and atual:
            frases.append(atual)
            atual = []
        atual.append(w)
        if re.search(r"[.?!]\"?$", w["text"].strip()):
            frases.append(atual)
            atual = []
    if atual:
        frases.append(atual)
    return [{"ini": f[0]["start"], "fim": f[-1]["end"], "texto": " ".join(x["text"] for x in f)} for f in frases]


frases = montar_frases()

# Gestos com o ponto da tela (fim do último deslize dentro da etapa) e o tempo na voz.
# O balão de cada botão diz o nome que a criança procura na tela (Helena, 27/11/2026: tudo que a fala nomeia é
# mostrado e sinalizado, onde fica e como funciona). Os cliques seguintes do mesmo gesto (a confirmação de um envio)
# ganham o balão de CONFIRMA, um por clique.
BOTOES = {
    "expandir estúdio": "Clique em Expandir para ver o jogo grande",
    "reduzir estúdio": "Clique em Reduzir para voltar à aula",
    "rodar de novo": "Clique para começar uma partida nova",
    "verificar projeto": "Clique em Verificar projeto",
    "enviar projeto": "Clique em Enviar meu projeto",
    "próxima parte": "Clique em Próxima parte",
    "concluir aula": "Clique em Concluir aula",
    "compartilhar": "Clique para publicar no Mural",
    "ampliar experiência": "Clique em Ampliar experiência",
    "ampliar jogo": "Clique em Ampliar jogo",
    "voltar à aula": "Clique em Voltar à aula",
    "livro tela cheia": "Clique aqui para ver em tela cheia",
    "livro sair da tela cheia": "Clique aqui para sair da tela cheia",
    "baixar": "Clique em Baixar",
}
CONFIRMA = {"enviar projeto": ["Confirme em Enviar"]}


def contorno_do_texto(tela, t, x, y):
    """O texto que a mão aponta no quadro t da gravação (o "Achados: 1" do jogo): a mão descansa logo abaixo dele.
    Junta os pixels escuros de uma janela acima do ponto e devolve a caixa deles, ou None."""
    import io
    import subprocess

    from PIL import Image
    try:
        png = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{max(0.0, t):.3f}", "-i", tela, "-frames:v", "1",
                              "-f", "image2pipe", "-vcodec", "png", "-"], capture_output=True, check=True).stdout
        im = Image.open(io.BytesIO(png)).convert("L")
    except Exception:
        return None
    s = im.width / 1920
    X, Y = round(x * s), round(y * s)
    x0, y0, x1, y1 = max(0, X - round(280 * s)), max(0, Y - round(120 * s)), min(im.width, X + round(280 * s)), Y
    px = im.load()
    escuros = [(i, j) for j in range(y0, y1) for i in range(x0, x1) if px[i, j] < 90]
    if len(escuros) < 40:
        return None
    xs, ys = [p[0] for p in escuros], [p[1] for p in escuros]
    caixa = [min(xs) / s, min(ys) / s, (max(xs) + 1) / s, (max(ys) + 1) / s]
    if caixa[2] - caixa[0] > 520 or caixa[3] - caixa[1] > 120:
        return None
    return [round(v) for v in caixa]


def contorno_do_botao(tela, t, x, y):
    """O contorno do botão sob o ponto (x, y) no quadro t da gravação da tela (o cursor não está desenhado nela):
    a região conexa da cor de fundo do botão em volta do ponto (o texto dentro não conta). None se não achar algo do
    tamanho de um botão."""
    import io
    import subprocess

    from PIL import Image
    try:
        png = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{max(0.0, t):.3f}", "-i", tela, "-frames:v", "1",
                              "-f", "image2pipe", "-vcodec", "png", "-"], capture_output=True, check=True).stdout
        im = Image.open(io.BytesIO(png)).convert("RGB")
    except Exception:
        return None
    s = im.width / 1920
    X, Y = round(x * s), round(y * s)
    x0, y0, x1, y1 = max(0, X - 260), max(0, Y - 80), min(im.width, X + 260), min(im.height, Y + 80)
    px = im.load()
    from collections import Counter
    viz = Counter((px[i, j][0] // 12, px[i, j][1] // 12, px[i, j][2] // 12)
                  for i in range(max(x0, X - 10), min(x1, X + 11)) for j in range(max(y0, Y - 10), min(y1, Y + 11)))
    cor = [c * 12 + 6 for c in viz.most_common(1)[0][0]]
    # Botão claro (cinza-azulado sobre o painel branco) pede tolerância menor, senão vaza para o painel.
    tol = 9 if min(cor) > 200 else 22
    perto = lambda c: max(abs(c[0] - cor[0]), abs(c[1] - cor[1]), abs(c[2] - cor[2])) <= tol
    vistos, fila = set(), [(i, j) for i in range(X - 10, X + 11) for j in range(Y - 10, Y + 11)
                          if x0 <= i < x1 and y0 <= j < y1 and perto(px[i, j])]
    vistos.update(fila)
    while fila:
        i, j = fila.pop()
        for a, b in ((i + 1, j), (i - 1, j), (i, j + 1), (i, j - 1)):
            if x0 <= a < x1 and y0 <= b < y1 and (a, b) not in vistos and perto(px[a, b]):
                vistos.add((a, b))
                fila.append((a, b))
    if not vistos:
        return None
    xs, ys = [p[0] for p in vistos], [p[1] for p in vistos]
    bx0, by0, bx1, by1 = min(xs) / s, min(ys) / s, (max(xs) + 1) / s, (max(ys) + 1) / s
    if not (40 <= bx1 - bx0 <= 480 and 18 <= by1 - by0 <= 90) or len(vistos) < 0.35 * (bx1 - bx0) * (by1 - by0) * s * s:
        return None
    return [round(bx0), round(by0), round(bx1), round(by1)]


BLOCO = re.compile(r"^(encaixar|soltar|abrir campo|escolher|apontar bloco|apontar encaixe|apontar abaixo de|mostrar blocos|jogar na lixeira|apontar mais de|abrir \")")
gestos = []
for s in run["steps"]:
    if s.get("status") != "done":
        continue
    pts = [g for g in glides if s["began"] - 0.05 <= g["until"] <= s["finished"] + 0.05]
    p = pts[-1]["to"] if pts else None
    v = s["speech"]
    tipo = (
        "botao" if v in BOTOES or v.startswith("clicar \"")
        else "bloco" if BLOCO.match(v)
        # "abrir categoria" (Farol) e "categoria" (Cadê, um nível por gesto) navegam na paleta.
        else "categoria" if v.startswith(("abrir categoria", "categoria "))
        else "jogo" if "prévia" in v or v.startswith("segurar tecla")
        else "aponta"
    )
    balao = BOTOES.get(v) or (f"Clique em {v[8:-1]}" if v.startswith("clicar \"") else None)
    gestos.append({"verbo": v, "tipo": tipo, "ini": s["start"], "acao": s["act"], "fim": s["end"],
                   "x": round(p["x"]) if p else None, "y": round(p["y"]) if p else None, "balao": balao})
    if re.match(r"^apontar jogo \d+ \d+$", v) and p:
        # Um número do jogo que a fala nomeia ("repare no número Achados"): o contorno do texto, para o zoom e a
        # moldura pegarem o número inteiro.
        gestos[-1]["caixa_texto"] = contorno_do_texto(f"{pasta}/tela.mp4", pts[-1]["until"] + 0.3, p["x"], p["y"])
    if tipo == "botao":
        # Cada clique do gesto (o envio tem dois: o botão e a confirmação), no segundo da voz, com o contorno do botão
        # medido na gravação da tela, um instante antes do clique.
        cliques = []
        for k, gl in enumerate(pts):
            tv = s["start"] + (gl["until"] - s["began"]) if k else s["act"]
            cx_, cy_ = gl["to"]["x"], gl["to"]["y"]
            cliques.append({"t": round(tv, 2), "x": round(cx_), "y": round(cy_),
                            "caixa": contorno_do_botao(f"{pasta}/tela.mp4", gl["until"] - 0.05, cx_, cy_),
                            "balao": balao if k == 0 else (CONFIRMA.get(v, [None] * k) + [None] * k)[k - 1]})
        gestos[-1]["cliques"] = cliques

# Debinha e Dedé: a fala exata da tabela, achada na voz.
tab = open(roteiro, encoding="utf8").read()
i = tab.find(f"## Parte {parte}.")
secao = tab[i : tab.find("## Parte", i + 5)]
insercoes = []
quebras_fala = set()
toksv = [toks(w["text"]) for w in words]
flat = [(k, t) for k, ts in enumerate(toksv) for t in ts]
for linha in secao.splitlines():
    if not linha.startswith("| video"):
        continue
    c = [x.strip() for x in linha.strip("|").split("|")]
    alvo = toks(c[4])
    melhor = None
    for s0 in range(len(flat)):
        seq = [t for _, t in flat[s0 : s0 + len(alvo)]]
        acertos = sum(a == b for a, b in zip(seq, alvo))
        if not melhor or acertos > melhor[0]:
            melhor = (acertos, s0)
    a, s0 = melhor
    i0, i1 = flat[s0][0], flat[min(s0 + len(alvo) - 1, len(flat) - 1)][0]
    w0, w1 = words[i0], words[i1]
    quebras_fala.update({i0, i1 + 1})
    insercoes.append({"id": c[0], "personagem": c[1], "fala": c[4], "ini": w0["start"], "fim": w1["end"],
                      "acerto": f"{a}/{len(alvo)}"})

frases = montar_frases(quebras_fala)

PASSIVO = re.compile(r"^apontar ")

# Tipo de cada frase.
for f in frases:
    g = [x for x in gestos if f["ini"] - 0.3 <= x["acao"] <= f["fim"] + 0.3 and x["verbo"] != "apontar zappy"]
    f["gestos"] = g
    meio = (f["ini"] + f["fim"]) / 2
    pers = next((x for x in insercoes if x["ini"] - 0.3 <= meio <= x["fim"] + 0.3), None)
    # Ação de verdade (arrastar, clicar, escolher, abrir, segurar) tira a apresentadora; só apontar
    # (os blocos parados, com a explicação) e a fala sem gesto mostram a apresentadora (Helena, 16/11).
    ativos = [x for x in g if not PASSIVO.match(x["verbo"])]
    f["tipo"] = "personagem" if pers else "acao" if ativos else "explica" if g else "sem"
    if pers:
        f["quem"] = pers["personagem"]

# Parte de experiência (a criança faz e descobre): a explicação antes de ampliar é conceito.
amplia = next((x for x in gestos if x["verbo"] == "ampliar experiência"), None)
if amplia:
    for f in frases:
        if f["fim"] < amplia["acao"] - 0.3 and f["tipo"] == "sem":
            f["tipo"] = "conceito"
            f["gestos"] = []
        if f["ini"] <= amplia["acao"] + 0.3 and f["tipo"] == "sem":
            break

# Instrução curta sem gesto entre duas ações (até 4,5 s, até 3 s de cada lado): a tela continua.
for k, f in enumerate(frases):
    if f["tipo"] not in ("sem", "explica") or f["fim"] - f["ini"] > 3.0:
        continue
    antes = next((x for x in reversed(frases[:k]) if x["tipo"] not in ("sem", "explica")), None)
    depois = next((x for x in frases[k + 1 :] if x["tipo"] not in ("sem", "explica")), None)
    if antes and depois and antes["tipo"] == "acao" and depois["tipo"] == "acao" and \
            f["ini"] - antes["fim"] < 3.5 and depois["ini"] - f["fim"] < 3.5:
        f["tipo"] = "acao"

# Sequências sem gesto: 2 frases ou mais e 6 s ou mais viram conceito; o resto é a apresentadora.
trechos = []
for f in frases:
    if trechos and trechos[-1]["tipo"] == f["tipo"]:
        t = trechos[-1]
        t["fim"], t["frases"] = f["fim"], t["frases"] + [f]
    else:
        trechos.append({"tipo": f["tipo"], "ini": f["ini"], "fim": f["fim"], "frases": [f]})
for t in trechos:
    if t["tipo"] == "sem":
        longo = len(t["frases"]) >= 2 and t["fim"] - t["ini"] >= 6
        t["tipo"] = "conceito" if longo else "fala"

# Zoom: um por grupo de gestos de tela perto um do outro; anda junto (pan) em vez de sair e entrar.
zooms = []
for g in gestos:
    if g["x"] is None or g["tipo"] in ("jogo",):
        continue
    if zooms and g["ini"] - zooms[-1]["fim"] < 2.5 and abs(g["x"] - zooms[-1]["pontos"][-1][0]) < 700:
        z = zooms[-1]
        z["fim"] = g["fim"] + 0.8
        z["pontos"].append((g["x"], g["y"], round(g["acao"], 2)))
    else:
        zooms.append({"ini": max(0, g["ini"] - 0.4), "fim": g["fim"] + 0.8, "escala": 1.6,
                      "pontos": [(g["x"], g["y"], round(g["acao"], 2))]})

plano = {"trechos": [{k: v for k, v in t.items() if k != "frases"} | {"texto": " ".join(f["texto"] for f in t["frases"])} for t in trechos],
         "gestos": gestos, "insercoes": insercoes, "zooms": zooms}
if saida:
    json.dump(plano, open(saida, "w", encoding="utf8"), ensure_ascii=False, indent=1)

# Relatório.
dur = words[-1]["end"]
soma = {k: sum(t["fim"] - t["ini"] for t in trechos if t["tipo"] == k) for k in ("acao", "explica", "conceito", "fala", "personagem")}
print(f"Voz {dur:.1f}s | ação {soma['acao']:.0f}s | conceito {soma['conceito']:.0f}s | explica {soma['explica']:.0f}s | apresentadora {soma['fala']:.0f}s | personagens {soma['personagem']:.0f}s")
print(f"{len(gestos)} gestos | {len(zooms)} zooms | {sum(1 for g in gestos if g['tipo']=='bloco')} destaques de bloco | {sum(1 for g in gestos if g['balao'])} balões")
for t in trechos:
    print(f"\n[{t['ini']:6.1f}-{t['fim']:6.1f}] {t['tipo'].upper()}")
    for f in t["frases"]:
        print(f"    «{f['texto'][:110]}»")
        for g in f["gestos"]:
            extra = f"  balão «{g['balao']}»" if g["balao"] else ("  destaque no bloco" if g["tipo"] == "bloco" else "")
            print(f"        {g['acao']:6.1f} {g['verbo'][:70]}{extra}")
print("\nPersonagens:")
for x in insercoes:
    print(f"  {x['ini']:6.1f}-{x['fim']:6.1f} {x['personagem']}: «{x['fala']}» (achado {x['acerto']})")
