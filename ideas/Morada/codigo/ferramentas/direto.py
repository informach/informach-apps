"""Animações baixadas do Mixamo já no nosso esqueleto (o adulto foi enviado com os ossos do pacote): entram como vieram,
sem conversão. Mede os auxiliares da cena de teste e exporta de novo o GLB do adulto com essas animações a mais.

Uso: python direto.py <corpos.blend> <pasta_fbx> <saida.glb> <apoios.json>
"""
import bpy, glob, json, os, sys
import numpy as np
from mathutils import Vector

BLEND, PASTA, GLB, APOIOS = (os.path.abspath(x) for x in sys.argv[sys.argv.index("--") + 1:sys.argv.index("--") + 5])
NOME = "adulto"
bpy.ops.wm.open_mainfile(filepath=BLEND)
scn = bpy.context.scene
arm = bpy.data.objects[NOME]
corpo = bpy.data.objects[NOME + "_corpo"]
lugar = arm.parent
for o in bpy.data.objects:
    if o.type == "ARMATURE":
        o.animation_data.action = None

diretas = {}
for f in sorted(glob.glob(os.path.join(PASTA, "*.fbx"))):
    id_ = os.path.splitext(os.path.basename(f))[0]
    antes, acoes_antes = set(bpy.data.objects), set(bpy.data.actions)
    bpy.ops.import_scene.fbx(filepath=f)
    novas = [a for a in bpy.data.actions if a not in acoes_antes]
    a = novas[0]
    a.name = f"{NOME}_direto_{id_}"
    a.use_fake_user = True
    for x in novas[1:]:
        bpy.data.actions.remove(x)
    for o in set(bpy.data.objects) - antes:
        bpy.data.objects.remove(o, do_unlink=True)
    diretas[id_] = a
print("importadas", len(diretas))


def usar(a):
    arm.animation_data.action = a
    if a.slots:
        arm.animation_data.action_slot = a.slots[0]


def peso(o, nomes):
    idx = {o.vertex_groups[n].index for n in nomes if n in o.vertex_groups}
    return np.array([sum(g.weight for g in v.groups if g.group in idx) for v in o.data.vertices])


def malha():
    ev = corpo.evaluated_get(bpy.context.evaluated_depsgraph_get())
    me = ev.to_mesh()
    P = np.array([ev.matrix_world @ v.co for v in me.vertices])
    ev.to_mesh_clear()
    return P


W = lambda n, cauda=False: arm.matrix_world @ (arm.pose.bones[n].tail if cauda else arm.pose.bones[n].head)
o = lugar.location
quadril = peso(corpo, ["Hips"]) > 0.45


def frames(a, n):
    f0, f1 = (int(x) for x in a.frame_range)
    return [int(x) for x in np.linspace(f0, f1, n)]


apoios = {}
for id_, a in diretas.items():
    usar(a)
    k = 1.0
    if id_.startswith("sitting") or id_ == "standing_up":
        fs = frames(a, 9)
        hs = []
        for f in fs:
            scn.frame_set(f)
            P = malha()
            hs.append(float(P[quadril, 2].min()))
        q = W("Hips")
        apoios[id_] = {"tipo": "cadeira", "h": round(min(hs), 3), "quadril": [round(q.x - o.x, 3), round(q.y - o.y, 3)],
                       "cabeca": [0, 0]}
    elif id_ == "climbing_a_rope":
        xs, ys = [], []
        for f in frames(a, 16):
            scn.frame_set(f)
            for lado in ("Left", "Right"):
                p = W(lado + "Hand", True)
                xs.append(p.x - o.x)
                ys.append(p.y - o.y)
        apoios[id_] = {"tipo": "corda", "x": round(float(np.mean(xs)), 3), "frente": round(-float(np.mean(ys)), 3), "topo": 3.6, "k": k}
    elif id_ == "stand_to_freehang":
        scn.frame_set(int(a.frame_range[1]))
        ps = [W(l + "Hand", True) for l in ("Left", "Right")]
        apoios[id_] = {"tipo": "barra", "h": round(float(np.mean([p.z - o.z for p in ps])), 3),
                       "frente": round(-float(np.mean([p.y - o.y for p in ps])), 3),
                       "meia_largura": round(max(abs(p.x - o.x) for p in ps) + 0.35, 3), "k": k}
    elif id_ == "mma_kick":
        melhor = None
        for f in frames(a, 49):
            scn.frame_set(f)
            for lado in ("Left", "Right"):
                p = W(lado + "ToeBase", True)
                fr = -(p.y - o.y)
                if melhor is None or fr > melhor[0]:
                    melhor = (fr, p.x - o.x, p.z - o.z)
        apoios[id_] = {"tipo": "saco", "frente": round(melhor[0], 3), "x": round(melhor[1], 3), "z": round(melhor[2], 3), "k": k}
    elif id_ == "button_pushing":
        melhor = None
        for f in frames(a, 98):
            scn.frame_set(f)
            for lado in ("Left", "Right"):
                p = W(lado + "HandIndex2", True)
                fr = -(p.y - o.y)
                if melhor is None or fr > melhor[0]:
                    melhor = (fr, p.x - o.x, p.z - o.z)
        apoios[id_] = {"tipo": "botao", "frente": round(melhor[0], 3), "x": round(melhor[1], 3), "z": round(melhor[2], 3), "k": k}
    elif id_ in ("push_start", "push_stop"):
        apoios[id_] = {"tipo": "caixa_segue", "k": k}
    elif id_ in ("lying_down", "laying_sleeping"):
        f0, f1 = (int(x) for x in a.frame_range)
        scn.frame_set(f1 if id_ == "lying_down" else (f0 + f1) // 2)
        P = malha()
        h = float(P[peso(corpo, ["Hips", "Spine", "Spine1"]) > 0.45, 2].min())
        q, c = W("Hips"), W("Head")
        apoios[id_] = {"tipo": "cama", "h": round(h, 3), "quadril": [round(q.x - o.x, 3), round(q.y - o.y, 3)],
                       "cabeca": [round(c.x - o.x, 3), round(c.y - o.y, 3)]}
    elif id_ in ("climbing_ladder", "climbing_to_top"):
        fr, topo, xs = [], 0, []
        for f in frames(a, 16):
            scn.frame_set(f)
            for lado in ("Left", "Right"):
                fr += [-(W(lado + "Hand").y - o.y), -(W(lado + "ToeBase").y - o.y)]
                topo = max(topo, W(lado + "HandMiddle2", True).z - o.z)
                xs.append(W(lado + "Hand").x - o.x)
        xc = float(np.mean(xs))
        apoios[id_] = {"tipo": "escada", "frente": round(float(np.percentile(fr, 85)) + 0.03, 3), "topo": round(topo + 0.4, 3),
                       "x": round(xc, 3), "meia_largura": round(max(float(np.max(np.abs(np.array(xs) - xc))), 0.15) + 0.06, 3), "k": k}
    elif id_ == "kiss":
        rosto = bpy.data.objects[NOME + "_rosto_neutro"]
        frente = 0
        for f in frames(a, 40):
            scn.frame_set(f)
            ev = rosto.evaluated_get(bpy.context.evaluated_depsgraph_get())
            me = ev.to_mesh()
            frente = max(frente, -(min((ev.matrix_world @ v.co).y for v in me.vertices) - o.y))
            ev.to_mesh_clear()
        apoios[id_] = {"tipo": "par", "dist": round(2 * frente + 0.004, 3), "anim": "direto_kiss", "k": k}
print("auxiliares", {k_: v["tipo"] for k_, v in apoios.items()})

# exporta o adulto com todas as animações (as de antes + as diretas), cada uma numa trilha NLA
mesh = [x for x in bpy.data.objects if x.type == "MESH" and x.parent is arm]
for x in bpy.context.selected_objects:
    x.select_set(False)
arm.select_set(True)
for x in mesh:
    x.select_set(True)
bpy.context.view_layer.objects.active = arm
loc = lugar.location.copy()
lugar.location = (0, 0, loc.z)
bpy.context.view_layer.update()
for m in bpy.data.materials:  # textura direto no Base Color (o tom de pele é aplicado na página)
    if not m.node_tree:
        continue
    t = next((n for n in m.node_tree.nodes if n.type == "TEX_IMAGE"), None)
    b = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if t and b:
        m.node_tree.links.new(t.outputs["Color"], b.inputs["Base Color"])
arm.animation_data.action = None
for tr in list(arm.animation_data.nla_tracks):
    arm.animation_data.nla_tracks.remove(tr)
nomes = list(arm["_copias"]) + [a.name for a in diretas.values()]
for an in nomes:
    act = bpy.data.actions[an]
    tr = arm.animation_data.nla_tracks.new()
    tr.name = an.split(f"{NOME}_", 1)[1]
    st = tr.strips.new(tr.name, int(act.frame_range[0]), act)
    if hasattr(st, "action_slot") and act.slots:
        st.action_slot = act.slots[0]
bpy.ops.export_scene.gltf(filepath=GLB, use_selection=True, export_animations=True, export_animation_mode="NLA_TRACKS",
                          export_apply=False, export_yup=True, export_image_format="AUTO")
ap = json.load(open(APOIOS))
ap.setdefault(NOME, {}).update({"direto_" + k_: v for k_, v in apoios.items()})
json.dump(ap, open(APOIOS, "w"), ensure_ascii=False)
print("ok", len(nomes), "animações no", os.path.basename(GLB))
