"""Empacota a biblioteca de móveis para a página.

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
O = os.path.join(SP, "moveis_out")
V = os.path.join(SP, "moveis_viewer")
for d in ("pacotes", "sprites", "vitrine"):
    os.makedirs(os.path.join(V, d), exist_ok=True)

ORDEM = [
    ("sofas", "Sofás e espreguiçadeiras"), ("pufes", "Pufes"), ("cadeiras", "Cadeiras e poltronas"), ("mesas", "Mesas"),
    ("racks_tv", "Racks de TV"), ("estantes", "Estantes e prateleiras"), ("lareiras", "Lareiras"),
    ("camas", "Camas"), ("criados", "Criados-mudos"), ("armarios", "Guarda-roupas e armários"),
    ("sapateiras", "Sapateiras"), ("cozinha_moveis", "Cozinha: módulos"),
    ("cozinha_eletros", "Cozinha: eletros e utensílios"), ("banheiro", "Banheiro"), ("luminarias", "Luminárias"),
    ("quadros", "Quadros"), ("tapetes", "Tapetes"), ("plantas", "Plantas"), ("livros", "Livros"),
    ("objetos", "Objetos"), ("teste", "Teste"), ("teste_frentes", "Teste: frentes"),
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
    for f in sorted(glob.glob(os.path.join(O, cat, "vitrine*.png"))):
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
shutil.copy(os.path.join(O, "paleta_moveis.png"), os.path.join(V, "paleta_moveis.png"))
json.dump(saida, open(os.path.join(V, "moveis.json"), "w"), ensure_ascii=False, separators=(",", ":"))
tot = sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(V) for f in fs)
nfiles = sum(len(fs) for _, _, fs in os.walk(V))
print("ok", len(saida["itens"]), "itens,", len(cats), "categorias,", round(tot / 1e6, 1), "MB,", nfiles, "arquivos")
