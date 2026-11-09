import bpy, sys, math, json
a = sys.argv[sys.argv.index("--") + 1:]
BLEND, CORPO = a[:2]
ids = {x["id"] for x in json.load(open("biblioteca_indice.json"))["indice"] if x["prioridade"] == a[2]} if len(a) > 2 else None
bpy.ops.wm.open_mainfile(filepath=BLEND)
scn = bpy.context.scene; arm = bpy.data.objects[CORPO]; mw = arm.matrix_world
for act in sorted(bpy.data.actions, key=lambda x: x.name):
    n = act.name
    if ids is not None and n.removesuffix(".rm") not in ids: continue
    arm.animation_data.action = act
    if act.slots: arm.animation_data.action_slot = act.slots[0]
    f0, f1 = [int(x) for x in act.frame_range]
    out = []
    for f in (f0, f1):
        scn.frame_set(f)
        L = mw @ arm.pose.bones["LeftShoulder"].head; R = mw @ arm.pose.bones["RightShoulder"].head; h = mw @ arm.pose.bones["Hips"].head
        d = L - R  # esquerda do personagem; de frente para -y a esquerda é +x
        ang = math.degrees(math.atan2(d.y, d.x))  # 0 = de frente para -y
        out.append(f"({h.x:+.2f},{h.y:+.2f},{h.z:.2f}) {ang:+4.0f}°")
    print(f"{n:34s} {out[0]}  ->  {out[1]}")
