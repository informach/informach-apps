"""Base comum dos bichos urbanos do Morada (grupo `urbano`), feitos a partir do pacote grátis Animals (uso interno).

- Carga de um bicho do pacote (Chicken, Pinguin, Kitty) em arrays, com a cor de cada face lida da paleta Texture_1.png
  e convertida em classe de cor.
- Proporções por osso como em `bichos.py` (o mesmo `deforma`), com giro de descanso em eixos do mundo e ossos extras
  (penas das asas, orelhas longas, cauda fofa...).
- Cinemática direta e inversa em numpy (para compor animações novas sem deslizar os pés) e pele (LBS) para conferir o
  chão.
- Montagem no Blender (esqueleto, malha com cor por canto de face, pesos), ações e exportação GLB.
"""
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector

ARTE = os.path.dirname(os.path.abspath(__file__))
if ARTE not in sys.path:
    sys.path.insert(0, ARTE)
import bichos as B  # noqa: E402  (deforma, tubo, esfera, folha, _cor, exporta)

SP = os.path.dirname(ARTE)
PAC = os.path.join(SP, "ideias", "Animals", "Animals_Free_fbx", "Separate_assets_fbx")
TEX = os.path.join(PAC, "Texture_1.png")
FPS = 24
PASSO = 2

# paleta do pacote → classe de cor, por bicho-base
PALETAS = {
    "Chicken_001": {"#6e4437": "pena", "#714538": "pena", "#f44336": "crista", "#ffc466": "bico", "#ffdc64": "pe",
                    "#353535": "olho"},
    "Pinguin_001": {"#353535": "preto", "#fff6dc": "branco", "#ef5350": "risca"},
    "Kitty_001": {"#353535": "pelo", "#f9f9f9": "branco", "#9ccc65": "olho", "#212121": "pupila", "#e57373": "nariz",
                  "#ef9a9a": "boca", "#676767": "cinza", "#b4b4b4": "claro", "#ffcdd2": "orelha"},
}


def _hx(c):
    return np.array([int(c[i:i + 2], 16) / 255 for i in (1, 3, 5)])


def rot(eixo, graus):
    a = math.radians(graus)
    c, s = math.cos(a), math.sin(a)
    if eixo == "x":
        return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])
    if eixo == "y":
        return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


def E(rx=0.0, ry=0.0, rz=0.0):
    """Giro em eixos do mundo (graus): primeiro x (inclina para a frente/baixo), depois y (rola), depois z (vira)."""
    return rot("z", rz) @ rot("y", ry) @ rot("x", rx)


def eixo_ang(eixo, ang):
    eixo = np.asarray(eixo, float)
    n = np.linalg.norm(eixo)
    if n < 1e-12 or abs(ang) < 1e-12:
        return np.eye(3)
    k = eixo / n
    K = np.array([[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]])
    return np.eye(3) + math.sin(ang) * K + (1 - math.cos(ang)) * K @ K


def para_quat(M):
    return np.array(Matrix([list(r) for r in M]).to_quaternion())


def de_quat(q):
    from mathutils import Quaternion
    return np.array(Quaternion(q).to_matrix())


def slerp(A, Bm, s):
    from mathutils import Quaternion
    qa = Matrix([list(r) for r in A]).to_quaternion()
    qb = Matrix([list(r) for r in Bm]).to_quaternion()
    return np.array(qa.slerp(qb, float(s)).to_matrix())


def alinha(de, para):
    """Menor giro que leva a direção `de` para `para`."""
    a = np.asarray(de, float) / np.linalg.norm(de)
    b = np.asarray(para, float) / np.linalg.norm(para)
    v = np.cross(a, b)
    c = float(a @ b)
    if np.linalg.norm(v) < 1e-9:
        return np.eye(3) if c > 0 else eixo_ang(np.cross(a, [1, 0, 0]) if abs(a[0]) < 0.9 else np.cross(a, [0, 1, 0]), math.pi)
    return eixo_ang(v, math.atan2(np.linalg.norm(v), c))


# ---------------------------------------------------------------- base do pacote
class Base:
    """Um bicho do pacote Animals em arrays (mundo, em descanso)."""

    def __init__(self, nome, limpa=True):
        self.nome_pac = nome
        if limpa:
            bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.fbx(filepath=os.path.join(PAC, nome + ".fbx"))
        self.arm = bpy.data.objects[nome + "_rig"]
        self.me = me = bpy.data.objects[nome]
        arm = self.arm
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
        self.dom = self.W.argmax(1)
        self.F = [list(p.vertices) for p in me.data.polygons]
        img = bpy.data.images.load(TEX)
        Wt, Ht = img.size
        px = np.array(img.pixels[:]).reshape(Ht, Wt, 4)[:, :, :3]
        uv = me.data.uv_layers.active.data
        cor = []
        for p in me.data.polygons:
            us = np.array([uv[i].uv[:] for i in p.loop_indices]).mean(0)
            cor.append(px[min(int(us[1] % 1 * Ht), Ht - 1), min(int(us[0] % 1 * Wt), Wt - 1)])
        self.Fcor = np.array(cor)
        pal = PALETAS[nome]
        chaves = list(pal)
        P = np.array([_hx(c) for c in chaves])
        d = ((self.Fcor[:, None, :] - P[None]) ** 2).sum(2)
        self.Fcls = np.array([pal[chaves[k]] for k in d.argmin(1)], dtype=object)
        self.Fc = np.array([self.V[f].mean(0) for f in self.F])
        self.Fdom = np.array([np.bincount(self.dom[f]).argmax() for f in self.F])
        self.Fdomn = np.array([self.nomes[i] for i in self.Fdom], dtype=object)
        self.Fn = np.array([self._normal(f) for f in self.F])
        self.acoes = [a for a in bpy.data.actions if a.name.startswith(nome + "_rig|")]
        # ordem do quadril para as pontas
        ordem, vistos = [], set()
        while len(ordem) < len(self.nomes):
            for i in range(len(self.nomes)):
                if i not in vistos and (self.pai[i] < 0 or self.pai[i] in vistos):
                    ordem.append(i)
                    vistos.add(i)
        self.ordem = ordem
        self.raiz = self.idx["Root"]

    def _normal(self, f):
        p = self.V[f]
        n = np.cross(p[1] - p[0], p[2] - p[0])
        return n / (np.linalg.norm(n) + 1e-12)

    def ilhas(self):
        """Ilha (componente conexa) de cada face."""
        pai = list(range(len(self.V)))

        def acha(a):
            while pai[a] != a:
                pai[a] = pai[pai[a]]
                a = pai[a]
            return a
        for f in self.F:
            for k in f[1:]:
                ra, rb = acha(f[0]), acha(k)
                if ra != rb:
                    pai[ra] = rb
        return np.array([acha(f[0]) for f in self.F])


# ---------------------------------------------------------------- proporções
def fatores(base, b, grupos):
    n = len(base.nomes)
    esc = b.get("escala", 1.0)
    S = np.ones((n, 3)) * esc
    Q = [None] * n
    for chave, f in (b.get("esqueleto") or {}).items():
        for nome in grupos.get(chave, [chave]):
            S[base.idx[nome]] *= np.array(f)
    for chave, ang in (b.get("rot") or {}).items():
        for nome in grupos.get(chave, [chave]):
            a = ang
            if nome.endswith(".R"):
                a = (ang[0], -ang[1], -ang[2])
            Q[base.idx[nome]] = E(*a)
    return S, Q


def monta(base, S, Q, esc, sobe=0.0, desloca=(0, 0)):
    """Esqueleto novo, do quadril para as pontas; giros de descanso (Q) em eixos do mundo, na cabeça do osso."""
    n = len(base.nomes)
    H2, R2 = np.zeros((n, 3)), np.zeros((n, 3, 3))
    for i in base.ordem:
        p = base.pai[i]
        if p < 0:
            H2[i], R2[i] = base.H[i], base.R[i]
        else:
            off = base.H[i] - base.H[p]
            if p == base.raiz:
                H2[i] = H2[p] + off * esc + np.array([desloca[0], desloca[1], sobe])
            else:
                H2[i] = H2[p] + R2[p] @ (S[p] * (base.R[p].T @ off))
            R2[i] = R2[p] @ base.R[p].T @ base.R[i]
        if Q[i] is not None:
            R2[i] = Q[i] @ R2[i]
    return H2, R2, base.L * S[:, 1]


# ---------------------------------------------------------------- peças com pesos
class Pecas:
    """Malha extra: pontos, faces, cor por face e os pesos de cada ponto ({osso: peso})."""

    def __init__(self):
        self.V, self.F, self.Fcor, self.pesos = [], [], [], []

    def add(self, pts, faces, cores, osso):
        o = len(self.V)
        self.V += [np.array(p, float) for p in pts]
        self.F += [[o + k for k in f] for f in faces]
        if isinstance(cores, list):
            self.Fcor += [np.array(c, float) for c in cores]
        else:
            self.Fcor += [np.array(cores, float)] * len(faces)
        for k, p in enumerate(pts):
            w = osso(p) if callable(osso) else osso
            self.pesos.append({w: 1.0} if isinstance(w, str) else dict(w))


def cor(h, k=1.0):
    c = _hx(h) if isinstance(h, str) else np.array(h, float)
    return np.clip(c * k, 0, 1)


# ---------------------------------------------------------------- o bicho montado (arrays)
class Rig:
    """Esqueleto final (com ossos extras) e malha final (pele do pacote + peças), em descanso, no mundo."""

    def __init__(self, base, H2, R2, L2, V, Fkeep, Fcol, ex, extras):
        self.base = base
        self.nomes = list(base.nomes) + [e["nome"] for e in extras]
        self.idx = {n: i for i, n in enumerate(self.nomes)}
        self.pai = list(base.pai) + [self.idx[e["pai"]] for e in extras]
        self.H = np.vstack([H2] + [e["H"][None] for e in extras]) if extras else H2.copy()
        self.R = np.concatenate([R2] + [e["R"][None] for e in extras]) if extras else R2.copy()
        self.L = np.concatenate([L2, [e["L"] for e in extras]]) if extras else L2.copy()
        n = len(self.nomes)
        self.ordem = list(base.ordem) + list(range(len(base.nomes), n))
        usados = sorted({v for i in Fkeep for v in base.F[i]})
        novo = {v: k for k, v in enumerate(usados)}
        self.Vr = np.vstack([V[usados]] + ([np.array(ex.V)] if ex.V else []))
        o = len(usados)
        self.F = [[novo[v] for v in base.F[i]] for i in Fkeep] + [[o + k for k in f] for f in ex.F]
        self.Fcol = [Fcol[i] for i in Fkeep] + list(ex.Fcor)
        self.Wt = np.zeros((len(self.Vr), n))
        self.Wt[:o, :len(base.nomes)] = base.W[usados]
        for k, w in enumerate(ex.pesos):
            for nome, p in w.items():
                self.Wt[o + k, self.idx[nome]] += p
        s = self.Wt.sum(1, keepdims=True)
        self.Wt /= np.where(s > 0, s, 1)
        self.n_pele = o
        self.M0 = np.zeros((n, 4, 4))
        for i in range(n):
            self.M0[i] = np.eye(4)
            self.M0[i][:3, :3] = self.R[i]
            self.M0[i][:3, 3] = self.H[i]
        self.M0i = np.linalg.inv(self.M0)
        self.filhos = [[j for j in range(n) if self.pai[j] == i] for i in range(n)]
        self.extras = {e["nome"]: e for e in extras}

    def i(self, nome):
        return self.idx[nome]

    def ponta(self, nome):
        i = self.idx[nome]
        return self.H[i] + self.R[i][:, 1] * self.L[i]

    # ---------------- cinemática
    def fk(self, Bloc):
        """Bloc: (n,4,4) base local de cada osso (T R S). Devolve as matrizes do mundo (n,4,4)."""
        n = len(self.nomes)
        P = np.zeros((n, 4, 4))
        for i in self.ordem:
            p = self.pai[i]
            if p < 0:
                P[i] = self.M0[i] @ Bloc[i]
            else:
                P[i] = P[p] @ self.M0i[p] @ self.M0[i] @ Bloc[i]
        return P

    def pele(self, P, so=None):
        Ms = P @ self.M0i  # (n,4,4)
        V = self.Vr if so is None else self.Vr[so]
        W = self.Wt if so is None else self.Wt[so]
        Vh = np.c_[V, np.ones(len(V))]
        X = np.einsum("nij,vj->vni", Ms, Vh)[:, :, :3]  # (v,n,3)
        return np.einsum("vn,vni->vi", W, X)


# ---------------------------------------------------------------- pose → base local
class Pose:
    """Pose de um quadro: giros em eixos do mundo (relativos ao pai ou absolutos), deslocamentos, escalas e alvos de IK."""

    def __init__(self):
        self.rot = {}      # osso → 3x3 (relativo: giro no mundo somado ao do pai) ou ("abs", 3x3)
        self.loc = {}      # osso → deslocamento no mundo (como se o pai estivesse em descanso)
        self.esc = {}      # osso → escala (número ou 3)
        self.ik = {}       # cadeia → alvo (deslocamento do efetor em relação ao descanso, no mundo)
        self.ori = {}      # osso compensado → giro absoluto no mundo (padrão: o de descanso)

    def gira(self, osso, M):
        if osso in self.rot and not isinstance(self.rot[osso], tuple):
            self.rot[osso] = M @ self.rot[osso]
        else:
            self.rot[osso] = M


def resolve(rig, pose, cadeias, chute=None):
    """Monta as bases locais da pose, resolve as cadeias de IK pedidas e compensa a orientação das pontas.
    cadeias: nome → dict(ossos=[...], efetor=(osso, 'cabeca'|'ponta'), eixos=[(osso, eixo_mundo, rigidez)], comp=osso).
    Devolve (Bloc, P, angulos)."""
    n = len(rig.nomes)
    Bloc = np.tile(np.eye(4), (n, 1, 1))
    delta = [None] * n  # giro no mundo acumulado (para os modos relativo e absoluto)
    for i in rig.ordem:
        nome = rig.nomes[i]
        p = rig.pai[i]
        Dp = delta[p] if p >= 0 else np.eye(3)
        r = pose.rot.get(nome)
        if r is None:
            D = Dp
        elif isinstance(r, tuple):
            D = r[1](Dp, lambda nm: delta[rig.idx[nm]]) if callable(r[1]) else r[1]
        else:
            D = Dp @ r
        delta[i] = D
        # base local: P_i = P_p M0p⁻¹ M0i B → giro: Δp R_i Bᵣ = D R_i → Bᵣ = R_iᵀ Δpᵀ D R_i
        Br = rig.R[i].T @ Dp.T @ D @ rig.R[i]
        Bloc[i][:3, :3] = Br
        if nome in pose.loc:
            Bloc[i][:3, 3] = rig.R[i].T @ (Dp.T @ np.asarray(pose.loc[nome], float))
        if nome in pose.esc:
            s = pose.esc[nome]
            Bloc[i][:3, :3] = Bloc[i][:3, :3] @ np.diag(np.broadcast_to(np.asarray(s, float), (3,)))
    angs = {}
    P = rig.fk(Bloc)
    for cn, alvo in pose.ik.items():
        c = cadeias[cn]
        eixos = c["eixos"]
        th = np.array(chute.get(cn, np.zeros(len(eixos)))) if chute else np.zeros(len(eixos))
        osso_e, onde = c["efetor"]
        ie = rig.i(osso_e)
        pos0 = rig.H[ie] if onde == "cabeca" else rig.ponta(osso_e)
        T = pos0 + np.asarray(alvo, float) if not c.get("absoluto") else np.asarray(alvo, float)
        Bbase = {rig.i(o): Bloc[rig.i(o)].copy() for o in c["ossos"]}
        iax = [(rig.i(o), rig.R[rig.i(o)].T @ np.asarray(ax, float), k) for o, ax, k in eixos]
        rig_k = np.array([k for _, _, k in iax])

        def aplica(th_):
            for ib in Bbase:
                Bloc[ib] = Bbase[ib].copy()
            for (ib, ax, _), a in zip(iax, th_):
                Rm = np.eye(4)
                Rm[:3, :3] = eixo_ang(ax, a)
                Bloc[ib] = Bloc[ib] @ Rm
            Pc = rig.fk(Bloc)
            M = Pc[ie]
            e = M[:3, 3] if onde == "cabeca" else M[:3, 3] + M[:3, 1] * rig.L[ie]
            return e, Pc

        lam = c.get("lam", 0.05)
        for it in range(40):
            e, P = aplica(th)
            err = T - e
            if np.linalg.norm(err) < 2e-5:
                break
            J = np.zeros((3, len(th)))
            for k in range(len(th)):
                t2 = th.copy()
                t2[k] += 1e-4
                J[:, k] = (aplica(t2)[0] - e) / 1e-4
            JJ = J.T @ J
            A = JJ + lam * (np.trace(JJ) / len(th) + 1e-9) * np.diag(rig_k)
            th = th + np.linalg.solve(A, J.T @ err)
        e, P = aplica(th)
        angs[cn] = th
    # compensa a orientação das pontas (pés planos, cabeça no rumo pedido)
    for cn, c in cadeias.items():
        if cn not in pose.ik or not c.get("comp"):
            continue
        for oc in ([c["comp"]] if isinstance(c["comp"], str) else c["comp"]):
            ic = rig.i(oc)
            p = rig.pai[ic]
            Dw = pose.ori.get(oc, np.eye(3))
            Rp = P[p][:3, :3] @ rig.R[p].T  # giro no mundo do pai
            Bloc[ic][:3, :3] = rig.R[ic].T @ Rp.T @ Dw @ rig.R[ic]
            P = rig.fk(Bloc)
    return Bloc, P, angs


# ---------------------------------------------------------------- Blender
def objeto(rig, id_):
    base = rig.base
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
    for i, nome in enumerate(rig.nomes):
        eb = ebs.get(nome) or ebs.new(nome)
        if i >= len(base.nomes):
            eb.parent = ebs[rig.nomes[rig.pai[i]]]
            eb.use_deform = True
        R = Matrix([list(row) for row in rig.R[i]])
        eb.matrix = awi @ (Matrix.Translation(Vector(rig.H[i])) @ R.to_4x4())
        eb.length = max(rig.L[i], 1e-4)
    bpy.ops.object.mode_set(mode="OBJECT")
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
    mesh = bpy.data.meshes.new("bicho_" + id_)
    mesh.from_pydata([tuple(v) for v in rig.Vr], [], rig.F)
    mesh.update()
    ob = bpy.data.objects.new("bicho_" + id_ + "_malha", mesh)
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = arm
    ob.matrix_parent_inverse = arm.matrix_world.inverted()
    grupos = [ob.vertex_groups.new(name=nm) for nm in rig.nomes]
    for k in range(len(rig.Vr)):
        for i in np.nonzero(rig.Wt[k] > 1e-4)[0]:
            grupos[i].add([k], float(rig.Wt[k, i]), "REPLACE")
    mod = ob.modifiers.new("Armature", "ARMATURE")
    mod.object = arm
    ca = mesh.color_attributes.new("Col", "BYTE_COLOR", "CORNER")
    mesh.color_attributes.active_color = ca
    mesh.color_attributes.render_color_index = mesh.color_attributes.active_color_index
    cols = np.zeros((len(mesh.loops), 4))
    for p in mesh.polygons:
        c = rig.Fcol[p.index]
        cols[p.loop_start:p.loop_start + p.loop_total] = (c[0] ** 2.2, c[1] ** 2.2, c[2] ** 2.2, 1.0)
        p.use_smooth = False
    ca.data.foreach_set("color", cols.ravel())
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


def acao_de_quadros(arm, rig, nome, quadros):
    """quadros: lista de Bloc (n,4,4) a cada PASSO quadros, a partir do quadro 1. Cria a ação com loc/quat/escala."""
    act = bpy.data.actions.new(nome)
    ad = arm.animation_data or arm.animation_data_create()
    ad.action = act
    nq = len(quadros)
    fr = np.arange(nq) * PASSO + 1.0
    Q = np.zeros((nq, len(rig.nomes), 4))
    Lc = np.zeros((nq, len(rig.nomes), 3))
    Sc = np.ones((nq, len(rig.nomes), 3))
    for k, Bl in enumerate(quadros):
        for i in range(len(rig.nomes)):
            M = Bl[i][:3, :3]
            s = np.linalg.norm(M, axis=0)
            Q[k, i] = para_quat(M / s)
            Sc[k, i] = s
            Lc[k, i] = Bl[i][:3, 3]
    for i in range(len(rig.nomes)):  # continuidade do quatérnio
        for k in range(1, nq):
            if Q[k, i] @ Q[k - 1, i] < 0:
                Q[k, i] *= -1
    for i, nm in enumerate(rig.nomes):
        for prop, arr in (("location", Lc), ("rotation_quaternion", Q), ("scale", Sc)):
            for j in range(arr.shape[2]):
                fc = act.fcurve_ensure_for_datablock(arm, f'pose.bones["{nm}"].{prop}', index=j, group_name=nm)
                fc.keyframe_points.add(nq)
                fc.keyframe_points.foreach_set("co", np.c_[fr, arr[:, i, j]].ravel())
                fc.keyframe_points.foreach_set("interpolation", [1] * nq)  # LINEAR
                fc.update()
    ad.action = None
    return act


def trilha_nla(arm, act, nome_trilha):
    ad = arm.animation_data or arm.animation_data_create()
    t = ad.nla_tracks.new()
    t.name = nome_trilha
    st = t.strips.new(act.name, int(act.frame_range[0]), act)
    if act.slots:
        st.action_slot = act.slots[0]
    t.mute = True
    return t


def acoes_pacote(rig, arm, id_, mapa, esc, kq, quadril, vel=1.0):
    """Copia as animações do pacote: tira as curvas do próprio objeto, passa de 30 para 24 quadros por segundo (vel < 1
    deixa mais lenta), ajusta os deslocamentos ao tamanho (o quadril com a altura do quadril) e põe chaves de descanso
    nos ossos extras (para nada ficar preso na pose da animação anterior). mapa: sufixo no pacote → id."""
    base = rig.base
    feitas = {}
    f = FPS / 30.0 / vel
    for a0 in base.acoes:
        suf = a0.name.split("_")[-1]
        if suf not in mapa:
            continue
        a = a0.copy()
        a.name = id_ + "|" + mapa[suf]
        for lay in a.layers:
            for st in lay.strips:
                for cb in st.channelbags:
                    for fc in [fc for fc in cb.fcurves if '"' not in fc.data_path]:
                        cb.fcurves.remove(fc)
        fim = 1
        for lay in a.layers:
            for st in lay.strips:
                for cb in st.channelbags:
                    for fc in cb.fcurves:
                        k = None
                        if fc.data_path.endswith("location"):
                            k = kq if f'"{quadril}"' in fc.data_path else esc
                        for kp in fc.keyframe_points:
                            for attr in ("co", "handle_left", "handle_right"):
                                v = getattr(kp, attr)
                                v[0] = 1 + (v[0] - 1) * f
                                if k is not None:
                                    v[1] *= k
                        fim = max(fim, fc.keyframe_points[-1].co[0])
                        fc.update()
        extras = rig.nomes[len(base.nomes):]
        if extras:
            ad = arm.animation_data or arm.animation_data_create()
            ad.action = a
            if a.slots:
                ad.action_slot = a.slots[0]
            for nm in extras:
                e = 0.001 if rig.extras[nm].get("escondido") else 1.0
                for prop, val in (("location", (0, 0, 0)), ("rotation_quaternion", (1, 0, 0, 0)), ("scale", (e, e, e))):
                    for j, v in enumerate(val):
                        fc = a.fcurve_ensure_for_datablock(arm, f'pose.bones["{nm}"].{prop}', index=j, group_name=nm)
                        fc.keyframe_points.add(2)
                        fc.keyframe_points.foreach_set("co", [1, v, fim, v])
                        fc.update()
            ad.action = None
        feitas[mapa[suf]] = (a, (fim - 1) / FPS)
    return feitas
