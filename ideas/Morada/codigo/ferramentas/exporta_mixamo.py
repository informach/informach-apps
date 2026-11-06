"""FBX para testar no Mixamo: (1) com o esqueleto do pacote, (2) só a malha (para o auto-rigger). Repouso, sem animação."""
import bpy, os, sys
bpy.ops.wm.open_mainfile(filepath=os.path.abspath(sys.argv[sys.argv.index("--") + 1]))
OUT = os.path.abspath(sys.argv[sys.argv.index("--") + 2]); os.makedirs(OUT, exist_ok=True)
CORPOS = sys.argv[sys.argv.index("--") + 3:]
# textura direto no Base Color (o FBX não leva o nó que multiplica o tom de pele)
for m in bpy.data.materials:
    if not m.node_tree: continue
    t = next((n for n in m.node_tree.nodes if n.type == "TEX_IMAGE"), None); b = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if t and b: m.node_tree.links.new(t.outputs["Color"], b.inputs["Base Color"])
for o in bpy.data.objects:
    if o.type == "ARMATURE":
        if o.animation_data: o.animation_data.action = None; [o.animation_data.nla_tracks.remove(t) for t in list(o.animation_data.nla_tracks)]
        for pb in o.pose.bones: pb.matrix_basis.identity()
bpy.context.view_layer.update()
def sel(objs):
    for o in bpy.context.selected_objects: o.select_set(False)
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
for nome in CORPOS:
    arm = bpy.data.objects[nome]
    pecas = [bpy.data.objects[f"{nome}_{p}"] for p in ("corpo", "rosto_neutro", "cabelo") if f"{nome}_{p}" in bpy.data.objects]
    lugar = arm.parent; loc = lugar.location.copy(); lugar.location.x = 0; lugar.location.y = 0
    bpy.context.view_layer.update()
    sel([arm] + pecas)
    kw = dict(use_selection=True, add_leaf_bones=False, bake_anim=False, path_mode="COPY", embed_textures=True,
              apply_scale_options="FBX_SCALE_ALL", object_types={"ARMATURE", "MESH"})
    bpy.ops.export_scene.fbx(filepath=os.path.join(OUT, f"{nome}_com_esqueleto.fbx"), **kw)
    # só a malha: cópias com a deformação de repouso aplicada, juntas num objeto só, sem esqueleto
    copias = []
    for p in pecas:
        c = p.copy(); c.data = p.data.copy(); bpy.context.scene.collection.objects.link(c)
        mw = p.matrix_world.copy(); c.parent = None; c.matrix_world = mw
        for m in list(c.modifiers): c.modifiers.remove(m)
        c.vertex_groups.clear(); copias.append(c)
    sel(copias); bpy.ops.object.join(); malha = bpy.context.active_object; malha.name = f"{nome}_malha"
    sel([malha]); bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    kw["object_types"] = {"MESH"}
    bpy.ops.export_scene.fbx(filepath=os.path.join(OUT, f"{nome}_so_malha.fbx"), **kw)
    bpy.data.objects.remove(malha, do_unlink=True)
    lugar.location = loc
print("ok")
