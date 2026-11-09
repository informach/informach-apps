"""Cidade do Morada: o pacote gratuito Fantasy inteiro (uso interno, não distribuir).

- As três casinhas (house_001..003) entram em "predios_magicos" como prédios de lote 1 × 1, com as janelas acendendo à
  noite (o vidro amarelo do atlas vira janela / janela_fria / janela_apagada, ~40 % apagadas, por janela).
- O resto (árvores, cogumelos, feira, carroça, guindaste, barris, caixas, sacos, jarros, pratos, toras, mesa, suporte,
  placa) vai na categoria nova "fantasia" (vila de fantasia / feira).

Uso (ver GUIA_CIDADE.md e GUIA_PREDIOS.md):
  MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/cidade_fantasia.py -- SP/cidade_out [ids|grupos|casas|fantasia]
  MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/cidade_fantasia.py -- SP/cidade_out vitrines
  MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/cidade_fantasia.py -- SP/cidade_out praca [dia|noite]
O pacote vem de FANTASIA_PACOTE_FBX (padrão: SP/ideias/Fantasy/Fantasy_Free_fbx/Separate_assets_fbx), com o atlas
Texture_1.png da mesma pasta (FANTASIA_PACOTE_TEX). O arquivo tudo-em-um Fantasy_FREE.fbx fica de fora.

Convenções: metros, Z para cima, frente para −Y, origem no centro (árvores: no tronco), base em z = 0. Todas as peças
com pacote=True e o id terminando em _pacote. O atlas do pacote tem marca-d'água: a cor de cada face é a cor que mais
aparece na célula do atlas (na metade de cima, a grade de 20 × 20 células) ou numa janelinha de 17 px (na metade de
baixo, o degradê), e não o pixel exato, que pode cair numa letra da marca.
"""
import json
import math
import os
import random
import sys
import zlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import moveis_base as mb  # noqa: E402

V = Vector
AQUI = os.path.dirname(os.path.abspath(__file__))
FBX_DIR = os.environ.get("FANTASIA_PACOTE_FBX") or os.path.normpath(
    os.path.join(AQUI, "..", "ideias", "Fantasy", "Fantasy_Free_fbx", "Separate_assets_fbx"))
TEX = os.environ.get("FANTASIA_PACOTE_TEX") or os.path.join(FBX_DIR, "Texture_1.png")
CAT = "fantasia"
CAT_CASAS = "predios_magicos"
ESTILO = "magico"


# =====================================================================================================================
# Atlas do pacote: cor robusta (sem a marca-d'água)
# =====================================================================================================================
class Atlas:
    def __init__(self, caminho):
        img = bpy.data.images.load(caminho, check_existing=True)
        self.W, self.H = img.size
        self.px = list(img.pixels[:])
        self.cache = {}

    def _pix(self, x, y_baixo):
        k = (y_baixo * self.W + x) * 4
        return self.px[k], self.px[k + 1], self.px[k + 2]

    @staticmethod
    def _base(bins):
        """A marca-d'água é um branco translúcido (com sombra fina) por cima da cor: os pixels se juntam em grupos de
        cor parecida (cor de base, base clareada, base escurecida). A base é o grupo mais escuro entre os que cobrem ao
        menos 15 % da área, depois de juntar as sombras (vizinhas da base). Devolve a média do bin mais cheio dele."""
        tot = sum(b[0] for b in bins.values())
        ks = sorted(bins, key=lambda q: -bins[q][0])
        grupos = []  # [bins]
        for q in ks:
            for gr in grupos:
                if max(abs(q[i] - gr[0][i]) for i in range(3)) <= 3:
                    gr.append(q)
                    break
            else:
                grupos.append([q])
        fortes = [gr for gr in grupos if sum(bins[q][0] for q in gr) >= 0.15 * tot] or grupos[:1]

        def lum(gr):
            n, r, g, b = bins[gr[0]]
            return (0.3 * r + 0.59 * g + 0.11 * b) / n
        gr = min(fortes, key=lum)
        n, r, g, b = bins[gr[0]]
        return (r / n, g / n, b / n)

    def cor(self, u, v):
        """Cor sRGB (0..1) dominante em volta do ponto (u, v)."""
        W, H = self.W, self.H
        x = min(W - 1, max(0, int(u % 1.0 * W)))
        yb = min(H - 1, max(0, int(v % 1.0 * H)))
        yt = H - 1 - yb
        cel = W / 20.0
        if yt < H / 2:  # grade de células chapadas
            cx, cy = int(x // cel), int(yt // cel)
            x0, x1 = int(cx * cel + 4), int((cx + 1) * cel - 4)
            t0, t1 = int(cy * cel + 4), int((cy + 1) * cel - 4)
            chave = ("c", cx, cy)
        else:  # degradê: janelinha
            x0, x1, t0, t1 = max(0, x - 8), min(W - 1, x + 8), max(H // 2, yt - 8), min(H - 1, yt + 8)
            chave = ("d", x // 4, yt // 4)
        if chave in self.cache:
            return self.cache[chave]
        bins = {}
        for t in range(t0, t1 + 1, 1):
            for xx in range(x0, x1 + 1, 1):
                p = self._pix(xx, H - 1 - t)
                q = (int(p[0] * 24), int(p[1] * 24), int(p[2] * 24))
                b = bins.setdefault(q, [0, 0.0, 0.0, 0.0])
                b[0] += 1
                b[1] += p[0]
                b[2] += p[1]
                b[3] += p[2]
        out = self._base(bins)
        self.cache[chave] = out
        return out


ATLAS = None
_NOME_COR = {}


def _srgb(nome):
    return [c ** (1 / 2.2) for c in mb._lin(mb.CORES[nome])]


def _dist(s, t):  # a mesma distância de mb.cor_mais_proxima
    return 0.3 * (s[0] - t[0]) ** 2 + 0.59 * (s[1] - t[1]) ** 2 + 0.11 * (s[2] - t[2]) ** 2 + \
        0.5 * ((s[0] - s[1]) - (t[0] - t[1])) ** 2 + 0.5 * ((s[1] - s[2]) - (t[1] - t[2])) ** 2


def nome_cor(rgb):
    """Cor da paleta mais próxima; os marrons acinzentados do pacote (barril, jarros, madeira clara) caíam em cinzas
    neutros da paleta e a peça ficava sem cor: se a cor de origem é quente e a escolhida é neutra, a escolha fica entre
    as cores quentes da paleta."""
    k = tuple(round(c, 3) for c in rgb)
    if k not in _NOME_COR:
        n = mb.cor_mais_proxima(k)
        t = _srgb(n)
        if k[0] - k[2] > 0.1 and t[0] - t[2] < 0.06:
            quentes = [m for m in mb.CORES if (lambda q: q[0] - q[2] > 0.08)(_srgb(m))]
            n = min(quentes, key=lambda m: _dist(k, _srgb(m)))
        _NOME_COR[k] = n
    return _NOME_COR[k]


def eh_vidro(rgb):
    """Vidro das casinhas: o amarelo-ouro forte do atlas (as janelas e a bandeira da porta)."""
    r, g, b = rgb
    return r > 0.9 and g > 0.62 and b < 0.45 and r - b > 0.5


def ilhas_faces(faces):
    conj = set(faces)
    vistos, out = set(), []
    for f in faces:
        if f in vistos:
            continue
        pilha, ilha = [f], []
        vistos.add(f)
        while pilha:
            g = pilha.pop()
            ilha.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h in conj and h not in vistos:
                        vistos.add(h)
                        pilha.append(h)
        out.append(ilha)
    return out


def materiais_janelas(n, semente, apagadas=0.4):
    """Lista de n materiais de janela: ~40 % apagadas (ao menos uma, se houver duas ou mais; ao menos uma acesa), e as
    acesas divididas entre quente e fria (2 : 1)."""
    rng = random.Random(semente)
    n_ap = int(round(n * apagadas))
    if n >= 2:
        n_ap = min(max(1, n_ap), n - 1)
    else:
        n_ap = 0
    acesas = n - n_ap
    n_fria = int(round(acesas / 3.0))
    lst = ["janela_apagada"] * n_ap + ["janela_fria"] * n_fria + ["janela"] * (acesas - n_fria)
    rng.shuffle(lst)
    return lst


def importa(nome, esc=1.0, giro=0.0, centro="caixa", vidro=False, troca=None, brilho=None, semente=None):
    """Importa <nome>.fbx do pacote Fantasy e traz para as nossas convenções. Cada face recebe a cor da paleta mais
    próxima da cor dominante do atlas no UV dela (troca = {cor: cor} ajusta o que a paleta errar). vidro=True: o
    amarelo das janelas vira janela/janela_fria/janela_apagada, por janela (ilha de faces). brilho = função(rgb, face)
    que diz quais faces viram brilho_roxo. Depois escala, gira (graus em Z: a frente vai para −Y), centra (pela caixa
    ou pelo tronco) e apoia em z = 0. Devolve a lista de objetos."""
    global ATLAS
    if ATLAS is None:
        ATLAS = Atlas(TEX)
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=os.path.join(FBX_DIR, nome + ".fbx"))
    novos = [o for o in bpy.data.objects if o not in antes]
    mb.materiais()
    i_jan = mb.MAT_NOMES.index("janela")
    i_bri = mb.MAT_NOMES.index("brilho_roxo")
    troca = troca or {}
    objs = []
    M = Matrix.Rotation(math.radians(giro), 4, "Z") @ Matrix.Scale(esc, 4)
    for o in novos:
        if o.type != "MESH":
            continue
        me = o.data.copy()
        me.transform(M @ o.matrix_world)
        bm = bmesh.new()
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
        uvl = bm.loops.layers.uv.active
        vidros = []
        for f in bm.faces:
            us = [lo[uvl].uv for lo in f.loops]
            rgb = ATLAS.cor(sum(q[0] for q in us) / len(us), sum(q[1] for q in us) / len(us))
            if vidro and eh_vidro(rgb):
                vidros.append(f)
                f.material_index = i_jan
                continue
            if brilho and brilho(rgb, f):
                f.material_index = i_bri
                continue
            cor = nome_cor(rgb)
            cor = troca.get(cor, cor)
            uu = mb.uv_cor(cor)
            for lo in f.loops:
                lo[uvl].uv = uu
            f.material_index = 0
        if vidros:
            ilhas = ilhas_faces(vidros)
            ilhas.sort(key=lambda il: tuple(round(c, 2) for c in sum((g.calc_center_median() for g in il), V())))
            for il, mat in zip(ilhas, materiais_janelas(len(ilhas), semente or nome)):
                for g in il:
                    g.material_index = mb.MAT_NOMES.index(mat)
            print("janelas", nome, len(ilhas), flush=True)
        mesh = bpy.data.meshes.new(o.name)
        bm.to_mesh(mesh)
        bm.free()
        while len(mesh.uv_layers) > 1:  # só a camada de UV usada (a ativa) fica, com o nome padrão
            mesh.uv_layers.remove([u for u in mesh.uv_layers if not u.active][0])
        mesh.uv_layers[0].name = "UVMap"
        for n in mb.MAT_NOMES:
            mesh.materials.append(bpy.data.materials[n])
        mesh.shade_smooth()
        mesh.set_sharp_from_angle(angle=math.radians(40))
        ob = bpy.data.objects.new(o.name, mesh)
        bpy.context.scene.collection.objects.link(ob)
        objs.append(ob)
    for o in novos:
        bpy.data.objects.remove(o)
    # centro e chão
    pts = [v.co for o in objs for v in o.data.vertices]
    zmin = min(p.z for p in pts)
    if centro == "tronco":
        h = max(p.z for p in pts) - zmin
        base = [p for p in pts if p.z < zmin + max(0.25, min(1.2, h * 0.12))]
        cx, cy = _pct_centro([p.x for p in base]), _pct_centro([p.y for p in base])
    else:
        cx = (min(p.x for p in pts) + max(p.x for p in pts)) / 2
        cy = (min(p.y for p in pts) + max(p.y for p in pts)) / 2
    for o in objs:
        o.data.transform(Matrix.Translation((-cx, -cy, -zmin)))
    return objs


def _pct(vals, p):
    s = sorted(vals)
    return s[min(len(s) - 1, max(0, int(round(p * (len(s) - 1)))))]


def _pct_centro(vals, p=0.05):
    return (_pct(vals, p) + _pct(vals, 1 - p)) / 2


def pontos(objs):
    return [o.matrix_world @ v.co for o in objs for v in o.data.vertices]


def caixa_faixa(pts, z0, z1, p=0.03, folga=0.0):
    """Caixa (x, y, z_base), (l, p, a) que contorna os vértices entre z0 e z1, sem os p % mais de fora de cada lado."""
    sel = [q for q in pts if z0 - 1e-3 <= q.z <= z1 + 1e-3]
    if len(sel) < 4:
        return None
    x0, x1 = _pct([q.x for q in sel], p) - folga, _pct([q.x for q in sel], 1 - p) + folga
    y0, y1 = _pct([q.y for q in sel], p) - folga, _pct([q.y for q in sel], 1 - p) + folga
    return (((x0 + x1) / 2, (y0 + y1) / 2, z0), (round(x1 - x0, 3), round(y1 - y0, 3), round(z1 - z0, 3)))


def col_casa(objs, faixas=(0.0, 0.42, 0.72, 1.0)):
    """Casas: uma caixa por faixa de altura (paredes, telhado, cumeeira), cada uma contornando o volume da faixa."""
    pts = pontos(objs)
    H = max(q.z for q in pts)
    cx = []
    for a, b in zip(faixas[:-1], faixas[1:]):
        c = caixa_faixa(pts, a * H, b * H, p=0.04 if b < 1 else 0.08)
        if c:
            cx.append(c)
    return cx


def col_tronco(objs, alt_frac=0.5, minimo=2.2, larg_min=0.3):
    """Árvores e cogumelos grandes: uma caixa no tronco, da base até onde a copa começa."""
    pts = pontos(objs)
    H = max(q.z for q in pts)
    c = caixa_faixa(pts, 0.0, max(0.4, min(1.2, H * 0.12)), p=0.08)
    (x, y, _), (l, p, _) = c
    l, p = max(l, larg_min), max(p, larg_min)
    return [((x, y, 0.0), (l, p, round(max(minimo, H * alt_frac), 3)))]


def col_caixa(objs):
    lo, hi = mb.bbox(objs)
    return [(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, 0.0), (round(hi.x - lo.x, 3), round(hi.y - lo.y, 3),
                                                          round(hi.z, 3)))]


# =====================================================================================================================
# Peças
# =====================================================================================================================
# (id, fbx, rótulo, grupo, tags, opções). Opções: esc (escala), giro (graus em Z para a frente ir a −Y),
# centro ("caixa" | "tronco"), col ("casa" | "tronco" | "caixa"), troca {cor: cor}, brilho, andares.
CASAS = [
    ("casa_cogumelo_fantasia_pacote", "house_001", "Casa-cogumelo laranja (pacote)", "casa_cogumelo_fantasia",
     ["casa", "natureza", "cogumelo", "pacote"], dict(esc=1.6, giro=-90, andares=1)),
    ("casa_telhas_rosa_fantasia_pacote", "house_002", "Casa de telhas rosa com sacada (pacote)",
     "casa_telhas_rosa_fantasia", ["casa", "conto_de_fadas", "chamine", "pacote"], dict(esc=1.4, giro=-90, andares=2)),
    ("casa_vila_fantasia_pacote", "house_003", "Casinha da vila (pacote)", "casa_vila_fantasia",
     ["casa", "conto_de_fadas", "pacote"], dict(esc=1.7, giro=-90, andares=1)),
]

FANTASIA = [
    # árvores e plantas
    ("arvore_fabulosa_grande_pacote", "big_fabulous_tree_001", "Árvore fabulosa grande (pacote)", "arvore_fabulosa",
     ["arvore", "natureza"], dict(esc=1.1, centro="tronco", col="tronco", alt_frac=0.4)),
    ("arvore_fabulosa_pacote", "fabulous_tree_001", "Árvore fabulosa (pacote)", "arvore_fabulosa",
     ["arvore", "natureza"], dict(esc=1.3, centro="tronco", col="tronco", alt_frac=0.45)),
    ("arvore_pacote", "tree_001", "Árvore de copa redonda (pacote)", "arvore", ["arvore", "natureza"],
     dict(esc=1.15, centro="tronco", col="tronco", alt_frac=0.4)),
    ("pinheiro_pacote", "fir_001", "Pinheiro (pacote)", "pinheiro", ["arvore", "pinheiro", "natureza"],
     dict(esc=1.25, centro="tronco", col="tronco", alt_frac=0.3, larg_min=0.5)),
    ("cacto_pacote", "cactus_001", "Cacto (pacote)", "cacto", ["planta", "cacto", "deserto"],
     dict(esc=1.0, centro="tronco", col="tronco", alt_frac=0.9, minimo=1.0)),
    # cogumelos fabulosos
    ("cogumelo_fabuloso_gigante_pacote", "fabulous_mushroom_002", "Cogumelo fabuloso gigante (pacote)",
     "cogumelo_fabuloso", ["cogumelo", "natureza", "brilho"], dict(esc=1.0, centro="tronco", col="tronco",
                                                                    alt_frac=0.5, pintas=(26, 0.2))),
    ("cogumelo_fabuloso_alto_pacote", "fabulous_mushroom_001", "Cogumelo fabuloso alto (pacote)", "cogumelo_alto",
     ["cogumelo", "natureza"], dict(esc=1.2, col="caixa")),
    ("cogumelo_fabuloso_alto_b_pacote", "fabulous_mushroom_003", "Cogumelo fabuloso alto, outra cor (pacote)",
     "cogumelo_alto", ["cogumelo", "natureza"], dict(esc=1.2, col="caixa")),
    ("cogumelos_fabulosos_touceira_pacote", "fabulous_mushroom_004", "Touceira de cogumelos fabulosos (pacote)",
     "cogumelo_touceira", ["cogumelo", "natureza", "brilho"], dict(esc=1.0, col="caixa", pintas=(9, 0.07))),
    # feira
    ("barraca_feira_pacote", "stall_001", "Barraca de feira (pacote)", "barraca_feira", ["feira", "barraca"],
     dict(esc=1.1, col="caixa")),
    ("mesa_feira_pacote", "stall_table_001", "Bancada de feira (pacote)", "mesa_feira", ["feira", "mesa"],
     dict(esc=1.0, giro=90, col="caixa")),
    ("carroca_pacote", "cart_001", "Carroça de mão (pacote)", "carroca", ["feira", "carroca", "veiculo"],
     dict(esc=1.0, col="caixa")),
    ("guindaste_pacote", "crane_001", "Guindaste de madeira (pacote)", "guindaste", ["feira", "porto", "obra"],
     dict(esc=1.6, col="caixa")),
    ("barril_pacote", "barrel_001", "Barril (pacote)", "barril", ["feira", "barril", "objeto"],
     dict(esc=1.3, col="caixa")),
    ("caixa_madeira_pacote", "box_001", "Caixote de madeira (pacote)", "caixa", ["feira", "caixa", "objeto"],
     dict(esc=1.0, col="caixa")),
    ("caixa_madeira_baixa_pacote", "box_001_001", "Caixote baixo (pacote)", "caixa", ["feira", "caixa", "objeto"],
     dict(esc=1.0, col="caixa")),
    ("caixa_frutas_rasa_pacote", "box_002", "Caixa rasa de feira (pacote)", "caixa_feira",
     ["feira", "caixa", "objeto"], dict(esc=1.0, col="caixa")),
    ("caixa_frutas_pacote", "box_003", "Caixa de feira (pacote)", "caixa_feira", ["feira", "caixa", "objeto"],
     dict(esc=1.0, col="caixa")),
    ("saco_1_pacote", "bag_001", "Saco de grãos (pacote)", "saco", ["feira", "saco", "objeto"],
     dict(esc=1.15, col="caixa")),
    ("saco_2_pacote", "bag_002", "Saco de grãos 2 (pacote)", "saco", ["feira", "saco", "objeto"],
     dict(esc=1.15, col="caixa")),
    ("saco_3_pacote", "bag_003", "Saco de grãos 3 (pacote)", "saco", ["feira", "saco", "objeto"],
     dict(esc=1.15, col="caixa")),
    ("saco_4_pacote", "bag_004", "Saco de grãos 4 (pacote)", "saco", ["feira", "saco", "objeto"],
     dict(esc=1.15, col="caixa")),
    ("balde_pacote", "bucket_001", "Balde de madeira (pacote)", "balde", ["feira", "balde", "objeto"],
     dict(esc=0.8, col="caixa")),
    ("jarro_1_pacote", "jug_001", "Jarro deitado (pacote)", "jarro", ["feira", "jarro", "objeto"],
     dict(esc=1.0, col="caixa")),
    ("jarro_2_pacote", "jug_002", "Ânfora deitada (pacote)", "jarro", ["feira", "jarro", "objeto"],
     dict(esc=1.0, col="caixa")),
    ("jarro_3_pacote", "jug_003", "Jarro alto (pacote)", "jarro", ["feira", "jarro", "objeto"],
     dict(esc=1.0, col="caixa")),
    ("jarro_4_pacote", "jug_004", "Pote baixo (pacote)", "jarro", ["feira", "jarro", "objeto"],
     dict(esc=1.0, col="caixa")),
    ("jarro_5_pacote", "jug_005", "Jarro médio (pacote)", "jarro", ["feira", "jarro", "objeto"],
     dict(esc=1.0, col="caixa")),
    ("prato_grande_pacote", "plate_001", "Prato grande (pacote)", "prato", ["feira", "prato", "objeto"],
     dict(esc=0.8, col="caixa")),
    ("prato_pequeno_pacote", "plate_002", "Prato pequeno (pacote)", "prato", ["feira", "prato", "objeto"],
     dict(esc=0.8, col="caixa")),
    ("prato_medio_pacote", "plate_003", "Prato médio (pacote)", "prato", ["feira", "prato", "objeto"],
     dict(esc=0.8, col="caixa")),
    ("toras_empilhadas_pacote", "log_001", "Toras em pé no cercado (pacote)", "toras", ["feira", "madeira", "toras"],
     dict(esc=1.0, col="caixa")),
    ("toco_machado_pacote", "log_002", "Toco com machado (pacote)", "toras", ["madeira", "toras", "objeto"],
     dict(esc=1.0, col="caixa")),
    ("lenha_baixa_pacote", "log_003", "Pilha de lenha baixa (pacote)", "toras", ["madeira", "toras", "objeto"],
     dict(esc=1.0, col="caixa")),
    ("lenha_pacote", "log_004", "Pilha de lenha (pacote)", "toras", ["madeira", "toras", "objeto"],
     dict(esc=1.0, col="caixa")),
    ("mesa_madeira_pacote", "table_001", "Mesa de madeira com toalha (pacote)", "mesa", ["feira", "mesa"],
     dict(esc=1.0, giro=90, col="caixa")),
    ("suporte_pacote", "holder_001", "Suporte de madeira em tripé (pacote)", "suporte", ["feira", "suporte"],
     dict(esc=1.0, giro=90, col="caixa")),
    ("placa_indicativa_pacote", "pointer_001", "Placa indicativa (pacote)", "placa", ["sinalizacao", "placa"],
     dict(esc=1.1, col="caixa")),
]


def cor_da_face(me, p):
    """Nome da cor da paleta de uma face no atlas (pelo UV do primeiro canto)."""
    u = me.uv_layers["UVMap"].data[p.loop_indices[0]].uv
    i = int(u[0] * 16) + 16 * int((1 - u[1]) * 16)
    return mb.NOMES[i] if 0 <= i < len(mb.NOMES) else None


def pintinhas(objs, n, r, semente, alto=0.55, nz=0.25):
    """Pintinhas que brilham à noite (brilho_roxo) no chapéu dos cogumelos: o pacote não tem pintas, então elas são
    bolinhas achatadas assentadas nas faces da cor dominante do chapéu (a cor que mais cobre a parte de cima),
    viradas para fora, sorteadas por área e sem encostar umas nas outras."""
    rng = random.Random(zlib.crc32(semente.encode()))
    H = max(v.co.z for o in objs for v in o.data.vertices)
    cand = []
    area_cor = {}
    for o in objs:
        me = o.data
        for p in me.polygons:
            if p.material_index != 0 or p.center.z < alto * H:
                continue
            c = cor_da_face(me, p)
            area_cor[c] = area_cor.get(c, 0.0) + p.area
            cand.append((o, p.index, c))
    if not cand:
        return []
    chapeu = max(area_cor, key=area_cor.get)
    faces = []
    for o, i, c in cand:
        p = o.data.polygons[i]
        if c == chapeu and p.normal.z > nz and p.area > (r * 0.6) ** 2:
            faces.append((p.area, V(p.center), V(p.normal)))
    out, usados = [], []
    tent = 0
    while faces and len(out) < n and tent < n * 40:
        tent += 1
        tot = sum(f[0] for f in faces)
        x = rng.random() * tot
        for a, c, nrm in faces:
            x -= a
            if x <= 0:
                break
        if any((c - q).length < r * 3.2 for q in usados):
            continue
        usados.append(c)
        rr = r * rng.uniform(0.75, 1.2)
        b = mb.esfera(rr, cor="branco", esc=(1, 1, 0.38), seg=10, mat="brilho_roxo", nome="pinta")
        rot = V((0, 0, 1)).rotation_difference(nrm).to_matrix().to_4x4()
        b.data.transform(Matrix.Translation(c + nrm * rr * 0.12) @ rot)
        out.append(b)
    print("pintinhas", semente, chapeu, len(out), flush=True)
    return out


def monta(it, fbx, op, casa=False):
    objs = importa(fbx, esc=op.get("esc", 1.0), giro=op.get("giro", 0.0), centro=op.get("centro", "caixa"),
                   vidro=casa, troca=op.get("troca"), brilho=op.get("brilho"), semente=it.id)
    it.add(*objs)
    if op.get("pintas"):
        n, r = op["pintas"]
        it.add(*pintinhas(objs, n, r, it.id))
    tipo = "casa" if casa else op.get("col", "caixa")
    if tipo == "casa":
        it.colisao(col_casa(objs))
    elif tipo == "tronco":
        it.colisao(col_tronco(objs, alt_frac=op.get("alt_frac", 0.5), minimo=op.get("minimo", 2.2),
                              larg_min=op.get("larg_min", 0.3)))
    else:
        it.colisao(col_caixa(objs))
    return objs


def gera(saida, filtro):
    quer_casas = not filtro or "casas" in filtro
    quer_fant = not filtro or "fantasia" in filtro
    ids_c = [p[0] for p in CASAS]
    ids_f = [p[0] for p in FANTASIA]
    assert len(set(ids_c + ids_f)) == len(ids_c + ids_f), "ids repetidos"
    sel = [a for a in filtro if a not in ("casas", "fantasia")]
    if any(p[0] in sel or p[3] in sel for p in CASAS) or quer_casas:
        cat = mb.Catalogo(CAT_CASAS, saida, rotulo="Prédios mágicos")
        antes = len(cat.dados["itens"])
        for id_, fbx, rot, grupo, tags, op in CASAS:
            if not quer_casas and id_ not in sel and grupo not in sel:
                continue
            mb.limpa()
            it = mb.Item(id_)
            monta(it, fbx, op, casa=True)
            extra = {"lote": [1, 1], "andares": op.get("andares", 1), "estilo": ESTILO, "pacote_origem": "Fantasy"}
            cat.exporta(it, rot, grupo=grupo, tags=["predio", ESTILO] + tags, pacote=True, extra=extra)
        cat.salva()
        print("predios_magicos: itens antes", antes, "depois", len(cat.dados["itens"]), flush=True)
    if any(p[0] in sel or p[3] in sel for p in FANTASIA) or quer_fant:
        cat = mb.Catalogo(CAT, saida, rotulo="Vila de fantasia")
        for id_, fbx, rot, grupo, tags, op in FANTASIA:
            if not quer_fant and id_ not in sel and grupo not in sel:
                continue
            mb.limpa()
            it = mb.Item(id_)
            monta(it, fbx, op)
            cat.exporta(it, rot, grupo=grupo, tags=["fantasia"] + tags + ["pacote"], pacote=True)
        validos = set(ids_f)
        cat.dados["itens"] = sorted([x for x in cat.dados["itens"] if x["id"] in validos],
                                    key=lambda x: ids_f.index(x["id"]))
        cat.salva()
        print("fantasia: itens", len(cat.dados["itens"]), flush=True)


# =====================================================================================================================
# Vitrines
# =====================================================================================================================
MAGICOS_VIZINHOS = ["casa_cogumelo_vermelho", "casinha_telhado_vermelho", "casa_estreita_enxaimel",
                    "casinha_arredondada_rosa"]


def vitrines(saida):
    pf = os.path.join(saida, CAT)
    pm = os.path.join(saida, CAT_CASAS)
    itens = json.load(open(os.path.join(pf, "catalogo.json")))["itens"]
    pequenos = [i["id"] for i in itens if i["dims"][2] <= 1.6]
    for noite in (False, True):
        suf = "_noite" if noite else ""
        mb.vitrine(pf, os.path.join(pf, f"vitrine{suf}.png"), noite=noite)
        if not noite:  # os objetos pequenos somem ao lado das árvores: uma vitrine só deles (de dia: não acendem)
            mb.vitrine(pf, os.path.join(pf, "vitrine_pequenos.png"), ids=pequenos)
        mb.vitrine(pm, os.path.join(pf, f"vitrine_casas{suf}.png"), ids=[p[0] for p in CASAS] + MAGICOS_VIZINHOS,
                   noite=noite, colunas=4)


# =====================================================================================================================
# Teste de cena: pracinha de feira de fantasia (2 × 2 quadras)
# =====================================================================================================================
Q = 15.0
# pisos: (id, centro x, centro y, giro)
PISOS = [("piso_terra", -7.5, -7.5, 0), ("piso_terra", 7.5, -7.5, 0), ("piso_grama", -7.5, 7.5, 0),
         ("piso_grama_caminho", 7.5, 7.5, 90)]
# (categoria, id, x, y, z, giro)
PRACA = [
    # fundo: duas casinhas, a árvore fabulosa grande e o cogumelo gigante
    (CAT_CASAS, "casa_cogumelo_fantasia_pacote", 4.0, 10.5, 0, -15),
    (CAT_CASAS, "casa_telhas_rosa_fantasia_pacote", 11.0, 10.0, 0, 0),
    (CAT, "arvore_fabulosa_grande_pacote", -10.5, 7.5, 0, 0),
    (CAT, "cogumelo_fabuloso_gigante_pacote", -2.0, 6.0, 0, 0),
    (CAT, "arvore_fabulosa_pacote", 5.5, 3.0, 0, 30),
    (CAT, "arvore_pacote", 13.0, -1.0, 0, 0),
    (CAT, "pinheiro_pacote", -13.0, -12.5, 0, 0),
    (CAT, "pinheiro_pacote", -0.8, 13.3, 0, 40),
    (CAT, "cacto_pacote", 13.8, -13.6, 0, 0),
    (CAT, "cogumelo_fabuloso_alto_pacote", 0.6, 4.6, 0, 0),
    (CAT, "cogumelo_fabuloso_alto_b_pacote", 7.9, 6.6, 0, 0),
    (CAT, "cogumelos_fabulosos_touceira_pacote", -5.8, 1.8, 0, 20),
    # feira (frente esquerda)
    (CAT, "barraca_feira_pacote", -8.0, -4.0, 0, 0),
    (CAT, "mesa_feira_pacote", -4.6, -4.0, 0, 90),
    (CAT, "barril_pacote", -10.5, -6.5, 0, 0),
    (CAT, "barril_pacote", -11.4, -5.6, 0, 30),
    (CAT, "caixa_madeira_pacote", -10.6, -2.4, 0, 10),
    (CAT, "caixa_madeira_baixa_pacote", -10.8, -1.4, 0, 80),
    (CAT, "caixa_frutas_pacote", -6.3, -6.8, 0, 0),
    (CAT, "caixa_frutas_rasa_pacote", -5.4, -6.9, 0, 5),
    (CAT, "saco_1_pacote", -3.0, -2.2, 0, 0),
    (CAT, "saco_2_pacote", -2.4, -2.6, 0, 40),
    (CAT, "saco_3_pacote", -2.9, -3.0, 0, 80),
    (CAT, "jarro_3_pacote", -3.4, -6.4, 0, 0),
    (CAT, "jarro_5_pacote", -2.9, -6.6, 0, 0),
    (CAT, "jarro_2_pacote", -2.6, -7.4, 0, 30),
    # mesa com pratos e jarros
    (CAT, "mesa_madeira_pacote", -6.0, -10.5, 0, 0),
    (CAT, "prato_grande_pacote", -6.4, -10.3, "mesa", 0),
    (CAT, "prato_medio_pacote", -5.5, -10.6, "mesa", 0),
    (CAT, "prato_pequeno_pacote", -6.9, -10.8, "mesa", 0),
    (CAT, "jarro_4_pacote", -5.9, -10.9, "mesa", 0),
    (CAT, "jarro_1_pacote", -5.0, -10.2, "mesa", 0),
    (CAT, "saco_4_pacote", -9.0, -11.5, 0, 0),
    # carroça, guindaste e madeira (frente direita)
    (CAT, "carroca_pacote", 4.5, -6.0, 0, -20),
    (CAT, "guindaste_pacote", 10.5, -6.0, 0, 180),
    (CAT, "toras_empilhadas_pacote", 10.5, -11.5, 0, 0),
    (CAT, "toco_machado_pacote", 7.0, -11.0, 0, 0),
    (CAT, "lenha_baixa_pacote", 7.8, -12.0, 0, 50),
    (CAT, "lenha_pacote", 13.0, -9.0, 0, 0),
    (CAT, "suporte_pacote", 3.5, -11.5, 0, 0),
    (CAT, "balde_pacote", 6.0, -8.8, 0, 0),
    (CAT, "placa_indicativa_pacote", 1.0, -13.0, 0, 0),
]


def _importa_glb(caminho, x, y, z, giro):
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=caminho)
    novos = [o for o in bpy.data.objects if o not in antes]
    raiz = [o for o in novos if o.parent is None][0]
    raiz.location = (x, y, z)
    raiz.rotation_mode = "XYZ"
    raiz.rotation_euler = (raiz.rotation_euler.x, raiz.rotation_euler.y, math.radians(giro))
    for o in novos:
        if o.get("colisao"):
            o.hide_render = True
    return novos


def monta_praca(saida):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for id_, x, y, g in PISOS:
        _importa_glb(os.path.join(saida, "pisos", "glb", id_ + ".glb"), x, y, 0, g)
    alt_mesa = None
    for cat, id_, x, y, z, g in PRACA:
        if z == "mesa":
            if alt_mesa is None:
                it = next(i for i in json.load(open(os.path.join(saida, CAT, "catalogo.json")))["itens"]
                          if i["id"] == "mesa_madeira_pacote")
                alt_mesa = it["dims"][2]
            z = alt_mesa
        _importa_glb(os.path.join(saida, cat, "glb", id_ + ".glb"), x, y, z, g)


def render_praca(arquivo, noite=False, res=(1800, 1300), amostras=48):
    scn = bpy.context.scene
    scn.render.engine = "CYCLES"
    scn.cycles.samples = int(os.environ.get("AMOSTRAS", amostras))
    scn.cycles.use_denoising = True
    scn.render.threads_mode = "FIXED"
    scn.render.threads = int(os.environ.get("MOVEIS_THREADS", "1"))
    scn.render.resolution_x, scn.render.resolution_y = res
    scn.view_settings.view_transform = "Standard"
    w = bpy.data.worlds.new("w")
    scn.world = w
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (*mb._lin("#1B2A4A" if noite else "#9DB4D9"), 1)
    w.node_tree.nodes["Background"].inputs[1].default_value = 0.45 if noite else 0.6
    mb.emissao_janelas(mb.JANELA_FORCA * 1.4 if noite else 0.0)
    chao = bpy.data.meshes.new("chao")
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=300)
    bm.to_mesh(chao)
    bm.free()
    m = bpy.data.materials.new("chao_vitrine")
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*mb._lin("#141E36" if noite else "#2A3D63"), 1)
    b.inputs["Roughness"].default_value = 0.9
    chao.materials.append(m)
    ob = bpy.data.objects.new("chao", chao)
    scn.collection.objects.link(ob)
    ob.location = (0, 0, -0.42)
    ld = bpy.data.lights.new("sol", "SUN")
    ld.energy = 0.6 if noite else 3.0
    if noite:
        ld.color = (0.6, 0.7, 1.0)
    ld.angle = math.radians(6)
    sol = bpy.data.objects.new("sol", ld)
    scn.collection.objects.link(sol)
    sol.rotation_euler = (math.radians(42), 0, math.radians(-38))
    cd = bpy.data.cameras.new("c")
    cd.type = "ORTHO"
    cam = bpy.data.objects.new("c", cd)
    scn.collection.objects.link(cam)
    scn.camera = cam
    d = V((0.45, -1.0, 0.85)).normalized()
    alvo = V((0, 0.5, 3.5))
    cam.location = alvo + d * 150
    cam.rotation_euler = (alvo - cam.location).to_track_quat("-Z", "Y").to_euler()
    cd.ortho_scale = 44
    cd.clip_end = 400
    scn.render.image_settings.file_format = "PNG"
    scn.render.filepath = arquivo
    bpy.ops.render.render(write_still=True)
    print("render", arquivo, flush=True)


def praca(saida, modos):
    for md in modos:
        monta_praca(saida)
        render_praca(os.path.join(saida, CAT, f"praca_{md}.png"), noite=md == "noite")


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:]
    SAIDA, resto = args[0], args[1:]
    if resto and resto[0] == "vitrines":
        vitrines(SAIDA)
    elif resto and resto[0] == "praca":
        praca(SAIDA, [a for a in resto[1:] if a in ("dia", "noite")] or ["dia", "noite"])
    else:
        gera(SAIDA, resto)
