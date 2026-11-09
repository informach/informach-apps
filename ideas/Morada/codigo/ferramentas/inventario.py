"""Inventário JSON de FBX: malhas, triângulos, dimensões, esqueleto, ações, shape keys, materiais.
Uso: python inventario.py <saida.json> <fbx...>"""
import bpy, json, os, sys
from mathutils import Vector
saida = sys.argv[1]; res = {}
for p in sys.argv[2:]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    try:
        bpy.ops.import_scene.fbx(filepath=p)
    except Exception as e:
        res[p] = {"erro": str(e)}; continue
    r = {"malhas": [], "arm": [], "acoes": []}
    lo = Vector((1e9,)*3); hi = Vector((-1e9,)*3)
    for o in bpy.data.objects:
        if o.type == "ARMATURE":
            r["arm"].append({"nome": o.name, "ossos": [b.name for b in o.data.bones]})
        elif o.type == "MESH":
            me = o.data; me.calc_loop_triangles()
            for v in me.vertices:
                w = o.matrix_world @ v.co
                lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
            r["malhas"].append({"nome": o.name, "tri": len(me.loop_triangles), "mats": [m.name for m in me.materials if m],
                                "grupos": len(o.vertex_groups), "sk": [k.name for k in me.shape_keys.key_blocks] if me.shape_keys else []})
    r["dim"] = [round(x, 3) for x in (hi - lo)] if r["malhas"] else None
    r["acoes"] = [[a.name, int(a.frame_range[0]), int(a.frame_range[1])] for a in bpy.data.actions]
    r["imgs"] = sorted({os.path.basename(i.filepath.replace("\\", "/")) for i in bpy.data.images})
    res[p] = r
json.dump(res, open(saida, "w"), ensure_ascii=False)
print("ok", len(res))
