"""Tira as ações duplicadas "nome.001" (a mais nova fica com o nome certo) no .blend e no .json ao lado."""
import bpy, sys, json, os
f = sys.argv[sys.argv.index("--") + 1]
bpy.ops.wm.open_mainfile(filepath=f)
feitos = []
for a in list(bpy.data.actions):
    n = a.name
    if n[-4:-3] == "." and n[-3:].isdigit():
        base = n[:-4]
        if base in bpy.data.actions:
            bpy.data.actions.remove(bpy.data.actions[base])
        a.name = base
        a.use_fake_user = True
        feitos.append(base)
bpy.ops.wm.save_mainfile(compress=True)
j = f[:-6] + ".json"
if os.path.exists(j):
    d = json.load(open(j))
    for campo in ("correcoes", "apoios"):
        for k in [k for k in d.get(campo, {}) if k[-4:-3] == "." and k[-3:].isdigit()]:
            d[campo][k[:-4]] = d[campo].pop(k)
    json.dump(d, open(j, "w"), ensure_ascii=False, indent=1)
print("limpo", os.path.basename(f), feitos)
