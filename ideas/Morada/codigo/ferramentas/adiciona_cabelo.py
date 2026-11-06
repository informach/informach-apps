"""Acrescenta itens do catálogo de cabelos (morada-art/cabelos.json) a corpos que já existem, sem regerar os corpos.

Para cada corpo do arquivo-mestre e cada item pedido que sirva nele (grupo 'so' do catálogo; o cabelo original do corpo
fica de fora), encaixa a peça na cabeça (morada-art/cabelos.py), dá o material "Cabelo" e a mesma cor (faixa da
paleta) do cabelo original do corpo. Um item que o corpo já tem é pulado, a não ser com REFAZ=1 (troca a malha).
Depois: exporte os corpos de novo (corpo_exporta.py) e rode biblioteca_pacote.py.

Uso: python adiciona_cabelo.py -- <corpos.blend> <ids separados por vírgula | todos> [corpos separados por vírgula]
"""
import os
import sys

import bpy
import numpy as np

AQUI = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(AQUI, "morada-art"))
import cabelos as CAB  # noqa: E402

a = sys.argv[sys.argv.index("--") + 1:]
BLEND, IDS = a[0], a[1]
SO_CORPOS = set(a[2].split(",")) if len(a) > 2 and a[2] else set()
PACOTES = os.path.join(AQUI, "ideias")
REFAZ = os.environ.get("REFAZ") == "1"
itens = CAB.CATALOGO["itens"] if IDS == "todos" else [CAB.ITENS[i] for i in IDS.split(",")]

bpy.ops.wm.open_mainfile(filepath=BLEND)
mat = bpy.data.materials.get("Cabelo")
corpos = [o for o in bpy.data.objects if o.type == "ARMATURE" and (o.name + "_corpo") in bpy.data.objects
          and (not SO_CORPOS or o.name in SO_CORPOS)]
feitos = 0
for arm in corpos:
    c = arm.name
    if arm.animation_data:
        arm.animation_data.action = None
    for pb in arm.pose.bones:
        pb.matrix_basis.identity()
    bpy.context.view_layer.update()
    corpo = bpy.data.objects[c + "_corpo"]
    original = bpy.data.objects.get(c + "_cabelo")
    if original is None:  # recém-nascido (cabelo rente, gorrinho): não usa o catálogo
        continue
    base = arm.get("base")
    uv0 = np.array([d.uv[:] for d in original.data.uv_layers.active.data])
    cor = (float(uv0[:, 0].mean()), (float(uv0[:, 1].min()), float(uv0[:, 1].max())))
    for item in itens:
        if not CAB.permitido(item, c, base):
            continue
        nome = f"{c}_{item['id']}"
        velho = bpy.data.objects.get(nome)
        if velho is not None and not REFAZ:
            continue
        ob = CAB.encaixa(item, arm, corpo, PACOTES)
        if base is None and not item.get("forma") and len(ob.data.vertices) == len(original.data.vertices):
            bpy.data.objects.remove(ob, do_unlink=True)  # sem a base gravada: é o próprio cabelo original do corpo
            continue
        if velho is not None:
            bpy.data.objects.remove(velho, do_unlink=True)
        ob.name = ob.data.name = nome
        ob.data.materials.clear()
        if mat:
            ob.data.materials.append(mat)
        CAB.uv_faixa(ob, *cor)
        feitos += 1
        print("cabelo", c, item["id"], flush=True)
for arm in corpos:  # os cabelos novos também ficam sob o chapéu (forma "sob_chapeu", "com_chapeu" no esqueleto)
    if (arm.name + "_cabelo") in bpy.data.objects:
        CAB.sob_chapeu(arm, bpy.data.objects[arm.name + "_corpo"])
bpy.ops.wm.save_as_mainfile(filepath=BLEND, compress=True)
print("fim", feitos)
