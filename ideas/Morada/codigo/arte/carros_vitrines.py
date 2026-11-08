"""Vitrines da categoria carros por grupo, de dia e de noite (e a de portas abertas).

Uso: MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/carros_vitrines.py -- SP/cidade_out [grupos...] [dia|noite|abertos]
Grava SP/cidade_out/carros/vitrine_<grupo>.png, vitrine_<grupo>_noite.png e vitrine_<grupo>_abertos.png.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402,F401

import moveis_base as mb  # noqa: E402

GRUPOS = {
    "passeio": lambda i: i["grupo"] in ("sedan", "sedan_luxo", "compacto", "suv", "jipe", "minivan_6_rodas", "taxi",
                                        "viatura_policia", "picape", "picape_motor"),
    "esportivos": lambda i: i["grupo"] in ("esportivo_aerofolio", "esportivo_conversivel", "cupe", "carro_corrida",
                                           "carro_antigo_listrado", "carrinho_redondo", "futurista_sedan",
                                           "futurista_bolha", "futurista_hiper", "bugue", "kart"),
    "pequenos": lambda i: i["veiculo"] in ("moto", "bicicleta", "carrinho_bebe", "skate"),
    "pacote": lambda i: i.get("pacote"),
}

if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:]
    pasta = os.path.join(args[0], "carros")
    grupos = [a for a in args[1:] if a in GRUPOS] or list(GRUPOS)
    modos = [a for a in args[1:] if a in ("dia", "noite", "abertos")] or ["dia", "noite"]
    itens = json.load(open(os.path.join(pasta, "catalogo.json")))["itens"]
    for g in grupos:
        ids = [i["id"] for i in itens if GRUPOS[g](i)]
        for m in modos:
            suf = "" if m == "dia" else "_" + m
            mb.vitrine(pasta, os.path.join(pasta, f"vitrine_{g}{suf}.png"), ids=ids, noite=(m == "noite"),
                       abertos=(m == "abertos"), res=(1800, 1000), amostras=32)
