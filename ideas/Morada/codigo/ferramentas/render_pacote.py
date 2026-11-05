"""Renderiza um FBX do pacote: python render_pacote.py <fbx> <pasta_texturas> <saida_prefixo> <manter|*> <acao|-> <quadro> <vistas>"""
import math, os, sys
import bpy
from mathutils import Vector
FBX, TEX, OUT, MANTER, ACAO, QUADRO, VISTAS = sys.argv[1:8]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=FBX)
for im in bpy.data.images:
    c = os.path.join(TEX, os.path.basename(im.filepath or im.name))
    if os.path.exists(c):
        im.filepath = c; im.reload()
paleta = next((os.path.join(TEX, f) for f in sorted(os.listdir(TEX)) if f.startswith(("Color", "Textures_")) and f.endswith(".png")), None)
for m in bpy.data.materials:
    if not m.node_tree: continue
    b = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if not b: continue
    b.inputs["Roughness"].default_value = 0.8
    if m.name == "Color" and not b.inputs["Base Color"].links and paleta:  # o FBX às vezes perde o nó da paleta
        t = m.node_tree.nodes.new("ShaderNodeTexImage"); t.image = bpy.data.images.load(paleta, check_existing=True)
        m.node_tree.links.new(t.outputs["Color"], b.inputs["Base Color"])
manter = None if MANTER == "*" else set(MANTER.split(","))
for o in bpy.data.objects:
    if o.type == "MESH" and manter is not None and o.name not in manter:
        o.hide_render = True
arm = next((o for o in bpy.data.objects if o.type == "ARMATURE"), None)
if arm and ACAO != "-":
    a = next(a for a in bpy.data.actions if ACAO in a.name)
    arm.animation_data_create(); arm.animation_data.action = a
    if hasattr(arm.animation_data, "action_slot") and a.slots: arm.animation_data.action_slot = a.slots[0]
    bpy.context.scene.frame_set(int(QUADRO))
scn = bpy.context.scene
scn.render.engine = "CYCLES"; scn.cycles.samples = 24; scn.cycles.device = "CPU"
scn.view_settings.view_transform = "AgX"
w = bpy.data.worlds.new("w"); scn.world = w; w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.78, 0.77, 0.76, 1)
w.node_tree.nodes["Background"].inputs[1].default_value = 0.6
for loc, en in (((2, -3, 3), 450), ((-3, -2, 2), 180), ((0, 3, 3), 250)):
    bpy.ops.object.light_add(type="AREA", location=loc)
    l = bpy.context.active_object; l.data.energy = en; l.data.size = 3
    l.rotation_euler = (Vector((0, 0, 1)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
bpy.ops.mesh.primitive_plane_add(size=30)
cd = bpy.data.cameras.new("c"); cam = bpy.data.objects.new("c", cd); scn.collection.objects.link(cam); scn.camera = cam
dg = bpy.context.evaluated_depsgraph_get()
zs = []
for o in bpy.data.objects:
    if o.type == "MESH" and not o.hide_render and o.name != "Plane":
        e = o.evaluated_get(dg); me = e.to_mesh()
        zs += [(e.matrix_world @ v.co).z for v in me.vertices]; e.to_mesh_clear()
alt = max(zs)
for k, v in enumerate(VISTAS.split(",")):
    tipo, ang = v.split(":")
    a = math.radians(float(ang))
    if tipo == "corpo":
        scn.render.resolution_x, scn.render.resolution_y = 600, 800
        alvo = Vector((0, 0, alt * 0.5)); dist = alt * 2.6; cd.lens = 50
    else:
        scn.render.resolution_x, scn.render.resolution_y = 600, 600
        alvo = Vector((0, 0, alt * 0.9)); dist = alt * 0.55; cd.lens = 60
    cam.location = alvo + Vector((math.sin(a) * dist, -math.cos(a) * dist, 0.05 * alt))
    cam.rotation_euler = (alvo - cam.location).to_track_quat("-Z", "Y").to_euler()
    scn.render.filepath = f"{OUT}_{k}.png"
    bpy.ops.render.render(write_still=True)
print("altura", alt)
