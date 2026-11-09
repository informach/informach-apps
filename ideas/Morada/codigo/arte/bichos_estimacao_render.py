"""Folhas de conferência e miniaturas dos bichos de estimação, a partir dos GLB (o que o jogo vai carregar).

Uso (blender-venv/bin/python -I bichos_estimacao_render.py -- <modo> ...):
  folha <saida.png> <glb...>                     todos lado a lado, parados, na mesma escala (tamanho real)
  anim <saida.png> <animacao> <n> <glb...>       uma linha por bicho, n quadros da animação
  anims <saida.png> <glb> <n> <a1,a2,...>          um bicho, uma linha por animação, n quadros
  mini <pasta> <glb...>                          <id>.webp, parado, de três quartos, fundo transparente (200 px)
Cycles na CPU com uma linha de execução (MOVEIS_THREADS=1).
"""
import math
import os
import re
import sys

import bpy
import numpy as np
from mathutils import Vector

a = sys.argv[sys.argv.index("--") + 1:]
modo = a[0]


def limpa():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scn = bpy.context.scene
    scn.render.engine = "CYCLES"
    scn.cycles.device = "CPU"
    scn.render.threads_mode = "FIXED"
    scn.render.threads = int(os.environ.get("MOVEIS_THREADS", 1))
    scn.cycles.max_bounces = 3
    scn.view_settings.view_transform = "Standard"
    return scn


def mat_cor(ob, nome, rough=0.85):
    m = bpy.data.materials.new(nome)
    m.use_nodes = True
    nt = m.node_tree
    at = nt.nodes.new("ShaderNodeVertexColor")
    at.layer_name = ob.data.color_attributes[0].name
    nt.links.new(at.outputs["Color"], nt.nodes["Principled BSDF"].inputs["Base Color"])
    nt.nodes["Principled BSDF"].inputs["Roughness"].default_value = rough
    ob.data.materials.clear()
    ob.data.materials.append(m)


def importa(glb):
    antes = set(bpy.data.objects)
    acts0 = set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=glb)
    novos = [o for o in bpy.data.objects if o not in antes]
    arm = next(o for o in novos if o.type == "ARMATURE")
    me = next(o for o in novos if o.type == "MESH")
    mat_cor(me, "m_" + me.name)
    acts = {}
    for x in bpy.data.actions:  # o importador numera os nomes repetidos (sentar.001): tira o número
        if x in acts0:
            continue
        nome = re.sub(r"\.\d{3}$", "", x.name)
        acts[nome.split("_" + arm.name)[0]] = x
    ad = arm.animation_data or arm.animation_data_create()
    for t in ad.nla_tracks:
        t.mute = True
    return dict(id=os.path.splitext(os.path.basename(glb))[0], arm=arm, me=me, acts=acts)


def acao(b, nome):
    act = b["acts"].get(nome)
    if act is None:  # o importador às vezes junta o nome do objeto: procura pelo começo
        act = next((v for k, v in b["acts"].items() if k == nome or k.startswith(nome + "_")), None)
    ad = b["arm"].animation_data
    ad.action = act
    if act is not None and act.slots:
        ad.action_slot = act.slots[0]
    return act


def caixa(b, quadros):
    scn = bpy.context.scene
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for f in quadros:
        scn.frame_set(f)
        ev = b["me"].evaluated_get(dg)
        mw = ev.matrix_world
        pts += [tuple(mw @ v.co) for v in ev.data.vertices]
    P = np.array(pts)
    return P.min(0), P.max(0)


def so(b, todos):
    for x in todos:
        x["me"].hide_render = x is not b


def luz(scn, fundo=(0.62, 0.66, 0.78)):
    w = bpy.data.worlds.new("w")
    scn.world = w
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (*fundo, 1)
    w.node_tree.nodes["Background"].inputs[1].default_value = 0.9
    bpy.ops.object.light_add(type="SUN")
    sol = bpy.context.active_object
    sol.data.energy = 3.0
    sol.rotation_euler = (math.radians(40), math.radians(10), math.radians(-35))
    sol.data.angle = math.radians(6)


def chao(scn):
    bpy.ops.mesh.primitive_plane_add(size=60)
    c = bpy.context.active_object
    m = bpy.data.materials.new("chao")
    m.use_nodes = True
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.42, 0.45, 0.55, 1)
    c.data.materials.append(m)
    return c


def camera(scn):
    cd = bpy.data.cameras.new("c")
    cd.type = "ORTHO"
    cd.clip_end = 200
    cam = bpy.data.objects.new("c", cd)
    scn.collection.objects.link(cam)
    scn.camera = cam
    return cam


def aponta(cam, c, d, escala):
    cam.location = Vector(c) + Vector(d).normalized() * 20
    cam.rotation_euler = (Vector(c) - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.ortho_scale = escala


def fonte(tam=12):
    from PIL import ImageFont
    for f in ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",):
        if os.path.exists(f):
            return ImageFont.truetype(f, tam)
    return ImageFont.load_default()


def rotulo(img_path, texto):
    from PIL import Image, ImageDraw
    im = Image.open(img_path).convert("RGB")
    dr = ImageDraw.Draw(im)
    dr.rectangle([0, 0, im.width, 16], fill=(25, 27, 38))
    dr.text((4, 1), texto, fill=(255, 255, 255), font=fonte(11))
    return im


def junta(ims, cols, saida, titulo=None):
    from PIL import Image, ImageDraw
    w, h = ims[0].width, ims[0].height
    linhas = (len(ims) + cols - 1) // cols
    topo = 22 if titulo else 0
    out = Image.new("RGB", (w * cols, h * linhas + topo), (25, 27, 38))
    if titulo:
        ImageDraw.Draw(out).text((6, 3), titulo, fill=(255, 255, 255), font=fonte(14))
    for k, im in enumerate(ims):
        out.paste(im, ((k % cols) * w, topo + (k // cols) * h))
    out.save(saida)


DIR34 = (-0.75, -1.0, 0.55)

if modo == "folha":
    saida, glbs = a[1], a[2:]
    scn = limpa()
    scn.cycles.samples = int(os.environ.get("AMOSTRAS", 16))
    bs = [importa(g) for g in glbs]
    luz(scn)
    chao(scn)
    cam = camera(scn)
    scn.render.resolution_x, scn.render.resolution_y = 300, 260
    caixas = {}
    for b in bs:
        acao(b, "parado")
        caixas[b["id"]] = caixa(b, [12])
    tam = max(float(np.linalg.norm(mx - mn)) for mn, mx in caixas.values())
    ims = []
    tmp = saida + "_tmp.png"
    for b in bs:
        so(b, bs)
        acao(b, "parado")
        scn.frame_set(12)
        mn, mx = caixas[b["id"]]
        c = (mn + mx) / 2
        c[2] = tam * 0.38
        aponta(cam, c, DIR34, tam * 1.05)
        scn.render.filepath = tmp
        bpy.ops.render.render(write_still=True)
        ims.append(rotulo(tmp, "%s  %.2f m" % (b["id"], mx[2] - max(mn[2], 0))))
    os.remove(tmp)
    junta(ims, int(os.environ.get("COLS", 6)), saida, "Bichos de estimação, parados, na mesma escala")
    print("folha", saida, len(bs))

elif modo == "anim":
    saida, anim, n, glbs = a[1], a[2], int(a[3]), a[4:]
    scn = limpa()
    scn.cycles.samples = int(os.environ.get("AMOSTRAS", 10))
    bs = [importa(g) for g in glbs]
    luz(scn)
    chao(scn)
    cam = camera(scn)
    scn.render.resolution_x, scn.render.resolution_y = 260, 220
    ims = []
    tmp = saida + "_tmp.png"
    vista = os.environ.get("VISTA", "34")
    d = {"34": DIR34, "lado": (-1, -0.15, 0.25), "esq": (1, -0.5, 0.3), "frente": (-0.2, -1, 0.3)}[vista]
    for b in bs:
        so(b, bs)
        act = acao(b, anim)
        if act is None:
            print("sem", anim, b["id"])
            continue
        f0, f1 = [int(x) for x in act.frame_range]
        quadros = [int(round(f0 + (f1 - f0) * k / (n - 1))) for k in range(n)] if n > 1 else [f0]
        if os.environ.get("SEM_ULTIMO") and n > 1:
            quadros = [int(round(f0 + (f1 - f0) * k / n)) for k in range(n)]
        mn, mx = caixa(b, quadros)
        c = (mn + mx) / 2
        tam = float(np.linalg.norm(mx - mn))
        for f in quadros:
            scn.frame_set(f)
            aponta(cam, c, d, tam * 1.0)
            scn.render.filepath = tmp
            bpy.ops.render.render(write_still=True)
            dg = bpy.context.evaluated_depsgraph_get()
            ev = b["me"].evaluated_get(dg)
            zmin = min((ev.matrix_world @ v.co).z for v in ev.data.vertices)
            ims.append(rotulo(tmp, "%s %s q%d z%.3f" % (b["id"], anim, f, zmin)))
    os.remove(tmp)
    junta(ims, n, saida, "Animação: %s (%d quadros por bicho)" % (anim, n))
    print("anim", saida, anim)

elif modo == "anims":
    saida, glb, n, anims = a[1], a[2], int(a[3]), a[4].split(",")
    scn = limpa()
    scn.cycles.samples = int(os.environ.get("AMOSTRAS", 10))
    b = importa(glb)
    luz(scn)
    chao(scn)
    cam = camera(scn)
    scn.render.resolution_x, scn.render.resolution_y = 240, 200
    ims = []
    tmp = saida + "_tmp.png"
    for anim in anims:
        act = acao(b, anim)
        if act is None:
            print("sem", anim, b["id"])
            continue
        f0, f1 = [int(x) for x in act.frame_range]
        quadros = [int(round(f0 + (f1 - f0) * k / (n - 1))) for k in range(n)]
        mn, mx = caixa(b, quadros)
        c = (mn + mx) / 2
        tam = float(np.linalg.norm(mx - mn))
        for f in quadros:
            scn.frame_set(f)
            aponta(cam, c, DIR34, tam)
            scn.render.filepath = tmp
            bpy.ops.render.render(write_still=True)
            ims.append(rotulo(tmp, "%s %s q%d" % (b["id"], anim, f)))
    os.remove(tmp)
    junta(ims, n, saida, "%s: animações compostas (%d quadros cada)" % (b["id"], n))
    print("anims", saida, len(anims))

elif modo == "mini":
    pasta, glbs = a[1], a[2:]
    os.makedirs(pasta, exist_ok=True)
    scn = limpa()
    scn.cycles.samples = 20
    scn.cycles.use_denoising = False
    scn.render.resolution_x = scn.render.resolution_y = 200
    scn.render.film_transparent = True
    scn.render.image_settings.file_format = "WEBP"
    scn.render.image_settings.quality = 88
    scn.render.image_settings.color_mode = "RGBA"
    bs = [importa(g) for g in glbs]
    w = bpy.data.worlds.new("w")
    scn.world = w
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.75, 0.78, 0.9, 1)
    w.node_tree.nodes["Background"].inputs[1].default_value = 0.8
    bpy.ops.object.light_add(type="SUN")
    sol = bpy.context.active_object
    sol.data.energy = 3.2
    sol.rotation_euler = (math.radians(40), math.radians(10), math.radians(-35))
    cam = camera(scn)
    for b in bs:
        so(b, bs)
        acao(b, "parado")
        scn.frame_set(12)
        mn, mx = caixa(b, [12])
        c = (mn + mx) / 2
        aponta(cam, c, DIR34, float(max(mx - mn)) * 1.18)
        scn.render.filepath = os.path.join(pasta, b["id"] + ".webp")
        bpy.ops.render.render(write_still=True)
    print("mini", len(bs))
