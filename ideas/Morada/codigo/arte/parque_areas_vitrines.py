"""Vitrines por grupo da categoria parque_areas, de dia e de noite.

Uso: MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/parque_areas_vitrines.py -- SP/cidade_out [grupo...] [dia|noite]
Grava SP/cidade_out/parque_areas/vitrine_<grupo>.png e vitrine_<grupo>_noite.png.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import moveis_base as mb  # noqa: E402

GRUPOS = {
    "caminhos": ["caminho_parque_reta", "caminho_parque_curva", "caminho_parque_cruz", "caminho_parque_t",
                 "caminho_parque_rotatoria", "caminho_parque_fim", "caminho_parque_duplo", "caminho_parque_canto",
                 "praca_redonda"],
    "areas": ["lago_caminho", "zoologico", "pista_skate", "playground", "palco_festival"],
    "festa": ["tenda_circo_grande", "tenda_circo_media", "tenda_circo_pequena", "quiosque_sorvete", "quiosque_pipoca",
              "quiosque_algodao_doce", "bilheteria_ingressos"],
    "praca": ["chafariz_praca", "fountain_03_pacote", "obelisco", "arco_trelica", "coreto", "banco_praca",
              "poste_praca_4_lanternas"],
}
COLUNAS = {"caminhos": 5, "areas": 3, "festa": 4, "praca": 4}

if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:]
    pasta = os.path.join(args[0], "parque_areas")
    grupos = [a for a in args[1:] if a in GRUPOS] or list(GRUPOS)
    modos = [a for a in args[1:] if a in ("dia", "noite")] or ["dia", "noite"]
    for g in grupos:
        for md in modos:
            nome = f"vitrine_{g}" + ("_noite" if md == "noite" else "") + ".png"
            mb.vitrine(pasta, os.path.join(pasta, nome), ids=GRUPOS[g], colunas=COLUNAS[g], noite=md == "noite",
                       res=(1800, 1100))
