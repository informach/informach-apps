import bpy, sys
bpy.ops.wm.open_mainfile(filepath=sys.argv[sys.argv.index("--") + 1])
arm = bpy.data.objects[sys.argv[-1]]
print("OSSOS", [b.name for b in arm.data.bones if "Hand" in b.name and b.name.startswith("Left")])
