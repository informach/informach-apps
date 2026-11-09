"""Cabelo sob o chapéu no arquivo-mestre (cabelos.sob_chapeu): cada cabelo dos corpos ganha a forma "sob_chapeu",
ligada à propriedade "com_chapeu" do esqueleto (1 com chapéu). veste.py e adiciona_cabelo.py já fazem isso nos corpos
em que mexem; este script faz em todos de uma vez.

Uso: python cabelo_chapeu.py -- <corpos.blend> [saida.blend]
"""
import os
import sys

import bpy

AQUI = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(AQUI, "morada-art"))
import cabelos as CAB  # noqa: E402

a = sys.argv[sys.argv.index("--") + 1:]
BLEND = a[0]
SAIDA = a[1] if len(a) > 1 else BLEND
bpy.ops.wm.open_mainfile(filepath=BLEND)
feitos = 0
for arm in [o for o in bpy.data.objects if o.type == "ARMATURE" and (o.name + "_corpo") in bpy.data.objects]:
    if arm.animation_data:
        arm.animation_data.action = None
    for pb in arm.pose.bones:
        pb.matrix_basis.identity()
    bpy.context.view_layer.update()
    feitos += CAB.sob_chapeu(arm, bpy.data.objects[arm.name + "_corpo"])
bpy.ops.wm.save_as_mainfile(filepath=SAIDA, compress=True)
print("fim", feitos)
