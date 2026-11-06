import bpy, os, sys
import numpy as np
from PIL import Image
I = "ideias"
C = [("Chess_Pack/Chess_Pack_Free_fbx/Chess_Pack_Free_fbx/Characters/Chess_Player_01.fbx", "Chess_Pack/textures/textures/Textures1.png"),
 ("Casino/Casino_Free_fbx/Casino_Free_fbx/Casino_Free_Characters_fbx/1_Cashier.fbx", "Casino/textures/textures/Textures_4.png"),
 ("Casino/Casino_Free_fbx/Casino_Free_fbx/Casino_Free_Characters_fbx/75.fbx", "Casino/textures/textures/Textures_4.png"),
 ("Creative_Characters/Creative_Characters_Free_fbx/Creative_Character_free.fbx", "Creative_Characters/textures/textures/Textures_4.png"),
 ("Apocalypse/Apocalypse_Free_fbx/Apocalypse_Free_fbx/Characters/Adult_Survivor.fbx", "Apocalypse/textures/textures/Color2.png")]
for f, pal in C:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=os.path.join(I, f))
    im = np.array(Image.open(os.path.join(I, pal)).convert("RGB"))
    H, W = im.shape[:2]
    for o in bpy.data.objects:
        if o.type != "MESH" or not any(t in o.name for t in ("Body", "ChessPlayer_01", "Face", "emotion")): continue
        if "Face" not in o.name and "emotion" not in o.name and "Body" not in o.name and o.name != "ChessPlayer_01": continue
        uv = o.data.uv_layers.active.data
        us = np.array([d.uv[:] for d in uv])
        px = np.clip((us[:, 0] * W).astype(int), 0, W - 1); py = np.clip(((1 - us[:, 1]) * H).astype(int), 0, H - 1)
        cols = im[py, px]
        uniq, cnt = np.unique(np.stack([px // 16, py // 16], 1), axis=0, return_counts=True)
        top = sorted(zip(cnt, map(tuple, uniq)), reverse=True)[:5]
        print(os.path.basename(f), o.name, [m.name for m in o.data.materials], "uv x", us[:,0].min().round(3), us[:,0].max().round(3), "y", us[:,1].min().round(3), us[:,1].max().round(3), "células16", top, "cor média", cols.mean(0).round())
