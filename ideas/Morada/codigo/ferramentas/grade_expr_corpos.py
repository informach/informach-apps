import bpy, math, os, sys
from mathutils import Vector
bpy.ops.wm.open_mainfile(filepath=os.path.abspath("corpos/out/corpos.blend"))
scn = bpy.context.scene
NOMES = ["neutro","feliz","triste","bravo","confiante","serio","surpreso","assustado","aborrecido","confuso"]
CORPOS = sys.argv[sys.argv.index("--")+1:]
for o in bpy.data.objects:
    if o.type == "ARMATURE" and o.animation_data: o.animation_data.action = None
    if o.type == "ARMATURE":
        for pb in o.pose.bones: pb.matrix_basis.identity()
bpy.context.view_layer.update()
scn.render.engine = "CYCLES"; scn.cycles.samples = 16; scn.cycles.device = "CPU"; scn.view_settings.view_transform = "Standard"; scn.view_settings.exposure = -0.7
w = bpy.data.worlds.new("w"); scn.world = w; w.use_nodes = True; w.node_tree.nodes["Background"].inputs[0].default_value = (0.25, 0.33, 0.55, 1); w.node_tree.nodes["Background"].inputs[1].default_value = 1.0
bpy.ops.object.light_add(type="AREA", location=(0, -2, 2.2)); L = bpy.context.active_object; L.data.energy = 120; L.data.size = 2
cd = bpy.data.cameras.new("c"); cam = bpy.data.objects.new("c", cd); scn.collection.objects.link(cam); scn.camera = cam
cd.type = "ORTHO"; scn.render.resolution_x = scn.render.resolution_y = 220
os.makedirs("corpos/expr2", exist_ok=True)
for nome in CORPOS:
    arm = bpy.data.objects[nome]
    cab = arm.matrix_world @ arm.pose.bones["Head"].head
    alt = (arm.matrix_world @ arm.pose.bones["Head"].tail - cab).length
    for o in bpy.data.objects:
        if o.type == "MESH": o.hide_render = not o.name.startswith(nome + "_")
    cd.ortho_scale = alt * 2.4
    alvo = cab + Vector((0, 0, alt * 0.75))
    cam.location = alvo + Vector((0, -3, 0)); cam.rotation_euler = (math.radians(90), 0, 0)
    L.location = alvo + Vector((0.5, -2, 0.6)); L.rotation_euler = (alvo - L.location).to_track_quat("-Z", "Y").to_euler()
    for e in NOMES:
        for o in bpy.data.objects:
            if o.type == "MESH" and o.name.startswith(nome + "_rosto_"): o.hide_render = not o.name.endswith("_" + e)
        scn.render.filepath = os.path.abspath(f"corpos/expr2/{nome}_{e}.png"); bpy.ops.render.render(write_still=True)
print("ok")
