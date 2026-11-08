"""Amostra a cor de cada face dos móveis do pacote gratuito (UV no atlas Textures_4) e agrupa as cores mais usadas."""
import sys, os, bpy, json, glob
a = sys.argv[sys.argv.index("--")+1:]
D, TEX, OUT = a
img = bpy.data.images.load(TEX); W, H = img.size; px = list(img.pixels)
def amostra(u, v):
    x = min(W-1, max(0, int(u % 1 * W))); y = min(H-1, max(0, int(v % 1 * H)))
    o = (y*W + x)*4; return px[o:o+3]
res = {}
for f in sorted(glob.glob(os.path.join(D, "*.fbx"))):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=f)
    cores = {}
    for o in bpy.context.scene.objects:
        if o.type != "MESH": continue
        me = o.data; uv = me.uv_layers.active.data
        for p in me.polygons:
            us = [uv[i].uv for i in p.loop_indices]
            u = sum(q[0] for q in us)/len(us); v = sum(q[1] for q in us)/len(us)
            c = amostra(u, v)
            h = "#%02X%02X%02X" % tuple(int(round((max(0,x) ** (1/2.2) if False else x)*255)) for x in c)
            cores[h] = cores.get(h, 0) + p.area
    res[os.path.basename(f)[:-4]] = sorted(cores.items(), key=lambda t: -t[1])[:8]
json.dump(res, open(OUT, "w"), indent=0)
