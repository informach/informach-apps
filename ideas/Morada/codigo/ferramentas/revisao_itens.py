"""Revisão do catálogo: cada peça vestida num corpo do arquivo-mestre (adulto, ou adulta nas peças de mulher), parado
(um quadro de "Parado"), com o acabamento das cenas (pesos da pele, pele coberta, cabelo dentro do chapéu), de frente e
de costas, numa folha por slot. Serve para olhar peça por peça.

Uso: python revisao_itens.py -- <corpos.blend> <saida_dir> [ids | slots separados por vírgula | todos]
"""
import math
import os
import sys

import bpy
from mathutils import Vector

AQUI = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(AQUI, "morada-art"))
import roupas as R  # noqa: E402
import cena_familia as CF  # noqa: E402

a = sys.argv[sys.argv.index("--") + 1:]
BLEND, SAIDA = a[0], a[1]
PEDIDO = a[2] if len(a) > 2 else "todos"
os.makedirs(SAIDA, exist_ok=True)
MULHER = ("vestido", "saia", "maio", "biquini", "top", "tomara", "cropped", "macaquinho", "salto", "meia_calca",
          "bolsa_perolas", "tiara", "arco", "showgirl")
itens = [x for x in R.CATALOGO["itens"]]
if PEDIDO != "todos":
    pedidos = set(PEDIDO.split(","))
    itens = [x for x in itens if x["id"] in pedidos or R._resolve(x).get("slot") in pedidos]

bpy.ops.wm.open_mainfile(filepath=BLEND)
CF.acha_texturas()
for o in list(bpy.data.objects):
    if o.type in ("LIGHT", "CAMERA") or (o.type in ("MESH", "ARMATURE", "EMPTY")
                                         and not any(o.name == c or o.name.startswith(c + "_") for c in ("adulto", "adulta"))):
        bpy.data.objects.remove(o, do_unlink=True)
scn = bpy.context.scene
scn.render.engine = "CYCLES"
scn.cycles.samples = 10
scn.cycles.use_denoising = True
scn.cycles.device = "CPU"
scn.render.resolution_x, scn.render.resolution_y = 300, 400
scn.view_settings.view_transform = "Standard"
w = bpy.data.worlds.new("w")
scn.world = w
w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.75, 0.77, 0.82, 1)
w.node_tree.nodes["Background"].inputs[1].default_value = 0.9
bpy.ops.object.light_add(type="SUN")
sol = bpy.context.active_object
sol.data.energy = 3.0
cd = bpy.data.cameras.new("c")
cam = bpy.data.objects.new("c", cd)
scn.collection.objects.link(cam)
scn.camera = cam
cd.type = "ORTHO"

pessoas = {}
for c in ("adulto", "adulta"):
    arm = bpy.data.objects[c]
    arm.parent.location = (0, 0, 0)
    for o in bpy.data.objects:
        if o.name.startswith(c + "_") and o.type == "MESH":
            o.hide_render = o.name not in (c + "_corpo", c + "_rosto_confiante", c + "_cabelo")
    CF.pose_da_biblioteca(arm, c, "resident.idle.neutral", 30)
    print("pose", c, [round(x, 2) for x in arm.pose.bones["LeftArm"].matrix_basis.to_euler()], flush=True)
    pessoas[c] = arm


def descanso(arm):
    salvo = {pb.name: pb.matrix_basis.copy() for pb in arm.pose.bones}
    for pb in arm.pose.bones:
        pb.matrix_basis.identity()
    bpy.context.view_layer.update()
    return salvo


def volta(arm, salvo):
    for pb in arm.pose.bones:
        pb.matrix_basis = salvo[pb.name]
    bpy.context.view_layer.update()


feitos = []
for item in itens:
    it = R._resolve(item)
    slot = it.get("slot") or "outros"
    c = "adulta" if any(k in item["id"] for k in MULHER) or slot in ("inteira",) and "macacao" not in item["id"] else "adulto"
    c = os.environ.get("CORPO") or c  # CORPO=adulta: todas na mulher
    arm = pessoas[c]
    corpo = bpy.data.objects[c + "_corpo"]
    for x in pessoas:
        for o in bpy.data.objects:
            if o.name.startswith(x + "_") and o.type == "MESH" and o.name in (x + "_corpo", x + "_rosto_confiante", x + "_cabelo"):
                o.hide_render = x != c
    salvo = descanso(arm)
    try:
        ob = R.veste(item, arm, corpo, CF.PACOTES)
    except Exception as e:
        print("falhou", item["id"], repr(e), flush=True)
        volta(arm, salvo)
        continue
    ob.hide_render = ob.hide_viewport = False
    if not any(m.type == "ARMATURE" for m in ob.modifiers):
        g = ob.vertex_groups.new(name="Head")
        g.add(list(range(len(ob.data.vertices))), 1.0, "REPLACE")
        ob.modifiers.new("Esqueleto", "ARMATURE").object = arm
    elif it.get("tipo") == "pele" and not os.environ.get("SEM_PESOS"):
        CF.pesos_da_pele(ob, corpo)
        if slot in ("cima", "sobre"):
            CF.sem_pernas(ob)
    CF.tinge(ob, item["id"], (it.get("variacao") or {}).get("cor"))
    mods_antes = len(corpo.modifiers)
    if it.get("tipo") == "pele" and not os.environ.get("SEM_MASCARA"):
        CF.esconde_pele_coberta(corpo, [ob])
    cab = bpy.data.objects.get(c + "_cabelo")
    bak = None
    if slot == "cabeca" and it.get("achata") is not False and cab:
        bak = [v.co.copy() for v in cab.data.vertices]
        CF.cabelo_sob_chapeu([cab], ob, arm)
    volta(arm, salvo)
    # frente e costas, 3/4
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    pts = [ev.matrix_world @ v.co for v in ev.data.vertices]
    if slot in ("cabeca", "oculos", "orelhas", "nariz", "rosto_peca"):
        hb = arm.pose.bones["Head"]
        alvo = arm.matrix_world @ hb.head.lerp(hb.tail, 0.5)
        tam = 0.45
    elif slot in ("mao_dir", "mao_esq", "maos", "pulso"):
        lo = Vector([min(p[i] for p in pts) for i in range(3)])
        hi = Vector([max(p[i] for p in pts) for i in range(3)])
        alvo = (lo + hi) / 2
        tam = max(0.5, (hi - lo).length * 1.4)
    else:
        alvo = Vector((0, 0, 0.9))
        tam = 1.95
    for k, az in enumerate((25, 205)):
        d = Vector((math.sin(math.radians(az)), -math.cos(math.radians(az)), 0.25)).normalized()
        cam.location = alvo + d * 6
        cam.rotation_euler = (alvo - cam.location).to_track_quat("-Z", "Y").to_euler()
        sol.rotation_euler = (math.radians(50), 0, math.radians(az + 30))
        cd.ortho_scale = tam
        scn.render.filepath = os.path.join(SAIDA, f"{item['id']}_{k}.png")
        bpy.ops.render.render(write_still=True)
    # desfaz: peça, máscara da pele, cabelo
    bpy.data.objects.remove(ob, do_unlink=True)
    for m in [m for m in corpo.modifiers if m.type == "MASK"]:  # só a máscara da pele (o esqueleto fica)
        corpo.modifiers.remove(m)
    if "coberta" in corpo.vertex_groups:
        corpo.vertex_groups.remove(corpo.vertex_groups["coberta"])
    if bak:
        for v, co in zip(cab.data.vertices, bak):
            v.co = co
        cab.data.update()
    feitos.append((slot, item["id"], item.get("rotulo", "")))
    print("revisto", item["id"], flush=True)
R.limpa_fontes()
import json  # noqa: E402
json.dump(feitos, open(os.path.join(SAIDA, "feitos.json"), "w"), ensure_ascii=False)
print("fim", len(feitos))
