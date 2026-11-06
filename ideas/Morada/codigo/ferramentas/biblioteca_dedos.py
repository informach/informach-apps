"""Dedos segurando os objetos nas animações que vieram do Mixamo (as compostas já fazem a pegada na receita).

Para cada animação da tabela, os dedos da mão que segura recebem a pose da pegada (copo, telefone, cabo, caneta,
controle, caixa), calculada a partir dos dedos retos do esqueleto e dobrada em direção à palma (as mesmas pegadas de
compor.py). A pose é a mesma durante o clipe, porque o objeto fica na mão o tempo todo. Em algumas, o antebraço gira
sobre o próprio eixo para a palma ficar como o objeto pede (escrever: mão de lado, apoiada na borda do mindinho); a
mão continua seguindo o antebraço.

Uso: python biblioteca_dedos.py -- <corrigido_todos/corpo.blend> <corpo>   (grava no mesmo .blend e .json)
"""
import sys
import json
import math

_src = open(__file__.replace("biblioteca_dedos.py", "compor.py")).read().split(
    "# ---------------------------------------------------------------- receitas")[0]
sys.argv = sys.argv[: sys.argv.index("--") + 1] + sys.argv[sys.argv.index("--") + 1:][:2] * 1 + ["-"]
exec(compile(_src, "compor", "exec"))
from mathutils.bvhtree import BVHTree  # noqa: E402 (depois do bpy)

PEGADAS.update({
    "copo": ((50, 58), (30, 24)),      # copo, xícara, regador: fecha em volta de um cilindro largo
    "telefone": ((32, 40), (22, 18)),  # celular no ouvido
    "controle": ((38, 46), (12, 24)),  # controle de videogame: polegar por cima
    "corda": ((70, 86), (34, 40)),     # cabo fino (corda, haltere): fecha bem
})
# animação: {lado: pegada}; "perto_da_cabeca" escolhe a mão que fica mais perto da cabeça no clipe e "mais_a_frente" a
# que fica mais à frente do corpo
TABELA = {
    "resident.drink.stand": {"perto_da_cabeca": "copo"},
    "resident.drink.sit": {"perto_da_cabeca": "copo"},
    "resident.phone.talk": {"perto_da_cabeca": "telefone"},
    "resident.carry.box.idle": {"Left": "concha", "Right": "concha"},
    "resident.garden.water": {"mais_a_frente": "copo"},
    "resident.garden.dig": {"Left": "punho", "Right": "punho"},
    "resident.music.guitar": {"Left": "copo", "Right": "pinca"},
    "resident.play.jump_rope": {"Left": "corda", "Right": "corda"},
    "resident.play.videogame": {"Left": "controle", "Right": "controle"},
    "resident.fit.curl": {"Left": "corda", "Right": "corda"},
    "resident.desk.write": {"Right": "pinca"},
    "resident.stretch": {"puxa": "concha"},  # a mão que puxa o outro braço envolve o braço
}
# a mão que segura o outro braço não pode entrar nele: afasta (IK, a mão segue o antebraço) o quanto entra
MAO_NO_BRACO = {"resident.stretch"}
# palma desejada no mundo (o antebraço gira sobre o eixo dele até chegar o mais perto possível); x = esquerda do corpo
PALMA_ALVO = {
    "resident.desk.write": {"Right": (0.8, 0.0, -0.6)},  # mão de escrever: de lado, palma para dentro e um pouco para baixo
}
OSSOS_DEDOS = {l: [f"{l}Hand{d}{s}" for d in DEDOS + ("Thumb",) for s in (1, 2) if f"{l}Hand{d}{s}" in PB]
               for l in ("Left", "Right")}

# pose de cada pegada, nos dedos retos do esqueleto (no espaço local de cada osso: não depende da pose da mão)
arm.animation_data.action = None
for pb_ in PB:
    pb_.rotation_mode = "QUATERNION"
    pb_.matrix_basis.identity()
bpy.context.view_layer.update()
for _l in ("Left", "Right"):
    _M = (mw @ PB[_l + "Hand"].matrix).to_3x3()
    _eixo = _M.col[1].normalized()
    _dentro = Vector((-1 if (mw @ PB[_l + "Hand"].head).x > (mw @ PB["Hips"].head).x else 1, 0, 0))
    PALMA[_l] = (_M.inverted() @ (_dentro - _eixo * _dentro.dot(_eixo)).normalized()).normalized()
POSE = {}
for _l in ("Left", "Right"):
    for _p in PEGADAS:
        for nb in OSSOS_DEDOS[_l]:
            PB[nb].matrix_basis.identity()
        bpy.context.view_layer.update()
        dedos(_l, _p)
        POSE[_l, _p] = {nb: PB[nb].rotation_quaternion.copy() for nb in OSSOS_DEDOS[_l]}
for pb_ in PB:
    pb_.matrix_basis.identity()


def canais(act):
    slot = act.slots[0]
    for camada in act.layers:
        for strip in camada.strips:
            cb = strip.channelbag(slot)
            if cb:
                return cb
    return None


def chave_constante(act, nb, q, f0, f1):
    caminho = f'pose.bones["{nb}"].rotation_quaternion'
    cb = canais(act)
    for fc in [fc for fc in cb.fcurves if fc.data_path == caminho]:
        cb.fcurves.remove(fc)
    for i in range(4):
        fc = act.fcurve_ensure_for_datablock(arm, caminho, index=i, group_name=nb)
        for f in (f0, f1):
            fc.keyframe_points.insert(f, q[i], options={"FAST"})


def perto_da_cabeca(act, f0, f1):
    d = {"Left": 0.0, "Right": 0.0}
    for f in range(f0, f1 + 1, 4):
        scn.frame_set(f)
        cab = mw @ PB["Head"].head
        for l in d:
            d[l] += ((mw @ PB[l + "Hand"].head) - cab).length
    return min(d, key=d.get)


def mais_a_frente(act, f0, f1):
    d = {"Left": 0.0, "Right": 0.0}
    for f in range(f0, f1 + 1, 4):
        scn.frame_set(f)
        frente = ((mw @ PB["LeftUpLeg"].head) - (mw @ PB["RightUpLeg"].head)).cross(UP)  # esquerda × cima = frente
        frente.z = 0
        if frente.length < 1e-6:
            continue
        frente.normalize()
        for l in d:
            d[l] += ((mw @ PB[l + "Hand"].head) - (mw @ PB["Hips"].head)).dot(frente)
    return max(d, key=d.get)


CORPO_M = bpy.data.objects[CORPO + "_corpo"]


def _peso(prefixos):
    idx = {g.index for g in CORPO_M.vertex_groups if any(g.name.startswith(p_) for p_ in prefixos)}
    return np.array([sum(g.weight for g in v.groups if g.group in idx) for v in CORPO_M.data.vertices])


_TRIS = []
for _p in CORPO_M.data.polygons:
    _v = _p.vertices
    for _i in range(1, len(_v) - 1):
        _TRIS.append((_v[0], _v[_i], _v[_i + 1]))
_TRIS = np.array(_TRIS)
W_MAO = {l: np.nonzero(_peso([l + "Hand"]) > 0.5)[0] for l in ("Left", "Right")}
T_BRACO = {l: [tuple(t) for t in _TRIS[(_peso([l + "Arm", l + "ForeArm", l + "Hand"])[_TRIS] > 0.5).all(1)]] for l in ("Left", "Right")}
OUTRO = {"Left": "Right", "Right": "Left"}


def _malha():
    ev = CORPO_M.evaluated_get(bpy.context.evaluated_depsgraph_get())
    me = ev.to_mesh()
    P = [ev.matrix_world @ v.co for v in me.vertices]
    ev.to_mesh_clear()
    return P


def entra_no_braco(lado):
    """Quanto a mão 'lado' entra no outro braço: vetor para fora (no mundo) ou None."""
    P = _malha()
    bvh = BVHTree.FromPolygons(P, T_BRACO[OUTRO[lado]])
    pior, soma = 0.0, Vector()
    for vi in W_MAO[lado]:
        loc, nrm, _, dist = bvh.find_nearest(P[vi], 0.08)
        if loc is None or (P[vi] - loc).dot(nrm) >= 0:
            continue
        soma += nrm * dist
        pior = max(pior, dist)
    if pior < 1e-4 or soma.length < 1e-9:
        return None
    return soma.normalized() * (pior + 0.005)


nome_atual = [""]


def afasta_do_braco(act, f0, f1):
    """Duas passadas: mede quanto cada mão entra no outro braço, suaviza no tempo e afasta com IK."""
    quadros = list(range(f0, f1 + 1))
    usadas = {}
    for _ in range(5):
        D = {l: np.zeros((len(quadros), 3)) for l in ("Left", "Right")}
        for i, f in enumerate(quadros):
            scn.frame_set(f)
            for l in D:
                v = entra_no_braco(l)
                if v is not None:
                    D[l][i] = v
        pior = max(np.linalg.norm(D[l], axis=1).max() for l in D)
        print("  entra no braço", nome_atual[0], f"{pior * 100:.1f} cm", flush=True)
        if pior < 0.008:
            break
        ker = np.exp(-0.5 * (np.arange(-6, 7) / 2.0) ** 2)
        ker /= ker.sum()
        for l in D:
            pad = np.pad(D[l], ((6, 6), (0, 0)), mode="edge")
            Y = np.stack([np.convolve(pad[:, c], ker, mode="valid") for c in range(3)], 1)
            nx, ny = np.linalg.norm(D[l], axis=1), np.linalg.norm(Y, axis=1)
            D[l] = Y * np.where((ny > 1e-9) & (ny < nx), nx / np.maximum(ny, 1e-9), 1.0)[:, None]
            usadas[l] = usadas.get(l, 0.0) + float(np.linalg.norm(D[l], axis=1).sum())
        novas = []
        for i, f in enumerate(quadros):
            scn.frame_set(f)
            for l in D:
                v = Vector(D[l][i])
                if v.length < 1e-4:
                    continue
                cad = (l + "Arm", l + "ForeArm", l + "Hand")
                ik(cad, (mw @ PB[l + "Hand"].head) + v, polo=(mw @ PB[l + "ForeArm"].head) + v)
            novas.append({nb: PB[nb].rotation_quaternion.copy() for l in D for nb in (l + "Arm", l + "ForeArm", l + "Hand")})
        for f, rots in zip(quadros, novas):
            for nb, q in rots.items():
                PB[nb].rotation_quaternion = q
                PB[nb].keyframe_insert("rotation_quaternion", frame=f, group=nb)
    # a mão que puxa é a que fica perto do cotovelo do outro braço
    d = {"Left": 0.0, "Right": 0.0}
    for f in quadros[::3]:
        scn.frame_set(f)
        for l in d:
            d[l] += ((mw @ PB[l + "Hand"].head) - (mw @ PB[OUTRO[l] + "ForeArm"].head)).length
    return min(d, key=d.get)


def gira_antebraco(lado, alvo):
    """Gira o antebraço sobre o próprio eixo até a palma ficar o mais perto de 'alvo' (a mão vai junto)."""
    fa = PB[lado + "ForeArm"]
    eixo = ((mw @ fa.tail) - (mw @ fa.head)).normalized()
    palma = (rot_mundo(lado + "Hand").to_matrix() @ PALMA[lado]).normalized()
    a_ = Vector(alvo).normalized()
    p1 = (palma - eixo * palma.dot(eixo))
    p2 = (a_ - eixo * a_.dot(eixo))
    if p1.length < 1e-4 or p2.length < 1e-4:
        return
    p1.normalize()
    p2.normalize()
    ang = math.degrees(math.atan2(eixo.dot(p1.cross(p2)), p1.dot(p2)))
    gira(lado + "ForeArm", eixo, ang, mw @ fa.head)


rel = dados.setdefault("correcoes", {})
feitas = 0
for nome, lados in TABELA.items():
    if nome not in bpy.data.actions:
        continue
    act = bpy.data.actions[nome]
    arm.animation_data.action = act
    if act.slots:
        arm.animation_data.action_slot = act.slots[0]
    f0, f1 = (int(x) for x in act.frame_range)
    if "perto_da_cabeca" in lados:
        lados = {perto_da_cabeca(act, f0, f1): lados["perto_da_cabeca"]}
    if "mais_a_frente" in lados:
        lados = {mais_a_frente(act, f0, f1): lados["mais_a_frente"]}
    if nome in MAO_NO_BRACO:
        nome_atual[0] = nome
        puxa = afasta_do_braco(act, f0, f1)
        lados = {puxa: lados["puxa"]} if puxa and "puxa" in lados else {k_: v_ for k_, v_ in lados.items() if k_ != "puxa"}
    # antebraço: por quadro (a palma depende da pose), gravado antes de trocar os dedos
    for lado, alvo in PALMA_ALVO.get(nome, {}).items():
        rots = []
        for f in range(f0, f1 + 1):
            scn.frame_set(f)
            gira_antebraco(lado, alvo)
            rots.append((f, PB[lado + "ForeArm"].rotation_quaternion.copy(), PB[lado + "Hand"].rotation_quaternion.copy()))
        for f, qa, qh in rots:
            PB[lado + "ForeArm"].rotation_quaternion = qa
            PB[lado + "ForeArm"].keyframe_insert("rotation_quaternion", frame=f, group=lado + "ForeArm")
    for lado, pegada in lados.items():
        for nb, q in POSE[lado, pegada].items():
            chave_constante(act, nb, q, f0, f1)
    rel.setdefault(nome, {})["dedos"] = {l: p for l, p in lados.items()}
    feitas += 1
    print("dedos", CORPO, nome, lados, flush=True)
arm.animation_data.action = None
for pb_ in PB:
    pb_.matrix_basis.identity()
bpy.ops.wm.save_as_mainfile(filepath=BLEND, compress=True)
json.dump(dados, open(BLEND[:-6] + ".json", "w"), ensure_ascii=False, indent=1)
print("fim", CORPO, feitas)
