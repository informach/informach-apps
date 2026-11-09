"""Mede as peças dos catálogos da cidade (caixa envolvente local em coordenadas do Blender, sem os objetos de colisão)
para o gerador de cenas (cidade_cenas.py). Grava um cache JSON; só mede o que mudou (pela data do GLB).

Uso: MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/cidade_cenas_medidas.py -- SP/cidade_out SP/pets <cache.json>
"""
import glob
import json
import os
import sys

import bpy
from mathutils import Vector


def mede(caminho):
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=caminho)
    novos = [o for o in bpy.data.objects if o not in antes]
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    nver = 0
    for o in novos:
        if o.type != "MESH" or o.get("colisao") or "colisao" in o.name.lower():
            continue
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
        nver += len(o.data.vertices)
    for o in novos:
        bpy.data.objects.remove(o, do_unlink=True)
    if lo.x > hi.x:
        return None
    return {"min": [round(v, 3) for v in lo], "max": [round(v, 3) for v in hi], "nv": nver,
            "t": os.path.getmtime(caminho)}


def main():
    a = sys.argv[sys.argv.index("--") + 1:]
    saida, pets, cache_f = a
    cache = json.load(open(cache_f)) if os.path.exists(cache_f) else {}
    alvos = []
    for f in sorted(glob.glob(os.path.join(saida, "*", "catalogo.json"))):
        cat = json.load(open(f))
        for it in cat["itens"]:
            alvos.append((cat["categoria"] + "/" + it["id"], os.path.join(os.path.dirname(f), it["arquivo"])))
    for g in ("zoologico", "urbano", "estimacao"):
        for p in sorted(glob.glob(os.path.join(pets, g, "glb", "*.glb"))):
            alvos.append(("bichos/" + os.path.basename(p)[:-4], p))
    n = 0
    for chave, p in alvos:
        if not os.path.exists(p):
            continue
        if chave in cache and cache[chave].get("t") == os.path.getmtime(p):
            continue
        if n % 25 == 0:
            bpy.ops.wm.read_factory_settings(use_empty=True)
            for b in list(bpy.data.meshes) + list(bpy.data.materials) + list(bpy.data.images):
                pass
        try:
            cache[chave] = mede(p)
        except Exception as e:  # noqa: BLE001
            print("falhou", chave, e, flush=True)
        n += 1
        if n % 50 == 0:
            json.dump(cache, open(cache_f, "w"))
            print("medidas", n, flush=True)
    json.dump(cache, open(cache_f, "w"))
    print("fim medidas", n, len(cache), flush=True)


main()
