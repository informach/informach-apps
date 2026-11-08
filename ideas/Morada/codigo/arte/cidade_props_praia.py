"""Biblioteca de cidade do Morada: categoria "props_praia" (grupo Praia das props de rua).

Pisos de areia (areia, areia com calçadão, beira-mar), posto de salva-vidas (2 cores), guarda-sóis de praia (listrados,
um que gira ao vento, e o branco em estrela), espreguiçadeiras (madeira, lona, reclinável), cadeira dobrável, toalhas,
pranchas (suporte e deitadas), bodyboard, boias (pato e rosquinha), castelinho e castelo de areia gigante, piscina
inflável, chuveirinho, quiosques (coco de palha, sucos com coco gigante, estação de surfe, açaí com abacaxi gigante),
carrinho de picolé, barraca com mesa e cadeiras, rede de vôlei, cesta de piquenique, caixa térmica, tenda em estrela,
deque modular, bandeiras de aviso, lixeira, placas e biruta.

Uso (GUIA_CIDADE.md, GUIA_PARQUE.md, GUIA_PROPS.md):
  MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/cidade_props_praia.py -- SP/cidade_out [ids|grupos...]

Convenções: metros, Z para cima, frente para −Y, origem no centro da peça, areia em z = 0 (peças na areia apoiadas em
z = 0). Animações em filhos com a origem no pivô e extras glTF ("anima": girar/balancar/deslizar), repetidas no
catálogo em extra["animacoes"]. Assentos: slots assento_N de 0,5 × 0,5 × 0,9 m. Letreiros com estampa emissiva e
lâmpadas com o material "luz" (acendem à noite).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import moveis_base as mb  # noqa: E402
import cidade_base as cb  # noqa: E402
import props_praia_base as bb  # noqa: E402
import props_praia_pisos as pz  # noqa: E402
import props_praia_pecas as pp  # noqa: E402
import props_praia_grandes as pg  # noqa: E402

H, Q, ZF = cb.H, cb.Q, cb.Z_FUNDO
CAT = "props_praia"
SAIDA = ""
EST = {}
DIR_ALTO = (0.55, -1.0, 0.55)
DIR_PERTO = (0.6, -1.0, 0.75)


def estampa(nome, emissao=0.0):
    chave = (nome, emissao)
    if chave not in EST:
        png = os.path.join(SAIDA, CAT, "estampas", nome + ".png")
        EST[chave] = mb.material_estampa(f"praia_{nome}" + ("_luz" if emissao else ""), png, emissao=emissao)
    return EST[chave]


def exporta(cat, it, rotulo, grupo, tags, mini=None, col=None, extra=None):
    ex = dict(extra or {})
    if getattr(it, "animados", None):
        ex["animacoes"] = it.lista_animacoes()
    if col is not None:
        it.colisao(col)
    return cat.exporta(it, rotulo, grupo=grupo, tags=tags, miniatura_dir=mini or DIR_ALTO, extra=ex or None)


T = ["praia"]
PECAS = [
    # (id, rótulo, grupo, tags, função)
    # pisos
    ("piso_areia", "Areia de praia", "piso_areia", T + ["modular", "piso", "areia"], pz.p_piso_areia),
    ("piso_areia_calcadao", "Areia com calçadão em ondas", "piso_areia_calcadao",
     T + ["modular", "piso", "areia", "calcadao", "orla"], pz.p_piso_areia_calcadao),
    ("piso_areia_mar", "Beira-mar (areia e rebentação)", "piso_areia_mar",
     T + ["modular", "piso", "areia", "agua", "mar", "animado"], pz.p_piso_areia_mar),
    # posto
    ("posto_salva_vidas_azul", "Posto de salva-vidas (azul)", "posto_salva_vidas",
     T + ["salva_vidas", "torre", "porta", "animado", "luz"], pg.p_posto_azul),
    ("posto_salva_vidas_amarelo", "Posto de salva-vidas (amarelo)", "posto_salva_vidas",
     T + ["salva_vidas", "torre", "porta", "animado", "luz"], pg.p_posto_amarelo),
    # guarda-sóis
    ("guarda_sol_praia_azul", "Guarda-sol de praia listrado (azul e branco)", "guarda_sol_praia",
     T + ["guarda_sol", "sombra"], pp.p_gs_azul),
    ("guarda_sol_praia_roxo", "Guarda-sol de praia em gomos (roxo e branco)", "guarda_sol_praia_gomos",
     T + ["guarda_sol", "sombra"], pp.p_gs_roxo),
    ("guarda_sol_praia_laranja", "Guarda-sol de praia de 12 gomos (laranja e amarelo)", "guarda_sol_praia_12",
     T + ["guarda_sol", "sombra"], pp.p_gs_laranja),
    ("guarda_sol_praia_arco_iris", "Guarda-sol arco-íris que gira ao vento", "guarda_sol_praia_giratorio",
     T + ["guarda_sol", "sombra", "animado"], pp.p_gs_arco_iris),
    ("guarda_sol_praia_estrela", "Guarda-sol branco em estrela", "guarda_sol_praia_estrela",
     T + ["guarda_sol", "sombra", "lona"], pp.p_gs_estrela),
    # descanso
    ("espreguicadeira_madeira", "Espreguiçadeira de madeira", "espreguicadeira_madeira",
     T + ["espreguicadeira", "assento"], pp.p_espreguicadeira_madeira),
    ("espreguicadeira_lona", "Espreguiçadeira de lona listrada", "espreguicadeira_lona",
     T + ["espreguicadeira", "assento"], pp.p_espreguicadeira_lona),
    ("espreguicadeira_reclinavel", "Espreguiçadeira reclinável com colchonete", "espreguicadeira_reclinavel",
     T + ["espreguicadeira", "assento"], pp.p_espreguicadeira_reclinavel),
    ("cadeira_praia_dobravel", "Cadeira de praia dobrável", "cadeira_praia_dobravel", T + ["cadeira", "assento"],
     pp.p_cadeira_dobravel),
    ("toalha_praia_listras", "Toalha de praia listrada (com óculos e chinelos)", "toalha_praia", T + ["toalha"],
     pp.p_toalha_listras),
    ("toalha_praia_melancia", "Toalha de praia de melancia (com livro)", "toalha_praia", T + ["toalha"],
     pp.p_toalha_melancia),
    ("toalha_praia_ondas", "Toalha de praia de ondas (com chapéu de palha)", "toalha_praia", T + ["toalha"],
     pp.p_toalha_ondas),
    # surfe e brinquedos
    ("suporte_pranchas_surfe", "Suporte com quatro pranchas de surfe", "suporte_pranchas", T + ["surfe", "prancha"],
     pp.p_suporte_pranchas),
    ("prancha_surfe_deitada_azul", "Prancha de surfe deitada (azul)", "prancha_surfe", T + ["surfe", "prancha"],
     pp.p_prancha_deitada("azul")),
    ("prancha_surfe_longboard_verde", "Prancha longboard deitada (verde)", "prancha_surfe", T + ["surfe", "prancha"],
     pp.p_prancha_deitada("verde")),
    ("bodyboard_azul", "Bodyboard com cordinha", "bodyboard", T + ["surfe", "bodyboard"], pp.p_bodyboard),
    ("boia_pato", "Boia de patinho", "boia_inflavel", T + ["boia", "brinquedo"], pp.p_boia_pato),
    ("boia_rosquinha", "Boia de rosquinha com confeitos", "boia_inflavel", T + ["boia", "brinquedo"],
     pp.p_boia_rosquinha),
    ("castelo_areia_pequeno", "Castelinho de areia com baldinho e pá", "castelo_areia", T + ["areia", "brinquedo"],
     pp.p_castelo_areia),
    ("castelo_areia_gigante", "Castelo de areia gigante (marco da praia)", "castelo_areia_gigante",
     T + ["areia", "marco", "monumento", "animado"], pg.p_castelo_gigante),
    ("piscina_inflavel", "Piscina inflável redonda", "piscina_inflavel", T + ["piscina", "agua", "animado"],
     pp.p_piscina_inflavel),
    ("chuveirinho_praia", "Chuveirinho de praia", "chuveirinho", T + ["chuveiro", "ducha"], pp.p_chuveirinho),
    # comércio
    ("quiosque_coco_palha", "Quiosque de coco com telhado de palha", "quiosque_praia",
     T + ["quiosque", "comida", "letreiro", "luz", "assento"], pg.p_quiosque_coco),
    ("quiosque_sucos_coco_gigante", "Quiosque de sucos com coco gigante", "quiosque_praia",
     T + ["quiosque", "comida", "letreiro", "neon", "luz", "assento"], pg.p_quiosque_sucos_coco),
    ("quiosque_estacao_surfe", "Estação de surfe com prancha no telhado", "quiosque_praia",
     T + ["quiosque", "surfe", "letreiro", "neon", "luz", "assento"], pg.p_quiosque_surfe),
    ("barraca_acai_abacaxi", "Barraca de açaí com abacaxi gigante", "quiosque_praia",
     T + ["quiosque", "comida", "letreiro", "neon", "luz", "assento"], pg.p_barraca_acai),
    ("carrinho_picole", "Carrinho de picolé", "carrinho_picole", T + ["carrinho", "comida", "tampa"],
     pg.p_carrinho_picole),
    ("barraca_praia_mesa", "Barraca de praia com mesa e cadeiras", "barraca_praia", T + ["barraca", "mesa", "assento"],
     pg.p_barraca_mesa),
    # lazer e utilidades
    ("rede_volei_praia", "Rede de vôlei de praia", "rede_volei", T + ["esporte", "volei"], pp.p_rede_volei),
    ("cesta_piquenique", "Cesta de piquenique", "cesta_piquenique", T + ["piquenique", "tampa"],
     pp.p_cesta_piquenique),
    ("caixa_termica_praia", "Caixa térmica", "caixa_termica", T + ["tampa"], pp.p_caixa_termica),
    ("tenda_lona_estrela", "Tenda de lona em estrela", "tenda_estrela", T + ["tenda", "lona", "sombra", "luz"],
     pg.p_tenda_estrela),
    ("deque_madeira_praia", "Deque de madeira modular (passarela de 15 m)", "deque_praia",
     T + ["modular", "deque", "passarela", "luz"], pp.p_deque),
    ("bandeira_aviso_verde", "Bandeira de aviso verde (mar calmo)", "bandeira_aviso", T + ["bandeira", "animado"],
     pp.p_bandeira_aviso("verde", "verde")),
    ("bandeira_aviso_amarela", "Bandeira de aviso amarela (atenção)", "bandeira_aviso", T + ["bandeira", "animado"],
     pp.p_bandeira_aviso("amarelo", "amarela")),
    ("bandeira_aviso_vermelha", "Bandeira de aviso vermelha (perigo)", "bandeira_aviso", T + ["bandeira", "animado"],
     pp.p_bandeira_aviso("vermelho", "vermelha")),
    ("lixeira_praia", "Lixeira de praia (tambor)", "lixeira_praia", T + ["lixeira"], pp.p_lixeira_praia),
    ("placa_praia", "Placa de praia", "placa_praia", T + ["placa"], pp.p_placa_praia),
    ("placa_praia_direcao", "Placa de direção da praia", "placa_praia_direcao", T + ["placa"], pp.p_placa_direcao),
    ("mastro_biruta", "Mastro com biruta", "biruta", T + ["vento", "animado"], pp.p_biruta),
    ("poste_boia_salva_vidas", "Poste com boia salva-vidas", "poste_boia", T + ["salva_vidas", "boia"],
     pp.p_poste_boia),
    ("varal_luzes_praia", "Varal de luzes coloridas (festa na praia)", "varal_luzes",
     T + ["luz", "festa", "animado", "neon"], pp.p_varal_luzes),
]


def gera(saida, sel):
    global SAIDA
    SAIDA = saida
    import props_praia_estampas as pe
    pasta_est = os.path.join(saida, CAT, "estampas")
    if not os.path.isdir(pasta_est) or len(os.listdir(pasta_est)) < len(pe.TUDO):
        pe.desenha_tudo(pasta_est)
    bb.EST["f"] = estampa
    cat = mb.Catalogo(CAT, saida, rotulo="Praia")
    for id_, rot, grupo, tags, f in PECAS:
        if sel and id_ not in sel and grupo not in sel:
            continue
        mb.limpa()
        it = bb.ItemPP(id_)
        op = f(it) or {}
        plana = op.get("plana", False)
        col = op.get("col", [((0, 0, ZF), (Q, Q, -ZF))] if plana else None)
        mini = op.get("mini")
        mini = cb.DIR_TOPO if (plana or mini == "topo" or op.get("plano")) else (mini or DIR_ALTO)
        exporta(cat, it, rot, grupo, tags, mini=mini, col=col, extra=op.get("extra"))
    ordem = {p[0]: k for k, p in enumerate(PECAS)}
    cat.dados["itens"] = [e for e in cat.dados["itens"] if e["id"] in ordem]
    cat.dados["itens"].sort(key=lambda e: ordem.get(e["id"], 999))
    cat.salva()


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:]
    gera(args[0], args[1:])
