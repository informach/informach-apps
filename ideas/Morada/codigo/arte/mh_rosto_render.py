"""Prévia das expressões da cabeça MH: combina shape keys e gira os globos.
Uso: python mh_rosto_render.py <id_mh.blend> <id> <saida.png> [amostras]"""
import math
import sys
import bpy
from mathutils import Vector, Matrix
from PIL import Image, ImageDraw, ImageFont

BLEND, PID, SAIDA = sys.argv[1:4]
AM = int(sys.argv[4]) if len(sys.argv) > 4 else 24
bpy.ops.wm.open_mainfile(filepath=BLEND)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
for t in (arm.animation_data.nla_tracks if arm.animation_data else []):
    t.mute = True
cab = bpy.data.objects[f"{PID}_cabeca"]
olhos = [bpy.data.objects[f"{PID}_olho_l"], bpy.data.objects[f"{PID}_olho_r"]]
base_rot = {o.name: o.matrix_world.copy() for o in olhos}
kb = cab.data.shape_keys.key_blocks

EXPR = [
    ("Neutro", {}, (0, 0), 0),
    ("Piscando", {"piscar_e": 1, "piscar_d": 1}, (0, 0), 0),
    ("Sorrindo", {"sorriso": 1.0, "apertar_e": 0.3, "apertar_d": 0.3, "sobr_sobe_e": 0.2, "sobr_sobe_d": 0.2}, (0, 0), 0),
    ("Rindo", {"sorriso": 1.0, "boca_abre": 0.4, "labios_separa": 0.5, "apertar_e": 0.5, "apertar_d": 0.5}, (0, 0), 0),
    ("Bravo", {"sobr_desce_e": 1, "sobr_desce_d": 1, "boca_triste": 0.6, "comprime": 0.5, "apertar_e": 0.3, "apertar_d": 0.3}, (0, 0), 0),
    ("Triste", {"sobr_dentro_sobe_e": 1, "sobr_dentro_sobe_d": 1, "boca_triste": 1.0}, (0, 0.25), 0),
    ("Surpreso", {"arregalar_e": 1, "arregalar_d": 1, "sobr_sobe_e": 1, "sobr_sobe_d": 1, "boca_abre": 0.55}, (0, 0), 0),
    ("Falando A", {"boca_abre": 0.5, "labios_separa": 0.4}, (0, 0), 0),
    ("Falando O", {"bico": 0.8, "boca_abre": 0.4}, (0, 0), 0),
    ("Olhando pro lado", {"sorriso": 0.4}, (0.45, 0), 0),
    ("De lado", {"sorriso": 0.6, "boca_abre": 0.3}, (0, 0), 40),
    ("De lado piscando", {"piscar_e": 1, "sorriso": 0.8}, (0, 0), -40),
]
scn = bpy.context.scene
scn.render.engine = "CYCLES"; scn.cycles.samples = AM; scn.cycles.device = "CPU"
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
F = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 18)
cols = 4
folha = Image.new("RGB", (420 * cols, 490 * math.ceil(len(EXPR) / cols)), "white")
dr = ImageDraw.Draw(folha)
for k, (nome, pesos, olhar, ang) in enumerate(EXPR):
    for b in kb[1:]:
        b.value = pesos.get(b.name, 0.0)
    for o in olhos:
        M = base_rot[o.name]
        c = M.translation.copy()
        R = Matrix.Rotation(-olhar[0], 4, "Z") @ Matrix.Rotation(-olhar[1], 4, "X")
        o.matrix_world = Matrix.Translation(c) @ R @ Matrix.Translation(-c) @ M
    a = math.radians(ang)
    cam.location = alvo + Vector((math.sin(a) * 0.95, -math.cos(a) * 0.95, 0.02))
    cam.rotation_euler = (alvo - cam.location).to_track_quat("-Z", "Y").to_euler()
    scn.render.filepath = SAIDA.replace(".png", f"_{k}.png")
    bpy.ops.render.render(write_still=True)
    x, y = (k % cols) * 420, (k // cols) * 490
    folha.paste(Image.open(scn.render.filepath), (x, y))
    dr.text((x + 10, y + 464), nome, fill=(30, 30, 30), font=F)
folha.save(SAIDA)
