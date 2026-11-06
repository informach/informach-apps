import bpy, os
import numpy as np
from PIL import Image
I="ideias"
a=np.array(Image.open(os.path.join(I,"Casino/textures/textures/Textures_4.png")).convert("RGB"))
for f in ["Chess_Pack/Chess_Pack_Free_fbx/Chess_Pack_Free_fbx/Characters/Chess_Player_01.fbx","Casino/Casino_Free_fbx/Casino_Free_fbx/Casino_Free_Characters_fbx/1_Cashier.fbx","Casino/Casino_Free_fbx/Casino_Free_fbx/Casino_Free_Characters_fbx/75.fbx","Christmas_Pack/Christmas_Pack_Free_fbx/Separate_assets_fbx/Santa.fbx"]:
    bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.fbx(filepath=os.path.join(I,f))
    for o in bpy.data.objects:
        if o.type=="MESH" and "Hair" in o.name:
            us=np.array([d.uv[:] for d in o.data.uv_layers.active.data])
            px=(us[:,0]*1024).astype(int).clip(0,1023); py=((1-us[:,1])*1024).astype(int).clip(0,1023)
            print(o.name,"u",us[:,0].min().round(3),us[:,0].max().round(3),"v",us[:,1].min().round(3),us[:,1].max().round(3),"cor",a[py,px].mean(0).round())
