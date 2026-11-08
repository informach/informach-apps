"""Miniatura de cada item da biblioteca de construção (chão, paredes, lambris, encaixes, janelas, portas, batentes,
cantoneiras): o GLB sozinho, de três quartos, fundo transparente, 256 px (o .webp final sai com 192 px).
Paredes e chão com a textura padrão de cada um (parede azul em degradê, chão de madeira).
Uso: blender-venv/bin/python -I miniaturas_construcao.py -- <pasta da construcao> <saida>"""
import glob
import json
import math
import os
import sys

import bpy
from mathutils import Vector

a = sys.argv[sys.argv.index("--") + 1:]
PASTA, SAIDA = a[0], a[1]
os.makedirs(SAIDA, exist_ok=True)
cat = json.load(open(os.path.join(PASTA, "construcao.json")))
pj = json.load(open(os.path.join(PASTA, "portas_janelas.json")))
itens = [p["id"] for g in ("chaos", "paredes", "lambris", "encaixes") for p in cat[g]] + \
        [p["id"] for g in ("janelas", "portas", "batentes", "lambris", "cantos") for p in pj[g]]


def mat_tex(nome, arq):
    m = bpy.data.materials.get(nome) or bpy.data.materials.new(nome)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    tx = m.node_tree.nodes.new("ShaderNodeTexImage")
    tx.image = bpy.data.images.load(os.path.join(PASTA, "texturas", arq), check_existing=True)
    m.node_tree.links.new(tx.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.7
    return m


for iid in itens:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scn = bpy.context.scene
    bpy.ops.import_scene.gltf(filepath=os.path.join(PASTA, "pecas", iid + ".glb"))
    obs = [o for o in scn.objects if o.type == "MESH"]
    parede = mat_tex("parede", "degrade_azul.png")
    piso = mat_tex("piso", "madeira_pinus.png")
    for o in obs:
        for i, m in enumerate(o.data.materials):
            if m and m.name.split(".")[0] in ("face_a", "face_b"):
                o.data.materials[i] = parede
            elif m and m.name.split(".")[0] == "piso":
                o.data.materials[i] = piso
    pts = [o.matrix_world @ Vector(c) for o in obs for c in o.bound_box]
    lo = Vector([min(p[i] for p in pts) for i in range(3)])
    hi = Vector([max(p[i] for p in pts) for i in range(3)])
    c = (lo + hi) / 2
    scn.render.engine = "CYCLES"
    scn.cycles.samples = 24
    scn.cycles.use_denoising = True
    scn.cycles.device = "CPU"
    scn.render.film_transparent = True
    scn.render.resolution_x = scn.render.resolution_y = 256
    scn.view_settings.view_transform = "Standard"
    w = bpy.data.worlds.new("w")
    scn.world = w
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.85, 0.88, 0.95, 1)
    w.node_tree.nodes["Background"].inputs[1].default_value = 0.9
    bpy.ops.object.light_add(type="SUN")
    sol = bpy.context.active_object
    sol.data.energy = 3.0
    sol.rotation_euler = (math.radians(50), 0, math.radians(-30))
    cd = bpy.data.cameras.new("c")
    cam = bpy.data.objects.new("c", cd)
    scn.collection.objects.link(cam)
    scn.camera = cam
    cd.type = "ORTHO"
    # três quartos pela frente (−y no glTF importado vira +y? a face de fora das paredes olha para −y no Blender)
    d = Vector((0.55, -1.0, 0.45)).normalized()
    eh_chao = iid.startswith("chao")
    if eh_chao:
        d = Vector((0.6, -1.0, 1.1)).normalized()
    cam.location = c + d * 20
    cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler()
    # escala: a maior extensão projetada, com margem
    import mathutils
    R = cam.rotation_euler.to_matrix().inverted()
    proj = [R @ (p - c) for p in pts]
    ext = max(max(abs(q.x) for q in proj), max(abs(q.y) for q in proj)) * 2
    cd.ortho_scale = ext * 1.12
    cd.clip_end = 60
    scn.render.filepath = os.path.join(SAIDA, iid + ".png")
    bpy.ops.render.render(write_still=True)
    print("mini", iid, flush=True)
print("fim", len(itens))
