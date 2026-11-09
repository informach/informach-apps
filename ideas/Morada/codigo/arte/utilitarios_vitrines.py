"""Vitrines por grupo dos utilitários (de dia e de noite).

Uso: MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/utilitarios_vitrines.py -- SP/cidade_out [grupo...]
Grava SP/cidade_out/utilitarios/vitrine_<grupo>.png e vitrine_<grupo>_noite.png.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import moveis_base as mb  # noqa: E402

GRUPOS = {
    "rua": ["caminhao_bombeiros", "onibus_turismo_azul", "onibus_rosa_creme", "onibus_urbano", "onibus_escolar",
            "kombi_viagem", "kombi_rosa", "furgao_cinza", "food_truck_sorvete", "ambulancia", "caminhao_bau",
            "caminhao_som", "caminhao_lixo", "carro_rabo_de_peixe_rosa", "carro_antigo_laranja",
            "carro_antigo_preto"],
    "trilhos": ["trem_locomotiva", "trem_vagao_passageiros", "trem_vagao_cauda", "bonde", "bonde_moderno",
                "trem_tubo_frente", "trem_tubo_vagao"],
}


def main():
    a = sys.argv[sys.argv.index("--") + 1:]
    pasta = os.path.join(a[0], "utilitarios")
    for g in (a[1:] or list(GRUPOS)):
        for noite in (False, True):
            arq = os.path.join(pasta, f"vitrine_{g}{'_noite' if noite else ''}.png")
            mb.vitrine(pasta, arq, ids=GRUPOS[g], noite=noite, colunas=4 if g == "trilhos" else 8, amostras=40)


if __name__ == "__main__":
    main()
