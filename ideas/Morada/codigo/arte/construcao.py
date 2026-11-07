"""Biblioteca de construção: o chão (placa de 4 × 4 m) e as peças de parede modulares, feitas aqui com as imagens da
vitrine de pisos, paredes e cômodos como norte. Texturas em construcao_texturas.py.

Medidas (a grade é de 0,5 m; o chão de 4 m recebe duas paredes de 2 m ou uma de 4 m em cada lado):
  - altura da parede 3 m, espessura 0,15 m (centrada na linha da grade), mureta 1 m;
  - porta 0,9 × 2,1 m; porta dupla 1,6 × 2,1 m; passagem 1,2 × 2,3 m; arco 1,2 m (2,4 m no alto); janela padrão
    1,2 × 1,1 m com peitoril a 0,9 m.
Cada parede tem três materiais: "face_a" (o lado de dentro, +y antes de girar), "face_b" (o lado de fora, −y) e "borda"
(o alto, as pontas e o recorte dos vãos: branco, como um acabamento de gesso). Cada face recebe qualquer textura (ou
cor) da biblioteca. O UV é em metros: textura de parede = 3 × 3 m (u = posição ao longo da parede, v = altura), sem
espelhar no lado de fora; chão = 2 × 2 m. A origem da peça é a ponta esquerda, no chão, no meio da espessura: a peça
vai de x = 0 a x = comprimento.
Encaixes dos pacotes (Natal): o batente de porta e as janelas entram nos vãos que têm o tamanho deles
(veja ENCAIXES), escalados para caber.

Uso: blender-venv/bin/python -I construcao.py -- <saida> [--render]
"""
import json
import math
import os
import sys

import bpy
import bmesh
from mathutils import Matrix, Vector

AQUI = os.path.dirname(os.path.abspath(__file__))
PACOTES = os.path.join(os.path.dirname(AQUI), "ideias")
ALT = 3.0
ESP = 0.15
MURETA = 1.0
CHAO = 4.0
ESC_PISO, ESC_PAREDE = 2.0, 3.0

# vãos: (tipo, centro x a partir da ponta esquerda, largura, peitoril, altura) — tipo "ret", "arco" (alto em
# semicírculo) ou "arco_janela" (janela com o alto arredondado)
PECAS = [
    # lisas
    dict(id="parede_4m", rotulo="Parede lisa 4 m", grupo="lisa", comp=4.0),
    dict(id="parede_2m", rotulo="Parede lisa 2 m", grupo="lisa", comp=2.0),
    dict(id="parede_1m", rotulo="Parede lisa 1 m", grupo="lisa", comp=1.0),
    dict(id="parede_0_5m", rotulo="Inserto estreito 0,5 m", grupo="insercao", comp=0.5),
    dict(id="parede_0_25m", rotulo="Painel de ajuste 0,25 m", grupo="insercao", comp=0.25),
    dict(id="pilar", rotulo="Pilar de canto", grupo="insercao", comp=ESP, pilar=True),
    dict(id="mureta_2m", rotulo="Mureta 2 m", grupo="lisa", comp=2.0, alt=MURETA),
    dict(id="mureta_1m", rotulo="Mureta 1 m", grupo="lisa", comp=1.0, alt=MURETA),
    # portas e passagens
    dict(id="porta_2m", rotulo="Parede com porta 2 m", grupo="porta", comp=2.0, vaos=[("ret", 1.0, 0.9, 0.0, 2.1)]),
    dict(id="porta_lateral_2m", rotulo="Porta no canto 2 m", grupo="porta", comp=2.0, vaos=[("ret", 0.65, 0.9, 0.0, 2.1)]),
    dict(id="porta_1m", rotulo="Porta 1 m", grupo="porta", comp=1.0, vaos=[("ret", 0.5, 0.9, 0.0, 2.1)]),
    dict(id="porta_dupla_2m", rotulo="Porta dupla 2 m", grupo="porta", comp=2.0, vaos=[("ret", 1.0, 1.6, 0.0, 2.1)]),
    dict(id="passagem_2m", rotulo="Passagem 2 m", grupo="porta", comp=2.0, vaos=[("ret", 1.0, 1.2, 0.0, 2.3)]),
    dict(id="arco_2m", rotulo="Arco 2 m", grupo="arco", comp=2.0, vaos=[("arco", 1.0, 1.2, 0.0, 2.4)]),
    dict(id="arco_largo_4m", rotulo="Arco largo 4 m", grupo="arco", comp=4.0, vaos=[("arco", 2.0, 2.4, 0.0, 2.6)]),
    # janelas
    dict(id="janela_2m", rotulo="Parede com janela 2 m", grupo="janela", comp=2.0, vaos=[("ret", 1.0, 1.2, 0.9, 1.1)]),
    dict(id="janela_larga_2m", rotulo="Janela larga 2 m", grupo="janela", comp=2.0, vaos=[("ret", 1.0, 1.6, 1.1, 0.8)]),
    dict(id="janela_arco_2m", rotulo="Janela em arco 2 m", grupo="janela", comp=2.0, vaos=[("arco_janela", 1.0, 0.8, 1.0, 1.2)]),
    dict(id="janela_quadrada_1m", rotulo="Janela quadrada 1 m", grupo="janela", comp=1.0, vaos=[("ret", 0.5, 0.6, 1.2, 0.6)]),
    dict(id="janela_dupla_4m", rotulo="Duas janelas 4 m", grupo="janela", comp=4.0,
         vaos=[("ret", 1.0, 1.2, 0.9, 1.1), ("ret", 3.0, 1.2, 0.9, 1.1)]),
]
# encaixes dos pacotes (uso interno): a peça do pacote vai para o vão, centrada e escalada até a largura e a altura dele
ENCAIXES = [
    dict(id="porta_arco_natal", rotulo="Porta em arco (Natal)", arquivo="Doorway_001.fbx", vao=("arco_2m", 0)),
    dict(id="janela_arco_natal", rotulo="Janela em arco (Natal)", arquivo="Window_001.fbx", vao=("janela_arco_2m", 0)),
    dict(id="janela_quadrada_natal", rotulo="Janela quadrada (Natal)", arquivo="Window_003.fbx", vao=("janela_2m", 0)),
    dict(id="janela_redonda_natal", rotulo="Janela redonda (Natal)", arquivo="Window_002.fbx", vao=("janela_quadrada_1m", 0)),
]


def material(nome, cor=(1, 1, 1), rug=0.7, imagem=None):
    m = bpy.data.materials.get(nome) or bpy.data.materials.new(nome)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes.get("Principled BSDF")
    b.inputs["Roughness"].default_value = rug
    if imagem:
        tx = nt.nodes.new("ShaderNodeTexImage")
        tx.image = bpy.data.images.load(imagem, check_existing=True)
        nt.links.new(tx.outputs["Color"], b.inputs["Base Color"])
    else:
        b.inputs["Base Color"].default_value = (*cor, 1)
    return m


def _perfil_vao(tipo, cx, larg, peit, alt, seg=32):
    """Contorno do vão no plano xz, em sentido anti-horário."""
    x0, x1, z0, z1 = cx - larg / 2, cx + larg / 2, peit, peit + alt
    if tipo == "ret":
        return [(x0, z0), (x1, z0), (x1, z1), (x0, z1)]
    r = larg / 2
    zc = z1 - r
    pts = [(x0, z0), (x1, z0), (x1, zc)]
    for k in range(1, seg):
        a = math.pi * k / seg
        pts.append((cx + r * math.cos(a), zc + r * math.sin(a)))
    pts.append((x0, zc))
    return pts


def parede(p):
    """Malha da parede: as duas faces com os vãos (polígono com furos, triangulado), as bordas e o recorte dos vãos."""
    comp, alt = p["comp"], p.get("alt", ALT)
    vaos = [_perfil_vao(*v) for v in p.get("vaos", [])]
    bm = bmesh.new()
    lay_mat = []
    if p.get("pilar"):
        # cantoneira: 1 cm mais larga que a parede de cada lado e 4 mm mais alta (faces no mesmo plano que as da
        # parede dão sombra preta no render), cantos levemente chanfrados; centrada na origem
        lado = ESP + 0.02
        r_ = bmesh.ops.create_cube(bm, size=1.0)
        for v in r_["verts"]:
            v.co = Vector((v.co.x * lado, v.co.y * lado, (v.co.z + 0.5) * (alt + 0.004)))
        bmesh.ops.bevel(bm, geom=[e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) > 0.5], offset=0.008,
                        segments=2, affect="EDGES")
        for f in bm.faces:
            f.material_index = 2
        return bm
    # contorno externo; os vãos que tocam o chão abrem o contorno (porta): o polígono vira um "U" invertido
    externo = [(0.0, 0.0), (comp, 0.0), (comp, alt), (0.0, alt)]
    import mathutils.geometry as G
    contornos = [externo] + vaos
    # triangulação 2D com furos (as portas tocam a borda de baixo: tratadas recortando o contorno externo)
    furos_chao = [v for v in vaos if abs(min(z for _, z in v)) < 1e-6]
    furos = [v for v in vaos if v not in furos_chao]
    if furos_chao:
        # o contorno externo passa por baixo de cada porta: sobe pelo batente, contorna o alto, desce
        furos_chao.sort(key=lambda v: min(x for x, _ in v))
        ext = [(0.0, 0.0)]
        for v in furos_chao:
            x0 = min(x for x, _ in v)
            x1 = max(x for x, _ in v)
            ext.append((x0, 0.0))
            # o contorno do vão (anti-horário) começa em (x0,0),(x1,0)...; percorre de trás para a frente: x0 → topo → x1
            resto = v[2:] + []  # (x1,z1/zc) ... (x0, ...)
            caminho = [pt for pt in reversed(v[1:])]  # (x0,top..)->...->(x1,0)
            # caminho: começa no último ponto do contorno (x0, z alto) e termina em (x1, 0)
            ext += caminho[:-1] + [(x1, 0.0)]
        ext += [(comp, 0.0), (comp, alt), (0.0, alt)]
        externo = ext
    # polígono com furos: tessellate_polygon aceita listas de contornos (o primeiro externo, os outros furos)
    loops = [[Vector((x, z, 0)) for x, z in externo]] + [[Vector((x, z, 0)) for x, z in v] for v in furos]
    tris = G.tessellate_polygon(loops)
    pts2 = [pt for loop in loops for pt in loop]
    for lado, y, mat in ((+1, ESP / 2, 0), (-1, -ESP / 2, 1)):
        vs = [bm.verts.new((pt.x, y, pt.y)) for pt in pts2]
        for t in tris:
            a, b, c = (vs[i] for i in t)
            try:
                f = bm.faces.new((a, b, c) if lado > 0 else (a, c, b))
                f.material_index = mat
            except ValueError:
                pass
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-6)
    # bordas: extrusão de cada contorno entre as duas faces (alto, pontas, recorte dos vãos)
    for loop in [externo] + furos:
        n = len(loop)
        for k in range(n):
            (xa, za), (xb, zb) = loop[k], loop[(k + 1) % n]
            if abs(za) < 1e-6 and abs(zb) < 1e-6:
                continue  # sem borda embaixo (fica no chão)
            if loop is externo and abs(xa - xb) < 1e-6 and (abs(xa) < 1e-6 or abs(xa - comp) < 1e-6):
                # ponta da peça (onde ela encosta na vizinha): duas metades com o material da face do mesmo lado e o
                # mesmo UV dela. Na emenda, a fresta de um pixel entre as duas peças mostra a mesma cor da face (antes
                # aparecia o branco da ponta, uma linha pontilhada clara); numa ponta solta a cantoneira cobre
                for s_, mat_ in ((1, 0), (-1, 1)):
                    qq = [bm.verts.new((xa, 0.0, za)), bm.verts.new((xb, 0.0, zb)),
                          bm.verts.new((xb, s_ * ESP / 2, zb)), bm.verts.new((xa, s_ * ESP / 2, za))]
                    f = bm.faces.new(qq)
                    f.material_index = mat_
                continue
            q = [bm.verts.new((xa, ESP / 2, za)), bm.verts.new((xb, ESP / 2, zb)),
                 bm.verts.new((xb, -ESP / 2, zb)), bm.verts.new((xa, -ESP / 2, za))]
            f = bm.faces.new(q)
            f.material_index = 2
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


LAMBRI_ALT = 0.85


def lambri(comp, alt=LAMBRI_ALT):
    """Lambri (painel de madeira pintado de branco na parte de baixo da parede de dentro): ripas verticais de 10 cm
    com um sulco entre elas, rodapé embaixo e um friso arredondado em cima. 2,5 cm de espessura, encostado na face
    da parede (y de 0 a 0,025 a partir da face); vai de x = 0 a comp."""
    bm = bmesh.new()
    e = 0.025
    n = max(1, int(round(comp / 0.1)))
    larg = comp / n
    for k in range(n):  # ripas com o canto chanfrado (o sulco aparece entre elas)
        r_ = bmesh.ops.create_cube(bm, size=1.0)
        for v in r_["verts"]:
            v.co = Vector((k * larg + (v.co.x + 0.5) * larg, (v.co.y + 0.5) * e * 0.8, 0.1 + (v.co.z + 0.5) * (alt - 0.16)))
        bmesh.ops.bevel(bm, geom=[ed for ed in r_["verts"][0].link_edges[:0]] or
                        list({ed for v in r_["verts"] for ed in v.link_edges if abs(ed.verts[0].co.z - ed.verts[1].co.z) > 0.3
                              and min(ed.verts[0].co.y, ed.verts[1].co.y) > e * 0.4}), offset=0.004, segments=1, affect="EDGES")
    r_ = bmesh.ops.create_cube(bm, size=1.0)  # rodapé
    for v in r_["verts"]:
        v.co = Vector(((v.co.x + 0.5) * comp, (v.co.y + 0.5) * e * 1.3, (v.co.z + 0.5) * 0.1))
    r_ = bmesh.ops.create_cone(bm, cap_ends=True, segments=12, radius1=e * 0.75, radius2=e * 0.75, depth=comp)  # friso
    rot = Matrix.Rotation(math.radians(90), 4, "Y")
    for v in r_["verts"]:
        v.co = Vector((comp / 2, e * 0.55, alt - 0.03)) + (rot @ v.co.to_4d()).to_3d()
    for f in bm.faces:
        f.material_index = 0
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def uv_metros(bm, esc):
    """UV em metros: faces da parede (normal em y) = (x ou −x, z) / esc; bordas: (comprimento, espessura)."""
    uvl = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal
        for lo in f.loops:
            c = lo.vert.co
            if abs(n.y) > 0.5:
                u = c.x if n.y < 0 else -c.x  # do lado de fora (−y) lê da esquerda para a direita
                lo[uvl].uv = (u / esc, c.z / esc)
            elif f.material_index in (0, 1):  # ponta da peça com o material da face: o mesmo UV da face naquela ponta
                lo[uvl].uv = ((-c.x if f.material_index == 0 else c.x) / esc, c.z / esc)
            elif abs(n.z) > 0.5:
                lo[uvl].uv = (c.x / esc, c.y / esc)
            else:
                lo[uvl].uv = ((c.x + c.z) / esc, c.y / esc)


def objeto(nome, bm, mats):
    me = bpy.data.meshes.new(nome)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    ob = bpy.data.objects.new(nome, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def chao():
    """Placa de 4 × 4 m, 4 cm de espessura: o topo (material "piso") em z = 0, as laterais e o fundo em "borda"."""
    bm = bmesh.new()
    r_ = bmesh.ops.create_cube(bm, size=1.0)
    for v in r_["verts"]:
        v.co = Vector(((v.co.x + 0.5) * CHAO, (v.co.y + 0.5) * CHAO, (v.co.z - 0.5) * 0.04))
    # o topo em 8 × 8 (para curvar luz e sombra direito e não ser uma face gigante)
    topo = [f for f in bm.faces if f.normal.z > 0.9]
    bmesh.ops.subdivide_edges(bm, edges=list({e for f in topo for e in f.edges}), cuts=7, use_grid_fill=True)
    bm.normal_update()
    for f in bm.faces:
        f.material_index = 0 if f.normal.z > 0.9 and f.calc_center_median().z > -0.001 else 1
    uvl = bm.loops.layers.uv.verify()
    for f in bm.faces:
        for lo in f.loops:
            c = lo.vert.co
            lo[uvl].uv = (c.x / ESC_PISO, c.y / ESC_PISO)
    return bm


def importa_encaixe(arquivo):
    import glob
    f = sorted(glob.glob(os.path.join(PACOTES, "**", arquivo), recursive=True))
    if not f:
        return None
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=f[0])
    novos = [o for o in bpy.data.objects if o not in antes and o.type == "MESH"]
    for o in [o for o in bpy.data.objects if o not in antes and o.type != "MESH"]:
        bpy.data.objects.remove(o, do_unlink=True)
    if not novos:
        return None
    if len(novos) > 1:
        with bpy.context.temp_override(active_object=novos[0], selected_editable_objects=novos):
            bpy.ops.object.join()
    ob = novos[0]
    ob.parent = None
    bpy.context.view_layer.update()
    ob.data.transform(ob.matrix_world)
    ob.matrix_world = Matrix.Identity(4)
    return ob


def encaixa(enc, pecas_por_id):
    """Põe a peça do pacote no vão: centrada no vão, a largura e a altura do vão (pela caixa da peça), espessura
    proporcional (no mínimo a da parede)."""
    p = pecas_por_id[enc["vao"][0]]
    tipo, cx, larg, peit, alt = p["vaos"][enc["vao"][1]]
    ob = importa_encaixe(enc["arquivo"])
    if ob is None:
        return None
    pts = [v.co for v in ob.data.vertices]
    lo = Vector([min(q[i] for q in pts) for i in range(3)])
    hi = Vector([max(q[i] for q in pts) for i in range(3)])
    tam = hi - lo
    # o pacote tem o batente por fora do vão (moldura): a moldura passa um pouco da borda do vão
    # a moldura do pacote é arredondada: passa 15 cm do vão de cada lado para cobrir os cantos retos do recorte
    folga = 0.30 if tipo == "ret" else 0.16
    sx = (larg + folga) / tam.x
    sz = (alt + (folga if peit > 0 else folga / 2)) / tam.z
    sy = max(ESP * 1.3 / tam.y, min(sx, sz) * 0.8)
    c = (lo + hi) / 2
    M = Matrix.Translation((cx, 0, peit + alt / 2 - (0.02 if peit == 0 else 0))) @ Matrix.Diagonal((sx, sy, sz, 1)) @ Matrix.Translation(-c)
    if peit == 0:  # porta: o pé no chão
        M = Matrix.Translation((cx, 0, 0)) @ Matrix.Diagonal((sx, sy, sz, 1)) @ Matrix.Translation((-c.x, -c.y, -lo.z))
    ob.data.transform(M)
    ob.name = enc["id"]
    return ob


def exporta(ob, caminho):
    for o in bpy.context.scene.objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.export_scene.gltf(filepath=caminho, export_format="GLB", use_selection=True, export_extras=True,
                              export_apply=True)


def main():
    a = sys.argv[sys.argv.index("--") + 1:]
    saida = a[0]
    os.makedirs(os.path.join(saida, "pecas"), exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    tex = os.path.join(saida, "texturas")
    m_a = material("face_a", imagem=os.path.join(tex, "degrade_gelo.png") if os.path.exists(os.path.join(tex, "degrade_gelo.png")) else None)
    m_b = material("face_b", imagem=os.path.join(tex, "tijolo_terracota.png") if os.path.exists(os.path.join(tex, "tijolo_terracota.png")) else None)
    m_borda = material("borda", (0.93, 0.93, 0.92), 0.6)
    m_piso = material("piso", imagem=os.path.join(tex, "madeira_pinus.png") if os.path.exists(os.path.join(tex, "madeira_pinus.png")) else None)
    catalogo = {"altura": ALT, "espessura": ESP, "mureta": MURETA, "chao": CHAO, "grade": 0.5,
                "escala_textura": {"piso": ESC_PISO, "parede": ESC_PAREDE}, "chaos": [], "paredes": [], "encaixes": []}
    # chão
    ob = objeto("chao_4m", chao(), [m_piso, m_borda])
    exporta(ob, os.path.join(saida, "pecas", "chao_4m.glb"))
    catalogo["chaos"].append({"id": "chao_4m", "rotulo": "Chão 4 × 4 m", "tam": [CHAO, CHAO], "arquivo": "pecas/chao_4m.glb",
                              "materiais": ["piso", "borda"]})
    obs = {"chao_4m": ob}
    for p in PECAS:
        bm = parede(p)
        uv_metros(bm, ESC_PAREDE)
        ob = objeto(p["id"], bm, [m_a, m_b, m_borda])
        exporta(ob, os.path.join(saida, "pecas", p["id"] + ".glb"))
        obs[p["id"]] = ob
        catalogo["paredes"].append({"id": p["id"], "rotulo": p["rotulo"], "grupo": p["grupo"],
                                    "comp": ESP + 0.02 if p.get("pilar") else p["comp"], "centrada": bool(p.get("pilar")),
                                    "alt": p.get("alt", ALT), "arquivo": f"pecas/{p['id']}.glb",
                                    "vaos": [dict(zip(("tipo", "cx", "larg", "peitoril", "alt"), v)) for v in p.get("vaos", [])],
                                    "materiais": ["face_a", "face_b", "borda"]})
        print("peca", p["id"], len(ob.data.vertices), flush=True)
    catalogo["lambris"] = []
    m_lambri = material("lambri", (0.95, 0.95, 0.94), 0.55)
    for c_ in (0.5, 1.0, 2.0, 4.0):
        nid = "lambri_" + ("%gm" % c_).replace(".", "_")
        bm = lambri(c_)
        uv_metros(bm, ESC_PAREDE)
        ob = objeto(nid, bm, [m_lambri])
        for f_ in ob.data.polygons:
            f_.use_smooth = False
        exporta(ob, os.path.join(saida, "pecas", nid + ".glb"))
        obs[nid] = ob
        catalogo["lambris"].append({"id": nid, "rotulo": "Lambri %s m" % ("%g" % c_).replace(".", ","), "comp": c_,
                                    "alt": LAMBRI_ALT, "arquivo": f"pecas/{nid}.glb", "materiais": ["lambri"]})
        print("lambri", nid, flush=True)
    por_id = {p["id"]: p for p in PECAS}
    for enc in ENCAIXES:
        ob = encaixa(enc, por_id)
        if ob is None:
            print("sem encaixe", enc["id"])
            continue
        exporta(ob, os.path.join(saida, "pecas", enc["id"] + ".glb"))
        obs[enc["id"]] = ob
        catalogo["encaixes"].append({"id": enc["id"], "rotulo": enc["rotulo"], "vao": {"peca": enc["vao"][0], "indice": enc["vao"][1]},
                                     "arquivo": f"pecas/{enc['id']}.glb", "pacote": True})
        print("encaixe", enc["id"], flush=True)
    json.dump(catalogo, open(os.path.join(saida, "construcao.json"), "w"), ensure_ascii=False, indent=1)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(saida, "construcao.blend"), compress=True)
    print("fim", len(catalogo["paredes"]), "paredes", len(catalogo["encaixes"]), "encaixes")


if __name__ == "__main__":
    main()
