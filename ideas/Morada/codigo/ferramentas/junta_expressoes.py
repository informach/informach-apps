"""Leva expressões novas (malhas de rosto) de uma geração nova dos corpos para o corpos.blend em uso.

Só copia se o rosto neutro das duas gerações for o mesmo (mesmos pontos no espaço do esqueleto), para não misturar
rostos de versões diferentes.
Uso: python junta_expressoes.py -- <corpos.blend em uso> <corpos.blend novo> <expr1,expr2> <corpo1,corpo2,...>
"""
import bpy, sys
import numpy as np

a = sys.argv[sys.argv.index("--") + 1:]
ATUAL, NOVO = a[0], a[1]
EXPRS, CORPOS = a[2].split(","), a[3].split(",")
bpy.ops.wm.open_mainfile(filepath=ATUAL)


def local(o, arm):
    """Pontos no espaço do esqueleto pai (sem depender da matriz de mundo, que não vale para objetos fora da cena)."""
    M = o.matrix_parent_inverse @ o.matrix_basis
    return np.array([M @ v.co for v in o.data.vertices])


ref = {c: local(bpy.data.objects[f"{c}_rosto_neutro"], bpy.data.objects[c]) for c in CORPOS}
antes = set(bpy.data.objects)
nomes = [f"{c}_rosto_neutro" for c in CORPOS] + [f"{c}_rosto_{e}" for c in CORPOS for e in EXPRS]
with bpy.data.libraries.load(NOVO, link=False) as (src, dst):
    dst.objects = [n for n in nomes if n in src.objects]
novos = {o.name: o for o in dst.objects if o is not None}
feitos = 0
for c in CORPOS:
    arm = bpy.data.objects[c]
    neutro_novo = next((o for o in dst.objects if o and o.name.split(".")[0] == f"{c}_rosto_neutro" and o.parent), None)
    if neutro_novo is None:
        print("sem rosto novo", c)
        continue
    arm_novo = neutro_novo.parent
    dif = np.abs(local(neutro_novo, arm_novo) - ref[c]).max() if len(neutro_novo.data.vertices) == len(ref[c]) else 9
    if dif > 1e-4:
        print("rosto diferente, pulei", c, dif)
        continue
    for e in EXPRS:
        o = next((o for o in dst.objects if o and o.name.split(".")[0] == f"{c}_rosto_{e}"), None)
        if o is None:
            continue
        if f"{c}_rosto_{e}" in bpy.data.objects and bpy.data.objects[f"{c}_rosto_{e}"] is not o:
            bpy.data.objects.remove(bpy.data.objects[f"{c}_rosto_{e}"], do_unlink=True)
        pinv, base = o.matrix_parent_inverse.copy(), o.matrix_basis.copy()  # mesma posição em relação ao esqueleto
        bpy.context.scene.collection.objects.link(o)
        o.parent = arm
        o.matrix_parent_inverse, o.matrix_basis = pinv, base
        for m in o.modifiers:
            if m.type == "ARMATURE":
                m.object = arm
        o.name = f"{c}_rosto_{e}"
        o.data.materials.clear()
        o.data.materials.append(bpy.data.objects[f"{c}_rosto_neutro"].data.materials[0])
        feitos += 1
    print("ok", c, round(float(dif), 7))
# tudo o que veio junto e não foi usado (esqueletos, rostos neutros da outra geração) sai
for o in list(bpy.data.objects):
    if o not in antes and not o.users_collection:
        bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.wm.save_mainfile()
print("fim", feitos)
