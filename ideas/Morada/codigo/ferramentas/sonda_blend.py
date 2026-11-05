import bpy, sys
bpy.ops.wm.open_mainfile(filepath=sys.argv[sys.argv.index("--") + 1])
for n in ("adulto", "plus_m", "bebe_m"):
    a = bpy.data.objects[n]
    print(n, "pai", a.parent and a.parent.name, a.parent and tuple(round(x, 2) for x in a.parent.location), "rot", tuple(round(x, 2) for x in a.rotation_euler), "esc", tuple(round(x, 3) for x in a.scale), "rotpai", a.parent and tuple(round(x,2) for x in a.parent.rotation_euler))
    print("  filhos", [o.name for o in bpy.data.objects if o.parent is a][:12])
    print("  nla", [t.name for t in a.animation_data.nla_tracks][:6] if a.animation_data else None, len(a.animation_data.nla_tracks) if a.animation_data else 0)
print("acoes", len(bpy.data.actions))
