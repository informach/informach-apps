"""Teste de cena dos barcos: marina com o cais, a orla e a água aberta da categoria agua (GLB), a rua atrás, os barcos
ancorados nos píeres e junto à mureta, os pequenos soltos na água, a barca e o navio de cruzeiro ao largo. Renderiza
de dia e de noite, na vista geral e de perto (no cais).

Uso: MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/barcos_cena.py -- SP/cidade_out [geral|cais] [dia|noite]
Grava SP/cidade_out/barcos/teste_cena_<dia|noite>.png (geral) e teste_cena_cais_<dia|noite>.png (de perto).

A água da orla, do cais e da água aberta fica em z = −1,0 (cidade_agua_estruturas.Z_AGUA_CANAL), com o fundo em −1,7:
a linha d'água dos barcos (a origem deles) vai em z = −1,0.
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
Q = 15.0
Z_AGUA = -1.0
ARGS = sys.argv[sys.argv.index("--") + 1:]
OUT = ARGS[0]
XS = [-37.5, -22.5, -7.5, 7.5, 22.5, 37.5]
CAIS = (-37.5, -7.5, 22.5)


def importa(cat, id_, x, y, z=0.0, rot=0.0):
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(OUT, cat, "glb", id_ + ".glb"))
    novos = [o for o in bpy.data.objects if o not in antes]
    for o in novos:
        if o.get("colisao"):
            o.hide_render = True
    raiz = [o for o in novos if o.parent is None][0]
    raiz.matrix_world = Matrix.Translation((x, y, z)) @ Matrix.Rotation(math.radians(rot), 4, "Z") @ raiz.matrix_world
    return raiz, novos


def dims(id_):
    import json
    cat = json.load(open(os.path.join(OUT, "barcos", "catalogo.json")))
    return next(i["dims"] for i in cat["itens"] if i["id"] == id_)


def monta():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for x in XS:
        importa("ruas", "rua_reta", x, -Q, rot=90)
        importa("agua", "cais" if x in CAIS else "orla", x, 0.0)
        for j in (1, 2, 3):
            importa("agua", "agua_aberta", x, Q * j)
    barcos = []
    # nos píeres (popa para a mureta, proa para o mar): girados 180°
    pier = {-37.5: ("veleiro_branco", "veleiro_madeira_verde"), -7.5: ("iate_cupula_azul", "veleiro_vela_vermelha"),
            22.5: ("barco_passeio_laranja", "iate_flybridge")}
    for x0, (a, b) in pier.items():
        for id_, sx in ((a, 1), (b, -1)):
            l, p, _ = dims(id_)
            barcos.append((id_, x0 + sx * (1.6 + l / 2 + 0.35), -2.0 + 0.6 + p / 2, 180.0))
    # junto à mureta da orla (de lado, proa para +X)
    for x0, id_ in ((-22.5, "barco_pesca"), (7.5, "barco_passeio_azul"), (37.5, "veleiro_madeira_laranja")):
        l, p, _ = dims(id_)
        barcos.append((id_, x0, -2.0 + l / 2 + 0.45, 90.0))
    # soltos na água
    barcos += [("lancha_verde_limao", -26.0, 13.5, 35.0), ("lancha_vermelha", -13.0, 15.5, -55.0),
               ("pedalinho_cisne", -3.0, 12.5, 200.0), ("bote_inflavel", 4.5, 13.0, 110.0),
               ("caiaque", 10.5, 16.5, 70.0), ("balsa_passageiros", 30.0, 15.5, 90.0),
               ("navio_cruzeiro", 0.0, 34.5, -90.0)]
    for id_, x, y, r in barcos:
        importa("barcos", id_, x, y, Z_AGUA, r)
    bpy.context.view_layer.update()


def render(arquivo, noite=False, regiao=None, direcao=(0.42, -1.0, 0.8), res=(2000, 1250), amostras=32):
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
    w.node_tree.nodes["Background"].inputs[1].default_value = 0.35 if noite else 0.6
    mb.emissao_janelas(mb.JANELA_FORCA * 1.4 if noite else 0.0)
    me = bpy.data.meshes.new("chao")
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=600)
    bm.to_mesh(me)
    bm.free()
    m = bpy.data.materials.new("chao_cena")
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*mb._lin("#141E36" if noite else "#2A3D63"), 1)
    b.inputs["Roughness"].default_value = 0.9
    me.materials.append(m)
    ch = bpy.data.objects.new("chao", me)
    scn.collection.objects.link(ch)
    ch.location = (0, 0, -2.0)
    ld = bpy.data.lights.new("sol", "SUN")
    ld.energy = 0.45 if noite else 3.0
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
    pts = [o.matrix_world @ V(c) for o in scn.objects if o.type == "MESH" and o.name != "chao" and not o.hide_render
           for c in o.bound_box]
    if regiao:
        x0, x1, y0, y1 = regiao
        pts = [p for p in pts if x0 <= p.x <= x1 and y0 <= p.y <= y1] + \
              [V((x, y, -1.0)) for x in (x0, x1) for y in (y0, y1)]
    lo = V([min(p[i] for p in pts) for i in range(3)])
    hi = V([max(p[i] for p in pts) for i in range(3)])
    c = (lo + hi) / 2
    d = V(direcao).normalized()
    cam.location = c + d * 300
    cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler()
    R = cam.rotation_euler.to_matrix().inverted()
    proj = [R @ (p - c) for p in pts]
    ex = max(q.x for q in proj) - min(q.x for q in proj)
    ey = max(q.y for q in proj) - min(q.y for q in proj)
    cd.ortho_scale = max(ex, ey * res[0] / res[1]) * 1.03
    cam.location += cam.matrix_world.to_3x3() @ V(((max(q.x for q in proj) + min(q.x for q in proj)) / 2,
                                                   (max(q.y for q in proj) + min(q.y for q in proj)) / 2, 0))
    cd.clip_end = 1000
    scn.render.image_settings.file_format = "PNG"
    scn.render.filepath = arquivo
    bpy.ops.render.render(write_still=True)
    print("render", arquivo, flush=True)


if __name__ == "__main__":
    vistas = [a for a in ARGS[1:] if a in ("geral", "cais")] or ["geral", "cais"]
    modos = [a for a in ARGS[1:] if a in ("dia", "noite")] or ["dia", "noite"]
    for v in vistas:
        for modo in modos:
            monta()
            nome = "teste_cena" + ("_cais" if v == "cais" else "") + f"_{modo}.png"
            regiao = (-16.0, 30.0, -9.0, 12.0) if v == "cais" else None
            render(os.path.join(OUT, "barcos", nome), noite=(modo == "noite"), regiao=regiao)
