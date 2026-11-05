import sys, os
import bpy
from mathutils import Vector
def info(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=path)
    out = []
    for o in bpy.data.objects:
        if o.type == "ARMATURE":
            out.append(f"  ARM {o.name} bones={len(o.data.bones)} scale={tuple(round(x,3) for x in o.scale)} rot={tuple(round(x,2) for x in o.rotation_euler)}")
            out.append("    " + ", ".join(b.name for b in o.data.bones))
        elif o.type == "MESH":
            me = o.data; me.calc_loop_triangles()
            ws = [o.matrix_world @ v.co for v in me.vertices]
            zs = [w.z for w in ws]
            sk = [k.name for k in me.shape_keys.key_blocks] if me.shape_keys else None
            out.append(f"  MESH {o.name} tris={len(me.loop_triangles)} verts={len(me.vertices)} mats={[m.name for m in me.materials if m]} "
                       f"groups={len(o.vertex_groups)} z={min(zs):.3f}..{max(zs):.3f} parent={o.parent.name if o.parent else None} shapekeys={sk}")
    acts = [(a.name, tuple(int(x) for x in a.frame_range)) for a in bpy.data.actions]
    if acts: out.append(f"  ACTIONS {acts}")
    imgs = [(i.name, i.size[:]) for i in bpy.data.images]
    if imgs: out.append(f"  IMGS {imgs}")
    return out
for p in sys.argv[1:]:
    print("==", os.path.basename(p))
    for l in info(p): print(l)
