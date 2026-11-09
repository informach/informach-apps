"""Renderização rápida (Workbench, cor por vértice) para conferir: vistas paradas e quadros de animações.

ver_vistas(objs, saida): cada bicho de lado, de três quartos e de frente, em descanso.
ver_quadros(linhas, saida): linhas = [(rotulo, arm, ob, acao, [quadros])]; uma linha por bicho, um quadro por coluna.
"""
import math
import os

import bpy
import numpy as np
from mathutils import Vector


def _cena(res=(360, 300)):
    scn = bpy.context.scene
    scn.render.engine = "CYCLES"
    scn.cycles.device = "CPU"
    scn.cycles.samples = int(os.environ.get("AMOSTRAS", 8))
    scn.cycles.use_denoising = True
    scn.cycles.max_bounces = 3
    scn.render.threads_mode = "FIXED"
    scn.render.threads = 1
    scn.render.resolution_x, scn.render.resolution_y = res
    scn.render.film_transparent = False
    scn.view_settings.view_transform = "Standard"
    if not scn.world:
        scn.world = bpy.data.worlds.new("w")
        scn.world.use_nodes = True
        bg = scn.world.node_tree.nodes["Background"]
        bg.inputs[0].default_value = (0.8, 0.83, 0.9, 1)
        bg.inputs[1].default_value = 0.9
        bpy.ops.object.light_add(type="SUN")
        sol = bpy.context.active_object
        sol.name = "sol_ver"
        sol.data.energy = 3.0
        sol.data.angle = 0.15
        sol.rotation_euler = (math.radians(40), math.radians(10), math.radians(-35))
    cam = scn.camera
    if cam is None:
        cd = bpy.data.cameras.new("cam_ver")
        cam = bpy.data.objects.new("cam_ver", cd)
        scn.collection.objects.link(cam)
        scn.camera = cam
    cam.data.type = "ORTHO"
    chao = bpy.data.objects.get("chao_ver")
    if chao is None:
        bpy.ops.mesh.primitive_plane_add(size=20)
        chao = bpy.context.active_object
        chao.name = "chao_ver"
        m = bpy.data.materials.new("chao_ver")
        m.use_nodes = True
        m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.45, 0.5, 0.45, 1)
        chao.data.materials.append(m)
    return scn, cam


def _so(objs, mostra):
    for o in objs:
        o.hide_render = o not in mostra


def _caixa(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    pts = np.array([tuple(ev.matrix_world @ v.co) for v in ev.data.vertices])
    return pts.min(0), pts.max(0)


def _cola(arqs, cols, saida, rotulos=None, res=(360, 300)):
    from PIL import Image, ImageDraw
    n = len(arqs)
    linhas = math.ceil(n / cols)
    W = Image.new("RGB", (cols * res[0], linhas * res[1]), "white")
    dr = ImageDraw.Draw(W)
    for k, a in enumerate(arqs):
        if a and os.path.exists(a):
            W.paste(Image.open(a).convert("RGB"), ((k % cols) * res[0], (k // cols) * res[1]))
            if rotulos and rotulos[k]:
                dr.text(((k % cols) * res[0] + 6, (k // cols) * res[1] + 4), rotulos[k], fill=(20, 20, 30))
    W.save(saida, quality=88)
    for a in arqs:
        if a and os.path.exists(a):
            os.remove(a)


def _mira(cam, mn, mx, d, folga=1.25):
    c = Vector(((mn + mx) / 2).tolist())
    cam.location = c + Vector(d).normalized() * 6
    cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.ortho_scale = float(np.max(mx - mn)) * folga


VISTAS = {"lado": (1, 0, 0.12), "34": (0.8, -1.0, 0.55), "frente": (0.0, -1, 0.25), "cima": (0.0, 0.01, 1)}


def ver_vistas(pares, saida, vistas=("lado", "34", "frente", "cima"), res=(360, 300), pose=False):
    scn, cam = _cena(res)
    malhas = [ob for _, ob in pares]
    arqs, rot = [], []
    tmp = os.path.splitext(saida)[0]
    for k, (arm, ob) in enumerate(pares):
        arm.data.pose_position = "POSE" if pose else "REST"
        _so(malhas, [ob])
        mn, mx = _caixa(ob)
        for v in vistas:
            _mira(cam, mn, mx, VISTAS[v])
            scn.render.filepath = f"{tmp}_{k}_{v}.png"
            bpy.ops.render.render(write_still=True)
            arqs.append(scn.render.filepath)
            rot.append(f"{arm.name[6:]} {v}  {mx[2]:.2f} m alt, {mx[1]-mn[1]:.2f} m comp")
        arm.data.pose_position = "POSE"
    _cola(arqs, len(vistas), saida, rot, res)


def poe_acao(arm, act):
    ad = arm.animation_data or arm.animation_data_create()
    for t in ad.nla_tracks:
        t.mute = True
    ad.action = act
    if act.slots:
        ad.action_slot = act.slots[0]


def ver_quadros(linhas, saida, res=(300, 250), vista=(1, -0.35, 0.3), fixa=True):
    """linhas: [(rotulo, arm, ob, act, quadros)]. O enquadramento de cada linha cobre todos os quadros dela."""
    scn, cam = _cena(res)
    malhas = [l[2] for l in linhas]
    arqs, rot = [], []
    tmp = os.path.splitext(saida)[0]
    cols = max(len(l[4]) for l in linhas)
    for k, (rotulo, arm, ob, act, quadros) in enumerate(linhas):
        arm.data.pose_position = "POSE"
        poe_acao(arm, act)
        _so(malhas, [ob])
        cx = []
        for q in quadros:
            scn.frame_set(int(q))
            cx.append(_caixa(ob))
        mn = np.min([c[0] for c in cx], 0)
        mx = np.max([c[1] for c in cx], 0)
        mn[2] = min(mn[2], 0.0)
        for j in range(cols):
            if j >= len(quadros):
                arqs.append(None)
                rot.append(None)
                continue
            scn.frame_set(int(quadros[j]))
            _mira(cam, mn, mx, vista, 1.4)
            scn.render.filepath = f"{tmp}_{k}_{j}.png"
            bpy.ops.render.render(write_still=True)
            arqs.append(scn.render.filepath)
            rot.append(f"{rotulo}  q{int(quadros[j])}")
        arm.animation_data.action = None
    _cola(arqs, cols, saida, rot, res)
