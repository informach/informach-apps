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
    cotovelo/joelho aponta. Sem rot_ponta, a ponta acompanha o osso de cima (a mão segue o antebraço, sem torcer no
    pulso); com rot_ponta, recebe essa orientação no mundo."""
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
    if rot_ponta is not None:
        p3.matrix = Matrix.Translation(p3.head) @ (R.inverted() @ rot3).to_matrix().to_4x4()
        bpy.context.view_layer.update()


def mao(lado, alvo, polo=None, rot=None):
    ik((lado + "Arm", lado + "ForeArm", lado + "Hand"), alvo, polo, rot)


def rola(lado, palma_alvo, limite=25.0):
    """Gira o antebraço sobre o próprio eixo até a palma ficar o mais perto de 'palma_alvo' (mundo). É o giro natural
    do antebraço; a mão continua alinhada a ele (não torce no pulso)."""
    fa = PB[lado + "ForeArm"]
    eixo = ((mw @ fa.tail) - (mw @ fa.head)).normalized()
    palma = (rot_mundo(lado + "Hand").to_matrix() @ PALMA[lado]).normalized()
    alvo_ = Vector(palma_alvo).normalized()
    p1, p2 = palma - eixo * palma.dot(eixo), alvo_ - eixo * alvo_.dot(eixo)
    if p1.length < 1e-4 or p2.length < 1e-4:
        return
    p1.normalize()
    p2.normalize()
    ang = math.degrees(math.atan2(eixo.dot(p1.cross(p2)), p1.dot(p2)))
    # o esqueleto não tem osso de torção: giro grande torce a malha do antebraço, então fica limitado
    gira(lado + "ForeArm", eixo, max(-limite, min(limite, ang)), mw @ fa.head)


def pulso_neutro(lado):
    """A mão volta ao pulso neutro (o do parado), alinhada ao antebraço: sem a dobra que o clipe de base tinha."""
    PB[lado + "Hand"].matrix_basis = quadro(PARADO, 0)[lado + "Hand"].copy()
    bpy.context.view_layer.update()


def perna(lado, alvo, polo=None, rot=None):
    # o pé mantém a orientação no mundo (fica plantado), a não ser que se peça outra
    ik((lado + "UpLeg", lado + "Leg", lado + "Foot"), alvo, polo, rot if rot is not None else rot_mundo(lado + "Foot"))


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


OLHO = {}
if _r is not None:
    _zs, _zb = R_[:, 2].max(), R_[:, 2].min()
    _zo = _zb + 0.62 * (_zs - _zb)
    _fx = R_[np.abs(R_[:, 2] - _zo) < 0.15 * (_zs - _zb)]
    for _l, _sx in (("Left", 1), ("Right", -1)):
        _lp = _fx[(_fx[:, 0] - R_[:, 0].mean()) * _sx > 0]
        if len(_lp):
            OLHO[_l] = (mw @ PB["Head"].matrix).inverted() @ Vector((float(np.median(_lp[:, 0])), float(_lp[:, 1].min()), float(_zo)))


# poses de dedos por pegada: (graus no 1º e no 2º segmento) dos quatro dedos, e do polegar
PEGADAS = {
    "punho": ((62, 80), (28, 34)),    # fecha em volta de um cabo (vassoura, rodo, faca, cabo da panela)
    "pinca": ((40, 48), (22, 28)),    # colher, garfo, caneta
    "apoio": ((18, 22), (8, 10)),     # livro, tablet, apoiando sem apertar
    "concha": ((14, 18), (6, 8)),     # caixa, bebê, costas do par: acompanha a forma
    "aberta": ((3, 4), (0, 0)),       # pano, tábua, empurrar: mão estendida
}
DEDOS = ("Index", "Middle", "Ring", "Pinky")


def dedos(lado, pegada, w=1.0):
    """Dobra os dedos em direção à palma (a pose de pegada sobre a pose atual), na proporção w."""
    if w <= 1e-3 or pegada not in PEGADAS:
        return
    (g1, g2), (p1, p2) = PEGADAS[pegada]
    palma = (rot_mundo(lado + "Hand").to_matrix() @ PALMA[lado]).normalized()
    for dedo, (a1, a2) in [(d_, (g1 + 4 * k_, g2 + 3 * k_)) for k_, d_ in enumerate(DEDOS)] + [("Thumb", (p1, p2))]:
        for seg, ang in ((1, a1), (2, a2)):
            nb = f"{lado}Hand{dedo}{seg}"
            if nb not in PB or ang == 0:
                continue
            pb = PB[nb]
            base, ponta = mw @ pb.head, mw @ pb.tail
            eixo = (ponta - base).cross(palma)
            if eixo.length < 1e-6:
                continue
            eixo.normalize()
            gira(nb, eixo, ang * w, base)
            if ((mw @ pb.tail) - ponta).dot(palma) < 0:  # foi para o lado das costas da mão: inverte
                gira(nb, eixo, -2 * ang * w, base)


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
        prato.z = mesa + 0.07 * K
        u = (t % ciclo) / ciclo  # 0–0,3 sobe, 0,3–0,45 na boca, 0,45–0,8 desce, resto no prato
        w = suave(u / 0.3) if u < 0.3 else 1.0 if u < 0.45 else 1 - suave((u - 0.45) / 0.35) if u < 0.8 else 0.0
        if 0.3 <= u < 0.45:
            gira("Head", esq, 4 * math.sin((u - 0.3) / 0.15 * math.pi))  # a cabeça vem um pouco ao encontro
        b = boca_mundo() + frente * 0.035 * K - esq * 0.01 * K
        mao("Right", mistura(prato, b, w), W("RightArm") - esq * 0.35 * K - UP * 0.3 * K)
        dedos("Right", "pinca")  # o garfo
        apoio = q + frente * 0.34 * K + esq * 0.13 * K
        apoio.z = mesa + 0.035 * K
        mao("Left", apoio, W("LeftArm") + esq * 0.35 * K - UP * 0.3 * K, rot_palma("Left", -UP, frente))
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
            for lado, s in (("Left", 1), ("Right", -1)):  # mãos nas laterais da caixa, palmas para dentro
                mao(lado, caixa + esq * s * 0.18 * K - frente * 0.04 * K, W(lado + "Arm") + esq * s * 0.4 * K - UP * 0.35 * K,
                    rot_palma(lado, -esq * s, frente * 0.8 - UP * 0.2))
                dedos(lado, "concha")
        compor(nome, duracao(base), passo, "andando + mãos nas laterais de uma caixa à frente (IK)",
               lambda: {"tipo": "entre_maos", "objeto": "caixa", "tam": [round(0.3 * K, 3), round(0.26 * K, 3), round(0.3 * K, 3)]})


@receita("hug", "AD ID TE CR PQ")
def _abraco():
    dur = 4.5

    def passo(i, t):
        pose((quadro(PARADO, i), None))
        w = envelope(t, dur, 0.6, 0.6)
        vira(3 * math.sin(t * 1.6) * w)
        inclina(9 * w, 3 * w)
        frente, esq, C = eixos()
        for lado, s, dz, dl in (("Left", 1, -0.1, -0.07), ("Right", -1, -0.19, 0.05)):
            # as mãos vão às costas de quem está à frente, uma mais alta, cruzando
            costas = C + frente * 0.31 * K + esq * dl * K + UP * dz * K
            base = W(lado + "Hand")
            mao(lado, mistura(base, costas, w), W(lado + "Arm") + esq * s * 0.4 * K + frente * 0.12 * K - UP * 0.08 * K)
            dedos(lado, "concha", w)
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
    dedos("Left", "concha")
    dedos("Right", "concha")


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
        inclina(6, 2)
        frente, esq, C = eixos()
        mao("Left", C + frente * 0.28 * K + esq * 0.13 * K - UP * 0.01 * K, W("LeftArm") + esq * 0.4 * K - UP * 0.25 * K)  # no ombro
        mao("Right", C + frente * 0.26 * K - esq * 0.15 * K - UP * 0.3 * K, W("RightArm") - esq * 0.4 * K - UP * 0.2 * K)  # na cintura
        dedos("Left", "concha")
        dedos("Right", "concha")
    compor("resident.romance.dance_slow", per * 4, passo, "parado + mãos no par (IK) + balanço com os pés no lugar")


def _abre_maos(dist, sobe=0.0, frente_min=0.32):
    """Afasta as mãos (livro, tablet), sobe para a altura do peito e garante o objeto à frente do corpo: a mão fica
    pelo menos 'frente_min' à frente dos ombros (perto demais, o antebraço entrava no peito e na barriga)."""
    frente, esq, C = eixos()
    for lado, s in (("Left", 1), ("Right", -1)):
        alvo = W(lado + "Hand") + esq * s * dist * K + UP * sobe * K
        f = (alvo - C).dot(frente)
        if f < frente_min * K:
            alvo = alvo + frente * (frente_min * K - f)
        mao(lado, alvo)
        dedos(lado, "apoio")


@receita("device.use", "AD ID TE")
def _tablet():
    def passo(i, t):
        pose((quadro("resident.text", i), None))  # o balanço e a cabeça baixa do celular
        _segura_livro(0.32, 0.21, 0.11, inclinar=False)
    compor("resident.device.use", duracao("resident.text"), passo, "corpo do celular + tablet nas duas mãos à frente (IK)",
           lambda: {"tipo": "entre_maos", "objeto": "tablet", "tam": [round(0.22 * K, 3), round(0.012, 3), round(0.16 * K, 3)]})


def _pagina(t):
    """A cada 4 s, a mão direita vai até a esquerda e volta (vira a página)."""
    u = t % 4.0
    if 2.8 <= u <= 3.8:
        w = math.sin((u - 2.8) / 1.0 * math.pi)
        frente, esq, C = eixos()
        alvo = W("LeftHand") - esq * 0.02 * K + UP * 0.05 * K * w
        mao("Right", mistura(W("RightHand"), alvo, w * 0.9))


def _segura_livro(frente_d=0.32, baixo=0.18, larg=0.13, inclinar=True):
    """As duas mãos seguram o livro (ou tablet) na frente do peito, por IK: o objeto fica a 'frente_d' dos ombros
    (perto demais, o antebraço entrava no peito e na barriga), as palmas viradas para o objeto e um pouco para cima
    (girando o antebraço, sem torcer o pulso)."""
    if inclinar:
        inclina(4, 0, 10, 16)
    frente, esq, C = eixos()
    livro = C + frente * frente_d * K - UP * baixo * K
    for lado, s in (("Left", 1), ("Right", -1)):
        pulso_neutro(lado)
        # cotovelo para baixo e pouco aberto: o antebraço aponta para a frente (aberto demais, as mãos se cruzavam)
        mao(lado, livro + esq * s * larg * K, W(lado + "Arm") + esq * s * 0.1 * K - UP * 0.45 * K - frente * 0.05 * K)
        rola(lado, -esq * s + UP * 0.7)
        dedos(lado, "apoio")


@receita("read.sit", "AD ID TE CR")
def _le_sentado():
    tem_celular = existe("resident.text")

    def passo(i, t):
        if tem_celular:
            pose((quadro(SENTADO, i), None), (quadro("resident.text", i), cima_de()))
            _segura_livro(inclinar=False)
        else:
            pose((quadro(SENTADO, i), None))
            _segura_livro()
        _pagina(t)
    compor("resident.read.sit", 8.0, passo, "sentado + tronco do celular + livro nas duas mãos à frente (IK) + vira página",
           lambda: {"tipo": "entre_maos", "objeto": "livro", "tam": [round(0.26 * K, 3), round(0.025 * K, 3), round(0.19 * K, 3)]})


@receita("read.stand", "AD ID TE")
def _le_de_pe():
    def passo(i, t):
        pose((quadro("resident.text", i), None))
        _segura_livro(inclinar=False)
        _pagina(t)
    compor("resident.read.stand", 8.0, passo, "corpo do celular de pé + livro nas duas mãos à frente (IK) + vira página",
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
        dedos("Right", "pinca")  # a colher
        dedos("Left", "punho")  # o cabo da panela
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
        dedos("Right", "punho")  # a faca
        mao("Left", tabua + esq * (0.08 - 0.05 * avanco) * K + UP * 0.035 * K, W("LeftArm") + esq * 0.4 * K - UP * 0.3 * K,
            rot_palma("Left", -UP, frente * 0.7 - esq * 0.3))  # mão aberta, palma para baixo, segurando o que corta
        dedos("Left", "concha")
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
    for lado in ("Left", "Right"):
        pulso_neutro(lado)
    mao("Right", baixo, W("RightArm") - esq * 0.4 * K - UP * 0.2 * K)
    mao("Left", cima, W("LeftArm") + esq * 0.4 * K - UP * 0.3 * K)
    # as palmas viradas para o cabo, que passa pelo meio do corpo (giro do antebraço, não do pulso)
    rola("Left", -esq)
    rola("Right", esq)
    dedos("Right", "punho")
    dedos("Left", "punho")


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
        mao("Right", mesa - esq * 0.05 * K + UP * 0.03 * K + (esq * math.cos(ang) + frente * math.sin(ang)) * 0.1 * K,
            W("RightArm") - esq * 0.4 * K - UP * 0.2 * K, rot_palma("Right", -UP, frente))  # palma para baixo no pano
        dedos("Right", "aberta")
        mao("Left", mesa + esq * 0.22 * K - frente * 0.04 * K + UP * 0.03 * K, W("LeftArm") + esq * 0.4 * K - UP * 0.2 * K,
            rot_palma("Left", -UP, frente))
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
        dedos("Right", "punho")  # o cabo do aspirador
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
            dedos(lado, "pinca" if u < 0.75 else "aberta")
    compor("resident.laundry.fold", ciclo * 2, passo, "parado na mesa + pega, dobra e alisa a roupa (IK)",
           lambda: (lambda f, e, q: {"tipo": "bancada", "topo": round(q.z + (-0.03) * K, 3), "frente": round(-(q + f * 0.17 * K).y, 3), "x": round(q.x, 3), "largura": round(1.1 * K, 3)})(*eixos()[:2], W("Hips")))


# ---------------------------------------------------------------- correções de clipes do Mixamo (refeitos com o mesmo nome)
def _corrige(nome, passo, meta, apoio=None):
    """Refaz um clipe da biblioteca quadro a quadro (a amostra original fica guardada antes de substituir)."""
    s = amostra(nome)
    compor(nome, len(s) / FPS, lambda i, t: passo(s[i], i, t), meta, apoio)


def _junta_rot(lado, q_alvo, w):
    """Gira a mão (no mundo) da orientação atual para q_alvo, na proporção w."""
    pb = PB[lado + "Hand"]
    q0 = rot_mundo(lado + "Hand")
    if q0.dot(q_alvo) < 0:
        q_alvo = -q_alvo
    q = q0.slerp(q_alvo, max(0.0, min(1.0, w)))
    pb.matrix = Matrix.Translation(pb.head) @ (mw.to_quaternion().inverted() @ q).to_matrix().to_4x4()
    bpy.context.view_layer.update()


D_BEIJO = 0.62  # distância entre as duas pessoas na cena (em alturas de 1,75 m), a mesma da página


def _beijo(nome, mais_baixa):
    if not existe(nome):
        return

    def passo(d, i, t):
        pose((d, None))
        frente, esq, C = eixos()
        raiz = W("Hips")
        raiz.z = 0
        par = Vector((0, 0, 0)) + frente * D_BEIJO * K  # a outra pessoa, de frente para esta
        for lado, s in (("Left", 1), ("Right", -1)):
            m = W(lado + "Hand")
            alcance = (m - W(lado + "Arm")).dot(frente)  # quanto a mão está à frente do ombro
            w = suave((alcance - 0.12 * K) / (0.14 * K))
            if mais_baixa:  # por fora, pela lateral, e fecha nas costas do par (na altura do meio das costas)
                alvo = par + frente * 0.07 * K + esq * s * 0.1 * K
                alvo.z = W("Spine1").z - 0.06 * K
                polo = W(lado + "Arm") + esq * s * 0.55 * K + frente * 0.25 * K - UP * 0.1 * K
            else:  # fecha os braços e as mãos atrás do pescoço do par
                alvo = par + frente * 0.05 * K + esq * s * 0.035 * K
                alvo.z = W("Neck").z - 0.04 * K
                polo = W(lado + "Arm") + esq * s * 0.45 * K + frente * 0.1 * K - UP * 0.2 * K
            if w > 1e-3:
                mao(lado, mistura(m, alvo, w), mistura(W(lado + "ForeArm"), polo, w))
                _junta_rot(lado, rot_palma(lado, -frente, -esq * s * 0.8 + UP * (0.1 if mais_baixa else 0.5)), w * 0.8)
                dedos(lado, "concha", w)
    _corrige(nome, passo, "clipe do Mixamo com os braços em volta do par (IK): " +
             ("por fora, fechando nas costas" if mais_baixa else "fechando atrás do pescoço"))


@receita("romance.kiss", "AD ID TE")
def _beijos():
    for n, baixa in (("resident.romance.kiss_shorter", True), ("resident.romance.kiss_long_shorter", True),
                     ("resident.romance.kiss_taller", False), ("resident.romance.kiss_long_taller", False)):
        _beijo(n, baixa)


D_APERTO = 1.25  # distância entre as duas pessoas no aperto de mão (a mesma da página)


@receita("handshake", "AD ID TE CR")
def _aperto():
    for n in ("resident.handshake", "resident.handshake.partner"):
        if not existe(n):
            continue

        def passo(d, i, t):
            pose((d, None))
            frente, esq, C = eixos()
            m = W("RightHand")
            alcance = (m - W("RightArm")).dot(frente)
            w = suave((alcance - 0.18 * K) / (0.12 * K))
            if w < 1e-3:
                return
            meio = frente * D_APERTO * K * 0.5  # as duas mãos se encontram no meio, na linha entre as pessoas
            alvo = Vector((meio.x, meio.y, m.z)) + esq * 0.015 * K - frente * 0.03 * K
            mao("Right", mistura(m, alvo, w), W("RightArm") - esq * 0.35 * K - UP * 0.3 * K)
            _junta_rot("Right", rot_palma("Right", esq, frente), w)  # palma de lado, dedos para a frente
            dedos("Right", "apoio", w)
        _corrige(n, passo, "clipe do Mixamo com a mão direita indo até a do par, no meio (IK)")


@receita("emote.cry", "AD ID TE CR")
def _choro():
    if not existe("resident.emote.cry") or not OLHO:
        return

    def passo(d, i, t):
        pose((d, None))
        Mc = mw @ PB["Head"].matrix
        frente, esq, C = eixos()
        for lado in ("Left", "Right"):
            if lado not in OLHO:
                continue
            alvo = Mc @ OLHO[lado] - frente * 0.02 * K
            ponta = W(lado + "Hand", True)
            dist = (ponta - alvo).length
            w = suave(1 - (dist - 0.05 * K) / (0.16 * K))
            if w > 1e-3:
                mao(lado, W(lado + "Hand") + (alvo - ponta) * w)
    _corrige("resident.emote.cry", passo, "clipe do Mixamo com as mãos chegando aos olhos quando sobem ao rosto (IK)")


@receita("push", "AD ID TE CR")
def _empurra():
    for n in ("resident.push.start", "resident.push.loop", "resident.push.stop"):
        if not existe(n):
            continue

        def passo(d, i, t):
            pose((d, None))
            frente, esq, C = eixos()
            for lado, s in (("Left", 1), ("Right", -1)):
                alcance = (W(lado + "Hand") - W(lado + "Arm")).dot(frente)
                w = suave((alcance - 0.15 * K) / (0.12 * K))
                if w > 1e-3:  # palmas retas para a frente, dedos para cima (pulso dobrado para trás)
                    _junta_rot(lado, rot_palma(lado, frente, UP * 0.9 - esq * s * 0.15), w)
                    dedos(lado, "aberta", w)
        _corrige(n, passo, "clipe do Mixamo com as palmas retas para a frente quando empurra",
                 lambda: {"tipo": "entre_maos", "objeto": "caixote", "tam": [round(0.7 * K, 3), round(0.75 * K, 3), round(0.55 * K, 3)]})


# ---------------------------------------------------------------- bicicleta, skate e patinete
# Medidas dos veículos da cidade (cidade_out/carros/catalogo.json e os GLB; gerador morada-art/cidade_carros.py), em
# metros, no espaço do veículo: frente −y, esquerda +x, z para cima, origem no chão. O patinete (de empurrar com o pé)
# não existe na cidade: as medidas dele são as de um patinete real (rodas de 200 mm).
BICI = {"selim": (0.0, 0.20, 1.02), "movimento": (0.0, 0.0, 0.30), "pedivela": 0.154, "pedal_x": 0.15,
        "pedal_esp": 0.01, "manopla": (0.31, -0.27, 1.09), "roda": 0.34, "rodas_y": (-0.56, 0.52)}
SKATE = {"shape_altura": 0.10, "comprimento": 0.82, "largura": 0.22, "eixos": 0.27, "roda": 0.032}
PATINETE = {"plataforma_altura": 0.10, "plataforma": (0.13, 0.50), "coluna_y": -0.30, "guidao_largura": 0.42,
            "roda": 0.10, "rodas_y": (-0.36, 0.30)}
ESCORREGA = (0.08, 0.035)  # no parado montado, o quadril escorrega para a esquerda do selim e desce (× altura/1,75)
PONTA_PE = 28.0  # graus: no parado montado, o pé do chão apoia na ponta
CICLO_PEDAL = 1.0  # segundos por volta do pedivela (60 rpm)
# velocidade de deslocamento esperada (m/s) por faixa: bicicleta (por unidade de escala), skate, patinete
VEL = {"AD": (4.6, 3.0, 3.0), "ID": (3.8, 2.2, 2.4), "TE": (4.6, 3.0, 3.0), "CR": (4.6, 2.0, 2.2), "PQ": (4.6, 1.0, 1.2)}


def _r3(v):
    return round(float(v), 3)


def _pt(p):
    """Ponto do Blender → {x, altura, frente} (frente = −y, como no resto do info.json)."""
    return {"x": _r3(p.x), "altura": _r3(p.z), "frente": _r3(-p.y)}


_PE0 = {}


def pe0(lado):
    """Do parado (quadro 0): tornozelo relativo à bola do pé na sola, rotação do pé, para onde a ponta aponta (graus) e
    comprimento da perna (coxa + canela)."""
    if not _PE0:
        guarda = {pb.name: pb.matrix_basis.copy() for pb in PB}
        pose((quadro(PARADO, 0), None))
        for l_ in ("Left", "Right"):
            tb, ft = W(l_ + "ToeBase"), W(l_ + "Foot")
            bola = Vector((tb.x, tb.y, 0.0))
            d = tb - ft
            _PE0[l_] = (ft - bola, rot_mundo(l_ + "Foot"), math.degrees(math.atan2(d.x, -d.y)),
                        (W(l_ + "Leg") - W(l_ + "UpLeg")).length + (ft - W(l_ + "Leg")).length,
                        (W(l_ + "ForeArm") - W(l_ + "Arm")).length + (W(l_ + "Hand") - W(l_ + "ForeArm")).length,
                        (W(l_ + "HandMiddle2", True) - W(l_ + "Hand")).length, W(l_ + "UpLeg"))
        for nb, m in guarda.items():
            PB[nb].matrix_basis = m
        bpy.context.view_layer.update()
    return _PE0[lado]


def dir_pe(alfa):
    a_ = math.radians(alfa)
    return Vector((math.sin(a_), -math.cos(a_), 0.0))


def pe_em(lado, bola, alfa=0.0, pitch=0.0, giro=None):
    """Tornozelo e rotação do pé (mundo) para a sola, na bola do pé, ficar em 'bola'. alfa: para onde a ponta aponta
    (graus; 0 = frente −y, + = para a esquerda do personagem); pitch: + = ponta para baixo; giro: rotação do veículo
    (bicicleta inclinada), aplicada por cima."""
    d0, r0, a0 = pe0(lado)[:3]
    qy = Quaternion(UP, math.radians(alfa - a0))
    qp = Quaternion(UP.cross(dir_pe(alfa)).normalized(), math.radians(pitch))
    Q = qp @ qy
    if giro is not None:
        Q = giro @ Q
    return Vector(bola) + Q @ d0, Q @ r0


def pe_no(lado, bola, alfa=0.0, pitch=0.0, giro=None, polo=None):
    """Perna por IK com a bola do pé em 'bola' (pedal, shape, plataforma ou chão); o joelho aponta para onde o pé aponta."""
    tz, rot = pe_em(lado, bola, alfa, pitch, giro)
    up = giro @ UP if giro is not None else UP
    if polo is None:
        d_ = giro @ dir_pe(alfa) if giro is not None else dir_pe(alfa)
        polo = W(lado + "UpLeg") + d_ * 0.6 * K + up * 0.15 * K
    perna(lado, tz, polo, rot)


def mao_manopla(lado, g, frente, giro=None):
    """Mão fechada num punho de guidão em 'g' (mundo): palma para baixo, dedos para a frente envolvendo o tubo."""
    s = 1 if lado == "Left" else -1
    up = giro @ UP if giro is not None else UP
    esq = up.cross(frente).normalized()
    hl = pe0(lado)[5]
    dd = (frente * 0.9 - up * 0.3 + esq * s * 0.12).normalized()
    palma = (-up * 0.9 + frente * 0.25 - esq * s * 0.15).normalized()
    pulso = Vector(g) - dd * 0.42 * hl + up * 0.03 * K
    mao(lado, pulso, W(lado + "Arm") + esq * s * 0.18 * K - up * 0.35 * K - frente * 0.3 * K, rot_palma(lado, palma, dd))
    dedos(lado, "punho")


def ajusta_altura(pernas):
    """Sobe ou desce o quadril para cada perna apoiada ficar com 'frac' do comprimento entre o quadril e o tornozelo
    (1 = esticada; 0,93 = joelho uns 40° dobrado). pernas: [(lado, tornozelo, frac, peso 0–1)]; vale a que pede o
    quadril mais baixo, pesada pelo quanto ela está apoiada (sem saltos quando um pé sai do apoio)."""
    zs, pesos = [], []
    for lado, tz, frac, w_ in pernas:
        H = W(lado + "UpLeg")
        d2 = (frac * pe0(lado)[3]) ** 2 - ((H.x - tz.x) ** 2 + (H.y - tz.y) ** 2)
        zs.append(tz.z + math.sqrt(max(d2, 1e-4)) - H.z)
        pesos.append(w_)
    base = sum(z * w_ for z, w_ in zip(zs, pesos)) / max(sum(pesos), 1e-6)
    dz = base
    for z, w_ in zip(zs, pesos):  # a perna que pede mais baixo puxa o quadril, na medida em que está apoiada
        if z < dz:
            dz = dz + (z - dz) * w_
    move("Hips", (0, 0, dz))


def mexe_quadril(dest):
    """Leva o meio das articulações do quadril a 'dest' (mundo)."""
    m = (W("LeftUpLeg") + W("RightUpLeg")) / 2
    move("Hips", Vector(dest) - m)


def trecho(t, chaves):
    """Interpola chaves [(t, valor)] com suavização (valor: número ou Vector)."""
    if t <= chaves[0][0]:
        return chaves[0][1]
    for (t0, v0), (t1, v1) in zip(chaves, chaves[1:]):
        if t <= t1:
            u = suave((t - t0) / max(t1 - t0, 1e-6))
            return v0 + (v1 - v0) * u
    return chaves[-1][1]


# ------------------------------------------------ bicicleta
_BICI_CAL = {}


def _bici_cal():
    """Escala da bicicleta para este corpo (a perna fica uns 30° dobrada com o pedal embaixo), onde fica a bicicleta,
    quanto o tronco inclina para as mãos chegarem ao guidão e quanto a bicicleta deita para o pé esquerdo chegar ao chão
    no parado."""
    if _BICI_CAL:
        return _BICI_CAL
    hj = 0.074 * K  # articulação do quadril acima de onde os ossos do bumbum apoiam
    L = (pe0("Left")[3] + pe0("Right")[3]) / 2
    yq = (pe0("Left")[6].y + pe0("Right")[6].y) / 2
    hx = {"Left": pe0("Left")[6].x, "Right": pe0("Right")[6].x}

    def montagem(s):
        oy = yq - 0.23 * s
        pior = 0.0
        for k_ in range(24):
            ph = 2 * math.pi * k_ / 24
            for lado, side in (("Right", -1), ("Left", 1)):
                bola = Vector((side * BICI["pedal_x"] * s, oy + BICI["pedivela"] * s * math.sin(ph),
                               (BICI["movimento"][2] - BICI["pedivela"] * math.cos(ph) + BICI["pedal_esp"]) * s))
                tz, _ = pe_em(lado, bola, 0.0, 6 + 10 * math.cos(ph - 0.8))
                H = Vector((hx[lado], yq, 1.01 * s + hj))
                pior = max(pior, (tz - H).length)
        return pior

    lo, hi = 0.25, 1.4
    for _ in range(40):
        mid = (lo + hi) / 2
        if montagem(mid) > 0.965 * L:
            hi = mid
        else:
            lo = mid
    s = round(lo, 3)
    _BICI_CAL.update(s=s, oy=yq - 0.23 * s, hj=hj, L=L)
    # inclinação da bicicleta no parado: o pé esquerdo, chapado, chega ao chão ao lado
    _, _, _, Ll, _, _, hipL = pe0("Left")
    # (até 14°: mais que isso a bicicleta pareceria caindo; se não alcançar, o pé fica na ponta e o quadril escorrega
    # um pouco para a esquerda do selim)
    melhor = (1e9, 0.0)
    for g10 in range(0, 141, 5):
        g = g10 / 10
        giro = Quaternion((0, 1, 0), math.radians(g))
        H = giro @ Vector((hipL.x + ESCORREGA[0] * K, yq, 1.01 * s + hj - ESCORREGA[1] * K))
        bola = Vector((H.x + 0.08 * K, H.y - 0.12 * K, 0.0))
        tz, _ = pe_em("Left", bola, 8.0, PONTA_PE)
        d = (tz - H).length - 0.95 * Ll
        if abs(d) < melhor[0]:
            melhor = (abs(d), g, d)
    _BICI_CAL["tilt"] = melhor[1]
    print("bici", CORPO, "escala", s, "inclina", melhor[1], "falta", round(melhor[2], 3), flush=True)
    # tronco: inclinação que deixa o ombro a 92% do comprimento do braço do punho do guidão
    for parado in (False, True):
        melhor = (1e9, 20.0)
        for lean in range(0, 62, 2):
            _bici_corpo(0.0, parado, lean)
            braco = pe0("Left")[4]
            d = 0.0
            for lado, side in (("Left", 1), ("Right", -1)):
                g = _bici_ponto((side * BICI["manopla"][0], BICI["manopla"][1], BICI["manopla"][2]), parado)
                d += abs((g - W(lado + "Arm")).length - 0.92 * braco)
            if d < melhor[0]:
                melhor = (d, float(lean))
        _BICI_CAL["lean_parado" if parado else "lean"] = melhor[1]
    print("bici", CORPO, _BICI_CAL, flush=True)
    return _BICI_CAL


def _bici_giro(parado):
    return Quaternion((0, 1, 0), math.radians(_BICI_CAL["tilt"])) if parado else Quaternion()


def _bici_ponto(v, parado=False):
    """Ponto da bicicleta (espaço do veículo, sem escala) → mundo."""
    c = _BICI_CAL
    return _bici_giro(parado) @ (Vector((0, c["oy"], 0)) + Vector(v) * c["s"])


def _bici_corpo(t, parado, lean):
    """Quadril no selim, bicicleta inclinada (parado) e tronco inclinado; devolve a fase do pedivela."""
    c = _BICI_CAL
    pose((quadro(PARADO, 0), None))
    ph = 2 * math.pi * t / CICLO_PEDAL
    giro = _bici_giro(parado)
    up = giro @ UP
    mexe_quadril(_bici_ponto((ESCORREGA[0] * K / c["s"] if parado else 0.0, 0.23, 1.01), parado) + up * (c["hj"] - (ESCORREGA[1] * K if parado else 0)))
    H = (W("LeftUpLeg") + W("RightUpLeg")) / 2
    if parado:
        gira("Hips", Vector((0, 1, 0)), c["tilt"], H)
    else:  # o quadril balança um pouco com as pedaladas (a perna que desce leva o lado dela)
        gira("Hips", Vector((0, -1, 0)), 1.6 * math.sin(ph), H)
    inclina(lean * 0.55, lean * 0.45, -lean * 0.35, -lean * 0.3)
    if parado:
        gira("Spine", Vector((0, 1, 0)), -c["tilt"] * 0.6)  # o tronco se endireita sobre a bicicleta deitada
        vira(12 * math.sin(2 * math.pi * t / 6.0), "Neck")  # olha em volta
        vira(6 * math.sin(2 * math.pi * t / 6.0 + 0.6), "Head")
    else:
        gira("Spine1", Vector((0, -1, 0)), -2.2 * math.sin(ph))  # vaivém dos ombros, contrário ao quadril
        vira(2.5 * math.sin(ph))
        gira("Head", Vector((0, -1, 0)), 1.0 * math.sin(ph))
    return ph


def _bici(t, parado):
    c = _bici_cal()
    ph = _bici_corpo(t, parado, c["lean_parado" if parado else "lean"])
    giro = _bici_giro(parado)
    frente = giro @ Vector((0, -1, 0))
    for lado, side in (("Left", 1), ("Right", -1)):
        mao_manopla(lado, _bici_ponto((side * BICI["manopla"][0], BICI["manopla"][1], BICI["manopla"][2]), parado),
                    frente, giro)
    s = c["s"]
    if parado:
        fases = (("Right", -1, math.radians(235)),)  # pé direito no pedal da frente, pronto para sair
    else:
        fases = (("Right", -1, ph), ("Left", 1, ph + math.pi))
    for lado, side, f in fases:
        bola = _bici_ponto((side * BICI["pedal_x"], BICI["pedivela"] * math.sin(f),
                            BICI["movimento"][2] - BICI["pedivela"] * math.cos(f) + BICI["pedal_esp"]), parado)
        pe_no(lado, bola, 0.0, 6 + 10 * math.cos(f - 0.8), giro)
    if parado:  # pé esquerdo chapado no chão, ao lado
        H = W("LeftUpLeg")
        pe_no("Left", Vector((H.x + 0.08 * K, H.y - 0.12 * K, 0.0)), 8.0, PONTA_PE)


def _bici_apoio(parado):
    c = _BICI_CAL
    s = c["s"]
    giro = _bici_giro(parado)
    mov = _bici_ponto(BICI["movimento"], parado)
    v = VEL[GRUPO][0] * s * (0 if parado else 1)
    ap = {"tipo": "bicicleta", "veiculo": ["bicicleta_amarela", "bicicleta_azul"], "escala": s,
          "fixacao": "Root", "origem": _pt(_bici_ponto((0, 0, 0), parado)), "gira_graus": 0.0,
          "inclina_graus": c["tilt"] if parado else 0.0,
          "selim": _pt(_bici_ponto(BICI["selim"], parado)),
          "guidao": {"esq": _pt(_bici_ponto(BICI["manopla"], parado)),
                     "dir": _pt(_bici_ponto((-BICI["manopla"][0],) + BICI["manopla"][1:], parado))},
          "pedivela": {"eixo": _pt(mov), "raio": _r3(BICI["pedivela"] * s), "pedal_x": _r3(BICI["pedal_x"] * s)},
          "velocidade_m_s": round(v, 2)}
    if parado:
        ap["pedivela"]["angulo_graus"] = 235.0
        ap["pe_no_chao"] = "esquerdo"
    else:
        ap["pedivela"].update(ciclo_s=CICLO_PEDAL, angulo_inicial_graus=0.0,
                              sentido="pedal direito embaixo no quadro 1, indo para trás")
        ap["rodas_rad_s"] = round(v / (BICI["roda"] * s), 2)
    return ap


@receita("bike.ride", "AD ID TE CR PQ")
def _bici_pedala():
    _bici_cal()
    compor("resident.bike.ride", CICLO_PEDAL * 2, lambda i, t: _bici(t, False),
           "sentado no selim, mãos no guidão e pés nos pedais girando (IK), vaivém do tronco", lambda: _bici_apoio(False))


@receita("bike.idle", "AD ID TE CR PQ")
def _bici_parado():
    _bici_cal()
    compor("resident.bike.idle", 6.0, lambda i, t: _bici(t, True),
           "montado e parado, bicicleta deitada para a esquerda, pé esquerdo no chão (IK)", lambda: _bici_apoio(True))


# ------------------------------------------------ skate (de lado, pé esquerdo na frente; anda para a esquerda, +x)
def _skate_med():
    e = max(0.5, min(1.0, K))
    dz = SKATE["shape_altura"] * e
    yd = -0.03 * K  # linha do meio do shape
    xL, xR = 0.18 * e, -0.18 * e  # pés sobre os parafusos dos eixos
    return e, dz, yd, xL, xR


def _bracos_soltos(frente, esq, balanco=0.0):
    for lado, s in (("Left", 1), ("Right", -1)):
        alvo = W(lado + "Arm") + esq * s * 0.17 * K - UP * 0.46 * K + frente * (0.04 + s * balanco) * K
        mao(lado, alvo, W(lado + "Arm") + esq * s * 0.4 * K - frente * 0.15 * K)


SK_CICLO = 4.0


def _skate(t, parado):
    e, dz, yd, xL, xR = _skate_med()
    pose((quadro(PARADO, 0), None))
    bolaL = Vector((xL, yd - 0.04 * K, dz))
    if parado:
        alfaL, bolaR, alfaR, pitR = 40.0, Vector((xR + 0.06 * e, yd - 0.24 * K, 0.0)), 30.0, 0.0
        w, yaw = 0.0, 35.0
        tzL, _ = pe_em("Left", bolaL, alfaL)
        tzR, _ = pe_em("Right", bolaR, alfaR)
        q = W("Hips")
        alvo = tzL * 0.4 + tzR * 0.6
        move("Hips", (alvo.x - q.x, alvo.y - q.y + 0.03 * K, 0.0))
        apoio_pes = (1.0, 0.0, 0.985, 1.0)
    else:
        u = t % SK_CICLO
        w = suave((u - 2.2) / 0.35) * suave((3.95 - u) / 0.35) if 2.2 <= u <= 3.95 else 0.0
        yaw = 12 + 50 * w
        alfaL = 10 + 70 * w
        D = Vector((xR, yd - 0.04 * K, dz))
        P1 = Vector((xL - 0.08 * K, yd - 0.21 * K, 0.0))
        P2 = Vector((xR - 0.30 * K, yd - 0.17 * K, 0.0))
        bolaR = trecho(u, [(2.35, D), (2.72, P1), (3.35, P2), (3.8, D)])
        if 2.35 < u < 2.72:  # sai do shape por cima
            bolaR = bolaR + UP * 0.07 * K * math.sin((u - 2.35) / 0.37 * math.pi)
        elif 3.35 < u < 3.8:  # volta para o tail
            bolaR = bolaR + UP * 0.11 * K * math.sin((u - 3.35) / 0.45 * math.pi)
        alfaR = trecho(u, [(2.35, -8.0), (2.65, 75.0), (3.45, 75.0), (3.75, -8.0)])
        pitR = trecho(u, [(2.72, 0.0), (3.35, 22.0), (3.6, 0.0)])
        balanco = 0.008 * K * math.sin(2 * math.pi * u / 2.0) * (1 - w)
        move("Hips", (0.10 * e * w + balanco, 0.0, 0.0))
        # pé de trás apoiado: no shape (antes de 2,35 s e depois de 3,8 s) ou no chão (2,72 a 3,35 s)
        cR = max(1 - suave((u - 2.3) / 0.12), suave((u - 3.75) / 0.1), suave((u - 2.68) / 0.08) * (1 - suave((u - 3.3) / 0.1)))
        apoio_pes = (0.93 - 0.06 * w, 1.0, 0.93 + 0.06 * w, cR)
    q = W("Hips")
    gira("Hips", UP, yaw, q)
    vira(8 * (1 - w) + 4)
    vira(18 * (1 - w) + (6 if parado else 4) + (14 * math.sin(2 * math.pi * t / 5.0) if parado else 0), "Neck")
    vira(22 * (1 - w) + 4, "Head")
    inclina(3 + 9 * w, 2, -2 - 4 * w, -2 - 3 * w)
    ajusta_altura([("Left", pe_em("Left", bolaL, alfaL)[0], apoio_pes[0], apoio_pes[1]),
                   ("Right", pe_em("Right", bolaR, alfaR, pitR)[0], apoio_pes[2], apoio_pes[3])])
    frente, esq, C = eixos()
    pe_no("Left", bolaL, alfaL)
    pe_no("Right", bolaR, alfaR, pitR)
    bal = 0.1 * w * math.sin(2 * math.pi * ((t % SK_CICLO) - 2.7) / 1.3) if not parado else 0.0
    _bracos_soltos(frente, esq, bal)


def _skate_apoio(parado):
    e, dz, yd, xL, xR = _skate_med()
    v = 0.0 if parado else VEL[GRUPO][1]
    return {"tipo": "skate", "veiculo": ["skate_laranja"], "escala": _r3(e), "fixacao": "Root",
            "origem": _pt(Vector((0.0, yd, 0.0))), "gira_graus": 90.0,
            "nota": "de lado, pé esquerdo na frente: anda para a esquerda do personagem; o skate gira 90° em torno do "
                    "eixo vertical (a frente dele aponta para +x)",
            "shape": {"altura": _r3(dz), "comprimento": _r3(SKATE["comprimento"] * e),
                      "largura": _r3(SKATE["largura"] * e)},
            "pes": {"esq": _pt(Vector((xL, yd, dz))), "dir": _pt(Vector((xR, yd, dz)))},
            "velocidade_m_s": v, "direcao": "+x (esquerda do personagem)",
            **({} if parado else {"ciclo_s": SK_CICLO, "impulso_s": [2.7, 3.35],
                                  "rodas_rad_s": round(v / (SKATE["roda"] * e), 1)})}


@receita("skate.ride", "AD ID TE CR PQ")
def _skate_anda():
    compor("resident.skate.ride", SK_CICLO, lambda i, t: _skate(t, False),
           "em pé no shape, de lado, deslizando; a cada 4 s o pé de trás desce e dá um impulso (IK)",
           lambda: _skate_apoio(False))


@receita("skate.idle", "AD ID TE CR PQ")
def _skate_parado():
    compor("resident.skate.idle", 5.0, lambda i, t: _skate(t, True),
           "parado com o pé esquerdo no shape e o direito no chão (IK), olhando em volta", lambda: _skate_apoio(True))


# ------------------------------------------------ patinete (anda para a frente, −y; pé esquerdo na plataforma)
PT_CICLO = 3.0


def _pat_med():
    sp = max(0.55, min(1.0, K))
    dz = PATINETE["plataforma_altura"] * sp
    hb = max(0.45, min(1.05, 0.57 * dados["altura"]))
    yc = -0.12 * K + 0.06 * sp  # meio da plataforma
    return sp, dz, hb, yc


def _pat_manoplas(sp, hb, yc):
    y = yc + (PATINETE["coluna_y"] + 0.02) * sp
    m = PATINETE["guidao_largura"] / 2 * sp
    return Vector((m, y, hb)), Vector((-m, y, hb))


def _patinete(t, parado):
    sp, dz, hb, yc = _pat_med()
    pose((quadro(PARADO, 0), None))
    bolaL = Vector((0.035 * K, yc - 0.06 * sp, dz))
    noD = Vector((-0.035 * K, yc + 0.17 * sp, dz))
    if parado:
        w = 0.0
        bolaR, alfaR, pitR = Vector((-0.19 * K, yc + 0.02 * sp, 0.0)), -10.0, 0.0
        tzL, _ = pe_em("Left", bolaL, 12.0)
        tzR, _ = pe_em("Right", bolaR, alfaR)
        q = W("Hips")
        alvo = tzL * 0.45 + tzR * 0.55
        move("Hips", (alvo.x - q.x, alvo.y - q.y - 0.02 * K, 0.0))
        apoio_pes = (1.0, 0.0, 0.985, 1.0)
        inclina(5, 2, -2, -2)
        vira(14 * math.sin(2 * math.pi * t / 5.0), "Neck")
        vira(6 * math.sin(2 * math.pi * t / 5.0 + 0.5), "Head")
    else:
        u = t % PT_CICLO
        w = suave((u - 1.1) / 0.3) * suave((2.9 - u) / 0.3) if 1.1 <= u <= 2.9 else 0.0
        P1 = Vector((-0.16 * K, yc - 0.10 * sp, 0.0))
        P2 = Vector((-0.15 * K, yc + 0.55 * K, 0.0))
        bolaR = trecho(u, [(1.15, noD), (1.45, P1), (2.3, P2), (2.85, noD)])
        if 1.15 < u < 1.45:
            bolaR = bolaR + UP * 0.06 * K * math.sin((u - 1.15) / 0.3 * math.pi)
        elif 2.3 < u < 2.85:
            bolaR = bolaR + UP * 0.12 * K * math.sin((u - 2.3) / 0.55 * math.pi)
        alfaR = trecho(u, [(1.15, -20.0), (1.4, -5.0), (2.55, -5.0), (2.85, -20.0)])
        pitR = trecho(u, [(1.45, 0.0), (2.3, 25.0), (2.55, 0.0)])
        move("Hips", (0.01 * K * w, -0.03 * K * w, 0.0))
        cR = max(1 - suave((u - 1.1) / 0.1), suave((u - 2.8) / 0.08), suave((u - 1.4) / 0.08) * (1 - suave((u - 2.25) / 0.1)))
        apoio_pes = (0.955 - 0.06 * w, 1.0, 0.955 + 0.04 * w, cR)
        inclina(6 + 6 * w, 2, -3 - 3 * w, -2 - 2 * w)
        vira(-4 * w)
    ajusta_altura([("Left", pe_em("Left", bolaL, 12.0)[0], apoio_pes[0], apoio_pes[1]),
                   ("Right", pe_em("Right", bolaR, alfaR, pitR)[0], apoio_pes[2], apoio_pes[3])])
    frente, esq, C = eixos()
    gL, gR = _pat_manoplas(sp, hb, yc)
    mao_manopla("Left", gL, Vector((0, -1, 0)))
    mao_manopla("Right", gR, Vector((0, -1, 0)))
    pe_no("Left", bolaL, 12.0)
    pe_no("Right", bolaR, alfaR, pitR)


def _pat_apoio(parado):
    sp, dz, hb, yc = _pat_med()
    gL, gR = _pat_manoplas(sp, hb, yc)
    v = 0.0 if parado else VEL[GRUPO][2]
    return {"tipo": "patinete", "veiculo": None, "medidas": "reais (a cidade não tem patinete de empurrar)",
            "escala": _r3(sp), "fixacao": "Root", "origem": _pt(Vector((0.0, yc, 0.0))), "gira_graus": 0.0,
            "plataforma": {"altura": _r3(dz), "largura": _r3(PATINETE["plataforma"][0] * sp),
                           "comprimento": _r3(PATINETE["plataforma"][1] * sp)},
            "coluna": _pt(Vector((0.0, yc + PATINETE["coluna_y"] * sp, 0.0))),
            "guidao": {"altura": _r3(hb), "largura": _r3(PATINETE["guidao_largura"] * sp), "esq": _pt(gL), "dir": _pt(gR)},
            "rodas": {"raio": _r3(PATINETE["roda"] * sp),
                      "dianteira": _pt(Vector((0.0, yc + PATINETE["rodas_y"][0] * sp, PATINETE["roda"] * sp))),
                      "traseira": _pt(Vector((0.0, yc + PATINETE["rodas_y"][1] * sp, PATINETE["roda"] * sp)))},
            "velocidade_m_s": v, "direcao": "frente (−y do Blender, +z do glTF)",
            **({} if parado else {"ciclo_s": PT_CICLO, "impulso_s": [1.45, 2.3],
                                  "rodas_rad_s": round(v / (PATINETE["roda"] * sp), 1)})}


@receita("scooter.ride", "AD ID TE CR PQ")
def _pat_anda():
    compor("resident.scooter.ride", PT_CICLO, lambda i, t: _patinete(t, False),
           "pé esquerdo na plataforma, mãos no guidão; o direito desce e dá um impulso a cada 3 s (IK)",
           lambda: _pat_apoio(False))


@receita("scooter.idle", "AD ID TE CR PQ")
def _pat_parado():
    compor("resident.scooter.idle", 5.0, lambda i, t: _patinete(t, True),
           "parado com o pé esquerdo na plataforma, o direito no chão e as mãos no guidão (IK)", lambda: _pat_apoio(True))


# ---------------------------------------------------------------- gestos que faltavam
@receita("wave.big", "AD ID TE CR PQ")
def _acena_grande():
    dur = 3.6

    def passo(i, t):
        pose((quadro(PARADO, 0), None))
        w = envelope(t, dur, 0.45, 0.45)
        ang = math.sin(2 * math.pi * t / 0.9)
        vira(4 * ang * w)
        inclina(-3 * w, -2 * w, 0, -4 * w)
        frente, esq, C = eixos()
        for lado, s in (("Left", 1), ("Right", -1)):
            alto = W(lado + "Arm") + UP * 0.40 * K + esq * s * 0.17 * K + esq * 0.13 * K * ang + frente * 0.06 * K
            mao(lado, mistura(W(lado + "Hand"), alto, w), W(lado + "Arm") + esq * s * 0.45 * K - UP * 0.05 * K - frente * 0.1 * K)
            _junta_rot(lado, rot_palma(lado, frente, UP * 0.9 - esq * 0.25 * ang), w)
            dedos(lado, "aberta", w)
    compor("resident.wave.big", dur, passo, "parado + os dois braços para o alto, acenando de um lado para o outro (IK)")


def _olhos_mundo():
    Mc = mw @ PB["Head"].matrix
    if len(OLHO) == 2:
        return (Mc @ OLHO["Left"] + Mc @ OLHO["Right"]) / 2
    return boca_mundo() + UP * 0.06 * K


@receita("photo.take", "AD ID TE CR")
def _foto():
    dur = 5.0

    def passo(i, t):
        pose((quadro(PARADO, 0), None))
        w1 = suave(t / 0.8) * (1 - suave((t - 3.0) / 0.6))  # câmera nos olhos
        w2 = suave((t - 3.0) / 0.6) * (1 - suave((t - 4.3) / 0.6))  # olhando a foto na tela
        inclina(2 * w1 + 3 * w2, 1 * w1, 0, 2 * w1 + 16 * w2)
        frente, esq, C = eixos()
        olho = _olhos_mundo()
        cam1 = olho + frente * 0.17 * K - UP * 0.015 * K
        cam2 = C + frente * 0.30 * K - UP * 0.16 * K
        w = max(w1, w2)
        if w < 1e-3:
            return
        cam = mistura(cam2, cam1, w1 / max(w, 1e-6))
        for lado, s in (("Left", 1), ("Right", -1)):
            alvo = cam + esq * s * 0.085 * K - UP * 0.02 * K - frente * 0.01 * K  # nas laterais da câmera
            mao(lado, mistura(W(lado + "Hand"), alvo, w), W(lado + "Arm") + esq * s * 0.3 * K - UP * 0.35 * K)
            _junta_rot(lado, rot_palma(lado, -esq * s + UP * 0.25, frente * 0.75 + UP * 0.35), w)
            dedos(lado, "apoio", w)
        if 1.9 <= t <= 2.25 and "RightHandIndex1" in PB:  # o indicador aperta o botão
            pb = PB["RightHandIndex1"]
            gira("RightHandIndex1", esq, -25 * math.sin((t - 1.9) / 0.35 * math.pi), mw @ pb.head)
    compor("resident.photo.take", dur, passo,
           "parado + câmera nos olhos com as duas mãos (IK), aperta o botão e olha a foto na tela",
           lambda: {"tipo": "entre_maos", "objeto": "camera", "tam": [round(0.13 * K, 3), round(0.08 * K, 3), round(0.08 * K, 3)]})


@receita("selfie", "AD ID TE CR")
def _selfie():
    dur = 4.5

    def passo(i, t):
        pose((quadro(PARADO, 0), None))
        w = envelope(t, dur, 0.7, 0.6)
        frente, esq, C = eixos()
        gira("Head", frente, 7 * w)  # a cabeça deita um pouco para o lado do celular
        vira(-8 * w, "Head")
        if 2.3 <= t <= 2.7:
            gira("Head", esq, 4 * math.sin((t - 2.3) / 0.4 * math.pi) * w)
        cabeca = W("Head")
        cel = cabeca + frente * 0.44 * K + UP * 0.10 * K - esq * 0.12 * K
        m = mistura(W("RightHand"), cel - frente * 0.02 * K, w)
        mao("Right", m, W("RightArm") - esq * 0.4 * K - UP * 0.25 * K)
        _junta_rot("Right", rot_palma("Right", (_olhos_mundo() - m).normalized(), UP * 0.8 - esq * 0.3), w)
        dedos("Right", "apoio", w)
        cint = W("LeftUpLeg") + esq * 0.10 * K + UP * 0.13 * K - frente * 0.01 * K  # outra mão na cintura
        mao("Left", mistura(W("LeftHand"), cint, w), W("LeftArm") + esq * 0.45 * K - frente * 0.1 * K)
        _junta_rot("Left", rot_palma("Left", -esq, -UP * 0.6 + frente * 0.4), w)
        dedos("Left", "concha", w)
    compor("resident.selfie", dur, passo, "parado + braço direito esticado com o celular virado para o rosto (IK), "
           "outra mão na cintura", lambda: {"tipo": "objeto_mao", "objeto": "celular", "mao": "direita"})


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
