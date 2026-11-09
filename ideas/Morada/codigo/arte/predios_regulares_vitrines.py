"""Vitrines por grupo dos prédios regulares, de dia e de noite.
Uso: blender-venv/bin/python -I morada-art/predios_regulares_vitrines.py -- SP/cidade_out [grupo ...] [dia|noite]
Grava SP/cidade_out/predios_regulares/vitrine_<grupo>.png e vitrine_<grupo>_noite.png."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402,F401
import moveis_base as mb  # noqa: E402

A = sys.argv[sys.argv.index("--") + 1:]
SAIDA = A[0]
PASTA = os.path.join(SAIDA, "predios_regulares")
GRUPOS = {
    "escritorios": ["escritorio_branco_abobada", "escritorio_moldura_oval", "torre_curva_empresarial",
                    "torre_faixas_vermelhas", "predio_cilindrico_faixas", "hotel"],
    "residenciais": ["apto_baia_vermelho", "apto_baia_azul", "apto_lilas_sacadas", "apto_cinza_l", "apto_marrom_baias",
                     "apto_laranja_telhado", "apto_verde_azul_sorveteria", "apto_tijolo_pequeno", "apto_bege_8_andares",
                     "predio_tijolo_comprido", "predio_cinza_varandas"],
    "comercio_pequenos": ["boliche", "salao_musica_violino", "cinema", "loja_esquina_padaria", "loja_esquina_cafe",
                          "mercadinho", "lojas_2andares_flores", "lojas_2andares_pizza", "predio_farmacia",
                          "casas_geminadas_pastel", "casas_geminadas_tijolo", "sobrado_tijolo", "sobrado_bege"],
}
quais = [a for a in A[1:] if a in GRUPOS] or list(GRUPOS)
modos = [a for a in A[1:] if a in ("dia", "noite")] or ["dia", "noite"]
for g in quais:
    for m in modos:
        arq = os.path.join(PASTA, f"vitrine_{g}{'_noite' if m == 'noite' else ''}.png")
        mb.vitrine(PASTA, arq, ids=GRUPOS[g], res=(1800, 1000), noite=(m == "noite"),
                   colunas={"escritorios": 6, "residenciais": 6, "comercio_pequenos": 5}[g])
