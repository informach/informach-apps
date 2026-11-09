"""Monta a pasta da página de efeitos (efeitos_viewer/) a partir de efeitos_out/, icones_out/ e dos móveis e corpos.

Uso: python3 -I efeitos_pagina.py <SP>
Copia: os JSON, folhas e GLB de cada efeito; o sprite de ícones (para os balões); os móveis de apoio e um corpo de
adulto com a animação "parado" (para dar a escala). Grava efeitos_viewer/dados.json com tudo o que a página lê.
"""
import json
import os
import shutil
import sys

MOVEIS = {
    "banheira": "banheiro/glb/banheira_solta_branca.glb",
    "fogao": "cozinha_moveis/glb/fogao_ferro_vermelho.glb",
    "panela": "cozinha_eletros/glb/panela_cabo_cobre.glb",
    "churrasqueira": "cozinha_eletros/glb/churrasqueira_bola_preta.glb",
    "pia": "banheiro/glb/pia_coluna_rosa.glb",
    "chuveiro": "banheiro/glb/chuveiro_exposto_latao.glb",
    "lixeira": "cozinha_eletros/glb/lixeira_pedal_vermelha.glb",
    "prato": "cozinha_eletros/glb/prato_raso.glb",
    "geladeira": "cozinha_eletros/glb/geladeira_retro_redonda_turquesa.glb",
}
CORPO = "/home/user/informach-apps/ideas/Morada/biblioteca/corpos/adulta.glb"


def main():
    sp = os.path.abspath(sys.argv[1])
    src = os.path.join(sp, "efeitos_out")
    dst = os.path.join(sp, "efeitos_viewer")
    os.makedirs(dst, exist_ok=True)
    idx = json.load(open(os.path.join(src, "efeitos.json"), encoding="utf-8"))
    efeitos = []
    for e in idx["efeitos"]:
        i = e["id"]
        d = os.path.join(dst, "efeitos", i)
        os.makedirs(d, exist_ok=True)
        js = json.load(open(os.path.join(src, i, i + ".json"), encoding="utf-8"))
        for arq in (f"{i}_folha.png", f"{i}.glb"):
            shutil.copy2(os.path.join(src, i, arq), os.path.join(d, arq))
        js["caminho"] = f"efeitos/{i}/"
        efeitos.append(js)
    os.makedirs(os.path.join(dst, "icones"), exist_ok=True)
    shutil.copy2(os.path.join(sp, "icones_out", "sprite", "icones_128.png"), os.path.join(dst, "icones", "icones_128.png"))
    sprite = json.load(open(os.path.join(sp, "icones_out", "sprite", "icones.json"), encoding="utf-8"))
    os.makedirs(os.path.join(dst, "apoio"), exist_ok=True)
    for nome, rel in MOVEIS.items():
        shutil.copy2(os.path.join(sp, "moveis_out", rel), os.path.join(dst, "apoio", nome + ".glb"))
    shutil.copy2(CORPO, os.path.join(dst, "apoio", "adulta.glb"))
    dados = {"efeitos": efeitos, "icones_balao": idx["icones_balao"],
             "sprite": {"colunas": sprite["colunas"], "linhas": sprite["linhas"],
                        "icones": {k: [v["col"], v["lin"]] for k, v in sprite["icones"].items()},
                        "rotulos": {k: v["rotulo"] for k, v in sprite["icones"].items()}}}
    with open(os.path.join(dst, "dados.json"), "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, separators=(",", ":"))
    print("página de efeitos:", len(efeitos), "efeitos")


if __name__ == "__main__":
    main()
