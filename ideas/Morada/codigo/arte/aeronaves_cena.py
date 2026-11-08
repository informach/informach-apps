"""Teste de cena das aeronaves: quarteirão de 4 × 4 quadras (ruas, pisos e prédios da biblioteca) com aeronaves no ar,
de 30 a 80 m, e algumas pousadas (helicóptero na praça, balão na grama, teco-teco na grama). Renderiza de dia e de
noite para conferir a escala em relação à cidade e o acender das luzes.

Uso: MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/aeronaves_cena.py -- SP/cidade_out [dia|noite]
Grava SP/cidade_out/aeronaves/teste_cena_<dia|noite>.png.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Vector  # noqa: E402

import moveis_base as mb  # noqa: E402

V = Vector
Q = 15.0
CAT = "aeronaves"

# (categoria, id, coluna, linha, giro). Célula (i, j): centro (−22,5 + 15 i, −22,5 + 15 j).
CHAO = [
    ("ruas", "rua_reta", 2, 0, 0), ("ruas", "rua_reta", 2, 2, 0), ("ruas", "rua_reta", 2, 3, 0),
    ("ruas", "rua_reta", 0, 1, 90), ("ruas", "rua_reta_faixa_pedestres", 1, 1, 90),
    ("ruas", "rua_cruzamento_x_faixas", 2, 1, 0), ("ruas", "rua_reta", 3, 1, 90),
    ("pisos", "piso_calcada_lisa", 0, 3, 0), ("pisos", "piso_calcada_lisa", 1, 3, 0),
    ("pisos", "piso_calcada_lisa", 3, 3, 0), ("pisos", "piso_calcada_lisa", 0, 0, 0),
    ("pisos", "piso_calcada_lisa", 3, 0, 0), ("pisos", "piso_calcada_lisa", 0, 2, 0),
    ("pisos", "piso_praca", 3, 2, 0), ("pisos", "piso_grama", 1, 2, 0), ("pisos", "piso_grama", 1, 0, 0),
]
PREDIOS = [
    ("predios_regulares", "torre_faixas_vermelhas", 0, 3, 0), ("predios_regulares", "apto_bege_8_andares", 1, 3, 0),
    ("predios_regulares", "hotel", 3, 3, -90), ("predios_regulares", "loja_esquina_cafe", 0, 2, 0),
    ("predios_regulares", "sobrado_tijolo", 0, 0, 180), ("predios_regulares", "mercadinho", 3, 0, -90),
]
# aeronaves: (id, x, y, z, giro)
NO_CHAO = [
    ("helicoptero_verde", 22.5, 7.5, 0.0, -30), ("balao_listrado_vermelho_branco", -7.5, 7.5, 0.0, 0),
    ("aviao_teco_teco_amarelo", -7.5, -22.5, 0.0, 35),
]
NO_AR = [
    ("aviao_passageiros_azul", 0.0, 62.0, 80.0, -115), ("dirigivel_arco_iris", 48.0, 30.0, 62.0, -75),
    ("balao_lua_estrelas", -52.0, -8.0, 46.0, 15), ("balao_dragao_roxo", 52.0, -28.0, 54.0, -20),
    ("helicoptero_vermelho", -22.0, -48.0, 32.0, 40), ("balao_abelha", -50.0, 40.0, 70.0, 0),
    ("balao_polvo_pirata", 14.0, -52.0, 38.0, -10), ("ultraleve_trike_arco_iris", 34.0, -62.0, 34.0, 120),
]


def importa(pasta_cat, id_, x, y, z, giro):
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(pasta_cat, "glb", id_ + ".glb"))
    novos = [o for o in bpy.data.objects if o not in antes]
    raiz = [o for o in novos if o.parent is None][0]
    raiz.location = (x, y, z)
    raiz.rotation_mode = "XYZ"
    raiz.rotation_euler = (raiz.rotation_euler.x, raiz.rotation_euler.y, math.radians(giro))
    return novos


def celula(i, j):
    return -2 * Q + Q * i + Q / 2, -2 * Q + Q * j + Q / 2


def monta(saida):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for cat, id_, i, j, giro in CHAO + PREDIOS:
        x, y = celula(i, j)
        importa(os.path.join(saida, cat), id_, x, y, 0.0, giro)
    for id_, x, y, z, giro in NO_CHAO + NO_AR:
        novos = importa(os.path.join(saida, CAT), id_, x, y, z, giro)
        bpy.context.view_layer.update()
        zmin = min((o.matrix_world @ V(c)).z for o in novos if o.type == "MESH" and not o.get("colisao")
                   for c in o.bound_box)
        print(f"{id_}: base em z = {zmin:.2f}", flush=True)


def render(arquivo, noite=False, res=(1800, 1500), amostras=36):
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
    w.node_tree.nodes["Background"].inputs[1].default_value = 0.4 if noite else 0.6
    mb.emissao_janelas(mb.JANELA_FORCA * 1.4 if noite else 0.0)
    chao = bpy.data.meshes.new("chao")
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=600)
    bm.to_mesh(chao)
    bm.free()
    m = bpy.data.materials.new("chao_cena")
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*mb._lin("#141E36" if noite else "#2A3D63"), 1)
    b.inputs["Roughness"].default_value = 0.9
    chao.materials.append(m)
    ob = bpy.data.objects.new("chao", chao)
    scn.collection.objects.link(ob)
    ob.location = (0, 0, -0.42)
    ld = bpy.data.lights.new("sol", "SUN")
    ld.energy = 0.5 if noite else 3.0
    if noite:
        ld.color = (0.6, 0.7, 1.0)
    ld.angle = math.radians(6)
    sol = bpy.data.objects.new("sol", ld)
    scn.collection.objects.link(sol)
    sol.rotation_euler = (math.radians(38), 0, math.radians(-38))
    cd = bpy.data.cameras.new("c")
    cd.type = "ORTHO"
    cam = bpy.data.objects.new("c", cd)
    scn.collection.objects.link(cam)
    scn.camera = cam
    pts = [o.matrix_world @ V(c) for o in scn.objects if o.type == "MESH" and o.name != "chao" and
           not o.get("colisao") for c in o.bound_box]
    lo = V([min(p[i] for p in pts) for i in range(3)])
    hi = V([max(p[i] for p in pts) for i in range(3)])
    c = (lo + hi) / 2
    d = V((0.45, -1.0, 0.4)).normalized()
    cam.location = c + d * 300
    cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler()
    R = cam.rotation_euler.to_matrix().inverted()
    proj = [R @ (p - c) for p in pts]
    ex = max(q.x for q in proj) - min(q.x for q in proj)
    ey = max(q.y for q in proj) - min(q.y for q in proj)
    cd.ortho_scale = max(ex, ey * res[0] / res[1]) * 1.04
    cam.location += cam.matrix_world.to_3x3() @ V(((max(q.x for q in proj) + min(q.x for q in proj)) / 2,
                                                   (max(q.y for q in proj) + min(q.y for q in proj)) / 2, 0))
    cd.clip_end = 900
    scn.render.image_settings.file_format = "PNG"
    scn.render.filepath = arquivo
    bpy.ops.render.render(write_still=True)
    print("render", arquivo, flush=True)


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:]
    saida = args[0]
    modos = [a for a in args[1:] if a in ("dia", "noite")] or ["dia", "noite"]
    for modo in modos:
        monta(saida)
        render(os.path.join(saida, CAT, f"teste_cena_{modo}.png"), noite=(modo == "noite"))
