"""Folhas de conferência das animações novas, a partir do arquivo-mestre: uma folha por animação, uma linha por bicho,
6 quadros por linha. Uso: python -I bichos_urbano_folhas.py -- <urbano.blend> <saida_dir> [anims] [ids]"""
import os
import sys

ARTE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ARTE)
import bpy  # noqa: E402

import bichos_urbano_ver as VR  # noqa: E402

a = sys.argv[sys.argv.index("--") + 1:]
blend, saida = a[0], a[1]
so = a[2].split(",") if len(a) > 2 and a[2] != "-" else None
ids = a[3].split(",") if len(a) > 3 else None
os.makedirs(saida, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=blend)
bpy.context.scene.render.fps = 24
for o in bpy.data.objects:
    if o.type == "MESH" and (o.parent is None or not o.parent.name.startswith("bicho_")):
        o.hide_render = True
arms = [o for o in bpy.data.objects if o.type == "ARMATURE" and o.name.startswith("bicho_")]
if ids:
    arms = [o for o in arms if o.name[6:] in ids]
PACOTE = {"parado", "andar", "correr"}
nomes = []
for arm in arms:
    for t in arm.animation_data.nla_tracks:
        if t.name not in PACOTE and t.name not in nomes and (not so or t.name in so):
            nomes.append(t.name)
VOO = {"voar", "planar", "decolar", "pousar"}
for nm in nomes:
    linhas = []
    for arm in arms:
        t = arm.animation_data.nla_tracks.get(nm)
        if not t:
            continue
        act = t.strips[0].action
        ob = arm.children[0]
        f0, f1 = act.frame_range
        qs = [round(f0 + (f1 - f0) * k / 5) for k in range(6)]
        linhas.append((arm.name[6:], arm, ob, act, qs))
    for o in bpy.data.objects:
        if o.type == "ARMATURE" and o.name.startswith("bicho_"):
            for c in o.children:
                c.hide_render = True
    vista = (0.7, -1.0, 0.75) if nm in VOO else (1, -0.45, 0.3)
    VR.ver_quadros(linhas, os.path.join(saida, f"anim_{nm}.jpg"), res=(240, 200), vista=vista)
    print("folha", nm, len(linhas), flush=True)
