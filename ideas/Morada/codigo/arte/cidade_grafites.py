"""Cidade do Morada: grafites (decalques transparentes para qualquer parede e muros grafitados) — categoria "grafites".

Uso:
  python3 -I morada-art/grafites_estampas.py SP/cidade_out                      (uma vez: desenha os PNG)
  MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/cidade_grafites.py -- SP/cidade_out [ids|grupos...]
  MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/cidade_grafites.py -- SP/cidade_out vitrine_muro [noite]

- Decalque: plano fino com o PNG de fundo transparente, fixacao "parede": a face fica 2 mm à frente do plano y = 0
  (frente para −Y), origem no meio da largura e na base. Material "estampa_grafite_<palavra>" feito aqui
  (material_decalque): é a material_estampa da base com o alfa da textura ligado por um Arredondar, que o exportador
  glTF grava como alphaMode MASK com corte 0,5 (não briga com a ordem de desenho). Sem colisão.
- Muro: tijolo ou concreto (textura que repete, UV em metros), capa de concreto, pilares, 2 ou 3 grafites e um mural.
  Origem no chão, no meio; colisão de caixa.
- vitrine_muro: os decalques (importados dos GLB, o que confere o alfa) colados num muro de tijolo terracota.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import moveis_base as mb  # noqa: E402

V = Vector
CAT = "grafites"
EST_DIR = ""
MINI_FRENTE = (0.12, -1.0, 0.08)


def material_decalque(nome, png):
    """Como mb.material_estampa, mas com o alfa da textura ligado (corte em 0,5 por um nó Arredondar → MASK)."""
    chave = "estampa_grafite_" + nome
    if chave not in mb.MAT_NOMES:
        m, b = mb._principled(chave)
        nt = m.node_tree
        tx = nt.nodes.new("ShaderNodeTexImage")
        tx.image = bpy.data.images.load(png, check_existing=True)
        tx.image.alpha_mode = "STRAIGHT"
        tx.image.pack()
        tx.extension = "CLIP"
        nt.links.new(tx.outputs["Color"], b.inputs["Base Color"])
        corte = nt.nodes.new("ShaderNodeMath")
        corte.operation = "ROUND"
        nt.links.new(tx.outputs["Alpha"], corte.inputs[0])
        nt.links.new(corte.outputs["Value"], b.inputs["Alpha"])
        b.inputs["Roughness"].default_value = 0.75
        m.surface_render_method = "DITHERED"
        mb.MAT_NOMES.append(chave)
    return mb.MAT_NOMES.index(chave)


def material_textura(nome):
    """Textura que repete (tijolo, concreto) ou mural opaco, sem emissão."""
    return mb.material_estampa("grafite_" + nome, os.path.join(EST_DIR, nome + ".png"))


def obj(nome, bm, mat):
    mb.materiais()
    for f in bm.faces:
        f.material_index = mb._mat_idx(mat)
    me = bpy.data.meshes.new(nome)
    bm.to_mesh(me)
    bm.free()
    for n in mb.MAT_NOMES:
        me.materials.append(bpy.data.materials[n])
    ob = bpy.data.objects.new(nome, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def quad(nome, x, y, z0, w, h, mat):
    """Retângulo de pé (frente −Y) com UV inteiro: centro em x, plano y, base em z0."""
    bm = bmesh.new()
    vs = [bm.verts.new((x + sx * w / 2, y, z0 + sz * h)) for sx, sz in ((-1, 0), (1, 0), (1, 1), (-1, 1))]
    f = bm.faces.new(vs)
    uvl = bm.loops.layers.uv.new("UVMap")
    for lo, q in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        lo[uvl].uv = q
    if f.normal.y > 0:
        f.normal_flip()
    return obj(nome, bm, mat)


def caixa_textura(l, p, a, x=0.0, y=0.0, z=0.0, mat=0, escala=1.6, bisel=0.02, nome="muro"):
    """Caixa com UV projetado em metros (textura que repete a cada 'escala' m), arestas boleadas."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = V((v.co.x * l + x, v.co.y * p + y, v.co.z * a + a / 2 + z))
    if bisel > 0:
        mb._bevel(bm, min(bisel, l / 2.05, p / 2.05, a / 2.05), 2)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    uvl = bm.loops.layers.uv.new("UVMap")
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for lo in f.loops:
            c = lo.vert.co
            if ax == 1:
                u, v = c.x, c.z
            elif ax == 0:
                u, v = c.y, c.z
            else:
                u, v = c.x, c.y
            lo[uvl].uv = (u / escala, v / escala)
    return obj(nome, bm, mat)


# ======================================================================================================================
DECALQUES = [  # (id, palavra/arquivo, rótulo, largura em m, altura de instalação)
    ("paz", "paz", "Grafite PAZ (azul)", 2.4, 0.6), ("amor", "amor", "Grafite AMOR (rosa)", 3.0, 0.5),
    ("legal", "legal", "Grafite LEGAL (verde)", 3.4, 0.5), ("arte", "arte", "Grafite ARTE (roxo)", 3.0, 0.5),
    ("sonho", "sonho", "Grafite SONHO (turquesa)", 3.6, 0.5), ("vai", "vai", "Grafite VAI (laranja)", 2.2, 0.6),
    ("oi", "oi", "Grafite OI (amarelo)", 1.5, 0.8), ("luz", "luz", "Grafite LUZ (amarelo)", 2.2, 0.6),
    ("fe", "fe", "Grafite FÉ (vermelho)", 1.6, 0.8), ("cores", "cores", "Grafite CORES (arco-íris)", 3.8, 0.4),
    ("rua", "rua", "Grafite RUA (vermelho)", 2.4, 0.6), ("vida", "vida", "Grafite VIDA (verde)", 3.0, 0.5),
    ("seta", "seta", "Tag de seta", 2.6, 0.6), ("estrela", "estrela", "Grafite estrela", 1.5, 0.9),
    ("abstrato_limao", "abstrato_limao", "Grafite abstrato (amarelo-verde)", 3.0, 0.4),
    ("abstrato_laranja", "abstrato_laranja", "Grafite abstrato (laranja)", 2.6, 0.4),
]


def tamanho_png(nome):
    img = bpy.data.images.load(os.path.join(EST_DIR, "grafite_" + nome + ".png"), check_existing=True)
    return img.size[0], img.size[1]


def decalque(nome, w, x=0.0, y=0.0, z0=0.0, objnome=None):
    W, H = tamanho_png(nome)
    h = w * H / W
    mat = material_decalque(nome, os.path.join(EST_DIR, "grafite_" + nome + ".png"))
    return quad(objnome or ("grafite_" + nome), x, y - 0.002, z0, w, h, mat), h


def muro(it, l, a, tipo, grafites, mural, pilares=True, p=0.3):
    """Muro de l × a (sem a capa), frente para −Y. grafites = [(nome, largura, x, z0)], mural = (nome, x, z0, w, h)."""
    mat = material_textura("tijolo" if tipo == "tijolo" else "concreto")
    esc = 1.6 if tipo == "tijolo" else 2.0
    it.add(caixa_textura(l, p, a, mat=mat, escala=esc, bisel=0.02))
    it.add(mb.caixa(l + 0.12, p + 0.16, 0.14, z=a - 0.01, cor="concreto" if tipo == "tijolo" else "concreto_escuro",
                    bisel=0.04))
    it.add(mb.caixa(l + 0.1, p + 0.1, 0.12, z=-0.02, cor="concreto_escuro", bisel=0.03))
    if pilares:
        for x in (-l / 2 + 0.25, l / 2 - 0.25):  # pilares só nas pontas: o meio fica livre para o mural
            it.add(caixa_textura(0.5, p + 0.2, a + 0.05, x=x, mat=mat, escala=esc, bisel=0.03, nome="pilar"))
            it.add(mb.caixa(0.62, p + 0.32, 0.12, x=x, z=a + 0.04, cor="concreto", bisel=0.04))
    if mural:
        nome, x, z0, w, h = mural
        it.add(quad("mural", x, -p / 2 - 0.003, z0, w, h, material_textura(nome)))
    for nome, w, x, z0 in grafites:
        o, _ = decalque(nome, w, x, -p / 2 - 0.002, z0)
        it.add(o)
    it.colisao([((0, 0, 0), (l + 0.3, p + 0.35, a + 0.16))])


MUROS = [
    ("muro_tijolo_casinhas", "Muro de tijolo com mural de casinhas e grafites", 8.0, 2.6, "tijolo",
     [("amor", 1.9, -2.45, 1.0), ("estrela", 0.8, 3.05, 1.5)], ("mural_casinhas", 0.6, 0.35, 4.2, 1.58)),
    ("muro_concreto_mar", "Muro de concreto com mural do mar e grafites", 10.0, 2.9, "concreto",
     [("vida", 2.6, -3.3, 0.6), ("seta", 2.0, 3.5, 1.5), ("oi", 1.2, 3.8, 0.25)], ("mural_mar", 0.0, 0.4, 4.4, 1.65)),
    ("muro_tijolo_flores", "Muro baixo de tijolo com mural de flores e grafites", 6.0, 2.4, "tijolo",
     [("paz", 1.4, -1.7, 0.7), ("fe", 0.8, 2.05, 1.1)], ("mural_flores", 0.3, 0.35, 2.4, 1.2)),
    ("muro_concreto_cores", "Muro comprido de concreto com grafites coloridos", 12.0, 2.8, "concreto",
     [("cores", 3.2, -3.6, 0.9), ("legal", 2.8, 3.7, 1.1), ("abstrato_laranja", 1.6, 0.2, 0.05)],
     ("mural_arcoiris", 0.2, 1.05, 3.0, 1.5)),
]


def main():
    global EST_DIR
    argv = sys.argv[sys.argv.index("--") + 1:]
    saida, filtro = argv[0], argv[1:]
    EST_DIR = os.path.join(saida, CAT, "estampas")
    if "vitrine_muro" in filtro:
        vitrine_muro(saida, noite="noite" in filtro)
        return
    cat = mb.Catalogo(CAT, saida, rotulo="Grafites")
    ids = []
    for id_, nome, rotulo, w, alt in DECALQUES:
        gid = "grafite_" + id_
        ids.append(gid)
        if filtro and gid not in filtro and "decalques" not in filtro:
            continue
        mb.limpa()
        it = mb.Item(gid)
        o, h = decalque(nome, w)
        it.add(o)
        e = cat.exporta(it, rotulo, grupo=gid, fixacao="parede", altura_instalacao=alt,
                        tags=["grafite", "decalque", "parede"], miniatura_dir=MINI_FRENTE,
                        extra={"decalque": True})
        e["colisao"] = []
        cat.salva()
    for id_, rotulo, l, a, tipo, graf, mural in MUROS:
        ids.append(id_)
        if filtro and id_ not in filtro and "muros" not in filtro:
            continue
        mb.limpa()
        it = mb.Item(id_)
        muro(it, l, a, tipo, graf, mural)
        cat.exporta(it, rotulo, grupo=id_, fixacao="chao", tags=["grafite", "muro", tipo],
                    miniatura_dir=(0.35, -1.0, 0.3))
    cat.dados["itens"] = [x for x in cat.dados["itens"] if x["id"] in ids]
    cat.dados["itens"].sort(key=lambda x: ids.index(x["id"]))
    cat.salva()
    print("pecas", len(cat.dados["itens"]), flush=True)


def vitrine_muro(saida, noite=False):
    """Os 16 decalques (dos GLB) num muro de tijolo terracota, como a vitrine de amostras da referência."""
    import json
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    pasta = os.path.join(saida, CAT)
    itens = [i for i in json.load(open(os.path.join(pasta, "catalogo.json")))["itens"] if "decalque" in i["tags"]]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    global EST_DIR
    EST_DIR = os.path.join(pasta, "estampas")
    mb.MAT_NOMES[:] = [n for n in mb.MAT_NOMES if not n.startswith("estampa_")]
    mb.materiais()
    L, A = 17.0, 7.6
    mat = material_textura("tijolo")
    caixa_textura(L, 0.4, A, y=0.2, mat=mat, escala=1.6, bisel=0.03)
    mb.caixa(L + 0.2, 0.6, 0.18, y=0.2, z=A, cor="concreto", bisel=0.05)
    # 4 fileiras de 4, centradas em células de 4 × 1,8 m
    for k, it in enumerate(itens):
        antes = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=os.path.join(pasta, it["arquivo"]))
        novos = [o for o in bpy.data.objects if o not in antes]
        raiz = [o for o in novos if o.parent is None][0]
        c, r = k % 4, k // 4
        w, h = it["dims"][0], it["dims"][2]
        s = min(1.0, 3.9 / w, 1.75 / h)
        raiz.scale = (s, s, s)
        raiz.location = (-L / 2 + 2.125 + 4.25 * c, 0.0, A - 1.9 * (r + 1) + (1.8 - h * s) / 2 + 0.05)
    scn = bpy.context.scene
    scn.render.engine = "CYCLES"
    scn.cycles.samples = int(os.environ.get("AMOSTRAS", 32))
    scn.cycles.use_denoising = True
    scn.render.threads_mode = "FIXED"
    scn.render.threads = int(os.environ.get("MOVEIS_THREADS", "1"))
    scn.render.resolution_x, scn.render.resolution_y = 1800, 860
    scn.view_settings.view_transform = "Standard"
    w = bpy.data.worlds.new("w")
    scn.world = w
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (*mb._lin("#1B2A4A" if noite else "#9DB4D9"), 1)
    w.node_tree.nodes["Background"].inputs[1].default_value = 0.35 if noite else 0.7
    ld = bpy.data.lights.new("sol", "SUN")
    ld.energy = 0.6 if noite else 3.0
    ld.angle = math.radians(6)
    sol = bpy.data.objects.new("sol", ld)
    scn.collection.objects.link(sol)
    sol.rotation_euler = (math.radians(50), 0, math.radians(-25))
    cd = bpy.data.cameras.new("c")
    cd.type = "ORTHO"
    cam = bpy.data.objects.new("c", cd)
    scn.collection.objects.link(cam)
    scn.camera = cam
    cam.location = (0, -40, A / 2 + 2.5)
    cam.rotation_euler = (V((0, 0, A / 2)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    cd.ortho_scale = L * 1.04
    scn.render.image_settings.file_format = "PNG"
    scn.render.filepath = os.path.join(pasta, "vitrine_muro" + ("_noite" if noite else "") + ".png")
    bpy.ops.render.render(write_still=True)
    print("vitrine", scn.render.filepath, flush=True)


if __name__ == "__main__":
    main()
