"""Vitrines por grupo dos barcos (de dia e de noite).

Uso: MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/barcos_vitrines.py -- SP/cidade_out/barcos [pequenos|grandes] [dia|noite]
Grava <pasta>/vitrine_<grupo>.png e vitrine_<grupo>_noite.png."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import moveis_base as mb  # noqa: E402

GRUPOS = {
    "pequenos": ["veleiro_branco", "veleiro_vela_vermelha", "iate_cupula_azul", "iate_flybridge",
                 "veleiro_madeira_verde", "veleiro_madeira_laranja", "barco_passeio_laranja", "barco_passeio_azul",
                 "lancha_verde_limao", "lancha_vermelha", "barco_pesca", "bote_inflavel", "caiaque",
                 "pedalinho_cisne"],
    "grandes": ["balsa_passageiros", "navio_cruzeiro"],
}
a = sys.argv[sys.argv.index("--") + 1:]
pasta = a[0]
grupos = [g for g in a[1:] if g in GRUPOS] or list(GRUPOS)
modos = [m for m in a[1:] if m in ("dia", "noite")] or ["dia", "noite"]
for g in grupos:
    for m in modos:
        arq = os.path.join(pasta, f"vitrine_{g}" + ("_noite" if m == "noite" else "") + ".png")
        mb.vitrine(pasta, arq, ids=GRUPOS[g], colunas=7 if g == "pequenos" else 2, noite=(m == "noite"))
