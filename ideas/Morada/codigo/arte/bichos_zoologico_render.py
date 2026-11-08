"""Folhas de conferência e miniaturas dos bichos do zoológico, a partir dos GLB (como o jogo os vê).

Uso (Blender, MOVEIS_THREADS=1):
  python -I bichos_zoologico_render.py -- folha <pasta_glb> <saida.png> [ids] [quadro]
      todos lado a lado, parados, em escala real
  python -I bichos_zoologico_render.py -- anim <pasta_glb> <saida.png> <id> <animacao> [n]
      n quadros (4 a 6) de uma animação, lado a lado
  python -I bichos_zoologico_render.py -- minis <pasta_glb> <pasta_saida> [ids]
      <id>.webp parado, de três quartos, fundo transparente, 200 px (o padrão do miniaturas_bichos.py)
"""
import math
import os
import sys

import bpy
from mathutils import Vector

THREADS = int(os.environ.get("MOVEIS_THREADS", 1))


def cena():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scn = bpy.context.scene
    scn.render.fps = 24
    scn.render.engine = "CYCLES"
    scn.cycles.device = "CPU"
    scn.cycles.use_denoising = True
    scn.render.threads_mode = "FIXED"
    scn.render.threads = THREADS
    scn.view_settings.view_transform = "Standard"
    return scn


def importa(caminho):
    antes = set(bpy.data.objects)
    acts0 = set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=caminho)
    novos = [o for o in bpy.data.objects if o not in antes]
    arm = next(o for o in novos if o.type == "ARMATURE")
    malha = next(o for o in novos if o.type == "MESH")
    acts = {}
    for a in set(bpy.data.actions) - acts0:
        nome = a.name.split("_bicho_")[0].split("|")[-1]
        acts[nome] = a
    raiz = arm
    while raiz.parent:
        raiz = raiz.parent
    return dict(arm=arm, malha=malha, acts=acts, raiz=raiz, novos=novos)


def usa(b, anim):
    ad = b["arm"].animation_data or b["arm"].animation_data_create()
    for t in ad.nla_tracks:
        t.mute = True
    a = b["acts"].get(anim)
    ad.action = a
    if a is not None and a.slots:
        ad.action_slot = a.slots[0]
    return a


def caixa(objs):
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for o in objs:
        ev = o.evaluated_get(dg)
        pts += [ev.matrix_world @ v.co for v in ev.data.vertices]
    mn = Vector([min(p[i] for p in pts) for i in range(3)])
    mx = Vector([max(p[i] for p in pts) for i in range(3)])
    return mn, mx


def luzes(scn, fundo=(0.03, 0.035, 0.08), chao=True):
    w = bpy.data.worlds.new("w")
    scn.world = w
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (*fundo, 1)
    w.node_tree.nodes["Background"].inputs[1].default_value = 1.0
    if chao:
        bpy.ops.mesh.primitive_plane_add(size=200)
        c = bpy.context.active_object
        m = bpy.data.materials.new("chao")
        m.use_nodes = True
        m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*[x * 1.15 for x in fundo], 1)
        c.data.materials.append(m)
    bpy.ops.object.light_add(type="SUN")
    sol = bpy.context.active_object
    sol.data.energy = 3.2
    sol.rotation_euler = (math.radians(40), math.radians(15), math.radians(-30))
    sol.data.angle = math.radians(8)
    cd = bpy.data.cameras.new("c")
    cam = bpy.data.objects.new("c", cd)
    scn.collection.objects.link(cam)
    scn.camera = cam
    return cam


def folha(pasta, saida, ids, quadro):
    scn = cena()
    bs = []
    for id_ in ids:
        b = importa(os.path.join(pasta, id_ + ".glb"))
        usa(b, "parado")
        bs.append((id_, b))
    scn.frame_set(quadro)
    # duas fileiras em escala real: os grandes atrás
    tam = []
    for id_, b in bs:
        mn, mx = caixa([b["malha"]])
        tam.append((mx - mn))
    ordem = sorted(range(len(bs)), key=lambda k: -tam[k].z)
    filas = [ordem[: (len(ordem) + 1) // 2], ordem[(len(ordem) + 1) // 2:]]
    y = 0.0
    for fi, fila in enumerate(filas):
        x = 0.0
        prof = max(max(tam[k].x, tam[k].y) for k in fila) if fila else 0
        larg = [tam[k].y * 0.85 + tam[k].x * 0.5 + 0.5 for k in fila]
        tot = sum(larg)
        x = -tot / 2
        for k, lg in zip(fila, larg):
            b = bs[k][1]
            e = bpy.data.objects.new("lugar_" + bs[k][0], None)
            scn.collection.objects.link(e)
            e.location = (x + lg / 2, y, 0)
            e.rotation_euler.z = math.radians(-55)
            b["raiz"].parent = e
            x += lg
        y -= prof * 0.8 + 1.0
    bpy.context.view_layer.update()
    mn, mx = caixa([b["malha"] for _, b in bs])
    cam = luzes(scn)
    cam.data.type = "ORTHO"
    c = (mn + mx) / 2
    d = Vector((0, -1, 0.55)).normalized()
    cam.location = c + d * 60
    cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler()
    scn.render.resolution_x, scn.render.resolution_y = 2000, 1100
    cam.data.ortho_scale = max(mx.x - mn.x, (mx.z - mn.z + (mx.y - mn.y) * 0.5) * 2000 / 1100) * 1.06
    scn.cycles.samples = int(os.environ.get("AMOSTRAS", 24))
    scn.render.filepath = saida
    bpy.ops.render.render(write_still=True)


def anim(pasta, saida, id_, nome, n):
    from PIL import Image, ImageDraw
    scn = cena()
    b = importa(os.path.join(pasta, id_ + ".glb"))
    a = usa(b, nome)
    f0, f1 = (int(x) for x in a.frame_range)
    cam = luzes(scn)
    cam.data.type = "ORTHO"
    quadros = [round(f0 + (f1 - f0) * k / (n - 1 if a.use_cyclic is False and False else n)) for k in range(n)]
    if os.environ.get("ULTIMO"):
        quadros[-1] = f1
    # a mesma câmera para todos os quadros: a caixa de todos
    mn = Vector((1e9,) * 3)
    mx = Vector((-1e9,) * 3)
    for f in range(f0, f1 + 1, max(1, (f1 - f0) // 12)):
        scn.frame_set(f)
        a1, a2 = caixa([b["malha"]])
        mn = Vector([min(mn[i], a1[i]) for i in range(3)])
        mx = Vector([max(mx[i], a2[i]) for i in range(3)])
    c = (mn + mx) / 2
    d = Vector(tuple(float(x) for x in os.environ.get("VISTA", "-0.8,-0.75,0.45").split(","))).normalized()
    cam.location = c + d * 40
    cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.ortho_scale = (mx - mn).length * 0.92
    px = 420
    scn.render.resolution_x = scn.render.resolution_y = px
    scn.cycles.samples = int(os.environ.get("AMOSTRAS", 10))
    tmp = []
    for k, f in enumerate(quadros):
        scn.frame_set(f)
        scn.render.filepath = saida + f".q{k}.png"
        bpy.ops.render.render(write_still=True)
        tmp.append(scn.render.filepath)
    img = Image.new("RGB", (px * n, px + 28), (20, 22, 40))
    dr = ImageDraw.Draw(img)
    for k, t in enumerate(tmp):
        img.paste(Image.open(t).convert("RGB"), (k * px, 28))
        dr.text((k * px + 8, 8), f"{id_} · {nome} · quadro {quadros[k]}", fill=(230, 230, 240))
        os.remove(t)
    img.save(saida)


def minis(pasta, saida, ids):
    """Como o miniaturas_bichos.py: parado no quadro 12, três quartos, ortográfica, sol, fundo transparente."""
    os.makedirs(saida, exist_ok=True)
    for id_ in ids:
        scn = cena()
        b = importa(os.path.join(pasta, id_ + ".glb"))
        usa(b, "parado")
        scn.frame_set(12)
        scn.cycles.samples = 20
        scn.render.resolution_x = scn.render.resolution_y = 200
        scn.render.film_transparent = True
        scn.render.image_settings.file_format = "WEBP"
        scn.render.image_settings.quality = 88
        scn.render.image_settings.color_mode = "RGBA"
        w = bpy.data.worlds.new("w")
        scn.world = w
        w.use_nodes = True
        w.node_tree.nodes["Background"].inputs[0].default_value = (0.75, 0.78, 0.9, 1)
        w.node_tree.nodes["Background"].inputs[1].default_value = 0.8
        bpy.ops.object.light_add(type="SUN")
        sol = bpy.context.active_object
        sol.data.energy = 3.2
        sol.rotation_euler = (math.radians(40), math.radians(10), math.radians(-35))
        cd = bpy.data.cameras.new("c")
        cam = bpy.data.objects.new("c", cd)
        scn.collection.objects.link(cam)
        scn.camera = cam
        cd.type = "ORTHO"
        mn, mx = caixa([b["malha"]])
        c = (mn + mx) / 2
        d = Vector((-0.75, -1.0, 0.55)).normalized()
        cam.location = c + d * max(mx - mn) * 4
        cd.clip_end = max(mx - mn) * 10
        cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler()
        cd.ortho_scale = max(mx - mn) * 1.18
        scn.render.filepath = os.path.join(saida, id_ + ".webp")
        bpy.ops.render.render(write_still=True)


def main():
    a = sys.argv[sys.argv.index("--") + 1:]
    modo, pasta = a[0], a[1]
    todos = sorted(f[:-4] for f in os.listdir(pasta) if f.endswith(".glb"))
    if modo == "folha":
        ids = a[3].split(",") if len(a) > 3 and a[3] != "todos" else todos
        folha(pasta, a[2], ids, int(a[4]) if len(a) > 4 else 12)
    elif modo == "anim":
        anim(pasta, a[2], a[3], a[4], int(a[5]) if len(a) > 5 else 5)
    elif modo == "minis":
        minis(pasta, a[2], a[3].split(",") if len(a) > 3 else todos)


if __name__ == "__main__":
    main()
