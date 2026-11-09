import sys, math, bpy
from mathutils import Vector
from PIL import Image, ImageDraw, ImageFont
bpy.ops.wm.open_mainfile(filepath=sys.argv[1]); OUT=sys.argv[2]
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
for t in arm.animation_data.nla_tracks: t.mute = True
rosto = next(o for o in bpy.data.objects if o.data and getattr(o.data, "shape_keys", None) and "piscar" in o.data.shape_keys.key_blocks)
kb = rosto.data.shape_keys.key_blocks
scn = bpy.context.scene
scn.render.engine = "CYCLES"; scn.cycles.samples = 24; scn.cycles.device = "CPU"
scn.render.resolution_x, scn.render.resolution_y = 420, 460; scn.view_settings.view_transform = "AgX"
w = bpy.data.worlds.new("w"); scn.world = w; w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.78, 0.77, 0.76, 1); w.node_tree.nodes["Background"].inputs[1].default_value = 0.6
for loc, en in (((1.2, -2.5, 2.2), 260), ((-2, -1.5, 1.8), 110), ((0, 2, 2.5), 160)):
    bpy.ops.object.light_add(type="AREA", location=loc); l = bpy.context.active_object; l.data.energy = en; l.data.size = 2
    l.rotation_euler = (Vector((0, 0, 1.55)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
cd = bpy.data.cameras.new("c"); cam = bpy.data.objects.new("c", cd); scn.collection.objects.link(cam); scn.camera = cam; cd.lens = 70
alvo = Vector((0, 0, 1.6))
EX = [("Neutro", {}, 0), ("Piscando", {"piscar": 1}, 0), ("Feliz", {"sobr_sobe": 0.6, "boca_larga": 1}, 0), ("Bravo", {"sobr_brava": 1}, 0),
      ("Triste", {"sobr_triste": 1}, 0), ("Surpreso", {"sobr_sobe": 1, "boca_o": 1}, 0), ("Falando", {"boca_abre": 1}, 0), ("De lado", {}, 40)]
F = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 18)
folha = Image.new("RGB", (420 * 4, 490 * 2), "white"); dr = ImageDraw.Draw(folha)
for k, (nome, p, ang) in enumerate(EX):
    for b in kb[1:]: b.value = p.get(b.name, 0)
    a = math.radians(ang)
    cam.location = alvo + Vector((math.sin(a) * 0.95, -math.cos(a) * 0.95, 0.02)); cam.rotation_euler = (alvo - cam.location).to_track_quat("-Z", "Y").to_euler()
    scn.render.filepath = f"{OUT}_{k}.png"; bpy.ops.render.render(write_still=True)
    x, y = (k % 4) * 420, (k // 4) * 490; folha.paste(Image.open(scn.render.filepath), (x, y)); dr.text((x + 10, y + 464), nome, fill=(30, 30, 30), font=F)
folha.save(OUT + ".png")
