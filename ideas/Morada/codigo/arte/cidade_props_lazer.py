"""Biblioteca de cidade do Morada: categoria "props_lazer" (parque e entretenimento: portais, arcos, estátuas,
chafarizes, espelho d'água, carrinhos de rua, quiosque de sorvete, brinquedo de moeda, inflável, cama elástica,
brinquedos de praça avulsos, palco coberto, varal de lâmpadas, lanternas chinesas, escadas, arquibancada, banco em
volta de árvore, mesa de piquenique coberta, tenda estrela e placa de direções).

Uso (GUIA_CIDADE.md, GUIA_PARQUE.md e GUIA_PROPS.md):
  MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/cidade_props_lazer.py -- SP/cidade_out [ids|grupos...]

Convenções:
- metros, Z para cima, frente para −Y, origem no centro da peça, chão em z = 0.
- Animações: filho com a origem no pivô e extras glTF (anima girar/balancar/piscar/deslizar); a mesma lista vai no
  catálogo em extra["animacoes"] (com "pivo" nos eixos do glTF). Os eixos de girar/balancar/deslizar são os do glTF
  (y = para cima; z = −Y do Blender, a profundidade).
- Assentos: slots assento_1, assento_2... de 0,5 × 0,5 × 0,9 m (no balanço, na gangorra, no gira-gira e no carrinho de
  moeda o slot é filho do nó animado: "em" = nome do nó). Balcões dos carrinhos ganham um slot de apoio.
- Luz noturna: lâmpadas com "luz" (e luz_vermelha/luz_azul/neon* nas coloridas), letreiros com estampa emissiva.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402,F401

import moveis_base as mb  # noqa: E402
import cidade_base as cb  # noqa: E402,F401
from props_lazer_base import ItemL  # noqa: E402
import props_lazer_monumentos as pm  # noqa: E402
import props_lazer_comercio as pc  # noqa: E402
import props_lazer_brinquedos as pbq  # noqa: E402
import props_lazer_praca as pp  # noqa: E402

CAT = "props_lazer"
SAIDA = ""
EST = {}
DIR_ALTO = (0.55, -1.0, 0.55)


def estampa(nome, emissao=0.0):
    chave = (nome, emissao)
    if chave not in EST:
        png = os.path.join(SAIDA, CAT, "estampas", nome + ".png")
        EST[chave] = mb.material_estampa(f"lazer_{nome}" + ("_luz" if emissao else ""), png, emissao=emissao)
    return EST[chave]


T = ["parque", "lazer"]
PECAS = [
    # (id, rótulo, grupo, tags, função)
    # --- portais e arcos
    ("portal_zoologico", "Portal do zoológico com letreiro ZOO de lâmpadas", "portal_zoologico",
     T + ["portal", "zoologico", "letreiro", "luz", "animado"], pm.p_portal_zoo),
    ("portal_oriental_vermelho", "Portal oriental vermelho", "portal_oriental",
     T + ["portal", "oriental", "lanterna", "luz", "animado"], pm.p_portal_oriental),
    ("arco_praca_metal_vermelho", "Arco de praça em treliça vermelha", "arco_praca",
     T + ["arco", "praca", "metal", "luz"], pm.p_arco_metal),
    ("arco_praca_tijolo", "Arco de praça de tijolos com lanternas", "arco_praca",
     T + ["arco", "praca", "tijolo", "luz"], pm.p_arco_tijolo),
    # --- estátuas
    ("estatua_leao", "Estátua de leão deitado em pedestal", "estatua", T + ["estatua", "monumento", "praca"],
     pm.p_estatua_leao),
    ("estatua_cavaleiro", "Estátua de cavaleiro a cavalo em pedestal", "estatua",
     T + ["estatua", "monumento", "praca"], pm.p_estatua_cavaleiro),
    ("estatua_atleta", "Estátua de atleta correndo em pedestal", "estatua", T + ["estatua", "monumento", "praca"],
     pm.p_estatua_atleta),
    ("estatua_morada", "Estátua da Morada (menina erguendo a casinha)", "estatua",
     T + ["estatua", "monumento", "praca", "luz"], pm.p_estatua_morada),
    # --- água
    ("chafariz_lobulos", "Chafariz de quatro lóbulos com taças", "chafariz",
     T + ["chafariz", "agua", "praca", "animado", "luz"], pm.p_chafariz_lobulos),
    ("chafariz_jatos_chao", "Chafariz de jatos no chão (pisa-pisa)", "chafariz",
     T + ["chafariz", "agua", "praca", "animado", "luz", "infantil"], pm.p_chafariz_jatos),
    ("chafariz_globo", "Chafariz do globo de pedra girando", "chafariz",
     T + ["chafariz", "agua", "praca", "animado", "luz"], pm.p_chafariz_globo),
    ("espelho_dagua_redondo", "Espelho d'água redondo", "espelho_dagua", T + ["agua", "praca", "luz", "assentos"],
     pm.p_espelho_dagua),
    # --- comércio de rua
    ("carrinho_baloes", "Vendedor de balões (carrinho com cacho de balões)", "carrinho_rua",
     T + ["carrinho", "baloes", "comercio", "animado", "letreiro"], pc.p_baloes),
    ("carrinho_cachorro_quente", "Carrinho de cachorro-quente", "carrinho_rua",
     T + ["carrinho", "comida", "comercio", "letreiro", "luz"], pc.p_cachorro_quente),
    ("carrinho_algodao_doce", "Carrinho de algodão-doce", "carrinho_rua",
     T + ["carrinho", "comida", "comercio", "letreiro", "animado"], pc.p_algodao_doce),
    ("carrinho_pipoca", "Carrinho de pipoca", "carrinho_rua", T + ["carrinho", "comida", "comercio", "letreiro",
                                                                    "animado", "luz"], pc.p_pipoca),
    ("quiosque_sorvete_casquinha", "Quiosque redondo de sorvete com casquinha gigante", "quiosque_lazer",
     T + ["quiosque", "comida", "comercio", "letreiro", "animado", "luz"], pc.p_quiosque_sorvete),
    # --- diversão
    ("brinquedo_moeda_carrinho", "Brinquedo de moeda (carrinho que balança)", "brinquedo_moeda",
     T + ["brinquedo", "infantil", "animado", "luz"], pc.p_brinquedo_moeda),
    ("escorregador_inflavel", "Escorregador inflável", "inflavel", T + ["brinquedo", "infantil", "inflavel",
                                                                      "animado"], pc.p_inflavel),
    ("cama_elastica", "Cama elástica com rede", "cama_elastica", T + ["brinquedo", "infantil", "animado"],
     pc.p_cama_elastica),
    ("palco_coberto_pequeno", "Palco coberto pequeno (tenda azul)", "palco_coberto",
     T + ["palco", "show", "tenda", "animado", "luz", "letreiro"], pc.p_palco),
    ("tenda_estrela_branca", "Tenda estrela branca (lona tensionada)", "tenda_estrela",
     T + ["tenda", "evento", "luz"], pc.p_tenda_estrela),
    ("varal_lampadas_coloridas", "Varal de lampadinhas coloridas com postes", "varal_lampadas",
     T + ["luz", "festa", "animado", "decoracao"], pc.p_varal),
    ("varal_lampadas_6m", "Varal de lampadinhas modular (6 m, entre troncos)", "varal_lampadas",
     T + ["luz", "festa", "animado", "decoracao", "modular", "praia"], pc.p_varal_modular(6.0)),
    ("varal_lampadas_10m", "Varal de lampadinhas modular (10 m, entre troncos)", "varal_lampadas",
     T + ["luz", "festa", "animado", "decoracao", "modular", "praia"], pc.p_varal_modular(10.0)),
    ("varal_lampadas_15m", "Varal de lampadinhas modular (15 m, entre troncos)", "varal_lampadas",
     T + ["luz", "festa", "animado", "decoracao", "modular", "praia"], pc.p_varal_modular(15.0)),
    ("mesa_dj", "Mesa de DJ com toca-discos e mixer", "festa_som",
     T + ["festa", "som", "dj", "animado", "neon", "praia"], pc.p_mesa_dj),
    ("caixas_som_pequenas", "Caixas de som empilhadas (pequenas, aros de neon)", "festa_som",
     T + ["festa", "som", "animado", "neon", "praia"], pc.p_caixas_som(False)),
    ("caixas_som_grandes", "Caixas de som empilhadas (grandes, aros de neon)", "festa_som",
     T + ["festa", "som", "animado", "neon", "praia"], pc.p_caixas_som(True)),
    ("poste_lanternas_chinesas", "Poste com lanternas chinesas", "lanternas_chinesas",
     T + ["luz", "oriental", "animado", "poste"], pc.p_lanternas),
    # --- brinquedos de praça avulsos
    ("balanco_duplo", "Balanço duplo (assento e cadeirinha)", "brinquedo_praca",
     T + ["playground", "infantil", "balanco", "animado"], pbq.p_balanco),
    ("escorregador_praca", "Escorregador ondulado", "brinquedo_praca",
     T + ["playground", "infantil", "escorregador", "animado"], pbq.p_escorregador),
    ("gangorra_praca", "Gangorra", "brinquedo_praca", T + ["playground", "infantil", "gangorra", "animado"],
     pbq.p_gangorra),
    ("caixa_areia_foguete", "Caixa de areia com foguete", "brinquedo_praca",
     T + ["playground", "infantil", "areia", "animado", "luz"], pbq.p_caixa_areia),
    ("trepa_trepa_cubos", "Trepa-trepa de cubos com painel giratório", "brinquedo_praca",
     T + ["playground", "infantil", "trepa_trepa", "animado"], pbq.p_trepa_trepa),
    ("gira_gira_praca", "Gira-gira", "brinquedo_praca", T + ["playground", "infantil", "gira_gira", "animado"],
     pbq.p_gira_gira),
    ("casinha_brincar", "Casinha de brincar", "brinquedo_praca",
     T + ["playground", "infantil", "casinha", "animado", "interativo"], pbq.p_casinha),
    # --- praça
    ("escada_praca_larga", "Escada de praça de concreto (larga)", "escada_praca", T + ["praca", "escada", "concreto"],
     pp.p_escada_larga),
    ("escada_praca_estreita", "Escada de praça de concreto (estreita)", "escada_praca",
     T + ["praca", "escada", "concreto"], pp.p_escada_estreita),
    ("arquibancada_praca", "Arquibancada de praça em degraus", "arquibancada", T + ["praca", "assentos", "concreto"],
     pp.p_arquibancada),
    ("banco_circular_arvore", "Banco circular em volta de árvore", "banco_arvore",
     T + ["praca", "banco", "assentos", "arvore"], pp.p_banco_arvore),
    ("mesa_piquenique_coberta", "Mesa de piquenique coberta", "mesa_coberta",
     T + ["praca", "mesa", "assentos", "luz"], pp.p_mesa_coberta),
    ("placa_direcoes_parque", "Placa de direções do parque", "placa_direcoes",
     T + ["placa", "madeira", "luz", "animado"], pp.p_placa_direcoes),
]


def exporta(cat, it, rotulo, grupo, tags, op):
    if os.environ.get("TRIS_DEBUG"):
        ts = [(sum(len(p.vertices) - 2 for p in o.data.polygons), o.name) for o in
              it.partes + [a for a, _ in it.animados] + [a for a, _ in it.interativos]]
        print("tris por parte", it.id, sorted(ts, reverse=True)[:8], flush=True)
    ex = dict(op.get("extra") or {})
    # nada desce abaixo do chão: pés inclinados, arbustos e tampas que afundam até 6 cm ficam rentes a z = 0
    for o in it.partes + [a for a, _ in it.animados] + [a for a, _ in it.interativos]:
        if o.type == "MESH" and not o.name.startswith("colisao"):
            dz = o.location.z if o.parent is None else 0.0
            for v in o.data.vertices:
                if -0.06 < v.co.z + dz < 0.0:
                    v.co.z = -dz
    if getattr(it, "animados", None):
        ex["animacoes"] = it.lista_animacoes()
    if op.get("col") is not None:
        it.colisao(op["col"])
    return cat.exporta(it, rotulo, grupo=grupo, tags=tags, miniatura_dir=op.get("mini", DIR_ALTO),
                       pacote=op.get("pacote", False), extra=ex or None)


def gera(saida, sel):
    global SAIDA
    SAIDA = saida
    import props_lazer_estampas as pe
    pasta_est = os.path.join(saida, CAT, "estampas")
    if not os.path.isdir(pasta_est) or len(os.listdir(pasta_est)) < 13:
        pe.desenha_tudo(pasta_est)
    for mod in (pm, pc, pbq, pp):
        mod.EST = estampa
    cat = mb.Catalogo(CAT, saida, rotulo="Parque e entretenimento")
    for id_, rot, grupo, tags, f in PECAS:
        if sel and id_ not in sel and grupo not in sel:
            continue
        mb.limpa()
        it = ItemL(id_)
        op = f(it) or {}
        exporta(cat, it, rot, grupo, tags, op)
    ordem = {p[0]: k for k, p in enumerate(PECAS)}
    cat.dados["itens"] = [e for e in cat.dados["itens"] if e["id"] in ordem]
    cat.dados["itens"].sort(key=lambda e: ordem.get(e["id"], 999))
    cat.salva()


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:]
    gera(args[0], args[1:])
