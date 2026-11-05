"""Importa um FBX de cenário/móveis, religa texturas e renderiza vistas.
python cena_pacote.py <fbx> <pasta_tex1,pasta_tex2> <saida_prefixo> <vistas 'az:elev:zoom,...'> [resumo]"""
import math, os, sys
import bpy
from mathutils import Vector
FBX, TEXS, OUT, VISTAS = sys.argv[1:5]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=FBX)
pastas = TEXS.split(",")
def achar(nome):
    for p in pastas:
        c = os.path.join(p, nome)
        if os.path.exists(c): return c
for im in bpy.data.images:
    c = achar(os.path.basename(im.filepath.replace("\\", "/")) or im.name)
    if c: im.filepath = c; im.reload()
paleta = None
for p in pastas:
    for f in sorted(os.listdir(p)):
        if f.startswith(("Textures", "Color")) and f.endswith(".png"): paleta = paleta or os.path.join(p, f)
for m in bpy.data.materials:
    if not m.node_tree: continue
    b = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if not b: continue
    if not b.inputs["Base Color"].links and paleta and m.name.lower().startswith(("color", "texture", "material")):
        t = m.node_tree.nodes.new("ShaderNodeTexImage"); t.image = bpy.data.images.load(paleta, check_existing=True)
        m.node_tree.links.new(t.outputs["Color"], b.inputs["Base Color"])
malhas = [o for o in bpy.data.objects if o.type == "MESH"]
tri = 0
mn, mx = Vector((1e9,)*3), Vector((-1e9,)*3)
for o in malhas:
    o.data.calc_loop_triangles(); tri += len(o.data.loop_triangles)
    for c in o.bound_box:
        w = o.matrix_world @ Vector(c); mn = Vector(map(min, mn, w)); mx = Vector(map(max, mx, w))
print("malhas", len(malhas), "triângulos", tri, "caixa", tuple(round(x,1) for x in mn), tuple(round(x,1) for x in mx))
print("materiais", sorted({m.name for o in malhas for m in o.data.materials if m})[:30])
print("imagens", [(i.name, i.size[:]) for i in bpy.data.images if i.size[0]])
if len(sys.argv) > 5:
    nomes = sorted(o.name for o in malhas if o.parent is None or o.parent.type != "MESH")
    print("objetos raiz", len(nomes), nomes[:80])
scn = bpy.context.scene
scn.render.engine = "CYCLES"; scn.cycles.samples = 32; scn.cycles.device = "CPU"
scn.render.resolution_x, scn.render.resolution_y = 1200, 800; scn.view_settings.view_transform = "AgX"
w = bpy.data.worlds.new("w"); scn.world = w; w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.75, 0.82, 0.92, 1); w.node_tree.nodes["Background"].inputs[1].default_value = 0.8
bpy.ops.object.light_add(type="SUN", location=(0, 0, 10)); s = bpy.context.active_object; s.data.energy = 3.5
s.rotation_euler = (math.radians(50), math.radians(10), math.radians(35)); s.data.angle = math.radians(8)
cd = bpy.data.cameras.new("c"); cam = bpy.data.objects.new("c", cd); scn.collection.objects.link(cam); scn.camera = cam
centro = (mn + mx) / 2; raio = (mx - mn).length / 2
for k, v in enumerate(VISTAS.split(",")):
    az, el, zoom = (float(x) for x in v.split(":"))
    a, e = math.radians(az), math.radians(el); d = raio * 2.2 / zoom
    cd.lens = 40
    alvo = centro.copy()
    cam.location = alvo + Vector((math.sin(a) * math.cos(e) * d, -math.cos(a) * math.cos(e) * d, math.sin(e) * d))
    cam.rotation_euler = (alvo - cam.location).to_track_quat("-Z", "Y").to_euler()
    scn.render.filepath = f"{OUT}_{k}.png"; bpy.ops.render.render(write_still=True)
