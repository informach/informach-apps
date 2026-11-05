"""Converte os FBX do Mixamo para o nosso esqueleto (repouso em A) e grava uma ação por ID.

O Mixamo devolve o esqueleto com repouso em T. Cada osso do nosso esqueleto copia a orientação do osso de
mesmo nome no espaço do mundo (e o quadril copia a posição); o resultado é gravado quadro a quadro.

Uso: python biblioteca_bake.py -- <corpos.blend> <biblioteca_indice.json> <pasta_saida> <corpo> [SO=id1,id2]
Saída: <pasta_saida>/<corpo>.blend com as ações "<id>" (e "<id>.rm" quando há versão com deslocamento).
"""
import bpy, json, os, sys

a = sys.argv[sys.argv.index("--") + 1:]
BLEND, INDICE, OUT, CORPO = a[:4]
SO = set(os.environ.get("SO", "").split(",")) - {""}
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=BLEND)
scn = bpy.context.scene

# fica só o corpo pedido; as ações antigas saem
for act in list(bpy.data.actions):
    bpy.data.actions.remove(act)
manter = {CORPO, CORPO + "_lugar"} | {o.name for o in bpy.data.objects if o.parent and o.parent.name == CORPO}
for o in list(bpy.data.objects):
    if o.name not in manter:
        bpy.data.objects.remove(o, do_unlink=True)
arm = bpy.data.objects[CORPO]
lugar = arm.parent
lugar.location = (0.0, 0.0, 0.0)
if not arm.animation_data:
    arm.animation_data_create()
arm.animation_data.action = None
for pb in arm.pose.bones:
    pb.matrix_basis.identity()

PRI = os.environ.get("PRI")
itens = [x for x in json.load(open(INDICE))["indice"] if x["corpo"] == CORPO and (not SO or x["id"] in SO) and (not PRI or x["prioridade"] == PRI)]
ids_rm = {x["id"] for x in itens if not x["in_place"]} & {x["id"] for x in itens if x["in_place"]}

feitos = []
for x in itens:
    nome = x["id"] + (".rm" if x["id"] in ids_rm and not x["in_place"] else "")
    antes, acoes = set(bpy.data.objects), set(bpy.data.actions)
    bpy.ops.import_scene.fbx(filepath=x["arquivo"])
    novos = [o for o in bpy.data.objects if o not in antes]
    src = next(o for o in novos if o.type == "ARMATURE")
    for o in novos:
        if o is not src:
            bpy.data.objects.remove(o, do_unlink=True)
    fonte = src.animation_data.action
    f0, f1 = [int(round(v)) for v in fonte.frame_range]
    for pb in arm.pose.bones:
        for c in list(pb.constraints):
            pb.constraints.remove(c)
        if pb.name not in src.pose.bones:
            continue
        c = pb.constraints.new("COPY_ROTATION")
        c.target, c.subtarget, c.target_space, c.owner_space = src, pb.name, "WORLD", "WORLD"
        if pb.name == "Hips":
            c2 = pb.constraints.new("COPY_LOCATION")
            c2.target, c2.subtarget, c2.target_space, c2.owner_space = src, pb.name, "WORLD", "WORLD"
    # captura a pose visual (espaço do esqueleto) de cada quadro
    mats = []
    for fr in range(f0, f1 + 1):
        scn.frame_set(fr)
        mats.append({pb.name: pb.matrix.copy() for pb in arm.pose.bones})
    for pb in arm.pose.bones:
        for c in list(pb.constraints):
            pb.constraints.remove(c)
    # pose local de cada osso: basis = (rest_pai^-1 · rest)^-1 · pose_pai^-1 · pose
    nova = bpy.data.actions.new(nome)
    nova.use_fake_user = True
    arm.animation_data.action = nova
    n = len(mats)
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
        b = pb.bone
        rel = (b.parent.matrix_local.inverted() @ b.matrix_local) if b.parent else b.matrix_local
        rel_inv = rel.inverted()
        rots, locs, prev = [], [], None
        for m in mats:
            pai = m[b.parent.name] if b.parent else None
            basis = rel_inv @ (pai.inverted() @ m[pb.name] if pai is not None else m[pb.name])
            loc, q, _ = basis.decompose()
            if prev is not None and prev.dot(q) < 0:
                q = -q
            prev = q
            rots.append(q); locs.append(loc)
        canais = [("rotation_quaternion", 4, rots)] + ([("location", 3, locs)] if pb.name == "Hips" else [])
        for caminho, dim, vals in canais:
            for i in range(dim):
                fc = nova.fcurve_ensure_for_datablock(arm, f'pose.bones["{pb.name}"].{caminho}', index=i, group_name=pb.name)
                fc.keyframe_points.add(n)
                co = []
                for k, v in enumerate(vals):
                    co += [k + 1, v[i]]
                fc.keyframe_points.foreach_set("co", co)
                fc.keyframe_points.foreach_set("interpolation", [1] * n)  # LINEAR
                fc.update()
    nova["mixamo"] = x["nome_mixamo"]
    nova["status"] = x.get("status", "")
    nova["in_place"] = bool(x["in_place"])
    bpy.data.objects.remove(src, do_unlink=True)
    bpy.data.actions.remove(fonte)
    for act in list(bpy.data.actions):
        if act not in acoes and act is not nova and act.users == 0 and not act.use_fake_user:
            bpy.data.actions.remove(act)
    feitos.append(nome)
    print("feito", CORPO, nome, f1 - f0 + 1, flush=True)

arm.animation_data.action = None
for pb in arm.pose.bones:
    pb.matrix_basis.identity()
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, f"{CORPO}.blend"), compress=True)
print("fim", CORPO, len(feitos))
