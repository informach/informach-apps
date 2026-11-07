"""Refaz as miniaturas de uma ou mais categorias a partir dos GLB (mesma luz e ângulo para a biblioteca toda).
Uso: blender-venv/bin/python -I miniaturas_moveis.py -- <morada-art> <moveis_out> <saida_dir_ou_-> cat1 [cat2 ...]
Com saida "-", grava por cima de <moveis_out>/<cat>/miniaturas/."""
import sys, os, json
a = sys.argv[sys.argv.index("--") + 1:]
sys.path.insert(0, a[0])
import bpy
import moveis_base as mb
O, DEST, cats = a[1], a[2], a[3:]
SOL = float(os.environ.get("MINI_SOL", "2.4")); MUNDO = float(os.environ.get("MINI_MUNDO", "0.7"))
for cat in cats:
    c = json.load(open(os.path.join(O, cat, "catalogo.json")))
    for it in c["itens"]:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=os.path.join(O, cat, it["arquivo"]))
        raiz = [o for o in bpy.context.scene.objects if o.parent is None and o.type in ("MESH", "EMPTY")][0]
        scn = mb._prepara_render(192)
        bpy.data.objects["sol_moveis"].data.energy = SOL
        scn.world.node_tree.nodes["Background"].inputs[1].default_value = MUNDO
        l, p, h = it["dims"]
        if it.get("fixacao") == "parede" and p < 0.12:
            d = (0.32, -1.0, 0.18)
        elif it.get("fixacao") == "parede":
            d = (0.45, -1.0, 0.32)
        elif h < 0.06 and max(l, p) > 0.3:
            d = (0.45, -1.0, 1.25)
        else:
            d = (0.55, -1.0, 0.5)
        out = os.path.join(O, cat, "miniaturas", it["id"] + ".webp") if DEST == "-" else os.path.join(DEST, cat, it["id"] + ".webp")
        mb.miniatura(raiz, out, direcao=d)
        print("mini", cat, it["id"], flush=True)
