import bpy, os
for f in ["Apocalypse/Apocalypse_Free_fbx/Apocalypse_Free_fbx/Characters/Adult_Survivor.fbx","Casino/Casino_Free_fbx/Casino_Free_fbx/Casino_Free_Characters_fbx/1_Cashier.fbx","Chess_Pack/Chess_Pack_Free_fbx/Chess_Pack_Free_fbx/Characters/Chess_Player_01.fbx"]:
    bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.fbx(filepath=os.path.join("ideias",f))
    a=next(o for o in bpy.data.objects if o.type=="ARMATURE")
    b=a.data.bones["Hips"]; print(os.path.basename(f), tuple(round(x,2) for x in a.rotation_euler), [tuple(round(x,2) for x in r) for r in b.matrix_local.to_3x3()], [x.name.split("|")[-1] for x in bpy.data.actions if "Phone" in x.name or "Carry" in x.name or "Wave" in x.name])
