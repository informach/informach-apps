"""Roupas e acessórios dos pacotes vestidos em qualquer corpo (catálogo roupas.json).

Tipo "pele": cada ponto da peça fica preso à pele do corpo do personagem de origem (o triângulo mais perto, a posição
dentro dele e a distância até a pele) e é recolocado no mesmo lugar da pele do corpo de destino, à mesma distância
(proporcional à altura). Se o corpo de origem e o de destino têm a mesma malha (a mesma família do pacote: masculina,
feminina ou plus), o triângulo é o mesmo; senão, o ponto da pele de origem é levado ao ponto mais perto da malha-base
da família do destino. Como os nossos corpos são deformações das malhas-base, a peça acompanha a criança, o plus, o
idoso e também as formas de gravidez do corpo (cada forma do corpo gera a mesma forma na peça). Os pesos do esqueleto
vêm da pele embaixo (suavizados ao longo da peça, para ela não rasgar entre as pernas). No fim, nenhum ponto fica a
menos de alguns milímetros da pele.
Tipos "cabeca" e "rosto": presos ao osso da cabeça pela caixa da cabeça, como os cabelos (cabelos.encaixa).
"""
import json
import os

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

import cabelos as CAB

AQUI = os.path.dirname(os.path.abspath(__file__))
CATALOGO = json.load(open(os.path.join(AQUI, "roupas.json")))
ITENS = {x["id"]: x for x in CATALOGO["itens"]}
# malha-base de cada família do pacote (o corpo do personagem de onde vêm os nossos corpos)
BASES = {
    "m": ("Chess_Pack/Chess_Pack_Free_fbx/Chess_Pack_Free_fbx/Characters/Chess_Player_01.fbx", "ChessPlayer_01"),
    "f": ("Casino/Casino_Free_fbx/Casino_Free_fbx/Casino_Free_Characters_fbx/1_Cashier.fbx", "Adult_Female_Cashier_Body"),
    "p": ("Casino/Casino_Free_fbx/Casino_Free_fbx/Casino_Free_Characters_fbx/75.fbx", "PlusSize_Male_Body_75"),
}
ALTURA_BASE = 1.73


# ------------------------------------------------------------------ geometria
def tris_de(me):
    T = []
    for p in me.polygons:
        v = p.vertices
        for i in range(1, len(v) - 1):
            T.append((v[0], v[i], v[i + 1]))
    return np.array(T, dtype=np.int64)


def normais(P, T):
    a, b, c = P[T[:, 0]], P[T[:, 1]], P[T[:, 2]]
    fn = np.cross(b - a, c - a)
    N = np.zeros_like(P)
    for k in range(3):
        np.add.at(N, T[:, k], fn)
    return N / np.maximum(np.linalg.norm(N, axis=1), 1e-12)[:, None]


def bary(p, A):
    v0, v1, v2 = A[1] - A[0], A[2] - A[0], p - A[0]
    d00, d01, d11 = v0 @ v0, v0 @ v1, v1 @ v1
    d20, d21 = v2 @ v0, v2 @ v1
    den = d00 * d11 - d01 * d01
    if abs(den) < 1e-14:
        return np.array([1.0, 0.0, 0.0])
    v = (d11 * d20 - d01 * d21) / den
    w = (d00 * d21 - d01 * d20) / den
    b = np.clip(np.array([1 - v - w, v, w]), 0, 1)
    return b / b.sum()


class Malha:
    def __init__(self, P, T):
        self.P, self.T = np.asarray(P, float), T
        self.N = normais(self.P, T)
        self.bvh = BVHTree.FromPolygons([tuple(p) for p in self.P], [tuple(t) for t in T])

    def perto(self, p):
        """(triângulo, baricêntricas, ponto, normal interpolada) do ponto da superfície mais perto de p."""
        loc, _, i, _ = self.bvh.find_nearest(Vector(p))
        loc = np.array(loc)
        b = bary(loc, self.P[self.T[i]])
        n = b @ self.N[self.T[i]]
        return i, b, loc, n / max(np.linalg.norm(n), 1e-12)

    def avalia(self, i, b, P=None, N=None):
        P = self.P if P is None else P
        N = self.N if N is None else N
        t = self.T[i]
        n = b @ N[t]
        return b @ P[t], n / max(np.linalg.norm(n), 1e-12)


def pos_mundo(o):
    mw = o.matrix_world
    return np.array([mw @ v.co for v in o.data.vertices])


# ------------------------------------------------------------------ fontes (FBX do pacote)
_fontes = {}
_importados = []


def limpa_fontes():
    """Apaga tudo o que foi importado para medir (os FBX de origem); as peças vestidas ficam."""
    for o in _importados:
        try:
            bpy.data.objects.remove(o, do_unlink=True)
        except ReferenceError:
            pass
    _importados.clear()
    _fontes.clear()
    _bases.clear()


def importa(arquivo, pasta_pacotes):
    """Importa um FBX uma vez: {nome da malha: objeto}, em repouso, fora do esqueleto (para medir)."""
    if arquivo in _fontes:
        return _fontes[arquivo]
    antes, acoes = set(bpy.data.objects), set(bpy.data.actions)
    bpy.ops.import_scene.fbx(filepath=os.path.join(pasta_pacotes, arquivo))
    novos = [o for o in bpy.data.objects if o not in antes]
    for a in set(bpy.data.actions) - acoes:
        bpy.data.actions.remove(a)
    for o in novos:
        if o.type == "ARMATURE":
            o.animation_data_clear()
            for pb in o.pose.bones:
                pb.matrix_basis.identity()
    bpy.context.view_layer.update()
    _importados.extend(novos)
    _fontes[arquivo] = {o.name.split(".")[0]: o for o in novos if o.type == "MESH"}
    for o in novos:
        o.hide_set(True)
        o.hide_render = True
    return _fontes[arquivo]


_bases = {}


def base(fam, pasta_pacotes):
    if fam not in _bases:
        arq, nome = BASES[fam]
        o = importa(arq, pasta_pacotes)[nome]
        _bases[fam] = Malha(pos_mundo(o), tris_de(o.data))
    return _bases[fam]


def familia(corpo, pasta_pacotes):
    """A família de malha de um corpo (m, f ou p), pela malha; None se não for nenhuma."""
    T = tris_de(corpo.data)
    for fam in BASES:
        b = base(fam, pasta_pacotes)
        if len(b.P) == len(corpo.data.vertices) and np.array_equal(b.T, T):
            return fam
    return None


def _textura(img, pasta_pacotes, arquivo):
    """Aponta a imagem para a pasta de texturas do pacote (o FBX pode trazer um caminho da máquina do autor, ou a
    textura embutida, que o importador extrai numa pasta .fbm temporária)."""
    if img is None or (img.has_data and ".fbm" not in img.filepath):
        return
    pacote = arquivo.split("/")[0]
    pasta = CATALOGO["pacotes_texturas"].get(pacote)
    nome = os.path.basename(img.filepath.replace("\\", "/"))
    if pasta and os.path.exists(os.path.join(pasta_pacotes, pasta, nome)):
        img.filepath = os.path.join(pasta_pacotes, pasta, nome)
        img.reload()


def _materiais(ob, pasta_pacotes, arquivo):
    """Material próprio de roupa (nome Roupa_<imagem>): a página mantém a textura dele (os outros usam a paleta)."""
    for i, m in enumerate(ob.data.materials):
        if m is None or not m.node_tree:
            continue
        img = next((n.image for n in m.node_tree.nodes if n.type == "TEX_IMAGE" and n.image), None)
        padrao = CATALOGO.get("texturas_padrao", {}).get(arquivo.split("/")[0])
        bsdf = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if img is None and padrao and bsdf is not None and not bsdf.inputs["Base Color"].is_linked:
            # o pacote deixou o material principal sem a paleta ligada (o vidro usa a mesma): liga a paleta
            caminho = os.path.join(pasta_pacotes, CATALOGO["pacotes_texturas"][arquivo.split("/")[0]], padrao)
            img = bpy.data.images.load(caminho, check_existing=True)
            t = m.node_tree.nodes.new("ShaderNodeTexImage")
            t.image = img
            m.node_tree.links.new(t.outputs["Color"], bsdf.inputs["Base Color"])
        _textura(img, pasta_pacotes, arquivo)
        # a mesma textura do mesmo pacote vira um material só (pacotes diferentes têm paletas com o mesmo nome)
        pacote = arquivo.split("/")[0]
        chave = f"Roupa_{pacote}_" + (os.path.splitext(os.path.basename(img.filepath))[0] if img else m.name.split(".")[0])
        if not m.name.startswith("Roupa_"):
            existente = bpy.data.materials.get(chave)
            if existente is None:
                m.name = chave
            else:
                ob.data.materials[i] = existente


# ------------------------------------------------------------------ encaixe na pele
def _pesos(corpo, b_list, t_list, T_corpo):
    """Pesos da peça: os da pele embaixo, interpolados no triângulo."""
    nomes = [g.name for g in corpo.vertex_groups]
    W = np.zeros((len(corpo.data.vertices), len(nomes)))
    for v in corpo.data.vertices:
        for g in v.groups:
            W[v.index, g.group] = g.weight
    Wg = np.array([b @ W[T_corpo[t]] for b, t in zip(b_list, t_list)])
    return nomes, Wg


def _suaviza_pesos(me, Wg, vezes=4):
    viz = [[] for _ in me.vertices]
    for e in me.edges:
        a, b = e.vertices
        viz[a].append(b)
        viz[b].append(a)
    for _ in range(vezes):
        Wg = 0.5 * Wg + 0.5 * np.array([Wg[n].mean(0) if n else Wg[i] for i, n in enumerate(viz)])
    return Wg


def _afasta(Pg, malha, folga):
    """Nenhum ponto da peça a menos de 'folga' da pele (nem dentro dela)."""
    for j in range(len(Pg)):
        loc, nrm, _, d = malha.bvh.find_nearest(Vector(Pg[j]))
        if loc is None:
            continue
        lado = (Vector(Pg[j]) - loc).dot(nrm)
        if lado < folga:
            Pg[j] = np.array(loc) + np.array(nrm) * folga
    return Pg


def encaixa_pele(item, arm, corpo, pasta_pacotes, fam_destino):
    fonte = importa(item["arquivo"], pasta_pacotes)
    S_obj = fonte[item["corpo_origem"]]
    S = Malha(pos_mundo(S_obj), tris_de(S_obj.data))
    fam_S = next((f for f in BASES if len(base(f, pasta_pacotes).P) == len(S.P)
                  and np.array_equal(base(f, pasta_pacotes).T, S.T)), None)
    X = base(fam_destino, pasta_pacotes)
    pecas = [fonte[n] for n in item["pecas"]]
    # uma malha só com as peças (cópias: a fonte fica intacta para o próximo corpo)
    copias = []
    for p in pecas:
        c = p.copy()
        c.data = p.data.copy()
        bpy.context.scene.collection.objects.link(c)
        c.hide_set(False)
        copias.append(c)
    ob = copias[0]
    if len(copias) > 1:
        with bpy.context.temp_override(active_object=ob, selected_editable_objects=copias):
            bpy.ops.object.join()
    for m in list(ob.modifiers):
        ob.modifiers.remove(m)
    G = pos_mundo(ob)
    # ligação: (triângulo da malha do destino, baricêntricas, distância até a pele)
    liga = []
    for g in G:
        i, b, q, n = S.perto(g)
        d = float((g - q) @ n)
        if fam_S != fam_destino:
            i, b, _, _ = X.perto(q)
        liga.append((i, b, d))
    # o corpo de destino (mesma malha da base da família)
    Pc = pos_mundo(corpo)
    Tc = tris_de(corpo.data)
    k = (Pc[:, 2].max() - Pc[:, 2].min()) / ALTURA_BASE
    folga = 0.003 * max(k, 0.4)

    def posicoes(P_corpo):
        M = Malha(P_corpo, Tc)
        out = np.array([M.avalia(i, b)[0] + M.avalia(i, b)[1] * d * k for i, b, d in liga])
        return _afasta(out, M, folga)

    Pg = posicoes(Pc)
    ob.parent = arm
    ob.matrix_parent_inverse.identity()
    ob.matrix_world = arm.matrix_world.copy()
    mi = ob.matrix_world.inverted()
    for v, p in zip(ob.data.vertices, Pg):
        v.co = mi @ Vector(p)
    # formas do corpo (gravidez): a mesma forma na peça
    if corpo.data.shape_keys:
        mwc = corpo.matrix_world
        ob.shape_key_add(name="Basis", from_mix=False)
        for kb in corpo.data.shape_keys.key_blocks[1:]:
            Pk = np.array([mwc @ d.co for d in kb.data])
            Pgk = posicoes(Pk)
            nk = ob.shape_key_add(name=kb.name, from_mix=False)
            for j, p in enumerate(Pgk):
                nk.data[j].co = mi @ Vector(p)
            nk.value = 0.0
    # pesos do esqueleto
    nomes, Wg = _pesos(corpo, [b for _, b, _ in liga], [i for i, _, _ in liga], Tc)
    Wg = _suaviza_pesos(ob.data, Wg)
    for vg in list(ob.vertex_groups):
        ob.vertex_groups.remove(vg)
    top = np.argsort(-Wg, axis=1)[:, :4]
    grupos = {}
    for j in range(len(Wg)):
        w = Wg[j, top[j]]
        s = w.sum()
        for gi, wv in zip(top[j], w):
            if wv / max(s, 1e-9) < 0.01:
                continue
            if gi not in grupos:
                grupos[gi] = ob.vertex_groups.new(name=nomes[gi])
            grupos[gi].add([j], float(wv / s), "REPLACE")
    ob.modifiers.new("Esqueleto", "ARMATURE").object = arm
    _materiais(ob, pasta_pacotes, item["arquivo"])
    return ob


def veste(item, arm, corpo, pasta_pacotes):
    """Encaixa um item do catálogo no corpo e devolve o objeto (preso ao esqueleto)."""
    if item["tipo"] in ("cabeca", "rosto"):
        ob = CAB.encaixa({**item, "tipo": "rosto" if item["tipo"] == "rosto" else "cabelo"}, arm, corpo, pasta_pacotes)
        _materiais(ob, pasta_pacotes, item["arquivo"])
        return ob
    fam = familia(corpo, pasta_pacotes)
    if fam is None:
        raise ValueError(f"corpo {corpo.name}: malha fora das famílias do pacote")
    return encaixa_pele(item, arm, corpo, pasta_pacotes, fam)
