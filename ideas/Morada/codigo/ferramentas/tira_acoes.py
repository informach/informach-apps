"""Tira do .blend as ações cujo nome contém algum dos trechos dados."""
import bpy, sys
a = sys.argv[sys.argv.index("--") + 1:]
bpy.ops.wm.open_mainfile(filepath=a[0])
fora = [x.name for x in bpy.data.actions if any(t in x.name for t in a[1].split(","))]
for n in fora:
    bpy.data.actions.remove(bpy.data.actions[n])
bpy.ops.wm.save_mainfile(compress=True)
print("tiradas", len(fora), fora)
