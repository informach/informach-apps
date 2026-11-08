"""Empacota a biblioteca de cidade para a página (o mesmo formato da de móveis).

Para cada categoria em <SP>/moveis_out/<cat>/catalogo.json:
- pacotes/<cat>[_n].txt: os GLB da categoria concatenados, em gzip e base64 (cada parte com até ~9 MB de GLB);
- sprites/<cat>.webp: as miniaturas numa grade de células de 128 px (16 colunas);
- vitrine/<cat>*.jpg: as vitrines renderizadas pelo gerador (se houver);
- moveis.json: categorias e itens (com parte, deslocamento e tamanho no pacote, e a célula da miniatura).
A miniatura de cada item é obrigatória: falta de miniatura para o empacotamento com erro.
Uso: python3 -I moveis_pacote.py <SP> [--teste]"""
import base64
import glob
import gzip
import json
import os
import shutil
import sys

from PIL import Image

SP = sys.argv[1]
TESTE = "--teste" in sys.argv
O = os.path.join(SP, "cidade_out")
V = os.path.join(SP, "cidade_viewer")
for d in ("pacotes", "sprites", "vitrine"):
    os.makedirs(os.path.join(V, d), exist_ok=True)

ORDEM = [
    ("ruas", "Ruas e avenidas"), ("pisos", "Calçadas e pisos"), ("estacionamentos", "Estacionamentos"),
    ("ferrovia", "Ferrovia e trem"), ("pontes", "Pontes"), ("agua", "Água e represa"),
    ("estruturas", "Viadutos e estruturas"),
    ("arranha_ceus", "Arranha-céus"), ("predios_regulares", "Prédios regulares"),
    ("predios_ecologicos", "Prédios ecológicos"), ("predios_chinatown", "Prédios de Chinatown"),
    ("predios_futuristas", "Prédios futuristas"), ("predios_tropicais", "Prédios tropicais"),
    ("predios_magicos", "Prédios mágicos"), ("sinalizacao", "Outdoors e letreiros"), ("grafites", "Grafites"),
    ("vegetacao", "Vegetação"), ("mobiliario_urbano", "Mobiliário urbano"),
    ("parque_areas", "Parque: áreas e atrações"), ("parque_brinquedos", "Parque: brinquedos"),
    ("fantasia", "Vila de fantasia"), ("carros", "Carros"), ("utilitarios", "Utilitários e trens"),
    ("barcos", "Barcos e navio"), ("aeronaves", "Aeronaves"),
    ("props_rua", "Props: rua e telhado"), ("props_praia", "Props: praia"),
    ("props_lazer", "Props: lazer e entretenimento"), ("props_esporte", "Props: esporte"),
    ("cenario", "Cenário e marcos"),
    ("teste_cidade", "Teste"), ("teste_predios", "Teste: prédios"),
]
ROT = dict(ORDEM)
CEL, COLS = 128, 16
PARTE_MAX = 9_000_000

cats = [c for c, _ in ORDEM if os.path.exists(os.path.join(O, c, "catalogo.json")) and (TESTE or not c.startswith("teste"))]
saida = {"categorias": [], "itens": [], "paleta": "paleta_moveis.png"}
faltam = []
for cat in cats:
    dados = json.load(open(os.path.join(O, cat, "catalogo.json")))
    itens = [i for i in dados["itens"] if os.path.exists(os.path.join(O, cat, i["arquivo"]))]
    itens.sort(key=lambda i: (i.get("grupo", ""), i["id"]))
    for i in itens:
        if not os.path.exists(os.path.join(O, cat, i["miniatura"])):
            faltam.append(i["id"])
    if faltam:
        continue
    # pacotes
    partes, atual, n_parte = [], bytearray(), 0
    for i in itens:
        b = open(os.path.join(O, cat, i["arquivo"]), "rb").read()
        if atual and len(atual) + len(b) > PARTE_MAX:
            partes.append(atual)
            atual = bytearray()
        i["_parte"], i["_ini"], i["_tam"] = len(partes), len(atual), len(b)
        atual += b
    partes.append(atual)
    arqs = []
    for k, p in enumerate(partes):
        nome = f"pacotes/{cat}.txt" if len(partes) == 1 else f"pacotes/{cat}_{k + 1}.txt"
        open(os.path.join(V, nome), "w").write(base64.b64encode(gzip.compress(bytes(p), 9)).decode())
        arqs.append(nome)
    for velho in glob.glob(os.path.join(V, "pacotes", cat + "*.txt")):
        if os.path.relpath(velho, V) not in arqs:
            os.remove(velho)
    # sprite
    lin = (len(itens) + COLS - 1) // COLS
    sp = Image.new("RGBA", (COLS * CEL, max(1, lin) * CEL), (0, 0, 0, 0))
    for k, i in enumerate(itens):
        im = Image.open(os.path.join(O, cat, i["miniatura"])).convert("RGBA").resize((CEL, CEL), Image.LANCZOS)
        sp.alpha_composite(im, ((k % COLS) * CEL, (k // COLS) * CEL))
        i["_cel"] = k
    sp.save(os.path.join(V, "sprites", cat + ".webp"), quality=88, method=6)
    # vitrines
    vits = []
    for f in sorted(glob.glob(os.path.join(O, cat, "encaixe*.png"))) + sorted(glob.glob(os.path.join(O, cat, "quarteirao*.png"))) + sorted(glob.glob(os.path.join(O, cat, "teste_rua*.png"))) + sorted(glob.glob(os.path.join(O, cat, "vitrine*.png"))):
        if f.endswith("_topo.png"):
            continue
        nome = f"vitrine/{cat}_{os.path.basename(f)[:-4]}.jpg"
        Image.open(f).convert("RGB").save(os.path.join(V, nome), quality=84, optimize=True)
        vits.append(nome)
    saida["categorias"].append({"id": cat, "rotulo": ROT.get(cat, dados.get("rotulo", cat)), "n": len(itens),
                                "pacotes": arqs, "sprite": f"sprites/{cat}.webp", "cel": CEL, "colunas": COLS,
                                "linhas": lin, "vitrines": vits})
    for i in itens:
        e = {k: v for k, v in i.items() if not k.startswith("_") and k not in ("arquivo", "miniatura", "categoria")}
        e.update({"cat": cat, "parte": i["_parte"], "ini": i["_ini"], "tam": i["_tam"], "cel": i["_cel"]})
        saida["itens"].append(e)
if faltam:
    sys.exit("falta miniatura: " + ", ".join(faltam[:30]))
shutil.copy(os.path.join(SP, "moveis_out", "paleta_moveis.png") if not os.path.exists(os.path.join(O, "paleta_moveis.png")) else os.path.join(O, "paleta_moveis.png"), os.path.join(V, "paleta_moveis.png"))
# nomes e cores da paleta (para a troca de cores na página), lidos da base sem importar o Blender
import ast
src = open(os.path.join(SP, "morada-art", "moveis_base.py")).read()
ini = src.index("CORES = {")
fim = src.index("}", ini) + 1
cores = ast.literal_eval(src[ini + len("CORES = "):fim])
saida["paleta_nomes"] = list(cores)
saida["paleta_hex"] = list(cores.values())
# cenas de exemplo (cidade_out/cenas/<id>.json + <id>_dia.png/<id>_noite.png): cópia enxuta, renders em jpg e os bichos
# que elas usam (bichos/<id>.txt, do visor de bichos)
saida["cenas"] = []
C = os.path.join(O, "cenas")
if os.path.isdir(C):
    for d in ("cenas", "bichos"):
        os.makedirs(os.path.join(V, d), exist_ok=True)
    por_id = {i["id"]: i for i in saida["itens"]}
    parte_bytes = {}
    for c in saida["categorias"]:
        for k, a in enumerate(c["pacotes"]):
            parte_bytes[(c["id"], k)] = os.path.getsize(os.path.join(V, a))
    lista = []
    for f in sorted(glob.glob(os.path.join(C, "*.json"))):
        try:
            cena = json.load(open(f))
        except Exception:
            continue
        if not isinstance(cena, dict) or "pecas" not in cena:
            continue
        lista.append(cena)
    ordem_f = os.path.join(C, "ordem.json")
    ordem = json.load(open(ordem_f)) if os.path.exists(ordem_f) else []
    lista.sort(key=lambda c: (ordem.index(c["id"]) if c["id"] in ordem else len(ordem), len(c["pecas"]), c["id"]))
    faltam_c = set()
    usados_b = set()
    for cena in lista:
        cid = cena["id"]
        pecas = []
        partes, bichos_c = set(), set()
        for pc in cena["pecas"]:
            if pc.get("c") == "bichos":
                if os.path.exists(os.path.join(SP, "pets_viewer", "bichos", pc["i"] + ".txt")):
                    bichos_c.add(pc["i"]); pecas.append(pc)
                continue
            it = por_id.get(pc.get("i"))
            if not it:
                faltam_c.add(f'{pc.get("c")}/{pc.get("i")}')
                continue
            partes.add((it["cat"], it["parte"]))
            q = {"c": it["cat"], "i": pc["i"], "p": [round(float(v), 3) for v in pc["p"]]}
            for k in ("r", "s", "rota", "vel", "anim"):
                if k in pc and pc[k] not in (0, 1, None):
                    q[k] = pc[k]
            pecas.append(q)
        enxuta = {k: cena[k] for k in ("id", "rotulo", "descricao", "tamanho", "centro", "camera") if k in cena}
        enxuta["pecas"] = pecas
        json.dump(enxuta, open(os.path.join(V, "cenas", cid + ".json"), "w"), ensure_ascii=False, separators=(",", ":"))
        imgs = {}
        for k in ("dia", "noite"):
            png = os.path.join(C, f"{cid}_{k}.png")
            if os.path.exists(png):
                nome = f"cenas/{cid}_{k}.jpg"
                im = Image.open(png).convert("RGB")
                if im.width > 1920:
                    im = im.resize((1920, round(im.height * 1920 / im.width)), Image.LANCZOS)
                im.save(os.path.join(V, nome), quality=84, optimize=True)
                imgs[k] = nome
        for b in bichos_c:
            shutil.copy(os.path.join(SP, "pets_viewer", "bichos", b + ".txt"), os.path.join(V, "bichos", b + ".txt"))
        usados_b |= bichos_c
        tam = cena.get("tamanho", [200, 200])
        saida["cenas"].append({
            "id": cid, "rotulo": cena.get("rotulo", cid), "descricao": cena.get("descricao", ""), "tamanho": tam,
            "arquivo": f"cenas/{cid}.json", "imagens": imgs, "n": len(pecas),
            "tipos": len({(q["c"], q["i"]) for q in pecas}),
            "bichos": sum(1 for q in pecas if q["c"] == "bichos"),
            "andam": sum(1 for q in pecas if q.get("rota")),
            "bytes": sum(parte_bytes.get(x, 0) for x in partes)
                     + sum(os.path.getsize(os.path.join(V, "bichos", b + ".txt")) for b in bichos_c)})
    for velho in glob.glob(os.path.join(V, "bichos", "*.txt")):
        if os.path.basename(velho)[:-4] not in usados_b:
            os.remove(velho)
    if faltam_c:
        print("cenas: peças fora do catálogo (ignoradas):", ", ".join(sorted(faltam_c)[:40]))
    print("cenas:", len(saida["cenas"]))
json.dump(saida, open(os.path.join(V, "cidade.json"), "w"), ensure_ascii=False, separators=(",", ":"))
tot = sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(V) for f in fs)
nfiles = sum(len(fs) for _, _, fs in os.walk(V))
print("ok", len(saida["itens"]), "itens,", len(cats), "categorias,", round(tot / 1e6, 1), "MB,", nfiles, "arquivos")
