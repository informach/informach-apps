"""Teste de quarteirão dos prédios mágicos: um trecho de 5 × 4 quadras com ruas (categoria ruas), pisos de grama nos
lotes (categoria pisos) e os prédios mágicos nos lotes, renderizado de dia e de noite para conferir a escala em relação à
rua e o encaixe nos lotes de 15 m.

Uso: MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/predios_magicos_quarteirao.py -- SP/cidade_out [dia|noite]
Grava SP/cidade_out/predios_magicos/quarteirao_dia.png e quarteirao_noite.png e imprime, para cada prédio, a projeção
real (x, y) e se cabe no lote (projeção ≤ 13 m por quadra, centrada no lote).
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
NX, NY = 5, 4

# (categoria, id, coluna i, linha j, giro em graus, (nx, ny) em quadras já girado)
# Células: coluna i (oeste → leste), linha j (sul → norte). A rua corre na linha j = 1 (leste-oeste) e sobe pela
# coluna i = 2 (para o norte) a partir de um T. Os prédios olham para a rua mais próxima.
PECAS = [
    ("ruas", "rua_reta", 0, 1, 90, (1, 1)), ("ruas", "rua_reta", 1, 1, 90, (1, 1)),
    ("ruas", "rua_cruzamento_t", 2, 1, 180, (1, 1)),
    ("ruas", "rua_reta", 3, 1, 90, (1, 1)), ("ruas", "rua_reta", 4, 1, 90, (1, 1)),
    ("ruas", "rua_reta", 2, 2, 0, (1, 1)), ("ruas", "rua_reta_faixa_pedestres", 2, 3, 0, (1, 1)),
]
for _i in range(NX):
    PECAS.append(("pisos", "piso_grama", _i, 0, 0, (1, 1)))
for _i, _j in ((0, 2), (1, 2), (0, 3), (1, 3), (3, 2), (3, 3), (4, 2), (4, 3)):
    PECAS.append(("pisos", "piso_grama", _i, _j, 0, (1, 1)))
PREDIOS = [
    ("casa_torta_empena_rosa", 0, 0, 180, (1, 1)), ("casa_doce_rosa", 1, 0, 180, (1, 1)),
    ("cristais_roxos", 2, 0, 180, (1, 1)), ("casa_cogumelo_vermelho", 3, 0, 180, (1, 1)),
    ("casa_cubo_magico", 4, 0, 180, (1, 1)),
    ("castelo_rosa", 0, 2, 0, (2, 2)),
    ("casa_torta_lucarnas_verde", 3, 2, -90, (1, 1)), ("casa_arvore", 3, 3, -90, (1, 1)),
    ("castelo_areia", 4, 2, 0, (1, 1)), ("casa_abobora", 4, 3, -90, (1, 1)),
]


def centro(i, j, nx, ny):
    return (-NX * Q / 2 + Q * i + nx * Q / 2, -NY * Q / 2 + Q * j + ny * Q / 2)


def importa(caminho, i, j, giro, n):
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=caminho)
    novos = [o for o in bpy.data.objects if o not in antes]
    raiz = [o for o in novos if o.parent is None][0]
    cx, cy = centro(i, j, *n)
    raiz.location = (cx, cy, 0)
    raiz.rotation_mode = "XYZ"
    raiz.rotation_euler = (raiz.rotation_euler.x, raiz.rotation_euler.y, math.radians(giro))
    return novos


def monta(saida):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for cat, id_, i, j, giro, n in PECAS:
        importa(os.path.join(saida, cat, "glb", id_ + ".glb"), i, j, giro, n)
    pasta = os.path.join(saida, "predios_magicos", "glb")
    bpy.context.view_layer.update()
    for id_, i, j, giro, n in PREDIOS:
        novos = importa(os.path.join(pasta, id_ + ".glb"), i, j, giro, n)
        bpy.context.view_layer.update()
        pts = [o.matrix_world @ v.co for o in novos if o.type == "MESH" and not o.get("colisao")
               for v in o.data.vertices]
        lo = V([min(p[k] for p in pts) for k in range(3)])
        hi = V([max(p[k] for p in pts) for k in range(3)])
        cx, cy = centro(i, j, *n)
        lim_x, lim_y = n[0] * Q / 2 - 1.0, n[1] * Q / 2 - 1.0
        cabe = (lo.x >= cx - lim_x - 0.05 and hi.x <= cx + lim_x + 0.05 and lo.y >= cy - lim_y - 0.05 and
                hi.y <= cy + lim_y + 0.05 and lo.z > -0.01)
        print(f"lote {id_}: x {lo.x - cx:+.2f}..{hi.x - cx:+.2f}  y {lo.y - cy:+.2f}..{hi.y - cy:+.2f}  "
              f"z {lo.z:.2f}..{hi.z:.2f}  {'cabe' if cabe else 'NAO CABE'}", flush=True)


def render(arquivo, noite=False, res=(1800, 1300), amostras=48):
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
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=400)
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
    d = V((0.45, -1.0, 1.0)).normalized()
    alvo = V((0, 3.0, 9.0))
    cam.location = alvo + d * 200
    cam.rotation_euler = (alvo - cam.location).to_track_quat("-Z", "Y").to_euler()
    cd.ortho_scale = 96
    cd.clip_end = 500
    scn.render.image_settings.file_format = "PNG"
    scn.render.filepath = arquivo
    bpy.ops.render.render(write_still=True)
    print("render", arquivo, flush=True)


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:]
    saida = args[0]
    modos = [a for a in args[1:] if a in ("dia", "noite")] or ["dia", "noite"]
    if "--sem-render" in args:
        monta(saida)
    for md in ([] if "--sem-render" in args else modos):
        monta(saida)  # cena limpa a cada modo (o sol do dia não pode sobrar na noite)
        render(os.path.join(saida, "predios_magicos", f"quarteirao_{md}.png"), noite=md == "noite")
