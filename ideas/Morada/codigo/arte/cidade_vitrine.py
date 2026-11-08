"""Vitrine de uma categoria da cidade (mb.vitrine) sem as malhas de colisão.

As peças com Item.colisao_malha levam no GLB um nó filho com extras {"colisao": 1}. O jogo e a página não o mostram,
mas o importador de glTF do Blender traz esse nó visível e o tools/vitrine_cat.py o renderizaria por cima da rampa.
Aqui a importação do mb.vitrine esconde esses nós do render (o resto é o mesmo mb.vitrine).

Uso:
  blender-venv/bin/python -I morada-art/cidade_vitrine.py -- SP/morada-art SP/cidade_out/<categoria> saida.png
      [abertos] [noite] [ids=a,b,c] [colunas=N]
"""
import os
import sys

sys.path.insert(0, sys.argv[sys.argv.index("--") + 1])
import bpy  # noqa: E402

import moveis_base as mb  # noqa: E402


class _Importa:
    def __getattr__(self, nome):
        f = getattr(bpy.ops.import_scene, nome)
        if nome != "gltf":
            return f

        def gltf(*a, **k):
            r = f(*a, **k)
            for o in bpy.data.objects:
                if o.get("colisao"):
                    o.hide_render = True
            return r
        return gltf


class _Ops:
    import_scene = _Importa()

    def __getattr__(self, nome):
        return getattr(bpy.ops, nome)


class _Bpy:
    ops = _Ops()

    def __getattr__(self, nome):
        return getattr(bpy, nome)


mb.bpy = _Bpy()  # só o mb.vitrine usa bpy.ops.import_scene; o resto passa direto

a = sys.argv[sys.argv.index("--") + 2:]
op = dict(x.split("=", 1) for x in a[2:] if "=" in x)
ids = op["ids"].split(",") if "ids" in op else None
mb.vitrine(a[0], a[1], ids=ids, colunas=int(op["colunas"]) if "colunas" in op else None, abertos="abertos" in a[2:],
           noite="noite" in a[2:])
print("vitrine", os.path.basename(a[1]), flush=True)
