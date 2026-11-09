"""Elenco do Morada: ~300 personagens prontos (90 profissionais em 30 papéis e 210 casuais de todas as idades), com corpo,
pele, cabelo, barba, expressão, uma peça por parte com cor, objetos de mão e a animação de repouso sugerida.

Os profissionais estão escritos à mão (abaixo). Os casuais saem de estilos (roupa coerente por idade) e paletas
harmoniosas, com uma semente fixa: o mesmo arquivo sai igual a cada vez. Cada peça é filtrada pelas regras de
elenco_regras.py (as mesmas da página), e os nomes são brasileiros, todos diferentes.

Cada personagem usa os campos do formato "morada-personagem" da página (corpo, pele, expressao, cabelo, roupa,
objetos, gravidez; recém-nascido: cabelo.tipo, manta, chupeta), mais id, nome, grupo, papel, faixa, paleta,
animacao (e o rótulo dela) e, para ciclistas, veiculo.

Uso: python3 -I elenco_define.py   (grava elenco.json ao lado)
"""
import json
import os
import random
import sys
import unicodedata

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import elenco_regras as E  # noqa: E402

RNG = random.Random(20261108)
T = E.TONS
# tons de pele: os quatro da página e os meios-termos entre vizinhos
PELES = ["Clara", "#FEAE8C", "Média", "#DC8866", "Morena", "#814A3C", "Escura"]
ESCURAS = {"Morena", "#814A3C", "Escura"}

ANIM_ROTULO = {
    "resident.idle.neutral": "Parado", "resident.idle.happy": "Parado feliz", "resident.idle.old": "Parado (idoso)",
    "resident.idle.bored": "Entediado", "resident.idle.look_around": "Olhando em volta", "resident.idle.sad": "Parado triste",
    "resident.phone.talk": "Ao telefone", "resident.text": "Mexendo no celular", "resident.read.stand": "Lendo de pé",
    "resident.talk.listen": "Escutando", "resident.talk.a": "Conversando", "resident.wave": "Dando tchau",
    "resident.clap": "Aplaudindo", "resident.cheer": "Comemorando", "resident.device.use": "Usando tablet",
    "resident.emote.thinking": "Pensando", "resident.present": "Explicando para um grupo", "resident.drink.stand": "Bebendo",
    "resident.emote.excited": "Empolgado", "resident.dance.silly": "Dança engraçada", "resident.baby.sit": "Sentado no chão",
    "resident.baby.crawl": "Engatinhando", "resident.sit.clap": "Aplaudindo sentado", "resident.gravida.belly_hold": "Mão na barriga",
    "resident.gravida.back_hold": "Mão na lombar", "resident.laugh": "Rindo", "resident.agree": "Concordando",
    "resident.greet": "Cumprimentando", "resident.stretch": "Alongando o braço", "resident.look_behind": "Olhando para trás",
    "resident.search.pockets": "Procurando nos bolsos", "resident.emote.thankful": "Agradecendo", "resident.walk.old": "Andando (idoso)",
    "resident.idle.sad ": "Parado triste",
}


def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return "".join(c if c.isalnum() else "_" for c in s).strip("_").replace("__", "_")


USADOS = set()


def usa_nome(nome):
    assert nome not in USADOS, f"nome repetido: {nome}"
    USADOS.add(nome)
    return nome


def pessoa(grupo, papel, corpo, pele, nome, expr, cab, anim="resident.idle.neutral", gravidez=0, veiculo=None,
           paleta=None, **pecas):
    """cab: (penteado, cor, barba) ou, no recém-nascido, (tipo, cor); pecas: slot=(id, cor) e dir=/esq= objetos."""
    sexo, faixa = E.CORPOS[corpo]
    p = {"id": None, "nome": usa_nome(nome), "grupo": grupo, "papel": papel, "faixa": faixa, "corpo": corpo,
         "pele": pele, "expressao": expr}
    if faixa == "recem":
        p["cabelo"] = {"tipo": cab[0], "cor": cab[1]}
        p["manta"] = pecas.pop("manta")
        p["chupeta"] = bool(pecas.pop("chupeta", False))
        p["animacao"] = None
    else:
        p["cabelo"] = {"penteado": cab[0], "cor": cab[1], "barba": cab[2] if len(cab) > 2 and cab[2] else "nenhum"}
        p["roupa"], p["objetos"] = {}, {}
        for k, v in pecas.items():
            if v is None:
                continue
            rid, cor = v if isinstance(v, tuple) else (v, None)
            alvo = p["objetos"] if k in ("dir", "esq") else p["roupa"]
            alvo[k] = {"id": rid, "cor": cor}
        p["animacao"] = anim
        if corpo in E.COM_GRAVIDA:
            p["gravidez"] = gravidez
    if p["animacao"]:
        p["animacao_rotulo"] = ANIM_ROTULO.get(p["animacao"], p["animacao"])
    if veiculo:
        p["veiculo"] = veiculo
    cores = [v["cor"] for v in list(p.get("roupa", {}).values()) + list(p.get("objetos", {}).values()) if v.get("cor")]
    p["paleta"] = paleta or list(dict.fromkeys(cores))[:5]
    return p


# =============================================================== profissionais (30 papéis, 90 pessoas)
PR = []


PAPEIS = {  # o papel (30) de cada rótulo
    "Ator/Atriz": "Ator Atriz", "Arquiteto(a)": "Arquiteto Arquiteta", "Artista": "Artista",
    "Jogador(a) de basquete": "Jogador_de_basquete Jogadora_de_basquete", "Ciclista": "Ciclista Skatista",
    "Pedreiro(a)": "Pedreiro Pedreira", "Empresário(a)": "Empresário Empresária", "Capitão(ã)": "Capitão Capitã",
    "Caixa": "Caixa", "Faxineiro(a)": "Faxineiro Faxineira", "Cozinheiro(a)": "Chef_de_cozinha Cozinheiro Cozinheira",
    "Entregador(a)": "Entregador Entregadora", "Médico(a)": "Médico Médica Médica_cirurgiã", "Socorrista": "Socorrista",
    "Fazendeiro(a)": "Fazendeiro Fazendeira", "Bombeiro(a)": "Bombeiro Bombeira",
    "Jogador(a) de futebol": "Jogador_de_futebol Jogadora_de_futebol", "Jardineiro(a)": "Jardineiro Jardineira",
    "Gari": "Gari", "Cabeleireiro(a)": "Cabeleireiro Cabeleireira", "Camareiro(a)": "Camareiro Camareira",
    "Paciente": "Paciente", "Policial": "Policial", "Detento(a)": "Detento Detenta", "Reparador(a)": "Reparador Reparadora",
    "Segurança": "Segurança", "Comissário(a) de bordo": "Comissário_de_bordo Comissária_de_bordo",
    "Nadador(a)": "Nadador Nadadora", "Professor(a)": "Professor Professora", "Garçom/garçonete": "Garçom Garçonete",
}
PAPEL_DE = {r.replace("_", " "): k for k, v in PAPEIS.items() for r in v.split()}


def prof(rotulo, corpo, pele, nome, expr, cab, anim="resident.idle.neutral", **k):
    p = pessoa("profissionais", PAPEL_DE[rotulo], corpo, pele, nome, expr, cab, anim, **k)
    p["rotulo"] = rotulo  # o nome do papel para esta pessoa (feminino ou masculino)
    PR.append(p)


W, PT = "#F2F2F2", "#2B2B2B"
# --- Ator/Atriz (figurinos de palco)
prof("Atriz", "adulta", "#FEAE8C", "Bianca", "feliz", ("cabelo_showgirl", "Loiro"), "resident.idle.happy",
     cima="roupa_blusa_showgirl", baixo="roupa_saia_showgirl", cabeca="roupa_chapeu_showgirl", pes="roupa_salto_showgirl",
     maos=("nov_luvas_justas", W))
prof("Ator", "adulto", "Escura", "Wellington", "confiante", ("cabelo_criativo10", "Preto", "cavanhaque"), "resident.present",
     cima=("nov_manga_longa", "#F2E6C8"), sobre=("nov_casaco_longo", "#9B2335"), baixo=("nov_calca_social", PT),
     cabeca="nov_coroa", pes=("nov_bota_alta", "#3A2A20"))
prof("Atriz", "plus_f", "Morena", "Rosana", "feliz", ("coque", "Preto"), "resident.idle.happy",
     inteira="roupa_fantasia_10", nariz="roupa_nariz_palhaco", pes=("roupa_tenis_plus", "#D9433B"))
# --- Arquiteto(a): capacete branco e planta enrolada
prof("Arquiteto", "adulto", "Escura", "Anderson", "confiante", ("cabelo_seguranca", "Preto", "barba_rente"),
     cima=("nov_camisa_social", W), sobre=("nov_paleto", "#2B2D33"), baixo=("nov_calca_social", "#2B2D33"),
     pescoco_peca=("nov_gravata", "#24346B"), cabeca=("nov_capacete_obra", W), pes="roupa_sapato_seguranca",
     dir="nov_planta_enrolada")
prof("Arquiteta", "adulta", "Média", "Fernanda", "feliz", ("rabo_cavalo", "Castanho"),
     cima=("nov_camisa_social", "#E9EEF5"), sobre=("nov_paleto", "#3A3F4B"), baixo=("gen_saia_lapis", "#3A3F4B"),
     cabeca=("nov_capacete_obra", W), pes=("roupa_sapato_caixa", PT), dir="nov_prancheta")
prof("Arquiteto", "plus_m", "Clara", "Márcio", "serio", ("cabelo_plus", "Castanho claro", "barba_2_curta"), "resident.device.use",
     cima=("nov_camisa_social", W), sobre=("nov_jaqueta_aberta", "#6B4A32"), baixo=("nov_calca_social", "#2B2D33"),
     cabeca=("nov_capacete_obra", "#F2C231"), pes="roupa_sapato_seguranca", dir="nov_tablet")
prof("Arquiteta", "idosa", "#814A3C", "Iracema", "confiante", ("cabelo_caixa", "Grisalho"),
     cima=("nov_gola_alta", PT), sobre=("nov_casaco_longo", "#C9A46E"), baixo=("nov_calca_social", PT),
     cabeca=("nov_capacete_obra", W), oculos=("nov_oculos_quadrados", PT), pes=("roupa_sapato_caixa", PT),
     dir="nov_planta_enrolada")
# --- Artista
prof("Artista", "adulta", "Escura", "Tainá", "feliz", ("afro", "Preto"), "resident.idle.happy",
     cima=("nov_blusa_listrada", "#E8559A"), baixo=("nov_calca_rasgada", "#3D7BD6"), cabeca=("nov_boina", "#D9433B"),
     pes=("roupa_tenis_009", "#E8559A"), dir="nov_pincel")
prof("Artista", "alto_magro", "Média", "Caio", "confiante", ("cabelo_noel", "Castanho", "cavanhaque"),
     cima=("nov_camiseta_larga", W), sobre=("nov_jaqueta_aberta", "#3FA7D6"), baixo=("nov_calca_cargo", "#6B7A3A"),
     cabeca=("nov_boina", PT), pescoco_peca=("nov_lenco", "#D9433B"), pes=("roupa_tenis_plus", None), dir="nov_paleta")
prof("Artista", "adolescente_f", "Clara", "Lavínia", "feliz", ("coque_duplo", "Ruivo"), "resident.idle.happy",
     cima=("nov_camiseta_justa", "#F2C231"), inteira=("nov_jardineira", "#3D7BD6"), pes=("roupa_tenis_009", W),
     dir=("nov_spray", "#E8559A"))
# --- Jogador(a) de basquete
prof("Jogador de basquete", "alto_magro", "Escura", "Washington", "confiante", ("cabelo_raspado", "Preto"),
     cima=("nov_regata_justa", "#F2C231"), baixo=("nov_bermuda_folgada", "#D9433B"), meias=("nov_meias_altas", W),
     pes=("roupa_tenis_009", "#D9433B"), cabeca=("nov_faixa_cabeca", "#D9433B"), dir="nov_bola_basquete")
prof("Jogadora de basquete", "atletica", "Morena", "Rayssa", "confiante", ("rabo_alto", "Preto"),
     cima=("nov_regata_faixa", "#6A3FB5"), baixo=("nov_bermuda_folgada", "#6A3FB5"), meias=("nov_meias_altas", W),
     pes=("roupa_tenis_009", W), cabeca=("nov_faixa_cabeca", W), dir="nov_bola_basquete")
# --- Ciclista (bicicleta, skate e patinete)
prof("Ciclista", "adulto", "Média", "Leandro", "feliz", ("cabelo_seguranca", "Castanho", "barba_rente"), veiculo="bicicleta",
     cima=("nov_ciclista_cima", "#2FA84F"), baixo=("nov_bermuda_ciclista", PT), cabeca=("nov_capacete_bike", "#2FA84F"),
     maos="roupa_luvas_014", oculos=("nov_oculos_esportivos", PT), pes=("roupa_tenis_009", W))
prof("Ciclista", "atletica", "Clara", "Natália", "confiante", ("rabo_cavalo", "Loiro"), veiculo="bicicleta",
     cima=("nov_ciclista_cima", "#3FC1E0"), baixo=("nov_bermuda_ciclista", "#24346B"), cabeca=("nov_capacete_bike", W),
     oculos=("nov_oculos_esportivos", PT), pes=("nov_tenis_meia", "#3FC1E0"))
prof("Skatista", "adolescente_m", "Escura", "Kauã", "feliz", ("afro_curto", "Preto"), "resident.idle.happy", veiculo="skate",
     cima=("nov_moletom", "#3FC1B0"), baixo=("nov_bermuda_folgada", "#2B2D33"), cabeca=("nov_capacete_bike", W),
     joelhos="nov_joelheiras", cotovelos="nov_cotoveleiras", pes="roupa_tenis_plus", dir="nov_skate")
prof("Ciclista", "crianca_f", "Morena", "Maitê", "feliz", ("maria_chiquinha", "Castanho"), "resident.idle.happy",
     veiculo="patinete", cima=("nov_camiseta_faixa", "#E8559A"), baixo=("nov_short_curto", "#5B2D8E"),
     cabeca=("nov_capacete_bike", "#E8559A"), joelhos="nov_joelheiras", cotovelos="nov_cotoveleiras",
     pes=("roupa_tenis_009", W))
# --- Pedreiro(a)
prof("Pedreiro", "musculoso", "#DC8866", "Cleber", "confiante", ("cabelo_seguranca", "Preto", "bigode_2"),
     cima=("nov_colete_refletivo", "#F27A22"), baixo=("nov_calca_cargo", "#4A5560"), cabeca=("nov_capacete_obra", "#F2C231"),
     cintura="nov_cinto_ferramentas", maos="roupa_luvas_sobrevivente", pes="roupa_bota_lenhador", dir="nov_martelo")
prof("Pedreira", "adulta", "Clara", "Jaqueline", "confiante", ("rabo_curto", "Castanho claro"),
     cima=("nov_manga_longa", "#6B4A32"), baixo=("nov_calca_jeans", "#3D7BD6"), cabeca=("nov_capacete_obra", "#F2A23C"),
     cintura="nov_cinto_ferramentas", pes="var_bota_cano_curto", dir="nov_trena")
prof("Pedreiro", "plus_m", "Escura", "Osmar", "feliz", ("careca", "Preto", "barba"),
     cima=("nov_camisa_xadrez_folgada", "#C8442F"), baixo=("nov_calca_refletiva", "#2B2D33"),
     cabeca=("nov_capacete_obra", "#D9433B"), orelhas=("nov_abafador", "#D9433B"), pes="roupa_bota_lenhador",
     esq=("nov_caixa_ferramentas", "#D9433B"))
# --- Empresário(a)
prof("Empresário", "adulto", "Clara", "Ricardo", "confiante", ("cabelo_xadrez1", "Castanho"),
     cima=("nov_camisa_social", W), sobre=("nov_paleto", "#3A3F4B"), baixo=("nov_calca_social", "#3A3F4B"),
     pescoco_peca=("nov_gravata", "#2F5FD0"), pes="roupa_sapato_seguranca", esq=("nov_maleta_rigida", PT))
prof("Empresária", "adulta", "Escura", "Priscila", "confiante", ("cabelo_sobrevivente_comprido", "Preto"), "resident.phone.talk",
     cima=("nov_camisa_social", W), sobre=("nov_paleto", "#1E2433"), baixo=("nov_calca_social", "#1E2433"),
     pes=("roupa_salto_showgirl", PT), esq="nov_pasta_notebook", dir=("nov_celular", PT))
prof("Empresário", "idoso", "Média", "Aristides", "serio", ("cabelo_xadrez1", "Grisalho", "barba_2_curta"),
     cima=("nov_camisa_social", W), sobre=("nov_paleto_listrado", "#5A4234"), baixo=("nov_calca_social", "#5A4234"),
     pescoco_peca=("nov_gravata", "#9B2335"), oculos=("nov_oculos_quadrados", PT), pes="roupa_sapato_seguranca",
     esq="nov_pasta_couro")
prof("Empresária", "plus_f", "Morena", "Kátia", "feliz", ("cabelo_caixa", "Castanho"), "resident.device.use",
     cima=("nov_gola_alta", W), sobre=("nov_paleto", "#6A3FB5"), baixo=("gen_saia_lapis", PT),
     meias=("nov_meia_calca", "#3A2E2A"), pes=("roupa_sapato_caixa", PT), dir="nov_tablet")
# --- Capitão(ã)
prof("Capitão", "idoso", "Clara", "Custódio", "confiante", ("cabelo_seguranca", "#E9E9E6", "barba_2_curta"),
     cima=("nov_camisa_social", W), sobre=("nov_paleto", "#24346B"), baixo=("nov_calca_social", "#24346B"),
     pescoco_peca=("nov_gravata", PT), cabeca="nov_quepe_capitao", pes="roupa_sapato_seguranca")
prof("Capitã", "atletica", "#DC8866", "Carolina", "confiante", ("coque", "Castanho"),
     cima=("nov_marinheiro", W), baixo=("nov_calca_social", "#24346B"), cabeca="nov_quepe_capitao",
     pes=("roupa_sapato_caixa", PT))
# --- Caixa
prof("Caixa", "adolescente_f", "Morena", "Kamilly", "feliz", ("rabo_cavalo", "Preto"),
     cima=("nov_polo", "#D9433B"), avental=("nov_avental_cintura", PT), baixo=("nov_calca_social", PT),
     pes=("roupa_tenis_009", W))
prof("Caixa", "adulto", "Escura", "Jefferson", "feliz", ("cabelo_criativo10", "Preto"),
     cima=("nov_camisa_uniforme", "#2F8F6A"), avental=("nov_avental_cintura", PT),
     pescoco_peca=("nov_gravata_borboleta", PT), baixo=("nov_calca_social", PT), pes="roupa_sapato_seguranca")
# --- Faxineiro(a)
prof("Faxineira", "adulta", "#FEAE8C", "Simone", "feliz", ("coque_franja", "Castanho claro"),
     cima=("nov_camiseta_justa", "#3FA7D6"), avental=("nov_avental", "#3D7BD6"), baixo=("nov_calca_social", "#2B2D33"),
     maos=("nov_luvas_borracha", "#F2C231"), pes=("roupa_tenis_009", W), esq=("nov_balde_mao", "#3FA7D6"))
prof("Faxineiro", "adulto", "Média", "Valter", "feliz", ("cabelo_seguranca", "Castanho", "bigode_2"),
     inteira=("nov_macacao", "#8A7A3A"), maos=("nov_luvas_borracha", "#3FC1B0"), pes="roupa_bota_sobrevivente",
     dir="nov_espanador")
prof("Faxineira", "plus_f", "Escura", "Luzia", "feliz", ("afro_coque", "Preto"),
     cima=("nov_camiseta_justa", "#3A3F4B"), avental=("nov_avental", "#F2C231"), baixo=("nov_calca_social", PT),
     maos=("nov_luvas_borracha", "#3FC1B0"), pes=("nov_galocha", "#3FC1B0"), esq=("nov_balde_mao", "#F2C231"))
# --- Cozinheiro(a) / chef
prof("Chef de cozinha", "adulto", "Morena", "Gustavo", "confiante", ("cabelo_seguranca", "Preto", "cavanhaque"),
     cima="nov_dolma", baixo=("nov_calca_social", PT), cabeca="nov_chapeu_cozinheiro", avental=("nov_avental_cintura", PT),
     pes="roupa_sapato_seguranca")
prof("Cozinheira", "adulta", "Clara", "Débora", "feliz", ("cabelo_caixa", "Loiro"),
     cima="nov_dolma", baixo=("nov_calca_social", "#4A4A4A"), pes=("roupa_tenis_009", W), dir="nov_espatula")
prof("Cozinheiro", "plus_m", "Escura", "Moacir", "feliz", ("cabelo_raspado", "Preto", "barba_2_curta"),
     cima=("nov_camiseta_justa", W), avental=("nov_avental", "#D9433B"), baixo=("nov_calca_social", W),
     cabeca="nov_chapeu_cozinheiro", pes=("roupa_sapato_seguranca", None), dir="nov_frigideira")
prof("Cozinheira", "atletica", "Morena", "Nayara", "confiante", ("trancas", "Preto"),
     cima=("nov_dolma", PT), baixo=("nov_calca_social", PT), cabeca=("nov_faixa_cabeca", "#D9433B"),
     pes=("roupa_tenis_plus", "#D9433B"))
# --- Entregador(a)
prof("Entregador", "adulto", "Clara", "Murilo", "feliz", ("cabelo_seguranca", "Loiro"),
     cima=("nov_polo", "#D9433B"), baixo=("nov_calca_jeans", "#3D7BD6"), cabeca=("nov_bone_novo", "#D9433B"),
     pes=("roupa_tenis_009", W), dir="nov_pacote")
prof("Entregadora", "adulta", "Morena", "Luana", "feliz", ("rabo_cavalo", "Preto"),
     cima=("nov_polo", "#3FA7D6"), baixo=("nov_calca_social", PT), cabeca=("nov_bone_novo", "#3D7BD6"),
     pes=("roupa_tenis_009", W), dir="nov_envelope")
prof("Entregador", "adolescente_m", "Média", "Ryan", "confiante", ("cabelo_xadrez2", "Castanho"),
     cima=("nov_agasalho", "#E8592A"), baixo=("nov_calca_agasalho_listrada", "#E8592A"),
     cabeca=("nov_capacete_bike", "#E8592A"), costas="roupa_mochila", pes=("roupa_tenis_009", W), dir="nov_caixa_pizza")
# --- Médico(a)
prof("Médico", "adulto", "Escura", "Emerson", "confiante", ("cabelo_raspado", "Preto", "barba_rente"),
     cima=("nov_camiseta_justa", "#3FC1B0"), sobre=("nov_jaleco", W), baixo=("nov_calca_social", "#3FC1B0"),
     pes=("roupa_tenis_009", W), dir="nov_prancheta")
prof("Médica cirurgiã", "adulta", "Clara", "Mariana", "confiante", ("cabelo_caixa", "Castanho"),
     cima=("nov_jaleco_curto", "#3FC1B0"), baixo=("nov_calca_social", "#3FC1B0"), cabeca=("nov_touca_cirurgica", "#3FC1B0"),
     rosto_peca="nov_mascara", maos=("nov_luvas_justas", "#7EC8E3"), pes=("roupa_tenis_009", W))
prof("Médico", "idoso", "Média", "Hermes", "confiante", ("cabelo_seguranca", "Grisalho", "barba_2_curta"),
     cima=("nov_camisa_social", "#BFD7EA"), pescoco_peca=("nov_gravata", "#24346B"), sobre=("nov_jaleco", W),
     baixo=("nov_calca_social", "#5B6370"), oculos=("nov_oculos_redondos", "#C9A46E"), pes="roupa_sapato_seguranca",
     esq=("nov_maleta_cantos", "#5A3A2A"))
prof("Médica", "plus_f", "#814A3C", "Elaine", "feliz", ("afro_curto", "Preto"),
     cima=("nov_jaleco_curto", "#3D7BD6"), baixo=("nov_calca_social", "#3D7BD6"), pes=("roupa_tenis_009", W),
     dir="nov_prancheta")
# --- Socorrista
prof("Socorrista", "adulto", "Clara", "Danilo", "confiante", ("cabelo_plus", "Ruivo"),
     inteira="nov_macacao_socorrista", rosto_peca="nov_mascara", maos=("nov_luvas_borracha", "#3FC1B0"),
     pes="roupa_bota_sobrevivente", esq="nov_kit_socorros")
prof("Socorrista", "atletica", "Escura", "Ingrid", "confiante", ("rabo_cavalo", "Preto"),
     inteira="nov_macacao_socorrista", maos=("nov_luvas_borracha", "#3D7BD6"), pes="roupa_bota_sobrevivente",
     dir="nov_radio")
# --- Fazendeiro(a)
prof("Fazendeiro", "idoso", "Clara", "Genésio", "feliz", ("cabelo_seguranca", "#E9E9E6", "bigode_1"),
     cima="roupa_camisa_lenhador", inteira=("nov_jardineira", "#3D5A8A"), cabeca="nov_chapeu_palha", pes="roupa_bota_noel",
     dir="nov_ancinho")
prof("Fazendeira", "adulta", "#DC8866", "Poliana", "feliz", ("trancas", "Castanho"),
     cima=("nov_camisa_xadrez_folgada", "#D9433B"), inteira=("nov_jardineira", "#3D7BD6"), cabeca="nov_chapeu_palha",
     maos=("nov_luvas_justas", "#7B4B2D"), pes=("nov_galocha", "#6B4A32"), esq="nov_cesta_piquenique")
prof("Fazendeiro", "musculoso", "Escura", "Saulo", "confiante", ("cabelo_raspado", "Preto", "barba_2_curta"),
     cima=("nov_regata_justa", "#C9A46E"), inteira=("nov_jardineira", "#4A6070"), cabeca=("nov_cauboi", "#7B4B2D"),
     pes="roupa_bota_lenhador", dir="nov_pa_jardim")
# --- Bombeiro(a)
prof("Bombeiro", "adulto", "Morena", "Rodrigo", "confiante", ("cabelo_seguranca", "Preto", "barba_rente"),
     cima=("nov_jaqueta_bombeiro", "#D9433B"), baixo=("nov_calca_refletiva", "#D9433B"), cabeca="nov_capacete_bombeiro",
     maos=("nov_luvas_justas", PT), pes=("nov_galocha", PT), esq="nov_extintor")
prof("Bombeira", "atletica", "Clara", "Talita", "confiante", ("rabo_cavalo", "Ruivo"),
     cima="nov_jaqueta_bombeiro", baixo="nov_calca_refletiva", cabeca=("nov_capacete_bombeiro", "#D9433B"),
     maos=("nov_luvas_justas", PT), pes=("nov_galocha", PT), dir="nov_esguicho")
prof("Bombeiro", "musculoso", "Escura", "Ubirajara", "feliz", ("careca", "Preto", "barba_2"),
     cima=("nov_jaqueta_bombeiro", "#6B7A3A"), baixo=("nov_calca_refletiva", "#6B7A3A"), cabeca="nov_capacete_bombeiro",
     pes=("nov_galocha", PT), dir="nov_lanterna")
# --- Jogador(a) de futebol
prof("Jogador de futebol", "adolescente_m", "Escura", "Erick", "feliz", ("cabelo_criativo10", "Preto"), "resident.idle.happy",
     cima=("nov_camiseta_justa", "#E8592A"), baixo=("nov_short_curto", W), meias=("nov_meias_altas", "#E8592A"),
     pes="roupa_tenis_plus", dir="nov_bola_futebol")
prof("Jogadora de futebol", "atletica", "Média", "Giovana", "confiante", ("rabo_alto", "Castanho"),
     cima=("nov_camiseta_faixa", "#2FA84F"), baixo=("nov_short_curto", W), meias=("nov_meias_altas", "#2FA84F"),
     pes=("roupa_tenis_009", W), dir="nov_bola_futebol")
# --- Jardineiro(a)
prof("Jardineiro", "adulto", "Clara", "Fábio", "feliz", ("cabelo_lenhador", "Castanho claro"),
     cima=("nov_camiseta_justa", W), inteira=("nov_jardineira", "#3BAA5C"), orelhas=("nov_abafador", "#D9433B"),
     maos=("nov_luvas_justas", "#3BAA5C"), pes=("nov_galocha", "#3BAA5C"), dir="nov_tesoura_poda")
prof("Jardineira", "idosa", "Escura", "Zélia", "feliz", ("coque", "Grisalho"),
     cima=("nov_camisa_xadrez_folgada", "#7CC242"), baixo=("nov_calca_cargo", "#6B7A3A"), cabeca="nov_chapeu_palha",
     maos=("nov_luvas_justas", "#7CC242"), pes=("nov_galocha", "#3BAA5C"), esq="nov_regador")
# --- Gari
prof("Gari", "adulto", "Média", "Wagner", "feliz", ("cabelo_seguranca", "Preto", "barba"),
     inteira=("nov_macacao_refletivo", "#F27A22"), cabeca=("nov_bone_novo", "#F27A22"),
     maos=("nov_luvas_borracha", "#2FA84F"), pes="roupa_bota_sobrevivente", dir="nov_ancinho")
prof("Gari", "adulta", "Clara", "Sabrina", "confiante", ("rabo_curto", "Loiro"),
     inteira=("nov_macacao_refletivo", "#F27A22"), cabeca=("nov_bone_novo", "#F27A22"),
     maos=("nov_luvas_borracha", "#F2C231"), pes="roupa_bota_sobrevivente", esq=("nov_balde_mao", "#2FA84F"))
prof("Gari", "alto_magro", "Escura", "Luan", "feliz", ("cabelo_raspado", "Preto"),
     cima=("nov_colete_refletivo", "#F27A22"), baixo=("nov_calca_refletiva", "#F27A22"), cabeca=("nov_bone_novo", "#F27A22"),
     maos=("nov_luvas_borracha", "#2FA84F"), pes="roupa_bota_sobrevivente")
# --- Cabeleireiro(a)
prof("Cabeleireiro", "adulto", "Morena", "Igor", "feliz", ("moicano", "Preto", "barba_rente"),
     cima=("nov_camiseta_justa", "#6A3FB5"), avental=("nov_avental", PT), baixo=("nov_calca_social", "#4A4A4A"),
     pes=("roupa_tenis_009", W), dir="nov_tesoura_cabelo", esq="nov_pente")
prof("Cabeleireira", "adulta", "Clara", "Vanessa", "feliz", ("cabelo_showgirl_volume", "#C2185B"),
     cima=("nov_manga_longa", W), avental=("nov_avental", PT), baixo=("nov_calca_jeans", "#2FA4A0"),
     pes=("roupa_tenis_009", W), dir="nov_secador")
prof("Cabeleireira", "plus_f", "Escura", "Jordana", "confiante", ("afro", "#7A4FC4"),
     cima=("nov_camiseta_justa", PT), avental=("nov_avental_cintura", "#E8559A"), baixo=("nov_calca_social", PT),
     pes="roupa_tenis_plus", dir="nov_tesoura_cabelo", esq="nov_pente")
# --- Camareiro(a)
prof("Camareira", "adulta", "#DC8866", "Viviane", "feliz", ("coque", "Castanho"),
     inteira=("nov_vestido_uniforme", PT), avental=("nov_avental_cintura", W), cabeca=("nov_tiara", W),
     meias=("nov_meia_calca", PT), pes=("roupa_sapato_caixa", PT), dir="nov_espanador")
prof("Camareiro", "alto_magro", "Clara", "Breno", "feliz", ("cabelo_xadrez2", "Loiro"),
     cima=("nov_camisa_social", W), pescoco_peca=("nov_gravata_borboleta", "#9B2335"), avental=("nov_avental", "#24346B"),
     baixo=("nov_calca_social", "#24346B"), pes="roupa_sapato_seguranca", dir="nov_espanador")
# --- Paciente
prof("Paciente", "adulto", "Clara", "Otávio", "aborrecido", ("cabelo_xadrez1", "Castanho", "barba_rente"), "resident.idle.bored",
     inteira="nov_camisola_hospital", pes=("roupa_chinelo_002", "#3FA7D6"))
prof("Paciente", "adulta", "Escura", "Joana", "neutro", ("coque", "Preto"),
     inteira="nov_camisola_hospital", pes=("roupa_chinelo_002", "#3FA7D6"))
prof("Paciente", "idoso", "Média", "Waldir", "triste", ("careca", "Grisalho", "bigode_2"), "resident.idle.old",
     inteira="nov_camisola_hospital", pes=("roupa_chinelo_002", "#3FA7D6"), dir=("nov_bengala", "#8A8F99"))
# --- Policial
prof("Policial", "adulto", "Clara", "Sérgio", "confiante", ("cabelo_seguranca", "Castanho"),
     cima=("nov_camisa_uniforme", "#2B3A55"), baixo=("nov_calca_social", "#1E2433"), cabeca="nov_quepe",
     cintura=("nov_cinto", PT), pes="roupa_sapato_seguranca", dir="nov_prancheta")
prof("Policial", "adulta", "Morena", "Patrícia", "confiante", ("coque", "Preto"),
     cima=("nov_camisa_uniforme", "#2B3A55"), baixo=("nov_calca_social", "#1E2433"), cabeca="nov_quepe",
     cintura=("nov_cinto", PT), oculos="roupa_oculos_seguranca", pes="roupa_sapato_seguranca")
prof("Policial", "musculoso", "Escura", "Davi", "confiante", ("cabelo_raspado", "Preto", "barba_rente"),
     cima=("nov_camisa_uniforme", "#2B3A55"), baixo=("nov_calca_social", "#1E2433"), cabeca="nov_quepe",
     cintura=("nov_cinto", PT), pes="roupa_sapato_seguranca", dir="nov_radio")
prof("Policial", "plus_m", "Média", "Lauro", "confiante", ("cabelo_seguranca", "#8A8A88", "bigode_1"),
     cima=("nov_camisa_uniforme", "#3B4A3E"), baixo=("nov_calca_social", PT), cabeca=("nov_quepe", PT),
     cintura=("nov_cinto", PT), pes="roupa_sapato_seguranca", dir="nov_cassetete")
# --- Detento(a)
prof("Detento", "adulto", "Clara", "Jonas", "serio", ("cabelo_raspado", "Loiro", "cavanhaque"),
     cima="nov_prisioneiro_cima", baixo="nov_prisioneiro_baixo", pes="roupa_chinelo_002")
prof("Detenta", "adulta", "Morena", "Samara", "serio", ("rabo_curto", "Castanho"),
     inteira=("nov_macacao", "#E8692A"), pes=("roupa_tenis_009", W))
prof("Detento", "plus_m", "Média", "Rogério", "aborrecido", ("careca", "Castanho", "barba_2_curta"), "resident.idle.bored",
     cima=("nov_camiseta_larga", "#E8692A"), baixo=("nov_calca_moletom", "#E8692A"), pes="roupa_chinelo_002")
# --- Reparador(a)
prof("Reparador", "adulto", "Escura", "Hélio", "confiante", ("cabelo_seguranca", "Preto", "bigode_2"),
     inteira=("nov_macacao", "#2F6FD0"), cabeca=("nov_capacete_obra", W), cintura="nov_cinto_ferramentas",
     maos=("nov_luvas_justas", "#F2C231"), pes="roupa_bota_lenhador", dir="nov_chave_inglesa")
prof("Reparadora", "atletica", "Clara", "Larissa", "confiante", ("rabo_cavalo", "Castanho claro"),
     cima=("nov_camiseta_justa", "#F2C231"), inteira=("nov_jardineira", "#3D5A8A"), cabeca=("nov_bone_tras", "#D9433B"),
     maos=("nov_luvas_justas", PT), pes="var_bota_cano_curto", dir="nov_furadeira")
prof("Reparador", "idoso", "Morena", "Expedito", "feliz", ("cabelo_seguranca", "Grisalho", "bigode_2"),
     cima=("nov_camisa_uniforme", "#4A6070"), baixo=("nov_calca_cargo", "#4A6070"), cabeca=("nov_bone_novo", "#4A6070"),
     oculos=("nov_oculos_quadrados", PT), pes="roupa_sapato_seguranca", esq="nov_caixa_ferramentas")
# --- Segurança
prof("Segurança", "musculoso", "Clara", "Alexandre", "serio", ("careca", "Castanho"),
     cima="roupa_camisa_seguranca", baixo="roupa_calca_seguranca", oculos="roupa_oculos_seguranca",
     orelhas="roupa_fones_002", pes="roupa_sapato_seguranca")
prof("Segurança", "plus_m", "Escura", "Jairo", "serio", ("cabelo_raspado", "Preto", "barba_rente"),
     cima=("nov_camisa_uniforme", PT), baixo=("nov_calca_social", PT), cintura=("nov_cinto", PT),
     pes="roupa_sapato_seguranca", dir="nov_radio")
prof("Segurança", "adulta", "Média", "Tatiane", "serio", ("coque", "Preto"),
     cima="roupa_camisa_seguranca", baixo="roupa_calca_seguranca", oculos="roupa_oculos_seguranca",
     pes="roupa_sapato_seguranca", dir="nov_lanterna")
# --- Comissário(a) de bordo
prof("Comissária de bordo", "adulta", "Morena", "Thaís", "feliz", ("cabelo_caixa", "Castanho"),
     cima=("nov_camisa_social", W), sobre=("nov_paleto", "#5B2D8E"), baixo=("gen_saia_lapis", "#5B2D8E"),
     pescoco_peca=("nov_lenco", "#F2C231"), cabeca=("nov_chapeu_comissaria", "#5B2D8E"), meias=("nov_meia_calca", "#5A4A44"),
     pes=("roupa_sapato_caixa", PT), esq=("nov_mala_rodinha", PT))
prof("Comissário de bordo", "adulto", "Média", "Vinícius", "confiante", ("cabelo_xadrez1", "Preto"),
     cima=("nov_camisa_social", W), sobre=("nov_paleto", "#24346B"), baixo=("nov_calca_social", "#24346B"),
     pescoco_peca=("nov_gravata", "#9B2335"), pes="roupa_sapato_seguranca", esq=("nov_mala_rodinha", "#24346B"))
prof("Comissária de bordo", "atletica", "Escura", "Yara", "feliz", ("cabelo_showgirl", "Preto"),
     inteira=("nov_vestido_tubinho", "#24346B"), pescoco_peca=("nov_lenco", "#D9433B"),
     cabeca=("nov_chapeu_comissaria", "#24346B"), pes=("roupa_salto_showgirl", "#24346B"), esq=("nov_mala_rodinha", "#9B2335"))
# --- Nadador(a)
prof("Nadador", "adolescente_m", "#FEAE8C", "Diogo", "feliz", ("cabelo_seguranca", "Castanho"), "resident.idle.happy",
     baixo=("nov_sunga", "#2F5FD0"), cabeca=("nov_touca_cirurgica", "#2F5FD0"), oculos=("nov_oculos_esportivos", PT))
prof("Nadadora", "crianca_f", "Morena", "Ayla", "feliz", ("rabo_cavalo", "Preto"), "resident.idle.happy",
     inteira=("nov_maio", "#7B3FB5"), cotovelos=("nov_boias_braco", "#F2A23C"))
prof("Nadadora", "atletica", "Clara", "Eduarda", "confiante", ("cabelo_caixa", "Loiro"),
     inteira=("nov_maio_listrado", "#E8559A"), cabeca=("nov_touca_cirurgica", "#E8559A"), oculos=("nov_oculos_esportivos", PT))
# --- Professor(a)
prof("Professora", "idosa", "Clara", "Celeste", "feliz", ("cabelo_caixa", "#E6E2DA"),
     cima=("nov_gola_alta", W), sobre=("nov_cardiga", "#B5651D"), baixo=("nov_calca_social", "#6B4A32"),
     oculos=("nov_oculos_redondos", "#C9A46E"), pes=("roupa_sapato_caixa", "#5A3A2A"), dir="nov_livro")
prof("Professor", "adulto", "Escura", "Paulo", "confiante", ("cabelo_criativo10", "Preto", "barba_rente"), "resident.present",
     cima=("nov_camisa_social", "#BFD7EA"), sobre=("nov_cardiga", "#6B4A32"), baixo=("nov_calca_social", "#3A3F4B"),
     oculos=("nov_oculos_quadrados", PT), pes="roupa_sapato_seguranca", dir="nov_caderno")
prof("Professora", "adulta", "Média", "Raquel", "feliz", ("cabelo_criativo12_comprido", "Castanho"),
     inteira=("nov_vestido_manga", "#3A6EA5"), oculos=("nov_oculos_gatinho", "#9B2335"), pes=("roupa_sapato_caixa", PT),
     esq=("nov_bolsa_tote", "#C9A46E"))
# --- Garçom/garçonete
prof("Garçom", "adulto", "Clara", "Henrique", "confiante", ("cabelo_xadrez1", "#3B2A22"),
     cima=("nov_camisa_social", W), pescoco_peca=("nov_gravata_borboleta", "#9B2335"), avental=("nov_avental_cintura", PT),
     baixo=("nov_calca_social", PT), pes="roupa_sapato_seguranca", dir="nov_bandeja_tampa")
prof("Garçonete", "adulta", "Escura", "Bruna", "feliz", ("rabo_alto", "Preto"),
     cima=("nov_camisa_social", W), pescoco_peca=("nov_gravata_borboleta", PT), baixo=("gen_saia_lapis", PT),
     pes=("roupa_sapato_caixa", PT), dir="nov_cardapio")
prof("Garçom", "plus_m", "Morena", "Kleber", "feliz", ("cabelo_seguranca", "Preto", "bigode_2"),
     cima=("nov_camisa_social", W), pescoco_peca=("nov_gravata_borboleta", PT), avental=("nov_avental_cintura", "#9B2335"),
     baixo=("nov_calca_social", PT), pes="roupa_sapato_seguranca", dir="nov_cardapio")
prof("Garçonete", "adolescente_f", "Clara", "Ana Júlia", "feliz", ("rabo_cavalo", "Ruivo"),
     cima=("nov_camiseta_justa", "#E8692A"), avental=("nov_avental", W), baixo=("nov_calca_social", PT),
     pes=("roupa_tenis_009", W), dir="nov_caderno")

# =============================================================== casuais (210)
NOMES = {
    "m_adulto": "Thiago Lucas Bruno Diego Felipe Marcelo André Renato Juliano Fernando Ítalo Matheus Nicolas Pedro Samuel "
                "Yuri Josué Iberê Cauã Gabriel Everton Túlio Rafael Leonardo Maurício Robson Edson Adriano Cristiano Douglas "
                "Fabrício Giovani Hugo Júlio Lúcio Mateus Nelson Pablo Reginaldo Silvio Tadeu Ulisses Vladimir Willian "
                "Xavier Zeca Alan Benjamim César Dênis Ezequiel Flávio Glauco Heron Isaías Jean Kaio Lindomar Mário "
                "Nilo Orlando Rubens Sandro Tomás Vagner Wilson Aurélio Bernardo Cícero Damião Elias Fausto Gerson "
                "Horácio Inácio Jorge Kauê Luís Mauro Natan Oséias Rui Sidney Toninho Vítor".split(),
    "f_adulto": "Juliana Camila Aline Carla Daniela Gabriela Jéssica Michele Renata Viviane Flávia Mônica Paula Silvia "
                "Ingrid Kelly Lívia Marina Beatriz Giselle Isabela Karina Lorena Rayane Talia Vitória Zuleica Adriana "
                "Bárbara Cíntia Denise Érica Fabiana Gisele Helena Ivana Janaína Kênia Lúcia Marta Nádia Olga Pâmela "
                "Quitéria Regina Sônia Tereza Úrsula Valéria Wanda Ximena Yolanda Alessandra Bete Cristina Dayane Estela "
                "Franciele Graça Hortência Irene Jaciara Keila Laís Madalena Noemi Odara Rita Solange Telma Vera Amanda "
                "Clarice Dandara Eliane Fátima Gabi Inês Josiane".split(),
    "m_idoso": "Sebastião Geraldo Raimundo Severino Antônio Benedito Francisco Osvaldo Dirceu Valdemar Arlindo Lázaro Manoel "
               "Jurandir Edgar Agenor Belarmino Cândido Durval Eurico Florêncio Gumercindo Honório Ismael Juvenal Leopoldo "
               "Moisés Nestor Olavo Pedro Paulo Quirino Romualdo Sinval Teodoro".split(),
    "f_idoso": "Conceição Aparecida Benedita Odete Terezinha Lourdes Dalva Neusa Marlene Cleusa Geni Ivone Nair Jandira "
               "Diva Glória Rosário Matilde Zilda Margarida Hilda Albertina Brígida Carmelita Dolores Eulália Filomena "
               "Guiomar Heloísa Isaura Jovelina Leonor Mercedes Nazaré Ofélia".split(),
    "m_jovem": "Kaique Pedro Henrique;João Vitor;Eduardo;Vitor Hugo;Luiz Felipe;Wesley;Kevin;Iago;Cauê;Arthur Miguel;"
               "Gustavo Henrique;Luca;Ruan;Juan;Davi Luiz;Enzo Gabriel;Rian;Bryan;Igor Lucas;Marcos Vinícius;Thales;"
               "Nathan;Alisson;Wallace;Patrick;Elton".replace("Kaique ", "Kaique;").split(";"),
    "f_jovem": "Yasmin;Maria Eduarda;Emily;Rebeca;Stefany;Kethlyn;Sofia;Isadora;Milena;Giulia;Ana Luiza;Duda;Thalita;"
               "Ana Clara;Bianca Vitória;Júlia;Lara Beatriz;Kauane;Ester;Raíssa;Maria Fernanda;Hadassa;Nicole;Mirella;"
               "Pietra Lorena;Ketlen".split(";"),
    "m_crianca": "Miguel Arthur Heitor Théo Gael Enzo Lorenzo Benício Ravi Joaquim Noah Pietro Anthony Vicente Isaac Caleb "
                 "Martim Otto Kalel Raul Ícaro Levi Guilherme Bento Tom Lucca Matteo Dante Frederico Apolo Zion Henry".split(),
    "f_crianca": "Alice Laura Cecília Valentina Heloíse Sophia Isis Antonella Lara Aurora Liz Mirela Esther Olívia Agatha "
                 "Clara Elisa Melissa Nina Jade Luna Mel Maria Clara;Manuela;Rafaela;Lis;Ana Lívia;Zoe;Catarina;Eloá;Maya".replace(
                     "Maria Clara;", "Maria_Clara ").replace(";", " ").split(),
}
NOMES["f_crianca"] = [n.replace("_", " ") for n in NOMES["f_crianca"]]
for k in NOMES:
    RNG.shuffle(NOMES[k])


def nome_para(corpo):
    sexo, faixa = E.CORPOS[corpo]
    chave = {"recem": "crianca", "colo": "crianca", "pequeno": "crianca", "crianca": "crianca", "adolescente": "jovem",
             "adulto": "adulto", "idoso": "idoso"}[faixa]
    pool = NOMES[f"{sexo}_{chave}"]
    while pool:
        n = pool.pop()
        if n not in USADOS:
            return n
    raise RuntimeError("faltam nomes " + chave)


# paletas harmoniosas: principal, secundária, acento (as neutras vêm de NEUTRAS)
PALETAS = [
    ("#2F6FD0", "#9CC3F0", "#F2A23C"), ("#D9433B", "#F2C2B8", "#2F5FD0"), ("#2FA84F", "#BFE3B4", "#F2C231"),
    ("#6A3FB5", "#C9B6EC", "#F2C231"), ("#E8559A", "#F7C6DC", "#3FA7D6"), ("#F27A22", "#F7CFA8", "#2F6FD0"),
    ("#1FA59A", "#A8E0D8", "#E8559A"), ("#C8442F", "#E8C9A0", "#3D5A8A"), ("#3D5A8A", "#AFC0DA", "#E8692A"),
    ("#8A52D6", "#E8D8F5", "#3BAA5C"), ("#F2C231", "#FBE7A6", "#6A3FB5"), ("#9B2335", "#E8B4BC", "#C9A46E"),
    ("#3FA7D6", "#C4E6F5", "#E8592A"), ("#5B8C3A", "#D1E3B8", "#B5651D"), ("#B5651D", "#EBC9A6", "#2F8F6A"),
    ("#24346B", "#9AA8D6", "#F2C231"), ("#E04A3A", "#F5E6C8", "#1FA59A"), ("#2F8F6A", "#B8E0CF", "#F07AA6"),
    ("#7B4B2D", "#E0C9A8", "#3FA7D6"), ("#4A6070", "#B8C6D0", "#F27A22"), ("#C2185B", "#F4B9CF", "#F2C231"),
    ("#3BAA5C", "#F2F2F2", "#2F5FD0"), ("#6B7A3A", "#DCE0B8", "#C8442F"), ("#5B2D8E", "#D6C2EC", "#3FC1B0"),
]
PASTEIS = [("#9CC3F0", "#F7C6DC", "#F2C231"), ("#BFE3B4", "#FBE7A6", "#3FA7D6"), ("#F7C6DC", "#C9B6EC", "#3BAA5C"),
           ("#FBE7A6", "#A8E0D8", "#E8559A"), ("#C4E6F5", "#F7CFA8", "#8A52D6"), ("#F7CFA8", "#BFE3B4", "#2F6FD0"),
           ("#C9B6EC", "#C4E6F5", "#F27A22"), ("#A8E0D8", "#F7C6DC", "#F2A23C")]
SOBRIAS = [("#3D5A8A", "#C9D6E3", "#9B2335"), ("#7B4B2D", "#E8E0D0", "#2F6FD0"), ("#5B6370", "#D8CFC4", "#C8442F"),
           ("#2F8F6A", "#E8E0D0", "#B5651D"), ("#9B2335", "#E8E0D0", "#24346B"), ("#6B7A3A", "#E0D8C0", "#3D5A8A"),
           ("#8A52D6", "#E8E0D0", "#5B6370"), ("#1FA59A", "#F2F2F2", "#7B4B2D"), ("#B5651D", "#F2E6C8", "#4A6070"),
           ("#4A6070", "#C9D6E3", "#C9A46E"), ("#C2185B", "#E8E0D0", "#5B6370"), ("#24346B", "#C9A46E", "#F2F2F2")]
NEUTRAS = ["#2B2B2B", "#F2F2F2", "#8A8F99", "#24346B", "#C9A46E", "#7B4B2D", "#3D5A8A", "#5B6370", "#E8E0D0", "#3A3F4B"]


def paleta(faixa):
    lista = PASTEIS + PALETAS[:12] if faixa in ("colo", "pequeno") else SOBRIAS if faixa == "idoso" else PALETAS
    p, s, a = RNG.choice(lista)
    n1, n2 = RNG.sample(NEUTRAS if faixa not in ("colo", "pequeno") else ["#F2F2F2", "#E8E0D0", "#C9D6E3", "#D8CFC4", "#3D5A8A"], 2)
    return {"P": p, "S": s, "A": a, "N": n1, "N2": n2}


# estilos: slot -> (opções, papel da cor, chance); papel da cor: P, S, A, N, N2, None (cor do catálogo) ou "#hex"
# os slots "dir"/"esq" são objetos de mão; "@anim" lista animações sugeridas (filtradas pelo que o corpo tem)
def n(*ids):
    return ["nov_" + i if not i.startswith(("roupa_", "var_", "gen_")) else i for i in ids]


TENIS = n("roupa_tenis_009", "roupa_tenis_plus", "tenis_meia")
SAPATOS = n("roupa_sapato_seguranca", "roupa_tenis_xadrez1", "roupa_sapato_caixa", "roupa_sapato_36")
IDLE = ["resident.idle.neutral", "resident.idle.happy", "resident.idle.look_around", "resident.talk.listen"]
ESTILOS = {
    "Básico": {"cima": (n("camiseta_justa", "camiseta_larga", "polo", "regata_justa", "manga_longa", "camiseta_faixa"), "P", 1),
               "baixo": (n("calca_jeans", "bermuda_folgada", "calca_cargo", "short_curto", "var_bermuda_azul", "calca_social"), "N", 1),
               "pes": (TENIS, "A", 1), "cabeca": (n("bone_novo", "bone_duas_cores", "bone_tras"), "S", 0.2),
               "@anim": IDLE + ["resident.idle.bored"]},
    "Jeans e jaqueta": {"cima": (n("camiseta_justa", "gola_alta", "camiseta_larga"), "S", 1), "sobre": (n("jaqueta_aberta", "camisa_aberta"), "P", 1),
                        "baixo": (n("calca_jeans", "calca_rasgada"), "N", 1), "pes": (n("roupa_tenis_009", "roupa_bota_sobrevivente", "var_bota_cano_curto"), "N2", 1),
                        "oculos": (n("oculos_sol_redondos", "roupa_oculos_seguranca"), "#2B2B2B", 0.25), "@anim": IDLE},
    "Social leve": {"cima": (n("camisa_social", "camisa_uniforme"), "S", 1), "baixo": (n("calca_social"), "N", 1),
                    "sobre": (n("cardiga", "paleto", "paleto_listrado"), "P", 0.5), "pescoco_peca": (n("gravata"), "A", 0.3),
                    "pes": (n("roupa_sapato_seguranca", "roupa_tenis_xadrez1"), None, 1),
                    "dir": (n("cafe", "celular", "jornal"), "#2B2B2B", 0.4), "@anim": ["resident.idle.neutral", "resident.talk.listen", "resident.phone.talk"]},
    "Esportivo": {"cima": (n("agasalho", "agasalho_listrado", "top_esportivo", "regata_faixa", "camiseta_faixa"), "P", 1),
                  "baixo": (n("calca_moletom", "calca_agasalho_listrada", "legging", "bermuda_ciclista", "short_curto"), "N", 1),
                  "pes": (n("roupa_tenis_009", "tenis_meia"), "A", 1), "cabeca": (n("bone_novo", "faixa_cabeca", "viseira"), "A", 0.35),
                  "dir": (n("garrafa_agua"), "A", 0.25), "esq": (n("bolsa_academia"), "S", 0.25),
                  "@anim": ["resident.idle.neutral", "resident.idle.happy", "resident.stretch"]},
    "Praia": {"cima": (n("camisa_floral", "camisa_folhas", "regata_justa", "camiseta_larga"), "P", 1),
              "baixo": (n("bermuda_praia", "short_praia", "short_curto", "bermuda_folgada"), "S", 1),
              "pes": (n("roupa_chinelo_002", "roupa_chinelo_005"), "A", 1), "cabeca": (n("chapeu_praia", "chapeu_palha", "balde", "bone_novo"), "A", 0.55),
              "oculos": (n("oculos_sol_redondos", "oculos_esportivos"), "#2B2B2B", 0.5),
              "dir": (n("bola_praia", "sorvete", "picole", "garrafa"), None, 0.35), "@anim": ["resident.idle.happy", "resident.idle.look_around"]},
    "Biquíni": {"cima": (n("top_biquini"), "P", 1), "baixo": (n("biquini_baixo"), "P", 1), "sobre": (n("camisa_aberta"), "S", 0.4),
                "pes": (n("roupa_chinelo_005", "roupa_chinelo_002"), "A", 1), "cabeca": (n("chapeu_praia", "abas_largas"), "S", 0.6),
                "oculos": (n("oculos_sol_redondos", "oculos_gatinho"), "#2B2B2B", 0.6), "@anim": ["resident.idle.happy"]},
    "Maiô": {"inteira": (n("maio", "maio_listrado"), "P", 1), "pes": (n("roupa_chinelo_005"), "A", 1),
             "cabeca": (n("chapeu_praia", "chapeu_palha"), "S", 0.5), "oculos": (n("oculos_sol_redondos"), "#2B2B2B", 0.5),
             "@anim": ["resident.idle.happy", "resident.idle.neutral"]},
    "Inverno": {"cima": (n("acolchoada", "acolchoada_capuz", "moletom_capuz", "jaqueta_aviador"), "P", 1),
                "baixo": (n("calca_jeans", "calca_social", "calca_moletom"), "N", 1),
                "pes": (n("bota_alta", "var_bota_cano_curto", "galocha", "roupa_bota_noel"), "N2", 1),
                "cabeca": (n("touca", "touca_pompom", "aviador_inverno", "boina"), "S", 0.75),
                "pescoco_peca": (n("cachecol"), "A", 0.6), "maos": (n("luvas_justas"), "A", 0.4),
                "dir": (n("cafe"), None, 0.2), "@anim": ["resident.idle.neutral", "resident.idle.look_around"]},
    "Casaco longo": {"cima": (n("gola_alta", "manga_longa", "camisa_social"), "N2", 1), "sobre": (n("casaco_longo"), "P", 1),
                     "baixo": (n("calca_social", "calca_jeans"), "N", 1), "pes": (n("bota_alta", "roupa_sapato_seguranca"), None, 1),
                     "cabeca": (n("boina", "fedora"), "S", 0.4), "pescoco_peca": (n("cachecol", "lenco"), "A", 0.4),
                     "esq": (n("bolsa_tote", "pasta_couro"), "S", 0.3), "@anim": IDLE},
    "Chuva": {"cima": (n("camiseta_justa", "moletom", "manga_longa"), "S", 1), "sobre": (n("capa_chuva"), "P", 1),
              "baixo": (n("calca_jeans", "calca_social"), "N", 1), "pes": (n("galocha"), "A", 1),
              "dir": (n("guarda_chuva_aberto", "guarda_chuva_colorido", "guarda_chuva_listrado", "guarda_chuva"), "A", 0.85),
              "cabeca": (n("balde"), "P", 0.2), "@anim": ["resident.idle.neutral", "resident.idle.look_around"]},
    "Vestido": {"inteira": (n("gen_vestido_casual", "gen_vestido_midi", "vestido_manga_curta", "vestido_xadrez", "vestido_gola",
                              "vestido_manga", "vestido_tubinho", "gen_vestido_justo", "vestido_um_ombro", "gen_vestido_longo"), "P", 1),
                "pes": (n("roupa_salto_showgirl", "roupa_sapato_caixa", "roupa_tenis_009", "roupa_chinelo_005"), "N", 1),
                "esq": (n("bolsa", "bolsa_alca", "bolsa_fecho", "bolsa_tote"), "S", 0.5), "dir": (n("buque", "celular"), None, 0.15),
                "cintura": (n("cinto_fivela"), "N", 0.2), "cabeca": (n("chapeu_praia", "abas_largas", "arco"), "S", 0.25),
                "oculos": (n("oculos_gatinho", "oculos_sol_redondos"), "#2B2B2B", 0.2), "pescoco": (n("roupa_corrente_plus"), None, 0.15),
                "@anim": ["resident.idle.happy", "resident.idle.neutral", "resident.talk.a"]},
    "Saia": {"cima": (n("cropped_manga", "camiseta_justa", "blusa_listrada", "tomara_que_caia", "var_cropped", "manga_longa", "regata_justa"), "P", 1),
             "baixo": (n("gen_minissaia", "gen_saia_rodada", "gen_saia_lapis", "gen_saia_midi", "gen_saia_longa"), "S", 1),
             "meias": (n("meia_calca"), "N", 0.25), "pes": (n("roupa_tenis_009", "roupa_sapato_caixa", "roupa_salto_showgirl", "bota_alta"), "N2", 1),
             "esq": (n("bolsa", "bolsa_fecho", "bolsa_alca"), "A", 0.4), "cabeca": (n("arco", "boina"), "A", 0.2),
             "@anim": ["resident.idle.happy", "resident.idle.neutral", "resident.text"]},
    "Retrô": {"cima": (n("camisa_listrada_vertical", "camisa_ziguezague", "gola_alta"), "P", 1), "baixo": (n("calca_boca_sino", "calca_social"), "S", 1),
              "oculos": (n("oculos_redondos"), "A", 0.7), "pes": (n("roupa_sapato_36", "roupa_sapato_seguranca"), None, 1),
              "cabeca": (n("var_chapeu_coco", "palheta"), "N", 0.2), "@anim": ["resident.idle.happy", "resident.idle.neutral"]},
    "Roqueiro": {"cima": (n("camisa_caveira"), "N", 1), "sobre": (n("jaqueta_aberta"), "#2B2B2B", 0.6),
                 "baixo": (n("calca_rasgada", "calca_jeans", "short_curto"), "#2B2B2B", 1), "pes": (n("roupa_bota_sobrevivente", "bota_alta"), "#2B2B2B", 1),
                 "oculos": (n("oculos_sol_redondos"), "#2B2B2B", 0.5), "meias": (n("meia_arrastao_coxa"), "#2B2B2B", 0.25),
                 "esq": (n("estojo_violao"), "#2B2B2B", 0.3), "@anim": ["resident.idle.neutral", "resident.idle.bored"]},
    "Estampado": {"cima": (n("camisa_onca", "camisa_caveira", "camisa_folhas", "camisa_floral", "camisa_ziguezague", "camisa_listrada_vertical"), "P", 1),
                  "baixo": (n("calca_social", "calca_jeans", "bermuda_folgada", "calca_cargo"), "N", 1), "pes": (TENIS + SAPATOS[:1], "N2", 1),
                  "oculos": (n("oculos_sol_redondos", "oculos_redondos"), "#2B2B2B", 0.3), "dir": (n("cafe", "celular"), "#2B2B2B", 0.3),
                  "@anim": ["resident.idle.happy", "resident.idle.neutral", "resident.text"]},
    "Colegial": {"cima": (n("jaqueta_colegial", "moletom", "polo", "moletom_capuz"), "P", 1), "baixo": (n("calca_jeans", "bermuda_folgada"), "N", 1),
                 "costas": (n("roupa_mochila"), None, 0.7), "pes": (TENIS, "A", 1), "dir": (n("livro", "caderno", "celular"), None, 0.35),
                 "@anim": ["resident.idle.neutral", "resident.idle.happy", "resident.text"]},
    "Jardineira": {"cima": (n("camiseta_justa", "blusa_listrada", "manga_longa"), "S", 1), "inteira": (n("jardineira", "jardineira_short"), "P", 1),
                   "pes": (n("roupa_tenis_plus", "roupa_tenis_009", "tenis_meia"), "A", 1), "cabeca": (n("bone_novo", "chapeu_palha"), "A", 0.25),
                   "@anim": ["resident.idle.happy", "resident.idle.neutral"]},
    "Macacão": {"inteira": (n("macacao"), "P", 1), "pes": (TENIS, "N", 1), "cintura": (n("cinto"), "#2B2B2B", 0.3),
                "oculos": (n("oculos_sol_redondos"), "#2B2B2B", 0.25), "@anim": ["resident.idle.neutral", "resident.idle.happy"]},
    "Executivo": {"cima": (n("camisa_social"), "S", 1), "sobre": (n("paleto", "paleto_listrado"), "N", 1), "baixo": (n("calca_social", "gen_saia_lapis"), "N", 1),
                  "pescoco_peca": (n("gravata"), "P", 0.6), "pes": (n("roupa_sapato_seguranca", "roupa_sapato_caixa"), None, 1),
                  "esq": (n("maleta", "maleta_rigida", "pasta_couro", "pasta_notebook"), "#2B2B2B", 0.7), "dir": (n("celular", "cafe"), "#2B2B2B", 0.3),
                  "@anim": ["resident.idle.neutral", "resident.phone.talk", "resident.talk.listen"]},
    "Compras": {"cima": (n("camiseta_larga", "camisa_onca", "polo", "camiseta_justa"), "P", 1), "baixo": (n("calca_jeans", "calca_boca_sino", "calca_social"), "N", 1),
                "pes": (TENIS + n("roupa_salto_showgirl"), "N2", 1), "esq": (n("sacolas", "sacola_loja", "sacola_papel"), "S", 1),
                "oculos": (n("oculos_gatinho", "oculos_sol_redondos"), "#2B2B2B", 0.4), "@anim": ["resident.idle.happy", "resident.idle.look_around"]},
    "Viajante": {"cima": (n("moletom_capuz", "camisa_floral", "camiseta_larga"), "P", 1), "baixo": (n("calca_jeans", "bermuda_folgada"), "N", 1),
                 "esq": (n("mala_rodinha", "mala_frisos"), "S", 1), "cabeca": (n("bone_novo", "chapeu_palha"), "A", 0.4), "pes": (TENIS, "N2", 1),
                 "@anim": ["resident.idle.look_around", "resident.idle.neutral"]},
    "Leitor": {"cima": (n("gola_alta", "camisa_social", "manga_longa"), "S", 1), "sobre": (n("cardiga"), "P", 1), "baixo": (n("calca_social", "calca_jeans"), "N", 1),
               "oculos": (n("oculos_quadrados", "oculos_redondos"), "#2B2B2B", 0.8), "pes": (SAPATOS[:3], None, 1), "dir": (n("livro"), None, 1),
               "@anim": ["resident.read.stand"]},
    "Com o cachorro": {"cima": (n("moletom", "camiseta_larga", "polo", "acolchoada"), "P", 1), "baixo": (n("calca_jeans", "calca_moletom", "legging"), "N", 1),
                       "pes": (TENIS, "A", 1), "dir": (n("guia_retratil"), "A", 1), "cabeca": (n("bone_novo", "touca"), "S", 0.3),
                       "@anim": ["resident.idle.neutral", "resident.idle.look_around"]},
    "Ao celular": {"cima": (n("camiseta_justa", "camiseta_larga", "moletom", "cropped_manga", "polo"), "P", 1),
                   "baixo": (n("calca_jeans", "calca_cargo", "short_curto", "bermuda_rasgada"), "N", 1), "pes": (TENIS, "A", 1),
                   "dir": (n("celular"), "#2B2B2B", 1), "fones": None, "orelhas": (n("roupa_fones_002"), "#F2F2F2", 0.3),
                   "@anim": ["resident.phone.talk", "resident.text"]},
    "Músico": {"cima": (n("camiseta_larga", "camisa_caveira", "var_jaqueta_manga_curta"), "P", 1), "baixo": (n("calca_jeans", "calca_rasgada"), "N", 1),
               "costas": (n("roupa_violao_costas"), None, 0.5), "esq": (n("estojo_violao"), "#2B2B2B", 1), "pes": (TENIS, "N2", 1),
               "@anim": ["resident.idle.neutral", "resident.idle.happy"]},
    "Fotógrafo": {"cima": (n("camisa_folhas", "camiseta_justa", "polo"), "P", 1), "sobre": (n("colete_utilidades", "jaqueta_aberta"), "N", 0.4),
                  "baixo": (n("bermuda_folgada", "calca_cargo"), "N2", 1), "pes": (TENIS, "A", 1), "dir": (n("camera"), "#2B2B2B", 1),
                  "cabeca": (n("balde", "bone_novo", "chapeu_palha"), "S", 0.5), "@anim": ["resident.idle.look_around", "resident.idle.neutral"]},
}
# crianças e bebês
ESTILOS_CRIANCA = {
    "Brincando": {"cima": (n("camiseta_larga", "polo", "blusa_listrada", "moletom", "agasalho", "camiseta_faixa", "regata_faixa"), "P", 1),
                  "baixo": (n("bermuda_folgada", "short_curto", "calca_moletom", "calca_jeans", "var_short_verde"), "N", 1),
                  "pes": (TENIS + n("galocha"), "A", 1), "cabeca": (n("bone_novo", "bone_helice", "bone_tras", "balde", "bone_duas_cores"), "S", 0.35),
                  "dir": (n("bola_futebol", "bola_praia", "sorvete", "picole", "bola_basquete"), None, 0.4),
                  "@anim": ["resident.idle.happy", "resident.wave", "resident.emote.excited", "resident.idle.neutral"]},
    "Vestidinho": {"inteira": (n("vestido_manga_curta", "vestido_gola", "gen_vestido_casual", "vestido_xadrez", "macaquinho_listrado", "jardineira_short"), "P", 1),
                   "meias": (n("meias_altas"), "N", 0.3), "pes": (n("roupa_tenis_009", "tenis_meia", "galocha"), "A", 1),
                   "cabeca": (n("arco", "tiara", "chapeu_praia"), "S", 0.4), "dir": (n("sorvete", "buque", "picole"), None, 0.3),
                   "esq": (n("balao", "bolsa"), "A", 0.25), "@anim": ["resident.idle.happy", "resident.wave", "resident.idle.neutral"]},
    "Fantasia": {"cima": (n("moletom", "manga_longa", "agasalho"), "P", 1), "baixo": (n("calca_moletom", "legging"), "P", 1),
                 "cabeca": (n("sapo", "gatinho", "touca_urso"), "P", 1), "pes": (n("galocha", "roupa_tenis_009"), "A", 1),
                 "@anim": ["resident.idle.happy", "resident.emote.excited", "resident.dance.silly"]},
    "Escola": {"cima": (n("polo", "camiseta_justa", "jaqueta_colegial"), "P", 1), "baixo": (n("calca_jeans", "bermuda_folgada", "calca_moletom", "gen_saia_rodada"), "N", 1),
               "costas": (n("roupa_mochila"), None, 0.8), "pes": (TENIS, "A", 1), "dir": (n("livro", "caderno", "tablet"), None, 0.4),
               "@anim": ["resident.idle.neutral", "resident.idle.happy", "resident.wave"]},
    "Inverninho": {"cima": (n("acolchoada", "acolchoada_capuz", "moletom_capuz"), "P", 1), "baixo": (n("calca_moletom", "calca_jeans", "legging"), "N", 1),
                   "cabeca": (n("touca_pompom", "touca", "touca_urso"), "S", 0.8), "pescoco_peca": (n("cachecol"), "A", 0.5),
                   "maos": (n("luvas_justas"), "A", 0.4), "pes": (n("galocha", "bota_alta"), "A", 1),
                   "@anim": ["resident.idle.neutral", "resident.idle.happy"]},
    "Praia kids": {"cima": (n("regata_justa", "camiseta_larga", "regata_faixa"), "P", 1), "baixo": (n("short_praia", "short_curto", "bermuda_folgada"), "S", 1),
                   "cabeca": (n("chapeu_praia", "balde", "bone_novo"), "A", 0.6), "cotovelos": (n("boias_braco"), "#F2A23C", 0.35),
                   "pes": (n("roupa_chinelo_002", "roupa_chinelo_005"), "A", 1), "dir": (n("bola_praia", "picole", "sorvete"), None, 0.5),
                   "@anim": ["resident.idle.happy", "resident.emote.excited"]},
    "Maiô kids": {"inteira": (n("maio", "maio_listrado"), "P", 1), "cotovelos": (n("boias_braco"), "#F2A23C", 0.5),
                  "cabeca": (n("chapeu_praia", "balde"), "S", 0.5), "dir": (n("bola_praia"), None, 0.3),
                  "@anim": ["resident.idle.happy", "resident.emote.excited"]},
    "Jardineira kids": {"cima": (n("camiseta_justa", "blusa_listrada", "manga_longa"), "S", 1), "inteira": (n("jardineira", "jardineira_short"), "P", 1),
                        "pes": (TENIS, "A", 1), "cabeca": (n("bone_novo", "chapeu_palha", "bone_helice"), "A", 0.3),
                        "@anim": ["resident.idle.happy", "resident.wave"]},
}
ESTILOS_BEBE = {
    "Conjuntinho": {"cima": (E.BEBE["cima"], "P", 1), "baixo": (E.BEBE["baixo"], "S", 1), "pes": (E.BEBE["pes"], "A", 0.5),
                    "meias": (E.BEBE["meias"], "N", 0.3), "cabeca": (E.BEBE["cabeca"], "S", 0.35)},
    "Macacãozinho": {"inteira": (E.BEBE["inteira"], "P", 1), "cima": (E.BEBE["cima"], "S", 0.5), "pes": (E.BEBE["pes"], "A", 0.5),
                     "meias": (E.BEBE["meias"], "N", 0.3), "cabeca": (E.BEBE["cabeca"], "S", 0.35)},
}
ESTILOS_IDOSO = {
    "Clássico": {"cima": (n("camisa_social", "camisa_uniforme", "polo", "camisa_xadrez_folgada"), "S", 1), "sobre": (n("cardiga", "paleto", "jaqueta_aberta"), "P", 0.55),
                 "baixo": (n("calca_social", "calca_jeans", "calca_cargo"), "N", 1), "alcas": (n("suspensorio"), "A", 0.2),
                 "cabeca": (n("palheta", "fedora", "boina", "chapeu_palha", "var_chapeu_coco"), "N2", 0.45),
                 "oculos": (n("oculos_redondos", "oculos_quadrados", "roupa_oculos_noel"), "#2B2B2B", 0.55),
                 "pes": (n("roupa_sapato_seguranca", "roupa_tenis_xadrez1", "roupa_tenis_009"), None, 1),
                 "dir": (n("bengala", "jornal", "livro", "cafe", "guia_retratil"), None, 0.6),
                 "@anim": ["resident.idle.neutral", "resident.idle.happy", "resident.read.stand", "resident.talk.listen"]},
    "Vestido de vó": {"inteira": (n("vestido_gola", "vestido_manga", "gen_vestido_midi", "vestido_manga_curta", "vestido_xadrez", "gen_vestido_longo"), "P", 1),
                      "sobre": (n("cardiga"), "S", 0.35), "meias": (n("meia_calca"), "N", 0.4),
                      "oculos": (n("oculos_redondos", "oculos_gatinho", "roupa_oculos_noel"), "#2B2B2B", 0.6),
                      "cabeca": (n("chapeu_praia", "abas_largas", "boina"), "S", 0.2),
                      "pes": (n("roupa_sapato_caixa", "roupa_tenis_009"), "N", 1),
                      "esq": (n("bolsa_perolas", "bolsa_fecho", "sacola_papel", "bolsa"), "N2", 0.45), "dir": (n("bengala", "buque", "livro"), None, 0.4),
                      "pescoco": (n("roupa_corrente_plus"), None, 0.2), "@anim": ["resident.idle.neutral", "resident.idle.happy", "resident.talk.listen"]},
    "Saia e blusa": {"cima": (n("manga_longa", "gola_alta", "camisa_social", "blusa_listrada"), "S", 1), "sobre": (n("cardiga", "casaco_longo"), "P", 0.5),
                     "baixo": (n("gen_saia_midi", "gen_saia_longa", "calca_social"), "N", 1), "oculos": (n("oculos_redondos", "oculos_gatinho"), "#2B2B2B", 0.5),
                     "pes": (n("roupa_sapato_caixa", "roupa_tenis_009"), "N2", 1), "pescoco_peca": (n("lenco", "cachecol"), "A", 0.3),
                     "esq": (n("bolsa_perolas", "bolsa_fecho", "sacola_papel"), "A", 0.4), "@anim": ["resident.idle.neutral", "resident.read.stand"]},
    "Agasalho": {"cima": (n("agasalho", "agasalho_listrado", "moletom", "acolchoada"), "P", 1), "baixo": (n("calca_moletom", "calca_agasalho_listrada", "calca_jeans"), "N", 1),
                 "pes": (n("roupa_tenis_009", "tenis_meia"), "#F2F2F2", 1), "cabeca": (n("bone_novo", "viseira", "touca"), "S", 0.4),
                 "dir": (n("garrafa_agua", "guia_retratil", "bengala"), None, 0.35), "@anim": ["resident.idle.neutral", "resident.idle.happy"]},
    "Praia de idoso": {"cima": (n("camisa_floral", "camisa_folhas", "camiseta_larga"), "P", 1), "baixo": (n("bermuda_folgada", "var_bermuda_social"), "N", 1),
                       "cabeca": (n("chapeu_palha", "palheta", "chapeu_praia"), "S", 0.8), "oculos": (n("oculos_sol_redondos"), "#2B2B2B", 0.5),
                       "pes": (n("roupa_chinelo_002", "roupa_chinelo_005"), "A", 1), "dir": (n("sorvete", "cafe", "jornal"), None, 0.3),
                       "@anim": ["resident.idle.happy", "resident.idle.look_around"]},
    "Frio de idoso": {"cima": (n("gola_alta", "manga_longa", "camisa_social"), "N2", 1), "sobre": (n("casaco_longo", "cardiga"), "P", 1),
                      "baixo": (n("calca_social"), "N", 1), "cabeca": (n("boina", "touca", "fedora"), "S", 0.6), "pescoco_peca": (n("cachecol"), "A", 0.6),
                      "pes": (n("roupa_sapato_seguranca", "bota_alta", "roupa_sapato_caixa"), None, 1), "dir": (n("bengala", "guarda_chuva"), None, 0.4),
                      "@anim": ["resident.idle.neutral", "resident.idle.look_around"]},
}
# estilos por faixa (com pesos)
POR_FAIXA = {
    "adolescente": [("Básico", 3), ("Jeans e jaqueta", 2), ("Esportivo", 2), ("Praia", 1), ("Biquíni", 0.6), ("Inverno", 1), ("Chuva", 1),
                    ("Vestido", 1.2), ("Saia", 1.5), ("Retrô", 0.6), ("Roqueiro", 1), ("Estampado", 1), ("Colegial", 3),
                    ("Jardineira", 1), ("Ao celular", 2), ("Músico", 0.6), ("Fotógrafo", 0.4)],
    "adulto": [("Básico", 3), ("Jeans e jaqueta", 2), ("Social leve", 2), ("Esportivo", 2), ("Praia", 1.5), ("Biquíni", 0.6), ("Maiô", 0.4),
               ("Inverno", 1.2), ("Casaco longo", 1), ("Chuva", 1), ("Vestido", 2), ("Saia", 1.5), ("Retrô", 0.8), ("Roqueiro", 0.8),
               ("Estampado", 1.5), ("Jardineira", 0.6), ("Macacão", 0.6), ("Executivo", 1.2), ("Compras", 1.2), ("Viajante", 1),
               ("Leitor", 0.8), ("Com o cachorro", 1), ("Ao celular", 1.5), ("Músico", 0.5), ("Fotógrafo", 0.6)],
}


def tom_cabelo(pele, faixa):
    if faixa == "idoso":
        return RNG.choices(["Grisalho", "#E6E2DA", "#D9D9D6", "Castanho", "Preto"], [55, 15, 12, 10, 8])[0]
    if pele in ESCURAS:
        c = RNG.choices(["Preto", "Castanho", "Castanho claro", "Loiro", "Ruivo"], [52, 32, 9, 4, 3])[0]
    else:
        c = RNG.choices(["Preto", "Castanho", "Castanho claro", "Loiro", "Ruivo"], [18, 30, 20, 20, 12])[0]
    if faixa in ("adolescente", "adulto") and RNG.random() < 0.05:
        c = RNG.choice(["#C2185B", "#3D7BD6", "#7A4FC4", "#2E9C80", "#E07A2E"])
    return c


CAB_CURTOS = ["cabelo_xadrez1", "cabelo_plus", "cabelo_lenhador", "cabelo_seguranca", "cabelo_xadrez2", "cabelo_criativo10",
              "cabelo_criativo12", "cabelo_xadrez1_volume", "cabelo_seguranca_volume", "cabelo_xadrez2_volume",
              "cabelo_criativo10_volume", "cabelo_lenhador_volume", "afro_curto", "espetado", "espetado_alto", "moicano",
              "topete_moicano", "cabelo_raspado"]
CAB_LONGOS = ["cabelo_caixa", "cabelo_caixa_comprido", "cabelo_caixa_volume", "cabelo_showgirl", "cabelo_showgirl_comprido",
              "cabelo_sobrevivente", "cabelo_sobrevivente_comprido", "cabelo_criativo12_comprido", "cabelo_noel", "rabo_cavalo",
              "rabo_curto", "rabo_alto", "coque", "coque_franja", "coque_duplo", "trancas", "maria_chiquinha", "afro", "afro_coque",
              "cabelo_criativo10_comprido", "cabelo_xadrez2_comprido"]
CAB_LONGOS_M = ["rabo_curto", "coque", "cabelo_noel", "afro", "cabelo_criativo12_comprido", "cabelo_sobrevivente"]
CAB_CURTOS_F = ["cabelo_seguranca", "afro_curto", "cabelo_xadrez2", "cabelo_criativo12", "cabelo_seguranca_volume",
                "cabelo_criativo10"]
CRESPOS = ["afro", "afro_curto", "afro_coque", "cabelo_criativo10", "cabelo_criativo10_volume", "cabelo_criativo10_comprido",
           "trancas", "cabelo_raspado"]


def penteado(corpo, pele):
    sexo, faixa = E.CORPOS[corpo]
    crespo = pele in ESCURAS and RNG.random() < 0.55
    if faixa == "colo":
        l = ["cabelo", "cabelo", "cabelo_seguranca", "cabelo_criativo10", "afro_curto"] if sexo == "m" else \
            ["cabelo", "maria_chiquinha", "rabo_curto", "afro_curto", "cabelo_criativo12", "coque_duplo"]
        return RNG.choice(l)
    if sexo == "m":
        if faixa == "idoso" and RNG.random() < 0.3:
            return "careca"
        if faixa == "adulto" and RNG.random() < 0.08:
            return "careca"
        if crespo:
            l = [c for c in CRESPOS if c not in ("trancas",) or faixa in ("crianca", "adolescente")]
        else:
            l = CAB_LONGOS_M if RNG.random() < 0.1 else CAB_CURTOS
    else:
        if crespo:
            l = ["afro", "afro_coque", "trancas", "cabelo_criativo10_comprido", "afro_curto", "coque", "rabo_cavalo"]
        else:
            l = CAB_CURTOS_F if RNG.random() < 0.15 else CAB_LONGOS
    if faixa in ("pequeno", "crianca"):
        l = [c for c in l if c not in ("moicano", "espetado_alto", "cabelo_noel")] or l
    l = [c for c in l if E.penteado_serve(c, corpo) is None]
    return RNG.choice(l)


def barba(corpo):
    if E.barba_serve("barba", corpo):
        return "nenhum"
    q = 0.45 if E.CORPOS[corpo][1] == "idoso" else 0.33
    return RNG.choice(sorted(E.BARBAS)) if RNG.random() < q else "nenhum"


def cor_de(papel, pal, rid):
    if papel is None:
        return None
    if papel.startswith("#"):
        return papel
    return pal[papel]


def veste(corpo, estilo, pal):
    """Uma peça por slot, só o que serve no corpo; a inteira tira cima e baixo (menos a jardineira, que deixa a blusa)."""
    roupa, obj = {}, {}
    ordem = sorted((k for k in estilo if not k.startswith("@") and estilo[k]), key=lambda k: k != "inteira")
    cobertos = set()
    for slot in ordem:
        ops, papel, chance = estilo[slot]
        if slot in cobertos or RNG.random() > chance:
            continue
        ops = [r for r in ops if E.serve(r, corpo) is None and r in E.ITENS]
        if slot not in ("dir", "esq"):
            ops = [r for r in ops if E.ITENS[r].get("slot") == slot]
        if not ops:
            continue
        rid = RNG.choice(ops)
        v = {"id": rid, "cor": cor_de(papel, pal, rid)}
        if slot in ("dir", "esq"):
            lado = E.ITENS[rid]["slot"][4:]  # a mão do catálogo (a guia retrátil vai na esquerda)
            if lado not in obj:
                obj[lado] = v
        else:
            roupa[slot] = v
        if slot == "inteira":
            cobertos |= set(E.cobre(rid))
    # parte de baixo obrigatória se não houver inteira (menos maiô/biquíni já resolvidos no estilo)
    return roupa, obj


def casual(corpo, pele, faixa_estilos, pesos=None, gravidez=0, papel=None):
    sexo, faixa = E.CORPOS[corpo]
    nome = nome_para(corpo)
    if faixa == "recem":
        tipo = RNG.choices(["baixinho", "careca", "gorro"], [5, 2, 3])[0]
        return pessoa("criancas", "Recém-nascido" if sexo == "m" else "Recém-nascida", corpo, pele, nome,
                      RNG.choices(["dormindo", "neutro", "feliz"], [4, 3, 3])[0],
                      (tipo, "Castanho claro" if RNG.random() < 0.5 else tom_cabelo(pele, "crianca")),
                      manta=RNG.choice(list(E.MANTA_CORES)), chupeta=RNG.random() < 0.5)
    for _ in range(60):
        nomes = [k for k, _ in faixa_estilos]
        est_nome = RNG.choices(nomes, [w for _, w in faixa_estilos])[0]
        estilo = {**ESTILOS, **ESTILOS_CRIANCA, **ESTILOS_BEBE, **ESTILOS_IDOSO}[est_nome]
        pal = paleta(faixa)
        roupa, obj = veste(corpo, estilo, pal)
        tem_inteira = "inteira" in roupa
        if not tem_inteira and ("cima" not in roupa and sexo == "f" and faixa not in ("colo",)):
            continue
        if not tem_inteira and "baixo" not in roupa:
            continue
        if "inteira" in roupa and "cima" in roupa and "cima" in E.cobre(roupa["inteira"]["id"]):
            roupa.pop("cima")
        assin = (corpo, tuple(sorted((k, v["id"]) for k, v in roupa.items())))
        if assin in ASSINATURAS:
            continue
        ASSINATURAS.add(assin)
        break
    else:
        raise RuntimeError("sem combinação nova para " + corpo)
    cab = (penteado(corpo, pele), tom_cabelo(pele, faixa), barba(corpo))
    anims = [a for a in estilo.get("@anim", []) if E.anim_existe(a, corpo, gravidez)]
    if faixa == "colo":
        anims = [a for a in ("resident.baby.sit", "resident.baby.crawl", "resident.sit.clap") if E.anim_existe(a, corpo)]
    if faixa == "idoso":
        anims = [a for a in anims] or ["resident.idle.neutral"]
    if obj.get("dir", {}).get("id") == "nov_bengala":
        anims = ["resident.idle.old"]
    if obj.get("dir", {}).get("id") == "nov_livro" and E.anim_existe("resident.read.stand", corpo):
        anims = ["resident.read.stand"]
    if obj.get("dir", {}).get("id") == "nov_celular":
        anims = [a for a in ("resident.phone.talk", "resident.text") if E.anim_existe(a, corpo)] or anims
    if obj.get("dir", {}).get("id") == "nov_tablet" and E.anim_existe("resident.device.use", corpo):
        anims = ["resident.device.use"]
    if gravidez >= 2:
        anims = ["resident.gravida.belly_hold", "resident.gravida.back_hold"]
    anim = RNG.choice(anims or ["resident.idle.neutral"])
    if faixa == "colo":
        expr = RNG.choices(["feliz", "neutro", "surpreso", "dormindo"], [5, 3, 1, 0.5])[0]
    else:
        expr = RNG.choices(["feliz", "neutro", "confiante", "serio", "surpreso", "aborrecido", "confuso"],
                           [5, 3, 2.2, 1.4, 0.5, 0.35, 0.35])[0]
    if anim == "resident.read.stand":
        expr = RNG.choice(["neutro", "serio", "feliz"])
    grupo = {"colo": "criancas", "pequeno": "criancas", "crianca": "criancas", "adolescente": "jovens",
             "adulto": "adultos", "idoso": "idosos"}[faixa]
    kw = {k: (v["id"], v["cor"]) for k, v in roupa.items()}
    kw.update({k: (v["id"], v["cor"]) for k, v in obj.items()})
    return pessoa(grupo, papel or est_nome, corpo, pele, nome, expr, cab, anim, gravidez=gravidez,
                  paleta=[pal["P"], pal["S"], pal["A"], pal["N"], pal["N2"]], **kw)


ASSINATURAS = set()
for p in PR:
    ASSINATURAS.add((p["corpo"], tuple(sorted((k, v["id"]) for k, v in p.get("roupa", {}).items()))))


def peles(nn):
    """nn tons bem distribuídos (todos os sete, em ordem embaralhada)."""
    l = (PELES * (nn // len(PELES) + 1))[:nn]
    RNG.shuffle(l)
    return l


CS = []
# recém-nascidos e bebês de colo
for corpo, k in (("recem_m", 2), ("recem_f", 2)):
    for pele in peles(k):
        CS.append(casual(corpo, pele, []))
for corpo, k in (("bebe_m", 4), ("bebe_f", 4)):
    for pele in peles(k):
        CS.append(casual(corpo, pele, [("Conjuntinho", 2), ("Macacãozinho", 1.6)], papel="Bebê"))
# 2–3 anos e crianças
KIDS_M = [("Brincando", 4), ("Fantasia", 1), ("Escola", 2), ("Inverninho", 1.2), ("Praia kids", 1.2), ("Jardineira kids", 1)]
KIDS_F = [("Brincando", 3), ("Vestidinho", 3), ("Fantasia", 1), ("Escola", 2), ("Inverninho", 1.2), ("Praia kids", 0.8),
          ("Maiô kids", 0.6), ("Jardineira kids", 1.2)]
for corpo, k in (("pequeno_m", 7), ("pequena_f", 7), ("crianca_m", 15), ("crianca_f", 15)):
    for pele in peles(k):
        CS.append(casual(corpo, pele, KIDS_M if corpo.endswith("_m") else KIDS_F))
# jovens
for corpo, k in (("adolescente_m", 18), ("adolescente_f", 18)):
    for pele in peles(k):
        CS.append(casual(corpo, pele, POR_FAIXA["adolescente"]))
# adultos (com cinco grávidas)
GRAVIDAS = {("adulta", 0): 3, ("adulta", 5): 1, ("adulta", 9): 2, ("plus_f", 2): 3, ("atletica", 4): 2}
GRAV_ESTILOS = [("Vestido", 3), ("Básico", 2), ("Jardineira", 1), ("Macacão", 1), ("Casaco longo", 1)]
for corpo, k in (("adulto", 16), ("adulta", 16), ("plus_m", 10), ("plus_f", 11), ("musculoso", 9), ("atletica", 10),
                 ("alto_magro", 10)):
    for i, pele in enumerate(peles(k)):
        g = GRAVIDAS.get((corpo, i), 0)
        CS.append(casual(corpo, pele, GRAV_ESTILOS if g else POR_FAIXA["adulto"], gravidez=g,
                         papel="Gestante" if g else None))
# idosos
for corpo, k in (("idoso", 18), ("idosa", 18)):
    for pele in peles(k):
        est = [("Clássico", 4), ("Agasalho", 1.5), ("Praia de idoso", 1), ("Frio de idoso", 1.5)] if corpo == "idoso" else \
            [("Vestido de vó", 4), ("Saia e blusa", 2.5), ("Clássico", 1), ("Agasalho", 1.2), ("Praia de idoso", 0.8), ("Frio de idoso", 1.2)]
        CS.append(casual(corpo, pele, est))

TODOS = PR + CS
CURTO = {"profissionais": "prof", "criancas": "crianca", "jovens": "jovem", "adultos": "adulto", "idosos": "idoso"}
for p in TODOS:
    p["id"] = f"{CURTO[p['grupo']]}_{slug(p['nome'])}"
assert len({p["id"] for p in TODOS}) == len(TODOS)
GRUPOS = {"profissionais": "Profissionais", "criancas": "Bebês e crianças", "jovens": "Jovens", "adultos": "Adultos",
          "idosos": "Idosos"}
saida = {
    "_leia": "Elenco do Morada: personagens prontos. Cada um usa os campos do formato morada-personagem da página "
             "(corpo, pele, expressao, cabelo, roupa, objetos, gravidez; recém-nascido: cabelo.tipo, manta, chupeta), mais "
             "id, nome, grupo, papel, faixa, paleta, animacao (repouso sugerido) e veiculo (ciclistas). Gerado por "
             "elenco_define.py e conferido por elenco_valida.py.",
    "grupos": GRUPOS,
    "personagens": TODOS,
}
json.dump(saida, open(os.path.join(AQUI, "elenco.json"), "w"), ensure_ascii=False, indent=1)
from collections import Counter  # noqa: E402
print(len(TODOS), "personagens:", dict(Counter(p["grupo"] for p in TODOS)))
print("papéis profissionais:", len({p["papel"] for p in PR}), dict(Counter(p["papel"] for p in PR)))
print( "corpos:", dict(Counter(p["corpo"] for p in TODOS)))
print("peles:", dict(Counter(p["pele"] for p in TODOS)))
