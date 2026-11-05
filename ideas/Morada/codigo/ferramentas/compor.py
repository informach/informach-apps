"""Animações que o Mixamo não tem, compostas a partir das que já estão na biblioteca de cada corpo.

Cada receita parte de clipes da própria biblioteca (corpo inteiro, ou parte de baixo de um e parte de cima de outro) e
acrescenta movimento feito aqui: inclinação da coluna, mãos levadas a alvos (IK de braço e antebraço) e pernas (IK de
coxa e perna), balanço. Os alvos são medidos no próprio corpo em cada quadro (ombros, quadril, boca), então a mesma
receita serve para qualquer tipo de corpo.

Uso: python compor.py -- <corrigido_todos/corpo.blend> <corpo> <saida.blend> [ids]
Saída: um .blend só com as ações novas ("resident.<id>"), pronto para biblioteca_corrige.py.
"""
import bpy, sys, json, math
import numpy as np
from mathutils import Matrix, Quaternion, Vector

a = sys.argv[sys.argv.index("--") + 1:]
BLEND, CORPO, SAIDA = a[:3]
SO = set(a[3].split(",")) if len(a) > 3 and a[3] else set()
FPS = 30
bpy.ops.wm.open_mainfile(filepath=BLEND)
scn = bpy.context.scene
arm = bpy.data.objects[CORPO]
mw = arm.matrix_world
mwi3 = mw.inverted().to_3x3()
PB = arm.pose.bones
dados = json.load(open(BLEND[:-6] + ".json"))
K = dados["altura"] / 1.75
UP = Vector((0, 0, 1))
GRUPO = {"adulto": "AD", "plus_m": "AD", "plus_f": "AD", "musculoso": "AD", "atletica": "AD", "alto_magro": "AD",
         "idoso": "ID", "adolescente_m": "TE", "crianca_m": "CR", "pequeno_m": "PQ", "bebe_m": "BB"}.get(CORPO, "GR")
TEM_SPINE2 = "Spine2" in PB
BAIXO = [b.name for b in arm.data.bones if b.name in ("Root", "Hips") or any(t in b.name for t in ("Leg", "Foot", "Toe"))]


# ---------------------------------------------------------------- amostras das ações da biblioteca
_cache = {}


def amostra(nome):
    """[{osso: matrix_basis}] de cada quadro da ação."""
    if nome in _cache:
        return _cache[nome]
    act = bpy.data.actions[nome]
    arm.animation_data.action = act
    if act.slots:
        arm.animation_data.action_slot = act.slots[0]
    f0, f1 = (int(x) for x in act.frame_range)
    res = []
    for f in range(f0, f1 + 1):
        scn.frame_set(f)
        res.append({pb.name: pb.matrix_basis.copy() for pb in PB})
    arm.animation_data.action = None
    _cache[nome] = res
    return res


def existe(nome):
    return nome in bpy.data.actions


def quadro(nome, i, laco=True):
    s = amostra(nome)
    return s[i % len(s)] if laco else s[min(i, len(s) - 1)]


def pose(*camadas):
    """camadas: (amostra_do_quadro, ossos ou None = todos). As de depois sobrescrevem."""
    for d, ossos in camadas:
        for nb in (ossos if ossos is not None else d.keys()):
            PB[nb].matrix_basis = d[nb]
    bpy.context.view_layer.update()


def cima_de(ossos_baixo_e_spine=True):
    excl = set(BAIXO) | ({"Spine"} if ossos_baixo_e_spine else set())
    return [pb.name for pb in PB if pb.name not in excl]


# ---------------------------------------------------------------- ferramentas no mundo
def W(nb, cauda=False):
    pb = PB[nb]
    return mw @ (pb.tail if cauda else pb.head)


def gira(nb, eixo, graus, pivo=None):
    pb = PB[nb]
    q = Quaternion(eixo, math.radians(graus))
    R = mw.to_quaternion()
    qa = R.inverted() @ q @ R
    h = pb.head.copy() if pivo is None else mw.inverted() @ pivo
    pb.matrix = Matrix.Translation(h) @ qa.to_matrix().to_4x4() @ Matrix.Translation(-h) @ pb.matrix
    bpy.context.view_layer.update()


def move(nb, delta):
    pb = PB[nb]
    pb.matrix = Matrix.Translation(mwi3 @ Vector(delta)) @ pb.matrix
    bpy.context.view_layer.update()


def eixos():
    """frente, esquerda (do personagem) e centro dos ombros, no mundo, pela pose atual."""
    esq = (W("LeftArm") - W("RightArm"))
    esq.z = 0
    esq.normalize()
    frente = esq.cross(UP).normalized()
    return frente, esq, (W("LeftArm") + W("RightArm")) / 2


def ik(cadeia, alvo, polo=None, rot_ponta=None):
    """Dois ossos (ex.: LeftArm, LeftForeArm, LeftHand): leva a cabeça do 3º osso ao alvo. polo: ponto para onde o
    cotovelo/joelho aponta. A ponta mantém a orientação no mundo (ou recebe rot_ponta)."""
    p1, p2, p3 = (PB[n] for n in cadeia)
    S, E, Wp = mw @ p1.head, mw @ p2.head, mw @ p3.head
    rot3 = rot_ponta if rot_ponta is not None else (mw @ p3.matrix).to_quaternion()
    a_, b_ = (E - S).length, (Wp - E).length
    alvo = Vector(alvo)
    L = min(max((alvo - S).length, abs(a_ - b_) + 1e-4), a_ + b_ - 1e-4)
    d = (alvo - S).normalized()
    ref = (Vector(polo) if polo is not None else E) - S
    pol = ref - d * ref.dot(d)
    if pol.length < 1e-6:
        return
    pol.normalize()
    cos_a = (a_ * a_ + L * L - b_ * b_) / (2 * a_ * L)
    sin_a = max(0.0, 1 - cos_a * cos_a) ** 0.5
    E2 = S + d * (a_ * cos_a) + pol * (a_ * sin_a)
    R = mw.to_quaternion()

    def gira_q(pb, q_mundo):
        qa = R.inverted() @ q_mundo @ R
        h = pb.head.copy()
        pb.matrix = Matrix.Translation(h) @ qa.to_matrix().to_4x4() @ Matrix.Translation(-h) @ pb.matrix

    gira_q(p1, (E - S).rotation_difference(E2 - S))
    bpy.context.view_layer.update()
    E1, W1 = mw @ p2.head, mw @ p3.head
    gira_q(p2, (W1 - E1).rotation_difference(S + d * L - E1))
    bpy.context.view_layer.update()
    p3.matrix = Matrix.Translation(p3.head) @ (R.inverted() @ rot3).to_matrix().to_4x4()
    bpy.context.view_layer.update()


def mao(lado, alvo, polo=None, rot=None):
    ik((lado + "Arm", lado + "ForeArm", lado + "Hand"), alvo, polo, rot)


def perna(lado, alvo, polo=None, rot=None):
    ik((lado + "UpLeg", lado + "Leg", lado + "Foot"), alvo, polo, rot)


def rot_mundo(nb):
    return (mw @ PB[nb].matrix).to_quaternion()


def mistura(p0, p1, w):
    return Vector(p0).lerp(Vector(p1), max(0.0, min(1.0, w)))


def suave(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def envelope(t, dur, entra=0.5, sai=0.5):
    return suave(t / entra) * suave((dur - t) / sai)


def inclina(graus_tronco, graus_peito=None, graus_pescoco=0.0, graus_cabeca=0.0):
    """Inclina para a frente (positivo) ou para trás: coluna, peito, pescoço, cabeça."""
    _, esq, _ = eixos()
    gira("Spine", esq, graus_tronco)
    if graus_peito:
        gira("Spine1", esq, graus_peito)
    if graus_pescoco:
        gira("Neck", esq, graus_pescoco)
    if graus_cabeca:
        gira("Head", esq, graus_cabeca)


def vira(graus, osso="Spine"):
    gira(osso, UP, graus)


# boca no espaço do osso da cabeça (do rosto neutro: o ponto mais baixo e mais à frente)
arm.animation_data.action = None
for pb in PB:
    pb.matrix_basis.identity()
bpy.context.view_layer.update()
_r = bpy.data.objects.get(CORPO + "_rosto_neutro")
if _r is not None:
    R_ = np.array([_r.matrix_world @ v.co for v in _r.data.vertices])
    z_b = R_[:, 2].min()
    boca = R_[R_[:, 2] < z_b + 0.25 * (R_[:, 2].max() - z_b)]
    BOCA = (mw @ PB["Head"].matrix).inverted() @ Vector((float(boca[:, 0].mean()), float(boca[:, 1].min()), float(boca[:, 2].mean())))
else:
    BOCA = Vector((0, 0, 0))


# palma no espaço do osso da mão (no repouso, braços para baixo, a palma olha para a coxa: para dentro do corpo)
PALMA = {}
for _l in ("Left", "Right"):
    _M = (mw @ PB[_l + "Hand"].matrix).to_3x3()
    _eixo = _M.col[1].normalized()
    _dentro = Vector((-1 if (mw @ PB[_l + "Hand"].head).x > (mw @ PB["Hips"].head).x else 1, 0, 0))
    PALMA[_l] = (_M.inverted() @ (_dentro - _eixo * _dentro.dot(_eixo)).normalized()).normalized()


def rot_palma(lado, palma, dedos):
    """Orientação da mão no mundo: palma virada para 'palma' e dedos na direção 'dedos'."""
    n = Vector(palma).normalized()
    f = Vector(dedos) - n * Vector(dedos).dot(n)
    f.normalize()
    yl = Vector((0, 1, 0))
    pl = (PALMA[lado] - yl * PALMA[lado].dot(yl)).normalized()
    A = Matrix((yl, pl, yl.cross(pl))).transposed()
    B = Matrix((f, n, f.cross(n))).transposed()
    return (B @ A.transposed()).to_quaternion()


def boca_mundo():
    return (mw @ PB["Head"].matrix) @ BOCA


# ---------------------------------------------------------------- gravação
def grava(nome, quadros, meta):
    if nome in bpy.data.actions:  # refazer substitui a versão anterior (sem criar "nome.001")
        bpy.data.actions.remove(bpy.data.actions[nome])
    act = bpy.data.actions.new(nome)
    act.use_fake_user = True
    arm.animation_data.action = act
    n = len(quadros)
    for pb in PB:
        pb.rotation_mode = "QUATERNION"
        rots, locs, prev = [], [], None
        for d in quadros:
            loc, q, _ = d[pb.name].decompose()
            if prev is not None and prev.dot(q) < 0:
                q = -q
            prev = q
            rots.append(q)
            locs.append(loc)
        canais = [("rotation_quaternion", 4, rots)] + ([("location", 3, locs)] if pb.name == "Hips" else [])
        for caminho, dim, vals in canais:
            for i in range(dim):
                fc = act.fcurve_ensure_for_datablock(arm, f'pose.bones["{pb.name}"].{caminho}', index=i, group_name=pb.name)
                fc.keyframe_points.add(n)
                co = []
                for k, v in enumerate(vals):
                    co += [k + 1, v[i]]
                fc.keyframe_points.foreach_set("co", co)
                fc.keyframe_points.foreach_set("interpolation", [1] * n)
                fc.update()
    act["composta"] = meta
    act["in_place"] = True
    arm.animation_data.action = None
    print("composta", CORPO, nome, n, flush=True)


APO = {}  # o que a cena de teste precisa para cada ação composta (bancada, mesa, objeto entre as mãos, cabo)


def tres(p):
    """Ponto do Blender → coordenadas da página (x, altura, frente)."""
    return [round(p.x, 3), round(p.z, 3), round(-p.y, 3)]


def compor(nome, segundos, passo, meta, apoio=None):
    n = int(round(segundos * FPS))
    quadros = []
    for i in range(n):
        for pb in PB:
            pb.matrix_basis.identity()
        passo(i, i / FPS)
        bpy.context.view_layer.update()
        if i == 0 and apoio is not None:
            APO[nome] = apoio()
        quadros.append({pb.name: pb.matrix_basis.copy() for pb in PB})
    grava(nome, quadros, meta)


def duracao(nome):
    return len(amostra(nome)) / FPS


# ---------------------------------------------------------------- receitas
R = {}


def receita(id_, grupos):
    def deco(f):
        R[id_] = (grupos, f)
        return f
    return deco


SENTADO, PARADO = "resident.sit.chair.idle", "resident.idle.neutral"


@receita("sit.sofa.relaxed", "AD ID TE CR")
def _sofa():
    def passo(i, t):
        pose((quadro(SENTADO, i), None))
        inclina(-13, -6, 9, 5)  # recosta e o pescoço compensa para olhar para a frente
        frente, esq, C = eixos()
        q = W("Hips")
        for lado, s in (("Left", 1), ("Right", -1)):  # braços largados no braço do sofá
            alvo = q + esq * s * 0.27 * K + frente * 0.06 * K + UP * (0.09 * K + 0.004 * math.sin(t * 1.3 + s))
            mao(lado, alvo, W(lado + "Arm") + esq * s * 0.4 * K - frente * 0.2 * K - UP * 0.2 * K)
    compor("resident.sit.sofa.relaxed", 8.0, passo, "sentado na cadeira + recostado + braços no braço do sofá")


@receita("sit.floor.crossed", "AD TE CR PQ")
def _chao_cruzado():
    def passo(i, t):
        pose((quadro(SENTADO, i), None))
        frente, esq, C = eixos()
        # desce o quadril até o bumbum encostar no chão
        quad = (W("LeftUpLeg") + W("RightUpLeg")) / 2
        move("Hips", (0, 0, 0.1 * K - quad.z))
        q = W("Hips")
        for lado, s in (("Left", 1), ("Right", -1)):
            # o pé vai para baixo do joelho do outro lado; o joelho abre para fora
            pe = q - esq * s * 0.13 * K + frente * (0.22 + (0.08 if lado == "Right" else 0.0)) * K
            pe.z = 0.065 * K
            joelho = q + esq * s * 0.5 * K + frente * 0.25 * K + UP * 0.12 * K
            perna(lado, pe, joelho)
            # o pé fica deitado de lado, apontando para dentro
            pf = PB[lado + "Foot"]
            d_ = (-esq * s * 0.85 + frente * 0.35 - UP * 0.2).normalized()
            h, t_ = mw @ pf.head, mw @ pf.tail
            qd = (t_ - h).rotation_difference(d_)
            Rm = mw.to_quaternion()
            pf.matrix = Matrix.Translation(pf.head) @ (Rm.inverted() @ qd @ Rm).to_matrix().to_4x4() @ Matrix.Translation(-pf.head) @ pf.matrix
            bpy.context.view_layer.update()
        for lado, s in (("Left", 1), ("Right", -1)):  # mãos nos joelhos
            jo = W(lado + "Leg") + UP * 0.05 * K - frente * 0.02 * K
            mao(lado, jo, W(lado + "Arm") + esq * s * 0.4 * K - UP * 0.2 * K)
    compor("resident.sit.floor.crossed", 8.0, passo, "sentado no chão, pernas cruzadas (IK), tronco da cadeira")


@receita("sleep.exit", "AD ID TE CR PQ")
def _sai_cama():
    s = amostra("resident.lie.enter")

    def passo(i, t):
        pose((s[len(s) - 1 - i], None))  # deitar tocado ao contrário
    compor("resident.sleep.exit", len(s) / FPS, passo, "deitando na cama, de trás para a frente")


@receita("drink.sit", "AD ID TE CR")
def _bebe_sentado():
    def passo(i, t):
        pose((quadro(SENTADO, i), None), (quadro("resident.drink.stand", i, False), cima_de()))
    compor("resident.drink.sit", duracao("resident.drink.stand"), passo, "pernas e quadril sentado + bebendo de pé")


@receita("eat.sit", "AD ID TE CR PQ")
def _come_sentado():
    ciclo = 2.6

    def passo(i, t):
        pose((quadro(SENTADO, i), None))
        inclina(7, 3)
        frente, esq, C = eixos()
        q = W("Hips")
        mesa = q.z + 0.2 * K
        prato = q + frente * 0.36 * K - esq * 0.07 * K
        prato.z = mesa + 0.04 * K
        u = (t % ciclo) / ciclo  # 0–0,3 sobe, 0,3–0,45 na boca, 0,45–0,8 desce, resto no prato
        w = suave(u / 0.3) if u < 0.3 else 1.0 if u < 0.45 else 1 - suave((u - 0.45) / 0.35) if u < 0.8 else 0.0
        if 0.3 <= u < 0.45:
            gira("Head", esq, 4 * math.sin((u - 0.3) / 0.15 * math.pi))  # a cabeça vem um pouco ao encontro
        b = boca_mundo() + frente * 0.035 * K - esq * 0.01 * K
        mao("Right", mistura(prato, b, w), W("RightArm") - esq * 0.35 * K - UP * 0.3 * K)
        apoio = q + frente * 0.34 * K + esq * 0.13 * K
        apoio.z = mesa + 0.02 * K
        mao("Left", apoio, W("LeftArm") + esq * 0.35 * K - UP * 0.3 * K)
    compor("resident.eat.sit", ciclo * 4, passo, "sentado + mão do prato à boca (IK), outra mão na mesa",
           lambda: {"mesa": (lambda f, q: {"topo": round(q.z + 0.2 * K, 3), "frente": round(-(q + f * 0.14 * K).y, 3),
                                           "x": round(q.x, 3)})(eixos()[0], W("Hips"))})


@receita("wash", "AD ID TE CR PQ")
def _lava():
    dur = 8.0

    def passo(i, t):
        pose((quadro(PARADO, i), None))
        inclina(17, 5, -4)
        frente, esq, C = eixos()
        q = W("Hips")
        pia = q + frente * 0.3 * K
        pia.z = q.z + 0.1 * K
        rosto = boca_mundo() + frente * 0.05 * K + UP * 0.03 * K
        u = t % 4.0  # a cada 4 s, joga água no rosto por 1,2 s
        w = suave((u - 2.4) / 0.35) * suave((3.6 - u) / 0.35) if 2.4 <= u <= 3.6 else 0.0
        for lado, s, fase in (("Left", 1, 0.0), ("Right", -1, math.pi)):
            esfrega = pia + esq * s * 0.035 * K + (esq * math.cos(t * 9 + fase) + UP * math.sin(t * 9 + fase)) * 0.025 * K
            alvo = mistura(esfrega, rosto + esq * s * 0.045 * K, w)
            mao(lado, alvo, W(lado + "Arm") + esq * s * 0.4 * K - UP * 0.25 * K)
    compor("resident.wash", dur, passo, "parado inclinado na pia + mãos esfregando (IK) + água no rosto",
           lambda: (lambda f, e, q: {"tipo": "pia", "topo": round(q.z + (0.05) * K, 3), "frente": round(-(q + f * 0.14 * K).y, 3), "x": round(q.x, 3), "largura": round(1.1 * K, 3)})(*eixos()[:2], W("Hips")))


@receita("carry.box.walk", "AD TE CR")
def _caixa_andando():
    for base, nome in (("resident.walk.normal", "resident.carry.box.walk"), ("resident.walk.normal.rm", "resident.carry.box.walk.rm")):
        if not existe(base):
            continue

        def passo(i, t, base=base):
            pose((quadro(base, i), None))
            inclina(-3)  # o peso da caixa leva o tronco um pouco para trás
            frente, esq, C = eixos()
            caixa = C + frente * 0.3 * K - UP * 0.24 * K
            for lado, s in (("Left", 1), ("Right", -1)):  # mãos nas laterais da caixa
                mao(lado, caixa + esq * s * 0.17 * K, W(lado + "Arm") + esq * s * 0.4 * K - UP * 0.35 * K)
        compor(nome, duracao(base), passo, "andando + mãos nas laterais de uma caixa à frente (IK)",
               lambda: {"tipo": "entre_maos", "objeto": "caixa", "tam": [round(0.3 * K, 3), round(0.26 * K, 3), round(0.3 * K, 3)]})


@receita("hug", "AD ID TE CR PQ")
def _abraco():
    dur = 4.5

    def passo(i, t):
        pose((quadro(PARADO, i), None))
        w = envelope(t, dur, 0.6, 0.6)
        vira(3 * math.sin(t * 1.6) * w)
        inclina(4 * w)
        frente, esq, C = eixos()
        for lado, s, dz, dl in (("Left", 1, -0.1, -0.07), ("Right", -1, -0.19, 0.05)):
            # as mãos vão às costas de quem está à frente, uma mais alta, cruzando
            costas = C + frente * 0.31 * K + esq * dl * K + UP * dz * K
            base = W(lado + "Hand")
            mao(lado, mistura(base, costas, w), W(lado + "Arm") + esq * s * 0.4 * K + frente * 0.12 * K - UP * 0.08 * K)
    compor("resident.hug", dur, passo, "parado + braços envolvendo alguém à frente (IK), entra e sai")


def _berco(t, balanca):
    """Bebê deitado na frente do peito: a mão esquerda por baixo da cabecinha e do pescoço, a direita por baixo do
    corpinho; palmas para cima, antebraços na horizontal."""
    pose((quadro(PARADO, int(t * FPS)), None))
    if balanca:
        frente, esq, C = eixos()
        move("Hips", esq * 0.03 * K * math.sin(t * 2 * math.pi / 1.6) + UP * 0.006 * K * math.sin(t * 4 * math.pi / 1.6))
        vira(6 * math.sin(t * 2 * math.pi / 1.6))
    inclina(2, 2, 8, 12)  # olha para o bebê
    frente, esq, C = eixos()
    berco = W("Hips") + UP * 0.3 * K + frente * 0.24 * K  # onde fica o meio do bebê (as costas dele sobre as palmas)
    cabeca = berco + esq * 0.16 * K
    corpo_b = berco - esq * 0.13 * K
    mao("Left", cabeca - frente * 0.03 * K, W("LeftArm") + esq * 0.5 * K - UP * 0.15 * K - frente * 0.05 * K,
        rot_palma("Left", UP, -esq * 0.2 + frente * 1.0))
    mao("Right", corpo_b - frente * 0.01 * K, W("RightArm") - esq * 0.5 * K - UP * 0.2 * K - frente * 0.05 * K,
        rot_palma("Right", UP, esq * 0.45 + frente * 0.9))


@receita("care.hold_idle", "AD ID TE")
def _segura():
    compor("resident.care.hold_idle", 6.0, lambda i, t: _berco(t, False), "parado + braços em berço (IK)",
           lambda: {"tipo": "entre_maos", "objeto": "bebe", "tam": [round(0.45 * K, 3), round(0.13 * K, 3), round(0.14 * K, 3)]})


@receita("care.rock", "AD ID TE")
def _nina():
    compor("resident.care.rock", 6.4, lambda i, t: _berco(t, True), "braços em berço + balanço de lado",
           lambda: {"tipo": "entre_maos", "objeto": "bebe", "tam": [round(0.45 * K, 3), round(0.13 * K, 3), round(0.14 * K, 3)]})


@receita("baby.cry_sit", "BB")
def _bebe_chora_sentado():
    def passo(i, t):
        pose((quadro("resident.baby.sit", i), None), (quadro("resident.baby.cry", i, False), cima_de()))
    compor("resident.baby.cry_sit", duracao("resident.baby.cry"), passo, "sentado no chão + tronco e braços chorando")


@receita("romance.dance_slow", "AD ID")
def _danca_lenta():
    per = 2.4

    def passo(i, t):
        pose((quadro(PARADO, i), None))
        frente, esq, C = eixos()
        pes = {l: (W(l + "Foot"), rot_mundo(l + "Foot")) for l in ("Left", "Right")}
        move("Hips", esq * 0.04 * K * math.sin(t * 2 * math.pi / per) - UP * 0.012 * K * (1 + math.cos(t * 4 * math.pi / per)) / 2)
        for l, (p, r) in pes.items():
            s = 1 if l == "Left" else -1
            perna(l, p, W(l + "UpLeg") + frente * 0.5 * K + esq * s * 0.05 * K, r)
        vira(-5 * math.sin(t * 2 * math.pi / per))
        frente, esq, C = eixos()
        mao("Left", C + frente * 0.28 * K + esq * 0.13 * K - UP * 0.01 * K, W("LeftArm") + esq * 0.4 * K - UP * 0.25 * K)  # no ombro
        mao("Right", C + frente * 0.26 * K - esq * 0.15 * K - UP * 0.3 * K, W("RightArm") - esq * 0.4 * K - UP * 0.2 * K)  # na cintura
    compor("resident.romance.dance_slow", per * 4, passo, "parado + mãos no par (IK) + balanço com os pés no lugar")


def _abre_maos(dist, sobe=0.0):
    """Afasta as mãos (livro, tablet) e sobe para a altura do peito."""
    frente, esq, C = eixos()
    for lado, s in (("Left", 1), ("Right", -1)):
        mao(lado, W(lado + "Hand") + esq * s * dist * K + UP * sobe * K - frente * 0.4 * sobe * K)


@receita("device.use", "AD ID TE")
def _tablet():
    def passo(i, t):
        pose((quadro("resident.text", i), None))
        _abre_maos(0.06, 0.05)
    compor("resident.device.use", duracao("resident.text"), passo, "mexendo no celular + mãos afastadas (tablet)",
           lambda: {"tipo": "entre_maos", "objeto": "tablet", "tam": [round(0.22 * K, 3), round(0.012, 3), round(0.16 * K, 3)]})


def _pagina(t):
    """A cada 4 s, a mão direita vai até a esquerda e volta (vira a página)."""
    u = t % 4.0
    if 2.8 <= u <= 3.8:
        w = math.sin((u - 2.8) / 1.0 * math.pi)
        frente, esq, C = eixos()
        alvo = W("LeftHand") - esq * 0.02 * K + UP * 0.05 * K * w
        mao("Right", mistura(W("RightHand"), alvo, w * 0.9))


def _segura_livro():
    """Sem o clipe do celular: cabeça baixa e as mãos segurando o livro na frente do peito (IK)."""
    inclina(4, 0, 10, 16)
    frente, esq, C = eixos()
    livro = C + frente * 0.24 * K - UP * 0.26 * K
    for lado, s in (("Left", 1), ("Right", -1)):
        mao(lado, livro + esq * s * 0.1 * K, W(lado + "Arm") + esq * s * 0.35 * K - UP * 0.35 * K)


@receita("read.sit", "AD ID TE CR")
def _le_sentado():
    tem_celular = existe("resident.text")

    def passo(i, t):
        if tem_celular:
            pose((quadro(SENTADO, i), None), (quadro("resident.text", i), cima_de()))
            _abre_maos(0.07, 0.1)
        else:
            pose((quadro(SENTADO, i), None))
            _segura_livro()
        _pagina(t)
    compor("resident.read.sit", 8.0, passo, "sentado + tronco e braços do celular, mãos afastadas (livro) + vira página",
           lambda: {"tipo": "entre_maos", "objeto": "livro", "tam": [round(0.26 * K, 3), round(0.025 * K, 3), round(0.19 * K, 3)]})


@receita("read.stand", "AD ID TE")
def _le_de_pe():
    def passo(i, t):
        pose((quadro("resident.text", i), None))
        _abre_maos(0.07, 0.1)
        _pagina(t)
    compor("resident.read.stand", 8.0, passo, "celular de pé + mãos afastadas (livro) + vira página",
           lambda: {"tipo": "entre_maos", "objeto": "livro", "tam": [round(0.26 * K, 3), round(0.025 * K, 3), round(0.19 * K, 3)]})


@receita("present", "AD ID")
def _apresenta():
    base = "resident.talk.b"
    dur = max(duracao(base), 6.0)

    def passo(i, t):
        pose((quadro(base, i), None))
        vira(13 * math.sin(t * 2 * math.pi / dur))
        vira(6 * math.sin(t * 2 * math.pi / dur), "Neck")
    compor("resident.present", dur, passo, "explicando com as duas mãos + tronco e olhar varrendo o grupo")


def _bancada(i, t, frente_inc=10):
    pose((quadro(PARADO, i), None))
    inclina(frente_inc, 3, 0, 8)
    frente, esq, C = eixos()
    return frente, esq, W("Hips")


@receita("kitchen.stir", "AD ID TE")
def _mexe_panela():
    def passo(i, t):
        frente, esq, q = _bancada(i, t, 8)
        panela = q + frente * 0.3 * K - esq * 0.05 * K + UP * 0.22 * K
        ang = t * 2 * math.pi / 1.6
        mao("Right", panela + (esq * math.cos(ang) + frente * math.sin(ang)) * 0.05 * K, W("RightArm") - esq * 0.4 * K - UP * 0.3 * K)
        mao("Left", q + frente * 0.28 * K + esq * 0.18 * K + UP * 0.16 * K, W("LeftArm") + esq * 0.4 * K - UP * 0.3 * K)
    compor("resident.kitchen.stir", 6.4, passo, "parado na bancada + mão mexendo em círculo (IK), outra no cabo",
           lambda: (lambda f, e, q: {"tipo": "bancada", "topo": round(q.z + (0.11) * K, 3), "frente": round(-(q + f * 0.17 * K).y, 3), "x": round(q.x, 3), "largura": round(1.1 * K, 3)})(*eixos()[:2], W("Hips")))


@receita("kitchen.chop", "AD ID TE")
def _pica():
    def passo(i, t):
        frente, esq, q = _bancada(i, t, 12)
        tabua = q + frente * 0.29 * K + UP * 0.13 * K
        corte = abs(math.sin(t * math.pi / 0.5))
        avanco = (t % 2.0) / 2.0
        mao("Right", tabua - esq * (0.1 - 0.05 * avanco) * K + UP * (0.03 + 0.07 * corte) * K, W("RightArm") - esq * 0.4 * K - UP * 0.3 * K)
        mao("Left", tabua + esq * (0.08 - 0.05 * avanco) * K + UP * 0.03 * K, W("LeftArm") + esq * 0.4 * K - UP * 0.3 * K)
    compor("resident.kitchen.chop", 4.0, passo, "parado na bancada + faca subindo e descendo (IK), outra mão segurando",
           lambda: (lambda f, e, q: {"tipo": "bancada", "topo": round(q.z + (0.11) * K, 3), "frente": round(-(q + f * 0.15 * K).y, 3), "x": round(q.x, 3), "largura": round(1.1 * K, 3)})(*eixos()[:2], W("Hips")))


def _cabo(t, per, lateral, frente_amp, inc):
    """Vassoura ou rodo: mão esquerda em cima, direita embaixo, no mesmo cabo."""
    frente, esq, q = _bancada(int(t * FPS), t, inc)
    ang = t * 2 * math.pi / per
    vira(8 * math.sin(ang) * lateral / 0.18)
    frente, esq, C = eixos()
    baixo = q + frente * (0.34 + frente_amp * math.sin(ang * 2 if lateral else ang)) * K - esq * (0.04 - lateral * math.sin(ang)) * K + UP * 0.08 * K
    cima = C + frente * 0.2 * K + esq * 0.02 * K - UP * 0.17 * K + (baixo - q) * 0.35
    mao("Right", baixo, W("RightArm") - esq * 0.4 * K - UP * 0.2 * K)
    mao("Left", cima, W("LeftArm") + esq * 0.4 * K - UP * 0.3 * K)


@receita("clean.sweep", "AD ID TE CR")
def _varre():
    compor("resident.clean.sweep", 6.4, lambda i, t: _cabo(t, 1.6, 0.18, 0.0, 10), "segurando o cabo (IK) + varrendo de lado",
           lambda: {"tipo": "cabo", "objeto": "vassoura"})


@receita("clean.mop", "AD ID TE")
def _passa_pano():
    compor("resident.clean.mop", 6.4, lambda i, t: _cabo(t, 2.0, 0.12, 0.12, 15), "segurando o cabo (IK) + rodo para a frente e de lado",
           lambda: {"tipo": "cabo", "objeto": "rodo"})


@receita("clean.wipe", "AD ID TE CR")
def _limpa_mesa():
    def passo(i, t):
        frente, esq, q = _bancada(i, t, 24)
        mesa = q + frente * 0.4 * K - UP * 0.09 * K
        ang = t * 2 * math.pi / 1.2
        mao("Right", mesa - esq * 0.05 * K + (esq * math.cos(ang) + frente * math.sin(ang)) * 0.1 * K, W("RightArm") - esq * 0.4 * K - UP * 0.2 * K)
        mao("Left", mesa + esq * 0.22 * K - frente * 0.04 * K, W("LeftArm") + esq * 0.4 * K - UP * 0.2 * K)
    compor("resident.clean.wipe", 4.8, passo, "inclinado na mesa + pano em círculo (IK), outra mão apoiada",
           lambda: (lambda f, e, q: {"tipo": "bancada", "topo": round(q.z + (-0.1) * K, 3), "frente": round(-(q + f * 0.2 * K).y, 3), "x": round(q.x, 3), "largura": round(1.1 * K, 3)})(*eixos()[:2], W("Hips")))


@receita("clean.vacuum", "AD ID TE")
def _aspira():
    per = 2.0

    def passo(i, t):
        pose((quadro(PARADO, i), None))
        frente, esq, C = eixos()
        ang = t * 2 * math.pi / per
        pes = {l: (W(l + "Foot"), rot_mundo(l + "Foot")) for l in ("Left", "Right")}
        move("Hips", frente * 0.05 * K * math.sin(ang) - UP * 0.02 * K * (1 + math.sin(ang)) / 2)
        for l, (p, r) in pes.items():
            perna(l, p, W(l + "UpLeg") + frente * 0.5 * K, r)
        inclina(10 + 5 * math.sin(ang), 3)
        frente, esq, C = eixos()
        q = W("Hips")
        mao("Right", q + frente * (0.28 + 0.14 * math.sin(ang)) * K - esq * 0.1 * K + UP * 0.1 * K, W("RightArm") - esq * 0.4 * K - UP * 0.2 * K)
    compor("resident.clean.vacuum", per * 3, passo, "parado + empurra e puxa o aspirador (IK), peso indo e voltando",
           lambda: {"tipo": "cabo", "objeto": "aspirador"})


@receita("laundry.fold", "AD ID TE")
def _dobra():
    ciclo = 3.2

    def passo(i, t):
        frente, esq, q = _bancada(i, t, 15)
        mesa = q + frente * 0.32 * K - UP * 0.02 * K
        u = (t % ciclo) / ciclo
        if u < 0.25:  # pega as pontas e levanta
            s_, z_ = 0.25, 0.2 * suave(u / 0.25)
        elif u < 0.5:  # junta as mãos (dobra ao meio)
            s_, z_ = 0.25 - 0.22 * suave((u - 0.25) / 0.25), 0.2 - 0.05 * suave((u - 0.25) / 0.25)
        elif u < 0.75:  # desce até a mesa
            s_, z_ = 0.03, 0.15 - 0.12 * suave((u - 0.5) / 0.25)
        else:  # alisa e volta as mãos para as pontas
            s_, z_ = 0.03 + 0.22 * suave((u - 0.75) / 0.25), 0.03
        for lado, s in (("Left", 1), ("Right", -1)):
            mao(lado, mesa + esq * s * s_ * K + UP * z_ * K, W(lado + "Arm") + esq * s * 0.4 * K - UP * 0.3 * K)
    compor("resident.laundry.fold", ciclo * 2, passo, "parado na mesa + pega, dobra e alisa a roupa (IK)",
           lambda: (lambda f, e, q: {"tipo": "bancada", "topo": round(q.z + (-0.03) * K, 3), "frente": round(-(q + f * 0.17 * K).y, 3), "x": round(q.x, 3), "largura": round(1.1 * K, 3)})(*eixos()[:2], W("Hips")))


# ---------------------------------------------------------------- roda as receitas deste corpo
antes = set(bpy.data.actions)
feitos = []
for id_, (grupos, f) in R.items():
    if GRUPO not in grupos.split() or (SO and id_ not in SO):
        continue
    try:
        f()
        feitos.append(id_)
    except KeyError as e:
        print("faltou base", CORPO, id_, e, flush=True)
novas = [x for x in bpy.data.actions if x not in antes]
for x in list(bpy.data.actions):
    if x not in novas:
        bpy.data.actions.remove(x)
for pb in PB:
    pb.matrix_basis.identity()
arm.animation_data.action = None
bpy.ops.wm.save_as_mainfile(filepath=SAIDA, compress=True)
json.dump(APO, open(SAIDA[:-6] + "_apoios.json", "w"), ensure_ascii=False, indent=1)
print("fim", CORPO, len(novas), feitos)
