"""Teste de encaixe da água e das estruturas: monta grades de quadras com as peças exportadas (GLB), as da base
(cidade_base) e quadras lisas de calçada e grama, e renderiza em três quartos e de cima.

Uso: MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/cidade_agua_estruturas_encaixe.py -- SP/cidade_out [cena...]
Cenas: agua, orla, estruturas, trevo. Saída: <cidade_out>/<categoria>/encaixe_<cena>.png e encaixe_<cena>_topo.png."""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import moveis_base as mb  # noqa: E402
import cidade_base as cb  # noqa: E402

V = Vector
H = cb.H
ARGS = sys.argv[sys.argv.index("--") + 1:]
OUT = ARGS[0]


def importa(cat, id_):
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(OUT, cat, "glb", id_ + ".glb"))
    novos = [o for o in bpy.data.objects if o not in antes]
    return [o for o in novos if o.parent is None][0]


def base(f, *a, **k):
    it = mb.Item("base")
    f(it, *a, **k)
    return it.monta()


def quadra(cor):
    it = mb.Item("quadra_" + cor)
    it.add(cb.laje(cb.quadrado(-H, -H, H, H), 0.0, cor))
    return it.monta()


def poe(ob, x, y, rot=0.0):
    ob.matrix_world = Matrix.Translation((x, y, 0.0)) @ Matrix.Rotation(math.radians(rot), 4, "Z") @ ob.matrix_world


def render(arquivo, direcao, res=(2000, 1300), amostras=40, chao_z=-2.2):
    scn = bpy.context.scene
    scn.render.engine = "CYCLES"
    scn.cycles.samples = int(os.environ.get("AMOSTRAS", amostras))
    scn.cycles.use_denoising = True
    scn.render.threads_mode = "FIXED"
    scn.render.threads = int(os.environ.get("MOVEIS_THREADS", "1"))
    scn.render.resolution_x, scn.render.resolution_y = res
    scn.view_settings.view_transform = "Standard"
    if not scn.world:
        w = bpy.data.worlds.new("w")
        scn.world = w
        w.use_nodes = True
        w.node_tree.nodes["Background"].inputs[0].default_value = (*mb._lin("#9DB4D9"), 1)
        w.node_tree.nodes["Background"].inputs[1].default_value = 0.6
    pts = [o.matrix_world @ V(c) for o in scn.objects if o.type == "MESH" and o.name != "chao" for c in o.bound_box]
    lo = V([min(p[i] for p in pts) for i in range(3)])
    hi = V([max(p[i] for p in pts) for i in range(3)])
    c = (lo + hi) / 2
    if "chao" not in bpy.data.objects:
        me = bpy.data.meshes.new("chao")
        bm = bmesh.new()
        bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=max(hi.x - lo.x, hi.y - lo.y) * 3 + 40)
        bm.to_mesh(me)
        bm.free()
        m, b = mb._principled("chao_vitrine")
        b.inputs["Base Color"].default_value = (*mb._lin("#2A3D63"), 1)
        b.inputs["Roughness"].default_value = 0.9
        me.materials.append(m)
        ob = bpy.data.objects.new("chao", me)
        scn.collection.objects.link(ob)
        ob.location = (c.x, c.y, chao_z)
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
    cam = scn.camera
    d = V(direcao).normalized()
    cam.location = c + d * 150
    cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.view_layer.update()
    R = cam.rotation_euler.to_matrix().inverted()
    proj = [R @ (p - c) for p in pts]
    ex = max(q.x for q in proj) - min(q.x for q in proj)
    ey = max(q.y for q in proj) - min(q.y for q in proj)
    cam.data.ortho_scale = max(ex, ey * res[0] / res[1]) * 1.06
    cam.location += cam.matrix_world.to_3x3() @ V(((max(q.x for q in proj) + min(q.x for q in proj)) / 2,
                                                   (max(q.y for q in proj) + min(q.y for q in proj)) / 2, 0))
    cam.data.clip_end = 400
    scn.render.image_settings.file_format = "PNG"
    scn.render.filepath = arquivo
    bpy.ops.render.render(write_still=True)
    print("encaixe", arquivo, flush=True)


def cena_agua():
    c = [-22.5, -7.5, 7.5, 22.5]
    poe(importa("agua", "represa"), c[0], 7.5)
    poe(importa("agua", "canal_curva"), c[0], c[0], 90)
    poe(importa("agua", "canal_reto"), c[1], c[0], 90)
    poe(importa("agua", "comporta_canal"), c[2], c[0], 90)
    poe(importa("agua", "canal_reto"), c[3], c[0], 90)
    for x in c[1:]:
        poe(quadra("calcada"), x, c[1])
    poe(importa("agua", "rio_curva"), c[1], c[2], 90)
    poe(importa("agua", "rio_reto"), c[2], c[2], 90)
    poe(importa("agua", "rio_reto"), c[3], c[2], 90)
    poe(importa("agua", "rio_reto"), c[1], c[3], 0)
    poe(importa("agua", "lago"), c[2], c[3])
    poe(quadra("grama"), c[3], c[3])
    return "agua"


def cena_orla():
    for x in (-15.0, 0.0, 15.0):
        poe(quadra("calcada"), x, -15.0)
        poe(importa("agua", "agua_aberta"), x, 15.0)
    poe(importa("agua", "orla"), -15.0, 0.0)
    poe(importa("agua", "cais"), 0.0, 0.0)
    poe(importa("agua", "orla"), 15.0, 0.0)
    return "agua"


def cena_estruturas():
    poe(base(cb.rua_reta), 0.0, -30.0)
    poe(importa("estruturas", "rampa_viaduto_rua"), 0.0, -7.5)
    poe(quadra("grama"), 0.0, 15.0)
    poe(importa("estruturas", "viaduto_rua"), 0.0, 15.0)
    for x in (-15.0, 0.0, 15.0):
        poe(base(cb.rua_reta), x, 30.0, 90)
    poe(importa("estruturas", "viaduto_rua_vao"), 0.0, 30.0)
    poe(base(cb.rua_reta), 15.0, -30.0)
    poe(importa("estruturas", "tunel_rua"), 15.0, -15.0)
    poe(importa("estruturas", "entrada_metro"), -15.0, -30.0)
    poe(importa("estruturas", "plataforma_elevada"), -15.0, -15.0)
    poe(importa("estruturas", "subestacao"), -15.0, 0.0)
    poe(quadra("grama"), 15.0, 0.0)
    poe(quadra("calcada"), -15.0, 15.0)
    poe(quadra("grama"), 15.0, 15.0)
    return "estruturas"


def cena_trevo():
    poe(importa("estruturas", "trevo"), 0.0, 0.0)
    for s in (-1, 1):
        poe(importa("estruturas", "viaduto_avenida"), s * 30.0, 0.0, 90)
        poe(base(cb.rua_reta, cb.AVENIDA), 0.0, s * 30.0)
        for t in (-1, 1):
            poe(quadra("grama"), s * 30.0, t * 15.0)
            poe(quadra("calcada"), s * 15.0, t * 30.0)
    return "estruturas"


CENAS = {"agua": cena_agua, "orla": cena_orla, "estruturas": cena_estruturas, "trevo": cena_trevo}

for nome in (ARGS[1:] or list(CENAS)):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mb.materiais()  # antes de importar: o GLB traz um material "atlas" que enganaria mb.materiais()
    cat = CENAS[nome]()
    pasta = os.path.join(OUT, cat)
    render(os.path.join(pasta, f"encaixe_{nome}.png"), (0.45, -1.0, 0.95))
    render(os.path.join(pasta, f"encaixe_{nome}_topo.png"), (0.0, -0.25, 1.0))
