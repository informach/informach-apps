"""Etapa 1 do pipeline: extrai as animações dos FBX do Mixamo para uma biblioteca .blend.

Uso: python clipes.py <pasta_com_fbx> <saida.blend> <relatorio.json>

- Usa o esqueleto do primeiro arquivo (Walking) como base e remove os ossos dos dedos e das pontas.
- Para cada FBX: importa, pega a action, confere o esqueleto, normaliza a altura do quadril
  se o personagem for outro, tira o deslocamento das animações de locomoção ("in place")
  e descarta as curvas dos ossos removidos.
"""
import glob
import json
import os
import re
import sys
import time

import bpy

SRC, OUT, REPORT = sys.argv[1], sys.argv[2], sys.argv[3]
P = "mixamorig:"
BASE_HINT = "Walking.fbx"
# laços de locomoção: o servidor move o personagem pela rota, então a animação fica no lugar
LOOP_IN_PLACE = re.compile(r"^(walking|walking_1|walking_backwards|running|running_1|jogging|swimming)$")


def keep_bone(name: str) -> bool:
    n = name.replace(P, "")
    return not (re.search(r"Hand(Thumb|Index|Middle|Ring|Pinky)\d", n) or n.endswith("_End"))


def channelbags(action):
    for layer in action.layers:
        for strip in layer.strips:
            yield from strip.channelbags


def clip_id(path: str) -> str:
    base = os.path.basename(path)
    base = re.sub(r"^[0-9a-f]{8}-", "", base)
    return os.path.splitext(base)[0].lower()


def import_fbx(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=False)
    new = [o for o in bpy.data.objects if o not in before]
    arm = next(o for o in new if o.type == "ARMATURE")
    return arm, new


def purge(objs):
    for o in objs:
        try:
            data = o.data
        except ReferenceError:  # já removido junto com outro dado
            continue
        bpy.data.objects.remove(o, do_unlink=True)
        if data is not None and data.users == 0:
            if isinstance(data, bpy.types.Mesh):
                bpy.data.meshes.remove(data)
            elif isinstance(data, bpy.types.Armature):
                bpy.data.armatures.remove(data)
    for img in list(bpy.data.images):
        bpy.data.images.remove(img)
    for m in list(bpy.data.materials):
        if m.users == 0:
            bpy.data.materials.remove(m)


t0 = time.time()
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.render.fps = 30
files = sorted(glob.glob(os.path.join(SRC, "*.fbx")))
base_path = next(f for f in files if f.endswith(BASE_HINT))
files.remove(base_path)
files.insert(0, base_path)

report = {"clipes": [], "esqueleto": {}}
base_arm = None
base_heads = {}

for path in files:
    cid = clip_id(path)
    t = time.time()
    arm, objs = import_fbx(path)
    act = arm.animation_data.action if arm.animation_data else None
    heads = {b.name: b.head_local.copy() for b in arm.data.bones}
    entry = {"id": cid, "arquivo": os.path.basename(path)}

    if base_arm is None:
        # esqueleto base: tira malha e texturas, remove dedos e pontas
        base_arm = arm
        base_arm.name = "Esqueleto"
        base_arm.data.name = "Esqueleto"
        objs.remove(arm)
        base_heads = heads
        bpy.context.view_layer.objects.active = base_arm
        base_arm.select_set(True)
        bpy.ops.object.mode_set(mode="EDIT")
        for eb in list(base_arm.data.edit_bones):
            if not keep_bone(eb.name):
                base_arm.data.edit_bones.remove(eb)
        bpy.ops.object.mode_set(mode="OBJECT")
        report["esqueleto"] = {
            "ossos_originais": len(heads),
            "ossos_mantidos": len(base_arm.data.bones),
            "nomes": [b.name.replace(P, "") for b in base_arm.data.bones],
            "altura_quadril_cm": round(heads[P + "Hips"].y, 1),
            "altura_cabeca_topo_cm": round(heads[P + "HeadTop_End"].y, 1),
        }
        entry["base"] = True

    # mesmo esqueleto? (posições de repouso, em cm)
    dev = max((heads[n] - base_heads[n]).length for n in base_heads if n in heads)
    ratio = base_heads[P + "Hips"].y / heads[P + "Hips"].y
    entry["desvio_esqueleto_cm"] = round(dev, 2)
    entry["escala_quadril"] = round(ratio, 3)

    if act is None:
        entry["erro"] = "sem animação"
    else:
        act.name = cid
        act.use_fake_user = True
        removed = 0
        for cb in channelbags(act):
            for fc in list(cb.fcurves):
                m = re.match(r'pose\.bones\["(.+?)"\]', fc.data_path)
                if m and not keep_bone(m.group(1)):
                    cb.fcurves.remove(fc)
                    removed += 1
                    continue
                if fc.data_path == f'pose.bones["{P}Hips"].location':
                    kps = fc.keyframe_points
                    if abs(ratio - 1) > 0.01:
                        for k in kps:
                            k.co[1] *= ratio
                            k.handle_left[1] *= ratio
                            k.handle_right[1] *= ratio
                    if len(kps) > 1:
                        (ta, va), (tb, vb) = kps[0].co, kps[-1].co
                        entry.setdefault("deslocamento_cm", [0, 0, 0])[fc.array_index] = round(vb - va, 1)
                        if LOOP_IN_PLACE.match(cid) and tb > ta:
                            for k in kps:
                                d = (vb - va) * (k.co[0] - ta) / (tb - ta)
                                k.co[1] -= d
                                k.handle_left[1] -= d
                                k.handle_right[1] -= d
                            entry["no_lugar"] = True
        entry["quadros"] = [int(act.frame_range[0]), int(act.frame_range[1])]
        entry["curvas_removidas"] = removed
        act.use_cyclic = bool(LOOP_IN_PLACE.match(cid)) or cid.endswith("idle") or "dancing" in cid
    if arm is not base_arm:
        objs.append(arm)
    purge(objs)
    entry["segundos"] = round(time.time() - t, 1)
    report["clipes"].append(entry)
    print(f"{cid:28} quadros={entry.get('quadros')} desvio={entry['desvio_esqueleto_cm']}cm "
          f"escala={entry['escala_quadril']} desloc={entry.get('deslocamento_cm')} "
          f"{'no lugar' if entry.get('no_lugar') else ''}", flush=True)

# a action base fica no esqueleto só como referência; nenhuma action fica "ativa"
base_arm.animation_data_clear()
for a in list(bpy.data.actions):
    if a.users == 0 and not a.use_fake_user:
        bpy.data.actions.remove(a)
bpy.ops.wm.save_as_mainfile(filepath=OUT, compress=True)
report["total_segundos"] = round(time.time() - t0, 1)
report["total_clipes"] = len([c for c in report["clipes"] if "erro" not in c])
with open(REPORT, "w") as f:
    json.dump(report, f, ensure_ascii=False, indent=2)
print("salvo:", OUT, "clipes:", report["total_clipes"], "tempo:", report["total_segundos"], "s")
