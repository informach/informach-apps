"""Close de uma região (tronco, maos, cabeca) com conjuntos do catálogo, para revisão.
Uso: python render_detalhe.py -- <blend> <saida> <corpo> <regiao> <conj1;conj2;...> [gravidez] [tam]"""
import bpy, sys, math, os
from mathutils import Vector
a = sys.argv[sys.argv.index("--") + 1:]
BLEND, OUT, C, REG, CONJ = a[0], a[1], a[2], a[3], [c.split(",") for c in a[4].split(";")]
GRAV = a[5] if len(a) > 5 and a[5] else None
TAM = int(a[6]) if len(a) > 6 else 360
os.makedirs(OUT, exist_ok=True)
sys.argv = [sys.argv[0], "--", BLEND, OUT, C, a[4]] + ([GRAV] if GRAV else [])
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "render_roupas.py")).read()
src = src[:src.index("for c in CORPOS:")]  # cena, luz, câmera e cores (sem o laço de render)
exec(src)
scn.render.resolution_x = scn.render.resolution_y = TAM
arm = bpy.data.objects[C]
for pb in arm.pose.bones: pb.matrix_basis.identity()
corpo = bpy.data.objects[C + "_corpo"]
filhos = [o for o in bpy.data.objects if o.type == "MESH" and o.parent is arm]
if GRAV:
    for o in filhos:
        if o.data.shape_keys:
            for kb in o.data.shape_keys.key_blocks[1:]: kb.value = 1.0 if kb.name == "gravidez_" + GRAV else 0.0
bpy.context.view_layer.update()
P = [corpo.matrix_world @ v.co for v in corpo.data.vertices]
zt = max(p.z for p in P)
xm, ym = sum(p.x for p in P) / len(P), sum(p.y for p in P) / len(P)
osso = lambda n: arm.matrix_world @ arm.pose.bones[n].head
if REG == "tronco":
    alvo, esc, vistas = Vector((xm, ym, zt * 0.66)), zt * 0.5, (("f", 0), ("l", 50), ("t", 180))
elif REG == "maos":
    alvo, esc, vistas = (osso("RightHand") + osso("LeftHand")) / 2, zt * 0.62, (("f", 0), ("l", 35))
    alvo.z -= zt * 0.08
elif REG == "mao":
    alvo, esc, vistas = osso("RightHandMiddle1"), zt * 0.22, (("f", 0), ("l", 60), ("d", -60))
elif REG == "mao_esq":
    alvo, esc, vistas = osso("LeftHandMiddle1"), zt * 0.22, (("f", 0), ("l", 60), ("d", -60))
elif REG == "barriga":
    alvo, esc, vistas = Vector((xm, ym, zt * 0.55)), zt * 0.36, (("f", 0), ("s", 90), ("l", 45))
else:
    h = osso("Head")
    alvo, esc, vistas = Vector((h.x, h.y, (h.z + zt) / 2 + 0.03)), (zt - h.z) * 2.8, (("f", 0), ("l", 55), ("t", 160))
cd.ortho_scale = esc
for k, ids in enumerate(CONJ):
    quer = {C + "_" + i for i in ids} | {C + "_corpo", C + "_rosto_neutro", C + "_cabelo"}
    for o in bpy.data.objects:
        if o.type == "MESH": o.hide_render = o.name not in quer
    for v, az in vistas:
        d = Vector((math.sin(math.radians(az)), -math.cos(math.radians(az)), 0.12)).normalized()
        cam.location = alvo + d * 6; cam.rotation_euler = (alvo - cam.location).to_track_quat("-Z", "Y").to_euler()
        L.rotation_euler = cam.rotation_euler
        scn.render.filepath = os.path.join(OUT, f"{C}_{REG}_{k}_{v}.png"); bpy.ops.render.render(write_still=True)
