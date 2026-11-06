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
_BRUTOS = {x["id"]: x for x in CATALOGO["itens"]}


def _resolve(x):
    """Uma variação ("base": id de outra peça, "variacao": cor/cortes/forma) herda arquivo, peças, tipo e slot da base."""
    if "base" not in x:
        return x
    b = _resolve(_BRUTOS[x["base"]])
    return {**{k: v for k, v in b.items() if k not in ("id", "rotulo", "variacao", "base")}, **x}


ITENS = {k: _resolve(v) for k, v in _BRUTOS.items()}
CATALOGO["itens"] = [ITENS[x["id"]] for x in CATALOGO["itens"]]
PASTA_VAR = os.path.join(os.path.dirname(AQUI), "biblioteca", "roupas_var")  # texturas recoloridas das variações
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

    def projeta(self, q, n, alcance=0.25):
        """O ponto desta malha que corresponde a q de outra malha (com normal n): um raio pela normal, para fora e para
        dentro, acerta a pele do outro lado do mesmo lugar (o mais perto, com a normal parecida). Sem acerto, o ponto
        mais perto. Corpos de larguras muito diferentes (magro e plus) não se cruzam como no 'mais perto'."""
        melhor = None
        for d in (n, -n):
            loc, nrm, i, dist = self.bvh.ray_cast(Vector(q), Vector(d), alcance)
            if loc is not None and Vector(nrm).dot(Vector(n)) > 0.3 and (melhor is None or dist < melhor[1]):
                melhor = (i, dist, np.array(loc))
        if melhor is None:
            return self.perto(q)
        i, _, loc = melhor
        b = bary(loc, self.P[self.T[i]])
        nn = b @ self.N[self.T[i]]
        return i, b, loc, nn / max(np.linalg.norm(nn), 1e-12)

    def referencial(self, i, b, P=None, N=None):
        """Ponto, normal e as duas direções da superfície (pela aresta do triângulo) num ponto do triângulo i."""
        P = self.P if P is None else P
        N = self.N if N is None else N
        t = self.T[i]
        p = b @ P[t]
        n = b @ N[t]
        n = n / max(np.linalg.norm(n), 1e-12)
        e1 = P[t[1]] - P[t[0]]
        e1 = e1 - n * (e1 @ n)
        e1 = e1 / max(np.linalg.norm(e1), 1e-12)
        return p, n, e1, np.cross(n, e1)

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


# ------------------------------------------------------------------ variações (cópias modificadas das peças)
def _marcos(S_obj):
    """Marcos do corpo de origem, na pose da malha: ombro e cotovelo (x, braços abertos), joelho, meio da coxa e
    tornozelo (z). Medidos pelos grupos de vértices dos ossos."""
    P = pos_mundo(S_obj)

    def grupo(nome):
        if nome not in S_obj.vertex_groups:
            return np.zeros(len(P), bool)
        gi = S_obj.vertex_groups[nome].index
        w = np.array([next((g.weight for g in v.groups if g.group == gi), 0.0) for v in S_obj.data.vertices])
        return w > 0.5
    braco, ante, perna, coxa = grupo("LeftArm"), grupo("LeftForeArm"), grupo("LeftLeg"), grupo("LeftUpLeg")
    pe = grupo("LeftFoot")
    pesc, mao = grupo("Neck"), grupo("LeftHand")
    m = {"ombro": float(np.abs(P[braco, 0]).min()), "cotovelo": float(np.abs(P[ante, 0]).min()),
         "axila": float(P[braco, 2].min()),
         "joelho": float(P[perna, 2].max()), "quadril": float(P[coxa, 2].max()), "tornozelo": float(P[pe, 2].max())}
    m["braco_meio"] = (m["ombro"] + m["cotovelo"]) / 2
    m["pescoco"] = float(P[pesc, 2].min()) if pesc.any() else m["axila"] + 0.12
    m["punho"] = float(np.abs(P[mao, 0]).min()) if mao.any() else m["cotovelo"] + 0.2
    m["antebraco_meio"] = (m["cotovelo"] + m["punho"]) / 2
    m["peito"] = m["axila"] + 0.35 * (m["pescoco"] - m["axila"])
    m["altura"] = float(P[:, 2].max())
    m["cintura"] = m["quadril"] + 0.45 * (m["axila"] - m["quadril"])
    m["coxa_meio"] = (m["joelho"] + m["quadril"]) / 2
    m["canela_meio"] = (m["joelho"] + m["tornozelo"]) / 2
    return m


def _corta(ob, S_obj, cortes, bainha=0.004):
    """Corta a peça em marcos do corpo (calça vira bermuda ou short, manga encurta ou some) e dá uma bainha: a borda
    nova ganha uma volta para dentro, em direção ao centro da abertura."""
    import bmesh
    m = _marcos(S_obj)
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    mw = ob.matrix_world
    mi = mw.inverted()
    n3 = mi.to_3x3()
    bordas = set()
    planos = []
    for c in cortes:
        valor = m[c["marco"]] + c.get("desloca", 0.0)
        if c["marco"] in ("ombro", "cotovelo", "braco_meio", "punho", "antebraco_meio"):  # braços: planos verticais
            # só o corte no ombro precisa se limitar à altura acima da axila (perto do tronco); os outros ficam além dele
            pt = "braco" if c["marco"] == "ombro" else "braco_livre"
            if c.get("acima"):  # "acima" nos braços: tira o lado do tronco (luva fica só na mão e no antebraço)
                planos += [(Vector((valor, 0, 0)), Vector((-1, 0, 0)), "lado+"), (Vector((-valor, 0, 0)), Vector((1, 0, 0)), "lado-")]
            else:
                planos += [(Vector((valor, 0, 0)), Vector((1, 0, 0)), pt), (Vector((-valor, 0, 0)), Vector((-1, 0, 0)), pt)]
        elif c.get("acima"):  # tira o que fica acima (cano de bota)
            planos.append((Vector((0, 0, valor)), Vector((0, 0, 1)), "perna"))
        else:  # pernas e barra: plano horizontal, tira o que fica abaixo
            planos.append((Vector((0, 0, valor)), Vector((0, 0, -1)), "perna"))
    z_axila = m["axila"] + 0.015  # um pouco acima da axila: a lateral do tronco fica inteira
    for p, n, parte in planos:
        if parte == "braco":
            # o plano da manga só vale acima da axila: abaixo dela é a lateral do tronco, que não se corta
            # (nos braços caídos da pose, o antebraço fica abaixo da axila: o que está bem além do ombro sai também)
            fs = [f for f in bm.faces if any((mw @ v.co).z > z_axila or abs((mw @ v.co).x) > p.length + 0.06
                                             for v in f.verts)]
            vs = list({v for f in fs for v in f.verts})
            es = list({e for f in fs for e in f.edges})
            geom = vs + es + fs
        elif parte.startswith("lado"):  # só o braço daquele lado
            sg = 1 if parte == "lado+" else -1
            fs = [f for f in bm.faces if all(sg * (mw @ v.co).x > 0 for v in f.verts)]
            vs = list({v for f in fs for v in f.verts})
            es = list({e for f in fs for e in f.edges})
            geom = vs + es + fs
        else:
            geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        res = bmesh.ops.bisect_plane(bm, geom=geom, plane_co=mi @ p, plane_no=(n3 @ n).normalized(), clear_outer=True)
        bordas |= {e for e in res["geom_cut"] if isinstance(e, bmesh.types.BMEdge)}
    bordas = [e for e in bordas if e.is_valid and e.is_boundary]
    if bordas and bainha > 0:
        # cada abertura (perna, braço) em separado: o centro dela é a média dos pontos da borda
        vs = {v for e in bordas for v in e.verts}
        grupos = {}
        for v in vs:
            w = mw @ v.co
            chave = ("x+" if w.x > 0 else "x-") if any(pt.startswith("braco") for _, _, pt in planos) and abs(w.x) > m["ombro"] * 0.9 \
                else ("p+" if w.x > 0 else "p-")
            grupos.setdefault(chave, []).append(v)
        centro = {k: sum((v.co for v in g), Vector()) / len(g) for k, g in grupos.items()}
        lado = {v: k for k, g in grupos.items() for v in g}
        ret = bmesh.ops.extrude_edge_only(bm, edges=bordas)
        novos = [x for x in ret["geom"] if isinstance(x, bmesh.types.BMVert)]
        esc = 1.0 / max(mw.to_scale())
        # cada vértice novo nasce de um da borda (mesma posição): entra em direção ao centro da abertura dele
        for v in novos:
            orig = min(vs, key=lambda u: (u.co - v.co).length_squared)
            d = centro[lado[orig]] - v.co
            if d.length > 1e-6:
                v.co += d.normalized() * bainha * esc
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()


def _uv_da_cor_principal(item_ref, pasta_pacotes):
    """(material, uv) de um ponto da paleta com a cor principal de uma peça de referência: a saia gerada usa a mesma
    cor e o mesmo material, e o vestido (blusa + saia) fica de uma cor só quando a cor muda."""
    from PIL import Image, ImageDraw
    ref = ITENS[item_ref]
    ob = importa(ref["arquivo"], pasta_pacotes)[ref["pecas"][0]]
    m = ob.data.materials[0]
    img = next((n.image for n in m.node_tree.nodes if n.type == "TEX_IMAGE" and n.image), None)
    src = Image.open(_caminho_imagem(img)).convert("RGB")
    W, H = src.size
    uv = ob.data.uv_layers.active.data
    cob = Image.new("L", (W, H), 0)
    dr = ImageDraw.Draw(cob)
    for poly in ob.data.polygons:
        dr.polygon([(uv[li].uv[0] * W, (1 - uv[li].uv[1]) * H) for li in poly.loop_indices], fill=255)
    M = np.array(cob) > 0
    A = np.array(src).astype(int)
    q = A[M] // 16
    chave = q[:, 0] * 256 + q[:, 1] * 16 + q[:, 2]
    vals, cont = np.unique(chave, return_counts=True)
    alvo = vals[cont.argmax()]
    k_img = (A // 16)[:, :, 0] * 256 + (A // 16)[:, :, 1] * 16 + (A // 16)[:, :, 2]
    ys, xs = np.nonzero(M & (k_img == alvo))
    j = len(ys) // 2
    return m, ((xs[j] + 0.5) / W, 1 - (ys[j] + 0.5) / H)


def _saia_gerada(S_obj, spec, pasta_pacotes):
    """Saia nova, feita em volta do corpo de origem: anéis da cintura (ou do quadril) até o comprimento pedido, cada um
    na largura do corpo naquela altura (as duas pernas juntas) com folga e abrindo até 'abertura' na barra.
    Cor lisa: todos os pontos no mesmo lugar da paleta da peça de referência (a cor fica livre na página)."""
    import bmesh
    m_ = _marcos(S_obj)
    P = pos_mundo(S_obj)
    z0 = m_[spec.get("desde", "cintura")] + spec.get("desloca_topo", 0.0)
    z1 = m_[spec["ate"]] + spec.get("desloca", 0.0)
    abertura, seg, aneis = spec.get("abertura", 1.3), 40, 14

    def fatia(z):
        sel = np.abs(P[:, 2] - z) < 0.025
        Q = P[sel] if sel.sum() > 6 else P[np.argsort(np.abs(P[:, 2] - z))[:40]]
        Q = Q[np.abs(Q[:, 0]) < 0.35]  # sem as mãos (braços abertos na pose da malha)
        c = Q[:, :2].mean(0)
        return c, np.abs(Q[:, 0] - c[0]).max(), np.abs(Q[:, 1] - c[1]).max()
    c0, rx0, ry0 = fatia(z0)
    bm = bmesh.new()
    anel_v = []
    fg = spec.get("folga", 0.0)  # casaco e avental por cima da roupa: mais afastados
    an = []
    for a_ in range(aneis + 1):
        t = a_ / aneis
        z = z0 + (z1 - z0) * t
        c, rx, ry = fatia(z)
        flare = 1.0 + (abertura - 1.0) * t ** 1.3
        an.append([z, *(c0 + (c - c0) * 0.3), max(rx * 1.05 + 0.008, rx0 * 1.04 * flare) + fg,
                   max(ry * 1.05 + 0.008, ry0 * 1.04 * flare) + fg])
    an = np.array(an)
    if fg > 0:  # por cima: a largura só cresce para baixo (sem ondas das pernas)
        an[:, 3] = np.maximum.accumulate(an[:, 3])
        an[:, 4] = np.maximum.accumulate(an[:, 4])
    for col in (1, 2, 3, 4):  # suaviza ao longo da altura
        an[1:-1, col] = 0.25 * an[:-2, col] + 0.5 * an[1:-1, col] + 0.25 * an[2:, col]
    for z, cx, cy, rx_, ry_ in an:
        anel_v.append([bm.verts.new((cx + rx_ * np.cos(2 * np.pi * k / seg), cy + ry_ * np.sin(2 * np.pi * k / seg), z))
                       for k in range(seg)])
    gap = spec.get("abre_frente", 0.0)  # jaleco e casacão: a frente aberta (ângulo em graus de cada lado)
    so = spec.get("so_frente", 0.0)  # avental: só o painel da frente (ângulo em graus de cada lado)

    def fora(ang):
        d = abs(((ang - 1.5 * np.pi + np.pi) % (2 * np.pi)) - np.pi)  # distância angular até a frente
        return (gap and d < np.radians(gap)) or (so and d > np.radians(so))
    for a_ in range(aneis):
        for k in range(seg):
            ang = 2 * np.pi * (k + 0.5) / seg  # -y (frente) em 3π/2
            if fora(ang):
                continue
            v1, v2 = anel_v[a_][k], anel_v[a_][(k + 1) % seg]
            v3, v4 = anel_v[a_ + 1][(k + 1) % seg], anel_v[a_ + 1][k]
            bm.faces.new((v1, v4, v3, v2))
    # barra: uma volta para dentro, para a saia não parecer uma folha
    barra = anel_v[-1]
    dentro = [bm.verts.new((v.co.x * 0.97, v.co.y * 0.97, v.co.z + 0.006)) for v in barra]
    for k in range(seg):
        if fora(2 * np.pi * (k + 0.5) / seg):
            continue
        bm.faces.new((barra[k], barra[(k + 1) % seg], dentro[(k + 1) % seg], dentro[k]))
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new("saia")
    bm.to_mesh(me)
    bm.free()
    for f in me.polygons:
        f.use_smooth = True
    ob = bpy.data.objects.new("saia", me)
    bpy.context.scene.collection.objects.link(ob)
    if spec.get("padrao"):  # textura gerada (a mesma das camadas: jaleco e casaco longo, vestido de uniforme)
        import geradores as GER
        GER._uv_corpo(ob, m_, m_["altura"], m_["ombro"])
        me.materials.append(GER.textura(spec["padrao"]))
        return ob, None
    mat, uvp = _uv_da_cor_principal(spec.get("cor_de", "roupa_camiseta_criativa"), pasta_pacotes)
    me.materials.append(mat)
    uvl = me.uv_layers.new(name="UVMap")
    for d in uvl.data:
        d.uv = uvp
    return ob, ITENS[spec.get("cor_de", "roupa_camiseta_criativa")]["arquivo"]


def _ajuste_chapeu(forma):
    """Chapéu: aba (raio da parte mais larga que a cabeça) e copa (altura acima da cabeça) em outra escala."""
    def ajusta(cab, corpo_s):
        hmin, hmax = CAB.caixa_cabeca(corpo_s)
        c = (hmin + hmax) / 2
        r = max(hmax[0] - hmin[0], hmax[1] - hmin[1]) / 2
        P = pos_mundo(cab)
        rad = np.linalg.norm(P[:, :2] - c[:2], axis=1)
        if forma.get("aba", 1.0) != 1.0:
            aba = rad > r * 1.08
            k = 1.0 + (forma["aba"] - 1.0) * np.clip((rad - r * 1.08) / (r * 0.4), 0, 1)
            P[aba, :2] = c[:2] + (P[aba, :2] - c[:2]) * k[aba, None]
        if forma.get("aba_frente"):  # boné: a aba fica só na frente (o resto encolhe até a cabeça)
            ang = np.degrees(np.arctan2(P[:, 0] - c[0], -(P[:, 1] - c[1])))  # 0° = frente (-y)
            fora = (rad > r * 1.05) & (np.abs(ang) > forma.get("abertura", 65))
            P[fora, :2] = c[:2] + (P[fora, :2] - c[:2]) * (r * 1.03 / np.maximum(rad[fora], 1e-6))[:, None]
            frente = (rad > r * 1.05) & ~fora
            P[frente, :2] = c[:2] + (P[frente, :2] - c[:2]) * forma.get("aba_esc", 1.0)
        if forma.get("copa", 1.0) != 1.0:
            acima = P[:, 2] > hmax[2]
            P[acima, 2] = hmax[2] + (P[acima, 2] - hmax[2]) * forma["copa"]
        mi = cab.matrix_world.inverted()
        for v, p in zip(cab.data.vertices, P):
            v.co = mi @ Vector(p)
        cab.data.update()
    return ajusta


def _caminho_imagem(img):
    """O arquivo da imagem; se o caminho sumiu (pasta .fbm temporária), a mesma imagem na pasta de texturas do pacote."""
    f = bpy.path.abspath(img.filepath)
    if os.path.exists(f):
        return f
    nome = os.path.basename(f.replace("\\", "/"))
    raiz = os.path.join(os.path.dirname(AQUI), "ideias")
    for pacote, pasta in CATALOGO["pacotes_texturas"].items():
        if pacote in f and os.path.exists(os.path.join(raiz, pasta, nome)):
            return os.path.join(raiz, pasta, nome)
    return None


PASTA_MASC = os.path.join(os.path.dirname(AQUI), "biblioteca", "roupas_mascaras")
_ARQ_MASC = os.path.join(PASTA_MASC, "mascaras.json")
MASCARAS = json.load(open(_ARQ_MASC)) if os.path.exists(_ARQ_MASC) else {}


def _lin(c):
    c = np.asarray(c, float) / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def garante_mascara(ob, item_id, tam=512):
    """Cor livre: para cada material da peça, uma máscara (cinza, 'tam' px) das partes da paleta com a cor principal
    da peça, e a luminância dessa cor (linear). A página e o jogo pintam a parte da máscara com a cor escolhida,
    mantendo o sombreado: cor × (luminância do pixel ÷ luminância da cor principal). Feita uma vez por peça."""
    if item_id in MASCARAS:
        return
    from PIL import Image, ImageDraw, ImageFilter
    os.makedirs(PASTA_MASC, exist_ok=True)
    me = ob.data
    uv = me.uv_layers.active.data
    lumv = np.array([0.2126, 0.7152, 0.0722])
    res = {}
    for k, m in enumerate(me.materials):
        if m is None or not m.node_tree or m.name in res:
            continue
        img = next((n.image for n in m.node_tree.nodes if n.type == "TEX_IMAGE" and n.image), None)
        arquivo = _caminho_imagem(img) if img is not None else None
        if arquivo is None:
            continue
        src = Image.open(arquivo).convert("RGB")
        W, H = src.size
        A = np.array(src).astype(float)
        if m.name == "Roupa_Gen_atlas":  # chapéus gerados: manchas de cor lisa; a principal é a de maior área na peça
            area = {}
            for poly in me.polygons:
                if poly.material_index == k:
                    u0, v0 = uv[poly.loop_indices[0]].uv
                    chave_m = (int(u0 * 8), int((1 - v0) * 16))
                    area[chave_m] = area.get(chave_m, 0.0) + poly.area
            if not area:
                continue
            ci, cj = max(area, key=area.get)
            val = np.zeros((H, W))
            val[cj * H // 16:(cj + 1) * H // 16, ci * W // 8:(ci + 1) * W // 8] = 1.0
            moda = A[(cj * 2 + 1) * H // 32, (ci * 2 + 1) * W // 16]
            nome = f"{item_id}__{m.name}.png"
            Image.fromarray((val * 255).astype(np.uint8)).resize((tam, round(tam * H / W)), Image.NEAREST).save(
                os.path.join(PASTA_MASC, nome), optimize=True)
            res[m.name] = {"mascara": nome, "lum": round(float(_lin(moda) @ lumv), 5),
                           "cor": "#%02x%02x%02x" % tuple(int(x) for x in moda)}
            continue
        cob = Image.new("L", (W, H), 0)
        dr = ImageDraw.Draw(cob)
        for poly in me.polygons:
            if poly.material_index == k:
                dr.polygon([(uv[li].uv[0] * W, (1 - uv[li].uv[1]) * H) for li in poly.loop_indices], fill=255)
        M = np.array(cob.filter(ImageFilter.MaxFilter(5))) > 0
        px = A[M]
        if not len(px):
            continue
        # cor principal: a mais comum entre as cores com saturação, se forem boa parte da peça; senão a mais comum
        mx, mn = px.max(1), px.min(1)
        sat = (mx - mn) / np.maximum(mx, 1)
        base_px = px[sat > 0.25] if (sat > 0.25).mean() > 0.2 else px
        q = (base_px // 16).astype(int)
        chave = q[:, 0] * 256 + q[:, 1] * 16 + q[:, 2]
        vals, cont = np.unique(chave, return_counts=True)
        moda = base_px[chave == vals[cont.argmax()]].mean(0)
        dist = np.linalg.norm(A - moda, axis=2)
        val = np.clip(1.0 - (dist - 55.0) / 30.0, 0, 1) * M  # borda suave entre a cor principal e os detalhes
        nome = f"{item_id}__{m.name}.png"
        Image.fromarray((val * 255).astype(np.uint8)).resize((tam, round(tam * H / W)), Image.BILINEAR).save(
            os.path.join(PASTA_MASC, nome), optimize=True)
        res[m.name] = {"mascara": nome, "lum": round(float(_lin(moda) @ lumv), 5),
                       "cor": "#%02x%02x%02x" % tuple(int(x) for x in moda)}
    MASCARAS[item_id] = res


def salva_mascaras():
    os.makedirs(PASTA_MASC, exist_ok=True)
    json.dump(MASCARAS, open(_ARQ_MASC, "w"), ensure_ascii=False, indent=1)


def _recolore(ob, varid, cor_hex):
    """A cor principal da peça (a mais comum nas partes da paleta que ela usa) vira 'cor_hex', mantendo o sombreado
    e os detalhes de outras cores. Cada variação ganha a própria textura (biblioteca/roupas_var) e o próprio material."""
    from PIL import Image, ImageDraw, ImageFilter
    os.makedirs(PASTA_VAR, exist_ok=True)
    alvo = np.array([int(cor_hex[i:i + 2], 16) for i in (1, 3, 5)], float)
    me = ob.data
    uv = me.uv_layers.active.data
    lum = np.array([0.299, 0.587, 0.114])
    for k, m in enumerate(list(me.materials)):
        if m is None or not m.node_tree:
            continue
        nome = f"Roupa_{varid}_{k}"
        nova = bpy.data.materials.get(nome)
        if nova is None:
            img = next((n.image for n in m.node_tree.nodes if n.type == "TEX_IMAGE" and n.image), None)
            arquivo = _caminho_imagem(img) if img is not None else None
            if arquivo is None:
                continue
            src = Image.open(arquivo).convert("RGBA")
            W, H = src.size
            masc = Image.new("L", (W, H), 0)
            dr = ImageDraw.Draw(masc)
            for poly in me.polygons:
                if poly.material_index == k:
                    dr.polygon([(uv[li].uv[0] * W, (1 - uv[li].uv[1]) * H) for li in poly.loop_indices], fill=255)
            M = np.array(masc.filter(ImageFilter.MaxFilter(5))) > 0
            A = np.array(src).astype(float)
            px = A[M][:, :3]
            if not len(px):
                continue
            # cor principal: a mais comum entre as cores com saturação (a sola branca ou o cadarço não contam), se
            # elas forem uma parte boa da peça; senão a mais comum de todas (peças cinza, pretas ou brancas)
            mx, mn = px.max(1), px.min(1)
            sat = (mx - mn) / np.maximum(mx, 1)
            base_px = px[sat > 0.25] if (sat > 0.25).mean() > 0.2 else px
            q = (base_px // 16).astype(int)
            chave = q[:, 0] * 256 + q[:, 1] * 16 + q[:, 2]
            vals, cont = np.unique(chave, return_counts=True)
            moda = base_px[chave == vals[cont.argmax()]].mean(0)
            sel = M & (np.linalg.norm(A[:, :, :3] - moda, axis=2) < 70)
            razao = (A[:, :, :3] @ lum) / max(float(moda @ lum), 1.0)
            A[sel, :3] = np.clip(alvo[None, :] * razao[sel][:, None], 0, 255)
            caminho = os.path.join(PASTA_VAR, nome + ".png")
            Image.fromarray(A.astype(np.uint8)).save(caminho, optimize=True)
            nova = m.copy()
            nova.name = nome
            for n in nova.node_tree.nodes:
                if n.type == "TEX_IMAGE" and n.image:
                    n.image = bpy.data.images.load(caminho, check_existing=True)
        me.materials[k] = nova


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
    if "gerar" in item:  # peça feita aqui, sobre a malha-base de uma família ("destino": a do corpo)
        g = item["gerar"]
        fam_g = fam_destino if g.get("familia", "f") == "destino" else g.get("familia", "f")
        arq_b, nome_b = BASES[fam_g]
        S_obj = importa(arq_b, pasta_pacotes)[nome_b]
        if g.get("tipo", "saia") == "camada":
            import geradores as GER
            ob = GER.camada(S_obj, g)
        else:
            ob = _saia_gerada(S_obj, g, pasta_pacotes)[0]
    else:
        fonte = importa(item["arquivo"], pasta_pacotes)
        S_obj = fonte[item["corpo_origem"]]
    S = Malha(pos_mundo(S_obj), tris_de(S_obj.data))
    fam_S = next((f for f in BASES if len(base(f, pasta_pacotes).P) == len(S.P)
                  and np.array_equal(base(f, pasta_pacotes).T, S.T)), None)
    X = base(fam_destino, pasta_pacotes)
    if "gerar" not in item:
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
    var = item.get("variacao", {})
    if var.get("cortes"):
        _corta(ob, S_obj, var["cortes"])
    if len(ob.data.vertices) < 1500:
        # peça de poucos polígonos: entre vértices espaçados a face fica reta e um corpo mais redondo (plus, barriga)
        # passa por ela; subdividida (sem mudar a forma nem a textura), o afastamento da pele tem pontos para agir
        import bmesh
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=2 if len(ob.data.vertices) < 1000 else 1, use_grid_fill=True)
        bm.to_mesh(ob.data)
        bm.free()
        ob.data.update()
    G = pos_mundo(ob)
    Pc = pos_mundo(corpo)
    Tc = tris_de(corpo.data)
    k = (Pc[:, 2].max() - Pc[:, 2].min()) / ALTURA_BASE
    folga = 0.005 * max(k, 0.4)
    mesma = fam_S == fam_destino
    if mesma:
        # mesma malha: cada ponto preso ao mesmo triângulo da pele, com o deslocamento inteiro no referencial do
        # triângulo (normal e as duas direções da superfície; proporcional à altura): peças largas (saia, casaco)
        # mantêm a forma, e não só a distância até a pele
        liga = []
        for g in G:
            i, b, q, _ = S.perto(g)
            p_, n_, e1, e2 = S.referencial(i, b)
            o = g - p_
            liga.append((i, b, np.array([o @ e1, o @ e2, o @ n_])))
    else:
        # malhas diferentes: cada ponto da pele de origem vai para o lugar correspondente do corpo de destino (raio
        # pela normal, na malha-base da família dele), e a peça inteira se move junto, pela média ponderada dos
        # deslocamentos dos pontos de pele mais perto: ela incha ou encolhe com o corpo sem rasgar
        from mathutils.kdtree import KDTree
        corr = [X.projeta(S.P[v], S.N[v])[:2] for v in range(len(S.P))]
        kd = KDTree(len(S.P))
        for v, p_ in enumerate(S.P):
            kd.insert(Vector(p_), v)
        kd.balance()
        vizinhos = []
        for g in G:
            vz = kd.find_n(Vector(g), 8)
            w = np.array([1.0 / (d_ + 1e-4) ** 2 for _, _, d_ in vz])
            vizinhos.append((np.array([ix for _, ix, _ in vz]), w / w.sum()))

    E = np.array([e.vertices[:] for e in ob.data.edges], dtype=np.int64)

    def posicoes(P_corpo):
        M = Malha(P_corpo, Tc)
        if mesma:
            out = []
            for i, b, o in liga:
                p_, n_, e1, e2 = M.referencial(i, b)
                out.append(p_ + (e1 * o[0] + e2 * o[1] + n_ * o[2]) * k)
            out = np.array(out)
        else:
            alvo = np.array([M.avalia(i, b)[0] for i, b in corr])
            D = alvo - S.P
            out = np.array([g + w @ D[ix] for g, (ix, w) in zip(G, vizinhos)])
        out = _afasta(out, M, folga)
        # o meio de cada aresta também fica fora da pele (vincos e dobras para dentro afundam entre os vértices)
        for _ in range(2):
            mov = np.zeros_like(out)
            cnt = np.zeros(len(out))
            for a_, b_ in E:
                q = (out[a_] + out[b_]) / 2
                loc, nrm, _, _ = M.bvh.find_nearest(Vector(q))
                if loc is None:
                    continue
                lado = (Vector(q) - loc).dot(nrm)
                if lado < folga:
                    dv = np.array(nrm) * (folga - lado)
                    mov[a_] += dv
                    mov[b_] += dv
                    cnt[a_] += 1
                    cnt[b_] += 1
            if not cnt.any():
                break
            ok = cnt > 0
            out[ok] += mov[ok] / cnt[ok, None]
        return out

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
    # pesos do esqueleto: os da pele embaixo de cada ponto, no corpo de destino
    M0 = Malha(Pc, Tc)
    sob = [M0.perto(p_)[:2] for p_ in Pg]
    nomes, Wg = _pesos(corpo, [b for _, b in sob], [i for i, _ in sob], Tc)
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
    item = _resolve(item)
    var = item.get("variacao", {})
    if item.get("compoe"):  # peça composta (vestido = blusa + saia): cada parte encaixada e juntadas numa malha só
        partes = [veste(ITENS[i], arm, corpo, pasta_pacotes) for i in item["compoe"]]
        ob = partes[0]
        for o in partes[1:]:
            for m in list(o.modifiers):
                o.modifiers.remove(m)
        with bpy.context.temp_override(active_object=ob, selected_editable_objects=partes):
            bpy.ops.object.join()
        garante_mascara(ob, item["id"])
        return ob
    if item.get("gerar", {}).get("tipo") == "chapeu":  # chapéu feito sobre a cabeça do corpo
        import geradores as GER
        ob = GER.chapeu(corpo, item["gerar"])
        ob.parent = arm
        ob.matrix_parent_inverse = arm.matrix_world.inverted()
    elif item["tipo"] in ("cabeca", "rosto"):
        ajuste = _ajuste_chapeu(var["forma"]) if var.get("forma") else None
        ob = CAB.encaixa({**item, "tipo": "rosto" if item["tipo"] == "rosto" else "cabelo"}, arm, corpo, pasta_pacotes,
                         ajuste=ajuste)
        _materiais(ob, pasta_pacotes, item["arquivo"])
    else:
        fam = familia(corpo, pasta_pacotes)
        if fam is None:
            raise ValueError(f"corpo {corpo.name}: malha fora das famílias do pacote")
        ob = encaixa_pele(item, arm, corpo, pasta_pacotes, fam)
    garante_mascara(ob, item["id"])  # a cor é livre (máscara); "cor" da variação é só a cor inicial na página
    return ob
