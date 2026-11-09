"""Vitrine dos arranha-céus: como mb.vitrine, mas com a câmera recuada o bastante para torres de 160 m (a da base
fica a 60 m do centro e corta as torres altas) e com a opção de uma vista de frente mais baixa.

  blender-venv/bin/python -I morada-art/predios_arranha_ceus_vitrine.py -- SP/morada-art <pasta> <saida.png> \
      [noite] [frente] [filas=N] [ids=a,b,c] [res=1800x1000]
"""
import json
import math
import os
import sys

sys.path.insert(0, sys.argv[sys.argv.index("--") + 1])
import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Vector  # noqa: E402

import moveis_base as mb  # noqa: E402

V = Vector


def vitrine(pasta, arquivo, ids=None, noite=False, frente=False, filas=2, res=(1800, 1000), amostras=48):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    cat = json.load(open(os.path.join(pasta, "catalogo.json")))
    itens = [i for i in cat["itens"] if ids is None or i["id"] in ids]
    if ids:
        itens.sort(key=lambda i: ids.index(i["id"]))
    grupos = []
    for it in itens:
        antes = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=os.path.join(pasta, it["arquivo"]))
        novos = [o for o in bpy.data.objects if o not in antes]
        raiz = [o for o in novos if o.parent is None][0]
        grupos.append((raiz, novos, it))
    n = len(grupos)
    por = math.ceil(n / filas)
    linhas = [grupos[i:i + por] for i in range(0, n, por)]
    y = 0.0
    for fi, linha in enumerate(linhas):
        prof = max(g[2]["dims"][1] for g in linha)
        larg = sum(g[2]["dims"][0] for g in linha) + 7.0 * (len(linha) - 1)
        x = -larg / 2 + (larg / len(linha) / 2 if fi % 2 else 0.0)  # filas desencontradas: uma não esconde a outra
        for raiz, novos, it in linha:
            l = it["dims"][0]
            raiz.location = (x + l / 2, y - prof / 2, 0)
            x += l + 7.0
        y -= prof + 40.0
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
    w.node_tree.nodes["Background"].inputs[0].default_value = (*mb._lin("#1B2A4A" if noite else "#9DB4D9"), 1)
    w.node_tree.nodes["Background"].inputs[1].default_value = 0.45 if noite else 0.6
    mb.emissao_janelas(mb.JANELA_FORCA * 1.4 if noite else 0.0)
    pts = [o.matrix_world @ V(c) for _, novos, _ in grupos for o in novos if o.type == "MESH" for c in o.bound_box]
    lo = V([min(p[i] for p in pts) for i in range(3)])
    hi = V([max(p[i] for p in pts) for i in range(3)])
    c = (lo + hi) / 2
    chao = bpy.data.meshes.new("chao")
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=4000)
    bm.to_mesh(chao)
    bm.free()
    m, b = mb._principled("chao_vitrine")
    b.inputs["Base Color"].default_value = (*mb._lin("#141E36" if noite else "#2A3D63"), 1)
    b.inputs["Roughness"].default_value = 0.9
    chao.materials.append(m)
    ob = bpy.data.objects.new("chao", chao)
    scn.collection.objects.link(ob)
    ob.location = (c.x, c.y, 0)
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
    d = V((0.22, -1.0, 0.30) if frente else (0.45, -1.0, 0.95)).normalized()
    dist = (hi - lo).length + 50
    cam.location = c + d * dist
    cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler()
    R = cam.rotation_euler.to_matrix().inverted()
    proj = [R @ (p - c) for p in pts]
    ex = max(q.x for q in proj) - min(q.x for q in proj)
    ey = max(q.y for q in proj) - min(q.y for q in proj)
    cd.ortho_scale = max(ex, ey * res[0] / res[1]) * 1.06
    cam.location += cam.matrix_world.to_3x3() @ V(((max(q.x for q in proj) + min(q.x for q in proj)) / 2,
                                                   (max(q.y for q in proj) + min(q.y for q in proj)) / 2, 0))
    cd.clip_end = dist * 3
    scn.render.image_settings.file_format = "PNG"
    scn.render.filepath = arquivo
    bpy.ops.render.render(write_still=True)
    print("vitrine", arquivo, n, flush=True)


if __name__ == "__main__":
    a = sys.argv[sys.argv.index("--") + 2:]
    op = a[2:]
    ids = None
    filas = 2
    res = (1800, 1000)
    for o in op:
        if o.startswith("ids="):
            ids = o[4:].split(",")
        elif o.startswith("filas="):
            filas = int(o[6:])
        elif o.startswith("res="):
            res = tuple(int(v) for v in o[4:].split("x"))
    vitrine(a[0], a[1], ids=ids, noite="noite" in op, frente="frente" in op, filas=filas, res=res)
