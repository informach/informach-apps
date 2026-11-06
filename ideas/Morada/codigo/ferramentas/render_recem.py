"""Três vistas de cada recém-nascido (frente, três quartos, lado), com uma expressão escolhida."""
import bpy, sys, math, os
from mathutils import Vector
a = sys.argv[sys.argv.index("--") + 1:]
BLEND, OUT = a[0], a[1]; EXPR = a[2] if len(a) > 2 else "neutro"; GORRO = len(a) > 3 and a[3] == "gorro"
VISTAS = (("frente", 0), ("tres_quartos", 40), ("lado", 90)) if len(a) < 5 else tuple((v, int(v)) for v in a[4].split(","))
bpy.ops.wm.open_mainfile(filepath=BLEND)
scn = bpy.context.scene
for o in [o for o in bpy.data.objects if o.type in ("LIGHT", "CAMERA")]: bpy.data.objects.remove(o, do_unlink=True)
scn.render.engine = "CYCLES"; scn.cycles.samples = 24; scn.cycles.use_denoising = True; scn.cycles.device = "CPU"
scn.render.resolution_x, scn.render.resolution_y = 360, 480; scn.render.film_transparent = False
w = bpy.data.worlds.new("w"); scn.world = w; w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.86, 0.87, 0.9, 1); w.node_tree.nodes["Background"].inputs[1].default_value = 0.7
bpy.ops.object.light_add(type="AREA", location=(1, -2, 2)); L = bpy.context.active_object; L.data.energy = 60; L.data.size = 2
L.rotation_euler = (Vector((0, 0, 0.3)) - L.location).to_track_quat("-Z", "Y").to_euler()
cd = bpy.data.cameras.new("c"); cam = bpy.data.objects.new("c", cd); scn.collection.objects.link(cam); scn.camera = cam
cd.type = "ORTHO"; cd.ortho_scale = 0.62
for nome in ("recem_m", "recem_f"):
    arm = bpy.data.objects[nome]; lugar = arm.parent
    for o in bpy.data.objects:
        if o.type == "MESH":
            meu = o.parent is arm
            o.hide_render = not meu or ("_rosto_" in o.name and not o.name.endswith("_" + EXPR))
            if meu and o.name.endswith("_gorro"): o.hide_render = not GORRO
    if EXPR != "neutro":
        r = bpy.data.objects.get(nome + "_rosto")
        if r: r.hide_render = True
    x = lugar.location.x; alvo = Vector((x, 0, 0.27)) if len(a) < 5 else Vector((x, 0, 0.43))
    cd.ortho_scale = 0.62 if len(a) < 5 else 0.22
    L.location = Vector((x + 1, -2, 2)); L.rotation_euler = (alvo - L.location).to_track_quat("-Z", "Y").to_euler()
    for vista, az in VISTAS:
        d = Vector((math.sin(math.radians(az)), -math.cos(math.radians(az)), 0.12)).normalized()
        cam.location = alvo + d * 3; cam.rotation_euler = (alvo - cam.location).to_track_quat("-Z", "Y").to_euler()
        scn.render.filepath = os.path.join(OUT, f"{nome}_{EXPR}{'_gorro' if GORRO else ''}_{vista}.png"); bpy.ops.render.render(write_still=True)
