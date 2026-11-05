"""GLB de um corpo para a página de teste: malhas, esqueleto e só as 10 animações originais do pacote."""
import bpy, os, sys
a = sys.argv[sys.argv.index("--") + 1:]
BLEND, SAIDA = a[0], a[1]
CORPOS = a[2:]
PACOTE = ["parado", "olhando", "andando", "correndo", "comemorando", "triste", "aplaudindo", "conversando", "telefone", "carregando"]
bpy.ops.wm.open_mainfile(filepath=BLEND)
for c in CORPOS:
    arm = bpy.data.objects[c]
    lugar = arm.parent; loc = lugar.location.copy(); lugar.location = (0, 0, lugar.location.z)
    ad = arm.animation_data or arm.animation_data_create(); ad.action = None
    for t in list(ad.nla_tracks): ad.nla_tracks.remove(t)
    for p in PACOTE:
        act = bpy.data.actions.get(f"{c}_{p}")
        if not act: continue
        t = ad.nla_tracks.new(); t.name = p
        st = t.strips.new(p, int(act.frame_range[0]), act)
        if act.slots: st.action_slot = act.slots[0]
        t.mute = True
    for pb in arm.pose.bones: pb.matrix_basis.identity()
    for o in bpy.context.selected_objects: o.select_set(False)
    arm.select_set(True)
    for o in bpy.data.objects:
        if o.parent is arm and o.type == "MESH": o.select_set(True)
    bpy.context.view_layer.objects.active = arm
    out = os.path.join(SAIDA, f"{c}.glb")
    bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", use_selection=True, export_animation_mode="NLA_TRACKS",
                              export_optimize_animation_size=True, export_image_format="NONE", export_frame_step=2)
    for t in list(ad.nla_tracks): ad.nla_tracks.remove(t)
    lugar.location = loc
    print("fim", c, os.path.getsize(out) // 1024, "KB", flush=True)
