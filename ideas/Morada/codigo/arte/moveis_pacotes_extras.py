"""Móveis do Morada: peças de quatro pacotes grátis (uso interno, não distribuir) que ainda não tinham entrado.

- Chess Pack (xadrez, damas, relógio, caixas e os props de escritório/leitura);
- Casino (caça-níqueis, caixas eletrônicos, cofre, dinheiro, ouro, cartas, móveis, colunas, divisórias, neon, telas);
- Claw Machine (a máquina de pelúcia nas quatro cores dos ColorSet_*, a garra e as pelúcias);
- Apocalypse, só os objetos de casa (primeiros socorros, lanterna, galão, fogareiro, rádio, mapa), e do pacote Weapons
  só o taco de beisebol e o taco de hóquei, como material esportivo. Nenhuma arma entra.

Categoria nova: jogos. O resto vai para as categorias que já existem (o catálogo de cada uma ganha as peças novas e
guarda as antigas: o gravador relê o arquivo antes de cada gravação e só troca as peças deste gerador).

Uso (de SP):
  MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/moveis_pacotes_extras.py -- SP/moveis_out [pecas] [id ...]
  MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/moveis_pacotes_extras.py -- SP/moveis_out vitrines [nome ...]
"""
import colorsys
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import bmesh  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import moveis_base as mb  # noqa: E402

V = Vector
ARGS = sys.argv[sys.argv.index("--") + 1:]
SAIDA = os.path.abspath(ARGS[0])
MODO = ARGS[1] if len(ARGS) > 1 and ARGS[1] in ("pecas", "vitrines") else "pecas"
RESTO = ARGS[2:] if len(ARGS) > 1 and ARGS[1] in ("pecas", "vitrines") else ARGS[1:]
PEDIDOS = set(",".join(RESTO).split(",")) - {""}

SP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ID = os.path.join(SP, "ideias")
PACOTES = {
    "chess": (os.path.join(ID, "Chess_Pack/Chess_Pack_Free_fbx/Chess_Pack_Free_fbx/Props"),
              [os.path.join(ID, "Chess_Pack/textures/textures")], {}, "Chess Pack"),
    "casino": (os.path.join(ID, "Casino/Casino_Free_fbx/Casino_Free_fbx/Casino_Free_Assets_fbx"),
               [os.path.join(ID, "Casino/textures/textures")], {}, "Casino"),
    "claw": (os.path.join(ID, "Claw_Machine/Claw_Machine_Free_fbx/Claw_Machine_Free_fbx"),
             [os.path.join(ID, "Claw_Machine/textures/textures")], {}, "Claw Machine"),
    # o FBX do Apocalypse não guarda o nome das texturas: o material "Color" usa o atlas Color2 e o "Map" usa Map.png
    "apoc": (os.path.join(ID, "Apocalypse/Apocalypse_Free_fbx/Apocalypse_Free_fbx/Props"),
             [os.path.join(ID, "Apocalypse/textures/textures")], {"color": "Color2.png", "map": "Map.png"},
             "Apocalypse"),
    "weapons": (os.path.join(ID, "Weapons/Weapons_Free_fbx/Separate_assets_fbx"),
                [os.path.join(ID, "Weapons/textures")], {}, "Weapons"),
}
# armas: nunca entram, mesmo se alguém pedir pelo nome
PROIBIDOS = {"Katana", "Pistol1_Base"}

ROTULOS = {"jogos": "Jogos e brinquedos"}
EST_DIR = os.path.join(SAIDA, "jogos", "_estampas")
LUZ_COR = "#FFE3A0"
LUZES = ("luz", "luz_vermelha", "luz_azul", "neon", "neon_rosa", "neon_roxo")

# texturas desenhadas do pacote que viram estampa (UV preservado); as de "tela" brilham
ESTAMPAS = {"book_cover": 512, "clock": 512, "chess_texture": 512, "note_texture": 256, "cards": 512, "cash": 512,
            "screens_1": 512, "screens_2": 512, "slots": 512, "map": 512, "cat": 512, "paw": 256, "prize": 256,
            "carpet_4": 512}
TELAS = {"screens_1": 1.4, "screens_2": 1.2, "slots": 0.9}


# =====================================================================================================================
# Catálogo que não apaga o que já existe
# =====================================================================================================================
class Catalogo(mb.Catalogo):
    """Igual ao da base, mas guarda o rótulo da categoria e, a cada gravação, relê o arquivo e só troca as peças deste
    gerador (as peças antigas e as que outro gerador gravar no meio do caminho continuam lá)."""

    def __init__(self, categoria, saida):
        rot = ROTULOS.get(categoria, categoria)
        arq = os.path.join(saida, categoria, "catalogo.json")
        if os.path.exists(arq):
            rot = json.load(open(arq)).get("rotulo", rot)
        super().__init__(categoria, saida, rotulo=rot)
        self.meus = set()

    def exporta(self, item, *a, **k):
        self.meus.add(item.id)
        return super().exporta(item, *a, **k)

    def salva(self):
        atual = {"categoria": self.cat, "rotulo": self.dados["rotulo"], "itens": []}
        if os.path.exists(self.arq):
            atual = json.load(open(self.arq))
        meus = {i["id"]: i for i in self.dados["itens"] if i["id"] in self.meus}
        itens = [meus.pop(i["id"]) if i["id"] in meus else i for i in atual["itens"]] + list(meus.values())
        atual["itens"] = itens
        tmp = self.arq + ".tmp_extras"
        json.dump(atual, open(tmp, "w"), ensure_ascii=False, indent=1)
        os.replace(tmp, self.arq)
        self.dados = atual


CATS = {}


def cat(nome):
    if nome not in CATS:
        CATS[nome] = Catalogo(nome, SAIDA)
    return CATS[nome]


# =====================================================================================================================
# Importador dos pacotes (texturas próprias de cada pacote)
# =====================================================================================================================
_TEX = {}


def _acha_tex(nome, dirs):
    for d in dirs:
        c = os.path.join(d, nome)
        if os.path.exists(c):
            return c
    return None


def _pixels(caminho, maxres=512):
    """Textura reduzida para amostrar cor: (array H×W×4 em sRGB, W, H)."""
    if caminho in _TEX:
        return _TEX[caminho]
    img = bpy.data.images.load(caminho, check_existing=False)
    W, H = img.size
    if max(W, H) > maxres:
        k = maxres / max(W, H)
        img.scale(max(1, int(W * k)), max(1, int(H * k)))
        W, H = img.size
    a = np.empty(W * H * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    bpy.data.images.remove(img)
    _TEX[caminho] = (a.reshape(H, W, 4), W, H)
    return _TEX[caminho]


def _amostra(tex, u, v):
    a, W, H = tex
    xi = min(W - 1, max(0, int(u % 1.0 * W)))
    yi = min(H - 1, max(0, int(v % 1.0 * H)))
    return tuple(float(c) for c in a[yi, xi, :3])


def _png_estampa(caminho, maxres):
    os.makedirs(EST_DIR, exist_ok=True)
    base = os.path.splitext(os.path.basename(caminho))[0].lower()
    dst = os.path.join(EST_DIR, f"pex_{base}.png")
    if not os.path.exists(dst):
        img = bpy.data.images.load(caminho, check_existing=False)
        W, H = img.size
        if max(W, H) > maxres:
            k = maxres / max(W, H)
            img.scale(max(1, int(W * k)), max(1, int(H * k)))
        img.filepath_raw = dst
        img.file_format = "PNG"
        img.save()
        bpy.data.images.remove(img)
    return dst


def mat_luz(rgb):
    """Cor de uma face que brilha no pacote → material aceso (luz quente, vermelha, azul ou neon)."""
    h, s, v = colorsys.rgb_to_hsv(*rgb)
    h *= 360
    if s < 0.28 or v < 0.15:
        return "luz"
    if h < 12 or h >= 345:
        return "luz_vermelha"
    if h < 75:
        return "luz"
    if h < 195:
        return "neon"
    if h < 250:
        return "luz_azul"
    if h < 290:
        return "neon_roxo"
    return "neon_rosa"


def _tex_do_material(m):
    """(arquivo da textura de cor, cor base sRGB) de um material importado do FBX."""
    if not m or not m.use_nodes:
        return None, None
    nos = m.node_tree.nodes
    bsdf = next((n for n in nos if n.type == "BSDF_PRINCIPLED"), None)
    cor = None
    img = None
    if bsdf:
        bc = bsdf.inputs["Base Color"]
        cor = tuple(max(0.0, c) ** (1 / 2.2) for c in bc.default_value[:3])
        if bc.is_linked:
            n = bc.links[0].from_node
            while n and n.type != "TEX_IMAGE" and n.inputs and any(i.is_linked for i in n.inputs):
                n = next(i for i in n.inputs if i.is_linked).links[0].from_node
            if n and n.type == "TEX_IMAGE" and n.image:
                img = n.image
    if img is None:
        imgs = [n.image for n in nos if n.type == "TEX_IMAGE" and n.image and "normal" not in n.image.name.lower()
                and "rough" not in n.image.name.lower()]
        img = imgs[0] if imgs else None
    arq = os.path.basename(img.filepath or img.name) if img else None
    if arq and "normal" in arq.lower():
        arq = None
    return arq, cor


def importa(pacote, nome, troca=None, orcamento=None, cor_fixa=None):
    """Importa <nome>.fbx do pacote (metros, Z para cima, frente em −Y) e troca as cores pela paleta.
    troca: {textura_original: textura_nova} (as cores da máquina de pelúcia); cor_fixa: {material: cor da paleta}.
    orcamento: triângulos; acima de 1,25× o orçamento a malha é simplificada (decimate) até ele.
    Devolve {parte: objeto}, com a parte principal em "corpo"."""
    assert nome not in PROIBIDOS, nome
    pasta, dirs, por_nome, _ = PACOTES[pacote]
    troca = troca or {}
    cor_fixa = {k.lower(): v for k, v in (cor_fixa or {}).items()}
    antes_o = set(bpy.data.objects)
    antes_m = set(bpy.data.materials)
    antes_i = set(bpy.data.images)
    bpy.ops.import_scene.fbx(filepath=os.path.join(pasta, nome + ".fbx"))
    novos = [o for o in bpy.data.objects if o not in antes_o]
    malhas = [o for o in novos if o.type == "MESH"]
    total = sum(len(p.vertices) - 2 for o in malhas for p in o.data.polygons)
    razao = orcamento / total if orcamento and total > orcamento * 1.25 else None
    mb.materiais()
    out = {}
    for o in malhas:
        if razao and len(o.data.polygons) > 120:
            md = o.modifiers.new("dec", "DECIMATE")
            md.ratio = max(0.05, razao)
            dg = bpy.context.evaluated_depsgraph_get()
            me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
        else:
            me = o.data.copy()
        me.transform(o.matrix_world)
        if o.matrix_world.determinant() < 0:
            me.flip_normals()
        # regra de cada material
        regras = []
        for m in o.data.materials:
            mn = (m.name.split(".")[0] if m else "").lower()
            arq, cor_base = _tex_do_material(m)
            if mn in por_nome:
                arq = por_nome[mn]
            arq = troca.get(arq, arq)
            cam = _acha_tex(arq, dirs) if arq else None
            base = os.path.splitext(arq)[0].lower() if arq else ""
            if "glass" in mn:
                regras.append(("vidro", None))
            elif mn in cor_fixa:
                regras.append(("cor", cor_fixa[mn]))
            elif base in ESTAMPAS and cam:
                png = _png_estampa(cam, ESTAMPAS[base])
                em = TELAS.get(base, 0.0)
                idx = mb.material_estampa("pex_" + base + ("_luz" if em else ""), png, emissao=em)
                regras.append(("estampa", idx))
            elif "emission" in mn:
                regras.append(("luz", _pixels(cam) if cam else cor_base))
            elif cam and "wood" in base:
                a, W, H = _pixels(cam, 64)
                regras.append(("cor", mb.cor_mais_proxima(tuple(float(c) for c in a[..., :3].mean(axis=(0, 1))))))
            elif cam:
                em_arq = os.path.splitext(arq)[0] + "_Emission.png"
                em_cam = _acha_tex(em_arq, dirs)
                regras.append(("paleta", (_pixels(cam), _pixels(em_cam) if em_cam else None)))
            else:
                regras.append(("cor", mb.cor_mais_proxima(cor_base) if cor_base else "cinza"))
        if not regras:
            regras = [("cor", "cinza")]
        bm = bmesh.new()
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
        uvl = bm.loops.layers.uv.active
        cache = {}

        def palette(rgb):
            k = tuple(round(c, 3) for c in rgb)
            if k not in cache:
                cache[k] = mb.cor_mais_proxima(k)
            return cache[k]

        for f in bm.faces:
            tipo, dado = regras[min(f.material_index, len(regras) - 1)]
            if uvl:
                us = [lo[uvl].uv for lo in f.loops]
                u = sum(q[0] for q in us) / len(us)
                v = sum(q[1] for q in us) / len(us)
            else:
                u = v = 0.5
            cor = None
            if tipo == "vidro":
                f.material_index = mb.MAT_NOMES.index("vidro")
                cor = "branco"
            elif tipo == "estampa":
                f.material_index = dado
                continue  # UV do pacote fica
            elif tipo == "luz":
                rgb = _amostra(dado, u, v) if isinstance(dado, tuple) and len(dado) == 3 and \
                    isinstance(dado[0], np.ndarray) else (dado or (1, 0.9, 0.7))
                f.material_index = mb.MAT_NOMES.index(mat_luz(rgb))
                cor = "branco"
            elif tipo == "cor":
                f.material_index = 0
                cor = dado
            else:
                tex, emis = dado
                rgb = _amostra(tex, u, v)
                if emis is not None and max(_amostra(emis, u, v)) > 0.35:
                    f.material_index = mb.MAT_NOMES.index(mat_luz(_amostra(emis, u, v)))
                    cor = "branco"
                else:
                    f.material_index = 0
                    cor = palette(rgb)
            if uvl:
                uu = mb.uv_cor(cor)
                for lo in f.loops:
                    lo[uvl].uv = uu
        nm = "corpo" if o.name.split(".")[0] == nome and "corpo" not in out else o.name
        mesh = bpy.data.meshes.new(nm)
        for n in mb.MAT_NOMES:  # os materiais antes do to_mesh: senão os índices voltam para 0
            mesh.materials.append(bpy.data.materials[n])
        bm.to_mesh(mesh)
        bm.free()
        if not mesh.uv_layers:
            mesh.uv_layers.new(name="UVMap")
        ativo = mesh.uv_layers.active
        for ly in [ly for ly in mesh.uv_layers if ly != ativo]:
            mesh.uv_layers.remove(ly)
        mesh.uv_layers[0].name = "UVMap"
        mesh.shade_smooth()
        mesh.set_sharp_from_angle(angle=math.radians(40))
        ob = bpy.data.objects.new(nm, mesh)
        bpy.context.scene.collection.objects.link(ob)
        out[nm] = ob
    for o in novos:
        d = o.data if o.type == "MESH" else None
        bpy.data.objects.remove(o)
        if d is not None and d.users == 0:
            bpy.data.meshes.remove(d)
    for m in [m for m in bpy.data.materials if m not in antes_m and m.name not in mb.MAT_NOMES]:
        bpy.data.materials.remove(m)
    usadas = {n.image.name for mn in mb.MAT_NOMES if mn.startswith("estampa_")
              for n in bpy.data.materials[mn].node_tree.nodes if n.type == "TEX_IMAGE" and n.image}
    for i in [i for i in bpy.data.images if i not in antes_i and i.name != "paleta_moveis" and i.name not in usadas]:
        bpy.data.images.remove(i)
    if "corpo" not in out and out:
        maior = max(out, key=lambda k: len(out[k].data.vertices))
        out["corpo"] = out.pop(maior)
    return out


# =====================================================================================================================
# Geometria
# =====================================================================================================================
def aplica(objs, M):
    for o in objs:
        o.data.transform(M)


def prepara(pc, esc=1.0, rot=None, modo="chao"):
    """Escala/gira todas as partes e leva para a origem da fixação. Devolve a matriz aplicada (origem do pacote →
    peça final), para levar pivôs e slots junto."""
    objs = list(pc.values())
    s = esc if isinstance(esc, (tuple, list)) else (esc, esc, esc)
    M = Matrix.Diagonal((*s, 1))
    for eixo, g in (rot if isinstance(rot, list) else ([rot] if rot else [])):
        M = Matrix.Rotation(math.radians(g), 4, eixo) @ M
    aplica(objs, M)
    lo, hi = mb.bbox(objs)
    if modo == "parede":
        d = V((-(lo.x + hi.x) / 2, -hi.y, -lo.z))
    elif modo == "teto":
        d = V((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -hi.z))
    else:
        d = V((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z))
    T = Matrix.Translation(d)
    aplica(objs, T)
    return T @ M


def P(M, p):
    return tuple(M @ V(p))


def escala_de(M):
    return M.to_scale()


def ilhas(ob):
    """Ilhas (faces ligadas) de um objeto: lista de (índices de faces, lo, hi)."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.faces.ensure_lookup_table()
    visto = set()
    out = []
    for f in bm.faces:
        if f.index in visto:
            continue
        pilha, comp = [f], []
        visto.add(f.index)
        while pilha:
            g = pilha.pop()
            comp.append(g.index)
            for e in g.edges:
                for h in e.link_faces:
                    if h.index not in visto:
                        visto.add(h.index)
                        pilha.append(h)
        vs = {v.co.copy().freeze() for i in comp for v in bm.faces[i].verts}
        lo = V([min(v[k] for v in vs) for k in range(3)])
        hi = V([max(v[k] for v in vs) for k in range(3)])
        out.append((comp, lo, hi))
    bm.free()
    return out


def separa(ob, teste, nome):
    """Tira de ob as ilhas com teste(lo, hi) verdadeiro e devolve um objeto novo com elas."""
    sel = set()
    for comp, lo, hi in ilhas(ob):
        if teste(lo, hi):
            sel.update(comp)
    novo = ob.copy()
    novo.data = ob.data.copy()
    novo.name = nome
    bpy.context.scene.collection.objects.link(novo)
    for alvo, apaga in ((ob, sel), (novo, None)):
        bm = bmesh.new()
        bm.from_mesh(alvo.data)
        bm.faces.ensure_lookup_table()
        fs = [f for f in bm.faces if (f.index in sel) == (apaga is not None)]
        bmesh.ops.delete(bm, geom=fs, context="FACES")
        bm.to_mesh(alvo.data)
        bm.free()
    return novo


def cor_dominante(ob):
    uv = ob.data.uv_layers["UVMap"].data
    cont = {}
    for p in ob.data.polygons:
        if mb.MAT_NOMES[p.material_index] != "atlas":
            continue
        u = uv[p.loop_indices[0]].uv
        i = int(u[0] * 16) + 16 * int((1 - u[1]) * 16)
        if 0 <= i < len(mb.NOMES):
            cont[mb.NOMES[i]] = cont.get(mb.NOMES[i], 0) + p.area
    return max(cont, key=cont.get) if cont else "branco"


def pontos(objs):
    bpy.context.view_layer.update()
    return [o.matrix_world @ v.co for o in objs if o.type == "MESH" for v in o.data.vertices]


def _caixa_pts(ps, z0=None, z1=None):
    lo = V([min(p[k] for p in ps) for k in range(3)])
    hi = V([max(p[k] for p in ps) for k in range(3)])
    z0 = lo.z if z0 is None else z0
    z1 = hi.z if z1 is None else z1
    return (((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, z0), (hi.x - lo.x, hi.y - lo.y, max(0.01, z1 - z0)))


def _agrupa(ps, cel=0.05):
    cel_de = {}
    for p in ps:
        cel_de.setdefault((int(math.floor(p.x / cel)), int(math.floor(p.y / cel))), []).append(p)
    visto, comps = set(), []
    for c in cel_de:
        if c in visto:
            continue
        pilha, comp = [c], []
        visto.add(c)
        while pilha:
            a = pilha.pop()
            comp += cel_de[a]
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    b = (a[0] + dx, a[1] + dy)
                    if b in cel_de and b not in visto:
                        visto.add(b)
                        pilha.append(b)
        comps.append(comp)
    return comps


def col_mesa(objs, zt):
    """Tampo + pés (ou pedestal), achados pelos pontos que tocam o chão."""
    ps = pontos(objs)
    zmax = max(p.z for p in ps)
    cx = [_caixa_pts([p for p in ps if p.z > zt - 0.07], zt - 0.06, zmax)]
    pes = _agrupa([p for p in ps if p.z < 0.06])
    if len(pes) > 4:
        pes = [[p for c in pes for p in c]]
    for c in pes:
        (x, y, _), (l, p_, _) = _caixa_pts(c)
        cx.append(((x, y, 0.0), (max(l, 0.04), max(p_, 0.04), zt - 0.06)))
    return cx


def col_assento(objs, zs):
    """Base até o assento + encosto + braços (pontos acima do assento, atrás e dos lados)."""
    ps = pontos(objs)
    lo = V([min(p[k] for p in ps) for k in range(3)])
    hi = V([max(p[k] for p in ps) for k in range(3)])
    cx = [_caixa_pts(ps, 0.0, zs)]
    alto = [p for p in ps if p.z > zs + 0.08]
    yb = hi.y - 0.32 * (hi.y - lo.y)
    enc = [p for p in alto if p.y > yb]
    if enc:
        cx.append(_caixa_pts(enc, zs, None))
    frente = [p for p in alto if p.y <= yb]
    cxm = (lo.x + hi.x) / 2
    for lado in ([p for p in frente if p.x < cxm - 0.1], [p for p in frente if p.x > cxm + 0.1]):
        if len(lado) > 3:
            cx.append(_caixa_pts(lado, zs, None))
    return cx


def col_estante(objs, base=0.07, t=0.035):
    ps = pontos(objs)
    lo = V([min(p[k] for p in ps) for k in range(3)])
    hi = V([max(p[k] for p in ps) for k in range(3)])
    L, Pp, H = hi.x - lo.x, hi.y - lo.y, hi.z - lo.z
    cx_, cy = (lo.x + hi.x) / 2, (lo.y + hi.y) / 2
    return [((lo.x + t / 2, cy, 0.0), (t, Pp, H)), ((hi.x - t / 2, cy, 0.0), (t, Pp, H)),
            ((cx_, cy, hi.z - t), (L, Pp, t)), ((cx_, cy, 0.0), (L, Pp, base)),
            ((cx_, hi.y - t / 2, 0.0), (L, t, H))]


def luz_extra(objs, cor=LUZ_COR, alcance=3.5):
    """Posição da luz: o meio das faces acesas."""
    soma, n = V((0, 0, 0)), 0
    bpy.context.view_layer.update()
    for o in objs:
        for p in o.data.polygons:
            if mb.MAT_NOMES[p.material_index] in LUZES:
                soma += o.matrix_world @ p.center
                n += 1
    if not n:
        return {}
    return {"luz": {"posicao": mb._gl(soma / n), "cor": cor, "alcance": alcance}}


# =====================================================================================================================
# Montagem de uma peça
# =====================================================================================================================
FEITOS = []


def peca(categoria, id_, rotulo, grupo, pacote, nome, fix="apoio", esc=1.0, rot=None, tags=(), orc=None,
         troca=None, cor_fixa=None, antes=None, inter=None, slots=(), col=None, alt=None, luz=None, depois=None,
         mini=(0.55, -1.0, 0.5)):
    """Uma peça do pacote. antes(pc): mexe nas partes antes de escalar (encurtar fio, separar ilha). inter(it, pc, M):
    interativos. slots: [(nome, centro_base no pacote, tamanho no pacote)]. col: função(objs) → caixas, ou lista.
    depois(it, pc, M): acrescenta peças nossas (gavetas, alavanca) já na posição final."""
    FEITOS.append(id_)
    if PEDIDOS and id_ not in PEDIDOS:
        return
    mb.limpa()
    pc = importa(pacote, nome, troca=troca, orcamento=orc, cor_fixa=cor_fixa)
    if antes:
        antes(pc)
    M = prepara(pc, esc, rot, "parede" if fix == "parede" else ("teto" if fix == "teto" else "chao"))
    s = escala_de(M)
    it = mb.Item(id_)
    if inter:
        inter(it, pc, M)
    extras_objs = []
    if depois:
        extras_objs = depois(it, pc, M) or []
    it.add(list(pc.values()) + list(extras_objs))
    for nome_s, c, t in slots:
        it.slot(nome_s, P(M, c), (t[0] * abs(s.x), t[1] * abs(s.y), t[2] * abs(s.z)))
    todos = list(it.partes) + [o for o, _ in it.interativos]
    if callable(col):
        it.colisao(col(todos))
    elif col:
        it.colisao(col)
    extra = {"pacote_origem": PACOTES[pacote][3]}
    if luz:
        extra.update(luz_extra(todos, **(luz if isinstance(luz, dict) else {})))
    cat(categoria).exporta(it, rotulo, grupo=grupo, fixacao=fix, altura_instalacao=alt, pacote=True,
                           tags=list(tags) + ["pacote"], miniatura_dir=mini, extra=extra)


def porta_de(it, pc, nomes, dobradica, **k):
    objs = [pc.pop(n) for n in nomes]
    return it.porta(objs, dobradica, **k)


def correr_de(it, pc, nomes, direcao, curso, nome=None):
    objs = [pc.pop(n) for n in nomes]
    return it.correr(objs, direcao=direcao, curso=curso, nome=nome)


# =====================================================================================================================
# Peças
# =====================================================================================================================
def jogos():
    J = "jogos"
    # ---- xadrez
    nomes = {"King": ("rei", "Rei"), "Queen": ("rainha", "Rainha"), "Bishop": ("bispo", "Bispo"),
             "Hoss": ("cavalo", "Cavalo"), "Rook": ("torre", "Torre"), "Pawn": ("peao", "Peão")}
    for en, (pt, rot_pt) in nomes.items():
        for cor_en, cor_pt, cor_rot in (("White", "branco", "branco"), ("Black", "preto", "preto")):
            fixa = {"Color_Smooth": "grafite_escuro", "Color": "preto"} if cor_en == "Black" else None
            peca(J, f"xadrez_{pt}_{cor_pt}_pacote", f"{rot_pt} de xadrez ({cor_rot})", f"xadrez_{pt}_pacote", "chess",
                 f"Chess_{cor_en}_{en}_01", orc=1400, cor_fixa=fixa, tags=["xadrez", "tabuleiro", "peca"])
    for cor_en, cor_pt in (("White", "branca"), ("Black", "preta")):
        peca(J, f"damas_peca_{cor_pt}_pacote", f"Peça de damas ({cor_pt})", "damas_peca_pacote", "chess",
             f"Checker_Piece_{cor_en}_01", orc=900, tags=["damas", "tabuleiro", "peca"])

    def tampa_caixa(nome_tampa, y_fundo, z_topo):
        def f(it, pc, M):
            porta_de(it, pc, [nome_tampa], P(M, (0, y_fundo, z_topo)), eixo="x", lado="cima", nome="tampa")
        return f

    peca(J, "damas_caixa_pacote", "Caixa das peças de damas", "damas_caixa_pacote", "chess", "Checker_Box_01",
         inter=tampa_caixa("Checker_Box_Cup_01", 0.046, 0.063), slots=[("caixa", (0, 0, 0.006), (0.14, 0.07, 0.04))],
         tags=["damas", "caixa", "tampa"])
    peca(J, "xadrez_caixa_pecas_pacote", "Caixa de madeira das peças de xadrez", "xadrez_caixa_pecas_pacote", "chess",
         "Chess_Piece_Box_01", inter=tampa_caixa("Chess_Piece_Box_Cap_01", 0.138, 0.154),
         slots=[("caixa", (0, 0, 0.02), (0.44, 0.24, 0.11))], tags=["xadrez", "caixa", "tampa"])

    def tabuleiro(it, pc, M):
        # a metade de trás dobra por cima da da frente (o tabuleiro fecha como uma maleta)
        porta_de(it, pc, ["corpo"], P(M, (0, 0, 0.044)), eixo="x", angulo=180, nome="metade_dobravel")
        pc["corpo"] = pc.pop("Chesspad_02")

    peca(J, "xadrez_tabuleiro_dobravel_pacote", "Tabuleiro de xadrez dobrável", "xadrez_tabuleiro_pacote", "chess",
         "Chesspad_01", inter=tabuleiro, slots=[("tabuleiro", (0, 0, 0.044), (0.44, 0.44, 0.12))],
         tags=["xadrez", "damas", "tabuleiro"])

    def relogio(it, pc, M):
        for i, n in enumerate(("Circle.004", "Chess_Clock_Button_02"), 1):
            correr_de(it, pc, [n], (0, 0, -1), 0.006, nome=f"botao_{i}")

    peca(J, "xadrez_relogio_pacote", "Relógio de xadrez", "xadrez_relogio_pacote", "chess", "Chess_Clock_01",
         inter=relogio, tags=["xadrez", "relogio"])
    # ---- cartas (no tamanho de um baralho de verdade, 6,3 × 8,8 cm)
    for n, (naipe, rot_n) in {"Card_39": ("espadas", "espadas"), "Card_44": ("paus", "paus"),
                              "Card_48": ("copas", "copas"), "Card_53": ("ouros", "ouros")}.items():
        peca(J, f"baralho_as_{naipe}_pacote", f"Carta de baralho: ás de {rot_n}", "baralho_as_pacote", "casino", n,
             esc=0.735, tags=["cartas", "baralho", "cassino"])

    # ---- caça-níqueis (escala de casa: 0,72 → 1,9 a 2,2 m), com alavanca nossa do lado direito
    def alavanca(it, pc, M):
        lo, hi = mb.bbox(list(pc.values()))
        x = hi.x + 0.005
        zp, yp = 0.82, -0.10
        cubo = mb.cilindro(0.045, 0.05, x=x + 0.025, y=yp, z=zp, cor="cromo", eixo="x", seg=20, bisel=0.008)
        haste = mb.cilindro(0.011, 0.36, x=x + 0.06, y=yp, z=zp, cor="cromo", seg=12, bisel=0.003)
        bola = mb.esfera(0.042, x=x + 0.06, y=yp, z=zp + 0.38, cor="vermelho", seg=20)
        anel = mb.cilindro(0.016, 0.03, x=x + 0.06, y=yp, z=zp + 0.33, cor="cromo", seg=12, bisel=0.004)
        base = mb.caixa(0.03, 0.14, 0.2, x=x + 0.012, y=yp, z=zp - 0.1, cor="cromo", bisel=0.01)
        it.porta([haste, bola, anel], (x + 0.06, yp, zp), eixo="x", angulo=55, nome="alavanca")
        return [cubo, base]

    def tambores(pc):  # os tambores são peças à parte no pacote: entram no corpo
        return pc

    for n, sid, rot_s in (("Slot_Machine_01", "frutas", "das frutas"), ("Slot_Machine_02", "jackpot", "do jackpot"),
                          ("Slot_Machine_Aquarium_01", "aquario", "do aquário")):
        peca(J, f"caca_niquel_{sid}_pacote", f"Caça-níquel {rot_s}", f"caca_niquel_{sid}_pacote", "casino", n,
             fix="chao", esc=0.72, depois=alavanca, tags=["cassino", "caca_niquel", "tela", "neon", "alavanca"])

    # ---- máquina de pelúcia (as quatro cores dos ColorSet_*) e a garra
    def maquina(it, pc, M):
        garra = ["Claw_Mechanism_02", "Claw_Piston_01", "Claw_Piston_02", "Claw_01", "Claw_01.001", "Claw_01.002"]
        s = escala_de(M).x
        correr_de(it, pc, garra, (1, 0, 0), 0.6 * s, nome="garra")
        lo, hi = mb.bbox([pc["Lever_01"]])
        porta_de(it, pc, ["Lever_01"], ((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z), eixo="x", angulo=25,
                 nome="manche")
        correr_de(it, pc, ["Button_01"], (0, 0, -1), 0.008, nome="botao")
        porta_de(it, pc, ["Cap_01"], P(M, (-0.21, -0.524, 0.682)), eixo="x", lado="cima", abre_graus=95,
                 nome="portinhola_premio")

    cores_maq = (("01", "amarela", "amarela"), ("02", "azul", "azul"), ("03", "rosa", "rosa"),
                 ("04", "turquesa", "turquesa"))
    for k, cid, crot in cores_maq:
        troca = {"Colorset_01.png": f"Colorset_{k}.png"}
        peca(J, f"maquina_pelucia_{cid}_pacote", f"Máquina de pegar pelúcia ({crot})", "maquina_pelucia_pacote",
             "claw", "Toy_Claw_01", fix="chao", esc=0.68, troca=troca, inter=maquina,
             slots=[("vitrine", (0.05, 0.01, 1.16), (0.9, 0.8, 0.45)), ("premio", (-0.21, -0.29, 0.39), (0.34, 0.46, 0.28))],
             tags=["pelucia", "garra", "fliperama", "luz", "infantil"])

    def so_garra(pc):
        for n in list(pc):
            if n not in ("Claw_Mechanism_02", "Claw_Piston_01", "Claw_Piston_02", "Claw_01", "Claw_01.001",
                         "Claw_01.002"):
                o = pc.pop(n)
                bpy.data.objects.remove(o)
        pc["corpo"] = pc.pop("Claw_Mechanism_02")

    peca(J, "maquina_pelucia_garra_pacote", "Garra da máquina de pelúcia", "maquina_pelucia_garra_pacote", "claw",
         "Toy_Claw_01", antes=so_garra, tags=["pelucia", "garra", "fliperama"])
    # ---- pelúcias
    bichos = (("Bear_01", "urso", "Urso"), ("Cat_01", "gato", "Gato"), ("Chick_01", "pintinho", "Pintinho"),
              ("Crocodile_01", "crocodilo", "Crocodilo"), ("Dog_01", "cachorro", "Cachorro"),
              ("Elephant_01", "elefante", "Elefante"), ("Fox_01", "raposa", "Raposa"), ("Koala_01", "coala", "Coala"),
              ("Lion_01", "leao", "Leão"), ("Panda_01", "panda", "Panda"), ("Penguin_01", "pinguim", "Pinguim"),
              ("Pig_01", "porco", "Porquinho"), ("Rabbit_01", "coelho", "Coelho"), ("Shark_01", "tubarao", "Tubarão"),
              ("Unicorn_01", "unicornio", "Unicórnio"))
    for n, bid, brot in bichos:
        peca(J, f"pelucia_{bid}_pacote", f"Pelúcia de {brot.lower()}" if bid != "porco" else "Pelúcia de porquinho",
             "pelucia_pacote", "claw", n, orc=1500, tags=["pelucia", "brinquedo", "infantil", "quarto"])
    # ---- material esportivo (do pacote Weapons, só os tacos), deitados
    peca(J, "taco_beisebol_pacote", "Taco de beisebol", "taco_beisebol_pacote", "weapons", "baseball_bat_001",
         rot=("Y", 90), mini=(0.3, -0.6, 1.0), tags=["esporte", "beisebol"])
    peca(J, "taco_hoquei_pacote", "Taco de hóquei", "taco_hoquei_pacote", "weapons", "hockey_stick_001",
         rot=[("X", -90), ("Z", 90)], mini=(0.3, -0.6, 1.0), tags=["esporte", "hoquei"])


def assentos():
    peca("cadeiras", "poltrona_leitura_xadrez_pacote", "Poltrona de leitura com almofada", "poltrona_leitura_pacote",
         "chess", "Chair_01", fix="chao", col=lambda o: col_assento(o, 0.43), tags=["poltrona", "estofado", "sala"])
    peca("cadeiras", "poltrona_capitone_vermelha_cassino_pacote", "Poltrona capitonê (vermelha)",
         "poltrona_capitone_pacote", "casino", "Armchair_02", fix="chao", col=lambda o: col_assento(o, 0.43),
         tags=["poltrona", "estofado", "capitone", "sala"])
    peca("cadeiras", "cadeira_alta_cassino_pacote", "Cadeira alta giratória (vermelha)", "cadeira_alta_pacote",
         "casino", "Chair_06", fix="chao", col=lambda o: col_assento(o, 0.57), tags=["cadeira", "alta", "bar"])

    def giro(it, pc, M):
        porta_de(it, pc, ["Chair_Office_Part_01"], P(M, (0, 0, 0.3)), eixo="z", angulo=90, nome="giro_assento")

    peca("cadeiras", "cadeira_escritorio_preta_cassino_pacote", "Cadeira de escritório giratória (preta)",
         "cadeira_escritorio_cassino_pacote", "casino", "Chair_Office_01", fix="chao", inter=giro,
         col=lambda o: col_assento(o, 0.45), tags=["cadeira", "escritorio", "rodinhas", "giratoria"])
    peca("sofas", "sofa_capitone_vermelho_cassino_pacote", "Sofá capitonê de dois lugares (vermelho)",
         "sofa_capitone_pacote", "casino", "Couch_05", fix="chao", col=lambda o: col_assento(o, 0.44),
         tags=["sofa", "estofado", "capitone", "sala"])


def mesas():
    zt = 0.729
    peca("mesas", "mesa_jantar_madeira_escura_xadrez_pacote", "Mesa de madeira escura", "mesa_madeira_escura_pacote",
         "chess", "Table_01", fix="chao", col=lambda o: col_mesa(o, zt),
         slots=[("tampo", (0, 0, zt), (1.66, 0.95, 0.45))], tags=["mesa", "jantar", "madeira"])
    peca("mesas", "mesa_redonda_alta_cassino_pacote", "Mesa redonda alta (branca)", "mesa_redonda_alta_pacote",
         "casino", "Table_01", fix="chao", col=lambda o: col_mesa(o, 0.852),
         slots=[("tampo", (0, 0, 0.852), (0.82, 0.82, 0.45))], tags=["mesa", "redonda", "bistro"])

    def toalha(pc):
        pt = importa("casino", "Tablecloth_01")
        pc["toalha"] = pt["corpo"]

    peca("mesas", "mesa_redonda_alta_toalha_cassino_pacote", "Mesa redonda alta com toalha vermelha",
         "mesa_redonda_alta_pacote", "casino", "Table_01", fix="chao", antes=toalha,
         col=lambda o: col_mesa(o, 0.865), slots=[("tampo", (0, 0, 0.865), (0.82, 0.82, 0.45))],
         tags=["mesa", "redonda", "toalha"])

    # escrivaninha: o gaveteiro do pacote é um bloco; vira uma carcaça com três gavetas de verdade
    def gaveteiro(pc):
        pc["gaveteiro_velho"] = separa(pc["corpo"], lambda lo, hi: lo.x > 0.6 and hi.x < 1.1 and lo.z > 0.01,
                                       "gaveteiro_velho")

    def gavetas(it, pc, M):
        velho = pc.pop("gaveteiro_velho")
        cor = cor_dominante(velho)
        lo, hi = mb.bbox([velho])
        bpy.data.objects.remove(velho)
        L, Pp = hi.x - lo.x, hi.y - lo.y
        x, y = (lo.x + hi.x) / 2, (lo.y + hi.y) / 2
        z0, z1 = lo.z, hi.z
        e = 0.02
        out = [mb.carcaca(L, Pp, z1 - z0, x=x, y=y, z=z0, esp=e, cor=cor, fundo=True)]
        h = (z1 - z0 - 2 * e) / 3
        cor_p = "cinza_medio" if cor in ("branco", "branco_gelo", "cinza_claro", "porcelana") else "branco_gelo"
        for k in range(3):
            zb = z0 + e + k * h
            fr = mb.frente(L - 2 * e - 0.004, h - 0.004, esp=0.018, estilo="lisa", cor=cor)
            mb.transforma(fr, loc=(x, lo.y + 0.018, zb + 0.002))
            pu = mb.puxador("barra", x=x, y=lo.y, z=zb + h * 0.62, cor=cor_p, vertical=False)
            it.gaveta(L - 2 * e - 0.01, Pp - 0.06, h - 0.03, [fr, pu], x=x, y_frente=lo.y + 0.018, z=zb + 0.008,
                      cor=cor, nome=f"gaveta_{k + 1}")
        return out

    zt6 = 0.797 * 0.94
    peca("mesas", "escrivaninha_gaveteiro_cassino_pacote", "Escrivaninha grande com gaveteiro",
         "escrivaninha_gaveteiro_pacote", "casino", "Table_06", fix="chao", esc=0.94, antes=gaveteiro,
         depois=gavetas, col=lambda o: col_mesa(o, zt6),
         slots=[("tampo", (-0.3, 0, 0.797), (2.0, 1.3, 0.45))], tags=["mesa", "escrivaninha", "escritorio", "gavetas"])


def lampadas():
    peca("luminarias", "luminaria_pintinho_ovo_pacote", "Luminária de pintinho no ovo", "luminaria_pintinho_pacote",
         "chess", "Night_Lamp_01", luz={"alcance": 2.5}, tags=["luminaria", "luz", "infantil", "quarto", "mesa"])
    peca("luminarias", "luminaria_arvore_bolinhas_pacote", "Luminária árvore de bolinhas coloridas",
         "luminaria_arvore_pacote", "chess", "Night_Lamp_02", orc=3500, luz={"alcance": 2.5},
         tags=["luminaria", "luz", "mesa", "quarto", "decoracao"])

    def encurta(pc):  # o fio do pendente do cassino tem 3,4 m; fica com 1,5 m
        D = 3.383 - 1.5
        for o in pc.values():
            for v in o.data.vertices:
                z = v.co.z
                if z < -2.6:
                    v.co.z += D
                elif z < -0.17:
                    v.co.z += D * (-0.17 - z) / (-0.17 + 2.6)

    peca("luminarias", "luminaria_pendente_sino_vermelho_pacote", "Pendente de sino vermelho",
         "luminaria_pendente_sino_pacote", "casino", "Lamp_05", fix="teto", esc=0.6, antes=encurta,
         luz={"alcance": 4.0}, tags=["luminaria", "luz", "teto", "pendente"])
    peca("luminarias", "letreiro_neon_cassino_pacote", "Letreiro de neon \"Casino\"", "letreiro_neon_pacote", "casino",
         "Neon_Sign_01", fix="parede", alt=1.5, luz={"cor": "#FF7ACB", "alcance": 3.0},
         tags=["luminaria", "neon", "parede", "letreiro", "cassino"])


def outros():
    s = 0.5
    peca("estantes", "estante_nichos_xadrez_pacote", "Estante baixa com quatro nichos (grafite)",
         "estante_nichos_pacote", "chess", "Shelving_01", fix="chao", col=col_estante,
         slots=[("nicho_1", (-0.225, 0.055, 0.07), (0.4, 0.46, 0.38)), ("nicho_2", (0.225, 0.055, 0.07), (0.4, 0.46, 0.38)),
                ("nicho_3", (-0.225, 0.055, 0.47), (0.4, 0.46, 0.34)), ("nicho_4", (0.225, 0.055, 0.47), (0.4, 0.46, 0.34)),
                ("tampo", (0, 0.055, 0.856), (0.98, 0.5, 0.4))], tags=["estante", "nichos", "baixa"])
    peca("tapetes", "tapete_oval_cinza_xadrez_pacote", "Tapete oval cinza", "tapete_oval_cinza_pacote", "chess",
         "Rug_01", fix="chao", tags=["tapete", "sala", "oval"])

    def carpete(pc):  # o piso do pacote é um plano solto: ganha uma base fina por baixo
        c = pc["corpo"]
        for v in c.data.vertices:
            v.co.z = 0.011
        pc["base"] = mb.caixa(6.0, 6.0, 0.01, z=0.0, cor="grafite_escuro", bisel=0.004)

    peca("tapetes", "tapete_carpete_cassino_pacote", "Carpete de ondas escuras (3 × 3 m)", "tapete_carpete_pacote",
         "casino", "Floor_01", fix="chao", esc=s, antes=carpete, tags=["tapete", "carpete", "cassino"])
    peca("plantas", "planta_costela_adao_vaso_pe_pacote", "Costela-de-adão no vaso com pés",
         "planta_costela_adao_pacote", "chess", "Plant_001", fix="chao", orc=6000, tags=["planta", "grande", "vaso"])
    peca("plantas", "planta_palmeira_vaso_cassino_pacote", "Palmeira no vaso de barro", "planta_palmeira_pacote",
         "casino", "Flower_03", fix="chao", tags=["planta", "grande", "vaso"])
    # livros
    peca("livros", "livro_xadrez_pacote", "Livro de xadrez deitado", "livro_xadrez_pacote", "chess", "Book_01",
         esc=0.75, tags=["livro", "xadrez"])
    peca("livros", "livros_em_pe_xadrez_pacote", "Livros coloridos em pé", "livros_em_pe_pacote", "chess", "Books_01",
         tags=["livros", "estante"])
    peca("livros", "livros_em_pe_2_xadrez_pacote", "Livros coloridos em pé (verdes e azuis)", "livros_em_pe_pacote",
         "chess", "Books_02", tags=["livros", "estante"])
    peca("livros", "livro_cassino_pacote", "Livro \"How to win at the casino\"", "livro_cassino_pacote", "casino",
         "Book_01", esc=0.6, rot=("Z", 0), tags=["livro", "cassino"])


def objetos():
    O = "objetos"
    # ---- do xadrez: xícaras, copos, papelaria
    peca(O, "caneca_azul_xadrez_pacote", "Caneca azul", "caneca_pacote", "chess", "Cup_01", orc=1000, rot=("Z", -90),
         tags=["caneca", "cozinha", "mesa"])
    peca(O, "caneca_amarela_xadrez_pacote", "Caneca amarela", "caneca_pacote", "chess", "Cup_02", orc=1000, rot=("Z", -90),
         tags=["caneca", "cozinha", "mesa"])
    peca(O, "copo_papel_vermelho_pacote", "Copo de papel vermelho", "copo_papel_pacote", "chess", "Paper_Glass_01",
         tags=["copo", "mesa"])
    peca(O, "copo_papel_laranja_pacote", "Copo de papel laranja", "copo_papel_pacote", "chess", "Paper_Glass_02",
         tags=["copo", "mesa"])
    peca(O, "trofeu_taca_dourada_pacote", "Troféu de taça dourada", "trofeu_taca_pacote", "chess", "Cup_01_002",
         orc=1400, cor_fixa={"Metal": "ouro"}, tags=["trofeu", "estante", "decoracao"])
    peca(O, "bloco_notas_amarelo_pacote", "Bloco de notas amarelo", "bloco_notas_pacote", "chess", "Note_Paper_01",
         tags=["papelaria", "escritorio"])

    def capa(it, pc, M):  # a capa do caderno abre pela lombada (eixo y, na borda esquerda)
        lo, hi = mb.bbox([pc["Notebook_02"]])
        porta_de(it, pc, ["Notebook_02"], (lo.x, 0, hi.z), eixo="y", angulo=-150, nome="capa")

    peca(O, "caderno_amarelo_pacote", "Caderno amarelo", "caderno_pacote", "chess", "Notebook_01", inter=capa,
         tags=["papelaria", "escritorio", "caderno"])
    peca(O, "lapis_azul_pacote", "Lápis azul", "lapis_pacote", "chess", "Pencil_01", tags=["papelaria", "escritorio"])
    peca(O, "base_escrivaninha_pacote", "Base de mesa para escrivaninha (desk mat)", "base_escrivaninha_pacote",
         "chess", "Desk_Mat_01", tags=["escritorio", "papelaria"])
    # ---- do cassino
    for n, did, rot_d in (("Cash_01", "nota", "Nota de dinheiro"), ("Cash_02", "nota_curvada", "Nota de dinheiro curvada"),
                          ("Cash_07", "maco", "Maço de dinheiro com cinta"), ("Cash_10", "pilha", "Pilha de dinheiro"),
                          ("Cash_11", "rolo", "Rolo de dinheiro")):
        peca(O, f"dinheiro_{did}_pacote", rot_d, "dinheiro_pacote", "casino", n, esc=0.63,
             tags=["dinheiro", "cassino"])
    peca(O, "maquina_contar_dinheiro_pacote", "Máquina de contar dinheiro", "maquina_contar_dinheiro_pacote",
         "casino", "Cash_Machine_01", esc=0.75, tags=["dinheiro", "escritorio", "cassino"])
    peca(O, "barra_ouro_grande_pacote", "Barra de ouro grande", "barra_ouro_pacote", "casino", "Gold_Ingot_01",
         esc=0.7, cor_fixa={"Metal": "ouro"}, tags=["ouro", "tesouro", "cassino"])
    peca(O, "barra_ouro_pequena_pacote", "Barra de ouro pequena", "barra_ouro_pacote", "casino", "Gold_Ingot_02",
         cor_fixa={"Metal": "ouro"}, tags=["ouro", "tesouro", "cassino"])

    def porta_cofre(it, pc, M):
        porta_de(it, pc, ["SafeBox_Door_01"], P(M, (-0.39, -0.345, 0.0)), eixo="z", lado="esq", nome="porta_cofre")

    peca(O, "cofre_pacote", "Cofre com segredo", "cofre_pacote", "casino", "SafeBox_01", fix="chao", inter=porta_cofre,
         slots=[("chao", (0, -0.02, 0.15), (0.7, 0.54, 0.27)), ("prateleira_1", (0, -0.02, 0.44), (0.7, 0.54, 0.32)),
                ("prateleira_2", (0, -0.02, 0.79), (0.7, 0.54, 0.3))], tags=["cofre", "porta", "dinheiro", "cassino"])
    peca(O, "caixa_eletronico_azul_pacote", "Caixa eletrônico azul", "caixa_eletronico_pacote", "casino", "ATM_01",
         fix="chao", tags=["caixa_eletronico", "dinheiro", "cassino", "tela"])
    peca(O, "caixa_eletronico_totem_pacote", "Caixa eletrônico de totem", "caixa_eletronico_pacote", "casino", "ATM_03",
         fix="chao", tags=["caixa_eletronico", "dinheiro", "cassino", "tela"])
    peca(O, "monitor_cassino_pacote", "Monitor de computador", "monitor_cassino_pacote", "casino", "Monitor_02",
         tags=["computador", "escritorio", "tela"])
    peca(O, "teclado_cassino_pacote", "Teclado de computador", "teclado_cassino_pacote", "casino", "Keyboard_01",
         esc=0.88, tags=["computador", "escritorio"])
    peca(O, "mouse_cassino_pacote", "Mouse de computador", "mouse_cassino_pacote", "casino", "Mouse_01", esc=0.7,
         tags=["computador", "escritorio"])
    peca(O, "coluna_listrada_cassino_pacote", "Coluna listrada (pé-direito de casa)", "coluna_cassino_pacote",
         "casino", "Column_17", fix="chao", esc=2.7 / 13.0, tags=["coluna", "decoracao", "cassino"])
    peca(O, "pedestal_fila_laranja_pacote", "Pedestal de fila (laranja)", "pedestal_fila_pacote", "casino", "Fence_07",
         fix="chao", tags=["divisoria", "fila", "cassino"])

    for corda, cid, crot, meia in (("Fence_08", "curta", "curta (1 m)", 0.4715), ("Fence_09", "longa", "longa (2 m)",
                                                                               0.959)):
        def com_postes(pc, corda=corda, meia=meia):
            for i, sx in enumerate((-1, 1)):
                pp = importa("casino", "Fence_07")["corpo"]
                mb.transforma(pp, loc=(sx * meia, 0, 0))
                pc[f"poste_{i}"] = pp
            return pc

        def cols(objs, meia=meia):
            ps = pontos(objs)
            return [((-meia, 0, 0), (0.43, 0.43, 1.03)), ((meia, 0, 0), (0.43, 0.43, 1.03)),
                    ((0, 0, 0.45), (2 * meia, 0.07, 0.43))]

        peca(O, f"divisoria_corda_{cid}_pacote", f"Divisória de corda {crot}", "divisoria_corda_pacote", "casino", corda,
             fix="chao", antes=com_postes, col=cols, tags=["divisoria", "fila", "cassino"])
    peca(O, "fruteira_cheia_pacote", "Fruteira cheia", "fruteira_pacote", "casino", "Fruits_01",
         tags=["frutas", "cozinha", "mesa"])
    peca(O, "telao_jackpot_pacote", "Telão de jackpot de teto", "telao_jackpot_pacote", "casino", "Screens_01",
         fix="teto", esc=0.5, tags=["tela", "neon", "teto", "cassino"])
    # ---- do Apocalypse, só objetos de casa
    peca(O, "kit_primeiros_socorros_pacote", "Kit de primeiros socorros", "kit_primeiros_socorros_pacote", "apoc",
         "First_Aid", tags=["saude", "banheiro", "emergencia"])
    peca(O, "lanterna_pacote", "Lanterna de mão", "lanterna_pacote", "apoc", "Flashlight",
         tags=["ferramenta", "emergencia"])
    peca(O, "galao_combustivel_pacote", "Galão de combustível", "galao_pacote", "apoc", "Fuel_Canister",
         tags=["garagem", "ferramenta"])
    peca(O, "fogareiro_macarico_pacote", "Fogareiro a gás (maçarico)", "fogareiro_pacote", "apoc", "Gas_Burner",
         esc=0.7, tags=["cozinha", "camping", "ferramenta"])
    peca(O, "radio_comunicador_pacote", "Rádio comunicador", "radio_comunicador_pacote", "apoc", "Walkie_talkie",
         tags=["eletronico", "emergencia"])
    peca(O, "mapa_dobrado_pacote", "Mapa aberto", "mapa_pacote", "apoc", "Map", rot=("X", -90),
         tags=["mapa", "papelaria", "escritorio"])


# =====================================================================================================================
# Vitrines
# =====================================================================================================================
def vitrines(quais):
    def ids_de(c, f=lambda i: True):
        d = json.load(open(os.path.join(SAIDA, c, "catalogo.json")))
        return [i["id"] for i in d["itens"] if i["id"] in TODOS and f(i)]

    grupos = {
        "jogos_grandes": ("jogos", lambda i: i["fixacao"] == "chao"),
        "jogos_pequenos": ("jogos", lambda i: i["fixacao"] != "chao" and "pelucia" not in i["tags"]),
        "jogos_pelucias": ("jogos", lambda i: "pelucia" in i["tags"] and i["fixacao"] != "chao"),
        "objetos_grandes": ("objetos", lambda i: i["fixacao"] in ("chao", "teto")),
        "objetos_pequenos": ("objetos", lambda i: i["fixacao"] not in ("chao", "teto")),
    }
    for c in ("cadeiras", "sofas", "mesas", "luminarias", "estantes", "tapetes", "plantas", "livros"):
        grupos[c] = (c, lambda i: True)
    for q in quais:
        abertos = q.endswith("_abertos")
        noite = q.endswith("_noite")
        base = q.replace("_abertos", "").replace("_noite", "")
        c, f = grupos[base]
        ids = ids_de(c, f)
        if abertos:
            d = json.load(open(os.path.join(SAIDA, c, "catalogo.json")))
            ids = [i["id"] for i in d["itens"] if i["id"] in ids and i["interativos"]]
        if not ids:
            continue
        arq = os.path.join(SAIDA, c, f"vitrine_extras_{base}" + ("_abertos" if abertos else "") +
                           ("_noite" if noite else "") + ".png")
        res = tuple(int(x) for x in os.environ.get("VIT_RES", "1800x1000").split("x"))
        mb.vitrine(os.path.join(SAIDA, c), arq, ids=ids, res=res, abertos=abertos, noite=noite,
                   amostras=int(os.environ.get("AMOSTRAS", 32)))


TODOS = []
if MODO == "pecas":
    jogos()
    assentos()
    mesas()
    lampadas()
    outros()
    objetos()
    print("feitos", len(FEITOS), flush=True)
else:
    PEDIDOS = {"__nenhum__"}
    jogos()
    assentos()
    mesas()
    lampadas()
    outros()
    objetos()
    TODOS = list(FEITOS)
    quais = RESTO or ["jogos_grandes", "jogos_grandes_noite", "jogos_pequenos", "jogos_pequenos_noite",
                      "jogos_pelucias", "jogos_pelucias_noite", "jogos_grandes_abertos", "jogos_pequenos_abertos",
                      "objetos_grandes", "objetos_grandes_noite", "objetos_pequenos", "objetos_pequenos_noite",
                      "objetos_grandes_abertos", "cadeiras", "sofas", "mesas", "mesas_abertos", "luminarias",
                      "luminarias_noite", "estantes", "tapetes", "plantas", "livros"]
    vitrines(quais)
