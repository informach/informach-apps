import bpy, sys
sys.argv = [sys.argv[0], "--", "biblioteca/corrigido_todos/adulto.blend", "adulto", "/dev/null", "nada"]
src = open("tools/compor.py").read().split("# ---------------------------------------------------------------- roda as receitas")[0]
exec(compile(src, "compor", "exec"))
pose((quadro(PARADO, 0), None))
print("Hips", tuple(round(x, 3) for x in W("Hips")), "ombros", tuple(round(x, 3) for x in W("LeftArm")), tuple(round(x, 3) for x in W("RightArm")))
frente, esq, q = _bancada(0, 0, 8)
print("frente", frente, "esq", esq, "K", K)
alvo = q + frente * 0.36 * K + esq * 0.19 * K + UP * 0.12 * K
mao("Left", alvo, W("LeftArm") + esq * 0.4 * K - UP * 0.3 * K)
print("alvo", tuple(round(x, 3) for x in alvo), "mão", tuple(round(x, 3) for x in W("LeftHand")))
print("comprimentos", (W("LeftForeArm") - W("LeftArm")).length, (W("LeftHand") - W("LeftForeArm")).length)
