"""Base comum dos móveis do Morada: tudo o que os geradores de cada categoria usam.

Convenções (valem para todas as peças):
- Metros, Z para cima. A frente do móvel olha para −Y (no glTF, +Z). O fundo encosta na parede em +Y.
- Origem: no chão, no meio da largura e da profundidade (fixacao "chao"). Peças de parede (quadro, espelho, coifa,
  armário alto, prateleira) têm a origem no meio da largura, no plano da parede (y = 0, o corpo vai para −Y) e na base
  da peça; a altura sugerida de instalação vai no catálogo. Objetos pequenos (fixacao "apoio") ficam com a origem na
  base, no centro.
- Cores: um atlas único de 16 × 16 células (paleta_moveis.png). Cada face aponta o UV para o centro de uma célula, então
  todos os móveis usam o mesmo material "atlas" e a mesma textura minúscula. Materiais à parte só para vidro, espelho,
  luz (emissão) e estampas (quadros, tapetes, capas de livro).
- Interativos: cada porta e cada gaveta é um objeto filho da peça, com a origem na dobradiça (porta) ou na frente
  (gaveta). Os dados vão nos "extras" do glTF, já nos eixos do glTF (Y para cima):
    porta:  {"interativo": "porta", "eixo": [x, y, z], "angulo": radianos}
    gaveta: {"interativo": "gaveta", "direcao": [x, y, z], "curso": metros}
  Gaveta é uma caixa de verdade (fundo e quatro lados, aberta em cima) e o corpo dos armários é oco, com prateleiras.
- Slots: vazios "slot_<nome>" marcam onde se pode pôr coisas dentro (prateleira, gaveta, geladeira). Ficam no catálogo
  com centro e tamanho, e o de gaveta é filho da gaveta (anda com ela).
- Colisão: caixas (AABB) no catálogo. Por padrão, uma caixa com o corpo inteiro; o gerador pode passar caixas próprias.

Uso típico (num gerador de categoria, rodando com blender-venv/bin/python -I):
    import moveis_base as mb
    cat = mb.Catalogo("criados", SAIDA)
    it = mb.Item("criado_bola_rosa")
    it.add(mb.caixa(0.5, 0.4, 0.5, z=0.1, cor="rosa"))
    it.gaveta([mb.frente(...)], ...)
    cat.exporta(it, rotulo="Criado-mudo rosa", grupo="classico")
    cat.salva()
"""
import json
import math
import os

import bpy
import bmesh
from mathutils import Matrix, Vector

V = Vector
AQUI = os.path.dirname(os.path.abspath(__file__))

# ---------------------------------------------------------------------------------------------------------------------
# Paleta
# ---------------------------------------------------------------------------------------------------------------------
CORES = {
    # neutros
    "branco": "#F7F7F4", "branco_gelo": "#ECF0F4", "porcelana": "#F2F5F8", "porcelana_azul": "#DCEAF4",
    "creme_claro": "#FBF2DC", "creme": "#F5E5BC", "bege": "#E6CDA2", "bege_escuro": "#C9AA7C", "areia": "#D8C097",
    "cinza_claro": "#CBD0D7", "cinza": "#9CA4AF", "cinza_medio": "#76808C", "cinza_azulado": "#5E6C7D",
    "grafite": "#404752", "grafite_escuro": "#2C313A", "preto": "#1E2127",
    # madeiras
    "pinus": "#EBC690", "madeira_clara": "#E6B377", "madeira_mel": "#D69652", "madeira": "#B8763F",
    "madeira_media": "#985D34", "madeira_escura": "#6D4329", "nogueira": "#583725", "madeira_rosada": "#C77F68",
    "madeira_cinza": "#A39589", "caramelo": "#C98A4B",
    # vermelhos e terracotas
    "vermelho_claro": "#F4807B", "vermelho": "#E5484D", "vermelho_escuro": "#B7323A", "vinho": "#7D2335",
    "terracota_clara": "#E38D66", "terracota": "#C9613F", "terracota_escura": "#9B4530", "tijolo": "#B4533A",
    # rosas
    "rosa_claro": "#FBD3DD", "rosa_bebe": "#F7B7C9", "rosa": "#F27FA2", "rosa_escuro": "#DC4F84",
    "magenta": "#C83D8E", "salmao": "#F59D8A", "pessego": "#FBC6A2",
    # laranjas e amarelos
    "laranja_claro": "#FFBA74", "laranja": "#F98B37", "laranja_escuro": "#E0691F", "mostarda": "#E4A92D",
    "amarelo_claro": "#FFE89C", "amarelo": "#FFD340", "amarelo_escuro": "#F1B61C", "limao": "#F0E24C",
    # verdes
    "verde_lima": "#B7DC5B", "verde_claro": "#8FD07B", "verde": "#4EB35F", "verde_medio": "#2F9A56",
    "verde_escuro": "#1E7A4B", "verde_floresta": "#165C3B", "verde_oliva": "#7F8F3B", "menta": "#AAE5CA",
    "verde_agua": "#5DCFB1", "folha_clara": "#7DCB50", "folha": "#40A34E", "folha_escura": "#24793B",
    # turquesas e azuis
    "turquesa_claro": "#90E0E0", "turquesa": "#2CB7C2", "turquesa_escuro": "#178A99", "petroleo": "#155F6E",
    "azul_bebe": "#CEE8FA", "azul_claro": "#90CBF5", "azul_celeste": "#50B3F0", "azul": "#3087E0",
    "azul_medio": "#2664C4", "azul_escuro": "#20408F", "azul_marinho": "#1D2C56", "azul_acinzentado": "#6D87A9",
    "azul_noite": "#25375B",
    # roxos
    "lilas_claro": "#E3D5F7", "lilas": "#BAA1EB", "roxo": "#8B5DD6", "roxo_escuro": "#5C3BA3",
    "violeta": "#A340C4", "ameixa": "#6F306C",
    # marrons
    "marrom_claro": "#A97559", "marrom": "#7C4F37", "marrom_escuro": "#503327", "chocolate": "#3E251A",
    # metais (cores chapadas; o atlas não tem reflexo)
    "cromo": "#E4E9EF", "metal_claro": "#D3D8DE", "metal": "#A8B0BA", "metal_escuro": "#6B737D", "ferro": "#3B414A",
    "ouro": "#E8B53B", "ouro_escuro": "#C08A1F", "latao": "#D9AE50", "cobre": "#C9784B",
    # especiais
    "tela": "#1F2734", "tela_azul": "#2F4B74", "brasa": "#FF7B20", "fogo": "#FFC33E", "carvao": "#2B2523",
    "cinzas": "#8D8681", "terra": "#6B4B36", "terra_escura": "#4B3427", "agua": "#70C5F0",
    "papel": "#FBF7EB", "papel_amarelado": "#F3E6C5", "colchao": "#F5F2EB", "lencol": "#FAFAF7",
    "tecido_cinza": "#BABDC5", "couro": "#8B502F", "couro_preto": "#302C2C", "borracha": "#2B2E34",
    "plastico_branco": "#F2F2EE", "louca": "#F9FBFC",
    # cidade (acrescentadas no fim: as células antigas não mudam)
    "asfalto": "#3D424A", "asfalto_claro": "#4F555E", "concreto": "#BAC0C8", "concreto_escuro": "#8F96A0",
    "calcada": "#D4D8DE", "grama": "#7ACB4C", "grama_escura": "#56A63B", "brita": "#918A80", "dormente": "#6B4F3C",
    "trilho": "#7D838B", "agua_rio": "#3C99D5", "agua_funda": "#2B70A9", "neon_ciano": "#44E4FF",
    "piso_rosado": "#E3BFB0", "terra_seca": "#B98E62",
}
NOMES = list(CORES)
assert len(NOMES) <= 256 and len(set(NOMES)) == len(NOMES)


def _lin(hexa):
    h = hexa.lstrip("#")
    return tuple((int(h[i:i + 2], 16) / 255) ** 2.2 for i in (0, 2, 4))


def uv_cor(nome):
    i = NOMES.index(nome)
    return ((i % 16 + 0.5) / 16, 1 - (i // 16 + 0.5) / 16)


def cor_mais_proxima(rgb_srgb):
    """rgb sRGB (0..1) → nome da cor da paleta mais próxima (distância com peso de luminância e de matiz)."""
    s = list(rgb_srgb)
    melhor, dm = None, 1e9
    for n, h in CORES.items():
        t = [c ** (1 / 2.2) for c in _lin(h)]
        d = 0.3 * (s[0] - t[0]) ** 2 + 0.59 * (s[1] - t[1]) ** 2 + 0.11 * (s[2] - t[2]) ** 2 + \
            0.5 * ((s[0] - s[1]) - (t[0] - t[1])) ** 2 + 0.5 * ((s[1] - s[2]) - (t[1] - t[2])) ** 2
        if d < dm:
            melhor, dm = n, d
    return melhor


def imagem_paleta(caminho=None):
    img = bpy.data.images.get("paleta_moveis")
    if img:
        return img
    img = bpy.data.images.new("paleta_moveis", 16, 16, alpha=False)
    px = [0.0] * (16 * 16 * 4)
    for i, n in enumerate(NOMES):
        x, y = i % 16, 15 - i // 16
        h = CORES[n].lstrip("#")
        o = (y * 16 + x) * 4
        px[o:o + 4] = [int(h[k:k + 2], 16) / 255 for k in (0, 2, 4)] + [1.0]
    img.pixels = px
    if caminho:
        img.filepath_raw = caminho
        img.file_format = "PNG"
        img.save()
    img.pack()
    return img


# ---------------------------------------------------------------------------------------------------------------------
# Materiais (a ordem é fixa: índice de material igual em todas as malhas, para juntar sem remapear)
# ---------------------------------------------------------------------------------------------------------------------
MAT_NOMES = ["atlas", "vidro", "espelho", "luz", "agua", "neon"]
_ESTAMPAS = {}


def _principled(nome):
    m = bpy.data.materials.get(nome) or bpy.data.materials.new(nome)
    m.use_nodes = True
    return m, m.node_tree.nodes["Principled BSDF"]


def materiais():
    if bpy.data.materials.get("atlas") and bpy.data.materials["atlas"].get("ok"):
        return [bpy.data.materials[n] for n in MAT_NOMES]
    m, b = _principled("atlas")
    tx = m.node_tree.nodes.new("ShaderNodeTexImage")
    tx.image = imagem_paleta()
    tx.interpolation = "Closest"
    m.node_tree.links.new(tx.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.55
    m["ok"] = 1
    v, b = _principled("vidro")
    b.inputs["Base Color"].default_value = (*_lin("#9FD6F5"), 1)
    b.inputs["Roughness"].default_value = 0.05
    b.inputs["Alpha"].default_value = 0.38
    v.surface_render_method = "BLENDED"
    e, b = _principled("espelho")
    b.inputs["Base Color"].default_value = (*_lin("#D6ECF7"), 1)
    b.inputs["Roughness"].default_value = 0.03
    b.inputs["Metallic"].default_value = 1.0
    ag, b = _principled("agua")
    b.inputs["Base Color"].default_value = (*_lin("#3C99D5"), 1)
    b.inputs["Roughness"].default_value = 0.04
    b.inputs["Alpha"].default_value = 0.86
    ag.surface_render_method = "BLENDED"
    ne, b = _principled("neon")
    b.inputs["Base Color"].default_value = (*_lin("#7FEFFF"), 1)
    b.inputs["Emission Color"].default_value = (*_lin("#44E4FF"), 1)
    b.inputs["Emission Strength"].default_value = 3.0
    lz, b = _principled("luz")
    b.inputs["Base Color"].default_value = (*_lin("#FFF2C8"), 1)
    b.inputs["Emission Color"].default_value = (*_lin("#FFE3A0"), 1)
    b.inputs["Emission Strength"].default_value = 2.0
    return [bpy.data.materials[n] for n in MAT_NOMES]


def material_estampa(nome, png):
    """Material com uma textura própria (quadros, tapetes, capas). nome vira "estampa_<nome>". Cada categoria cria o seu.
    Retorna o índice do material para usar em pinta_estampa / mat=."""
    chave = "estampa_" + nome
    if chave not in MAT_NOMES:
        m, b = _principled(chave)
        tx = m.node_tree.nodes.new("ShaderNodeTexImage")
        tx.image = bpy.data.images.load(png, check_existing=True)
        tx.image.pack()
        m.node_tree.links.new(tx.outputs["Color"], b.inputs["Base Color"])
        b.inputs["Roughness"].default_value = 0.6
        MAT_NOMES.append(chave)
    return MAT_NOMES.index(chave)


def _mat_idx(mat):
    if isinstance(mat, int):
        return mat
    return MAT_NOMES.index(mat)


# ---------------------------------------------------------------------------------------------------------------------
# Malhas
# ---------------------------------------------------------------------------------------------------------------------
def _obj(nome, bm, cor="branco", mat="atlas", liso=True, angulo=34):
    """bmesh → objeto com o UV de todas as faces na célula da cor (ou UV próprio se mat for estampa e o bm já tiver UV)."""
    materiais()
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    mi = _mat_idx(mat)
    uvl = bm.loops.layers.uv.get("UVMap") or bm.loops.layers.uv.new("UVMap")
    if not MAT_NOMES[mi].startswith("estampa_"):
        u = uv_cor(cor) if cor else (0.5, 0.5)
        for f in bm.faces:
            for lo in f.loops:
                lo[uvl].uv = u
    for f in bm.faces:
        f.material_index = mi
    me = bpy.data.meshes.new(nome)
    bm.to_mesh(me)
    bm.free()
    for n in MAT_NOMES:
        me.materials.append(bpy.data.materials[n])
    if liso:
        me.shade_smooth()
        me.set_sharp_from_angle(angle=math.radians(angulo))
    ob = bpy.data.objects.new(nome, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def pinta(ob, cor, faces=None, mat=None):
    """Repinta faces (todas, ou índices) de um objeto pronto com outra cor da paleta / outro material."""
    me = ob.data
    uv = me.uv_layers["UVMap"].data
    u = uv_cor(cor) if cor else None
    alvo = range(len(me.polygons)) if faces is None else faces
    for i in alvo:
        p = me.polygons[i]
        if mat is not None:
            p.material_index = _mat_idx(mat)
        if u:
            for li in p.loop_indices:
                uv[li].uv = u
    return ob


def pinta_onde(ob, cor, teste, mat=None):
    """Repinta as faces cujo centro (coordenadas locais) passa em teste(c: Vector, n: Vector)."""
    faces = [p.index for p in ob.data.polygons if teste(V(p.center), V(p.normal))]
    return pinta(ob, cor, faces, mat)


def _bevel(bm, b, seg, edges=None):
    if b <= 0:
        return
    bmesh.ops.bevel(bm, geom=list(edges if edges is not None else bm.edges), offset=b, offset_type="OFFSET",
                    segments=seg, profile=0.5, affect="EDGES", clamp_overlap=True)


def caixa(l, p, a, x=0.0, y=0.0, z=0.0, cor="branco", bisel=0.012, seg=3, mat="atlas", nome="caixa", liso=True):
    """Caixa l (x) × p (y) × a (z), centrada em (x, y), com a base em z. Arestas boleadas."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = V((v.co.x * l + x, v.co.y * p + y, v.co.z * a + a / 2 + z))
    _bevel(bm, min(bisel, l / 2.05, p / 2.05, a / 2.05), seg)
    return _obj(nome, bm, cor, mat, liso)


def cilindro(r, a, x=0.0, y=0.0, z=0.0, cor="branco", seg=28, bisel=0.006, eixo="z", r2=None, mat="atlas",
             nome="cilindro", tampas=True):
    """Cilindro (ou tronco de cone se r2) de altura a. eixo "z": base em z; eixo "x"/"y": deitado, centrado em (x,y,z)."""
    bm = bmesh.new()
    r2 = r if r2 is None else r2
    bmesh.ops.create_cone(bm, cap_ends=tampas, cap_tris=False, segments=seg, radius1=r, radius2=r2, depth=a)
    if bisel > 0 and tampas:
        borda = [e for e in bm.edges if len(e.link_faces) == 2 and
                 abs(e.link_faces[0].normal.dot(e.link_faces[1].normal)) < 0.5]
        _bevel(bm, min(bisel, a / 2.1, min(r, r2) * 0.9), 2, borda)
    if eixo == "z":
        M = Matrix.Translation((x, y, z + a / 2))
    elif eixo == "x":
        M = Matrix.Translation((x, y, z)) @ Matrix.Rotation(math.pi / 2, 4, "Y")
    else:
        M = Matrix.Translation((x, y, z)) @ Matrix.Rotation(math.pi / 2, 4, "X")
    bm.transform(M)
    return _obj(nome, bm, cor, mat)


def esfera(r, x=0.0, y=0.0, z=0.0, cor="branco", esc=(1, 1, 1), seg=24, mat="atlas", nome="esfera"):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=max(8, seg // 2), radius=r)
    bm.transform(Matrix.Translation((x, y, z)) @ Matrix.Diagonal((*esc, 1)))
    return _obj(nome, bm, cor, mat, angulo=80)


def torno(perfil, x=0.0, y=0.0, z=0.0, cor="branco", seg=32, mat="atlas", nome="torno", angulo=40, esc=(1, 1)):
    """Sólido de revolução em volta do eixo Z. perfil: [(raio, altura), ...] de baixo para cima; raio 0 fecha o polo.
    esc escala X/Y depois (para formas ovais)."""
    bm = bmesh.new()
    vs = [bm.verts.new((r, 0, h)) for r, h in perfil]
    for a_, b_ in zip(vs, vs[1:]):
        bm.edges.new((a_, b_))
    bmesh.ops.spin(bm, geom=bm.verts[:] + bm.edges[:], cent=(0, 0, 0), axis=(0, 0, 1), angle=2 * math.pi,
                   steps=seg, use_merge=True, use_duplicate=False)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
    bm.transform(Matrix.Translation((x, y, z)) @ Matrix.Diagonal((esc[0], esc[1], 1, 1)))
    return _obj(nome, bm, cor, mat, angulo=angulo)


def ret_arredondado(l, p, r, seg=6):
    """Contorno 2D de um retângulo l × p centrado na origem, cantos com raio r (anti-horário)."""
    r = min(r, l / 2 - 1e-4, p / 2 - 1e-4)
    pts = []
    for cx, cy, a0 in ((l / 2 - r, p / 2 - r, 0), (-l / 2 + r, p / 2 - r, 90), (-l / 2 + r, -p / 2 + r, 180),
                       (l / 2 - r, -p / 2 + r, 270)):
        for k in range(seg + 1):
            t = math.radians(a0 + 90 * k / seg)
            pts.append((cx + r * math.cos(t), cy + r * math.sin(t)))
    return pts


def circulo(r, seg=32, rx=None, ry=None):
    rx, ry = rx or r, ry or r
    return [(rx * math.cos(2 * math.pi * k / seg), ry * math.sin(2 * math.pi * k / seg)) for k in range(seg)]


def poligono(n, r, rot=0.0):
    return [(r * math.cos(rot + 2 * math.pi * k / n), r * math.sin(rot + 2 * math.pi * k / n)) for k in range(n)]


def extrudado(pts, a, x=0.0, y=0.0, z=0.0, cor="branco", bisel=0.01, seg=3, plano="xy", mat="atlas",
              nome="extrudado", liso=True):
    """Extrusão de um contorno 2D (anti-horário). plano "xy": extrusão em Z, base em z. plano "xz": contorno no plano da
    frente (x, z), extrusão em Y para trás a partir de y (espessura a). plano "yz": contorno (y, z), extrusão em X."""
    bm = bmesh.new()
    vs = [bm.verts.new((px, py, 0)) for px, py in pts]
    f = bm.faces.new(vs)
    r = bmesh.ops.extrude_face_region(bm, geom=[f])
    for v in [e for e in r["geom"] if isinstance(e, bmesh.types.BMVert)]:
        v.co.z += a
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    tampas = [g for g in bm.faces if abs(g.normal.z) > 0.9 and len(g.verts) > 4]
    if len(tampas) == 2:  # tampas n-gon → triângulos limpos (o bevel fica certo e o glTF também)
        bmesh.ops.triangulate(bm, faces=tampas, quad_method="BEAUTY", ngon_method="BEAUTY")
    _bevel(bm, bisel, seg, [e for e in bm.edges if not e.is_wire and len(e.link_faces) == 2 and
                            e.link_faces[0].normal.dot(e.link_faces[1].normal) < 0.85])
    if plano == "xy":
        M = Matrix.Translation((x, y, z))
    elif plano == "xz":
        M = Matrix.Translation((x, y + a, z)) @ Matrix.Rotation(math.pi / 2, 4, "X")
    else:
        M = Matrix.Translation((x, y, z)) @ Matrix(((0, 0, 1, 0), (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
    bm.transform(M)
    return _obj(nome, bm, cor, mat, liso)


def _arredonda_cantos(pts, raio, n=6):
    if raio <= 0 or len(pts) < 3:
        return [V(p) for p in pts]
    pts = [V(p) for p in pts]
    out = [pts[0]]
    for a, b, c in zip(pts, pts[1:], pts[2:]):
        d1, d2 = (a - b), (c - b)
        if d1.length < 1e-6 or d2.length < 1e-6:
            continue
        ang = d1.angle(d2)
        if ang > math.radians(175):
            out.append(b)
            continue
        rr = min(raio, d1.length * 0.45, d2.length * 0.45)
        p1, p2 = b + d1.normalized() * rr, b + d2.normalized() * rr
        for k in range(n + 1):  # Bézier quadrática pelo canto: curva lisa tangente aos dois trechos
            t = k / n
            out.append((1 - t) ** 2 * p1 + 2 * (1 - t) * t * b + t ** 2 * p2)
    out.append(pts[-1])
    return out


def tubo(pontos, r, cor="metal", raio_curva=None, seg=12, mat="atlas", nome="tubo", tampas=True, fechado=False):
    """Tubo redondo por uma linha de pontos 3D, com as dobras arredondadas (raio_curva, padrão 2,5 × r)."""
    pts = _arredonda_cantos(pontos, 2.5 * r if raio_curva is None else raio_curva)
    cu = bpy.data.curves.new(nome, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = r
    cu.bevel_resolution = max(1, seg // 4 - 1)
    cu.use_fill_caps = tampas
    sp = cu.splines.new("POLY")
    sp.points.add(len(pts) - 1)
    for q, p in zip(sp.points, pts):
        q.co = (p.x, p.y, p.z, 1)
    sp.use_cyclic_u = fechado
    tmp = bpy.data.objects.new("tmp_" + nome, cu)
    bpy.context.scene.collection.objects.link(tmp)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
    bpy.data.objects.remove(tmp)
    bpy.data.curves.remove(cu)
    bm = bmesh.new()
    bm.from_mesh(me)
    bpy.data.meshes.remove(me)
    return _obj(nome, bm, cor, mat, angulo=60)


def arco_pts(cx, cz, r, a0, a1, n=16, y=0.0):
    """Pontos de um arco no plano XZ (para tubo), ângulos em graus."""
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * k / n)), y,
             cz + r * math.sin(math.radians(a0 + (a1 - a0) * k / n))) for k in range(n + 1)]


def superelipsoide(l, p, a, x=0.0, y=0.0, z=0.0, cor="branco", e=0.3, e_v=None, nu=32, nv=16, mat="atlas",
                   nome="super", estufa=0.0):
    """Forma macia de caixa arredondada (almofada, pufe, colchão, brinquedo). e: 1 = elipsoide, 0,1 = quase caixa.
    estufa > 0 afina a peça nas bordas (almofada cheia no meio). Base em z, centro em (x, y)."""
    e_v = e if e_v is None else e_v

    def f(w, m):
        c = math.cos(w)
        return math.copysign(abs(c) ** m, c)

    def g(w, m):
        s = math.sin(w)
        return math.copysign(abs(s) ** m, s)

    bm = bmesh.new()
    grade = []
    for j in range(nv + 1):
        fi = -math.pi / 2 + math.pi * j / nv
        linha = []
        for i in range(nu):
            th = 2 * math.pi * i / nu
            px = f(fi, e_v) * f(th, e) * l / 2
            py = f(fi, e_v) * g(th, e) * p / 2
            pz = g(fi, e_v) * a / 2
            if estufa:
                k = ((abs(px) / (l / 2)) ** 4 + (abs(py) / (p / 2)) ** 4) ** 0.75 / 2 ** 0.75 * 1.0  # liso, sem vinco
                pz *= 1 - estufa * k
            linha.append(bm.verts.new((px + x, py + y, pz + a / 2 + z)))
        grade.append(linha)
    for j in range(nv):
        for i in range(nu):
            q = [grade[j][i], grade[j][(i + 1) % nu], grade[j + 1][(i + 1) % nu], grade[j + 1][i]]
            if len(set(q)) == 4:
                try:
                    bm.faces.new(q)
                except ValueError:
                    pass
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
    return _obj(nome, bm, cor, mat, angulo=70)


def almofada(l, p, a, x=0.0, y=0.0, z=0.0, cor="azul", e=0.22, estufa=0.45, nome="almofada", rot=None):
    """Almofada fofa (de sofá, de cama, de cadeira). rot=(eixo, graus) para inclinar (encosto)."""
    ob = superelipsoide(l, p, a, 0, 0, 0, cor, e=e, e_v=0.55, estufa=estufa, nome=nome)
    M = Matrix.Translation((x, y, z))
    if rot:
        M = M @ Matrix.Translation((0, 0, a / 2)) @ Matrix.Rotation(math.radians(rot[1]), 4, rot[0]) @ \
            Matrix.Translation((0, 0, -a / 2))
    ob.data.transform(M)
    return ob


def transforma(ob, loc=(0, 0, 0), rot=None, esc=None):
    """Move/gira/escala a malha (não o objeto). rot=(eixo, graus) ou lista delas; esc=(sx,sy,sz)."""
    M = Matrix.Translation(loc)
    rots = [] if rot is None else (rot if isinstance(rot, list) else [rot])
    for eixo, g in rots:
        M = M @ Matrix.Rotation(math.radians(g), 4, eixo)
    if esc:
        M = M @ Matrix.Diagonal((*esc, 1))
    ob.data.transform(M)
    return ob


def espelha_x(ob, nome=None):
    """Cópia espelhada em X (pernas, braços de sofá)."""
    c = ob.copy()
    c.data = ob.data.copy()
    c.name = nome or ob.name + "_esp"
    bpy.context.scene.collection.objects.link(c)
    c.data.transform(Matrix.Diagonal((-1, 1, 1, 1)))
    c.data.flip_normals()
    return c


def copia(ob, loc=(0, 0, 0), nome=None):
    c = ob.copy()
    c.data = ob.data.copy()
    c.name = nome or ob.name + "_c"
    bpy.context.scene.collection.objects.link(c)
    c.data.transform(Matrix.Translation(loc))
    return c


def junta(objs, nome="peca"):
    """Junta vários objetos numa malha só (aplica a posição de cada um)."""
    objs = [o for o in objs if o is not None]
    bm = bmesh.new()
    for o in objs:
        me = o.data.copy()
        me.transform(o.matrix_world)
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
    me = bpy.data.meshes.new(nome)
    bm.to_mesh(me)
    bm.free()
    for n in MAT_NOMES:
        me.materials.append(bpy.data.materials[n])
    for o in objs:
        m = o.data
        bpy.data.objects.remove(o)
        if m.users == 0:
            bpy.data.meshes.remove(m)
    ob = bpy.data.objects.new(nome, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def bbox(objs):
    objs = objs if isinstance(objs, (list, tuple)) else [objs]
    # pelos vértices (o bound_box pode estar velho depois de mexer na malha)
    pts = [o.matrix_world @ v.co for o in objs if o.type == "MESH" for v in o.data.vertices] or \
          [o.matrix_world @ V(c) for o in objs for c in o.bound_box]
    lo = V([min(p[i] for p in pts) for i in range(3)])
    hi = V([max(p[i] for p in pts) for i in range(3)])
    return lo, hi


# ---------------------------------------------------------------------------------------------------------------------
# Peças de marcenaria
# ---------------------------------------------------------------------------------------------------------------------
def carcaca(l, p, a, x=0.0, y=0.0, z=0.0, esp=0.022, cor="branco", prateleiras=(), divisorias=(), fundo=True,
            topo=True, base=True, bisel=0.006, nome="carcaca"):
    """Corpo oco aberto na frente (−Y): laterais, base, topo, fundo, prateleiras (alturas a partir de z) e divisórias
    verticais (posições x relativas ao centro). Devolve um objeto."""
    ps = []
    c = lambda *q, **k: ps.append(caixa(*q, cor=cor, bisel=bisel, **k))
    c(esp, p, a, x=x - l / 2 + esp / 2, y=y, z=z)
    c(esp, p, a, x=x + l / 2 - esp / 2, y=y, z=z)
    if base:
        c(l - 2 * esp + 0.002, p, esp, x=x, y=y, z=z)
    if topo:
        c(l - 2 * esp + 0.002, p, esp, x=x, y=y, z=z + a - esp)
    if fundo:
        c(l - 2 * esp + 0.002, esp, a - 2 * esp + 0.002, x=x, y=y + p / 2 - esp / 2, z=z + esp - 0.001)
    for h in prateleiras:
        c(l - 2 * esp + 0.002, p - esp - 0.01, esp * 0.8, x=x, y=y - esp / 2 - 0.005, z=z + h)
    for dx in divisorias:
        c(esp, p - esp, a - 2 * esp + 0.002, x=x + dx, y=y - esp / 2, z=z + esp - 0.001)
    return junta(ps, nome)


def frente(l, a, esp=0.022, estilo="lisa", cor="azul", cor2=None, bisel=0.008, nome="frente", **op):
    """Frente de porta ou gaveta, deitada no plano XZ: x de −l/2 a l/2, z de 0 a a, y de −esp a 0 (a face de fora em
    y = −esp). estilos:
      "lisa"      tampo boleado;
      "moldura"   moldura saliente (cor2) em volta de um miolo rebaixado;
      "almofada"  miolo saliente chanfrado dentro de um rebaixo (porta clássica);
      "vidro"     moldura com vidro (material vidro) no miolo;
      "trelica"   moldura com vidro e treliça em diagonal (cor2);
      "ripas"     ripas verticais;
      "recorte"   painel com um recorte decorado (op recorte="ondas"|"arco") — clássico das imagens de cozinha.
    op: margem (largura da moldura), rel (saliência)."""
    cor2 = cor2 or cor
    m = op.get("margem", min(l, a) * 0.16)
    rel = op.get("rel", esp * 0.35)
    ps = []
    if estilo == "lisa":
        ps.append(caixa(l, esp, a, y=-esp / 2, cor=cor, bisel=bisel))
    elif estilo in ("moldura", "vidro", "trelica"):
        ps.append(caixa(l, esp * 0.6, a, y=-esp * 0.3, cor=cor, bisel=bisel * 0.6))
        e = rel + esp * 0.4
        ps.append(caixa(l, e, m, y=-esp * 0.6 - e / 2 + 0.002, z=0, cor=cor2, bisel=bisel))
        ps.append(caixa(l, e, m, y=-esp * 0.6 - e / 2 + 0.002, z=a - m, cor=cor2, bisel=bisel))
        ps.append(caixa(m, e, a - 2 * m + 0.004, x=-l / 2 + m / 2, y=-esp * 0.6 - e / 2 + 0.002, z=m - 0.002, cor=cor2,
                        bisel=bisel))
        ps.append(caixa(m, e, a - 2 * m + 0.004, x=l / 2 - m / 2, y=-esp * 0.6 - e / 2 + 0.002, z=m - 0.002, cor=cor2,
                        bisel=bisel))
        if estilo in ("vidro", "trelica"):
            velho = ps[0]
            bpy.data.objects.remove(velho)
            ps[0] = caixa(l - 2 * m + 0.01, esp * 0.2, a - 2 * m + 0.01, y=-esp * 0.55, z=m - 0.005, cor=None,
                          mat="vidro", bisel=0.001)
        if estilo == "trelica":
            w = min(l, a) * 0.03
            L = math.hypot(l, a) * 1.3
            n = 4
            passo = (l - 2 * m) / n
            barras = []
            for k in range(-2 * n, 2 * n + 1):
                for s_ in (1, -1):
                    rr = caixa(w, w, L, z=-L / 2, cor=cor2, bisel=w * 0.3, seg=2)
                    transforma(rr, rot=("Y", s_ * 45))
                    transforma(rr, loc=(k * passo * 1.4142 / 2 * 1.4142, -esp * 0.62, a / 2))
                    barras.append(rr)
            vid = junta(barras, "trelica")
            _recorta_retangulo(vid, -l / 2 + m - 0.003, l / 2 - m + 0.003, m - 0.003, a - m + 0.003)
            ps.append(vid)
    elif estilo == "almofada":
        ps.append(caixa(l, esp, a, y=-esp / 2, cor=cor, bisel=bisel))
        mi = caixa(l - 2 * m, rel * 1.6, a - 2 * m, y=-esp - rel * 0.8 + 0.002, z=m, cor=cor2, bisel=rel * 0.9, seg=2)
        ps.append(mi)
    elif estilo == "ripas":
        n = max(3, int(round(l / 0.06)))
        w = l / n
        for k in range(n):
            ps.append(caixa(w * 0.86, esp, a, x=-l / 2 + w * (k + 0.5), y=-esp / 2, cor=cor, bisel=w * 0.3))
        ps.append(caixa(l, esp * 0.5, a, y=-esp * 0.25 + 0.002, cor=cor2, bisel=0.002))
    elif estilo == "recorte":
        ps.append(caixa(l, esp, a, y=-esp / 2, cor=cor, bisel=bisel))
        forma = op.get("recorte", "ondas")
        w, h = l - 2 * m, a - 2 * m
        if forma == "arco":  # arco em cima
            pts = [(-w / 2, 0), (w / 2, 0)] + [(w / 2 * math.cos(math.pi * k / 16), h - w / 2 + w / 2 *
                                                 math.sin(math.pi * k / 16)) for k in range(17)]
        else:  # ondas: retângulo com os cantos côncavos (o recorte das portas clássicas)
            rc = min(w, h) * 0.2
            pts = []
            for cx, cz, a0 in ((w / 2, 0, 90), (w / 2, h, 180), (-w / 2, h, 270), (-w / 2, 0, 0)):
                for k in range(7):
                    t = math.radians(a0 + 90 - 90 * k / 6)
                    pts.append((cx + rc * math.cos(t), cz + rc * math.sin(t)))
        pts = [(px, pz + m) for px, pz in pts]
        sobre = extrudado(_ccw(pts), rel * 1.4, y=-esp - rel * 1.4 + 0.002, cor=cor2, bisel=rel * 0.5, seg=2,
                          plano="xz")
        ps.append(sobre)
    return junta(ps, nome)


def _ccw(pts):
    s = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(pts, pts[1:] + pts[:1]))
    return pts if s > 0 else pts[::-1]


def _recorta_retangulo(ob, x0, x1, z0, z1):
    """Corta a malha nos planos x0, x1, z0, z1 e apaga o que fica fora (para treliça dentro da moldura)."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    for co, no in (((x0, 0, 0), (1, 0, 0)), ((x1, 0, 0), (-1, 0, 0)), ((0, 0, z0), (0, 0, 1)), ((0, 0, z1), (0, 0, -1))):
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=no, clear_inner=True)
    bm.to_mesh(ob.data)
    bm.free()


def puxador(tipo="bola", x=0.0, y=0.0, z=0.0, cor="ouro", tam=1.0, vertical=True, nome="puxador"):
    """Puxador na face da frente (y é o plano da frente; ele sai para −Y). tipos: bola, barra, alca, concha, argola,
    botao (pequeno, achatado)."""
    s = tam
    if tipo == "bola":
        ps = [cilindro(0.008 * s, 0.014 * s, x=x, y=y - 0.007 * s, z=z, cor=cor, eixo="y", seg=12),
              esfera(0.017 * s, x=x, y=y - 0.024 * s, z=z, cor=cor, esc=(1, 0.8, 1), seg=14)]
        return junta(ps, nome)
    if tipo == "botao":
        return cilindro(0.016 * s, 0.012 * s, x=x, y=y - 0.006 * s, z=z, cor=cor, eixo="y", seg=16, bisel=0.004 * s,
                        nome=nome)
    if tipo in ("barra", "alca"):
        L = 0.11 * s if tipo == "alca" else 0.16 * s
        d = 0.03 * s
        if vertical:
            pts = [(x, y, z - L / 2), (x, y - d, z - L / 2), (x, y - d, z + L / 2), (x, y, z + L / 2)]
        else:
            pts = [(x - L / 2, y, z), (x - L / 2, y - d, z), (x + L / 2, y - d, z), (x + L / 2, y, z)]
        return tubo(pts, 0.0065 * s, cor=cor, raio_curva=0.012 * s, nome=nome)
    if tipo == "concha":
        ob = superelipsoide(0.08 * s, 0.02 * s, 0.03 * s, x=x, y=y - 0.008 * s, z=z - 0.015 * s, cor=cor, e=0.5)
        return ob
    if tipo == "argola":  # anel pendurado num botão (toro feito por torno de um círculo pequeno)
        R, r = 0.02 * s, 0.0045 * s
        perfil = [(R + r * math.cos(math.radians(a_)), r * math.sin(math.radians(a_))) for a_ in range(-90, 271, 30)]
        anel = torno(perfil, cor=cor, seg=20, nome=nome)
        transforma(anel, rot=("X", 90))
        transforma(anel, loc=(x, y - 0.012 * s, z - R))
        return junta([anel, esfera(0.008 * s, x=x, y=y - 0.006 * s, z=z, cor=cor, seg=12)], nome)
    raise ValueError(tipo)


def pe(tipo="bola", a=0.08, x=0.0, y=0.0, z=0.0, cor="madeira", r=0.03, nome="pe"):
    """Pé de móvel com a base em z. tipos: bola (pezinho redondo achatado), reto, conico (afina para baixo), torneado,
    palito (fino e inclinado para fora: passe op via transforma depois), bloco, carretel (com ressalto)."""
    if tipo == "bola":
        return superelipsoide(2 * r, 2 * r, a, x=x, y=y, z=z, cor=cor, e=0.8, e_v=0.7, nu=20, nv=10, nome=nome)
    if tipo == "reto":
        return cilindro(r, a, x=x, y=y, z=z, cor=cor, seg=16, bisel=r * 0.25, nome=nome)
    if tipo == "conico":
        return cilindro(r * 0.6, a, x=x, y=y, z=z, cor=cor, r2=r, seg=16, bisel=r * 0.15, nome=nome)
    if tipo == "bloco":
        return caixa(2 * r, 2 * r, a, x=x, y=y, z=z, cor=cor, bisel=r * 0.35, nome=nome)
    if tipo == "carretel":
        return torno([(0, 0), (r * 0.8, 0), (r * 0.9, a * 0.08), (r * 0.6, a * 0.3), (r * 0.55, a * 0.7),
                      (r, a * 0.9), (r, a), (0, a)], x=x, y=y, z=z, cor=cor, seg=16, nome=nome)
    if tipo == "torneado":
        k = a
        perfil = [(0, 0), (r * 0.55, 0), (r * 0.6, k * 0.05), (r * 0.45, k * 0.12), (r * 0.5, k * 0.3), (r * 0.8, k * 0.38),
                  (r * 0.55, k * 0.46), (r * 0.6, k * 0.62), (r * 0.9, k * 0.7), (r * 0.65, k * 0.78), (r * 0.7, k * 0.86),
                  (r, k * 0.9), (r, k), (0, k)]
        return torno(perfil, x=x, y=y, z=z, cor=cor, seg=16, nome=nome)
    if tipo == "palito":
        return cilindro(r * 0.55, a, x=x, y=y, z=z, cor=cor, r2=r, seg=14, bisel=r * 0.2, nome=nome)
    raise ValueError(tipo)


def quatro_pes(tipo, l, p, a, cor, r=0.03, recuo=0.04, z=0.0, abre=0.0, **k):
    """Quatro pés nos cantos de um retângulo l × p (recuo da borda). abre: inclinação para fora em graus (palito)."""
    out = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            o = pe(tipo, a, x=0, y=0, z=0, cor=cor, r=r, **k)
            if abre:
                transforma(o, rot=[("Y", -sx * abre), ("X", sy * abre)])
            transforma(o, loc=(sx * (l / 2 - recuo), sy * (p / 2 - recuo), z))
            out.append(o)
    return out


# ---------------------------------------------------------------------------------------------------------------------
# Peça (Item): corpo estático + portas + gavetas + slots
# ---------------------------------------------------------------------------------------------------------------------
def _gl(v):
    """Vetor do Blender (Z para cima) → glTF (Y para cima)."""
    return [round(v[0], 5), round(v[2], 5), round(-v[1], 5)]


class Item:
    def __init__(self, id_):
        self.id = id_
        self.partes = []
        self.interativos = []  # (obj, dados)
        self.slots = []  # (nome, centro, tamanho, pai_nome|None)
        self.colisores = None
        self.cores = set()

    def add(self, *objs):
        for o in objs:
            if isinstance(o, (list, tuple)):
                self.add(*o)
            elif o is not None:
                self.partes.append(o)
        return self

    def porta(self, objs, dobradica, eixo="z", angulo=None, lado="esq", nome=None, abre_graus=105):
        """Porta: objs (frente + puxador...) já no lugar fechado. dobradica = ponto do eixo. eixo "z" (porta comum; lado
        "esq" = dobradiça à esquerda, abre para fora girando para −Y), "x" com lado "baixo" (forno, máquina de lavar
        tombando para a frente) ou lado "cima" (basculante de armário alto). angulo em graus sobrescreve."""
        if angulo is None:
            sinal = {"esq": -1, "dir": 1, "baixo": 1, "cima": -1}[lado]
            angulo = sinal * abre_graus
        nome = nome or f"porta_{sum(1 for _, d in self.interativos if d['interativo'] == 'porta') + 1}"
        ob = junta(objs if isinstance(objs, (list, tuple)) else [objs], nome)
        d = V(dobradica)
        ob.data.transform(Matrix.Translation(-d))
        ob.location = d
        ax = {"z": (0, 0, 1), "x": (1, 0, 0), "y": (0, 1, 0)}[eixo]
        self.interativos.append((ob, {"interativo": "porta", "eixo": _gl(ax), "angulo": round(math.radians(angulo), 4)}))
        return ob

    def gaveta(self, l, p, a, frente_obj, x=0.0, y_frente=0.0, z=0.0, cor="branco", esp=0.012, curso=None, nome=None,
               slot=True):
        """Gaveta de verdade: caixa (fundo + 4 lados, aberta em cima) de l × p × a atrás do plano da frente y_frente,
        base em z, centrada em x; frente_obj é a frente já no lugar (use frente(...) + transforma). Abre para −Y."""
        nome = nome or f"gaveta_{sum(1 for _, dd in self.interativos if dd['interativo'] == 'gaveta') + 1}"
        y0 = y_frente + 0.002
        c = dict(cor=cor, bisel=0.003, seg=1)
        caixa_ = [caixa(l, p, esp, x=x, y=y0 + p / 2, z=z, **c),
                  caixa(esp, p, a, x=x - l / 2 + esp / 2, y=y0 + p / 2, z=z, **c),
                  caixa(esp, p, a, x=x + l / 2 - esp / 2, y=y0 + p / 2, z=z, **c),
                  caixa(l, esp, a, x=x, y=y0 + p - esp / 2, z=z, **c),
                  caixa(l, esp, a * 0.9, x=x, y=y0 + esp / 2, z=z, **c)]
        objs = caixa_ + (frente_obj if isinstance(frente_obj, (list, tuple)) else [frente_obj])
        ob = junta(objs, nome)
        d = V((x, y_frente, z))
        ob.data.transform(Matrix.Translation(-d))
        ob.location = d
        curso = round(curso if curso is not None else p * 0.78, 4)
        self.interativos.append((ob, {"interativo": "gaveta", "direcao": _gl((0, -1, 0)), "curso": curso}))
        if slot:
            self.slots.append((f"slot_{nome}", (x, y0 + p / 2, z + esp), (l - 2 * esp, p - 2 * esp, a - esp), nome))
        return ob

    def correr(self, objs, direcao=(1, 0, 0), curso=0.5, nome=None):
        """Porta de correr / tampa deslizante: anda em linha reta (direcao no Blender) por curso metros."""
        nome = nome or f"correr_{sum(1 for _, d in self.interativos if d['interativo'] == 'correr') + 1}"
        ob = junta(objs if isinstance(objs, (list, tuple)) else [objs], nome)
        lo, hi = bbox(ob)
        d = (lo + hi) / 2
        ob.data.transform(Matrix.Translation(-d))
        ob.location = d
        self.interativos.append((ob, {"interativo": "correr", "direcao": _gl(V(direcao).normalized()),
                                      "curso": round(curso, 4)}))
        return ob

    def slot(self, nome, centro_base, tamanho, pai=None):
        """Espaço onde se pode pôr objetos: centro_base = (x, y, z da superfície de apoio), tamanho = (l, p, a livre)."""
        self.slots.append((f"slot_{nome}", tuple(centro_base), tuple(tamanho), pai))

    def colisao(self, caixas):
        """caixas: [((x, y, z_base), (l, p, a)), ...] em coordenadas do Blender."""
        self.colisores = caixas

    # ---- montagem final
    def monta(self):
        corpo = junta(self.partes, self.id)
        for ob, dados in self.interativos:
            ob.parent = corpo
            for k, v in dados.items():
                ob[k] = v
        vaz = {}
        for nome, c, t, pai in self.slots:
            e = bpy.data.objects.new(nome, None)
            e.empty_display_type = "CUBE"
            e.empty_display_size = 0.5
            bpy.context.scene.collection.objects.link(e)
            if pai:
                po = next(o for o, _ in self.interativos if o.name == pai)
                e.parent = po
                e.location = V(c) - po.location
            else:
                e.parent = corpo
                e.location = V(c)
            e["slot"] = 1
            e["tamanho"] = _gl(t)
            e["tamanho"] = [round(t[0], 4), round(t[2], 4), round(t[1], 4)]
            vaz[nome] = e
        self.corpo = corpo
        bpy.context.view_layer.update()
        return corpo


# ---------------------------------------------------------------------------------------------------------------------
# Cena, exportação, miniatura, catálogo
# ---------------------------------------------------------------------------------------------------------------------
def limpa():
    """Apaga objetos e malhas da cena (mantém materiais e a paleta) — chamar antes de cada peça."""
    for o in list(bpy.data.objects):
        if o.type in ("MESH", "EMPTY", "CURVE"):
            bpy.data.objects.remove(o)
    for m in list(bpy.data.meshes):
        if m.users == 0:
            bpy.data.meshes.remove(m)
    for c in list(bpy.data.curves):
        if c.users == 0:
            bpy.data.curves.remove(c)


def _hierarquia(corpo):
    out = [corpo]
    for c in corpo.children:
        out += _hierarquia(c)
    return out


def exporta_glb(corpo, caminho):
    for o in bpy.context.scene.objects:
        o.select_set(False)
    for o in _hierarquia(corpo):
        o.select_set(True)
    bpy.context.view_layer.objects.active = corpo
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=caminho, export_format="GLB", use_selection=True, export_extras=True,
                              export_apply=True, export_yup=True, export_image_format="AUTO",
                              export_materials="EXPORT", export_attributes=False, export_cameras=False,
                              export_lights=False, export_animations=False)


_RENDER = {}


def _prepara_render(res=192, amostras=None):
    scn = bpy.context.scene
    scn.render.engine = "CYCLES"
    scn.cycles.samples = int(os.environ.get("AMOSTRAS", amostras or 20))
    scn.cycles.use_denoising = True
    scn.cycles.device = "CPU"
    scn.render.threads_mode = "FIXED"
    scn.render.threads = int(os.environ.get("MOVEIS_THREADS", "2"))
    scn.render.film_transparent = True
    scn.render.resolution_x = scn.render.resolution_y = res
    scn.render.resolution_percentage = 100
    scn.view_settings.view_transform = "Standard"
    scn.view_settings.look = "None"
    if not scn.world or scn.world.name != "mundo_moveis":
        w = bpy.data.worlds.new("mundo_moveis")
        scn.world = w
        w.use_nodes = True
        w.node_tree.nodes["Background"].inputs[0].default_value = (0.80, 0.85, 0.95, 1)
        w.node_tree.nodes["Background"].inputs[1].default_value = float(os.environ.get("MINI_MUNDO", "0.7"))
    if "sol_moveis" not in bpy.data.objects:
        ld = bpy.data.lights.new("sol_moveis", "SUN")
        ld.energy = float(os.environ.get("MINI_SOL", "2.4"))
        ld.angle = math.radians(8)
        sol = bpy.data.objects.new("sol_moveis", ld)
        scn.collection.objects.link(sol)
        sol.rotation_euler = (math.radians(48), 0, math.radians(-35))
    if "cam_moveis" not in bpy.data.objects:
        cd = bpy.data.cameras.new("cam_moveis")
        cd.type = "ORTHO"
        cam = bpy.data.objects.new("cam_moveis", cd)
        scn.collection.objects.link(cam)
    scn.camera = bpy.data.objects["cam_moveis"]
    return scn


def miniatura(corpo, caminho, res=192, direcao=(0.55, -1.0, 0.5), margem=1.1):
    """Miniatura da peça sozinha: três quartos pela frente, fundo transparente, WEBP."""
    scn = _prepara_render(res)
    objs = [o for o in _hierarquia(corpo) if o.type == "MESH"]
    pts = [o.matrix_world @ V(c) for o in objs for c in o.bound_box]
    lo = V([min(p[i] for p in pts) for i in range(3)])
    hi = V([max(p[i] for p in pts) for i in range(3)])
    c = (lo + hi) / 2
    cam = scn.camera
    d = V(direcao).normalized()
    dist = (hi - lo).length * 3 + 5
    cam.location = c + d * dist
    cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler()
    R = cam.rotation_euler.to_matrix().inverted()
    proj = [R @ (p - c) for p in pts]
    ext = max(max(abs(q.x) for q in proj), max(abs(q.y) for q in proj)) * 2
    cam.data.ortho_scale = max(ext * margem, 0.05)
    cam.data.clip_end = dist * 2 + 10
    scn.render.image_settings.file_format = "WEBP"
    scn.render.image_settings.color_mode = "RGBA"
    scn.render.image_settings.quality = 90
    scn.render.filepath = caminho
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    da_peca = set(_hierarquia(corpo))
    escondidos = [o for o in scn.objects if o.type in ("MESH", "CURVE", "EMPTY") and o not in da_peca
                  and not o.hide_render]
    for o in escondidos:  # sobras na cena não aparecem na miniatura (e avisam: não vão para o GLB)
        o.hide_render = True
    if any(o.type != "EMPTY" for o in escondidos):
        print("aviso: objetos fora da peca na cena:", [o.name for o in escondidos if o.type != "EMPTY"][:8], flush=True)
    bpy.ops.render.render(write_still=True)
    for o in escondidos:
        o.hide_render = False


class Catalogo:
    """Uma categoria. Grava em <saida>/<categoria>/: glb/<id>.glb, miniaturas/<id>.webp e catalogo.json."""

    def __init__(self, categoria, saida, rotulo=None):
        self.cat = categoria
        self.pasta = os.path.join(saida, categoria)
        os.makedirs(self.pasta, exist_ok=True)
        self.arq = os.path.join(self.pasta, "catalogo.json")
        self.dados = {"categoria": categoria, "rotulo": rotulo or categoria, "itens": []}
        if os.path.exists(self.arq):
            antigo = json.load(open(self.arq))
            self.dados["itens"] = antigo.get("itens", [])
        imagem_paleta(os.path.join(saida, "paleta_moveis.png"))

    def exporta(self, item, rotulo, grupo="", fixacao="chao", altura_instalacao=None, pacote=False, tags=(),
                miniatura_dir=(0.55, -1.0, 0.5), extra=None):
        corpo = item.monta()
        lo, hi = bbox([o for o in _hierarquia(corpo) if o.type == "MESH"])
        dims = [round(hi.x - lo.x, 3), round(hi.y - lo.y, 3), round(hi.z - lo.z, 3)]
        if item.colisores:
            col = [{"centro": _gl((c[0], c[1], c[2] + t[2] / 2)), "tamanho": [round(t[0], 3), round(t[2], 3),
                                                                              round(t[1], 3)]}
                   for c, t in item.colisores]
        else:
            corpo_lo, corpo_hi = bbox(corpo)
            cc = (corpo_lo + corpo_hi) / 2
            col = [{"centro": _gl(cc), "tamanho": [round(corpo_hi.x - corpo_lo.x, 3), round(corpo_hi.z - corpo_lo.z, 3),
                                                   round(corpo_hi.y - corpo_lo.y, 3)]}]
        inter = []
        for ob, d in item.interativos:
            q = dict(d)
            q["nome"] = ob.name
            q["pivo"] = _gl(ob.location)
            inter.append(q)
        slots = [{"nome": n, "centro": _gl(c), "tamanho": [round(t[0], 3), round(t[2], 3), round(t[1], 3)],
                  "em": pai} for n, c, t, pai in item.slots]
        usados = set()
        for o in _hierarquia(corpo):
            if o.type == "MESH":
                uv = o.data.uv_layers["UVMap"].data
                for p in o.data.polygons:
                    if MAT_NOMES[p.material_index] == "atlas":
                        u = uv[p.loop_indices[0]].uv
                        i = int(u[0] * 16) + 16 * int((1 - u[1]) * 16)
                        if 0 <= i < len(NOMES):
                            usados.add(NOMES[i])
        tris = sum(len(p.vertices) - 2 for o in _hierarquia(corpo) if o.type == "MESH" for p in o.data.polygons)
        glb = os.path.join(self.pasta, "glb", item.id + ".glb")
        exporta_glb(corpo, glb)
        mini = os.path.join(self.pasta, "miniaturas", item.id + ".webp")
        miniatura(corpo, mini, direcao=miniatura_dir)
        e = {"id": item.id, "rotulo": rotulo, "categoria": self.cat, "grupo": grupo, "fixacao": fixacao,
             "dims": dims, "arquivo": f"glb/{item.id}.glb", "miniatura": f"miniaturas/{item.id}.webp",
             "interativos": inter, "slots": slots, "colisao": col, "cores": sorted(usados), "tris": tris,
             "pacote": bool(pacote), "tags": list(tags)}
        if altura_instalacao is not None:
            e["altura_instalacao"] = altura_instalacao
        if extra:
            e.update(extra)
        self.dados["itens"] = [x for x in self.dados["itens"] if x["id"] != item.id] + [e]
        self.salva()
        print("peca", self.cat, item.id, dims, "tris", tris, flush=True)
        return e

    def salva(self):
        json.dump(self.dados, open(self.arq, "w"), ensure_ascii=False, indent=1)


# ---------------------------------------------------------------------------------------------------------------------
# Vitrine: todas as peças de uma categoria no fundo azul, como nas imagens de referência
# ---------------------------------------------------------------------------------------------------------------------
def vitrine(pasta_categoria, arquivo, ids=None, colunas=None, res=(1800, 1000), abertos=False, amostras=48):
    """Importa os GLB (o que também confere a exportação), arruma em fileiras e renderiza com fundo azul-noite.
    abertos=True mostra portas e gavetas abertas pela metade (para conferir o interior)."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    cat = json.load(open(os.path.join(pasta_categoria, "catalogo.json")))
    itens = [i for i in cat["itens"] if ids is None or i["id"] in ids]
    grupos = []
    for it in itens:
        antes = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=os.path.join(pasta_categoria, it["arquivo"]))
        novos = [o for o in bpy.data.objects if o not in antes]
        raiz = [o for o in novos if o.parent is None][0]
        if abertos:
            for o in novos:
                if o.get("interativo") == "porta":
                    ax = V(o["eixo"])
                    ax = V((ax[0], -ax[2], ax[1]))
                    o.rotation_mode = "AXIS_ANGLE"
                    o.rotation_axis_angle = (o["angulo"] * 0.75, *ax)
                elif o.get("interativo") in ("gaveta", "correr"):
                    dd = V(o["direcao"])
                    o.location += V((dd[0], -dd[2], dd[1])) * o["curso"] * 0.6
        bpy.context.view_layer.update()
        grupos.append((raiz, novos, it))
    n = len(grupos)
    colunas = colunas or max(1, math.ceil(math.sqrt(n * 1.8)))
    filas = [grupos[i:i + colunas] for i in range(0, n, colunas)]
    pos = []
    y = 0.0
    for fi, fila in enumerate(filas):
        prof = max(g[2]["dims"][1] for g in fila)
        if fi:
            alt_frente = max(g[2]["dims"][2] for g in fila)
            y -= 0.45 + alt_frente * 0.75
        x = 0.0
        for raiz, novos, it in fila:
            l = it["dims"][0]
            pos.append((raiz, x + l / 2, y - prof / 2))
            x += l + 0.45
        y -= prof
    larg = {}
    for raiz, px, py in pos:
        larg[py] = max(larg.get(py, 0), px)
    pos = [(r, px - larg[py] / 2, py) for r, px, py in pos]
    alt = {}
    for raiz, novos, it in grupos:  # o que desce abaixo de z = 0 (teto, asfalto, laje da cidade) sobe até o chão
        zs = [(o.matrix_world @ V(c)).z for o in novos if o.type == "MESH" for c in o.bound_box]
        alt[id(raiz)] = max(0.0, -min(zs)) if zs else 0.0
    for raiz, px, py in pos:  # peça de teto: a origem fica no alto, então sobe a altura dela para ficar no chão
        raiz.location = (px, py, alt[id(raiz)])
    bpy.context.view_layer.update()
    scn = bpy.context.scene
    scn.render.engine = "CYCLES"
    scn.cycles.samples = int(os.environ.get("AMOSTRAS", amostras))
    scn.cycles.use_denoising = True
    scn.render.threads_mode = "FIXED"
    scn.render.threads = int(os.environ.get("MOVEIS_THREADS", "2"))
    scn.render.resolution_x, scn.render.resolution_y = res
    scn.view_settings.view_transform = "Standard"
    w = bpy.data.worlds.new("w")
    scn.world = w
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (*_lin("#9DB4D9"), 1)
    w.node_tree.nodes["Background"].inputs[1].default_value = 0.6
    pts = [o.matrix_world @ V(c) for _, novos, _ in grupos for o in novos if o.type == "MESH" for c in o.bound_box]
    lo = V([min(p[i] for p in pts) for i in range(3)])
    hi = V([max(p[i] for p in pts) for i in range(3)])
    c = (lo + hi) / 2
    chao = bpy.data.meshes.new("chao")
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=max(hi.x - lo.x, hi.y - lo.y) * 3 + 20)
    bm.to_mesh(chao)
    bm.free()
    m, b = _principled("chao_vitrine")
    b.inputs["Base Color"].default_value = (*_lin("#2A3D63"), 1)
    b.inputs["Roughness"].default_value = 0.9
    chao.materials.append(m)
    ob = bpy.data.objects.new("chao", chao)
    scn.collection.objects.link(ob)
    ob.location = (c.x, c.y, 0)
    ld = bpy.data.lights.new("sol", "SUN")
    ld.energy = 3.0
    ld.angle = math.radians(6)
    sol = bpy.data.objects.new("sol", ld)
    scn.collection.objects.link(sol)
    sol.rotation_euler = (math.radians(42), 0, math.radians(-38))
    cd = bpy.data.cameras.new("c")
    cd.type = "ORTHO"
    cam = bpy.data.objects.new("c", cd)
    scn.collection.objects.link(cam)
    scn.camera = cam
    d = V((0.45, -1.0, 0.95)).normalized()
    cam.location = c + d * 60
    cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler()
    R = cam.rotation_euler.to_matrix().inverted()
    proj = [R @ (p - c) for p in pts]
    ex = max(q.x for q in proj) - min(q.x for q in proj)
    ey = max(q.y for q in proj) - min(q.y for q in proj)
    cd.ortho_scale = max(ex, ey * res[0] / res[1]) * 1.08
    cam.location += cam.matrix_world.to_3x3() @ V(((max(q.x for q in proj) + min(q.x for q in proj)) / 2,
                                                   (max(q.y for q in proj) + min(q.y for q in proj)) / 2, 0))
    cd.clip_end = 200
    scn.render.image_settings.file_format = "PNG"
    scn.render.filepath = arquivo
    bpy.ops.render.render(write_still=True)
    print("vitrine", arquivo, n, flush=True)


# ---------------------------------------------------------------------------------------------------------------------
# Pacote gratuito (Cute Furniture): importar e trazer para as nossas convenções
# ---------------------------------------------------------------------------------------------------------------------
PACOTE_FBX = os.environ.get("MOVEIS_PACOTE_FBX", "")
PACOTE_TEX = os.environ.get("MOVEIS_PACOTE_TEX", "")


def importa_pacote(nome, fbx_dir=None, textura=None):
    """Importa <nome>.fbx do pacote, aplica escala/rotação (fica em metros, Z para cima, frente para −Y), troca o
    atlas de degradê do pacote pela nossa paleta (cada face recebe a cor mais próxima) e o vidro pelo nosso vidro.
    Devolve {nome_da_parte: objeto} (a parte principal com a chave "corpo"). As portas/gavetas do pacote vêm como
    objetos separados; o gerador decide o que é porta e o que é gaveta e passa para Item.porta / Item.gaveta."""
    fbx_dir = fbx_dir or PACOTE_FBX
    textura = textura or PACOTE_TEX
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=os.path.join(fbx_dir, nome + ".fbx"))
    novos = [o for o in bpy.data.objects if o not in antes]
    img = bpy.data.images.load(textura, check_existing=True)
    W, H = img.size
    px = img.pixels[:]
    materiais()
    cache = {}
    out = {}
    for o in novos:
        if o.type != "MESH":
            continue
        me = o.data.copy()
        me.transform(o.matrix_world)
        uvd = me.uv_layers.active.data
        bm = bmesh.new()
        bm.from_mesh(me)
        mats_orig = [m.name.lower() if m else "" for m in me.materials]
        bpy.data.meshes.remove(me)
        uvl = bm.loops.layers.uv.active
        for f in bm.faces:
            us = [lo[uvl].uv for lo in f.loops]
            u = sum(q[0] for q in us) / len(us)
            v = sum(q[1] for q in us) / len(us)
            xi = min(W - 1, max(0, int(u % 1.0 * W)))
            yi = min(H - 1, max(0, int(v % 1.0 * H)))
            k = (yi * W + xi) * 4
            rgb = tuple(round(c, 3) for c in px[k:k + 3])
            vidro = "glass" in (mats_orig[f.material_index] if f.material_index < len(mats_orig) else "")
            if vidro:
                f.material_index = MAT_NOMES.index("vidro")
                continue
            if rgb not in cache:
                cache[rgb] = cor_mais_proxima(tuple(c for c in rgb))
            uu = uv_cor(cache[rgb])
            for lo in f.loops:
                lo[uvl].uv = uu
            f.material_index = 0
        if uvl.name != "UVMap":
            uvl_n = bm.loops.layers.uv.new("UVMap") if "UVMap" not in bm.loops.layers.uv else bm.loops.layers.uv["UVMap"]
            for f in bm.faces:
                for lo in f.loops:
                    lo[uvl_n].uv = lo[uvl].uv
            bm.loops.layers.uv.remove(uvl)
        nm = o.name.replace(nome + "_", "") if o.name != nome else "corpo"
        mesh = bpy.data.meshes.new(nm)
        bm.to_mesh(mesh)
        bm.free()
        for n in MAT_NOMES:
            mesh.materials.append(bpy.data.materials[n])
        mesh.shade_smooth()
        mesh.set_sharp_from_angle(angle=math.radians(40))
        ob = bpy.data.objects.new(nm, mesh)
        bpy.context.scene.collection.objects.link(ob)
        out[nm] = ob
    for o in novos:
        bpy.data.objects.remove(o)
    return out
