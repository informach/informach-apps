"""Gera o grupo `estimacao` inteiro (cachorros e gatos) em SP/pets/estimacao/.

Passos (cada um num processo do Blender, com MOVEIS_THREADS=1):
  1. bichos.py: os 16 cachorros feitos do Doberman (glb/<id>.glb), com 21 animações cada;
  2. bichos_estimacao_animals.py: os 7 gatos do Kitty_001 e o border collie do Dog_001;
  3. estimacao.json: o catálogo do grupo (id, nome, espécie, grupo, escala, pacote, base, animações);
  4. bichos_estimacao_render.py: as miniaturas <id>.webp e as folhas de conferência (folhas/).

Uso: python -I bichos_estimacao.py [passos: glb,json,mini,folhas | todos] [--saida pasta]
(roda com o Python do blender-venv; os passos do Blender também).
"""
import json
import os
import subprocess
import sys

ART = os.path.dirname(os.path.abspath(__file__))
SP = os.path.dirname(ART)
PY = os.path.join(SP, "blender-venv", "bin", "python")

CACHORROS = ["doberman", "doberman_marrom", "labrador", "rottweiler", "salsicha", "salsicha_marrom", "spitz", "lulu",
             "lulu_rosa", "lulu_azul", "golden", "pastor", "husky", "poodle", "buldogue", "caramelo"]
ANIMALS = ["gato", "gato_frajola", "gato_laranja", "gato_rosa", "gato_branco", "siames", "gato_malhado", "border_collie"]
ORDEM = CACHORROS + ANIMALS


def roda(*args):
    env = dict(os.environ, MOVEIS_THREADS="1")
    cmd = [PY, "-I"] + list(args)
    print(">", " ".join(os.path.basename(x) if x.startswith(SP) else x for x in cmd), flush=True)
    subprocess.run(cmd, check=True, env=env, cwd=SP)


def main():
    a = sys.argv[1:]
    passos = a[0].split(",") if a and not a[0].startswith("--") and a[0] != "todos" else ["glb", "json", "mini", "folhas"]
    saida = a[a.index("--saida") + 1] if "--saida" in a else os.path.join(SP, "pets", "estimacao")
    glb = os.path.join(saida, "glb")
    os.makedirs(glb, exist_ok=True)
    j1, j2 = os.path.join(glb, "_cachorros.json"), os.path.join(glb, "_animals.json")
    if "glb" in passos:
        roda(os.path.join(ART, "bichos.py"), "--", glb, ",".join(CACHORROS), "--json", j1)
        roda(os.path.join(ART, "bichos_estimacao_animals.py"), "--", glb, ",".join(ANIMALS), "--json", j2)
    if "json" in passos:
        info = {}
        for j in sorted(f for f in os.listdir(glb) if f.startswith("_") and f.endswith(".json")):
            info.update(json.load(open(os.path.join(glb, j))))
        # um gato gerado sozinho (sem catálogo parcial) tem as mesmas animações dos irmãos do Kitty_001
        sys.path.insert(0, ART)
        from bichos_estimacao_animals import BICHOS_A  # noqa: E402 (só os dados; não roda o Blender)
        irmaos = [b for b in info.values() if b.get("base", "").startswith("Kitty_001")]
        for id_ in ANIMALS:
            if id_ not in info and BICHOS_A[id_]["fbx"] == "Kitty_001" and irmaos:
                b = BICHOS_A[id_]
                info[id_] = dict(irmaos[0], id=id_, nome=b["nome"], escala=b["escala"])
        lista = []
        for id_ in ORDEM:
            b = dict(info[id_])
            if b.get("pacote"):
                b["selo"] = "uso interno, não distribuir"
            lista.append(b)
        cat = dict(grupo="estimacao", nome="Bichos de estimação", bichos=lista)
        json.dump(cat, open(os.path.join(saida, "estimacao.json"), "w"), ensure_ascii=False, indent=1)
        print("estimacao.json", len(lista), "bichos")
    glbs = [os.path.join(glb, i + ".glb") for i in ORDEM]
    render = os.path.join(ART, "bichos_estimacao_render.py")
    if "mini" in passos:
        roda(render, "--", "mini", saida, *glbs)
    if "folhas" in passos:
        folhas = os.path.join(saida, "folhas")
        os.makedirs(folhas, exist_ok=True)
        os.environ["COLS"] = "6"
        roda(render, "--", "folha", os.path.join(folhas, "todos_parados.png"), *glbs)
        g = lambda ids: [os.path.join(glb, i + ".glb") for i in ids]  # noqa: E731
        caes = g(["doberman", "golden", "salsicha", "buldogue", "lulu"])
        if "so_gatos" not in passos:
            for an in ("sentar", "abanar", "cocar", "cavar", "uivar", "farejar", "buscar", "pular", "beber", "comer"):
                roda(render, "--", "anim", os.path.join(folhas, "cachorro_" + an + ".png"), an, "5", *caes)
        if "so_caes" not in passos:
            gatos = g(["gato_frajola", "gato_rosa", "siames"])
            for an in ("parado", "andar", "correr", "virar", "miar", "brincar", "pata", "cambalhota", "deitar", "barriga",
                       "dormir", "sentar", "espreguicar", "lamber_pata", "pular", "esfregar"):
                roda(render, "--", "anim", os.path.join(folhas, "gato_" + an + ".png"), an, "5", *gatos)
            roda(render, "--", "anims", os.path.join(folhas, "border_collie_compostas.png"),
                 os.path.join(glb, "border_collie.glb"), "5",
                 "virar,latir,brincar,pata,cambalhota,deitar,barriga,dormir,sentar,abanar,cocar,cavar,uivar,farejar,"
                 "buscar,pular,beber,comer")


if __name__ == "__main__":
    main()
