"""Veste os corpos prontos com as roupas e acessórios do catálogo (morada-art/roupas.json, encaixe em roupas.py).

Cada item vira uma malha <corpo>_<id> presa ao esqueleto, com a textura do pacote de origem; nos corpos com formas de
gravidez, a peça ganha as mesmas formas. O recém-nascido fica de fora (a manta é a roupa dele). Um item que o corpo já
tem é pulado, a não ser com REFAZ=1. Depois: exporte os corpos (corpo_exporta.py) e rode biblioteca_pacote.py.

Uso: python veste.py -- <corpos.blend> <ids separados por vírgula | todos> [corpos separados por vírgula] [saida.blend]
"""
import os
import sys
import time

import bpy

AQUI = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(AQUI, "morada-art"))
import roupas as R  # noqa: E402

a = sys.argv[sys.argv.index("--") + 1:]
BLEND, IDS = a[0], a[1]
SO = set(a[2].split(",")) if len(a) > 2 and a[2] else set()
SAIDA = a[3] if len(a) > 3 else BLEND
PACOTES = os.path.join(AQUI, "ideias")
REFAZ = os.environ.get("REFAZ") == "1"
itens = R.CATALOGO["itens"] if IDS == "todos" else [R.ITENS[i] for i in IDS.split(",")]

bpy.ops.wm.open_mainfile(filepath=BLEND)
corpos = [o for o in bpy.data.objects if o.type == "ARMATURE" and (o.name + "_corpo") in bpy.data.objects
          and not o.name.startswith("recem") and (not SO or o.name in SO)]
t0, feitos = time.time(), 0
for arm in corpos:
    c = arm.name
    if arm.animation_data:
        arm.animation_data.action = None
    for pb in arm.pose.bones:
        pb.matrix_basis.identity()
    bpy.context.view_layer.update()
    corpo = bpy.data.objects[c + "_corpo"]
    for item in itens:
        nome = f"{c}_{item['id']}"
        velho = bpy.data.objects.get(nome)
        if velho is not None and not REFAZ:
            continue
        try:
            ob = R.veste(item, arm, corpo, PACOTES)
        except Exception as e:  # um item que não encaixa não derruba os outros
            print("falhou", c, item["id"], repr(e), flush=True)
            continue
        if velho is not None:
            bpy.data.objects.remove(velho, do_unlink=True)
        ob.name = ob.data.name = nome
        ob["roupa"] = item["id"]
        ob["slot"] = item["slot"]
        feitos += 1
    print("vestido", c, f"{time.time() - t0:.0f}s", flush=True)
R.limpa_fontes()  # as fontes importadas para medir não ficam no arquivo
bpy.ops.wm.save_as_mainfile(filepath=SAIDA, compress=True)
print("fim", feitos)
