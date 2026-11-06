import bpy, sys
a = sys.argv[sys.argv.index("--") + 1:]
bpy.ops.wm.open_mainfile(filepath=a[0])
bpy.ops.wm.save_as_mainfile(filepath=a[1], compress=True, copy=True)
