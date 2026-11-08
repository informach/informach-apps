"""Vitrines por grupo da categoria props_praia, de dia e de noite.

Uso: MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/props_praia_vitrines.py -- SP/cidade_out [grupo...] [dia|noite]
Grava SP/cidade_out/props_praia/vitrine_<grupo>.png e vitrine_<grupo>_noite.png.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import moveis_base as mb  # noqa: E402

GRUPOS = {
    "pisos": ["piso_areia", "piso_areia_calcadao", "piso_areia_mar", "deque_madeira_praia"],
    "grandes": ["posto_salva_vidas_azul", "posto_salva_vidas_amarelo", "quiosque_coco_palha",
                "quiosque_sucos_coco_gigante", "quiosque_estacao_surfe", "barraca_acai_abacaxi", "barraca_praia_mesa",
                "tenda_lona_estrela", "castelo_areia_gigante"],
    "descanso": ["guarda_sol_praia_azul", "guarda_sol_praia_roxo", "guarda_sol_praia_laranja",
                 "guarda_sol_praia_arco_iris", "guarda_sol_praia_estrela", "espreguicadeira_madeira",
                 "espreguicadeira_lona", "espreguicadeira_reclinavel", "cadeira_praia_dobravel", "toalha_praia_listras",
                 "toalha_praia_melancia", "toalha_praia_ondas"],
    "brincar": ["suporte_pranchas_surfe", "prancha_surfe_deitada_azul", "prancha_surfe_longboard_verde",
                "bodyboard_azul", "boia_pato", "boia_rosquinha", "castelo_areia_pequeno", "piscina_inflavel",
                "cesta_piquenique", "caixa_termica_praia", "carrinho_picole", "rede_volei_praia"],
    "sinais": ["bandeira_aviso_verde", "bandeira_aviso_amarela", "bandeira_aviso_vermelha", "lixeira_praia",
               "placa_praia", "placa_praia_direcao", "mastro_biruta", "chuveirinho_praia", "poste_boia_salva_vidas",
               "varal_luzes_praia"],
}
COLUNAS = {"pisos": 4, "grandes": 4, "descanso": 6, "brincar": 5, "sinais": 5}

if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:]
    pasta = os.path.join(args[0], "props_praia")
    grupos = [a for a in args[1:] if a in GRUPOS] or list(GRUPOS)
    modos = [a for a in args[1:] if a in ("dia", "noite")] or ["dia", "noite"]
    abertos = "abertos" in args
    for g in grupos:
        for md in modos:
            nome = f"vitrine_{g}" + ("_noite" if md == "noite" else "") + ("_abertos" if abertos else "") + ".png"
            mb.vitrine(pasta, os.path.join(pasta, nome), ids=GRUPOS[g], colunas=COLUNAS[g], noite=md == "noite",
                       res=(1800, 1100), abertos=abertos)
