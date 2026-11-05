import bpy, sys
bpy.ops.wm.open_mainfile(filepath=sys.argv[sys.argv.index("--") + 1])
print("DUP", [a.name for a in bpy.data.actions if a.name[-4:-3] == "." and a.name[-3:].isdigit()])
