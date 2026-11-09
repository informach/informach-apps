"""Renderiza os bichos do arquivo-mestre numa animação/quadro: folha com todos (e, opcional, um close de cada).
Uso: python render_bichos.py -- <blend> <saida.png> [animacao] [quadro] [closes_dir] [ids]"""
import bpy, sys, math, os
from mathutils import Vector
a = sys.argv[sys.argv.index("--") + 1:]
blend, saida = a[0], a[1]
anim = a[2] if len(a) > 2 else "parado"
quadro = int(a[3]) if len(a) > 3 else 40
closes = a[4] if len(a) > 4 and a[4] != "-" else None
so = a[5].split(",") if len(a) > 5 else None
bpy.ops.wm.open_mainfile(filepath=blend)
scn = bpy.context.scene
arms = sorted([o for o in bpy.data.objects if o.type == "ARMATURE" and o.name.startswith("bicho_")], key=lambda o: o.name)
if so:
    for o in arms:
        if o.name[6:] not in so:
            for c in o.children: c.hide_render = True
    arms = [o for o in arms if o.name[6:] in so]
ordem = ["doberman_marrom", "labrador", "rottweiler", "doberman", "spitz", "salsicha", "gato", "lulu_rosa", "gato_laranja",
         "salsicha_marrom", "gato_frajola", "lulu", "lulu_azul"]
arms.sort(key=lambda o: ordem.index(o.name[6:]) if o.name[6:] in ordem else 99)
for o in arms:
    ad = o.animation_data
    t = ad.nla_tracks.get(anim)
    if t:
        st = t.strips[0]
        ad.action = st.action
        if st.action.slots: ad.action_slot = st.action.slots[0]
    for tt in ad.nla_tracks: tt.mute = True
n = len(arms)
cols = 5 if n > 6 else n
POS = {}
for k, o in enumerate(arms):  # a animação guarda a posição do próprio esqueleto: cada um vai dentro de um vazio
    e = bpy.data.objects.new("lugar_" + o.name, None); scn.collection.objects.link(e)
    e.location = ((k % cols) * 1.05 - (cols - 1) * 0.525, (k // cols) * 1.15, 0)
    e.rotation_euler.z = math.radians(-35)
    o.parent = e
    o.location = (0, 0, 0)
    POS[o.name] = e
scn.frame_set(quadro)
scn.render.engine = "CYCLES"; scn.cycles.samples = int(os.environ.get("AMOSTRAS", 24)); scn.cycles.use_denoising = True; scn.cycles.device = "CPU"
scn.render.resolution_x, scn.render.resolution_y = int(os.environ.get("RX", 1600)), int(os.environ.get("RY", 1000))
scn.view_settings.view_transform = "Standard"
w = bpy.data.worlds.new("w"); scn.world = w; w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.03, 0.035, 0.08, 1); w.node_tree.nodes["Background"].inputs[1].default_value = 1.0
bpy.ops.mesh.primitive_plane_add(size=40); chao = bpy.context.active_object
m = bpy.data.materials.new("chao"); m.use_nodes = True; m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.035, 0.04, 0.09, 1)
chao.data.materials.append(m)
bpy.ops.object.light_add(type="SUN"); sol = bpy.context.active_object; sol.data.energy = 3.0; sol.rotation_euler = (math.radians(40), math.radians(15), math.radians(-30)); sol.data.angle = math.radians(8)
bpy.ops.object.light_add(type="AREA"); ar = bpy.context.active_object; ar.data.energy = 300; ar.data.size = 6; ar.location = (0, -4, 4); ar.rotation_euler = (math.radians(45), 0, 0)
cd = bpy.data.cameras.new("c"); cam = bpy.data.objects.new("c", cd); scn.collection.objects.link(cam); scn.camera = cam
cd.lens = 50
cx = 0; cy = ((n - 1) // cols) * 1.15 / 2
alvo = Vector((cx, cy, 0.25))
cam.location = alvo + Vector((0, -5.2, 3.9)) * (0.75 if n <= 6 else 1.45)
cam.rotation_euler = (alvo - cam.location).to_track_quat("-Z", "Y").to_euler()
scn.render.filepath = saida
bpy.ops.render.render(write_still=True)
if closes:
    os.makedirs(closes, exist_ok=True)
    scn.render.resolution_x, scn.render.resolution_y = 600, 600
    dg = bpy.context.evaluated_depsgraph_get()
    for o in arms:
        for x in arms:
            for c in x.children: c.hide_render = x is not o
        ob = o.children[0]
        ev = ob.evaluated_get(dg)
        pts = [ev.matrix_world @ v.co for v in ev.data.vertices]
        mn = Vector([min(p[i] for p in pts) for i in range(3)]); mx = Vector([max(p[i] for p in pts) for i in range(3)])
        tam = (mx - mn).length
        for nome, alvo, d, dirc in (("corpo", (mn + mx) / 2, tam * 0.75, Vector((-0.55, -0.8, 0.35))),
                                    ("cabeca", None, None, Vector((-0.35, -0.9, 0.15)))):
            if nome == "cabeca":
                hb = o.pose.bones["Head"]
                alvo = o.matrix_world @ ((hb.head + hb.tail) / 2)
                d = tam * 0.3
            cam.location = alvo + dirc.normalized() * d * 1.6
            cam.rotation_euler = (alvo - cam.location).to_track_quat("-Z", "Y").to_euler()
            scn.render.filepath = os.path.join(closes, o.name[6:] + "_" + nome + ".png")
            bpy.ops.render.render(write_still=True)
print("ok")
