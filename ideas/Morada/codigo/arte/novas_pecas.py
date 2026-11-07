"""Peças novas (geradas), feitas tendo as imagens da vitrine do pacote como norte. Acrescenta ao roupas.json.
Uso: python3 novas_pecas.py   (reescreve os itens 'nov_' do catálogo)"""
import json, os
AQUI = os.path.dirname(os.path.abspath(__file__))
R = "Creative_Characters/Creative_Characters_Free_fbx/Creative_Character_free.fbx"
N = []


def cam(id_, slot, rot, cor=None, _cobre=None, _transparente=False, **g):
    g.setdefault("familia", "destino")
    N.append({"id": "nov_" + id_, "slot": slot, "rotulo": rot, "arquivo": R, "corpo_origem": "", "pecas": [],
              "tipo": "pele", "gerar": {"tipo": "camada", **g}, "variacao": {"cor": cor} if cor else {}})
    if _cobre:  # peça inteira que deixa a parte de cima à mostra (jardineira): só esconde estes slots
        N[-1]["cobre"] = _cobre
    if _transparente:  # trama com furos (arrastão): a página não esconde a pele embaixo
        N[-1]["transparente"] = True


def hat(id_, rot, cor=None, slot="cabeca", **g):
    N.append({"id": "nov_" + id_, "slot": slot, "rotulo": rot, "arquivo": R, "corpo_origem": "", "pecas": [],
              "tipo": "cabeca", "gerar": {"tipo": "chapeu", **g}, "variacao": {"cor": cor} if cor else {}})
    if id_ in ("faixa_cabeca", "viseira", "tiara", "arco", "coroa", "abafador", "orelhas_coelho"):  # sobre o cabelo: não achata
        N[-1]["achata"] = False


def oc(id_, rot, cor=None, **g):  # óculos gerados no rosto
    N.append({"id": "nov_" + id_, "slot": "oculos", "rotulo": rot, "arquivo": R, "corpo_origem": "", "pecas": [],
              "tipo": "cabeca", "gerar": {"tipo": "oculos", **g}, "variacao": {"cor": cor} if cor else {}})


def obj(id_, mao, rot, cor=None, _pose=None, **g):  # objeto de mão (mao: "dir" ou "esq")
    N.append({"id": "nov_" + id_, "slot": "mao_" + mao, "rotulo": rot, "arquivo": R, "corpo_origem": "", "pecas": [],
              "tipo": "mao", "mao": mao, "gerar": {"tipo": "objeto", **g}, "variacao": {"cor": cor} if cor else {}})
    if _pose:  # pose de segurar: o braço vai até 'alvo' e o eixo Y da mão (o do objeto) aponta para 'aponta'
        N[-1]["pose"] = _pose


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
cam("blusa_listrada", "cima", "Blusa listrada", "#2B2B2B", regiao="tronco", folga=0.009, padrao="listras_largas",
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
cam("prisioneiro_cima", "cima", "Blusa listrada (presídio)", "#2B2B2B", regiao="tronco", folga=0.013, padrao="listras",
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
cam("prisioneiro_baixo", "baixo", "Calça listrada (presídio)", "#2B2B2B", regiao="pernas", folga=0.016, padrao="listras",
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
    faixas_z=[["queixo", -0.012, "nariz", 0.012]])
# ---------------- chapéus
hat("capacete_obra", "Capacete de obra", "#F2C231", copa={"folga": 0.022, "corte": 0.62, "alt": 1.05},
    aba={"largura": 0.12, "frente": 1.6, "tras": 0.8, "caida": 0.15})
hat("capacete_bike", "Capacete de bicicleta", "#3D7BD6", copa={"folga": 0.03, "corte": 0.6, "alt": 1.0, "cor": "branco"},
    viseira={"comprimento": 0.2, "abertura": 60, "caida": 0.2, "cor": "preto"})
hat("bone_novo", "Boné", "#D9433B", copa={"folga": 0.01, "corte": 0.66, "inclina": 0.1},
    viseira={"comprimento": 0.5, "abertura": 58, "caida": 0.1})
hat("boina", "Boina", "#D9433B", boina={"corte": 0.62, "lado": 13})
hat("touca", "Touca", "#3FC1B0", copa={"folga": 0.012, "corte": 0.6, "alt": 1.1}, enrolado={"altura": 0.16})
hat("touca_pompom", "Touca com pompom", "#F2C231", copa={"folga": 0.012, "corte": 0.6, "alt": 1.15},
    enrolado={"altura": 0.16, "cor": "branco"}, pompom={"raio": 0.17, "cor": "branco"})
hat("chapeu_cozinheiro", "Chapéu de cozinheiro", "#F2F2F2", copa={"folga": 0.01, "corte": 0.62, "inclina": 0.0},
    banda={"altura": 0.25, "abre": 1.04}, puff={"altura": 0.55})
hat("quepe", "Quepe de polícia", "#24346B", copa={"folga": 0.01, "corte": 0.66, "inclina": 0.0},
    banda={"altura": 0.3, "abre": 1.05, "cor": "preto"}, topo={"raio": 1.3},
    viseira={"comprimento": 0.3, "abertura": 62, "caida": 0.1, "cor": "preto"})
hat("quepe_capitao", "Quepe de capitão", "#F2F2F2", copa={"folga": 0.01, "corte": 0.66, "inclina": 0.0},
    banda={"altura": 0.22, "abre": 1.03, "cor": "azul_escuro"}, topo={"raio": 1.3},
    viseira={"comprimento": 0.3, "abertura": 62, "caida": 0.1, "cor": "preto"})
hat("capacete_bombeiro", "Capacete de bombeiro", "#F2C231", copa={"folga": 0.025, "corte": 0.6, "alt": 1.1},
    aba={"largura": 0.3, "frente": 0.6, "tras": 1.8, "caida": 0.35})
hat("balde", "Chapéu balde", "#3BAA5C", copa={"folga": 0.015, "corte": 0.64, "alt": 1.0},
    aba={"largura": 0.26, "caida": 0.45})
hat("sapo", "Chapéu de sapo", "#7CC242", copa={"folga": 0.015, "corte": 0.6, "alt": 1.0},
    aba={"largura": 0.25, "caida": 0.5}, olhos={})
hat("gatinho", "Touca de gatinho", "#EE70A9", copa={"folga": 0.012, "corte": 0.58, "alt": 1.05},
    enrolado={"altura": 0.15, "cor": "branco"}, orelhas={})
hat("aviador_inverno", "Touca com protetor de orelha", "#7B4B2D", copa={"folga": 0.015, "corte": 0.62, "alt": 1.05},
    enrolado={"altura": 0.13, "cor": "creme"}, protetores={"cor": "creme"})
hat("faixa_cabeca", "Faixa de cabeça", "#D9433B", copa={"folga": 0.008, "folga_tras": 0.024, "corte": 0.64, "alt": 0.0},
    faixa={"altura": 0.15, "cor": "branco"})
hat("abafador", "Protetor auricular", "#D9433B", slot="orelhas", copa={"folga": 0.005, "corte": 0.97, "alt": 1.0},
    protetores={"cor": "vermelho"})

# ================= segunda leva (imagens 19 a 23: profissões e casuais)
PUNHO = {"marco": "punho", "desloca": -0.01}
QUAD = lambda d=-0.03: {"marco": "quadril", "desloca": d}
# --- por cima (casacos abertos e coletes, sobre a parte de cima)
cam("jaleco", "sobre", "Jaleco", "#F2F2F2", regiao="tronco", folga=0.034, abre_frente=0.035, gola={"altura": 0.025, "dobra": 0.9},
    partes=[{"cortes": [{"marco": "pescoco", "acima": True, "desloca": -0.01}, QUAD(0.0), PUNHO]},
            {"saia": {"desde": "cintura", "desloca_topo": -0.03, "ate": "joelho", "desloca": 0.02, "abertura": 1.12, "abre_frente": 9, "folga": 0.046}}])
cam("casaco_longo", "sobre", "Casaco longo", "#7B4B2D", regiao="tronco", folga=0.04, abre_frente=0.02, gola={"altura": 0.035, "dobra": 0.8},
    partes=[{"cortes": [{"marco": "pescoco", "acima": True, "desloca": -0.01}, QUAD(0.0), PUNHO]},
            {"saia": {"desde": "cintura", "desloca_topo": -0.03, "ate": "joelho", "desloca": -0.06, "abertura": 1.17, "abre_frente": 6, "folga": 0.052}}])
cam("cardiga", "sobre", "Cardigã", "#C9A46E", regiao="tronco", folga=0.03, abre_frente=0.03,
    cortes=[GOLA_V, QUAD(-0.04), PUNHO])
cam("jaqueta_aberta", "sobre", "Jaqueta aberta", "#24346B", regiao="tronco", folga=0.034, abre_frente=0.04, gola={"altura": 0.03, "dobra": 0.8},
    cortes=[{"marco": "pescoco", "acima": True, "desloca": -0.01}, QUAD(-0.02), PUNHO])
cam("salva_vidas", "sobre", "Colete salva-vidas", "#E27B3B", regiao="tronco", folga=0.03,
    partes=[{"cortes": [GOLA_V, QUAD(0.02), {"marco": "ombro", "desloca": 0.01}], "inflar": {"n": 10, "amp": 0.016}},
            {"capuz_caido": {"espessura": 0.034, "altura": 0.08, "abre": 62}},
            {"faixas_z": [["cintura", -0.02, "cintura", 0.012], ["peito", -0.045, "peito", -0.015]], "folga": 0.058, "cor": "preto",
             "cortes": [GOLA_V, QUAD(0.02), {"marco": "ombro", "desloca": 0.01}]},
            {"fivela": {"marco": "cintura", "desloca": -0.004, "folga": 0.062, "largura": 0.045, "altura": 0.03}, "cor": "cinza_escuro"},
            {"fivela": {"marco": "peito", "desloca": -0.03, "folga": 0.062, "largura": 0.045, "altura": 0.03}, "cor": "cinza_escuro"}])
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
hat("viseira", "Viseira", "#F2F2F2", copa={"folga": 0.008, "folga_tras": 0.024, "corte": 0.7, "alt": 0.0}, faixa={"altura": 0.12, "cor": "branco"},
    viseira={"comprimento": 0.36, "abertura": 58, "caida": 0.02})
hat("cauboi", "Chapéu de caubói", "#7B4B2D", copa={"folga": 0.015, "corte": 0.62, "alt": 1.25, "cor": "marrom"},
    faixa={"altura": 0.1, "cor": "preto"}, aba={"largura": 0.55, "caida": 0.0, "sobe_lados": 0.7, "cor": "marrom"})
hat("capuz", "Capuz", "#8A8F99", capuz={"folga": 0.04})
hat("touca_cirurgica", "Touca cirúrgica", "#7EC8E3", copa={"folga": 0.008, "corte": 0.6, "alt": 1.05, "inclina": 0.15, "cor": "azul"})
hat("tiara", "Tiara de babado", "#F2F2F2", so_arco=True, arco={"largura": 0.07, "babado": True, "folga": 0.028})
hat("arco", "Arco de cabelo", "#D9433B", so_arco=True, arco={"largura": 0.06, "frente": 0.25, "folga": 0.028})
hat("cartola", "Cartola", "#2B2B2B", copa={"folga": 0.012, "corte": 0.64, "inclina": 0.0, "cor": "preto"},
    banda={"altura": 0.6, "abre": 1.05, "cor": "preto"}, topo={"raio": 1.0, "cor": "preto"},
    aba={"largura": 0.3, "caida": 0.0, "sobe_lados": 0.3, "cor": "preto"})
hat("chapeu_palha", "Chapéu de palha", "#D6A83A", copa={"folga": 0.015, "corte": 0.62, "alt": 1.1, "cor": "bege"},
    faixa={"altura": 0.1, "cor": "vermelho"}, aba={"largura": 0.6, "caida": 0.25, "cor": "bege"})
hat("coroa", "Coroa", "#D6A83A", copa={"folga": 0.02, "folga_tras": 0.03, "corte": 0.8, "alt": 0.0}, banda={"altura": 0.15, "abre": 1.06, "cor": "dourado", "pontas": 8})
hat("chapeu_bruxa", "Chapéu pontudo", "#2B2B2B", copa={"folga": 0.015, "corte": 0.62, "alt": 3.2, "ponta": 0.25, "cor": "preto"},
    aba={"largura": 0.55, "caida": 0.05, "cor": "preto"})


# poses de segurar de todos os objetos de mão (frente, cima e fora do ombro, em comprimentos de braço):
# "aponta" leva o eixo Y da mão (o do objeto em pé no punho); "eixos" dá X (dedos) e Z (palma) direto
# "balanco": quanto do vaivém da mão na animação entra (ao andar); "pendurado": a gravidade e um pêndulo decidem a
# direção dos dedos (bolsa balança); "pousa": sentado, o objeto vai para o chão ao lado da cadeira
FRENTE_Y = {"alvo": [0.32, -0.42, 0.02], "aponta": [0.1, 1.0, 0.0], "balanco": 0.2}  # café, sorvete, picolé: na frente da cintura
AO_LADO = {"alvo": [0.04, -0.97, 0.07], "eixos": {"x": [0.0, -1.0, 0.0], "z": [0.0, 0.0, -1.0]}, "balanco": 0.85,
           "pendurado": True, "pousa": True}  # bolsas: braço solto
POSES = {
    "celular": {"alvo": [0.36, -0.3, -0.06], "eixos": {"x": [0.55, 0.45, -0.7], "z": [-0.55, 0.85, 0.0]}, "balanco": 0.15},
    "cafe": FRENTE_Y, "sorvete": FRENTE_Y, "picole": FRENTE_Y,
    "microfone": {"alvo": [0.3, -0.05, -0.12], "aponta": [-0.25, 1.0, 0.08], "balanco": 0.15},
    "buque": {"alvo": [0.28, -0.5, -0.04], "aponta": [0.15, 1.0, -0.1], "balanco": 0.25},
    "camera": {"alvo": [0.45, 0.2, -0.1], "eixos": {"x": [0.0, 1.0, 0.0], "z": [1.0, 0.0, 0.0]}, "balanco": 0.1},
    "livro": {"alvo": [0.35, -0.3, -0.05], "eixos": {"x": [0.3, 0.9, -0.3], "z": [-0.9, 0.3, 0.0]}, "balanco": 0.15},
    "bengala": {"alvo": [0.18, -0.88, 0.1], "eixos": {"x": [0.08, -1.0, 0.05], "z": [0.0, 0.0, -1.0]}, "balanco": 0.6,
                "pousa": True},
    "guarda_chuva": {"alvo": [0.12, -0.9, 0.08], "eixos": {"x": [0.05, -1.0, 0.04], "z": [0.0, 0.0, -1.0]},
                     "balanco": 0.6, "pousa": True},
    "bolsa": AO_LADO, "maleta": AO_LADO, "sacolas": AO_LADO, "sacola_papel": AO_LADO,
    "mala_rodinha": {"alvo": [-0.12, -0.92, 0.08], "eixos": {"x": [-0.35, -0.94, 0.0], "z": [0.0, 0.0, -1.0]},
                     "balanco": 0.5, "pousa": True},
}
NA_PALMA = {"alvo": [0.34, -0.38, 0.0], "eixos": {"x": [0.9, 0.15, 0.1], "z": [0.0, 1.0, 0.0]}, "balanco": 0.15}  # bola, bandeja
PAINEL = {"alvo": [0.35, -0.3, -0.05], "eixos": {"x": [0.3, 0.9, -0.3], "z": [-0.9, 0.3, 0.0]}, "balanco": 0.15}  # tablet, jornal
ROLANDO = {"alvo": [-0.12, -0.92, 0.08], "eixos": {"x": [-0.35, -0.94, 0.0], "z": [0.0, 0.0, -1.0]}, "balanco": 0.5, "pousa": True}
AO_LADO_RETO = {"alvo": [0.06, -0.95, 0.07], "eixos": {"x": [0.1, -1.0, 0.0], "z": [0.0, 0.0, -1.0]}, "balanco": 0.7, "pousa": True}
POSES.update({
    "garrafa": FRENTE_Y, "espatula": FRENTE_Y, "chave_inglesa": FRENTE_Y, "radio": FRENTE_Y, "tesoura_poda": FRENTE_Y,
    "pincel": {"alvo": [0.32, -0.3, 0.02], "aponta": [0.45, 0.9, 0.0], "balanco": 0.2},
    "rolo_papel": {"alvo": [0.3, -0.42, 0.04], "aponta": [0.55, 0.85, 0.0], "balanco": 0.2},
    "paleta": NA_PALMA, "bandeja_tampa": NA_PALMA, "caixas_presente": NA_PALMA, "bola_futebol": NA_PALMA,
    "bola_basquete": NA_PALMA, "bola_volei": NA_PALMA, "bola_praia": NA_PALMA, "bola_tenis": NA_PALMA,
    "tablet": PAINEL, "caderno": PAINEL, "jornal": PAINEL,
    "frigideira": {"alvo": [0.3, -0.35, 0.05], "eixos": {"y": [1.0, 0.05, 0.0], "z": [0.0, 0.0, -1.0]}, "balanco": 0.15},
    "lanterna": {"alvo": [0.32, -0.3, 0.05], "eixos": {"y": [1.0, -0.25, 0.0], "z": [0.0, 0.0, -1.0]}, "balanco": 0.2},
    "cartaz": {"alvo": [0.42, 0.1, 0.08], "aponta": [0.05, 1.0, 0.0], "balanco": 0.1},
    "cassetete": AO_LADO_RETO, "ancinho": dict(POSES["bengala"]),
    "mala_frisos": ROLANDO,
})
for k_ in ("bolsa_alca", "bolsa_tote", "bolsa_fecho", "bolsa_perolas", "bolsa_academia", "pasta_couro", "maleta_cantos",
           "maleta_rigida", "pasta_notebook", "sacola_loja", "kit_socorros", "extintor", "estojo_violao", "caixa_ferramentas"):
    POSES[k_] = AO_LADO
# ================= terceira leva (imagens 24 a 28: casuais 151 a 300)
CAMISA = [{"marco": "pescoco", "acima": True, "desloca": -0.01}, {"marco": "quadril", "desloca": -0.04}, {"marco": "braco_meio"}]
GOLA_CAMISA = {"altura": 0.022, "dobra": 0.9}
cam("camiseta_faixa", "cima", "Camiseta com faixa", "#3D7BD6", regiao="tronco", folga=0.012, padrao="faixa_peito",
    gola={"altura": 0.012}, cortes=[PESC, QUAD(-0.03), {"marco": "braco_meio"}])
cam("camiseta_larga", "cima", "Camiseta larga", "#F2F2F2", regiao="tronco", folga=0.022, gola={"altura": 0.01},
    cortes=[PESC, QUAD(-0.06), {"marco": "braco_meio", "desloca": 0.02}])
cam("regata_faixa", "cima", "Regata com faixa", "#3BAA5C", regiao="tronco", folga=0.01, padrao="faixa_peito",
    cortes=[GOLA_V, QUAD(-0.03), {"marco": "ombro", "desloca": 0.02}])
cam("camisa_caveira", "cima", "Camisa de caveirinhas", "#2B2B2B", regiao="tronco", folga=0.016, padrao="caveiras",
    gola=GOLA_CAMISA, cortes=CAMISA)
cam("camisa_folhas", "cima", "Camisa de folhas", "#2E8B57", regiao="tronco", folga=0.016, padrao="folhas", gola=GOLA_CAMISA,
    cortes=CAMISA)
cam("camisa_onca", "cima", "Camisa de oncinha", "#E0447F", regiao="tronco", folga=0.016, padrao="onca", gola=GOLA_CAMISA,
    cortes=CAMISA)
cam("camisa_ziguezague", "cima", "Camisa ziguezague", "#3FA7D6", regiao="tronco", folga=0.016, padrao="ziguezague",
    gola=GOLA_CAMISA, cortes=CAMISA)
cam("camisa_listrada_vertical", "cima", "Camisa listrada", "#D9433B", regiao="tronco", folga=0.016, padrao="listras_verticais",
    gola=GOLA_CAMISA, cortes=CAMISA)
cam("marinheiro", "cima", "Blusa de marinheiro", "#F2F2F2", regiao="tronco", folga=0.012,
    partes=[{"padrao": "liso", "cortes": [PESC, QUAD(-0.025), PUNHO], "faixas_cor": {"punhos": "azul_escuro", "largura_punho": 0.04}},
            {"tras": True, "faixa_x": [0.0, 0.14], "faixas_z": [["peito", 0.03, "pescoco", 0.2]], "folga": 0.022, "cor": "azul_escuro",
             "cortes": [PESC]},
            {"frente": 0, "faixa_x": [0.0, 0.03], "faixas_z": [["peito", -0.03, "peito", 0.03]], "folga": 0.024, "cor": "vermelho",
             "cortes": [PESC]}])
# top de biquíni: bojo na frente, faixa em volta (por baixo do braço, ligando frente e costas) e alcinhas por cima dos ombros
cam("top_biquini", "cima", "Top de biquíni", "#D9433B", regiao="tronco", folga=0.006,
    # a faixa dá a volta inteira com a mesma altura (fechada dos lados, embaixo do braço; os braços ficam fora pelos
    # ossos: região "torso"); a alça fica mais rente que a faixa (por dentro dela) e desce até dentro da faixa na
    # frente e nas costas (presa dos dois lados)
    partes=[{"regiao": "torso", "faixas_z": [["peito", -0.07, "peito", 0.035]]},
            {"faixa_x": [0.066, 0.084], "faixas_z": [["peito", -0.03, "pescoco", 0.2]], "folga": 0.0035}])
cam("jaqueta_aviador", "cima", "Jaqueta de aviador", "#7B4B2D", regiao="tronco", folga=0.03,
    gola={"altura": 0.04, "dobra": 0.85, "aba": 0.022, "cor": "creme"}, faixas_cor={"punhos": "creme", "largura_punho": 0.03},
    cortes=[{"marco": "pescoco", "acima": True, "desloca": -0.01}, QUAD(-0.05), PUNHO])
cam("jaqueta_colegial", "cima", "Jaqueta colegial", "#2E8B57", regiao="tronco", folga=0.026, gola={"altura": 0.02},
    faixas_cor={"punhos": "branco", "barra": "branco", "gola": "branco"},
    cortes=[{"marco": "pescoco", "acima": True, "desloca": -0.01}, QUAD(-0.04), PUNHO])
cam("agasalho_listrado", "cima", "Jaqueta de agasalho listrada", "#B03A8C", regiao="tronco", folga=0.022,
    padrao="duas_cores_lateral", gola={"altura": 0.03}, faixas_cor={"punhos": "branco", "barra": "branco"},
    cortes=[{"marco": "pescoco", "acima": True, "desloca": -0.01}, QUAD(-0.04), PUNHO])
cam("moletom_capuz", "cima", "Moletom com capuz", "#3BAA5C", regiao="tronco", folga=0.024, padrao="bolso_canguru",
    partes=[{"cortes": [PESC, QUAD(-0.05), PUNHO], "faixas_cor": {}},
            {"capuz_caido": {"espessura": 0.028, "altura": 0.07, "abre": 75}}])
cam("acolchoada_capuz", "cima", "Jaqueta acolchoada com capuz", "#3FA7D6", regiao="tronco", folga=0.045, padrao="acolchoado",
    partes=[{"cortes": [{"marco": "pescoco", "acima": True, "desloca": 0.0}, QUAD(-0.05), PUNHO]},
            {"capuz_caido": {"espessura": 0.036, "altura": 0.08, "abre": 70}}])
# por cima: paletós com lapela, camisa aberta, capa de chuva
PALETO = dict(regiao="tronco", folga=0.03, abre_frente=0.035, lapela={"largura": 0.06},
              partes=[{"cortes": [{"marco": "pescoco", "acima": True, "desloca": -0.01}, QUAD(-0.02), PUNHO]},
                      {"saia": {"desde": "quadril", "desloca_topo": 0.04, "ate": "quadril", "desloca": -0.1, "abertura": 1.1,
                                "abre_frente": 10, "folga": 0.012}}])
cam("paleto", "sobre", "Paletó", "#24346B", **PALETO)
cam("paleto_brilho", "sobre", "Paletó brilhante", "#D6A83A", padrao="lantejoula", **PALETO)
cam("paleto_listrado", "sobre", "Paletó listrado", "#7B4B2D", padrao="listras_verticais", **PALETO)
cam("smoking", "sobre", "Smoking", "#C0392B", **{**PALETO, "lapela": {"largura": 0.06, "cor": "preto"}})
cam("camisa_aberta", "sobre", "Camisa aberta", "#7CC242", regiao="tronco", folga=0.03, abre_frente=0.07,
    gola={"altura": 0.022, "dobra": 0.9}, cortes=[{"marco": "pescoco", "acima": True, "desloca": -0.01}, QUAD(-0.05),
                                                {"marco": "braco_meio"}])
cam("capa_chuva", "sobre", "Capa de chuva", "#3FC1B0", regiao="tronco", folga=0.04, gola={"altura": 0.02},
    partes=[{"cortes": [{"marco": "pescoco", "acima": True, "desloca": -0.01}, QUAD(0.0), PUNHO]},
            {"saia": {"desde": "cintura", "desloca_topo": -0.03, "ate": "joelho", "desloca": 0.0, "abertura": 1.12, "folga": 0.052}},
            {"capuz_caido": {"espessura": 0.03, "altura": 0.075, "abre": 70}}])
# parte de baixo
cam("biquini_baixo", "baixo", "Calcinha de biquíni", "#D9433B", regiao="pernas", folga=0.005,
    cortes=[{"marco": "quadril", "acima": True, "desloca": 0.04}, {"marco": "quadril", "desloca": -0.075}])
cam("bermuda_praia", "baixo", "Bermuda de praia", "#D9433B", regiao="pernas", folga=0.02, padrao="listras_verticais",
    cortes=[{"marco": "cintura", "acima": True, "desloca": -0.03}, {"marco": "coxa_meio", "desloca": -0.02}])
cam("short_praia", "baixo", "Short de praia", "#C0392B", regiao="pernas", folga=0.018, padrao="duas_cores_lateral",
    cortes=[{"marco": "cintura", "acima": True, "desloca": -0.03}, {"marco": "coxa_meio", "desloca": 0.02}])
cam("calca_jeans", "baixo", "Calça jeans", "#3D5A8A", regiao="pernas", folga=0.016, padrao="jeans",
    cortes=[{"marco": "cintura", "acima": True, "desloca": -0.01}, {"marco": "tornozelo", "desloca": 0.02}])
cam("calca_rasgada", "baixo", "Calça jeans rasgada", "#3D7BD6", regiao="pernas", folga=0.016, padrao="jeans",
    furos=[{"marco": "joelho", "desloca": 0.02, "raio": 0.032}, {"marco": "coxa_meio", "desloca": 0.0, "raio": 0.02}],
    cortes=[{"marco": "cintura", "acima": True, "desloca": -0.01}, {"marco": "tornozelo", "desloca": 0.02}])
cam("bermuda_rasgada", "baixo", "Bermuda jeans rasgada", "#3D7BD6", regiao="pernas", folga=0.018, padrao="jeans",
    furos=[{"marco": "coxa_meio", "desloca": -0.01, "raio": 0.026}],
    cortes=[{"marco": "cintura", "acima": True, "desloca": -0.01}, {"marco": "joelho", "desloca": 0.05}])
cam("calca_listrada", "baixo", "Calça listrada", "#3D7BD6", regiao="pernas", folga=0.018, padrao="listras_verticais",
    cortes=[{"marco": "cintura", "acima": True}, {"marco": "tornozelo", "desloca": 0.02}])
cam("calca_agasalho_listrada", "baixo", "Calça de agasalho listrada", "#B03A8C", regiao="pernas", folga=0.018,
    padrao="duas_cores_lateral", faixas_cor={"barra": "branco", "largura_barra": 0.025},
    cortes=[{"marco": "cintura", "acima": True}, {"marco": "tornozelo", "desloca": 0.02}])
cam("calca_boca_sino", "baixo", "Calça boca de sino", "#C2185B", regiao="pernas", folga=0.014, boca_sino=0.05,
    cortes=[{"marco": "cintura", "acima": True}, {"marco": "tornozelo", "desloca": -0.005}])
cam("meia_calca", "meias", "Meia-calça", "#2B2B2B", regiao="pernas", folga=0.003, cortes=[{"marco": "cintura", "acima": True}])
# corpo inteiro
TOPO_VEST = [{"marco": "pescoco", "acima": True, "desloca": -0.01}, {"marco": "cintura", "desloca": -0.01}]
cam("vestido_um_ombro", "inteira", "Vestido de um ombro", "#8E55D6", regiao="tronco", folga=0.01,
    partes=[{"cortes": [GOLA_V, {"marco": "cintura", "desloca": -0.01}, {"marco": "ombro", "desloca": 0.01}], "ombro_unico": 1},
            {"saia": {"desde": "cintura", "ate": "joelho", "desloca": 0.02, "abertura": 1.15}}])
cam("vestido_tubinho", "inteira", "Vestido tubinho", "#3D7BD6", regiao="tronco", folga=0.008,
    partes=[{"cortes": [GOLA_V, {"marco": "cintura", "desloca": -0.01}, {"marco": "ombro", "desloca": 0.02}]},
            {"saia": {"desde": "cintura", "ate": "coxa_meio", "desloca": -0.02, "abertura": 1.03}}])
cam("vestido_gola", "inteira", "Vestido de gola branca", "#3FC1B0", regiao="tronco", folga=0.012,
    gola={"altura": 0.02, "dobra": 0.95, "aba": 0.02, "cor": "branco"},
    partes=[{"cortes": TOPO_VEST + [{"marco": "braco_meio"}]},
            {"saia": {"desde": "cintura", "ate": "joelho", "desloca": 0.0, "abertura": 1.25}}])
cam("vestido_manga_curta", "inteira", "Vestido de manga curta", "#D9433B", regiao="tronco", folga=0.012,
    partes=[{"cortes": TOPO_VEST + [{"marco": "braco_meio", "desloca": -0.03}]},
            {"saia": {"desde": "cintura", "ate": "joelho", "desloca": -0.02, "abertura": 1.2}}])
cam("macaquinho_listrado", "inteira", "Macaquinho listrado", "#8E55D6", regiao="corpo", folga=0.008, padrao="listras_marinheiro",
    cortes=[GOLA_V, {"marco": "coxa_meio", "desloca": 0.05}, {"marco": "braco_meio", "desloca": -0.03}])
cam("maio_listrado", "inteira", "Maiô listrado", "#3D7BD6", regiao="corpo", folga=0.005, padrao="listras_marinheiro",
    cortes=[GOLA_V, {"marco": "quadril", "desloca": -0.08}, {"marco": "ombro", "desloca": 0.02}])
# acessórios do corpo
cam("lenco", "pescoco_peca", "Lenço no pescoço", "#D9433B", regiao="tronco", folga=0.02,
    partes=[{"faixas_z": [["pescoco", -0.035, "pescoco", 0.02]]},
            {"frente": 0, "faixa_x": [0.0, 0.055], "faixas_z": [["peito", 0.04, "pescoco", -0.02]], "folga": 0.024}])
cam("cinto_fivela", "cintura", "Cinto com fivela", "#2B2B2B", regiao="corpo", folga=0.014,
    partes=[{"faixas_z": [["cintura", -0.06, "cintura", -0.03]]},
            {"fivela": {"marco": "cintura", "desloca": -0.045, "folga": 0.02, "largura": 0.05, "altura": 0.036}, "cor": "dourado"}])
# chapéus
hat("fedora", "Chapéu fedora", "#2B2B2B", copa={"folga": 0.014, "corte": 0.62, "alt": 1.08, "inclina": 0.02, "vinco": 0.06},
    faixa={"altura": 0.1, "cor": "preto"}, aba={"largura": 0.28, "caida": 0.03, "sobe_tras": 0.5})
hat("palheta", "Chapéu palheta", "#C9A46E", copa={"folga": 0.012, "corte": 0.64, "inclina": 0.0},
    banda={"altura": 0.3, "abre": 1.04}, topo={"raio": 1.0}, faixa={"altura": 0.12, "cor": "azul_escuro"},
    aba={"largura": 0.3, "caida": 0.0})
hat("chapeu_praia", "Chapéu de praia", "#EE70A9", copa={"folga": 0.015, "corte": 0.7, "alt": 1.0},
    faixa={"altura": 0.1, "cor": "branco"}, aba={"largura": 0.56, "caida": 0.06, "ondas": 0.04, "n_ondas": 6})
hat("abas_largas", "Chapéu de abas largas", "#3FA7D6", copa={"folga": 0.015, "corte": 0.66, "alt": 1.08},
    faixa={"altura": 0.1, "cor": "preto"}, aba={"largura": 0.5, "caida": 0.03})
hat("touca_urso", "Touca de urso", "#E27B3B", copa={"folga": 0.012, "corte": 0.58, "alt": 1.05},
    enrolado={"altura": 0.14}, orelhas_redondas={"raio": 0.14, "dentro": "bege"})
hat("orelhas_coelho", "Orelhas de coelho", "#2B2B2B", so_arco=True, arco={"largura": 0.05, "folga": 0.028, "orelhas_longas": {"dentro": "rosa"}})
hat("bone_duas_cores", "Boné de duas cores", "#F2F2F2", copa={"folga": 0.01, "corte": 0.66, "inclina": 0.1},
    viseira={"comprimento": 0.5, "abertura": 58, "caida": 0.1, "cor": "azul"})
hat("bone_helice", "Boné com hélice", "#3BAA5C", copa={"folga": 0.01, "corte": 0.66, "inclina": 0.1,
                                                     "gomos": ["vermelho", "amarelo", "azul", "branco"] * 2},
    viseira={"comprimento": 0.5, "abertura": 58, "caida": 0.1}, helice={"pas": ("vermelho", "azul")})
# óculos
oc("oculos_redondos", "Óculos redondos", "#D6A83A", forma="redondo", armacao="branco")
oc("oculos_quadrados", "Óculos de grau quadrados", "#2B2B2B", forma="quadrado", armacao="branco", esp=0.006)
oc("oculos_gatinho", "Óculos gatinho", "#D9433B", forma="gatinho", armacao="branco", lente="preto")
oc("oculos_sol_redondos", "Óculos de sol redondos", "#EE70A9", forma="redondo", armacao="branco", lente="cinza_escuro")
oc("oculos_3d", "Óculos 3D", "#F2F2F2", forma="quadrado", armacao="branco", lente=["vermelho", "azul"], esp=0.007)
oc("oculos_esportivos", "Óculos esportivos", "#F2F2F2", forma="viseira", armacao="branco", lente="azul")
# objetos de mão
obj("celular", "dir", "Celular", "#2B2B2B", _pose=POSES["celular"], objeto="celular")
obj("cafe", "dir", "Copo de café", "#F2F2F2", _pose=POSES["cafe"], objeto="cafe")
obj("microfone", "dir", "Microfone", "#2B2B2B", _pose=POSES["microfone"], objeto="microfone")
obj("sorvete", "dir", "Sorvete", "#EE70A9", _pose=POSES["sorvete"], objeto="sorvete")
obj("picole", "dir", "Picolé", "#D9433B", _pose=POSES["picole"], objeto="picole")
obj("camera", "dir", "Câmera fotográfica", "#2B2B2B", _pose=POSES["camera"], objeto="camera")
obj("livro", "dir", "Livro", "#3D7BD6", _pose=POSES["livro"], objeto="livro")
obj("buque", "dir", "Buquê de flores", "#C9A0DC", _pose=POSES["buque"], objeto="buque")
obj("bengala", "dir", "Bengala", "#7B4B2D", _pose=POSES["bengala"], objeto="bengala")
obj("guarda_chuva", "dir", "Guarda-chuva", "#2B2B2B", _pose=POSES["guarda_chuva"], objeto="guarda_chuva")
obj("bolsa", "esq", "Bolsa", "#EE70A9", _pose=POSES["bolsa"], objeto="bolsa")
obj("maleta", "esq", "Maleta", "#2B2B2B", _pose=POSES["maleta"], objeto="maleta")
obj("mala_rodinha", "esq", "Mala de rodinhas", "#F2C231", _pose=POSES["mala_rodinha"], objeto="mala_rodinha")
obj("sacolas", "esq", "Sacolas de compras", "#EE70A9", _pose=POSES["sacolas"], objeto="sacolas")
obj("sacola_papel", "esq", "Sacola de compras com pão", "#C9A46E", _pose=POSES["sacola_papel"], objeto="sacola_papel")

# ================= quarta leva: objetos com pose de segurar e arrastão
GUARDA = {"alvo": [0.32, -0.02, 0.12], "aponta": [-0.08, 1.0, -0.04], "balanco": 0.15}  # na frente do ombro; a cúpula sobre a cabeça
SELFIE = {"alvo": [0.55, 0.3, 0.2], "aponta": [0.75, 0.6, 0.1], "balanco": 0.1}  # braço esticado para a frente e para cima
obj("guarda_chuva_aberto", "dir", "Guarda-chuva aberto", "#EE70A9", _pose=GUARDA, objeto="guarda_chuva_aberto")
obj("guarda_chuva_colorido", "dir", "Guarda-chuva colorido", "#D9433B", _pose=GUARDA, objeto="guarda_chuva_colorido")
obj("pau_selfie", "dir", "Pau de selfie", "#2B2B2B", _pose=SELFIE, objeto="pau_selfie")
ARRASTAO = dict(regiao="pernas", folga=0.003, padrao="arrastao", uv_repete=[24, 230], _transparente=True)
cam("meia_arrastao", "meias", "Meia-calça arrastão", "#2B2B2B", cortes=[{"marco": "quadril", "acima": True, "desloca": 0.01}],
    **ARRASTAO)
cam("meia_arrastao_coxa", "meias", "Meia 7/8 arrastão", "#2B2B2B", cortes=[{"marco": "coxa_meio", "acima": True, "desloca": 0.06}],
    **ARRASTAO)
cam("luvas_arrastao", "maos", "Mangas arrastão", "#2B2B2B", regiao="maos", folga=0.004, subdivide=0, padrao="arrastao",
    uv_repete=[16, 75], _transparente=True, cortes=[{"marco": "cotovelo", "acima": True, "desloca": 0.03},
                                                    {"marco": "punho", "desloca": -0.005}])

# ================= quinta leva: objetos da vitrine de objetos (bolsas, malas, ferramentas, bolas...)
for id_, mao, rot, cor in [
        ("bolsa_alca", "esq", "Bolsa de alça dourada", "#2B2B2B"), ("bolsa_tote", "esq", "Bolsa sacola", "#1F8A8A"),
        ("bolsa_fecho", "esq", "Bolsa com fecho", "#3FA7D6"), ("bolsa_perolas", "esq", "Bolsa de pérolas", "#B57EDC"),
        ("bolsa_academia", "esq", "Bolsa de academia", "#D9433B"), ("pasta_couro", "esq", "Pasta de couro", "#7B4B2D"),
        ("maleta_cantos", "esq", "Maleta antiga", "#8B4A2B"), ("maleta_rigida", "esq", "Maleta executiva", "#5A5F66"),
        ("pasta_notebook", "esq", "Pasta de notebook", "#2B2B2B"), ("mala_frisos", "esq", "Mala rígida com frisos", "#7FA9C9"),
        ("sacola_loja", "esq", "Sacola de loja", "#E27B3B"), ("kit_socorros", "esq", "Kit de primeiros socorros", "#D9433B"),
        ("extintor", "esq", "Extintor", "#D9433B"), ("estojo_violao", "esq", "Estojo de violão", "#3A3F46"),
        ("caixa_ferramentas", "esq", "Caixa de ferramentas", "#D9433B"),
        ("garrafa", "dir", "Garrafa térmica", "#3D7BD6"), ("pincel", "dir", "Pincel", "#C9A46E"),
        ("paleta", "dir", "Paleta de pintor", "#D9A06A"), ("tablet", "dir", "Tablet", "#2B2B2B"),
        ("caderno", "dir", "Bloco de notas", "#E27B3B"), ("jornal", "dir", "Jornal", "#F2F2F2"),
        ("frigideira", "dir", "Frigideira", "#2B2B2B"), ("espatula", "dir", "Espátula", "#2B2B2B"),
        ("bandeja_tampa", "dir", "Bandeja com tampa", "#AEB6C1"), ("bola_futebol", "dir", "Bola de futebol", "#F2F2F2"),
        ("bola_basquete", "dir", "Bola de basquete", "#E27B3B"), ("bola_volei", "dir", "Bola de vôlei", "#F2F2F2"),
        ("bola_praia", "dir", "Bola de praia", "#D9433B"), ("bola_tenis", "dir", "Bola de tênis", "#C8E04A"),
        ("caixas_presente", "dir", "Caixas de presente", "#F2B8A0"), ("rolo_papel", "dir", "Rolo de papel", "#3D7BD6"),
        ("cassetete", "dir", "Cassetete", "#2B2B2B"), ("ancinho", "dir", "Ancinho", "#C9A46E"),
        ("tesoura_poda", "dir", "Tesoura de poda", "#F2C231"), ("chave_inglesa", "dir", "Chave inglesa", "#5A5F66"),
        ("radio", "dir", "Rádio comunicador", "#2B2B2B"), ("lanterna", "dir", "Lanterna", "#F2C231"),
        ("cartaz", "dir", "Cartaz", "#E8B98A"), ("guarda_chuva_listrado", "dir", "Guarda-chuva listrado", "#EE70A9")]:
    obj(id_, mao, rot, cor, _pose=POSES.get(id_, GUARDA), objeto=id_)
# sexta leva: o que a cena de exemplo da família pediu
obj("guia_retratil", "esq", "Guia retrátil (de cachorro)", "#D9433B",
    _pose={"alvo": [0.22, -0.72, 0.1], "eixos": {"y": [1.0, -0.3, 0.0], "z": [0.0, 0.0, -1.0]}, "balanco": 0.3},
    objeto="guia_retratil")

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
conj("Marinheiro(a)", cima=n("marinheiro"), baixo=n("calca_social", "#F2F2F2"), cabeca=n("quepe_capitao"),
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

# casuais das imagens 24 a 28
conj("Praia de biquíni", cima=n("top_biquini"), baixo=n("biquini_baixo"), cabeca=n("chapeu_praia"), oculos=n("oculos_sol_redondos"),
     pes="roupa_chinelo_005")
conj("Praia de bermuda", baixo=n("bermuda_praia"), oculos=n("oculos_esportivos"), pes="roupa_chinelo_002")
conj("Turista", cima=n("camisa_folhas"), baixo=n("bermuda_folgada"), cabeca=n("chapeu_palha"), mao_dir=n("camera"),
     pes="roupa_tenis_009")
conj("Fotógrafo(a)", cima=n("camiseta_justa", "#F2F2F2"), sobre=n("jaqueta_aberta", "#E27B3B"), baixo=n("calca_social", "#E27B3B"),
     mao_dir=n("camera"), pes="roupa_tenis_009")
conj("Cantor(a) de palco", cima=n("camisa_social"), sobre=n("paleto_brilho"), baixo=n("calca_social", "#24346B"),
     pescoco_peca=n("gravata_borboleta"), mao_dir=n("microfone"), pes="roupa_sapato_seguranca")
conj("Apresentador(a)", cima=n("camisa_social"), sobre=n("paleto", "#E0447F"), baixo=n("calca_social", "#E0447F"),
     cabeca=n("fedora", "#F2F2F2"), mao_dir=n("microfone"), pes="roupa_sapato_seguranca")
conj("Executivo(a) de maleta", cima=n("camisa_social"), sobre=n("paleto", "#2B2B2B"), baixo=n("calca_social", "#2B2B2B"),
     pescoco_peca=n("gravata", "#24346B"), cabeca=n("fedora"), mao_esq=n("maleta"), pes="roupa_sapato_seguranca")
conj("Vovô de bengala", cima=n("camisa_social"), sobre=n("cardiga", "#8A8F99"), baixo=n("calca_social", "#6B5B4B"),
     cabeca=n("palheta"), alcas=n("suspensorio", "#2B2B2B"), oculos=n("oculos_redondos"), mao_dir=n("bengala"), pes="roupa_sapato_seguranca")
conj("Vovó de bengala", inteira=n("vestido_gola"), meias=n("meia_calca", "#5B4B3B"), oculos=n("oculos_redondos"), mao_dir=n("bengala"),
     pes="roupa_sapato_caixa")
conj("Viajante", cima=n("moletom_capuz", "#8A8F99"), baixo=n("calca_jeans"), mao_esq=n("mala_rodinha"), pes="roupa_tenis_009")
conj("Dia de compras", cima=n("camisa_onca"), baixo=n("calca_boca_sino"), oculos=n("oculos_gatinho"), mao_esq=n("sacolas"),
     pes="roupa_salto_showgirl")
conj("Feira", cima=n("camiseta_larga", "#F2C231"), baixo=n("calca_jeans"), cabeca=n("balde", "#F2F2F2"), mao_esq=n("sacola_papel"),
     pes="roupa_tenis_009")
conj("Dia de chuva", cima=n("camiseta_justa"), sobre=n("capa_chuva"), baixo=n("calca_jeans"), mao_dir=n("guarda_chuva_aberto", "#3FC1B0"),
     pes=n("galocha"))
conj("Encontro", inteira=n("vestido_um_ombro"), cintura=n("cinto_fivela"), mao_dir=n("buque"), pes="roupa_salto_showgirl")
conj("Sorveteria", cima=n("camiseta_faixa"), baixo=n("short_curto", "#F2F2F2"), cabeca=n("bone_duas_cores"), mao_dir=n("sorvete"),
     pes="roupa_tenis_009")
conj("Café", cima=n("camisa_ziguezague"), baixo=n("calca_social", "#C9A46E"), mao_dir=n("cafe"), pes="roupa_sapato_seguranca")
conj("Selfie", cima=n("cropped_manga", "#2B2B2B"), baixo=n("bermuda_rasgada"), oculos=n("oculos_sol_redondos"), mao_dir=n("pau_selfie"),
     pes="roupa_tenis_009")
conj("Aviador(a)", cima=n("jaqueta_aviador"), baixo=n("calca_jeans", "#2B2B2B"), oculos="roupa_oculos_006", pes=n("bota_alta"))
conj("Colegial", cima=n("jaqueta_colegial"), baixo=n("calca_jeans"), costas="roupa_mochila", pes="roupa_tenis_009")
conj("Agasalho listrado", cima=n("agasalho_listrado"), baixo=n("calca_agasalho_listrada"), pes="roupa_tenis_009")
conj("Smoking", cima=n("camisa_social"), sobre=n("smoking"), baixo=n("calca_social", "#2B2B2B"), pescoco_peca=n("gravata_borboleta"),
     cabeca=n("cartola"), pes="roupa_sapato_seguranca")
conj("Leitor(a)", cima=n("gola_alta", "#F2F2F2"), sobre=n("cardiga", "#7B4B2D"), baixo=n("calca_social", "#3D5A8A"),
     oculos=n("oculos_quadrados"), mao_dir=n("livro"), pes="roupa_sapato_caixa")
conj("Inverno de capuz", cima=n("acolchoada_capuz"), baixo=n("legging"), cabeca=n("touca_urso"), maos=n("luvas_justas", "#E27B3B"),
     pes=n("bota_alta", "#F2F2F2"))
conj("Roqueiro(a)", cima=n("camisa_caveira"), baixo=n("calca_rasgada", "#2B2B2B"), oculos=n("oculos_sol_redondos", "#2B2B2B"),
     pes="roupa_bota_sobrevivente")
conj("Festa à fantasia: coelho", inteira=n("maio", "#2B2B2B"), meias=n("meia_arrastao"), maos=n("luvas_arrastao"), cabeca=n("orelhas_coelho"),
     pescoco_peca=n("gravata_borboleta"), pes="roupa_salto_showgirl")
conj("Festa à fantasia: urso", cima=n("moletom", "#7B4B2D"), baixo=n("calca_moletom", "#7B4B2D"), cabeca=n("touca_urso", "#7B4B2D"),
     pes="roupa_tenis_009")
conj("Cinema 3D", cima=n("camiseta_justa", "#3D7BD6"), baixo=n("short_curto", "#F2C231"), oculos=n("oculos_3d"), mao_dir=n("picole"),
     pes="roupa_tenis_009")
conj("Retrô", cima=n("camisa_listrada_vertical"), baixo=n("calca_boca_sino", "#E27B3B"), oculos=n("oculos_redondos"),
     pes="roupa_sapato_36")
conj("Passeio de sol", inteira=n("vestido_manga_curta", "#3BAA5C"), cabeca=n("chapeu_praia", "#F2F2F2"),
     mao_dir=n("guarda_chuva_colorido"), pes="roupa_salto_showgirl")
conj("Roqueira de arrastão", cima=n("camisa_caveira"), baixo=n("short_curto", "#2B2B2B"), meias=n("meia_arrastao_coxa"),
     maos=n("luvas_arrastao"), pes=n("bota_alta", "#2B2B2B"))
conj("Artista na praça", cima=n("blusa_listrada"), baixo=n("calca_social", "#2B2B2B"), cabeca=n("boina"),
     mao_dir=n("pincel"), mao_esq=n("pasta_notebook", "#2B2B2B"), pes="roupa_sapato_caixa")
conj("Bombeiro(a) com extintor", cima=n("jaqueta_bombeiro"), baixo=n("calca_refletiva", "#C9362E"), cabeca=n("capacete_bombeiro"),
     mao_esq=n("extintor"), pes=n("galocha", "#2B2B2B"))
conj("Turista com mala", cima=n("camisa_floral"), baixo=n("bermuda_folgada"), cabeca=n("chapeu_palha"), oculos=n("oculos_sol_redondos"),
     mao_esq=n("mala_frisos", "#F2C231"), mao_dir=n("garrafa"), pes="roupa_chinelo_005")
conj("Jogador(a) de vôlei", cima=n("regata_justa", "#3D7BD6"), baixo=n("short_curto", "#2B2B2B"), joelhos=n("joelheiras"),
     mao_dir=n("bola_volei"), pes="roupa_tenis_009")
conj("Músico de estojo", cima=n("camisa_caveira"), baixo=n("calca_jeans", "#2B2B2B"), mao_esq=n("estojo_violao"), pes="roupa_tenis_plus")
conj("Jardineiro(a) com ancinho", cima=n("camisa_xadrez_folgada", "#3BAA5C"), inteira=n("jardineira", "#6B7A3A"),
     cabeca=n("chapeu_palha"), mao_dir=n("ancinho"), pes=n("galocha", "#3BAA5C"))
conj("Garçom com bandeja", cima=n("camisa_social"), baixo=n("calca_social", "#2B2B2B"), pescoco_peca=n("gravata_borboleta"),
     mao_dir=n("bandeja_tampa"), pes="roupa_sapato_seguranca")
conj("Repórter", cima=n("camisa_social", "#BFD7EA"), sobre=n("paleto", "#24346B"), baixo=n("calca_social", "#24346B"),
     mao_dir=n("caderno"), mao_esq=n("bolsa_tote", "#7B4B2D"), pes="roupa_sapato_seguranca")
conj("Boina e lenço", cima=n("camiseta_larga", "#F2F2F2"), baixo=n("calca_jeans"), cabeca=n("boina"), pescoco_peca=n("lenco"),
     pes="roupa_tenis_009")

p = os.path.join(AQUI, "roupas.json")
d = json.load(open(p))
d["itens"] = [x for x in d["itens"] if not x["id"].startswith("nov_")] + N
for s, r in {"mao_dir": "Na mão direita", "mao_esq": "Na mão esquerda", "sobre": "Casaco ou colete (por cima)", "joelhos": "Joelheiras", "cotovelos": "Cotoveleiras ou boias",
             "cintura": "Cinto", "alcas": "Suspensório", "avental": "Avental", "pescoco_peca": "Gravata ou cachecol",
             "rosto_peca": "Máscara"}.items():
    d["slots"][s] = r
ordem = ["cima", "sobre", "baixo", "inteira", "pes", "meias", "maos", "cabeca", "oculos", "rosto_peca", "orelhas", "nariz",
         "pescoco_peca", "pescoco", "pulso", "cotovelos", "joelhos", "cintura", "alcas", "avental", "costas", "mao_dir", "mao_esq"]
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
