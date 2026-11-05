"""Prévia das expressões: troca o quadro de cada peça do rosto (deslocando o UV) e renderiza.
Uso: python rosto_render.py <id_rosto.blend> <id_rosto.json> <saida.png>"""
import json
import math
import sys
import bpy
from mathutils import Vector
from PIL import Image, ImageDraw, ImageFont

BLEND, JS, SAIDA = sys.argv[1:4]
bpy.ops.wm.open_mainfile(filepath=BLEND)
info = json.load(open(JS))
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
for t in arm.animation_data.nla_tracks:
    t.mute = True
orig = {}
for p, d in info.items():
    o = bpy.data.objects[d["objeto"]]
    orig[p] = [tuple(l.uv) for l in o.data.uv_layers.active.data]


def quadro(p, nome):
    d = info[p]
    c, r = d["quadros"][nome]
    o = bpy.data.objects[d["objeto"]]
    for l, (u, v) in zip(o.data.uv_layers.active.data, orig[p]):
        l.uv = (u + c / d["colunas"], v - r / d["linhas"])


scn = bpy.context.scene
scn.render.engine = "CYCLES"
scn.cycles.samples = 24
scn.cycles.device = "CPU"
scn.render.resolution_x, scn.render.resolution_y = 420, 460
scn.view_settings.view_transform = "AgX"
w = bpy.data.worlds.new("w"); scn.world = w; w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.75, 0.73, 0.72, 1)
w.node_tree.nodes["Background"].inputs[1].default_value = 0.55
for loc, en in (((1.2, -2.5, 2.2), 260), ((-2, -1.5, 1.8), 110), ((0, 2, 2.5), 160)):
    bpy.ops.object.light_add(type="AREA", location=loc)
    l = bpy.context.active_object; l.data.energy = en; l.data.size = 2
    l.rotation_euler = (Vector((0, 0, 1.55)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
cd = bpy.data.cameras.new("c"); cam = bpy.data.objects.new("c", cd); scn.collection.objects.link(cam); scn.camera = cam
cd.lens = 70
alvo = Vector((0.0, 0, 1.575))

EXPR = [
    ("Neutro", "aberto", "neutra", "neutra", 0),
    ("Sorrindo", "aberto", "feliz", "sorriso", 0),
    ("Rindo", "feliz", "feliz", "sorrisao", 0),
    ("Bravo", "bravo", "brava", "brava", 0),
    ("Triste", "triste", "triste", "triste", 0),
    ("Surpreso", "surpreso", "alta", "surpresa", 0),
    ("Piscadinha", "piscadinha", "desconfiada", "sorriso", 0),
    ("Piscando", "fechado", "neutra", "neutra", 0),
    ("Falando A", "aberto", "neutra", "fala_a", 0),
    ("Falando O", "olhar_esquerda", "neutra", "fala_o", 0),
    ("De lado", "olhar_direita", "neutra", "sorrisao", 40),
    ("De lado bravo", "bravo", "brava", "brava", -40),
]
F = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 18)
cols = 4
folha = Image.new("RGB", (420 * cols, 490 * math.ceil(len(EXPR) / cols)), "white")
dr = ImageDraw.Draw(folha)
for k, (nome, o_, s_, b_, ang) in enumerate(EXPR):
    quadro("olhos", o_); quadro("sobrancelhas", s_); quadro("boca", b_)
    a = math.radians(ang)
    cam.location = alvo + Vector((math.sin(a) * 0.95, -math.cos(a) * 0.95, 0.02))
    cam.rotation_euler = (alvo - cam.location).to_track_quat("-Z", "Y").to_euler()
    scn.render.filepath = f"/tmp/claude-0/-home-user-informach-apps/4b0c5cb8-e6f3-54e3-8b85-cd31fc21bb7f/scratchpad/morada-art/meshy_out/rosto/_r{k}.png"
    bpy.ops.render.render(write_still=True)
    x, y = (k % cols) * 420, (k // cols) * 490
    folha.paste(Image.open(scn.render.filepath), (x, y))
    dr.text((x + 10, y + 464), nome, fill=(30, 30, 30), font=F)
folha.save(SAIDA)
