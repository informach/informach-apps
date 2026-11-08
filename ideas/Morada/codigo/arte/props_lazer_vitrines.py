"""Vitrines por grupo da categoria props_lazer, de dia e de noite.

Uso: MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/props_lazer_vitrines.py -- SP/cidade_out [grupo...] [dia|noite]
     ... -- SP/cidade_out ids=a,b,c [dia|noite]   (prévia de algumas peças em _previa.png / _previa_noite.png)
Grava SP/cidade_out/props_lazer/vitrine_<grupo>.png e vitrine_<grupo>_noite.png.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import moveis_base as mb  # noqa: E402

GRUPOS = {
    "portais": ["portal_zoologico", "portal_oriental_vermelho", "arco_praca_metal_vermelho", "arco_praca_tijolo"],
    "estatuas_agua": ["estatua_leao", "estatua_cavaleiro", "estatua_atleta", "estatua_morada", "chafariz_lobulos",
                      "chafariz_jatos_chao", "chafariz_globo", "espelho_dagua_redondo"],
    "comercio": ["carrinho_baloes", "carrinho_cachorro_quente", "carrinho_algodao_doce", "carrinho_pipoca",
                 "quiosque_sorvete_casquinha", "brinquedo_moeda_carrinho"],
    "diversao": ["escorregador_inflavel", "cama_elastica", "palco_coberto_pequeno", "tenda_estrela_branca",
                 "mesa_dj", "caixas_som_pequenas", "caixas_som_grandes"],
    "luzes": ["varal_lampadas_coloridas", "varal_lampadas_6m", "varal_lampadas_10m", "varal_lampadas_15m",
              "poste_lanternas_chinesas"],
    "brinquedos": ["balanco_duplo", "escorregador_praca", "gangorra_praca", "caixa_areia_foguete",
                   "trepa_trepa_cubos", "gira_gira_praca", "casinha_brincar"],
    "praca": ["escada_praca_larga", "escada_praca_estreita", "arquibancada_praca", "banco_circular_arvore",
              "mesa_piquenique_coberta", "placa_direcoes_parque"],
}
COLUNAS = {"portais": 2, "estatuas_agua": 4, "comercio": 3, "diversao": 4, "luzes": 3, "brinquedos": 4, "praca": 3}

if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:]
    pasta = os.path.join(args[0], "props_lazer")
    modos = [a for a in args[1:] if a in ("dia", "noite")] or ["dia", "noite"]
    ids = [a for a in args[1:] if a.startswith("ids=")]
    if ids:
        sel = ids[0][4:].split(",")
        for md in modos:
            mb.vitrine(pasta, os.path.join(pasta, "_previa" + ("_noite" if md == "noite" else "") + ".png"), ids=sel,
                       noite=md == "noite", res=(1400, 900), amostras=int(os.environ.get("AMOSTRAS", 16)))
        sys.exit(0)
    grupos = [a for a in args[1:] if a in GRUPOS] or list(GRUPOS)
    for g in grupos:
        for md in modos:
            nome = f"vitrine_{g}" + ("_noite" if md == "noite" else "") + ".png"
            mb.vitrine(pasta, os.path.join(pasta, nome), ids=GRUPOS[g], colunas=COLUNAS[g], noite=md == "noite",
                       res=(1800, 1100))
