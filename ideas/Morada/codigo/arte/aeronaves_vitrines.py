"""Vitrines por grupo das aeronaves (de dia e de noite), para ver de perto o que a vitrine geral mostra pequeno.

Uso: MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/aeronaves_vitrines.py -- SP/cidade_out [grupo ...] [dia|noite]
Grava SP/cidade_out/aeronaves/vitrine_<grupo>[_noite].png.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import moveis_base as mb  # noqa: E402

GRUPOS = {
    "baloes": ["balao_listrado_amarelo_azul", "balao_listrado_vermelho_branco", "balao_polvo_pirata",
               "balao_lua_estrelas", "balao_dragao_roxo", "balao_abelha"],
    "avioes": ["aviao_passageiros_azul", "aviao_passageiros_magenta", "dirigivel_arco_iris", "dirigivel_laranja_roxo"],
    "pequenos": ["helicoptero_vermelho", "helicoptero_verde", "aviao_teco_teco_amarelo", "hidroaviao_turquesa",
                 "ultraleve_trike_arco_iris"],
}

if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:]
    pasta = os.path.join(args[0], "aeronaves")
    grupos = [a for a in args[1:] if a in GRUPOS] or list(GRUPOS)
    modos = [a for a in args[1:] if a in ("dia", "noite")] or ["dia", "noite"]
    for g in grupos:
        for m in modos:
            arq = os.path.join(pasta, f"vitrine_{g}{'_noite' if m == 'noite' else ''}.png")
            mb.vitrine(pasta, arq, ids=GRUPOS[g], colunas=len(GRUPOS[g]) if g != "avioes" else 2, res=(1800, 1000),
                       amostras=32, noite=(m == "noite"))
