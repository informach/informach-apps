"""Liga cada FBX baixado (nome do Windows: 'Nome (k).fbx') à linha do download_log pela ordem dos downloads
e confere o corpo pela assinatura do esqueleto. Saída: biblioteca_indice.json."""
import json, os, re, csv, glob, math, collections, sys
S = sys.argv[1]
P1 = os.path.join(S, "mixamo_p1/x/Animações P2")
P2 = os.path.join(S, "mixamo_p2/x/P2_resto")
lg = list(csv.DictReader(open(os.path.join(P2, "download_log.csv"), encoding="utf-8-sig")))
mf = {}
for r in csv.DictReader(open(os.path.join(P2, "manifest.csv"), encoding="utf-8-sig")):
    mf[(r["corpo"], r["id_interno"], r["nome_mixamo"], r["in_place"])] = r
# arquivos disponíveis por nome de arquivo
# a pasta Downloads foi esvaziada entre o P0 e o P1: os nomes recomeçam, então cada fase tem o seu conjunto
POOL = {"P0": glob.glob(os.path.join(S, "mixamo_p0_todos/*/*/*.fbx")) + glob.glob(os.path.join(S, "mixamo_p0_adulto/Adulto_Masculino/*.fbx")),
        "P1": glob.glob(os.path.join(P1, "*.fbx")),
        "P2": glob.glob(os.path.join(P2, "*.fbx"))}
# assinaturas
ref = json.load(open(os.path.join(S, "mixamo_ref_assin.json")))
corpos = {os.path.basename(k).replace("_com_esqueleto.fbx", ""): v["assin"] for k, v in ref.items()}
assin = {}
for j in ("mixamo_p0_assin.json", "mixamo_p1_assin.json", "mixamo_p2_assin.json"):
    for f, x in json.load(open(os.path.join(S, j))).items():
        fase = "P2" if "P2_resto" in f else ("P1" if "Animações P2" in f else "P0")
        assin[(fase, os.path.basename(f))] = x
hashes = json.load(open(os.path.join(S, "mixamo_p0_hash.json")))
for v in hashes.values():
    rep = ("P0", os.path.basename(v[0]))
    for o in v[1:]:
        if ("P0", os.path.basename(o)) not in assin and rep in assin: assin[("P0", os.path.basename(o))] = assin[rep]
for f in glob.glob(os.path.join(S, "mixamo_p0_adulto/Adulto_Masculino/*.fbx")):
    pass
def classe(nome_arq):
    x = assin.get(nome_arq)
    if not x: return None
    d = sorted((math.dist(x["assin"], v), k) for k, v in corpos.items())
    return {k for dd, k in d if dd < 1e-3}
por_nome = collections.defaultdict(list)
for r in sorted(lg, key=lambda r: int(r["seq"])): por_nome[r["nome_mixamo"]].append(r)
indice, problemas, sobras = [], [], []
sufixo = lambda n: int(re.search(r"\((\d+)\)\.fbx$", n).group(1)) if re.search(r"\((\d+)\)\.fbx$", n) else 0
for fase, lista in POOL.items():
    arqs = {}
    for f in lista: arqs.setdefault(os.path.basename(f), f)
    por_nome = collections.defaultdict(list)
    for r in sorted(lg, key=lambda r: int(r["seq"])):
        if r["prioridade"] == fase: por_nome[r["nome_mixamo"]].append(r)
    arqs_por_nome = collections.defaultdict(list)
    for n in arqs: arqs_por_nome[re.sub(r" \(\d+\)$", "", n[:-4])].append(n)
    usados = set()
    for nome, rows in por_nome.items():
        livres = [r for r in rows if not r["arquivo_destino"].startswith("_descartado") and r["corpo"] != "adulta"]
        for arq in sorted(arqs_por_nome.get(nome, []), key=sufixo):
            x = assin.get((fase, arq))
            cl = None
            if x:
                cl = {k for k, v in corpos.items() if math.dist(x["assin"], v) < 1e-3}
            alvo = next((r for r in livres if cl is None or r["corpo"] in cl), None)
            if alvo is None: continue
            livres.remove(alvo); usados.add(arq); r = alvo
            m = mf.get((r["corpo"], r["id_interno"], r["nome_mixamo"], r["in_place"]), {})
            a = x or {}
            indice.append({"seq": int(r["seq"]), "corpo": r["corpo"], "prioridade": r["prioridade"], "id": r["id_interno"],
                           "nome_mixamo": nome, "in_place": r["in_place"] == "true", "arquivo": arqs[arq],
                           "variante": m.get("variante_descricao", ""), "status": m.get("status", ""), "obs": m.get("observacao", ""),
                           "quadros": a.get("quadros"), "xy": a.get("xy"), "z": a.get("z")})
        for r in livres: problemas.append(("sem_arquivo", r["seq"], r["corpo"], r["id_interno"], nome))
    sobras += [arqs[n] for n in sorted(set(arqs) - usados)]
print("indice", len(indice), "problemas", len(problemas), "sobras", len(sobras))
for p in problemas: print(p)
print("sobras:", [os.path.basename(x) for x in sobras])
json.dump({"indice": indice, "problemas": problemas, "sobras": sobras,
           "fonte": ["adulto", "plus_m", "plus_f", "musculoso", "atletica", "alto_magro", "idoso", "adolescente_m", "crianca_m", "pequeno_m", "bebe_m"],
           "gemeo": {"adulta": "adulto", "idosa": "idoso", "adolescente_f": "adolescente_m", "crianca_f": "crianca_m", "pequena_f": "pequeno_m", "bebe_f": "bebe_m"}}, open(os.path.join(S, "biblioteca_indice.json"), "w"), ensure_ascii=False, indent=1)
