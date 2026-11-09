"""Vitrines por grupo da categoria parque_brinquedos (de dia e de noite).

Uso: MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/parque_brinquedos_vitrines.py -- SP/cidade_out [grupo...]
     [noite|dia]
Grupos: montanhas, atracoes, pequenos (castelo e estátua), aquatico. Grava vitrine_<grupo>.png e
vitrine_<grupo>_noite.png em SP/cidade_out/parque_brinquedos/.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import moveis_base as mb  # noqa: E402

GRUPOS = {
    "montanhas": ["montanha_russa_dragao", "montanha_russa_loopings"],
    "atracoes": ["roda_gigante", "carrossel", "xicaras_malucas", "barco_viking", "torre_queda"],
    "cobertos": ["carrinhos_bate_bate", "trenzinho_infantil", "parque_aquatico"],
    "pequenos": ["castelo_portao", "castelo_torre_alta", "castelo_torre_baixa", "castelo_mureta",
                 "castelo_mureta_curva", "castelo_cone_telhado", "estatua_menina"],
}
COLUNAS = {"montanhas": 2, "atracoes": 5, "cobertos": 3, "pequenos": 7}

if __name__ == "__main__":
    a = sys.argv[sys.argv.index("--") + 1:]
    saida = a[0]
    pasta = os.path.join(saida, "parque_brinquedos")
    grupos = [g for g in a[1:] if g in GRUPOS] or list(GRUPOS)
    modos = [m for m in a[1:] if m in ("dia", "noite")] or ["dia", "noite"]
    for g in grupos:
        for m in modos:
            arq = os.path.join(pasta, f"vitrine_{g}{'_noite' if m == 'noite' else ''}.png")
            mb.vitrine(pasta, arq, ids=GRUPOS[g], colunas=COLUNAS[g], noite=(m == "noite"),
                       amostras=int(os.environ.get("AMOSTRAS", 40)))
