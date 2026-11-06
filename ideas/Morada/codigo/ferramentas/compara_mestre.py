"""Compara dois arquivos-mestre de corpos: objetos por corpo (sem os de cabelo) e formas (shape keys)."""
import bpy, sys
a = sys.argv[sys.argv.index("--") + 1:]
res = []
for f in a[:2]:
    bpy.ops.wm.open_mainfile(filepath=f)
    d = {}
    for o in bpy.data.objects:
        if o.type == "MESH":
            sk = sorted(k.name for k in o.data.shape_keys.key_blocks) if o.data.shape_keys else []
            d[o.name] = (len(o.data.vertices), tuple(sk))
    res.append(d)
A, B = res
so_a = sorted(set(A) - set(B)); so_b = sorted(set(B) - set(A))
print("so no antigo:", so_a)
print("so no novo:", len(so_b), so_b[:80])
dif = [(n, A[n], B[n]) for n in set(A) & set(B) if A[n] != B[n]]
print("diferentes:", len(dif)); [print(" ", x) for x in sorted(dif)[:30]]
