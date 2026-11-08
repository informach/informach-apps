"""Prévia de conferência de uma peça (depuração): importa o GLB e renderiza de uma direção, com zoom opcional.
Uso: blender-venv/bin/python -I morada-art/parque_brinquedos_ver.py -- SP/cidade_out <id> <saida.png> [dx dy dz] [zoom]
     [cx cy cz] [noite] [anim=t] (anim=t: posiciona os animados como a página faria no instante t)
"""
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Vector, Quaternion, Matrix  # noqa: E402

import moveis_base as mb  # noqa: E402

V = Vector
a = sys.argv[sys.argv.index("--") + 1:]
saida, id_, arq = a[0], a[1], a[2]
nums = [float(x) for x in a[3:] if x.replace(".", "").replace("-", "").isdigit()]
noite = "noite" in a
t_anim = None
for x in a:
    if x.startswith("anim="):
        t_anim = float(x[5:])
d = V(nums[0:3]) if len(nums) >= 3 else V((0.55, -1.0, 0.7))
zoom = nums[3] if len(nums) >= 4 else 1.0
alvo = V(nums[4:7]) if len(nums) >= 7 else None
bpy.ops.wm.read_factory_settings(use_empty=True)
pasta = os.path.join(saida, "parque_brinquedos")
cat = json.load(open(os.path.join(pasta, "catalogo.json")))
it = next(i for i in cat["itens"] if i["id"] == id_)
bpy.ops.import_scene.gltf(filepath=os.path.join(pasta, it["arquivo"]))
objs = [o for o in bpy.data.objects if o.type == "MESH"]
for o in objs:
    if o.get("colisao"):
        o.hide_render = True


def gl2b(v):
    return V((v[0], -v[2], v[1]))


if t_anim is not None:
    for o in bpy.data.objects:
        if o.get("anima") == "girar":
            ax = {"x": (1, 0, 0), "y": (0, 1, 0), "z": (0, 0, 1)}[o["eixo"]]
            q = Quaternion(gl2b(ax), math.radians(o["velocidade"] * t_anim))
            o.rotation_mode = "QUATERNION"
            o.rotation_quaternion = q @ o.rotation_quaternion
        elif o.get("anima") == "balancar":
            ax = {"x": (1, 0, 0), "y": (0, 1, 0), "z": (0, 0, 1)}[o["eixo"]]
            ang = math.radians(o["angulo"]) * math.sin(2 * math.pi * t_anim / o["periodo"])
            o.rotation_mode = "QUATERNION"
            o.rotation_quaternion = Quaternion(gl2b(ax), ang) @ o.rotation_quaternion
    bpy.context.view_layer.update()
    for o in bpy.data.objects:
        if o.get("anima") == "percurso":
            # como a página: referenciais que acompanham o trilho, giro do fechamento repartido
            P = [gl2b(p) for p in o["pontos"]]
            P.append(P[0].copy())
            n = len(P)
            L = [0.0]
            for i in range(1, n):
                L.append(L[-1] + (P[i] - P[i - 1]).length)
            T = [(P[min(n - 1, i + 1)] - P[max(0, i - 1)]).normalized() for i in range(n)]
            Zb = V((0, 0, 1))
            U = [(Zb - T[0] * T[0].dot(Zb)).normalized()]
            for i in range(1, n):
                u = U[-1] - T[i] * U[-1].dot(T[i])
                U.append(u.normalized())
            ini = (U[0] - T[-1] * U[0].dot(T[-1])).normalized()
            err = math.acos(max(-1, min(1, U[-1].dot(ini))))
            if U[-1].cross(ini).dot(T[-1]) < 0:
                err = -err
            U = [Matrix.Rotation(err * L[i] / L[-1], 3, T[i]) @ U[i] for i in range(n)]
            tot = L[-1]
            s_ = (t_anim * o["velocidade"] - o["atraso"]) % tot
            i = 1
            while i < n - 1 and L[i] < s_:
                i += 1
            f = (s_ - L[i - 1]) / max(1e-6, L[i] - L[i - 1])
            p = P[i - 1].lerp(P[i], f)
            t = T[i - 1].lerp(T[i], f).normalized()
            u = U[i - 1].lerp(U[i], f)
            u = (u - t * u.dot(t)).normalized()
            x = u.cross(t)
            M = Matrix(((x.x, -t.x, u.x, p.x), (x.y, -t.y, u.y, p.y), (x.z, -t.z, u.z, p.z), (0, 0, 0, 1)))
            o.matrix_world = o.parent.matrix_world @ M
        elif o.get("anima") == "deslizar":
            per = o["periodo"]
            uu = (t_anim % per) / per
            if uu < 0.5:
                k = 0.5 - 0.5 * math.cos(math.pi * uu / 0.5)
            elif uu < 0.62:
                k = 1
            elif uu < 0.7:
                k = 1 - ((uu - 0.62) / 0.08) ** 2
            else:
                k = 0
            o.location = o.location + V((0, 0, o["curso"] * k))
    bpy.context.view_layer.update()
pts = [o.matrix_world @ V(c) for o in objs if not o.get("colisao") for c in o.bound_box]
lo = V([min(p[i] for p in pts) for i in range(3)])
hi = V([max(p[i] for p in pts) for i in range(3)])
c = alvo if alvo is not None else (lo + hi) / 2
scn = bpy.context.scene
scn.render.engine = "CYCLES"
scn.cycles.samples = int(os.environ.get("AMOSTRAS", 16))
scn.cycles.use_denoising = True
scn.render.threads_mode = "FIXED"
scn.render.threads = 1
scn.render.resolution_x, scn.render.resolution_y = 1400, 950
scn.view_settings.view_transform = "Standard"
w = bpy.data.worlds.new("w")
scn.world = w
w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (*mb._lin("#1B2A4A" if noite else "#9DB4D9"), 1)
w.node_tree.nodes["Background"].inputs[1].default_value = 0.45 if noite else 0.6
mb.emissao_janelas(mb.JANELA_FORCA * 1.4 if noite else 0.0)
ld = bpy.data.lights.new("sol", "SUN")
ld.energy = 0.6 if noite else 3.0
ld.angle = math.radians(6)
sol = bpy.data.objects.new("sol", ld)
scn.collection.objects.link(sol)
sol.rotation_euler = (math.radians(42), 0, math.radians(-38))
cd = bpy.data.cameras.new("c")
cd.type = "ORTHO"
cam = bpy.data.objects.new("c", cd)
scn.collection.objects.link(cam)
scn.camera = cam
dn = d.normalized()
cam.location = c + dn * 300
cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler()
R = cam.rotation_euler.to_matrix().inverted()
proj = [R @ (p - c) for p in pts]
ex = max(abs(q.x) for q in proj) * 2
ey = max(abs(q.y) for q in proj) * 2
cd.ortho_scale = max(ex, ey * 1400 / 950) * 1.05 / zoom
cd.clip_end = 1000
scn.render.image_settings.file_format = "PNG"
scn.render.filepath = arq
bpy.ops.render.render(write_still=True)
print("ok", arq)
