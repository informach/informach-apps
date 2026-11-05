import bpy, bmesh, os
from mathutils import Vector
I="ideias"
F={"m":"Chess_Pack/Chess_Pack_Free_fbx/Chess_Pack_Free_fbx/Characters/Chess_Player_01.fbx","f":"Casino/Casino_Free_fbx/Casino_Free_fbx/Casino_Free_Characters_fbx/1_Cashier.fbx","p":"Casino/Casino_Free_fbx/Casino_Free_fbx/Casino_Free_Characters_fbx/75.fbx","s":"Christmas_Pack/Christmas_Pack_Free_fbx/Separate_assets_fbx/Santa.fbx"}
ref={}
for k,f in F.items():
    bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.fbx(filepath=os.path.join(I,f))
    arm=next(o for o in bpy.data.objects if o.type=="ARMATURE")
    print("==",k,"arm scale",tuple(round(x,3) for x in arm.scale),"rot",tuple(round(x,2) for x in arm.rotation_euler))
    for b in ("Hips","Spine1","Head","LeftArm","LeftHand","LeftUpLeg","LeftFoot"):
        h=arm.matrix_world@arm.data.bones[b].head_local; print("  ",b,tuple(round(x,3) for x in h))
    for o in bpy.data.objects:
        if o.type!="MESH" or not any(t in o.name for t in ("Face","Hair")): continue
        bm=bmesh.new(); bm.from_mesh(o.data); vis=set(); il=[]
        for v in bm.verts:
            if v in vis: continue
            st=[v]; c=[]
            while st:
                x=st.pop()
                if x in vis: continue
                vis.add(x); c.append(x); st+= [e.other_vert(x) for e in x.link_edges]
            il.append(c)
        info=[]
        for c in il:
            m=sum(((o.matrix_world@v.co) for v in c),Vector())/len(c)
            info.append((round(m.z,3),round(m.x,3),len(c)))
        print("  ",o.name,"ilhas",sorted(info))
