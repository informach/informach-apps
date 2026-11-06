import bpy, sys
a = sys.argv[sys.argv.index("--") + 1:]
for f in a[:2]:
    bpy.ops.wm.open_mainfile(filepath=f)
    o = bpy.data.objects["adulto_rosto_neutro"]; arm = bpy.data.objects["adulto"]
    print(f.split("/")[-2], "par", o.parent.name if o.parent else None, "parent_type", o.parent_type, "bone", o.parent_bone)
    print("  arm mw t", tuple(round(x,3) for x in arm.matrix_world.translation), "o mw t", tuple(round(x,3) for x in o.matrix_world.translation))
    print("  v0", tuple(round(x,3) for x in o.data.vertices[0].co), "nverts", len(o.data.vertices))
