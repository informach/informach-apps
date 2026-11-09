"""Miniaturas (Workbench, cor da textura) de cada FBX: python miniaturas.py <pasta_texturas> <pasta_saida> <fbx...>"""
import bpy, os, sys, math
from mathutils import Vector
TEX, OUT = sys.argv[1], sys.argv[2]; os.makedirs(OUT, exist_ok=True)
texs = {f.lower(): os.path.join(TEX, f) for f in os.listdir(TEX)}
for p in sys.argv[3:]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=p)
    for im in bpy.data.images:
        c = texs.get(os.path.basename((im.filepath or im.name).replace("\\", "/")).lower())
        if c: im.filepath = c; im.reload()
    pal = next((v for k, v in sorted(texs.items()) if k.startswith(("textures_4", "texture_1", "textures1", "color2"))), None)
    for m in bpy.data.materials:
        if not m.node_tree: continue
        b = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if b and not b.inputs["Base Color"].links and pal and m.name.split(".")[0] in ("Color", "Frame", "Texture_1", "Material"):
            t = m.node_tree.nodes.new("ShaderNodeTexImage"); t.image = bpy.data.images.load(pal, check_existing=True)
            m.node_tree.links.new(t.outputs["Color"], b.inputs["Base Color"])
    ms = [o for o in bpy.data.objects if o.type == "MESH"]
    if not ms: continue
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for o in ms for c in o.bound_box]
    lo = Vector(map(min, *pts)); hi = Vector(map(max, *pts)); c = (lo + hi) / 2; r = max((hi - lo).length / 2, 0.01)
    scn = bpy.context.scene
    cd = bpy.data.cameras.new("c"); cam = bpy.data.objects.new("c", cd); scn.collection.objects.link(cam); scn.camera = cam
    cd.type = "ORTHO"; cd.ortho_scale = r * 2.1
    a, e = math.radians(-35), math.radians(25)
    cam.location = c + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * r * 6
    cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler()
    cd.clip_end = r * 20
    scn.render.engine = "CYCLES"; scn.cycles.samples = 12; scn.cycles.device = "CPU"; scn.cycles.use_denoising = True
    scn.view_settings.view_transform = "Standard"
    w = bpy.data.worlds.new("w"); scn.world = w; w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (1, 1, 1, 1); w.node_tree.nodes["Background"].inputs[1].default_value = 0.9
    bpy.ops.object.light_add(type="SUN"); s = bpy.context.active_object; s.data.energy = 2.5
    s.rotation_euler = (math.radians(50), 0, math.radians(-40))
    scn.render.resolution_x = scn.render.resolution_y = 220; scn.render.film_transparent = True
    scn.render.filepath = os.path.join(OUT, os.path.splitext(os.path.basename(p))[0] + ".png")
    bpy.ops.render.render(write_still=True)
print("fim")
