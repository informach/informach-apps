import bpy, sys, collections
bpy.ops.wm.open_mainfile(filepath=sys.argv[sys.argv.index("--") + 1])
n = [a.name for a in bpy.data.actions if a.name.startswith("adulto_")]
print(len(n)); print(sorted(n)[:80])
