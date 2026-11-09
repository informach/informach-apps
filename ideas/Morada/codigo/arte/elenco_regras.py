"""Regras do Elenco: o que existe no catálogo e o que serve em cada corpo. Usado por elenco_define.py (gera o elenco)
e por elenco_valida.py (confere). Python puro (sem bpy).

As regras de "serve no corpo" são as mesmas da página (corpos.html: pecaPode, BEBE, permitidoCab, COM_GRAVIDA): peça só
de mulher ou só de homem, peças de adulto fora da roupa de criança, o bebê de colo só com a lista dele (e sem objeto de
mão), o recém-nascido só com a manta, barba e bigode só nos corpos adultos masculinos do catálogo, bengala só no idoso.
"""
import base64
import gzip
import json
import os
import re
import struct

AQUI = os.path.dirname(os.path.abspath(__file__))
SP = os.path.dirname(AQUI)
ROUPAS = json.load(open(os.path.join(AQUI, "roupas.json")))
CABELOS = json.load(open(os.path.join(AQUI, "cabelos.json")))

_BR = {x["id"]: x for x in ROUPAS["itens"]}


def _res(x):
    if "base" not in x:
        return x
    b = _res(_BR[x["base"]])
    return {**{k: v for k, v in b.items() if k not in ("id", "rotulo", "variacao", "base")}, **x}


ITENS = {k: _res(v) for k, v in _BR.items()}
SLOTS = list(ROUPAS["slots"])
_BC = {x["id"]: x for x in CABELOS["itens"]}


def _resc(x):
    if "base" not in x:
        return x
    b = _resc(_BC[x["base"]])
    return {**{k: v for k, v in b.items() if k not in ("id", "rotulo", "forma", "base")}, **x}


CAB = {k: _resc(v) for k, v in _BC.items()}
PENTEADOS = {k for k, v in CAB.items() if v.get("tipo") == "cabelo"} | {"cabelo", "careca", "cabelo_raspado"}
BARBAS = {k for k, v in CAB.items() if v.get("tipo") == "rosto"}

CORPOS = {  # id: (sexo, faixa)
    "recem_m": ("m", "recem"), "recem_f": ("f", "recem"), "bebe_m": ("m", "colo"), "bebe_f": ("f", "colo"),
    "pequeno_m": ("m", "pequeno"), "pequena_f": ("f", "pequeno"), "crianca_m": ("m", "crianca"),
    "crianca_f": ("f", "crianca"), "adolescente_m": ("m", "adolescente"), "adolescente_f": ("f", "adolescente"),
    "adulto": ("m", "adulto"), "plus_m": ("m", "adulto"), "musculoso": ("m", "adulto"), "alto_magro": ("m", "adulto"),
    "adulta": ("f", "adulto"), "plus_f": ("f", "adulto"), "atletica": ("f", "adulto"), "idoso": ("m", "idoso"),
    "idosa": ("f", "idoso"),
}
TONS = {"Clara": "#FFB69F", "Média": "#FEA679", "Morena": "#BA6953", "Escura": "#482B25"}
CABELO_CORES = {"Castanho claro": "#976858", "Castanho": "#5a3f33", "Preto": "#262322", "Loiro": "#d2a66a",
                "Ruivo": "#a9532f", "Grisalho": "#b5b0a8"}
MANTA_CORES = {"Creme": "#f6efe2", "Branco": "#fbfbf8", "Rosa-bebê": "#f4cfd6", "Azul-bebê": "#c9dcf0",
               "Verde-água": "#c4e4dc", "Amarelo-claro": "#f5e7b8", "Cinza": "#cfcfcf"}
EXPR = ["neutro", "feliz", "triste", "bravo", "confiante", "serio", "surpreso", "assustado", "aborrecido", "confuso",
        "dormindo", "chorando"]
COM_GRAVIDA = {"adulta", "plus_f", "atletica"}
GEMEO = {"adulta": "adulto", "idosa": "idoso", "adolescente_f": "adolescente_m", "crianca_f": "crianca_m",
         "pequena_f": "pequeno_m", "bebe_f": "bebe_m"}
HEX = re.compile(r"^#[0-9a-fA-F]{6}$")

# ---- as mesmas listas da página (corpos.html)
SO_F = re.compile(r"^(gen_(minissaia|saia_\w+|vestido_\w+)|nov_(vestido_\w+|biquini_baixo|top_biquini|tomara_que_caia|"
                  r"top_esportivo|cropped_manga|maio\w*|macaquinho_listrado|meia_arrastao\w*|meia_calca|luvas_longas|"
                  r"luvas_arrastao|tiara|arco|bolsa|bolsa_alca|bolsa_fecho|bolsa_perolas|oculos_gatinho|legging|"
                  r"calca_boca_sino|jardineira_short|chapeu_comissaria)|var_(top|cropped\w*|regata_rosa)|"
                  r"roupa_(saia_showgirl|salto_showgirl|sapato_caixa|jaqueta_sobrevivente|blusa_showgirl))$")
SO_M = re.compile(r"^nov_(sunga|bermuda_praia)$")
ADULTO = re.compile(r"^(nov_(smoking|paleto\w*|gravata\w*|casaco_longo|cartola|fedora|palheta|maleta\w*|pasta_\w+|"
                    r"bolsa_perolas|bolsa_alca|jornal|cafe|bengala|tomara_que_caia|vestido_(um_ombro|tubinho)|"
                    r"meia_calca|cinto_fivela|celular|mala_\w+|sacola_papel|sacolas|pau_selfie|camera|guia_retratil|"
                    r"garrafa|top_esportivo|cropped_manga|camisa_onca|camisa_caveira|suspensorio|cauboi|"
                    r"chapeu_comissaria)|gen_(saia_lapis|minissaia|vestido_(justo|festa|longo))|"
                    r"roupa_(camiseta_xadrez1|camiseta_xadrez2|camisa_caixa|jaqueta_36|salto_showgirl|sapato_caixa|"
                    r"corrente_plus|camisa_seguranca|sapato_seguranca|pulseira_plus|jaqueta_sobrevivente)|"
                    r"var_(casaca_colete|colete_social|chapeu_coco|top|cropped\w*))$")
JOVEM_NAO = re.compile(r"^(nov_(bengala|smoking|paleto\w*|maleta\w*|pasta_\w+|cartola|fedora|palheta|jornal|"
                       r"bolsa_perolas|suspensorio)|var_chapeu_coco|roupa_camiseta_xadrez1)$")
IDOSO_NAO = re.compile(r"^(nov_(cropped_manga|top_esportivo|tomara_que_caia|bermuda_rasgada|calca_rasgada|bone_helice|"
                       r"bone_tras|gatinho|touca_urso|sapo|regata_justa|camisa_caveira|pau_selfie|legging|short_curto|"
                       r"oculos_3d|jardineira_short|macaquinho_listrado|camisa_onca)|gen_minissaia|var_(top|cropped\w*)|"
                       r"roupa_(jaqueta_sobrevivente|salto_showgirl|fones_002))$")
BEBE = {
    "cima": ["nov_camiseta_larga", "nov_moletom", "nov_moletom_capuz", "nov_blusa_listrada", "nov_manga_longa",
             "nov_marinheiro", "var_moletom_manga_curta", "nov_polo", "roupa_camiseta_criativa"],
    "baixo": ["nov_calca_moletom", "var_short_verde", "nov_bermuda_folgada", "nov_legging", "var_short_vermelho",
              "var_bermuda_azul"],
    "inteira": ["nov_jardineira", "nov_jardineira_short", "nov_macacao", "gen_vestido_casual", "nov_vestido_manga_curta",
                "nov_vestido_gola", "nov_macaquinho_listrado"],
    "pes": ["nov_tenis_meia", "roupa_tenis_009", "nov_galocha", "roupa_tenis_plus"], "meias": ["nov_meias_altas"],
    "cabeca": ["nov_touca_urso", "nov_gatinho", "nov_touca_pompom", "nov_sapo", "nov_balde", "nov_touca",
               "nov_chapeu_praia", "nov_bone_novo"],
}
SEM_PEQUENO = ("oculos", "sobre", "pescoco_peca", "cintura", "orelhas")
CAB_IDOSO_NAO = {"moicano", "topete_moicano", "espetado", "espetado_alto", "maria_chiquinha", "trancas", "coque_duplo"}


def cobre(rid):
    """Slots que uma peça inteira esconde (a jardineira deixa a blusa)."""
    it = ITENS[rid]
    if it.get("slot") != "inteira":
        return []
    return it.get("cobre") or ["cima", "baixo"]


def serve(rid, corpo):
    """None se a peça serve no corpo; senão, o motivo."""
    if rid not in ITENS:
        return "não existe no catálogo"
    it = ITENS[rid]
    sexo, faixa = CORPOS[corpo]
    if faixa == "recem":
        return "recém-nascido só usa a manta"
    if sexo == "m" and SO_F.match(rid):
        return "peça só de mulher"
    if sexo == "f" and SO_M.match(rid):
        return "peça só de homem"
    if rid == "nov_bengala" and faixa != "idoso":
        return "bengala só no idoso"
    if faixa == "colo":
        return None if rid in BEBE.get(it.get("slot"), []) else "fora da lista do bebê de colo"
    if faixa in ("pequeno", "crianca") and ADULTO.match(rid):
        return "peça de adulto"
    if faixa == "pequeno" and it.get("slot") in SEM_PEQUENO:
        return "parte que não entra em 2–3 anos"
    if faixa == "adolescente" and JOVEM_NAO.match(rid):
        return "fora da roupa de jovem"
    if faixa == "idoso" and IDOSO_NAO.match(rid):
        return "fora da roupa de idoso"
    return None


def barba_serve(bid, corpo):
    if bid not in CAB or CAB[bid].get("tipo") != "rosto":
        return "não é barba nem bigode do catálogo"
    so = CAB[bid].get("so")
    grupo = CABELOS["grupos"].get(so, [so]) if so else None
    return None if not grupo or corpo in grupo else "barba só em corpo adulto masculino"


def penteado_serve(pid, corpo):
    if pid not in PENTEADOS:
        return "penteado fora do catálogo"
    if CORPOS[corpo][1] == "idoso" and pid in CAB_IDOSO_NAO:
        return "penteado fora do idoso"
    return None


# ---- animações de cada biblioteca (as da página: corpos_viewer/biblioteca/<fonte>.txt), guardadas num json
ARQ_ANIMS = os.path.join(AQUI, "elenco_anims.json")


def _le_anims():
    pasta = os.path.join(SP, "corpos_viewer", "biblioteca")
    out = {}
    for f in sorted(os.listdir(pasta)):
        if not f.endswith(".txt"):
            continue
        b = base64.b64decode(open(os.path.join(pasta, f)).read().strip())
        try:
            b = gzip.decompress(b)
        except OSError:
            pass
        if b[:4] != b"glTF":
            continue
        n = struct.unpack("<I", b[12:16])[0]
        j = json.loads(b[20:20 + n])
        out[f[:-4]] = sorted(a["name"] for a in j.get("animations", []))
    json.dump(out, open(ARQ_ANIMS, "w"), ensure_ascii=False, indent=0)
    return out


ANIMS = json.load(open(ARQ_ANIMS)) if os.path.exists(ARQ_ANIMS) else _le_anims()


def fonte_anim(corpo, gravidez=0):
    if corpo in COM_GRAVIDA and int(gravidez or 0) >= 2:
        return corpo + "_gravida" if corpo != "adulta" else "adulta_gravida"
    return GEMEO.get(corpo, corpo)


def anim_existe(nome, corpo, gravidez=0):
    return nome in ANIMS.get(fonte_anim(corpo, gravidez), [])
