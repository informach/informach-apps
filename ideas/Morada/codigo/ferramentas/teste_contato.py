import bpy, os, sys, math, time
sys.path.insert(0, os.path.abspath("morada-art"))
import contato
from mathutils import Vector
BLEND = os.environ.get("BLEND", "corpos/out/corpos.blend")
bpy.ops.wm.open_mainfile(filepath=os.path.abspath(BLEND))
scn = bpy.context.scene
NOME = sys.argv[sys.argv.index("--") + 1]; MAO = sys.argv[sys.argv.index("--") + 2]; ANIMS = sys.argv[sys.argv.index("--") + 3:]
arm = bpy.data.objects[NOME]; corpo = bpy.data.objects[NOME + "_corpo"]
for o in bpy.data.objects:
    if o.type == "ARMATURE": o.animation_data.action = None
    if o.type == "MESH": o.hide_render = not o.name.startswith(NOME + "_") or ("_rosto_" in o.name and not o.name.endswith("_neutro"))
scn.render.engine = "CYCLES"; scn.cycles.samples = 10; scn.cycles.device = "CPU"
w = bpy.data.worlds.new("w"); scn.world = w; w.use_nodes = True; w.node_tree.nodes["Background"].inputs[1].default_value = 3.0
scn.view_settings.view_transform = "Standard"; scn.view_settings.exposure = 0.8
cd = bpy.data.cameras.new("c"); cam = bpy.data.objects.new("c", cd); scn.collection.objects.link(cam); scn.camera = cam
cd.type = "ORTHO"; cd.ortho_scale = 0.75; scn.render.resolution_x = scn.render.resolution_y = 300
L = arm.parent.location
def foto(tag):
    for a_ in ANIMS:
        a = bpy.data.actions[f"{NOME}_{a_}"]; arm.animation_data.action = a; arm.animation_data.action_slot = a.slots[0]
        f0, f1 = (int(x) for x in a.frame_range)
        for j, f in enumerate(((f0 + f1) // 2, f1)):
            scn.frame_set(f)
            c = arm.matrix_world @ arm.pose.bones[MAO + "Hand"].tail
            cam.location = c + Vector((1.2, -2.6, 1.0)); cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler()
            scn.render.filepath = os.path.abspath(f"corpos/contato/{NOME}_{a_}_{j}_{tag}.png"); bpy.ops.render.render(write_still=True)
TAG = os.environ.get("TAG", "antes")
foto(TAG)
if os.environ.get("SO_FOTO"):
    sys.exit(0)
t = time.time()
r = contato.corrigir(arm, corpo, [bpy.data.actions[f"{NOME}_{a}"] for a in ANIMS], (corpo.dimensions.z if False else 1.77) / 1.75,
                     descanso=("deitando", "dormindo_cama", "dormindo_chao", "sentado", "sentando"),
                     apoio={"deitando": "cama", "dormindo_cama": "cama", "dormindo_chao": "chao", "abdominal": "chao", "rezando": "chao"})
print("corrigidos", r, round(time.time() - t, 1), "s")
foto("depois")
print("ok")
