import bpy, sys, os, glob
pasta = sys.argv[sys.argv.index("--") + 1]
for f in sorted(glob.glob(os.path.join(pasta, "*.fbx"))):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=f)
    arms = [o for o in bpy.data.objects if o.type == "ARMATURE"]
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    zs = [(o.matrix_world @ v.co).z for o in meshes for v in o.data.vertices]
    imgs = [i for i in bpy.data.images if i.size[0] > 0]
    print(os.path.basename(f), "ossos", len(arms[0].data.bones) if arms else 0, "malhas", len(meshes),
          "altura %.2f" % (max(zs) - min(zs)), "texturas", len(imgs))
