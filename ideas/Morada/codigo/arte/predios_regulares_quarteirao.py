"""Teste de quarteirão dos prédios regulares: 4 × 4 quadras com ruas e calçadas (GLB das categorias ruas e pisos) e
os prédios nos lotes, renderizado de dia e de noite para conferir a escala em relação à rua e o encaixe nos lotes.

Uso: blender-venv/bin/python -I morada-art/predios_regulares_quarteirao.py -- SP/cidade_out [a|b ...] [dia|noite]
Grava SP/cidade_out/predios_regulares/quarteirao_<x>_<dia|noite>.png e imprime os prédios que passam do lote.
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
CAT = "predios_regulares"

# (categoria, id, coluna, linha, giro em graus, (nx, ny) já girado). Célula (i, j): centro (−22,5 + 15 i, −22,5 + 15 j).
RUAS = [
    ("ruas", "rua_reta", 2, 0, 0, (1, 1)), ("ruas", "rua_reta", 2, 2, 0, (1, 1)), ("ruas", "rua_reta", 2, 3, 0, (1, 1)),
    ("ruas", "rua_reta", 0, 1, 90, (1, 1)), ("ruas", "rua_reta_faixa_pedestres", 1, 1, 90, (1, 1)),
    ("ruas", "rua_cruzamento_x_faixas", 2, 1, 0, (1, 1)), ("ruas", "rua_reta", 3, 1, 90, (1, 1)),
]
LOTES = {
    "a": [
        (CAT, "torre_faixas_vermelhas", 0, 3, 0, (1, 1)), (CAT, "apto_bege_8_andares", 1, 3, 0, (1, 1)),
        (CAT, "cinema", 3, 3, -90, (1, 1)),
        (CAT, "predio_cinza_varandas", 0, 2, 0, (2, 1)), (CAT, "loja_esquina_cafe", 3, 2, -90, (1, 1)),
        (CAT, "predio_tijolo_comprido", 0, 0, 180, (2, 1)), (CAT, "loja_esquina_padaria", 3, 0, -90, (1, 1)),
    ],
    "b": [
        (CAT, "casas_geminadas_pastel", 0, 3, 0, (1, 1)), (CAT, "sobrado_tijolo", 1, 3, 0, (1, 1)),
        (CAT, "torre_curva_empresarial", 3, 3, -90, (1, 1)),
        (CAT, "lojas_2andares_flores", 0, 2, 0, (1, 1)), (CAT, "mercadinho", 1, 2, 0, (1, 1)),
        (CAT, "predio_farmacia", 3, 2, -90, (1, 1)),
        (CAT, "boliche", 0, 0, 180, (1, 1)), (CAT, "salao_musica_violino", 1, 0, 180, (1, 1)),
        (CAT, "hotel", 3, 0, -90, (1, 1)),
    ],
}


def importa(saida, cat, id_, i, j, giro, nx, ny):
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(saida, cat, "glb", id_ + ".glb"))
    novos = [o for o in bpy.data.objects if o not in antes]
    raiz = [o for o in novos if o.parent is None][0]
    raiz.location = (-2 * Q + Q * i + nx * Q / 2, -2 * Q + Q * j + ny * Q / 2, 0)
    raiz.rotation_mode = "XYZ"
    raiz.rotation_euler = (raiz.rotation_euler.x, raiz.rotation_euler.y, math.radians(giro))
    return novos


def monta(saida, chave):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for p in RUAS:
        importa(saida, *p[:5], *p[5])
    problemas = []
    for cat, id_, i, j, giro, (nx, ny) in LOTES[chave]:
        for a in range(nx):
            for b in range(ny):
                importa(saida, "pisos", "piso_calcada_lisa", i + a, j + b, 0, 1, 1)
        novos = importa(saida, cat, id_, i, j, giro, nx, ny)
        bpy.context.view_layer.update()
        pts = [o.matrix_world @ V(c) for o in novos if o.type == "MESH" for c in o.bound_box]
        x0, x1 = min(p.x for p in pts), max(p.x for p in pts)
        y0, y1 = min(p.y for p in pts), max(p.y for p in pts)
        z0 = min(p.z for p in pts)
        lx0, ly0 = -2 * Q + Q * i, -2 * Q + Q * j
        folga = min(x0 - lx0, lx0 + nx * Q - x1, y0 - ly0, ly0 + ny * Q - y1)
        print(f"lote {id_}: folga mínima até a borda do lote {folga:.2f} m, base z = {z0:.3f}", flush=True)
        if folga < 0.99 or abs(z0) > 0.02:
            problemas.append((id_, round(folga, 2), round(z0, 3)))
    return problemas


def render(arquivo, noite=False, res=(1800, 1400), amostras=40):
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
    ld.energy = 0.5 if noite else 3.0
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
    pts = [o.matrix_world @ V(c) for o in scn.objects if o.type == "MESH" and o.name != "chao" for c in o.bound_box]
    lo = V([min(p[i] for p in pts) for i in range(3)])
    hi = V([max(p[i] for p in pts) for i in range(3)])
    c = (lo + hi) / 2
    d = V((0.5, -1.0, 0.95)).normalized()
    cam.location = c + d * 200
    cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler()
    R = cam.rotation_euler.to_matrix().inverted()
    proj = [R @ (p - c) for p in pts]
    ex = max(q.x for q in proj) - min(q.x for q in proj)
    ey = max(q.y for q in proj) - min(q.y for q in proj)
    cd.ortho_scale = max(ex, ey * res[0] / res[1]) * 1.04
    cam.location += cam.matrix_world.to_3x3() @ V(((max(q.x for q in proj) + min(q.x for q in proj)) / 2,
                                                   (max(q.y for q in proj) + min(q.y for q in proj)) / 2, 0))
    cd.clip_end = 600
    scn.render.image_settings.file_format = "PNG"
    scn.render.filepath = arquivo
    bpy.ops.render.render(write_still=True)
    print("render", arquivo, flush=True)


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:]
    saida = args[0]
    chaves = [a for a in args[1:] if a in LOTES] or list(LOTES)
    modos = [a for a in args[1:] if a in ("dia", "noite")] or ["dia", "noite"]
    for ch in chaves:
        for modo in modos:
            prob = monta(saida, ch)
            print(f"quarteirão {ch}: {len(prob)} prédios fora do lote ou fora do chão: {prob}", flush=True)
            if "--sem-render" not in args:
                render(os.path.join(saida, CAT, f"quarteirao_{ch}_{modo}.png"), noite=(modo == "noite"))
