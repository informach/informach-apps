"""Cachorros de estimação do Morada: 16 cachorros feitos a partir do Doberman do pacote Apocalypse (grátis, uso interno),
com as 11 animações dele ajustadas a cada um e mais 10 compostas (bichos_estimacao_clipes.py: sentar, abanar o rabo,
coçar a orelha, cavar, uivar, farejar, buscar, pular de alegria, beber e comer), resolvidas no esqueleto de cada um.
A imagem da vitrine de bichos serve de norte; as formas são próprias. Os gatos agora nascem do Kitty_001 do pacote
Animals (bichos_estimacao_animals.py), com movimentos de gato.

Como cada bicho nasce do Doberman:
- proporções: cada osso ganha um fator de comprimento e de espessura (e, se preciso, um giro no lugar de descanso). O
  esqueleto novo é montado do quadril para as pontas, e cada vértice vai junto com os ossos que o puxam (a mesma mistura
  de pesos do original). Como só o lugar de descanso muda, as animações (giros de cada osso) continuam valendo;
- cores: a textura do Doberman é uma paleta com sombra pintada. Cada face vira uma classe (pelo, marca castanha, focinho
  e olhos, boca, língua) com o quanto ela é mais clara ou mais escura que a cor da classe; o bicho troca a cor de cada
  classe e pinta zonas (peito, patas, focinho, ponta da cauda) e a sombra continua;
- peças trocadas: orelhas (caídas, de gato, pequenas de lulu), caudas (longa, de gato, enrolada, pompom), pelo fofo
  (a malha infla pela normal, mais no peito e no pescoço) e coleira;
- animações: o deslocamento do quadril (Spine1) cresce ou diminui com a altura do quadril; o resto, com o tamanho.

Uso: python bichos.py -- <saida> [ids separados por vírgula | todos] [--blend arquivo.blend]
Saída: <saida>/<id>.glb (malha com cor por vértice, esqueleto e as 21 animações em trilhas NLA) e bichos.json
(ou --json <arquivo>). --clipes a,b só faz esses clipes novos (para testar).
"""
import json
import math
import os
import sys

import bpy
import bmesh  # noqa: E402 (o bmesh só existe depois do bpy)
import numpy as np
from mathutils import Matrix, Vector, Euler

AQUI = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PACOTE = os.path.join(AQUI, "ideias", "Apocalypse")
FBX = os.path.join(PACOTE, "Apocalypse_Free_fbx", "Apocalypse_Free_fbx", "Characters", "Doberman.fbx")
TEX = os.path.join(PACOTE, "textures", "textures", "Color2.png")

ANIMACOES = {  # nome no pacote → id e rótulo (cachorro, gato)
    "Idle": ("parado", "Parado", "Parado"),
    "Walk": ("andar", "Andar", "Andar"),
    "Run": ("correr", "Correr", "Correr"),
    "Turn": ("virar", "Virar", "Virar"),
    "Bark": ("latir", "Latir", "Miar"),
    "AskToPlay": ("brincar", "Pedir para brincar", "Pedir para brincar"),
    "GivePaw": ("pata", "Dar a pata", "Dar a pata"),
    "Flip": ("cambalhota", "Cambalhota", "Cambalhota"),
    "Lie": ("deitar", "Deitar", "Deitar"),
    "LieHappy": ("barriga", "Barriga para cima", "Barriga para cima"),
    "Sleep": ("dormir", "Dormir", "Dormir"),
}

GRUPOS = {
    "tronco": ["Spine", "Spine1", "Spine2"],
    "pescoco": ["Neck", "Neck1"],
    "cabeca": ["Head", "Jaw"],
    "orelhas": ["Ear.L", "Ear.R"],
    "coxas": ["Thigh.L", "Thigh.R"],
    "canelas": ["Shin.L", "Shin.R"],
    "pes": ["Foot.L", "Foot.R"],
    "dedos": ["Toe.L", "Toe.R"],
    "ombros": ["Front_Shoulder.L", "Front_Shoulder.R"],
    "bracos": ["Front_Thigh.L", "Front_Thigh.R"],
    "antebracos": ["Front_Shin.L", "Front_Shin.R"],
    "maos": ["Front_Foot.L", "Front_Foot.R"],
    "dedos_frente": ["Front_Toe.L", "Front_Toe.R"],
    "cauda": ["Tail"],
}
GRUPOS["pernas_tras"] = GRUPOS["coxas"] + GRUPOS["canelas"] + GRUPOS["pes"]
GRUPOS["pernas_frente"] = GRUPOS["bracos"] + GRUPOS["antebracos"] + GRUPOS["maos"]
GRUPOS["pernas"] = GRUPOS["pernas_tras"] + GRUPOS["pernas_frente"]
GRUPOS["patas"] = GRUPOS["dedos"] + GRUPOS["dedos_frente"]


def _h(c):
    return tuple(int(c[i:i + 2], 16) / 255 for i in (1, 3, 5))


# ---------------------------------------------------------------- os bichos
# esqueleto: grupo ou osso → (largura, comprimento, altura) no referencial do osso; rot: giro (graus) no descanso
# cores: classe → cor; zonas: [(zona, cor)] pintadas por cima (na ordem)
BICHOS = {
    "doberman": dict(nome="Doberman", especie="cachorro", escala=1.0,
                     cores={"pelo": "#3a3436", "marca": "#9a5a35", "nariz": "#1c1c1e", "olho": "#2a1a12"}),
    "doberman_marrom": dict(nome="Doberman marrom", especie="cachorro", escala=1.0,
                            cores={"pelo": "#6e3b26", "marca": "#b4703f", "nariz": "#2a1c18", "olho": "#2a1a12"}),
    "labrador": dict(nome="Labrador", especie="cachorro", escala=0.95,
                     esqueleto={"tronco": (1.12, 1.0, 1.1), "pescoco": (1.15, 0.95, 1.1), "cabeca": (1.08, 1.0, 1.05),
                                "pernas": (1.12, 0.95, 1.12), "dedos": (1.1, 1.0, 1.1), "dedos_frente": (1.1, 1.0, 1.1)},
                     focinho=0.95, orelha=dict(tipo="caida", larg=0.075, comp=0.11),
                     cauda=dict(tipo="longa", comp=0.30, raio=0.028, curva=-0.25),
                     cores={"pelo": "#e8b04e", "marca": "#e8b04e", "nariz": "#4a2a20", "olho": "#2a1a12"},
                     zonas=[("patas_ponta", "#f4ead8")], coleira="#2e8fd6"),
    "rottweiler": dict(nome="Rottweiler", especie="cachorro", escala=0.97,
                       esqueleto={"tronco": (1.2, 0.95, 1.15), "pescoco": (1.25, 0.9, 1.15), "cabeca": (1.15, 0.95, 1.1),
                                  "pernas": (1.18, 0.92, 1.18), "dedos": (1.15, 1.0, 1.15), "dedos_frente": (1.15, 1.0, 1.15)},
                       focinho=0.85, orelha=dict(tipo="caida", larg=0.07, comp=0.085),
                       cauda=dict(tipo="longa", comp=0.2, raio=0.03, curva=0.35),
                       cores={"pelo": "#2a2526", "marca": "#9b5a2e", "nariz": "#151515", "olho": "#2a1a12"},
                       coleira="#d8303a"),
    "salsicha": dict(nome="Salsicha preto e castanho", especie="cachorro", escala=0.64,
                     esqueleto={"tronco": (1.15, 1.6, 1.1), "pescoco": (1.1, 0.9, 1.05), "cabeca": (1.12, 1.05, 1.08),
                                "coxas": (1.25, 0.42, 1.25), "canelas": (1.25, 0.42, 1.25), "pes": (1.2, 0.5, 1.2),
                                "bracos": (1.25, 0.42, 1.25), "antebracos": (1.25, 0.45, 1.25), "maos": (1.2, 0.55, 1.2),
                                "ombros": (1.0, 0.8, 1.0), "dedos": (1.2, 1.0, 1.25), "dedos_frente": (1.2, 1.0, 1.25)},
                     focinho=1.12, orelha=dict(tipo="caida", larg=0.07, comp=0.14),
                     cauda=dict(tipo="longa", comp=0.28, raio=0.022, curva=0.1),
                     cores={"pelo": "#241f20", "marca": "#9b5a2e", "nariz": "#151515", "olho": "#2a1a12"}),
    "salsicha_marrom": dict(base="salsicha", nome="Salsicha marrom",
                            cores={"pelo": "#8a4a2c", "marca": "#8a4a2c", "nariz": "#2a1a14", "olho": "#2a1a12"}),
    "spitz": dict(nome="Spitz branco", especie="cachorro", escala=0.62,
                  esqueleto={"tronco": (1.25, 0.82, 1.2), "pescoco": (1.3, 0.8, 1.2), "cabeca": (1.12, 0.95, 1.1),
                             "pernas_tras": (1.15, 0.8, 1.15), "pernas_frente": (1.15, 0.82, 1.15),
                             "dedos": (1.1, 0.95, 1.1), "dedos_frente": (1.1, 0.95, 1.1)},
                  focinho=0.62, focinho_larg=0.62, nariz=0.5, orelha=dict(tipo="pontuda", larg=0.075, comp=0.095),
                  fofo={"Spine2": 0.07, "Neck": 0.09, "Neck1": 0.07, "Spine1": 0.06, "Spine": 0.05, "Head": 0.018,
                        "Jaw": 0.03, "Thigh": 0.035, "Front_Shoulder": 0.05, "Front_Thigh": 0.03},
                  cauda=dict(tipo="enrolada", comp=0.32, raio=0.075),
                  cores={"pelo": "#f4f2ee", "marca": "#f4f2ee", "nariz": "#151515", "olho": "#1a1210",
                         "lingua": "#ff7a86"}),
    "lulu": dict(nome="Lulu branco", especie="cachorro", escala=0.42,
                 esqueleto={"tronco": (1.5, 0.62, 1.45), "pescoco": (1.4, 0.55, 1.35), "cabeca": (1.18, 0.9, 1.15),
                            "pernas_tras": (1.25, 0.45, 1.25), "pernas_frente": (1.25, 0.47, 1.25), "ombros": (1.2, 0.75, 1.2),
                            "dedos": (1.15, 0.9, 1.15), "dedos_frente": (1.15, 0.9, 1.15)},
                 focinho=0.45, focinho_larg=0.7, nariz=0.45, orelha=dict(tipo="pontuda", larg=0.06, comp=0.06),
                 fofo={"Spine2": 0.1, "Neck": 0.12, "Neck1": 0.1, "Spine1": 0.09, "Spine": 0.08, "Head": 0.03,
                       "Jaw": 0.05, "Thigh": 0.06, "Front_Shoulder": 0.08, "Front_Thigh": 0.05, "Shin": 0.025,
                       "Front_Shin": 0.025},
                 cauda=dict(tipo="pompom", comp=0.2, raio=0.11),
                 cores={"pelo": "#f6f4f0", "marca": "#f6f4f0", "nariz": "#151515", "olho": "#141010",
                        "lingua": "#ff7a86"}),
    "lulu_rosa": dict(base="lulu", nome="Lulu rosa",
                      cores={"pelo": "#f2b6c8", "marca": "#f2b6c8", "nariz": "#2a1a1e", "olho": "#141010"},
                      zonas=[("cauda_toda", "#f07aa6")]),
    "lulu_azul": dict(base="lulu", nome="Lulu azul",
                      cores={"pelo": "#9fd0f2", "marca": "#9fd0f2", "nariz": "#1a1c24", "olho": "#141010"}),
    # os gatos (gato, gato_frajola, gato_laranja) agora nascem do Kitty_001: bichos_estimacao_animals.py
    "golden": dict(nome="Golden retriever", especie="cachorro", escala=0.92,
                   esqueleto={"tronco": (1.1, 1.02, 1.08), "pescoco": (1.12, 0.95, 1.08), "cabeca": (1.06, 1.0, 1.04),
                              "pernas": (1.1, 0.95, 1.1), "dedos": (1.12, 1.0, 1.1), "dedos_frente": (1.12, 1.0, 1.1)},
                   focinho=0.95, orelha=dict(tipo="caida", larg=0.08, comp=0.13),
                   fofo={"Neck": 0.03, "Neck1": 0.02, "Spine2": 0.03, "Spine1": 0.015, "Thigh": 0.015,
                         "Front_Thigh": 0.012},
                   cauda=dict(tipo="longa", comp=0.34, raio=0.038, curva=-0.15),
                   cores={"pelo": "#e0a24a", "marca": "#e0a24a", "nariz": "#3a2420", "olho": "#2a1a12"},
                   zonas=[("peito", "#efc27c"), ("focinho_baixo", "#ebb868")]),
    "pastor": dict(nome="Pastor alemão", especie="cachorro", escala=0.97,
                   esqueleto={"tronco": (1.05, 1.1, 1.05), "pescoco": (1.1, 1.0, 1.05), "cabeca": (1.02, 1.05, 1.0),
                              "pernas_frente": (1.05, 0.98, 1.05), "pernas_tras": (1.05, 0.95, 1.05)},
                   focinho=1.02, orelha=dict(tipo="pontuda", larg=0.085, comp=0.13),
                   fofo={"Neck": 0.025, "Neck1": 0.02, "Spine2": 0.02},
                   cauda=dict(tipo="longa", comp=0.36, raio=0.04, curva=-0.35),
                   cores={"pelo": "#c8843e", "marca": "#c8843e", "nariz": "#151515", "olho": "#2a1a12",
                          "orelha": "#2a2426", "cauda": "#3a3032"},
                   zonas=[("costas", "#262224"), ("focinho_todo", "#2a2426")]),
    "husky": dict(nome="Husky siberiano", especie="cachorro", escala=0.88,
                  esqueleto={"tronco": (1.08, 0.98, 1.05), "pescoco": (1.1, 0.95, 1.05), "cabeca": (1.04, 0.95, 1.02),
                             "pernas": (1.05, 0.95, 1.05)},
                  focinho=0.88, orelha=dict(tipo="pontuda", larg=0.075, comp=0.095),
                  fofo={"Neck": 0.04, "Neck1": 0.03, "Spine2": 0.035, "Spine1": 0.02, "Head": 0.008},
                  cauda=dict(tipo="enrolada", comp=0.3, raio=0.06),
                  cores={"pelo": "#f2f2f4", "marca": "#f2f2f4", "nariz": "#1a1a1c", "olho": "#4aa6ee",
                         "orelha": "#5b6068", "cauda": "#5b6068"},
                  zonas=[("costas", "#5b6068"), ("cabeca_topo", "#5b6068")]),
    "poodle": dict(nome="Poodle", especie="cachorro", escala=0.55,
                   esqueleto={"tronco": (1.1, 0.88, 1.1), "pescoco": (1.0, 1.05, 1.0), "cabeca": (1.0, 1.0, 1.0),
                              "pernas": (1.0, 1.02, 1.0)},
                   focinho=1.05, focinho_larg=0.78, nariz=0.8, orelha=dict(tipo="caida", larg=0.1, comp=0.14),
                   fofo={"Spine2": 0.07, "Neck": 0.07, "Neck1": 0.06, "Spine1": 0.06, "Spine": 0.06, "Head": 0.02,
                         "Thigh": 0.045, "Front_Shoulder": 0.045, "Front_Thigh": 0.03, "Shin": 0.02, "Front_Shin": 0.02},
                   cauda=dict(tipo="pompom", comp=0.15, raio=0.075), topete=0.075,
                   cores={"pelo": "#e9b98a", "marca": "#e9b98a", "nariz": "#2a1a14", "olho": "#1a1210"}),
    "buldogue": dict(nome="Buldogue inglês", especie="cachorro", escala=0.6,
                     esqueleto={"tronco": (1.4, 0.82, 1.18), "pescoco": (1.45, 0.6, 1.25), "cabeca": (1.3, 0.92, 1.18),
                                "coxas": (1.3, 0.7, 1.3), "canelas": (1.3, 0.7, 1.3), "pes": (1.25, 0.75, 1.25),
                                "bracos": (1.35, 0.7, 1.35), "antebracos": (1.35, 0.72, 1.35), "maos": (1.25, 0.8, 1.25),
                                "ombros": (1.25, 0.85, 1.25), "dedos": (1.3, 1.0, 1.3), "dedos_frente": (1.3, 1.0, 1.3)},
                     focinho=0.32, focinho_larg=1.1, nariz=0.8, orelha=dict(tipo="caida", larg=0.055, comp=0.05),
                     fofo={"Jaw": 0.03, "Head": 0.012, "Neck": 0.04, "Neck1": 0.03, "Spine2": 0.03},
                     cauda=dict(tipo="longa", comp=0.08, raio=0.03, curva=-0.5),
                     cores={"pelo": "#f2ebe0", "marca": "#f2ebe0", "nariz": "#1a1414", "olho": "#2a1a12",
                            "orelha": "#c98a52"},
                     zonas=[("costas", "#c98a52"), ("cabeca_topo", "#c98a52")]),
    "caramelo": dict(nome="Vira-lata caramelo", especie="cachorro", escala=0.8,
                     esqueleto={"tronco": (0.98, 1.0, 1.0), "pescoco": (1.0, 0.95, 1.0), "cabeca": (1.04, 0.95, 1.02),
                                "pernas": (1.0, 0.95, 1.0)},
                     focinho=0.9, orelha=dict(tipo="caida", larg=0.07, comp=0.085),
                     cauda=dict(tipo="longa", comp=0.32, raio=0.026, curva=0.55),
                     cores={"pelo": "#c97d36", "marca": "#c97d36", "nariz": "#2a1a14", "olho": "#2a1a12"},
                     zonas=[("peito", "#e6b47c"), ("focinho_baixo", "#e2ab70"), ("patas_ponta", "#e6b47c")]),
}


def bicho(id_):
    b = dict(BICHOS[id_])
    if "base" in b:
        base = dict(BICHOS[b.pop("base")])
        base.update(b)
        b = base
    return b


# ---------------------------------------------------------------- carga do Doberman
def carrega():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=FBX)
    arm = bpy.data.objects["Doberman_Rig"]
    me = bpy.data.objects["Doberman"]
    for o in list(bpy.data.objects):
        if o.type == "MESH" and o is not me:
            bpy.data.objects.remove(o, do_unlink=True)
    arm.data.pose_position = "REST"
    return arm, me


def _fcurves(a):
    return [fc for lay in a.layers for st in lay.strips for cb in st.channelbags for fc in cb.fcurves]


class Base:
    """O Doberman em arrays (espaço do mundo, em descanso)."""

    def __init__(self, arm, me):
        self.arm, self.me = arm, me
        mw = me.matrix_world
        self.V = np.array([tuple(mw @ v.co) for v in me.data.vertices])
        self.nomes = [b.name for b in arm.data.bones]
        self.idx = {n: i for i, n in enumerate(self.nomes)}
        self.pai = [self.idx[b.parent.name] if b.parent else -1 for b in arm.data.bones]
        aw = arm.matrix_world
        self.H = np.array([tuple(aw @ b.head_local) for b in arm.data.bones])
        self.R = np.array([np.array((aw.to_3x3() @ b.matrix_local.to_3x3()).normalized()) for b in arm.data.bones])
        self.L = np.array([b.length for b in arm.data.bones])
        gn = {g.index: g.name for g in me.vertex_groups}
        self.W = np.zeros((len(self.V), len(self.nomes)))
        for v in me.data.vertices:
            for g in v.groups:
                if gn[g.group] in self.idx:
                    self.W[v.index, self.idx[gn[g.group]]] = g.weight
        s = self.W.sum(1, keepdims=True)
        self.W /= np.where(s > 0, s, 1)
        self.dom = self.W.argmax(1)
        self.F = [list(p.vertices) for p in me.data.polygons]
        # cor de cada face, da textura (paleta com sombra pintada)
        img = bpy.data.images.load(TEX)
        Wt, Ht = img.size
        px = np.array(img.pixels[:]).reshape(Ht, Wt, 4)[:, :, :3]
        uv = me.data.uv_layers.active.data
        self.Fcor = []
        for p in me.data.polygons:
            us = np.array([uv[i].uv[:] for i in p.loop_indices]).mean(0)
            x = min(int(us[0] % 1 * Wt), Wt - 1)
            y = min(int(us[1] % 1 * Ht), Ht - 1)
            self.Fcor.append(px[y, x])
        self.Fcor = np.array(self.Fcor)
        self.Fc = np.array([self.V[f].mean(0) for f in self.F])
        self.Fdom = np.array([np.bincount(self.dom[f]).argmax() for f in self.F])  # o osso de cada face
        self.Fn = np.array([self._normal(f) for f in self.F])
        self.classes()

    def _normal(self, f):
        p = self.V[f]
        n = np.cross(p[1] - p[0], p[2] - p[0])
        return n / (np.linalg.norm(n) + 1e-12)

    def classes(self):
        r, g, b = self.Fcor[:, 0], self.Fcor[:, 1], self.Fcor[:, 2]
        cl = np.full(len(self.F), "pelo", dtype=object)
        cl[(r - g) > 0.15] = "marca"
        cl[((r - g) > 0.07) & ((r - g) <= 0.15)] = "boca"
        cl[r > 0.8] = "lingua"
        escuro = (self.Fcor.max(1) < 0.15) & (g >= r - 0.01)
        cl[escuro] = "olho"
        # o focinho (nariz) é a parte escura mais à frente
        frente = -self.Fc[:, 1]
        cab = escuro & np.isin(self.Fdom, [self.idx["Head"], self.idx["Jaw"]])
        if cab.any():
            fmax = frente[cab].max()
            cl[cab & (frente > fmax - 0.045)] = "nariz"
        self.Fcls = cl
        lum = self.Fcor @ np.array([0.3, 0.59, 0.11])
        self.Fsombra = np.ones(len(self.F))
        for c in set(cl):
            m = cl == c
            med = np.median(lum[m])
            self.Fsombra[m] = np.clip(lum[m] / max(med, 1e-3), 0.72, 1.3)
        # o centro dos olhos (para o focinho encolher à frente deles)
        olho = cl == "olho"
        self.olho_y = self.Fc[olho, 1].mean() if olho.any() else self.H[self.idx["Head"], 1]

    # zonas pintadas por cima, na geometria do Doberman
    def zona(self, nome):
        dom = np.array([self.nomes[i] for i in self.Fdom])
        Fc, Fn = self.Fc, self.Fn
        cab = np.isin(dom, ["Head", "Jaw"])
        if nome == "patas":
            return np.isin(dom, GRUPOS["patas"] + GRUPOS["maos"] + GRUPOS["pes"]) & (Fc[:, 2] < 0.2)
        if nome == "patas_ponta":
            return np.isin(dom, GRUPOS["patas"]) & (Fc[:, 2] < 0.05)
        if nome == "peito":  # peito e barriga: na frente do tronco e por baixo
            frente = np.isin(dom, ["Spine2", "Neck", "Neck1", "Front_Shoulder.L", "Front_Shoulder.R", "Spine1"])
            return frente & ((Fn[:, 2] < -0.25) | ((Fn[:, 1] < -0.45) & (Fc[:, 2] < 0.7)))
        if nome == "focinho_baixo":  # a boca e o queixo, abaixo dos olhos
            return cab & (Fc[:, 2] < self.H[self.idx["Head"], 2] - 0.0) & (Fc[:, 1] < self.olho_y + 0.01)
        if nome == "costas":  # a sela: o alto do tronco e do pescoço
            tr = np.isin(dom, ["Spine", "Spine1", "Spine2", "Neck", "Tail", "Thigh.L", "Thigh.R"])
            return tr & (Fn[:, 2] > 0.1) & (Fc[:, 2] > self.H[self.idx["Spine1"], 2] - 0.07)
        if nome == "cabeca_topo":  # o alto da cabeça e a nuca (acima dos olhos)
            alto = cab & (Fc[:, 2] > self.H[self.idx["Head"], 2] + 0.005)
            nuca = np.isin(dom, ["Neck1"]) & (Fn[:, 2] > -0.2) & (Fn[:, 1] > -0.3)
            return alto | nuca
        if nome == "focinho_todo":  # à frente dos olhos
            return cab & (Fc[:, 1] < self.olho_y - 0.015)
        if nome == "cauda_toda":
            return np.zeros(len(self.F), bool)  # a cauda trocada é pintada na própria peça
        raise KeyError(nome)


# ---------------------------------------------------------------- proporções
def fatores(base, b):
    """Fatores (largura, comprimento, altura) e giro de descanso de cada osso."""
    n = len(base.nomes)
    S = np.ones((n, 3)) * b.get("escala", 1.0)
    Q = [None] * n
    for chave, f in (b.get("esqueleto") or {}).items():
        for nome in GRUPOS.get(chave, [chave]):
            S[base.idx[nome]] *= np.array(f)
    for nome, ang in (b.get("rot") or {}).items():
        Q[base.idx[nome]] = np.array(Euler([math.radians(a) for a in ang]).to_matrix())
    return S, Q


def monta(base, S, Q, raiz_extra=0.0, raiz="Bone"):
    """Esqueleto novo, do quadril para as pontas: cabeça de cada osso, referencial e comprimento. O osso `raiz` (a raiz
    no chão) cresce `raiz_extra` para o quadril subir ou descer."""
    n = len(base.nomes)
    H2, R2 = np.zeros((n, 3)), np.zeros((n, 3, 3))
    for i in range(n):
        p = base.pai[i]
        if p < 0:
            H2[i] = base.H[i]
            R2[i] = base.R[i]
        else:
            off = base.H[i] - base.H[p]
            sp = S[p].copy()
            if p == base.idx[raiz]:
                sp = np.array([1, (base.L[p] * S[p][1] + raiz_extra) / base.L[p], 1])
            H2[i] = H2[p] + R2[p] @ (sp * (base.R[p].T @ off))
            R2[i] = R2[p] @ base.R[p].T @ base.R[i]
        if Q[i] is not None:
            R2[i] = R2[i] @ Q[i]
    L2 = base.L * S[:, 1]
    return H2, R2, L2


def deforma(base, S, H2, R2, pts=None, pesos=None):
    """Cada ponto vai com os ossos que o puxam: soma dos pesos × (cabeça nova + R' S Rᵀ (p − cabeça))."""
    P = base.V if pts is None else pts
    Wp = base.W if pesos is None else pesos
    out = np.zeros_like(P)
    for i in range(len(base.nomes)):
        w = Wp[:, i]
        m = w > 0
        if not m.any():
            continue
        M = R2[i] @ np.diag(S[i]) @ base.R[i].T
        out[m] += w[m, None] * (H2[i] + (P[m] - base.H[i]) @ M.T)
    return out


def normais_vertice(V, F):
    N = np.zeros_like(V)
    for f in F:
        p = V[f]
        n = np.cross(p[1] - p[0], p[2] - p[0])
        for k in f:
            N[k] += n
    return N / (np.linalg.norm(N, axis=1, keepdims=True) + 1e-12)


# ---------------------------------------------------------------- peças geradas
class Pecas:
    """Malha extra (orelhas, cauda, coleira...): pontos, faces, cor por face e o osso de cada ponto."""

    def __init__(self):
        self.V, self.F, self.Fcor, self.osso = [], [], [], []

    def add(self, pts, faces, cores, osso):
        o = len(self.V)
        self.V += [tuple(p) for p in pts]
        self.F += [[o + k for k in f] for f in faces]
        self.Fcor += list(cores) if isinstance(cores, list) else [cores] * len(faces)
        self.osso += [osso] * len(pts)


def tubo(curva, raios, seg=6, tampa=True):
    """Tubo low poly ao longo de uma curva (pontos), com o raio de cada anel."""
    curva = [np.array(c, float) for c in curva]
    pts, fs = [], []
    t0 = curva[1] - curva[0]
    t0 /= np.linalg.norm(t0)
    ref = np.array([0, 0, 1.0]) if abs(t0[2]) < 0.9 else np.array([1.0, 0, 0])
    nrm = ref - t0 * ref.dot(t0)
    nrm /= np.linalg.norm(nrm)
    for i, c in enumerate(curva):
        t = curva[min(i + 1, len(curva) - 1)] - curva[max(i - 1, 0)]
        t /= np.linalg.norm(t)
        nrm = nrm - t * nrm.dot(t)
        nrm /= np.linalg.norm(nrm)
        bn = np.cross(t, nrm)
        for k in range(seg):
            a = 2 * math.pi * k / seg
            pts.append(c + (nrm * math.cos(a) + bn * math.sin(a)) * raios[i])
    for i in range(len(curva) - 1):
        for k in range(seg):
            a, b2 = i * seg + k, i * seg + (k + 1) % seg
            fs.append([a, b2, b2 + seg, a + seg])
    if tampa:
        fs.append(list(reversed(range(seg))))
        n = len(curva) - 1
        fs.append([n * seg + k for k in range(seg)])
    return pts, fs


def esfera(c, r, sub=1):
    """Icosfera low poly (pontos, faces)."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
    pts = [np.array(c) + np.array(v.co) * np.array(r) for v in bm.verts]
    fs = [[v.index for v in f.verts] for f in bm.faces]
    bm.free()
    return pts, fs


def folha(origem, u, v, larg, comp, esp, forma="caida"):
    """Orelha chata: contorno no plano (u na largura, v no comprimento), com espessura (na normal u × v).
    Devolve pontos, faces e quais faces são da frente (dentro da orelha)."""
    u, v = np.array(u) / np.linalg.norm(u), np.array(v) / np.linalg.norm(v)
    n = np.cross(u, v)
    if forma == "caida":  # aba arredondada, mais larga embaixo
        cont = [(-0.45, 0.0), (-0.55, 0.35), (-0.58, 0.7), (-0.4, 0.95), (0.0, 1.05), (0.4, 0.95), (0.58, 0.7),
                (0.55, 0.35), (0.45, 0.0)]
    else:  # triângulo (pontuda e de gato)
        cont = [(-0.5, 0.0), (-0.28, 0.5), (0.0, 1.0), (0.28, 0.5), (0.5, 0.0)]
    pts = []
    for s in (1, -1):
        for a, b2 in cont:
            pts.append(np.array(origem) + u * a * larg + v * b2 * comp + n * s * esp * 0.5)
    m = len(cont)
    fs = [list(range(m)), list(reversed(range(m, 2 * m)))]
    frente = [True, False]
    for k in range(m - 1):
        fs.append([k + 1, k, m + k, m + k + 1])
        frente.append(False)
    fs.append([0, m - 1, 2 * m - 1, m])
    frente.append(False)
    return pts, fs, frente


# ---------------------------------------------------------------- um bicho
def _cor(h, sombra=1.0):
    c = np.array(_h(h)) if isinstance(h, str) else np.array(h)
    return np.clip(c * sombra, 0, 1)


def faz(base, id_):
    b = bicho(id_)
    S, Q = fatores(base, b)
    # duas passadas: a segunda sobe (ou desce) o quadril para os pés ficarem no chão
    H2, R2, L2 = monta(base, S, Q)
    V2 = deforma(base, S, H2, R2)
    pes = np.isin(base.dom, [base.idx[n] for n in GRUPOS["patas"]])
    sobe = -V2[pes, 2].min()
    H2, R2, L2 = monta(base, S, Q, raiz_extra=sobe)
    V2 = deforma(base, S, H2, R2)
    alt_quadril = H2[base.idx["Spine1"], 2] / base.H[base.idx["Spine1"], 2]
    iH, iJ = base.idx["Head"], base.idx["Jaw"]
    # focinho: a parte da cabeça à frente dos olhos encolhe ou cresce (ao longo da direção da cabeça para a frente)
    k = b.get("focinho", 1.0)
    if k != 1.0:
        cab = (base.W[:, iH] + base.W[:, iJ])
        olho2 = deforma(base, S, H2, R2, pts=np.array([[0, base.olho_y, base.H[iH, 2]]]),
                        pesos=np.eye(len(base.nomes))[[iH]])[0]
        f = -(V2[:, 1] - olho2[1])
        m = (f > 0) & (cab > 0)
        V2[m, 1] = olho2[1] - (olho2[1] - V2[m, 1]) * (1 + (k - 1) * cab[m])
        # focinho curto: a ponta desce um pouco para o nariz não ficar no ar
        if k < 0.8:
            V2[m, 2] -= (1 - k) * 0.25 * f[m] * cab[m]
    # focinho mais fino (spitz, lulu, gato): à frente dos olhos, a largura e a altura encolhem aos poucos até a ponta
    iH, iJ = base.idx["Head"], base.idx["Jaw"]
    cab = base.W[:, iH] + base.W[:, iJ]
    nariz_v = sorted({v for i in range(len(base.F)) if base.Fcls[i] == "nariz" for v in base.F[i]})
    kw = b.get("focinho_larg", 1.0)
    if kw != 1.0 and nariz_v:
        olho2 = deforma(base, S, H2, R2, pts=np.array([[0, base.olho_y, base.H[iH, 2]]]), pesos=np.eye(len(base.nomes))[[iH]])[0]
        f = -(V2[:, 1] - olho2[1])
        m = (f > 0) & (cab > 0.3)
        fmax = f[m].max()
        zc = V2[nariz_v, 2].mean()
        tt = np.clip(f / fmax, 0, 1) ** 0.8
        V2[m, 0] *= 1 + (kw - 1) * tt[m]
        V2[m, 2] = zc + (V2[m, 2] - zc) * (1 + (kw - 1) * 0.6 * tt[m])
    kn = b.get("nariz", 1.0)
    if kn != 1.0 and nariz_v:
        cn = V2[nariz_v].mean(0)
        V2[nariz_v] = cn + (V2[nariz_v] - cn) * kn
        V2[nariz_v, 1] -= (1 - kn) * 0.004 * b.get("escala", 1.0)  # um pouco para fora, para não afundar
    # pelo fofo: infla pela normal, por osso
    fofo = b.get("fofo")
    if fofo:
        N = normais_vertice(V2, base.F)
        amt = np.zeros(len(V2))
        for nome, a in fofo.items():
            for osso in [n for n in base.nomes if n == nome or n.startswith(nome + ".")]:
                amt += base.W[:, base.idx[osso]] * a
        V2 = V2 + N * (amt * b.get("escala", 1.0))[:, None]
    # orelhas e cauda trocadas: as do Doberman se recolhem para a base (escondidas sob a peça nova, sem buraco)
    recolhe = []
    if b.get("orelha"):
        recolhe += ["Ear.L", "Ear.R"]
    if b.get("cauda"):
        recolhe.append("Tail")
    for nome in recolhe:
        i = base.idx[nome]
        w = base.W[:, i]
        m = w > 0
        V2[m] = V2[m] - (w[m, None] * 0.9) * (V2[m] - H2[i])
    manter = list(range(len(base.F)))
    # cores das faces
    cores = b["cores"]
    pad = {"boca": "#5a2a26", "lingua": "#ff6a76"}
    Fcol = []
    zonas = [(base.zona(z), c) for z, c in b.get("zonas", [])]
    for i in range(len(base.F)):
        cl = base.Fcls[i]
        c = cores.get(cl) or pad.get(cl) or cores["pelo"]
        if cl in ("pelo", "marca"):
            for m, cz in zonas:
                if m[i]:
                    c = cz
        Fcol.append(_cor(c, base.Fsombra[i] if cl in ("pelo", "marca", "boca") else 1.0))
    ex = Pecas()
    esc = b.get("escala", 1.0)
    # orelhas
    ore = b.get("orelha")
    if ore:
        for lado, sx in (("L", 1), ("R", -1)):
            i = base.idx["Ear." + lado]
            h = H2[i]
            larg, comp = ore["larg"] * esc * 1.0, ore["comp"] * esc
            corpo_c = _cor(cores.get("orelha", cores["pelo"])); dentro = _cor(cores.get("dentro_orelha", cores.get("marca", cores["pelo"])), 0.85)
            if ore["tipo"] == "caida":
                # presa no alto da cabeça, de lado, caindo pela lateral (um pouco para a frente)
                orig = h + np.array([sx * 0.006, 0.004, 0.006]) * esc
                v = np.array([sx * 0.45, -0.18, -1.0])
                u = np.array([0, -1.0, 0.18])
                pts, fs, fr = folha(orig, u, v, larg, comp, 0.012 * esc, "caida")
                ex.add(pts, fs, [dentro if (q and sx > 0) or (q and sx < 0) else corpo_c for q in fr], "Ear." + lado)
            else:  # pontuda (lulu, spitz) e de gato: triângulo em pé, um pouco para fora (acima do pelo fofo)
                orig = h + np.array([sx * 0.004, 0.0, -0.01]) * esc + np.array([0, 0, (b.get("fofo") or {}).get("Head", 0) * esc * 0.9])
                v = np.array([sx * 0.32, 0.05, 1.0])
                u = np.array([1.0, 0.1, -0.3 * sx])
                pts, fs, fr = folha(orig, u, v, larg, comp, 0.014 * esc, "pontuda")
                cor_f = _cor(cores.get("dentro_orelha", "#f0b8c0")) if ore["tipo"] == "gato" else _cor(cores["pelo"], 0.92)
                ex.add(pts, fs, [cor_f if q else corpo_c for q in fr], "Ear." + lado)
    # cauda
    cau = b.get("cauda")
    if cau:
        i = base.idx["Tail"]
        h = H2[i] + np.array([0, -0.01, 0]) * esc
        cc = _cor(cores.get("cauda", cores["pelo"]))
        ponta = _cor(dict(b.get("zonas", [])).get("cauda_toda", cores.get("cauda", cores["pelo"])))
        comp, r0 = cau["comp"] * esc, cau["raio"] * esc
        if cau["tipo"] in ("longa", "gato"):
            n = 7
            curva, raios = [], []
            for k in range(n):
                t = k / (n - 1)
                if cau["tipo"] == "gato":  # sai para trás, sobe e a ponta dobra de volta (um S suave)
                    p = h + np.array([0, comp * (0.55 * t - 0.3 * t ** 3), comp * 0.8 * math.sin(t * math.pi / 2) ** 1.4])
                else:  # cachorro: para trás e para baixo (curva < 0) ou para cima
                    ang = math.radians(cau.get("curva", 0) * 90 * t - 10)
                    p = h + np.array([0, math.cos(ang), math.sin(ang)]) * comp * t
                curva.append(p)
                raios.append(r0 * (1 - 0.65 * t) if cau["tipo"] == "longa" else r0 * (1 - 0.3 * t))
            pts, fs = tubo(curva, raios, seg=6)
            ex.add(pts, fs, [cc] * len(fs), "Tail")
        elif cau["tipo"] == "enrolada":  # spitz: pluma enrolada por cima das costas
            n = 8
            curva, raios = [], []
            for k in range(n):
                t = k / (n - 1)
                ang = math.radians(70 + 200 * t)
                rr = comp * 0.42 * (1 - 0.35 * t)
                p = h + np.array([0, 0.02, 0]) * esc + np.array([0, math.cos(ang) * rr - rr * math.cos(math.radians(70)),
                                                                   math.sin(ang) * rr - rr * math.sin(math.radians(70)) + 0.02 * esc])
                curva.append(p)
                raios.append(r0 * (0.55 + 0.6 * math.sin(math.pi * min(t * 1.2, 1))) )
            pts, fs = tubo(curva, raios, seg=7)
            ex.add(pts, fs, [cc] * len(fs), "Tail")
        elif cau["tipo"] == "pompom":  # lulu: bola fofa em cima do quadril
            pts, fs = esfera(h + np.array([0, 0.25 * r0, 0.75 * r0]), (r0 * 0.95, r0 * 1.05, r0 * 0.9), sub=2)
            ex.add(pts, fs, [ponta] * len(fs), "Tail")
    # coleira: anel em volta do pescoço
    if b.get("coleira"):
        iN = base.idx["Neck"]
        a, z = H2[iN], H2[iN] + R2[iN][:, 1] * L2[iN]
        c = a * 0.5 + z * 0.5
        eixo = (z - a) / np.linalg.norm(z - a)
        # o anel acompanha o pescoço: em cada uma das 16 direções em volta do eixo, a pele mais longe (numa faixa de
        # 2 cm ao longo do eixo) mais 7 mm
        u0 = np.cross(eixo, [1.0, 0, 0]); u0 /= np.linalg.norm(u0)
        u1 = np.cross(eixo, u0)
        d = V2 - c
        ao_longo = d @ eixo
        so_pescoco = np.isin(base.dom, [base.idx[n] for n in ("Spine2", "Neck", "Neck1")])
        perto = (np.abs(ao_longo) < 0.02 * esc) & so_pescoco
        dl = d[perto] - np.outer(ao_longo[perto], eixo)
        meio = (dl.max(0) + dl.min(0)) / 2  # o osso fica perto da nuca: o anel se centra no meio do pescoço
        meio -= eixo * meio.dot(eixo)
        c = c + meio
        dl = dl - meio
        ang = np.arctan2(dl @ u1, dl @ u0)
        rad = np.linalg.norm(dl, axis=1)
        raios = []
        for k in range(16):
            a0 = -math.pi + 2 * math.pi * k / 16
            dif = np.abs((ang - a0 + math.pi) % (2 * math.pi) - math.pi)
            sel = dif < math.pi / 10
            raios.append(np.percentile(rad[sel], 80) if sel.sum() > 2 else np.median(rad))
        # onde o pescoço encontra as costas a pele vai longe: cada direção fica perto da mediana e é suavizada
        raios = np.array(raios)
        med = np.median(raios)
        raios = np.clip(raios, med * 0.85, med * 1.18)
        raios = (np.roll(raios, 1) + 2 * raios + np.roll(raios, -1)) / 4 + 0.007 * esc
        pts, fs = [], []
        for s_, off in enumerate((-0.012, 0.012)):
            for k in range(16):
                a0 = -math.pi + 2 * math.pi * k / 16
                pts.append(c + eixo * off * esc + (u0 * math.cos(a0) + u1 * math.sin(a0)) * raios[k])
        for k in range(16):
            fs.append([k, (k + 1) % 16, 16 + (k + 1) % 16, 16 + k])
        r = max(raios)
        ex.add(pts, fs, [_cor(b["coleira"])] * len(fs), "@pele")  # pesos do vértice da pele mais perto
        # plaquinha
        frente = np.array([0, -1.0, -0.4]); frente /= np.linalg.norm(frente)
        pa = np.array(pts[:16])  # o ponto do anel mais à frente e embaixo, com a plaquinha pendurada nele
        pf = pa[np.argmax((pa - c) @ frente)]
        dirp = (pf - c) / np.linalg.norm(pf - c)
        pp, ff = esfera(pf + dirp * 0.006 * esc + np.array([0, 0, -0.008 * esc]), (0.009 * esc, 0.004 * esc, 0.011 * esc), sub=1)
        ex.add(pp, ff, [_cor("#e8c040")] * len(ff), "@pele")
    # topete (poodle): bola de pelo no alto da cabeça
    if b.get("topete"):
        cabv = np.nonzero(base.dom == iH)[0]
        alto = cabv[V2[cabv, 2] >= np.percentile(V2[cabv, 2], 80)]
        c = V2[alto].mean(0)
        rt = b["topete"] * esc
        pts, fs = esfera(c + np.array([0, 0.25 * rt, 0.35 * rt]), (rt * 0.95, rt * 1.05, rt * 0.85), sub=2)
        ex.add(pts, fs, [_cor(cores["pelo"], 1.04)] * len(fs), "Head")
    # bigode (gato): três fios finos de cada lado do focinho
    if b.get("bigode"):
        nariz = V2[[v for i in range(len(base.F)) if base.Fcls[i] == "nariz" for v in base.F[i]]].mean(0)
        for sx in (1, -1):
            for k, dz in enumerate((0.006, -0.002, -0.01)):
                o = nariz + np.array([sx * 0.012, 0.02, -0.012 + dz]) * esc / 0.6
                fim = o + np.array([sx * 0.07, 0.01, dz * 1.5 + (0.01 - 0.01 * k)]) * esc / 0.6
                pts, fs = tubo([o, fim], [0.0018 * esc / 0.6, 0.001 * esc / 0.6], seg=3)
                ex.add(pts, fs, [_cor("#f2f2f2")] * len(fs), "Head")
    return dict(b=b, S=S, H2=H2, R2=R2, L2=L2, V=V2, manter=manter, Fcol=Fcol, ex=ex, alt_quadril=alt_quadril)


# ---------------------------------------------------------------- monta no Blender e exporta
def malha_pesos(base, r):
    """Os vértices do bicho (os do Doberman usados + os das peças) e os pesos de cada osso, na ordem da malha final.
    A coleira leva a média dos pesos dos 8 vértices do pescoço mais perto (dobra junto com ele)."""
    V, ex = r["V"], r["ex"]
    usados = sorted({v for i in r["manter"] for v in base.F[i]})
    pts = np.array([V[v] for v in usados] + [tuple(p) for p in ex.V])
    Wt = np.zeros((len(pts), len(base.nomes)))
    Wt[:len(usados)] = base.W[usados]
    pesc = np.nonzero(np.isin(base.dom, [base.idx[n] for n in ("Spine2", "Neck", "Neck1")]))[0]
    for k, osso in enumerate(ex.osso):
        j = len(usados) + k
        if osso == "@pele":
            p = np.array(ex.V[k])
            dist = np.linalg.norm(V[pesc] - p, axis=1)
            viz = pesc[np.argsort(dist)[:8]]
            w = base.W[viz].mean(0)
            w = np.where(w > 0.01, w, 0)
            Wt[j] = w / w.sum()
        else:
            Wt[j, base.idx[osso]] = 1.0
    return pts, Wt


def objeto(base, r, id_):
    """Esqueleto (cópia do Doberman com o descanso novo) e malha com cor por face e pesos."""
    arm0 = base.arm
    arm = arm0.copy()
    arm.data = arm0.data.copy()
    arm.name = arm.data.name = "bicho_" + id_
    bpy.context.scene.collection.objects.link(arm)
    arm.data.pose_position = "POSE"
    for o in bpy.context.selected_objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    awi = arm.matrix_world.inverted()
    ebs = arm.data.edit_bones
    for eb in ebs:
        eb.use_connect = False
    for i, nome in enumerate(base.nomes):
        eb = ebs[nome]
        M = Matrix.Identity(4)
        R = Matrix([list(row) for row in r["R2"][i]])
        M = Matrix.Translation(Vector(r["H2"][i])) @ R.to_4x4()
        eb.matrix = awi @ M
        eb.length = max(r["L2"][i], 1e-4)
    bpy.ops.object.mode_set(mode="OBJECT")
    # malha
    V = r["V"]
    ex = r["ex"]
    manter = r["manter"]
    usados = sorted({v for i in manter for v in base.F[i]})
    novo = {v: k for k, v in enumerate(usados)}
    pts = [tuple(V[v]) for v in usados] + list(ex.V)
    o_ex = len(usados)
    faces = [[novo[v] for v in base.F[i]] for i in manter] + [[o_ex + k for k in f] for f in ex.F]
    fcol = [r["Fcol"][i] for i in manter] + [np.array(c) for c in ex.Fcor]
    mesh = bpy.data.meshes.new("bicho_" + id_)
    mesh.from_pydata(pts, [], faces)
    mesh.update()
    ob = bpy.data.objects.new("bicho_" + id_ + "_malha", mesh)
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = arm
    ob.matrix_parent_inverse = arm.matrix_world.inverted()
    for nome in base.nomes:
        ob.vertex_groups.new(name=nome)
    for k, v in enumerate(usados):
        for i in np.nonzero(base.W[v])[0]:
            ob.vertex_groups[base.nomes[i]].add([k], float(base.W[v, i]), "REPLACE")
    _, Wx = malha_pesos(base, r)
    for k in range(len(ex.V)):
        w = Wx[o_ex + k]
        for i in np.nonzero(w > 0)[0]:
            ob.vertex_groups[base.nomes[i]].add([o_ex + k], float(w[i]), "REPLACE")
    mod = ob.modifiers.new("Armature", "ARMATURE")
    mod.object = arm
    ca = mesh.color_attributes.new("Col", "BYTE_COLOR", "CORNER")
    mesh.color_attributes.active_color = ca
    mesh.color_attributes.render_color_index = mesh.color_attributes.active_color_index
    for p in mesh.polygons:
        c = fcol[p.index]
        for li in p.loop_indices:
            ca.data[li].color = (c[0] ** 2.2, c[1] ** 2.2, c[2] ** 2.2, 1.0)  # linear
        p.use_smooth = False
    mat = bpy.data.materials.new("bicho_" + id_)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    at = nt.nodes.new("ShaderNodeVertexColor")
    at.layer_name = "Col"
    nt.links.new(at.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.85
    mesh.materials.append(mat)
    return arm, ob


def acoes(base, arm, r, id_):
    """Cópia das 11 animações do Doberman, com o deslocamento ajustado ao tamanho do bicho, em trilhas NLA."""
    esc = r["b"].get("escala", 1.0)
    kq = r["alt_quadril"]
    ad = arm.animation_data or arm.animation_data_create()
    ad.action = None
    for t in list(ad.nla_tracks):
        ad.nla_tracks.remove(t)
    feitas = []
    for a0 in [a for a in bpy.data.actions if a.name.startswith("Doberman_Rig|")]:
        chave = a0.name.split("_")[-1]
        if chave not in ANIMACOES:
            continue
        a = a0.copy()
        a.name = id_ + "|" + ANIMACOES[chave][0]
        for lay in a.layers:  # as curvas do próprio objeto (constantes: o giro do FBX) saem, para o bicho poder ser posto
            for st in lay.strips:  # em qualquer lugar
                for cb in st.channelbags:
                    for fc in [fc for fc in cb.fcurves if '"' not in fc.data_path]:
                        cb.fcurves.remove(fc)
        for fc in _fcurves(a):
            dp = fc.data_path
            if not dp.endswith("location"):
                continue
            k = kq if '"Spine1"' in dp else esc
            for kp in fc.keyframe_points:
                kp.co[1] *= k
                kp.handle_left[1] *= k
                kp.handle_right[1] *= k
        t = ad.nla_tracks.new()
        t.name = ANIMACOES[chave][0]  # o nome da animação no GLB
        st = t.strips.new(a.name, int(a.frame_range[0]), a)
        if a.slots:
            st.action_slot = a.slots[0]
        t.mute = True
        feitas.append(t.name)
    return feitas


def _anim():
    """O motor e os clipes compostos (em módulos ao lado; importados só aqui, para quem importa o bichos.py)."""
    aqui = os.path.dirname(os.path.abspath(__file__))
    if aqui not in sys.path:
        sys.path.insert(0, aqui)
    import bichos_estimacao_anim as anim
    import bichos_estimacao_clipes as clipes
    return anim, clipes


def rig_do_bicho(base, r):
    """O esqueleto do bicho (descanso novo) com a malha e os pesos, para o motor das animações compostas."""
    anim, _ = _anim()
    V, Wt = malha_pesos(base, r)
    return anim.Rig(base.nomes, base.pai, r["H2"], r["R2"], anim.PAPEIS["doberman"], V, Wt)


def acoes_novas(base, arm, r, id_, so=None):
    """Os clipes compostos (sentar, abanar, coçar, cavar, uivar, farejar, buscar, pular, beber, comer), resolvidos no
    esqueleto deste bicho (as patas plantadas não deslizam e nada passa do chão), em trilhas NLA."""
    anim, clipes = _anim()
    rig = rig_do_bicho(base, r)
    esc, kq = r["b"].get("escala", 1.0), r["alt_quadril"]
    corrida = bpy.data.actions["Doberman_Rig|Doberman_Run"]

    def amostra(acao, f):  # a corrida do Doberman com o deslocamento ajustado ao tamanho
        d = anim.amostra_acao(acao, f)
        return {k: (qq, lc * (kq if k == "Spine1" else esc)) for k, (qq, lc) in d.items()}
    ad = arm.animation_data
    feitas = []
    for cid, rot, laco, seg, fn in clipes.CLIPES_CACHORRO:
        if so and cid not in so:
            continue
        base_fn = None
        if cid == "buscar":
            fn = clipes.c_buscar_fn(seg)
            base_fn = clipes.base_corrida(corrida, (1, 17), seg, amostra)
        poses, zmin = anim.faz_poses(rig, fn, seg, base_fn)
        act = anim.grava_acao(arm, rig, id_ + "|" + cid, poses)
        t = ad.nla_tracks.new()
        t.name = cid
        st = t.strips.new(act.name, 1, act)
        st.action_slot = act.slots[0]
        t.mute = True
        feitas.append(cid)
        print("  clipe", id_, cid, "zmin %.3f" % zmin, flush=True)
    return feitas


def exporta(arm, ob, caminho):
    for o in bpy.context.selected_objects:
        o.select_set(False)
    arm.select_set(True)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.gltf(filepath=caminho, export_format="GLB", use_selection=True, export_animation_mode="NLA_TRACKS",
                              export_anim_single_armature=True, export_optimize_animation_size=True,
                              export_force_sampling=True, export_frame_step=2, export_def_bones=False,
                              export_vertex_color="ACTIVE", export_image_format="NONE")


def main():
    a = sys.argv[sys.argv.index("--") + 1:]
    saida = a[0]
    ids = list(BICHOS) if len(a) < 2 or a[1] == "todos" else a[1].split(",")
    blend = a[a.index("--blend") + 1] if "--blend" in a else None
    so = a[a.index("--clipes") + 1].split(",") if "--clipes" in a else None  # só estes clipes novos (para testar)
    arq_json = a[a.index("--json") + 1] if "--json" in a else os.path.join(saida, "bichos.json")
    os.makedirs(saida, exist_ok=True)
    arm0, me0 = carrega()
    base = Base(arm0, me0)
    info = {}
    feitos = []
    for k, id_ in enumerate(ids):
        r = faz(base, id_)
        arm, ob = objeto(base, r, id_)
        acoes(base, arm, r, id_)
        novas = acoes_novas(base, arm, r, id_, so)
        exporta(arm, ob, os.path.join(saida, id_ + ".glb"))
        b = r["b"]
        durs = {ANIMACOES[a0.name.split("_")[-1]][0]: (a0.frame_range[1] - a0.frame_range[0]) / 24
                for a0 in bpy.data.actions if a0.name.startswith("Doberman_Rig|") and a0.name.split("_")[-1] in ANIMACOES}
        _, clipes = _anim()
        anims = [dict(id=ANIMACOES[c][0], rotulo=ANIMACOES[c][1 if b["especie"] == "cachorro" else 2], laco=True,
                      segundos=round(durs[ANIMACOES[c][0]], 2)) for c in ANIMACOES]
        anims += [dict(id=cid, rotulo=rot, laco=laco, segundos=seg) for cid, rot, laco, seg, _ in clipes.CLIPES_CACHORRO
                  if cid in novas]
        info[id_] = dict(id=id_, nome=b["nome"], especie=b["especie"], grupo="estimacao", escala=b.get("escala", 1.0),
                         pacote=True, base="Doberman (Apocalypse)", animacoes=anims)
        print("bicho", id_, len(ob.data.vertices), "vértices", os.path.getsize(os.path.join(saida, id_ + ".glb")) // 1024, "KB",
              "quadril", round(r["alt_quadril"], 3), flush=True)
        feitos.append((arm, ob))
    json.dump(info, open(arq_json, "w"), ensure_ascii=False, indent=1)
    if blend:  # arquivo-mestre: os bichos lado a lado, cada um com as suas trilhas
        bpy.data.objects.remove(me0, do_unlink=True)
        arm0.hide_set(True)
        for k, (arm, ob) in enumerate(feitos):
            arm.location = ((k % 7) * 1.1, (k // 7) * 1.4, 0)
            arm.rotation_euler = (math.radians(90), 0, 0)
        bpy.ops.wm.save_as_mainfile(filepath=blend, compress=True)
    print("fim", len(ids))


if __name__ == "__main__":
    main()
