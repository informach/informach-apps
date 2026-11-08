import sys, os
a = sys.argv[sys.argv.index("--") + 1:]
sys.path.insert(0, a[0])
import bpy
import moveis_base as mb
pasta, arq, modo = a[1], a[2], a[3]
ids = a[4:] or None
cols = None
if ids and ids[0].startswith("cols="):
    cols = int(ids[0][5:]); ids = ids[1:] or None
import inspect
src = inspect.getsource(mb.vitrine)
src = src.replace('''                    o.location += V((dd[0], -dd[2], dd[1])) * o["curso"] * 0.6
''', '''                    o.location += V((dd[0], -dd[2], dd[1])) * o["curso"] * 0.6
                elif o.get("interativo") == "correr":
                    dd = V(o["direcao"])
                    o.location += V((dd[0], -dd[2], dd[1])) * o["curso"] * 0.6
''')
assert "correr" in src
ns = dict(mb.__dict__)
exec(src, ns)
res = tuple(int(v) for v in os.environ.get("RES", "1800x1000").split("x"))
ns["vitrine"](pasta, arq, ids=ids, abertos=(modo == "abertos"), colunas=cols, res=res)
