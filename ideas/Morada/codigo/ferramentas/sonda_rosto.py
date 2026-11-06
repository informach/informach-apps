import bpy, bmesh, os
import numpy as np
from PIL import Image
from mathutils.bvhtree import BVHTree
from mathutils import Vector
I="ideias"; A=np.array(Image.open(os.path.join(I,"Casino/textures/textures/Textures_4.png")).convert("RGB"))
for f,corpo,rosto in [("Chess_Pack/Chess_Pack_Free_fbx/Chess_Pack_Free_fbx/Characters/Chess_Player_01.fbx","ChessPlayer_01","ChessPlayer_Face_Usual_01"),("Casino/Casino_Free_fbx/Casino_Free_fbx/Casino_Free_Characters_fbx/1_Cashier.fbx","Adult_Female_Cashier_Body","Adult_Female_Cashier_Face_Usual")]:
    bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.fbx(filepath=os.path.join(I,f))
    c=bpy.data.objects[corpo]; r=bpy.data.objects[rosto]
    P=[c.matrix_world@v.co for v in c.data.vertices]
    bvh=BVHTree.FromPolygons([tuple(p) for p in P],[tuple(p.vertices) for p in c.data.polygons])
    print("==",rosto,"grupos",[g.name for g in r.vertex_groups], "mats",[m.name for m in r.data.materials])
    bm=bmesh.new(); bm.from_mesh(r.data); bm.verts.ensure_lookup_table()
    uvl=bm.loops.layers.uv.active
    vis=set()
    for v in bm.verts:
        if v.index in vis: continue
        st=[v]; il=[]
        while st:
            x=st.pop()
            if x.index in vis: continue
            vis.add(x.index); il.append(x); st+=[e.other_vert(x) for e in x.link_edges]
        W=np.array([r.matrix_world@x.co for x in il]); cen=W.mean(0)
        # distância até a pele (raio de frente)
        ds=[]
        for p in W:
            h=bvh.ray_cast(Vector((p[0],p[1]-0.2,p[2])),Vector((0,1,0)),0.4)
            if h[0]: ds.append(h[0].y-p[1])
        fs={f for x in il for f in x.link_faces}
        uvs=np.array([l[uvl].uv[:] for f in fs for l in f.loops])
        cor=A[((1-uvs[:,1])*1024).astype(int).clip(0,1023),(uvs[:,0]*1024).astype(int).clip(0,1023)].mean(0).round()
        print(f"  ilha n={len(il)} faces={len(fs)} centro={cen.round(3)} tam x={np.ptp(W[:,0]):.3f} z={np.ptp(W[:,2]):.3f} y={np.ptp(W[:,1]):.4f} acima_pele min/max={min(ds):.4f}/{max(ds):.4f} uv={uvs.mean(0).round(3)} cor={cor}")
