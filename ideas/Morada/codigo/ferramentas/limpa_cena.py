import bpy, sys
a = sys.argv[sys.argv.index("--") + 1:]
bpy.ops.wm.open_mainfile(filepath=a[0])
for o in bpy.data.objects:  # as poses estão congeladas nos ossos: nenhuma animação é usada
    if o.animation_data:
        o.animation_data.action = None
        for t in list(o.animation_data.nla_tracks):
            o.animation_data.nla_tracks.remove(t)
for act in list(bpy.data.actions):
    bpy.data.actions.remove(act)
for o in list(bpy.data.objects):  # malhas escondidas (rostos, cabelos e peças que não estão na foto)
    if o.type == "MESH" and o.hide_render:
        bpy.data.objects.remove(o, do_unlink=True)
bpy.data.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)
bpy.ops.wm.save_as_mainfile(filepath=a[1], compress=True)
print("ok", len(bpy.data.objects))
