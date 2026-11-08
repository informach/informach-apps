"""Vitrines por grupo dos prédios tropicais (dia e noite).

Uso: MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/predios_tropicais_vitrines.py -- SP/cidade_out/predios_tropicais [grupo|ids...] [noite] [dia]
Sem grupo: grandes, medios e lazer, de dia e de noite. Com ids avulsos: vitrine _prev.png (para conferir).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import moveis_base as mb  # noqa: E402

GRUPOS = {
    "grandes": ["torre_vela_laranja", "torre_vela_rosa", "torre_branca_turquesa", "predio_s_rosa", "hotel_maresia",
                "hotel_ondulado"],
    "medios": ["predio_varandas_amarelo", "predio_varandas_turquesa", "deco_faixa_amarelo", "deco_faixa_rosa",
               "deco_frisos_pessego", "deco_frisos_turquesa", "cinema_deco", "deco_degraus_rosa",
               "deco_degraus_pessego", "deco_cristal_turquesa"],
    "lazer": ["bar_praia_lilas", "bar_praia_turquesa", "quiosque_sucos", "bar_barril", "boate_danca",
              "cabana_redonda", "loja_surfe", "sorveteria"],
}

if __name__ == "__main__":
    a = sys.argv[sys.argv.index("--") + 1:]
    pasta = a[0]
    resto = [x for x in a[1:] if x not in ("noite", "dia")]
    modos = [m for m in ("dia", "noite") if m in a[1:]] or ["dia", "noite"]
    grupos = [g for g in resto if g in GRUPOS]
    ids = [x for x in resto if x not in GRUPOS]
    tarefas = []
    if ids:
        tarefas.append(("_prev", ids))
    for g in grupos or ([] if ids else list(GRUPOS)):
        tarefas.append(("vitrine_" + g, GRUPOS[g]))
    for nome, lista in tarefas:
        for modo in modos:
            arq = os.path.join(pasta, nome + ("_noite" if modo == "noite" else "") + ".png")
            mb.vitrine(pasta, arq, ids=lista, noite=(modo == "noite"),
                       amostras=int(os.environ.get("AMOSTRAS", 32)))
