import bpy, sys
a = sys.argv[sys.argv.index("--") + 1:]
bpy.ops.wm.open_mainfile(filepath=a[0])
arm = bpy.data.objects[a[1]]; pb = arm.pose.bones["Root"]; scn = bpy.context.scene
print("filhos do Root", [c.name for c in pb.children])
ruins = []
for act in bpy.data.actions:
    if not act.name.startswith("resident."): continue
    arm.animation_data.action = act
    if act.slots: arm.animation_data.action_slot = act.slots[0]
    f0, f1 = [int(x) for x in act.frame_range]
    d = 0
    for f in (f0, (f0 + f1) // 2, f1):
        scn.frame_set(f)
        m = pb.matrix_basis
        d = max(d, max(abs(m[i][j] - (1 if i == j else 0)) for i in range(4) for j in range(4)))
    if d > 1e-3: ruins.append((act.name, round(d, 3)))
print(len(ruins), ruins)
