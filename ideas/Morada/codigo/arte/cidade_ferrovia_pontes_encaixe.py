"""Teste de encaixe da ferrovia e das pontes: monta as peças encostadas (com as ruas da base) e renderiza.

  blender-venv/bin/python -I morada-art/cidade_ferrovia_pontes_encaixe.py -- SP/cidade_out ferrovia|pontes saida.png
      [alvo=x,y,z,raio] [dir=x,y,z] [res=L,A]
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Vector as V  # noqa: E402

import moveis_base as mb  # noqa: E402

Z_EL = 7.5
a = sys.argv[sys.argv.index("--") + 1:]
SAIDA, MONTAGEM, ARQ = a[0], a[1], a[2]
op = dict(x.split("=") for x in a[3:] if "=" in x)
BASE = os.path.join(SAIDA, "teste_cidade")  # ruas da base (cidade_teste.py)

# (categoria, id, x, y, z, rotação em graus)
MONTAGENS = {
    "ferrovia": [
        ("ferrovia", "trilho_desvio", 7.5, 7.5, 0, 0),
        ("ferrovia", "trilho_reto", 0, 30, 0, 0),
        ("ferrovia", "trilho_fim", 15, 30, 0, 0),
        ("ferrovia", "trilho_curva", 7.5, 52.5, 0, 0),
        ("ferrovia", "trilho_cruzamento_rua", 30, 60, 0, 0),
        ("ferrovia", "plataforma_estacao", 45, 60, 0, 90),
        ("ferrovia", "plataforma_estacao", 60, 60, 0, 90),
        ("teste_cidade", "rua_reta", 30, 75, 0, 0),
        ("teste_cidade", "rua_reta", 30, 45, 0, 0),
        ("ferrovia", "bonde_rua", 30, 30, 0, 0),
        ("ferrovia", "bonde_grama", 30, 15, 0, 0),
        ("ferrovia", "bonde_piso", 30, 0, 0, 0),
        ("teste_cidade", "rua_cruzamento_t", 30, -15, 0, 180),
        ("ferrovia", "trilho_reto", 0, -15, 0, 0),
        ("ferrovia", "trilho_fim", 0, -30, 0, 180),
        ("ferrovia", "trem_tabuleiro_aberto", 60, 15, 0, 0),
        ("ferrovia", "trem_tubo_reto", 60, 30, 0, 0),
        ("ferrovia", "trem_tubo_reto", 60, 0, 0, 0),
        ("ferrovia", "trem_pilar", 60, -7.5, 0, 0),
    ],
    "vitrine_pontes": [
        ("pontes", "ponte_estaiada_agulha", 0, 75, 0, 90),
        ("pontes", "ponte_estaiada_v", 0, 45, 0, 90),
        ("pontes", "ponte_laco", 0, 15, 0, 90),
        ("pontes", "ponte_passarela", -30, -15, 0, 0),
        ("pontes", "ponte_arco_tijolo", -10, -15, 0, 0),
        ("pontes", "ponte_tabuleiro_rua", 10, -15, 0, 0),
        ("pontes", "ponte_tabuleiro_avenida", 30, -15, 0, 0),
    ],
    "pontes": [
        ("pontes", "ponte_estaiada_agulha", 0, -45, 0, 0),
        ("pontes", "ponte_tabuleiro_rua", 0, 0, 0, 0),
        ("teste_cidade", "rua_reta", 0, 15, Z_EL, 0),
        ("pontes", "ponte_laco", 20, -45, 0, 0),
        ("pontes", "ponte_tabuleiro_rua", 20, 0, 0, 0),
        ("pontes", "ponte_estaiada_v", 40, -52.5, 0, 0),
        ("pontes", "ponte_tabuleiro_avenida", 60, 0, 0, 0),
        ("teste_cidade", "avenida_reta", 60, 15, Z_EL, 0),
        ("pontes", "ponte_tabuleiro_avenida", 60, -15, 0, 0),
        ("teste_cidade", "rua_reta", 80, 15, 0, 0),
        ("pontes", "ponte_arco_tijolo", 80, 0, 0, 0),
        ("teste_cidade", "rua_reta", 80, -15, 0, 0),
        ("pontes", "ponte_passarela", 80, -30, 0, 0),
        ("teste_cidade", "rua_cruzamento_x", 80, -45, 0, 0),
        ("pontes", "ponte_arco_tijolo", 80, -60, 0, 0),
    ],
}


def importa(cat, ident, x, y, z, rot):
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(SAIDA, cat, "glb", ident + ".glb"))
    novos = [o for o in bpy.data.objects if o not in antes]
    raiz = [o for o in novos if o.parent is None][0]
    raiz.location = (x, y, z)
    raiz.rotation_mode = "XYZ"
    raiz.rotation_euler = (0, 0, math.radians(rot))
    return novos


bpy.ops.wm.read_factory_settings(use_empty=True)
todos = []
for p in MONTAGENS[MONTAGEM]:
    todos += importa(*p)
bpy.context.view_layer.update()
pts = [o.matrix_world @ V(c) for o in todos if o.type == "MESH" for c in o.bound_box]
lo = V([min(p[i] for p in pts) for i in range(3)])
hi = V([max(p[i] for p in pts) for i in range(3)])
c = (lo + hi) / 2
raio = None
if "alvo" in op:
    q = [float(t) for t in op["alvo"].split(",")]
    c, raio = V(q[:3]), q[3]
res = tuple(int(t) for t in op.get("res", "1800,1100").split(","))
scn = bpy.context.scene
scn.render.engine = "CYCLES"
scn.cycles.samples = int(os.environ.get("AMOSTRAS", 40))
scn.cycles.use_denoising = True
scn.render.threads_mode = "FIXED"
scn.render.threads = int(os.environ.get("MOVEIS_THREADS", "1"))
scn.render.resolution_x, scn.render.resolution_y = res
scn.view_settings.view_transform = "Standard"
w = bpy.data.worlds.new("w")
scn.world = w
w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (*mb._lin("#9DB4D9"), 1)
w.node_tree.nodes["Background"].inputs[1].default_value = 0.6
chao = bpy.data.meshes.new("chao")
bm = bmesh.new()
bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=400)
bm.to_mesh(chao)
bm.free()
m, b = mb._principled("chao_vitrine")
b.inputs["Base Color"].default_value = (*mb._lin("#2A3D63"), 1)
chao.materials.append(m)
ob = bpy.data.objects.new("chao", chao)
scn.collection.objects.link(ob)
ob.location = (c.x, c.y, -0.45)
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
d = V([float(t) for t in op.get("dir", "0.45,-1,0.95").split(",")]).normalized()
cam.location = c + d * 300
cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler()
if raio:
    cd.ortho_scale = raio * 2
else:
    R = cam.rotation_euler.to_matrix().inverted()
    proj = [R @ (p - c) for p in pts]
    ex = max(q.x for q in proj) - min(q.x for q in proj)
    ey = max(q.y for q in proj) - min(q.y for q in proj)
    cd.ortho_scale = max(ex, ey * res[0] / res[1]) * 1.05
    cam.location += cam.matrix_world.to_3x3() @ V(((max(q.x for q in proj) + min(q.x for q in proj)) / 2,
                                                   (max(q.y for q in proj) + min(q.y for q in proj)) / 2, 0))
cd.clip_end = 1000
scn.render.image_settings.file_format = "PNG"
scn.render.filepath = ARQ
bpy.ops.render.render(write_still=True)
print("encaixe", ARQ, flush=True)
