"""Importa cada modelo de referência, mede a construção e renderiza texturizado e em malha.
Uso: python estudar_referencias.py <saida_dir> <arquivo1> [<arquivo2> ...]
"""
import json
import math
import os
import sys

import bpy
from mathutils import Vector

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
relatorio = []


def importar(path):
    ext = os.path.splitext(path)[1].lower()
    if ext == ".fbx":
        bpy.ops.import_scene.fbx(filepath=path)
    elif ext == ".obj":
        bpy.ops.wm.obj_import(filepath=path)
    elif ext in (".gltf", ".glb"):
        bpy.ops.import_scene.gltf(filepath=path)


def imagens_do_material(mat):
    out = []
    if mat and mat.node_tree:
        for n in mat.node_tree.nodes:
            if n.type == "TEX_IMAGE" and n.image:
                out.append(f"{n.image.name}:{n.image.size[0]}x{n.image.size[1]}")
    return out


def render(nome, sufixo, override=None):
    scn = bpy.context.scene
    scn.view_layers[0].material_override = override
    scn.render.filepath = os.path.join(OUT, f"{nome}_{sufixo}.png")
    bpy.ops.render.render(write_still=True)


wire = bpy.data.materials.new("wire") if False else None

for path in sys.argv[2:]:
    nome = os.path.splitext(os.path.basename(path))[0].replace(" ", "_")[:40]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    try:
        importar(path)
    except Exception as e:
        relatorio.append({"modelo": nome, "erro": str(e)[:200]})
        continue
    scn = bpy.context.scene
    malhas = [o for o in scn.objects if o.type == "MESH"]
    arms = [o for o in scn.objects if o.type == "ARMATURE"]
    info = {"modelo": nome, "arquivo": os.path.basename(path), "objetos_malha": len(malhas),
            "ossos": max((len(a.data.bones) for a in arms), default=0), "acoes": [a.name for a in bpy.data.actions][:6]}
    tot_v = tot_t = smooth = polys = 0
    det = []
    mats = set()
    for o in malhas:
        me = o.data
        t = sum(len(p.vertices) - 2 for p in me.polygons)
        tot_t += t
        tot_v += len(me.vertices)
        sm = sum(1 for p in me.polygons if p.use_smooth)
        smooth += sm
        polys += len(me.polygons)
        quads = sum(1 for p in me.polygons if len(p.vertices) == 4)
        sk = [k.name for k in me.shape_keys.key_blocks][:12] if me.shape_keys else []
        for m in me.materials:
            if m:
                mats.add((m.name, tuple(imagens_do_material(m))))
        det.append({"obj": o.name, "verts": len(me.vertices), "tris": t, "quads%": round(100 * quads / max(1, len(me.polygons))),
                    "suave%": round(100 * sm / max(1, len(me.polygons))), "uvs": len(me.uv_layers),
                    "cores_vertice": len(me.color_attributes), "shape_keys": sk,
                    "normais_custom": bool(getattr(me, "has_custom_normals", False)),
                    "materiais": [m.name for m in me.materials if m]})
    info.update({"verts": tot_v, "tris": tot_t, "suave%": round(100 * smooth / max(1, polys)), "malhas": det,
                 "materiais": [{"nome": n, "imagens": list(i)} for n, i in sorted(mats)]})
    # enquadramento
    pts = []
    dg = bpy.context.evaluated_depsgraph_get()
    for o in malhas:
        ev = o.evaluated_get(dg)
        pts += [ev.matrix_world @ Vector(c) for c in ev.bound_box]
    if not pts:
        relatorio.append(info)
        continue
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    cen, tam = (mn + mx) / 2, mx - mn
    info["altura"] = round(tam.z, 3)
    alt = max(tam.z, tam.x, tam.y)
    cam_d = bpy.data.cameras.new("cam")
    cam_d.type = "ORTHO"
    cam_d.ortho_scale = alt * 1.12
    cam = bpy.data.objects.new("cam", cam_d)
    scn.collection.objects.link(cam)
    ang = math.radians(-28)
    cam.location = cen + Vector((math.sin(ang) * alt * 3, -math.cos(ang) * alt * 3, alt * 0.15))
    cam.rotation_euler = (cen - cam.location).to_track_quat("-Z", "Y").to_euler()
    scn.camera = cam
    for loc, en in (((-1.5, -2, 2), 600), ((2, -1, 1), 250), ((0, 2, 2), 250)):
        ld = bpy.data.lights.new("l", "AREA")
        ld.energy = en * alt * alt
        ld.size = alt * 1.5
        lo = bpy.data.objects.new("l", ld)
        lo.location = cen + Vector(loc) * alt
        lo.rotation_euler = (cen - lo.location).to_track_quat("-Z", "Y").to_euler()
        scn.collection.objects.link(lo)
    w = bpy.data.worlds.new("w")
    scn.world = w
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.82, 0.82, 0.84, 1)
    w.node_tree.nodes["Background"].inputs[1].default_value = 0.6
    scn.render.engine = "CYCLES"
    scn.cycles.samples = 16
    scn.cycles.use_denoising = True
    scn.render.resolution_x, scn.render.resolution_y = 600, 760
    scn.view_settings.view_transform = "Standard"
    render(nome, "tex")
    # malha: arame preto sobre argila clara
    mw = bpy.data.materials.new("wire")
    mw.use_nodes = True
    nt = mw.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    wf = nt.nodes.new("ShaderNodeWireframe")
    wf.use_pixel_size = True
    wf.inputs[0].default_value = 0.6
    clay = nt.nodes.new("ShaderNodeBsdfDiffuse")
    clay.inputs[0].default_value = (0.85, 0.85, 0.85, 1)
    blk = nt.nodes.new("ShaderNodeEmission")
    blk.inputs[0].default_value = (0.05, 0.05, 0.08, 1)
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(wf.outputs[0], mix.inputs[0])
    nt.links.new(clay.outputs[0], mix.inputs[1])
    nt.links.new(blk.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs[0])
    render(nome, "malha", mw)
    relatorio.append(info)
    print("ok", nome, info["tris"], "tris", flush=True)

with open(os.path.join(OUT, "relatorio.json"), "w") as f:
    json.dump(relatorio, f, ensure_ascii=False, indent=1)
