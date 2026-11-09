"""Móveis do Morada: categoria "natal" — o pacote gratuito Christmas Pack inteiro (as 90 peças separadas).

Uso interno: todas as peças são do pacote (pacote=True, não distribuir). Cada FBX vira uma peça (a lareira já vem
montada com lenha, carvão e fogo; as quatro partes do fogo também saem soltas).

Uso (de SP):
  MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/moveis_natal.py -- SP/moveis_out [id1,id2 ...]
  MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/moveis_natal.py -- SP/moveis_out sonda [Nome_fbx ...]
Com ids: só essas peças (o catálogo guarda as demais). "sonda" lista, por parte e material, as cores da paleta.

Convenções próprias desta categoria:
- Cores: cada face do FBX recebe a cor da paleta mais próxima do pixel da textura do pacote (Textures_4 e Garland),
  como nas outras peças de pacote. As quatro texturas de padrão do pacote (Cookie, Biscuit, waffle, Sponge_cake: a
  massa de biscoito das paredes, o piso, o forro do telhado e o bolo da base) viram estampas (material_estampa,
  512 px) com o UV original.
- Luzes: lâmpadas do pisca-pisca, da luz de estaca, das árvores e das luminárias usam "luz" (acesa à noite; as
  guirlandas ganharam lampadinhas de luz). O fogo da lareira é um filho "fogo" com {"anima": "piscar",
  "periodo": 0.6}: a base da chama é material luz e o meio e as pontas ficam fogo e laranja (para ter cor de dia);
  a lista vai em extra["animacoes"] e a luz real da peça em extra["luz"] (como as luminárias).
- Peças de cenário (paredes, piso, telhados, base de bolo, janelas e portal): entram como peças de construção, com
  extra["construcao"] = True e uma nota em extra["nota"].
"""
import math
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import bmesh  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import moveis_base as mb  # noqa: E402

V = Vector
AQUI = os.path.dirname(os.path.abspath(__file__))
SP = os.path.dirname(AQUI)
ARGS = sys.argv[sys.argv.index("--") + 1:]
SAIDA = ARGS[0]
MODO_SONDA = len(ARGS) > 1 and ARGS[1] == "sonda"
IDS_PEDIDOS = None if MODO_SONDA else (set(",".join(ARGS[1:]).split(",")) - {""} or None)
FBX_DIR = os.environ.get("NATAL_FBX", os.path.join(SP, "ideias/Christmas_Pack/Christmas_Pack_Free_fbx/Separate_assets_fbx"))
TEX_DIR = os.environ.get("NATAL_TEX", os.path.join(SP, "ideias/Christmas_Pack/Textures/Textures"))
CAT = "natal"
EST_DIR = os.path.join(SAIDA, CAT, "_estampas")
LUZ_COR = "#FFE3A0"
FOGO_COR = "#FF9A3C"

# texturas de padrão → estampa (nome da estampa)
PADROES = {"Cookie.png": "natal_biscoito", "Biscuit.png": "natal_piso_biscoito", "waffle.png": "natal_waffle",
           "Sponge_cake.png": "natal_bolo"}


# cores "da cidade" que o vizinho mais próximo às vezes escolhe: trocadas pela equivalente da parte dos móveis
REMAP = {"calcada": "branco_gelo", "trilho": "cinza_medio", "concreto": "cinza_claro", "concreto_escuro": "cinza",
         "asfalto": "grafite", "asfalto_claro": "grafite", "dormente": "madeira_media", "terra": "marrom",
         "terra_escura": "marrom_escuro", "grama_escura": "folha", "grama": "folha_clara", "agua_funda": "azul_medio",
         "agua_rio": "azul", "brita": "cinzas", "neon_ciano": "turquesa_claro", "piso_rosado": "rosa_claro",
         "terra_seca": "caramelo"}


# =====================================================================================================================
# Importação
# =====================================================================================================================
_TEX = {}


def _textura(nome_img):
    base = re.sub(r"\.\d{3}$", "", nome_img)
    if base not in _TEX:
        img = bpy.data.images.load(os.path.join(TEX_DIR, base), check_existing=True)
        W, H = img.size
        arr = np.empty(W * H * 4, dtype=np.float32)
        img.pixels.foreach_get(arr)
        _TEX[base] = (base, W, H, arr.reshape(H, W, 4))
    return _TEX[base]


def _estampa(base):
    """Cópia de 512 px da textura de padrão do pacote → material estampa. Devolve o índice do material."""
    nome = PADROES[base]
    caminho = os.path.join(EST_DIR, nome + ".png")
    if not os.path.exists(caminho):
        os.makedirs(EST_DIR, exist_ok=True)
        img = bpy.data.images.load(os.path.join(TEX_DIR, base), check_existing=False)
        img.scale(512, 512)
        img.filepath_raw = caminho
        img.file_format = "PNG"
        img.save()
        bpy.data.images.remove(img)
    return mb.material_estampa(nome, caminho)


def _tex_do_material(m):
    if not m or not m.use_nodes:
        return None
    for n in m.node_tree.nodes:
        if n.type == "TEX_IMAGE" and n.image:
            return n.image.name
    return None


class Face:
    """O que a regra de cor recebe de cada face."""
    __slots__ = ("parte", "mat", "cor", "rgb", "c", "n")


def importa(nome, regra=None):
    """Importa <nome>.fbx (metros, Z para cima, frente em −Y, como o importador do FBX deixa) e troca as cores pela
    paleta. regra(f: Face) pode devolver None (fica a cor da paleta), um nome de cor ou (cor, material).
    Devolve {parte: objeto}; a parte principal tem a chave "corpo"."""
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=os.path.join(FBX_DIR, nome + ".fbx"))
    novos = [o for o in bpy.data.objects if o not in antes]
    mb.materiais()
    for b in PADROES:
        _estampa(b)
    cache = {}
    out = {}
    dg = bpy.context.evaluated_depsgraph_get()
    for o in novos:
        if o.type != "MESH":
            continue
        me = bpy.data.meshes.new_from_object(o.evaluated_get(dg)) if o.modifiers else o.data.copy()
        me.transform(o.matrix_world)
        bm = bmesh.new()
        bm.from_mesh(me)
        mats = [(m.name.split(".")[0] if m else "", _tex_do_material(m)) for m in me.materials]
        bpy.data.meshes.remove(me)
        uvl = bm.loops.layers.uv.active
        nova = bm.loops.layers.uv.new("UVMap_n")
        bm.faces.ensure_lookup_table()
        nm = "corpo" if o.parent is None or o.parent.type != "MESH" else o.name
        if o.name == nome:
            nm = "corpo"
        for f in bm.faces:
            mname, tname = mats[f.material_index] if f.material_index < len(mats) else ("", None)
            us = [lo[uvl].uv.copy() for lo in f.loops]
            if mname.lower().startswith("glass"):
                f.material_index = mb.MAT_NOMES.index("vidro")
                for lo in f.loops:
                    lo[nova].uv = mb.uv_cor("branco")
                continue
            base = re.sub(r"\.\d{3}$", "", tname or "Textures_4.png")
            if base in PADROES:
                f.material_index = _estampa(base)
                for lo, u in zip(f.loops, us):
                    lo[nova].uv = u
                continue
            _, W, H, px = _textura(base)
            u = sum(q[0] for q in us) / len(us)
            v = sum(q[1] for q in us) / len(us)
            xi = min(W - 1, max(0, int(u % 1.0 * W)))
            yi = min(H - 1, max(0, int(v % 1.0 * H)))
            rgb = tuple(round(float(c), 3) for c in px[yi, xi, :3])
            if rgb not in cache:
                c0 = mb.cor_mais_proxima(rgb)
                cache[rgb] = REMAP.get(c0, c0)
            cor, mat = cache[rgb], "atlas"
            if mname.lower().startswith("emission"):
                mat = "luz"
            if regra:
                fi = Face()
                fi.parte, fi.mat, fi.cor, fi.rgb, fi.c, fi.n = nm, mname, cor, rgb, f.calc_center_median(), f.normal
                r = regra(fi)
                if isinstance(r, str):
                    cor = r
                elif r:
                    cor, mat = r
            f.material_index = mb.MAT_NOMES.index(mat)
            uu = mb.uv_cor(cor or "branco")
            for lo in f.loops:
                lo[nova].uv = uu
        for nome_l in [lay.name for lay in bm.loops.layers.uv if lay.name != "UVMap_n"]:
            bm.loops.layers.uv.remove(bm.loops.layers.uv[nome_l])
        mesh = bpy.data.meshes.new(nm)
        bm.to_mesh(mesh)
        bm.free()
        mesh.uv_layers[0].name = "UVMap"
        for n in mb.MAT_NOMES:
            mesh.materials.append(bpy.data.materials[n])
        mesh.shade_smooth()
        mesh.set_sharp_from_angle(angle=math.radians(40))
        ob = bpy.data.objects.new(nm, mesh)
        bpy.context.scene.collection.objects.link(ob)
        if nm in out:  # várias partes soltas (o Papai Noel): junta no corpo
            out[nm] = mb.junta([out[nm], ob], nm)
        else:
            out[nm] = ob
    for o in novos:
        if o.name in bpy.data.objects:
            d = o.data if o.type == "MESH" else None
            bpy.data.objects.remove(o)
            if d is not None and d.users == 0:
                bpy.data.meshes.remove(d)
    for a in list(bpy.data.armatures):
        if a.users == 0:
            bpy.data.armatures.remove(a)
    return out


def sonda(nomes):
    from collections import Counter
    for nome in nomes:
        mb.limpa()
        reg = []

        def regra(f):
            reg.append((f.parte, f.mat, f.cor))
        pc = importa(nome, regra)
        print("==", nome, {k: [round(x, 3) for x in mb.bbox(o)[0]] + [round(x, 3) for x in mb.bbox(o)[1]]
                           for k, o in pc.items()})
        for (p, m), cnt in sorted(Counter((p, m) for p, m, _ in reg).items()):
            cs = Counter(c for pp, mm, c in reg if pp == p and mm == m)
            print("  ", p, m, cnt, dict(cs.most_common(12)))
        mb.limpa()




# =====================================================================================================================
# Montagem: item com filhos animados, origem, portas, gavetas, slots, colisão, luzes
# =====================================================================================================================
class ItemN(mb.Item):
    """Item com filhos animados (extras glTF no nó filho, como o mobiliário da cidade)."""

    def __init__(self, id_):
        super().__init__(id_)
        self.animados = []

    def anima(self, objs, dados, nome, pivo=None):
        ob = mb.junta(objs if isinstance(objs, (list, tuple)) else [objs], nome)
        if pivo is None:
            lo, hi = mb.bbox(ob)
            pivo = (lo + hi) / 2
        d = V(pivo)
        ob.data.transform(Matrix.Translation(-d))
        ob.location = d
        self.animados.append((ob, dict(dados)))
        return ob

    def monta(self):
        corpo = super().monta()
        for ob, d in self.animados:
            ob.parent = corpo
            for k, v in d.items():
                ob[k] = v
        bpy.context.view_layer.update()
        return corpo

    def lista_animacoes(self):
        return [dict(nome=ob.name, **d, pivo=mb._gl(ob.location)) for ob, d in self.animados]


def prepara(pc, esc=1.0, rot=0.0, fix="chao", ref=None):
    """Escala (número ou (sx, sy, sz)), gira em Z (graus) e põe a origem conforme a fixação (chao/apoio: centro da
    base; parede: meio da largura, fundo em y = 0, base em z = 0; teto: ponto mais alto em z = 0; centro: meio da
    espessura, para janelas que entram no vão da parede). Devolve a matriz aplicada (para levar medidas do pacote)."""
    objs = list(pc.values())
    e = tuple(esc) if isinstance(esc, (tuple, list)) else (esc, esc, esc)
    M = Matrix.Rotation(math.radians(rot), 4, "Z") @ Matrix.Diagonal((*e, 1))
    for o in objs:
        o.data.transform(M)
    lo, hi = mb.bbox([pc[k] for k in ref] if ref else objs)
    cx, cy = (lo.x + hi.x) / 2, (lo.y + hi.y) / 2
    d = {"chao": (-cx, -cy, -lo.z), "apoio": (-cx, -cy, -lo.z), "centro": (-cx, -cy, -lo.z),
         "parede": (-cx, -hi.y, -lo.z), "teto": (-cx, -cy, -hi.z)}[fix]
    T = Matrix.Translation(d)
    for o in objs:
        o.data.transform(T)
    return T @ M


def pz(M, z):
    return (M @ V((0, 0, z))).z


def _cor_face(ob, p):
    u = ob.data.uv_layers["UVMap"].data[p.loop_indices[0]].uv
    i = int(u[0] * 16) + 16 * int((1 - u[1]) * 16)
    return mb.NOMES[i] if 0 <= i < len(mb.NOMES) else None


def nivel(ob, z, tol=0.025, regiao=None):
    """Faces de cima (normal z > 0,9) em volta de z: (x0, y0, x1, y1, z médio) ou None."""
    vs, zs = [], []
    for p in ob.data.polygons:
        if p.normal.z > 0.9 and abs(p.center.z - z) < tol and (regiao is None or regiao(p.center)):
            zs.append(p.center.z)
            vs += [ob.data.vertices[i].co for i in p.vertices]
    if not vs:
        return None
    return (min(v.x for v in vs), min(v.y for v in vs), max(v.x for v in vs), max(v.y for v in vs), sum(zs) / len(zs))


def slot_nivel(it, nome, ob, z, alt, tol=0.025, regiao=None, encolhe=0.01, pai=None, divide=1):
    r = nivel(ob, z, tol, regiao)
    if r is None:
        print("aviso: sem nivel para o slot", it.id, nome, round(z, 3), flush=True)
        return
    x0, y0, x1, y1, zm = r
    w = (x1 - x0) / divide
    for k in range(divide):
        nm = nome if divide == 1 else f"{nome}_{k + 1}"
        it.slot(nm, (x0 + w * (k + 0.5), (y0 + y1) / 2, zm), (w - 2 * encolhe, y1 - y0 - 2 * encolhe, alt), pai)


def slot_topo(it, nome, ob, alt=0.4, tol=0.03, regiao=None, encolhe=0.01):
    zt = max(p.center.z for p in ob.data.polygons if p.normal.z > 0.9 and (regiao is None or regiao(p.center)))
    slot_nivel(it, nome, ob, zt, alt, tol, regiao, encolhe)


def frente_corpo(corpo):
    """y do plano da frente do corpo: entre as faces viradas para −Y na faixa da frente (até 8 cm atrás do ponto mais
    à frente; o fundo de dentro do móvel oco também olha para −Y e não conta), a que tem mais área."""
    h = {}
    y0 = min(v.co.y for v in corpo.data.vertices)
    for p in corpo.data.polygons:
        if p.normal.y < -0.9 and p.center.y < y0 + 0.08:
            k = round(p.center.y, 2)
            h[k] = h.get(k, 0.0) + p.area
    return max(h, key=h.get)


def portas(it, pc, nomes, corpo, lados=None):
    """Portas do pacote: dobradiça na borda de fora, no plano da frente do corpo (ou na face da porta, se ela entra
    no vão), na base da folha."""
    yf = frente_corpo(corpo)
    out = []
    for k, nm in enumerate(nomes):
        ob = pc.pop(nm)
        lo, hi = mb.bbox(ob)
        lado = (lados or {}).get(nm) or ("esq" if (lo.x + hi.x) / 2 < 0 else "dir")
        x = lo.x if lado == "esq" else hi.x
        face = min(v.co.y for v in ob.data.vertices if abs(v.co.x - x) < 0.03)
        y = min(max(face, yf), hi.y)
        out.append(it.porta([ob], dobradica=(x, y, lo.z), lado=lado, nome=f"porta_{k + 1}"))
    return out


def porta_baixo(it, ob, corpo, nome="porta_forno"):
    """Porta de forno: dobradiça embaixo, tomba para a frente."""
    yf = frente_corpo(corpo)
    lo, hi = mb.bbox(ob)
    face = min(v.co.y for v in ob.data.vertices if abs(v.co.z - lo.z) < 0.03)
    y = min(max(face, yf), hi.y)
    return it.porta([ob], dobradica=((lo.x + hi.x) / 2, y, lo.z), eixo="x", lado="baixo", nome=nome, abre_graus=90)


def gaveta_pronta(it, ob, curso, nome="gaveta_1", slot_z=None, slot_alt=0.1):
    """Gaveta que já vem como caixa no pacote: origem na frente, anda para −Y; slot dentro, filho da gaveta."""
    lo, hi = mb.bbox(ob)
    d = V(((lo.x + hi.x) / 2, lo.y, lo.z))
    ob = mb.junta([ob], nome)
    if slot_z is not None:
        r = nivel(ob, slot_z, 0.03)
        if r:
            x0, y0, x1, y1, zm = r
            it.slots.append((f"slot_{nome}", ((x0 + x1) / 2, (y0 + y1) / 2, zm), (x1 - x0 - 0.02, y1 - y0 - 0.02,
                                                                                   slot_alt), nome))
    ob.data.transform(Matrix.Translation(-d))
    ob.location = d
    it.interativos.append((ob, {"interativo": "gaveta", "direcao": mb._gl((0, -1, 0)), "curso": round(curso, 4)}))
    return ob


def centro_luz(objs):
    """Centro das faces de material luz (para a luz real da peça)."""
    mi = mb.MAT_NOMES.index("luz")
    pts = [o.matrix_world @ p.center for o in objs for p in o.data.polygons if p.material_index == mi]
    if not pts:
        return None
    return sum(pts, V()) / len(pts)


def luz_extra(pos, alcance, cor=LUZ_COR):
    return {"luz": {"posicao": mb._gl(V(pos)), "cor": cor, "alcance": alcance}}


def lampadinhas(ob, n, r, cores, semente, ny=-0.35):
    """n lampadinhas (material luz) espalhadas por igual nas faces das cores dadas viradas para a frente."""
    import random
    rnd = random.Random(semente)
    cand = [p for p in ob.data.polygons if p.material_index == 0 and _cor_face(ob, p) in cores and p.normal.y < ny]
    if not cand:
        return []
    esc = [rnd.choice(cand)]
    while len(esc) < n:  # ponto mais distante dos já escolhidos (fica espalhado, sem amontoar)
        melhor = max(rnd.sample(cand, min(len(cand), 60)),
                     key=lambda p: min((p.center - q.center).length for q in esc))
        esc.append(melhor)
    return [mb.esfera(r, *(p.center + p.normal * r * 0.35), cor=None, mat="luz", seg=8, nome="lampada")
            for p in esc]


def corta_base(ob, frac, cor="plastico_branco"):
    """Corta a malha num plano horizontal (frac da altura) e fecha o corte: monte com base plana."""
    lo, hi = mb.bbox(ob)
    zc = lo.z + frac * (hi.z - lo.z)
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    r = bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, zc),
                               plane_no=(0, 0, 1), clear_inner=True)
    borda = [e for e in r["geom_cut"] if isinstance(e, bmesh.types.BMEdge)]
    novas = bmesh.ops.holes_fill(bm, edges=borda, sides=0)["faces"]
    if novas:
        bmesh.ops.triangulate(bm, faces=novas)
    uvl = bm.loops.layers.uv["UVMap"]
    u = mb.uv_cor(cor)
    for f in bm.faces:
        if abs(f.normal.z) > 0.99 and abs(f.calc_center_median().z - zc) < 1e-4:
            f.material_index = 0
            for lo_ in f.loops:
                lo_[uvl].uv = u
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.transform(Matrix.Translation((0, 0, -zc)))


def col_mesa(ob, zt, esp=0.05, perna=0.08, recuo=0.06, centro=False):
    lo, hi = mb.bbox(ob)
    cx, cy = (lo.x + hi.x) / 2, (lo.y + hi.y) / 2
    L, P = hi.x - lo.x, hi.y - lo.y
    cx_ = [((cx, cy, zt - esp), (L, P, esp))]
    if centro:
        return cx_ + [((cx, cy, 0), (L * 0.45, P * 0.45, zt - esp))]
    for sx in (-1, 1):
        for sy in (-1, 1):
            cx_.append(((cx + sx * (L / 2 - recuo), cy + sy * (P / 2 - recuo), 0), (perna, perna, zt - esp)))
    return cx_


def col_niveis(ob, niveis):
    """Caixas empilhadas pelo contorno da malha em faixas de altura (árvore, boneco de neve, cabideiro)."""
    out = []
    vs = [v.co for v in ob.data.vertices]
    for z0, z1, k in niveis:
        fx = [v for v in vs if z0 <= v.z <= z1] or vs
        x0, x1 = min(v.x for v in fx), max(v.x for v in fx)
        y0, y1 = min(v.y for v in fx), max(v.y for v in fx)
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        out.append(((cx, cy, z0), ((x1 - x0) * k, (y1 - y0) * k, z1 - z0)))
    return out


# =====================================================================================================================
# Regras de cor
# =====================================================================================================================
def r_lampadas(f):
    """Material Garland do pacote = lâmpadas (cordão, árvores, estaca): material luz."""
    if f.mat.lower().startswith("garland"):
        return ("amarelo_claro", "luz")
    return None


def r_brasas(f):
    """Carvão do pacote: os pedaços escuros ficam carvão, os médios brasa e os claros fogo."""
    if f.cor in ("chocolate", "marrom_escuro", "nogueira", "carvao"):
        return ("carvao", "atlas")
    if f.cor in ("terracota_escura", "tijolo", "terracota"):
        return ("brasa", "atlas")
    return ("fogo", "atlas")


def r_fogo(f):
    """Chama do pacote (degradê de baixo para cima): a base é o miolo aceso (luz), o meio amarelo-fogo e as pontas
    laranja, para a chama ter cor de dia; à noite a base acende e a luz da peça ilumina o resto."""
    if f.cor == "brasa":
        return ("fogo", "atlas")
    if f.cor == "laranja":
        return ("laranja", "atlas")
    return ("fogo", "luz")


def r_chamine(f):
    if f.mat.lower().startswith("emission"):  # a boca da chaminé: escura, não acesa
        return ("carvao", "atlas")
    return None


# =====================================================================================================================
# Peças
# =====================================================================================================================
P = []
HOUSE = 0.9  # escala do cenário de casa de biscoito (porta de 2 m; paredes de 3,15 m)
T_CONS = "Peça de cenário da casa de biscoito do pacote, em escala de casa (porta de 2 m)."


def peca(id_, rotulo, grupo, fbx, tags=(), fix="chao", alt=None, mini=None, construcao=None):
    def deco(f):
        P.append(dict(id=id_, rotulo=rotulo, grupo=grupo, fbx=fbx, tags=["natal", "pacote"] + list(tags), fix=fix,
                      alt=alt, mini=mini, construcao=construcao, fn=f))
        return f
    return deco


def simples(nome, esc=1.0, rot=0.0, fix="chao", regra=None, ref=None):
    """Importa, prepara e põe tudo no corpo. Devolve (it, pc, M) com pc já vazio."""
    def f(it):
        pc = importa(nome, regra)
        M = prepara(pc, esc, rot, "chao" if fix == "apoio" else fix, ref)
        corpo = pc["corpo"]
        it.add(list(pc.values()))
        return corpo, M
    return f


MINI_PAREDE = (0.3, -1.0, 0.18)


# ------------------------------------------------------------------------------------------------- móveis da sala
@peca("poltrona_natal_estofada_marrom_pacote", "Poltrona estofada marrom de Natal", "poltrona_natal_estofada",
      "Armchair_001", ["poltrona", "sala", "estofado"])
def _(it):
    pc = importa("Armchair_001")
    M = prepara(pc, 0.88)
    c = pc["corpo"]
    it.add(c)
    slot_nivel(it, "assento", c, pz(M, 0.53), 0.5, tol=0.035, regiao=lambda q: abs(q.x) < 0.3)


@peca("poltrona_natal_bracos_madeira_pacote", "Poltrona de braços de madeira com almofada laranja",
      "poltrona_natal_bracos_madeira", "Armchair_002", ["poltrona", "sala", "madeira"])
def _(it):
    pc = importa("Armchair_002")
    M = prepara(pc)
    c = pc["corpo"]
    it.add(c)
    slot_nivel(it, "assento", c, pz(M, 0.43), 0.5, tol=0.025, regiao=lambda q: abs(q.x) < 0.27)


@peca("sofa_natal_dois_lugares_laranja_pacote", "Sofá de dois lugares laranja", "sofa_natal_dois_lugares",
      "Couch_001", ["sofa", "sala", "estofado"])
def _(it):
    pc = importa("Couch_001")
    M = prepara(pc)
    c = pc["corpo"]
    it.add(c)
    slot_nivel(it, "assento", c, pz(M, 0.49), 0.5, tol=0.025, regiao=lambda q: abs(q.x) < 0.62, divide=2)


@peca("pufe_natal_saco_vermelho_pacote", "Pufe saco vermelho", "pufe_natal_saco", "Pouf_001", ["pufe", "sala", "macio"])
def _(it):
    pc = importa("Pouf_001")
    M = prepara(pc)
    c = pc["corpo"]
    it.add(c)
    slot_nivel(it, "assento", c, pz(M, 0.47), 0.5, tol=0.035, regiao=lambda q: abs(q.x) < 0.3 and abs(q.y) < 0.3)


@peca("mesa_centro_natal_redonda_pacote", "Mesa de centro redonda cinza", "mesa_centro_natal_redonda",
      "Coffee_Table_001", ["mesa", "sala", "centro"])
def _(it):
    pc = importa("Coffee_Table_001")
    prepara(pc)
    c = pc["corpo"]
    it.add(c)
    slot_topo(it, "tampo", c, 0.4)
    it.colisao(col_mesa(c, mb.bbox(c)[1].z, perna=0.06, recuo=0.14))


@peca("cabideiro_natal_madeira_pacote", "Cabideiro de pé de madeira", "cabideiro_natal", "Hanger_001",
      ["cabideiro", "entrada", "madeira"])
def _(it):
    pc = importa("Hanger_001")
    prepara(pc)
    c = pc["corpo"]
    it.add(c)
    H = mb.bbox(c)[1].z
    it.colisao(col_niveis(c, [(0, 0.12, 0.8), (0.12, H - 0.45, 1.0), (H - 0.45, H, 0.85)]))


@peca("luminaria_natal_chao_cupula_pacote", "Luminária de chão com cúpula", "luminaria_natal_chao", "Light_001",
      ["luminaria", "luz", "sala"])
def _(it):
    pc = importa("Light_001")
    prepara(pc)
    c = pc["corpo"]
    it.add(c)
    H = mb.bbox(c)[1].z
    it.colisao(col_niveis(c, [(0, 0.06, 0.9), (0.06, H - 0.45, 1.0), (H - 0.45, H, 1.0)]))
    p = centro_luz([c])
    return luz_extra(p, 4.0)


@peca("luminaria_natal_mesa_cogumelo_pacote", "Luminária de mesa cogumelo", "luminaria_natal_mesa", "Light_002",
      ["luminaria", "luz", "mesa"], fix="apoio")
def _(it):
    pc = importa("Light_002")
    prepara(pc, 0.9)
    c = pc["corpo"]
    it.add(c)
    return luz_extra(centro_luz([c]), 3.0)


@peca("lustre_natal_tres_bracos_pacote", "Lustre de três braços com pratos vermelhos", "lustre_natal", "Light_003",
      ["luminaria", "luz", "teto", "lustre"], fix="teto")
def _(it):
    pc = importa("Light_003")
    prepara(pc, 0.8, fix="teto")
    c = pc["corpo"]
    it.add(c)
    return luz_extra(centro_luz([c]), 5.0)


# ---------------------------------------------------------------------------------------------- quarto e aparador
@peca("cama_natal_casal_laranja_pacote", "Cama de casal laranja com cabeceira de grade", "cama_natal_casal",
      "Bed_001", ["cama", "quarto", "casal"])
def _(it):
    pc = importa("Bed_001")
    M = prepara(pc)
    c = pc["corpo"]
    it.add(c)
    lo, hi = mb.bbox(c)
    slot_nivel(it, "colchao", c, pz(M, 0.63), 0.4, tol=0.03, regiao=lambda q: abs(q.x) < 0.75)


@peca("criado_natal_gaveta_nicho_pacote", "Criado-mudo com gaveta e nicho", "criado_natal_gaveta", "Nightstand_001",
      ["criado", "quarto", "gaveta"])
def _(it):
    pc = importa("Nightstand_001")
    M = prepara(pc)
    c = pc.pop("corpo")
    it.add(c)
    gav = pc.pop("Nightstand_001_Shelf_001")
    gaveta_pronta(it, gav, 0.2, slot_z=pz(M, 0.21), slot_alt=0.1)
    slot_nivel(it, "nicho", c, pz(M, 0.35), 0.18, tol=0.02)
    slot_topo(it, "tampo", c, 0.4)


@peca("aparador_natal_duas_portas_pacote", "Aparador com duas portas creme", "aparador_natal", "Cabinet_001",
      ["aparador", "sala", "portas"])
def _(it):
    pc = importa("Cabinet_001")
    M = prepara(pc)
    c = pc.pop("corpo")
    it.add(c)
    portas(it, pc, ["Cabinet_001_door_001", "Cabinet_001_door_002"], c)
    slot_nivel(it, "dentro", c, pz(M, 0.23), 0.42, tol=0.02, regiao=lambda q: abs(q.x) < 0.5)
    slot_topo(it, "tampo", c, 0.4)


# ------------------------------------------------------------------------------------------------------ cozinha
@peca("armario_cozinha_natal_balcao_pacote", "Balcão de cozinha vermelho com duas portas", "armario_cozinha_natal_balcao",
      "Kitchen_Cabinet_001", ["cozinha", "armario", "balcao", "portas"])
def _(it):
    pc = importa("Kitchen_Cabinet_001")
    M = prepara(pc)
    c = pc.pop("corpo")
    it.add(c)
    portas(it, pc, ["Kitchen_Cabinet_001_door_001", "Kitchen_Cabinet_001_door_002"], c)
    slot_nivel(it, "prateleira_baixo", c, pz(M, 0.19), 0.17, tol=0.02)
    slot_nivel(it, "prateleira_cima", c, pz(M, 0.38), 0.27, tol=0.02)
    slot_topo(it, "bancada", c, 0.45)


@peca("armario_cozinha_natal_aereo_pacote", "Armário aéreo de cozinha vermelho com duas portas",
      "armario_cozinha_natal_aereo", "Kitchen_Cabinet_002", ["cozinha", "armario", "aereo", "portas"], fix="parede",
      alt=1.45)
def _(it):
    pc = importa("Kitchen_Cabinet_002")
    M = prepara(pc, fix="parede")
    c = pc.pop("corpo")
    it.add(c)
    portas(it, pc, ["Kitchen_Cabinet_002_door_001", "Kitchen_Cabinet_002_door_002"], c)
    slot_nivel(it, "prateleira_baixo", c, pz(M, 0.07), 0.29, tol=0.02)
    slot_nivel(it, "prateleira_cima", c, pz(M, 0.38), 0.37, tol=0.02)
    slot_topo(it, "topo", c, 0.3)


@peca("nicho_cozinha_natal_aberto_pacote", "Nicho de cozinha aberto com duas prateleiras", "nicho_cozinha_natal",
      "Kitchen_Shelf_001", ["cozinha", "nicho", "prateleiras"], fix="parede", alt=1.45, mini=MINI_PAREDE)
def _(it):
    pc = importa("Kitchen_Shelf_001")
    M = prepara(pc, fix="parede")
    c = pc["corpo"]
    it.add(c)
    slot_nivel(it, "prateleira_baixo", c, pz(M, 0.07), 0.29, tol=0.02)
    slot_nivel(it, "prateleira_cima", c, pz(M, 0.39), 0.37, tol=0.02)
    slot_topo(it, "topo", c, 0.3)


@peca("prateleira_cozinha_natal_pacote", "Prateleira de parede de cozinha", "prateleira_cozinha_natal",
      "Kitchen_Shelf_002", ["cozinha", "prateleira"], fix="parede", alt=1.5, mini=MINI_PAREDE)
def _(it):
    pc = importa("Kitchen_Shelf_002")
    prepara(pc, fix="parede")
    c = pc["corpo"]
    it.add(c)
    slot_topo(it, "prateleira", c, 0.35)


@peca("pia_cozinha_natal_cuba_pacote", "Pia de cozinha com cuba, torneira dourada e duas portas", "pia_cozinha_natal",
      "Kitchen_sink_001", ["cozinha", "pia", "torneira", "portas"])
def _(it):
    pc = importa("Kitchen_sink_001")
    M = prepara(pc)
    c = pc.pop("corpo")
    it.add(c)
    portas(it, pc, ["Kitchen_sink_door_001", "Kitchen_sink_door_002"], c)
    slot_nivel(it, "prateleira_baixo", c, pz(M, 0.17), 0.18, tol=0.02)
    slot_nivel(it, "prateleira_cima", c, pz(M, 0.38), 0.15, tol=0.02)
    slot_nivel(it, "cuba", c, pz(M, 0.66), 0.25, tol=0.02)
    slot_nivel(it, "bancada", c, pz(M, 0.85), 0.4, tol=0.012)


@peca("fogao_natal_forno_pacote", "Fogão com forno e duas bocas", "fogao_natal", "Kitchen_stove_001",
      ["cozinha", "fogao", "forno"])
def _(it):
    pc = importa("Kitchen_stove_001")
    M = prepara(pc)
    c = pc.pop("corpo")
    it.add(c)
    porta_baixo(it, pc.pop("Kitchen_stove_door_001"), c)
    slot_nivel(it, "forno", c, pz(M, 0.16), 0.2, tol=0.02)
    slot_nivel(it, "forno_grade", c, pz(M, 0.38), 0.22, tol=0.02)
    slot_nivel(it, "cooktop", c, pz(M, 0.85), 0.35, tol=0.02)


@peca("geladeira_natal_retro_pacote", "Geladeira retrô pêssego de duas portas", "geladeira_natal", "Fridge_001",
      ["cozinha", "geladeira", "portas", "retro"])
def _(it):
    pc = importa("Fridge_001")
    M = prepara(pc, 1.15)
    c = pc.pop("corpo")
    it.add(c)
    portas(it, pc, ["Fridge_Door_01_001", "Fridge_Door_01_002"], c,
           lados={"Fridge_Door_01_001": "dir", "Fridge_Door_01_002": "dir"})
    for k, (z, a) in enumerate(((0.12, 0.21), (0.35, 0.32), (0.69, 0.3), (1.01, 0.34))):
        slot_nivel(it, "congelador" if k == 3 else f"prateleira_{k + 1}", c, pz(M, z), a * 1.15, tol=0.025,
                   regiao=lambda q: abs(q.x) < 0.3)


@peca("mesa_jantar_natal_madeira_pacote", "Mesa de jantar de madeira escura com pés torneados", "mesa_jantar_natal",
      "Kitchen_Table_001", ["mesa", "cozinha", "jantar"])
def _(it):
    pc = importa("Kitchen_Table_001")
    prepara(pc)
    c = pc["corpo"]
    it.add(c)
    slot_topo(it, "tampo", c, 0.45)
    it.colisao(col_mesa(c, mb.bbox(c)[1].z, perna=0.08, recuo=0.08))


@peca("mesa_natal_redonda_toalha_pacote", "Mesa redonda com toalha creme", "mesa_natal_redonda_toalha",
      "Kitchen_Table_002", ["mesa", "cozinha", "toalha"])
def _(it):
    pc = importa("Kitchen_Table_002")
    prepara(pc)
    c = pc["corpo"]
    it.add(c)
    slot_topo(it, "tampo", c, 0.45, regiao=lambda q: abs(q.x) < 0.33 and abs(q.y) < 0.33)
    it.colisao(col_mesa(c, mb.bbox(c)[1].z, esp=0.15, centro=True))


@peca("mesa_natal_bancada_pes_x_pacote", "Mesa-bancada com pés em X", "mesa_natal_bancada", "Kitchen_Table_003",
      ["mesa", "cozinha", "bancada"])
def _(it):
    pc = importa("Kitchen_Table_003")
    prepara(pc)
    c = pc["corpo"]
    it.add(c)
    slot_topo(it, "tampo", c, 0.4)
    lo, hi = mb.bbox(c)
    zt = hi.z
    it.colisao([((0, 0, zt - 0.06), (hi.x - lo.x, hi.y - lo.y, 0.06)),
                ((lo.x + 0.16, 0, 0), (0.22, hi.y - lo.y - 0.1, zt - 0.06)),
                ((hi.x - 0.16, 0, 0), (0.22, hi.y - lo.y - 0.1, zt - 0.06))])


@peca("banqueta_natal_pes_madeira_pacote", "Banqueta de assento creme e pés de madeira", "banqueta_natal",
      "Kitchen_stool_003", ["banqueta", "cozinha", "assento"])
def _(it):
    pc = importa("Kitchen_stool_003")
    prepara(pc)
    c = pc["corpo"]
    it.add(c)
    slot_topo(it, "assento", c, 0.5)


# ------------------------------------------------------------------------------------------------------ lareira
def _fogo_animado(it, fogo):
    return it.anima([fogo], {"anima": "piscar", "periodo": 0.6}, "fogo")


@peca("lareira_natal_acesa_chamine_pacote", "Lareira de Natal acesa com chaminé (lenha, brasas e fogo)",
      "lareira_natal", "Fireplace_001", ["lareira", "sala", "fogo", "luz", "chamine"])
def _(it):
    """A lareira do pacote com as peças do fogo nos lugares da cena do pacote (Christmas Pack_Free.fbx): brasas e
    lenha no chão da fornalha e o fogo (60%) por cima. O fogo é um filho que pisca."""
    pc = importa("Fireplace_001")
    br = importa("Fireplace_coal_001", r_brasas)["corpo"]
    le = importa("Fireplace_firewood_001")["corpo"]
    fo = importa("Fireplace_fire_001", r_fogo)["corpo"]
    br.data.transform(Matrix.Translation((-0.01, -0.33, 0.174)))
    le.data.transform(Matrix.Translation((-0.011, -0.33, 0.247)))
    fo.data.transform(Matrix.Translation((0, -0.425, 0.316)) @ Matrix.Diagonal((0.6, 0.6, 0.6, 1)))
    pc.update(brasas=br, lenha=le, fogo=fo)
    M = prepara(pc, 0.94, ref=["corpo"])
    c = pc["corpo"]
    it.add(c, br, le)
    f = _fogo_animado(it, fo)
    slot_nivel(it, "cornija", c, pz(M, 1.16), 0.4, tol=0.03)
    e = luz_extra(f.location, 4.5, FOGO_COR)
    e["animacoes"] = it.lista_animacoes()
    return e


@peca("fogo_lareira_natal_pacote", "Fogo de lareira (pisca)", "fogo_lareira_natal", "Fireplace_fire_001",
      ["lareira", "fogo", "luz"], fix="apoio")
def _(it):
    pc = importa("Fireplace_fire_001", r_fogo)
    fo = pc["corpo"]
    fo.data.transform(Matrix.Diagonal((0.6, 0.6, 0.6, 1)))
    lo, hi = mb.bbox(fo)
    fo.data.transform(Matrix.Translation((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z + 0.012)))
    # cama de brasas embaixo (o corpo fixo da peça; o fogo é o filho que pisca)
    base = mb.superelipsoide((hi.x - lo.x) * 0.95, (hi.y - lo.y) * 0.95, 0.03, cor="carvao", e=0.6, e_v=0.6, nu=20,
                             nv=8, nome="base")
    mb.pinta_onde(base, "brasa", lambda q, n: n.z > 0.6 and q.length < 0.09)
    it.add(base)
    lo, hi = mb.bbox(fo)
    f = _fogo_animado(it, fo)
    it.colisao([((0, 0, 0), (hi.x - lo.x, hi.y - lo.y, hi.z))])
    e = luz_extra(f.location, 3.5, FOGO_COR)
    e["animacoes"] = it.lista_animacoes()
    return e


@peca("brasas_lareira_natal_pacote", "Brasas de carvão de lareira", "brasas_lareira_natal", "Fireplace_coal_001",
      ["lareira", "brasas", "carvao"], fix="apoio")
def _(it):
    pc = importa("Fireplace_coal_001", r_brasas)
    prepara(pc, 0.6)
    it.add(pc["corpo"])


@peca("lenha_lareira_natal_pacote", "Lenha cruzada de lareira", "lenha_lareira_natal", "Fireplace_firewood_001",
      ["lareira", "lenha", "madeira"], fix="apoio")
def _(it):
    pc = importa("Fireplace_firewood_001")
    prepara(pc, 0.6)
    it.add(pc["corpo"])


@peca("chamine_telhado_natal_neve_pacote", "Chaminé de telhado com neve", "chamine_telhado_natal",
      "Fireplace_pipe_001", ["chamine", "telhado", "neve", "construcao"],
      construcao="Chaminé de fora, para pôr em cima do telhado da casa de biscoito; a base fica no chão da peça.")
def _(it):
    pc = importa("Fireplace_pipe_001", r_chamine)
    prepara(pc, HOUSE)
    it.add(pc["corpo"])


# ------------------------------------------------------------------------------------------------------ árvores
def _arvore(nome, esc, alcance):
    def f(it):
        pc = importa(nome, r_lampadas)
        prepara(pc, esc)
        objs = list(pc.values())
        it.add(objs)
        c = mb.junta(objs, "arvore_tmp")
        it.partes = [c]
        H = mb.bbox(c)[1].z
        it.colisao(col_niveis(c, [(0, H * 0.45, 0.8), (H * 0.45, H * 0.8, 0.6), (H * 0.8, H, 0.35)]))
        return luz_extra((0, 0, H * 0.5), alcance)
    return f


peca("arvore_natal_interna_enfeitada_pacote", "Árvore de Natal enfeitada com estrela, bolas e pisca-pisca",
     "arvore_natal_interna", "Christmass_tree_indoor_001", ["arvore", "sala", "luz", "enfeites"])(
    _arvore("Christmass_tree_indoor_001", 0.8, 2.5))
peca("arvore_natal_externa_neve_grande_pacote", "Pinheiro grande com neve e luzes (externo)",
     "arvore_natal_externa_grande", "Christmass_tree_outdoor_001", ["arvore", "jardim", "neve", "luz"])(
    _arvore("Christmass_tree_outdoor_001", 1.0, 5.0))
peca("arvore_natal_externa_neve_pacote", "Pinheiro com neve e luzes (externo)", "arvore_natal_externa",
     "Christmass_tree_outdoor_002", ["arvore", "jardim", "neve", "luz"])(
    _arvore("Christmass_tree_outdoor_002", 1.0, 4.0))


# ------------------------------------------------------------------------------------------ guirlandas e luzes
FOLHAS = {"folha", "folha_clara", "folha_escura", "grama", "verde", "verde_medio"}


@peca("guirlanda_natal_redonda_laco_pacote", "Guirlanda redonda com laço vermelho e luzinhas", "guirlanda_natal_redonda",
      "Advent_Wreath_001", ["guirlanda", "porta", "parede", "luz"], fix="parede", alt=1.45, mini=MINI_PAREDE)
def _(it):
    pc = importa("Advent_Wreath_001")
    prepara(pc, 0.6, fix="parede")
    c = pc["corpo"]
    it.add(c)
    it.add(lampadinhas(c, 16, 0.011, FOLHAS, 1))


@peca("guirlanda_natal_festao_laco_pacote", "Festão de folhas com laço vermelho e luzinhas", "guirlanda_natal_festao",
      "Advent_Wreath_002", ["guirlanda", "festao", "parede", "luz"], fix="parede", alt=1.9, mini=MINI_PAREDE)
def _(it):
    pc = importa("Advent_Wreath_002")
    prepara(pc, 0.6, fix="parede")
    c = pc["corpo"]
    it.add(c)
    it.add(lampadinhas(c, 18, 0.011, FOLHAS, 2))


@peca("pisca_pisca_natal_cordao_pacote", "Cordão de pisca-pisca de parede (3,4 m)", "pisca_pisca_natal",
      "Garland_001", ["pisca-pisca", "luz", "parede", "cordao"], fix="parede", alt=1.9, mini=(0.15, -1.0, 0.25))
def _(it):
    pc = importa("Garland_001", r_lampadas)
    prepara(pc, 0.6, fix="parede")
    it.add(pc["corpo"])
    return luz_extra(centro_luz([pc["corpo"]]), 2.5)


@peca("luz_estaca_natal_jardim_pacote", "Lâmpada decorativa de estaca (jardim e beiral)", "luz_estaca_natal",
      "Garland_002", ["luz", "jardim", "beiral", "estaca"])
def _(it):
    pc = importa("Garland_002", r_lampadas)
    prepara(pc, 0.6)
    it.add(pc["corpo"])
    return luz_extra(centro_luz([pc["corpo"]]), 2.0)


@peca("meia_natal_vermelha_pacote", "Meia de Natal vermelha", "meia_natal", "Christmass_sock_001",
      ["meia", "lareira", "parede"], fix="parede", alt=0.95, mini=MINI_PAREDE)
def _(it):
    pc = importa("Christmass_sock_001")
    prepara(pc, 1.5, rot=-90, fix="parede")
    it.add(pc["corpo"])


# ----------------------------------------------------------------------------------------------------- presentes
PRESENTES = [
    ("Present_001", "roxo_fita_azul", "roxo com fita azul", 0.45),
    ("Present_002", "verde_fita_amarela", "verde com fita amarela", 0.40),
    ("Present_003", "vermelho_fita_verde", "vermelho com fita verde", 0.36),
    ("Present_004", "laranja_fita_vermelha", "laranja com fita vermelha", 0.30),
    ("Present_005", "azul_fita_amarela", "azul com fita amarela", 0.25),
    ("Present_006", "verde_fita_laranja", "verde com fita laranja", 0.20),
]
for _n, _s, _r, _h in PRESENTES:
    def _p(it, n=_n, h=_h):
        pc = importa(n)
        lo, hi = mb.bbox(pc["corpo"])
        prepara(pc, h / (hi.z - lo.z))
        it.add(pc["corpo"])
    peca(f"presente_natal_{_s}_pacote", f"Presente com laço ({_r}, {round(_h * 100)} cm)", "presente_natal_laco", _n,
         ["presente", "arvore"], fix="apoio" if _h <= 0.3 else "chao")(_p)


# ------------------------------------------------------------------------------------------------ enfeites de fora
@peca("boneco_neve_natal_cachecol_pacote", "Boneco de neve com cachecol e chapéu de casquinha", "boneco_neve_natal",
      "Snowman_001", ["boneco de neve", "jardim", "neve"])
def _(it):
    pc = importa("Snowman_001")
    prepara(pc, 0.42)
    c = pc["corpo"]
    it.add(c)
    H = mb.bbox(c)[1].z
    it.colisao(col_niveis(c, [(0, H * 0.4, 0.75), (H * 0.4, H, 0.5)]))


@peca("papai_noel_boneco_natal_pacote", "Boneco de Papai Noel (decoração, 1,2 m)", "papai_noel_boneco",
      "Santa", ["papai noel", "boneco", "decoracao"])
def _(it):
    pc = importa("Santa")
    c = pc["corpo"]
    # o personagem do pacote tem 14,7 mil triângulos: um colapso de 25% deixa em ~11 mil sem mudar o desenho
    m = c.modifiers.new("dec", "DECIMATE")
    m.decimate_type = "COLLAPSE"
    m.ratio = 0.75
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(c.evaluated_get(dg))
    c.modifiers.remove(m)
    velha = c.data
    c.data = me
    bpy.data.meshes.remove(velha)
    lo, hi = mb.bbox(c)
    prepara(pc, 1.2 / (hi.z - lo.z))
    it.add(c)


@peca("poste_doce_listrado_natal_pacote", "Poste listrado de doce (jardim, 1,2 m)", "poste_doce_natal",
      "Shugar_cane_001", ["doce", "jardim", "bengala"])
def _(it):
    pc = importa("Shugar_cane_001")
    lo, hi = mb.bbox(pc["corpo"])
    prepara(pc, 1.2 / (hi.z - lo.z))
    it.add(pc["corpo"])


@peca("bengala_doce_natal_jardim_pacote", "Bengala de doce listrada (jardim, 1 m)", "bengala_doce_natal",
      "Shugar_cane_002", ["doce", "jardim", "bengala"])
def _(it):
    pc = importa("Shugar_cane_002")
    lo, hi = mb.bbox(pc["corpo"])
    prepara(pc, 1.0 / (hi.z - lo.z))
    it.add(pc["corpo"])


@peca("cerca_natal_listrada_pacote", "Cerca de madeira com postes listrados", "cerca_natal", "Fence_001",
      ["cerca", "jardim"])
def _(it):
    pc = importa("Fence_001")
    prepara(pc, 0.7)
    c = pc["corpo"]
    it.add(c)
    lo, hi = mb.bbox(c)
    it.colisao([((0, (lo.y + hi.y) / 2, 0), (hi.x - lo.x, min(0.16, hi.y - lo.y), hi.z))])


for _k, _n in enumerate(("Snow_001", "Snow_002", "Snow_003", "Snow_004")):
    def _neve(it, n=_n):
        pc = importa(n)
        c = pc["corpo"]
        corta_base(c, 0.4 if n != "Snow_003" else 0.55)
        prepara(pc, 0.7)
        it.add(c)
    peca(f"monte_neve_natal_{_k + 1}_pacote", f"Monte de neve {_k + 1}", "monte_neve_natal", _n, ["neve", "jardim"])(
        _neve)


# --------------------------------------------------------------------------------------- decoração de dentro
@peca("quadro_natal_pinheiro_pacote", "Quadro de pinheiro na moldura de madeira", "quadro_natal_pinheiro",
      "Painting_001", ["quadro", "parede"], fix="parede", alt=1.15, mini=MINI_PAREDE)
def _(it):
    pc = importa("Painting_001")
    prepara(pc, 0.8, fix="parede")
    it.add(pc["corpo"])


@peca("relogio_natal_pendulo_parede_pacote", "Relógio de parede com pêndulo dourado", "relogio_natal_pendulo",
      "Clock_001", ["relogio", "parede"], fix="parede", alt=1.3, mini=MINI_PAREDE)
def _(it):
    pc = importa("Clock_001")
    prepara(pc, fix="parede")
    it.add(pc["corpo"])


@peca("tapete_natal_oval_pacote", "Tapete oval rosa", "tapete_natal_oval", "Carpet_001", ["tapete"])
def _(it):
    pc = importa("Carpet_001")
    prepara(pc)
    it.add(pc["corpo"])


@peca("tapete_natal_retangular_pacote", "Tapete retangular vermelho", "tapete_natal_retangular",
      "Carpet_002", ["tapete"])
def _(it):
    pc = importa("Carpet_002")
    prepara(pc)
    it.add(pc["corpo"])


for _n, _s, _r in (("Pillow_001", "verde", "verde"), ("Pillow_002", "vermelha", "vermelha")):
    def _alm(it, n=_n):
        pc = importa(n)
        prepara(pc)
        it.add(pc["corpo"])
    peca(f"almofada_natal_{_s}_pacote", f"Almofada {_r}", "almofada_natal", _n, ["almofada", "sofa", "cama"],
         fix="apoio")(_alm)

LIVROS = [("Book_001", "livros_natal_fileira_grande_pacote", "Fileira de livros coloridos (grande)"),
          ("Book_002", "livros_natal_fileira_pacote", "Fileira de livros coloridos"),
          ("Book_003", "livros_natal_pilha_pacote", "Pilha de livros"),
          ("Book_004", "livros_natal_dois_deitados_pacote", "Dois livros deitados")]
for _n, _i, _r in LIVROS:
    def _liv(it, n=_n):
        pc = importa(n)
        prepara(pc, 0.8)
        it.add(pc["corpo"])
    peca(_i, _r, _i.replace("_pacote", ""), _n, ["livros", "estante"], fix="apoio")(_liv)


@peca("cartas_natal_papel_pacote", "Cartas de papel (para o Papai Noel)", "cartas_natal", "Paper_001",
      ["papel", "carta", "escrivaninha"], fix="apoio")
def _(it):
    pc = importa("Paper_001")
    prepara(pc)
    it.add(pc["corpo"])


# ------------------------------------------------------------------------------------------- louça e cozinha
def _apoio(nome, esc=1.0, rot=0.0, fix="chao"):
    def f(it):
        pc = importa(nome)
        prepara(pc, esc, rot, fix)
        it.add(list(pc.values()))
    return f


APOIOS = [
    ("Bowl_001", "tigela_natal_terracota_pacote", "Tigela de terracota", "tigela_natal", 0.7, ["louca", "cozinha"]),
    ("Bowl_002", "pote_natal_barro_pacote", "Pote de barro", "pote_natal_barro", 1.0, ["louca", "cozinha", "pote"]),
    ("Bowl_003", "pote_natal_barro_pequeno_pacote", "Pote de barro pequeno", "pote_natal_barro", 1.0,
     ["louca", "cozinha", "pote"]),
    ("Cup_001", "xicara_natal_grafite_pacote", "Xícara grafite", "xicara_natal", 0.75, ["louca", "cozinha", "cafe"]),
    ("Plate_001", "escorredor_natal_pratos_pacote", "Escorredor de pratos com pratos", "escorredor_natal", 0.9,
     ["louca", "cozinha", "pratos"]),
    ("Plate_002", "prato_natal_fundo_pacote", "Prato fundo creme", "prato_natal", 0.9, ["louca", "cozinha", "prato"]),
    ("Salt_shaker_001", "moedor_natal_pimenta_pacote", "Moedor de pimenta de madeira", "moedor_natal", 0.7,
     ["cozinha", "tempero"]),
    ("Spices_001", "porta_temperos_natal_pacote", "Porta-temperos com três potes", "porta_temperos_natal", 0.9,
     ["cozinha", "tempero"]),
    ("Teapot_001", "chaleira_natal_pacote", "Chaleira azul com alça amarela", "chaleira_natal", 1.0,
     ["cozinha", "cha", "louca"]),
    ("Utensils_002", "colher_pau_natal_pacote", "Colher de cozinha", "colher_natal", 1.0, ["cozinha", "utensilio"]),
    ("Utensils_003", "garfo_salada_natal_pacote", "Garfo de salada", "garfo_salada_natal", 1.0,
     ["cozinha", "utensilio"]),
    ("Utensils_004", "rolo_massa_natal_pacote", "Rolo de massa", "rolo_massa_natal", 1.0, ["cozinha", "utensilio",
                                                                                          "biscoito"]),
    ("Cookie_001", "biscoito_natal_palito_pacote", "Biscoito palito", "biscoito_natal", 0.065, ["biscoito", "doce"]),
    ("Cookie_002", "biscoitos_natal_dois_pacote", "Dois biscoitos empilhados", "biscoito_natal", 0.065,
     ["biscoito", "doce"]),
]
for _n, _i, _r, _g, _e, _t in APOIOS:
    peca(_i, _r, _g, _n, _t, fix="apoio")(_apoio(_n, _e))


@peca("porta_utensilios_natal_parede_pacote", "Barra de utensílios de parede (conchas, espátula, batedor)",
      "porta_utensilios_natal", "Utensils_001", ["cozinha", "utensilio", "parede"], fix="parede", alt=1.35,
      mini=MINI_PAREDE)
def _(it):
    pc = importa("Utensils_001")
    prepara(pc, 0.8, fix="parede")
    it.add(pc["corpo"])


# ------------------------------------------------------------------------------- construção: casa de biscoito
def _cons_malha(it, c):
    """Colisão pela própria malha (vãos de porta e janela, telhado em duas águas)."""
    it.colisao_malha(mb.copia(c, nome="colisao_malha"))
    it.sem_caixas = True


CONSTRUCAO = [
    ("Wall_001", "parede_biscoito_empena_porta_janelas_pacote", "Parede de biscoito com empena, vão de porta e janelas",
     "parede_biscoito_empena", "Parede da frente/fundo da casa (6 m × 6,5 m até a cumeeira, 27 cm), com vão de porta, "
     "óculo e duas janelas."),
    ("Wall_002", "parede_biscoito_empena_porta_pacote", "Parede de biscoito com empena e vão de porta",
     "parede_biscoito_empena_simples", "Parede de empena (6 m × 6,5 m) com vão de porta e óculo."),
    ("Wall_003", "parede_biscoito_lateral_duas_janelas_pacote", "Parede lateral de biscoito com duas janelas",
     "parede_biscoito_lateral_2", "Parede lateral (4,6 m × 3,15 m, 27 cm) com dois vãos de janela."),
    ("Wall_004", "parede_biscoito_lateral_janela_pacote", "Parede lateral de biscoito com uma janela",
     "parede_biscoito_lateral_1", "Parede lateral (4,6 m × 3,15 m, 27 cm) com um vão de janela."),
    ("Roof_inner_001", "telhado_natal_waffle_glace_pacote", "Telhado de waffle com glacê (duas águas)",
     "telhado_waffle", "Telhado inteiro (forro de waffle e beirais de glacê); vai em cima das paredes de empena."),
    ("Roof_outer_001", "telhado_natal_telhas_chocolate_pacote", "Água de telhado com telhas de chocolate",
     "telhado_telhas_chocolate", "Uma água do telhado, com telhas de chocolate; espelhe para a outra água."),
    ("Roof_snow_001", "telhado_natal_neve_cumeeira_pacote", "Neve de cumeeira de telhado", "telhado_neve",
     "Manta de neve que cobre a cumeeira do telhado."),
    ("Plantform_001", "base_natal_bolo_neve_pacote", "Base de bolo coberta de neve (ilha de 15,5 m)", "base_bolo_neve",
     "A base inteira da cena do pacote: um bolo redondo de 15,5 m com neve em cima, onde a casa fica."),
]
for _n, _i, _r, _g, _nota in CONSTRUCAO:
    def _cons(it, n=_n):
        pc = importa(n)
        prepara(pc, HOUSE)
        c = pc["corpo"]
        it.add(c)
        _cons_malha(it, c)
    peca(_i, _r, _g, _n, ["construcao", "casa de biscoito"], construcao=T_CONS + " " + _nota)(_cons)


@peca("piso_natal_biscoito_glace_pacote", "Piso de biscoito com glacê rosa e confeitos", "piso_biscoito_glace",
      "Floor_001", ["construcao", "piso", "casa de biscoito"],
      construcao=T_CONS + " Piso da casa (5,4 m × 4,5 m, 28 cm de altura), um biscoito retangular com glacê.")
def _(it):
    pc = importa("Floor_001")
    prepara(pc, HOUSE)
    it.add(pc["corpo"])


@peca("portal_natal_porta_biscoito_pacote", "Portal de glacê com porta de madeira", "portal_porta_biscoito",
      "Doorway_001", ["construcao", "porta", "casa de biscoito"],
      construcao=T_CONS + " Portal com a porta (abre para fora, dobradiça à esquerda); vai no vão de porta das paredes "
                          "de empena.")
def _(it):
    pc = importa("Doorway_001")
    prepara(pc, HOUSE)
    c = pc.pop("corpo")
    it.add(c)
    porta = pc.pop("Door_001")
    lo, hi = mb.bbox(porta)
    face = min(v.co.y for v in porta.data.vertices if abs(v.co.x - lo.x) < 0.05)
    it.porta([porta], dobradica=(lo.x, face, lo.z), lado="esq", nome="porta", abre_graus=100)
    _cons_malha(it, c)


JANELAS = [("Window_001", "janela_natal_arco_glace_pacote", "Janela em arco com moldura de glacê"),
           ("Window_002", "janela_natal_redonda_glace_pacote", "Janela redonda (óculo) com moldura de glacê"),
           ("Window_003", "janela_natal_quadrada_pacote", "Janela quadrada com moldura de glacê")]
for _n, _i, _r in JANELAS:
    def _jan(it, n=_n):
        pc = importa(n)
        prepara(pc, HOUSE, fix="centro")
        it.add(pc["corpo"])
    peca(_i, _r, _i.replace("_pacote", ""), _n, ["construcao", "janela", "casa de biscoito"], fix="parede",
         alt=None, mini=MINI_PAREDE,
         construcao=T_CONS + " Janela para os vãos das paredes de biscoito: a origem fica no meio da espessura "
                             "(y = 0 no meio), não no fundo.")(_jan)


# =====================================================================================================================
# Execução
# =====================================================================================================================
def roda():
    cat = mb.Catalogo(CAT, SAIDA, rotulo="Natal")
    feitos = 0
    for d in P:
        if IDS_PEDIDOS and d["id"] not in IDS_PEDIDOS:
            continue
        mb.limpa()
        it = ItemN(d["id"])
        extra = d["fn"](it) or {}
        if not isinstance(extra, dict):
            extra = {}
        if it.animados and "animacoes" not in extra:
            extra["animacoes"] = it.lista_animacoes()
        extra["pacote_fbx"] = d["fbx"]
        if d["construcao"]:
            extra["construcao"] = True
            extra["nota"] = d["construcao"]
        kw = dict(rotulo=d["rotulo"], grupo=d["grupo"], fixacao=d["fix"], pacote=True, tags=d["tags"], extra=extra)
        if d["alt"] is not None:
            kw["altura_instalacao"] = d["alt"]
        if d["mini"]:
            kw["miniatura_dir"] = d["mini"]
        e = cat.exporta(it, **kw)
        if getattr(it, "sem_caixas", False):
            e["colisao"] = []
            cat.salva()
        feitos += 1
    ids = {d["id"] for d in P}
    cat.dados["itens"] = [x for x in cat.dados["itens"] if x["id"] in ids]  # tira ids antigos que mudaram de nome
    cat.dados["itens"].sort(key=lambda x: [d["id"] for d in P].index(x["id"]))
    cat.salva()
    print("ok natal", feitos, "de", len(P), flush=True)


if __name__ == "__main__":
    if MODO_SONDA:
        sonda(ARGS[2:] or sorted(f[:-4] for f in os.listdir(FBX_DIR) if f.endswith(".fbx")))
    else:
        assert len({d["id"] for d in P}) == len(P), "ids repetidos"
        assert len({d["fbx"] for d in P}) == len(P), "fbx repetido"
        roda()
