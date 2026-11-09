"""Teste de quarteirão dos prédios de Chinatown: 5 × 5 quadras com uma rua leste-oeste e uma norte-sul cruzando no
meio (peças das categorias ruas e pisos) e os prédios nos 16 lotes, de frente para a rua. Renderiza de dia e de noite
para conferir a escala em relação à rua e o encaixe nos lotes.

Uso: MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/predios_chinatown_quarteirao.py -- SP/cidade_out [dia|noite]
Grava SP/cidade_out/predios_chinatown/quarteirao_dia.png e quarteirao_noite.png.
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

# (coluna i, linha j) → id do prédio. Rua leste-oeste na linha j = 2, rua norte-sul na coluna i = 2.
LOTES = {
    (0, 1): "loja_2_andares_vermelha", (1, 1): "restaurante_sushi", (3, 1): "casa_de_cha",
    (4, 1): "loja_3_andares_laranja",
    (0, 0): "pagode_pequeno_roxo", (1, 0): "predio_colorido_beirais_laranja", (3, 0): "restaurante_macarrao",
    (4, 0): "pagode_hexagonal_azul",
    (0, 3): "edificio_beirais_vermelho", (1, 3): "predio_estreito_pagode_verde",
    (0, 4): "torre_onda_azul", (1, 4): "pagode_alto_7_jade", (3, 4): "torre_pagode_sobre_predio",
    (4, 4): "predio_vidro_coroa_cinza",
}
TEMPLO = ((3, 3), (4, 3), "templo_comprido_cinza")


def importa(pasta, cat, id_, x, y, rot):
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(pasta, cat, "glb", id_ + ".glb"))
    novos = [o for o in bpy.data.objects if o not in antes]
    raiz = [o for o in novos if o.parent is None][0]
    raiz.location = (x, y, 0)
    raiz.rotation_mode = "XYZ"
    raiz.rotation_euler = (raiz.rotation_euler[0], 0, math.radians(rot))
    return raiz


def centro(i, j):
    return ((i - 2) * Q, (j - 2) * Q)


def monta(saida):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for i in range(5):
        for j in range(5):
            x, y = centro(i, j)
            if i == 2 and j == 2:
                importa(saida, "ruas", "rua_cruzamento_x", x, y, 0)
            elif i == 2:
                importa(saida, "ruas", "rua_reta" if j != 1 else "rua_reta_faixa_pedestres", x, y, 0)
            elif j == 2:
                importa(saida, "ruas", "rua_reta" if i != 3 else "rua_reta_faixa_pedestres", x, y, 90)
            else:
                importa(saida, "pisos", "piso_calcada_lisa" if (i + j) % 2 else "piso_ladrilho_rosado", x, y, 0)
    pasta = os.path.join(saida, "predios_chinatown")
    for (i, j), id_ in LOTES.items():
        x, y = centro(i, j)
        rot = 180 if j < 2 else 0  # frente para a rua leste-oeste
        if j in (0, 4) and i in (1, 3):
            rot = -90 if i == 1 else 90  # de frente para a rua norte-sul
        importa(os.path.dirname(pasta), "predios_chinatown", id_, x, y, rot)
    (i0, j0), (i1, j1), id_ = TEMPLO
    x0, y0 = centro(i0, j0)
    x1, y1 = centro(i1, j1)
    importa(os.path.dirname(pasta), "predios_chinatown", id_, (x0 + x1) / 2, (y0 + y1) / 2, 0)


def render(arquivo, noite=False, res=(1800, 1150), amostras=32):
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
    chao = bpy.data.meshes.new("chao")
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=400)
    bm.to_mesh(chao)
    bm.free()
    m = bpy.data.materials.new("chao_q")
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*mb._lin("#141E36" if noite else "#2A3D63"), 1)
    chao.materials.append(m)
    ob = bpy.data.objects.new("chao", chao)
    scn.collection.objects.link(ob)
    ob.location = (0, 0, -0.42)
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
    d = V((0.55, -1.0, 0.95)).normalized()
    alvo = V((0, 6, 17))
    cam.location = alvo + d * 220
    cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    cd.ortho_scale = 138
    cd.clip_end = 600
    scn.render.image_settings.file_format = "PNG"
    scn.render.filepath = arquivo
    bpy.ops.render.render(write_still=True)
    print("quarteirao", arquivo, flush=True)


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:]
    saida = args[0]
    modos = [a for a in args[1:] if a in ("dia", "noite")] or ["dia", "noite"]
    for modo in modos:
        monta(saida)
        render(os.path.join(saida, "predios_chinatown", f"quarteirao_{modo}.png"), noite=(modo == "noite"))
