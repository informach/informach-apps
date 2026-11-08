"""Bichos de estimação feitos do pacote grátis Animals (uso interno, não distribuir): os gatos de verdade, a partir do
Kitty_001 (andar, correr e parado de gato), e o border collie, a partir do Dog_001.

As mesmas técnicas do bichos.py (que nasce do Doberman), com as funções dele:
- proporções por osso (`monta` e `deforma`): cada osso ganha um fator de largura, comprimento e altura, o esqueleto
  novo é montado da raiz para as pontas e cada vértice vai com os ossos que o puxam; as animações continuam valendo;
- cores: a textura do pacote é uma paleta lisa. Cada face vira uma classe pela cor que tinha (pelo, branco, olho,
  pupila, nariz, boca, dentro da orelha, manchas do rosto, coleira) e o bicho dá a cor de cada classe; zonas pintam por
  cima (peito, patas, focinho, pontas do siamês, listras do malhado). Sai como cor por vértice (canto de face, faces
  chapadas), sem textura;
- focinho: à frente dos olhos a cabeça encolhe (o persa tem a cara achatada); pelo fofo: a malha infla pela normal;
- bigode: três fios de cada lado do focinho (gatos).
Animações: as 3 do pacote (24 fps, uma chave a cada 2 quadros) e as compostas de bichos_estimacao_clipes.py, resolvidas
no esqueleto de cada bicho pelo motor de bichos_estimacao_anim.py.

Uso: python bichos_estimacao_animals.py -- <saida> [ids separados por vírgula | todos] [--json arquivo] [--clipes a,b]
"""
import json
import math
import os
import sys

AQUI_ART = os.path.dirname(os.path.abspath(__file__))
if AQUI_ART not in sys.path:
    sys.path.insert(0, AQUI_ART)

import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import bichos  # noqa: E402
import bichos_estimacao_anim as anim  # noqa: E402
import bichos_estimacao_clipes as clipes  # noqa: E402

AQUI = os.path.dirname(AQUI_ART)
PASTA = os.path.join(AQUI, "ideias", "Animals", "Animals_Free_fbx", "Separate_assets_fbx")
TEX = os.path.join(PASTA, "Texture_1.png")

# cor da paleta (0–255, arredondada de 8 em 8) → classe
CLASSES = {
    "Kitty_001": {(56, 56, 56): "pelo", (248, 248, 248): "branco", (160, 208, 104): "olho", (32, 32, 32): "pupila",
                  (232, 112, 112): "boca", (240, 152, 152): "nariz", (256, 208, 208): "dentro_orelha",
                  (104, 104, 104): "mancha", (184, 184, 184): "mancha2"},
    "Dog_001": {(104, 104, 104): "pelo", (184, 184, 184): "pelo2", (248, 248, 248): "branco", (56, 56, 56): "nariz",
                (32, 32, 32): "olho", (232, 112, 112): "boca", (24, 96, 192): "coleira"},
}

ANIM_PACOTE = {"idle": ("parado", "Parado"), "walk": ("andar", "Andar"), "run": ("correr", "Correr")}

GRUPOS_A = {
    "costas": ["spine.006", "spine.007"] , "pescoco": ["spine.008"], "cabeca": ["scull", "jaw"],
    "orelhas": ["ear.L", "ear.R"],
    "bacia": ["shoulder.L", "shoulder.R"], "coxas": ["thigh.L", "thigh.R"], "canelas": ["shin.L", "shin.R"],
    "pes": ["foot.L", "foot.R"], "dedos": ["toe.L", "toe.R"],
    "ombros": ["front_shoulder.L", "front_shoulder.R"], "bracos": ["front_thigh.L", "front_thigh.R"],
    "antebracos": ["front_shin.L", "front_shin.R"], "maos": ["front_foot.L", "front_foot.R"],
}
GRUPOS_A["pernas"] = (GRUPOS_A["coxas"] + GRUPOS_A["canelas"] + GRUPOS_A["pes"] + GRUPOS_A["bracos"]
                      + GRUPOS_A["antebracos"] + GRUPOS_A["maos"])

_GATO = dict(especie="gato", fbx="Kitty_001", papeis="kitty", bigode=True)
# fofo: metros a inflar (no tamanho do Kitty) por osso (ou começo de nome)
BICHOS_A = {
    "gato": dict(_GATO, nome="Gato preto", escala=1.05,
                 cores={"pelo": "#2b2b2e", "branco": "#2b2b2e", "mancha": "#2b2b2e", "mancha2": "#2b2b2e",
                        "olho": "#9ad04a", "nariz": "#3e3438", "dentro_orelha": "#b88290", "pupila": "#101010"}),
    "gato_frajola": dict(_GATO, nome="Gato frajola", escala=1.05,
                         cores={"pelo": "#232325", "branco": "#f4f2ee", "mancha": "#f4f2ee", "mancha2": "#f4f2ee",
                                "olho": "#e8a62a", "nariz": "#e89aa6", "dentro_orelha": "#e89aa6", "pupila": "#101010"},
                         zonas=[("peito", "#f4f2ee"), ("focinho_baixo", "#f4f2ee")]),
    "gato_laranja": dict(_GATO, nome="Gato laranja", escala=1.05,
                         cores={"pelo": "#f09a2a", "branco": "#f6efe2", "mancha": "#f7b65c", "mancha2": "#f7c47a",
                                "olho": "#86c43e", "nariz": "#e8858f", "dentro_orelha": "#f2aab4", "pupila": "#101010"},
                         zonas=[("listras", "#d2731a"), ("peito", "#f6efe2"), ("focinho_baixo", "#f6efe2")]),
    "gato_rosa": dict(_GATO, nome="Gato fofo rosa (persa)", escala=1.08,
                      esqueleto={"costas": (1.12, 0.92, 1.05), "pescoco": (1.15, 0.7, 1.1), "cabeca": (1.12, 0.95, 1.06),
                                 "orelhas": (0.7, 0.7, 0.7), "pernas": (1.12, 0.88, 1.12)},
                      focinho=0.55, fofo={"spine.005": 0.024, "spine.006": 0.03, "spine.007": 0.032, "spine.008": 0.034,
                                          "scull": 0.012, "jaw": 0.02, "shoulder": 0.012, "thigh": 0.014,
                                          "front_shoulder": 0.016, "front_thigh": 0.01, "spine.004": 0.016,
                                          "spine.003": 0.018, "spine.002": 0.018, "spine.001": 0.017, "spine": 0.014},
                      cores={"pelo": "#f2b3c6", "branco": "#fbe4ec", "mancha": "#f6c6d4", "mancha2": "#f8d4de",
                             "olho": "#4aa6ee", "nariz": "#e2708a", "dentro_orelha": "#f08aa6", "pupila": "#101010"},
                      zonas=[("cauda_ponta", "#f07aa6")]),
    "gato_branco": dict(_GATO, nome="Gato branco", escala=1.03,
                        cores={"pelo": "#f4f2ee", "branco": "#ffffff", "mancha": "#f0ece6", "mancha2": "#f4f2ee",
                               "olho": "#6ab4ee", "nariz": "#f09aa8", "dentro_orelha": "#f4b4c0", "pupila": "#101010"}),
    "siames": dict(_GATO, nome="Siamês", escala=1.0,
                   esqueleto={"costas": (0.92, 1.04, 0.95), "pescoco": (0.92, 1.05, 0.95), "cabeca": (0.92, 1.08, 0.96),
                              "orelhas": (1.25, 1.25, 1.25), "pernas": (0.92, 1.05, 0.92)},
                   focinho=1.15,
                   cores={"pelo": "#efe0c6", "branco": "#f4ead8", "mancha": "#4a3328", "mancha2": "#5a4032",
                          "olho": "#3f9ef0", "nariz": "#3a2a24", "dentro_orelha": "#7a5a4c", "pupila": "#101010"},
                   zonas=[("pontas", "#4a3328")]),
    "gato_malhado": dict(_GATO, nome="Gato malhado cinza", escala=1.05,
                         cores={"pelo": "#8c9198", "branco": "#dcdee2", "mancha": "#5a5e66", "mancha2": "#7a7e86",
                                "olho": "#d8b030", "nariz": "#c97a86", "dentro_orelha": "#d898a4", "pupila": "#101010"},
                         zonas=[("listras", "#4c5058"), ("peito", "#d4d6da"), ("focinho_baixo", "#dcdee2")]),
    "border_collie": dict(nome="Border collie", especie="cachorro", fbx="Dog_001", papeis="dog001", escala=0.88,
                          cores={"pelo": "#26262a", "pelo2": "#26262a", "branco": "#f4f2ee", "nariz": "#151515",
                                 "olho": "#3a2416", "boca": "#ff7a86", "coleira": "#d8303a",
                                 "dentro_orelha": "#5a4448"},
                          zonas=[("pernas_baixo", "#f4f2ee")]),
}


def bicho_a(id_):
    return dict(BICHOS_A[id_])


def _h(c):
    return np.array(bichos._h(c)) if isinstance(c, str) else np.array(c)


# ---------------------------------------------------------------- carga e base
def carrega(fbx):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = 24
    bpy.ops.import_scene.fbx(filepath=os.path.join(PASTA, fbx + ".fbx"))
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    me = next(o for o in bpy.data.objects if o.type == "MESH")
    for o in list(bpy.data.objects):
        if o.type == "MESH" and o is not me:
            bpy.data.objects.remove(o, do_unlink=True)
    arm.data.pose_position = "REST"
    bpy.context.scene.render.fps = 24
    return arm, me


class BaseA:
    """O bicho do pacote em arrays (espaço do mundo, em descanso), com a classe de cor de cada face."""

    def __init__(self, arm, me, fbx):
        self.arm, self.me, self.fbx = arm, me, fbx
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
        img = bpy.data.images.load(TEX)
        Wt, Ht = img.size
        px = np.array(img.pixels[:]).reshape(Ht, Wt, 4)[:, :, :3]
        uv = me.data.uv_layers.active.data
        mapa = CLASSES[fbx]
        chaves = np.array(list(mapa.keys()), float)
        cl = []
        for p in me.data.polygons:  # a mediana em volta do centro (a paleta tem uma marca d'água por cima)
            us = np.array([uv[i].uv[:] for i in p.loop_indices]).mean(0)
            x, y = min(int(us[0] % 1 * Wt), Wt - 1), min(int(us[1] % 1 * Ht), Ht - 1)
            c = np.median(px[max(y - 6, 0):y + 7, max(x - 6, 0):x + 7].reshape(-1, 3), 0) * 255
            cl.append(list(mapa.values())[int(np.argmin(np.linalg.norm(chaves - c, axis=1)))])
        self.Fcls = np.array(cl, dtype=object)
        self.Fc = np.array([self.V[f].mean(0) for f in self.F])
        self.Fdom = np.array([np.bincount(self.dom[f]).argmax() for f in self.F])
        self.Fn = np.array([bichos.Base._normal(self, f) for f in self.F])
        dn = np.array([self.nomes[i] for i in self.Fdom])
        # no Dog_001 o nariz e o lado de dentro das orelhas têm a mesma cor: separa pelo osso
        if fbx == "Dog_001":
            self.Fcls[(self.Fcls == "nariz") & np.isin(dn, ["ear.L", "ear.R"])] = "dentro_orelha"
        olho = np.isin(self.Fcls, ["olho", "pupila"])
        self.olho = self.Fc[olho].mean(0)
        self.dn = dn

    def zona(self, nome):
        dn, Fc, Fn = self.dn, self.Fc, self.Fn
        cab = np.isin(dn, ["scull", "jaw"])
        cauda = np.isin(dn, ["spine.004", "spine.003", "spine.002", "spine.001", "spine"])
        pernas = np.isin(dn, GRUPOS_A["pernas"] + GRUPOS_A["dedos"] + ["front_toe.L", "front_toe.R"])
        tronco = ~cab & ~cauda & ~pernas & ~np.isin(dn, GRUPOS_A["orelhas"])
        hq = self.H[self.idx["thigh.L"], 2]
        if nome == "peito":
            frente = np.isin(dn, ["spine.006", "spine.007", "spine.008", "spine.005", "front_shoulder.L",
                                  "front_shoulder.R"])
            # no Kitty o peito é dos braços (front_thigh): a frente deles, da metade para cima
            bracos = np.isin(dn, ["front_thigh.L", "front_thigh.R"]) & (Fc[:, 2] > hq * 0.45) & (Fn[:, 1] < -0.25)
            return bracos | (frente & ((Fn[:, 2] < -0.3) | ((Fn[:, 1] < -0.35) & (Fc[:, 2] < hq * 1.15))))
        if nome == "focinho_baixo":
            return cab & (Fc[:, 2] < self.olho[2] - 0.004) & (Fc[:, 1] < self.olho[1] + 0.012)
        if nome == "patas":
            return pernas & (Fc[:, 2] < hq * 0.3)
        if nome == "pernas_baixo":
            return pernas & (Fc[:, 2] < hq * 0.62)
        if nome == "cauda_ponta":
            return np.isin(dn, ["spine.001", "spine"])
        if nome == "pontas":  # siamês: máscara, orelhas, patas e cauda escuras
            masc = cab & (Fc[:, 1] < self.olho[1] + 0.006) & (Fc[:, 2] < self.olho[2] + 0.02)
            ore = np.isin(dn, GRUPOS_A["orelhas"])
            pat = pernas & (Fc[:, 2] < hq * 0.55)
            cau = cauda & ~np.isin(dn, ["spine.004"])
            return masc | ore | pat | cau
        if nome == "listras":  # malhado: faixas no tronco, anéis nas pernas e na cauda, riscas na testa
            s_tr = np.sin(2 * math.pi * (Fc[:, 1] / 0.042 + Fc[:, 2] * 4.0))
            barriga = Fn[:, 2] < -0.35
            listra = tronco & (s_tr > 0.35) & ~barriga
            s_p = np.sin(2 * math.pi * Fc[:, 2] / 0.032)
            listra |= pernas & (s_p > 0.45) & (Fc[:, 2] > hq * 0.25) & (Fn[:, 1] > -0.6)
            s_c = np.sin(2 * math.pi * Fc[:, 1] / 0.036)
            listra |= cauda & (s_c > 0.3)
            testa = cab & (Fc[:, 2] > self.olho[2] + 0.008) & (np.sin(2 * math.pi * Fc[:, 0] / 0.016) > 0.4)
            return listra | testa
        raise KeyError(nome)


# ---------------------------------------------------------------- um bicho
def fatores_a(base, b):
    n = len(base.nomes)
    S = np.ones((n, 3)) * b.get("escala", 1.0)
    for chave, f in (b.get("esqueleto") or {}).items():
        for nome in GRUPOS_A.get(chave, [chave]):
            if nome in base.idx:
                S[base.idx[nome]] *= np.array(f)
    return S, [None] * n


def faz_a(base, id_):
    b = bicho_a(id_)
    esc = b.get("escala", 1.0)
    S, Q = fatores_a(base, b)
    H2, R2, L2 = bichos.monta(base, S, Q, raiz="Root")
    V2 = bichos.deforma(base, S, H2, R2)
    pes = np.isin(base.dom, [base.idx[n] for n in base.nomes if n.startswith(("toe", "front_toe", "front_foot"))])
    sobe = -V2[pes, 2].min()
    H2, R2, L2 = bichos.monta(base, S, Q, raiz_extra=sobe, raiz="Root")
    V2 = bichos.deforma(base, S, H2, R2)
    raiz = anim.PAPEIS[b["papeis"]]["raiz"]
    alt_quadril = H2[base.idx[raiz], 2] / base.H[base.idx[raiz], 2]
    cabw = base.W[:, base.idx["scull"]] + base.W[:, base.idx["jaw"]]
    # o centro dos olhos no bicho novo
    olho_v = sorted({v for i in range(len(base.F)) if base.Fcls[i] in ("olho", "pupila") for v in base.F[i]})
    olho2 = V2[olho_v].mean(0)
    k = b.get("focinho", 1.0)
    if k != 1.0:  # à frente dos olhos a cabeça encolhe (persa) ou cresce (siamês)
        f = olho2[1] - V2[:, 1]
        m = (f > 0) & (cabw > 0)
        V2[m, 1] = olho2[1] - f[m] * (1 + (k - 1) * cabw[m])
    fofo = b.get("fofo")
    if fofo:
        N = bichos.normais_vertice(V2, base.F)
        amt = np.zeros(len(V2))
        for nome, a in fofo.items():
            for osso in [n for n in base.nomes if n == nome or n.startswith(nome + ".")]:
                amt += base.W[:, base.idx[osso]] * a
        V2 = V2 + N * (amt * esc)[:, None]
    cores = b["cores"]
    pad = {"boca": "#c0505a", "pupila": "#101010", "dentro_orelha": "#f0b0bc", "coleira": "#d8303a",
           "pelo2": cores["pelo"], "mancha": cores["pelo"], "mancha2": cores["pelo"], "branco": "#f4f2ee"}
    zonas = [(base.zona(z), c) for z, c in b.get("zonas", [])]
    Fcol = []
    for i in range(len(base.F)):
        cl = base.Fcls[i]
        c = cores.get(cl) or pad.get(cl) or cores["pelo"]
        if cl in ("pelo", "pelo2", "branco", "mancha", "mancha2"):
            for m, cz in zonas:
                if m[i]:
                    c = cz
        # sombra suave pintada pela normal (a paleta do pacote é lisa)
        sombra = 0.92 + 0.1 * base.Fn[i, 2]
        Fcol.append(bichos._cor(c, sombra if cl not in ("olho", "pupila", "nariz", "coleira") else 1.0))
    ex = bichos.Pecas()
    if b.get("bigode"):
        nariz_v = sorted({v for i in range(len(base.F)) if base.Fcls[i] == "nariz" for v in base.F[i]})
        nariz = V2[nariz_v].mean(0)
        e = esc * 0.33  # o bigode do bichos.py é para um gato de escala 0,6 do Doberman (~0,2 m de cabeça)
        for sx in (1, -1):
            for kk, dz in enumerate((0.006, -0.002, -0.01)):
                o = nariz + np.array([sx * 0.012, 0.012, -0.008 + dz]) * e
                fim = o + np.array([sx * 0.075, 0.012, dz * 1.5 + (0.01 - 0.01 * kk)]) * e
                pts, fs = bichos.tubo([o, fim], [0.0022 * e, 0.0012 * e], seg=3)
                ex.add(pts, fs, [bichos._cor("#f2f2f2")] * len(fs), "scull")
    return dict(b=b, S=S, H2=H2, R2=R2, L2=L2, V=V2, Fcol=Fcol, ex=ex, alt_quadril=alt_quadril)


def malha_pesos_a(base, r):
    ex = r["ex"]
    pts = np.vstack([r["V"], np.array(ex.V).reshape(-1, 3)]) if ex.V else r["V"]
    Wt = np.zeros((len(pts), len(base.nomes)))
    Wt[:len(r["V"])] = base.W
    for k, osso in enumerate(ex.osso):
        Wt[len(r["V"]) + k, base.idx[osso]] = 1.0
    return pts, Wt


def objeto_a(base, r, id_):
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
        R = Matrix([list(row) for row in r["R2"][i]])
        eb.matrix = awi @ (Matrix.Translation(Vector(r["H2"][i])) @ R.to_4x4())
        eb.length = max(r["L2"][i], 1e-4)
    bpy.ops.object.mode_set(mode="OBJECT")
    pts, Wt = malha_pesos_a(base, r)
    ex = r["ex"]
    nb = len(r["V"])
    faces = [list(f) for f in base.F] + [[nb + k for k in f] for f in ex.F]
    fcol = list(r["Fcol"]) + [np.array(c) for c in ex.Fcor]
    mesh = bpy.data.meshes.new("bicho_" + id_)
    mesh.from_pydata([tuple(p) for p in pts], [], faces)
    mesh.update()
    ob = bpy.data.objects.new("bicho_" + id_ + "_malha", mesh)
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = arm
    ob.matrix_parent_inverse = arm.matrix_world.inverted()
    for nome in base.nomes:
        ob.vertex_groups.new(name=nome)
    for v in range(len(pts)):
        for i in np.nonzero(Wt[v] > 0)[0]:
            ob.vertex_groups[base.nomes[i]].add([v], float(Wt[v, i]), "REPLACE")
    mod = ob.modifiers.new("Armature", "ARMATURE")
    mod.object = arm
    ca = mesh.color_attributes.new("Col", "BYTE_COLOR", "CORNER")
    mesh.color_attributes.active_color = ca
    mesh.color_attributes.render_color_index = mesh.color_attributes.active_color_index
    for p in mesh.polygons:
        c = fcol[p.index]
        for li in p.loop_indices:
            ca.data[li].color = (c[0] ** 2.2, c[1] ** 2.2, c[2] ** 2.2, 1.0)
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


def reamostra(a0, nome, arm, esc, kq, raiz):
    """A animação do pacote (30 fps) em 24 fps, com o deslocamento ajustado ao tamanho, sem as curvas do objeto."""
    f0, f1 = a0.frame_range
    n = int(round((f1 - f0) * 24 / 30)) + 1
    act = bpy.data.actions.new(nome)
    slot = act.slots.new(id_type="OBJECT", name=arm.name)
    cb = act.layers.new("camada").strips.new(type="KEYFRAME").channelbag(slot, ensure=True)
    src = [fc for lay in a0.layers for st in lay.strips for c in st.channelbags for fc in c.fcurves]
    feitos = set()
    for fc in src:
        dp = fc.data_path
        if '"' not in dp:
            continue
        feitos.add((dp, fc.array_index))
        vals = np.array([fc.evaluate(f0 + k * (f1 - f0) / (n - 1)) for k in range(n)])
        if dp.endswith("location"):
            vals = vals * (kq if '"%s"' % raiz in dp else esc)
        nf = cb.fcurves.new(dp, index=fc.array_index)
        nf.keyframe_points.add(n)
        co = np.empty(2 * n)
        co[0::2] = np.arange(1, n + 1)
        co[1::2] = vals
        nf.keyframe_points.foreach_set("co", co)
        for kp in nf.keyframe_points:
            kp.interpolation = "LINEAR"
        nf.update()
    return act, (n - 1) / 24


def acoes_a(base, arm, r, id_, so=None):
    b = r["b"]
    esc, kq = b.get("escala", 1.0), r["alt_quadril"]
    papeis = anim.PAPEIS[b["papeis"]]
    ad = arm.animation_data or arm.animation_data_create()
    ad.action = None
    for t in list(ad.nla_tracks):
        ad.nla_tracks.remove(t)
    info = []

    def trilha(act, cid):
        t = ad.nla_tracks.new()
        t.name = cid
        st = t.strips.new(act.name, 1, act)
        st.action_slot = act.slots[0]
        t.mute = True

    pac = {}
    for a0 in [a for a in bpy.data.actions if a.name.startswith(b["fbx"] + "_rig|")]:
        chave = a0.name.split("_")[-1]
        if chave not in ANIM_PACOTE:
            continue
        cid, rot = ANIM_PACOTE[chave]
        act, seg = reamostra(a0, id_ + "|" + cid, arm, esc, kq, papeis["raiz"])
        pac[cid] = (act, a0, rot, seg)
    for cid in ("parado", "andar", "correr"):
        act, a0, rot, seg = pac[cid]
        trilha(act, cid)
        info.append(dict(id=cid, rotulo=rot, laco=True, segundos=round(seg, 2)))
    V, Wt = malha_pesos_a(base, r)
    rig = anim.Rig(base.nomes, base.pai, r["H2"], r["R2"], papeis, V, Wt)
    lista = clipes.CLIPES_GATO if b["especie"] == "gato" else clipes.CLIPES_DOG001
    corrida = pac["correr"][1]

    def amostra(acao, f):
        d = anim.amostra_acao(acao, f)
        return {k: (qq, lc * (kq if k == papeis["raiz"] else esc)) for k, (qq, lc) in d.items()}
    for cid, rot, laco, seg, fn in lista:
        if so and cid not in so:
            continue
        base_fn = None
        if cid == "buscar":
            fn = clipes.c_buscar_fn(seg)
            f0, f1 = corrida.frame_range
            base_fn = clipes.base_corrida(corrida, (f0, f1), seg, amostra, fps_acao=30)
        poses, zmin = anim.faz_poses(rig, fn, seg, base_fn)
        act = anim.grava_acao(arm, rig, id_ + "|" + cid, poses)
        trilha(act, cid)
        info.append(dict(id=cid, rotulo=rot, laco=laco, segundos=seg))
        print("  clipe", id_, cid, "zmin %.3f" % zmin, flush=True)
    return info


def main():
    a = sys.argv[sys.argv.index("--") + 1:]
    saida = a[0]
    ids = list(BICHOS_A) if len(a) < 2 or a[1] == "todos" else a[1].split(",")
    so = a[a.index("--clipes") + 1].split(",") if "--clipes" in a else None
    arq_json = a[a.index("--json") + 1] if "--json" in a else os.path.join(saida, "animals.json")
    os.makedirs(saida, exist_ok=True)
    info = {}
    for fbx in ("Kitty_001", "Dog_001"):
        meus = [i for i in ids if BICHOS_A[i]["fbx"] == fbx]
        if not meus:
            continue
        arm0, me0 = carrega(fbx)
        base = BaseA(arm0, me0, fbx)
        for id_ in meus:
            r = faz_a(base, id_)
            arm, ob = objeto_a(base, r, id_)
            anims = acoes_a(base, arm, r, id_, so)
            caminho = os.path.join(saida, id_ + ".glb")
            bichos.exporta(arm, ob, caminho)
            b = r["b"]
            info[id_] = dict(id=id_, nome=b["nome"], especie=b["especie"], grupo="estimacao", escala=b["escala"],
                             pacote=True, base=fbx + " (Animals)", animacoes=anims)
            tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
            print("bicho", id_, len(ob.data.vertices), "vértices", tris, "triângulos",
                  os.path.getsize(caminho) // 1024, "KB", flush=True)
            bpy.data.objects.remove(ob, do_unlink=True)
            arm.hide_set(True)
    json.dump(info, open(arq_json, "w"), ensure_ascii=False, indent=1)
    print("fim", len(info))


if __name__ == "__main__":
    main()
