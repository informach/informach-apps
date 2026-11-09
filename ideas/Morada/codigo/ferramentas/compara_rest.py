import bpy, sys, math
a, b = sys.argv[sys.argv.index("--") + 1:][:2]
def rest(f):
    bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.fbx(filepath=f)
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    return {bn.name: (arm.matrix_world @ bn.matrix_local) for bn in arm.data.bones}, arm.matrix_world.copy()
ra, ma = rest(a); rb, mb = rest(b)
print("mundo", [round(x, 3) for x in ma.to_euler()], [round(x, 3) for x in mb.to_euler()], round(ma.to_scale()[0], 4), round(mb.to_scale()[0], 4))
for n in ["Hips", "Spine", "LeftArm", "LeftForeArm", "LeftHand", "RightArm", "RightUpLeg", "Head"]:
    qa, qb = ra[n].to_quaternion(), rb[n].to_quaternion()
    ang = math.degrees(qa.rotation_difference(qb).angle)
    print(n, "rot dif %.1f°" % ang, "pos", [round(x, 3) for x in ra[n].translation], [round(x, 3) for x in rb[n].translation])
