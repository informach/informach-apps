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
    if nome == "atlas":
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
    t.interpolation = "Closest" if nome == "atlas" else "Linear"
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
        obs = [R._saia_gerada(S, {**p["saia"], "padrao": base_.get("padrao", "liso")}, None)[0] if "saia" in p
               else camada(S, {**base_, **p}) for p in spec["partes"]]
        with bpy.context.temp_override(active_object=obs[0], selected_editable_objects=obs):
            bpy.ops.object.join()
        ob = obs[0]
        while len(ob.data.materials) > 1:  # todas com o mesmo material
            ob.data.materials.pop()
        for f in ob.data.polygons:
            f.material_index = 0
        return ob
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
    for v in bm.verts:
        v.co += v.normal * folga
    me = bpy.data.meshes.new("camada")
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("camada", me)
    bpy.context.scene.collection.objects.link(ob)
    if spec.get("cortes"):
        R._corta(ob, S, spec["cortes"], bainha=spec.get("bainha", 0.004))
    # recortes que não são planos de marco: só a frente, faixas em x (gravata, alças), faixas de altura
    if spec.get("frente") is not None or spec.get("faixa_x") or spec.get("faixas_z") or spec.get("faixas_x") \
            or spec.get("abre_frente"):
        bm = bmesh.new()
        bm.from_mesh(me)
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
            if g.get("dobra"):
                bordas2 = [e for e in ret["geom"] if isinstance(e, bmesh.types.BMEdge) and all(v in sobe for v in e.verts)]
                ret2 = bmesh.ops.extrude_edge_only(bm, edges=bordas2)
                for v in [x for x in ret2["geom"] if isinstance(x, bmesh.types.BMVert)]:
                    r = Vector((v.co.x - cen.x, v.co.y - cen.y, 0))
                    v.co.z -= h * g["dobra"]
                    if r.length:
                        v.co += r.normalized() * (0.012 * H / 1.73)
        bm.to_mesh(me)
        bm.free()
    for f in me.polygons:
        f.use_smooth = True
    _uv_corpo(ob, m, H, m["ombro"])
    me.materials.append(textura(spec.get("padrao", "liso")))
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
            return p + radial(p) * larg * k - Vector((0, 0, (ab.get("caida", 0.0) - ab.get("sobe_lados", 0.0) * lado ** 2) * larg * k))
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
