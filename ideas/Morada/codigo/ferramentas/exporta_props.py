"""Props grandes da biblioteca (props.py) em GLB, com o ponto de encaixe vazio ("berco" no carrinho: onde o
recém-nascido deita; x para os pés, z para cima). Uso: python exporta_props.py -- <saída>"""
import os, sys
import bpy
from mathutils import Vector
AQUI = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(AQUI, "morada-art"))
import props as PR  # noqa: E402
SAIDA = sys.argv[sys.argv.index("--") + 1]
os.makedirs(SAIDA, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
# alça a 1,0 m, centrada na origem; o carrinho anda para +y (a frente dos corpos é -y: quem empurra fica atrás dele)
obs, berco = PR.carrinho_bebe(Vector((-0.21, 0, 1.0)), Vector((0.21, 0, 1.0)), Vector((0, 1, 0)))
raiz = bpy.data.objects.new("carrinho_bebe", None)
bpy.context.scene.collection.objects.link(raiz)
for o in obs:
    o.parent = raiz
e = bpy.data.objects.new("berco", None)
e.empty_display_type = "ARROWS"
e.empty_display_size = 0.1
e.matrix_world = berco
e.parent = raiz
bpy.context.scene.collection.objects.link(e)
bpy.ops.export_scene.gltf(filepath=os.path.join(SAIDA, "carrinho_bebe.glb"), export_format="GLB", export_extras=True)
print("fim", os.path.getsize(os.path.join(SAIDA, "carrinho_bebe.glb")))
