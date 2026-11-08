"""Base dos bichos do zoológico do Morada: carga dos bichos do pacote Animals (Tiger, Deer, Dog), proporções por osso
(as mesmas contas do bichos.py), ossos novos, cinemática em numpy (para compor poses, assentar no chão e conferir) e
montagem no Blender (esqueleto, malha com cor por vértice, trilhas NLA, GLB).

As funções genéricas vêm do bichos.py (deforma, normais_vertice, Pecas, tubo, esfera, folha, _cor, _fcurves).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import bichos as B  # noqa: E402

AQUI = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ANIMALS = os.path.join(AQUI, "ideias", "Animals", "Animals_Free_fbx", "Separate_assets_fbx")
TEX_A = os.path.join(ANIMALS, "Texture_1.png")
FPS = 24
FPS_PACOTE = 30
SELO = "Uso interno, não distribuir: base do pacote grátis Animals (ithappy)."

AX = {"x": np.array([1.0, 0, 0]), "y": np.array([0, 1.0, 0]), "z": np.array([0, 0, 1.0])}

# papéis de cada osso nos esqueletos do pacote (frente para −Y, esquerda = +X)
ESQ = {
    "Tiger_001": dict(
        raiz="Root", quadril="spine.007", tronco=["spine.008", "spine.009"], pescoco=["spine.010", "spine.011"],
        cabeca="spine.012", mandibula="jaw", orelhas=[],
        cauda=["spine.006", "spine.005", "spine.004", "spine.003", "spine.002", "spine.001", "spine"],
        tras={s: [f"thigh.{s}", f"shin.{s}", f"foot.{s}", f"toe.{s}"] for s in "LR"},
        frente={s: [f"front_thigh.{s}", f"front_shin.{s}", f"front_foot.{s}", f"front_toe.{s}"] for s in "LR"},
        ombros={s: f"shoulder.{s}" for s in "LR"}, pelves={},
        cores={"pelo": "#f87c40", "listra": "#343434", "claro": "#f8f8f8", "nariz": "#e47070", "boca": "#b41c1c",
               "dente": "#fcfcfc"},
        acoes={"idle": "parado", "idle_rare": "espreguicar", "walk": "andar", "run": "correr"}),
    "Deer_001": dict(
        raiz="Root", quadril="spine.003", tronco=["spine.004", "spine.005"], pescoco=["spine.006", "spine.007", "spine.008"],
        cabeca="scull", mandibula=None, orelhas=["ear.L", "ear.R"], cauda=["spine.002", "spine.001", "spine"],
        tras={s: [f"thigh.{s}", f"shin.{s}", f"foot.{s}", f"toe.{s}"] for s in "LR"},
        frente={s: [f"front_thigh.{s}", f"front_shin.{s}", f"front_foot.{s}", f"front_toe.{s}"] for s in "LR"},
        ombros={s: f"front_shoulder.{s}" for s in "LR"}, pelves={s: f"shoulder.{s}" for s in "LR"},
        cores={"chifre": "#503c38", "pelo": "#7c4c40", "perna": "#9c6c5c", "escuro": "#343434", "barriga": "#ccaca4",
               "casco": "#646464", "pelo_escuro": "#482c28", "focinho": "#b49084", "cinza": "#505050",
               "cauda_baixo": "#ccaca0", "orelha_dentro": "#b88c7c", "pescoco": "#a06c5c", "orelha_dentro2": "#bc8c7c"},
        acoes={"idle": "parado", "walk": "andar", "run": "correr"}),
}


def grupos(esq):
    """Grupos de ossos para as proporções (como GRUPOS do bichos.py)."""
    g = {"tronco": [esq["quadril"]] + esq["tronco"], "pescoco": list(esq["pescoco"]),
         "cabeca": [esq["cabeca"]] + ([esq["mandibula"]] if esq["mandibula"] else []),
         "orelhas": list(esq["orelhas"]), "cauda": list(esq["cauda"]),
         "ombros": list(esq["ombros"].values()), "pelves": list(esq["pelves"].values())}
    for k, nome in enumerate(("coxas", "canelas", "pes", "dedos")):
        g[nome] = [esq["tras"][s][k] for s in "LR"]
    for k, nome in enumerate(("bracos", "antebracos", "maos", "dedos_frente")):
        g[nome] = [esq["frente"][s][k] for s in "LR"]
    g["pernas_tras"] = g["coxas"] + g["canelas"] + g["pes"]
    g["pernas_frente"] = g["bracos"] + g["antebracos"] + g["maos"]
    g["pernas"] = g["pernas_tras"] + g["pernas_frente"]
    g["patas"] = g["dedos"] + g["dedos_frente"]
    return g


def _hex(c):
    return np.array(B._h(c))


def rot_eixo(a, graus):
    """Matriz de giro (Rodrigues) em volta do eixo a."""
    a = np.asarray(a, float)
    a = a / (np.linalg.norm(a) + 1e-12)
    t = math.radians(graus)
    K = np.array([[0, -a[2], a[1]], [a[2], 0, -a[0]], [-a[1], a[0], 0]])
    return np.eye(3) + math.sin(t) * K + (1 - math.cos(t)) * K @ K


def quat_mat(q):
    w, x, y, z = np.asarray(q, float) / (np.linalg.norm(q) + 1e-12)
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def mat_quat(M):
    from mathutils import Matrix as _M
    q = _M([list(r) for r in M]).to_quaternion()
    return np.array([q.w, q.x, q.y, q.z])


# ---------------------------------------------------------------- carga do bicho do pacote
class BasePacote:
    """O bicho do pacote em arrays (espaço do mundo, em descanso), com as mesmas chaves do bichos.Base."""

    def __init__(self, nome):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.fbx(filepath=os.path.join(ANIMALS, nome + ".fbx"))
        bpy.context.scene.render.fps = FPS
        self.nome_pacote = nome
        self.esq = ESQ[nome]
        self.g = grupos(self.esq)
        self.arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
        self.me = next(o for o in bpy.data.objects if o.type == "MESH")
        arm, me = self.arm, self.me
        arm.data.pose_position = "REST"
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
        self.F = [list(p.vertices) for p in me.data.polygons]
        # cor de cada face: mediana de 9×9 pixels em volta do UV médio (a paleta tem marca-d'água clara por cima)
        img = bpy.data.images.load(TEX_A)
        Wt, Ht = img.size
        px = np.array(img.pixels[:]).reshape(Ht, Wt, 4)[:, :, :3]
        uv = me.data.uv_layers.active.data
        cor = []
        for p in me.data.polygons:
            u = np.array([uv[i].uv[:] for i in p.loop_indices]).mean(0)
            x = min(int(u[0] % 1 * Wt), Wt - 1)
            y = min(int(u[1] % 1 * Ht), Ht - 1)
            viz = px[max(y - 4, 0):y + 5, max(x - 4, 0):x + 5].reshape(-1, 3)
            cor.append(np.median(viz, 0))
        self.Fcor = np.array(cor)
        pal = {k: _hex(c) for k, c in self.esq["cores"].items()}
        nomes_cl = list(pal)
        P = np.array([pal[k] for k in nomes_cl])
        d = ((self.Fcor[:, None, :] - P[None]) ** 2).sum(2)
        self.Fcls = np.array([nomes_cl[i] for i in d.argmin(1)], dtype=object)
        self.recalcula()
        # a pose neutra (primeiro quadro do parado do pacote): giro e deslocamento de cada osso
        self.acoes = {}
        for a in bpy.data.actions:
            chave = a.name.split(nome + "_")[-1]
            self.acoes[chave] = a
        self.neutro_q = np.tile([1.0, 0, 0, 0], (len(self.nomes), 1))
        self.neutro_t = np.zeros((len(self.nomes), 3))
        for fc in B._fcurves(self.acoes["idle"]):
            if '"' not in fc.data_path:
                continue
            osso = fc.data_path.split('"')[1]
            if fc.data_path.endswith("rotation_quaternion"):
                self.neutro_q[self.idx[osso], fc.array_index] = fc.evaluate(1)
            elif fc.data_path.endswith("location"):
                self.neutro_t[self.idx[osso], fc.array_index] = fc.evaluate(1)

    def recalcula(self):
        self.dom = self.W.argmax(1)
        self.Fc = np.array([self.V[f].mean(0) for f in self.F])
        self.Fdom = np.array([np.bincount(self.dom[f], minlength=len(self.nomes)).argmax() for f in self.F])
        self.Fn = np.array([self._normal(f) for f in self.F])
        self.Fosso = np.array([self.nomes[i] for i in self.Fdom], dtype=object)

    def _normal(self, f):
        p = self.V[f]
        n = np.zeros(3)
        for k in range(len(f)):  # Newell (vale para n-gonos)
            a, b = p[k], p[(k + 1) % len(f)]
            n += np.cross(a, b)
        return n / (np.linalg.norm(n) + 1e-12)

    def sem_faces(self, tirar):
        """Tira faces (por máscara) e os vértices que ficam soltos."""
        manter = [i for i in range(len(self.F)) if not tirar[i]]
        usados = sorted({v for i in manter for v in self.F[i]})
        novo = {v: k for k, v in enumerate(usados)}
        self.V = self.V[usados]
        self.W = self.W[usados]
        self.F = [[novo[v] for v in self.F[i]] for i in manter]
        self.Fcor = self.Fcor[manter]
        self.Fcls = self.Fcls[manter]
        self.recalcula()

    def subdivide(self, tri=False):
        """Subdivisão linear (cada n-gono vira n quadriláteros), para manchas e listras mais finas. tri: cada
        quadrilátero novo sai como dois triângulos (o mesmo número de triângulos no GLB, mas a cor por face fica
        mais fina e as bordas das manchas saem em diagonal, não em escada)."""
        V, W = list(self.V), list(self.W)
        meio = {}

        def m(a, b):
            k = (min(a, b), max(a, b))
            if k not in meio:
                meio[k] = len(V)
                V.append((self.V[a] + self.V[b]) / 2)
                W.append((self.W[a] + self.W[b]) / 2)
            return meio[k]

        F2, src = [], []
        for fi, f in enumerate(self.F):
            c = len(V)
            V.append(self.V[f].mean(0))
            W.append(self.W[f].mean(0))
            n = len(f)
            for k in range(n):
                a = f[k]
                q = [a, m(a, f[(k + 1) % n]), c, m(f[k - 1], a)]
                if tri:
                    F2 += [[q[0], q[1], q[2]], [q[0], q[2], q[3]]] if k % 2 == 0 else [[q[1], q[2], q[3]], [q[1], q[3], q[0]]]
                    src += [fi, fi]
                else:
                    F2.append(q)
                    src.append(fi)
        self.V, self.W, self.F = np.array(V), np.array(W), F2
        self.Fcor = self.Fcor[src]
        self.Fcls = self.Fcls[src]
        self.recalcula()

    def tris(self):
        return sum(len(f) - 2 for f in self.F)


# ---------------------------------------------------------------- proporções (as contas do bichos.py)
def fatores(base, b):
    n = len(base.nomes)
    S = np.ones((n, 3)) * b.get("escala", 1.0)
    for chave, f in (b.get("esqueleto") or {}).items():
        for nome in base.g.get(chave, [chave]):
            S[base.idx[nome]] *= np.array(f)
    return S


def _alinha(a, b):
    a = a / np.linalg.norm(a)
    b = np.asarray(b, float) / np.linalg.norm(b)
    c = np.cross(a, b)
    s = np.linalg.norm(c)
    if s < 1e-9:
        return np.eye(3)
    return rot_eixo(c, math.degrees(math.atan2(s, float(a @ b))))


def monta(base, S, giros=None, direcoes=None):
    """Esqueleto novo do quadril para as pontas. giros: osso → [(eixo do mundo, graus)] no descanso (leva os filhos);
    direcoes: osso → direção do mundo para onde o osso passa a apontar no descanso (também leva os filhos)."""
    n = len(base.nomes)
    H2, R2 = np.zeros((n, 3)), np.zeros((n, 3, 3))
    for i in range(n):
        p = base.pai[i]
        if p < 0:
            H2[i], R2[i] = base.H[i], base.R[i]
        else:
            off = base.H[i] - base.H[p]
            H2[i] = H2[p] + R2[p] @ (S[p] * (base.R[p].T @ off))
            R2[i] = R2[p] @ base.R[p].T @ base.R[i]
        for eixo, g in (giros or {}).get(base.nomes[i], []):
            R2[i] = rot_eixo(AX[eixo] if isinstance(eixo, str) else eixo, g) @ R2[i]
        if direcoes and base.nomes[i] in direcoes:
            R2[i] = _alinha(R2[i][:, 1], direcoes[base.nomes[i]]) @ R2[i]
    return H2, R2, base.L * S[:, 1]


# ---------------------------------------------------------------- o bicho montado (arrays) e a cinemática
class Bicho:
    """Esqueleto (com os ossos novos), malha (pontos, faces, cor, pesos) e a pose neutra de um bicho."""

    def __init__(self, base, b, S, H2, R2, L2, V):
        self.base, self.b = base, b
        self.nomes = list(base.nomes)
        self.idx = dict(base.idx)
        self.pai = list(base.pai)
        self.S, self.H2, self.R2, self.L2 = S, H2, R2, L2
        self.V = V
        self.F = [list(f) for f in base.F]
        self.W = base.W.copy()
        self.Fcol = [None] * len(self.F)
        self.esq = base.esq
        self.neutro_q = base.neutro_q.copy()
        self.neutro_t = base.neutro_t.copy()
        self.papeis = {}  # papéis extras (cadeias novas: tromba...)
        self.tirar = np.zeros(len(self.F), bool)

    # ossos novos
    def osso(self, nome, pai, cabeca, cauda, lateral=(1.0, 0, 0)):
        y = np.asarray(cauda, float) - np.asarray(cabeca, float)
        L = np.linalg.norm(y)
        y /= L
        x = np.asarray(lateral, float) - y * np.dot(lateral, y)
        x /= np.linalg.norm(x)
        z = np.cross(x, y)
        R = np.stack([x, y, z], 1)
        self.nomes.append(nome)
        self.idx[nome] = len(self.nomes) - 1
        self.pai.append(self.idx[pai])
        self.H2 = np.vstack([self.H2, [cabeca]])
        self.R2 = np.concatenate([self.R2, R[None]], 0)
        self.L2 = np.append(self.L2, L)
        self.S = np.vstack([self.S, [1, 1, 1]])
        self.W = np.hstack([self.W, np.zeros((len(self.W), 1))])
        self.neutro_q = np.vstack([self.neutro_q, [1, 0, 0, 0]])
        self.neutro_t = np.vstack([self.neutro_t, [0, 0, 0]])
        return self.idx[nome]

    def cadeia(self, nome, pai, pontos, lateral=(1.0, 0, 0)):
        ids = []
        for k in range(len(pontos) - 1):
            ids.append(self.osso(f"{nome}.{k + 1:02d}", pai if k == 0 else f"{nome}.{k:02d}", pontos[k], pontos[k + 1], lateral))
        self.papeis[nome] = [self.nomes[i] for i in ids]
        return ids

    # malha extra
    def junta(self, pts, faces, cores, pesos):
        """pesos: nome do osso, dict osso → peso, ou lista (um por ponto) de um desses."""
        o = len(self.V)
        self.V = np.vstack([self.V, np.asarray(pts, float).reshape(-1, 3)])
        Wn = np.zeros((len(pts), len(self.nomes)))
        lst = pesos if isinstance(pesos, list) else [pesos] * len(pts)
        for k, w in enumerate(lst):
            if isinstance(w, str):
                Wn[k, self.idx[w]] = 1
            else:
                for nome, x in w.items():
                    Wn[k, self.idx[nome]] += x
        Wn /= Wn.sum(1, keepdims=True)
        self.W = np.vstack([self.W, Wn])
        cores = cores if isinstance(cores, list) else [cores] * len(faces)
        for f, c in zip(faces, cores):
            self.F.append([o + k for k in f])
            self.Fcol.append(np.asarray(B._cor(c) if isinstance(c, str) else c, float))
        self.tirar = np.append(self.tirar, np.zeros(len(faces), bool))

    def matriz_descanso(self):
        n = len(self.nomes)
        M = np.tile(np.eye(4), (n, 1, 1))
        M[:, :3, :3] = self.R2
        M[:, :3, 3] = self.H2
        return M

    # cinemática: rot (n,3,3) e loc (n,3) no referencial de cada osso, como o pose.bones do Blender
    def fk(self, rot, loc):
        Mr = self.matriz_descanso()
        Mri = np.linalg.inv(Mr)
        n = len(self.nomes)
        Mp = np.zeros((n, 4, 4))
        for i in range(n):
            Bm = np.eye(4)
            Bm[:3, :3] = rot[i]
            Bm[:3, 3] = loc[i]
            p = self.pai[i]
            Mp[i] = (Mr[i] @ Bm) if p < 0 else (Mp[p] @ Mri[p] @ Mr[i] @ Bm)
        return Mp, Mp @ Mri

    def pele(self, K, V=None, W=None):
        V = self.V if V is None else V
        W = self.W if W is None else W
        out = np.zeros_like(V)
        for i in range(len(self.nomes)):
            w = W[:, i]
            m = w > 1e-6
            if m.any():
                out[m] += w[m, None] * (V[m] @ K[i, :3, :3].T + K[i, :3, 3])
        return out

    def neutro(self):
        return np.array([quat_mat(q) for q in self.neutro_q]), self.neutro_t.copy()


# ---------------------------------------------------------------- montagem no Blender
def objeto(base, bi, id_):
    """Esqueleto (cópia do bicho do pacote com o descanso novo e os ossos novos) e malha com cor por face e pesos."""
    arm0 = base.arm
    arm = arm0.copy()
    arm.data = arm0.data.copy()
    arm.name = arm.data.name = "bicho_" + id_
    arm.animation_data_clear()
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
    for i, nome in enumerate(bi.nomes):
        eb = ebs.get(nome) or ebs.new(nome)
        if bi.pai[i] >= 0:
            eb.parent = ebs[bi.nomes[bi.pai[i]]]
        R = Matrix([list(r) for r in bi.R2[i]])
        eb.matrix = awi @ (Matrix.Translation(Vector(bi.H2[i])) @ R.to_4x4())
        eb.length = max(bi.L2[i], 1e-4)
    bpy.ops.object.mode_set(mode="OBJECT")
    manter = [i for i in range(len(bi.F)) if not bi.tirar[i]]
    usados = sorted({v for i in manter for v in bi.F[i]})
    novo = {v: k for k, v in enumerate(usados)}
    pts = [tuple(bi.V[v]) for v in usados]
    faces = [[novo[v] for v in bi.F[i]] for i in manter]
    fcol = [bi.Fcol[i] for i in manter]
    mesh = bpy.data.meshes.new("bicho_" + id_)
    mesh.from_pydata(pts, [], faces)
    mesh.update()
    ob = bpy.data.objects.new("bicho_" + id_ + "_malha", mesh)
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = arm
    ob.matrix_parent_inverse = arm.matrix_world.inverted()
    for nome in bi.nomes:
        ob.vertex_groups.new(name=nome)
    for k, v in enumerate(usados):
        for i in np.nonzero(bi.W[v] > 1e-4)[0]:
            ob.vertex_groups[bi.nomes[i]].add([k], float(bi.W[v, i]), "REPLACE")
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
    arm["uso"] = SELO
    return arm, ob


def exporta(arm, ob, caminho):
    """Os mesmos parâmetros do bichos.exporta, com o selo de uso interno no campo copyright do GLB."""
    for o in bpy.context.selected_objects:
        o.select_set(False)
    arm.select_set(True)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.gltf(filepath=caminho, export_format="GLB", use_selection=True, export_animation_mode="NLA_TRACKS",
                              export_anim_single_armature=True, export_optimize_animation_size=True,
                              export_force_sampling=True, export_frame_step=2, export_def_bones=False,
                              export_vertex_color="ACTIVE", export_image_format="NONE", export_copyright=SELO)
