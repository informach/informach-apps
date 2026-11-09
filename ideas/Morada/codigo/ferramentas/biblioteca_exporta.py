"""Exporta a biblioteca de um corpo-fonte: GLB só com o esqueleto e uma animação por ID (trilha NLA)."""
import bpy, os, sys
a = sys.argv[sys.argv.index("--") + 1:]
BLEND, CORPO, SAIDA = a[:3]
FPS_SAIDA = int(os.environ.get("FPS", "30"))
bpy.ops.wm.open_mainfile(filepath=BLEND)
# animações aprovadas: o GLB leva sempre a cópia congelada (congeladas.py), mesmo que a biblioteca de trabalho tenha mudado
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import congeladas  # noqa: E402
congeladas.repoe_em_memoria(os.path.basename(SAIDA)[:-4])
arm = bpy.data.objects[CORPO]
for o in list(bpy.data.objects):
    if o is not arm and o is not arm.parent:
        bpy.data.objects.remove(o, do_unlink=True)
ad = arm.animation_data
ad.action = None
for t in list(ad.nla_tracks):
    ad.nla_tracks.remove(t)
for act in sorted([x for x in bpy.data.actions if x.name.startswith("resident.")], key=lambda x: x.name):
    t = ad.nla_tracks.new(); t.name = act.name
    st = t.strips.new(act.name, int(act.frame_range[0]), act)
    if act.slots: st.action_slot = act.slots[0]
    t.mute = True
for o in bpy.context.selected_objects: o.select_set(False)
arm.select_set(True); bpy.context.view_layer.objects.active = arm
bpy.ops.export_scene.gltf(filepath=SAIDA, export_format="GLB", use_selection=True, export_animation_mode="NLA_TRACKS",
                          export_anim_single_armature=True, export_optimize_animation_size=True, export_force_sampling=True,
                          export_frame_step=max(1, round(30 / FPS_SAIDA)), export_def_bones=False, export_skins=False,
                          export_morph=False, export_materials="NONE")
print("fim", CORPO, os.path.getsize(SAIDA) // 1024, "KB")
