"""Biblioteca de grávida (2º e 3º trimestre) de um corpo feminino adulto.

Parte do corpo com a barriga do 3º trimestre e das animações da biblioteca do esqueleto dele. Tira as que não fazem
sentido no fim da gravidez, aplica a postura de grávida (costas um pouco para trás, barriga para a frente, pescoço e
cabeça compensando para olhar à frente) e corrige as mãos que entram na barriga (contato.py). Depois disso rodam
biblioteca_chao.py e biblioteca_antebraco.py no arquivo gerado.

Uso: python gravida_biblioteca.py -- <corpos.blend> <corpo> <biblioteca do esqueleto (corrigido_todos/x.blend)> <saida.blend>
"""
import bpy, sys, os, json, math
from mathutils import Matrix, Quaternion, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "morada-art"))
import contato  # noqa: E402

a = sys.argv[sys.argv.index("--") + 1:]
CORPOS, CORPO, FONTE, SAIDA = a[:4]
TIRA = ("fit.pushup", "fit.crunch", "fit.jacks", "jump.small", "run.normal", "jog", "climb.", "hang.enter",
        "play.ball_kick", "dance.hiphop", "dance.silly", "sit.floor.crossed", "baby.", "care.")
SEM_POSTURA = ("lie.", "sleep.", "swim", "car.", "sit.", "desk.", "drink.sit", "eat.sit", "read.sit", "crouch.",
               "pickup.floor", "garden.plant", "garden.pull", "romance.propose", "music.piano", "play.videogame")

bpy.ops.wm.open_mainfile(filepath=CORPOS)
scn = bpy.context.scene
arm = bpy.data.objects[CORPO]
lugar = arm.parent
manter = {arm, lugar} | {o for o in bpy.data.objects if o.parent is arm}
for o in list(bpy.data.objects):
    if o not in manter:
        bpy.data.objects.remove(o, do_unlink=True)
for act in list(bpy.data.actions):
    bpy.data.actions.remove(act)
lugar.location = (0, 0, 0)  # como nas bibliotecas: o quadril das animações já põe os pés no chão
if not arm.animation_data:
    arm.animation_data_create()
arm.animation_data.action = None
for t in list(arm.animation_data.nla_tracks):
    arm.animation_data.nla_tracks.remove(t)
for pb in arm.pose.bones:
    pb.matrix_basis.identity()
corpo = bpy.data.objects[CORPO + "_corpo"]
corpo.data.shape_keys.key_blocks["gravidez_3"].value = 1.0  # as correções medem com a barriga do 3º trimestre
bpy.context.view_layer.update()

with bpy.data.libraries.load(FONTE, link=False) as (src, dst):
    _so = set(os.environ.get("SO", "").split(",")) - {""}
    dst.actions = [n for n in src.actions if n.startswith("resident.") and not any(t in n for t in TIRA)
                   and (not _so or n in _so)]
for act in dst.actions:
    act.use_fake_user = True
acoes = sorted(dst.actions, key=lambda x: x.name)
mw = arm.matrix_world
print("acoes", len(acoes), flush=True)


def usar(act):
    arm.animation_data.action = act
    if act.slots:
        arm.animation_data.action_slot = act.slots[0]
    return [int(x) for x in act.frame_range]


def gira(nb, eixo, graus):
    pb = arm.pose.bones[nb]
    R = mw.to_quaternion()
    q = R.inverted() @ Quaternion(eixo, math.radians(graus)) @ R
    h = pb.head.copy()
    pb.matrix = Matrix.Translation(h) @ q.to_matrix().to_4x4() @ Matrix.Translation(-h) @ pb.matrix
    bpy.context.view_layer.update()


# ---------------------------------------------------------------- postura de grávida
POSTURA = (("Spine", -6.0), ("Spine1", -2.5), ("Neck", 5.0), ("Head", 3.0))  # negativo = para trás
n_post = 0
for act in acoes:
    if any(t in act.name for t in SEM_POSTURA):
        continue
    f0, f1 = usar(act)
    for f in range(f0, f1 + 1):
        scn.frame_set(f)
        esq = (mw @ arm.pose.bones["LeftArm"].head) - (mw @ arm.pose.bones["RightArm"].head)
        esq.z = 0
        esq.normalize()
        for nb, g in POSTURA:  # ângulo positivo inclina para a frente; os negativos levam para trás
            gira(nb, esq, g)
        for nb, _ in POSTURA:
            arm.pose.bones[nb].keyframe_insert("rotation_quaternion", frame=f, group=nb)
    act["postura_gravida"] = True
    n_post += 1
print("postura", n_post, flush=True)

# ---------------------------------------------------------------- mãos fora da barriga
altura = max((corpo.evaluated_get(bpy.context.evaluated_depsgraph_get()).matrix_world @ v.co).z for v in corpo.data.vertices)
k = altura / 1.75
_ap = json.load(open(FONTE[:-6] + ".json")).get("apoios", {})
juntas = {n for n, v in _ap.items() if v.get("tipo") == "entre_maos"}  # livro, tablet, caixa: as mãos andam juntas
res = contato.corrigir(arm, corpo, acoes, k, juntas=juntas)
print("maos", len(res), flush=True)

arm.animation_data.action = None
for pb in arm.pose.bones:
    pb.matrix_basis.identity()
os.makedirs(os.path.dirname(SAIDA), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=SAIDA, compress=True)
base = json.load(open(FONTE[:-6] + ".json"))
corr = {nome: dict(base["correcoes"].get(nome, {})) for nome in [x.name for x in acoes]}
chave = {(x.name.split("_", 1)[1] if "_" in x.name else x.name): x.name for x in acoes}  # como contato.py nomeia
for nome, n in res.items():
    corr.setdefault(chave.get(nome, nome), {})["mao_na_barriga"] = n
for act in acoes:
    if act.get("postura_gravida"):
        corr.setdefault(act.name, {})["postura_gravida"] = True
json.dump({"corpo": CORPO, "altura": round(altura, 3), "correcoes": corr,
           "apoios": {k_: v for k_, v in base["apoios"].items() if k_ in {x.name for x in acoes}}},
          open(SAIDA[:-6] + ".json", "w"), ensure_ascii=False, indent=1)
print("fim", CORPO, len(acoes))
