"""Peças novas (geradas), feitas tendo as imagens da vitrine do pacote como norte. Acrescenta ao roupas.json.
Uso: python3 novas_pecas.py   (reescreve os itens 'nov_' do catálogo)"""
import json, os
AQUI = os.path.dirname(os.path.abspath(__file__))
R = "Creative_Characters/Creative_Characters_Free_fbx/Creative_Character_free.fbx"
N = []


def cam(id_, slot, rot, cor=None, _cobre=None, **g):
    g.setdefault("familia", "destino")
    N.append({"id": "nov_" + id_, "slot": slot, "rotulo": rot, "arquivo": R, "corpo_origem": "", "pecas": [],
              "tipo": "pele", "gerar": {"tipo": "camada", **g}, "variacao": {"cor": cor} if cor else {}})
    if _cobre:  # peça inteira que deixa a parte de cima à mostra (jardineira): só esconde estes slots
        N[-1]["cobre"] = _cobre


def hat(id_, rot, cor=None, slot="cabeca", **g):
    N.append({"id": "nov_" + id_, "slot": slot, "rotulo": rot, "arquivo": R, "corpo_origem": "", "pecas": [],
              "tipo": "cabeca", "gerar": {"tipo": "chapeu", **g}, "variacao": {"cor": cor} if cor else {}})
    if id_ in ("faixa_cabeca", "viseira", "tiara", "arco", "coroa", "abafador"):  # sobre o cabelo: não achata
        N[-1]["achata"] = False


def comp(id_, slot, rot, partes, cor=None):
    N.append({"id": "nov_" + id_, "slot": slot, "rotulo": rot, "tipo": "pele", "compoe": partes,
              "variacao": {"cor": cor} if cor else {}})


PESC = {"marco": "pescoco", "acima": True, "desloca": -0.015}
GOLA_V = {"marco": "pescoco", "acima": True, "desloca": -0.05}
# ---------------- parte de cima (justas e folgadas)
cam("camiseta_justa", "cima", "Camiseta justa", "#F2F2F2", regiao="tronco", folga=0.008,
    cortes=[PESC, {"marco": "quadril", "desloca": -0.02}, {"marco": "braco_meio"}])
cam("manga_longa", "cima", "Blusa de manga longa", "#3D7BD6", regiao="tronco", folga=0.009,
    cortes=[PESC, {"marco": "quadril", "desloca": -0.03}, {"marco": "punho", "desloca": -0.01}])
cam("gola_alta", "cima", "Blusa gola alta", "#8A8F99", regiao="tronco", folga=0.011,
    cortes=[{"marco": "pescoco", "acima": True, "desloca": 0.05}, {"marco": "quadril", "desloca": -0.03}, {"marco": "punho", "desloca": -0.01}])
cam("regata_justa", "cima", "Regata justa", "#F2C231", regiao="tronco", folga=0.007,
    cortes=[GOLA_V, {"marco": "quadril", "desloca": -0.02}, {"marco": "ombro", "desloca": 0.02}])
cam("top_esportivo", "cima", "Top esportivo", "#EE70A9", regiao="tronco", folga=0.006,
    cortes=[GOLA_V, {"marco": "cintura", "desloca": 0.06}, {"marco": "ombro", "desloca": 0.02}])
cam("blusa_listrada", "cima", "Blusa listrada", "#F2F2F2", regiao="tronco", folga=0.009, padrao="listras_largas",
    cortes=[PESC, {"marco": "quadril", "desloca": -0.03}, {"marco": "punho", "desloca": -0.01}])
cam("camisa_floral", "cima", "Camisa havaiana", "#E25B4B", regiao="tronco", folga=0.014, padrao="floral",
    cortes=[GOLA_V, {"marco": "quadril", "desloca": -0.04}, {"marco": "braco_meio"}])
cam("camisa_xadrez_folgada", "cima", "Camisa xadrez", "#3D7BD6", regiao="tronco", folga=0.016, padrao="xadrez",
    cortes=[PESC, {"marco": "quadril", "desloca": -0.05}, {"marco": "punho", "desloca": -0.01}])
cam("colete_refletivo", "cima", "Colete refletivo", "#E8F040", regiao="tronco", folga=0.022, padrao="refletivo",
    cortes=[GOLA_V, {"marco": "quadril", "desloca": -0.02}, {"marco": "ombro", "desloca": 0.015}])
cam("jaqueta_bombeiro", "cima", "Jaqueta de bombeiro", "#C9362E", regiao="tronco", folga=0.03, padrao="refletivo_bombeiro",
    cortes=[{"marco": "pescoco", "acima": True, "desloca": 0.02}, {"marco": "quadril", "desloca": -0.08}, {"marco": "punho", "desloca": -0.01}])
cam("jaleco_curto", "cima", "Blusa de uniforme", "#3FC1B0", regiao="tronco", folga=0.016,
    cortes=[GOLA_V, {"marco": "quadril", "desloca": -0.05}, {"marco": "braco_meio"}])
cam("prisioneiro_cima", "cima", "Blusa listrada (presídio)", "#F2F2F2", regiao="tronco", folga=0.013, padrao="listras",
    cortes=[PESC, {"marco": "quadril", "desloca": -0.04}, {"marco": "punho", "desloca": -0.01}])
cam("ciclista_cima", "cima", "Camisa de ciclista", "#3FC1B0", regiao="tronco", folga=0.006, padrao="duas_cores",
    cortes=[PESC, {"marco": "quadril", "desloca": -0.02}, {"marco": "braco_meio"}])
# ---------------- parte de baixo
cam("legging", "baixo", "Legging", "#2B2B2B", regiao="pernas", folga=0.006,
    cortes=[{"marco": "cintura", "acima": True}, {"marco": "tornozelo", "desloca": 0.02}])
cam("bermuda_ciclista", "baixo", "Bermuda de ciclista", "#2B2B2B", regiao="pernas", folga=0.006,
    cortes=[{"marco": "cintura", "acima": True}, {"marco": "coxa_meio", "desloca": -0.05}])
cam("short_curto", "baixo", "Short curto", "#3D7BD6", regiao="pernas", folga=0.012,
    cortes=[{"marco": "cintura", "acima": True, "desloca": -0.02}, {"marco": "coxa_meio", "desloca": 0.03}])
cam("calca_moletom", "baixo", "Calça de moletom", "#24346B", regiao="pernas", folga=0.016, padrao="faixa_lateral",
    cortes=[{"marco": "cintura", "acima": True}, {"marco": "tornozelo", "desloca": 0.03}])
cam("calca_refletiva", "baixo", "Calça com faixas refletivas", "#24346B", regiao="pernas", folga=0.016, padrao="refletivo",
    cortes=[{"marco": "cintura", "acima": True}, {"marco": "tornozelo", "desloca": 0.03}])
cam("prisioneiro_baixo", "baixo", "Calça listrada (presídio)", "#F2F2F2", regiao="pernas", folga=0.016, padrao="listras",
    cortes=[{"marco": "cintura", "acima": True}, {"marco": "tornozelo", "desloca": 0.03}])
cam("sunga", "baixo", "Sunga", "#3D7BD6", regiao="pernas", folga=0.005,
    cortes=[{"marco": "quadril", "acima": True, "desloca": 0.03}, {"marco": "quadril", "desloca": -0.09}])
# ---------------- corpo inteiro
cam("macacao", "inteira", "Macacão", "#E27B3B", regiao="corpo", folga=0.016,
    cortes=[PESC, {"marco": "tornozelo", "desloca": 0.03}, {"marco": "punho", "desloca": -0.01}])
cam("maio", "inteira", "Maiô", "#8E55D6", regiao="corpo", folga=0.005,
    cortes=[GOLA_V, {"marco": "quadril", "desloca": -0.08}, {"marco": "ombro", "desloca": 0.02}])
# ---------------- pés, mãos, acessórios do corpo
cam("meias_altas", "meias", "Meias altas", "#F2F2F2", regiao="pes", folga=0.004,
    cortes=[{"marco": "canela_meio", "acima": True, "desloca": 0.03}])
cam("luvas_justas", "maos", "Luvas", "#3BAA5C", regiao="maos", folga=0.003, subdivide=0,
    cortes=[{"marco": "punho", "acima": True, "desloca": -0.06}])
cam("joelheiras", "joelhos", "Joelheiras", "#2B2B2B", regiao="pernas", folga=0.018,
    faixas_z=[["joelho", -0.05, "joelho", 0.05]])
cam("cinto", "cintura", "Cinto", "#6E482E", regiao="corpo", folga=0.014,
    faixas_z=[["cintura", -0.06, "cintura", -0.03]])
cam("avental", "avental", "Avental", "#2B2B2B", regiao="tronco", folga=0.03,
    partes=[{"frente": 0, "faixa_x": [0.0, 0.12], "faixas_z": [["cintura", -0.04, "peito", 0.05]]},
            {"saia": {"desde": "cintura", "desloca_topo": -0.02, "ate": "joelho", "desloca": 0.05, "abertura": 1.5,
                      "so_frente": 50, "folga": 0.03}}])
cam("gravata", "pescoco_peca", "Gravata", "#D9433B", regiao="tronco", folga=0.022, faixa_x=[0.0, 0.03],
    frente=0.3, faixas_z=[["cintura", 0.04, "pescoco", -0.02]])
cam("mascara", "rosto_peca", "Máscara cirúrgica", "#7EC8E3", regiao="cabeca", folga=0.006, frente=0.15, subdivide=1,
    faixas_z=[["pescoco", 0.03, "pescoco", 0.1]])
# ---------------- chapéus
hat("capacete_obra", "Capacete de obra", "#F2C231", copa={"folga": 0.022, "corte": 0.62, "alt": 1.05},
    aba={"largura": 0.12, "frente": 1.6, "tras": 0.8, "caida": 0.15})
hat("capacete_bike", "Capacete de bicicleta", "#3D7BD6", copa={"folga": 0.03, "corte": 0.6, "alt": 1.0, "cor": "branco"},
    viseira={"comprimento": 0.2, "abertura": 60, "caida": 0.2, "cor": "preto"})
hat("bone_novo", "Boné", "#D9433B", copa={"folga": 0.01, "corte": 0.66, "inclina": 0.1},
    viseira={"comprimento": 0.55, "abertura": 70, "caida": 0.12})
hat("boina", "Boina", "#D9433B", copa={"folga": 0.05, "corte": 0.7, "alt": 1.0, "teto": 0.07, "inclina": 0.03})
hat("touca", "Touca", "#3FC1B0", copa={"folga": 0.012, "corte": 0.6, "alt": 1.1}, enrolado={"altura": 0.16})
hat("touca_pompom", "Touca com pompom", "#F2C231", copa={"folga": 0.012, "corte": 0.6, "alt": 1.15},
    enrolado={"altura": 0.16, "cor": "branco"}, pompom={"raio": 0.17, "cor": "branco"})
hat("chapeu_cozinheiro", "Chapéu de cozinheiro", "#F2F2F2", copa={"folga": 0.01, "corte": 0.62, "inclina": 0.0},
    banda={"altura": 0.25, "abre": 1.04}, puff={"altura": 0.55})
hat("quepe", "Quepe de polícia", "#24346B", copa={"folga": 0.01, "corte": 0.62, "inclina": 0.0},
    banda={"altura": 0.3, "abre": 1.05, "cor": "preto"}, topo={"raio": 1.3},
    viseira={"comprimento": 0.38, "abertura": 70, "caida": 0.25, "cor": "preto"})
hat("quepe_capitao", "Quepe de capitão", "#F2F2F2", copa={"folga": 0.01, "corte": 0.62, "inclina": 0.0},
    banda={"altura": 0.22, "abre": 1.03, "cor": "azul_escuro"}, topo={"raio": 1.3},
    viseira={"comprimento": 0.38, "abertura": 70, "caida": 0.25, "cor": "preto"})
hat("capacete_bombeiro", "Capacete de bombeiro", "#F2C231", copa={"folga": 0.025, "corte": 0.6, "alt": 1.1},
    aba={"largura": 0.3, "frente": 0.6, "tras": 1.8, "caida": 0.35})
hat("balde", "Chapéu balde", "#3BAA5C", copa={"folga": 0.015, "corte": 0.6, "alt": 1.0},
    aba={"largura": 0.3, "caida": 0.6})
hat("sapo", "Chapéu de sapo", "#7CC242", copa={"folga": 0.015, "corte": 0.6, "alt": 1.0},
    aba={"largura": 0.25, "caida": 0.5}, olhos={})
hat("gatinho", "Touca de gatinho", "#EE70A9", copa={"folga": 0.012, "corte": 0.58, "alt": 1.05},
    enrolado={"altura": 0.15, "cor": "branco"}, orelhas={})
hat("aviador_inverno", "Touca com protetor de orelha", "#7B4B2D", copa={"folga": 0.015, "corte": 0.5, "alt": 1.05},
    enrolado={"altura": 0.2, "cor": "creme"}, protetores={"cor": "creme"})
hat("faixa_cabeca", "Faixa de cabeça", "#D9433B", copa={"folga": 0.006, "corte": 0.66, "alt": 0.0}, faixa={"altura": 0.14, "cor": "branco"})
hat("abafador", "Protetor auricular", "#D9433B", slot="orelhas", copa={"folga": 0.005, "corte": 0.97, "alt": 1.0},
    protetores={"cor": "vermelho"})

# ================= segunda leva (imagens 19 a 23: profissões e casuais)
PUNHO = {"marco": "punho", "desloca": -0.01}
QUAD = lambda d=-0.03: {"marco": "quadril", "desloca": d}
# --- por cima (casacos abertos e coletes, sobre a parte de cima)
cam("jaleco", "sobre", "Jaleco", "#F2F2F2", regiao="tronco", folga=0.034, abre_frente=0.035, gola={"altura": 0.025, "dobra": 0.9},
    partes=[{"cortes": [{"marco": "pescoco", "acima": True, "desloca": -0.01}, QUAD(0.0), PUNHO]},
            {"saia": {"desde": "cintura", "desloca_topo": -0.03, "ate": "joelho", "desloca": 0.02, "abertura": 1.12, "abre_frente": 9, "folga": 0.035}}])
cam("casaco_longo", "sobre", "Casaco longo", "#7B4B2D", regiao="tronco", folga=0.04, abre_frente=0.02, gola={"altura": 0.035, "dobra": 0.8},
    partes=[{"cortes": [{"marco": "pescoco", "acima": True, "desloca": -0.01}, QUAD(0.0), PUNHO]},
            {"saia": {"desde": "cintura", "desloca_topo": -0.03, "ate": "joelho", "desloca": -0.06, "abertura": 1.17, "abre_frente": 6, "folga": 0.04}}])
cam("cardiga", "sobre", "Cardigã", "#C9A46E", regiao="tronco", folga=0.03, abre_frente=0.03,
    cortes=[GOLA_V, QUAD(-0.04), PUNHO])
cam("jaqueta_aberta", "sobre", "Jaqueta aberta", "#24346B", regiao="tronco", folga=0.034, abre_frente=0.04, gola={"altura": 0.03, "dobra": 0.8},
    cortes=[{"marco": "pescoco", "acima": True, "desloca": -0.01}, QUAD(-0.02), PUNHO])
cam("salva_vidas", "sobre", "Colete salva-vidas", "#E27B3B", regiao="tronco", folga=0.05, padrao="refletivo",
    cortes=[GOLA_V, QUAD(0.02), {"marco": "ombro", "desloca": 0.01}])
cam("colete_utilidades", "sobre", "Colete de bolsos", "#6B7A3A", regiao="tronco", folga=0.04, abre_frente=0.02,
    cortes=[GOLA_V, QUAD(-0.01), {"marco": "ombro", "desloca": 0.01}])
# --- parte de cima
cam("acolchoada", "cima", "Jaqueta acolchoada", "#D9433B", regiao="tronco", folga=0.045, padrao="acolchoado",
    gola={"altura": 0.04}, cortes=[{"marco": "pescoco", "acima": True, "desloca": 0.0}, QUAD(-0.05), PUNHO])
cam("dolma", "cima", "Dólmã de cozinheiro", "#F2F2F2", regiao="tronco", folga=0.02, padrao="botoes_duplos",
    gola={"altura": 0.03}, cortes=[{"marco": "pescoco", "acima": True, "desloca": -0.01}, QUAD(-0.06), PUNHO])
cam("moletom", "cima", "Moletom", "#8A8F99", regiao="tronco", folga=0.024, gola={"altura": 0.015},
    cortes=[PESC, QUAD(-0.05), PUNHO])
cam("polo", "cima", "Camisa polo", "#3D7BD6", regiao="tronco", folga=0.012, gola={"altura": 0.022, "dobra": 0.9},
    cortes=[{"marco": "pescoco", "acima": True, "desloca": -0.01}, QUAD(-0.03), {"marco": "braco_meio"}])
cam("camisa_uniforme", "cima", "Camisa social de manga curta", "#24346B", regiao="tronco", folga=0.016,
    gola={"altura": 0.025, "dobra": 0.9}, cortes=[{"marco": "pescoco", "acima": True, "desloca": -0.01}, QUAD(-0.04), {"marco": "braco_meio"}])
cam("camisa_social", "cima", "Camisa social", "#F2F2F2", regiao="tronco", folga=0.014,
    gola={"altura": 0.025, "dobra": 0.9}, cortes=[{"marco": "pescoco", "acima": True, "desloca": -0.01}, QUAD(-0.04), PUNHO])
cam("agasalho", "cima", "Jaqueta de agasalho", "#24346B", regiao="tronco", folga=0.022, padrao="faixa_lateral",
    gola={"altura": 0.03}, cortes=[{"marco": "pescoco", "acima": True, "desloca": -0.01}, QUAD(-0.04), PUNHO])
cam("cropped_manga", "cima", "Cropped de manga longa", "#EE70A9", regiao="tronco", folga=0.008,
    cortes=[GOLA_V, {"marco": "cintura", "desloca": 0.04}, PUNHO])
cam("tomara_que_caia", "cima", "Blusa tomara que caia", "#F2F2F2", regiao="tronco", folga=0.008,
    cortes=[{"marco": "peito", "acima": True, "desloca": 0.01}, QUAD(-0.04), {"marco": "ombro", "desloca": -0.01}])
# --- parte de baixo
cam("jardineira", "inteira", "Jardineira", "#3D7BD6", regiao="corpo", folga=0.018, _cobre=["baixo"],
    partes=[{"regiao": "pernas", "cortes": [{"marco": "cintura", "acima": True}, {"marco": "tornozelo", "desloca": 0.03}]},
            {"regiao": "tronco", "frente": 0.2, "faixa_x": [0.0, 0.1], "faixas_z": [["cintura", -0.02, "peito", 0.02]]},
            {"regiao": "tronco", "faixa_x": [0.065, 0.095], "faixas_z": [["peito", 0.0, "pescoco", 0.2]], "folga": 0.02}])
cam("jardineira_short", "inteira", "Jardineira curta", "#EE70A9", regiao="corpo", folga=0.018, _cobre=["baixo"],
    partes=[{"regiao": "pernas", "cortes": [{"marco": "cintura", "acima": True}, {"marco": "coxa_meio", "desloca": 0.03}]},
            {"regiao": "tronco", "frente": 0.2, "faixa_x": [0.0, 0.1], "faixas_z": [["cintura", -0.02, "peito", 0.02]]},
            {"regiao": "tronco", "faixa_x": [0.065, 0.095], "faixas_z": [["peito", 0.0, "pescoco", 0.2]], "folga": 0.02}])
cam("calca_social", "baixo", "Calça social", "#2B2B2B", regiao="pernas", folga=0.02,
    cortes=[{"marco": "cintura", "acima": True}, {"marco": "tornozelo", "desloca": 0.015}])
cam("calca_cargo", "baixo", "Calça cargo", "#6B7A3A", regiao="pernas", folga=0.024,
    cortes=[{"marco": "cintura", "acima": True, "desloca": -0.01}, {"marco": "tornozelo", "desloca": 0.03}])
cam("bermuda_folgada", "baixo", "Bermuda", "#C9A46E", regiao="pernas", folga=0.022,
    cortes=[{"marco": "cintura", "acima": True, "desloca": -0.01}, {"marco": "joelho", "desloca": 0.03}])
# --- corpo inteiro
cam("macacao_refletivo", "inteira", "Macacão com faixas refletivas", "#E27B3B", regiao="corpo", folga=0.02, padrao="refletivo",
    gola={"altura": 0.02, "dobra": 0.9}, cortes=[PESC, {"marco": "tornozelo", "desloca": 0.03}, PUNHO])
cam("macacao_socorrista", "inteira", "Macacão de socorrista", "#3BAA5C", regiao="corpo", folga=0.02, padrao="refletivo_bombeiro",
    gola={"altura": 0.02, "dobra": 0.9}, cortes=[PESC, {"marco": "tornozelo", "desloca": 0.03}, PUNHO])
cam("vestido_uniforme", "inteira", "Vestido de uniforme", "#2B2B2B", regiao="tronco", folga=0.012, gola={"altura": 0.018, "dobra": 0.9},
    partes=[{"cortes": [{"marco": "pescoco", "acima": True, "desloca": -0.01}, {"marco": "cintura", "desloca": -0.01}, {"marco": "braco_meio"}]},
            {"saia": {"desde": "cintura", "ate": "joelho", "desloca": 0.02, "abertura": 1.4}}])
cam("camisola_hospital", "inteira", "Avental de hospital", "#7EC8E3", regiao="tronco", folga=0.03, padrao="poa",
    partes=[{"cortes": [GOLA_V, {"marco": "cintura", "desloca": -0.02}, {"marco": "braco_meio", "desloca": -0.02}]},
            {"saia": {"desde": "cintura", "ate": "joelho", "desloca": 0.0, "abertura": 1.1}}])
cam("vestido_manga", "inteira", "Vestido de manga longa", "#3FC1B0", regiao="tronco", folga=0.01,
    partes=[{"cortes": [PESC, {"marco": "cintura", "desloca": -0.01}, PUNHO]},
            {"saia": {"desde": "cintura", "ate": "canela_meio", "desloca": 0.0, "abertura": 1.3}}])
cam("vestido_xadrez", "inteira", "Vestido xadrez", "#D9433B", regiao="tronco", folga=0.01, padrao="xadrez",
    partes=[{"cortes": [GOLA_V, {"marco": "cintura", "desloca": -0.01}, {"marco": "ombro", "desloca": 0.02}]},
            {"saia": {"desde": "cintura", "ate": "joelho", "desloca": 0.03, "abertura": 1.45}}])
# --- acessórios do corpo
cam("luvas_longas", "maos", "Luvas longas", "#F2F2F2", regiao="maos", folga=0.003, subdivide=0,
    cortes=[{"marco": "antebraco_meio", "acima": True}])
cam("luvas_borracha", "maos", "Luvas de borracha", "#F2C231", regiao="maos", folga=0.006, subdivide=0,
    cortes=[{"marco": "punho", "acima": True, "desloca": -0.07}])
cam("cotoveleiras", "cotovelos", "Cotoveleiras", "#2B2B2B", regiao="tronco", folga=0.016,
    faixas_x=[["cotovelo", -0.04, "cotovelo", 0.04]])
cam("boias_braco", "cotovelos", "Boias de braço", "#E27B3B", regiao="tronco", folga=0.04,
    faixas_x=[["braco_meio", -0.045, "braco_meio", 0.045]])
cam("galocha", "pes", "Galocha", "#F2C231", regiao="pes", folga=0.014,
    cortes=[{"marco": "canela_meio", "acima": True, "desloca": 0.02}])
cam("bota_alta", "pes", "Bota de cano alto", "#6E482E", regiao="pes", folga=0.01,
    cortes=[{"marco": "joelho", "acima": True, "desloca": -0.03}])
cam("tenis_meia", "pes", "Tênis de meia", "#F2F2F2", regiao="pes", folga=0.009, padrao="duas_cores",
    cortes=[{"marco": "tornozelo", "acima": True, "desloca": 0.03}])
cam("cachecol", "pescoco_peca", "Cachecol", "#D9433B", regiao="tronco", folga=0.03, padrao="listras_largas",
    faixas_z=[["pescoco", -0.06, "pescoco", 0.025]])
cam("gravata_borboleta", "pescoco_peca", "Gravata-borboleta", "#2B2B2B", regiao="tronco", folga=0.024, frente=0.5,
    faixa_x=[0.0, 0.045], faixas_z=[["pescoco", -0.035, "pescoco", -0.008]])
cam("suspensorio", "alcas", "Suspensório", "#D9433B", regiao="tronco", folga=0.022, faixa_x=[0.06, 0.08],
    faixas_z=[["cintura", -0.03, "pescoco", 0.2]])
cam("cinto_ferramentas", "cintura", "Cinto de ferramentas", "#7B4B2D", regiao="corpo", folga=0.035,
    faixas_z=[["quadril", -0.04, "quadril", 0.05]])
cam("avental_cintura", "avental", "Avental de cintura", "#F2F2F2", regiao="tronco", folga=0.03,
    partes=[{"saia": {"desde": "cintura", "desloca_topo": -0.02, "ate": "coxa_meio", "desloca": 0.0, "abertura": 1.55,
                      "so_frente": 55, "folga": 0.045}}])
cam("faixa_cintura", "cintura", "Faixa na cintura", "#D9433B", regiao="corpo", folga=0.02,
    faixas_z=[["cintura", -0.03, "cintura", 0.03]])
# --- chapéus e cabeça
hat("bone_tras", "Boné virado para trás", "#2B2B2B", copa={"folga": 0.01, "corte": 0.66, "inclina": 0.1},
    viseira={"comprimento": 0.45, "abertura": 70, "caida": 0.05, "atras": True})
hat("viseira", "Viseira", "#F2F2F2", copa={"folga": 0.006, "corte": 0.66, "alt": 0.0}, faixa={"altura": 0.14, "cor": "branco"},
    viseira={"comprimento": 0.55, "abertura": 70, "caida": 0.1})
hat("cauboi", "Chapéu de caubói", "#7B4B2D", copa={"folga": 0.015, "corte": 0.62, "alt": 1.25, "cor": "marrom"},
    faixa={"altura": 0.1, "cor": "preto"}, aba={"largura": 0.55, "caida": 0.0, "sobe_lados": 0.7, "cor": "marrom"})
hat("capuz", "Capuz", "#8A8F99", copa={"folga": 0.03, "corte": -0.15, "alt": 1.05, "inclina": 0.0, "capuz": True})
hat("touca_cirurgica", "Touca cirúrgica", "#7EC8E3", copa={"folga": 0.008, "corte": 0.6, "alt": 1.05, "inclina": 0.15, "cor": "azul"})
hat("tiara", "Tiara de babado", "#F2F2F2", so_arco=True, arco={"largura": 0.07, "babado": True})
hat("arco", "Arco de cabelo", "#D9433B", so_arco=True, arco={"largura": 0.06, "frente": 0.25})
hat("cartola", "Cartola", "#2B2B2B", copa={"folga": 0.012, "corte": 0.64, "inclina": 0.0, "cor": "preto"},
    banda={"altura": 0.6, "abre": 1.05, "cor": "preto"}, topo={"raio": 1.0, "cor": "preto"},
    aba={"largura": 0.3, "caida": 0.0, "sobe_lados": 0.3, "cor": "preto"})
hat("chapeu_palha", "Chapéu de palha", "#D6A83A", copa={"folga": 0.015, "corte": 0.62, "alt": 1.1, "cor": "bege"},
    faixa={"altura": 0.1, "cor": "vermelho"}, aba={"largura": 0.6, "caida": 0.25, "cor": "bege"})
hat("coroa", "Coroa", "#D6A83A", copa={"folga": 0.01, "corte": 0.8, "alt": 0.0}, banda={"altura": 0.22, "abre": 1.08, "cor": "dourado", "pontas": 8})
hat("chapeu_bruxa", "Chapéu pontudo", "#2B2B2B", copa={"folga": 0.015, "corte": 0.62, "alt": 3.2, "ponta": 0.25, "cor": "preto"},
    aba={"largura": 0.55, "caida": 0.05, "cor": "preto"})


# ================= conjuntos (profissões e estilos das imagens), feitos com as peças do catálogo
CONJ = []


def conj(nome, **sl):
    CONJ.append({"nome": nome, "pecas": {k: ({"id": v[0], "cor": v[1]} if isinstance(v, tuple) else {"id": v, "cor": None})
                                         for k, v in sl.items()}})


n = lambda i, c=None: ("nov_" + i, c) if c else "nov_" + i
conj("Executivo(a)", cima="roupa_camiseta_xadrez1", baixo="roupa_calca_seguranca", pes="roupa_sapato_seguranca")
conj("Médico(a)", cima=n("camiseta_justa", "#7EC8E3"), sobre=n("jaleco"), baixo=n("calca_social", "#7EC8E3"), pes="roupa_tenis_009")
conj("Cirurgião(ã)", cima=n("jaleco_curto", "#3FC1B0"), baixo=n("calca_social", "#3FC1B0"), cabeca=n("touca_cirurgica", "#3FC1B0"),
     rosto_peca=n("mascara"), maos=n("luvas_justas", "#7EC8E3"), pes="roupa_tenis_009")
conj("Enfermeiro(a)", cima=n("jaleco_curto", "#7EC8E3"), baixo=n("calca_social", "#7EC8E3"), pes="roupa_tenis_009")
conj("Cientista", cima=n("camisa_social"), sobre=n("jaleco"), baixo=n("calca_social", "#24346B"), oculos="roupa_oculos_noel",
     maos=n("luvas_borracha", "#3D7BD6"), pes="roupa_sapato_seguranca")
conj("Chef", cima=n("dolma"), baixo=n("calca_xadrez" if False else "calca_social", "#2B2B2B"), cabeca=n("chapeu_cozinheiro"),
     avental=n("avental_cintura", "#2B2B2B"), pes="roupa_sapato_seguranca")
conj("Cozinheiro(a)", cima=n("camiseta_justa"), baixo=n("calca_social", "#2B2B2B"), avental=n("avental", "#D9433B"),
     cabeca=n("touca_cirurgica", "#F2F2F2"), pes="roupa_tenis_009")
conj("Garçom/garçonete", cima=n("camisa_social"), baixo=n("calca_social"), pescoco_peca=n("gravata_borboleta"),
     avental=n("avental_cintura", "#2B2B2B"), pes="roupa_sapato_seguranca")
conj("Barista", cima=n("camiseta_justa", "#2B2B2B"), baixo=n("calca_social", "#3D4A6B"), avental=n("avental", "#7B4B2D"),
     cabeca=n("bone_novo", "#2B2B2B"), pes="roupa_tenis_009")
conj("Policial", cima=n("camisa_uniforme"), baixo=n("calca_social", "#24346B"), cabeca=n("quepe"), cintura=n("cinto", "#2B2B2B"),
     oculos="roupa_oculos_seguranca", pes="roupa_sapato_seguranca")
conj("Segurança", cima="roupa_camisa_seguranca", baixo="roupa_calca_seguranca", oculos="roupa_oculos_seguranca", pes="roupa_sapato_seguranca")
conj("Bombeiro(a)", cima=n("jaqueta_bombeiro"), baixo=n("calca_refletiva", "#C9362E"), cabeca=n("capacete_bombeiro"),
     maos=n("luvas_justas", "#2B2B2B"), pes=n("galocha", "#2B2B2B"))
conj("Socorrista", inteira=n("macacao_socorrista"), maos=n("luvas_borracha", "#3D7BD6"), pes="roupa_bota_sobrevivente")
conj("Gari", inteira=n("macacao_refletivo"), cabeca=n("bone_novo", "#E27B3B"), maos=n("luvas_borracha", "#F2C231"),
     pes="roupa_bota_sobrevivente")
conj("Operário(a) de obra", cima=n("camiseta_justa", "#8A8F99"), sobre=n("colete_refletivo" if False else "salva_vidas", "#E8F040"),
     baixo=n("calca_cargo", "#24346B"), cabeca=n("capacete_obra"), cintura=n("cinto_ferramentas"), maos="roupa_luvas_sobrevivente",
     pes="roupa_bota_lenhador")
conj("Eletricista", inteira=n("macacao", "#24346B"), cabeca=n("capacete_obra", "#F2F2F2"), cintura=n("cinto_ferramentas"),
     maos=n("luvas_borracha", "#F2C231"), pes="roupa_bota_lenhador")
conj("Mecânico(a)", inteira=n("macacao", "#3D7BD6"), maos=n("luvas_justas", "#2B2B2B"), cabeca=n("bone_tras", "#D9433B"),
     pes="roupa_bota_sobrevivente")
conj("Encanador(a)", cima=n("camisa_uniforme", "#3D7BD6"), inteira=n("jardineira", "#24346B"), cabeca=n("bone_novo", "#D9433B"),
     maos=n("luvas_borracha", "#F2C231"), pes="roupa_bota_lenhador")
conj("Pintor(a)", inteira=n("jardineira", "#F2F2F2"), cima=n("camiseta_justa", "#F2F2F2"), cabeca=n("bone_novo", "#F2F2F2"),
     pes="roupa_tenis_009")
conj("Jardineiro(a)", cima=n("camiseta_justa", "#3BAA5C"), inteira=n("jardineira", "#6B7A3A"), cabeca=n("chapeu_palha"),
     maos=n("luvas_justas", "#3BAA5C"), pes=n("galocha", "#3BAA5C"))
conj("Fazendeiro(a)", cima="roupa_camisa_lenhador", inteira=n("jardineira", "#3D7BD6"), cabeca=n("chapeu_palha"),
     pes="roupa_bota_noel")
conj("Caubói/caubóia", cima=n("camisa_xadrez_folgada", "#D9433B"), sobre=n("colete_utilidades", "#7B4B2D"), baixo=n("calca_social", "#3D5A8A"),
     cabeca=n("cauboi"), pescoco_peca=n("cachecol", "#D9433B"), pes=n("bota_alta", "#7B4B2D"))
conj("Professor(a)", cima=n("camisa_social", "#BFD7EA"), sobre=n("cardiga", "#7B4B2D"), baixo=n("calca_social", "#6B5B4B"),
     oculos="roupa_oculos_noel", pes="roupa_sapato_seguranca")
conj("Bibliotecário(a)", cima=n("gola_alta", "#8A8F99"), sobre=n("cardiga", "#3BAA5C"), baixo="gen_saia_midi", oculos="roupa_oculos_004",
     pes="roupa_sapato_caixa")
conj("Estudante", cima=n("polo", "#F2F2F2"), baixo=n("calca_social", "#24346B"), costas="roupa_mochila", pes="roupa_tenis_009")
conj("Carteiro(a)", cima=n("polo", "#F2C231"), baixo=n("bermuda_folgada", "#3D7BD6"), cabeca=n("bone_novo", "#3D7BD6"),
     costas="roupa_mochila", pes="roupa_tenis_009")
conj("Entregador(a)", cima=n("camiseta_justa", "#D9433B"), baixo=n("calca_cargo", "#2B2B2B"), cabeca=n("capacete_bike", "#D9433B"),
     costas="roupa_mochila", pes="roupa_tenis_009")
conj("Piloto(a) de avião", cima=n("camisa_social"), baixo=n("calca_social", "#24346B"), pescoco_peca=n("gravata", "#24346B"),
     cabeca=n("quepe_capitao", "#24346B"), oculos="roupa_oculos_006", pes="roupa_sapato_seguranca")
conj("Capitão(ã) de navio", cima=n("camisa_social"), sobre=n("jaqueta_aberta", "#24346B"), baixo=n("calca_social", "#F2F2F2"),
     cabeca=n("quepe_capitao"), pes="roupa_sapato_seguranca")
conj("Marinheiro(a)", cima=n("blusa_listrada", "#24346B"), baixo=n("calca_social", "#F2F2F2"), cabeca=n("boina", "#24346B"),
     pes="roupa_sapato_seguranca")
conj("Salva-vidas", cima=n("regata_justa", "#D9433B"), baixo=n("short_curto", "#D9433B"), cabeca=n("viseira", "#F2C231"),
     oculos="roupa_oculos_seguranca", pes="roupa_chinelo_005")
conj("Nadador(a)", inteira=n("maio", "#3D7BD6"), cabeca=n("touca_cirurgica", "#F2F2F2"), cotovelos=n("boias_braco"))
conj("Ciclista", cima=n("ciclista_cima"), baixo=n("bermuda_ciclista"), cabeca=n("capacete_bike"), maos="roupa_luvas_014",
     oculos="roupa_oculos_seguranca", pes="roupa_tenis_009")
conj("Skatista", cima=n("moletom", "#3BAA5C"), baixo=n("bermuda_folgada", "#2B2B2B"), cabeca=n("bone_tras"), joelhos=n("joelheiras"),
     cotovelos=n("cotoveleiras"), pes="roupa_tenis_plus")
conj("Corredor(a)", cima=n("top_esportivo"), baixo=n("legging"), cabeca=n("faixa_cabeca"), pes="roupa_tenis_009")
conj("Jogador(a) de futebol", cima=n("camiseta_justa", "#F2C231"), baixo=n("short_curto", "#3D7BD6"), meias=n("meias_altas", "#F2F2F2"),
     pes="roupa_tenis_plus")
conj("Jogador(a) de basquete", cima=n("regata_justa", "#D9433B"), baixo=n("bermuda_folgada", "#D9433B"), cabeca=n("faixa_cabeca", "#F2F2F2"),
     meias=n("meias_altas"), pes="roupa_tenis_009")
conj("Tenista", cima=n("polo"), baixo="gen_minissaia", cabeca=n("viseira"), meias=n("meias_altas"), pes="roupa_tenis_009")
conj("Lutador(a)", cima=n("regata_justa", "#2B2B2B"), baixo=n("calca_moletom", "#2B2B2B"), maos=n("luvas_justas", "#D9433B"),
     cabeca=n("faixa_cabeca", "#D9433B"), pes="roupa_tenis_009")
conj("Treinador(a)", cima=n("agasalho"), baixo=n("calca_moletom"), cabeca=n("bone_novo", "#24346B"), pes="roupa_tenis_009")
conj("Detento(a)", cima=n("prisioneiro_cima"), baixo=n("prisioneiro_baixo"), pes="roupa_chinelo_002")
conj("Paciente", inteira=n("camisola_hospital"), pes="roupa_chinelo_002")
conj("Camareiro(a)", inteira=n("vestido_uniforme"), avental=n("avental_cintura"), cabeca=n("tiara"), pes="roupa_sapato_caixa")
conj("Faxineiro(a)", cima=n("camiseta_justa", "#3FC1B0"), baixo=n("calca_social", "#3FC1B0"), avental=n("avental", "#24346B"),
     maos=n("luvas_borracha", "#F2C231"), pes=n("galocha", "#2B2B2B"))
conj("Detetive", cima=n("camisa_social"), sobre=n("casaco_longo", "#C9A46E"), baixo=n("calca_social", "#6B5B4B"),
     cabeca="var_chapeu_feltro", pes="roupa_sapato_seguranca")
conj("Artista", cima=n("blusa_listrada"), baixo=n("calca_social", "#2B2B2B"), cabeca=n("boina", "#2B2B2B"), pescoco_peca=n("cachecol", "#D9433B"),
     pes="roupa_sapato_caixa")
conj("Músico", cima="var_jaqueta_manga_curta", baixo=n("calca_social", "#2B2B2B"), costas="roupa_violao_costas", oculos="roupa_oculos_seguranca",
     pes="roupa_tenis_plus")
conj("DJ", cima=n("moletom", "#8E55D6"), baixo=n("calca_cargo", "#2B2B2B"), orelhas="roupa_fones_002", cabeca=n("bone_tras", "#2B2B2B"),
     pes="roupa_tenis_plus")
conj("Mágico(a)", cima="roupa_blusa_showgirl", baixo="roupa_calca_seguranca", cabeca=n("cartola"), maos=n("luvas_justas", "#F2F2F2"),
     pes="roupa_sapato_seguranca")
conj("Palhaço", inteira="roupa_fantasia_10", nariz="roupa_nariz_palhaco")
conj("Rei/rainha", cima=n("manga_longa", "#8E55D6"), sobre=n("casaco_longo", "#D9433B"), baixo=n("calca_social", "#F2F2F2"), cabeca=n("coroa"),
     pes=n("bota_alta", "#2B2B2B"))
conj("Bruxo(a)", inteira=n("vestido_manga", "#2B2B2B"), cabeca=n("chapeu_bruxa"), pes="roupa_sapato_caixa")
conj("Papai Noel", cima="roupa_casaco_noel", baixo="roupa_calca_noel", cabeca="roupa_gorro_noel", pes="roupa_bota_noel", maos="roupa_luvas_noel")
conj("Aventureiro(a)", cima="roupa_camisa_lenhador", baixo="roupa_calca_lenhador", pes="roupa_bota_lenhador", cabeca="var_chapeu_marrom")
conj("Explorador(a)", cima=n("camisa_uniforme", "#C9A46E"), sobre=n("colete_utilidades"), baixo=n("bermuda_folgada", "#C9A46E"),
     cabeca=n("balde", "#C9A46E"), meias=n("meias_altas", "#C9A46E"), pes="var_bota_cano_curto")
# casuais
conj("Praia", cima=n("camisa_floral"), baixo=n("short_curto"), oculos="roupa_oculos_seguranca", pes="roupa_chinelo_005")
conj("Inverno", cima=n("acolchoada"), baixo=n("calca_social", "#24346B"), cabeca=n("touca_pompom"), pescoco_peca=n("cachecol"),
     maos=n("luvas_justas", "#D9433B"), pes=n("bota_alta", "#7B4B2D"))
conj("Chuva", cima=n("acolchoada", "#F2C231"), baixo=n("calca_social", "#24346B"), cabeca=n("balde", "#F2C231"), pes=n("galocha"))
conj("Esporte", cima=n("agasalho", "#D9433B"), baixo=n("calca_moletom", "#D9433B"), pes="roupa_tenis_009")
conj("Academia", cima=n("top_esportivo", "#3BAA5C"), baixo=n("bermuda_ciclista"), pes="roupa_tenis_009")
conj("Casual com moletom", cima=n("moletom"), baixo=n("calca_social", "#3D5A8A"), cabeca=n("capuz", "#8A8F99"), pes="roupa_tenis_009")
conj("Casual de jardineira", cima=n("blusa_listrada"), inteira=n("jardineira_short", "#3D5A8A"), pes="roupa_tenis_plus")
conj("Social", cima=n("camisa_social"), baixo=n("calca_social", "#2B2B2B"), pescoco_peca=n("gravata"), alcas=n("suspensorio"),
     pes="roupa_sapato_seguranca")
conj("Vestido de festa", inteira="gen_vestido_festa", pes="roupa_salto_showgirl", pescoco="roupa_corrente_plus")
conj("Piquenique", inteira=n("vestido_xadrez"), cabeca=n("chapeu_palha"), pes="roupa_sapato_caixa")
conj("Passeio no frio", cima=n("gola_alta"), sobre=n("casaco_longo"), baixo=n("calca_social", "#2B2B2B"), cabeca=n("boina", "#2B2B2B"),
     pes=n("bota_alta", "#2B2B2B"))
conj("Fim de semana", cima=n("polo", "#3BAA5C"), baixo=n("bermuda_folgada"), cabeca=n("bone_novo"), pes="roupa_tenis_plus")
conj("Cropped e saia", cima=n("cropped_manga"), baixo="gen_saia_rodada", cabeca=n("arco"), pes="roupa_tenis_009")
conj("Fantasia de sapo", cima=n("moletom", "#7CC242"), baixo=n("calca_moletom", "#7CC242"), cabeca=n("sapo"), pes=n("galocha", "#7CC242"))
conj("Fantasia de gatinho", cima=n("manga_longa", "#EE70A9"), baixo=n("legging", "#EE70A9"), cabeca=n("gatinho"), pes="roupa_tenis_009")

p = os.path.join(AQUI, "roupas.json")
d = json.load(open(p))
d["itens"] = [x for x in d["itens"] if not x["id"].startswith("nov_")] + N
for s, r in {"sobre": "Casaco ou colete (por cima)", "joelhos": "Joelheiras", "cotovelos": "Cotoveleiras ou boias",
             "cintura": "Cinto", "alcas": "Suspensório", "avental": "Avental", "pescoco_peca": "Gravata ou cachecol",
             "rosto_peca": "Máscara"}.items():
    d["slots"][s] = r
ordem = ["cima", "sobre", "baixo", "inteira", "pes", "meias", "maos", "cabeca", "oculos", "rosto_peca", "orelhas", "nariz",
         "pescoco_peca", "pescoco", "pulso", "cotovelos", "joelhos", "cintura", "alcas", "avental", "costas"]
d["slots"] = {k: d["slots"][k] for k in ordem + [k for k in d["slots"] if k not in ordem] if k in d["slots"]}
ids = {x["id"] for x in d["itens"]}
_b = {x["id"]: x for x in d["itens"]}
slot_de = {i: (_b[i].get("slot") or _b[_b[i]["base"]].get("slot") or _b[_b[_b[i]["base"]]["base"]].get("slot")) for i in ids}
for c in CONJ:
    for sl, pc in c["pecas"].items():
        assert pc["id"] in ids, (c["nome"], pc["id"])
        assert slot_de[pc["id"]] == sl, (c["nome"], sl, pc["id"], slot_de[pc["id"]])
d["conjuntos"] = CONJ
json.dump(d, open(p, "w"), ensure_ascii=False, indent=1)
print(len(N), "peças novas;", len(d["itens"]), "no catálogo;", len(CONJ), "conjuntos")
