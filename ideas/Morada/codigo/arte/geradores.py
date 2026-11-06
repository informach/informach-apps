"""Peças feitas aqui, a partir das malhas-base do pacote (roupas.json, itens com "gerar").

- camada: roupa justa ou folgada feita sobre a própria pele (região escolhida pelos grupos de ossos, afastada da pele,
  cortada nos marcos do corpo com bainha). Legging, bermuda de ciclista, maiô, macacão, regata e manga longa justas,
  meia, luva, colete, avental (só a frente), gravata e alças (faixas), joelheira e cotoveleira, cinto, máscara.
  Padrões (textura própria, com UV pelo corpo): liso, listras, faixas refletivas, faixa lateral, xadrez, poá, floral.
- chapeu: feito sobre a cabeça (copa pela forma da cabeça, mais aba, viseira, faixa, topo, pompom, orelhas, olhos,
  protetores de orelha). Capacete de obra, de bicicleta e de bombeiro, boné, boina, touca, chapéu de cozinheiro, quepe,
  balde, faixa de cabeça, protetor de ouvido...
- saia (roupas._saia_gerada) e as peças compostas ("compoe") continuam como antes.

A cor principal (parte branca da textura) é livre na página (máscara); as partes de outras cores ficam.
"""
import math
import os

import bpy
import bmesh
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

AQUI = os.path.dirname(os.path.abspath(__file__))
PASTA_GEN = os.path.join(os.path.dirname(AQUI), "biblioteca", "roupas_gen")
REGIOES = {
    "tronco": ("Hips", "Spine", "Spine1", "Spine2", "Neck", "LeftShoulder", "RightShoulder", "LeftArm", "RightArm",
               "LeftForeArm", "RightForeArm"),
    "pernas": ("Hips", "Spine", "LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg", "LeftFoot", "RightFoot", "LeftToeBase",
               "RightToeBase"),
    "pes": ("LeftLeg", "RightLeg", "LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase"),
    "maos": ("LeftForeArm", "RightForeArm", "LeftHand", "RightHand", "*Hand"),
    "cabeca": ("Head",),
}
REGIOES["corpo"] = tuple(dict.fromkeys(REGIOES["tronco"] + REGIOES["pernas"]))
# atlas de cores lisas para chapéus e acessórios: (u, v) do centro de cada mancha (8 × 2)
CORES_ATLAS = ["branco", "preto", "cinza", "dourado", "prata", "vermelho", "azul_escuro", "amarelo",
               "verde", "marrom", "laranja", "rosa", "azul", "bege", "cinza_escuro", "creme"]
RGB_ATLAS = {"branco": (255, 255, 255), "preto": (34, 34, 38), "cinza": (150, 152, 158), "dourado": (214, 168, 58),
             "prata": (196, 200, 206), "vermelho": (205, 55, 50), "azul_escuro": (36, 52, 107), "amarelo": (242, 194, 49),
             "verde": (59, 170, 92), "marrom": (110, 72, 46), "laranja": (226, 123, 59), "rosa": (238, 112, 169),
             "azul": (61, 123, 214), "bege": (201, 164, 110), "cinza_escuro": (70, 72, 78), "creme": (245, 236, 214)}


def uv_atlas(cor):
    i = CORES_ATLAS.index(cor)
    return ((i % 8) + 0.5) / 8, 1 - ((i // 8) + 0.5) / 16  # manchas na faixa de cima da imagem


# ------------------------------------------------------------------ texturas
def _salva(nome, A):
    from PIL import Image
    os.makedirs(PASTA_GEN, exist_ok=True)
    caminho = os.path.join(PASTA_GEN, f"Roupa_Gen_{nome}.png")
    Image.fromarray(np.clip(A, 0, 255).astype(np.uint8)).save(caminho, optimize=True)
    return caminho


def textura(nome):
    """Material Roupa_Gen_<nome> com a textura do padrão (feita uma vez). Metade de cima da imagem: tronco e pernas
    (u = volta em torno do corpo/perna, v = altura); metade de baixo: braços (v = ao longo do braço)."""
    mat = bpy.data.materials.get(f"Roupa_Gen_{nome}")
    if mat:
        return mat
    S = 512
    A = np.full((S, S, 3), 255.0)
    yy, xx = np.mgrid[0:S, 0:S]
    u = xx / S
    v_img = yy / S                     # 0 em cima
    corpo = v_img < 0.5
    v = np.where(corpo, (0.5 - v_img) * 2, (1.0 - v_img) * 2)  # 0..1: altura no corpo / posição ao longo do braço
    if nome in ("atlas", "detalhe"):  # detalhe: o mesmo atlas, mas a cor livre não pinta (botões, fivelas, lentes)
        for i, c in enumerate(CORES_ATLAS):
            x0, y0 = (i % 8) * S // 8, (i // 8) * S // 16
            A[y0:y0 + S // 16, x0:x0 + S // 8] = RGB_ATLAS[c]
    elif nome == "listras":
        faixa = (np.floor(v * (40 if True else 1)) % 2 == 0)
        A[faixa] = (40, 40, 44)
    elif nome == "listras_largas":
        A[(np.floor(v * 18) % 2 == 0)] = (40, 40, 44)
    elif nome == "refletivo":
        bandas = [(0.62, 0.655), (0.50, 0.535), (0.20, 0.235), (0.28, 0.305)]
        m = np.zeros_like(corpo)
        for a, b in bandas:
            m |= corpo & (v > a) & (v < b)
        m |= ~corpo & (v > 0.78) & (v < 0.86)
        A[m] = (190, 194, 198)
    elif nome == "refletivo_bombeiro":
        bandas = [(0.62, 0.66), (0.47, 0.51), (0.13, 0.17), (0.24, 0.28)]
        m = np.zeros_like(corpo)
        for a, b in bandas:
            m |= corpo & (v > a) & (v < b)
        m |= ~corpo & (((v > 0.45) & (v < 0.52)) | ((v > 0.8) & (v < 0.87)))
        A[m] = (196, 200, 150)
    elif nome == "faixa_lateral":
        A[corpo & ((np.abs(u - 0.25) < 0.025) | (np.abs(u - 0.75) < 0.025))] = (225, 225, 228)
        A[~corpo & (np.abs(u - 0.5) < 0.04)] = (225, 225, 228)
    elif nome == "xadrez":
        lin = ((np.floor(u * 24) % 3 == 0) | (np.floor(v * 48) % 3 == 0))
        A[lin] = (150, 150, 155)
        A[(np.floor(u * 24) % 3 == 0) & (np.floor(v * 48) % 3 == 0)] = (90, 90, 96)
    elif nome == "poa":
        cx, cy = (u * 20) % 1 - 0.5, (v * 40) % 1 - 0.5
        A[cx ** 2 + cy ** 2 < 0.06] = (245, 245, 245)
        A[~(cx ** 2 + cy ** 2 < 0.06)] = 255
        A[cx ** 2 + cy ** 2 < 0.06] = (60, 60, 64)
    elif nome == "floral":
        rng = np.random.default_rng(7)
        for _ in range(140):
            x0, y0, r = rng.integers(0, S), rng.integers(0, S), rng.integers(10, 22)
            for k in range(5):
                a = 2 * math.pi * k / 5
                px, py = x0 + r * 0.7 * math.cos(a), y0 + r * 0.7 * math.sin(a)
                A[(xx - px) ** 2 + (yy - py) ** 2 < (r * 0.45) ** 2] = (215, 215, 220)
            A[(xx - x0) ** 2 + (yy - y0) ** 2 < (r * 0.3) ** 2] = (120, 120, 126)
    elif nome == "acolchoado":  # gomos horizontais da jaqueta acolchoada
        A[corpo & ((v * 30) % 1 < 0.08)] = (200, 200, 204)
        A[~corpo & ((v * 12) % 1 < 0.1)] = (200, 200, 204)
    elif nome == "botoes_duplos":  # dólmã: duas fileiras de botões na frente
        for du in (-0.035, 0.035):
            for vv in np.linspace(0.52, 0.72, 5):
                A[corpo & ((u - 0.5 - du) ** 2 * 4 + (v - vv) ** 2 < 0.00009)] = (60, 60, 66)
    # padrões com detalhes claros: o fundo é cinza (a cor livre pinta o fundo; o branco fica branco)
    elif nome in ("faixa_peito", "caveiras", "folhas", "onca", "ziguezague", "listras_verticais", "duas_cores_lateral",
                  "lantejoula", "jeans", "listras_marinheiro"):
        A[:] = 190.0
        rng = np.random.default_rng(11)
        if nome == "faixa_peito":  # faixa larga no peito e nas mangas (camisa de time, camisa listrada de praia)
            A[corpo & (v > 0.655) & (v < 0.715)] = 250
            A[~corpo & (v > 0.30) & (v < 0.38)] = 250
        elif nome == "listras_verticais":
            A[(np.floor(u * 28) % 2 == 0)] = 250
        elif nome == "listras_marinheiro":
            A[(np.floor(v * 22) % 2 == 0)] = 250
        elif nome == "duas_cores_lateral":  # painel claro dos lados (short de praia, agasalho)
            A[corpo & ((np.abs(u - 0.25) < 0.05) | (np.abs(u - 0.75) < 0.05))] = 250
            A[~corpo & (np.abs(u - 0.5) < 0.08)] = 250
        elif nome == "ziguezague":
            fase = (u * 36) % 1
            onda = np.abs(fase - 0.5) * 2
            A[(np.abs(((v * 26) % 1) - 0.25 - 0.4 * onda) < 0.12)] = 250
        elif nome in ("caveiras", "folhas", "onca"):
            for _ in range(320 if nome != "onca" else 520):
                x0, y0 = rng.integers(0, S), rng.integers(0, S)
                if nome == "caveiras":
                    r = 9
                    A[(xx - x0) ** 2 + ((yy - y0) * 1.1) ** 2 < r * r] = 250
                    A[(np.abs(xx - x0) < 5) & (yy - y0 > 4) & (yy - y0 < 12)] = 250
                    for dx in (-4, 4):
                        A[(xx - x0 - dx) ** 2 + (yy - y0 + 1) ** 2 < 7] = 40
                elif nome == "folhas":
                    a = rng.uniform(0, math.pi)
                    ca, sa = math.cos(a), math.sin(a)
                    X, Y = (xx - x0) * ca + (yy - y0) * sa, -(xx - x0) * sa + (yy - y0) * ca
                    A[(X / 15) ** 2 + (Y / 6) ** 2 < 1] = 245
                    A[(np.abs(Y) < 0.8) & (np.abs(X) < 14)] = 190
                else:
                    r = rng.integers(4, 8)
                    d2 = (xx - x0) ** 2 + ((yy - y0) * 1.3) ** 2
                    A[(d2 < r * r) & (d2 > (r - 3) ** 2)] = 50
                    A[d2 < (r - 3) ** 2] = 235
        elif nome == "lantejoula":  # lantejoulas: pontinhos de brilho na mesma cor
            A += rng.normal(0, 26, (S, S))[:, :, None]
            br = rng.random((S, S)) < 0.04
            A[br] = 255
        elif nome == "jeans":  # sarja com costura clara nas laterais
            A += rng.normal(0, 7, (S, S))[:, :, None] + 6 * np.sin(xx * 1.7 + yy * 1.7)[:, :, None]
            A[corpo & ((np.abs(u - 0.25) < 0.004) | (np.abs(u - 0.75) < 0.004))] = 245
    elif nome == "bolso_canguru":  # moletom: bolso canguru e cordão do capuz
        A[corpo & (np.abs(u - 0.5) < 0.085) & (np.abs(v - 0.585) < 0.003)] = 150
        A[corpo & (np.abs(np.abs(u - 0.5) - 0.085) < 0.0025) & (v > 0.535) & (v < 0.585)] = 150
        A[corpo & (np.abs(v - 0.535) < 0.003) & (np.abs(u - 0.5) < 0.06)] = 150
        for du in (-0.02, 0.02):
            A[corpo & (np.abs(u - 0.5 - du) < 0.0025) & (v > 0.74) & (v < 0.80)] = 120
    elif nome == "duas_cores":
        A[corpo & (v < 0.45)] = (50, 52, 58)
        A[~corpo & (v > 0.5)] = (50, 52, 58)
    caminho = _salva(nome, A)
    mat = bpy.data.materials.new(f"Roupa_Gen_{nome}")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = bpy.data.images.load(caminho, check_existing=True)
    t.interpolation = "Closest" if nome in ("atlas", "detalhe") else "Linear"
    nt.links.new(t.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


def _uv_corpo(ob, m, H, ombro):
    """UV pelo corpo: tronco e pernas em cima (volta em torno do corpo ou da perna; altura), braços embaixo."""
    me = ob.data
    mw = ob.matrix_world
    uvl = me.uv_layers.new(name="UVMap") if not me.uv_layers else me.uv_layers.active
    gancho = m["quadril"] - 0.04
    for poly in me.polygons:
        # o polígono inteiro numa ilha só (sem costura no meio dele)
        cs = [mw @ me.vertices[me.loops[li].vertex_index].co for li in poly.loop_indices]
        cen = sum(cs, Vector()) / len(cs)
        braco = abs(cen.x) > ombro * 1.05 and cen.z > m["quadril"] + 0.05
        cx = 0.0 if (cen.z > gancho or braco) else math.copysign(0.09 * H / 1.73, cen.x)
        ang0 = math.atan2(cen.x - cx, -cen.y)
        for li, p in zip(poly.loop_indices, cs):
            if braco:
                v = 0.5 * min(max((abs(p.x) - ombro) / max(m["punho"] - ombro, 0.05), 0), 1)
                a = math.atan2(p.y, p.z - cen.z)
                uu = (a / (2 * math.pi)) % 1
                uvl.data[li].uv = (uu, v * 0.999)
            else:
                a = math.atan2(p.x - cx, -p.y)
                if abs(a - ang0) > math.pi:  # sem dar a volta no meio do polígono
                    a += -2 * math.pi if a > ang0 else 2 * math.pi
                uvl.data[li].uv = (a / (2 * math.pi) + 0.5, 0.5 + 0.5 * min(max(p.z / H, 0), 0.999))


def _peso_vertices(S, nomes):
    idx = set()
    for g in S.vertex_groups:
        if g.name in nomes or ("*Hand" in nomes and "Hand" in g.name):
            idx.add(g.index)
    return np.array([sum(x.weight for x in v.groups if x.group in idx) for v in S.data.vertices])


def camada(S, spec):
    """Roupa sobre a pele da malha S (no mundo). spec: regiao, folga (m), cortes (marcos), frente (só faces de frente,
    0..1), faixa_x ([min, max] de |x| para gravata e alças), faixas_z (lista de [z0, z1] em marcos: só essas alturas),
    padrao, subdivide."""
    import roupas as R
    if spec.get("partes"):  # várias camadas numa malha só (jardineira: calça + peitilho + alças)
        base_ = {k: v for k, v in spec.items() if k != "partes"}
        # uma parte com "saia": saia gerada (casaco longo, jaleco, vestido), com a mesma textura
        obs = []
        for p in spec["partes"]:
            if "saia" in p:
                o = R._saia_gerada(S, {**p["saia"], "padrao": base_.get("padrao", "liso")}, None)[0]
            elif "capuz_caido" in p:
                o = _capuz_caido(S, {**base_, **p["capuz_caido"]})
            elif "fivela" in p:
                o = _fivela(S, p["fivela"])
            else:
                o = camada(S, {**base_, **{k: v for k, v in p.items() if k != "cor"}})
            if p.get("cor"):
                _pinta(o, p["cor"])
            obs.append(o)
        return _junta(obs)
    if spec.get("cor") and not spec.get("_sem_cor"):
        o = camada(S, {**spec, "_sem_cor": True})
        _pinta(o, spec["cor"])
        return o
    m = R._marcos(S)
    H = m["altura"]
    w = _peso_vertices(S, REGIOES[spec.get("regiao", "tronco")])
    bm = bmesh.new()
    bm.from_mesh(S.data)
    bm.transform(S.matrix_world)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if min(w[v.index] for v in f.verts) < 0.5], context="FACES_ONLY")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    if spec.get("subdivide", 1):
        bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=1, use_grid_fill=True, smooth=1.0)
    bm.normal_update()
    folga = spec.get("folga", 0.006) * H / 1.73
    inf = spec.get("inflar")
    for v in bm.verts:
        extra = 0.0
        if inf:  # gomos: estufa entre as costuras, que ficam rentes
            ang = math.atan2(v.co.x, -v.co.y)
            extra = inf.get("amp", 0.012) * H / 1.73 * (0.5 + 0.5 * math.cos(ang * inf.get("n", 8)))
        fv = folga
        if spec.get("regiao") == "pernas" and not spec.get("sem_cos"):
            # cós rente: na cintura a parte de baixo fica junto da pele, para a parte de cima passar por fora
            t = min(max((v.co.z - (m["quadril"] - 0.06)) / 0.05, 0), 1)
            fv = folga + (min(folga, 0.0035 * H / 1.73) - folga) * t
        v.co += v.normal * (fv + extra)
    if spec.get("boca_sino"):  # calça boca de sino: abre do joelho para baixo
        import roupas as R_
        m_ = R_._marcos(S)
        zj, zt = m_["joelho"], m_["tornozelo"]
        for v in bm.verts:
            if v.co.z < zj:
                t = min((zj - v.co.z) / max(zj - zt, 0.05), 1.2)
                perto = v.normal.copy()
                perto.z = 0
                if perto.length:
                    v.co += perto.normalized() * spec["boca_sino"] * H / 1.73 * t ** 1.5
    me = bpy.data.meshes.new("camada")
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("camada", me)
    bpy.context.scene.collection.objects.link(ob)
    if spec.get("cortes"):
        cortes = spec["cortes"]
        if spec.get("regiao", "tronco") == "tronco":
            # a barra da parte de cima não desce abaixo do gancho (senão vira body entre as pernas): mais comprida,
            # só com uma parte "saia" (paletó, casaco)
            cortes = [{**c_, "desloca": max(c_.get("desloca", 0.0), -0.025)} if c_["marco"] == "quadril" and not c_.get("acima")
                      else c_ for c_ in cortes]
        R._corta(ob, S, cortes, bainha=spec.get("bainha", 0.004))
    # recortes que não são planos de marco: só a frente, faixas em x (gravata, alças), faixas de altura
    if spec.get("frente") is not None or spec.get("faixa_x") or spec.get("faixas_z") or spec.get("faixas_x") \
            or spec.get("abre_frente") or spec.get("tras") or spec.get("furos") or spec.get("ombro_unico") \
            or spec.get("lapela"):
        bm = bmesh.new()
        bm.from_mesh(me)
        lay_cor = bm.faces.layers.int.get("cor") or bm.faces.layers.int.new("cor")
        # bordas retas: corta a malha nos limites das faixas antes de escolher as faces
        def corta(co, no):
            bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=co, plane_no=no)
        if spec.get("faixa_x"):
            for xv in spec["faixa_x"]:
                if xv > 0:
                    corta((xv * H / 1.73, 0, 0), (1, 0, 0))
                    corta((-xv * H / 1.73, 0, 0), (1, 0, 0))
        for x0, d0, x1, d1 in spec.get("faixas_x", []):
            for xv in (m[x0] + d0, m[x1] + d1):
                corta((xv, 0, 0), (1, 0, 0))
                corta((-xv, 0, 0), (1, 0, 0))
        for z0, d0, z1, d1 in spec.get("faixas_z", []):
            for zv in (m[z0] + d0, m[z1] + d1):
                corta((0, 0, zv), (0, 0, 1))
        if spec.get("abre_frente"):
            xv = spec["abre_frente"] * H / 1.73
            corta((xv, 0, 0), (1, 0, 0))
            corta((-xv, 0, 0), (1, 0, 0))
        # "frente": só a metade da frente (pela posição: na mesma altura, à frente do meio da peça)
        Vz = np.array([v.co[:] for v in bm.verts])
        caixas = {}
        if len(Vz):
            for k in np.unique(np.floor(Vz[:, 2] / 0.03)):
                sel = np.floor(Vz[:, 2] / 0.03) == k
                caixas[int(k)] = (Vz[sel, 1].min() + Vz[sel, 1].max()) / 2
        apagar = []
        for f in bm.faces:
            c = f.calc_center_median()
            ok = True
            if spec.get("frente") is not None:
                ok &= c.y < caixas.get(int(math.floor(c.z / 0.03)), 0.0)
            if spec.get("tras"):
                ok &= c.y > caixas.get(int(math.floor(c.z / 0.03)), 0.0)
            if spec.get("ombro_unico"):  # um ombro só: o outro lado vira tomara que caia (na altura da axila)
                lado = spec["ombro_unico"]
                ok &= not (c.x * lado < 0 and c.z > m["axila"] + 0.02)
            for fu in spec.get("furos", []):  # rasgados: buracos na frente das pernas (a pele aparece)
                zc_ = m[fu["marco"]] + fu.get("desloca", 0.0)
                r_ = fu.get("raio", 0.03) * H / 1.73
                if f.normal.y < -0.3 and abs(c.z - zc_) < r_ * 0.75:
                    perto = Vz[np.abs(Vz[:, 2] - zc_) < 0.02]
                    lado = perto[np.sign(perto[:, 0]) == np.sign(c.x)]
                    if len(lado):
                        cx_ = (lado[:, 0].min() + lado[:, 0].max()) / 2
                        ok &= ((c.x - cx_) / r_) ** 2 + ((c.z - zc_) / (r_ * 0.75)) ** 2 > 1
            if spec.get("faixa_x"):
                a_, b_ = spec["faixa_x"]
                ok &= a_ * H / 1.73 <= abs(c.x) <= b_ * H / 1.73
            if spec.get("faixas_x"):
                ok &= any(min(m[x0] + d0, m[x1] + d1) <= abs(c.x) <= max(m[x0] + d0, m[x1] + d1)
                          for x0, d0, x1, d1 in spec["faixas_x"])
            if spec.get("abre_frente"):
                ok &= not (abs(c.x) < spec["abre_frente"] * H / 1.73 and c.y < 0 and c.z > m["quadril"] - 0.3)
            if spec.get("faixas_z"):
                ok &= any(min(m[z0] + d0, m[z1] + d1) <= c.z <= max(m[z0] + d0, m[z1] + d1)
                          for z0, d0, z1, d1 in spec["faixas_z"])
            if not ok:
                apagar.append(f)
        bmesh.ops.delete(bm, geom=apagar, context="FACES_ONLY")
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
        lap_faces = []
        if spec.get("lapela") and spec.get("abre_frente"):  # lapela: a borda da abertura dobra para fora, larga em cima
            lp = spec["lapela"]
            xa = spec["abre_frente"] * H / 1.73
            z0, z1 = m["cintura"] + lp.get("desde", 0.04), m["pescoco"] - 0.005
            bm.normal_update()
            eds = [e for e in bm.edges if e.is_boundary and all(abs(v.co.x) < xa + 0.02 and v.co.y < 0 and z0 < v.co.z < z1
                                                               for v in e.verts)]
            if eds:
                ret = bmesh.ops.extrude_edge_only(bm, edges=eds)
                larg = lp.get("largura", 0.055) * H / 1.73
                for v in [x for x in ret["geom"] if isinstance(x, bmesh.types.BMVert)]:
                    t = min(max((v.co.z - z0) / (z1 - z0), 0), 1)
                    k = t ** 0.8 * (1 - max(t - 0.85, 0) / 0.15 * 0.6)  # larga em cima, estreita perto da gola
                    v.co.x += math.copysign(larg * k, v.co.x)
                    v.co.y -= 0.005
                lap_faces = [x for x in ret["geom"] if isinstance(x, bmesh.types.BMFace)]
                if lp.get("cor"):  # lapela de cetim (smoking)
                    for f in lap_faces:
                        f[lay_cor] = CORES_ATLAS.index(lp["cor"]) + 1
        # espessura nas bordas soltas
        bordas = [e for e in bm.edges if e.is_boundary]
        if bordas:
            ret = bmesh.ops.extrude_edge_only(bm, edges=bordas)
            bm.normal_update()
            for v in [x for x in ret["geom"] if isinstance(x, bmesh.types.BMVert)]:
                n = sum((f.normal for f in v.link_faces), Vector())
                if n.length:
                    v.co -= n.normalized() * 0.004
        bm.to_mesh(me)
        bm.free()
    if spec.get("gola"):  # gola: a borda do pescoço sobe (gola alta) e, com "dobra", vira para fora (polo, camisa)
        g = spec["gola"]
        bm = bmesh.new()
        bm.from_mesh(me)
        lay_cor = bm.faces.layers.int.get("cor") or bm.faces.layers.int.new("cor")  # antes de guardar as faces
        z_lim = m["axila"] + 0.6 * (m["pescoco"] - m["axila"])
        bordas = [e for e in bm.edges if e.is_boundary and all(v.co.z > z_lim for v in e.verts)
                  and all(abs(v.co.x) < m["ombro"] for v in e.verts)]
        if bordas:
            vs = {v for e in bordas for v in e.verts}
            cen = sum((v.co for v in vs), Vector()) / len(vs)
            h = g.get("altura", 0.03) * H / 1.73
            ret = bmesh.ops.extrude_edge_only(bm, edges=bordas)
            sobe = [x for x in ret["geom"] if isinstance(x, bmesh.types.BMVert)]
            for v in sobe:
                v.co.z += h
                r = Vector((v.co.x - cen.x, v.co.y - cen.y, 0))
                if r.length:
                    v.co += r.normalized() * 0.004
            gfs = [x for x in ret["geom"] if isinstance(x, bmesh.types.BMFace)]
            if g.get("dobra"):
                bordas2 = [e for e in ret["geom"] if isinstance(e, bmesh.types.BMEdge) and all(v in sobe for v in e.verts)]
                ret2 = bmesh.ops.extrude_edge_only(bm, edges=bordas2)
                for v in [x for x in ret2["geom"] if isinstance(x, bmesh.types.BMVert)]:
                    r = Vector((v.co.x - cen.x, v.co.y - cen.y, 0))
                    v.co.z -= h * g["dobra"]
                    if r.length:
                        v.co += r.normalized() * (g.get("aba", 0.012) * H / 1.73)
                gfs += [x for x in ret2["geom"] if isinstance(x, bmesh.types.BMFace)]
            cor_g = (spec.get("faixas_cor") or {}).get("gola") or g.get("cor")
            if cor_g:  # gola de outra cor (jaqueta de aviador, vestido de gola branca)
                for f in gfs:
                    if f.is_valid:
                        f[lay_cor] = CORES_ATLAS.index(cor_g) + 1
        bm.to_mesh(me)
        bm.free()
    for f in me.polygons:
        f.use_smooth = True
    _uv_corpo(ob, m, H, m["ombro"])
    me.materials.append(textura(spec.get("padrao", "liso")))
    _faixas_cor(ob, spec, m, H)
    return ob


def _faixas_cor(ob, spec, m, H):
    """Partes de outra cor, fixa (material de detalhe): gola (marcada ao fazer a gola), punhos e barra."""
    me = ob.data
    fc = spec.get("faixas_cor") or {}
    cores = np.zeros(len(me.polygons), int)
    if "cor" in me.attributes:
        me.attributes["cor"].data.foreach_get("value", cores)
    P = np.array([v.co[:] for v in me.vertices])
    C = np.array([p.center[:] for p in me.polygons]) if len(me.polygons) else np.zeros((0, 3))
    braco = (np.abs(C[:, 0]) > m["ombro"] * 1.05) & (C[:, 2] > m["quadril"] - 0.1)
    if fc.get("punhos"):
        larg = fc.get("largura_punho", 0.035) * H / 1.73
        xmax = np.abs(P[np.abs(P[:, 0]) > m["ombro"] * 1.05, 0]).max() if (np.abs(P[:, 0]) > m["ombro"] * 1.05).any() else 9
        cores[braco & (np.abs(C[:, 0]) > xmax - larg)] = CORES_ATLAS.index(fc["punhos"]) + 1
    if fc.get("barra"):
        larg = fc.get("largura_barra", 0.04) * H / 1.73
        corpo = ~braco
        zmin = C[corpo, 2].min() if corpo.any() else 0
        cores[corpo & (C[:, 2] < zmin + larg)] = CORES_ATLAS.index(fc["barra"]) + 1
    if not cores.any():
        return
    me.materials.append(textura("detalhe"))
    uvl = me.uv_layers.active.data
    for k, poly in enumerate(me.polygons):
        if cores[k]:
            poly.material_index = 1
            u, v = uv_atlas(CORES_ATLAS[cores[k] - 1])
            for li in poly.loop_indices:
                uvl[li].uv = (u, v)


def _pinta(ob, cor):
    """A peça inteira numa cor fixa do atlas de detalhe (alças, fivelas, partes de outra cor)."""
    me = ob.data
    me.materials.clear()
    me.materials.append(textura("detalhe"))
    uvl = me.uv_layers.active or me.uv_layers.new(name="UVMap")
    u, v = uv_atlas(cor)
    for d in uvl.data:
        d.uv = (u, v)
    for p in me.polygons:
        p.material_index = 0


def _junta(obs):
    """Junta as partes numa malha só, com um material de cada (o principal primeiro)."""
    nomes = []
    for o in obs:
        for mt in o.data.materials:
            if mt and mt.name not in nomes:
                nomes.append(mt.name)
    nomes.sort(key=lambda n: n == "Roupa_Gen_detalhe")
    for o in obs:  # cada parte passa a usar a mesma lista de materiais
        velhos = [mt.name if mt else None for mt in o.data.materials]
        idx = np.zeros(len(o.data.polygons), int)
        o.data.polygons.foreach_get("material_index", idx)
        o.data.materials.clear()
        for n in nomes:
            o.data.materials.append(bpy.data.materials[n])
        novo = np.array([nomes.index(velhos[i]) if i < len(velhos) and velhos[i] in nomes else 0 for i in idx], np.int32) \
            if len(idx) else idx
        o.data.polygons.foreach_set("material_index", novo)
    with bpy.context.temp_override(active_object=obs[0], selected_editable_objects=obs):
        bpy.ops.object.join()
    return obs[0]


def _anel_pescoco(S):
    """Centro (x, y), raio e altura da base do pescoço da malha S."""
    import roupas as R
    m = R._marcos(S)
    P = np.array([S.matrix_world @ v.co for v in S.data.vertices])
    w = _peso_vertices(S, ("Neck",))
    Q = P[(w > 0.4) & (np.abs(P[:, 2] - m["pescoco"]) < 0.03)]
    if len(Q) < 6:
        Q = P[w > 0.4]
    c = Q[:, :2].mean(0)
    return c, float(np.linalg.norm(Q[:, :2] - c, axis=1).mean()), m


def _capuz_caido(S, spec):
    """Capuz abaixado (moletom, capa de chuva) ou gola-almofada (salva-vidas): um rolo atrás do pescoço que desce pelos
    ombros. spec: espessura, altura, abre (graus de cada lado da frente sem o rolo)."""
    c, r, m = _anel_pescoco(S)
    H = m["altura"]
    esp = spec.get("espessura", 0.03) * H / 1.73
    alt = spec.get("altura", 0.07) * H / 1.73
    abre = math.radians(spec.get("abre", 70))
    bm = bmesh.new()
    nseg, nsec = 28, 10
    aneis = []
    for i in range(nseg + 1):
        a = -math.pi + abre + (2 * math.pi - 2 * abre) * i / nseg  # 0 = atrás (+y)
        t = abs(a) / (math.pi - abre)  # 0 atrás, 1 na frente
        d = np.array([math.sin(a), math.cos(a)])
        R0 = r + esp * 0.8 + 0.012 * H / 1.73 + 0.02 * H / 1.73 * t
        z0 = m["pescoco"] - 0.015 - 0.07 * H / 1.73 * t ** 1.5  # desce pelos ombros para a frente
        hh = alt * (1.0 - 0.45 * t)
        anel = []
        for k in range(nsec):
            th = 2 * math.pi * k / nsec
            rr = R0 + esp * math.cos(th)
            zz = z0 + hh * 0.5 * math.sin(th)
            anel.append(bm.verts.new((c[0] + d[0] * rr, c[1] + d[1] * rr, zz)))
        aneis.append(anel)
    for a_, b_ in zip(aneis, aneis[1:]):
        for k in range(nsec):
            bm.faces.new((a_[k], a_[(k + 1) % nsec], b_[(k + 1) % nsec], b_[k]))
    for an in (aneis[0], aneis[-1]):
        bm.faces.new(an)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new("capuz")
    bm.to_mesh(me)
    bm.free()
    for f in me.polygons:
        f.use_smooth = True
    ob = bpy.data.objects.new("capuz", me)
    bpy.context.scene.collection.objects.link(ob)
    _uv_corpo(ob, m, H, m["ombro"])
    me.materials.append(textura(spec.get("padrao", "liso")))
    return ob


def _fivela(S, spec):
    """Fivela (caixinha) na frente da cintura ou de uma alça. spec: marco, desloca, largura, altura, folga, cor."""
    import roupas as R
    m = R._marcos(S)
    H = m["altura"]
    z = m[spec.get("marco", "cintura")] + spec.get("desloca", 0.0)
    P = np.array([S.matrix_world @ v.co for v in S.data.vertices])
    for jan in (0.02, 0.04, 0.08, 0.16):  # malhas com poucos pontos na frente: janela maior
        fr = P[(np.abs(P[:, 2] - z) < jan) & (np.abs(P[:, 0] - spec.get("x", 0.0)) < jan * 1.5)]
        if len(fr):
            break
    y = fr[:, 1].min() - spec.get("folga", 0.03) * H / 1.73
    bm = bmesh.new()
    w, h, d = (spec.get("largura", 0.05) * H / 1.73, spec.get("altura", 0.04) * H / 1.73, 0.008)
    r = bmesh.ops.create_cube(bm, size=1.0)
    for v in r["verts"]:
        v.co = Vector((spec.get("x", 0.0) + v.co.x * w, y + v.co.y * d, z + v.co.z * h))
    me = bpy.data.meshes.new("fivela")
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("fivela", me)
    bpy.context.scene.collection.objects.link(ob)
    me.uv_layers.new(name="UVMap")
    me.materials.append(textura("detalhe"))
    return ob


# ------------------------------------------------------------------ chapéus (sobre a cabeça)
def _cabeca(S):
    import cabelos as CAB
    hmin, hmax = CAB.caixa_cabeca(S)
    P = np.array([S.matrix_world @ v.co for v in S.data.vertices])
    w = _peso_vertices(S, ("Head",))
    faces = [tuple(f.vertices) for f in S.data.polygons if min(w[i] for i in f.vertices) > 0.3]
    bvh = BVHTree.FromPolygons([tuple(p) for p in P], faces)
    return np.array(hmin), np.array(hmax), bvh


def _raio(bvh, c, d, padrao):
    hit = bvh.ray_cast(Vector(c) + Vector(d) * 0.4, -Vector(d), 0.4)
    return 0.4 - hit[3] if hit[0] is not None else padrao


def chapeu(S, spec):
    """Chapéu feito sobre a cabeça de S. Partes (spec): copa {folga, corte (0..1 da altura da cabeça), inclina (quanto
    a nuca desce), alt (escala da altura), cor}, aba {largura, frente, tras, caida, cor}, viseira {comprimento,
    abertura (graus), caida, cor}, faixa {altura, cor}, banda {altura, abre, cor} (parede reta: cozinheiro, quepe),
    topo {raio, cor} (disco do quepe), puff {altura, cor} (cozinheiro), pompom {raio, cor}, orelhas {cor} (gato),
    olhos {cor} (sapo), protetores {cor} (orelhas), enrolado {altura, cor} (barra dobrada da touca)."""
    if spec.get("boina") is not None:
        return _boina(S, spec)
    if spec.get("capuz") is not None:
        return _capuz(S, spec)
    hmin, hmax, bvh = _cabeca(S)
    c = (hmin + hmax) / 2
    Hc = hmax[2] - hmin[2]
    rx, ry = (hmax[0] - hmin[0]) / 2, (hmax[1] - hmin[1]) / 2
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    partes_cor = []  # (faces, cor)
    if spec.get("arco") is not None:
        ar = spec["arco"]
        larg = ar.get("largura", 0.1) * Hc
        fol = ar.get("folga", 0.01) * Hc / 0.27
        yfr = ar.get("frente", 0.15) * ry  # um pouco à frente do meio da cabeça
        tiras = []
        for lado in (-0.5, 0.5):
            linha = []
            for k in range(25):
                a = math.radians(-100 + 200 * k / 24)
                d = np.array([math.sin(a), 0.0, math.cos(a)])
                cc = c + np.array([0, -yfr + lado * larg, 0])
                r = _raio(bvh, cc, d, max(rx, ry))
                linha.append(bm.verts.new(cc + d * (r + fol)))
            tiras.append(linha)
        fs = []
        for k in range(24):
            fs.append(bm.faces.new((tiras[0][k], tiras[0][k + 1], tiras[1][k + 1], tiras[1][k])))
        if ar.get("babado"):  # babado: a frente da tiara sobe em ondas
            topo = [bm.verts.new(v.co + Vector((0, -0.2 * larg, 0)) + (v.co - Vector(c)).normalized() * larg * (0.6 + 0.4 * math.sin(k * 1.9)))
                    for k, v in enumerate(tiras[0])]
            for k in range(24):
                fs.append(bm.faces.new((tiras[0][k], topo[k], topo[k + 1], tiras[0][k + 1])))
        partes_cor.append((fs, ar.get("cor", "branco")))
        if ar.get("orelhas_longas"):  # orelhas de coelho em pé no arco
            ol = ar["orelhas_longas"]
            for sx in (-1, 1):
                a = math.radians(14 * sx)
                base_ = c + np.array([0, -yfr, 0]) + np.array([math.sin(a), 0, math.cos(a)]) * (
                    _raio(bvh, c + np.array([0, -yfr, 0]), np.array([math.sin(a), 0, math.cos(a)]), rx) + fol)
                for esc_r, cor_o, dy in ((1.0, ol.get("cor", ar.get("cor", "branco")), 0.0), (0.55, ol.get("dentro", "rosa"), -0.4)):
                    r_ = bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0)
                    for v in r_["verts"]:
                        q = Vector((v.co.x * 0.075 * Hc * esc_r, v.co.y * 0.03 * Hc * esc_r + dy * 0.03 * Hc,
                                    (v.co.z + 1) * 0.2 * Hc * (0.9 + 0.1 * esc_r)))
                        q = Vector((q.x * math.cos(a) + q.z * math.sin(a), q.y, -q.x * math.sin(a) + q.z * math.cos(a)))
                        v.co = Vector(base_) + q
                    partes_cor.append((list({f for v in r_["verts"] for f in v.link_faces}), cor_o))
    if spec.get("so_arco"):
        cp = None
    else:
        cp = spec.get("copa", {})
    if cp is None:
        for faces, cor in partes_cor:
            u, v = uv_atlas(cor)
            for f in faces:
                for lo in f.loops:
                    lo[uvl].uv = (u, v)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        me = bpy.data.meshes.new("chapeu")
        bm.to_mesh(me)
        bm.free()
        for f in me.polygons:
            f.use_smooth = True
        me.materials.append(textura("atlas"))
        ob = bpy.data.objects.new("chapeu", me)
        bpy.context.scene.collection.objects.link(ob)
        return ob
    folga = cp.get("folga", 0.012) * Hc / 0.27
    z_corte = hmin[2] + cp.get("corte", 0.55) * Hc
    inclina = cp.get("inclina", 0.12) * Hc
    alt = cp.get("alt", 1.0)
    nphi, nth = 48, 18
    # copa: anéis do topo para baixo, cada ponto à distância da cabeça (raio medido) mais a folga
    grade = []
    for i in range(nth + 1):
        th = (i / nth) * math.radians(150 if cp.get("capuz") else 118)  # o capuz desce até o pescoço
        anel = []
        for j in range(nphi):
            ph = 2 * math.pi * j / nphi
            d = np.array([math.sin(th) * math.sin(ph), -math.sin(th) * math.cos(ph), math.cos(th)])
            r = _raio(bvh, c, d, max(rx, ry))
            anel.append(c + d * (r + folga))
        grade.append(anel)
    G = np.array(grade)
    # suaviza os raios (a cabeça tem orelhas e nariz)
    for _ in range(3):
        G[1:-1] = 0.5 * G[1:-1] + 0.25 * (np.roll(G[1:-1], 1, axis=1) + np.roll(G[1:-1], -1, axis=1))
    # altura da copa e corte inclinado (frente mais alta que a nuca)
    acima = G[:, :, 2] > c[2]
    G[:, :, 2] = np.where(acima, c[2] + (G[:, :, 2] - c[2]) * alt, G[:, :, 2])
    if cp.get("vinco"):  # fedora: vinco no alto, de frente para trás, e a frente beliscada
        zt_ = G[:, :, 2].max()
        t_ = np.clip((G[:, :, 2] - (zt_ - 0.22 * Hc)) / (0.22 * Hc), 0, 1)
        G[:, :, 2] -= cp["vinco"] * Hc * np.exp(-((G[:, :, 0] - c[0]) / (0.22 * rx)) ** 2) * t_
        fr_ = np.clip((c[1] - G[:, :, 1]) / ry, 0, 1) * t_
        G[:, :, 0] = c[0] + (G[:, :, 0] - c[0]) * (1 - 0.18 * fr_)
    if cp.get("teto") is not None:  # boina: alto achatado, a copa vira um disco largo
        G[:, :, 2] = np.minimum(G[:, :, 2], hmax[2] + cp["teto"] * Hc)
    if cp.get("ponta"):  # chapéu pontudo: afina para cima até uma ponta (um pouco caída para trás)
        zt_ = G[:, :, 2].max()
        t_ = np.clip((G[:, :, 2] - (hmax[2] - 0.1 * Hc)) / max(zt_ - (hmax[2] - 0.1 * Hc), 1e-6), 0, 1)
        k_ = 1 - 0.95 * t_ ** 0.7
        G[:, :, 0] = c[0] + (G[:, :, 0] - c[0]) * k_
        G[:, :, 1] = c[1] + (G[:, :, 1] - c[1]) * k_ + cp["ponta"] * Hc * t_ ** 2
    fi = np.array([2 * math.pi * j / nphi for j in range(nphi)])
    zc = z_corte - inclina * (1 + np.cos(fi)) / 2 * -1 + inclina * 0  # frente (fi=0) em z_corte, nuca mais baixa
    zc = z_corte - inclina * (1 - np.cos(fi)) / 2
    verts = []
    for i in range(nth + 1):
        linha = []
        for j in range(nphi):
            p = G[i, j].copy()
            if p[2] < zc[j]:
                # desce até o corte pela linha do meridiano
                p[2] = zc[j]
            linha.append(bm.verts.new(p))
        verts.append(linha)
    copa_f = []
    for i in range(nth):
        for j in range(nphi):
            a, b_ = verts[i][j], verts[i][(j + 1) % nphi]
            cc, d = verts[i + 1][(j + 1) % nphi], verts[i + 1][j]
            if len({a, b_, cc, d}) == 4:
                try:
                    copa_f.append(bm.faces.new((a, d, cc, b_)))
                except ValueError:
                    pass
    if cp.get("capuz"):  # capuz: a frente do rosto aberta
        abertos = [f for f in copa_f if f.calc_center_median().y < c[1] - ry * 0.15
                   and f.calc_center_median().z < hmax[2] - 0.12 * Hc]
        bmesh.ops.delete(bm, geom=abertos, context="FACES_ONLY")
        copa_f = [f for f in copa_f if f.is_valid]
    partes_cor.append((copa_f, cp.get("cor", "branco")))
    borda = verts[-1]
    centro_b = sum((v.co for v in borda), Vector()) / nphi

    def anel_extra(base, desloc_fn, cor):
        novos = [bm.verts.new(desloc_fn(j, v.co.copy())) for j, v in enumerate(base)]
        fs = []
        for j in range(len(base)):
            k = (j + 1) % len(base)
            try:
                fs.append(bm.faces.new((base[j], novos[j], novos[k], base[k])))
            except ValueError:
                pass
        partes_cor.append((fs, cor))
        return novos

    def radial(p):
        r = Vector((p.x - centro_b.x, p.y - centro_b.y, 0))
        return r.normalized() if r.length > 1e-6 else Vector((1, 0, 0))
    if spec.get("enrolado") is not None:
        e = spec["enrolado"]
        h = e.get("altura", 0.18) * Hc
        b1 = anel_extra(borda, lambda j, p: p + radial(p) * 0.012 * Hc / 0.27, e.get("cor", "branco"))
        b2 = anel_extra(b1, lambda j, p: p + Vector((0, 0, h)), e.get("cor", "branco"))
        anel_extra(b2, lambda j, p: p - radial(p) * 0.012 * Hc / 0.27, e.get("cor", "branco"))
    if spec.get("banda") is not None:
        bd = spec["banda"]
        h = bd.get("altura", 0.4) * Hc
        abre = bd.get("abre", 1.0)
        # a banda sobe reta a partir do corte (substitui a copa, que fica escondida dentro)
        npt = bd.get("pontas", 0)  # coroa: o alto da banda em pontas

        def onda(j):
            if not npt:
                return 0.0
            f = (j * npt / nphi) % 1
            return h * 0.7 * (1 - abs(2 * f - 1))
        topo_banda = anel_extra(borda, lambda j, p: centro_b + (p - centro_b) * abre + Vector((0, 0, h + onda(j) + (zc.max() - p.z))),
                                bd.get("cor", "branco"))
        borda_sup = topo_banda
        if spec.get("topo") is not None:
            tp = spec["topo"]
            larga = anel_extra(borda_sup, lambda j, p: centro_b.copy() + (p - centro_b) * tp.get("raio", 1.25) * Vector((1, 1, 0))
                               + Vector((0, 0, p.z - centro_b.z + 0.01 * Hc / 0.27)), tp.get("cor", "branco"))
            ct = sum((v.co for v in larga), Vector()) / len(larga) + Vector((0, 0, 0.004))
            vc = bm.verts.new(ct)
            fs = []
            for j in range(len(larga)):
                try:
                    fs.append(bm.faces.new((larga[j], larga[(j + 1) % len(larga)], vc)))
                except ValueError:
                    pass
            partes_cor.append((fs, tp.get("cor", "branco")))
        elif spec.get("puff") is not None:
            pf = spec["puff"]
            hp = pf.get("altura", 0.6) * Hc
            ultimo = borda_sup
            for k in range(1, 7):
                t = k / 6
                esc = 1.0 + 0.35 * math.sin(math.pi * min(t * 1.1, 1.0)) - 0.5 * t ** 3
                ultimo = anel_extra(ultimo, lambda j, p, t=t, esc=esc: centro_b + (borda_sup[j].co - centro_b) * Vector((esc, esc, 0))
                                    + Vector((0, 0, borda_sup[j].co.z - centro_b.z + hp * t)), pf.get("cor", "branco"))
            ct = sum((v.co for v in ultimo), Vector()) / len(ultimo) + Vector((0, 0, 0.01))
            vc = bm.verts.new(ct)
            fs = []
            for j in range(len(ultimo)):
                try:
                    fs.append(bm.faces.new((ultimo[j], ultimo[(j + 1) % len(ultimo)], vc)))
                except ValueError:
                    pass
            partes_cor.append((fs, pf.get("cor", "branco")))
    if spec.get("faixa") is not None:
        fx = spec["faixa"]
        h = fx.get("altura", 0.12) * Hc
        f1 = anel_extra(borda, lambda j, p: p + radial(p) * 0.004, fx.get("cor", "preto"))
        anel_extra(f1, lambda j, p: p + Vector((0, 0, h)) - radial(p) * 0.004 * 0, fx.get("cor", "preto"))
    if spec.get("aba") is not None:
        ab = spec["aba"]
        larg = ab.get("largura", 0.35) * Hc

        def aba(j, p):
            ph = fi[j]
            k = ab.get("frente", 1.0) * (1 + math.cos(ph)) / 2 + ab.get("tras", 1.0) * (1 - math.cos(ph)) / 2
            lado = abs(math.sin(ph))  # caubói: os lados da aba sobem
            tras = (1 - math.cos(ph)) / 2  # fedora: a aba sobe atrás
            onda = math.sin(ph * ab.get("n_ondas", 5)) * ab.get("ondas", 0.0)  # chapéu de praia: aba ondulada
            return p + radial(p) * larg * k - Vector((0, 0, (ab.get("caida", 0.0) - ab.get("sobe_lados", 0.0) * lado ** 2
                                                            - ab.get("sobe_tras", 0.0) * tras ** 2 - onda) * larg * k))
        b1 = anel_extra(borda, aba, ab.get("cor", "branco"))
        anel_extra(b1, lambda j, p: p - Vector((0, 0, 0.006)), ab.get("cor", "branco"))
    if spec.get("viseira") is not None:
        vs = spec["viseira"]
        comp = vs.get("comprimento", 0.45) * Hc
        abert = math.radians(vs.get("abertura", 75))
        desl = math.pi if vs.get("atras") else 0.0  # boné virado para trás
        frente = [j for j in range(nphi) if math.cos(fi[j] - desl) > math.cos(abert)]
        frente.sort(key=lambda j: (fi[j] - desl + math.pi) % (2 * math.pi))
        base = [borda[j] for j in frente]
        novos = []
        for j in frente:
            p = borda[j].co.copy()
            k = max(0.0, (math.cos(fi[j] - desl) - math.cos(abert)) / (1 - math.cos(abert))) ** 0.6
            novos.append(bm.verts.new(p + radial(p) * comp * (0.25 + 0.75 * k) - Vector((0, 0, vs.get("caida", 0.15) * comp * k))))
        fs = []
        for a in range(len(base) - 1):
            try:
                fs.append(bm.faces.new((base[a], novos[a], novos[a + 1], base[a + 1])))
            except ValueError:
                pass
        baixo = [bm.verts.new(v.co - Vector((0, 0, 0.006))) for v in novos]
        for a in range(len(novos) - 1):
            try:
                fs.append(bm.faces.new((novos[a], baixo[a], baixo[a + 1], novos[a + 1])))
            except ValueError:
                pass
        partes_cor.append((fs, vs.get("cor", "branco")))

    def esfera(centro, raio, cor, esc=(1, 1, 1)):
        r = bmesh.ops.create_icosphere(bm, subdivisions=2, radius=raio)
        for v in r["verts"]:
            v.co = Vector(centro) + Vector((v.co.x * esc[0], v.co.y * esc[1], v.co.z * esc[2]))
        partes_cor.append((list({f for v in r["verts"] for f in v.link_faces}), cor))
    topo_z = max(v.co.z for v in bm.verts)
    if spec.get("pompom") is not None:
        esfera((c[0], c[1], topo_z + spec["pompom"].get("raio", 0.18) * Hc * 0.7), spec["pompom"].get("raio", 0.18) * Hc,
               spec["pompom"].get("cor", "branco"))
    if spec.get("orelhas") is not None:
        for s in (-1, 1):
            # base dentro da copa e a ponta bem acima dela, um pouco para fora
            r = bmesh.ops.create_cone(bm, cap_ends=True, segments=12, radius1=0.17 * Hc, radius2=0.015 * Hc, depth=0.36 * Hc)
            for v in r["verts"]:
                q = Vector((v.co.x + s * v.co.z * 0.25, v.co.y * 0.55, v.co.z))
                v.co = Vector((c[0] + s * rx * 0.62, c[1], topo_z - 0.08 * Hc + 0.18 * Hc)) + q
            partes_cor.append((list({f for v in r["verts"] for f in v.link_faces}), spec["orelhas"].get("cor", "branco")))
    if spec.get("orelhas_redondas") is not None:  # touca de urso
        o_ = spec["orelhas_redondas"]
        for sx in (-1, 1):
            esfera((c[0] + sx * rx * 0.68, c[1] + ry * 0.05, topo_z - 0.06 * Hc), o_.get("raio", 0.15) * Hc,
                   o_.get("cor", "branco"), esc=(1, 0.42, 1))
            if o_.get("dentro"):
                esfera((c[0] + sx * rx * 0.68, c[1] - ry * 0.03, topo_z - 0.07 * Hc), o_.get("raio", 0.15) * Hc * 0.6,
                       o_["dentro"], esc=(1, 0.3, 1))
    if spec.get("olhos") is not None:
        for s in (-1, 1):
            p0 = (c[0] + s * rx * 0.42, c[1] - ry * 0.45, topo_z + 0.02 * Hc)
            esfera(p0, 0.17 * Hc, "creme")
            esfera((p0[0], p0[1] - 0.15 * Hc, p0[2] + 0.02 * Hc), 0.075 * Hc, "preto")
    if spec.get("protetores") is not None:
        for s in (-1, 1):
            esfera((c[0] + s * (rx + 0.03 * Hc), c[1] + ry * 0.05, hmin[2] + 0.42 * Hc), 0.2 * Hc,
                   spec["protetores"].get("cor", "vermelho"), esc=(0.45, 1, 1))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    for faces, cor in partes_cor:
        u, v = uv_atlas(cor)
        for f in faces:
            if f.is_valid:
                for lo in f.loops:
                    lo[uvl].uv = (u, v)
    me = bpy.data.meshes.new("chapeu")
    bm.to_mesh(me)
    bm.free()
    for f in me.polygons:
        f.use_smooth = True
    me.materials.append(textura("atlas"))
    ob = bpy.data.objects.new("chapeu", me)
    bpy.context.scene.collection.objects.link(ob)
    return ob



def _objeto_atlas(bm, uvl, partes_cor, nome="chapeu", material="atlas"):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    for faces, cor in partes_cor:
        u, v = uv_atlas(cor)
        for f in faces:
            if f.is_valid:
                for lo in f.loops:
                    lo[uvl].uv = (u, v)
    me = bpy.data.meshes.new(nome)
    bm.to_mesh(me)
    bm.free()
    for f in me.polygons:
        f.use_smooth = True
    me.materials.append(textura(material))
    if any(c_ != partes_cor[0][1] for _, c_ in partes_cor) and material == "atlas":
        pass
    ob = bpy.data.objects.new(nome, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def _boina(S, spec):
    """Boina: faixa justa na cabeça, corpo estufado mais largo que a cabeça, alto achatado caído para um lado e um
    pininho no centro. spec["boina"]: corte, folga, largura, alt, lado (graus), cor; "pino": False sem o pininho."""
    hmin, hmax, bvh = _cabeca(S)
    c = (hmin + hmax) / 2
    Hc = hmax[2] - hmin[2]
    rx, ry = (hmax[0] - hmin[0]) / 2, (hmax[1] - hmin[1]) / 2
    b = spec["boina"]
    folga = b.get("folga", 0.008) * Hc / 0.27
    zb = hmin[2] + b.get("corte", 0.6) * Hc
    nphi = 48
    fi = [2 * math.pi * j / nphi for j in range(nphi)]
    base = np.array([_raio(bvh, (c[0], c[1], zb), (math.sin(p), -math.cos(p), 0), max(rx, ry)) + folga for p in fi])
    for _ in range(3):
        base = 0.5 * base + 0.25 * (np.roll(base, 1) + np.roll(base, -1))
    L, A = b.get("largura", 1.0), b.get("alt", 1.0)
    perfil = [(0.985, -0.01), (1.0, 0.0), (1.05, 0.035), (1.0 + 0.24 * L, 0.10), (1.0 + 0.36 * L, 0.165),
              (1.0 + 0.36 * L, 0.215), (1.0 + 0.2 * L, 0.262), (0.88, 0.292), (0.5, 0.31), (0.0, 0.316)]
    lado = math.radians(b.get("lado", 12))
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    aneis = []
    for fr, fz in perfil:
        t = max(fz, 0) / 0.316
        ang = lado * t ** 1.2
        anel = []
        for j, p in enumerate(fi):
            x = math.sin(p) * base[j] * fr
            y = -math.cos(p) * base[j] * fr
            z = fz * Hc * A
            x, z = x * math.cos(ang) + z * math.sin(ang), -x * math.sin(ang) + z * math.cos(ang)  # cai para o lado
            anel.append(Vector((c[0] + x + 0.06 * rx * t, c[1] + y, zb + z)))
        if fr == 0.0:
            aneis.append([bm.verts.new(sum(anel, Vector()) / nphi)])
        else:
            aneis.append([bm.verts.new(q) for q in anel])
    fs = []
    for a_, b_ in zip(aneis, aneis[1:]):
        for j in range(nphi):
            k = (j + 1) % nphi
            if len(b_) == 1:
                fs.append(bm.faces.new((a_[j], a_[k], b_[0])))
            else:
                fs.append(bm.faces.new((a_[j], a_[k], b_[k], b_[j])))
    partes = [(fs, b.get("cor", "branco"))]
    if b.get("pino", True):
        topo = aneis[-1][0].co
        r_ = bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=0.022 * Hc, radius2=0.012 * Hc, depth=0.06 * Hc)
        for v in r_["verts"]:
            v.co = topo + Vector((v.co.x, v.co.y, v.co.z + 0.02 * Hc))
        partes.append((list({f for v in r_["verts"] for f in v.link_faces}), b.get("cor", "branco")))
    return _objeto_atlas(bm, uvl, partes)


def _capuz(S, spec):
    """Capuz levantado: envolve a cabeça com folga, faz uma pontinha atrás no alto, desce sobre a nuca e os ombros,
    com a abertura do rosto oval e uma borda dobrada (mais grossa). spec["capuz"]: folga, cor, borda (cor da borda)."""
    hmin, hmax, bvh = _cabeca(S)
    c = (hmin + hmax) / 2
    Hc = hmax[2] - hmin[2]
    rx, ry = (hmax[0] - hmin[0]) / 2, (hmax[1] - hmin[1]) / 2
    cz = spec["capuz"]
    folga = cz.get("folga", 0.04) * Hc / 0.27
    nphi, nth = 48, 26
    G = np.zeros((nth + 1, nphi, 3))
    for i in range(nth + 1):
        th = math.radians(165) * i / nth
        for j in range(nphi):
            ph = 2 * math.pi * j / nphi
            d = np.array([math.sin(th) * math.sin(ph), -math.sin(th) * math.cos(ph), math.cos(th)])
            G[i, j] = c + d * (_raio(bvh, c, d, max(rx, ry)) + folga)
    for _ in range(4):
        G[1:-1] = 0.5 * G[1:-1] + 0.25 * (np.roll(G[1:-1], 1, axis=1) + np.roll(G[1:-1], -1, axis=1))
        G[1:-1] = 0.5 * G[1:-1] + 0.25 * (G[:-2] + G[2:])
    # abaixo do queixo, o tecido cai solto e abre sobre os ombros
    z_q = hmin[2] + 0.22 * Hc
    t = np.clip((z_q - G[:, :, 2]) / (0.5 * Hc), 0, 1)
    rad = G[:, :, :2] - c[:2]
    G[:, :, :2] = c[:2] + rad * (1 + 0.9 * t[:, :, None] ** 1.3)
    G[:, :, 2] -= 0.15 * Hc * t
    # pontinha atrás no alto
    atr = np.clip((G[:, :, 1] - c[1]) / ry, 0, 1) * np.clip((G[:, :, 2] - c[2]) / (0.5 * Hc), 0, 1)
    G[:, :, 1] += 0.09 * Hc * atr ** 2
    G[:, :, 2] += 0.03 * Hc * atr ** 2
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    V = [[bm.verts.new(G[i, j]) for j in range(nphi)] for i in range(nth + 1)]
    fs = []
    zr = hmin[2] + 0.45 * Hc
    for i in range(nth):
        for j in range(nphi):
            k = (j + 1) % nphi
            q = [V[i][j], V[i][k], V[i + 1][k], V[i + 1][j]]
            if len(set(q)) < 4:
                continue
            m_ = sum((v.co for v in q), Vector()) / 4
            frente = m_.y < c[1]
            rosto = ((m_.x - c[0]) / (rx * 0.74)) ** 2 + ((m_.z - zr) / (0.47 * Hc)) ** 2 < 1
            queixo = m_.z < hmin[2] + 0.15 * Hc and abs(m_.x - c[0]) < rx * 0.72 and m_.y < c[1] - 0.3 * ry
            if frente and (rosto or queixo):
                continue
            try:
                fs.append(bm.faces.new((q[0], q[3], q[2], q[1])))
            except ValueError:
                pass
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    # espessura: a borda dobra para dentro e a do rosto fica mais grossa
    bm.normal_update()
    bordas = [e for e in bm.edges if e.is_boundary]
    ret = bmesh.ops.extrude_edge_only(bm, edges=bordas)
    novos = [x for x in ret["geom"] if isinstance(x, bmesh.types.BMVert)]
    for v in novos:
        d = Vector((v.co.x - c[0], v.co.y - c[1], v.co.z - c[2]))
        rosto = v.co.y < c[1] and v.co.z > hmin[2]
        v.co -= d.normalized() * (0.012 if rosto else 0.005) * Hc / 0.27
    fs += [x for x in ret["geom"] if isinstance(x, bmesh.types.BMFace)]
    return _objeto_atlas(bm, uvl, [(fs, cz.get("cor", "branco"))])


# ------------------------------------------------------------------ óculos (sobre o rosto)
def _malha_duas_cores(bm, uvl, principal, detalhe, nome):
    """bm com faces marcadas no índice de material 0 (cor principal, atlas: a cor livre pinta) e 1 (detalhe, fixo).
    principal/detalhe: listas de (faces, cor)."""
    for faces, cor in principal + detalhe:
        u, v = uv_atlas(cor)
        for f in faces:
            if f.is_valid:
                for lo in f.loops:
                    lo[uvl].uv = (u, v)
    for faces, _ in detalhe:
        for f in faces:
            if f.is_valid:
                f.material_index = 1
    me = bpy.data.meshes.new(nome)
    bm.to_mesh(me)
    bm.free()
    for f in me.polygons:
        f.use_smooth = True
    me.materials.append(textura("atlas"))
    me.materials.append(textura("detalhe"))
    ob = bpy.data.objects.new(nome, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def _tubo_fechado(bm, pts, esp, normal_plano=None, fechado=True):
    """Tubo de seção quadrada ao longo de pts (lista de Vector). Devolve as faces."""
    n = len(pts)
    aneis = []
    for i in range(n):
        a, b = pts[(i - 1) % n if fechado else max(i - 1, 0)], pts[(i + 1) % n if fechado else min(i + 1, n - 1)]
        t = (b - a).normalized()
        up = normal_plano if normal_plano is not None else Vector((0, 0, 1))
        s_ = t.cross(up)
        if s_.length < 1e-6:
            s_ = t.cross(Vector((1, 0, 0)))
        s_.normalize()
        u_ = s_.cross(t).normalized()
        aneis.append([bm.verts.new(pts[i] + (s_ * dx + u_ * dy) * esp / 2) for dx, dy in ((1, 1), (-1, 1), (-1, -1), (1, -1))])
    fs = []
    for i in range(n if fechado else n - 1):
        a_, b_ = aneis[i], aneis[(i + 1) % n]
        for k in range(4):
            fs.append(bm.faces.new((a_[k], a_[(k + 1) % 4], b_[(k + 1) % 4], b_[k])))
    if not fechado:
        fs.append(bm.faces.new(aneis[0][::-1]))
        fs.append(bm.faces.new(aneis[-1]))
    return fs


def oculos(S, spec):
    """Óculos feitos no rosto de S: duas lentes (redondo, quadrado, gatinho, aviador) ou uma viseira esportiva, ponte e
    hastes até as orelhas. spec: forma, altura (dos olhos, 0..1 da cabeça), tamanho, armacao (cor), lente (cor ou
    [esq, dir]; None: sem lente), esp (espessura)."""
    hmin, hmax, bvh = _cabeca(S)
    c = (hmin + hmax) / 2
    Hc = hmax[2] - hmin[2]
    rx, ry = (hmax[0] - hmin[0]) / 2, (hmax[1] - hmin[1]) / 2
    W = 2 * rx
    ze = hmin[2] + spec.get("altura", 0.47) * Hc
    k = Hc / 0.27
    rl = spec.get("tamanho", 1.0) * 0.135 * W
    dx = 0.21 * W

    def frente(x, z):
        hit = bvh.ray_cast(Vector((x, c[1] - 0.5, z)), Vector((0, 1, 0)), 1.0)
        return hit[0].y if hit[0] is not None else hmin[1]
    yf = min(frente(c[0] - dx, ze), frente(c[0] + dx, ze), frente(c[0], ze + 0.02 * Hc)) - spec.get("afasta", 0.012) * k
    esp = spec.get("esp", 0.0045) * k
    forma = spec.get("forma", "redondo")
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    arm_f, lentes = [], []
    lente = spec.get("lente")
    cores_l = lente if isinstance(lente, list) else [lente, lente]

    def contorno(sx):
        pts = []
        for i in range(36):
            a = 2 * math.pi * i / 36
            x, z = math.cos(a), math.sin(a)
            if forma == "quadrado":
                e = 4.0
                x = math.copysign(abs(math.cos(a)) ** (2 / e), math.cos(a)) * 1.1
                z = math.copysign(abs(math.sin(a)) ** (2 / e), math.sin(a)) * 0.82
            elif forma == "gatinho":
                z *= 0.8
                if z > 0 and x * sx > 0:
                    z += 0.35 * (x * sx) ** 2 * z / 0.8
                x *= 1.12
            elif forma == "aviador":
                z = z * 0.9 if z > 0 else z * 1.15
                x = x * (1.05 - 0.15 * (z < 0) * abs(z))
            px, pz = c[0] + sx * dx + x * rl, ze + z * rl
            pts.append(Vector((px, yf + 0.004 * k * (abs(px - c[0]) / W) ** 2 * 6, pz)))
        return pts
    if forma == "viseira":  # uma lente só, curva, de lado a lado
        cima, baixo = [], []
        for i in range(25):
            t = -1 + 2 * i / 24
            x = c[0] + t * (dx + rl * 1.15)
            yv = min(frente(x, ze), frente(c[0], ze)) - 0.012 * k + (t ** 2) * 0.03 * k
            ht = rl * (0.95 - 0.25 * t ** 2)
            cima.append(Vector((x, yv, ze + ht * 0.8)))
            baixo.append(Vector((x, yv, ze - ht)))
        vs_c, vs_b = [bm.verts.new(p) for p in cima], [bm.verts.new(p) for p in baixo]
        lf = [bm.faces.new((vs_c[i], vs_c[i + 1], vs_b[i + 1], vs_b[i])) for i in range(24)]
        lentes.append((lf, cores_l[0] or "azul"))
        arm_f += _tubo_fechado(bm, cima, esp, fechado=False)
        ext = [cima[0], cima[-1]]
    else:
        ext = []
        for lado, sx in enumerate((-1, 1)):
            pts = contorno(sx)
            arm_f += _tubo_fechado(bm, pts, esp, normal_plano=Vector((0, 1, 0)))
            if cores_l[lado]:
                cen = bm.verts.new(sum(pts, Vector()) / len(pts) + Vector((0, 0.002 * k, 0)))
                vs = [bm.verts.new(p + Vector((0, 0.002 * k, 0))) for p in pts]
                lentes.append(([bm.faces.new((vs[i], vs[(i + 1) % len(vs)], cen)) for i in range(len(vs))], cores_l[lado]))
            ext.append(max(pts, key=lambda p: sx * (p.x - c[0])) + Vector((0, 0, rl * 0.35)))
        # ponte: arco entre as lentes, rente ao nariz
        yb = frente(c[0], ze + 0.03 * Hc) - 0.004 * k
        ponte = [Vector((c[0] + t * (dx - rl * 0.95), min(yf, yb), ze + rl * 0.35 + rl * 0.25 * (1 - t * t)))
                 for t in np.linspace(-1, 1, 7)]
        arm_f += _tubo_fechado(bm, ponte, esp * 0.8, fechado=False)
    # hastes: dos cantos de fora até as orelhas, com a pontinha descendo atrás delas
    for p0 in ext:
        sx = 1 if p0.x > c[0] else -1
        xo = c[0] + sx * (rx + 0.004 * k)
        ye = c[1] + 0.12 * ry
        pts = [p0, Vector((xo, p0.y + 0.25 * (ye - p0.y), p0.z)), Vector((xo, ye, p0.z - 0.01 * k)),
               Vector((xo - sx * 0.004 * k, ye + 0.15 * ry, p0.z - 0.06 * Hc))]
        arm_f += _tubo_fechado(bm, pts, esp * 0.9, fechado=False)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return _malha_duas_cores(bm, uvl, [(arm_f, spec.get("armacao", "preto"))], lentes, "oculos")


# ------------------------------------------------------------------ objetos de mão
# Feitos no referencial da mão, em unidades do tamanho da mão (s = distância do punho até a base do dedo médio):
# x ao longo dos dedos (para baixo com o braço solto), z para o lado da palma, y = z × x. Origem: a base do dedo médio.
# No corpo: ponto = base do dedo médio + s·(x·X + y·Y + z·Z), preso ao osso da mão (a página e o jogo fazem igual).
def _bm_prim(bm, tipo, centro, tam, rot=None, seg=16):
    if tipo == "caixa":
        r = bmesh.ops.create_cube(bm, size=1.0)
        vs = r["verts"]
        for v in vs:
            v.co = Vector((v.co.x * tam[0], v.co.y * tam[1], v.co.z * tam[2]))
    elif tipo == "cilindro":  # eixo x
        r = bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=tam[1], radius2=tam[2] if len(tam) > 2 else tam[1],
                                  depth=tam[0])
        vs = r["verts"]
        for v in vs:
            v.co = Vector((v.co.z, v.co.x, v.co.y))
    elif tipo == "esfera":
        r = bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0)
        vs = r["verts"]
        for v in vs:
            v.co = Vector((v.co.x * tam[0], v.co.y * tam[1], v.co.z * tam[2]))
    elif tipo == "toro":  # alça: meio anel no plano xz (tam: raio, espessura, fração da volta)
        vs = []
        n, m_ = 18, 8
        fr = tam[2] if len(tam) > 2 else 0.5
        an = []
        for i in range(n + 1):
            a = math.pi * (1 - fr) + 2 * math.pi * fr * i / n
            cc = Vector((-math.sin(a) * tam[0], 0, math.cos(a) * tam[0]))
            dd = cc.normalized()
            an.append([bm.verts.new(cc + dd * math.cos(2 * math.pi * k / m_) * tam[1] + Vector((0, math.sin(2 * math.pi * k / m_) * tam[1], 0)))
                       for k in range(m_)])
        for a_, b_ in zip(an, an[1:]):
            for k in range(m_):
                bm.faces.new((a_[k], a_[(k + 1) % m_], b_[(k + 1) % m_], b_[k]))
        vs = [v for a_ in an for v in a_]
    if rot:
        from mathutils import Euler
        R_ = Euler(rot).to_matrix()
        for v in vs:
            v.co = R_ @ v.co
    for v in vs:
        v.co += Vector(centro)
    return list({f for v in vs for f in v.link_faces})


OBJETOS = {}


def _objeto(nome):
    def reg(fn):
        OBJETOS[nome] = fn
        return fn
    return reg


@_objeto("bolsa")
def _o_bolsa(bm, cor):
    p = _bm_prim(bm, "caixa", (2.0, 0, 0.5), (1.9, 2.6, 0.95))
    a = _bm_prim(bm, "toro", (0.55, 0, 0.5), (0.75, 0.07, 0.5), rot=(0, math.pi / 2, 0))
    a2 = _bm_prim(bm, "toro", (0.55, 0, 0.5), (0.75, 0.07, 0.5), rot=(0, math.pi / 2, math.pi))
    f = _bm_prim(bm, "caixa", (1.25, 0, 0.0), (0.18, 0.5, 0.06))
    return [(p, cor)], [(a + a2, "marrom"), (f, "dourado")]


@_objeto("maleta")
def _o_maleta(bm, cor):
    p = _bm_prim(bm, "caixa", (2.4, 0, 0.3), (2.6, 3.6, 0.85))
    a = _bm_prim(bm, "toro", (1.0, 0, 0.3), (0.45, 0.09, 0.5), rot=(0, math.pi / 2, 0))
    t = [_bm_prim(bm, "caixa", (1.15, sy * 0.9, 0.3), (0.14, 0.3, 0.9)) for sy in (-1, 1)]
    return [(p, cor)], [(a, "preto"), (t[0] + t[1], "prata")]


@_objeto("mala_rodinha")
def _o_mala(bm, cor):
    p = _bm_prim(bm, "caixa", (6.2, 0, 1.4), (4.6, 1.8, 3.2))
    hastes = [_bm_prim(bm, "cilindro", (2.2, 0, 1.4 + dz), (3.6, 0.08), seg=8) for dz in (-0.45, 0.45)]
    pega = _bm_prim(bm, "cilindro", (0.35, 0, 1.4), (0.25, 0.14), rot=(0, 0, 0), seg=10)
    pega = _bm_prim(bm, "caixa", (0.35, 0, 1.4), (0.22, 0.25, 1.1))
    rod = [_bm_prim(bm, "esfera", (8.6, sy * 0.6, 1.4 + dz), (0.25, 0.25, 0.25)) for sy in (-1, 1) for dz in (-1.2, 1.2)]
    fr = [_bm_prim(bm, "caixa", (6.2, 0.95, 1.4 + dz), (4.4, 0.06, 0.12)) for dz in (-0.8, 0.8)]
    return [(p, cor)], [(sum(hastes, []) + pega, "cinza_escuro"), (sum(rod, []), "preto"), (sum(fr, []), "cinza")]


@_objeto("sacolas")
def _o_sacolas(bm, cor):
    a = _bm_prim(bm, "caixa", (2.2, -0.35, 0.6), (2.6, 2.0, 0.8))
    b = _bm_prim(bm, "caixa", (2.4, 0.45, 1.2), (2.4, 1.7, 0.7), rot=(0, 0, 0.12))
    al = _bm_prim(bm, "toro", (0.75, -0.35, 0.6), (0.6, 0.05, 0.5), rot=(0, math.pi / 2, 0))
    bl = _bm_prim(bm, "toro", (0.95, 0.45, 1.2), (0.55, 0.05, 0.5), rot=(0, math.pi / 2, 0))
    return [(a, cor)], [(b, "azul"), (al + bl, "preto")]


@_objeto("sacola_papel")
def _o_sacola_papel(bm, cor):
    s_ = _bm_prim(bm, "caixa", (1.5, 0, 1.0), (2.6, 2.2, 1.4))
    pao = _bm_prim(bm, "cilindro", (-0.4, 0.5, 1.0), (1.8, 0.28), rot=(0, 0, 0.35), seg=10)
    folhas = _bm_prim(bm, "cone" if False else "esfera", (-0.1, -0.5, 1.0), (0.6, 0.45, 0.45))
    cen = _bm_prim(bm, "cilindro", (-0.5, -0.1, 0.8), (1.2, 0.18, 0.02), rot=(0, 0, -0.25), seg=8)
    return [(s_, cor)], [(pao, "bege"), (folhas, "verde"), (cen, "laranja")]


@_objeto("guarda_chuva")
def _o_guarda_chuva(bm, cor):
    cabo = _bm_prim(bm, "toro", (0.2, 0, 0.55), (0.45, 0.1, 0.5), rot=(0, 0, 0))
    haste = _bm_prim(bm, "cilindro", (3.2, 0, 0.1), (6.0, 0.07), seg=8)
    pano = _bm_prim(bm, "cilindro", (4.4, 0, 0.1), (3.8, 0.12, 0.42), seg=12)
    ponta = _bm_prim(bm, "cilindro", (6.4, 0, 0.1), (0.4, 0.07, 0.02), seg=8)
    return [(pano, cor)], [(cabo, "marrom"), (haste + ponta, "cinza_escuro")]


@_objeto("bengala")
def _o_bengala(bm, cor):
    cabo = _bm_prim(bm, "toro", (0.1, 0.0, 0.5), (0.45, 0.11, 0.5))
    haste = _bm_prim(bm, "cilindro", (4.6, 0, 0.05), (9.0, 0.1), seg=10)
    pe = _bm_prim(bm, "cilindro", (9.1, 0, 0.05), (0.25, 0.13), seg=10)
    return [(cabo + haste, cor)], [(pe, "preto")]


@_objeto("livro")
def _o_livro(bm, cor):
    capa = _bm_prim(bm, "caixa", (0.7, 0, 0.45), (2.2, 1.6, 0.34))
    folhas = _bm_prim(bm, "caixa", (0.7, -0.05, 0.45), (2.1, 1.52, 0.27))
    return [(capa, cor)], [(folhas, "creme")]


@_objeto("camera")
def _o_camera(bm, cor):
    corpo = _bm_prim(bm, "caixa", (0.3, 0.2, 0.55), (1.0, 1.6, 0.6))
    lente = _bm_prim(bm, "cilindro", (0.3, 0.2, 1.05), (0.55, 0.38), rot=(0, math.pi / 2, 0), seg=16)
    vidro = _bm_prim(bm, "cilindro", (0.3, 0.2, 1.33), (0.04, 0.3), rot=(0, math.pi / 2, 0), seg=16)
    flash = _bm_prim(bm, "caixa", (-0.25, -0.35, 0.55), (0.2, 0.4, 0.4))
    return [(corpo, cor)], [(lente + flash, "cinza_escuro"), (vidro, "azul_escuro")]


@_objeto("buque")
def _o_buque(bm, cor):
    papel = _bm_prim(bm, "cilindro", (-0.6, 0, 0.45), (2.6, 0.8, 0.12), seg=14)
    flores = []
    import random
    rnd = random.Random(3)
    for i in range(9):
        a = 2 * math.pi * i / 9
        rr = 0.45 if i else 0.0
        flores.append(_bm_prim(bm, "esfera", (-2.0 - rnd.uniform(0, 0.25), math.cos(a) * rr, 0.45 + math.sin(a) * rr),
                               (0.32, 0.32, 0.32)))
    folhas = [_bm_prim(bm, "esfera", (-1.8, math.cos(a) * 0.7, 0.45 + math.sin(a) * 0.7), (0.3, 0.12, 0.2), rot=(a, 0, 0))
              for a in np.linspace(0, 2 * math.pi, 6, endpoint=False)]
    return [(papel, cor)], [(sum(flores[::2], []), "vermelho"), (sum(flores[1::2], []), "rosa"), (sum(folhas, []), "verde")]


@_objeto("microfone")
def _o_microfone(bm, cor):
    cabo = _bm_prim(bm, "cilindro", (0.0, 0, 0.45), (1.9, 0.16, 0.22), seg=12)
    bola = _bm_prim(bm, "esfera", (-1.15, 0, 0.45), (0.36, 0.36, 0.36))
    return [(cabo, cor)], [(bola, "prata")]


@_objeto("sorvete")
def _o_sorvete(bm, cor):
    casq = _bm_prim(bm, "cilindro", (0.3, 0, 0.5), (1.6, 0.04, 0.42), seg=12)
    b1 = _bm_prim(bm, "esfera", (-0.65, 0, 0.5), (0.48, 0.48, 0.48))
    b2 = _bm_prim(bm, "esfera", (-1.3, 0, 0.5), (0.42, 0.42, 0.42))
    return [(b1, cor)], [(casq, "bege"), (b2, "creme")]


@_objeto("picole")
def _o_picole(bm, cor):
    pal = _bm_prim(bm, "caixa", (0.3, 0, 0.5), (1.0, 0.25, 0.06))
    gelo = _bm_prim(bm, "caixa", (-0.8, 0, 0.5), (1.4, 0.7, 0.3))
    return [(gelo, cor)], [(pal, "bege")]


@_objeto("cafe")
def _o_cafe(bm, cor):
    copo = _bm_prim(bm, "cilindro", (0.0, 0, 0.55), (1.45, 0.42, 0.52), seg=16)
    tampa = _bm_prim(bm, "cilindro", (-0.78, 0, 0.55), (0.14, 0.56), seg=16)
    cinta = _bm_prim(bm, "cilindro", (0.05, 0, 0.55), (0.6, 0.5), seg=16)
    return [(copo, cor)], [(tampa, "marrom"), (cinta, "bege")]


@_objeto("celular")
def _o_celular(bm, cor):
    c_ = _bm_prim(bm, "caixa", (0.1, 0, 0.35), (1.6, 0.8, 0.09))
    tela = _bm_prim(bm, "caixa", (0.1, 0, 0.3), (1.45, 0.7, 0.02))
    return [(c_, cor)], [(tela, "azul_escuro")]


def objeto(spec):
    """Objeto de mão, no referencial da mão (unidades: o tamanho da mão). spec: objeto, cor, esc."""
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    pri, det = OBJETOS[spec["objeto"]](bm, spec.get("cor", "branco"))
    esc = spec.get("esc", 1.0)
    for v in bm.verts:
        v.co *= esc
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return _malha_duas_cores(bm, uvl, pri, det, "objeto")


def referencial_mao(arm, lado):
    """Origem, eixos (X ao longo dos dedos, Y, Z para a palma) e tamanho da mão, no mundo, na pose de descanso."""
    L = "Right" if lado == "dir" else "Left"
    bones = arm.data.bones
    pos = lambda n: arm.matrix_world @ bones[n].head_local
    Hd, M1, I1, P1 = pos(f"{L}Hand"), pos(f"{L}HandMiddle1"), pos(f"{L}HandIndex1"), pos(f"{L}HandPinky1")
    X = (M1 - Hd).normalized()
    t = I1 - P1
    Z = (t.cross(X) if lado == "dir" else X.cross(t)).normalized()  # para o lado da palma
    Y = Z.cross(X).normalized()
    return M1, X, Y, Z, (M1 - Hd).length
