"""Vitrines por grupo da categoria props_esporte, de dia e de noite.

Uso: MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/props_esporte_vitrines.py -- SP/cidade_out [grupo...] [dia|noite]
Grava SP/cidade_out/props_esporte/vitrine_<grupo>.png e vitrine_<grupo>_noite.png.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import moveis_base as mb  # noqa: E402

GRUPOS = {
    "quadras": ["quadra_basquete", "quadra_basquete_azul", "quadra_volei_areia", "campo_futebol", "quadra_tenis_saibro",
                "quadra_tenis_rapida", "quadra_poliesportiva"],
    "estadio": ["torre_refletores", "placar_eletronico", "arquibancada_reta", "arquibancada_curva",
                "banco_reservas_coberto", "tabela_basquete", "tabela_basquete_rua", "trave_gol", "trave_gol_futsal"],
    "skate": ["skate_half_pipe", "skate_quarter_pipe", "skate_funbox", "skate_rampa_salto", "skate_corrimao",
              "skate_banco", "skate_caixote"],
    "praca": ["academia_barras", "academia_paralelas", "academia_abdominal", "academia_bicicleta", "academia_caminhada",
              "academia_flexao", "mesa_pingue_pongue", "mesa_xadrez_praca", "bebedouro_esportivo", "bicicletario_clube"],
}
COLUNAS = {"quadras": 3, "estadio": 5, "skate": 4, "praca": 5}

if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:]
    pasta = os.path.join(args[0], "props_esporte")
    grupos = [a for a in args[1:] if a in GRUPOS] or list(GRUPOS)
    modos = [a for a in args[1:] if a in ("dia", "noite")] or ["dia", "noite"]
    for g in grupos:
        for md in modos:
            nome = f"vitrine_{g}" + ("_noite" if md == "noite" else "") + ".png"
            mb.vitrine(pasta, os.path.join(pasta, nome), ids=GRUPOS[g], colunas=COLUNAS[g], noite=md == "noite",
                       res=(1800, 1100))
