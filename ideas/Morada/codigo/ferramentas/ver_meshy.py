"""Renderiza o modelo do Meshy: frente, 3/4, costas, rosto e quadros das animações."""
import math
import sys
import bpy
from mathutils import Vector

FBX, TEX, OUT = sys.argv[1:4]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=FBX)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
me = next(o for o in bpy.data.objects if o.type == "MESH")
img = bpy.data.images.load(TEX)
for m in me.data.materials:
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    t = next((n for n in nt.nodes if n.type == "TEX_IMAGE"), None) or nt.nodes.new("ShaderNodeTexImage")
    t.image = img
    nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.7
scn = bpy.context.scene
scn.render.engine = "CYCLES"
scn.cycles.samples = 32
scn.cycles.device = "CPU"
scn.render.resolution_x, scn.render.resolution_y = 700, 900
scn.view_settings.view_transform = "AgX"
w = bpy.data.worlds.new("w"); scn.world = w
w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.75, 0.73, 0.72, 1)
w.node_tree.nodes["Background"].inputs[1].default_value = 0.5
for loc, en, sz in (((2, -3, 3), 500, 3), ((-3, -2, 2), 200, 3), ((0, 3, 3), 300, 2)):
    bpy.ops.object.light_add(type="AREA", location=loc)
    l = bpy.context.active_object; l.data.energy = en; l.data.size = sz
    l.rotation_euler = (Vector((0, 0, 1)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
bpy.ops.mesh.primitive_plane_add(size=20)
cam_d = bpy.data.cameras.new("c"); cam = bpy.data.objects.new("c", cam_d); scn.collection.objects.link(cam); scn.camera = cam


def foto(nome, alvo, ang, dist, lente=50):
    cam_d.lens = lente
    a = math.radians(ang)
    cam.location = alvo + Vector((math.sin(a) * dist, -math.cos(a) * dist, 0.05))
    cam.rotation_euler = (alvo - cam.location).to_track_quat("-Z", "Y").to_euler()
    scn.render.filepath = f"{OUT}/{nome}.png"
    bpy.ops.render.render(write_still=True)


ws = [me.matrix_world @ v.co for v in me.data.vertices]
alt = max(w.z for w in ws)
corpo = Vector((0, 0, alt * 0.5))
rosto = Vector((0, 0, alt * 0.92))
arm.animation_data_clear() if arm.animation_data else None
foto("frente", corpo, 0, 4.2)
foto("tres_quartos", corpo, 35, 4.2)
foto("costas", corpo, 180, 4.2)
foto("rosto", rosto, 0, 0.9, 60)
foto("rosto_lado", rosto, 60, 0.9, 60)
print("ALTURA", alt)
