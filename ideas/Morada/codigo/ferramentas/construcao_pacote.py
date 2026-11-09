"""Empacota a biblioteca de construção para a página: peças (GLB → gzip → base64 .txt), texturas em JPG (1024 e
miniatura de 160), a miniatura de cada item, as plantas de exemplo (plantas.json), as casas montadas (casas.json: o
lote de exemplo e os testes de encaixe, peça por peça) e as imagens da vitrine. Uso: python construcao_pacote.py <SP>"""
import base64, gzip, json, os, shutil, sys
from PIL import Image
SP = sys.argv[1]
C = os.path.join(SP, "construcao"); V = os.path.join(SP, "construcao_viewer")
for d in ("pecas", "texturas", "mini", "vitrine", "miniaturas"):
    os.makedirs(os.path.join(V, d), exist_ok=True)
cat = json.load(open(os.path.join(C, "construcao.json")))
GRUPOS = ("chaos", "paredes", "lambris", "encaixes", "telhados", "andares", "acesso", "cercas", "quintal", "lotes")
for grupo in GRUPOS:
    for p in cat.get(grupo, []):
        dados = open(os.path.join(C, p["arquivo"]), "rb").read()
        open(os.path.join(V, "pecas", p["id"] + ".txt"), "w").write(base64.b64encode(gzip.compress(dados, 9)).decode())
        p["arquivo"] = "pecas/" + p["id"] + ".txt"
json.dump(cat, open(os.path.join(V, "construcao.json"), "w"), ensure_ascii=False, indent=1)
fpj = os.path.join(C, "portas_janelas.json")
if os.path.exists(fpj):  # portas, janelas, batentes, lambris coloridos e cantoneiras
    pj = json.load(open(fpj))
    for g in ("janelas", "portas", "batentes", "lambris", "cantos"):
        for p in pj[g]:
            dados = open(os.path.join(C, p["arquivo"]), "rb").read()
            open(os.path.join(V, "pecas", p["id"] + ".txt"), "w").write(base64.b64encode(gzip.compress(dados, 9)).decode())
            p["arquivo"] = "pecas/" + p["id"] + ".txt"
    json.dump(pj, open(os.path.join(V, "portas_janelas.json"), "w"), ensure_ascii=False, indent=1)
tex = json.load(open(os.path.join(C, "texturas", "texturas.json")))
for uso in ("piso", "parede", "telhado"):
    for t in tex.get(uso, []):
        im = Image.open(os.path.join(C, "texturas", t["arquivo"])).convert("RGB")
        im.save(os.path.join(V, "texturas", t["id"] + ".jpg"), quality=88, optimize=True)
        im.resize((160, 160), Image.LANCZOS).save(os.path.join(V, "mini", t["id"] + ".jpg"), quality=86, optimize=True)
        t["arquivo"] = "texturas/" + t["id"] + ".jpg"; t["mini"] = "mini/" + t["id"] + ".jpg"
json.dump(tex, open(os.path.join(V, "texturas.json"), "w"), ensure_ascii=False, indent=1)
sys.path.insert(0, os.path.join(SP, "morada-art"))
# as plantas vêm do script da cena (sem bpy: lê o arquivo e avalia só os dicionários)
src = open(os.path.join(SP, "morada-art", "construcao_cena.py")).read()
ns = {}
ini = src.index("COMODO_A = {"); fim = src.index("def luzes_camera")
exec(src[ini:fim], ns)
def conv(pl):
    return {"chaos": [list(c) for c in pl["chaos"]],
            "paredes": [{"ini": list(t[0]), "dir": t[1], "pecas": [list(q) if isinstance(q, tuple) else [q, None] for q in t[2]],
                         "dentro": t[3], "fora": t[4], "lambri": bool(len(t) > 5 and t[5])} for t in pl["paredes"]]}
json.dump({"A": conv(ns["COMODO_A"]), "B": conv(ns["COMODO_B"])}, open(os.path.join(V, "plantas.json"), "w"), ensure_ascii=False, indent=1)
for n in ("comodos", "pecas", "janelas", "portas"):
    f = os.path.join(C, "render", n + ".png")
    if os.path.exists(f):
        Image.open(f).convert("RGB").save(os.path.join(V, "vitrine", n + ".jpg"), quality=86, optimize=True)
# casas montadas peça por peça (construcao_casas.py) e as vitrines delas
T = os.path.join(C, "casas_teste")
casas = {}
for q in ("lote", "encaixe"):
    f = os.path.join(T, "casas_" + q + ".json")
    if os.path.exists(f):
        casas[q] = json.load(open(f))
json.dump(casas, open(os.path.join(V, "casas.json"), "w"), ensure_ascii=False, separators=(",", ":"))
for n in ("lote_dia", "lote_noite", "encaixe_dia", "encaixe_noite", "vit_telhados_dia", "vit_telhados_noite",
          "vit_andares_dia", "vit_acesso_dia", "vit_acesso_noite", "vit_cercas_dia", "vit_quintal_dia", "vit_quintal_noite"):
    f = os.path.join(T, n + ".png")
    if os.path.exists(f):
        Image.open(f).convert("RGB").save(os.path.join(V, "vitrine", n + ".jpg"), quality=86, optimize=True)
# miniatura de cada item (obrigatória): construcao/miniaturas/<id>.webp, feita por miniaturas_construcao.py
ids = [p["id"] for g in GRUPOS for p in cat.get(g, [])]
if os.path.exists(fpj):
    ids += [p["id"] for g in ("janelas", "portas", "batentes", "lambris", "cantos") for p in pj[g]]
faltam = [i for i in ids if not os.path.exists(os.path.join(C, "miniaturas", i + ".webp"))]
if faltam:
    sys.exit("falta miniatura: " + ", ".join(faltam))
for i in ids:
    shutil.copy(os.path.join(C, "miniaturas", i + ".webp"), os.path.join(V, "miniaturas", i + ".webp"))
tot = sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(V) for f in fs)
print("ok", round(tot / 1e6, 1), "MB")
