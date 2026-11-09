"""Empacota para a página: corpos (GLB → base64), bibliotecas (GLB → gzip → base64) e info.json."""
import base64, gzip, json, os, sys, glob, shutil
S = sys.argv[1]
B = os.path.join(S, "biblioteca"); V = os.path.join(S, "corpos_viewer")
os.makedirs(os.path.join(V, "biblioteca"), exist_ok=True)
# catálogo de cabelos: a página lê o mesmo arquivo que gera os corpos
open(os.path.join(V, "cabelos.json"), "w").write(open(os.path.join(S, "morada-art", "cabelos.json")).read())
# máscaras de cor livre das roupas
_mdir = os.path.join(B, "roupas_mascaras")
if os.path.isdir(_mdir):
    # num arquivo só (o artefato tem limite de arquivos): mascaras.json e mascaras_png.json (nome → PNG em base64)
    os.makedirs(os.path.join(V, "roupas"), exist_ok=True)
    for _f in glob.glob(os.path.join(V, "roupas", "*__*.png")):
        os.remove(_f)
    shutil.copy(os.path.join(_mdir, "mascaras.json"), os.path.join(V, "roupas", "mascaras.json"))
    json.dump({os.path.basename(_f): base64.b64encode(open(_f, "rb").read()).decode()
               for _f in sorted(glob.glob(os.path.join(_mdir, "*.png")))},
              open(os.path.join(V, "roupas", "mascaras_png.json"), "w"))
# catálogo de roupas e as texturas delas (no máximo 1024 px; são paletas de cores)
open(os.path.join(V, "roupas.json"), "w").write(open(os.path.join(S, "morada-art", "roupas.json")).read())
_tj = os.path.join(B, "corpos_glb", "roupas_texturas.json")
if os.path.exists(_tj):
    from PIL import Image
    os.makedirs(os.path.join(V, "roupas"), exist_ok=True)
    _pastas = json.load(open(os.path.join(S, "morada-art", "roupas.json")))["pacotes_texturas"]
    for _m, _f in json.load(open(_tj)).items():
        if not os.path.exists(_f):  # texturas que o importador extraiu do FBX (pasta .fbm) somem: usa a do pacote
            _pac = next((k for k in _pastas if _m.startswith(f"Roupa_{k}_")), None)
            if _pac:
                _f = os.path.join(S, "ideias", _pastas[_pac], os.path.basename(_f))
        if os.path.exists(_f):
            _im = Image.open(_f).convert("RGBA")
            if max(_im.size) > 1024:
                _im = _im.resize((1024, round(1024 * _im.size[1] / _im.size[0])), Image.LANCZOS)
            _im.save(os.path.join(V, "roupas", _m + ".png"), optimize=True)
# texturas das peças geradas (camadas e chapéus: Roupa_Gen_<padrão>)
for _f in glob.glob(os.path.join(B, "roupas_gen", "Roupa_Gen_*.png")):
    shutil.copy(_f, os.path.join(V, "roupas", os.path.basename(_f)))
# peças montadas no corpo pela página (tools/exporta_itens.py e tools/peles.py): um arquivo por item, mais as tabelas
# das famílias e a ligação de cada corpo com a malha-base
_it = os.path.join(B, "itens")
if os.path.isdir(_it):
    os.makedirs(os.path.join(V, "itens"), exist_ok=True)
    for _f in glob.glob(os.path.join(V, "itens", "*.txt")):
        os.remove(_f)
    for _f in glob.glob(os.path.join(_it, "*.txt")) + glob.glob(os.path.join(_it, "itens", "*.txt")):
        shutil.copy(_f, os.path.join(V, "itens", os.path.basename(_f)))
# miniaturas dos itens (tools/miniaturas_itens.py): num arquivo só, id → WebP em base64
_mi = os.path.join(B, "miniaturas_itens")
if os.path.isdir(_mi):
    json.dump({os.path.basename(_f)[:-5]: base64.b64encode(open(_f, "rb").read()).decode()
               for _f in sorted(glob.glob(os.path.join(_mi, "*.webp")))},
              open(os.path.join(V, "miniaturas_itens.json"), "w"), separators=(",", ":"))
# corpos: o GLB comprimido (Meshopt, tools/comprime_corpos.sh) → gzip → base64 (o artefato não serve .glb)
for f in glob.glob(os.path.join(B, "corpos_glb", "*.glb")):
    open(os.path.join(V, "corpos", os.path.basename(f)[:-4] + ".txt"), "w").write(
        base64.b64encode(gzip.compress(open(f, "rb").read(), 9)).decode())
    velho = os.path.join(V, "corpos", os.path.basename(f))
    if os.path.exists(velho):
        os.remove(velho)
info = {"apoios": {}, "correcoes": {}, "status": {}}
ind = json.load(open(os.path.join(S, "biblioteca_indice.json")))
for x in ind["indice"]:
    if x["corpo"] in ind["fonte"] and x.get("status") == "ruim":
        info["status"].setdefault(x["corpo"], {})[x["id"]] = "ruim"
for f in sorted(glob.glob(os.path.join(B, "glb", "*.glb"))):
    nome = os.path.basename(f)[:-4]
    gravida = nome.endswith("_gravida")
    if not gravida and nome not in ind["fonte"]:
        continue
    jpath = os.path.join(B, "gravida", nome[:-8] + ".json") if gravida else os.path.join(B, "corrigido_todos", nome + ".json")
    if not os.path.exists(jpath):
        continue
    open(os.path.join(V, "biblioteca", nome + ".txt"), "w").write(base64.b64encode(gzip.compress(open(f, "rb").read(), 9)).decode())
    m = json.load(open(jpath))
    info["apoios"][nome] = m["apoios"]; info["correcoes"][nome] = m["correcoes"]
    # animações aprovadas: apoios e correções da cópia congelada
    dc = os.path.join(B, "congeladas", nome)
    for f in (sorted(os.listdir(dc)) if os.path.isdir(dc) else []):
        if f.endswith(".json"):
            c = json.load(open(os.path.join(dc, f)))
            for campo in ("apoios", "correcoes"):
                if c.get(campo) is not None:
                    info[campo][nome][f[:-5]] = c[campo]
json.dump(info, open(os.path.join(V, "biblioteca", "info.json"), "w"), ensure_ascii=False)
tot = sum(os.path.getsize(p) for p in glob.glob(os.path.join(V, "biblioteca", "*")) + glob.glob(os.path.join(V, "corpos", "*.txt")))
print("ok", len(info["apoios"]), "bibliotecas;", tot // 1048576, "MB entre corpos e bibliotecas")
