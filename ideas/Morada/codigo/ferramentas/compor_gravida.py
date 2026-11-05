"""Animações de gravidez e parto, compostas sobre a biblioteca de grávida (barriga do 3º trimestre).

Usa as ferramentas de compor.py (IK de braços e pernas, inclinação, gravação). As mãos pousam na pele da barriga e da
lombar: a cada quadro um raio mede onde está a pele, na pose atual.

Uso: python compor_gravida.py -- <gravida/corpo.blend> <corpo> <saida.blend>
"""
import sys, math
_src = open(__file__.replace("compor_gravida.py", "compor.py")).read().split("# ---------------------------------------------------------------- receitas")[0]
exec(compile(_src, "compor", "exec"))
from mathutils.bvhtree import BVHTree  # noqa: E402

CORPO_M = bpy.data.objects[CORPO + "_corpo"]
SENTADO, PARADO = "resident.sit.chair.idle", "resident.idle.neutral"


def pele(origem, direcao):
    """(ponto, normal) da pele atingida por um raio (malha avaliada na pose atual)."""
    ev = CORPO_M.evaluated_get(bpy.context.evaluated_depsgraph_get())
    me = ev.to_mesh()
    P = [ev.matrix_world @ v.co for v in me.vertices]
    F = [tuple(p.vertices) for p in me.polygons]
    ev.to_mesh_clear()
    loc, nrm, _, _ = BVHTree.FromPolygons(P, F).ray_cast(Vector(origem), Vector(direcao).normalized(), 3.0)
    if loc is None:
        return None
    if nrm.dot(Vector(origem) - loc) < 0:
        nrm = -nrm
    return loc, nrm.normalized()


# a palma no espaço do osso da mão (no repouso a palma olha para a coxa, isto é, para dentro do corpo)
for pb_ in PB:
    pb_.matrix_basis.identity()
bpy.context.view_layer.update()
PALMA = {}
for _l in ("Left", "Right"):
    _M = (mw @ PB[_l + "Hand"].matrix).to_3x3()
    _eixo = _M.col[1].normalized()
    _dentro = Vector((-1 if (mw @ PB[_l + "Hand"].head).x > (mw @ PB["Hips"].head).x else 1, 0, 0))
    PALMA[_l] = (_M.inverted() @ (_dentro - _eixo * _dentro.dot(_eixo)).normalized()).normalized()
COMPR_MAO = {l: ((mw @ PB[l + "Hand"].tail) - (mw @ PB[l + "Hand"].head)).length for l in ("Left", "Right")}


FIXO = {}  # mão pousada calculada uma vez por clipe e presa ao quadril (não remexe de um quadro para o outro)


def _presa(chave, lado, calcula):
    Mh = mw @ PB["Hips"].matrix
    if chave not in FIXO:
        r = calcula()
        if r is None:
            return
        pos, rot, polo = r
        Mi = Mh.inverted()
        FIXO[chave] = (Mi @ pos, Mh.to_quaternion().inverted() @ rot, Mi @ polo)
    lp, lr, lpolo = FIXO[chave]
    mao(lado, Mh @ lp, Mh @ lpolo, Mh.to_quaternion() @ lr)
    dedos(lado, "concha")  # os dedos acompanham a curva da barriga


def pousa(lado, ponto, normal, dedos, polo, so_calcula=False):
    """Mão aberta sobre a pele: palma virada para a pele, dedos na direção 'dedos' (ajustada ao plano da pele)."""
    n = Vector(normal)
    f = Vector(dedos) - n * Vector(dedos).dot(n)
    if f.length < 1e-6:
        return
    f.normalize()
    yl = Vector((0, 1, 0))
    pl = PALMA[lado] - yl * PALMA[lado].dot(yl)
    pl.normalize()
    A = Matrix((yl, pl, yl.cross(pl))).transposed()
    pw = -n
    B = Matrix((f, pw, f.cross(pw))).transposed()
    rot = (B @ A.transposed()).to_quaternion()
    pulso = Vector(ponto) + n * 0.016 * K - f * 0.55 * COMPR_MAO[lado]
    if so_calcula:
        return pulso, rot, Vector(polo)
    mao(lado, pulso, polo, rot)


def na_barriga(lado, dz, dl, folga=0.0, chave=None):
    """Mão pousada na barriga. Com 'chave', a posição é calculada no primeiro quadro e acompanha o quadril depois."""
    def calcula():
        frente, esq, C = eixos()
        q = W("Hips")
        alvo = q + UP * dz * K + esq * dl * K
        r = pele(alvo + frente * 1.0, -frente)  # raio vindo da frente: acha a pele da barriga
        if r is None:
            return None
        s = 1 if lado == "Left" else -1
        return pousa(lado, r[0] + r[1] * folga * K, r[1], -esq * s * 0.8 - UP * 0.35,
                     W(lado + "Arm") + esq * s * 0.45 * K - UP * 0.25 * K + frente * 0.05 * K, True)
    if chave is not None:
        _presa(chave, lado, calcula)
        return
    r = calcula()
    if r is not None:
        mao(lado, r[0], r[2], r[1])


def na_lombar(lado, dz=0.13, chave=None):
    def calcula():
        frente, esq, C = eixos()
        q = W("Hips")
        s = 1 if lado == "Left" else -1
        alvo = q + UP * dz * K + esq * s * 0.04 * K
        r = pele(alvo - frente * 1.0, frente)  # raio vindo de trás: acha a pele da lombar
        if r is None:
            return None
        return pousa(lado, r[0], r[1], -esq * s * 0.5 - UP * 0.8,
                     W(lado + "Arm") + esq * s * 0.5 * K - frente * 0.15 * K - UP * 0.2 * K, True)
    if chave is not None:
        _presa(chave, lado, calcula)
        return
    r = calcula()
    if r is not None:
        mao(lado, r[0], r[2], r[1])


def esticado(nome, fator):
    """Amostra de uma ação tocada mais devagar (fator > 1)."""
    s = amostra(nome)
    return [s[min(len(s) - 1, int(i / fator))] for i in range(int(len(s) * fator))]


R = []


def receita(f):
    R.append(f)
    return f


@receita
def _mao_na_barriga():
    def passo(i, t):
        pose((quadro(PARADO, i), None))
        na_barriga("Left", 0.2, 0.05, chave="belly_L")  # as duas mãos paradas na barriga
        na_barriga("Right", 0.1, -0.06, chave="belly_R")
    compor("resident.gravida.belly_hold", 6.0, passo, "parado + as duas mãos paradas na barriga (IK na pele)")


@receita
def _mao_na_lombar():
    def passo(i, t):
        pose((quadro(PARADO, i), None))
        inclina(-3 - 1.5 * math.sin(t * 2 * math.pi / 3.0))
        na_lombar("Right", chave="back_R")
        na_barriga("Left", 0.15, 0.03, chave="back_L")
    compor("resident.gravida.back_hold", 6.0, passo, "parado + mão na lombar e outra na barriga (IK na pele)")


@receita
def _senta_devagar():
    for base, nome in (("resident.sit.chair.enter", "resident.gravida.sit_slow"), ("resident.sit.chair.exit", "resident.gravida.stand_slow")):
        if not existe(base):
            continue
        s = esticado(base, 1.5)

        def passo(i, t, s=s, nome=nome):
            pose((s[i], None))
            na_barriga("Left", 0.16, 0.04, chave=nome + "_L")
        compor(nome, len(s) / FPS, passo, f"{base.split('.', 1)[1]} uma vez e meia mais devagar + mão na barriga")


@receita
def _contracao_em_pe():
    ciclo = 8.0

    def passo(i, t):
        pose((quadro(PARADO, i), None))
        u = t % ciclo
        w = math.sin(math.pi * min(1.0, u / 5.0)) if u < 5.0 else 0.0  # a contração sobe e desce em 5 s, 3 s de pausa
        respira = math.sin(t * 2 * math.pi / (1.6 if w > 0.1 else 3.5))
        frente, esq, C = eixos()
        pes = {l: (W(l + "Foot"), rot_mundo(l + "Foot")) for l in ("Left", "Right")}
        move("Hips", -UP * 0.05 * K * w - frente * 0.02 * K * w)  # joelhos dobram um pouco
        for l, (p_, r_) in pes.items():
            sl = 1 if l == "Left" else -1
            perna(l, p_, W(l + "UpLeg") + frente * 0.5 * K + esq * sl * 0.1 * K, r_)
        inclina(14 * w, 3 * w + 1.5 * respira, 6 * w, 8 * w)
        na_lombar("Right", 0.12, chave="contr_R")
        na_barriga("Left", 0.13, 0.02, chave="contr_L")
    compor("resident.parto.contracao_pe", ciclo * 2, passo, "parado + contrações (tronco curva, joelhos dobram, respiração) + mãos na lombar e na barriga")


@receita
def _contracao_deitada():
    base = "resident.lie.idle"
    ciclo = 10.0

    def passo(i, t):
        pose((quadro(base, i), None))
        u = t % ciclo
        w = math.sin(math.pi * min(1.0, u / 6.0)) if u < 6.0 else 0.0
        q = W("Hips")
        cab = W("Head")
        longo = (q - cab)
        longo.z = 0
        longo.normalize()  # da cabeça para os pés, deitada
        cima = UP
        lado = longo.cross(cima).normalized()
        cama_z = q.z - 0.1 * K
        for l in ("Left", "Right"):  # joelhos para cima, pés apoiados na cama
            s = 1 if (W(l + "UpLeg") - q).dot(lado) > 0 else -1
            pe = q + longo * 0.38 * K + lado * s * 0.14 * K
            pe.z = cama_z + 0.05 * K
            perna(l, pe, q + longo * 0.25 * K + lado * s * 0.2 * K + UP * 0.6 * K)
        # na contração, levanta o tronco e a cabeça e segura nas laterais da cama
        gira("Spine1", lado, -16 * w)
        gira("Head", lado, -10 * w)
        for l in ("Left", "Right"):
            s = 1 if (W(l + "Arm") - q).dot(lado) > 0 else -1
            borda = q + lado * s * 0.32 * K - longo * 0.05 * K
            borda.z = cama_z + 0.04 * K
            mao(l, borda, W(l + "Arm") + lado * s * 0.4 * K + UP * 0.1 * K)
    compor("resident.parto.contracao_deitada", ciclo * 2, passo, "deitada + joelhos para cima, contrações (tronco e cabeça sobem) segurando a cama")


def dobra(nb, eixo, graus, filho, para):
    """Gira o osso em torno do eixo, no sentido que leva a junta 'filho' para a direção 'para'."""
    antes_ = W(filho)
    gira(nb, eixo, graus)
    if (W(filho) - antes_).dot(para) < 0:
        gira(nb, eixo, -2 * graus)


@receita
def _deitada_de_lado():
    base = "resident.lie.idle"

    def passo(i, t):
        pose((quadro(base, i), None))
        for l in ("Left", "Right"):  # pernas retas (o deitado de base tem um joelho levantado)
            for nb in ("UpLeg", "Leg", "Foot"):
                PB[l + nb].matrix_basis = Matrix.Identity(4)
        bpy.context.view_layer.update()
        q = W("Hips")
        cab = W("Head")
        longo = (q - cab)
        longo.z = 0
        longo.normalize()
        # rola de lado em torno do comprimento do corpo; só a rotação do Root é gravada, então o quadril volta ao
        # lugar pela posição do Hips (girar em torno do quadril deslocava o corpo para fora da cama)
        gira("Root", longo, 70)
        move("Hips", q - W("Hips"))
        lat = (W("LeftUpLeg") - W("RightUpLeg")).normalized()
        barriga = Quaternion(longo, math.radians(70)) @ UP  # a frente do corpo gira junto
        barriga = (barriga - longo * barriga.dot(longo)).normalized()
        for l, g_quad, g_joel in (("Left", 55, 80), ("Right", 40, 75)):  # joelhos dobrados, uma perna à frente da outra
            dobra(l + "UpLeg", lat, g_quad, l + "Leg", barriga)
            dobra(l + "Leg", lat, g_joel, l + "Foot", -barriga)
        na_barriga("Left", 0.14, 0.0, 0.01, chave="lado_L")
    compor("resident.gravida.lie_side", 6.0, passo, "deitada rolada de lado + quadris e joelhos dobrados + mão na barriga")


antes = set(bpy.data.actions)
for f in R:
    try:
        f()
    except KeyError as e:
        print("faltou base", CORPO, f.__name__, e, flush=True)
novas = [x for x in bpy.data.actions if x not in antes]
for x in list(bpy.data.actions):
    if x not in novas:
        bpy.data.actions.remove(x)
for pb in PB:
    pb.matrix_basis.identity()
arm.animation_data.action = None
bpy.ops.wm.save_as_mainfile(filepath=SAIDA, compress=True)
print("fim", CORPO, [x.name for x in novas])
