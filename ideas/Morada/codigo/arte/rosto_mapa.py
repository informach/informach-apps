"""Mapa frontal do rosto: projeta raios de frente sobre a cabeça e lê a cor da textura em cada ponto.
Uso: python rosto_mapa.py <personagem.blend> <saida_dir>
Gera <saida>/rosto_frente.png (cor), rosto_mapa.npz (posição, uv, cor por pixel) e imprime a caixa da cabeça."""
import sys
import numpy as np
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

BLEND, OUT = sys.argv[1:3]
bpy.ops.wm.open_mainfile(filepath=BLEND)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
ob = next(o for o in bpy.data.objects if o.type == "MESH")
arm.data.pose_position = "REST"
bpy.context.view_layer.update()
me = ob.data
me.calc_loop_triangles()
mw = ob.matrix_world
vs = [mw @ v.co for v in me.vertices]
tris = [tuple(t.vertices) for t in me.loop_triangles]
uvd = me.uv_layers.active.data
tuv = [[uvd[l].uv.copy() for l in t.loops] for t in me.loop_triangles]
bvh = BVHTree.FromPolygons(vs, tris)
img = next(i for i in bpy.data.images if i.size[0] > 0)
W, H = img.size
px = np.array(img.pixels[:], dtype=np.float32).reshape(H, W, 4)  # linha 0 = baixo
cab = arm.matrix_world @ arm.data.bones["mixamorig:Head"].head_local
topo = arm.matrix_world @ arm.data.bones["mixamorig:HeadTop_End"].head_local
print("cabeca", tuple(round(x, 4) for x in cab), "topo", tuple(round(x, 4) for x in topo))
res = 0.0005
x0, x1 = -0.13, 0.13
z0, z1 = cab.z - 0.06, topo.z + 0.02
nx, nz = int((x1 - x0) / res), int((z1 - z0) / res)
cor = np.zeros((nz, nx, 3), np.float32)
pos = np.full((nz, nx, 3), np.nan, np.float32)
uvs = np.full((nz, nx, 2), np.nan, np.float32)
for j in range(nz):
    z = z1 - j * res
    for i in range(nx):
        x = x0 + i * res
        loc, nor, idx, d = bvh.ray_cast(Vector((x, -1.0, z)), Vector((0, 1, 0)))
        if loc is None:
            continue
        a, b, c = (vs[k] for k in tris[idx])
        from mathutils.geometry import barycentric_transform
        u0, u1, u2 = (Vector((q.x, q.y, 0)) for q in tuv[idx])
        r = barycentric_transform(loc, a, b, c, u0, u1, u2)
        tx = min(W - 1, max(0, int(r.x * W)))
        ty = min(H - 1, max(0, int(r.y * H)))
        cor[j, i] = px[ty, tx, :3]
        pos[j, i] = loc
        uvs[j, i] = (r.x, r.y)
np.savez_compressed(f"{OUT}/rosto_mapa.npz", cor=cor, pos=pos, uvs=uvs, x0=x0, z1=z1, res=res)
from PIL import Image
srgb = np.where(cor <= 0.0031308, cor * 12.92, 1.055 * np.power(np.clip(cor, 0, 1), 1 / 2.4) - 0.055)
Image.fromarray((np.clip(srgb, 0, 1) * 255).astype(np.uint8)).save(f"{OUT}/rosto_frente.png")
print("grade", nx, nz, "z0", z0, "z1", z1)
