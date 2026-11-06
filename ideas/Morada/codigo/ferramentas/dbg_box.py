import bpy, sys
sys.argv = [sys.argv[0], "--", "biblioteca/corrigido_todos/adulto.blend", "adulto", "/dev/null", "nada"]
src = open("tools/compor.py").read().split("# ---------------------------------------------------------------- roda as receitas")[0]
exec(compile(src, "compor", "exec"))
for i in (0, 30):
    pose((quadro("resident.carry.box.idle", i), None))
    f = lambda v: tuple(round(x, 2) for x in v)
    print(i, "ombros", f(W("LeftArm")), f(W("RightArm")), "mãos", f(W("LeftHand")), f(W("RightHand")), "cot", f(W("LeftForeArm")), f(W("RightForeArm")))
