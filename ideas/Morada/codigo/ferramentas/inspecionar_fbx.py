import sys
import bpy
from mathutils import Vector
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=sys.argv[1])
for o in bpy.data.objects:
    info = [o.name, o.type, tuple(round(x, 3) for x in o.dimensions), tuple(round(x, 3) for x in o.scale),
            tuple(round(x, 1) for x in o.rotation_euler)]
    if o.type == "MESH":
        me = o.data
        me.calc_loop_triangles()
        info += [f"verts={len(me.vertices)}", f"tris={len(me.loop_triangles)}", f"mats={[m.name for m in me.materials]}",
                 f"uv={len(me.uv_layers)}", f"groups={len(o.vertex_groups)}",
                 f"shapekeys={[k.name for k in me.shape_keys.key_blocks] if me.shape_keys else None}"]
        ws = [o.matrix_world @ v.co for v in me.vertices]
        info.append(f"zmin={min(w.z for w in ws):.3f} zmax={max(w.z for w in ws):.3f}")
    if o.type == "ARMATURE":
        info.append(f"bones={len(o.data.bones)}")
        info.append([b.name for b in o.data.bones])
    print(info)
print("ACTIONS:")
for a in bpy.data.actions:
    print(" ", a.name, tuple(round(x) for x in a.frame_range))
for im in bpy.data.images:
    print("IMG", im.name, im.size[:])
