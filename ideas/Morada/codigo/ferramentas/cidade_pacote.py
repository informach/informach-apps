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
json.dump(saida, open(os.path.join(V, "cidade.json"), "w"), ensure_ascii=False, separators=(",", ":"))
tot = sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(V) for f in fs)
nfiles = sum(len(fs) for _, _, fs in os.walk(V))
print("ok", len(saida["itens"]), "itens,", len(cats), "categorias,", round(tot / 1e6, 1), "MB,", nfiles, "arquivos")
