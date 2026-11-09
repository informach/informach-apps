"""Junta as ações do P2 (corrigido_p2) à biblioteca já corrigida do P0 e P1 (corrigido).

Também normaliza a raiz das animações que o Mixamo entrega viradas ou deslocadas (a escada vem de costas e 0,95 m
para o lado): gira o quadril em torno do eixo vertical e leva a posição inicial para perto da origem, de frente
para -y como todas as outras.
"""
import bpy, json, math, os, sys
from mathutils import Matrix, Vector

VIRAR = {"resident.climb.ladder": 180.0, "resident.climb.ladder.rm": 180.0}  # graus em torno de z
a = sys.argv[sys.argv.index("--") + 1:]
BASE, EXTRA, CORPO, SAIDA = a[:4]
bpy.ops.wm.open_mainfile(filepath=BASE)
novas = set()
if os.path.exists(EXTRA):
    with bpy.data.libraries.load(EXTRA, link=False) as (src, _):
        vindo = [n for n in src.actions if n.startswith("resident.")]
    for n in vindo:  # rodar de novo substitui (não duplica) as ações que já estavam na base
        if n in bpy.data.actions:
            bpy.data.actions.remove(bpy.data.actions[n])
    with bpy.data.libraries.load(EXTRA, link=False) as (src, dst):
        dst.actions = [n for n in src.actions if n.startswith("resident.")]
    for act in dst.actions:
        act.use_fake_user = True
        novas.add(act.name)
arm = bpy.data.objects[CORPO]
scn = bpy.context.scene
for nome, graus in VIRAR.items():
    act = bpy.data.actions.get(nome)
    if not act or nome not in novas:  # só o que acabou de chegar (o que já está na base já foi virado)
        continue
    arm.animation_data.action = act
    if act.slots:
        arm.animation_data.action_slot = act.slots[0]
    pr, ph = arm.pose.bones["Root"], arm.pose.bones["Hips"]  # o Root leva a rotação de raiz; o quadril, a posição
    Rr, Rh = pr.bone.matrix_local, ph.bone.matrix_local
    rel_inv = (Rr.inverted() @ Rh).inverted()
    f0, f1 = (int(x) for x in act.frame_range)
    poses = []
    for f in range(f0, f1 + 1):
        scn.frame_set(f)
        poses.append((pr.matrix.copy(), ph.matrix.copy()))  # espaço do esqueleto
    mw = arm.matrix_world  # o espaço do esqueleto tem y para cima; a conta é feita no mundo (z para cima)
    rot = Matrix.Rotation(math.radians(graus), 4, "Z")
    h0 = rot @ (mw @ poses[0][1].translation)
    rot_a = mw.inverted() @ rot @ mw
    A = mw.inverted() @ Matrix.Translation(Vector((-h0.x, -0.03 - h0.y, 0.0))) @ rot @ mw
    fc = lambda o, c, j: act.fcurve_ensure_for_datablock(arm, f'pose.bones["{o}"].{c}', index=j)  # noqa: E731
    prev = {}
    for i, (Mr, Mh) in enumerate(poses):
        Mr2 = rot_a @ Mr
        bases = {"Root": Rr.inverted() @ Mr2, "Hips": rel_inv @ Mr2.inverted() @ A @ Mh}
        for osso, B in bases.items():
            loc, q, _ = B.decompose()
            if osso in prev and prev[osso].dot(q) < 0:
                q = -q
            prev[osso] = q
            canais = [("rotation_quaternion", q)] + ([("location", loc)] if osso == "Hips" else [])
            for caminho, vals in canais:
                for j, v in enumerate(vals):
                    k = fc(osso, caminho, j).keyframe_points[i]
                    k.co = (k.co[0], v)
    for o in ("Root", "Hips"):
        for c, d in (("rotation_quaternion", 4), ("location", 3)):
            for j in range(d):
                if o == "Hips" or c == "rotation_quaternion":
                    fc(o, c, j).update()
    print("virada", CORPO, nome, graus)
arm.animation_data.action = None
for pb in arm.pose.bones:
    pb.matrix_basis.identity()
os.makedirs(os.path.dirname(SAIDA), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=SAIDA, compress=True)
j1 = json.load(open(BASE[:-6] + ".json"))
if os.path.exists(EXTRA[:-6] + ".json"):
    j2 = json.load(open(EXTRA[:-6] + ".json"))
    j1["correcoes"].update(j2["correcoes"]); j1["apoios"].update(j2["apoios"])
json.dump(j1, open(SAIDA[:-6] + ".json", "w"), ensure_ascii=False, indent=1)
print("fim", CORPO, len([x for x in bpy.data.actions if x.name.startswith("resident.")]))
