"""Bichos urbanos do Morada (grupo `urbano`): aves da praça, pinguim, roedores e tartaruga, feitos a partir do pacote
grátis Animals (Chicken, Pinguin e Kitty; uso interno, não distribuir), com as animações do pacote (parado, andar,
correr) e animações compostas aqui (bicar, voar, decolar, pousar, planar, ciscar, arrumar, chocar, nadar, mergulhar,
escorregar, farejar, comer, pular, ficar em pé, se coçar, esconder...).

Uso:
  python -I bichos_urbano.py -- gera <saida> [ids | todos] [--blend arquivo.blend]
  python -I bichos_urbano.py -- previa <saida.jpg> [ids]          (vistas em descanso)
  python -I bichos_urbano.py -- quadros <saida_dir> [ids] [anims]  (folhas de conferência das animações)
"""
import json
import os
import sys

ARTE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ARTE)

import bpy  # noqa: E402
import numpy as np  # noqa: E402

import bichos_urbano_rig as U  # noqa: E402
import bichos_urbano_corpo as C  # noqa: E402
import bichos_urbano_anims as A  # noqa: E402

ROTULOS = {
    "parado": "Parado", "andar": "Andar", "correr": "Correr", "bicar": "Bicar o chão", "ciscar": "Ciscar",
    "arrumar": "Arrumar as penas", "sentar": "Sentar", "chocar": "Chocar", "voar": "Voar", "decolar": "Decolar",
    "pousar": "Pousar", "planar": "Planar", "nadar": "Nadar", "mergulhar": "Mergulhar",
    "escorregar": "Escorregar de barriga", "bater_asas": "Bater as asas", "chamar": "Chamar",
    "farejar": "Farejar", "comer": "Comer segurando", "pular": "Pular", "em_pe": "Ficar em pé", "cocar": "Se coçar",
    "deitar": "Deitar", "dormir": "Dormir", "esconder": "Esconder no casco", "sair": "Sair do casco",
    "olhar": "Olhar em volta", "escondida": "Escondida no casco", "pastar": "Comer folhas",
}
ANIMS_ROEDOR = ["farejar", "comer", "pular", "em_pe", "cocar", "dormir"]
ANIMS_PINGUIM = ["nadar", "mergulhar", "escorregar", "bater_asas", "arrumar", "chamar", "deitar", "pular"]
ANIMS_TARTARUGA = ["esconder", "escondida", "sair", "pastar", "olhar", "nadar"]
ANIMS_AVE = ["bicar", "ciscar", "arrumar", "sentar", "chocar", "voar", "decolar", "pousar", "planar"]
PACOTE_MAPA = {"idle": "parado", "walk": "andar", "run": "correr"}

# ---------------------------------------------------------------- os bichos
BICHOS = {
    "pombo": dict(
        nome="Pombo", especie="pombo", base="Chicken_001", escala=0.6,
        esqueleto={"pescoco": (0.9, 0.62, 0.9), "cabeca": (0.82, 0.8, 0.82), "coxas": (1.0, 0.75, 1.0),
                   "canelas": (1.0, 0.5, 1.0), "pes": (1.0, 0.45, 1.0), "dedos": (0.85, 0.8, 0.85),
                   "tronco": (1.08, 1.12, 1.0), "bracos": (1.0, 1.55, 1.0), "maos": (1.0, 2.1, 1.0),
                   "cauda": (0.85, 0.75, 0.35)},
        rot={"spine.001": (-48, 0, 0), "spine.005": (8, 0, 0)},
        bico=dict(comp=0.85, larg=0.75, alt=0.7),
        leque=dict(comp=0.12, larg=0.075, recuo=0.0, ergue=0.3, faixa="cauda_ponta"),
        animacoes=ANIMS_AVE, vel=1.3,
        penas=dict(corda=0.15, cores=["asa", "asa", "asa", "primaria", "primaria", "primaria"]),
        cores={"pena": "#8e95a3", "bico": "#3a3436", "pe": "#d8707a", "olho": "#e8762a", "asa": "#a7adb9",
               "barra": "#4c505b", "primaria": "#5c616d", "cauda_ponta": "#3e424c"},
        zonas=[("asa", "#a7adb9"), ("barras", "#4c505b"), ("cabeca", "#737a89"), ("pescoco", "#5d8073"), ("anel", "#7a5f8c"),
               ("cauda", "#7c8290")]),
    "pombo_claro": dict(
        como="pombo", nome="Pombo claro",
        cores={"pena": "#c9ccd3", "bico": "#4a4446", "pe": "#e08088", "olho": "#e8762a", "asa": "#e2e4e8",
               "barra": "#8a8f9a", "primaria": "#9a9fab", "cauda_ponta": "#80858f"},
        zonas=[("asa", "#e2e4e8"), ("barras", "#8a8f9a"), ("cabeca", "#b7bbc4"), ("pescoco", "#93ab9f"),
               ("anel", "#b09ab8"), ("cauda", "#b4b8c0")]),
    "galinha": dict(
        nome="Galinha", especie="galinha", base="Chicken_001", escala=1.0, crista=True,
        esqueleto={"bracos": (1.0, 1.15, 1.0), "maos": (1.0, 1.25, 1.0)},
        animacoes=ANIMS_AVE, vel=1.0, batidas=4, t_voo=1.0,
        penas=dict(corda=0.13, escondidas=4, cores=["pena", "pena", "pena", "escura", "escura", "escura"]),
        cores={"pena": "#b0663a", "crista": "#e8403a", "bico": "#f2c050", "pe": "#f0c050", "olho": "#1a1214",
               "escura": "#7a3e24"},
        zonas=[("pescoco_alto", "#c8783e"), ("cauda_ponta", "#5a2e1c"), ("asa_ponta", "#8a4628")]),
    "pato": dict(
        nome="Pato", especie="pato", base="Chicken_001", escala=0.95,
        esqueleto={"tronco": (1.3, 1.3, 0.95), "pescoco": (0.95, 0.85, 0.95), "cabeca": (1.0, 0.95, 0.95),
                   "coxas": (1.25, 0.6, 1.25), "canelas": (1.2, 0.42, 1.2), "pes": (1.2, 0.4, 1.2),
                   "dedos": (1.35, 1.0, 1.1), "bracos": (1.0, 1.45, 1.0), "maos": (1.0, 1.7, 1.0),
                   "cauda": (1.0, 0.55, 0.35)},
        rot={"spine.001": (-52, 0, 0), "spine.003": (6, 0, 0)},
        bico_pato=dict(comp=0.058, larg=0.042, alt=0.024),
        leque=dict(comp=0.07, larg=0.08, ergue=0.6, cor="cauda"),
        animacoes=ANIMS_AVE + ["nadar", "mergulhar"], vel=0.9, batidas=3, t_voo=1.0, calado=0.4,
        penas=dict(corda=0.16, cores=["asa", "espelho", "espelho", "primaria", "primaria", "primaria"]),
        cores={"pena": "#bdb8b0", "bico": "#e8c43a", "pe": "#f08a2a", "olho": "#1a1214", "asa": "#8e877c",
               "espelho": "#3a5cc0", "primaria": "#6a6258", "cauda": "#f2f0ea"},
        zonas=[("costas", "#8e877c"), ("asa", "#8e877c"), ("peito", "#7a4632"), ("pescoco", "#2e7a4c"),
               ("cabeca", "#2a7048"), ("anel", "#f4f2ee"), ("cauda", "#3a3a3e")]),
    "gaivota": dict(
        nome="Gaivota", especie="gaivota", base="Chicken_001", escala=1.05,
        esqueleto={"tronco": (0.92, 1.2, 0.9), "pescoco": (0.85, 0.7, 0.85), "cabeca": (0.9, 0.95, 0.85),
                   "coxas": (0.95, 0.7, 0.95), "canelas": (0.9, 0.6, 0.9), "pes": (0.9, 0.55, 0.9),
                   "dedos": (1.1, 0.9, 1.0), "bracos": (0.95, 2.1, 0.95), "maos": (0.95, 2.9, 0.95),
                   "cauda": (0.85, 0.7, 0.3)},
        rot={"spine.001": (-50, 0, 0)},
        bico=dict(comp=1.6, larg=0.75, alt=0.95, curva=0.12),
        leque=dict(comp=0.11, larg=0.085, ergue=0.3, cor="pena"),
        animacoes=ANIMS_AVE + ["nadar"], vel=0.8, batidas=2, t_voo=1.25, calado=0.35, diedro=8,
        penas=dict(corda=0.17, caida=-0.06, cores=["asa", "asa", "asa", "asa", "primaria", "primaria"]),
        cores={"pena": "#f4f4f2", "bico": "#f2c83a", "pe": "#e8a8a0", "olho": "#e8d040", "asa": "#a9b5c2",
               "primaria": "#26262a"},
        zonas=[("asa", "#a9b5c2"), ("costas", "#a9b5c2"), ("asa_ponta", "#26262a")]),
    "pardal": dict(
        nome="Pardal", especie="pardal", base="Chicken_001", escala=0.36,
        esqueleto={"tronco": (1.05, 1.0, 1.0), "pescoco": (1.0, 0.45, 1.0), "cabeca": (1.25, 1.2, 1.25),
                   "coxas": (1.0, 0.8, 1.0), "canelas": (1.0, 0.6, 1.0), "pes": (1.0, 0.55, 1.0),
                   "dedos": (0.9, 0.85, 0.9), "bracos": (1.0, 1.4, 1.0), "maos": (1.0, 1.8, 1.0),
                   "cauda": (0.8, 0.8, 0.35)},
        rot={"spine.001": (-38, 0, 0), "spine.005": (10, 0, 0)},
        bico=dict(comp=0.55, larg=1.15, alt=1.25),
        leque=dict(comp=0.15, larg=0.07, ergue=0.6, cor="cauda"),
        animacoes=ANIMS_AVE, vel=1.7, batidas=4, t_voo=1.0,
        penas=dict(corda=0.15, cores=["asa", "listra", "asa", "primaria", "primaria", "primaria"]),
        cores={"pena": "#a07048", "bico": "#4a3a30", "pe": "#c8a088", "olho": "#1a1214", "asa": "#9a6840",
               "listra": "#f0e8d8", "primaria": "#5a3e2a", "cauda": "#6a4a32"},
        zonas=[("barras", "#3e2a1e"), ("barriga", "#d4ccc0"), ("peito", "#cfc6b8"), ("pescoco", "#8a5634"),
               ("cabeca", "#80808a"), ("cauda", "#6a4a32")]),
    "pinguim": dict(
        nome="Pinguim", especie="pinguim", base="Pinguin_001", escala=0.52, faixa=(0.6, 0.66),
        animacoes=ANIMS_PINGUIM, vel=1.0,
        cores={"preto": "#2c2e36", "branco": "#f6f3ec", "risca": "#f0a090", "pe": "#4a3a40"}),
    "esquilo": dict(
        nome="Esquilo", especie="esquilo", base="Kitty_001", escala=0.62,
        esqueleto={"tronco": (1.05, 0.85, 1.05), "pescoco": (1.0, 0.7, 1.0), "cabeca": (1.12, 0.95, 1.1),
                   "pernas_tras": (1.25, 0.82, 1.2), "pernas_frente": (1.0, 0.72, 1.0), "maos": (1.0, 0.9, 1.0),
                   "dedos": (1.2, 1.1, 1.0), "cauda": (0.7, 0.62, 0.7)},
        rot={"spine.004": (62, 0, 0), "spine.003": (35, 0, 0), "spine.002": (38, 0, 0), "spine.001": (40, 0, 0),
             "spine": (30, 0, 0)},
        focinho=0.85, focinho_larg=0.9, cabeca_cresce=0.05, olho_menor=0.7,
        orelha=dict(larg=0.03, comp=0.04, abre=0.2, inclina=0.1, esp=0.008),
        cauda=dict(tipo="fofa", raio=0.075, aneis=12, achata=0.75, cor="pelo"),
        bigode=0.035, comida=dict(tipo="noz", raio=0.011),
        animacoes=ANIMS_ROEDOR, vel=1.3, pulo=0.5, ang_comer=58, ang_empe=74, ang_cocar=24,
        cores={"pelo": "#b8622e", "branco": "#b8622e", "olho": "#2a1a14", "pupila": "#0a0808", "nariz": "#3a2a26",
               "boca": "#5a3030", "cinza": "#f2e2c8", "claro": "#f4f4f0", "orelha": "#d8906a", "bigode": "#2a2020"},
        zonas=[("barriga", "#f2e2c8"), ("peito", "#f2e2c8"), ("focinho_baixo", "#f2e2c8")],
        zonas_classes=["pelo", "branco"]),
    "coelho": dict(
        nome="Coelho", especie="coelho", base="Kitty_001", escala=1.0,
        esqueleto={"tronco": (1.35, 0.78, 1.25), "pescoco": (1.2, 0.5, 1.2), "cabeca": (1.12, 0.9, 1.08),
                   "pernas_tras": (1.5, 0.72, 1.4), "dedos": (1.4, 1.6, 1.0), "pernas_frente": (1.15, 0.6, 1.15),
                   "maos": (1.1, 0.9, 1.0), "cauda": (0.5, 0.2, 0.5)},
        focinho=0.7, focinho_larg=0.9, cabeca_cresce=0.06, olho_menor=0.75,
        fofo={"spine.005": 0.012, "spine.006": 0.012, "spine.007": 0.01, "shoulder": 0.012, "thigh": 0.008},
        orelha=dict(larg=0.045, comp=0.13, abre=0.18, inclina=0.35, esp=0.01, tras=0.006),
        cauda=dict(tipo="pompom", raio=0.032, cor="branco", recolhe=True),
        dentes=True, bigode=0.05, comida=dict(tipo="cenoura", raio=0.011),
        animacoes=ANIMS_ROEDOR, vel=1.0, pulo=0.7, t_pulo=0.8, ang_comer=50, ang_empe=70, ang_cocar=24, orelha_mexe=0.6,
        cores={"pelo": "#a58a72", "branco": "#a58a72", "olho": "#1a1010", "pupila": "#0a0808", "nariz": "#d88a92",
               "boca": "#6a3a3a", "cinza": "#a58a72", "claro": "#f4f4f0", "orelha": "#e8b0b0", "bigode": "#f0ece4"},
        zonas=[("barriga", "#efe6da"), ("peito", "#d8c8b4"), ("focinho_baixo", "#efe6da"), ("cauda", "#f6f2ea")],
        zonas_classes=["pelo", "branco"]),
    "rato": dict(
        nome="Rato", especie="rato", base="Kitty_001", escala=0.48,
        esqueleto={"tronco": (1.15, 0.9, 1.0), "pescoco": (1.1, 0.6, 1.0), "cabeca": (1.0, 1.05, 0.95),
                   "pernas_tras": (1.15, 0.6, 1.1), "pernas_frente": (1.05, 0.55, 1.05), "dedos": (1.0, 1.2, 1.0),
                   "cauda": (0.35, 0.95, 0.35)},
        rot={"spine.004": (-12, 0, 0), "spine.002": (6, 0, 0)},
        focinho=1.35, focinho_larg=0.65, olho_menor=0.6,
        orelha=dict(larg=0.05, comp=0.045, abre=0.45, inclina=0.0, esp=0.006),
        bigode=0.05, comida=dict(tipo="queijo", raio=0.014),
        animacoes=ANIMS_ROEDOR, vel=1.4, pulo=0.45, ang_comer=55, ang_empe=70, ang_cocar=24,
        cores={"pelo": "#7e7a7c", "branco": "#7e7a7c", "olho": "#141010", "pupila": "#0a0808", "nariz": "#e8909a",
               "boca": "#6a3a3a", "cinza": "#7e7a7c", "claro": "#f4f4f0", "orelha": "#e8a0a8",
               "orelha_fora": "#d89aa2", "bigode": "#2a2626"},
        zonas=[("barriga", "#c8c2c0"), ("cauda", "#e0a0a6"), ("patas", "#e8a8ae")],
        zonas_classes=["pelo", "branco"]),
    "jabuti": dict(
        nome="Jabuti", especie="tartaruga", base="Kitty_001", escala=0.82,
        esqueleto={"tronco": (1.5, 0.85, 0.75), "pescoco": (0.95, 1.6, 0.95), "cabeca": (1.0, 0.8, 0.9),
                   "pernas_tras": (1.9, 0.42, 1.9), "pernas_frente": (1.9, 0.45, 1.9), "dedos": (1.7, 0.6, 1.4),
                   "maos": (1.7, 0.7, 1.4), "cauda": (0.8, 0.18, 0.8), "orelhas": (0.2, 0.2, 0.2)},
        rot={"spine.008": (-8, 0, 0)}, focinho=0.45, focinho_larg=0.8, olho_menor=0.55,
        casco=dict(raios=(0.13, 0.165, 0.11), base=0.05, espessura=0.02, recuo=0.025),
        animacoes=ANIMS_TARTARUGA, vel_pacote=0.45, vel=0.6,
        cores={"pelo": "#4a443c", "branco": "#e07a2a", "olho": "#141010", "pupila": "#0a0808", "nariz": "#2a2420",
               "boca": "#3a2a24", "cinza": "#4a443c", "claro": "#f0f0ea", "orelha": "#4a443c",
               "casco": "#3a2a1e", "placa": "#c88c30", "plastrao": "#c8a060"},
        zonas=[("focinho_baixo", "#d8902e")], zonas_classes=["pelo"]),
}


def cfg_de(id_):
    b = dict(BICHOS[id_])
    if "como" in b:
        base = dict(BICHOS[b.pop("como")])
        base.update(b)
        b = base
    return b


CONSTRUTOR = {"Chicken_001": C.ave, "Kitty_001": C.quadrupede, "Pinguin_001": C.pinguim}


def constroi(id_, bases):
    cfg = cfg_de(id_)
    nb = cfg["base"]
    if nb not in bases:
        bases[nb] = U.Base(nb)
    base = bases[nb]
    rig, info = CONSTRUTOR[nb](base, cfg)
    arm, ob = U.objeto(rig, id_)
    return cfg, rig, info, arm, ob


def carrega_bases(ids):
    """O Blender só guarda uma cena: carregamos as bases (uma de cada vez) e os bichos vão se acumulando."""
    bases = {}
    feitos = []
    por_base = {}
    for id_ in ids:
        por_base.setdefault(cfg_de(id_)["base"], []).append(id_)
    primeiro = True
    for nb, lista in por_base.items():
        if primeiro:
            base = U.Base(nb)
            primeiro = False
        else:
            base = _importa_base(nb)
        bases[nb] = base
        for id_ in lista:
            cfg = cfg_de(id_)
            rig, info = CONSTRUTOR[nb](base, cfg)
            arm, ob = U.objeto(rig, id_)
            feitos.append((id_, cfg, rig, info, arm, ob))
    return bases, feitos


def _importa_base(nb):
    """Base nova sem apagar a cena (os bichos já montados ficam)."""
    return U.Base(nb, limpa=False)


def prepara(rig, cfg):
    nb = cfg["base"]
    if nb == "Chicken_001":
        A.prepara_asas(rig)
        ctx = A.ctx_ave(rig, cfg)
        cad = A.cadeias_ave(rig, ctx)
        A.calibra_ave(rig, ctx, cad, cfg)
        return ctx, cad, A.anim_ave
    if nb == "Kitty_001":
        ctx = A.ctx_quad(rig, cfg)
        cad = A.cadeias_quad(rig, ctx)
        if cfg.get("casco"):
            A.calibra_tartaruga(rig, ctx, cad, cfg)
        else:
            A.calibra_quad(rig, ctx, cad, cfg)
        return ctx, cad, A.anim_quad
    if nb == "Pinguin_001":
        ctx = A.ctx_ping(rig, cfg)
        cad = A.cadeias_ping(rig, ctx)
        A.calibra_ping(rig, ctx, cad, cfg)
        return ctx, cad, A.anim_ping
    raise KeyError(nb)


def anima(id_, cfg, rig, info, arm, so=None):
    """Animações do pacote e compostas, em trilhas NLA. Devolve [(id, rotulo, laço, segundos)] e as conferências."""
    U.bpy.context.scene.render.fps = U.FPS
    pac = U.acoes_pacote(rig, arm, id_, PACOTE_MAPA, info["esc"], info["kq"], C.QUADRIL[cfg["base"]],
                         vel=cfg.get("vel_pacote", 1.0))
    lista = []
    for nm in ("parado", "andar", "correr"):
        act, seg = pac[nm]
        U.trilha_nla(arm, act, nm)
        lista.append(dict(id=nm, rotulo=ROTULOS[nm], laco=True, segundos=round(seg, 2)))
    ctx, cad, fabrica = prepara(rig, cfg)
    conf = {}
    for nm in cfg["animacoes"]:
        if so and nm not in so:
            continue
        seg, laco, f = fabrica(nm, rig, ctx, cfg)
        quadros, seg, c = A.gera(rig, cad, nm, seg, laco, f, quadril=C.QUADRIL[cfg["base"]],
                                 chao=nm not in ("nadar", "mergulhar"))
        act = U.acao_de_quadros(arm, rig, f"{id_}|{nm}", quadros)
        U.trilha_nla(arm, act, nm)
        lista.append(dict(id=nm, rotulo=ROTULOS[nm], laco=laco, segundos=round(seg, 2)))
        conf[nm] = c
        print(f"  {id_:10} {nm:11} {seg:5.2f}s quadros={len(quadros)} chão={c['minz']:+.4f} pé={c['desliza']:.4f}", flush=True)
    return lista, conf, ctx


def main():
    a = sys.argv[sys.argv.index("--") + 1:]
    modo = a[0]
    if modo == "previa":
        saida = a[1]
        ids = list(BICHOS) if len(a) < 3 or a[2] == "todos" else a[2].split(",")
        bases, feitos = carrega_bases(ids)
        for o in [bs.me for bs in bases.values()]:
            o.hide_render = True
        import bichos_urbano_ver as VR
        VR.ver_vistas([(f[4], f[5]) for f in feitos], saida, vistas=os.environ.get("VISTAS", "lado,34,frente,cima").split(","))
        for id_, cfg, rig, info, arm, ob in feitos:
            print(id_, "verts", len(rig.Vr), "tris", sum(len(f) - 2 for f in rig.F), "ossos", len(rig.nomes))


    if modo in ("gera", "quadros"):
        saida = a[1]
        os.makedirs(saida, exist_ok=True)
        ids = list(BICHOS) if len(a) < 3 or a[2] == "todos" else a[2].split(",")
        so = a[3].split(",") if len(a) > 3 and not a[3].startswith("--") else None
        bases, feitos = carrega_bases(ids)
        for o in [bs.me for bs in bases.values()]:
            o.hide_render = True
            o.hide_viewport = True
        catalogo = []
        resumo = {}
        for id_, cfg, rig, info, arm, ob in feitos:
            lista, conf, ctx = anima(id_, cfg, rig, info, arm, so)
            resumo[id_] = conf
            if modo == "gera":
                os.makedirs(os.path.join(saida, "glb"), exist_ok=True)
                cam = os.path.join(saida, "glb", id_ + ".glb")
                U.B.exporta(arm, ob, cam)
                V = rig.Vr
                notas = []
                if any(x["id"] == "nadar" for x in lista):
                    notas.append("nadar/mergulhar: z = 0 é a linha d'água")
                if any(x["id"] == "voar" for x in lista):
                    notas.append(f"voar/planar: corpo a {ctx['h_voo']:.2f} m acima da origem; decolar e pousar ligam o chão a essa altura")
                catalogo.append(dict(id=id_, nome=cfg["nome"], especie=cfg["especie"], grupo="urbano",
                                     escala=cfg["escala"], pacote=True, base=cfg["base"].replace("_001", ""),
                                     medidas=dict(altura=round(float(V[:, 2].max()), 3),
                                                  comprimento=round(float(np.ptp(V[:, 1])), 3),
                                                  largura=round(float(np.ptp(V[:, 0])), 3)),
                                     triangulos=sum(len(f) - 2 for f in rig.F), notas=notas,
                                     animacoes=lista))
                print("bicho", id_, len(rig.Vr), "vértices", sum(len(f) - 2 for f in rig.F), "triângulos",
                      os.path.getsize(cam) // 1024, "KB", flush=True)
        if modo == "gera":
            if os.path.exists(os.path.join(saida, "urbano.json")) and (len(ids) < len(BICHOS)):
                velho = {b["id"]: b for b in json.load(open(os.path.join(saida, "urbano.json")))["bichos"]}
            else:
                velho = {}
            for b in catalogo:
                velho[b["id"]] = b
            ordem = [i for i in BICHOS if i in velho]
            json.dump(dict(grupo="urbano", uso="interno, não distribuir (base de pacote)", bichos=[velho[i] for i in ordem]),
                      open(os.path.join(saida, "urbano.json"), "w"), ensure_ascii=False, indent=1)
            blend = a[a.index("--blend") + 1] if "--blend" in a else None
            if blend:
                for k, (id_, cfg, rig, info, arm, ob) in enumerate(feitos):
                    arm.location = ((k % 6) * 0.8, (k // 6) * 1.0, 0)
                U.bpy.ops.wm.save_as_mainfile(filepath=blend, compress=True)
        else:
            import bichos_urbano_ver as VR
            todas = []
            for id_, cfg, rig, info, arm, ob in feitos:
                for t in arm.animation_data.nla_tracks:
                    if so and t.name not in so:
                        continue
                    todas.append((t.name, id_, arm, ob, t.strips[0].action))
            nomes = []
            for t in todas:
                if t[0] not in nomes:
                    nomes.append(t[0])
            for nm in nomes:
                linhas = []
                for (n2, id_, arm, ob, act) in todas:
                    if n2 != nm:
                        continue
                    f0, f1 = act.frame_range
                    qs = [round(f0 + (f1 - f0) * k / 5) for k in range(6)]
                    linhas.append((id_, arm, ob, act, qs))
                vista = tuple(float(x) for x in os.environ.get("VISTA", "1,-0.35,0.3").split(","))
                VR.ver_quadros(linhas, os.path.join(saida, f"anim_{nm}{os.environ.get('SUF', '')}.jpg"), vista=vista)
                print("folha", nm, flush=True)


if __name__ == "__main__":
    main()
